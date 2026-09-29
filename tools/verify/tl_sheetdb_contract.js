'use strict';

/**
 * Top Light sheets-as-database contract.
 *
 * The Top Light tables are written as a database of VALUES: no write path may
 * place a formula in a cell, records are addressed by business key (never by
 * row number), deletes are soft, and derived columns are computed in script.
 *
 * This runs the REAL Code.js and the REAL Company_TopLight_Actions.js against
 * an in-memory workbook. Nothing here touches a spreadsheet, a Google service
 * or the network.
 */

const assert = require('assert');
const path = require('path');
const gasstub = require('./gasstub');
const workbookStub = require('./vf_workbook_stub');

const DB = 'tl-sheetdb-db';
const wb = workbookStub.createWorkbookStub();
wb.createSpreadsheet(DB, []);
const H = gasstub.createHarness({ workbook: wb, sources: ['Company_TopLight_Actions.js'] });
const TL = H.eval('TopLight');
const book = wb.openById(DB);

/* A write must invalidate the request-local record cache exactly as the real
 * noteMutation_ does, otherwise a read after a write in the same execution
 * would be served from the pre-write memo. */
H.override('noteMutation_', function () { try { H.ctx.resetRecordCache_(); } catch (e) {} });
H.override('getCompanySpreadsheetId_', function () { return DB; });

function seed(name, headers, rows) {
  const sheet = book.getSheetByName(name) || book.addSheet(name);
  sheet.__setRows([headers.slice()].concat((rows || []).map(function (r) { return r.slice(); })));
  return sheet;
}
function formulasOf(name) {
  return book.getSheetByName(name).getFormulas().reduce(function (all, row) { return all.concat(row); }, []).filter(function (f) { return f !== ''; });
}
function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
const USER = { email: 'user@test' };
let failed = 0;
function ok(value, message) {
  console.log((value ? '  PASS  ' : '  FAIL  ') + message);
  if (!value) failed++;
}
function throwsWith(fn, re, message) {
  let threw = false;
  try { fn(); } catch (e) { threw = re.test(String(e && e.message)); }
  ok(threw, message);
}

/* ── 1. products: create stores values, allocates id, stamps audit columns ── */
const PRODUCT_HEADERS = ['id', 'name_ar', 'name_en', 'category', 'unit', 'carton', 'sales_tax', 'asset_code', 'user', 'created_at'];
seed('top_light_products', PRODUCT_HEADERS);
const created = TL.repo_.create(DB, 'top_light_products', { name_ar: 'منتج أ', unit: 'كرتونة' }, { user: USER });
const productSheet = book.getSheetByName('top_light_products');
const productHeaders = productSheet.__headerRow();
ok(created.assignedId === 1, 'create assigns the next id (1)');
ok(created.record.name_ar === 'منتج أ' && created.record.unit === 'كرتونة', 'payload values land on the row');
ok(created.record.user === 'user@test', 'audit user is stamped from the acting user');
ok(isDate(created.record.created_at), 'created_at is a real date value');
ok(created.record.deleted_at === '' && created.record.deleted_by === '', 'soft-delete columns start blank');
ok(Number(created.record.version) === 0, 'version starts at 0');
ok(productHeaders.indexOf('deleted_at') !== -1 && productHeaders.indexOf('deleted_by') !== -1 && productHeaders.indexOf('version') !== -1, 'audit columns are ensured on the sheet');
ok(productSheet.getLastRow() === 2, 'one data row was appended');

/* ── 2. required-field gate ───────────────────────────────────────────────── */
throwsWith(function () { TL.repo_.create(DB, 'top_light_products', { unit: 'x' }, {}); }, /Missing required fields: name_ar/, 'create refuses a missing required field');
throwsWith(function () { TL.repo_.create(DB, 'top_light_customer_vendor', {}, {}); }, /Missing required fields: name/, 'parties require a name');

/* ── 3. patch is key-addressed, partial and version-bumping ───────────────── */
const patched = TL.repo_.patch(DB, 'top_light_products', 1, { name_en: 'Product A' }, { keyField: 'id', user: USER });
ok(patched && patched.rowNumber === 2, 'patch locates the row by business key');
ok(patched.record.name_en === 'Product A', 'patched column changed');
ok(patched.record.name_ar === 'منتج أ', 'untouched columns survive the patch');
ok(Number(patched.record.version) === 1, 'patch bumps version');
ok(patched.oldRecord.name_en === '' && patched.oldRecord.version === 0, 'old record snapshot is pre-write');
throwsWith(function () { TL.repo_.patch(DB, 'top_light_products', 1, { name_en: 'x' }, { keyField: 'id', version: 0 }); }, /CONFLICT/, 'stale version is refused (optimistic concurrency)');
ok(TL.repo_.patch(DB, 'top_light_products', 999, { name_en: 'x' }, { keyField: 'id' }) === null, 'missing key returns null, not a silent success');

/* ── 4. soft delete keeps the row and hides it from every list read ───────── */
const deleted = TL.repo_.softDelete(DB, 'top_light_products', 1, { user: USER });
ok(deleted && String(deleted.record.deleted_at) !== '' && deleted.record.deleted_by === 'user@test', 'soft delete stamps deleted_at/deleted_by');
ok(TL.repo_.list(DB, 'top_light_products').length === 0, 'list excludes the deleted record');
ok(H.call('getAllRecords_', DB, 'top_light_products').length === 1, 'the physical row is still there (nothing shifted)');
throwsWith(function () { TL.repo_.patch(DB, 'top_light_products', 1, { name_en: 'x' }, { keyField: 'id' }); }, /deleted/, 'patching a deleted record is refused');

/* ── 5. sales lines: derived columns are computed values ──────────────────── */
seed('top_light_sales_products', ['unique_id', 'id', 'top_lightsales_header_id', 'top_lightsales_invoices_client', 'product_id', 'product_tax', 'product_qty', 'product_price', 'product_discount', 'product_net_value', 'product_tax_value', 'product_total_value', 'user', 'created_at']);
const line = TL.repo_.create(DB, 'top_light_sales_products', {
  unique_id: 'LINE-1', top_lightsales_header_id: 'INV-1', product_id: 7,
  product_tax: 0.14, product_qty: 2, product_price: 100, product_discount: 5
}, { user: USER });
ok(line.record.product_net_value === 200, 'product_net_value = qty * price');
ok(Math.abs(line.record.product_tax_value - 28) < 1e-9, 'product_tax_value = net * tax');
ok(Math.abs(line.record.product_total_value - 223) < 1e-9, 'product_total_value = net - discount + tax');

/* ── 6. purchasing header: derived columns mirror the old formulas ────────── */
seed('top_light_purchasing_costing', ['unique_id', 'code', 'reciept date', 'items', 'type', 'shipping type', 'value', 'currency', 'exchange rate', 'importation re-price', 'administrative expenses', 'customs expenses', 'purchase tax', 'internal cost adjustment', 'total costs', 'month', 'year', 'value based on invoice', 'cif insurance rate', 'tax type', 'sales value', 'sales tax amount']);
const ph = TL.repo_.create(DB, 'top_light_purchasing_costing', {
  unique_id: 'PU-1', code: 'C-1', 'reciept date': '2026-03-15', type: 'شراء',
  value: 100, 'exchange rate': 2, 'administrative expenses': 10,
  'customs expenses': 5, 'purchase tax': 4, 'importation re-price': 50
}, { user: USER });
ok(Math.abs(ph.record['value based on invoice'] - 200) < 1e-9, 'value based on invoice = value * rate');
ok(Math.abs(ph.record['total costs'] - 219) < 1e-9, 'total costs sums the expense block plus purchase tax');
ok(ph.record.month === 3 && ph.record.year === 2026, 'month/year derive from the receipt date');
ok(Math.abs(ph.record['tax type'] - (4 / 55)) < 1e-12, 'tax type = purchase tax / (re-price + customs)');
ok(ph.record['sales value'] === 0, 'sales value is 0 for a non-بيع document');
ok(ph.record['sales tax amount'] === 0, 'sales tax amount is 0 below the 0.06 threshold');
const phSale = TL.repo_.create(DB, 'top_light_purchasing_costing', {
  unique_id: 'PU-2', code: 'C-2', 'reciept date': '2026-04-01', type: 'بيع',
  value: 100, 'exchange rate': 1, 'purchase tax': 14, 'importation re-price': 100
}, {});
ok(phSale.record['sales value'] === 100, 'sales value rounds total costs * 1.03 to hundreds');
ok(Math.abs(phSale.record['sales tax amount'] - 14) < 1e-9, 'sales tax amount = sales value * 14% above threshold');

/* ── 7. purchasing lines: total_cost/unit_cost/movement_code/sales amounts ── */
seed('top_light_product_purchasing', ['unique_id', 'id', 'top_light_purchasing_costing_id', 'product', 'qty', 'unit_price', 'other_cost', 'sales_value', 'movement_type', 'receipt_date', 'exchange_rate', 'total_cost', 'unit_cost', 'movement_code', 'sales_value_amount', 'sales_qty', 'cost_currency']);
const liveProduct = TL.repo_.create(DB, 'top_light_products', { name_ar: 'منتج حي' }, { user: USER });
const pl = TL.repo_.create(DB, 'top_light_product_purchasing', {
  unique_id: 'PL-1', top_light_purchasing_costing_id: 'PU-1', product: liveProduct.assignedId,
  qty: 4, unit_price: 25, other_cost: 10, sales_value: 30,
  movement_type: 'شراء', receipt_date: '2026-03-15', exchange_rate: 2
}, {});
ok(Math.abs(pl.record.total_cost - (4 * 25 * 2 + 10)) < 1e-9, 'total_cost = qty*price*rate + other');
ok(Math.abs(pl.record.unit_cost - (210 / 4)) < 1e-9, 'unit_cost = total_cost / qty');
ok(pl.record.sales_value_amount === 120, 'sales_value_amount = sales_value * qty');
ok(pl.record.sales_qty === 4, 'sales_qty mirrors qty');
ok(pl.record.movement_code === 'شراء-1-منتج حي-15/03/2026', 'movement_code concatenates type-id-product-date');

/* ── 8. cash: signed balances, running box balance, vendor lookup ─────────── */
seed('top_light_customer_vendor', ['id', 'name', 'customer_direction', 'type', 'country', 'region', 'registration_number', 'tax_id', 'name_en', 'telephone', 'address', 'user', 'created_at'], [[5, 'Vendor A', 'vendor', '', '', '', '', '', '', '', '', '', '']]);
seed('top_light_cash_bank_movement', ['transaction_id', 'invoice_id', 'name', 'transaction_purchasing_items', 'transaction_details', 'transaction_date', 'transaction_amount', 'total_discount', 'taxes', 'transaction_type', 'related_box', 'chart_code', 'transaction_method', 'tax_system', 'approved', 'currency', 'exchange_rate', 'net_amount', 'total', 'balance_amount', 'box_balance', 'name_vendor', 'chart_name', 'chart_account_main', 'user', 'created_at']);
const c1 = TL.repo_.create(DB, 'top_light_cash_bank_movement', {
  transaction_id: 1, name: 5, transaction_details: 'قبض', transaction_date: '2026-09-01',
  transaction_amount: 100, transaction_type: 'Debit', related_box: '111101',
  chart_code: '', transaction_method: 'نقدي', currency: 'EGP', exchange_rate: 1
}, { user: USER });
ok(Math.abs(c1.record.total - 100) < 1e-9, 'cash total = (amount - discount) * rate + taxes * rate');
ok(Math.abs(c1.record.balance_amount - 100) < 1e-9, 'debit rows carry a positive balance');
ok(Math.abs(c1.record.box_balance - 100) < 1e-9, 'box_balance starts from the first row of the box');
ok(c1.record.name_vendor === 'Vendor A', 'name_vendor resolves the party name');
const c2 = TL.repo_.create(DB, 'top_light_cash_bank_movement', {
  transaction_id: 2, name: 5, transaction_details: 'صرف', transaction_date: '2026-09-02',
  transaction_amount: 40, transaction_type: 'Credit', related_box: '111101',
  chart_code: '', transaction_method: 'تحويل بنكي', currency: 'EGP', exchange_rate: 1
}, { user: USER });
ok(Math.abs(c2.record.balance_amount + 40) < 1e-9, 'credit rows carry a negative balance');
ok(Math.abs(c2.record.box_balance - 60) < 1e-9, 'box_balance accumulates per box');

/* ── 9. the whole grid stays value-only: no cell holds a formula ──────────── */
['top_light_products', 'top_light_sales_products', 'top_light_purchasing_costing', 'top_light_product_purchasing', 'top_light_cash_bank_movement'].forEach(function (name) {
  const formulas = formulasOf(name);
  ok(formulas.length === 0, 'no formula cells on ' + name + (formulas.length ? ' (found ' + formulas[0] + ')' : ''));
});

/* ── 10. action path: dispatch_ writes through the repository ─────────────── */
const dispatchResult = TL.dispatch_({ module_action: 'add_product', data: { name_ar: 'منتج ب', unit: 'علبة' } }, { isSuperAdmin: true, email: 'boss@test' }, DB);
ok(dispatchResult.status === 'success', 'dispatch add_product succeeds through the repository');
const productRows = H.call('getAllRecords_', DB, 'top_light_products');
const newest = productRows.filter(function (r) { return String(r.name_ar) === 'منتج ب'; })[0];
ok(!!newest && newest.deleted_at === '' && isDate(newest.created_at), 'the dispatched create wrote a value-only audited row');
ok(TL.repo_.list(DB, 'top_light_products').length === 2, 'the deleted product stays hidden while live rows are listed');

/* ── 11. sales: add, edit (versioned), delete through the action layer ────── */
seed('top_light_current_products', ['unique_id', 'current_qty', 'total_cost_sign'], [[liveProduct.assignedId, 100, 0]]);
seed('top_light_sales_invoices', ['invoice_unique_id', 'رقم الفاتورة', 'اسم العميل', 'رقم التسجيل الضريبي للعميل', 'العنوان', 'رقم الموبيل', 'تاريخ الفاتورة', 'المبلغ الصافي', 'نسبة الخصم', 'قيمة الخصم', 'قيمة الضريبة', 'إجمالي', 'نوع سلع الجدول', 'الشهر', 'العام', 'tax_system', 'user', 'created_at', 'approval_status', 'version']);
seed('top_light_sales_products', ['unique_id', 'id', 'top_lightsales_header_id', 'top_lightsales_invoices_client', 'product_id', 'product_tax', 'product_qty', 'product_price', 'product_discount', 'product_net_value', 'product_tax_value', 'product_total_value', 'user', 'created_at']);
const salesAdd = TL.dispatch_({ module_action: 'add_sales', data: {
  header: { customer_id: 5, invoice_date: '2026-09-10', discount_percent: 0, tax_system: false },
  lines: [{ product_id: liveProduct.assignedId, product_tax: 0.14, product_qty: 2, product_price: 50, product_discount: 0 }]
} }, { isSuperAdmin: true, email: 'seller@test' }, DB);
ok(salesAdd.status === 'success', 'dispatch add_sales succeeds');
const invUid = salesAdd.unique_id;
const invRow = TL.repo_.find(DB, 'top_light_sales_invoices', 'invoice_unique_id', invUid);
ok(!!invRow && Number(invRow['المبلغ الصافي']) === 100 && Number(invRow['إجمالي']) === 114, 'sales header totals are stored as values');
ok(Number(invRow.version) === 0, 'a new sales header starts at version 0');
ok(Number(invRow['الشهر']) === 9 && Number(invRow['العام']) === 2026, 'sales month/year derive from the invoice date');
const invLines = TL.repo_.list(DB, 'top_light_sales_products').filter(function (l) { return String(l.top_lightsales_header_id) === invUid; });
ok(invLines.length === 1 && Number(invLines[0].product_net_value) === 100, 'the sales line stores its derived net value');

const salesEdit = TL.dispatch_({ module_action: 'edit_sales', data: {
  header: { unique_id: invUid, customer_id: 5, invoice_date: '2026-09-11', discount_percent: 0, tax_system: false, version: 0 },
  lines: [{ product_id: liveProduct.assignedId, product_tax: 0.14, product_qty: 3, product_price: 50, product_discount: 0 }]
} }, { isSuperAdmin: true, email: 'seller@test' }, DB);
ok(salesEdit.status === 'success', 'dispatch edit_sales succeeds');
const invRow2 = TL.repo_.find(DB, 'top_light_sales_invoices', 'invoice_unique_id', invUid);
ok(Number(invRow2['المبلغ الصافي']) === 150 && Number(invRow2.version) === 1, 'edit updates totals and bumps version');
const invLines2 = TL.repo_.list(DB, 'top_light_sales_products').filter(function (l) { return String(l.top_lightsales_header_id) === invUid; });
ok(invLines2.length === 1 && Number(invLines2[0].product_qty) === 3, 'edit replaces the line generation (soft-deleted old lines stay hidden)');
throwsWith(function () {
  TL.dispatch_({ module_action: 'edit_sales', data: {
    header: { unique_id: invUid, customer_id: 5, invoice_date: '2026-09-11', version: 0 },
    lines: [{ product_id: liveProduct.assignedId, product_tax: 0.14, product_qty: 3, product_price: 50, product_discount: 0 }]
  } }, { isSuperAdmin: true, email: 'seller@test' }, DB);
}, /CONFLICT/, 'a stale sales version is refused');

const salesDel = TL.dispatch_({ module_action: 'delete_sales', data: { unique_id: invUid } }, { isSuperAdmin: true, email: 'seller@test' }, DB);
ok(salesDel.status === 'success', 'dispatch delete_sales succeeds');
ok(TL.repo_.find(DB, 'top_light_sales_invoices', 'invoice_unique_id', invUid) === null, 'the deleted invoice disappears from reads');
ok(TL.repo_.list(DB, 'top_light_sales_products').filter(function (l) { return String(l.top_lightsales_header_id) === invUid; }).length === 0, 'the deleted invoice lines disappear from reads');
ok(H.call('getAllRecords_', DB, 'top_light_sales_invoices').length === 1, 'the physical invoice row survives the delete');

console.log('\n' + (failed ? failed + ' sheetdb contract check(s) FAILED.' : 'Top Light sheetdb contract passes.') + '\n');
process.exit(failed ? 1 : 0);
