/**
 * S21 — تحديد الورديات, and تقرير المصروفات.
 *
 * Both carry real rules that a text search cannot check, so both are EXTRACTED
 * from the real source and RUN against stubbed sheet access:
 *
 *   the shift assignment must refuse an end date that is not after the start,
 *   and must refuse a second shift for one employee over days already covered;
 *
 *   the expenses report must select accounts by «المستوى الاساسي» = 3 and
 *   nothing else, label them by «كود المستوى», and have its percentages add up.
 *
 * Nothing here touches a spreadsheet, a Google service or the network.
 *
 * Run: node tools/verify/s21_shifts_and_expenses.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const REG = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Registry.js'), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}
function throws(fn) { try { fn(); return null; } catch (e) { return e.message; } }

/** Run a slice of the real source with `env` supplying everything it closes over. */
function runBlock(block, env, exportsExpr) {
  return new Function('env', 'with (env) {\n' + block + '\nreturn ' + exportsExpr + ';\n}')(env);
}

/* ══ 1. تحديد الورديات ══════════════════════════════════════════════════ */
console.log('\n1 — تحديد الورديات: the two rules the table is supposed to hold\n');
{
  const START = SRC.indexOf('  // ===================== 3) SHIFT ASSIGNMENT =====================');
  const END = SRC.indexOf('  // ===================== 4) SALARY =====================', START);
  check(START !== -1 && END > START, 'the shift block can be located in the real source');

  const block = SRC.slice(START, END);

  function world(existing) {
    const state = { added: null };
    const TABLES = {
      'valley_employee_shift_assignment': existing.slice(),
      'valley_employee_shift_schedule': [
        { shift_unique_id: 'S1', shift_name: 'الوردية الصباحية', shift_type: 'صباحي',
          shift_start_time: '1899-12-30T08:00:00', shift_end_time: '1899-12-30T16:00:00' },
        { shift_unique_id: 'S2', shift_name: 'الوردية المسائية', shift_type: 'مسائي',
          shift_start_time: '1899-12-30T16:00:00', shift_end_time: '1899-12-30T23:30:00' }
      ],
      'valley_employee_info': [{ emp_id: 7, name_ar: 'أحمد' }, { emp_id: 9, name_ar: 'سعيد' }],
      'valley_employee_status': [
        { Employee_Code: 7, Status_Type: 'يعمل بالشركة', Status_Date: '2026-01-01' },
        { Employee_Code: 9, Status_Type: 'يعمل بالشركة', Status_Date: '2026-01-01' }
      ]
    };
    const env = {
      SHIFT_ASSIGN_SHEET: 'valley_employee_shift_assignment',
      SHIFT_SCHEDULE_SHEET: 'valley_employee_shift_schedule',
      EMP_INFO_SHEET: 'valley_employee_info',
      EMP_STATUS_SHEET: 'valley_employee_status',
      ACTIVE_STATUS: 'يعمل بالشركة',
      SHIFT_ASSIGN_HEADERS: ['shift_assignment_id', 'emp_id', 'shift_id', 'shift_start_date',
        'shift_end_date', 'notes', 'user', 'created_at'],
      ensureSheet_: () => {},
      getAllRecords_: (dbId, name) => {
        if (!TABLES[name]) throw new Error('no fixture for ' + name);
        return TABLES[name].map(r => Object.assign({}, r));
      },
      addRecord_: (dbId, name, row) => {
        state.added = Object.assign({}, row);
        TABLES[name].push(Object.assign({}, row));
        return { status: 'success', data: { assignedId: 1, newRowNumber: 2 } };
      },
      logHistory_: () => {},
      uid16_: () => 'ffffffff00000001',
      toDate_: (v) => {
        if (v instanceof Date) return v;
        const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(v);
        return isNaN(d.getTime()) ? new Date() : d;
      },
      fmtTime_: (v) => {
        if (!v) return '';
        const d = (v instanceof Date) ? v : new Date(v);
        if (isNaN(d.getTime())) return String(v);
        const p = (n) => (n < 10 ? '0' + n : '' + n);
        return p(d.getHours()) + ':' + p(d.getMinutes());
      },
      getActiveEmployeeOptions_: () => [
        { value: 7, label: '7 — أحمد' }, { value: 9, label: '9 — سعيد' }
      ],
      getLatestStatusMap_: () => ({})
    };
    const H = runBlock(block, env,
      '{ get: getShiftAssignmentData_, add: addShiftAssignment_, label: shiftLabel_,' +
      ' dayNum: dayNum_, dateStr: dateOnlyStr_ }');
    return { H, state, TABLES };
  }

  /* -- the label the ref is shown by -- */
  {
    const { H } = world([]);
    const lbl = H.label({ shift_name: 'الوردية الصباحية', shift_type: 'صباحي',
      shift_start_time: '1899-12-30T08:00:00', shift_end_time: '1899-12-30T16:00:00' });
    check(lbl === 'الوردية الصباحية - 08:00 - 16:00 - صباحي',
      'the shift label is name - start - end - type, with the times formatted', lbl);
    check(H.label({ shift_name: 'بلا نوع', shift_start_time: '', shift_end_time: '', shift_type: '' })
      === 'بلا نوع', 'and a shift with no times or type degrades to just its name');
  }

  /* -- the dates -- */
  {
    const { H, state } = world([]);
    const base = { emp_id: 7, shift_id: 'S1', shift_start_date: '2026-03-01', notes: '' };
    check(/بعد تاريخ البداية/.test(
      throws(() => H.add(Object.assign({}, base, { shift_end_date: '2026-03-01' }), { email: 'u@v.t' }, 'db')) || ''),
      'an end date EQUAL to the start is refused');
    check(!!throws(() => H.add(Object.assign({}, base, { shift_end_date: '2026-02-20' }), { email: 'u@v.t' }, 'db')),
      'an end date BEFORE the start is refused');
    check(state.added === null, '  and neither wrote a row');
    check(!!throws(() => H.add(Object.assign({}, base, { shift_end_date: '' }), { email: 'u@v.t' }, 'db')),
      'a missing end date is refused');
    check(!!throws(() => H.add({ emp_id: '', shift_id: 'S1', shift_start_date: '2026-03-01', shift_end_date: '2026-03-10' }, { email: 'u@v.t' }, 'db')),
      'a missing employee is refused');
    check(!!throws(() => H.add({ emp_id: 7, shift_id: '', shift_start_date: '2026-03-01', shift_end_date: '2026-03-10' }, { email: 'u@v.t' }, 'db')),
      'a missing shift is refused');
  }

  /* -- one employee, one shift per period -- */
  {
    const existing = [{
      shift_assignment_id: 'A1', emp_id: 7, shift_id: 'S1',
      shift_start_date: '2026-03-10', shift_end_date: '2026-03-20', notes: '', user: 'x'
    }];
    const mk = (empId, s, e) => ({ emp_id: empId, shift_id: 'S2', shift_start_date: s, shift_end_date: e });

    const overlapping = [
      ['identical period', '2026-03-10', '2026-03-20'],
      ['strictly inside', '2026-03-12', '2026-03-15'],
      ['straddling the whole period', '2026-03-01', '2026-03-31'],
      ['overlapping the start', '2026-03-05', '2026-03-12'],
      ['overlapping the end', '2026-03-18', '2026-03-25'],
      ['touching on the first day', '2026-03-01', '2026-03-10'],
      ['touching on the last day', '2026-03-20', '2026-03-28']
    ];
    overlapping.forEach(function (c) {
      const { H, state } = world(existing);
      const err = throws(() => H.add(mk(7, c[1], c[2]), { email: 'u@v.t' }, 'db'));
      check(!!err && /نفس الفترة/.test(err), 'refused — ' + c[0] + ' (' + c[1] + ' → ' + c[2] + ')',
        err || 'NO ERROR: a second shift was accepted over days already covered');
      check(state.added === null, '  and nothing was written');
    });

    const allowed = [
      ['entirely before', '2026-02-01', '2026-03-09'],
      ['entirely after', '2026-03-21', '2026-04-01'],
      ['the day before it starts', '2026-03-05', '2026-03-09'],
      ['the day after it ends', '2026-03-21', '2026-03-30']
    ];
    allowed.forEach(function (c) {
      const { H, state } = world(existing);
      const err = throws(() => H.add(mk(7, c[1], c[2]), { email: 'u@v.t' }, 'db'));
      check(err === null, 'allowed — ' + c[0] + ' (' + c[1] + ' → ' + c[2] + ')', err);
      check(state.added !== null, '  and it was written');
    });

    /* the rule is per employee */
    {
      const { H, state } = world(existing);
      check(throws(() => H.add(mk(9, '2026-03-10', '2026-03-20'), { email: 'u@v.t' }, 'db')) === null,
        'a DIFFERENT employee may hold the very same period');
      check(state.added !== null, '  and it was written');
    }
  }

  /* -- what the row carries -- */
  {
    const { H, state } = world([]);
    H.add({ emp_id: '7', shift_id: 'S1', shift_start_date: '2026-03-01',
      shift_end_date: '2026-03-10', notes: '  ملاحظة  ' }, { email: 'hr@valley.test' }, 'db');
    const r = state.added;
    check(String(r.shift_assignment_id).length === 16, 'shift_assignment_id is a 16-char id');
    check(r.emp_id === 7, 'emp_id is stored as a number', JSON.stringify(r.emp_id));
    check(r.shift_id === 'S1', 'shift_id is the schedule key');
    check(r.notes === 'ملاحظة', 'notes are trimmed');
    check(r.user === 'hr@valley.test', 'user is the session email');
    check(r.created_at instanceof Date, 'created_at is a timestamp');
    check(r.shift_start_date instanceof Date && r.shift_end_date instanceof Date,
      'both dates are stored as dates, not text');
  }

  /* -- the list resolves ids to names, so the page renders in one call -- */
  {
    const { H } = world([{
      shift_assignment_id: 'A1', emp_id: 7, shift_id: 'S1',
      shift_start_date: '2026-03-10', shift_end_date: '2026-03-20', notes: 'n', user: 'x'
    }]);
    const out = H.get({ loadAll: true }, { email: 'u@v.t' }, 'db');
    check(out.status === 'success', 'the list loads');
    const row = out.assignments[0];
    check(row.employee_name === 'أحمد', 'each row carries the employee NAME', row.employee_name);
    check(row.shift_label === 'الوردية الصباحية - 08:00 - 16:00 - صباحي',
      'and the shift LABEL, not the id', row.shift_label);
    check(row.shift_start_date === '2026-03-10' && row.shift_end_date === '2026-03-20',
      'with dates as yyyy-MM-dd', row.shift_start_date + ' / ' + row.shift_end_date);
    check(Array.isArray(out.shiftOptions) && out.shiftOptions[0].label.indexOf(' - ') !== -1,
      'the shift options carry the same label the ref is shown by');
  }

  /* -- the page exists and is routable -- */
  {
    const PAGE_FILE = path.join(ROOT, 'Company_ValleyFoods_ShiftAssignment.html');
    check(fs.existsSync(PAGE_FILE), 'Company_ValleyFoods_ShiftAssignment.html exists');
    check(/action: 'vf_hr_shifts', template: 'Company_ValleyFoods_ShiftAssignment'/.test(REG),
      'vf_hr_shifts routes to it — reusing a page id that is ALREADY granted, so no ' +
      'new ERP_Pages_Matrix row is needed for it');
    if (fs.existsSync(PAGE_FILE)) {
      const P = fs.readFileSync(PAGE_FILE, 'utf8');
      check(P.indexOf('get_shift_assignment_data') !== -1 && P.indexOf('add_shift_assignment') !== -1,
        'and it calls both shift actions');
      check(/UIC\.combo\([^)]*key: 'f-emp'/.test(P.replace(/\s+/g, ' ')),
        'the employee picker is the searchable combo');
      check(/UIC\.combo\([^)]*key: 'f-shift'/.test(P.replace(/\s+/g, ' ')),
        'and so is the shift picker');
    }
  }
}

/* ══ 2. تقرير المصروفات ═════════════════════════════════════════════════ */
console.log('\n2 — تقرير المصروفات: selection by «المستوى الاساسي» = 3, and the maths\n');
{
  const START = SRC.indexOf('  function getValleyCashExpenseReport_(data, user, dbId) {');
  const END = SRC.indexOf('  function buildCashChartOptions_(dbId) {', START);
  check(START !== -1 && END > START, 'the report handler can be located in the real source');
  const block = SRC.slice(START, END);

  const CHART = [
    /* three expense accounts … */
    { 'المستوى الاساسي': 3, 'المستوى الخامس': 411100, 'كود المستوى': 'مصروفات إدارية' },
    { 'المستوى الاساسي': 3, 'المستوى الخامس': 411200, 'كود المستوى': 'مصروفات بيعية' },
    { 'المستوى الاساسي': 3, 'المستوى الخامس': 411300, 'كود المستوى': 'مصروفات تشغيل' },
    /* … and three that are NOT, including one that only looks like it */
    { 'المستوى الاساسي': 1, 'المستوى الخامس': 111100, 'كود المستوى': 'أصول' },
    { 'المستوى الاساسي': 2, 'المستوى الخامس': 211100, 'كود المستوى': 'التزامات' },
    { 'المستوى الاساسي': 4, 'المستوى الخامس': 511100, 'كود المستوى': 'إيرادات' }
  ];

  /* transaction_amount − total_discount + taxes, so `total` and the rebuild
     can be told apart. */
  const CASH = [
    { transaction_date: '2026-03-05', chart_code: 411100, total: 1000, transaction_amount: 1000, total_discount: 0, taxes: 0 },
    { transaction_date: '2026-03-20', chart_code: 411100, total: 500, transaction_amount: 500, total_discount: 0, taxes: 0 },
    { transaction_date: '2026-03-11', chart_code: 411200, total: 300, transaction_amount: 300, total_discount: 0, taxes: 0 },
    /* no `total` on the sheet — must be rebuilt as 250 − 50 + 20 = 220 */
    { transaction_date: '2026-03-15', chart_code: 411300, total: '', transaction_amount: 250, total_discount: 50, taxes: 20 },
    /* January, so it counts toward the year but not toward March */
    { transaction_date: '2026-01-09', chart_code: 411100, total: 700, transaction_amount: 700, total_discount: 0, taxes: 0 },
    /* not an expense account — must be excluded entirely */
    { transaction_date: '2026-03-07', chart_code: 511100, total: 9999, transaction_amount: 9999, total_discount: 0, taxes: 0 },
    { transaction_date: '2026-03-08', chart_code: 111100, total: 8888, transaction_amount: 8888, total_discount: 0, taxes: 0 },
    /* no chart code at all */
    { transaction_date: '2026-03-09', chart_code: '', total: 7777, transaction_amount: 7777, total_discount: 0, taxes: 0 },
    /* a different year */
    { transaction_date: '2025-03-05', chart_code: 411100, total: 6666, transaction_amount: 6666, total_discount: 0, taxes: 0 }
  ];

  const env = {
    FIN_CHART_SHEET: 'valley_chart_of_accounts',
    FIN_CASH_SHEET: 'valley_cash_bank_movement',
    VF_MONTH_NAMES_AR: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    getAllRecords_: (dbId, name) => {
      const T = { 'valley_chart_of_accounts': CHART, 'valley_cash_bank_movement': CASH };
      if (!T[name]) throw new Error('no fixture for ' + name);
      return T[name].map(r => Object.assign({}, r));
    },
    parseDate_: (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  };
  const H = runBlock(block, env, '{ report: getValleyCashExpenseReport_ }');

  const out = H.report({ year: 2026, month: 3 }, { email: 'u@v.t' }, 'db');
  check(out.status === 'success', 'the report runs');
  check(out.accounts_considered === 3,
    'exactly the three accounts whose «المستوى الاساسي» is 3 are considered',
    'got ' + out.accounts_considered);

  const byCode = {};
  out.rows.forEach(r => { byCode[r.chart_code] = r; });
  check(Object.keys(byCode).length === 3, 'three accounts appear in the report',
    Object.keys(byCode).join(','));
  check(!byCode['511100'] && !byCode['111100'],
    'a revenue account and an asset account are EXCLUDED — the column decides, not the code range');

  check(byCode['411100'].label === 'مصروفات إدارية',
    'the account is labelled by «كود المستوى»', byCode['411100'].label);

  /* March: 1000 + 500 = 1500, 300, and the rebuilt 220 → 2020 */
  check(byCode['411100'].month_amount === 1500, 'March for 411100 is 1000 + 500 = 1500',
    byCode['411100'].month_amount);
  check(byCode['411300'].month_amount === 220,
    'a row with no `total` on the sheet is rebuilt as 250 − 50 + 20 = 220',
    byCode['411300'].month_amount);
  check(out.totals.month_amount === 2020, 'the month total is 2020', out.totals.month_amount);

  /* Year to date adds January's 700; 2025 is a different year and excluded. */
  check(byCode['411100'].ytd_amount === 2200, 'the year adds January 700 → 2200',
    byCode['411100'].ytd_amount);
  check(out.totals.ytd_amount === 2720, 'the year total is 2720', out.totals.ytd_amount);

  /* percentages are of their OWN total, and they add up */
  const sumMonthPct = out.rows.reduce((a, r) => a + r.month_pct, 0);
  const sumYtdPct = out.rows.reduce((a, r) => a + r.ytd_pct, 0);
  check(Math.abs(sumMonthPct - 100) < 0.05, 'the month percentages add up to 100',
    sumMonthPct.toFixed(2));
  check(Math.abs(sumYtdPct - 100) < 0.05, 'the year percentages add up to 100', sumYtdPct.toFixed(2));
  check(Math.abs(byCode['411100'].month_pct - (1500 / 2020 * 100)) < 0.01,
    '1500 of 2020 is reported as ' + byCode['411100'].month_pct + '%');
  check(byCode['411100'].month_pct !== byCode['411100'].ytd_pct,
    'the month share and the year share are computed against different totals');

  /* ordering, so the biggest expense is first */
  check(out.rows[0].chart_code === '411100', 'rows are ordered by the month amount, biggest first',
    out.rows.map(r => r.chart_code).join(','));

  /* the monthly strip */
  check(out.months.length === 12, 'twelve months are returned for the trend');
  check(out.months[2].amount === 2020, 'March in the strip matches the month total',
    out.months[2].amount);
  check(out.months[0].amount === 700, 'January in the strip is 700', out.months[0].amount);
  check(out.months[0].label === 'يناير', 'months are labelled in Arabic', out.months[0].label);

  /* a month with nothing in it is empty, not an error */
  {
    const feb = H.report({ year: 2026, month: 2 }, { email: 'u@v.t' }, 'db');
    check(feb.totals.month_amount === 0, 'a month with no expenses totals zero');
    check(feb.rows.every(r => r.month_pct === 0),
      '  and every share is 0 rather than a division by zero',
      JSON.stringify(feb.rows.map(r => r.month_pct)));
    check(feb.totals.ytd_amount > 0, '  while the year to date still has its figures');
  }

  /* a year with nothing in it */
  {
    const old = H.report({ year: 2019, month: 5 }, { email: 'u@v.t' }, 'db');
    check(old.rows.length === 0 && old.totals.ytd_amount === 0,
      'a year with no expense movements returns an empty report, not an error');
  }

  check(!!throws(() => H.report({ year: 2026, month: 13 }, { email: 'u@v.t' }, 'db')),
    'a month outside 1..12 is refused');

  /* the report is gated on the page it reads */
  check(/'get_valley_cash_expense_report':\s*\{\s*page:\s*'vf_cash',\s*access:\s*'read'\s*\}/.test(SRC),
    "the action is read-only and gated on vf_cash, so it needs no new grant");
  check(/'get_valley_cash_expense_report':\s*'valley_cash_bank_movement'/.test(SRC),
    'and is mapped to the table it reads');
  check(/ValleyFoods\.register\('get_valley_cash_expense_report'/.test(SRC),
    'and is registered');

  /* the page, and the button that reaches it */
  {
    const PAGE_FILE = path.join(ROOT, 'Company_ValleyFoods_CashExpenses.html');
    check(fs.existsSync(PAGE_FILE), 'Company_ValleyFoods_CashExpenses.html exists');
    check(/action: 'vf_cash_expenses', template: 'Company_ValleyFoods_CashExpenses'/.test(REG),
      'and is registered as its own page');
    const CASH_PAGE = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Cash.html'), 'utf8');
    check(CASH_PAGE.indexOf('vf_cash_expenses') !== -1,
      'the cash page has a button that opens it');
  }
}

console.log('\n' + (failed === 0
  ? 'S21 — the shift rules and the expenses report both check out.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
