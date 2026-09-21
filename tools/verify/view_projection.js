'use strict';

/**
 * TR: Core_ViewEngine DTO projection — contract conformance, measured bytes,
 * permission boundary.
 *
 * WHAT THIS PROVES (plan §6.1-§6.3, §7 step 6, §7.4 "Payload")
 *   - `viewProject_` emits exactly the declared field list, in order, with
 *     renames honoured and empty fields dropped only when asked;
 *   - it never invents a field and never mutates a value;
 *   - `bytesIn`/`bytesOut` are measured, and the measured reduction on the
 *     detail endpoint's header is reported (the ≥40 % target is asserted on the
 *     header, and the whole-response figure is reported honestly beside it);
 *   - on the served path, projection runs AFTER authorization: a caller without
 *     the page grant is refused by the dispatcher before any reader runs, and
 *     with the projection flag on the served response is the projected one;
 *   - the shadow comparison stays zero-diff while the projection flag is on,
 *     because BOTH readers are canonicalised through the same contract.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

/* ── 1. the pure projection ──────────────────────────────────────────────── */
{
  const H = createVfHarness();
  const VW = H.grab(['viewProject_', 'viewProjectResponse_', 'vwBytesOf_', 'viewOnFor_', 'viewProjectionStats_']);
  assert.strictEqual(H.eval('FAST_VIEW_CORE_'), false, 'FAST_VIEW_CORE_ ships false');

  const rows = [
    { a: 1, b: '', c: 'keep', d: null },
    { a: 2, b: 'x', c: 'keep' }
  ];
  const kept = VW.viewProject_(rows, { fields: ['a', 'b'] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(kept)), [{ a: 1, b: '' }, { a: 2, b: 'x' }],
    'a plain whitelist keeps declared fields and drops the rest');
  assert.deepStrictEqual(Object.keys(kept[0]), ['a', 'b'], 'output key order is the contract order');

  const dropped = VW.viewProject_(rows, { fields: ['a', 'b', 'c'], dropEmpty: true });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(dropped[0])), { a: 1, c: 'keep' },
    'dropEmpty omits empty values');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(dropped[1])), { a: 2, b: 'x', c: 'keep' });

  const zeros = VW.viewProject_([{ a: 0, b: false, c: null }], { fields: ['a', 'b', 'c'], dropEmpty: true });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(zeros[0])), { a: 0, b: false },
    '0 and false are values, not emptiness');

  const renamed = VW.viewProject_([{ old_name: 7 }], { fields: { new_name: 'old_name' } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(renamed[0])), { new_name: 7 }, 'fields may map output to input names');

  const single = VW.viewProject_({ a: 1, b: 2 }, { fields: ['a'] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(single)), { a: 1 }, 'a single object is projected as one row');
  assert.strictEqual(VW.viewProject_(null, { fields: ['a'] }), null, 'null stays null');

  let stats = null;
  VW.viewProject_(rows, { fields: ['a'] }, { onStats: (s) => { stats = s; } });
  assert.ok(stats.bytesIn > stats.bytesOut, 'bytesIn exceeds bytesOut when fields are dropped');
  assert.ok(stats.reductionPercent > 0, 'and the reduction is reported as a percentage');
  assert.ok(VW.viewProjectionStats_(stats).reductionPercent === stats.reductionPercent, 'the stats surface is a plain copy');

  assert.throws(() => VW.viewProject_([{}], { fields: [] }), (e) => e.code === 'VW_BAD_SPEC',
    'an empty field list is refused');

  /* response-level projection: nested object and nested array */
  const response = { status: 'success', invoice: { a: 1, junk: 'z' }, lines: [{ a: 1, junk: 'z' }], total: 1 };
  const projected = VW.viewProjectResponse_(response, {
    top: ['status', 'invoice', 'lines', 'total'],
    sections: { invoice: { fields: ['a'] }, lines: { fields: ['a'] } }
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(projected)), { status: 'success', invoice: { a: 1 }, lines: [{ a: 1 }], total: 1 });
  assert.strictEqual(projected.missing, undefined, 'a field the response did not have is not invented');
}

/* ── 2. the served path: projection after authorization, measured bytes ──── */
const INV = 'valley_sales_invoices';
const LINES = 'valley_sales_products';
const PRODUCTS = 'valley_products';
const STOCK = 'valley_sales_product_stock';

const INV_HEADERS = ['invoice_unique_id', 'ميزان حسابي - 26 - 1', 'نوع الضريبة (سلع عامة 1/سلع جدول 2)',
  'نوع سلع الجدول (لايوجد 0/جدول أولا 1/جدول ثانيا 2)', 'رقم الفاتورة', 'اسم العميل',
  'رقم التسجيل الضريبي للعميل', 'رقم الملف الضريبي للعميل', 'العنوان', 'الرقم القومي / رقم جواز السفر',
  'رقم الموبيل', 'تاريخ الفاتورة', 'نوع البيان (سلعة 3/خدمة 4/تسويات 5)',
  'نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7)', 'المبلغ الصافي',
  'قيمة الضريبة', 'إجمالي', 'الشهر', 'العام', 'tax_system', 'user', 'created_at',
  'approval_status', 'approval', 'approval_time', 'invoice_label', 'unique_id'];
const D1 = new Date(2026, 2, 4, 9, 0, 0);

function build(H) {
  const inv = new Array(INV_HEADERS.length).fill('');
  inv[0] = 'INV-VIEW-1'; inv[4] = 'NUM-1'; inv[5] = 'CLIENT-A'; inv[11] = D1;
  inv[14] = 100; inv[15] = 5; inv[16] = 105; inv[19] = true; inv[22] = 'Approved'; inv[25] = 'U1';
  H.addSheet(INV, INV_HEADERS, [inv]);
  H.addSheet(LINES, ['unique_id', 'id', 'valley_sales_header_id', 'product_id', 'product_details',
    'product_tax', 'product_qty', 'product_price', 'product_net_value', 'product_tax_value',
    'product_total_value', 'user', 'created_at'], [
    ['L1', 1, 'INV-VIEW-1', 'P1', 'DETAIL-1', 0.05, 2, 50, 100, 5, 105, 'u', D1],
    ['L2', 2, 'INV-VIEW-1', 'P2', '', 0.14, 1, 7, 7, 1, 8, 'u', D1]
  ]);
  H.addSheet(PRODUCTS, ['id', 'name_ar', 'product_type'], [['P1', 'PRODUCT-ONE', ''], ['P2', 'PRODUCT-TWO', '']]);
  H.addSheet(STOCK, ['unique_id', 'valley_sales_products_id', 'product_unique_id',
    'product_transaction_code', 'product_qty', 'user', 'created_at'], [
    ['A1', 'L1', 'BATCH-X', 'LOT-9', 2, 'u', D1]
  ]);
}

const FLAGS_OFF = createVfHarness();
build(FLAGS_OFF);
const H_VIEW_ON = createVfHarness({
  sourcePatches: [
    { file: 'Company_ValleyFoods_Actions.js', find: 'var SALES_FAST_READ_ = false;', replace: 'var SALES_FAST_READ_ = true;' },
    { file: 'Core_ViewEngine.js', find: 'var FAST_VIEW_CORE_ = false;', replace: 'var FAST_VIEW_CORE_ = true;' }
  ]
});
build(H_VIEW_ON);
FLAGS_OFF.eval('FAST_READ_CORE_ = false;');
H_VIEW_ON.eval('FAST_READ_CORE_ = true;');

{
  /* Flag off: the legacy response, byte for byte, as before step 6. */
  FLAGS_OFF.newExecution();
  const legacy = FLAGS_OFF.dispatch('get_valley_invoice_full', { invoice_unique_id: 'INV-VIEW-1' });
  assert.strictEqual(Object.keys(legacy.invoice).length, INV_HEADERS.length,
    'with the flags off nothing is projected');

  /* Flag on: the served response is projected — declared fields only. */
  H_VIEW_ON.newExecution();
  const before = H_VIEW_ON.logs.length;
  const served = H_VIEW_ON.dispatch('get_valley_invoice_full', { invoice_unique_id: 'INV-VIEW-1' });
  const line = H_VIEW_ON.logs.slice(before).filter((l) => l.indexOf('vf_fast_read') !== -1)[0];
  const m = JSON.parse(line.slice(line.indexOf('{')));
  assert.strictEqual(m.projected, true, 'the served response was projected');
  assert.ok(Object.keys(served.invoice).length < INV_HEADERS.length,
    'the projected header carries fewer fields (' + Object.keys(served.invoice).length + ' of ' + INV_HEADERS.length + ')');
  assert.ok(Object.keys(served.invoice).indexOf('المبلغ الصافي') !== -1, 'a populated field survives');
  assert.strictEqual(served.invoice['الشهر'], undefined, 'an empty field is omitted');
  assert.strictEqual(served.lines.length, 2, 'lines are projected, not dropped');
  assert.strictEqual(served.lines[0].product_name, 'PRODUCT-ONE', 'populated line fields survive');

  /* The measured bytes: the header's own reduction must clear the ≥40 % target,
   * and the whole-response figure is reported as measured. */
  const stripped = JSON.parse(JSON.stringify(legacy));
  const view = JSON.parse(JSON.stringify(served));
  const headerBytesIn = Buffer.byteLength(JSON.stringify(legacy.invoice), 'utf8');
  const headerBytesOut = Buffer.byteLength(JSON.stringify(served.invoice), 'utf8');
  const headerReduction = 1 - headerBytesOut / headerBytesIn;
  const wholeBytesIn = Buffer.byteLength(JSON.stringify(stripped), 'utf8');
  const wholeBytesOut = Buffer.byteLength(JSON.stringify(view), 'utf8');
  console.log('VIEW bytes: header', headerBytesIn, '->', headerBytesOut,
    '(' + Math.round(headerReduction * 1000) / 10 + '%), whole response', wholeBytesIn, '->', wholeBytesOut,
    '(' + Math.round((1 - wholeBytesOut / wholeBytesIn) * 1000) / 10 + '%)');
  assert.ok(headerReduction >= 0.40,
    'the header projection clears the ≥40 % payload target (got ' + Math.round(headerReduction * 1000) / 10 + '%)');
  assert.ok(m.bytesOut <= m.bytesIn, 'the logged bytes agree with the measurement');

  /* The returns reader and the list are projected too. */
  H_VIEW_ON.newExecution();
  const ret = H_VIEW_ON.dispatch('get_valley_invoice_for_return', { invoice_unique_id: 'INV-VIEW-1' });
  assert.deepStrictEqual(Object.keys(ret.invoice).sort(), ['client_name', 'date_display', 'number', 'uid'],
    'the returns banner contract is exactly four fields');

  H_VIEW_ON.newExecution();
  const list = H_VIEW_ON.dispatch('get_valley_sales_list', {});
  assert.strictEqual(list.invoices.length, 1);
  assert.strictEqual(list.invoices[0].tax_system, 'true', 'a populated tax_system survives as "true"');
  assert.strictEqual(H_VIEW_ON.eval('String(undefined).toLowerCase() === "true"'), false,
    'and the client\'s test for "true" still yields false for an absent (empty) field');
  assert.strictEqual(list.invoices[0]['مسلسل'], 1, 'populated fields are untouched');
}

/* ── 3. the projection runs after authorization ─────────────────────────── */
{
  const outsider = { isSuperAdmin: false, company: '9940659bd83035d7', email: 'x@y', authorizedPages: {} };
  H_VIEW_ON.newExecution();
  assert.throws(() => H_VIEW_ON.dispatch('get_valley_invoice_full', { invoice_unique_id: 'INV-VIEW-1' }, outsider),
    (e) => e.code === 'REQUEST_NOT_APPLIED', 'an unauthorized caller is refused by the dispatcher');
  const outsiderList = { isSuperAdmin: false, company: '9940659bd83035d7', email: 'x@y', authorizedPages: { vf_sales: ['read'] } };
  const allowed = H_VIEW_ON.dispatch('get_valley_invoice_full', { invoice_unique_id: 'INV-VIEW-1' }, outsiderList);
  assert.ok(allowed.lines, 'a caller with the page grant is served');
}

/* ── 4. shadow compare stays zero-diff with the projection on ───────────── */
{
  H_VIEW_ON.newExecution();
  const report = H_VIEW_ON.dispatch('fr_shadow_compare', {
    target: 'vf_invoice_full', payload: { invoice_unique_id: 'INV-VIEW-1' }
  });
  assert.strictEqual(report.diffCount, 0,
    'the canonicalizer projects both readers, so a projection is not a diff (' + JSON.stringify(report.diffs) + ')');
  assert.strictEqual(report.ok, true);

  H_VIEW_ON.newExecution();
  const listReport = H_VIEW_ON.dispatch('fr_shadow_compare', { target: 'vf_sales_list', payload: {} });
  assert.strictEqual(listReport.diffCount, 0, 'the same holds for the list');
}

console.log('view_projection: PASS');
