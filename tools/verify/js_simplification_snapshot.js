/** Phase 4 bounded read-only snapshot differential check. */
'use strict';
const { createHarness } = require('./gasstub.js');
let failed = 0;
function ok(value, message) { console.log((value ? '  PASS  ' : '  FAIL  ') + message); if (!value) failed++; }
const H = createHarness({ now: 1700000000000 });
const headers = ['id', 'name', 'when'];
const rows = [headers, ['1', 'عميل', new Date(2026, 8, 11)], ['', '', ''], ['2', 'wide-value', '']];
let reads = 0;
const sheet = {
  getDataRange: function () { reads++; return { getValues: function () { return rows.map(function (r) { return r.slice(); }); } }; },
  getLastRow: function () { return rows.length; }, getLastColumn: function () { return headers.length; }
};
H.ctx.getSheet_ = function () { return sheet; };
H.ctx.getHeaders_ = function () { return headers.slice(); };
H.newExecution();
const first = H.call('getReadOnlyRecords_', 'DB1', 'T');
const second = H.call('getReadOnlyRecords_', 'DB1', 'T');
ok(first === second, 'repeated audited reads reuse one owned row snapshot');
ok(reads === 1, 'the snapshot path pays one source read for repeated access');
ok(first.length === 2 && first[0].name === 'عميل' && first[0].when instanceof Date, 'blank rows are filtered and Date values retain their type');
H.newExecution();
const third = H.call('getReadOnlyRecords_', 'DB1', 'T');
ok(third !== first && reads === 2, 'resetRecordCache_ clears the snapshot between executions');
ok(H.eval("typeof READ_ONLY_SNAPSHOT_MAX_BYTES_ === 'number'"), 'the snapshot has an explicit estimated-byte budget');
ok(H.eval("typeof READ_ONLY_SNAPSHOT_MAX_ROWS_ === 'number'"), 'the snapshot has an explicit retained-row budget');
console.log('\n' + (failed ? failed + ' snapshot check(s) FAILED.' : 'bounded snapshot checks pass.') + '\n');
process.exit(failed ? 1 : 0);

