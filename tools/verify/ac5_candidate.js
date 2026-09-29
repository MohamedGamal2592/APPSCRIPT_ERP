/**
 * ac5_candidate.js — Company_Assessment_Take.html and the three PUBLIC
 * handlers (T-2, G-02, G-03, D-10).
 *
 *   node tools/verify/ac5_candidate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootPage, flush } = require('./pageharness');
const S = require('../lib/sources');

const ROOT = path.resolve(__dirname, '..', '..');
const helper = fs.readFileSync(path.join(ROOT, 'Company_Assessment_Actions.js'), 'utf8');
const PAGE = 'Company_Assessment_Take.html';

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + JSON.stringify(extra) : ''));
}

const XSS = '<img src=x onerror=alert(1)>';

/* ── 1. Source assertions — T-1/T-5/T-9 ────────────────────────────────────── */
console.log(PAGE + ' — source assertions (T-1/T-5/T-9)\n');
(function () {
  const src = S.read(PAGE);
  const flagAt = src.indexOf('window.UIC_PUBLIC_PAGE = true');
  const includeAt = src.indexOf("include('UI_Components')");
  ok(flagAt !== -1, 'window.UIC_PUBLIC_PAGE = true is present');
  ok(includeAt !== -1, 'the UI_Components include is present');
  ok(flagAt !== -1 && includeAt !== -1 && flagAt < includeAt,
    'the flag is set BEFORE the UI_Components include, not after');
  ok(src.indexOf('UIC.appShell(') === -1, 'UIC.appShell is never called on this page (T-1)');
  ok(src.indexOf("include('Company_Assessment_Nav')") === -1, 'no nav partial is included — there is no menu on a public page');

  ok(/URLSearchParams\(window\.location\.search\)\)\.get\('token'\)/.test(src),
    'the token is read from location.search');
  ok(!/<\?!?=\s*token\s*\?>/.test(src),
    'and NEVER from a <?!= token ?> scriptlet (T-9 — the smoke harness substitutes scriptlets with 0, which would silently break a token read that way)');
})();

/* ── 2. Rendering — payload hygiene and escaping ───────────────────────────── */
async function testRendering() {
  console.log('\n' + PAGE + ' — payload hygiene and escaping (G-09/G-07)\n');
  const fixtureAssessment = { AssessmentID: 'a1', Title: XSS, Category: 'Technical', Description: 'desc', TimeLimitMinutes: 20 };
  const fixtureQuestions = [
    { QuestionID: 'q1', OrderIndex: 1, QuestionText: XSS, QuestionType: 'MCQ', Options: [{ text: XSS }, { text: 'B' }] }
  ];
  // A real acPublicAssessment_ output never carries these fields at all — this
  // fixture deliberately smuggles them in anyway, so the page is proven to
  // never RENDER them even if a future bug ever put them on the wire.
  fixtureQuestions[0].CorrectAnswer = XSS; fixtureQuestions[0].Weight = 999; fixtureQuestions[0].Trait = 'SECRET_TRAIT';
  fixtureQuestions[0].Options[0].trait = 'SECRET_OPT_TRAIT';

  const sb = bootPage({
    page: PAGE,
    containers: ['ac-root'],
    call: function (action, data) {
      if (action === 'get_ac_candidate_assessment') return { status: 'success', assessment: fixtureAssessment, questions: fixtureQuestions };
      return { status: 'success' };
    }
  });

  // bootPage()'s harness always loads UI_Components.html BEFORE the page's own
  // script, regardless of where the page places its <script> relative to the
  // include — unlike a real browser, which honours the page's actual source
  // order (T-5 depends on exactly that ordering, verified from source above
  // and in ui3_homefab.js's direct exercise of the gate). `var TOKEN` is a
  // genuine property of the vm context's global object, so it can be set here
  // exactly as a real querystring would have supplied it before boot.
  sb.TOKEN = 'FAKE-TOKEN-1234567890';
  sb.loadWelcome();
  await flush(); await flush();

  const html = sb.html('ac-root');
  ok(html.indexOf(XSS) === -1, 'the raw <img onerror> markup never appears verbatim');
  ok(html.indexOf('&lt;img') !== -1, 'the escaped form is present instead (title + question text)');
  ['CorrectAnswer', 'SECRET_TRAIT', 'SECRET_OPT_TRAIT', '999'].forEach(function (needle) {
    ok(html.indexOf(needle) === -1, 'the answer key / trait / weight ("' + needle + '") never reaches the rendered markup');
  });

  // The harness's fixed load order means UI_Components' own boot IIFE may
  // already have created a FAB before this page's script ever set the flag —
  // a harness artifact (see comment above), not a defect. Clear it, THEN
  // confirm that once the flag this page's own script sets IS active, the
  // gate suppresses the button — the guarantee that actually matters.
  const stray = sb.document.getElementById('home-logo-fab');
  if (stray) stray.remove();
  ok(sb.window.UIC_PUBLIC_PAGE === true, "this page's own script has set window.UIC_PUBLIC_PAGE = true by now");
  sb.UIC.ensureHomeLogo();
  ok(!sb.document.getElementById('home-logo-fab'),
    'with the flag this page sets active, ensureHomeLogo() creates no button — no way back into the ERP for a candidate');

  return sb;
}

/* ── 3. Timer initialises from remaining_seconds, not TimeLimitMinutes ─────── */
async function testTimerAndDraft() {
  console.log('\n' + PAGE + ' — timer from remaining_seconds, and the localStorage draft\n');
  const assessment = { AssessmentID: 'a1', Title: 'T', Category: 'Technical', Description: '', TimeLimitMinutes: 30 };
  const questions = [
    { QuestionID: 'q1', OrderIndex: 1, QuestionText: 'Q1', QuestionType: 'MCQ', Options: [{ text: 'A' }, { text: 'B' }] },
    { QuestionID: 'q2', OrderIndex: 2, QuestionText: 'Q2', QuestionType: 'OpenText', Options: [] }
  ];
  const sb = bootPage({
    page: PAGE,
    containers: ['ac-root'],
    call: function (action, data) {
      if (action === 'get_ac_candidate_assessment') return { status: 'success', assessment: assessment, questions: questions };
      if (action === 'add_ac_candidate_attempt') return { status: 'success', assignmentId: 'AS1', remaining_seconds: 77, assessment: assessment, questions: questions };
      return { status: 'success' };
    }
  });

  sb.TOKEN = 'FAKE-TOKEN-1234567890';
  sb.loadWelcome();
  await flush(); await flush();
  sb.document.getElementById('ac-email').value = 'candidate@example.com';
  sb.document.getElementById('ac-consent').checked = true;
  sb.startTest();
  await flush(); await flush();

  ok(sb.state.remainingSeconds === 77,
    'the timer is initialised from remaining_seconds (77s), NOT from TimeLimitMinutes*60 (1800s)', sb.state.remainingSeconds);

  /* Answer the first question, confirm the draft round-trips through the
     localStorage stub (domstub.js's real getItem/setItem, not a mock). */
  sb.setAnswer('q1', 'A');
  const raw = sb.localStorage.getItem('ac_draft_' + sb.TOKEN + '_candidate@example.com');
  ok(!!raw, 'a draft was written to localStorage under the token+email key');
  const parsed = raw ? JSON.parse(raw) : null;
  ok(!!parsed && parsed.answers.q1 === 'A', 'the draft holds the answer just given', parsed);

  /* A fresh page load (new sandbox, SAME localStorage-shaped key) restores it. */
  const sb2 = bootPage({
    page: PAGE, containers: ['ac-root'],
    call: function (action) {
      if (action === 'get_ac_candidate_assessment') return { status: 'success', assessment: assessment, questions: questions };
      if (action === 'add_ac_candidate_attempt') return { status: 'success', assignmentId: 'AS1', remaining_seconds: 50, assessment: assessment, questions: questions };
      return { status: 'success' };
    }
  });
  sb2.TOKEN = sb.TOKEN;
  sb2.loadWelcome();
  await flush(); await flush();
  sb2.document.getElementById('ac-email').value = 'candidate@example.com';
  sb2.document.getElementById('ac-consent').checked = true;
  // Seed sb2's localStorage BEFORE startTest() computes the draft key from
  // state.email, by writing under the exact key startTest() will use.
  sb2.localStorage.setItem('ac_draft_' + sb2.TOKEN + '_candidate@example.com', JSON.stringify({ answers: { q1: 'B' }, currentIndex: 1 }));
  sb2.startTest();
  await flush(); await flush();
  ok(sb2.state.answers.q1 === 'B' && sb2.state.currentIndex === 1,
    'a resumed session restores its draft answers and position from localStorage', sb2.state);
}

/* ── 4. The three public handlers, loaded directly, over a stubbed sheet ──── */
function buildActionsSandbox() {
  const src = fs.readFileSync(path.join(ROOT, 'Company_Assessment_Actions.js'), 'utf8');
  const store = {};
  function makeSheet(headers) {
    const rows = [];
    return {
      _headers: headers, _rows: rows,
      getLastRow: function () { return rows.length + 1; },
      getLastColumn: function () { return headers.length; },
      getRange: function (r, c, numRows, numCols) {
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

  const TOKEN72 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' + 'ffffffff-1111-2222-3333-444444444444';
  store['Assessments'].appendRow(['AID1', 'Test', 'Technical', '', 10, 50, true, 'u', '2026-09-01 10:00:00', '2026-09-01 10:00:00']);
  store['Questions'].appendRow(['q1', 'AID1', 1, 'Q1?', 'MCQ', '["A","B"]', 'A', 10, '', 'u', '2026-09-01 10:00:00']);
  store['AssessmentBatches'].appendRow(['B1', TOKEN72, 'Acme', 'AID1', 'Test', 1, 0, 'u', '2026-09-01 10:00:00', '2099-01-01 00:00:00', true]);

  function getSheet_(sheetName) { if (!store[sheetName]) throw new Error('no stub sheet: ' + sheetName); return store[sheetName]; }
  function getHeaders_(sheet) { return sheet._headers.slice(); }
  function appendRowWithRetry_(sheet, values) { sheet.appendRow(values); }
  function noteMutation_() {}
  function executeWithLock_(fn) { return fn(); } // no-op lock, exactly as the plan specifies for the race test
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
  const historyCalls = [];
  function logHistory_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues) { historyCalls.push({ sheetName: sheetName, action: action }); }

  let uidSeq = 0;
  function p2u(n) { return (n < 10 ? '0' : '') + n; }
  const Utilities = {
    getUuid: function () { uidSeq++; return 'uuid' + uidSeq + '-aaaa-bbbb-cccc-000000000000'; },
    formatDate: function (date) {
      return date.getFullYear() + '-' + p2u(date.getMonth() + 1) + '-' + p2u(date.getDate()) + ' ' +
        p2u(date.getHours()) + ':' + p2u(date.getMinutes()) + ':' + p2u(date.getSeconds());
    }
  };
  const Session = { getScriptTimeZone: function () { return 'Africa/Cairo'; } };
  const CacheService = {
    getScriptCache: function () {
      const c = {};
      return { get: function (k) { return c[k] !== undefined ? c[k] : null; }, put: function (k, v) { c[k] = v; } };
    }
  };

  /* Gap-closure ported stubs: acUpdate_ now version-checks and patches via
   * Code.js helpers, and authorize_ double-checks the tenant dbId.
   * Faithful to the real contracts (missing version -> 0, mismatch throws;
   * the stub store holds no formulas so patching == updating here). */
  function getRowVersion_(row) {
    if (!row) return 0;
    var v = row.version;
    if (v === undefined) { var k = Object.keys(row).find(function (kk) { return String(kk).trim().toLowerCase() === 'version'; }); v = k ? row[k] : undefined; }
    if (v === undefined || v === null || v === '') return 0;
    var n = Number(v); return (isFinite(n) && n >= 0) ? Math.floor(n) : 0;
  }
  function checkRowVersion_(oldRow, clientVersion) {
    var current = getRowVersion_(oldRow);
    var want = (clientVersion === undefined || clientVersion === null || clientVersion === '') ? 0 : Number(clientVersion);
    if (!isFinite(want) || want < 0) want = 0; else want = Math.floor(want);
    if (want !== current) throw new Error('CONFLICT: stale version — reload and retry | تعارض: النسخة قديمة — أعد التحميل وحاول مجدداً');
    return current;
  }
  function patchRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject) { return updateRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject); }
  function getCompanySpreadsheetId_() { return 'DB1'; }

  const sandbox = { getSheet_, getHeaders_, appendRowWithRetry_, noteMutation_, executeWithLock_, updateRowByCriteria_, patchRowByCriteria_, checkRowVersion_, getCompanySpreadsheetId_, getAllRecords_, getRecordsByPk_, logHistory_, Utilities, Session, CacheService };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'Company_Assessment_Actions.js' });
  const AC = vm.runInContext('AssessmentCenter', sandbox);
  return { AC: AC, store: store, TOKEN72: TOKEN72 };
}

function testPublicHandlers() {
  console.log('\nthe three public handlers, over a stubbed sheet (no real lock, per the plan)\n');
  const built = buildActionsSandbox();
  const AC = built.AC, store = built.store, TOKEN = built.TOKEN72;

  /* remaining_seconds is computed server-side from StartedAt, not trusted
     from the client. */
  const readBeforeStart = AC.publicDispatch_({ module_action: 'get_ac_candidate_assessment', data: { token: TOKEN } }, 'DB1');
  ok(readBeforeStart.status === 'success' && readBeforeStart.remaining_seconds === null,
    'before any attempt, remaining_seconds is null (no StartedAt to compute from yet)');

  /* ── the race: two admissions against ONE remaining slot ── */
  const first = AC.publicDispatch_({ module_action: 'add_ac_candidate_attempt', data: { token: TOKEN, email: 'a@example.com' } }, 'DB1');
  ok(first.status === 'success' && typeof first.assignmentId === 'string', 'the first candidate is admitted');
  ok(first.remaining_seconds > 0 && first.remaining_seconds <= 600, 'remaining_seconds is computed from StartedAt (~10 minutes, TimeLimitMinutes=10)', first.remaining_seconds);

  let secondThrew = null;
  try {
    AC.publicDispatch_({ module_action: 'add_ac_candidate_attempt', data: { token: TOKEN, email: 'b@example.com' } }, 'DB1');
  } catch (e) { secondThrew = e; }
  ok(!!secondThrew, 'a SECOND, different candidate against the same one-slot batch is refused — the second call sees the first call\'s UsedSlots write (G-03)', secondThrew && secondThrew.message);

  /* the SAME candidate calling again resumes idempotently rather than being refused or double-counted. */
  const resumed = AC.publicDispatch_({ module_action: 'add_ac_candidate_attempt', data: { token: TOKEN, email: 'a@example.com' } }, 'DB1');
  ok(resumed.assignmentId === first.assignmentId, 'the same candidate calling again resumes the SAME assignment, not a new one');
  ok(store['AssessmentBatches']._rows[0][store['AssessmentBatches']._headers.indexOf('UsedSlots')] === 1,
    'UsedSlots is still 1 after the resume — resuming never double-counts a slot');

  /* ── ownership + single submission + late grace + events → AuditLog ── */
  const assignmentId = first.assignmentId;
  // Backdate StartedAt so the submission arrives 61s "late" (D-10: accepted, flagged).
  const assignHeaders = store['Assignments']._headers;
  const assignRow = store['Assignments']._rows.filter(function (r) { return r[assignHeaders.indexOf('AssignmentID')] === assignmentId; })[0];
  const longAgo = new Date(Date.now() - (10 * 60 + 61) * 1000);
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  assignRow[assignHeaders.indexOf('StartedAt')] = longAgo.getFullYear() + '-' + p2(longAgo.getMonth() + 1) + '-' + p2(longAgo.getDate()) + ' ' + p2(longAgo.getHours()) + ':' + p2(longAgo.getMinutes()) + ':' + p2(longAgo.getSeconds());

  let wrongOwnerThrew = null;
  try {
    AC.publicDispatch_({ module_action: 'add_ac_candidate_submission', data: { token: TOKEN, email: 'someone-else@example.com', assignmentId: assignmentId, answers: [] } }, 'DB1');
  } catch (e) { wrongOwnerThrew = e; }
  ok(!!wrongOwnerThrew, 'submitting with the wrong email for this assignment is refused (ownership check)');

  const submitRes = AC.publicDispatch_({
    module_action: 'add_ac_candidate_submission',
    data: {
      token: TOKEN, email: 'a@example.com', assignmentId: assignmentId,
      answers: [{ questionId: 'q1', answer: 'A' }],
      events: [{ type: 'TAB_SWITCH', at: '2026-09-01T10:00:00.000Z' }, { type: 'TAB_SWITCH', at: '2026-09-01T10:00:05.000Z' }]
    }
  }, 'DB1');
  ok(submitRes.status === 'success', 'a late (61s past the limit) submission is ACCEPTED, not refused (D-10)');
  ok(submitRes.late === true, 'and flagged as late');
  ok(submitRes.data && submitRes.data.assignedId === assignmentId,
    'the response carries data.assignedId = AssignmentID, so SystemLog\'s RecordID is filled');

  const respHeaders = store['Responses']._headers;
  const respRow = store['Responses']._rows[0];
  ok(respRow[respHeaders.indexOf('Score')] === 10, 'the MCQ response was auto-graded at submission (correct answer, Weight=10)', respRow);

  const auditHeaders = store['AuditLog']._headers;
  const auditActions = store['AuditLog']._rows.map(function (r) { return r[auditHeaders.indexOf('Action')]; });
  ok(auditActions.indexOf('LATE_SUBMISSION') !== -1, 'a LATE_SUBMISSION row was written to AuditLog in the same request');
  ok(auditActions.indexOf('TAB_SWITCH') !== -1, 'a TAB_SWITCH row (batched, count=2) was written too');
  const tabSwitchRow = store['AuditLog']._rows[auditActions.indexOf('TAB_SWITCH')];
  ok(/count=2/.test(tabSwitchRow[auditHeaders.indexOf('Details')]), 'the TAB_SWITCH row batches BOTH events into one row with count=2', tabSwitchRow);

  let secondSubmitThrew = null;
  try {
    AC.publicDispatch_({ module_action: 'add_ac_candidate_submission', data: { token: TOKEN, email: 'a@example.com', assignmentId: assignmentId, answers: [] } }, 'DB1');
  } catch (e) { secondSubmitThrew = e; }
  ok(!!secondSubmitThrew, 'a second submission of the same assignment is refused (single-submit)');

  /* ── the invite rule ── */
  const built2 = buildActionsSandbox();
  const invitedEmail = 'invited@example.com';
  const assignH2 = built2.store['Assignments']._headers;
  built2.store['Assignments'].appendRow(assignH2.map(function (h) {
    if (h === 'AssignmentID') return 'INV1'; if (h === 'BatchID') return 'B1'; if (h === 'Token') return built2.TOKEN72;
    if (h === 'CandidateEmail') return invitedEmail; if (h === 'AssessmentID') return 'AID1'; if (h === 'Status') return 'Invited';
    return '';
  }));
  let uninvitedThrew = null;
  try {
    built2.AC.publicDispatch_({ module_action: 'add_ac_candidate_attempt', data: { token: built2.TOKEN72, email: 'not-invited@example.com' } }, 'DB1');
  } catch (e) { uninvitedThrew = e; }
  ok(!!uninvitedThrew, 'a batch with an Invited row rejects an email that is not on the list');
  const invitedRes = built2.AC.publicDispatch_({ module_action: 'add_ac_candidate_attempt', data: { token: built2.TOKEN72, email: invitedEmail } }, 'DB1');
  ok(invitedRes.status === 'success' && invitedRes.assignmentId === 'INV1', 'the invited email IS admitted, consuming its own Invited row');
}

(async function () {
  await testRendering();
  await testTimerAndDraft();
  testPublicHandlers();

  console.log('');
  if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
  console.log('ac5_candidate: all assertions pass.');
})();

