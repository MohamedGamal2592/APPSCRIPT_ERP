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
       vf_cash grant rather than needing one of its own */
    'get_valley_cash_expense_report': { page: 'vf_cash', access: 'read' },
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
    'get_valley_purchasing_options': { page: 'vf_purchasing', access: 'read' },
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
    'save_valley_cash': 'valley_cash_bank_movement',
    'transfer_valley_cash': 'valley_cash_bank_movement',

    'get_valley_warehouse_movements': 'valley_warehouse_movement',
    'get_valley_warehouse_move_options': 'valley_warehouse_movement',
    'save_valley_warehouse_movement': 'valley_warehouse_movement',

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
  /* A NEW sheet, created by ensureSheet_ on first use. Creating a sheet is
     allowed; adding a column to an existing sheet is not, which is why
     settingsEnsureSheet_ (it appends any header it thinks is missing) is never
     called against an attendance table. */
  const ATT_BATCH_SHEET            = 'valley_attendance_import_batch';
  const ATT_BATCH_HEADERS = [
    'batch_id', 'file_name', 'file_rows', 'uploaded_by', 'uploaded_at', 'chosen_format',
    'detected_format', 'confidence', 'rows_imported', 'rows_duplicate', 'rows_flagged',
    'sessions_created', 'date_min', 'date_max', 'batch_status', 'reverted_by', 'reverted_at'
  ];
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
      noteMutation_(sheet);
      sheet.appendRow(headers);
      noteMutation_(sheet);
      sheet.setFrozenRows(1);
    }
    _ensuredSheets_[key] = sheet;
    return sheet;
  }

  // ===================== ATTENDANCE GUARD HELPERS =====================
  // I-1 (exactly one session row per calendar date) and I-2 (no duplicate
  // (emp_id, attendance_date_time)) are both read-then-write invariants. Without
  // a lock they hold only until two people import at the same moment, and the
  // damage is silent: duplicate day-headers, or the same punch twice.

  /** One script lock around every attendance write. */
  function withAttLock_(fn) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('النظام مشغول بعملية حضور أخرى، برجاء المحاولة بعد قليل');
    try { return fn(); } finally { lock.releaseLock(); }
  }

  /* The §1 columns are added to the live sheets BY HAND, by the owner. Every new
     write path therefore asks whether a column is there rather than assuming
     it, so a sheet that has not been extended yet still imports correctly — it
     simply carries no batch id, and undo refuses with a message naming the
     column it needs. That degradation is the deliverable, not a nicety. */
  function hasCol_(headers, name) {
    var want = String(name).trim().toLowerCase();
    return (headers || []).some(function (h) { return String(h).trim().toLowerCase() === want; });
  }

  /** Project a lowercase-keyed row object onto a sheet's header order. */
  function attRowValues_(headers, row) {
    return (headers || []).map(function (h) {
      var k = String(h).trim().toLowerCase();
      return row[k] !== undefined ? row[k] : '';
    });
  }

  function attColIdx_(headers, name) {
    var want = String(name).trim().toLowerCase();
    return (headers || []).findIndex(function (h) { return String(h).trim().toLowerCase() === want; });
  }

  /**
   * THE sole writer of valley_attendance_session rows. Manual add, upload and
   * review-fix all come through here, which is what makes I-1 true by
   * construction rather than by three independent read-then-write scans that
   * have to agree. The caller must already hold withAttLock_.
   *
   * Matching is by sessionDateKey_, so a legacy row whose session_date holds a
   * Date object, a serial number or "dd/mm/yyyy" text is FOUND rather than
   * duplicated — the old inline code got that right by accident and a rewrite
   * is exactly where it would be lost.
   *
   * @return {{session_id: string, session_date: number, created: boolean}}
   */
  function resolveSession_(dbId, dateSerial, user, batchId) {
    var wantKey = sessionDateKey_(dateSerial);
    if (!wantKey || !/^\d{4}-\d{2}-\d{2}$/.test(wantKey)) throw new Error('تاريخ الجلسة غير صالح');

    var existing = getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET);
    for (var i = 0; i < existing.length; i++) {
      var sid = String(existing[i].session_id || '').trim();
      if (sid && sessionDateKey_(existing[i].session_date) === wantKey) {
        return { session_id: sid, session_date: existing[i].session_date, created: false };
      }
    }

    var sheet = getSheet_(ATTENDANCE_SESSION_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var row = {};
    row['session_id'] = Utilities.getUuid();
    row['session_date'] = dateSerial;
    /* D-23 is a DISPLAY decision, not a storage one: these two columns keep
       taking exactly the values they took before — 'synced' from an upload,
       'pending' from a hand-made session, selected_employees always ''. They
       simply stop being shown. No schema change, no change on write. */
    row['session_status'] = batchId ? 'synced' : 'pending';
    row['selected_employees'] = '';
    row['user'] = (user && user.email) || '';
    row['created_at'] = new Date();
    if (hasCol_(headers, 'import_batch_id')) row['import_batch_id'] = batchId || '';

    var rowNum = sheet.getLastRow() + 1;
    sheet.appendRow(attRowValues_(headers, row));
    noteMutation_(sheet);
    /* D-21: format the cell that was just written, never the whole column. */
    var sdIdx = attColIdx_(headers, 'session_date');
    if (sdIdx !== -1) {
      try { sheet.getRange(rowNum, sdIdx + 1).setNumberFormat('dd/mm/yyyy'); noteMutation_(sheet); } catch (e) { /* non-fatal */ }
    }
    try {
      logHistory_(dbId, ATTENDANCE_SESSION_SHEET, 'create_' + ATTENDANCE_SESSION_SHEET + '_' + row['session_id'],
        row['session_id'], (user && user.email) || '', 'create', row, null);
    } catch (e) { /* history is never allowed to fail a write */ }

    return { session_id: String(row['session_id']), session_date: dateSerial, created: true };
  }

  /**
   * emp|minutes for every punch already on the sheet — ONE implementation of
   * I-2, shared by the manual add and by the import commit.
   *
   * With a [minSerial, maxSerial] window the set is filtered to that window,
   * which is what makes a per-chunk rebuild both correct and small: a punch can
   * only collide with another punch at the SAME instant, and that instant is
   * inside the window by definition.
   *
   * Deliberately NOT CacheService — one cache value is capped at 100 KB and a
   * real key set passes that ceiling silently.
   */
  function buildPunchKeySet_(dbId, window) {
    var lo = (window && window.length === 2 && window[0] != null) ? Number(window[0]) : null;
    var hi = (window && window.length === 2 && window[1] != null) ? Number(window[1]) : null;
    var set = {};
    getAllRecords_(dbId, EMP_ATTENDANCE_SHEET).forEach(function (r) {
      var emp = normalizeEmpIdVF_(r.emp_id);
      if (!emp) return;
      var s = flexToSerial_(r.attendance_date_time);
      if (s === null) {
        /* Unparseable stored value: keep it in the set under its raw key so an
           identical raw row still counts as a duplicate. */
        var raw = normalizeDateTimeKey_(r.attendance_date_time);
        if (raw) set[emp + '|' + raw] = true;
        return;
      }
      if (lo !== null && s < lo) return;
      if (hi !== null && s > hi) return;
      set[emp + '|' + normalizeDateTimeKey_(s)] = true;
    });
    return set;
  }

  function punchKey_(empId, serial) {
    var emp = normalizeEmpIdVF_(empId);
    if (!emp) return '';
    return emp + '|' + normalizeDateTimeKey_(serial);
  }

  function punchExists_(keySet, empId, serial) {
    var k = punchKey_(empId, serial);
    return !!(k && keySet[k]);
  }

  /* normalizeEmpIdVF_ deliberately keeps Arabic letters, and other callers
     depend on that — so the numeric guard lives at the attendance call sites
     instead of in the helper. "1أحمد" is not a code; it is a parse that went
     wrong, and it belongs in the review queue rather than in the table. */
  function attNumericEmpId_(rawValue) {
    var norm = normalizeEmpIdVF_(rawValue);
    if (!norm || !/^\d+$/.test(norm)) return null;
    return Number(norm);
  }

  function attBatchSheet_(dbId) {
    return ensureSheet_(dbId, ATT_BATCH_SHEET, ATT_BATCH_HEADERS);
  }

  /**
   * §8.2 — derive in/out from the punches themselves (D-25).
   *
   * first = earliest punch, last = latest, worked = the minutes between them.
   * Written to NOTHING: time_in / time_out stay manual-override columns, used
   * when they hold something and derived otherwise. A pair of punches is one
   * present day, not two attendances (D-19).
   *
   *   0 punches -> absent | 1 or an odd count -> incomplete | else present
   */
  function attPairPunches_(rows, empMap) {
    var byEmp = {};
    (rows || []).forEach(function (r) {
      var serial = flexToSerial_(r.attendance_date_time);
      if (serial === null) return;
      var eid = String(r.emp_id == null ? '' : r.emp_id).trim();
      if (!eid) return;
      var g = byEmp[eid];
      if (!g) g = byEmp[eid] = { emp_id: r.emp_id, first: serial, last: serial, punches: 0, time_in: '', time_out: '' };
      g.punches++;
      if (serial < g.first) g.first = serial;
      if (serial > g.last) g.last = serial;
      /* A manual override wins over the derived value when it is present. */
      if (r.time_in && String(r.time_in).trim()) g.time_in = r.time_in;
      if (r.time_out && String(r.time_out).trim()) g.time_out = r.time_out;
    });

    return Object.keys(byEmp).map(function (eid) {
      var g = byEmp[eid];
      var minutes = Math.round((g.last - g.first) * 1440);
      return {
        emp_id: g.emp_id,
        employee_name: (empMap && empMap[eid]) || eid,
        punches: g.punches,
        first: g.first,
        last: g.last,
        time_in_display: g.time_in ? String(g.time_in) : attendanceTimeOnly_(g.first),
        time_out_display: g.punches > 1 ? (g.time_out ? String(g.time_out) : attendanceTimeOnly_(g.last)) : (g.time_out ? String(g.time_out) : ''),
        worked_minutes: g.punches > 1 ? minutes : 0,
        status: (g.punches === 1 || g.punches % 2 === 1) ? 'incomplete' : 'present'
      };
    }).sort(function (a, b) { return (Number(a.emp_id) || 0) - (Number(b.emp_id) || 0); });
  }

  /** HH:mm of a serial, in serial space — never Utilities.formatDate. */
  function attendanceTimeOnly_(serial) {
    if (serial === null || serial === undefined || !isFinite(serial)) return '';
    var d = serialToDate_(serial);
    return _pad2(d.getUTCHours()) + ':' + _pad2(d.getUTCMinutes());
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
      //
      // D-27. The argument order here used to read (year, month, date) against
      // a signature of (day, month, year), so a Date-valued cell — which is
      // EXACTLY what getValues() hands back for the date-formatted
      // attendance_date_time column — came out as Date.UTC(date, month-1, year):
      // 7 Sep 2026 became 18 Mar 1913. Consistently wrong, so Date rows still
      // deduped against each other and the bug stayed invisible; but a freshly
      // parsed CSV serial never matched a stored Date row, which is one of the
      // two ways I-2 leaked. Every new path calls this, so it is corrected here
      // rather than compensated for at each call site.
      return dateTimePartsToSerial_(
        rawValue.getDate(), rawValue.getMonth() + 1, rawValue.getFullYear(),
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
    // Phase 12 — same transformation as 7.1: order is computed on an index array
    // first, so reverse().slice(0, limit) keeps its exact semantics while only the
    // visible rows are mapped. The slice stays ON THE INDEX ARRAY, which is what
    // makes a negative, fractional, string or NaN limit behave identically.
    var _order = [];
    for (var _i = _allRows.length - 1; _i >= 0; _i--) _order.push(_i);
    if (!data || !data.loadAll) _order = _order.slice(0, limit);
    var rows = _order.map(function (idx) {
      var r = _allRows[idx];
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
      row['abscence_type_days'] = '=if(VLOOKUP(D' + rowNumber + ',valley_employee_deduction_roles!A:C,3,0) = "غياب",F' + rowNumber + ' * INDEX(valley_employee_deduction_roles!H:H,MATCH(D' + rowNumber + ',valley_employee_deduction_roles!A:A,0)),0)';
      row['delay_type_minutes'] = '=if(VLOOKUP(D' + rowNumber + ',valley_employee_deduction_roles!A:C,3,0) = "حضور وانصراف",60* INDEX(valley_employee_deduction_roles!G:G,MATCH(D' + rowNumber + ',valley_employee_deduction_roles!A:A,0)),0)';
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
      noteMutation_(sheet);
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
    noteMutation_(sheet);
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
    noteMutation_(sheet);
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
              noteMutation_(allocSheet);
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
    // Phase 12 — slice before mapping; see getDeductionsData_.
    var _order = [];
    for (var _i = _allOT.length - 1; _i >= 0; _i--) _order.push(_i);
    if (!data || !data.loadAll) _order = _order.slice(0, limit);
    var rows = _order.map(function (idx) {
      var r = _allOT[idx];
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
    noteMutation_(sheet);
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
        basic_salary: '=INDEX(valley_employee_salary_updated!F:F,MATCH(A' + r + ',valley_employee_salary_updated!A:A,0))',
        allow: '=INDEX(valley_employee_salary_updated!E:E,MATCH(A' + r + ',valley_employee_salary_updated!A:A,0))',
        title: '=INDEX(valley_employee_info!E:E,MATCH(A' + r + ',valley_employee_info!A:A,0))',
        section: '=INDEX(valley_employee_info!F:F,MATCH(A' + r + ',valley_employee_info!A:A,0))',
        working_days: Number(e.working_days) || 30,
        working_hours: '=INDEX(valley_employee_info!J:J,MATCH(A' + r + ',valley_employee_info!A:A,0))',
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
    noteMutation_(sheet);
    /* ONE audit write for the whole run. Per-employee logHistory_ took the
       global script lock once per employee, which on a full monthly generation
       is the dominant cost of the save. */
    try {
      logHistoryMany_(entries.map(function (e) {
        var _rec = { emp_id: Number(e.emp_id), month: month, year: year, working_days: Number(e.working_days) || 30 };
        var _uid = _rec.emp_id + '_' + month + '_' + year;
        return {
          dbId: dbId, sheetName: EMP_MONTHLY_SALARIES_SHEET,
          recordUid: 'create_' + EMP_MONTHLY_SALARIES_SHEET + '_' + _uid,
          recordId: _uid, user: (user && user.email) || '',
          action: 'create', newValues: _rec, oldValues: null
        };
      }));
    } catch (e) {}
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
  /**
   * Per-day aggregates for the calendar (D-06, D-07).
   *
   * `{ from, to }` are yyyy-MM-dd month bounds, compared in SERIAL space —
   * never as Dates — so no timezone can move a day. Without them every session
   * is returned, which is what the table fallback and عرض الكل use.
   *
   * Ordering is by session_date, not by sheet insertion: rows were previously
   * returned in the order they happened to be appended, so a day added by hand
   * after an import sorted as if it were the newest day of the month.
   */
  function getAttendanceSessions_(data, user, dbId) {
    ensureSheet_(dbId, ATTENDANCE_SESSION_SHEET, ['session_id','session_date','session_status','selected_employees','user','created_at']);
    var d = data || {};

    var fromSerial = attDateOnlyInputToSerial_(d.from);
    var toSerial = attDateOnlyInputToSerial_(d.to);

    /* One grouped pass over the punch table, keyed by session id. Counting per
       day inside a loop over days would be one whole-table read per tile. */
    var bySession = {};
    try {
      getAllRecords_(dbId, EMP_ATTENDANCE_SHEET).forEach(function (r) {
        var sid = String(r.id || '').trim();
        if (!sid) return;
        var g = bySession[sid];
        if (!g) { g = bySession[sid] = { punches: 0, emps: {}, empCount: 0 }; }
        g.punches++;
        var emp = String(r.emp_id == null ? '' : r.emp_id).trim();
        if (emp) {
          if (g.emps[emp] === undefined) { g.emps[emp] = 0; g.empCount++; }
          g.emps[emp]++;
        }
      });
    } catch (e) { bySession = {}; }

    var rows = [];
    getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET).forEach(function (r) {
      var serial = flexToSerial_(r.session_date);
      if (serial === null) return;
      var daySerial = Math.floor(serial);
      if (fromSerial !== null && daySerial < fromSerial) return;
      if (toSerial !== null && daySerial > toSerial) return;

      var sid = String(r.session_id || '').trim();
      var g = bySession[sid] || { punches: 0, emps: {}, empCount: 0 };
      /* An exception is an employee whose punches that day do not pair up:
         a lone punch, or an odd number of them. Absences need the roster and
         belong to the exception queue, not to a calendar tile. */
      var exceptions = 0;
      Object.keys(g.emps).forEach(function (k) { if (g.emps[k] % 2 === 1) exceptions++; });

      rows.push({
        session_id: sid,
        session_date: daySerial,
        session_date_key: sessionDateKey_(daySerial),
        session_date_display: sessionDateDisplay_(daySerial),
        punches: g.punches,
        employees: g.empCount,
        exceptions: exceptions,
        import_batch_id: r.import_batch_id === undefined ? '' : r.import_batch_id,
        /* Kept on the wire because the column is still written; the UI stopped
           displaying it (D-23/D-24), which is a display decision only. */
        session_status: r.session_status,
        user: r.user,
        created_at: r.created_at
      });
    });

    rows.sort(function (a, b) { return b.session_date - a.session_date; });

    var lim = (d.loadAll || fromSerial !== null || toSerial !== null)
      ? null
      : ((d.limit != null) ? Number(d.limit) : 10);
    var sp = vfPage_(rows, { limit: lim, offset: d.offset || 0 });
    return { status: 'success', sessions: sp.rows, total: sp.total };
  }

  /** "yyyy-MM-dd" from a date input -> a day serial, in serial space. */
  function attDateOnlyInputToSerial_(v) {
    if (v === '' || v === null || v === undefined) return null;
    var m = String(v).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) {
      var s = flexToSerial_(v);
      return s === null ? null : Math.floor(s);
    }
    return dateOnlyToSerial_(Number(m[3]), Number(m[2]), Number(m[1]));
  }

  /**
   * The roster, on its own (D-22).
   *
   * The manual-entry modal used to call get_attendance_data with no session_id
   * purely to reach its employee_options — which read the WHOLE punch table,
   * every employee and every status row, to fill a dropdown.
   */
  function getAttendanceEmployees_(data, user, dbId) {
    var opts = [];
    try { opts = getActiveEmployeeOptions_(dbId); } catch (e) { opts = []; }
    return { status: 'success', employee_options: opts };
  }

  function addAttendanceSession_(data, user, dbId) {
    var sessionDate = parseDate_(data.session_date);
    if (!sessionDate) throw new Error('التاريخ مطلوب');
    var serial = dateOnlyToSerial_(sessionDate.getDate(), sessionDate.getMonth() + 1, sessionDate.getFullYear());

    /* D-03. The ad-hoc "read every session, scan for this date, then append"
       is gone: resolveSession_ is the one writer and it runs under the lock.
       This handler keeps its own contract — creating a day that already exists
       is a user error and still says so — but it learns that from the resolver
       rather than from a second, separately-drifting scan. */
    return withAttLock_(function () {
      var res = resolveSession_(dbId, serial, user, '');
      if (!res.created) {
        throw new Error('يوجد جلسة مسجلة بالفعل لهذا التاريخ (' + sessionDateDisplay_(serial) + ')');
      }
      var savedRecordSess = {
        session_id: res.session_id,
        session_date: serial,
        session_date_display: sessionDateDisplay_(serial),
        session_status: 'pending',
        selected_employees: '',
        user: (user && user.email) || '',
        created_at: new Date()
      };
      return { status: 'success', message: 'تم إنشاء الجلسة', data: { session_id: res.session_id }, record: savedRecordSess };
    });
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
    /* D-22. The employee list moved to get_attendance_employees. This handler
       used to read the whole punch table AND every employee AND every status
       row on a call whose only purpose was to fill a dropdown. */
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
    /* D-05. A single day is bounded by definition — a session cannot hold more
       punches than the company has employees times their punches that day — so
       asking for one session never pages. The modal used to load 10 rows and
       then print `rows.length` as "عدد السجلات", so a day with 120 punches
       reported 120 as 10 and looked like data loss. */
    if ((data && data.loadAll) || sessionId) {
      ap = vfPage_(rows, { limit: null, offset: 0 }, 'attendance_date_time');
    } else {
      var lim2 = (data && data.limit != null) ? Number(data.limit) : limit;
      ap = vfPage_(rows, { limit: lim2, offset: (data && data.offset) || 0 }, 'attendance_date_time');
    }
    /* §8.2 pairing, derived on read and written to nothing. time_in/time_out
       stay manual-override columns: used when present, derived otherwise. */
    var perEmployee = sessionId ? attPairPunches_(rows, empMap) : [];
    return {
      status: 'success', rows: ap.rows, total: ap.total, totalRecords: totalBeforeCap,
      per_employee: perEmployee
    };
  }

  /**
   * D-01/D-02/D-21. The punch datetime is the only input that decides which day
   * this punch belongs to: the session is RESOLVED from it, never taken from
   * the client. A client that sends a session_id for a different day (which the
   * old 10-session dropdown made easy) can no longer file a punch under the
   * wrong header, because there is nowhere for it to say so.
   */
  /**
   * Write ONE punch. The caller must already hold withAttLock_.
   *
   * Extracted so the manual add and the review-queue fix are not two code paths
   * that have to keep agreeing about I-2 — they are the same one.
   */
  function attAddPunchLocked_(dbId, empId, serial, user, extra) {
    extra = extra || {};
    var keySet = buildPunchKeySet_(dbId, [serial, serial]);
    if (punchExists_(keySet, empId, serial)) {
      throw new Error('هذه البصمة مسجلة بالفعل لهذا الموظف في نفس التاريخ والوقت');
    }

    var daySerial = Math.floor(serial);
    var session = resolveSession_(dbId, daySerial, user, '');

    var sheet = getSheet_(EMP_ATTENDANCE_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var row = {};
    row['unique_id'] = Utilities.getUuid();
    row['id'] = session.session_id;
    row['emp_id'] = empId;
    row['attendance_date_time'] = serial;
    row['time_in'] = extra.time_in || '';
    row['time_out'] = extra.time_out || '';
    row['excuse_in'] = extra.excuse_in || '';
    row['excuse_out'] = extra.excuse_out || '';
    row['abscence'] = extra.abscence || '';
    row['user'] = (user && user.email) || '';
    row['created_at'] = new Date();
    if (hasCol_(headers, 'import_batch_id')) row['import_batch_id'] = '';
    if (hasCol_(headers, 'entry_source')) row['entry_source'] = extra.entry_source || 'manual';
    if (hasCol_(headers, 'parsed_format')) row['parsed_format'] = extra.parsed_format || 'MANUAL';
    if (hasCol_(headers, 'source_raw')) row['source_raw'] = extra.source_raw || '';

    var rowNum = sheet.getLastRow() + 1;
    sheet.appendRow(attRowValues_(headers, row));
    noteMutation_(sheet);
    /* D-21. This used to re-format the WHOLE column on every single insert —
       one setNumberFormat over tens of thousands of cells per added punch.
       The new cell is the only one that needs it. */
    var atIdx = attColIdx_(headers, 'attendance_date_time');
    if (atIdx !== -1) {
      try { sheet.getRange(rowNum, atIdx + 1).setNumberFormat('dd/mm/yyyy hh:mm'); noteMutation_(sheet); } catch (e) { /* non-fatal */ }
    }
    /* One row added by hand keeps its per-row history entry. The batch entry
       that replaces per-row logging on import has no meaning here. */
    try {
      logHistory_(dbId, EMP_ATTENDANCE_SHEET, 'create_' + EMP_ATTENDANCE_SHEET + '_' + row['unique_id'],
        row['unique_id'], (user && user.email) || '', 'create', row, null);
    } catch (e) { /* history is never allowed to fail a write */ }

    return { row: row, session: session, daySerial: daySerial };
  }

  function addManualAttendance_(data, user, dbId) {
    var empId = attNumericEmpId_(data && data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var dt = parseDate_(data && data.attendance_date_time);
    if (!dt) throw new Error('تاريخ ووقت الحضور مطلوب');
    // Store as minute-precision numeric serial (integer-based, never text/Date).
    var serial = toSerialInt_(dateTimePartsToSerial_(dt.getDate(), dt.getMonth() + 1, dt.getFullYear(), dt.getHours(), dt.getMinutes()));

    return withAttLock_(function () {
      var res = attAddPunchLocked_(dbId, empId, serial, user, {
        time_in: (data && data.time_in) || '',
        time_out: (data && data.time_out) || '',
        excuse_in: (data && data.excuse_in) || '',
        excuse_out: (data && data.excuse_out) || '',
        abscence: (data && data.abscence) || ''
      });
      var row = res.row;
      var _empMapMan = buildEmpNameMap_(dbId);
      var savedRecordMan = {
        unique_id: row['unique_id'], id: row['id'], emp_id: empId,
        employee_name: _empMapMan[String(empId)] || String(empId),
        attendance_date_time: serial,
        attendance_time_display: attendanceTimeDisplay_(serial),
        session_date: res.daySerial,
        session_date_display: sessionDateDisplay_(res.daySerial),
        time_in: row['time_in'], time_out: row['time_out'],
        excuse_in: row['excuse_in'], excuse_out: row['excuse_out'], abscence: row['abscence'],
        user: row['user'], created_at: row['created_at']
      };
      return {
        status: 'success', message: 'تم تسجيل الحضور',
        data: { unique_id: row['unique_id'], session_id: res.session.session_id, session_created: res.session.created },
        record: savedRecordMan
      };
    });
  }

  // ===================== WORK QUEUES =====================
  /**
   * The review queue (D-16).
   *
   * valley_attendance_needs_review has existed all along with no UI at all —
   * the result panel told the user to go and open a raw sheet by name. The
   * sheet name never appears in the interface again.
   */
  function getAttendanceReview_(data, user, dbId) {
    var wanted = String((data && data.status) || 'open').trim();
    var rows = [];
    var headers = [];
    try {
      ensureSheet_(dbId, ATT_REVIEW_SHEET, ['raw_row_text','reason','chosen_format','uploaded_by','uploaded_at']);
      headers = getHeaders_(getSheet_(ATT_REVIEW_SHEET, dbId));
      rows = getAllRecords_(dbId, ATT_REVIEW_SHEET);
    } catch (e) { rows = []; }

    var hasStatus = hasCol_(headers, 'review_status');
    var hasId = hasCol_(headers, 'review_id');
    var empMap = buildEmpNameMap_(dbId);

    var out = [];
    var openCount = 0;
    rows.forEach(function (r) {
      /* A row written before the §1 columns were added has no status. It is
         open by definition — nothing has resolved it. */
      var status = hasStatus ? String(r.review_status || 'open').trim() : 'open';
      if (status === 'open') openCount++;
      if (wanted !== 'all' && status !== wanted) return;
      var guess = r.datetime_guess === '' || r.datetime_guess == null ? null : flexToSerial_(r.datetime_guess);
      out.push({
        review_id: hasId ? r.review_id : '',
        raw_row_text: r.raw_row_text,
        reason: r.reason,
        chosen_format: r.chosen_format,
        uploaded_by: r.uploaded_by,
        uploaded_at: r.uploaded_at,
        import_batch_id: r.import_batch_id === undefined ? '' : r.import_batch_id,
        review_status: status,
        emp_id_guess: r.emp_id_guess === undefined ? '' : r.emp_id_guess,
        employee_name_guess: empMap[String(r.emp_id_guess)] || '',
        datetime_guess: guess,
        datetime_guess_display: guess === null ? '' : attendanceTimeDisplay_(guess),
        resolved_by: r.resolved_by === undefined ? '' : r.resolved_by,
        resolved_at: r.resolved_at === undefined ? '' : r.resolved_at
      });
    });
    out.reverse();

    var p = vfPage_(out, { limit: (data && data.loadAll) ? null : ((data && data.limit != null) ? Number(data.limit) : 25), offset: (data && data.offset) || 0 });
    return {
      status: 'success', rows: p.rows, total: p.total, open_count: openCount,
      /* Without review_id there is no way to address one row, so the client
         shows the queue read-only rather than offering a button that cannot
         work. */
      resolvable: hasId && hasStatus
    };
  }

  /**
   * Resolve one review row. `import` runs the SAME validated path as a manual
   * add — lock, dedup, resolveSession_ — and flips the row to `fixed`;
   * `discard` flips it to `discarded`. Nothing is ever deleted, so the audit
   * trail survives either way.
   */
  function resolveAttendanceReview_(data, user, dbId) {
    var d = data || {};
    var reviewId = String(d.review_id || '').trim();
    if (!reviewId) throw new Error('رقم صف المراجعة مطلوب');
    var action = String(d.action || '').trim();
    if (action !== 'import' && action !== 'discard') throw new Error('الإجراء غير معروف');

    return withAttLock_(function () {
      ensureSheet_(dbId, ATT_REVIEW_SHEET, ['raw_row_text','reason','chosen_format','uploaded_by','uploaded_at']);
      var sheet = getSheet_(ATT_REVIEW_SHEET, dbId);
      var headers = getHeaders_(sheet);
      if (!hasCol_(headers, 'review_id') || !hasCol_(headers, 'review_status')) {
        throw new Error('لا يمكن معالجة المراجعة: العمودان review_id و review_status غير موجودين في جدول valley_attendance_needs_review');
      }
      var target = null;
      getAllRecords_(dbId, ATT_REVIEW_SHEET).forEach(function (r) {
        if (String(r.review_id || '').trim() === reviewId) target = r;
      });
      if (!target) throw new Error('صف المراجعة غير موجود');
      if (String(target.review_status || 'open').trim() !== 'open') {
        throw new Error('تمت معالجة هذا الصف من قبل');
      }

      var updates = {
        review_status: action === 'import' ? 'fixed' : 'discarded',
        resolved_by: (user && user.email) || '',
        resolved_at: new Date()
      };

      var imported = null;
      if (action === 'import') {
        var empId = attNumericEmpId_(d.emp_id !== undefined && d.emp_id !== '' ? d.emp_id : target.emp_id_guess);
        if (empId === null) throw new Error('كود الموظف غير رقمي');
        var serial = null;
        if (d.attendance_date_time !== undefined && d.attendance_date_time !== '') {
          var dt = parseDate_(d.attendance_date_time);
          if (!dt) throw new Error('تاريخ ووقت البصمة مطلوب');
          serial = toSerialInt_(dateTimePartsToSerial_(dt.getDate(), dt.getMonth() + 1, dt.getFullYear(), dt.getHours(), dt.getMinutes()));
        } else {
          serial = toSerialInt_(target.datetime_guess);
        }
        if (serial === null) throw new Error('تاريخ ووقت البصمة مطلوب');
        var win = attPlausibleWindow_();
        if (serial < win.min || serial > win.max) throw new Error('التاريخ خارج الفترة المعقولة');

        var res = attAddPunchLocked_(dbId, empId, serial, user, {
          entry_source: 'manual', parsed_format: 'MANUAL',
          source_raw: String(target.raw_row_text || '').slice(0, 500)
        });
        imported = {
          unique_id: res.row.unique_id, emp_id: empId,
          attendance_date_time: serial,
          attendance_time_display: attendanceTimeDisplay_(serial),
          session_id: res.session.session_id, session_created: res.session.created
        };
      }

      updateRowByCriteria_(sheet, 'review_id', reviewId, updates);
      try {
        logHistory_(dbId, ATT_REVIEW_SHEET, 'resolve_' + ATT_REVIEW_SHEET + '_' + reviewId, reviewId,
          (user && user.email) || '', 'update', updates, { review_status: 'open' });
      } catch (e) { /* history is never allowed to fail a write */ }

      return {
        status: 'success',
        message: action === 'import' ? 'تم تسجيل البصمة وإغلاق صف المراجعة' : 'تم استبعاد الصف',
        review_id: reviewId, action: action, imported: imported
      };
    });
  }

  /**
   * The missing-punch queue (D-26).
   *
   * The cross product of the ACTIVE roster and every day in range that has a
   * session — which is what makes an absence visible at all: an employee with
   * no punches has no rows, so nothing derived from the punch table alone can
   * ever mention them.
   *
   *   absent      0 punches
   *   incomplete  a single punch, or an odd number of them
   *   present     >= 2 punches, an even number
   */
  function getAttendanceExceptions_(data, user, dbId) {
    var d = data || {};
    var fromSerial = attDateOnlyInputToSerial_(d.from);
    var toSerial = attDateOnlyInputToSerial_(d.to);
    if (fromSerial === null || toSerial === null) throw new Error('تاريخ البداية والنهاية مطلوب');
    if (toSerial < fromSerial) throw new Error('تاريخ النهاية قبل تاريخ البداية');

    var sessions = [];
    getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET).forEach(function (s) {
      var serial = flexToSerial_(s.session_date);
      if (serial === null) return;
      var day = Math.floor(serial);
      if (day < fromSerial || day > toSerial) return;
      var sid = String(s.session_id || '').trim();
      if (sid) sessions.push({ session_id: sid, day: day });
    });
    sessions.sort(function (a, b) { return a.day - b.day; });

    var sessionDay = {};
    sessions.forEach(function (s) { sessionDay[s.session_id] = s.day; });

    /* One pass: (day, emp) -> punch serials. */
    var byDayEmp = {};
    getAllRecords_(dbId, EMP_ATTENDANCE_SHEET).forEach(function (r) {
      var day = sessionDay[String(r.id || '').trim()];
      if (day === undefined) {
        /* A punch whose session is outside the range, or orphaned: fall back to
           its own date so it is still counted on the day it happened. */
        var s = flexToSerial_(r.attendance_date_time);
        if (s === null) return;
        day = Math.floor(s);
        if (day < fromSerial || day > toSerial) return;
        if (sessionDay[String(r.id || '').trim()] === undefined && !sessions.some(function (x) { return x.day === day; })) return;
      }
      var emp = attNumericEmpId_(r.emp_id);
      if (emp === null) return;
      var key = day + '|' + emp;
      var serial = flexToSerial_(r.attendance_date_time);
      if (serial === null) return;
      if (!byDayEmp[key]) byDayEmp[key] = [];
      byDayEmp[key].push(serial);
    });

    var roster = [];
    try { roster = getActiveEmployeeOptions_(dbId); } catch (e) { roster = []; }
    var empMap = buildEmpNameMap_(dbId);

    var rows = [];
    var counts = { absent: 0, incomplete: 0, present: 0 };
    sessions.forEach(function (s) {
      roster.forEach(function (o) {
        var emp = attNumericEmpId_(o.value);
        if (emp === null) return;
        var punches = byDayEmp[s.day + '|' + emp] || [];
        var status = punches.length === 0 ? 'absent'
          : ((punches.length === 1 || punches.length % 2 === 1) ? 'incomplete' : 'present');
        counts[status]++;
        if (status === 'present') return;   /* the queue is what needs work */
        punches.sort(function (a, b) { return a - b; });
        rows.push({
          session_id: s.session_id,
          session_date: s.day,
          session_date_key: sessionDateKey_(s.day),
          session_date_display: sessionDateDisplay_(s.day),
          emp_id: emp,
          employee_name: empMap[String(emp)] || String(emp),
          punches: punches.length,
          first_display: punches.length ? attendanceTimeOnly_(punches[0]) : '',
          last_display: punches.length > 1 ? attendanceTimeOnly_(punches[punches.length - 1]) : '',
          /* Which half is missing, so the printed form can say so. */
          missing: punches.length === 0 ? 'both' : 'out',
          status: status
        });
      });
    });

    rows.sort(function (a, b) { return (b.session_date - a.session_date) || (a.emp_id - b.emp_id); });
    var p = vfPage_(rows, { limit: (d.loadAll) ? null : ((d.limit != null) ? Number(d.limit) : 100), offset: d.offset || 0 });
    return {
      status: 'success', rows: p.rows, total: p.total, counts: counts,
      working_days: sessions.length
    };
  }

  /**
   * Undo one import, whole. A wrong format choice used to write thousands of
   * rows with no way back but the raw sheet; the batch id on every punch is
   * what makes them findable again.
   */
  function revertAttendanceImport_(data, user, dbId) {
    var batchId = String((data && data.batch_id) || '').trim();
    if (!batchId) throw new Error('رقم عملية الرفع مطلوب');

    return withAttLock_(function () {
      var attSheet = getSheet_(EMP_ATTENDANCE_SHEET, dbId);
      if (!hasCol_(getHeaders_(attSheet), 'import_batch_id')) {
        throw new Error('لا يمكن التراجع: العمود import_batch_id غير موجود في جدول valley_employee_attendance');
      }

      var batchSheet = attBatchSheet_(dbId);
      var batch = null;
      getAllRecords_(dbId, ATT_BATCH_SHEET).forEach(function (b) {
        if (String(b.batch_id || '').trim() === batchId) batch = b;
      });
      if (!batch) throw new Error('عملية الرفع غير موجودة');
      var wasStatus = String(batch.batch_status || '').trim();
      if (wasStatus === 'reverted') throw new Error('تم التراجع عن عملية الرفع هذه من قبل');

      var punchesDeleted = deleteRowsByCriteria_(attSheet, 'import_batch_id', batchId);

      /* An auto-created session is removed only when the revert left it EMPTY.
         A day that also holds a manually added punch keeps its session: that
         punch carries no batch id and was never this batch's to undo. */
      var sessionsDeleted = 0;
      var sessSheet = getSheet_(ATTENDANCE_SESSION_SHEET, dbId);
      if (hasCol_(getHeaders_(sessSheet), 'import_batch_id')) {
        var remaining = {};
        getAllRecords_(dbId, EMP_ATTENDANCE_SHEET).forEach(function (r) {
          var k = String(r.id || '').trim();
          if (k) remaining[k] = (remaining[k] || 0) + 1;
        });
        /* Collect first, delete once. Calling deleteRowsByCriteria_ per session
           re-read the whole session sheet for every day the revert emptied. */
        var emptySessionIds = [];
        getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET).forEach(function (s) {
          if (String(s.import_batch_id || '').trim() !== batchId) return;
          var sid = String(s.session_id || '').trim();
          if (!sid || remaining[sid]) return;
          emptySessionIds.push(sid);
        });
        sessionsDeleted = deleteRowsWhereIn_(sessSheet, 'session_id', emptySessionIds);
      }

      var reviewDeleted = 0;
      try {
        var reviewSheet = getSheet_(ATT_REVIEW_SHEET, dbId);
        if (hasCol_(getHeaders_(reviewSheet), 'import_batch_id')) {
          reviewDeleted = deleteRowsByCriteria_(reviewSheet, 'import_batch_id', batchId);
        }
      } catch (e) { /* the review sheet need not exist */ }

      updateRowByCriteria_(batchSheet, 'batch_id', batchId, {
        batch_status: 'reverted',
        reverted_by: (user && user.email) || '',
        reverted_at: new Date()
      });

      /* ONE history entry for the whole revert. The per-row loop the import
         used to run is fine for 40 rows and fatal for 40 000; the batch row
         plus import_batch_id on every punch is the audit trail. */
      try {
        logHistory_(dbId, ATT_BATCH_SHEET, 'revert_' + ATT_BATCH_SHEET + '_' + batchId, batchId,
          (user && user.email) || '', 'update',
          { batch_id: batchId, batch_status: 'reverted', punches_deleted: punchesDeleted, sessions_deleted: sessionsDeleted, review_deleted: reviewDeleted },
          { batch_id: batchId, batch_status: wasStatus || 'active' });
      } catch (e) { /* history is never allowed to fail a write */ }

      return {
        status: 'success',
        message: 'تم التراجع عن عملية الرفع: حُذفت ' + punchesDeleted + ' بصمة و ' + sessionsDeleted + ' يوم',
        punches_deleted: punchesDeleted,
        sessions_deleted: sessionsDeleted,
        review_deleted: reviewDeleted
      };
    });
  }

  /**
   * One small read that lets the inference engine corroborate a hypothesis
   * against reality: which days already have a session, and which employee
   * codes exist. No punch rows — that is the whole point, the client used to
   * have to send the file to the server to learn any of this.
   */
  function getAttendanceIndex_(data, user, dbId) {
    var sessionDates = [];
    try {
      var seen = {};
      getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET).forEach(function (s) {
        var k = sessionDateKey_(s.session_date);
        if (k && /^\d{4}-\d{2}-\d{2}$/.test(k) && !seen[k]) { seen[k] = true; sessionDates.push(k); }
      });
      sessionDates.sort();
    } catch (e) { sessionDates = []; }

    var empIds = [];
    try {
      var seenEmp = {};
      getAllRecords_(dbId, EMP_INFO_SHEET).forEach(function (e) {
        var id = attNumericEmpId_(e.emp_id);
        if (id !== null && !seenEmp[id]) { seenEmp[id] = true; empIds.push(id); }
      });
      empIds.sort(function (a, b) { return a - b; });
    } catch (e) { empIds = []; }

    return { status: 'success', session_dates: sessionDates, emp_ids: empIds };
  }

  /** The permanent home of undo: every import, newest first. */
  function getAttendanceBatches_(data, user, dbId) {
    var raw = [];
    try {
      attBatchSheet_(dbId);
      raw = getAllRecords_(dbId, ATT_BATCH_SHEET);
    } catch (e) { raw = []; }

    var rows = raw.map(function (b) {
      return {
        batch_id: b.batch_id,
        file_name: b.file_name,
        file_rows: Number(b.file_rows) || 0,
        uploaded_by: b.uploaded_by,
        uploaded_at: b.uploaded_at,
        chosen_format: b.chosen_format,
        detected_format: b.detected_format,
        confidence: b.confidence,
        rows_imported: Number(b.rows_imported) || 0,
        rows_duplicate: Number(b.rows_duplicate) || 0,
        rows_flagged: Number(b.rows_flagged) || 0,
        sessions_created: Number(b.sessions_created) || 0,
        date_min: b.date_min,
        date_max: b.date_max,
        date_min_display: b.date_min === '' || b.date_min == null ? '' : sessionDateDisplay_(b.date_min),
        date_max_display: b.date_max === '' || b.date_max == null ? '' : sessionDateDisplay_(b.date_max),
        batch_status: String(b.batch_status || 'active'),
        reverted_by: b.reverted_by,
        reverted_at: b.reverted_at
      };
    }).reverse();

    /* vfPage_ reads limit:null as unlimited; note that limit:0 would mean an
       EMPTY page, not an unlimited one, so loadAll goes through null. */
    var lim = (data && data.loadAll) ? null : ((data && data.limit != null) ? Number(data.limit) : 10);
    var p = vfPage_(rows, { limit: lim, offset: (data && data.offset) || 0 }, 'uploaded_at');
    return { status: 'success', batches: p.rows, total: p.total };
  }

  // ---- Chunked import commit ----
  /* The two old CSV actions are gone. The file used to cross the wire twice —
     once to be analysed, once to be imported, 5 MB cap each — and the server
     had to be a CSV parser to answer either. Now the browser parses
     (Client_AttendanceParser.html) and posts rows.

     The server still re-validates everything: the numeric code, the plausibility
     window and the duplicate check all run again here. A client is a thing that
     can be wrong or lying, and I-2 is not the client's invariant to keep. */

  /* Mirrors the client's window exactly. Deliberately built in serial space so
     no Date, no setHours and no script timezone is involved. */
  function attPlausibleWindow_() {
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    return { min: dateOnlyToSerial_(d, m, y - 3), max: dateOnlyToSerial_(d, m, y) + 2 };
  }

  function attFindBatch_(dbId, batchId) {
    var found = null;
    getAllRecords_(dbId, ATT_BATCH_SHEET).forEach(function (b) {
      if (String(b.batch_id || '').trim() === batchId) found = b;
    });
    return found;
  }

  /**
   * One chunk of an import. Chunk 0 writes the batch row; the last chunk
   * finalises it. A chunk that fails leaves the batch `active` and partially
   * written — which is acceptable precisely because the client already holds
   * the batch_id and can point undo straight at it.
   */
  function commitAttendanceImport_(data, user, dbId) {
    var d = data || {};
    var batchId = String(d.batch_id || '').trim();
    if (!batchId) throw new Error('رقم عملية الرفع مطلوب');
    var rows = d.rows || [];
    var flagged = d.flagged || [];
    var chunkIndex = Number(d.chunk_index) || 0;
    var isLast = !!d.is_last;
    if (rows.length > 20000) throw new Error('حجم الدفعة كبير جداً');

    var format = String(d.format || '').toUpperCase();
    var dateMin = (d.date_min === '' || d.date_min == null) ? null : Number(d.date_min);
    var dateMax = (d.date_max === '' || d.date_max == null) ? null : Number(d.date_max);

    return withAttLock_(function () {
      ensureSheet_(dbId, ATTENDANCE_SESSION_SHEET, ['session_id','session_date','session_status','selected_employees','user','created_at']);
      ensureSheet_(dbId, EMP_ATTENDANCE_SHEET, ['unique_id','id','emp_id','attendance_date_time','time_in','time_out','excuse_in','excuse_out','abscence','user','created_at']);
      ensureSheet_(dbId, ATT_REVIEW_SHEET, ['raw_row_text','reason','chosen_format','uploaded_by','uploaded_at']);

      var attSheet = getSheet_(EMP_ATTENDANCE_SHEET, dbId);
      var attHeaders = getHeaders_(attSheet);
      var reviewSheet = getSheet_(ATT_REVIEW_SHEET, dbId);
      var reviewHeaders = getHeaders_(reviewSheet);
      var batchSheet = attBatchSheet_(dbId);
      var batchHeaders = getHeaders_(batchSheet);

      var recordedUser = (user && user.email) || 'System';
      var stamp = new Date();

      var batch = attFindBatch_(dbId, batchId);
      if (chunkIndex === 0) {
        if (batch) throw new Error('عملية الرفع هذه مسجلة بالفعل');
        batchSheet.appendRow(attRowValues_(batchHeaders, {
          batch_id: batchId,
          file_name: String(d.file_name || 'ملف'),
          file_rows: Number(d.file_rows) || (rows.length + flagged.length),
          uploaded_by: recordedUser,
          uploaded_at: stamp,
          chosen_format: format,
          detected_format: String(d.detected_format || ''),
          confidence: String(d.confidence || ''),
          rows_imported: 0, rows_duplicate: 0, rows_flagged: 0, sessions_created: 0,
          date_min: dateMin === null ? '' : dateMin,
          date_max: dateMax === null ? '' : dateMax,
          batch_status: 'active', reverted_by: '', reverted_at: ''
        }));
        noteMutation_(batchSheet);
        batch = attFindBatch_(dbId, batchId);
      } else {
        if (!batch) throw new Error('عملية الرفع غير موجودة — ابدأ من جديد');
        if (String(batch.batch_status || '').trim() === 'reverted') {
          throw new Error('تم التراجع عن عملية الرفع هذه، لا يمكن إكمالها');
        }
      }

      /* Rebuilt PER CHUNK, filtered to the batch's own date window. Correct by
         construction — a punch can only collide with another punch at the same
         instant, and that instant is inside the window by definition — and it
         keeps the set to a few thousand keys for a month-sized file. Rows
         appended by chunk N are on the sheet before chunk N+1 rebuilds, so a
         duplicate ACROSS chunks of one batch is caught with no bookkeeping.
         Not CacheService: one value caps at 100 KB and a real set exceeds it
         silently. */
      var win = attPlausibleWindow_();
      var lo = (dateMin === null) ? null : Math.min(dateMin, win.min);
      var hi = (dateMax === null) ? null : (dateMax + 1);
      var keySet = buildPunchKeySet_(dbId, (lo === null || hi === null) ? null : [lo, hi]);

      var toAppend = [];
      var reviewToAppend = [];
      var imported = 0, duplicate = 0, flaggedCount = 0, sessionsCreated = 0;
      var sessionByDay = {};

      function pushReview(raw, reason, empGuess, serialGuess) {
        var r = {
          raw_row_text: String(raw || '').slice(0, 500),
          reason: reason,
          chosen_format: format,
          uploaded_by: recordedUser,
          uploaded_at: stamp
        };
        if (hasCol_(reviewHeaders, 'review_id')) r.review_id = Utilities.getUuid();
        if (hasCol_(reviewHeaders, 'import_batch_id')) r.import_batch_id = batchId;
        if (hasCol_(reviewHeaders, 'review_status')) r.review_status = 'open';
        if (hasCol_(reviewHeaders, 'emp_id_guess')) r.emp_id_guess = empGuess == null ? '' : empGuess;
        if (hasCol_(reviewHeaders, 'datetime_guess')) r.datetime_guess = (serialGuess === '' || serialGuess == null) ? '' : Number(serialGuess);
        if (hasCol_(reviewHeaders, 'resolved_by')) r.resolved_by = '';
        if (hasCol_(reviewHeaders, 'resolved_at')) r.resolved_at = '';
        reviewToAppend.push(attRowValues_(reviewHeaders, r));
        flaggedCount++;
      }

      (flagged || []).forEach(function (f) {
        pushReview(f[0], String(f[1] || 'يحتاج مراجعة'), f[2], f[3]);
      });

      rows.forEach(function (row) {
        var rawText = String(row[2] == null ? '' : row[2]);
        /* Re-validated server-side. The client already checked all three; a
           client is not what I-2 rests on. */
        var empId = attNumericEmpId_(row[0]);
        if (empId === null) { pushReview(rawText, 'كود الموظف غير رقمي', row[0], ''); return; }

        var serial = toSerialInt_(row[1]);
        if (serial === null) { pushReview(rawText, 'تعذر قراءة التاريخ والوقت', empId, ''); return; }
        if (serial < win.min || serial > win.max) {
          pushReview(rawText, 'التاريخ خارج الفترة المعقولة', empId, serial);
          return;
        }

        if (punchExists_(keySet, empId, serial)) { duplicate++; return; }

        var daySerial = Math.floor(serial);
        var dayKey = String(daySerial);
        var sessionId = sessionByDay[dayKey];
        if (!sessionId) {
          var resolved = resolveSession_(dbId, daySerial, user, batchId);
          sessionId = resolved.session_id;
          sessionByDay[dayKey] = sessionId;
          if (resolved.created) sessionsCreated++;
        }

        var newRow = {
          unique_id: Utilities.getUuid(),
          id: sessionId,
          emp_id: empId,
          attendance_date_time: serial,
          time_in: '', time_out: '', excuse_in: '', excuse_out: '', abscence: '',
          user: recordedUser,
          created_at: stamp
        };
        if (hasCol_(attHeaders, 'import_batch_id')) newRow.import_batch_id = batchId;
        if (hasCol_(attHeaders, 'entry_source')) newRow.entry_source = 'upload';
        if (hasCol_(attHeaders, 'parsed_format')) newRow.parsed_format = format;
        if (hasCol_(attHeaders, 'source_raw')) newRow.source_raw = rawText.slice(0, 500);
        toAppend.push(attRowValues_(attHeaders, newRow));
        keySet[punchKey_(empId, serial)] = true;
        imported++;
      });

      if (toAppend.length) {
        var startRow = attSheet.getLastRow() + 1;
        var atIdx = attColIdx_(attHeaders, 'attendance_date_time');
        if (atIdx !== -1) {
          attSheet.getRange(startRow, atIdx + 1, toAppend.length, 1).setNumberFormat('dd/mm/yyyy hh:mm');
          noteMutation_(attSheet);
        }
        attSheet.getRange(startRow, 1, toAppend.length, attHeaders.length).setValues(toAppend);
        noteMutation_();
        /* Append-only. D-20's whole-sheet Range.sort is not coming back. */
      }

      if (reviewToAppend.length) {
        var revStart = reviewSheet.getLastRow() + 1;
        reviewSheet.getRange(revStart, 1, reviewToAppend.length, reviewHeaders.length).setValues(reviewToAppend);
        noteMutation_();
      }

      /* Counters accumulate on the batch row, so a resumed or partial import
         still reports what actually landed. */
      var totals = {
        rows_imported: (Number(batch && batch.rows_imported) || 0) + imported,
        rows_duplicate: (Number(batch && batch.rows_duplicate) || 0) + duplicate,
        rows_flagged: (Number(batch && batch.rows_flagged) || 0) + flaggedCount,
        sessions_created: (Number(batch && batch.sessions_created) || 0) + sessionsCreated
      };
      updateRowByCriteria_(batchSheet, 'batch_id', batchId, totals);

      /* ONE history entry per batch, written when the batch closes — not one
         per row, which is fine for 40 rows and fatal for 40 000. */
      if (isLast) {
        try {
          logHistory_(dbId, ATT_BATCH_SHEET, 'create_' + ATT_BATCH_SHEET + '_' + batchId, batchId,
            recordedUser, 'create',
            {
              batch_id: batchId, file_name: String(d.file_name || ''), chosen_format: format,
              confidence: String(d.confidence || ''),
              rows_imported: totals.rows_imported, rows_duplicate: totals.rows_duplicate,
              rows_flagged: totals.rows_flagged, sessions_created: totals.sessions_created,
              date_min: dateMin, date_max: dateMax
            }, null);
        } catch (e) { /* history is never allowed to fail a write */ }
      }

      return {
        status: 'success',
        batch_id: batchId,
        chunk_index: chunkIndex,
        is_last: isLast,
        chunk: { imported: imported, duplicate: duplicate, flagged: flaggedCount, sessions_created: sessionsCreated },
        totals: totals,
        has_batch_column: hasCol_(attHeaders, 'import_batch_id'),
        message: isLast
          ? ('تم الاستيراد: ' + totals.rows_imported + ' جديد، ' + totals.rows_duplicate + ' مكرر' +
             (totals.rows_flagged ? '، ' + totals.rows_flagged + ' يحتاج مراجعة' : ''))
          : ('تم استيراد جزء ' + (chunkIndex + 1))
      };
    });
  }

  /**
   * تقرير الحضور والغياب.
   *
   * The old handler answered "how many punch ROWS does this employee have",
   * which is not a question anyone asked, and it answered it wrongly in four
   * separate ways:
   *
   *   D-08  endDate.setHours(...) ran BEFORE the `if (!endDate)` guard, so a
   *         blank end date was a TypeError rather than a message.
   *   D-09  the range was built by mixing UTC-derived serial Dates with local
   *         setHours, which clipped the last 2-3 hours of the final day. Both
   *         bounds are now serials and no Date is constructed at all, so the
   *         timezone question disappears rather than being compensated for.
   *   D-17  الغياب and التأخير counted the abscence / excuse_in / excuse_out
   *         columns, which no code path has ever written — so both were
   *         structurally always zero. They are annotations now, never
   *         aggregated.
   *   D-18  an employee with ZERO punches never appeared at all, in a report
   *         titled "تقرير الغياب". The output is roster-driven, so a fully
   *         absent employee appears with أيام غياب = the working days.
   *   D-19  الحضور counted punches, so an in and an out read as two
   *         attendances. A day is a day.
   */
  function getAttendanceReport_(data, user, dbId) {
    var d = data || {};

    /* F.1 — null-check BEFORE touching either value, then stay in serial space. */
    var startSerial = attDateOnlyInputToSerial_(d.start_date);
    var endSerial = attDateOnlyInputToSerial_(d.end_date);
    if (startSerial === null || endSerial === null) throw new Error('تاريخ البداية والنهاية مطلوب');
    if (endSerial < startSerial) throw new Error('تاريخ النهاية قبل تاريخ البداية');
    /* Exclusive upper bound at the START of the day after the last one, so a
       punch at 23:30 on the final day is inside the range by construction. */
    var endExclusive = endSerial + 1;

    /* Working days: days in range that have a session. A day nobody worked and
       nobody opened is not an absence, it is not a working day. */
    var workingDays = {};
    var sessionOfDay = {};
    getAllRecords_(dbId, ATTENDANCE_SESSION_SHEET).forEach(function (s) {
      var serial = flexToSerial_(s.session_date);
      if (serial === null) return;
      var day = Math.floor(serial);
      if (day < startSerial || day >= endExclusive) return;
      workingDays[day] = true;
      var sid = String(s.session_id || '').trim();
      if (sid) sessionOfDay[sid] = day;
    });
    var workingDayList = Object.keys(workingDays).map(Number).sort(function (a, b) { return a - b; });

    /* (day, emp) -> punch serials, from one pass, filtered in serial space. */
    var byDayEmp = {};
    getAllRecords_(dbId, EMP_ATTENDANCE_SHEET).forEach(function (r) {
      var s = flexToSerial_(r.attendance_date_time);
      if (s === null) return;
      if (s < startSerial || s >= endExclusive) return;
      var emp = attNumericEmpId_(r.emp_id);
      if (emp === null) return;
      var day = Math.floor(s);
      var key = day + '|' + emp;
      if (!byDayEmp[key]) byDayEmp[key] = { punches: [], time_in: '', time_out: '' };
      byDayEmp[key].punches.push(s);
      /* §8.2 — a written time_in/time_out is a manual override and wins. */
      if (r.time_in && String(r.time_in).trim()) byDayEmp[key].time_in = r.time_in;
      if (r.time_out && String(r.time_out).trim()) byDayEmp[key].time_out = r.time_out;
    });

    /* F.3 — roster-driven. The employees come from the roster, not from the
       punches, which is the whole reason a fully absent employee can appear. */
    var roster = [];
    try { roster = getActiveEmployeeOptions_(dbId); } catch (e) { roster = []; }
    var empMap = buildEmpNameMap_(dbId);
    var wantEmp = (d.emp_id === undefined || d.emp_id === '' || d.emp_id === null)
      ? null : attNumericEmpId_(d.emp_id);

    var report = [];
    var drilldown = [];
    roster.forEach(function (o) {
      var emp = attNumericEmpId_(o.value);
      if (emp === null) return;
      var stat = {
        emp_id: emp,
        name_ar: empMap[String(emp)] || String(emp),
        working_days: workingDayList.length,
        present_days: 0,
        absent_days: 0,
        incomplete_days: 0,
        punches: 0,
        worked_minutes: 0
      };
      workingDayList.forEach(function (day) {
        var g = byDayEmp[day + '|' + emp];
        var punches = g ? g.punches.slice().sort(function (a, b) { return a - b; }) : [];
        var status = punches.length === 0 ? 'absent'
          : ((punches.length === 1 || punches.length % 2 === 1) ? 'incomplete' : 'present');
        /* D-19: a day is counted once, whatever number of punches it holds. */
        if (status === 'present') stat.present_days++;
        else if (status === 'absent') stat.absent_days++;
        else stat.incomplete_days++;
        stat.punches += punches.length;

        var first = punches.length ? punches[0] : null;
        var last = punches.length ? punches[punches.length - 1] : null;
        var minutes = (punches.length > 1) ? Math.round((last - first) * 1440) : 0;
        stat.worked_minutes += minutes;

        if (wantEmp !== null && emp === wantEmp) {
          drilldown.push({
            session_date: day,
            session_date_display: sessionDateDisplay_(day),
            time_in_display: (g && g.time_in) ? String(g.time_in) : (first === null ? '' : attendanceTimeOnly_(first)),
            time_out_display: (g && g.time_out) ? String(g.time_out) : (punches.length > 1 ? attendanceTimeOnly_(last) : ''),
            punches: punches.length,
            worked_minutes: minutes,
            worked_hours: Math.round((minutes / 60) * 100) / 100,
            status: status
          });
        }
      });
      stat.worked_hours = Math.round((stat.worked_minutes / 60) * 100) / 100;
      report.push(stat);
    });

    report.sort(function (a, b) { return a.emp_id - b.emp_id; });
    return {
      status: 'success',
      report: report,
      drilldown: drilldown,
      working_days: workingDayList.length,
      range: {
        start: startSerial, end: endSerial,
        start_display: sessionDateDisplay_(startSerial),
        end_display: sessionDateDisplay_(endSerial)
      }
    };
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
      noteMutation_(sheet);
      sheet.appendRow(canonical);
      noteMutation_(sheet);
      sheet.setFrozenRows(1);
      _ensuredSheets_[key] = sheet;
      return sheet;
    }
    var existing = getHeaders_(sheet).map(function (h) { return String(h).trim(); });
    var missing = canonical.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) {
      sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
      noteMutation_(sheet);
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
    noteMutation_(sheet);
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
    /* Phase 7.2 — the stamp bump is what actually invalidates now; one bump
     * orphans every derived key at once. The per-kind removals below are kept
     * so entries written before this change (unstamped keys) are cleared too. */
    bumpVfRefsVersion_(dbId);
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

  /**
   * Phase 7.2 — run the handler, THEN bust.
   *
   * Every save handler in this module already busts, but at the TOP of the
   * function, before its own write: 13 of the 15 bust sites had all their
   * mutations after the bust. That leaves a window — bust at t0, write at
   * t0+300ms, and any concurrent request in between re-caches PRE-write data for
   * the full TTL. At 60s that was survivable; at 600s it would not be, so the
   * TTL could not be raised without closing it.
   *
   * The original pre-bust is deliberately left in place: busting twice costs
   * nothing, and the pre-bust is also what keeps the handler's own validation
   * reads fresh. This only adds the missing bust after the write, on every
   * normal return path, without touching any handler body.
   *
   * If the handler throws, no post-bust runs — same as today, and the pre-bust
   * has already fired.
   */
  function withRefBust_(fn, kinds) {
    return function (data, user, dbId) {
      var out = fn(data, user, dbId);
      try { if (kinds) vfBustRefs_(dbId, kinds); else finBustRefs_(dbId); } catch (e) {}
      return out;
    };
  }

  function getValleyProducts_(data, user, dbId) {
    settingsEnsureSheet_(dbId, FIN_PRODUCTS_SHEET, FIN_PRODUCTS_HEADERS);
    var rows = getAllRecords_(dbId, FIN_PRODUCTS_SHEET);
    var catOpts = [];
    try {
      catOpts = finRefsCached_(dbId, 'vf_categories_opts', function () {
        return getAllRecords_(dbId, FIN_CATEGORIES_SHEET).map(function (r) {
          return { value: r.id != null ? r.id : '', label: String(r.name || r.name_ar || r.id || '') };
        }).filter(function (o) { return String(o.value).trim() !== ''; });
      });
    } catch (e) {}
    var accountOpts = [];
    try {
      /* كود الأصل refs valley_chart_of_accounts: label = «كود المستوى»,
       * stored value = «المستوى الخامس», restricted to 114100..115100. */
      accountOpts = finRefsCached_(dbId, 'vf_chart_asset_opts', function () {
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
    var partyOpts = finRefsCached_(dbId, 'vf_parties_opts', function () {
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

  /* ═══ U-46: cost visibility (valley_cost_view) ═══════════════════════════
   * Hiding costs is a SERVER-side boundary, not a UI convenience: the fields
   * are removed from the response and never reach the browser.
   *
   * Two rules the call sites must honour:
   *   1. OMIT the key. Never send zero. A zero is indistinguishable from a
   *      genuine zero cost and renders as a figure; an absent key lets the
   *      client tell "not permitted" from "costs nothing".
   *   2. Strip nothing the workflow needs. Quantities, batch_uid, lot,
   *      availability, dates and statuses all stay, so a user without the
   *      grant can still allocate batches and save a manufacturing order.
   *      That is safe because U-47 (S1) made the save resolve cost_unit
   *      server-side and stop reading the client's unit_cost.
   *
   * These live in the ValleyFoodsHRModules IIFE alongside purchasing, sales
   * and manufacturing, so all three modules share one gate. */
  var VF_COST_PAGE_ID = 'valley_cost_view';

  /**
   * THE FAIL-OPEN GUARD, and it is mandatory.
   *
   * valley_cost_view is registered in code (S4) but no role holds it until the
   * owner adds the ERP_Pages_Matrix rows by hand — an agent may not write
   * business data. Without this guard, the moment this ships costs would
   * disappear for everyone, including the owner.
   *
   * So: if NO role anywhere in the matrix holds ANY active grant on
   * valley_cost_view, the permission is not in use yet and every user is
   * treated as authorised — exactly today's behaviour. The gate becomes real
   * the instant the owner grants it to the first role.
   *
   * Cached under the same version_matrix stamp getRoleAuthorityMatrix_ uses, so
   * granting the permission (which calls bumpVersion_('ERP_Pages_Matrix'))
   * invalidates this immediately rather than after the TTL.
   *
   * A matrix that cannot be read also fails open, which is the safe direction:
   * it leaves behaviour as it is today rather than blanking every cost figure
   * in the company on a transient read error.
   */
  function vfCostGrantUnused_() {
    var cache = null, key = null;
    try {
      cache = CacheService.getScriptCache();
      key = 'vf_cost_grant_unused_v' + (cache.get('version_matrix') || '0');
      var hit = cache.get(key);
      if (hit !== null && hit !== undefined) return hit === '1';
    } catch (eCache) {}

    var unused = true;
    try {
      var sheet = getSheet_('ERP_Pages_Matrix', CONFIG.AUTH_SPREADSHEET_ID);
      var headers = getHeaders_(sheet);
      var values = sheet.getDataRange().getValues();
      var pageIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'page_id'; });
      var statusIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'status'; });
      if (pageIdx !== -1) {
        for (var i = 1; i < values.length; i++) {
          if (String(values[i][pageIdx]).trim() !== VF_COST_PAGE_ID) continue;
          if (statusIdx !== -1 && String(values[i][statusIdx]).trim().toLowerCase() !== 'active') continue;
          unused = false;
          break;
        }
      }
    } catch (eSheet) {
      unused = true;
    }

    /* Logged on the computed path only, so it appears once per cache window
       rather than on every request — visible without flooding the log. */
    if (unused) {
      try {
        Logger.log('[VF_COST] fail-open: no role holds an active grant on ' + VF_COST_PAGE_ID +
          ' — cost fields stay visible to everyone. Grant it in ERP_Management > صلاحيات الأدوار to activate the permission.');
      } catch (eLog) {}
    }
    try { if (cache && key) cache.put(key, unused ? '1' : '0', 300); } catch (ePut) {}
    return unused;
  }

  /** True when this user may see cost figures in purchasing, sales and manufacturing. */
  function vfCanSeeCost_(user) {
    if (user && user.isSuperAdmin) return true;
    var grants = (user && user.authorizedPages && user.authorizedPages[VF_COST_PAGE_ID]) || null;
    if (grants && grants.length &&
        (grants.indexOf('write') !== -1 || grants.indexOf('full') !== -1)) return true;
    return vfCostGrantUnused_();
  }

  /** Remove keys from one object. Deletes — never zeroes. */
  function vfStripCost_(obj, keys) {
    if (!obj) return obj;
    for (var i = 0; i < keys.length; i++) delete obj[keys[i]];
    return obj;
  }

  /** Remove keys from every object in a list. */
  function vfStripCostAll_(list, keys) {
    if (!list) return list;
    for (var i = 0; i < list.length; i++) vfStripCost_(list[i], keys);
    return list;
  }

  /* The cost-bearing keys of each ValleyFoods response shape, verified against
     the code rather than assumed. */
  var VF_COST_KEYS = {
    /* valley_manufacture_header */
    mfg_order:   ['total_inventory_cost', 'total_other_cost', 'total_batch_cost', 'by_product_nrv_value'],
    /* valley_manufacture_header_products (outputs) */
    mfg_output:  ['cost_unit', 'total_cost'],
    /* consumption footers, projected in getValleyMfgOrderFull_ */
    mfg_footer:  ['unit_cost', 'total_cost'],
    /* valley_manufacture_work_center */
    mfg_workop:  ['work_center_cost', 'total_cost'],
    /* valley_manufacture_by_product */
    mfg_bp:      ['total_cost'],
    /* batch options from valley_current_products */
    batch:       ['unit_cost'],
    /* valley_warehouse_movement rows and the batch options its form offers */
    warehouse_move: ['amount', 'unit_cost'],
    /* valley_product_purchasing lines */
    pur_line:    ['unit_price', 'other_cost', 'total_cost', 'unit_cost', 'purchase_unit_cost',
                  'cost_currency', 'sales_value', 'sales_value_amount'],
    /* valley_purchasing_costing header — the landed-cost columns */
    pur_header:  ['If shipping via CIF, enter the insurance value.', 'CIF insurance rate', 'Value',
                  'Value Based on Invoice', 'Importation Re-Price', 'Tax Declared Value',
                  'Administrative Expenses', 'Customs Expenses', 'Unloading expenses',
                  'bank commission', 'Customs clearance and port receipts', 'Additional fees',
                  'Clearance Expenses', 'Other Expenses', 'Purchase Tax', 'Income Tax',
                  'Internal cost adjustment', 'Total costs', 'Sales Value', 'sales tax amount',
                  'Minimum differences']
  };

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

  /**
   * Phase 2, step 2.4 — this was the worst of the four list endpoints in the
   * investigation: three uncached full sheet reads and no pagination at all.
   *
   * Now:
   *  - supplier and product option lists go through getRefsCached_, the shared
   *    per-company cache every other company already uses for exactly these two
   *    sheets, so repeat renders inside the TTL cost no reads;
   *  - product_options is split out to get_valley_purchasing_options and only
   *    fetched when the form opens. supplier_options STAYS in the list response
   *    because renderHeadersTable() needs it to show supplier names;
   *  - rows are sorted by id descending server-side and limited, matching the
   *    sibling endpoints in TopLight. Pass loadAll:true for the full set.
   *
   * The client sorts by id descending again after receiving these, so the
   * server-side sort only decides WHICH rows the limit keeps, not their order.
   */
  function getValleyPurchasingCosting_(data, user, dbId) {
    var limit = Number(data && data.limit) || 10;
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    rows.sort(function (a, b) { return (Number(b.id) || 0) - (Number(a.id) || 0); });
    /* The from/to range narrows the set BEFORE the newest-10 slice, so the 10
       rows the list shows are the newest 10 inside the range. */
    rows = vfBoundRows_(rows, data, 'Reciept Date');
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    /* U-46. Whole sheet rows, so every landed-cost column rides along. Code,
       supplier, dates, type, currency, month/year and the approval columns stay,
       which is what the list needs to stay navigable and approvable. */
    var _purCost = vfCanSeeCost_(user);
    if (!_purCost) vfStripCostAll_(rows, VF_COST_KEYS.pur_header);
    var out = {
      status: 'success',
      headers: rows,
      can_see_cost: _purCost,
      options: {
        supplier_options: valleyPurchasingSupplierOptions_(dbId),
        currency_options: PURCHASING_CURRENCIES,
        movement_type_options: valleyPurchasingMovementTypeOptions_(dbId)
      }
    };
    if (data && data.withOptions) out.options.product_options = valleyPurchasingProductOptions_(dbId);
    return out;
  }

  function valleyPurchasingSupplierOptions_(dbId) {
    try {
      return vfRefsCached_(dbId, 'vf_purchasing_supplier_opts', function () {
        return getAllRecords_(dbId, FIN_PARTIES_SHEET).map(function (p) {
          return { value: p.id, label: String(p.name || p.id) };
        }).filter(function (o) { return String(o.value).trim() !== ''; });
      }) || [];
    } catch (e) { return []; }
  }

  function valleyPurchasingProductOptions_(dbId) {
    try {
      return vfRefsCached_(dbId, 'vf_purchasing_product_opts', function () {
        return getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
          return { value: p.id, label: String(p.name_ar || p.id) };
        }).filter(function (o) { return String(o.value).trim() !== ''; });
      }) || [];
    } catch (e) { return []; }
  }

  /**
   * نوع الحركة — a reference into valley_chart_of_accounts, not a fixed list.
   * Stored value is «المستوى الخامس», shown label is «اسم المستوى الخامس»,
   * matching how the AppSheet app defined the column.
   *
   * The client renders these as {fifth, code} (value, label), which is the
   * shape the hardcoded PURCHASING_MOVEMENT_TYPES used, so the form does not
   * change. Falls back to the old fixed list if the sheet cannot be read, so a
   * missing or renamed chart sheet degrades to today's behaviour rather than
   * emptying the dropdown.
   */
  function valleyPurchasingMovementTypeOptions_(dbId) {
    try {
      var opts = vfRefsCached_(dbId, 'vf_purchasing_movement_opts', function () {
        return getAllRecords_(dbId, FIN_CHART_SHEET).map(function (r) {
          var fifth = String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim();
          var name = String(r['اسم المستوى الخامس'] == null ? '' : r['اسم المستوى الخامس']).trim();
          if (!fifth) return null;
          return { fifth: fifth, code: name || fifth };
        }).filter(Boolean);
      }) || [];
      return opts.length ? opts : PURCHASING_MOVEMENT_TYPES;
    } catch (e) { return PURCHASING_MOVEMENT_TYPES; }
  }

  /** Phase 2.1 — the form's product dropdown, fetched when the form opens. */
  function getValleyPurchasingOptions_(data, user, dbId) {
    return {
      status: 'success',
      options: {
        supplier_options: valleyPurchasingSupplierOptions_(dbId),
        product_options: valleyPurchasingProductOptions_(dbId),
        currency_options: PURCHASING_CURRENCIES,
        movement_type_options: valleyPurchasingMovementTypeOptions_(dbId)
      }
    };
  }

  function getValleyPurchasingLines_(data, user, dbId) {
    var code = String((data && data.code) || '').trim();
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var rows = getAllRecords_(dbId, PURCHASING_LINE_SHEET).filter(function (r) {
      return String(r.code) === code;
    });
    /* U-46. product, vendor, qty, lot, dates, currency and movement type stay;
       the per-line money columns go. See the save guard in
       saveValleyPurchasingCosting_ — this endpoint feeds the edit form as well
       as the read-only view, and a cost-blind client must not be able to write
       the blanks it was given back over the stored figures. */
    var _plCost = vfCanSeeCost_(user);
    if (!_plCost) vfStripCostAll_(rows, VF_COST_KEYS.pur_line);
    return { status: 'success', lines: rows, can_see_cost: _plCost };
  }

  function saveValleyPurchasingCosting_(data, user, dbId) {
    var d = data || {};
    var hdr = d.header || {};
    var lines = d.lines || [];
    var code = String(hdr.Code != null ? hdr.Code : '').trim();
    if (!code) throw new Error('الكود (Code) مطلوب');
    if (!String(hdr['Type'] != null ? hdr['Type'] : '').trim()) throw new Error('النوع مطلوب');
    if (!String(hdr['Shipping Type'] != null ? hdr['Shipping Type'] : '').trim()) {
      throw new Error('نوع الشحن مطلوب');
    }
    /* A purchase with no lines has no cost to distribute and no stock movement
       to make, so it is refused rather than stored as an empty document. */
    if (!Array.isArray(lines) || !lines.length) {
      throw new Error('يجب إضافة صنف واحد على الأقل');
    }
    /* movement_type drives the stock movement each line becomes, so a blank one
       is not a default — it is a line that does nothing. Checked server-side as
       well as in the form, because the server never trusts the client. */
    var _missingMovement = [];
    lines.forEach(function (l, i) {
      if (!String((l && l.movement_type) != null ? l.movement_type : '').trim()) _missingMovement.push(i + 1);
    });
    if (_missingMovement.length) {
      throw new Error('نوع الحركة مطلوب لكل صنف — الأصناف رقم: ' + _missingMovement.join('، '));
    }

    /* U-46 + U-47's lesson, applied to purchasing.
     *
     * This handler writes every header column straight from the payload
     * (record[col] = hdr[col], blank when absent) and rewrites the whole line
     * set from scratch. Once the read strips the cost columns, a caller without
     * the grant holds none of them — so an ordinary save would write blanks
     * over the entire landed-cost document. That is precisely the silent wipe
     * U-47 described, at document scale.
     *
     * Manufacturing could be fixed by resolving cost server-side, because the
     * authority is valley_current_products. Purchasing has no such authority:
     * these figures are typed in by a person. And the lines are deleted and
     * re-created with fresh unique_ids on every save, so there is no stable
     * identity to preserve the stored costs against either.
     *
     * So the only safe answer is to refuse the write rather than corrupt it.
     * Note this changes nothing until the owner grants valley_cost_view to a
     * first role — until then the fail-open guard makes vfCanSeeCost_ true for
     * everyone. Recorded in VALLEYFOODS_RESULTS.md and NEXT_STEPS_OWNER.md. */
    if (!vfCanSeeCost_(user)) {
      throw new Error('لا تملك صلاحية عرض أو تعديل التكاليف (valley_cost_view) — لا يمكن حفظ عملية شراء.');
    }
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

    /* This check used to run at the very END of the handler — after the header
       had been written and after the lines had been deleted and re-inserted.
       So a mismatched total showed the user an error while the document was
       already saved, and the old lines were already gone. It validates before
       anything is written now. */
    var headerTotal = Number(record['Total costs']) || 0;
    var incomingTotal = 0;
    (lines || []).forEach(function (l) { incomingTotal += Number(l.total_cost) || 0; });
    if ((lines || []).length > 0 && Math.abs(incomingTotal - headerTotal) > 0.01) {
      throw new Error('مجموع تكاليف الأصناف (' + incomingTotal.toFixed(2) + ') لا يساوي إجمالي التكاليف (' + headerTotal.toFixed(2) + ')');
    }

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
    var lineMaps = [];
    (lines || []).forEach(function (l) {
      var qty = Number(l.qty) || 0;
      var unitPrice = Number(l.unit_price) || 0;
      var totalCost = Number(l.total_cost) || 0;
      var movementPlace = '';
      if (shippingType === 'CIF' || shippingType === 'FOB' || shippingType === 'C&F') movementPlace = 'مستورد';
      else if (shippingType === 'محلي') movementPlace = 'محلي';
      var prodDate = l['Production date'] || receiptDateStr;
      var expDate = l['Expiry date'] || expiryDateStr;
      var lm = {
        unique_id: uid16_(),
        code: code,
        product: l.product || '',
        /* product_category and movement_code are SHEET FORMULAS, filled in
           below once the row numbers are known — see the matrix build. */
        product_category: '',
        /* The vendor of a line is the supplier of the document. It was written
           from l.vendor, which the form never sets, so every line stored a
           blank vendor. */
        vendor: record['Supplier Name'] || l.vendor || '',
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
      lineMaps.push(lm);
    });

    /* PERF — the reason this save used to take minutes.
     *
     * This loop used to call addRecord_ once per line. Each of those calls
     * acquires the script lock, reads the whole ID_Counter sheet, reads the
     * ENTIRE valley_product_purchasing sheet to recompute max(id), writes one
     * counter cell and appends one row. That is five Sheets round trips per
     * line, one of which is O(the whole table) — so a 40-line purchase against
     * a 20 000-row line table did ~200 round trips and read ~27 MILLION cells
     * before it could finish.
     *
     * logHistory_ already solved exactly this, and says so in its own comment:
     * ONE lock, ONE counter allocation, ONE setValues. Same cell values, same
     * ids, same order — only the number of round trips changes. getNextIdBatch_
     * is the allocator it uses and is lock-reentrant, so this is safe here too.
     */
    if (lineMaps.length) {
      var lineHeaders = getHeaders_(lineSheet);
      var startId = getNextIdBatch_(dbId, PURCHASING_LINE_SHEET, lineMaps.length);
      var startRow = lineSheet.getLastRow() + 1;

      /* movement_code and product_category are spreadsheet formulas, not values
         — they were carried by the AppSheet sheet and must keep working the
         same way, recalculating when a product or a category is renamed.
         setValues writes a leading '=' as a formula, so they are built per row
         with that row's own number.
         The column letters come from the SHEET's headers, not from the
         constant, so a reordered sheet still produces correct references. */
      function _colLetter(headerName) {
        var idx = lineHeaders.findIndex(function (h) {
          return String(h).trim().toLowerCase() === headerName.toLowerCase();
        });
        if (idx === -1) return null;
        var n = idx + 1, s = '';
        while (n > 0) { var m2 = (n - 1) % 26; s = String.fromCharCode(65 + m2) + s; n = (n - m2 - 1) / 26; }
        return s;
      }
      var CL = {
        id: _colLetter('id'),
        code: _colLetter('code'),
        product: _colLetter('product'),
        receipt_date: _colLetter('receipt_date')
      };
      var canFormula = CL.id && CL.code && CL.product && CL.receipt_date;

      var matrix = lineMaps.map(function (lm, i) {
        var rowNo = startRow + i;
        if (canFormula) {
          lm.movement_code = '=CONCATENATE(' + CL.id + rowNo + ',"-",' + CL.code + rowNo +
            ',"-",vlookup(' + CL.product + rowNo + ',valley_products!$A:$F,2,0),"-",TEXT(' +
            CL.receipt_date + rowNo + ',"DD/MM/YYYY"))';
          lm.product_category = '=vlookup(VLOOKUP(' + CL.product + rowNo +
            ',valley_products!A:N,14,0),valley_categories!A:B,2,0)';
        }
        return lineHeaders.map(function (h) {
          var name = String(h).trim();
          if (name.toLowerCase() === 'id') return startId + i;
          /* Exact header match FIRST. addRecord_ lowercased the header before
             looking the value up, so 'Production date' and 'Expiry date' —
             the only two capitalised keys in the line map — never matched and
             were written blank on every save this module has ever done. The
             lowercase lookup stays as the fallback so every other column
             behaves exactly as before. */
          if (lm[name] !== undefined) return lm[name];
          var lower = name.toLowerCase();
          return lm[lower] !== undefined ? lm[lower] : '';
        });
      });
      lineSheet.getRange(startRow, 1, matrix.length, lineHeaders.length).setValues(matrix);
      noteMutation_(lineSheet);
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
  ValleyFoods.register('get_valley_purchasing_options', getValleyPurchasingOptions_);
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

  /* [P2] All-parties ledger balance, for the الرصيد الحالي column on vf_parties.
   *
   * balance(party) = (purchases + collections + returns) - (sales + payments)
   *
   * This is the same figure the كشف حساب shows as صافي رصيد الحساب الموحد with
   * no date filter and نوع الحركة = عرض كل المعاملات. The sign map is the one
   * the client applies in Company_ValleyFoods_Parties.html applyFilter():
   * +1 for collections / purchases / returns, -1 for sales / payments.
   *
   * ⚠ Each source sheet joins on a DIFFERENT field. Using the wrong one
   * produces a plausible number that silently disagrees with the statement:
   *   valley_sales_invoices      -> 'اسم العميل'                    (sales,       -1)
   *   valley_product_purchasing  -> 'vendor'                        (purchases,   +1)
   *   valley_cash_bank_movement  -> 'name'          debit ? collections +1 : payments -1
   *   valley_sales_returns       -> 'valley_sales_invoices_client'  (returns,     +1)
   * Despite its name, 'اسم العميل' holds the party ID, not the party name —
   * getValleyPartyStatement_ compares it to the id, and so does this.
   *
   * This is the LEDGER balance. The statement's adjusted-box figure subtracts a
   * stock valuation computed from user-editable price inputs on the client and
   * therefore has no stable server-side value; it must not be used for a list
   * column.
   *
   * Separate from getValleyParties_ on purpose (decision D-H): that handler
   * reads ONE sheet, and folding four more into it would make every parties
   * page load pay ~5x the I/O before first paint and would change an existing
   * response shape. Reads the four sheets once each, not once per party.
   * No caching (D-I): busting it would require editing four existing save
   * handlers, which the no-contract-breakage rule forbids. */
  function getValleyPartyBalances_(data, user, dbId) {
    var balances = {};
    function add_(key, delta) {
      var k = String(key == null ? '' : key).trim();
      if (!k) return;
      balances[k] = (balances[k] || 0) + delta;
    }

    /* [أ] Sales invoices — debit, -1 */
    safeRows_(dbId, 'valley_sales_invoices').forEach(function (s) {
      add_(s['اسم العميل'], -1 * (Number(s['إجمالي']) || 0));
    });

    /* [ب] Purchases — credit, +1 */
    safeRows_(dbId, 'valley_product_purchasing').forEach(function (p) {
      add_(p.vendor, +1 * ((Number(p.qty) || 0) * (Number(p.unit_price) || 0)));
    });

    /* [ج] Cash/bank — collections (debit, +1) or payments (-1) */
    safeRows_(dbId, 'valley_cash_bank_movement').forEach(function (cb) {
      var total = Math.abs(Number(cb.total) || 0);
      var isDebit = String(cb.transaction_type || '').trim().toLowerCase() === 'debit';
      add_(cb.name, (isDebit ? 1 : -1) * total);
    });

    /* [د] Sales returns — credit, +1 */
    safeRows_(dbId, 'valley_sales_returns').forEach(function (r) {
      add_(r.valley_sales_invoices_client, +1 * Math.abs(Number(r.valley_return_value) || 0));
    });

    return { status: 'success', balances: balances };
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
      product_options: finRefsCached_(dbId, 'vf_products_opts_sorted', function () {
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
      return { status: 'success', is_new: true, recipe_options: opts.recipe_options, product_options: opts.product_options, work_center_options: opts.work_center_options, enums: opts.enums, can_see_cost: vfCanSeeCost_(user) };
    }
    var full = getValleyMfgOrderFull_(data, user, dbId);
    var ops = getValleyMfgWorkOps_({ mo_uid: moUid }, user, dbId);
    var bps = getValleyMfgByproducts_({ mo_uid: moUid }, user, dbId);
    var outputs = (full.outputs || []).map(function (o) {
      var batches = [];
      try { var br = getValleyProductBatches_({ product_id: o.product_id, mo_uid: moUid }, user, dbId); batches = br.batches || []; } catch (e) {}
      return Object.assign({}, o, { batches: batches });
    });
    return {
      status: 'success', is_new: false,
      recipe_options: opts.recipe_options, product_options: opts.product_options, work_center_options: opts.work_center_options, enums: opts.enums,
      order: full.order, outputs: outputs, workops: ops.workops || [], byproducts: bps.byproducts || [],
      /* U-46. One flag for the whole page; every composed part above was
         stripped by its own endpoint through the same gate. */
      can_see_cost: vfCanSeeCost_(user)
    };
  }

  function getValleyProductBatchesMulti_(data, user, dbId) {
    var ids = Array.isArray(data && data.product_ids) ? data.product_ids : [];
    /* the document being edited travels with the request, exactly as it does
       for the single-product call — same add-back, same numbers */
    var moUid = String((data && data.mo_uid) || '').trim();
    var invoiceUid = String((data && (data.invoice_uid || data.exclude_invoice_unique_id)) || '').trim();
    var map = {};
    ids.forEach(function (pid) {
      var batches = [];
      try {
        var r = getValleyProductBatches_({ product_id: pid, mo_uid: moUid, invoice_uid: invoiceUid }, user, dbId);
        batches = r.batches || [];
      } catch (e) {}
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
      product_options: finRefsCached_(dbId, 'vf_products_opts_sorted', function () {
        return getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
          return { value: p.id, label: String(p.name_ar || ('#' + p.id)) };
        }).filter(function (o) { return String(o.value).trim() !== ''; })
          .sort(function (a, b) { return a.label.localeCompare(b.label, 'ar'); });
      }),
      work_center_options: mfgWorkCenterOptions_(dbId),
      enums: { operation_type: MFG_OP_TYPES, shift: MFG_SHIFTS },
      /* U-46. The client gate. It must NOT be re-derived in the browser from
         authorizedPages: the browser cannot see the fail-open guard and would
         hide costs the server had deliberately sent. This flag is the server's
         own answer, so the page and the payload always agree. */
      can_see_cost: vfCanSeeCost_(user)
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
      var raw = (Number(s.required_qty || 0) * ratio) * (1 + lossPct);
      materials.push({
        raw_material_id: String(s.raw_material_id || ''),
        raw_material_name: String(s.raw_material_name || ''),
        required_qty: Math.ceil(raw / 10) * 10,
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

    /* Sheet-computed columns of valley_manufacture_by_product
       (B=id, C=header uid, D=code, E=mfg date, G=item).
       created_at is intentionally left as a full datetime value. */
  /**
   * Phase 8 (F-04). The sheet-computed columns of valley_manufacture_by_product,
   * as { headerName: formula }. Extracted VERBATIM from writeByproductFormulas_
   * so the same strings can be merged into the row's own setValues instead of
   * costing four writeFormula_ round trips (each of which paid its own
   * getSheet_ + getHeaders_ + setFormula) per by-product row.
   */
  function byproductFormulaMap_(r) {
    return {
      'code': '=INDEX(valley_manufacture_header!E:E,MATCH(C' + r + ',valley_manufacture_header!A:A,0))',
      'transaction_code': '=CONCATENATE(VLOOKUP(G' + r + ',valley_products!$A:$B,2,0),"-",D' + r + ',"-",G' + r + ',"-",TEXT(E' + r + ',"DD/MM/YYYY"))',
      'total_cost': '=IF((INDEX(valley_products!$I:$I,MATCH(G' + r + ',valley_products!$A:$A,0))*(INDEX(valley_manufacture_header!$J:$J,MATCH(C' + r + ',valley_manufacture_header!$A:$A,0))+INDEX(valley_manufacture_header!$I:$I,MATCH(C' + r + ',valley_manufacture_header!$A:$A,0))) / (SUMIFS(valley_manufacture_header!I:I,valley_manufacture_header!A:A,C' + r + ')+SUMIFS(valley_manufacture_header!J:J,valley_manufacture_header!A:A,C' + r + '))) > 0.25, (INDEX(valley_products!$I:$I,MATCH(G' + r + ',valley_products!$A:$A,0))*(INDEX(valley_manufacture_header!$J:$J,MATCH(C' + r + ',valley_manufacture_header!$A:$A,0))+INDEX(valley_manufacture_header!$I:$I,MATCH(C' + r + ',valley_manufacture_header!$A:$A,0)))) / 2, (INDEX(valley_products!$I:$I,MATCH(G' + r + ',valley_products!$A:$A,0))*(INDEX(valley_manufacture_header!$J:$J,MATCH(C' + r + ',valley_manufacture_header!$A:$A,0))+INDEX(valley_manufacture_header!$I:$I,MATCH(C' + r + ',valley_manufacture_header!$A:$A,0)))))',
      'manufacture_internal_batch': '=CONCATENATE(TEXT(E' + r + ',"YYMMDD"),B' + r + ',G' + r + ',D' + r + ')'
    };
  }

  /**
   * Phase 8 (F-04). The sheet-computed columns of the manufacturing-order
   * header row, extracted VERBATIM from the eight writeFormula_ calls that
   * used to follow every save.
   */
  function mfgOrderFormulaMap_(fx) {
    return {
      'transaction_code': '=CONCATENATE(VLOOKUP(M' + fx + ',valley_products!$A:$B,2,0),"-",E' + fx + ',"-",M' + fx + ',"-",TEXT(L' + fx + ',"DD/MM/YYYY"))',
      'code': '=CONCATENATE("VM -", ROW()-1)',
      'by_product_nrv_value': '=SUMIFS(valley_manufacture_by_product!I:I, valley_manufacture_by_product!C:C, A' + fx + ')',
      'total_inventory_cost': '=SUMIFS(valley_manufacture_header_products!$H:$H, valley_manufacture_header_products!$C:$C, A' + fx + ')',
      'total_other_cost': '=SUMIFS(valley_manufacture_work_center!L:L, valley_manufacture_work_center!C:C, A' + fx + ')',
      'total_batch_cost': '=IF(J' + fx + '+I' + fx + '-H' + fx + '<0, INDEX(valley_products!$I:$I,MATCH(M' + fx + ',valley_products!$A:$A,0))*(J' + fx + '+I' + fx + '), J' + fx + '+I' + fx + '-H' + fx + ')',
      'product_category': '=IFERROR(INDEX(valley_products!$N:$N,MATCH(M' + fx + ',valley_products!$A:$A,0)), "")',
      'manufacture_internal_batch': '=CONCATENATE(TEXT(L' + fx + ',"YYMMDD"),B' + fx + ',M' + fx + ',E' + fx + ')'
    };
  }

  /**
   * Phase 8 (F-04). The sheet-computed columns of an output row, extracted
   * VERBATIM from the two writeFormula_ calls that ran per row.
   */
  function mfgOutputFormulaMap_(oRow) {
    return {
      'cost_unit': '=SUMIFS(valley_manufacture_footer!G:G, valley_manufacture_footer!C:C, A' + oRow + ')',
      'total_cost': '=SUMIFS(valley_manufacture_footer!H:H, valley_manufacture_footer!C:C, A' + oRow + ')'
    };
  }

  /**
   * Phase 8 (F-04). The sheet-computed columns of a consumption row, extracted
   * VERBATIM from the two writeFormula_ calls that ran per row.
   */
  function mfgConsumptionFormulaMap_(cRow) {
    return {
      'item_code': '=IFERROR(VLOOKUP(D' + cRow + ', valley_product_purchasing!A:C,3,0), IFERROR(VLOOKUP(D' + cRow + ', valley_manufacture_header!A:C,3,0), IFERROR(INDEX(valley_manufacture_by_product!F:F,MATCH(D' + cRow + ',valley_manufacture_by_product!A:A,0)),"")))',
      'total_cost': '=G' + cRow + '*F' + cRow
    };
  }

  /**
   * Phase 8 (F-04). The sheet-computed columns of a work-centre row, extracted
   * VERBATIM from the three writeFormula_ calls that ran per kept row.
   * actual_hours, work_center_cost and total_cost are adjacent in WC_HEADERS,
   * so writeRowFormulas_ collapses all three into one setValues.
   */
  function mfgWorkCenterFormulaMap_(rN) {
    return {
      'work_center_cost': '=INDEX(valley_work_centers!$H:$H,MATCH(E' + rN + ',valley_work_centers!$A:$A,0))',
      'actual_hours': '=(H' + rN + '-G' + rN + ')*24',
      'total_cost': '=K' + rN + '*J' + rN
    };
  }
    function writeByproductFormulas_(dbId, r) {
      var _bpSheet = getSheet_(MFG_BYPRODUCT_SHEET, dbId);
      writeRowFormulas_(_bpSheet, getHeaders_(_bpSheet), r, byproductFormulaMap_(r));
    }

    function saveValleyMfgOrder_(data, user, dbId) {

    var d = data || {};
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = !!(d.mo_uid && String(d.mo_uid).trim());
    /* declared here, not inside executeWithLock_: the success return below needs it */
    var moUid;
    /* POLICY: add = page-write authority; edit existing = any writer, UNLESS the MO is Locked
       (Locked MOs are immutable and require super-admin unlock — enforced below at save time). */

    /* ALL header fields are mandatory. */
    if (!d.manufacture_date) throw new Error('تاريخ التصنيع مطلوب');
    var moDate = parseDate_(d.manufacture_date);
    if (!moDate) throw new Error('تاريخ التصنيع غير صالح');
    moDate = new Date(moDate.getFullYear(), moDate.getMonth(), moDate.getDate()); /* date-only, strip time component */
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
    try { Logger.log('MFGTRACE payload: outputs_raw=' + (Array.isArray(d.outputs) ? d.outputs.length : 'NA') + ' outputs_kept=' + outputs.length + ' consumption_raw=' + (Array.isArray(d.consumption) ? d.consumption.length : 'NA') + ' work_ops=' + (Array.isArray(d.work_ops) ? d.work_ops.length : 'NA') + ' byproducts=' + (Array.isArray(d.byproducts) ? d.byproducts.length : 'NA') + ' mo_uid=' + String(d.mo_uid || '')); } catch (eLg) {}
    if (!outputs.length) throw new Error('أضف منتج ناتج واحد على الأقل');
      var consumption = Array.isArray(d.consumption) ? d.consumption.filter(function (cm) { return cm && String(cm.batch_uid || '').trim() && Number(cm.qty || 0) > 0; }) : [];
      var hasFooters = outputs.some(function (o) { return Array.isArray(o.footers) && o.footers.some(function (f) { return String(f.item || '').trim(); }); });
      if (!consumption.length && !hasFooters) throw new Error('خصص استهلاك الخامات من الدفعات أولاً');

    /* The three tabs exist before the guard runs, not just before the write: the
       guard resolves footer ownership against them, and a missing tab there would
       silently turn every already-committed quantity into an ignorable orphan. */
    settingsEnsureSheet_(dbId, MFG_ORDER_SHEET, MFG_ORDER_HEADERS);
    settingsEnsureSheet_(dbId, MFG_ORDER_PRODUCTS_SHEET, MFG_OUTPUT_HEADERS);
    settingsEnsureSheet_(dbId, MFG_CONSUMPTION_SHEET, MFG_CONSUMPTION_HEADERS);

    /* Defensive: requested batch qty may not exceed the balance in valley_current_products.
       Runs BEFORE anything is written, so a violation aborts cleanly with no orphan header. */
    (function assertFooterBalances_() {
      var needByBatch = {};
      function need_(buid, q) {
        buid = String(buid || '').trim(); q = Number(q) || 0;
        if (buid && q > 0) needByBatch[buid] = Math.round(((needByBatch[buid] || 0) + q) * 1000) / 1000;
      }
      var nameMap = {};
      try { getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) { nameMap[String(p.id)] = String(p.name_ar || p.id); }); } catch (eNm) {}
      outputs.forEach(function (o) {
        var opid = String(o.product_id || '').trim();
        var payQty = Math.round((Number(o.qty) || 0) * 1000) / 1000;
        var rows = (Array.isArray(o.footers) ? o.footers : []).filter(function (f) { return f && String(f.item || '').trim(); })
          .map(function (f) { return { batch: String(f.item).trim(), qty: Math.round((Number(f.qty) || 0) * 1000) / 1000 }; });
        var paySum = Math.round(rows.reduce(function (t, r) { return t + r.qty; }, 0) * 1000) / 1000;
        if (Math.abs(paySum - payQty) > 0.01) {
          throw new Error('مجموع الدفعات للصنف (' + (nameMap[opid] || opid || '?') + ') يجب أن يساوي كمية البند. مجموع الدفعات: ' + paySum + '، الكمية: ' + payQty);
        }
        /* normalize the ceil-to-10 parent rounding into the largest footer so stored sums match product_qty */
        var storedQty = Math.ceil((Number(o.qty) || 0) / 10) * 10;
        var delta = Math.round((storedQty - paySum) * 1000) / 1000;
        if (Math.abs(delta) > 0.0000001 && rows.length) {
          var mi = 0, mq = -Infinity;
          rows.forEach(function (r, ix) { if (r.qty > mq) { mq = r.qty; mi = ix; } });
          rows[mi].qty = Math.round((rows[mi].qty + delta) * 1000) / 1000;
        }
        rows.forEach(function (r) { need_(r.batch, r.qty); });
      });
      (Array.isArray(consumption) ? consumption : []).forEach(function (cm) { need_(cm.batch_uid, cm.qty); });
      var batchIds = Object.keys(needByBatch);
      if (!batchIds.length) return;
      /* available = current_qty + what THIS order already holds on the sheet.
         The save is about to rewrite those very footer rows, so the quantity
         they hold is still this order's to spend — without the add-back,
         re-saving an unchanged order refuses its own stock. A NEW order holds
         nothing and adds back nothing. include_empty keeps a batch this order
         has fully consumed in the map, so a refusal names the real figure. */
      var myUid = editing && d.mo_uid ? String(d.mo_uid).trim() : '';
      var balanceByBatch = {};
      vfBatchBalance_(dbId, { mo_uid: myUid, include_empty: true }).forEach(function (b) {
        if (balanceByBatch[b.batch_uid] === undefined) balanceByBatch[b.batch_uid] = b.available;
      });
      batchIds.forEach(function (buid) {
        var avail = Math.round((balanceByBatch[buid] || 0) * 1000) / 1000;
        if (needByBatch[buid] - avail > 0.001) {
          var label = buid;
          try {
            outputs.forEach(function (o) {
              (o.footers || []).forEach(function (f) {
                if (String(f.item || '').trim() === buid && f.item_code) label = String(f.item_code);
              });
            });
          } catch (eLbl) {}
          throw new Error('الكمية المطلوبة من الدفعة (' + label + ') تتجاوز المتاح. المطلوب: ' + needByBatch[buid] + '، المتاح: ' + avail);
        }
      });
    })();

    executeWithLock_(function () {
      var sheetMo = getSheet_(MFG_ORDER_SHEET, dbId);
      var moHeaders = getHeaders_(sheetMo);
      var moDataAll = sheetMo.getDataRange().getValues();
      var uidIdx = moHeaders.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
      var idIdx = moHeaders.findIndex(function (h) { return String(h).trim() === 'id'; });

      var moNumberId;
      var stIdxG = moHeaders.findIndex(function (h) { return String(h).trim() === 'mo_status'; });
      if (editing) {
        moUid = String(d.mo_uid).trim();
        moNumberId = null;
        for (var r0 = 1; r0 < moDataAll.length; r0++) {
          if (String(moDataAll[r0][uidIdx]).trim() === moUid) {
            moNumberId = Number(moDataAll[r0][idIdx]);
            /* M4: Locked orders are immutable for everyone — unlock first (lines sync only when not Locked) */
            if (stIdxG !== -1 && String(moDataAll[r0][stIdxG]).trim() === 'Locked') {
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
      try { Logger.log('MFGTRACE resolved: moUid=' + moUid + ' editing=' + editing + ' dbId=' + String(dbId).slice(0, 8) + '…'); } catch (eLg2) {}

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
      map['product_category'] = catId;
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
            noteMutation_(sheetMo);
            var newObj = Object.assign({}, oldObj, map);
            var oldUid = oldObj.record_uid || ('upd_' + MFG_ORDER_SHEET + '_' + moUid);
            try { logHistory_(dbId, MFG_ORDER_SHEET, oldUid, moUid, (user && user.email) || '', 'update', newObj, oldObj); } catch (eHist) {}
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
      try {
        var mdIdx = moHeaders.findIndex(function (h) { return String(h).trim() === 'manufacture_date'; });
        if (fx && mdIdx !== -1) sheetMo.getRange(fx, mdIdx + 1).setNumberFormat('yyyy-MM-dd');
      } catch (eFmt) {}
      // Phase 8 (F-04): eight writeFormula_ calls, each paying its own
      // getSheet_ + getHeaders_ + setFormula, replaced by one pass over the
      // sheet and headers already in scope. The row exists on both the edit
      // and the create path, so nothing here needs the lock.
      writeRowFormulas_(sheetMo, moHeaders, fx, mfgOrderFormulaMap_(fx));

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
        var outUid = uid16Hex_();
        outputUidMap[oi] = outUid;
        var m6 = {};
        m6['unique_id'] = outUid;
        m6['valley_manufacture_header_id'] = moUid;
        m6['product_id'] = String(o.product_id).trim();
        m6['product_name'] = prodNameMap[String(o.product_id)] || '';
        m6['product_qty'] = Math.ceil((Number(o.qty) || 0) / 10) * 10;
        m6['cost_unit'] = o.cost_unit != null ? o.cost_unit : '';
        m6['total_cost'] = o.total_cost != null ? o.total_cost : '';
        m6['user'] = (user && user.email) || '';
        m6['created_at'] = new Date();
        return outHeaders.map(function (h) {
          var k = String(h).trim();
          return m6[k] !== undefined ? m6[k] : '';
        });
      });
      try { Logger.log('MFGTRACE outputs: rows=' + outRows.length + ' tab=' + sheetOut.getName() + ' startRow=' + outStart + ' cols=' + outHeaders.length); } catch (eLg3) {}
      if (outRows.length) {
        /* Phase 8 (F-04): was one setValues followed by 2 writeFormula_ PER ROW.
         * The formulas are merged into the same block write, so a 5-output order
         * goes from 11 round trips to 1.
         *
         * The start row is now recomputed under the script lock. It was already
         * a precomputed target range rather than appendRow, so two concurrent
         * saves could compute the same start row and one would silently
         * overwrite the other; the lock closes that, and ensureGridRows_ grows
         * the grid the way appendRow used to implicitly. Row numbers are
         * unchanged: output i still lands at getLastRow()+1+i. (outStart is
         * reassigned here, after the trace above has already logged its
         * pre-lock value.) */
        executeWithLock_(function () {
          outStart = sheetOut.getLastRow() + 1;
          ensureGridRows_(sheetOut, outStart + outRows.length - 1);
          outRows.forEach(function (rv, oi2) {
            applyRowFormulas_(rv, outHeaders, mfgOutputFormulaMap_(outStart + oi2));
          });
          sheetOut.getRange(outStart, 1, outRows.length, outHeaders.length).setValues(outRows);
          noteMutation_(sheetOut);
        });
      }

      /* rewrite raw-material batch consumption — per-product footers + legacy consumption */
      var sheetCons = getSheet_(MFG_CONSUMPTION_SHEET, dbId);
      /* footers are linked by the OUTPUT uid, not the MO uid — delete this MO's old output footers */
      /* ONE read for all of this MO's outputs. Per-output deletion re-read the
         whole consumption sheet once per output. */
      deleteRowsWhereIn_(sheetCons, 'valley_manufacture_header_product_id', existingOutUids);
      /* …and the rows an earlier save parented on the MO uid itself through the
         `outUid || moUid` fallback below. They are unambiguously ours, and left
         behind they would be rewritten alongside, double-counting the batch. */
      deleteRowsByCriteria_(sheetCons, 'valley_manufacture_header_product_id', moUid);
      var consHeaders = getHeaders_(sheetCons);
      var consRows = [];

      /* U-47. The authoritative unit cost of a batch, keyed by batch uid, read
       * from valley_current_products — the SAME source and the same lookup the
       * read path uses in getValleyMfgOrderFull_. The client's `unit_cost` is
       * ignored entirely: it was never the client's to set, and once the cost
       * columns are stripped from the read for users without valley_cost_view
       * (S5) a client payload no longer carries one at all.
       *
       * Every footer batch is guaranteed to be present here: assertFooterBalances_
       * above throws for any batch uid it cannot find a balance for. */
      var footerBatchCost = {};
      try {
        getAllRecords_(dbId, 'valley_current_products').forEach(function (r) {
          var u = String(r.unique_id || '').trim();
          if (u && footerBatchCost[u] === undefined) footerBatchCost[u] = Number(r.unit_cost) || 0;
        });
      } catch (eFbc) {}

      /* 1) Per-product footer rows (from outputs[].footers) */
      outputs.forEach(function (o, oi) {
        var outUid = outputUidMap[oi];
        var footers = (Array.isArray(o.footers) ? o.footers : []).filter(function (f) { return f && String(f.item || '').trim(); });
        var storedQty = Math.ceil((Number(o.qty) || 0) / 10) * 10;
        var sumF = Math.round(footers.reduce(function (t, f) { return t + (Number(f.qty) || 0); }, 0) * 1000) / 1000;
        var delta = Math.round((storedQty - sumF) * 1000) / 1000;
        var deltaIx = -1;
        if (Math.abs(delta) > 0.0000001 && footers.length) {
          var mq = -Infinity;
          footers.forEach(function (f, ix) { var q = Number(f.qty) || 0; if (q > mq) { mq = q; deltaIx = ix; } });
        }
        footers.forEach(function (f, fix) {
          var m7 = {};
          m7['unique_id'] = uid16Hex_();
          m7['valley_manufacture_header_product_id'] = outUid || moUid;
          m7['item'] = String(f.item || '').trim();
          m7['item_code'] = String(f.item_code || '');
          var fq = Math.round((Number(f.qty) || 0) * 1000) / 1000;
          if (fix === deltaIx) fq = Math.round((fq + delta) * 1000) / 1000;
          m7['qty'] = fq;
          /* U-47: server-resolved, never f.unit_cost. */
          m7['cost_unit'] = footerBatchCost[m7['item']] || 0;
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
          m7['unique_id'] = uid16Hex_();
          m7['valley_manufacture_header_product_id'] = firstOutputUid;
          m7['item'] = String(cm.item_pid || '').trim();
          m7['item_code'] = String(cm.lot || '');
          m7['qty'] = Math.round((Number(cm.qty) || 0) * 1000) / 1000;
          m7['created_at'] = new Date();
          m7['user'] = (user && user.email) || '';
          return consHeaders.map(function (h) {
            var k = String(h).trim();
            return m7[k] !== undefined ? m7[k] : '';
          });
        });
      }

      try { Logger.log('MFGTRACE consumption: rows=' + consRows.length + ' tab=' + sheetCons.getName() + ' consumption_in=' + consumption.length); } catch (eLg4) {}
      if (consRows.length) {
        /* Phase 8 (F-04): one setValues + 2 writeFormula_ per row -> 1 write.
         * Locked and grid-grown for the same reason as the outputs block. */
        executeWithLock_(function () {
          var consStart2 = sheetCons.getLastRow() + 1;
          ensureGridRows_(sheetCons, consStart2 + consRows.length - 1);
          consRows.forEach(function (rv, ci) {
            applyRowFormulas_(rv, consHeaders, mfgConsumptionFormulaMap_(consStart2 + ci));
          });
          sheetCons.getRange(consStart2, 1, consRows.length, consHeaders.length).setValues(consRows);
          noteMutation_(sheetCons);
        });
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
      /* Phase 13 (F-04): the appends in this mixed update/append loop are collected
       * and written as one setValues instead of one appendRow per new work centre.
       * Phase 8 skipped this because getNextIdUnderLock_ runs between iterations and
       * deferring the appends changes what it reads. It does — and it does not change
       * what it RETURNS. That function returns `current` (the ID_Counter value) when
       * current > tableMax, and tableMax + 1 otherwise, then sets the counter to
       * returned + 1. Every return is therefore >= tableMax + 1, so from the second
       * call onward the counter is strictly greater than the table max whether or not
       * the previous row has landed, and both orderings take the same branch and yield
       * the same id. The update branch never writes the id column, so an interleaved
       * update cannot move tableMax either.
       * Row numbers are unchanged for the same reason the Phase 8 blocks are: only
       * appends change the row count during this loop (the deletes run after it), so
       * the batch starts at the same getLastRow() + 1 and lands in the same order.
       * Locked and grid-grown because a precomputed start row, unlike appendRow, is
       * not safe against a concurrent append. */
      var wcNewRows = [];
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
          m['unique_id'] = uid16Hex_();
          m['id'] = getNextIdUnderLock_(dbId, WC_SHEET, 'id');
          m['valley_manufacture_header_id'] = moUid;
          m['user'] = (user && user.email) || '';
          m['created_at'] = new Date();
          var vals = wcHeaders.map(function (h) { var k = String(h).trim(); return m[k] !== undefined ? m[k] : ''; });
          wcNewRows.push(vals);
          keepWcUids.push(m['unique_id']);
        }
      });
      if (wcNewRows.length) {
        executeWithLock_(function () {
          var wcStart = sheetWC.getLastRow() + 1;
          ensureGridRows_(sheetWC, wcStart + wcNewRows.length - 1);
          sheetWC.getRange(wcStart, 1, wcNewRows.length, wcHeaders.length).setValues(wcNewRows);
          noteMutation_(sheetWC);
        });
      }
      /* ONE read for every dropped work op, not one per op. */
      deleteRowsWhereIn_(sheetWC, 'unique_id', existingWC
        .filter(function (r) { return keepWcUids.indexOf(String(r.unique_id)) === -1; })
        .map(function (r) { return String(r.unique_id); }));
      try { Logger.log('MFGTRACE workops: in=' + (Array.isArray(d.work_ops) ? d.work_ops.length : 0) + ' kept=' + keepWcUids.length + ' tab=' + sheetWC.getName()); } catch (eLg5) {}

      /* work-center cost columns are SHEET FORMULAS */
      var wcAll = sheetWC.getDataRange().getValues();
      var wcHdrs = getHeaders_(sheetWC);
      var wcUidIdx = wcHdrs.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
      keepWcUids.forEach(function (uid) {
        for (var wr = 1; wr < wcAll.length; wr++) {
          if (String(wcAll[wr][wcUidIdx]).trim() === String(uid).trim()) {
            var rN = wr + 1;
            writeRowFormulas_(sheetWC, wcHdrs, rN, mfgWorkCenterFormulaMap_(rN));
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
        m['unique_id'] = uid16Hex_();
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
        /* Phase 8 (F-04): the worst site in the file — writeByproductFormulas_
         * issued FOUR writeFormula_ calls per row, each with its own getSheet_ +
         * getHeaders_ + setFormula. Merged into the block write: a 4-by-product
         * order goes from 17 round trips to 1. Locked and grid-grown as above. */
        executeWithLock_(function () {
          var bpStart = sheetBP.getLastRow() + 1;
          ensureGridRows_(sheetBP, bpStart + bpRows.length - 1);
          bpRows.forEach(function (rv, bi) {
            applyRowFormulas_(rv, bpHeaders, byproductFormulaMap_(bpStart + bi));
          });
          sheetBP.getRange(bpStart, 1, bpRows.length, bpHeaders.length).setValues(bpRows);
          noteMutation_(sheetBP);
        });
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
          noteMutation_(sheetU);
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
          noteMutation_(sheet);
          sheet.getRange(r + 1, patIdx + 1).setValue(new Date());
          noteMutation_(sheet);
        } else {
          sheet.getRange(r + 1, qaIdx + 1).setValue((user && user.email) || '');
          noteMutation_(sheet);
          sheet.getRange(r + 1, qatIdx + 1).setValue(new Date());
          noteMutation_(sheet);
        }
        /* auto-lock when both approvals exist */
        var hasProd = kind === 'production' || (paIdx !== -1 && String(dataAll[r][paIdx]).trim() !== '');
        var hasQual = kind === 'quality' || (qaIdx !== -1 && String(dataAll[r][qaIdx]).trim() !== '');
        if (hasProd && hasQual && stIdx !== -1) {
          sheet.getRange(r + 1, stIdx + 1).setValue('Locked');
          noteMutation_(sheet);
        }
        var newObj = Object.assign({}, oldObj, kind === 'production'
          ? { production_approval: (user && user.email) || '', production_approval_time: new Date() }
          : { quality_approval: (user && user.email) || '', quality_approval_time: new Date() });
        var oldUid = oldObj.record_uid || ('upd_' + MFG_ORDER_SHEET + '_' + moUid);
        try { logHistory_(dbId, MFG_ORDER_SHEET, oldUid, moUid, (user && user.email) || '', 'approve', newObj, oldObj); } catch (eHist) {}
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
      var canLock = !!(user && (user.isSuperAdmin || unifiedCheck_(user, '9940659bd83035d7', 'vf_mfg_orders', 'write')));
      if (!canLock) throw new Error('القفل يتطلب صلاحية الكتابة على أوامر التصنيع');
      if (cur !== 'In Progress') throw new Error('يمكن القفل فقط من حالة قيد التنفيذ');
      var fullLock = getValleyMfgOrderFull_({ mo_uid: moUid }, user, dbId);
      (fullLock.outputs || []).forEach(function (o) {
        var pq = Math.round((Number(o.product_qty) || 0) * 1000) / 1000;
        var ps = Math.round(((o.footers || []).reduce(function (t, f) { return t + (Number(f.qty) || 0); }, 0)) * 1000) / 1000;
        if (Math.abs(ps - pq) > 0.01) {
          throw new Error('لا يمكن القفل: مجموع دفعات الصنف (' + (o.product_name || o.product_id) + ') لا يساوي كمية البند. المجموع: ' + ps + '، الكمية: ' + pq);
        }
      });
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
          noteMutation_(sheet);
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
        var raw = (Number(s.required_qty || 0) * ratio) * (1 + lossPct);
        materials.push({
          raw_material_id: String(s.raw_material_id || ''),
          raw_material_name: String(s.raw_material_name || ''),
          required_qty: Math.ceil(raw / 10) * 10
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

  /* A date-only bound like "2026-03-31" is what the <input type="date"> filters
     send. `new Date('2026-03-31')` is UTC midnight, which in a UTC+2 script is
     02:00 local — so a "from" bound would drop rows stamped early on its own
     first day, and a "to" bound would drop everything after midnight on its
     last. Both ends are therefore parsed as local times, "to" at the end of its
     day. A full timestamp is used as given. */
  function vfDateBound_(v, endOfDay) {
    if (!v) return null;
    var t = String(v).trim();
    var d = /^\d{4}-\d{2}-\d{2}$/.test(t)
      ? new Date(t + (endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'))
      : new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  /* Batch 7: opt-in list bounding. When the caller passes payload.from /
   * payload.to (ISO date strings) and/or payload.limit, the list is trimmed to
   * that window. With none provided the rows are returned untouched, so
   * existing clients keep their current (unbounded) behavior. Date filtering
   * treats unparseable dates as "keep" so we never hide data by accident. */
  function vfBoundRows_(rows, payload, dateField) {
    if (!rows || !rows.length) return rows;
    payload = payload || {};
    var from = vfDateBound_(payload.from, false);
    var to = vfDateBound_(payload.to, true);
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
    var from = vfDateBound_(payload.from, false);
    var to = vfDateBound_(payload.to, true);
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
    /* U-46. `order` and `outputs` are whole sheet rows, so their cost columns
       ride along implicitly; the footers are projected above with unit_cost and
       total_cost. Quantities, batch uids and lots are untouched, so batch
       allocation and save still work without the grant. */
    if (!vfCanSeeCost_(user)) {
      vfStripCost_(order, VF_COST_KEYS.mfg_order);
      vfStripCostAll_(outputs, VF_COST_KEYS.mfg_output);
      outputs.forEach(function (o) { vfStripCostAll_(o.footers, VF_COST_KEYS.mfg_footer); });
    }
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
    var productOpts = finRefsCached_(dbId, 'vf_products_opts_plain', function () {
      return getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
        return { value: p.id, label: String(p.name_ar || ('#' + p.id)) };
      });
    });
    /* U-46. Quantity and transaction_code stay; only the cost is removed.
       Safe on the save side: valley_manufacture_by_product.total_cost is a
       sheet formula, so the client's value is overwritten regardless. */
    var _bpCost = vfCanSeeCost_(user);
    if (!_bpCost) vfStripCostAll_(rows, VF_COST_KEYS.mfg_bp);
    return { status: 'success', byproducts: rows, total: total, product_options: productOpts, can_see_cost: _bpCost };
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
      m8['unique_id'] = uid16Hex_();
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
      /* Phase 8 (F-04): appendRow + 4 writeFormula_ -> one setValues. Already
       * inside executeWithLock_, so the precomputed row is safe; the row number
       * is identical to what appendRow produced (getLastRow()+1). */
      var _bpRow = sheet.getLastRow() + 1;
      ensureGridRows_(sheet, _bpRow);
      applyRowFormulas_(values, headers, byproductFormulaMap_(_bpRow));
      sheet.getRange(_bpRow, 1, 1, values.length).setValues([values]);
      noteMutation_(sheet);
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
    /* U-46. The echoed record carries the by-product's total_cost. */
    if (!vfCanSeeCost_(user)) vfStripCost_(_savedBP, VF_COST_KEYS.mfg_bp);
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
            /* U-45. Both columns exist in valley_manufacture_work_center and are
             * populated by sheet formulas (work_center_cost by an INDEX/MATCH on
             * valley_work_centers, total_cost by =K*J), but the projection omitted
             * them — so the print template's fmt3(undefined) rendered 0.000 on
             * every manufacturing order. Coerced to a number so a formula that
             * errors (#N/A on a deleted work centre) still reads 0 rather than
             * printing NaN, which is what it does today. */
            work_center_cost: Number(r.work_center_cost) || 0,
            total_cost: Number(r.total_cost) || 0,
            last_pause_time: r.last_pause_time || '',
            total_pause_duration: r.total_pause_duration != null ? r.total_pause_duration : 0,
            notes: r.notes || ''
          });
        }
      });
    } catch (e) {}
    rows.sort(function (a, b) { return numSafe_(a.work_center_sequence) - numSafe_(b.work_center_sequence); });
    function numSafe_(v) { var n = Number(v); return isNaN(n) ? 9999 : n; }
    /* U-46. The two fields S2 added are exactly the two that get stripped. */
    var _wcCost = vfCanSeeCost_(user);
    if (!_wcCost) vfStripCostAll_(rows, VF_COST_KEYS.mfg_workop);
    return { status: 'success', workops: rows, work_center_options: mfgWorkCenterOptions_(dbId), statuses: MFG_WC_OP_STATUSES, can_see_cost: _wcCost };
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
        noteMutation_(sheet);
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
      var manualStart = parseDt_(d.start_time);
      var manualEnd = parseDt_(d.end_time);
      var manualDone = (curStatus === 'Pending' && manualStart && manualEnd);
      if (curStatus !== 'In Progress' && curStatus !== 'Paused' && !manualDone) throw new Error('يمكن الإيقاف فقط من حالة In Progress أو Paused');
      map['operation_status'] = 'Done';
      var endTime = manualEnd || parseDt_(d.end_time) || now;
      map['end_time'] = endTime;
      if (manualDone) map['start_time'] = manualStart;
      if (curStatus === 'Paused' && lastPause) {
        var pauseMsStop = endTime.getTime() - new Date(lastPause).getTime();
        pauseDur += pauseMsStop / 3600000;
        map['total_pause_duration'] = Math.round(pauseDur * 100) / 100;
      }
      var startTime = manualDone ? manualStart : parseDt_(found.row.start_time);
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
        noteMutation_(sheet);
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
        noteMutation_(sheet);
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
        noteMutation_(sheet);
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
          noteMutation_(sheetP);
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
      noteMutation_(sheetSteps);
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

  const VF_MONTH_NAMES_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
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
   * stored value = «المستوى الخامس». No filter of any kind — every row in the
   * chart of accounts that carries a non-empty level-5 code is offered, full
   * stop, whatever that value looks like. */
  /**
   * تقرير المصروفات — what was spent, per expense account, for one month and
   * for the year to date, each as a share of its own total.
   *
   * WHAT COUNTS AS AN EXPENSE: a cash movement whose chart_code resolves to a
   * valley_chart_of_accounts row with «المستوى الاساسي» = 3. That column is the
   * authority; nothing here hardcodes a code range. The account is shown by its
   * «كود المستوى» label, which is what people read.
   *
   * THE AMOUNT: the sheet's own `total` when it holds a number, because that is
   * the column the spreadsheet computes and people reconcile against. When it is
   * blank the same figure is rebuilt from what this app writes —
   * transaction_amount − total_discount + taxes — which is the formula the
   * AppSheet app used for `total`.
   */
  function getValleyCashExpenseReport_(data, user, dbId) {
    var d = data || {};
    var now = new Date();
    var year = Number(d.year) || now.getFullYear();
    var month = Number(d.month) || (now.getMonth() + 1);
    if (month < 1 || month > 12) throw new Error('الشهر يجب أن يكون بين 1 و 12');

    /* Which accounts are expenses, and what each is called. */
    var expenseLabels = {};
    var expenseCount = 0;
    getAllRecords_(dbId, FIN_CHART_SHEET).forEach(function (r) {
      if (Number(r['المستوى الاساسي']) !== 3) return;
      var key = String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim();
      if (!key) return;
      var label = String(r['كود المستوى'] == null ? '' : r['كود المستوى']).trim();
      expenseLabels[key] = label || key;
      expenseCount++;
    });
    if (!expenseCount) {
      throw new Error('لا توجد حسابات مصروفات — لم يُعثر على أي صف في دليل الحسابات قيمته في عمود «المستوى الاساسي» = 3');
    }

    function amountOf(r) {
      var t = Number(r.total);
      if (r.total !== '' && r.total != null && !isNaN(t)) return t;
      return (Number(r.transaction_amount) || 0)
        - (Number(r.total_discount) || 0)
        + (Number(r.taxes) || 0);
    }

    var byAccount = {};        /* code -> { month, ytd, monthCount, ytdCount } */
    var byMonth = {};          /* 1..12 -> total, for the trend */
    var monthTotal = 0, ytdTotal = 0;
    /* «حتى اليوم» is today when the report is for the current year, and the
       whole year once it is behind us — otherwise a report on last year would
       silently stop at today's date. */
    var ytdEnd = (year === now.getFullYear())
      ? new Date(year, now.getMonth(), now.getDate(), 23, 59, 59)
      : new Date(year, 11, 31, 23, 59, 59);

    getAllRecords_(dbId, FIN_CASH_SHEET).forEach(function (r) {
      var code = String(r.chart_code == null ? '' : r.chart_code).trim();
      if (!code || expenseLabels[code] === undefined) return;
      var dt = parseDate_(r.transaction_date);
      if (!dt || dt.getFullYear() !== year) return;

      var amt = amountOf(r);
      var m = dt.getMonth() + 1;
      byMonth[m] = (byMonth[m] || 0) + amt;

      if (!byAccount[code]) byAccount[code] = { month: 0, ytd: 0, monthCount: 0, ytdCount: 0 };
      if (dt <= ytdEnd) {
        byAccount[code].ytd += amt;
        byAccount[code].ytdCount++;
        ytdTotal += amt;
      }
      if (m === month) {
        byAccount[code].month += amt;
        byAccount[code].monthCount++;
        monthTotal += amt;
      }
    });

    function pct(part, whole) {
      if (!whole) return 0;
      return Math.round((part / whole) * 10000) / 100;
    }
    var round2 = function (n) { return Math.round(n * 100) / 100; };

    var rows = Object.keys(byAccount).map(function (code) {
      var a = byAccount[code];
      return {
        chart_code: code,
        label: expenseLabels[code],
        month_amount: round2(a.month),
        month_pct: pct(a.month, monthTotal),
        month_count: a.monthCount,
        ytd_amount: round2(a.ytd),
        ytd_pct: pct(a.ytd, ytdTotal),
        ytd_count: a.ytdCount
      };
    }).filter(function (r) { return r.month_amount !== 0 || r.ytd_amount !== 0; });

    rows.sort(function (a, b) { return b.month_amount - a.month_amount || b.ytd_amount - a.ytd_amount; });

    var months = [];
    for (var m2 = 1; m2 <= 12; m2++) {
      months.push({ month: m2, label: VF_MONTH_NAMES_AR[m2 - 1], amount: round2(byMonth[m2] || 0) });
    }

    /* Years that actually have expense movements, so the picker offers real
       choices instead of an arbitrary range. */
    var yearSet = {};
    getAllRecords_(dbId, FIN_CASH_SHEET).forEach(function (r) {
      var code = String(r.chart_code == null ? '' : r.chart_code).trim();
      if (!code || expenseLabels[code] === undefined) return;
      var dt = parseDate_(r.transaction_date);
      if (dt) yearSet[dt.getFullYear()] = true;
    });
    var years = Object.keys(yearSet).map(Number).sort(function (a, b) { return b - a; });
    if (years.indexOf(year) === -1) years.unshift(year);

    return {
      status: 'success',
      year: year,
      month: month,
      month_label: VF_MONTH_NAMES_AR[month - 1],
      ytd_through: (year === now.getFullYear())
        ? (now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2))
        : (year + '-12-31'),
      rows: rows,
      totals: { month_amount: round2(monthTotal), ytd_amount: round2(ytdTotal) },
      months: months,
      years: years,
      accounts_considered: expenseCount
    };
  }

  function buildCashChartOptions_(dbId) {
    return getAllRecords_(dbId, FIN_CHART_SHEET).map(function (r) {
      var lvl5 = String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim();
      if (!lvl5) return null;
      var code = r['كود المستوى'];
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
      boxMap = finRefsCached_(dbId, 'vf_boxes_map', function () {
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
    var partyOpts = finRefsCached_(dbId, 'vf_parties_opts', function () {
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
        user: r.user || '',
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
      var chartOk = getAllRecords_(dbId, FIN_CHART_SHEET).some(function (r) {
        return String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim() === chartCode;
      });
      if (!chartOk) throw new Error('كود الدليل المحاسبي غير موجود ضمن دليل الحسابات');
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
      /* chart_name and chart_account_main are NOT written here — they are the
         sheet's VLOOKUPs into valley_chart_of_accounts, set by
         setComputedFormulas_ once the row number is known. */
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
     * G=date, H=amount, I=discount, J=net_amount, K=taxes, L=total,
     * M=type, N=balance_amount, Q=chart_code, R=chart_name,
     * U=chart_account_main. Every target sits inside the 25 canonical headers.
     *
     * There is no AA and no AB. `Month` and `Year` were AppSheet VIRTUAL
     * columns — computed in the app, never stored — so the =MONTH/=YEAR writes
     * this used to make landed two columns PAST the header row, on a sheet that
     * ends at Y. That widened getLastColumn to 28, so every read of the largest
     * ledger in the company carried three unnamed columns, and two of them
     * collapsed onto one blank record key. Nothing ever read them back: the
     * expenses report derives the month from transaction_date, which is where
     * it has always come from.
     *
     * chart_name and chart_account_main are the sheet's own lookups into
     * valley_chart_of_accounts (I = «المستوى الخامس», the key chart_code holds;
     * N = «كود المستوى»; O = «اسم الحساب الرئيسي»), written here so an appended
     * row carries what a hand-entered row carries. chart_code is optional and
     * is validated against that same sheet when present, so the lookup can only
     * hit — and with no chart_code there is nothing to look up, so the two
     * cells are cleared rather than left holding #N/A. */
    function setComputedFormulas_(rowNumber) {
      sheet.getRange(rowNumber, 10).setValue('=H' + rowNumber + '-I' + rowNumber);           // net_amount
      noteMutation_(sheet);
      sheet.getRange(rowNumber, 12).setValue('=J' + rowNumber + '+K' + rowNumber);           // total
      noteMutation_(sheet);
      sheet.getRange(rowNumber, 14).setValue(                                                 // balance_amount
        '=IFS(M' + rowNumber + '="Credit Note",L' + rowNumber + '*-1,M' + rowNumber + '="Credit",L' + rowNumber + '*-1,TRUE,L' + rowNumber + ')');
      noteMutation_(sheet);
      sheet.getRange(rowNumber, 18).setValue(                                                 // chart_name
        chartCode ? '=VLOOKUP(Q' + rowNumber + ',valley_chart_of_accounts!I:N,6,0)' : '');
      noteMutation_(sheet);
      sheet.getRange(rowNumber, 21).setValue(                                                 // chart_account_main
        chartCode ? '=VLOOKUP(Q' + rowNumber + ',valley_chart_of_accounts!I:O,7,0)' : '');
      noteMutation_(sheet);
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
        /* chart_name / chart_account_main: see setComputedFormulas_ */
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
      noteMutation_(sheet);
      sheet.getRange(rowNum, 10).setValue('=H' + rowNum + '-I' + rowNum);
      noteMutation_(sheet);
      sheet.getRange(rowNum, 12).setValue('=J' + rowNum + '+K' + rowNum);
      noteMutation_(sheet);
      sheet.getRange(rowNum, 14).setValue(
        '=IFS(M' + rowNum + '="Credit Note",L' + rowNum + '*-1,M' + rowNum + '="Credit",L' + rowNum + '*-1,TRUE,L' + rowNum + ')');
      noteMutation_(sheet);
      /* No AA/AB here either — see setComputedFormulas_ in saveValleyCash_ for
         why those two columns do not exist. And no chart lookups: a transfer
         between two boxes carries no chart_code, so R and U stay empty. */
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

  /* ================= حركة المخزن — valley_warehouse_movement =================
   * A table that ALREADY EXISTS in production, inherited from the legacy
   * AppSheet app, with exactly 17 physical columns. Nothing here may change its
   * shape.
   *
   * settingsEnsureSheet_ is deliberately NOT used on this sheet. It appends any
   * canonical header it believes is missing, so a single typo in the list below
   * — `movement_sign` for the production misspelling `movmenent_sign`, say —
   * would silently add an 18th column to a live table. whAssertHeaders_ reads
   * and asserts instead, and never writes.
   *
   * Add + list only, on purpose: a stock ledger stays append-only. A `منصرف`
   * is cancelled by a matching `وارد داخلي / مرتجع للمخزن`, not by an edit. */
  const WH_MOVE_SHEET   = 'valley_warehouse_movement';
  /* Physical order, verified against appsheet_old_project.html
     § table_valley_warehouse_movement_Schema. `movmenent_sign` is misspelled in
     production and MUST stay misspelled. `user_name` and `product_current` are
     legacy VIRTUAL columns — they are not on the sheet and are never written. */
  const WH_MOVE_HEADERS = ['unique_id','id','warehouse','vendor','item','item_code','unit','qty',
                           'amount','movement_type','movmenent_sign','movement_date','asset_target',
                           'responsible_person','notes','user','created_at'];
  const WH_WAREHOUSE    = 'مخزن مصنع فالي فودز';
  const WH_MOVE_TYPES   = ['منصرف', 'وارد داخلي / مرتجع للمخزن'];
  const WH_IN_TYPE      = 'وارد داخلي / مرتجع للمخزن';

  /* Positional: F=item_code and K=movmenent_sign are written as formulas, so a
     reordered sheet must fail loudly rather than write a formula into the wrong
     column. Never appends — this is a production table. */
  function whAssertHeaders_(sheet) {
    var actual = getHeaders_(sheet).map(function (h) { return String(h).trim(); });
    for (var i = 0; i < WH_MOVE_HEADERS.length; i++) {
      if (String(actual[i] || '').toLowerCase() !== WH_MOVE_HEADERS[i].toLowerCase()) {
        throw new Error('تغيّر ترتيب أعمدة جدول حركة المخزن: العمود رقم ' + (i + 1) +
          ' يجب أن يكون «' + WH_MOVE_HEADERS[i] + '» وهو حاليًا «' + (actual[i] || 'فارغ') +
          '». تم إيقاف العملية حفاظًا على سلامة البيانات.');
      }
    }
    return actual;
  }

  /* The two sheet-computed columns, in the same style as
     mfgConsumptionFormulaMap_. Recovered from the legacy R1C1 definitions:
       item_code  (F): RC[-1] -> E, C[-5]:C[-3] -> A:C, C[-5]:C -> A:F
       movmenent_sign (K): RC[-1] -> J (movement_type), RC[-3] -> H (qty)
     The sign formula compares the FULL enum string. A version comparing only
     "وارد" makes EVERY row negative and looks right in review. */
  function whMoveFormulaMap_(r) {
    return {
      'item_code': '=IFERROR(VLOOKUP(E' + r + ',valley_product_purchasing!A:C,3,0),IFERROR(VLOOKUP(E' + r + ',valley_manufacture_header!A:C,3,0),IFERROR(VLOOKUP(E' + r + ',valley_manufacture_by_product!A:F,6,0),"")))',
      'movmenent_sign': '=IF(J' + r + '="وارد داخلي / مرتجع للمخزن",H' + r + ',H' + r + '*-1)'
    };
  }

  /* Batch availability for the WHOLE warehouse.

       available = current_qty

     valley_current_products.current_qty is the NET balance and it is TRUSTED.
     Sales, sales returns, manufacturing consumption and this table's own signed
     movements are ALREADY inside it, so subtracting any of them here is a
     double count. حركة المخزن is add-only — there is no document being
     edited — so there is no add-back either.

     Never strips unit_cost: this is the server's own costing input, and the
     cost gate applies to what leaves the server, not to what it computes with. */
  function whBatchAvailability_(dbId) {
    var batches = {};
    try {
      getAllRecords_(dbId, 'valley_current_products').forEach(function (r) {
        var uid = String(r.unique_id || '').trim();
        if (!uid) return;
        batches[uid] = {
          batch_uid: uid,
          lot: String(r.transaction_code || '-'),
          product_id: String(r.product_id == null ? '' : r.product_id).trim(),
          product_name: String(r.product || '').trim(),
          current_qty: Number(r.current_qty) || 0,
          unit_cost: Number(r.unit_cost) || 0,
          unit: String(r.unit || ''),
          transaction_date: r.transaction_date || ''
        };
      });
    } catch (e) {}

    Object.keys(batches).forEach(function (k) {
      var b = batches[k];
      b.available = Math.max(0, b.current_qty);
    });
    return batches;
  }

  /* unit of a batch, falling back to valley_products.unit via product_id */
  function whBatchUnit_(dbId, batch) {
    var unit = String((batch && batch.unit) || '').trim();
    if (unit || !batch || !batch.product_id) return unit;
    try {
      var p = getAllRecords_(dbId, FIN_PRODUCTS_SHEET).find(function (x) {
        return String(x.id == null ? '' : x.id).trim() === batch.product_id;
      });
      if (p) unit = String(p.unit || '').trim();
    } catch (e) {}
    return unit;
  }

  function whVendorNames_(dbId) {
    var m = {};
    try {
      getAllRecords_(dbId, FIN_PARTIES_SHEET).forEach(function (p) {
        var k = String(p.id == null ? '' : p.id).trim();
        if (k) m[k] = String(p.name || k);
      });
    } catch (e) {}
    return m;
  }

  function whEmployeeNames_(dbId) {
    var m = {};
    try {
      getAllRecords_(dbId, EMP_INFO_SHEET).forEach(function (e) {
        var k = String(e.emp_id == null ? '' : e.emp_id).trim();
        if (k) m[k] = String(e.name || e.name_ar || k);
      });
    } catch (e) {}
    return m;
  }

  /* ---------- list ---------- */
  function getValleyWarehouseMovements_(data, user, dbId) {
    var sheet = getSheet_(WH_MOVE_SHEET, dbId);
    whAssertHeaders_(sheet);

    var vendorNames = whVendorNames_(dbId);
    var empNames = whEmployeeNames_(dbId);
    var batchInfo = {};
    try {
      getAllRecords_(dbId, 'valley_current_products').forEach(function (r) {
        var uid = String(r.unique_id || '').trim();
        if (uid) batchInfo[uid] = { lot: String(r.transaction_code || ''), product: String(r.product || '') };
      });
    } catch (e) {}

    var rows = getAllRecords_(dbId, WH_MOVE_SHEET).map(function (r) {
      var buid = String(r.item || '').trim();
      var bi = batchInfo[buid] || null;
      var vkey = String(r.vendor == null ? '' : r.vendor).trim();
      var rkey = String(r.responsible_person == null ? '' : r.responsible_person).trim();
      return {
        id: r.id,
        unique_id: String(r.unique_id || ''),
        movement_date: r.movement_date || '',
        item: buid,
        /* legacy rows may carry a batch that no longer exists; show the raw uid */
        item_label: bi ? ((bi.lot || buid) + (bi.product ? ' — ' + bi.product : '')) : buid,
        item_code: String(r.item_code || ''),
        vendor: vkey,
        /* an unknown ref resolves to itself rather than to an empty cell */
        vendor_name: vkey ? (vendorNames[vkey] || vkey) : '',
        unit: String(r.unit || ''),
        qty: Number(r.qty) || 0,
        amount: Number(r.amount) || 0,
        movement_type: String(r.movement_type || ''),
        movmenent_sign: Number(r.movmenent_sign) || 0,
        responsible_person: rkey,
        /* legacy rows stored a dept section here, not an emp_id — fall back to
           the stored value so those rows still read correctly */
        responsible_name: rkey ? (empNames[rkey] || rkey) : '',
        notes: String(r.notes || ''),
        user: String(r.user || '')
      };
    });

    /* newest first, id as the tie-break */
    rows.sort(function (a, b) {
      var da = a.movement_date ? new Date(a.movement_date).getTime() : 0;
      var db = b.movement_date ? new Date(b.movement_date).getTime() : 0;
      if (db !== da) return db - da;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

    var paged = vfPage_(rows, data, 'movement_date');
    var canCost = vfCanSeeCost_(user);
    /* Server-enforced: the keys are DELETED from the payload, not hidden in CSS. */
    if (!canCost) vfStripCostAll_(paged.rows, VF_COST_KEYS.warehouse_move);
    return {
      status: 'success',
      rows: paged.rows,
      total: paged.total,
      can_see_cost: canCost,
      warehouse: WH_WAREHOUSE,
      movement_types: WH_MOVE_TYPES,
      in_type: WH_IN_TYPE
    };
  }

  /* ---------- form bootstrap: vendors + employees + available batches ---------- */
  function getValleyWarehouseMoveOptions_(data, user, dbId) {
    var vendorNames = whVendorNames_(dbId);
    var vendors = Object.keys(vendorNames).map(function (k) {
      return { value: k, label: vendorNames[k] };
    }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });

    var empNames = whEmployeeNames_(dbId);
    var employees = Object.keys(empNames).map(function (k) {
      return { value: k, label: empNames[k] };
    }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });

    var avail = whBatchAvailability_(dbId);
    var batches = Object.keys(avail).map(function (k) { return avail[k]; })
      .filter(function (b) { return b.available > 0; })
      .map(function (b) {
        var unit = String(b.unit || '').trim();
        var label = (b.lot || b.batch_uid) +
          (b.product_name ? ' — ' + b.product_name : '') +
          ' — ' + b.available + (unit ? ' ' + unit : '');
        return {
          value: b.batch_uid,
          label: label,
          batch_uid: b.batch_uid,
          lot: b.lot,
          product_id: b.product_id,
          product_name: b.product_name,
          unit: unit,
          unit_cost: b.unit_cost,
          available: b.available
        };
      })
      .sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });

    var canCost = vfCanSeeCost_(user);
    if (!canCost) vfStripCostAll_(batches, VF_COST_KEYS.warehouse_move);

    return {
      status: 'success',
      vendors: vendors,
      employees: employees,
      batches: batches,
      movement_types: WH_MOVE_TYPES,
      in_type: WH_IN_TYPE,
      can_see_cost: canCost
    };
  }

  /* ---------- save (create only) ---------- */
  function saveValleyWarehouseMovement_(data, user, dbId) {
    var d = data || {};

    /* One movement or many, through ONE validated path.
     *
     * The form used to post a single movement and the user had to reopen it for
     * every line of a delivery note. It now posts { ...shared, rows: [ ... ] },
     * where each row may override any shared field. A payload with no `rows` is
     * still a single movement, so nothing that calls this today changes. */
    var rows = Array.isArray(d.rows) && d.rows.length ? d.rows : null;
    var incoming;
    if (rows) {
      incoming = rows.map(function (r) {
        var merged = {};
        Object.keys(d).forEach(function (k) { if (k !== 'rows') merged[k] = d[k]; });
        Object.keys(r || {}).forEach(function (k) {
          if (r[k] !== undefined && r[k] !== null && r[k] !== '') merged[k] = r[k];
        });
        return merged;
      });
    } else {
      incoming = [d];
    }
    if (!incoming.length) throw new Error('لا توجد حركات للحفظ');
    /* A whole delivery note is tens of lines, not thousands. The cap keeps one
       request inside the six-minute limit and bounds the batch write. */
    if (incoming.length > 200) {
      throw new Error('حد أقصى 200 حركة في المرة الواحدة — تم إرسال ' + incoming.length);
    }

    /* Read the reference data ONCE for the whole batch, not once per row. */
    var availability = whBatchAvailability_(dbId);
    var empNames = whEmployeeNames_(dbId);
    var vendorNames = whVendorNames_(dbId);

    /* How much each batch has already been drawn down by EARLIER ROWS IN THIS
       SAME SUBMISSION. Without this, two rows issuing from one batch would each
       be checked against the same starting figure and together overdraw it. An
       inbound row credits the batch, so a return followed by an issue works. */
    var drawn = {};
    var prepared = [];

    incoming.forEach(function (row, i) {
      var at = incoming.length > 1 ? ' (السطر ' + (i + 1) + ')' : '';

      var dateVal = parseDate_(row.movement_date);
      if (!dateVal) throw new Error('تاريخ الحركة مطلوب وبصيغة صحيحة' + at);

      var type = String(row.movement_type || '').trim();
      if (WH_MOVE_TYPES.indexOf(type) === -1) {
        throw new Error('نوع الحركة غير صحيح — القيم المسموحة: ' + WH_MOVE_TYPES.join(' / ') + at);
      }

      var batchUid = String(row.item || '').trim();
      if (!batchUid) throw new Error('الدفعة (الصنف) مطلوبة' + at);
      var batch = availability[batchUid];
      if (!batch) throw new Error('الدفعة المختارة غير موجودة في رصيد المخزن' + at);

      var qty = Number(row.qty);
      if (row.qty === '' || row.qty == null || isNaN(qty) || qty <= 0) {
        throw new Error('الكمية مطلوبة ويجب أن تكون أكبر من صفر' + at);
      }

      var resp = String(row.responsible_person || '').trim();
      if (!resp) throw new Error('المسؤول عن الحركة مطلوب' + at);
      if (!empNames[resp]) throw new Error('المسؤول المختار غير موجود في بيانات الموظفين' + at);

      var vendor = String(row.vendor == null ? '' : row.vendor).trim();
      if (vendor && !vendorNames[vendor]) throw new Error('المورد المختار غير موجود' + at);

      /* Over-issue, AUTHORITATIVE and server-side: `available` is what
         whBatchAvailability_ computed off the sheet, less whatever earlier rows
         of this submission already took. Anything the client sent as
         available/amount/unit_cost is ignored entirely. */
      var used = drawn[batchUid] || 0;
      if (type !== WH_IN_TYPE) {
        var remaining = (Number(batch.available) || 0) - used;
        if (qty > remaining) {
          throw new Error('الكمية المطلوب صرفها (' + qty + ') أكبر من المتاح في الدفعة (' +
            remaining + (batch.unit ? ' ' + batch.unit : '') + ')' + at);
        }
        drawn[batchUid] = used + qty;
      } else {
        drawn[batchUid] = used - qty;
      }

      var map = {};
      map['unique_id'] = uid16Hex_();
      map['warehouse'] = WH_WAREHOUSE;          /* constant, never rendered or edited */
      map['vendor'] = vendor;
      map['item'] = batchUid;
      map['unit'] = whBatchUnit_(dbId, batch);
      map['qty'] = qty;
      /* amount is a server-computed snapshot, stored as a static value — never a
         formula, never a number the client sent. */
      map['amount'] = Math.round((Number(batch.unit_cost) || 0) * qty * 100) / 100;
      map['movement_type'] = type;
      map['movement_date'] = dateVal;
      map['asset_target'] = '';                 /* always blank, never rendered */
      map['responsible_person'] = resp;
      map['notes'] = String(row.notes || '').trim();
      map['user'] = (user && user.email) || '';
      map['created_at'] = new Date();
      prepared.push(map);
    });

    /* Nothing above writes, so a bad row anywhere rejects the WHOLE submission
       and the user still has every line in front of them. */
    var sheet = getSheet_(WH_MOVE_SHEET, dbId);
    var headers = whAssertHeaders_(sheet);
    var startId = getNextIdBatch_(dbId, WH_MOVE_SHEET, prepared.length);
    var startRow = sheet.getLastRow() + 1;

    /* item_code and movmenent_sign are sheet formulas; they go into the same
       matrix as the values, so the whole batch is ONE setValues instead of an
       append plus two formula writes per row. */
    var matrix = prepared.map(function (m, i) {
      var rowNo = startRow + i;
      var formulas = whMoveFormulaMap_(rowNo);
      return headers.map(function (h) {
        var name = String(h).trim();
        var lower = name.toLowerCase();
        if (lower === 'id') return startId + i;
        if (formulas[lower] !== undefined) return formulas[lower];
        if (m[name] !== undefined) return m[name];
        return m[lower] !== undefined ? m[lower] : '';
      });
    });
    sheet.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
    noteMutation_(sheet);

    /* ONE audit write for the batch, not one per row. */
    try {
      logHistoryMany_(prepared.map(function (m, i) {
        return {
          dbId: dbId, sheetName: WH_MOVE_SHEET,
          recordUid: 'rec_' + m['unique_id'],
          recordId: startId + i,
          user: (user && user.email) || '',
          action: 'create', newValues: m, oldValues: null
        };
      }));
    } catch (e) {}

    return {
      status: 'success',
      message: prepared.length === 1
        ? 'تم تسجيل حركة المخزن (رقم ' + startId + ')'
        : 'تم تسجيل ' + prepared.length + ' حركة مخزن',
      count: prepared.length,
      id: startId,
      row: startRow
    };
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
    var partyOpts = finRefsCached_(dbId, 'vf_parties_sales_opts', function () {
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

  /**
   * The ONE availability figure in the system.
   *
   * valley_current_products.current_qty is the net balance and it is TRUSTED.
   * The sheet already nets purchases, production, by-products, sales, returns,
   * consumption and warehouse movement, so NOTHING here subtracts from it — a
   * second subtraction is a double count, and four different second subtractions
   * is what this function replaces.
   *
   * The only adjustment is the add-back. A document being edited already has its
   * own committed quantity subtracted inside current_qty, and the save is about
   * to rewrite those very rows, so that quantity is still the document's to
   * spend. Without it, re-saving an unchanged order refuses its own stock.
   *
   *     available(batch, document) = current_qty(batch) + held(document, batch)
   *
   * opts: { product_id?, mo_uid?, invoice_uid?, include_empty? }
   *   product_id     — narrow to one product; omitted means the whole warehouse
   *   mo_uid         — the manufacturing order being edited; held comes from its footers
   *   invoice_uid    — the sales invoice being edited; held comes from its allocations
   *   include_empty  — keep batches with available <= 0. The OFFER filter is
   *                    `available > 0` (a batch this document consumed entirely
   *                    must stay on its own form or the document cannot be
   *                    edited), but a save guard needs every batch it was asked
   *                    about so its refusal can name the real figure.
   *
   * Returns a list, oldest-first by transaction_date — the FIFO allocator
   * depends on that order — of
   *   { batch_uid, lot, product_id, product_name, unit, transaction_date,
   *     unit_cost, current_qty, held, available }
   * Never strips unit_cost: the cost gate applies at the endpoint, to what
   * leaves the server, not to what the server computes with.
   */
  function vfBatchBalance_(dbId, opts) {
    var o = opts || {};
    var pid = String(o.product_id == null ? '' : o.product_id).trim();
    var moUid = String(o.mo_uid || '').trim();
    var invUid = String(o.invoice_uid || '').trim();

    /* held is 0 for a new document: no mo_uid and no invoice_uid, no add-back. */
    var held = moUid ? vfMfgHeldByBatch_(dbId, moUid)
      : (invUid ? vfSalesHeldByBatch_(dbId, invUid) : {});

    var list = [];
    try {
      getAllRecords_(dbId, 'valley_current_products').forEach(function (r) {
        var uid = String(r.unique_id || '').trim();
        if (!uid) return;
        var rp = String(r.product_id == null ? '' : r.product_id).trim();
        if (pid && rp !== pid) return;
        var cur = Number(r.current_qty) || 0;
        var h = Number(held[uid]) || 0;
        list.push({
          batch_uid: uid,
          lot: String(r.transaction_code || '-'),
          product_id: rp,
          product_name: String(r.product || '').trim(),
          unit: String(r.unit || ''),
          transaction_date: r.transaction_date || '',
          unit_cost: Number(r.unit_cost) || 0,
          current_qty: cur,
          held: h,
          available: Math.round((cur + h) * 1000) / 1000
        });
      });
    } catch (e) {}

    if (!o.include_empty) list = list.filter(function (b) { return b.available > 0; });
    list.sort(function (a, b) {
      var da = a.transaction_date ? new Date(a.transaction_date).getTime() : 0;
      var db = b.transaction_date ? new Date(b.transaction_date).getTime() : 0;
      return da - db;
    });
    return list;
  }

  /* batch uid -> quantity THIS manufacturing order already holds on the sheet.
   * A consumption footer is parented on one of the order's output rows
   * (valley_manufacture_header_products.valley_manufacture_header_id), and the
   * save's `outUid || moUid` fallback can parent one directly on the MO uid, so
   * both are accepted. */
  function vfMfgHeldByBatch_(dbId, moUid) {
    var held = {};
    moUid = String(moUid || '').trim();
    if (!moUid) return held;
    var mine = {};
    mine[moUid] = true;
    try {
      getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (o) {
        if (String(o.valley_manufacture_header_id || '').trim() !== moUid) return;
        var u = String(o.unique_id || '').trim();
        if (u) mine[u] = true;
      });
    } catch (e) {}
    try {
      getAllRecords_(dbId, MFG_CONSUMPTION_SHEET).forEach(function (c) {
        if (!mine[String(c.valley_manufacture_header_product_id || '').trim()]) return;
        var b = String(c.item || '').trim();
        if (!b) return;
        held[b] = Math.round(((held[b] || 0) + (Number(c.qty) || 0)) * 1000) / 1000;
      });
    } catch (e) {}
    return held;
  }

  /* batch uid -> quantity THIS sales invoice already holds on the sheet. An
   * allocation is reached through its line's valley_sales_header_id. */
  function vfSalesHeldByBatch_(dbId, invoiceUid) {
    var held = {};
    invoiceUid = String(invoiceUid || '').trim();
    if (!invoiceUid) return held;
    var mine = {};
    try {
      getAllRecords_(dbId, FIN_SALES_LINES_SHEET).forEach(function (l) {
        if (String(l.valley_sales_header_id || '').trim() !== invoiceUid) return;
        var u = String(l.unique_id || '').trim();
        if (u) mine[u] = true;
      });
    } catch (e) {}
    try {
      getAllRecords_(dbId, 'valley_sales_product_stock').forEach(function (a) {
        if (!mine[String(a.valley_sales_products_id || '').trim()]) return;
        var b = String(a.product_unique_id || '').trim();
        if (!b) return;
        held[b] = Math.round(((held[b] || 0) + (Number(a.product_qty) || 0)) * 1000) / 1000;
      });
    } catch (e) {}
    return held;
  }

  /* ---------- P2: batch availability for a product ----------
   * One line, one authority:
   *     available(batch, document) = current_qty(batch) + held(document, batch)
   * See vfBatchBalance_. Nothing is subtracted here. */
  function getValleyProductBatches_(data, user, dbId) {
    var pid = String((data && data.product_id) || '').trim();
    if (!pid) throw new Error('معرّف المنتج مطلوب');
    /* invoice_uid is canonical. exclude_invoice_unique_id stays accepted as an
       alias so a half-deployed client cannot break — but its MEANING changed
       from *exclude* to *add back*, which is why the name had to change too. */
    var invoiceUid = String((data && (data.invoice_uid || data.exclude_invoice_unique_id)) || '').trim();
    var moUid = String((data && data.mo_uid) || '').trim();
    var list = vfBatchBalance_(dbId, { product_id: pid, mo_uid: moUid, invoice_uid: invoiceUid });

    /* U-46. batch_uid, lot, current_qty, available, transaction_date and unit
       all stay — FIFO allocation and the batch modal need every one of them.
       Only unit_cost goes. */
    if (!vfCanSeeCost_(user)) vfStripCostAll_(list, VF_COST_KEYS.batch);
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
     * Per-batch availability = current_qty, the sheet's NET balance, taken raw.
     * Existing sale allocations and return restorations are already inside it,
     * so a second subtraction here would be a double count. */
    var allocByLine = [];
    var batchUsage = {};
    /* current quantities per batch for the requested products */
    var requestedProducts = {};
    cleanLines.forEach(function (ln) { requestedProducts[String(ln.product_id)] = true; });
    /* available = current_qty + what THIS invoice already holds on the sheet.
       Its allocations are rewritten by this save, so that quantity is still the
       invoice's to spend. A new invoice holds nothing and adds back nothing. */
    var batchCurrent = {};
    vfBatchBalance_(dbId, {
      invoice_uid: editing ? String(d.invoice_unique_id || '').trim() : '',
      include_empty: true
    }).forEach(function (b) {
      if (!requestedProducts[b.product_id]) return;
      if (batchCurrent[b.batch_uid] !== undefined) return;
      batchCurrent[b.batch_uid] = { pid: b.product_id, lot: b.lot, current: b.available, unit_cost: b.unit_cost };
    });

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
        noteMutation_(sheetInv);
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
        noteMutation_(sheetInv);
        try{ logHistory_(dbId, FIN_SALES_INV_SHEET, map.record_uid || ('create_'+FIN_SALES_INV_SHEET+'_'+uid), uid, (user&&user.email)||'', 'create', map, null) }catch(e){}
      }

      /* Rewrite lines */
      var sheetLines = getSheet_(FIN_SALES_LINES_SHEET, dbId);
      var lineHeaders = getHeaders_(sheetLines);
      /* the line uids this invoice had BEFORE the rewrite — read while the rows
         are still there. A line the user removed is not in cleanLines, so
         without this its allocations would survive and hold their batches. */
      var priorLineUids = [];
      if (editing) {
        try {
          getAllRecords_(dbId, FIN_SALES_LINES_SHEET).forEach(function (l) {
            if (String(l.valley_sales_header_id || '').trim() === existingUid) priorLineUids.push(String(l.unique_id || '').trim());
          });
        } catch (ePl) {}
      }
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
        noteMutation_(sheetLines);
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
      priorLineUids.forEach(function (lu) { if (lu) invLineUids[lu] = true; });
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
          noteMutation_(allocSheet);
          var totalRows = allocSheet.getLastRow();
          if (totalRows > newBody.length + 1) allocSheet.deleteRows(newBody.length + 2, totalRows - (newBody.length + 1));
          noteMutation_(allocSheet);
        } else {
          var totalRows2 = allocSheet.getLastRow();
          if (totalRows2 > 1) allocSheet.deleteRows(2, totalRows2 - 1);
          noteMutation_(allocSheet);
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
        noteMutation_(allocSheet);
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
        noteMutation_(sheet);
        sheet.getRange(r + 1, apIdx + 1).setValue(next === 'Approved' ? ((user && user.email) || '') : '');
        noteMutation_(sheet);
        sheet.getRange(r + 1, atIdx + 1).setValue(next === 'Approved' ? new Date() : '');
        noteMutation_(sheet);
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
    var partyOpts = finRefsCached_(dbId, 'vf_parties_opts', function () {
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
        noteMutation_(sheetRet);
        /* ONE audit write for every returned line, not one per line. */
        try {
          var _uidIx = retHeaders.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
          var _qtyIx = retHeaders.findIndex(function (h) { return String(h).trim() === 'valley_return_qty'; });
          logHistoryMany_(retRowsToWrite.map(function (r) {
            var _uid = r[_uidIx];
            return {
              dbId: dbId, sheetName: FIN_RETURNS_SHEET,
              recordUid: 'create_' + FIN_RETURNS_SHEET + '_' + _uid,
              recordId: _uid, user: (user && user.email) || '',
              action: 'create',
              newValues: {
                unique_id: _uid, id: groupId, valley_sales_invoices_id: invUid,
                valley_return_qty: r[_qtyIx], valley_return_date: retDate
              },
              oldValues: null
            };
          }));
        } catch (e) {}
      }
      if (stockRowsToWrite.length) {
        var stStart = sheetStock.getLastRow() + 1;
        sheetStock.getRange(stStart, 1, stockRowsToWrite.length, stockHeaders.length).setValues(stockRowsToWrite);
        noteMutation_(sheetStock);
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
          noteMutation_(sh);
          var totalRows = sh.getLastRow();
          if (totalRows > newBody.length + 1) sh.deleteRows(newBody.length + 2, totalRows - (newBody.length + 1));
          noteMutation_(sh);
        } else {
          var totalRows2 = sh.getLastRow();
          if (totalRows2 > 1) sh.deleteRows(2, totalRows2 - 1);
          noteMutation_(sh);
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
    ValleyFoods.register('get_attendance_employees',  getAttendanceEmployees_);
    ValleyFoods.register('add_manual_attendance',     addManualAttendance_);
    ValleyFoods.register('commit_attendance_import', commitAttendanceImport_);
    ValleyFoods.register('get_attendance_report',     getAttendanceReport_);
    ValleyFoods.register('get_attendance_index',      getAttendanceIndex_);
    ValleyFoods.register('get_attendance_review',     getAttendanceReview_);
    ValleyFoods.register('resolve_attendance_review', resolveAttendanceReview_);
    ValleyFoods.register('get_attendance_exceptions', getAttendanceExceptions_);
    ValleyFoods.register('get_attendance_batches',    getAttendanceBatches_);
    ValleyFoods.register('revert_attendance_import',  revertAttendanceImport_);
    ValleyFoods.register('add_upload_file',            addUploadFile_);

    ValleyFoods.register('get_overtime_roles_settings', getOvertimeRolesSettings_);
    ValleyFoods.register('save_overtime_role', withRefBust_(saveOvertimeRole_, ['overtime_roles']));
    ValleyFoods.register('toggle_overtime_role', withRefBust_(toggleOvertimeRole_, ['overtime_roles']));

    ValleyFoods.register('get_deduction_roles_settings', getDeductionRolesSettings_);
    ValleyFoods.register('save_deduction_role', withRefBust_(saveDeductionRole_, ['deduction_roles']));
    ValleyFoods.register('toggle_deduction_role', withRefBust_(toggleDeductionRole_, ['deduction_roles']));

    ValleyFoods.register('get_vacations_index_settings', getVacationsIndexSettings_);
    ValleyFoods.register('save_vacation_index', withRefBust_(saveVacationIndex_, ['vacations_index']));
    ValleyFoods.register('toggle_vacation_index', withRefBust_(toggleVacationIndex_, ['vacations_index']));

    ValleyFoods.register('get_shift_schedule_settings',  getShiftScheduleSettings_);
    ValleyFoods.register('save_shift_schedule', withRefBust_(saveShiftSchedule_, ['shift_schedule']));
    ValleyFoods.register('toggle_shift_schedule', withRefBust_(toggleShiftSchedule_, ['shift_schedule']));

    // ===================== FINANCE MASTER DATA =====================
    ValleyFoods.register('get_valley_products',   getValleyProducts_);
    ValleyFoods.register('save_valley_product', withRefBust_(saveValleyProduct_));
    ValleyFoods.register('get_valley_parties',    getValleyParties_);
    ValleyFoods.register('save_valley_party', withRefBust_(saveValleyParty_));
    ValleyFoods.register('get_valley_party_statement', getValleyPartyStatement_);
    ValleyFoods.register('get_valley_party_balances', getValleyPartyBalances_);

    ValleyFoods.register('get_valley_cash',    getValleyCash_);
    ValleyFoods.register('get_valley_cash_expense_report', getValleyCashExpenseReport_);
    ValleyFoods.register('save_valley_cash', withRefBust_(saveValleyCash_));
    ValleyFoods.register('approve_valley_cash', approveValleyCash_);
    ValleyFoods.register('delete_valley_cash', deleteValleyCash_);

    ValleyFoods.register('get_valley_warehouse_movements',    getValleyWarehouseMovements_);
    ValleyFoods.register('get_valley_warehouse_move_options', getValleyWarehouseMoveOptions_);
    ValleyFoods.register('save_valley_warehouse_movement',    saveValleyWarehouseMovement_);
    ValleyFoods.register('transfer_valley_cash', withRefBust_(transferValleyCash_));

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
  ValleyFoods.register('save_valley_work_center', withRefBust_(saveValleyWorkCenter_, ['work_centers']));
  ValleyFoods.register('get_valley_asset_technicals',  getValleyAssetTechnicals_);
  ValleyFoods.register('save_valley_asset_technical', withRefBust_(saveValleyAssetTechnical_, ['asset_technicals']));
  ValleyFoods.register('get_valley_work_center_assets', getValleyWorkCenterAssets_);
  ValleyFoods.register('save_valley_work_center_asset', saveValleyWorkCenterAsset_);

  function prefetchRefs_(data, user, dbId) {
    /* Phase 7.2 — this used to warm five kinds as RAW record arrays under the
     * very keys the shaped readers use, on an idle timer, from pages across the
     * app. After it ran, the products page's category dropdown, the asset-code
     * dropdown (which silently lost its 114100-115100 filter), the box map
     * (byKey -> undefined) and every party name all read the wrong shape.
     *
     * It now warms only through the two named accessors that exist, in the shape
     * their reader consumes. The three it can no longer warm correctly are
     * dropped rather than guessed: warming a shape nothing consumes is a full
     * sheet read for nothing. */
    try { valleyPurchasingSupplierOptions_(dbId); } catch(e){}
    try { valleyPurchasingProductOptions_(dbId); } catch(e){}
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
    getAttendanceEmployees_: getAttendanceEmployees_,
    addManualAttendance_: addManualAttendance_,
    commitAttendanceImport_: commitAttendanceImport_,
    getAttendanceReport_: getAttendanceReport_,
    getAttendanceIndex_: getAttendanceIndex_,
    getAttendanceReview_: getAttendanceReview_,
    resolveAttendanceReview_: resolveAttendanceReview_,
    getAttendanceExceptions_: getAttendanceExceptions_,
    getAttendanceBatches_: getAttendanceBatches_,
    revertAttendanceImport_: revertAttendanceImport_,
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

