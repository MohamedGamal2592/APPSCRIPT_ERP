/**
 * RT10 — telemetry that costs nothing and records nobody.
 *
 * Two failure modes, both of which have to be designed out rather than watched
 * for, because both are invisible once they are shipped:
 *
 *   TELEMETRY THAT COSTS MORE THAN WHAT IT MEASURES. PERF_LOG_READS appends a
 *   SystemLog row per request — a WRITE ON EVERY READ — which is exactly why
 *   PERF_BASELINE.md calls it an instrument that has to be switched off again.
 *   A request here must cost ZERO sheet writes, or nobody will leave it on, and
 *   a monitor nobody leaves on is not a monitor.
 *
 *   A PERF LOG THAT QUIETLY BECOMES A PER-PERSON ACTIVITY RECORD. Nine columns
 *   of numbers is a monitoring tool. The same nine plus an email, or a record
 *   id, or a payload, is a surveillance log that nobody decided to build.
 *   SystemLog keeps the audit story; this sheet is what got slower.
 *
 * So this file asserts on the VALUES WRITTEN, not just on the column list. A
 * header row saying `user_hash` proves nothing about what is put in it.
 *
 * Run: node tools/verify/rt10_telemetry.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const CODE = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
const TELEMETRY = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
const SOURCES = CODE + '\n' + TELEMETRY;

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

function mask(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
}
const code = mask(SOURCES);

function fnBody(name) {
  const at = code.indexOf('function ' + name);
  if (at === -1) return '';
  let d = 0;
  for (let i = code.indexOf('{', at); i < code.length; i++) {
    if (code[i] === '{') d++;
    else if (code[i] === '}') { d--; if (d === 0) return SOURCES.slice(at, i + 1); }
  }
  return '';
}

/* ── 1. Zero sheet writes on the request path ────────────────────────────── */

const record = fnBody('perfRecord_');
check(!!record, 'perfRecord_ exists');
check(/CacheService\.getScriptCache\(\)/.test(record),
  'a logged request pays one cache write');
check(!/getSpreadsheet_|appendRow|setValues|insertSheet/.test(record),
  'and ZERO sheet writes — no spreadsheet is even opened on the request path',
  '        ' + (record.match(/getSpreadsheet_|appendRow|setValues|insertSheet/g) || []).join(', '));

const fromRouter = fnBody('perfRecordRequest_');
check(!!fromRouter, 'apiRouter_ records through perfRecordRequest_');
check(!/getSpreadsheet_|appendRow|setValues/.test(fromRouter),
  'which also touches no sheet');
check(/try \{[\s\S]*catch \(e\) \{/.test(fromRouter),
  'and is wrapped whole — a telemetry path that can throw is one that can fail a save');
check(/perfRecordRequest_\(request, authUser, status, startTime\)/.test(code),
  'it runs on the success path');
check((code.match(/perfRecordRequest_\(request, authUser, status, startTime\)/g) || []).length >= 2,
  'and on the failure path, so a slow error is not invisible');

/* ── 2. Nine columns, and nothing that identifies a person ───────────────── */

const headers = /var PERF_LOG_HEADERS_ = \[([\s\S]*?)\]/.exec(SOURCES);
check(!!headers, 'ERP_Perf_Log declares its columns');
const cols = headers ? headers[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean) : [];
check(JSON.stringify(cols) === JSON.stringify(
  ['ts', 'action', 'company', 'page', 'elapsed_ms', 'sheet_reads', 'status', 'user_hash', 'client_ms']),
  'exactly the nine columns the plan names, and no tenth',
  '        ' + cols.join(', '));

/* The values, which is the part a header list cannot tell you about. */
const pushed = /buf\.push\(\[([\s\S]*?)\]\);/.exec(record);
check(!!pushed, 'and the values it writes are visible in one place');
const rowSrc = pushed ? pushed[1] : '';
check(!/user_email\b(?!\s*\))/.test(rowSrc.replace(/perfUserHash_\(entry\.user_email\)/, '')),
  'no email reaches the row — the user column is perfUserHash_(email) and nothing else');
check(/perfUserHash_\(entry\.user_email\)/.test(rowSrc),
  'the user column is a hash');
check(!/record_?id|recordID|payload|changedfields|result\.data|JSON\.stringify\(/i.test(rowSrc),
  'no record id, no payload, no field values',
  '        ' + rowSrc.replace(/\s+/g, ' ').slice(0, 200));
/* Top-level commas only: slice(0, 80) has a comma inside it. */
function topLevelCount(src) {
  let d = 0, n = 1, any = false;
  for (const ch of src) {
    if ('([{'.indexOf(ch) !== -1) d++;
    else if (')]}'.indexOf(ch) !== -1) d--;
    else if (ch === ',' && d === 0) n++;
    if (!/\s/.test(ch)) any = true;
  }
  return any ? n : 0;
}
check(topLevelCount(rowSrc) === 9,
  'nine values for nine columns',
  '        counted ' + topLevelCount(rowSrc));

const hash = fnBody('perfUserHash_');
check(/PERF_HASH_SALT/.test(hash), 'the hash is salted from a script property');
check(!/return e;|return email/.test(hash), 'and never returns the email it was given');

/* ── 3. Sampling, built in rather than retrofitted ───────────────────────── */

const sample = fnBody('perfShouldSample_');
check(/isWrite\) return true/.test(sample), '100% of writes are recorded');
check(/SLOW_MS\) return true/.test(sample), '100% of anything slow');
check(/Math\.random\(\) < PERF_TELEMETRY_\.READ_SAMPLE/.test(sample),
  'and a configurable fraction of fast reads');
check(/READ_SAMPLE:\s*0\.10/.test(SOURCES), 'the default read sample is 10%');
check(/PERF_TELEMETRY_ = \{/.test(SOURCES),
  'every tunable is in one CONFIG block rather than buried in a function');

/* The sampling actually behaves. Run the real function. */
{
  const box = { Math: Math, PERF_TELEMETRY_: null };
  vm.createContext(box);
  vm.runInContext(
    /var PERF_TELEMETRY_ = \{[\s\S]*?\};/.exec(SOURCES)[0] + '\n' + fnBody('perfShouldSample_'), box);
  const alwaysWrite = [];
  for (let i = 0; i < 200; i++) alwaysWrite.push(vm.runInContext('perfShouldSample_(true, 5)', box));
  check(alwaysWrite.every(Boolean), 'every write is sampled, 200 times out of 200');
  const slow = vm.runInContext('perfShouldSample_(false, 5000)', box);
  check(slow === true, 'a 5-second read is always sampled');
  let hits = 0;
  for (let i = 0; i < 4000; i++) if (vm.runInContext('perfShouldSample_(false, 10)', box)) hits++;
  const rate = hits / 4000;
  check(rate > 0.06 && rate < 0.15,
    'and fast reads land near the configured 10% (' + (rate * 100).toFixed(1) + '%)');
}

/* ── 4. The drain, the rollup, and retention ─────────────────────────────── */

const drain = fnBody('drainPerfBuffer_');
check(/setValues\(rows\)/.test(drain), 'the drain writes a whole minute in one setValues');
check(/back <= 10/.test(drain),
  'and catches up on minutes a missed trigger left behind rather than dropping them');
check(drain.indexOf('cache.remove(key)') < drain.indexOf('setValues'),
  'it removes each minute BEFORE writing it: a duplicated telemetry row skews the percentiles silently, which is worse than losing one');
check(/for \(var back = 1;/.test(drain),
  'the CURRENT minute is left alone, so the drain never races requests still writing into it');

const rollup = fnBody('rollupPerfWeekly_');
check(/perfPercentile_\(g\.ms, 50\)/.test(rollup) && /perfPercentile_\(g\.ms, 90\)/.test(rollup) &&
      /perfPercentile_\(g\.ms, 99\)/.test(rollup),
  'the weekly rollup computes p50, p90 and p99');
check(/clearContent\(\)/.test(rollup),
  'and rewrites the week rather than appending — two rows for one week would be a bug in the only table anybody reads');

/* Percentiles, against a fixture. */
{
  const box = {};
  vm.createContext(box);
  vm.runInContext(fnBody('perfPercentile_'), box);
  const p = (arr, q) => { box.__a = arr; box.__q = q; return vm.runInContext('perfPercentile_(__a, __q)', box); };
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  check(p(ten, 50) === 5, 'p50 of 1..10 is 5 (nearest-rank)');
  check(p(ten, 90) === 9, 'p90 of 1..10 is 9');
  check(p(ten, 100) === 10, 'p100 is the maximum, not an overflow');
  check(p([], 50) === 0, 'and an empty set is 0, not NaN');
}

const prune = fnBody('prunePerfLog_');
check(/RETAIN_DAYS/.test(prune) && /deleteRows\(2, keepFrom\)/.test(prune),
  'raw rows are pruned after the retention window, from the top, in one block');
check(/RETAIN_DAYS:\s*90/.test(SOURCES), 'the window is 90 days');
check(!/PERF_WEEKLY_SHEET_/.test(prune),
  'and the weekly rollup is never pruned — it is tiny and it is the point');

/* ── 5. Failure is always "log nothing" ──────────────────────────────────── */

check(/catch \(eRead\) \{ buf = \[\]; \}/.test(record),
  'a throwing cache read degrades to an empty buffer');
check(/catch \(e\) \{\s*\/\* Telemetry must never be the reason a request fails\. \*\/\s*\}/.test(SOURCES) ||
      /catch \(e\) \{[\s\S]{0,120}never be the reason/.test(record),
  'and any other failure means log nothing, never fail the request');
check(/MAX_PER_MINUTE/.test(record),
  'one runaway minute cannot fill the buffer without bound');

/* ── 6. Wiring: the sheets, the triggers, the page ───────────────────────── */

check(/ERP_Perf_Log/.test(SOURCES) && /ERP_Perf_Weekly/.test(SOURCES),
  'both sheets are named');
check(/ss\.insertSheet\(name\)/.test(fnBody('ensurePerfSheet_')),
  'and created on first use — new, additive, and droppable without consequence');
check(!/ERP_Record_History|SystemLog/.test(fnBody('ensurePerfSheet_')),
  'nothing here touches an existing sheet');

const triggers = fnBody('installTriggers_');
check(/newTrigger\('drainPerfBuffer_'\)[\s\S]{0,80}everyMinutes\(1\)/.test(triggers),
  'the one-minute drain is registered in installTriggers_');
check(/newTrigger\('rollupPerfWeekly_'\)/.test(triggers) && /newTrigger\('prunePerfLog_'\)/.test(triggers),
  'so are the rollup and the pruning');
check(/deleteTrigger\(t\)/.test(triggers) && /drainPerfBuffer_/.test(triggers.slice(0, triggers.indexOf('newTrigger(\'drainPerfBuffer_\''))),
  'and a second install cannot double them up');

const dash = fnBody('getPerfDashboard_');
check(/user\.isSuperAdmin/.test(dash),
  'the dashboard handler checks isSuperAdmin itself, rather than trusting the page not to be opened');
check(fs.existsSync(path.join(ROOT, 'ERP_Perf_Dashboard.html')),
  'and the page exists');
check(/perf_dashboard/.test(fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8')),
  'registered like any other page');

console.log('\n' + (failed === 0
  ? 'RT10 — one cache write per request, nine columns of numbers, nobody named.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);



