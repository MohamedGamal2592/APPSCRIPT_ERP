/**
 * Company_TopChemical_Registry.js
 * RESPONSIBILITY: Register Top Chemical with the control plane — ONE call,
 * nothing else. Action logic lives in Company_TopChemical_Actions.js (IIFE
 * namespace). The company_unique_id '3fe1b5cb67b7223e' must match an
 * ERP_Companies row for the dashboard double-gate.
 */

function registerTopChemical_() {
  registerCompany_('3fe1b5cb67b7223e', {
    dispatch: TopChemical.dispatch_,
    pageForAction: TopChemical.pageForAction_,
    tableForAction: TopChemical.tableForAction_,
    tables: [
      { id: 'tc_products_tbl', sheetName: 'top_chemical_products', pkColumn: 'id', labelAr: 'الأصناف', pageId: 'tc_products' },
      { id: 'tc_clients_tbl', sheetName: 'top_chemical_clients', pkColumn: 'id', labelAr: 'العملاء والموردون', pageId: 'tc_clients_vendors' },
      { id: 'tc_purchasing_tbl', sheetName: 'top_chemical_purchasing', pkColumn: 'id', labelAr: 'المشتريات', pageId: 'tc_purchasing' }
    ],
    pages: [
      { action: 'tc_dashboard', template: 'Company_TopChemical_Dashboard', title: 'Top Chemical — Dashboard', label: 'لوحة التحكم' },
      { action: 'tc_kpi', template: 'Company_TopChemical_KPI', title: 'Top Chemical — المؤشرات', label: 'المؤشرات' },
      { action: 'tc_clients_vendors', template: 'Company_TopChemical_Clients', title: 'عملاء وموردين', nav: false },
      { action: 'tc_debts', template: 'Company_TopChemical_Debts', title: 'مديونيات', nav: false },
      { action: 'tc_products', template: 'Company_TopChemical_Products', title: 'الأصناف', nav: false },
      { action: 'tc_barcode', template: 'Company_TopChemical_Barcode', title: 'باركود الإنتاج', nav: false },
      { action: 'tc_registration_papers', template: 'Company_TopChemical_RegistrationPapers', title: 'تصاريح وتراخيص', nav: false },
      { action: 'tc_trust', template: 'Company_TopChemical_Trust', title: 'عهد خاصة', nav: false },
      { action: 'tc_stock_revision', template: 'Company_TopChemical_StockRevision', title: 'جرد المخزون', nav: false },
      { action: 'tc_customs_office', template: 'Company_TopChemical_CustomsOffice', title: 'مكتب الجمارك', nav: false },
      { action: 'tc_purchasing', template: 'Company_TopChemical_Purchasing', title: 'توريدات ومشتريات', nav: false },
      { action: 'tc_import_follow', template: 'Company_TopChemical_ImportFollow', title: 'متابعة موافقات الاستيراد', nav: false },
      { action: 'tc_carton_sizes', template: 'Company_TopChemical_CartonSizes', title: 'مقاسات الكراتين والعبوات', nav: false },
      { action: 'tc_employee_reg', template: 'Company_TopChemical_Employees', title: 'تسجيل الموظفين', nav: false },
      { action: 'tc_employee_status', template: 'Company_TopChemical_EmployeeStatus', title: 'حالة الموظف', nav: false },
      { action: 'tc_employee_salary', template: 'Company_TopChemical_EmployeeSalary', title: 'راتب الموظف', nav: false },
      { action: 'tc_emp_deductions', template: 'Company_TopChemical_EmpDeductions', title: 'الغياب والخصومات', nav: false },
      { action: 'tc_emp_permits', template: 'Company_TopChemical_EmpPermits', title: 'الأذونات والتأخيرات', nav: false },
      { action: 'tc_emp_overtime', template: 'Company_TopChemical_EmpOvertime', title: 'العمل الإضافي', nav: false },
      { action: 'tc_emp_salaries', template: 'Company_TopChemical_EmpSalaries', title: 'صرف المرتبات الشهرية', nav: false },
      { action: 'tc_emp_salaries_close', template: 'Company_TopChemical_EmpSalariesClose', title: 'غلق المرتبات الشهرية', nav: false },
      { action: 'tc_budget_parties', template: 'Company_TopChemical_BudgetParties', title: 'عملاء وموردون قانونيون', nav: false },
      { action: 'tc_budget_stock_balance', template: 'Company_TopChemical_BudgetStockBalance', title: 'رصيد أصناف الميزانية', nav: false },
      { action: 'tc_budget_stock_movement', template: 'Company_TopChemical_BudgetStockMovement', title: 'حركة الأصناف (دفتر الجرد)', nav: false },
      { action: 'tc_budget_inputs', template: 'Company_TopChemical_BudgetInputs', title: 'المدخلات - اصول ومخزون', nav: false },
      { action: 'tc_budget_manufacture', template: 'Company_TopChemical_BudgetManufacture', title: 'تصنيع الميزانية', nav: false },
      { action: 'tc_budget_invoices', template: 'Company_TopChemical_BudgetInvoices', title: 'الفواتير الضريبية', nav: false },
      { action: 'tc_budget_cash', template: 'Company_TopChemical_BudgetCash', title: 'تحركات صناديق الميزانية', nav: false },
      { action: 'tc_budget_hr', template: 'Company_TopChemical_BudgetHR', title: 'شؤون العاملين القانونية', nav: false },
      { action: 'tc_budget_income', template: 'Company_TopChemical_BudgetIncome', title: 'قائمة الدخل السنوية', nav: false }
    ]
  });
}