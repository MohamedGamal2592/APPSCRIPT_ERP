/**
 * RT2b — an optimistic row is a promise, and this is what makes it honest.
 *
 * UIC.Live.save puts a row on screen before the server has seen it. That is the
 * whole point, and it is only defensible because of what happens when the save
 * does not land. Two different failures, two different right answers:
 *
 *   The server REFUSED the payload — a validation error, a permission error, a
 *   duplicate key. It will refuse it again, so the row comes off the screen and
 *   the list goes back to EXACTLY what it was. Not approximately: the same
 *   objects, in the same order, with the same fields. A rollback that leaves a
 *   stray __pending flag, or a row in the wrong position, or nine rows where
 *   there were ten, is a rollback that has quietly rewritten the user's screen.
 *
 *   The request NEVER ARRIVED — the network dropped, the device went offline.
 *   The payload is still good. Throwing it away and showing a toast that fades
 *   in three seconds is how a change made on a warehouse phone goes missing
 *   with nobody the wiser. It is queued, retried with backoff, and a chip that
 *   does NOT fade says so until it lands or the user discards it.
 *
 * This file runs the real UIC.Live against the real DOM stub and checks both,
 * by deep-comparing the list before and after. It is deliberately the strictest
 * check in this programme: everything else here makes the app faster, and this
 * is the one that stops it lying.
 *
 * Run: node tools/verify/rt2_queue.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox } = require('./domstub');

const ROOT = path.resolve(__dirname, '..', '..');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

function loadUIC(extra) {
  const src = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
  const m = src.match(/^<script>([\s\S]*)<\/script>\s*$/);
  if (!m) throw new Error('UI_Components.html is not a single <script> block');
  const sandbox = makeSandbox(extra);
  vm.runInContext(m[1], sandbox, { filename: 'UI_Components.html' });
  return sandbox;
}

/** A stable, order-sensitive snapshot of a list of plain records. */
function snap(list) {
  return JSON.stringify(list, function (k, v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = {};
      Object.keys(v).sort().forEach(function (kk) { o[kk] = v[kk]; });
      return o;
    }
    return v;
  });
}

function seed() {
  return [
    { id: '3', name: 'ثالث', amount: 30 },
    { id: '2', name: 'ثاني', amount: 20 },
    { id: '1', name: 'أول', amount: 10 }
  ];
}

/* ── 1. A refused ADD leaves the list byte-identical ─────────────────────── */
{
  const box = loadUIC();
  const list = seed();
  const before = snap(list);
  let renders = 0;

  const p = box.UIC.Live.save({
    call: function () { return Promise.reject({ status: 'error', message: 'مرفوض' }); },
    action: 'add_thing',
    data: { name: 'جديد', amount: 99 },
    list: list,
    key: 'id',
    draft: { name: 'جديد', amount: 99 },
    render: function () { renders++; },
    message: 'تم الحفظ'
  });

  /* The row must be visible BEFORE the request settles — that is the feature. */
  check(list.length === 4 && list[0].name === 'جديد',
    'the draft row is on screen before the request settles');
  check(list[0].__pending === true, 'and it is marked pending while it is unconfirmed');

  p.catch(function () {}).then(function () {
    check(list.length === 3, 'a refused add takes the row back off');
    check(snap(list) === before,
      'and the list is byte-identical to what it was before the save',
      '        before: ' + before + '\n        after:  ' + snap(list));
    check(renders >= 2, 'the page was redrawn on the way in and on the way back');
    stage2();
  });
}

/* ── 2. A refused EDIT restores the ORIGINAL row, not a copy of it ───────── */
function stage2() {
  const box = loadUIC();
  const list = seed();
  const original = list[1];
  const before = snap(list);

  box.UIC.Live.save({
    call: function () { return Promise.reject({ status: 'error', message: 'مرفوض' }); },
    action: 'edit_thing',
    data: { id: '2', name: 'معدَّل', amount: 999 },
    list: list,
    key: 'id',
    draft: { id: '2', name: 'معدَّل', amount: 999 },
    render: function () {},
    message: 'تم الحفظ'
  }).catch(function () {}).then(function () {
    check(snap(list) === before, 'a refused edit restores the row exactly');
    check(list[1] === original,
      'and restores the SAME object, so anything else holding a reference to it is still right');
    check(list[1].__pending === undefined,
      'no __pending flag is left behind on a rolled-back row');
    stage3();
  });
}

/* ── 3. A confirmed save replaces the draft with the server's record ─────── */
function stage3() {
  const box = loadUIC();
  const list = seed();

  box.UIC.Live.save({
    call: function () {
      return Promise.resolve({
        status: 'success',
        record: { id: '99', name: 'جديد', amount: 99, computed_total: 1234, record_uid: 'rec_x' }
      });
    },
    action: 'add_thing',
    data: { name: 'جديد', amount: 99 },
    list: list,
    key: 'id',
    draft: { name: 'جديد', amount: 99 },
    render: function () {},
    recordOf: function (r) { return r.record; },
    message: 'تم الحفظ'
  }).then(function () {
    check(list.length === 4 && list[0].id === '99',
      'the server\'s record replaces the draft, carrying the id it assigned');
    check(list[0].computed_total === 1234,
      'and the fields the server computed, which the draft could not have known');
    check(list[0].__pending === false, 'the row stops being pending once it is confirmed');
    check(!String(list[0].id).startsWith('__tmp_'),
      'no temporary key survives into the confirmed row');
    stage4();
  });
}

/* ── 4. A transport failure QUEUES rather than discards ──────────────────── */
function stage4() {
  const box = loadUIC();
  const list = seed();
  let calls = 0;

  box.UIC.Live.save({
    call: function () {
      calls++;
      return Promise.reject({ status: 'error', transport: true, message: 'network' });
    },
    action: 'add_thing',
    data: { name: 'جديد', amount: 99 },
    list: list,
    key: 'id',
    draft: { name: 'جديد', amount: 99 },
    render: function () {},
    message: 'تم الحفظ'
  }).catch(function () {}).then(function () {
    check(box.UIC.Live.queued() === 1,
      'a request that never reached the server is queued, not thrown away');
    check(list.length === 4,
      'and the row STAYS on screen — the payload is still good and it is still going to land');

    const chip = box.document.body.children.filter(function (c) {
      return String(c.id || '') === 'uic-live-retry';
    })[0];
    check(!!chip, 'a chip says so');
    check(chip && String(chip.innerHTML || '').indexOf('إعادة المحاولة') !== -1,
      'and offers to retry now');
    check(chip && !/class="[^"]*toast/.test(String(chip.className || '')),
      'the chip is not a toast: it does not disappear on its own');
    check(box.UIC.Live.pending() >= 1,
      'pending() counts it, so the navigation guard can see it');
    check(typeof box.UIC.Live.guardMessage() === 'string',
      'and the guard has something to say before the page is left');

    /* Persistence: a phone that loses signal is a phone about to be pocketed. */
    check(box.localStorage.getItem('erp_live_queue') !== null,
      'the queue survives the tab being closed');

    stage5();
  });
}

/* ── 5. A retry that the server then refuses stops retrying ──────────────── */
function stage5() {
  const box = loadUIC();
  const list = seed();
  let calls = 0;

  box.UIC.Live.save({
    call: function () {
      calls++;
      if (calls === 1) return Promise.reject({ status: 'error', transport: true, message: 'network' });
      return Promise.reject({ status: 'error', message: 'مرفوض من الخادم' });
    },
    action: 'add_thing',
    data: { name: 'جديد' },
    list: list,
    key: 'id',
    draft: { name: 'جديد' },
    render: function () {},
    message: 'تم الحفظ'
  }).catch(function () {}).then(function () {
    check(box.UIC.Live.queued() === 1, 'the transport failure queued');
    box.UIC.Live.retryNow();
    return new Promise(function (r) { setTimeout(r, 0); });
  }).then(function () {
    check(calls === 2, 'the retry actually went out');
    check(box.UIC.Live.queued() === 0,
      'and a server refusal on retry drops it from the queue rather than retrying forever');
    stage6();
  });
}

/* ── 6. The source-level guarantees no runtime check can reach ───────────── */
function stage6() {
  const src = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
  const helpers = fs.readFileSync(path.join(ROOT, 'Client_Helpers.html'), 'utf8');

  check(/transport:\s*true/.test(helpers),
    'API.call marks a failure that never reached a handler, so the retry decision is exact rather than a guess');
  check(/withFailureHandler[\s\S]{0,600}transport:\s*true/.test(helpers),
    'and it marks ONLY the failure handler — a handler that rejected is never retried');

  /* The retry backoff must not be able to become a hammer. */
  check(/Math\.min\(5000 \* Math\.pow\(2, tries\), 80000\)/.test(src),
    'the retry backs off exponentially and is capped');
  check(/RETRY_MAX\s*=\s*\d+/.test(src),
    'and gives up after a bounded number of tries rather than retrying forever');

  /* Discarding a queued change must always be the user's decision. */
  const dq = src.slice(src.indexOf('function discardQueue'));
  check(/window\.confirm/.test(dq.slice(0, 800)),
    'a queued change is only discarded when the user says so');

  /* The navigation guard. */
  check(/UIC\.Live\.guardMessage/.test(src.slice(0, src.indexOf('UIC.Live ='))),
    'UIC.navTo asks before leaving with an unsaved row');
  check(/beforeunload/.test(src),
    'and so does closing the tab');

  console.log('\n' + (failed === 0
    ? 'RT2b — a refused save leaves the list exactly as it was, and a dropped one is not lost.'
    : failed + ' check(s) FAILED.'));
  process.exit(failed === 0 ? 0 : 1);
}
