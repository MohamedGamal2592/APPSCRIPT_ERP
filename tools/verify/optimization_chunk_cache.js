'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = new Map();
let lastPutAllTtl = null;
const cache = {
  get: key => store.get(key) || null,
  getAll: keys => Object.fromEntries(keys.filter(k => store.has(k)).map(k => [k, store.get(k)])),
  put: (key, value) => store.set(key, value),
  putAll: (values, ttl) => { lastPutAllTtl = ttl; Object.entries(values).forEach(([k, v]) => store.set(k, v)); },
  removeAll: keys => keys.forEach(k => store.delete(k)),
  remove: key => store.delete(key)
};
const ctx = {
  console,
  CONFIG: { TABLE_CACHE_MAX_CHUNKS: 50, TABLE_CACHE_CHUNK_SIZE: 32 },
  CacheService: { getScriptCache: () => cache },
  Utilities: undefined
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'Code.js'), 'utf8'), ctx, { filename: 'Code.js' });
/* The canonical Code.js declares its production CONFIG. Override only the
   chunk-size knobs so this offline fixture can force a multi-chunk payload. */
vm.runInContext('CONFIG.TABLE_CACHE_MAX_CHUNKS = 50; CONFIG.TABLE_CACHE_CHUNK_SIZE = 32;', ctx);

const value = { text: 'بيانات عربية '.repeat(40), rows: [{ id: 1, label: '✓'.repeat(50) }] };
const key = 'refs/db-a/products';
assert.strictEqual(ctx.putChunkedCache_(key, value, 60), true);
assert.strictEqual(JSON.stringify(ctx.getChunkedCache_(key)), JSON.stringify(value));
const base = ctx.chunkedCacheKeys_(key);
const manifest = JSON.parse(store.get(base.manifest));
assert.ok(manifest.g && manifest.n > 1 && manifest.bytes > 0 && manifest.h, 'manifest records generation and integrity metadata');
const publication = ctx.chunkedCacheKeys_(key, manifest.g);
for (let i = 0; i < manifest.n; i++) assert.ok(ctx.utf8ByteLength_(store.get(publication.prefix + i)) <= 32, 'every chunk stays within byte budget');

// Partial eviction and integrity failure are misses, never truncated values.
store.delete(publication.prefix + (manifest.n - 1));
assert.strictEqual(ctx.getChunkedCache_(key), null);
assert.strictEqual(ctx.putChunkedCache_(key, value, 60), true);
const m2 = JSON.parse(store.get(base.manifest));
const p2 = ctx.chunkedCacheKeys_(key, m2.g);
store.set(p2.prefix + '0', store.get(p2.prefix + '0') + 'x');
assert.strictEqual(ctx.getChunkedCache_(key), null);

// Deterministic reader/writer interleaving: a reader cannot combine generations.
const oldValue = { version: 'old', rows: [{ id: 1, unit: 'كجم' }] };
const newValue = { version: 'new', rows: [{ id: 1, unit: 'شيكارة' }, { id: 2 }] };
ctx.putChunkedCache_(key, oldValue, 60);
const oldManifest = JSON.parse(store.get(base.manifest));
const oldPub = ctx.chunkedCacheKeys_(key, oldManifest.g);
const originalGetAll = cache.getAll;
let interleaved = false;
cache.getAll = keys => {
  if (!interleaved && keys[0] && keys[0].indexOf(oldPub.prefix) === 0) { interleaved = true; ctx.putChunkedCache_(key, newValue, 60); }
  return originalGetAll(keys);
};
const interleavedRead = ctx.getChunkedCache_(key);
cache.getAll = originalGetAll;
assert.ok(interleavedRead === null || JSON.stringify(interleavedRead) === JSON.stringify(oldValue), 'interleaved read is old complete value or miss');
assert.strictEqual(JSON.stringify(ctx.getChunkedCache_(key)), JSON.stringify(newValue), 'later publication is complete');

// Invalidation during an in-flight build rejects the late publication.
const failedKey = 'refs/db-a/failed';
const originalPutAll = cache.putAll;
let invalidatedDuringPut = false;
cache.putAll = (values, ttl) => { originalPutAll(values, ttl); if (!invalidatedDuringPut) { invalidatedDuringPut = true; ctx.removeChunkedCache_(failedKey); } };
assert.strictEqual(ctx.putChunkedCache_(failedKey, { stale: true }, 60), false, 'late builder is rejected after invalidation');
cache.putAll = originalPutAll;
assert.strictEqual(ctx.getChunkedCache_(failedKey), null);

// Legacy migration is a deliberate cold miss, including collisions.
[['tenant/a', { owner: 'slash' }], ['tenant?a', { owner: 'question' }]].forEach(([k, v]) => {
  const legacy = ctx.legacyChunkedCacheKeys_(k);
  store.set(legacy.manifest, JSON.stringify({ n: 1 }));
  store.set(legacy.prefix + '0', JSON.stringify(v));
  assert.strictEqual(ctx.getChunkedCache_(k), null, 'legacy data is never returned for ' + k);
});
const longA = 'x'.repeat(240) + '/one';
const longB = 'x'.repeat(240) + '/two';
assert.notStrictEqual(ctx.chunkedCacheKeys_(longA).manifest, ctx.chunkedCacheKeys_(longB).manifest);
assert.strictEqual(ctx.putChunkedCache_(longA, { owner: 'one' }, 60), true);
assert.strictEqual(ctx.putChunkedCache_(longB, { owner: 'two' }, 60), true);
assert.strictEqual(JSON.stringify(ctx.getChunkedCache_(longA)), JSON.stringify({ owner: 'one' }));
assert.strictEqual(JSON.stringify(ctx.getChunkedCache_(longB)), JSON.stringify({ owner: 'two' }));

// ── OPT-2 migration: TopLight cachedMap_ families ──────────────────────────
// The real TL slice (cachedMap_ now chunked + stamp bump + chunk-aware bust)
// over the real Code.js chunk helpers, with a Map-backed cache.
function grabNested(src, name) {
  const start = src.indexOf('  function ' + name + '(');
  assert(start >= 0, 'missing nested ' + name);
  const end = src.indexOf('\n  function ', start + 10);
  return src.slice(start, end < 0 ? src.length : end);
}
const tlSource = fs.readFileSync(path.join(__dirname, '..', '..', 'Company_TopLight_Actions.js'), 'utf8');
const tlTtl = Number((tlSource.match(/const TL_REF_TTL\s*=\s*(\d+)/) || [])[1]);
assert.ok(tlTtl > 0, 'TL_REF_TTL located in source');
ctx.TL_REF_TTL = tlTtl;
vm.runInContext(
  ['cachedMap_', 'tlRefsVersion_', 'bumpTlRefsVersion_', 'tlCachedMap_', 'bustTopLightCaches_']
    .map(n => grabNested(tlSource, n)).join('\n'),
  ctx, { filename: 'Company_TopLight_Actions.js (slice)' }
);

let builds = 0;
const bigMap = { qty: {} };
for (let i = 0; i < 40; i++) bigMap.qty['منتج-' + i] = i; // Arabic keys, multi-chunk at 32B
const tlDb = 'db-tl-1';
// Deterministic stamp: the stamp is a millisecond wall-clock, so two bumps in
// the same ms would share it. Seed an old stamp so the later bump is a
// guaranteed orphan regardless of timer granularity (production orphans the
// same way — this only removes test flakiness, not coverage).
store.set('tl_refs_ver_' + tlDb, '1');
const tlFirst = ctx.tlCachedMap_(tlDb, 'tl_qty_map_' + tlDb, () => { builds++; return JSON.parse(JSON.stringify(bigMap)); });
assert.strictEqual(builds, 1, 'first read builds');
assert.strictEqual(
  JSON.stringify(ctx.tlCachedMap_(tlDb, 'tl_qty_map_' + tlDb, () => { builds++; return {}; }).qty),
  JSON.stringify(bigMap.qty), 'second read is served from chunks, not rebuilt');
assert.strictEqual(builds, 1, 'builder ran exactly once across two reads');
assert.strictEqual(lastPutAllTtl, tlTtl, 'map TTL preserved at ' + tlTtl + 's (was 600)');

// mutation -> invalidation -> refreshed read
bigMap.qty['منتج-40'] = 40;
ctx.bustTopLightCaches_(tlDb);
const tlRefreshed = ctx.tlCachedMap_(tlDb, 'tl_qty_map_' + tlDb, () => { builds++; return JSON.parse(JSON.stringify(bigMap)); });
assert.strictEqual(builds, 2, 'stamp bump orphaned the old namespace, forcing exactly one rebuild');
assert.strictEqual(tlRefreshed.qty['منتج-40'], 40, 'refreshed read sees post-mutation data');

// a legacy plain single-key entry under the same logical key is never misread
store.set('tl_dashboard_kpis_' + tlDb, JSON.stringify({ stale: true }));
const dash = ctx.cachedMap_('tl_dashboard_kpis_' + tlDb, 60, () => ({ fresh: true }));
assert.strictEqual(dash.fresh, true, 'legacy plain entries are ignored (miss + rebuild), never merged');
assert.strictEqual(lastPutAllTtl, 60, 'dashboard TTL preserved at 60s');
// and bust drops the chunk namespace for that family too
ctx.bustTopLightCaches_(tlDb);
assert.strictEqual(ctx.getChunkedCache_('tl_dashboard_kpis_' + tlDb), null,
  'bust removes chunk manifests/data, not just plain keys');

// ── OPT-2: employeeRefs_ freshness ────────────────────────────────────────
const tcSource = fs.readFileSync(path.join(__dirname, '..', '..', 'Company_TopChemical_Actions.js'), 'utf8');
const empSheet = (tcSource.match(/const EMPLOYEE_SHEET\s*=\s*'([^']+)'/) || [])[1];
assert.strictEqual(empSheet, 'employee_info', 'employeeRefs_ still reads the employee sheet');
ctx.EMPLOYEE_SHEET = empSheet;
let empReads = 0;
let empRows = [{ emp_id: 7, name_ar: 'سارة' }, { emp_id: 3, name_ar: 'كريم' }];
ctx.getAllRecords_ = () => { empReads++; return empRows.map(r => Object.assign({}, r)); };
const empStart = tcSource.indexOf('  function employeeRefs_(');
const empEnd = tcSource.indexOf('\n  function ', empStart + 10);
vm.runInContext(tcSource.slice(empStart, empEnd), ctx, { filename: 'Company_TopChemical_Actions.js (employee slice)' });
assert.strictEqual(ctx.employeeRefs_('db-tc-1').map[7], 'سارة');
empRows[0].name_ar = 'سلمى';
empRows.push({ emp_id: 9, name_ar: 'منى' });
const fresh = ctx.employeeRefs_('db-tc-1');
assert.strictEqual(empReads, 2, 'employeeRefs_ reads fresh after an external change');
assert.strictEqual(fresh.map[7], 'سلمى');
assert.strictEqual(fresh.map[9], 'منى');
assert.strictEqual(JSON.stringify(fresh.options.map(o => o.value).sort()), JSON.stringify([3, 7, 9]));
assert.ok(tcSource.slice(empStart, empEnd).indexOf('tcRefs_(') === -1, 'employeeRefs_ does not use the cached accessor');

console.log('optimization_chunk_cache: PASS');
