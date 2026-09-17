/** Phase 2 differential check for the Top Light action-definition pilot. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_TopLight_Actions.js'), 'utf8');
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'toplight_action_metadata_baseline.json'), 'utf8'));
let failed = 0;
function ok(value, message) { console.log((value ? '  PASS  ' : '  FAIL  ') + message); if (!value) failed++; }
const re = /^    '([^']+)': \{ handler: ([A-Za-z0-9_]+), page: '([^']*)', access: '([^']*)', primaryLogTable: ([A-Z][A-Z0-9_]*|'') \},?$/gm;
const got = {};
let m;
while ((m = re.exec(source))) got[m[1]] = { action: m[1], handler: m[2], page: m[3] || null, access: m[4] || null, primaryLogTable: m[5] === "''" ? null : m[5] };
ok(Object.keys(got).length === expected.length, 'one definition exists for every registered Top Light action (' + Object.keys(got).length + '/' + expected.length + ')');
expected.forEach(function (want) {
  const have = got[want.action];
  ok(!!have, want.action + ' is represented');
  if (!have) return;
  ['handler', 'page', 'access', 'primaryLogTable'].forEach(function (key) {
    ok(have[key] === want[key], want.action + '.' + key + ' preserves the baseline contract', JSON.stringify(have[key]) + ' vs ' + JSON.stringify(want[key]));
  });
});
ok(/const PAGE_ACCESS = \{\};[\s\S]*const ACTION_TABLES = \{\};/.test(source), 'compatibility maps are derived, not separately authored');
ok(/Object\.keys\(ACTION_DEFINITIONS\)\.forEach/.test(source), 'derived maps iterate the single action-definition object');
console.log('\n' + (failed ? failed + ' metadata check(s) FAILED.' : 'Top Light metadata differential passes.') + '\n');
process.exit(failed ? 1 : 0);
