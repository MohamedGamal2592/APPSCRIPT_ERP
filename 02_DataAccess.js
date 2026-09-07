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

// Phase 0b instrumentation: how many real Sheets value-reads this execution paid
// for. Counted at the data-layer read sites only, so it undercounts any company
// code that calls getDataRange().getValues() directly — it is a floor, not a
// total. Reported in the SystemLog SheetReads column.
let _sheetsReadCount_ = 0;

function countSheetRead_() { _sheetsReadCount_++; }

function getSheetsReadCount_() { return _sheetsReadCount_; }

function resetRecordCache_() {
  for (const k in _recordCache_) delete _recordCache_[k];
  for (const k in _ensuredSheets_) delete _ensuredSheets_[k];
  _recordCacheDisabled_ = false;
  _sheetsReadCount_ = 0;
  for (const k in _pkIndexCache_) delete _pkIndexCache_[k];
  // Per-execution authority memos (see authGeneration_ / isSystemEnabled_).
  // Called at the top of both doGet and apiRouter_, so every request starts
  // with a freshly-read generation.
  _genMemo_ = null;
  _ksMemo_ = null;
}

function disableRecordCache_() {
  _recordCacheDisabled_ = true;
  for (const k in _recordCache_) delete _recordCache_[k];
  for (const k in _pkIndexCache_) delete _pkIndexCache_[k];
}

/**
 * Phase 9 (F-01, conservative variant). Clear and RE-ENABLE the memo, without
 * touching the Phase 0b read counter or the ensured-sheets memo.
 *
 * apiRouter_ calls this once more immediately before the handler runs. The
 * preamble before it authenticates and may TOUCH the session row, and that write
 * would otherwise reach noteMutation_ and cost the handler its memo because of a
 * write the handler does not care about. Re-arming instead of leaving it
 * disabled is safe: the memo is empty at that point, so nothing in it can
 * predate the preamble's writes.
 */
function rearmRecordCache_() {
  for (const k in _recordCache_) delete _recordCache_[k];
  for (const k in _pkIndexCache_) delete _pkIndexCache_[k];
  _recordCacheDisabled_ = false;
}

/**
 * Phase 9 (F-01, conservative variant) — the whole of it, in one function.
 *
 * The memo used to be switched OFF for the entire request as soon as the router
 * saw a non-read action, so a save handler that legitimately reads six sheets
 * paid six full getDataRange().getValues() with zero reuse. The concern behind
 * that was real: a memo taken BEFORE a write must never be served AFTER it.
 *
 * The cure is narrower than the disease. The memo now starts ENABLED, and the
 * FIRST mutation of the request turns it off — clearing it — for the remainder
 * of that request. So:
 *   - reads before any write are memoised and reused;
 *   - the instant anything is written, the memo is emptied and stays off,
 *     exactly as today;
 *   - therefore no read can ever be served from a memo taken before a write it
 *     did not see. The memo is either younger than every write so far, or gone.
 *
 * Over-calling this is always SAFE — it only ever costs a cache, never
 * correctness — which is why it is called liberally, including at sites that may
 * not strictly need it.
 */
function noteMutation_() {
  if (_recordCacheDisabled_) return;   // already off for this request
  disableRecordCache_();
}

/**
 * Phase 9, defence in depth — see the guard in getAllRecords_.
 *
 * Set by apiRouter_ for any request whose effective action is not a read. On a
 * pure read request nothing writes at all, so the guard would be paying two
 * metadata round trips per memo hit to protect against a write that cannot
 * happen; it stays off there and the read path is exactly as fast as before.
 */
let _guardMemoHits_ = false;

function setMemoGuard_(on) { _guardMemoHits_ = !!on; }

/**
 * F-02.1: the empty-row test used to be Object.values(record).some(v =>
 * String(v).trim() !== ''), i.e. a second full pass over every cell, allocating
 * an array and coercing every value to a string — after already having built the
 * object. On a 20-column x 10,000-row sheet that is ~200,000 needless string
 * coercions per call.
 *
 * Now the row is tested directly on the raw array before any object is built.
 * Same predicate, same result — a row counts as non-empty iff at least one cell
 * is a non-blank string once trimmed — but it short-circuits on the first
 * non-empty cell and skips object construction entirely for blank rows.
 *
 * Trimmed header names are hoisted out of the loop too; they were being
 * recomputed for every row.
 */
function buildRecordsFromRaw_(data, headers) {
  const records = [];
  if (!data || data.length < 2) return records;
  const keys = headers.map(h => String(h).trim());
  const colCount = keys.length;
  // Headers that trim to the same name (including several blank ones) collapse
  // onto one object key, and the LAST such column wins. The old emptiness test
  // ran over Object.values(record), so it only ever saw those surviving columns.
  // testCols reproduces that exact set, so filtering is unchanged.
  const lastColForKey = {};
  for (let c = 0; c < colCount; c++) lastColForKey[keys[c]] = c;
  const testCols = Object.keys(lastColForKey).map(k => lastColForKey[k]);
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let hasValue = false;
    for (let t = 0; t < testCols.length; t++) {
      const v = row[testCols[t]];
      // Reproduces String(v).trim() !== '' exactly. Note the two traps:
      //   undefined -> the old code substituted '' at assignment, so it is EMPTY;
      //   null      -> String(null) is 'null', so it is NOT empty.
      // Everything else (0, false, a Date) stringifies non-blank and is not empty.
      if (v === undefined || v === '') continue;
      if (typeof v === 'string') { if (v.trim() !== '') { hasValue = true; break; } continue; }
      hasValue = true;
      break;
    }
    if (!hasValue) continue;
    const record = {};
    for (let c = 0; c < colCount; c++) {
      record[keys[c]] = row[c] !== undefined ? row[c] : '';
    }
    records.push(record);
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
    countSheetRead_();
    _headerCache_[key] = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  }
  return _headerCache_[key];
}

/**
 * Writes a sheet formula into the cell at (rowNumber, headerName).
 * GLOBAL scope (not inside any IIFE) so every company namespace
 * (ValleyFoods, TopLight, TopChemical, HR modules) can call it.
 */
function writeFormula_(dbId, sheetName, rowNumber, headerName, formula) {
  const sheet = getSheet_(sheetName, dbId);
  const headers = getHeaders_(sheet);
  const idx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === headerName.toLowerCase(); });
  if (idx !== -1) {
    var cell = sheet.getRange(rowNumber, idx + 1);
    if (typeof cell.setFormula === 'function') {
      cell.setFormula(formula);
      noteMutation_();
    } else {
      cell.setValue(formula);
      noteMutation_();
    }
  }
}

/**
 * Phase 8 (F-04). Merge a { headerName: formulaString } map into a row array
 * that is ABOUT to be written, so the formulas ride along in the same setValues
 * instead of costing a writeFormula_ round trip each.
 *
 * setValues() treats a string beginning with '=' as a formula, exactly as
 * appendRow() and setFormula() already do throughout this codebase, so the cells
 * end up as formulas with identical text. This is the same equivalence Phase 3
 * rests on.
 *
 * Mutates and returns rowValues. A header the map names but the sheet does not
 * have is skipped, matching writeFormula_'s `if (idx !== -1)`.
 */
function applyRowFormulas_(rowValues, headers, formulaMap) {
  const idx = {};
  // First match wins, exactly as writeFormula_'s findIndex does, so a sheet with
  // two columns trimming to the same header name behaves identically.
  headers.forEach(function (h, i) {
    const k = String(h).trim().toLowerCase();
    if (idx[k] === undefined) idx[k] = i;
  });
  Object.keys(formulaMap).forEach(function (name) {
    const i = idx[String(name).trim().toLowerCase()];
    if (i !== undefined) rowValues[i] = formulaMap[name];
  });
  return rowValues;
}

/**
 * Phase 8 (F-04). Write a { headerName: formulaString } map onto a row that has
 * ALREADY been written and so cannot be merged into.
 *
 * Replaces N x writeFormula_, each of which paid its own getSheet_ +
 * getHeaders_ + setFormula: the sheet and its headers are passed in once, and
 * columns that happen to be adjacent are written as a single setValues. Only the
 * named columns are touched — exactly what the individual setFormula calls did —
 * so nothing else on the row is read or rewritten.
 */
function writeRowFormulas_(sheet, headers, rowNum, formulaMap) {
  const idx = {};
  // First match wins, exactly as writeFormula_'s findIndex does, so a sheet with
  // two columns trimming to the same header name behaves identically.
  headers.forEach(function (h, i) {
    const k = String(h).trim().toLowerCase();
    if (idx[k] === undefined) idx[k] = i;
  });
  const cols = [];
  Object.keys(formulaMap).forEach(function (name) {
    const i = idx[String(name).trim().toLowerCase()];
    if (i !== undefined) cols.push({ i: i, f: formulaMap[name] });
  });
  if (!cols.length) return;
  cols.sort(function (a, b) { return a.i - b.i; });

  let run = [cols[0]];
  for (let k = 1; k <= cols.length; k++) {
    const cur = cols[k];
    if (cur && cur.i === run[run.length - 1].i + 1) { run.push(cur); continue; }
    sheet.getRange(rowNum, run[0].i + 1, 1, run.length)
      .setValues([run.map(function (c) { return c.f; })]);
    noteMutation_();
    if (cur) run = [cur];
  }
}

/**
 * Phase 8 (F-04). Grow the grid so a block ending at `lastNeeded` fits.
 * appendRow() did this implicitly; a precomputed target range does not, and
 * setValues() past getMaxRows() throws.
 */
function ensureGridRows_(sheet, lastNeeded) {
  const max = sheet.getMaxRows();
  if (lastNeeded > max) sheet.insertRowsAfter(max, lastNeeded - max);
  noteMutation_();
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
      noteMutation_();
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
    noteMutation_();
    sheet.appendRow(['sheet_name', 'next_id']);
    noteMutation_();
  }
  const headers = getHeaders_(sheet);
  countSheetRead_();
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
      countSheetRead_();
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
        noteMutation_();
        return safeNext;
      }
      sheet.getRange(i + 1, nextIdx + 1).setValue(current + 1);
      noteMutation_();
      return current;
    }
  }
  sheet.appendRow([tableName, safeNext + 1]);
  noteMutation_();
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
  countSheetRead_();
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
      noteMutation_();
      sheet.appendRow(['sheet_name', 'next_id']);
      noteMutation_();
    }
    const headers = getHeaders_(sheet);
    countSheetRead_();
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
        countSheetRead_();
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
        noteMutation_();
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([tableName, nextCounter]);
      noteMutation_();
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
    if (cached) {
      // Phase 9, defence in depth. The conservative variant is only as good as
      // noteMutation_'s coverage of the 183 direct write sites, and a missed one
      // would show up as a stale read INSIDE a save handler — silent, and
      // expensive. So on a request that CAN write, a memo entry is reused only
      // if the sheet still has the same shape.
      //
      // getLastRow/getLastColumn are metadata calls, not a values read, so this
      // costs a small fraction of a rebuild, and it independently catches an
      // append or a delete that reached the sheet without going through
      // noteMutation_. It does NOT catch an in-place update of an existing cell;
      // that case rests on coverage alone.
      //
      // On a read request the guard is off (setMemoGuard_), because nothing can
      // write, so the read path pays nothing for it.
      if (!_guardMemoHits_) return buildRecordsFromRaw_(cached.data, cached.headers);
      const cRows = cached.data.length;
      const cCols = cRows ? cached.data[0].length : 0;
      if (sheet.getLastRow() === cRows && sheet.getLastColumn() === cCols) {
        return buildRecordsFromRaw_(cached.data, cached.headers);
      }
      delete _recordCache_[key];
    }
    countSheetRead_();
    const data = sheet.getDataRange().getValues();
    _recordCache_[key] = { data: data, headers: headers };
    return buildRecordsFromRaw_(data, headers);
  }
  countSheetRead_();
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
    noteMutation_();

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
  countSheetRead_();
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
      noteMutation_();
      return true;
    }
  }
  return false;
}

/**
 * Delete all rows where criteriaHeader == criteriaValue.
 * Deletes bottom-up so earlier row indices stay valid. Returns count deleted.
 *
 * PERF: matching rows are removed in CONTIGUOUS BLOCKS — one deleteRows(start,
 * n) per run rather than one deleteRow() per row. Exactly the same rows go, in
 * the same bottom-up order, and the same count comes back; the only difference
 * is the number of round trips. That matters because the rows this is used on
 * are almost always contiguous (a document's lines are appended together), so
 * a 40-line purchase went from 40 API calls to 1, and each deleteRow on a
 * 20 000-row sheet also forced Sheets to shift every row beneath it.
 */
function deleteRowsByCriteria_(sheet, criteriaHeader, criteriaValue) {
  const headers = getHeaders_(sheet);
  countSheetRead_();
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) return 0;

  /* 1-based sheet row numbers, ascending. */
  const target = [];
  const want = String(criteriaValue).trim();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][critIdx]).trim() === want) target.push(i + 1);
  }
  if (!target.length) return 0;

  let deleted = 0;
  let end = target.length - 1;
  while (end >= 0) {
    let start = end;
    while (start > 0 && target[start - 1] === target[start] - 1) start--;
    const count = end - start + 1;
    sheet.deleteRows(target[start], count);
    noteMutation_();
    deleted += count;
    end = start - 1;
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
  const key = 'refs_' + String(dbId) + '_' + String(kind);
  try {
    const cached = getChunkedCache_(key);
    if (cached !== null) return cached;
  } catch (e) { /* fall through to rebuild */ }
  const value = builder();
  try { putChunkedCache_(key, value, ttlSeconds); } catch (e2) { /* cache write failures are non-fatal */ }
  return value;
}

// ==========================================
// Chunked CacheService (Phase 6 — harvested from 04_TableEngine.js)
// ==========================================
/**
 * CacheService rejects any single value over ~100 KB. getRefsCached_ used to do
 * a plain cache.put inside a try/catch, so for a large reference list — a big
 * products or parties table — the put threw, was swallowed, and the cache
 * SILENTLY NEVER WORKED: every call rebuilt from a full sheet read. The bigger
 * the company, the less the cache helped.
 *
 * 04_TableEngine.js had a correct chunked implementation (manifest + numbered
 * chunk keys) that nothing could reach, because that whole engine was dead code
 * (F-17). It is harvested here, generalised, before the engine is deleted.
 *
 * Layout: '<key>__m' holds {n, ts}; '<key>__c0..cN' hold the JSON slices.
 * Any missing chunk is treated as a total miss, so a partial eviction can never
 * produce a truncated value.
 */
function chunkedCacheKeys_(key) {
  const safe = String(key).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 200);
  return { manifest: safe + '__m', prefix: safe + '__c' };
}

function putChunkedCache_(key, value, ttlSeconds) {
  try {
    const keys = chunkedCacheKeys_(key);
    const cache = CacheService.getScriptCache();
    const payload = JSON.stringify(value);
    const chunkSize = CONFIG.TABLE_CACHE_CHUNK_SIZE || 90000;
    const maxChunks = CONFIG.TABLE_CACHE_MAX_CHUNKS || 50;
    if (payload.length > maxChunks * chunkSize) return false;   // too big to cache; not an error
    const chunks = [];
    for (let i = 0; i < payload.length; i += chunkSize) chunks.push(payload.slice(i, i + chunkSize));
    removeChunkedCache_(key);   // drop older chunks so a shrinking value leaves no tail
    const put = {};
    chunks.forEach(function (c, i) { put[keys.prefix + i] = c; });
    put[keys.manifest] = JSON.stringify({ n: chunks.length, ts: new Date().getTime() });
    cache.putAll(put, ttlSeconds);
    return true;
  } catch (e) { return false; }
}

/** @return the cached value, or null on any miss. */
function getChunkedCache_(key) {
  try {
    const keys = chunkedCacheKeys_(key);
    const cache = CacheService.getScriptCache();
    const manifestRaw = cache.get(keys.manifest);
    if (!manifestRaw) return null;
    const manifest = JSON.parse(manifestRaw);
    if (!manifest || !manifest.n) return null;
    const chunkKeys = [];
    for (let i = 0; i < manifest.n; i++) chunkKeys.push(keys.prefix + i);
    const map = cache.getAll(chunkKeys);
    let payload = '';
    for (let i = 0; i < manifest.n; i++) {
      const ck = keys.prefix + i;
      if (map[ck] === undefined || map[ck] === null) return null;   // any miss → full rebuild
      payload += map[ck];
    }
    return JSON.parse(payload);
  } catch (e) { return null; }
}

function removeChunkedCache_(key) {
  try {
    const keys = chunkedCacheKeys_(key);
    const all = [keys.manifest];
    const maxChunks = CONFIG.TABLE_CACHE_MAX_CHUNKS || 50;
    for (let i = 0; i < maxChunks; i++) all.push(keys.prefix + i);
    CacheService.getScriptCache().removeAll(all);
  } catch (e) {}
}

// ==========================================
// O(1) primary-key lookup (Phase 6 — harvested from 04_TableEngine.js)
// ==========================================
/**
 * Returns { rows, byPk, pks, headers } for a sheet, with byPk a Map giving O(1)
 * lookup by primary key. Callers that repeatedly do
 * rows.find(r => String(r.id) === String(x)) inside a loop are O(n*m); this
 * makes them O(n+m).
 *
 * Built on getAllRecords_, so it shares the request memo and is counted by the
 * Phase 0b SheetReads instrumentation — unlike the TableEngine original, which
 * kept a second parallel read path and its own cache.
 *
 * Both the raw and lowercased key are registered, matching the original.
 */
const _pkIndexCache_ = {};

function getRecordsByPk_(dbId, sheetName, pkColumn) {
  const pkLc = String(pkColumn || 'id').trim().toLowerCase();
  const key = dbId + '|' + sheetName + '|' + pkLc;
  if (_pkIndexCache_[key]) return _pkIndexCache_[key];

  const rows = getAllRecords_(dbId, sheetName);
  const headers = getHeaders_(getSheet_(sheetName, dbId)).map(function (h) { return String(h).trim(); });
  let pkHeader = null;
  headers.forEach(function (h) { if (h.toLowerCase() === pkLc) pkHeader = h; });

  const byPk = new Map();
  const pks = [];
  rows.forEach(function (r) {
    const raw = pkHeader !== null && r[pkHeader] !== undefined ? r[pkHeader] : r[pkLc];
    const pk = String(raw == null ? '' : raw).trim();
    if (!pk) return;
    byPk.set(pk, r);
    byPk.set(pk.toLowerCase(), r);
    pks.push(pk);
  });

  const entry = { rows: rows, byPk: byPk, pks: pks, headers: headers, pkHeader: pkHeader || pkColumn };
  _pkIndexCache_[key] = entry;
  return entry;
}

/**
 * Invalidates one company's cached reference data for one kind. Call this
 * from every add_/edit_/delete_ action that mutates a sheet this helper
 * caches, immediately after the mutation succeeds.
 */
function invalidateRefsCache_(dbId, kind) {
  const key = 'refs_' + String(dbId) + '_' + kind;
  // Remove both forms: the chunked entry written today, and the single-key entry
  // any still-live cache may hold from before Phase 6.
  try { removeChunkedCache_(key); } catch (e) {}
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
}

/**
 * email(lowercased) -> { name, role, company, status } from ERP_Users.
 * Keyed by the authority generation, NOT a TTL: an admin saving a user bumps the
 * generation, so the next request anywhere in the system rebuilds this map.
 *
 * getRefsCached_ chunks, so a large ERP_Users cannot silently blow the ~100KB
 * single-value cap. Do not swap it for a bare cache.put.
 */
function userDirectory_() {
  try {
    return getRefsCached_(CONFIG.AUTH_SPREADSHEET_ID, 'user_dir_g' + authGeneration_(),
      CONFIG.CACHE_USER_DIR_SECONDS, function () {
        var map = {};
        getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users').forEach(function (u) {
          var em = String(u.email || '').trim().toLowerCase();
          if (!em) return;
          map[em] = {
            name:    String(u.name || '').trim(),
            role:    String(u.role || '').trim(),
            company: String(u.company || '').trim(),
            status:  String(u.status == null ? 'Active' : u.status).trim() || 'Active'
          };
        });
        return map;
      }) || {};
  } catch (e) { return {}; }
}

/**
 * Unchanged contract: email(lowercased) -> display name. Now a projection over
 * userDirectory_. Consumed at Code.js:110 — name, signature and return shape
 * are a public contract and do not change.
 *
 * This costs nothing extra: userNameMap_() already read ERP_Users on every page
 * load; the 300s TTL is simply replaced by a generation key on the same read.
 */
function userNameMap_() {
  var dir = userDirectory_(), out = {};
  for (var em in dir) if (dir[em].name) out[em] = dir[em].name;
  return out;
}

// ==========================================
// Versioned cache invalidation
// ==========================================
/**
 * Installable onEdit target. THE SIMPLE TRIGGER onEdit(e) BELOW NEVER FIRES:
 * this is a standalone script (.clasp.json carries a bare scriptId, no
 * container) and simple triggers only run in container-bound projects. Until
 * installTriggers_ creates this trigger, a change typed directly into the AUTH
 * spreadsheet reaches no invalidation at all beyond the staleness ceiling
 * folded into authGeneration_.
 */
function onAuthSheetEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getParent().getId() !== CONFIG.AUTH_SPREADSHEET_ID) return;
    const sheetName = sheet.getName();
    if (sheetName === 'ERP_Users') bumpVersion_('ERP_Users');
    else if (sheetName === 'ERP_Companies') bumpVersion_('ERP_Companies');
    else if (sheetName === 'ERP_Pages_Matrix') bumpVersion_('ERP_Pages_Matrix');
    else if (sheetName === 'ERP_Information') bumpVersion_('ERP_Information');
    else if (sheetName === 'ERP_system_work') bumpVersion_('ERP_system_work');
  } catch (err) { console.error('onAuthSheetEdit failed: ' + err.message); }
}

/** Retained for compatibility. Never fires — see onAuthSheetEdit. */
function onEdit(e) { onAuthSheetEdit(e); }

// ==========================================
// Authority generation (durable, event-driven invalidation)
// ==========================================
var _genMemo_ = null;   // per-execution memo, cleared by resetRecordCache_
var _ksMemo_  = null;   // kill-switch memo, cleared by resetRecordCache_ and by a bump

/**
 * The authority generation. Durable in ScriptProperties, mirrored in
 * CacheService at max TTL, so the steady-state cost is one cache get.
 *
 * NEVER writes to ScriptProperties — only bumpAuthGeneration_ does, and only in
 * response to a real mutation. A fresh deployment with no property set reads '0'
 * and works correctly; the first admin save bootstraps the real stamp.
 *
 * The trailing time bucket is the staleness CEILING: it guarantees that a direct
 * sheet edit made while the onAuthSheetEdit trigger is missing or broken clears
 * within AUTH_STALENESS_CEILING_SECONDS, so the trigger is not load-bearing.
 */
function authGeneration_() {
  if (_genMemo_ !== null) return _genMemo_;
  var base = null;
  try { base = CacheService.getScriptCache().get('erp_gen'); } catch (e) {}
  if (!base) {
    try { base = PropertiesService.getScriptProperties().getProperty('erp_gen'); } catch (e) {}
    if (!base) base = '0';
    try { CacheService.getScriptCache().put('erp_gen', base, 21600); } catch (e) {}
  }
  var ceilSec = Number(CONFIG.AUTH_STALENESS_CEILING_SECONDS) || 300;
  _genMemo_ = base + '.' + Math.floor(new Date().getTime() / (ceilSec * 1000));
  return _genMemo_;
}

/**
 * Invalidate every cached authority payload for every user, everywhere, at once.
 *
 * Order matters: the DURABLE write is the source of truth and goes first. If it
 * fails, the cache mirror gets a 60s TTL instead of 6h, so a later eviction
 * cannot strand readers on a stale Properties generation for six hours.
 */
function bumpAuthGeneration_() {
  var g = String(new Date().getTime());
  var durable = false;
  try {
    PropertiesService.getScriptProperties().setProperty('erp_gen', g);
    durable = true;
  } catch (e) {
    try { console.error('bumpAuthGeneration_: durable write failed — ' + e.message); } catch (e2) {}
  }
  try { CacheService.getScriptCache().put('erp_gen', g, durable ? 21600 : 60); }
  catch (e) { try { CacheService.getScriptCache().remove('erp_gen'); } catch (e2) {} }
  _genMemo_ = null;   // recompute with the new base and the current bucket
  _ksMemo_  = null;   // toggleKillSwitch_ flips the flag AFTER the gate memoised it
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
  // ERP_Users (role/company/status), ERP_Pages_Matrix (grants) and
  // ERP_system_work / ERP_Information (kill switch) all feed the authority
  // decision. Any of them changing invalidates every cached authority payload.
  // Additive: the per-sheet version keys above stay, because version_companies
  // still has live consumers.
  if (sheetName === 'ERP_Users' || sheetName === 'ERP_Pages_Matrix' ||
      sheetName === 'ERP_Information' || sheetName === 'ERP_system_work') {
    bumpAuthGeneration_();
  }
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
      changed_by: (user && String(user).trim() !== '') ? user : 'System',
      changed_at: new Date(),
      created_at: new Date()
    });
  });
  if (!rows.length) return;
  // FAST PATH (batched): identical cell values to N sequential addRecord_ calls,
  // but ONE lock + ONE counter allocation + ONE setValues instead of N locks +
  // N counter R/W + N appends. This is the dominant save-time cost on edits
  // (one history row per changed column).
  var required = ['sheet_name', 'record_uid', 'action', 'column_name'];
  rows.forEach(function (hr) {
    var missing = required.filter(function (k) { return hr[k] === undefined || hr[k] === null || String(hr[k]).trim() === ''; });
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
  });
  executeWithLock_(function () {
    var histHeaders = getHeaders_(histSheet);
    var lower = histHeaders.map(function (h) { return String(h).trim().toLowerCase(); });
    var startId = null;
    if (lower.indexOf('id') !== -1) {
      // Replicates addRecord_'s per-row id assignment with a single allocation
      // (getNextIdBatch_ is lock-reentrant, so nesting here is safe).
      startId = getNextIdBatch_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Record_History', rows.length);
    }
    var matrix = rows.map(function (hr, i) {
      return histHeaders.map(function (h) {
        var key = String(h).trim().toLowerCase();
        if (key === 'id' && startId !== null) return startId + i;
        var v = hr[key];
        return v !== undefined && v !== null ? v : '';
      });
    });
    histSheet.getRange(histSheet.getLastRow() + 1, 1, matrix.length, histHeaders.length).setValues(matrix);
    noteMutation_();
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
    try { logHistory_(dbId, sheetName, uid, null, currentUser, action || 'create', merged, null); }
    catch (eHist) { try { Logger.log('AUDIT-SKIPPED create ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
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