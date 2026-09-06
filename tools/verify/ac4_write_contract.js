/**
 * ac4_write_contract.js — T-3/T-4/R3: the write path never falls into the
 * header-case shadowing trap, and never touches ID_Counter.
 *
 *   node tools/verify/ac4_write_contract.js
 *
 * Two independent lines of defence, both required to pass:
 *
 *   1. A SOURCE GREP: addRecord_(, getNextId_( and saveRecordWithAudit_( must
 *      never appear in Company_Assessment_Actions.js. This is what stops a
 *      later contributor from reintroducing R-16/R-17 by reaching for the
 *      "normal" house helpers against this one spreadsheet (R3 in the risk
 *      register).
 *   2. A BEHAVIOURAL run of acInsert_ / acInsertMany_ / acUpdate_ against a
 *      stubbed sheet whose header row is the exact PascalCase list from plan
 *      §2.2, with 02_DataAccess.js's real updateRowByCriteria_ logic ported
 *      in verbatim (see PORTED note below) so the matching semantics under
 *      test are the real ones, not a reimplementation that happens to pass.
 *
 * Phase 4 (batches) extends this file rather than duplicating it, per the
 * plan's file list.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const ACTIONS_FILE = 'Company_Assessment_Actions.js';
const src = fs.readFileSync(path.join(ROOT, ACTIONS_FILE), 'utf8');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + JSON.stringify(extra) : ''));
}

console.log('T-3/T-4 — the write path (' + ACTIONS_FILE + ')\n');

/* ── 1. Source grep — R3 in the risk register ─────────────────────────────── */
console.log('source: none of the three forbidden helpers are called\n');
['addRecord_(', 'getNextId_(', 'saveRecordWithAudit_('].forEach(function (needle) {
  ok(src.indexOf(needle) === -1, 'never calls ' + needle);
});

/* ── 2. A stubbed sheet + the real Apps Script service surface acInsert_/
 *      acUpdate_ need. updateRowByCriteria_ below is a VERBATIM port of
 *      02_DataAccess.js's implementation (same matching semantics), so this
 *      test exercises the real case-insensitive per-cell matching rule that
 *      makes T-3 safe — not a friendlier stand-in. ── */
function makeStubSheet(headers, name) {
  const rows = [];
  return {
    _name: name,
    getName: function () { return name; },
    getLastRow: function () { return rows.length + 1; }, // +1 for the header row
    getLastColumn: function () { return headers.length; },
    getRange: function (r, c, numRows, numCols) {
      return {
        getValues: function () {
          // Only ever asked for the header row (r=1,c=1) in this stub's use.
          return [headers.slice()];
        },
        setValues: function (matrix) {
          // r is 1-based; r=1 is the header row, so a data row index is r-2.
          matrix.forEach(function (rowVals, i) {
            const targetIdx = (r - 2) + i;
            if (targetIdx < 0) return; // never asked to rewrite the header here
            if (targetIdx < rows.length) rows[targetIdx] = rowVals.slice();
            else rows[targetIdx] = rowVals.slice();
          });
        }
      };
    },
    getDataRange: function () {
      return { getValues: function () { return [headers.slice()].concat(rows.map(function (r) { return r.slice(); })); } };
    },
    appendRow: function (values) { rows.push(values.slice()); },
    _rows: rows,
    _headers: headers
  };
}

const sheetsAccessed = [];
const historyCalls = [];

function buildSandbox() {
  const store = {}; // sheetName -> stub sheet, one fake spreadsheet ('DB1')
  const headers = ['AssessmentID', 'Title', 'Category', 'Description', 'TimeLimitMinutes', 'PassScore', 'IsActive', 'UserID', 'CreatedAt', 'UpdatedAt'];
  store['Assessments'] = makeStubSheet(headers, 'Assessments');

  function getSheet_(sheetName, dbId) {
    sheetsAccessed.push(sheetName);
    if (!store[sheetName]) throw new Error('Stub has no sheet: ' + sheetName);
    return store[sheetName];
  }
  function getHeaders_(sheet) { return sheet._headers.slice(); }
  function appendRowWithRetry_(sheet, values) { sheet.appendRow(values); }
  function noteMutation_() {}
  function executeWithLock_(fn) { return fn(); }

  /* PORTED VERBATIM from 02_DataAccess.js's updateRowByCriteria_ — same
   * case-insensitive per-cell matching, so this proves the real contract. */
  function updateRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject) {
    const headers = getHeaders_(sheet);
    const data = sheet.getDataRange().getValues();
    const critIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase(); });
    if (critIdx === -1) throw new Error('Criteria header "' + criteriaHeader + '" not found.');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) {
        const newRow = data[i].map(function (originalVal, colIdx) {
          const header = headers[colIdx];
          const updateKey = Object.keys(updatesObject).find(function (k) { return k.trim().toLowerCase() === String(header).trim().toLowerCase(); });
          return updateKey !== undefined ? updatesObject[updateKey] : originalVal;
        });
        sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
        noteMutation_();
        return true;
      }
    }
    return false;
  }

  function buildRecordsFromRaw_(data, hdrs) {
    const keys = hdrs.map(function (h) { return String(h).trim(); });
    const records = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const record = {};
      for (let c = 0; c < keys.length; c++) record[keys[c]] = row[c] !== undefined ? row[c] : '';
      records.push(record);
    }
    return records;
  }
  function getAllRecords_(dbId, sheetName) {
    const sheet = getSheet_(sheetName, dbId);
    return buildRecordsFromRaw_(sheet.getDataRange().getValues(), getHeaders_(sheet));
  }
  function getRecordsByPk_(dbId, sheetName, pkColumn) {
    const rows = getAllRecords_(dbId, sheetName);
    const pkLc = String(pkColumn || 'id').trim().toLowerCase();
    const hdrs = getHeaders_(getSheet_(sheetName, dbId)).map(function (h) { return String(h).trim(); });
    let pkHeader = null;
    hdrs.forEach(function (h) { if (h.toLowerCase() === pkLc) pkHeader = h; });
    const byPk = new Map();
    rows.forEach(function (r) {
      const raw = pkHeader !== null ? r[pkHeader] : r[pkLc];
      const pk = String(raw === null || raw === undefined ? '' : raw).trim();
      if (!pk) return;
      byPk.set(pk, r); byPk.set(pk.toLowerCase(), r);
    });
    return { rows: rows, byPk: byPk, headers: hdrs, pkHeader: pkHeader || pkColumn };
  }
  function logHistory_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues) {
    historyCalls.push({ dbId: dbId, sheetName: sheetName, recordUid: recordUid, recordId: recordId, user: user, action: action, newValues: newValues, oldValues: oldValues });
  }

  const sandbox = { getSheet_, getHeaders_, appendRowWithRetry_, noteMutation_, executeWithLock_, updateRowByCriteria_, getAllRecords_, getRecordsByPk_, logHistory_ };
  vm.createContext(sandbox);
  return { sandbox: sandbox, store: store };
}

const built = buildSandbox();
vm.runInContext(src, built.sandbox, { filename: ACTIONS_FILE });
const AC = vm.runInContext('AssessmentCenter', built.sandbox);

console.log('\nacInsert_ — mixed-case input keys land in the right column\n');
const insertObj = {
  AssessmentID: 'AID001',            // exact case (the pk — callers always key this correctly)
  title: 'My Test Assessment',       // lower
  CATEGORY: 'Technical',             // upper
  Description: 'a description',      // exact
  TimeLimitMinutes: 30,               // exact
  passscore: 60,                      // lower
  IsActive: true,                     // exact
  userid: 'staff1',                   // lower
  CreatedAt: '2026-09-01 10:00:00',   // exact
  updatedat: '2026-09-01 10:00:00'    // lower
};
const insertResult = AC.acInsert_('DB1', 'Assessments', insertObj, 'staff@example.com', 'AssessmentID');
ok(insertResult.status === 'success' && insertResult.data.assignedId === 'AID001', 'insert reports success with the right assignedId');

const sheet = built.store['Assessments'];
ok(sheet._rows.length === 1, 'exactly one row was appended');
const row = sheet._rows[0];
const byHeader = {};
sheet._headers.forEach(function (h, i) { byHeader[h] = row[i]; });
ok(byHeader.AssessmentID === 'AID001', 'AssessmentID column correct');
ok(byHeader.Title === 'My Test Assessment', 'Title column correct despite lower-case input key "title"');
ok(byHeader.Category === 'Technical', 'Category column correct despite upper-case input key "CATEGORY"');
ok(byHeader.Description === 'a description', 'Description column correct');
ok(byHeader.TimeLimitMinutes === 30, 'TimeLimitMinutes column correct');
ok(byHeader.PassScore === 60, 'PassScore column correct despite lower-case input key "passscore"');
ok(byHeader.IsActive === true, 'IsActive column correct');
ok(byHeader.UserID === 'staff1', 'UserID column correct despite lower-case input key "userid"');
ok(byHeader.CreatedAt === '2026-09-01 10:00:00', 'CreatedAt column correct');
ok(byHeader.UpdatedAt === '2026-09-01 10:00:00', 'UpdatedAt column correct despite lower-case input key "updatedat"');

console.log('\nlogHistory_ receives HEADER-CASE column names (not the caller\'s casing)\n');
const createCall = historyCalls[historyCalls.length - 1];
ok(createCall.action === 'create', 'the create call is the last one recorded');
ok(Object.prototype.hasOwnProperty.call(createCall.newValues, 'Title'), 'newValues has the header-case key "Title"');
ok(!Object.prototype.hasOwnProperty.call(createCall.newValues, 'title'), 'and NOT the caller\'s lower-case "title"');
ok(createCall.newValues.Title === 'My Test Assessment', 'and the value under that header-case key is correct');
ok(createCall.newValues.PassScore === 60, 'PassScore likewise present under its header-case key with the right value');

console.log('\nacUpdate_ — changes exactly the patched cells, with a differently-cased patch key\n');
const before = sheet._rows[0].slice();
const updateResult = AC.acUpdate_('DB1', 'Assessments', 'AssessmentID', 'AID001', { title: 'Renamed Assessment' }, 'staff@example.com');
ok(updateResult.status === 'success', 'update reports success');
const after = sheet._rows[0];
let changedCols = [];
sheet._headers.forEach(function (h, i) { if (before[i] !== after[i]) changedCols.push(h); });
ok(changedCols.length === 1 && changedCols[0] === 'Title', 'exactly one cell changed, and it is Title', changedCols);
const afterByHeader = {};
sheet._headers.forEach(function (h, i) { afterByHeader[h] = after[i]; });
ok(afterByHeader.Title === 'Renamed Assessment', 'Title now holds the patched value');
ok(afterByHeader.Category === 'Technical' && afterByHeader.PassScore === 60,
  'every untouched column keeps its exact prior value — this is what a merge-then-overwrite would have silently broken (T-3)');

const updateHistoryCall = historyCalls[historyCalls.length - 1];
ok(updateHistoryCall.action === 'update', 'the update call is the last history entry');
ok(updateHistoryCall.newValues.Title === 'Renamed Assessment' && updateHistoryCall.oldValues.Title === 'My Test Assessment',
  'logHistory_ sees BOTH the old and the new value under the header-case key "Title" — a mis-cased merge would have shown the update as a no-op here');

console.log('\nacInsertMany_ — bulk create, one setValues, header-case history rows\n');
const q1 = { QuestionID: 'q1', assessmentid: 'AID001', orderindex: 1, QuestionText: 'Q1?', questiontype: 'MCQ' };
const q2 = { QuestionID: 'q2', assessmentid: 'AID001', orderindex: 2, QuestionText: 'Q2?', questiontype: 'Likert' };
built.store['Questions'] = makeStubSheet(['QuestionID', 'AssessmentID', 'OrderIndex', 'QuestionText', 'QuestionType', 'OptionsJSON', 'CorrectAnswer', 'Weight', 'Trait', 'UserID', 'CreatedAt'], 'Questions');
const bulkResult = AC.acInsertMany_('DB1', 'Questions', [q1, q2], 'staff@example.com', 'QuestionID');
ok(bulkResult.status === 'success' && bulkResult.data.count === 2, 'both rows reported created');
ok(built.store['Questions']._rows.length === 2, 'exactly two rows appended in one batch');
const qByHeader0 = {};
built.store['Questions']._headers.forEach(function (h, i) { qByHeader0[h] = built.store['Questions']._rows[0][i]; });
ok(qByHeader0.AssessmentID === 'AID001' && qByHeader0.OrderIndex === 1 && qByHeader0.QuestionType === 'MCQ',
  'mixed-case keys (assessmentid/orderindex/questiontype) land correctly in the bulk path too');
const bulkHistory = historyCalls.slice(-2);
ok(bulkHistory.every(function (c) { return c.action === 'create' && Object.prototype.hasOwnProperty.call(c.newValues, 'AssessmentID'); }),
  'both bulk-created rows logged history under header-case keys');

/* ── 3. No ID_Counter access, ever ─────────────────────────────────────────── */
console.log('\nno ID_Counter access anywhere in this test run\n');
ok(sheetsAccessed.indexOf('ID_Counter') === -1, 'getSheet_ was never asked for "ID_Counter"', sheetsAccessed);

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('ac4_write_contract: all assertions pass.');
