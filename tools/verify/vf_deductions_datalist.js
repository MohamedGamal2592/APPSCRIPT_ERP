'use strict';

const { bootPage, flush } = require('./pageharness');

async function main() {
  const s = bootPage({
    page: 'Company_ValleyFoods_Deductions.html',
    isSuperAdmin: true,
    containers: ['vf-ded-content'],
    scriptlets: { CURRENT_ACTION: "'vf_hr_deductions'" },
    expose: ['load', 'renderDeductions', 'setDeductionTypeFilter', 'openFilteredDeductionModal'],
    call: action => action === 'get_deductions_data' ? ({
      status: 'success',
      rows: [
        { unique_id: 'D-2', emp_id: '2', name_ar: 'سلمى', deduction_type: 'rule-b', deduction_name: 'تأخير', deduction_category: 'خصومات تاخيرات', date: '2026-04-02', number_of_days: 0.5, penalty_value: 20, delay_type_minutes: 30, details: 'تأخير صباحي' },
        { unique_id: 'D-1', emp_id: '1', name_ar: 'أحمد', deduction_type: 'rule-a', deduction_name: 'غياب', deduction_category: 'خصومات الغياب', date: '2026-04-01', number_of_days: 1, penalty_value: 40, abscence_type_days: 2, details: 'غياب يوم' },
        { unique_id: 'D-3', emp_id: '3', name_ar: 'مها', deduction_type: 'rule-c', deduction_name: 'جزاء مالي', deduction_category: 'خصومات مالية مباشرة', date: '2026-04-03', number_of_days: 0, penalty_value: 75, details: 'خصم مباشر' }
      ],
      total: 4,
      employee_options: [{ value: '1', label: '1 — أحمد' }],
      role_options: [
        { value: 'rule-a', label: 'غياب', category: 'خصومات الغياب', deductionValue: null },
        { value: 'rule-b', label: 'تأخير', category: 'خصومات تاخيرات', deductionValue: 40 },
        { value: 'rule-c', label: 'جزاء مالي', category: 'خصومات مالية مباشرة', deductionValue: 40 },
        { value: 'rule-d', label: 'جزاء', category: 'خصومات جزاءات', deductionValue: null }
      ]
    }) : { status: 'success' }
  });
  s.exported('load')();
  for (let i = 0; i < 8; i++) await flush();

  let html = s.html('vf-ded-content');
  const table = s.__tables.find(t => t.containerId === 'vf-deductions-table');
  const checks = [];
  function check(ok, label) {
    checks.push(ok);
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label);
  }
  check(!!table, 'deductions render through the shared dataTable');
  check(html.includes('id="vf-ded-type-filter"') && html.includes('value="rule-a"') && html.includes('value="rule-b"'),
    'the above-table deduction_type filter includes the available types');
  check(html.includes('placeholder="بحث..."'), 'the dataTable universal search is present');
  check(html.includes('البحث العام في السجلات المعروضة فقط') && html.includes('عرض الكل للبحث في الكل'),
    'the universal search offers the existing show-all path when rows are truncated');
  check(table && table.opts.rows.length === 3, 'all rows are initially visible');
  check(table && table.opts.headers.some(h => h.key === 'deduction_metrics'),
    'unfiltered data list uses a per-row category metric column');

  s.exported('setDeductionTypeFilter')('rule-b');
  html = s.html('vf-ded-content');
  const filtered = s.__tables[s.__tables.length - 1];
  check(filtered.opts.rows.length === 1 && filtered.opts.rows[0].deduction_type_id === 'rule-b'
    && html.includes('selected') && filtered.opts.headers.some(h => h.key === 'delay_type_minutes')
    && !filtered.opts.headers.some(h => h.key === 'number_of_days' || h.key === 'penalty_value'),
    'selecting a delay deduction filters the table and shows only delay metrics');
  check(html.includes('openFilteredDeductionModal()'), 'the add action uses the currently selected type');

  s.exported('openFilteredDeductionModal')();
  const modal = s.html('vf-ded-modal');
  check(/id="deduction_type" value="rule-b"/.test(modal) && /id="deduction_type_display"[^>]*value="تأخير"/.test(modal),
    'the selected filter type is preselected by value and label in the add form');
  check(/id="deduction_type" value="rule-b"/.test(modal), 'the add form still submits the deduction_type field');
  check(modal.includes('id="ded-number-wrap"') && modal.includes('id="ded-penalty-wrap"')
    && modal.includes('id="penalty_value"') && !modal.includes('id="deduction_value_other"'),
    'the form has category-controlled days and penalty fields using the stored penalty_value field');
  s.exported('setDeductionTypeFilter')('rule-a');
  let absenceTable = s.__tables[s.__tables.length - 1];
  check(absenceTable.opts.headers.some(h => h.key === 'number_of_days')
    && absenceTable.opts.headers.some(h => h.key === 'abscence_type_days'),
    'absence list shows required days and calculated absence days');
  s.exported('setDeductionTypeFilter')('rule-c');
  let moneyTable = s.__tables[s.__tables.length - 1];
  check(moneyTable.opts.headers.some(h => h.key === 'penalty_value')
    && moneyTable.opts.rows[0].penalty_value === 75,
    'direct-financial list shows the saved penalty_value amount');
  s.exported('setDeductionTypeFilter')('rule-d');
  let penaltyTable = s.__tables[s.__tables.length - 1];
  check(penaltyTable.opts.headers.some(h => h.key === 'number_of_days')
    && penaltyTable.opts.headers.some(h => h.key === 'penalty_type_days'),
    'penalty list shows required days and calculated penalty days');

  if (checks.some(ok => !ok)) process.exitCode = 1;
  else console.log('vf_deductions_datalist: all assertions pass');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
