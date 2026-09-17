/* 07_Backup.js — Daily CSV cloud backup of all configured DB sheets (rolling 15 days). */

/**
 * Backup source catalog. Derived at call time from ERP_Companies so it can never
 * drift from the live company list, plus the AUTH spreadsheet itself (which holds
 * ERP_Users / ERP_Sessions / ERP_Record_History / SystemLog and is not a company).
 *
 * A globally-defined DB_CONFIG, if one ever exists, still wins — this function is
 * the fallback that makes dailyCsvBackup actually run. Before this existed,
 * DB_CONFIG was referenced but defined nowhere, so every invocation returned
 * {ok:false,error:'no DB_CONFIG'} and no backup was ever produced.
 *
 * @return {Object} map of backup name -> { id: spreadsheetId }
 */
function buildDbConfig_() {
  var cfg = { AUTH: { id: CONFIG.AUTH_SPREADSHEET_ID } };
  try {
    var rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
    rows.forEach(function (r) {
      var uid = String(r.company_unique_id || '').trim();
      if (!uid) return;
      var rawLink = String(r.company_sheet_link || '').trim();
      if (!rawLink) return;
      var m = rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
      var ssId = m ? m[1] : rawLink;
      if (!ssId) return;
      var label = String(r.company_name_en || '').trim() || uid;
      cfg[safeFileNamePart_(label)] = { id: ssId };
    });
  } catch (e) {
    // A failure here still leaves the AUTH spreadsheet backed up.
    console.error('buildDbConfig_ could not read ERP_Companies: ' + e.message);
  }
  return cfg;
}

/** Strips characters that are awkward inside a Drive file name. */
function safeFileNamePart_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[\/\\:*?"<>|]/g, '_').trim();
}

/* Public only because existing time-driven triggers bind by function name.
 * A google.script.run caller cannot supply the native trigger object, so fail
 * closed unless this invocation matches an installed trigger for this handler. */
function dailyCsvBackup(e) {
  if (!isVerifiedTimeTrigger_(e, 'dailyCsvBackup')) throw new Error('Time-trigger invocation required.');
  return dailyCsvBackup_();
}

function dailyCsvBackup_(opts) {
  var storage = systemStorageTarget_();
  var cfg = (typeof DB_CONFIG !== 'undefined' && DB_CONFIG) ? DB_CONFIG : buildDbConfig_();
  if (!cfg || !Object.keys(cfg).length) return { ok: false, error: 'no DB_CONFIG' };
  if (storage.backend === 'firestore') {
    var companyCfg = {};
    Object.keys(cfg).forEach(function (name) { if (name !== 'AUTH') companyCfg[name] = cfg[name]; });
    return { ok: false, backend: 'firestore', firestore: firestoreSystemBackupManifest_(), companyCsv: runCsvBackupConfig_(companyCfg) };
  }
  return runCsvBackupConfig_(cfg);
}

function runCsvBackupConfig_(cfg) {
  if (!cfg || !Object.keys(cfg).length) return { ok: true, files: 0, errors: [], skipped: [] };
  var folder = getOrCreateCsvFolder_();
  if (!folder) return { ok: false, error: 'no backup folder (Drive API not enabled in project 45602854301?)' };
  var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyyMMdd');
  var count = 0, errors = [], skipped = [];
  // Apps Script kills a trigger run at 6 minutes. Stop cleanly at 5 and report
  // what was not written, so a truncated backup is visible instead of silent.
  var deadline = new Date().getTime() + (5 * 60 * 1000);
  Object.keys(cfg).forEach(function (dbName) {
    try {
      var ss = SpreadsheetApp.openById(cfg[dbName].id);
      ss.getSheets().forEach(function (sh) {
        var name = sh.getName();
        if (name.charAt(0) === '~') return; // skip temp/system sheets
        if (new Date().getTime() > deadline) { skipped.push(dbName + '/' + name); return; }
        var csv = sheetToCsv_(sh);
        var fname = dbName + '_' + safeFileNamePart_(name) + '_' + stamp + '.csv';
        try { folder.createFile(fname, csv, MimeType.CSV); count++; }
        catch (e2) { errors.push(fname + ': ' + e2.message); }
      });
    } catch (e) { errors.push(dbName + ': ' + e.message); }
  });
  try { pruneOldCsvBackups_(); } catch (e) {}
  return { ok: skipped.length === 0 && errors.length === 0, files: count, errors: errors, skipped: skipped };
}

/* Native Firestore export is an operator/project operation, not a CSV copy.
 * Return an explicit manifest so the old AUTH spreadsheet is never mislabeled
 * as the system database backup. The actual export command is documented in
 * FIRESTORE_READ_WRITE_IMPLEMENTATION_RESULTS.md. */
function firestoreSystemBackupManifest_() {
  var c = systemStorageTarget_();
  return { ok: false, backend: 'firestore', projectId: c.projectId, databaseId: c.databaseId, collections: systemTableNames_(), error: 'FIRESTORE_EXPORT_REQUIRED: configure and run a native Firestore export to an approved bucket', companyCsv: 'not run by this system-backup operation' };
}

/* The routed operator command remains available through Code.js, where the
 * session and super-admin checks are established before this handler runs. */
function dailyCsvBackupRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  return dailyCsvBackup_();
}

/**
 * Resolves the backup folder, in order:
 *   1. Script Property BACKUP_FOLDER_ID  (set this for prod; keeps ids out of source)
 *   2. CONFIG.BACKUP_FOLDER_ID
 *   3. a Drive folder named ERP_Backups_CSV, created on first use
 */
function getOrCreateCsvFolder_() {
  var rootName = 'ERP_Backups_CSV';
  var folderId = '';
  try { folderId = PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID') || ''; } catch (e) {}
  if (!folderId) folderId = String(CONFIG.BACKUP_FOLDER_ID || '').trim();
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); }
    catch (e) { console.error('BACKUP_FOLDER_ID "' + folderId + '" is not reachable: ' + e.message); }
  }
  try {
    var it = DriveApp.getFoldersByName(rootName);
    if (it.hasNext()) return it.next();
    return DriveApp.createFolder(rootName);
  } catch (e) { return null; }
}

function csvCell_(v) {
  if (v === null || v === undefined) v = '';
  var s = String(v);
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function sheetToCsv_(sh) {
  var data = sh.getDataRange().getValues();
  if (!data.length) return '';
  return data.map(function (row) {
    return row.map(csvCell_).join(',');
  }).join('\r\n');
}

function pruneOldCsvBackups_(days) {
  var maxAge = days || 15;
  var folder = getOrCreateCsvFolder_();
  if (!folder) return;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAge);
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    try {
      if (f.getLastUpdated().getTime() < cutoff.getTime()) f.setTrashed(true);
    } catch (e) {}
  }
}

/**
 * Restore-test helper — run manually from the Apps Script editor.
 * Reads one backup CSV out of the backup folder and writes it into a brand-new
 * scratch spreadsheet. It never touches a live sheet. An untested backup is not
 * a backup; this is how you test it.
 *
 * @param {string} csvFileName exact file name, e.g. 'AUTH_ERP_Users_20260905.csv'
 * @return {Object} { ok, url } or { ok:false, error }
 */
function restoreCsvToScratchSpreadsheet_(csvFileName) {
  if (!csvFileName) return { ok: false, error: 'csvFileName is required' };
  var folder = getOrCreateCsvFolder_();
  if (!folder) return { ok: false, error: 'backup folder not reachable' };
  var it = folder.getFilesByName(csvFileName);
  if (!it.hasNext()) return { ok: false, error: 'file not found in backup folder: ' + csvFileName };
  var data = Utilities.parseCsv(it.next().getBlob().getDataAsString());
  if (!data.length) return { ok: false, error: 'csv is empty' };
  var width = data.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  var padded = data.map(function (r) {
    var out = r.slice();
    while (out.length < width) out.push('');
    return out;
  });
  var ss = SpreadsheetApp.create('RESTORE_TEST_' + csvFileName.replace(/\.csv$/i, ''));
  ss.getSheets()[0].getRange(1, 1, padded.length, width).setValues(padded);
  noteMutation_();
  return { ok: true, rows: padded.length, cols: width, url: ss.getUrl() };
}
