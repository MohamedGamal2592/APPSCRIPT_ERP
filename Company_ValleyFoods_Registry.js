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
    themeCss: ValleyFoods.themeCss_,
    blockTheme: ValleyFoods.blockTheme_,
    approvalPolicy: ValleyFoods.approvalPolicy_,
    // Resolve lazily: document-policy initialization may register companies
    // before Company_ValleyFoods_Actions.js finishes defining this function.
    attachmentPolicy: function () { return ValleyFoods.attachmentPolicy_(); },
    artifactHandlers: function () { return ValleyFoods.artifactHandlers_ || {}; },
    // §2.1 Table Catalog — metadata only, no schema change
    tables: [
      { id: 'vf_products_tbl', sheetName: 'vf_products', pkColumn: 'id', labelAr: 'الاصناف وتحركاتها', pageId: 'vf_products' },
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
      { action: 'vf_hr_shifts', template: 'Company_ValleyFoods_ShiftAssignment', title: 'تحديد الورديات', label: 'تحديد الورديات', nav: false },
      { action: 'vf_hr_salary', template: 'Company_ValleyFoods_Salary', title: 'راتب الموظف', label: 'راتب الموظف', nav: false },

      // -----Modules إضافية -----
      { action: 'vf_hr_deductions', template: 'Company_ValleyFoods_Deductions', title: 'الغياب والخصومات', nav: false },
      { action: 'vf_hr_contracts', template: 'Company_ValleyFoods_Contracts', title: 'العقود', nav: false },
      { action: 'vf_hr_vacation_alloc', template: 'Company_ValleyFoods_VacationAlloc', title: 'تخصيص الإجازات', nav: false },
      { action: 'vf_hr_vacations', template: 'Company_ValleyFoods_Vacations', title: 'الإجازات', nav: false },
      { action: 'vf_hr_overtime', template: 'Company_ValleyFoods_Overtime', title: 'العمل الإضافي', nav: false },
      { action: 'vf_hr_monthly_salaries', template: 'Company_ValleyFoods_MonthlySalaries', title: 'الرواتب الشهرية', nav: false },
      { action: 'vf_hr_attendance', template: 'Company_ValleyFoods_Attendance', title: 'الحضور والانصراف', nav: false },
      /* NOTE: its own grantable page — needs a row in ERP_Pages_Matrix before a
         non-super-admin can open it or see it in the الموارد البشرية menu. */
      { action: 'vf_hr_analysis', template: 'Company_ValleyFoods_HR_Analysis', title: 'تحليلات الموارد البشرية', label: 'تحليلات الموارد البشرية', nav: false },

      // ----- إعدادات شؤون الموظفين (جداول مرجعية) -----
      { action: 'vf_hr_settings_overtime', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات العمل الإضافي', label: 'إعدادات العمل الإضافي', nav: false },
      { action: 'vf_hr_settings_deduction', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات الخصومات', label: 'إعدادات الخصومات', nav: false },
      { action: 'vf_hr_settings_vacations', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات الإجازات', label: 'إعدادات الإجازات', nav: false },
      { action: 'vf_hr_settings_shifts', template: 'Company_ValleyFoods_HR_Settings', title: 'إعدادات الورديات', label: 'إعدادات الورديات', nav: false },

      // ----- المالية (بيانات أساسية) -----
      { action: 'vf_products', template: 'Company_ValleyFoods_Products', title: 'الاصناف وتحركاتها', label: 'الاصناف وتحركاتها', nav: false },
      { action: 'vf_parties', template: 'Company_ValleyFoods_Parties', title: 'العملاء والموردون', label: 'العملاء والموردون', nav: false },
      { action: 'vf_cash', template: 'Company_ValleyFoods_Cash', title: 'حركة النقدية والبنوك', label: 'حركة النقدية والبنوك', nav: false },
      { action: 'vf_income_statement', template: 'Company_ValleyFoods_IncomeStatement', title: 'Valley Foods — قائمة الدخل', label: 'قائمة الدخل' },
      /* NOTE: this page id needs its own row in ERP_Pages_Matrix before anyone
         can open it — see NEXT_STEPS_OWNER.md. Its DATA action is gated on
         vf_cash, so only the route needs the grant. */
      { action: 'vf_cash_expenses', template: 'Company_ValleyFoods_CashExpenses', title: 'تقرير المصروفات', label: 'تقرير المصروفات', nav: false },
      /* NOTE: same pattern as vf_cash_expenses above — own route row, data gated on vf_cash. */
      { action: 'vf_cash_incomes', template: 'Company_ValleyFoods_CashIncomes', title: 'تقرير الايرادات الاخرى', label: 'تقرير الايرادات الاخرى', nav: false },
      { action: 'vf_cash_box_balances', template: 'Company_ValleyFoods_CashBoxBalances', title: 'تقرير أرصدة الصناديق', label: 'تقرير أرصدة الصناديق', nav: false, accessPage: 'vf_cash' },
      { action: 'vf_sales', template: 'Company_ValleyFoods_Sales', title: 'المبيعات', label: 'المبيعات', nav: false },
      { action: 'vf_sales_returns', template: 'Company_ValleyFoods_SalesReturns', title: 'مرتجعات المبيعات', label: 'مرتجعات المبيعات', nav: false },
      { action: 'vf_sales_print', template: 'Company_ValleyFoods_SalesPrint', title: 'طباعة فاتورة مبيعات', label: 'طباعة فاتورة مبيعات', nav: false },
      { action: 'vf_sales_report', template: 'Company_ValleyFoods_SalesReport', title: 'تقرير المبيعات', label: 'تقرير المبيعات', nav: false },
      { action: 'vf_purchasing', template: 'Company_ValleyFoods_Purchasing', title: 'تكلفة المشتريات', label: 'المشتريات', nav: false },
      { action: 'vf_purchasing_report', template: 'Company_ValleyFoods_PurchasingReport', title: 'تقرير المشتريات', label: 'تقرير المشتريات', nav: false },
      { action: 'vf_warehouse_movement', template: 'Company_ValleyFoods_WarehouseMovement', title: 'حركة المخزن', label: 'حركة المخزن', nav: false },
      { action: 'vf_mfg_recipes', template: 'Company_ValleyFoods_MfgRecipes', title: 'وصفات التصنيع (BOM)', label: 'وصفات التصنيع', nav: false },
      { action: 'vf_mfg_orders', template: 'Company_ValleyFoods_MfgOrders', title: 'أوامر التصنيع', label: 'أوامر التصنيع', nav: false },
      { action: 'vf_mfg_order', template: 'Company_ValleyFoods_MfgOrderView', title: 'أمر تصنيع', label: 'أمر تصنيع', nav: false },
      /* Client manufacturing report: own page, authority inherited from the
         orders page (same pattern as vf_cash_box_balances on vf_cash). */
      { action: 'vf_mfg_client_report', template: 'Company_ValleyFoods_MfgClientReport', title: 'تقرير تصنيع العملاء', label: 'تقرير تصنيع العملاء', nav: false, accessPage: 'vf_mfg_orders' },

      // الانتاج — خطوط الإنتاج والأصول
      { action: 'vf_workcenters', template: 'Company_ValleyFoods_WorkCenters', title: 'خطوط الإنتاج', label: 'خطوط الإنتاج', nav: false },
      { action: 'vf_asset_technical', template: 'Company_ValleyFoods_AssetTechnical', title: 'الأصول والماكينات', label: 'الأصول والماكينات', nav: false },
      { action: 'vf_work_center_assets', template: 'Company_ValleyFoods_WorkCenterAssets', title: 'أصول خطوط الإنتاج', label: 'أصول خطوط الإنتاج', nav: false },

      // ----- الجودة -----
      /* لوحة الجودة and الجودة العامة are reachable ONLY through the الجودة
         dropdown in Company_ValleyFoods_Nav.html. nav:false keeps them out of
         the top-level company nav (Code.js builds that list from the pages
         whose nav !== false); it is a PLACEMENT flag, never an access denial.
         The action, template, title and permission key of the dashboard are
         deliberately unchanged, so authorized deep links and grants keep
         working exactly as before. */
      { action: 'vf_quality_dashboard', template: 'Company_ValleyFoods_QualityDashboard', title: 'الجودة — لوحة المؤشرات', label: 'لوحة الجودة', nav: false },
      { action: 'vf_quality_general', template: 'Company_ValleyFoods_QualityGeneral', title: 'الجودة — الجودة العامة', label: 'الجودة العامة', nav: false },
      { action: 'vf_quality_sops', template: 'Company_ValleyFoods_QualitySops', title: 'الجودة — السياسات والاجراءات SOPs', label: 'السياسات والاجراءات SOPs', nav: false },
      { action: 'vf_quality_my_acks', template: 'Company_ValleyFoods_QualityMyAcks', title: 'الجودة — إقراراتي', label: 'إقراراتي', nav: false },
      { action: 'vf_quality_ncr', template: 'Company_ValleyFoods_QualityNcr', title: 'الجودة — عدم المطابقة و CAPA', label: 'عدم المطابقة (NCR)', nav: false },
      { action: 'vf_quality_audits', template: 'Company_ValleyFoods_QualityAudits', title: 'الجودة — التدقيق الداخلي', label: 'التدقيق الداخلي', nav: false },


      // ----- صلاحيات (رموز صلاحية، ليست صفحات) -----
      // U-46. valley_cost_view is a PERMISSION TOKEN, not a page. It has no
      // template on purpose: it exists so it appears in "صفحات النظام" and can
      // then be granted per role in "صلاحيات الأدوار". A role holding `write`
      // (or `full`) on it sees cost figures in purchasing, sales and
      // manufacturing; anything less sees quantities only.
      // nav:false keeps it out of every menu, and the two guards added
      // alongside this entry (Code.js router, getFirstAuthorizedPageForUser_)
      // keep a template-less entry from ever being navigated to.
      { action: 'valley_cost_view', title: 'إظهار التكاليف (صلاحية)', label: 'إظهار التكاليف', nav: false, permissionOnly: true }
    ]
  });
}

