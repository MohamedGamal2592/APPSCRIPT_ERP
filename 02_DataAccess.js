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
/*
 * [RT-5] …and, since this run, it also STAMPS the table it was told about.
 *
 * That it did not was a defect, not a gap in coverage, and it is the reason the
 * live-change watch has been decorative on the pages that had it. The stamp
 * helpers (noteTableChange_ / noteSheetChange_) were called from exactly three
 * places, all inside the shared data layer — addRecord_, updateRowByCriteria_
 * and the delete helpers. Company handlers write to sheets directly with
 * setValues/setValue/appendRow/deleteRow in about 112 places, and every one of
 * those called noteMutation_() with no arguments, which only ever emptied the
 * per-request memo.
 *
 * The consequence, stated plainly: a change written by one of those handlers
 * bumped no version, so a second device polling get_page_versions could never
 * learn about it. saveValleyReturn_, transferValleyCash_ and addMonthlySalary_
 * are three confirmed examples. Twenty-two pages have been polling for changes
 * they were structurally incapable of seeing.
 *
 * Both arguments are OPTIONAL and the no-argument call behaves EXACTLY as it
 * always has. That is deliberate: the signature change and the call-site sweep
 * ship together, but a site the sweep missed is no worse off than it was
 * yesterday, and tools/verify/rt3_stamp_coverage.js reports every one of them
 * with a file and a line rather than leaving them to be rediscovered.
 *
 * Where a caller holds a Sheet rather than a pair of ids, noteSheetChange_
 * derives both. Where a caller genuinely cannot tell which table it wrote,
 * it stamps NOTHING and is reported: a site that stamps the WRONG table is
 * worse than one that stamps none, because it makes every other page watching
 * that table refetch for no reason and still misses its own change.
 */
function noteMutation_(scopeId, sheetName) {
  if (scopeId && sheetName) {
    noteTableChange_(scopeId, sheetName);
  } else if (scopeId && typeof scopeId === 'object' && typeof scopeId.getName === 'function') {
    /* A Sheet in the first position. Almost every company write site holds one
     * — `const sheet = getSheet_(SOME_SHEET, dbId)` — and does NOT hold the
     * spreadsheet id separately, so demanding the pair would have meant
     * inventing a local at a hundred sites and getting some of them wrong.
     * noteSheetChange_ derives both from the sheet itself. */
    noteSheetChange_(scopeId);
  }
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

/* ── per-table change stamps ───────────────────────────────────────────────
 *
 * Apps Script has no server push: no sockets, no long poll worth having. The
 * only way one user's device can learn that another user's device changed
 * something is to ASK — so the ask has to be cheap enough to repeat.
 *
 * A stamp is one CacheService entry per (spreadsheet, sheet). Writing one costs
 * nothing measurable next to the Sheets write that earned it; reading a page's
 * worth costs ONE CacheService.getAll, which is memory, not a spreadsheet.
 * That is the whole point: polling must never touch a sheet.
 *
 * Honest limits, and the client is written to them:
 *   - CacheService entries can be EVICTED before their TTL. A vanished stamp is
 *     therefore treated by the client as "no information", never as a change,
 *     so an eviction costs a missed refresh rather than a storm of them.
 *   - A stamp says a table changed, not what changed. It is a hint to refetch,
 *     not a substitute for the refetch.
 *   - Coverage is best-effort: a handler that writes with a raw setValues and
 *     does not stamp is simply not noticed. The shared write helpers below all
 *     stamp, which is most of them.
 */
var TABLE_VERSION_TTL_ = 21600;   // 6h, the CacheService maximum

function tableVersionKey_(scopeId, sheetName) {
  return 'tv_' + String(scopeId) + '_' + String(sheetName);
}

/** Record that a table changed. Never throws — a failed stamp must not fail a save. */
function noteTableChange_(scopeId, sheetName) {
  if (!scopeId || !sheetName) return;
  try {
    CacheService.getScriptCache().put(
      tableVersionKey_(scopeId, sheetName), String(new Date().getTime()), TABLE_VERSION_TTL_);
  } catch (e) { /* a stamp is a convenience, never a requirement */ }
}

/** Stamp from a Sheet object, when that is all the caller has. */
function noteSheetChange_(sheet) {
  if (!sheet) return;
  try { noteTableChange_(sheet.getParent().getId(), sheet.getName()); } catch (e) {}
}

/** Current stamps for a set of tables, in ONE CacheService round trip. */
function readTableVersions_(scopeId, sheetNames) {
  const out = {};
  const names = (sheetNames || []).filter(Boolean);
  if (!scopeId || !names.length) return out;
  try {
    const keys = names.map(function (n) { return tableVersionKey_(scopeId, n); });
    const got = CacheService.getScriptCache().getAll(keys) || {};
    names.forEach(function (n) {
      const v = got[tableVersionKey_(scopeId, n)];
      if (v) out[n] = v;
    });
  } catch (e) { /* no stamps is a valid answer: the client learns nothing and does nothing */ }
  return out;
}

/**
 * The highest id currently in a table's id column.
 *
 * Both id allocators call this INSIDE the one global script lock, so its cost
 * is time every other user in every company spends queued. It therefore reads
 * ONE COLUMN rather than the whole sheet: identical answer, and on a 33-column
 * table it is 33x less data held under the lock (a 20 000-row purchasing line
 * table drops from ~660 000 cells to ~20 000).
 *
 * Deliberately a direct range read, not getAllRecords_: this runs under the
 * lock and must not populate or depend on the per-request memo.
 */
function maxIdOf_(sheet, idColumnName) {
  if (!sheet) return 0;
  const headers = getHeaders_(sheet);
  const want = String(idColumnName || 'id').toLowerCase();
  const idIdx = headers.findIndex(h => String(h).trim().toLowerCase() === want);
  if (idIdx === -1) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  countSheetRead_();
  const col = sheet.getRange(2, idIdx + 1, lastRow - 1, 1).getValues();
  let max = 0;
  for (let i = 0; i < col.length; i++) {
    const v = Number(col[i][0]);
    if (Number.isInteger(v) && v > max) max = v;
  }
  return max;
}

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
  /* One column, not the whole sheet — see maxIdOf_. This runs under the global
     script lock, so its size is every other user's queue time. */
  const tableMax = maxIdOf_(ss.getSheetByName(tableName), idColumnName);
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
    
    /* One column, not the whole sheet — see maxIdOf_. */
    const tableMax = maxIdOf_(ss.getSheetByName(tableName), idColumnName);
    
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
    /* Match the header EXACTLY first, then fall back to the lowercased name.
     *
     * This used to lowercase the header and look up only that, so a dataMap
     * keyed by the real header name lost every column whose name is not already
     * lowercase. On valley_purchasing_costing that is 32 of 46 columns — Code,
     * Type, Shipping Type, Supplier Name, Total costs, the lot — so creating a
     * purchase wrote a row that was blank apart from the audit columns. Worse,
     * requiredFields is checked against the map (where 'Code' is present) and
     * the row is then written from the lowercase lookup (where it is not), so
     * it validated and discarded the same value.
     *
     * The lowercase lookup stays as the fallback, so every caller that already
     * worked still behaves identically; this can only recover columns that were
     * being dropped. */
    const rowValues = headers.map(h => {
      const name = String(h).trim();
      if (name.toLowerCase() === 'id') return id;
      if (dataMap[name] !== undefined) return dataMap[name];
      const lower = name.toLowerCase();
      return dataMap[lower] !== undefined ? dataMap[lower] : '';
    });
    const newRowNumber = sheet.getLastRow() + 1;
    sheet.appendRow(rowValues);
    noteMutation_();
    noteTableChange_(dbId, sheetName);

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
      noteSheetChange_(sheet);
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
  return deleteRowsWhereIn_(sheet, criteriaHeader, [criteriaValue]);
}

/**
 * Delete every row whose criteriaHeader is ANY OF `values`, in ONE pass.
 *
 * Calling deleteRowsByCriteria_ in a loop costs a full getDataRange() read per
 * value, which is how deleting the 10 outputs of a manufacturing order came to
 * read the whole consumption sheet ten times. One read, one predicate, the same
 * contiguous-block deletion.
 *
 * Returns the number of rows removed.
 */
function deleteRowsWhereIn_(sheet, criteriaHeader, values) {
  const want = Object.create(null);
  let any = false;
  (values || []).forEach(function (v) {
    if (v === undefined || v === null) return;
    want[String(v).trim()] = true;
    any = true;
  });
  if (!any) return 0;

  const headers = getHeaders_(sheet);
  countSheetRead_();
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) return 0;

  /* 1-based sheet row numbers, ascending. */
  const target = [];
  for (let i = 1; i < data.length; i++) {
    if (want[String(data[i][critIdx]).trim()]) target.push(i + 1);
  }
  if (!target.length) return 0;

  /* Bottom-up, in contiguous blocks: same rows, same order, one API call per
     run instead of one per row. */
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
  noteSheetChange_(sheet);
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
/**
 * The history rows ONE record change would produce. No write, no lock.
 * Split out of logHistory_ so many changes can share a single write — see
 * logHistoryMany_.
 */
function historyRowsFor_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues) {
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
  return rows;
}

/**
 * Audit MANY record changes in one write.
 *
 * logHistory_ already batches the columns of a single record, but calling it in
 * a loop still costs one script lock, one id allocation and one setValues PER
 * ROW — and the lock is the global one every user shares. Saving a 50-line
 * invoice paid that fifty times, on top of writing the lines themselves.
 *
 * `entries` are {dbId, sheetName, recordUid, recordId, user, action, newValues,
 * oldValues}. Identical cell values to N logHistory_ calls, identical ids, in
 * the same order.
 */
function logHistoryMany_(entries) {
  const rows = [];
  (entries || []).forEach(function (e) {
    if (!e) return;
    historyRowsFor_(e.dbId, e.sheetName, e.recordUid, e.recordId, e.user, e.action,
      e.newValues, e.oldValues).forEach(function (r) { rows.push(r); });
  });
  writeHistoryRows_(rows);
}

function logHistory_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues) {
  writeHistoryRows_(historyRowsFor_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues));
}

/* ══════════════════════════════════════════════════════════════════════════
 * [RT-11] The audit trail comes off the request path
 *
 * A save does not return when the business row is written. It returns when the
 * history has ALSO been written — synchronously, into the shared AUTH
 * spreadsheet, while holding LockService.getScriptLock(), which is SCRIPT
 * GLOBAL. Every save in every company queues behind every other save in the
 * system for its audit write. On an edit touching ten columns that is ten
 * history rows behind one global lock, and the user waits for all of it.
 *
 * writeHistoryRows_ is already well optimised — one lock, one id allocation,
 * one setValues instead of N appends. The remaining cost is not the write. It
 * is the LOCK, and the lock is the part every other user in every other company
 * is waiting on.
 *
 * So the rows are appended to a queue with appendRowWithRetry_, which takes NO
 * script lock and allocates NO ids, and a one-minute trigger does the locking
 * and the id allocation once for everybody.
 *
 * ── WHY A SHEET AND NOT A CACHE ────────────────────────────────────────────
 * Audit rows are the one thing in this programme that may not be lost.
 * CacheService entries can be evicted before their TTL — the comment above the
 * change stamps in this file says so explicitly, and the whole client-side
 * design is built around it. A queue that silently drops audit rows is worse
 * than a slow save, worse than a stale cache, worse than anything else here,
 * because nobody finds out. Telemetry may use a cache; this may not.
 *
 * ── HOW THE DRAIN CANNOT DUPLICATE OR LOSE A ROW ───────────────────────────
 * The drain MARKS rows before it moves them, in three phases:
 *
 *   1. CLAIM   stamp a unique drain id into the claim column of the rows this
 *              run intends to move, and write that stamp. From this moment no
 *              other drain will touch them.
 *   2. WRITE   copy exactly the claimed rows into ERP_Record_History.
 *   3. DELETE  remove the claimed rows from the queue.
 *
 *   2. DEDUPE  drop any claimed row that is ALREADY in ERP_Record_History,
 *              matched on its natural key — record_uid, column_name, action and
 *              changed_at. Only the TAIL of the history sheet is read, because
 *              a row can only be a duplicate candidate if a drain wrote it and
 *              died within the claim-stale window: minutes ago, not days.
 *   4. MARK    stamp the claim as done, in the queue.
 *   5. DELETE  remove the rows from the queue.
 *
 * Every place a trigger can die is covered, and none of them loses or
 * duplicates a row:
 *
 *   died after CLAIM   rows stay claimed and unwritten. The next drain
 *                      re-claims them once the claim goes stale, dedupe finds
 *                      nothing, and they are written. NOTHING LOST.
 *   died after WRITE   rows are in history AND still on the queue. The next
 *                      drain re-claims them, DEDUPE FINDS THEM, and they are
 *                      deleted without being written again. NOTHING DUPLICATED.
 *   died after MARK    rows carry the done mark. The next drain sees it, skips
 *                      the write entirely, and deletes. NOTHING DUPLICATED.
 *
 * The claim id is deliberately NOT written into ERP_Record_History: that
 * sheet's columns are not this work's to change. The natural key does the same
 * job with the columns already there.
 *
 * ── WHAT DOES NOT CHANGE ───────────────────────────────────────────────────
 * What a history row CONTAINS, one row per changed column, the columns of
 * ERP_Record_History, and everything Record_History_Panel reads. The rows put
 * on the queue are exactly the rows historyRowsFor_ produces today. This phase
 * changes WHEN the row is written and nothing else about it.
 * ══════════════════════════════════════════════════════════════════════════ */

var HISTORY_QUEUE_SHEET_ = 'ERP_History_Queue';

/* ERP_Record_History's own columns, plus the three the queue needs to be a
 * queue. The extra three live HERE, in a new sheet; ERP_Record_History's
 * columns are not touched. */
var HISTORY_QUEUE_HEADERS_ = [
  'sheet_name', 'record_uid', 'record_id', 'action', 'column_name',
  'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at',
  'queued_at', 'claim_id', 'claimed_at'
];

/* A claim older than this is assumed to belong to a drain that died. Ten
 * minutes: far longer than a drain takes, far shorter than anyone would wait
 * to find out a row was stuck. */
var HISTORY_CLAIM_STALE_MS_ = 10 * 60 * 1000;

/* A row still queued after this is REPORTED. Never dropped. */
var HISTORY_STALE_REPORT_MS_ = 30 * 60 * 1000;

/** Whether the queue is in use. Off means writeHistoryRows_ behaves as it did. */
var HISTORY_QUEUE_ENABLED_ = true;

function ensureHistoryQueueSheet_() {
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var sh = ss.getSheetByName(HISTORY_QUEUE_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(HISTORY_QUEUE_SHEET_);
    sh.appendRow(HISTORY_QUEUE_HEADERS_);
    sh.setFrozenRows(1);
    noteMutation_(sh);
  }
  return sh;
}

/**
 * Put history rows on the queue. NO script lock, NO id allocation — that is the
 * whole saving, and both of those move to the drain.
 *
 * Returns true when the rows are queued. On ANY failure it returns false and
 * the caller writes them the old way, synchronously: a slow save is a much
 * better outcome than a lost audit row.
 */
function enqueueHistoryRows_(rows) {
  if (!rows || !rows.length) return true;
  try {
    var sh = ensureHistoryQueueSheet_();
    var queuedAt = new Date();
    var matrix = rows.map(function (hr) {
      return HISTORY_QUEUE_HEADERS_.map(function (h) {
        if (h === 'queued_at') return queuedAt;
        if (h === 'claim_id' || h === 'claimed_at') return '';
        var v = hr[h];
        return (v !== undefined && v !== null) ? v : '';
      });
    });
    /* appendRowWithRetry_ takes no script lock. One setValues for the batch,
     * appended at the end, which is the cheapest thing a sheet can be asked to
     * do and is the only sheet work left inside the user's request. */
    sh.getRange(sh.getLastRow() + 1, 1, matrix.length, HISTORY_QUEUE_HEADERS_.length)
      .setValues(matrix);
    noteMutation_(sh);
    return true;
  } catch (e) {
    try { console.error('enqueueHistoryRows_: ' + e.message); } catch (eL) {}
    return false;
  }
}

/**
 * The drain. One minute, time-driven.
 *
 * Claims, writes, then deletes — see the header for why that order and not
 * another. Runs under the same global lock writeHistoryRows_ used to take, but
 * takes it ONCE for a minute's worth of saves from every company instead of
 * once per save.
 */
function drainHistoryQueue_() {
  try {
    var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    var sh = ss.getSheetByName(HISTORY_QUEUE_SHEET_);
    if (!sh || sh.getLastRow() < 2) return { status: 'success', rows: 0 };

    var claimId = 'd' + new Date().getTime().toString(36) + Utilities.getUuid().slice(0, 8);
    var now = new Date().getTime();
    var idx = {};
    HISTORY_QUEUE_HEADERS_.forEach(function (h, i) { idx[h] = i; });

    var all = sh.getRange(2, 1, sh.getLastRow() - 1, HISTORY_QUEUE_HEADERS_.length).getValues();

    /* PHASE 1 — CLAIM. Unclaimed rows; rows already marked done by a drain that
     * died before deleting them; and rows whose claim is old enough that the
     * drain holding it must have died. */
    var take = [], alreadyDone = {};
    for (var i = 0; i < all.length; i++) {
      var existing = String(all[i][idx.claim_id] || '').trim();
      if (!existing) { take.push(i); continue; }
      if (existing.indexOf('|done') !== -1) { take.push(i); alreadyDone[i] = true; continue; }
      var at = new Date(all[i][idx.claimed_at]).getTime();
      if (isNaN(at) || (now - at) > HISTORY_CLAIM_STALE_MS_) take.push(i);
    }
    if (!take.length) {
      /* Nothing this drain may touch, but the queue is not empty — every row is
       * freshly claimed by another drain, or something is stuck. This is the
       * only moment worth checking, and it costs one column read. */
      reportStaleHistoryQueue_();
      return { status: 'success', rows: 0 };
    }

    var claimedAt = new Date();
    take.forEach(function (r) {
      if (alreadyDone[r]) return;      /* keep the done mark: it is the evidence */
      sh.getRange(r + 2, idx.claim_id + 1, 1, 2).setValues([[claimId, claimedAt]]);
    });
    noteMutation_(sh);

    /* PHASE 2 — DEDUPE. A drain that died after writing but before deleting
     * left its rows in BOTH places. They are matched on their natural key
     * against the tail of ERP_Record_History. */
    var candidates = take.filter(function (r) { return !alreadyDone[r]; });
    var written = historyTailKeys_(Math.max(candidates.length * 4, 500));
    var toWrite = candidates.filter(function (r) {
      return !written[historyRowKey_({
        record_uid: all[r][idx.record_uid],
        column_name: all[r][idx.column_name],
        action: all[r][idx.action],
        changed_at: all[r][idx.changed_at]
      })];
    });

    /* PHASE 3 — WRITE the survivors, in ERP_Record_History's own column order,
     * with the ids allocated once for the whole batch. */
    if (toWrite.length) {
      var histRows = toWrite.map(function (r) {
        var row = all[r];
        var o = {};
        HISTORY_QUEUE_HEADERS_.forEach(function (h, c) {
          if (h === 'queued_at' || h === 'claim_id' || h === 'claimed_at') return;
          o[h] = row[c];
        });
        return o;
      });
      writeHistoryRowsDirect_(histRows);

      /* PHASE 4 — MARK done, so a death before the delete below costs a skipped
       * write next time rather than a duplicated one. */
      toWrite.forEach(function (r) {
        sh.getRange(r + 2, idx.claim_id + 1).setValue(claimId + '|done');
      });
      noteMutation_(sh);
    }

    /* PHASE 5 — DELETE, bottom-up so the indices stay valid. */
    take.slice().sort(function (a, b) { return b - a; }).forEach(function (r) {
      sh.deleteRow(r + 2);
    });
    noteMutation_(sh);

    return {
      status: 'success', rows: take.length, written: toWrite.length,
      deduped: take.length - toWrite.length, claim: claimId
    };
  } catch (e) {
    try { console.error('drainHistoryQueue_: ' + e.message); } catch (eL) {}
    return { status: 'error', message: e.message };
  }
}

/**
 * Rows that have been on the queue too long. REPORTED, never dropped — a queue
 * that quietly discards is the failure this whole design exists to avoid.
 */
function reportStaleHistoryQueue_() {
  try {
    var sh = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName(HISTORY_QUEUE_SHEET_);
    if (!sh || sh.getLastRow() < 2) return { status: 'success', stale: 0 };
    var col = HISTORY_QUEUE_HEADERS_.indexOf('queued_at') + 1;
    var stamps = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
    var cutoff = new Date().getTime() - HISTORY_STALE_REPORT_MS_;
    var stale = stamps.filter(function (r) {
      var t = new Date(r[0]).getTime();
      return !isNaN(t) && t < cutoff;
    }).length;
    if (stale) {
      try {
        console.error('ERP_History_Queue: ' + stale + ' audit row(s) still queued after ' +
          Math.round(HISTORY_STALE_REPORT_MS_ / 60000) + ' minutes. The drain trigger may not be installed.');
      } catch (eL) {}
    }
    return { status: 'success', stale: stale };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/** The natural key of a history row: what makes two of them the same row. */
function historyRowKey_(r) {
  return [
    String(r.record_uid || ''),
    String(r.column_name || ''),
    String(r.action || ''),
    (r.changed_at instanceof Date) ? r.changed_at.getTime() : String(r.changed_at || '')
  ].join('');
}

/**
 * The natural keys of the last `n` rows of ERP_Record_History, as a lookup.
 *
 * Only the tail, deliberately: this runs every minute and the history sheet
 * grows without bound, so reading it whole would make the drain the expensive
 * thing this work exists to remove. The tail is sufficient because a row can
 * only be a duplicate candidate if some drain wrote it and died within the
 * claim-stale window — minutes ago, not days.
 *
 * A failure here returns an empty lookup, which means nothing is deduped and
 * nothing is lost: the worst case is the duplicate this is trying to avoid,
 * never a missing audit row.
 */
function historyTailKeys_(n) {
  var out = {};
  try {
    var sh = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName('ERP_Record_History');
    if (!sh) return out;
    var last = sh.getLastRow();
    if (last < 2) return out;
    var headers = getHeaders_(sh).map(function (h) { return String(h).trim().toLowerCase(); });
    var take = Math.min(n, last - 1);
    var rows = sh.getRange(last - take + 1, 1, take, headers.length).getValues();
    var ui = headers.indexOf('record_uid');
    var ci = headers.indexOf('column_name');
    var ai = headers.indexOf('action');
    var ti = headers.indexOf('changed_at');
    if (ui === -1 || ci === -1) return out;
    rows.forEach(function (r) {
      out[historyRowKey_({
        record_uid: r[ui], column_name: r[ci],
        action: ai === -1 ? '' : r[ai],
        changed_at: ti === -1 ? '' : r[ti]
      })] = true;
    });
  } catch (e) { /* see above: no tail means no dedupe, never a lost row */ }
  return out;
}

/**
 * [RT-11] The audit write, as the request sees it.
 *
 * It ENQUEUES. That is the whole change: the rows are appended to
 * ERP_History_Queue with no script lock and no id allocation, and the
 * one-minute drain does the locking and the allocating once for everybody.
 * The saving is the LOCK, and the lock is what every other user in every other
 * company was waiting on.
 *
 * If the queue is unavailable for ANY reason — the sheet cannot be created, the
 * append throws, the feature is switched off — this falls straight through to
 * the old synchronous write. A slow save is a much better outcome than a lost
 * audit row, and it is the only trade this function is allowed to make.
 */
function writeHistoryRows_(rows) {
  if (!rows || !rows.length) return;
  if (HISTORY_QUEUE_ENABLED_ && enqueueHistoryRows_(rows)) return;
  writeHistoryRowsDirect_(rows);
}

/** The batched write itself — one lock, one id allocation, one setValues.
 *  Unchanged, and still the fallback and the drain's own writer. */
function writeHistoryRowsDirect_(rows) {
  if (!rows || !rows.length) return;
  const histSheet = getSheet_('ERP_Record_History', CONFIG.AUTH_SPREADSHEET_ID);
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
  /* [RT-1b] The create branch above has always wrapped logHistory_ and logged
   * AUDIT-SKIPPED; this branch did not, and the difference was a live bug.
   * updateRowByCriteria_ has ALREADY committed the change on the line above, so
   * a history write that throws here turned a successful save into a reported
   * error for a change that is in the sheet.
   *
   * That was merely confusing while the client waited for a server reply. Once
   * the optimistic write rollout lands it is worse: the client rolls the row
   * back off the screen, so the screen and the spreadsheet actively disagree
   * and nobody is told. Hence this ships before that rollout, not after it.
   *
   * The audit row is not discarded quietly — AUDIT-SKIPPED goes to the log with
   * the sheet and the reason, exactly as create does — and the queue work later
   * in this programme removes the failure mode rather than tolerating it.
   *
   * The delete branch is deliberately NOT wrapped: it writes its history row
   * BEFORE deleting, so a throw there leaves the row in the sheet and the
   * reported failure is the truth. Guarding it would delete a row with no
   * audit trail, which is the one outcome worth more than a clean error. */
  try { logHistory_(dbId, sheetName, oldUid, existingRowId, currentUser, action || 'update', newValues, old); }
  catch (eHist) { try { Logger.log('AUDIT-SKIPPED update ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
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
  /* [RT-1b] Same asymmetry, same fix, same reason as the update branch below:
   * updateRowByCriteria_ has already committed the approval by the time this
   * line runs, so an audit failure here must not be reported as a failed
   * approve. */
  try { logHistory_(dbId, sheetName, oldUid, rowId, currentUser, 'approve', merged, old); }
  catch (eHist) { try { Logger.log('AUDIT-SKIPPED approve ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
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