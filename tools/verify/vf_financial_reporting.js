/* Offline acceptance tests for the fast Valley Foods income statement core. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const actions = fs.readFileSync(path.join(__dirname, '..', '..', 'Company_ValleyFoods_Actions.js'), 'utf8');
const start = actions.indexOf('var ValleyFoodsFinancialReporting =');
const end = actions.indexOf('if (typeof ValleyFoods', start);
if (start < 0 || end < 0) throw new Error('Financial module marker not found in Company_ValleyFoods_Actions.js');
const source = actions.slice(start, end);

function pull(name) {
  const i = source.indexOf('function ' + name);
  if (i < 0) throw new Error('missing function ' + name);
  let d = 0, j = i;
  for (; j < source.length; j++) {
    if (source[j] === '{') d++;
    if (source[j] === '}') { d--; if (d === 0) break; }
  }
  return source.slice(i, j + 1);
}
const fns = ['str_', 'qty_', 't_', 'round_', 'r3_', 'map_', 'rawNum_', 'unitCost_', 'ident_', 'core_'];
eval(fns.map(pull).join('\n'));

const fromT = t_('2026-09-01'), toT = t_('2026-09-30');
function baseS() {
  return {
    cost: true, ok: { invoices: true, lines: true, returns: true },
    ix: {
      invoices: {}, lines: {}, returns: {},
      purchases: { 'B-A': { unit_cost: 12.5, movement_code: 'PO-1001' } },
      manufacture: { 'B-B': { total_batch_cost: 300, actual_qty: 40, transaction_code: 'MO-55' } },
      byproducts: { 'B-C': { total_cost: 90, qty: 30 } }
    },
    allocByLine: { 'L1': [{ product_unique_id: 'B-A', product_qty: 10 }], 'L2': [{ product_unique_id: 'B-B', product_qty: 5 }] },
    productCat: { 'P1': '1', 'P2': '3' },
    invDate: { 'INV-1': t_('2026-09-10'), 'INV-2': t_('2026-08-01') },
    retDate: { 'R1': t_('2026-09-20'), 'R2': t_('2026-10-01') },
    rows: {
      lines: [
        { unique_id: 'L1', valley_sales_header_id: 'INV-1', product_net_value: 600, product_qty: 10 },
        { unique_id: 'L2', valley_sales_header_id: 'INV-1', product_net_value: 200, product_qty: 5 },
        { unique_id: 'L3', valley_sales_header_id: 'INV-2', product_net_value: 999, product_qty: 9 },
        { unique_id: 'L4', valley_sales_header_id: 'NOPE', product_net_value: 50, product_qty: 1 }
      ],
      returns: [
        { unique_id: 'R1', valley_return_date: '2026-09-20', valley_return_value: 100 },
        { unique_id: 'R2', valley_return_date: '2026-10-01', valley_return_value: 50 }
      ],
      allocations: [
        { unique_id: 'A1', valley_sales_products_id: 'L1', product_unique_id: 'B-A', product_qty: 10 },
        { unique_id: 'A2', valley_sales_products_id: 'L2', product_unique_id: 'B-B', product_qty: 5 }
      ],
      manufacture: [
        { unique_id: 'B-B', actual_qty: 40, manufacture_date: '2026-09-10', mo_status: 'Locked' },
        { unique_id: 'B-X', actual_qty: 999, manufacture_date: '2026-09-10', mo_status: 'Draft' }
      ],
      byproducts: [{ unique_id: 'B-C', qty: 30, manufacture_date: '2026-09-12' }],
      purchases: [
        { unique_id: 'B-A', product: 'P1', qty: 100, receipt_date: '2026-08-01', movement_code: 'PO-1001' },
        { unique_id: 'B-D', product: 'P2', qty: 50, receipt_date: '2026-09-05' }
      ],
      products: [{ id: 'P1', category: '1' }, { id: 'P2', category: '3' }],
      returnStock: [{ unique_id: 'RS1', valley_sales_returns_id: 'R1', product_unique_id: 'B-A', product_qty: 2 }],
      warehouse: [{ unique_id: 'W1', item: 'B-A', movement_date: '2026-09-15', movmenent_sign: -3 }],
      consumption: [{ unique_id: 'F1', item: 'B-B', qty: 5, created_at: '2026-09-18' }]
    }
  };
}

// 1. One pass yields revenue: gross − returns = net; out-of-period and unlinked rows excluded.
const r = core_(baseS(), fromT, toT);
assert.deepStrictEqual(r.revenue, { gross: 800, returns: 100, net: 700, line_count: 2, return_count: 1, sources_ready: true });

// 2. Unit cost follows the stock formula: purchasing → manufacture → by-product → null.
const s0 = baseS();
assert.strictEqual(unitCost_(s0, 'B-A'), 12.5);
assert.strictEqual(unitCost_(s0, 'B-B'), 7.5);
assert.strictEqual(unitCost_(s0, 'B-C'), 3);
assert.strictEqual(unitCost_(s0, 'NOPE'), null);
assert.strictEqual(ident_(s0, 'B-A'), 'PO-1001');
assert.strictEqual(ident_(s0, 'B-B'), 'MO-55');
assert.strictEqual(ident_(s0, 'B-C'), '');

// 3. COGS = allocated qty × batch unit cost, with idents.
assert.deepStrictEqual({ value: r.cogs.value, qty: r.cogs.qty, unpriced_qty: r.cogs.unpriced_qty }, { value: 162.5, qty: 15, unpriced_qty: 0 });
assert.deepStrictEqual(r.cogs.lines, [
  { batch: 'B-A', ident: 'PO-1001', qty: 10, unit_cost: 12.5, total: 125 },
  { batch: 'B-B', ident: 'MO-55', qty: 5, unit_cost: 7.5, total: 37.5 }
]);

// 4. Stock replay: start + legs = end; fixed assets out of purchasing only.
assert.deepStrictEqual(r.stock, {
  lines: [
    { batch: 'B-A', ident: 'PO-1001', start: 100, purchasing: 0, in_other: 2, sold: 10, out_other: 3, excluded: 0, end: 89,
      unit_cost: 12.5, start_v: 1250, purch_v: 0, end_v: 1112.5, cogs_v: 125 },
    { batch: 'B-B', ident: 'MO-55', start: 0, purchasing: 0, in_other: 40, sold: 5, out_other: 5, excluded: 0, end: 30,
      unit_cost: 7.5, start_v: 0, purch_v: 0, end_v: 225, cogs_v: 37.5 },
    { batch: 'B-C', ident: '', start: 0, purchasing: 0, in_other: 30, sold: 0, out_other: 0, excluded: 0, end: 30,
      unit_cost: 3, start_v: 0, purch_v: 0, end_v: 90, cogs_v: 0 },
    { batch: 'B-D', ident: '', start: 0, purchasing: 0, in_other: 0, sold: 0, out_other: 0, excluded: 50, end: 50,
      unit_cost: null, start_v: null, purch_v: null, end_v: null, cogs_v: null }
  ],
  excluded_fixed: 50
});
r.stock.lines.forEach(l => {
  assert.strictEqual(Math.round((l.start + l.purchasing + l.in_other - l.sold - l.out_other + l.excluded) * 1000) / 1000, l.end, 'equation ties for ' + l.batch);
});

// 5. Lines without an allocation land in unpriced_qty with no stock legs.
const s2 = baseS();
s2.rows.lines = [{ unique_id: 'L9', valley_sales_header_id: 'INV-1', product_net_value: 40, product_qty: 4 }];
s2.rows.allocations = [];
s2.rows.manufacture = [];
s2.rows.byproducts = [];
s2.rows.purchases = [];
s2.rows.returnStock = [];
s2.rows.warehouse = [];
s2.rows.consumption = [];
s2.allocByLine = Object.create(null);
const r2 = core_(s2, fromT, toT);
assert.deepStrictEqual(r2.revenue.gross, 40);
assert.deepStrictEqual({ value: r2.cogs.value, unpriced_qty: r2.cogs.unpriced_qty, lines: r2.cogs.lines }, { value: 0, unpriced_qty: 4, lines: [] });
assert.deepStrictEqual(r2.stock, { lines: [], excluded_fixed: 0 });

// 6. The module stays lean: single-pass core, direct reads, no comparison.
assert(!/function build_\(|function revenue_\(|function cogs_\(|function stock_\(|detailAction_|hierarchy|unclassified|coverage|addNote_|getReadOnlyRecords_|prior/.test(source), 'old machinery must be gone');
assert(!/prior_start|prior_end|prior_period|prior_revenue|prior_cogs|prior_stock|prior_gross/.test(source), 'no comparison leftovers');

// 7. The page is single-period with the stock popup modal.
const page = fs.readFileSync(path.join(__dirname, '..', '..', 'Company_ValleyFoods_IncomeStatement.html'), 'utf8');
['صافي الإيراد', 'تكلفة المبيعات', 'مجمل الربح', 'مخزون أول', 'مشتريات', 'مخزون آخر', 'رقم التعريف', 'تكلفة الوحدة', 'إجمالي التكلفة', 'is-cogs-row', 'is-stock-modal', 'is-batch-modal', 'رصيد آخر المدة'].forEach(t => assert(page.includes(t), 'page must show ' + t));
assert(!/pfrom|pto|prior|المقارنة/.test(page), 'no comparison leftovers on page');

console.log('vf_financial_reporting: 7 acceptance groups passed');
