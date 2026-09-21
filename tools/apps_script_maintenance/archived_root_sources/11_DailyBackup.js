/**
 * 11_DailyBackup.js
 * RESPONSIBILITY: automated daily full-spreadsheet backups (one copy per
 * company database), 10-day trash retention, per-backup logging, and a
 * super-admin one-click zip download. Additive only — no business logic here.
 *
 * Mapping to the prompt: the "ERP Information spreadsheet" is the AUTH
 * spreadsheet (CONFIG.AUTH_SPREADSHEET_ID), which is where ERP_System_Backups
 * already lives by project convention (see batch1_createSystemSheets in
 * Backup/06_Migration.js). The log sheet is created with its header row if
 * it is somehow missing.
 *
 * Ground rules honored:
 *  - Reads/copies sources only. No write/edit/delete call against any source
 *    spreadsheet exists in this file — only DriveApp makeCopy / export reads.
 *  - No spreadsheet IDs are hardcoded: BACKUP_SOURCES lists company registry
 *    keys (stable identifiers, same as target_system values used across the
 *    client), and IDs are resolved at runtime via getCompanySpreadsheetId_().
 *  - One source failing never stops the others (per-source try/catch).
 */

/* ── Config: everything in one place. Adding a source = one line here. ── */
var BACKUP_SOURCES = [
  { companyKey: '3fe1b5cb67b7223e', name: 'TopChemical' },
  { companyKey: '8df5c89a117fe9a5', name: 'TopLight' },
  { companyKey: '9940659bd83035d7', name: 'ValleyFoods' },
  { companyKey: '32fafd256ccb7a1c', name: 'AssessmentCenter' }
];
var BACKUP_FOLDER_NAME = 'ERP_Daily_Backups';
var BACKUP_RETENTION_DAYS = 10;
var BACKUP_LOG_SHEET = 'ERP_System_Backups';
var BACKUP_LOG_HEADERS = ['backup_id', 'source', 'file_id', 'created_at'];
/* google.script.run responses cap at ~50MB. Above this we refuse to build the
 * download and say so, instead of silently truncating the archive. */
var BACKUP_DOWNLOAD_MAX_BYTES = 40 * 1024 * 1024;

/**
 * Find the persistent backup folder by name; create it once if missing.
 * getFoldersByName returns the existing folder on every later run, so this
 * can never create a duplicate.
 */
function getOrCreateBackupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

/** Resolve BACKUP_SOURCES to [{ name, spreadsheetId }]. Never throws as a
 *  whole: a company that fails to resolve is reported per-source instead. */
function resolveBackupSources_() {
  return BACKUP_SOURCES.map(function (entry) {
    try {
      var ssId = getCompanySpreadsheetId_(entry.companyKey);
      if (!ssId) throw new Error('empty spreadsheet id');
      return { name: entry.name, spreadsheetId: ssId, error: null };
    } catch (e) {
      return { name: entry.name, spreadsheetId: null, error: e.message };
    }
  });
}

/** Return the log sheet in the AUTH spreadsheet, creating it (with header)
 *  only if it does not exist yet. Never touches any other spreadsheet. */
function ensureBackupLogSheet_() {
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(BACKUP_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BACKUP_LOG_SHEET);
    sheet.appendRow(BACKUP_LOG_HEADERS);
    noteMutation_();
  }
  return sheet;
}

/** Append one log row under a single lock acquisition: the backup_id comes
 *  from the canonical getNextIdUnderLock_ pattern (max(backup_id)+1), so no
 *  second ID scheme is introduced. */
function appendBackupLogRow_(source, fileId) {
  return executeWithLock_(function () {
    var sheet = ensureBackupLogSheet_();
    var backupId = getNextIdUnderLock_(CONFIG.AUTH_SPREADSHEET_ID, BACKUP_LOG_SHEET, 'backup_id');
    sheet.appendRow([backupId, source, fileId, new Date()]);
    noteMutation_();
    try { noteTableChange_(CONFIG.AUTH_SPREADSHEET_ID, BACKUP_LOG_SHEET); } catch (e) {}
    return backupId;
  });
}

/**
 * Copy every configured source spreadsheet into the backup folder and log
 * each success. Per-source try/catch: one failure is collected and the run
 * continues with the rest.
 */
function runDailyBackup_() {
  var folder = getOrCreateBackupFolder_();
  var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd_HHmm');
  var sources = resolveBackupSources_();
  var backedUp = [];
  var failures = [];
  sources.forEach(function (src) {
    if (!src.spreadsheetId) {
      failures.push({ source: src.name, step: 'resolve', error: src.error || 'unresolvable' });
      return;
    }
    var fileId = null;
    try {
      var copy = DriveApp.getFileById(src.spreadsheetId)
        .makeCopy(src.name + '_Backup_' + stamp, folder);
      fileId = copy.getId();
    } catch (e) {
      failures.push({ source: src.name, step: 'copy', error: e.message });
      return;
    }
    try {
      var backupId = appendBackupLogRow_(src.name, fileId);
      backedUp.push({ source: src.name, backup_id: backupId, file_id: fileId });
    } catch (e) {
      failures.push({ source: src.name, step: 'log', file_id: fileId, error: e.message });
    }
  });
  return { status: failures.length ? 'partial' : 'success', backedUp: backedUp, failures: failures };
}

/**
 * Trash backup-folder files older than BACKUP_RETENTION_DAYS (recoverable
 * from Drive Trash — not permanent deletion). Scoped strictly to the backup
 * folder: source spreadsheets are never listed, let alone trashed.
 */
function purgeOldBackups_() {
  var folder = getOrCreateBackupFolder_();
  var cutoff = new Date().getTime() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var trashed = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    try {
      if (f.getLastUpdated().getTime() < cutoff) {
        trashed.push(f.getName());
        f.setTrashed(true);
      }
    } catch (e) {}
  }
  return { status: 'success', trashed: trashed };
}

/**
 * Single trigger entry point. Public only because time-driven triggers bind
 * by function name — same fail-closed pattern as dailyCsvBackup in 07_Backup.
 */
function dailyBackupJob_(e) {
  if (!isVerifiedTimeTrigger_(e, 'dailyBackupJob_')) throw new Error('Time-trigger invocation required.');
  var backup = runDailyBackup_();
  var purge = null;
  /* Purge only after a fully successful backup day. */
  if (backup.status === 'success') {
    try {
      purge = purgeOldBackups_();
    } catch (e) {
      purge = { status: 'error', error: e.message };
    }
  } else {
    purge = { status: 'skipped', reason: 'backup day had failures; retention run deferred' };
  }
  return { status: backup.status, backup: backup, purge: purge };
}

/**
 * One-time setup (run manually from the script editor, not on deploy):
 * delete any existing trigger for the daily job, then schedule ~2 AM daily.
 * Safe to re-run — it cannot create a duplicate.
 */
function installDailyBackupTrigger_() {
  /* The ~2 AM schedule is only correct in Africa/Cairo. Fail the setup loudly
   * if the project time zone was ever changed, instead of backing up silently
   * at the wrong hour. (Confirmed: project time zone is Africa/Cairo.) */
  try {
    var tz = Session.getScriptTimeZone();
    if (tz && tz !== 'Africa/Cairo') {
      throw new Error('Project time zone is "' + tz + '" — set it to Africa/Cairo (Project Settings) before installing the 2 AM trigger.');
    }
  } catch (e) {
    if (String(e.message || '').indexOf('Project time zone') === 0) throw e;
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBackupJob_') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  ScriptApp.newTrigger('dailyBackupJob_').timeBased().atHour(2).everyDays(1).create();
  return { status: 'success', message: 'تم تثبيت مؤقت النسخ الاحتياطي اليومي (~2 صباحاً)' };
}

/** Route form of the one-time setup, super-admin only. */
function installDailyBackupTriggerRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  return installDailyBackupTrigger_();
}

/** Latest logged file_id per source (max created_at wins). Read-only. */
function latestBackupFileIds_() {
  var sheet = ensureBackupLogSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iSource = headers.indexOf('source');
  var iFile = headers.indexOf('file_id');
  var iCreated = headers.indexOf('created_at');
  var latest = {};
  for (var r = 1; r < values.length; r++) {
    var source = String(values[r][iSource] || '').trim();
    var fileId = String(values[r][iFile] || '').trim();
    if (!source || !fileId) continue;
    var when = values[r][iCreated] instanceof Date
      ? values[r][iCreated].getTime()
      : new Date(values[r][iCreated]).getTime();
    if (!latest[source] || when > latest[source].when) {
      latest[source] = { file_id: fileId, when: when };
    }
  }
  return latest;
}

/** Export one backed-up spreadsheet as .xlsx bytes via the Drive export
 *  endpoint. A native Google Sheet has no usable getBlob() — UrlFetchApp
 *  export is required (same note as the prompt's implementation detail). */
function exportBackupAsXlsx_(fileId, name) {
  var resp = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + fileId + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) {
    throw new Error('xlsx export failed for ' + name + ' (HTTP ' + resp.getResponseCode() + ')');
  }
  return resp.getBlob().setName(name + '.xlsx');
}

/**
 * Super-admin route: bundle each source's latest backup xlsx into ONE zip
 * and return it as base64 for a single browser download. Fail-closed on the
 * role check before any export happens. Oversize archives are reported, not
 * truncated.
 */
function sysDownloadBackupsRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  var latest = latestBackupFileIds_();
  var names = Object.keys(latest);
  if (!names.length) throw new Error('لا توجد نسخ احتياطية مسجلة بعد');
  var blobs = [];
  var failures = [];
  names.forEach(function (source) {
    try {
      blobs.push(exportBackupAsXlsx_(latest[source].file_id, source));
    } catch (e) {
      failures.push({ source: source, error: e.message });
    }
  });
  if (!blobs.length) throw new Error('تعذر تصدير أي نسخة احتياطية');
  var totalBytes = blobs.reduce(function (sum, b) { return sum + b.getBytes().length; }, 0);
  if (totalBytes > BACKUP_DOWNLOAD_MAX_BYTES) {
    return {
      status: 'too_large',
      bytes: totalBytes,
      limit: BACKUP_DOWNLOAD_MAX_BYTES,
      sources: names,
      message: 'حجم النسخ يتجاوز حد الاستجابة الواحدة — يلزم تنزيل مجزأ'
    };
  }
  var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
  var zip = Utilities.zip(blobs, 'ERP_Backups_' + stamp + '.zip');
  return {
    status: 'success',
    filename: 'ERP_Backups_' + stamp + '.zip',
    base64: Utilities.base64Encode(zip.getBytes()),
    sources: names,
    failures: failures
  };
}
