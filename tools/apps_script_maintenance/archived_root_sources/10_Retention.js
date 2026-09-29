/**
 * 10_Retention.js — Phase 5. Archiving for the two unbounded log sheets.
 *
 * F-12: ERP_Record_History gets ONE ROW PER CHANGED COLUMN PER EDIT, for all
 *       three companies, into a single sheet — and get_record_history reads all
 *       of it and filters in JS. It grows faster than any business table and the
 *       history panel gets permanently slower.
 * F-13: SystemLog stores JSON.stringify(result.data) — a whole record object —
 *       in ChangedFields, so it grows fast in BYTES, not just rows.
 *
 * What this does: moves rows older than CONFIG.ARCHIVE_RETENTION_MONTHS out of
 * the live tab into a dated archive tab in the SAME spreadsheet, with the SAME
 * columns. Nothing is deleted, no schema changes, no business table touched.
 * Archive tabs are the structural exception pre-authorised in the plan.
 *
 * RETENTION PERIOD IS AN ASSUMPTION — see CONFIG.ARCHIVE_RETENTION_MONTHS.
 *
 * Nothing here runs automatically until you install the trigger. Run
 * archiveOldRecords_({ dryRun: true }) first; it reports exactly what would move
 * and writes nothing.
 */

/** Sheets eligible for archiving: live tab -> the column holding its timestamp. */
var ARCHIVE_TARGETS = [
  { sheet: 'ERP_Record_History', dateColumn: 'changed_at' },
  { sheet: 'SystemLog', dateColumn: 'Timestamp' }
];

/**
 * Archives everything older than the retention period.
 *
 * @param {Object} opts { dryRun: true } to report without writing.
 * @return {Object} per-sheet counts
 */
/* Public only because an installed time trigger binds by handler name. */
function archiveOldRecords(e) {
  if (!isVerifiedTimeTrigger_(e, 'archiveOldRecords')) throw new Error('Time-trigger invocation required.');
  return archiveOldRecords_({});
}

function archiveOldRecords_(opts) {
  opts = opts || {};
  var months = Number(CONFIG.ARCHIVE_RETENTION_MONTHS) || 24;
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  if (systemStorageTarget_().backend === 'firestore') return archiveFirestoreCollections_(cutoff, !!opts.dryRun, months);

  var out = { retentionMonths: months, cutoff: cutoff.toISOString(), dryRun: !!opts.dryRun, sheets: [] };
  ARCHIVE_TARGETS.forEach(function (t) {
    try {
      out.sheets.push(archiveSheetRows_(CONFIG.AUTH_SPREADSHEET_ID, t.sheet, t.dateColumn, cutoff, !!opts.dryRun));
    } catch (e) {
      out.sheets.push({ sheet: t.sheet, error: e.message });
    }
  });
  try { Logger.log(JSON.stringify(out, null, 2)); } catch (e) {}
  return out;
}

function archiveFirestoreCollections_(cutoff, dryRun, months) {
  var result = { retentionMonths: months, cutoff: cutoff.toISOString(), dryRun: dryRun, collections: [] };
  [{ live: 'ERP_Record_History', archive: 'ERP_Record_History_Archive', date: 'changed_at' }, { live: 'SystemLog', archive: 'SystemLog_Archive', date: 'timestamp' }].forEach(function (spec) {
    try {
      var rows = systemStore_().queryAll(spec.live, {}).records, stale = rows.filter(function (r) { var d = new Date(r.data[spec.date] || r.data[String(spec.date).toLowerCase()]); return !isNaN(d.getTime()) && d.getTime() < cutoff.getTime(); });
      if (!dryRun) stale.forEach(function (r) { systemCreateRecord_(spec.archive, Object.assign({}, r.data, { archived_at: new Date(), archive_source_document: r.meta.documentId }), { operationId: 'archive:' + spec.live + ':' + r.meta.documentId }); systemRemoveRecord_(spec.live, r.meta.documentId, { expectedUpdateTime: r.meta.updateTime }); });
      result.collections.push({ collection: spec.live, archived: stale.length });
    } catch (e) { result.collections.push({ collection: spec.live, error: e.message }); }
  });
  return result;
}

/** Convenience: see what would move, write nothing. */
function archiveOldRecordsDryRun_() {
  return archiveOldRecords_({ dryRun: true });
}

/**
 * Moves rows older than `cutoff` from one sheet into <sheet>_Archive_<year> tabs.
 *
 * Order of operations matters and is deliberate: rows are written to the archive
 * FIRST and the write is verified by re-reading the archive tab's last row. Only
 * then is the live tab rewritten. If anything throws in between, the worst case
 * is rows existing in both places — recoverable — never rows existing in neither.
 *
 * Rows whose date is blank or unparseable are KEPT, never archived. Being unable
 * to date a row is not a reason to move it.
 */
function archiveSheetRows_(ssId, sheetName, dateColumn, cutoff, dryRun) {
  var ss = getSpreadsheet_(ssId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { sheet: sheetName, skipped: 'sheet not found' };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { sheet: sheetName, liveRows: 0, archived: 0 };

  var headers = data[0];
  var colCount = headers.length;
  var dateIdx = -1;
  for (var c = 0; c < colCount; c++) {
    if (String(headers[c]).trim().toLowerCase() === String(dateColumn).trim().toLowerCase()) { dateIdx = c; break; }
  }
  if (dateIdx === -1) return { sheet: sheetName, skipped: 'date column "' + dateColumn + '" not found' };

  var keep = [];
  var byYear = {};
  var undated = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var raw = row[dateIdx];
    var d = (raw instanceof Date) ? raw : (raw === '' || raw === null || raw === undefined ? null : new Date(raw));
    if (!d || isNaN(d.getTime())) { keep.push(row); undated++; continue; }
    if (d.getTime() >= cutoff.getTime()) { keep.push(row); continue; }
    var y = String(d.getFullYear());
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(row);
  }

  var years = Object.keys(byYear).sort();
  var archivedCount = years.reduce(function (n, y) { return n + byYear[y].length; }, 0);
  var result = {
    sheet: sheetName,
    liveRowsBefore: data.length - 1,
    archived: archivedCount,
    liveRowsAfter: keep.length,
    undatedKept: undated,
    archiveTabs: years.map(function (y) { return sheetName + '_Archive_' + y + ' (' + byYear[y].length + ')'; })
  };
  if (!archivedCount || dryRun) return result;

  executeWithLock_(function () {
    years.forEach(function (y) {
      var tabName = sheetName + '_Archive_' + y;
      var target = ss.getSheetByName(tabName);
      if (!target) {
        target = ss.insertSheet(tabName);
        noteMutation_();
        target.getRange(1, 1, 1, colCount).setValues([headers]);
        noteMutation_();
        target.setFrozenRows(1);
      }
      var rows = byYear[y];
      var startRow = target.getLastRow() + 1;
      var needed = startRow + rows.length - 1;
      if (needed > target.getMaxRows()) target.insertRowsAfter(target.getMaxRows(), needed - target.getMaxRows());
      noteMutation_();
      target.getRange(startRow, 1, rows.length, colCount).setValues(rows);
      noteMutation_();
      SpreadsheetApp.flush();
      // Verify before removing anything from the live tab.
      if (target.getLastRow() < needed) {
        throw new Error('archive write to ' + tabName + ' did not land; live sheet left untouched');
      }
    });

    // Rewrite the live body with the survivors, then clear the tail.
    var lastRow = sheet.getLastRow();
    if (keep.length) sheet.getRange(2, 1, keep.length, colCount).setValues(keep);
    noteMutation_();
    var firstStale = 2 + keep.length;
    if (lastRow >= firstStale) sheet.getRange(firstStale, 1, lastRow - firstStale + 1, colCount).clearContent();
    noteMutation_();
    SpreadsheetApp.flush();
  });

  return result;
}

/**
 * Reads history rows for one sheet out of the archive tabs. Used by
 * get_record_history when the caller passes include_archive:true, so archived
 * history is still reachable — just not on the default path.
 */
function readArchivedHistory_(sheetName, recordId, recordUid) {
  if (systemStorageTarget_().backend === 'firestore') {
    return systemGetAllRecords_('ERP_Record_History_Archive').filter(function (rec) {
      return String(rec.sheet_name) === String(sheetName) && (!recordId || String(rec.record_id) === String(recordId)) && (recordId || !recordUid || String(rec.record_uid) === String(recordUid));
    });
  }
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var out = [];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (name.indexOf('ERP_Record_History_Archive_') !== 0) return;
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0].map(function (h) { return String(h).trim(); });
    for (var i = 1; i < data.length; i++) {
      var rec = {};
      for (var c = 0; c < headers.length; c++) rec[headers[c]] = data[i][c];
      if (String(rec.sheet_name) !== String(sheetName)) continue;
      if (recordId && String(rec.record_id) !== String(recordId)) continue;
      if (!recordId && recordUid && String(rec.record_uid) !== String(recordUid)) continue;
      out.push(rec);
    }
  });
  return out;
}

/**
 * Route handler for 'archive_old_records'. Super-admin only, and DRY RUN unless
 * the caller explicitly passes confirm:true — this rewrites two log sheets.
 */
function archiveOldRecordsRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  var confirm = !!(payload && payload.confirm === true);
  return { status: 'success', data: archiveOldRecords_({ dryRun: !confirm }) };
}

/**
 * Installs the monthly archive trigger. Safe to run repeatedly — removes any
 * prior instance first. 02:00 on the 1st, outside working hours: the run reads
 * and rewrites two large sheets.
 */
function installRetentionTrigger_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'archiveOldRecords') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  ScriptApp.newTrigger('archiveOldRecords').timeBased().onMonthDay(1).atHour(2).create();
  return { status: 'success', message: 'تم تثبيت مؤقت الأرشفة الشهري' };
}
