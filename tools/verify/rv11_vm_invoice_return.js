'use strict';

/**
 * TR: RV-1.1 defect regression — VM execution of `get_valley_invoice_for_return`.
 *
 * WHY THIS TEST IS DIFFERENT FROM `rv11_invoice_return_contract.js`
 * That guard reads source text; this file RUNS the handler. The approval
 * condition on RV-1.1 (DEC-1) was that a focused defect regression test asserts
 * the *new* contract after the fix — and the plan (§7.5) requires that the claim
 * "the handler executes" be executable evidence, not an inspection. So the
 * handler is dispatched through the module's own `ValleyFoods.dispatch_`
 * against fixture rows and its returned value is asserted field by field.
 *
 * WHAT IS ASSERTED
 *   1. found-invoice case  — all four invoice fields are populated from the row
 *      (uid, number, client_name, date_display in dd/MM/yyyy), plus the line
 *      arithmetic (sold/returned/returnable) and product-name join;
 *   2. missing-invoice case — `invoice` degrades to `{ uid, number: '-' }` and
 *      the sold lines are still returned (the pre-fix path, preserved);
 *   3. that the handler really ran: the workbook stub observed values reads and
 *      the dispatch surface is the module's own.
 *
 * PRIVACY (G7): every fixture value below is invented for this test. No raw
 * business value appears in this file or in any record derived from it.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

/* "Test the test" seam: point this at a historical revision of the module (an
 * absolute temp path, never a repo file) to prove the assertions below fail on
 * the defective source. `git show 815c6c7^:Company_ValleyFoods_Actions.js`. */
const H = createVfHarness(process.env.RV11_SERVER
  ? { sources: ['Core_FastSave.js', process.env.RV11_SERVER] }
  : {});

const LINES_SHEET = 'valley_sales_products';
const RETURNS_SHEET = 'valley_sales_returns';
const PRODUCTS_SHEET = 'valley_products';
const INVOICES_SHEET = 'valley_sales_invoices';

const INV_UID = 'INVUID-TEST-0001';
const MISSING_UID = 'INVUID-TEST-9999';
const LINE_UID = 'LINEUID-TEST-0001';

const LINES_HEADERS = ['unique_id', 'valley_sales_header_id', 'product_id', 'product_details', 'product_price', 'product_qty'];
const RETURNS_HEADERS = ['unique_id', 'valley_sales_products_id', 'valley_return_qty'];
const PRODUCTS_HEADERS = ['id', 'name_ar'];
const INVOICES_HEADERS = ['invoice_unique_id', 'رقم الفاتورة', 'اسم العميل', 'تاريخ الفاتورة'];

const FIXTURE_DATE = new Date(2026, 0, 15, 10, 30, 0);   /* 15/01/2026 local */

H.addSheet(LINES_SHEET, LINES_HEADERS, [
  [LINE_UID, INV_UID, 'P1', 'TEST DETAILS', 25, 10],
  ['LINEUID-TEST-0002', INV_UID, 'P2', '', 5, 4],
  ['LINEUID-OTHER-0001', 'INVUID-OTHER', 'P1', '', 9, 9]
]);

H.addSheet(RETURNS_SHEET, RETURNS_HEADERS, [
  ['RETUID-TEST-0001', LINE_UID, 3],
  ['RETUID-TEST-0002', LINE_UID, 2]
]);

H.addSheet(PRODUCTS_SHEET, PRODUCTS_HEADERS, [
  ['P1', 'PRODUCT-ONE'],
  ['P2', 'PRODUCT-TWO']
]);

H.addSheet(INVOICES_SHEET, INVOICES_HEADERS, [
  ['INVUID-OTHER', 'OTHER-NUM', 'OTHER-CLIENT', FIXTURE_DATE],
  [INV_UID, '  TEST-INV-0001  ', 'TEST-CLIENT', FIXTURE_DATE]
]);

/* ── case 1: invoice found ───────────────────────────────────────────────── */
H.newExecution();
H.resetStats();
const found = H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: INV_UID });

assert.strictEqual(found.status, 'success', 'handler returns success');
assert.ok(found.invoice, 'invoice object is present (pre-fix it was always null)');
assert.strictEqual(found.invoice.uid, INV_UID, 'uid is the inbound invoice identity');
/* The canonical contract is the header value VERBATIM: `String(s[header] || '')`,
 * no trim. RV-1.1's ledger wording said "trimmed"; the code never trimmed, and
 * the padded fixture below proves which one the contract freezes. The wording is
 * corrected by a later record rather than by a second unapproved edit to the
 * legacy handler. */
assert.strictEqual(found.invoice.number, '  TEST-INV-0001  ', 'number is the header value, verbatim');
assert.strictEqual(found.invoice.client_name, 'TEST-CLIENT', 'client_name comes from the header row');
assert.strictEqual(found.invoice.date_display, '15/01/2026', 'date_display is dd/MM/yyyy');

assert.strictEqual(found.lines.length, 2, 'only this invoice\'s lines are returned');
const line1 = found.lines.filter(function (l) { return l.line_uid === LINE_UID; })[0];
assert.ok(line1, 'the line is present');
assert.strictEqual(line1.product_name, 'PRODUCT-ONE', 'product name join works');
assert.strictEqual(line1.details, 'TEST DETAILS');
assert.strictEqual(line1.price, 25);
assert.strictEqual(line1.sold_qty, 10);
assert.strictEqual(line1.returned_qty, 5, 'returns are summed per line across multiple return rows');
assert.strictEqual(line1.returnable, 5, 'returnable = sold - returned, floored at 0');
const line2 = found.lines.filter(function (l) { return l.line_uid === 'LINEUID-TEST-0002'; })[0];
assert.strictEqual(line2.returned_qty, 0, 'a line with no returns reports zero');
assert.strictEqual(line2.returnable, 4);

const foundStats = H.stats();
assert.ok(foundStats.rangeReads > 0, 'the handler executed real range reads (VM, not inspection)');
assert.ok(H.sheetsReadCount() > 0, 'the project\'s own read counter advanced');

/* ── case 2: invoice missing ─────────────────────────────────────────────── */
H.newExecution();
H.resetStats();
const missing = H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: MISSING_UID });

assert.strictEqual(missing.status, 'success');
/* Field-by-field, not deepStrictEqual: the value was built inside the VM
 * realm, so its prototype is the VM's Object.prototype, not this file's. */
assert.strictEqual(missing.invoice.uid, MISSING_UID, 'the fallback carries the requested uid');
assert.strictEqual(missing.invoice.number, '-', 'the fallback number is a dash');
assert.strictEqual(Object.keys(missing.invoice).length, 2, 'no other fields leak into the fallback');
assert.strictEqual(missing.lines.length, 0, 'no lines belong to the unknown invoice');

/* ── case 3: the dispatch surface is the module's own ────────────────────── */
assert.strictEqual(typeof H.valleyFoods.dispatch_, 'function', 'dispatch_ is exported by the module');
assert.strictEqual(typeof H.valleyFoods.pageForAction_, 'function', 'pageForAction_ is exported');
assert.throws(function () { H.dispatch('__no_such_action__', {}); },
  /Unknown Valley Foods action/, 'unknown actions are refused by the real dispatcher');
assert.throws(function () { H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: '' }); },
  /اختر الفاتورة/, 'the handler\'s own validation runs (empty invoice id refused)');

console.log('rv11_vm_invoice_return: PASS');
