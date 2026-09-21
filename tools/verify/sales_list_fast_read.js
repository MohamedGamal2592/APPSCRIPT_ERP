'use strict';

/**
 * TR: Sales list fast reader — shadow-compare equivalence and the on-flag path.
 *
 * WHAT THIS PROVES (plan §7.4 "Shadow compare", §7.5, step 3)
 *   1. Flag OFF (shipped state): the fast reader and the legacy reader return the
 *      SAME canonical response for the same payload — full page, offset window,
 *      date ranges, empty result, zero limit — invoked through the module's
 *      registered `fr_shadow_compare` admin action, which is how production
 *      evidence will be gathered. The comparison is not circular: the modern
 *      reader is called by direct function reference while both flags are false,
 *      and a user request still gets the legacy path.
 *   2. Flag ON (simulated in memory, never in a file): the registered
 *      `get_valley_sales_list` action serves the fast reader, and its response is
 *      field-for-field what the legacy reader returned for the same payload in a
 *      separate harness.
 *   3. The fast reader spends one rectangle read of the nine projected columns
 *      instead of materializing every column of every row; its metrics line
 *      reports the real numbers and contains no business values.
 *   4. Fail-open: an engine abort inside the fast reader degrades to the legacy
 *      response, logged with an engine code and no values.
 *
 * PRIVACY (G7): fixture values are invented; the comparison report carries
 * field paths, types, hashes and counts only, and that is asserted.
 *
 * NOTE ON FIXTURES: the header names below are the sheet's real headers and are
 * therefore Arabic — they are schema, not data. Every cell VALUE is invented.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

const INV = 'valley_sales_invoices';
const HEADERS = ['invoice_unique_id', 'ميزان حسابي - 26 - 1', 'نوع الضريبة (سلع عامة 1/سلع جدول 2)',
  'نوع سلع الجدول (لايوجد 0/جدول أولا 1/جدول ثانيا 2)', 'رقم الفاتورة', 'اسم العميل',
  'رقم التسجيل الضريبي للعميل', 'رقم الملف الضريبي للعميل', 'العنوان', 'الرقم القومي / رقم جواز السفر',
  'رقم الموبيل', 'تاريخ الفاتورة', 'نوع البيان (سلعة 3/خدمة 4/تسويات 5)',
  'نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7)', 'المبلغ الصافي',
  'قيمة الضريبة', 'إجمالي', 'الشهر', 'العام', 'tax_system', 'user', 'created_at',
  'approval_status', 'approval', 'approval_time', 'invoice_label', 'unique_id'];

function d(day) { return new Date(2026, 0, day, 9, 0, 0); }
function row(i, date) {
  const r = new Array(HEADERS.length).fill('');
  r[0] = 'UID-' + i;
  r[4] = 'NUM-' + i;
  r[5] = 'CLIENT-' + i;
  r[11] = date;
  r[14] = i * 10;
  r[15] = i;
  r[16] = i * 11;
  r[19] = i % 2 === 0;
  r[22] = i % 3 === 0 ? 'Approved' : '';
  r[25] = 'UNIQ-' + i;
  return r;
}

/* 12 invoices: 8 in January, 4 in February — plus a fully blank row to prove
 * the blank-row rule (skipped by BOTH readers, so serials and totals agree). */
const dataRows = [];
for (let i = 1; i <= 8; i++) dataRows.push(row(i, d(i)));
dataRows.push(new Array(HEADERS.length).fill(''));
for (let i = 9; i <= 12; i++) dataRows.push(row(i, d(i)));

/* The on-flag harness patches ONLY the source text in memory: the shipped files
 * are untouched. A patch whose target text is absent makes the harness throw,
 * so a silent no-op is impossible. */
const H_ON = createVfHarness({
  sourcePatches: [{
    file: 'Company_ValleyFoods_Actions.js',
    find: 'var SALES_FAST_READ_ = false;',
    replace: 'var SALES_FAST_READ_ = true;'
  }]
});
const H_OFF = createVfHarness();

[H_ON, H_OFF].forEach(function (H) {
  H.addSheet(INV, HEADERS, dataRows);
});
H_ON.eval('FAST_READ_CORE_ = true;');
/* H_OFF keeps both switches off: the shipped state, in which a user request
 * must still get the legacy reader. */
H_OFF.eval('FAST_READ_CORE_ = false;');

const CASES = [
  { name: 'full list', payload: {} },
  { name: 'page window', payload: { offset: 0, limit: 5 } },
  { name: 'deep offset', payload: { offset: 4, limit: 3 } },
  { name: 'date range', payload: { from: '2026-01-03', to: '2026-01-05' } },
  { name: 'range + page', payload: { from: '2026-02-01', to: '2026-02-03', offset: 1, limit: 1 } },
  { name: 'empty result', payload: { from: '2030-01-01', to: '2030-12-31' } },
  { name: 'zero limit', payload: { limit: 0 } }
];

/* ── 1. equivalence, flag off, through the admin action ──────────────────── */
CASES.forEach(function (c) {
  H_OFF.newExecution();
  const report = H_OFF.dispatch('fr_shadow_compare', { target: 'vf_sales_list', payload: c.payload });
  assert.strictEqual(report.status, 'success', c.name + ': the action answers');
  assert.strictEqual(report.modernError, null, c.name + ': the modern reader did not throw');
  assert.strictEqual(report.ok, true,
    c.name + ': zero diffs, got ' + report.diffCount + ' (' + JSON.stringify(report.diffs) + ')');
  assert.strictEqual(report.diffCount, 0);
});

/* ── 2. cross-harness equality: flag ON response === flag OFF response ───── */
CASES.forEach(function (c) {
  H_ON.newExecution();
  H_OFF.newExecution();
  const modern = H_ON.dispatch('get_valley_sales_list', c.payload);
  const legacy = H_OFF.dispatch('get_valley_sales_list', c.payload);
  assert.strictEqual(JSON.stringify(modern), JSON.stringify(legacy),
    c.name + ': the fast response equals the legacy response field for field');
});

/* ── 3. the response is the frozen contract, with global serials ─────────── */
{
  H_ON.newExecution();
  const fast = H_ON.dispatch('get_valley_sales_list', {});
  assert.deepStrictEqual(Object.keys(fast).sort(), ['invoices', 'status', 'total'],
    'exactly the three contract fields; no metrics object leaks to the client');
  assert.strictEqual(fast.invoices.length, 12, 'the blank row is not an invoice');
  assert.strictEqual(fast.total, 12, 'total counts the filtered set');
  assert.strictEqual(fast.invoices[0]['مسلسل'], 1, 'the serial starts at 1');
  assert.strictEqual(fast.invoices[7]['مسلسل'], 8, 'the serial is the unfiltered position');
  assert.strictEqual(fast.invoices[8]['مسلسل'], 9, 'the serial skips the blank row and continues');
  assert.strictEqual(fast.invoices[0].tax_system, '', 'a FALSE tax cell is the empty string');
  assert.strictEqual(fast.invoices[1].tax_system, 'true', 'a TRUE tax cell is "true"');
  assert.strictEqual(fast.invoices[0].approval_status, 'Pending', 'blank approval defaults to Pending');

  const page = H_ON.dispatch('get_valley_sales_list', { offset: 2, limit: 2 });
  assert.strictEqual(page.invoices.length, 2);
  assert.strictEqual(page.total, 12, 'total ignores offset/limit, as the legacy vfPage_ does');
  assert.strictEqual(page.invoices[0]['مسلسل'], 3, 'offset pages by the global serial');

  const ranged = H_ON.dispatch('get_valley_sales_list', { from: '2026-01-03', to: '2026-01-05' });
  assert.strictEqual(ranged.total, 3, 'the date range is inclusive at both ends');
  assert.strictEqual(ranged.invoices[0]['مسلسل'], 3, 'serials stay global after filtering');
}

/* ── 4. honest metrics, logged once, carrying no values ──────────────────── */
{
  H_ON.newExecution();
  const before = H_ON.logs.length;
  H_ON.dispatch('get_valley_sales_list', {});
  const lines = H_ON.logs.slice(before).filter(function (l) { return l.indexOf('vf_fast_read') !== -1; });
  assert.strictEqual(lines.length, 1, 'exactly one structured metrics line per fast read');
  const payload = JSON.parse(lines[0].slice(lines[0].indexOf('{')));
  assert.ok(payload.serviceCalls <= 3, 'serviceCalls <= 3 (got ' + payload.serviceCalls + ')');
  assert.strictEqual(payload.rowsScanned, 13, 'rowsScanned is every table row (12 invoices + 1 blank)');
  /* The nine projected columns are scattered across the 27-column sheet
   * (indices 0,4,5,11,14,15,16,19,22), so the rectangle is 23 columns wide:
   * 13 x 23 = 299 cells, against the legacy reader's 13 x 27 = 351 cells plus
   * one record object per row with all 27 fields. The saving is real but it is
   * a cells-and-objects saving, not a matched-rows-only claim — and the record
   * states the measured numbers rather than the hoped-for ones. */
  assert.strictEqual(payload.cellsRead, 299,
    'cellsRead is the declared rectangle (23 cols x 13 rows), measured not assumed');
  assert.ok(payload.cellsRead <= 13 * 27, 'and never worse than the legacy whole-row read');
  assert.strictEqual(payload.cacheOutcome, 'disabled', 'step 3 has no cross-request cache');
  assert.strictEqual(payload.partial, false, 'a partial answer is never returned silently');
  assert.ok(lines[0].indexOf('NUM-') === -1 && lines[0].indexOf('CLIENT-') === -1,
    'no fixture value appears in the metrics line (G7)');
}

/* ── 5. fail-open when the engine aborts ─────────────────────────────────── */
{
  /* A third harness whose engine aborts on every list fetch: the module must
   * answer from the legacy body, log the engine code, and never surface the
   * error to the user. */
  const H_BROKEN = createVfHarness({
    sourcePatches: [
      { file: 'Company_ValleyFoods_Actions.js', find: 'var SALES_FAST_READ_ = false;', replace: 'var SALES_FAST_READ_ = true;' },
      {
        file: 'Core_FastRead.js',
        find: 'function fastFetchList_(spec) {\n  var s = spec || {};',
        replace: 'function fastFetchList_(spec) {\n  var s = spec || {};\n  if (typeof __harnessForceAbort_ !== "undefined" && __harnessForceAbort_) throw frError_("FR_BUDGET_EXCEEDED", "harness: simulated engine abort");'
      }
    ]
  });
  H_BROKEN.addSheet(INV, HEADERS, dataRows);
  H_BROKEN.eval('FAST_READ_CORE_ = true; __harnessForceAbort_ = true;');
  H_BROKEN.newExecution();
  const logsBefore = H_BROKEN.logs.length;
  const out = H_BROKEN.dispatch('get_valley_sales_list', {});
  assert.strictEqual(out.status, 'success', 'the user still gets an answer');
  assert.strictEqual(out.total, 12, 'and it is the legacy answer, not an error');
  const fallback = H_BROKEN.logs.slice(logsBefore).filter(function (l) { return l.indexOf('vf_fast_read_fallback') !== -1; });
  assert.strictEqual(fallback.length, 1, 'the fallback is logged exactly once');
  assert.ok(fallback[0].indexOf('FR_BUDGET_EXCEEDED') !== -1, 'the log names the engine code');
  assert.ok(fallback[0].indexOf('CLIENT-') === -1 && fallback[0].indexOf('NUM-') === -1,
    'and no business value (G7)');
}

/* ── 6. the admin action is super-admin only and refuses unknown targets ─── */
{
  assert.throws(function () {
    H_OFF.dispatch('fr_shadow_compare', { target: 'vf_sales_list' }, { isSuperAdmin: false, company: '9940659bd83035d7' });
  }, /NOT_AUTHORIZED|غير مصرح|الأذونات|صلاحية/, 'a normal user cannot reach the comparison');

  assert.throws(function () {
    H_OFF.dispatch('fr_shadow_compare', { target: 'nope' });
  }, /معروف/, 'an unknown target is refused by name');

  const report = H_OFF.dispatch('fr_shadow_compare', { target: 'vf_sales_list', payload: { limit: 1 } });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.diffCount, 0);
  assert.ok(report.leftBytes > 0 && report.rightBytes > 0, 'the report carries bounded sizes');
}

console.log('sales_list_fast_read: PASS');
