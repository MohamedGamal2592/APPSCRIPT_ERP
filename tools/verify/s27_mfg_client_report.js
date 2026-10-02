'use strict';
/* S27 — Client manufacturing report (vf_mfg_client_report).
 * Server slice: getValleyMfgClientReport_ over fixture sheets. Covers the
 * period filter (inclusive bounds, blank dates excluded), status default
 * (Locked) + explicit statuses, client/product/op filters, unknown ids,
 * reversed bounds, and the production rules: every item counts for the
 * client that owns it (by-products on their own rows, unowned ones on the
 * «بدون عميل» row, sorted last), bulk drawn from earlier production — any
 * client's, the other client's flagged — is subtracted from the consuming
 * product, and repacking is reported per op but kept out of every total.
 * Attribution to the MO client and the data warnings (by-products under
 * another client's item, other-client bulk, unbalanced repacks, products
 * with no client, MOs left out by status). Plus cost stripping without
 * the grant, filter-option shapes, and wiring scans: registry row, dispatch
 * map, ACTION_TABLES, register call, MfgOrders entry link, and the page's
 * boot markers. Nothing touches a spreadsheet, a Google service or the
 * network. */
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
const TW = 'تصنيع وتعبئة', KM = 'تصنيع (كميات)', RP = 'اعادة تعبئة';
const store = {};
store[T.PROD] = [
  { id: 'P1', name_ar: 'منتج 1', unit: 'كجم', client_id: 'C1', category: 1 },
  { id: 'P2', name_ar: 'منتج 2', unit: 'لتر', client_id: 'C1', category: 1 },
  { id: 'P3', name_ar: 'منتج 3', unit: 'قطعة', client_id: 'C2', category: 1 },
  { id: 'P9', name_ar: 'منتج بلا عميل', unit: 'كجم', client_id: '', category: 1 },
  { id: 'PX', name_ar: 'منتج بلا أوامر', unit: 'كجم', client_id: 'CX', category: 1 },
  { id: 'B1', name_ar: 'بالك 1', unit: 'كجم', client_id: 'C1', category: 4 },
  { id: 'B2', name_ar: 'بالك 2', unit: 'كجم', client_id: 'C2', category: '23' },
  { id: 'BP1', name_ar: 'ثانوي عميل 2', unit: 'كجم', client_id: 'C2', category: 1 },
  { id: 'BP0', name_ar: 'ثانوي بلا عميل', unit: 'كجم', client_id: '', category: 1 },
  { id: 'M1', name_ar: 'خامة أ', unit: 'كجم', client_id: 'C1', category: 2 }
];
store[T.PARTY] = [
  { id: 'C1', name: 'Client One', customer_direction: 'عميل' },
  { id: 'C2', name: 'Client Two', customer_direction: 'عميل' },
  { id: 'CX', name: 'Client Extra', customer_direction: 'عميل' },
  { id: 'S9', name: 'Supplier Nine', customer_direction: 'مورد' }
];
store[T.HDR] = [
  { unique_id: 'MO1', operation_type: TW, mo_status: 'Locked', manufacture_date: '2026-09-05', produced_product: 'P1', actual_qty: 100, total_batch_cost: 1000 },
  { unique_id: 'MO2', operation_type: TW, mo_status: 'Locked', manufacture_date: '2026-09-10', produced_product: 'P1', actual_qty: 50, total_batch_cost: 500 },
  { unique_id: 'MO3', operation_type: RP, mo_status: 'Locked', manufacture_date: '2026-09-12', produced_product: 'P2', actual_qty: 30, total_batch_cost: 300 },
  { unique_id: 'MO4', operation_type: KM, mo_status: 'In Progress', manufacture_date: '2026-09-15', produced_product: 'P3', actual_qty: 200, total_batch_cost: 2000 },
  { unique_id: 'MO5', operation_type: TW, mo_status: 'Draft', manufacture_date: '2026-09-20', produced_product: 'P1', actual_qty: 999, total_batch_cost: 9999 },
  { unique_id: 'MO6', operation_type: TW, mo_status: 'Locked', manufacture_date: '', produced_product: 'P9', actual_qty: 40, total_batch_cost: 400 },
  { unique_id: 'MO7', operation_type: TW, mo_status: 'Locked', manufacture_date: '2026-08-01', produced_product: 'P1', actual_qty: 25, total_batch_cost: 250 },
  { unique_id: 'MO8', operation_type: KM, mo_status: 'Locked', manufacture_date: '2026-09-03', produced_product: 'B1', actual_qty: 60, total_batch_cost: 600 }
];
store[T.OUT] = [
  { valley_manufacture_header_id: 'MO1', product_id: 'M1', product_name: 'خامة أ', product_qty: 10, total_cost: 100 },
  { valley_manufacture_header_id: 'MO1', product_id: '', product_name: 'خامة ب', product_qty: 5, total_cost: 50 },
  // same-client bulk drawn from earlier production → subtracted from P1
  { valley_manufacture_header_id: 'MO1', product_id: 'B1', product_name: 'بالك 1', product_qty: 30, total_cost: 300 },
  // another client's bulk → subtracted too (no double count), flagged cross_client
  { valley_manufacture_header_id: 'MO1', product_id: 'B2', product_name: 'بالك 2', product_qty: 4, total_cost: 40 },
  { valley_manufacture_header_id: 'MO2', product_id: 'M1', product_name: 'خامة أ', product_qty: 4, total_cost: 40 },
  { valley_manufacture_header_id: 'MO3', product_id: 'B1', product_name: 'بالك 1', product_qty: 30, total_cost: 300 },
  { valley_manufacture_header_id: 'MO4', product_id: 'M3', product_name: 'خامة ج', product_qty: 7, total_cost: 70 },
  { valley_manufacture_header_id: 'MO-NOPE', product_id: 'M9', product_name: 'خامة شبح', product_qty: 3, total_cost: 30 }
];
store[T.BP] = [
  { valley_manufacture_header_id: 'MO1', item: 'BP1', qty: 3, total_cost: 30 },
  { valley_manufacture_header_id: 'MO1', item: 'BP0', qty: 1, total_cost: 10 },
  { valley_manufacture_header_id: 'MO8', item: 'BP1', qty: 2, total_cost: 20 },
  { valley_manufacture_header_id: 'MO3', item: 'BP0', qty: 2, total_cost: 20 },
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
const run = (d, u) => ctx.getValleyMfgClientReport_(d, u || ADMIN, 'db');
const hdrPush = r => store[T.HDR].push(r);
const hdrPop = () => store[T.HDR].pop();

console.log('\n1 — default call: Locked only, no bounds\n');
{
  const res = run({});
  check(res.status === 'success', 'status success');
  check(res.can_see_cost === true, 'grant flag true for the cost user');
  const p1 = rowFor(res, 'C1', 'P1');
  check(!!p1, 'C1/P1 row present');
  const s = p1.by_op[TW];
  check(s.mo_count === 3 && s.main_qty === 175, 'C1/P1 main output 3 MOs / 175', JSON.stringify(s));
  check(s.bulk_used_qty === 34 && s.produced_qty === 141, 'bulk of any client subtracted: B1 30 + B2 4 → net 141', JSON.stringify(s));
  check(p1.produced_qty === 141 && p1.mo_count === 3 && p1.batch_cost === 1750, 'row totals carry the net + MO cost');
  check(p1.client_name === 'Client One' && p1.product_name === 'منتج 1' && p1.unit === 'كجم', 'names + unit resolved');
  const bu = p1.bulk_used_by_op[TW] || [];
  check(bu.length === 2 && bu[0].item === 'B1' && bu[0].qty === 30 && bu[0].total_cost === 300 && bu[0].cross_client === false,
    'bulk detail: own-client B1 not cross-client', JSON.stringify(bu));
  check(bu[1] && bu[1].item === 'B2' && bu[1].qty === 4 && bu[1].cross_client === true && bu[1].owner_client_name === 'Client Two',
    'bulk detail: other-client B2 subtracted and flagged with its owner', JSON.stringify(bu));
  check(p1.materials.some(m => m.item === 'بالك 2' && m.qty === 4), 'other-client bulk still listed as a material');
  check(!p1.byproducts_by_op[TW], 'by-products never sit on the producing row');

  const bp1 = rowFor(res, 'C2', 'BP1');
  check(!!bp1, 'by-product BP1 gets its own row under its owner C2 (not the MO client C1)');
  check(bp1.by_op[TW].byproduct_qty === 3 && bp1.by_op[KM].byproduct_qty === 2 && bp1.produced_qty === 5, 'BP1 counts in both manufacturing ops: 3 + 2');
  check(bp1.mo_count === 0, 'by-product rows add no MO count');
  check(bp1.byproducts_by_op[TW][0].source_product_name === 'منتج 1' && bp1.byproducts_by_op[KM][0].source_product_name === 'بالك 1', 'by-product detail names the source product');

  const bp0 = rowFor(res, '', 'BP0');
  check(!!bp0 && bp0.client_name === 'بدون عميل' && bp0.produced_qty === 1, 'unowned by-product on the «بدون عميل» row (repack bp excluded from its total)');
  check(res.rows[res.rows.length - 1] === bp0, '«بدون عميل» rows sort last');

  const b1 = rowFor(res, 'C1', 'B1');
  check(!!b1 && b1.by_op[KM].main_qty === 60 && b1.produced_qty === 60, 'bulk made by تصنيع (كميات) counts as production (60)');

  const p2 = rowFor(res, 'C1', 'P2');
  check(!!p2 && p2.by_op[RP].mo_count === 1 && p2.by_op[RP].main_qty === 30, 'repack MO still reported per op');
  check(p2.produced_qty === 0 && p2.mo_count === 0 && p2.batch_cost === 0, 'repack never enters row totals');
  check(p2.bulk_used_by_op[RP][0].qty === 30, 'repack shows what bulk it reshaped');

  check(rowFor(res, 'C2', 'P3') === null, 'In Progress MO4 excluded by the Locked default');
  check(rowFor(res, '', 'P9') === null, 'blank-date MO6 excluded even with no bounds');
  check(res.rows.length === 5, 'five rows', res.rows.map(r => r.client_id + '|' + r.product_id).join(','));

  check(res.totals.produced_qty === 207 && res.totals.mo_count === 4, 'grand net 207 over 4 manufacturing MOs (141 + 60 + 5 + 1)', JSON.stringify(res.totals));
  check(res.totals.bulk_used_qty === 34 && res.totals.batch_cost === 2350, 'grand bulk deduction + cost exclude repack');
  const tw = res.totals.by_op[TW], km = res.totals.by_op[KM], rp = res.totals.by_op[RP];
  check(tw.main_qty === 175 && tw.byproduct_qty === 4 && tw.bulk_used_qty === 34 && tw.produced_qty === 145, 'تصنيع وتعبئة: 175 + 4 − 34 = 145', JSON.stringify(tw));
  check(km.main_qty === 60 && km.byproduct_qty === 2 && km.produced_qty === 62, 'تصنيع (كميات): 60 + 2 = 62', JSON.stringify(km));
  check(rp.mo_count === 1 && rp.main_qty === 30 && rp.byproduct_qty === 2, 'repack totals kept per op, for reference', JSON.stringify(rp));
  check(tw.produced_qty + km.produced_qty === res.totals.produced_qty, 'grand net = the two manufacturing ops only');

  check(res.kpi_operation_types.join('|') === TW + '|' + KM, 'KPI scope is exactly the two manufacturing operations');
  check(res.kpi_totals.produced_qty === 207 && res.kpi_totals.batch_cost === 2350 && !res.kpi_totals.by_op[RP], 'KPIs match the counted totals, repack excluded');
  check(res.attribution === 'item', 'attribution defaults to the item owner');
  check(res.bulk_category_ids.slice().sort().join(',') === '10,11,23,4,9', 'bulk categories are 4, 9, 10, 11, 23');

  const mat = {};
  p1.materials.forEach(m => { mat[m.item] = m; });
  check(mat['خامة أ'] && mat['خامة أ'].qty === 14 && mat['خامة أ'].total_cost === 140, 'MAT-A summed over MO1+MO2 (14 / 140)');
  check(mat['خامة ب'] && mat['خامة ب'].qty === 5, 'unnamed-id material keyed by name');
  check(!res.rows.some(r => r.materials.some(m => m.item === 'خامة شبح')), 'orphan-MO material never leaks in');
  check(!res.rows.some(r => r.product_id === 'شبح'), 'orphan-MO by-product never leaks in');

  check(res.filter_options.clients.map(c => c.value).join(',') === 'C1,C2', 'client options: line-item عميل owners only, Arabic-sorted', JSON.stringify(res.filter_options.clients));
  check(!res.filter_options.clients.some(c => c.value === 'CX' || c.value === 'S9'), 'unmanufactured client + supplier never offered');
  const popts = res.filter_options.products.map(p => p.value);
  check(popts.length === 7 && popts.indexOf('BP1') !== -1 && popts.indexOf('PX') === -1 && popts.indexOf('M1') === -1, 'product options: produced + by-product items only', popts.join(','));
  check(res.filter_options.op_types.length === 3 && res.filter_options.statuses.length === 3, 'op/status option lists');
}

console.log('\n2 — period bounds (inclusive)\n');
{
  const res = run({ from: '2026-09-01', to: '2026-09-30' });
  const p1 = rowFor(res, 'C1', 'P1');
  check(p1.mo_count === 2 && p1.produced_qty === 116, 'August MO7 drops out: 150 − 34 bulk', JSON.stringify({ c: p1.mo_count, q: p1.produced_qty }));
  check(res.totals.mo_count === 3 && res.totals.produced_qty === 182, 'totals follow the window (116 + 60 + 5 + 1)', res.totals.produced_qty);
  check(p1.batch_cost === 1500 && res.totals.batch_cost === 2100, 'costs follow the window too', res.totals.batch_cost);
  const edge = run({ from: '2026-09-05', to: '2026-09-05' });
  check(edge.totals.mo_count === 1, 'single-day window is inclusive');
}

console.log('\n3 — explicit statuses, client/product/op filters, errors\n');
{
  const st = run({ statuses: ['Locked', 'In Progress'] });
  const p3 = rowFor(st, 'C2', 'P3');
  check(!!p3 && p3.mo_count === 1 && p3.produced_qty === 200, 'opt-in statuses admit MO4');
  check(st.totals.mo_count === 5 && st.totals.produced_qty === 407, 'totals admit it too', st.totals.produced_qty);
  check(st.kpi_totals.produced_qty === 407 && st.kpi_totals.batch_cost === 4350, 'KPIs follow');

  const c2 = run({ client_ids: ['C2'] });
  check(c2.rows.length === 1 && c2.rows[0].product_id === 'BP1' && c2.totals.produced_qty === 5, 'client filter C2 finds its by-product from C1 and C1-bulk MOs', JSON.stringify(c2.rows.map(r => r.product_id)));
  const c1 = run({ client_ids: ['C1'] });
  check(c1.rows.map(r => r.product_id).sort().join(',') === 'B1,P1,P2' && c1.totals.produced_qty === 201, 'client filter C1 drops other owners\' by-products (141 + 60)', c1.totals.produced_qty);

  const pf = run({ product_ids: ['P1'] });
  check(pf.rows.length === 1 && pf.rows[0].produced_qty === 141, 'product filter isolates P1, bulk deduction kept');
  const pb = run({ product_ids: ['BP1'] });
  check(pb.rows.length === 1 && pb.rows[0].client_id === 'C2', 'product filter reaches by-product items');

  const of = run({ op_types: [RP] });
  check(of.rows.length === 2 && of.totals.by_op[RP].mo_count === 1, 'op filter isolates the repack rows (P2 + its by-product)');
  check(of.totals.produced_qty === 0 && of.kpi_totals.produced_qty === 0 && of.totals.mo_count === 0, 'a repack-only filter produces zero production');

  const unk = run({ client_ids: ['ZZ'] });
  check(unk.rows.length === 0 && unk.totals.mo_count === 0, 'unknown ids match nothing, never error');
  check(unk.kpi_totals.produced_qty === 0 && unk.kpi_totals.by_op[TW].mo_count === 0, 'empty filtered result has zero KPI totals');
  let threw = null;
  try { run({ from: '2026-09-30', to: '2026-09-01' }); } catch (e) { threw = e; }
  check(!!threw, 'reversed bounds throw in Arabic');
}

console.log('\n3b — attribution to the MO client, data warnings\n');
{
  const mo = run({ attribution: 'mo' });
  check(mo.attribution === 'mo', 'attribution echoed');
  check(mo.rows.every(r => r.client_id === 'C1'), 'every by-product lands under its MO client C1', mo.rows.map(r => r.client_id + '|' + r.product_id).join(','));
  const bp1 = rowFor(mo, 'C1', 'BP1');
  check(!!bp1 && bp1.produced_qty === 5 && bp1.client_name === 'Client One', 'BP1 (owned by C2) counted for the MOs\' client: 3 + 2');
  const bp0 = rowFor(mo, 'C1', 'BP0');
  check(!!bp0 && bp0.produced_qty === 1 && bp0.by_op[RP].byproduct_qty === 2, 'unowned BP0 follows its MOs too (repack share kept per op only)');
  check(mo.totals.produced_qty === 207 && mo.kpi_totals.produced_qty === 207, 'attribution moves lines between clients, never changes the grand total');
  const moC1 = run({ attribution: 'mo', client_ids: ['C1'] });
  check(moC1.totals.produced_qty === 207, 'client C1 under MO attribution carries everything its runs made (207)', moC1.totals.produced_qty);
  check(run({ attribution: 'mo', client_ids: ['C2'] }).rows.length === 0, 'client C2 owns no runs → no rows under MO attribution');
  check(run({ attribution: 'xx' }).attribution === 'item', 'unknown attribution falls back to item');

  const w = run({}).warnings;
  const bpw = w.byproduct_other_client;
  check(bpw.length === 4 && w.byproduct_other_client_qty === 8, 'four by-product lines under another / no client (3 + 1 + 2 + 2)', JSON.stringify(bpw.map(x => x.mo_code + ':' + x.item)));
  check(bpw[0].mo_code === 'MO8' && bpw[0].date === '2026-09-03' && bpw[0].item_client_name === 'Client Two' && bpw[0].mo_client_name === 'Client One',
    'by-product warning names both clients, sorted by date', JSON.stringify(bpw[0]));
  check(bpw.some(x => x.mo_code === 'MO3' && x.op === RP && x.item_client_name === 'بدون عميل'), 'repack by-products are warned about too');
  check(w.bulk_other_client.length === 1 && w.bulk_other_client[0].item === 'B2' && w.bulk_other_client_qty === 4, 'other-client bulk drawn listed once (B2 4)');
  check(w.repack_unbalanced.length === 1 && w.repack_unbalanced[0].mo_code === 'MO3' && w.repack_unbalanced[0].diff_qty === 2 &&
    w.repack_unbalanced[0].output_qty === 32 && w.repack_unbalanced[0].drawn_qty === 30, 'repack MO3 packed 32 from 30 drawn: +2 flagged', JSON.stringify(w.repack_unbalanced));
  check(w.unowned_product.length === 0, 'no in-scope MO without a client (blank-date MO6 stays out)');
  check(w.other_status.map(s => s.status + ':' + s.mo_count + ':' + s.qty).join(',') === 'Draft:1:999,In Progress:1:200',
    'MOs left out by the status filter are counted', JSON.stringify(w.other_status));
  check(run({ statuses: ['Locked', 'In Progress', 'Draft'] }).warnings.other_status.length === 0, 'nothing left out when every status is selected');

  const wc2 = run({ client_ids: ['C2'] }).warnings;
  check(wc2.byproduct_other_client.length === 2 && wc2.bulk_other_client.length === 1, 'client filter keeps warnings where the client is on either side');
  check(wc2.other_status.map(s => s.status).join(',') === 'In Progress', 'status tally follows the client filter');

  hdrPush({ unique_id: 'MO9', operation_type: TW, mo_status: 'Locked', manufacture_date: new Date(2026, 8, 18), produced_product: 'P9', actual_qty: 12, total_batch_cost: 0 });
  const wu = run({}).warnings;
  check(wu.unowned_product.length === 1 && wu.unowned_product[0].mo_code === 'MO9' && wu.unowned_product[0].date === '2026-09-18' && wu.unowned_product_qty === 12,
    'produced product with no client is warned about (Date cell formatted)', JSON.stringify(wu.unowned_product));
  hdrPop();
}

console.log('\n4 — cost gating\n');
{
  const res = run({}, PLAIN);
  check(res.can_see_cost === false, 'grant flag false without the grant');
  const p1 = rowFor(res, 'C1', 'P1');
  check(p1.materials.length === 4, 'materials still listed');
  check(p1.materials.every(m => !('total_cost' in m)), 'material costs deleted, never zeroed');
  check(p1.bulk_used_by_op[TW].every(m => !('total_cost' in m)), 'bulk detail costs deleted too');
  const bp1 = rowFor(res, 'C2', 'BP1');
  check(Object.keys(bp1.byproducts_by_op).every(t => bp1.byproducts_by_op[t].every(m => !('total_cost' in m))), 'by-product costs deleted too');
  check(p1.produced_qty === 141 && res.totals.produced_qty === 207, 'quantities unaffected by gating');
  check(!('batch_cost' in p1) && !('batch_cost' in res.totals), 'header batch costs deleted, never zeroed');
  check(Object.keys(p1.by_op).every(t => !('batch_cost' in p1.by_op[t])) && Object.keys(res.totals.by_op).every(t => !('batch_cost' in res.totals.by_op[t])), 'per-op batch costs deleted too');
  check(!('batch_cost' in res.kpi_totals) && !('batch_cost' in res.kpi_totals.by_op[TW]), 'KPI costs are also stripped without the cost grant');
  const cost = run({});
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
  // numCell(label, …) emits data-label="<label>" for every numeric cell.
  check(/function numCell\(label[\s\S]{0,80}data-label="' \+ label/.test(page) &&
    (page.match(/data-label="/g) || []).length + (page.match(/numCell\('/g) || []).length > 20, 'emitted cells carry data-labels');
  check(page.indexOf('opSectionsHtml') !== -1 && page.indexOf('tablesSumHtml') !== -1, 'one production table per op type plus a sum-of-tables');
  check(page.indexOf('FILTER_SIG') !== -1, 'filter bar rebuilds only when options change (no mid-typing popout)');
  check(page.indexOf('c-client') !== -1 && page.indexOf('c-product') !== -1, 'narrow client / wide product column classes');
  check(page.indexOf('byproducts_by_op') !== -1 && page.indexOf('bulk_used_by_op') !== -1, 'by-products and bulk drawn rendered per op, under their production table');
  check(page.indexOf('bulk_used_qty') !== -1 && page.indexOf('صافي الإنتاج') !== -1, 'production tables show the bulk deduction and the net');
  check(page.indexOf('للعلم فقط') !== -1, 'repack section marked reference-only');
  check(page.indexOf('batch_cost') !== -1, 'per-op batch cost totals flow to KPIs and tables');
  check(page.indexOf('kpi_totals') !== -1 && page.indexOf('kpi_operation_types') !== -1, 'page consumes the scoped KPI response');
  check(page.indexOf('إجمالي المنتج — صافي (') !== -1 && page.indexOf('إجمالي التكلفة (') !== -1, 'KPI cards label their two-operation scope');
  check(/attribution:\s*F_ATTR/.test(page) && page.indexOf('data-mfgrep-attr') !== -1 && /\['attr',/.test(page),
    'attribution switch sent to the server, rendered in the bar, kept in the URL');
  check(page.indexOf('warningSets') !== -1 && /kpis \+ warningsHtml\(\) \+ main/.test(page) && page.indexOf('var wsets = warningSets()') !== -1,
    'data warnings shown on screen and in the print / Excel document');
  check(['byproduct_other_client', 'bulk_other_client', 'repack_unbalanced', 'unowned_product', 'other_status'].every(k => page.indexOf('w.' + k) !== -1),
    'every warning kind the server returns is rendered');
  check(page.indexOf('لنفس عميل المنتج') === -1 && page.indexOf('أياً كان صاحبها') !== -1, 'footnote states the any-owner bulk rule, not the old same-client one');
}

if (failed) { console.log('\ns27_mfg_client_report FAILED: ' + failed); process.exitCode = 1; }
else console.log('\ns27_mfg_client_report: PASS');
