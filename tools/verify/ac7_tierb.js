/**
 * ac7_tierb.js — Phase 8 (D-2): B-1 (Assignments.CandidateName/
 * CandidatePhone/AppliedPosition) and B-2 (Assignments.ReviewDecision/
 * ReviewNotes/ReviewedBy/ReviewedAt), each proven to render/behave
 * correctly BOTH with and without the columns present — the whole point of
 * "tolerant of absence" is that accepting one later must be safe, so both
 * fixtures must pass, not just the one matching today's real sheet.
 *
 *   node tools/verify/ac7_tierb.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'Company_Assessment_Actions.js'), 'utf8');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + JSON.stringify(extra) : ''));
}

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

const TOKEN72 = 'a'.repeat(36) + 'b'.repeat(36);

/** assignmentsHeaders lets the caller include or omit the Tier B columns. */
function buildSandbox(assignmentsHeaders) {
  const store = {};
  store['Assessments'] = makeSheet(['AssessmentID', 'Title', 'Category', 'Description', 'TimeLimitMinutes', 'PassScore', 'IsActive', 'UserID', 'CreatedAt', 'UpdatedAt']);
  store['Questions'] = makeSheet(['QuestionID', 'AssessmentID', 'OrderIndex', 'QuestionText', 'QuestionType', 'OptionsJSON', 'CorrectAnswer', 'Weight', 'Trait', 'UserID', 'CreatedAt']);
  store['AssessmentBatches'] = makeSheet(['BatchID', 'Token', 'CompanyName', 'AssessmentID', 'AssessmentTitle', 'MaxCandidates', 'UsedSlots', 'AssignedBy', 'CreatedAt', 'ExpiresAt', 'IsActive']);
  store['Assignments'] = makeSheet(assignmentsHeaders);
  store['Responses'] = makeSheet(['ResponseID', 'AssignmentID', 'QuestionID', 'Answer', 'Score', 'AnsweredAt', 'EmailCandidate', 'CreatedAt']);
  store['AuditLog'] = makeSheet(['Timestamp', 'ActorEmail', 'Action', 'Details']);

  store['Assessments'].appendRow(['AID1', 'Test', 'Technical', '', 10, 50, true, 'u', '2026-09-01 10:00:00', '2026-09-01 10:00:00']);
  store['AssessmentBatches'].appendRow(['B1', TOKEN72, 'Acme', 'AID1', 'Test', 5, 0, 'u', '2026-09-01 10:00:00', '2099-01-01 00:00:00', true]);

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
  let uidSeq = 0;
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  const Utilities = {
    getUuid: function () { uidSeq++; return 'uuid' + uidSeq + '-aaaa-bbbb-cccc-000000000000'; },
    formatDate: function (date) {
      return date.getFullYear() + '-' + p2(date.getMonth() + 1) + '-' + p2(date.getDate()) + ' ' + p2(date.getHours()) + ':' + p2(date.getMinutes()) + ':' + p2(date.getSeconds());
    }
  };
  const Session = { getScriptTimeZone: function () { return 'Africa/Cairo'; } };
  const CacheService = { getScriptCache: function () { const c = {}; return { get: function (k) { return c[k] !== undefined ? c[k] : null; }, put: function (k, v) { c[k] = v; } }; } };
  function logHistory_() {}

  const sandbox = { getSheet_, getHeaders_, appendRowWithRetry_: function (s, v) { s.appendRow(v); }, noteMutation_, executeWithLock_, updateRowByCriteria_, getAllRecords_, getRecordsByPk_, logHistory_, Utilities, Session, CacheService };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'Company_Assessment_Actions.js' });
  const AC = vm.runInContext('AssessmentCenter', sandbox);
  return { AC: AC, store: store };
}

const BASE_ASSIGNMENTS_HEADERS = ['AssignmentID', 'BatchID', 'Token', 'CandidateEmail', 'AssessmentID', 'Status', 'StartedAt', 'CompletedAt', 'CreatedAt'];
const B1_COLS = ['CandidateName', 'CandidatePhone', 'AppliedPosition'];
const B2_COLS = ['ReviewDecision', 'ReviewNotes', 'ReviewedBy', 'ReviewedAt'];

/* ── B-1 — WITHOUT the columns (today's real sheet) ────────────────────────── */
console.log('B-1 (candidate name/phone/position) — WITHOUT the columns\n');
(function () {
  const built = buildSandbox(BASE_ASSIGNMENTS_HEADERS.slice());
  const AC = built.AC;
  const readRes = AC.publicDispatch_({ module_action: 'get_ac_candidate_assessment', data: { token: TOKEN72 } }, 'DB1');
  ok(readRes.capabilities.candidateProfile === false, 'capabilities.candidateProfile is false — the columns are not there');

  const attemptRes = AC.publicDispatch_({ module_action: 'add_ac_candidate_attempt', data: { token: TOKEN72, email: 'a@example.com', name: 'Ali', phone: '0100', appliedPosition: 'Dev' } }, 'DB1');
  ok(attemptRes.status === 'success', 'admission still succeeds even though the client sent name/phone/position');
  ok(built.store['Assignments']._headers.indexOf('CandidateName') === -1, 'no CandidateName column was added to the sheet — this run adds no column, ever');
})();

/* ── B-1 — WITH the columns ─────────────────────────────────────────────────── */
console.log('\nB-1 — WITH the columns (owner has appended them)\n');
(function () {
  const built = buildSandbox(BASE_ASSIGNMENTS_HEADERS.concat(B1_COLS));
  const AC = built.AC;
  const readRes = AC.publicDispatch_({ module_action: 'get_ac_candidate_assessment', data: { token: TOKEN72 } }, 'DB1');
  ok(readRes.capabilities.candidateProfile === true, 'capabilities.candidateProfile is true once the three columns exist');

  const attemptRes = AC.publicDispatch_({ module_action: 'add_ac_candidate_attempt', data: { token: TOKEN72, email: 'a@example.com', name: 'Ali', phone: '0100', appliedPosition: 'Dev' } }, 'DB1');
  ok(attemptRes.status === 'success', 'admission succeeds');
  const headers = built.store['Assignments']._headers;
  const row = built.store['Assignments']._rows[0];
  ok(row[headers.indexOf('CandidateName')] === 'Ali' && row[headers.indexOf('CandidatePhone')] === '0100' && row[headers.indexOf('AppliedPosition')] === 'Dev',
    'the three fields actually landed in their columns', row);
})();

/* ── B-2 — WITHOUT the columns ──────────────────────────────────────────────── */
console.log('\nB-2 (review decision) — WITHOUT the columns\n');
(function () {
  const built = buildSandbox(BASE_ASSIGNMENTS_HEADERS.slice());
  const AC = built.AC;
  const SUPER = { isSuperAdmin: true, email: 'reviewer@example.com' };
  function call(action, data) { return AC.dispatch_({ module_action: action, data: data }, SUPER, 'DB1'); }

  built.store['Assignments'].appendRow(['AS1', 'B1', TOKEN72, 'c@example.com', 'AID1', 'Completed', '2026-09-02 09:00:00', '2026-09-02 09:10:00', '2026-09-02 09:00:00']);
  const detail = call('get_ac_result', { id: 'AS1' });
  ok(detail.capabilities.review === false && detail.review === null, 'capabilities.review is false and review is null — the columns are not there');

  let threw = null;
  try { call('add_ac_review_decision', { assignment_id: 'AS1', decision: 'Hire' }); } catch (e) { threw = e; }
  ok(!!threw, 'add_ac_review_decision throws a clear error rather than silently discarding the reviewer\'s decision', threw && threw.message);
})();

/* ── B-2 — WITH the columns ─────────────────────────────────────────────────── */
console.log('\nB-2 — WITH the columns\n');
(function () {
  const built = buildSandbox(BASE_ASSIGNMENTS_HEADERS.concat(B2_COLS));
  const AC = built.AC;
  const SUPER = { isSuperAdmin: true, email: 'reviewer@example.com' };
  function call(action, data) { return AC.dispatch_({ module_action: action, data: data }, SUPER, 'DB1'); }

  built.store['Assignments'].appendRow(['AS1', 'B1', TOKEN72, 'c@example.com', 'AID1', 'Completed', '2026-09-02 09:00:00', '2026-09-02 09:10:00', '2026-09-02 09:00:00', '', '', '', '']);
  const before = call('get_ac_result', { id: 'AS1' });
  ok(before.capabilities.review === true, 'capabilities.review is true once the four columns exist');
  ok(before.review.decision === '', 'no decision recorded yet');

  const saveRes = call('add_ac_review_decision', { assignment_id: 'AS1', decision: 'Hire', notes: 'Great candidate' });
  ok(saveRes.status === 'success', 'saving a decision succeeds');

  const after = call('get_ac_result', { id: 'AS1' });
  ok(after.review.decision === 'Hire' && after.review.notes === 'Great candidate', 'the decision and notes round-trip through get_ac_result', after.review);
  ok(after.review.reviewedBy === 'reviewer@example.com' && !!after.review.reviewedAt, 'reviewedBy/reviewedAt are stamped');
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('ac7_tierb: all assertions pass.');
