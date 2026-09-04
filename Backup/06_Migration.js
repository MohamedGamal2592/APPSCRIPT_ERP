/**
 * 06_Migration.js
 * ONE-TIME schema migration for Multi-Session + Audit Trail (Batches 0-3).
 * CODE-ONLY: run these manually in the Apps Script editor after deploying.
 * They MUTATE the live spreadsheets, so run batch0_preflight() first and
 * confirm CONFIG.BACKUP_FOLDER_ID is set (batch0_preflight warns if empty).
 *
 * Order:  batch0_preflight  ->  backupMainSpreadsheet  ->  batch1_createSystemSheets
 *        ->  batch2_addAuditColumns  ->  batch3_backfillAuditColumns
 */

function batch0_preflight() {
  const issues = [];
  if (!CONFIG.BACKUP_FOLDER_ID) {
    var hasFolder = false;
    try { hasFolder = DriveApp.getFoldersByName('Backup Folder').hasNext(); } catch (e) {}
    if (!hasFolder) issues.push('CONFIG.BACKUP_FOLDER_ID is empty and no "Backup Folder" Drive folder found — a new "Backup Folder" will be created for backups.');
  }
  try { getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID); } catch (e) { issues.push('Cannot open AUTH spreadsheet: ' + e.message); }
  try {
    ensureCompaniesRegistered_();
  } catch (e) { issues.push('ensureCompaniesRegistered_ failed: ' + e.message); }
  const companies = Object.keys(COMPANY_REGISTRY);
  return { status: 'success', companies: companies, issues: issues, ready: issues.length === 0 };
}

function _resolveBackupFolder_() {
  if (CONFIG.BACKUP_FOLDER_ID) {
    try { return DriveApp.getFolderById(CONFIG.BACKUP_FOLDER_ID); } catch (e) {}
  }
  var name = 'Backup Folder';
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

function backupMainSpreadsheet() {
  const folder = _resolveBackupFolder_();
  const file = DriveApp.getFileById(CONFIG.AUTH_SPREADSHEET_ID);
  const copy = file.makeCopy('ERP_Backup_' + Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyyMMdd_HHmmss'), folder);
  let meta = null;
  try {
    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    let m = ss.getSheetByName('ERP_System_Backups');
    if (!m) { m = ss.insertSheet('ERP_System_Backups'); m.appendRow(['backup_id', 'source', 'file_id', 'created_at']); }
    const bid = Utilities.getUuid();
    m.appendRow([bid, 'AUTH', copy.getId(), new Date()]);
    meta = bid;
  } catch (e) {}
  return { status: 'success', backup_file_id: copy.getId(), backup_id: meta };
}

function batch1_createSystemSheets() {
  const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  const defs = {
    'ERP_Sessions': ['token_hash', 'email', 'name', 'role', 'company', 'device_id', 'device_name', 'created_at', 'last_activity', 'expires_at', 'revoked', 'revoked_at'],
    'ERP_User_Devices': ['email', 'device_id', 'device_name', 'first_seen', 'last_seen'],
    'ERP_User_Views': ['view_id', 'email', 'page_action', 'view_name', 'layout_json', 'is_default', 'created_at', 'updated_at'],
    'ERP_Record_History': ['sheet_name', 'record_uid', 'record_id', 'action', 'column_name', 'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at'],
    'ERP_System_Backups': ['backup_id', 'source', 'file_id', 'created_at']
  };
  const created = [];
  Object.keys(defs).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(defs[name]);
      created.push(name);
    }
  });
  // ERP_Users.max_concurrent_sessions column
  const users = ss.getSheetByName('ERP_Users');
  if (users) {
    const uh = getHeaders_(users).map(function (h) { return String(h).trim().toLowerCase(); });
    if (uh.indexOf('max_concurrent_sessions') === -1) {
      const targetCol = users.getLastColumn() + 1;
      if (targetCol > users.getMaxColumns()) users.insertColumnAfter(users.getMaxColumns());
      users.getRange(1, targetCol).setValue('max_concurrent_sessions');
      created.push('ERP_Users.max_concurrent_sessions');
    }
  }
  return { status: 'success', created: created };
}

var _AUDIT_COLS_MIG_ = ['record_uid', 'created_by', 'created_at', 'updated_by', 'updated_at', 'approved_by', 'approved_at'];

function _companyDbIds_(companyKey) {
  ensureCompaniesRegistered_();
  return Object.keys(COMPANY_REGISTRY)
    .filter(function (k) { return !companyKey || k === companyKey; })
    .map(function (k) {
      try { return getCompanySpreadsheetId_(k); } catch (e) { return null; }
    }).filter(Boolean);
}

function batch2_addAuditColumns(opts) {
  const ck = opts && opts.companyKey;
  const dbs = [CONFIG.AUTH_SPREADSHEET_ID].concat(_companyDbIds_(ck));
  const skipSheets = ['ID_Counter', 'ERP_system_work', 'SystemLog', 'ERP_Sessions', 'ERP_User_Devices',
    'ERP_User_Views', 'ERP_Record_History', 'ERP_System_Backups', 'ERP_Companies',
    'ERP_Pages_Matrix', 'ERP_Information', 'ERP_Pages_Matrix'];
  const work = [];
  dbs.forEach(function (dbId) {
    let ss;
    try { ss = getSpreadsheet_(dbId); } catch (e) { return; }
    ss.getSheets().forEach(function (sheet) {
      const name = sheet.getName();
      if (skipSheets.indexOf(name) !== -1) return;
      const headers = getHeaders_(sheet).map(function (h) { return String(h).trim().toLowerCase(); });
      const missing = _AUDIT_COLS_MIG_.filter(function (c) { return headers.indexOf(c) === -1; });
      if (missing.length) work.push({ dbId: dbId, sheet: sheet, name: name, missing: missing });
    });
  });
  const offset = (opts && opts.offset) || 0;
  const limit = (opts && opts.limit) || 15;
  const slice = work.slice(offset, offset + limit);
  const touched = [];
  slice.forEach(function (w) {
    const sheet = w.sheet;
    let col = sheet.getMaxColumns();
    const n = w.missing.length;
    for (let k = 0; k < n; k++) { sheet.insertColumnAfter(col); col = sheet.getMaxColumns(); }
    const startC = col - n + 1;
    sheet.getRange(1, startC, 1, n).setValues([w.missing]);
    touched.push(w.name + ' (' + w.dbId.slice(0, 6) + ')');
  });
  return { status: 'success', touched: touched, processed: slice.length, remaining: Math.max(0, work.length - offset - limit), total: work.length };
}

function migrationInspect_() {
  const out = {};
  try {
    const uss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    const u = uss.getSheetByName('ERP_Users');
    out.erp_users_headers = u ? getHeaders_(u).map(function (h) { return String(h); }) : null;
    out.erp_users_rows = u ? u.getLastRow() : 0;
    out.erp_users_lastcol = u ? u.getLastColumn() : 0;
    out.erp_users_maxcol = u ? u.getMaxColumns() : 0;
    if (u) { const r1 = u.getRange(1, 1, 1, u.getMaxColumns()).getValues()[0]; out.erp_users_raw_row1 = r1.map(function (v, i) { return (i + 1) + ':' + JSON.stringify(v); }); out.has_mcs = r1.map(function(v){return String(v).trim().toLowerCase();}).indexOf('max_concurrent_sessions') !== -1; }
    const sys = ['ERP_Sessions', 'ERP_User_Devices', 'ERP_User_Views', 'ERP_Record_History', 'ERP_System_Backups'];
    out.system = {};
    sys.forEach(function (n) {
      const s = uss.getSheetByName(n);
      out.system[n] = s ? { exists: true, lastCol: s.getLastColumn(), lastRow: s.getLastRow() } : { exists: false };
    });
    out.auth_sheets = uss.getSheets().map(function (s) { return s.getName(); });
  } catch (e) { out.err = e.message; }
  return { status: 'success', inspect: out };
}

function batch3_backfillAuditColumns(opts) {
  const ck = opts && opts.companyKey;
  const dbs = [CONFIG.AUTH_SPREADSHEET_ID].concat(_companyDbIds_(ck));
  const skipSheets = ['ID_Counter', 'ERP_system_work', 'SystemLog', 'ERP_Sessions', 'ERP_User_Devices',
    'ERP_User_Views', 'ERP_Record_History', 'ERP_System_Backups'];
  const BLOCK = 1000;
  const blocks = [];
  dbs.forEach(function (dbId) {
    let ss;
    try { ss = getSpreadsheet_(dbId); } catch (e) { return; }
    ss.getSheets().forEach(function (sheet) {
      const name = sheet.getName();
      if (skipSheets.indexOf(name) !== -1) return;
      if (/^pivot/i.test(name)) return; // pivot-table sheets are read-only generated views
      const headers = getHeaders_(sheet).map(function (h) { return String(h).trim().toLowerCase(); });
      if (headers.indexOf('record_uid') === -1) return; // only sheets that received audit cols
      const uidIdx = headers.indexOf('record_uid');
      const cbIdx = headers.indexOf('created_by');
      const caIdx = headers.indexOf('created_at');
      const ubIdx = headers.indexOf('updated_by');
      const uaIdx = headers.indexOf('updated_at');
      const auditCols = [uidIdx, cbIdx, caIdx, ubIdx, uaIdx].filter(function (ci) { return ci !== -1; }).map(function (ci) { return { idx: ci, col: ci + 1 }; });
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      for (let s = 2; s <= lastRow; s += BLOCK) blocks.push({ dbId: dbId, name: name, startRow: s, endRow: Math.min(lastRow, s + BLOCK - 1), lastCol: lastCol, auditCols: auditCols, headers: headers });
    });
  });
  const offset = (opts && opts.offset) || 0;
  const limit = (opts && opts.limit) || 20;
  const slice = blocks.slice(offset, offset + limit);
  let count = 0;
  const errors = [];
  slice.forEach(function (b) {
    try {
      const sheet = getSheet_(b.name, b.dbId);
      const headers = b.headers;
      const uidIdx = headers.indexOf('record_uid');
      const cbIdx = headers.indexOf('created_by');
      const caIdx = headers.indexOf('created_at');
      const ubIdx = headers.indexOf('updated_by');
      const uaIdx = headers.indexOf('updated_at');
      const userColIdx = headers.indexOf('user');
      b.auditCols.forEach(function (ac) { try { sheet.getRange(1, ac.col, sheet.getMaxRows(), 1).clearDataValidations(); } catch (e) {} });
      const data = sheet.getRange(b.startRow, 1, b.endRow - b.startRow + 1, b.lastCol).getValues();
      const numRows = data.length;
      const arr = [];
      for (let i = 0; i < numRows; i++) {
        const row = data[i];
        let changed = false;
        const vals = {};
        if (uidIdx !== -1 && !row[uidIdx]) { vals[uidIdx] = 'rec_' + Utilities.getUuid(); changed = true; }
        if (cbIdx !== -1 && !row[cbIdx]) { vals[cbIdx] = (userColIdx !== -1 && row[userColIdx]) ? row[userColIdx] : 'system'; changed = true; }
        if (caIdx !== -1 && !row[caIdx]) {
          const candIdx = ['created_at', 'date', 'createddate', 'timestamp']
            .map(function (c) { return headers.indexOf(c); })
            .filter(function (x) { return x !== -1 && row[x]; })[0];
          vals[caIdx] = candIdx !== undefined ? row[candIdx] : new Date(); changed = true;
        }
        if (ubIdx !== -1 && !row[ubIdx]) { vals[ubIdx] = row[cbIdx] || 'system'; changed = true; }
        if (uaIdx !== -1 && !row[uaIdx]) { vals[uaIdx] = row[caIdx] || new Date(); changed = true; }
        if (changed) count++;
        const r = [];
        b.auditCols.forEach(function (ac) { r.push(vals[ac.idx] !== undefined ? vals[ac.idx] : row[ac.idx]); });
        arr.push(r);
      }
      if (b.auditCols.length) sheet.getRange(b.startRow, b.auditCols[0].col, numRows, b.auditCols.length).setValues(arr);
    } catch (e) { errors.push(b.name + ' [' + b.startRow + '-' + b.endRow + '] (' + b.dbId.slice(0, 6) + '): ' + e.message); }
  });
  return { status: 'success', backfilled_rows: count, processed: slice.length, remaining: Math.max(0, blocks.length - offset - limit), total: blocks.length, errors: errors };
}

/**
 * BATCH 4 (REVERSAL): remove the per-table audit columns that were wrongly
 * appended to company business sheets (and to ERP_Users / other auth sheets).
 * The audit trail must live ONLY in the new system tables (ERP_Record_History
 * etc.) inside the auth spreadsheet — NOT as columns on every working sheet.
 * Idempotent: deletes ONLY columns whose header is one of _AUDIT_COLS_MIG_.
 * Keeps ERP_Users.max_concurrent_sessions (session feature) and the 5 system
 * sheets. Non-destructive variant first so the operator can verify.
 */
function _auditReversalSkip_() {
  return ['ID_Counter', 'ERP_system_work', 'SystemLog', 'ERP_Sessions', 'ERP_User_Devices',
    'ERP_User_Views', 'ERP_Record_History', 'ERP_System_Backups'];
}

function batch4_inspectAuditColumns_(opts) {
  var o = (opts && opts.payload) ? opts.payload : (opts || {});
  const ck = o.companyKey;
  const dbs = [CONFIG.AUTH_SPREADSHEET_ID].concat(_companyDbIds_(ck));
  const skip = _auditReversalSkip_();
  const found = [];
  dbs.forEach(function (dbId) {
    let ss;
    try { ss = getSpreadsheet_(dbId); } catch (e) { return; }
    ss.getSheets().forEach(function (sheet) {
      const name = sheet.getName();
      if (skip.indexOf(name) !== -1) return;
      const headers = getHeaders_(sheet).map(function (h) { return String(h).trim().toLowerCase(); });
      const present = _AUDIT_COLS_MIG_.filter(function (c) { return headers.indexOf(c) !== -1; });
      if (present.length) found.push({ dbId: dbId.slice(0, 8), sheet: name, auditCols: present });
    });
  });
  return { status: 'success', count: found.length, sheets: found };
}

function batch4_removeAuditColumns_(opts) {
  var o = (opts && opts.payload) ? opts.payload : (opts || {});
  const ck = o.companyKey;
  const dbs = [CONFIG.AUTH_SPREADSHEET_ID].concat(_companyDbIds_(ck));
  const skip = _auditReversalSkip_();
  const work = [];
  dbs.forEach(function (dbId) {
    let ss;
    try { ss = getSpreadsheet_(dbId); } catch (e) { return; }
    ss.getSheets().forEach(function (sheet) {
      const name = sheet.getName();
      if (skip.indexOf(name) !== -1) return;
      const headers = getHeaders_(sheet).map(function (h) { return String(h).trim().toLowerCase(); });
      const idxs = _AUDIT_COLS_MIG_.map(function (c) { return headers.indexOf(c); }).filter(function (i) { return i !== -1; });
      if (idxs.length) work.push({ dbId: dbId, sheet: sheet, name: name, idxs: idxs });
    });
  });
  const offset = (o && o.offset) || 0;
  const limit = (o && o.limit) || 15;
  const slice = work.slice(offset, offset + limit);
  const touched = [];
  slice.forEach(function (w) {
    const sheet = w.sheet;
    const sorted = w.idxs.slice().sort(function (a, b) { return a - b; });
    const min = sorted[0], max = sorted[sorted.length - 1];
    if (max - min + 1 === sorted.length) {
      // contiguous block (the usual case) -> one batched delete
      sheet.deleteColumns(min + 1, sorted.length);
    } else {
      const cols = sorted.map(function (i) { return i + 1; }).sort(function (a, b) { return b - a; });
      cols.forEach(function (c) { sheet.deleteColumn(c); });
    }
    touched.push(w.name + ' (' + w.dbId.slice(0, 6) + '): removed ' + w.idxs.length);
  });
  return { status: 'success', touched: touched, processed: slice.length, remaining: Math.max(0, work.length - offset - limit), total: work.length };
}
