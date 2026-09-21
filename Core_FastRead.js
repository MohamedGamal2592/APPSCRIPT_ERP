/* ============================================================================
 * Core_FastRead.js — generic fast-read engine (primitive layer).
 *
 * WHAT THIS REPLACES
 * A reader that needs "the newest N rows" or "the child rows of one document"
 * currently materializes a whole sheet: every column of every row, as record
 * objects, on every request. The visible symptom is object building; the real
 * cost is service calls — each full read is one round trip with fixed latency,
 * paid again on the next page and the next execution.
 *
 * WHAT THIS DOES INSTEAD
 * A caller declares WHAT it needs and HOW it may be obtained. The engine
 * executes the declared strategy with the fewest service calls it can, and
 * reports honestly what it spent. There is no "generic fast list": a query that
 * the declared strategy cannot satisfy is refused, never answered partially.
 *
 * DECOUPLING CONTRACT (do not break)
 * Business-agnostic by design, like its write-side sibling. This file contains
 * no table or module names, no user-facing strings in any language and no
 * Arabic text; the static gate is a case-insensitive search for company and
 * module tokens returning zero hits, plus a search for the whole-sheet range
 * accessor returning zero hits (the gate's needle is spelled in halves below so
 * this file passes its own check). Callers pass sheet names, header names and their own predicates.
 * Errors are typed codes the owning module maps to its messages.
 *
 * FLAGS
 * FAST_READ_CORE_ is the master switch and defaults to false. Unlike the
 * write-side engine, the primitive functions here are NOT gated by it: plan
 * §7.5 requires shadow comparison to run the modern reader by function
 * reference while every user still runs the legacy path, so a primitive that
 * refused to run with the master flag off would make evidence impossible
 * before enablement. What the master flag gates is the MODULE opt-in, through
 * fastReadOnFor_(moduleFlag): a module serves users from this engine only when
 * its own flag and the master switch are both true.
 *
 * METRICS CONTRACT (every primitive, plan §5.1)
 *   serviceCalls — Apps Script/Sheets calls made (metadata + values + API).
 *   rowsScanned  — rows examined by a predicate or an index build. A direct
 *                  row fetch by row number is NOT a scan; its cost is in
 *                  cellsRead/bytesRead, and the strategies that fetch pages
 *                  report the scan and the fetch separately for that reason.
 *   colsRead     — sum of the column spans read (a repeated column counts again).
 *   cellsRead    — sum of rows x columns over every read.
 *   bytesRead    — approximated UTF-8 bytes of the values returned by reads.
 *   partial      — true only when a declared, caller-accepted truncation happened.
 *   cacheOutcome — 'disabled' | 'hit' | 'miss' | 'refused-size' |
 *                  'refused-unknown-stamp' | 'refused-after-write'.
 *
 * BUDGETS (plan §5.2, §5.3)
 *   APPEND_WINDOW            serviceCalls 1-2, rowsScanned ~ limit
 *   NARROW_SCAN_PAGE         serviceCalls 2-3, rowsScanned = table rows
 *   KEYSET (experimental)    serviceCalls ~ 2*log2(rows) + 1, verified
 *   FULL_SCAN                declared fallback, priced as such
 *   Document sections        PARENT_SCAN | PARENT_FK_INDEX_THEN_FETCH | FULL_SCAN
 * No strategy claims matched-row-only scanning: without a persisted index,
 * rowsScanned is a table scan for every document strategy; only cellsRead
 * differs. The metrics say so.
 *
 * BOUNDED FAIL-OPEN
 * A context carries a deadline (FR_DEADLINE_MS_ = 120000 by default, per-module
 * overridable through the context). It is checked before every service call;
 * exceeding it aborts with FR_BUDGET_EXCEEDED so the caller can fall back to
 * the legacy path while execution time remains. The 6-minute hard limit is
 * acknowledged as a failure mode this cannot always cover.
 * ==========================================================================*/

var FAST_READ_CORE_ = false;

/* Per-module opt-in switches live with the modules themselves: they name
 * modules, and this file must not. A module serves reads from this engine only
 * when its own switch AND this master switch are both true. */
function fastReadOnFor_(flag) {
  return flag === true && FAST_READ_CORE_ === true;
}

/* Google Sheets epoch: serial 0 = 1899-12-30, the same constant the write-side
 * engine and the shared data layer use. Duplicated on purpose (this file is
 * independent by decision D1) and kept honest by frParityGuard_. */
var FR_EPOCH_UTC_ = Date.UTC(1899, 11, 30);

/* Owner decision DEC-3: 120 s, checked before each service call. */
var FR_DEADLINE_MS_ = 120000;

/* Safety valves, not budgets: a single batch request with hundreds of ranges is
 * slower than two, and the API rejects very large payloads. */
var FR_MAX_RANGES_PER_BATCH_ = 100;

/* Cells in a parent-scoped or block read. Above this the columns are read one
 * at a time instead of as one rectangle, so a scattered projection can never
 * turn into a whole-sheet read. Parity with the write-side engine's cap. */
var FR_MAX_BLOCK_CELLS_ = 400000;

/* Cache limits (plan §5.4). The engine refuses anything larger rather than
 * filling the shared script cache with a multi-megabyte payload. */
var FR_CACHE_MAX_CHUNKS_ = 5;
var FR_CACHE_PAYLOAD_VERSION_ = '1';
var FR_MAX_CACHE_WRITES_PER_EXECUTION_ = 8;

/* ── typed errors ──────────────────────────────────────────────────────────
 * The engine never throws user-facing text. Callers map these codes onto the
 * messages their pages already show. */
function frError_(code, message, detail) {
  var e = new Error(message);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function frErrorCodes_() {
  return {
    BUDGET_EXCEEDED: 'FR_BUDGET_EXCEEDED',
    STRATEGY_UNSUPPORTED: 'FR_STRATEGY_UNSUPPORTED',
    MISSING_KEY: 'FR_MISSING_KEY',
    MISSING_HEADER: 'FR_MISSING_HEADER',
    BAD_SPEC: 'FR_BAD_SPEC',
    RESULT_TOO_LARGE: 'FR_RESULT_TOO_LARGE',
    CACHE_TOO_LARGE: 'FR_CACHE_TOO_LARGE',
    DISABLED: 'FR_DISABLED'
  };
}

/* ── execution context ─────────────────────────────────────────────────────
 * One per request (or per comparison run). Carries the deadline and the cache
 * state step 5 will use; no cache read happens in an execution that has
 * written (_recordCacheDisabled_ in the shared layer is the same idea). */
function frNewContext_(opts) {
  var o = opts || {};
  var startedAt = (typeof Date !== 'undefined' && Date.now) ? Date.now() : new Date().getTime();
  return {
    startedAt: startedAt,
    deadlineMs: Number(o.deadlineMs || FR_DEADLINE_MS_) || FR_DEADLINE_MS_,
    hasWritten: o.hasWritten === true,
    cacheWrites: 0,
    cacheOutcome: 'disabled',
    notes: []
  };
}

function frElapsedMs_(ctx) {
  var now = (typeof Date !== 'undefined' && Date.now) ? Date.now() : new Date().getTime();
  return now - ctx.startedAt;
}

function frCheckDeadline_(ctx) {
  if (!ctx) return;
  if (frElapsedMs_(ctx) > ctx.deadlineMs) {
    throw frError_('FR_BUDGET_EXCEEDED',
      'Fast-read deadline exceeded (' + ctx.deadlineMs + 'ms)',
      { elapsedMs: frElapsedMs_(ctx), deadlineMs: ctx.deadlineMs });
  }
}

/* ── metrics ───────────────────────────────────────────────────────────────
 * Every primitive returns one of these. bytesRead is an approximation by
 * construction: the service hands back parsed values, not bytes, so the engine
 * measures the UTF-8 length of what it received and says so. */
function frNewMetrics_() {
  return {
    serviceCalls: 0, metaCalls: 0, valueCalls: 0, apiCalls: 0,
    rowsScanned: 0, colsRead: 0, cellsRead: 0, bytesRead: 0,
    partial: false, cacheOutcome: 'disabled'
  };
}

function frNoteMeta_(m) { m.metaCalls++; m.serviceCalls++; }

function frNoteRead_(m, numRows, numCols, bytes) {
  m.valueCalls++;
  m.serviceCalls++;
  m.colsRead += Number(numCols) || 0;
  m.cellsRead += (Number(numRows) || 0) * (Number(numCols) || 0);
  m.bytesRead += Number(bytes) || 0;
}

function frNoteApi_(m, count) {
  m.apiCalls += Number(count) || 1;
  m.serviceCalls += Number(count) || 1;
}

function frMetricTotals_(list) {
  var out = frNewMetrics_();
  (list || []).forEach(function (m) { frMergeMetrics_(out, m); });
  return out;
}

/* Fold one metrics object into another. Used to price a composite operation
 * without losing which layer spent what. */
function frMergeMetrics_(into, m) {
  if (!m) return into;
  into.serviceCalls += m.serviceCalls || 0;
  into.metaCalls += m.metaCalls || 0;
  into.valueCalls += m.valueCalls || 0;
  into.apiCalls += m.apiCalls || 0;
  into.rowsScanned += m.rowsScanned || 0;
  into.colsRead += m.colsRead || 0;
  into.cellsRead += m.cellsRead || 0;
  into.bytesRead += m.bytesRead || 0;
  if (m.partial) into.partial = true;
  return into;
}

function frUtf8ByteLength_(text) {
  try { return encodeURIComponent(String(text)).replace(/%[0-9A-F]{2}/g, 'x').length; }
  catch (e) { return String(text).length; }
}

function frValueBytes_(v) {
  if (v === null || v === undefined) return 0;
  if (v instanceof Date) return 24;              /* an ISO string on the wire */
  if (typeof v === 'object') return frUtf8ByteLength_(JSON.stringify(v));
  return frUtf8ByteLength_(String(v));
}

function frMatrixBytes_(matrix) {
  var bytes = 0;
  (matrix || []).forEach(function (row) {
    (row || []).forEach(function (v) { bytes += frValueBytes_(v); });
  });
  return bytes;
}

/* ── header resolution (parity with the write-side engine) ─────────────────
 * Case-insensitive and trimmed, exactly like fsHeaderIndex_ and the shared
 * header convention. Kept duplicated and compared by frParityGuard_. */
function frHeaderIndex_(headers, name) {
  var want = String(name == null ? '' : name).trim().toLowerCase();
  if (!want) return -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === want) return i;
  }
  return -1;
}

function frHeaderIndices_(headers, names) {
  var out = [];
  (names || []).forEach(function (n) {
    var idx = frHeaderIndex_(headers, n);
    if (idx === -1) throw frError_('FR_MISSING_HEADER', 'Header not found: ' + String(n), { header: String(n) });
    out.push(idx);
  });
  return out;
}

/* ── key construction (parity with the write-side engine) ────────────────── */
function frNormalizeKeyPart_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function frKeyFromValues_(values) {
  return values.join('|');
}

function frKeyOfRow_(row, headerIndices) {
  var parts = [];
  for (var i = 0; i < headerIndices.length; i++) parts.push(frNormalizeKeyPart_(row[headerIndices[i]]));
  return frKeyFromValues_(parts);
}

/* ── A1 helpers ────────────────────────────────────────────────────────── */
function frColLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function frQuoteSheetName_(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

function frA1_(sheetName, row, col, numRows, numCols) {
  var start = frColLetter_(col) + row;
  if (numRows === 1 && numCols === 1) return frQuoteSheetName_(sheetName) + '!' + start;
  var end = frColLetter_(col + numCols - 1) + (row + numRows - 1);
  return frQuoteSheetName_(sheetName) + '!' + start + ':' + end;
}

/* ── value normalisation ───────────────────────────────────────────────────
 * The Advanced Sheets API returns dates as serial numbers when asked for
 * UNFORMATTED_VALUE (which this engine always asks for, so the input type is
 * deterministic), while Range.getValues() returns Date objects. Everything the
 * engine hands back is normalised to the caller's canonical representation —
 * Date for date cells — before comparison or projection. Doing it here, once,
 * is what keeps a shadow comparison free of type noise (plan §5.2 rule 5). */
function frSerialToDate_(serial) {
  var ms = FR_EPOCH_UTC_ + Number(serial) * 86400000;
  var utc = new Date(ms);
  /* Serial numbers carry the wall clock in the sheet's time zone; the legacy
   * readers build local Dates, and so does this, so the components match. */
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(),
    utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(), utc.getUTCMilliseconds());
}

function frNormalizeApiValue_(v, opts) {
  var o = opts || {};
  if (typeof v === 'number' && isFinite(v) && o.dateColumns) return frSerialToDate_(v);
  return v;
}

/* Normalise one fetched row. `dateColumns` is a declared, per-section list of
 * header names: the Advanced API hands back serial numbers for every numeric
 * cell, so the engine must be TOLD which of them are dates. Guessing (treating
 * every number as a date) is the bug this signature exists to prevent. */
function frNormalizeFetchedCell_(value, columnName, dateColumns) {
  if (!dateColumns || !dateColumns.length) return value;
  if (dateColumns.indexOf(columnName) === -1) return value;
  return typeof value === 'number' && isFinite(value) ? frSerialToDate_(value) : value;
}

function frNormalizeMatrix_(matrix, opts) {
  var col = opts && opts.dateColumn;
  if (col === null || col === undefined) return matrix;
  return matrix.map(function (row) {
    var out = row.slice();
    if (typeof out[col] === 'number') out[col] = frSerialToDate_(out[col]);
    return out;
  });
}

/* ── Layer 1 primitives (bounded reads, never a whole-sheet object build) ── */

/* One column of a sheet, rows 2..lastRow. `providedHeaders` (optional) lets a
 * caller that already holds the header row — the module usually got it from the
 * shared, execution-scoped getHeaders_ memo — keep the read count down. The
 * engine never assumes they are right: a missing header still refuses. */
function frReadColumnValues_(sheet, headerName, m, providedHeaders) {
  var headers = frResolveHeaders_(sheet, m, providedHeaders);
  var idx = frHeaderIndex_(headers, headerName);
  if (idx === -1) throw frError_('FR_MISSING_HEADER', 'Header not found: ' + String(headerName), { header: String(headerName) });
  frNoteMeta_(m);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { index: idx, values: [], lastRow: lastRow, headers: headers, headerRow: 1 };
  var values = sheet.getRange(2, idx + 1, lastRow - 1, 1).getValues();
  frNoteRead_(m, values.length, 1, frMatrixBytes_(values));
  var flat = [];
  for (var i = 0; i < values.length; i++) flat.push(values[i][0]);
  return { index: idx, values: flat, lastRow: lastRow, headers: headers, headerRow: 1 };
}

/* Header row of a sheet: one metadata call plus one bounded read, unless the
 * caller supplied them. */
function frResolveHeaders_(sheet, m, providedHeaders) {
  if (providedHeaders && providedHeaders.length) return providedHeaders;
  return frHeaders_(sheet, m);
}

function frHeaders_(sheet, m) {
  frNoteMeta_(m);
  var lastCol = sheet.getLastColumn();
  if (!(lastCol > 0)) return [];
  var values = sheet.getRange(1, 1, 1, lastCol).getValues();
  frNoteRead_(m, 1, lastCol, frMatrixBytes_(values));
  return values[0];
}

/* key -> row number index over one or more key columns. FIRST match wins unless
 * collectAll is set, which is the same contract the write-side engine keeps. */
function frKeyIndex_(sheet, keyHeaders, wantedKeys, collectAll, m, providedHeaders) {
  var headers = frResolveHeaders_(sheet, m, providedHeaders);
  var idxs = Array.isArray(keyHeaders) ? frHeaderIndices_(headers, keyHeaders) : [frHeaderIndex_(headers, keyHeaders)];
  if (idxs[0] === -1) throw frError_('FR_MISSING_HEADER', 'Header not found: ' + String(keyHeaders), { header: String(keyHeaders) });
  if (idxs.length > 1 && idxs.indexOf(-1) !== -1) throw frError_('FR_MISSING_HEADER', 'Composite key header not found', { header: keyHeaders });

  frNoteMeta_(m);
  var lastRow = sheet.getLastRow();
  var map = new Map();
  var out = { map: map, indices: idxs, lastRow: lastRow, headers: headers };
  if (lastRow < 2) return out;

  var minIdx = Math.min.apply(null, idxs);
  var maxIdx = Math.max.apply(null, idxs);
  var block = sheet.getRange(2, minIdx + 1, lastRow - 1, maxIdx - minIdx + 1).getValues();
  frNoteRead_(m, block.length, maxIdx - minIdx + 1, frMatrixBytes_(block));
  m.rowsScanned += block.length;

  var offset = minIdx;
  for (var r = 0; r < block.length; r++) {
    var parts = [];
    var anyPart = false;
    for (var k = 0; k < idxs.length; k++) {
      var part = frNormalizeKeyPart_(block[r][idxs[k] - offset]);
      if (part) anyPart = true;
      parts.push(part);
    }
    if (!anyPart) continue;
    var key = frKeyFromValues_(parts);
    if (wantedKeys && !wantedKeys[key]) continue;
    if (collectAll) {
      var hits = map.get(key);
      if (hits) hits.push(r + 2);
      else map.set(key, [r + 2]);
    } else if (!map.has(key)) {
      map.set(key, r + 2);
    }
  }
  return out;
}

/* A named column set as row records keyed by the sheet's own trimmed header
 * spelling, each carrying __row. One bounded block read, or one read per column
 * above the cell cap. */
function frReadBlockRows_(sheet, columns, m, providedHeaders) {
  var headers = frResolveHeaders_(sheet, m, providedHeaders);
  var idxs = [];
  (columns || []).forEach(function (c) {
    var i = frHeaderIndex_(headers, c);
    if (i !== -1 && idxs.indexOf(i) === -1) idxs.push(i);
  });
  var out = { rows: [], headers: headers };
  if (!idxs.length) return out;
  frNoteMeta_(m);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  var minIdx = Math.min.apply(null, idxs);
  var maxIdx = Math.max.apply(null, idxs);

  if ((lastRow - 1) * (maxIdx - minIdx + 1) <= FR_MAX_BLOCK_CELLS_) {
    var block = sheet.getRange(2, minIdx + 1, lastRow - 1, maxIdx - minIdx + 1).getValues();
    frNoteRead_(m, block.length, maxIdx - minIdx + 1, frMatrixBytes_(block));
    m.rowsScanned += block.length;
    for (var r = 0; r < block.length; r++) {
      var rec = { __row: r + 2 };
      for (var k = 0; k < idxs.length; k++) rec[String(headers[idxs[k]]).trim()] = block[r][idxs[k] - minIdx];
      out.rows.push(rec);
    }
    return out;
  }

  var recs = new Array(lastRow - 1);
  idxs.forEach(function (i) {
    var col = sheet.getRange(2, i + 1, lastRow - 1, 1).getValues();
    frNoteRead_(m, col.length, 1, frMatrixBytes_(col));
    var name = String(headers[i]).trim();
    for (var r2 = 0; r2 < col.length; r2++) {
      if (!recs[r2]) recs[r2] = { __row: r2 + 2 };
      recs[r2][name] = col[r2][0];
    }
  });
  m.rowsScanned += lastRow - 1;
  for (var q = 0; q < recs.length; q++) if (recs[q]) out.rows.push(recs[q]);
  return out;
}

/* Child rows of one parent, without materializing the table. */
function frReadRowsByParent_(sheet, parentHeader, parentValue, columns, m, providedHeaders) {
  var headers = frResolveHeaders_(sheet, m, providedHeaders);
  var pIdx = frHeaderIndex_(headers, parentHeader);
  if (pIdx === -1) throw frError_('FR_MISSING_HEADER', 'Header not found: ' + String(parentHeader), { header: String(parentHeader) });
  var wantIdx = [];
  (columns || []).forEach(function (c) {
    var i = frHeaderIndex_(headers, c);
    if (i !== -1 && wantIdx.indexOf(i) === -1) wantIdx.push(i);
  });

  frNoteMeta_(m);
  var lastRow = sheet.getLastRow();
  var out = { rows: [], headers: headers };
  if (lastRow < 2) return out;
  var want = frNormalizeKeyPart_(parentValue);

  var minIdx = pIdx;
  var maxIdx = pIdx;
  wantIdx.forEach(function (i) { if (i < minIdx) minIdx = i; if (i > maxIdx) maxIdx = i; });

  var spanCells = (lastRow - 1) * (maxIdx - minIdx + 1);
  if (spanCells <= FR_MAX_BLOCK_CELLS_) {
    var block = sheet.getRange(2, minIdx + 1, lastRow - 1, maxIdx - minIdx + 1).getValues();
    frNoteRead_(m, block.length, maxIdx - minIdx + 1, frMatrixBytes_(block));
    m.rowsScanned += block.length;
    for (var r = 0; r < block.length; r++) {
      if (frNormalizeKeyPart_(block[r][pIdx - minIdx]) !== want) continue;
      var rec = { __row: r + 2 };
      wantIdx.forEach(function (i) { rec[String(headers[i]).trim()] = block[r][i - minIdx]; });
      out.rows.push(rec);
    }
    return out;
  }

  var fk = frReadColumnValues_(sheet, headers[pIdx], m, headers);
  var byRow = new Map();
  fk.values.forEach(function (v, i) { if (frNormalizeKeyPart_(v) === want) byRow.set(i + 2, { __row: i + 2 }); });
  m.rowsScanned += fk.values.length;
  if (!byRow.size) return out;
  wantIdx.forEach(function (i) {
    var col = sheet.getRange(2, i + 1, lastRow - 1, 1).getValues();
    frNoteRead_(m, col.length, 1, frMatrixBytes_(col));
    var name = String(headers[i]).trim();
    byRow.forEach(function (rec, rowNum) { rec[name] = col[rowNum - 2][0]; });
  });
  byRow.forEach(function (rec) { out.rows.push(rec); });
  out.rows.sort(function (a, b) { return a.__row - b.__row; });
  return out;
}

/* ── batched row fetch by row number ───────────────────────────────────────
 * Noncontiguous rows are fetched with ONE Sheets v4 batchGet (many ranges), or
 * with one block read when the row set is too fragmented for the request cap.
 * Per-row getValues() calls are forbidden here: they would violate the budget.
 * Returns rows as arrays aligned to `columns`. */
function frFetchRowsByNumber_(dbId, sheetName, columns, rowNumbers, ctx, providedHeaders, dateColumns) {
  var m = frNewMetrics_();
  var out = { rows: [], rowNumbers: (rowNumbers || []).slice(), mode: 'none', metrics: m };
  if (!out.rowNumbers.length) return out;
  if (!columns || !columns.length) throw frError_('FR_BAD_SPEC', 'frFetchRowsByNumber_ needs declared columns');

  var sheet = frSheet_(sheetName, dbId, ctx);
  var headers = frResolveHeaders_(sheet, m, providedHeaders);
  var idxs = frHeaderIndices_(headers, columns);
  var minIdx = Math.min.apply(null, idxs);
  var maxIdx = Math.max.apply(null, idxs);

  out.rowNumbers.sort(function (a, b) { return a - b; });
  var spans = [];
  var start = out.rowNumbers[0], prev = start;
  for (var i = 1; i < out.rowNumbers.length; i++) {
    if (out.rowNumbers[i] === prev + 1) { prev = out.rowNumbers[i]; continue; }
    spans.push({ from: start, to: prev });
    start = out.rowNumbers[i]; prev = out.rowNumbers[i];
  }
  spans.push({ from: start, to: prev });
  out.spans = spans;

  if (spans.length <= FR_MAX_RANGES_PER_BATCH_) {
    out.mode = 'batchGet';
    var ranges = spans.map(function (s) { return frA1_(sheetName, s.from, minIdx + 1, s.to - s.from + 1, maxIdx - minIdx + 1); });
    var response = frBatchGet_(dbId, ranges, ctx);
    frNoteApi_(m, response.calls);
    var valueRanges = response.valueRanges || [];
    for (var s2 = 0; s2 < spans.length; s2++) {
      var block = (valueRanges[s2] && valueRanges[s2].values) || [];
      for (var r = 0; r < block.length; r++) {
        var rowNum = spans[s2].from + r;
        var row = new Array(columns.length);
        for (var c = 0; c < columns.length; c++) {
          row[c] = frNormalizeFetchedCell_(block[r][idxs[c] - minIdx], columns[c], dateColumns);
        }
        out.rows.push({ __row: rowNum, values: row });
      }
      m.cellsRead += block.length * (maxIdx - minIdx + 1);
      m.bytesRead += frMatrixBytes_(block);
    }
    return out;
  }

  /* Too fragmented for a batch request: one block read of the whole row range,
   * then keep only the wanted rows. Honest in the metrics, and still 1 call. */
  out.mode = 'block';
  frCheckDeadline_(ctx);
  frNoteMeta_(m);
  var from = out.rowNumbers[0];
  var to = out.rowNumbers[out.rowNumbers.length - 1];
  var all = sheet.getRange(from, minIdx + 1, to - from + 1, maxIdx - minIdx + 1).getValues();
  frNoteRead_(m, all.length, maxIdx - minIdx + 1, frMatrixBytes_(all));
  var wanted = {};
  out.rowNumbers.forEach(function (n) { wanted[n] = true; });
  for (var rr = 0; rr < all.length; rr++) {
    var n2 = from + rr;
    if (!wanted[n2]) continue;
    var line = new Array(columns.length);
    for (var c2 = 0; c2 < columns.length; c2++) {
      line[c2] = frNormalizeFetchedCell_(all[rr][idxs[c2] - minIdx], columns[c2], dateColumns);
    }
    out.rows.push({ __row: n2, values: line });
  }
  return out;
}

function frBatchGet_(dbId, ranges, ctx) {
  frCheckDeadline_(ctx);
  if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
    throw frError_('FR_BAD_SPEC', 'Sheets advanced service is unavailable');
  }
  var calls = 0;
  var allRanges = [];
  for (var i = 0; i < ranges.length; i += FR_MAX_RANGES_PER_BATCH_) {
    var chunk = ranges.slice(i, i + FR_MAX_RANGES_PER_BATCH_);
    var res = Sheets.Spreadsheets.Values.batchGet({
      ranges: chunk,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER'
    }, dbId);
    calls++;
    allRanges = allRanges.concat((res && res.valueRanges) || []);
  }
  return { valueRanges: allRanges, calls: calls };
}

function frSheet_(sheetName, dbId, ctx) {
  frCheckDeadline_(ctx);
  return getSheet_(sheetName, dbId);
}

/* ── predicate evaluation (declarative, so a strategy can price it) ─────── */
function frCompareValues_(a, b) {
  if (a instanceof Date || b instanceof Date) {
    var ta = a instanceof Date ? a.getTime() : new Date(a).getTime();
    var tb = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return ta === tb ? 0 : (ta < tb ? -1 : 1);
  }
  if (typeof a === 'number' && typeof b === 'number') return a === b ? 0 : (a < b ? -1 : 1);
  var sa = String(a == null ? '' : a).trim();
  var sb = String(b == null ? '' : b).trim();
  return sa === sb ? 0 : (sa < sb ? -1 : 1);
}

function frMatchFilter_(value, filter) {
  var op = String(filter.op || 'eq').toLowerCase();
  var want = filter.value;
  switch (op) {
    case 'eq': return String(value == null ? '' : value).trim() === String(want == null ? '' : want).trim();
    case 'ne': return String(value == null ? '' : value).trim() !== String(want == null ? '' : want).trim();
    case 'in': return (want || []).some(function (v) { return String(v).trim() === String(value == null ? '' : value).trim(); });
    case 'notin': return !(want || []).some(function (v) { return String(v).trim() === String(value == null ? '' : value).trim(); });
    case 'contains': return String(value == null ? '' : value).toLowerCase().indexOf(String(want == null ? '' : want).toLowerCase()) !== -1;
    case 'startswith': return String(value == null ? '' : value).toLowerCase().indexOf(String(want == null ? '' : want).toLowerCase()) === 0;
    case 'gte': return frCompareValues_(value, want) >= 0;
    case 'gt': return frCompareValues_(value, want) > 0;
    case 'lte': return frCompareValues_(value, want) <= 0;
    case 'lt': return frCompareValues_(value, want) < 0;
    case 'nonblank': return String(value == null ? '' : value).trim() !== '';
    case 'blank': return String(value == null ? '' : value).trim() === '';
    case 'truthy': return value === true || String(value).trim().toLowerCase() === 'true' || Number(value) === 1;
    default: throw frError_('FR_BAD_SPEC', 'Unsupported filter op: ' + op);
  }
}

/* The shared reader's blank-row rule, exactly: a cell counts as EMPTY only when
 * it is '' or undefined. A null is NOT empty there (`String(null)` is 'null'),
 * which real Sheets never produces but the rule must match rather than
 * "improve". A row whose read cells are all empty is not part of the result set
 * and does not advance the ordinal. */
function frBlankCell_(v) {
  return v === '' || v === undefined;
}

function frBlankRow_(line, names) {
  for (var i = 0; i < names.length; i++) {
    if (!frBlankCell_(line[names[i]])) return false;
  }
  return true;
}

function frMatchRow_(row, filterSpec) {
  var filters = (filterSpec && filterSpec.filters) || [];
  for (var i = 0; i < filters.length; i++) {
    if (!frMatchFilter_(row[filters[i].column], filters[i])) return false;
  }
  var range = filterSpec && filterSpec.range;
  if (range && range.column) {
    var v = row[range.column];
    if (v !== '' && v !== null && v !== undefined) {
      if (range.from && frCompareValues_(v, range.from) < 0) return false;
      if (range.to && frCompareValues_(v, range.to) > 0) return false;
    }
  }
  return true;
}

function frCompareRows_(a, b, column, direction) {
  var c = frCompareValues_(a[column], b[column]);
  if (direction === 'desc') c = -c;
  if (c !== 0) return c;
  return (a.__row || 0) - (b.__row || 0);
}

/* ── list fetch — a declared strategy per query (plan §5.2) ──────────────── */
function fastFetchList_(spec) {
  var s = spec || {};
  if (!s.sheetName) throw frError_('FR_BAD_SPEC', 'fastFetchList_ needs a sheetName');
  var strategy = String(s.strategy || '').toUpperCase();
  if (!strategy) throw frError_('FR_BAD_SPEC', 'fastFetchList_ needs a declared strategy');
  var ctx = s.ctx || frNewContext_();
  var m = frNewMetrics_();
  var limit = (s.limit === null || s.limit === undefined) ? null : Number(s.limit);
  var offset = Number(s.offset || 0);
  if (offset < 0) offset = 0;

  var out = { rows: [], total: 0, strategy: strategy, metrics: m, partial: false, nextCursor: null };

  if (strategy === 'APPEND_WINDOW') {
    if (s.filters && s.filters.length) throw frError_('FR_STRATEGY_UNSUPPORTED', 'APPEND_WINDOW cannot apply filters');
    if (s.range) throw frError_('FR_STRATEGY_UNSUPPORTED', 'APPEND_WINDOW cannot apply a range filter');
    if (offset > 0) throw frError_('FR_STRATEGY_UNSUPPORTED', 'APPEND_WINDOW is page 1 only');
    if (limit === null || !(limit > 0)) throw frError_('FR_STRATEGY_UNSUPPORTED', 'APPEND_WINDOW needs a positive limit');
    if (!s.columns || !s.columns.length) throw frError_('FR_BAD_SPEC', 'APPEND_WINDOW needs declared columns');

    var sheet = frSheet_(s.sheetName, s.dbId, ctx);
    frNoteMeta_(m);
    var lastRow = sheet.getLastRow();
    var start = Math.max(2, lastRow - limit + 1);
    if (lastRow < 2) return out;
    var headers = frResolveHeaders_(sheet, m, s.headers);
    var firstIdx = headers.length;                       /* whole row width is not needed: read only the projection span */
    var lastIdx = -1;
    s.columns.forEach(function (c) {
      var i = frHeaderIndex_(headers, c);
      if (i === -1) throw frError_('FR_MISSING_HEADER', 'Header not found: ' + String(c), { header: String(c) });
      if (i < firstIdx) firstIdx = i;
      if (i > lastIdx) lastIdx = i;
    });
    var count = lastRow - start + 1;
    var values = sheet.getRange(start, firstIdx + 1, count, lastIdx - firstIdx + 1).getValues();
    frNoteRead_(m, count, lastIdx - firstIdx + 1, frMatrixBytes_(values));
    m.rowsScanned += count;
    out.total = lastRow - 1;
    for (var r = 0; r < values.length; r++) {
      var rec = { __row: start + r };
      s.columns.forEach(function (c) {
        rec[c] = values[r][frHeaderIndex_(headers, c) - firstIdx];
      });
      out.rows.push(rec);
    }
    sortRows_(out.rows, s.sort, 'asc');
    return out;
  }

  if (strategy === 'NARROW_SCAN_PAGE' || strategy === 'FULL_SCAN') {
    /* The narrow read must cover everything the strategy EVALUATES — the
     * declared filter columns, the range column and the sort column — plus the
     * caller's declared narrow set. Projection columns that are not in it are
     * fetched for the page only, in one batched call. */
    var narrowNames = [];
    var addNarrow = function (c) { if (c && narrowNames.indexOf(c) === -1) narrowNames.push(c); };
    if (s.filterColumns && s.filterColumns.length) s.filterColumns.forEach(addNarrow);
    else (s.columns || []).forEach(addNarrow);
    (s.filters || []).forEach(function (f) { addNarrow(f.column); });
    if (s.range && s.range.column) addNarrow(s.range.column);
    if (s.sort && s.sort.column) addNarrow(s.sort.column);
    if (!narrowNames.length) throw frError_('FR_BAD_SPEC', strategy + ' needs declared columns');
    if (!s.columns || !s.columns.length) throw frError_('FR_BAD_SPEC', strategy + ' needs a declared projection');

    var sh2 = frSheet_(s.sheetName, s.dbId, ctx);
    var hdr = frResolveHeaders_(sh2, m, s.headers);
    var idxs = frHeaderIndices_(hdr, narrowNames);
    var minIdx = Math.min.apply(null, idxs);
    var maxIdx = Math.max.apply(null, idxs);
    frNoteMeta_(m);
    var last2 = sh2.getLastRow();
    if (last2 < 2) return out;
    var block2 = sh2.getRange(2, minIdx + 1, last2 - 1, maxIdx - minIdx + 1).getValues();
    frNoteRead_(m, block2.length, maxIdx - minIdx + 1, frMatrixBytes_(block2));
    m.rowsScanned += block2.length;

    var matched = [];
    var ordinal = 0;
    for (var r2 = 0; r2 < block2.length; r2++) {
      var line = {};
      narrowNames.forEach(function (c) { line[c] = block2[r2][frHeaderIndex_(hdr, c) - minIdx]; });
      line.__row = r2 + 2;
      /* A row with no value in any read column is not a record: the shared
       * reader skips it, so skipping it here is parity, not an optimisation.
       * __ordinal is the position among the non-blank rows BEFORE filtering,
       * which is what a global serial column means. */
      if (frBlankRow_(line, narrowNames)) continue;
      line.__ordinal = ++ordinal;
      if (!frMatchRow_(line, { filters: s.filters, range: s.range })) continue;
      matched.push(line);
    }
    sortRows_(matched, s.sort, 'asc');
    out.total = matched.length;
    if (offset > 0) matched = matched.slice(offset);
    if (limit !== null && limit >= 0) matched = matched.slice(0, limit);
    if (s.deepOffsetWarn && offset > 1000) ctx.notes.push('deep offset ' + offset + ' on ' + strategy);

    /* Rows whose projection columns were already read are returned directly;
     * the rest are fetched in one batched call. */
    var needFetch = (s.columns || []).some(function (c) { return narrowNames.indexOf(c) === -1; });
    if (!needFetch) {
      out.rows = matched.map(function (row) {
        var rec = { __row: row.__row, __ordinal: row.__ordinal };
        (s.columns || []).forEach(function (c) { rec[c] = row[c]; });
        return rec;
      });
      return out;
    }
    var fetched = frFetchRowsByNumber_(s.dbId, s.sheetName, s.columns, matched.map(function (r3) { return r3.__row; }), ctx, hdr, s.dateColumns);
    frMergeMetrics_(m, fetched.metrics);
    var byRow = {};
    matched.forEach(function (row) { byRow[row.__row] = row; });
    out.rows = fetched.rows.map(function (f) {
      var rec = { __row: f.__row, __ordinal: byRow[f.__row] ? byRow[f.__row].__ordinal : null };
      (s.columns || []).forEach(function (c, i) { rec[c] = f.values[i]; });
      return rec;
    }).filter(function (rec) { return !!byRow[rec.__row]; });
    sortRows_(out.rows, s.sort, 'asc');
    return out;
  }

  if (strategy === 'KEYSET') return frKeysetPage_(s, ctx, m, limit, offset, out);

  throw frError_('FR_STRATEGY_UNSUPPORTED', 'Unknown list strategy: ' + strategy);
}

function sortRows_(rows, sort, defaultDirection) {
  if (!sort || !sort.column) return;
  var direction = String(sort.direction || defaultDirection || 'asc').toLowerCase();
  rows.sort(function (a, b) { return frCompareRows_(a, b, sort.column, direction); });
}

/* KEYSET — experimental until a measurement justifies it (plan §5.2).
 * The cursor is a value of a strictly monotonic id column; the row is located by
 * binary search, then the page is read forward from it. Verification (one column
 * read) is not optional: an unverified monotonic assumption is a wrong answer. */
function frKeysetPage_(s, ctx, m, limit, offset, out) {
  if (!s.experimentalJustification) {
    throw frError_('FR_STRATEGY_UNSUPPORTED',
      'KEYSET is experimental: provide experimentalJustification (the measurement that shows it wins)');
  }
  if (offset > 0) throw frError_('FR_STRATEGY_UNSUPPORTED', 'KEYSET pages by cursor, not by offset');
  if (limit === null || !(limit > 0)) throw frError_('FR_STRATEGY_UNSUPPORTED', 'KEYSET needs a positive limit');
  if (!s.idColumn) throw frError_('FR_BAD_SPEC', 'KEYSET needs idColumn');
  if (!s.columns || !s.columns.length) throw frError_('FR_BAD_SPEC', 'KEYSET needs declared columns');

  var sheet = frSheet_(s.sheetName, s.dbId, ctx);
  var headers = frResolveHeaders_(sheet, m, s.headers);
  var idIdx = frHeaderIndex_(headers, s.idColumn);
  if (idIdx === -1) throw frError_('FR_MISSING_HEADER', 'Header not found: ' + String(s.idColumn), { header: String(s.idColumn) });

  /* verification: one narrow column read proves strict monotonicity, no blanks,
   * no duplicates. It is the "+1" in the published budget, and it is reported. */
  var col = frReadColumnValues_(sheet, s.idColumn, m, headers);
  var values = col.values;
  m.rowsScanned += values.length;
  var lastSeen = null;
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v === '' || v === null || v === undefined) {
      throw frError_('FR_STRATEGY_UNSUPPORTED', 'KEYSET precondition failed: blank id at sheet row ' + (i + 2));
    }
    if (lastSeen !== null && frCompareValues_(lastSeen, v) >= 0) {
      throw frError_('FR_STRATEGY_UNSUPPORTED', 'KEYSET precondition failed: ids are not strictly monotonic at sheet row ' + (i + 2));
    }
    lastSeen = v;
  }

  var cursor = s.cursor && s.cursor.id !== undefined ? s.cursor.id : null;
  var direction = String(s.direction || 'forward').toLowerCase();
  var position;
  if (cursor === null) {
    position = direction === 'backward' ? values.length : 0;
  } else {
    position = frBinarySearch_(values, cursor, direction);
    if (position === -1) throw frError_('FR_STRATEGY_UNSUPPORTED', 'KEYSET cursor not found');
  }

  var from, take;
  if (direction === 'backward') {
    take = Math.min(limit, position);
    from = position - take;
  } else {
    from = position;
    take = Math.min(limit, values.length - from);
  }
  if (take <= 0) { out.total = values.length; return out; }

  var idxs = frHeaderIndices_(headers, s.columns);
  var minIdx = Math.min.apply(null, idxs);
  var maxIdx = Math.max.apply(null, idxs);
  frNoteMeta_(m);
  var rows = sheet.getRange(from + 2, minIdx + 1, take, maxIdx - minIdx + 1).getValues();
  frNoteRead_(m, take, maxIdx - minIdx + 1, frMatrixBytes_(rows));
  m.rowsScanned += take;
  for (var r = 0; r < rows.length; r++) {
    var rec = { __row: from + 2 + r };
    s.columns.forEach(function (c, ci) { rec[c] = rows[r][idxs[ci] - minIdx]; });
    out.rows.push(rec);
  }
  out.total = values.length;
  var lastRowRec = out.rows[out.rows.length - 1];
  out.nextCursor = lastRowRec ? { id: lastRowRec[s.idColumn] || lastRowRec[s.columns[0]] } : null;
  return out;
}

/* Binary search over the ALREADY VERIFIED id column, for the first index whose
 * value satisfies an upper bound: values[idx] >= target going forward (the
 * cursor row starts the page), values[idx] > target going backward (the cursor
 * row ends it). It costs zero service calls by construction — the verification
 * read is the only column read — so the comparison count is a CPU metric, not a
 * budget metric, and is deliberately not added to serviceCalls. (Without
 * verification it would be 2*log2(rows) single-cell calls; that is the budget
 * §5.2 publishes, and this implementation is strictly cheaper while safer.) */
function frBinarySearch_(values, target, direction) {
  var lo = 0, hi = values.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    var cmp = frCompareValues_(values[mid], target);
    var advance = direction === 'backward' ? cmp <= 0 : cmp < 0;
    if (advance) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/* ── document fetch — declared strategy per section (plan §5.3) ──────────── */
function fastFetchDocument_(spec) {
  var s = spec || {};
  if (!s.parent || !s.parent.sheetName) throw frError_('FR_BAD_SPEC', 'fastFetchDocument_ needs a parent section');
  var ctx = s.ctx || frNewContext_();
  var metrics = { parent: frNewMetrics_(), children: {}, total: null };
  var out = { parent: null, children: {}, metrics: metrics, stampSig: null, identity: null };

  var p = s.parent;
  var pStrategy = String(p.strategy || 'PARENT_SCAN').toUpperCase();
  var pHit = frFetchSection_(s.dbId, p.sheetName, p.keyHeader, p.keyValue, p.columns, pStrategy, ctx, metrics.parent, p.orderBy, p.headers, p.dateColumns);
  out.parent = pHit.rows.length ? pHit.rows[0] : null;
  if (pHit.rows.length > 1) out.parentDuplicates = pHit.rows.length;
  metrics.parent.rowsScanned = pHit.rowsScanned;
  metrics.parent.partial = false;

  (s.children || []).forEach(function (child) {
    var cm = frNewMetrics_();
    var strategy = String(child.strategy || 'PARENT_SCAN').toUpperCase();
    var hit = frFetchSection_(s.dbId, child.sheetName, child.parentHeader, child.parentKey, child.columns, strategy, ctx, cm, child.orderBy, child.headers, child.dateColumns);
    metrics.children[child.alias] = cm;
    cm.rowsScanned = hit.rowsScanned;
    out.children[child.alias] = hit.rows;
  });

  var list = [metrics.parent];
  Object.keys(metrics.children).forEach(function (k) { list.push(metrics.children[k]); });
  var total = frMetricTotals_(list);
  total.rowsScanned = list.reduce(function (n, x) { return n + (x.rowsScanned || 0); }, 0);
  metrics.total = total;
  return out;
}

/* One section: a key column + a projection, under a declared strategy.
 *   PARENT_SCAN                  one narrow read of key+projection over the table
 *   PARENT_FK_INDEX_THEN_FETCH   key column first, then the matched rows by batch
 *   FULL_SCAN                    declared fallback: key + projection read, whole table
 * rowsScanned is a table scan for all three; only cellsRead differs. */
function frFetchSection_(dbId, sheetName, keyHeader, keyValue, columns, strategy, ctx, m, orderBy, providedHeaders, dateColumns) {
  if (!keyHeader) throw frError_('FR_BAD_SPEC', 'Section needs a key header');
  if (!columns || !columns.length) throw frError_('FR_BAD_SPEC', 'Section needs declared columns');

  if (strategy === 'PARENT_SCAN' || strategy === 'FULL_SCAN') {
    var sheet = frSheet_(sheetName, dbId, ctx);
    var hit = frReadRowsByParent_(sheet, keyHeader, keyValue, columns, m, providedHeaders);
    var rows = hit.rows.map(function (rec) {
      var out = { __row: rec.__row };
      columns.forEach(function (c) { out[c] = rec[String(c).trim()]; });
      return out;
    });
    if (orderBy) rows.sort(function (a, b) { return frCompareRows_(a, b, orderBy.column, orderBy.direction); });
    return { rows: rows, rowsScanned: m.rowsScanned };
  }

  if (strategy === 'PARENT_FK_INDEX_THEN_FETCH') {
    var sh = frSheet_(sheetName, dbId, ctx);
    var idx = frKeyIndex_(sh, keyHeader, null, true, m, providedHeaders);
    var wanted = [];
    idx.map.forEach(function (hits, key) {
      if (key === frNormalizeKeyPart_(keyValue)) hits.forEach(function (r) { wanted.push(r); });
    });
    m.rowsScanned = (idx.lastRow || 1) - 1;
    if (!wanted.length) return { rows: [], rowsScanned: m.rowsScanned };
    var fetched = frFetchRowsByNumber_(dbId, sheetName, columns, wanted, ctx, idx.headers, dateColumns);
    frMergeMetrics_(m, fetched.metrics);
    m.rowsScanned = (idx.lastRow || 1) - 1;
    var rows2 = fetched.rows.map(function (f) {
      var rec = { __row: f.__row };
      columns.forEach(function (c, i) { rec[c] = f.values[i]; });
      return rec;
    });
    if (orderBy) rows2.sort(function (a, b) { return frCompareRows_(a, b, orderBy.column, orderBy.direction); });
    return { rows: rows2, rowsScanned: m.rowsScanned };
  }

  throw frError_('FR_STRATEGY_UNSUPPORTED', 'Unknown document strategy: ' + strategy);
}

/* ── shadow comparison (plan §3.2 G2 + §7.5) ───────────────────────────────
 * Runs both readers, projects BOTH through the same canonicalizer, diffs the
 * projected values, and returns the legacy result so every user is unaffected
 * while the comparison is made. Admin/staging only — never called on a user
 * request. The modern reader is invoked by function reference, which is why a
 * comparison can prove it correct while the module flag is still false.
 *
 * Privacy (G7): the output carries field paths, types, hashes and counts only.
 * No raw value ever leaves this function; `maxDiffs` bounds the report size. */
function frShadowCompare_(spec) {
  var s = spec || {};
  var label = String(s.label || 'shadow');
  var legacy = typeof s.legacy === 'function' ? s.legacy() : s.legacy;
  var modernError = null;
  var modern = null;
  try { modern = typeof s.modern === 'function' ? s.modern() : s.modern; }
  catch (e) { modernError = e; }

  if (modernError) {
    var failure = { label: label, ok: false, modernError: { code: modernError.code || '', name: modernError.name || 'Error' }, diffs: [], diffCount: 0 };
    if (typeof s.onResult === 'function') s.onResult(failure);
    return legacy;
  }

  var canonicalize = typeof s.canonicalize === 'function' ? s.canonicalize : function (v) { return v; };
  var left = canonicalize(legacy);
  var right = canonicalize(modern);
  var diffs = [];
  var maxDiffs = Number(s.maxDiffs || 50) || 50;
  frDiffValues_(left, right, '', diffs, maxDiffs);

  var report = {
    label: label,
    ok: diffs.length === 0,
    diffCount: diffs.length,
    truncated: diffs.truncated === true,
    diffs: diffs.slice(0, maxDiffs),
    leftBytes: frValueBytes_(left),
    rightBytes: frValueBytes_(right)
  };
  if (typeof s.onResult === 'function') s.onResult(report);
  return legacy;
}

function frValueHash_(v) {
  var text = v === null || v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  try {
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest && Utilities.DigestAlgorithm) {
      return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
        .map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('').slice(0, 16);
    }
  } catch (e) {}
  var h = 2166136261;
  for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}

function frTypeOf_(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (v instanceof Date) return 'date';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function frDiffValues_(left, right, path, diffs, maxDiffs) {
  if (diffs.length >= maxDiffs) { diffs.truncated = true; return; }
  var lt = frTypeOf_(left);
  var rt = frTypeOf_(right);
  if (lt !== rt) {
    diffs.push({ path: path || '$', kind: 'type', leftType: lt, rightType: rt, leftHash: frValueHash_(left), rightHash: frValueHash_(right) });
    return;
  }
  if (lt === 'date') {
    if (left.getTime() !== right.getTime()) {
      diffs.push({ path: path || '$', kind: 'value', type: 'date', leftHash: frValueHash_(left), rightHash: frValueHash_(right) });
    }
    return;
  }
  if (lt === 'array') {
    if (left.length !== right.length) {
      diffs.push({ path: path || '$', kind: 'length', leftCount: left.length, rightCount: right.length });
    }
    var n = Math.min(left.length, right.length);
    for (var i = 0; i < n; i++) frDiffValues_(left[i], right[i], (path || '$') + '[' + i + ']', diffs, maxDiffs);
    return;
  }
  if (lt === 'object') {
    var keys = {};
    Object.keys(left || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(right || {}).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).sort().forEach(function (k) {
      var inLeft = Object.prototype.hasOwnProperty.call(left, k);
      var inRight = Object.prototype.hasOwnProperty.call(right, k);
      if (inLeft !== inRight) {
        diffs.push({ path: (path || '$') + '.' + k, kind: inLeft ? 'missingRight' : 'missingLeft' });
        return;
      }
      frDiffValues_(left[k], right[k], (path || '$') + '.' + k, diffs, maxDiffs);
    });
    return;
  }
  if (left !== right) {
    diffs.push({ path: path || '$', kind: 'value', type: lt, leftHash: frValueHash_(left), rightHash: frValueHash_(right) });
  }
}

/* ── parity guard (plan §5.7) ──────────────────────────────────────────────
 * D1 makes this file independent of the write-side engine, which means a few
 * contracts are duplicated. This guard compares them executably and reports
 * every divergence, so a change on one side cannot silently drift from the
 * other. It is a diagnostic: it never throws, and a missing sibling engine is
 * reported as `skipped`, not as a failure. */
function frParityGuard_() {
  var checks = [];
  var hasSibling = typeof fsHeaderIndex_ === 'function';

  function check(name, fn) {
    if (!hasSibling) { checks.push({ name: name, ok: true, skipped: true }); return; }
    try { checks.push({ name: name, ok: fn() === true }); }
    catch (e) { checks.push({ name: name, ok: false, detail: String(e && e.message || e) }); }
  }

  check('header index parity', function () {
    var samples = [['a', ' b ', 'C'], ['x']];
    var probes = ['a', 'A', ' b', 'b', 'c', 'C', '', null, 'missing'];
    for (var i = 0; i < samples.length; i++) {
      for (var j = 0; j < probes.length; j++) {
        if (frHeaderIndex_(samples[i], probes[j]) !== fsHeaderIndex_(samples[i], probes[j])) return false;
      }
    }
    return true;
  });

  check('key normalisation parity', function () {
    var probes = [null, undefined, '', ' a ', 0, false, 'x|y'];
    for (var i = 0; i < probes.length; i++) {
      if (frNormalizeKeyPart_(probes[i]) !== fsNormalizeKeyPart_(probes[i])) return false;
    }
    if (frKeyFromValues_(['a', 'b']) !== fsKeyFromValues_(['a', 'b'])) return false;
    return true;
  });

  check('key-of-row parity', function () {
    var row = [' a ', 'b', ''];
    return frKeyOfRow_(row, [0, 2]) === fsKeyOfRow_(row, [0, 2]);
  });

  check('epoch parity', function () {
    return typeof FS_EPOCH_UTC_ === 'undefined' || frEpochUtc_() === FS_EPOCH_UTC_;
  });

  check('block-cell cap parity', function () {
    return typeof FS_MAX_BLOCK_CELLS_ === 'undefined' || frMaxBlockCells_() === FS_MAX_BLOCK_CELLS_;
  });

  check('batch-range cap parity', function () {
    return typeof FS_MAX_RANGES_PER_BATCH_ === 'undefined' || frMaxRangesPerBatch_() === FS_MAX_RANGES_PER_BATCH_;
  });

  check('bound-read rule: no whole-sheet range accessor in either engine', function () {
    var source = frEngineSource_();
    if (source === null) return true;                       /* source unavailable: not a failure */
    return source.indexOf('getData' + 'Range') === -1;
  });

  var ok = checks.every(function (c) { return c.ok; });
  return { ok: ok, checks: checks, siblingEnginePresent: hasSibling };
}

function frEpochUtc_() { return FR_EPOCH_UTC_; }
function frMaxBlockCells_() { return FR_MAX_BLOCK_CELLS_; }
function frMaxRangesPerBatch_() { return FR_MAX_RANGES_PER_BATCH_; }

/* The engine's own source text, when the platform lets us read it. Apps Script
 * cannot, so the static half of the parity guard lives in the offline harness
 * (tools/verify/fast_read_parity.js) and this returns null there. */
function frEngineSource_() {
  try {
    if (typeof Core_FastRead_source_ === 'function') return Core_FastRead_source_();
  } catch (e) {}
  return null;
}
