/**
 * RT0 — the perf instrumentation is one round trip, and inert when it is off.
 *
 * The plan's Phase 0 opens a five-day measurement window on production by
 * setting one script property. That window is only worth opening if two things
 * are true of the code that fills it:
 *
 *   1. It costs NOTHING while the property is unset. The property is the
 *      owner's to set and has never been set; until it is, this code must not
 *      make a request, mark a timestamp, or register a listener.
 *   2. It costs ONE request per navigation when it is set. The previous
 *      PERF.send fired a google.script.run per metric. At the four to six
 *      metrics a navigation now produces, across a live multi-tenant system,
 *      the measurement would have become a real share of the load it exists to
 *      measure — and the resulting numbers would have been wrong because of it.
 *
 * There is no layout engine and no event loop in this harness, so nothing here
 * can prove a mark fired at the right moment. What it proves is the shape: the
 * four stages exist, they are queued rather than sent, exactly one send call
 * exists, and every entry point is behind the enabled() gate.
 *
 * Run: node tools/verify/rt0_perf_marks.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HELPERS = fs.readFileSync(path.join(ROOT, 'Client_Helpers.html'), 'utf8');
const CODE = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
}

const helpers = stripComments(HELPERS);
const code = stripComments(CODE);

/* ── 1. The four-part navigation timeline exists ─────────────────────────── */

const STAGES = [
  ['nav_server', /responseStart\s*,\s*e\.requestStart|e\.responseStart[\s\S]{0,40}e\.requestStart/],
  ['nav_transfer', /e\.responseEnd[\s\S]{0,40}e\.responseStart/],
  ['nav_parse', /domContentLoadedEventEnd[\s\S]{0,40}e\.responseEnd/]
];
STAGES.forEach(function (s) {
  check(helpers.indexOf("'" + s[0] + "'") !== -1 && s[1].test(helpers),
    s[0] + ' is derived from the navigation entry, not invented');
});
check(/PERF\.mark\s*=/.test(helpers),
  'PERF.mark still exists for the metrics a page reports itself');
/* Phase 0 described first_data_render as "already exists; keep it". PERF.mark
 * existed; nothing had ever called it with that metric, so the number had never
 * once been produced. It is now marked where the last chunk of a table body
 * lands, which is what first meaningful paint means on a list page. */
const UICSRC = stripComments(fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8'));
check(/PERF\.mark\('first_data_render'\)/.test(UICSRC),
  'first_data_render is actually marked — by the table renderer, not by nobody');
check(/_renderChunked[\s\S]*?PERF\.mark\('first_data_render'\)/.test(UICSRC),
  'it is marked when the body finishes rendering, not when the render starts');
check(helpers.indexOf('transferSize') !== -1 && helpers.indexOf('decodedBodySize') !== -1,
  'transferSize and decodedBodySize are reported, so the gzip ratio is measured');

/* ── 2. One round trip per navigation ────────────────────────────────────── */

const sends = (helpers.match(/google\.script\.run/g) || []).length;
const perfSends = helpers.split('PERF.flush = function')[1] || '';
check(/PERF\.flush\s*=\s*function/.test(helpers),
  'there is a single flush that ships the queue');
check(/PERF\.push\s*=\s*function/.test(helpers) && !/PERF\.push[\s\S]{0,400}google\.script\.run/.test(helpers),
  'PERF.push queues and never sends on its own');
check((perfSends.split('google.script.run').length - 1) === 1,
  'PERF.flush makes exactly one google.script.run call');
check(/marks\s*:\s*marks/.test(helpers),
  'the queued marks travel together in one payload');
check(/PERF\.send\s*=\s*function[\s\S]{0,120}PERF\.push/.test(helpers),
  'the old PERF.send is kept as a queueing shim, so outside callers are batched too');

/* A flush that only ever runs on a debounce loses the last marks of every page
 * view, because this app navigates by replacing the document. */
check(/pagehide/.test(helpers) && /visibilitychange/.test(helpers),
  'the queue is flushed on the way out, not only on a timer');

/* ── 3. Inert when the window is closed ──────────────────────────────────── */

const entries = ['PERF.push', 'PERF.flush', 'PERF.mark', 'PERF.navTimeline'];
const ungated = entries.filter(function (name) {
  const at = helpers.indexOf(name + ' = function');
  if (at === -1) return true;
  const body = helpers.slice(at, at + 400);
  return !/PERF\.enabled\(\)/.test(body);
});
check(ungated.length === 0,
  'every PERF entry point returns early unless PERF.enabled()',
  ungated.map(function (n) { return '        ' + n + ' does not check PERF.enabled()'; }).join('\n'));

check(/if\s*\(PERF\.enabled\(\)\)\s*\{/.test(helpers),
  'the listeners are registered only inside the enabled() gate');
check(/PERF\.enabled\s*=\s*function\s*\(\)\s*\{\s*return\s+window\.PERF_LOG\s*===\s*true;/.test(helpers),
  'enabled() is strict — an undefined PERF_LOG is off, not truthy-off');

/* ── 4. The server accepts the batch without changing the sheet ──────────── */

const fn = code.slice(code.indexOf('function logClientPerf_'));
const body = fn.slice(0, fn.indexOf('\nfunction '));
check(/payload\.marks/.test(body), 'logClientPerf_ accepts a batch of marks');
check(/payload\.metric/.test(body),
  'it still accepts the single-metric shape a page cached before this deploy will send');
check(/setValues\(/.test(body) && !/marks[\s\S]{0,200}appendRow\(/.test(body),
  'the batch is written with one setValues, not one appendRow per mark');
check(/perfLogReadsEnabled_\(\)/.test(body) && body.indexOf('perfLogReadsEnabled_') < body.indexOf('getSpreadsheet_'),
  'the property is checked before the spreadsheet is even opened');
check(/slice\(0,\s*20\)/.test(body),
  'a runaway client cannot turn one request into an unbounded number of rows');

/* Constraint: ERP_Client_Perf already exists in production and its columns are
 * not this run's to change. */
const header = /appendRow\(\[([^\]]*)\]\)/.exec(body);
check(!!header && header[1].replace(/\s|'/g, '') === 'ts,page,metric,ms,url,user_email',
  'ERP_Client_Perf keeps exactly the six columns it has today',
  header ? '        found: ' + header[1] : '        no header row found');
check(/rows\.length,\s*6\)/.test(body),
  'the batch write is six columns wide — the same six');

console.log('\n' + (failed === 0
  ? 'RT0 — one round trip per navigation, and nothing at all when the window is closed.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
