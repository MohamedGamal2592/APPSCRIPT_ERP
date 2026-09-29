/**
 * ac3_authoring.js — Company_Assessment_Assessments.html and
 * Company_Assessment_AssessmentForm.html, booted for real via pageharness.js.
 *
 *   node tools/verify/ac3_authoring.js
 *
 * Covers the plan's Phase 3 verify bullet: the collected payload for a
 * three-type assessment has the expected OptionsJSON shape (objects for
 * MostLeast, strings for MCQ/Likert); view mode disables every input when
 * the assessment has attempts; a malicious question text is escaped in both
 * the list and the form; .form-grid is used, no inline grid-template-columns.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + JSON.stringify(extra) : ''));
}

const XSS = '<img src=x onerror=alert(1)>';

/* ── 1. Company_Assessment_Assessments.html — escaping in the list ────────── */
async function testList() {
  console.log('Company_Assessment_Assessments.html\n');
  const sb = bootPage({
    page: 'Company_Assessment_Assessments.html',
    containers: ['ac-root'],
    isSuperAdmin: true,
    call: function (action, data) {
      if (action === 'get_ac_assessments') {
        return {
          status: 'success',
          rows: [{
            AssessmentID: 'a1', Title: XSS, Category: 'Technical', CategoryLabel: 'فني',
            QuestionCount: 3, TimeLimitMinutes: 20, PassScore: 60, IsActive: true, AttemptCount: 0,
            CreatedAt: '2026-09-01 10:00:00'
          }]
        };
      }
      return { status: 'success' };
    }
  });

  sb.renderApp();
  await flush(); await flush();

  const html = sb.html('ac-assess-content');
  ok(html.indexOf(XSS) === -1, 'the raw <img onerror> markup never appears verbatim in the rendered table');
  ok(html.indexOf('&lt;img') !== -1, 'the escaped form (&lt;img…) is present instead');
}

/* ── 2. Company_Assessment_AssessmentForm.html — CREATE mode ──────────────── */
async function testCreate() {
  console.log('\nCompany_Assessment_AssessmentForm.html — create mode\n');
  const sb = bootPage({
    page: 'Company_Assessment_AssessmentForm.html',
    containers: ['ac-root'],
    isSuperAdmin: true,
    scriptlets: { PAGE_PARAMS: "''" },
    call: function () { return { status: 'success' }; }
  });

  sb.renderApp();
  await flush();

  ok(sb.state.mode === 'create', 'no ?id= in the URL -> create mode');

  /* Build a three-type assessment: MCQ, Likert, MostLeast. */
  sb.addQuestion(); // index 0 — MCQ (the default type)
  sb.updateQ(0, 'QuestionText', '2+2=?');
  sb.updateQ(0, 'Weight', 10);
  sb.addOptToState = null; // (no such fn — options go through the DOM-driven addOpt, stub the input instead)

  /* addOpt() reads #newopt_i from the DOM, so give it one and call addOpt
     directly — this exercises the REAL function, not a re-implementation. */
  function addOptionViaDom(sandbox, qIndex, text) {
    const input = sandbox.document.getElementById('newopt_' + qIndex);
    if (!input) throw new Error('newopt_' + qIndex + ' not found — did renderQuestions() run?');
    input.value = text;
    sandbox.addOpt(qIndex);
  }
  addOptionViaDom(sb, 0, '3');
  addOptionViaDom(sb, 0, '4');
  addOptionViaDom(sb, 0, '5');
  const correctEl = sb.document.getElementById('qcorrect_0');
  ok(!!correctEl, 'the MCQ correct-answer combo\'s hidden input exists after adding options');
  if (correctEl) correctEl.value = '4';

  sb.addQuestion(); // index 1 — Likert
  sb.updateQType(1, 'Likert');
  sb.updateQ(1, 'QuestionText', XSS);
  sb.updateQ(1, 'Weight', 2);
  sb.updateQ(1, 'Trait', 'Extraversion');

  sb.addQuestion(); // index 2 — MostLeast
  sb.updateQType(2, 'MostLeast');
  sb.updateQ(2, 'QuestionText', 'Most/least like you');
  sb.updateQ(2, 'Weight', 5);
  addOptionViaDom(sb, 2, 'Leads');
  addOptionViaDom(sb, 2, 'Follows');
  sb.updateOpt(2, 0, 'trait', 'Leadership');
  sb.updateOpt(2, 1, 'trait', 'Compliance');

  /* Header fields, via the real form. */
  sb.document.getElementById('Title').value = 'Mixed';
  sb.document.getElementById('Category').value = 'Technical';
  sb.document.getElementById('TimeLimitMinutes').value = '30';
  sb.document.getElementById('PassScore').value = '60';

  const fakeBtn = sb.document.createElement('button');
  sb.saveAssessment(fakeBtn);
  await flush();

  const addCall = sb.__calls.filter(function (c) { return c.action === 'company_action' && c.payload.module_action === 'add_ac_assessment'; })[0];
  ok(!!addCall, 'add_ac_assessment was called');
  if (addCall) {
    const qs = addCall.payload.data.questions;
    ok(qs.length === 3, 'three questions in the payload', qs.length);
    const mcq = qs[0], likert = qs[1], mostLeast = qs[2];
    ok(mcq.QuestionType === 'MCQ' && Array.isArray(mcq.Options) && mcq.Options.every(function (o) { return typeof o === 'string'; }),
      'MCQ options are sent as plain strings', mcq.Options);
    ok(mcq.CorrectAnswer === '4', 'the MCQ correct answer (read live from the combo) is in the payload');
    ok(likert.QuestionType === 'Likert' && Array.isArray(likert.Options) && likert.Options.every(function (o) { return typeof o === 'string'; }),
      'Likert options are sent as plain strings too', likert.Options);
    ok(mostLeast.QuestionType === 'MostLeast' && Array.isArray(mostLeast.Options) &&
       mostLeast.Options.every(function (o) { return o && typeof o === 'object' && 'text' in o && 'trait' in o; }),
      'MostLeast options are sent as {text,trait} objects', mostLeast.Options);
    ok(mostLeast.Options[0].trait === 'Leadership' && mostLeast.Options[1].trait === 'Compliance',
      'the per-statement traits ride along correctly');
  }
}

/* ── 3. VIEW mode — every input disabled/read-only when attempts > 0 ──────── */
async function testView() {
  console.log('\nCompany_Assessment_AssessmentForm.html — view mode (attempts > 0)\n');
  const sb = bootPage({
    page: 'Company_Assessment_AssessmentForm.html',
    containers: ['ac-root'],
    isSuperAdmin: true,
    pageParams: { id: 'a1', sessionToken: 'TEST-TOKEN' },
    scriptlets: { PAGE_PARAMS: JSON.stringify({ id: 'a1', sessionToken: 'TEST-TOKEN' }) },
    call: function (action, data) {
      if (action === 'get_ac_assessment') {
        return {
          status: 'success', attempts: 3,
          assessment: { AssessmentID: 'a1', Title: XSS, Category: 'Technical', Description: 'desc', TimeLimitMinutes: 20, PassScore: 60, IsActive: true },
          questions: [
            { QuestionID: 'q1', QuestionText: 'Q1?', QuestionType: 'MCQ', Weight: 10, Trait: '', CorrectAnswer: 'A', Options: [{ text: 'A' }, { text: 'B' }] }
          ]
        };
      }
      return { status: 'success' };
    }
  });

  /* This page reads `params` (URLSearchParams over location.search), not
     PAGE_PARAMS, for ?id= — set it on the stubbed location before booting. */
  sb.location.search = '?id=a1&sessionToken=TEST-TOKEN';
  sb.params = new sb.URLSearchParams(sb.location.search);

  sb.renderApp();
  await flush(); await flush();

  ok(sb.state.mode === 'view', 'an ?id= in the URL -> view mode');
  const html = sb.html('ac-form-content');
  ok(html.indexOf('<input') === -1 && html.indexOf('<textarea') === -1 && html.indexOf('<select') === -1,
    'view mode renders NO input/textarea/select at all — every field is plain read-only markup');
  ok(html.indexOf(XSS) === -1 && html.indexOf('&lt;img') !== -1,
    'the malicious title is escaped in view mode too');
  ok(html.indexOf('نسخة جديدة') !== -1, 'the نسخة جديدة action is present for a super admin');
  ok(html.indexOf('حفظ') === -1, 'there is no save button in view mode — there is nothing to submit to');
}

/* ── 4. .form-grid used, no inline grid-template-columns (F4a) ────────────── */
function testFormGrid() {
  console.log('\n.form-grid usage (F4a)\n');
  ['Company_Assessment_Assessments.html', 'Company_Assessment_AssessmentForm.html'].forEach(function (f) {
    const src = S.read(f);
    ok(/class="form-grid"/.test(src) || f.indexOf('Assessments.html') !== -1,
      f + ' uses the shared .form-grid class where it lays out a field grid');
    ok(!/grid-template-columns\s*:/.test(src), f + ' has no inline grid-template-columns override');
  });
}

(async function () {
  await testList();
  await testCreate();
  await testView();
  testFormGrid();

  console.log('');
  if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
  console.log('ac3_authoring: all assertions pass.');
})();
