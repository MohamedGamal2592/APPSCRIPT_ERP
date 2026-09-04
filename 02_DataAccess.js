/**
 * 02_DataAccess.js
 * RESPONSIBILITY: Generic sheet CRUD: getSheet_, getHeaders_, getAllRecords_,
 * addRecord_, updateRowByCriteria_, getNextId_ (lock-protected via executeWithLock_),
 * plus versioned-cache invalidation (bumpVersion_ / onEdit).
 * getNextId_ is the ONLY ID-assignment function in the project.
 * No business logic. Loaded third.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// WARNING: DO NOT send row indices to the client and trust them back for writes.
// The pattern getStockRevision_ → _sheetRow → updateStockRevision_ was FRAGILE
// because empty rows can shift indices. ALWAYS match by a business key
// (unique_id, product+date, etc.) server-side in the write function.
// ═══════════════════════════════════════════════════════════════════════════════

// Execution-scoped memoization so SpreadsheetApp.openById is called once per execution.
const _ssCache_ = {};

// Batch 1: request-scoped memoization for getAllRecords_(). Lives only for the
// duration of a single apiRouter_()/doGet execution (reset at entry) and is
// disabled entirely for mutating actions so a write can never be served stale
// data. Stores the raw getValues() 2D array; record objects are rebuilt on each
// read so callers may mutate them freely (identical behavior to before).
const _recordCache_ = {};
let _recordCacheDisabled_ = false;

// Batch 8: request-scoped memo of sheets already ensured this execution, so
// repeated ensureSheet_/settingsEnsureSheet_ calls (getSheetByName round trips)
// are paid at most once per sheet per request.
const _ensuredSheets_ = {};

function resetRecordCache_() {
  for (const k in _recordCache_) delete _recordCache_[k];
  for (const k in _ensuredSheets_) delete _ensuredSheets_[k];
  _recordCacheDisabled_ = false;
}

function disableRecordCache_() {
  _recordCacheDisabled_ = true;
  for (const k in _recordCache_) delete _recordCache_[k];
}

function buildRecordsFromRaw_(data, headers) {
  const records = [];
  for (let i = 1; i < data.length; i++) {
    const record = {};
    headers.forEach((h, colIdx) => {
      record[String(h).trim()] = data[i][colIdx] !== undefined ? data[i][colIdx] : '';
    });
    if (Object.values(record).some(v => String(v).trim() !== '')) records.push(record);
  }
  return records;
}

function getSpreadsheet_(ssId) {
  if (!_ssCache_[ssId]) _ssCache_[ssId] = SpreadsheetApp.openById(ssId);
  return _ssCache_[ssId];
}

function getSheet_(sheetName, ssId) {
  const sheet = getSpreadsheet_(ssId).getSheetByName(sheetName);
  if (!sheet) throw new Error('Database Error: Missing tab "' + sheetName + '" in spreadsheet ' + ssId + '.');
  return sheet;
}

const _headerCache_ = {};

function getHeaders_(sheet) {
  const key = sheet.getParent().getId() + '_' + sheet.getSheetId();
  if (!_headerCache_[key]) {
    const lastCol = sheet.getLastColumn();
    _headerCache_[key] = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  }
  return _headerCache_[key];
}

// Reentrant-safe script lock: a nested executeWithLock_ (e.g. an audit helper
// called from inside a company action that already holds the lock) runs its fn
// directly instead of re-acquiring, while still blocking other executions.
let _scriptLockHeld_ = false;

function executeWithLock_(fn, timeoutMs) {
  if (_scriptLockHeld_) return fn();
  _scriptLockHeld_ = true;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(timeoutMs || 5000);
    return fn();
  } finally {
    _scriptLockHeld_ = false;
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Retry wrapper for appending rows to handle concurrent writes.
 */
function appendRowWithRetry_(sheet, values, maxRetries = 3, delayMs = 1000) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      sheet.appendRow(values);
      return true;
    } catch (e) {
      attempt++;
      if (attempt > maxRetries) {
        throw new Error('Failed to append row after ' + maxRetries + ' attempts: ' + e.message);
      }
      Utilities.sleep(delayMs);
    }
  }
  return false;
}

/**
 * Internal counter logic — MUST be called while already holding the script lock
 * (i.e. from getNextId_ or addRecord_, never standalone).
 * Defensively creates the ID_Counter sheet if it does not exist yet.
 */
function getNextIdUnderLock_(dbId, tableName, idColumnName = 'id') {
  const ss = getSpreadsheet_(dbId);
  let sheet = ss.getSheetByName('ID_Counter');
  if (!sheet) {
    sheet = ss.insertSheet('ID_Counter');
    sheet.appendRow(['sheet_name', 'next_id']);
  }
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const nameIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'sheet_name');
  const nextIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'next_id');
  if (nameIdx === -1 || nextIdx === -1) {
    throw new Error('ID_Counter sheet missing required columns (sheet_name, next_id)');
  }
  let tableMax = 0;
  const tableSheet = ss.getSheetByName(tableName);
  if (tableSheet) {
    const tHeaders = getHeaders_(tableSheet);
    const idIdx = tHeaders.findIndex(h => String(h).trim().toLowerCase() === idColumnName.toLowerCase());
    if (idIdx !== -1) {
      const tData = tableSheet.getDataRange().getValues();
      for (let i = 1; i < tData.length; i++) {
        const v = Number(tData[i][idIdx]);
        if (Number.isInteger(v) && v > tableMax) tableMax = v;
      }
    }
  }
  const safeNext = tableMax + 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][nameIdx]).toLowerCase() === tableName.toLowerCase()) {
      const current = Number(data[i][nextIdx]);
      if (current <= tableMax) {
        sheet.getRange(i + 1, nextIdx + 1).setValue(safeNext + 1);
        return safeNext;
      }
      sheet.getRange(i + 1, nextIdx + 1).setValue(current + 1);
      return current;
    }
  }
  sheet.appendRow([tableName, safeNext + 1]);
  return safeNext;
}

/**
 * Canonical ID assignment. The ONLY public function that computes a new ID.
 * Lock-protected. Returns the current counter value and increments it.
 */
function getNextId_(dbId, tableName, idColumnName = 'id') {
  return executeWithLock_(function () {
    return getNextIdUnderLock_(dbId, tableName, idColumnName);
  });
}

/**
 * Read-only peek at the next ID for a table without incrementing it.
 * Used for UI display of "next ID" only — never for writes.
 */
function peekNextId_(dbId, tableName) {
  const sheet = getSheet_('ID_Counter', dbId);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const nameIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'sheet_name');
  const nextIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'next_id');
  if (nameIdx === -1 || nextIdx === -1) return 1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][nameIdx]).toLowerCase() === tableName.toLowerCase()) return data[i][nextIdx];
  }
  return 1;
}

/**
 * Batch ID assignment. Lock-protected. Returns the starting ID for `count`
 * consecutive IDs (caller uses startId, startId+1, ..., startId+count-1).
 */
function getNextIdBatch_(dbId, tableName, count, idColumnName = 'id') {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Count must be a positive integer');
  }
  
  return executeWithLock_(function () {
    const ss = getSpreadsheet_(dbId);
    let sheet = ss.getSheetByName('ID_Counter');
    if (!sheet) {
      sheet = ss.insertSheet('ID_Counter');
      sheet.appendRow(['sheet_name', 'next_id']);
    }
    const headers = getHeaders_(sheet);
    const data = sheet.getDataRange().getValues();
    const nameIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'sheet_name');
    const nextIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'next_id');
    if (nameIdx === -1 || nextIdx === -1) {
      throw new Error('ID_Counter sheet missing required columns (sheet_name, next_id)');
    }
    
    // Find current max in the table
    let tableMax = 0;
    const tableSheet = ss.getSheetByName(tableName);
    if (tableSheet) {
      const tHeaders = getHeaders_(tableSheet);
      const idIdx = tHeaders.findIndex(h => String(h).trim().toLowerCase() === idColumnName.toLowerCase());
      if (idIdx !== -1) {
        const tData = tableSheet.getDataRange().getValues();
        for (let i = 1; i < tData.length; i++) {
          const v = Number(tData[i][idIdx]);
          if (Number.isInteger(v) && v > tableMax) tableMax = v;
        }
      }
    }
    
    // Calculate starting ID and next counter value
    const startId = tableMax + 1;
    const nextCounter = startId + count;
    
    // Update or create counter in ID_Counter sheet
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][nameIdx]).toLowerCase() === tableName.toLowerCase()) {
        sheet.getRange(i + 1, nextIdx + 1).setValue(nextCounter);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([tableName, nextCounter]);
    }
    
    return startId;
  });
}

/**
 * Get all records from a sheet as an array of objects with lowercase keys.
 * Empty rows are filtered out. Does not touch any counter.
 */
function getAllRecords_(dbId, sheetName) {
  const sheet = getSheet_(sheetName, dbId);
  const headers = getHeaders_(sheet);
  if (!_recordCacheDisabled_) {
    const key = dbId + '|' + sheetName;
    const cached = _recordCache_[key];
    if (cached) return buildRecordsFromRaw_(cached.data, cached.headers);
    const data = sheet.getDataRange().getValues();
    _recordCache_[key] = { data: data, headers: headers };
    return buildRecordsFromRaw_(data, headers);
  }
  const data = sheet.getDataRange().getValues();
  return buildRecordsFromRaw_(data, headers);
}

/**
 * Add a record to a sheet. Assigns the ID via getNextIdUnderLock_ (the canonical
 * counter logic) inside a single lock acquisition — no nested locking.
 * All sheet writes must go through this or getNextId_.
 */
function addRecord_(dbId, sheetName, dataMap, requiredFields) {
  const missing = (requiredFields || []).filter(f => dataMap[f] === undefined || dataMap[f] === null || String(dataMap[f]).trim() === '');
  if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));

  return executeWithLock_(function () {
    const id = getNextIdUnderLock_(dbId, sheetName);
    const sheet = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = headers.map(h => {
      const key = String(h).trim().toLowerCase();
      if (key === 'id') return id;
      return dataMap[key] !== undefined ? dataMap[key] : '';
    });
    const newRowNumber = sheet.getLastRow() + 1;
    sheet.appendRow(rowValues);

    const savedRecord = {};
    headers.forEach((h, colIdx) => {
      savedRecord[String(h).trim().toLowerCase()] = rowValues[colIdx];
    });

    return {
      status: 'success',
      message: 'Record added successfully (row ' + newRowNumber + ')',
      data: { record: savedRecord, newRowNumber: newRowNumber, assignedId: id }
    };
  });
}

/**
 * Update a row by matching criteriaHeader == criteriaValue.
 * Uses a single batched setValues() write.
 */
function updateRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject) {
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) throw new Error('Criteria header "' + criteriaHeader + '" not found.');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) {
      const newRow = data[i].map((originalVal, colIdx) => {
        const header = headers[colIdx];
        const updateKey = Object.keys(updatesObject).find(k => k.trim().toLowerCase() === String(header).trim().toLowerCase());
        return updateKey !== undefined ? updatesObject[updateKey] : originalVal;
      });
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return true;
    }
  }
  return false;
}

/**
 * Delete all rows where criteriaHeader == criteriaValue.
 * Deletes bottom-up so earlier row indices stay valid. Returns count deleted.
 */
function deleteRowsByCriteria_(sheet, criteriaHeader, criteriaValue) {
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) return 0;
  let deleted = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][critIdx]).trim() === String(criteriaValue).trim()) {
      sheet.deleteRow(i + 1);
      deleted++;
    }
  }
  return deleted;
}

// ==========================================
// Canonical per-company reference-data cache (Part 1)
// ==========================================
/**
 * Canonical per-company reference-data cache. Every key is namespaced by
 * dbId, so one company's cached data can never be served to a request for
 * a different company — this is the ONLY caching helper any company's
 * Actions file should use for hot reference-data reads going forward.
 *
 * @param {string} dbId - the requesting company's own spreadsheet ID,
 *   always taken from the resolved company context of the CURRENT
 *   request — never from a raw client-supplied parameter (see Part 1b).
 * @param {string} kind - a short label for what's being cached, e.g.
 *   'categories', 'chart_of_accounts', 'products', 'parties'.
 * @param {number} ttlSeconds - how long to keep the cached value.
 * @param {function} builder - a zero-argument function that performs the
 *   actual (expensive) Sheets read when there's a cache miss.
 */
function getRefsCached_(dbId, kind, ttlSeconds, builder) {
  const cache = CacheService.getScriptCache();
  const key = 'refs_' + String(dbId) + '_' + String(kind);
  try {
    const cached = cache.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* fall through to rebuild */ }
  const value = builder();
  try { cache.put(key, JSON.stringify(value), ttlSeconds); } catch (e2) { /* cache write failures are non-fatal */ }
  return value;
}

/**
 * Invalidates one company's cached reference data for one kind. Call this
 * from every add_/edit_/delete_ action that mutates a sheet this helper
 * caches, immediately after the mutation succeeds.
 */
function invalidateRefsCache_(dbId, kind) {
  try { CacheService.getScriptCache().remove('refs_' + String(dbId) + '_' + String(kind)); } catch (e) {}
}

// ==========================================
// Versioned cache invalidation
// ==========================================
function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getParent().getId() !== CONFIG.AUTH_SPREADSHEET_ID) return;
    const sheetName = sheet.getName();
    if (sheetName === 'ERP_Users') bumpVersion_('ERP_Users');
    else if (sheetName === 'ERP_Companies') bumpVersion_('ERP_Companies');
    else if (sheetName === 'ERP_Pages_Matrix') bumpVersion_('ERP_Pages_Matrix');
    else if (sheetName === 'ERP_Information') bumpVersion_('ERP_Information');
    else if (sheetName === 'ERP_system_work') bumpVersion_('ERP_system_work');
  } catch (err) { console.error('onEdit version update failed: ' + err.message); }
}

function bumpVersion_(sheetName) {
  try {
    const cache = CacheService.getScriptCache();
    const now = String(new Date().getTime());
    if (sheetName === 'ERP_Users') cache.put('version_users', now);
    else if (sheetName === 'ERP_Companies') cache.put('version_companies', now);
    else if (sheetName === 'ERP_Pages_Matrix') cache.put('version_matrix', now);
    else if (sheetName === 'ERP_Information') cache.put('version_killswitch', now);
    else if (sheetName === 'ERP_system_work') cache.put('version_killswitch', now);
  } catch (e) {}
}

// ==========================================
// Audit trail helpers (B5) — multi-device sessions + Odoo-style history
// ==========================================
const AUDIT_COLUMNS = ['record_uid', 'created_by', 'created_at', 'updated_by', 'updated_at', 'approved_by', 'approved_at'];

function safeStr_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}

/**
 * Append one ERP_Record_History row per CHANGED business column.
 * `dbId` is the business sheet's spreadsheet; history is ALWAYS stored in the
 * AUTH spreadsheet's ERP_Record_History tab (created by batch1_createSystemSheets).
 * For 'create' logs every business column's new value; for update/approve/delete
 * logs only columns whose old/new differ.
 */
function logHistory_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues) {
  const histSheet = getSheet_('ERP_Record_History', CONFIG.AUTH_SPREADSHEET_ID);
  const targetSheet = getSheet_(sheetName, dbId);
  const allHeaders = getHeaders_(targetSheet).map(function (h) { return String(h).trim(); });
  const businessHeaders = allHeaders.filter(function (h) {
    const lc = h.toLowerCase();
    return AUDIT_COLUMNS.indexOf(lc) === -1 && lc !== 'id';
  });
  const rows = [];
  businessHeaders.forEach(function (col) {
    const nVal = newValues ? (newValues[col] !== undefined ? newValues[col] : '') : null;
    const oVal = oldValues ? (oldValues[col] !== undefined ? oldValues[col] : '') : null;
    if (action !== 'create' && safeStr_(nVal) === safeStr_(oVal)) return;
    rows.push({
      sheet_name: sheetName,
      record_uid: recordUid,
      record_id: recordId,
      action: action,
      column_name: col,
      old_value: safeStr_(oVal),
      new_value: safeStr_(nVal),
      changed_by: user || '',
      changed_at: new Date(),
      created_at: new Date()
    });
  });
  rows.forEach(function (hr) {
    addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Record_History', hr,
      ['sheet_name', 'record_uid', 'action', 'column_name', 'changed_by']);
  });
}

/**
 * Stamps audit fields onto a data map ONLY for columns that already exist in the
 * sheet. This prevents the audit trail from creating new columns in business
 * tables. Supported fields: user, created_by, created_at, updated_by,
 * updated_at, approved_by, approved_at, record_uid.
 */
function _stampExistingAuditCols_(sheet, target, stamps) {
  const headers = getHeaders_(sheet).map(function (h) { return String(h).trim().toLowerCase(); });
  function setIf(col, val) {
    if (val !== undefined && headers.indexOf(col.toLowerCase()) !== -1) target[col] = val;
  }
  setIf('user', stamps.user);
  setIf('created_by', stamps.created_by);
  setIf('created_at', stamps.created_at);
  setIf('updated_by', stamps.updated_by);
  setIf('updated_at', stamps.updated_at);
  setIf('approved_by', stamps.approved_by);
  setIf('approved_at', stamps.approved_at);
  setIf('record_uid', stamps.record_uid);
}

/**
 * Create or update a business row AND write its audit history.
 * existingRowId null => create (id assigned by addRecord_). Otherwise update by pkColumn.
 * oldRowByUid (optional) maps pkColumn value -> full record object, used to recover
 * record_uid and old values without an extra read.
 */
function saveRecordWithAudit_(sheetDbId, sheetName, existingRowId, dataMap, action, currentUser, auditCols, requiredFields, oldRowByUid, pkColumn) {
  const dbId = sheetDbId || CONFIG.AUTH_SPREADSHEET_ID;
  const pk = pkColumn || 'id';
  const sheet = getSheet_(sheetName, dbId);
  if (existingRowId == null) {
    const merged = Object.assign({}, dataMap);
    const uid = 'rec_' + Utilities.getUuid();
    _stampExistingAuditCols_(sheet, merged, {
      user: currentUser || '',
      created_by: currentUser || '',
      created_at: new Date(),
      updated_by: currentUser || '',
      updated_at: new Date(),
      approved_by: '',
      approved_at: '',
      record_uid: uid
    });
    const res = addRecord_(dbId, sheetName, merged, requiredFields);
    if (res.status !== 'success') return res;
    logHistory_(dbId, sheetName, uid, null, currentUser, action || 'create', merged, null);
    return res;
  }
  let old = oldRowByUid ? (oldRowByUid[String(existingRowId)] || null) : null;
  if (!old) {
    const rows = getAllRecords_(dbId, sheetName);
    old = rows.find(function (r) { return String(r[pk]) === String(existingRowId); }) || null;
  }
  const oldUid = old ? (old.record_uid || ('upd_' + sheetName + '_' + existingRowId)) : ('upd_' + sheetName + '_' + existingRowId);
  const newValues = Object.assign({}, old || {}, dataMap);
  _stampExistingAuditCols_(sheet, newValues, {
    user: currentUser || '',
    updated_by: currentUser || '',
    updated_at: new Date(),
    record_uid: oldUid
  });
  if (pk !== 'id') newValues[pk] = existingRowId;
  const ok = updateRowByCriteria_(sheet, pk, existingRowId, newValues);
  if (!ok) return { status: 'error', message: 'Row not found for update: ' + existingRowId };
  logHistory_(dbId, sheetName, oldUid, existingRowId, currentUser, action || 'update', newValues, old);
  return { status: 'success', data: { record: newValues, rowId: existingRowId } };
}

function approveRecordWithAudit_(sheetDbId, sheetName, rowId, approveMap, currentUser, auditCols, requiredFields, oldRowByUid, pkColumn) {
  const dbId = sheetDbId || CONFIG.AUTH_SPREADSHEET_ID;
  const pk = pkColumn || 'id';
  const sheet = getSheet_(sheetName, dbId);
  let old = oldRowByUid ? (oldRowByUid[String(rowId)] || null) : null;
  if (!old) {
    const rows = getAllRecords_(dbId, sheetName);
    old = rows.find(function (r) { return String(r[pk]) === String(rowId); }) || null;
  }
  const oldUid = old ? (old.record_uid || ('upd_' + sheetName + '_' + rowId)) : ('upd_' + sheetName + '_' + rowId);
  const merged = Object.assign({}, old || {}, approveMap);
  _stampExistingAuditCols_(sheet, merged, {
    approved_by: currentUser || '',
    approved_at: new Date(),
    updated_by: currentUser || '',
    updated_at: new Date(),
    record_uid: oldUid
  });
  if (pk !== 'id') merged[pk] = rowId;
  const ok = updateRowByCriteria_(sheet, pk, rowId, merged);
  if (!ok) return { status: 'error', message: 'Row not found for approve: ' + rowId };
  logHistory_(dbId, sheetName, oldUid, rowId, currentUser, 'approve', merged, old);
  return { status: 'success', data: { record: merged, rowId: rowId } };
}

function deleteRecordWithAudit_(sheetDbId, sheetName, rowId, currentUser, auditCols, oldRowByUid, pkColumn) {
  const dbId = sheetDbId || CONFIG.AUTH_SPREADSHEET_ID;
  const pk = pkColumn || 'id';
  const sheet = getSheet_(sheetName, dbId);
  let old = oldRowByUid ? (oldRowByUid[String(rowId)] || null) : null;
  if (!old) {
    const rows = getAllRecords_(dbId, sheetName);
    old = rows.find(function (r) { return String(r[pk]) === String(rowId); }) || null;
  }
  const oldUid = old ? (old.record_uid || ('del_' + sheetName + '_' + rowId)) : ('del_' + sheetName + '_' + rowId);
  logHistory_(dbId, sheetName, oldUid, rowId, currentUser, 'delete', null, old);
  const removed = deleteRowsByCriteria_(sheet, pk, rowId);
  return { status: 'success', removed: removed };
}