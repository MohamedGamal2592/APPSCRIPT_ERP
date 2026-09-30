/**
 * VF — «إنشاء رواتب الشهر»: the day a status ends is a day that is PAID.
 *
 * `working_days` decides money. It feeds the sheet formula
 * `=(basic + allow)/30 * working_days` (Company_ValleyFoods_Actions.js, in
 * addMonthlySalary_), so one day of arithmetic here is one day of salary for
 * every employee whose status changed inside the month.
 *
 * The rule this file pins:
 *
 *   A status becomes effective ON its Status_Date, and a status that ENDS an
 *   active period is INCLUSIVE of its own day. «استقالة» dated day 20 means the
 *   employee's last working day was day 20, so a period carried in from the
 *   previous month is worth 20 days — not the 19 this used to pay.
 *
 * And the trap the rule walks past: the extra day is added ONLY when the new
 * status is not «يعمل بالشركة». Adding it to every segment would pay the
 * boundary day twice whenever one active row follows another, because there the
 * day belongs to the segment that is STARTING, not to one that is ending. The
 * «no double pay» cases below are the ones that catch that, and they are the
 * reason this is a table and not a single assertion.
 *
 * The real source is extracted and RUN — `monthlySalaryStatusJson_` normalises
 * raw sheet rows (Date objects, Employee_Code/Status_Type casing, chronological
 * sort) and `monthlySalaryWorkingDays_` counts them — so nothing here restates
 * the logic it is checking. No spreadsheet, no Google service, no network.
 *
 * Run: node tools/verify/vf_salary_status_days.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

const ACTIVE = 'يعمل بالشركة';
const QUIT = 'استقالة';
const ABSENT = 'انقطاع عن العمل';
const ENDED = 'انهاء تعاقد';

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

/* ══ the real code, extracted ═══════════════════════════════════════════════ */

const START = SRC.indexOf('  function monthlySalaryEmployeeKey_(');
const END = SRC.indexOf('  function getMonthlySalaryGenerationJson_(');
check(START !== -1 && END > START, 'the monthly-salary day block can be located in the real source');
if (START === -1 || END <= START) { process.exit(1); }

const block = SRC.slice(START, END);
const api = new Function('env', 'with (env) {\n' + block +
  '\nreturn { days: monthlySalaryWorkingDays_, statusJson: monthlySalaryStatusJson_,' +
  ' dateKey: monthlySalaryDateKey_ };\n}')({ ACTIVE_STATUS: ACTIVE });

/* The one active value is read out of the real source too, so a rename there
   cannot leave this file quietly testing a string nothing uses any more. */
check(/const ACTIVE_STATUS = 'يعمل بالشركة';/.test(SRC),
  'ACTIVE_STATUS in the real source is still «' + ACTIVE + '»');

/* ══ fixtures: rows in the shape the status sheet actually holds ════════════ */

const YEAR = 2026;
const MONTH = 9;

/** A raw status row, as getValues() hands it over: a real Date, sheet casing. */
function row(day, type, monthOverride) {
  return {
    Employee_Code: 41,
    Status_Type: type,
    Status_Date: new Date(YEAR, (monthOverride || MONTH) - 1, day),
    Employee_name: 'موظف الاختبار'
  };
}

/** Drive the real pipeline: raw rows -> normalised events -> day count. */
function workingDays(rows) {
  const byEmployee = api.statusJson(rows);
  return api.days(byEmployee['41'], MONTH, YEAR);
}

/* A status carried in from the previous month. This is the common case in the
   real sheet: most employees have one row from the month they were hired and
   nothing since. */
const carriedActive = row(15, ACTIVE, 8);
const carriedStopped = row(15, QUIT, 8);

/* ══ 1. the reported bug: an ending status pays its own day ═════════════════ */
console.log('\n1 — the day a status ends is worked\n');

const ENDING = [
  ['carried active, «استقالة» on day 20',          [carriedActive, row(20, QUIT)],   20, 19],
  ['carried active, «انقطاع عن العمل» on day 20',  [carriedActive, row(20, ABSENT)], 20, 19],
  ['carried active, «انهاء تعاقد» on day 20',      [carriedActive, row(20, ENDED)],  20, 19],
  ['carried active, stops on day 30',              [carriedActive, row(30, QUIT)],   30, 29],
  ['carried active, stops on day 1',               [carriedActive, row(1, QUIT)],     1,  0],
  ['starts day 5, stops day 20',                   [row(5, ACTIVE), row(20, QUIT)],  16, 15]
];
ENDING.forEach(function (c) {
  const got = workingDays(c[1]);
  check(got === c[2], c[0] + ' → ' + c[2] + ' days',
    'got ' + got + ' (this used to pay ' + c[3] + ')');
});
check(ENDING.every(function (c) { return c[2] === c[3] + 1; }),
  'every ending case is exactly one day more than the old count');

/* ══ 2. the trap: a start must NOT gain a day ══════════════════════════════ */
console.log('\n2 — no double pay where one active period follows another\n');

const NO_GAIN = [
  ['active all month, no rows inside it',            [carriedActive],                             30],
  ['starts day 5, still active at month end',        [row(5, ACTIVE)],                            26],
  ['starts day 1',                                   [row(1, ACTIVE)],                            30],
  ['two active rows, day 5 and day 10',              [carriedActive, row(5, ACTIVE), row(10, ACTIVE)], 30],
  ['three active rows inside the month',             [row(3, ACTIVE), row(9, ACTIVE), row(22, ACTIVE)], 28]
];
NO_GAIN.forEach(function (c) {
  const got = workingDays(c[1]);
  check(got === c[2], c[0] + ' → ' + c[2] + ' days', 'got ' + got);
});

/* ══ 3. stop then re-hire inside the same month ════════════════════════════ */
console.log('\n3 — a stop and a re-hire in one month\n');

const REHIRE = [
  /* stops day 10 (days 1..10 = 10), back day 20 (days 20..30 = 11) */
  ['stop day 10, re-hired day 20',       [carriedActive, row(10, QUIT), row(20, ACTIVE)], 21],
  /* stops day 20 (1..20 = 20), back the next day (21..30 = 10) */
  ['stop day 20, re-hired day 21',       [carriedActive, row(20, QUIT), row(21, ACTIVE)], 30],
  /* A correction entered as a second row on the SAME date rather than by
     editing the first. Day 20 is paid once, by the stop that closed the
     period — never again by the re-hire that reopens it. */
  ['stop and re-hire both on day 20',    [carriedActive, row(20, QUIT), row(20, ACTIVE)], 30],
  ['stop day 10, re-hire day 10, stop day 20',
    [carriedActive, row(10, QUIT), row(10, ACTIVE), row(20, QUIT)], 20]
];
REHIRE.forEach(function (c) {
  const got = workingDays(c[1]);
  check(got === c[2], c[0] + ' → ' + c[2] + ' days', 'got ' + got);
});

/* ══ 4. the bounds that were already right, and must stay right ════════════ */
console.log('\n4 — month bounds and the 30-day payroll convention\n');

check(workingDays([carriedStopped]) === 0,
  'an employee who is not active earns no days');
check(workingDays([]) === 0, 'no status history at all → 0 days');
check(api.days(undefined, MONTH, YEAR) === 0, 'undefined event list → 0 days, never NaN');
check(workingDays([carriedActive, row(31, QUIT)]) === 30,
  'a stop on day 31 is outside the 30-day month and pays the full 30');
check(workingDays([carriedActive, row(5, QUIT, 10)]) === 30,
  'a stop in a LATER month does not shorten this one');
check(workingDays([row(5, ACTIVE, 10)]) === 0,
  'a hire in a later month earns nothing in this one');

/* Never more than a full month and never negative: working_days is multiplied
   by (basic + allow)/30, so 31 would pay more than the salary. */
const overlapping = [carriedActive];
for (let d = 2; d <= 28; d += 2) { overlapping.push(row(d, QUIT)); overlapping.push(row(d, ACTIVE)); }
const clamped = workingDays(overlapping);
check(clamped >= 0 && clamped <= 30,
  'a month full of same-day stop/re-hire pairs still pays at most 30 days',
  'got ' + clamped);

/* ══ 5. February: the convention is 30 days regardless of the real month ═══ */
console.log('\n5 — a short month keeps the 30-day convention\n');

const febActive = { Employee_Code: 41, Status_Type: ACTIVE, Status_Date: new Date(2026, 0, 10) };
const febQuit28 = { Employee_Code: 41, Status_Type: QUIT, Status_Date: new Date(2026, 1, 28) };
const febDays = function (rows) { return api.days(api.statusJson(rows)['41'], 2, 2026); };
check(febDays([febActive]) === 30, 'active through February pays 30 days');
check(febDays([febActive, febQuit28]) === 28,
  'a stop on 28 February pays 28 days — the ending day counts, the month is not rounded up',
  'got ' + febDays([febActive, febQuit28]));

/* ══ 6. the guard against a silent revert ══════════════════════════════════ */
console.log('\n6 — the source still states the rule it implements\n');

const fn = SRC.slice(SRC.indexOf('  function monthlySalaryWorkingDays_('),
                     SRC.indexOf('  function getMonthlySalaryGenerationJson_('));
check(/becomesActive/.test(fn),
  'the count branches on whether the NEW status is active');
check(/Math\.max\(cursorDay, nextCursor\)/.test(fn),
  'the cursor cannot move backwards, so a same-day re-hire cannot re-pay a day');
check(/Math\.min\(30, days\)/.test(fn),
  'the result is still clamped to the 30-day payroll month');

console.log('');
if (failed) { console.log(failed + ' CHECK(S) FAILED'); process.exit(1); }
console.log('All checks passed.');
