'use strict';

/**
 * erp_test executable acceptance (local mirror of plan Appendix 2 T-MFG and T-STOCK).
 *
 * Runs the REAL Code.js, every company registry and the REAL Company_ErpTest_*
 * sources against an in-memory workbook whose tabs carry the REAL erp_test
 * headers recorded in tools/erptest/discovery.json (plus the P2 audit columns
 * and manufacture tabs). Nothing here touches a spreadsheet or the network.
 *
 * The owner still runs the Apps Script version (tools/erptest/tests.gs.txt)
 * against the real sheet; this file proves the logic before any push.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gasstub = require('./gasstub');
const workbookStub = require('./vf_workbook_stub');

const ROOT = path.resolve(__dirname, '..', '..');
const DB = 'erp-test-db';
const wb = workbookStub.createWorkbookStub();
wb.createSpreadsheet(DB, []);
const order = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8')).filePushOrder.filter(function (f) { return f !== 'Code.js'; });
const H = gasstub.createHarness({ workbook: wb, sources: order });
const ET = H.eval('ErpTest');
const book = wb.openById(DB);
H.override('noteMutation_', function () { try { H.ctx.resetRecordCache_(); } catch (e) {} });
H.override('getCompanySpreadsheetId_', function () { return DB; });
H.override('logHistory_', function () {});
// The stub UUID follows the frozen clock; Apps Script's is random. Two lines written in
// the same instant must not share a unique_id.
H.ctx.Utilities.getUuid = function () { return require('crypto').randomUUID(); };

// ---- seed the erp_test tabs with their real headers ----
const discovery = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/erptest/discovery.json'), 'utf8'));
const AUDIT = ['deleted_at', 'deleted_by', 'version'];
function realHeaders(tab) {
  const sh = discovery.erp_test.sheets.find(function (s) { return s.name === tab; });
  assert.ok(sh, 'discovery has ' + tab);
  const h = sh.headers.map(function (x) { return String(x).trim(); });
  AUDIT.forEach(function (a) { if (h.indexOf(a) === -1) h.push(a); });
  return h;
}
function seed(name, headers, rows) {
  const sheet = book.getSheetByName(name) || book.addSheet(name);
  sheet.__setRows([headers.slice()].concat((rows || []).map(function (r) { return r.slice(); })));
}
['erp_test_products', 'erp_test_categories', 'erp_test_customer_vendor', 'erp_test_chart_of_accounts', 'erp_test_box_account_codes',
  'erp_test_purchasing_costing', 'erp_test_product_purchasing', 'erp_test_sales_invoices', 'erp_test_sales_products',
  'erp_test_sales_returns', 'erp_test_sales_offer', 'erp_test_sales_offer_products', 'erp_test_cash_bank_movement'
].forEach(function (t) { seed(t, realHeaders(t)); });
seed('erp_test_manufacture_orders', ['unique_id', 'id', 'mo_number', 'mo_date', 'product_id', 'planned_qty', 'produced_qty', 'materials_cost', 'extra_cost', 'total_cost', 'unit_cost', 'production_status', 'completion_date', 'completed_by', 'cancelled_at', 'cancelled_by', 'notes', 'approval_status', 'approval', 'approval_time', 'user', 'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'version']);
seed('erp_test_manufacture_lines', ['unique_id', 'id', 'mo_unique_id', 'product_id', 'planned_qty', 'consumed_qty', 'unit_cost', 'total_cost', 'notes', 'user', 'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'version']);

const SU = { isSuperAdmin: true, email: 'boss@test', company: '37fc50edf1424abd' };
let failed = 0;
function ok(v, msg) { console.log((v ? '  PASS  ' : '  FAIL  ') + msg); if (!v) failed++; }
function call(action, data) { H.advance(7); return ET.dispatch_({ module_action: action, data: data || {} }, SU, DB); }
function throwsWith(fn, text, msg) {
  let got = '';
  try { fn(); } catch (e) { got = String(e && e.message); }
  ok(got.indexOf(text) !== -1, msg + (got.indexOf(text) === -1 ? ' (got: ' + got + ')' : ''));
}
function rows(tab) { return H.call('getAllRecords_', DB, tab); }
function refresh() { H.cacheStore.clear(); try { H.ctx.resetRecordCache_(); } catch (e) {} }
const near = function (a, b) { return Math.abs(Number(a) - Number(b)) < 1e-6; };

/* ── seed: products A, B (components), F (finished); party 5; one purchase A=10, B=10 ── */
['منتج A', 'منتج B', 'منتج F'].forEach(function (n) { ok(call('add_et_product', { name_ar: n, unit: 'قطعة' }).status === 'success', 'add_et_product ' + n); });
const prods = rows('erp_test_products');
const A = prods[0].id, B = prods[1].id, F = prods[2].id;
seed('erp_test_customer_vendor', realHeaders('erp_test_customer_vendor'), [[5, 'عميل 5', 'عميل', '', '', '', '', '', '', '0100', 'طنطا', '', '', '', 0]]);
const pp = realHeaders('erp_test_product_purchasing');
function ppRow(v) { return pp.map(function (h) { return v[h] === undefined ? '' : v[h]; }); }
seed('erp_test_product_purchasing', pp, [
  ppRow({ unique_id: 'PL-A', id: 1, product: A, qty: 10, total_cost: 100, receipt_date: new Date(2023, 0, 5), version: 0 }),
  ppRow({ unique_id: 'PL-B', id: 2, product: B, qty: 10, total_cost: 50, receipt_date: new Date(2023, 0, 5), version: 0 })
]);
refresh();

/* ── translation layer: erp_test English headers read back under Top Light logical names ── */
const opts = call('get_et_sales_options', {});
ok(opts.status === 'success', 'get_et_sales_options succeeds on the real erp_test headers');
const salesAdd = call('add_et_sales', { header: { customer_id: 5, invoice_date: '2023-02-01', discount_percent: 0, tax_system: false },
  lines: [{ product_id: A, product_tax: 0, product_qty: 1, product_price: 20, product_discount: 0 }] });
ok(salesAdd.status === 'success', 'add_et_sales succeeds');
const inv = rows('erp_test_sales_invoices')[0];
ok(inv && inv.invoice_number && Number(inv.invoice_net_value) === 20 && String(inv.client_id) === '5', 'sales header lands in the English erp_test columns (invoice_number, invoice_net_value, client_id)');
const sl = rows('erp_test_sales_products')[0];
ok(sl && String(sl.erp_test_sales_header_id) === String(salesAdd.unique_id), 'sales line FK lands in erp_test_sales_header_id');
const hdrs = call('get_et_sales_headers', { loadAll: true });
ok(hdrs.status === 'success' && hdrs.headers && hdrs.headers.length === 1, 'get_et_sales_headers reads the invoice back');
ok(call('delete_et_sales', { unique_id: salesAdd.unique_id }).status === 'success', 'delete_et_sales (restore stock for the manufacturing tests)');
refresh();

/* ── offers: key is offer_unique_id (OD-E); replay must not duplicate ── */
const offerData = { request_key: 'OFFER-KEY-1', header: { customer_id: 5, invoice_date: '2023-02-02', discount_percent: 0 },
  lines: [{ product_id: A, product_tax: 0, product_qty: 1, product_price: 20, product_discount: 0 }] };
const off1 = call('add_et_sales_offer', offerData);
ok(off1.status === 'success', 'add_et_sales_offer succeeds');
ok(rows('erp_test_sales_offer').length === 1 && rows('erp_test_sales_offer')[0].offer_unique_id === 'OFFER-KEY-1', 'offer key stored in offer_unique_id');
call('add_et_sales_offer', offerData);
ok(rows('erp_test_sales_offer').length === 1, 'offer replay with the same request_key adds no row');
const offApprove = call('approve_et_sales_offer', { unique_id: 'OFFER-KEY-1', version: 0 });
ok(offApprove.status === 'success' && rows('erp_test_sales_offer')[0].approval_status === 'Approved', 'approve_et_sales_offer finds the row through keyColumn offer_unique_id');

/* ── stock is live (OD-A) ── */
let qm = call('get_et_manufacture_options', {}).options.product_options;
const qtyOf = function (list, pid) { const o = list.find(function (x) { return String(x.value) === String(pid); }); return o ? o.current_qty : 0; };
ok(qtyOf(qm, A) === 10 && qtyOf(qm, B) === 10, 'live stock: A = 10, B = 10 from purchases');

/* ── T-MFG ── */
const yyyy = new Date(H.now).getFullYear();
const k1 = 'MO-KEY-1';
const add1 = call('add_et_manufacture', { request_key: k1, header: { mo_date: '2023-03-01', product_id: F, planned_qty: 5, extra_cost: 7 },
  lines: [{ product_id: A, planned_qty: 4 }, { product_id: B, planned_qty: 2 }] });
const o1 = rows('erp_test_manufacture_orders')[0];
ok(add1.status === 'success' && o1.mo_number === 'MO-1-' + yyyy, 'T-MFG 1: mo_number MO-1-' + yyyy);
ok(o1.approval_status === 'Pending' && o1.production_status === 'Open', 'T-MFG 1: Pending/Open');
ok(near(o1.materials_cost, 4 * 10 + 2 * 5), 'T-MFG 1: materials_cost = 4·uc(A) + 2·uc(B)');
throwsWith(function () { call('add_et_manufacture', { header: { mo_date: '2023-03-01', product_id: F, planned_qty: 1 }, lines: [{ product_id: F, planned_qty: 1 }] }); }, 'لا يمكن استخدام المنتج التام كخامة', 'T-MFG 2: finished product as material refused');
throwsWith(function () { call('add_et_manufacture', { header: { mo_date: '2023-03-01', product_id: F, planned_qty: 1 }, lines: [{ product_id: A, planned_qty: 1 }, { product_id: A, planned_qty: 1 }] }); }, 'الخامة مكررة في نفس الأمر', 'T-MFG 3: duplicate material refused');
throwsWith(function () { call('complete_et_manufacture', { unique_id: k1, produced_qty: 5, completion_date: '2023-03-02' }); }, 'يجب اعتماد الأمر قبل الإكمال', 'T-MFG 4: complete before approve refused');
ok(call('approve_et_manufacture', { unique_id: k1, version: 0 }).status === 'success', 'T-MFG 5: approve');
const lines1 = call('get_et_manufacture_lines', { parent_id: k1 }).lines;
const comp1 = call('complete_et_manufacture', { unique_id: k1, produced_qty: 5, completion_date: '2023-03-02',
  lines: lines1.map(function (l) { return { unique_id: l.unique_id, consumed_qty: String(l.product_id) === String(A) ? 4 : 2 }; }) });
const o1c = rows('erp_test_manufacture_orders')[0];
ok(comp1.status === 'success' && o1c.production_status === 'Completed', 'T-MFG 5: Completed');
ok(near(o1c.unit_cost, o1c.total_cost / 5) && near(o1c.total_cost, 50 + 7), 'T-MFG 5: unit_cost = total/5 (total = 50 materials + 7 extra)');
throwsWith(function () { call('edit_et_manufacture', { header: { unique_id: k1, mo_date: '2023-03-01', product_id: F, planned_qty: 5 }, lines: [{ product_id: A, planned_qty: 1 }] }); }, 'لا يمكن تعديل أمر معتمد أو مغلق', 'T-MFG 6: edit of completed order refused');
const add2 = call('add_et_manufacture', { request_key: 'MO-KEY-2', header: { mo_date: '2023-03-03', product_id: F, planned_qty: 1 }, lines: [{ product_id: A, planned_qty: 7 }] });
ok(add2.status === 'success' && call('approve_et_manufacture', { unique_id: 'MO-KEY-2', version: 0 }).status === 'success', 'T-MFG 7: second order added and approved');
throwsWith(function () { call('complete_et_manufacture', { unique_id: 'MO-KEY-2', produced_qty: 1, completion_date: '2023-03-04' }); }, 'الكمية المستهلكة من منتج A تتجاوز الرصيد المتاح (المتاح: 6)', 'T-MFG 7: over-consumption refused with available 6');
ok(call('cancel_et_manufacture', { unique_id: 'MO-KEY-2' }).status === 'success', 'T-MFG 8: cancel');
ok(rows('erp_test_manufacture_orders')[1].production_status === 'Cancelled', 'T-MFG 8: Cancelled');
throwsWith(function () { call('complete_et_manufacture', { unique_id: 'MO-KEY-2', produced_qty: 1, completion_date: '2023-03-04' }); }, 'الأمر مغلق', 'T-MFG 8: complete after cancel refused');
const before = rows('erp_test_manufacture_orders').length;
const replay = call('add_et_manufacture', { request_key: k1, header: { mo_date: '2023-03-01', product_id: F, planned_qty: 5 }, lines: [{ product_id: A, planned_qty: 4 }, { product_id: B, planned_qty: 2 }] });
ok(replay.status === 'success' && replay.deduped === true && rows('erp_test_manufacture_orders').length === before, 'T-MFG 9: replay returns the committed order, no new row');

/* ── edit then complete: a re-written line generation is completable ── */
const add3 = call('add_et_manufacture', { request_key: 'MO-KEY-3', header: { mo_date: '2023-03-05', product_id: F, planned_qty: 1 }, lines: [{ product_id: B, planned_qty: 1 }] });
const l3 = call('get_et_manufacture_lines', { parent_id: 'MO-KEY-3' }).lines;
const ed3 = call('edit_et_manufacture', { header: { unique_id: 'MO-KEY-3', version: 0, mo_date: '2023-03-05', product_id: F, planned_qty: 1 }, lines: [{ unique_id: l3[0].unique_id, product_id: B, planned_qty: 2 }] });
ok(add3.status === 'success' && ed3.status === 'success', 'edit an open order');
const l3b = call('get_et_manufacture_lines', { parent_id: 'MO-KEY-3' }).lines;
ok(l3b.length === 1 && Number(l3b[0].planned_qty) === 2 && l3b[0].unique_id !== l3[0].unique_id, 'edit replaces the line generation with fresh line ids');
ok(call('cancel_et_manufacture', { unique_id: 'MO-KEY-3', version: 1 }).status === 'success', 'cancel the edited order (keeps T-STOCK quantities unchanged)');
throwsWith(function () { call('approve_et_manufacture', { unique_id: 'MO-KEY-2', version: 1 }); }, 'لا يمكن اعتماد', 'approving an already-approved order is refused by the transition table');

/* ── T-STOCK ── */
qm = call('get_et_manufacture_options', {}).options.product_options;
ok(qtyOf(qm, A) === 6 && qtyOf(qm, B) === 8 && qtyOf(qm, F) === 5, 'T-STOCK: A = 6, B = 8, F = 5');
const tmpl = call('get_et_manufacture_template', { product_id: F }).lines;
ok(tmpl.length === 2, 'template: last non-cancelled order for F has 2 material lines');
const mv = call('get_et_product_movement', { product_id: F });
const mvRows = (mv.rows || mv.movements || []);
ok(mvRows.filter(function (r) { return r.type === 'manufacture_in' && Number(r.qty_in) === 5; }).length === 1, 'T-STOCK: product movement shows one manufacture_in of 5');
const isr = call('get_et_income_statement', { date_from: yyyy + '-01-01', date_to: yyyy + '-12-31' });
const summary = isr.summary || (isr.data && isr.data.summary) || {};
ok(Number(summary.mfgExtra) === 7, 'T-STOCK: income statement mfgExtra = 7');
const sell5 = call('add_et_sales', { header: { customer_id: 5, invoice_date: '2023-04-01', discount_percent: 0 }, lines: [{ product_id: F, product_tax: 0, product_qty: 5, product_price: 30, product_discount: 0 }] });
ok(sell5.status === 'success', 'T-STOCK: selling F×5 allowed');
ok(call('delete_et_sales', { unique_id: sell5.unique_id }).status === 'success', 'T-STOCK: (undo the F×5 sale)');
refresh();
let sell6err = '';
try { const r6 = call('add_et_sales', { header: { customer_id: 5, invoice_date: '2023-04-01', discount_percent: 0 }, lines: [{ product_id: F, product_tax: 0, product_qty: 6, product_price: 30, product_discount: 0 }] }); if (r6.status !== 'success') sell6err = r6.message || 'error'; } catch (e) { sell6err = String(e.message); }
ok(sell6err !== '', 'T-STOCK: selling F×6 fails with the stock error (' + sell6err.slice(0, 60) + ')');

/* ── runtime field check (3.12) ── */
const sc = ET.schemaCheck_(DB);
ok(sc.ok === true, 'etSchemaCheck_ ok:true on the real erp_test headers' + (sc.ok ? '' : ' ' + JSON.stringify(sc.missingRequired)));

console.log('\n' + (failed ? failed + ' erp_test acceptance check(s) FAILED.' : 'erp_test acceptance (T-MFG, T-STOCK) passes.') + '\n');
process.exit(failed ? 1 : 0);
