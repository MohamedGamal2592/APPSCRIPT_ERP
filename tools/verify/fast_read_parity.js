'use strict';

/**
 * TR: Core_FastRead.js decoupling gate + parity guard (plan §3.1 rule 2, §5.7).
 *
 * WHAT THIS PROVES
 *   1. The generic-core rule holds as a static fact: this file contains zero
 *      business tokens, zero Arabic characters and zero whole-sheet range
 *      access, and it never writes.
 *   2. The duplicated contracts it shares with the write-side engine are equal
 *      executably — header lookup, key normalisation, key composition, the
 *      sheet epoch and the two caps — because decision D1 keeps the engines
 *      independent instead of sharing code.
 *   3. The guard is not a rubber stamp: a deliberately diverged sibling is
 *      detected.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createVfHarness } = require('./vf_action_harness');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'Core_FastRead.js'), 'utf8');

/* ── 1. static decoupling gate ───────────────────────────────────────────── */
const TOKENS = ['valley_', '\\bmfg\\b', 'manufactur', 'purchas', 'sales_', 'invoice', 'recipe'];
TOKENS.forEach(function (token) {
  const re = new RegExp(token, 'gi');
  const hits = SOURCE.match(re) || [];
  assert.strictEqual(hits.length, 0, 'decoupling gate: "' + token + '" must have zero hits, found ' + hits.length);
});

const arabic = SOURCE.match(/[\u0600-\u06FF]/g) || [];
assert.strictEqual(arabic.length, 0, 'decoupling gate: no Arabic characters, found ' + arabic.length);

assert.strictEqual(SOURCE.indexOf('getData' + 'Range'), -1, 'decoupling gate: no whole-sheet range access');

['appendRow(', 'deleteRow', 'setValue(', 'setValues(', 'batchUpdate('].forEach(function (needle) {
  const hits = SOURCE.split(needle).length - 1;
  assert.strictEqual(hits, 0,
    'read engine must not write: "' + needle + '" found ' + hits + ' time(s)');
});

assert.ok(/var FAST_READ_CORE_ = false;/.test(SOURCE), 'FAST_READ_CORE_ ships false');

/* ── 2. parity guard runs green against the real write engine ────────────── */
const H = createVfHarness();
/* Give the guard the engine's own source so its bound-read check executes
 * instead of skipping (Apps Script cannot read source; a harness can). */
H.ctx.Core_FastRead_source_ = function () { return SOURCE; };

const guard = H.ctx.frParityGuard_();
assert.strictEqual(guard.siblingEnginePresent, true, 'the write engine is loaded in the same context');
guard.checks.forEach(function (c) {
  assert.ok(c.ok, 'parity check failed: ' + c.name + (c.detail ? ' (' + c.detail + ')' : ''));
});
assert.ok(guard.checks.length >= 7, 'every duplicated contract has a check (got ' + guard.checks.length + ')');
assert.ok(guard.checks.some((c) => c.name.indexOf('bound-read') !== -1), 'the bound-read rule is checked');

/* ── 3. the guard catches a divergence ("test the test") ─────────────────── */
{
  const H2 = createVfHarness();
  H2.ctx.Core_FastRead_source_ = function () { return SOURCE; };
  /* A sibling whose header matcher is case-SENSITIVE (a plausible drift). */
  H2.ctx.fsHeaderIndex_ = function (headers, name) {
    var want = String(name == null ? '' : name).trim();
    if (!want) return -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === want) return i;
    }
    return -1;
  };
  const diverged = H2.ctx.frParityGuard_();
  assert.strictEqual(diverged.ok, false, 'a diverged sibling contract is detected');
  const failed = diverged.checks.filter((c) => !c.ok).map((c) => c.name);
  assert.deepStrictEqual(Array.from(failed), ['header index parity'], 'the failing check is named');
}

/* ── 4. evidence-before-enablement is not circular ───────────────────────── */
{
  const H3 = createVfHarness();
  H3.addSheet('probe', ['id', 'label'], [[1, 'a']]);
  assert.strictEqual(H3.eval('FAST_READ_CORE_'), false, 'the master flag is off');
  const rows = H3.ctx.fastFetchList_({
    dbId: H3.dbId, sheetName: 'probe', strategy: 'APPEND_WINDOW', limit: 1,
    columns: ['id', 'label'], headers: ['id', 'label'], ctx: H3.ctx.frNewContext_()
  });
  assert.strictEqual(rows.rows.length, 1,
    'the primitive still runs with the master flag off, so a shadow comparison can gather evidence first');
  assert.strictEqual(H3.ctx.fastReadOnFor_(true), false, 'but a module cannot serve from it until the master flag is on');
  assert.strictEqual(H3.ctx.fastReadOnFor_(false), false);
}

console.log('fast_read_parity: PASS');
