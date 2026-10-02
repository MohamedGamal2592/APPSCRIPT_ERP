'use strict';

/**
 * et_manufacture — the page workflow, end to end, under node.
 *
 * The REAL Company_ErpTest_Manufacture.html (via pageharness) talks to the REAL
 * Company_ErpTest_Actions.js (via gasstub, in-memory workbook): every click below
 * is the page's own function, and every request it makes is dispatched to the
 * real handler. Nothing here touches a spreadsheet or the network.
 *
 *   1 add an order + its materials from the form          → Open / Pending
 *   2 row actions follow the stage (approve → start → record / done)
 *   3 Done before production is recorded: the review blocks it
 *   4 record production: planned + produced qty, consumed qty, an added material
 *   5 the review shows the recorded data and needs the confirm tick
 *   6 confirm → Completed, stock moved; the row offers only view / print
 *   7 over-consumption: the review lists the shortage and the button stays off
 *
 * Run: node tools/verify/erptest_mfg_page_vm.js
 */

const fs = require('fs');
const path = require('path');
const gasstub = require('./gasstub');
const workbookStub = require('./vf_workbook_stub');
const { bootPage } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const DB = 'erp-test-db';

/* ── server: the real erp_test actions on an in-memory workbook ── */
const wb = workbookStub.createWorkbookStub();
wb.createSpreadsheet(DB, []);
const order = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8')).filePushOrder.filter(function (f) { return f !== 'Code.js'; });
const H = gasstub.createHarness({ workbook: wb, sources: order });
const ET = H.eval('ErpTest');
const book = wb.openById(DB);
H.override('noteMutation_', function () { try { H.ctx.resetRecordCache_(); } catch (e) {} });
H.override('getCompanySpreadsheetId_', function () { return DB; });
H.override('logHistory_', function () {});
H.ctx.Utilities.getUuid = function () { return require('crypto').randomUUID(); };
(function () {
  const V = H.ctx.Sheets.Spreadsheets.Values;
  const orig = V.batchGet;
  V.batchGet = function (a, b) { return typeof a === 'string' ? orig.call(V, b, a) : orig.call(V, a, b); };
})();
const discovery = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/erptest/discovery.json'), 'utf8'));
function realHeaders(tab) {
  const sh = discovery.erp_test.sheets.find(function (s) { return s.name === tab; });
  const h = sh.headers.map(function (x) { return String(x).trim(); });
  ['deleted_at', 'deleted_by', 'version'].forEach(function (a) { if (h.indexOf(a) === -1) h.push(a); });
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
// Start from a hand-typed header row like the live sheet's, and let the repair split it.
seed('erp_test_manufacture_orders', ['unique_id', 'id', 'mo_number', 'mo_date', 'product_id', 'planned_qty / produced_qty', 'materials_cost, extra_cost, total_cost, unit_cost', 'production_status']);
seed('erp_test_manufacture_lines', ['unique_id', 'id', 'mo_unique_id', 'product_id', 'planned_qty', 'consumed_qty', 'unit_cost', 'total_cost', 'notes', 'user', 'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'version']);

const SU = { isSuperAdmin: true, email: 'boss@test', company: '37fc50edf1424abd' };
function server(action, data) {
  H.advance(7);
  try { H.cacheStore.clear(); H.ctx.resetRecordCache_(); } catch (e) {}
  const r = ET.dispatch_({ module_action: action, data: data || {} }, SU, DB);
  return JSON.parse(JSON.stringify(r));   // over the wire: Dates become strings
}
function rows(tab) { try { H.ctx.resetRecordCache_(); } catch (e) {} return H.call('getAllRecords_', DB, tab); }

let failed = 0;
function ok(v, msg, extra) {
  console.log((v ? '  PASS  ' : '  FAIL  ') + msg);
  if (!v) { failed++; if (extra !== undefined) console.log('        ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))); }
}

console.log('\n0 — the merged header row is repaired first\n');
const rep = ET.repairMfgHeaders_(DB);
ok(rep.erp_test_manufacture_orders === 'repaired', 'manufacture_orders header rewritten one name per column', rep);

['منتج A', 'منتج B', 'منتج F'].forEach(function (n) { server('add_et_product', { name_ar: n, unit: 'قطعة' }); });
const prods = rows('erp_test_products');
const A = prods[0].id, B = prods[1].id, F = prods[2].id;
const pp = realHeaders('erp_test_product_purchasing');
const ppRow = function (v) { return pp.map(function (h) { return v[h] === undefined ? '' : v[h]; }); };
seed('erp_test_product_purchasing', pp, [
  ppRow({ unique_id: 'PL-A', id: 1, product: A, qty: 10, total_cost: 100, receipt_date: new Date(2023, 0, 5), version: 0 }),
  ppRow({ unique_id: 'PL-B', id: 2, product: B, qty: 10, total_cost: 50, receipt_date: new Date(2023, 0, 5), version: 0 })
]);

/* ── client: the real page, its requests routed to the server above ── */
const sb = bootPage({
  page: 'Company_ErpTest_Manufacture.html', isSuperAdmin: true,
  containers: ['tl-root', 'tl-content'],
  scriptlets: { CURRENT_ACTION: "'et_manufacture'" },
  call: function (action, data) {
    try {
      const r = server(action, data);
      return r && r.status === 'error' ? Promise.reject(new Error(r.message)) : r;
    } catch (e) { return Promise.reject(e); }
  }
});
/* The DOM stub builds no form nodes, so read a form the way UIC._readForm does:
   every id inside <form id=…>, its typed value, else the value= in the markup. */
function formValues(formId) {
  const all = Object.keys(sb.document._byId).map(function (k) { return sb.document._byId[k]; });
  const host = all.find(function (el) { return String(el.innerHTML || '').indexOf('<form id="' + formId + '"') !== -1; });
  if (!host) return {};
  const html = String(host.innerHTML);
  const start = html.indexOf('<form id="' + formId + '"');
  const body = html.slice(start, html.indexOf('</form>', start));
  const out = {};
  const re = /<(input|select|textarea)\b[^>]*\sid="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const el = sb.document.getElementById(m[2]);
    const attr = /\svalue="([^"]*)"/.exec(m[0]);
    out[m[2]] = el && el.value !== '' ? String(el.value) : (attr ? attr[1] : '');
  }
  return out;
}
sb.UIC.collectForm = formValues;
sb.UIC.validateForm = function () { return true; };
const set = function (id, v) { const el = sb.document.getElementById(id); if (el) el.value = String(v); };
const settle = function () { return new Promise(function (r) { setImmediate(r); }); };
async function flush(n) { for (let i = 0; i < (n || 6); i++) { await settle(); } }
const content = function () { return sb.html('tl-content'); };
const modal = function (id) { const el = sb.document.getElementById(id); return el ? String(el.innerHTML || '') : ''; };
const ord = function (uid) { return rows('erp_test_manufacture_orders').find(function (o) { return o.unique_id === uid; }); };
/* The row-action labels the list offers for one order (from the dataTable rows the page drew). */
function actionsOf(uid) {
  const t = sb.__tables[sb.__tables.length - 1];
  const row = t && t.opts.rows.find(function (r) { return String(r.actions).indexOf("'" + uid + "'") !== -1; });
  if (!row) return [];
  const re = /doAction\('[^']*','([a-z]+)'\)/g;
  const out = []; let m;
  while ((m = re.exec(row.actions)) !== null) out.push(m[1]);
  return out;
}

(async function () {
  sb.load();
  await flush();

  console.log('\n1 — add an order with its materials\n');
  sb.openForm('');
  await flush();
  set('mo_date', '2023-03-01'); set('product_id', F); set('planned_qty', 5); set('extra_cost', 7); set('notes', 'تجربة');
  sb.addLine(); sb.updateLine(0, 'product_id', String(A), true); sb.updateLine(0, 'planned_qty', '4', false);
  sb.addLine(); sb.updateLine(1, 'product_id', String(B), true); sb.updateLine(1, 'planned_qty', '2', false);
  sb.saveManufacture();
  await flush(10);
  const orders = rows('erp_test_manufacture_orders');
  const uid = orders.length ? orders[0].unique_id : '';
  ok(orders.length === 1 && orders[0].production_status === 'Open' && orders[0].approval_status === 'Pending' && Number(orders[0].planned_qty) === 5,
    'the form saves an Open / Pending order with planned_qty 5 in its own column', orders[0]);
  ok(rows('erp_test_manufacture_lines').filter(function (l) { return l.mo_unique_id === uid && !l.deleted_at; }).length === 2, 'its 2 materials are saved');

  console.log('\n2 — row actions follow the stage\n');
  sb.renderList(true); await flush();
  let acts = actionsOf(uid);
  ok(acts.indexOf('approve') !== -1 && acts.indexOf('edit') !== -1 && acts.indexOf('start') === -1 && acts.indexOf('done') === -1,
    'Open / Pending: approve + edit, no start / done', acts);
  sb.approveManufacture(uid); await flush(10);
  sb.renderList(true); await flush();
  acts = actionsOf(uid);
  ok(acts.indexOf('start') !== -1 && acts.indexOf('approve') === -1 && acts.indexOf('progress') === -1, 'approved: start appears, approve / record production do not', acts);
  sb.startManufacture(uid); await flush(10);
  ok(ord(uid).production_status === 'In Progress', 'start → In Progress');
  sb.renderList(true); await flush();
  acts = actionsOf(uid);
  ok(acts.indexOf('progress') !== -1 && acts.indexOf('done') !== -1 && acts.indexOf('cancel') !== -1 && acts.indexOf('start') === -1 && acts.indexOf('edit') === -1,
    'In Progress: record production + done + cancel; no start / edit', acts);
  ok(content().indexOf('قيد التنفيذ') !== -1, 'the status column reads «قيد التنفيذ»');

  console.log('\n3 — Done before production is recorded\n');
  sb.openDoneReview(uid); await flush();
  let m = modal('done-modal');
  ok(m.indexOf('لم يتم تسجيل الكمية المنتجة فعلياً') !== -1, 'the review lists the missing produced qty');
  ok(sb.document.getElementById('done-submit') && sb.document.getElementById('done-submit').disabled === true, 'and the confirm button is disabled');
  sb.UIC.closeModal('done-modal');

  console.log('\n4 — record production\n');
  sb.openProgress(uid); await flush();
  ok(content().indexOf('تسجيل الإنتاج') !== -1 && content().indexOf('pg_planned_qty') !== -1 && content().indexOf('pg_produced_qty') !== -1,
    'the production screen has separate planned and produced fields');
  ok(content().indexOf('3. قيد التنفيذ') !== -1, 'the stage bar marks «قيد التنفيذ» as current');
  set('pg_planned_qty', 5); set('pg_produced_qty', 4); set('pg_extra_cost', 9); set('pg_notes', 'وردية');
  sb.progressLine(0, 'consumed_qty', '5', false);   // A: 5 instead of the planned 4
  sb.progressAddLine();
  ok(String(sb.html('tl-content')).length > 0 && /pl_product_2/.test(String(sb.document.getElementById('progress-tbody').innerHTML)), 'a third material row can be added');
  sb.progressRemoveLine(2);
  sb.saveProgress(false); await flush(10);
  let o = ord(uid);
  ok(o.production_status === 'In Progress' && Number(o.planned_qty) === 5 && Number(o.produced_qty) === 4 && Number(o.extra_cost) === 9,
    'saved: planned 5, produced 4, extra 9 — still In Progress', o);
  const live = rows('erp_test_manufacture_lines').filter(function (l) { return l.mo_unique_id === uid && !l.deleted_at; });
  ok(live.length === 2 && Number(live.find(function (l) { return String(l.product_id) === String(A); }).consumed_qty) === 5,
    'the consumed qty of A (5) is on its line', live.map(function (l) { return [l.product_id, l.consumed_qty]; }));

  console.log('\n5 — the review before Done\n');
  sb.openDoneReview(uid); await flush();
  m = modal('done-modal');
  ok(m.indexOf('مراجعة قبل الإنهاء') !== -1 || (sb.document.getElementById('done-modal') && String(sb.document.getElementById('done-modal').innerHTML).indexOf('مراجعة') !== -1), 'the review dialog opens');
  ok(m.indexOf('لا يمكن الإنهاء') === -1, 'no blocking problem');
  ok(m.indexOf('الكمية المنتجة فعلياً') !== -1 && m.indexOf('الفرق عن الخطة') !== -1 && m.indexOf('(-20%)') !== -1, 'it shows planned vs produced and the variance (4 of 5 = −20%)');
  ok(m.indexOf('(حسب الخطة)') !== -1, 'B, with no consumed qty entered, is marked as consumed per the plan');
  ok(sb.document.getElementById('done-submit').disabled === false, 'the confirm button is enabled');
  const completesBefore = sb.__calls.filter(function (c) { return c.payload && c.payload.module_action === 'complete_et_manufacture'; }).length;
  Promise.resolve(sb.submitDone()).catch(function () {}); await flush(10);
  ok(ord(uid).production_status === 'In Progress' && sb.__calls.filter(function (c) { return c.payload && c.payload.module_action === 'complete_et_manufacture'; }).length === completesBefore, 'without the review tick nothing is sent');

  console.log('\n6 — confirm\n');
  sb.document.getElementById('done_confirm').checked = true;
  set('done_completion_date', '2023-03-02');
  Promise.resolve(sb.submitDone()).catch(function () {}); await flush(10);
  o = ord(uid);
  ok(o.production_status === 'Completed' && Number(o.produced_qty) === 4, 'Completed with the recorded produced qty 4', o);
  const opts = server('get_et_manufacture_options', {}).options.product_options;
  const q = function (pid) { const x = opts.find(function (p) { return String(p.value) === String(pid); }); return x ? x.current_qty : 0; };
  ok(q(A) === 5 && q(B) === 8 && q(F) === 4, 'stock: A 10−5, B 10−2 (per plan), F +4', [q(A), q(B), q(F)]);
  sb.renderList(true); await flush();
  acts = actionsOf(uid);
  ok(acts.indexOf('progress') === -1 && acts.indexOf('done') === -1 && acts.indexOf('cancel') === -1 && acts.indexOf('view') !== -1, 'a completed order offers view / print only', acts);

  console.log('\n7 — over-consumption is caught in the review\n');
  const r2 = server('add_et_manufacture', { request_key: 'MO-PAGE-2', header: { mo_date: '2023-03-05', product_id: F, planned_qty: 1 }, lines: [{ product_id: A, planned_qty: 1 }] });
  server('approve_et_manufacture', { unique_id: 'MO-PAGE-2' });
  server('start_et_manufacture', { unique_id: 'MO-PAGE-2' });
  server('save_et_manufacture_progress', { header: { unique_id: 'MO-PAGE-2', planned_qty: 1, produced_qty: 1 }, lines: [{ product_id: A, planned_qty: 1, consumed_qty: 50 }] });
  sb.__optionsPromise = null;
  sb.renderList(true); await flush();
  sb.openDoneReview('MO-PAGE-2'); await flush();
  m = modal('done-modal');
  ok(r2.status === 'success' && m.indexOf('تتجاوز الرصيد المتاح') !== -1 && sb.document.getElementById('done-submit').disabled === true,
    'the review names the shortage and the confirm button stays disabled');

  console.log('\n' + (failed ? failed + ' et_manufacture page check(s) FAILED.' : 'et_manufacture page workflow passes.') + '\n');
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.log('  FAIL  threw: ' + (e && e.stack)); process.exit(1); });
