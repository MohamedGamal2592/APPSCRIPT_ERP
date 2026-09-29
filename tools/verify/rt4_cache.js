/**
 * RT4 — the cache degrades, never breaks, and never serves a change it knows
 * about.
 *
 * A client cache is the one optimisation in this programme that can make the
 * application WRONG rather than merely slow. Three things have to hold, and
 * this file checks all three against the real UIC.Cache:
 *
 *   1. A cached value is rendered AND revalidated. Never one without the other.
 *      Rendering from cache alone is how a stale option list becomes a wrong
 *      record; revalidating without rendering is a slow fetch with extra steps.
 *
 *   2. A store that throws, is full, or has been cleared degrades to a plain
 *      fetch. Safari in private mode throws on ACCESS, not on quota, so the
 *      failure arrives at getItem rather than at setItem — which is why every
 *      single access is wrapped and not just the writes.
 *
 *   3. A table stamp that moved invalidates what was cached against it. This is
 *      why the stamp fix had to ship first: caching against stamps that miss
 *      writes serves stale data with confidence, which is worse than no cache.
 *
 * Run: node tools/verify/rt4_cache.js
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

/* ── 1. It stores and returns what it was given ──────────────────────────── */
{
  const box = loadUIC();
  const C = box.UIC.Cache;
  const k = C.key('co1', 'get_products', { page: 1 });

  check(k.indexOf('co1') !== -1 && k.indexOf('get_products') !== -1,
    'the key names the company and the action');
  check(C.key('co1', 'get_products', { page: 1 }) === C.key('co1', 'get_products', { page: 1 }),
    'the same payload produces the same key');
  check(C.key('co1', 'get_products', { page: 1 }) !== C.key('co1', 'get_products', { page: 2 }),
    'a different payload does not');
  check(C.key('co2', 'get_products', { page: 1 }) !== k,
    'and neither does a different company — one tenant cannot read another\'s cache');

  C.set(k, { rows: [1, 2, 3] });
  check(JSON.stringify(C.get(k)) === JSON.stringify({ rows: [1, 2, 3] }),
    'a stored value comes back intact');
  C.remove(k);
  check(C.get(k) === null, 'and is gone once removed');
}

/* ── 2. Age and version both invalidate ──────────────────────────────────── */
{
  const box = loadUIC();
  const C = box.UIC.Cache;
  const k = C.key('co1', 'a', {});

  C.set(k, 'v1', { version: '1000' });
  check(C.get(k, { version: '1000' }) === 'v1', 'a matching version is served');
  check(C.get(k, { version: '2000' }) === null,
    'a table stamp that moved invalidates what was cached against it');
  check(C.get(k, { version: '1000' }) === null,
    'and the invalid entry is dropped, not just skipped');

  C.set(k, 'v2');
  check(C.get(k, { maxAge: -1 }) === null, 'an entry past its age cap is not served');
  check(C.get(k) === null, 'and that one is dropped too');
}

/* ── 3. Eviction, and a hard cap that is actually enforced ───────────────── */
{
  const box = loadUIC();
  const C = box.UIC.Cache;
  const big = 'x'.repeat(200 * 1024);
  for (let i = 0; i < 30; i++) C.set(C.key('co', 'big', { i }), big);

  check(C._bytes() <= C.MAX_BYTES,
    'the store stays inside its cap',
    '        ' + C._bytes() + ' > ' + C.MAX_BYTES);
  check(Object.keys(C._index()).length < 30,
    'which means it evicted rather than growing without bound');
  check(C.get(C.key('co', 'big', { i: 29 })) !== null,
    'the most recent entry survives — eviction is least-recently-used, not first-in');
}

/* ── 4. A throwing store degrades to a plain fetch ───────────────────────── */
{
  /* Safari private mode: localStorage EXISTS and throws on access. */
  const hostile = {
    getItem: function () { throw new Error('SecurityError'); },
    setItem: function () { throw new Error('QuotaExceededError'); },
    removeItem: function () { throw new Error('SecurityError'); }
  };
  const box = loadUIC({ localStorage: hostile });
  const C = box.UIC.Cache;

  let threw = false, got = null;
  try {
    C.set(C.key('co', 'a', {}), 'x');
    got = C.get(C.key('co', 'a', {}));
  } catch (e) { threw = true; }
  check(!threw, 'a store that throws on every access does not throw out of the cache');
  check(got === null, 'and simply reports a miss');

  let calls = 0;
  return_swr(box, function () { calls++; return Promise.resolve({ ok: 1 }); })
    .then(function (r) {
      check(calls === 1 && r && r.ok === 1,
        'so swr falls straight through to a real fetch');
      stage5();
    });

  function return_swr(b, call) {
    return b.UIC.Cache.swr({ call: call, company: 'co', action: 'a', payload: {} });
  }
}

/* ── 5. Cache-first ALWAYS revalidates ───────────────────────────────────── */
function stage5() {
  const box = loadUIC();
  const C = box.UIC.Cache;
  let calls = 0;
  let freshSeen = null;

  const opts = {
    call: function () { calls++; return Promise.resolve({ n: calls }); },
    company: 'co', action: 'get_x', payload: {},
    onFresh: function (f) { freshSeen = f; }
  };

  C.swr(opts).then(function (first) {
    check(calls === 1 && first.n === 1, 'a cold cache fetches');
    return C.swr(opts);
  }).then(function (second) {
    check(second.n === 1, 'a warm cache answers immediately, from what it already had');
    /* The revalidation is scheduled, not awaited — give it a turn. */
    return new Promise(function (r) { setTimeout(r, 0); });
  }).then(function () {
    check(calls === 2,
      'AND it revalidated behind — a cached value is never rendered without one');
    check(freshSeen && freshSeen.n === 2,
      'and the caller is handed the fresh value when it differs from the cached one');
    stage6();
  });
}

/* ── 6. The wiring: eviction is driven by the stamps, not by a timer ─────── */
function stage6() {
  const src = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');

  const watch = src.slice(src.indexOf('function watchPage'), src.indexOf('function unwatchPage'));
  check(/UIC\.Cache\.bust\(\)/.test(watch),
    'the change watch busts the cache when a table it watches moves');
  check(watch.indexOf('UIC.Cache.bust()') < watch.indexOf('o.onChange(moved)'),
    'and busts BEFORE the page refetches, so the refetch is not served the value that just went stale');

  /* Every access wrapped — the property this whole module depends on. */
  const cache = src.slice(src.indexOf('UIC.Cache = (function'), src.indexOf('UIC.Live = (function'));
  const bare = (cache.match(/localStorage\.(getItem|setItem|removeItem)/g) || []).length;
  const wrapped = (cache.match(/try \{[^}]*localStorage\.(getItem|setItem|removeItem)/g) || []).length;
  check(bare === wrapped,
    'every single localStorage access in the cache is inside a try/catch',
    '        ' + bare + ' accesses, ' + wrapped + ' wrapped');

  /* The stale paint must be inert. */
  check(/\.rt-stale > \*:not\(\.pt-loading\) \{[^}]*pointer-events: none/.test(src),
    'the previous paint is drawn inert — its action buttons name record ids that may no longer be right');
  check(/saveLastPaint/.test(src) && /lastPaint\(\)/.test(src),
    'and it is both saved and read back');

  /* Prefetch on intent. */
  const helpers = fs.readFileSync(path.join(ROOT, 'Client_Helpers.html'), 'utf8');
  check(/mouseenter/.test(helpers) && /touchstart/.test(helpers),
    'prefetch runs on intent — hover and touch — not on a fixed timer');
  check(/requestIdleCallback/.test(helpers),
    'and on genuine idle after first paint, where the browser says so');
  check(/PREFETCH_MAX_INFLIGHT\s*=\s*\d+/.test(helpers),
    'with a cap on how many can be in flight at once');
  check(/__prefetchSeen\[token\]/.test(helpers),
    'and deduplication, so the same intent signalled ten times costs one request');
  check(/visibilityState === 'hidden'/.test(helpers),
    'a hidden tab prefetches nothing — it is not about to click anything');
  check(/function schedulePrefetch\(\)/.test(helpers),
    'the old name still exists, so its forty call sites did not have to change');
  check(!/setTimeout\([\s\S]{0,60}?, 2000\)/.test(helpers.slice(helpers.indexOf('function schedulePrefetch'), helpers.indexOf('UIC.prefetchOnIntent'))),
    'and the fixed two-second guess is gone');

  console.log('\n' + (failed === 0
    ? 'RT4 — cache-first, always revalidated, and harmless when the store refuses.'
    : failed + ' check(s) FAILED.'));
  process.exit(failed === 0 ? 0 : 1);
}
