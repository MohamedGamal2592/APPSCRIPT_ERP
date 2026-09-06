/**
 * ac2_scoring.js — §5.4 scoring engine (acScore_), the OptionsJSON parser
 * (acParseOptions_/D-18), the candidate projection (acPublicAssessment_/G-09)
 * and the date/bool normalisers (acDate_/acBool_, T-7).
 *
 *   node tools/verify/ac2_scoring.js
 *
 * Company_Assessment_Actions.js is loaded for real into a bare vm context —
 * these functions are pure (no SpreadsheetApp/LockService/CacheService), so
 * the file's top-level code runs with no Apps Script stubs at all. Only
 * acScore_/acPublicAssessment_/acParseOptions_/acDate_/acBool_ are exercised
 * here; the write path (acInsert_/acUpdate_) has its own harness because it
 * genuinely needs a stubbed sheet — see ac4_write_contract.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

const src = fs.readFileSync(path.join(ROOT, 'Company_Assessment_Actions.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'Company_Assessment_Actions.js' });
const AC = vm.runInContext('AssessmentCenter', sandbox);

/* acDate_ builds its Date objects inside the vm's own realm, so a plain
   `instanceof Date` in THIS script's realm would always be false regardless
   of correctness — the tag check below is realm-independent. */
function isValidDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + JSON.stringify(extra) : ''));
}

console.log('acScore_ / acParseOptions_ / acPublicAssessment_ / acDate_ / acBool_\n');

/* ── 0. sanity: every function under test is actually exported ───────────── */
['acScore_', 'acPublicAssessment_', 'acParseOptions_', 'acDate_', 'acStamp_', 'acBool_', 'acJson_']
  .forEach(function (name) { ok(typeof AC[name] === 'function', 'AssessmentCenter.' + name + ' is exported'); });

/* ── 1. acParseOptions_ — strings, {text,trait} objects, mixed ────────────── */
(function () {
  console.log('\nacParseOptions_ (D-18)\n');
  const strings = AC.acParseOptions_('["A","B"]');
  ok(strings.length === 2 && strings[0].text === 'A' && strings[0].trait === '', 'plain strings parse to {text, trait:""}');

  const objs = AC.acParseOptions_('[{"text":"يقود الفرق","trait":"Leadership"},{"text":"يخاطر","trait":"Risk"}]');
  ok(objs.length === 2 && objs[0].text === 'يقود الفرق' && objs[0].trait === 'Leadership', 'objects keep their per-statement trait');

  const mixed = AC.acParseOptions_('["plain",{"text":"with trait","trait":"X"}]');
  ok(mixed[0].trait === '' && mixed[1].trait === 'X', 'a mixed array parses both shapes in the same call');

  ok(AC.acParseOptions_('not json').length === 0, 'malformed JSON parses to an empty array, never throws');
  ok(AC.acParseOptions_('').length === 0, 'blank OptionsJSON parses to an empty array');
})();

/* ── 2. acDate_ — the three input shapes (T-7) ─────────────────────────────── */
(function () {
  console.log('\nacDate_ — Date / ISO / standalone string (T-7)\n');
  const fromDate = AC.acDate_(new Date(2026, 0, 15, 10, 30, 0));
  ok(isValidDate(fromDate) && fromDate.getFullYear() === 2026, 'a real Date object passes through');

  const fromPlain = AC.acDate_('2026-08-05 08:15:00');
  ok(isValidDate(fromPlain) && fromPlain.getFullYear() === 2026 && fromPlain.getMonth() === 7 &&
     fromPlain.getDate() === 5 && fromPlain.getHours() === 8 && fromPlain.getMinutes() === 15,
     'the standalone\'s "yyyy-MM-dd HH:mm:ss" string parses as LOCAL components, not UTC-shifted', fromPlain);

  const fromIso = AC.acDate_('2026-08-05T08:15:00.000Z');
  ok(isValidDate(fromIso), 'an ISO string parses too');

  ok(AC.acDate_('') === null && AC.acDate_(null) === null && AC.acDate_(undefined) === null,
    'blank/null/undefined all normalise to null, never throw');
  ok(AC.acDate_('not a date') === null, 'garbage input normalises to null rather than "Invalid Date"');
})();

/* ── 3. acBool_ — five inputs ───────────────────────────────────────────────── */
(function () {
  console.log('\nacBool_ — true / \'true\' / \'TRUE\' / 1 / \'1\' (T-7)\n');
  ok(AC.acBool_(true) === true, 'boolean true -> true');
  ok(AC.acBool_('true') === true, "'true' -> true");
  ok(AC.acBool_('TRUE') === true, "'TRUE' -> true (case-insensitive)");
  ok(AC.acBool_(1) === true, '1 -> true');
  ok(AC.acBool_('1') === true, "'1' -> true");
  ok(AC.acBool_(false) === false && AC.acBool_('false') === false && AC.acBool_('') === false &&
     AC.acBool_(0) === false && AC.acBool_(null) === false && AC.acBool_(undefined) === false,
     'false/\'false\'/\'\'/0/null/undefined all -> false');
})();

/* ── 4. acScore_ — the §5.4 table, over the mixed fixture ─────────────────── */
(function () {
  console.log('\nacScore_ — the §5.4 table (mixed MCQ/Likert/MostLeast/OpenText)\n');
  const fx = loadFixture('ac_assessment_mixed.json');
  const a = fx.assessment, qs = fx.questions;

  /* MCQ correct, case-folded and trimmed against CorrectAnswer='4'. */
  const responsesUngraded = [
    { QuestionID: 'q1', Answer: ' 4 ' },                                       // MCQ, padded — still correct
    { QuestionID: 'q2', Answer: '4' },                                         // Likert value 4
    { QuestionID: 'q3', Answer: JSON.stringify({ most: 'يقود الفرق', least: 'يلتزم بالقواعد' }) },
    { QuestionID: 'q4', Answer: 'a long free-text answer', Score: '' }          // OpenText, ungraded
  ];
  const r1 = AC.acScore_(a, qs, responsesUngraded, []);

  ok(r1.score === 10 && r1.max === 10, 'MCQ alone counts toward score/max while OpenText is ungraded', r1);
  ok(r1.verdict === 'Pending', 'verdict is Pending while any OpenText item is ungraded', r1.verdict);
  ok(r1.traits.Extraversion && r1.traits.Extraversion.raw === 8 && r1.traits.Extraversion.max === 10,
    'Likert contributes value(4) x Weight(2) = 8 to its trait, out of a 5x weight=10 max', r1.traits.Extraversion);
  ok(r1.traits.Leadership && r1.traits.Leadership.raw === 5, 'MostLeast "most" adds +Weight to the most statement\'s trait', r1.traits.Leadership);
  ok(r1.traits.Compliance && r1.traits.Compliance.raw === -5, 'MostLeast "least" adds -Weight to the least statement\'s trait', r1.traits.Compliance);
  ok(r1.traits.Risk === undefined, 'the unselected third MostLeast statement contributes nothing');
  const mcqItem = r1.items.filter(function (i) { return i.QuestionID === 'q1'; })[0];
  ok(mcqItem.Counts === true, 'MCQ item is flagged as counting toward pass/fail');
  const likertItem = r1.items.filter(function (i) { return i.QuestionID === 'q2'; })[0];
  ok(likertItem.Counts === false, 'Likert item is flagged as NOT counting toward pass/fail');
  const mlItem = r1.items.filter(function (i) { return i.QuestionID === 'q3'; })[0];
  ok(mlItem.Counts === false, 'MostLeast item is flagged as NOT counting toward pass/fail');

  /* MCQ case-fold: CorrectAnswer '4', answer 'FOUR'-shaped test via a second
     fixture question is unnecessary — case-fold is proven directly: */
  ok(AC.acScore_(a, [qs[0]], [{ QuestionID: 'q1', Answer: '  4  ' }], []).score === 10,
    'MCQ answer is trimmed before comparison');
  ok(AC.acScore_({ PassScore: 0 }, [Object.assign({}, qs[0], { CorrectAnswer: 'YES' })], [{ QuestionID: 'q1', Answer: 'yes' }], []).score === 10,
    'MCQ comparison is case-folded (CorrectAnswer "YES" matches answer "yes")');

  /* Now grade the OpenText item -> verdict resolves. */
  const responsesGraded = responsesUngraded.map(function (r) {
    return r.QuestionID === 'q4' ? Object.assign({}, r, { Score: 6 }) : r;
  });
  const r2 = AC.acScore_(a, qs, responsesGraded, []);
  ok(r2.score === 16 && r2.max === 18, 'once graded, OpenText joins the denominator (10 MCQ + 6/8 OpenText)', r2);
  ok(r2.verdict === 'Pass', '16/18 = 88.9% >= PassScore 60 -> Pass', r2.verdict);

  /* OpenText grade is clamped to [0, Weight]. */
  const overGraded = responsesUngraded.map(function (r) {
    return r.QuestionID === 'q4' ? Object.assign({}, r, { Score: 999 }) : r;
  });
  const r3 = AC.acScore_(a, qs, overGraded, []);
  const openItem = r3.items.filter(function (i) { return i.QuestionID === 'q4'; })[0];
  ok(openItem.Score === 8, 'a grade above Weight is clamped to Weight (8)', openItem);
})();

/* ── 5. Legacy blank Score, re-derived on read, never written back ────────── */
(function () {
  console.log('\nlegacy blank Score on an auto-gradable item (G-01/R-5)\n');
  const q = { QuestionID: 'x', QuestionType: 'MCQ', Weight: 10, CorrectAnswer: '4' };
  const rBlank = { QuestionID: 'x', Answer: '4', Score: '' };
  const r = AC.acScore_({ PassScore: 50 }, [q], [rBlank], []);
  ok(r.score === 10, 'a blank Score is re-derived from CorrectAnswer/Answer', r);
  ok(rBlank.Score === '', 'the input response object is never mutated — nothing is "written back"', rBlank);
})();

/* ── 6. Pass boundary — exactly PassScore ──────────────────────────────────── */
(function () {
  console.log('\npass boundary — exactly PassScore, both sides\n');
  const q = { QuestionID: 'b', QuestionType: 'OpenText', Weight: 10 };
  const exact = AC.acScore_({ PassScore: 60 }, [q], [{ QuestionID: 'b', Score: 6 }], []);
  ok(exact.verdict === 'Pass', '6/10 = exactly 60% with PassScore 60 -> Pass (boundary is inclusive)', exact);
  const justUnder = AC.acScore_({ PassScore: 60 }, [q], [{ QuestionID: 'b', Score: 5.9 }], []);
  ok(justUnder.verdict === 'Fail', '5.9/10 = 59% with PassScore 60 -> Fail', justUnder);
})();

/* ── 7. N/A — a pure psychometric with no gradable items ──────────────────── */
(function () {
  console.log('\nN/A verdict — a pure psychometric (no MCQ/OpenText at all)\n');
  const qs = [
    { QuestionID: 'l1', QuestionType: 'Likert', Weight: 2, Trait: 'X' },
    { QuestionID: 'l2', QuestionType: 'MostLeast', Weight: 3, OptionsJSON: '["a","b"]', Trait: 'Y' }
  ];
  const responses = [
    { QuestionID: 'l1', Answer: '3' },
    { QuestionID: 'l2', Answer: JSON.stringify({ most: 'a', least: 'b' }) }
  ];
  const r = AC.acScore_({ PassScore: 50 }, qs, responses, []);
  ok(r.verdict === 'N/A', 'no MCQ/OpenText anywhere -> N/A, not Pending or Fail', r.verdict);
  ok(r.max === 0 && r.score === 0, 'score/max both stay 0 — nothing is gradable');
})();

/* ── 8. MostLeast with LEGACY plain-string options (D-19) ─────────────────── */
(function () {
  console.log('\nMostLeast — legacy plain-string OptionsJSON falls back to the question-level Trait (D-19)\n');
  const fx = loadFixture('ac_standalone_legacy.json');
  const q = fx.questions[1]; // lq2, MostLeast, OptionsJSON is a plain string array, Trait: 'Conscientiousness'
  const resp = fx.responses[1]; // {"most":"Plans ahead","least":"Improvises"}
  const r = AC.acScore_(fx.assessment, [q], [resp], []);
  // Both statements fall back to the SAME question-level trait (there is no
  // per-statement trait to tell them apart), so +Weight and -Weight land on
  // the identical bucket and net to zero — an honest consequence of the
  // legacy schema's coarseness, not a bug: the achievable range (max) still
  // grows by both contributions, so the trait is visibly "touched" (max=2x
  // Weight) even though this one answer alone cannot move it net either way.
  ok(r.traits.Conscientiousness !== undefined, 'the fallback trait is still touched (present in the profile)', r.traits);
  ok(r.traits.Conscientiousness && r.traits.Conscientiousness.raw === 0 && r.traits.Conscientiousness.max === 2 * q.Weight,
    'most(+W) and least(-W) both fall back to the one question-level trait and net to zero, with max reflecting both', r.traits);
})();

/* ── 9. acPublicAssessment_ — payload hygiene (G-09) ───────────────────────── */
(function () {
  console.log('\nacPublicAssessment_ — the candidate never sees the answer key (G-09)\n');
  const fx = loadFixture('ac_assessment_mixed.json');
  const proj = AC.acPublicAssessment_(fx.assessment, fx.questions);
  const dump = JSON.stringify(proj);
  ['CorrectAnswer', 'Weight', 'Trait', 'UserID', 'CreatedAt'].forEach(function (field) {
    ok(dump.indexOf(field) === -1, 'the projection never mentions "' + field + '"');
  });
  ok(dump.indexOf('Leadership') === -1 && dump.indexOf('Compliance') === -1,
    'per-statement MostLeast traits are stripped from every option too');
  ok(proj.questions.length === fx.questions.length, 'every question is still present');
  ok(proj.questions[0].Options.every(function (o) { return Object.keys(o).length === 1 && 'text' in o; }),
    'every option on the wire is exactly { text }, nothing else');
  ok(proj.questions.map(function (q) { return q.OrderIndex; }).every(function (v, i, arr) { return i === 0 || arr[i - 1] <= v; }),
    'questions are returned in OrderIndex order');
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('ac2_scoring: all assertions pass.');
