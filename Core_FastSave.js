/* ============================================================================
 * Core_FastSave.js — generic fast-save engine (Layers 1 and 2).
 *
 * WHAT THIS REPLACES
 * The legacy document-save path writes its children row by row, and each write
 * re-reads the entire sheet just to locate its row. A save with 40 child rows
 * pays 40 full-table reads. Its bulk-delete sibling has the same shape, and
 * per-cell write/delete loops pay one round trip per cell.
 *
 * WHAT THIS DOES INSTEAD
 * One bounded column read to locate every target row, then one Sheets v4 batch
 * call to write them all. The hard invariant is that this file never performs
 * a full-table read: every read is a getRange() of the narrow span it needs.
 * Static verification: no unbounded range call and no row-at-a-time write
 * exists in this file.
 *
 * DECOUPLING CONTRACT (do not break)
 * This file is business-agnostic by design and is shared by every module. It
 * must contain no business-table names, no module identifiers of any kind and
 * no user-facing strings in any language; the static gate is a case-insensitive
 * search for company and module tokens returning zero hits. Callers pass sheet
 * names, header names, row payloads and their own computed values. Errors are
 * typed codes; the module that owns the operation translates them into its own
 * user-facing message.
 *
 * FLAGS
 * FAST_SAVE_CORE_ is the master switch and defaults to false. With it false
 * every entry point refuses to run, so shipping this file changes no behaviour
 * until an owner turns it on together with a module flag.
 *
 * READ BUDGET
 * Layer 1 reports its own API usage in the return value. Per section the
 * allowance is one key read (the row-locating column read) and one write call
 * per write operation; the optional formula probe is reported separately so it
 * can never hide behind the key read. fastSaveSections_ enforces the allowance.
 * ==========================================================================*/

var FAST_SAVE_CORE_ = false;

/* Per-module opt-in switches live with the modules themselves (see the flag
 * block in Company_ValleyFoods_Actions.js): they name modules, and this file
 * must not. A module changes behaviour only when its switch AND this master
 * switch are both true, which is exactly what this helper answers. */
function fastSaveOnFor_(flag) {
  return flag === true && FAST_SAVE_CORE_ === true;
}

/* Google Sheets epoch: serial 0 = 1899-12-30. Same constant the ValleyFoods
 * attendance helpers use (Company_ValleyFoods_Actions.js:1564) — duplicated
 * here because that one is private to its IIFE and this file is global. */
var FS_EPOCH_UTC_ = Date.UTC(1899, 11, 30);

/* Safety valves, not budgets: a single batch request with hundreds of ranges
 * is slower than two, and the Sheets API rejects very large payloads. */
var FS_MAX_RANGES_PER_BATCH_ = 100;
var FS_MAX_DELETE_REQUESTS_PER_BATCH_ = 100;

/* Cells in the optional formula probe rectangle. Above this the probe is done
 * per written column instead of as one rectangle, so a scattered patch can
 * never turn the probe into a whole-sheet read. */
var FS_MAX_FORMULA_RECT_CELLS_ = 200000;

/* Cells in a parent-scoped read block. Above this the columns are read one at
 * a time instead of as one rectangle, for the same reason. */
var FS_MAX_BLOCK_CELLS_ = 400000;

/* Per-section allowance enforced by fastSaveSections_. */
var FS_BUDGET_KEY_READS_PER_SECTION_ = 1;
var FS_BUDGET_WRITE_CALLS_PER_SECTION_ = 2;

function fastSaveIsOn_() {
  return FAST_SAVE_CORE_ === true;
}

/* ── typed errors ──────────────────────────────────────────────────────────
 * The engine never throws user-facing text. Callers map these codes onto the
 * messages their page already shows, so the user's experience is unchanged. */
function fsError_(code, message, detail) {
  var e = new Error(message);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function fsAssertOn_() {
  if (!fastSaveIsOn_()) throw fsError_('FAST_SAVE_DISABLED', 'Fast-save engine is disabled (FAST_SAVE_CORE_ is false)');
}

/* ── header resolution ─────────────────────────────────────────────────────
 * Case-insensitive and trimmed, exactly like the legacy helpers it replaces
 * (patchRowByCriteria_ matches headers the same way, Code.js:1401). */
function fsHeaderIndex_(headers, name) {
  var want = String(name == null ? '' : name).trim().toLowerCase();
  if (!want) return -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === want) return i;
  }
  return -1;
}

function fsHeaderIndices_(headers, names) {
  var out = [];
  (names || []).forEach(function (n) {
    var idx = fsHeaderIndex_(headers, n);
    if (idx === -1) throw fsError_('FAST_SAVE_KEY_UNSUPPORTED', 'Header not found: ' + String(n), { header: String(n) });
    out.push(idx);
  });
  return out;
}

/* ── value fidelity ────────────────────────────────────────────────────────
 * The Sheets v4 service is JSON-based. A JS Date handed to it is serialised as
 * an ISO string, so RAW would store text and USER_ENTERED would re-parse it
 * through the spreadsheet locale — neither matches Range.setValues(), which
 * writes the date's local wall clock as a serial. The engine therefore writes
 * the serial itself, using the same epoch and the same local components, and
 * sends RAW. A cell written this way holds exactly the value setValues() would
 * have stored, which is what the staging comparison checks. */
function fsStoredValue_(v) {
  if (v instanceof Date) {
    var localMs = Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(),
      v.getHours(), v.getMinutes(), v.getSeconds(), v.getMilliseconds());
    return (localMs - FS_EPOCH_UTC_) / 86400000;
  }
  return v;
}

function fsQuoteSheetName_(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

function fsA1_(sheetName, row, col, numRows, numCols) {
  function colLetter(n) {
    var s = '';
    while (n > 0) {
      var m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }
  var start = colLetter(col) + row;
  if (numRows === 1 && numCols === 1) return fsQuoteSheetName_(sheetName) + '!' + start;
  var end = colLetter(col + numCols - 1) + (row + numRows - 1);
  return fsQuoteSheetName_(sheetName) + '!' + start + ':' + end;
}

/* ── key construction ──────────────────────────────────────────────────────
 * A key is the trimmed string form of one or more columns joined with '|'.
 * Blank components are kept as empty strings so a composite key never
 * collapses; callers are responsible for rejecting blank keys before they
 * reach here. Duplicate keys resolve LAST MATCH WINS, which is the contract
 * indexById already documents (Code.js:1803). */
function fsNormalizeKeyPart_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function fsKeyFromValues_(values) {
  return values.join('|');
}

function fsKeyOfRow_(row, headerIndices) {
  var parts = [];
  for (var i = 0; i < headerIndices.length; i++) parts.push(fsNormalizeKeyPart_(row[headerIndices[i]]));
  return fsKeyFromValues_(parts);
}

/* ── Layer 1: a single column, one bounded read ─────────────────────────── */
function fsReadColumnValues_(sheet, headerName) {
  var headers = getHeaders_(sheet);
  var idx = fsHeaderIndex_(headers, headerName);
  if (idx === -1) throw fsError_('FAST_SAVE_KEY_UNSUPPORTED', 'Header not found: ' + String(headerName), { header: String(headerName) });
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { index: idx, values: [], lastRow: lastRow, reads: 0 };
  countSheetRead_();
  var values = sheet.getRange(2, idx + 1, lastRow - 1, 1).getValues();
  var flat = [];
  for (var i = 0; i < values.length; i++) flat.push(values[i][0]);
  return { index: idx, values: flat, lastRow: lastRow, reads: 1 };
}

/* ── Layer 1: row locator ──────────────────────────────────────────────────
 * One bounded read of the key column(s) — the key column or the narrow
 * rectangle spanning them for a composite key — turned into key -> rowNumber.
 * This is the whole point of the engine: it replaces N full-table reads with
 * one column read, and a missing key costs nothing extra.
 *
 * `wantedKeys` (optional) keeps only the rows the caller is about to touch, so
 * memory stays proportional to the document rather than to the table. */
function fsKeyIndex_(sheet, keyHeaders, wantedKeys, collectAll) {
  var headers = getHeaders_(sheet);
  var idxs = Array.isArray(keyHeaders) ? fsHeaderIndices_(headers, keyHeaders) : [fsHeaderIndex_(headers, keyHeaders)];
  if (idxs[0] === -1) throw fsError_('FAST_SAVE_KEY_UNSUPPORTED', 'Header not found: ' + String(keyHeaders), { header: String(keyHeaders) });
  if (idxs.length > 1 && idxs.indexOf(-1) !== -1) throw fsError_('FAST_SAVE_KEY_UNSUPPORTED', 'Composite key header not found', { header: keyHeaders });

  var lastRow = sheet.getLastRow();
  var map = new Map();
  if (lastRow < 2) return { map: map, indices: idxs, lastRow: lastRow, reads: 0 };

  var minIdx = Math.min.apply(null, idxs);
  var maxIdx = Math.max.apply(null, idxs);
  countSheetRead_();
  var block = sheet.getRange(2, minIdx + 1, lastRow - 1, maxIdx - minIdx + 1).getValues();

  var offset = minIdx;
  for (var r = 0; r < block.length; r++) {
    var parts = [];
    var anyPart = false;
    for (var k = 0; k < idxs.length; k++) {
      var part = fsNormalizeKeyPart_(block[r][idxs[k] - offset]);
      if (part) anyPart = true;
      parts.push(part);
    }
    /* A row whose key components are all blank is not addressable; skipping it
     * keeps a blank sheet row out of the index instead of mapping '' -> row. */
    if (!anyPart) continue;
    var key = fsKeyFromValues_(parts);
    if (wantedKeys && !wantedKeys[key]) continue;
    if (collectAll) {
      var hits = map.get(key);
      if (hits) hits.push(r + 2);
      else map.set(key, [r + 2]);
    } else if (!map.has(key)) {
      /* FIRST match wins, which is what the legacy locate-then-write scan does
       * and what a patch of a duplicated key must therefore keep doing. */
      map.set(key, r + 2);
    }
  }
  return { map: map, indices: idxs, lastRow: lastRow, reads: 1 };
}

/* ── Layer 1: block read of named columns ──────────────────────────────────
 * The whole of a named column set, as records keyed by the sheet's own header
 * spelling, each carrying __row. One bounded block read normally; one read per
 * column above the block cap. Used where a caller must scan a child table
 * against a SET of parent keys rather than a single one — the legacy code did
 * that by materializing every column of every row, which is what this avoids. */
function fsReadBlockRows_(sheet, columns) {
  var headers = getHeaders_(sheet);
  var idxs = [];
  (columns || []).forEach(function (c) {
    var i = fsHeaderIndex_(headers, c);
    if (i !== -1 && idxs.indexOf(i) === -1) idxs.push(i);
  });
  var out = { rows: [], reads: 0 };
  if (!idxs.length) return out;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return out;
  var minIdx = Math.min.apply(null, idxs);
  var maxIdx = Math.max.apply(null, idxs);

  if ((lastRow - 1) * (maxIdx - minIdx + 1) <= FS_MAX_BLOCK_CELLS_) {
    countSheetRead_();
    out.reads = 1;
    var block = sheet.getRange(2, minIdx + 1, lastRow - 1, maxIdx - minIdx + 1).getValues();
    for (var r = 0; r < block.length; r++) {
      var rec = { __row: r + 2 };
      for (var k = 0; k < idxs.length; k++) rec[String(headers[idxs[k]]).trim()] = block[r][idxs[k] - minIdx];
      out.rows.push(rec);
    }
    return out;
  }

  var recs = new Array(lastRow - 1);
  idxs.forEach(function (i) {
    countSheetRead_();
    out.reads++;
    var col = sheet.getRange(2, i + 1, lastRow - 1, 1).getValues();
    var name = String(headers[i]).trim();
    for (var r2 = 0; r2 < col.length; r2++) {
      if (!recs[r2]) recs[r2] = { __row: r2 + 2 };
      recs[r2][name] = col[r2][0];
    }
  });
  for (var q = 0; q < recs.length; q++) if (recs[q]) out.rows.push(recs[q]);
  return out;
}

/* ── Layer 1: parent-scoped row read ───────────────────────────────────────
 * "Give me the child rows that belong to this parent" without materializing
 * the table. One bounded block read spanning the parent column and the wanted
 * columns; when that span would be too wide the columns are read one at a time
 * and only the matching rows are kept, so the memory cost stays proportional
 * to the document, never to the table.
 *
 * Each returned row carries its own sheet row number in __row, and its values
 * keyed by the sheet's own header spelling (trimmed), which is what the
 * callers' sheets look like — including non-Latin headers. */
function fsReadRowsByParent_(sheet, parentHeader, parentValue, columns) {
  var headers = getHeaders_(sheet);
  var pIdx = fsHeaderIndex_(headers, parentHeader);
  if (pIdx === -1) throw fsError_('FAST_SAVE_KEY_UNSUPPORTED', 'Header not found: ' + String(parentHeader), { header: String(parentHeader) });
  var wantIdx = [];
  (columns || []).forEach(function (c) {
    var i = fsHeaderIndex_(headers, c);
    if (i !== -1 && wantIdx.indexOf(i) === -1) wantIdx.push(i);
  });

  var lastRow = sheet.getLastRow();
  var out = { rows: [], reads: 0 };
  if (lastRow < 2) return out;
  var want = String(parentValue == null ? '' : parentValue).trim();

  var minIdx = pIdx;
  var maxIdx = pIdx;
  wantIdx.forEach(function (i) {
    if (i < minIdx) minIdx = i;
    if (i > maxIdx) maxIdx = i;
  });

  var spanCells = (lastRow - 1) * (maxIdx - minIdx + 1);
  if (spanCells <= FS_MAX_BLOCK_CELLS_) {
    countSheetRead_();
    out.reads = 1;
    var block = sheet.getRange(2, minIdx + 1, lastRow - 1, maxIdx - minIdx + 1).getValues();
    for (var r = 0; r < block.length; r++) {
      if (fsNormalizeKeyPart_(block[r][pIdx - minIdx]) !== want) continue;
      var rec = { __row: r + 2 };
      wantIdx.forEach(function (i) { rec[String(headers[i]).trim()] = block[r][i - minIdx]; });
      out.rows.push(rec);
    }
    return out;
  }

  var fk = fsReadColumnValues_(sheet, headers[pIdx]);
  out.reads += fk.reads;
  var byRow = new Map();
  fk.values.forEach(function (v, i) {
    if (fsNormalizeKeyPart_(v) === want) byRow.set(i + 2, { __row: i + 2 });
  });
  if (!byRow.size) return out;
  wantIdx.forEach(function (i) {
    countSheetRead_();
    out.reads++;
    var col = sheet.getRange(2, i + 1, lastRow - 1, 1).getValues();
    var name = String(headers[i]).trim();
    byRow.forEach(function (rec, rowNum) { rec[name] = col[rowNum - 2][0]; });
  });
  byRow.forEach(function (rec) { out.rows.push(rec); });
  out.rows.sort(function (a, b) { return a.__row - b.__row; });
  return out;
}

/* ── Layer 1: batched multi-row patch ──────────────────────────────────────
 * One key read to locate the rows, at most one write call for the whole set.
 *
 * Options:
 *   preserveFormulas  default true. A cell that currently holds a formula is
 *                     never overwritten unless its column is named in
 *                     overwriteColumns — the exact rule patchRowByCriteria_
 *                     enforces (Code.js:1411). The probe reads only the
 *                     written columns over the target row span.
 *   overwriteColumns  columns the caller owns outright (derived values it
 *                     computes itself). Listing them skips the probe for them.
 *   skipFormulaProbe  set true only when every written column is declared in
 *                     overwriteColumns; it makes the patch exactly one read
 *                     plus one write.
 *   missingKey        'throw' (default) or 'skip'.
 *   stamp             default true: noteMutation_(sheet) fires after the write,
 *                     which disables the per-request record memo and stamps the
 *                     table version that drives the client's refresh prompt.
 *                     Never turn this off for a business table.
 *   valueInputOption  default 'RAW'; the engine writes date serials itself. */
function fsPatchRowsByNumber_(dbId, sheet, updatesByRow, opts) {
  fsAssertOn_();
  var o = opts || {};
  var preserveFormulas = o.preserveFormulas !== false;
  var skipProbe = o.skipFormulaProbe === true;
  var overwrite = {};
  (o.overwriteColumns || []).forEach(function (c) { overwrite[String(c).trim().toLowerCase()] = true; });
  var stamp = o.stamp !== false;
  var valueInputOption = o.valueInputOption === 'USER_ENTERED' ? 'USER_ENTERED' : 'RAW';

  var result = { writtenRows: [], cellCount: 0, ignoredColumns: [], protectedCells: [],
    formulaReads: 0, writeCalls: 0 };

  /* Row numbers are only trustworthy when they came from a read taken in the
   * same locked execution, and a number past the sheet's last row is refused
   * rather than written into whatever now occupies it. */
  var rowNumbers = [];
  Object.keys(updatesByRow || {}).forEach(function (k) {
    var n = Number(k);
    if (isFinite(n) && Math.floor(n) === n && n >= 2) rowNumbers.push(n);
  });
  if (!rowNumbers.length) return result;
  rowNumbers.sort(function (a, b) { return a - b; });

  var headers = getHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  rowNumbers.forEach(function (n) {
    if (n > lastRow) {
      throw fsError_('FAST_SAVE_ROW_OUT_OF_RANGE',
        'Target row ' + n + ' is past the last row (' + lastRow + ') of ' + sheet.getName(),
        { sheetName: sheet.getName(), row: n, lastRow: lastRow });
    }
  });

  /* Field resolution. Unknown update keys are ignored, exactly as
   * patchRowByCriteria_ ignores them (Code.js:1385). */
  var fieldCols = [];
  var ignored = {};
  var perRow = {};
  rowNumbers.forEach(function (n) {
    var upd = updatesByRow[n] || updatesByRow[String(n)] || {};
    var row = {};
    Object.keys(upd).forEach(function (field) {
      var idx = fsHeaderIndex_(headers, field);
      if (idx === -1) { ignored[String(field)] = true; return; }
      row[idx] = upd[field];
    });
    perRow[n] = row;
    Object.keys(row).forEach(function (idxStr) {
      if (fieldCols.indexOf(Number(idxStr)) === -1) fieldCols.push(Number(idxStr));
    });
  });
  result.ignoredColumns = Object.keys(ignored);
  if (!fieldCols.length) return result;

  var minRow = rowNumbers[0];
  var maxRow = rowNumbers[rowNumbers.length - 1];

  /* Formula probe. Only the columns about to be written are examined, and only
   * across the span the target rows actually occupy. */
  var protectedByRow = {};
  if (preserveFormulas && !skipProbe && fieldCols.length) {
    var probeCols = fieldCols.filter(function (c) {
      return !overwrite[String(headers[c]).trim().toLowerCase()];
    });
    if (probeCols.length) {
      var spanRows = maxRow - minRow + 1;
      var minCol = Math.min.apply(null, probeCols);
      var maxCol = Math.max.apply(null, probeCols);
      var rectCells = spanRows * (maxCol - minCol + 1);
      if (rectCells <= FS_MAX_FORMULA_RECT_CELLS_) {
        countSheetRead_();
        var rect = sheet.getRange(minRow, minCol + 1, spanRows, maxCol - minCol + 1).getFormulas();
        result.formulaReads = 1;
        probeCols.forEach(function (c) {
          for (var r = 0; r < rect.length; r++) {
            if (rect[r][c - minCol]) {
              var rowNum = minRow + r;
              if (!protectedByRow[rowNum]) protectedByRow[rowNum] = {};
              protectedByRow[rowNum][c] = true;
              result.protectedCells.push(rowNum + ':' + String(headers[c]));
            }
          }
        });
      } else {
        probeCols.forEach(function (c) {
          countSheetRead_();
          var col = sheet.getRange(minRow, c + 1, spanRows, 1).getFormulas();
          result.formulaReads++;
          for (var r = 0; r < col.length; r++) {
            if (col[r][0]) {
              var rowNum2 = minRow + r;
              if (!protectedByRow[rowNum2]) protectedByRow[rowNum2] = {};
              protectedByRow[rowNum2][c] = true;
              result.protectedCells.push(rowNum2 + ':' + String(headers[c]));
            }
          }
        });
      }
    }
  }

  var data = [];
  rowNumbers.forEach(function (rowNum) {
    var row = perRow[rowNum];
    var cols = Object.keys(row).map(Number).filter(function (c) {
      return !(protectedByRow[rowNum] && protectedByRow[rowNum][c]);
    }).sort(function (a, b) { return a - b; });

    var run = [];
    var flush = function () {
      if (!run.length) return;
      data.push({
        range: fsA1_(sheet.getName(), rowNum, run[0] + 1, 1, run.length),
        values: [run.map(function (c) { return fsStoredValue_(row[c]); })]
      });
      result.cellCount += run.length;
      run = [];
    };
    cols.forEach(function (c) {
      if (run.length && c !== run[run.length - 1] + 1) flush();
      run.push(c);
    });
    flush();

    result.writtenRows.push(rowNum);
  });

  if (data.length) {
    for (var i = 0; i < data.length; i += FS_MAX_RANGES_PER_BATCH_) {
      var chunk = data.slice(i, i + FS_MAX_RANGES_PER_BATCH_);
      Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: valueInputOption, data: chunk }, dbId);
      result.writeCalls++;
    }
    if (stamp) noteMutation_(sheet);
  }
  return result;
}

/* Locate by key, then patch by row number. The wrapper exists so a caller that
 * holds only keys (the common case) pays exactly one column read for the
 * location and never needs a row number of its own. */
function fsPatchRowsByKey_(dbId, sheet, keyHeaders, updatesByKey, opts) {
  fsAssertOn_();
  var o = opts || {};
  var missingKey = o.missingKey === 'skip' ? 'skip' : 'throw';
  var keys = Object.keys(updatesByKey || {});
  var result = { writtenByKey: {}, writtenRows: [], cellCount: 0, ignoredColumns: [], protectedCells: [],
    keyReads: 0, formulaReads: 0, writeCalls: 0, missingKeys: [] };
  if (!keys.length) return result;

  var wanted = {};
  keys.forEach(function (k) { wanted[k] = true; });
  var located = fsKeyIndex_(sheet, keyHeaders, wanted);
  result.keyReads = located.reads;

  var missing = [];
  var byRow = {};
  keys.forEach(function (k) {
    if (located.map.has(k)) {
      var rowNum = located.map.get(k);
      byRow[rowNum] = updatesByKey[k];
      result.writtenByKey[k] = rowNum;
    } else {
      missing.push(k);
    }
  });
  if (missing.length && missingKey === 'throw') {
    result.missingKeys = missing;
    throw fsError_('FAST_SAVE_MISSING_KEY', 'Row not found for key: ' + missing.join(', '),
      { sheetName: sheet.getName(), keys: missing });
  }
  if (!Object.keys(byRow).length) return result;

  var core = fsPatchRowsByNumber_(dbId, sheet, byRow, opts);
  result.writtenRows = core.writtenRows;
  result.cellCount = core.cellCount;
  result.ignoredColumns = core.ignoredColumns;
  result.protectedCells = core.protectedCells;
  result.formulaReads = core.formulaReads;
  result.writeCalls = core.writeCalls;
  return result;
}

/* ── Layer 1: batched append ───────────────────────────────────────────────
 * One contiguous write for every new row. `matrix` is an array of arrays in
 * the sheet's own header order — the caller builds it, including every id and
 * unique_id it wants stored; the engine allocates nothing. */
function fsAppendRowsBlock_(sheet, matrix, opts) {
  fsAssertOn_();
  var o = opts || {};
  var stamp = o.stamp !== false;
  var rows = matrix || [];
  var result = { startRow: 0, count: 0, cellCount: 0, writeCalls: 0 };
  if (!rows.length) return result;
  var width = rows[0].length;
  rows.forEach(function (r) {
    if (r.length !== width) throw fsError_('FAST_SAVE_SHAPE_ERROR', 'Append rows must all have the same width');
  });
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, width).setValues(rows.map(function (r) {
    return r.map(fsStoredValue_);
  }));
  result.startRow = startRow;
  result.count = rows.length;
  result.cellCount = rows.length * width;
  result.writeCalls = 1;
  if (stamp) noteMutation_(sheet);
  return result;
}

/* ── Layer 1: batched delete ───────────────────────────────────────────────
 * One key read to locate the rows, one Sheets v4 batch call to delete them.
 * Rows are merged into contiguous runs and the requests are issued in
 * DESCENDING start index so an earlier deletion can never shift a later one —
 * the same bottom-up discipline deleteRowsWhereIn_ documents (Code.js:1518). */
function fsDeleteRows_(dbId, sheet, rowNumbers, opts) {
  fsAssertOn_();
  var o = opts || {};
  var stamp = o.stamp !== false;
  var result = { deletedRows: [], runs: [], writeCalls: 0 };

  var seen = {};
  var rows = [];
  (rowNumbers || []).forEach(function (n) {
    var v = Number(n);
    if (!isFinite(v) || Math.floor(v) !== v || v < 2 || seen[v]) return;
    seen[v] = true;
    rows.push(v);
  });
  if (!rows.length) return result;
  rows.sort(function (a, b) { return a - b; });

  var runs = [];
  var runStart = rows[0];
  var prev = rows[0];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i] === prev + 1) { prev = rows[i]; continue; }
    runs.push({ start: runStart, end: prev });
    runStart = rows[i];
    prev = rows[i];
  }
  runs.push({ start: runStart, end: prev });

  var sheetId = sheet.getSheetId();
  var requests = [];
  for (var r = runs.length - 1; r >= 0; r--) {
    requests.push({ deleteDimension: { range: {
      sheetId: sheetId, dimension: 'ROWS',
      startIndex: runs[r].start - 1, endIndex: runs[r].end
    } } });
  }
  for (var j = 0; j < requests.length; j += FS_MAX_DELETE_REQUESTS_PER_BATCH_) {
    var chunk = requests.slice(j, j + FS_MAX_DELETE_REQUESTS_PER_BATCH_);
    Sheets.Spreadsheets.batchUpdate({ requests: chunk }, dbId);
    result.writeCalls++;
  }
  result.deletedRows = rows;
  result.runs = runs;
  if (stamp) noteMutation_(sheet);
  return result;
}

function fsDeleteRowsByKeys_(dbId, sheet, keyHeaders, keys, opts) {
  fsAssertOn_();
  var result = { deletedKeys: [], deletedRows: [], runs: [], keyReads: 0, writeCalls: 0 };
  var wanted = {};
  var list = [];
  (keys || []).forEach(function (k) {
    var key = String(k == null ? '' : k).trim();
    if (!key || wanted[key]) return;
    wanted[key] = true;
    list.push(key);
  });
  if (!list.length) return result;

  /* Deletion takes EVERY row carrying the key, which is what the legacy
   * delete-every-match scan does — a duplicated key must not leave a row
   * behind merely because a patch would have targeted the first one. */
  var located = fsKeyIndex_(sheet, keyHeaders, wanted, true);
  result.keyReads = located.reads;

  var rows = [];
  list.forEach(function (k) {
    var hits = located.map.get(k);
    if (!hits || !hits.length) return;
    for (var i = 0; i < hits.length; i++) rows.push(hits[i]);
    result.deletedKeys.push(k);
  });
  if (!rows.length) return result;

  var core = fsDeleteRows_(dbId, sheet, rows, opts);
  result.deletedRows = core.deletedRows;
  result.runs = core.runs;
  result.writeCalls = core.writeCalls;
  return result;
}

/* ── Layer 2: document orchestration ───────────────────────────────────────
 * One call per document save. All sections run inside the caller's lock (the
 * lock is re-entrant, Code.js:899), every touched sheet is stamped through
 * noteMutation_, and the returned manifest carries the written row numbers so
 * the caller never re-reads after writing.
 *
 * Section:
 *   sheetName          string
 *   keyHeader          string, or array of strings for a composite key
 *   mode               'patch' | 'insert' | 'delete' | 'patch+insert+delete'
 *   rows               object map keyed by record key, for 'patch'
 *   insertRows         array of arrays in header order, for 'insert'
 *   deleteKeys         array of keys (patch mode) or header-order values
 *                      (insert mode) for 'delete'
 *   deleteKeyHeader    the key column the deleteKeys are expressed in
 *   opts               forwarded to the Layer 1 primitive
 *
 * The manifest is deliberately shallow and JSON-safe: keys, row numbers and
 * call counters only. */
function fastSaveSections_(spec) {
  fsAssertOn_();
  var s = spec || {};
  var sections = s.sections || [];
  var manifest = { sections: [], totals: { keyReads: 0, formulaReads: 0, writeCalls: 0, cells: 0, appended: 0, deleted: 0 }, scopeId: s.scopeId || '' };

  var run = function () {
    sections.forEach(function (sec, i) {
      var mode = String(sec.mode || 'patch');
      var sheet = getSheet_(sec.sheetName, s.scopeId);
      var entry = { index: i, sheetName: sec.sheetName, mode: mode,
        writtenByKey: {}, appended: 0, deleted: 0, deletedKeys: [],
        keyReads: 0, formulaReads: 0, writeCalls: 0, cells: 0, stamped: false };

      if (mode.indexOf('patch') !== -1 && sec.rows) {
        var patched = fsPatchRowsByKey_(s.scopeId, sheet, sec.keyHeader, sec.rows, sec.opts || {});
        entry.writtenByKey = patched.writtenByKey;
        entry.keyReads += patched.keyReads;
        entry.formulaReads += patched.formulaReads;
        entry.writeCalls += patched.writeCalls;
        entry.cells += patched.cellCount;
        entry.ignoredColumns = patched.ignoredColumns;
      }
      if (mode.indexOf('insert') !== -1 && sec.insertRows) {
        var appended = fsAppendRowsBlock_(sheet, sec.insertRows, sec.opts || {});
        entry.appended += appended.count;
        entry.writeCalls += appended.writeCalls;
        entry.cells += appended.cellCount;
        entry.startRow = appended.startRow;
      }
      if (mode.indexOf('delete') !== -1 && sec.deleteKeys && sec.deleteKeys.length) {
        var deleted = fsDeleteRowsByKeys_(s.scopeId, sheet, sec.deleteKeyHeader || sec.keyHeader, sec.deleteKeys, sec.opts || {});
        entry.deleted += deleted.deletedKeys.length;
        entry.deletedKeys = deleted.deletedKeys;
        entry.keyReads += deleted.keyReads;
        entry.writeCalls += deleted.writeCalls;
      }

      /* Honest, not assumed: the primitives stamp by default, and a caller that
       * explicitly opted out is reported as unstamped rather than silently
       * credited with the sync prompt's version stamp. */
      var willStamp = !(sec.opts && sec.opts.stamp === false);
      entry.stamped = willStamp && entry.writeCalls > 0;
      if (entry.keyReads > FS_BUDGET_KEY_READS_PER_SECTION_) {
        throw fsError_('FAST_SAVE_BUDGET_ERROR', 'Section "' + sec.sheetName + '" used ' + entry.keyReads + ' key reads (allowed ' + FS_BUDGET_KEY_READS_PER_SECTION_ + ')', entry);
      }
      if (entry.writeCalls > FS_BUDGET_WRITE_CALLS_PER_SECTION_) {
        throw fsError_('FAST_SAVE_BUDGET_ERROR', 'Section "' + sec.sheetName + '" used ' + entry.writeCalls + ' write calls (allowed ' + FS_BUDGET_WRITE_CALLS_PER_SECTION_ + ')', entry);
      }

      manifest.totals.keyReads += entry.keyReads;
      manifest.totals.formulaReads += entry.formulaReads;
      manifest.totals.writeCalls += entry.writeCalls;
      manifest.totals.cells += entry.cells;
      manifest.totals.appended += entry.appended;
      manifest.totals.deleted += entry.deleted;
      manifest.sections.push(entry);
    });
    return manifest;
  };

  return s.lock === false ? run() : executeWithLock_(run);
}
