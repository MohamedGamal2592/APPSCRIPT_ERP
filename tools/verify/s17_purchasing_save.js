/**
 * S17 — the purchasing save, and the batched delete it depends on.
 *
 * Two things are proved here, both offline, both against the REAL code:
 *
 *  1. deleteRowsByCriteria_ is shared by all three companies, and it was
 *     changed from one deleteRow() per row to one deleteRows(start, n) per
 *     CONTIGUOUS RUN. That is a pure round-trip optimisation and must be
 *     behaviour-identical, so it is tested DIFFERENTIALLY: the old algorithm is
 *     reimplemented here and both are run against the same randomised sheets.
 *     The resulting grids and the returned counts must match exactly.
 *
 *  2. saveValleyPurchasingCosting_ writes its lines in ONE setValues instead of
 *     N addRecord_ calls. The row values, the ids and the ordering must be what
 *     the per-row path produced, and the number of Sheets round trips must stop
 *     growing with the line count.
 *
 * Nothing here touches a spreadsheet, a Google service or the network.
 *
 * Run: node tools/verify/s17_purchasing_save.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

/* ══ 1. deleteRowsByCriteria_, differentially ═══════════════════════════ */
console.log('\n1 — deleteRowsByCriteria_: batched runs remove exactly the same rows\n');

/* The implementation as it stood before the change, to compare against. */
function deleteOneAtATime(grid, critIdx, value) {
  let deleted = 0;
  for (let i = grid.length - 1; i >= 1; i--) {
    if (String(grid[i][critIdx]).trim() === String(value).trim()) {
      grid.splice(i, 1);
      deleted++;
    }
  }
  return deleted;
}

function makeDeleteSandbox() {
  const sb = {
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    SpreadsheetApp: { openById: () => { throw new Error('no ss'); } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { getUuid: () => 'u', sleep: () => {} },
    Session: { getScriptTimeZone: () => 'UTC', getActiveUser: () => ({ getEmail: () => '' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, getAll: () => ({}), putAll: () => {}, removeAll: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === 'SYSTEM_STORAGE_BACKEND' ? 'sheets' : null, setProperty: () => {}, deleteProperty: () => {} }) },
    Logger: { log: () => {} },
    ScriptApp: { getProjectTriggers: () => [] }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  ['Code.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  return sb;
}

const dsb = makeDeleteSandbox();

/** A sheet stub supporting exactly what deleteRowsByCriteria_ uses. */
function fakeSheetFor(grid, calls) {
  return {
    getParent: () => ({ getId: () => 'ss' }),
    getSheetId: () => 'sheet-' + Math.random(),
    getLastColumn: () => grid[0].length,
    getDataRange: () => ({ getValues: () => grid.map(r => r.slice()) }),
    /* A real range reader: maxIdOf_ asks for one COLUMN over many rows, so a
       stub that always returns a single row would silently read nothing. */
    getRange: (row, col, nRows, nCols) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < (nRows || 1); r++) {
          const src = grid[row - 1 + r] || [];
          out.push(src.slice(col - 1, col - 1 + (nCols || grid[0].length)));
        }
        return out;
      }
    }),
    deleteRow: (n) => { calls.deleteRow++; grid.splice(n - 1, 1); },
    deleteRows: (n, howMany) => { calls.deleteRows++; grid.splice(n - 1, howMany); }
  };
}

/* Deterministic pseudo-random, so a failure is reproducible. */
let seed = 20260907;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

const LAYOUTS = [
  { name: 'one contiguous block in the middle', rows: 40, mk: i => (i >= 10 && i < 25) ? 'X' : 'other' },
  { name: 'the whole sheet matches', rows: 25, mk: () => 'X' },
  { name: 'nothing matches', rows: 25, mk: () => 'other' },
  { name: 'every other row', rows: 30, mk: i => (i % 2 === 0) ? 'X' : 'other' },
  { name: 'first row only', rows: 20, mk: i => i === 0 ? 'X' : 'other' },
  { name: 'last row only', rows: 20, mk: i => i === 19 ? 'X' : 'other' },
  { name: 'first and last', rows: 20, mk: i => (i === 0 || i === 19) ? 'X' : 'other' },
  { name: 'two separate blocks', rows: 40, mk: i => ((i >= 3 && i < 8) || (i >= 30 && i < 36)) ? 'X' : 'other' },
  { name: 'single row sheet, matching', rows: 1, mk: () => 'X' },
  { name: 'empty sheet (headers only)', rows: 0, mk: () => 'X' },
  { name: 'values needing trim', rows: 20, mk: i => (i % 3 === 0) ? '  X  ' : 'other' }
];

LAYOUTS.forEach(function (L) {
  const headers = ['id', 'code', 'note'];
  const build = () => {
    const g = [headers.slice()];
    for (let i = 0; i < L.rows; i++) g.push([i + 1, L.mk(i), 'n' + i]);
    return g;
  };
  const gOld = build();
  const gNew = build();
  const nOld = deleteOneAtATime(gOld, 1, 'X');
  const calls = { deleteRow: 0, deleteRows: 0 };
  const nNew = dsb.deleteRowsByCriteria_(fakeSheetFor(gNew, calls), 'code', 'X');
  check(nOld === nNew && JSON.stringify(gOld) === JSON.stringify(gNew),
    L.name + ' — same rows removed, same count (' + nNew + ')',
    'old=' + nOld + ' new=' + nNew + '\n        old grid: ' + JSON.stringify(gOld.map(r => r[0])) +
    '\n        new grid: ' + JSON.stringify(gNew.map(r => r[0])));
  check(calls.deleteRow === 0, '  and it used deleteRows(), never one-at-a-time deleteRow()',
    'deleteRow calls: ' + calls.deleteRow);
});

/* 200 randomised layouts, because the interesting bugs in run-grouping are the
   ones a hand-written case does not think of. */
{
  let mismatches = 0;
  let worstCalls = 0;
  for (let t = 0; t < 200; t++) {
    const n = 1 + Math.floor(rnd() * 60);
    const p = rnd();
    const headers = ['id', 'code'];
    const build = () => {
      const g = [headers.slice()];
      for (let i = 0; i < n; i++) g.push([i + 1, rnd() < p ? 'X' : 'o']);
      return g;
    };
    const a = build();
    const b = JSON.parse(JSON.stringify(a));
    const nOld = deleteOneAtATime(a, 1, 'X');
    const calls = { deleteRow: 0, deleteRows: 0 };
    const nNew = dsb.deleteRowsByCriteria_(fakeSheetFor(b, calls), 'code', 'X');
    if (nOld !== nNew || JSON.stringify(a) !== JSON.stringify(b)) mismatches++;
    if (calls.deleteRows > worstCalls) worstCalls = calls.deleteRows;
    if (calls.deleteRow !== 0) mismatches++;
  }
  check(mismatches === 0, '200 randomised layouts agree with the one-at-a-time implementation',
    mismatches + ' mismatch(es)');
  console.log('        (worst case still only ' + worstCalls + ' deleteRows() calls)');
}

/* A missing criteria column is still a silent 0, as before. */
{
  const g = [['id', 'code'], [1, 'X']];
  const calls = { deleteRow: 0, deleteRows: 0 };
  check(dsb.deleteRowsByCriteria_(fakeSheetFor(g, calls), 'nope', 'X') === 0,
    'a missing criteria column still returns 0 and deletes nothing');
  check(g.length === 2, '  the sheet is untouched');
}

/* ══ 2. the purchasing save ═════════════════════════════════════════════ */
console.log('\n2 — saveValleyPurchasingCosting_: one batched write, not one per line\n');

const LINE_HEADERS = ['unique_id', 'id', 'movement_code', 'lot_identification', 'code', 'movement_place',
  'vendor', 'product', 'product_category', 'receipt_date', 'qty', 'unit_price', 'other_cost', 'total_cost',
  'movement_type', 'sales_qty', 'sales_value', 'sales_value_amount', 'unit_cost', 'invoice_date',
  'registration_number', 'Analysis certificate, if available', 'Agricultural Release License', 'Release photo',
  'Registration image', 'Production date', 'Expiry date', 'user', 'currency', 'exchange_rate',
  'cost_currency', 'Related valley_product_technicals', 'purchase_unit_cost'];
const HDR_HEADERS = ['id', 'Code', 'tax_system', 'Reciept Date', 'Items', 'Type', 'Shipping Type',
  'If shipping via CIF, enter the insurance value.', 'CIF insurance rate', 'Value', 'Currency', 'Exchange rate',
  'Value Based on Invoice', 'Importation Re-Price', 'Tax Declared Value', 'Administrative Expenses',
  'Customs Expenses', 'Unloading expenses', 'bank commission', 'Customs clearance and port receipts',
  'Additional fees', 'Clearance Expenses', 'Other Expenses', 'Purchase Tax', 'Income Tax',
  'Internal cost adjustment', 'Total costs', 'Sales Value', 'Tax type', 'sales tax amount',
  'Minimum differences', 'month', 'Year', 'Supplier Name', 'Approved this month', 'Associated bank',
  'user', 'approval_status', 'approval', 'approval_time', 'quality_approval_status', 'quality_approval',
  'quality_approval_time', 'Related valley_product_purchasings', 'code_identification', 'user_name'];
const HIST_HEADERS = ['id', 'sheet_name', 'record_uid', 'record_id', 'action', 'column_name',
  'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at'];

function runSave(opts) {
  opts = opts || {};
  const nLines = opts.nLines === undefined ? 10 : opts.nLines;
  const lineRows = opts.lineRows === undefined ? 5000 : opts.lineRows;
  const kExisting = opts.kExisting === undefined ? nLines : opts.kExisting;

  const C = { getValues: 0, cells: 0, appendRow: 0, deleteRow: 0, deleteRows: 0, setValue: 0, setValues: 0, locks: 0 };
  const written = { lines: null, header: null };

  function mk(name, headers, dataRows, codeFor) {
    const grid = [headers.slice()];
    for (let i = 0; i < dataRows; i++) {
      const r = new Array(headers.length).fill('');
      const idIdx = headers.indexOf('id');
      if (idIdx !== -1) r[idIdx] = i + 1;
      if (codeFor) r[headers.indexOf(codeFor)] = 'OTHER-' + i;
      grid.push(r);
    }
    return {
      __name: name,
      getName: () => name,
      getParent: () => ({ getId: () => 'ss' }),
      getSheetId: () => name,
      getLastRow: () => grid.length,
      getLastColumn: () => headers.length,
      getDataRange: () => ({ getValues: () => { C.getValues++; C.cells += grid.length * headers.length; return grid.map(r => r.slice()); } }),
      getRange: (row, col, nRows, nCols) => ({
        getValues: () => {
          C.getValues++; C.cells += (nRows || 1) * (nCols || headers.length);
          const out = [];
          for (let r = 0; r < (nRows || 1); r++) {
            const src = grid[row - 1 + r] || [];
            out.push(src.slice(col - 1, col - 1 + (nCols || headers.length)));
          }
          return out;
        },
        /* patchRowByCriteria_ reads one row of formulas before writing, so a
           formula-preserving patch is one more counted round trip. The stub
           grid holds no formulas; real getFormulas returns '' per value cell. */
        getFormulas: () => {
          C.getValues++; C.cells += (nCols || headers.length);
          return [new Array(nCols || headers.length).fill('')];
        },
        setValue: () => { C.setValue++; },
        setValues: (v) => {
          C.setValues++;
          if (name === 'valley_product_purchasing' && v && v.length) written.lines = v.map(r => r.slice());
          (v || []).forEach(r => grid.push(r.slice()));
        },
        setNumberFormat: () => {}, sort: () => {}
      }),
      appendRow: (r) => {
        C.appendRow++;
        if (name === 'valley_purchasing_costing') {
          const o = {};
          headers.forEach((h, i) => { o[h] = r[i]; });
          written.header = o;
        }
        grid.push(r.slice());
      },
      deleteRow: (n) => { C.deleteRow++; grid.splice(n - 1, 1); },
      deleteRows: (n, h) => { C.deleteRows++; grid.splice(n - 1, h); },
      setFrozenRows: () => {},
      __grid: grid, __headers: headers
    };
  }

  const SH = {
    'valley_product_purchasing': mk('valley_product_purchasing', LINE_HEADERS, lineRows, 'code'),
    'valley_purchasing_costing': mk('valley_purchasing_costing', HDR_HEADERS, 60, 'Code'),
    'ID_Counter': mk('ID_Counter', ['sheet_name', 'next_id'], 0),
    'ERP_Record_History': mk('ERP_Record_History', HIST_HEADERS, 20)
  };
  SH['ID_Counter'].appendRow(['valley_product_purchasing', lineRows + 1]);
  SH['ID_Counter'].appendRow(['valley_purchasing_costing', 61]);
  SH['ID_Counter'].appendRow(['ERP_Record_History', 21]);
  /* the document being edited, and its existing lines */
  (function () {
    const r = new Array(HDR_HEADERS.length).fill('');
    r[HDR_HEADERS.indexOf('Code')] = 'PUR-T'; r[HDR_HEADERS.indexOf('id')] = 61;
    SH['valley_purchasing_costing'].appendRow(r);
    for (let i = 0; i < kExisting; i++) {
      const l = new Array(LINE_HEADERS.length).fill('');
      l[LINE_HEADERS.indexOf('code')] = 'PUR-T'; l[LINE_HEADERS.indexOf('id')] = lineRows + i + 1;
      SH['valley_product_purchasing'].appendRow(l);
    }
  })();
  C.appendRow = 0; C.getValues = 0; C.cells = 0; C.setValues = 0;
  written.header = null;   /* discard what the seeding appended */

  const sb = {
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => SH[n] || null, insertSheet: () => { throw new Error('insertSheet'); } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { C.locks++; }, tryLock: () => { C.locks++; return true; }, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => 'uuid-0000',
      formatDate: (d) => { const p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); },
      sleep: () => {}
    },
    Session: { getScriptTimeZone: () => 'Africa/Cairo', getActiveUser: () => ({ getEmail: () => '' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, getAll: () => ({}), putAll: () => {}, removeAll: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === 'SYSTEM_STORAGE_BACKEND' ? 'sheets' : null, setProperty: () => {}, deleteProperty: () => {} }) },
    Logger: { log: () => {} }, ScriptApp: { getProjectTriggers: () => [] }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  ['Code.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  vm.runInContext(
    "getSpreadsheet_ = function () { return SpreadsheetApp.openById('x'); };" +
    "getSheet_ = function (n) { var s = SpreadsheetApp.openById('x').getSheetByName(n);" +
    " if (!s) throw new Error('no sheet ' + n); return s; };", sb);

  const START = SRC.indexOf("  var PURCHASING_COSTING_SHEET = 'valley_purchasing_costing';");
  const END = SRC.indexOf("  ValleyFoods.register('get_valley_purchasing_costing'", START);
  if (START === -1 || END <= START) throw new Error('purchasing block not located');

  const env = {
    settingsEnsureSheet_: function () {},
    uid16_: () => 'ffffffff00000001',
    /* S25 §5.1: the save flushes before it returns so the balance the client
       reads back includes this write. Counted, not performed. */
    vfFlush_: () => { C.flushes = (C.flushes || 0) + 1; },
    vfCanSeeCost_: () => true,
    vfRefsCached_: (db, k, fn) => fn(),
    vfPage_: (rows) => ({ rows: rows, total: rows.length }),
    vfBoundRows_: (rows) => rows,
    vfStripCostAll_: (l) => l,
    VF_COST_KEYS: { purchasing: [], purchasing_line: [] },
    FIN_PARTIES_SHEET: 'p', FIN_PRODUCTS_SHEET: 'q'
  };
  sb.__env = env;
  const H = vm.runInContext('(function (env) { with (env) {\n' + SRC.slice(START, END) +
    '\n return { save: saveValleyPurchasingCosting_ }; } })', sb)(env);

  const header = {};
  HDR_HEADERS.forEach(c => { header[c] = ''; });
  header['Code'] = opts.create ? 'PUR-NEW' : 'PUR-T';
  header['Reciept Date'] = '2026-01-15';
  header['Type'] = 'تصنيع';
  header['Shipping Type'] = 'محلي';
  header['Supplier Name'] = 'SUP-9';
  header['Currency'] = 'EGP';
  header['Total costs'] = opts.headerTotal !== undefined ? opts.headerTotal : nLines * 100;
  if (opts.header) Object.keys(opts.header).forEach(k => { header[k] = opts.header[k]; });

  let lines = [];
  for (let i = 0; i < nLines; i++) {
    lines.push({ product: 'P' + i, qty: 2, unit_price: 50, total_cost: 100, other_cost: 0,
      unit_cost: 50, movement_type: '114100' });
  }
  if (opts.lines !== undefined) lines = opts.lines;

  let error = null, result = null;
  try {
    result = H.save({ header: header, originalCode: opts.create ? '' : 'PUR-T', lines: lines },
      { email: 'buyer@valley.test', name: 'Buyer' }, 'db');
  } catch (e) { error = e; }

  const roundTrips = C.getValues + C.appendRow + C.deleteRow + C.deleteRows + C.setValue + C.setValues;
  return { C: C, roundTrips: roundTrips, written: written.lines, header: written.header,
    result: result, error: error, SH: SH };
}

{
  const r = runSave({ nLines: 10, lineRows: 5000 });
  check(!r.error, 'a 10-line save succeeds', r.error && r.error.message);
  check(r.C.appendRow === 0, 'no line is appended one at a time', 'appendRow=' + r.C.appendRow);
  check(r.C.deleteRow === 0, 'and no line is deleted one at a time', 'deleteRow=' + r.C.deleteRow);
  check(!!r.written && r.written.length === 10, 'all 10 lines arrive in ONE setValues', r.written && r.written.length);

  const idIdx = LINE_HEADERS.indexOf('id');
  const ids = r.written.map(row => row[idIdx]);
  const sequential = ids.every((v, i) => i === 0 || v === ids[i - 1] + 1);
  check(sequential, 'ids are sequential, exactly as the per-row allocator produced them', ids.slice(0, 4).join(','));
  /* The document's own old lines are deleted before the ids are allocated, so
     the run resumes after the highest id still on the sheet — which is exactly
     what the per-row getNextIdUnderLock_ did, for the same reason. */
  check(ids[0] === 5001, '  and resume after the highest id still on the sheet', ids[0]);

  /* Field-by-field, against what the payload asked for. */
  const first = {};
  LINE_HEADERS.forEach((h, i) => { first[h] = r.written[0][i]; });
  check(first.code === 'PUR-T', 'code is written');
  check(first.product === 'P0', 'product is written');
  check(first.qty === 2 && first.unit_price === 50 && first.total_cost === 100, 'the numbers are written');
  check(first.unique_id === 'ffffffff00000001', 'unique_id is written');
  check(first.movement_place === 'محلي', 'movement_place is derived from the shipping type');
  check(first.receipt_date === '2026-01-15', 'receipt_date falls back to the header date');
  check(first.cost_currency === 100, 'cost_currency is unit_price * qty');
  check(first.user === 'buyer@valley.test', 'the user is stamped');

  /* The bug the batching exposed and fixed. */
  check(first['Production date'] === '2026-01-15',
    "'Production date' is written — addRecord_ lowercased the header to look it up, so this capitalised key never matched and the column was written BLANK on every save",
    JSON.stringify(first['Production date']));
  check(first['Expiry date'] === '2028-01-05',
    "'Expiry date' likewise, and it is the receipt date + 720 days",
    JSON.stringify(first['Expiry date']));
}

/* The whole point: round trips must stop growing with the line count. */
console.log('\n3 — the cost stops scaling with the document\n');
{
  const a = runSave({ nLines: 5, lineRows: 5000 });
  const b = runSave({ nLines: 50, lineRows: 5000 });
  const c = runSave({ nLines: 200, lineRows: 5000 });
  console.log('        5 lines: ' + a.roundTrips + ' round trips, ' + a.C.cells + ' cells');
  console.log('       50 lines: ' + b.roundTrips + ' round trips, ' + b.C.cells + ' cells');
  console.log('      200 lines: ' + c.roundTrips + ' round trips, ' + c.C.cells + ' cells');
  check(a.roundTrips === b.roundTrips && b.roundTrips === c.roundTrips,
    'the number of Sheets round trips is CONSTANT in the line count',
    a.roundTrips + ' / ' + b.roundTrips + ' / ' + c.roundTrips);
  check(c.roundTrips < 25, '  and it is a small constant', c.roundTrips);
  check(c.C.locks <= 3, 'the script lock is taken a couple of times, not once per line', c.C.locks);

  /* And it must not grow with the table either, beyond the one id read. */
  const small = runSave({ nLines: 20, lineRows: 1000 });
  const big = runSave({ nLines: 20, lineRows: 40000 });
  check(small.roundTrips === big.roundTrips,
    'and constant in the size of valley_product_purchasing too',
    small.roundTrips + ' vs ' + big.roundTrips);
}

/* The totals guard must refuse BEFORE anything is written. */
console.log('\n4 — a mismatched total is refused before any write\n');
{
  const r = runSave({ nLines: 10, headerTotal: 999 });
  check(!!r.error, 'a header total that disagrees with the lines throws');
  check(/لا يساوي إجمالي التكاليف/.test(r.error.message), '  with the Arabic message', r.error.message);
  check(r.written === null, '  and NO line was written');
  check(r.C.deleteRow === 0 && r.C.deleteRows === 0, '  and no existing line was deleted');
  check(r.C.setValue === 0, '  and the header row was not updated either');
}

/* ══ 5. maxIdOf_ — the id scan that runs INSIDE the global lock ═════════ */
console.log('\n5 — maxIdOf_: same answer as the whole-sheet scan, one column of data\n');
{
  /* The scan as it stood before: read the entire sheet, walk the id column. */
  function maxIdWholeSheet(grid, headers, idName) {
    const idIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(idName).toLowerCase());
    if (idIdx === -1) return 0;
    let max = 0;
    for (let i = 1; i < grid.length; i++) {
      const v = Number(grid[i][idIdx]);
      if (Number.isInteger(v) && v > max) max = v;
    }
    return max;
  }

  function sheetOver(grid, headers, counter) {
    return {
      getParent: () => ({ getId: () => 'ss' }),
      getSheetId: () => 'sh-' + Math.random(),
      getLastRow: () => grid.length,
      getLastColumn: () => headers.length,
      getDataRange: () => ({ getValues: () => { counter.cells += grid.length * headers.length; return grid.map(r => r.slice()); } }),
      getRange: (row, col, nRows, nCols) => ({
        getValues: () => {
          counter.cells += (nRows || 1) * (nCols || headers.length);
          const out = [];
          for (let r = 0; r < (nRows || 1); r++) {
            const src = grid[row - 1 + r] || [];
            out.push(src.slice(col - 1, col - 1 + (nCols || headers.length)));
          }
          return out;
        }
      })
    };
  }

  const CASES = [
    { name: 'ordinary ascending ids', hdr: ['id', 'a', 'b'], rows: 200, id: i => i + 1 },
    { name: 'ids with gaps', hdr: ['id', 'a'], rows: 100, id: i => (i + 1) * 7 },
    { name: 'ids out of order', hdr: ['id', 'a'], rows: 100, id: i => (i * 37) % 101 },
    { name: 'the id column is not the first', hdr: ['unique_id', 'code', 'id', 'x'], rows: 150, id: i => i + 5 },
    { name: 'blank ids mixed in', hdr: ['id', 'a'], rows: 80, id: i => (i % 3 === 0 ? '' : i + 1) },
    { name: 'non-integer ids ignored', hdr: ['id', 'a'], rows: 60, id: i => (i % 4 === 0 ? 'X' + i : i + 1) },
    { name: 'fractional ids ignored', hdr: ['id', 'a'], rows: 60, id: i => (i % 5 === 0 ? i + 0.5 : i + 1) },
    { name: 'header row only', hdr: ['id', 'a'], rows: 0, id: () => 0 },
    { name: 'a single data row', hdr: ['id', 'a'], rows: 1, id: () => 42 }
  ];

  CASES.forEach(function (C) {
    const grid = [C.hdr.slice()];
    for (let i = 0; i < C.rows; i++) {
      const r = new Array(C.hdr.length).fill('v');
      r[C.hdr.indexOf('id')] = C.id(i);
      grid.push(r);
    }
    const cOld = { cells: 0 }, cNew = { cells: 0 };
    const expected = maxIdWholeSheet(grid, C.hdr, 'id');
    cOld.cells = grid.length * C.hdr.length;
    const actual = dsb.maxIdOf_(sheetOver(grid, C.hdr, cNew), 'id');
    check(actual === expected, C.name + ' — same max id (' + expected + ')',
      'whole-sheet=' + expected + ' one-column=' + actual);
    if (C.rows > 0) {
      check(cNew.cells < cOld.cells, '  and it read less: ' + cNew.cells + ' cells vs ' + cOld.cells);
    }
  });

  /* A sheet with no id column at all must still be 0, not a crash. */
  const noId = [['code', 'name'], ['A', 'x']];
  check(dsb.maxIdOf_(sheetOver(noId, ['code', 'name'], { cells: 0 }), 'id') === 0,
    'a sheet with no id column returns 0');
  check(dsb.maxIdOf_(null, 'id') === 0, 'a missing sheet returns 0');

  /* The allocators must still hand out ids above whatever is on the sheet. */
  console.log('');
  const bigHdr = ['unique_id', 'id'].concat(new Array(31).fill(0).map((_, i) => 'c' + i));
  const bigGrid = [bigHdr.slice()];
  for (let i = 0; i < 5000; i++) {
    const r = new Array(bigHdr.length).fill('');
    r[1] = i + 1;
    bigGrid.push(r);
  }
  const cc = { cells: 0 };
  const mx = dsb.maxIdOf_(sheetOver(bigGrid, bigHdr, cc), 'id');
  check(mx === 5000, 'over a 5000-row x 33-col table the max is still 5000', mx);
  /* 5000 id cells plus one 33-cell header read, against 5001 x 33 = 165 033 for
     the whole sheet. getHeaders_ is cached per sheet in production, so the
     header read is paid once per request, not once per allocation. */
  check(cc.cells < 6000, '  reading ' + cc.cells + ' cells instead of ' + (5001 * 33) +
    ' — a ' + Math.round((5001 * 33) / cc.cells) + 'x reduction in what the global lock is held across',
    cc.cells);
}

/* ══ 6. deleteRowsWhereIn_ — one read for a SET of values ═══════════════ */
console.log('\n6 — deleteRowsWhereIn_: N values, ONE sheet read\n');
{
  function readsCounting(grid, calls) {
    const sh = fakeSheetFor(grid, calls);
    const inner = sh.getDataRange;
    sh.getDataRange = () => { calls.reads++; return inner(); };
    return sh;
  }
  const headers = ['id', 'uid'];
  const build = () => {
    const g = [headers.slice()];
    for (let i = 0; i < 60; i++) g.push([i + 1, 'U' + i]);
    return g;
  };

  /* Deleting 10 uids the old way = 10 full reads. */
  const targets = ['U3', 'U4', 'U5', 'U20', 'U21', 'U40', 'U41', 'U42', 'U43', 'U59'];
  const gLoop = build(), cLoop = { deleteRow: 0, deleteRows: 0, reads: 0 };
  const shLoop = readsCounting(gLoop, cLoop);
  let loopDeleted = 0;
  targets.forEach(t => { loopDeleted += dsb.deleteRowsByCriteria_(shLoop, 'uid', t); });

  const gSet = build(), cSet = { deleteRow: 0, deleteRows: 0, reads: 0 };
  const setDeleted = dsb.deleteRowsWhereIn_(readsCounting(gSet, cSet), 'uid', targets);

  check(loopDeleted === setDeleted && loopDeleted === targets.length,
    'the set form removes the same ' + targets.length + ' rows',
    loopDeleted + ' vs ' + setDeleted);
  check(JSON.stringify(gLoop) === JSON.stringify(gSet), '  leaving an identical sheet');
  check(cLoop.reads === targets.length && cSet.reads === 1,
    '  in ONE sheet read instead of ' + targets.length,
    cLoop.reads + ' -> ' + cSet.reads);
  check(cSet.deleteRows < cLoop.deleteRows,
    '  and fewer delete calls (' + cLoop.deleteRows + ' -> ' + cSet.deleteRows + ')');

  /* Edge cases. */
  const empty = { deleteRow: 0, deleteRows: 0, reads: 0 };
  check(dsb.deleteRowsWhereIn_(readsCounting(build(), empty), 'uid', []) === 0,
    'an empty value list deletes nothing');
  check(empty.reads === 0, '  and does not even read the sheet');
  check(dsb.deleteRowsWhereIn_(fakeSheetFor(build(), { deleteRow: 0, deleteRows: 0 }), 'uid', [null, undefined]) === 0,
    'null and undefined values are ignored');
  const dupG = build(), dupC = { deleteRow: 0, deleteRows: 0 };
  check(dsb.deleteRowsWhereIn_(fakeSheetFor(dupG, dupC), 'uid', ['U7', 'U7', 'U7']) === 1,
    'a repeated value still deletes its row once');
  check(dsb.deleteRowsWhereIn_(fakeSheetFor(build(), { deleteRow: 0, deleteRows: 0 }), 'nope', ['U1']) === 0,
    'a missing criteria column returns 0');
  const noneG = build();
  check(dsb.deleteRowsWhereIn_(fakeSheetFor(noneG, { deleteRow: 0, deleteRows: 0 }), 'uid', ['ZZZ']) === 0 &&
    noneG.length === 61, 'values that match nothing leave the sheet alone');
}

/* ══ 7. logHistoryMany_ — N record changes, ONE audit write ═════════════ */
console.log('\n7 — logHistoryMany_: same audit rows as N logHistory_ calls\n');
{
  function auditWorld() {
    const state = { hist: [], locks: 0, idReads: 0 };
    const HIST = ['id', 'sheet_name', 'record_uid', 'record_id', 'action', 'column_name',
      'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at'];
    const TGT = ['unique_id', 'id', 'emp_id', 'month', 'year', 'working_days', 'user', 'created_at'];

    function mk(name, headers, grid) {
      return {
        getName: () => name,
        getParent: () => ({ getId: () => 'ss' }),
        getSheetId: () => name,
        getLastRow: () => grid.length,
        getLastColumn: () => headers.length,
        getDataRange: () => ({ getValues: () => grid.map(r => r.slice()) }),
        getRange: (row, col, nRows, nCols) => ({
          getValues: () => {
            if (name === 'ERP_Record_History' && col === 2) state.idReads++;
            const out = [];
            for (let r = 0; r < (nRows || 1); r++) {
              const src = grid[row - 1 + r] || [];
              out.push(src.slice(col - 1, col - 1 + (nCols || headers.length)));
            }
            return out;
          },
          /* The stub store holds no formulas; real getFormulas returns ''
             per value cell. Needed wherever the real patch helper runs. */
          getFormulas: () => [new Array(nCols || headers.length).fill('')],
          setValue: () => {},
          setValues: (v) => {
            (v || []).forEach(r => {
              grid.push(r.slice());
              if (name === 'ERP_Record_History') {
                const o = {};
                headers.forEach((h, i) => { o[h] = r[i]; });
                state.hist.push(o);
              }
            });
          },
          setNumberFormat: () => {}
        }),
        appendRow: (r) => grid.push(r.slice()),
        deleteRow: () => {}, deleteRows: () => {}, setFrozenRows: () => {}
      };
    }

    const SH = {
      'ERP_Record_History': mk('ERP_Record_History', HIST, [HIST.slice()]),
      'valley_emp_salaries': mk('valley_emp_salaries', TGT, [TGT.slice()]),
      'ID_Counter': mk('ID_Counter', ['sheet_name', 'next_id'], [['sheet_name', 'next_id']])
    };

    const sb = {
      console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
      isNaN, parseInt, parseFloat,
      SpreadsheetApp: { openById: () => ({ getSheetByName: n => SH[n] || null, insertSheet: () => { throw new Error('x'); } }) },
      LockService: { getScriptLock: () => ({ waitLock: () => { state.locks++; }, tryLock: () => { state.locks++; return true; }, releaseLock: () => {} }) },
      Utilities: { getUuid: () => 'u', sleep: () => {}, formatDate: () => '' },
      Session: { getScriptTimeZone: () => 'UTC', getActiveUser: () => ({ getEmail: () => '' }) },
      CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, getAll: () => ({}), putAll: () => {}, removeAll: () => {} }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === 'SYSTEM_STORAGE_BACKEND' ? 'sheets' : null, setProperty: () => {}, deleteProperty: () => {} }) },
      Logger: { log: () => {} }, ScriptApp: { getProjectTriggers: () => [] }
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    ['Code.js'].forEach(f => {
      vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
    });
    vm.runInContext(
      "getSpreadsheet_ = function () { return SpreadsheetApp.openById('x'); };" +
      "getSheet_ = function (n) { var s = SpreadsheetApp.openById('x').getSheetByName(n);" +
      " if (!s) throw new Error('no sheet ' + n); return s; };", sb);
    return { sb, state };
  }

  const N = 25;
  const recs = [];
  for (let i = 0; i < N; i++) {
    recs.push({ emp_id: i + 1, month: 3, year: 2026, working_days: 30 });
  }

  /* the loop, as it was */
  const A = auditWorld();
  recs.forEach(function (r) {
    A.sb.logHistory_('db', 'valley_emp_salaries', 'create_x_' + r.emp_id, r.emp_id,
      'u@x.test', 'create', r, null);
  });

  /* the batch, as it is now */
  const B = auditWorld();
  B.sb.logHistoryMany_(recs.map(function (r) {
    return {
      dbId: 'db', sheetName: 'valley_emp_salaries',
      recordUid: 'create_x_' + r.emp_id, recordId: r.emp_id,
      user: 'u@x.test', action: 'create', newValues: r, oldValues: null
    };
  }));

  check(A.state.hist.length === B.state.hist.length,
    'the same number of audit rows (' + A.state.hist.length + ')',
    A.state.hist.length + ' vs ' + B.state.hist.length);
  check(JSON.stringify(A.state.hist.map(h => [h.sheet_name, h.record_uid, h.record_id, h.action, h.column_name, h.old_value, h.new_value, h.changed_by])) ===
        JSON.stringify(B.state.hist.map(h => [h.sheet_name, h.record_uid, h.record_id, h.action, h.column_name, h.old_value, h.new_value, h.changed_by])),
    '  carrying identical values, in the same order');
  check(JSON.stringify(A.state.hist.map(h => h.id)) === JSON.stringify(B.state.hist.map(h => h.id)),
    '  and identical ids');
  check(B.state.locks < A.state.locks,
    '  taking the global lock ' + B.state.locks + ' time(s) instead of ' + A.state.locks,
    A.state.locks + ' -> ' + B.state.locks);
  check(B.state.locks === 1, '  which is once', B.state.locks);

  /* nothing to say means nothing written, as before */
  const C = auditWorld();
  C.sb.logHistoryMany_([]);
  check(C.state.hist.length === 0 && C.state.locks === 0,
    'an empty batch writes nothing and takes no lock');
  const D = auditWorld();
  D.sb.logHistoryMany_([null, undefined]);
  check(D.state.hist.length === 0, 'null entries are ignored');

  /* an update with no real change is still silent */
  const E = auditWorld();
  const same = { emp_id: 5, month: 3, year: 2026, working_days: 30 };
  E.sb.logHistoryMany_([{
    dbId: 'db', sheetName: 'valley_emp_salaries', recordUid: 'u1', recordId: 5,
    user: 'u@x.test', action: 'update', newValues: same, oldValues: same
  }]);
  check(E.state.hist.length === 0, 'an update that changed nothing writes no audit row');
}

/* ══ 8. the purchasing rules, and the create-path data loss ═════════════ */
console.log('\n8 — mandatory fields, and a create that actually stores its data\n');
{
  const L = h => LINE_HEADERS.indexOf(h);

  /* -- the four refusals, each BEFORE anything is written -------------- */
  const cases = [
    { what: 'النوع missing', opts: { header: { 'Type': '' } }, msg: /النوع مطلوب/ },
    { what: 'نوع الشحن missing', opts: { header: { 'Shipping Type': '' } }, msg: /نوع الشحن مطلوب/ },
    { what: 'no lines at all', opts: { lines: [] }, msg: /صنف واحد على الأقل/ },
    {
      what: 'a line with no نوع الحركة',
      opts: { lines: [{ product: 'P0', qty: 2, unit_price: 50, total_cost: 100, movement_type: '' }] },
      msg: /نوع الحركة مطلوب/
    }
  ];
  cases.forEach(function (c) {
    const r = runSave(Object.assign({ nLines: 3, headerTotal: 100 }, c.opts));
    check(!!r.error && c.msg.test(r.error.message), c.what + ' is refused, in Arabic',
      r.error ? r.error.message : 'no error thrown');
    check(r.written === null && r.C.deleteRows === 0 && r.C.deleteRow === 0 && r.C.appendRow === 0,
      '  and nothing was written or deleted first');
  });

  /* the mismatch message names both figures */
  {
    const r = runSave({ nLines: 3, headerTotal: 999 });
    check(!!r.error && /لا يساوي إجمالي التكاليف/.test(r.error.message),
      'a line total that disagrees with the header is refused',
      r.error ? r.error.message : 'no error');
    check(/300\.00/.test(r.error.message) && /999\.00/.test(r.error.message),
      '  naming both figures', r.error.message);
  }

  /* -- vendor comes from the header ------------------------------------ */
  {
    const r = runSave({ nLines: 2, headerTotal: 200 });
    check(!r.error, 'a complete purchase saves', r.error && r.error.message);
    check(r.written[0][L('vendor')] === 'SUP-9',
      "every line's vendor is the document's supplier, not the blank the form sent",
      JSON.stringify(r.written[0][L('vendor')]));
    check(r.written[1][L('vendor')] === 'SUP-9', '  on every line');
    check(r.written[0][L('movement_type')] === '114100', 'movement_type is stored');
  }

  /* -- movement_place mirrors the AppSheet IFS ------------------------- */
  {
    [['CIF', 'مستورد'], ['FOB', 'مستورد'], ['C&F', 'مستورد'], ['محلي', 'محلي']].forEach(function (pair) {
      const r = runSave({ nLines: 1, headerTotal: 100, header: { 'Shipping Type': pair[0] } });
      check(!r.error && r.written[0][L('movement_place')] === pair[1],
        'shipping ' + pair[0] + ' -> movement_place ' + pair[1],
        r.error ? r.error.message : JSON.stringify(r.written && r.written[0][L('movement_place')]));
    });
  }

  /* -- the two sheet formulas ------------------------------------------ */
  {
    const r = runSave({ nLines: 3, headerTotal: 300, lineRows: 100, kExisting: 0 });
    check(!r.error, 'a three-line purchase saves', r.error && r.error.message);
    const mc = r.written.map(row => row[L('movement_code')]);
    const pc = r.written.map(row => row[L('product_category')]);
    check(mc.every(v => typeof v === 'string' && v.charAt(0) === '='),
      'movement_code is written as a FORMULA, not a value', JSON.stringify(mc[0]));
    check(pc.every(v => typeof v === 'string' && v.charAt(0) === '='),
      'product_category likewise', JSON.stringify(pc[0]));
    check(/valley_products!\$A:\$F/.test(mc[0]) && /TEXT\(/.test(mc[0]) && /DD\/MM\/YYYY/.test(mc[0]),
      '  movement_code keeps the sheet formula it had', mc[0]);
    check(/valley_products!A:N,14,0/.test(pc[0]) && /valley_categories!A:B,2,0/.test(pc[0]),
      '  product_category keeps its two-step lookup', pc[0]);

    /* each row must reference ITS OWN row number, not a fixed one */
    const rowNums = mc.map(v => { const m = /B(\d+)/.exec(v); return m ? Number(m[1]) : null; });
    check(rowNums.every(n => n !== null) &&
      rowNums[1] === rowNums[0] + 1 && rowNums[2] === rowNums[1] + 1,
      '  and each row references its own row number', JSON.stringify(rowNums));

    /* the letters must come from the sheet's own header order */
    const want = c => String.fromCharCode(65 + LINE_HEADERS.indexOf(c));
    check(mc[0].indexOf('vlookup(' + want('product') + rowNums[0]) !== -1,
      '  with column letters taken from the sheet header order', mc[0]);
  }

  /* -- the create path stores its data (32 of 46 columns were lost) ---- */
  {
    const r = runSave({ nLines: 2, headerTotal: 200, create: true });
    check(!r.error, 'creating a new purchase succeeds', r.error && r.error.message);
    check(!!r.header, '  and appends a costing row');
    const H2 = r.header || {};
    [['Code', 'PUR-NEW'], ['Type', 'تصنيع'], ['Shipping Type', 'محلي'],
     ['Supplier Name', 'SUP-9'], ['Reciept Date', '2026-01-15'], ['Currency', 'EGP']]
      .forEach(function (pair) {
        check(String(H2[pair[0]]) === String(pair[1]),
          "  '" + pair[0] + "' is stored (was written blank before)",
          JSON.stringify(H2[pair[0]]) + ' expected ' + JSON.stringify(pair[1]));
      });
    check(Number(H2['Total costs']) === 200, "  'Total costs' is stored", JSON.stringify(H2['Total costs']));
    check(String(H2['user']) === 'buyer@valley.test', '  and the lowercase columns still work');
  }
}

/* ══ 9. addRecord_ no longer drops capitalised columns ══════════════════ */
console.log('\n9 — addRecord_: a header that is not lowercase still gets its value\n');
{
  const HDRS = ['id', 'Code', 'Shipping Type', 'lowercase_col', 'Mixed Case', 'unique_id'];
  const grid = [HDRS.slice()];
  const counter = [['sheet_name', 'next_id']];
  let appended = null;

  function sheetOver(name, headers, g) {
    return {
      getName: () => name,
      getParent: () => ({ getId: () => 'ss' }),
      getSheetId: () => name,
      getLastRow: () => g.length,
      getLastColumn: () => headers.length,
      getDataRange: () => ({ getValues: () => g.map(r => r.slice()) }),
      getRange: (row, col, nRows, nCols) => ({
        getValues: () => {
          const out = [];
          for (let r = 0; r < (nRows || 1); r++) {
            const src = g[row - 1 + r] || [];
            out.push(src.slice(col - 1, col - 1 + (nCols || headers.length)));
          }
          return out;
        },
        /* The stub store holds no formulas; real getFormulas returns ''
           per value cell. Needed wherever the real patch helper runs. */
        getFormulas: () => [new Array(nCols || headers.length).fill('')],
        setValue: () => {}, setValues: (v) => { (v || []).forEach(r => g.push(r.slice())); }
      }),
      appendRow: (r) => {
        g.push(r.slice());
        if (name === 'T') { appended = {}; headers.forEach((h, i) => { appended[h] = r[i]; }); }
      },
      setFrozenRows: () => {}
    };
  }
  const SHEETS = { 'T': sheetOver('T', HDRS, grid), 'ID_Counter': sheetOver('ID_Counter', ['sheet_name', 'next_id'], counter) };

  const sb = {
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => SHEETS[n] || null, insertSheet: () => { throw new Error('x'); } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { getUuid: () => 'u', sleep: () => {}, formatDate: () => '' },
    Session: { getScriptTimeZone: () => 'UTC', getActiveUser: () => ({ getEmail: () => '' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, getAll: () => ({}), putAll: () => {}, removeAll: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === 'SYSTEM_STORAGE_BACKEND' ? 'sheets' : null, setProperty: () => {}, deleteProperty: () => {} }) },
    Logger: { log: () => {} }, ScriptApp: { getProjectTriggers: () => [] }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
    ['Code.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  });
  vm.runInContext(
    "getSpreadsheet_ = function () { return SpreadsheetApp.openById('x'); };" +
    "getSheet_ = function (n) { return SpreadsheetApp.openById('x').getSheetByName(n); };", sb);

  sb.addRecord_('db', 'T', {
    'Code': 'C-1', 'Shipping Type': 'CIF', 'lowercase_col': 'low',
    'Mixed Case': 'mixed', 'unique_id': 'u1'
  }, ['Code']);

  check(!!appended, 'a row is appended');
  check(appended['Code'] === 'C-1', "a capitalised header keeps its value ('Code')", JSON.stringify(appended['Code']));
  check(appended['Shipping Type'] === 'CIF', "a two-word header too ('Shipping Type')", JSON.stringify(appended['Shipping Type']));
  check(appended['Mixed Case'] === 'mixed', "and a mixed-case one ('Mixed Case')", JSON.stringify(appended['Mixed Case']));
  check(appended['lowercase_col'] === 'low', 'a lowercase header still works, as before');
  check(appended['unique_id'] === 'u1', 'and so does unique_id');
  check(Number(appended['id']) === 1, "'id' is still assigned by the allocator, not taken from the map",
    JSON.stringify(appended['id']));

  /* the lowercase fallback must survive, or every existing caller breaks */
  appended = null;
  sb.addRecord_('db', 'T', { 'code': 'C-2', 'shipping type': 'FOB' }, []);
  check(appended['Code'] === 'C-2' && appended['Shipping Type'] === 'FOB',
    'a map keyed in lowercase still fills capitalised headers (the old contract)',
    JSON.stringify([appended['Code'], appended['Shipping Type']]));

  /* exact wins over lowercase when a caller supplies both */
  appended = null;
  sb.addRecord_('db', 'T', { 'Code': 'exact', 'code': 'lower' }, []);
  check(appended['Code'] === 'exact', 'an exact header match wins over the lowercase one',
    JSON.stringify(appended['Code']));
}

/* ══ the run ════════════════════════════════════════════════════════════ */
console.log('\n' + (failed === 0
  ? 'S17 — the purchasing save and the batched delete both check out.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);

