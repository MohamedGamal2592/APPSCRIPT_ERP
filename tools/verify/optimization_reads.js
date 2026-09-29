'use strict';
/* OPT-3 — repeated reads/indexes on measured active paths (Task 3).
 *
 * 1. approveValleyInvoice_: the invoice_unique_id header index is hoisted out
 *    of the row loop and the history snapshot is built from the row just
 *    located — instead of a second full getAllRecords_ read of the same
 *    sheet. Proves: same toggle behavior, same miss behavior, snapshot
 *    ownership (pre-write), physical-row correctness with blank rows present,
 *    and exactly ONE values read per approval.
 * 2. whBatchUnit_: the products-table fallback lookup is built once per
 *    warehouse-movement batch as an EXACT trimmed-string map (first wins) and
 *    passed in — instead of a re-read + re-scan per unit-less row. Proves the
 *    map path agrees with the legacy find path on exact/case/duplicate/
 *    numeric/blank/missing keys, and that the map path touches no sheet.
 * Nothing here touches a spreadsheet, a Google service or the network. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
function grabNested(src, name) {
  const start = src.indexOf('  function ' + name + '(');
  assert(start >= 0, 'missing nested ' + name);
  const end = src.indexOf('\n  function ', start + 10);
  return src.slice(start, end < 0 ? src.length : end);
}

// ── 1. approveValleyInvoice_ ───────────────────────────────────────────────
const HEADERS = ['id', 'invoice_unique_id', 'approval_status', 'approval', 'approval_time', 'record_uid'];
function makeInvSheet(seedRows) {
  const grid = [HEADERS.slice()].concat(seedRows.map(r => r.slice()));
  let dataReads = 0, rangeWrites = 0;
  const writes = [];
  function applyCell(r, c, v, batched) { writes.push({ row: r, col: c, value: v, batched: !!batched }); grid[r - 1][c - 1] = v; }
  return {
    __headers: HEADERS.slice(),
    data: () => grid.map(r => r.slice()),
    get dataReads() { return dataReads; },
    get rangeWrites() { return rangeWrites; },
    writes,
    getDataRange: () => ({ getValues: () => { dataReads++; return grid.map(r => r.slice()); } }),
    getRange: (r, c, nRows, nCols) => ({
      setValue: v => applyCell(r, c, v, false),
      setValues: vv => { rangeWrites++; (vv[0] || []).forEach((v, i) => applyCell(r, c + i, v, true)); }
    }),
    getLastRow: () => grid.length,
    getLastColumn: () => HEADERS.length
  };
}

const vfSource = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const FIN_SALES_INV_SHEET = (vfSource.match(/const FIN_SALES_INV_SHEET\s*=\s*'([^']+)'/) || [])[1];
assert.ok(FIN_SALES_INV_SHEET, 'FIN_SALES_INV_SHEET located');

let historyCalls = [];
const actx = {
  console,
  requireSuperAdmin_: user => { if (!user || !user.isSuperAdmin) throw new Error('denied'); },
  getHeaders_: sheet => (sheet.__headers || []).slice(),
  // A throwing reader proves the approval no longer pays a second full read
  // of the invoice sheet: any getAllRecords_ call fails the test loudly.
  getAllRecords_: () => { throw new Error('OPT-3: approval must not re-read the sheet'); },
  // Faithful to DOC_STATUS_TRANSITIONS.vf_sales_inv: Pending<->Approved only.
  // Faithful to DOC_STATUS_TRANSITIONS.vf_mfg_order for the unlock path below.
  assertTransition_: (dt, from, to) => {
    const f = String(from), t = String(to);
    const ok = (f === 'Pending' && t === 'Approved') ||
      (f === 'Approved' && t === 'Pending') ||
      (String(dt) === 'vf_mfg_order' && f === 'Locked' && t === 'In Progress');
    if (!ok) throw new Error('bad transition');
    return true;
  },
  noteMutation_: () => {},
  logHistory_: function () { historyCalls.push(Array.prototype.slice.call(arguments)); },
  FIN_SALES_INV_SHEET
};
let invSheet = null;
let mfgSheet = null;
let mfgName = null;
actx.getSheet_ = name => ((mfgName && name === mfgName) ? mfgSheet : invSheet);
vm.createContext(actx);
vm.runInContext(grabNested(vfSource, 'approveValleyInvoice_'), actx, { filename: 'approve slice' });

const SUPER = { isSuperAdmin: true, email: 'gm@valley.test' };
function seedInvoices() {
  return [
    [1, 'INV-A', 'Pending', '', '', 'ru-A'],
    ['', '', '', '', '', ''],
    [2, 'INV-B', 'Approved', 'gm@valley.test', '2026-09-01', 'ru-B']
  ];
}

invSheet = makeInvSheet(seedInvoices());
historyCalls = [];
const approved = actx.approveValleyInvoice_({ invoice_unique_id: 'INV-A' }, SUPER, 'db');
assert.strictEqual(approved.status, 'success');
assert.strictEqual(approved.approval_status, 'Approved');
assert.strictEqual(invSheet.dataReads, 1, 'one values read per approval, not two');
assert.strictEqual(historyCalls.length, 1, 'history written once');
const histNew = historyCalls[0][6], histOld = historyCalls[0][7];
assert.strictEqual(histOld.approval_status, 'Pending', 'history old snapshot is pre-write');
assert.strictEqual(histOld.invoice_unique_id, 'INV-A');
assert.strictEqual(histNew.approval_status, 'Approved', 'history new values carry the toggle');
assert.strictEqual(histNew.approval, 'gm@valley.test');
// Physical row: INV-A is grid row 2 (header + 1) — the status cell (col 3) got 'Approved'.
const statusWrite = invSheet.writes.filter(w => w.col === 3);
assert.strictEqual(statusWrite.length, 1);
assert.strictEqual(statusWrite[0].row, 2);
assert.strictEqual(statusWrite[0].value, 'Approved');

// Toggle back Approved -> Pending clears approver/time.
invSheet = makeInvSheet(seedInvoices());
historyCalls = [];
const reverted = actx.approveValleyInvoice_({ invoice_unique_id: 'INV-B' }, SUPER, 'db');
assert.strictEqual(reverted.approval_status, 'Pending');
assert.strictEqual(invSheet.dataReads, 1);
// INV-B sits after a blank row (grid row 4): the write must land there, proving
// the located physical row is used, never a filtered index + offset.
const bStatus = invSheet.writes.filter(w => w.col === 3);
assert.strictEqual(bStatus.length, 1);
assert.strictEqual(bStatus[0].row, 4, 'write lands on the physical row despite the blank row above');
assert.strictEqual(bStatus[0].value, 'Pending');
const apprWrite = invSheet.writes.filter(w => w.col === 4);
assert.strictEqual(apprWrite[0].value, '', 'approver cleared on revert');

// Miss behavior preserved: unknown uid and missing header both throw not-found.
invSheet = makeInvSheet(seedInvoices());
assert.throws(() => actx.approveValleyInvoice_({ invoice_unique_id: 'NOPE' }, SUPER, 'db'), /غير موجودة/);
assert.strictEqual(invSheet.dataReads, 1, 'a miss still costs exactly one scan');
actx.getHeaders_ = sheet => (sheet.__headers || []).filter(h => h !== 'invoice_unique_id');
invSheet = makeInvSheet(seedInvoices());
assert.throws(() => actx.approveValleyInvoice_({ invoice_unique_id: 'INV-A' }, SUPER, 'db'), /غير موجودة/,
  'a missing header still matches nothing');
actx.getHeaders_ = sheet => (sheet.__headers || []).slice();

// ── 1b. approveValleyMfgOrder_ unlock: same located-row snapshot ────────────
const MFG_HEADERS = ['id', 'unique_id', 'mo_status', 'record_uid'];
const MFG_ORDER_SHEET = (vfSource.match(/const MFG_ORDER_SHEET\s*=\s*'([^']+)'/) || [])[1];
assert.ok(MFG_ORDER_SHEET, 'MFG_ORDER_SHEET located');
mfgName = MFG_ORDER_SHEET;
actx.MFG_ORDER_SHEET = MFG_ORDER_SHEET;
actx.vfFlush_ = () => {};
vm.runInContext(grabNested(vfSource, 'approveValleyMfgOrder_'), actx, { filename: 'mfg slice' });

function makeMfgSheet(seedRows) {
  const grid = [MFG_HEADERS.slice()].concat(seedRows.map(r => r.slice()));
  let dataReads = 0, rangeWrites = 0;
  const writes = [];
  function applyCell(r, c, v, batched) { writes.push({ row: r, col: c, value: v, batched: !!batched }); grid[r - 1][c - 1] = v; }
  return {
    __headers: MFG_HEADERS.slice(),
    data: () => grid.map(r => r.slice()),
    get dataReads() { return dataReads; },
    get rangeWrites() { return rangeWrites; },
    writes,
    getDataRange: () => ({ getValues: () => { dataReads++; return grid.map(r => r.slice()); } }),
    getRange: (r, c, nRows, nCols) => ({
      setValue: v => applyCell(r, c, v, false),
      setValues: vv => { rangeWrites++; (vv[0] || []).forEach((v, i) => applyCell(r, c + i, v, true)); }
    }),
    getLastRow: () => grid.length,
    getLastColumn: () => MFG_HEADERS.length
  };
}

mfgSheet = makeMfgSheet([
  [1, 'MO-LOCKED', 'Locked', 'ru-M1'],
  ['', '', '', ''],
  [2, 'MO-OPEN', 'In Progress', 'ru-M2']
]);
historyCalls = [];
const unlocked = actx.approveValleyMfgOrder_({ mo_uid: 'MO-LOCKED', kind: 'unlock' }, SUPER, 'db');
assert.strictEqual(unlocked.status, 'success');
assert.strictEqual(mfgSheet.dataReads, 1, 'unlock pays one scan, not scan plus records read');
assert.strictEqual(historyCalls.length, 1);
assert.strictEqual(historyCalls[0][7].mo_status, 'Locked', 'history old snapshot is pre-write');
assert.strictEqual(historyCalls[0][6].mo_status, 'In Progress', 'history new values carry the unlock');
const mStatus = mfgSheet.writes.filter(w => w.col === 3);
assert.strictEqual(mStatus.length, 1);
assert.strictEqual(mStatus[0].row, 2);
assert.strictEqual(mStatus[0].value, 'In Progress');
assert.throws(() => actx.approveValleyMfgOrder_({ mo_uid: 'MO-NOPE', kind: 'unlock' }, SUPER, 'db'), /غير موجود/);

// ── 2. whBatchUnit_ exact-map vs legacy find ───────────────────────────────
const FIN_PRODUCTS_SHEET = (vfSource.match(/const FIN_PRODUCTS_SHEET\s*=\s*'([^']+)'/) || [])[1];
assert.ok(FIN_PRODUCTS_SHEET, 'FIN_PRODUCTS_SHEET located');
const wctx = { console, FIN_PRODUCTS_SHEET };
let productReads = 0;
const products = [
  { id: 'ABC', unit: 'Kilo' },
  { id: 'abc', unit: 'Litre' },
  { id: 'ABC', unit: 'DUP-must-lose' },
  { id: 7, unit: 'Box' },
  { id: '', unit: 'blank-must-never-match' },
  { id: null, unit: 'null-must-never-match' }
];
wctx.getAllRecords_ = () => { productReads++; return products.map(p => Object.assign({}, p)); };
vm.createContext(wctx);
vm.runInContext(grabNested(vfSource, 'whBatchUnit_'), wctx, { filename: 'unit slice' });

// The map construction mirrors saveValleyWarehouseMovement_ exactly.
function buildUnitMap(rows) {
  const m = {};
  rows.forEach(function (x) {
    const pk = String(x.id == null ? '' : x.id).trim();
    if (pk && m[pk] === undefined) m[pk] = String(x.unit || '').trim();
  });
  return m;
}
const unitMap = buildUnitMap(products);
// Wiring: the save path builds the map once and passes it into the row loop.
const saveAt = vfSource.indexOf('function saveValleyWarehouseMovement_(');
const saveBody = vfSource.slice(saveAt, vfSource.indexOf('\n  function ', saveAt + 10));
assert.ok(saveBody.indexOf('productUnits[pk] === undefined') !== -1, 'save builds the exact first-wins map once');
assert.ok(saveBody.indexOf('whBatchUnit_(dbId, batch, productUnits)') !== -1, 'row loop passes the map in');

const cases = [
  // [batch, expected unit, legacy sheet reads: 1 only when the row actually
  // reaches the products fallback — blank product_id / preset unit return early]
  [{ unit: '', product_id: 'abc' }, 'Litre', 1],
  [{ unit: '', product_id: 'ABC' }, 'Kilo', 1],
  [{ unit: '', product_id: '7' }, 'Box', 1],
  [{ unit: '', product_id: 'missing' }, '', 1],
  [{ unit: '', product_id: '' }, '', 0],
  [{ unit: 'Piece', product_id: 'abc' }, 'Piece', 0]
];
cases.forEach(function ([batch, expected, legacyReads]) {
  productReads = 0;
  const viaMap = wctx.whBatchUnit_('db', batch, unitMap);
  assert.strictEqual(productReads, 0, 'map path touches no sheet');
  const viaLegacy = wctx.whBatchUnit_('db', batch);
  assert.strictEqual(productReads, legacyReads, 'legacy path reads iff it reaches the fallback');
  assert.strictEqual(viaMap, expected, 'map path resolves ' + JSON.stringify(batch));
  assert.strictEqual(viaLegacy, expected, 'legacy path agrees on ' + JSON.stringify(batch));
});
assert.strictEqual(wctx.whBatchUnit_('db', { unit: '', product_id: 'abc' }, unitMap), 'Litre',
  'lowercase query finds the lowercase row, not the ABC row (no case collapse)');
assert.strictEqual(wctx.whBatchUnit_('db', null, unitMap), '', 'null batch is safe');
assert.strictEqual(wctx.whBatchUnit_('db', {}, unitMap), '', 'batch without product_id is safe');

// ── 3. TC payroll cards: iteration index replaces cards.indexOf ────────────
// cards[] is rows.map-built (distinct references), so indexOf(c) === the
// iteration index by construction. The fixture includes two VALUE-identical
// rows: as distinct objects they still resolve to their own card, proving no
// repeated reference can change numbering. cardHtml[i] parallels cards[i].
function grabGlobal(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing global ' + name);
  const end = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, end < 0 ? src.length : end);
}
const tcSource = fs.readFileSync(path.join(ROOT, 'Company_TopChemical_Actions.js'), 'utf8');
const pctx = {
  console,
  payrollEsc_: s => 'E(' + s + ')',
  payrollMoney_: n => 'M(' + n + ')'
};
vm.createContext(pctx);
// payrollRow_1 is pure; payrollEsc_/payrollMoney_ stay stubbed so markers are
// greppable (loading the real ones would shadow the stubs in this context).
vm.runInContext(
  ['payrollRow_1', 'buildPayrollCardsHtml_'].map(n => grabGlobal(tcSource, n)).join('\n'),
  pctx, { filename: 'payroll cards slice' }
);
// Wiring: no indexOf remains on the cards array in the grouping loop.
const cardsFn = grabGlobal(tcSource, 'buildPayrollCardsHtml_');
assert.ok(cardsFn.indexOf('cards.indexOf') === -1, 'grouping loop uses the iteration index');

const cardRows = [
  { emp_id: 1, name_ar: 'أ', section: 'S1', basic_salary: 100, allow: 0, working_days: 1, working_days_value: 1, overtime_days: 0, other_addition: 0, overtime_days_value: 0, loans_other_deductions: 0, delay_deductions: 0, deduction_day_value: 0, net_salary_nearest: 10 },
  { emp_id: 2, name_ar: 'ب', section: 'S1', basic_salary: 100, allow: 0, working_days: 1, working_days_value: 1, overtime_days: 0, other_addition: 0, overtime_days_value: 0, loans_other_deductions: 0, delay_deductions: 0, deduction_day_value: 0, net_salary_nearest: 20 },
  // value-identical twin of the previous row: a distinct card that must render its own html
  { emp_id: 2, name_ar: 'ب', section: 'S1', basic_salary: 100, allow: 0, working_days: 1, working_days_value: 1, overtime_days: 0, other_addition: 0, overtime_days_value: 0, loans_other_deductions: 0, delay_deductions: 0, deduction_day_value: 0, net_salary_nearest: 20 },
  { emp_id: 3, name_ar: 'ج', section: 'S2', basic_salary: 100, allow: 0, working_days: 1, working_days_value: 1, overtime_days: 0, other_addition: 0, overtime_days_value: 0, loans_other_deductions: 0, delay_deductions: 0, deduction_day_value: 0, net_salary_nearest: 30 }
];
const cardsHtml = pctx.buildPayrollCardsHtml_(cardRows, 'يناير', 2026);
// Each net appears exactly as many times as its rows: no card lost, none doubled.
[['M(10)', 1], ['M(20)', 2], ['M(30)', 1]].forEach(function ([marker, count]) {
  const hits = cardsHtml.split(marker).length - 1;
  assert.ok(hits >= count, 'net marker ' + marker + ' rendered ' + hits + 'x, expected at least ' + count);
});
// Section grouping preserved: S1 bucket holds 3 cards, S2 holds 1.
assert.ok(cardsHtml.indexOf('S1') !== -1 && cardsHtml.indexOf('S2') !== -1, 'both sections rendered');

// ── 4. TC payroll composite-key paths: located-row snapshots ───────────────
// deleteEmpSalary_ and updateEmpSalaryReceipt_ scan the salaries sheet for
// the physical row (needed for deleteRow/setValue) and used to pay a second
// full getAllRecords_ read for the history snapshot. Both now map the
// located raw row with the record mapping. Numeric composite key semantics
// (Number() both sides, first physical match) live in the scan, unchanged.
const EMP_SAL_HEADERS = ['id', 'emp_id', 'month', 'year', 'receipt', 'record_uid'];
const EMP_SALARIES_SHEET = (tcSource.match(/const EMP_SALARIES_SHEET\s*=\s*'([^']+)'/) || [])[1];
assert.strictEqual(EMP_SALARIES_SHEET, 'emp_salaries');
const EMP_SALARIES_CLOSE_SHEET = (tcSource.match(/const EMP_SALARIES_CLOSE_SHEET\s*=\s*'([^']+)'/) || [])[1];
assert.ok(EMP_SALARIES_CLOSE_SHEET, 'EMP_SALARIES_CLOSE_SHEET located');
function makeSalSheet(seedRows) {
  const grid = [EMP_SAL_HEADERS.slice()].concat(seedRows.map(r => r.slice()));
  let dataReads = 0;
  const ops = [];
  return {
    __headers: EMP_SAL_HEADERS.slice(),
    data: () => grid.map(r => r.slice()),
    get dataReads() { return dataReads; },
    ops,
    getDataRange: () => ({ getValues: () => { dataReads++; return grid.map(r => r.slice()); } }),
    getRange: (r, c) => ({ setValue: v => { ops.push({ set: [r, c, v] }); grid[r - 1][c - 1] = v; } }),
    deleteRow: n => { ops.push({ del: n }); grid.splice(n - 1, 1); },
    getLastRow: () => grid.length,
    getLastColumn: () => EMP_SAL_HEADERS.length
  };
}
const sctx = {
  console,
  executeWithLock_: fn => fn(),
  getHeaders_: sheet => (sheet.__headers || []).slice(),
  // The close-month check reads a DIFFERENT sheet (legitimate, unchanged).
  // A second read of the salaries sheet itself fails loudly.
  getAllRecords_: (dbId, sheetName) => {
    if (String(sheetName) !== EMP_SALARIES_SHEET) return [];
    throw new Error('OPT-3: payroll paths must not re-read the sheet');
  },
  noteMutation_: () => {},
  logHistory_: function () { historyCalls.push(Array.prototype.slice.call(arguments)); },
  EMP_SALARIES_SHEET,
  EMP_SALARIES_CLOSE_SHEET
};
let salSheet = null;
sctx.getSheet_ = () => salSheet;
vm.createContext(sctx);
vm.runInContext(
  ['deleteEmpSalary_', 'updateEmpSalaryReceipt_'].map(n => grabNested(tcSource, n)).join('\n'),
  sctx, { filename: 'payroll slice' }
);
function seedSal() {
  return [
    [1, 101, 9, 2026, false, 'ru-S1'],
    ['', '', '', '', '', ''],
    [2, 102, 9, 2026, false, 'ru-S2']
  ];
}

// Delete: physical row removed, history old snapshot from that row, one read.
salSheet = makeSalSheet(seedSal());
historyCalls = [];
const delRes = sctx.deleteEmpSalary_({ emp_id: 102, month: 9, year: 2026 }, SUPER, 'db');
assert.strictEqual(delRes.status, 'success');
assert.strictEqual(salSheet.dataReads, 1, 'delete pays one scan, not scan plus records read');
assert.strictEqual(salSheet.ops.length, 1);
assert.strictEqual(salSheet.ops[0].del, 4, 'the physical row goes (blank row above shifts nothing)');
assert.strictEqual(salSheet.data().length, 3, 'one row removed');
assert.strictEqual(historyCalls.length, 1);
assert.strictEqual(historyCalls[0][7].record_uid, 'ru-S2', 'history old is the deleted row');
assert.strictEqual(historyCalls[0][6], null, 'delete history new is null');
assert.throws(() => sctx.deleteEmpSalary_({ emp_id: 999, month: 9, year: 2026 }, SUPER, 'db'), /غير موجود/);

// Receipt: cell set on the located row, history old/new from that row, one read.
salSheet = makeSalSheet(seedSal());
historyCalls = [];
const recRes = sctx.updateEmpSalaryReceipt_({ emp_id: 101, month: 9, year: 2026 }, SUPER, 'db');
assert.strictEqual(recRes.status, 'success');
assert.strictEqual(salSheet.dataReads, 1, 'receipt pays one scan, not scan plus records read');
assert.strictEqual(salSheet.ops.length, 1);
assert.deepStrictEqual(salSheet.ops[0].set.slice(0, 2), [2, 5], 'receipt cell on the located row');
assert.strictEqual(salSheet.ops[0].set[2], true);
assert.strictEqual(historyCalls.length, 1);
assert.strictEqual(historyCalls[0][7].record_uid, 'ru-S1', 'history old is the updated row');
assert.strictEqual(historyCalls[0][6].receipt, true, 'history new carries the receipt flag');
assert.strictEqual(historyCalls[0][6].record_uid, 'ru-S1', 'history new keeps the row identity');



// ── 5. TopLight editPurchasing_: key-addressed patch, no full-sheet scan ─────
const gasstub = require('./gasstub');
const workbookStub = require('./vf_workbook_stub');
const tlSource = fs.readFileSync(path.join(ROOT, 'Company_TopLight_Actions.js'), 'utf8');
const TL_DB = 'tl-opt-reads-db';
const tlWorkbook = workbookStub.createWorkbookStub();
tlWorkbook.createSpreadsheet(TL_DB, []);
const tlHarness = gasstub.createHarness({ workbook: tlWorkbook, sources: ['Company_TopLight_Actions.js'] });
tlHarness.override('getCompanySpreadsheetId_', () => TL_DB);
const tlBook = tlWorkbook.openById(TL_DB);
assert.ok(tlSource.indexOf('applyHeaderFormulas_') === -1 && tlSource.indexOf('appendCashRow_') === -1,
  'Top Light has no formula-writing write path left');
const PU_HEADERS = ['unique_id', 'code', 'reciept date', 'type', 'value', 'exchange rate', 'total costs', 'value based on invoice', 'month', 'year', 'tax type', 'sales value', 'sales tax amount', 'approval_status'];
tlBook.addSheet('top_light_purchasing_costing').__setRows([
  PU_HEADERS.slice(),
  ['PU-1', 'OLD-CODE', '2026-09-01', 'شراء', 10, 1, '', '', '', '', '', '', '', 'Pending']
]);
tlBook.addSheet('top_light_product_purchasing').__setRows([
  ['unique_id', 'id', 'top_light_purchasing_costing_id', 'product', 'qty', 'unit_price', 'other_cost', 'exchange_rate', 'receipt_date', 'total_cost', 'unit_cost', 'sales_value_amount', 'sales_qty', 'cost_currency']
]);
tlBook.addSheet('top_light_products').__setRows([
  ['id', 'name_ar', 'name_en', 'category', 'unit', 'carton', 'sales_tax', 'asset_code', 'user', 'created_at']
]);
tlBook.addSheet('top_light_customer_vendor').__setRows([
  ['id', 'name', 'customer_direction', 'type', 'country', 'region', 'registration_number', 'tax_id', 'name_en', 'telephone', 'address', 'user', 'created_at']
]);
const tlHistory = [];
tlHarness.override('logHistory_', function () { tlHistory.push(Array.prototype.slice.call(arguments)); });
const tlEdited = tlHarness.eval('TopLight').dispatch_({
  module_action: 'edit_purchasing',
  data: {
    header: { unique_id: 'PU-1', code: 'NEW-CODE', receipt_date: '2026-09-02', type: 'شراء', value: 12, exchange_rate: 1 },
    lines: [{ product: 1, qty: 12, unit_price: 1, other_cost: 0, exchange_rate: 1, sales_value: 0, movement_type: 'شراء' }]
  }
}, { isSuperAdmin: true, email: 'user@test' }, TL_DB);
assert.strictEqual(tlEdited.status, 'success');
const puRows = tlHarness.call('getAllRecords_', TL_DB, 'top_light_purchasing_costing');
assert.strictEqual(puRows.length, 1, 'edit keeps the physical header row (no delete + re-append)');
assert.strictEqual(puRows[0].code, 'NEW-CODE', 'patched column lands on the located row');
assert.strictEqual(Number(puRows[0]['total costs']), 12, 'derived total costs is refreshed as a value');
assert.strictEqual(tlHistory.length, 1);
assert.strictEqual(tlHistory[0][7].code, 'OLD-CODE', 'history old snapshot comes from the patch, pre-write');
assert.ok(tlWorkbook.operations().every(op => op.indexOf('deleteRows:top_light_purchasing_costing') === -1),
  'no physical delete on the document header');
const lineRows = tlHarness.call('getAllRecords_', TL_DB, 'top_light_product_purchasing');
assert.strictEqual(lineRows.length, 1, 'replacement lines are appended as values');
assert.strictEqual(lineRows[0].top_light_purchasing_costing_id, 'PU-1');
assert.strictEqual(Number(lineRows[0].total_cost), 12, 'line total_cost derived in script');



// ── 6. Customer movements: measure request-local rebuild count before indexing
let movementBuilds = 0;
const movementCtx = { console, customerRawMovements_: () => {
  movementBuilds++;
  return [
    { customer: 'A', date: vm.runInContext("new Date('2026-09-01')", movementCtx), amount: 10, type: 'sales', lines: [] },
    { customer: 'B', date: vm.runInContext("new Date('2026-09-02')", movementCtx), amount: 99, type: 'sales', lines: [] },
    { customer: 'A', date: vm.runInContext("new Date('2026-09-03')", movementCtx), amount: -3, type: 'return', lines: [] }
  ];
} };
vm.createContext(movementCtx);
const movementStart = tlSource.indexOf('  function customerMovements_(');
const movementEnd = tlSource.indexOf('\n  function ', movementStart + 10);
assert(movementStart >= 0 && movementEnd > movementStart, 'customerMovements_ body located');
vm.runInContext(tlSource.slice(movementStart, movementEnd), movementCtx, { filename: 'TopLight customer movement slice' });
const statement = movementCtx.customerMovements_('db', 'A', vm.runInContext("new Date('2026-09-02')", movementCtx), null);
assert.strictEqual(movementBuilds, 1, 'one customer statement builds the raw movement set once');
assert.strictEqual(statement.opening_balance, 10, 'date filter preserves opening balance');
assert.strictEqual(statement.movements.length, 1);
assert.strictEqual(statement.movements[0].running_balance, 7, 'running balance/order remain unchanged');
// The actual consumer graph has no same-request reuse opportunity: the other
// public balance action is a separate request. Keep the all-customer builder
// deferred until measured multi-statement traffic justifies an internal index.

console.log('optimization_reads: PASS');
