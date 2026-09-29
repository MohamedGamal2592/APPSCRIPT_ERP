/**
 * Phase 6 — bounded operational scripts and SQL access-path review.
 *
 * This is a source-only acceptance check. It never loads credentials, makes a
 * network request, opens JDBC, or invokes an operational script.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
}
function read(name) { return fs.readFileSync(path.join(ROOT, name), 'utf8'); }

console.log('\n1 — operational scripts remain bounded and dry-run by default\n');
const copy = read('copy_sheet_to_firestore.mjs');
check(/process\.argv\.includes\('--write'\)/.test(copy), 'copy script requires explicit --write');
check(/Dry run only\. No Firestore data was written\./.test(copy), 'copy script reports its dry-run state');
check(/start \+= 500/.test(copy), 'copy writes in Firestore batches of at most 500');
check(/row_\$\{String\(rowIndex \+ 2\)\.padStart\(6, '0'\)\}/.test(copy), 'copy preserves deterministic source-row document identity');
check(/writeCount \+= writes\.length/.test(copy) && /Uploaded \$\{writeCount\}/.test(copy), 'copy reports write counters from actual committed writes');

const fix = read('fix_firestore_date_types.mjs');
check(/flags\.has\('--write'\)/.test(fix), 'date fixer requires explicit --write');
check(/Dry run only\. No Firestore data was changed\./.test(fix), 'date fixer reports its dry-run state');
check(/startIndexArg/.test(fix) && /batchSizeArg/.test(fix), 'date fixer supports bounded resume and batch controls');
check(/fixes\.slice\(start, start \+ batchSize\)/.test(fix), 'date fixer commits only the requested batch');
check(/updateMask: \{ fieldPaths:/.test(fix), 'date fixer limits updates to the converted fields');

const history = read('analyze_erp_record_history.mjs');
check(/spreadsheets\.readonly/.test(history) && !/datastore/.test(history), 'history analysis requests spreadsheet read-only scope');
check(!/:batchUpdate|:append|:clear|:delete|values:batchUpdate/.test(history), 'history analysis contains no spreadsheet write endpoint');

console.log('\n2 — Box SQL access path remains bounded, parameterized, and DDL-free\n');
const connector = read('DbLive_Connector.js');
const connectorCode = connector.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
check(!/\b(CREATE\s+(TABLE|INDEX|VIEW|TRIGGER)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX|VIEW|COLUMN))\b/i.test(connectorCode), 'connector has no schema-changing SQL');
const boxStart = connector.indexOf('function dbBoxList_');
const boxEnd = connector.indexOf('function dbBoxAccountAggregates_');
const box = connector.slice(boxStart, boxEnd);
check(boxStart >= 0 && boxEnd > boxStart, 'dbBoxList_ access path is present');
check(/Math\.min\(Math\.max\(Number\(data\.limit\) \|\| 50, 1\), 200\)/.test(box), 'dbBoxList_ clamps page size to 200');
check(/LIMIT ' \+ limit/.test(box) && /OFFSET ' \+ offset/.test(box), 'dbBoxList_ emits bounded LIMIT/OFFSET');
check(/prepareStatement\(/.test(box) && /dbBindParams_\(countStmt, where\.params\)/.test(box) && /dbBindParams_\(stmt, where\.params\)/.test(box), 'dbBoxList_ binds filter values through JDBC parameters');
check(/COUNT\(\*\)/.test(box) && /SELECT/.test(box), 'dbBoxList_ keeps count and page reads on the same predicate builder');

console.log('\n3 — deployment source inventory\n');
const clasp = JSON.parse(read('.clasp.json'));
const order = clasp.filePushOrder || [];
check(order.indexOf('Company_ValleyFoods_Actions.js') >= 0 &&
      order.indexOf('Company_ValleyFoods_HR_Modules.js') > order.indexOf('Company_ValleyFoods_Actions.js'),
  'explicit push order loads Valley main actions before HR modules');
check(order.indexOf('03_Security.js') >= 0 && order.indexOf('Theme_Builders.js') > order.indexOf('03_Security.js'),
  'explicit push order includes extracted theme builders after security');
check(order.indexOf('Code_Telemetry.js') >= 0 && order.indexOf('Code.js') > order.indexOf('Code_Telemetry.js'),
  'explicit push order includes telemetry before the router');
check(!fs.existsSync(path.join(ROOT, 'DbLive_Routes.js')), 'empty duplicate DbLive_Routes.js is removed');

console.log('\n' + (failed === 0
  ? 'Phase 6 operational and SQL checks pass.'
  : failed + ' Phase 6 check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);

