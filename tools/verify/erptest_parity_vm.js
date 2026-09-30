'use strict';

/**
 * Local mirror of the P8 parity proof (tools/erptest/parity.gs.txt), plus the P9
 * read-flag parity.
 *
 * Builds a small Top Light book through the REAL TopLight actions, derives its
 * top_light_current_products values with the sheet's own formula rules, then
 * copies the book into an erp_test book the way etParity_ does (tabs renamed per
 * B3, headers renamed per ET_HEADER_MAP). Every Appendix 3 read action is run on
 * both sides and the JSON is diffed. With ET_SJS_READ the ErpTest side runs twice.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const gasstub = require('./gasstub');
const workbookStub = require('./vf_workbook_stub');

const ROOT = path.resolve(__dirname, '..', '..');
const TL_DB = 'tl-parity-db';
const ET_DB = 'et-parity-db';
const wb = workbookStub.createWorkbookStub();
wb.createSpreadsheet(TL_DB, []);
wb.createSpreadsheet(ET_DB, []);
const order = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8')).filePushOrder.filter(function (f) { return f !== 'Code.js'; });
const H = gasstub.createHarness({ workbook: wb, sources: order });
const TL = H.eval('TopLight');
const ET = H.eval('ErpTest');
H.override('noteMutation_', function () { try { H.ctx.resetRecordCache_(); } catch (e) {} });
H.override('logHistory_', function () {});
H.ctx.Utilities.getUuid = function () { return require('crypto').randomUUID(); };
// Apps Script's advanced service is Values.batchGet(spreadsheetId, optionalArgs); the
// shared stub takes (request, spreadsheetId). Accept both orders.
(function () {
  const V = H.ctx.Sheets.Spreadsheets.Values;
  const orig = V.batchGet;
  V.batchGet = function (a, b) { return typeof a === 'string' ? orig.call(V, b, a) : orig.call(V, a, b); };
})();
const tlBook = wb.openById(TL_DB);
const etBook = wb.openById(ET_DB);

const schemaCtx = {};
vm.createContext(schemaCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'Company_ErpTest_Schema.js'), 'utf8') + '\nthis.__map = ET_HEADER_MAP;', schemaCtx);
const ET_HEADER_MAP = schemaCtx.__map;

const discovery = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/erptest/discovery.json'), 'utf8'));
const TABS = ['products', 'categories', 'customer_vendor', 'chart_of_accounts', 'current_products', 'purchasing_costing',
  'product_purchasing', 'sales_invoices', 'sales_products', 'sales_returns', 'sales_offer', 'sales_offer_products',
  'cash_bank_movement', 'box_account_codes'];
const AUDIT = ['deleted_at', 'deleted_by', 'version'];
TABS.forEach(function (t) {
  const sh = discovery.top_light.sheets.find(function (s) { return s.name === 'top_light_' + t; });
  const h = sh.headers.map(function (x) { return String(x).trim(); }).filter(function (x) { return x !== ''; });
  if (['chart_of_accounts', 'box_account_codes', 'current_products'].indexOf(t) === -1) AUDIT.forEach(function (a) { if (h.indexOf(a) === -1) h.push(a); });
  const s = tlBook.addSheet('top_light_' + t);
  s.__setRows([h]);
});
const box = discovery.top_light.sheets.find(function (s) { return s.name === 'top_light_box_account_codes'; });
tlBook.getSheetByName('top_light_box_account_codes').__setRows([box.headers].concat(discovery.erp_test_box_values.slice(1)));
const chart = discovery.top_light.sheets.find(function (s) { return s.name === 'top_light_chart_of_accounts'; });
tlBook.getSheetByName('top_light_chart_of_accounts').__setRows([chart.headers].concat(chart.sample));

const TLSU = { isSuperAdmin: true, email: 'parity@test', company: '8df5c89a117fe9a5' };
const ETSU = { isSuperAdmin: true, email: 'parity@test', company: '37fc50edf1424abd' };
function tl(action, data) { H.advance(7); return TL.dispatch_({ module_action: action, data: data || {} }, TLSU, TL_DB); }
function rows(book, tab) { const v = book.getSheetByName(tab).getDataRange().getValues(); const h = v[0]; return v.slice(1).map(function (r) { const o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; }); }
let failed = 0;
function ok(v, msg) { console.log((v ? '  PASS  ' : '  FAIL  ') + msg); if (!v) failed++; }

/* ── top_light_current_products = the sheet formulas (P0 check 2), as values ── */
function tlStock() {
  const pur = rows(tlBook, 'top_light_product_purchasing');
  const sal = rows(tlBook, 'top_light_sales_products');
  const rts = rows(tlBook, 'top_light_sales_returns');
  const ids = [];
  pur.forEach(function (r) { ids.push(String(r.product)); });
  rts.forEach(function (r) { ids.push(String(r.top_lightsales_products_id)); });
  sal.forEach(function (r) { ids.push(String(r.product_id)); });
  const uniq = Array.from(new Set(ids.filter(Boolean))).sort();
  const sum = function (list, k, v, id) { return list.filter(function (r) { return String(r[k]) === id; }).reduce(function (s, r) { return s + (Number(r[v]) || 0); }, 0); };
  const out = [['unique_id', 'product', 'unit', 'current_qty', 'unit_cost', 'total_cost_sign', 'transaction_chart_code', 'transaction_chart_name', 'code']];
  uniq.forEach(function (id) {
    const q = sum(pur, 'product', 'qty', id) + sum(rts, 'top_lightsales_products_id', 'top_lightreturn_qty', id) - sum(sal, 'product_id', 'product_qty', id);
    const first = pur.find(function (r) { return String(r.product) === id; });
    const uc = first && Number(first.qty) ? Number(first.total_cost) / Number(first.qty) : 0;
    out.push([id, '', '', q, uc, uc * q, '', '', '']);
  });
  tlBook.getSheetByName('top_light_current_products').__setRows(out);
  H.cacheStore.clear();
}


/* ── seed Top Light through its own actions ── */
['مفتاح', 'لمبة', 'كابل'].forEach(function (n) { tl('add_product', { name_ar: n, unit: 'قطعة' }); });
tl('add_party', { name: 'عميل 1', customer_direction: 'عميل', address: 'طنطا', telephone: '0100' });
tl('add_party', { name: 'مورد 1', customer_direction: 'مورد' });
const P = rows(tlBook, 'top_light_products').map(function (r) { return r.id; });
const C = rows(tlBook, 'top_light_customer_vendor').map(function (r) { return r.id; });
ok(tl('add_purchasing', { header: { code: 'PU-1', receipt_date: '2025-02-01', type: 'تصنيع', shipping_type: 'محلي', supplier_name: C[1], currency: 'EGP', exchange_rate: 1, value: 1100 },
  lines: [{ product: P[0], qty: 50, unit_price: 10 }, { product: P[1], qty: 40, unit_price: 15 }] }).status === 'success', 'TL add_purchasing');
tlStock();
tl('approve_purchasing', { unique_id: rows(tlBook, 'top_light_purchasing_costing')[0].unique_id, version: 0 });
const s1 = tl('add_sales', { header: { customer_id: C[0], invoice_date: '2025-03-01', discount_percent: 0.35, tax_system: false },
  lines: [{ product_id: P[0], product_tax: 0, product_qty: 5, product_price: 30, product_discount: 0 }, { product_id: P[1], product_tax: 0, product_qty: 2, product_price: 40, product_discount: 0 }] });
tlStock();
const s2 = tl('add_sales', { header: { customer_id: C[0], invoice_date: '2025-04-01', discount_percent: 0, tax_system: false },
  lines: [{ product_id: P[0], product_tax: 0, product_qty: 3, product_price: 25, product_discount: 0 }] });
tlStock();
ok(s1.status === 'success' && s2.status === 'success', 'TL add_sales ×2');
const sl = rows(tlBook, 'top_light_sales_products').filter(function (l) { return l.top_lightsales_header_id === s1.unique_id; });
const ret = tl('add_sales_return', { invoice_id: s1.unique_id, product_id: sl[0].product_id, return_qty: 1, return_date: '2025-03-10' });
tlStock();
ok(ret && ret.status === 'success', 'TL add_sales_return');
ok(tl('add_cash', { record: { name: C[0], transaction_details: 'قبض', transaction_date: '2025-03-02', transaction_amount: 100, transaction_type: 'Debit', related_box: '111101', chart_code: '111101', transaction_method: 'نقدي', currency: 'EGP', exchange_rate: 1 } }).status === 'success', 'TL add_cash');
ok(tl('add_sales_offer', { header: { customer_id: C[0], invoice_date: '2025-05-01', discount_percent: 0 }, lines: [{ product_id: P[2], product_tax: 0, product_qty: 1, product_price: 9, product_discount: 0 }] }).status === 'success', 'TL add_sales_offer');

/* ── the etParity_ copy: rename tabs and headers ── */
tlBook.getSheets().forEach(function (s) {
  const name = s.getName();
  const etName = name.replace(/^top_light_/, 'erp_test_');
  const values = s.getDataRange().getValues();
  const map = ET_HEADER_MAP[etName] || {};
  values[0] = values[0].map(function (h) { const k = String(h).trim(); return map[k] !== undefined ? map[k] : h; });
  etBook.addSheet(etName).__setRows(values);
});
etBook.addSheet('erp_test_manufacture_orders').__setRows([['unique_id', 'id', 'mo_number', 'mo_date', 'product_id', 'planned_qty', 'produced_qty', 'materials_cost', 'extra_cost', 'total_cost', 'unit_cost', 'production_status', 'completion_date', 'completed_by', 'cancelled_at', 'cancelled_by', 'notes', 'approval_status', 'approval', 'approval_time', 'user', 'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'version']]);
etBook.addSheet('erp_test_manufacture_lines').__setRows([['unique_id', 'id', 'mo_unique_id', 'product_id', 'planned_qty', 'consumed_qty', 'unit_cost', 'total_cost', 'notes', 'user', 'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'version']]);

/* ── Appendix 3 cases ── */
const period = { date_from: '2025-01-01', date_to: '2025-12-31' };
const firstPurchase = rows(tlBook, 'top_light_purchasing_costing')[0].unique_id;
const cases = [
  ['get_products', {}], ['get_parties', {}], ['get_parties', { direction: 'customer' }],
  ['get_purchasing_headers', { loadAll: true }], ['get_purchasing_options', {}],
  ['get_purchasing_lines', { parent_id: firstPurchase }], ['get_purchase_print', { purchase_code: firstPurchase }],
  ['get_sales_headers', { loadAll: true }], ['get_sales_options', {}],
  ['get_sales_lines', { parent_id: s1.unique_id }], ['get_sales_print', { sales_code: s1.unique_id }],
  ['get_sales_costing', { sales_code: s1.unique_id }], ['get_sales_returns', { invoice_id: s1.unique_id }],
  ['get_cash_headers', { loadAll: true }], ['get_customer_statement', { customer_id: C[0] }],
  ['get_sales_offer_headers', { loadAll: true }],
  ['get_sales_analysis', period], ['get_sales_costing_analysis', period], ['get_income_statement', period],
  ['get_financial_position', period], ['get_cash_report', {}], ['get_purchase_needs', {}],
  ['get_product_movement', { product_id: P[0] }], ['get_kpi_data', {}]
];
const IGNORE = { now: true, created_at: true, asof: true };
/* `allow` names the DELIBERATE divergences from Top Light, per case:
     mfg     — the manufacturing extras Top Light has no column for
     parties — et_customers classifies a party six ways («النوع»), so
               get_et_parties returns the STORED classification plus the side
               it settles on, where Top Light returns only the side. The
               parity that still matters is that the side agrees, and that is
               asserted below rather than skipped. */
function diff(a, b, p, out, allow) {
  allow = allow || {};
  const allowMfg = allow.mfg;
  if (out.length > 30) return;
  const ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b);
  if (ta !== tb) { out.push(p + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b)); return; }
  if (ta === '[object Array]') {
    if (a.length !== b.length) out.push(p + '.length ' + a.length + ' != ' + b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], p + '[' + i + ']', out, allow);
    return;
  }
  if (ta === '[object Object]') {
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
    /* One party row: Top Light's normalized customer_direction must equal the
       side erp_test reports, whatever classification it stored. */
    const partyRow = allow.parties && ('direction' in b) && !('direction' in a) && ('customer_direction' in a);
    if (partyRow && String(a.customer_direction) !== String(b.direction)) {
      out.push(p + '.direction: ' + JSON.stringify(a.customer_direction) + ' != ' + JSON.stringify(b.direction));
    }
    keys.forEach(function (k) {
      if (IGNORE[k]) return;
      if (allowMfg && k === 'mfgExtra' && !(k in a) && Number(b[k]) === 0) return;
      if (partyRow && (k === 'direction' || k === 'customer_direction')) return;
      if (allow.parties && k === 'direction_options' && !(k in a)) return;
      diff(a[k], b[k], p + '.' + k, out, allow);
    });
    return;
  }
  if (typeof a === 'string' && typeof b === 'string' && a.replace(/tl_/g, 'et_').replace(/Top Light/g, 'Testing System').replace(/8df5c89a117fe9a5/g, '37fc50edf1424abd') === b) return;
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9) return;
  if (a !== b) out.push(p + ': ' + JSON.stringify(a) + ' != ' + JSON.stringify(b));
}
const jsonSafe = function (v) { return JSON.parse(JSON.stringify(v)); };
const modes = typeof ET.setFlag_ === 'function' ? [false, true] : [false];
cases.forEach(function (c) {
  const newName = c[0].replace(/^(get)_/, '$1_et_');
  let a, aErr = '';
  try { a = jsonSafe(TL.dispatch_({ module_action: c[0], data: c[1] }, TLSU, TL_DB)); } catch (e) { aErr = String(e.message); }
  modes.forEach(function (flag) {
    if (typeof ET.setFlag_ === 'function') ET.setFlag_('ET_SJS_READ', flag);
    H.cacheStore.clear();
    let b, bErr = '';
    try { b = jsonSafe(ET.dispatch_({ module_action: newName, data: c[1] }, ETSU, ET_DB)); } catch (e) { bErr = String(e.message); }
    const out = [];
    if (aErr || bErr) { if (aErr !== bErr) out.push('error: ' + aErr + ' != ' + bErr); }
    else diff(a, b, '', out, {
      mfg: /movement|income_statement|financial_position/.test(newName),
      parties: newName === 'get_et_parties'
    });
    ok(out.length === 0, 'parity ' + newName + ' ' + JSON.stringify(c[1]) + (modes.length > 1 ? ' [ET_SJS_READ=' + flag + ']' : '') + (out.length ? '\n        ' + out.slice(0, 5).join('\n        ') : ''));
  });
});
if (typeof ET.setFlag_ === 'function') ET.setFlag_('ET_SJS_READ', false);

/* The flag-on runs must really read packs (values.batchGet), not the legacy path. */
if (typeof ET.setFlag_ === 'function') {
  let calls = 0;
  const V = H.ctx.Sheets.Spreadsheets.Values, bg = V.batchGet;
  V.batchGet = function (a, b) { calls++; return bg.call(V, a, b); };
  ET.setFlag_('ET_SJS_READ', true); H.cacheStore.clear();
  const viaPack = ET.dispatch_({ module_action: 'get_et_sales_headers', data: { loadAll: true } }, ETSU, ET_DB);
  ET.setFlag_('ET_SJS_READ', false);
  V.batchGet = bg;
  ok(calls > 0 && viaPack.status === 'success', 'ET_SJS_READ=true serves reads from packs (values.batchGet calls: ' + calls + ')');
}

console.log('\n' + (failed ? failed + ' parity check(s) FAILED.' : 'erp_test parity passes.') + '\n');
process.exit(failed ? 1 : 0);
