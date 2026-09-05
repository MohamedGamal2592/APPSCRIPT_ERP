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
  props: {
    host: 'MYSQL_HOST',
    port: 'MYSQL_PORT',
    database: 'MYSQL_DATABASE',
    user: 'appscript_user',
    pass: 'YourStrongPassword123!'
  }
};

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
  if (!props.getProperty(DBLIVE_CONFIG.props.user)) missing.push('MYSQL_USER');
  if (!props.getProperty(DBLIVE_CONFIG.props.pass)) missing.push('MYSQL_PASSWORD');
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
  const user = (props.getProperty(DBLIVE_CONFIG.props.user) || '').trim();
  const pass = props.getProperty(DBLIVE_CONFIG.props.pass) || '';
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
