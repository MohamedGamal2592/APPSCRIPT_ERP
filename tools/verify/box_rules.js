/**
 * Box analysis — the rules engine (BOX_ANALYSIS_PLAN.md §7).
 *
 *   node tools/verify/box_rules.js            asserts
 *   node tools/verify/box_rules.js --show     also prints every flag's Arabic reason
 *
 * THE ONE UNACCEPTABLE OUTCOME for this feature is a rule reported as working
 * that was never run against anything. So every rule here is executed, on rows
 * whose correct answer is known, and asserted BOTH ways: the cases that must
 * fire and the cases that must NOT. A rule that flags everything is not a
 * detector, and a happy-path test cannot tell the difference.
 *
 * Every row is synthetic. That is stated in the fixture file and it is stated
 * again here because it is the single most important caveat on this output:
 * these tests show the rules behave as specified. They say nothing about the
 * false-positive rate on production data, which nobody can measure without
 * database access.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'Box_Analysis_Engine.js'));
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'box_rows.json'), 'utf8'));

const SHOW = process.argv.indexOf('--show') !== -1;

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { if (SHOW) console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}

/* Rows get their parse from the REAL parser, never from a stored fixture, so a
   parser change cannot leave a stale rule expectation behind. */
function withParse(rows) {
  return rows.map(function (r) {
    const c = JSON.parse(JSON.stringify(r));
    c.parse = E.parseDetails(c.transaction_details);
    return c;
  });
}

const ROWS = withParse(FIX.rows);

/* The audit index the caller would build from the Drive NDJSON. */
const auditIndex = {};
(FIX.audit_entries || []).forEach(function (e) {
  if (e.phase !== 'applied') return;
  (auditIndex[String(e.movement_id)] = auditIndex[String(e.movement_id)] || []).push(e);
});

console.log('Tier 1 — ' + ROWS.length + ' synthetic rows in ' +
  Object.keys(FIX.rows.reduce(function (a, r) { a[r.group] = 1; return a; }, {})).length + ' scenario groups');

/* Rules INTERACT. A duplicate-pair fixture is also a row in the id/date
 * sequence; a row written to exercise ODD_HOUR is also a candidate for
 * NEAR_DUP. Running everything as one set produced five failures on the first
 * run, and only two of them were bugs — the rest were fixtures tripping each
 * other. So the engine runs once PER GROUP, which is what makes a per-row
 * expectation mean anything. */
const GROUPS = {};
ROWS.forEach(function (r) { (GROUPS[r.group] = GROUPS[r.group] || []).push(r); });

const perGroup = {};
Object.keys(GROUPS).forEach(function (g) {
  perGroup[g] = E.runTier1(GROUPS[g], { auditIndex: auditIndex });
});

FIX.rows.forEach(function (spec) {
  const res = perGroup[spec.group];
  const got = (res.by_row[String(spec.id)] || []).map(function (f) { return f.rule_id; });
  (spec.expect || []).forEach(function (rid) {
    ok(got.indexOf(rid) !== -1, '[' + spec.group + '] row ' + spec.id + ' fires ' + rid, 'got [' + got.join(',') + ']');
  });
  (spec.must_not || []).forEach(function (rid) {
    ok(got.indexOf(rid) === -1, '[' + spec.group + '] row ' + spec.id + ' does NOT fire ' + rid, 'got [' + got.join(',') + ']');
  });
  /* A group fixture must not fire anything it did not declare, in either
     direction — an undeclared flag is either a bug or an expectation nobody
     wrote down, and both need looking at. */
  const declared = (spec.expect || []).concat(spec.must_not || []);
  got.forEach(function (rid) {
    ok(declared.indexOf(rid) !== -1,
      '[' + spec.group + '] row ' + spec.id + ' fires ' + rid + ', which the fixture never declared',
      'declare it in expect or must_not');
  });
});

/* One run over EVERYTHING, which asserts only that the engine survives a mixed
   set and that whatever it produces is explainable. Per-row expectations do not
   apply here, by design. */
const t1 = E.runTier1(ROWS, { auditIndex: auditIndex });

/* ── Every flag is explainable ───────────────────────────────────────────
 * A risk badge with nothing behind it does not survive an accountant asking
 * "why". Every flag must carry an Arabic sentence WITH NUMBERS IN IT and the
 * evidence rows to check it against. */
console.log('\nevery flag is explainable');
ok(t1.flags.length > 0, 'Tier 1 produced flags at all', t1.flags.length);
t1.flags.forEach(function (f) {
  ok(!!f.rule_id, 'flag has a rule_id');
  ok(['high', 'medium', 'low'].indexOf(f.severity) !== -1, f.rule_id + ' has a known severity', f.severity);
  ok(!!f.severity_ar, f.rule_id + ' severity has an Arabic label');
  ok(/[؀-ۿ]/.test(f.reason_ar), f.rule_id + ' reason is in Arabic', f.reason_ar);
  ok(f.reason_ar.length > 25, f.rule_id + ' reason is a sentence, not a label', f.reason_ar);
  ok(f.reason_ar.indexOf(f.rule_id) === -1,
    f.rule_id + ' reason does not just restate the rule id', f.reason_ar);
  ok(Array.isArray(f.evidence) && f.evidence.length > 0,
    f.rule_id + ' carries evidence rows', JSON.stringify(f.evidence));
  ok(f.evidence.every(function (e) { return e.row_id !== undefined; }),
    f.rule_id + ' every evidence entry names a row');
});

/* ── SUM_MISMATCH says BY HOW MUCH ──────────────────────────────────────── */
console.log('\nSUM_MISMATCH');
const sm = perGroup.sum.flags.filter(function (f) { return f.rule_id === 'SUM_MISMATCH'; });
ok(sm.length === 1, 'exactly one row mismatches', sm.length);
ok(sm[0].reason_ar.indexOf('375.00') !== -1,
  'the reason states the difference (375.00), not just that there is one', sm[0].reason_ar);
ok(sm[0].reason_ar.indexOf('2525.00') !== -1 && sm[0].reason_ar.indexOf('2900.00') !== -1,
  'and both figures being compared');
ok(sm[0].evidence[0].difference !== undefined, 'the evidence carries the numeric difference');

/* Rounding must not be a finding. */
(function () {
  const row = withParse([{ id: '9001', transaction_date: '2026-08-01',
    transaction_details: '1 كيلو زيت ب 100', transaction_amount: '100.50',
    created_at: '2026-08-03 10:00:00', updated_at: '2026-08-03 10:00:00', is_revised: '0' }])[0];
  ok(E.ruleSumMismatch(row) === null,
    'a difference of 0.50 is rounding on a double(16,2), not a discrepancy');
  const row2 = withParse([{ id: '9002', transaction_date: '2026-08-01',
    transaction_details: '1 كيلو زيت ب 100', transaction_amount: '102.00',
    created_at: '2026-08-03 10:00:00', updated_at: '2026-08-03 10:00:00', is_revised: '0' }])[0];
  ok(E.ruleSumMismatch(row2) !== null, 'a difference of 2.00 is');
})();

/* ── Pair rules flag BOTH rows ──────────────────────────────────────────── */
console.log('\npair rules');
[['EXACT_DUP', 'dup_exact'], ['NEAR_DUP', 'dup_near']].forEach(function (pair) {
  const rid = pair[0], grp = pair[1];
  const byRow = perGroup[grp].by_row;
  const rows = Object.keys(byRow).filter(function (id) {
    return byRow[id].some(function (f) { return f.rule_id === rid; });
  });
  if (!ok(rows.length === 2, rid + ' flags both rows of the pair, not one', rows.join(','))) return;
  const f = byRow[rows[0]].filter(function (x) { return x.rule_id === rid; })[0];
  ok(f.evidence.length === 2, rid + ' evidence names both rows');
});

/* ── EDITED_AFTER_REVIEW: the audit log is what makes this rule usable ──── */
console.log('\nEDITED_AFTER_REVIEW and the audit log');
const unexplained = (perGroup.edited.by_row['4501'] || []).filter(function (f) { return f.rule_id === 'EDITED_AFTER_REVIEW'; })[0];
const explained = (perGroup.edited.by_row['4502'] || []).filter(function (f) { return f.rule_id === 'EDITED_AFTER_REVIEW'; })[0];
ok(unexplained && unexplained.severity === 'high',
  'an edit with NO audit entry is HIGH severity', unexplained && unexplained.severity);
ok(unexplained && unexplained.reason_ar.indexOf('لا يوجد') !== -1,
  'and says there is no audit record for it', unexplained && unexplained.reason_ar);
ok(explained && explained.severity === 'low',
  'an edit the audit log explains is LOW severity — otherwise the page flags its own work',
  explained && explained.severity);
ok(explained && explained.reason_ar.indexOf('أحمد المراجع') !== -1,
  'and NAMES who made it', explained && explained.reason_ar);
ok(explained && explained.reason_ar.indexOf('المبلغ') !== -1,
  'and which column changed, by its Arabic label', explained && explained.reason_ar);

/* Same rows, no audit log at all: BOTH become high. This is the state the
   feature would permanently be in if the audit trail had been skipped. */
(function () {
  const noAudit = E.runTier1(GROUPS.edited, { auditIndex: {} });
  const f = (noAudit.by_row['4502'] || []).filter(function (x) { return x.rule_id === 'EDITED_AFTER_REVIEW'; })[0];
  ok(f && f.severity === 'high',
    'without the audit log, the page CANNOT tell its own edit from an outside change');
})();

/* ── Rules that need a population refuse to guess ────────────────────────── */
console.log('\ninsufficient data is an answer');
const backNote = perGroup.sum.notes.filter(function (n) { return n.rule_id === 'BACKDATED'; })[0];
ok(!!backNote && backNote.status === 'insufficient_data',
  'BACKDATED refuses to fire on ' + GROUPS.sum.length + ' rows — a p95 over 20 values is not a percentile');
ok(backNote && /[؀-ۿ]/.test(backNote.reason_ar), 'and says so in Arabic', backNote && backNote.reason_ar);
ok(t1.flags.filter(function (f) { return f.rule_id === 'BACKDATED'; }).length === 0,
  'and produced no BACKDATED flag at all');

/* Now give it a real population. RECIPE, stated so the result is reproducible:
   40 rows keyed 0–2 days after their transaction date (ordinary), plus one
   keyed 60 days late. The p95 of that population sits around 2, so only the
   outlier should be flagged. */
console.log('\nBACKDATED against a generated population');
console.log('  recipe: 40 rows with a 0–2 day lag + 1 row with a 60 day lag');
(function () {
  const pop = [];
  for (let i = 0; i < 40; i++) {
    const day = 1 + (i % 25);
    const lag = i % 3;
    pop.push({
      id: String(6000 + i), transaction_date: '2026-06-' + (day < 10 ? '0' : '') + day,
      transaction_details: '1 كيلو زيت ب 60', transaction_amount: '60.00',
      chart_of_accounts: '311100', responsible_person: 'عامل ' + (i % 4), box_code: '1',
      created_at: '2026-06-' + (day + lag < 10 ? '0' : '') + (day + lag) + ' 10:00:00',
      updated_at: '2026-06-' + (day + lag < 10 ? '0' : '') + (day + lag) + ' 10:00:00',
      is_revised: '0'
    });
  }
  pop.push({
    id: '6999', transaction_date: '2026-04-01',
    transaction_details: '1 كيلو زيت ب 60', transaction_amount: '60.00',
    chart_of_accounts: '311100', responsible_person: 'عامل 0', box_code: '1',
    created_at: '2026-05-31 10:00:00', updated_at: '2026-05-31 10:00:00', is_revised: '0'
  });
  const r = E.ruleBackdated(withParse(pop), {});
  ok(r.note === null, 'with 41 rows the rule runs', r.note && r.note.reason_ar);
  const ids = r.flags.map(function (f) { return f.row_id; });
  ok(ids.length === 1 && ids[0] === '6999',
    'only the 60-day-late row is flagged, not the ordinary 0–2 day lags', ids.join(','));
  ok(r.flags[0].reason_ar.indexOf('60') !== -1, 'the reason states the lag', r.flags[0].reason_ar);
  ok(/95%/.test(r.flags[0].reason_ar),
    'and that the threshold came from this population, not from a number somebody picked',
    r.flags[0].reason_ar);
  if (SHOW) console.log('    ' + r.flags[0].reason_ar);
})();

/* ── STRUCTURING derives its thresholds from the histogram ───────────────── */
console.log('\nSTRUCTURING');
ok(t1.structuring && t1.structuring.thresholds.length === 0,
  'no threshold is detected in the base fixtures, so the rule does not run');
const structNote = t1.notes.filter(function (n) { return n.rule_id === 'STRUCTURING'; })[0];
ok(!!structNote && structNote.status === 'no_threshold_detected',
  'and it says why rather than falling back to an assumed limit');

console.log('  recipe: 30 rows piled in [4500,5000) + 2 rows above 5000, then one');
console.log('          person/account with 4800 + 4900 two days apart (sum 9700 > 5000)');
(function () {
  const pop = [];
  /* The spike: a real approval limit leaves a pile just under it and a hole
     just over it. 30 below, 2 above. */
  for (let i = 0; i < 30; i++) {
    const day = 1 + (i % 25);
    pop.push({
      id: String(7000 + i), transaction_date: '2026-06-' + (day < 10 ? '0' : '') + day,
      transaction_details: '1 كيلو زيت ب 60', transaction_amount: String(4500 + (i * 13) % 490),
      chart_of_accounts: '311200', responsible_person: 'عامل ' + (i % 6), box_code: '1',
      created_at: '2026-06-' + (day < 10 ? '0' : '') + day + ' 10:00:00',
      updated_at: '2026-06-' + (day < 10 ? '0' : '') + day + ' 10:00:00', is_revised: '0'
    });
  }
  pop.push({ id: '7900', transaction_date: '2026-06-10', transaction_details: 'x',
    transaction_amount: '5100.00', chart_of_accounts: '311200', responsible_person: 'عامل 9',
    box_code: '1', created_at: '2026-06-10 10:00:00', updated_at: '2026-06-10 10:00:00', is_revised: '0' });
  pop.push({ id: '7901', transaction_date: '2026-06-11', transaction_details: 'x',
    transaction_amount: '5200.00', chart_of_accounts: '311200', responsible_person: 'عامل 9',
    box_code: '1', created_at: '2026-06-11 10:00:00', updated_at: '2026-06-11 10:00:00', is_revised: '0' });
  /* The structured pair: same person, same account, two days apart, each just
     under 5000, summing to 9700. */
  pop.push({ id: '7950', transaction_date: '2026-07-01', transaction_details: 'مصنعية ورشة',
    transaction_amount: '4800.00', chart_of_accounts: '311200', responsible_person: 'وليد نبيل',
    box_code: '1', created_at: '2026-07-01 10:00:00', updated_at: '2026-07-01 10:00:00', is_revised: '0' });
  pop.push({ id: '7951', transaction_date: '2026-07-02', transaction_details: 'مصنعية ورشة اضافية',
    transaction_amount: '4900.00', chart_of_accounts: '311200', responsible_person: 'وليد نبيل',
    box_code: '1', created_at: '2026-07-02 10:00:00', updated_at: '2026-07-02 10:00:00', is_revised: '0' });

  const det = E.detectStructuringThresholds(pop, {});
  ok(det.thresholds.length >= 1, 'a threshold is detected from the amount histogram',
    JSON.stringify(det.thresholds));
  ok(det.thresholds.some(function (t) { return t.threshold === 5000; }),
    '...and it is 5000, the number the data actually piles up under',
    JSON.stringify(det.thresholds.map(function (t) { return t.threshold; })));
  console.log('  detected: ' + det.thresholds.map(function (t) {
    return t.threshold + ' (' + t.below + ' below vs ' + t.above + ' above, ratio ' + t.ratio + ')';
  }).join(', '));

  const r = E.ruleStructuring(withParse(pop), {});
  const ids = r.flags.map(function (f) { return f.row_id; }).sort();
  ok(ids.indexOf('7950') !== -1 && ids.indexOf('7951') !== -1,
    'the structured pair is flagged', ids.join(','));
  ok(r.flags.length > 0 && r.flags[0].reason_ar.indexOf('5000.00') !== -1,
    'the reason names the threshold', r.flags[0] && r.flags[0].reason_ar);
  ok(r.flags.length > 0 && r.flags[0].reason_ar.indexOf('مستنتج من البيانات') !== -1,
    'and states that the threshold was derived from the data, not assumed');
  if (SHOW && r.flags[0]) console.log('    ' + r.flags[0].reason_ar);

  /* The same pair with NO spike in the population must not be flagged: without
     an approval limit to structure around, two payments two days apart are just
     two payments. */
  const noSpike = [pop[pop.length - 2], pop[pop.length - 1]];
  const r2 = E.ruleStructuring(withParse(noSpike), {});
  ok(r2.flags.length === 0,
    'with no histogram spike, the same two rows are NOT flagged — the rule refuses to invent a limit');
})();

/* ── OUT_OF_SEQUENCE is honest about its scope ──────────────────────────── */
console.log('\nOUT_OF_SEQUENCE');
const seqNote = perGroup.sequence.notes.filter(function (n) { return n.rule_id === 'OUT_OF_SEQUENCE'; })[0];
ok(!!seqNote && /الفلاتر/.test(seqNote.reason_ar),
  'the engine tells the reader this rule only means something over a contiguous id range');

if (SHOW) {
  console.log('\n  every Tier 1 flag, as the page would render it:');
  t1.flags.forEach(function (f) {
    console.log('    [' + f.severity_ar + '] ' + f.rule_id + ' · حركة ' + f.row_id);
    console.log('      ' + f.reason_ar);
  });
  console.log('\n  notes (rules that did NOT run, and why):');
  t1.notes.forEach(function (n) { console.log('    ' + n.rule_id + ': ' + n.reason_ar); });
}

console.log(failures === 0
  ? '\nAll Tier 1 rule checks pass.'
  : '\n' + failures + ' rule check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
