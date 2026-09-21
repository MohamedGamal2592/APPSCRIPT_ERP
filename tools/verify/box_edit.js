/**
 * Box analysis — the edit path (BOX_ANALYSIS_PLAN.md §8.5).
 *
 *   node tools/verify/box_edit.js
 *
 * This is the only part of the feature that WRITES, so it gets the most
 * suspicious test. Three things are checked, in order of how badly they would
 * hurt:
 *
 *   1. The allowlist. Not "does the validator reject bad values" but "is
 *      created_at refusable at all" — a page that audits tampering must not be
 *      able to edit the timestamps its rules run on.
 *   2. Every validator, with its REJECTION cases, not only its happy path. A
 *      validator that accepts everything passes a happy-path test perfectly.
 *   3. The order of operations in the write wrapper: the audit intent line is
 *      written BEFORE the UPDATE. If Drive is unavailable the edit must not
 *      happen at all.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'Company_TopChemical_Actions.js'));
const read = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };

const PAGE = read('Company_TopChemical_BoxAnalysis.html');
const ACTIONS = read('Company_TopChemical_Actions.js');
const CONNECTOR = read('Company_TopChemical_Actions.js');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) return true;
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}
/** Asserts the call throws, and that the message is Arabic (the user sees it). */
function rejects(col, value, label) {
  let threw = null;
  try { E.validateColumn(col, value); } catch (e) { threw = e; }
  if (!threw) return ok(false, 'REJECT ' + label, 'accepted ' + JSON.stringify(value));
  return ok(/[\u0600-\u06FF]/.test(threw.message),
    'REJECT ' + label + ' → "' + threw.message + '"', 'message is not Arabic');
}
function accepts(col, value, want, label) {
  let got, threw = null;
  try { got = E.validateColumn(col, value); } catch (e) { threw = e; }
  if (threw) return ok(false, 'ACCEPT ' + label, 'threw: ' + threw.message);
  return ok(got === want, 'ACCEPT ' + label + ' → ' + JSON.stringify(want), JSON.stringify(got));
}

/* ── 1. The allowlist, and what is deliberately outside it ───────────────── */
console.log('the allowlist');
['id', 'created_at', 'updated_at'].forEach(function (col) {
  ok(!E.isEditableColumn(col), col + ' is NOT editable');
  rejects(col, '2020-01-01', col + ' cannot be written even directly');
});
ok(E.LOCKED_COLUMNS.created_at.indexOf('دليل') !== -1,
  'the refusal for created_at says WHY — it is audit evidence',
  E.LOCKED_COLUMNS.created_at);

/* An unknown column must be refused, not silently ignored: silently ignoring
   it would let a client believe it had changed something it had not. */
rejects('drop_table', 'x', 'an unknown column');
rejects('`id`', '1', 'a backtick-quoted column name');
rejects('transaction_amount; DROP', '1', 'a column name carrying SQL');

/* ── 2. Every validator, accept AND reject ───────────────────────────────── */
console.log('\ntransaction_date');
accepts('transaction_date', '2026-08-14', '2026-08-14', 'a real date');
accepts('transaction_date', '  2026-08-14  ', '2026-08-14', 'trimmed');
rejects('transaction_date', '2026-02-31', '31 February — right shape, not a day');
rejects('transaction_date', '2026-13-01', 'month 13');
rejects('transaction_date', '14/08/2026', 'the wrong format');
rejects('transaction_date', '2026-8-4', 'unpadded');
rejects('transaction_date', '', 'empty');

console.log('\ntransaction_details — the varchar(255) cap');
accepts('transaction_details', 'أ'.repeat(255), 'أ'.repeat(255), 'exactly 255 characters');
rejects('transaction_details', 'أ'.repeat(256), '256 characters');
accepts('transaction_details', '', '', 'empty is allowed — a movement may carry no description');
(function () {
  let msg = '';
  try { E.validateColumn('transaction_details', 'x'.repeat(300)); } catch (e) { msg = e.message; }
  ok(msg.indexOf('300') !== -1 && msg.indexOf('255') !== -1,
    'the message names BOTH the limit and what was entered', msg);
  ok(/تقتطع/.test(msg),
    'and says why it matters — MySQL would truncate silently', msg);
})();

console.log('\ntransaction_amount — double(16,2)');
accepts('transaction_amount', '725.00', 725, 'two decimals');
accepts('transaction_amount', '725', 725, 'no decimals');
accepts('transaction_amount', '-40.5', -40.5, 'negative, one decimal');
rejects('transaction_amount', '725.005', 'three decimals');
rejects('transaction_amount', '1e5', 'exponent notation');
rejects('transaction_amount', 'abc', 'not a number');
rejects('transaction_amount', '', 'empty');
rejects('transaction_amount', '999999999999999.99', 'wider than double(16,2)');
accepts('transaction_amount', '99999999999999.99', 99999999999999.99, 'the largest value that fits');

console.log('\ntransaction_type — enum membership');
accepts('transaction_type', 'credit', 'credit', 'credit');
accepts('transaction_type', 'debit', 'debit', 'debit');
rejects('transaction_type', 'CREDIT', 'wrong case — the enum is exact');
rejects('transaction_type', 'منصرف', 'the Arabic label rather than the value');
rejects('transaction_type', '', 'empty');

console.log('\nchart_of_accounts — digits only');
accepts('chart_of_accounts', '310500', '310500', 'a code');
rejects('chart_of_accounts', '3105 00', 'an embedded space');
rejects('chart_of_accounts', '31A500', 'a letter');
rejects('chart_of_accounts', '-310500', 'a sign');
rejects('chart_of_accounts', '', 'empty');

console.log('\nintegers and nullable integers');
accepts('box_code', '3', '3', 'box_code is required');
rejects('box_code', '', 'box_code cannot be blank');
rejects('box_code', '3.5', 'not an integer');
accepts('client_id', '', null, 'an empty nullable id becomes NULL');
accepts('client_id', '77', '77', 'a nullable id keeps its digits');
rejects('client_id', 'abc', 'a non-numeric nullable id');
rejects('user_id', '99999999999', 'user_id is int, not bigint — out of range');
accepts('user_id', '2147483647', '2147483647', 'the largest int');

console.log('\nis_revised');
accepts('is_revised', '1', 1, '1 becomes a number');
accepts('is_revised', '0', 0, '0 becomes a number');
rejects('is_revised', 'true', 'a boolean word');
rejects('is_revised', '2', 'out of range');

/* Bigints stay strings — routing a 19-digit id through a JS float would lose
   precision, and the value bound would silently not be the value entered. */
console.log('\nbigint precision');
accepts('box_code', '9007199254740993', '9007199254740993',
  'a bigint beyond Number.MAX_SAFE_INTEGER survives as a string');
ok(typeof E.validateColumn('box_code', '9007199254740993') === 'string',
  'bigints are never coerced to Number');

/* ── 3. validateChanges ──────────────────────────────────────────────────── */
console.log('\nvalidateChanges');
(function () {
  const r = E.validateChanges({ transaction_amount: '900', transaction_date: '2026-08-14' });
  ok(r.columns.join(',') === 'transaction_amount,transaction_date',
    'columns come back sorted, so the SET clause and the audit are deterministic', r.columns.join(','));
  ok(r.values.transaction_amount === 900, 'values are coerced, not passed through raw');
})();
let threw = false;
try { E.validateChanges({}); } catch (e) { threw = true; }
ok(threw, 'an EMPTY change set is refused — it would move updated_at for nothing');
threw = false;
try { E.validateChanges({ created_at: '2020-01-01' }); } catch (e) { threw = true; }
ok(threw, 'a change set touching created_at is refused');

/* ── 4. diffChanges — only what actually changed ─────────────────────────── */
console.log('\ndiffChanges');
const ROW = {
  id: '4213', transaction_date: '2026-08-14', transaction_amount: '725.00',
  transaction_details: 'x', chart_of_accounts: '310500', created_at: '2026-08-14 09:12:03'
};
(function () {
  const d = E.diffChanges(ROW, { transaction_amount: '900', transaction_date: '2026-08-14' });
  ok(Object.keys(d).join(',') === 'transaction_amount', 'only the changed column is sent', Object.keys(d).join(','));
})();
(function () {
  const d = E.diffChanges(ROW, { transaction_amount: '725' });
  ok(Object.keys(d).length === 0,
    '725 over 725.00 is NOT a change — money compares by value, not by spelling');
})();
(function () {
  const d = E.diffChanges(ROW, { transaction_amount: '725.000' });
  ok(Object.keys(d).length === 0, 'nor is 725.000');
})();
(function () {
  const d = E.diffChanges(ROW, { created_at: '2020-01-01', id: '9' });
  ok(Object.keys(d).length === 0, 'non-editable columns never reach the change set');
})();
(function () {
  const d = E.diffChanges(ROW, { transaction_details: '  x  ' });
  ok(Object.keys(d).length === 0, 'whitespace-only differences are not changes');
})();

/* ── 5. The 300000–400000 boundary warning ───────────────────────────────── */
console.log('\ncrossesItemBoundary');
ok(E.inItemRange('310500') === true, '310500 is in range');
ok(E.inItemRange('299999') === false, '299999 is below');
ok(E.inItemRange('400001') === false, '400001 is above');
ok(E.inItemRange('300000') === true, 'the lower bound is inclusive');
ok(E.inItemRange('400000') === true, 'the upper bound is inclusive');
ok(E.inItemRange('abc') === false, 'a non-numeric code is not in range');
ok(E.crossesItemBoundary('310500', '320000') === null, 'in → in does not warn');
ok(E.crossesItemBoundary('210500', '220000') === null, 'out → out does not warn');
(function () {
  const c = E.crossesItemBoundary('210500', '310500');
  ok(c && c.to_in_range === true && /[\u0600-\u06FF]/.test(c.reason_ar),
    'out → in warns, in Arabic', c && c.reason_ar);
})();
(function () {
  const c = E.crossesItemBoundary('310500', '210500');
  ok(c && c.to_in_range === false, 'in → out warns');
})();

/* ── 6. The page's form and the engine's allowlist cannot drift ───────────
 * The engine is a server file the page cannot reach, so the form's column list
 * is an unavoidable second copy. Two lists that drift is how a column ends up
 * editable in the form and rejected by the server — or, far worse, the other
 * way round. */
console.log('\nthe page form matches the engine allowlist');
const fm = PAGE.match(/var EDIT_FIELDS = (\[[\s\S]*?\n  \]);/);
ok(!!fm, 'EDIT_FIELDS is found in the page');
if (fm) {
  const fields = Function('return (' + fm[1] + ');')();
  const pageCols = fields.map(function (f) { return f.col; }).sort();
  const engineCols = Object.keys(E.EDITABLE_COLUMNS).sort();
  ok(pageCols.join(',') === engineCols.join(','),
    'the form offers exactly the columns the server will accept',
    '\n      page:   ' + pageCols.join(',') + '\n      engine: ' + engineCols.join(','));
  ['id', 'created_at', 'updated_at'].forEach(function (c) {
    ok(pageCols.indexOf(c) === -1, 'the form has no field for ' + c);
  });
  const cap = fields.filter(function (f) { return f.col === 'transaction_details'; })[0];
  ok(cap && cap.max === 255, 'the form enforces the varchar(255) cap client-side too', cap && cap.max);
}

/* ── 7. The confirmation NAMES the change ────────────────────────────────── */
console.log('\nthe confirmation');
ok(PAGE.indexOf('UIC.confirm({') !== -1, 'the save goes through UIC.confirm');
ok(/record: 'حركة رقم ' \+ row\.id \+ ' — ' \+ \(row\.transaction_date/.test(PAGE),
  'the dialog NAMES the record — "حركة رقم 4213 — 2026-08-14", not "هل أنت متأكد؟"');
ok(/detail: details\.join\('\\n'\)/.test(PAGE), 'one detail line per changed column');
ok(/details\.push\(f\.label \+ ': ' \+ displayValue\(f\.col, b\) \+ ' ← ' \+ displayValue\(f\.col, a\)\)/.test(PAGE),
  'each line reads "العمود: جديد ← قديم"');
ok(PAGE.indexOf(".uic-confirm-detail { white-space: pre-line; }") !== -1,
  'the page makes those lines actually render as lines');
ok(/confirmText: 'تأكيد التعديل'/.test(PAGE), 'the confirm button says what it will do');

/* The Promise shape is not cosmetic: written as a blocking `if`, the save would
   fire before the user answered. */
ok(/\}\)\.then\(function \(okd\) \{\s*\n\s*if \(!okd\) return;/.test(PAGE),
  'the save is restructured around .then, and a "no" returns without doing anything');
const saveFn = PAGE.slice(PAGE.indexOf('function saveEdit('), PAGE.indexOf('function inRange('));
const callIdx = saveFn.indexOf("companyCall('update_box_movement'");
const thenIdx = saveFn.indexOf('.then(function (okd)');
ok(callIdx > thenIdx && thenIdx !== -1,
  'the action is called INSIDE the confirmation callback, never before it');
ok(saveFn.indexOf('id: row.id, changes: changes') !== -1,
  'only the changed columns are sent');

/* ── 8. The audit is written BEFORE the row changes ──────────────────────── */
console.log('\nthe audit trail');
const upd = ACTIONS.slice(ACTIONS.indexOf('function updateBoxMovement_'),
  ACTIONS.indexOf('function reviseBoxMovement_'));
ok(upd.length > 0, 'updateBoxMovement_ is found');
const iIntent = upd.indexOf("phase: 'intent'");
const iWrite = upd.indexOf('dbBoxUpdate_(');
const iApplied = upd.indexOf("phase: 'applied'");
ok(iIntent !== -1 && iWrite !== -1 && iApplied !== -1, 'all three steps are present');
ok(iIntent < iWrite,
  'the audit INTENT line is written before the UPDATE — if Drive is down, the edit does not happen');
ok(iWrite < iApplied, 'the applied line is written after the UPDATE, with before/after values');
ok(/boxAuditAppend_\(\[\{\s*\n\s*edit_id: editId, phase: 'intent'/.test(upd),
  'the intent write is NOT wrapped in a try/catch that would swallow it');
ok(upd.indexOf('audit_error') !== -1,
  'a failed applied-line write is reported back rather than reported as a clean save');
ok(PAGE.indexOf('r.audit_error') !== -1 && PAGE.indexOf('سجل التدقيق لم يكتمل') !== -1,
  'and the page says so prominently instead of showing a success toast');

const rev = ACTIONS.slice(ACTIONS.indexOf('function reviseBoxMovement_'),
  ACTIONS.indexOf("register('get_box_analysis'"));
ok(rev.indexOf("phase: 'intent'") < rev.indexOf('dbBoxRevise_('),
  'the review flip is audited on the same path, and in the same order');

/* Every audit entry carries the fields the plan asks for. */
['edit_id', 'when', 'user', 'movement_id'].forEach(function (f) {
  ok(upd.indexOf(f + ':') !== -1, 'the audit entry carries ' + f);
});
ok(/column: c, old: res\.before/.test(upd),
  'the applied entry carries {column, old, new} per changed column');
ok(ACTIONS.indexOf('executeWithLock_(function () {') !== -1 &&
   ACTIONS.indexOf('boxAuditAppend_') !== -1,
  'the append is serialized — Drive has no append primitive, so two concurrent edits would lose one');
ok(/const BOX_AUDIT_FOLDER = 'Box_Analysis_Audit';/.test(ACTIONS),
  'the log lives in the Box_Analysis_Audit Drive folder');
ok(/\.ndjson/.test(ACTIONS), 'as NDJSON, one entry per line, append-only');

/* No schema was created for any of this. */
ok(!/CREATE TABLE|insertSheet\(/.test(upd + rev),
  'the audit path creates no table and no sheet tab');

/* ── 9. updated_at is the server's, always ───────────────────────────────── */
console.log('\nupdated_at');
ok(CONNECTOR.indexOf("setParts.push('`updated_at` = NOW()')") !== -1,
  'the server appends updated_at = NOW() to every SET list');
ok(!E.isEditableColumn('updated_at'),
  'and a client cannot supply it, so EDITED_AFTER_REVIEW cannot be defeated');

console.log(failures === 0
  ? '\nAll edit-path checks pass.'
  : '\n' + failures + ' edit-path check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
