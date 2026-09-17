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
/* Phase 7.2 (F-15) — 60s -> 600s, behind a version stamp.
 *
 * A stamp rather than a bare longer TTL: it is part of every derived cache key,
 * so one bump orphans every entry at once and no individual kind can be
 * forgotten. 600s and not the 1-6h F-15 floated, because the stamp cannot cover
 * somebody editing a reference sheet by hand in the spreadsheet; that used to
 * surface within 60s and now surfaces within 600s.
 *
 * Defined at file top level, like vfRefsCached_ itself, so ValleyFoods,
 * ValleyFoodsHREmp and ValleyFoodsHRModules can all reach it. */
var FIN_REF_TTL_G = 600;
var VF_REF_STAMP_TTL_G = 21600;

function vfRefsVersion_(dbId) {
  try {
    var cache = CacheService.getScriptCache();
    var k = 'vf_refs_ver_' + dbId;
    var v = cache.get(k);
    if (!v) { v = String(new Date().getTime()); cache.put(k, v, VF_REF_STAMP_TTL_G); }
    return v;
  } catch (e) { return '0'; }
}

function bumpVfRefsVersion_(dbId) {
  try { CacheService.getScriptCache().put('vf_refs_ver_' + dbId, String(new Date().getTime()), VF_REF_STAMP_TTL_G); } catch (e) {}
}

function vfRefsCached_(dbId, kind, builder) {
  return getRefsCached_(dbId, kind + '_v' + vfRefsVersion_(dbId), FIN_REF_TTL_G, builder);
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
    'get_attendance_employees': { page: 'vf_hr_attendance', access: 'read' },
    'add_manual_attendance': { page: 'vf_hr_attendance', access: 'write' },
    'commit_attendance_import': { page: 'vf_hr_attendance', access: 'write' },
    'get_attendance_report': { page: 'vf_hr_attendance', access: 'read' },
    'get_attendance_index': { page: 'vf_hr_attendance', access: 'read' },
    'get_attendance_review': { page: 'vf_hr_attendance', access: 'read' },
    'resolve_attendance_review': { page: 'vf_hr_attendance', access: 'write' },
    'get_attendance_exceptions': { page: 'vf_hr_attendance', access: 'read' },
    'get_attendance_batches': { page: 'vf_hr_attendance', access: 'read' },
    /* Undo deletes rows, so it is the one attendance action gated at 'full'. */
    'revert_attendance_import': { page: 'vf_hr_attendance', access: 'full' },

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
    'get_valley_party_balances': { page: 'vf_parties', access: 'read' },

    // المالية — حركة النقدية والبنوك
    'get_valley_cash': { page: 'vf_cash', access: 'read' },
    /* the expenses report reads the SAME page's data, so it rides the existing
       vf_cash grant rather than needing one of its own (same for incomes) */
    'get_valley_cash_expense_report': { page: 'vf_cash', access: 'read' },
    'get_valley_cash_income_report': { page: 'vf_cash', access: 'read' },
    'save_valley_cash': { page: 'vf_cash', access: 'write' },
    'approve_valley_cash': { page: 'vf_cash', access: 'write' },
    'delete_valley_cash': { page: 'vf_cash', access: 'full' },
    'transfer_valley_cash': { page: 'vf_cash', access: 'write' },

    // المالية — حركة المخزن (إضافة وعرض فقط)
    'get_valley_warehouse_movements': { page: 'vf_warehouse_movement', access: 'read' },
    'get_valley_warehouse_move_options': { page: 'vf_warehouse_movement', access: 'read' },
    'save_valley_warehouse_movement': { page: 'vf_warehouse_movement', access: 'write' },

    // المشتريات — valley_purchasing_costing (header) + valley_product_purchasing (lines)
    'get_valley_purchasing_costing': { page: 'vf_purchasing', access: 'read' },
    'get_valley_purchasing_report': { page: 'vf_purchasing', access: 'read' },
    'get_valley_purchasing_options': { page: 'vf_purchasing', access: 'read' },
    'get_valley_purchasing_lines': { page: 'vf_purchasing', access: 'read' },
     'save_valley_purchasing_costing': { page: 'vf_purchasing', access: 'write' },
     'save_valley_purchasing_header_checkpoint': { page: 'vf_purchasing', access: 'write' },
     'save_valley_purchasing_lines_checkpoint': { page: 'vf_purchasing', access: 'write' },
     'delete_valley_purchasing_costing': { page: 'vf_purchasing', access: 'full' },
    'approve_valley_purchasing_costing': { page: 'vf_purchasing', access: 'write' },
    'quality_approve_valley_purchasing_costing': { page: 'vf_purchasing', access: 'write' },

    // المالية — المبيعات
    'get_valley_sales_bootstrap': { page: 'vf_sales', access: 'read' },
    'get_valley_sales_page': { page: 'vf_sales', access: 'read' },
    'get_valley_product_batches': { page: 'vf_sales', access: 'read' },
    'get_valley_sales_report': { page: 'vf_sales', access: 'read' },

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
    'get_attendance_employees': 'valley_employee_info',
    'commit_attendance_import': 'valley_employee_attendance',
    'get_attendance_report': 'valley_employee_attendance',
    'get_attendance_index': 'valley_attendance_session',
    'get_attendance_review': 'valley_attendance_needs_review',
    'resolve_attendance_review': 'valley_attendance_needs_review',
    'get_attendance_exceptions': 'valley_employee_attendance',
    'get_attendance_batches': 'valley_attendance_import_batch',
    'revert_attendance_import': 'valley_attendance_import_batch',

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
    'get_valley_party_balances': 'valley_legal_customer_vendor',

    'get_valley_cash': 'valley_cash_bank_movement',
    'get_valley_cash_expense_report': 'valley_cash_bank_movement',
    'get_valley_cash_income_report': 'valley_cash_bank_movement',
    'save_valley_cash': 'valley_cash_bank_movement',
    'transfer_valley_cash': 'valley_cash_bank_movement',

    'get_valley_warehouse_movements': 'valley_warehouse_movement',
    'get_valley_warehouse_move_options': 'valley_warehouse_movement',
    'save_valley_warehouse_movement': 'valley_warehouse_movement',

    /* Purchasing changes affect both the header and its child lines. The
     * derived PAGE_TABLES map has one table per action, so the read actions
     * intentionally cover each table and the save/delete/approval action is
     * anchored on the authoritative header. */
    'get_valley_purchasing_costing': 'valley_purchasing_costing',
    'get_valley_purchasing_report': 'valley_purchasing_costing',
    'get_valley_purchasing_options': 'valley_product_purchasing',
    'get_valley_purchasing_lines': 'valley_product_purchasing',
     'save_valley_purchasing_costing': 'valley_purchasing_costing',
     'save_valley_purchasing_header_checkpoint': 'valley_purchasing_costing',
     'save_valley_purchasing_lines_checkpoint': 'valley_product_purchasing',
     'delete_valley_purchasing_costing': 'valley_purchasing_costing',
    'approve_valley_purchasing_costing': 'valley_purchasing_costing',
    'quality_approve_valley_purchasing_costing': 'valley_purchasing_costing',

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
    'get_valley_sales_report': 'valley_sales_invoices',

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

  /**
   * page -> the tables its actions touch, derived by joining the two maps that
   * already exist. No new configuration to keep in step: a page's watch set is
   * exactly the set of tables its own actions declare.
   */
  const PAGE_TABLES = (function () {
    const byPage = {};
    Object.keys(PAGE_ACCESS).forEach(function (action) {
      const page = PAGE_ACCESS[action].page;
      const table = ACTION_TABLES[action];
      if (!page || !table) return;
      if (!byPage[page]) byPage[page] = {};
      byPage[page][table] = true;
    });
    const out = {};
    Object.keys(byPage).forEach(function (p) { out[p] = Object.keys(byPage[p]); });
    return out;
  })();

  /**
   * "Has anything this page cares about changed since I last looked?"
   *
   * This is the ONLY thing a client is allowed to poll, because it is the only
   * thing cheap enough to poll: ONE CacheService.getAll over the page's tables.
   * It reads no spreadsheet, takes no lock and returns no business data — only
   * opaque timestamps — so a device that is merely watching costs a fraction of
   * a device that is loading.
   *
   * Gated explicitly rather than through PAGE_ACCESS: one action serves every
   * page, so the page being asked about is what has to be checked, and it is
   * checked here against the caller's real read grant.
   */
  function getPageVersions_(data, user, dbId) {
    const page = String((data && data.page) || '').trim();
    if (!page) throw new Error('الصفحة مطلوبة');
    if (!(user && user.isSuperAdmin)) {
      if (!unifiedCheck_(user, '9940659bd83035d7', page, 'read')) {
        throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
      }
    }
    const tables = PAGE_TABLES[page] || [];
    return {
      status: 'success',
      page: page,
      tables: tables,
      versions: readTableVersions_(dbId, tables),
      /* The server's own clock, so a client can tell a stalled poll from a
         quiet system without trusting the device clock. */
      now: String(new Date().getTime())
    };
  }

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
  /* Deliberately NOT in PAGE_ACCESS: one action serves every page, so it
     gates itself on the page it is asked about (see getPageVersions_). */
  register('get_page_versions', getPageVersions_);

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
      noteMutation_(sheet);
      sheet.appendRow(headers);
      noteMutation_(sheet);
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

  /* writeFormula_ lives at GLOBAL scope in 02_DataAccess.js (shared by all IIFE namespaces). */

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
        /* Recompute every employee's stored status from the real data instead
         * of trusting the just-submitted value for the one employee touched.
         * Re-fetched (not the `statuses` array read above, at the top of this
         * function) because that read happened BEFORE addRecord_ inserted the
         * row just written — it does not contain it yet. Self-healing: any
         * employee whose stored value drifted some other way (a manual sheet
         * edit, data from before this logic existed) is corrected here too. */
        const statusMap = getLatestStatusMap_(dbId);
        for (var r = 1; r < empData.length; r++) {
          const eid = String(empData[r][empIdIdx]);
          const st = statusMap[eid];
          const newVal = st ? st.status_type : '';
          if (empData[r][statusIdx] !== newVal) {
            empSheet.getRange(r + 1, statusIdx + 1).setValue(newVal);
          }
        }
        noteMutation_(empSheet);
      }
    } catch (e) {
      try { console.error('addEmpStatus_: status sync failed — ' + e.message); } catch (e2) {}
    }
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
      return { value: s.shift_unique_id, label: shiftLabel_(s) };
    });

    /* The list shows names, not ids, so it is resolved here rather than making
       the page look every row up itself. */
    const shiftLabelById = {};
    shifts.forEach(function (s) { shiftLabelById[String(s.shift_unique_id)] = shiftLabel_(s); });
    const empNameById = {};
    try {
      getAllRecords_(dbId, EMP_INFO_SHEET).forEach(function (e) {
        empNameById[String(e.emp_id)] = e.name_ar || String(e.emp_id);
      });
    } catch (e) {}

    assignments = assignments.map(function (a) {
      return {
        shift_assignment_id: a.shift_assignment_id,
        emp_id: a.emp_id,
        employee_name: empNameById[String(a.emp_id)] || String(a.emp_id),
        shift_id: a.shift_id,
        shift_label: shiftLabelById[String(a.shift_id)] || String(a.shift_id),
        shift_start_date: dateOnlyStr_(a.shift_start_date),
        shift_end_date: dateOnlyStr_(a.shift_end_date),
        notes: a.notes || '',
        user: a.user || '',
        created_at: a.created_at || ''
      };
    });

    return { status: 'success', assignments: assignments, total: total, employeeOptions: employeeOptions, shiftOptions: shiftOptions };
  }

  /** «shift_name - HH:MM - HH:MM - shift_type», the label the ref is shown by. */
  function shiftLabel_(s) {
    if (!s) return '';
    return [s.shift_name || '', fmtTime_(s.shift_start_time), fmtTime_(s.shift_end_time), s.shift_type || '']
      .filter(function (x) { return String(x).trim() !== ''; })
      .join(' - ');
  }

  /** yyyy-MM-dd for any stored representation, '' when unparseable. */
  function dateOnlyStr_(v) {
    if (v === '' || v === null || v === undefined) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) {
      var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? m[0] : '';
    }
    var p2 = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  /** Midnight-local day number, so two dates compare as whole days. */
  function dayNum_(v) {
    var iso = dateOnlyStr_(v);
    if (!iso) return null;
    var p = iso.split('-');
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000;
  }

  function addShiftAssignment_(data, user, dbId) {
    const d = data || {};
    const empId = d.emp_id;
    if (empId === undefined || empId === '' || empId === null) throw new Error('الموظف مطلوب');
    const shiftId = d.shift_id;
    if (!shiftId) throw new Error('الوردية مطلوبة');
    if (!d.shift_start_date) throw new Error('تاريخ بداية الوردية مطلوب');
    if (!d.shift_end_date) throw new Error('تاريخ نهاية الوردية مطلوب');

    const startDay = dayNum_(d.shift_start_date);
    const endDay = dayNum_(d.shift_end_date);
    if (startDay === null) throw new Error('تاريخ بداية الوردية غير صحيح');
    if (endDay === null) throw new Error('تاريخ نهاية الوردية غير صحيح');
    if (endDay <= startDay) {
      throw new Error('تاريخ نهاية الوردية يجب أن يكون بعد تاريخ البداية');
    }

    /* One employee cannot be on two shifts over the same days. Two periods
       overlap unless one ends before the other begins, which is the whole test —
       inclusive on both ends, because a day belongs to the period that names it. */
    ensureSheet_(dbId, SHIFT_ASSIGN_SHEET, SHIFT_ASSIGN_HEADERS);
    const clash = getAllRecords_(dbId, SHIFT_ASSIGN_SHEET).filter(function (a) {
      if (String(a.emp_id) !== String(Number(empId))) return false;
      var aStart = dayNum_(a.shift_start_date);
      var aEnd = dayNum_(a.shift_end_date);
      if (aStart === null || aEnd === null) return false;
      return !(endDay < aStart || startDay > aEnd);
    })[0];
    if (clash) {
      throw new Error('يوجد بالفعل وردية لهذا الموظف في نفس الفترة (' +
        dateOnlyStr_(clash.shift_start_date) + ' إلى ' + dateOnlyStr_(clash.shift_end_date) +
        ') — لا يمكن تعيين ورديتين في نفس الفترة');
    }

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
    /* salaries intentionally excluded: راتب الموظف lives on its own page
       (vf_hr_salary, served by get_salary_data). Serving them here would hand
       the salary dataset to anyone granted only the employees list. */
    return {
      status: 'success',
      employees: er.employees,
      titleOptions: er.titleOptions,
      titleSectionMap: er.titleSectionMap,
      next_emp_ids: er.next_emp_ids,
      statuses: sr.statuses,
      employeeOptions: sr.employeeOptions,
      assignments: shr.assignments,
      shiftOptions: shr.shiftOptions
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






