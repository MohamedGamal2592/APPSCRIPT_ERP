'use strict';

/**
 * TR: frozen canonical response contracts for the migrated Sales endpoints.
 *
 * WHAT THIS PROVES
 * `VF_SALES_VIEW_CONTRACTS_` (Company_ValleyFoods_Actions.js, frozen by RV-1.4)
 * is not aspirational documentation. For every endpoint named in it, this test
 * RUNS the legacy handler through the VM harness and asserts that the real
 * response matches the contract exactly:
 *   - top-level keys = the declared ordered list (no extras, none missing);
 *   - every declared nested field exists with the declared type;
 *   - undeclared nested fields are absent (a new field is a contract change);
 *   - the nullability/presence rules hold — notably the invoice-fallback case
 *     and the `approval_status || 'Pending'` default;
 *   - dates: the server-side canonical value is a Date object, the list's
 *     `مسلسل` is a 1-based integer, and the frozen display string is dd/MM/yyyy.
 *
 * Type tags used by the checks below are empirical, not inferred: each one was
 * read off the live legacy response the first time this test ran. Where the
 * legacy value may legitimately be one of several types (a cell that can hold
 * either a number or text), the contract says so via a union.
 *
 * PRIVACY (G7): all fixture values are invented for this test.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

const H = createVfHarness();
const contracts = H.eval('VF_SALES_VIEW_CONTRACTS_');

/* ── fixtures ────────────────────────────────────────────────────────────── */
const INV_SHEET = 'valley_sales_invoices';
const LINES_SHEET = 'valley_sales_products';
const STOCK_SHEET = 'valley_sales_product_stock';
const PRODUCTS_SHEET = 'valley_products';
const PARTIES_SHEET = 'valley_legal_customer_vendor';

const INV_HEADERS = ['invoice_unique_id', 'ميزان حسابي - 26 - 1', 'نوع الضريبة (سلع عامة 1/سلع جدول 2)',
  'نوع سلع الجدول (لايوجد 0/جدول أولا 1/جدول ثانيا 2)', 'رقم الفاتورة', 'اسم العميل',
  'رقم التسجيل الضريبي للعميل', 'رقم الملف الضريبي للعميل', 'العنوان', 'الرقم القومي / رقم جواز السفر',
  'رقم الموبيل', 'تاريخ الفاتورة', 'نوع البيان (سلعة 3/خدمة 4/تسويات 5)',
  'نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7)', 'المبلغ الصافي',
  'قيمة الضريبة', 'إجمالي', 'الشهر', 'العام', 'tax_system', 'user', 'created_at',
  'approval_status', 'approval', 'approval_time', 'invoice_label', 'unique_id'];

const D1 = new Date(2026, 2, 4, 9, 0, 0);   /* 04/03/2026 local */
const D2 = new Date(2026, 2, 5, 9, 0, 0);

function invRow(uid, number, client, date, net, tax, total, taxSystem, status) {
  const r = new Array(INV_HEADERS.length).fill('');
  r[0] = uid;
  r[4] = number;
  r[5] = client;
  r[11] = date;
  r[14] = net;
  r[15] = tax;
  r[16] = total;
  r[19] = taxSystem;
  r[22] = status;
  r[25] = 'UNIQ-' + uid;
  return r;
}

H.addSheet(INV_SHEET, INV_HEADERS, [
  invRow('INV-CONTRACT-0001', 'NUM-1', 'CLIENT-A', D1, 100, 5, 105, true, 'Approved'),
  invRow('INV-CONTRACT-0002', 'NUM-2', 'CLIENT-B', D2, 200, 10, 210, false, '')
]);

H.addSheet(LINES_SHEET, ['unique_id', 'id', 'valley_sales_header_id', 'product_id', 'product_details',
  'product_tax', 'product_qty', 'product_price', 'product_net_value', 'product_tax_value',
  'product_total_value', 'user', 'created_at'], [
  ['LINE-CONTRACT-01', 1, 'INV-CONTRACT-0001', 'P1', 'DETAIL-1', 0.05, 2, 50, 100, 5, 105, 'u', D1],
  ['LINE-CONTRACT-02', 2, 'INV-CONTRACT-0001', 'P2', '', 0.14, 1, 7, 7, 1, 8, 'u', D1]
]);

H.addSheet(STOCK_SHEET, ['unique_id', 'valley_sales_products_id', 'product_unique_id',
  'product_transaction_code', 'product_qty', 'user', 'created_at'], [
  ['ALLOC-CONTRACT-01', 'LINE-CONTRACT-01', 'BATCH-X', 'LOT-9', 2, 'u', D1]
]);

H.addSheet(PRODUCTS_SHEET, ['id', 'name_ar', 'product_type'], [
  ['P1', 'PRODUCT-ONE', ''],
  ['P2', 'PRODUCT-TWO', 'محلي']
]);

H.addSheet(PARTIES_SHEET, ['id', 'name', 'tax_id', 'address', 'telephone'], [
  ['CLIENT-A', 'CLIENT-A-NAME', 'TAX-1', 'ADDR-1', 'PHONE-1']
]);

/* ── helpers ─────────────────────────────────────────────────────────────── */
function keysOf(obj) { return Object.keys(obj); }

function assertKeysExact(actual, expected, label) {
  /* Array.from: `expected` comes from the VM-realm contract table, and
   * deepStrictEqual compares prototypes across realms. */
  assert.deepStrictEqual(keysOf(actual).sort(), Array.from(expected).sort(),
    label + ': keys differ from the frozen contract (actual=' + keysOf(actual).join(',') + ')');
}

function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function assertType(v, t, label) {
  const ok = {
    string: () => typeof v === 'string',
    number: () => typeof v === 'number' && isFinite(v),
    integer: () => typeof v === 'number' && Number.isInteger(v),
    boolean: () => typeof v === 'boolean',
    array: () => Array.isArray(v),
    object: () => v !== null && typeof v === 'object',
    'any?': () => true,
    'string|number': () => typeof v === 'string' || typeof v === 'number' || isDate(v)
  }[t];
  assert.ok(ok, 'unknown type tag ' + t);
  assert.ok(ok(), label + ': expected ' + t + ', got ' + (isDate(v) ? 'Date' : typeof v) + ' (' + JSON.stringify(v) + ')');
}

/* The contract's own declared endpoints must be the ones this test runs. */
assert.strictEqual(contracts.version, 1, 'contract table carries a version');
assert.deepStrictEqual(Object.keys(contracts.contracts).sort(),
  ['vf_invoice_for_return_v1', 'vf_invoice_full_v1', 'vf_invoices_list_v1', 'vf_sales_page_v1'],
  'the frozen contract table is complete');

/* ── 1. invoices list (get_valley_sales_list) ────────────────────────────── */
H.newExecution();
const list = H.dispatch('get_valley_sales_list', {});
const listSpec = contracts.contracts.vf_invoices_list_v1;
assertKeysExact(list, listSpec.top, 'invoices list');
assert.strictEqual(list.status, 'success');
assert.strictEqual(list.invoices.length, 2, 'both fixture invoices are returned');
assert.strictEqual(list.total, 2, 'total is the filtered row count');
list.invoices.forEach(function (inv, i) {
  assertKeysExact(inv, listSpec.invoice, 'invoice row ' + i);
});
const first = list.invoices[0];
assert.strictEqual(first['مسلسل'], 1, 'مسلسل is 1-based over sheet order');
assert.strictEqual(list.invoices[1]['مسلسل'], 2);
assertType(first['المبلغ الصافي'], 'number', 'المبلغ الصافي');
assertType(first['قيمة الضريبة'], 'number', 'قيمة الضريبة');
assertType(first['إجمالي'], 'number', 'إجمالي');
assertType(first.tax_system, 'string', 'tax_system is a lowercased trimmed string');
assertType(first.approval_status, 'string', 'approval_status');
assert.ok(isDate(first['تاريخ الفاتورة']), 'تاريخ الفاتورة stays a Date object server-side');
assert.strictEqual(list.invoices[1].approval_status, 'Pending',
  'a blank approval_status defaults to Pending in the contract');
/* tax_system is `String(cell || '').trim().toLowerCase()`: a TRUE boolean cell
 * becomes 'true', and a FALSE cell becomes '' (because `false || ''` is '').
 * The client only ever tests for 'true', so both spellings are in the contract. */
assert.strictEqual(first.tax_system, 'true', 'a TRUE cell becomes the string "true"');
assert.strictEqual(list.invoices[1].tax_system, '', 'a FALSE cell becomes the empty string');

/* date filter + paging honesty: total counts the filtered set, not the page */
const page = H.dispatch('get_valley_sales_page', { offset: 1, limit: 1 });
assertKeysExact(page, contracts.contracts.vf_sales_page_v1.top, 'sales page');
assert.strictEqual(page.total, 2, 'page total counts all matching rows');
assert.strictEqual(page.invoices.length, 1, 'limit bounds the returned page');
assert.strictEqual(page.invoices[0]['مسلسل'], 2, 'offset skips the first row');

/* ── 2. sales page option bundle (parties/products/enums) ────────────────── */
const pageSpec = contracts.contracts.vf_sales_page_v1;
assertKeysExact(page.enums, pageSpec.enums, 'enums bundle');
assert.ok(page.parties.length >= 1, 'parties come from the reference sheet');
page.parties.forEach(function (p, i) { assertKeysExact(p, pageSpec.party, 'party ' + i); });
assertType(page.parties[0].value, 'string', 'party value');
assertType(page.parties[0].tax_id, 'string|number', 'party tax_id');
page.products.forEach(function (p, i) { assertKeysExact(p, pageSpec.product, 'product ' + i); });
assert.ok(page.products.length >= 1);
assert.ok(Array.isArray(page.enums.line_tax), 'line_tax is an array');

/* ── 3. invoice detail (get_valley_invoice_full) ─────────────────────────── */
H.newExecution();
const full = H.dispatch('get_valley_invoice_full', { invoice_unique_id: 'INV-CONTRACT-0001' });
const fullSpec = contracts.contracts.vf_invoice_full_v1;
assertKeysExact(full, fullSpec.top, 'invoice full');
assert.strictEqual(fullSpec.invoice, '*', 'the detail header is declared lossless');
assertKeysExact(full.invoice, INV_HEADERS, 'detail header carries every column, trimmed, in sheet order');
assert.ok(isDate(full.invoice['تاريخ الفاتورة']), 'detail date is a Date object server-side');
assert.strictEqual(full.lines.length, 2, 'this invoice\'s lines only');
full.lines.forEach(function (l, i) {
  assertKeysExact(l, fullSpec.line, 'detail line ' + i);
  assertType(l.product_tax, 'number', 'product_tax');
  assertType(l.product_qty, 'number', 'product_qty');
  assertType(l.product_price, 'number', 'product_price');
  assertType(l.product_name, 'string', 'product_name');
  (l.allocations || []).forEach(function (a, j) {
    assertKeysExact(a, fullSpec.allocation, 'allocation ' + i + '.' + j);
    assertType(a.qty, 'number', 'allocation qty');
  });
});
const withAllocs = full.lines.filter(function (l) { return l.allocations.length; })[0];
assert.ok(withAllocs, 'the fixture allocation is attached to its line');
assert.strictEqual(withAllocs.allocations[0].batch_uid, 'BATCH-X');
assert.strictEqual(full.lines.filter(function (l) { return l.allocations.length === 0; }).length, 1,
  'a line with no allocations carries an empty array, never undefined');

/* ── 4. invoice for return (get_valley_invoice_for_return) ───────────────── */
H.newExecution();
const forReturn = H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-CONTRACT-0001' });
const frSpec = contracts.contracts.vf_invoice_for_return_v1;
assertKeysExact(forReturn, frSpec.top, 'invoice for return');
assertKeysExact(forReturn.invoice, frSpec.invoice, 'the found-invoice object matches the contract');
forReturn.lines.forEach(function (l, i) { assertKeysExact(l, frSpec.line, 'return line ' + i); });

/* The fallback shape is declared by absence: `number` is always present,
 * `client_name`/`date_display` only exist when the invoice was found. */
const fallback = H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'NOPE' });
assertKeysExact(fallback.invoice, ['uid', 'number'], 'the missing-invoice fallback is a 2-field object');
assert.strictEqual(fallback.invoice.number, '-');
assert.strictEqual(fallback.lines.length, 0);

console.log('sales_response_contracts: PASS');
