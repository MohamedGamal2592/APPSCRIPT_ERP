'use strict';
/* S28 — تحليلات الموارد البشرية: SHRM turnover plus the director metrics
 * (hrMetricsReport_: headcount, retention, early turnover, tenure, mix, age,
 * absence, lateness, overtime, leave, penalties, payroll, revenue per
 * employee, contracts) over one hand-computed fixture.
 * The real hrTurnoverReport_ (plus the status helpers it reuses) is extracted
 * from Company_ValleyFoods_Actions.js and run over a fixture status history:
 * monthly start/end headcount, the average, separations by category, the
 * monthly rate and the sum-of-monthly-rates period rate, same-date
 * corrections, a separation with no active row before it, a second
 * non-active row, a future-dated separation, the employee-type, department
 * and title filters, the breakdowns and the data-quality counts. Plus wiring
 * scans (registry row, dispatch map, ACTION_TABLES, PAGE_VIEWS, register
 * call, nav item, boot markers) and a render of the real page through
 * pageharness. Nothing touches a spreadsheet, a Google service or the
 * network. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

const ACTIVE = 'يعمل بالشركة';
function slice(from, to) {
  const a = SRC.indexOf(from), b = SRC.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('cannot locate ' + from);
  return SRC.slice(a, b);
}
const block = slice('  function monthlySalaryEmployeeKey_(', '  /* Count active calendar days') +
  slice('  var HR_TURNOVER_CATEGORY = {', '  function getDeductionRoles_(');
const api = new Function('env', 'with (env) {\n' + block + '\nreturn { turnover: hrTurnoverReport_, metrics: hrMetricsReport_ };\n}')({
  ACTIVE_STATUS: ACTIVE,
  pad2_: function (n) { return n < 10 ? '0' + n : '' + n; }
});
const report = api.turnover;

console.log('\n1 — SHRM monthly and period rates\n');
const d = (y, m, day) => new Date(y, m - 1, day);
const BASMA = 'موظف بصمة', DAILY = 'عمالة يومية';
const employees = [1, 2, 3, 4, 5, 6, 7, 9, 10].map(function (id) {
  return { emp_id: id, name_ar: 'موظف ' + id, section: id <= 3 ? 'الإنتاج' : 'المخازن', title: id === 2 ? 'مشرف' : 'عامل',
    employee_type: id === 10 ? DAILY : BASMA, hiring_date: id === 4 ? d(2024, 1, 1) : '',
    gender: id === 5 ? 'انثى' : 'ذكر', insurance: id === 1 ? true : id === 5 ? 'TRUE' : false, category: 'المصنع',
    national_id: id === 1 ? '29001011234567' : id === 5 ? '26805151234567' : id === 10 ? '123' : '' };
});
const S = (code, type, date) => ({ Employee_Code: code, Status_Type: type, Status_Date: date });
const statuses = [
  S(1, ACTIVE, d(2025, 1, 1)),
  S(2, ACTIVE, d(2025, 6, 1)), S(2, 'استقالة', d(2026, 3, 15)),
  S(3, ACTIVE, d(2026, 2, 10)), S(3, 'انهاء تعاقد', d(2026, 2, 28)),
  S(4, 'استقالة', d(2026, 5, 31)),                                      // no active row before it
  S(5, ACTIVE, d(2025, 1, 1)), S(5, 'استقالة', d(2026, 4, 10)), S(5, ACTIVE, d(2026, 4, 10)), // same-day correction
  S(6, ACTIVE, d(2025, 1, 1)), S(6, 'الوفاة', d(2026, 7, 1)),
  S(8, ACTIVE, 'not a date'),
  S(9, ACTIVE, d(2025, 1, 1)), S(9, 'استقالة', d(2026, 8, 1)), S(9, 'انقطاع عن العمل', d(2026, 8, 20)),
  S(10, ACTIVE, d(2025, 1, 1)), S(10, 'استقالة', d(2026, 10, 20))    // after "today"
];
const r = report(employees, statuses, { year: 2026, today_key: 20261001 });
const byMonth = {}; r.months.forEach(m => { byMonth[m.month] = m; });

check(r.months.length === 10, 'months run January..October (today is 2026-10-01)', r.months.length);
check(byMonth[10].partial === true && byMonth[9].partial === false, 'only the current month is partial');
check(byMonth[1].begin === 7 && byMonth[1].end === 7 && byMonth[1].rate === 0, 'January: 7 → 7, no separations', JSON.stringify(byMonth[1]));
check(byMonth[2].begin === 7 && byMonth[2].end === 7 && byMonth[2].hires === 1 && byMonth[2].separations === 1 &&
  byMonth[2].involuntary === 1 && byMonth[2].rate === 14.29, 'February: a hire and an involuntary separation, 1 / 7 = 14.29%', JSON.stringify(byMonth[2]));
check(byMonth[3].begin === 7 && byMonth[3].end === 6 && byMonth[3].avg_headcount === 6.5 && byMonth[3].rate === 15.38,
  'March: resignation, average (7 + 6) / 2, 1 / 6.5 = 15.38%', JSON.stringify(byMonth[3]));
check(byMonth[4].separations === 0 && byMonth[4].hires === 0 && byMonth[4].end === 6,
  'April: a same-date correction is neither a separation nor a hire', JSON.stringify(byMonth[4]));
check(byMonth[5].begin === 6 && byMonth[5].end === 5 && byMonth[5].voluntary === 1,
  'May: a separation with no earlier active row was employed before it (from hiring_date)', JSON.stringify(byMonth[5]));
check(byMonth[7].begin === 5 && byMonth[7].end === 4 && byMonth[7].other === 1,
  'July: separation dated day 1 — still counted at the start, gone at the end, category other', JSON.stringify(byMonth[7]));
check(byMonth[8].separations === 1, 'August: a second non-active row is not a second separation', JSON.stringify(byMonth[8]));
check(byMonth[10].begin === 3 && byMonth[10].end === 3 && byMonth[10].separations === 0,
  'October: a separation dated after today is not counted yet', JSON.stringify(byMonth[10]));
for (let m = 1; m < 10; m++) {
  if (byMonth[m].end !== byMonth[m + 1].begin) check(false, 'end of month ' + m + ' equals start of month ' + (m + 1));
}
check(true, 'every month ends where the next begins');

const t = r.totals;
check(t.separations === 5 && t.voluntary === 3 && t.involuntary === 1 && t.other === 1, 'period separations 5 = 3 voluntary + 1 involuntary + 1 other', JSON.stringify(t));
check(t.rate === 98.65, 'period rate = sum of monthly rates (98.65%)', t.rate);
check(Math.abs(t.voluntary_rate + t.involuntary_rate + t.other_rate - t.rate) <= 0.02, 'category rates add up to the total rate');
check(t.annualized_rate === 118.37, 'annualized = 98.6457 / 10 × 12 = 118.37%', t.annualized_rate);
check(t.begin === 7 && t.end === 3 && t.hires === 1, 'period start 7, end 3, one hire', JSON.stringify(t));

console.log('\n2 — lists, filters and data quality\n');
check(r.separations.length === 5 && r.separations[0].emp_id === '3' && r.separations[0].tenure_days === 19,
  'separated list in date order; tenure counts both the start day and the last day', JSON.stringify(r.separations[0]));
check(r.separations.filter(s => s.emp_id === '4')[0].start_date === '2024-01-01', 'implicit start is reported from hiring_date');
const prod = r.sections.filter(s => s.section === 'الإنتاج')[0];
check(prod && prod.separations === 2 && prod.hires === 1, 'section breakdown follows the employee section', JSON.stringify(prod));
check(r.separation_types[0].status_type === 'استقالة' && r.separation_types[0].count === 3 && r.separation_types[0].share === 60,
  'separation types ranked, with their share', JSON.stringify(r.separation_types));
check(r.data_quality.no_status_count === 1 && r.data_quality.implicit_start_count === 1 && r.data_quality.invalid_date_count === 1,
  'data quality: one employee without status, one implicit start, one bad date', JSON.stringify(r.data_quality));
check(JSON.stringify(r.years) === '[2026,2025,2024]', 'year options run from today back to the earliest status', JSON.stringify(r.years));
check(JSON.stringify(r.employee_types) === JSON.stringify([BASMA, DAILY].sort()), 'employee type options come from the employee list');

const daily = report(employees, statuses, { year: 2026, today_key: 20261001, employee_type: DAILY });
check(daily.totals.separations === 0 && daily.months[0].begin === 1 && daily.data_quality.no_status_count === 0,
  'employee-type filter limits every count to that type', JSON.stringify(daily.totals));
const prodOnly = report(employees, statuses, { year: 2026, today_key: 20261001, section: 'الإنتاج' });
check(prodOnly.months[0].begin === 2 && prodOnly.months[1].rate === 50 && prodOnly.months[2].rate === 66.67 &&
  prodOnly.totals.rate === 116.67 && prodOnly.totals.separations === 2,
  'department filter: headcount and separations both limited to الإنتاج (50% + 66.67%)', JSON.stringify(prodOnly.totals));
check(prodOnly.data_quality.no_status_count === 0 && prodOnly.section === 'الإنتاج', 'department filter applies to the data-quality counts too');
const supervisors = report(employees, statuses, { year: 2026, today_key: 20261001, title: 'مشرف' });
check(supervisors.months[2].begin === 1 && supervisors.months[2].end === 0 && supervisors.months[2].rate === 200 &&
  supervisors.totals.separations === 1, 'title filter: one supervisor leaving out of an average of 0.5 is 200%', JSON.stringify(supervisors.months[2]));
const none = report(employees, statuses, { year: 2026, today_key: 20261001, section: 'المخازن', title: 'مشرف' });
check(none.totals.separations === 0 && none.months[0].begin === 0 && none.totals.rate === 0, 'department + title combine (AND)');
check(r.section_options.join(',') === ['الإنتاج', 'المخازن'].sort((a, b) => a.localeCompare(b, 'ar')).join(','), 'department options from the employee list', JSON.stringify(r.section_options));
check(r.title_options.some(o => o.title === 'مشرف' && o.section === 'الإنتاج') && r.title_options.length === 3,
  'title options carry their department (so the page can narrow them)', JSON.stringify(r.title_options));
const sup = r.titles.filter(x => x.title === 'مشرف')[0];
check(sup && sup.separations === 1 && r.titles.length === 2, 'title breakdown alongside the department one', JSON.stringify(r.titles));
const lastYear = report(employees, statuses, { year: 2025, today_key: 20261001 });
check(lastYear.months.length === 12 && lastYear.totals.annualized_rate === lastYear.totals.rate, 'a closed year has 12 months and no projection');
check(report([], [], { year: 2027, today_key: 20261001 }).months.length === 0, 'a future year has no months');

console.log('\n3 — wiring scans\n');
{
  const reg = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Registry.js'), 'utf8');
  const nav = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Nav.html'), 'utf8');
  check(/action:\s*'vf_hr_analysis',\s*template:\s*'Company_ValleyFoods_HR_Analysis'/.test(reg), 'registry page registered with its template');
  check(/'get_valley_hr_turnover':\s*\{\s*page:\s*'vf_hr_analysis',\s*access:\s*'read'\s*\}/.test(SRC), 'dispatch map gates read on vf_hr_analysis');
  check(/'get_valley_hr_turnover':\s*'valley_employee_status'/.test(SRC), 'ACTION_TABLES maps the status sheet');
  const views = (/'vf_hr_analysis':\s*\{\s*'report':\s*\[([^\]]*)\]/.exec(SRC) || [])[1] || '';
  check(['valley_employee_status', 'valley_employee_info', 'valley_emp_salaries', 'valley_emp_deductions', 'valley_employee_vacations',
    'valley_employee_vacation_allocation', 'valley_employee_contracts', 'valley_sales_invoices'].every(t => views.indexOf("'" + t + "'") !== -1),
    'PAGE_VIEWS watches every sheet the metrics read', views);
  check(/'get_valley_hr_metrics':\s*\{\s*page:\s*'vf_hr_analysis',\s*access:\s*'read'\s*\}/.test(SRC), 'metrics read gated on vf_hr_analysis');
  check(/ValleyFoods\.register\('get_valley_hr_metrics',\s*getValleyHrMetrics_\)/.test(SRC), 'metrics action registered');
  check(/ValleyFoods\.register\('get_valley_hr_turnover',\s*getValleyHrTurnover_\)/.test(SRC), 'action registered on the dispatcher');
  const hr = nav.slice(nav.indexOf("label: 'الموارد البشرية'"), nav.indexOf("label: 'الانتاج'"));
  check(hr.indexOf("action: 'vf_hr_analysis'") !== -1, 'nav item sits under الموارد البشرية');
  const pagePath = path.join(ROOT, 'Company_ValleyFoods_HR_Analysis.html');
  const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
  check(!!page, 'page template exists');
  check(page.indexOf('PAGE_PARAMS') !== -1 && page.indexOf('USER_PAGES') !== -1, 'unified boot scriptlets present');
  check(page.indexOf('VALLEYFOODS_MENU') !== -1, 'unified nav menu bound');
  check(/turnover:\s*'get_valley_hr_turnover'/.test(page) && /metrics:\s*'get_valley_hr_metrics'/.test(page) &&
    page.indexOf('companyCall(SOURCES[sid], f)') !== -1, 'page reads both sources with the shared filters');
  check(page.indexOf('window.HR_ANALYSIS') !== -1, 'page namespace published');
  check(page.indexOf("select('hra-section'") !== -1 && page.indexOf("select('hra-title'") !== -1, 'page has department and title filters');
  check(/return \{ year: YEAR, employee_type: EMP_TYPE, section: SECTION, title: TITLE \}/.test(page), 'every metric receives both filters');
  check(page.indexOf('hra-titles-tbl') !== -1, 'page shows the by-title breakdown');
}

console.log('\n4 — director metrics (hrMetricsReport_)\n');
/* Same people and status history as section 1; payroll, deductions, leave,
   contracts and sales added around them. Expected values worked by hand. */
const metricsSrc = {
  employees: employees,
  statuses: statuses,
  salaries: [
    { emp_id: 1, year: 2026, month: 1, working_days: 30, working_hours: 8, overtime_days: 12, overtime_days_value: 300, working_days_value: 3000, vacation_days_value: 0, other_addition: 0, net_salary: 3200 },
    { emp_id: 1, year: 2026, month: 2, working_days: 30, working_hours: 8, overtime_days: 0, overtime_days_value: 0, working_days_value: 3000, vacation_days_value: 0, other_addition: 0, net_salary: 2900 },
    { emp_id: 5, year: 2026, month: 1, working_days: 30, working_hours: '', overtime_days: 0, overtime_days_value: 0, working_days_value: 2000, vacation_days_value: 0, other_addition: 0, net_salary: 2000 },
    { emp_id: 10, year: 2026, month: 1, working_days: 20, working_hours: 8, overtime_days: 0, overtime_days_value: 0, working_days_value: 1000, vacation_days_value: 0, other_addition: 0, net_salary: 1000 },
    { emp_id: 1, year: 2025, month: 12, working_days: 30, working_hours: 8, net_salary: 99999 }
  ],
  deduction_roles: [
    { rule_unique_id: 'R1', deduction_category: 'غياب' },
    { rule_unique_id: 'R2', deduction_category: 'جزاءات' },
    { rule_unique_id: 'R3', deduction_category: 'حضور وانصراف' }
  ],
  deductions: [
    { emp_id: 1, deduction_type: 'R1', date: d(2026, 1, 10), number_of_days: 2 },   // absence, paid month
    { emp_id: 1, deduction_type: 'R3', date: d(2026, 2, 5), number_of_days: 0 },    // late, paid month
    { emp_id: 5, deduction_type: 'R1', date: d(2026, 3, 3), number_of_days: 1 },    // absence, no payroll yet
    { emp_id: 10, deduction_type: 'R2', date: d(2026, 1, 15), number_of_days: 1 },  // penalty
    { emp_id: 1, deduction_type: 'R1', date: d(2025, 12, 1), number_of_days: 5 }    // before the period
  ],
  vacation_types: [{ id: 1, vacation_name_ar: 'اعتيادية' }],
  allocations: [
    { unique_id: 'A1', emp_id: 1, vacation_type: 1, vacation_alloc_start_Date: d(2026, 1, 1), vacation_alloc_end_Date: d(2026, 12, 31), number_of_days: 21 },
    { unique_id: 'A2', emp_id: 5, vacation_type: 1, vacation_alloc_start_Date: d(2025, 1, 1), vacation_alloc_end_Date: d(2025, 12, 31), number_of_days: 21 }
  ],
  vacations: [
    { emp_id: 1, allocation_id: 'A1', vacation_type: 1, start_date: d(2026, 3, 1), duration_days: 3 },
    { emp_id: 1, allocation_id: 'A1', vacation_type: 1, start_date: d(2026, 6, 1), duration_days: 2 },
    { emp_id: 5, allocation_id: 'A2', vacation_type: 1, start_date: d(2025, 6, 1), duration_days: 5 }
  ],
  contract_types: [{ id: 1, contract_name_ar: 'محدد المدة' }],
  contracts: [
    { emp_id: 1, contract_Type: 1, contract_start_Date: d(2025, 10, 21), contract_end_Date: d(2026, 10, 20) },
    { emp_id: 5, contract_Type: 1, contract_start_Date: d(2025, 1, 1), contract_end_Date: d(2026, 1, 1) },
    { emp_id: 5, contract_Type: 1, contract_start_Date: d(2026, 1, 2), contract_end_Date: '' }
  ],
  invoices: [
    { invoice_unique_id: 'INV1', 'تاريخ الفاتورة': d(2026, 1, 20) },
    { invoice_unique_id: 'INV2', 'تاريخ الفاتورة': d(2026, 5, 1) },
    { invoice_unique_id: 'INV3', 'تاريخ الفاتورة': d(2025, 12, 30) }
  ],
  sales_lines: [
    { valley_sales_header_id: 'INV1', product_net_value: 10000 },
    { valley_sales_header_id: 'INV1', product_net_value: 2000 },
    { valley_sales_header_id: 'INV2', product_net_value: 5000 },
    { valley_sales_header_id: 'INV3', product_net_value: 999 }
  ],
  sales_returns: [{ valley_return_date: d(2026, 1, 25), valley_return_value: 1000 }]
};
const M = api.metrics(metricsSrc, { year: 2026, today_key: 20261001 });
const w = M.workforce;
check(w.headcount_start === 7 && w.headcount_end === 3 && w.growth === -57.14 && w.hires === 1 && w.separations === 5,
  'headcount 7 → 3 (−57.14%), one hire, five separations', JSON.stringify(w));
check(w.avg_headcount === 5.1, 'average headcount is the turnover card’s (mean of monthly averages = 5.1)', w.avg_headcount);
check(M.retention.start === 7 && M.retention.retained === 3 && M.retention.rate === 42.86 && M.retention.left.length === 4,
  'retention: 3 of 7 stayed (the same-day correction stays retained, a future separation is not yet a loss)', JSON.stringify(M.retention));
check(M.early_turnover.d90.cohort === 1 && M.early_turnover.d90.left === 1 && M.early_turnover.d90.rate === 100 &&
  M.early_turnover.list.length === 1 && M.early_turnover.list[0].days === 19, 'early turnover: the February hire left on day 19', JSON.stringify(M.early_turnover));
check(M.tenure.count === 3 && M.tenure.avg_years === 1.75 && M.tenure.bands[0].label === '1 - 3 سنوات',
  'tenure of the three active at period end: 639 days ≈ 1.75 years', JSON.stringify(M.tenure));
const women = M.mix.gender.filter(g => g.label === 'انثى')[0];
check(M.mix.total === 3 && women && women.share === 33.33 && M.mix.insured === 2 && M.mix.insured_rate === 66.67,
  'mix: 1 of 3 women, insurance read from true and "TRUE"', JSON.stringify(M.mix));
check(M.age.count === 2 && M.age.unknown === 1 && M.age.avg === 47 && M.age.near_retirement.length === 1 &&
  M.age.near_retirement[0].retirement_date === '2028-05-15', 'age from the national ID: 36 and 58 (near retirement), a bad ID is unknown', JSON.stringify(M.age));
const pt = M.payroll.totals;
check(pt.employee_months === 4 && pt.net === 9100 && pt.per_employee === 2275 && pt.months === 2,
  'payroll: 4 employee-months of the year (the 2025 row ignored), 2,275 a month each', JSON.stringify(pt));
check(pt.absence_days === 2 && pt.working_days === 110 && pt.absence_rate === 1.82 && M.absence.unpaid_absence_days === 1,
  'absenteeism 2 / 110 = 1.82%; absence in a month without payroll reported, not counted', JSON.stringify(pt));
check(pt.late === 1 && pt.late_per_employee === 0.25, 'lateness: 1 incident over 4 employee-months', JSON.stringify(pt));
check(pt.overtime_ratio === 1.36 && pt.overtime_share === 3.23,
  'overtime: 12 h of 880 regular (blank working_hours → 8) = 1.36%; 300 of 9,300 gross = 3.23%', JSON.stringify(pt));
check(M.penalties.incidents === 1 && M.penalties.per_100 === 19.61, 'penalties per 100 employees = 1 / 5.1 × 100', JSON.stringify(M.penalties));
check(M.leave.allocated === 21 && M.leave.used === 5 && M.leave.usage_rate === 23.81 && M.leave.taken === 5,
  'leave: 5 of 21 allocated days used; last year’s allocation left out', JSON.stringify(M.leave));
check(M.revenue.available && M.revenue.net === 16000 && M.revenue.per_employee === 3137.25 && M.revenue.labor_cost_ratio === 82.73,
  'revenue = lines − returns in the period (16,000); labor ratio uses only months with payroll (9,100 / 11,000)', JSON.stringify(M.revenue));
const c = M.contracts;
check(c.active === 3 && c.d30 === 1 && c.open_ended === 1 && c.none === 1 && c.list.length === 2 && c.list[0].state === 'none' &&
  c.list[1].days_left === 19, 'contracts: one ends in 19 days, the latest contract wins (open-ended), one employee has none', JSON.stringify(c));
const MS = api.metrics(metricsSrc, { year: 2026, today_key: 20261001, section: 'المخازن' });
check(!MS.revenue.available && MS.filtered, 'revenue per employee is company-wide only: off under a department filter');
check(MS.payroll.totals.employee_months === 2 && MS.workforce.headcount_start === 5,
  'department filter narrows payroll and headcount alike', JSON.stringify({ pay: MS.payroll.totals.employee_months, start: MS.workforce.headcount_start }));
const empty = api.metrics({ employees: [], statuses: [] }, { year: 2027, today_key: 20261001 });
check(empty.status === 'success' && empty.payroll.totals.employee_months === 0, 'a future year with no data still answers');

console.log('\n5 — the page renders the report\n');
(async function () {
  const { bootPage, flush } = require('./pageharness');
  const sent = [];
  const sb = bootPage({
    page: 'Company_ValleyFoods_HR_Analysis.html',
    isSuperAdmin: true,
    containers: ['vf-hra-content', 'hra-filter', 'hra-body'],
    scriptlets: { CURRENT_ACTION: "'vf_hr_analysis'", PAGE_PARAMS: '{}' },
    call: function (action, data) {
      sent.push({ action: action, data: data });
      const o = Object.assign({ today_key: 20261001 }, data);
      return action === 'get_valley_hr_metrics' ? api.metrics(metricsSrc, o) : report(employees, statuses, o);
    }
  });
  try {
    sb.HR_ANALYSIS.renderApp();
    await flush(); await flush(); await flush();
    const body = sb.document.getElementById('hra-body').innerHTML;
    const filter = sb.document.getElementById('hra-filter').innerHTML;
    check(sent.some(c => c.action === 'get_valley_hr_turnover') && sent.some(c => c.action === 'get_valley_hr_metrics'),
      'page loads through both sources');
    const ids = ['turnover', 'headcount', 'retention', 'early', 'tenure', 'diversity', 'age', 'absence', 'lateness',
      'overtime', 'leave', 'penalties', 'payroll', 'revenue', 'contracts'];
    check((body.match(/class="hra-metric"/g) || []).length === 15 && ids.every(id => body.indexOf('data-metric="' + id + '"') !== -1),
      'director view: fifteen cards, one per metric');
    check((body.match(/class="hra-group"/g) || []).length === 4, 'cards grouped under four headings');
    check(body.indexOf('hra-metric-error') === -1 && body.indexOf(' disabled>') === -1, 'every card rendered and is clickable');
    check(body.indexOf('42.9%') !== -1 && body.indexOf('2,275') !== -1 && body.indexOf('1.8%') !== -1 && body.indexOf('3,137') !== -1,
      'cards show retention, monthly cost, absenteeism and revenue per employee');
    const failedOpen = ids.filter(function (id) {
      try {
        sb.HR_ANALYSIS.openDetail(id);
        const m = sb.document.getElementById('hra-detail-modal');
        return !m || m.innerHTML.indexOf('data-panel=') === -1;
      } catch (e) { return true; }
    });
    check(failedOpen.length === 0, 'every card opens its details popup', failedOpen.join(', '));
    sb.HR_ANALYSIS.closeDetail();
    check(body.indexOf('98.7%') !== -1 && body.indexOf('118.4%') !== -1, 'card shows the period rate and the projection');
    check(body.indexOf('hra-months-tbl') === -1 && body.indexOf('hra-chart-plot') === -1, 'card stays compact: no tables or full chart on the page');
    check(filter.indexOf('كل الأقسام') !== -1 && filter.indexOf('كل المسميات') !== -1, 'filter bar offers department and title');
    sb.HR_ANALYSIS.openDetail('turnover');
    const modal = sb.document.getElementById('hra-detail-modal');
    const mh = modal ? modal.innerHTML : '';
    check(!!modal, 'clicking the card opens the details modal');
    check(mh.indexOf('98.65%') !== -1 && (mh.match(/class="hra-col/g) || []).length === 12, 'modal summary: exact rate and the monthly chart');
    check(['summary', 'monthly', 'reasons', 'sections', 'titles', 'people'].every(t => mh.indexOf('data-panel="' + t + '"') !== -1),
      'modal tabs: summary, monthly, reasons, departments, titles, leavers');
    check(mh.indexOf('مشرف') !== -1 && mh.indexOf('الإنتاج') !== -1, 'department and title breakdowns inside the modal');
    sb.HR_ANALYSIS.setSection('الإنتاج');
    await flush(); await flush(); await flush();
    const last = sent[sent.length - 1].data;
    check(last.section === 'الإنتاج' && sb.document.getElementById('hra-body').innerHTML.indexOf('116.7%') !== -1,
      'choosing a department reloads the card with that department’s rate');
  } catch (e) {
    check(false, 'page render', e && e.stack);
  }
  console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
