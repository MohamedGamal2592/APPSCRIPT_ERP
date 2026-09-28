'use strict';
/* MFG-WORKOP-CONFLICTS — offline proof for the per-work-centre scheduling rule.

   Extracts the REAL conflict helpers out of Company_ValleyFoods_Actions.js and
   runs them over fixture work-op rows, then asserts both write paths (the MO
   save and control_valley_mfg_workop) call them.

   Proves: the rule is scoped to ONE work centre (different centres may share a
   frame), active elsewhere blocks a start even without a time overlap, a Pending
   reservation still blocks its frame, touching endpoints are not an overlap, and
   excluded rows/MOs are ignored.

   Run: node tools/verify/mfg_workop_conflicts.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

let failed = 0;
function check(ok, label) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}

const start = SRC.indexOf('function mfgConflictDate_(');
const end = SRC.indexOf('function controlValleyMfgWorkOp_(', start);
if (start === -1 || end === -1 || end <= start) {
  console.log('  FAIL  mfg conflict helpers not found in Company_ValleyFoods_Actions.js');
  process.exit(1);
}
const block = SRC.slice(start, end);

const SHEETS = {
  'valley_work_centers': [
    { unique_id: 'WC-1', code: 'MIX', name_ar: 'الخلاط' },
    { unique_id: 'WC-2', code: 'OVN', name_ar: 'الفرن' }
  ],
  'valley_manufacture_header': [
    { unique_id: 'MO-A', transaction_code: 'MO-A-CODE' },
    { unique_id: 'MO-B', transaction_code: 'MO-B-CODE' }
  ],
  'valley_manufacture_work_center': []
};

const sandbox = {
  console, Date, Number, String, Object, Array, isNaN,
  WC_SHEET: 'valley_work_centers',
  MFG_WORKOPS_SHEET: 'valley_manufacture_work_center',
  MFG_ORDER_SHEET: 'valley_manufacture_header',
  getAllRecords_: function (_dbId, sheet) { return SHEETS[sheet] || []; }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(block + '\n__h = { mfgConflictDate_: mfgConflictDate_, mfgIntervalsOverlap_: mfgIntervalsOverlap_, mfgWorkOpConflict_: mfgWorkOpConflict_, mfgWorkOpConflictMessage_: mfgWorkOpConflictMessage_ };', sandbox, { filename: 'mfg_conflict_helpers.js' });
const H = sandbox.__h;

function at(hhmm) { return new Date('2026-09-01T' + hhmm + ':00'); }
function op(uid, wcId, status, from, to, moUid) {
  return {
    unique_id: uid, recipe_id: wcId, operation_status: status,
    start_time: from ? at(from) : '', end_time: to ? at(to) : '',
    valley_manufacture_header_id: moUid || 'MO-A'
  };
}
function seed(rows) { SHEETS['valley_manufacture_work_center'] = rows; }

console.log('\n-- interval semantics');
check(H.mfgIntervalsOverlap_(at('10:00'), at('11:00'), at('11:00'), at('12:00')) === false,
  'touching endpoints are NOT an overlap');
check(H.mfgIntervalsOverlap_(at('10:00'), at('12:00'), at('11:00'), at('11:30')) === true,
  'a genuine overlap is an overlap');
check(H.mfgIntervalsOverlap_(null, at('12:00'), at('11:00'), at('13:00')) === true,
  'a missing start is open-ended');

console.log('\n-- per work centre, not per time slot');
seed([op('OP-1', 'WC-1', 'In Progress', '10:00', '12:00', 'MO-A')]);
check(H.mfgWorkOpConflict_('db', 'WC-1', at('10:00'), at('12:00'), [], '') !== null,
  'the same work centre conflicts');
check(H.mfgWorkOpConflict_('db', 'WC-2', at('10:00'), at('12:00'), [], '') === null,
  'a DIFFERENT work centre may run in the same frame');

console.log('\n-- active + overlap detection and messages');
let c = H.mfgWorkOpConflict_('db', 'WC-1', at('13:00'), at('14:00'), [], '');
check(c && c.active && !c.overlap, 'active elsewhere is reported even without a time overlap');
let msg = H.mfgWorkOpConflictMessage_('db', 'WC-1', c);
check(msg.indexOf('الخلاط') !== -1 && msg.indexOf('MO-A-CODE') !== -1 && msg.indexOf('قيد التشغيل') !== -1,
  'the active refusal names the work centre and the other MO code');

seed([op('OP-2', 'WC-1', 'Pending', '10:00', '12:00', 'MO-B')]);
c = H.mfgWorkOpConflict_('db', 'WC-1', at('11:00'), at('13:00'), [], '');
check(c && !c.active && c.overlap, 'a Pending reservation still blocks an overlapping frame');
check(H.mfgWorkOpConflict_('db', 'WC-1', at('12:00'), at('13:00'), [], '') === null,
  'starting exactly when the reservation ends is allowed');
msg = H.mfgWorkOpConflictMessage_('db', 'WC-1', c);
check(msg.indexOf('MO-B-CODE') !== -1 && msg.indexOf('محجوز') !== -1,
  'the overlap refusal names the other MO');

console.log('\n-- exclusions');
check(H.mfgWorkOpConflict_('db', 'WC-1', at('11:00'), at('13:00'), ['OP-2'], '') === null,
  'the row being edited is excluded by uid');
check(H.mfgWorkOpConflict_('db', 'WC-1', at('11:00'), at('13:00'), [], 'MO-B') === null,
  'the MO being replaced is excluded entirely');

console.log('\n-- both write paths enforce the rule');
const controlFn = SRC.slice(SRC.indexOf('function controlValleyMfgWorkOp_('), SRC.indexOf('function getValleyWorkCenters_'));
check(/mfgWorkOpConflict_\(dbId, wcId, effStart, effEnd/.test(controlFn),
  'control handler guards start/status/stop with the conflict helper');
const saveStart = SRC.indexOf('function saveValleyMfgOrder_(');
const planned = SRC.indexOf('function saveValleyMfgOrderPlanned_(', saveStart);
const saveFn = SRC.slice(saveStart, planned > saveStart ? planned : saveStart + 200000);
check(saveFn.indexOf('mfgWorkOpConflict_') !== -1,
  'the MO save validates work ops before any business write');

if (failed) { console.log('\nmfg_workop_conflicts: FAIL (' + failed + ' check(s))'); process.exit(1); }
console.log('\nmfg_workop_conflicts: OK');
