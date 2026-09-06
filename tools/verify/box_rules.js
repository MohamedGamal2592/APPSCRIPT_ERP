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

console.log(failures === 0
  ? '\nAll rule checks pass (Tier 1 + Tier 2).'
  : '\n' + failures + ' rule check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
