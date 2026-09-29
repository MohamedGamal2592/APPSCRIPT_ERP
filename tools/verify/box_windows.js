/**
 * Box analysis — the four account windows (BOX_ANALYSIS_PLAN.md §6).
 *
 *   node tools/verify/box_windows.js
 *
 * These four date pairs are bound straight into the aggregate query, and a
 * wrong one produces a number that looks completely plausible. Two failure
 * modes in particular:
 *
 *   - A partial month compared against a COMPLETE one. On the 12th, this month
 *     has 12 days of spend and last month has 31. Every account appears to have
 *     collapsed, every month, and somebody eventually acts on it.
 *   - A clamp that isn't there. 31 March minus one month is not 31 February.
 *     MySQL takes a BETWEEN bound of '2026-02-31' without complaining and
 *     matches nothing, so the comparison silently reads zero.
 *
 * All arithmetic is on YYYY-MM-DD strings with no Date object anywhere, because
 * Apps Script, MySQL and the browser do not agree on what timezone a bare date
 * is in.
 */
'use strict';

const path = require('path');
const E = require(path.join(path.resolve(__dirname, '..', '..'), 'Company_TopChemical_Actions.js'));

let failures = 0;
function ok(cond, label, extra) {
  if (cond) return true;
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}
function eq(got, want, label) { return ok(got === want, label, 'got ' + got + ', want ' + want); }

/* ── daysInMonth, including the century rule ─────────────────────────────── */
console.log('daysInMonth');
eq(E.daysInMonth(2026, 2), 28, '2026 is not a leap year');
eq(E.daysInMonth(2024, 2), 29, '2024 is a leap year');
eq(E.daysInMonth(2000, 2), 29, '2000 is a leap year (divisible by 400)');
eq(E.daysInMonth(1900, 2), 28, '1900 is NOT a leap year (divisible by 100, not 400)');
eq(E.daysInMonth(2026, 1), 31, 'January');
eq(E.daysInMonth(2026, 4), 30, 'April');
eq(E.daysInMonth(2026, 12), 31, 'December');

/* ── parseIsoDate rejects rather than coerces ────────────────────────────── */
console.log('parseIsoDate');
ok(E.parseIsoDate('2026-09-06') !== null, 'a valid date parses');
ok(E.parseIsoDate('2026-02-31') === null, '31 February is rejected, not rolled into March');
ok(E.parseIsoDate('2026-13-01') === null, 'month 13 is rejected');
ok(E.parseIsoDate('2026-9-6') === null, 'unpadded is rejected — the SQL bound must be exact');
ok(E.parseIsoDate('') === null, 'empty is rejected');
ok(E.parseIsoDate('2024-02-29') !== null, '29 February 2024 is valid');
ok(E.parseIsoDate('2026-02-29') === null, '29 February 2026 is not');

/* ── THE MONTH-END CLAMP ─────────────────────────────────────────────────── */
console.log('accountWindows — month-end clamp');
let w = E.accountWindows('2026-03-31');
eq(w.last_month.from, '2026-02-01', '31 Mar → last month starts 1 Feb');
eq(w.last_month.to, '2026-02-28', '31 Mar → last month ENDS 28 Feb, never 31 Feb');
ok(E.parseIsoDate(w.last_month.to) !== null, 'the clamped bound is itself a real date');

w = E.accountWindows('2024-03-31');
eq(w.last_month.to, '2024-02-29', '31 Mar 2024 → 29 Feb, the leap year gets its day');

w = E.accountWindows('2026-05-31');
eq(w.last_month.to, '2026-04-30', '31 May → 30 Apr');

w = E.accountWindows('2024-02-29');
eq(w.last_ytd.to, '2023-02-28', '29 Feb 2024 → last year clamps to 28 Feb 2023');

/* ── Same day-of-period, not the whole period ────────────────────────────── */
console.log('accountWindows — same day-of-period');
w = E.accountWindows('2026-09-12');
eq(w.mtd.from, '2026-09-01', 'MTD starts on the 1st');
eq(w.mtd.to, '2026-09-12', 'MTD ends on the reference date');
eq(w.last_month.from, '2026-08-01', 'last month starts on the 1st');
eq(w.last_month.to, '2026-08-12', 'last month is cut to the 12th, NOT to 31 August');
eq(w.ytd.from, '2026-01-01', 'YTD starts 1 January');
eq(w.ytd.to, '2026-09-12', 'YTD ends on the reference date');
eq(w.last_ytd.from, '2025-01-01', 'last YTD starts 1 January last year');
eq(w.last_ytd.to, '2025-09-12', 'last YTD is cut to the same day, NOT to 31 December');

/* ── January rolls back across the year boundary ─────────────────────────── */
console.log('accountWindows — year boundary');
w = E.accountWindows('2026-01-15');
eq(w.last_month.from, '2025-12-01', 'January → last month is December of the previous year');
eq(w.last_month.to, '2025-12-15', '...cut to the 15th');
eq(w.ytd.from, '2026-01-01', 'YTD is 15 days long, which is correct');
eq(w.last_ytd.from, '2025-01-01', 'last YTD starts 1 Jan 2025');
eq(w.last_ytd.to, '2025-01-15', 'last YTD is 15 days long too — the comparison is fair');

/* ── The span the query is bounded by covers all four windows and no more ── */
console.log('accountWindows — outer span');
w = E.accountWindows('2026-09-12');
eq(w.span.from, '2025-01-01', 'span starts at the earliest window bound');
eq(w.span.to, '2026-09-12', 'span ends at the reference date');
['mtd', 'last_month', 'ytd', 'last_ytd'].forEach(function (k) {
  ok(w[k].from >= w.span.from && w[k].to <= w.span.to,
    'window ' + k + ' lies inside the query span', w[k].from + '..' + w[k].to);
  ok(w[k].from <= w[k].to, 'window ' + k + ' is not inverted', w[k].from + '..' + w[k].to);
  ok(!!w[k].label_ar, 'window ' + k + ' carries an Arabic label');
});

/* An invalid reference date must throw, not silently produce windows that
   match nothing. */
console.log('accountWindows — rejection');
let threw = false;
try { E.accountWindows('2026-02-31'); } catch (e) { threw = true; }
ok(threw, 'an impossible reference date throws rather than returning empty windows');

/* ── monthsBefore ────────────────────────────────────────────────────────── */
console.log('monthsBefore');
eq(E.monthsBefore('2026-09-06', 24), '2024-09-01', '24 months back from Sept 2026');
eq(E.monthsBefore('2026-01-31', 1), '2025-12-01', '1 month back across the year boundary');
eq(E.monthsBefore('2026-01-31', 13), '2024-12-01', '13 months back');
eq(E.monthsBefore('2026-09-06', 0), '2026-09-01', '0 months back is the 1st of this month');
eq(E.monthsBefore('2026-03-31', 1), '2026-02-01',
  'the day is dropped entirely — this is a month start, so no clamp is needed');

console.log(failures === 0
  ? '\nAll window checks pass.'
  : '\n' + failures + ' window check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
