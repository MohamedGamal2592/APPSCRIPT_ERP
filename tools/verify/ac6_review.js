/**
 * ac6_review.js — get_ac_results/get_ac_result/add_ac_candidate_grade, and
 * Company_Assessment_Results.html / Company_Assessment_ResultView.html.
 *
 *   node tools/verify/ac6_review.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootPage, flush } = require('./pageharness');
const S = require('../lib/sources');

const ROOT = path.resolve(__dirname, '..', '..');
const helper = fs.readFileSync(path.join(ROOT, 'JS_Simplification_Helpers.js'), 'utf8');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + JSON.stringify(extra) : ''));
}

/* ── 1. Handlers, over a stubbed sheet (same shape as ac4/ac5) ────────────── */
function buildSandbox() {
  const src = fs.readFileSync(path.join(ROOT, 'Company_Assessment_Actions.js'), 'utf8');
  const store = {};
  function makeSheet(headers) {
    const rows = [];
    return {
      _headers: headers, _rows: rows,
      getLastRow: function () { return rows.length + 1; },
      getLastColumn: function () { return headers.length; },
      getRange: function (r) {
        return {
          getValues: function () { return [headers.slice()]; },
          setValues: function (matrix) { matrix.forEach(function (rv, i) { rows[(r - 2) + i] = rv.slice(); }); }
        };
      },
      getDataRange: function () { return { getValues: function () { return [headers.slice()].concat(rows.map(function (rr) { return rr.slice(); })); } }; },
      appendRow: function (values) { rows.push(values.slice()); }
    };
  }
  store['Assessments'] = makeSheet(['AssessmentID', 'Title', 'Category', 'Description', 'TimeLimitMinutes', 'PassScore', 'IsActive', 'UserID', 'CreatedAt', 'UpdatedAt']);
  store['Questions'] = makeSheet(['QuestionID', 'AssessmentID', 'OrderIndex', 'QuestionText', 'QuestionType', 'OptionsJSON', 'CorrectAnswer', 'Weight', 'Trait', 'UserID', 'CreatedAt']);
  store['AssessmentBatches'] = makeSheet(['BatchID', 'Token', 'CompanyName', 'AssessmentID', 'AssessmentTitle', 'MaxCandidates', 'UsedSlots', 'AssignedBy', 'CreatedAt', 'ExpiresAt', 'IsActive']);
  store['Assignments'] = makeSheet(['AssignmentID', 'BatchID', 'Token', 'CandidateEmail', 'AssessmentID', 'Status', 'StartedAt', 'CompletedAt', 'CreatedAt']);
  store['Responses'] = makeSheet(['ResponseID', 'AssignmentID', 'QuestionID', 'Answer', 'Score', 'AnsweredAt', 'EmailCandidate', 'CreatedAt']);
  store['AuditLog'] = makeSheet(['Timestamp', 'ActorEmail', 'Action', 'Details']);

  store['Assessments'].appendRow(['AID1', 'Mixed', 'Technical', '', 20, 50, true, 'u', '2026-09-01 10:00:00', '2026-09-01 10:00:00']);
  store['Questions'].appendRow(['q1', 'AID1', 1, 'MCQ Q', 'MCQ', '["A","B"]', 'A', 10, '', 'u', '2026-09-01 10:00:00']);
  store['Questions'].appendRow(['q2', 'AID1', 2, 'Open Q', 'OpenText', '[]', '', 8, '', 'u', '2026-09-01 10:00:00']);
  store['AssessmentBatches'].appendRow(['B1', 'tok'.padEnd(72, '0'), 'Acme', 'AID1', 'Mixed', 5, 1, 'u', '2026-09-01 10:00:00', '2099-01-01 00:00:00', true]);
  store['Assignments'].appendRow(['AS1', 'B1', 'tok'.padEnd(72, '0'), 'c@example.com', 'AID1', 'Completed', '2026-09-02 09:00:00', '2026-09-02 09:10:00', '2026-09-02 09:00:00']);
  store['Responses'].appendRow(['R1', 'AS1', 'q1', 'A', 10, '2026-09-02 09:05:00', 'c@example.com', '2026-09-02 09:05:00']);
  store['Responses'].appendRow(['R2', 'AS1', 'q2', 'my open answer', '', '2026-09-02 09:08:00', 'c@example.com', '2026-09-02 09:08:00']);

  function getSheet_(sheetName) { if (!store[sheetName]) throw new Error('no stub sheet: ' + sheetName); return store[sheetName]; }
  function getHeaders_(sheet) { return sheet._headers.slice(); }
  function noteMutation_() {}
  function executeWithLock_(fn) { return fn(); }
  function updateRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject) {
    const headers = getHeaders_(sheet);
    const data = sheet.getDataRange().getValues();
    const critIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase(); });
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) {
        const newRow = data[i].map(function (v, colIdx) {
          const header = headers[colIdx];
          const uk = Object.keys(updatesObject).find(function (k) { return k.trim().toLowerCase() === String(header).trim().toLowerCase(); });
          return uk !== undefined ? updatesObject[uk] : v;
        });
        sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
        return true;
      }
    }
    return false;
  }
  function buildRecords_(data, hdrs) {
    const keys = hdrs.map(function (h) { return String(h).trim(); });
    const out = [];
    for (let i = 1; i < data.length; i++) { const row = data[i]; const rec = {}; for (let c = 0; c < keys.length; c++) rec[keys[c]] = row[c] !== undefined ? row[c] : ''; out.push(rec); }
    return out;
  }
  function getAllRecords_(dbId, sheetName) { const s = getSheet_(sheetName); return buildRecords_(s.getDataRange().getValues(), getHeaders_(s)); }
  function getRecordsByPk_(dbId, sheetName, pkColumn) {
    const rows = getAllRecords_(dbId, sheetName);
    const pkLc = String(pkColumn || 'id').toLowerCase();
    const hdrs = getHeaders_(getSheet_(sheetName)).map(function (h) { return String(h).trim(); });
    let pkHeader = null; hdrs.forEach(function (h) { if (h.toLowerCase() === pkLc) pkHeader = h; });
    const byPk = new Map();
    rows.forEach(function (r) { const raw = pkHeader !== null ? r[pkHeader] : r[pkLc]; const pk = String(raw == null ? '' : raw).trim(); if (pk) { byPk.set(pk, r); byPk.set(pk.toLowerCase(), r); } });
    return { rows: rows, byPk: byPk, headers: hdrs, pkHeader: pkHeader || pkColumn };
  }
  function logHistory_() {}
  const sandbox = { getSheet_, getHeaders_, appendRowWithRetry_: function (s, v) { s.appendRow(v); }, noteMutation_, executeWithLock_, updateRowByCriteria_, getAllRecords_, getRecordsByPk_, logHistory_ };
  vm.createContext(sandbox);
  vm.runInContext(helper, sandbox, { filename: 'JS_Simplification_Helpers.js' });
  vm.runInContext(src, sandbox, { filename: 'Company_Assessment_Actions.js' });
  const AC = vm.runInContext('AssessmentCenter', sandbox);
  return { AC: AC, store: store };
}

function testHandlers() {
  console.log('get_ac_results / get_ac_result / add_ac_candidate_grade\n');
  const built = buildSandbox();
  const AC = built.AC, store = built.store;
  const SUPER = { isSuperAdmin: true, email: 'admin@example.com' };
  function call(action, data) { return AC.dispatch_({ module_action: action, data: data }, SUPER, 'DB1'); }

  const listRes = call('get_ac_results', {});
  ok(listRes.status === 'success' && listRes.rows.length === 1, 'get_ac_results returns one summary row for the one Completed assignment');
  const row = listRes.rows[0];
  ok(row.Verdict === 'Pending', 'summary verdict is Pending — the OpenText item is still ungraded, matching acScore_ exactly');
  ok(row.Score === 10 && row.Max === 10, 'summary score/max reflect only the MCQ item so far (10/10), matching acScore_ item by item', row);

  const detail = call('get_ac_result', { id: 'AS1' });
  ok(detail.status === 'success' && detail.answers.length === 2, 'get_ac_result returns both answers');
  const mcqAnswer = detail.answers.filter(function (a) { return a.QuestionID === 'q1'; })[0];
  const openAnswer = detail.answers.filter(function (a) { return a.QuestionID === 'q2'; })[0];
  ok(mcqAnswer.Score === 10 && mcqAnswer.Max === 10, 'the MCQ item detail matches the summary (10/10)');
  ok(openAnswer.Pending === true && openAnswer.Score === null, 'the ungraded OpenText item is flagged Pending with no score yet');

  /* Grading: clamps to [0, Weight]. */
  const gradeRes = call('add_ac_candidate_grade', { assignment_id: 'AS1', grades: [{ response_id: 'R2', score: 999 }] });
  ok(gradeRes.status === 'success', 'grading succeeds');
  const respHeaders = store['Responses']._headers;
  const r2 = store['Responses']._rows.filter(function (r) { return r[respHeaders.indexOf('ResponseID')] === 'R2'; })[0];
  ok(r2[respHeaders.indexOf('Score')] === 8, 'a grade of 999 against Weight=8 is clamped to 8 — never trusts the client', r2);

  const assignHeaders = store['Assignments']._headers;
  const assignRow = store['Assignments']._rows[0];
  ok(assignRow[assignHeaders.indexOf('Status')] === 'Reviewed',
    'Status flips to Reviewed once nothing is left pending (the OpenText item is now graded)');
  ok(gradeRes.verdict === 'Pass', '18/18 = 100% >= PassScore 50 -> Pass, returned in the same response');

  /* A grade of a negative number clamps to 0. */
  store['Assignments']._rows[0][assignHeaders.indexOf('Status')] = 'Completed'; // reset for the next assertion
  const gradeRes2 = call('add_ac_candidate_grade', { assignment_id: 'AS1', grades: [{ response_id: 'R2', score: -5 }] });
  ok(gradeRes2.status === 'success', 'grading with a negative score still succeeds');
  const r2b = store['Responses']._rows.filter(function (r) { return r[respHeaders.indexOf('ResponseID')] === 'R2'; })[0];
  ok(r2b[respHeaders.indexOf('Score')] === 0, 'a negative grade clamps to 0, not stored negative');
}

/* ── 2. Results page — group-by renders subtotal rows ─────────────────────── */
async function testResultsGrouping() {
  console.log('\nCompany_Assessment_Results.html — group-by subtotal rows (§5.5)\n');
  const rows = [
    { AssignmentID: 'a1', CompanyName: 'Acme', AssessmentTitle: 'T1', CandidateEmail: 'x@example.com', StartedAt: '2026-09-01', Status: 'Completed', Score: 8, Max: 10, Verdict: 'Pass' },
    { AssignmentID: 'a2', CompanyName: 'Acme', AssessmentTitle: 'T1', CandidateEmail: 'y@example.com', StartedAt: '2026-09-01', Status: 'Completed', Score: 4, Max: 10, Verdict: 'Fail' },
    { AssignmentID: 'a3', CompanyName: 'Beta', AssessmentTitle: 'T2', CandidateEmail: 'z@example.com', StartedAt: '2026-09-01', Status: 'Reviewed', Score: 9, Max: 10, Verdict: 'Pass' }
  ];
  const sb = bootPage({
    page: 'Company_Assessment_Results.html',
    containers: ['ac-root'],
    isSuperAdmin: true,
    call: function (action) { if (action === 'get_ac_results') return { status: 'success', rows: rows }; return { status: 'success' }; }
  });
  sb.renderApp();
  await flush(); await flush();

  /* dtGroupBy's actual row/DOM update goes through the real chunked renderer
     (setTimeout + tbody.appendChild of nodes built from an intermediate
     element's innerHTML) — domstub queues timers rather than firing them,
     and does not implement .firstChild, so that specific append-loop cannot
     be observed by re-reading .innerHTML strings the way the FIRST render
     can (pageharness's dataTable override stitches that one synchronously).
     Testing dtGroupBy's own row-building function directly is the reliable
     way to prove grouping works, and it's the same function the real
     chunked renderer calls. */
  sb.UIC.dtGroupBy('ac-results-table', 'CompanyName');
  const st = (sb.window.__dtStore || {})['ac-results-table'];
  ok(!!st && st.groupKey === 'CompanyName', 'dtGroupBy records CompanyName as the active group key on the table\'s state');

  const acmeRows = st.filtered.filter(function (r) { return r.CompanyName === 'Acme'; });
  const groupHtml = sb.UIC._dtGroupRowHtml(st, 'Acme', 'Acme', acmeRows);
  ok(/class="dt-group"/.test(groupHtml), 'the group-header row carries the dt-group class');
  ok(groupHtml.indexOf('Acme') !== -1, 'the group label ("Acme") appears in its own header row');
  ok(new RegExp('dt-group-count">' + acmeRows.length + '<').test(groupHtml),
    'the header row shows the correct member count for that group (' + acmeRows.length + ')', groupHtml);

  ok(st.sortKey === 'CompanyName' && st.sortDir === 'asc',
    'picking a group also sorts by it, so the group\'s rows stay contiguous (documented dtGroupBy behaviour)');
}

/* ── 3. ResultView — lazy chart, print break-inside ────────────────────────── */
function testResultViewSource() {
  console.log('\nCompany_Assessment_ResultView.html — lazy chart, print rules\n');
  const src = S.read('Company_Assessment_ResultView.html');
  ok(!/<script[^>]+src=[^>]*chart/i.test(src), 'no blocking <script src=...chart...> tag in the template');
  ok(/API\.ensureChart\(\)/.test(src), 'the chart is requested lazily via API.ensureChart()');
  ok(/break-inside:\s*avoid/.test(src), 'print CSS marks answer cards break-inside: avoid');
  ok(/UIC\.statusbar\(/.test(src), 'the statusbar component is used for the assignment stage');
  ok(/UIC\.smartButtons\(/.test(src), 'smartButtons links to the batch and the assessment');
  ok(/UIC\.notebook\(/.test(src), 'the three review tabs use the shared notebook component');
}

(async function () {
  testHandlers();
  await testResultsGrouping();
  testResultViewSource();

  console.log('');
  if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
  console.log('ac6_review: all assertions pass.');
})();

