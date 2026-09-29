'use strict';

/**
 * TR: module opt-in flags must be reachable from every IIFE that reads them.
 *
 * WHY THIS TEST EXISTS
 * The write-side programme declared its four opt-in switches as `const` inside
 * the ValleyFoods IIFE while referencing them from the sibling
 * ValleyFoodsHRModules IIFE, where they are out of scope. Every handler that
 * reached one of those lines threw `ReferenceError: … is not defined` before
 * doing anything — including `save_valley_return`. `node --check` cannot see
 * scope, so the defect shipped in the repository. This guard makes that class of
 * mistake impossible to repeat silently:
 *
 *   1. static: every `*_BATCH_WRITES_` / `*_FAST_READ_` identifier the file
 *      references is declared at FILE TOP LEVEL with `var`;
 *   2. VM: each name resolves to a boolean from the global scope, and from a
 *      function defined in another IIFE — which is exactly the reference shape
 *      that used to break;
 *   3. VM: dispatching representative write handlers does not produce a
 *      ReferenceError (validation errors are fine and expected — the point is
 *      that the flag lookup itself succeeds).
 *
 * The VM writes go to the in-process fake workbook, never to a spreadsheet.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createVfHarness } = require('./vf_action_harness');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'Company_ValleyFoods_Actions.js'), 'utf8');
const FLAG_RE = /\b([A-Z][A-Z0-9_]*_(?:BATCH_WRITES_|FAST_READ_))\b/g;

const referenced = {};
let m;
while ((m = FLAG_RE.exec(SOURCE)) !== null) referenced[m[1]] = true;
const names = Object.keys(referenced).sort();

assert.ok(names.length >= 2, 'the file references its module flags (found: ' + names.join(',') + ')');

/* ── 1. each flag is declared at file top level with var ─────────────────── */
names.forEach(function (name) {
  const topLevelVar = new RegExp('^var ' + name + ' = ', 'm');
  assert.ok(topLevelVar.test(SOURCE), name + ' must be declared at file top level with `var`');
  const iifeConst = new RegExp('^\\s+const ' + name + ' = ', 'm');
  assert.ok(!iifeConst.test(SOURCE), name + ' must not be an IIFE-scoped const (invisible to sibling IIFEs)');
});

/* ── 2. the names resolve where the handlers live ────────────────────────── */
const H = createVfHarness();
names.forEach(function (name) {
  const value = H.eval('typeof ' + name);
  assert.strictEqual(value, 'boolean', name + ' resolves to a boolean from the global scope (got ' + value + ')');
});
/* A function declared inside the ValleyFoods IIFE can see them; so can one in
 * ValleyFoodsHRModules. Reach inside by calling the real dispatcher, which is
 * defined in ValleyFoods and evaluated in its scope. */
assert.strictEqual(H.eval('(function(){ return ValleyFoods.pageForAction_("/dev/null"); })()'), '',
  'a function in the ValleyFoods scope evaluates without a scope error');

/* ── 3. representative write handlers survive the flag lookup ────────────── */
const probes = [
  { action: 'save_valley_return', payload: {} },
  { action: 'save_valley_invoice', payload: {} },
  { action: 'save_valley_mfg_order', payload: {} }
];
probes.forEach(function (p) {
  H.newExecution();
  let error = null;
  try { H.dispatch(p.action, p.payload); } catch (e) { error = e; }
  assert.ok(error, p.action + ': a refusal is expected (empty payload)');
  assert.ok(!/is not defined/.test(String(error.message)),
    p.action + ' must not fail on an unresolved flag: ' + error.message);
  assert.strictEqual(error.name, 'Error', p.action + ': the refusal is a validation error, not a ReferenceError');
});

/* ── 4. the read flag is the same shape ─────────────────────────────────── */
assert.strictEqual(H.eval('SALES_FAST_READ_'), false, 'the read flag ships false');
assert.strictEqual(H.eval('typeof fastReadOnFor_'), 'function', 'the engine gate is reachable from the module');

console.log('module_flag_scope: PASS');
