/**
 * DbLive_Connector.js
 * RESPONSIBILITY: MySQL JDBC connector — live CRUD against remote MySQL database.
 * Credentials stored in ScriptProperties (setup via setupMySqlCredentials()).
 * Independent module — not tied to any company or Sheets-based data layer.
 * Loaded after 07_Backup.js.
 */

const DBLIVE_CONFIG = {
  host: '164.92.143.177',
  port: 3306,
  database: 'topchemicalpest',
  maxRows: 500,
  // These are Script Property KEY NAMES, not values. `user` and `pass` used to
  // hold a literal username and a password-shaped string, so every lookup asked
  // for a property named 'appscript_user' / 'YourStrongPassword123!' while every
  // error message said MYSQL_USER / MYSQL_PASSWORD. Corrected to the documented
  // key names; legacyProps below keeps any existing install working.
  props: {
    host: 'MYSQL_HOST',
    port: 'MYSQL_PORT',
    database: 'MYSQL_DATABASE',
    user: 'MYSQL_USER',
    pass: 'MYSQL_PASSWORD'
  },
  legacyProps: {
    user: 'appscript_user',
    pass: 'YourStrongPassword123!'
  }
};

/**
 * Reads a Script Property by its canonical key, falling back to the legacy key
 * the old (incorrect) props map used, so an install that already stored its
 * credentials under the legacy names keeps working.
 */
function dbLiveProp_(props, canonicalKey, legacyKey) {
  var v = props.getProperty(canonicalKey);
  if ((v === null || v === '') && legacyKey) v = props.getProperty(legacyKey);
  return v;
}

/**
 * One-time setup: run from editor to store connection DEFAULTS.
 * Only fills host/port/database when missing — NEVER touches MYSQL_USER /
 * MYSQL_PASSWORD: the real username/password must be entered manually in
 * Project Settings → Script properties so they never land in source code,
 * and re-running this can never clobber working credentials with placeholders.
 */
function setupMySqlCredentials() {
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperties() || {};
  var toSet = {};
  if (!current[DBLIVE_CONFIG.props.host]) toSet[DBLIVE_CONFIG.props.host] = DBLIVE_CONFIG.host;
  if (!current[DBLIVE_CONFIG.props.port]) toSet[DBLIVE_CONFIG.props.port] = String(DBLIVE_CONFIG.port);
  if (!current[DBLIVE_CONFIG.props.database]) toSet[DBLIVE_CONFIG.props.database] = DBLIVE_CONFIG.database;
  if (Object.keys(toSet).length > 0) props.setProperties(toSet);
  var missing = [];
  if (!dbLiveProp_(props, DBLIVE_CONFIG.props.user, DBLIVE_CONFIG.legacyProps.user)) missing.push('MYSQL_USER');
  if (!dbLiveProp_(props, DBLIVE_CONFIG.props.pass, DBLIVE_CONFIG.legacyProps.pass)) missing.push('MYSQL_PASSWORD');
  if (missing.length > 0) {
    Logger.log('MySQL defaults saved. STILL MISSING — add manually in Project Settings → Script properties: ' + missing.join(', '));
  } else {
    Logger.log('MySQL configuration complete.');
  }
}

/**
 * Returns a JDBC connection. Caller MUST close in finally block.
 * URL shape matches the verified getTableNames snippet exactly (plain
 * jdbc:mysql://host:port/db, no query params). Credentials come ONLY from
 * Script Properties (MYSQL_USER / MYSQL_PASSWORD) — never hardcode them.
 */
function dbGetConnection_() {
  const props = PropertiesService.getScriptProperties();
  const host = props.getProperty(DBLIVE_CONFIG.props.host) || DBLIVE_CONFIG.host;
  const port = props.getProperty(DBLIVE_CONFIG.props.port) || DBLIVE_CONFIG.port;
  const db = props.getProperty(DBLIVE_CONFIG.props.database) || DBLIVE_CONFIG.database;
  const user = (dbLiveProp_(props, DBLIVE_CONFIG.props.user, DBLIVE_CONFIG.legacyProps.user) || '').trim();
  const pass = dbLiveProp_(props, DBLIVE_CONFIG.props.pass, DBLIVE_CONFIG.legacyProps.pass) || '';
  var missingCreds = [];
  if (!user) missingCreds.push('MYSQL_USER');
  if (!pass) missingCreds.push('MYSQL_PASSWORD');
  if (missingCreds.length > 0) throw new Error('MySQL credentials not configured (' + missingCreds.join(', ') + ' missing). Add them in Project Settings → Script properties of this script project — never put passwords in code.');
  const url = 'jdbc:mysql://' + host + ':' + port + '/' + db;
  return Jdbc.getConnection(url, user, pass);
}

/**
 * Lists all tables in the database.
 */
function dbListTables_(data, user) {
  dbGuard_(user);
  let conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.createStatement();
    rs = stmt.executeQuery('SHOW TABLES');
    const tables = [];
    while (rs.next()) {
      tables.push(rs.getString(1));
    }
    return { status: 'ok', tables: tables };
  } catch (err) {
    Logger.log('dbListTables_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Returns column info for a table: name, type, key, nullable, default.
 */
function dbGetColumns_(data, user) {
  dbGuard_(user);
  if (!data.table) throw new Error('table name required');
  const safeTable = dbSanitizeIdentifier_(data.table);
  let conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement('SHOW COLUMNS FROM ' + safeTable);
    rs = stmt.executeQuery();
    const columns = [];
    while (rs.next()) {
      columns.push({
        name: rs.getString('Field'),
        type: rs.getString('Type'),
        key: rs.getString('Key'),
        nullable: rs.getString('Null'),
        default: rs.getString('Default'),
        extra: rs.getString('Extra')
      });
    }
    return { status: 'ok', columns: columns };
  } catch (err) {
    Logger.log('dbGetColumns_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Executes a SELECT query with optional WHERE, ORDER BY, LIMIT, OFFSET.
 * Returns { columns, rows, total }.
 */
function dbQuery_(data, user) {
  dbGuard_(user);
  if (!data.table) throw new Error('table name required');
  const safeTable = dbSanitizeIdentifier_(data.table);
  const limit = Math.min(Number(data.limit) || DBLIVE_CONFIG.maxRows, DBLIVE_CONFIG.maxRows);
  const offset = Math.max(Number(data.offset) || 0, 0);

  let conn, stmt, rs, countStmt, countRs;
  try {
    conn = dbGetConnection_();

    // Build WHERE clause
    let whereSql = '';
    const params = [];
    if (data.where && typeof data.where === 'object') {
      const conditions = [];
      for (const col in data.where) {
        if (data.where[col] === null || data.where[col] === undefined) continue;
        conditions.push(dbSanitizeIdentifier_(col) + ' = ?');
        params.push(data.where[col]);
      }
      if (conditions.length > 0) {
        whereSql = ' WHERE ' + conditions.join(' AND ');
      }
    }

    // Get total count
    countStmt = conn.prepareStatement('SELECT COUNT(*) AS cnt FROM ' + safeTable + whereSql);
    dbBindParams_(countStmt, params);
    countRs = countStmt.executeQuery();
    const total = countRs.next() ? countRs.getInt('cnt') : 0;

    // Build main query
    let querySql = 'SELECT * FROM ' + safeTable + whereSql;
    if (data.orderBy) {
      const safeOrder = dbSanitizeOrderBy_(data.orderBy);
      querySql += ' ORDER BY ' + safeOrder;
    }
    querySql += ' LIMIT ' + limit + ' OFFSET ' + offset;

    stmt = conn.prepareStatement(querySql);
    dbBindParams_(stmt, params);
    rs = stmt.executeQuery();

    const meta = rs.getMetaData();
    const colCount = meta.getColumnCount();
    const columns = [];
    for (let i = 1; i <= colCount; i++) {
      columns.push(meta.getColumnName(i));
    }

    const rows = [];
    while (rs.next()) {
      const row = {};
      for (let i = 1; i <= colCount; i++) {
        const val = rs.getObject(i);
        row[columns[i - 1]] = val !== null ? String(val) : null;
      }
      rows.push(row);
    }

    return { status: 'ok', columns: columns, rows: rows, total: total, limit: limit, offset: offset };
  } catch (err) {
    Logger.log('dbQuery_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (countRs) countRs.close();
    if (countStmt) countStmt.close();
    if (conn) conn.close();
  }
}

/**
 * Inserts a new row. data.table, data.values = { col: val, ... }
 */
function dbInsert_(data, user) {
  dbGuard_(user);
  if (!data.table || !data.values || Object.keys(data.values).length === 0) {
    throw new Error('table and values required');
  }
  const safeTable = dbSanitizeIdentifier_(data.table);
  const cols = Object.keys(data.values);
  const safeCols = cols.map(dbSanitizeIdentifier_);
  const placeholders = cols.map(function () { return '?'; });

  let conn, stmt;
  try {
    conn = dbGetConnection_();
    const sql = 'INSERT INTO ' + safeTable + ' (' + safeCols.join(', ') + ') VALUES (' + placeholders.join(', ') + ')';
    stmt = conn.prepareStatement(sql);
    for (let i = 0; i < cols.length; i++) {
      stmt.setObject(i + 1, data.values[cols[i]]);
    }
    const affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected };
  } catch (err) {
    Logger.log('dbInsert_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Updates rows. data.table, data.where = { pk: val }, data.values = { col: val }
 */
function dbUpdate_(data, user) {
  dbGuard_(user);
  if (!data.table || !data.where || !data.values || Object.keys(data.values).length === 0) {
    throw new Error('table, where, and values required');
  }
  const safeTable = dbSanitizeIdentifier_(data.table);

  // Build SET clause
  const setParts = [];
  const setVals = [];
  for (const col in data.values) {
    setParts.push(dbSanitizeIdentifier_(col) + ' = ?');
    setVals.push(data.values[col]);
  }

  // Build WHERE clause
  const whereParts = [];
  const whereVals = [];
  for (const col in data.where) {
    whereParts.push(dbSanitizeIdentifier_(col) + ' = ?');
    whereVals.push(data.where[col]);
  }

  let conn, stmt;
  try {
    conn = dbGetConnection_();
    const sql = 'UPDATE ' + safeTable + ' SET ' + setParts.join(', ') + ' WHERE ' + whereParts.join(' AND ');
    stmt = conn.prepareStatement(sql);
    const allVals = setVals.concat(whereVals);
    for (let i = 0; i < allVals.length; i++) {
      stmt.setObject(i + 1, allVals[i]);
    }
    const affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected };
  } catch (err) {
    Logger.log('dbUpdate_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Deletes rows. data.table, data.where = { col: val }
 */
function dbDelete_(data, user) {
  dbGuard_(user);
  if (!data.table || !data.where || Object.keys(data.where).length === 0) {
    throw new Error('table and where required');
  }
  const safeTable = dbSanitizeIdentifier_(data.table);

  const whereParts = [];
  const whereVals = [];
  for (const col in data.where) {
    whereParts.push(dbSanitizeIdentifier_(col) + ' = ?');
    whereVals.push(data.where[col]);
  }

  let conn, stmt;
  try {
    conn = dbGetConnection_();
    const sql = 'DELETE FROM ' + safeTable + ' WHERE ' + whereParts.join(' AND ');
    stmt = conn.prepareStatement(sql);
    for (let i = 0; i < whereVals.length; i++) {
      stmt.setObject(i + 1, whereVals[i]);
    }
    const affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected };
  } catch (err) {
    Logger.log('dbDelete_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Aggregates a column: COUNT, SUM, AVG, MIN, MAX, optionally GROUP BY another column.
 */
function dbAggregate_(data, user) {
  dbGuard_(user);
  if (!data.table || !data.column) throw new Error('table and column required');
  const safeTable = dbSanitizeIdentifier_(data.table);
  const safeCol = dbSanitizeIdentifier_(data.column);
  const func = (data.func || 'COUNT').toUpperCase();
  const validFuncs = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
  if (validFuncs.indexOf(func) === -1) throw new Error('Invalid aggregate function: ' + func);

  let conn, stmt, rs;
  try {
    conn = dbGetConnection_();

    if (data.groupBy) {
      const safeGroup = dbSanitizeIdentifier_(data.groupBy);
      stmt = conn.prepareStatement('SELECT ' + safeGroup + ', ' + func + '(' + safeCol + ') AS result FROM ' + safeTable + ' WHERE ' + safeCol + ' IS NOT NULL GROUP BY ' + safeGroup + ' ORDER BY result DESC LIMIT 100');
    } else {
      stmt = conn.prepareStatement('SELECT ' + func + '(' + safeCol + ') AS result FROM ' + safeTable + ' WHERE ' + safeCol + ' IS NOT NULL');
    }
    rs = stmt.executeQuery();

    if (data.groupBy) {
      const rows = [];
      while (rs.next()) {
        rows.push({ group: String(rs.getObject(1)), value: rs.getObject(2) });
      }
      return { status: 'ok', func: func, rows: rows };
    } else {
      const result = rs.next() ? rs.getObject(1) : null;
      return { status: 'ok', func: func, result: result };
    }
  } catch (err) {
    Logger.log('dbAggregate_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────

function dbSanitizeIdentifier_(name) {
  // Allow only alphanumeric and underscore, wrap in backticks
  const clean = String(name).replace(/[^a-zA-Z0-9_]/g, '');
  if (!clean || /^[0-9]/.test(clean)) throw new Error('Invalid identifier: ' + name);
  return '`' + clean + '`';
}

function dbSanitizeOrderBy_(orderBy) {
  // "col ASC", "col DESC", or just "col" → safe SQL fragment
  const parts = String(orderBy).trim().split(/\s+/);
  const col = dbSanitizeIdentifier_(parts[0]);
  const dir = parts[1] && parts[1].toUpperCase() === 'DESC' ? ' DESC' : ' ASC';
  return col + dir;
}

function dbBindParams_(stmt, params) {
  for (let i = 0; i < params.length; i++) {
    stmt.setObject(i + 1, params[i]);
  }
}

// ─── clients_AR live review (Top Chemical: tc_main_review) ──────────
// Server-side paginated read + single-row revise against the MySQL view
// `clients_AR`. Called via TopChemical company actions (get_main_review /
// revise_main_review) so page-level authority applies; no dbGuard_ here.

var DB_CLIENTS_AR_COLUMNS = [
  'client_balance_sheet_id', 'client_id', 'name_ar', 'balance_amount',
  'notes', 'payment_date', 'created_at', 'is_revised'
];

function dbClientsArValidateDate_(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Invalid date format (expected YYYY-MM-DD): ' + s);
  return s;
}

function dbClientsArWhere_(data) {
  // Returns { sql, params } — shared by COUNT and SELECT so both agree.
  var conditions = [];
  var params = [];
  var from = dbClientsArValidateDate_(data.payment_from);
  var to = dbClientsArValidateDate_(data.payment_to);
  if (from) { conditions.push('`payment_date` >= ?'); params.push(from); }
  if (to) { conditions.push('`payment_date` <= ?'); params.push(to); }
  var rev = String(data.is_revised === undefined || data.is_revised === null ? '' : data.is_revised).trim();
  if (rev === '0' || rev === '1') { conditions.push('`is_revised` = ?'); params.push(Number(rev)); }
  else if (rev !== '') { throw new Error('Invalid is_revised filter (expected 0, 1, or empty)'); }
  var sql = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  return { sql: sql, params: params };
}

/**
 * Paginated list from the clients_AR view.
 * data: { payment_from, payment_to, is_revised ('0'/'1'/''), limit, offset }
 * Returns { status:'ok', columns, rows, total, limit, offset }.
 * NULL payment_date rows never match a set date bound (standard SQL).
 */
function dbClientsArList_(data, user) {
  data = data || {};
  var limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
  var offset = Math.max(Number(data.offset) || 0, 0);
  var where = dbClientsArWhere_(data);
  var cols = DB_CLIENTS_AR_COLUMNS.map(dbSanitizeIdentifier_).join(', ');
  var conn, countStmt, countRs, stmt, rs;
  try {
    conn = dbGetConnection_();
    countStmt = conn.prepareStatement('SELECT COUNT(*) AS cnt FROM `clients_AR`' + where.sql);
    dbBindParams_(countStmt, where.params);
    countRs = countStmt.executeQuery();
    var total = countRs.next() ? countRs.getInt('cnt') : 0;
    stmt = conn.prepareStatement(
      'SELECT ' + cols + ' FROM `clients_AR`' + where.sql +
      ' ORDER BY `payment_date` DESC, `client_balance_sheet_id` DESC' +
      ' LIMIT ' + limit + ' OFFSET ' + offset);
    dbBindParams_(stmt, where.params);
    rs = stmt.executeQuery();
    var rows = [];
    while (rs.next()) {
      rows.push({
        client_balance_sheet_id: rs.getObject(1) !== null ? String(rs.getObject(1)) : null,
        client_id: rs.getObject(2) !== null ? String(rs.getObject(2)) : null,
        name_ar: rs.getObject(3) !== null ? String(rs.getObject(3)) : null,
        balance_amount: rs.getObject(4) !== null ? String(rs.getObject(4)) : null,
        notes: rs.getObject(5) !== null ? String(rs.getObject(5)) : null,
        payment_date: rs.getObject(6) !== null ? String(rs.getObject(6)).slice(0, 10) : null,
        created_at: rs.getObject(7) !== null ? String(rs.getObject(7)) : null,
        is_revised: rs.getObject(8) !== null ? String(rs.getObject(8)) : '0'
      });
    }
    return { status: 'ok', columns: DB_CLIENTS_AR_COLUMNS.slice(), rows: rows, total: total, limit: limit, offset: offset };
  } catch (err) {
    Logger.log('dbClientsArList_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (countRs) countRs.close();
    if (countStmt) countStmt.close();
    if (conn) conn.close();
  }
}

/**
 * Flip one row 0 -> 1. data: { client_balance_sheet_id }.
 * NOTE: if clients_AR is a non-updatable view (joins/aggregates) MySQL
 * raises 1288/1353 — then retarget this UPDATE to the base table holding
 * is_revised (find via SHOW CREATE VIEW clients_AR); SELECT stays on view.
 */
function dbClientsArRevise_(data, user) {
  data = data || {};
  var id = String(data.client_balance_sheet_id === undefined || data.client_balance_sheet_id === null ? '' : data.client_balance_sheet_id).trim();
  if (!id) throw new Error('client_balance_sheet_id is required');
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'UPDATE `clients_AR` SET `is_revised` = 1 WHERE `client_balance_sheet_id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)');
    stmt.setObject(1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('البند غير موجود أو تمت مراجعته مسبقاً');
    return { status: 'ok', affected: affected, client_balance_sheet_id: id, is_revised: 1 };
  } catch (err) {
    Logger.log('dbClientsArRevise_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── regular_box_movement analysis (Top Chemical: tc_box_analysis) ──
//
// Read path for the box-analysis page. Same discipline as the clients_AR block
// above: prepared statements, bound parameters, a shared WHERE builder so COUNT
// and SELECT can never disagree, clamped limits, and one `finally` that closes
// result set → statement → connection on every path including the error path.
//
// Called via TopChemical company actions (get_box_analysis / get_box_item_history
// / update_box_movement / revise_box_movement) so page-level authority applies;
// no dbGuard_ here, exactly as the clients_AR functions do it.
//
// NOTHING IN THIS FILE HAS EVER BEEN RUN. There is no MySQL client on the
// machine this was written on and the credentials live only in Script
// Properties. Every statement below was verified by reading it against the
// schema in BOX_ANALYSIS_PLAN.md §2, not by executing it. The first execution
// will be the owner's.

var DB_BOX_TABLE = '`regular_box_movement`';

var DB_BOX_COLUMNS = [
  'id', 'transaction_date', 'transaction_details', 'client_id', 'related_id',
  'transaction_type', 'transaction_amount', 'chart_of_accounts',
  'responsible_person', 'box_code', 'user_id', 'created_at', 'updated_at',
  'is_revised'
];

/* The item engine runs only on accounts numerically inside [300000, 400000]
   (plan §2.1). `chart_of_accounts` is a `text` column holding a number, so the
   comparison has to cast.

   NOT SARGABLE, ON PURPOSE, FOR NOW: CAST(...) around the column defeats any
   index, and `text` cannot be indexed without a prefix index anyway. If the
   codes in this family turn out to be uniformly 6 digits, the plain string
   range `>= '300000' AND < '400000'` is exactly equivalent and CAN use a prefix
   index — but that is a measurement nobody has been able to take yet, not an
   assumption to build on. It is registered in NEXT_STEPS_OWNER.md.

   The REGEXP guard is not decoration: MySQL's CAST of a non-numeric string
   yields 0 with a warning rather than an error, so without it every row whose
   account code is blank or non-numeric would silently fall outside the range —
   which is the right answer here, but by accident. Stating it makes the
   intent survive the next edit. */
var DB_BOX_RANGE_SQL =
  "(`chart_of_accounts` REGEXP '^[0-9]+$' AND CAST(`chart_of_accounts` AS UNSIGNED) BETWEEN 300000 AND 400000)";

function dbBoxValidateDate_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('صيغة التاريخ غير صحيحة (المتوقع YYYY-MM-DD): ' + s);
  return s;
}

function dbBoxValidateAccount_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '';
  if (!/^\d{1,20}$/.test(s)) throw new Error('كود الحساب يجب أن يكون أرقاماً فقط: ' + s);
  return s;
}

function dbBoxValidateType_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  if (!s) return '';
  if (s !== 'credit' && s !== 'debit') throw new Error("نوع الحركة يجب أن يكون credit أو debit: " + v);
  return s;
}

/** Integer or '' (meaning "no filter"). Rejects anything else rather than coercing. */
function dbBoxValidateInt_(v, label) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return '';
  if (!/^-?\d{1,19}$/.test(s)) throw new Error((label || 'القيمة') + ' يجب أن تكون رقماً صحيحاً: ' + v);
  return s;
}

/**
 * Shared WHERE builder — used by BOTH the COUNT and the SELECT in dbBoxList_,
 * so the pager total can never describe a different set of rows than the page
 * shows. Same reason dbClientsArWhere_ exists.
 *
 * data: { date_from, date_to, chart_of_accounts, responsible_person, box_code,
 *         transaction_type, is_revised, items_only }
 * Returns { sql, params }.
 *
 * NULL transaction_date rows never match a set date bound (standard SQL), the
 * same behaviour the clients_AR list already has.
 */
function dbBoxWhere_(data) {
  var conditions = [];
  var params = [];

  var from = dbBoxValidateDate_(data.date_from);
  var to = dbBoxValidateDate_(data.date_to);
  if (from && to && from > to) throw new Error('تاريخ "من" يجب أن يكون قبل تاريخ "إلى"');
  if (from) { conditions.push('`transaction_date` >= ?'); params.push(from); }
  if (to) { conditions.push('`transaction_date` <= ?'); params.push(to); }

  var acct = dbBoxValidateAccount_(data.chart_of_accounts);
  if (acct) { conditions.push('`chart_of_accounts` = ?'); params.push(acct); }

  /* responsible_person is free `text` and is typed inconsistently (plan §2
     caveat), so an exact match would find nothing most of the time. LIKE with
     both wildcards is a scan — acceptable because the date bound above already
     limits the set, and because this is a filter a human typed, not something
     the page issues on its own. */
  var person = String(data.responsible_person === undefined || data.responsible_person === null ? '' : data.responsible_person).trim();
  if (person) { conditions.push('`responsible_person` LIKE ?'); params.push('%' + person + '%'); }

  var box = dbBoxValidateInt_(data.box_code, 'كود الخزنة');
  if (box) { conditions.push('`box_code` = ?'); params.push(box); }

  var type = dbBoxValidateType_(data.transaction_type);
  if (type) { conditions.push('`transaction_type` = ?'); params.push(type); }

  var rev = String(data.is_revised === undefined || data.is_revised === null ? '' : data.is_revised).trim();
  if (rev === '0' || rev === '1') { conditions.push('`is_revised` = ?'); params.push(Number(rev)); }
  else if (rev !== '') throw new Error('قيمة حالة المراجعة غير صحيحة (المتوقع 0 أو 1 أو فراغ)');

  if (data.items_only === true || data.items_only === 'true' || data.items_only === 1 || data.items_only === '1') {
    conditions.push(DB_BOX_RANGE_SQL);
  }

  return {
    sql: conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '',
    params: params
  };
}

/** Every column of one result-set row, as strings (or null), in DB_BOX_COLUMNS order. */
function dbBoxReadRow_(rs) {
  function s(i) { var v = rs.getObject(i); return v !== null ? String(v) : null; }
  return {
    id: s(1),
    /* DATE comes back as 'YYYY-MM-DD'; slice defends against a driver that
       appends a time, exactly as dbClientsArList_ does for payment_date. */
    transaction_date: rs.getObject(2) !== null ? String(rs.getObject(2)).slice(0, 10) : null,
    transaction_details: s(3),
    client_id: s(4),
    related_id: s(5),
    transaction_type: s(6),
    transaction_amount: s(7),
    chart_of_accounts: s(8),
    responsible_person: s(9),
    box_code: s(10),
    user_id: s(11),
    created_at: s(12),
    updated_at: s(13),
    is_revised: rs.getObject(14) !== null ? String(rs.getObject(14)) : '0'
  };
}

/**
 * Paginated list of movements.
 * data: the dbBoxWhere_ filters, plus { limit, offset }.
 * Returns { status:'ok', columns, rows, total, limit, offset }.
 *
 * Limits clamped exactly as dbClientsArList_ clamps them — nothing unbounded
 * ever leaves the database. The clamped values are integers produced here, not
 * client strings, which is why they can be concatenated into the SQL.
 */
function dbBoxList_(data, user) {
  data = data || {};
  var limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
  var offset = Math.max(Number(data.offset) || 0, 0);
  var where = dbBoxWhere_(data);
  var cols = DB_BOX_COLUMNS.map(dbSanitizeIdentifier_).join(', ');
  var conn, countStmt, countRs, stmt, rs;
  try {
    conn = dbGetConnection_();
    countStmt = conn.prepareStatement('SELECT COUNT(*) AS cnt FROM ' + DB_BOX_TABLE + where.sql);
    dbBindParams_(countStmt, where.params);
    countRs = countStmt.executeQuery();
    var total = countRs.next() ? countRs.getInt('cnt') : 0;

    stmt = conn.prepareStatement(
      'SELECT ' + cols + ' FROM ' + DB_BOX_TABLE + where.sql +
      ' ORDER BY `transaction_date` DESC, `id` DESC' +
      ' LIMIT ' + limit + ' OFFSET ' + offset);
    dbBindParams_(stmt, where.params);
    rs = stmt.executeQuery();

    var rows = [];
    while (rs.next()) rows.push(dbBoxReadRow_(rs));
    return { status: 'ok', columns: DB_BOX_COLUMNS.slice(), rows: rows, total: total, limit: limit, offset: offset };
  } catch (err) {
    Logger.log('dbBoxList_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (countRs) countRs.close();
    if (countStmt) countStmt.close();
    if (conn) conn.close();
  }
}

/**
 * The four spend windows per chart_of_accounts, in ONE round trip (plan §6).
 *
 * data: { ref_date 'YYYY-MM-DD', chart_of_accounts (optional), limit }.
 *
 * credit = spend (منصرف), debit = collected (محصّل). They are returned in
 * SEPARATE columns and are never netted: netting lets an inflow mask an
 * outflow, which is the opposite of what this page is for.
 *
 * Last month and last year are cut to the same day-of-period as the reference
 * date, computed by BoxEngine.accountWindows — a partial month measured against
 * a complete one manufactures a decline every time.
 *
 * The bound parameters go in in the same order the CASE expressions consume
 * them. That ordering is the one thing here a reader has to check by eye, so
 * the window list and the SELECT are built from the SAME array below rather
 * than written out twice.
 */
function dbBoxAccountAggregates_(data, user) {
  data = data || {};
  var ref = dbBoxValidateDate_(data.ref_date);
  if (!ref) throw new Error('ref_date is required (YYYY-MM-DD)');
  var w = BoxEngine.accountWindows(ref);
  var acct = dbBoxValidateAccount_(data.chart_of_accounts);
  /* Without a single-account filter this groups the whole table's accounts, so
     it is capped. With one, the cap is irrelevant — there is one group. */
  var limit = Math.min(Math.max(Number(data.limit) || 300, 1), 1000);

  var WINDOWS = [
    { key: 'mtd', w: w.mtd },
    { key: 'last_month', w: w.last_month },
    { key: 'ytd', w: w.ytd },
    { key: 'last_ytd', w: w.last_ytd }
  ];

  var selects = [];
  var params = [];
  WINDOWS.forEach(function (x) {
    selects.push("SUM(CASE WHEN `transaction_type` = 'credit' AND `transaction_date` BETWEEN ? AND ? THEN `transaction_amount` ELSE 0 END) AS `spend_" + x.key + '`');
    params.push(x.w.from, x.w.to);
  });
  WINDOWS.forEach(function (x) {
    selects.push("SUM(CASE WHEN `transaction_type` = 'debit' AND `transaction_date` BETWEEN ? AND ? THEN `transaction_amount` ELSE 0 END) AS `collected_" + x.key + '`');
    params.push(x.w.from, x.w.to);
  });
  WINDOWS.forEach(function (x) {
    selects.push("COUNT(CASE WHEN `transaction_type` = 'credit' AND `transaction_date` BETWEEN ? AND ? THEN 1 END) AS `n_" + x.key + '`');
    params.push(x.w.from, x.w.to);
  });

  /* The outer bound is exactly the span the four windows can touch: 1 January
     of last year through the reference date. Anything outside it contributes 0
     to every CASE, so reading it would be pure cost. */
  var whereSql = ' WHERE `transaction_date` BETWEEN ? AND ?';
  params.push(w.span.from, w.span.to);
  if (acct) { whereSql += ' AND `chart_of_accounts` = ?'; params.push(acct); }

  /* The page needs figures for exactly the accounts on the visible page —
     rarely more than a dozen. Restricting to them keeps the GROUP BY off the
     whole account tree and, more importantly, means the answer cannot depend on
     the ORDER BY / LIMIT below: without it, an account on the page that is not
     in the top N by YTD spend would come back with no figures at all and the
     strip would read zero for a perfectly ordinary account.
     The placeholders are generated from the validated list's LENGTH; the values
     themselves bind. */
  var list = [];
  if (data.accounts && data.accounts.length) {
    for (var ai = 0; ai < data.accounts.length; ai++) {
      var one = dbBoxValidateAccount_(data.accounts[ai]);
      if (one && list.indexOf(one) === -1) list.push(one);
    }
    if (list.length > 500) list = list.slice(0, 500);
  }
  if (list.length) {
    var marks = [];
    for (var mi = 0; mi < list.length; mi++) marks.push('?');
    whereSql += ' AND `chart_of_accounts` IN (' + marks.join(', ') + ')';
    for (var pi = 0; pi < list.length; pi++) params.push(list[pi]);
  }

  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'SELECT `chart_of_accounts`, ' + selects.join(', ') +
      ' FROM ' + DB_BOX_TABLE + whereSql +
      ' GROUP BY `chart_of_accounts`' +
      ' ORDER BY `spend_ytd` DESC' +
      ' LIMIT ' + limit);
    dbBindParams_(stmt, params);
    rs = stmt.executeQuery();

    var rows = [];
    while (rs.next()) {
      var row = { chart_of_accounts: rs.getObject(1) !== null ? String(rs.getObject(1)) : null };
      var i = 2;
      WINDOWS.forEach(function (x) { row['spend_' + x.key] = Number(rs.getObject(i++)) || 0; });
      WINDOWS.forEach(function (x) { row['collected_' + x.key] = Number(rs.getObject(i++)) || 0; });
      WINDOWS.forEach(function (x) { row['n_' + x.key] = Number(rs.getObject(i++)) || 0; });
      rows.push(row);
    }
    return { status: 'ok', ref_date: ref, windows: w, rows: rows, limit: limit };
  } catch (err) {
    Logger.log('dbBoxAccountAggregates_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Account code → Arabic label, from chart_of_accounts_main.
 *
 * DELIBERATELY NOT A JOIN. Whether `chart_of_accounts_main.id_5` is unique per
 * row has not been confirmed against the data (plan §12 q.4), and a duplicated
 * id_5 in a SQL join would fan out the aggregate rows and DOUBLE every account
 * total on the page — a wrong number that looks entirely plausible. Labelling
 * in JavaScript from a map cannot fan anything out: a duplicate can only make a
 * label ambiguous, and `duplicate_ids` reports exactly which ones so the page
 * can say so rather than pick one silently.
 */
function dbChartAccountLabels_(data, user) {
  data = data || {};
  var limit = Math.min(Math.max(Number(data.limit) || 5000, 1), 20000);
  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'SELECT `id_5`, `account_5_name` FROM `chart_of_accounts_main`' +
      ' WHERE `id_5` IS NOT NULL LIMIT ' + limit);
    rs = stmt.executeQuery();
    var labels = {}, duplicates = {}, n = 0;
    while (rs.next()) {
      var id = rs.getObject(1) !== null ? String(rs.getObject(1)).trim() : '';
      var name = rs.getObject(2) !== null ? String(rs.getObject(2)).trim() : '';
      if (!id) continue;
      n++;
      if (Object.prototype.hasOwnProperty.call(labels, id)) {
        if (labels[id] !== name) duplicates[id] = true;
        continue;                       /* first spelling wins, and it is reported */
      }
      labels[id] = name;
    }
    return {
      status: 'ok', labels: labels, count: n,
      duplicate_ids: Object.keys(duplicates),
      truncated: n >= limit
    };
  } catch (err) {
    Logger.log('dbChartAccountLabels_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * The rows the item engine needs: a bounded window of in-range movements, with
 * only the columns parsing and price analysis actually consume.
 *
 * This is the ONE query that feeds the whole item index. It is never issued per
 * row and never inside a loop — JDBC round trips are the entire cost of this
 * page, and a per-row history query would turn one page load into fifty.
 *
 * Two hard bounds, both because Apps Script kills a script at six minutes:
 *   months  — how far back to look, default 24, capped at 60
 *   limit   — a hard row cap, capped at DB_BOX_HISTORY_MAX
 * `truncated` tells the caller the window was cut, so the page can say
 * "التحليل على أحدث N حركة" instead of quietly analysing a subset.
 */
var DB_BOX_HISTORY_MAX = 20000;

function dbBoxItemHistory_(data, user) {
  data = data || {};
  var ref = dbBoxValidateDate_(data.ref_date);
  if (!ref) throw new Error('ref_date is required (YYYY-MM-DD)');
  var months = Math.min(Math.max(Number(data.months) || 24, 1), 60);
  var limit = Math.min(Math.max(Number(data.limit) || 5000, 1), DB_BOX_HISTORY_MAX);

  var fromIso = BoxEngine.monthsBefore(ref, months);

  var params = [fromIso, ref];
  var whereSql = ' WHERE `transaction_date` BETWEEN ? AND ?' +
    "  AND `transaction_type` = 'credit'" +      /* spend only; debit is collection */
    ' AND ' + DB_BOX_RANGE_SQL;                  /* the item engine's scope, plan §2.1 */

  var acct = dbBoxValidateAccount_(data.chart_of_accounts);
  if (acct) { whereSql += ' AND `chart_of_accounts` = ?'; params.push(acct); }

  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'SELECT `id`, `transaction_date`, `transaction_details`, `transaction_amount`,' +
      ' `chart_of_accounts`, `responsible_person`, `box_code`, `created_at`, `is_revised`' +
      ' FROM ' + DB_BOX_TABLE + whereSql +
      ' ORDER BY `transaction_date` DESC, `id` DESC' +
      ' LIMIT ' + limit);
    dbBindParams_(stmt, params);
    rs = stmt.executeQuery();

    var rows = [];
    while (rs.next()) {
      rows.push({
        id: rs.getObject(1) !== null ? String(rs.getObject(1)) : null,
        transaction_date: rs.getObject(2) !== null ? String(rs.getObject(2)).slice(0, 10) : null,
        transaction_details: rs.getObject(3) !== null ? String(rs.getObject(3)) : null,
        transaction_amount: rs.getObject(4) !== null ? String(rs.getObject(4)) : null,
        chart_of_accounts: rs.getObject(5) !== null ? String(rs.getObject(5)) : null,
        responsible_person: rs.getObject(6) !== null ? String(rs.getObject(6)) : null,
        box_code: rs.getObject(7) !== null ? String(rs.getObject(7)) : null,
        created_at: rs.getObject(8) !== null ? String(rs.getObject(8)) : null,
        is_revised: rs.getObject(9) !== null ? String(rs.getObject(9)) : '0'
      });
    }
    return {
      status: 'ok', rows: rows, from: fromIso, to: ref,
      months: months, limit: limit, truncated: rows.length >= limit
    };
  } catch (err) {
    Logger.log('dbBoxItemHistory_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── regular_box_movement: the ONE write path ───────────────────────────────
//
// This feature has exactly one write: one row, addressed by primary key, from a
// user who filled in a form, clicked Save, and then confirmed a dialog that
// named the change. There is no bulk correction here, no backfill, no
// "normalize the existing data" pass, and no DELETE. If the parser shows four
// hundred rows with malformed details, that is a number to report, not a job to
// run.
//
// Never executed against anything. Verified by reading, and by the invariants
// tools/verify/box_sql.js asserts over this text.

/** Reads one row by id. Used for the before/after snapshots the audit needs. */
function dbBoxGetOne_(conn, id) {
  var cols = DB_BOX_COLUMNS.map(dbSanitizeIdentifier_).join(', ');
  var stmt, rs;
  try {
    stmt = conn.prepareStatement('SELECT ' + cols + ' FROM ' + DB_BOX_TABLE + ' WHERE `id` = ? LIMIT 1');
    stmt.setObject(1, id);
    rs = stmt.executeQuery();
    return rs.next() ? dbBoxReadRow_(rs) : null;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
  }
}

/**
 * Update ONE movement row.
 *
 * data: { id, changes: { column: value, ... } }
 * Returns { status:'ok', id, changed:[cols], before:{row}, after:{row},
 *           boundary:{...}|null }
 *
 * The column names in the SET clause come from BoxEngine.EDITABLE_COLUMNS — a
 * fixed allowlist — and are re-derived here through dbSanitizeIdentifier_ so
 * that even a bug in the allowlist cannot put arbitrary text into the
 * statement. Values bind as parameters, every one of them.
 *
 * updated_at is set by the SERVER to NOW() and is not in the allowlist, so an
 * edit cannot write an old timestamp into the column that the
 * EDITED_AFTER_REVIEW rule reads.
 *
 * The caller (updateBoxMovement_) writes the audit trail. It is not done here
 * because this file talks to MySQL and the audit lives in Drive, and mixing the
 * two would make this function untestable in exactly the way the rest of the
 * connector is.
 */
function dbBoxUpdate_(data, user) {
  data = data || {};
  var id = dbBoxValidateInt_(data.id, 'رقم الحركة');
  if (!id) throw new Error('رقم الحركة مطلوب');

  /* Allowlist + per-column validation, before a connection is even opened.
     A change set that will not validate must not cost a round trip. */
  var checked = BoxEngine.validateChanges(data.changes);

  var setParts = [];
  var params = [];
  checked.columns.forEach(function (col) {
    setParts.push(dbSanitizeIdentifier_(col) + ' = ?');
    params.push(checked.values[col]);
  });
  /* Server-set, always, and last in the SET list so it is impossible to read
     the statement without seeing it. */
  setParts.push('`updated_at` = NOW()');

  var conn, stmt;
  try {
    conn = dbGetConnection_();

    var before = dbBoxGetOne_(conn, id);
    if (!before) throw new Error('البند غير موجود');

    stmt = conn.prepareStatement(
      'UPDATE ' + DB_BOX_TABLE + ' SET ' + setParts.join(', ') + ' WHERE `id` = ?');
    dbBindParams_(stmt, params);
    stmt.setObject(params.length + 1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('البند غير موجود');

    var after = dbBoxGetOne_(conn, id);
    return {
      status: 'ok',
      id: id,
      affected: affected,
      changed: checked.columns,
      before: before,
      after: after,
      /* Crossing the 300000–400000 boundary changes which analyses apply to
         this row and nothing else on screen would show it. */
      boundary: checked.columns.indexOf('chart_of_accounts') !== -1
        ? BoxEngine.crossesItemBoundary(before.chart_of_accounts, after ? after.chart_of_accounts : null)
        : null
    };
  } catch (err) {
    Logger.log('dbBoxUpdate_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Flip one row's review flag 0 -> 1, mirroring dbClientsArRevise_.
 *
 * The `AND is_revised = 0 OR IS NULL` guard makes this idempotent-safe: a
 * second click reports "already reviewed" rather than silently moving
 * updated_at, which the EDITED_AFTER_REVIEW rule would then read as a post-hoc
 * edit of a reviewed row. The rule this page ships would have fired on the
 * page's own double-click.
 */
function dbBoxRevise_(data, user) {
  data = data || {};
  var id = dbBoxValidateInt_(data.id, 'رقم الحركة');
  if (!id) throw new Error('رقم الحركة مطلوب');
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'UPDATE ' + DB_BOX_TABLE + ' SET `is_revised` = 1, `updated_at` = NOW()' +
      ' WHERE `id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)');
    stmt.setObject(1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('البند غير موجود أو تمت مراجعته مسبقاً');
    return { status: 'ok', affected: affected, id: id, is_revised: 1 };
  } catch (err) {
    Logger.log('dbBoxRevise_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}
