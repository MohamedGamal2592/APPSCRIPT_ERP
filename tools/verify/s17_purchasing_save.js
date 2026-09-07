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
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    Logger: { log: () => {} },
    ScriptApp: { getProjectTriggers: () => [] }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  ['00_Config.js', '02_DataAccess.js'].forEach(f => {
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
    getRange: (row, col, nRows, nCols) => ({
      getValues: () => [grid[row - 1].slice(0, (col - 1) + (nCols || grid[0].length)).slice(col - 1)]
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
  const written = { lines: null };

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
          return row === 1 ? [headers.slice()] : [(grid[row - 1] || headers).slice()];
        },
        setValue: () => { C.setValue++; },
        setValues: (v) => {
          C.setValues++;
          if (name === 'valley_product_purchasing' && v && v.length) written.lines = v.map(r => r.slice());
          (v || []).forEach(r => grid.push(r.slice()));
        },
        setNumberFormat: () => {}, sort: () => {}
      }),
      appendRow: (r) => { C.appendRow++; grid.push(r.slice()); },
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
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    Logger: { log: () => {} }, ScriptApp: { getProjectTriggers: () => [] }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  ['00_Config.js', '02_DataAccess.js'].forEach(f => {
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
  header['Code'] = 'PUR-T';
  header['Reciept Date'] = '2026-01-15';
  header['Shipping Type'] = 'محلي';
  header['Currency'] = 'EGP';
  header['Total costs'] = opts.headerTotal !== undefined ? opts.headerTotal : nLines * 100;

  const lines = [];
  for (let i = 0; i < nLines; i++) {
    lines.push({ product: 'P' + i, qty: 2, unit_price: 50, total_cost: 100, other_cost: 0, unit_cost: 50, vendor: 'V' });
  }

  let error = null, result = null;
  try {
    result = H.save({ header: header, originalCode: 'PUR-T', lines: lines },
      { email: 'buyer@valley.test', name: 'Buyer' }, 'db');
  } catch (e) { error = e; }

  const roundTrips = C.getValues + C.appendRow + C.deleteRow + C.deleteRows + C.setValue + C.setValues;
  return { C: C, roundTrips: roundTrips, written: written.lines, result: result, error: error, SH: SH };
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

/* ══ the run ════════════════════════════════════════════════════════════ */
console.log('\n' + (failed === 0
  ? 'S17 — the purchasing save and the batched delete both check out.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
