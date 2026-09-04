/* 07_Backup.js — Daily CSV cloud backup of all configured DB sheets (rolling 15 days). */

function dailyCsvBackup() {
  var cfg = (typeof DB_CONFIG !== 'undefined') ? DB_CONFIG : null;
  if (!cfg) return { ok: false, error: 'no DB_CONFIG' };
  var folder = getOrCreateCsvFolder_();
  if (!folder) return { ok: false, error: 'no backup folder (Drive API not enabled in project 45602854301?)' };
  var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyyMMdd');
  var count = 0, errors = [];
  Object.keys(cfg).forEach(function (dbName) {
    try {
      var ss = SpreadsheetApp.openById(cfg[dbName].id);
      ss.getSheets().forEach(function (sh) {
        var name = sh.getName();
        if (name.charAt(0) === '~') return; // skip temp/system sheets
        var csv = sheetToCsv_(sh);
        var fname = dbName + '_' + name + '_' + stamp + '.csv';
        try { folder.createFile(fname, csv, MimeType.CSV); count++; }
        catch (e2) { errors.push(fname + ': ' + e2.message); }
      });
    } catch (e) { errors.push(dbName + ': ' + e.message); }
  });
  try { pruneOldCsvBackups_(); } catch (e) {}
  return { ok: true, files: count, errors: errors };
}

function getOrCreateCsvFolder_() {
  var rootName = 'ERP_Backups_CSV';
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
