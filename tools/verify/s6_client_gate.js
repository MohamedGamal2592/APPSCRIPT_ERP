/**
 * S6 verification (U-46) — client-side cost gating, by actually rendering.
 *
 * Boots the REAL Company_ValleyFoods_MfgOrderView.html under the page harness,
 * loads the same manufacturing order twice — once with can_see_cost true and
 * once false — and asserts on the HTML each draw function really produced.
 *
 * Run: node tools/verify/s6_client_gate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEW = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_MfgOrderView.html'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

/* ── Fixtures. The no-grant variant is built by deleting cost keys, exactly as
      the server's vfStripCost_ does — never by zeroing them. ─────────────── */
const COST_KEYS = {
  order: ['total_inventory_cost', 'total_other_cost', 'total_batch_cost', 'by_product_nrv_value'],
  output: ['cost_unit', 'total_cost'],
  footer: ['unit_cost', 'total_cost'],
  workop: ['work_center_cost', 'total_cost'],
  bp: ['total_cost'],
  batch: ['unit_cost']
};
const strip = (o, keys) => { keys.forEach(k => delete o[k]); return o; };

function detail(canSeeCost) {
  const order = {
    unique_id: 'MO-1', transaction_code: 'MO-000007', mo_status: 'Draft',
    manufacture_date: '2026-09-01', operation_type: 'إنتاج', shift: 'صباحية',
    produced_product: 'P-9', manufactured_qty: 100, expected_qty: 65, actual_qty: 64,
    recipe_id: '', manufacture_batch: 'B1',
    total_inventory_cost: 250, total_other_cost: 40, total_batch_cost: 290, by_product_nrv_value: 11.5
  };
  const outputs = [{
    unique_id: 'OUT-1', product_id: 'P-1', product_qty: 100, product_name: 'خامة أ',
    cost_unit: 19.75, total_cost: 1975,
    footers: [
      { unique_id: 'F-1', item: 'B-001', item_code: 'LOT-A', qty: 60, unit_cost: 12.5, total_cost: 750 },
      { unique_id: 'F-2', item: 'B-002', item_code: 'LOT-B', qty: 40, unit_cost: 7.25, total_cost: 290 }
    ],
    batches: [
      { batch_uid: 'B-001', lot: 'LOT-A', current_qty: 500, available: 500, unit_cost: 12.5, transaction_date: '2026-01-05', unit: 'kg' },
      { batch_uid: 'B-002', lot: 'LOT-B', current_qty: 300, available: 275, unit_cost: 7.25, transaction_date: '2026-02-11', unit: 'kg' }
    ]
  }];
  const workops = [{
    unique_id: 'WC-1', work_center_sequence: 1, work_center_id: 'WCX', operation_status: 'Done',
    start_time: '2026-09-01T08:00:00Z', end_time: '2026-09-01T12:00:00Z', actual_hours: 4,
    total_pause_duration: 0, notes: 'n', work_center_cost: 37.5, total_cost: 150
  }];
  const byproducts = [{ unique_id: 'BP-1', item: 'P-3', qty: 5, transaction_code: 'TC-1', total_cost: 88.25, product_name: 'مرافق' }];

  if (!canSeeCost) {
    strip(order, COST_KEYS.order);
    outputs.forEach(o => { strip(o, COST_KEYS.output); o.footers.forEach(f => strip(f, COST_KEYS.footer)); o.batches.forEach(b => strip(b, COST_KEYS.batch)); });
    workops.forEach(w => strip(w, COST_KEYS.workop));
    byproducts.forEach(b => strip(b, COST_KEYS.bp));
  }
  return {
    status: 'success', is_new: false, can_see_cost: canSeeCost,
    recipe_options: [], product_options: [{ value: 'P-1', label: 'خامة أ' }, { value: 'P-3', label: 'مرافق' }],
    work_center_options: [{ value: 'WCX', label: 'مركز 1' }], enums: { operation_type: ['إنتاج'], shift: ['صباحية'] },
    order: order, outputs: outputs, workops: workops, byproducts: byproducts
  };
}

async function render(canSeeCost) {
  const s = bootPage({
    page: 'Company_ValleyFoods_MfgOrderView.html',
    isSuperAdmin: true,
    call: (action, data) => {
      if (action === 'get_valley_mfg_order_detail') return detail(canSeeCost);
      if (action === 'get_valley_product_batches') {
        const b = detail(canSeeCost).outputs[0].batches;
        return { status: 'success', batches: b };
      }
      return { status: 'success' };
    }
  });
  s.MFGVIEW_PAGE.load();
  await flush(); await flush(); await flush();
  return s;
}

(async function () {
  const withCost = await render(true);
  const without = await render(false);

  console.log('S6 — the page picked the flag up\n');
  check(VIEW.indexOf('CAN_SEE_COST = (res.can_see_cost !== false);') !== -1,
    'load() sets CAN_SEE_COST from the server response');
  check(/var CAN_SEE_COST = true;/.test(VIEW),
    'it defaults to true, so a response without the flag behaves as today');
  check(VIEW.indexOf("USER_PAGES['valley_cost_view']") === -1 &&
        VIEW.indexOf('USER_PAGES["valley_cost_view"]') === -1,
    'it is NOT re-derived from USER_PAGES (which cannot see the fail-open guard)');

  console.log('\nS6 — work-ops table\n');
  const wopWith = withCost.html('workops-body');
  const wopNo = without.html('workops-body');
  check(wopWith.indexOf('تكلفة المركز') !== -1, 'with the grant: تكلفة المركز column present');
  check(wopWith.indexOf('37.500') !== -1, 'with the grant: the real figure 37.500 is rendered');
  check(wopWith.indexOf('150.000') !== -1, 'with the grant: the total 150.000 is rendered');
  check(wopNo.indexOf('تكلفة المركز') === -1, 'without: the column header is gone');
  check(wopNo.indexOf('37.5') === -1 && wopNo.indexOf('150.000') === -1,
    'without: no cost figure anywhere in the markup');
  check(wopNo.indexOf('0.000') === -1 || wopNo.indexOf('توقف: 0.000') !== -1,
    'without: no stray 0.000 standing in for a hidden cost');
  /* Quantities and workflow survive. */
  check(wopNo.indexOf('الساعات الفعلية') !== -1, 'without: الساعات الفعلية still shown');
  check(wopNo.indexOf('4.000') !== -1, 'without: the hours figure 4.000 still shown');

  console.log('\nS6 — column counts stay consistent\n');
  const countTh = h => (h.match(/<th[ >]/g) || []).length;
  const firstRowTds = h => {
    const m = h.match(/<tbody>([\s\S]*?)<\/tbody>/);
    if (!m) return 0;
    const r = m[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    return r ? (r[1].match(/<td[ >]/g) || []).length : 0;
  };
  check(countTh(wopWith) === firstRowTds(wopWith),
    'with the grant: ' + countTh(wopWith) + ' headers = ' + firstRowTds(wopWith) + ' cells');
  check(countTh(wopNo) === firstRowTds(wopNo),
    'without: ' + countTh(wopNo) + ' headers = ' + firstRowTds(wopNo) + ' cells');
  check(countTh(wopWith) - countTh(wopNo) === 2, 'exactly two columns disappear');

  console.log('\nS6 — KPI tiles\n');
  const kpiWith = withCost.html('mo-kpi-body');
  const kpiNo = without.html('mo-kpi-body');
  ['تكلفة الخامات', 'تكلفة التشغيل', 'تكلفة الدفعة', 'تكلفة الوحدة'].forEach(t => {
    check(kpiWith.indexOf(t) !== -1, 'with the grant: tile "' + t + '" present');
    check(kpiNo.indexOf(t) === -1, 'without: tile "' + t + '" gone');
  });
  check(kpiNo.indexOf('الكمية الفعلية') !== -1, 'without: the quantity tile stays');

  console.log('\nS6 — materials / consumed-batches table\n');
  const outWith = withCost.html('outputs-body');
  const outNo = without.html('outputs-body');
  check(outWith.indexOf('إجمالي التكلفة') !== -1, 'with the grant: إجمالي التكلفة column present');
  check(outNo.indexOf('إجمالي التكلفة') === -1, 'without: that column is gone');
  check(outNo.indexOf('المتاح') !== -1 && outNo.indexOf('المخصص') !== -1 && outNo.indexOf('المتبقي') !== -1,
    'without: available / allocated / remaining all still there');
  /* S8 replaced the old "إجمالي الكمية" summary with the per-row indicator. */
  check(outNo.indexOf('الكمية: ') !== -1 && outNo.indexOf('الدفعات: ') !== -1,
    'without: the row summary still shows quantity and batch count');
  check(outNo.indexOf('إجمالي التكلفة') === -1, 'without: but not the cost total');
  check(countTh(outWith) - countTh(outNo) === 1, 'exactly one column disappears from the batch table');

  console.log('\nS6 — by-products table\n');
  const bpWith = withCost.html('byproducts-body');
  const bpNo = without.html('byproducts-body');
  check(bpWith.indexOf('التكلفة') !== -1, 'with the grant: التكلفة column present');
  check(bpNo.indexOf('التكلفة') === -1, 'without: gone');
  check(bpNo.indexOf('الكمية') !== -1 && bpNo.indexOf('كود الدفعة') !== -1,
    'without: quantity and batch code stay');
  check(countTh(bpWith) - countTh(bpNo) === 1, 'exactly one column disappears');

  console.log('\nS6 — no cost value leaks into any rendered markup\n');
  const allNo = [wopNo, kpiNo, outNo, bpNo, without.html('vf-mo-view')].join('\n');
  ['37.5', '150.000', '12.500', '7.250', '1975', '88.25', '290', '19.75'].forEach(v => {
    check(allNo.indexOf(v) === -1, 'the figure ' + v + ' appears nowhere');
  });

  console.log('\nS6 — the print inherits the gate\n');
  check(VIEW.indexOf("(canCost() ? '<th>تكلفة المركز</th><th>الإجمالي</th>' : '')") !== -1,
    'print work-ops columns gated');
  check(VIEW.indexOf("if (canCost()) html += '<div>تكلفة المخزون: '") !== -1,
    'print totals line gated');
  check(/canCost\(\) \? '<th>التكلفة<\/th>' : ''/.test(VIEW),
    'print by-products column gated');

  console.log('\nS6 — the save payload no longer carries unit_cost\n');
  check(VIEW.indexOf('return { item: f.item, item_code: f.item_code, qty: f.qty };') !== -1,
    'footers are sent without unit_cost (S1 resolves it server-side)');
  check(VIEW.indexOf('qty: f.qty, unit_cost: f.unit_cost }') === -1,
    'the old payload shape is gone');

  console.log('\n' + (failed === 0
    ? 'S6 OK — costs vanish from the rendered markup; quantities and workflow stay.'
    : 'S6 FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})();
