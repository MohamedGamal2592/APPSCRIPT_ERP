'use strict';

/**
 * Fake Google Sheets workbook for executable VM harnesses.
 *
 * WHY THIS EXISTS
 * The read/view programme's verification standard (plan §7.5, D6) is executable:
 * a server handler must RUN against a controlled sheet, not merely be inspected.
 * `gasstub.js` provides the service leaves (CacheService, PropertiesService,
 * LockService, Utilities) but its fake sheets were built for chunk-cache tests
 * and implement none of the metadata the shared data layer needs —
 * `getParent().getId()`, `getSheetId()`, `getLastColumn()` — so every handler
 * that reaches `getHeaders_` fails there.
 *
 * This file supplies a real (small) sheet object model: cells, headers,
 * metadata, ranges, and the Sheets v4 batch surface. Handlers, `getSheet_`,
 * `getHeaders_`, `getAllRecords_` and `getReadOnlyRecords_` all execute as the
 * project's own unmodified source. Nothing here touches a Google service, the
 * network or a real spreadsheet, and nothing writes production data.
 *
 * Accounting: every value read, value write, metadata call and Sheets API call
 * is counted, so a harness can report the same service-call metrics the
 * engine's own metrics contract promises (plan §5.1).
 *
 * Not implemented on purpose: formatting, protection, UI, charts and the
 * Advanced API's typed-value envelope. Each unsupported call throws
 * `stub: not implemented` rather than returning a plausible-looking lie.
 */

var VF_STUB_EPOCH_UTC = Date.UTC(1899, 11, 30);

function stubIsBlank_(v) {
  return v === '' || v === null || v === undefined;
}

function stubClone_(v) {
  return v instanceof Date ? new Date(v.getTime()) : v;
}

function stubColToIndex_(letters) {
  var s = String(letters || '').replace(/\$/g, '').toUpperCase();
  var n = 0;
  for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function stubIndexToCol_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Parse `Sheet1!A1:B2`, `'My Sheet'!A2:Z`, `A:A`, `A1`. Returns
 *  { sheetName | null, row, col, numRows, numCols }; sheetName is null when the
 *  caller supplied a bare range. `lastRow` fills an open-ended end row. */
function stubParseA1_(a1, lastRow) {
  var s = String(a1 || '').trim();
  var sheetName = null;
  var bang = s.lastIndexOf('!');
  if (bang !== -1) {
    sheetName = s.slice(0, bang).trim();
    if (sheetName.charAt(0) === "'") sheetName = sheetName.slice(1, -1).replace(/''/g, "'");
    else if (sheetName.charAt(0) === '"') sheetName = sheetName.slice(1, -1);
    s = s.slice(bang + 1).trim();
  }
  var m = /^([A-Za-z$]+)?(\d+)?(?::([A-Za-z$]+)?(\d+)?)?$/.exec(s);
  if (!m || (!m[1] && !m[3])) throw new Error('stub: cannot parse A1 range "' + a1 + '"');
  var c1 = m[1] ? stubColToIndex_(m[1]) : 1;
  var r1 = m[2] ? Number(m[2]) : 1;
  var c2 = m[3] ? stubColToIndex_(m[3]) : (m[4] ? c1 : (m[1] ? c1 : 1));
  var r2 = m[4] ? Number(m[4]) : r1;
  if (!m[3] && m[4]) c2 = 26;                       /* A2:4 — rare; widen to Z */
  if (!m[2] && !m[4]) { r1 = 1; r2 = Math.max(1, Number(lastRow) || 1); }  /* A:A */
  if (m[1] && m[3] && !m[4]) r2 = Math.max(1, Number(lastRow) || r1);      /* A2:Z */
  if (r2 < r1) r2 = r1;
  if (c2 < c1) c2 = c1;
  return { sheetName: sheetName, row: r1, col: c1, numRows: r2 - r1 + 1, numCols: c2 - c1 + 1 };
}

/**
 * @param {object} [opts] { maxRows: grid floor } 
 * @return {object} { createSpreadsheet, openById, getActiveSpreadsheet, stats, operations }
 */
function createWorkbookStub(opts) {
  opts = opts || {};
  var books = new Map();
  var counts = { rangeReads: 0, formulaReads: 0, rangeWrites: 0, metaReads: 0, sheetsApiCalls: 0, sheetLookups: 0 };
  var operations = [];

  function note(kind, detail) {
    operations.push(kind + (detail ? ':' + detail : ''));
    if (operations.length > 5000) operations.shift();
  }

  function makeSheet(book, name, sheetId) {
    var cells = [];        /* rows of values, sparse rows allowed (holes = empty) */
    var formulas = [];     /* parallel matrix of formula strings, '' when none */

    function ensureRow(r) {
      if (!cells[r]) cells[r] = [];
      if (!formulas[r]) formulas[r] = [];
    }

    function cellAt(r, c) {
      var row = cells[r];
      return row ? row[c] : undefined;
    }
    function rowHasContent(r) {
      var row = cells[r] || [];
      for (var c = 0; c < row.length; c++) if (!stubIsBlank_(row[c])) return true;
      var frow = formulas[r] || [];
      for (var f = 0; f < frow.length; f++) if (frow[f]) return true;
      return false;
    }

    var sheet = {
      getName: function () { return name; },
      getSheetId: function () { counts.metaReads++; return sheetId; },
      getParent: function () { return book; },
      getMaxRows: function () { counts.metaReads++; return Math.max(Number(opts.maxRows) || 1000, cells.length); },
      getMaxColumns: function () { counts.metaReads++; return Math.max(26, sheet.getLastColumn()); },

      getLastRow: function () {
        counts.metaReads++;
        for (var r = cells.length - 1; r >= 0; r--) if (rowHasContent(r)) return r + 1;
        return 0;
      },
      getLastColumn: function () {
        counts.metaReads++;
        var last = 0;
        for (var r = 0; r < cells.length; r++) {
          var row = cells[r] || [];
          for (var c = Math.max(last, 0); c < row.length; c++) if (!stubIsBlank_(row[c])) last = c + 1;
          var frow = formulas[r] || [];
          for (var f = Math.max(last, 0); f < frow.length; f++) if (frow[f]) last = f + 1;
        }
        return last;
      },

      getRange: function (row, col, numRows, numCols) {
        counts.metaReads++;
        var nr = numRows === undefined ? 1 : Number(numRows);
        var nc = numCols === undefined ? 1 : Number(numCols);
        if (!(row >= 1) || !(col >= 1) || !(nr >= 1) || !(nc >= 1)) {
          throw new Error('stub: invalid range ' + row + ',' + col + ',' + numRows + ',' + numCols);
        }
        return makeRange(sheet, Number(row), Number(col), nr, nc);
      },
      getDataRange: function () {
        counts.metaReads++;
        var lr = sheet.getLastRow();
        var lc = sheet.getLastColumn();
        return makeRange(sheet, 1, 1, Math.max(1, lr), Math.max(1, lc));
      },
      appendRow: function (values) {
        var startRow = sheet.getLastRow() + 1;
        writeBlock(startRow, 1, [Array.prototype.slice.call(values)]);
        return sheet;
      },
      deleteRow: function (row) { return sheet.deleteRows(row, 1); },
      deleteRows: function (start, count) {
        var n = Number(count) || 1;
        cells.splice(Number(start) - 1, n);
        formulas.splice(Number(start) - 1, n);
        note('deleteRows', name + ':' + start + ':' + n);
        return sheet;
      },
      insertRowsAfter: function (row, count) {
        var pad = [];
        for (var i = 0; i < (Number(count) || 1); i++) pad.push([]);
        cells.splice(Number(row), 0, pad.slice());
        formulas.splice(Number(row), 0, pad.slice());
        return sheet;
      },
      clearContents: function () { cells = []; formulas = []; return sheet; },
      getFormulas: function () { return formulaMatrix(); },

      /* harness-only accessors (never used by project source) */
      __setRows: function (matrix) {
        cells = []; formulas = [];
        (matrix || []).forEach(function (r, i) { ensureRow(i); cells[i] = Array.prototype.slice.call(r); });
        return sheet;
      },
      __rows: function () {
        return cells.map(function (r) { return (r || []).map(stubClone_); });
      },
      __headerRow: function () { return (cells[0] || []).slice(); },
      __setFormula: function (row, col, f) { ensureRow(row - 1); formulas[row - 1][col - 1] = String(f); },
      __contentRows: function () {
        var out = [];
        for (var r = 0; r < cells.length; r++) if (rowHasContent(r)) out.push({ row: r + 1, cells: (cells[r] || []).slice() });
        return out;
      }
    };

    function formulaMatrix() {
      var out = [];
      for (var r = 0; r < cells.length; r++) {
        var row = [];
        var frow = formulas[r] || [];
        var width = Math.max((cells[r] || []).length, frow.length);
        for (var c = 0; c < width; c++) row.push(frow[c] || '');
        out.push(row);
      }
      return out;
    }

    function writeBlock(row, col, values) {
      for (var r = 0; r < values.length; r++) {
        ensureRow(row - 1 + r);
        var line = values[r] || [];
        for (var c = 0; c < line.length; c++) cells[row - 1 + r][col - 1 + c] = line[c];
      }
    }

    function makeRange(rangeSheet, row, col, numRows, numCols) {
      function readMatrix(which) {
        if (which === 'values') counts.rangeReads++;
        else counts.formulaReads++;
        var out = [];
        for (var r = 0; r < numRows; r++) {
          var line = [];
          var frow = formulas[row - 1 + r] || [];
          for (var c = 0; c < numCols; c++) {
            if (which === 'values') {
              var v = cellAt(row - 1 + r, col - 1 + c);
              line.push(v === undefined ? '' : stubClone_(v));
            } else {
              line.push(frow[col - 1 + c] || '');
            }
          }
          out.push(line);
        }
        return out;
      }
      var range = {
        getSheet: function () { return rangeSheet; },
        getRow: function () { return row; },
        getColumn: function () { return col; },
        getNumRows: function () { return numRows; },
        getNumColumns: function () { return numCols; },
        getA1Notation: function () {
          var a = stubIndexToCol_(col) + row;
          if (numRows === 1 && numCols === 1) return a;
          return a + ':' + stubIndexToCol_(col + numCols - 1) + (row + numRows - 1);
        },
        getValues: function () { return readMatrix('values'); },
        getFormulas: function () { return readMatrix('formulas'); },
        getDisplayValues: function () {
          return readMatrix('values').map(function (r) {
            return r.map(function (v) { return v instanceof Date ? v.toISOString() : String(v); });
          });
        },
        getValue: function () { return readMatrix('values')[0][0]; },
        getFormula: function () { return readMatrix('formulas')[0][0]; },
        setValues: function (values) {
          counts.rangeWrites++;
          note('setValues', name + '!' + range.getA1Notation());
          writeBlock(row, col, values || []);
          return range;
        },
        setValue: function (v) {
          counts.rangeWrites++;
          note('setValue', name + '!' + range.getA1Notation());
          writeBlock(row, col, [[v]]);
          return range;
        },
        setFormulas: function (values) {
          for (var r = 0; r < (values || []).length; r++) {
            for (var c = 0; c < (values[r] || []).length; c++) {
              ensureRow(row - 1 + r);
              formulas[row - 1 + r][col - 1 + c] = String(values[r][c] || '');
            }
          }
          return range;
        },
        setFormula: function (f) { return range.setFormulas([[f]]); },
        clearContent: function () {
          for (var r = 0; r < numRows; r++) {
            ensureRow(row - 1 + r);
            for (var c = 0; c < numCols; c++) { cells[row - 1 + r][col - 1 + c] = ''; formulas[row - 1 + r][col - 1 + c] = ''; }
          }
          return range;
        },
        setNote: function () { return range; },
        setNumberFormat: function () { return range; },
        setFontWeight: function () { return range; },
        setBackground: function () { return range; }
      };
      return range;
    }

    return sheet;
  }

  function makeBook(id, name) {
    var byName = new Map();
    var order = [];
    var book = {
      getId: function () { counts.metaReads++; return id; },
      getName: function () { return name; },
      getSheetByName: function (n) {
        counts.sheetLookups++;
        note('getSheetByName', n);
        return byName.get(String(n)) || null;
      },
      getSheets: function () { return order.slice(); },
      insertSheet: function (n) { return addSheet(n); },
      addSheet: function (n) { return addSheet(n); },
      __addSheet: function (n) { return addSheet(n); },
      __sheetNames: function () { return order.map(function (s) { return s.getName(); }); }
    };
    function addSheet(n) {
      var s = makeSheet(book, String(n), order.length + 1);
      byName.set(String(n), s);
      order.push(s);
      return s;
    }
    return book;
  }

  function ensureBook(id) {
    if (!books.has(String(id))) books.set(String(id), makeBook(String(id), String(id)));
    return books.get(String(id));
  }

  function sheetForRange(dbId, a1) {
    var book = ensureBook(dbId);
    var parsed = stubParseA1_(a1, 1);
    var sheet = parsed.sheetName === null ? null : book.getSheetByName(parsed.sheetName);
    if (!sheet) throw new Error('stub: batch range names no known sheet: ' + a1);
    return { book: book, sheet: sheet, parsed: parsed };
  }

  function valuesForA1(dbId, a1) {
    var hit = sheetForRange(dbId, a1);
    var lastRow = hit.sheet.getLastRow();
    var p = hit.parsed;
    var numRows = p.numRows === 1 && !/\d/.test(String(a1).split('!').pop() || '') ? Math.max(1, lastRow) : p.numRows;
    var r = hit.sheet.getRange(p.row, p.col, numRows, p.numCols);
    return { range: stubQuote_(hit.sheet.getName()) + '!' + r.getA1Notation(), values: r.getValues() };
  }

  function stubQuote_(n) { return "'" + String(n).replace(/'/g, "''") + "'"; }

  var Sheets = {
    Spreadsheets: {
      get: function (dbId) {
        counts.sheetsApiCalls++;
        var book = ensureBook(dbId);
        return {
          spreadsheetId: String(dbId),
          properties: { title: book.getName() },
          sheets: book.getSheets().map(function (s) {
            return { properties: { sheetId: s.getSheetId(), title: s.getName() } };
          })
        };
      },
      Values: {
        get: function (dbId, a1) {
          counts.sheetsApiCalls++;
          var out = valuesForA1(dbId, a1);
          return { spreadsheetId: String(dbId), range: out.range, majorDimension: 'ROWS', values: out.values };
        },
        batchGet: function (req, dbId) {
          counts.sheetsApiCalls++;
          var ranges = (req && req.ranges) || [];
          return {
            spreadsheetId: String(dbId),
            valueRanges: ranges.map(function (a1) {
              var out = valuesForA1(dbId, a1);
              return { range: out.range, majorDimension: 'ROWS', values: out.values };
            })
          };
        },
        batchUpdate: function (req, dbId) {
          counts.sheetsApiCalls++;
          var data = (req && req.data) || [];
          var updatedCells = 0;
          data.forEach(function (entry) {
            var hit = sheetForRange(dbId, entry.range);
            var values = entry.values || [];
            var p = hit.parsed;
            hit.sheet.getRange(p.row, p.col, values.length || 1, (values[0] || []).length || 1).setValues(values);
            updatedCells += values.reduce(function (n, r) { return n + (r || []).length; }, 0);
          });
          return { spreadsheetId: String(dbId), totalUpdatedCells: updatedCells, responses: [] };
        },
        append: function (req, dbId, a1) {
          counts.sheetsApiCalls++;
          var hit = sheetForRange(dbId, a1);
          hit.sheet.appendRow(((req && req.values) || [[]])[0]);
          return { spreadsheetId: String(dbId), updates: {} };
        },
        update: function (req, dbId, a1) {
          counts.sheetsApiCalls++;
          var hit = sheetForRange(dbId, a1);
          var p = hit.parsed;
          hit.sheet.getRange(p.row, p.col, (req.values || [[]]).length, (req.values[0] || []).length).setValues(req.values);
          return { spreadsheetId: String(dbId) };
        }
      },
      batchUpdate: function (req, dbId) {
        counts.sheetsApiCalls++;
        var book = ensureBook(dbId);
        var requests = (req && req.requests) || [];
        requests.forEach(function (r) {
          if (r.deleteDimension) {
            var range = r.deleteDimension.range || {};
            var target = null;
            book.getSheets().forEach(function (s) { if (s.getSheetId() === range.sheetId) target = s; });
            if (!target) throw new Error('stub: deleteDimension references an unknown sheetId');
            target.deleteRows(range.startIndex + 1, range.endIndex - range.startIndex);
            return;
          }
          throw new Error('stub: Sheets.Spreadsheets.batchUpdate request not implemented: ' + Object.keys(r).join(','));
        });
        return { spreadsheetId: String(dbId), replies: [] };
      }
    }
  };

  var SpreadsheetApp = {
    openById: function (id) { counts.metaReads++; return ensureBook(id); },
    getActiveSpreadsheet: function () {
      if (books.size === 1) return books.values().next().value;
      throw new Error('stub: getActiveSpreadsheet is ambiguous (no book or several)');
    },
    flush: function () {}
  };

  return {
    createSpreadsheet: function (id, sheetNames) {
      var book = ensureBook(id);
      (sheetNames || []).forEach(function (n) { book.addSheet(n); });
      return book;
    },
    openById: function (id) { return ensureBook(id); },
    getActiveSpreadsheet: SpreadsheetApp.getActiveSpreadsheet,
    SpreadsheetApp: SpreadsheetApp,
    Sheets: Sheets,
    stats: function () { return Object.assign({}, counts, { operations: operations.slice() }); },
    resetStats: function () {
      Object.keys(counts).forEach(function (k) { counts[k] = 0; });
      operations = [];
    },
    operations: function () { return operations.slice(); },
    parseA1: stubParseA1_,
    epochUtc: function () { return VF_STUB_EPOCH_UTC; }
  };
}

module.exports = { createWorkbookStub: createWorkbookStub, parseA1: stubParseA1_ };
