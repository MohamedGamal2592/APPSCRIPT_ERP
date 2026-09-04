/**
 * Company_ValleyFoods_Registry.js
 * RESPONSIBILITY: Register Valley Foods for Agriculture Products with the
 * control plane — ONE call, nothing else. Action logic will live in
 * Company_ValleyFoods_Actions.js (IIFE namespace `ValleyFoods`).
 * The company_unique_id '9940659bd83035d7' must match an ERP_Companies row
 * for the dashboard double-gate.
 */

// NOTE: The real `ValleyFoods` namespace is defined in Company_ValleyFoods_Actions.js
// (loaded later). We must NOT redeclare it here — doing so would collide at the
// project scope and break every Valley Foods action. registerValleyFoods_() runs
// at doGet time (after all files are loaded), so it can safely reference it.

function registerValleyFoods_() {
  registerCompany_('9940659bd83035d7', {
    dispatch: ValleyFoods.dispatch_,
    pageForAction: ValleyFoods.pageForAction_,
    tableForAction: ValleyFoods.tableForAction_,
    // §2.1 Table Catalog — metadata only, no schema change
    tables: [
      { id: 'vf_products_tbl', sheetName: 'vf_products', pkColumn: 'id', labelAr: 'المنتجات', pageId: 'vf_products' },
      { id: 'vf_parties_tbl', sheetName: 'vf_parties', pkColumn: 'id', labelAr: 'العملاء والموردون', pageId: 'vf_parties' },
      { id: 'vf_mfg_orders_tbl', sheetName: 'vf_mfg_orders', pkColumn: 'id', labelAr: 'أوامر التصنيع', pageId: 'vf_mfg_orders' }
    ],
    pages: [
      // First page = main dashboard (navigable; default nav:true)
      { action: 'vf_dashboard', template: 'Company_ValleyFoods_Dashboard', title: 'Valley Foods — Dashboard', label: 'لوحة التحكم' },
      { action: 'vf_kpi', template: 'Company_ValleyFoods_KPI', title: 'Valley Foods — المؤشرات', label: 'المؤشرات' },

      // ----- الموارد البشرية -----
      { action: 'vf_hr_employees', template: 'Company_ValleyFoods_HR_Emp', title: 'قائمة الموظفين', label: 'قائمة الموظفين', nav: false },
      { action: 'vf_hr_status', template: 'Company_ValleyFoods_HR_Emp', title: 'حالة الموظفين', label: 'حالة الموظفين', nav: false },
      { action: 'vf_hr_shifts', template: 'Company_ValleyFoods_HR_Emp', title: 'تحديد الورديات', label: 'تحديد الورديات', nav: false },
      { action: 'vf_hr_salary', template: 'Company_ValleyFoods_HR_Emp', title: 'راتب الموظف', label: 'راتب الموظف', nav: false },

      // -----Modules إضافية -----
      { action: 'vf_hr_deductions', template: 'Company_ValleyFoods_Deductions', title: 'الغياب والخصومات', nav: false },
      { action: 'vf_hr_contracts', template: 'Company_ValleyFoods_Contracts', title: 'العقود', nav: false },
      { action: 'vf_hr_vacation_alloc', template: 'Company_ValleyFoods_VacationAlloc', title: 'تخصيص الإجازات', nav: false },
      { action: 'vf_hr_vacations', template: 'Company_ValleyFoods_Vacations', title: 'الإجازات', nav: false },
      { action: 'vf_hr_overtime', template: 'Company_ValleyFoods_Overtime', title: 'العمل الإضافي', nav: false },
      { action: 'vf_hr_monthly_salaries', template: 'Company_ValleyFoods_MonthlySalaries', title: 'الرواتب الشهرية', nav: false },
      { action: 'vf_hr_attendance', template: 'Company_ValleyFoods_Attendance', title: 'الحضور والانصراف', nav: false },

      // ----- إعدادات شؤون الموظفين (جداول مرجعية) -----
      { action: 'vf_hr_settings_overtime', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات العمل الإضافي', label: 'إعدادات العمل الإضافي', nav: false },
      { action: 'vf_hr_settings_deduction', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات الخصومات', label: 'إعدادات الخصومات', nav: false },
      { action: 'vf_hr_settings_vacations', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات الإجازات', label: 'إعدادات الإجازات', nav: false },
      { action: 'vf_hr_settings_shifts', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات الورديات', label: 'إعدادات الورديات', nav: false },

      // ----- المالية (بيانات أساسية) -----
      { action: 'vf_products', template: 'Company_ValleyFoods_Products', title: 'المنتجات', label: 'المنتجات', nav: false },
      { action: 'vf_parties', template: 'Company_ValleyFoods_Parties', title: 'العملاء والموردون', label: 'العملاء والموردون', nav: false },
      { action: 'vf_cash', template: 'Company_ValleyFoods_Cash', title: 'حركة النقدية والبنوك', label: 'حركة النقدية والبنوك', nav: false },
      { action: 'vf_sales', template: 'Company_ValleyFoods_Sales', title: 'المبيعات', label: 'المبيعات', nav: false },
      { action: 'vf_sales_returns', template: 'Company_ValleyFoods_SalesReturns', title: 'مرتجعات المبيعات', label: 'مرتجعات المبيعات', nav: false },
      { action: 'vf_purchasing', template: 'Company_ValleyFoods_Purchasing', title: 'تكلفة المشتريات', label: 'المشتريات', nav: false },
      { action: 'vf_mfg_recipes', template: 'Company_ValleyFoods_MfgRecipes', title: 'وصفات التصنيع (BOM)', label: 'وصفات التصنيع', nav: false },
      { action: 'vf_mfg_orders', template: 'Company_ValleyFoods_MfgOrders', title: 'أوامر التصنيع', label: 'أوامر التصنيع', nav: false },
      { action: 'vf_mfg_order', template: 'Company_ValleyFoods_MfgOrderView', title: 'أمر تصنيع', label: 'أمر تصنيع', nav: false },

      // الانتاج — خطوط الإنتاج والأصول
      { action: 'vf_workcenters', template: 'Company_ValleyFoods_WorkCenters', title: 'خطوط الإنتاج', label: 'خطوط الإنتاج', nav: false },
      { action: 'vf_asset_technical', template: 'Company_ValleyFoods_AssetTechnical', title: 'الأصول والماكينات', label: 'الأصول والماكينات', nav: false },
      { action: 'vf_work_center_assets', template: 'Company_ValleyFoods_WorkCenterAssets', title: 'أصول خطوط الإنتاج', label: 'أصول خطوط الإنتاج', nav: false }
    ]
  });
}
