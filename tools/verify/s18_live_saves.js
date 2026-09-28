/**
 * S18 — UIC.Live: optimistic saves and cross-device change polling.
 *
 * This is shared machinery every ValleyFoods page is being moved onto, so the
 * two things that matter are proved by RUNNING it, not by reading it:
 *
 *   1. The row appears before the request resolves, and if the request fails
 *      the list goes back EXACTLY as it was. An optimistic UI that cannot roll
 *      back cleanly is worse than none, because it silently leaves the user
 *      looking at data the server rejected.
 *
 *   2. The poller reacts only to a stamp that EXISTS and CHANGED. CacheService
 *      evicts, and a vanished stamp must read as "no information" — otherwise
 *      an eviction becomes a refresh storm across every open device.
 *
 * The real UI_Components.html is loaded on the DOM stub; timers are QUEUED
 * rather than fired, so the polling schedule is driven deliberately.
 *
 * Run: node tools/verify/s18_live_saves.js
 */
'use strict';

const vm = require('vm');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

function freshSandbox() {
  const sb = makeSandbox({
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }), host: {}, history: {} } },
    scriptUrl: 'https://example.invalid/exec',
    SESSION_TOKEN: 'tok', CURRENT_ACTION: 'smoke',
    COMPANY_PAGES: [], USER_PAGES: null, IS_SUPER_ADMIN: true
  });
  sb.location = { href: '', search: '', origin: '', pathname: '/' };
  ['UI_Components.html', 'Client_Helpers.html'].forEach(function (f) {
    S.scriptBlocks(S.read(f)).forEach(function (b, i) {
      vm.runInContext(S.stripScriptlets(b.body), sb, { filename: f + '#' + i });
    });
  });
  return sb;
}

/** Fire every queued timer once, in order. */
function runTimers(sb) {
  const due = sb.__timers.slice();
  sb.__timers.length = 0;
  due.forEach(t => { if (t && typeof t.fn === 'function') t.fn(); });
}

const settle = () => new Promise(r => setImmediate(r));

async function main() {
  const sb0 = freshSandbox();
  console.log('\n0 — the shared layer exposes it\n');
  check(!!sb0.UIC && !!sb0.UIC.Live, 'UIC.Live is defined by the shared layer');
  ['save', 'busy', 'watchPage', 'unwatchPage'].forEach(function (fn) {
    check(typeof (sb0.UIC.Live || {})[fn] === 'function', '  UIC.Live.' + fn + '()');
  });

  /* ══ 1. the row appears before the request resolves ═══════════════════ */
  console.log('\n1 — the change is on screen before the server has answered\n');
  {
    const sb = freshSandbox();
    const list = [{ uid: 'A', name: 'first' }];
    let renders = 0;
    let resolveCall;
    const call = () => new Promise(r => { resolveCall = r; });

    const p = sb.UIC.Live.save({
      call: call, action: 'save_x', data: {},
      list: list, key: 'uid', draft: { uid: 'B', name: 'new row' },
      render: function () { renders++; }
    });

    check(list.length === 2, 'the draft is in the list immediately', list.length);
    check(list[0].uid === 'B', '  at the top');
    check(list[0].__pending === true, '  flagged __pending so a page can grey the row');
    check(renders === 1, '  and the page was told to redraw once', renders);
    check(sb.UIC.Live.busy() === true, '  busy() is true while it is on the wire');

    resolveCall({ status: 'success', message: 'تم', record: { uid: 'B7', name: 'new row', id: 42 } });
    await p;
    check(list.length === 2, 'after the reply the list still has 2 rows', list.length);
    check(list[0].uid === 'B7' && list[0].id === 42,
      "the server's record REPLACES the draft, carrying the assigned id", JSON.stringify(list[0]));
    check(list[0].__pending === false, '  and is no longer pending');
    check(renders === 2, '  one more redraw', renders);
    check(sb.UIC.Live.busy() === false, '  busy() is false again');
  }

  /* ══ 2. a failed save puts the list back exactly ══════════════════════ */
  console.log('\n2 — a rejected save restores the list exactly\n');
  {
    const sb = freshSandbox();
    const original = [{ uid: 'A', name: 'first' }, { uid: 'C', name: 'third' }];
    const list = original.slice();
    const before = JSON.stringify(list);
    let renders = 0;
    let rejectCall;
    const call = () => new Promise((_, rej) => { rejectCall = rej; });

    const p = sb.UIC.Live.save({
      call: call, action: 'save_x', data: {},
      list: list, key: 'uid', draft: { uid: 'B', name: 'doomed' },
      render: function () { renders++; }
    }).catch(function () { /* the helper rethrows so callers can react */ });

    check(list.length === 3, 'the draft was inserted optimistically', list.length);
    rejectCall({ status: 'error', message: 'الكود مكرر' });
    await p;
    check(list.length === 2, 'the failed row is gone again', list.length);
    check(JSON.stringify(list) === before, '  and the list is byte-identical to before the save',
      JSON.stringify(list) + ' vs ' + before);
    check(renders === 2, '  with a redraw for the insert and one for the rollback', renders);
    check(sb.UIC.Live.busy() === false, '  and nothing is left in flight');
  }

  /* ══ 3. editing an existing row, and failing ══════════════════════════ */
  console.log('\n3 — a failed EDIT restores the original row, not a blank one\n');
  {
    const sb = freshSandbox();
    const list = [{ uid: 'A', name: 'original', amount: 100 }];
    const originalRow = JSON.stringify(list[0]);
    let rejectCall;
    const call = () => new Promise((_, rej) => { rejectCall = rej; });

    const p = sb.UIC.Live.save({
      call: call, action: 'save_x', data: {},
      list: list, key: 'uid', draft: { uid: 'A', name: 'edited', amount: 999 },
      render: function () {}
    }).catch(function () {});

    check(list[0].name === 'edited' && list[0].amount === 999,
      'the edit shows immediately', JSON.stringify(list[0]));
    check(list.length === 1, '  in place, without duplicating the row');
    rejectCall({ status: 'error', message: 'مرفوض' });
    await p;
    check(list.length === 1, 'after the failure there is still one row', list.length);
    check(JSON.stringify(list[0]) === originalRow,
      '  and it is the ORIGINAL, field for field', JSON.stringify(list[0]));
  }

  /* ══ 4. a reply with no record ════════════════════════════════════════ */
  console.log('\n4 — a handler that returns no record still behaves\n');
  {
    const sb = freshSandbox();
    const list = [];
    let resolveCall;
    const call = () => new Promise(r => { resolveCall = r; });
    const p = sb.UIC.Live.save({
      call: call, action: 'save_x', data: {},
      list: list, key: 'uid', draft: { name: 'no key at all' },
      render: function () {}
    });
    check(String(list[0].uid).indexOf('__tmp_') === 0,
      'a draft with no key gets a temporary one so it can be tracked', list[0].uid);
    resolveCall({ status: 'success', message: 'تم' });
    await p;
    check(list.length === 1, 'the row stays', list.length);
    check(list[0].__pending === undefined, '  no longer pending');
    check(list[0].__stale === true,
      '  but flagged __stale, because its key is still the temporary one', JSON.stringify(list[0].__stale));
  }

  /* ══ 5. no list to patch — the helper still saves ═════════════════════ */
  console.log('\n5 — with no list to patch it degrades to a plain save\n');
  {
    const sb = freshSandbox();
    let called = null;
    const call = (a, d) => { called = { a: a, d: d }; return Promise.resolve({ status: 'success' }); };
    await sb.UIC.Live.save({ call: call, action: 'save_y', data: { x: 1 } });
    check(called && called.a === 'save_y' && called.d.x === 1,
      'the action and payload still go through', JSON.stringify(called));
    let reloaded = false;
    const failing = () => Promise.reject({ message: 'nope' });
    await sb.UIC.Live.save({ call: failing, action: 'save_y', data: {}, reload: function () { reloaded = true; } })
      .catch(function () {});
    check(reloaded === true, 'and a failure with no patch falls back to the reload the page gave it');
  }

  /* ══ 6. change polling ════════════════════════════════════════════════ */
  console.log('\n6 — watchPage: only an EXISTING, CHANGED stamp is a change\n');
  {
    const sb = freshSandbox();
    let reply = { status: 'success', versions: { t1: '100', t2: '200' } };
    const calls = [];
    const call = (a, d) => { calls.push({ a: a, d: d }); return Promise.resolve(reply); };
    const fired = [];

    sb.UIC.Live.watchPage({
      call: call, page: 'vf_cash', intervalMs: 30000,
      onChange: function (tables) { fired.push(tables.slice()); }
    });
    check(calls.length === 0, 'nothing is polled until the first interval elapses', calls.length);

    runTimers(sb); await settle();
    check(calls.length === 1 && calls[0].a === 'get_page_versions',
      'the first tick calls get_page_versions', JSON.stringify(calls[0] && calls[0].a));
    check(calls[0].d.page === 'vf_cash', '  naming the page', calls[0].d.page);
    check(fired.length === 0, '  and fires nothing — the first reply is the BASELINE', fired.length);

    /* unchanged */
    runTimers(sb); await settle();
    check(fired.length === 0, 'an identical second reply is not a change', fired.length);

    /* one table moves */
    reply = { status: 'success', versions: { t1: '100', t2: '999' } };
    runTimers(sb); await settle();
    check(fired.length === 1 && fired[0].join(',') === 't2',
      'a stamp that CHANGED fires, naming just that table', JSON.stringify(fired));

    /* a stamp disappears — an eviction, not a change */
    reply = { status: 'success', versions: { t1: '100' } };
    runTimers(sb); await settle();
    check(fired.length === 1, 'a stamp that VANISHED fires nothing (CacheService evicted it)', fired.length);

    /* a table seen for the first time is a baseline, not a change */
    reply = { status: 'success', versions: { t1: '100', t3: '555' } };
    runTimers(sb); await settle();
    check(fired.length === 1, 'a table seen for the FIRST time is a baseline, not a change', fired.length);
    reply = { status: 'success', versions: { t1: '100', t3: '556' } };
    runTimers(sb); await settle();
    check(fired.length === 2 && fired[1].join(',') === 't3', '  but its next move does fire', JSON.stringify(fired[1]));

    sb.UIC.Live.unwatchPage();
    const n = calls.length;
    runTimers(sb); await settle();
    check(calls.length === n, 'unwatchPage stops the poll', calls.length + ' vs ' + n);
  }

  /* ══ 7. the poll gets out of the way ══════════════════════════════════ */
  console.log('\n7 — the poll does not fight the user\n');
  {
    const sb = freshSandbox();
    const calls = [];
    const call = () => { calls.push(1); return Promise.resolve({ versions: {} }); };
    sb.document.hidden = true;
    sb.UIC.Live.watchPage({ call: call, page: 'vf_cash', intervalMs: 30000, onChange: function () {} });
    runTimers(sb); await settle();
    check(calls.length === 0, 'a hidden tab is not polled at all', calls.length);

    sb.document.hidden = false;
    runTimers(sb); await settle();
    check(calls.length === 1, '  and resumes when the tab comes back', calls.length);
    sb.UIC.Live.unwatchPage();
  }
  {
    /* A poll that landed mid-save would replace the row the user just watched
       appear with a server list that does not have it yet. */
    const sb = freshSandbox();
    const polls = [];
    let resolveSave;
    sb.UIC.Live.save({
      call: () => new Promise(r => { resolveSave = r; }),
      action: 'save_x', data: {}, list: [], key: 'uid', draft: { uid: 'Z' }, render: function () {}
    }).catch(function () {});
    sb.UIC.Live.watchPage({
      call: () => { polls.push(1); return Promise.resolve({ versions: {} }); },
      page: 'vf_cash', intervalMs: 30000, onChange: function () {}
    });
    runTimers(sb); await settle();
    check(polls.length === 0, 'no poll is issued while a save is still in flight', polls.length);
    resolveSave({ status: 'success' });
    await settle();
    runTimers(sb); await settle();
    check(polls.length === 1, '  and one is issued once the save lands', polls.length);
    sb.UIC.Live.unwatchPage();
  }

  /* ══ 8. a floor on the interval, and backoff ══════════════════════════ */
  console.log('\n8 — the poll cannot be configured into a quota fire\n');
  {
    const sb = freshSandbox();
    /* The shared layer queues its own timers at load (a page-load watchdog),
       so start from an empty queue or they are counted as ours. */
    sb.__timers.length = 0;
    sb.UIC.Live.watchPage({
      call: () => Promise.resolve({ versions: {} }),
      page: 'vf_cash', intervalMs: 250, onChange: function () {}
    });
    const scheduled = sb.__timers.filter(Boolean).map(t => t.ms);
    check(scheduled.length === 1 && scheduled[0] >= 10000,
      'an interval below the 10s floor is raised to it, not honoured',
      JSON.stringify(scheduled));
    sb.UIC.Live.unwatchPage();
  }
  {
    const sb = freshSandbox();
    sb.__timers.length = 0;
    let fail = true;
    sb.UIC.Live.watchPage({
      call: () => fail ? Promise.reject(new Error('down')) : Promise.resolve({ versions: {} }),
      page: 'vf_cash', intervalMs: 10000, onChange: function () {}
    });
    runTimers(sb); await settle();
    const first = sb.__timers.filter(Boolean).map(t => t.ms)[0];
    runTimers(sb); await settle();
    const second = sb.__timers.filter(Boolean).map(t => t.ms)[0];
    check(first > 10000 && second > first,
      'consecutive failures back the poll off instead of hammering a sick server',
      first + ' then ' + second);
    sb.UIC.Live.unwatchPage();
  }

  console.log('\n9 — a queued confirmation reconciles the original optimistic row\n');
  {
    const sb = freshSandbox();
    const list = [];
    let sends = 0;
    const call = () => {
      sends++;
      return sends === 1
        ? Promise.reject({ status: 'error', transport: true, uncertain: true, message: 'offline' })
        : Promise.resolve({ status: 'success', record: { uid: 'server-row', amount: 17 } });
    };
    const p = sb.UIC.Live.save({
      call: call, action: 'save_scan',
      data: { __request_id: 'scan_request_123456' }, uid: '__request_id',
      list: list, key: 'uid', draft: { uid: 'client-row', amount: 17 }, render: function () {}
    }).catch(function () {});
    await p;
    check(list[0] && list[0].__pending === true && sb.UIC.Live.queued() === 1,
      'transport uncertainty keeps exactly one pending row and queued request');
    sb.UIC.Live.retryNow();
    await settle(); await settle();
    check(sends === 2 && list[0] && list[0].uid === 'server-row' && list[0].__pending === false,
      'later same-request confirmation replaces the correct row, not merely the retry chip', JSON.stringify(list[0]));
  }

  console.log('\n' + (failed === 0
    ? 'S18 — optimistic saves and change polling both check out.'
    : failed + ' check(s) FAILED.'));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function (e) {
  console.log('FATAL — ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
