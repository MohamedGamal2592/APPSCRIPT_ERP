'use strict';

/**
 * TR: MFG fast reads — list and detail equivalence, and the edit token.
 *
 * WHAT THIS PROVES (Plan_MFG_Read_Design.md §6, plan §7 step 7b)
 *   1. The list: with the fast header read on, the registered
 *      `get_valley_mfg_orders` response is `JSON.stringify`-identical to the
 *      legacy response for a filter-free list, each filter dimension, a date
 *      range and paging — the assembling code is shared, so a difference can
 *      only come from the read. The admin shadow target `vf_mfg_orders` reports
 *      zero diffs with the flag off.
 *   2. The detail: the registered `get_valley_mfg_order_detail` response is
 *      identical to the legacy response for an order with outputs, footers,
 *      work ops and by-products, for an order with no children, and for an
 *      unknown uid (the error path).
 *   3. **The edit token is byte-identical** on every fixture and scope, which is
 *      the assertion that protects the save path (the token is computed by the
 *      legacy state function in this revision — design §5).
 *   4. Fail-open: an engine abort answers from the legacy reads.
 *
 * PRIVACY (G7): fixture values are invented; the comparison reports paths,
 * types, hashes and counts only.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

const HEADER = 'valley_manufacture_header';
const OUTPUTS = 'valley_manufacture_header_products';
const FOOTER = 'valley_manufacture_footer';
const WORKOPS = 'valley_manufacture_work_center';
const BYPRODUCT = 'valley_manufacture_by_product';
const RECIPE = 'valley_product_recipe';
const CATEGORIES = 'valley_categories';
const PRODUCTS = 'valley_products';

/* The canonical header lists from the module: the schema gate is positional
 * over the first 20 header columns, so fixtures must use the real layout. */
const HEADER_COLS = ['unique_id', 'id', 'transaction_code', 'transaction_type', 'code', 'operation_type',
  'shift', 'by_product_nrv_value', 'total_inventory_cost', 'total_other_cost', 'total_batch_cost',
  'manufacture_date', 'produced_product', 'product_category', 'manufactured_qty', 'expected_qty',
  'actual_qty', 'manufacture_internal_batch', 'manufacture_batch', 'user', 'created_at', 'mo_status',
  'abnormal_amount', 'production_approval', 'production_approval_time', 'quality_approval',
  'quality_approval_time', 'recipe_id'];
const OUTPUT_COLS = ['unique_id', 'id', 'valley_manufacture_header_id', 'product_id', 'product_name',
  'product_qty', 'cost_unit', 'total_cost', 'user', 'created_at'];
const FOOTER_COLS = ['unique_id', 'id', 'valley_manufacture_header_product_id', 'item', 'item_code', 'qty',
  'cost_unit', 'total_cost', 'created_at', 'user'];
const WORKOP_COLS = ['unique_id', 'id', 'valley_manufacture_header_id', 'work_center_sequence', 'recipe_id',
  'operation_status', 'start_time', 'end_time', 'notes', 'actual_hours', 'work_center_cost', 'total_cost',
  'last_pause_time', 'total_pause_duration', 'user', 'created_at'];
const BYPRODUCT_COLS = ['unique_id', 'id', 'valley_manufacture_header_id', 'code', 'manufacture_date',
  'transaction_code', 'item', 'qty', 'total_cost', 'manufacture_internal_batch', 'user', 'created_at'];
const D = (day) => new Date(2026, 2, day, 9, 0, 0);

function header(uid, id, batch, status, qty) {
  const r = new Array(HEADER_COLS.length).fill('');
  r[0] = uid; r[1] = id;
  r[5] = 'تصنيع (كميات)'; r[6] = 'وردية 1'; r[11] = D(1);
  r[12] = 'P1'; r[13] = 'C1'; r[14] = qty; r[18] = batch; r[21] = status; r[27] = 'R1';
  return r;
}

function build(H) {
  H.addSheet(HEADER, HEADER_COLS, [
    header('MO-B', 2, 'BATCH-2', 'Locked', 100),
    header('MO-A', 1, 'BATCH-1', 'Draft', 50),
    header('MO-C', 3, '', 'Locked', 10)
  ]);
  H.addSheet(OUTPUTS, OUTPUT_COLS, [
    ['OUT-1', 1, 'MO-B', 'P1', 'PRODUCT-ONE', 60, 2, 120, 'u', D(1)],
    ['OUT-2', 2, 'MO-B', 'P2', 'PRODUCT-TWO', 40, 1, 40, 'u', D(1)],
    ['OUT-X', 3, 'MO-C', 'P1', 'PRODUCT-ONE', 5, 1, 5, 'u', D(1)]
  ]);
  H.addSheet(FOOTER, FOOTER_COLS, [
    ['FO-1', 1, 'OUT-1', 'MAT-1', 'LOT-1', 12, 3, 36, D(1), 'u'],
    ['FO-2', 2, 'OUT-1', 'MAT-2', 'LOT-2', 4, 7, 28, D(1), 'u'],
    ['FO-3', 3, 'MO-B', 'MAT-3', 'LOT-3', 2, 1, 2, D(1), 'u'],
    ['FO-X', 4, 'OUT-X', 'MAT-1', 'LOT-9', 1, 1, 1, D(1), 'u']
  ]);
  H.addSheet(WORKOPS, WORKOP_COLS, [
    ['WO-1', 1, 'MO-B', 1, 'WC-1', 'Done', '', '', 'note', 3, 0, 0, '', 0, 'u', D(1)],
    ['WO-X', 2, 'MO-C', 1, 'WC-1', 'Pending', '', '', '', '', 0, 0, '', 0, 'u', D(1)]
  ]);
  H.addSheet(BYPRODUCT, BYPRODUCT_COLS, [
    ['BP-1', 1, 'MO-B', 'CODE-1', D(1), 'T1', 'MAT-9', 2, 8, 'IB-1', 'u', D(1)]
  ]);
  H.addSheet(RECIPE, ['unique_id', 'recipe_code', 'id', 'recipe_name', 'is_active'], [['R1', 'RC-1', 1, 'RECIPE ONE', true]]);
  H.addSheet(CATEGORIES, ['id', 'name', 'name_ar'], [['C1', 'CATEGORY ONE', 'CATEGORY ONE AR']]);
  H.addSheet(PRODUCTS, ['id', 'name_ar', 'unique_id', 'unit_cost'], [['P1', 'PRODUCT-ONE', 'B1', 3], ['P2', 'PRODUCT-TWO', 'B2', 1], ['MAT-1', 'MATERIAL ONE', 'MAT-1', 3]]);
  H.addSheet('valley_work_centers', ['unique_id', 'name_en', 'name_ar', 'id'], [['WC-1', 'CENTER', 'ONE', 1]]);
  /* The footer unit-cost lookup reads valley_current_products, not the products
   * table (its own deliberately separate read). */
  H.addSheet('valley_current_products', ['unique_id', 'unit_cost'], [['MAT-1', 3], ['MAT-2', 7]]);
}

const H_ON = createVfHarness({
  sourcePatches: [{ file: 'Company_ValleyFoods_Actions.js', find: 'var MFG_FAST_READ_ = false;', replace: 'var MFG_FAST_READ_ = true;' }]
});
const H_OFF = createVfHarness();
build(H_ON); build(H_OFF);
H_ON.eval('FAST_READ_CORE_ = true;');
H_OFF.eval('FAST_READ_CORE_ = false;');

/* ── 1. the list is identical, filter by filter ──────────────────────────── */
const LIST_PAYLOADS = [
  { name: 'no filters', payload: {} },
  { name: 'operation type', payload: { operation_type: 'تصنيع' } },
  { name: 'shift', payload: { shift: 'صباحي' } },
  { name: 'produced product', payload: { produced_product: 'P1' } },
  { name: 'category', payload: { product_category: 'C1' } },
  { name: 'batch', payload: { manufacture_batch: 'BATCH-2' } },
  { name: 'date range', payload: { from: '2026-03-01', to: '2026-03-02' } },
  { name: 'paged', payload: { offset: 1, limit: 1 } },
  { name: 'no match', payload: { operation_type: 'NOPE' } }
];
LIST_PAYLOADS.forEach(function (c) {
  H_ON.newExecution();
  H_OFF.newExecution();
  const modern = H_ON.dispatch('get_valley_mfg_orders', c.payload);
  const legacy = H_OFF.dispatch('get_valley_mfg_orders', c.payload);
  assert.strictEqual(JSON.stringify(modern), JSON.stringify(legacy),
    'list/' + c.name + ': the fast response equals the legacy response');
});
{
  const list = H_OFF.dispatch('get_valley_mfg_orders', {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(list.filter_options.batches)), ['BATCH-1', 'BATCH-2'],
    'the unfiltered dropdown values come from the whole set');
  assert.strictEqual(list.total, 3, 'total counts all orders');
  assert.strictEqual(list.orders[0].id, 3, 'the list is newest-first by id');
  assert.strictEqual(list.orders[0].product_category, 'CATEGORY ONE', 'categories are labelled');

  H_OFF.newExecution();
  const report = H_OFF.dispatch('fr_shadow_compare', { target: 'vf_mfg_orders', payload: { operation_type: 'تصنيع' } });
  assert.strictEqual(report.diffCount, 0, 'the admin shadow target reports zero diffs: ' + JSON.stringify(report.diffs));
}

/* ── 2. the detail is identical, and the token is byte-identical ─────────── */
const DETAIL_PAYLOADS = [
  { name: 'with children', payload: { mo_uid: 'MO-B' } },
  { name: 'without children', payload: { mo_uid: 'MO-C' } }
];
DETAIL_PAYLOADS.forEach(function (c) {
  H_ON.newExecution();
  H_OFF.newExecution();
  const modern = H_ON.dispatch('get_valley_mfg_order_detail', c.payload);
  const legacy = H_OFF.dispatch('get_valley_mfg_order_detail', c.payload);
  assert.strictEqual(JSON.stringify(modern), JSON.stringify(legacy),
    'detail/' + c.name + ': the fast response equals the legacy response');
  assert.strictEqual(modern.edit_token, legacy.edit_token,
    'detail/' + c.name + ': the edit token is byte-identical');
  assert.ok(modern.edit_token, 'and it is a real token');
  assert.strictEqual(modern.save_scope.join(','), legacy.save_scope.join(','), 'and the save scope matches');
});

{
  const detail = H_ON.dispatch('get_valley_mfg_order_detail', { mo_uid: 'MO-B' });
  assert.strictEqual(detail.order.unique_id, 'MO-B');
  assert.strictEqual(detail.outputs.length, 2, 'outputs come from the fast document');
  assert.strictEqual(detail.outputs[0].footers.length, 2, 'footers are attached with unit costs');
  assert.strictEqual(detail.outputs[0].footers[0].unit_cost, 3, 'the batch unit-cost lookup is unchanged');
  assert.ok(detail.workops.length >= 1, 'work ops still come from their own handler');
  assert.ok(detail.byproducts.length >= 1, 'by-products too');

  /* The token must also be stable across repeated calls (no ordering drift). */
  H_ON.newExecution();
  const again = H_ON.dispatch('get_valley_mfg_order_detail', { mo_uid: 'MO-B' });
  assert.strictEqual(again.edit_token, detail.edit_token, 'the token does not drift between calls');

  /* Unknown uid: the legacy error survives on both paths. */
  H_ON.newExecution();
  H_OFF.newExecution();
  let fastErr = null, legacyErr = null;
  try { H_ON.dispatch('get_valley_mfg_order_detail', { mo_uid: 'NOPE' }); } catch (e) { fastErr = e; }
  try { H_OFF.dispatch('get_valley_mfg_order_detail', { mo_uid: 'NOPE' }); } catch (e) { legacyErr = e; }
  assert.ok(fastErr && legacyErr, 'both paths refuse an unknown order');
  assert.strictEqual(fastErr.message, legacyErr.message, 'with the same message');
}

/* ── 3. metrics, and no matched-row-only claim ───────────────────────────── */
{
  H_ON.newExecution();
  const before = H_ON.logs.length;
  H_ON.dispatch('get_valley_mfg_orders', {});
  const listLine = H_ON.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  const lm = JSON.parse(listLine.slice(listLine.indexOf('{')));
  assert.strictEqual(lm.rowsScanned, 3, 'the list scans the table and says so');
  assert.ok(lm.serviceCalls <= 3, 'list serviceCalls <= 3 (got ' + lm.serviceCalls + ')');
  assert.strictEqual(lm.cacheOutcome, 'disabled', 'the MFG list opens no cache');

  H_ON.newExecution();
  const before2 = H_ON.logs.length;
  H_ON.dispatch('get_valley_mfg_order_detail', { mo_uid: 'MO-B' });
  const docLine = H_ON.logs.slice(before2).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  const dm = JSON.parse(docLine.slice(docLine.indexOf('{')));
  assert.ok(dm.rowsScanned >= 6, 'the detail reports every section scan (got ' + dm.rowsScanned + ')');
  assert.ok(dm.colsRead > 0 && dm.bytesRead > 0, 'columns and bytes are reported');
}

/* ── 4. fail-open ────────────────────────────────────────────────────────── */
{
  const H_BROKEN = createVfHarness({
    sourcePatches: [
      { file: 'Company_ValleyFoods_Actions.js', find: 'var MFG_FAST_READ_ = false;', replace: 'var MFG_FAST_READ_ = true;' },
      {
        file: 'Core_FastRead.js',
        find: 'function fastFetchList_(spec) {\n  var s = spec || {};',
        replace: 'function fastFetchList_(spec) {\n  var s = spec || {};\n  if (typeof __harnessForceAbort_ !== "undefined" && __harnessForceAbort_) throw frError_("FR_BUDGET_EXCEEDED", "harness: simulated abort");'
      },
      {
        file: 'Core_FastRead.js',
        find: 'function fastFetchDocument_(spec) {\n  var s = spec || {};',
        replace: 'function fastFetchDocument_(spec) {\n  var s = spec || {};\n  if (typeof __harnessForceAbort_ !== "undefined" && __harnessForceAbort_) throw frError_("FR_BUDGET_EXCEEDED", "harness: simulated abort");'
      }
    ]
  });
  build(H_BROKEN);
  H_BROKEN.eval('FAST_READ_CORE_ = true; __harnessForceAbort_ = true;');
  H_BROKEN.newExecution();
  const logsBefore = H_BROKEN.logs.length;
  const list = H_BROKEN.dispatch('get_valley_mfg_orders', {});
  assert.strictEqual(list.total, 3, 'the list answers from the legacy read');
  const detail = H_BROKEN.dispatch('get_valley_mfg_order_detail', { mo_uid: 'MO-B' });
  assert.strictEqual(detail.outputs.length, 2, 'the detail answers from the legacy read');
  const fallbacks = H_BROKEN.logs.slice(logsBefore).filter((l) => l.indexOf('vf_fast_read_fallback') !== -1);
  assert.strictEqual(fallbacks.length, 2, 'both fallbacks are logged');
  assert.ok(fallbacks.every((l) => l.indexOf('FR_BUDGET_EXCEEDED') !== -1), 'with the engine code');
  assert.ok(fallbacks.every((l) => l.indexOf('MO-B') === -1), 'and no business value');
}

console.log('mfg_fast_read: PASS');
