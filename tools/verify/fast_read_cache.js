'use strict';

/**
 * TR: Core_FastRead small-payload cache — the publication contract, extended to
 * the fr1_ namespace.
 *
 * WHAT THIS PROVES (plan §5.4, §5.5; the existing chunk-cache suite's patterns
 * — interleaving, invalidation during build, shrink, integrity, partial
 * eviction — applied to the read engine's keys and to its identity/stamp guard)
 *   - publish then hit; the manifest carries generation, chunk count, bytes,
 *     payload hash, identity fingerprint and stamp signature;
 *   - every hit verifies identity AND stamp: a changed document, a changed
 *     stamp, a missing stamp and a payload-version change are all MISSES;
 *   - unknown/missing stamp ⇒ miss (never a stale hit);
 *   - no cache read in an execution that has written;
 *   - >5 chunks is refused as `refused-size`, not truncated;
 *   - a reader cannot observe a torn payload while a writer publishes
 *     (interleaving), and a late publication after an invalidation is rejected;
 *   - publishing a SMALLER payload leaves no stale trailing chunks;
 *   - partial eviction and corrupted chunk text are misses, never truncated
 *     values;
 *   - `frCachedRead_` falls back to building the value whenever caching refuses,
 *     so a cache problem is never a user-visible failure.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

const H = createVfHarness();
const FR = H.grab([
  'frNewContext_', 'frCacheLogicalKey_', 'frCacheGet_', 'frCachePut_', 'frCacheDrop_',
  'frCacheDiagnostics_', 'frCachedRead_', 'frStampSig_', 'chunkedCacheKeys_'
]);
/* Physical keys are built by the SHARED helper (sanitize + digest + generation),
 * so the test resolves them the same way the engine does rather than assuming a
 * string concatenation. */
function phys(logicalKey, generation) {
  const k = generation === undefined ? FR.chunkedCacheKeys_(logicalKey) : FR.chunkedCacheKeys_(logicalKey, generation);
  return k;
}
const TABLES = ['cache_fixture_a', 'cache_fixture_b'];
const scope = 'cache-scope';

H.addSheet('cache_fixture_a', ['id', 'label'], [[1, 'a'], [2, 'b']]);
H.addSheet('cache_fixture_b', ['id', 'label'], [[1, 'c']]);

function stampBoth() {
  return { sig: 'a=100&b=200', missing: [], stamps: { cache_fixture_a: '100', cache_fixture_b: '200' } };
}
function stampChanged() {
  return { sig: 'a=101&b=200', missing: [], stamps: { cache_fixture_a: '101', cache_fixture_b: '200' } };
}
function stampMissing() {
  return { sig: '', missing: ['cache_fixture_b'], stamps: { cache_fixture_a: '100' } };
}

const KEY = FR.frCacheLogicalKey_(scope, 'doc', 'DOC-1', 1);
assert.ok(/^fr1_[0-9a-f]{40}$/.test(KEY), 'the logical key is fr1_ + a 160-bit hex digest: ' + KEY);
assert.notStrictEqual(KEY, FR.frCacheLogicalKey_(scope, 'doc', 'DOC-2', 1), 'different documents have different keys');
assert.notStrictEqual(KEY, FR.frCacheLogicalKey_(scope, 'doc', 'DOC-1', 2), 'a payload version change changes the key');
assert.strictEqual(KEY, FR.frCacheLogicalKey_(scope, 'doc', 'DOC-1', 1), 'the key is stable');

const ctx = FR.frNewContext_();
const payload = { rows: [{ id: 1, label: 'x' }, { id: 2, label: 'y' }], total: 2 };

/* ── 1. publish then hit ─────────────────────────────────────────────────── */
assert.strictEqual(FR.frCachePut_(KEY, payload, {
  ctx, identity: 'ident-1', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
}), 'hit', 'publication succeeds when both stamp reads agree');

const hit = FR.frCacheGet_(KEY, { ctx, identity: 'ident-1', stampSig: stampBoth(), payloadVersion: 1 });
assert.strictEqual(hit.outcome, 'hit', 'a matching read hits');
assert.strictEqual(JSON.stringify(hit.value), JSON.stringify(payload), 'and returns the published value');

const diag = FR.frCacheDiagnostics_(KEY);
assert.strictEqual(diag.present, true);
assert.strictEqual(diag.chunkCount, 1);
assert.strictEqual(diag.hasIdentity, true);
assert.strictEqual(diag.hasStamp, true);
assert.ok(diag.bytes > 0 && diag.generation, 'the manifest reports bytes and a generation');
assert.ok(H.cacheKeys().indexOf(phys(KEY).manifest) !== -1, 'the manifest lives at the shared builder\'s manifest key');
assert.ok(H.cacheKeys().some((k) => k.indexOf(phys(KEY, diag.generation).prefix) === 0),
  'chunks live under the shared builder\'s generation-specific prefix');

/* ── 2. every hit verifies identity and stamp ───────────────────────────── */
assert.strictEqual(FR.frCacheGet_(KEY, { ctx, identity: 'ident-OTHER', stampSig: stampBoth(), payloadVersion: 1 }).outcome, 'miss',
  'a different identity is a miss');
assert.strictEqual(FR.frCacheGet_(KEY, { ctx, identity: 'ident-1', stampSig: stampChanged(), payloadVersion: 1 }).outcome, 'miss',
  'a changed stamp is a miss');
assert.strictEqual(FR.frCacheGet_(KEY, { ctx, identity: 'ident-1', stampSig: stampMissing(), payloadVersion: 1 }).outcome,
  'refused-unknown-stamp', 'a missing stamp is a miss with the documented outcome');
assert.strictEqual(FR.frCacheGet_(KEY, { ctx, identity: 'ident-1', stampSig: { sig: '', missing: [], stamps: {} }, payloadVersion: 1 }).outcome,
  'refused-unknown-stamp', 'an empty signature is a miss');
assert.strictEqual(FR.frCacheGet_(KEY, { ctx, identity: 'ident-1', stampSig: stampBoth(), payloadVersion: 2 }).outcome, 'miss',
  'a payload version bump is a miss');

/* ── 3. a write in the execution blocks cache reads and writes ───────────── */
{
  const dirty = FR.frNewContext_({ hasWritten: true });
  assert.strictEqual(FR.frCacheGet_(KEY, { ctx: dirty, identity: 'ident-1', stampSig: stampBoth(), payloadVersion: 1 }).outcome,
    'refused-after-write', 'no cache read in an execution that has written');
  assert.strictEqual(FR.frCachePut_(KEY, { other: true }, {
    ctx: dirty, identity: 'ident-1', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
  }), 'refused-after-write', 'and no publication either');
}

/* ── 4. publication refuses what it cannot validate or fit ──────────────── */
assert.strictEqual(FR.frCachePut_('fr1_probe', { v: 1 }, {
  ctx: FR.frNewContext_(), identity: 'i', stampSigBefore: stampBoth(), stampSigAfter: stampChanged(), ttlSeconds: 600
}), 'refused-unknown-stamp', 'a stamp that changed during the build is not published');
assert.strictEqual(FR.frCachePut_('fr1_probe', { v: 1 }, {
  ctx: FR.frNewContext_(), identity: 'i', stampSigBefore: stampMissing(), stampSigAfter: stampMissing(), ttlSeconds: 600
}), 'refused-unknown-stamp', 'an unknown stamp is not published');
{
  const huge = { text: 'x'.repeat(500000) };
  assert.strictEqual(FR.frCachePut_('fr1_huge', huge, {
    ctx: FR.frNewContext_(), identity: 'i', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
  }), 'refused-size', 'a payload over the chunk ceiling is refused, not truncated');
  assert.strictEqual(H.cacheKeys().filter((k) => k.indexOf(phys('fr1_huge').base) === 0).length, 0,
    'and nothing is left behind under that key');
}

/* ── 5. shrink leaves no stale trailing chunks ──────────────────────────── */
{
  const big = { rows: [] };
  for (let i = 0; i < 400; i++) big.rows.push('row-' + i + ':' + 'x'.repeat(250));   /* ~100 KB > one chunk */
  const key2 = FR.frCacheLogicalKey_(scope, 'shrink', 'D', 1);
  assert.strictEqual(FR.frCachePut_(key2, big, {
    ctx: FR.frNewContext_(), identity: 'i2', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
  }), 'hit');
  const bigManifest = FR.frCacheDiagnostics_(key2);
  assert.ok(bigManifest.chunkCount >= 2, 'the big payload spans several chunks (' + bigManifest.chunkCount + ')');
  const oldPrefix = phys(key2, bigManifest.generation).prefix;
  const oldChunks = H.cacheKeys().filter((k) => k.indexOf(oldPrefix) === 0).length;

  assert.strictEqual(FR.frCachePut_(key2, { small: true }, {
    ctx: FR.frNewContext_(), identity: 'i2', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
  }), 'hit', 'a smaller payload republishes');
  const small = FR.frCacheGet_(key2, { ctx: FR.frNewContext_(), identity: 'i2', stampSig: stampBoth(), payloadVersion: 1 });
  assert.strictEqual(small.outcome, 'hit', 'and reads back');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(small.value)), { small: true }, 'with exactly the new value');
  const newPrefix = phys(key2, FR.frCacheDiagnostics_(key2).generation).prefix;
  assert.notStrictEqual(newPrefix, oldPrefix, 'a fresh generation was minted');
  assert.strictEqual(H.cacheKeys().filter((k) => k.indexOf(oldPrefix) === 0).length, 0,
    'the previous generation was removed after publication (' + oldChunks + ' chunks before)');
  assert.strictEqual(H.cacheKeys().filter((k) => k.indexOf(newPrefix) === 0).length, 1,
    'and the new generation holds exactly the one chunk');
}

/* ── 6. interleaving: a reader cannot combine generations ───────────────── */
{
  const key3 = FR.frCacheLogicalKey_(scope, 'race', 'D', 1);
  const oldValue = { version: 'old', rows: [1, 2, 3] };
  const newValue = { version: 'new', rows: [9] };
  assert.strictEqual(FR.frCachePut_(key3, oldValue, {
    ctx: FR.frNewContext_(), identity: 'i3', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
  }), 'hit');
  const oldDiag = FR.frCacheDiagnostics_(key3);

  const cache = H.ctx.CacheService.getScriptCache();
  const realGetAll = cache.getAll;
  let interleaved = false;
  cache.getAll = function (keys) {
    if (!interleaved && keys && keys.length && String(keys[0]).indexOf(oldDiag.generation) !== -1) {
      interleaved = true;
      FR.frCachePut_(key3, newValue, {
        ctx: FR.frNewContext_(), identity: 'i3', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
      });
    }
    return realGetAll.call(cache, keys);
  };
  const during = FR.frCacheGet_(key3, { ctx: FR.frNewContext_(), identity: 'i3', stampSig: stampBoth(), payloadVersion: 1 });
  cache.getAll = realGetAll;
  assert.ok(during.outcome === 'miss' || JSON.stringify(during.value) === JSON.stringify(oldValue),
    'an interleaved read is either a miss or the complete old value, never a mix');
  const after = FR.frCacheGet_(key3, { ctx: FR.frNewContext_(), identity: 'i3', stampSig: stampBoth(), payloadVersion: 1 });
  assert.strictEqual(JSON.stringify(after.value), JSON.stringify(newValue), 'the later publication is complete');
}

/* ── 7. partial eviction and corrupted text are misses ──────────────────── */
{
  const key4 = FR.frCacheLogicalKey_(scope, 'integrity', 'D', 1);
  const value = { text: 'y'.repeat(200) };
  assert.strictEqual(FR.frCachePut_(key4, value, {
    ctx: FR.frNewContext_(), identity: 'i4', stampSigBefore: stampBoth(), stampSigAfter: stampBoth(), ttlSeconds: 600
  }), 'hit');
  const chunkKeys = H.cacheKeys().filter((k) => k.indexOf(phys(key4, FR.frCacheDiagnostics_(key4).generation).prefix) === 0);
  assert.ok(chunkKeys.length >= 1);
  const victim = chunkKeys[chunkKeys.length - 1];
  const saved = H.rawGet(victim);
  H.evict(victim);
  assert.strictEqual(FR.frCacheGet_(key4, { ctx: FR.frNewContext_(), identity: 'i4', stampSig: stampBoth(), payloadVersion: 1 }).outcome,
    'miss', 'a partially evicted entry is a miss');
  H.ctx.CacheService.getScriptCache().put(victim, saved + 'CORRUPT', 600);
  assert.strictEqual(FR.frCacheGet_(key4, { ctx: FR.frNewContext_(), identity: 'i4', stampSig: stampBoth(), payloadVersion: 1 }).outcome,
    'miss', 'corrupted chunk text fails the integrity check and is a miss');
}

/* ── 8. frCachedRead_: publishes only under a valid stamp, and always answers ─ */
{
  const H2 = createVfHarness();
  const FR2 = H2.grab(['frNewContext_', 'frCachedRead_', 'frCacheDiagnostics_', 'frCacheLogicalKey_']);
  H2.addSheet('cache_fixture_a', ['id', 'label'], [[1, 'a'], [2, 'b']]);
  let builds = 0;
  const spec = {
    dbId: H2.dbId, scopeId: H2.dbId, kind: 'doc', docKey: 'READ-1',
    tables: ['cache_fixture_a'], ttlSeconds: 60, cache: true,
    build: function () { builds++; return { n: builds }; }
  };

  /* 1. no stamp yet: the read answers, and refuses to publish. */
  const cold = FR2.frCachedRead_(Object.assign({}, spec, { ctx: FR2.frNewContext_() }));
  assert.strictEqual(builds, 1, 'the first read builds');
  assert.strictEqual(cold.cacheOutcome, 'refused-unknown-stamp', 'an unstamped table cannot be published');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cold.value)), { n: 1 });

  /* 2. stamp the table, read again: build, then publish. */
  H2.eval('noteTableChange_("' + H2.dbId + '", "cache_fixture_a");');
  const warm = FR2.frCachedRead_(Object.assign({}, spec, { ctx: FR2.frNewContext_() }));
  assert.strictEqual(builds, 2, 'a refused publication does not poison the next read');
  assert.strictEqual(warm.cacheOutcome, 'hit', 'with a stamp present the payload is published');

  /* 3. a third read is served from the cache: no rebuild. */
  const served = FR2.frCachedRead_(Object.assign({}, spec, { ctx: FR2.frNewContext_() }));
  assert.strictEqual(builds, 2, 'a hit does not rebuild');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(served.value)), { n: 2 }, 'and returns the published value');

  /* 4. a write stamps the table: the next read misses, rebuilds and republishes. */
  H2.eval('noteTableChange_("' + H2.dbId + '", "cache_fixture_a");');
  const afterWrite = FR2.frCachedRead_(Object.assign({}, spec, { ctx: FR2.frNewContext_() }));
  assert.strictEqual(builds, 3, 'a stamped change invalidates the entry');
  assert.strictEqual(afterWrite.cacheOutcome, 'hit', 'and the rebuild is published again');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(afterWrite.value)), { n: 3 });

  /* 5. an execution that has written neither reads nor writes the cache. */
  const dirty = FR2.frNewContext_({ hasWritten: true });
  const dirtyRead = FR2.frCachedRead_(Object.assign({}, spec, { ctx: dirty }));
  assert.strictEqual(dirtyRead.cacheOutcome, 'refused-after-write', 'the dirty-read window is honoured');
  assert.strictEqual(builds, 4, 'and it still answers by building');

  /* 6. caching off is off, and never touches the cache. */
  const off = FR2.frCachedRead_(Object.assign({}, spec, { cache: false, ctx: FR2.frNewContext_() }));
  assert.strictEqual(off.cacheOutcome, 'disabled');
  assert.ok(off.value, 'and still answers');

  /* 7. diagnostics inspect one key the caller supplies — and enumerate nothing. */
  const diag = FR2.frCacheDiagnostics_(FR2.frCacheLogicalKey_(H2.dbId, 'doc', 'READ-1', 1));
  assert.strictEqual(diag.present, true);
  assert.ok(diag.ageMs >= 0 && diag.chunkCount >= 1 && diag.generation, 'age, chunk count and generation are reported');
  assert.strictEqual(FR2.frCacheDiagnostics_('fr1_nothing_here').present, false, 'an unknown key reports absent');
}

console.log('fast_read_cache: PASS');
