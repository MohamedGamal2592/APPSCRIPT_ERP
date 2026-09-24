'use strict';
/**
 * Offline proof for رصيد أصناف الميزانية (action tc_budget_stock_balance).
 *
 *   node tools/verify/tc_budget_stock_balance.js
 *
 * Loads the REAL getLegalStockBalance_ out of Company_TopChemical_Actions.js
 * into a vm with stubbed sheets, refs accessor and MySQL view, and checks the
 * aggregation the page depends on: group-by trimmed name_ar, the lowest-id
 * duplicate policy, the unmatched counter, the product_system_id ->
 * product_current_quantity.id join, and the MySQL-down fallback that must
 * still return a renderable report.
 *
 * Also parses the REAL PAGE_ACCESS / ACTION_TABLES blocks and the real page
 * template, because a correct handler with no route (fail-closed) or a page
 * still calling the old action is not a working feature.
 */
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'Company_TopChemical_Actions.js'), 'utf8');
const S = require('../lib/sources');

let checks = 0;
function ok(cond, label, extra) {
  checks++;
  assert.ok(cond, label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  console.log('  PASS  ' + label);
}

/* ── the real handler, sliced out of the IIFE ─────────────────────────────── */
function grabNested(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'missing nested function ' + name);
  const end = source.indexOf('\n  function ', start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

const LEGAL_CURRENT_SHEET = 'legal_current_products';

function runBalance(fixture) {
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, isNaN, isFinite,
    LEGAL_CURRENT_SHEET: LEGAL_CURRENT_SHEET,
    tcLegalProductsRaw_: function () { return fixture.products; },
    getAllRecords_: function (dbId, sheet) {
      assert.strictEqual(sheet, LEGAL_CURRENT_SHEET, 'handler reads legal_current_products');
      return fixture.current;
    },
    systemQtyMap_: function () {
      if (fixture.mysqlDown) throw new Error('MySQL unreachable');
      return fixture.systemQty || {};
    },
    tcAssetCodeRefs_: function () { return fixture.assetRefs || { options: [], map: {} }; }
  };
  vm.createContext(ctx);
  vm.runInContext(grabNested('getLegalStockBalance_') + '\nthis.__run = getLegalStockBalance_;', ctx,
    { filename: 'Company_TopChemical_Actions.js#getLegalStockBalance_' });
  return ctx.__run({}, {}, '3fe1b5cb67b7223e');
}

/* ── fixtures ─────────────────────────────────────────────────────────────── */
function line(over) {
  const base = {
    product: 'أ', transaction_code: 'T0', transaction_name: 'بيع', code: 'C0',
    unit: 'لتر', current_qty: 1, total_cost_sign: 1, total_sales_value: 2,
    sales_per_qty: 3, product_target: 'بيع'
  };
  return Object.assign(base, over || {});
}

const PRODUCTS = [
  { id: 2, name_ar: 'ب', unit: 'كجم', category: 'كيماويات', product_type: 'بيع', product_system_id: '20' },
  { id: 1, name_ar: 'أ', unit: 'لتر', category: 'كيماويات', product_type: 'بيع', product_system_id: 10, asset_code: '114100' },
  { id: 5, name_ar: 'أ', unit: 'لتر', category: 'كيماويات', product_type: 'بيع', product_system_id: '11' },
  { id: 3, name_ar: '', unit: '', category: '', product_type: '', product_system_id: '' }
];
const ASSET_REFS = { options: [{ value: '114100', label: 'أصول' }], map: { '114100': 'أصول' } };
const CURRENT = [
  line({ transaction_code: 'T1', current_qty: 5, total_cost_sign: 100, total_sales_value: 150, sales_per_qty: 30 }),
  line({ product: ' أ ', transaction_code: 'T2', current_qty: 7, total_cost_sign: 50, total_sales_value: 70, sales_per_qty: 10 }),
  line({ transaction_code: 'T3', current_qty: -2, total_cost_sign: -20, total_sales_value: 0, sales_per_qty: 0 }),
  line({ product: 'ج', transaction_code: 'T4', current_qty: 9, total_cost_sign: 9, total_sales_value: 9, sales_per_qty: 1 }),
  line({ product: '   ', transaction_code: 'T5', current_qty: 1, total_cost_sign: 1, total_sales_value: 1, sales_per_qty: 1 })
];
const SYSTEM_QTY = { 10: 20, 11: 99, 20: 0 };

/* ── 1. aggregation ───────────────────────────────────────────────────────── */
console.log('\nGrouping and sums');
const res = runBalance({ products: PRODUCTS, current: CURRENT, systemQty: SYSTEM_QTY, assetRefs: ASSET_REFS });
ok(res.status === 'success', 'status is success');
ok(res.system_qty_error === false, 'system_qty_error is false when the view answers');
ok(Array.isArray(res.products) && res.products.length === 4, 'one row per legal_products record', res.products && res.products.length);
ok(res.products.map(function (r) { return r.id; }).join(',') === '1,2,3,5', 'rows are ordered by legal_products id', res.products.map(function (r) { return r.id; }));

const a1 = res.products[0];
ok(a1.name_ar === 'أ', 'row 1 is the first name_ar', a1.name_ar);
ok(a1.lines_count === 3, 'the trimmed-space line joins the same product', a1.lines_count);
ok(a1.current_qty === 10, 'sum of correlated current_qty (5 + 7 - 2)', a1.current_qty);
ok(a1.total_cost_sign === 130, 'sum of correlated total_cost_sign (100 + 50 - 20)', a1.total_cost_sign);
ok(a1.total_sales_value === 220, 'sum of correlated total_sales_value', a1.total_sales_value);
ok(a1.system_qty === 20, 'system_qty comes from product_system_id 10', a1.system_qty);
ok(a1.difference === 10, 'difference = system_qty - summed qty', a1.difference);
ok(a1.asset_code === '114100' && a1.asset_code_name === 'أصول',
  'asset_code resolves to its chart_of_accounts level-5 name', a1.asset_code_name);
ok(res.asset_code_options.length === 1 && res.asset_code_options[0].value === '114100' && res.asset_code_options[0].label === 'أصول',
  'the response carries the chart_of_accounts select options');
ok(a1.lines[0].transaction_code === 'T1' && a1.lines[1].transaction_code === 'T2' && a1.lines[2].transaction_code === 'T3',
  'modal lines carry the correlated transaction codes in order', a1.lines.map(function (l) { return l.transaction_code; }));
ok(Object.keys(a1.lines[0]).length === 9, 'each line carries exactly the nine modal fields', Object.keys(a1.lines[0]));
ok(a1.lines[1].unit === 'لتر' && a1.lines[1].product_target === 'بيع' && typeof a1.lines[0].sales_per_qty === 'number',
  'line fields are trimmed strings / numeric');

const b2 = res.products[1];
ok(b2.name_ar === 'ب' && b2.lines_count === 0 && b2.current_qty === 0 && b2.total_cost_sign === 0,
  'a product with no correlated lines is still listed at zero', b2);
ok(b2.system_qty === 0 && b2.difference === 0, 'a live zero from the view is kept, not treated as missing', b2.system_qty);
ok(b2.asset_code === '' && b2.asset_code_name === '', 'a product without asset_code resolves to empty');

const blank3 = res.products[2];
ok(blank3.id === 3 && blank3.lines_count === 0 && blank3.system_qty === null && blank3.difference === null,
  'blank name/sku cannot join and shows no system balance', blank3);

const dup5 = res.products[3];
ok(dup5.name_ar === 'أ' && dup5.lines_count === 0 && dup5.current_qty === 0,
  'the duplicate name gets no lines — nothing is summed twice', dup5);
ok(res.duplicate_names.length === 1 && res.duplicate_names[0] === 'أ', 'the duplicated name is reported', res.duplicate_names);
ok(res.unmatched_count === 2, 'the unmatched lines (ج and blank name) are counted, not dropped', res.unmatched_count);

/* ── 2. MySQL down: the report must still render ──────────────────────────── */
console.log('\nMySQL-down fallback');
const down = runBalance({ products: PRODUCTS, current: CURRENT, mysqlDown: true });
ok(down.status === 'success', 'status stays success when the view throws');
ok(down.system_qty_error === true, 'system_qty_error is true so the page can say why');
ok(down.products[0].current_qty === 10 && down.products[0].total_cost_sign === 130, 'aggregation survives the outage');
ok(down.products.every(function (r) { return r.system_qty === null && r.difference === null; }),
  'every system_qty is null instead of a fabricated number');

/* ── 3. wiring: route, log table, registration ────────────────────────────── */
console.log('\nPAGE_ACCESS / ACTION_TABLES / register');
function grabBlock(marker) {
  const start = source.indexOf(marker);
  assert(start >= 0, 'missing block ' + marker);
  const end = source.indexOf('\n  };', start);
  assert(end > 0, 'unterminated block ' + marker);
  return source.slice(start, end + 4);
}
const accessBlock = grabBlock('const PAGE_ACCESS = {');
const tablesBlock = grabBlock('const ACTION_TABLES = {');
const names = new Set();
(tablesBlock.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || []).forEach(function (n) {
  if (n !== 'PAGE_ACCESS' && n !== 'ACTION_TABLES') names.add(n);
});
const decls = Array.from(names).map(function (n) { return 'const ' + n + " = '" + n + "';"; }).join('\n');
const wctx = { console: console };
vm.createContext(wctx);
vm.runInContext(accessBlock + '\n' + decls + '\n' + tablesBlock +
  '\n__out = { access: PAGE_ACCESS, tables: ACTION_TABLES };', wctx, { filename: 'wiring' });
const ACCESS = wctx.__out.access, TABLES = wctx.__out.tables;
ok(ACCESS.get_legal_stock_balance && ACCESS.get_legal_stock_balance.page === 'tc_budget_stock_balance' &&
  ACCESS.get_legal_stock_balance.access === 'read', 'PAGE_ACCESS gates the new action as read on this page',
  ACCESS.get_legal_stock_balance);
ok(TABLES.get_legal_stock_balance === 'LEGAL_PRODUCTS_SHEET/LEGAL_CURRENT_SHEET',
  'ACTION_TABLES declares both sheets for the SystemLog table column', TABLES.get_legal_stock_balance);
ok(source.indexOf("register('get_legal_stock_balance', getLegalStockBalance_);") !== -1,
  'the action is registered under its shipped name');
ok(source.indexOf("'get_legal_current_products': LEGAL_CURRENT_SHEET,") !== -1 &&
  source.indexOf('function getLegalCurrentProducts_') !== -1,
  'the old action is left in place for anything still on it');

/* ── 4. the page: new call, modal, parseable script ───────────────────────── */
console.log('\nPage template');
const page = S.read('Company_TopChemical_BudgetStockBalance.html');
ok(page.indexOf("companyCall('get_legal_stock_balance')") !== -1, 'page calls the new action');
ok(page.indexOf("'get_legal_current_products'") === -1, 'page no longer calls the raw action');
ok(page.indexOf("UIC.openModal('bal-lines-modal'") !== -1, 'page opens the per-product modal');
ok(page.indexOf("UIC.dataTable('bal-lines-table'") !== -1, 'modal body renders the correlated transaction lines');
ok(page.indexOf('transaction_code') !== -1 && page.indexOf('total_cost_sign') !== -1 && page.indexOf('system_qty') !== -1,
  'list/modal name the requested columns');
const blocks = S.scriptBlocks(page);
assert.ok(blocks.length > 0, 'page has an inline script');
blocks.forEach(function (b, i) {
  new vm.Script(S.stripScriptlets(b.body), { filename: 'Company_TopChemical_BudgetStockBalance.html#' + i });
});
checks++;
console.log('  PASS  every inline script block parses');

/* ── 5. the movement report moved into this page ──────────────────────────── */
console.log('\nMovement report wiring');
ok(ACCESS.get_legal_products_movement && ACCESS.get_legal_products_movement.page === 'tc_budget_stock_balance' &&
  ACCESS.get_legal_products_movement.access === 'read',
  'PAGE_ACCESS re-points get_legal_products_movement at this page', ACCESS.get_legal_products_movement);
ok(TABLES.get_legal_products_movement === 'LEGAL_MOVEMENT_SHEET',
  'ACTION_TABLES still logs the movement sheet', TABLES.get_legal_products_movement);
ok(source.indexOf("movement: 'tc_budget_stock_balance'") !== -1,
  'budget print authorizes the movement report against this page');
ok(!fs.existsSync(path.join(root, 'Company_TopChemical_BudgetStockMovement.html')),
  'the retired movement page file is gone');
const nav = S.read('Company_TopChemical_Nav.html');
const registry = S.read('Company_TopChemical_Registry.js');
ok(nav.indexOf('tc_budget_stock_movement') === -1, 'the nav no longer offers the movement page');
ok(registry.indexOf('tc_budget_stock_movement') === -1, 'the registry no longer routes the movement page');
ok(page.indexOf("companyCall('get_legal_products_movement'") !== -1, 'the balance page fetches the movement ledger');
ok(page.indexOf("UIC.dataTable('bal-movement-table'") !== -1, 'the popup renders the movement ledger table');
ok(page.indexOf('transaction_date_display') !== -1, 'the ledger shows the server-formatted date, not the raw ISO');
ok(page.indexOf('download=budget_print&type=movement') !== -1, 'the popup prints the movement report');

/* ── 6. budgetDateDisplay_ — the one date formatter for movement ──────────── */
console.log('\nbudgetDateDisplay_');
function grabGlobal(name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing global ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error('unterminated ' + name);
}
const TZ = 'Africa/Cairo';
const fmt = function (d, tz, f) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce(function (a, p) { a[p.type] = p.value; return a; }, {});
  const hm = (parts.hour === '24' ? '00' : parts.hour) + ':' + parts.minute;
  return f === 'HH:mm' ? hm : parts.year + '-' + parts.month + '-' + parts.day;
};
const dctx = { console, Date, Object, String, Number, isNaN, isFinite, Utilities: { formatDate: fmt } };
vm.createContext(dctx);
vm.runInContext(grabGlobal('budgetDateDisplay_') + '\nthis.__f = budgetDateDisplay_;', dctx);
const fd = dctx.__f;
ok(fd(new Date(2026, 4, 6, 0, 0, 0)) === '2026-05-06', 'a midnight Date renders date-only');
ok(fd(new Date(2026, 4, 6, 14, 32)) === '2026-05-06 14:32', 'a Date with a time keeps it');
ok(fd('2026-05-06') === '2026-05-06', 'a date-only string stays opaque');
ok(fd('2026-05-06 14:32') === '2026-05-06 14:32', 'a naked datetime is kept as written');
const isoExpectedDay = fmt(new Date('2026-05-05T21:00:00.000Z'), TZ, 'yyyy-MM-dd');
ok(fd('2026-05-05T21:00:00.000Z') === isoExpectedDay,
  'a UTC ISO datetime renders as its Cairo wall date (' + isoExpectedDay + ')', fd('2026-05-05T21:00:00.000Z'));
ok(fd('2026-05-05T21:00:00.000Z').indexOf('T') === -1, 'and never leaks the ISO form');
ok(source.indexOf('esc(budgetDateDisplay_(r.transaction_date)') !== -1,
  'the movement print uses the same formatter');

console.log('\nMovement rows carry transaction_date_display');const mv = runMovementFixture({
  rows: [{ transaction_code: 'M1', product: 'أ', transaction_date: '2026-05-05T21:00:00.000Z', qty: 5, transaction_sign: -1 }],
  product: 'أ'
});
ok(mv.items.length === 1 && mv.items[0].transaction_date === '2026-05-05T21:00:00.000Z',
  'the raw transaction_date is preserved for consumers', mv.items[0]);
ok(mv.items[0].transaction_date_display === isoExpectedDay,
  'transaction_date_display is the wall date', mv.items[0].transaction_date_display);

function runMovementFixture(fixture) {
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, isNaN, isFinite,
    LEGAL_MOVEMENT_SHEET: 'legal_products_movement',
    getAllRecords_: function () { return fixture.rows; },
    budgetDateDisplay_: fd
  };
  vm.createContext(ctx);
  vm.runInContext(grabNested('getLegalProductsMovement_') + '\nthis.__run = getLegalProductsMovement_;', ctx);
  return ctx.__run({ product: fixture.product || '', limit: 500 }, {}, 'db');
}

/* ── 7. update_legal_product_ — the chart reference write ─────────────────── */
console.log('\nupdate_legal_product_ — asset_code is a chart_of_accounts reference');
function runUpdate(fixture) {
  const rows = fixture.rows.map(function (r) { return r.slice(); });
  const writes = [];
  const busts = [];
  const sheet = {
    getDataRange: function () { return { getValues: function () { return rows.map(function (r) { return r.slice(); }); } }; },
    getRange: function (row, col) {
      return { setValue: function (v) { writes.push({ row: row, col: col, value: v }); rows[row - 1][col - 1] = v; } };
    }
  };
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, isNaN, isFinite,
    LEGAL_PRODUCTS_SHEET: 'legal_products',
    getSheet_: function () { return sheet; },
    getHeaders_: function () { return fixture.headers; },
    executeWithLock_: function (fn) { return fn(); },
    noteMutation_: function () {},
    logHistory_: function () {},
    bustTcRefs_: function () { busts.push(1); },
    tcAssetCodeRefs_: function () { return ASSET_REFS; }
  };
  vm.createContext(ctx);
  vm.runInContext(grabNested('updateLegalProduct_') + '\nthis.__run = updateLegalProduct_;', ctx);
  let res = null, err = null;
  try { res = ctx.__run({ id: fixture.id, asset_code: fixture.code }, { email: 'u@example.test' }, 'db'); }
  catch (e) { err = e; }
  return { res: res, err: err, writes: writes, busts: busts };
}
const HEADERS = ['id', 'name_ar', 'asset_code'];
const ROWS = [HEADERS.slice(), [1, 'أ', ''], [2, 'ب', '114100']];
const setCode = runUpdate({ headers: HEADERS, rows: ROWS, id: 1, code: '114100' });
ok(setCode.err === null && setCode.res.status === 'success', 'setting a valid level-5 code succeeds');
ok(setCode.writes.length === 1 && setCode.writes[0].row === 2 && setCode.writes[0].col === 3 && setCode.writes[0].value === '114100',
  'the code is written into asset_code on the product row', setCode.writes);
ok(setCode.res.record.asset_code_name === 'أصول', 'the reply carries the resolved name');
ok(setCode.busts.length === 1, 'a successful write busts the tcRefs_ cache');
const cleared = runUpdate({ headers: HEADERS, rows: ROWS, id: 2, code: '' });
ok(cleared.err === null && cleared.writes.length === 1 && cleared.writes[0].value === '',
  'an empty value clears the reference');
const badCode = runUpdate({ headers: HEADERS, rows: ROWS, id: 1, code: '999999' });
ok(badCode.err && /شجرة الحسابات/.test(badCode.err.message), 'a code chart_of_accounts does not own is refused', badCode.err && badCode.err.message);
const badId = runUpdate({ headers: HEADERS, rows: ROWS, id: 99, code: '114100' });
ok(badId.err && /الصنف غير موجود/.test(badId.err.message), 'an unknown product is refused', badId.err && badId.err.message);
ok(ACCESS.update_legal_product && ACCESS.update_legal_product.page === 'tc_budget_stock_balance' &&
  ACCESS.update_legal_product.access === 'write', 'PAGE_ACCESS gates the write on this page', ACCESS.update_legal_product);
ok(TABLES.update_legal_product === 'LEGAL_PRODUCTS_SHEET', 'ACTION_TABLES logs the products sheet', TABLES.update_legal_product);
ok(source.indexOf("register('update_legal_product', updateLegalProduct_);") !== -1, 'the write action is registered');
ok(page.indexOf('bal-asset-code') !== -1 && page.indexOf("companyCall('update_legal_product'") !== -1,
  'the popup offers the chart select and saves through the new action');
ok(page.indexOf('asset_code_name') !== -1, 'the list shows the resolved level-5 name');

console.log('\nAll ' + checks + ' checks pass.');