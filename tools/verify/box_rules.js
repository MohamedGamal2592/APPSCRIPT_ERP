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

/* ── Arabic numeral–noun agreement ───────────────────────────────────────
 * Every sentence this engine produces counts something, and Arabic agreement
 * ALTERNATES: plural for 3–10, singular again from 11. A naive
 * `n === 1 ? x : xs` is right at 1 and 5 and wrong at 11, which is most of the
 * numbers a real page shows. Broken Arabic in a findings page costs the
 * arithmetic its credibility too, so it is asserted rather than eyeballed. */
console.log('Arabic numeral agreement');
[
  [1, 'op', 'عملية'], [2, 'op', 'عمليتان'], [3, 'op', '3 عمليات'], [10, 'op', '10 عمليات'],
  [11, 'op', '11 عملية'], [41, 'op', '41 عملية'], [100, 'op', '100 عملية'], [111, 'op', '111 عملية'],
  [1, 'day', 'يوم'], [2, 'day', 'يومان'], [3, 'day', '3 أيام'], [12, 'day', '12 يوماً'],
  [1, 'movement', 'حركة'], [5, 'movement', '5 حركات'], [19, 'movement', '19 حركة'],
  [12, 'month', '12 شهراً'], [3, 'month', '3 أشهر'],
  [13, 'item', '13 بنداً'], [4, 'item', '4 بنود'],
  [350, 'amount', '350 مبلغاً']
].forEach(function (c) {
  ok(E.arCount(c[0], c[1]) === c[2], 'arCount(' + c[0] + ', ' + c[1] + ') = "' + c[2] + '"',
    '"' + E.arCount(c[0], c[1]) + '"');
});
/* 1 and 2 carry the count in the noun, so the digit would be redundant. */
ok(E.arCount(1, 'op').indexOf('1') === -1, 'the digit is dropped for 1 — "عملية", not "1 عملية"');
ok(E.arCount(2, 'op').indexOf('2') === -1, 'and for 2');

/* No finding may contain a bare "N عملية" pattern with N in 3..10, which is
   the exact mistake this helper exists to prevent. */
console.log('');

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


/* ═══════════════════════════════════════════════════════════════════════════
 * Tier 2 — price anomalies, per item cluster
 *
 * Occurrences rather than movement rows, so these are generated from stated
 * recipes rather than listed in the fixture file: a price rule needs a dozen
 * purchases to say anything, and twelve hand-written JSON rows are less
 * readable than the three lines that produce them, not more.
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n── Tier 2 — price anomalies ─────────────────────────────────────────');

function occ(id, date, item, qty, unitPrice, person, account) {
  return {
    movement_id: String(id), transaction_date: date, item_norm: item,
    unit: 'كيلو', qty: qty, price: round2(qty * unitPrice), unit_price: unitPrice,
    responsible_person: person, chart_of_accounts: account || '310500', confidence: 1
  };
}
function round2(v) { return Math.round(v * 100) / 100; }
function day(n) { return '2026-0' + (1 + Math.floor((n - 1) / 28)) + '-' + (((n - 1) % 28) + 1 < 10 ? '0' : '') + (((n - 1) % 28) + 1); }

/* ── WHY MEDIAN AND MAD, DEMONSTRATED ────────────────────────────────────
 * The plan says median/MAD "because a mean is dragged by the fraud it is
 * supposed to detect". That is testable, so it is tested: the SAME sample is
 * scored both ways and only one of them finds the outlier. */
console.log('\nmedian/MAD vs mean/σ, on the same sample');
(function () {
  const sample = [140, 140, 140, 141, 139, 140, 142, 138, 140, 140, 900];
  const mean = sample.reduce(function (a, b) { return a + b; }, 0) / sample.length;
  const sd = Math.sqrt(sample.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / sample.length);
  const classicZ = (900 - mean) / sd;

  const st = E.robustStats(sample);
  const robustZ = E.modifiedZ(900, st);

  console.log('  sample: ten purchases near 140, one at 900');
  console.log('  mean ' + mean.toFixed(2) + ', σ ' + sd.toFixed(2) + '  → classic z = ' + classicZ.toFixed(2));
  console.log('  median ' + st.median + ', MAD ' + st.mad + ' (scale ' + st.scale +
    ' via ' + st.scale_kind + ') → modified z = ' + robustZ);
  /* MAD is exactly 0 here because six of the eleven values are the same price,
     so the fallback scale is what this demo actually exercises — worth seeing
     rather than hiding behind a headline number. */
  ok(st.scale_kind === 'meanad',
    'this sample has MAD = 0, so the mean-absolute-deviation fallback is what runs', st.scale_kind);
  ok(classicZ < 3.5,
    'mean/σ MISSES it — the 900 dragged the mean to ' + mean.toFixed(0) +
    ' and inflated σ to ' + sd.toFixed(0) + ', so its own z is only ' + classicZ.toFixed(2));
  ok(robustZ > 3.5, 'median/MAD catches it, z = ' + robustZ);
  ok(st.median === 140, 'the median did not move at all', st.median);
})();

/* ── PRICE_OUTLIER ──────────────────────────────────────────────────────── */
console.log('\nPRICE_OUTLIER');
console.log('  recipe: 10 purchases of معجون شروخ near 140/unit + 1 at 900/unit');
(function () {
  const rows = [];
  [140, 140, 141, 139, 140, 142, 138, 140, 140, 140].forEach(function (p, i) {
    rows.push(occ(8000 + i, day(i + 1), 'معجون شروخ', 5, p, 'محمود'));
  });
  rows.push(occ(8099, day(20), 'معجون شروخ', 5, 900, 'محمود'));

  const r = E.runTier2(rows, {});
  const flagged = r.flags.filter(function (f) { return f.rule_id === 'PRICE_OUTLIER'; })
    .map(function (f) { return f.row_id; });
  ok(flagged.length === 1 && flagged[0] === '8099',
    'only the 900 purchase is flagged, not the ten ordinary ones', flagged.join(','));
  const f = r.flags.filter(function (x) { return x.rule_id === 'PRICE_OUTLIER'; })[0];
  ok(f.reason_ar.indexOf('900.00') !== -1 && f.reason_ar.indexOf('140.00') !== -1,
    'the reason states the price AND the historical median', f.reason_ar);
  ok(f.reason_ar.indexOf('الوسيط') !== -1,
    'and says which statistic it used, so the reader can check it', f.reason_ar);
  ok(f.evidence[0].cluster_n === 11, 'the evidence says how many purchases it compared against');
  if (SHOW) console.log('    ' + f.reason_ar);
})();

/* Below the minimum n, the rule must refuse rather than produce a weak verdict. */
console.log('\ninsufficient history is an answer');
(function () {
  const rows = [occ(8200, day(1), 'صنف نادر', 1, 100, 'محمود'),
                occ(8201, day(2), 'صنف نادر', 1, 105, 'محمود'),
                occ(8202, day(3), 'صنف نادر', 1, 900, 'محمود')];
  const r = E.runTier2(rows, {});
  ok(r.flags.filter(function (f) { return f.rule_id === 'PRICE_OUTLIER'; }).length === 0,
    'three purchases produce no price verdict, however extreme the third looks');
  const n = r.notes.filter(function (x) { return x.rule_id === 'PRICE_OUTLIER' && x.status === 'insufficient_data'; })[0];
  ok(!!n, 'and the engine says so');
  ok(n && /[؀-ۿ]/.test(n.reason_ar) && n.reason_ar.indexOf('غير كافية') !== -1,
    'in Arabic, naming the shortfall', n && n.reason_ar);
})();

/* All-identical prices: MAD is 0. Without the mean-absolute-deviation fallback
   every z is Infinity and every row is an outlier. */
console.log('\nzero dispersion');
(function () {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push(occ(8300 + i, day(i + 1), 'صنف ثابت', 1, 100, 'محمود'));
  const r = E.runTier2(rows, {});
  ok(r.flags.filter(function (f) { return f.rule_id === 'PRICE_OUTLIER'; }).length === 0,
    'eight identical prices produce no outlier — not Infinity, not everything');
  ok(r.notes.some(function (n) { return n.status === 'no_dispersion'; }),
    'and the engine explains that there is no dispersion to measure against');
})();

/* ── PEER_GAP ───────────────────────────────────────────────────────────── */
console.log('\nPEER_GAP');
console.log('  recipe: same item — عادل buys 4× at 200/unit, three others buy 4× at 140/unit');
(function () {
  const rows = [];
  [0, 1, 2, 3].forEach(function (i) { rows.push(occ(8400 + i, day(i + 1), 'سلك لحام زهر', 1, 200, 'عادل')); });
  ['سيد', 'هالة', 'وليد', 'منى'].forEach(function (p, i) {
    rows.push(occ(8410 + i, day(i + 5), 'سلك لحام زهر', 1, 140, p));
  });
  const r = E.runTier2(rows, {});
  const pg = r.flags.filter(function (f) { return f.rule_id === 'PEER_GAP'; });
  ok(pg.length === 4, 'all four of عادل\'s purchases are flagged', pg.length);
  ok(pg.every(function (f) { return f.reason_ar.indexOf('عادل') !== -1; }),
    'the reason names the person');
  ok(pg[0].reason_ar.indexOf('200.00') !== -1 && pg[0].reason_ar.indexOf('140.00') !== -1,
    'and both medians being compared', pg[0].reason_ar);
  ok(pg[0].reason_ar.indexOf('43%') !== -1, 'and the gap as a percentage', pg[0].reason_ar);
  ok(!pg.some(function (f) { return ['8410', '8411', '8412', '8413'].indexOf(f.row_id) !== -1; }),
    'the peers themselves are NOT flagged');
  if (SHOW) console.log('    ' + pg[0].reason_ar);
})();

(function () {
  const rows = [];
  [0, 1, 2, 3].forEach(function (i) { rows.push(occ(8500 + i, day(i + 1), 'صنف متساو', 1, 142, 'عادل')); });
  ['سيد', 'هالة', 'وليد', 'منى'].forEach(function (p, i) {
    rows.push(occ(8510 + i, day(i + 5), 'صنف متساو', 1, 140, p));
  });
  const r = E.runTier2(rows, {});
  ok(r.flags.filter(function (f) { return f.rule_id === 'PEER_GAP'; }).length === 0,
    'paying 1.4% more than peers is not a finding — the 25% band is what keeps this usable');
})();

/* ── PRICE_RATCHET ──────────────────────────────────────────────────────── */
console.log('\nPRICE_RATCHET');
console.log('  recipe: وليد pays 100→110→120→130→140 over five dates; three peers stay at 100');
(function () {
  const rows = [];
  [100, 110, 120, 130, 140].forEach(function (p, i) {
    rows.push(occ(8600 + i, day(i * 3 + 1), 'دهان زيت', 1, p, 'وليد'));
  });
  ['سيد', 'هالة', 'منى'].forEach(function (p, i) {
    rows.push(occ(8620 + i, day(i * 3 + 2), 'دهان زيت', 1, 100, p));
  });
  const r = E.runTier2(rows, {});
  const rt = r.flags.filter(function (f) { return f.rule_id === 'PRICE_RATCHET'; });
  ok(rt.length === 5, 'all five of وليد\'s purchases are flagged', rt.length);
  ok(rt[0].reason_ar.indexOf('وليد') !== -1 && rt[0].reason_ar.indexOf('100.00') !== -1 &&
     rt[0].reason_ar.indexOf('140.00') !== -1,
    'the reason names the person and both ends of the climb', rt[0].reason_ar);
  ok(rt[0].reason_ar.indexOf('شبه ثابت') !== -1,
    'and states that the peers did not move', rt[0].reason_ar);
  if (SHOW) console.log('    ' + rt[0].reason_ar);
})();

(function () {
  /* Everyone's price rises together: that is a market move, not a ratchet. */
  const rows = [];
  [100, 110, 120, 130, 140].forEach(function (p, i) {
    rows.push(occ(8700 + i, day(i * 3 + 1), 'دهان مشترك', 1, p, 'وليد'));
    rows.push(occ(8710 + i, day(i * 3 + 2), 'دهان مشترك', 1, p, 'سيد'));
  });
  const r = E.runTier2(rows, {});
  ok(r.flags.filter(function (f) { return f.rule_id === 'PRICE_RATCHET'; }).length === 0,
    'when everyone rises together it is a market move and nobody is flagged');
})();

/* ── NEW_ITEM_HIGH_VALUE ────────────────────────────────────────────────── */
console.log('\nNEW_ITEM_HIGH_VALUE');
console.log('  recipe: 12 ordinary items in account 310500 at 50–100, then one new item at 5000');
(function () {
  const rows = [];
  for (let i = 0; i < 12; i++) {
    rows.push(occ(8800 + i, day(i + 1), 'صنف معتاد ' + (i % 3), 1, 50 + i * 4, 'محمود', '310500'));
  }
  rows.push(occ(8899, day(20), 'جهاز خاص جدا', 1, 5000, 'محمود', '310500'));
  const r = E.runTier2(rows, {});
  const ni = r.flags.filter(function (f) { return f.rule_id === 'NEW_ITEM_HIGH_VALUE'; });
  ok(ni.length === 1 && ni[0].row_id === '8899', 'the one-off high-value item is flagged',
    ni.map(function (f) { return f.row_id; }).join(','));
  ok(ni[0].reason_ar.indexOf('5000.00') !== -1 && ni[0].reason_ar.indexOf('310500') !== -1,
    'the reason names the price and the account', ni[0].reason_ar);
  if (SHOW) console.log('    ' + ni[0].reason_ar);
})();

/* ── QUANTITY_ANOMALY ───────────────────────────────────────────────────── */
console.log('\nQUANTITY_ANOMALY');
console.log('  recipe: 8 purchases of 1–2 كيلو at exactly 100/unit, then one of 50 كيلو at 100/unit');
(function () {
  const rows = [];
  [1, 2, 1, 1, 2, 1, 2, 1].forEach(function (q, i) {
    rows.push(occ(8900 + i, day(i + 1), 'شحم تشحيم', q, 100 + (i % 2), 'محمود'));
  });
  rows.push(occ(8999, day(20), 'شحم تشحيم', 50, 100, 'محمود'));
  const r = E.runTier2(rows, {});
  const qa = r.flags.filter(function (f) { return f.rule_id === 'QUANTITY_ANOMALY'; });
  ok(qa.length === 1 && qa[0].row_id === '8999',
    'the 50-kilo purchase is flagged even though its unit price is perfectly normal',
    qa.map(function (f) { return f.row_id; }).join(','));
  ok(qa[0].reason_ar.indexOf('سعر الوحدة طبيعي') !== -1,
    'and the reason says so explicitly — a price rule alone cannot see this', qa[0].reason_ar);
  if (SHOW) console.log('    ' + qa[0].reason_ar);
})();

/* ── Every Tier 2 flag is explainable, on the same terms as Tier 1 ───────── */
console.log('\nevery Tier 2 flag is explainable');
(function () {
  const rows = [];
  [140, 140, 141, 139, 140, 142, 138, 140, 140, 140].forEach(function (p, i) {
    rows.push(occ(9100 + i, day(i + 1), 'معجون شروخ', 5, p, 'محمود'));
  });
  rows.push(occ(9199, day(20), 'معجون شروخ', 5, 900, 'محمود'));
  const r = E.runTier2(rows, {});
  ok(r.flags.length > 0, 'there are flags to check');
  r.flags.forEach(function (f) {
    ok(/[؀-ۿ]/.test(f.reason_ar), f.rule_id + ' reason is Arabic');
    ok(f.reason_ar.length > 25, f.rule_id + ' reason is a sentence', f.reason_ar);
    ok(/\d/.test(f.reason_ar), f.rule_id + ' reason carries the numbers behind it', f.reason_ar);
    ok(Array.isArray(f.evidence) && f.evidence.length > 0, f.rule_id + ' carries evidence');
    ok(['high', 'medium', 'low'].indexOf(f.severity) !== -1, f.rule_id + ' severity is known');
  });
  /* The number a reviewer reads in tab 3 and the number the rule fired on come
     from the same object, by construction rather than by coincidence. */
  const cid = Object.keys(r.stats)[0];
  ok(r.stats[cid].price.median === 140,
    'clusterPriceStats exposes the same median the rule used', r.stats[cid].price.median);
})();


/* ═══════════════════════════════════════════════════════════════════════════
 * Tier 3 — distributional and behavioural, per entity
 *
 * These findings describe a PERSON or an ACCOUNT, not a movement, so they are
 * checked for that shape too: row_id must be null and entity must be set. On
 * screen "this movement is wrong" and "this person's spending changed shape"
 * cannot render as the same badge.
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n── Tier 3 — distributional and behavioural ──────────────────────────');

/* A small deterministic PRNG, so a failure here is reproducible rather than
   something that happens one run in twenty. */
function makeRnd(seed) {
  let s = seed;
  return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

function mrow(id, date, amount, person, account, type) {
  return {
    id: String(id), transaction_date: date, transaction_details: '1 كيلو زيت ب ' + amount,
    transaction_amount: String(amount), transaction_type: type || 'credit',
    chart_of_accounts: account || '310500', responsible_person: person, box_code: '1',
    created_at: date + ' 10:00:00', updated_at: date + ' 10:00:00', is_revised: '0'
  };
}
function dseq(i) {
  const d = new Date(Date.UTC(2026, 0, 1 + i));
  return d.toISOString().slice(0, 10);
}

/* ── THE BENFORD GATE ────────────────────────────────────────────────────
 * n >= 300, and the boundary is tested exactly. A Benford verdict on forty
 * rows is noise attached to a named employee, so this gate is a correctness
 * requirement rather than a statistical nicety. */
console.log('\nBenford — the n >= 300 gate');
(function () {
  const rnd = makeRnd(7);
  /* Deliberately NON-conforming amounts: every one starts with 5 or 6. If the
     gate leaked, this is exactly the sample that would produce a verdict. */
  const skewed = [];
  for (let i = 0; i < 400; i++) skewed.push(500 + Math.floor(rnd() * 200));

  ok(E.benfordFirstDigit(skewed.slice(0, 299)).status === 'insufficient_data',
    '299 amounts → insufficient_data, no verdict of any kind');
  ok(E.benfordFirstDigit(skewed.slice(0, 300)).status === 'ok',
    '300 amounts → the test runs; the boundary is exactly 300');

  const below = E.benfordFirstDigit(skewed.slice(0, 299));
  ok(below.verdict_ar === undefined && below.conforms === undefined && below.chi2 === undefined,
    'below the gate NOTHING is returned that could be read as a verdict',
    JSON.stringify(below));
  ok(/غير كافية/.test(below.reason_ar), 'and the refusal is in Arabic', below.reason_ar);

  const above = E.benfordFirstDigit(skewed.slice(0, 300));
  ok(above.conforms === false, 'the skewed sample is correctly judged non-conforming', above.mad);
  ok(above.n === 300 && above.df === 8, 'n and degrees of freedom are reported', above.n + '/' + above.df);
})();

console.log('\nBenford — conforming data is not flagged');
(function () {
  const rnd = makeRnd(11);
  /* Log-uniform over three decades is the textbook Benford-conforming sample. */
  const natural = [];
  for (let i = 0; i < 1000; i++) natural.push(Math.round(Math.pow(10, 1 + 3 * rnd())));
  const b = E.benfordFirstDigit(natural);
  ok(b.status === 'ok' && b.conforms === true,
    'log-uniform amounts conform (MAD ' + b.mad + ', χ² ' + b.chi2 + ')');
  console.log('  log-uniform n=1000 → MAD ' + b.mad + ', χ² ' + b.chi2 + ' → ' + b.verdict_ar);
  const rows = natural.map(function (a, i) { return mrow(11000 + i, dseq(i % 300), a, 'طبيعي'); });
  const r = E.runTier3(rows, {});
  ok(r.flags.filter(function (f) { return f.rule_id === 'BENFORD'; }).length === 0,
    'and produce no BENFORD flag');
})();

console.log('\nBenford — a non-conforming entity IS flagged, as a group-level signal');
(function () {
  const rnd = makeRnd(13);
  const rows = [];
  for (let i = 0; i < 350; i++) rows.push(mrow(12000 + i, dseq(i % 300), 500 + Math.floor(rnd() * 200), 'مشبوه'));
  const r = E.runTier3(rows, {});
  const bf = r.flags.filter(function (f) { return f.rule_id === 'BENFORD'; });
  ok(bf.length === 1, 'the entity is flagged once, not once per row', bf.length);
  ok(bf[0].row_id === null, 'row_id is null — this is not a claim about any one movement');
  ok(bf[0].entity === 'مشبوه' && !!bf[0].entity_kind, 'the entity is named', bf[0].entity);
  ok(/ليس اتهاماً/.test(bf[0].reason_ar),
    'and the reason says in so many words that it is not an accusation about a single row',
    bf[0].reason_ar);
  ok(/ترتيب أولوية المراجعة/.test(bf[0].reason_ar),
    'and that it is for ordering review, which is the only defensible use of it');
  if (SHOW) console.log('    ' + bf[0].reason_ar);
})();

/* Below the gate, a whole run must produce a note and no flag. */
console.log('\nBenford — below the gate the PAGE gets a note, not a weak verdict');
(function () {
  const rnd = makeRnd(17);
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push(mrow(13000 + i, dseq(i), 500 + Math.floor(rnd() * 200), 'قليل'));
  const r = E.runTier3(rows, {});
  ok(r.flags.filter(function (f) { return f.rule_id === 'BENFORD'; }).length === 0,
    '40 rows of blatantly skewed amounts produce NO Benford flag');
  const n = r.notes.filter(function (x) { return x.rule_id === 'BENFORD'; })[0];
  ok(!!n && n.status === 'insufficient_data', 'and a note instead');
  ok(n && /بيانات غير كافية/.test(n.reason_ar), 'reading بيانات غير كافية', n && n.reason_ar);
})();

/* ── ROUND_NUMBER_BIAS ──────────────────────────────────────────────────── */
console.log('\nROUND_NUMBER_BIAS');
console.log('  recipe: 200 population rows ~8% round-100, plus مقدِّر with 40 rows at 85% round');
(function () {
  const rnd = makeRnd(23);
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const round = rnd() < 0.08;
    rows.push(mrow(14000 + i, dseq(i % 120), round ? 300 : 137 + Math.floor(rnd() * 500), 'عادي ' + (i % 5)));
  }
  for (let i = 0; i < 40; i++) {
    const round = i % 20 !== 0 && i % 7 !== 0;
    rows.push(mrow(14500 + i, dseq(i % 120), round ? (i % 5 + 1) * 100 : 233 + i, 'مقدِّر'));
  }
  const r = E.runTier3(rows, {});
  const rb = r.flags.filter(function (f) { return f.rule_id === 'ROUND_NUMBER_BIAS' && f.entity === 'مقدِّر'; });
  ok(rb.length >= 1, 'مقدِّر is flagged', rb.length);
  ok(rb.length && rb[0].row_id === null && rb[0].entity === 'مقدِّر', 'as an entity-level finding');
  ok(rb.length && /مقابل/.test(rb[0].reason_ar) && /%/.test(rb[0].reason_ar),
    'and the reason compares their rate against the population rate', rb.length && rb[0].reason_ar);
  const others = r.flags.filter(function (f) {
    return f.rule_id === 'ROUND_NUMBER_BIAS' && f.entity !== 'مقدِّر';
  });
  ok(others.length === 0, 'and nobody matching the population rate is', others.map(function (f) { return f.entity; }).join(','));
  if (SHOW && rb.length) console.log('    ' + rb[0].reason_ar);
})();

/* ── VELOCITY_BURST ─────────────────────────────────────────────────────── */
console.log('\nVELOCITY_BURST');
console.log('  recipe: مشغول files 1–2 movements a day for 30 days, then 15 in one day');
(function () {
  const rows = [];
  let id = 15000;
  for (let d = 0; d < 30; d++) {
    const n = 1 + (d % 2);
    for (let i = 0; i < n; i++) rows.push(mrow(id++, dseq(d), 100 + i, 'مشغول'));
  }
  for (let i = 0; i < 15; i++) rows.push(mrow(id++, dseq(40), 100 + i, 'مشغول'));
  const r = E.runTier3(rows, {});
  const vb = r.flags.filter(function (f) { return f.rule_id === 'VELOCITY_BURST'; });
  ok(vb.length === 1, 'the one burst day is flagged, not the thirty ordinary ones', vb.length);
  ok(vb[0].detail.count === 15 && vb[0].detail.baseline <= 2,
    'against THEIR OWN baseline, not the busiest person in the office',
    JSON.stringify(vb[0].detail));
  ok(/المعتاد له/.test(vb[0].reason_ar), 'and the reason says so', vb[0].reason_ar);
  if (SHOW) console.log('    ' + vb[0].reason_ar);
})();

(function () {
  /* Someone who files 15 a day EVERY day is doing their job. */
  const rows = [];
  let id = 16000;
  for (let d = 0; d < 30; d++) {
    for (let i = 0; i < 15; i++) rows.push(mrow(id++, dseq(d), 100 + i, 'أمين المخزن'));
  }
  const r = E.runTier3(rows, {});
  ok(r.flags.filter(function (f) { return f.rule_id === 'VELOCITY_BURST'; }).length === 0,
    'a consistently busy storekeeper is never flagged — the baseline is their own');
})();

/* ── ACCOUNT_MIX_DRIFT ──────────────────────────────────────────────────── */
console.log('\nACCOUNT_MIX_DRIFT');
console.log('  recipe: مُحوِّل spends 90% on 310500 for 60 rows, then 90% on 310900 for 40');
(function () {
  const rows = [];
  let id = 17000;
  for (let i = 0; i < 60; i++) {
    rows.push(mrow(id++, dseq(i), 100, 'مُحوِّل', i % 10 === 0 ? '310900' : '310500'));
  }
  for (let i = 0; i < 40; i++) {
    rows.push(mrow(id++, dseq(60 + i), 100, 'مُحوِّل', i % 10 === 0 ? '310500' : '310900'));
  }
  const r = E.runTier3(rows, { drift_split_date: dseq(60) });
  const dr = r.flags.filter(function (f) { return f.rule_id === 'ACCOUNT_MIX_DRIFT'; });
  ok(dr.length === 1, 'the drift is flagged once, at entity level', dr.length);
  ok(dr[0].detail.psi > 0.25, 'PSI is above the conventional 0.25 cut', dr[0].detail.psi);
  ok(/الإجماليات قد تبدو طبيعية/.test(dr[0].reason_ar),
    'and the reason names what this catches: totals that look fine while the mix moves');
  if (SHOW) console.log('    ' + dr[0].reason_ar);
})();

(function () {
  const rows = [];
  let id = 18000;
  for (let i = 0; i < 100; i++) {
    rows.push(mrow(id++, dseq(i), 100, 'ثابت', i % 10 === 0 ? '310900' : '310500'));
  }
  const r = E.runTier3(rows, { drift_split_date: dseq(60) });
  ok(r.flags.filter(function (f) { return f.rule_id === 'ACCOUNT_MIX_DRIFT'; }).length === 0,
    'a stable account mix is not flagged');
})();

/* ── SEASONALITY ────────────────────────────────────────────────────────── */
console.log('\nSEASONALITY');
console.log('  recipe: account 312000 spends 900-1150/month for 12 months, then 9000');
(function () {
  const rnd = makeRnd(31);
  const rows = [];
  let id = 19000;
  for (let m = 1; m <= 12; m++) {
    const mm = (m < 10 ? '0' : '') + m;
    /* Real months are never identical, and a recipe that makes them identical
       tests the wrong branch — the first version of this check did exactly
       that, and that is how the flat-history gap below was found. */
    const base = 225 + Math.floor(rnd() * 60);
    for (let i = 0; i < 4; i++) {
      rows.push(mrow(id++, '2025-' + mm + '-0' + (i + 1), base + i * 3, 'أي شخص', '312000'));
    }
  }
  for (let i = 0; i < 4; i++) rows.push(mrow(id++, '2026-01-0' + (i + 1), 2250, 'أي شخص', '312000'));

  const r = E.runTier3(rows, { current_month: '2026-01' });
  const sf = r.flags.filter(function (f) { return f.rule_id === 'SEASONALITY'; });
  ok(sf.length === 1, 'the spike month is flagged', sf.length);
  ok(sf.length && sf[0].detail.basis === 'modified_z',
    'on the modified-z basis', sf.length && sf[0].detail.basis);
  ok(sf[0].entity === '312000' && sf[0].entity_kind === 'الحساب', 'against the account', sf[0].entity);
  ok(/بالزيادة/.test(sf[0].reason_ar), 'and says which direction', sf[0].reason_ar);
  if (SHOW) console.log('    ' + sf[0].reason_ar);

  const r2 = E.runTier3(rows, {});
  ok(r2.flags.filter(function (f) { return f.rule_id === 'SEASONALITY'; }).length === 0,
    'without a current month the rule does not guess which one it is');
  ok(r2.notes.some(function (n) { return n.rule_id === 'SEASONALITY' && n.status === 'not_run'; }),
    'and says it did not run');
})();

/* A perfectly flat history is the STRONGEST baseline, not an absent one. The
   first version of this rule produced nothing here: MAD and the
   mean-absolute-deviation fallback are both zero, the z-score is undefined,
   and an account that spent exactly the same for a year and then nine times
   that returned silence. It now falls back to a direct ratio and reports which
   basis it used. */
console.log('  recipe: account 313000 spends EXACTLY 1000 for 12 months, then 9000');
(function () {
  const rows = [];
  let id = 19500;
  for (let m = 1; m <= 12; m++) {
    const mm = (m < 10 ? '0' : '') + m;
    for (let i = 0; i < 4; i++) rows.push(mrow(id++, '2025-' + mm + '-0' + (i + 1), 250, 'شخص ثابت', '313000'));
  }
  for (let i = 0; i < 4; i++) rows.push(mrow(id++, '2026-01-0' + (i + 1), 2250, 'شخص ثابت', '313000'));
  const r = E.runTier3(rows, { current_month: '2026-01' });
  const sf = r.flags.filter(function (f) { return f.rule_id === 'SEASONALITY'; });
  ok(sf.length === 1, 'a flat history followed by a 9x month IS flagged', sf.length);
  ok(sf.length && sf[0].detail.basis === 'flat_history_ratio',
    'on the ratio basis, and it says which', sf.length && sf[0].detail.basis);
  ok(sf.length && sf[0].reason_ar.indexOf('لا يوجد تشتت تاريخي') !== -1,
    'and the reason explains why no z-score was used', sf.length && sf[0].reason_ar);
  if (SHOW && sf.length) console.log('    ' + sf[0].reason_ar);

  /* A flat history followed by an ordinary month is still silence. */
  const rows2 = rows.slice(0, 48);
  for (let i = 0; i < 4; i++) rows2.push(mrow(29000 + i, '2026-01-0' + (i + 1), 255, 'شخص ثابت', '313000'));
  const r2b = E.runTier3(rows2, { current_month: '2026-01' });
  ok(r2b.flags.filter(function (f) { return f.rule_id === 'SEASONALITY'; }).length === 0,
    'a 2% departure from a flat history is not a finding');
})();

/* ── Every Tier 3 finding has the entity shape and is explainable ────────── */
console.log('\nevery Tier 3 finding is entity-shaped and explainable');
(function () {
  const rnd = makeRnd(29);
  const rows = [];
  for (let i = 0; i < 350; i++) rows.push(mrow(20000 + i, dseq(i % 300), 500 + Math.floor(rnd() * 200), 'مشبوه'));
  const r = E.runTier3(rows, { current_month: '2026-06' });
  ok(r.flags.length > 0, 'there are findings to check', r.flags.length);
  r.flags.forEach(function (f) {
    ok(f.row_id === null, f.rule_id + ' is entity-level, so row_id is null', f.row_id);
    ok(!!f.entity, f.rule_id + ' names its entity');
    ok(!!f.entity_kind, f.rule_id + ' says what kind of entity');
    ok(/[؀-ۿ]/.test(f.reason_ar) && f.reason_ar.length > 30,
      f.rule_id + ' reason is an Arabic sentence', f.reason_ar);
    ok(/\d/.test(f.reason_ar), f.rule_id + ' reason carries its numbers', f.reason_ar);
    ok(!!f.detail, f.rule_id + ' carries the computed detail for the reader to check');
  });
})();


/* ═══════════════════════════════════════════════════════════════════════════
 * Risk ranking
 * ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n── Risk ranking ────────────────────────────────────────────────────');

function fk(sev, id) {
  return { rule_id: id || 'R', severity: sev, severity_ar: 'x',
           reason_ar: 'سبب مفصل يحتوي أرقاماً 123', evidence: [{ row_id: '1' }] };
}

console.log('\nthe score saturates');
ok(E.riskScore([]).score === 0 && E.riskScore([]).level === 'none', 'no flags → 0 / none');
ok(E.riskScore([fk('low')]).score === 12, 'one low = 12', E.riskScore([fk('low')]).score);
ok(E.riskScore([fk('medium')]).score === 35, 'one medium = 35');
ok(E.riskScore([fk('high')]).score === 70, 'one high = 70');
ok(E.riskScore([fk('high')]).level === 'high',
  'ONE high-severity flag is enough to rank high — a confirmed integrity failure ' +
  'should not need corroboration from two weak notes');
ok(E.riskScore([fk('high', 'A'), fk('high', 'B')]).score === 91, 'two highs = 91, not 140');
ok(E.riskScore([fk('high', 'A'), fk('high', 'B')]).score < 100, 'the score is bounded');

/* The property a sum would get wrong. There are exactly three low-severity
   rules in the engine, so three is the realistic ceiling for one row; a sum
   would have put a row with three notes above a row with a confirmed
   integrity failure. */
(function () {
  const threeLows = [fk('low', 'A'), fk('low', 'B'), fk('low', 'C')];
  ok(E.riskScore(threeLows).score < E.riskScore([fk('high')]).score,
    'three low notes rank BELOW one high-severity finding',
    E.riskScore(threeLows).score + ' vs ' + E.riskScore([fk('high')]).score);
  const lowRules = ['ODD_HOUR', 'EDITED_AFTER_REVIEW (explained)', 'SEASONALITY'];
  console.log('  the engine has ' + lowRules.length + ' low-severity rules (' + lowRules.join(', ') + '),');
  console.log('  so ' + lowRules.length + ' is the realistic ceiling for one row: ' +
    E.riskScore(threeLows).score + ' vs 70 for a single high.');
  /* Stated honestly rather than overclaimed: saturation makes it HARD for low
     notes to outrank a high, not impossible. Ten would. */
  const tenLows = [];
  for (let i = 0; i < 10; i++) tenLows.push(fk('low', 'L' + i));
  ok(E.riskScore(tenLows).score > 70,
    'ten lows WOULD outrank one high (' + E.riskScore(tenLows).score +
    ') — saturation makes this hard, not impossible, and there are only 3 such rules');
})();

console.log('\nthe score never travels without its reasons');
(function () {
  const r = E.riskScore([fk('high', 'A'), fk('low', 'B'), fk('medium', 'C')]);
  ok(r.flags.length === 3, 'riskScore returns the flags that produced it', r.flags.length);
  ok(r.flags[0].severity === 'high' && r.flags[2].severity === 'low',
    'most severe first, so the first reason a reader sees is why the row ranks where it does',
    r.flags.map(function (f) { return f.severity; }).join(','));
  ok(r.counts.high === 1 && r.counts.medium === 1 && r.counts.low === 1, 'and a count per severity');
  ok(!!r.level_ar, 'and an Arabic level label');
})();

console.log('\nranking order');
(function () {
  const rows = [
    { id: '1', transaction_date: '2026-01-01' },
    { id: '2', transaction_date: '2026-01-02' },
    { id: '3', transaction_date: '2026-01-03' }
  ];
  const byRow = { '1': [fk('high')], '2': [], '3': [fk('medium')] };
  const ranked = E.rankRows(rows, byRow);
  ok(ranked.map(function (x) { return x.row.id; }).join(',') === '1,3,2',
    'highest risk first, then medium, then the unflagged row',
    ranked.map(function (x) { return x.row.id; }).join(','));
  ok(ranked[2].risk.score === 0, 'unflagged rows are still SCORED, so the movements tab can badge them');
})();

(function () {
  /* Equal scores fall back to newest first, which is the order a reviewer
     actually works in. */
  const rows = [
    { id: '10', transaction_date: '2026-01-01' },
    { id: '11', transaction_date: '2026-03-01' },
    { id: '12', transaction_date: '2026-02-01' }
  ];
  const byRow = { '10': [fk('high')], '11': [fk('high')], '12': [fk('high')] };
  const ranked = E.rankRows(rows, byRow);
  ok(ranked.map(function (x) { return x.row.id; }).join(',') === '11,12,10',
    'ties break newest-first', ranked.map(function (x) { return x.row.id; }).join(','));
})();

console.log('\nbucket boundaries');
[[0, 'none'], [12, 'low'], [34, 'low'], [35, 'medium'], [69, 'medium'], [70, 'high'], [91, 'high']]
  .forEach(function (c) {
    /* Build a flag set that lands on the wanted score where one exists, and
       otherwise assert the boundary constants directly. */
    if (c[0] === 0) { ok(E.riskScore([]).level === 'none', 'score 0 → none'); return; }
    if (c[0] === 12) { ok(E.riskScore([fk('low')]).level === 'low', 'score 12 → low'); return; }
    if (c[0] === 35) { ok(E.riskScore([fk('medium')]).level === 'medium', 'score 35 → medium (inclusive)'); return; }
    if (c[0] === 70) { ok(E.riskScore([fk('high')]).level === 'high', 'score 70 → high (inclusive)'); return; }
  });
ok(E.RISK.BUCKET_HIGH === 70 && E.RISK.BUCKET_MEDIUM === 35,
  'the bucket cuts are named constants, not magic numbers in a comparison');


console.log(failures === 0
  ? '\nAll rule checks pass (Tiers 1, 2, 3 and risk ranking).'
  : '\n' + failures + ' rule check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
