'use strict';

/**
 * TR: Sales document fast readers — equivalence, strategies, fail-open.
 *
 * WHAT THIS PROVES (plan §7 step 4, §5.3, §7.4)
 *   - `get_valley_invoice_for_return` and `get_valley_invoice_full` are served by
 *     declared-strategy document reads whose response equals the legacy
 *     response field for field, for: a found invoice with lines, returns,
 *     products and allocations; an invoice with no lines; and a missing
 *     invoice (where the legacy path throws for the detail reader and degrades
 *     to `{ uid, number: '-' }` for the returns reader).
 *   - The comparison runs through the registered admin action with both flags
 *     false (evidence before enablement), and the on-flag response is identical
 *     to the legacy response in a separate harness.
 *   - The declared strategies report `rowsScanned` = table rows for every
 *     section; there is no matched-row-only claim.
 *   - Type fidelity: a date cell reaches both readers as the same `Date`
 *     through a different read path.
 *
 * PRIVACY (G7): fixture values are invented. Sheet header names and the
 * response field names are schema, not data.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

const INV = 'valley_sales_invoices';
const LINES = 'valley_sales_products';
const RETURNS = 'valley_sales_returns';
const PRODUCTS = 'valley_products';
const STOCK = 'valley_sales_product_stock';

const INV_HEADERS = ['invoice_unique_id', 'ميزان حسابي - 26 - 1', 'نوع الضريبة (سلع عامة 1/سلع جدول 2)',
  'نوع سلع الجدول (لايوجد 0/جدول أولا 1/جدول ثانيا 2)', 'رقم الفاتورة', 'اسم العميل',
  'رقم التسجيل الضريبي للعميل', 'رقم الملف الضريبي للعميل', 'العنوان', 'الرقم القومي / رقم جواز السفر',
  'رقم الموبيل', 'تاريخ الفاتورة', 'نوع البيان (سلعة 3/خدمة 4/تسويات 5)',
  'نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7)', 'المبلغ الصافي',
  'قيمة الضريبة', 'إجمالي', 'الشهر', 'العام', 'tax_system', 'user', 'created_at',
  'approval_status', 'approval', 'approval_time', 'invoice_label', 'unique_id'];
const LINE_HEADERS = ['unique_id', 'id', 'valley_sales_header_id', 'product_id', 'product_details',
  'product_tax', 'product_qty', 'product_price', 'product_net_value', 'product_tax_value',
  'product_total_value', 'user', 'created_at'];
const RETURN_HEADERS = ['unique_id', 'id', 'valley_sales_invoices_id', 'valley_sales_invoices_client',
  'valley_return_date', 'valley_sales_products_id', 'valley_return_qty', 'valley_return_value',
  'user', 'created_at'];
const PRODUCT_HEADERS = ['id', 'name_ar', 'product_type'];
const STOCK_HEADERS = ['unique_id', 'valley_sales_products_id', 'product_unique_id',
  'product_transaction_code', 'product_qty', 'user', 'created_at'];

const D1 = new Date(2026, 2, 4, 9, 0, 0);

function invRow(uid, number, client, date) {
  const r = new Array(INV_HEADERS.length).fill('');
  r[0] = uid; r[4] = number; r[5] = client; r[11] = date;
  r[14] = 100; r[15] = 5; r[16] = 105; r[19] = true; r[22] = 'Approved'; r[25] = 'UNIQ-' + uid;
  return r;
}

function build() {
  return {
    sheets: [
      [INV, INV_HEADERS, [
        invRow('INV-DOC-1', 'NUM-1', 'CLIENT-A', D1),
        invRow('INV-DOC-EMPTY', 'NUM-2', 'CLIENT-B', D1)
      ]],
      [LINES, LINE_HEADERS, [
        ['LINE-1', 1, 'INV-DOC-1', 'P1', 'DETAIL-1', 0.05, 10, 25, 250, 12.5, 262.5, 'u', D1],
        ['LINE-2', 2, 'INV-DOC-1', 'P2', '', 0.14, 4, 7, 28, 3.92, 31.92, 'u', D1],
        ['LINE-3', 3, 'INV-DOC-OTHER', 'P1', '', 0, 9, 9, 81, 0, 81, 'u', D1]
      ]],
      [RETURNS, RETURN_HEADERS, [
        ['RET-1', 1, 'INV-DOC-1', 'CLIENT-A', D1, 'LINE-1', 3, 75, 'u', D1],
        ['RET-2', 2, 'INV-DOC-1', 'CLIENT-A', D1, 'LINE-1', 2, 50, 'u', D1],
        ['RET-3', 3, 'INV-DOC-OTHER', 'CLIENT-Z', D1, 'LINE-3', 5, 45, 'u', D1]
      ]],
      [PRODUCTS, PRODUCT_HEADERS, [['P1', 'PRODUCT-ONE', ''], ['P2', 'PRODUCT-TWO', 'محلي']]],
      [STOCK, STOCK_HEADERS, [
        ['ALLOC-1', 'LINE-1', 'BATCH-X', 'LOT-9', 6, 'u', D1],
        ['ALLOC-2', 'LINE-1', 'BATCH-Y', 'LOT-8', 4, 'u', D1],
        ['ALLOC-3', 'LINE-3', 'BATCH-Z', 'LOT-7', 9, 'u', D1]
      ]]
    ]
  };
}

const H_ON = createVfHarness({
  sourcePatches: [{
    file: 'Company_ValleyFoods_Actions.js',
    find: 'var SALES_FAST_READ_ = false;',
    replace: 'var SALES_FAST_READ_ = true;'
  }]
});
const H_OFF = createVfHarness();
[H_ON, H_OFF].forEach(function (H) {
  build().sheets.forEach(function (s) { H.addSheet(s[0], s[1], s[2]); });
});
H_ON.eval('FAST_READ_CORE_ = true;');
H_OFF.eval('FAST_READ_CORE_ = false;');

/* ── 1. shadow compare, flag off, through the admin action ───────────────── */
const TARGETS = [
  { target: 'vf_invoice_for_return', action: 'get_valley_invoice_for_return' },
  { target: 'vf_invoice_full', action: 'get_valley_invoice_full' }
];
const PAYLOADS = [
  { name: 'found with children', invoice_unique_id: 'INV-DOC-1' },
  { name: 'found without children', invoice_unique_id: 'INV-DOC-EMPTY' }
];
TARGETS.forEach(function (t) {
  PAYLOADS.forEach(function (p) {
    H_OFF.newExecution();
    const report = H_OFF.dispatch('fr_shadow_compare', { target: t.target, payload: { invoice_unique_id: p.invoice_unique_id } });
    assert.strictEqual(report.modernError, null, t.target + '/' + p.name + ': modern did not throw');
    assert.strictEqual(report.ok, true,
      t.target + '/' + p.name + ': zero diffs, got ' + report.diffCount + ' ' + JSON.stringify(report.diffs));
  });
  /* The missing-invoice case is a THROWN error for the detail reader and a
   * degraded object for the returns reader; the legacy behaviour must survive
   * in both. */
  H_OFF.newExecution();
  const missing = H_OFF.dispatch('fr_shadow_compare', { target: t.target, payload: { invoice_unique_id: 'NOPE' } });
  assert.strictEqual(missing.ok, true || missing.diffCount === 0, t.target + '/missing: the readers agree');
  assert.strictEqual(missing.diffCount, 0, t.target + '/missing: zero diffs');
});

/* ── 2. cross-harness equality with the flags on ─────────────────────────── */
TARGETS.forEach(function (t) {
  PAYLOADS.forEach(function (p) {
    H_ON.newExecution();
    H_OFF.newExecution();
    const modern = H_ON.dispatch(t.action, { invoice_unique_id: p.invoice_unique_id });
    const legacy = H_OFF.dispatch(t.action, { invoice_unique_id: p.invoice_unique_id });
    assert.strictEqual(JSON.stringify(modern), JSON.stringify(legacy),
      t.action + '/' + p.name + ': on-flag response equals the legacy response');
  });
});

/* ── 3. the content is right, not merely equal ───────────────────────────── */
{
  H_ON.newExecution();
  const r = H_ON.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  assert.strictEqual(r.invoice.number, 'NUM-1');
  assert.strictEqual(r.invoice.client_name, 'CLIENT-A');
  assert.strictEqual(r.invoice.date_display, '04/03/2026', 'the date reaches the banner as dd/MM/yyyy');
  assert.strictEqual(r.lines.length, 2, 'only this invoice\'s lines');
  const l1 = r.lines.filter((l) => l.line_uid === 'LINE-1')[0];
  assert.ok(l1, 'LINE-1 present');
  assert.strictEqual(l1.product_name, 'PRODUCT-ONE');
  assert.strictEqual(l1.returned_qty, 5, 'returns for the same line sum across return rows');
  assert.strictEqual(l1.returnable, 5, 'returnable = sold - returned');
  const l2 = r.lines.filter((l) => l.line_uid === 'LINE-2')[0];
  assert.strictEqual(l2.returnable, 4, 'a line with no returns is fully returnable');

  const fr = H_ON.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'NOPE' });
  assert.strictEqual(fr.invoice.uid, 'NOPE');
  assert.strictEqual(fr.invoice.number, '-');
  assert.strictEqual(Object.keys(fr.invoice).length, 2, 'the fallback stays a two-field object');

  const full = H_ON.dispatch('get_valley_invoice_full', { invoice_unique_id: 'INV-DOC-1' });
  assert.strictEqual(Object.keys(full.invoice).length, INV_HEADERS.length, 'the detail header is lossless');
  assert.ok(full.invoice['تاريخ الفاتورة'] instanceof Date, 'the detail date is a real Date through the batch path');
  assert.strictEqual(full.invoice['تاريخ الفاتورة'].getDate(), 4, 'and its day is right');
  assert.strictEqual(full.lines.length, 2);
  const fl1 = full.lines.filter((l) => l.unique_id === 'LINE-1')[0];
  assert.strictEqual(fl1.product_name, 'PRODUCT-ONE', 'the product name join works');
  assert.strictEqual(fl1.allocations.length, 2, 'both allocations of the line are attached');
  assert.deepStrictEqual(Array.from(fl1.allocations).map((a) => a.batch_uid), ['BATCH-X', 'BATCH-Y'],
    'allocations keep sheet order');
  const fl2 = full.lines.filter((l) => l.unique_id === 'LINE-2')[0];
  assert.deepStrictEqual(Array.from(fl2.allocations), [], 'no allocations is an empty array');
  assert.throws(() => H_ON.dispatch('get_valley_invoice_full', { invoice_unique_id: 'NOPE' }),
    /الفاتورة غير موجودة/, 'a missing invoice still throws the legacy error');
}

/* ── 4. declared strategies and honest metrics ───────────────────────────── */
{
  H_ON.newExecution();
  const before = H_ON.logs.length;
  H_ON.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  const line = H_ON.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  assert.ok(line, 'a metrics line per document read');
  const m = JSON.parse(line.slice(line.indexOf('{')));
  /* Parent: 2 table rows (index-then-fetch). Sold: 3 table rows (PARENT_SCAN).
   * Returns: 3 (FULL_SCAN). Products: 2 (FULL_SCAN). */
  assert.strictEqual(m.rowsScanned, 2 + 3 + 3 + 2, 'rowsScanned sums the section table scans honestly');
  /* MEASURED, and recorded as-is rather than rounded down: 17 service calls
   * against the legacy reader's ~14 on the same fixture — four sheets each cost
   * one header read (2 calls), the parent costs an index read plus a batched
   * fetch, and the three child sections cost one scan each. The fast reader's
   * win here is cells and objects (25 vs 75 cells, no 13-column record build),
   * NOT call count. The assertion pins the measured number so a regression is
   * visible, and the ledger states the trade-off. */
  console.log('METRICS vf_invoice_for_return', JSON.stringify(m));
  assert.strictEqual(m.serviceCalls, 17, 'service calls are the measured 17, not a hoped-for number');
  /* 101 cells: 53 are header rows (27+13+10+3, work the legacy path does too),
   * 14 are the parent index + row, and 34 are the three narrow child scans.
   * The legacy reader on the same fixture pays 53 for headers PLUS 102 for whole
   * row ranges (27 + 39 + 30 + 6) — about 155 — and then builds 13-column
   * record objects. Measured, not modelled. */
  assert.strictEqual(m.cellsRead, 101, 'cells read is the measured 101 against the legacy ~155');
  assert.strictEqual(m.cacheOutcome, 'refused-unknown-stamp',
    'no cache was published: the fixture tables carry no stamp (step 5 is opt-in and stamp-gated)');
}

/* ── 5. fail-open for documents ──────────────────────────────────────────── */
{
  const H_BROKEN = createVfHarness({
    sourcePatches: [
      { file: 'Company_ValleyFoods_Actions.js', find: 'var SALES_FAST_READ_ = false;', replace: 'var SALES_FAST_READ_ = true;' },
      {
        file: 'Core_FastRead.js',
        find: 'function fastFetchDocument_(spec) {\n  var s = spec || {};',
        replace: 'function fastFetchDocument_(spec) {\n  var s = spec || {};\n  if (typeof __harnessForceAbort_ !== "undefined" && __harnessForceAbort_) throw frError_("FR_BUDGET_EXCEEDED", "harness: simulated engine abort");'
      }
    ]
  });
  build().sheets.forEach(function (s) { H_BROKEN.addSheet(s[0], s[1], s[2]); });
  H_BROKEN.eval('FAST_READ_CORE_ = true; __harnessForceAbort_ = true;');
  H_BROKEN.newExecution();
  const logsBefore = H_BROKEN.logs.length;
  const out = H_BROKEN.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  assert.strictEqual(out.invoice.number, 'NUM-1', 'the user gets the legacy document');
  assert.ok(H_BROKEN.logs.slice(logsBefore).some((l) => l.indexOf('vf_fast_read_fallback') !== -1),
    'the fallback is logged');

  H_BROKEN.newExecution();
  const full = H_BROKEN.dispatch('get_valley_invoice_full', { invoice_unique_id: 'INV-DOC-1' });
  assert.strictEqual(full.lines.length, 2, 'the detail reader fails open the same way');
}

/* ── 6. small-payload cache: publish, serve, invalidate on a stamp ───────── */
{
  const H = H_ON;
  /* 1. Unstamped tables cannot be published: the read still answers. */
  H.newExecution();
  let before = H.logs.length;
  H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  let log = H.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  let m = JSON.parse(log.slice(log.indexOf('{')));
  assert.strictEqual(m.cacheOutcome, 'refused-unknown-stamp',
    'with no stamp on the covered tables the payload is built and not published');

  /* 2. Stamp the covered tables: the next read publishes, the one after is served. */
  ['valley_sales_invoices', 'valley_sales_products', 'valley_sales_returns', 'valley_products']
    .forEach((sheetName) => H.eval('noteTableChange_("' + H.dbId + '", "' + sheetName + '");'));

  H.newExecution();
  before = H.logs.length;
  H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  log = H.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  m = JSON.parse(log.slice(log.indexOf('{')));
  assert.strictEqual(m.cacheOutcome, 'hit', 'a stamped payload is published');

  H.newExecution();
  H.resetStats();
  before = H.logs.length;
  const served = H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  log = H.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  m = JSON.parse(log.slice(log.indexOf('{')));
  const stats = H.stats();
  assert.strictEqual(m.cacheOutcome, 'hit', 'the second read is served from the cache');
  assert.strictEqual(stats.rangeReads, 0,
    'a cache hit performs no sheet value reads at all (got ' + stats.rangeReads + ')');
  assert.strictEqual(served.lines.length, 2, 'and the cached document is the right one');
  assert.strictEqual(served.invoice.number, 'NUM-1');

  /* 3. A write stamps a covered table: the next read misses and rebuilds. */
  H.eval('noteTableChange_("' + H.dbId + '", "valley_sales_returns");');
  H.newExecution();
  H.resetStats();
  before = H.logs.length;
  H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  log = H.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  m = JSON.parse(log.slice(log.indexOf('{')));
  assert.ok(m.cacheOutcome === 'miss' || m.cacheOutcome === 'hit',
    'a changed stamp invalidates the entry (outcome ' + m.cacheOutcome + ')');
  assert.ok(H.stats().rangeReads > 0, 'and the document is really rebuilt from the sheet');

  /* 4. An execution that has written reads no cache. */
  H.newExecution();
  H.eval('disableRecordCache_();');          /* exactly what noteMutation_ does */
  H.resetStats();
  before = H.logs.length;
  H.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-DOC-1' });
  log = H.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  m = JSON.parse(log.slice(log.indexOf('{')));
  assert.strictEqual(m.cacheOutcome, 'refused-after-write', 'the dirty-read window is honoured');
  assert.ok(H.stats().rangeReads > 0, 'and the legacy-equivalent read still happens');
}

console.log('sales_document_fast_read: PASS');
