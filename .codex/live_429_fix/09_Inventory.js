/**
 * 09_Inventory.js — Phase 0b, step 3. READ-ONLY spreadsheet & formula inventory.
 *
 * Nothing here runs automatically and nothing here writes to a business sheet.
 * The only write is one report tab (ERP_Perf_Inventory) in the AUTH spreadsheet,
 * and only when you ask for it.
 *
 * Run `inventorySpreadsheets_()` from the Apps Script editor. It reports, per sheet:
 * rows, columns, cell count, formula-cell count, and every distinct formula
 * pattern with a count — flagging whole-column ranges, volatile functions,
 * ARRAYFORMULA, QUERY and IMPORTRANGE.
 *
 * PHASE 4 CANNOT BE SCOPED WITHOUT THIS OUTPUT. Phase 4 changes formulas; the
 * inventory is what separates script-written formulas (regenerable from code)
 * from hand-authored ones (no source of truth but the sheet itself).
 */

/** Functions that recalculate on every edit anywhere in the file. */
var VOLATILE_FUNCTIONS = ['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'INDIRECT', 'OFFSET'];

/**
 * Full inventory across the AUTH spreadsheet and every company spreadsheet.
 *
 * @param {Object} opts optional { writeReport: true } to also write the
 *        ERP_Perf_Inventory tab in the AUTH spreadsheet.
 * @return {Object} the report object (also logged as JSON)
 */
function inventorySpreadsheets_(opts) {
  opts = opts || {};
  if (systemStorageTarget_().backend === 'firestore') return inventoryFirestoreCollections_(opts);
  var targets = buildDbConfig_();   // { AUTH: {id}, <Company>: {id}, ... }
  var report = { generatedAt: new Date().toISOString(), spreadsheets: [], totals: {
    sheets: 0, rows: 0, cells: 0, formulaCells: 0,
    wholeColumnFormulas: 0, volatileFormulas: 0, arrayFormulas: 0, queryFormulas: 0, importrangeFormulas: 0
  } };

  Object.keys(targets).forEach(function (dbName) {
    var entry = { name: dbName, id: targets[dbName].id, sheets: [], error: '' };
    try {
      var ss = SpreadsheetApp.openById(targets[dbName].id);
      ss.getSheets().forEach(function (sh) {
        entry.sheets.push(inventorySheet_(sh, report.totals));
        report.totals.sheets++;
      });
    } catch (e) {
      entry.error = e.message;
    }
    report.spreadsheets.push(entry);
  });

  report.topFormulaSheets = collectTopFormulaSheets_(report, 25);
  report.patterns = collectPatterns_(report, 60);

  try { Logger.log(JSON.stringify(report, null, 2)); } catch (e) {}
  if (opts.writeReport) inventoryWriteReport_(report);
  return report;
}

function inventoryFirestoreCollections_(opts) {
  var c = systemStorageTarget_(), collections = systemTableNames_().map(function (name) { return { collection: name, backend: 'firestore', query: 'repository queryAll with cursor pagination', formulas: 'not applicable' }; });
  var report = { generatedAt: new Date().toISOString(), backend: 'firestore', projectId: c.projectId, databaseId: c.databaseId, collections: collections, note: 'Firestore has no spreadsheet formulas; company spreadsheet inventory remains available through inventorySpreadsheets_ in a company-only staging project.' };
  try { Logger.log(JSON.stringify(report, null, 2)); } catch (e) {}
  return report;
}

/** Inventories a single sheet. Read-only. */
function inventorySheet_(sh, totals) {
  var name = sh.getName();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var out = {
    sheet: name,
    rows: lastRow,
    cols: lastCol,
    cells: lastRow * lastCol,
    maxRows: sh.getMaxRows(),
    maxCols: sh.getMaxColumns(),
    formulaCells: 0,
    flags: { wholeColumn: 0, volatile: 0, arrayFormula: 0, query: 0, importrange: 0 },
    patterns: {}
  };
  totals.rows += lastRow;
  totals.cells += out.cells;
  if (lastRow < 1 || lastCol < 1) return out;

  var formulas;
  try {
    formulas = sh.getRange(1, 1, lastRow, lastCol).getFormulas();
  } catch (e) {
    out.error = 'could not read formulas: ' + e.message;
    return out;
  }

  for (var r = 0; r < formulas.length; r++) {
    for (var c = 0; c < formulas[r].length; c++) {
      var f = formulas[r][c];
      if (!f) continue;
      out.formulaCells++;
      totals.formulaCells++;
      var upper = f.toUpperCase();

      // A1-style whole-column reference: A:A, $A:$I, Sheet!A:C — a row number
      // on neither side. This is the O(rows^2) pattern F-06 is about.
      if (/(^|[^A-Z0-9_$!])\$?[A-Z]{1,3}:\$?[A-Z]{1,3}([^A-Z0-9_(]|$)/.test(upper)) {
        out.flags.wholeColumn++; totals.wholeColumnFormulas++;
      }
      for (var v = 0; v < VOLATILE_FUNCTIONS.length; v++) {
        if (upper.indexOf(VOLATILE_FUNCTIONS[v] + '(') !== -1) {
          out.flags.volatile++; totals.volatileFormulas++;
          break;
        }
      }
      if (upper.indexOf('ARRAYFORMULA(') !== -1) { out.flags.arrayFormula++; totals.arrayFormulas++; }
      if (upper.indexOf('QUERY(') !== -1) { out.flags.query++; totals.queryFormulas++; }
      if (upper.indexOf('IMPORTRANGE(') !== -1) { out.flags.importrange++; totals.importrangeFormulas++; }

      var key = normalizeFormula_(f);
      out.patterns[key] = (out.patterns[key] || 0) + 1;
    }
  }
  return out;
}

/**
 * Collapses a formula to a comparable shape: row numbers become #, so
 * =VLOOKUP($A2,...) and =VLOOKUP($A1873,...) are recognised as one pattern.
 * Absolute row anchors are preserved as $# so a truly fixed reference stays
 * distinguishable from a relative one.
 */
function normalizeFormula_(f) {
  var s = String(f);
  s = s.replace(/(\$?[A-Za-z]{1,3})\$([0-9]+)/g, '$1$#');
  s = s.replace(/(\$?[A-Za-z]{1,3})([0-9]+)/g, '$1#');
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > 400 ? s.slice(0, 400) + '…' : s;
}

/** The sheets carrying the most formula cells — where recalculation cost lives. */
function collectTopFormulaSheets_(report, n) {
  var all = [];
  report.spreadsheets.forEach(function (ssEntry) {
    ssEntry.sheets.forEach(function (s) {
      if (s.formulaCells > 0) {
        all.push({
          spreadsheet: ssEntry.name,
          sheet: s.sheet,
          rows: s.rows,
          formulaCells: s.formulaCells,
          wholeColumn: s.flags.wholeColumn,
          volatile: s.flags.volatile,
          arrayFormula: s.flags.arrayFormula,
          query: s.flags.query,
          importrange: s.flags.importrange
        });
      }
    });
  });
  all.sort(function (a, b) { return b.formulaCells - a.formulaCells; });
  return all.slice(0, n || 25);
}

/** Distinct formula patterns across everything, most frequent first. */
function collectPatterns_(report, n) {
  var agg = {};
  report.spreadsheets.forEach(function (ssEntry) {
    ssEntry.sheets.forEach(function (s) {
      Object.keys(s.patterns || {}).forEach(function (p) {
        if (!agg[p]) agg[p] = { pattern: p, count: 0, sheets: [] };
        agg[p].count += s.patterns[p];
        if (agg[p].sheets.length < 6) agg[p].sheets.push(ssEntry.name + '!' + s.sheet);
      });
    });
  });
  var list = Object.keys(agg).map(function (k) { return agg[k]; });
  list.sort(function (a, b) { return b.count - a.count; });
  return list.slice(0, n || 60);
}

/**
 * Writes the report into an ERP_Perf_Inventory tab of the AUTH spreadsheet.
 * Recreates the tab each run. This is a diagnostic tab, not a business table —
 * no business sheet is touched.
 */
function inventoryWriteReport_(report) {
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var old = ss.getSheetByName('ERP_Perf_Inventory');
  if (old) ss.deleteSheet(old);
  noteMutation_();
  var sh = ss.insertSheet('ERP_Perf_Inventory');
  noteMutation_();

  var rows = [['SECTION', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']];
  rows.push(['generated', report.generatedAt, '', '', '', '', '', '', '']);
  rows.push(['totals', 'sheets', report.totals.sheets, 'rows', report.totals.rows,
             'cells', report.totals.cells, 'formulaCells', report.totals.formulaCells]);
  rows.push(['totals2', 'wholeColumn', report.totals.wholeColumnFormulas, 'volatile', report.totals.volatileFormulas,
             'arrayFormula', report.totals.arrayFormulas, 'query/importrange',
             report.totals.queryFormulas + '/' + report.totals.importrangeFormulas]);
  rows.push(['', '', '', '', '', '', '', '', '']);

  rows.push(['SHEETS', 'spreadsheet', 'sheet', 'rows', 'cols', 'cells', 'formulaCells', 'wholeColumn', 'volatile']);
  report.spreadsheets.forEach(function (ssEntry) {
    if (ssEntry.error) { rows.push(['sheet', ssEntry.name, 'ERROR', ssEntry.error, '', '', '', '', '']); return; }
    ssEntry.sheets.forEach(function (s) {
      rows.push(['sheet', ssEntry.name, s.sheet, s.rows, s.cols, s.cells, s.formulaCells, s.flags.wholeColumn, s.flags.volatile]);
    });
  });
  rows.push(['', '', '', '', '', '', '', '', '']);

  rows.push(['PATTERNS', 'count', 'pattern', 'seen in', '', '', '', '', '']);
  report.patterns.forEach(function (p) {
    rows.push(['pattern', p.count, p.pattern, p.sheets.join(', '), '', '', '', '', '']);
  });

  sh.getRange(1, 1, rows.length, 9).setValues(rows);
  noteMutation_();
  sh.setFrozenRows(1);
  return sh.getName();
}

/**
 * Quick standalone check for the one thing a Drive copy does NOT carry over.
 * Run before trusting a staging copy.
 *
 * @return {Array} every IMPORTRANGE formula found, with its location
 */
function inventoryFindImportranges_() {
  var found = [];
  var targets = buildDbConfig_();
  Object.keys(targets).forEach(function (dbName) {
    try {
      SpreadsheetApp.openById(targets[dbName].id).getSheets().forEach(function (sh) {
        var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
        if (lastRow < 1 || lastCol < 1) return;
        var fs = sh.getRange(1, 1, lastRow, lastCol).getFormulas();
        for (var r = 0; r < fs.length; r++) {
          for (var c = 0; c < fs[r].length; c++) {
            if (fs[r][c] && fs[r][c].toUpperCase().indexOf('IMPORTRANGE(') !== -1) {
              found.push({ db: dbName, sheet: sh.getName(), cell: sh.getRange(r + 1, c + 1).getA1Notation(), formula: fs[r][c] });
            }
          }
        }
      });
    } catch (e) { found.push({ db: dbName, error: e.message }); }
  });
  try { Logger.log(JSON.stringify(found, null, 2)); } catch (e) {}
  return found;
}
