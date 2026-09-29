/**
 * MO work-op pause — executable test for the actual_hours formula generator.
 *
 * WHAT THIS IS: it extracts the real `mfgColLetter_`, `mfgHeaderColLetter_` and
 * `mfgWorkCenterFormulaMap_` functions from the production source by brace
 * matching, evaluates them in a vm, and asserts the generated formula strings.
 * It executes the real functions, not a copy.
 *
 * WHAT IT IS NOT: it does not run the save. The dirty-row recalculation and the
 * pause/elapsed refusals are covered by source assertions plus the owner's
 * staging test; no VM harness exists for the MO save path.
 *
 * Run: node tools/verify/mo_workop_pause_formula.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'Company_ValleyFoods_Actions.js');
const source = fs.readFileSync(SRC, 'utf8');

/* Extract a top-level `function name(` ... matching `}` by brace counting. */
function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, 'function ' + name + ' not found in ' + path.basename(SRC));
  let depth = 0, i = src.indexOf('{', start);
  assert.ok(i !== -1, 'no body for ' + name);
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unbalanced braces extracting ' + name);
}

const ctx = { console };
vm.createContext(ctx);
['mfgColLetter_', 'mfgHeaderColLetter_', 'mfgWorkCenterFormulaMap_'].forEach(function (fn) {
  vm.runInContext(extractFunction(source, fn), ctx, { filename: 'extracted:' + fn });
});

/* ── 1. column letters ─────────────────────────────────────────────────────── */
assert.strictEqual(ctx.mfgColLetter_(0), 'A');
assert.strictEqual(ctx.mfgColLetter_(13), 'N', 'total_pause_duration is column N today');
assert.strictEqual(ctx.mfgColLetter_(25), 'Z');
assert.strictEqual(ctx.mfgColLetter_(26), 'AA', 'beyond Z must roll over, not break');

/* ── 2. the live work-op header row: pause term present, derived not hardcoded ─ */
const LIVE_HEADERS = ['unique_id','id','valley_manufacture_header_id','work_center_sequence',
  'recipe_id','operation_status','start_time','end_time','notes','actual_hours',
  'work_center_cost','total_cost','last_pause_time','total_pause_duration','user','created_at'];
const f = ctx.mfgWorkCenterFormulaMap_(7, LIVE_HEADERS);
assert.strictEqual(f.actual_hours, '=ROUND((H7-G7)*24-N(N7),2)',
  'actual_hours must subtract the pause cell and round to 2dp');
assert.ok(f.total_cost === '=K7*J7', 'total_cost still multiplies the new J');

/* ── 3. derivation, not position: the same header in a different slot ─────── */
const SHIFTED = LIVE_HEADERS.slice();
SHIFTED.splice(SHIFTED.indexOf('total_pause_duration'), 1);
SHIFTED.splice(12, 0, 'total_pause_duration');           // now column M (12)
assert.strictEqual(ctx.mfgWorkCenterFormulaMap_(3, SHIFTED).actual_hours, '=ROUND((H3-G3)*24-N(M3),2)',
  'the pause column letter must follow the header, not a hardcoded N');

/* ── 4. defensive: column absent -> previous behaviour, never a broken formula */
const NO_PAUSE = LIVE_HEADERS.filter(function (h) { return h !== 'total_pause_duration'; });
assert.strictEqual(ctx.mfgWorkCenterFormulaMap_(9, NO_PAUSE).actual_hours, '=ROUND((H9-G9)*24,2)',
  'a sheet without the pause column must degrade to the pause-free formula');

/* ── 5. header matching is trimmed and case-insensitive ───────────────────── */
assert.strictEqual(ctx.mfgHeaderColLetter_(['a',' TOTAL_PAUSE_DURATION '], 'total_pause_duration'), 'B');
assert.strictEqual(ctx.mfgHeaderColLetter_(LIVE_HEADERS, 'TOTAL_PAUSE_DURATION'), 'N');

/* ── 6. the refusals exist in the save paths (source-level) ───────────────── */
const save = source.slice(source.indexOf('function saveValleyMfgOrder_'));
assert.ok(/مدة التوقف \(.+?\) أكبر من زمن التشغيل/.test(save),
  'saveValleyMfgOrder_ must refuse pause greater than the worked span');
assert.ok(save.indexOf('wcDirty') !== -1, 'saveValleyMfgOrder_ must track dirty work-op rows');
assert.ok(/wcFormulaUids\.forEach/.test(save),
  'the formula reinstall must iterate the dirty set, not every kept row');

console.log('mo_workop_pause_formula: PASS');
console.log('  formula: ' + f.actual_hours);
console.log('  shifted-column derivation: ' + ctx.mfgWorkCenterFormulaMap_(3, SHIFTED).actual_hours);
console.log('  NOTE: generator tested executably; save-path refusals are source-asserted only');
