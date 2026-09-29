/**
 * DbLive_Connector.js
 * RESPONSIBILITY: MySQL JDBC connector — live CRUD against remote MySQL database.
 * Credentials stored in ScriptProperties (setup via setupMySqlCredentials()).
 * Independent module — not tied to any company or Sheets-based data layer.
 * Loaded after 07_Backup.js.
 */

/** Super-admin-only gate for every live MySQL operation. */
function dbGuard_(user) {
  if (!user || !user.isSuperAdmin) throw new Error('غير مصرح — للمسؤول فقط');
}

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
function setupMySqlCredentials_() {
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
  var isVendor = String(data.source || data.view || '').trim() === 'vendors_AP';
  var conn, countStmt, countRs, stmt, rs;
  try {
    conn = dbGetConnection_();
    countStmt = conn.prepareStatement(isVendor
      ? 'SELECT COUNT(*) AS cnt FROM `vendors_AP`' + where.sql
      : 'SELECT COUNT(*) AS cnt FROM `clients_AR`' + where.sql);
    dbBindParams_(countStmt, where.params);
    countRs = countStmt.executeQuery();
    var total = countRs.next() ? countRs.getInt('cnt') : 0;
    stmt = conn.prepareStatement(isVendor
      ? 'SELECT ' + cols + ' FROM `vendors_AP`' + where.sql +
        ' ORDER BY `payment_date` DESC, `client_balance_sheet_id` DESC' +
        ' LIMIT ' + limit + ' OFFSET ' + offset
      : 'SELECT ' + cols + ' FROM `clients_AR`' + where.sql +
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
    return { status: 'ok', columns: DB_CLIENTS_AR_COLUMNS.slice(), rows: rows, total: total, limit: limit, offset: offset, source: isVendor ? 'vendors_AP' : 'clients_AR' };
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
 * Flip one row 0 -> 1. data: { client_balance_sheet_id, source }.
 * NOTE: if clients_AR / vendors_AP is a non-updatable view (joins/aggregates) MySQL
 * raises 1288/1353 — then retarget this UPDATE to the base table holding
 * is_revised (find via SHOW CREATE VIEW clients_AR); SELECT stays on view.
 */
function dbClientsArRevise_(data, user) {
  data = data || {};
  var id = String(data.client_balance_sheet_id === undefined || data.client_balance_sheet_id === null ? '' : data.client_balance_sheet_id).trim();
  if (!id) throw new Error('client_balance_sheet_id is required');
  var isVendor = String(data.source || data.view || '').trim() === 'vendors_AP';
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(isVendor
      ? 'UPDATE `vendors_AP` SET `is_revised` = 1 WHERE `client_balance_sheet_id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)'
      : 'UPDATE `clients_AR` SET `is_revised` = 1 WHERE `client_balance_sheet_id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)');
    stmt.setObject(1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('البند غير موجود أو تمت مراجعته مسبقاً');
    return { status: 'ok', affected: affected, client_balance_sheet_id: id, is_revised: 1, source: isVendor ? 'vendors_AP' : 'clients_AR' };
  } catch (err) {
    Logger.log('dbClientsArRevise_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── client_balance_sheets (Top Chemical: tc_client_balance_sheets) ──
//
// Schema (16 columns): id (PK), client_id, admin_id, debit_currency_id,
// credit_currency_id, invoice_id, debit_amount, credit_amount, balance_amount,
// notes, payment_type, payment_date, created_at, updated_at, deleted_at, is_revised.
// Soft-deleted rows (deleted_at IS NOT NULL) are excluded from reads.

/**
 * Paginated or full list from the client_balance_sheets table.
 * Default: last 20 rows (ORDER BY id DESC). Pass loadAll:true for up to 1000.
 * Soft-deleted rows are excluded (WHERE deleted_at IS NULL).
 */
function dbClientBalanceSheetsList_(data, user) {
  data = data || {};
  var loadAll = !!(data.loadAll === true || data.loadAll === 'true' || data.loadAll === '1' || data.loadAll === 1);
  var limit = loadAll ? 1000 : Math.min(Math.max(Number(data.limit) || 20, 1), 1000);
  var offset = Math.max(Number(data.offset) || 0, 0);

  var conn, countStmt, countRs, stmt, rs;
  try {
    conn = dbGetConnection_();
    countStmt = conn.prepareStatement(
      'SELECT COUNT(*) AS cnt FROM `client_balance_sheets` WHERE `deleted_at` IS NULL'
    );
    countRs = countStmt.executeQuery();
    var total = countRs.next() ? countRs.getInt('cnt') : 0;

    stmt = conn.prepareStatement(
      'SELECT * FROM `client_balance_sheets` WHERE `deleted_at` IS NULL' +
      ' ORDER BY `id` DESC LIMIT ' + limit + ' OFFSET ' + offset
    );
    rs = stmt.executeQuery();

    var md = rs.getMetaData();
    var colCount = md.getColumnCount();
    var columns = [];
    for (var c = 1; c <= colCount; c++) {
      columns.push(md.getColumnLabel(c) || md.getColumnName(c));
    }

    var rows = [];
    while (rs.next()) {
      var row = {};
      for (var i = 1; i <= colCount; i++) {
        var colName = columns[i - 1];
        var val = rs.getObject(i);
        row[colName] = val !== null ? String(val) : null;
      }
      rows.push(row);
    }

    return {
      status: 'ok',
      columns: columns,
      rows: rows,
      total: total,
      limit: limit,
      offset: offset,
      loadedAll: loadAll
    };
  } catch (err) {
    Logger.log('dbClientBalanceSheetsList_ error: ' + err.message);
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
 * Update a single row in client_balance_sheets by the real PK `id`.
 * Read-only / server-managed columns are stripped before building the SET clause.
 */
function dbClientBalanceSheetsUpdate_(data, user) {
  data = data || {};
  var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
  if (!id) throw new Error('id is required');

  // Columns the client must not overwrite — PK and server-managed audit timestamps.
  // deleted_at IS editable: it controls soft-delete and the admin may need to restore rows.
  var readOnlyCols = {
    'id':         true,
    'created_at': true,
    'updated_at': true
  };

  var updates = [];
  var params = [];

  for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (readOnlyCols[key]) continue;
    // Skip internal/private keys (prefixed _)
    if (key.charAt(0) === '_') continue;
    var safeCol = dbSanitizeIdentifier_(key);
    var rawVal = data[key];
    updates.push(safeCol + ' = ?');
    params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
  }

  if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');

  params.push(id);

  var conn, stmt;
  try {
    conn = dbGetConnection_();
    var sql = 'UPDATE `client_balance_sheets` SET ' + updates.join(', ') + ' WHERE `id` = ?';
    stmt = conn.prepareStatement(sql);
    dbBindParams_(stmt, params);
    var affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbClientBalanceSheetsUpdate_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── manufacture_headers / manufacture_footers (Top Chemical: tc_manufacture_orders) ──
//
// manufacture_headers (17 cols): id, user_id, user_type, name_ar,
//   expected_quantity, deliver_quantity, is_product, product_id, status,
//   manufacture_number, manufacture_delivery_number, admin_approved,
//   admin_approved_at, created_at, updated_at, deleted_at, is_revised.
// manufacture_footers (9 cols): id, manufacture_header_id, product_id,
//   product_code, productUnit, productQuantity, created_at, updated_at, warehouse_id.

/**
 * Paginated / full list of manufacture_headers.
 * Soft-deleted rows (deleted_at IS NOT NULL) are excluded.
 */
function dbManufactureList_(data, user) {
  data = data || {};
  var loadAll = !!(data.loadAll === true || data.loadAll === 'true' || data.loadAll === '1' || data.loadAll === 1);
  var limit  = loadAll ? 1000 : Math.min(Math.max(Number(data.limit)  || 20, 1), 1000);
  var offset = Math.max(Number(data.offset) || 0, 0);
  var conn, countStmt, countRs, stmt, rs;
  try {
    conn = dbGetConnection_();
    countStmt = conn.prepareStatement(
      'SELECT COUNT(*) AS cnt FROM `manufacture_headers` WHERE `deleted_at` IS NULL'
    );
    countRs = countStmt.executeQuery();
    var total = countRs.next() ? countRs.getInt('cnt') : 0;
    // product_label lets the page show products.name_ar next to the raw product_id
    // so the user can understand which item the order is for.
    stmt = conn.prepareStatement(
      'SELECT `h`.*, `p`.`name_ar` AS `product_label` FROM `manufacture_headers` `h`' +
      ' LEFT JOIN `products` `p` ON `p`.`id` = `h`.`product_id`' +
      ' WHERE `h`.`deleted_at` IS NULL' +
      ' ORDER BY `h`.`id` DESC LIMIT ' + limit + ' OFFSET ' + offset
    );
    rs = stmt.executeQuery();
    var md = rs.getMetaData();
    var colCount = md.getColumnCount();
    var columns = [];
    for (var c = 1; c <= colCount; c++) { columns.push(md.getColumnLabel(c) || md.getColumnName(c)); }
    var rows = [];
    while (rs.next()) {
      var row = {};
      for (var i = 1; i <= colCount; i++) { var v = rs.getObject(i); row[columns[i-1]] = v !== null ? String(v) : null; }
      rows.push(row);
    }
    return { status: 'ok', columns: columns, rows: rows, total: total, limit: limit, offset: offset, loadedAll: loadAll };
  } catch (err) {
    Logger.log('dbManufactureList_ error: ' + err.message);
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
 * Return all footers for one header. data: { manufacture_header_id }.
 */
function dbManufactureGetFooters_(data, user) {
  data = data || {};
  var hid = String(data.manufacture_header_id !== null && data.manufacture_header_id !== undefined ? data.manufacture_header_id : '').trim();
  if (!hid) throw new Error('manufacture_header_id is required');
  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    // product_name_ar / product_code_ref / product_unit_ref come from the
    // products master so every inline shows the Arabic name next to the id.
    // (product_code / productUnit stay the stored snapshot on the footer row.)
    stmt = conn.prepareStatement(
      'SELECT `f`.*, `p`.`name_ar` AS `product_name_ar`,' +
      ' `p`.`code` AS `product_code_ref`, `p`.`unit` AS `product_unit_ref`' +
      ' FROM `manufacture_footers` `f`' +
      ' LEFT JOIN `products` `p` ON `p`.`id` = `f`.`product_id`' +
      ' WHERE `f`.`manufacture_header_id` = ? ORDER BY `f`.`id` ASC'
    );
    stmt.setObject(1, hid);
    rs = stmt.executeQuery();
    var md = rs.getMetaData();
    var colCount = md.getColumnCount();
    var columns = [];
    for (var c = 1; c <= colCount; c++) { columns.push(md.getColumnLabel(c) || md.getColumnName(c)); }
    var rows = [];
    while (rs.next()) {
      var row = {};
      for (var i = 1; i <= colCount; i++) { var v = rs.getObject(i); row[columns[i-1]] = v !== null ? String(v) : null; }
      rows.push(row);
    }
    return { status: 'ok', columns: columns, rows: rows, manufacture_header_id: hid };
  } catch (err) {
    Logger.log('dbManufactureGetFooters_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * UPDATE one manufacture_headers row by id.
 * read-only: id, created_at, updated_at.
 */
function dbManufactureUpdateHeader_(data, user) {
  data = data || {};
  var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
  if (!id) throw new Error('id is required');
  var RO = { 'id': true, 'created_at': true, 'updated_at': true };
  var updates = [], params = [];
  for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (RO[key]) continue;
    if (key.charAt(0) === '_') continue;
    var safeCol = dbSanitizeIdentifier_(key);
    var rawVal = data[key];
    updates.push(safeCol + ' = ?');
    params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
  }
  if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');
  params.push(id);
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement('UPDATE `manufacture_headers` SET ' + updates.join(', ') + ' WHERE `id` = ?');
    dbBindParams_(stmt, params);
    var affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbManufactureUpdateHeader_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Look up a product's code + unit from the products master.
 * Returns { code, unit } (nullable strings) or null when not found.
 * Caller must close the connection it opens — this helper takes an OPEN
 * connection so updates/inserts stay on one connection.
 */
function dbProductCodeUnit_(conn, productId) {
  var stmt = null, rs = null;
  try {
    stmt = conn.prepareStatement(
      'SELECT `code`, `unit` FROM `products` WHERE `id` = ? LIMIT 1'
    );
    stmt.setObject(1, productId);
    rs = stmt.executeQuery();
    if (rs.next()) {
      var c = rs.getObject(1), u = rs.getObject(2);
      return {
        code: c !== null ? String(c) : null,
        unit: u !== null ? String(u) : null
      };
    }
    return null;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
  }
}

/**
 * UPDATE one manufacture_footers row by id.
 * read-only: id, manufacture_header_id, created_at, updated_at.
 */
function dbManufactureUpdateFooter_(data, user) {
  data = data || {};
  var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
  if (!id) throw new Error('id is required');
  var RO = { 'id': true, 'manufacture_header_id': true, 'created_at': true, 'updated_at': true };
  var updates = [], params = [];
  for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (RO[key]) continue;
    if (key.charAt(0) === '_') continue;
    // product_code / productUnit are withdrawn automatically from products —
    // ignore client-sent values when product_id is being changed; the lookup
    // below overwrites them authoritatively.
    if ((key === 'product_code' || key === 'productUnit') && data.product_id) continue;
    var safeCol = dbSanitizeIdentifier_(key);
    var rawVal = data[key];
    updates.push(safeCol + ' = ?');
    params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
  }
  if (updates.length === 0 && !data.product_id) throw new Error('لا توجد حقول للتحديث');
  params.push(id);
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    // Authoritative auto-fill: changing product_id re-withdraws code/unit.
    var newPid = data.product_id !== null && data.product_id !== undefined
      ? String(data.product_id).trim() : '';
    if (newPid) {
      var ref = dbProductCodeUnit_(conn, newPid);
      if (ref) {
        updates.push('`product_code` = ?');
        params.splice(params.length - 1, 0, ref.code);
        updates.push('`productUnit` = ?');
        params.splice(params.length - 1, 0, ref.unit);
      }
    }
    if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');
    stmt = conn.prepareStatement('UPDATE `manufacture_footers` SET ' + updates.join(', ') + ' WHERE `id` = ?');
    dbBindParams_(stmt, params);
    var affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbManufactureUpdateFooter_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * INSERT a new manufacture_footers row (used for the copy-row feature).
 * data: { manufacture_header_id, product_id, product_code, productUnit,
 *         productQuantity, warehouse_id }
 * Returns { status:'ok', id: newId, manufacture_header_id }
 */
function dbManufactureInsertFooter_(data, user) {
  data = data || {};
  var hid = String(data.manufacture_header_id !== null && data.manufacture_header_id !== undefined ? data.manufacture_header_id : '').trim();
  if (!hid) throw new Error('manufacture_header_id is required');

  var ALLOWED = ['manufacture_header_id', 'product_id', 'product_code', 'productUnit', 'productQuantity', 'warehouse_id'];
  var insertCols = [], params = [];
  ALLOWED.forEach(function (col) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      insertCols.push(dbSanitizeIdentifier_(col));
      var rawVal = data[col];
      params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
    }
  });
  if (!insertCols.length) throw new Error('لا توجد بيانات للإدراج');

  var conn, stmt, idStmt, idRs;
  try {
    conn = dbGetConnection_();
    // Auto-withdraw code/unit from products when only product_id is supplied,
    // and default warehouse_id to 1. created_at/updated_at are left to the
    // DB CURRENT_TIMESTAMP defaults.
    var pidForLookup = data.product_id !== null && data.product_id !== undefined
      ? String(data.product_id).trim() : '';
    if (pidForLookup) {
      var ref = dbProductCodeUnit_(conn, pidForLookup);
      if (ref) {
        if (insertCols.indexOf('`product_code`') === -1) {
          insertCols.push('`product_code`');
          params.push(ref.code);
        }
        if (insertCols.indexOf('`productUnit`') === -1) {
          insertCols.push('`productUnit`');
          params.push(ref.unit);
        }
      }
    }
    if (insertCols.indexOf('`warehouse_id`') === -1) {
      insertCols.push('`warehouse_id`');
      params.push('1');
    }
    var sql = 'INSERT INTO `manufacture_footers` (' + insertCols.join(', ') + ') VALUES (' +
              insertCols.map(function () { return '?'; }).join(', ') + ')';
    stmt = conn.prepareStatement(sql);
    dbBindParams_(stmt, params);
    stmt.executeUpdate();
    idStmt = conn.prepareStatement('SELECT LAST_INSERT_ID() AS new_id');
    idRs   = idStmt.executeQuery();
    var newId = idRs.next() ? String(idRs.getLong('new_id')) : null;
    return { status: 'ok', id: newId, manufacture_header_id: hid };
  } catch (err) {
    Logger.log('dbManufactureInsertFooter_ error: ' + err.message);
    throw err;
  } finally {
    if (idRs)   idRs.close();
    if (idStmt) idStmt.close();
    if (stmt)   stmt.close();
    if (conn)   conn.close();
  }
}

/**
 * Label lists for the manufacture-orders forms: product options, warehouse
 * options, and the DISTINCT status values actually present in
 * manufacture_headers. Every candidate query is attempted defensively — the
 * products/warehouses table and column names are NOT guaranteed, so a miss
 * yields an empty list (the page falls back to free-text inputs) instead of
 * an error. Only the status list (known table + column) is required.
 * Returns { status:'ok', products:[{value,label}], warehouses:[...], statuses:[...] }.
 */
function dbManufactureRefs_(data, user) {
  var products = [], productsFull = [], warehouses = [], statuses = [];
  var conn;
  try {
    conn = dbGetConnection_();
    products = tryLabelList_(conn, [
      'SELECT `id`, `name_ar` AS `label` FROM `products` ORDER BY `id` ASC LIMIT 500',
      'SELECT `id`, `name` AS `label` FROM `products` ORDER BY `id` ASC LIMIT 500'
    ]);
    // Full option rows so the page can auto-fill code/unit on product change
    // and show the Arabic name next to raw product_id values.
    productsFull = tryFullList_(conn, [
      'SELECT `id`, `name_ar`, `code`, `unit` FROM `products` ORDER BY `id` ASC LIMIT 500'
    ]);
    warehouses = tryLabelList_(conn, [
      'SELECT `id`, `name_ar` AS `label` FROM `warehouses` ORDER BY `id` ASC LIMIT 500',
      'SELECT `id`, `name` AS `label` FROM `warehouses` ORDER BY `id` ASC LIMIT 500'
    ]);
    statuses = tryLabelList_(conn, [
      'SELECT DISTINCT `status` AS `label` FROM `manufacture_headers` WHERE `status` IS NOT NULL ORDER BY `status` ASC'
    ]);
    statuses = statuses.map(function (s) { return { value: s.label, label: s.label }; });
  } catch (err) {
    Logger.log('dbManufactureRefs_ error: ' + err.message);
    throw err;
  } finally {
    if (conn) conn.close();
  }
  return { status: 'ok', products: products, products_full: productsFull, warehouses: warehouses, statuses: statuses };
}

/**
 * Like tryLabelList_ but returns full rows { value, name_ar, code, unit } for
 * the products master. Misses → [] (page falls back to the plain label list).
 */
function tryFullList_(conn, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var stmt = null, rs = null;
    try {
      stmt = conn.prepareStatement(candidates[i]);
      rs = stmt.executeQuery();
      var out = [];
      while (rs.next()) {
        var v = rs.getObject(1), n = rs.getObject(2), c = rs.getObject(3), u = rs.getObject(4);
        out.push({
          value: v !== null ? String(v) : '',
          label: (n !== null ? String(n) : '') || (v !== null ? String(v) : ''),
          code: c !== null ? String(c) : '',
          unit: u !== null ? String(u) : ''
        });
      }
      return out;
    } catch (e) {
      /* candidate shape absent — try the next one */
    } finally {
      try { if (rs) rs.close(); } catch (e2) {}
      try { if (stmt) stmt.close(); } catch (e3) {}
    }
  }
  return [];
}

/**
 * Run each candidate SELECT in order; return rows of the first one that
 * executes ({value, label} stringified). All misses → []. One statement and
 * result set are open at a time and always closed, including on error paths.
 */
function tryLabelList_(conn, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var stmt = null, rs = null;
    try {
      stmt = conn.prepareStatement(candidates[i]);
      rs = stmt.executeQuery();
      var md = rs.getMetaData();
      var colCount = md.getColumnCount();
      var out = [];
      while (rs.next()) {
        var v = rs.getObject(1), l = colCount > 1 ? rs.getObject(2) : rs.getObject(1);
        out.push({
          value: v !== null ? String(v) : '',
          label: (l !== null ? String(l) : '') || (v !== null ? String(v) : '')
        });
      }
      return out;
    } catch (e) {
      /* candidate table/columns absent — try the next shape */
    } finally {
      try { if (rs) rs.close(); } catch (e2) {}
      try { if (stmt) stmt.close(); } catch (e3) {}
    }
  }
  return [];
}

// ─── manufacture soft-delete ──
//
// manufacture_headers HAS deleted_at → soft delete stores NOW() timestamp.
// manufacture_footers has NO deleted_at column (9 cols per schema) → footer
// lines are deleted with a real DELETE. Both are page-level authorized (no
// dbGuard_), exactly like the update/insert helpers above.

/**
 * Soft-delete one manufacture_headers row: SET deleted_at = NOW().
 * data: { id }. Only touches rows not already deleted.
 */
function dbManufactureSoftDeleteHeader_(data, user) {
  data = data || {};
  var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
  if (!id) throw new Error('id is required');
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'UPDATE `manufacture_headers` SET `deleted_at` = NOW(), `updated_at` = NOW()' +
      ' WHERE `id` = ? AND `deleted_at` IS NULL'
    );
    stmt.setObject(1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('السجل غير موجود أو محذوف مسبقاً');
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbManufactureSoftDeleteHeader_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Delete one manufacture_footers row by id.
 * NOTE: footers table has no deleted_at column, so this is a hard DELETE.
 */
function dbManufactureDeleteFooter_(data, user) {
  data = data || {};
  var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
  if (!id) throw new Error('id is required');
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement('DELETE FROM `manufacture_footers` WHERE `id` = ?');
    stmt.setObject(1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('البند غير موجود');
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbManufactureDeleteFooter_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── client_balance_sheets soft-delete (Top Chemical: tc_client_balance_sheets) ──

/**
 * Soft-delete one client_balance_sheets row: SET deleted_at = NOW().
 * data: { id }. Reads already exclude deleted_at IS NOT NULL rows.
 */
function dbClientBalanceSheetsDelete_(data, user) {
  data = data || {};
  var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
  if (!id) throw new Error('id is required');
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'UPDATE `client_balance_sheets` SET `deleted_at` = NOW(), `updated_at` = NOW()' +
      ' WHERE `id` = ? AND `deleted_at` IS NULL'
    );
    stmt.setObject(1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('السجل غير موجود أو محذوف مسبقاً');
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbClientBalanceSheetsDelete_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── products live table (Top Chemical: tc_products_live / اصناف النظام الرئيسي) ──
//
// products (17 cols): id, category_id, client_id, name_ar, name_en, code,
//   price, unit, quantity, number_of_cartons_bags, number_of_small_boxes,
//   product_unit_metric, active, manufacture_id, created_at, updated_at, deleted_at.
// Independent MySQL data beside the company sheets — same discipline as the
// client_balance_sheets block: paginated reads excluding soft-deleted rows,
// allowlist-free updates with read-only strip, soft-delete via NOW().

/**
 * Paginated or full list from the products table.
 * Soft-deleted rows (deleted_at IS NOT NULL) are excluded.
 *
 * Perf (tc_products_live Show All): the page turns pages of 50-100 instead of
 * pulling up to 1000 rows in one RPC. The whole response (rows + total) is
 * cached for DB_PRODUCTS_LIVE_TTL seconds under a version-stamped key, so page
 * turns inside the window cost zero JDBC round trips; any miss rebuilds from
 * MySQL and never returns an empty success. Full column set is kept on purpose:
 * the page's detail/edit modals render every column in S.columns.
 */
var DB_PRODUCTS_LIVE_TTL = 90;
var DB_PRODUCTS_LIVE_PAGE_MAX = 200;
var DB_PRODUCTS_LIVE_ALL_MAX = 1000;
var DB_PRODUCTS_LIVE_VER_KEY = 'dblive_products_ver';

function dbProductsLiveVer_() {
  try {
    var v = CacheService.getScriptCache().get(DB_PRODUCTS_LIVE_VER_KEY);
    return v || '0';
  } catch (e) { return '0'; }
}

function dbProductsLiveBust_() {
  try { CacheService.getScriptCache().put(DB_PRODUCTS_LIVE_VER_KEY, String(Date.now()), 21600); } catch (e) {}
}

function dbProductsLiveCacheGet_(key) {
  try {
    if (typeof getChunkedCache_ === 'function') return getChunkedCache_(key);
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function dbProductsLiveCachePut_(key, value) {
  try {
    if (typeof putChunkedCache_ === 'function') { putChunkedCache_(key, value, DB_PRODUCTS_LIVE_TTL); return; }
    CacheService.getScriptCache().put(key, JSON.stringify(value), DB_PRODUCTS_LIVE_TTL);
  } catch (e) {}
}

function dbProductsLiveList_(data, user) {
  data = data || {};
  var loadAll = !!(data.loadAll === true || data.loadAll === 'true' || data.loadAll === '1' || data.loadAll === 1);
  var limit = loadAll ? DB_PRODUCTS_LIVE_ALL_MAX : Math.min(Math.max(Number(data.limit) || 50, 1), DB_PRODUCTS_LIVE_PAGE_MAX);
  var offset = Math.max(Number(data.offset) || 0, 0);
  var cacheKey = 'dblive_products_v' + dbProductsLiveVer_() + '_l' + limit + '_o' + offset;
  var cached = dbProductsLiveCacheGet_(cacheKey);
  if (cached && cached.status === 'ok' && Array.isArray(cached.rows)) return cached;
  var conn, countStmt, countRs, stmt, rs;
  try {
    conn = dbGetConnection_();
    countStmt = conn.prepareStatement(
      'SELECT COUNT(*) AS cnt FROM `products` WHERE `deleted_at` IS NULL'
    );
    countRs = countStmt.executeQuery();
    var total = countRs.next() ? countRs.getInt('cnt') : 0;
    stmt = conn.prepareStatement(
      'SELECT `p`.*, `q`.`current_qty` AS `live_quantity` FROM `products` `p`' +
      ' LEFT JOIN `product_current_quantity` `q` ON `q`.`id` = `p`.`id`' +
      ' WHERE `p`.`deleted_at` IS NULL' +
      ' ORDER BY `p`.`id` DESC LIMIT ' + limit + ' OFFSET ' + offset
    );
    rs = stmt.executeQuery();
    var md = rs.getMetaData();
    var colCount = md.getColumnCount();
    var columns = [];
    for (var c = 1; c <= colCount; c++) { columns.push(md.getColumnLabel(c) || md.getColumnName(c)); }
    var rows = [];
    while (rs.next()) {
      var row = {};
      for (var i = 1; i <= colCount; i++) { var v = rs.getObject(i); row[columns[i-1]] = v !== null ? String(v) : null; }
      rows.push(row);
    }
    var out = { status: 'ok', columns: columns, rows: rows, total: total, limit: limit, offset: offset, loadedAll: loadAll };
    dbProductsLiveCachePut_(cacheKey, out);
    return out;
  } catch (err) {
    Logger.log('dbProductsLiveList_ error: ' + err.message);
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
 * UPDATE one products row by id. Everything is editable except the PK,
 * server-managed timestamps, and quantity — quantity is read-only live data
 * from the product_current_quantity view (see dbProductsLiveList_).
 */
function dbProductsLiveUpdate_(data, user) {
  data = data || {};
  var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
  if (!id) throw new Error('id is required');
  var readOnlyCols = { 'id': true, 'created_at': true, 'updated_at': true, 'quantity': true, 'live_quantity': true };
  var updates = [], params = [];
  for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (readOnlyCols[key]) continue;
    if (key.charAt(0) === '_') continue;
    var safeCol = dbSanitizeIdentifier_(key);
    var rawVal = data[key];
    updates.push(safeCol + ' = ?');
    params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
  }
  if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');
  params.push(id);
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement('UPDATE `products` SET ' + updates.join(', ') + ' WHERE `id` = ?');
    dbBindParams_(stmt, params);
    var affected = stmt.executeUpdate();
    dbProductsLiveBust_();
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbProductsLiveUpdate_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Soft-delete one products row: SET deleted_at = NOW().
 * data: { id }.
 */
function dbProductsLiveDelete_(data, user) {
  data = data || {};
  var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
  if (!id) throw new Error('id is required');
  var conn, stmt;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'UPDATE `products` SET `deleted_at` = NOW(), `updated_at` = NOW()' +
      ' WHERE `id` = ? AND `deleted_at` IS NULL'
    );
    stmt.setObject(1, id);
    var affected = stmt.executeUpdate();
    if (affected === 0) throw new Error('الصنف غير موجود أو محذوف مسبقاً');
    dbProductsLiveBust_();
    return { status: 'ok', affected: affected, id: id };
  } catch (err) {
    Logger.log('dbProductsLiveDelete_ error: ' + err.message);
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Product options for the tc_stock_scan page: id, name_ar and the
 * per-container quantity (number_of_cartons_bags) that pre-fills the count
 * form's الكمية بالعبوة الواحدة field. Soft-deleted rows are excluded.
 * Called via get_stock_scan_options, so page-level authority applies.
 */
function dbStockScanProducts_(data, user) {
  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'SELECT `id`, `name_ar`, `number_of_cartons_bags` FROM `products`' +
      ' WHERE `deleted_at` IS NULL ORDER BY `id` ASC'
    );
    rs = stmt.executeQuery();
    var products = [];
    while (rs.next()) {
      var id = rs.getObject(1);
      var perUnit = rs.getObject(3);
      products.push({
        value: id !== null ? String(id) : null,
        label: String(rs.getObject(2) || '').trim() || ('#' + id),
        per_unit: perUnit !== null && perUnit !== undefined ? String(perUnit) : ''
      });
    }
    return { status: 'ok', products: products };
  } catch (err) {
    Logger.log('dbStockScanProducts_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
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

// ─── Wider reads for the alerts tab and the precomputed index ───────────────
//
// dbBoxList_ is the PAGE's read and is clamped to 200 rows, which is right for
// something a human scrolls. The behavioural rules in Tier 3 need a population
// rather than a page — Benford alone is gated at 300 amounts — so they get
// their own bounded scan rather than a raised clamp on the page query.

var DB_BOX_SCAN_MAX = 8000;

/**
 * A bounded scan for the rules engine.
 *
 * data: { ref_date, months, limit, chart_of_accounts, responsible_person }
 *
 * ALL transaction types come back, unlike dbBoxItemHistory_: Tier 1 reasons
 * about duplicates, sequence and edit timestamps, which apply to a collection
 * exactly as much as to a payment. The rules that are about SPEND filter to
 * credit themselves, close to where that decision matters.
 *
 * `truncated` says the window was cut, so the page can report what it actually
 * analysed instead of implying it saw everything.
 */
function dbBoxAnalysisScan_(data, user) {
  data = data || {};
  var ref = dbBoxValidateDate_(data.ref_date);
  if (!ref) throw new Error('ref_date is required (YYYY-MM-DD)');
  var months = Math.min(Math.max(Number(data.months) || 12, 1), 60);
  var limit = Math.min(Math.max(Number(data.limit) || 3000, 1), DB_BOX_SCAN_MAX);
  var fromIso = BoxEngine.monthsBefore(ref, months);

  var conditions = ['`transaction_date` BETWEEN ? AND ?'];
  var params = [fromIso, ref];

  var acct = dbBoxValidateAccount_(data.chart_of_accounts);
  if (acct) { conditions.push('`chart_of_accounts` = ?'); params.push(acct); }
  var person = String(data.responsible_person === undefined || data.responsible_person === null ? '' : data.responsible_person).trim();
  if (person) { conditions.push('`responsible_person` LIKE ?'); params.push('%' + person + '%'); }

  var cols = DB_BOX_COLUMNS.map(dbSanitizeIdentifier_).join(', ');
  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'SELECT ' + cols + ' FROM ' + DB_BOX_TABLE +
      ' WHERE ' + conditions.join(' AND ') +
      ' ORDER BY `transaction_date` DESC, `id` DESC' +
      ' LIMIT ' + limit);
    dbBindParams_(stmt, params);
    rs = stmt.executeQuery();
    var rows = [];
    while (rs.next()) rows.push(dbBoxReadRow_(rs));
    return {
      status: 'ok', rows: rows, from: fromIso, to: ref, months: months,
      limit: limit, truncated: rows.length >= limit
    };
  } catch (err) {
    Logger.log('dbBoxAnalysisScan_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * MAX(updated_at) over the table — the cache key for the precomputed item
 * index. Any insert or edit moves it, so a stale index can never be served as
 * a fresh one, and nothing has to guess at a TTL.
 */
function dbBoxMaxUpdatedAt_(data, user) {
  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'SELECT MAX(`updated_at`) AS mx, COUNT(*) AS cnt FROM ' + DB_BOX_TABLE);
    rs = stmt.executeQuery();
    if (!rs.next()) return { status: 'ok', max_updated_at: null, count: 0 };
    var mx = rs.getObject(1);
    return {
      status: 'ok',
      max_updated_at: mx !== null ? String(mx) : null,
      count: Number(rs.getObject(2)) || 0
    };
  } catch (err) {
    Logger.log('dbBoxMaxUpdatedAt_ error: ' + err.message);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── Top Chemical executive sales (tc_exec_sales) ──
//
// Reads the `sales_product_qty_value` view joined to `products` for the metric
// divisor, plus the box net over `regular_box_movement` for the same date span.
// Same discipline as dbBoxWhere_/dbBoxList_/dbBoxAccountAggregates_: prepared
// statements, bound params, clamped limits, close rs/stmt/conn in finally.

function dbTcExecSalesValidateYears_(years) {
  var out = [];
  var src = years;
  if (src === undefined || src === null) src = [];
  if (!Array.isArray(src)) src = [src];
  for (var i = 0; i < src.length; i++) {
    var y = Number(src[i]);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error('سنة غير صحيحة: ' + src[i]);
    if (out.indexOf(y) === -1) out.push(y);
  }
  if (!out.length) throw new Error('السنوات مطلوبة (years[])');
  out.sort(function (a, b) { return a - b; });
  return out;
}

function dbTcExecSalesRows_(data, user) {
  data = data || {};
  var years = dbTcExecSalesValidateYears_(data.years);
  var months = [];
  if (data.months !== undefined && data.months !== null && data.months !== '') {
    var mSrc = Array.isArray(data.months) ? data.months : [data.months];
    for (var mi = 0; mi < mSrc.length; mi++) {
      var m = Number(mSrc[mi]);
      if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('شهر غير صحيح: ' + mSrc[mi]);
      if (months.indexOf(m) === -1) months.push(m);
    }
  }
  var search = String(data.search !== undefined && data.search !== null ? data.search : '').trim();
  var pids = [];
  if (data.product_ids !== undefined && data.product_ids !== null && data.product_ids !== '') {
    var pSrc = Array.isArray(data.product_ids) ? data.product_ids : [data.product_ids];
    for (var pi = 0; pi < pSrc.length; pi++) {
      var s = String(pSrc[pi]).trim();
      if (!s) continue;
      if (!/^\d{1,19}$/.test(s)) throw new Error('product_id غير صحيح: ' + pSrc[pi]);
      if (pids.indexOf(s) === -1) pids.push(s);
    }
  }
  var limit = Math.min(Math.max(Number(data.limit) || 3000, 1), 5000);
  var offset = Math.max(Number(data.offset) || 0, 0);
  var yearMarks = years.map(function () { return '?'; }).join(', ');
  var sql = 'SELECT v.sales_year, v.sales_month, v.product_id, v.name_ar, v.total_qty, v.return_qty, v.net_qty, v.total_value, v.return_value, v.net_value, v.currency, v.currency_ratio, p.product_unit_metric' +
    ' FROM sales_product_qty_value v LEFT JOIN products p ON p.id=v.product_id AND p.deleted_at IS NULL' +
    ' WHERE v.sales_year IN (' + yearMarks + ')';
  var params = years.slice();
  if (months.length) {
    sql += ' AND v.sales_month IN (' + months.map(function () { return '?'; }).join(', ') + ')';
    for (var k = 0; k < months.length; k++) params.push(months[k]);
  }
  if (pids.length) {
    sql += ' AND v.product_id IN (' + pids.map(function () { return '?'; }).join(', ') + ')';
    for (var q = 0; q < pids.length; q++) params.push(pids[q]);
  }
  if (search) {
    sql += ' AND (v.name_ar LIKE ? OR CAST(v.product_id AS CHAR) LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += ' ORDER BY v.sales_year DESC, v.sales_month DESC, v.product_id DESC LIMIT ' + limit + ' OFFSET ' + offset;

  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(sql);
    dbBindParams_(stmt, params);
    rs = stmt.executeQuery();
    var rows = [];
    while (rs.next()) {
      rows.push({
        sales_year: rs.getObject(1) !== null ? String(rs.getObject(1)) : null,
        sales_month: rs.getObject(2) !== null ? String(rs.getObject(2)) : null,
        product_id: rs.getObject(3) !== null ? String(rs.getObject(3)) : null,
        name_ar: rs.getObject(4) !== null ? String(rs.getObject(4)) : null,
        total_qty: rs.getObject(5) !== null ? String(rs.getObject(5)) : null,
        return_qty: rs.getObject(6) !== null ? String(rs.getObject(6)) : null,
        net_qty: rs.getObject(7) !== null ? String(rs.getObject(7)) : null,
        total_value: rs.getObject(8) !== null ? String(rs.getObject(8)) : null,
        return_value: rs.getObject(9) !== null ? String(rs.getObject(9)) : null,
        net_value: rs.getObject(10) !== null ? String(rs.getObject(10)) : null,
        currency: rs.getObject(11) !== null ? String(rs.getObject(11)) : null,
        currency_ratio: rs.getObject(12) !== null ? String(rs.getObject(12)) : null,
        product_unit_metric: rs.getObject(13) !== null ? String(rs.getObject(13)) : null
      });
    }
    return { status: 'ok', rows: rows, years: years, months: months, limit: limit, offset: offset, truncated: rows.length >= limit };
  } catch (err) {
    Logger.log('dbTcExecSalesRows_ error: ' + err.message + ' | years=' + JSON.stringify(years) + ' search=' + String(search || '').slice(0, 40) + ' limit=' + limit + ' offset=' + offset);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

var DB_TC_SALES_VIEW_COLUMNS = [
  'sales_year', 'sales_month', 'product_id', 'name_ar',
  'total_qty', 'return_qty', 'net_qty',
  'total_value', 'return_value', 'net_value',
  'currency', 'currency_ratio', 'product_unit_metric'
];

/**
 * Result caches for the tc_exec_sales split endpoints (permanent timeout fix).
 * get_sales_charts runs two full-view GROUP BYs with per-row DECIMAL casts —
 * recomputing them on every page view is what blew the 60s client budget, so
 * aggregates keep the EXEC_SALES_TTL precedent (600s). The paged list keeps
 * the DBLIVE-1 budget (90s). The view has no direct write path (it derives
 * from invoices/returns), so freshness is TTL-bounded and documented; both
 * endpoints honor opt-in data.refresh to force a rebuild. Chunked helpers are
 * referenced only behind typeof guards — this file ships unordered relative
 * to 02_DataAccess.js, same discipline as the products-live block.
 */
var DB_TC_SALES_CHARTS_TTL = 600;
var DB_TC_SALES_VIEW_TTL = 90;
var DB_TC_SALES_VER_KEY = 'dblive_sales_ver';

function dbTcSalesVer_() {
  try {
    var v = CacheService.getScriptCache().get(DB_TC_SALES_VER_KEY);
    return v || '0';
  } catch (e) { return '0'; }
}

function dbTcSalesCacheGet_(key) {
  try {
    if (typeof getChunkedCache_ === 'function') return getChunkedCache_(key);
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function dbTcSalesCachePut_(key, value, ttl) {
  try {
    if (typeof putChunkedCache_ === 'function') { putChunkedCache_(key, value, ttl); return; }
    CacheService.getScriptCache().put(key, JSON.stringify(value), ttl);
  } catch (e) {}
}

function dbTcSalesCacheKey_(kind, where, extra) {
  var q = String(where.search || '').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '').slice(0, 30);
  return 'dblive_sales_' + kind + '_v' + dbTcSalesVer_() +
    '_y' + (where.years || []).join('-') + '_q' + q + extra;
}

/**
 * Paginated view-only reader for the tc_exec_sales first iteration.
 * Copies the dbClientsArList_ discipline: one small COUNT + one small SELECT
 * sharing the same WHERE, limit 1..200 (default 50). No aggregation here —
 * the page renders exactly these rows plus per-row metric/EGP derivation.
 * data: { years[], search, limit, offset }
 * Returns { status:'ok', columns, rows, total, limit, offset }.
 */
function dbTcSalesViewWhere_(data) {
  data = data || {};
  var years = dbTcExecSalesValidateYears_(data.years);
  var search = String(data.search !== undefined && data.search !== null ? data.search : '').trim().slice(0, 40);
  var conditions = ['v.sales_year IN (' + years.map(function () { return '?'; }).join(', ') + ')'];
  var params = years.slice();
  if (search) {
    conditions.push('(v.name_ar LIKE ? OR CAST(v.product_id AS CHAR) LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%');
  }
  return { sql: ' WHERE ' + conditions.join(' AND '), params: params, years: years, search: search };
}

function dbTcSalesViewList_(data, user) {
  data = data || {};
  var where = dbTcSalesViewWhere_(data);
  var limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
  var offset = Math.max(Number(data.offset) || 0, 0);
  var cacheKey = dbTcSalesCacheKey_('view', where, '_l' + limit + '_o' + offset);
  if (!data.refresh) {
    var hit = dbTcSalesCacheGet_(cacheKey);
    if (hit && hit.status === 'ok' && Array.isArray(hit.rows)) return hit;
  }
  var cols = 'v.sales_year, v.sales_month, v.product_id, v.name_ar, v.total_qty, v.return_qty, v.net_qty, v.total_value, v.return_value, v.net_value, v.currency, v.currency_ratio, p.product_unit_metric';
  var from = ' FROM sales_product_qty_value v LEFT JOIN products p ON p.id=v.product_id AND p.deleted_at IS NULL';
  var conn, countStmt, countRs, stmt, rs;
  try {
    conn = dbGetConnection_();
    countStmt = conn.prepareStatement('SELECT COUNT(*) AS cnt' + from + where.sql);
    dbBindParams_(countStmt, where.params);
    countRs = countStmt.executeQuery();
    var total = countRs.next() ? countRs.getInt('cnt') : 0;
    stmt = conn.prepareStatement('SELECT ' + cols + from + where.sql +
      ' ORDER BY v.sales_year DESC, v.sales_month DESC, v.product_id DESC' +
      ' LIMIT ' + limit + ' OFFSET ' + offset);
    dbBindParams_(stmt, where.params);
    rs = stmt.executeQuery();
    var rows = [];
    while (rs.next()) {
      rows.push({
        sales_year: rs.getObject(1) !== null ? String(rs.getObject(1)) : null,
        sales_month: rs.getObject(2) !== null ? String(rs.getObject(2)) : null,
        product_id: rs.getObject(3) !== null ? String(rs.getObject(3)) : null,
        name_ar: rs.getObject(4) !== null ? String(rs.getObject(4)) : null,
        total_qty: rs.getObject(5) !== null ? String(rs.getObject(5)) : null,
        return_qty: rs.getObject(6) !== null ? String(rs.getObject(6)) : null,
        net_qty: rs.getObject(7) !== null ? String(rs.getObject(7)) : null,
        total_value: rs.getObject(8) !== null ? String(rs.getObject(8)) : null,
        return_value: rs.getObject(9) !== null ? String(rs.getObject(9)) : null,
        net_value: rs.getObject(10) !== null ? String(rs.getObject(10)) : null,
        currency: rs.getObject(11) !== null ? String(rs.getObject(11)) : null,
        currency_ratio: rs.getObject(12) !== null ? String(rs.getObject(12)) : null,
        product_unit_metric: rs.getObject(13) !== null ? String(rs.getObject(13)) : null
      });
    }
    var out = { status: 'ok', columns: DB_TC_SALES_VIEW_COLUMNS.slice(), rows: rows, total: total, limit: limit, offset: offset, years: where.years, search: where.search };
    dbTcSalesCachePut_(cacheKey, out, DB_TC_SALES_VIEW_TTL);
    return out;
  } catch (err) {
    Logger.log('dbTcSalesViewList_ error: ' + err.message + ' | years=' + JSON.stringify((where && where.years) || (data && data.years)) + ' search=' + String((where && where.search !== undefined ? where.search : data && data.search) || '').slice(0, 40) + ' limit=' + limit + ' offset=' + offset);
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
 * Full-scope aggregates for the exec-sales charts (one execution, three small
 * GROUP BY queries, tiny payload). Reuses dbTcSalesViewWhere_ so charts always
 * match the table filters (years + search). No LIMIT truncation: monthly is at
 * most 12×years rows; products capped at top 50 by value; products_yearly is
 * the per-product-per-year matrix for the YoY comparison, filtered to the
 * same top 50. EGP mirrors the page math: net_value × currency_ratio
 * (garbage/0/NULL → 1).
 */
function dbTcSalesCharts_(data, user) {
  data = data || {};
  var where = dbTcSalesViewWhere_(data);
  var cacheKey = dbTcSalesCacheKey_('charts', where, '');
  if (!data.refresh) {
    var hit = dbTcSalesCacheGet_(cacheKey);
    if (hit && hit.status === 'ok' && Array.isArray(hit.monthly) && Array.isArray(hit.products) && Array.isArray(hit.products_yearly)) return hit;
  }
  var from = ' FROM sales_product_qty_value v LEFT JOIN products p ON p.id=v.product_id AND p.deleted_at IS NULL';
  var rateSql = 'COALESCE(NULLIF(CAST(v.currency_ratio AS DECIMAL(19,6)),0),1)';
  var conn, stmtM, rsM, stmtP, rsP, stmtY, rsY;
  try {
    conn = dbGetConnection_();
    stmtM = conn.prepareStatement(
      'SELECT v.sales_year, v.sales_month,' +
      ' SUM(v.net_value * ' + rateSql + ') AS net_value_egp,' +
      ' SUM(v.net_qty) AS net_qty' + from + where.sql +
      ' GROUP BY v.sales_year, v.sales_month ORDER BY v.sales_year, v.sales_month');
    dbBindParams_(stmtM, where.params);
    rsM = stmtM.executeQuery();
    var monthly = [];
    while (rsM.next()) {
      monthly.push({
        year: Number(rsM.getObject(1)) || 0,
        month: Number(rsM.getObject(2)) || 0,
        net_value_egp: Number(rsM.getObject(3)) || 0,
        net_qty: Number(rsM.getObject(4)) || 0
      });
    }
    stmtP = conn.prepareStatement(
      'SELECT v.product_id, MAX(v.name_ar) AS name_ar,' +
      ' SUM(v.net_qty) AS net_qty,' +
      ' SUM(v.net_value * ' + rateSql + ') AS net_value_egp,' +
      ' MAX(p.product_unit_metric) AS metric_divisor' + from + where.sql +
      ' GROUP BY v.product_id ORDER BY net_value_egp DESC LIMIT 50');
    dbBindParams_(stmtP, where.params);
    rsP = stmtP.executeQuery();
    var products = [];
    while (rsP.next()) {
      products.push({
        product_id: rsP.getObject(1) !== null ? String(rsP.getObject(1)) : null,
        name_ar: rsP.getObject(2) !== null ? String(rsP.getObject(2)) : null,
        net_qty: Number(rsP.getObject(3)) || 0,
        net_value_egp: Number(rsP.getObject(4)) || 0,
        metric_divisor: rsP.getObject(5) !== null ? String(rsP.getObject(5)) : null
      });
    }
    // Per-year matrix for the YoY top-products comparison (same WHERE, same
    // connection). Rows filtered to the top-50 above so the payload stays tiny.
    var topIds = {};
    for (var ti = 0; ti < products.length; ti++) { topIds[String(products[ti].product_id)] = true; }
    stmtY = conn.prepareStatement(
      'SELECT v.product_id, v.sales_year,' +
      ' SUM(v.net_qty) AS net_qty,' +
      ' SUM(v.net_value * ' + rateSql + ') AS net_value_egp' + from + where.sql +
      ' GROUP BY v.product_id, v.sales_year');
    dbBindParams_(stmtY, where.params);
    rsY = stmtY.executeQuery();
    var products_yearly = [];
    while (rsY.next()) {
      var ypid = rsY.getObject(1) !== null ? String(rsY.getObject(1)) : null;
      if (!topIds[ypid]) continue;
      products_yearly.push({
        product_id: ypid,
        year: Number(rsY.getObject(2)) || 0,
        net_qty: Number(rsY.getObject(3)) || 0,
        net_value_egp: Number(rsY.getObject(4)) || 0
      });
    }
    var out = { status: 'ok', monthly: monthly, products: products, products_yearly: products_yearly, years: where.years, search: where.search };
    dbTcSalesCachePut_(cacheKey, out, DB_TC_SALES_CHARTS_TTL);
    return out;
  } catch (err) {
    Logger.log('dbTcSalesCharts_ error: ' + err.message + ' | years=' + JSON.stringify((where && where.years) || (data && data.years)) + ' search=' + String((where && where.search !== undefined ? where.search : data && data.search) || '').slice(0, 40));
    throw err;
  } finally {
    if (rsM) rsM.close();
    if (stmtM) stmtM.close();
    if (rsP) rsP.close();
    if (stmtP) stmtP.close();
    if (rsY) rsY.close();
    if (stmtY) stmtY.close();
    if (conn) conn.close();
  }
}

function dbTcExecBoxNet_(data, user) {
  data = data || {};
  var years = dbTcExecSalesValidateYears_(data.years);
  var months = [];
  if (data.months !== undefined && data.months !== null && data.months !== '') {
    var mSrc = Array.isArray(data.months) ? data.months : [data.months];
    for (var mi = 0; mi < mSrc.length; mi++) {
      var m = Number(mSrc[mi]);
      if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('شهر غير صحيح: ' + mSrc[mi]);
      if (months.indexOf(m) === -1) months.push(m);
    }
  }
  var minY = years[0], maxY = years[years.length - 1];
  var from, to;
  if (months.length) {
    var minM = Math.min.apply(null, months), maxM = Math.max.apply(null, months);
    from = minY + '-' + ('0' + minM).slice(-2) + '-01';
    var lastDay = new Date(maxY, maxM, 0).getDate();
    to = maxY + '-' + ('0' + maxM).slice(-2) + '-' + ('0' + lastDay).slice(-2);
  } else {
    from = minY + '-01-01';
    to = maxY + '-12-31';
  }
  var limit = Math.min(Math.max(Number(data.box_limit) || 300, 1), 1000);
  var conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement(
      'SELECT chart_of_accounts,' +
      " SUM(CASE WHEN transaction_type='debit' THEN transaction_amount WHEN transaction_type='credit' THEN -transaction_amount ELSE 0 END) AS net_amount," +
      " SUM(CASE WHEN transaction_type='debit' THEN transaction_amount ELSE 0 END) AS debit_sum," +
      " SUM(CASE WHEN transaction_type='credit' THEN transaction_amount ELSE 0 END) AS credit_sum," +
      ' COUNT(*) AS moves FROM `regular_box_movement`' +
      ' WHERE transaction_date BETWEEN ? AND ?' +
      " AND chart_of_accounts REGEXP '^[0-9]+$'" +
      ' AND CAST(chart_of_accounts AS UNSIGNED) BETWEEN 300000 AND 400000' +
      ' GROUP BY chart_of_accounts ORDER BY ABS(net_amount) DESC LIMIT ' + limit);
    dbBindParams_(stmt, [from, to]);
    rs = stmt.executeQuery();
    var accounts = [];
    while (rs.next()) {
      accounts.push({
        account: rs.getObject(1) !== null ? String(rs.getObject(1)) : null,
        net_amount: Number(rs.getObject(2)) || 0,
        debit_sum: Number(rs.getObject(3)) || 0,
        credit_sum: Number(rs.getObject(4)) || 0,
        moves: Number(rs.getObject(5)) || 0
      });
    }
    return { status: 'ok', from: from, to: to, accounts: accounts };
  } catch (err) {
    Logger.log('dbTcExecBoxNet_ error: ' + err.message + ' | years=' + JSON.stringify(years) + ' from=' + from + ' to=' + to + ' limit=' + limit);
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

