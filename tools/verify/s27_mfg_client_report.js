'use strict';
/* S27 — Client manufacturing report (vf_mfg_client_report), first draft.
 * Server slice: getValleyMfgClientReport_ over fixture sheets. Covers the
 * period filter (inclusive bounds, blank dates excluded), status default
 * (Locked) + explicit statuses, client/product/op filters, unknown ids,
 * reversed bounds, pivot math (counts + produced qty per operation_type),
 * materials/by-product grouping and sums, cost stripping without the grant,
 * and filter-option shapes. Plus wiring scans: registry row, dispatch map,
 * ACTION_TABLES, register call, MfgOrders entry link, and the page's boot
 * markers. Nothing touches a spreadsheet, a Google service or the network. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

const vfSource = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
function grabNested(src, name) {
  const start = src.indexOf('  function ' + name + '(');
  assert(start >= 0, 'missing nested ' + name);
  const end = src.indexOf('\n  function ', start + 10);
  return src.slice(start, end < 0 ? src.length : end);
}
function grabConst(src, name) {
  const start = src.indexOf('const ' + name + ' =');
  assert(start >= 0, 'missing const ' + name);
  const m = /^const \w+ = (\[[^\]]*\]|'[^']*'|"[^"]*")/.exec(src.slice(start, start + 400));
  assert(m, 'const ' + name + ' not a short literal');
  return 'const ' + name + ' = ' + m[1] + ';';
}
function grabVar(src, name) {
  // VF_COST_KEYS spans lines: slice from its declaration to its closing.
  const start = src.indexOf('var ' + name + ' =');
  assert(start >= 0, 'missing var ' + name);
  const end = src.indexOf('\n  };', start);
  assert(end > 0, 'var ' + name + ' end not found');
  return src.slice(start, end + 4);
}

/* ── fixture sheets ─────────────────────────────────────────────────────── */
const T = {
  HDR: 'valley_manufacture_header',
  OUT: 'valley_manufacture_header_products',
  BP: 'valley_manufacture_by_product',
  PROD: 'valley_products',
  PARTY: 'valley_legal_customer_vendor'
};
const store = {};
store[T.PROD] = [
  { id: 'P1', name_ar: 'منتج 1', unit: 'كجم', client_id: 'C1' },
  { id: 'P2', name_ar: 'منتج 2', unit: 'لتر', client_id: 'C1' },
  { id: 'P3', name_ar: 'منتج 3', unit: 'قطعة', client_id: 'C2' },
  { id: 'P9', name_ar: 'منتج بلا عميل', unit: 'كجم', client_id: '' },
  { id: 'PX', name_ar: 'منتج بلا أوامر', unit: 'كجم', client_id: 'CX' }
];
store[T.PARTY] = [
  { id: 'C1', name: 'Client One', customer_direction: 'عميل' },
  { id: 'C2', name: 'Client Two', customer_direction: 'عميل' },
  { id: 'CX', name: 'Client Extra', customer_direction: 'عميل' },
  { id: 'S9', name: 'Supplier Nine', customer_direction: 'مورد' }
];
store[T.HDR] = [
  { unique_id: 'MO1', operation_type: 'تصنيع وتعبئة', mo_status: 'Locked', manufacture_date: '2026-09-05', produced_product: 'P1', actual_qty: 100, total_batch_cost: 1000 },
  { unique_id: 'MO2', operation_type: 'تصنيع وتعبئة', mo_status: 'Locked', manufacture_date: '2026-09-10', produced_product: 'P1', actual_qty: 50, total_batch_cost: 500 },
  { unique_id: 'MO3', operation_type: 'اعادة تعبئة', mo_status: 'Locked', manufacture_date: '2026-09-12', produced_product: 'P2', actual_qty: 30, total_batch_cost: 300 },
  { unique_id: 'MO4', operation_type: 'تصنيع (كميات)', mo_status: 'In Progress', manufacture_date: '2026-09-15', produced_product: 'P3', actual_qty: 200, total_batch_cost: 2000 },
  { unique_id: 'MO5', operation_type: 'تصنيع وتعبئة', mo_status: 'Draft', manufacture_date: '2026-09-20', produced_product: 'P1', actual_qty: 999, total_batch_cost: 9999 },
  { unique_id: 'MO6', operation_type: 'تصنيع وتعبئة', mo_status: 'Locked', manufacture_date: '', produced_product: 'P9', actual_qty: 40, total_batch_cost: 400 },
  { unique_id: 'MO7', operation_type: 'تصنيع وتعبئة', mo_status: 'Locked', manufacture_date: '2026-08-01', produced_product: 'P1', actual_qty: 25, total_batch_cost: 250 }
];
store[T.OUT] = [
  { valley_manufacture_header_id: 'MO1', product_id: 'M1', product_name: 'خامة أ', product_qty: 10, total_cost: 100 },
  { valley_manufacture_header_id: 'MO1', product_id: '', product_name: 'خامة ب', product_qty: 5, total_cost: 50 },
  { valley_manufacture_header_id: 'MO2', product_id: 'M1', product_name: 'خامة أ', product_qty: 4, total_cost: 40 },
  { valley_manufacture_header_id: 'MO4', product_id: 'M3', product_name: 'خامة ج', product_qty: 7, total_cost: 70 },
  { valley_manufacture_header_id: 'MO-NOPE', product_id: 'M9', product_name: 'خامة شبح', product_qty: 3, total_cost: 30 }
];
store[T.BP] = [
  { valley_manufacture_header_id: 'MO1', item: 'ثانوي س', qty: 3, total_cost: 30 },
  { valley_manufacture_header_id: 'MO3', item: 'ثانوي س', qty: 2, total_cost: 20 },
  { valley_manufacture_header_id: 'MO-NOPE', item: 'شبح', qty: 9, total_cost: 90 }
];

const ctx = {
  console,
  getAllRecords_: (dbId, sheet) => (store[sheet] || []).map(r => Object.assign({}, r)),
  // Cost grant is a test knob: the contract under test is strip-iff-denied.
  vfCanSeeCost_: user => !!(user && user.seeCost),
  MFG_ORDER_SHEET: T.HDR,
  MFG_ORDER_PRODUCTS_SHEET: T.OUT,
  FIN_PRODUCTS_SHEET: T.PROD,
  FIN_PARTIES_SHEET: T.PARTY
};
vm.createContext(ctx);
vm.runInContext(grabNested(vfSource, 'vfDateBound_'), ctx, { filename: 'date slice' });
vm.runInContext(grabVar(vfSource, 'VF_COST_KEYS'), ctx, { filename: 'costkeys slice' });
vm.runInContext(grabNested(vfSource, 'vfStripCost_'), ctx, { filename: 'strip slice' });
vm.runInContext(grabNested(vfSource, 'vfStripCostAll_'), ctx, { filename: 'stripall slice' });
vm.runInContext(grabConst(vfSource, 'MFG_OP_TYPES'), ctx, { filename: 'optypes slice' });
vm.runInContext(grabNested(vfSource, 'getValleyMfgClientReport_'), ctx, { filename: 'report slice' });

const ADMIN = { isSuperAdmin: true, email: 'a@test', seeCost: true };
const PLAIN = { email: 'u@test', seeCost: false };
function rowFor(res, cid, pid) {
  return (res.rows || []).filter(r => String(r.client_id) === cid && String(r.product_id) === pid)[0] || null;
}

console.log('\n1 — default call: Locked only, no bounds\n');
{
  const res = ctx.getValleyMfgClientReport_({}, ADMIN, 'db');
  check(res.status === 'success', 'status success');
  check(res.can_see_cost === true, 'grant flag true for the cost user');
  const p1 = rowFor(res, 'C1', 'P1');
  check(!!p1, 'C1/P1 row present');
  check(p1.mo_count === 3 && p1.produced_qty === 178, 'C1/P1 sums 3 MOs / 178 (actual 175 + by-product 3)', JSON.stringify({ c: p1.mo_count, q: p1.produced_qty }));
  check(p1.by_op['تصنيع وتعبئة'].mo_count === 3 && p1.by_op['تصنيع وتعبئة'].produced_qty === 178, 'op split carries the same sums');
  check(p1.by_op['تصنيع وتعبئة'].produced_qty === 175 + p1.byproducts_by_op['تصنيع وتعبئة'][0].qty, 'by-product qty feeds its operation_type sum');
  check(p1.client_name === 'Client One' && p1.product_name === 'منتج 1' && p1.unit === 'كجم', 'names + unit resolved');
  const p2 = rowFor(res, 'C1', 'P2');
  check(!!p2 && p2.mo_count === 1 && p2.produced_qty === 32, 'C1/P2 sums 1 MO / 32 (actual 30 + by-product 2) in اعادة تعبئة');
  check(rowFor(res, 'C2', 'P3') === null, 'In Progress MO4 excluded by the Locked default');
  check(rowFor(res, '', 'P9') === null, 'blank-date MO6 excluded even with no bounds');
  check(res.rows.length === 2, 'exactly two rows', res.rows.length);
  check(res.totals.mo_count === 4 && res.totals.produced_qty === 210, 'totals 4 MOs / 210 (205 actual + 5 by-products)', JSON.stringify(res.totals));
  check(res.totals.by_op['تصنيع وتعبئة'].mo_count === 3, 'totals op split');
  check(res.totals.by_op['تصنيع وتعبئة'].produced_qty === 178 && res.totals.by_op['اعادة تعبئة'].produced_qty === 32, 'per-op totals include their by-products');
  check(p1.batch_cost === 1750 && p1.by_op['تصنيع وتعبئة'].batch_cost === 1750, 'C1/P1 batch cost 1000+500+250 (total_batch_cost)', p1.batch_cost);
  check(rowFor(res, 'C1', 'P2').by_op['اعادة تعبئة'].batch_cost === 300, 'repack batch cost carried per op');
  check(res.totals.batch_cost === 2050 && res.totals.by_op['تصنيع وتعبئة'].batch_cost === 1750 && res.totals.by_op['اعادة تعبئة'].batch_cost === 300, 'grand + per-op cost totals', res.totals.batch_cost);
  const mat = {};
  p1.materials.forEach(m => { mat[m.item] = m; });
  check(mat['خامة أ'] && mat['خامة أ'].qty === 14 && mat['خامة أ'].total_cost === 140, 'MAT-A summed over MO1+MO2 (14 / 140)');
  check(mat['خامة ب'] && mat['خامة ب'].qty === 5, 'unnamed-id material keyed by name');
  check(!p1.materials.some(m => m.item === 'خامة شبح'), 'orphan-MO material never leaks in');
  const bp = {};
  p1.byproducts.forEach(m => { bp[m.item] = m; });
  check(bp['ثانوي س'] && bp['ثانوي س'].qty === 3 && bp['ثانوي س'].total_cost === 30, 'by-product summed for P1');
  check(rowFor(res, 'C1', 'P2').byproducts[0].qty === 2, 'by-product summed for P2');
  check(res.filter_options.clients.length === 2 && res.filter_options.clients[0].value === 'C1', 'client options: header-scoped عميل owners only, Arabic-sorted', JSON.stringify(res.filter_options.clients));
  check(!res.filter_options.clients.some(c => c.value === 'CX' || c.value === 'S9'), 'unmanufactured client + supplier never offered');
  check(res.filter_options.products.length === 4 && !res.filter_options.products.some(p => p.value === 'PX'), 'product options: only header-produced products, never the full master');
  check(res.filter_options.op_types.length === 3 && res.filter_options.statuses.length === 3, 'op/status option lists');
  const bpOp = p1.byproducts_by_op || {};
  check(bpOp['تصنيع وتعبئة'] && bpOp['تصنيع وتعبئة'][0].qty === 3 && bpOp['تصنيع وتعبئة'][0].total_cost === 30, 'by-products grouped under their own op type');
  check(!bpOp['اعادة تعبئة'], 'no cross-op by-product leakage');
  check(rowFor(res, 'C1', 'P2').byproducts_by_op['اعادة تعبئة'][0].qty === 2, 'repack by-products grouped under repack');
}

console.log('\n2 — period bounds (inclusive)\n');
{
  const res = ctx.getValleyMfgClientReport_({ from: '2026-09-01', to: '2026-09-30' }, ADMIN, 'db');
  const p1 = rowFor(res, 'C1', 'P1');
  check(p1.mo_count === 2 && p1.produced_qty === 153, 'August MO7 drops out, September stays (150 + by-product 3)', JSON.stringify({ c: p1.mo_count, q: p1.produced_qty }));
  check(res.totals.mo_count === 3, 'totals follow the window');
  check(res.totals.produced_qty === 185, 'window totals include by-products (153 + 32)', res.totals.produced_qty);
  check(p1.batch_cost === 1500 && res.totals.batch_cost === 1800, 'costs follow the window too', res.totals.batch_cost);
  const edge = ctx.getValleyMfgClientReport_({ from: '2026-09-05', to: '2026-09-05' }, ADMIN, 'db');
  check(edge.totals.mo_count === 1, 'single-day window is inclusive');
}

console.log('\n3 — explicit statuses, client/product/op filters, errors\n');
{
  const st = ctx.getValleyMfgClientReport_({ statuses: ['Locked', 'In Progress'] }, ADMIN, 'db');
  const p3 = rowFor(st, 'C2', 'P3');
  check(!!p3 && p3.mo_count === 1 && p3.produced_qty === 200, 'opt-in statuses admit MO4');
  check(st.totals.mo_count === 5, 'totals admit it too');
  check(st.totals.produced_qty === 410, 'MO4 adds actual-only (no by-products on it)', st.totals.produced_qty);
  const cf = ctx.getValleyMfgClientReport_({ client_ids: ['C2'], statuses: ['Locked', 'In Progress'] }, ADMIN, 'db');
  check(cf.rows.length === 1 && cf.rows[0].product_id === 'P3', 'client filter isolates C2');
  const pf = ctx.getValleyMfgClientReport_({ product_ids: ['P2'] }, ADMIN, 'db');
  check(pf.rows.length === 1 && pf.rows[0].product_id === 'P2', 'product filter isolates P2');
  const of = ctx.getValleyMfgClientReport_({ op_types: ['اعادة تعبئة'] }, ADMIN, 'db');
  check(of.rows.length === 1 && of.totals.mo_count === 1, 'op filter isolates the repack row');
  const unk = ctx.getValleyMfgClientReport_({ client_ids: ['ZZ'] }, ADMIN, 'db');
  check(unk.rows.length === 0 && unk.totals.mo_count === 0, 'unknown ids match nothing, never error');
  let threw = null;
  try { ctx.getValleyMfgClientReport_({ from: '2026-09-30', to: '2026-09-01' }, ADMIN, 'db'); } catch (e) { threw = e; }
  check(!!threw, 'reversed bounds throw in Arabic');
}

console.log('\n4 — cost gating\n');
{
  const res = ctx.getValleyMfgClientReport_({}, PLAIN, 'db');
  check(res.can_see_cost === false, 'grant flag false without the grant');
  const p1 = rowFor(res, 'C1', 'P1');
  check(p1.materials.length === 2, 'materials still listed');
  check(p1.materials.every(m => !('total_cost' in m)), 'material costs deleted, never zeroed');
  check(p1.byproducts.every(m => !('total_cost' in m)), 'by-product costs deleted too');
  check(Object.keys(p1.byproducts_by_op || {}).every(t => p1.byproducts_by_op[t].every(m => !('total_cost' in m))), 'per-op by-product costs deleted too');
  check(p1.materials[0].qty === 14, 'quantities survive stripping');
  check(p1.mo_count === 3 && p1.produced_qty === 178, 'pivot sums (actual + by-products) unaffected by gating');
  check(!('batch_cost' in p1) && !('batch_cost' in res.totals), 'header batch costs deleted, never zeroed');
  check(Object.keys(p1.by_op).every(t => !('batch_cost' in p1.by_op[t])) && Object.keys(res.totals.by_op).every(t => !('batch_cost' in res.totals.by_op[t])), 'per-op batch costs deleted too');
  const cost = ctx.getValleyMfgClientReport_({}, ADMIN, 'db');
  check(rowFor(cost, 'C1', 'P1').materials.some(m => m.total_cost === 140), 'grant restores costs');
}

console.log('\n5 — wiring scans\n');
{
  const reg = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Registry.js'), 'utf8');
  check(/action:\s*'vf_mfg_client_report'/.test(reg), 'registry action registered');
  check(/template:\s*'Company_ValleyFoods_MfgClientReport'/.test(reg), 'registry template named');
  check(/accessPage:\s*'vf_mfg_orders'/.test(reg), 'authority inherited from vf_mfg_orders');
  check(/nav:\s*false/.test(reg.split('vf_mfg_client_report')[1].split('}')[0]), 'report stays out of menus');
  check(/'get_valley_mfg_client_report':\s*\{\s*page:\s*'vf_mfg_orders',\s*access:\s*'read'\s*\}/.test(vfSource), 'dispatch map gates read on vf_mfg_orders');
  check(/'get_valley_mfg_client_report':\s*'valley_manufacture_header'/.test(vfSource), 'ACTION_TABLES maps the primary sheet');
  check(/ValleyFoods\.register\('get_valley_mfg_client_report',\s*getValleyMfgClientReport_\)/.test(vfSource), 'action registered on the dispatcher');
  const orders = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_MfgOrders.html'), 'utf8');
  check(orders.indexOf('?action=vf_mfg_client_report') !== -1, 'orders page links the report');
  const pagePath = path.join(ROOT, 'Company_ValleyFoods_MfgClientReport.html');
  check(fs.existsSync(pagePath), 'report template exists');
  const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
  check(page.indexOf('PAGE_PARAMS') !== -1 && page.indexOf('USER_PAGES') !== -1, 'unified boot scriptlets present');
  check(page.indexOf('window.MFGREP_PAGE') !== -1, 'page namespace published');
  check(page.indexOf('get_valley_mfg_client_report') !== -1, 'page calls the report action');
  check(page.indexOf('VALLEYFOODS_MENU') !== -1, 'unified nav menu bound');
  check((page.match(/data-label="/g) || []).length > 20, 'emitted cells carry data-labels');
  check(page.indexOf('opSectionsHtml') !== -1 && page.indexOf('tablesSumHtml') !== -1, 'one production table per op type plus a sum-of-tables');
  check(page.indexOf('FILTER_SIG') !== -1, 'filter bar rebuilds only when options change (no mid-typing popout)');
  check(page.indexOf('c-client') !== -1 && page.indexOf('c-product') !== -1, 'narrow client / wide product column classes');
  check(page.indexOf('byproducts_by_op') !== -1, 'by-products rendered per op, under their production table');
  check(page.indexOf('batch_cost') !== -1, 'per-op batch cost totals flow to KPIs and tables');
  check(page.indexOf('إجمالي التكلفة') !== -1, 'grand cost total rendered');
}

if (failed) { console.log('\ns27_mfg_client_report FAILED: ' + failed); process.exitCode = 1; }
else console.log('\ns27_mfg_client_report: PASS');
