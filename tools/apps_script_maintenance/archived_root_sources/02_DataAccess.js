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

/* Stable canonicalization + hash for operation identity (recovery design).
 * Pure JavaScript: no GAS services, so vm-based verify suites can load it.
 * - stableCanonical_: sorted-key JSON; object key order, Dates (ISO day),
 *   and undefined-vs-missing are normalized. Arrays keep their order.
 * - stableHash64_: FNV-1a 64-bit over UTF-16 code units, 16 hex chars.
 *   Strength is adequate for accidental-collision detection between a request
 *   ID and one payload: the receipt ledger's SHA-256 hash remains the primary
 *   request-ID/payload binding enforced before any recovery runs. */
function stableCanonical_(value) {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) {
    var t = value.getTime();
    if (isNaN(t)) return 'null';
    return JSON.stringify(value.toISOString().slice(0, 10));
  }
  if (Array.isArray(value)) return '[' + value.map(stableCanonical_).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableCanonical_(value[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}
function stableHash64_(text) {
  var s = String(text == null ? '' : text);
  var hi = 0x811c9dc5, lo = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    hi = Math.imul(hi ^ c, 16777619) >>> 0;
    lo = Math.imul(lo ^ (c + ((i * 31) | 0)), 16777619) >>> 0;
  }
  function hex(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
  return hex(hi) + hex(lo);
}

// Execution-scoped memoization so SpreadsheetApp.openById is called once per execution.
const _ssCache_ = {};

// Batch 1: request-scoped memoization for getAllRecords_(). Lives only for the
// duration of a single apiRouter_()/doGet execution (reset at entry) and is
// disabled entirely for mutating actions so a write can never be served stale
// data. Stores the raw getValues() 2D array; record objects are rebuilt on each
// read so callers may mutate them freely (identical behavior to before).
const _recordCache_ = {};
let _recordCacheDisabled_ = false;

/* Opt-in read-only snapshot ownership. Legacy getAllRecords_ callers still get
 * fresh mutable record objects. Audited readers may retain one materialized
 * row array per table for this execution, subject to a conservative budget. */
const _readOnlySnapshots_ = {};
let _readOnlySnapshotBytes_ = 0;
const READ_ONLY_SNAPSHOT_MAX_BYTES_ = 2 * 1024 * 1024;
const READ_ONLY_SNAPSHOT_MAX_ROWS_ = 50000;

function resetReadOnlySnapshots_() {
  for (const k in _readOnlySnapshots_) delete _readOnlySnapshots_[k];
  _readOnlySnapshotBytes_ = 0;
}

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
  resetReadOnlySnapshots_();
  for (const k in _ensuredSheets_) delete _ensuredSheets_[k];
  // The id high-water mark is request-scoped by construction: it only ever
  // raises the floor above what the target table already says, and a value from
  // a previous request must never be allowed to do even that.
  for (const k in _idHighWater_) delete _idHighWater_[k];
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
  resetReadOnlySnapshots_();
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
  resetReadOnlySnapshots_();
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
 * Shared locked document counter (Phase 1 numbering).
 *
 * Modeled on ValleyFoods `nextInvoiceSeq_`: a PropertiesService persisted
 * counter keyed by dbId + docType + year (+ taxSystem variant via opts),
 * seeded once from the sheet max via a scanner callback. Returns an integer
 * seq; formatting (e.g. `seq + '-' + year`) stays in the callers so existing
 * formats are preserved.
 *
 * MUST be called while already holding `executeWithLock_` (throws otherwise).
 * A missing counter defaults to 0, so the first allocation seeds (via the
 * scanner when provided) and then returns `seededMax + 1`.
 *
 * @param {string} dbId spreadsheet id / scope.
 * @param {string} docType caller-chosen sequence name (e.g. 'tl_sales').
 * @param {number} year full year for the key.
 * @param {Object|Function} opts either a scanner fn or
 *   `{ taxSystem, seedScanner|scanner|seedMax|scanMax, taxVariant }`.
 * @return {number} next integer sequence value.
 */
function nextDocumentNumber_(dbId, docType, year, opts) {
  if (!_scriptLockHeld_) {
    throw new Error('nextDocumentNumber_ must be called inside executeWithLock_');
  }
  var scanner = null;
  var taxSuffix = '';
  if (typeof opts === 'function') {
    scanner = opts;
  } else if (opts) {
    if (typeof opts.seedScanner === 'function') scanner = opts.seedScanner;
    else if (typeof opts.scanner === 'function') scanner = opts.scanner;
    else if (typeof opts.seedMax === 'function') scanner = opts.seedMax;
    else if (typeof opts.scanMax === 'function') scanner = opts.scanMax;
    if ('taxSystem' in opts) taxSuffix = '_' + (opts.taxSystem ? '1' : '0');
    else if ('taxVariant' in opts) taxSuffix = '_' + String(opts.taxVariant);
  }
  var y = Number(year) || new Date().getFullYear();
  var key = 'doc_seq_' + String(dbId) + '_' + String(docType) + '_' + y + taxSuffix;
  var props = PropertiesService.getScriptProperties();
  var cur = Number(props.getProperty(key));
  if (!cur || cur <= 0) {
    var seeded = 0;
    if (scanner) {
      try { seeded = Number(scanner()) || 0; } catch (e) { seeded = 0; }
    }
    cur = seeded > 0 ? seeded : 0;
  }
  var next = (cur || 0) + 1;
  props.setProperty(key, String(next));
  return next;
}

/**
 * Single-attempt append; legacy signature retained for existing callers.
 */
function appendRowWithRetry_(sheet, values, maxRetries = 3, delayMs = 1000) {
  // appendRow is not idempotent: a timeout can arrive AFTER it committed.
  // Retain the signature for callers, but never blindly repeat an append.
  try {
    sheet.appendRow(values);
    noteMutation_();
    return true;
  } catch (e) {
    var err = new Error('Append outcome is uncertain; check the saved record before retrying: ' + e.message);
    err.code = 'WRITE_OUTCOME_UNKNOWN'; err.uncertain = true;
    throw err;
  }
}

/**
 * The id floor for allocations already made in THIS execution.
 *
 * Several handlers allocate ids in a LOOP and write the rows AFTERWARDS in one
 * batched setValues — the work-centre and by-product loops in
 * saveValleyMfgOrder_ are the clearest examples, and getNextIdBatch_'s callers
 * do the same thing deliberately. `max(id) + 1` on its own hands every
 * iteration of such a loop the SAME id, because no row has landed in between:
 * the table each call reads is identical. That is silent, and it is the one way
 * deriving ids from the table breaks production.
 *
 * So an allocation is floored by BOTH the live table and this execution's
 * high-water mark for that (spreadsheet, table, id column):
 *
 *     next = max(maxIdOf_(table), highWater) + 1
 *
 * The target table is still read on EVERY allocation, so the id remains
 * `max(id in the target table) + 1` and a row another execution appended
 * between two of our allocations is seen. The memo can only ever RAISE the
 * floor; it can never return a value the sheet does not already justify. It is
 * request-scoped and cleared by resetRecordCache_() at the top of every
 * request, so it can never outlive the execution that filled it.
 */
const _idHighWater_ = {};

function idHighWaterKey_(dbId, tableName, idColumnName) {
  return String(dbId) + '|' + String(tableName).trim().toLowerCase() + '|' +
         String(idColumnName || 'id').trim().toLowerCase();
}

/**
 * Internal id logic — MUST be called while already holding the script lock
 * (i.e. from getNextId_ or addRecord_, never standalone).
 *
 * The id is ALWAYS `max(id in the target table) + 1`, floored by the
 * in-execution high-water mark above. `ID_Counter` is not read, not written and
 * not created here.
 *
 * Why the counter is gone: this function used to return the counter's own value
 * whenever the counter ran AHEAD of the table (`current > tableMax` → return
 * `current`). The table was then never consulted for the answer, so a counter
 * that had drifted — and the owner reports it has — handed out ids the data
 * does not justify. `max(id) + 1` cannot drift, because it is measured from the
 * only thing that matters.
 */
function getNextIdUnderLock_(dbId, tableName, idColumnName = 'id') {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, tableName)) {
    const key = idHighWaterKey_(dbId, tableName, idColumnName);
    const live = systemNextNumericId_(tableName, idColumnName);
    const seen = Number(_idHighWater_[key]) || 0;
    const next = Math.max(live, seen + 1);
    _idHighWater_[key] = next;
    return next;
  }
  const ss = getSpreadsheet_(dbId);
  /* One column, not the whole sheet — see maxIdOf_. This runs under the global
     script lock, so its size is every other user's queue time. */
  const tableMax = maxIdOf_(ss.getSheetByName(tableName), idColumnName);
  const key = idHighWaterKey_(dbId, tableName, idColumnName);
  const seen = Number(_idHighWater_[key]) || 0;
  const next = (tableMax > seen ? tableMax : seen) + 1;
  _idHighWater_[key] = next;
  return next;
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
 * Read-only peek at the next ID for a table without allocating it.
 * Used for UI display of "next ID" only — never for writes.
 *
 * Same source as the allocator: max(id in the target table) + 1. It used to
 * read the ID_Counter row instead, so the number it showed the user was the
 * counter's, and on a table where the counter had drifted it did not match the
 * id the save would go on to assign. It is a DISPLAY value and stays advisory:
 * the row is not reserved, so two users peeking at once see the same number and
 * the allocator, under the lock, decides.
 *
 * Read-only, and it must stay that way. It writes nothing, creates nothing, and
 * deliberately does NOT touch the _idHighWater_ memo — a peek that raised the
 * floor would burn an id nobody asked for.
 */
function peekNextId_(dbId, tableName, idColumnName = 'id') {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, tableName)) return systemNextNumericId_(tableName, idColumnName);
  const ss = getSpreadsheet_(dbId);
  return maxIdOf_(ss.getSheetByName(tableName), idColumnName) + 1;
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
    if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, tableName)) {
      const key = idHighWaterKey_(dbId, tableName, idColumnName);
      const startId = Math.max(systemNextNumericId_(tableName, idColumnName), (Number(_idHighWater_[key]) || 0) + 1);
      _idHighWater_[key] = startId + count - 1;
      return startId;
    }
    const ss = getSpreadsheet_(dbId);
    /* One column, not the whole sheet — see maxIdOf_. */
    const tableMax = maxIdOf_(ss.getSheetByName(tableName), idColumnName);
    /* Same floor as getNextIdUnderLock_, and the same reason: the caller writes
       `count` rows AFTER this returns, so a second batch (or a single
       allocation) taken before those rows land must not see the same table max
       twice. The counter bookkeeping this used to do is gone — the number was
       already derived from tableMax, so only the write to ID_Counter is lost. */
    const key = idHighWaterKey_(dbId, tableName, idColumnName);
    const seen = Number(_idHighWater_[key]) || 0;
    const startId = (tableMax > seen ? tableMax : seen) + 1;
    _idHighWater_[key] = startId + count - 1;
    return startId;
  });
}

/**
 * Get all records from a sheet as an array of objects with lowercase keys.
 * Empty rows are filtered out. Does not touch any counter.
 */
function getAllRecords_(dbId, sheetName) {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName)) return systemGetAllRecords_(sheetName);
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
 * Opt-in read-only path for audited consumers. It shares the existing raw
 * request memo and invalidation lifecycle, materializes rows once, and returns
 * the owned array to code that promises not to mutate it. A large table falls
 * back to the legacy mutable reader without truncating results. 
 */
function getReadOnlyRecords_(dbId, sheetName) {
  if (_recordCacheDisabled_) return getAllRecords_(dbId, sheetName);
  const key = String(dbId) + '|' + String(sheetName);
  let snapshot = _readOnlySnapshots_[key];
  if (!snapshot) {
    let raw = _recordCache_[key];
    if (!raw) {
      const sheet = getSheet_(sheetName, dbId);
      const headers = getHeaders_(sheet);
      countSheetRead_();
      const data = sheet.getDataRange().getValues();
      raw = { data: data, headers: headers };
      _recordCache_[key] = raw;
    }
    const rows = Math.max(0, (raw.data || []).length - 1);
    const estimatedBytes = (raw.data || []).reduce(function (total, row) {
      return total + (row || []).reduce(function (n, value) {
        return n + 16 + String(value == null ? '' : value).length * 2;
      }, 0);
    }, (raw.headers || []).length * 32);
    if (rows > READ_ONLY_SNAPSHOT_MAX_ROWS_ ||
        _readOnlySnapshotBytes_ + estimatedBytes > READ_ONLY_SNAPSHOT_MAX_BYTES_) {
      return buildRecordsFromRaw_(raw.data, raw.headers);
    }
    snapshot = { data: raw.data, headers: raw.headers, rows: null,
      estimatedBytes: estimatedBytes, retainedRows: rows };
    _readOnlySnapshots_[key] = snapshot;
    _readOnlySnapshotBytes_ += estimatedBytes;
  }
  if (!snapshot.rows) snapshot.rows = buildRecordsFromRaw_(snapshot.data, snapshot.headers);
  return snapshot.rows;
}
/* ══ [I1] EXACTLY ONCE — a replayed write must never create a second row ═════
 *
 * THE RISK, and it is the largest one the optimistic-save design introduces.
 * A transport failure is *ambiguous*: the request may have reached the server
 * and COMMITTED before the connection dropped. The client's queue then replays
 * it. Nothing in the write path is idempotent — every add_* handler appends —
 * so the replay writes the row AGAIN. On a cash movement or a stock scan that
 * is duplicated money or duplicated stock, and neither the user nor the sheet
 * shows any sign that it happened.
 *
 * THE NATURAL KEY, and why it is not a new column. `unique_id` already exists
 * on these tables and already identifies a row; the client mints it, sends it,
 * and re-sends the SAME one on every retry because it lives in the queued
 * payload. So "have I already committed this request?" and "does a row with
 * this unique_id exist?" are the same question, answered from columns that are
 * already there. A `request_uid` column would be a schema change, and the
 * schema is not this programme's to touch — that constraint dictated the
 * design rather than the other way round. Same discipline as the audit-queue
 * drain above, which dedupes on record_uid/column_name/action/changed_at for
 * exactly the same reason.
 *
 * THE CRASH MATRIX, stated the way drainHistoryQueue_ states its own:
 *   died BEFORE the write   no row exists. The replay finds nothing and writes.
 *                           NOTHING LOST.
 *   died AFTER the write,   the row exists, carrying the client's unique_id.
 *   before the reply        The replay finds it and returns it as success
 *                           without writing. NOTHING DUPLICATED. This is the
 *                           case that actually happens, and the one worth
 *                           testing.
 *   the reply arrived       Nothing is queued at all; there is no replay.
 *
 * WHAT THIS DOES NOT DO. It does not scan for duplicates that already exist,
 * and it never deletes anything. I1 prevents duplicates at the source; a job
 * that removes rows it believes are duplicates is a data-loss engine.
 *
 * COST. One column of the target table, read the way maxIdOf_ reads one column
 * — the same cost class as the id allocation the same handler already pays,
 * and it reads the WHOLE column rather than a tail on purpose: a queued change
 * can be replayed hours later, from a phone that spent the night in a pocket,
 * so a tail scan would silently stop deduping exactly when it matters most.
 */

/**
 * The first row whose `columnName` equals `value`, as a lowercase-keyed record,
 * or null. Read-only.
 */
function findRowByColumn_(dbId, sheetName, columnName, value) {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName)) return systemFindByBusinessKey_(sheetName, columnName, value);
  const want = String(value == null ? '' : value).trim();
  if (!want) return null;
  const sheet = getSpreadsheet_(dbId).getSheetByName(sheetName);
  if (!sheet) return null;
  const headers = getHeaders_(sheet);
  const wantCol = String(columnName || 'unique_id').trim().toLowerCase();
  const idx = headers.findIndex(h => String(h).trim().toLowerCase() === wantCol);
  if (idx === -1) return null;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  countSheetRead_();
  const col = sheet.getRange(2, idx + 1, last - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === want) {
      countSheetRead_();
      const row = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
      const rec = {};
      headers.forEach((h, c) => { rec[String(h).trim().toLowerCase()] = row[c]; });
      return rec;
    }
  }
  return null;
}

/**
 * [I1] The exactly-once guard. Call it FIRST in a queueable add handler:
 *
 *     const dup = liveDedupe_(dbId, SHEET, d.unique_id);
 *     if (dup) return liveDedupeReply_(dup);
 *
 * Returns the already-committed record when this request has been seen, and
 * null when it has not — including when the client sent no unique_id at all, in
 * which case the action is simply not queueable (plan §4.3) and the handler
 * behaves exactly as it always has.
 *
 * Deliberately NOT wrapped in a try/catch that swallows. The audit drain can
 * afford "no dedupe, worst case a duplicated audit row"; a business table
 * cannot. If the table cannot be read, the handler's own write would fail on
 * the same sheet a moment later anyway, so letting it throw loses nothing and
 * refuses rather than risking a second money row.
 */
function liveDedupe_(dbId, sheetName, uniqueId) {
  return findRowByColumn_(dbId, sheetName, 'unique_id', uniqueId);
}

/** The success reply for a request that had already been committed. */
function liveDedupeReply_(record, message) {
  return {
    status: 'success',
    deduped: true,
    message: message || 'تم الحفظ',
    data: { record: record }
  };
}

/**
 * Add a record to a sheet. Assigns the ID via getNextIdUnderLock_ (the canonical
 * counter logic) inside a single lock acquisition — no nested locking.
 * All sheet writes must go through this or getNextId_.
 */
function addRecord_(dbId, sheetName, dataMap, requiredFields) {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName)) return systemAddRecordCompat_(sheetName, dataMap, requiredFields);
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
 * Row-edit repair (Stage 2): formula-safe patch for keyed record updates.
 *
 * Same match contract as updateRowByCriteria_ (case-insensitive header and
 * criteria match; returns true when a row matches, false when none does) but
 * writes ONLY cells that satisfy both conditions:
 *   1. the update map names the column (case-insensitive, as before), and
 *   2. the cell does not currently hold a sheet formula.
 * Cells holding formulas are preserved unconditionally — even when the update
 * map names them — so evaluated values are never written back over live
 * expressions and array/spill outputs are never clipped. Update keys with no
 * matching header are ignored, as with updateRowByCriteria_.
 *
 * Adjacent writable columns are written in single contiguous setValues calls;
 * formula cells, untouched columns and unknown keys break batches, so a write
 * can never span a protected gap. Callers that must install or refresh
 * application-owned formulas use the explicit writeFormula_/writeRowFormulas_
 * path instead; this helper never writes a formula.
 *
 * The extra single-row getFormulas() read runs only after a row matches.
 * Callers must still check the Boolean result: false means no matching row
 * (missing record), never a silent success.
 */
function patchRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject) {
  const headers = getHeaders_(sheet);
  countSheetRead_();
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) throw new Error('Criteria header "' + criteriaHeader + '" not found.');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) {
      const formulas = sheet.getRange(i + 1, 1, 1, headers.length).getFormulas()[0];
      const cells = [];
      headers.forEach(function (header, colIdx) {
        const updateKey = Object.keys(updatesObject).find(k => k.trim().toLowerCase() === String(header).trim().toLowerCase());
        if (updateKey === undefined) return;
        if (formulas[colIdx]) return; /* live formula: preserve, never overwrite */
        cells.push({ col: colIdx, value: updatesObject[updateKey] });
      });
      /* Batch adjacent writable columns; a protected/untouched column ends the run. */
      let run = [];
      const flush = function () {
        if (!run.length) return;
        const start = run[0].col;
        sheet.getRange(i + 1, start + 1, 1, run.length).setValues([run.map(function (c) { return c.value; })]);
        run = [];
      };
      cells.forEach(function (c) {
        if (run.length && c.col !== run[run.length - 1].col + 1) flush();
        run.push(c);
      });
      flush();
      noteMutation_();
      noteSheetChange_(sheet);
      return true;
    }
  }
  return false;
}

/**
 * Phase 1 version-check (optimistic concurrency, static only).
 * No `version` column exists yet; AUDIT_COLUMNS has updated_at but business
 * headers lack version. Missing column/value safely defaults to 0 and unknown
 * `version` keys are ignored by patchRowByCriteria_, so this never backfills.
 */
function getRowVersion_(row) {
  if (!row) return 0;
  var v = row.version;
  if (v === undefined) {
    var k = Object.keys(row).find(function (kk) { return String(kk).trim().toLowerCase() === 'version'; });
    v = k ? row[k] : undefined;
  }
  if (v === undefined || v === null || v === '') return 0;
  var n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
function checkRowVersion_(oldRow, clientVersion) {
  var current = getRowVersion_(oldRow);
  var want = (clientVersion === undefined || clientVersion === null || clientVersion === '') ? 0 : Number(clientVersion);
  if (!isFinite(want) || want < 0) want = 0;
  else want = Math.floor(want);
  if (want !== current) {
    /* Pre-mutation optimistic-locking refusal: nothing has been written, so the
       request-guard ledger must record a confirmed failure (safe to correct and
       retry with a fresh request), never an uncertain outcome. */
    var _conflict = new Error('CONFLICT: stale version — reload and retry | تعارض: النسخة قديمة — أعد التحميل وحاول مجدداً');
    _conflict.notApplied = true; _conflict.code = 'REQUEST_NOT_APPLIED';
    throw _conflict;
  }
  return current;
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
 * Cache-key / version contract (Phase 4):
 *   Base key format:    refs_<dbId>_<kind>
 *   Versioned key:      refs_<dbId>_<kind>_v<version>
 *     Versioned callers (tlRefs_/tcRefs_/vfRefsCached_) append
 *     '_v' + <stamp> to `kind` BEFORE calling here, so the final
 *     CacheService key carries the stamp (e.g. refs_<dbId>_products_v171...).
 *   TTL: 600s for reference entries (TL_REF_TTL / TC_REF_TTL / FIN_REF_TTL_G).
 *     Stamps (tl_refs_ver_<dbId> / tc_refs_ver_<dbId> / vf_refs_ver_<dbId>)
 *     live 21600s (6h) and are bumped on write, not expired.
 *   Version bump rule: after EVERY successful write to a cached table
 *     (title_index/parties/products and per-company equivalents), bump the
 *     company's stamp (bumpTlRefsVersion_/bumpTcRefsVersion_/bumpVfRefsVersion_
 *     or the bust* wrapper) to orphan ALL derived versioned keys at once.
 *     ALSO call invalidateRefsCache_(dbId, kind) for each touched kind so
 *     legacy unstamped keys (refs_<dbId>_<kind> written before versioning)
 *     are removed too. Manual sheet edits bypass both and surface within TTL.
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
 * Layout: '<key>__m' is a stable pointer to immutable generation-specific chunks.
 * Chunks are published before the pointer, so readers see one complete generation or
 * a miss. The old sanitized namespace is not read: punctuation-colliding legacy
 * keys are ambiguous and must cold-migrate.
 */
function chunkedCacheKeyDigest_(value) {
  var text = String(value);
  try {
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest && Utilities.DigestAlgorithm && Utilities.Charset) {
      return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
        .map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('').slice(0, 16);
    }
  } catch (e) {}
  // Offline harnesses do not provide Utilities. Two independent 32-bit hashes
  // still keep sanitized/truncated cache namespaces isolated in that fallback.
  var h1 = 2166136261, h2 = 2246822519;
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 16777619);
    h2 ^= c + i; h2 = Math.imul(h2, 3266489917);
  }
  return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
}

function chunkedCacheKeys_(key) {
  var raw = String(key);
  var safe = raw.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 184);
  var scoped = 'ck2_' + safe + '_' + chunkedCacheKeyDigest_(raw);
  var generation = arguments.length > 1 && arguments[1] != null ? String(arguments[1]).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) : '';
  return { manifest: scoped + '__m', prefix: scoped + (generation ? '__g' + generation : '') + '__c', generation: generation, base: scoped };
}

// Read the pre-byte-aware namespace during the migration window. New writes
// always use chunkedCacheKeys_; removal clears both layouts for rollback safety.
function legacyChunkedCacheKeys_(key) {
  var safe = String(key).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 200);
  return { manifest: safe + '__m', prefix: safe + '__c' };
}

function utf8ByteLength_(text) {
  try { return encodeURIComponent(String(text)).replace(/%[0-9A-F]{2}/g, 'x').length; }
  catch (e) { return String(text).length; }
}

function utf8Chunks_(text, maxBytes) {
  var chunks = [], part = '', bytes = 0;
  Array.from(String(text)).forEach(function (ch) {
    var n = utf8ByteLength_(ch);
    if (part && bytes + n > maxBytes) { chunks.push(part); part = ''; bytes = 0; }
    part += ch; bytes += n;
  });
  if (part || !chunks.length) chunks.push(part);
  return chunks;
}

function chunkedCacheEpochKey_(key) {
  return 'ck2e_' + chunkedCacheKeyDigest_(String(key));
}

function chunkedCacheGeneration_() {
  var uuid = '';
  try { if (Utilities && Utilities.getUuid) uuid = String(Utilities.getUuid()); } catch (e) {}
  if (!uuid) uuid = String(new Date().getTime()) + '_' + String(Math.random()).slice(2);
  return uuid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'g' + String(new Date().getTime());
}

function withChunkedCacheLock_(fn) {
  var lock = null;
  try {
    if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) return null;
    }
    return fn();
  } catch (e) { return null; }
  finally { try { if (lock) lock.releaseLock(); } catch (e2) {} }
}

function removeChunkedPublication_(cache, keys, maxChunks) {
  if (!keys || !keys.generation) return;
  var all = [];
  for (var i = 0; i < maxChunks; i++) all.push(keys.prefix + i);
  if (all.length) cache.removeAll(all);
}

function readChunkedCache_(keys, maxChunks) {
  try {
    var cache = CacheService.getScriptCache();
    var manifestRaw = cache.get(keys.manifest);
    if (!manifestRaw) return null;
    var manifest = JSON.parse(manifestRaw);
    if (!manifest || !manifest.g || (keys.generation && String(manifest.g) !== String(keys.generation))) return null;
    var n = Number(manifest.n);
    if (!isFinite(n) || n < 1 || n !== Math.floor(n) || n > maxChunks) return null;
    var chunkKeys = [], payload = '';
    for (var i = 0; i < n; i++) chunkKeys.push(keys.prefix + i);
    var map = cache.getAll(chunkKeys) || {};
    for (var j = 0; j < n; j++) {
      var ck = keys.prefix + j;
      if (map[ck] === undefined || map[ck] === null) return null;
      payload += map[ck];
    }
    if (Number(manifest.bytes) !== utf8ByteLength_(payload) || String(manifest.h || '') !== chunkedCacheKeyDigest_(payload)) return null;
    return JSON.parse(payload);
  } catch (e) { return null; }
}

function putChunkedCache_(key, value, ttlSeconds) {
  try {
    var baseKeys = chunkedCacheKeys_(key);
    var cache = CacheService.getScriptCache();
    var payload = JSON.stringify(value);
    var chunkSize = Number(CONFIG.TABLE_CACHE_CHUNK_SIZE || 90000);
    var maxChunks = Number(CONFIG.TABLE_CACHE_MAX_CHUNKS || 50);
    var chunks = utf8Chunks_(payload, chunkSize);
    if (!isFinite(chunkSize) || chunkSize < 1 || !isFinite(maxChunks) || maxChunks < 1 || chunks.length > maxChunks || chunks.some(function (c) { return utf8ByteLength_(c) > chunkSize; })) return false;
    var generation = chunkedCacheGeneration_();
    var keys = chunkedCacheKeys_(key, generation);
    var epochKey = chunkedCacheEpochKey_(key);
    var epoch = cache.get(epochKey) || '0';
    var put = {};
    chunks.forEach(function (c, i) { put[keys.prefix + i] = c; });
    // Chunks are immutable and unreferenced until the manifest is written.
    cache.putAll(put, ttlSeconds);
    var published = withChunkedCacheLock_(function () {
      var currentEpoch = cache.get(epochKey) || '0';
      if (String(currentEpoch) !== String(epoch)) {
        removeChunkedPublication_(cache, keys, maxChunks);
        return false;
      }
      var oldManifest = null;
      try { oldManifest = JSON.parse(cache.get(baseKeys.manifest) || ''); } catch (e) {}
      cache.put(baseKeys.manifest, JSON.stringify({ v: 2, g: generation, n: chunks.length, bytes: utf8ByteLength_(payload), h: chunkedCacheKeyDigest_(payload), ts: new Date().getTime() }), ttlSeconds);
      if (oldManifest && oldManifest.g && String(oldManifest.g) !== generation) removeChunkedPublication_(cache, chunkedCacheKeys_(key, oldManifest.g), maxChunks);
      return true;
    });
    return published === true;
  } catch (e) { return false; }
}

/** @return the cached value, or null on any miss. */
function getChunkedCache_(key) {
  try {
    var maxChunks = Number(CONFIG.TABLE_CACHE_MAX_CHUNKS || 50);
    var base = chunkedCacheKeys_(key);
    var raw = CacheService.getScriptCache().get(base.manifest);
    if (!raw) return null;
    var manifest = JSON.parse(raw);
    if (!manifest || !manifest.g) return null;
    return readChunkedCache_(chunkedCacheKeys_(key, manifest.g), maxChunks);
  } catch (e) { return null; }
}

function removeChunkedCache_(key) {
  try {
    var maxChunks = Number(CONFIG.TABLE_CACHE_MAX_CHUNKS || 50);
    var base = chunkedCacheKeys_(key);
    withChunkedCacheLock_(function () {
      var cache = CacheService.getScriptCache();
      var current = null;
      try { current = JSON.parse(cache.get(base.manifest) || ''); } catch (e) {}
      var epochKey = chunkedCacheEpochKey_(key);
      cache.put(epochKey, String(Number(cache.get(epochKey) || 0) + 1), 21600);
      cache.remove(base.manifest);
      if (current && current.g) removeChunkedPublication_(cache, chunkedCacheKeys_(key, current.g), maxChunks);
      // Legacy fixed-key entries are safe to remove, but never read.
      var legacy = legacyChunkedCacheKeys_(key), old = [legacy.manifest];
      for (var i = 0; i < maxChunks; i++) old.push(legacy.prefix + i);
      cache.removeAll(old);
      return true;
    });
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
 * byPk preserves the pre-optimization Map contract from indexById: stored
 * trimmed keys and lowercase aliases are indexed, but Map queries are not
 * normalized. Callers that need an alias must probe it explicitly. The whole
 * entry { rows, byPk, pks, headers } is memoised per request; rows and the
 * records byPk returns are SHARED objects across memo hits — do not mutate
 * them unless you are the sole owner of this read.
 */
const _pkIndexCache_ = {};

/**
 * Generalised O(1) id index over an in-memory row array (Phase 4).
 * Use instead of rows.find(function(r){ return String(r.id)===String(x); })
 * or full-range forEach scans for party/product lookups.
 *
 * MATCHING CONTRACT (Task 1B — read before converting a .find() to this):
 * - Header resolution: idField is matched case-insensitively and after trim
 *   against the record keys; the record's own key spelling is used to read
 *   the value. Default field is 'id'.
 * - Stored ids are keyed by their trimmed string form AND their lowercase
 *   alias. Queries are ordinary Map queries: whitespace is not removed and
 *   case is not repaired unless the caller explicitly probes the alias.
 * - Duplicate precedence: LAST match wins, as in the pre-optimization Map.
 * - Blank/null ids are skipped (never indexed). A miss returns undefined
 *   from get() / false from has() — callers decide what a miss means.
 * - Numeric ids are string-normalized (7 and '7' are the same key; the
 *   first-stored row wins).
 * - Ownership: the Map holds REFERENCES to the caller's row objects. When
 *   obtained via getRecordsByPk_ the entry (rows + index) is memoised for
 *   the request, so mutating a returned record is visible to later readers
 *   in the same request. Treat returned records as read-only unless you
 *   own the rows array you passed in.
 *
 * @param {Array} rows - records from getAllRecords_ (or a cached accessor).
 * @param {string} idField - id column name, default 'id' (case-insensitive).
 * @return {Map} the pre-optimization exact-query Map with lowercase aliases.
 */
function indexById(rows, idField) {
  var want = String(idField == null || idField === '' ? 'id' : idField).trim().toLowerCase() || 'id';
  var byId = new Map();
  if (!rows || !rows.length) return byId;
  var actual = null;
  try {
    var sample = rows[0];
    for (var k in sample) {
      if (String(k).trim().toLowerCase() === want) { actual = k; break; }
    }
  } catch (e) { actual = null; }
  rows.forEach(function (r) {
    var raw = actual !== null ? r[actual] : (r[want] !== undefined ? r[want] : r[idField]);
    var pk = String(raw == null ? '' : raw).trim();
    if (!pk) return;
    var lc = pk.toLowerCase();
    // Preserve the original last-write-wins behavior for both the stored key
    // and lowercase alias. Query normalization belongs to callers, not here.
    byId.set(pk, r);
    byId.set(lc, r);
  });
  return byId;
}

function getRecordsByPk_(dbId, sheetName, pkColumn) {
  const pkLc = String(pkColumn || 'id').trim().toLowerCase();
  const key = dbId + '|' + sheetName + '|' + pkLc;
  if (!_recordCacheDisabled_ && _pkIndexCache_[key]) return _pkIndexCache_[key];

  const rows = getAllRecords_(dbId, sheetName);
  const headers = getHeaders_(getSheet_(sheetName, dbId)).map(function (h) { return String(h).trim(); });
  let pkHeader = null;
  headers.forEach(function (h) { if (h.toLowerCase() === pkLc) pkHeader = h; });

  const byPk = indexById(rows, pkHeader || pkColumn || 'id');
  const pks = [];
  rows.forEach(function (r) {
    const raw = pkHeader !== null && r[pkHeader] !== undefined ? r[pkHeader] : r[pkLc];
    const pk = String(raw == null ? '' : raw).trim();
    if (!pk) return;
    pks.push(pk);
  });

  const entry = { rows: rows, byPk: byPk, pks: pks, headers: headers, pkHeader: pkHeader || pkColumn };
  if (!_recordCacheDisabled_) _pkIndexCache_[key] = entry;
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
// Phase 5 — shared totals lib (single source of truth for all companies)
// No rounding applied here: callers preserve existing raw-float behavior.
// Apply round2_/roundQty_ at the display/write layer only, never in here.
// ==========================================
function sharedNum0_(v) { return Math.max(0, Number(v) || 0); }

/** Global compat alias. Per-file num0_ wrappers delegate to sharedNum0_. */
function num0_(v) { return sharedNum0_(v); }

function calcLineNet_(qty, price) { return sharedNum0_(qty) * sharedNum0_(price); }

/**
 * Shared invoice totals. Accepts generic {qty,price,tax,discount} and also
 * TopLight {product_qty,product_price,product_tax,product_discount} shapes.
 * discountPercent (header-level, e.g. TopLight discount_percent) defaults to 0
 * for Valley-style invoices with no header discount.
 * Returns {net,tax,discount,total} with total = net - discount + tax.
 */
function calcTotals_(lines, discountPercent) {
  var dp = sharedNum0_(discountPercent);
  var net = 0, tax = 0, discount = 0;
  (lines || []).forEach(function (l) {
    var qty = (l && l.qty !== undefined) ? l.qty : (l ? l.product_qty : 0);
    var price = (l && l.price !== undefined) ? l.price : (l ? l.product_price : 0);
    var taxRate = (l && l.tax !== undefined) ? l.tax : (l ? l.product_tax : 0);
    var disc = (l && l.discount !== undefined) ? l.discount : (l ? l.product_discount : 0);
    var nv = calcLineNet_(qty, price);
    net += nv;
    discount += sharedNum0_(disc);
    tax += nv * sharedNum0_(taxRate);
  });
  discount += net * dp;
  return { net: net, tax: tax, discount: discount, total: net - discount + tax };
}

/**
 * Shared manufacture total (JS source of truth). Components carry resolved
 * numbers [{qty, unitCost[, mult]}]; the Sheet-formula builder in
 * Company_TopChemical_Actions.js is display-only. mult covers the T×M / T×N
 * movement-part multipliers.
 */
function calcManufactureTotal_(components) {
  var total = 0;
  (components || []).forEach(function (c) {
    var m = (c && c.mult !== undefined && c.mult !== null && c.mult !== '') ? Number(c.mult) : 1;
    if (!isFinite(m)) m = 1;
    var unitCost = (c && c.unitCost !== undefined) ? c.unitCost : (c ? c.price : 0);
    total += calcLineNet_(c ? c.qty : 0, unitCost) * m;
  });
  return total;
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
  const allHeaders = (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName))
    ? Object.keys(newValues || oldValues || {})
    : getHeaders_(getSheet_(sheetName, dbId)).map(function (h) { return String(h).trim(); });
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

/* Phase 5 — afterWrite(docType, change): single audit fan-out for the shared
 * save path (saveRecordWithAudit_ / approveRecordWithAudit_). Writes
 * ERP_Record_History old/new via logHistory_ AND a SystemLog entry with
 * RecordID = record_uid, linking SystemLog.RecordID ↔ record_uid.
 * Never throws: audit failure must not fail the save (RT-1b).
 * Per-handler manual logHistory_ calls remain for direct-write paths that do
 * not go through the shared saver; they are compat, not duplicates of this. */
function afterWrite_(docType, change) {
  var c = change || {};
  var dbId = c.dbId || CONFIG.AUTH_SPREADSHEET_ID;
  var sheetName = c.sheetName || docType;
  var recordUid = c.recordUid || '';
  var recordId = (c.recordId !== undefined) ? c.recordId : null;
  var user = c.user || '';
  var action = c.action || 'update';
  var newValues = (c.newValues !== undefined) ? c.newValues : null;
  var oldValues = (c.oldValues !== undefined) ? c.oldValues : null;
  try { logHistory_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues); }
  catch (eHist) { try { Logger.log('AUDIT-SKIPPED afterWrite ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
  try {
    var changed = '';
    try { changed = JSON.stringify({ record_uid: recordUid, action: action }); } catch (eJ) { changed = String(recordUid); }
    writeSystemLogLink_(sheetName, recordUid, user, action, changed);
  } catch (eSys) { try { console.error('afterWrite SystemLog link skipped: ' + (eSys && eSys.message)); } catch (e2) {} }
  return { status: 'success', record_uid: recordUid };
}

/* Phase 5 — SystemLog bridge: RecordID is always record_uid so
 * SystemLog.RecordID ↔ ERP_Record_History.record_uid. Defensive: uses the
 * existing SystemLog infra when present, otherwise skips silently. */
function writeSystemLogLink_(table, recordUid, userEmail, action, changedFields) {
  try {
    var logId = (typeof Utilities !== 'undefined' && Utilities.getUuid) ? Utilities.getUuid() : ('log_' + new Date().getTime());
    var values = {
      logid: logId,
      timestamp: new Date(),
      companyid: '',
      companyname: '',
      action: action,
      sourceaction: 'afterWrite:' + String(table || ''),
      recordid: String(recordUid || ''),
      useremail: String(userEmail || ''),
      changedfields: String(changedFields || ''),
      status: 'success',
      errormessage: '',
      table: String(table || ''),
      page: ''
    };
    if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') {
      if (typeof systemCreateRecord_ === 'function') {
        systemCreateRecord_('SystemLog', values, { operationId: 'system-log:' + values.logid });
        return;
      }
    }
    if (typeof ensureSystemLogSheet_ === 'function' && typeof SYSTEM_LOG_HEADERS !== 'undefined') {
      var entry = SYSTEM_LOG_HEADERS.map(function (h) {
        var v = values[String(h).toLowerCase()];
        return (v === undefined || v === null) ? '' : v;
      });
      if (typeof appendRowWithRetry_ === 'function') appendRowWithRetry_(ensureSystemLogSheet_(), entry);
      else ensureSystemLogSheet_().appendRow(entry);
    }
  } catch (e) { try { console.error('writeSystemLogLink_ skipped: ' + (e && e.message)); } catch (e2) {} }
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

function enqueueHistoryRowsFirestore_(rows) {
  rows.forEach(function (hr) {
    var required = ['sheet_name', 'record_uid', 'action', 'column_name'];
    var missing = required.filter(function (k) { return hr[k] === undefined || hr[k] === null || String(hr[k]).trim() === ''; });
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
    var natural = [hr.record_uid, hr.column_name, hr.action, hr.changed_at instanceof Date ? hr.changed_at.toISOString() : String(hr.changed_at || '')].join('|');
    var eventId = firestoreOperationId_('history:' + natural);
    systemCreateRecord_('ERP_History_Queue', Object.assign({ event_id: eventId, state: 'pending', attempts: 0, queued_at: new Date(), claim_id: '', claimed_at: null, last_error: '' }, hr), { operationId: 'history-queue:' + eventId });
  });
}

function drainHistoryQueueFirestore_() {
  var claimId = 'fsd_' + new Date().getTime().toString(36) + '_' + Utilities.getUuid().slice(0, 8), now = new Date(), taken = 0, written = 0, deduped = 0, stale = 0;
  var queued = systemStore_().queryAll('ERP_History_Queue', {}).records;
  queued.forEach(function (record) {
    var d = record.data || {}, meta = record.meta || {}, state = String(d.state || 'pending').toLowerCase(), claimedAt = new Date(d.claimed_at || 0).getTime();
    var reclaim = state === 'claimed' && (!isFinite(claimedAt) || now.getTime() - claimedAt > HISTORY_CLAIM_STALE_MS_);
    if (state === 'done' || (state !== 'pending' && !reclaim)) return;
    if (now.getTime() - new Date(d.queued_at || now).getTime() > HISTORY_STALE_REPORT_MS_) stale++;
    var claimed;
    try {
      claimed = systemPatchRecord_('ERP_History_Queue', meta.documentId, { state: 'claimed', claim_id: claimId, claimed_at: now, attempts: (Number(d.attempts) || 0) + 1 }, { expectedUpdateTime: meta.updateTime });
      taken++;
    } catch (claimError) { return; }
    try {
      var history = {};
      ['sheet_name', 'record_uid', 'record_id', 'action', 'column_name', 'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at', 'event_id'].forEach(function (k) { if (d[k] !== undefined) history[k] = d[k]; });
      systemCreateRecord_('ERP_Record_History', history, { operationId: 'history:' + String(d.event_id || '') });
      var done = systemPatchRecord_('ERP_History_Queue', meta.documentId, { state: 'done', processed_at: new Date(), last_error: '' }, { expectedUpdateTime: claimed.meta && claimed.meta.updateTime });
      try { systemRemoveRecord_('ERP_History_Queue', meta.documentId, { expectedUpdateTime: done.meta && done.meta.updateTime }); } catch (removeError) {}
      written++;
    } catch (writeError) {
      try { systemPatchRecord_('ERP_History_Queue', meta.documentId, { state: 'pending', last_error: String(writeError.message || writeError).slice(0, 1000) }, { expectedUpdateTime: claimed.meta && claimed.meta.updateTime }); } catch (retryError) {}
    }
  });
  if (stale) try { console.error('ERP_History_Queue: ' + stale + ' audit row(s) exceeded the stale-report threshold.'); } catch (e) {}
  return { status: 'success', rows: taken, written: written, deduped: deduped, stale: stale, claim: claimId, backend: 'firestore' };
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
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') return drainHistoryQueueFirestore_();
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
 * The natural keys of the last 
` rows of ERP_Record_History, as a lookup.
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
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') {
    var fsOut = {};
    try { systemStore_().query('ERP_Record_History', { orderBy: [{ field: 'changed_at', direction: 'DESCENDING' }], limit: n }).records.map(function (r) { return r.data; }).slice(-n).forEach(function (r) { fsOut[historyRowKey_(r)] = true; }); } catch (e) {}
    return fsOut;
  }
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
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') { writeHistoryRowsFirestore_(rows); return; }
  if (HISTORY_QUEUE_ENABLED_ && enqueueHistoryRows_(rows)) return;
  writeHistoryRowsDirect_(rows);
}

function writeHistoryRowsFirestore_(rows) {
  var items = rows.map(function (hr) {
    var required = ['sheet_name', 'record_uid', 'action', 'column_name'];
    var missing = required.filter(function (k) { return hr[k] === undefined || hr[k] === null || String(hr[k]).trim() === ''; });
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
    var eventId = firestoreOperationId_([
      hr.record_uid, hr.column_name, hr.action,
      hr.changed_at instanceof Date ? hr.changed_at.toISOString() : String(hr.changed_at || '')
    ].join('|'));
    return { record: Object.assign({ event_id: eventId }, hr), operationId: 'history:' + eventId };
  });
  var config = systemStorageTarget_(), collection = systemSchema_('ERP_Record_History').collection;
  firestoreCreateDocuments_(config, collection, items);
}

/** The batched write itself — one lock, one id allocation, one setValues.
 *  Unchanged, and still the fallback and the drain's own writer. */
function writeHistoryRowsDirect_(rows) {
  if (!rows || !rows.length) return;
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') { writeHistoryRowsFirestore_(rows); return; }
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
    /* Phase 5: shared-path audit fan-out — History old/new + SystemLog link (RecordID=record_uid). */
    try { afterWrite_(sheetName, { dbId: dbId, sheetName: sheetName, recordUid: uid, recordId: null, user: currentUser, action: action || 'create', newValues: merged, oldValues: null }); }
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
  var __curVer = checkRowVersion_(old, dataMap && (dataMap.version !== undefined ? dataMap.version : dataMap.Version));
  newValues.version = __curVer + 1;
  const ok = patchRowByCriteria_(sheet, pk, existingRowId, newValues);
  if (!ok) return { status: 'error', message: 'Row not found for update: ' + existingRowId };
  /* [RT-1b] The create branch above has always wrapped logHistory_ and logged
   * AUDIT-SKIPPED; this branch did not, and the difference was a live bug.
   * patchRowByCriteria_ has ALREADY committed the change on the line above, so
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
  try { afterWrite_(sheetName, { dbId: dbId, sheetName: sheetName, recordUid: oldUid, recordId: existingRowId, user: currentUser, action: action || 'update', newValues: newValues, oldValues: old }); }
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
  var __curVerAp = checkRowVersion_(old, approveMap && (approveMap.version !== undefined ? approveMap.version : approveMap.Version));
  merged.version = __curVerAp + 1;
  const ok = patchRowByCriteria_(sheet, pk, rowId, merged);
  if (!ok) return { status: 'error', message: 'Row not found for approve: ' + rowId };
  /* [RT-1b] Same asymmetry, same fix, same reason as the update branch below:
   * patchRowByCriteria_ has already committed the approval by the time this
   * line runs, so an audit failure here must not be reported as a failed
   * approve. */
  try { afterWrite_(sheetName, { dbId: dbId, sheetName: sheetName, recordUid: oldUid, recordId: rowId, user: currentUser, action: 'approve', newValues: merged, oldValues: old }); }
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

/* ══ Phase 6 — approvals as DATA + Valley-parity idempotency guard ═══
 *
 * (1) APPROVAL_CHAINS. Every approval step in the system is one row here:
 *     { docType, step, role, required } plus the write routing the engine
 *     needs (sheet, keyColumn, kind, versioned). ADDING A STEP = ONE TABLE
 *     ROW — e.g. to add a second TopLight sales approver, append
 *       { docType: 'tl_sales', step: 'second', role: 'tl_manager',
 *         required: true, sheet: 'top_light_sales_invoices',
 *         keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true }
 *     and call approveStep_('tl_sales', id, 'second', user, { dbId: dbId }).
 *     There is deliberately NO if/switch on docType anywhere below:
 *     getApprovalChain_/requestApprove_/approveStep_ FILTER this table, and
 *     the column patch is chosen by a map lookup on the row's `kind` field.
 *     If you are about to write `if (docType === ...)` here, add a row
 *     instead. No sheet, column, or migration is involved — this table lives
 *     in code, so approval routing changes without touching data.
 *
 * (2) requestDedupeExecute_ + REQUEST_DEDUPE_PROBE_COLUMNS_. The Valley pattern
 *     (liveDedupe_ on unique_id) as a reusable guard for the TC/TL large
 *     multi-step saves that still mint a fresh id on every call: callers
 *     accept an incoming request_key/unique_id, probe with this helper, and
 *     return the committed row on replay instead of writing a second
 *     document. Probes are null-safe when a column does not exist
 *     (findRowByColumn_ returns null), so no schema change is required.
 */
var APPROVAL_CHAINS = [
  { docType: 'tl_purchasing', step: 'approve', role: 'tl_approver', required: true, sheet: 'top_light_purchasing_costing', keyColumn: 'unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
  { docType: 'tl_sales', step: 'approve', role: 'tl_approver', required: true, sheet: 'top_light_sales_invoices', keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
  { docType: 'tl_cash', step: 'approve', role: 'tl_approver', required: true, sheet: 'top_light_cash_bank_movement', keyColumn: 'transaction_id', kind: 'cash', versioned: true, missingMsg: 'الحركة غير موجودة' },
  { docType: 'tl_sales_offer', step: 'approve', role: 'tl_approver', required: true, sheet: 'top_light_sales_offer', keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true, missingMsg: 'العرض غير موجود' },
  { docType: 'valley_purchasing', step: 'approve', role: 'valley_approver', required: true, sheet: 'valley_purchasing_costing', keyColumn: 'Code', kind: 'standard', versioned: false, missingMsg: 'عملية الشراء غير موجودة' },
  { docType: 'valley_purchasing', step: 'quality', role: 'valley_quality', required: true, sheet: 'valley_purchasing_costing', keyColumn: 'Code', kind: 'quality', versioned: false, missingMsg: 'عملية الشراء غير موجودة' }
];

/* Patch builders keyed by the row's `kind` — a data lookup, not a branch
 * on docType. `standard` mirrors the TL purchase/sales/offer approvers,
 * `cash` mirrors approveCash_ ({approved,user}), `quality` mirrors the
 * Valley quality approver. */
var APPROVAL_PATCH_KINDS_ = {
  standard: function (email) { return { approval_status: 'Approved', approval: email, approval_time: new Date() }; },
  cash: function (email) { return { approved: true, user: email }; },
  quality: function (email) { return { quality_approval_status: 'Approved', quality_approval: email, quality_approval_time: new Date() }; }
};

/* All steps registered for a docType, in table order. Read-only. */
function getApprovalChain_(docType) {
  return APPROVAL_CHAINS.filter(function (r) { return String(r.docType) === String(docType); });
}

/* What must still approve this document — read-only, no write. Clients use
 * it to render approval buttons; the write itself is approveStep_. */
function requestApprove_(docType, id, user, opts) {
  var steps = getApprovalChain_(docType);
  if (!steps.length) throw new Error('Unknown approval docType: ' + docType);
  return {
    status: 'success',
    docType: String(docType),
    id: (id == null ? '' : id),
    requested_by: (user && user.email) || '',
    steps: steps.map(function (s) { return { step: s.step, role: s.role, required: !!s.required }; })
  };
}

/* Advance one table-driven approval step. Resolves sheet/key/patch from the
 * APPROVAL_CHAINS row and delegates the write to the generic stamper
 * approveRecordWithAudit_ — this function contains no per-document logic. */
function approveStep_(docType, id, step, user, opts) {
  var o = opts || {};
  var key = String(id == null ? '' : id).trim();
  if (!key) throw new Error('Approval id is required');
  var entry = null;
  APPROVAL_CHAINS.some(function (r) {
    if (String(r.docType) === String(docType) && String(r.step) === String(step)) { entry = r; return true; }
    return false;
  });
  if (!entry) throw new Error('Unknown approval step: ' + docType + '/' + step);
  var email = (user && user.email) || '';
  var build = APPROVAL_PATCH_KINDS_[String(entry.kind || 'standard')] || APPROVAL_PATCH_KINDS_.standard;
  var approveMap = build(email);
  if (entry.versioned) {
    approveMap.version = (o.version !== undefined ? o.version : o.Version);
  } else {
    /* Unversioned legacy steps (both Valley steps): these approvers never
     * took a client version, so asserting the CURRENT version keeps the
     * shared stamper's check a no-op while the counter still advances —
     * exactly today's behaviour, enforced optimistic locking not added. */
    var db0 = o.dbId || CONFIG.AUTH_SPREADSHEET_ID;
    var old0 = null;
    try {
      old0 = getAllRecords_(db0, entry.sheet).find(function (r) { return String(r[entry.keyColumn]) === String(key); }) || null;
    } catch (eRead) { old0 = null; }
    approveMap.version = getRowVersion_(old0);
  }
  var out = approveRecordWithAudit_(o.dbId, entry.sheet, key, approveMap, email, null, null, null, entry.keyColumn);
  if (!out || out.status !== 'success') {
    /* Preserve each wrapper's legacy not-found message from the row's own
     * `missingMsg` — still data, still no docType branch. */
    var mOut = String((out && out.message) || '');
    if (mOut.indexOf('Row not found') !== -1) throw new Error(entry.missingMsg || ('Row not found for approve: ' + key));
    throw new Error(mOut || (entry.missingMsg || 'Approve failed'));
  }
  return out;
}

/* Columns probed, in order, by requestDedupeExecute_. Documents intent only:
 * findRowByColumn_ returns null for a column a sheet does not have, so
 * sheets without request_key simply skip that probe — no migration.
 * NOTE: formerly named requestGuardExecute_/REQUEST_RECEIPT_HEADERS_, which
 * collided with the receipt-ledger guard of the same names in Code.js (one
 * global scope: the last definition silently won and the 4-arg probe call
 * sites received the wrong function). Renamed so each guard resolves
 * deterministically. */
var REQUEST_DEDUPE_PROBE_COLUMNS_ = ['request_key', 'unique_id', 'invoice_unique_id', 'created_at', 'user'];

/* Valley-parity exactly-once guard for queueable multi-step saves.
 * Query form requestDedupeExecute_(dbId, sheet, requestKey, uniqueId) returns
 * the already-committed row or null. Wrap form with a trailing fn executes
 * fn() once per key and returns liveDedupeReply_ on replay. */
function requestDedupeExecute_(dbId, sheetName, requestKey, uniqueId, fn) {
  var key = String(requestKey == null ? '' : requestKey).trim() || String(uniqueId == null ? '' : uniqueId).trim();
  var dup = null;
  if (key) {
    try { dup = liveDedupe_(dbId, sheetName, key); } catch (e1) { dup = null; }
    if (!dup) { try { dup = findRowByColumn_(dbId, sheetName, 'request_key', key); } catch (e2) { dup = null; } }
    if (!dup) { try { dup = findRowByColumn_(dbId, sheetName, 'invoice_unique_id', key); } catch (e3) { dup = null; } }
  }
  if (typeof fn === 'function') {
    if (dup) return liveDedupeReply_(dup);
    return fn();
  }
  return dup;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Phase 2 — central document status machine + pre-write validation gate.
 * Static only: no migration, no backfill, no data changes. Existing statuses
 * in sheets are untouched; this only gates FUTURE transitions/validations.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * DOC_STATUS_TRANSITIONS covers (keys lowercased; lookup is case-insensitive):
 *   tl_purchasing / tl_sales / tl_offer : Pending->Approved, Approved terminal
 *   tl_cash (approved bool)             : false->true, true terminal (one-way)
 *   tc_legal_cash (toggle)              : false<->true (both ways)
 *   vf_purchasing (dual legs)           : Pending->Approved each, Approved terminal;
 *                                         edit-blocked if either leg Approved —
 *                                         enforced via pseudo-target 'edit'
 *                                         (Pending->edit allowed, Approved->edit blocked)
 *   vf_mfg_order                        : Draft->In Progress->Locked->In Progress
 *   vf_mfg_agree                        : draft/active/completed + *->cancelled,
 *                                         cancelled terminal
 *   vf_sales_inv                        : Pending<->Approved + Approved delete-block —
 *                                         enforced via pseudo-target 'delete'
 *                                         (Pending->delete allowed, Approved->delete blocked)
 *   att_batch                           : active->reverted, reverted terminal
 *   payroll_month                       : open->closed, closed terminal (via insert)
 *
 * Pseudo-targets 'edit'/'delete' are NOT sheet values; they let edit/delete
 * guards route through the same table instead of keeping inline if(cur...) checks.
 */
var DOC_STATUS_TRANSITIONS = {
  tl_purchasing: { 'pending': ['approved'], 'approved': [] },
  tl_sales: { 'pending': ['approved'], 'approved': [] },
  tl_offer: { 'pending': ['approved'], 'approved': [] },
  tl_sales_offer: { 'pending': ['approved'], 'approved': [] },
  tl_cash: { 'false': ['true'], 'true': [] },
  tc_legal_cash: { 'false': ['true'], 'true': ['false'] },
  vf_purchasing: { 'pending': ['approved', 'edit'], 'approved': [] },
  vf_purchasing_quality: { 'pending': ['approved', 'edit'], 'approved': [] },
  vf_mfg_order: { 'draft': ['in progress'], 'in progress': ['locked'], 'locked': ['in progress'] },
  vf_mfg_agree: { 'draft': ['active', 'completed', 'cancelled'], 'active': ['completed', 'cancelled'], 'completed': ['cancelled'], 'cancelled': [] },
  vf_sales_inv: { 'pending': ['approved', 'delete'], 'approved': ['pending'] },
  att_batch: { 'active': ['reverted'], 'reverted': [] },
  vf_att_batch: { 'active': ['reverted'], 'reverted': [] },
  attendance_batch: { 'active': ['reverted'], 'reverted': [] },
  payroll_month: { 'open': ['closed'], 'closed': [] },
  payroll: { 'open': ['closed'], 'closed': [] },
  tc_payroll_month: { 'open': ['closed'], 'closed': [] }
};

function normDocStatus_(v) {
  if (v === true) return 'true';
  if (v === false) return 'false';
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === 'true' || s === 'false') return s;
  return s;
}

function normDocType_(docType) {
  var dt = String(docType == null ? '' : docType).trim().toLowerCase();
  if (dt === 'tl_sales_offer') return 'tl_offer';
  if (dt === 'vf_att_batch' || dt === 'attendance_batch') return 'att_batch';
  if (dt === 'payroll' || dt === 'tc_payroll_month') return 'payroll_month';
  if (dt === 'vf_purchasing_quality') return 'vf_purchasing';
  return dt;
}

/* Bool-returning gate. Unknown docType -> false (fail-closed). */
function canTransition(docType, from, to) {
  var dt = normDocType_(docType);
  var table = DOC_STATUS_TRANSITIONS[dt];
  if (!table) return false;
  var f = normDocStatus_(from);
  var t = normDocStatus_(to);
  var allowed = table[f];
  if (!allowed) return false;
  for (var i = 0; i < allowed.length; i++) {
    if (String(allowed[i]).toLowerCase() === t) return true;
  }
  return false;
}

/* Throwing helper. Throws on illegal transition; returns true otherwise.
 * A refused transition is a deterministic pre-mutation check, so the error is
 * marked notApplied: the request-guard ledger records a confirmed failure
 * (safe to correct and retry), never an uncertain outcome. */
function assertTransition_(docType, from, to, message) {
  if (!canTransition(docType, from, to)) {
    var _err = new Error(message || ('Invalid status transition: ' + docType + ' ' + from + ' -> ' + to));
    _err.notApplied = true; _err.code = 'REQUEST_NOT_APPLIED';
    throw _err;
  }
  return true;
}

/* ── validateBeforeWrite wiring ──────────────────────────────────────────
 * DOC_ACTION_TO_DOCTYPE_ maps module_action (lowercased) -> docType for the
 * Phase 2 commit paths. STATUS_ONLY_ACTIONS_ marks approve_/toggle_/cancel_/
 * revert_/close_/delete_ paths as status-only: they explicitly SKIP field
 * validation (documented choice) because their payloads carry only an id/code
 * + version, not header+lines. They remain gated on status via
 * canTransition/assertTransition_ in their handlers. Field validation runs
 * only on add_/edit_/save_ paths via registered validators (no logic duplicated
 * here — DOC_VALIDATORS_ entries call the existing company validators).
 */
var DOC_ACTION_TO_DOCTYPE_ = {
  'add_purchasing': 'tl_purchasing', 'edit_purchasing': 'tl_purchasing', 'delete_purchasing': 'tl_purchasing', 'approve_purchasing': 'tl_purchasing',
  'add_sales': 'tl_sales', 'edit_sales': 'tl_sales', 'delete_sales': 'tl_sales', 'approve_sales': 'tl_sales',
  'add_sales_offer': 'tl_offer', 'edit_sales_offer': 'tl_offer', 'delete_sales_offer': 'tl_offer', 'approve_sales_offer': 'tl_offer',
  'add_cash': 'tl_cash', 'edit_cash': 'tl_cash', 'delete_cash': 'tl_cash', 'approve_cash': 'tl_cash', 'add_transfer': 'tl_cash',
  'add_legal_costing': 'tc_costing', 'add_legal_costing_bundle': 'tc_costing', 'edit_legal_costing_bundle': 'tc_costing', 'delete_legal_costing': 'tc_costing',
  'add_legal_cash': 'tc_legal_cash', 'toggle_legal_cash_approved': 'tc_legal_cash',
  'close_payroll_month': 'payroll_month',
  'save_valley_purchasing_header_checkpoint': 'vf_purchasing', 'save_valley_purchasing_lines_checkpoint': 'vf_purchasing',
  'save_valley_purchasing_costing': 'vf_purchasing', 'delete_valley_purchasing_costing': 'vf_purchasing',
  'approve_valley_purchasing_costing': 'vf_purchasing', 'quality_approve_valley_purchasing_costing': 'vf_purchasing',
  'change_valley_mfg_status': 'vf_mfg_order', 'save_valley_mfg_order': 'vf_mfg_order',
  'save_valley_mfg_agreement': 'vf_mfg_agree', 'cancel_valley_mfg_agreement': 'vf_mfg_agree',
  'save_valley_invoice': 'vf_sales_inv', 'approve_valley_invoice': 'vf_sales_inv', 'delete_valley_invoice': 'vf_sales_inv',
  'commit_attendance_import': 'att_batch', 'revert_attendance_import': 'att_batch'
};

var STATUS_ONLY_ACTIONS_ = {
  'approve_purchasing': true, 'approve_sales': true, 'approve_sales_offer': true, 'approve_cash': true,
  'approve_valley_purchasing_costing': true, 'quality_approve_valley_purchasing_costing': true,
  'change_valley_mfg_status': true, 'cancel_valley_mfg_agreement': true,
  'approve_valley_invoice': true, 'delete_valley_invoice': true,
  'toggle_legal_cash_approved': true, 'revert_attendance_import': true, 'close_payroll_month': true,
  'delete_purchasing': true, 'delete_sales': true, 'delete_sales_offer': true, 'delete_cash': true,
  'delete_legal_costing': true, 'delete_valley_purchasing_costing': true
};

var DOC_VALIDATORS_ = {};

function registerDocValidator_(docType, fn) {
  DOC_VALIDATORS_[normDocType_(docType)] = fn;
}

function docTypeForAction_(action) {
  return DOC_ACTION_TO_DOCTYPE_[String(action == null ? '' : action).trim().toLowerCase()] || null;
}

function isStatusOnlyAction_(action) {
  return !!STATUS_ONLY_ACTIONS_[String(action == null ? '' : action).trim().toLowerCase()];
}

/* Central field-validation gate. docType + payload (full {module_action,data}
 * or raw data) + dbId. Status-only actions skip field validation explicitly;
 * all other known docTypes delegate to registered company validators. Unknown
 * docTypes / reads pass through. Validation errors are marked notApplied (safe
 * to correct and retry — thrown before any mutation). */
function validateBeforeWrite(docType, payload, dbId) {
  var action = null;
  var data = payload;
  if (payload && typeof payload === 'object' && ('module_action' in payload || 'data' in payload)) {
    action = payload.module_action || null;
    data = (payload.data !== undefined ? payload.data : payload);
  }
  if (!docType && action) docType = docTypeForAction_(action);
  if (action && isStatusOnlyAction_(action)) return true;
  var dt = docType ? normDocType_(docType) : (action ? normDocType_(docTypeForAction_(action) || '') : '');
  if (!dt) return true;
  var fn = DOC_VALIDATORS_[dt];
  if (typeof fn !== 'function') return true;
  try {
    fn(data, dbId);
  } catch (e) {
    if (e && e.notApplied === undefined) { try { e.notApplied = true; } catch (e2) {} }
    throw e;
  }
  return true;
}

