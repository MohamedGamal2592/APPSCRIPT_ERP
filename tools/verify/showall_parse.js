'use strict';
/* Parse-check every inline <script> block of the files touched by the
 * show-all unification (plus UI_Components.html itself). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  'UI_Components.html',
  'Company_TopChemical_CartonSizes.html',
  'Company_TopChemical_Barcode.html',
  'Company_TopChemical_EmployeeStatus.html',
  'Company_TopChemical_EmployeeSalary.html',
  'Company_TopChemical_EmpPermits.html',
  'Company_TopChemical_EmpOvertime.html',
  'Company_TopChemical_EmpDeductions.html',
  'Company_TopChemical_EmpSalaries.html',
  'Company_TopChemical_Debts.html',
  'Company_TopChemical_Trust.html',
  'Company_TopChemical_Purchasing.html',
  'Company_TopChemical_BudgetManufacture.html',
  'Company_TopChemical_ImportFollow.html',
  'Company_TopChemical_StockRevision.html',
  'Company_TopChemical_RegistrationPapers.html',
  'Company_TopChemical_CustomsOffice.html',
  'Company_TopChemical_ManufactureOrders.html',
  'Company_TopChemical_ProductsLive.html',
  'Company_TopChemical_ClientBalanceSheets.html',
  'Company_TopLight_Sales.html',
  'Company_TopLight_Purchasing.html',
  'Company_TopLight_Sales_Offer.html',
  'Company_ValleyFoods_Purchasing.html',
  'Company_ValleyFoods_Salary.html',
  'Company_ValleyFoods_ShiftAssignment.html',
  'Company_ValleyFoods_Attendance.html',
  'Company_ValleyFoods_Deductions.html',
  'Company_ValleyFoods_VacationAlloc.html',
  'Company_ValleyFoods_MonthlySalaries.html',
  'Company_ValleyFoods_Overtime.html',
  'Company_ValleyFoods_Vacations.html',
];

let failed = 0;
for (const f of FILES) {
  const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* Same substitution the page harness applies: Apps Script <?...?> scriptlets
     are server-rendered before the browser ever parses the JS. */
  const src = raw.replace(/<\?[\s\S]*?\?>/g, '0');
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1]).filter(s => s.trim());
  if (!blocks.length) { console.log('  WARN  ' + f + ' — no inline blocks'); continue; }
  blocks.forEach((code, i) => {
    try {
      new vm.Script(code, { filename: f + '#' + i });
      console.log('  PASS  ' + f + ' block ' + i + ' parses (' + code.length + ' chars)');
    } catch (e) {
      failed++;
      console.log('  FAIL  ' + f + ' block ' + i + ': ' + e.message);
    }
  });
}
console.log(failed === 0 ? '\nOK — all edited pages parse.' : '\nFAILED: ' + failed);
process.exit(failed === 0 ? 0 : 1);
