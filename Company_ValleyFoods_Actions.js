/**
 * Company_ValleyFoods_Actions.js
 * RESPONSIBILITY: Valley Foods for Agriculture Products business logic,
 * IIFE-namespaced to ValleyFoods. Mirrors the Top Light / Top Chemical
 * structure: an internal `actions` map driven by `register()`, a
 * `PAGE_ACCESS` table feeding `guard_` (page-level access control), and
 * `pageForAction_`/`tableForAction_` for SystemLog enrichment.
 *
 * Action logic stays inside the IIFE namespace (the only global is ValleyFoods).
 * Every module action is registered as a TODO stub so the file loads and routes
 * cleanly — replace each stub with real logic as pages are built.
 */

/* Global cross-module reference micro-cache (Batch 2). Defined at file top
 * level so it is reachable from every IIFE namespace (HREmp, HRModules, Finance).
 * 60s TTL; save handlers bust the touched kinds instantly. */
var FIN_REF_TTL_G = 60;
function vfRefsCached_(dbId, kind, builder) {
  return getRefsCached_(dbId, kind, FIN_REF_TTL_G, builder);
}

const ValleyFoods = (function () {
  const actions = {};
  function register(name, fn) { actions[name] = fn; }

  const COMPANY_UID = '9940659bd83035d7';

  const HR_EMPLOYEES_SHEET = 'vf_hr_employees';
  const CURRENCY_SHEET = 'ERP_currency_exchange';

  const PAGE_ACCESS = {
    'get_dashboard_data': { page: 'vf_dashboard', access: 'read' },
    'get_kpi_data': { page: 'vf_kpi', access: 'read' },

    // قائمة الموظفين
    'get_employees_data': { page: 'vf_hr_employees', access: 'read' },
    'add_employee': { page: 'vf_hr_employees', access: 'write' },
    'get_hr_employees': { page: 'vf_hr_employees', access: 'read' },
    'add_hr_employees': { page: 'vf_hr_employees', access: 'write' },
    'get_valley_hr_page': { page: 'vf_hr_employees', access: 'read' },

    // حالة الموظفين
    'get_emp_status_data': { page: 'vf_hr_status', access: 'read' },
    'add_emp_status': { page: 'vf_hr_status', access: 'write' },

    // تحديد الورديات
    'get_shift_assignment_data': { page: 'vf_hr_shifts', access: 'read' },
    'add_shift_assignment': { page: 'vf_hr_shifts', access: 'write' },

    // راتب الموظف
    'get_salary_data': { page: 'vf_hr_salary', access: 'read' },
    'add_employee_salary': { page: 'vf_hr_salary', access: 'write' },

    // الغياب والخصومات
    'get_deductions_data': { page: 'vf_hr_deductions', access: 'read' },
    'add_deduction': { page: 'vf_hr_deductions', access: 'write' },

    // العقود
    'get_contracts_data': { page: 'vf_hr_contracts', access: 'read' },
    'add_contract': { page: 'vf_hr_contracts', access: 'write' },

    // تخصيص الإجازات
    'get_vacation_alloc_data': { page: 'vf_hr_vacation_alloc', access: 'read' },
    'add_vacation_alloc': { page: 'vf_hr_vacation_alloc', access: 'write' },

    // الإجازات
    'get_vacations_data': { page: 'vf_hr_vacations', access: 'read' },
    'add_vacation': { page: 'vf_hr_vacations', access: 'write' },

    // العمل الإضافي
    'get_overtime_data': { page: 'vf_hr_overtime', access: 'read' },
    'add_overtime': { page: 'vf_hr_overtime', access: 'write' },

    // الرواتب الشهرية
    'get_monthly_salaries_data': { page: 'vf_hr_monthly_salaries', access: 'read' },
    'add_monthly_salary': { page: 'vf_hr_monthly_salaries', access: 'write' },
    'generate_monthly_salaries': { page: 'vf_hr_monthly_salaries', access: 'write' },

    // الحضور والانصراف
    'get_attendance_sessions': { page: 'vf_hr_attendance', access: 'read' },
    'add_attendance_session': { page: 'vf_hr_attendance', access: 'write' },
    'get_attendance_data': { page: 'vf_hr_attendance', access: 'read' },
    'add_manual_attendance': { page: 'vf_hr_attendance', access: 'write' },
    'upload_attendance_csv': { page: 'vf_hr_attendance', access: 'write' },
    'analyze_attendance_csv': { page: 'vf_hr_attendance', access: 'read' },
    'get_attendance_report': { page: 'vf_hr_attendance', access: 'read' },

    // إعدادات شؤون الموظفين (جداول مرجعية)
    'get_overtime_roles_settings': { page: 'vf_hr_settings_overtime', access: 'read' },
    'save_overtime_role': { page: 'vf_hr_settings_overtime', access: 'write' },
    'toggle_overtime_role': { page: 'vf_hr_settings_overtime', access: 'full' },

    'get_deduction_roles_settings': { page: 'vf_hr_settings_deduction', access: 'read' },
    'save_deduction_role': { page: 'vf_hr_settings_deduction', access: 'write' },
    'toggle_deduction_role': { page: 'vf_hr_settings_deduction', access: 'full' },

    'get_vacations_index_settings': { page: 'vf_hr_settings_vacations', access: 'read' },
    'save_vacation_index': { page: 'vf_hr_settings_vacations', access: 'write' },
    'toggle_vacation_index': { page: 'vf_hr_settings_vacations', access: 'full' },

    'get_shift_schedule_settings': { page: 'vf_hr_settings_shifts', access: 'read' },
    'save_shift_schedule': { page: 'vf_hr_settings_shifts', access: 'write' },
    'toggle_shift_schedule': { page: 'vf_hr_settings_shifts', access: 'full' },

    // المالية — بيانات أساسية
    'get_valley_products': { page: 'vf_products', access: 'read' },
    'save_valley_product': { page: 'vf_products', access: 'write' },
    'get_valley_parties': { page: 'vf_parties', access: 'read' },
    'save_valley_party': { page: 'vf_parties', access: 'write' },
    'get_valley_party_statement': { page: 'vf_parties', access: 'read' },

    // المالية — حركة النقدية والبنوك
    'get_valley_cash': { page: 'vf_cash', access: 'read' },
    'save_valley_cash': { page: 'vf_cash', access: 'write' },
    'approve_valley_cash': { page: 'vf_cash', access: 'write' },
    'delete_valley_cash': { page: 'vf_cash', access: 'full' },
    'transfer_valley_cash': { page: 'vf_cash', access: 'write' },

    // المشتريات — valley_purchasing_costing (header) + valley_product_purchasing (lines)
    'get_valley_purchasing_costing': { page: 'vf_purchasing', access: 'read' },
    'get_valley_purchasing_lines': { page: 'vf_purchasing', access: 'read' },
    'save_valley_purchasing_costing': { page: 'vf_purchasing', access: 'write' },
    'delete_valley_purchasing_costing': { page: 'vf_purchasing', access: 'full' },
    'approve_valley_purchasing_costing': { page: 'vf_purchasing', access: 'write' },
    'quality_approve_valley_purchasing_costing': { page: 'vf_purchasing', access: 'write' },

    // المالية — المبيعات
    'get_valley_sales_bootstrap': { page: 'vf_sales', access: 'read' },
    'get_valley_sales_page': { page: 'vf_sales', access: 'read' },
    'get_valley_product_batches': { page: 'vf_sales', access: 'read' },

    // الانتاج — الوصفات
    'get_valley_mfg_recipes': { page: 'vf_mfg_recipes', access: 'read' },
    'save_valley_mfg_recipe': { page: 'vf_mfg_recipes', access: 'write' },

    // الانتاج — أوامر التصنيع
    'get_valley_mfg_orders': { page: 'vf_mfg_orders', access: 'read' },
    'get_valley_recipe_consumption': { page: 'vf_mfg_orders', access: 'read' },
    'save_valley_mfg_order': { page: 'vf_mfg_orders', access: 'write' },
    'approve_valley_mfg_order': { page: 'vf_mfg_orders', access: 'write' },
    'delete_valley_mfg_order': { page: 'vf_mfg_orders', access: 'full' },
    'get_valley_mfg_order_full': { page: 'vf_mfg_orders', access: 'read' },
    'get_valley_mfg_byproducts': { page: 'vf_mfg_orders', access: 'read' },
    'add_valley_mfg_byproduct': { page: 'vf_mfg_orders', access: 'write' },
    'get_valley_mfg_workops': { page: 'vf_mfg_orders', access: 'read' },
    'save_valley_mfg_workop': { page: 'vf_mfg_orders', access: 'write' },
    'control_valley_mfg_workop': { page: 'vf_mfg_orders', access: 'write' },
    'change_valley_mfg_status': { page: 'vf_mfg_orders', access: 'write' },
    'get_valley_recipe_plan': { page: 'vf_mfg_orders', access: 'read' },
    'get_valley_mfg_order_detail': { page: 'vf_mfg_orders', access: 'read' },
    'get_valley_product_batches_multi': { page: 'vf_sales', access: 'read' },

    // صفحة تفاصيل أمر التصنيع (مسار منفصل)
    'vf_mfg_order': { page: 'vf_mfg_order', access: 'read' },
    'get_valley_mfg_order_view': { page: 'vf_mfg_order', access: 'read' },

    'approve_valley_invoice': { page: 'vf_sales', access: 'write' },
    'delete_valley_invoice': { page: 'vf_sales', access: 'full' },
    'get_valley_invoice_lines': { page: 'vf_sales', access: 'read' },
    'save_valley_invoice': { page: 'vf_sales', access: 'write' },
    'get_valley_sales_list': { page: 'vf_sales', access: 'read' },
    'get_valley_invoice_full': { page: 'vf_sales', access: 'read' },

    // المالية — مرتجعات المبيعات
    'get_valley_returns_list': { page: 'vf_sales_returns', access: 'read' },
    'get_valley_invoice_for_return': { page: 'vf_sales_returns', access: 'read' },
    'save_valley_return': { page: 'vf_sales_returns', access: 'write' },

    // بيانات تجريبية
    'get_test_data': { page: 'vf_test_data', access: 'write' },
    'generate_test_data': { page: 'vf_test_data', access: 'write' },
    'remove_test_data': { page: 'vf_test_data', access: 'full' },

    // الانتاج — خطوط الإنتاج والأصول
    'get_valley_work_centers': { page: 'vf_workcenters', access: 'read' },
    'save_valley_work_center': { page: 'vf_workcenters', access: 'write' },
    'get_valley_asset_technicals': { page: 'vf_asset_technical', access: 'read' },
    'save_valley_asset_technical': { page: 'vf_asset_technical', access: 'write' },
    'get_valley_work_center_assets': { page: 'vf_work_center_assets', access: 'read' },
    'save_valley_work_center_asset': { page: 'vf_work_center_assets', access: 'write' },
    'prefetch_refs': { page: 'vf_dashboard', access: 'read' }
  };

  const ACTION_TABLES = {
    'get_hr_employees': HR_EMPLOYEES_SHEET, 'add_hr_employees': HR_EMPLOYEES_SHEET,
    'get_emp_status_data': HR_EMPLOYEES_SHEET, 'add_emp_status': HR_EMPLOYEES_SHEET,
    'get_shift_assignment_data': 'valley_employee_shift_assignment', 'add_shift_assignment': 'valley_employee_shift_assignment',
    'get_salary_data': 'valley_employee_salary', 'add_employee_salary': 'valley_employee_salary',
    'get_deductions_data': 'valley_emp_deductions', 'add_deduction': 'valley_emp_deductions',
    'get_contracts_data': 'valley_employee_contracts', 'add_contract': 'valley_employee_contracts',
    'get_vacation_alloc_data': 'valley_employee_vacation_allocation', 'add_vacation_alloc': 'valley_employee_vacation_allocation',
    'get_vacations_data': 'valley_employee_vacations', 'add_vacation': 'valley_employee_vacations',
    'get_overtime_data': 'valley_emp_overtime', 'add_overtime': 'valley_emp_overtime',
    'get_monthly_salaries_data': 'valley_emp_salaries', 'add_monthly_salary': 'valley_emp_salaries',
    'generate_monthly_salaries': 'valley_emp_salaries',
    'get_attendance_sessions': 'valley_attendance_session', 'add_attendance_session': 'valley_attendance_session',
    'get_attendance_data': 'valley_employee_attendance', 'add_manual_attendance': 'valley_employee_attendance',
    'upload_attendance_csv': 'valley_employee_attendance', 'analyze_attendance_csv': 'valley_employee_attendance',
    'get_attendance_report': 'valley_employee_attendance',

    'get_overtime_roles_settings': 'valley_employee_overtime_roles',
    'save_overtime_role': 'valley_employee_overtime_roles', 'toggle_overtime_role': 'valley_employee_overtime_roles',

    'get_deduction_roles_settings': 'valley_employee_deduction_roles',
    'save_deduction_role': 'valley_employee_deduction_roles', 'toggle_deduction_role': 'valley_employee_deduction_roles',

    'get_vacations_index_settings': 'valley_employee_vacations_index',
    'save_vacation_index': 'valley_employee_vacations_index', 'toggle_vacation_index': 'valley_employee_vacations_index',

    'get_shift_schedule_settings': 'valley_employee_shift_schedule',
    'save_shift_schedule': 'valley_employee_shift_schedule', 'toggle_shift_schedule': 'valley_employee_shift_schedule',

    'get_valley_products': 'valley_products',
    'save_valley_product': 'valley_products',
    'get_valley_parties': 'valley_legal_customer_vendor',
    'save_valley_party': 'valley_legal_customer_vendor',
    'get_valley_party_statement': 'valley_legal_customer_vendor',

    'get_valley_cash': 'valley_cash_bank_movement',
    'save_valley_cash': 'valley_cash_bank_movement',
    'transfer_valley_cash': 'valley_cash_bank_movement',

    'get_valley_sales_bootstrap': 'valley_sales_invoices',
    'get_valley_product_batches': 'valley_current_products',

    'get_valley_mfg_recipes': 'valley_product_recipe',
    'save_valley_mfg_recipe': 'valley_product_recipe',

    'get_valley_mfg_orders': 'valley_manufacture_header',
    'get_valley_recipe_consumption': 'valley_product_recipe_footer',
    'save_valley_mfg_order': 'valley_manufacture_header',
    'approve_valley_mfg_order': 'valley_manufacture_header',
    'delete_valley_mfg_order': 'valley_manufacture_header',
    'get_valley_mfg_order_full': 'valley_manufacture_header',
    'get_valley_mfg_byproducts': 'valley_manufacture_by_product',
    'add_valley_mfg_byproduct': 'valley_manufacture_by_product',
    'get_valley_mfg_workops': 'valley_manufacture_work_center',
    'save_valley_mfg_workop': 'valley_manufacture_work_center',
    'control_valley_mfg_workop': 'valley_manufacture_work_center',
    'change_valley_mfg_status': 'valley_manufacture_header',
    'get_valley_recipe_plan': 'valley_product_recipe',
    'get_valley_mfg_order_detail': 'valley_manufacture_header',
    'get_valley_product_batches_multi': 'valley_current_products',

    'vf_mfg_order': 'valley_manufacture_header',
    'get_valley_mfg_order_view': 'valley_manufacture_header',

    'get_valley_invoice_lines': 'valley_sales_products',
    'save_valley_invoice': 'valley_sales_invoices',
    'approve_valley_invoice': 'valley_sales_invoices',
    'delete_valley_invoice': 'valley_sales_invoices',
    'get_valley_sales_list': 'valley_sales_invoices',
    'get_valley_invoice_full': 'valley_sales_invoices',

    'get_valley_returns_list': 'valley_sales_returns',
    'get_valley_invoice_for_return': 'valley_sales_returns',
    'save_valley_return': 'valley_sales_returns',
    'add_upload_file': 'valley_emp_deductions',

    // بيانات تجريبية
    'get_test_data': 'valley_test_data_log',
    'generate_test_data': 'valley_test_data_log',
    'remove_test_data': 'valley_test_data_log',

    // الانتاج — خطوط الإنتاج والأصول
    'get_valley_work_centers': 'valley_work_centers',
    'save_valley_work_center': 'valley_work_centers',
    'get_valley_asset_technicals': 'valley_product_technical',
    'save_valley_asset_technical': 'valley_product_technical',
    'get_valley_work_center_assets': 'valley_work_center_assets',
    'save_valley_work_center_asset': 'valley_work_center_assets',
    'prefetch_refs': 'valley_products'
  };

  /** page for a module_action, reused for both access-control and logging. */
  function pageForAction_(action) {
    const req = PAGE_ACCESS[action];
    return req ? req.page : '';
  }

  /** Sheet/table touched by a module_action, for SystemLog Table column. */
  function tableForAction_(action) {
    return ACTION_TABLES[action] || '';
  }

  function guard_(user, action) {
    if (!user || user.isSuperAdmin) return;
    const req = PAGE_ACCESS[action];
    if (!req) return;
    if (!unifiedCheck_(user, '9940659bd83035d7', req.page, req.access)) {
      throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  function dispatch_(payload, user, dbId) {
    const action = payload.module_action;
    if (!actions[action]) throw new Error('Unknown Valley Foods action: ' + action);
    guard_(user, action);
    return actions[action](payload.data, user, dbId);
  }

  // ---- generic helpers (mirror Top Light / Top Chemical) ----
  function num0_(v) { return Math.max(0, Number(v) || 0); }

  function parseDate_(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return v;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(v);
  }

  function colLetter_(colIdx) {
    let s = ''; let n = colIdx + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function currencyOptions_() {
    try {
      return getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, CURRENCY_SHEET).map(function (r) {
        const code = String(r.currency).trim();
        return { value: code, label: code };
      });
    } catch (e) { return [{ value: 'EGP', label: 'EGP' }]; }
  }

  function uid16_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
  function uid8_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
  function pad2_(n) { return ('0' + Number(n)).slice(-2); }

  /** HH:MM string -> spreadsheet time fraction (day units). */
  function timeFrac_(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return '';
    var parts = t.split(':');
    if (parts.length < 2) return '';
    var h = Number(parts[0]) || 0;
    var m = Number(parts[1]) || 0;
    return (h * 60 + m) / 1440;
  }

  function colLetter_(colIdx) {
    let s = ''; let n = colIdx + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function pad2_(n) { return ('0' + Number(n)).slice(-2); }

  // ---- Dashboard (real-ish placeholder so the shell renders) ----
  function getDashboardData_(data, user, dbId) {
    const canViewKPIs = !!(user && (user.isSuperAdmin || (user.authorizedPages && user.authorizedPages['vf_dashboard'] && user.authorizedPages['vf_dashboard'].indexOf('write') !== -1)));
    return {
      status: 'success',
      kpi_authorized: canViewKPIs,
      kpi: canViewKPIs ? { totalNet: 0, totalSales: 0, totalTax: 0, totalCosts: 0 } : null,
      monthlyInvoices: [],
      topClients: [],
      monthlyCosts: [],
      note: 'TODO: implement vf dashboard aggregation'
    };
  }
  register('get_dashboard_data', getDashboardData_);

  // Independent KPI page — Read => welcome ("مرحباً بك في النظام..."), Write => KPI cards/charts
  function getKpiData_(data, user, dbId) {
    const canViewKPIs = !!(user && (user.isSuperAdmin || unifiedCheck_(user, '9940659bd83035d7', 'vf_kpi', 'write')));
    return {
      status: 'success',
      kpi_authorized: canViewKPIs,
      kpi: canViewKPIs ? { totalNet: 0, totalSales: 0, totalTax: 0, totalCosts: 0 } : null,
      kpis: canViewKPIs ? { totalNet: 0, totalSales: 0, totalTax: 0, totalCosts: 0 } : null,
      monthlyInvoices: [],
      topClients: [],
      monthlyCosts: [],
      note: 'VF KPI independent page'
    };
  }
  register('get_kpi_data', getKpiData_);

  return { dispatch_: dispatch_, pageForAction_: pageForAction_, tableForAction_: tableForAction_, register: register };
})();



/**
 * Company_ValleyFoods_HR_Emp_Actions.js
 * RESPONSIBILITY: "الموارد البشرية — موظفين" (HR Employees) module for Valley Foods.
 *   1) قائمة الموظفين      valley_employee_info
 *   2) حالة الموظفين       valley_employee_status
 *   3) تحديد الورديات       valley_employee_shift_assignment
 *   4) راتب الموظف         valley_employee_salary
 * Handlers are registered into the main ValleyFoods IIFE via ValleyFoods.register
 * so they route through ValleyFoods.dispatch_ / guard_ / tableForAction_.
 */

const ValleyFoodsHREmp = (function () {
  // ---- Sheet + column constants ----
  const EMP_INFO_SHEET = 'valley_employee_info';
  const EMP_STATUS_SHEET = 'valley_employee_status';
  const SHIFT_ASSIGN_SHEET = 'valley_employee_shift_assignment';
  const SALARY_SHEET = 'valley_employee_salary';
  const SHIFT_SCHEDULE_SHEET = 'valley_employee_shift_schedule';
  const TITLE_INDEX_SHEET = 'valley_title_index';

  const EMP_INFO_HEADERS = [
    'emp_id', 'employee_type', 'name_ar', 'national_id', 'hiring_date', 'title', 'section',
    'category', 'insurance', 'gender', 'schedule_id', 'الحالة الوظيفية', 'emp_id_1',
    'البطاقة صادرة من', 'العنوان بالبطاقة', 'user', 'created_at'
  ];
  const EMP_STATUS_HEADERS = [
    'unique_id', 'Employee_Code', 'Status_Type', 'Status_Date', 'Employee_name', 'user', 'created_at'
  ];
  const SHIFT_ASSIGN_HEADERS = [
    'shift_assignment_id', 'emp_id', 'shift_id', 'shift_start_date', 'shift_end_date', 'notes', 'user', 'created_at'
  ];
  const SALARY_HEADERS = [
    'unique_id', 'id', 'salary_date', 'emp_id', 'name_ar',
    'main_salary', 'allow', 'basic_salary', 'insurance_salary', 'insurance_allow', 'user', 'created_at'
  ];

  const EMPLOYEE_TYPES = ['موظف بصمة', 'موظف بدون بصمة', 'عمالة يومية'];
  const EMP_STATUS_TYPES = ['يعمل بالشركة', 'استقالة', 'انقطاع عن العمل', 'انهاء تعاقد', 'بلوغ سن التقاعد', 'الوفاة', 'معاه عجز'];
  const GENDERS = ['ذكر', 'انثى'];
  const CATEGORIES = ['المصنع', 'الميكروباص'];
  const ACTIVE_STATUS = 'يعمل بالشركة';

  // ---- helpers ----
  function uid16_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
  function uid8_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

  function toDate_(v) {
    if (v instanceof Date) return v;
    if (!v) return new Date();
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(v);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  function ensureSheet_(dbId, name, headers) {
    const key = String(dbId) + '|' + name;
    if (_ensuredSheets_[key]) return _ensuredSheets_[key];
    const ss = getSpreadsheet_(dbId);
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }
    _ensuredSheets_[key] = sheet;
    return sheet;
  }

  function fmtTime_(v) {
    if (!v) return '';
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function writeFormula_(dbId, sheetName, rowNumber, headerName, formula) {
    const sheet = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sheet);
    const idx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === headerName.toLowerCase(); });
    if (idx !== -1) sheet.getRange(rowNumber, idx + 1).setValue(formula);
  }

  /** Map of emp_code -> { status_type, date } keeping the latest status record. */
  function getLatestStatusMap_(dbId, statusesArg) {
    const statuses = statusesArg || getAllRecords_(dbId, EMP_STATUS_SHEET);
    const map = {};
    statuses.forEach(function (r) {
      const code = r.employee_code || r.Employee_Code;
      if (code === undefined || code === '') return;
      const key = String(code);
      const dt = r.status_date || r.Status_Date ? toDate_(r.status_date || r.Status_Date) : new Date(0);
      const statusType = r.status_type || r.Status_Type || '';
      const cur = map[key];
      if (!cur || dt >= cur.date) map[key] = { status_type: statusType, date: dt };
    });
    return map;
  }

  /** Compute the next emp_id based on employee_type ranges.
   *  Accepts an optional pre-loaded `employees` array so a caller that already
   *  has valley_employee_info in scope (e.g. getEmployeesData_) doesn't pay a
   *  redundant full read — falls back to fetching if not supplied. */
  function computeNextEmpId_(dbId, type, employees) {
    const emps = employees || getAllRecords_(dbId, EMP_INFO_SHEET);
    let max = 0;
    emps.forEach(function (r) {
      const id = Number(r.emp_id);
      if (!Number.isInteger(id)) return;
      if (type === 'موظف بصمة') { if (id > 0 && id < 10000 && id > max) max = id; }
      else if (type === 'موظف بدون بصمة') { if (id >= 10000 && id < 20000 && id > max) max = id; }
      else if (type === 'عمالة يومية') { if (id >= 20000 && id > max) max = id; }
    });
    if (max === 0) {
      if (type === 'موظف بصمة') return 1;
      if (type === 'موظف بدون بصمة') return 10000;
      return 20000;
    }
    return max + 1;
  }

  /** Active employees = latest status == "يعمل بالشركة". Returns combo options.
   *  Accepts optional pre-loaded `employees`/`statusMap` (falls back to fetching). */
  function getActiveEmployeeOptions_(dbId, employees, statusMap) {
    const emps = employees || getAllRecords_(dbId, EMP_INFO_SHEET);
    const stMap = statusMap || getLatestStatusMap_(dbId);
    const opts = [];
    emps.forEach(function (r) {
      const eid = r.emp_id;
      const st = stMap[String(eid)];
      if (st && st.status_type === ACTIVE_STATUS) {
        opts.push({ value: eid, label: (r.name_ar || String(eid)) });
      }
    });
    return opts;
  }

  /** title_index -> { options:[{value,label}], map:{ title: section } }. */
  function getTitleIndex_(dbId) {
    return vfRefsCached_(dbId, 'title_index', function () {
      let records = [];
      try { records = getAllRecords_(dbId, TITLE_INDEX_SHEET); } catch (e) { records = []; }
      const options = [];
      const map = {};
      records.forEach(function (r) {
        const t = String(r['Title Name'] != null ? r['Title Name'] : (r['title_name'] != null ? r['title_name'] : (r['title'] != null ? r['title'] : ''))).trim();
        const s = (r.section != null ? String(r.section) : '').trim();
        if (!t) return;
        options.push({ value: t, label: t });
        map[t] = s;
      });
      return { options: options, map: map };
    });
  }

  // ===================== 1) EMPLOYEES =====================
  function getEmployeesData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_INFO_SHEET, EMP_INFO_HEADERS);
    ensureSheet_(dbId, EMP_STATUS_SHEET, EMP_STATUS_HEADERS);
    const employees = getAllRecords_(dbId, EMP_INFO_SHEET);
    const statusMap = getLatestStatusMap_(dbId);
    const title = getTitleIndex_(dbId);

    const rows = employees.map(function (r) {
      const st = statusMap[String(r.emp_id)];
      r['الحالة الوظيفية'] = st ? st.status_type : '';
      return r;
    });

    const nextIds = {};
    EMPLOYEE_TYPES.forEach(function (t) { nextIds[t] = computeNextEmpId_(dbId, t, employees); });

    return {
      status: 'success',
      employees: rows,
      titleOptions: title.options,
      titleSectionMap: title.map,
      next_emp_ids: nextIds
    };
  }

  function addEmployee_(data, user, dbId) {
    const d = data || {};
    const employeeType = String(d.employee_type || '').trim();
    if (EMPLOYEE_TYPES.indexOf(employeeType) === -1) throw new Error('نوع الموظف غير صالح');

    const nameAr = String(d.name_ar || '').trim();
    if (!nameAr) throw new Error('اسم الموظف مطلوب');

    const nationalId = String(d.national_id || '').trim();
    if (!/^\d{14}$/.test(nationalId)) throw new Error('الرقم القومي يجب أن يكون 14 رقماً');

    /* Uniqueness check for national_id */
    var existingEmps = getAllRecords_(dbId, EMP_INFO_SHEET);
    for (var ei = 0; ei < existingEmps.length; ei++) {
      if (String(existingEmps[ei].national_id || '').trim() === nationalId) {
        throw new Error('الرقم القومي مسجل مسبقاً لهذا الموظف');
      }
    }

    const title = String(d.title || '').trim();
    if (!title) throw new Error('المسمى الوظيفي مطلوب');

    const category = String(d.category || 'المصنع').trim() || 'المصنع';
    if (CATEGORIES.indexOf(category) === -1) throw new Error('الفئة غير صالحة');

    const gender = String(d.gender || '').trim();
    if (GENDERS.indexOf(gender) === -1) throw new Error('النوع غير صالح');

    const scheduleId = d.schedule_id;
    if (scheduleId === undefined || scheduleId === null || String(scheduleId).trim() === '') {
      throw new Error('رقم الاتفاقية (schedule_id) مطلوب');
    }

    const cardIssuer = String(d['البطاقة صادرة من'] || d.card_issuer || '').trim();
    if (!cardIssuer) throw new Error('البطاقة صادرة من مطلوب');
    const cardAddress = String(d['العنوان بالبطاقة'] || d.card_address || '').trim();
    if (!cardAddress) throw new Error('العنوان بالبطاقة مطلوب');

    // section auto-fetched from valley_title_index
    let section = '';
    if (title) {
      const ti = getTitleIndex_(dbId);
      section = ti.map[title] || '';
    }

    const insurance = (d.insurance === true || d.insurance === 'true' || d.insurance === 'on');

    const empId = computeNextEmpId_(dbId, employeeType);

    const row = {
      emp_id: empId,
      employee_type: employeeType,
      name_ar: nameAr,
      national_id: nationalId,
      hiring_date: toDate_(d.hiring_date),
      title: title,
      section: section,
      category: category,
      insurance: insurance,
      gender: gender,
      schedule_id: Number(scheduleId),
      'الحالة الوظيفية': '',
      'emp_id_1': '',
      'البطاقة صادرة من': cardIssuer,
      'العنوان بالبطاقة': cardAddress,
      user: (user && user.email) || '',
      created_at: new Date()
    };

    const res = saveRecordWithAudit_(dbId, EMP_INFO_SHEET, null, row, 'create', (user && user.email) || '', null, [
      'emp_id', 'employee_type', 'name_ar', 'national_id', 'hiring_date', 'title',
      'category', 'insurance', 'gender', 'schedule_id', 'البطاقة صادرة من', 'العنوان بالبطاقة'
    ], null, 'emp_id');

    // emp_id_1 formula references the emp_id in the same row (column A)
    writeFormula_(dbId, EMP_INFO_SHEET, res.data.newRowNumber, 'emp_id_1', '=A' + res.data.newRowNumber);
    var tiMap = {};
    try { var ti = getTitleIndex_(dbId); tiMap = ti.map || {}; } catch(e){}
    var savedRecordEmp = {
      emp_id: empId, employee_type: employeeType, name_ar: nameAr, national_id: nationalId,
      hiring_date: toDate_(d.hiring_date), title: title, section: section, category: category,
      insurance: insurance, gender: gender, schedule_id: Number(scheduleId),
      'الحالة الوظيفية': '', 'emp_id_1': String(empId), 'البطاقة صادرة من': cardIssuer, 'العنوان بالبطاقة': cardAddress,
      titleSection: tiMap[title] || section,
      user: (user && user.email) || '', created_at: new Date()
    };
    return { status: 'success', message: 'تمت إضافة الموظف', data: { emp_id: empId }, record: savedRecordEmp };
  }

  // ===================== 2) EMPLOYEE STATUS =====================
  function getEmpStatusData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_STATUS_SHEET, EMP_STATUS_HEADERS);
    const _allSt = getAllRecords_(dbId, EMP_STATUS_SHEET);
    const limit = Number(data && data.limit) || 10;
    var statuses = _allSt.slice().reverse();
    const total = _allSt.length;
    if (!data || !data.loadAll) statuses = statuses.slice(0, limit);
    // enrich employee_name
    var _empMapSt = {};
    try { getAllRecords_(dbId, EMP_INFO_SHEET).forEach(function(e){ _empMapSt[String(e.emp_id)] = e.name_ar || String(e.emp_id); }); } catch(e){}
    statuses.forEach(function(r){ if (!r.employee_name) r.employee_name = _empMapSt[String(r.employee_code || r.Employee_Code)] || ''; });
    const employeeOptions = getActiveEmployeeOptions_(dbId);
    return { status: 'success', statuses: statuses, total: total, employeeOptions: employeeOptions };
  }

  function addEmpStatus_(data, user, dbId) {
    const d = data || {};
    const empCode = d.emp_id;
    if (empCode === undefined || empCode === '' || empCode === null) throw new Error('الموظف مطلوب');
    const statusType = String(d.status_type || '').trim();
    if (EMP_STATUS_TYPES.indexOf(statusType) === -1) throw new Error('نوع الحالة غير صالح');

    const newDate = toDate_(d.status_date);
    if (!newDate) throw new Error('التاريخ مطلوب');

    const statuses = getAllRecords_(dbId, EMP_STATUS_SHEET);
    const empKey = String(Number(empCode));
    for (var i = 0; i < statuses.length; i++) {
      const s = statuses[i];
      if (String(Number(s.employee_code)) === empKey) {
        const existingDate = toDate_(s.status_date);
        if (existingDate && newDate <= existingDate) {
          throw new Error('التاريخ يجب أن يكون أحدث من آخر حالة مسجلة (' + existingDate.toISOString().slice(0, 10) + ')');
        }
      }
    }

    const row = {
      unique_id: uid16_(),
      employee_code: Number(empCode),
      status_type: statusType,
      status_date: newDate,
      employee_name: '',
      user: (user && user.email) || '',
      created_at: new Date()
    };

    const res = addRecord_(dbId, EMP_STATUS_SHEET, row, ['employee_code', 'status_type', 'status_date']);

    writeFormula_(dbId, EMP_STATUS_SHEET, res.data.newRowNumber, 'employee_name',
      '=VLOOKUP(B' + res.data.newRowNumber + ',valley_employee_info!A:C,3,0)');

    try {
      const empSheet = getSheet_(EMP_INFO_SHEET, dbId);
      const empHeaders = getHeaders_(empSheet);
      const empData = empSheet.getDataRange().getValues();
      const empIdIdx = empHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'emp_id'; });
      const statusIdx = empHeaders.findIndex(function (h) { return String(h).trim() === 'الحالة الوظيفية'; });
      if (empIdIdx !== -1 && statusIdx !== -1) {
        for (var r = 1; r < empData.length; r++) {
          if (String(empData[r][empIdIdx]) === empKey) {
            empSheet.getRange(r + 1, statusIdx + 1).setValue(statusType);
            break;
          }
        }
      }
    } catch (e) { /* log but don't fail */ }
    var _empNameSt = '';
    try { var _allEmpsSt = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _est=0; _est<_allEmpsSt.length; _est++) { if (String(_allEmpsSt[_est].emp_id)===String(empCode)) { _empNameSt = _allEmpsSt[_est].name_ar || ''; break; } } } catch(e){}
    var savedRecordSt = {
      unique_id: row.unique_id, employee_code: Number(empCode), Employee_Code: Number(empCode),
      status_type: statusType, Status_Type: statusType,
      status_date: newDate, Status_Date: newDate,
      employee_name: _empNameSt || String(empCode), Employee_name: _empNameSt || String(empCode),
      user: (user && user.email) || '', created_at: new Date()
    };
    try{ logHistory_(dbId, EMP_STATUS_SHEET, row.record_uid || ('create_'+EMP_STATUS_SHEET+'_'+row.unique_id), row.unique_id, (user&&user.email)||'', 'create', row, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة الحالة', data: { unique_id: row.unique_id }, record: savedRecordSt };
  }

  // ===================== 3) SHIFT ASSIGNMENT =====================
  function getShiftAssignmentData_(data, user, dbId) {
    ensureSheet_(dbId, SHIFT_ASSIGN_SHEET, SHIFT_ASSIGN_HEADERS);
    ensureSheet_(dbId, SHIFT_SCHEDULE_SHEET,
      ['shift_unique_id', 'shift_name', 'shift_type', 'shift_start_time', 'shift_end_time']);

    const _allAssign = getAllRecords_(dbId, SHIFT_ASSIGN_SHEET);
    const limit = Number(data && data.limit) || 10;
    var assignments = _allAssign.slice().reverse();
    const total = _allAssign.length;
    if (!data || !data.loadAll) assignments = assignments.slice(0, limit);
    const employeeOptions = getActiveEmployeeOptions_(dbId);

    const shifts = getAllRecords_(dbId, SHIFT_SCHEDULE_SHEET);
    const shiftOptions = shifts.map(function (s) {
      const name = s.shift_name || '';
      const type = s.shift_type || '';
      const start = s.shift_start_time || '';
      const end = s.shift_end_time || '';
      const label = [name, (type ? '- ' + type : ''), '| من', fmtTime_(start), 'إلى', fmtTime_(end)]
        .filter(function (x) { return x !== ''; }).join(' ');
      return { value: s.shift_unique_id, label: label };
    });

    return { status: 'success', assignments: assignments, total: total, employeeOptions: employeeOptions, shiftOptions: shiftOptions };
  }

  function addShiftAssignment_(data, user, dbId) {
    const d = data || {};
    const empId = d.emp_id;
    if (empId === undefined || empId === '' || empId === null) throw new Error('الموظف مطلوب');
    const shiftId = d.shift_id;
    if (!shiftId) throw new Error('الوردية مطلوبة');
    if (!d.shift_start_date) throw new Error('تاريخ بداية الوردية مطلوب');
    if (!d.shift_end_date) throw new Error('تاريخ نهاية الوردية مطلوب');

    const row = {
      shift_assignment_id: uid16_(),
      emp_id: Number(empId),
      shift_id: shiftId,
      shift_start_date: toDate_(d.shift_start_date),
      shift_end_date: toDate_(d.shift_end_date),
      notes: String(d.notes || '').trim(),
      user: (user && user.email) || '',
      created_at: new Date()
    };

    var _resShift = addRecord_(dbId, SHIFT_ASSIGN_SHEET, row, ['emp_id', 'shift_id', 'shift_start_date', 'shift_end_date']);
    var _empNameShift = '';
    var _shiftLabel = '';
    try { var _allEmpsShift = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _esh=0; _esh<_allEmpsShift.length; _esh++) { if (String(_allEmpsShift[_esh].emp_id)===String(row.emp_id)) { _empNameShift = _allEmpsShift[_esh].name_ar || String(row.emp_id); break; } } } catch(e){}
    try { var _allShifts = getAllRecords_(dbId, SHIFT_SCHEDULE_SHEET); for (var _sh=0; _sh<_allShifts.length; _sh++) { if (String(_allShifts[_sh].shift_unique_id)===String(row.shift_id)) { _shiftLabel = _allShifts[_sh].shift_name || String(row.shift_id); break; } } } catch(e){}
    var savedRecordShift = {
      shift_assignment_id: row.shift_assignment_id, emp_id: row.emp_id, employee_name: _empNameShift || String(row.emp_id),
      shift_id: row.shift_id, shift_name: _shiftLabel || String(row.shift_id),
      shift_start_date: row.shift_start_date, shift_end_date: row.shift_end_date, notes: row.notes,
      user: row.user, created_at: row.created_at
    };
    try{ logHistory_(dbId, SHIFT_ASSIGN_SHEET, row.record_uid || ('create_'+SHIFT_ASSIGN_SHEET+'_'+row.shift_assignment_id), row.shift_assignment_id, (user&&user.email)||'', 'create', row, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة تعيين الوردية', data: { shift_assignment_id: row.shift_assignment_id }, record: savedRecordShift };
  }

  // ===================== 4) SALARY =====================
  function getSalaryData_(data, user, dbId) {
    ensureSheet_(dbId, SALARY_SHEET, SALARY_HEADERS);
    const _allSal = getAllRecords_(dbId, SALARY_SHEET);
    const limit = Number(data && data.limit) || 10;
    var salaries = _allSal.slice().reverse();
    const total = _allSal.length;
    if (!data || !data.loadAll) salaries = salaries.slice(0, limit);
    const employeeOptions = getActiveEmployeeOptions_(dbId);
    return { status: 'success', salaries: salaries, total: total, employeeOptions: employeeOptions };
  }

  function addEmployeeSalary_(data, user, dbId) {
    const d = data || {};
    const empId = d.emp_id;
    if (empId === undefined || empId === '' || empId === null) throw new Error('الموظف مطلوب');
    if (!d.salary_date) throw new Error('تاريخ الراتب مطلوب');

    // Validation: salary_date cannot be older than the existing max salary_date for same emp_id
    const salaries = getAllRecords_(dbId, SALARY_SHEET);
    let maxDate = null;
    salaries.forEach(function (r) {
      if (String(r.emp_id) === String(empId)) {
        const sd = r.salary_date ? toDate_(r.salary_date) : null;
        if (sd && (maxDate === null || sd > maxDate)) maxDate = sd;
      }
    });
    const newDate = toDate_(d.salary_date);
    if (maxDate && newDate < maxDate) {
      throw new Error('تاريخ الراتب يجب ألا يكون أقدم من ' + maxDate.toISOString().slice(0, 10));
    }

    const mainSalary = Number(d.main_salary);
    if (isNaN(mainSalary)) throw new Error('الراتب الأساسي مطلوب');
    const allow = Number(d.allow); if (isNaN(allow)) throw new Error('البدل مطلوب');
    const basicSalary = Number(d.basic_salary); if (isNaN(basicSalary)) throw new Error('الراتب الأساسي (basic) مطلوب');
    const insSalary = Number(d.insurance_salary); if (isNaN(insSalary)) throw new Error('راتب التأمين مطلوب');
    const insAllow = Number(d.insurance_allow); if (isNaN(insAllow)) throw new Error('بدل التأمين مطلوب');

    const row = {
      unique_id: uid8_(),
      salary_date: newDate,
      emp_id: Number(empId),
      name_ar: '',
      main_salary: mainSalary,
      allow: allow,
      basic_salary: basicSalary,
      insurance_salary: insSalary,
      insurance_allow: insAllow,
      user: (user && user.email) || '',
      created_at: new Date()
    };

    const res = addRecord_(dbId, SALARY_SHEET, row,
      ['salary_date', 'emp_id', 'main_salary', 'allow', 'basic_salary', 'insurance_salary', 'insurance_allow']);

    // name_ar formula looks the name up from valley_employee_info by emp_id (column D)
    writeFormula_(dbId, SALARY_SHEET, res.data.newRowNumber, 'name_ar',
      '=VLOOKUP(D' + res.data.newRowNumber + ',valley_employee_info!$A:$B,2,0)');
    var _empNameSal = '';
    try { var _allEmpsSal = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _ess=0; _ess<_allEmpsSal.length; _ess++) { if (String(_allEmpsSal[_ess].emp_id)===String(empId)) { _empNameSal = _allEmpsSal[_ess].name_ar || ''; break; } } } catch(e){}
    var savedRecordSal = {
      unique_id: row.unique_id, id: row.unique_id, salary_date: newDate, emp_id: Number(empId), name_ar: _empNameSal || String(empId),
      main_salary: mainSalary, allow: allow, basic_salary: basicSalary, insurance_salary: insSalary, insurance_allow: insAllow,
      user: (user && user.email) || '', created_at: new Date()
    };
    try{ logHistory_(dbId, SALARY_SHEET, row.record_uid || ('create_'+SALARY_SHEET+'_'+row.unique_id), row.unique_id, (user&&user.email)||'', 'create', row, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة الراتب', data: { unique_id: row.unique_id }, record: savedRecordSal };
  }

  function getValleyHrPage_(data, user, dbId) {
    const er = getEmployeesData_(data, user, dbId);
    const sr = getEmpStatusData_(data, user, dbId);
    const shr = getShiftAssignmentData_(data, user, dbId);
    const sal = getSalaryData_(data, user, dbId);
    return {
      status: 'success',
      employees: er.employees,
      titleOptions: er.titleOptions,
      titleSectionMap: er.titleSectionMap,
      next_emp_ids: er.next_emp_ids,
      statuses: sr.statuses,
      employeeOptions: sr.employeeOptions,
      assignments: shr.assignments,
      shiftOptions: shr.shiftOptions,
      salaries: sal.salaries
    };
  }

  // ===================== REGISTER =====================
  if (typeof ValleyFoods !== 'undefined' && typeof ValleyFoods.register === 'function') {
    ValleyFoods.register('get_employees_data', getEmployeesData_);
    ValleyFoods.register('add_employee', addEmployee_);
    ValleyFoods.register('get_emp_status_data', getEmpStatusData_);
    ValleyFoods.register('add_emp_status', addEmpStatus_);
    ValleyFoods.register('get_shift_assignment_data', getShiftAssignmentData_);
    ValleyFoods.register('add_shift_assignment', addShiftAssignment_);
    ValleyFoods.register('get_salary_data', getSalaryData_);
    ValleyFoods.register('add_employee_salary', addEmployeeSalary_);
    ValleyFoods.register('get_valley_hr_page', getValleyHrPage_);
  }

  return {
    getEmployeesData_: getEmployeesData_,
    addEmployee_: addEmployee_,
    getEmpStatusData_: getEmpStatusData_,
    addEmpStatus_: addEmpStatus_,
    getShiftAssignmentData_: getShiftAssignmentData_,
    addShiftAssignment_: addShiftAssignment_,
    getSalaryData_: getSalaryData_,
    addEmployeeSalary_: addEmployeeSalary_
  };
})();

/**
 * ValleyFoodsHRModules IIFE
 * Handles: Deductions, Contracts, Vacation Allocation, Vacations,
 * Overtime, Monthly Salaries, Attendance
 */
const ValleyFoodsHRModules = (function () {
  const EMP_DEDUCTIONS_SHEET       = 'valley_emp_deductions';
  const EMP_CONTRACTS_SHEET        = 'valley_employee_contracts';
  const VACATION_ALLOC_SHEET       = 'valley_employee_vacation_allocation';
  const VACATIONS_SHEET            = 'valley_employee_vacations';
  const EMP_OVERTIME_SHEET         = 'valley_emp_overtime';
  const EMP_MONTHLY_SALARIES_SHEET = 'valley_emp_salaries';
  const ATTENDANCE_SESSION_SHEET   = 'valley_attendance_session';
  const EMP_ATTENDANCE_SHEET       = 'valley_employee_attendance';
  const ATT_REVIEW_SHEET           = 'valley_attendance_needs_review';
  const DEDUCTION_ROLES_SHEET      = 'valley_employee_deduction_roles';
  const OVERTIME_ROLES_SHEET       = 'valley_employee_overtime_roles';
  const VACATIONS_INDEX_SHEET      = 'valley_employee_vacations_index';
  const CONTRACTS_INDEX_SHEET      = 'valley_employee_contracts_index';
  const EMP_INFO_SHEET             = 'valley_employee_info';
  const EMP_STATUS_SHEET           = 'valley_employee_status';

  const ACTIVE_STATUS = 'يعمل بالشركة';

  function uid16_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
  function pad2_(n) { return n < 10 ? '0' + n : '' + n; }

  function parseDate_(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    var d = new Date(v);
    return (!isNaN(d.getTime())) ? d : null;
  }

  function getLatestStatusMap_(dbId) {
    var statuses = getAllRecords_(dbId, EMP_STATUS_SHEET);
    var map = {};
    statuses.forEach(function (s) {
      var code = Number(s.Employee_Code || s.employee_code);
      var date = parseDate_(s.Status_Date || s.status_date);
      if (!code) return;
      if (!map[code] || (date && date > map[code].date)) {
        map[code] = { status_type: s.Status_Type || s.status_type, date: date };
      }
    });
    return map;
  }

  function getActiveEmployeeOptions_(dbId) {
    var statusMap = getLatestStatusMap_(dbId);
    var employees = getAllRecords_(dbId, EMP_INFO_SHEET);
    return employees
      .filter(function (e) {
        var s = statusMap[Number(e.emp_id)];
        return s && s.status_type === ACTIVE_STATUS;
      })
      .map(function (e) {
        return { value: e.emp_id, label: e.emp_id + ' — ' + e.name_ar };
      })
      .sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
  }

  function getDeductionRoles_(dbId) {
    try {
      var roles = getAllRecords_(dbId, DEDUCTION_ROLES_SHEET);
      return roles.filter(function (r) { return r.is_active !== false; })
        .map(function (r) {
          return { value: r.rule_unique_id, label: r.deduction_name, type: r.deduction_type, category: r.deduction_category, days: Number(r.deduction_days) || 0, hours: Number(r.deduction_hours) || 0, deductionValue: r.deduction_value != null && String(r.deduction_value).trim() !== '' ? r.deduction_value : null };
        });
    } catch (e) { return []; }
  }

  function getOvertimeRoles_(dbId) {
    try {
      var roles = getAllRecords_(dbId, OVERTIME_ROLES_SHEET);
      return roles.filter(function (r) { return r.is_active !== false; })
        .map(function (r) {
          return { value: r.overtime_rule_unique_id, label: r.overtime_type, rate: Number(r.overtime_rate) || 1, moneyRelated: !!r.money_related, vacationDays: !!r.vacation_days };
        });
    } catch (e) { return []; }
  }

  function ensureSheet_(dbId, name, headers) {
    var key = String(dbId) + '|' + name;
    if (_ensuredSheets_[key]) return _ensuredSheets_[key];
    var ss = getSpreadsheet_(dbId);
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }
    _ensuredSheets_[key] = sheet;
    return sheet;
  }

  // ===================== DATE/SERIAL HELPERS (attendance) =====================
  // Google Sheets epoch: serial 0 = 1899-12-30. Storing pure serial numbers in
  // attendance_date_time / session_date keeps values numeric (sortable, SUMIFS/QUERY
  // compatible) and avoids Sheets locale re-interpretation of text dates.
  var SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);

  function _pad2(n) { return ('0' + n).slice(-2); }

  function dateTimePartsToSerial_(day, month, year, hours, minutes) {
    var utcMillis = Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0);
    return (utcMillis - SHEETS_EPOCH_UTC) / 86400000;
  }

  function dateOnlyToSerial_(day, month, year) {
    return dateTimePartsToSerial_(day, month, year, 0, 0);
  }

  function serialToDate_(serial) {
    return new Date(SHEETS_EPOCH_UTC + Math.round(serial * 86400000));
  }

  // Convert ANY stored representation (raw integer/serial number, legacy Date
  // object, legacy "dd/mm/yyyy hh:mm" text, ISO string) into the canonical
  // numeric Sheets serial. Returns null when unparseable.
  function flexToSerial_(rawValue) {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return null;
    if (typeof rawValue === 'number' && isFinite(rawValue)) return rawValue;
    if (Object.prototype.toString.call(rawValue) === '[object Date]' && !isNaN(rawValue.getTime())) {
      // getValues() returns script-timezone wall-clock dates; rebuild UTC from
      // those wall-clock parts to get the true serial number.
      return dateTimePartsToSerial_(
        rawValue.getFullYear(), rawValue.getMonth() + 1, rawValue.getDate(),
        rawValue.getHours(), rawValue.getMinutes()
      );
    }
    var str = String(rawValue).trim();
    var m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
    if (m) return dateTimePartsToSerial_(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
    m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (m) return dateTimePartsToSerial_(Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    return null;
  }

  // Canonical storage value: minute-precision numeric serial (integer minutes
  // scaled back to a Sheets serial day-number). Pure Number — never text,
  // never a Date object.
  function toSerialInt_(rawValue) {
    var s = flexToSerial_(rawValue);
    return (s === null) ? null : Math.round(s * 1440) / 1440;
  }

  // Unified duplicate-detection key: INTEGER of minutes since sheets epoch.
  // Both sides (stored table values and incoming CSV rows) are reduced to this
  // same integer, so matching works across Date objects, serial numbers and
  // legacy text rows alike.
  function normalizeDateTimeKey_(rawValue) {
    var s = flexToSerial_(rawValue);
    if (s !== null) return String(Math.round(s * 1440));
    return String(rawValue).replace(/\s+/g, '');
  }

  // Unified date-only key yyyy-MM-dd for session_date comparisons/display.
  function sessionDateKey_(rawValue) {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    if (Object.prototype.toString.call(rawValue) === '[object Date]' && !isNaN(rawValue.getTime())) {
      return Utilities.formatDate(rawValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (typeof rawValue === 'number' && isFinite(rawValue)) {
      var d = serialToDate_(rawValue);
      return d.getUTCFullYear() + '-' + _pad2(d.getUTCMonth() + 1) + '-' + _pad2(d.getUTCDate());
    }
    var str = String(rawValue).trim();
    var m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + _pad2(m[2]) + '-' + _pad2(m[1]);
    m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + _pad2(m[2]) + '-' + _pad2(m[3]);
    return str;
  }

  function sessionDateDisplay_(rawValue) {
    var key = sessionDateKey_(rawValue);
    var m = String(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(rawValue == null ? '' : rawValue);
  }

  function attendanceTimeDisplay_(rawValue) {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return '';
    if (typeof rawValue === 'number' && isFinite(rawValue)) {
      var d = serialToDate_(rawValue);
      return _pad2(d.getUTCDate()) + '/' + _pad2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() + ' ' + _pad2(d.getUTCHours()) + ':' + _pad2(d.getUTCMinutes());
    }
    if (Object.prototype.toString.call(rawValue) === '[object Date]' && !isNaN(rawValue.getTime())) {
      return Utilities.formatDate(rawValue, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
    }
    return String(rawValue);
  }

  // Serial-or-Date-or-string -> real Date, for range filtering in reports.
  function flexToDateTime_(rawValue) {
    if (rawValue === '' || rawValue === null || rawValue === undefined) return null;
    if (typeof rawValue === 'number' && isFinite(rawValue)) return serialToDate_(rawValue);
    if (Object.prototype.toString.call(rawValue) === '[object Date]') return isNaN(rawValue.getTime()) ? null : rawValue;
    var str = String(rawValue).trim();
    var m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
    var d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function normalizeEmpIdVF_(rawValue) {
    return String(rawValue || '').trim().replace(/[^a-zA-Z0-9\u0600-\u06FF-]/g, '');
  }

  /** HH:MM string -> spreadsheet time fraction (day units). Scoped inside HRModules so addOvertime_ can call it — mirrors TopChemical timeFrac_. */
  function timeFrac_(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return '';
    var m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      var h = Number(m[1]); var mn = Number(m[2]);
      if (h <= 23 && mn <= 59) return (h + mn / 60) / 24;
    }
    return t;
  }

  // ===================== DEDUCTIONS =====================
  function getDeductionsData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_DEDUCTIONS_SHEET, ['unique_id','emp_id','name_ar','deduction_type','date','number_of_days','penalty_value','penalty_type_days','abscence_type_days','delay_type_minutes','details','deduction_attachement','month','year','user','created_at']);
    var roles = getDeductionRoles_(dbId);
    var roleMap = {};
    roles.forEach(function (r) { roleMap[r.value] = r; });
    var _allRows = getAllRecords_(dbId, EMP_DEDUCTIONS_SHEET);
    var limit = Number(data && data.limit) || 10;
    var rows = _allRows.slice().reverse().map(function (r) {
      var role = roleMap[r.deduction_type] || {};
      return {
        unique_id: r.unique_id, emp_id: r.emp_id, name_ar: r.name_ar,
        deduction_type: r.deduction_type, deduction_name: role.label || r.deduction_type,
        deduction_category: role.category || '', date: r.date,
        number_of_days: r.number_of_days, penalty_value: r.penalty_value,
        penalty_type_days: r.penalty_type_days, abscence_type_days: r.abscence_type_days,
        delay_type_minutes: r.delay_type_minutes, details: r.details,
        month: r.month, year: r.year, user: r.user, created_at: r.created_at
      };
    });
    var total = _allRows.length;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', rows: rows, total: total, employee_options: getActiveEmployeeOptions_(dbId), role_options: roles };
  }

  function addDeduction_(data, user, dbId) {
    var result;
    executeWithLock_(function () {
      var empId = Number(data.emp_id);
      if (!empId) throw new Error('الموظف مطلوب');
      var dedType = String(data.deduction_type || '').trim();
      if (!dedType) throw new Error('نوع الخصم مطلوب');
      var date = parseDate_(data.date);
      if (!date) throw new Error('التاريخ مطلوب');
      var days = Number(data.number_of_days) || 0;
      var otherVal = Number(data.deduction_value_other) || 0;
      var details = String(data.details || '').trim();
      var attachment = String(data.deduction_attachement || '').trim();

      var sheet = getSheet_(EMP_DEDUCTIONS_SHEET, dbId);
      var rowNumber = sheet.getLastRow() + 1;
      var headers = getHeaders_(sheet);
      var row = {};
      row['unique_id'] = uid16_();
      row['emp_id'] = empId;
      row['name_ar'] = '=VLOOKUP(B' + rowNumber + ',valley_employee_info!A:B,2,0)';
      row['deduction_type'] = dedType;
      row['date'] = date;
      row['number_of_days'] = days;
      row['penalty_value'] = otherVal;
      row['penalty_type_days'] = '=if(VLOOKUP(D' + rowNumber + ',valley_employee_deduction_roles!A:C,3,0) = "جزاءات",F' + rowNumber + ',0)';
      row['abscence_type_days'] = '=if(VLOOKUP(D' + rowNumber + ',valley_employee_deduction_roles!A:C,3,0) = "غياب",F' + rowNumber + ' * VLOOKUP(D' + rowNumber + ',valley_employee_deduction_roles!A:H,8,0),0)';
      row['delay_type_minutes'] = '=if(VLOOKUP(D' + rowNumber + ',valley_employee_deduction_roles!A:C,3,0) = "حضور وانصراف",60* VLOOKUP(D' + rowNumber + ',valley_employee_deduction_roles!A:H,7,0),0)';
      row['details'] = details;
      row['deduction_attachement'] = attachment;
      row['month'] = '=MONTH(E' + rowNumber + ')';
      row['year'] = '=YEAR(E' + rowNumber + ')';
      row['user'] = (user && user.email) || '';
      row['created_at'] = new Date();
      var res = saveRecordWithAudit_(dbId, EMP_DEDUCTIONS_SHEET, null, row, 'create', (user && user.email) || '', null, null, null, 'unique_id');
      var _roles2 = getDeductionRoles_(dbId);
      var _roleMap2 = {}; _roles2.forEach(function(rr){ _roleMap2[rr.value]=rr; });
      var _role2 = _roleMap2[dedType] || {};
      var _empName = '';
      try { var _allEmps = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _ei=0; _ei<_allEmps.length; _ei++) { if (String(_allEmps[_ei].emp_id)===String(empId)) { _empName = _allEmps[_ei].name_ar || ''; break; } } } catch(e){}
      var savedRecord = {
        unique_id: row['unique_id'], emp_id: empId, name_ar: _empName || String(empId),
        deduction_type: dedType, deduction_name: _role2.label || dedType, deduction_category: _role2.category || '',
        date: date, number_of_days: days, penalty_value: otherVal,
        penalty_type_days: (_role2.category==='جزاءات'? days : 0),
        abscence_type_days: (_role2.category==='غياب'? days * (Number(_role2.days)||0) : 0),
        delay_type_minutes: (_role2.category==='حضور وانصراف'? 60*(Number(_role2.hours)||0) : 0),
        details: details, deduction_attachement: attachment,
        month: date ? (date.getMonth()+1) : '', year: date ? date.getFullYear() : '',
        user: (user && user.email) || '', created_at: new Date()
      };
      result = { status: 'success', message: 'تم تسجيل الخصم', data: { unique_id: row['unique_id'] }, record: savedRecord };
    });
    return result;
  }

  // ===================== CONTRACTS ====================
  function getContractsData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_CONTRACTS_SHEET, ['unique_id','id','emp_id','contract_Type','contract_start_Date','contract_end_Date','employee_name','contract_salary','contract_insurance_salary','user','created_at']);
    var rows = getAllRecords_(dbId, EMP_CONTRACTS_SHEET).slice(-300).reverse();
    var indexRows = [];
    try { indexRows = getAllRecords_(dbId, CONTRACTS_INDEX_SHEET); } catch (e) {}
    var contractTypeOptions = indexRows.map(function (r) {
      return { value: r.id, label: (r.contract_name_ar || '') + (r.contract_name_en ? ' — ' + r.contract_name_en : '') };
    }).filter(function (o) { return o.value; });
    return { status: 'success', rows: rows, employee_options: getActiveEmployeeOptions_(dbId), contract_type_options: contractTypeOptions };
  }

  function addContract_(data, user, dbId) {
    var result;
    executeWithLock_(function () {
      var empId = Number(data.emp_id);
      if (!empId) throw new Error('الموظف مطلوب');
      var contractType = String(data.contract_Type || '').trim();
      if (!contractType) throw new Error('نوع العقد مطلوب');
      var startDate = parseDate_(data.contract_start_Date);
      if (!startDate) throw new Error('تاريخ البداية مطلوب');
      var endDate = parseDate_(data.contract_end_Date);
      var salary = Number(data.contract_salary);
      if (!salary || salary <= 0) throw new Error('راتب العقد يجب أن يكون أكبر من صفر');
      var insSalary = Number(data.contract_insurance_salary);
      if (!insSalary || insSalary <= 0) throw new Error('راتب التأمين يجب أن يكون أكبر من صفر');
      var sheet = getSheet_(EMP_CONTRACTS_SHEET, dbId);
      var rowNumber = sheet.getLastRow() + 1;
      var headers = getHeaders_(sheet);
      var row = {};
      row['unique_id'] = uid16_();
      row['id'] = rowNumber - 1;
      row['emp_id'] = empId;
      row['contract_Type'] = contractType;
      row['contract_start_Date'] = startDate;
      row['contract_end_Date'] = endDate || '';
      row['employee_name'] = '=VLOOKUP(C' + rowNumber + ',valley_employee_info!A:B,2,0)';
      row['contract_salary'] = salary;
      row['contract_insurance_salary'] = insSalary;
      row['user'] = (user && user.email) || '';
      row['created_at'] = new Date();
      var values = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
      sheet.appendRow(values);
      var _ctMap = {};
      try { var _idxRows = getAllRecords_(dbId, CONTRACTS_INDEX_SHEET); _idxRows.forEach(function(rr){ _ctMap[String(rr.id)] = (rr.contract_name_ar||'') + (rr.contract_name_en ? ' — ' + rr.contract_name_en : ''); }); } catch(e){}
      var _empNameC = '';
      try { var _allEmpsC = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _ei2=0; _ei2<_allEmpsC.length; _ei2++) { if (String(_allEmpsC[_ei2].emp_id)===String(empId)) { _empNameC = _allEmpsC[_ei2].name_ar || ''; break; } } } catch(e){}
      var savedRecordContract = {
        unique_id: row['unique_id'], id: row['id'], emp_id: empId, employee_name: _empNameC || String(empId),
        contract_Type: contractType, contract_type_label: _ctMap[String(contractType)] || contractType,
        contract_start_Date: startDate, contract_end_Date: endDate || '',
        contract_salary: salary, contract_insurance_salary: insSalary,
        user: (user && user.email) || '', created_at: new Date()
      };
      try{ logHistory_(dbId, EMP_CONTRACTS_SHEET, row.record_uid || ('create_'+EMP_CONTRACTS_SHEET+'_'+row['unique_id']), row['unique_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
      result = { status: 'success', message: 'تم إضافة العقد', data: { unique_id: row['unique_id'] }, record: savedRecordContract };
    });
    return result;
  }

  // ===================== VACATION ALLOCATION =====================
  function getVacationAllocData_(data, user, dbId) {
    ensureSheet_(dbId, VACATION_ALLOC_SHEET, ['unique_id','id','emp_id','employee_name','vacation_type','vacation_alloc_start_Date','vacation_alloc_end_Date','number_of_days','used_days','user','created_at']);
    var _allVacAlloc = getAllRecords_(dbId, VACATION_ALLOC_SHEET);
    var limit = Number(data && data.limit) || 10;
    var rows = _allVacAlloc.slice().reverse();
    var vacIndexRows = [];
    try { vacIndexRows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET); } catch (e) {}
    var vacationIndexOptions = vacIndexRows.map(function (r) {
      return { value: r.id, label: r.vacation_name_ar || '', vacation_name_en: r.vacation_name_en || '', require_allocation: r.require_allocation === true || String(r.require_allocation).toLowerCase() === 'true' };
    }).filter(function (o) { return o.value; });
    var total = _allVacAlloc.length;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', rows: rows, total: total, employee_options: getActiveEmployeeOptions_(dbId), vacation_index_options: vacationIndexOptions };
  }

  function addVacationAlloc_(data, user, dbId) {
    var result;
    executeWithLock_(function () {
    var empId = Number(data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var vacType = String(data.vacation_type || '').trim();
    if (!vacType) throw new Error('نوع الإجازة مطلوب');

    // Check require_allocation flag from valley_employee_vacations_index
    var vacIndexRows = [];
    try { vacIndexRows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET); } catch (e) {}
    var selectedVacIndex = null;
    for (var vi = 0; vi < vacIndexRows.length; vi++) {
      if (String(vacIndexRows[vi].id) === String(vacType)) { selectedVacIndex = vacIndexRows[vi]; break; }
    }
    if (selectedVacIndex && (selectedVacIndex.require_allocation === true || String(selectedVacIndex.require_allocation).toLowerCase() === 'true')) {
      // require_allocation is true — allocation is required, which is exactly what we're creating, so proceed
    } else if (selectedVacIndex && selectedVacIndex.require_allocation !== undefined && selectedVacIndex.require_allocation !== '' && selectedVacIndex.require_allocation !== true && String(selectedVacIndex.require_allocation).toLowerCase() !== 'true') {
      throw new Error('نوع الإجازة هذا لا يتطلب تخصيص');
    }

    var startDate = parseDate_(data.vacation_alloc_start_Date);
    var endDate = parseDate_(data.vacation_alloc_end_Date);
    if (!startDate || !endDate) throw new Error('تاريخ البداية والنهاية مطلوب');

    // Strip time components — set to midnight
    startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    if (endDate < startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');

    var days = Number(data.number_of_days) || 0;
    if (days <= 0) throw new Error('عدد الأيام يجب أن يكون أكبر من صفر');

    // Overlap prevention: check if an active allocation exists for same emp_id + vacation_type with overlapping dates
    var existingAllocs = getAllRecords_(dbId, VACATION_ALLOC_SHEET);
    for (var ai = 0; ai < existingAllocs.length; ai++) {
      var a = existingAllocs[ai];
      if (Number(a.emp_id) !== empId) continue;
      if (String(a.vacation_type) !== String(vacType)) continue;
      var existStart = parseDate_(a.vacation_alloc_start_Date);
      var existEnd = parseDate_(a.vacation_alloc_end_Date);
      if (!existStart || !existEnd) continue;
      existStart = new Date(existStart.getFullYear(), existStart.getMonth(), existStart.getDate());
      existEnd = new Date(existEnd.getFullYear(), existEnd.getMonth(), existEnd.getDate());
      // Overlap check: two ranges overlap if start1 <= end2 AND start2 <= end1
      if (startDate <= existEnd && existStart <= endDate) {
        throw new Error('يوجد تخصيص نشط لنفس الإجازة في الفترة المحددة');
      }
    }

    var sheet = getSheet_(VACATION_ALLOC_SHEET, dbId);
    var rowNumber = sheet.getLastRow() + 1;
    var headers = getHeaders_(sheet);
    var row = {};
    row['unique_id'] = uid16_();
    row['id'] = rowNumber - 1;
    row['emp_id'] = empId;
    row['employee_name'] = '=VLOOKUP(C' + rowNumber + ',valley_employee_info!$A:$B,2,0)';
    row['vacation_type'] = vacType;
    row['vacation_alloc_start_Date'] = startDate;
    row['vacation_alloc_end_Date'] = endDate;
    row['number_of_days'] = days;
    row['used_days'] = 0;
    row['user'] = (user && user.email) || '';
    row['created_at'] = new Date();
    var values = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
    sheet.appendRow(values);
    var _vacNameMap = {};
    try { var _viRows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET); _viRows.forEach(function(rr){ _vacNameMap[String(rr.id)] = rr.vacation_name_ar || String(rr.id); }); } catch(e){}
    var _empNameVA = '';
    try { var _allEmpsVA = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _evi=0; _evi<_allEmpsVA.length; _evi++) { if (String(_allEmpsVA[_evi].emp_id)===String(empId)) { _empNameVA = _allEmpsVA[_evi].name_ar || ''; break; } } } catch(e){}
    var savedRecordVA = {
      unique_id: row['unique_id'], id: row['id'], emp_id: empId, employee_name: _empNameVA || String(empId),
      vacation_type: vacType, vacation_type_name: _vacNameMap[String(vacType)] || vacType,
      vacation_alloc_start_Date: startDate, vacation_alloc_end_Date: endDate,
      number_of_days: days, used_days: 0,
      user: (user && user.email) || '', created_at: new Date()
    };
    try{ logHistory_(dbId, VACATION_ALLOC_SHEET, row.record_uid || ('create_'+VACATION_ALLOC_SHEET+'_'+row['unique_id']), row['unique_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
    result = { status: 'success', message: 'تم تخصيص الإجازة', data: { unique_id: row['unique_id'] }, record: savedRecordVA };
    }); /* executeWithLock_ */
    return result;
  }

  // ===================== VACATIONS =====================
  function getVacationsData_(data, user, dbId) {
    ensureSheet_(dbId, VACATIONS_SHEET, ['unique_id','id','emp_id','vacation_half_day','vacation_type','allocation_id','start_date','end_date','duration_days','duration_days_other','amount_other','vacation_reason','attachment','user','created_at']);

    // Vacation index options (type reference)
    var vacIndexRows = [];
    try { vacIndexRows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET); } catch (e) {}
    var vacationIndexOptions = vacIndexRows.map(function (r) {
      return { value: r.id, label: r.vacation_name_ar || '', require_allocation: r.require_allocation === true || String(r.require_allocation).toLowerCase() === 'true' };
    }).filter(function (o) { return o.value; });

    // Build vacation type name map
    var vacTypeNameMap = {};
    vacationIndexOptions.forEach(function (o) { vacTypeNameMap[String(o.value)] = o.label; });

    // Build require_allocation map
    var requireAllocMap = {};
    vacationIndexOptions.forEach(function (o) { requireAllocMap[String(o.value)] = o.require_allocation; });

    // Active employees
    var activeEmpOpts = getActiveEmployeeOptions_(dbId);
    var activeEmpIds = {};
    activeEmpOpts.forEach(function (o) { activeEmpIds[String(o.value)] = true; });

    // Allocation options map (keyed by emp_id)
    var allocs = getAllRecords_(dbId, VACATION_ALLOC_SHEET);
    var allocOptionsMap = {};
    allocs.forEach(function (a) {
      var eid = String(a.emp_id);
      if (!activeEmpIds[eid]) return;
      var remaining = (Number(a.number_of_days) || 0) - (Number(a.used_days) || 0);
      if (remaining <= 0) return;
      if (!allocOptionsMap[eid]) allocOptionsMap[eid] = [];
      var vacName = vacTypeNameMap[String(a.vacation_type)] || a.vacation_type || '';
      var empName = a.employee_name || '';
      var startD = a.vacation_alloc_start_Date ? fmtDate_(a.vacation_alloc_start_Date) : '';
      var endD = a.vacation_alloc_end_Date ? fmtDate_(a.vacation_alloc_end_Date) : '';
      var label = empName + ' - ' + vacName + ' - ' + startD + ' - ' + endD + ' - الرصيد المتبقي -- ' + remaining;
      allocOptionsMap[eid].push({ value: a.unique_id, label: label, remaining: remaining, vacation_type: a.vacation_type, require_allocation: requireAllocMap[String(a.vacation_type)] || false });
    });

    var _allVac = getAllRecords_(dbId, VACATIONS_SHEET);
    var limit = Number(data && data.limit) || 10;
    var rows = _allVac.slice().reverse();

    // Enrich rows with vacation_type name
    rows = rows.map(function (r) {
      r.vacation_type_name = vacTypeNameMap[String(r.vacation_type)] || r.vacation_type || '';
      return r;
    });
    var total = _allVac.length;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', rows: rows, total: total, employee_options: activeEmpOpts, allocation_options_map: allocOptionsMap, vacation_index_options: vacationIndexOptions };
  }

  function fmtDate_(v) {
    if (!v) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addVacation_(data, user, dbId) {
    var result;
    executeWithLock_(function () {
    var empId = Number(data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var vacType = String(data.vacation_type || '').trim();
    if (!vacType) throw new Error('نوع الإجازة مطلوب');

    var startDate = parseDate_(data.start_date);
    if (!startDate) throw new Error('تاريخ البداية مطلوب');
    var endDate = parseDate_(data.end_date);
    if (!endDate) throw new Error('تاريخ النهاية مطلوب');

    // Strip time components
    startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    if (endDate < startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية');

    var halfDay = data.vacation_half_day === true || data.vacation_half_day === 'true';

    // Check require_allocation for this vacation type
    var vacIndexRows = [];
    try { vacIndexRows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET); } catch (e) {}
    var isRequireAlloc = false;
    for (var vi = 0; vi < vacIndexRows.length; vi++) {
      if (String(vacIndexRows[vi].id) === String(vacType)) {
        isRequireAlloc = vacIndexRows[vi].require_allocation === true || String(vacIndexRows[vi].require_allocation).toLowerCase() === 'true';
        break;
      }
    }

    // Allocation_id: required only if require_allocation is true
    var allocId = String(data.allocation_id || '').trim();
    if (isRequireAlloc && !allocId) throw new Error('تخصيص الإجازة مطلوب لهذا النوع');

    // Duration calculation
    var duration = 0;
    if (halfDay) {
      duration = 0.5;
    } else if (vacType) {
      // Calculate working days between start and end (excluding Fridays)
      var diffTime = endDate.getTime() - startDate.getTime();
      var totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
      if (totalDays < 0) totalDays = 0;
      duration = totalDays;
    }

    // Overlap prevention: check same emp_id within date range
    var existingVacations = getAllRecords_(dbId, VACATIONS_SHEET);
    for (var vi2 = 0; vi2 < existingVacations.length; vi2++) {
      var ev = existingVacations[vi2];
      if (Number(ev.emp_id) !== empId) continue;
      var existStart = parseDate_(ev.start_date);
      var existEnd = parseDate_(ev.end_date);
      if (!existStart || !existEnd) continue;
      existStart = new Date(existStart.getFullYear(), existStart.getMonth(), existStart.getDate());
      existEnd = new Date(existEnd.getFullYear(), existEnd.getMonth(), existEnd.getDate());
      if (startDate <= existEnd && existStart <= endDate) {
        throw new Error('يوجد إجازة أخرى لنفس الموظف في الفترة المحددة');
      }
    }

    var sheet = getSheet_(VACATIONS_SHEET, dbId);
    var rowNumber = sheet.getLastRow() + 1;
    var headers = getHeaders_(sheet);
    var row = {};
    row['unique_id'] = uid16_();
    row['id'] = rowNumber - 1;
    row['emp_id'] = empId;
    row['vacation_half_day'] = halfDay;
    row['vacation_type'] = vacType;
    row['allocation_id'] = allocId;
    row['start_date'] = startDate;
    row['end_date'] = endDate;
    row['duration_days'] = duration;
    row['duration_days_other'] = Number(data.duration_days_other) || 0;
    row['amount_other'] = Number(data.amount_other) || 0;
    row['vacation_reason'] = String(data.vacation_reason || '').trim();
    row['attachment'] = String(data.attachment || '').trim();
    row['user'] = (user && user.email) || '';
    row['created_at'] = new Date();
    var values = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
    sheet.appendRow(values);
    var _vacNameMap2 = {};
    try { var _viRows2 = getAllRecords_(dbId, VACATIONS_INDEX_SHEET); _viRows2.forEach(function(rr){ _vacNameMap2[String(rr.id)] = rr.vacation_name_ar || String(rr.id); }); } catch(e){}
    var savedRecordVac = {
      unique_id: row['unique_id'], id: row['id'], emp_id: empId,
      vacation_half_day: halfDay, vacation_type: vacType, vacation_type_name: _vacNameMap2[String(vacType)] || vacType,
      allocation_id: allocId, start_date: startDate, end_date: endDate,
      duration_days: duration, duration_days_other: Number(data.duration_days_other) || 0, amount_other: Number(data.amount_other) || 0,
      vacation_reason: String(data.vacation_reason || '').trim(), attachment: String(data.attachment || '').trim(),
      user: (user && user.email) || '', created_at: new Date()
    };
    try{ logHistory_(dbId, VACATIONS_SHEET, row.record_uid || ('create_'+VACATIONS_SHEET+'_'+row['unique_id']), row['unique_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
    result = { status: 'success', message: 'تم تسجيل الإجازة', data: { unique_id: row['unique_id'] }, record: savedRecordVac };

    // Increment used_days in allocation if allocation_id provided
    if (allocId) {
      try {
        var allocSheet = getSheet_(VACATION_ALLOC_SHEET, dbId);
        var allocHeaders = getHeaders_(allocSheet);
        var uidIdx = allocHeaders.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
        var usedIdx = allocHeaders.findIndex(function (h) { return String(h).trim() === 'used_days'; });
        if (uidIdx !== -1 && usedIdx !== -1) {
          var allData = allocSheet.getDataRange().getValues();
          for (var i = 1; i < allData.length; i++) {
            if (String(allData[i][uidIdx]).trim() === allocId) {
              allocSheet.getRange(i + 1, usedIdx + 1).setValue(Number(allData[i][usedIdx]) + duration);
              break;
            }
          }
        }
      } catch (e) { /* log but don't fail */ }
    }

    }); /* executeWithLock_ */
    return result;
  }

  // ===================== OVERTIME =====================
  function getOvertimeData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_OVERTIME_SHEET, ['unique_id','emp_id','name_ar','date','overtime_type','start_time','end_time','overtime_hours','overtime_vacation_days','details','overtime_attachement','amount','month','year','user','created_at']);
    var roles = getOvertimeRoles_(dbId);
    var roleMap = {};
    roles.forEach(function (r) { roleMap[r.value] = r; });
    var _allOT = getAllRecords_(dbId, EMP_OVERTIME_SHEET);
    var limit = Number(data && data.limit) || 10;
    var rows = _allOT.slice().reverse().map(function (r) {
      var role = roleMap[r.overtime_type] || {};
      return {
        unique_id: r.unique_id, emp_id: r.emp_id, name_ar: r.name_ar,
        date: r.date, overtime_type: r.overtime_type, overtime_name: role.label || r.overtime_type,
        start_time: r.start_time, end_time: r.end_time,
        overtime_hours: r.overtime_hours, overtime_vacation_days: r.overtime_vacation_days,
        details: r.details, overtime_attachement: r.overtime_attachement,
        amount: r.amount, month: r.month, year: r.year,
        user: r.user, created_at: r.created_at
      };
    });
    var total = _allOT.length;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', rows: rows, total: total, employee_options: getActiveEmployeeOptions_(dbId), role_options: roles };
  }

  function addOvertime_(data, user, dbId) {
    var result;
    executeWithLock_(function () {
    var empId = Number(data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var otType = String(data.overtime_type || '').trim();
    if (!otType) throw new Error('نوع العمل الإضافي مطلوب');
    var date = parseDate_(data.date);
    if (!date) throw new Error('التاريخ مطلوب');
    var details = String(data.details || '').trim();
    if (!details) throw new Error('التفاصيل مطلوبة');
    var attachment = String(data.overtime_attachement || '').trim();
    if (!attachment) throw new Error('المرفق مطلوب');

    var roles = getOvertimeRoles_(dbId);
    var roleInfo = null;
    for (var i = 0; i < roles.length; i++) {
      if (String(roles[i].value) === String(otType)) { roleInfo = roles[i]; break; }
    }
    var isMoneyRelated = roleInfo && roleInfo.moneyRelated;
    var isVacationDays = roleInfo && roleInfo.vacationDays;
    var rate = (roleInfo && roleInfo.rate) ? Number(roleInfo.rate) : 1;

    if (isMoneyRelated) {
      var amount = Number(data.amount) || 0;
      if (amount <= 0) throw new Error('المبلغ مطلوب لهذا النوع');
    }

    var startTime = String(data.start_time || '').trim();
    var endTime = String(data.end_time || '').trim();
    if (!isMoneyRelated) {
      if (!startTime) throw new Error('وقت البداية مطلوب');
      if (!endTime) throw new Error('وقت النهاية مطلوب');
    }

    var sheet = getSheet_(EMP_OVERTIME_SHEET, dbId);
    var allRows = getAllRecords_(dbId, EMP_OVERTIME_SHEET);
    for (var j = 0; j < allRows.length; j++) {
      var er = allRows[j];
      if (Number(er.emp_id) === empId && String(er.date) === String(date) &&
          String(er.start_time || '') === startTime && String(er.end_time || '') === endTime) {
        throw new Error('يوجد سجل 작업 إضافي مطابق لهذا الموظف في نفس التوقيت');
      }
    }

    var rowNumber = sheet.getLastRow() + 1;
    var headers = getHeaders_(sheet);
    var row = {};
    row['unique_id'] = uid16_();
    row['emp_id'] = empId;
    row['name_ar'] = '=VLOOKUP(B' + rowNumber + ',valley_employee_info!A:B,2,0)';
    row['date'] = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    row['overtime_type'] = otType;
    row['start_time'] = timeFrac_(startTime);
    row['end_time'] = timeFrac_(endTime);
    row['overtime_hours'] = '=if(IF(E' + rowNumber + '="", "", COUNTIFS(valley_employee_overtime_roles!$A$2:$A, E' + rowNumber + ', valley_employee_overtime_roles!$D$2:$D, FALSE, valley_employee_overtime_roles!$E$2:$E, FALSE) > 0)=TRUE,VLOOKUP(E' + rowNumber + ',valley_employee_overtime_roles!A:C,3,0),0) * IF(G' + rowNumber + '>F' + rowNumber + ',(G' + rowNumber + '-F' + rowNumber + ')*24,((G' + rowNumber + '-F' + rowNumber + ')*24)+24)';
    row['overtime_vacation_days'] = '=if(IF(E' + rowNumber + '="", "", COUNTIFS(valley_employee_overtime_roles!$A$2:$A, E' + rowNumber + ', valley_employee_overtime_roles!$D$2:$D, FALSE, valley_employee_overtime_roles!$E$2:$E, TRUE) > 0)=TRUE,VLOOKUP(E' + rowNumber + ',valley_employee_overtime_roles!A:C,3,0),0)';
    row['details'] = details;
    row['overtime_attachement'] = attachment;
    row['amount'] = isMoneyRelated ? (Number(data.amount) || 0) : 0;
    row['month'] = '=MONTH(D' + rowNumber + ')';
    row['year'] = '=YEAR(D' + rowNumber + ')';
    row['user'] = (user && user.email) || '';
    row['created_at'] = new Date();
    var values = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
    sheet.appendRow(values);
    var _rolesOT = getOvertimeRoles_(dbId);
    var _rmapOT = {}; _rolesOT.forEach(function(rr){ _rmapOT[rr.value]=rr; });
    var _roleOT = _rmapOT[otType] || {};
    var _empNameOT = '';
    try { var _allEmpsOT = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _eot=0; _eot<_allEmpsOT.length; _eot++) { if (String(_allEmpsOT[_eot].emp_id)===String(empId)) { _empNameOT = _allEmpsOT[_eot].name_ar || ''; break; } } } catch(e){}
    var savedRecordOT = {
      unique_id: row['unique_id'], emp_id: empId, name_ar: _empNameOT || String(empId),
      date: date, overtime_type: otType, overtime_name: _roleOT.label || otType,
      start_time: startTime, end_time: endTime,
      overtime_hours: '', overtime_vacation_days: '',
      details: details, overtime_attachement: attachment, amount: isMoneyRelated ? (Number(data.amount)||0) : 0,
      month: date ? (date.getMonth()+1) : '', year: date ? date.getFullYear() : '',
      user: (user && user.email) || '', created_at: new Date()
    };
    try{ logHistory_(dbId, EMP_OVERTIME_SHEET, row.record_uid || ('create_'+EMP_OVERTIME_SHEET+'_'+row['unique_id']), row['unique_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
    result = { status: 'success', message: 'تم تسجيل العمل الإضافي', data: { unique_id: row['unique_id'] }, record: savedRecordOT };
    }); /* executeWithLock_ */
    return result;
  }

  // ===================== MONTHLY SALARIES =====================
  function getMonthlySalariesData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_MONTHLY_SALARIES_SHEET, ['unique_id','emp_id','name_ar','basic_salary','allow','title','section','working_days','working_hours','working_days_value','overtime_days','overtime_days_value','vacation_days','vacation_days_value','other_addition','loans_value_deductions','deduction_day','deduction_day_value','penalty_deduction_days','penalty_deduction_days_value','delay_deductions','delay_deductions_value','net_salary','net_salary_nearest','month_name','section_type','year','month','salary_date','user','created_at']);
    var month = Number(data.month);
    var year = Number(data.year);
    var all = getAllRecords_(dbId, EMP_MONTHLY_SALARIES_SHEET);

    var monthsSet = {};
    all.forEach(function (r) {
      var m = Number(r.month); var y = Number(r.year);
      if (m && y) monthsSet[y + '-' + m] = { year: y, month: m };
    });

    var list = all;
    if (Number.isInteger(month) && Number.isInteger(year)) {
      list = all.filter(function (r) { return Number(r.month) === month && Number(r.year) === year; });
    }
    // totals computed BEFORE capping
    var totalAll = list.reduce(function (s, r) { return s + (Number(r.net_salary) || 0); }, 0);
    var limit = Number(data && data.limit) || 15;
    var rows = list.slice().reverse();
    var totalForCalc = totalAll;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    var monthNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

    return {
      status: 'success',
      salaries: rows,
      total: totalForCalc,
      totalRecords: list.length,
      existing_emp_ids: rows.map(function (r) { return Number(r.emp_id); }),
      months: Object.keys(monthsSet).sort().reverse().map(function (k) { return monthsSet[k]; }),
      month_options: monthNames.map(function (n, i) { return { value: i + 1, label: n }; }),
      employee_options: getActiveEmployeeOptions_(dbId)
    };
  }

  function addMonthlySalary_(data, user, dbId) {
    var month = Number(data.month);
    var year = Number(data.year);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(year) || year < 2000) throw new Error('السنة مطلوبة');
    var entries = (data.entries || []).filter(function (e) { return e && e.emp_id; });
    if (!entries.length) throw new Error('لا توجد موظفين');

    var sheet = getSheet_(EMP_MONTHLY_SALARIES_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var startRow = sheet.getLastRow() + 1;
    var rows = entries.map(function (e, i) {
      var r = startRow + i;
      var empId = Number(e.emp_id);
      var rec = {
        emp_id: empId,
        name_ar: '=VLOOKUP(A' + r + ',valley_employee_info!A:B,2,0)',
        basic_salary: '=VLOOKUP(A' + r + ',valley_employee_salary_updated!A:F,6,0)',
        allow: '=VLOOKUP(A' + r + ',valley_employee_salary_updated!A:F,5,0)',
        title: '=VLOOKUP(A' + r + ',valley_employee_info!A:K,5,0)',
        section: '=VLOOKUP(A' + r + ',valley_employee_info!A:K,6,0)',
        working_days: Number(e.working_days) || 30,
        working_hours: '=VLOOKUP(A' + r + ',valley_employee_info!A:J,10,0)',
        working_days_value: '=(C' + r + '+D' + r + ')/30*G' + r,
        overtime_days: '=SUMIFS(valley_emp_overtime!H:H,valley_emp_overtime!B:B,A' + r + ',valley_emp_overtime!D:D,">="&DATE(Z' + r + ',AA' + r + ',1),valley_emp_overtime!D:D,"<="&EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0))',
        overtime_days_value: '=C' + r + '/30/H' + r + '*J' + r,
        vacation_days: '=SUMIFS(valley_emp_overtime!I:I,valley_emp_overtime!B:B,A' + r + ',valley_emp_overtime!D:D,">="&DATE(Z' + r + ',AA' + r + ',1),valley_emp_overtime!D:D,"<="&EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0))',
        vacation_days_value: '=C' + r + '/30*L' + r,
        other_addition: '=SUMIFS(valley_emp_overtime!L:L,valley_emp_overtime!B:B,A' + r + ',valley_emp_overtime!D:D,">="&DATE(Z' + r + ',AA' + r + ',1),valley_emp_overtime!D:D,"<="&EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0))',
        loans_value_deductions: '=SUMIFS(valley_emp_deductions!G:G,valley_emp_deductions!B:B,A' + r + ',valley_emp_deductions!E:E,">="&DATE(Z' + r + ',AA' + r + ',1),valley_emp_deductions!E:E,"<="&EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0))',
        deduction_day: '=SUMIFS(valley_emp_deductions!I:I,valley_emp_deductions!B:B,A' + r + ',valley_emp_deductions!E:E,">="&DATE(Z' + r + ',AA' + r + ',1),valley_emp_deductions!E:E,"<="&EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0))',
        deduction_day_value: '=C' + r + '/30*P' + r,
        penalty_deduction_days: '=SUMIFS(valley_emp_deductions!H:H,valley_emp_deductions!B:B,A' + r + ',valley_emp_deductions!E:E,">="&DATE(Z' + r + ',AA' + r + ',1),valley_emp_deductions!E:E,"<="&EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0))',
        penalty_deduction_days_value: '=C' + r + '/30*R' + r,
        delay_deductions: '=SUMIFS(valley_emp_deductions!J:J,valley_emp_deductions!B:B,A' + r + ',valley_emp_deductions!E:E,">="&DATE(Z' + r + ',AA' + r + ',1),valley_emp_deductions!E:E,"<="&EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0))',
        delay_deductions_value: '=C' + r + '/30/H' + r + '/60*T' + r,
        net_salary: '=I' + r + '+K' + r + '+M' + r + '+N' + r + '-O' + r + '-Q' + r + '-S' + r + '-U' + r,
        net_salary_nearest: '=IF(CEILING(V' + r + ',5)<0,0,CEILING(V' + r + ',5))',
        month_name: '=VLOOKUP(AA' + r + ',data_validation_hr!$A$1:$C$13,3,0)',
        section_type: '=VLOOKUP(F' + r + ',valley_dept_section_index!B:D,3,0)',
        year: year,
        month: month,
        salary_date: '=EOMONTH(DATE(Z' + r + ',AA' + r + ',1),0)',
        user: (user && user.email) || '',
        created_at: new Date()
      };
      return headers.map(function (h) {
        var key = String(h).trim();
        return rec[key] !== undefined ? rec[key] : '';
      });
    });
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
    try{ entries.forEach(function(e, i){ var _rec = { emp_id: Number(e.emp_id), month: month, year: year, working_days: Number(e.working_days)||30 }; var _uid = _rec.emp_id+'_'+month+'_'+year; try{ logHistory_(dbId, EMP_MONTHLY_SALARIES_SHEET, ('create_'+EMP_MONTHLY_SALARIES_SHEET+'_'+_uid), _uid, (user&&user.email)||'', 'create', _rec, null) }catch(e2){} }); }catch(e){}
    // build enriched saved rows for echo
    var _empNameMapMS = {};
    try { getAllRecords_(dbId, EMP_INFO_SHEET).forEach(function(e){ _empNameMapMS[String(e.emp_id)] = e.name_ar || String(e.emp_id); }); } catch(e){}
    var monthNamesMS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    var savedRows = entries.map(function(e){
      return {
        emp_id: Number(e.emp_id), name_ar: _empNameMapMS[String(e.emp_id)] || String(e.emp_id),
        working_days: Number(e.working_days)||30, month: month, year: year,
        month_name: monthNamesMS[month-1] || String(month),
        salary_date: new Date(year, month, 0), user: (user && user.email) || '', created_at: new Date()
      };
    });
    return { status: 'success', message: 'تم إنشاء رواتب الشهر', added: rows.length, data: { addedCount: rows.length }, record: { addedCount: rows.length, rows: savedRows } };
  }

  function generateMonthlySalaries_(data, user, dbId) {
    var month = Number(data.month);
    var year = Number(data.year);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(year) || year < 2000) throw new Error('السنة مطلوبة');

    var activeEmps = getActiveEmployeeOptions_(dbId);
    if (!activeEmps.length) throw new Error('لا يوجد موظفين نشطين');

    var existing = getAllRecords_(dbId, EMP_MONTHLY_SALARIES_SHEET);
    var existingSet = {};
    existing.forEach(function (r) {
      if (Number(r.month) === month && Number(r.year) === year) {
        existingSet[Number(r.emp_id)] = true;
      }
    });

    var newEmps = activeEmps.filter(function (e) { return !existingSet[Number(e.value)]; });
    if (!newEmps.length) throw new Error('جميع الموظفين لديهم رواتب مسجلة بالفعل لهذا الشهر');

    var entries = newEmps.map(function (e) { return { emp_id: e.value, working_days: Number(data.working_days) || 30 }; });
    return addMonthlySalary_({ month: month, year: year, entries: entries }, user, dbId);
  }

  // ===================== ATTENDANCE =====================
  function getAttendanceSessions_(data, user, dbId) {
    ensureSheet_(dbId, ATTENDANCE_SESSION_SHEET, ['session_id','session_date','session_status','selected_employees','user','created_at']);
    var _allSess = getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET);
    var limit = Number(data && data.limit) || 10;
    var rows = _allSess.slice().reverse().map(function (r) {
      return {
        session_id: r.session_id,
        session_date: r.session_date,
        session_date_display: sessionDateDisplay_(r.session_date),
        session_status: r.session_status,
        selected_employees: r.selected_employees,
        user: r.user,
        created_at: r.created_at
      };
    });
    // apply limit via vfPage if not loadAll, else return all
    var sp;
    if (data && data.loadAll) {
      sp = vfPage_(rows, { limit: null, offset: 0 }, 'session_date');
    } else {
      // enforce default limit 10 when client does not supply limit
      var lim = (data && data.limit != null) ? Number(data.limit) : limit;
      sp = vfPage_(rows, { limit: lim, offset: (data && data.offset) || 0 }, 'session_date');
    }
    return { status: 'success', sessions: sp.rows, total: sp.total };
  }

  function addAttendanceSession_(data, user, dbId) {
    var sessionDate = parseDate_(data.session_date);
    if (!sessionDate) throw new Error('التاريخ مطلوب');

    // Reject duplicate dates (compare normalized date-only keys so legacy
    // Date objects / serial numbers / text rows all compare correctly).
    var requestedKey = sessionDateKey_(sessionDate);
    var existing = getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET);
    for (var i = 0; i < existing.length; i++) {
      if (sessionDateKey_(existing[i].session_date) === requestedKey) {
        throw new Error('يوجد جلسة مسجلة بالفعل لهذا التاريخ (' + sessionDateDisplay_(requestedKey) + ')');
      }
    }

    var y = sessionDate.getFullYear();
    var mth = sessionDate.getMonth() + 1;
    var d = sessionDate.getDate();
    var sheet = getSheet_(ATTENDANCE_SESSION_SHEET, dbId);
    try { sheet.getRange('B:B').setNumberFormat('dd/mm/yyyy'); } catch (e) { /* non-fatal */ }
    var headers = getHeaders_(sheet);
    var row = {};
    row['session_id'] = Utilities.getUuid();
    row['session_date'] = dateOnlyToSerial_(d, mth, y);
    row['session_status'] = 'pending';
    row['selected_employees'] = String(data.selected_employees || '');
    row['user'] = (user && user.email) || '';
    row['created_at'] = new Date();
    var values = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
    sheet.appendRow(values);
    var savedRecordSess = {
      session_id: row['session_id'],
      session_date: row['session_date'],
      session_date_display: sessionDateDisplay_(row['session_date']),
      session_status: row['session_status'],
      selected_employees: row['selected_employees'],
      user: row['user'], created_at: row['created_at']
    };
    try{ logHistory_(dbId, ATTENDANCE_SESSION_SHEET, row.record_uid || ('create_'+ATTENDANCE_SESSION_SHEET+'_'+row['session_id']), row['session_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
    return { status: 'success', message: 'تم إنشاء الجلسة', data: { session_id: row['session_id'] }, record: savedRecordSess };
  }

  function buildEmpNameMap_(dbId) {
    var map = {};
    try {
      getAllRecords_(dbId, EMP_INFO_SHEET).forEach(function (e) {
        map[String(e.emp_id)] = String(e.name_ar || '').trim() || String(e.emp_id);
      });
    } catch (e) { /* fallback below */ }
    return map;
  }

  function getAttendanceData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_ATTENDANCE_SHEET, ['unique_id','id','emp_id','attendance_date_time','time_in','time_out','excuse_in','excuse_out','abscence','user','created_at']);
    var all = getAllRecords_(dbId, EMP_ATTENDANCE_SHEET);
    var sessionId = String(data.session_id || '').trim();
    var rows = all;
    if (sessionId) {
      rows = all.filter(function (r) { return String(r.id) === sessionId; });
    }
    var empOpts = getActiveEmployeeOptions_(dbId);
    var empMap = buildEmpNameMap_(dbId);
    rows.forEach(function (r) {
      r.employee_name = empMap[String(r.emp_id)] || r.emp_id;
      r.attendance_time_display = attendanceTimeDisplay_(r.attendance_date_time);
    });
    // sort newest first before paging
    rows = rows.slice().reverse();
    var totalBeforeCap = rows.length;
    var limit = Number(data && data.limit) || 10;
    var ap;
    if (data && data.loadAll) {
      ap = vfPage_(rows, { limit: null, offset: 0 }, 'attendance_date_time');
    } else {
      var lim2 = (data && data.limit != null) ? Number(data.limit) : limit;
      ap = vfPage_(rows, { limit: lim2, offset: (data && data.offset) || 0 }, 'attendance_date_time');
    }
    // also expose totalBeforeCap for calc if needed
    return { status: 'success', rows: ap.rows, total: ap.total, totalRecords: totalBeforeCap, employee_options: empOpts };
  }

  function addManualAttendance_(data, user, dbId) {
    var sessionId = String(data.session_id || '').trim();
    if (!sessionId) throw new Error('الجلسة مطلوبة');
    var empId = Number(data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var dt = parseDate_(data.attendance_date_time);
    if (!dt) throw new Error('تاريخ ووقت الحضور مطلوب');
    // Store as minute-precision numeric serial (integer-based, never text/Date).
    var serial = toSerialInt_(dateTimePartsToSerial_(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), dt.getMinutes()));
    var sheet = getSheet_(EMP_ATTENDANCE_SHEET, dbId);
    var headers = getHeaders_(sheet);
    try {
      var atIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'attendance_date_time'; });
      if (atIdx !== -1) sheet.getRange(2, atIdx + 1, Math.max(sheet.getLastRow() - 1, 1), 1).setNumberFormat('dd/mm/yyyy hh:mm');
    } catch (e) { /* non-fatal */ }
    var row = {};
    row['unique_id'] = Utilities.getUuid();
    row['id'] = sessionId;
    row['emp_id'] = empId;
    row['attendance_date_time'] = serial;
    row['time_in'] = data.time_in || '';
    row['time_out'] = data.time_out || '';
    row['excuse_in'] = data.excuse_in || '';
    row['excuse_out'] = data.excuse_out || '';
    row['abscence'] = data.abscence || '';
    row['user'] = (user && user.email) || '';
    row['created_at'] = new Date();
    var values = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
    sheet.appendRow(values);
    try{ logHistory_(dbId, EMP_ATTENDANCE_SHEET, row.record_uid || ('create_'+EMP_ATTENDANCE_SHEET+'_'+row['unique_id']), row['unique_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
    var _empMapMan = buildEmpNameMap_(dbId);
    var savedRecordMan = {
      unique_id: row['unique_id'], id: row['id'], emp_id: empId,
      employee_name: _empMapMan[String(empId)] || String(empId),
      attendance_date_time: serial,
      attendance_time_display: attendanceTimeDisplay_(serial),
      time_in: row['time_in'], time_out: row['time_out'],
      excuse_in: row['excuse_in'], excuse_out: row['excuse_out'], abscence: row['abscence'],
      user: row['user'], created_at: row['created_at']
    };
    return { status: 'success', message: 'تم تسجيل الحضور', data: { unique_id: row['unique_id'] }, record: savedRecordMan };
  }

  // ---- CSV analysis (date-format detection before upload) ----
  function extractRawDateParts_(csvContent) {
    var parsedCsv = Utilities.parseCsv(csvContent);
    var dateTimeRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2})\s*([^\s\d]+)?/;
    var results = [];
    for (var j = 0; j < parsedCsv.length; j++) {
      var row = parsedCsv[j];
      if (!row || row.length === 0 || row.join('').trim() === '') continue;
      var fullString = row.join(' ');
      var match = fullString.match(dateTimeRegex);
      if (match) {
        results.push({
          a: parseInt(match[1], 10),
          b: parseInt(match[2], 10),
          year: match[3],
          time: match[4],
          ampm: match[5] || '',
          rawDatePart: match[1] + '/' + match[2] + '/' + match[3]
        });
      }
    }
    return results;
  }

  function analyzeAttendanceCsv_(data, user, dbId) {
    var csvContent = String((data && data.csv_content) || '');
    if (!csvContent) throw new Error('محتوى الملف مطلوب');
    if (csvContent.length > 5 * 1024 * 1024) throw new Error('حجم الملف يتجاوز الحد الأقصى (5 ميجا)');
    var parts = extractRawDateParts_(csvContent);

    var result = {
      status: 'success',
      totalDates: parts.length,
      detectedFormat: 'ambiguous',
      evidenceCount: 0,
      conflictCount: 0,
      sampleDates: []
    };
    if (parts.length === 0) return result;

    var dmyEvidence = 0; // a>12 => a must be day => DD/MM
    var mdyEvidence = 0; // b>12 => b must be day => MM/DD
    for (var i = 0; i < parts.length; i++) {
      var a = parts[i].a, b = parts[i].b;
      var aOver12 = a > 12 && a <= 31;
      var bOver12 = b > 12 && b <= 31;
      if (aOver12 && !bOver12) dmyEvidence++;
      else if (bOver12 && !aOver12) mdyEvidence++;
    }

    result.evidenceCount = Math.max(dmyEvidence, mdyEvidence);
    result.conflictCount = (dmyEvidence > 0 && mdyEvidence > 0) ? Math.min(dmyEvidence, mdyEvidence) : 0;

    if (dmyEvidence > 0 && mdyEvidence === 0) result.detectedFormat = 'DMY';
    else if (mdyEvidence > 0 && dmyEvidence === 0) result.detectedFormat = 'MDY';

    var seen = {};
    for (var k = 0; k < parts.length && result.sampleDates.length < 8; k++) {
      var key = parts[k].rawDatePart;
      if (!seen[key]) { seen[key] = true; result.sampleDates.push(key); }
    }
    return result;
  }

  function uploadAttendanceCsv_(data, user, dbId) {
    var csvContent = String((data && data.csv_content) || '');
    if (!csvContent) throw new Error('محتوى الملف مطلوب');
    if (csvContent.length > 5 * 1024 * 1024) throw new Error('حجم الملف يتجاوز الحد الأقصى (5 ميجا)');
    var chosenFormat = String((data && data.format) || 'DMY').toUpperCase();
    if (chosenFormat !== 'DMY' && chosenFormat !== 'MDY') chosenFormat = 'DMY';
    var isMonthFirst = (chosenFormat === 'MDY');

    ensureSheet_(dbId, ATTENDANCE_SESSION_SHEET, ['session_id','session_date','session_status','selected_employees','user','created_at']);
    ensureSheet_(dbId, EMP_ATTENDANCE_SHEET, ['unique_id','id','emp_id','attendance_date_time','time_in','time_out','excuse_in','excuse_out','abscence','user','created_at']);

    var sessSheet = getSheet_(ATTENDANCE_SESSION_SHEET, dbId);
    try { sessSheet.getRange('B:B').setNumberFormat('dd/mm/yyyy'); } catch (e) { /* non-fatal */ }
    var attSheet = getSheet_(EMP_ATTENDANCE_SHEET, dbId);
    var attHeaders = getHeaders_(attSheet);

    ensureSheet_(dbId, ATT_REVIEW_SHEET, ['raw_row_text','reason','chosen_format','uploaded_by','uploaded_at']);
    var reviewSheet = getSheet_(ATT_REVIEW_SHEET, dbId);

    // Existing punch dedup set: emp|ddMMyyyyHHmm (handles Date/serial/text legacy rows)
    var existingRecords = {};
    getAllRecords_(dbId, EMP_ATTENDANCE_SHEET).forEach(function (r) {
      var empNorm = normalizeEmpIdVF_(r.emp_id);
      var dateKey = normalizeDateTimeKey_(r.attendance_date_time);
      if (empNorm && dateKey) existingRecords[empNorm + '|' + dateKey] = true;
    });

    // Existing sessions keyed by normalized date-only
    var existingSessions = {};
    getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET).forEach(function (s) {
      var k = sessionDateKey_(s.session_date);
      if (k && s.session_id) existingSessions[k] = s.session_id;
    });

    var rowsToAppend = [];
    var sessionsToAppend = [];
    var reviewRowsToAppend = [];
    var dateToSessionId = {};   // yyyy-MM-dd -> session_id (this file)
    var sessionIdByDateSerial = {};
    var skippedCount = 0, successCount = 0, flaggedCount = 0;

    var dateStats = {};
    var UNDATED_KEY = 'غير محدد (صفوف بدون تاريخ صالح)';
    function bumpStat(dateKey, field) {
      if (!dateStats[dateKey]) dateStats[dateKey] = { imported: 0, duplicate: 0, flagged: 0 };
      dateStats[dateKey][field]++;
    }

    var recordedUser = (user && user.email) || 'System';
    var uploadTimestamp = new Date();

    var parsedCsv = Utilities.parseCsv(csvContent);
    var dateTimeRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2})\s*([^\s\d]+)?/;

    for (var j = 0; j < parsedCsv.length; j++) {
      var row = parsedCsv[j];
      if (!row || row.length === 0 || row.join('').trim() === '') continue;

      var fullString = row.join(' ');
      var match = fullString.match(dateTimeRegex);
      if (!match) {
        reviewRowsToAppend.push([fullString.trim(), 'تعذر استخراج كود الموظف أو التاريخ من هذا الصف', chosenFormat, recordedUser, uploadTimestamp]);
        flaggedCount++;
        bumpStat(UNDATED_KEY, 'flagged');
        continue;
      }

      var datePart = match[1], timePart = match[4], amPmChar = (match[5] || '').trim();

      // Employee code = whatever precedes the date in the joined row text.
      var cleanEmpId = normalizeEmpIdVF_(fullString.split(datePart)[0]);

      var datePieces = datePart.split('/');
      var partA = parseInt(datePieces[0], 10);
      var partB = parseInt(datePieces[1], 10);
      var year = parseInt(datePieces[2], 10);

      var day, month;
      if (isMonthFirst) { month = partA; day = partB; }
      else { day = partA; month = partB; }

      // Safety check: impossible dates under the chosen format -> review sheet
      if (day < 1 || day > 31 || month < 1 || month > 12) {
        reviewRowsToAppend.push([fullString.trim(), 'تعارض مع الصيغة المختارة (' + chosenFormat + ') - يوم=' + day + ' شهر=' + month, chosenFormat, recordedUser, uploadTimestamp]);
        flaggedCount++;
        bumpStat(datePart + ' (تاريخ متعارض)', 'flagged');
        continue;
      }

      if (!cleanEmpId) {
        reviewRowsToAppend.push([fullString.trim(), 'تعذر استخراج كود الموظف من هذا الصف', chosenFormat, recordedUser, uploadTimestamp]);
        flaggedCount++;
        bumpStat(_pad2(day) + '/' + _pad2(month) + '/' + year + ' (كود مفقود)', 'flagged');
        continue;
      }

      // AM/PM normalization
      var period = '';
      if (amPmChar.match(/Õ|ص|am|a/i)) period = 'AM';
      else if (amPmChar.match(/ã|م|pm|p/i)) period = 'PM';

      var timeBits = timePart.split(':');
      var hours = parseInt(timeBits[0], 10);
      var minutes = parseInt(timeBits[1], 10);
      if (period === 'PM' && hours < 12) hours += 12;
      else if (period === 'AM' && hours === 12) hours = 0;

      var serialDateTime = toSerialInt_(dateTimePartsToSerial_(day, month, year, hours, minutes));
      var sessionDateSerial = dateOnlyToSerial_(day, month, year);

      var empNormCheck = normalizeEmpIdVF_(cleanEmpId);
      var recordKey = empNormCheck + '|' + normalizeDateTimeKey_(serialDateTime);
      var normDateOnly = _pad2(day) + '/' + _pad2(month) + '/' + year;

      if (existingRecords[recordKey]) {
        skippedCount++;
        bumpStat(normDateOnly, 'duplicate');
        continue;
      }

      // Resolve/create the session for this date
      var dateKeyFull = sessionDateKey_(serialToDate_(sessionDateSerial));
      var currentSessionId = '';
      if (dateToSessionId[normDateOnly]) {
        currentSessionId = dateToSessionId[normDateOnly];
      } else if (existingSessions[dateKeyFull]) {
        currentSessionId = existingSessions[dateKeyFull];
        dateToSessionId[normDateOnly] = currentSessionId;
      } else {
        currentSessionId = Utilities.getUuid();
        dateToSessionId[normDateOnly] = currentSessionId;
        existingSessions[dateKeyFull] = currentSessionId;
        sessionIdByDateSerial[currentSessionId] = sessionDateSerial;
        sessionsToAppend.push([currentSessionId, sessionDateSerial, 'synced', '', recordedUser, uploadTimestamp]);
      }

      rowsToAppend.push([
        Utilities.getUuid(),   // unique_id
        currentSessionId,      // id (session ref)
        Number(cleanEmpId) || cleanEmpId, // emp_id
        serialDateTime,        // attendance_date_time (pure serial number)
        '', '', '', '', '',    // time_in..abscence
        recordedUser,          // user
        uploadTimestamp        // created_at
      ]);
      existingRecords[recordKey] = true;
      successCount++;
      bumpStat(normDateOnly, 'imported');
    }

    if (sessionsToAppend.length > 0) {
      var sessHeaders = getHeaders_(sessSheet);
      var sessStartRow = sessSheet.getLastRow() + 1;
      sessSheet.getRange(sessStartRow, 1, sessionsToAppend.length, sessHeaders.length).setValues(
        sessionsToAppend.map(function (r) {
          var mapped = [];
          for (var c = 0; c < sessHeaders.length; c++) mapped.push(r[c] !== undefined ? r[c] : '');
          return mapped.slice(0, sessHeaders.length);
        })
      );
    }

    if (rowsToAppend.length > 0) {
      var startRow = attSheet.getLastRow() + 1;
      var atColIdx = attHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'attendance_date_time'; });
      if (atColIdx !== -1) {
        attSheet.getRange(startRow, atColIdx + 1, rowsToAppend.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
      }
      attSheet.getRange(startRow, 1, rowsToAppend.length, attHeaders.length).setValues(
        rowsToAppend.map(function (r) {
          var out = [];
          for (var h = 0; h < attHeaders.length; h++) {
            var key = String(attHeaders[h]).trim().toLowerCase();
            var idxMap = { unique_id: 0, id: 1, emp_id: 2, attendance_date_time: 3, time_in: 4, time_out: 5, excuse_in: 6, excuse_out: 7, abscence: 8, user: 9, created_at: 10 };
            out.push(r[idxMap[key]] !== undefined ? r[idxMap[key]] : '');
          }
          return out;
        })
      );
      // Keep the table sorted chronologically by attendance_date_time
      var finalLastRow = attSheet.getLastRow();
      if (atColIdx !== -1 && finalLastRow > 2) {
        attSheet.getRange(2, 1, finalLastRow - 1, attSheet.getLastColumn()).sort({ column: atColIdx + 1, ascending: true });
      }
    }

    if (reviewRowsToAppend.length > 0) {
      var reviewStartRow = reviewSheet.getLastRow() + 1;
      reviewSheet.getRange(reviewStartRow, 1, reviewRowsToAppend.length, 5).setValues(reviewRowsToAppend);
    }
    try{ sessionsToAppend.forEach(function(r){ var _sid=r[0]; var _row={ session_id:_sid, session_date:r[1], session_status:r[2] }; try{ logHistory_(dbId, ATTENDANCE_SESSION_SHEET, ('create_'+ATTENDANCE_SESSION_SHEET+'_'+_sid), _sid, (user&&user.email)||'', 'create', _row, null) }catch(e2){} }); rowsToAppend.forEach(function(r){ var _uid=r[0]; var _row2={ unique_id:_uid, id:r[1], emp_id:r[2], attendance_date_time:r[3] }; try{ logHistory_(dbId, EMP_ATTENDANCE_SHEET, ('create_'+EMP_ATTENDANCE_SHEET+'_'+_uid), _uid, (user&&user.email)||'', 'create', _row2, null) }catch(e2){} }); }catch(e){}

    return {
      status: 'success',
      message: 'تم الرفع: ' + successCount + ' جديد، ' + skippedCount + ' مكرر' + (flaggedCount ? '، ' + flaggedCount + ' يحتاج مراجعة' : ''),
      successCount: successCount,
      skippedCount: skippedCount,
      flaggedCount: flaggedCount,
      newSessionsCount: sessionsToAppend.length,
      added: successCount,
      undatedKey: UNDATED_KEY,
      dateStats: dateStats
    };
  }

  function getAttendanceReport_(data, user, dbId) {
    var startDate = flexToDateTime_(data.start_date);
    var endDate = flexToDateTime_(data.end_date);
    endDate.setHours(23, 59, 59, 999);
    if (!startDate || !endDate) throw new Error('تاريخ البداية والنهاية مطلوب');

    var records = getAllRecords_(dbId, EMP_ATTENDANCE_SHEET);
    var empOpts = getActiveEmployeeOptions_(dbId);
    var empMap = buildEmpNameMap_(dbId);
    empOpts.forEach(function (o) {
      var code = String(o.value);
      if (!empMap[code]) empMap[code] = o.label;
    });

    var empStats = {};
    records.forEach(function (r) {
      var dt = flexToDateTime_(r.attendance_date_time);
      if (!dt || dt < startDate || dt > endDate) return;
      var eid = String(r.emp_id);
      if (!empStats[eid]) {
        empStats[eid] = { emp_id: r.emp_id, name_ar: empMap[eid] || r.emp_id, total: 0, present: 0, absent: 0, late: 0, excuse: 0 };
      }
      empStats[eid].total++;
      if (r.abscence && String(r.abscence).trim()) {
        empStats[eid].absent++;
      } else {
        empStats[eid].present++;
      }
      if (r.excuse_in && String(r.excuse_in).trim()) empStats[eid].late++;
      if (r.excuse_out && String(r.excuse_out).trim()) empStats[eid].late++;
    });

    var report = Object.keys(empStats).map(function (k) { return empStats[k]; });
    return { status: 'success', report: report };
  }

  // ===================== FILE UPLOAD =====================
  var UPLOAD_META = {
    'valley_emp_deductions': { page: 'vf_hr_deductions', folder: 'valley_emp_deductions_Files_' },
    'valley_emp_overtime': { page: 'vf_hr_overtime', folder: 'valley_emp_overtime_Files_' },
    'valley_employee_vacations': { page: 'vf_hr_vacations', folder: 'valley_employee_vacations_Files_' }
  };

  function ensureDriveFolderId_(folderName) {
    var cache = CacheService.getScriptCache();
    var key = 'uploadfolder_' + folderName;
    try {
      var cachedId = cache.get(key);
      if (cachedId) return cachedId;
    } catch (e) {}
    try {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
        var q = "name = '" + folderName.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        var res = Drive.Files.list({ q: q, fields: 'files(id, name)' });
        if (res && res.files && res.files.length > 0) {
          var folderId = res.files[0].id;
          try { cache.put(key, folderId, 21600); } catch (e) {}
          return folderId;
        }
        var created = Drive.Files.create({ name: folderName, mimeType: 'application/vnd.google-apps.folder' });
        if (created && created.id) { try { cache.put(key, created.id, 21600); } catch (e) {} return created.id; }
      }
    } catch (advErr) { Logger.log('[ensureDriveFolder] Drive.Files failed: ' + advErr); }
    try {
      var token = ScriptApp.getOAuthToken();
      var sq = "name = '" + folderName.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
      var searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(sq) + '&fields=files(id)';
      var searchRes = UrlFetchApp.fetch(searchUrl, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      if (searchRes.getResponseCode() === 200) {
        var sd = JSON.parse(searchRes.getContentText());
        if (sd.files && sd.files.length > 0) { var sid = sd.files[0].id; try { cache.put(key, sid, 21600); } catch (e) {} return sid; }
      }
      var createRes = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
        muteHttpExceptions: true
      });
      if (createRes.getResponseCode() === 200 || createRes.getResponseCode() === 201) {
        var cData = JSON.parse(createRes.getContentText());
        try { cache.put(key, cData.id, 21600); } catch (e) {}
        return cData.id;
      }
      Logger.log('[ensureDriveFolder] REST create failed code=' + createRes.getResponseCode() + ' body=' + createRes.getContentText());
    } catch (restErr) { Logger.log('[ensureDriveFolder] REST API failed: ' + restErr); }
    throw new Error('تعذر إنشاء مجلد Google Drive — تأكد من تفعيل Google Drive API في Cloud Console ثم أعد نشر التطبيق');
  }

  function uploadDriveFileRest_(folderId, blob, fileName) {
    try {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.create) {
        var created = Drive.Files.create({ name: fileName, parents: [folderId] }, blob);
        if (created && created.id) return created;
      }
    } catch (advErr) {}
    var token = ScriptApp.getOAuthToken();
    var boundary = '-------' + Utilities.getUuid();
    var delimiter = "\r\n--" + boundary + "\r\n";
    var close_delim = "\r\n--" + boundary + "--";
    var contentType = blob.getContentType() || 'application/octet-stream';
    var base64Data = Utilities.base64Encode(blob.getBytes());
    var body = delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: fileName, parents: [folderId] }) +
      delimiter + 'Content-Type: ' + contentType + '\r\nContent-Transfer-Encoding: base64\r\n\r\n' + base64Data + close_delim;
    var response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'post', contentType: 'multipart/related; boundary=' + boundary,
      headers: { Authorization: 'Bearer ' + token }, payload: body, muteHttpExceptions: true
    });
    if (response.getResponseCode() === 200 || response.getResponseCode() === 201) return JSON.parse(response.getContentText());
    throw new Error('فشل رفع الملف (' + response.getResponseCode() + ')');
  }

  function mimeForExt_(ext) {
    var map = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
    return map[(ext || '').toLowerCase()] || 'application/octet-stream';
  }

  function addUploadFile_(data, user, dbId) {
    var sheet = String((data && data.sheet) || '').trim();
    var cfg = UPLOAD_META[sheet];
    if (!cfg) throw new Error('الجدول غير معروف');
    if (!(user && user.isSuperAdmin)) {
      var grants = ((user && user.authorizedPages) || {})[cfg.page] || [];
      if (grants.indexOf('write') === -1) {
        throw new Error('لا يوجد صلاحية لإضافة سجلات في هذه الصفحة');
      }
    }
    var filename = String((data && data.filename) || '').trim();
    if (!filename) throw new Error('اسم الملف مطلوب');
    var dot = filename.lastIndexOf('.');
    var ext = (dot > 0 ? filename.slice(dot + 1) : '').toLowerCase();
    var allowedExt = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    if (allowedExt.indexOf(ext) === -1) throw new Error('نوع الملف غير مسموح (pdf, word, png, jpg فقط)');
    var b64 = String((data && data.base64) || '').replace(/\s/g, '');
    if (!b64) throw new Error('لا يوجد ملف');
    var bytes = Utilities.base64Decode(b64);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 10 ميجابايت');
    var folderId = ensureDriveFolderId_(cfg.folder);
    var ts = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    var cleanName = (filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\.[^.]+$/, '') || 'file');
    var newName = cleanName + '.' + ts + '.' + ext;
    var blob = Utilities.newBlob(bytes, mimeForExt_(ext), newName);
    uploadDriveFileRest_(folderId, blob, newName);
    return { status: 'success', reference: cfg.folder + '/' + newName };
  }

  // ===================== HR SETTINGS (reference tables) =====================
  // Manages the four reference tables consumed by the HR module. Writes are
  // BY HEADER NAME (never positional) so live sheets with any column order
  // keep their historical VLOOKUP/COUNTIFS formulas intact. Deactivate-only:
  // no delete endpoints exist because deleting a role/type breaks every
  // historical record's formulas that reference it.
  const SETTINGS_SHIFT_SCHEDULE_SHEET = 'valley_employee_shift_schedule';
  const SETTINGS_DEDUCTION_CATEGORIES = ['جزاءات', 'غياب', 'حضور وانصراف'];

  const OVERTIME_ROLES_CANONICAL   = ['overtime_rule_unique_id','overtime_type','overtime_rate','money_related','vacation_days','is_active'];
  const DEDUCTION_ROLES_CANONICAL  = ['rule_unique_id','deduction_name','deduction_category','is_active','deduction_value','deduction_note','deduction_hours','deduction_days'];
  const VACATIONS_INDEX_CANONICAL  = ['id','vacation_name_ar','vacation_name_en','require_allocation','is_active'];
  const SHIFT_SCHEDULE_CANONICAL   = ['shift_unique_id','shift_name','shift_type','shift_start_time','shift_end_time','is_active'];

  /* Create the sheet if missing (canonical, formula-safe order); otherwise
   * append any missing headers AT THE END (never shifts existing positions). */
  function settingsEnsureSheet_(dbId, sheetName, canonical) {
    var key = String(dbId) + '|' + sheetName;
    if (_ensuredSheets_[key]) return _ensuredSheets_[key];
    var ss = getSpreadsheet_(dbId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(canonical);
      sheet.setFrozenRows(1);
      _ensuredSheets_[key] = sheet;
      return sheet;
    }
    var existing = getHeaders_(sheet).map(function (h) { return String(h).trim(); });
    var missing = canonical.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) {
      sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
      delete _headerCache_[ss.getId() + '_' + sheet.getSheetId()];
    }
    _ensuredSheets_[key] = sheet;
    return sheet;
  }

  /* Verify that formula-addressed columns sit where the payroll formulas expect. */
  function settingsAlignmentWarning_(headers, expectedIdx) {
    var bad = [];
    Object.keys(expectedIdx).forEach(function (name) {
      var got = -1;
      for (var i = 0; i < headers.length; i++) {
        if (String(headers[i]).trim().toLowerCase() === name.toLowerCase()) { got = i; break; }
      }
      if (got !== expectedIdx[name]) bad.push(name);
    });
    if (!bad.length) return '';
    return 'تنبيه: ترتيب أعمدة هذا الجدول لا يطابق المواضع التي تعتمدها معادلات الرواتب التلقائية (' +
      bad.join('، ') + '). التعديل من هنا آمن، لكن راجع مواضع الأعمدة في الشيت قبل إضافة سجلات جديدة.';
  }

  function settingsUniqueViolation_(rows, field, value, excludeKeyHeader, excludeKey) {
    var v = String(value == null ? '' : value).trim().toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      if (excludeKey && String(rows[i][excludeKeyHeader]) === String(excludeKey)) continue;
      if (String(rows[i][field] == null ? '' : rows[i][field]).trim().toLowerCase() === v) return true;
    }
    return false;
  }

  function settingsInsertRow_(sheet, headers, dataMap) {
    var values = headers.map(function (h) {
      var k = String(h).trim();
      return dataMap[k] !== undefined ? dataMap[k] : '';
    });
    sheet.appendRow(values);
  }

  /* ---------- OVERTIME ROLES ---------- */
  function getOvertimeRolesSettings_(data, user, dbId) {
    settingsEnsureSheet_(dbId, OVERTIME_ROLES_SHEET, OVERTIME_ROLES_CANONICAL);
    return vfRefsCached_(dbId, 'overtime_roles', function () {
      var sheet = getSheet_(OVERTIME_ROLES_SHEET, dbId);
      var headers = getHeaders_(sheet);
      var rows = getAllRecords_(dbId, OVERTIME_ROLES_SHEET);
      rows.forEach(function (r) { r.is_active = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'); });
      return {
        status: 'success',
        rows: rows,
        alignment_warning: settingsAlignmentWarning_(headers, { overtime_rule_unique_id: 0, overtime_type: 1, overtime_rate: 2, money_related: 3, vacation_days: 4 })
      };
    });
  }

  function saveOvertimeRole_(data, user, dbId) {
    vfBustRefs_(dbId, ['overtime_roles']);
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var keyHeader = 'overtime_rule_unique_id';
    var key = String(d[keyHeader] || '').trim();
    /* POLICY: adding a type = page-write authority; EDITING an existing one = super admin only. */
    if (key && !isSuperAdmin) throw new Error('تعديل الأنواع الموجودة من صلاحيات مدير النظام فقط');
    var name = String(d.overtime_type || '').trim();
    if (!name) throw new Error('اسم نوع العمل الإضافي مطلوب');
    var rate = Number(d.overtime_rate);
    if (isNaN(rate) || rate < 0) throw new Error('المعدل يجب أن يكون رقماً صحيحاً');
    var sheet = getSheet_(OVERTIME_ROLES_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, OVERTIME_ROLES_SHEET);

    if (settingsUniqueViolation_(rows, 'overtime_type', name, keyHeader, key)) {
      throw new Error('يوجد نوع عمل إضافي بنفس الاسم بالفعل');
    }

    var map = {
      overtime_type: name,
      overtime_rate: rate,
      money_related: !!(d.money_related === true || String(d.money_related).toLowerCase() === 'true'),
      vacation_days: !!(d.vacation_days === true || String(d.vacation_days).toLowerCase() === 'true')
    };

    if (key) {
      var _oldOT = rows.find(function(r){ return String(r[keyHeader])===String(key); }) || null;
      if (!updateRowByCriteria_(sheet, keyHeader, key, map)) throw new Error('السجل غير موجود');
      try{ var _newOT = Object.assign({}, _oldOT||{}, map); logHistory_(dbId, OVERTIME_ROLES_SHEET, _oldOT&&_oldOT.record_uid ? _oldOT.record_uid : ('update_'+OVERTIME_ROLES_SHEET+'_'+key), key, (user&&user.email)||'', 'update', _newOT, _oldOT) }catch(e){}
      return { status: 'success', message: 'تم تحديث النوع' };
    }
    map[keyHeader] = uid16_();
    map['is_active'] = true;
    settingsInsertRow_(sheet, headers, map);
    try{ logHistory_(dbId, OVERTIME_ROLES_SHEET, map.record_uid || ('create_'+OVERTIME_ROLES_SHEET+'_'+map[keyHeader]), map[keyHeader], (user&&user.email)||'', 'create', map, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة النوع' };
  }

  function toggleOvertimeRole_(data, user, dbId) {
    vfBustRefs_(dbId, ['overtime_roles']);
    var key = String((data || {}).key || '').trim();
    if (!key) throw new Error('المفتاح مطلوب');
    var sheet = getSheet_(OVERTIME_ROLES_SHEET, dbId);
    var rows = getAllRecords_(dbId, OVERTIME_ROLES_SHEET);
    var row = null;
    rows.forEach(function (r) { if (String(r.overtime_rule_unique_id) === key) row = r; });
    if (!row) throw new Error('السجل غير موجود');
    var newValue = (row.is_active === false || String(row.is_active).toLowerCase() === 'false');
    if (!updateRowByCriteria_(sheet, 'overtime_rule_unique_id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
    try{ logHistory_(dbId, OVERTIME_ROLES_SHEET, row.record_uid || ('update_'+OVERTIME_ROLES_SHEET+'_'+key), key, (user&&user.email)||'', 'update', { is_active: newValue }, row) }catch(e){}
    return { status: 'success', message: newValue ? 'تم تفعيل النوع' : 'تم إيقاف النوع', is_active: newValue };
  }

  /* ---------- DEDUCTION ROLES ---------- */
  function getDeductionRolesSettings_(data, user, dbId) {
    settingsEnsureSheet_(dbId, DEDUCTION_ROLES_SHEET, DEDUCTION_ROLES_CANONICAL);
    return vfRefsCached_(dbId, 'deduction_roles', function () {
      var sheet = getSheet_(DEDUCTION_ROLES_SHEET, dbId);
      var headers = getHeaders_(sheet);
      var rows = getAllRecords_(dbId, DEDUCTION_ROLES_SHEET);
      rows.forEach(function (r) { r.is_active = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'); });
      return {
        status: 'success',
        rows: rows,
        categories: SETTINGS_DEDUCTION_CATEGORIES,
        alignment_warning: settingsAlignmentWarning_(headers, { deduction_category: 2, deduction_hours: 6, deduction_days: 7 })
      };
    });
  }

  function saveDeductionRole_(data, user, dbId) {
    vfBustRefs_(dbId, ['deduction_roles']);
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var keyHeader = 'rule_unique_id';
    var key = String(d[keyHeader] || '').trim();
    /* POLICY: adding a rule = page-write authority; EDITING an existing one = super admin only. */
    if (key && !isSuperAdmin) throw new Error('تعديل قواعد الخصم الموجودة من صلاحيات مدير النظام فقط');
    var name = String(d.deduction_name || '').trim();
    if (!name) throw new Error('اسم الخصم مطلوب');
    var category = String(d.deduction_category || '').trim();
    if (SETTINGS_DEDUCTION_CATEGORIES.indexOf(category) === -1) {
      throw new Error('التصنيف يجب أن يكون أحد: ' + SETTINGS_DEDUCTION_CATEGORIES.join('، '));
    }
    var days = d.deduction_days === '' || d.deduction_days == null ? 0 : Number(d.deduction_days);
    var hours = d.deduction_hours === '' || d.deduction_hours == null ? 0 : Number(d.deduction_hours);
    var value = d.deduction_value === '' || d.deduction_value == null ? 0 : Number(d.deduction_value);
    if (isNaN(days) || days < 0) throw new Error('أيام الخصم يجب أن تكون رقماً صحيحاً');
    if (isNaN(hours) || hours < 0) throw new Error('ساعات الخصم يجب أن تكون رقماً صحيحاً');
    if (isNaN(value) || value < 0) throw new Error('قيمة الخصم يجب أن تكون رقماً صحيحاً');

    var sheet = getSheet_(DEDUCTION_ROLES_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, DEDUCTION_ROLES_SHEET);

    if (settingsUniqueViolation_(rows, 'deduction_name', name, keyHeader, key)) {
      throw new Error('يوجد خصم بنفس الاسم بالفعل');
    }

    var map = {
      deduction_name: name,
      deduction_category: category,
      deduction_value: value,
      deduction_days: days,
      deduction_hours: hours
    };

    if (key) {
      var _oldDR = rows.find(function(r){ return String(r[keyHeader])===String(key); }) || null;
      if (!updateRowByCriteria_(sheet, keyHeader, key, map)) throw new Error('السجل غير موجود');
      try{ var _newDR = Object.assign({}, _oldDR||{}, map); logHistory_(dbId, DEDUCTION_ROLES_SHEET, _oldDR&&_oldDR.record_uid ? _oldDR.record_uid : ('update_'+DEDUCTION_ROLES_SHEET+'_'+key), key, (user&&user.email)||'', 'update', _newDR, _oldDR) }catch(e){}
      return { status: 'success', message: 'تم تحديث الخصم' };
    }
    map[keyHeader] = uid16_();
    map['is_active'] = true;
    settingsInsertRow_(sheet, headers, map);
    try{ logHistory_(dbId, DEDUCTION_ROLES_SHEET, map.record_uid || ('create_'+DEDUCTION_ROLES_SHEET+'_'+map[keyHeader]), map[keyHeader], (user&&user.email)||'', 'create', map, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة الخصم' };
  }

  function toggleDeductionRole_(data, user, dbId) {
    vfBustRefs_(dbId, ['deduction_roles']);
    var key = String((data || {}).key || '').trim();
    if (!key) throw new Error('المفتاح مطلوب');
    var sheet = getSheet_(DEDUCTION_ROLES_SHEET, dbId);
    var rows = getAllRecords_(dbId, DEDUCTION_ROLES_SHEET);
    var row = null;
    rows.forEach(function (r) { if (String(r.rule_unique_id) === key) row = r; });
    if (!row) throw new Error('السجل غير موجود');
    var newValue = (row.is_active === false || String(row.is_active).toLowerCase() === 'false');
    if (!updateRowByCriteria_(sheet, 'rule_unique_id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
    try{ logHistory_(dbId, DEDUCTION_ROLES_SHEET, row.record_uid || ('update_'+DEDUCTION_ROLES_SHEET+'_'+key), key, (user&&user.email)||'', 'update', { is_active: newValue }, row) }catch(e){}
    return { status: 'success', message: newValue ? 'تم تفعيل الخصم' : 'تم إيقاف الخصم', is_active: newValue };
  }

  /* ---------- VACATIONS INDEX ---------- */
  function nextVacationIndexId_(rows) {
    var max = 0;
    rows.forEach(function (r) {
      var n = Number(r.id);
      if (Number.isInteger(n) && n > max) max = n;
    });
    return max + 1;
  }

  function getVacationsIndexSettings_(data, user, dbId) {
    settingsEnsureSheet_(dbId, VACATIONS_INDEX_SHEET, VACATIONS_INDEX_CANONICAL);
    return vfRefsCached_(dbId, 'vacations_index', function () {
      var rows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET);
      rows.forEach(function (r) { r.is_active = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'); });
      return { status: 'success', rows: rows, suggested_next_id: nextVacationIndexId_(rows) };
    });
  }

  function saveVacationIndex_(data, user, dbId) {
    vfBustRefs_(dbId, ['vacations_index']);
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = (d._editing === true || d._editing === 'true');
    /* POLICY: adding a type = page-write authority; EDITING an existing one = super admin only. */
    if (editing && !isSuperAdmin) throw new Error('تعديل أنواع الإجازات الموجودة من صلاحيات مدير النظام فقط');
    var vacId = String(d.id || '').trim();
    if (!vacId) throw new Error('كود الإجازة مطلوب');
    var nameAr = String(d.vacation_name_ar || '').trim();
    if (!nameAr) throw new Error('الاسم العربي مطلوب');

    var sheet = getSheet_(VACATIONS_INDEX_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET);

    if (settingsUniqueViolation_(rows, 'id', vacId, 'id', editing ? vacId : '')) {
      throw new Error('كود الإجازة مستخدم بالفعل');
    }
    if (settingsUniqueViolation_(rows, 'vacation_name_ar', nameAr, 'id', vacId)) {
      throw new Error('يوجد نوع إجازة بنفس الاسم العربي بالفعل');
    }

    var map = {
      id: vacId,
      vacation_name_ar: nameAr,
      vacation_name_en: String(d.vacation_name_en || '').trim(),
      require_allocation: !!(d.require_allocation === true || String(d.require_allocation).toLowerCase() === 'true')
    };

    if (d._editing === true || d._editing === 'true') {
      var _oldVI = rows.find(function(r){ return String(r.id)===String(vacId); }) || null;
      if (!updateRowByCriteria_(sheet, 'id', vacId, map)) throw new Error('السجل غير موجود');
      try{ var _newVI = Object.assign({}, _oldVI||{}, map); logHistory_(dbId, VACATIONS_INDEX_SHEET, _oldVI&&_oldVI.record_uid ? _oldVI.record_uid : ('update_'+VACATIONS_INDEX_SHEET+'_'+vacId), vacId, (user&&user.email)||'', 'update', _newVI, _oldVI) }catch(e){}
      return { status: 'success', message: 'تم تحديث نوع الإجازة' };
    }
    map['is_active'] = true;
    settingsInsertRow_(sheet, headers, map);
    try{ logHistory_(dbId, VACATIONS_INDEX_SHEET, map.record_uid || ('create_'+VACATIONS_INDEX_SHEET+'_'+map.id), map.id, (user&&user.email)||'', 'create', map, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة نوع الإجازة' };
  }

  function toggleVacationIndex_(data, user, dbId) {
    vfBustRefs_(dbId, ['vacations_index']);
    var key = String((data || {}).key || '').trim();
    if (!key) throw new Error('المفتاح مطلوب');
    var sheet = getSheet_(VACATIONS_INDEX_SHEET, dbId);
    var rows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET);
    var row = null;
    rows.forEach(function (r) { if (String(r.id) === key) row = r; });
    if (!row) throw new Error('السجل غير موجود');
    var newValue = (row.is_active === false || String(row.is_active).toLowerCase() === 'false');
    if (!updateRowByCriteria_(sheet, 'id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
    try{ logHistory_(dbId, VACATIONS_INDEX_SHEET, row.record_uid || ('update_'+VACATIONS_INDEX_SHEET+'_'+key), key, (user&&user.email)||'', 'update', { is_active: newValue }, row) }catch(e){}
    return { status: 'success', message: newValue ? 'تم تفعيل النوع' : 'تم إيقاف النوع', is_active: newValue };
  }

  /* ---------- SHIFT SCHEDULE ---------- */
  function normalizeTimeStr_(v) {
    if (v instanceof Date) return pad2_(v.getHours()) + ':' + pad2_(v.getMinutes());
    var m = String(v || '').match(/^(\d{1,2}):(\d{2})/);
    if (m) return pad2_(Number(m[1])) + ':' + m[2];
    return String(v || '');
  }

  function getShiftScheduleSettings_(data, user, dbId) {
    settingsEnsureSheet_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET, SHIFT_SCHEDULE_CANONICAL);
    return vfRefsCached_(dbId, 'shift_schedule', function () {
      var rows = getAllRecords_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET);
      rows.forEach(function (r) {
        r.is_active = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false');
        r.shift_start_time_display = normalizeTimeStr_(r.shift_start_time);
        r.shift_end_time_display = normalizeTimeStr_(r.shift_end_time);
      });
      return { status: 'success', rows: rows };
    });
  }

  function saveShiftSchedule_(data, user, dbId) {
    vfBustRefs_(dbId, ['shift_schedule']);
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var keyHeader = 'shift_unique_id';
    var key = String(d[keyHeader] || '').trim();
    /* POLICY: adding a shift = page-write authority; EDITING an existing one = super admin only. */
    if (key && !isSuperAdmin) throw new Error('تعديل الورديات الموجودة من صلاحيات مدير النظام فقط');
    var name = String(d.shift_name || '').trim();
    if (!name) throw new Error('اسم الوردية مطلوب');
    var start = normalizeTimeStr_(d.shift_start_time);
    var end = normalizeTimeStr_(d.shift_end_time);
    if (!start || !end) throw new Error('وقت البداية والنهاية مطلوبان');

    var sheet = getSheet_(SETTINGS_SHIFT_SCHEDULE_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET);

    if (settingsUniqueViolation_(rows, 'shift_name', name, keyHeader, key)) {
      throw new Error('يوجد وردية بنفس الاسم بالفعل');
    }

    var map = {
      shift_name: name,
      shift_type: String(d.shift_type || '').trim(),
      shift_start_time: start,
      shift_end_time: end
    };

    if (key) {
      var _oldSS = rows.find(function(r){ return String(r[keyHeader])===String(key); }) || null;
      if (!updateRowByCriteria_(sheet, keyHeader, key, map)) throw new Error('السجل غير موجود');
      try{ var _newSS = Object.assign({}, _oldSS||{}, map); logHistory_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET, _oldSS&&_oldSS.record_uid ? _oldSS.record_uid : ('update_'+SETTINGS_SHIFT_SCHEDULE_SHEET+'_'+key), key, (user&&user.email)||'', 'update', _newSS, _oldSS) }catch(e){}
      return { status: 'success', message: 'تم تحديث الوردية' };
    }
    map[keyHeader] = uid16_();
    map['is_active'] = true;
    settingsInsertRow_(sheet, headers, map);
    try{ logHistory_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET, map.record_uid || ('create_'+SETTINGS_SHIFT_SCHEDULE_SHEET+'_'+map[keyHeader]), map[keyHeader], (user&&user.email)||'', 'create', map, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة الوردية' };
  }

  function toggleShiftSchedule_(data, user, dbId) {
    vfBustRefs_(dbId, ['shift_schedule']);
    var key = String((data || {}).key || '').trim();
    if (!key) throw new Error('المفتاح مطلوب');
    var sheet = getSheet_(SETTINGS_SHIFT_SCHEDULE_SHEET, dbId);
    var rows = getAllRecords_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET);
    var row = null;
    rows.forEach(function (r) { if (String(r.shift_unique_id) === key) row = r; });
    if (!row) throw new Error('السجل غير موجود');
    var newValue = (row.is_active === false || String(row.is_active).toLowerCase() === 'false');
    if (!updateRowByCriteria_(sheet, 'shift_unique_id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
    try{ logHistory_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET, row.record_uid || ('update_'+SETTINGS_SHIFT_SCHEDULE_SHEET+'_'+key), key, (user&&user.email)||'', 'update', { is_active: newValue }, row) }catch(e){}
    return { status: 'success', message: newValue ? 'تم تفعيل الوردية' : 'تم إيقاف الوردية', is_active: newValue };
  }

  // ===================== FINANCE MASTER DATA (valley_products / parties) =====================
  // Schemas recovered verbatim from the AppSheet legacy design. Physical
  // columns only — AppSheet virtual/formula columns are computed for display
  // client-side and never stored. IDs are assigned exclusively through
  // addRecord_ → getNextIdUnderLock_ (lock-protected max+1 iteration).
  const FIN_PRODUCTS_SHEET = 'valley_products';
  const FIN_PARTIES_SHEET  = 'valley_legal_customer_vendor';
  const FIN_CATEGORIES_SHEET = 'valley_categories';
  const FIN_CHART_SHEET = 'valley_chart_of_accounts';

  const FIN_PRODUCTS_HEADERS = ['id','name_ar','product_type','name_en','client_id','GPC','unit','carton','cost_allocation_percentage','concentration','price_unit','asset_code','income_code','category','sales_tax','user','created_at','export_request','export_user','quality_controlled','unique_id'];
  const FIN_PARTIES_HEADERS  = ['id','name','customer_direction','type','registration_number','tax_id','name_en','country','region','telephone','address','المستوى الاساسي','user','created_at'];

  const FIN_PRODUCT_TYPES = ['بطاطس خام', 'زيوت خام', 'فراوله خام', 'خضار خام', 'اكياس تغليف', 'كرتون', 'الاصول الغير متداولة', 'بطاطس نصف مقلية تامة الصنع', 'مستلزمات انتاج', 'الاصول متداولة', 'خدمات'];
  const FIN_UNITS = ['كجم', 'لتر', 'بكرة', 'كرتونة', 'قطعة', 'متر'];
  const FIN_QUALITY = ['Controlled', 'Un-Controlled'];
  const FIN_DIRECTIONS = ['عميل', 'مورد'];
  const FIN_PARTY_TYPES = ['محلي - موزع', 'محلي - تجزأة', 'محلي - فنادق', 'تصدير', 'مقدم خدمات', 'مورد - محلي', 'مورد - خارجي'];

  function finNextId_(rows) {
    var max = 0;
    rows.forEach(function (r) {
      var n = Number(r.id);
      if (Number.isInteger(n) && n >= max) max = n;
    });
    return max + 1;
  }

  function finNum_(v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  var FIN_SALES_TAX_VALUES = [0, 0.05, 0.10, 0.14];

  /* ---- Reference-data micro-cache ("TC bootstrap" speed) ----
   * 60s TTL; our own save handlers bust the touched kinds instantly so
   * app-made changes are immediate. Direct sheet edits propagate ≤60s. */
  // vfRefsCached_() and FIN_REF_TTL are defined globally (file top level) so
  // every module (HREmp, HRModules, Finance) can call them across IIFE scopes.
  function vfBustRefs_(dbId, kinds) {
    try {
      (kinds || []).forEach(function (k) {
        try { invalidateRefsCache_(dbId, k); } catch (e0) {}
        try { CacheService.getScriptCache().remove('vfref_' + String(dbId) + '_' + k); } catch (e1) {}
        try { CacheService.getScriptCache().remove('refs_' + String(dbId) + '_' + k); } catch (e2) {}
      });
    } catch (e) {}
  }
  function finRefsCached_(dbId, kind, builder) { return vfRefsCached_(dbId, kind, builder); }
  function finBustRefs_(dbId) {
    vfBustRefs_(dbId, ['parties', 'parties_raw', 'products', 'products_options', 'products_raw', 'recipes_products', 'categories', 'boxes', 'chart', 'chart_asset', 'chart_cash', 'chart_of_accounts']);
  }

  function getValleyProducts_(data, user, dbId) {
    settingsEnsureSheet_(dbId, FIN_PRODUCTS_SHEET, FIN_PRODUCTS_HEADERS);
    var rows = getAllRecords_(dbId, FIN_PRODUCTS_SHEET);
    var catOpts = [];
    try {
      catOpts = finRefsCached_(dbId, 'categories', function () {
        return getAllRecords_(dbId, FIN_CATEGORIES_SHEET).map(function (r) {
          return { value: r.id != null ? r.id : '', label: String(r.name || r.name_ar || r.id || '') };
        }).filter(function (o) { return String(o.value).trim() !== ''; });
      });
    } catch (e) {}
    var accountOpts = [];
    try {
      /* كود الأصل refs valley_chart_of_accounts: label = «كود المستوى»,
       * stored value = «المستوى الخامس», restricted to 114100..115100. */
      accountOpts = finRefsCached_(dbId, 'chart_of_accounts', function () {
        return getAllRecords_(dbId, FIN_CHART_SHEET).map(function (r) {
          var lvl5 = Number(r['المستوى الخامس']);
          var code = r['كود المستوى'];
          if (!Number.isInteger(lvl5) || lvl5 < 114100 || lvl5 > 115100) return null;
          return { value: lvl5, label: String(code != null && code !== '' ? code : lvl5) };
        }).filter(Boolean);
      });
    } catch (e) {}
    rows.forEach(function (r) { if (!r.price_unit && r.unit) r.price_unit = r.unit; });

    /* Current-stock join: valley_current_products.product_id → products.id.
     * Ported from the legacy stock report: zero-qty skip, chart-range
     * exclusions (111100-114100 / 115100-211100), 90-day aging, oldest-first
     * batches. Batches are returned keyed by product id for the detail modal. */
    var batchesByProduct = {};
    try {
      var nowMs = Date.now();
      var NINETY = 90 * 24 * 60 * 60 * 1000;
      getAllRecords_(dbId, 'valley_current_products').forEach(function (row) {
        var qty = Number(row.current_qty) || 0;
        if (qty <= 0) return;
        var chartCode = Number(row.transaction_chart_code);
        if (row.transaction_chart_code && !isNaN(chartCode)) {
          if ((chartCode >= 111100 && chartCode <= 114100) || (chartCode >= 115100 && chartCode <= 211100)) return;
        }
        var pid = String(row.product_id || '').trim();
        if (!pid) return;
        var cost = Number(row.unit_cost) || 0;
        var value = qty * cost;
        var dateDisplay = '-';
        var iso = '';
        if (row.transaction_date) {
          var dd = new Date(row.transaction_date);
          if (!isNaN(dd.getTime())) {
            iso = dd.toISOString();
            dateDisplay = pad2_(dd.getDate()) + '/' + pad2_(dd.getMonth() + 1) + '/' + dd.getFullYear();
          }
        }
        if (!batchesByProduct[pid]) batchesByProduct[pid] = [];
        batchesByProduct[pid].push({
          lot: String(row.transaction_code || '-'),
          date_display: dateDisplay,
          date_iso: iso,
          chart_name: String(row.transaction_chart_name || '-'),
          qty: qty,
          cost: cost,
          value: value,
          aged: !!iso && (nowMs - new Date(iso).getTime()) > NINETY
        });
      });
      Object.keys(batchesByProduct).forEach(function (k) {
        batchesByProduct[k].sort(function (a, b) {
          if (!a.date_iso && !b.date_iso) return 0;
          if (!a.date_iso) return 1;
          if (!b.date_iso) return -1;
          return a.date_iso.localeCompare(b.date_iso);
        });
      });
    } catch (e) { /* stock join is best-effort; list still loads */ }

    /* Aggregate stock totals onto each product row. */
    var partyOpts = finRefsCached_(dbId, 'parties', function () {
      return getAllRecords_(dbId, FIN_PARTIES_SHEET).map(function (r) {
        return { value: r.id, label: String(r.name || r.id) };
      }).filter(function (o) { return String(o.value).trim() !== ''; });
    });
    var partyNameMap = {};
    partyOpts.forEach(function (o) { partyNameMap[String(o.value)] = o.label; });

    rows.forEach(function (r) {
      if (!r.price_unit && r.unit) r.price_unit = r.unit;
      var pid = String(r.id);
      var bl = batchesByProduct[pid] || [];
      var qtySum = 0, valSum = 0, agedN = 0;
      bl.forEach(function (b) { qtySum += b.qty; valSum += b.value; if (b.aged) agedN++; });
      r.current_stock_qty = qtySum;
      r.stock_value = valSum;
      r.batch_count = bl.length;
      r.aged_count = agedN;
    });

    /* Slim payload: only fields the page displays/edits. */
    rows = rows.map(function (r) {
      return {
        id: r.id,
        name_ar: r.name_ar,
        product_type: r.product_type,
        name_en: r.name_en || '',
        client_id: r.client_id != null ? r.client_id : '',
        client_name: partyNameMap[String(r.client_id)] || '',
        GPC: r.GPC,
        unit: r.unit,
        carton: r.carton,
        cost_allocation_percentage: r.cost_allocation_percentage,
        concentration: r.concentration || '',
        price_unit: r.price_unit || '',
        asset_code: r.asset_code != null ? r.asset_code : '',
        category: r.category != null ? r.category : '',
        sales_tax: r.sales_tax,
        quality_controlled: r.quality_controlled || '',
        current_stock_qty: r.current_stock_qty,
        stock_value: r.stock_value,
        batch_count: r.batch_count,
        aged_count: r.aged_count
      };
    });

    return {
      status: 'success',
      rows: rows,
      next_id: finNextId_(rows),
      enums: { product_type: FIN_PRODUCT_TYPES, unit: FIN_UNITS, quality_controlled: FIN_QUALITY },
      category_options: catOpts,
      account_options: accountOpts,
      party_options: partyOpts,
      batches_by_product: batchesByProduct
    };
  }

  function saveValleyProduct_(data, user, dbId) {
    finBustRefs_(dbId);
    vfBustRefs_(dbId, ['products_raw', 'products', 'products_options', 'recipes_products']);

    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = d.id !== '' && d.id !== null && d.id !== undefined;
    /* POLICY: add = page-write authority; EDIT existing = super admin only. */
    if (editing && !isSuperAdmin) throw new Error('تعديل المنتجات الموجودة من صلاحيات مدير النظام فقط');

    /* ALL entry fields are mandatory. */
    var nameAr = String(d.name_ar || '').trim();
    if (!nameAr) throw new Error('اسم المنتج مطلوب');
    var ptype = String(d.product_type || '').trim();
    if (FIN_PRODUCT_TYPES.indexOf(ptype) === -1) throw new Error('نوع المنتج مطلوب');
    var nameEn = String(d.name_en || '').trim();
    if (!nameEn) throw new Error('الاسم الإنجليزي مطلوب');
    if (d.client_id === '' || d.client_id === null || d.client_id === undefined) throw new Error('العميل / المورد مطلوب');
    var gpc = Number(d.GPC);
    if (d.GPC === '' || d.GPC == null || isNaN(gpc) || gpc < 0) throw new Error('GPC مطلوب ويجب أن يكون رقماً');
    var unit = String(d.unit || '').trim();
    if (FIN_UNITS.indexOf(unit) === -1) throw new Error('الوحدة مطلوبة');
    var carton = Number(d.carton);
    if (d.carton === '' || d.carton == null || isNaN(carton) || carton < 0) throw new Error('الكرتونة او التغليف مطلوبة ويجب أن تكون رقماً');
    var alloc = Number(d.cost_allocation_percentage);
    if (d.cost_allocation_percentage === '' || d.cost_allocation_percentage == null || isNaN(alloc) || alloc < 0 || alloc > 100) throw new Error('نسبة تخصيص التكلفة مطلوبة (0 - 100)');
    var concentration = String(d.concentration || '').trim();
    if (!concentration) throw new Error('التركيز مطلوب');
    var assetCode = String(d.asset_code || '').trim();
    if (!assetCode) throw new Error('كود الأصل مطلوب');
    var category = String(d.category || '').trim();
    if (!category) throw new Error('التصنيف مطلوب');
    var tax = Number(d.sales_tax);
    if (d.sales_tax === '' || d.sales_tax == null || isNaN(tax) || FIN_SALES_TAX_VALUES.indexOf(tax) === -1) {
      throw new Error('نسبة ضريبة المبيعات يجب أن تكون إحدى: 0، 0.05، 0.10، 0.14');
    }
    var quality = String(d.quality_controlled || '').trim();
    if (FIN_QUALITY.indexOf(quality) === -1) throw new Error('رقابة الجودة مطلوبة');

    settingsEnsureSheet_(dbId, FIN_PRODUCTS_SHEET, FIN_PRODUCTS_HEADERS);
    var sheet = getSheet_(FIN_PRODUCTS_SHEET, dbId);
    var rows = getAllRecords_(dbId, FIN_PRODUCTS_SHEET);

    for (var i = 0; i < rows.length; i++) {
      var sameName = String(rows[i].name_ar || '').trim().toLowerCase() === nameAr.toLowerCase();
      var sameRow = editing && Number(rows[i].id) === Number(d.id);
      if (sameName && !sameRow) throw new Error('يوجد منتج بنفس الاسم بالفعل');
    }
    if (editing) {
      var found = rows.some(function (r) { return Number(r.id) === Number(d.id); });
      if (!found) throw new Error('المنتج غير موجود');
    }

    var partyExists = getAllRecords_(dbId, FIN_PARTIES_SHEET).some(function (r) {
      return String(r.id) === String(d.client_id);
    });
    if (!partyExists) throw new Error('العميل/المورد المحدد غير موجود في جدول العملاء والموردين');

    /* كود الأصل must exist inside the allowed chart range. */
    try {
      var assetOk = getAllRecords_(dbId, FIN_CHART_SHEET).some(function (r) {
        var lvl5 = Number(r['المستوى الخامس']);
        return lvl5 === Number(assetCode) && lvl5 >= 114100 && lvl5 <= 115100;
      });
      if (!assetOk) throw new Error('x');
    } catch (e) {
      throw new Error('كود الأصل غير موجود ضمن المستوى الخامس (114100 - 115100) في دليل الحسابات');
    }
    try {
      var catOk = getAllRecords_(dbId, FIN_CATEGORIES_SHEET).some(function (r) {
        return String(r.id) === String(category);
      });
      if (!catOk) throw new Error('x');
    } catch (e2) {
      throw new Error('التصنيف المحدد غير موجود في جدول التصنيفات');
    }

    var map = {
      name_ar: nameAr,
      product_type: ptype,
      name_en: nameEn,
      client_id: Number(d.client_id),
      GPC: gpc,
      unit: unit,
      carton: carton,
      cost_allocation_percentage: alloc,
      concentration: concentration,
      price_unit: unit,
      asset_code: Number(assetCode),
      income_code: '',
      category: category,
      sales_tax: tax,
      quality_controlled: quality,
      user: (user && user.email) || ''
    };

    if (editing) {
      var _oldProd = rows.find(function(r){ return Number(r.id)===Number(d.id); }) || null;
      if (!updateRowByCriteria_(sheet, 'id', Number(d.id), map)) throw new Error('تعذر تحديث المنتج');
      try{ var _newProd = Object.assign({}, _oldProd||{}, map); logHistory_(dbId, FIN_PRODUCTS_SHEET, _oldProd&&_oldProd.record_uid ? _oldProd.record_uid : ('update_'+FIN_PRODUCTS_SHEET+'_'+d.id), Number(d.id), (user&&user.email)||'', 'update', _newProd, _oldProd) }catch(e){}
      return { status: 'success', message: 'تم تحديث المنتج' };
    }
    map['unique_id'] = uid16_();
    map['created_at'] = new Date();
    var res = addRecord_(dbId, FIN_PRODUCTS_SHEET, map, ['name_ar']);
    try{ logHistory_(dbId, FIN_PRODUCTS_SHEET, map.record_uid || ('create_'+FIN_PRODUCTS_SHEET+'_'+res.data.assignedId), res.data.assignedId, (user&&user.email)||'', 'create', map, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة المنتج (رقم ' + res.data.assignedId + ')', id: res.data.assignedId };
  }

  /* ===== المشتريات: valley_purchasing_costing (header) + valley_product_purchasing (lines) =====
   * Relationship: costing.Code is the unique, non-repeatable key; product_purchasing.code
   * is the FK joining lines to their header (one costing -> many lines). */
  var PURCHASING_COSTING_SHEET = 'valley_purchasing_costing';
  var PURCHASING_LINE_SHEET = 'valley_product_purchasing';
  var PURCHASING_COSTING_HEADERS = ['id', 'Code', 'tax_system', 'Reciept Date', 'Items', 'Type', 'Shipping Type',
    'If shipping via CIF, enter the insurance value.', 'CIF insurance rate', 'Value', 'Currency', 'Exchange rate',
    'Value Based on Invoice', 'Importation Re-Price', 'Tax Declared Value', 'Administrative Expenses',
    'Customs Expenses', 'Unloading expenses', 'bank commission', 'Customs clearance and port receipts',
    'Additional fees', 'Clearance Expenses', 'Other Expenses', 'Purchase Tax', 'Income Tax',
    'Internal cost adjustment', 'Total costs', 'Sales Value', 'Tax type', 'sales tax amount',
    'Minimum differences', 'month', 'Year', 'Supplier Name', 'Approved this month', 'Associated bank',
    'user', 'approval_status', 'approval', 'approval_time', 'quality_approval_status', 'quality_approval',
    'quality_approval_time', 'Related valley_product_purchasings', 'code_identification', 'user_name'];
  var PURCHASING_LINE_HEADERS = ['unique_id', 'id', 'movement_code', 'lot_identification', 'code', 'movement_place',
    'vendor', 'product', 'product_category', 'receipt_date', 'qty', 'unit_price', 'other_cost', 'total_cost',
    'movement_type', 'sales_qty', 'sales_value', 'sales_value_amount', 'unit_cost', 'invoice_date',
    'registration_number', 'Analysis certificate, if available', 'Agricultural Release License', 'Release photo',
    'Registration image', 'Production date', 'Expiry date', 'user', 'currency', 'exchange_rate',
    'cost_currency', 'Related valley_product_technicals', 'purchase_unit_cost'];
  var PURCHASING_CURRENCIES = [
    { value: 'EGP', label: 'جنيه مصري', rate: 1 },
    { value: 'USD', label: 'دولار أمريكي', rate: '' },
    { value: 'EUR', label: 'يورو', rate: '' }
  ];
  var PURCHASING_MOVEMENT_TYPES = [
    { code: 'استلام', fifth: 'استلام' },
    { code: 'تصنيع', fifth: 'تصنيع' },
    { code: 'بيع', fifth: 'بيع' },
    { code: 'تحويل', fifth: 'تحويل' },
    { code: 'تالف', fifth: 'تالف' }
  ];
  var PURCHASING_NUMERIC = ['Value', 'Exchange rate', 'CIF insurance rate', 'Importation Re-Price', 'Tax Declared Value',
    'Administrative Expenses', 'Customs Expenses', 'Unloading expenses', 'bank commission',
    'Customs clearance and port receipts', 'Additional fees', 'Clearance Expenses', 'Other Expenses',
    'Internal cost adjustment', 'Purchase Tax', 'Income Tax', 'Minimum differences',
    'Value Based on Invoice', 'Total costs', 'Sales Value', 'sales tax amount'];

  function getValleyPurchasingCosting_(data, user, dbId) {
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    var supplierOpts = [];
    try {
      supplierOpts = getAllRecords_(dbId, FIN_PARTIES_SHEET).map(function (p) {
        return { value: p.id, label: String(p.name || p.id) };
      }).filter(function (o) { return String(o.value).trim() !== ''; });
    } catch (e) {}
    var productOpts = [];
    try {
      productOpts = getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
        return { value: p.id, label: String(p.name_ar || p.id) };
      }).filter(function (o) { return String(o.value).trim() !== ''; });
    } catch (e) {}
    return {
      status: 'success',
      headers: rows,
      options: {
        supplier_options: supplierOpts,
        product_options: productOpts,
        currency_options: PURCHASING_CURRENCIES,
        movement_type_options: PURCHASING_MOVEMENT_TYPES
      }
    };
  }

  function getValleyPurchasingLines_(data, user, dbId) {
    var code = String((data && data.code) || '').trim();
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var rows = getAllRecords_(dbId, PURCHASING_LINE_SHEET).filter(function (r) {
      return String(r.code) === code;
    });
    return { status: 'success', lines: rows };
  }

  function saveValleyPurchasingCosting_(data, user, dbId) {
    var d = data || {};
    var hdr = d.header || {};
    var lines = d.lines || [];
    var code = String(hdr.Code != null ? hdr.Code : '').trim();
    if (!code) throw new Error('الكود (Code) مطلوب');
    var originalCode = String(d.originalCode != null ? d.originalCode : '').trim();

    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var sheet = getSheet_(PURCHASING_COSTING_SHEET, dbId);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    var existingMatch = rows.filter(function (r) { return String(r.Code) === code; });
    var isEdit = originalCode !== '' && rows.some(function (r) { return String(r.Code) === originalCode; });

    if (!isEdit) {
      if (existingMatch.length) throw new Error('الكود (Code) مكرر — يجب أن يكون فريداً');
    } else if (code !== originalCode && existingMatch.length) {
      throw new Error('الكود (Code) مكرر — يُستخدم بالفعل لعملية أخرى');
    }

    var record = {};
    PURCHASING_COSTING_HEADERS.forEach(function (col) {
      if (['id', 'unique_id', 'user', 'user_name', 'approval_status', 'approval', 'approval_time',
        'quality_approval_status', 'quality_approval', 'quality_approval_time',
        'Related valley_product_purchasings', 'code_identification'].indexOf(col) !== -1) return;
      var v = hdr[col];
      record[col] = (v === undefined || v === null) ? '' : v;
    });
    PURCHASING_NUMERIC.forEach(function (c) {
      if (record[c] !== '' && record[c] !== undefined) record[c] = Number(record[c]);
    });

    var _oldPur = null;
    if (isEdit) {
      _oldPur = rows.find(function(r){ return String(r.Code)===String(originalCode); }) || null;
      updateRowByCriteria_(sheet, 'Code', originalCode, record);
      try{ var _newPur = Object.assign({}, _oldPur||{}, record); logHistory_(dbId, PURCHASING_COSTING_SHEET, _oldPur&&_oldPur.record_uid ? _oldPur.record_uid : ('update_'+PURCHASING_COSTING_SHEET+'_'+originalCode), originalCode, (user&&user.email)||'', 'update', _newPur, _oldPur) }catch(e){}
    } else {
      record.unique_id = uid16_();
      record.user = (user && user.email) || '';
      record.user_name = (user && user.name) || (user && user.email) || '';
      addRecord_(dbId, PURCHASING_COSTING_SHEET, record, ['Code']);
      try{ logHistory_(dbId, PURCHASING_COSTING_SHEET, record.record_uid || ('create_'+PURCHASING_COSTING_SHEET+'_'+code), code, (user&&user.email)||'', 'create', record, null) }catch(e){}
    }

    var shippingType = record['Shipping Type'] || '';
    var receiptDateStr = record['Reciept Date'] || '';
    var receiptDateObj = null;
    if (receiptDateStr) {
      var parts = String(receiptDateStr).split('-');
      if (parts.length === 3) receiptDateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      else { receiptDateObj = new Date(receiptDateStr); if (isNaN(receiptDateObj.getTime())) receiptDateObj = null; }
    }
    var expiryDateStr = '';
    if (receiptDateObj) {
      var exp = new Date(receiptDateObj.getTime());
      exp.setDate(exp.getDate() + 720);
      expiryDateStr = Utilities.formatDate(exp, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }

    var lineSheet = getSheet_(PURCHASING_LINE_SHEET, dbId);
    var lineKey = (isEdit && code !== originalCode) ? originalCode : code;
    deleteRowsByCriteria_(lineSheet, 'code', lineKey);
    var linesTotal = 0;
    (lines || []).forEach(function (l) {
      var qty = Number(l.qty) || 0;
      var unitPrice = Number(l.unit_price) || 0;
      var totalCost = Number(l.total_cost) || 0;
      linesTotal += totalCost;
      var movementPlace = '';
      if (shippingType === 'CIF' || shippingType === 'FOB' || shippingType === 'C&F') movementPlace = 'مستورد';
      else if (shippingType === 'محلي') movementPlace = 'محلي';
      var prodDate = l['Production date'] || receiptDateStr;
      var expDate = l['Expiry date'] || expiryDateStr;
      var lm = {
        unique_id: uid16_(),
        code: code,
        product: l.product || '',
        product_category: l.product_category || '',
        vendor: l.vendor || '',
        lot_identification: l.lot_identification || '',
        qty: qty,
        unit_price: unitPrice,
        other_cost: Number(l.other_cost) || 0,
        total_cost: totalCost,
        sales_qty: Number(l.sales_qty) || 0,
        sales_value: Number(l.sales_value) || 0,
        sales_value_amount: Number(l.sales_value_amount) || 0,
        unit_cost: Number(l.unit_cost) || 0,
        movement_type: l.movement_type || '',
        movement_place: movementPlace,
        receipt_date: l.receipt_date || receiptDateStr,
        invoice_date: l.invoice_date || receiptDateStr,
        'Production date': prodDate,
        'Expiry date': expDate,
        currency: l.currency || record['Currency'] || '',
        exchange_rate: Number(l.exchange_rate) || Number(record['Exchange rate']) || 0,
        cost_currency: unitPrice * qty,
        user: (user && user.email) || ''
      };
      addRecord_(dbId, PURCHASING_LINE_SHEET, lm, []);
    });

    var headerTotal = Number(record['Total costs']) || 0;
    if (lines.length > 0 && Math.abs(linesTotal - headerTotal) > 0.01) {
      throw new Error('مجموع تكاليف الأصناف (' + linesTotal.toFixed(2) + ') لا يساوي إجمالي التكاليف (' + headerTotal.toFixed(2) + ')');
    }

    return { status: 'success', message: isEdit ? 'تم تحديث عملية الشراء' : 'تمت إضافة عملية الشراء', code: code };
  }

  function deleteValleyPurchasingCosting_(data, user, dbId) {
    var code = String((data && data.code) || '').trim();
    if (!code) throw new Error('الكود (Code) مطلوب');
    if (!(user && user.isSuperAdmin)) throw new Error('حذف عمليات الشراء من صلاحيات مدير النظام فقط');
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var _oldDelPur = getAllRecords_(dbId, PURCHASING_COSTING_SHEET).find(function(r){ return String(r.Code)===String(code); }) || null;
    var _oldDelUid = _oldDelPur ? (_oldDelPur.record_uid || ('del_'+PURCHASING_COSTING_SHEET+'_'+code)) : ('del_'+PURCHASING_COSTING_SHEET+'_'+code);
    try{ logHistory_(dbId, PURCHASING_COSTING_SHEET, _oldDelUid, code, (user&&user.email)||'', 'delete', null, _oldDelPur) }catch(e){}
    deleteRowsByCriteria_(getSheet_(PURCHASING_COSTING_SHEET, dbId), 'Code', code);
    deleteRowsByCriteria_(getSheet_(PURCHASING_LINE_SHEET, dbId), 'code', code);
    return { status: 'success', message: 'تم حذف عملية الشراء' };
  }

  function approveValleyPurchasingCosting_(data, user, dbId) {
    var code = String((data && data.code) || '').trim();
    if (!code) throw new Error('الكود (Code) مطلوب');
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    var sheet = getSheet_(PURCHASING_COSTING_SHEET, dbId);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    if (!rows.some(function (r) { return String(r.Code) === code; })) throw new Error('عملية الشراء غير موجودة');
    var _oldAppPur = rows.find(function(r){ return String(r.Code)===String(code); }) || null;
    updateRowByCriteria_(sheet, 'Code', code, {
      approval_status: 'Approved',
      approval: (user && user.email) || '',
      approval_time: new Date()
    });
    try{ var _newAppPur = { approval_status: 'Approved', approval: (user&&user.email)||'', approval_time: new Date() }; logHistory_(dbId, PURCHASING_COSTING_SHEET, _oldAppPur&&_oldAppPur.record_uid ? _oldAppPur.record_uid : ('approve_'+PURCHASING_COSTING_SHEET+'_'+code), code, (user&&user.email)||'', 'approve', _newAppPur, _oldAppPur) }catch(e){}
    return { status: 'success', message: 'تم اعتماد عملية الشراء' };
  }

  function qualityApproveValleyPurchasingCosting_(data, user, dbId) {
    var code = String((data && data.code) || '').trim();
    if (!code) throw new Error('الكود (Code) مطلوب');
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    var sheet = getSheet_(PURCHASING_COSTING_SHEET, dbId);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    if (!rows.some(function (r) { return String(r.Code) === code; })) throw new Error('عملية الشراء غير موجودة');
    var _oldQAppPur = rows.find(function(r){ return String(r.Code)===String(code); }) || null;
    updateRowByCriteria_(sheet, 'Code', code, {
      quality_approval_status: 'Approved',
      quality_approval: (user && user.email) || '',
      quality_approval_time: new Date()
    });
    try{ var _newQAppPur = { quality_approval_status: 'Approved', quality_approval: (user&&user.email)||'', quality_approval_time: new Date() }; logHistory_(dbId, PURCHASING_COSTING_SHEET, _oldQAppPur&&_oldQAppPur.record_uid ? _oldQAppPur.record_uid : ('approve_'+PURCHASING_COSTING_SHEET+'_'+code), code, (user&&user.email)||'', 'approve', _newQAppPur, _oldQAppPur) }catch(e){}
    return { status: 'success', message: 'تم اعتماد الجودة' };
  }

  ValleyFoods.register('get_valley_purchasing_costing', getValleyPurchasingCosting_);
  ValleyFoods.register('get_valley_purchasing_lines', getValleyPurchasingLines_);
  ValleyFoods.register('save_valley_purchasing_costing', saveValleyPurchasingCosting_);
  ValleyFoods.register('delete_valley_purchasing_costing', deleteValleyPurchasingCosting_);
  ValleyFoods.register('approve_valley_purchasing_costing', approveValleyPurchasingCosting_);
  ValleyFoods.register('quality_approve_valley_purchasing_costing', qualityApproveValleyPurchasingCosting_);

  function getValleyParties_(data, user, dbId) {
    settingsEnsureSheet_(dbId, FIN_PARTIES_SHEET, FIN_PARTIES_HEADERS);
    var rows = getAllRecords_(dbId, FIN_PARTIES_SHEET).map(function (r) {
      return {
        id: r.id,
        name: r.name,
        customer_direction: r.customer_direction,
        type: r.type || '',
        registration_number: r.registration_number != null ? r.registration_number : '',
        tax_id: r.tax_id != null ? r.tax_id : '',
        name_en: r.name_en || '',
        country: r.country || '',
        region: r.region || '',
        telephone: r.telephone || '',
        address: r.address || '',
        'المستوى الاساسي': r['المستوى الاساسي'] || ((r.name || '') + (r.name_en ? ' - ' + r.name_en : ''))
      };
    });
    return {
      status: 'success',
      rows: rows,
      next_id: finNextId_(rows),
      enums: { customer_direction: FIN_DIRECTIONS, type: FIN_PARTY_TYPES }
    };
  }

  function saveValleyParty_(data, user, dbId) {
    finBustRefs_(dbId);
    vfBustRefs_(dbId, ['parties_raw', 'parties']);

    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = d.id !== '' && d.id !== null && d.id !== undefined;
    /* POLICY: add = page-write authority; EDIT existing = super admin only. */
    if (editing && !isSuperAdmin) throw new Error('تعديل العملاء والموردين الموجودين من صلاحيات مدير النظام فقط');

    /* ALL entry fields are mandatory. */
    var name = String(d.name || '').trim();
    if (!name) throw new Error('الاسم مطلوب');
    var direction = String(d.customer_direction || '').trim();
    if (FIN_DIRECTIONS.indexOf(direction) === -1) throw new Error('الاتجاه مطلوب (عميل أو مورد)');
    var ptype = String(d.type || '').trim();
    if (FIN_PARTY_TYPES.indexOf(ptype) === -1) throw new Error('نوع التعامل مطلوب');
    var regNo = Number(d.registration_number);
    if (d.registration_number === '' || d.registration_number == null || isNaN(regNo) || regNo < 0) throw new Error('رقم السجل التجاري مطلوب ويجب أن يكون رقماً');
    var taxId = Number(d.tax_id);
    if (d.tax_id === '' || d.tax_id == null || isNaN(taxId) || taxId < 0) throw new Error('الرقم الضريبي مطلوب ويجب أن يكون رقماً');
    var nameEn = String(d.name_en || '').trim();
    if (!nameEn) throw new Error('الاسم الإنجليزي مطلوب');
    var country = String(d.country || '').trim();
    if (!country) throw new Error('الدولة مطلوبة');
    var region = String(d.region || '').trim();
    if (!region) throw new Error('المنطقة مطلوبة');
    var phone = String(d.telephone || '').trim();
    if (!phone) throw new Error('التليفون مطلوب');
    var address = String(d.address || '').trim();
    if (!address) throw new Error('العنوان مطلوب');

    settingsEnsureSheet_(dbId, FIN_PARTIES_SHEET, FIN_PARTIES_HEADERS);
    var sheet = getSheet_(FIN_PARTIES_SHEET, dbId);
    var rows = getAllRecords_(dbId, FIN_PARTIES_SHEET);

    for (var i = 0; i < rows.length; i++) {
      var sameName = String(rows[i].name || '').trim().toLowerCase() === name.toLowerCase();
      var sameRow = editing && Number(rows[i].id) === Number(d.id);
      if (sameName && !sameRow) throw new Error('يوجد عميل/مورد بنفس الاسم بالفعل');
    }
    if (editing) {
      var found = rows.some(function (r) { return Number(r.id) === Number(d.id); });
      if (!found) throw new Error('السجل غير موجود');
    }

    var levelDisplay = name + (nameEn ? ' - ' + nameEn : '');
    var map = {
      name: name,
      customer_direction: direction,
      type: ptype,
      registration_number: regNo,
      tax_id: taxId,
      name_en: nameEn,
      country: country,
      region: region,
      telephone: phone,
      address: address,
      'المستوى الاساسي': levelDisplay,
      user: (user && user.email) || ''
    };

    if (editing) {
      var _oldParty = rows.find(function(r){ return Number(r.id)===Number(d.id); }) || null;
      if (!updateRowByCriteria_(sheet, 'id', Number(d.id), map)) throw new Error('تعذر تحديث السجل');
      try{ var _newParty = Object.assign({}, _oldParty||{}, map); logHistory_(dbId, FIN_PARTIES_SHEET, _oldParty&&_oldParty.record_uid ? _oldParty.record_uid : ('update_'+FIN_PARTIES_SHEET+'_'+d.id), Number(d.id), (user&&user.email)||'', 'update', _newParty, _oldParty) }catch(e){}
      return { status: 'success', message: 'تم تحديث السجل' };
    }
    map['created_at'] = new Date();
    var res = addRecord_(dbId, FIN_PARTIES_SHEET, map, ['name']);
    try{ logHistory_(dbId, FIN_PARTIES_SHEET, map.record_uid || ('create_'+FIN_PARTIES_SHEET+'_'+res.data.assignedId), res.data.assignedId, (user&&user.email)||'', 'create', map, null) }catch(e){}
    return { status: 'success', message: 'تمت إضافة السجل (رقم ' + res.data.assignedId + ')', id: res.data.assignedId };
  }

  /* ---------- PARTY STATEMENT (كشف حساب) ----------
   * Withdrawal chain ported from the legacy Client Statement Engine:
   * sales invoices (debit) / purchases, cash collections & returns (credit),
   * invoice line-item disclosure, latest selling prices, and stock valuation
   * rows for the party's own products present in valley_current_products. */
  function dateParts_(v) {
    if (!v) return { display: '-', iso: '' };
    var d = new Date(v);
    if (isNaN(d.getTime())) return { display: String(v), iso: '' };
    return {
      display: pad2_(d.getDate()) + '/' + pad2_(d.getMonth() + 1) + '/' + d.getFullYear(),
      iso: d.toISOString()
    };
  }

  function safeRows_(dbId, sheetName) {
    try { return getAllRecords_(dbId, sheetName); } catch (e) { return []; }
  }

  function getValleyPartyStatement_(data, user, dbId) {
    var clientId = String((data && data.id) || '').trim();
    if (!clientId) throw new Error('معرّف العميل/المورد مطلوب');

    function finFmt(n) { return Number(n) || 0; }

    /* Party info */
    var party = { id: clientId, name: clientId, phone: '', tax_id: '', address: '' };
    safeRows_(dbId, FIN_PARTIES_SHEET).forEach(function (r) {
      if (String(r.id).trim() === clientId) {
        party.name = String(r.name || clientId);
        party.phone = String(r.telephone || '');
        party.tax_id = String(r.tax_id != null ? r.tax_id : '');
        party.address = String(r.address || '');
      }
    });

    /* Product maps */
    var productName = {}, partyProductIds = {};
    safeRows_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
      productName[String(p.id)] = String(p.name_ar || '');
      if (String(p.client_id || '').trim() === clientId) partyProductIds[String(p.id)] = true;
    });

    /* Sales products: latest price map + line items by header id + uid→pid */
    var latestPrice = {};
    var linesByInvoice = {};
    var spUidToPid = {};
    safeRows_(dbId, 'valley_sales_products').forEach(function (sp) {
      var pid = String(sp.product_id || '').trim();
      var price = Number(sp.product_price || 0);
      var dt = sp.created_at ? new Date(sp.created_at) : null;
      if (pid && (!latestPrice[pid] || (dt && (!latestPrice[pid].date || dt > latestPrice[pid].date)))) {
        latestPrice[pid] = { price: price, date: dt };
      }
      var invId = String(sp.valley_sales_header_id || '').trim();
      if (invId) {
        if (!linesByInvoice[invId]) linesByInvoice[invId] = [];
        linesByInvoice[invId].push({
          doc_id: sp.id != null ? sp.id : 'N/A',
          name: productName[pid] || 'منتج غير معروف',
          details: String(sp.product_details || ''),
          qty: Number(sp.product_qty || 0),
          price: price
        });
      }
      var uid = String(sp.unique_id || '').trim();
      if (uid && pid) spUidToPid[uid] = pid;
    });

    var transactions = [];

    /* [أ] Sales invoices — debit */
    safeRows_(dbId, 'valley_sales_invoices').forEach(function (s) {
      if (String(s['اسم العميل'] || '').trim() !== clientId) return;
      var dp = dateParts_(s['تاريخ الفاتورة']);
      var invUid = String(s.invoice_unique_id || '').trim();
      transactions.push({
        type: 'sales',
        date_display: dp.display,
        date_iso: dp.iso,
        sort_key: (dp.iso ? new Date(dp.iso).getTime() : 0),
        doc_id: String(s['رقم الفاتورة'] || invUid || 'N/A'),
        desc_ar: 'فاتورة مبيعات صادرة للعميل',
        value: finFmt(s['إجمالي']),
        sub_rows: linesByInvoice[invUid] || []
      });
    });

    /* [ب] Purchases — credit */
    safeRows_(dbId, 'valley_product_purchasing').forEach(function (p) {
      if (String(p.vendor || '').trim() !== clientId) return;
      var dp = dateParts_(p.receipt_date);
      var qty = Number(p.qty || 0);
      var price = Number(p.unit_price || 0);
      var prodRef = String(p.product || '').trim();
      transactions.push({
        type: 'purchases',
        date_display: dp.display,
        date_iso: dp.iso,
        sort_key: (dp.iso ? new Date(dp.iso).getTime() : 0) + 1,
        doc_id: String(p.id || 'N/A'),
        desc_ar: 'مشتريات خامات وتوريدات مستلمة منه',
        value: qty * price,
        sub_rows: [{ doc_id: String(p.id || 'N/A'), name: productName[prodRef] || 'خامات مستلمة', details: '', qty: qty, price: price }]
      });
    });

    /* [ج] Cash/bank movements — collections (credit) or payments (debit) */
    safeRows_(dbId, 'valley_cash_bank_movement').forEach(function (cb) {
      if (String(cb.name || '').trim() !== clientId) return;
      var dp = dateParts_(cb.transaction_date);
      var total = Math.abs(Number(cb.total || 0));
      var isDebit = String(cb.transaction_type || '').trim().toLowerCase() === 'debit';
      transactions.push({
        type: isDebit ? 'collections' : 'payments',
        date_display: dp.display,
        date_iso: dp.iso,
        sort_key: (dp.iso ? new Date(dp.iso).getTime() : 0) + 2,
        doc_id: String(cb.transaction_id || 'N/A'),
        desc_ar: (isDebit ? 'إيصال تحصيل نقدي (مقبوضات منه)' : 'إيصال صرف نقدي (مدفوعات له)') +
                 (cb.transaction_details ? ' - ' + cb.transaction_details : ''),
        value: total,
        sub_rows: []
      });
    });

    /* [د] Sales returns — credit */
    safeRows_(dbId, 'valley_sales_returns').forEach(function (r) {
      if (String(r.valley_sales_invoices_client || '').trim() !== clientId) return;
      var dp = dateParts_(r.valley_return_date || r.created_at);
      var retQty = Number(r.valley_return_qty || 0);
      var retValue = Math.abs(Number(r.valley_return_value || 0));
      var prodName = productName[spUidToPid[String(r.valley_sales_products_id || '').trim()] || ''] || 'صنف مرتجع';
      transactions.push({
        type: 'returns',
        date_display: dp.display,
        date_iso: dp.iso,
        sort_key: (dp.iso ? new Date(dp.iso).getTime() : 0) + 3,
        doc_id: String(r.id || 'N/A'),
        desc_ar: 'مرتجع مبيعات مستلم منه (يقلل المديونية)',
        value: retValue,
        sub_rows: [{ doc_id: String(r.id || 'N/A'), name: '↩ ' + prodName, details: '', qty: retQty, price: retValue }]
      });
    });

    transactions.sort(function (a, b) { return a.sort_key - b.sort_key; });

    /* Stock valuation rows for the party's own products */
    var stockRows = [];
    try {
      getAllRecords_(dbId, 'valley_current_products').forEach(function (cs) {
        var pid = String(cs.product_id || '').trim();
        var qty = Number(cs.current_qty || 0);
        if (!partyProductIds[pid] || qty <= 0) return;
        stockRows.push({
          name: productName[pid] || pid,
          qty: qty,
          latest_price: latestPrice[pid] ? latestPrice[pid].price : 0
        });
      });
    } catch (e) {}

    return { status: 'success', party: party, transactions: transactions, stock_rows: stockRows };
  }

  /* ---------- MANUFACTURE — PRODUCTION ORDERS ----------
   * valley_manufacture_header + header_products (outputs) +
   * valley_manufacture_footer (raw-material batch consumption).
   * Availability rule mirrors sales: current_qty − Σ consumption.
   * valley_current_products is auto-maintained and never written. */
  const MFG_ORDER_SHEET = 'valley_manufacture_header';
  const MFG_ORDER_PRODUCTS_SHEET = 'valley_manufacture_header_products';
  const MFG_CONSUMPTION_SHEET = 'valley_manufacture_footer';

  const MFG_ORDER_HEADERS = ['unique_id','id','transaction_code','transaction_type','code','operation_type','shift','by_product_nrv_value','total_inventory_cost','total_other_cost','total_batch_cost','manufacture_date','produced_product','product_category','manufactured_qty','expected_qty','actual_qty','manufacture_internal_batch','manufacture_batch','user','created_at','mo_status','abnormal_amount','production_approval','production_approval_time','quality_approval','quality_approval_time','recipe_id'];
  const MFG_OUTPUT_HEADERS = ['unique_id','id','valley_manufacture_header_id','product_id','product_name','product_qty','cost_unit','total_cost','user','created_at'];
  const MFG_CONSUMPTION_HEADERS = ['unique_id','id','valley_manufacture_header_product_id','item','item_code','qty','cost_unit','total_cost','created_at','user'];

  const MFG_OP_TYPES = ['تصنيع وتعبئة', 'تصنيع (كميات)', 'اعادة تعبئة'];
  const MFG_SHIFTS = ['وردية 1', 'وردية 2', 'وردية متصلة'];
  const MFG_STATUSES = ['Draft', 'In Progress', 'Locked'];

  function mfgProductCategory_(dbId, productId) {
    var catId = '';
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).some(function (p) {
        if (String(p.id) === String(productId)) { catId = String(p.category || ''); return true; }
        return false;
      });
    } catch (e) {}
    return catId;
  }

  function getValleyOptionSets_(dbId) {
    var recipes = [];
    try { recipes = getAllRecords_(dbId, MFG_RECIPE_SHEET); } catch (e) {}
    var recipeOptions = recipes.map(function (r) {
      var active = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false');
      return { value: String(r.unique_id), label: String(r.recipe_code || r.id) + ' — ' + String(r.recipe_name || ''), active: active };
    }).filter(function (o) { return o.value; });
    return {
      recipe_options: recipeOptions,
      product_options: finRefsCached_(dbId, 'products', function () {
        return getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
          return { value: p.id, label: String(p.name_ar || ('#' + p.id)) };
        }).filter(function (o) { return String(o.value).trim() !== ''; })
          .sort(function (a, b) { return a.label.localeCompare(b.label, 'ar'); });
      }),
      work_center_options: mfgWorkCenterOptions_(dbId),
      enums: { operation_type: MFG_OP_TYPES, shift: MFG_SHIFTS }
    };
  }

  function getValleyMfgOrderDetail_(data, user, dbId) {
    settingsEnsureSheet_(dbId, MFG_ORDER_SHEET, MFG_ORDER_HEADERS);
    settingsEnsureSheet_(dbId, MFG_ORDER_PRODUCTS_SHEET, MFG_OUTPUT_HEADERS);
    settingsEnsureSheet_(dbId, MFG_CONSUMPTION_SHEET, MFG_CONSUMPTION_HEADERS);
    var opts = getValleyOptionSets_(dbId);
    var moUid = String((data && data.mo_uid) || '').trim();
    if (!moUid) {
      return { status: 'success', is_new: true, recipe_options: opts.recipe_options, product_options: opts.product_options, work_center_options: opts.work_center_options, enums: opts.enums };
    }
    var full = getValleyMfgOrderFull_(data, user, dbId);
    var ops = getValleyMfgWorkOps_({ mo_uid: moUid }, user, dbId);
    var bps = getValleyMfgByproducts_({ mo_uid: moUid }, user, dbId);
    var outputs = (full.outputs || []).map(function (o) {
      var batches = [];
      try { var br = getValleyProductBatches_({ product_id: o.product_id }, user, dbId); batches = br.batches || []; } catch (e) {}
      return Object.assign({}, o, { batches: batches });
    });
    return {
      status: 'success', is_new: false,
      recipe_options: opts.recipe_options, product_options: opts.product_options, work_center_options: opts.work_center_options, enums: opts.enums,
      order: full.order, outputs: outputs, workops: ops.workops || [], byproducts: bps.byproducts || []
    };
  }

  function getValleyProductBatchesMulti_(data, user, dbId) {
    var ids = Array.isArray(data && data.product_ids) ? data.product_ids : [];
    var map = {};
    ids.forEach(function (pid) {
      var batches = [];
      try { var r = getValleyProductBatches_({ product_id: pid }, user, dbId); batches = r.batches || []; } catch (e) {}
      map[String(pid)] = batches;
    });
    return { status: 'success', batches_by_product: map };
  }

  function getValleyMfgOrders_(data, user, dbId) {
    settingsEnsureSheet_(dbId, MFG_ORDER_SHEET, MFG_ORDER_HEADERS);
    var rows = getAllRecords_(dbId, MFG_ORDER_SHEET).map(function (r) {
      return {
        unique_id: r.unique_id,
        id: r.id,
        transaction_code: r.transaction_code || '',
        operation_type: r.operation_type || '',
        shift: r.shift || '',
        manufacture_date: r.manufacture_date,
        produced_product: r.produced_product,
        manufactured_qty: r.manufactured_qty,
        expected_qty: r.expected_qty,
        actual_qty: r.actual_qty,
        mo_status: r.mo_status || 'Draft',
        production_approval: r.production_approval || '',
        quality_approval: r.quality_approval || '',
        recipe_id: r.recipe_id || ''
      };
    }).sort(function (a, b) { return Number(b.id || 0) - Number(a.id || 0); });

    var recipes = [];
    try { recipes = getAllRecords_(dbId, MFG_RECIPE_SHEET); } catch (e) {}
    var recipeOptions = recipes.map(function (r) {
      var active = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false');
      return { value: String(r.unique_id), label: String(r.recipe_code || r.id) + ' — ' + String(r.recipe_name || ''), active: active };
    }).filter(function (o) { return o.value; });

    var mfgPage = vfPage_(rows, data, 'manufacture_date');
    return {
      status: 'success',
      orders: mfgPage.rows,
      total: mfgPage.total,
      recipe_options: recipeOptions,
      product_options: finRefsCached_(dbId, 'products', function () {
        return getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
          return { value: p.id, label: String(p.name_ar || ('#' + p.id)) };
        }).filter(function (o) { return String(o.value).trim() !== ''; })
          .sort(function (a, b) { return a.label.localeCompare(b.label, 'ar'); });
      }),
      work_center_options: mfgWorkCenterOptions_(dbId),
      enums: { operation_type: MFG_OP_TYPES, shift: MFG_SHIFTS }
    };
  }

  function getValleyRecipeConsumption_(data, user, dbId) {
    var recipeUid = String((data && data.recipe_uid) || '').trim();
    var qty = Number((data && data.qty) || 0);
    if (!recipeUid) throw new Error('اختر الوصفة');
    if (!isFinite(qty) || qty <= 0) throw new Error('الكمية المصنعة مطلوبة');

    var recipeRows = safeRecipeRows_(dbId);
    var recipe = null;
    recipeRows.some(function (r) { if (String(r.unique_id) === recipeUid) { recipe = r; return true; } return false; });
    if (!recipe) throw new Error('الوصفة غير موجودة');

    var yieldQty = Number(recipe.yield_qty) || 0;
    if (yieldQty <= 0) throw new Error('وصفة غير صالحة (كمية الإنتاج = 0)');
    var ratio = qty / yieldQty;

    var materials = [];
    getAllRecords_(dbId, MFG_RECIPE_FOOTER_SHEET).forEach(function (s) {
      if (String(s.valley_product_recipe_id || '').trim() !== recipeUid) return;
      if (s.is_active === false || String(s.is_active).toLowerCase() === 'false') return;
      var lossPct = Number(s.loss_percentage || 0) / 100;
      materials.push({
        raw_material_id: String(s.raw_material_id || ''),
        raw_material_name: String(s.raw_material_name || ''),
        required_qty: (Number(s.required_qty || 0) * ratio) * (1 + lossPct),
        work_center_name: String(s.work_center_name || '')
      });
    });

    return { status: 'success', ratio: ratio, materials: materials };
  }
  function safeRecipeRows_(dbId) {
    try { return getAllRecords_(dbId, MFG_RECIPE_SHEET); } catch (e) { return []; }
  }

    /* 16-char hex id matching the sheet formula
       LOWER(DEC2HEX(RANDBETWEEN(0,4294967295),8)) & LOWER(DEC2HEX(RANDBETWEEN(0,4294967295),8)) */
    function uid16Hex_() {
      var h = function () { return ('00000000' + Math.floor(Math.random() * 4294967296).toString(16)).slice(-8); };
      return (h() + h()).toLowerCase();
    }

    function saveValleyMfgOrder_(data, user, dbId) {

    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = !!(d.mo_uid && String(d.mo_uid).trim());
    /* POLICY: add = page-write authority; edit existing = any writer, UNLESS the MO is Locked
       (Locked MOs are immutable and require super-admin unlock — enforced below at save time). */

    /* ALL header fields are mandatory. */
    if (!d.manufacture_date) throw new Error('تاريخ التصنيع مطلوب');
    var moDate = parseDate_(d.manufacture_date);
    if (!moDate) throw new Error('تاريخ التصنيع غير صالح');
    var opType = String(d.operation_type || '').trim();
    if (MFG_OP_TYPES.indexOf(opType) === -1) throw new Error('نوع العملية مطلوب');
    var shift = String(d.shift || '').trim();
    if (MFG_SHIFTS.indexOf(shift) === -1) throw new Error('الوردية مطلوبة');
    var producedPid = String(d.produced_product_id || '').trim();
    if (!producedPid) throw new Error('المنتج المنتج مطلوب');
    var MFG_YIELD_FACTOR = 0.65;
    var manufacturedQty = Number(d.manufactured_qty);
    if (d.manufactured_qty === '' || d.manufactured_qty == null || isNaN(manufacturedQty) || manufacturedQty < 0) throw new Error('كمية الخام الداخلة مطلوبة');
    var expectedQty = Math.round(manufacturedQty * MFG_YIELD_FACTOR * 1000) / 1000;
    if (!isFinite(expectedQty) || expectedQty <= 0) throw new Error('كمية الخام الداخلة يجب أن تكون أكبر من صفر (الكمية المتوقعة = الخام × 0.65)');
    var recipeUid = String(d.recipe_id || '').trim();
    var outputs = Array.isArray(d.outputs) ? d.outputs.filter(function (o) { return o && String(o.product_id || '').trim(); }) : [];
    if (!outputs.length) throw new Error('أضف منتج ناتج واحد على الأقل');
      var consumption = Array.isArray(d.consumption) ? d.consumption.filter(function (cm) { return cm && String(cm.batch_uid || '').trim() && Number(cm.qty || 0) > 0; }) : [];
      var hasFooters = outputs.some(function (o) { return Array.isArray(o.footers) && o.footers.some(function (f) { return String(f.item || '').trim(); }); });
      if (!consumption.length && !hasFooters) throw new Error('خصص استهلاك الخامات من الدفعات أولاً');

    settingsEnsureSheet_(dbId, MFG_ORDER_SHEET, MFG_ORDER_HEADERS);
    settingsEnsureSheet_(dbId, MFG_ORDER_PRODUCTS_SHEET, MFG_OUTPUT_HEADERS);
    settingsEnsureSheet_(dbId, MFG_CONSUMPTION_SHEET, MFG_CONSUMPTION_HEADERS);

    executeWithLock_(function () {
      var sheetMo = getSheet_(MFG_ORDER_SHEET, dbId);
      var moHeaders = getHeaders_(sheetMo);
      var moDataAll = sheetMo.getDataRange().getValues();
      var uidIdx = moHeaders.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
      var idIdx = moHeaders.findIndex(function (h) { return String(h).trim() === 'id'; });

      var moUid; var moNumberId;
      var stIdxG = moHeaders.findIndex(function (h) { return String(h).trim() === 'mo_status'; });
      if (editing) {
        moUid = String(d.mo_uid).trim();
        moNumberId = null;
        for (var r0 = 1; r0 < moDataAll.length; r0++) {
          if (String(moDataAll[r0][uidIdx]).trim() === moUid) {
            moNumberId = Number(moDataAll[r0][idIdx]);
            /* M4: Locked orders are immutable — unlock first */
            if (stIdxG !== -1 && String(moDataAll[r0][stIdxG]).trim() === 'Locked' && !isSuperAdmin) {
              throw new Error('أمر التصنيع مقفل — قم بفتح القفل أولاً');
            }
            break;
          }
        }
        if (!moNumberId) throw new Error('أمر التصنيع غير موجود');
      } else {
        moUid = uid16Hex_();
        moNumberId = getNextIdUnderLock_(dbId, MFG_ORDER_SHEET, 'id'); /* M5 canonical */
      }

      var catId = mfgProductCategory_(dbId, producedPid);
      var map = {};
      map['unique_id'] = moUid;
      map['id'] = moNumberId;
      map['operation_type'] = opType;
      map['shift'] = shift;
      map['manufacture_date'] = moDate;
      map['produced_product'] = Number(producedPid) || producedPid;
      map['manufactured_qty'] = manufacturedQty;
      map['actual_qty'] = d.actual_qty !== '' && d.actual_qty != null ? Number(d.actual_qty) : 0;
      map['expected_qty'] = expectedQty;
      map['recipe_id'] = recipeUid;
      map['transaction_type'] = 'التصنيع الداخلي';
      map['manufacture_batch'] = d.manufacture_batch !== undefined ? d.manufacture_batch : '';
      map['mo_status'] = editing ? String(d.mo_status || 'Draft') : 'Draft';
      if (MFG_STATUSES.indexOf(map['mo_status']) === -1) map['mo_status'] = 'Draft';
      map['user'] = (user && user.email) || '';
      if (!editing) map['created_at'] = new Date();  /* preserved on edit via overlay below */

      var newRow = 0;
      var rowVals = moHeaders.map(function (h) {
        var k = String(h).trim();
        return map[k] !== undefined ? map[k] : '';
      });
      if (editing) {
        for (var rr = 1; rr < moDataAll.length; rr++) {
          if (String(moDataAll[rr][uidIdx]).trim() === moUid) {
            var oldObj = {};
            moHeaders.forEach(function (h, hi) { oldObj[String(h).trim()] = moDataAll[rr][hi]; });
            rowVals = moHeaders.map(function (h, hi) {
              var k = String(h).trim();
              return map[k] !== undefined ? map[k] : moDataAll[rr][hi];
            });
            sheetMo.getRange(rr + 1, 1, 1, rowVals.length).setValues([rowVals]);
            var newObj = Object.assign({}, oldObj, map);
            var oldUid = oldObj.record_uid || ('upd_' + MFG_ORDER_SHEET + '_' + moUid);
            logHistory_(dbId, MFG_ORDER_SHEET, oldUid, moUid, (user && user.email) || '', 'update', newObj, oldObj);
            newRow = rr + 1;
            break;
          }
        }
      } else {
        map['record_uid'] = 'rec_' + Utilities.getUuid();
        var moRes = saveRecordWithAudit_(dbId, MFG_ORDER_SHEET, null, map, 'create', (user && user.email) || '', null, null, null, 'unique_id');
        newRow = moRes.data.newRowNumber;
      }

      /* derived columns are SHEET FORMULAS (auto-adjust to the row) */
      var fx = newRow;
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'transaction_code', '=CONCATENATE(VLOOKUP(M' + fx + ',valley_products!$A:$B,2,0),"-",E' + fx + ',"-",M' + fx + ',"-",TEXT(L' + fx + ',"DD/MM/YYYY"))');
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'code', '=CONCATENATE("VM -", ROW()-1)');
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'by_product_nrv_value', '=SUMIFS(valley_manufacture_by_product!I:I, valley_manufacture_by_product!C:C, A' + fx + ')');
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'total_inventory_cost', '=SUMIFS(valley_manufacture_header_products!$H:$H, valley_manufacture_header_products!$C:$C, A' + fx + ')');
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'total_other_cost', '=SUMIFS(valley_manufacture_work_center!L:L, valley_manufacture_work_center!C:C, A' + fx + ')');
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'total_batch_cost', '=IF(J' + fx + '+I' + fx + '-H' + fx + '<0, VLOOKUP(M' + fx + ',valley_products!$A:$I,9,0)*(J' + fx + '+I' + fx + '), J' + fx + '+I' + fx + '-H' + fx + ')');
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'product_category', '=IFERROR(VLOOKUP(M' + fx + ', valley_products!$A:$N, 14, 0), "")');
      writeFormula_(dbId, MFG_ORDER_SHEET, fx, 'manufacture_internal_batch', '=CONCATENATE(TEXT(L' + fx + ',"YYMMDD"),B' + fx + ',M' + fx + ',E' + fx + ')');

      /* gather this MO's existing output UIDs BEFORE deleting outputs (needed to scope footer deletion) */
      var existingOutUids = [];
      try {
        getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (eo) {
          if (String(eo.valley_manufacture_header_id || '').trim() === moUid) existingOutUids.push(String(eo.unique_id).trim());
        });
      } catch (e) {}

      /* rewrite outputs */
      var sheetOut = getSheet_(MFG_ORDER_PRODUCTS_SHEET, dbId);
      deleteRowsByCriteria_(sheetOut, 'valley_manufacture_header_id', moUid);
      var outHeaders = getHeaders_(sheetOut);
      var prodNameMap = {};
      try {
        getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) { prodNameMap[String(p.id)] = String(p.name_ar || ''); });
      } catch (e5) {}
      var outputUidMap = {};
      var outStart = sheetOut.getLastRow() + 1;
      var outRows = outputs.map(function (o, oi) {
        var outUid = Utilities.getUuid();
        outputUidMap[oi] = outUid;
        var m6 = {};
        m6['unique_id'] = outUid;
        m6['valley_manufacture_header_id'] = moUid;
        m6['product_id'] = String(o.product_id).trim();
        m6['product_name'] = prodNameMap[String(o.product_id)] || '';
        m6['product_qty'] = Number(o.qty) || 0;
        m6['cost_unit'] = o.cost_unit != null ? o.cost_unit : '';
        m6['total_cost'] = o.total_cost != null ? o.total_cost : '';
        m6['user'] = (user && user.email) || '';
        m6['created_at'] = new Date();
        return outHeaders.map(function (h) {
          var k = String(h).trim();
          return m6[k] !== undefined ? m6[k] : '';
        });
      });
      if (outRows.length) {
        sheetOut.getRange(outStart, 1, outRows.length, outHeaders.length).setValues(outRows);
        for (var oi2 = 0; oi2 < outRows.length; oi2++) {
          var oRow = outStart + oi2;
          writeFormula_(dbId, MFG_ORDER_PRODUCTS_SHEET, oRow, 'cost_unit', '=SUMIFS(valley_manufacture_footer!G:G, valley_manufacture_footer!C:C, A' + oRow + ')');
          writeFormula_(dbId, MFG_ORDER_PRODUCTS_SHEET, oRow, 'total_cost', '=SUMIFS(valley_manufacture_footer!H:H, valley_manufacture_footer!C:C, A' + oRow + ')');
        }
      }

      /* rewrite raw-material batch consumption — per-product footers + legacy consumption */
      var sheetCons = getSheet_(MFG_CONSUMPTION_SHEET, dbId);
      /* footers are linked by the OUTPUT uid, not the MO uid — delete this MO's old output footers */
      existingOutUids.forEach(function (ou) { deleteRowsByCriteria_(sheetCons, 'valley_manufacture_header_product_id', ou); });
      var consHeaders = getHeaders_(sheetCons);
      var consRows = [];

      /* 1) Per-product footer rows (from outputs[].footers) */
      outputs.forEach(function (o, oi) {
        var outUid = outputUidMap[oi];
        var footers = Array.isArray(o.footers) ? o.footers : [];
        footers.forEach(function (f) {
          if (!f || !String(f.item || '').trim()) return;
          var m7 = {};
          m7['unique_id'] = Utilities.getUuid();
          m7['valley_manufacture_header_product_id'] = outUid || moUid;
          m7['item'] = String(f.item || '').trim();
          m7['item_code'] = String(f.item_code || '');
          m7['qty'] = Number(f.qty) || 0;
          m7['cost_unit'] = (f.unit_cost != null && String(f.unit_cost).trim() !== '') ? Number(f.unit_cost) : '';
          m7['created_at'] = new Date();
          m7['user'] = (user && user.email) || '';
          consRows.push(consHeaders.map(function (h) {
            var k = String(h).trim();
            return m7[k] !== undefined ? m7[k] : '';
          }));
        });
      });

      /* 2) Legacy recipe-driven consumption (shared) — linked to first output */
      if (!consRows.length && consumption.length) {
        var firstOutputUid = outputUidMap[0] || moUid;
        consRows = consumption.map(function (cm) {
          var m7 = {};
          m7['unique_id'] = Utilities.getUuid();
          m7['valley_manufacture_header_product_id'] = firstOutputUid;
          m7['item'] = String(cm.item_pid || '').trim();
          m7['item_code'] = String(cm.lot || '');
          m7['qty'] = Number(cm.qty) || 0;
          m7['created_at'] = new Date();
          m7['user'] = (user && user.email) || '';
          return consHeaders.map(function (h) {
            var k = String(h).trim();
            return m7[k] !== undefined ? m7[k] : '';
          });
        });
      }

      if (consRows.length) {
        var consStart2 = sheetCons.getLastRow() + 1;
        sheetCons.getRange(consStart2, 1, consRows.length, consHeaders.length).setValues(consRows);
        for (var ci = 0; ci < consRows.length; ci++) {
          var cRow = consStart2 + ci;
          writeFormula_(dbId, MFG_CONSUMPTION_SHEET, cRow, 'item_code', '=IFERROR(VLOOKUP(D' + cRow + ', valley_product_purchasing!A:C,3,0), IFERROR(VLOOKUP(D' + cRow + ', valley_manufacture_header!A:C,3,0), IFERROR(VLOOKUP(D' + cRow + ', valley_manufacture_by_product!A:F,6,0),"")))');
          writeFormula_(dbId, MFG_CONSUMPTION_SHEET, cRow, 'total_cost', '=G' + cRow + '*F' + cRow);
        }
      }

      /* ---- rewrite work-center rows (valley_manufacture_work_center, inline of header) ---- */
      var WC_SHEET = 'valley_manufacture_work_center';
      var WC_HEADERS = ['unique_id','id','valley_manufacture_header_id','work_center_sequence','recipe_id','operation_status','start_time','end_time','notes','actual_hours','work_center_cost','total_cost','last_pause_time','total_pause_duration','user','created_at'];
      settingsEnsureSheet_(dbId, WC_SHEET, WC_HEADERS);
      var sheetWC = getSheet_(WC_SHEET, dbId);
      var wcHeaders = getHeaders_(sheetWC);
      var existingWC = [];
      try { getAllRecords_(dbId, WC_SHEET).forEach(function (r) { if (String(r.valley_manufacture_header_id || '').trim() === moUid) existingWC.push(r); }); } catch (e) {}
      var existingWCByUid = {}; existingWC.forEach(function (r) { existingWCByUid[String(r.unique_id)] = r; });

      /* sequence per work_center from the recipe footer (valley_product_recipe_footer) */
      var wcSeqMap = {};
      try {
        getAllRecords_(dbId, MFG_RECIPE_FOOTER_SHEET).forEach(function (s) {
          if (String(s.valley_product_recipe_id || '').trim() === String(recipeUid).trim()) {
            wcSeqMap[String(s.work_center_id || '').trim()] = (s.sequence != null && s.sequence !== '' && !isNaN(Number(s.sequence))) ? Number(s.sequence) : '';
          }
        });
      } catch (e) {}

      var keepWcUids = [];
      (Array.isArray(d.work_ops) ? d.work_ops : []).forEach(function (w, wi) {
        var editingUid = String(w.uid || '').trim();
        var old = editingUid ? existingWCByUid[editingUid] : null;
        var m = {};
        var wcId = String(w.work_center_id || '').trim();
        m['work_center_sequence'] = old ? old.work_center_sequence : (wcSeqMap[wcId] !== undefined && wcSeqMap[wcId] !== '' ? wcSeqMap[wcId] : (wi + 1));
        m['recipe_id'] = wcId;  /* column holds the work_center_id (per schema) */
        m['operation_status'] = String(w.operation_status || 'Pending').trim();
        m['start_time'] = w.start_time ? parseDate_(w.start_time) : (old && old.start_time ? old.start_time : new Date());
        m['end_time'] = w.end_time ? parseDate_(w.end_time) : (old && old.end_time ? old.end_time : new Date());
        m['notes'] = String(w.notes || '').trim();
        m['actual_hours'] = (w.actual_hours !== '' && w.actual_hours != null) ? Number(w.actual_hours) : '';
        m['last_pause_time'] = w.last_pause_time ? parseDate_(w.last_pause_time) : '';
        m['total_pause_duration'] = (w.total_pause_duration !== '' && w.total_pause_duration != null) ? Number(w.total_pause_duration) : (old ? Number(old.total_pause_duration || 0) : 0);
        /* work_center_cost / total_cost are sheet-computed — written as formulas below */
        if (old) {
          updateRowByCriteria_(sheetWC, 'unique_id', editingUid, m);
          keepWcUids.push(editingUid);
        } else {
          m['unique_id'] = Utilities.getUuid();
          m['id'] = getNextIdUnderLock_(dbId, WC_SHEET, 'id');
          m['valley_manufacture_header_id'] = moUid;
          m['user'] = (user && user.email) || '';
          m['created_at'] = new Date();
          var vals = wcHeaders.map(function (h) { var k = String(h).trim(); return m[k] !== undefined ? m[k] : ''; });
          sheetWC.appendRow(vals);
          keepWcUids.push(m['unique_id']);
        }
      });
      existingWC.forEach(function (r) {
        if (keepWcUids.indexOf(String(r.unique_id)) === -1) deleteRowsByCriteria_(sheetWC, 'unique_id', String(r.unique_id));
      });

      /* work-center cost columns are SHEET FORMULAS */
      var wcAll = sheetWC.getDataRange().getValues();
      var wcHdrs = getHeaders_(sheetWC);
      var wcUidIdx = wcHdrs.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
      keepWcUids.forEach(function (uid) {
        for (var wr = 1; wr < wcAll.length; wr++) {
          if (String(wcAll[wr][wcUidIdx]).trim() === String(uid).trim()) {
            var rN = wr + 1;
            writeFormula_(dbId, WC_SHEET, rN, 'work_center_cost', '=VLOOKUP(E' + rN + ', valley_work_centers!$A:$I, 8, 0)');
            writeFormula_(dbId, WC_SHEET, rN, 'total_cost', '=K' + rN + '*J' + rN);
            break;
          }
        }
      });

      /* ---- rewrite by-products (valley_manufacture_by_product, inline of header) ---- */
      var BP_SHEET = 'valley_manufacture_by_product';
      var BP_HEADERS = ['unique_id','id','valley_manufacture_header_id','code','manufacture_date','transaction_code','item','qty','total_cost','manufacture_internal_batch','user','created_at'];
      settingsEnsureSheet_(dbId, BP_SHEET, BP_HEADERS);
      var sheetBP = getSheet_(BP_SHEET, dbId);
      var bpHeaders = getHeaders_(sheetBP);
      deleteRowsByCriteria_(sheetBP, 'valley_manufacture_header_id', moUid);
      var bpRows = (Array.isArray(d.byproducts) ? d.byproducts : []).map(function (b) {
        var m = {};
        m['unique_id'] = Utilities.getUuid();
        m['id'] = getNextIdUnderLock_(dbId, BP_SHEET, 'id');
        m['valley_manufacture_header_id'] = moUid;
        m['item'] = String(b.item || '').trim();
        m['qty'] = Number(b.qty) || 0;
        m['transaction_code'] = String(b.transaction_code || '').trim();
        m['total_cost'] = Number(b.total_cost || 0);
        m['manufacture_date'] = new Date();
        m['user'] = (user && user.email) || '';
        m['created_at'] = new Date();
        return bpHeaders.map(function (h) { var k = String(h).trim(); return m[k] !== undefined ? m[k] : ''; });
      });
      if (bpRows.length) {
        var bpStart = sheetBP.getLastRow() + 1;
        sheetBP.getRange(bpStart, 1, bpRows.length, bpHeaders.length).setValues(bpRows);
      }
    });

    finBustRefs_(dbId);
    return { status: 'success', message: editing ? 'تم تحديث أمر التصنيع' : 'تم إنشاء أمر التصنيع', mo_uid: moUid };
  }

  function approveValleyMfgOrder_(data, user, dbId) {
    requireSuperAdmin_(user);
    var moUid = String((data && data.mo_uid) || '').trim();
    var kind = String((data && data.kind) || '');
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    if (kind === 'unlock') {
      /* SA-only unlock: revert Locked → In Progress */
      var sheetU = getSheet_(MFG_ORDER_SHEET, dbId);
      var headersU = getHeaders_(sheetU);
      var uidIdxU = headersU.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
      var stIdxU = headersU.findIndex(function (h) { return String(h).trim() === 'mo_status'; });
      var dataU = sheetU.getDataRange().getValues();
      for (var ru = 1; ru < dataU.length; ru++) {
        if (String(dataU[ru][uidIdxU]).trim() === moUid) {
          var _oldU = getAllRecords_(dbId, MFG_ORDER_SHEET).find(function(r){ return String(r.unique_id)===String(moUid); }) || null;
          sheetU.getRange(ru + 1, stIdxU + 1).setValue('In Progress');
          try{ var _newU = Object.assign({}, _oldU||{}, { mo_status: 'In Progress' }); logHistory_(dbId, MFG_ORDER_SHEET, _oldU&&_oldU.record_uid ? _oldU.record_uid : ('update_'+MFG_ORDER_SHEET+'_'+moUid), moUid, (user&&user.email)||'', 'update', _newU, _oldU) }catch(e){}
          return { status: 'success', message: 'تم فتح قفل أمر التصنيع' };
        }
      }
      throw new Error('أمر التصنيع غير موجود');
    }
    if (kind !== 'production' && kind !== 'quality') throw new Error('نوع الاعتماد غير صالح');
    var sheet = getSheet_(MFG_ORDER_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var uidIdx = headers.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
    var stIdx = headers.findIndex(function (h) { return String(h).trim() === 'mo_status'; });
    var paIdx = headers.findIndex(function (h) { return String(h).trim() === 'production_approval'; });
    var patIdx = headers.findIndex(function (h) { return String(h).trim() === 'production_approval_time'; });
    var qaIdx = headers.findIndex(function (h) { return String(h).trim() === 'quality_approval'; });
    var qatIdx = headers.findIndex(function (h) { return String(h).trim() === 'quality_approval_time'; });
    var dataAll = sheet.getDataRange().getValues();
    for (var r = 1; r < dataAll.length; r++) {
      if (String(dataAll[r][uidIdx]).trim() === moUid) {
        var oldObj = {};
        headers.forEach(function (h, hi) { oldObj[String(h).trim()] = dataAll[r][hi]; });
        if (kind === 'production') {
          sheet.getRange(r + 1, paIdx + 1).setValue((user && user.email) || '');
          sheet.getRange(r + 1, patIdx + 1).setValue(new Date());
        } else {
          sheet.getRange(r + 1, qaIdx + 1).setValue((user && user.email) || '');
          sheet.getRange(r + 1, qatIdx + 1).setValue(new Date());
        }
        /* auto-lock when both approvals exist */
        var hasProd = kind === 'production' || (paIdx !== -1 && String(dataAll[r][paIdx]).trim() !== '');
        var hasQual = kind === 'quality' || (qaIdx !== -1 && String(dataAll[r][qaIdx]).trim() !== '');
        if (hasProd && hasQual && stIdx !== -1) {
          sheet.getRange(r + 1, stIdx + 1).setValue('Locked');
        }
        var newObj = Object.assign({}, oldObj, kind === 'production'
          ? { production_approval: (user && user.email) || '', production_approval_time: new Date() }
          : { quality_approval: (user && user.email) || '', quality_approval_time: new Date() });
        var oldUid = oldObj.record_uid || ('upd_' + MFG_ORDER_SHEET + '_' + moUid);
        logHistory_(dbId, MFG_ORDER_SHEET, oldUid, moUid, (user && user.email) || '', 'approve', newObj, oldObj);
        return { status: 'success', message: kind === 'production' ? 'تم اعتماد الإنتاج' : 'تم اعتماد الجودة' };
      }
    }
    throw new Error('أمر التصنيع غير موجود');
  }

  /* Throw if a Locked MO is being mutated by a non-super-admin. */
  function assertMoEditable_(moUid, user, dbId) {
    if (!moUid) return;
    if (user && user.isSuperAdmin) return;
    var sheet = getSheet_(MFG_ORDER_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var uidIdx = headers.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
    var stIdx = headers.findIndex(function (h) { return String(h).trim() === 'mo_status'; });
    if (uidIdx === -1 || stIdx === -1) return;
    var dataAll = sheet.getDataRange().getValues();
    for (var r = 1; r < dataAll.length; r++) {
      if (String(dataAll[r][uidIdx]).trim() === String(moUid).trim()) {
        if (String(dataAll[r][stIdx]).trim() === 'Locked') throw new Error('أمر التصنيع مقفل — لا يمكن التعديل (يلزم فتح القفل بصلاحية مدير النظام)');
        return;
      }
    }
  }

  /* Simple 3-state status transitions: start (Draft→In Progress), lock (In Progress→Locked, SA),
     unlock (Locked→In Progress, SA). */
  function changeValleyMfgStatus_(data, user, dbId) {
    var moUid = String((data && data.mo_uid) || '').trim();
    var kind = String((data && data.kind) || '').trim();
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    if (['start', 'lock', 'unlock'].indexOf(kind) === -1) throw new Error('نوع التحويل غير صالح');

    var sheet = getSheet_(MFG_ORDER_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var uidIdx = headers.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
    var stIdx = headers.findIndex(function (h) { return String(h).trim() === 'mo_status'; });
    if (uidIdx === -1 || stIdx === -1) throw new Error('بنية الأمر غير صالحة');
    var dataAll = sheet.getDataRange().getValues();
    var cur = null;
    for (var r = 1; r < dataAll.length; r++) {
      if (String(dataAll[r][uidIdx]).trim() === moUid) { cur = String(dataAll[r][stIdx]).trim(); break; }
    }
    if (cur === null) throw new Error('أمر التصنيع غير موجود');

    var next;
    if (kind === 'start') {
      if (cur !== 'Draft') throw new Error('يمكن البدء فقط من حالة مسودة');
      next = 'In Progress';
    } else if (kind === 'lock') {
      requireSuperAdmin_(user);
      if (cur !== 'In Progress') throw new Error('يمكن القفل فقط من حالة قيد التنفيذ');
      next = 'Locked';
    } else { /* unlock */
      requireSuperAdmin_(user);
      if (cur !== 'Locked') throw new Error('الأمر ليس مقفلاً');
      next = 'In Progress';
    }
    var _oldMfgSt = getAllRecords_(dbId, MFG_ORDER_SHEET).find(function(r){ return String(r.unique_id)===String(moUid); }) || null;
    executeWithLock_(function () {
      for (var r2 = 1; r2 < dataAll.length; r2++) {
        if (String(dataAll[r2][uidIdx]).trim() === moUid) {
          sheet.getRange(r2 + 1, stIdx + 1).setValue(next);
          break;
        }
      }
    });
    try{ var _newMfgSt = Object.assign({}, _oldMfgSt||{}, { mo_status: next }); logHistory_(dbId, MFG_ORDER_SHEET, _oldMfgSt&&_oldMfgSt.record_uid ? _oldMfgSt.record_uid : ('update_'+MFG_ORDER_SHEET+'_'+moUid), moUid, (user&&user.email)||'', 'update', _newMfgSt, _oldMfgSt) }catch(e){}
    return { status: 'success', message: kind === 'lock' ? 'تم قفل أمر التصنيع' : (kind === 'unlock' ? 'تم فتح قفل أمر التصنيع' : 'تم بدء أمر التصنيع'), mo_status: next };
  }

  /* Returns the work-center ops and raw-material items defined by a recipe, scaled to a qty. */
  function getValleyRecipePlan_(data, user, dbId) {
    var recipeUid = String((data && data.recipe_uid) || '').trim();
    var qty = Number((data && data.qty) || 0);
    if (!recipeUid) throw new Error('اختر الوصفة');
    if (!isFinite(qty) || qty <= 0) throw new Error('الكمية المصنعة مطلوبة');

    var recipe = null;
    safeRecipeRows_(dbId).some(function (r) { if (String(r.unique_id) === recipeUid) { recipe = r; return true; } return false; });
    if (!recipe) throw new Error('الوصفة غير موجودة');
    var yieldQty = Number(recipe.yield_qty) || 0;
    if (yieldQty <= 0) throw new Error('وصفة غير صالحة (كمية الإنتاج = 0)');
    var ratio = qty / yieldQty;

    var ops = [], materials = [];
    getAllRecords_(dbId, MFG_RECIPE_FOOTER_SHEET).forEach(function (s) {
      if (String(s.valley_product_recipe_id || '').trim() !== recipeUid) return;
      if (s.is_active === false || String(s.is_active).toLowerCase() === 'false') return;
      ops.push({
        work_center_id: String(s.work_center_id || ''),
        work_center_name: String(s.work_center_name || ''),
        step_name: String(s.step_name || ''),
        sequence: Number(s.sequence || 0)
      });
      if (s.raw_material_id) {
        var lossPct = Number(s.loss_percentage || 0) / 100;
        materials.push({
          raw_material_id: String(s.raw_material_id || ''),
          raw_material_name: String(s.raw_material_name || ''),
          required_qty: (Number(s.required_qty || 0) * ratio) * (1 + lossPct)
        });
      }
    });
    ops.sort(function (a, b) { return numSafe_(a.sequence) - numSafe_(b.sequence); });
    function numSafe_(v) { var n = Number(v); return isNaN(n) ? 9999 : n; }
    return { status: 'success', ops: ops, materials: materials };
  }

  /* Batch 6: O(1)-ish single-record lookup by unique_id via a CacheService
   * index (unique_id -> 1-indexed sheet row). On cache miss or index
   * inconsistency it rebuilds the index from a full scan and, if the uid is
   * still not found (e.g. a row added within the TTL window), falls back to a
   * full scan before giving up — so correctness is never sacrificed. Returns
   * the row number, or 0 if not found. */
  function vfFindRowByUid_(dbId, sheetName, uidHeader, uid) {
    uid = String(uid).trim();
    var cache = CacheService.getScriptCache();
    var ckey = 'vfidx_' + String(dbId) + '_' + sheetName;
    function buildIndex() {
      var sheet = getSheet_(sheetName, dbId);
      var headers = getHeaders_(sheet);
      var data = sheet.getDataRange().getValues();
      var uIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === String(uidHeader).trim().toLowerCase(); });
      var built = {};
      for (var i = 1; i < data.length; i++) {
        var v = String(data[i][uIdx] || '').trim();
        if (v) built[v] = i + 1;
      }
      try { cache.put(ckey, JSON.stringify(built), 60); } catch (e2) {}
      return built;
    }
    var index = null;
    try { var c = cache.get(ckey); if (c) index = JSON.parse(c); } catch (e) {}
    if (index && index[uid]) {
      try {
        var sheet = getSheet_(sheetName, dbId);
        var headers = getHeaders_(sheet);
        var uIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === String(uidHeader).trim().toLowerCase(); });
        var rowVals = sheet.getRange(index[uid], 1, 1, sheet.getLastColumn()).getValues()[0];
        if (String(rowVals[uIdx] || '').trim() === uid) return index[uid];
      } catch (e) {}
      index = null;
    }
    var built = buildIndex();
    if (built[uid]) return built[uid];
    var sheet = getSheet_(sheetName, dbId);
    var headers = getHeaders_(sheet);
    var data = sheet.getDataRange().getValues();
    var uIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === String(uidHeader).trim().toLowerCase(); });
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][uIdx] || '').trim() === uid) return i + 1;
    }
    return 0;
  }

  /* Batch 7: opt-in list bounding. When the caller passes payload.from /
   * payload.to (ISO date strings) and/or payload.limit, the list is trimmed to
   * that window. With none provided the rows are returned untouched, so
   * existing clients keep their current (unbounded) behavior. Date filtering
   * treats unparseable dates as "keep" so we never hide data by accident. */
  function vfBoundRows_(rows, payload, dateField) {
    if (!rows || !rows.length) return rows;
    payload = payload || {};
    var from = payload.from ? new Date(payload.from) : null;
    var to = payload.to ? new Date(payload.to) : null;
    var limit = (payload.limit != null) ? Number(payload.limit) : null;
    var out = rows.filter(function (r) {
      if (from || to) {
        var dv = r[dateField];
        var d = dv ? new Date(dv) : null;
        if (!d || isNaN(d.getTime())) return true;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
    if (limit != null && limit >= 0 && out.length > limit) out = out.slice(0, limit);
    return out;
  }

  /* Like vfBoundRows_ but also returns the unfiltered total so the client can
   * implement "load more" paging. Honors payload.offset + payload.limit. */
  function vfPage_(rows, payload, dateField) {
    payload = payload || {};
    var from = payload.from ? new Date(payload.from) : null;
    var to = payload.to ? new Date(payload.to) : null;
    var limit = (payload.limit != null) ? Number(payload.limit) : null;
    var offset = (payload.offset != null) ? Number(payload.offset) : 0;
    if (offset < 0) offset = 0;
    var filtered = (rows || []).filter(function (r) {
      if (from || to) {
        var dv = r[dateField];
        var d = dv ? new Date(dv) : null;
        if (!d || isNaN(d.getTime())) return true;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
    var total = filtered.length;
    if (offset > 0) filtered = filtered.slice(offset);
    if (limit != null && limit >= 0) filtered = filtered.slice(0, limit);
    return { rows: filtered, total: total };
  }

  function getValleyMfgOrderFull_(data, user, dbId) {
    var moUid = String((data && data.mo_uid) || '').trim();
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    var order = null;
    var moRow = vfFindRowByUid_(dbId, MFG_ORDER_SHEET, 'unique_id', moUid);
    if (moRow) {
      var moSheet = getSheet_(MFG_ORDER_SHEET, dbId);
      var moHeaders = getHeaders_(moSheet);
      var moVals = moSheet.getRange(moRow, 1, 1, moSheet.getLastColumn()).getValues()[0];
      order = {};
      moHeaders.forEach(function (h, ci) { order[String(h).trim()] = moVals[ci]; });
    }
    if (!order) throw new Error('أمر التصنيع غير موجود');
    var outputs = [];
    try {
      getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (o) {
        if (String(o.valley_manufacture_header_id || '').trim() === moUid) outputs.push(o);
      });
    } catch (e) {}

    /* batch unit-cost lookup for footer totals */
    var batchCost = {};
    try { getAllRecords_(dbId, 'valley_current_products').forEach(function (r) { var u = String(r.unique_id || '').trim(); if (u) batchCost[u] = Number(r.unit_cost) || 0; }); } catch (e) {}

    /* load footer (consumption) rows grouped by output product UID */
    var footersByOutput = {};
    var legacyConsumption = [];
    try {
      getAllRecords_(dbId, MFG_CONSUMPTION_SHEET).forEach(function (cm) {
        var refId = String(cm.valley_manufacture_header_product_id || '').trim();
        if (!refId) return;
        var isForThisMo = false;
        outputs.forEach(function (o) { if (String(o.unique_id) === refId) isForThisMo = true; });
        if (isForThisMo) {
          if (!footersByOutput[refId]) footersByOutput[refId] = [];
          var _uc = batchCost[String(cm.item || '').trim()] || 0;
          footersByOutput[refId].push({
            unique_id: cm.unique_id,
            item: String(cm.item || ''),
            item_code: String(cm.item_code || ''),
            qty: Number(cm.qty || 0),
            unit_cost: _uc,
            total_cost: _uc * Number(cm.qty || 0)
          });
        } else if (refId === moUid) {
          legacyConsumption.push({
            item_pid: String(cm.item || ''),
            batch_uid: '',
            lot: String(cm.item_code || ''),
            qty: Number(cm.qty || 0),
            required: Number(cm.qty || 0)
          });
        }
      });
    } catch (e) {}

    /* attach footers to outputs */
    outputs.forEach(function (o) {
      o.footers = footersByOutput[String(o.unique_id)] || [];
    });
    var prodNames = {};
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) { prodNames[String(p.id)] = String(p.name_ar || ''); });
    } catch (e) {}
    legacyConsumption.forEach(function (cm) { cm.raw_name = prodNames[cm.item_pid] || cm.item_pid; });
    return {
      status: 'success',
      order: order,
      outputs: outputs,
      consumption: legacyConsumption
    };
  }

  /* ---------- PC: BY-PRODUCTS / WORK OPS / PRODUCTION PLANS ---------- */
  const MFG_BYPRODUCT_SHEET = 'valley_manufacture_by_product';
  const MFG_WORKOPS_SHEET = 'valley_manufacture_work_center';
  const PLANS_SHEET = 'valley_production_plans';

  const MFG_PLAN_STATUSES = ['Planned', 'In Progress', 'Done'];

  function getValleyMfgByproducts_(data, user, dbId) {
    var moUid = String((data && data.mo_uid) || '').trim();
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    var rows = [];
    try {
      getAllRecords_(dbId, MFG_BYPRODUCT_SHEET).forEach(function (r) {
        if (String(r.valley_manufacture_header_id || '').trim() === moUid) {
          rows.push({
            unique_id: r.unique_id,
            item: r.item != null ? r.item : '',
            qty: Number(r.qty || 0),
            transaction_code: r.transaction_code || '',
            total_cost: Number(r.total_cost || 0)
          });
        }
      });
    } catch (e) {}
    // enrich product_name
    var _prodNameMapBP = {};
    try { getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function(pp){ _prodNameMapBP[String(pp.id)] = String(pp.name_ar || pp.id); }); } catch(e){}
    rows.forEach(function(rr){ rr.product_name = _prodNameMapBP[String(rr.item)] || String(rr.item); });
    var limit = Number(data && data.limit) || 15;
    var total = rows.length;
    rows = rows.slice().reverse();
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    var productOpts = finRefsCached_(dbId, 'products', function () {
      return getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
        return { value: p.id, label: String(p.name_ar || ('#' + p.id)) };
      });
    });
    return { status: 'success', byproducts: rows, total: total, product_options: productOpts };
  }

  function addValleyMfgByproduct_(data, user, dbId) {
    var d = data || {};
    var moUid = String(d.mo_uid || '').trim();
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    assertMoEditable_(moUid, user, dbId);
    var pid = String(d.item || '').trim();
    if (!pid) throw new Error('المنتج الثانوي مطلوب');
    var qty = Number(d.qty);
    if (!isFinite(qty) || qty <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');

    settingsEnsureSheet_(dbId, MFG_BYPRODUCT_SHEET,
      ['unique_id','id','valley_manufacture_header_id','code','manufacture_date','transaction_code','item','qty','total_cost','manufacture_internal_batch','user','created_at']);

    var _savedBP = null;
    executeWithLock_(function () {
      var sheet = getSheet_(MFG_BYPRODUCT_SHEET, dbId);
      var headers = getHeaders_(sheet);
      var dataAll = sheet.getDataRange().getValues();
      var m8 = {};
      m8['unique_id'] = Utilities.getUuid();
      m8['id'] = getNextIdUnderLock_(dbId, MFG_BYPRODUCT_SHEET, 'id'); /* M5 */
      m8['valley_manufacture_header_id'] = moUid;
      m8['item'] = Number(pid) || pid;
      m8['qty'] = qty;
      m8['transaction_code'] = String(d.batch_code || '').trim();
      m8['total_cost'] = Number(d.total_cost || 0);
      m8['user'] = (user && user.email) || '';
      m8['created_at'] = new Date();
      var values = headers.map(function (h) {
        var k = String(h).trim();
        return m8[k] !== undefined ? m8[k] : '';
      });
      sheet.appendRow(values);
      var _prodNameBP = '';
      try { getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function(pp){ if (String(pp.id)===String(pid)) _prodNameBP = String(pp.name_ar || pp.id); }); } catch(e){}
      _savedBP = {
        unique_id: m8['unique_id'], id: m8['id'], valley_manufacture_header_id: moUid,
        item: m8['item'], product_name: _prodNameBP || String(pid),
        qty: qty, transaction_code: m8['transaction_code'], total_cost: m8['total_cost'],
        user: m8['user'], created_at: m8['created_at']
      };
      try{ logHistory_(dbId, MFG_BYPRODUCT_SHEET, m8.record_uid || ('create_'+MFG_BYPRODUCT_SHEET+'_'+m8['unique_id']), m8['unique_id'], (user&&user.email)||'', 'create', m8, null) }catch(e){}
    });
    return { status: 'success', message: 'تمت إضافة المنتج الثانوي', data: { unique_id: _savedBP.unique_id }, record: _savedBP };
  }

  const MFG_WC_OP_STATUSES = ['Pending', 'In Progress', 'Paused', 'Done'];

  function getValleyMfgWorkOps_(data, user, dbId) {
    var moUid = String((data && data.mo_uid) || '').trim();
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    var rows = [];
    try {
      getAllRecords_(dbId, MFG_WORKOPS_SHEET).forEach(function (r) {
        if (String(r.valley_manufacture_header_id || '').trim() === moUid) {
          rows.push({
            unique_id: r.unique_id,
            work_center_sequence: r.work_center_sequence,
            work_center_id: r.work_center_id != null ? r.work_center_id : '',
            operation_status: r.operation_status || 'Pending',
            start_time: r.start_time || '',
            end_time: r.end_time || '',
            actual_hours: r.actual_hours != null ? r.actual_hours : '',
            last_pause_time: r.last_pause_time || '',
            total_pause_duration: r.total_pause_duration != null ? r.total_pause_duration : 0,
            notes: r.notes || ''
          });
        }
      });
    } catch (e) {}
    rows.sort(function (a, b) { return numSafe_(a.work_center_sequence) - numSafe_(b.work_center_sequence); });
    function numSafe_(v) { var n = Number(v); return isNaN(n) ? 9999 : n; }
    return { status: 'success', workops: rows, work_center_options: mfgWorkCenterOptions_(dbId), statuses: MFG_WC_OP_STATUSES };
  }

  function saveValleyMfgWorkOp_(data, user, dbId) {
    var d = data || {};
    var moUid = String(d.mo_uid || '').trim();
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    assertMoEditable_(moUid, user, dbId);
    if (!d.work_center_id) throw new Error('مركز العمل مطلوب');
    var status = String(d.operation_status || 'Pending').trim();
    if (MFG_WC_OP_STATUSES.indexOf(status) === -1) throw new Error('حالة العملية غير صالحة');

    settingsEnsureSheet_(dbId, MFG_WORKOPS_SHEET,
      ['unique_id','id','valley_manufacture_header_id','work_center_sequence','recipe_id','operation_status','start_time','end_time','notes','actual_hours','work_center_cost','total_cost','last_pause_time','total_pause_duration','user','created_at']);
    var sheet = getSheet_(MFG_WORKOPS_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, MFG_WORKOPS_SHEET);

    var editingUid = String(d.workop_uid || '').trim();
    var seqNum = null;
    if (!editingUid) {
      var maxSeq = 0;
      rows.forEach(function (r) {
        if (String(r.valley_manufacture_header_id || '').trim() !== moUid) return;
        var s2 = Number(r.work_center_sequence);
        if (Number.isInteger(s2) && s2 > maxSeq) maxSeq = s2;
      });
      seqNum = maxSeq + 1;
    }

    var _oldWO = editingUid ? (rows.find(function(r){ return String(r.unique_id)===String(editingUid); }) || null) : null;
    executeWithLock_(function () {
      var map = {};
      map['operation_status'] = status;
      map['start_time'] = d.start_time ? parseDate_(d.start_time) : '';
      map['end_time'] = d.end_time ? parseDate_(d.end_time) : '';
      map['actual_hours'] = d.actual_hours !== '' && d.actual_hours != null ? Number(d.actual_hours) : '';
      map['notes'] = String(d.notes || '').trim();

      if (editingUid) {
        updateRowByCriteria_(sheet, 'unique_id', editingUid, map);
        try{ var _newWO = Object.assign({}, _oldWO||{}, map); logHistory_(dbId, MFG_WORKOPS_SHEET, _oldWO&&_oldWO.record_uid ? _oldWO.record_uid : ('update_'+MFG_WORKOPS_SHEET+'_'+editingUid), editingUid, (user&&user.email)||'', 'update', _newWO, _oldWO) }catch(e){}
      } else {
        var uid2 = Utilities.getUuid();
        map['unique_id'] = uid2;
        map['valley_manufacture_header_id'] = moUid;
        map['work_center_sequence'] = seqNum;
        map['work_center_id'] = String(d.work_center_id);
        map['user'] = (user && user.email) || '';
        map['created_at'] = new Date();
        var values = headers.map(function (h) {
          var k = String(h).trim();
          return map[k] !== undefined ? map[k] : '';
        });
        sheet.appendRow(values);
        try{ logHistory_(dbId, MFG_WORKOPS_SHEET, map.record_uid || ('create_'+MFG_WORKOPS_SHEET+'_'+uid2), uid2, (user&&user.email)||'', 'create', map, null) }catch(e){}
      }
    });
    return { status: 'success', message: editingUid ? 'تم تحديث العملية' : 'تمت إضافة العملية' };
  }

  /** Timing control for work ops: start/pause/resume/stop */
  function controlValleyMfgWorkOp_(data, user, dbId) {
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var workopUid = String(d.workop_uid || '').trim();
    if (!workopUid) throw new Error('معرّف العملية مطلوب');
    var cmd = String(d.command || '').trim();
    if (['start','pause','resume','stop'].indexOf(cmd) === -1) throw new Error('أمر غير صالح');

    settingsEnsureSheet_(dbId, MFG_WORKOPS_SHEET,
      ['unique_id','id','valley_manufacture_header_id','work_center_sequence','recipe_id','operation_status','start_time','end_time','notes','actual_hours','work_center_cost','total_cost','last_pause_time','total_pause_duration','user','created_at']);
    var sheet = getSheet_(MFG_WORKOPS_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, MFG_WORKOPS_SHEET);

    var found = null;
    rows.forEach(function (r, i) { if (String(r.unique_id) === workopUid) found = { row: r, idx: i }; });
    if (!found) throw new Error('العملية غير موجودة');

    var moUid = String(found.row.valley_manufacture_header_id || '').trim();
    var moRows = getAllRecords_(dbId, MFG_ORDER_SHEET);
    var mo = null;
    moRows.forEach(function (r) { if (String(r.unique_id) === moUid) mo = r; });
    if (mo && mo.mo_status === 'Locked' && !isSuperAdmin) throw new Error('الأمر مقفل — لا يمكن التحكم بالعمليات');

    var now = new Date();
    var curStatus = String(found.row.operation_status || 'Pending').trim();
    var pauseDur = Number(found.row.total_pause_duration || 0);
    var lastPause = found.row.last_pause_time || '';

    var map = {};
    function parseDt_(v) { if (v === undefined || v === null || v === '') return null; var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
    if (cmd === 'start') {
      if (curStatus !== 'Pending') throw new Error('يمكن البدء فقط من حالة Pending');
      map['operation_status'] = 'In Progress';
      map['start_time'] = parseDt_(d.start_time) || now;
    } else if (cmd === 'pause') {
      if (curStatus !== 'In Progress') throw new Error('يمكن الإيقاف المؤقت فقط من حالة In Progress');
      map['operation_status'] = 'Paused';
      map['last_pause_time'] = now;
    } else if (cmd === 'resume') {
      if (curStatus !== 'Paused') throw new Error('يمكن الاستئناف فقط من حالة Paused');
      if (lastPause) {
        var pauseMs = now.getTime() - new Date(lastPause).getTime();
        pauseDur += pauseMs / 3600000;
      }
      map['operation_status'] = 'In Progress';
      map['last_pause_time'] = '';
      map['total_pause_duration'] = Math.round(pauseDur * 100) / 100;
    } else if (cmd === 'stop') {
      if (curStatus !== 'In Progress' && curStatus !== 'Paused') throw new Error('يمكن الإيقاف فقط من حالة In Progress أو Paused');
      map['operation_status'] = 'Done';
      var endTime = parseDt_(d.end_time) || now;
      map['end_time'] = endTime;
      if (curStatus === 'Paused' && lastPause) {
        var pauseMsStop = endTime.getTime() - new Date(lastPause).getTime();
        pauseDur += pauseMsStop / 3600000;
        map['total_pause_duration'] = Math.round(pauseDur * 100) / 100;
      }
      var startTime = parseDt_(found.row.start_time);
      if (startTime && !isNaN(startTime.getTime())) {
        var totalMs = endTime.getTime() - startTime.getTime();
        var totalHours = (totalMs / 3600000) - pauseDur;
        map['actual_hours'] = Math.round(totalHours * 100) / 100;
      }
    }

    executeWithLock_(function () {
      updateRowByCriteria_(getSheet_(MFG_WORKOPS_SHEET, dbId), 'unique_id', workopUid, map);
    });
    try{ var _newWC = Object.assign({}, found.row||{}, map); logHistory_(dbId, MFG_WORKOPS_SHEET, found.row.record_uid || ('update_'+MFG_WORKOPS_SHEET+'_'+workopUid), workopUid, (user&&user.email)||'', 'update', _newWC, found.row) }catch(e){}
    var upd = {
      unique_id: workopUid,
      operation_status: map['operation_status'] || curStatus,
      start_time: ('start_time' in map) ? map['start_time'] : found.row.start_time,
      end_time: ('end_time' in map) ? map['end_time'] : found.row.end_time,
      last_pause_time: ('last_pause_time' in map) ? map['last_pause_time'] : found.row.last_pause_time,
      total_pause_duration: ('total_pause_duration' in map) ? map['total_pause_duration'] : pauseDur,
      actual_hours: ('actual_hours' in map) ? map['actual_hours'] : found.row.actual_hours
    };
    return { status: 'success', message: 'تم تحديث العملية', workop: upd };
  }

  // ===================== WORK CENTERS / ASSET TECHNICAL / WORK CENTER ASSETS =====================
  const WC_SHEET = 'valley_work_centers';
  const WC_ASSETS_SHEET = 'valley_work_center_assets';
  const WC_ASSET_TECH_SHEET = 'valley_product_technical';
  const WC_HEADERS = ['unique_id','id','code','name_en','name_ar','description','work_center_type','work_center_cost_per_hour','capacity_per_hour_kg','is_active','location','notes','user','created_at'];
  const WC_ASSETS_HEADERS = ['unique_id','id','code','valley_work_centers_id','valley_asset_technical','description','capacity_per_hour_kg','is_active','notes','user','created_at'];
  const WC_ASSET_TECH_HEADERS = ['unique_id','id','product_purchase_id','product_id','asset_name','purchase_value','depreciation_method','salvage_value','useful_life_years','annual_operating_hours','total_life_hours','total_life_kg','depreciation_per_hour','kw_consumption','water_consumption','testing_method','batch_size_standard','capacity_kg_per_hour','yield_percentage','status','notes','user','created_at'];

  function getValleyWorkCenters_(data, user, dbId) {
    settingsEnsureSheet_(dbId, WC_SHEET, WC_HEADERS);
    return vfRefsCached_(dbId, 'work_centers', function () {
      var rows = getAllRecords_(dbId, WC_SHEET).map(function (r) {
        r.is_active_bool = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false');
        return r;
      });
      return { status: 'success', records: rows };
    });
  }

  function saveValleyWorkCenter_(data, user, dbId) {
    vfBustRefs_(dbId, ['work_centers']);
    var d = data || {};
    var editing = !!(d.unique_id && String(d.unique_id).trim());
    var name = String(d.name_en || '').trim();
    if (!name) throw new Error('الاسم بالإنجليزية مطلوب');
    settingsEnsureSheet_(dbId, WC_SHEET, WC_HEADERS);
    var sheet = getSheet_(WC_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, WC_SHEET);
    for (var i = 0; i < rows.length; i++) {
      var same = String(rows[i].name_en || '').trim().toLowerCase() === name.toLowerCase();
      var sameRow = editing && String(rows[i].unique_id) === String(d.unique_id);
      if (same && !sameRow) throw new Error('يوجد خط إنتاج بنفس الاسم');
    }
    var map = {};
    map['name_en'] = name;
    map['name_ar'] = String(d.name_ar || '').trim();
    map['description'] = String(d.description || '').trim();
    map['work_center_type'] = String(d.work_center_type || '').trim();
    map['work_center_cost_per_hour'] = Number(d.work_center_cost_per_hour || 0);
    map['capacity_per_hour_kg'] = Number(d.capacity_per_hour_kg || 0);
    map['is_active'] = !(d.is_active === false || String(d.is_active).toLowerCase() === 'false');
    map['location'] = String(d.location || '').trim();
    map['notes'] = String(d.notes || '').trim();
    map['user'] = (user && user.email) || '';
    var _oldWC = editing ? (rows.find(function(r){ return String(r.unique_id)===String(d.unique_id); }) || null) : null;
    executeWithLock_(function () {
      if (editing) {
        updateRowByCriteria_(sheet, 'unique_id', String(d.unique_id).trim(), map);
        try{ var _newWC = Object.assign({}, _oldWC||{}, map); logHistory_(dbId, WC_SHEET, _oldWC&&_oldWC.record_uid ? _oldWC.record_uid : ('update_'+WC_SHEET+'_'+d.unique_id), String(d.unique_id).trim(), (user&&user.email)||'', 'update', _newWC, _oldWC) }catch(e){}
      } else {
        map['unique_id'] = Utilities.getUuid();
        map['id'] = getNextIdUnderLock_(dbId, WC_SHEET, 'id');
        map['code'] = String(map['id']);
        map['created_at'] = new Date();
        var values = headers.map(function (h) { var k = String(h).trim(); return map[k] !== undefined ? map[k] : ''; });
        sheet.appendRow(values);
        try{ logHistory_(dbId, WC_SHEET, map.record_uid || ('create_'+WC_SHEET+'_'+map['unique_id']), map['unique_id'], (user&&user.email)||'', 'create', map, null) }catch(e){}
      }
    });
    return { status: 'success', message: editing ? 'تم التحديث' : 'تمت الإضافة' };
  }

  function getValleyAssetTechnicals_(data, user, dbId) {
    settingsEnsureSheet_(dbId, WC_ASSET_TECH_SHEET, WC_ASSET_TECH_HEADERS);
    return vfRefsCached_(dbId, 'asset_technicals', function () {
      var rows = getAllRecords_(dbId, WC_ASSET_TECH_SHEET);
      var productOpts = [];
      try {
        productOpts = getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
          return { value: p.id, label: String(p.name_ar || ('#' + p.id)) };
        }).filter(function (o) { return String(o.value).trim() !== ''; })
          .sort(function (a, b) { return a.label.localeCompare(b.label, 'ar'); });
      } catch (e) {}
      return { status: 'success', records: rows, product_options: productOpts };
    });
  }

  function saveValleyAssetTechnical_(data, user, dbId) {
    vfBustRefs_(dbId, ['asset_technicals']);
    var d = data || {};
    var editing = !!(d.unique_id && String(d.unique_id).trim());
    var name = String(d.asset_name || '').trim();
    if (!name) throw new Error('اسم الأصل مطلوب');
    settingsEnsureSheet_(dbId, WC_ASSET_TECH_SHEET, WC_ASSET_TECH_HEADERS);
    var sheet = getSheet_(WC_ASSET_TECH_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var map = {};
    map['asset_name'] = name;
    map['product_id'] = String(d.product_id || '').trim();
    map['product_purchase_id'] = String(d.product_purchase_id || '').trim();
    map['purchase_value'] = Number(d.purchase_value || 0);
    map['depreciation_method'] = String(d.depreciation_method || '').trim();
    map['salvage_value'] = Number(d.salvage_value || 0);
    map['useful_life_years'] = Number(d.useful_life_years || 0);
    map['annual_operating_hours'] = Number(d.annual_operating_hours || 0);
    map['total_life_hours'] = Number(d.total_life_hours || 0);
    map['total_life_kg'] = Number(d.total_life_kg || 0);
    map['depreciation_per_hour'] = Number(d.depreciation_per_hour || 0);
    map['kw_consumption'] = Number(d.kw_consumption || 0);
    map['water_consumption'] = Number(d.water_consumption || 0);
    map['testing_method'] = String(d.testing_method || '').trim();
    map['batch_size_standard'] = Number(d.batch_size_standard || 0);
    map['capacity_kg_per_hour'] = Number(d.capacity_kg_per_hour || 0);
    map['yield_percentage'] = Number(d.yield_percentage || 0);
    map['status'] = String(d.status || '').trim();
    map['notes'] = String(d.notes || '').trim();
    map['user'] = (user && user.email) || '';
    var _oldAT = null; try{ var _rowsAT = getAllRecords_(dbId, WC_ASSET_TECH_SHEET); _oldAT = _rowsAT.find(function(r){ return String(r.unique_id)===String(d.unique_id); }) || null; }catch(e){}
    executeWithLock_(function () {
      if (editing) {
        updateRowByCriteria_(sheet, 'unique_id', String(d.unique_id).trim(), map);
        try{ var _newAT = Object.assign({}, _oldAT||{}, map); logHistory_(dbId, WC_ASSET_TECH_SHEET, _oldAT&&_oldAT.record_uid ? _oldAT.record_uid : ('update_'+WC_ASSET_TECH_SHEET+'_'+d.unique_id), String(d.unique_id).trim(), (user&&user.email)||'', 'update', _newAT, _oldAT) }catch(e){}
      } else {
        map['unique_id'] = Utilities.getUuid();
        map['id'] = getNextIdUnderLock_(dbId, WC_ASSET_TECH_SHEET, 'id');
        map['created_at'] = new Date();
        var values = headers.map(function (h) { var k = String(h).trim(); return map[k] !== undefined ? map[k] : ''; });
        sheet.appendRow(values);
        try{ logHistory_(dbId, WC_ASSET_TECH_SHEET, map.record_uid || ('create_'+WC_ASSET_TECH_SHEET+'_'+map['unique_id']), map['unique_id'], (user&&user.email)||'', 'create', map, null) }catch(e){}
      }
    });
    return { status: 'success', message: editing ? 'تم التحديث' : 'تمت الإضافة' };
  }

  function getValleyWorkCenterAssets_(data, user, dbId) {
    settingsEnsureSheet_(dbId, WC_ASSETS_SHEET, WC_ASSETS_HEADERS);
    var rows = getAllRecords_(dbId, WC_ASSETS_SHEET).map(function (r) {
      r.is_active_bool = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false');
      return r;
    });
    return { status: 'success', records: rows, work_center_options: mfgWorkCenterOptions_(dbId) };
  }

  function saveValleyWorkCenterAsset_(data, user, dbId) {
    var d = data || {};
    var editing = !!(d.unique_id && String(d.unique_id).trim());
    var wcUid = String(d.valley_work_centers_id || '').trim();
    if (!wcUid) throw new Error('خط الإنتاج مطلوب');
    var techUid = String(d.valley_asset_technical || '').trim();
    if (!techUid) throw new Error('الأصل مطلوب');
    settingsEnsureSheet_(dbId, WC_ASSETS_SHEET, WC_ASSETS_HEADERS);
    var sheet = getSheet_(WC_ASSETS_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var map = {};
    map['valley_work_centers_id'] = wcUid;
    map['valley_asset_technical'] = techUid;
    map['code'] = String(d.code || '').trim();
    map['description'] = String(d.description || '').trim();
    map['capacity_per_hour_kg'] = Number(d.capacity_per_hour_kg || 0);
    map['is_active'] = !(d.is_active === false || String(d.is_active).toLowerCase() === 'false');
    map['notes'] = String(d.notes || '').trim();
    map['user'] = (user && user.email) || '';
    var _oldWCA = null; try{ var _rowsWCA = getAllRecords_(dbId, WC_ASSETS_SHEET); _oldWCA = _rowsWCA.find(function(r){ return String(r.unique_id)===String(d.unique_id); }) || null; }catch(e){}
    executeWithLock_(function () {
      if (editing) {
        updateRowByCriteria_(sheet, 'unique_id', String(d.unique_id).trim(), map);
        try{ var _newWCA = Object.assign({}, _oldWCA||{}, map); logHistory_(dbId, WC_ASSETS_SHEET, _oldWCA&&_oldWCA.record_uid ? _oldWCA.record_uid : ('update_'+WC_ASSETS_SHEET+'_'+d.unique_id), String(d.unique_id).trim(), (user&&user.email)||'', 'update', _newWCA, _oldWCA) }catch(e){}
      } else {
        map['unique_id'] = Utilities.getUuid();
        map['id'] = getNextIdUnderLock_(dbId, WC_ASSETS_SHEET, 'id');
        map['created_at'] = new Date();
        var values = headers.map(function (h) { var k = String(h).trim(); return map[k] !== undefined ? map[k] : ''; });
        sheet.appendRow(values);
        try{ logHistory_(dbId, WC_ASSETS_SHEET, map.record_uid || ('create_'+WC_ASSETS_SHEET+'_'+map['unique_id']), map['unique_id'], (user&&user.email)||'', 'create', map, null) }catch(e){}
      }
    });
    return { status: 'success', message: editing ? 'تم التحديث' : 'تمت الإضافة' };
  }

  const PLANS_STATUSES = ['Planned', 'In Progress', 'Done'];


  function saveValleyPlan_(data, user, dbId) {
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = !!(d.plan_unique_id && String(d.plan_unique_id).trim());
    /* POLICY: add = page-write authority; EDIT existing = super admin only. */
    if (editing && !isSuperAdmin) throw new Error('تعديل الخطط الموجودة من صلاحيات مدير النظام فقط');

    /* ALL fields mandatory */
    var pid = String(d.product_id || '').trim();
    if (!pid) throw new Error('المنتج مطلوب');
    if (d.client_id === '' || d.client_id == null) throw new Error('العميل / المورد مطلوب');
    var qty = Number(d.planned_qty);
    if (d.planned_qty === '' || d.planned_qty == null || isNaN(qty) || qty <= 0) throw new Error('الكمية المخططة مطلوبة وأكبر من صفر');
    if (!d.planned_date) throw new Error('تاريخ التخطيط مطلوب');
    var pd = parseDate_(d.planned_date);
    if (!pd) throw new Error('تاريخ التخطيط غير صالح');
    var status = String(d.plan_status || 'Planned').trim();
    if (PLANS_STATUSES.indexOf(status) === -1) throw new Error('حالة الخطة غير صالحة');

    settingsEnsureSheet_(dbId, PLANS_SHEET,
      ['plan_unique_id','plan_id','product_id','client_id','planned_qty','planned_date','plan_status','linked_mo_id','user','created_at']);

    executeWithLock_(function () {
      var sheet = getSheet_(PLANS_SHEET, dbId);
      var headers = getHeaders_(sheet);
      var map = {};
      map['product_id'] = Number(pid) || pid;
      map['client_id'] = Number(d.client_id) || String(d.client_id);
      map['planned_qty'] = qty;
      map['planned_date'] = pd;
      map['plan_status'] = status;
      map['linked_mo_id'] = String(d.linked_mo_id || '').trim();

      var _oldPlan = editing ? (getAllRecords_(dbId, PLANS_SHEET).find(function(r){ return String(r.plan_unique_id)===String(d.plan_unique_id); }) || null) : null;
      if (editing) {
        map['user'] = (user && user.email) || '';
        if (!updateRowByCriteria_(sheet, 'plan_unique_id', String(d.plan_unique_id).trim(), map)) throw new Error('الخطة غير موجودة');
        try{ var _newPlan = Object.assign({}, _oldPlan||{}, map); logHistory_(dbId, PLANS_SHEET, _oldPlan&&_oldPlan.record_uid ? _oldPlan.record_uid : ('update_'+PLANS_SHEET+'_'+d.plan_unique_id), String(d.plan_unique_id).trim(), (user&&user.email)||'', 'update', _newPlan, _oldPlan) }catch(e){}
      } else {
        executeWithLock_(function () {
          var sheetP = getSheet_(PLANS_SHEET, dbId);
          map['plan_unique_id'] = Utilities.getUuid();
          map['plan_id'] = getNextIdUnderLock_(dbId, PLANS_SHEET, 'plan_id'); /* M5 */
          map['user'] = (user && user.email) || '';
          map['created_at'] = new Date();
          var values = headers.map(function (h) {
            var k = String(h).trim();
            return map[k] !== undefined ? map[k] : '';
          });
          sheetP.appendRow(values);
          try{ logHistory_(dbId, PLANS_SHEET, map.record_uid || ('create_'+PLANS_SHEET+'_'+map['plan_unique_id']), map['plan_unique_id'], (user&&user.email)||'', 'create', map, null) }catch(e){}
        });
      }
    });
    return { status: 'success', message: editing ? 'تم تحديث الخطة' : 'تمت إضافة الخطة' };
  }

  function deleteValleyMfgOrder_(data, user, dbId) {
    requireSuperAdmin_(user);
    var moUid = String((data && data.mo_uid) || '').trim();
    if (!moUid) throw new Error('معرّف أمر التصنيع مطلوب');
    var mfgSheet = getSheet_(MFG_ORDER_SHEET, dbId);
    var mfgRows = getAllRecords_(dbId, MFG_ORDER_SHEET);
    var oldRow = mfgRows.find(function (r) { return String(r.unique_id) === moUid; }) || null;
    var oldUid = oldRow ? (oldRow.record_uid || ('del_' + MFG_ORDER_SHEET + '_' + moUid)) : ('del_' + MFG_ORDER_SHEET + '_' + moUid);
    logHistory_(dbId, MFG_ORDER_SHEET, oldUid, moUid, (user && user.email) || '', 'delete', null, oldRow);
    var removed = deleteRowsByCriteria_(mfgSheet, 'unique_id', moUid);
    if (!removed) throw new Error('أمر التصنيع غير موجود');
    deleteRowsByCriteria_(getSheet_(MFG_ORDER_PRODUCTS_SHEET, dbId), 'valley_manufacture_header_id', moUid);
    deleteRowsByCriteria_(getSheet_(MFG_CONSUMPTION_SHEET, dbId), 'valley_manufacture_header_product_id', moUid);
    return { status: 'success', message: 'تم حذف أمر التصنيع وبياناته' };
  }

  /* ---------- MANUFACTURE — RECIPES (BOM) ----------
   * valley_product_recipe (header) + valley_product_recipe_footer (steps).
   * Steps rewritten wholesale on save. recipe_code auto BOM-{id}-{product}. */
  const MFG_RECIPE_SHEET = 'valley_product_recipe';
  const MFG_RECIPE_FOOTER_SHEET = 'valley_product_recipe_footer';
  const MFG_WORK_CENTER_SHEET = 'valley_work_centers';

  const MFG_RECIPE_HEADERS = ['unique_id','id','recipe_code','recipe_name','produced_product_id','produced_product_name','yield_qty','yield_uom','is_active','notes','user','created_at'];
  const MFG_RECIPE_STEP_HEADERS = ['unique_id','id','valley_product_recipe_id','sequence','step_name','work_center_id','work_center_name','raw_material_id','raw_material_name','required_qty','required_uom','loss_percentage','is_active','notes','user','created_at'];

  function mfgWorkCenterOptions_(dbId) {
    /* WC1: value = unique_id (the ref key), label = name_en - name_ar, active only */
    var opts = [];
    try {
      getAllRecords_(dbId, MFG_WORK_CENTER_SHEET).forEach(function (w) {
        var uidv = String(w.unique_id || '').trim();
        if (!uidv) return;
        if (w.is_active === false || String(w.is_active).toLowerCase() === 'false') return;
        var nm = String((w.name_en || '') + ' - ' + (w.name_ar || '')).replace(/^ - | - $/g, '') || uidv;
        opts.push({ value: uidv, label: nm });
      });
    } catch (e) {}
    return opts;
  }

  function getValleyMfgRecipes_(data, user, dbId) {
    settingsEnsureSheet_(dbId, MFG_RECIPE_SHEET, MFG_RECIPE_HEADERS);
    settingsEnsureSheet_(dbId, MFG_RECIPE_FOOTER_SHEET, MFG_RECIPE_STEP_HEADERS);

    var recipes = getAllRecords_(dbId, MFG_RECIPE_SHEET).map(function (r) {
      r.is_active_bool = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false');
      return r;
    });
    var stepsByRecipe = {};
    getAllRecords_(dbId, MFG_RECIPE_FOOTER_SHEET).forEach(function (s) {
      var k = String(s.valley_product_recipe_id || '').trim();
      if (!k) return;
      if (!stepsByRecipe[k]) stepsByRecipe[k] = [];
      stepsByRecipe[k].push({
        step_name: s.step_name || '',
        work_center: s.work_center_name || '',
        raw_material: s.raw_material_name || '',
        required_qty: Number(s.required_qty || 0),
        loss_percentage: Number(s.loss_percentage || 0),
        sequence: Number(s.sequence || 0)
      });
    });

    var productOpts = [];
    try {
      productOpts = finRefsCached_(dbId, 'recipes_products', function () {
        /* WC2: recipes target valley_products_no_assets — exclude asset types */
        return getAllRecords_(dbId, FIN_PRODUCTS_SHEET)
          .filter(function (p) { return FIN_SALES_ASSET_TYPES.indexOf(String(p.product_type || '').trim()) === -1; })
          .map(function (p) {
            return { value: p.id, label: String(p.name_ar || ('#' + p.id)) };
          }).filter(function (o) { return String(o.value).trim() !== ''; })
          .sort(function (a, b) { return a.label.localeCompare(b.label, 'ar'); });
      });
    } catch (e) {}

    return {
      status: 'success',
      recipes: recipes,
      steps_by_recipe: stepsByRecipe,
      product_options: productOpts,
      work_center_options: mfgWorkCenterOptions_(dbId)
    };
  }

  function saveValleyMfgRecipe_(data, user, dbId) {
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = !!(d.unique_id && String(d.unique_id).trim());
    /* POLICY: add = page-write authority; EDIT existing = super admin only. */
    if (editing && !isSuperAdmin) throw new Error('تعديل الوصفات الموجودة من صلاحيات مدير النظام فقط');

    var name = String(d.recipe_name || '').trim();
    if (!name) throw new Error('اسم الوصفة مطلوب');
    var producedPid = String(d.produced_product_id || '').trim();
    if (!producedPid) throw new Error('المنتج المنتج مطلوب');
    var yieldQty = Number(d.yield_qty);
    if (!isFinite(yieldQty) || yieldQty <= 0) throw new Error('كمية الإنتاج المتوقعة يجب أن تكون أكبر من صفر');
    var steps = Array.isArray(d.steps) ? d.steps.filter(function (s) { return s && (String(s.raw_material_id || '').trim() || String(s.step_name || '').trim()); }) : [];
    if (!steps.length) throw new Error('أضف خطوة واحدة على الأقل تحتوي الخامة المستهلكة');

    settingsEnsureSheet_(dbId, MFG_RECIPE_SHEET, MFG_RECIPE_HEADERS);
    settingsEnsureSheet_(dbId, MFG_RECIPE_FOOTER_SHEET, MFG_RECIPE_STEP_HEADERS);
    var sheet = getSheet_(MFG_RECIPE_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, MFG_RECIPE_SHEET);

    for (var i = 0; i < rows.length; i++) {
      var sameName = String(rows[i].recipe_name || '').trim().toLowerCase() === name.toLowerCase();
      var sameRow = editing && String(rows[i].unique_id) === String(d.unique_id);
      if (sameName && !sameRow) throw new Error('يوجد وصفة بنفس الاسم بالفعل');
    }

    var producedName = '';
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).some(function (p) {
        if (String(p.id) === producedPid) { producedName = String(p.name_ar || ''); return true; }
        return false;
      });
    } catch (e) {}

    executeWithLock_(function () {
      var uid;
      var seqNum;
      if (editing) {
        uid = String(d.unique_id).trim();
        seqNum = null;
        var foundRow = null;
        rows.forEach(function (r, ri2) { if (String(r.unique_id) === uid) foundRow = ri2 + 2; });
        if (!foundRow) throw new Error('الوصفة غير موجودة');
        updateRowByCriteria_(sheet, 'unique_id', uid, {
          recipe_name: name,
          produced_product_id: producedPid,
          produced_product_name: producedName,
          yield_qty: yieldQty,
          is_active: !(d.is_active === false || String(d.is_active).toLowerCase() === 'false'),
          notes: String(d.notes || '').trim(),
          user: (user && user.email) || ''
        });
      } else {
        /* M5: canonical counter */
        seqNum = getNextId_(dbId, MFG_RECIPE_SHEET, 'id');
        uid = Utilities.getUuid();
        var map = {};
        map['unique_id'] = uid;
        map['id'] = seqNum;
        map['recipe_code'] = 'BOM-' + seqNum + '-' + producedPid;
        map['recipe_name'] = name;
        map['produced_product_id'] = producedPid;
        map['produced_product_name'] = producedName;
        map['yield_qty'] = yieldQty;
        map['is_active'] = true;
        map['notes'] = String(d.notes || '').trim();
        map['user'] = (user && user.email) || '';
        map['created_at'] = new Date();
        settingsInsertRow_(sheet, headers, map);
      }

      /* rewrite steps */
      var sheetSteps = getSheet_(MFG_RECIPE_FOOTER_SHEET, dbId);
      deleteRowsByCriteria_(sheetSteps, 'valley_product_recipe_id', uid);
      var stepHeaders = getHeaders_(sheetSteps);
      var startRow = sheetSteps.getLastRow() + 1;
      var stepRows = steps.map(function (s, si) {
        var wcLabel = '';
        try {
          mfgWorkCenterOptions_(dbId).some(function (o) {
            if (String(o.value) === String(s.work_center_id || '')) { wcLabel = o.label; return true; }
            return false;
          });
        } catch (e) {}
        var m5 = {};
        m5['unique_id'] = Utilities.getUuid();
        m5['valley_product_recipe_id'] = uid;
        m5['sequence'] = si + 1;
        m5['step_name'] = String(s.step_name || '').trim();
        m5['work_center_id'] = s.work_center_id ? String(s.work_center_id) : '';
        m5['work_center_name'] = wcLabel;
        m5['raw_material_id'] = String(s.raw_material_id || '').trim();
        var rmName = '';
        try {
          getAllRecords_(dbId, FIN_PRODUCTS_SHEET).some(function (p) {
            if (String(p.id) === String(s.raw_material_id || '')) { rmName = String(p.name_ar || ''); return true; }
            return false;
          });
        } catch (e2) {}
        m5['raw_material_name'] = rmName;
        m5['required_qty'] = Number(s.required_qty || 0);
        m5['loss_percentage'] = Number(s.loss_percentage || 0);
        m5['is_active'] = true;
        m5['notes'] = String(s.notes || '').trim();
        m5['user'] = (user && user.email) || '';
        m5['created_at'] = new Date();
        return stepHeaders.map(function (h) {
          var k = String(h).trim();
          return m5[k] !== undefined ? m5[k] : '';
        });
      });
      sheetSteps.getRange(startRow, 1, stepRows.length, stepHeaders.length).setValues(stepRows);
      var _recMap = editing ? { unique_id: uid, recipe_name: name, produced_product_id: producedPid, yield_qty: yieldQty } : { unique_id: uid, recipe_name: name, produced_product_id: producedPid, yield_qty: yieldQty };
      var _oldRec = editing ? (rows.find(function(r){ return String(r.unique_id)===String(uid); }) || null) : null;
      try{ logHistory_(dbId, MFG_RECIPE_SHEET, _oldRec&&_oldRec.record_uid ? _oldRec.record_uid : ((editing ? 'update_' : 'create_')+MFG_RECIPE_SHEET+'_'+uid), uid, (user&&user.email)||'', editing ? 'update' : 'create', _recMap, _oldRec) }catch(e){}
    });

    return { status: 'success', message: editing ? 'تم تحديث الوصفة' : 'تمت إضافة الوصفة' };
  }

  /* ---------- CASH / BANK MOVEMENTS (valley_cash_bank_movement) ----------
   * Schema recovered verbatim from the AppSheet legacy design. Computed
   * columns (net_amount/total/balance_amount/Month/Year) are written as LIVE
   * sheet formulas — same convention as AppSheet and TL's setCashFormulas_ —
   * so Sheets-side reports stay dynamic. IDs via getNextId_ (canonical). */
  const FIN_CASH_SHEET = 'valley_cash_bank_movement';
  const FIN_BOXES_SHEET = 'valley_box_account_codes';

  const FIN_CASH_TYPES = ['Credit', 'Debit', 'Credit Note', 'Debit Note'];
  const FIN_CASH_METHODS = ['Cash', 'Bank Transfer', 'Bank Withdrawl', 'Bank Deposit', 'Instapay'];
  const FIN_PURCHASE_ITEMS_SEED = ['شاي', 'سكر', 'قهوة'];

  /* Box registry: stored key = «المستوى الخامس» (id fallback), label = «اسم المستوى الخامس».
   * altKeys keeps legacy-id → level5 mapping so old rows still resolve. */
  function finBoxMap_(dbId) {
    var byKey = {}, altKeys = {};
    try {
      getAllRecords_(dbId, FIN_BOXES_SHEET).forEach(function (b) {
        var lvl5 = b['المستوى الخامس'] != null && String(b['المستوى الخامس']).trim() !== '' ? String(b['المستوى الخامس']).trim() : '';
        var idv = b.id != null ? String(b.id).trim() : '';
        var nm = String(b['اسم المستوى الخامس'] || b.box_name || b.name || lvl5 || idv);
        var key = lvl5 || idv;
        if (!key) return;
        byKey[key] = nm;
        if (lvl5 && idv && idv !== lvl5) altKeys[idv] = key;
      });
    } catch (e) {}
    return { byKey: byKey, altKeys: altKeys };
  }
  function finResolveBoxKey_(boxMap, rawValue) {
    var v = String(rawValue == null ? '' : rawValue).trim();
    if (!v) return '';
    return boxMap.altKeys[v] || v;
  }

  /* كود الدليل المحاسبي options: label = «كود المستوى»,
   * stored value = «المستوى الخامس», range 311100..421300. */
  function buildCashChartOptions_(dbId) {
    return getAllRecords_(dbId, FIN_CHART_SHEET).map(function (r) {
      var lvl5 = Number(r['المستوى الخامس']);
      var code = r['كود المستوى'];
      if (!Number.isInteger(lvl5) || lvl5 < 311100 || lvl5 > 421300) return null;
      return { value: lvl5, label: String(code != null && code !== '' ? code : lvl5) };
    }).filter(Boolean);
  }

  function getValleyCash_(data, user, dbId) {
    settingsEnsureSheet_(dbId, FIN_CASH_SHEET,
      ['transaction_id','invoice_id','name','name_vendor','transaction_purchasing_items','transaction_details','transaction_date','transaction_amount','total_discount','net_amount','taxes','total','transaction_type','balance_amount','box_balance','related_box','chart_code','chart_name','transaction_method','tax_system','chart_account_main','approved','user','created_at','Temp_Target_Box']);

    var allRows = getAllRecords_(dbId, FIN_CASH_SHEET);
    var partyNames = {};
    try {
      getAllRecords_(dbId, FIN_PARTIES_SHEET).forEach(function (p) {
        partyNames[String(p.id)] = String(p.name || p.id);
      });
    } catch (e) {}
    var boxMapRaw = finBoxMap_(dbId);
    var boxMap = boxMapRaw;
    try {
      boxMap = finRefsCached_(dbId, 'boxes', function () {
        var m = finBoxMap_(dbId);
        return { byKey: m.byKey, altKeys: m.altKeys };
      });
    } catch (e3) {}
    var boxNames = boxMap.byKey;

    /* BOXES: global SUM(balance_amount) over full ledger — never filtered/bounded/capped */
    var boxBalances = {};
    allRows.forEach(function (r) {
      var boxKey = finResolveBoxKey_(boxMap, r.related_box);
      if (!boxKey) return;
      if (!boxBalances[boxKey]) boxBalances[boxKey] = 0;
      boxBalances[boxKey] += Number(r.balance_amount) || Number(r.total) || 0;
    });
    var boxes = Object.keys(boxBalances).map(function (k) {
      return { box: k, name: boxNames[k] || k, balance: boxBalances[k] };
    });

    /* ROWS: bounded/filtered slice only for the list view (search must not affect BOXES) */
    var rows = vfBoundRows_(allRows, data, 'transaction_date');
    /* Cap payload: newest 2,000 movements for the list view */
    if (rows.length > 2000) {
      rows.sort(function (a, b) { return Number(b.transaction_id || 0) - Number(a.transaction_id || 0); });
      rows = rows.slice(0, 2000);
    }

    /* Purchasing-items suggestions: seeds + distinct values already in data */
    var itemSet = {};
    FIN_PURCHASE_ITEMS_SEED.forEach(function (v) { itemSet[v] = true; });
    rows.forEach(function (r) {
      String(r.transaction_purchasing_items || '').split(',').forEach(function (v) {
        v = v.trim();
        if (v) itemSet[v] = true;
      });
    });

    var chartOptions = [];
    try {
      chartOptions = finRefsCached_(dbId, 'chart_cash', function () {
        return buildCashChartOptions_(dbId);
      });
    } catch (e4) {}

    rows.sort(function (a, b) { return Number(b.transaction_id || 0) - Number(a.transaction_id || 0); });
    rows.forEach(function (r) {
      r.approved_bool = !(r.approved === false || String(r.approved).toLowerCase() === 'no' || r.approved === '');
      var boxKey = finResolveBoxKey_(boxMap, r.related_box);
      r.box_name = boxNames[boxKey] || (r.related_box || '-');
    });

    var nextId = 1;
    rows.forEach(function (r) {
      var n = Number(r.transaction_id);
      if (Number.isInteger(n) && n >= nextId) nextId = n + 1;
    });

    /* Slim payload: only fields the page displays/edits + edit-date value. */
    var partyOpts = finRefsCached_(dbId, 'parties', function () {
      return getAllRecords_(dbId, FIN_PARTIES_SHEET).map(function (p) {
        return { value: p.id, label: String(p.name || p.id) };
      }).filter(function (o) { return String(o.value).trim() !== ''; });
    });

    var slimHeaders = rows.map(function (r) {
      var d = r.transaction_date ? new Date(r.transaction_date) : null;
      return {
        transaction_id: r.transaction_id,
        date_display: (d && !isNaN(d.getTime())) ? pad2_(d.getDate()) + '/' + pad2_(d.getMonth() + 1) + '/' + d.getFullYear() : '-',
        date_edit: (d && !isNaN(d.getTime())) ? d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate()) : '',
        party_name: partyNames[String(r.name)] || '',
        name_vendor: r.name_vendor || '',
        transaction_details: r.transaction_details || '',
        transaction_type: r.transaction_type,
        transaction_method: r.transaction_method || '',
        transaction_amount: r.transaction_amount,
        total_discount: r.total_discount != null ? r.total_discount : '',
        taxes: r.taxes != null ? r.taxes : '',
        related_box: finResolveBoxKey_(boxMap, r.related_box),
        box_name: boxNames[finResolveBoxKey_(boxMap, r.related_box)] || '',
        chart_code: r.chart_code != null ? r.chart_code : '',
        chart_name: r.chart_name || '',
        tax_system_bool: !(r.tax_system === false || String(r.tax_system).toLowerCase() === 'no' || r.tax_system === ''),
        approved_bool: !(r.approved === false || String(r.approved).toLowerCase() === 'no' || r.approved === '')
      };
    });

    var cashPage = vfPage_(slimHeaders, data, 'transaction_date');
    return {
      status: 'success',
      headers: cashPage.rows,
      total: cashPage.total,
      boxes: boxes,
      next_id: nextId,
      enums: { transaction_type: FIN_CASH_TYPES, transaction_method: FIN_CASH_METHODS },
      item_suggestions: Object.keys(itemSet),
      party_options: partyOpts,
      box_options: Object.keys(boxNames).map(function (k) {
        return { value: k, label: boxNames[k] };
      }),
      chart_options: chartOptions
    };
  }

  function saveValleyCash_(data, user, dbId) {
    finBustRefs_(dbId);

    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = d.transaction_id !== '' && d.transaction_id !== null && d.transaction_id !== undefined;
    /* POLICY: add = page-write authority; EDIT existing = super admin only. */
    if (editing && !isSuperAdmin) throw new Error('تعديل الحركات الموجودة من صلاحيات مدير النظام فقط');

    /* ALL entry fields are mandatory except optional extras. */
    if (!d.transaction_date) throw new Error('تاريخ الحركة مطلوب');
    var type = String(d.transaction_type || '').trim();
    if (FIN_CASH_TYPES.indexOf(type) === -1) throw new Error('نوع الحركة مطلوب');
    var method = String(d.transaction_method || '').trim();
    if (FIN_CASH_METHODS.indexOf(method) === -1) throw new Error('طريقة الدفع مطلوبة');
    if (!d.related_box) throw new Error('الصندوق / الحساب البنكي مطلوب');
    var amount = Number(d.transaction_amount);
    if (d.transaction_amount === '' || d.transaction_amount == null || isNaN(amount) || amount <= 0) throw new Error('المبلغ مطلوب ويجب أن يكون أكبر من صفر');
    var discount = Number(d.total_discount || 0);
    if (isNaN(discount) || discount < 0) throw new Error('الخصم يجب أن يكون رقماً');
    if (discount > amount) throw new Error('الخصم لا يمكن أن يتجاوز المبلغ');
    var taxes = Number(d.taxes || 0);
    if (isNaN(taxes) || taxes < 0) throw new Error('الضرائب يجب أن تكون رقماً');
    var partyId = String(d.name || '').trim();
    var vendorName = String(d.name_vendor || '').trim();
    if (!partyId && !vendorName) throw new Error('الطرف (عميل/مورد) أو اسم المورد مطلوب');
    var chartCode = String(d.chart_code || '').trim();
    if (chartCode) {
      try {
        var chartOk = getAllRecords_(dbId, FIN_CHART_SHEET).some(function (r) {
          var lvl5 = Number(r['المستوى الخامس']);
          return String(lvl5) === chartCode && lvl5 >= 311100 && lvl5 <= 421300;
        });
        if (!chartOk) throw new Error('x');
      } catch (eChart) {
        throw new Error('كود الدليل المحاسبي غير موجود ضمن النطاق (311100 - 421300)');
      }
    }

    settingsEnsureSheet_(dbId, FIN_CASH_SHEET,
      ['transaction_id','invoice_id','name','name_vendor','transaction_purchasing_items','transaction_details','transaction_date','transaction_amount','total_discount','net_amount','taxes','total','transaction_type','balance_amount','box_balance','related_box','chart_code','chart_name','transaction_method','tax_system','chart_account_main','approved','user','created_at','Temp_Target_Box']);
    var sheet = getSheet_(FIN_CASH_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, FIN_CASH_SHEET);

    var dateVal = parseDate_(d.transaction_date);

    function buildValues(tid) {
      var rowNumber = sheet.getLastRow() + 1;
      var map = {};
      map['transaction_id'] = tid;
      map['invoice_id'] = String(d.invoice_id || '').trim();
      map['name'] = partyId ? Number(partyId) : '';
      map['name_vendor'] = vendorName;
      map['transaction_purchasing_items'] = String(d.transaction_purchasing_items || '').trim();
      map['transaction_details'] = String(d.transaction_details || '').trim();
      map['transaction_date'] = dateVal;
      map['transaction_amount'] = amount;
      map['total_discount'] = discount;
      map['taxes'] = taxes;
      map['transaction_type'] = type;
      map['related_box'] = d.related_box;
      map['chart_code'] = d.chart_code ? d.chart_code : '';
      map['chart_name'] = String(d.chart_name || '').trim();
      map['transaction_method'] = method;
      map['tax_system'] = !!(d.tax_system === true || d.tax_system === 'true' || d.tax_system === 'Yes');
      map['approved'] = false;
      map['user'] = (user && user.email) || '';
      map['created_at'] = new Date();
      var values = headers.map(function (h) {
        var k = String(h).trim().toLowerCase();
        return map[k] !== undefined ? map[k] : '';
      });
      return { values: values, rowNumber: rowNumber, map: map };
    }


    /* Positional formula writer (column letters fixed by canonical layout):
     * H=amount, I=discount, J=net_amount, K=taxes, L=total,
     * M=type, N=balance_amount, G=date, AA=Month, AB=Year */
    function setComputedFormulas_(rowNumber) {
      sheet.getRange(rowNumber, 10).setValue('=H' + rowNumber + '-I' + rowNumber);           // net_amount
      sheet.getRange(rowNumber, 12).setValue('=J' + rowNumber + '+K' + rowNumber);           // total
      sheet.getRange(rowNumber, 14).setValue(                                                 // balance_amount
        '=IFS(M' + rowNumber + '="Credit Note",L' + rowNumber + '*-1,M' + rowNumber + '="Credit",L' + rowNumber + '*-1,TRUE,L' + rowNumber + ')');
      sheet.getRange(rowNumber, 27).setValue('=MONTH(G' + rowNumber + ')');                   // Month
      sheet.getRange(rowNumber, 28).setValue('=YEAR(G' + rowNumber + ')');                    // Year
    }

      if (editing) {
      var tidEdit = Number(d.transaction_id);
      var exists = rows.some(function (r) { return Number(r.transaction_id) === tidEdit; });
      if (!exists) throw new Error('الحركة غير موجودة');
      var editMap = {
        invoice_id: String(d.invoice_id || '').trim(),
        name: partyId ? Number(partyId) : '',
        name_vendor: vendorName,
        transaction_purchasing_items: String(d.transaction_purchasing_items || '').trim(),
        transaction_details: String(d.transaction_details || '').trim(),
        transaction_date: dateVal,
        transaction_amount: amount,
        total_discount: discount,
        taxes: taxes,
        transaction_type: type,
        related_box: d.related_box,
        chart_code: d.chart_code ? d.chart_code : '',
        chart_name: String(d.chart_name || '').trim(),
        transaction_method: method,
        tax_system: !!(d.tax_system === true || d.tax_system === 'true' || d.tax_system === 'Yes'),
        user: (user && user.email) || ''
      };
      var oldRow = rows.find(function (r) { return Number(r.transaction_id) === tidEdit; }) || null;
      updateRowByCriteria_(sheet, 'transaction_id', tidEdit, editMap);
      var oldUid = oldRow ? (oldRow.record_uid || ('upd_' + FIN_CASH_SHEET + '_' + tidEdit)) : ('upd_' + FIN_CASH_SHEET + '_' + tidEdit);
      logHistory_(dbId, FIN_CASH_SHEET, oldUid, tidEdit, (user && user.email) || '', 'update', Object.assign({}, oldRow || {}, editMap), oldRow);
      var editRowNum = 0;
      var dataAll = sheet.getDataRange().getValues();
      var tidIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'transaction_id'; });
      for (var rr = 1; rr < dataAll.length; rr++) {
        if (Number(dataAll[rr][tidIdx]) === tidEdit) { editRowNum = rr + 1; break; }
      }
      if (editRowNum) setComputedFormulas_(editRowNum);
      return { status: 'success', message: 'تم تحديث الحركة' };
    }

    var nextId = getNextId_(dbId, FIN_CASH_SHEET, 'transaction_id');
    var built = buildValues(nextId);
    var res = saveRecordWithAudit_(dbId, FIN_CASH_SHEET, null, built.map, 'create', (user && user.email) || '', null, null, null, 'transaction_id');
    setComputedFormulas_(res.data.newRowNumber);
    return { status: 'success', message: 'تم تسجيل الحركة (رقم ' + nextId + ')', id: nextId };
  }

  function approveValleyCash_(data, user, dbId) {
    requireSuperAdmin_(user);
    var key = Number((data || {}).transaction_id);
    if (!key) throw new Error('رقم الحركة مطلوب');
    var sheet = getSheet_(FIN_CASH_SHEET, dbId);
    var rows = getAllRecords_(dbId, FIN_CASH_SHEET);
    var row = null;
    rows.forEach(function (r) { if (Number(r.transaction_id) === key) row = r; });
    if (!row) throw new Error('الحركة غير موجودة');
    var isApproved = !(row.approved === false || String(row.approved).toLowerCase() === 'no' || row.approved === '');
    var newValue = !isApproved;
    if (!updateRowByCriteria_(sheet, 'transaction_id', key, { approved: newValue })) throw new Error('تعذر التحديث');
    var oldUid = row ? (row.record_uid || ('upd_' + FIN_CASH_SHEET + '_' + key)) : ('upd_' + FIN_CASH_SHEET + '_' + key);
    logHistory_(dbId, FIN_CASH_SHEET, oldUid, key, (user && user.email) || '', 'approve', { approved: newValue }, row);
    return { status: 'success', message: newValue ? 'تم اعتماد الحركة' : 'تم إلغاء اعتماد الحركة', approved: newValue };
  }

  function deleteValleyCash_(data, user, dbId) {
    requireSuperAdmin_(user);
    var key = Number((data || {}).transaction_id);
    if (!key) throw new Error('رقم الحركة مطلوب');
    var sheet = getSheet_(FIN_CASH_SHEET, dbId);
    var oldRow = getAllRecords_(dbId, FIN_CASH_SHEET).find(function (r) { return Number(r.transaction_id) === key; }) || null;
    var oldUid = oldRow ? (oldRow.record_uid || ('del_' + FIN_CASH_SHEET + '_' + key)) : ('del_' + FIN_CASH_SHEET + '_' + key);
    logHistory_(dbId, FIN_CASH_SHEET, oldUid, key, (user && user.email) || '', 'delete', null, oldRow);
    var deleted = deleteRowsByCriteria_(sheet, 'transaction_id', key);
    if (!deleted) throw new Error('الحركة غير موجودة');
    return { status: 'success', message: 'تم حذف الحركة' };
  }

  function transferValleyCash_(data, user, dbId) {
    finBustRefs_(dbId);

    var d = data || {};
    if (!d.transaction_date) throw new Error('تاريخ التحويل مطلوب');
    var fromBox = String(d.from_box || '').trim();
    var toBox = String(d.to_box || '').trim();
    if (!fromBox || !toBox) throw new Error('الصندوقان مطلوبان');
    if (fromBox === toBox) throw new Error('لا يمكن التحويل إلى نفس الصندوق');
    var amount = Number(d.amount);
    if (d.amount === '' || d.amount == null || isNaN(amount) || amount <= 0) throw new Error('المبلغ مطلوب ويجب أن يكون أكبر من صفر');
    var details = String(d.details || '').trim();

    settingsEnsureSheet_(dbId, FIN_CASH_SHEET,
      ['transaction_id','invoice_id','name','name_vendor','transaction_purchasing_items','transaction_details','transaction_date','transaction_amount','total_discount','net_amount','taxes','total','transaction_type','balance_amount','box_balance','related_box','chart_code','chart_name','transaction_method','tax_system','chart_account_main','approved','user','created_at','Temp_Target_Box']);
    var sheet = getSheet_(FIN_CASH_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var boxMap = finBoxMap_(dbId);
    var boxNames = boxMap.byKey;
    var dateVal = parseDate_(d.transaction_date);
    var email = (user && user.email) || '';

     function appendTransferRow(tid, type, box, target, desc) {
      var map = {};
      map['transaction_id'] = tid;
      map['transaction_details'] = desc;
      map['transaction_date'] = dateVal;
      map['transaction_amount'] = amount;
      map['transaction_type'] = type;
      map['related_box'] = box;
      map['Temp_Target_Box'] = target;
      map['transaction_method'] = String(d.method || 'Cash').trim() || 'Cash';
      map['approved'] = true;
      map['user'] = email;
      map['created_at'] = new Date();
      var values = headers.map(function (h) {
        var k = String(h).trim().toLowerCase();
        return map[k] !== undefined ? map[k] : '';
      });
      var rowNum = sheet.getLastRow() + 1;
      sheet.appendRow(values);
      sheet.getRange(rowNum, 10).setValue('=H' + rowNum + '-I' + rowNum);
      sheet.getRange(rowNum, 12).setValue('=J' + rowNum + '+K' + rowNum);
      sheet.getRange(rowNum, 14).setValue(
        '=IFS(M' + rowNum + '="Credit Note",L' + rowNum + '*-1,M' + rowNum + '="Credit",L' + rowNum + '*-1,TRUE,L' + rowNum + ')');
      sheet.getRange(rowNum, 27).setValue('=MONTH(G' + rowNum + ')');
      sheet.getRange(rowNum, 28).setValue('=YEAR(G' + rowNum + ')');
      try{ logHistory_(dbId, FIN_CASH_SHEET, map.record_uid || ('create_'+FIN_CASH_SHEET+'_'+tid), tid, (user&&user.email)||'', 'create', map, null) }catch(e){}
    }

    executeWithLock_(function () {
      var outId = getNextIdUnderLock_(dbId, FIN_CASH_SHEET, 'transaction_id');
      appendTransferRow(outId, 'Credit', fromBox, toBox, 'تحويل صادر إلى ' + (boxNames[toBox] || toBox) + (details ? ' - ' + details : ''));
      var inId = getNextIdUnderLock_(dbId, FIN_CASH_SHEET, 'transaction_id');
      appendTransferRow(inId, 'Debit', toBox, fromBox, 'تحويل وارد من ' + (boxNames[fromBox] || fromBox) + (details ? ' - ' + details : ''));
    });

    return { status: 'success', message: 'تم تنفيذ التحويل بين الصندوقين' };
  }

  /* ---------- SALES INVOICES (valley_sales_invoices + lines) ----------
   * Schema recovered verbatim from the AppSheet legacy design.
   * Numbering: (count same-year same-tax_system) + 1 & "-" & year, under lock.
   * Header totals computed from lines (single source of truth). */
  const FIN_SALES_INV_SHEET = 'valley_sales_invoices';
  const FIN_SALES_LINES_SHEET = 'valley_sales_products';
  const FIN_SALES_ASSET_TYPES = ['الاصول الغير متداولة', 'الاصول متداولة'];

  const FIN_SALES_INV_HEADERS = ['invoice_unique_id','ميزان حسابي - 26 - 1','نوع الضريبة (سلع عامة 1/سلع جدول 2)','نوع سلع الجدول (لايوجد 0/جدول أولا 1/جدول ثانيا 2)','رقم الفاتورة','اسم العميل','رقم التسجيل الضريبي للعميل','رقم الملف الضريبي للعميل','العنوان','الرقم القومي / رقم جواز السفر','رقم الموبيل','تاريخ الفاتورة','نوع البيان (سلعة 3/خدمة 4/تسويات 5)','نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7)','المبلغ الصافي','قيمة الضريبة','إجمالي','الشهر','العام','tax_system','user','created_at','approval_status','approval','approval_time','invoice_label','unique_id'];
  const FIN_SALES_LINE_HEADERS = ['unique_id','id','valley_sales_header_id','product_id','product_details','product_tax','product_qty','product_price','product_net_value','product_tax_value','product_total_value','user','created_at'];

  const FIN_CLASS_TAX = [{ value: 1, label: 'سلع عامة' }, { value: 2, label: 'سلع جدول' }];
  const FIN_CLASS_SCHEDULE = [{ value: 0, label: 'لا يوجد' }, { value: 1, label: 'جدول أولا' }, { value: 2, label: 'جدول ثانيا' }];
  const FIN_CLASS_STATEMENT = [{ value: 3, label: 'سلعة' }, { value: 4, label: 'خدمة' }, { value: 5, label: 'تسويات' }];
  const FIN_CLASS_GOODS = [{ value: 1, label: 'محلي' }, { value: 2, label: 'صادرات' }, { value: 5, label: 'آلات ومعدات' }, { value: 6, label: 'أجزاء آلات' }, { value: 7, label: 'إعفاءات' }];
  const FIN_SALES_TAX_LINE = [0, 0.05, 0.14];

  function sellableProducts_(dbId) {
    var opts = [];
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
        if (FIN_SALES_ASSET_TYPES.indexOf(String(p.product_type || '').trim()) !== -1) return;
        if (!String(p.name_ar || '').trim() && !String(p.id).trim()) return;
        opts.push({ value: p.id, label: String(p.name_ar || ('#' + p.id)) });
      });
    } catch (e) {}
    return opts.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
  }

  function getValleySalesBootstrap_(data, user, dbId) {
    var partyOpts = finRefsCached_(dbId, 'parties', function () {
      return getAllRecords_(dbId, FIN_PARTIES_SHEET).map(function (p) {
        return {
          value: p.id,
          label: String(p.name || p.id),
          tax_id: p.tax_id != null ? p.tax_id : '',
          address: p.address || '',
          phone: p.telephone || ''
        };
      }).filter(function (o) { return String(o.value).trim() !== ''; });
    });
    return {
      status: 'success',
      parties: partyOpts,
      products: sellableProducts_(dbId),
      enums: {
        class_tax: FIN_CLASS_TAX,
        class_schedule: FIN_CLASS_SCHEDULE,
        class_statement: FIN_CLASS_STATEMENT,
        class_goods: FIN_CLASS_GOODS,
        line_tax: FIN_SALES_TAX_LINE
      }
    };
  }

  function getValleyInvoiceLines_(data, user, dbId) {
    var invUid = String((data && data.invoice_unique_id) || '').trim();
    if (!invUid) throw new Error('معرّف الفاتورة مطلوب');
    var lines = safeRows_(dbId, FIN_SALES_LINES_SHEET).filter(function (l) {
      return String(l.valley_sales_header_id || '').trim() === invUid;
    }).map(function (l) {
      return {
        unique_id: l.unique_id,
        product_id: l.product_id != null ? l.product_id : '',
        product_name: '',
        product_details: l.product_details || '',
        product_tax: Number(l.product_tax || 0),
        product_qty: Number(l.product_qty || 0),
        product_price: Number(l.product_price || 0)
      };
    });
    var nameMap = {};
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
        nameMap[String(p.id)] = String(p.name_ar || '');
      });
    } catch (e) {}
    lines.forEach(function (l) { l.product_name = nameMap[l.product_id] || l.product_id; });
    return { status: 'success', lines: lines };
  }
  function safeRows_(dbId, FIN_SALES_LINES_SHEET) {
    try { return getAllRecords_(dbId, FIN_SALES_LINES_SHEET); } catch (e) { return []; }
  }

  /* ---------- P2: batch availability for a product ----------
   * available(batch) = current_qty − Σ(sale allocations) + Σ(return restorations)
   * excludeInvoiceUid removes the edited invoice's own allocations so they
   * don't count against re-editing. */
  function getValleyProductBatches_(data, user, dbId) {
    var pid = String((data && data.product_id) || '').trim();
    if (!pid) throw new Error('معرّف المنتج مطلوب');
    var excludeInv = String((data && data.exclude_invoice_unique_id) || '').trim();
    var _bCacheKey = 'vfbatch_' + String(dbId) + '_' + pid + '_' + (excludeInv || 'x');
    try {
      var _bc = CacheService.getScriptCache().get(_bCacheKey);
      if (_bc) return JSON.parse(_bc);
    } catch (e0) {}

    var batches = {};
    try {
      getAllRecords_(dbId, 'valley_current_products').forEach(function (r) {
        if (String(r.product_id || '').trim() !== pid) return;
        var uid = String(r.unique_id || '').trim();
        if (!uid) return;
        batches[uid] = {
          batch_uid: uid,
          lot: String(r.transaction_code || '-'),
          current_qty: Number(r.current_qty) || 0,
          unit_cost: Number(r.unit_cost) || 0,
          transaction_date: r.transaction_date || '',
          unit: String(r.unit || ''),
          used: 0,
          restored: 0
        };
      });
    } catch (e) {}

    /* line unique_id → invoice uid (to skip edited invoice's own allocations) */
    var lineToInv = {};
    try {
      getAllRecords_(dbId, FIN_SALES_LINES_SHEET).forEach(function (l) {
        var lu = String(l.unique_id || '').trim();
        if (lu) lineToInv[lu] = String(l.valley_sales_header_id || '').trim();
      });
    } catch (e) {}

    try {
      getAllRecords_(dbId, 'valley_sales_product_stock').forEach(function (a) {
        var buid = String(a.product_unique_id || '').trim();
        if (!batches[buid]) return;
        var lineUid = String(a.valley_sales_products_id || '').trim();
        if (excludeInv && lineToInv[lineUid] === excludeInv) return;
        batches[buid].used += Number(a.product_qty || 0);
      });
    } catch (e) {}

    /* returns restore quantities back to the original allocation's batch */
    try {
      var allocToBatch = {};
      getAllRecords_(dbId, 'valley_sales_product_stock').forEach(function (a) {
        allocToBatch[String(a.unique_id || '').trim()] = String(a.product_unique_id || '').trim();
      });
      getAllRecords_(dbId, 'valley_sales_returns_stock').forEach(function (rs) {
        var buid = allocToBatch[String(rs.product_unique_id || '').trim()];
        var qty = Number(rs.product_qty || 0);
        if (qty && batches[buid]) batches[buid].restored += qty;
      });
    } catch (e) {}

    var list = Object.keys(batches).map(function (k) { return batches[k]; }).filter(function (b) { return b.current_qty > 0; });
    list.forEach(function (b) { b.available = Math.max(0, b.current_qty - b.used + b.restored); });
    /* order oldest-first by transaction_date */
    list.sort(function (a, b) {
      var da = a.transaction_date ? new Date(a.transaction_date).getTime() : 0;
      var db = b.transaction_date ? new Date(b.transaction_date).getTime() : 0;
      return da - db;
    });

    return { status: 'success', product_id: pid, batches: list };
  }

  /* Batch 5: incremental, persisted invoice sequence counter keyed by
   * dbId + fiscal year + tax_system. Seeded once from the sheet's current max
   * (the old lock-held full scan), then incremented atomically in
   * PropertiesService. MUST be called while already holding executeWithLock_. */
  function nextInvoiceSeq_(dbId, year, taxSystem) {
    var props = PropertiesService.getScriptProperties();
    var key = 'vf_inv_seq_' + String(dbId) + '_' + year + '_' + (taxSystem ? '1' : '0');
    var cur = Number(props.getProperty(key));
    if (!cur || cur <= 0) {
      var sheetInv = getSheet_(FIN_SALES_INV_SHEET, dbId);
      var invHeaders = getHeaders_(sheetInv);
      var dataAll = sheetInv.getDataRange().getValues();
      var numIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'رقم الفاتورة'; });
      var dateIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'تاريخ الفاتورة'; });
      var tsIdx = invHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'tax_system'; });
      var maxSeq = 0;
      for (var r = 1; r < dataAll.length; r++) {
        var rowDate = dataAll[r][dateIdx] ? new Date(dataAll[r][dateIdx]) : null;
        var sameYear = rowDate && !isNaN(rowDate.getTime()) && rowDate.getFullYear() === year;
        var sameTs = String(dataAll[r][tsIdx]).trim().toLowerCase() === String(taxSystem);
        if (!(sameYear && sameTs)) continue;
        var n2 = parseInt(String(dataAll[r][numIdx] || '').split('-')[0], 10);
        if (!isNaN(n2) && n2 > maxSeq) maxSeq = n2;
      }
      cur = maxSeq;
    }
    var next = cur + 1;
    props.setProperty(key, String(next));
    return next;
  }

  function saveValleyInvoice_(data, user, dbId) {
    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = !!(d.invoice_unique_id && String(d.invoice_unique_id).trim());
    /* POLICY: add = page-write authority; EDIT existing = super admin only. */
    if (editing && !isSuperAdmin) throw new Error('تعديل الفواتير الموجودة من صلاحيات مدير النظام فقط');

    /* ALL header fields are mandatory. */
    var partyId = String(d.party || '').trim();
    if (!partyId) throw new Error('العميل مطلوب');
    if (!d.date) throw new Error('تاريخ الفاتورة مطلوب');
    var invDate = parseDate_(d.date);
    if (!invDate) throw new Error('تاريخ الفاتورة غير صالح');
    var classTax = Number(d.class_tax);
    if ([1, 2].indexOf(classTax) === -1) throw new Error('نوع الضريبة مطلوب');
    var classSchedule = Number(d.class_schedule);
    if ([0, 1, 2].indexOf(classSchedule) === -1) throw new Error('نوع سلع الجدول مطلوب');
    var classStatement = Number(d.class_statement);
    if ([3, 4, 5].indexOf(classStatement) === -1) throw new Error('نوع البيان مطلوب');
    var classGoods = Number(d.class_goods);
    if ([1, 2, 5, 6, 7].indexOf(classGoods) === -1) throw new Error('نوع السلعة مطلوب');
    var taxSystem = !!(d.tax_system === true || d.tax_system === 'true');

    var lines = Array.isArray(d.lines) ? d.lines : [];
    if (!lines.length) throw new Error('أضف بنداً واحداً على الأقل للفاتورة');

    settingsEnsureSheet_(dbId, FIN_SALES_INV_SHEET, FIN_SALES_INV_HEADERS);
    settingsEnsureSheet_(dbId, FIN_SALES_LINES_SHEET, FIN_SALES_LINE_HEADERS);

    var partyName = '';
    vfRefsCached_(dbId, 'parties_raw', function () { return getAllRecords_(dbId, FIN_PARTIES_SHEET); }).forEach(function (p) {
      if (String(p.id) === partyId) partyName = String(p.name || partyId);
    });

    var net = 0, taxVal = 0;
    var cleanLines = [];
    var prodIds = {};
    try {
      vfRefsCached_(dbId, 'products_raw', function () { return getAllRecords_(dbId, FIN_PRODUCTS_SHEET); }).forEach(function (p) { prodIds[String(p.id)] = true; });
    } catch (e) {}
    lines.forEach(function (ln, idx) {
      var pid = String(ln.product_id || '').trim();
      if (!pid || !prodIds[pid]) throw new Error('البند ' + (idx + 1) + ': اختر منتجاً صحيحاً');
      var qty = Number(ln.qty);
      if (!isFinite(qty) || qty <= 0) throw new Error('البند ' + (idx + 1) + ': الكمية يجب أن تكون أكبر من صفر');
      var price = Number(ln.price);
      if (!isFinite(price) || price < 0) throw new Error('البند ' + (idx + 1) + ': السعر يجب أن يكون رقماً');
      var tax = Number(ln.tax);
      if (FIN_SALES_TAX_LINE.indexOf(tax) === -1) throw new Error('البند ' + (idx + 1) + ': نسبة الضريبة يجب أن تكون إحدى 0، 0.05، 0.14');
      /* No duplicate products: each product may appear only once per invoice (workflow rule, no schema change) */
      for (var ci = 0; ci < cleanLines.length; ci++) {
        var cl = cleanLines[ci];
        if (String(cl.product_id) === pid) {
          throw new Error('المنتج مكرر في أكثر من بند — يمنع الحفظ (المنتج: ' + pid + ')');
        }
      }
      var lineNet = qty * price;
      var lineTaxVal = lineNet * tax;
      net += lineNet;
      taxVal += lineTaxVal;
      cleanLines.push({
        unique_id: (ln.unique_id && String(ln.unique_id).trim()) || Utilities.getUuid(),
        product_id: Number(pid) || pid,
        details: String(ln.details || '').trim(),
        tax: tax,
        qty: qty,
        price: price,
        net: lineNet,
        taxVal: lineTaxVal,
        total: lineNet + lineTaxVal
      });
    });
    var total = net + taxVal;

    /* ---- P2: batch allocations validation ----
     * Each line must fully allocate its qty across that product's batches.
     * Per-batch availability = current_qty − Σ(existing sale allocations)
     * + Σ(return restorations), excluding this invoice's own when editing. */
    var allocByLine = [];
    var batchUsage = {};
    try {
      safeRows_(dbId, FIN_SALES_LINES_SHEET).forEach(function (l) { batchUsage['__line__' + String(l.unique_id||'').trim()] = String(l.valley_sales_header_id || '').trim(); });
    } catch (e0) {}
    var existingAllocToBatch = {};
    var existingAllocQty = {};
    try {
      getAllRecords_(dbId, 'valley_sales_product_stock').forEach(function (a) {
        var au = String(a.unique_id || '').trim();
        existingAllocToBatch[au] = String(a.product_unique_id || '').trim();
        existingAllocQty[au] = Number(a.product_qty || 0);
      });
    } catch (e1) {}
    /* baseline usage excluding edited invoice's own allocations */
    Object.keys(existingAllocToBatch).forEach(function (au) {
      var lineInv = batchUsage['__line__' + au];
      if (editing && lineInv === String(d.invoice_unique_id || '').trim()) return; /* own allocations excluded */
      var bu = existingAllocToBatch[au];
      if (!batchUsage[bu]) batchUsage[bu] = 0;
      batchUsage[bu] += existingAllocQty[au];
    });
    /* returns restore back into availability */
    try {
      getAllRecords_(dbId, 'valley_sales_returns_stock').forEach(function (rs) {
        var au = String(rs.product_unique_id || '').trim();
        var qty = Number(rs.product_qty || 0);
        if (qty && existingAllocToBatch[au]) {
          var bu2 = existingAllocToBatch[au];
          batchUsage[bu2] -= qty;
        }
      });
    } catch (e2b) {}
    /* current quantities per batch for the requested products */
    var requestedProducts = {};
    cleanLines.forEach(function (ln) { requestedProducts[String(ln.product_id)] = true; });
    var batchCurrent = {};
    try {
      getAllRecords_(dbId, 'valley_current_products').forEach(function (r) {
        var p = String(r.product_id || '').trim();
        if (!requestedProducts[p]) return;
        var uid = String(r.unique_id || '').trim();
        if (!uid) return;
        batchCurrent[uid] = { pid: p, lot: String(r.transaction_code || ''), current: Number(r.current_qty) || 0 };
      });
    } catch (e3) {}

    /* No duplicate batches: same batch_uid may not appear in two lines (FIFO per-batch) */
    var seenBatch = {};
    lines.forEach(function (ln) {
      (Array.isArray(ln.allocations) ? ln.allocations : []).forEach(function (a) {
        var buid = String(a.batch_uid || '').trim(); if (!buid) return;
        if (seenBatch[buid]) throw new Error('الدفعة مكررة في أكثر من بند — يمنع الحفظ (الدفعة: ' + (a.lot || buid) + ')');
        seenBatch[buid] = true;
      });
    });

    lines.forEach(function (ln, idx) {
      var als = Array.isArray(ln.allocations) ? ln.allocations : [];
      var sumA = 0;
      als.forEach(function (a) {
        var buid = String(a.batch_uid || '').trim();
        var q = Number(a.qty || 0);
        if (!buid || !batchCurrent[buid]) throw new Error('البند ' + (idx + 1) + ': دفعة غير معروفة للمنتج المختار');
        if (!isFinite(q) || q <= 0) throw new Error('البند ' + (idx + 1) + ': كمية تخصيص الدفعة يجب أن تكون أكبر من صفر');
        sumA += q;
      });
      if (Math.abs(sumA - Number(ln.qty)) > 0.0001) {
        throw new Error('البند ' + (idx + 1) + ': مجموع تخصيص الدفعات (' + sumA + ') لا يساوي الكمية (' + ln.qty + ')');
      }
      var lineCost = 0;
      als.forEach(function (a) {
        var buid = String(a.batch_uid).trim();
        batchUsage[buid] = (batchUsage[buid] || 0) + Number(a.qty);
        if (batchUsage[buid] > (batchCurrent[buid] ? batchCurrent[buid].current : 0) + 0.0001) {
          throw new Error('البند ' + (idx + 1) + ': الكمية المتاحة من الدفعة (' + (batchCurrent[buid] ? batchCurrent[buid].lot : buid) + ') غير كافية');
        }
        a.cost_unit = batchCurrent[buid] ? batchCurrent[buid].unit_cost : 0;
        a.total_cost = Number(a.qty) * a.cost_unit;
        lineCost += a.total_cost;
      });
      ln.line_material_cost = lineCost;
      allocByLine.push({ line_uid: ln.unique_id, allocations: als });
    });

    /* M2: header total_inventory_cost = Σ consumption value */
    var totalInventoryCost = 0;
    cleanLines.forEach(function (ln) { totalInventoryCost += (ln.line_material_cost || 0); });
    /* M3: output costing — simple average across outputs */
    var totalOutQty = 0;
    outputs.forEach(function (o) { totalOutQty += Number(o.qty || 0); });
    var avgCostUnit = totalOutQty > 0 ? totalInventoryCost / totalOutQty : 0;
    outputs.forEach(function (o) {
      o.cost_unit = avgCostUnit;
      o.total_cost = Number(o.qty || 0) * avgCostUnit;
    });

    executeWithLock_(function () {
      var sheetInv = getSheet_(FIN_SALES_INV_SHEET, dbId);
      var invHeaders = getHeaders_(sheetInv);
      var dataAll = sheetInv.getDataRange().getValues();
      var numIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'رقم الفاتورة'; });
      var dateIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'تاريخ الفاتورة'; });
      var tsIdx = invHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'tax_system'; });
      var uidIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'invoice_unique_id'; });

      /* S1: deletion-proof numbering via persisted incremental counter
       * (Batch 5) — replaces the lock-held full-sheet scan with a single
       * PropertiesService read/increment while the script lock is held. */
      var seq = nextInvoiceSeq_(dbId, invDate.getFullYear(), taxSystem);
      var invoiceNumber = seq + '-' + invDate.getFullYear();

      var map = {};
      map['ميزان حسابي - 26 - 1'] = 26;
      map['نوع الضريبة (سلع عامة 1/سلع جدول 2)'] = classTax;
      map['نوع سلع الجدول (لايوجد 0/جدول أولا 1/جدول ثانيا 2)'] = classSchedule;
      map['اسم العميل'] = Number(partyId) || partyId;
      map['تاريخ الفاتورة'] = invDate;
      map['نوع البيان (سلعة 3/خدمة 4/تسويات 5)'] = classStatement;
      map['نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7)'] = classGoods;
      map['المبلغ الصافي'] = net;
      map['قيمة الضريبة'] = taxVal;
      map['إجمالي'] = total;
      map['الشهر'] = invDate.getMonth() + 1;
      map['العام'] = invDate.getFullYear();
      map['tax_system'] = taxSystem;
      map['user'] = (user && user.email) || '';

      var existingUid = editing ? String(d.invoice_unique_id).trim() : '';
      var rowNum = 0;
      var approvalStatusIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'approval_status'; });
      if (editing) {
        for (var r2 = 1; r2 < dataAll.length; r2++) {
          if (String(dataAll[r2][uidIdx]).trim() === existingUid) { rowNum = r2 + 1; break; }
        }
        if (!rowNum) throw new Error('الفاتورة غير موجودة');
        /* S2: approved invoices are immutable — revert to Pending first */
        if (approvalStatusIdx !== -1 && String(dataAll[rowNum - 1][approvalStatusIdx]).trim() === 'Approved') {
          throw new Error('لا يمكن تعديل فاتورة معتمدة — أرجعها لقيد الانتظار أولاً');
        }
        // keep original رقم الفاتورة on edit
        map['رقم الفاتورة'] = dataAll[rowNum - 1][numIdx];
        var rowVals = invHeaders.map(function (h) {
          var k = String(h).trim();
          return map[k] !== undefined ? map[k] : (k === 'invoice_unique_id' ? existingUid : '');
        });
        sheetInv.getRange(rowNum, 1, 1, rowVals.length).setValues([rowVals]);
        try{ var _oldInv = getAllRecords_(dbId, FIN_SALES_INV_SHEET).find(function(r){ return String(r.invoice_unique_id)===String(existingUid); }) || null; if(!_oldInv){ _oldInv={}; invHeaders.forEach(function(h,hi){ _oldInv[String(h).trim()] = dataAll[rowNum-1][hi]; }); } var _newInv = Object.assign({}, _oldInv||{}, map); logHistory_(dbId, FIN_SALES_INV_SHEET, _oldInv&&_oldInv.record_uid ? _oldInv.record_uid : ('update_'+FIN_SALES_INV_SHEET+'_'+existingUid), existingUid, (user&&user.email)||'', 'update', _newInv, _oldInv) }catch(e){}
      } else {
        map['رقم الفاتورة'] = invoiceNumber;
        map['approval_status'] = 'Pending';
        map['invoice_label'] = invoiceNumber + ' - ' + partyName + ' - ' + invDate.toISOString().slice(0, 10) + ' - ' + net;
        var uid = Utilities.getUuid();
        map['invoice_unique_id'] = uid;
        var newRow = invHeaders.map(function (h) {
          var k = String(h).trim();
          return map[k] !== undefined ? map[k] : '';
        });
        sheetInv.appendRow(newRow);
        try{ logHistory_(dbId, FIN_SALES_INV_SHEET, map.record_uid || ('create_'+FIN_SALES_INV_SHEET+'_'+uid), uid, (user&&user.email)||'', 'create', map, null) }catch(e){}
      }

      /* Rewrite lines */
      var sheetLines = getSheet_(FIN_SALES_LINES_SHEET, dbId);
      var lineHeaders = getHeaders_(sheetLines);
      if (editing) deleteRowsByCriteria_(sheetLines, 'valley_sales_header_id', existingUid);
      var startLineRow = sheetLines.getLastRow() + 1;
      var lineRows = cleanLines.map(function (ln, i2) {
        var m2 = {};
        m2['unique_id'] = ln.unique_id;
        m2['id'] = editing ? 0 : i2 + 1;
        m2['valley_sales_header_id'] = editing ? existingUid : uid;
        m2['product_id'] = ln.product_id;
        m2['product_details'] = ln.details;
        m2['product_tax'] = ln.tax;
        m2['product_qty'] = ln.qty;
        m2['product_price'] = ln.price;
        m2['product_net_value'] = ln.net;
        m2['product_tax_value'] = ln.taxVal;
        m2['product_total_value'] = ln.total;
        m2['user'] = (user && user.email) || '';
        m2['created_at'] = new Date();
        return lineHeaders.map(function (h) {
          var k = String(h).trim();
          return m2[k] !== undefined ? m2[k] : '';
        });
      });
      if (lineRows.length) {
        sheetLines.getRange(startLineRow, 1, lineRows.length, lineHeaders.length).setValues(lineRows);
      }

      /* ---- P2: rewrite batch-allocation rows (valley_sales_product_stock) ---- */
      settingsEnsureSheet_(dbId, 'valley_sales_product_stock',
        ['unique_id','id','valley_sales_products_id','product_unique_id','product_transaction_code','product_qty','user','created_at']);
      var allocSheet = getSheet_('valley_sales_product_stock', dbId);
      /* delete previous allocations belonging to this invoice's lines */
      var allocHeaders = getHeaders_(allocSheet);
      var aData = allocSheet.getDataRange().getValues();
      var aLineIdx = allocHeaders.findIndex(function (h) { return String(h).trim() === 'valley_sales_products_id'; });
      var invLineUids = {};
      cleanLines.forEach(function (ln) { invLineUids[ln.unique_id] = true; });
      var toDelete = [];
      for (var ad = aData.length - 1; ad >= 1; ad--) {
        var lu = String(aData[ad][aLineIdx] || '').trim();
        if (lu && invLineUids[lu]) toDelete.push(ad);
      }
      if (toDelete.length) {
        // Collect surviving rows once and rewrite the sheet body in a single
        // setValues() (Batch 4): equivalent to deleting only this invoice's
        // allocation rows, without N individual deleteRow() round trips.
        var newBody = [];
        for (var ad2 = 1; ad2 < aData.length; ad2++) {
          if (toDelete.indexOf(ad2) !== -1) continue;
          newBody.push(aData[ad2]);
        }
        if (newBody.length) {
          allocSheet.getRange(2, 1, newBody.length, allocHeaders.length).setValues(newBody);
          var totalRows = allocSheet.getLastRow();
          if (totalRows > newBody.length + 1) allocSheet.deleteRows(newBody.length + 2, totalRows - (newBody.length + 1));
        } else {
          var totalRows2 = allocSheet.getLastRow();
          if (totalRows2 > 1) allocSheet.deleteRows(2, totalRows2 - 1);
        }
      }
      /* insert fresh allocations */
      var allocStart = allocSheet.getLastRow() + 1;
      var allocRows = [];
      allocByLine.forEach(function (entry) {
        entry.allocations.forEach(function (a) {
          var binfo = batchCurrent[String(a.batch_uid)] || {};
          var m3 = {};
          m3['unique_id'] = Utilities.getUuid();
          m3['valley_sales_products_id'] = entry.line_uid;
          m3['product_unique_id'] = String(a.batch_uid);
          m3['product_transaction_code'] = binfo.lot || '';
          m3['product_qty'] = Number(a.qty);
          m3['user'] = (user && user.email) || '';
          m3['created_at'] = new Date();
          allocRows.push(allocHeaders.map(function (h) {
            var k = String(h).trim();
            return m3[k] !== undefined ? m3[k] : '';
          }));
        });
      });
      if (allocRows.length) {
        allocSheet.getRange(allocStart, 1, allocRows.length, allocHeaders.length).setValues(allocRows);
      }
    });

    finBustRefs_(dbId);
    return { status: 'success', message: editing ? 'تم تحديث الفاتورة' : 'تم إنشاء الفاتورة' };
  }

  function getValleySalesList_(data, user, dbId) {
    settingsEnsureSheet_(dbId, FIN_SALES_INV_SHEET, FIN_SALES_INV_HEADERS);
    var rows = getAllRecords_(dbId, FIN_SALES_INV_SHEET);
    /* Slim + newest-first: only the columns the list displays. */
    var slim = rows.map(function (r) {
      return {
        invoice_unique_id: r.invoice_unique_id,
        'رقم الفاتورة': r['رقم الفاتورة'],
        'اسم العميل': r['اسم العميل'],
        'تاريخ الفاتورة': r['تاريخ الفاتورة'],
        'المبلغ الصافي': Number(r['المبلغ الصافي']) || 0,
        'قيمة الضريبة': Number(r['قيمة الضريبة']) || 0,
        'إجمالي': Number(r['إجمالي']) || 0,
        tax_system: String(r.tax_system || '').trim().toLowerCase(),
        approval_status: r.approval_status || 'Pending'
      };
    }).sort(function (a, b) {
      return (b.date_sort_key || 0) - 0; // placeholder replaced below
    });
    // newest-first by date then numeric id
    slim.forEach(function (s) {
      var d = s['تاريخ الفاتورة'] ? new Date(s['تاريخ الفاتورة']) : null;
      s.date_sort_key = d && !isNaN(d.getTime()) ? d.getTime() : 0;
      var n = parseFloat(String(s['رقم الفاتورة'] || '').split('-')[0]);
      if (!isNaN(n)) s.date_sort_key += n / 100000;
    });
    slim.sort(function (a, b) { return b.date_sort_key - a.date_sort_key; });
    const sp = vfPage_(slim, data, 'تاريخ الفاتورة');
    return { status: 'success', invoices: sp.rows, total: sp.total };
  }

  function getValleySalesPage_(data, user, dbId) {
    const b = getValleySalesBootstrap_(data, user, dbId);
    const l = getValleySalesList_(data, user, dbId);
    return {
      status: 'success',
      parties: b.parties,
      products: b.products,
      enums: b.enums,
      invoices: l.invoices,
      total: l.total
    };
  }

  function getValleyInvoiceFull_(data, user, dbId) {
    var uid = String((data && data.invoice_unique_id) || '').trim();
    if (!uid) throw new Error('معرّف الفاتورة مطلوب');
    var invoice = null;
    var invRow = vfFindRowByUid_(dbId, FIN_SALES_INV_SHEET, 'invoice_unique_id', uid);
    if (invRow) {
      var invSheet = getSheet_(FIN_SALES_INV_SHEET, dbId);
      var invHeaders = getHeaders_(invSheet);
      var invVals = invSheet.getRange(invRow, 1, 1, invSheet.getLastColumn()).getValues()[0];
      invoice = {};
      invHeaders.forEach(function (h, ci) { invoice[String(h).trim()] = invVals[ci]; });
    }
    if (!invoice) throw new Error('الفاتورة غير موجودة');
    var lines = [];
    try {
      getAllRecords_(dbId, FIN_SALES_LINES_SHEET).forEach(function (l) {
        if (String(l.valley_sales_header_id || '').trim() !== uid) return;
        lines.push({
          unique_id: l.unique_id,
          product_id: l.product_id != null ? l.product_id : '',
          product_name: '',
          product_details: l.product_details || '',
          product_tax: Number(l.product_tax || 0),
          product_qty: Number(l.product_qty || 0),
          product_price: Number(l.product_price || 0)
        });
      });
    } catch (e) {}
    var nameMap = {};
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
        nameMap[String(p.id)] = String(p.name_ar || '');
      });
    } catch (e) {}
    lines.forEach(function (l) { l.product_name = nameMap[l.product_id] || ''; });
    /* existing batch allocations per line */
    var allocsByLine = {};
    try {
      getAllRecords_(dbId, 'valley_sales_product_stock').forEach(function (a) {
        var lu = String(a.valley_sales_products_id || '').trim();
        if (!lu) return;
        if (!allocsByLine[lu]) allocsByLine[lu] = [];
        allocsByLine[lu].push({
          alloc_uid: String(a.unique_id || ''),
          batch_uid: String(a.product_unique_id || ''),
          lot: String(a.product_transaction_code || ''),
          qty: Number(a.product_qty || 0)
        });
      });
    } catch (e) {}
    lines.forEach(function (l) {
      l.allocations = allocsByLine[String(l.unique_id)] || [];
    });
    return { status: 'success', invoice: invoice, lines: lines };
  }

  function approveValleyInvoice_(data, user, dbId) {
    requireSuperAdmin_(user);
    var uid = String((data && data.invoice_unique_id) || '').trim();
    if (!uid) throw new Error('معرّف الفاتورة مطلوب');
    var sheet = getSheet_(FIN_SALES_INV_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var stIdx = headers.findIndex(function (h) { return String(h).trim() === 'approval_status'; });
    var apIdx = headers.findIndex(function (h) { return String(h).trim() === 'approval'; });
    var atIdx = headers.findIndex(function (h) { return String(h).trim() === 'approval_time'; });
    var dataAll = sheet.getDataRange().getValues();
    for (var r = 1; r < dataAll.length; r++) {
      if (String(dataAll[r][headers.findIndex(function (h) { return String(h).trim() === 'invoice_unique_id'; })]).trim() === uid) {
        var cur = String(dataAll[r][stIdx]).trim();
        var next = cur === 'Approved' ? 'Pending' : 'Approved';
        var _oldInvA = getAllRecords_(dbId, FIN_SALES_INV_SHEET).find(function(rr){ return String(rr.invoice_unique_id)===String(uid); }) || null;
        sheet.getRange(r + 1, stIdx + 1).setValue(next);
        sheet.getRange(r + 1, apIdx + 1).setValue(next === 'Approved' ? ((user && user.email) || '') : '');
        sheet.getRange(r + 1, atIdx + 1).setValue(next === 'Approved' ? new Date() : '');
        try{ var _newInvA = Object.assign({}, _oldInvA||{}, { approval_status: next, approval: (next==='Approved' ? ((user&&user.email)||'') : ''), approval_time: (next==='Approved' ? new Date() : '') }); logHistory_(dbId, FIN_SALES_INV_SHEET, _oldInvA&&_oldInvA.record_uid ? _oldInvA.record_uid : ('approve_'+FIN_SALES_INV_SHEET+'_'+uid), uid, (user&&user.email)||'', 'approve', _newInvA, _oldInvA) }catch(e){}
        return { status: 'success', message: next === 'Approved' ? 'تم اعتماد الفاتورة' : 'تم إرجاع الفاتورة لقيد الانتظار', approval_status: next };
      }
    }
    throw new Error('الفاتورة غير موجودة');
  }

  function deleteValleyInvoice_(data, user, dbId) {
    requireSuperAdmin_(user);
    var uid = String((data && data.invoice_unique_id) || '').trim();
    if (!uid) throw new Error('معرّف الفاتورة مطلوب');
    /* S2: approved invoices cannot be deleted — revert first (BEFORE deletion) */
    var invRows = getAllRecords_(dbId, FIN_SALES_INV_SHEET);
    for (var vi = 0; vi < invRows.length; vi++) {
      if (String(invRows[vi].invoice_unique_id).trim() === uid && String(invRows[vi].approval_status || '').trim() === 'Approved') {
        throw new Error('لا يمكن حذف فاتورة معتمدة — أرجعها لقيد الانتظار أولاً');
      }
    }
    var _oldDelInv = invRows.find(function(r){ return String(r.invoice_unique_id)===String(uid); }) || null;
    var _oldDelUid = _oldDelInv ? (_oldDelInv.record_uid || ('del_'+FIN_SALES_INV_SHEET+'_'+uid)) : ('del_'+FIN_SALES_INV_SHEET+'_'+uid);
    try{ logHistory_(dbId, FIN_SALES_INV_SHEET, _oldDelUid, uid, (user&&user.email)||'', 'delete', null, _oldDelInv) }catch(e){}
    var sheetInv = getSheet_(FIN_SALES_INV_SHEET, dbId);
    var removed = deleteRowsByCriteria_(sheetInv, 'invoice_unique_id', uid);
    if (!removed) throw new Error('الفاتورة غير موجودة');
    deleteRowsByCriteria_(getSheet_(FIN_SALES_LINES_SHEET, dbId), 'valley_sales_header_id', uid);
    return { status: 'success', message: 'تم حذف الفاتورة وبنودها' };
  }

  /* ---------- P3: SALES RETURNS (valley_sales_returns + returns_stock) ----------
   * Returns attach to an invoice, then to specific sold lines. Returnable per
   * line = sold qty − Σ previously returned (across all return rows). Value =
   * qty × original line price. Restores are recorded FIFO into
   * valley_sales_returns_stock against the original batch allocations. */
  const FIN_RETURNS_SHEET = 'valley_sales_returns';
  const FIN_RETURNS_STOCK_SHEET = 'valley_sales_returns_stock';

  function getValleyReturnsList_(data, user, dbId) {
    settingsEnsureSheet_(dbId, FIN_RETURNS_SHEET,
      ['unique_id','id','valley_sales_invoices_id','valley_sales_invoices_client','valley_return_date','valley_sales_products_id','valley_return_qty','valley_return_value','user','created_at']);
    var rows = getAllRecords_(dbId, FIN_RETURNS_SHEET);

    /* enrich: invoice number + client label */
    var invMap = {};
    try {
      getAllRecords_(dbId, FIN_SALES_INV_SHEET).forEach(function (s) {
        invMap[String(s.invoice_unique_id)] = {
          number: String(s['رقم الفاتورة'] || ''),
          client: s['اسم العميل'],
          date: s['تاريخ الفاتورة']
        };
      });
    } catch (e) {}
    var partyOpts = finRefsCached_(dbId, 'parties', function () {
      return getAllRecords_(dbId, FIN_PARTIES_SHEET).map(function (p) {
        return { value: p.id, label: String(p.name || p.id) };
      }).filter(function (o) { return String(o.value).trim() !== ''; });
    });
    var partyName = {};
    partyOpts.forEach(function (o) { partyName[String(o.value)] = o.label; });

    var groups = {};
    rows.forEach(function (r) {
      var gid = String(r.id != null ? r.id : r.unique_id);
      if (!groups[gid]) groups[gid] = { id: gid, date_display: '-', date_iso: '', invoice_uid: String(r.valley_sales_invoices_id || ''), total_value: 0, lines: 0, client_id: String(r.valley_sales_invoices_client || '') };
      groups[gid].total_value += Number(r.valley_return_value || 0);
      groups[gid].lines++;
      var dp = dateParts_(r.valley_return_date || r.created_at);
      if (dp.iso && (!groups[gid].date_iso || dp.iso < groups[gid].date_iso)) { groups[gid].date_iso = dp.iso; groups[gid].date_display = dp.display; }
    });

    var list = Object.keys(groups).map(function (k) {
      var g = groups[k];
      var inv = invMap[g.invoice_uid] || {};
      g.invoice_number = inv.number || '-';
      g.client_label = partyName[String(g.client_id)] || g.client_id || '-';
      return g;
    }).sort(function (a, b) { return (b.id != null ? Number(b.id) : 0) - (a.id != null ? Number(a.id) : 0); });

    var rp = vfPage_(list, data, 'date_iso');
    return { status: 'success', returns: rp.rows, total: rp.total, invoices_index: invMap };
  }

  function getValleyInvoiceForReturn_(data, user, dbId) {
    var invUid = String((data && data.invoice_unique_id) || '').trim();
    if (!invUid) throw new Error('اختر الفاتورة أولاً');

    /* sold lines of this invoice */
    var soldLines = safeRows_(dbId, FIN_SALES_LINES_SHEET).filter(function (l) {
      return String(l.valley_sales_header_id || '').trim() === invUid;
    });

    /* returned sums per line */
    var returnedByLine = {};
    safeRows_(dbId, FIN_RETURNS_SHEET).forEach(function (r) {
      var lu = String(r.valley_sales_products_id || '').trim();
      if (!lu) return;
      returnedByLine[lu] = (returnedByLine[lu] || 0) + Number(r.valley_return_qty || 0);
    });

    var productNames = {};
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
        productNames[String(p.id)] = String(p.name_ar || '');
      });
    } catch (e) {}

    var lines = soldLines.map(function (l) {
      var lu = String(l.unique_id || '').trim();
      var sold = Number(l.product_qty || 0);
      var returned = returnedByLine[lu] || 0;
      return {
        line_uid: lu,
        product_name: productNames[String(l.product_id)] || String(l.product_id),
        details: l.product_details || '',
        price: Number(l.product_price || 0),
        sold_qty: sold,
        returned_qty: returned,
        returnable: Math.max(0, sold - returned)
      };
    });

    var invInfo = null;
    try {
      var ir = vfFindRowByUid_(dbId, FIN_SALES_INV_SHEET, 'invoice_unique_id', invUid);
      if (ir) {
        var iSheet = getSheet_(FIN_SALES_INV_SHEET, dbId);
        var iHeaders = getHeaders_(iSheet);
        var iVals = iSheet.getRange(ir, 1, 1, iSheet.getLastColumn()).getValues()[0];
        var s = {};
        iHeaders.forEach(function (h, ci) { s[String(h).trim()] = iVals[ci]; });
        invInfo = {
          uid: uid,
          number: String(s['رقم الفاتورة'] || ''),
          client_name: String(s['اسم العميل'] || ''),
          date_display: (function () { var d = s['تاريخ الفاتورة'] ? new Date(s['تاريخ الفاتورة']) : null; return d && !isNaN(d.getTime()) ? pad2_(d.getDate()) + '/' + pad2_(d.getMonth() + 1) + '/' + d.getFullYear() : '-'; })()
        };
      }
    } catch (e) {}

    return { status: 'success', invoice: invInfo || { uid: invUid, number: '-' }, lines: lines };
  }

  function saveValleyReturn_(data, user, dbId) {
    var d = data || {};
    var invUid = String(d.invoice_unique_id || '').trim();
    if (!invUid) throw new Error('الفاتورة مطلوبة');
    if (!d.date) throw new Error('تاريخ المرتجع مطلوب');
    var retDate = parseDate_(d.date);
    if (!retDate) throw new Error('تاريخ المرتجع غير صالح');
    var items = Array.isArray(d.items) ? d.items.filter(function (x) { return x && Number(x.qty) > 0; }) : [];
    if (!items.length) throw new Error('أدخل كمية مرتجعة لبند واحد على الأقل');

    settingsEnsureSheet_(dbId, FIN_RETURNS_SHEET,
      ['unique_id','id','valley_sales_invoices_id','valley_sales_invoices_client','valley_return_date','valley_sales_products_id','valley_return_qty','valley_return_value','user','created_at']);
    settingsEnsureSheet_(dbId, FIN_RETURNS_STOCK_SHEET,
      ['unique_id','id','valley_sales_returns_id','product_unique_id','product_transaction_code','product_qty','user','created_at']);

    executeWithLock_(function () {
      var sheetRet = getSheet_(FIN_RETURNS_SHEET, dbId);
      var retHeaders = getHeaders_(sheetRet);
      var retRows = getAllRecords_(dbId, FIN_RETURNS_SHEET);
      var sheetStock = getSheet_(FIN_RETURNS_STOCK_SHEET, dbId);
      var stockHeaders = getHeaders_(sheetStock);

      /* original allocations of the chosen invoice's lines */
      var lineUids = {};
      var allocByLine = {};  /* line_uid → [{alloc_uid, batch_uid, lot, qty}] */
      safeRows_(dbId, FIN_SALES_LINES_SHEET).forEach(function (l) {
        var lu = String(l.unique_id || '').trim();
        lineUids[lu] = {
          belongs: String(l.valley_sales_header_id || '').trim() === invUid,
          price: Number(l.product_price || 0),
          qty: Number(l.product_qty || 0),
          pid: String(l.product_id || '')
        };
        allocByLine[lu] = [];
      });
      getAllRecords_(dbId, 'valley_sales_product_stock').forEach(function (a) {
        var lu = String(a.valley_sales_products_id || '').trim();
        if (allocByLine[lu]) allocByLine[lu].push({
          alloc_uid: String(a.unique_id || ''),
          lot: String(a.product_transaction_code || ''),
          qty: Number(a.product_qty || 0)
        });
      });

      /* already returned per line */
      var returnedByLine = {};
      getAllRecords_(dbId, FIN_RETURNS_SHEET).forEach(function (r) {
        var lu = String(r.valley_sales_products_id || '').trim();
        if (!lu) return;
        returnedByLine[lu] = (returnedByLine[lu] || 0) + Number(r.valley_return_qty || 0);
      });

      /* group serial */
      var nextNum = 1;
      retRows.forEach(function (r) {
        var n = Number(r.id);
        if (Number.isInteger(n) && n >= nextNum) nextNum = n + 1;
      });
      var groupId = nextNum;

      var clientId = '';
      var retStart = sheetRet.getLastRow() + 1;
      var retRowsToWrite = [];
      var stockRowsToWrite = [];
      var nowStamp = new Date();
      var email = (user && user.email) || '';

      items.forEach(function (it, idx) {
        var lu = String(it.line_uid || '').trim();
        var info = lineUids[lu];
        if (!info) throw new Error('البند ' + (idx + 1) + ': بند غير موجود');
        if (!info.belongs) throw new Error('البند ' + (idx + 1) + ': البند لا ينتمي لهذه الفاتورة');
        var qty = Number(it.qty);
        if (!isFinite(qty) || qty <= 0) throw new Error('البند ' + (idx + 1) + ': الكمية يجب أن تكون أكبر من صفر');
        var alreadyReturned = returnedByLine[lu] || 0;
        var returnable = info.qty - alreadyReturned;
        if (qty > returnable + 0.0001) {
          throw new Error('البند ' + (idx + 1) + ': الكمية المرتجعة تتجاوز المسموح (' + returnable + ')');
        }
        var value = qty * info.price;

        var rowUuid = Utilities.getUuid();
        if (!clientId) clientId = ''; /* filled below from invoice header */
        retRowsToWrite.push(retHeaders.map(function (h) {
          var k = String(h).trim();
          var m = {
            unique_id: rowUuid,
            id: groupId,
            valley_sales_invoices_id: invUid,
            valley_sales_invoices_client: '',
            valley_return_date: retDate,
            valley_sales_products_id: lu,
            valley_return_qty: qty,
            valley_return_value: value,
            user: email,
            created_at: nowStamp
          };
          return m[k] !== undefined ? m[k] : '';
        }));

        /* FIFO restore across the line's original allocations minus restored-so-far */
        var remainingRestore = qty;
        var restoredPerAlloc = {};
        getAllRecords_(dbId, FIN_RETURNS_STOCK_SHEET).forEach(function (rs) {
          var au = String(rs.product_unique_id || '').trim();
          if (allocByLine[lu] && allocByLine[lu].some(function (al) { return al.alloc_uid === au; })) {
            restoredPerAlloc[au] = (restoredPerAlloc[au] || 0) + Number(rs.product_qty || 0);
          }
        });
        for (var ai = 0; ai < allocByLine[lu].length && remainingRestore > 0.0001; ai++) {
          var al = allocByLine[lu][ai];
          var capacity = al.qty - (restoredPerAlloc[al.alloc_uid] || 0);
          if (capacity <= 0.0001) continue;
          var take = Math.min(capacity, remainingRestore);
          stockRowsToWrite.push(stockHeaders.map(function (h) {
            var k = String(h).trim();
            var m4 = {
              unique_id: Utilities.getUuid(),
              id: groupId,
              valley_sales_returns_id: rowUuid,
              product_unique_id: al.alloc_uid,
              product_transaction_code: al.lot,
              product_qty: take,
              user: email,
              created_at: nowStamp
            };
            return m4[k] !== undefined ? m4[k] : '';
          }));
          remainingRestore -= take;
        }
        if (remainingRestore > 0.0001) {
          throw new Error('البند ' + (idx + 1) + ': تعذر توزيع الكمية المرتجعة على دفعات الفاتورة');
        }
      });

      /* resolve client id from the invoice header */
      try {
        getAllRecords_(dbId, FIN_SALES_INV_SHEET).some(function (s) {
          if (String(s.invoice_unique_id).trim() === invUid) {
            clientId = String(s['اسم العميل'] || '');
            return true;
          }
          return false;
        });
      } catch (e) {}
      retRowsToWrite = retRowsToWrite.map(function (row) {
        var ci = retHeaders.findIndex(function (h) { return String(h).trim() === 'valley_sales_invoices_client'; });
        row[ci >= 0 ? ci : 3] = clientId;
        return row;
      });

      if (retRowsToWrite.length) {
        sheetRet.getRange(retStart, 1, retRowsToWrite.length, retHeaders.length).setValues(retRowsToWrite);
        try{ retRowsToWrite.forEach(function(r){ var _uid = r[retHeaders.findIndex(function(h){return String(h).trim()==='unique_id';})]; var _qty = r[retHeaders.findIndex(function(h){return String(h).trim()==='valley_return_qty';})]; var _rowLog={ unique_id:_uid, id:groupId, valley_sales_invoices_id:invUid, valley_return_qty:_qty, valley_return_date:retDate }; try{ logHistory_(dbId, FIN_RETURNS_SHEET, ('create_'+FIN_RETURNS_SHEET+'_'+_uid), _uid, (user&&user.email)||'', 'create', _rowLog, null) }catch(e2){} }); }catch(e){}
      }
      if (stockRowsToWrite.length) {
        var stStart = sheetStock.getLastRow() + 1;
        sheetStock.getRange(stStart, 1, stockRowsToWrite.length, stockHeaders.length).setValues(stockRowsToWrite);
      }
    });

    finBustRefs_(dbId);
    return { status: 'success', message: 'تم تسجيل المرتجع بنجاح' };
  }

  // ===================== TEST DATA =====================
  var TEST_MARKER = '[تجريبي]';

  function getTestData_(data, user, dbId) {
    var sheets = [
      'valley_products', 'valley_legal_customer_vendor', 'valley_cash_bank_movement',
      'valley_sales_invoices', 'valley_sales_products',
      'valley_product_recipe', 'valley_manufacture_header'
    ];
    var total = 0;
    sheets.forEach(function (name) {
      try {
        var sh = getSheet_(name, dbId);
        if (!sh || sh.getLastRow() <= 1) return;
        var vals = sh.getDataRange().getValues();
        for (var i = 1; i < vals.length; i++) {
          var row = vals[i].join('|');
          if (row.indexOf(TEST_MARKER) >= 0) total++;
        }
      } catch (e) {}
    });
    return { status: 'success', count: total };
  }

  function generateTestData_(data, user, dbId) {
    var results = [];
    var errors = [];
    var ts = new Date();

    function tryCall(fn, page, desc, payload) {
      try {
        var r = fn(payload, user, dbId);
        results.push({ ok: true, page: page, message: desc + ' — تم الإنشاء' });
        return r;
      } catch (e) {
        errors.push(page + ': ' + (e && e.message || e));
        results.push({ ok: false, page: page, message: desc + ' — خطأ: ' + (e && e.message || e) });
        return null;
      }
    }

    // 1. المنتجات — منتج تجريبي
    tryCall(saveValleyProduct_, 'المنتجات', 'منتج تجريبي', {
      name: TEST_MARKER + ' منتج اختبار',
      category: '成品',
      unit: 'قطعة',
      price: 100,
      type: '材物',
      chart_ref: '114100',
      description: 'منتج تجريبي للاختبار'
    });

    // 2. العملاء والموردون — عميل تجريبي
    tryCall(saveValleyParty_, 'العملاء', 'عميل تجريبي', {
      name: TEST_MARKER + ' عميل اختبار',
      type: 'عميل',
      phone: '0500000000',
      email: 'test@test.com',
      address: 'الرياض'
    });

    // 3. العملاء والموردون — مورد تجريبي
    tryCall(saveValleyParty_, 'الموردون', 'مورد تجريبي', {
      name: TEST_MARKER + ' مورد اختبار',
      type: 'مورد',
      phone: '0500000001',
      email: 'supplier@test.com',
      address: 'جدة'
    });

    // 4. حركة النقدية — قيد تجريبي
    tryCall(saveValleyCash_, 'النقدية', 'قيد نقدي تجريبي', {
      date: Utilities.formatDate(ts, 'Asia/Riyadh', 'yyyy-MM-dd'),
      box: 'الصندوق الرئيسي',
      amount: 1000,
      type: 'إيداع',
      description: TEST_MARKER + ' قيد اختبار',
      party_uid: ''
    });

    // 5. المبيعات — فاتورة تجريبية
    var invResult = tryCall(saveValleyInvoice_, 'المبيعات', 'فاتورة تجريبية', {
      party_uid: '',
      invoice_date: Utilities.formatDate(ts, 'Asia/Riyadh', 'yyyy-MM-dd'),
      notes: TEST_MARKER + ' فاتورة اختبار',
      lines: []
    });

    // 6. وصفات التصنيع — وصفة تجريبية
    tryCall(saveValleyMfgRecipe_, 'الوصفات', 'وصفة تجريبية', {
      name: TEST_MARKER + ' وصفة اختبار',
      product_name: TEST_MARKER + ' منتج اختبار',
      qty: 10,
      unit: 'قطعة',
      steps: []
    });

    // 7. أوامر التصنيع — أمر تجريبي
    tryCall(saveValleyMfgOrder_, 'أوامر التصنيع', 'أمر تصنيع تجريبي', {
      order_date: Utilities.formatDate(ts, 'Asia/Riyadh', 'yyyy-MM-dd'),
      product_name: TEST_MARKER + ' منتج اختبار',
      qty: 5,
      notes: TEST_MARKER + ' أمر تصنيع اختبار'
    });

    return {
      status: 'success',
      ok: true,
      results: results,
      errors: errors,
      message: 'تم إنشاء ' + results.filter(function (r) { return r.ok; }).length + ' سجل تجريبي'
    };
  }

  function removeTestData_(data, user, dbId) {
    var results = [];
    var errors = [];
    var sheets = [
      { name: 'valley_products', label: 'المنتجات', searchCols: [1] },
      { name: 'valley_legal_customer_vendor', label: 'العملاء والموردون', searchCols: [1] },
      { name: 'valley_cash_bank_movement', label: 'النقدية', searchCols: [7] },
      { name: 'valley_sales_invoices', label: 'المبيعات', searchCols: [6] },
      { name: 'valley_sales_products', label: '-lines المبيعات', searchCols: [2] },
      { name: 'valley_product_recipe', label: 'الوصفات', searchCols: [1] },
      { name: 'valley_manufacture_header', label: 'أوامر التصنيع', searchCols: [6] }
    ];

    sheets.forEach(function (s) {
      try {
        var sh = getSheetIfAllowed_(dbId, s.name, 'read');
        if (!sh || sh.getLastRow() <= 1) {
          results.push({ ok: true, sheet: s.label, deleted: 0 });
          return;
        }
        var vals = sh.getDataRange().getValues();
        // Batch delete (Batch 4): collect surviving rows and rewrite the sheet
        // body in a single setValues() instead of N individual deleteRow() calls.
        var newBody = [];
        for (var i = 1; i < vals.length; i++) {
          if (vals[i].join('|').indexOf(TEST_MARKER) >= 0) continue;
          newBody.push(vals[i]);
        }
        var deleted = (vals.length - 1) - newBody.length;
        if (newBody.length) {
          sh.getRange(2, 1, newBody.length, vals[0].length).setValues(newBody);
          var totalRows = sh.getLastRow();
          if (totalRows > newBody.length + 1) sh.deleteRows(newBody.length + 2, totalRows - (newBody.length + 1));
        } else {
          var totalRows2 = sh.getLastRow();
          if (totalRows2 > 1) sh.deleteRows(2, totalRows2 - 1);
        }
        results.push({ ok: true, sheet: s.label, deleted: deleted });
      } catch (e) {
        errors.push(s.label + ': ' + (e && e.message || e));
        results.push({ ok: false, sheet: s.label, deleted: 0 });
      }
    });

    return {
      status: 'success',
      ok: errors.length === 0,
      results: results,
      errors: errors,
      message: 'تم حذف ' + results.reduce(function (sum, r) { return sum + r.deleted; }, 0) + ' سجل تجريبي'
    };
  }

  // ===================== REGISTER =====================
  if (typeof ValleyFoods !== 'undefined' && typeof ValleyFoods.register === 'function') {
    ValleyFoods.register('get_deductions_data',       getDeductionsData_);
    ValleyFoods.register('add_deduction',             addDeduction_);
    ValleyFoods.register('get_contracts_data',        getContractsData_);
    ValleyFoods.register('add_contract',              addContract_);
    ValleyFoods.register('get_vacation_alloc_data',   getVacationAllocData_);
    ValleyFoods.register('add_vacation_alloc',        addVacationAlloc_);
    ValleyFoods.register('get_vacations_data',        getVacationsData_);
    ValleyFoods.register('add_vacation',              addVacation_);
    ValleyFoods.register('get_overtime_data',         getOvertimeData_);
    ValleyFoods.register('add_overtime',              addOvertime_);
    ValleyFoods.register('get_monthly_salaries_data', getMonthlySalariesData_);
    ValleyFoods.register('add_monthly_salary',        addMonthlySalary_);
    ValleyFoods.register('generate_monthly_salaries',  generateMonthlySalaries_);
    ValleyFoods.register('get_attendance_sessions',   getAttendanceSessions_);
    ValleyFoods.register('add_attendance_session',    addAttendanceSession_);
    ValleyFoods.register('get_attendance_data',       getAttendanceData_);
    ValleyFoods.register('add_manual_attendance',     addManualAttendance_);
    ValleyFoods.register('upload_attendance_csv',     uploadAttendanceCsv_);
    ValleyFoods.register('analyze_attendance_csv',    analyzeAttendanceCsv_);
    ValleyFoods.register('get_attendance_report',     getAttendanceReport_);
    ValleyFoods.register('add_upload_file',            addUploadFile_);

    ValleyFoods.register('get_overtime_roles_settings', getOvertimeRolesSettings_);
    ValleyFoods.register('save_overtime_role',          saveOvertimeRole_);
    ValleyFoods.register('toggle_overtime_role',        toggleOvertimeRole_);

    ValleyFoods.register('get_deduction_roles_settings', getDeductionRolesSettings_);
    ValleyFoods.register('save_deduction_role',          saveDeductionRole_);
    ValleyFoods.register('toggle_deduction_role',        toggleDeductionRole_);

    ValleyFoods.register('get_vacations_index_settings', getVacationsIndexSettings_);
    ValleyFoods.register('save_vacation_index',          saveVacationIndex_);
    ValleyFoods.register('toggle_vacation_index',        toggleVacationIndex_);

    ValleyFoods.register('get_shift_schedule_settings',  getShiftScheduleSettings_);
    ValleyFoods.register('save_shift_schedule',          saveShiftSchedule_);
    ValleyFoods.register('toggle_shift_schedule',        toggleShiftSchedule_);

    // ===================== FINANCE MASTER DATA =====================
    ValleyFoods.register('get_valley_products',   getValleyProducts_);
    ValleyFoods.register('save_valley_product',   saveValleyProduct_);
    ValleyFoods.register('get_valley_parties',    getValleyParties_);
    ValleyFoods.register('save_valley_party',     saveValleyParty_);
    ValleyFoods.register('get_valley_party_statement', getValleyPartyStatement_);

    ValleyFoods.register('get_valley_cash',    getValleyCash_);
    ValleyFoods.register('save_valley_cash',   saveValleyCash_);
    ValleyFoods.register('approve_valley_cash', approveValleyCash_);
    ValleyFoods.register('delete_valley_cash', deleteValleyCash_);
    ValleyFoods.register('transfer_valley_cash', transferValleyCash_);

    // ===================== MANUFACTURE — RECIPES (BOM) =====================
    ValleyFoods.register('get_valley_mfg_recipes', getValleyMfgRecipes_);
    ValleyFoods.register('save_valley_mfg_recipe', saveValleyMfgRecipe_);
    ValleyFoods.register('get_valley_mfg_orders',      getValleyMfgOrders_);
    ValleyFoods.register('get_valley_recipe_consumption', getValleyRecipeConsumption_);
    ValleyFoods.register('save_valley_mfg_order',      saveValleyMfgOrder_);
    ValleyFoods.register('approve_valley_mfg_order',   approveValleyMfgOrder_);
    ValleyFoods.register('delete_valley_mfg_order',    deleteValleyMfgOrder_);
    ValleyFoods.register('get_valley_mfg_order_full',  getValleyMfgOrderFull_);
    ValleyFoods.register('change_valley_mfg_status',  changeValleyMfgStatus_);
    ValleyFoods.register('get_valley_recipe_plan',    getValleyRecipePlan_);
    ValleyFoods.register('get_valley_mfg_order_detail', getValleyMfgOrderDetail_);
    ValleyFoods.register('get_valley_product_batches_multi', getValleyProductBatchesMulti_);

    ValleyFoods.register('get_valley_mfg_byproducts', getValleyMfgByproducts_);
    ValleyFoods.register('add_valley_mfg_byproduct',  addValleyMfgByproduct_);
    ValleyFoods.register('get_valley_mfg_workops',    getValleyMfgWorkOps_);
    ValleyFoods.register('save_valley_mfg_workop',    saveValleyMfgWorkOp_);
    ValleyFoods.register('control_valley_mfg_workop', controlValleyMfgWorkOp_);

    ValleyFoods.register('get_valley_sales_bootstrap', getValleySalesBootstrap_);
    ValleyFoods.register('get_valley_product_batches', getValleyProductBatches_);
    ValleyFoods.register('get_valley_invoice_lines',  getValleyInvoiceLines_);
    ValleyFoods.register('save_valley_invoice',       saveValleyInvoice_);
    ValleyFoods.register('approve_valley_invoice',    approveValleyInvoice_);
    ValleyFoods.register('delete_valley_invoice',     deleteValleyInvoice_);
    ValleyFoods.register('get_valley_returns_list',   getValleyReturnsList_);
    ValleyFoods.register('get_valley_invoice_for_return', getValleyInvoiceForReturn_);
    ValleyFoods.register('save_valley_return',        saveValleyReturn_);
    ValleyFoods.register('get_valley_sales_list',     getValleySalesList_);
    ValleyFoods.register('get_valley_sales_page',      getValleySalesPage_);
    ValleyFoods.register('get_valley_invoice_full',   getValleyInvoiceFull_);

  // بيانات تجريبية
  ValleyFoods.register('get_test_data',     getTestData_);
  ValleyFoods.register('generate_test_data', generateTestData_);
  ValleyFoods.register('remove_test_data',  removeTestData_);

  // ===================== WORK CENTERS / ASSETS =====================
  ValleyFoods.register('get_valley_work_centers',     getValleyWorkCenters_);
  ValleyFoods.register('save_valley_work_center',     saveValleyWorkCenter_);
  ValleyFoods.register('get_valley_asset_technicals',  getValleyAssetTechnicals_);
  ValleyFoods.register('save_valley_asset_technical',  saveValleyAssetTechnical_);
  ValleyFoods.register('get_valley_work_center_assets', getValleyWorkCenterAssets_);
  ValleyFoods.register('save_valley_work_center_asset', saveValleyWorkCenterAsset_);

  function prefetchRefs_(data, user, dbId) {
    try { getRefsCached_(dbId, 'categories', FIN_REF_TTL_G, function(){ return getAllRecords_(dbId, FIN_CATEGORIES_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'chart_of_accounts', FIN_REF_TTL_G, function(){ return getAllRecords_(dbId, FIN_CHART_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'parties', FIN_REF_TTL_G, function(){ return getAllRecords_(dbId, FIN_PARTIES_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'products', FIN_REF_TTL_G, function(){ return getAllRecords_(dbId, FIN_PRODUCTS_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'boxes', FIN_REF_TTL_G, function(){ try{ return getAllRecords_(dbId, 'valley_box_account_codes'); }catch(e){ return []; } }); } catch(e){}
    return { status: 'success' };
  }
  ValleyFoods.register('prefetch_refs', prefetchRefs_);
  }

  return {
    getDeductionsData_: getDeductionsData_,
    addDeduction_: addDeduction_,
    getContractsData_: getContractsData_,
    addContract_: addContract_,
    getVacationAllocData_: getVacationAllocData_,
    addVacationAlloc_: addVacationAlloc_,
    getVacationsData_: getVacationsData_,
    addVacation_: addVacation_,
    getOvertimeData_: getOvertimeData_,
    addOvertime_: addOvertime_,
    getMonthlySalariesData_: getMonthlySalariesData_,
    addMonthlySalary_: addMonthlySalary_,
    getAttendanceSessions_: getAttendanceSessions_,
    addAttendanceSession_: addAttendanceSession_,
    getAttendanceData_: getAttendanceData_,
    addManualAttendance_: addManualAttendance_,
    uploadAttendanceCsv_: uploadAttendanceCsv_,
    analyzeAttendanceCsv_: analyzeAttendanceCsv_,
    getAttendanceReport_: getAttendanceReport_,
    addUploadFile_: addUploadFile_,
    getOvertimeRolesSettings_: getOvertimeRolesSettings_,
    saveOvertimeRole_: saveOvertimeRole_,
    toggleOvertimeRole_: toggleOvertimeRole_,
    getDeductionRolesSettings_: getDeductionRolesSettings_,
    saveDeductionRole_: saveDeductionRole_,
    toggleDeductionRole_: toggleDeductionRole_,
    getVacationsIndexSettings_: getVacationsIndexSettings_,
    saveVacationIndex_: saveVacationIndex_,
    toggleVacationIndex_: toggleVacationIndex_,
    getShiftScheduleSettings_: getShiftScheduleSettings_,
    saveShiftSchedule_: saveShiftSchedule_,
    toggleShiftSchedule_: toggleShiftSchedule_,
    getValleyProducts_: getValleyProducts_,
    saveValleyProduct_: saveValleyProduct_,
    getValleyParties_: getValleyParties_,
    saveValleyParty_: saveValleyParty_
  };
})();

