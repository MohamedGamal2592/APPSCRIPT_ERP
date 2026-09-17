/**
 * S2 verification (U-45) — work-centre costs reach the client.
 *
 * Extracts the real row projection out of getValleyMfgWorkOps_ in
 * Company_ValleyFoods_Actions.js and runs it over fixture sheet rows, then
 * checks the print template actually consumes the two fields.
 *
 * Run: node tools/verify/s2_workops_cost.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const VIEW = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_MfgOrderView.html'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

/* Lift the projection object literal out of the real source. Scope to the
   function first — several other endpoints have a `rows.push({ unique_id: ... })`
   of their own and an unanchored match picks up the byproducts one. */
const fnStart = SRC.indexOf('function getValleyMfgWorkOps_');
if (fnStart === -1) { console.log('  FAIL  getValleyMfgWorkOps_ not found'); process.exit(1); }
const FN = SRC.slice(fnStart, SRC.indexOf('function saveValleyMfgWorkOp_', fnStart));
const m = FN.match(/rows\.push\(\{\s*\n\s*unique_id: r\.unique_id,[\s\S]*?\n(\s*)\}\);/);
if (!m) { console.log('  FAIL  could not locate the work-ops row projection'); process.exit(1); }
const literal = m[0].replace(/^rows\.push\(/, '').replace(/\);$/, '');
const project = vm.runInNewContext('(function (r) { return ' + literal + '; })');

console.log('S2 — the projection now carries the two cost fields\n');

const rowGood = {
  /* The work centre's key is in the `recipe_id` COLUMN — a legacy misnomer; the
     AppSheet schema declares it a Ref to valley_work_centers. This fixture row is
     shaped like the sheet, so it deliberately carries NO work_center_id. */
  unique_id: 'WC-1', work_center_sequence: 1, recipe_id: 'WCX',
  operation_status: 'Done', start_time: '2026-09-01T08:00:00Z', end_time: '2026-09-01T12:00:00Z',
  actual_hours: 4, work_center_cost: 37.5, total_cost: 150,
  last_pause_time: '', total_pause_duration: 0, notes: 'n'
};
const out = project(rowGood);
check('work_center_cost' in out, 'work_center_cost present in the projection');
check('total_cost' in out, 'total_cost present in the projection');
check(out.work_center_cost === 37.5, 'work_center_cost carries the sheet value (37.5)');
check(out.total_cost === 150, 'total_cost carries the sheet value (150)');

console.log('\nS2 — degenerate sheet values do not print NaN\n');
[
  ['#N/A (deleted work centre)', '#N/A', 0],
  ['empty cell', '', 0],
  ['undefined', undefined, 0],
  ['numeric string', '12.5', 12.5],
  ['genuine zero', 0, 0]
].forEach(c => {
  const r = Object.assign({}, rowGood, { work_center_cost: c[1], total_cost: c[1] });
  const o = project(r);
  const ok = o.work_center_cost === c[2] && o.total_cost === c[2];
  check(ok, c[0] + ' -> ' + c[2], 'got ' + o.work_center_cost);
  /* And the print formatter must render a figure, never NaN. */
  const printed = Number(o.work_center_cost || 0).toFixed(3);
  check(printed !== 'NaN', '  fmt3 renders ' + printed);
});

console.log('\nS2 — before the change, the print rendered 0.000\n');
const before = Object.assign({}, out);
delete before.work_center_cost; delete before.total_cost;
check(Number(before.work_center_cost || 0).toFixed(3) === '0.000',
  'omitted field -> fmt3(undefined) -> 0.000 (the bug)');
check(Number(out.work_center_cost || 0).toFixed(3) === '37.500',
  'present field -> fmt3(37.5) -> 37.500 (the fix)');

console.log('\nS2 — the work centre survives the round trip (the recipe_id column)\n');
/* The bug: the projection read r.work_center_id, a column that does not exist on
   valley_manufacture_work_center. It always yielded '', so reopening a saved
   order showed an empty work-centre picker, and the next save wrote that blank
   back over the key the previous save had stored correctly. */
check(out.work_center_id === 'WCX',
  'a sheet row whose recipe_id is a work-centre uid projects work_center_id = WCX',
  'got ' + JSON.stringify(out.work_center_id));
check(project({ recipe_id: '' }).work_center_id === '',
  'a genuinely empty cell still projects an empty string, not undefined');
check(project({ work_center_id: 'WRONG' }).work_center_id === '',
  'and a stray work_center_id key is NOT read — that column does not exist');

/* The MO save writes it into the right column, and so must the standalone add. */
check(/m\['recipe_id'\] = wcId;/.test(SRC),
  'the MO save writes the work-centre uid into recipe_id');
check(/map\['recipe_id'\] = String\(d\.work_center_id\)/.test(SRC),
  'and so does saveValleyMfgWorkOp_');
check(SRC.indexOf("map['work_center_id']") === -1,
  'nothing writes a work_center_id column on that table any more');

/* The edit path on vf_mfg_orders sends no work_center_id; requiring one there
   refused every manual start/end time save. */
check(/if \(!String\(d\.workop_uid \|\| ''\)\.trim\(\) && !d\.work_center_id\)/.test(SRC),
  'the work centre is required when ADDING an operation, not when editing one');

console.log('\nS2 — the print template consumes both fields\n');
check(VIEW.indexOf('fmt3(wop.work_center_cost)') !== -1, 'print reads wop.work_center_cost');
check(VIEW.indexOf('fmt3(wop.total_cost)') !== -1, 'print reads wop.total_cost');
check(VIEW.indexOf('<th>تكلفة المركز</th><th>الإجمالي</th>') !== -1,
  'print header already has both columns');

console.log('\n' + (failed === 0
  ? 'S2 OK — work_center_cost and total_cost now reach the client.'
  : 'S2 FAILED: ' + failed));
process.exit(failed === 0 ? 0 : 1);

