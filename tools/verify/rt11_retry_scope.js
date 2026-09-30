/**
 * RT11 — the retry chip belongs to the page that owns the record.
 *
 * One save fails anywhere in the app and the red
 * «طلب واحد بانتظار التأكيد / إعادة المحاولة / تجاهل» chip used to appear on
 * EVERY page of EVERY company until someone discarded it, because the queue is
 * ONE localStorage key shared by every company on the origin and the chip drew
 * a page-level alarm from session-wide state. Two things made it worse: «تجاهل»
 * emptied the whole array, so a user silencing a chip on tc_products destroyed
 * a queued vf_cash write they had never seen; and the navigation guard read the
 * global queue length, so one stuck entry warned on pages where nothing would
 * be lost.
 *
 * Storage stays global — the drain needs one leader over one key (§I4) and
 * array order (§I9). What this file pins is that RENDERING, discarding,
 * acknowledging and the guard are all scoped to the page that owns the failed
 * record:
 *
 *   - the owning page gets the alert, and it names the record;
 *   - any other page gets a quiet neutral pointer to that page, with no button
 *     that acts on someone else's write;
 *   - an entry with NO page stamp (written by the previous build, already
 *     sitting in users' localStorage) is treated as belonging to EVERY page — a
 *     failed write may never go invisible because of this change;
 *   - «تجاهل» on one page cannot destroy another page's queued write. That is
 *     the data-loss assertion below, and it is the strictest one here.
 *
 * The §RT-4 guarantee is unchanged by all of this: a failed write must never be
 * able to scroll off the screen unnoticed. Only WHERE it shouts changes.
 *
 * Run: node tools/verify/rt11_retry_scope.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox } = require('./domstub');

const ROOT = path.resolve(__dirname, '..', '..');

const PAGES = [
  { action: 'tc_products', label: 'الأصناف' },
  { action: 'tc_sales', label: 'المبيعات' }
];

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

/** Extract the single <script>, seed storage, run it in the DOM stub.
 *  The seed lands BEFORE the script runs because loadQueue()/loadDead() run at
 *  load time — write it afterwards and the queue you seeded is never read. */
function loadUIC(extra) {
  const src = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
  const m = src.match(/^<script>([\s\S]*)<\/script>\s*$/);
  if (!m) throw new Error('UI_Components.html is not a single <script> block');
  const opts = Object.assign({}, extra || {});
  const seed = opts.seed || null;
  delete opts.seed;
  const sandbox = makeSandbox(opts);
  if (seed) {
    if (seed.queue) sandbox.localStorage.setItem('erp_live_queue', JSON.stringify(seed.queue));
    if (seed.dead) sandbox.localStorage.setItem('erp_live_dead', JSON.stringify(seed.dead));
  }
  vm.runInContext(m[1], sandbox, { filename: 'UI_Components.html' });
  return sandbox;
}

/** A queued write in the shape save() stamps it (v:2, page/label/row). */
function entry(o) {
  return Object.assign({
    v: 2, target_system: 'tc_sys', page: 'tc_products', label: '', row: '',
    action: 'save_thing', data: { name: 'x' }, request_id: 'rid1',
    message: 'تم الحفظ', tries: 0, at: Date.now()
  }, o || {});
}

/* ── 1. THE REPORTED BUG: the alarm here, a pointer elsewhere ───────────── */
{
  const box = loadUIC({
    CURRENT_ACTION: 'tc_products',
    COMPANY_PAGES: PAGES,
    seed: { queue: [entry({ page: 'tc_products' })] }
  });

  const alert1 = box.document.getElementById('uic-live-retry');
  check(!!alert1, 'on the owning page the red alert chip is drawn');
  check(alert1 && String(alert1.innerHTML).indexOf('بانتظار التأكيد') !== -1,
    'and it announces the pending confirmation, as before');
  check(alert1 && alert1.getAttribute('role') === 'alert',
    'in an alert region — the §RT-4 guarantee did not get quieter');
  check(box.document.getElementById('uic-live-elsewhere') === null,
    'and no neutral chip on the page that owns the record');

  box.CURRENT_ACTION = 'tc_sales';
  box.UIC.Live.refreshChip();
  const alert2 = box.document.getElementById('uic-live-retry');
  const quiet = box.document.getElementById('uic-live-elsewhere');
  check(alert2 === null,
    'after the page changes, the red alert is gone from a page that does not own it');
  check(!!quiet, 'and the quiet chip takes its place');
  const qhtml = quiet ? String(quiet.innerHTML) : '';
  check(qhtml.indexOf('الأصناف') !== -1,
    'naming the owning page by its Arabic name, not the raw action key');
  check(qhtml.indexOf('tc_products') === -1,
    'the raw action key never reaches the user');
  check(qhtml.indexOf('إعادة المحاولة') === -1,
    'no إعادة المحاولة on a page that does not own the write');
  check(qhtml.indexOf('تجاهل') === -1,
    'and no تجاهل either — you act on a record from the page that owns it');
  check(qhtml.indexOf('انتقل إليها') !== -1,
    'the one useful action is offered: go to the record');
  check(quiet.getAttribute('role') === 'status',
    'neutral: role="status", not an alarm');
}

/* ── 2. THE RECORD IS NAMED ─────────────────────────────────────────────── */
{
  const box = loadUIC({
    CURRENT_ACTION: 'tc_products',
    COMPANY_PAGES: PAGES,
    seed: { queue: [entry({ page: 'tc_products', label: 'برميل 20 لتر' })] }
  });
  const chip = box.document.getElementById('uic-live-retry');
  check(!!chip && String(chip.innerHTML).indexOf('تعديل «برميل 20 لتر» بانتظار التأكيد') !== -1,
    'the alert names the record it is about',
    '        innerHTML: ' + (chip ? chip.innerHTML : '(no chip)'));
}

/* ── 3. BACK-COMPAT: an unstamped v:1 entry belongs to EVERY page ───────── */
{
  const legacy = { v: 1, target_system: 'tc_sys', action: 'save_thing', data: {}, message: 'تم الحفظ', tries: 0, at: Date.now() };
  const box = loadUIC({
    CURRENT_ACTION: 'tc_products',
    COMPANY_PAGES: PAGES,
    seed: { queue: [legacy] }
  });
  check(!!box.document.getElementById('uic-live-retry'),
    'an unstamped v:1 entry still raises the red alert on the page you are on');
  check(box.document.getElementById('uic-live-elsewhere') === null,
    'and is never routed to the quiet chip');

  box.CURRENT_ACTION = 'tc_sales';
  box.UIC.Live.refreshChip();
  const chip = box.document.getElementById('uic-live-retry');
  check(!!chip,
    'on ANOTHER page it still raises the red alert — a failed write may never go invisible');
  check(chip && String(chip.innerHTML).indexOf('بانتظار التأكيد') !== -1,
    'with its words intact');
  check(box.document.getElementById('uic-live-elsewhere') === null,
    'and still never the quiet chip');
}

/* ── 4. تجاهل IS SCOPED — the data-loss assertion, the strictest here ───── */
{
  const mine = entry({ page: 'tc_products', action: 'save_product', data: { name: 'منتج' } });
  const theirs = entry({ page: 'vf_cash', target_system: 'vf_sys', action: 'save_cash', data: { amount: 50 }, request_id: 'rid2' });
  const box = loadUIC({
    CURRENT_ACTION: 'tc_products',
    COMPANY_PAGES: PAGES,
    seed: { queue: [mine, theirs] }
  });
  check(box.UIC.Live.queued() === 2, 'two pages have a queued write');

  box.UIC.Live.discardQueue();
  check(box.UIC.Live.queued() === 1,
    'تجاهل on tc_products discards exactly one, not the array');

  const raw = box.localStorage.getItem('erp_live_queue');
  check(raw !== null, 'a queue still exists — the other page\'s write was NOT destroyed');
  let kept = [];
  try { kept = JSON.parse(raw || '[]'); } catch (e) { kept = []; }
  check(kept.length === 1,
    'exactly one entry survives in localStorage',
    '        stored: ' + raw);
  check(kept[0] && kept[0].page === 'vf_cash',
    'and it is the OTHER page\'s write, not this one\'s',
    '        survived: ' + JSON.stringify(kept[0]));
  check(JSON.stringify(kept[0]) === JSON.stringify(theirs),
    'byte-for-byte: the surviving vf_cash entry is untouched',
    '        seeded: ' + JSON.stringify(theirs) + '\n        stored: ' + JSON.stringify(kept[0]));
}

/* ── 5. DEAD-LETTER-ONLY: the chip does not lie and can be cleared ──────── */
{
  const dead = [{ a: 'save_thing', m: 'رفض الخادم', p: 'tc_products', c: 'tc_sys', l: '' }];
  const box = loadUIC({
    CURRENT_ACTION: 'tc_products',
    COMPANY_PAGES: PAGES,
    seed: { queue: [], dead: dead }
  });
  check(box.UIC.Live.queued() === 0, 'the queue itself is empty');
  const chip = box.document.getElementById('uic-live-retry');
  check(!!chip, 'a dead letter alone still raises the chip on the owning page');
  const html = chip ? String(chip.innerHTML) : '';
  check(html.indexOf('0 طلبات') === -1,
    'no «0 طلبات» line — the lying count is gone',
    '        innerHTML: ' + html);
  check(html.indexOf('إعادة المحاولة') === -1,
    'no inert إعادة المحاولة on a chip whose queue is empty');
  check(html.indexOf('تجاهل') === -1,
    'no inert تجاهل either');
  check(html.indexOf('تم') !== -1,
    'the dead letter and its تم are offered — the one button that works');

  box.UIC.Live.ackDead();
  check(box.document.getElementById('uic-live-retry') === null,
    'تم clears it');
  check(JSON.parse(box.localStorage.getItem('erp_live_dead') || '[]').length === 0,
    'and the acknowledgement is persisted');
}

/* ── 6. THE GUARD IS SCOPED ─────────────────────────────────────────────── */
{
  const box = loadUIC({
    CURRENT_ACTION: 'tc_products',
    COMPANY_PAGES: PAGES,
    seed: { queue: [entry({ page: 'tc_sales', action: 'save_sale' })] }
  });
  check(box.UIC.Live.pending() === 1,
    'pending() stays the honest global total: 1');
  check(box.UIC.Live.guardMessage() === null,
    'but leaving tc_products does not warn — nothing here would be lost');

  box.CURRENT_ACTION = 'tc_sales';
  const msg = box.UIC.Live.guardMessage();
  check(typeof msg === 'string' && msg.length > 0,
    'on the owning page the warning is there, as before');
}

/* ── 7. TWO PAGES AT ONCE, viewed from a third ──────────────────────────── */
{
  const box = loadUIC({
    CURRENT_ACTION: 'tc_dashboard',
    COMPANY_PAGES: PAGES,
    seed: { queue: [entry({ page: 'tc_products' }), entry({ page: 'vf_cash', action: 'save_cash' })] }
  });
  check(box.document.getElementById('uic-live-retry') === null,
    'a third page owns neither write, so no alarm here');
  const quiet = box.document.getElementById('uic-live-elsewhere');
  check(!!quiet, 'the quiet chip speaks for both');
  const html = quiet ? String(quiet.innerHTML) : '';
  check(html.indexOf('2 تغييرات لم تُحفظ في صفحات أخرى') !== -1,
    'counting both, in the generic plural wording',
    '        innerHTML: ' + html);
  check(html.indexOf('انتقل إليها') === -1,
    'and offering NO destination — two pages cannot truthfully be named as one');
}

/* ── 8. ESCAPING: a record name is data, never markup ───────────────────── */
{
  const box = loadUIC({
    CURRENT_ACTION: 'tc_products',
    COMPANY_PAGES: PAGES,
    seed: { queue: [entry({ page: 'tc_products', label: '<img src=x onerror=1>' })] }
  });
  const chip = box.document.getElementById('uic-live-retry');
  const html = chip ? String(chip.innerHTML) : '';
  check(!!chip, 'the alert renders');
  check(html.indexOf('<img') === -1,
    'a record name full of markup cannot inject markup into the chip',
    '        innerHTML: ' + html);
  check(html.indexOf('&lt;img') !== -1,
    'it arrives escaped rather than dropped',
    '        innerHTML: ' + html);
}

console.log('\n' + (failed === 0
  ? 'RT11 — the retry chip belongs to the page that owns the record.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
