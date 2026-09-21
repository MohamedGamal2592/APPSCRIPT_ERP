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

  /* ── Fast-save opt-ins ────────────────────────────────────────────────────
   * The generic engine (Core_FastSave.js) does nothing until its master switch
   * FAST_SAVE_CORE_ is true. These four say WHICH module may use it. They live
   * here, not in the engine, because they name modules and the engine is
   * business-agnostic by contract.
   *
   * A module switches only when its own flag AND the master flag are true
   * (fastSaveOnFor_). All five are false as shipped, so deploying this file
   * changes no behaviour at all. Turn them on one at a time, and turn one off
   * to roll that module back instantly — there is no data migration and no
   * schema change, so the legacy path is always still intact underneath. */
  const MFG_BATCH_WRITES_ = false;
  const SALES_BATCH_WRITES_ = false;
  const RETURNS_BATCH_WRITES_ = false;
  const PURCHASE_BATCH_WRITES_ = false;

  /* add_upload_file is shared by these HR tables. Keep this authorization
     routing inside the dispatcher scope; the upload implementation and its
     folder metadata live in ValleyFoodsHRModules, a separate IIFE. */
  const UPLOAD_PAGE_BY_SHEET = {
    'valley_emp_deductions': 'vf_hr_deductions',
    'valley_emp_overtime': 'vf_hr_overtime',
    'valley_employee_vacations': 'vf_hr_vacations'
  };

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
    'update_deduction': { page: 'vf_hr_deductions', access: 'write' },

    // العقود
    'get_contracts_data': { page: 'vf_hr_contracts', access: 'read' },
    'add_contract': { page: 'vf_hr_contracts', access: 'write' },
    'update_contract': { page: 'vf_hr_contracts', access: 'write' },

    // تخصيص الإجازات
    'get_vacation_alloc_data': { page: 'vf_hr_vacation_alloc', access: 'read' },
    'add_vacation_alloc': { page: 'vf_hr_vacation_alloc', access: 'write' },

    // الإجازات
    'get_vacations_data': { page: 'vf_hr_vacations', access: 'read' },
    'add_vacation': { page: 'vf_hr_vacations', access: 'write' },
    'update_vacation': { page: 'vf_hr_vacations', access: 'write' },
    'delete_vacation': { page: 'vf_hr_vacations', access: 'full' },

    // العمل الإضافي
    'get_overtime_data': { page: 'vf_hr_overtime', access: 'read' },
    'add_overtime': { page: 'vf_hr_overtime', access: 'write' },
    'update_overtime': { page: 'vf_hr_overtime', access: 'write' },

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
    'save_valley_mfg_agreement': { page: 'vf_parties', access: 'write' },
    'cancel_valley_mfg_agreement': { page: 'vf_parties', access: 'write' },

    // المالية — حركة النقدية والبنوك
    'get_valley_cash': { page: 'vf_cash', access: 'read' },
    /* the expenses report reads the SAME page's data, so it rides the existing
       vf_cash grant rather than needing one of its own (same for incomes) */
    'get_valley_cash_expense_report': { page: 'vf_cash', access: 'read' },
    'get_valley_cash_income_report': { page: 'vf_cash', access: 'read' },
    'get_valley_cash_box_balance_report': { page: 'vf_cash', access: 'read' },
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
    /* Admin-only uncertain-receipt reconciliation (dry-run by default). Full
       access on the purchasing page; the handler re-checks super-admin. */
    'reconcile_valley_purchasing_receipts': { page: 'vf_purchasing', access: 'full' },

    // المالية — المبيعات
    'get_valley_sales_bootstrap': { page: 'vf_sales', access: 'read' },
    'get_valley_sales_page': { page: 'vf_sales', access: 'read' },
    'get_valley_product_batches': { page: 'vf_sales', access: 'read' },
    'get_valley_sales_report': { page: 'vf_sales', access: 'read' },

    // القوائم المالية — صفحة مستقلة وصلاحياتها منفصلة عن التشغيل
    'get_valley_income_statement': { page: 'vf_income_statement', access: 'read' },

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
    'get_valley_mfg_request_diagnosis': { page: 'vf_mfg_orders', access: 'read' },
    'get_valley_mfg_client_report': { page: 'vf_mfg_orders', access: 'read' },
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
    'update_deduction': 'valley_emp_deductions',
    'get_contracts_data': 'valley_employee_contracts', 'add_contract': 'valley_employee_contracts',
    'update_contract': 'valley_employee_contracts',
    'get_vacation_alloc_data': 'valley_employee_vacation_allocation', 'add_vacation_alloc': 'valley_employee_vacation_allocation',
    'get_vacations_data': 'valley_employee_vacations', 'add_vacation': 'valley_employee_vacations',
    'update_vacation': 'valley_employee_vacations',
    'get_overtime_data': 'valley_emp_overtime', 'add_overtime': 'valley_emp_overtime',
    'update_overtime': 'valley_emp_overtime',
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
    'save_valley_mfg_agreement': 'valley_manufacturing_agreements',
    'cancel_valley_mfg_agreement': 'valley_manufacturing_agreements',

    'get_valley_cash': 'valley_cash_bank_movement',
    'get_valley_cash_expense_report': 'valley_cash_bank_movement',
    'get_valley_cash_income_report': 'valley_cash_bank_movement',
    'get_valley_cash_box_balance_report': 'valley_cash_bank_movement',
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
    'get_valley_mfg_client_report': 'valley_manufacture_header',
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
    'get_valley_income_statement': 'valley_chart_of_accounts',

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

  // Phase 3: FAIL-CLOSED. An action not listed in PAGE_ACCESS is denied, not
  // allowed. Super-admin bypass preserved. get_page_versions is the sole
  // exception: it gates itself on the page asked about (see getPageVersions_).
  /* Access denials are deterministic pre-mutation refusals: nothing has been
     written, so they are marked notApplied and the request-guard ledger
     records a confirmed failure instead of an uncertain outcome. */
  function denyNotApplied_(message) {
    var e = new Error(message);
    e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED';
    throw e;
  }
  function guard_(user, action, data) {
    if (user && user.isSuperAdmin) return;
    if (action === 'get_page_versions') return;
    /* Uploads are shared by several HR pages, so their permission cannot be
       represented by one static PAGE_ACCESS entry. Resolve the owning page
       from this dispatcher's own server-controlled sheet allowlist. */
    if (action === 'add_upload_file') {
      const uploadSheet = String((data && data.sheet) || '').trim();
      const uploadPage = UPLOAD_PAGE_BY_SHEET[uploadSheet];
      if (!uploadPage || !unifiedCheck_(user, COMPANY_UID, uploadPage, 'write')) {
        denyNotApplied_(ERP_MESSAGES.NOT_AUTHORIZED);
      }
      return;
    }
    const req = PAGE_ACCESS[action];
    if (!req) denyNotApplied_(ERP_MESSAGES.NOT_AUTHORIZED);
    if (!unifiedCheck_(user, COMPANY_UID, req.page, req.access)) {
      denyNotApplied_(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  // Phase 3: tenant double-check (matches ValleyFoodsFinancialReporting.authorize_
  // pattern): dbId must be this company's own spreadsheet before any sheet read.
  function authorize_(user, dbId) {
    if (!user || (!user.isSuperAdmin && user.company !== COMPANY_UID) || !dbId || String(dbId) !== String(getCompanySpreadsheetId_(COMPANY_UID))) denyNotApplied_(ERP_MESSAGES.NOT_AUTHORIZED);
  }

  function dispatch_(payload, user, dbId, guardCtx) {
    const action = payload.module_action;
    if (!actions[action]) denyNotApplied_('Unknown Valley Foods action: ' + action);
    guard_(user, action, payload.data);
    authorize_(user, dbId);
    /* Phase 2: defensive gate so direct dispatch also validates. Status-only
     * paths skip field validation inside validateBeforeWrite; handlers still
     * enforce status via canTransition/assertTransition_. */
    if (typeof validateBeforeWrite === 'function' && typeof docTypeForAction_ === 'function') {
      var __dt = docTypeForAction_(action);
      if (__dt) validateBeforeWrite(__dt, payload, dbId);
    }
    return actions[action](payload.data, user, dbId, guardCtx || {});
  }

  // ---- generic helpers (mirror Top Light / Top Chemical) ----
  /* Phase 5 compat: delegates to shared sharedNum0_ (Code.js). */
  function num0_(v) { return (typeof sharedNum0_ === 'function') ? sharedNum0_(v) : Math.max(0, Number(v) || 0); }

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

  /* Actions whose business records can reconcile a lost response without
   * replaying a destructive mutation. */
  function requestRecovery_(action) {
    return action === 'add_upload_file' ||
      action === 'save_valley_purchasing_costing' ||
      action === 'save_valley_purchasing_header_checkpoint' ||
      action === 'save_valley_purchasing_lines_checkpoint' ||
      action === 'save_valley_mfg_order' ? 'request-id' : '';
  }
  return { dispatch_: dispatch_, pageForAction_: pageForAction_, tableForAction_: tableForAction_, requestRecovery_: requestRecovery_, register: register };
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

  /* writeFormula_ lives at GLOBAL scope in Code.js (shared by all IIFE namespaces). */

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
    const limit = Number(data && data.limit) || 20;
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
    const limit = Number(data && data.limit) || 20;
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
    const limit = Number(data && data.limit) || 20;
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
    /* Master-data page: employees, status history and assignments are all
       small reference sets, and the page renders them with no truncation
       notice — so the aggregate always loads the full sets. (The standalone
       Shift page keeps its own 20-row window + عرض الكل toggle.) */
    const er = getEmployeesData_({ loadAll: true }, user, dbId);
    const sr = getEmpStatusData_({ loadAll: true }, user, dbId);
    const shr = getShiftAssignmentData_({ loadAll: true }, user, dbId);
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








/* CONSOLIDATED VALLEYFOODS HR MODULES — retained as an independent IIFE. */
/**
 * Valley Foods HR domain module (consolidated here).
 * RESPONSIBILITY: Valley Foods HR domain modules, including attendance,
 * deductions, contracts, vacations, overtime and salary workflows.
 * The original ValleyFoodsHRModules IIFE and its registration bridge are moved
 * intact; global helpers and action names remain unchanged.
 */
const ValleyFoodsHRModules = (function () {
  const COMPANY_UID                 = '9940659bd83035d7';
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

  /* transaction_date is a DATE column, not a datetime: truncate any time part
   * to local midnight so insert/edit never store (or shift by) a time. */
  function dateOnly_(v) {
    var d = parseDate_(v);
    if (!d) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
          var moneyFlag = String(r.money_related == null ? '' : r.money_related).trim().toLowerCase();
          var vacationFlag = String(r.vacation_days == null ? '' : r.vacation_days).trim().toLowerCase();
          return {
            value: r.overtime_rule_unique_id,
            label: r.overtime_type,
            rate: Number(r.overtime_rate) || 1,
            moneyRelated: r.money_related === true || r.money_related === 1 || moneyFlag === 'true' || moneyFlag === '1',
            vacationDays: r.vacation_days === true || r.vacation_days === 1 || vacationFlag === 'true' || vacationFlag === '1'
          };
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
    ensureSheet_(dbId, EMP_DEDUCTIONS_SHEET, ['unique_id','emp_id','name_ar','deduction_type','date','number_of_days','penalty_value','penalty_type_days','abscence_type_days','delay_type_minutes','details','deduction_attachement','deduction_attachement_id','month','year','user','created_at']);
    var roles = getDeductionRoles_(dbId);
    var roleMap = {};
    roles.forEach(function (r) { roleMap[r.value] = r; });
    var _allRows = getAllRecords_(dbId, EMP_DEDUCTIONS_SHEET);
    var limit = Number(data && data.limit) || 20;
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
        deduction_attachement: r.deduction_attachement, deduction_attachement_id: r.deduction_attachement_id || '',
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
      var attachmentId = '';
      try { attachmentId = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'deduction_attachement') || '').trim() : ''; } catch (e) {}
      if (!attachmentId && attachment) {
        try { attachmentId = String(CacheService.getScriptCache().get('attid_' + attachment) || '').trim(); } catch (e) {}
      }
      attachmentId = requireAttachmentBinding_(attachment, attachmentId, 'deduction_attachement');
      try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, EMP_DEDUCTIONS_SHEET, 'deduction_attachement_id'); } catch (e) {}

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
      row['deduction_attachement_id'] = attachmentId;
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
        details: details, deduction_attachement: attachment, deduction_attachement_id: attachmentId,
        month: date ? (date.getMonth()+1) : '', year: date ? date.getFullYear() : '',
        user: (user && user.email) || '', created_at: new Date()
      };
    result = { status: 'success', message: 'تم تسجيل الخصم', data: { unique_id: row['unique_id'] }, record: savedRecord };
    }); /* executeWithLock_ */
    return result;
  }

  /* Row-edit repair (Stage 4): keyed deduction correction. Same manual-field
   * validation as addDeduction_ (including its exact column mapping, so Add
   * and Edit store identical shapes); only manual inputs are written through
   * the formula-safe patch helper, preserving calculated cells (name_ar,
   * penalty_type_days, abscence_type_days, delay_type_minutes, month, year)
   * and system fields (unique_id, user, created_at). The existing attachment
   * pair is retained unless a different reference arrives through the trusted
   * upload flow. */
  function updateDeduction_(data, user, dbId) {
    requireSuperAdmin_(user);
    var result;
    executeWithLock_(function () {
    var uid = String((data || {}).unique_id || '').trim();
    if (!uid) throw new Error('معرف السجل مطلوب');
    var empId = Number(data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var dedType = String(data.deduction_type || '').trim();
    if (!dedType) throw new Error('نوع الخصم مطلوب');
    var date = parseDate_(data.date);
    if (!date) throw new Error('التاريخ مطلوب');
    var days = Number(data.number_of_days) || 0;
    var otherVal = Number(data.deduction_value_other) || 0;
    var details = String(data.details || '').trim();

    var sheet = getSheet_(EMP_DEDUCTIONS_SHEET, dbId);
    var allRows = getAllRecords_(dbId, EMP_DEDUCTIONS_SHEET);
    var oldRow = null;
    for (var k = 0; k < allRows.length; k++) {
      if (String(allRows[k].unique_id) === uid) { oldRow = allRows[k]; break; }
    }
    if (!oldRow) throw new Error('السجل غير موجود');

    var storedRef = String(oldRow.deduction_attachement || '').trim();
    var storedId = String(oldRow.deduction_attachement_id || '').trim();
    var newRef = String(data.deduction_attachement || '').trim();
    var attachmentId;
    if (!newRef) {
      newRef = storedRef;
      attachmentId = storedId;
    } else if (storedRef && newRef === storedRef && storedId) {
      attachmentId = storedId;
    } else {
      attachmentId = '';
      try { attachmentId = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'deduction_attachement') || '').trim() : ''; } catch (e) {}
      if (!attachmentId && newRef) {
        try { attachmentId = String(CacheService.getScriptCache().get('attid_' + newRef) || '').trim(); } catch (e2) {}
      }
      attachmentId = requireAttachmentBinding_(newRef, attachmentId, 'deduction_attachement');
    }
    try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, EMP_DEDUCTIONS_SHEET, 'deduction_attachement_id'); } catch (e3) {}

    var map = {};
    map['emp_id'] = empId;
    map['deduction_type'] = dedType;
    map['date'] = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    map['number_of_days'] = days;
    map['penalty_value'] = otherVal;
    map['details'] = details;
    map['deduction_attachement'] = newRef;
    map['deduction_attachement_id'] = attachmentId;
    if (!patchRowByCriteria_(sheet, 'unique_id', uid, map)) throw new Error('السجل غير موجود');

    var _roleMapD = {};
    try { getDeductionRoles_(dbId).forEach(function (rr) { _roleMapD[rr.value] = rr; }); } catch (e4) {}
    var _roleD = _roleMapD[dedType] || {};
    var _empNameD = '';
    try { var _allEmpsD = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _ed = 0; _ed < _allEmpsD.length; _ed++) { if (String(_allEmpsD[_ed].emp_id) === String(empId)) { _empNameD = _allEmpsD[_ed].name_ar || ''; break; } } } catch (e5) {}
    var savedRecordD = {
      unique_id: uid, emp_id: empId, name_ar: _empNameD || String(empId),
      deduction_type: dedType, deduction_name: _roleD.label || dedType, deduction_category: _roleD.category || '',
      date: map['date'], number_of_days: days, penalty_value: otherVal,
      penalty_type_days: oldRow.penalty_type_days, abscence_type_days: oldRow.abscence_type_days,
      delay_type_minutes: oldRow.delay_type_minutes,
      details: details, deduction_attachement: newRef, deduction_attachement_id: attachmentId,
      month: date ? (date.getMonth() + 1) : '', year: date ? date.getFullYear() : '',
      user: oldRow.user, created_at: oldRow.created_at
    };
    try { logHistory_(dbId, EMP_DEDUCTIONS_SHEET, oldRow.record_uid || ('update_' + EMP_DEDUCTIONS_SHEET + '_' + uid), uid, (user && user.email) || '', 'update', savedRecordD, oldRow); } catch (e6) {}
    result = { status: 'success', message: 'تم تحديث الخصم', data: { unique_id: uid }, record: savedRecordD };
    }); /* executeWithLock_ */
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

  /* Row-edit repair (Stage 4.6): keyed contract correction, completing the
   * dormant update contract. Same manual-field validation as addContract_;
   * only manual inputs are written through the formula-safe patch helper, so
   * the calculated employee_name and system fields (unique_id, id, user,
   * created_at) are preserved. */
  function updateContract_(data, user, dbId) {
    requireSuperAdmin_(user);
    var result;
    executeWithLock_(function () {
    var uid = String((data || {}).unique_id || '').trim();
    if (!uid) throw new Error('معرف السجل مطلوب');
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
    var allRows = getAllRecords_(dbId, EMP_CONTRACTS_SHEET);
    var oldRow = null;
    for (var k = 0; k < allRows.length; k++) {
      if (String(allRows[k].unique_id) === uid) { oldRow = allRows[k]; break; }
    }
    if (!oldRow) throw new Error('السجل غير موجود');

    var map = {};
    map['emp_id'] = empId;
    map['contract_Type'] = contractType;
    map['contract_start_Date'] = startDate;
    map['contract_end_Date'] = endDate || '';
    map['contract_salary'] = salary;
    map['contract_insurance_salary'] = insSalary;
    if (!patchRowByCriteria_(sheet, 'unique_id', uid, map)) throw new Error('السجل غير موجود');

    var _ctMapU = {};
    try { var _idxRowsU = getAllRecords_(dbId, CONTRACTS_INDEX_SHEET); _idxRowsU.forEach(function (rr) { _ctMapU[String(rr.id)] = (rr.contract_name_ar || '') + (rr.contract_name_en ? ' — ' + rr.contract_name_en : ''); }); } catch (e) {}
    var _empNameU = '';
    try { var _allEmpsU = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _eu = 0; _eu < _allEmpsU.length; _eu++) { if (String(_allEmpsU[_eu].emp_id) === String(empId)) { _empNameU = _allEmpsU[_eu].name_ar || ''; break; } } } catch (e2) {}
    var savedRecordU = {
      unique_id: uid, id: oldRow.id, emp_id: empId, employee_name: _empNameU || String(empId),
      contract_Type: contractType, contract_type_label: _ctMapU[String(contractType)] || contractType,
      contract_start_Date: startDate, contract_end_Date: endDate || '',
      contract_salary: salary, contract_insurance_salary: insSalary,
      user: oldRow.user, created_at: oldRow.created_at
    };
    try { logHistory_(dbId, EMP_CONTRACTS_SHEET, oldRow.record_uid || ('update_' + EMP_CONTRACTS_SHEET + '_' + uid), uid, (user && user.email) || '', 'update', savedRecordU, oldRow); } catch (e3) {}
    result = { status: 'success', message: 'تم تحديث العقد', data: { unique_id: uid }, record: savedRecordU };
    }); /* executeWithLock_ */
    return result;
  }

  // ===================== VACATION ALLOCATION =====================
  function getVacationAllocData_(data, user, dbId) {
    ensureSheet_(dbId, VACATION_ALLOC_SHEET, ['unique_id','id','emp_id','employee_name','vacation_type','vacation_alloc_start_Date','vacation_alloc_end_Date','number_of_days','used_days','user','created_at']);
    var _allVacAlloc = getAllRecords_(dbId, VACATION_ALLOC_SHEET);
    var limit = Number(data && data.limit) || 20;
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
    ensureSheet_(dbId, VACATIONS_SHEET, ['unique_id','id','emp_id','vacation_half_day','vacation_type','allocation_id','start_date','end_date','duration_days','duration_days_other','amount_other','vacation_reason','attachment','attachment_id','user','created_at']);

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

    // Allocation options map (keyed by emp_id) + flat unique_id -> label map
    // for the vacations table column. Label order: employee - vacation type -
    // alloc start - alloc end - number_of_days - remaining - used_days.
    var allocs = getAllRecords_(dbId, VACATION_ALLOC_SHEET);
    var allocOptionsMap = {};
    var allocLabelMap = {};
    allocs.forEach(function (a) {
      var aUid = String(a.unique_id == null ? '' : a.unique_id).trim();
      var vacName = vacTypeNameMap[String(a.vacation_type)] || a.vacation_type || '';
      var empName = a.employee_name || '';
      var startD = a.vacation_alloc_start_Date ? fmtDate_(a.vacation_alloc_start_Date) : '';
      var endD = a.vacation_alloc_end_Date ? fmtDate_(a.vacation_alloc_end_Date) : '';
      var numDays = Number(a.number_of_days) || 0;
      var usedD = Number(a.used_days) || 0;
      var remaining = numDays - usedD;
      var label = empName + ' - ' + vacName + ' - ' + startD + ' - ' + endD + ' - ' + numDays + ' - ' + remaining + ' - ' + usedD;
      if (aUid) allocLabelMap[aUid] = label;
      var eid = String(a.emp_id);
      if (!activeEmpIds[eid]) return;
      if (remaining <= 0) return;
      if (!allocOptionsMap[eid]) allocOptionsMap[eid] = [];
      allocOptionsMap[eid].push({ value: a.unique_id, label: label, remaining: remaining, vacation_type: a.vacation_type, require_allocation: requireAllocMap[String(a.vacation_type)] || false });
    });

    var _allVac = getAllRecords_(dbId, VACATIONS_SHEET);
    var limit = Number(data && data.limit) || 20;
    var rows = _allVac.slice().reverse();

    // Enrich rows with vacation_type name
    rows = rows.map(function (r) {
      r.vacation_type_name = vacTypeNameMap[String(r.vacation_type)] || r.vacation_type || '';
      return r;
    });
    var total = _allVac.length;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', rows: rows, total: total, employee_options: activeEmpOpts, allocation_options_map: allocOptionsMap, allocation_label_map: allocLabelMap, vacation_index_options: vacationIndexOptions };
  }

  function fmtDate_(v) {
    if (!v) return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* As-stored wall-date contract (READ path only — never alters sheet values).
   * Sheet date-only cells arrive via getValues() as Date at midnight script-TZ;
   * serializing that Date as UTC ISO shifts it a day back for +02/+03 zones.
   * These helpers collapse Date / serial / text into wall strings using the
   * script timezone, so the browser can display them opaquely. */
  function vfDateStr_(v) {
    if (v === '' || v === null || v === undefined) return '';
    try {
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    } catch (e) { /* fall through to string handling */ }
    if (typeof v === 'number' && isFinite(v)) {
      try {
        var dSer = serialToDate_(v);
        return Utilities.formatDate(dSer, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } catch (e2) { return String(v); }
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      var mm = ('0' + m[2]).slice(-2), dd = ('0' + m[3]).slice(-2);
      return m[1] + '-' + mm + '-' + dd;
    }
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      var dd2 = ('0' + m[1]).slice(-2), mm2 = ('0' + m[2]).slice(-2);
      return m[3] + '-' + mm2 + '-' + dd2;
    }
    return s;
  }

  function vfDateTimeStr_(v) {
    if (v === '' || v === null || v === undefined) return '';
    try {
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      }
    } catch (e) { /* fall through */ }
    if (typeof v === 'number' && isFinite(v)) {
      try {
        return Utilities.formatDate(serialToDate_(v), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      } catch (e2) { return String(v); }
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
    if (m) {
      var mm = ('0' + m[2]).slice(-2), dd = ('0' + m[3]).slice(-2);
      var hh = ('0' + m[4]).slice(-2);
      return m[1] + '-' + mm + '-' + dd + ' ' + hh + ':' + m[5];
    }
    return s;
  }

  function vfTimeStr_(v) {
    if (v === '' || v === null || v === undefined) return '';
    try {
      if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
        return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
      }
    } catch (e) { /* fall through */ }
    if (typeof v === 'number' && isFinite(v)) {
      try {
        return Utilities.formatDate(serialToDate_(v), Session.getScriptTimeZone(), 'HH:mm');
      } catch (e2) { return String(v); }
    }
    var s = String(v).trim();
    var m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return ('0' + m[1]).slice(-2) + ':' + m[2];
    return s;
  }

  /* Allocation balance: number_of_days and consumed = SUM(duration_days of
   * vacations pointing at this allocation). Call only inside executeWithLock_.
   * Throws when the allocation does not exist. */
  function allocBalance_(dbId, allocId) {
    var allocRows = getAllRecords_(dbId, VACATION_ALLOC_SHEET);
    var alloc = null;
    for (var i = 0; i < allocRows.length; i++) {
      if (String(allocRows[i].unique_id == null ? '' : allocRows[i].unique_id).trim() === allocId) { alloc = allocRows[i]; break; }
    }
    if (!alloc) throw new Error('التخصيص المحدد غير موجود في سجل التخصيصات');
    var vacRows = getAllRecords_(dbId, VACATIONS_SHEET);
    var consumed = 0;
    for (var j = 0; j < vacRows.length; j++) {
      if (String(vacRows[j].allocation_id == null ? '' : vacRows[j].allocation_id).trim() === allocId) {
        consumed += Number(vacRows[j].duration_days) || 0;
      }
    }
    return { numberOfDays: Number(alloc.number_of_days) || 0, consumed: consumed };
  }

  function writeAllocUsedDays_(dbId, allocId, value) {
    var allocSheet = getSheet_(VACATION_ALLOC_SHEET, dbId);
    var allocHeaders = getHeaders_(allocSheet);
    var uidIdx = allocHeaders.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
    var usedIdx = allocHeaders.findIndex(function (h) { return String(h).trim() === 'used_days'; });
    if (uidIdx === -1 || usedIdx === -1) return;
    var allData = allocSheet.getDataRange().getValues();
    for (var i = 1; i < allData.length; i++) {
      if (String(allData[i][uidIdx]).trim() === allocId) {
        allocSheet.getRange(i + 1, usedIdx + 1).setValue(value);
        noteMutation_(allocSheet);
        break;
      }
    }
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

    // Allocation cap (hard block): the requested duration must fit inside
    // the remaining balance of the chosen allocation.
    if (isRequireAlloc && allocId) {
      var __cap = allocBalance_(dbId, allocId);
      var __remaining = __cap.numberOfDays - __cap.consumed;
      if (duration > __remaining) {
        throw new Error('لا يمكن حفظ الإجازة: المدة المطلوبة (' + duration + ' يوم) تتجاوز الرصيد المتبقي (' + __remaining + ' يوم) من إجمالي التخصيص (' + __cap.numberOfDays + ' يوم)');
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
    var attachmentIdVac = '';
    try { attachmentIdVac = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'attachment') || '').trim() : ''; } catch (e) {}
    if (!attachmentIdVac && row['attachment']) {
      try { attachmentIdVac = String(CacheService.getScriptCache().get('attid_' + row['attachment']) || '').trim(); } catch (e) {}
    }
    row['attachment_id'] = attachmentIdVac;
    attachmentIdVac = requireAttachmentBinding_(row['attachment'], attachmentIdVac, 'attachment');
    try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, VACATIONS_SHEET, 'attachment_id'); } catch (e) {}
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
      vacation_reason: String(data.vacation_reason || '').trim(), attachment: String(data.attachment || '').trim(), attachment_id: attachmentIdVac,
      user: (user && user.email) || '', created_at: new Date()
    };
    try{ logHistory_(dbId, VACATIONS_SHEET, row.record_uid || ('create_'+VACATIONS_SHEET+'_'+row['unique_id']), row['unique_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
    result = { status: 'success', message: 'تم تسجيل الإجازة', data: { unique_id: row['unique_id'] }, record: savedRecordVac };

    // Rollup: recompute consumed days for this allocation as
    // SUM(duration_days) so used_days/remaining always reflect reality
    // (self-heals any past drift; the new row is already appended above).
    if (allocId) {
      try {
        var __newBal = allocBalance_(dbId, allocId);
        writeAllocUsedDays_(dbId, allocId, __newBal.consumed);
      } catch (e) { /* log but don't fail */ }
    }

    }); /* executeWithLock_ */
    return result;
  }

  /* Row-edit repair (Stage 4): keyed vacation correction. Same manual-field
   * validation and server-side duration computation as addVacation_; the
   * overlap check excludes the edited row, the allocation cap counts the old
   * row's returned days, and consumption rollups are recomputed for both the
   * old and the new allocation. Only manual inputs are written through the
   * formula-safe patch helper; id/user/created_at and the existing attachment
   * pair are preserved unless a replacement arrives via the trusted flow. */
  function updateVacation_(data, user, dbId) {
    requireSuperAdmin_(user);
    var result;
    executeWithLock_(function () {
    var uid = String((data || {}).unique_id || '').trim();
    if (!uid) throw new Error('المعرف مطلوب');
    var empId = Number(data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var vacType = String(data.vacation_type || '').trim();
    if (!vacType) throw new Error('نوع الإجازة مطلوب');
    var startDate = parseDate_(data.start_date);
    if (!startDate) throw new Error('تاريخ البداية مطلوب');
    var endDate = parseDate_(data.end_date);
    if (!endDate) throw new Error('تاريخ النهاية مطلوب');
    startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    endDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    if (endDate < startDate) throw new Error('تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية');
    var halfDay = data.vacation_half_day === true || data.vacation_half_day === 'true';

    var sheet = getSheet_(VACATIONS_SHEET, dbId);
    var allRows = getAllRecords_(dbId, VACATIONS_SHEET);
    var oldRow = null;
    for (var k = 0; k < allRows.length; k++) {
      if (String(allRows[k].unique_id) === uid) { oldRow = allRows[k]; break; }
    }
    if (!oldRow) throw new Error('الإجازة غير موجودة');
    var oldAllocId = String(oldRow.allocation_id == null ? '' : oldRow.allocation_id).trim();
    var oldDuration = Number(oldRow.duration_days) || 0;

    var vacIndexRows = [];
    try { vacIndexRows = getAllRecords_(dbId, VACATIONS_INDEX_SHEET); } catch (e) {}
    var isRequireAlloc = false;
    for (var vi = 0; vi < vacIndexRows.length; vi++) {
      if (String(vacIndexRows[vi].id) === String(vacType)) {
        isRequireAlloc = vacIndexRows[vi].require_allocation === true || String(vacIndexRows[vi].require_allocation).toLowerCase() === 'true';
        break;
      }
    }
    var allocId = String(data.allocation_id || '').trim();
    if (isRequireAlloc && !allocId) throw new Error('تخصيص الإجازة مطلوب لهذا النوع');

    var duration = 0;
    if (halfDay) {
      duration = 0.5;
    } else if (vacType) {
      var totalDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (totalDays < 0) totalDays = 0;
      duration = totalDays;
    }

    for (var vi2 = 0; vi2 < allRows.length; vi2++) {
      var ev = allRows[vi2];
      if (String(ev.unique_id) === uid) continue;
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

    /* Cap check: the edited row's old days return to its allocation first, so
       keeping the same allocation and duration always passes. */
    if (isRequireAlloc && allocId) {
      var __cap = allocBalance_(dbId, allocId);
      var __remaining = (__cap.numberOfDays - __cap.consumed) + (allocId === oldAllocId ? oldDuration : 0);
      if (duration > __remaining) {
        throw new Error('لا يمكن حفظ الإجازة: المدة المطلوبة (' + duration + ' يوم) تتجاوز الرصيد المتبقي (' + __remaining + ' يوم) من إجمالي التخصيص (' + __cap.numberOfDays + ' يوم)');
      }
    }

    var storedRef = String(oldRow.attachment || '').trim();
    var storedId = String(oldRow.attachment_id || '').trim();
    var newRef = String(data.attachment || '').trim();
    var attachmentIdVac;
    if (!newRef) {
      newRef = storedRef;
      attachmentIdVac = storedId;
    } else if (storedRef && newRef === storedRef && storedId) {
      attachmentIdVac = storedId;
    } else {
      attachmentIdVac = '';
      try { attachmentIdVac = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'attachment') || '').trim() : ''; } catch (e2) {}
      if (!attachmentIdVac && newRef) {
        try { attachmentIdVac = String(CacheService.getScriptCache().get('attid_' + newRef) || '').trim(); } catch (e3) {}
      }
      attachmentIdVac = requireAttachmentBinding_(newRef, attachmentIdVac, 'attachment');
    }
    try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, VACATIONS_SHEET, 'attachment_id'); } catch (e4) {}

    var map = {};
    map['emp_id'] = empId;
    map['vacation_half_day'] = halfDay;
    map['vacation_type'] = vacType;
    map['allocation_id'] = allocId;
    map['start_date'] = startDate;
    map['end_date'] = endDate;
    map['duration_days'] = duration;
    map['duration_days_other'] = Number(data.duration_days_other) || 0;
    map['amount_other'] = Number(data.amount_other) || 0;
    map['vacation_reason'] = String(data.vacation_reason || '').trim();
    map['attachment'] = newRef;
    map['attachment_id'] = attachmentIdVac;
    if (!patchRowByCriteria_(sheet, 'unique_id', uid, map)) throw new Error('الإجازة غير موجودة');

    /* Reconcile consumption on both sides of an allocation change; same-side
       edits recompute once. Failures only affect the rollup, never the edit. */
    var __allocs = allocId ? [allocId] : [];
    if (oldAllocId && oldAllocId !== allocId) __allocs.push(oldAllocId);
    __allocs.forEach(function (aid) {
      try {
        var __bal = allocBalance_(dbId, aid);
        writeAllocUsedDays_(dbId, aid, __bal.consumed);
      } catch (e5) { /* log but don't fail */ }
    });

    var _vacNameMapU = {};
    try { vacIndexRows.forEach(function (rr) { _vacNameMapU[String(rr.id)] = rr.vacation_name_ar || String(rr.id); }); } catch (e6) {}
    var savedRecordU = {
      unique_id: uid, id: oldRow.id, emp_id: empId,
      vacation_half_day: halfDay, vacation_type: vacType, vacation_type_name: _vacNameMapU[String(vacType)] || vacType,
      allocation_id: allocId, start_date: startDate, end_date: endDate,
      duration_days: duration, duration_days_other: Number(data.duration_days_other) || 0, amount_other: Number(data.amount_other) || 0,
      vacation_reason: String(data.vacation_reason || '').trim(), attachment: newRef, attachment_id: attachmentIdVac,
      user: oldRow.user, created_at: oldRow.created_at
    };
    try { logHistory_(dbId, VACATIONS_SHEET, oldRow.record_uid || ('update_' + VACATIONS_SHEET + '_' + uid), uid, (user && user.email) || '', 'update', savedRecordU, oldRow); } catch (e7) {}
    result = { status: 'success', message: 'تم تحديث الإجازة', data: { unique_id: uid }, record: savedRecordU };
    }); /* executeWithLock_ */
    return result;
  }

  /* Super-admin only: delete a vacation and return its days to the
   * allocation pool by recomputing SUM(duration_days). */
  function deleteVacation_(data, user, dbId) {
    requireSuperAdmin_(user);
    var result;
    executeWithLock_(function () {
      var uid = String((data || {}).unique_id || '').trim();
      if (!uid) throw new Error('المعرف مطلوب');
      var oldRow = getAllRecords_(dbId, VACATIONS_SHEET).find(function (r) { return String(r.unique_id) === uid; }) || null;
      if (!oldRow) throw new Error('الإجازة غير موجودة');
      var allocId = String(oldRow.allocation_id == null ? '' : oldRow.allocation_id).trim();
      var oldUid = oldRow.record_uid || ('del_' + VACATIONS_SHEET + '_' + uid);
      try { logHistory_(dbId, VACATIONS_SHEET, oldUid, uid, (user && user.email) || '', 'delete', null, oldRow); } catch (e) {}
      var deleted = deleteRowsByCriteria_(getSheet_(VACATIONS_SHEET, dbId), 'unique_id', uid);
      if (!deleted) throw new Error('الإجازة غير موجودة');
      if (allocId) {
        try {
          var __bal = allocBalance_(dbId, allocId);
          writeAllocUsedDays_(dbId, allocId, __bal.consumed);
        } catch (e) { /* log but don't fail */ }
      }
      result = { status: 'success', message: 'تم حذف الإجازة وإرجاع الرصيد إلى التخصيص' };
    }); /* executeWithLock_ */
    return result;
  }

  // ===================== OVERTIME =====================
  function getOvertimeData_(data, user, dbId) {
    ensureSheet_(dbId, EMP_OVERTIME_SHEET, ['unique_id','emp_id','name_ar','date','overtime_type','start_time','end_time','overtime_hours','overtime_vacation_days','details','overtime_attachement','overtime_attachement_id','amount','month','year','user','created_at']);
    var roles = getOvertimeRoles_(dbId);
    var roleMap = {};
    roles.forEach(function (r) { roleMap[r.value] = r; });
    var _allOT = getAllRecords_(dbId, EMP_OVERTIME_SHEET);
    var limit = Number(data && data.limit) || 20;
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
        overtime_attachement_id: r.overtime_attachement_id || '',
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
    var attachmentIdOT = '';
    try { attachmentIdOT = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'overtime_attachement') || '').trim() : ''; } catch (e) {}
    if (!attachmentIdOT && attachment) {
      try { attachmentIdOT = String(CacheService.getScriptCache().get('attid_' + attachment) || '').trim(); } catch (e) {}
    }
    attachmentIdOT = requireAttachmentBinding_(attachment, attachmentIdOT, 'overtime_attachement');
    try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, EMP_OVERTIME_SHEET, 'overtime_attachement_id'); } catch (e) {}

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
    row['overtime_attachement_id'] = attachmentIdOT;
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
      details: details, overtime_attachement: attachment, overtime_attachement_id: attachmentIdOT, amount: isMoneyRelated ? (Number(data.amount)||0) : 0,
      month: date ? (date.getMonth()+1) : '', year: date ? date.getFullYear() : '',
      user: (user && user.email) || '', created_at: new Date()
    };
    try{ logHistory_(dbId, EMP_OVERTIME_SHEET, row.record_uid || ('create_'+EMP_OVERTIME_SHEET+'_'+row['unique_id']), row['unique_id'], (user&&user.email)||'', 'create', row, null) }catch(e){}
    result = { status: 'success', message: 'تم تسجيل العمل الإضافي', data: { unique_id: row['unique_id'] }, record: savedRecordOT };
    }); /* executeWithLock_ */
    return result;
  }

  /* Row-edit repair (Stage 3): keyed overtime correction. Same manual-field
   * validation as addOvertime_; only manual inputs are written, through the
   * formula-safe patch helper, so calculated cells (name_ar, overtime_hours,
   * overtime_vacation_days, month, year) and system fields (unique_id, user,
   * created_at) are preserved. The existing attachment pair is retained unless
   * the caller supplies a different reference through the trusted upload flow,
   * in which case the new pair must bind before anything is written. */
  function updateOvertime_(data, user, dbId) {
    requireSuperAdmin_(user);
    var result;
    executeWithLock_(function () {
    var uid = String((data || {}).unique_id || '').trim();
    if (!uid) throw new Error('معرف السجل مطلوب');
    var empId = Number(data.emp_id);
    if (!empId) throw new Error('الموظف مطلوب');
    var otType = String(data.overtime_type || '').trim();
    if (!otType) throw new Error('نوع العمل الإضافي مطلوب');
    var date = parseDate_(data.date);
    if (!date) throw new Error('التاريخ مطلوب');
    var details = String(data.details || '').trim();
    if (!details) throw new Error('التفاصيل مطلوبة');

    var roles = getOvertimeRoles_(dbId);
    var roleInfo = null;
    for (var i = 0; i < roles.length; i++) {
      if (String(roles[i].value) === String(otType)) { roleInfo = roles[i]; break; }
    }
    var isMoneyRelated = roleInfo && roleInfo.moneyRelated;
    var amount = 0;
    var startTime = String(data.start_time || '').trim();
    var endTime = String(data.end_time || '').trim();
    if (isMoneyRelated) {
      amount = Number(data.amount) || 0;
      if (amount <= 0) throw new Error('المبلغ مطلوب لهذا النوع');
      startTime = '';
      endTime = '';
    } else {
      if (!startTime) throw new Error('وقت البداية مطلوب');
      if (!endTime) throw new Error('وقت النهاية مطلوب');
    }

    var sheet = getSheet_(EMP_OVERTIME_SHEET, dbId);
    var allRows = getAllRecords_(dbId, EMP_OVERTIME_SHEET);
    var oldRow = null;
    for (var k = 0; k < allRows.length; k++) {
      if (String(allRows[k].unique_id) === uid) { oldRow = allRows[k]; break; }
    }
    if (!oldRow) throw new Error('السجل غير موجود');

    /* Duplicate-timing check excludes the edited row itself. Times are
       compared as normalized fractions because stored cells hold Sheets time
       fractions while callers send HH:mm. */
    var newStartFrac = timeFrac_(startTime), newEndFrac = timeFrac_(endTime);
    var newDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    for (var j = 0; j < allRows.length; j++) {
      var er = allRows[j];
      if (String(er.unique_id) === uid) continue;
      if (Number(er.emp_id) !== empId) continue;
      if (String(er.overtime_type || '').trim() !== otType) continue;
      var erDate = parseDate_(er.date);
      var erDay = erDate ? new Date(erDate.getFullYear(), erDate.getMonth(), erDate.getDate()).getTime() : NaN;
      if (erDay !== newDay) continue;
      if (String(timeFrac_(er.start_time)) === String(newStartFrac) &&
          String(timeFrac_(er.end_time)) === String(newEndFrac)) {
        throw new Error('يوجد سجل عمل إضافي مطابق لهذا الموظف في نفس التوقيت');
      }
    }

    /* Attachment: preserve the stored pair unless the caller supplies a
       different reference from the trusted upload flow. */
    var storedRef = String(oldRow.overtime_attachement || '').trim();
    var storedId = String(oldRow.overtime_attachement_id || '').trim();
    var newRef = String(data.overtime_attachement || '').trim();
    var attachmentIdOT;
    if (!newRef) {
      newRef = storedRef;
      attachmentIdOT = storedId;
    } else if (storedRef && newRef === storedRef && storedId) {
      attachmentIdOT = storedId;
    } else {
      attachmentIdOT = '';
      try { attachmentIdOT = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'overtime_attachement') || '').trim() : ''; } catch (e) {}
      if (!attachmentIdOT && newRef) {
        try { attachmentIdOT = String(CacheService.getScriptCache().get('attid_' + newRef) || '').trim(); } catch (e2) {}
      }
      attachmentIdOT = requireAttachmentBinding_(newRef, attachmentIdOT, 'overtime_attachement');
    }
    if (!newRef) throw new Error('المرفق مطلوب');
    try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, EMP_OVERTIME_SHEET, 'overtime_attachement_id'); } catch (e3) {}

    var map = {};
    map['emp_id'] = empId;
    map['date'] = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    map['overtime_type'] = otType;
    map['start_time'] = isMoneyRelated ? '' : timeFrac_(startTime);
    map['end_time'] = isMoneyRelated ? '' : timeFrac_(endTime);
    map['details'] = details;
    map['overtime_attachement'] = newRef;
    map['overtime_attachement_id'] = attachmentIdOT;
    map['amount'] = isMoneyRelated ? amount : 0;
    if (!patchRowByCriteria_(sheet, 'unique_id', uid, map)) throw new Error('السجل غير موجود');

    var _roleMapU = {};
    roles.forEach(function (rr) { _roleMapU[rr.value] = rr; });
    var _roleU = _roleMapU[otType] || {};
    var _empNameU = '';
    try { var _allEmpsU = getAllRecords_(dbId, EMP_INFO_SHEET); for (var _eu = 0; _eu < _allEmpsU.length; _eu++) { if (String(_allEmpsU[_eu].emp_id) === String(empId)) { _empNameU = _allEmpsU[_eu].name_ar || ''; break; } } } catch (e4) {}
    var savedRecordU = {
      unique_id: uid, emp_id: empId, name_ar: _empNameU || String(empId),
      date: map['date'], overtime_type: otType, overtime_name: _roleU.label || otType,
      start_time: startTime, end_time: endTime,
      overtime_hours: oldRow.overtime_hours, overtime_vacation_days: oldRow.overtime_vacation_days,
      details: details, overtime_attachement: newRef, overtime_attachement_id: attachmentIdOT,
      amount: isMoneyRelated ? amount : 0,
      month: date ? (date.getMonth() + 1) : '', year: date ? date.getFullYear() : '',
      user: oldRow.user, created_at: oldRow.created_at
    };
    try { logHistory_(dbId, EMP_OVERTIME_SHEET, oldRow.record_uid || ('update_' + EMP_OVERTIME_SHEET + '_' + uid), uid, (user && user.email) || '', 'update', savedRecordU, oldRow); } catch (e5) {}
    result = { status: 'success', message: 'تم تحديث العمل الإضافي', data: { unique_id: uid }, record: savedRecordU };
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
    var limit = Number(data && data.limit) || 20;
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
      : ((d.limit != null) ? Number(d.limit) : 20);
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
    var limit = Number(data && data.limit) || 20;
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

      patchRowByCriteria_(sheet, 'review_id', reviewId, updates);
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
      var wasStatus = String(batch.batch_status || 'active').trim();
      /* Phase 2: active->reverted only, reverted terminal — via table (no inline cur check). */
      assertTransition_('att_batch', wasStatus || 'active', 'reverted', 'تم التراجع عن عملية الرفع هذه من قبل');

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

      patchRowByCriteria_(batchSheet, 'batch_id', batchId, {
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
    var lim = (data && data.loadAll) ? null : ((data && data.limit != null) ? Number(data.limit) : 20);
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
      patchRowByCriteria_(batchSheet, 'batch_id', batchId, totals);

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
        if (res && res.files && res.files.length > 1) throw new Error('مجلد Google Drive مكرر: ' + folderName);
        if (res && res.files && res.files.length === 1) {
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
        if (sd.files && sd.files.length > 1) throw new Error('مجلد Google Drive مكرر: ' + folderName);
        if (sd.files && sd.files.length === 1) { var sid = sd.files[0].id; try { cache.put(key, sid, 21600); } catch (e) {} return sid; }
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

  function uploadDriveFileRest_(folderId, blob, fileName, requestId) {
    /* Tag every upload with its durable request ID. A retry can then recover
       the exact file from this folder without relying on a mutable filename. */
    var reqProps = (/^[A-Za-z0-9_-]{16,100}$/.test(String(requestId || '')))
      ? { erpRequestId: String(requestId) } : null;
    try {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.create) {
        var resource = { name: fileName, parents: [folderId] };
        if (reqProps) resource.appProperties = reqProps;
        var created = Drive.Files.create(resource, blob);
        if (created && created.id) return created;
      }
    } catch (advErr) {}
    var token = ScriptApp.getOAuthToken();
    var boundary = '-------' + Utilities.getUuid();
    var delimiter = "\r\n--" + boundary + "\r\n";
    var close_delim = "\r\n--" + boundary + "--";
    var contentType = blob.getContentType() || 'application/octet-stream';
    var base64Data = Utilities.base64Encode(blob.getBytes());
    var metadata = { name: fileName, parents: [folderId] };
    if (reqProps) metadata.appProperties = reqProps;
    var body = delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
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

  function addUploadFile_(data, user, dbId, ctx) {
    var sheet = String((data && data.sheet) || '').trim();
    var cfg = UPLOAD_META[sheet];
    var requestId = String((ctx && ctx.requestId) || '').trim();
    /* These checks happen before any Drive mutation, so the request ledger can
       safely record a confirmed failure instead of an uncertain outcome. */
    var notApplied = function (message) {
      var e = new Error(message);
      e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED';
      throw e;
    };
    if (!cfg) notApplied('الجدول غير معروف');
    if (!(user && user.isSuperAdmin) && !unifiedCheck_(user, COMPANY_UID, cfg.page, 'write')) {
      notApplied('لا يوجد صلاحية لإضافة سجلات في هذه الصفحة');
    }
    var filename = String((data && data.filename) || '').trim();
    if (!filename) notApplied('اسم الملف مطلوب');
    var dot = filename.lastIndexOf('.');
    var ext = (dot > 0 ? filename.slice(dot + 1) : '').toLowerCase();
    var allowedExt = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    if (allowedExt.indexOf(ext) === -1) notApplied('نوع الملف غير مسموح (pdf, word, png, jpg فقط)');
    var b64 = String((data && data.base64) || '').replace(/\s/g, '');
    if (!b64) notApplied('لا يوجد ملف');
    var bytes;
    try { bytes = Utilities.base64Decode(b64); }
    catch (decodeErr) { notApplied('بيانات الملف غير صالحة'); }
    if (bytes.length > 10 * 1024 * 1024) notApplied('حجم الملف يتجاوز 10 ميجابايت');
    var folderId = ensureDriveFolderId_(cfg.folder);
    /* A retry after a timeout or lost response uses the same request ID. If
       Drive already contains its tagged file, return that binding and never
       create a duplicate. The lookup is restricted to the trusted folder. */
    if (/^[A-Za-z0-9_-]{16,100}$/.test(requestId) && typeof findDriveFileByRequestId_ === 'function') {
      var prior = null;
      try { prior = findDriveFileByRequestId_(folderId, requestId); } catch (priorErr) { prior = null; }
      if (prior && prior.id) {
        var priorRef = cfg.folder + '/' + (prior.name || filename);
        try { CacheService.getScriptCache().put('attid_' + priorRef, prior.id, 21600); } catch (cacheErr) {}
        return { status: 'success', reference: priorRef, fileId: prior.id, recovered: true };
      }
    }
    var ts = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    var cleanName = (filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\.[^.]+$/, '') || 'file');
    var newName = cleanName + '.' + ts + '.' + ext;
    var blob = Utilities.newBlob(bytes, mimeForExt_(ext), newName);
    var created = uploadDriveFileRest_(folderId, blob, newName, requestId);
    var fileId = (created && created.id) ? String(created.id) : '';
    var reference = cfg.folder + '/' + newName;
    if (!fileId) throw new Error('تم رفع الملف دون معرف Drive قابل للحفظ؛ لم يتم إنشاء ارتباط بالسجل.');
    if (fileId) {
      try { CacheService.getScriptCache().put('attid_' + reference, fileId, 21600); } catch (e) {}
    }
    return { status: 'success', reference: reference, fileId: fileId };
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
      if (!patchRowByCriteria_(sheet, keyHeader, key, map)) throw new Error('السجل غير موجود');
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
    if (!patchRowByCriteria_(sheet, 'overtime_rule_unique_id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
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
      if (!patchRowByCriteria_(sheet, keyHeader, key, map)) throw new Error('السجل غير موجود');
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
    if (!patchRowByCriteria_(sheet, 'rule_unique_id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
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
      if (!patchRowByCriteria_(sheet, 'id', vacId, map)) throw new Error('السجل غير موجود');
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
    if (!patchRowByCriteria_(sheet, 'id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
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
      if (!patchRowByCriteria_(sheet, keyHeader, key, map)) throw new Error('السجل غير موجود');
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
    if (!patchRowByCriteria_(sheet, 'shift_unique_id', key, { is_active: newValue })) throw new Error('تعذر التحديث');
    try{ logHistory_(dbId, SETTINGS_SHIFT_SCHEDULE_SHEET, row.record_uid || ('update_'+SETTINGS_SHIFT_SCHEDULE_SHEET+'_'+key), key, (user&&user.email)||'', 'update', { is_active: newValue }, row) }catch(e){}
    return { status: 'success', message: newValue ? 'تم تفعيل الوردية' : 'تم إيقاف الوردية', is_active: newValue };
  }

  // ===================== FINANCE MASTER DATA (valley_products / parties) =====================
  // Schemas recovered verbatim from the AppSheet legacy design. Physical
  // columns only — AppSheet virtual/formula columns are computed for display
  // client-side and never stored. IDs are assigned exclusively through
  // addRecord_ → getNextIdUnderLock_ (lock-protected max(id in this table) + 1,
  // floored by the execution's high-water mark; the ID_Counter sheet is never
  // consulted).
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
      vfCurrentProducts_(dbId).forEach(function (row) {
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
      if (!patchRowByCriteria_(sheet, 'id', Number(d.id), map)) throw new Error('تعذر تحديث المنتج');
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

  function vfReadAuthorityRows_() {
    if (typeof systemGetAllRecords_ === 'function') return systemGetAllRecords_('ERP_Pages_Matrix');
    var sheet = getSheet_('ERP_Pages_Matrix', CONFIG.AUTH_SPREADSHEET_ID);
    var headers = getHeaders_(sheet);
    var values = sheet.getDataRange().getValues();
    return values.slice(1).filter(function (row) {
      return row.some(function (value) { return value !== '' && value !== null && value !== undefined; });
    }).map(function (row) {
      var record = {};
      headers.forEach(function (header, index) { record[String(header).trim().toLowerCase()] = row[index]; });
      return record;
    });
  }

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
      var values = vfReadAuthorityRows_();
      if (values.length) {
        for (var i = 0; i < values.length; i++) {
          if (String(values[i].page_id || '').trim() !== VF_COST_PAGE_ID) continue;
          if (String(values[i].status || 'active').trim().toLowerCase() !== 'active') continue;
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

  /** True when this user may quick-add a party from Cash (needs vf_parties add grant). */
  function vfCanAddParty_(user) {
    if (user && user.isSuperAdmin) return true;
    var grants = (user && user.authorizedPages && user.authorizedPages['vf_parties']) || null;
    return !!(grants && grants.length &&
        (grants.indexOf('write') !== -1 || grants.indexOf('full') !== -1));
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
    'cost_currency', 'Related valley_product_technicals', 'purchase_unit_cost',
    /* Durable request markers (uncertain-request recovery). Appended — never
       reordered — so settingsEnsureSheet_ adds them without touching existing
       columns, data, or formulas. Readers must treat only the header's
       active_line_generation as authoritative; rows without a generation are
       the legacy initial generation. Internal IDs are stripped from
       user-facing responses, never shown in tables. */
    'request_id', 'line_generation', 'generation_hash'];
  /* Header-side markers for the same design. last_request_id binds the last
     successful mutation to its request; operation_hash binds that request to
     its exact payload; operation_state is in_progress|complete. */
  PURCHASING_COSTING_HEADERS.push('last_request_id', 'active_line_generation', 'operation_state', 'operation_hash');
  var PURCHASING_HEADER_MARKERS_ = ['last_request_id', 'active_line_generation', 'operation_state', 'operation_hash'];
  var PURCHASING_LINE_MARKERS_ = ['request_id', 'line_generation', 'generation_hash'];
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
    var limit = Number(data && data.limit) || 20;
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    rows.sort(function (a, b) { return (Number(b.id) || 0) - (Number(a.id) || 0); });
    /* The from/to range narrows the set BEFORE the newest-20 slice, so the 20
       rows the list shows are the newest 20 inside the range. */
    rows = vfBoundRows_(rows, data, 'Reciept Date');
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    /* U-46. Whole sheet rows, so every landed-cost column rides along. Code,
       supplier, dates, type, currency, month/year and the approval columns stay,
       which is what the list needs to stay navigable and approvable. */
    var _purCost = vfCanSeeCost_(user);
    if (!_purCost) vfStripCostAll_(rows, VF_COST_KEYS.pur_header);
    /* Internal request markers never leave the server: strip them from every
       user-facing row (ordinary tables, edit form, reports). */
    rows.forEach(function (r) { purchasingStripHeaderInternal_(r); });
    /* As-stored wall dates: canonicalize Date/serial cells to 'yyyy-MM-dd'
     * strings so the browser never UTC-shifts them (2026-09-19 -> 2026-09-18).
     * Applied AFTER vfBoundRows_ so range filtering still sees real Dates. */
    rows.forEach(function (r) {
      r['Reciept Date'] = vfDateStr_(r['Reciept Date']);
      if (r.quality_approval_time) r.quality_approval_time = vfDateTimeStr_(r.quality_approval_time);
      if (r.approval_time) r.approval_time = vfDateTimeStr_(r.approval_time);
    });
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

  /* Purchasing report, operation by operation (تقرير المشتريات).
   * Per operation: Code, supplier label, receipt date, Total costs — plus a
   * grand-totals row (operation count + costs sum). Costs-only by design.
   * Rows follow oldest-first sheet order with a global مسلسل, then the
   * date-range bounds (vfBoundRows_ on 'Reciept Date'). Cost visibility honors
   * vfCanSeeCost_ exactly like the list: without the grant the cost cells are
   * stripped (deleted, never zeroed) and totals stay 0. Read-only; no schema. */
  function getValleyPurchasingReport_(data, user, dbId) {
    data = data || {};
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    var lines = getAllRecords_(dbId, PURCHASING_LINE_SHEET);
    var supMap = {};
    try {
      valleyPurchasingSupplierOptions_(dbId).forEach(function (o) { supMap[String(o.value)] = o.label; });
    } catch (eS) {}
    var prodMap = {};
    try {
      valleyPurchasingProductOptions_(dbId).forEach(function (o) { prodMap[String(o.value)] = o.label; });
    } catch (eP) {}
    var canCost = vfCanSeeCost_(user);
    var vendor = String(data.vendor || '').trim();
    var vendorLabel = vendor ? (supMap[vendor] || vendor) : '';
    var product = String(data.product || '').trim();
    var productLabel = product ? (prodMap[product] || product) : '';

    function lineMatches_(l) {
      if (vendor && String(l.vendor) !== vendor && String(l.vendor) !== vendorLabel) return false;
      if (product && String(l.product) !== product && String(l.product) !== productLabel &&
          String(prodMap[String(l.product)] || '') !== product) return false;
      return true;
    }
    /* Lines date-bounded first, so the range applies to inlines as well. Only
       the authoritative generation per document counts: staged leftovers from
       an interrupted replacement must never inflate report totals. Headerless
       (orphan) lines stay visible rather than silently disappearing. */
    var headerByCode = {};
    rows.forEach(function (r) { headerByCode[String(r.Code)] = r; });
    function lineIsAuthoritative_(l) {
      var h = headerByCode[String(l.code)];
      if (!h) return true;
      var active = String(h.active_line_generation || '');
      var gen = String(l.line_generation || '');
      return active ? gen === active : gen === '';
    }
    var boundLines = vfBoundRows_(lines, data, 'receipt_date').filter(lineMatches_).filter(lineIsAuthoritative_);
    var codesWithProduct = {};
    if (product) boundLines.forEach(function (l) { codesWithProduct[String(l.code)] = true; });

    var all = rows.map(function (r, i) {
      var cost = Number(r['Total costs']) || 0;
      var rec = {
        Code: r.Code,
        supplier_name: supMap[String(r['Supplier Name'])] || r['Supplier Name'] || '-',
        supplier_ref: (r['Supplier Name'] == null || r['Supplier Name'] === '') ? '' : String(r['Supplier Name']),
        receipt_date: vfDateStr_(r['Reciept Date']),
        approval_status: r.approval_status || 'Pending',
        total_costs: canCost ? Math.round(cost * 100) / 100 : 0,
        'مسلسل': i + 1
      };
      return rec;
    });
    /* NOTE: this was vfBoundRows_(all, data, 'Reciept Date') — a silent no-op,
     * because the projected rows carry receipt_date, not Reciept Date, so the
     * date filter never filtered. Bounding on the real key. */
    var list = vfBoundRows_(all, data, 'receipt_date').filter(function (r) {
      if (vendor && String(r.supplier_ref) !== vendor &&
          String(r.supplier_name) !== vendor && String(r.supplier_name) !== vendorLabel) return false;
      if (product && !codesWithProduct[String(r.Code)]) return false;
      return true;
    });
    var totalCosts = 0;
    list.forEach(function (r) { totalCosts = Math.round((totalCosts + r.total_costs) * 100) / 100; });

    /* Inlines grouped by operation Code, restricted to the listed headers so
     * the payload stays tight. Cost keys are deleted (never zeroed) for
     * cost-blind callers, exactly like getValleyPurchasingLines_. */
    var allowedCodes = {};
    list.forEach(function (r) { allowedCodes[String(r.Code)] = true; });
    var linesByCode = {};
    var lineQty = 0, lineCost = 0, lineCount = 0;
    var summaryByProduct = {};
    boundLines.forEach(function (l) {
      var code = String(l.code || '');
      if (!code || !allowedCodes[code]) return;
      var item = {
        code: code,
        vendor: supMap[String(l.vendor)] || l.vendor || '-',
        product: prodMap[String(l.product)] || l.product || '-',
        product_category: l.product_category || '',
        receipt_date: vfDateStr_(l.receipt_date) || '',
        qty: Number(l.qty) || 0,
        unit_price: Number(l.unit_price) || 0,
        other_cost: Number(l.other_cost) || 0,
        total_cost: Number(l.total_cost) || 0,
        unit_cost: Number(l.unit_cost) || 0,
        movement_type: l.movement_type || '',
        lot_identification: l.lot_identification || ''
      };
      if (!canCost) vfStripCost_(item, VF_COST_KEYS.pur_line);
      (linesByCode[code] = linesByCode[code] || []).push(item);
      lineQty += item.qty;
      lineCost = Math.round((lineCost + (item.total_cost || 0)) * 100) / 100;
      lineCount++;
      /* Qty + cost per product, over the same filtered line set. */
      var sKey = String(item.product || '-');
      var sEntry = summaryByProduct[sKey] || (summaryByProduct[sKey] = { product: sKey, qty: 0, total_cost: 0 });
      sEntry.qty = Math.round((sEntry.qty + item.qty) * 100) / 100;
      sEntry.total_cost = Math.round((sEntry.total_cost + (item.total_cost || 0)) * 100) / 100;
    });
    var productSummary = Object.keys(summaryByProduct).map(function (k) { return summaryByProduct[k]; });
    productSummary.sort(function (a, b) { return b.qty - a.qty; });
    /* Cost-blind callers get qty-only summary rows (delete, never zero). */
    if (!canCost) productSummary.forEach(function (e) { delete e.total_cost; });
    return {
      status: 'success',
      rows: list,
      totals: { operations: list.length, total_costs: totalCosts },
      total: list.length,
      linesByCode: linesByCode,
      line_totals: { count: lineCount, qty: Math.round(lineQty * 100) / 100, total_cost: Math.round(lineCost * 100) / 100 },
      productSummary: productSummary,
      can_see_cost: canCost
    };
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
    /* Authoritative generation only; internal markers stripped. */
    var header = getAllRecords_(dbId, PURCHASING_COSTING_SHEET).filter(function (r) {
      return String(r.Code) === code;
    })[0] || null;
    var rows = purchasingActiveLines_(getAllRecords_(dbId, PURCHASING_LINE_SHEET), code, header);
    /* U-46. product, vendor, qty, lot, dates, currency and movement type stay;
       the per-line money columns go. See the save guard in
       saveValleyPurchasingCosting_ — this endpoint feeds the edit form as well
       as the read-only view, and a cost-blind client must not be able to write
       the blanks it was given back over the stored figures. */
    var _plCost = vfCanSeeCost_(user);
    if (!_plCost) vfStripCostAll_(rows, VF_COST_KEYS.pur_line);
    rows.forEach(function (r) { purchasingStripLineInternal_(r); });
    /* As-stored wall dates for the edit/view form date inputs. */
    rows.forEach(function (r) {
      r.receipt_date = vfDateStr_(r.receipt_date);
      r.invoice_date = vfDateStr_(r.invoice_date);
      if (r['Production date']) r['Production date'] = vfDateStr_(r['Production date']);
      if (r['Expiry date']) r['Expiry date'] = vfDateStr_(r['Expiry date']);
    });
    return { status: 'success', lines: rows, can_see_cost: _plCost };
  }

  /* Section checkpoints share the final-save rules but persist one section at
   * a time: header checkpoints never touch child rows, and lines checkpoints
   * never rewrite the header.
   *
   * Pre-mutation refusals below throw via notApplied_: deterministic checks
   * evaluated before the handler's first sheet write, so the request-guard
   * ledger records a confirmed failure (REQUEST_NOT_APPLIED) instead of an
   * uncertain outcome. Throws raised after a write attempt stay plain. */
  function vfNotApplied_(message) {
    var e = new Error(message);
    e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED';
    throw e;
  }
  /* ── Durable recovery primitives (staged line generations) ──────────────
   * A receipt row alone cannot prove what the business tables hold: the
   * mutation may have succeeded while receipt finalization failed. Every
   * purchasing mutation therefore stamps its request identity onto the
   * business rows, and line replacement is staged:
   *   1. the complete new line set is written under a deterministic
   *      generation derived from the request ID;
   *   2. the row count and a canonical hash are verified;
   *   3. only then does the header's active_line_generation switch;
   *   4. inactive generations are cleaned up afterwards, bounded.
   * The previously active set is never deleted before its replacement is
   * verified, so an interruption always leaves a complete authoritative set
   * behind, and a retry can detect, resume, or replay without duplicating. */
  var PURCHASING_LINE_WRITE_CAP_ = 2000;
  function purchasingNormValue_(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) {
      var t = v.getTime();
      if (isNaN(t)) return '';
      try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
      catch (fmtErr) { return v.toISOString().slice(0, 10); }
    }
    if (typeof v === 'number') {
      if (isNaN(v)) return '';
      return String(Math.round(v * 1000000) / 1000000);
    }
    return String(v);
  }
  var PURCHASING_OP_LINE_KEYS_ = ['product', 'qty', 'unit_price', 'other_cost', 'total_cost',
    'movement_type', 'lot_identification', 'receipt_date', 'invoice_date',
    'Production date', 'Expiry date', 'sales_qty', 'sales_value', 'sales_value_amount',
    'unit_cost', 'currency', 'exchange_rate', 'vendor'];
  /* Stable canonical hash of the normalized purchasing payload. Excludes
     transport-only fields (__request_id/__request_owner) and server-assigned
     identity (unique_id/id/user/version/markers/approvals) so equal business
     intent hashes equal. Line order is preserved (meaningful). */
  function purchasingOperationHash_(d) {
    var src = d || {}, hdr = src.header || {}, lines = src.lines || [];
    var skip = { __request_id: 1, __request_owner: 1, unique_id: 1, id: 1, user: 1, user_name: 1,
      version: 1, record_uid: 1, approval_status: 1, approval: 1, approval_time: 1,
      quality_approval_status: 1, quality_approval: 1, quality_approval_time: 1,
      'Related valley_product_purchasings': 1, code_identification: 1,
      last_request_id: 1, active_line_generation: 1, operation_state: 1, operation_hash: 1 };
    var nh = {};
    Object.keys(hdr).forEach(function (k) {
      if (skip[k]) return;
      nh[k] = purchasingNormValue_(hdr[k]);
    });
    var nl = (Array.isArray(lines) ? lines : []).map(function (l) {
      var m = {};
      PURCHASING_OP_LINE_KEYS_.forEach(function (k) { m[k] = purchasingNormValue_(l ? l[k] : ''); });
      return m;
    });
    return stableHash64_(stableCanonical_({ header: nh, lines: nl }));
  }
  /* Deterministic generation ID for a request: retries find their own staged
     rows instead of appending duplicates. */
  function purchasingGenerationId_(requestId) {
    return 'g_' + String(requestId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  }
  /* True when the live line sheet carries the marker columns (post-migration).
     Legacy sheets fall back to the pre-generation write path. */
  function purchasingLineMarkersReady_(lineHeaders) {
    var names = (lineHeaders || []).map(function (h) { return String(h).trim().toLowerCase(); });
    return names.indexOf('line_generation') !== -1 && names.indexOf('request_id') !== -1 &&
      names.indexOf('generation_hash') !== -1;
  }
  /* Header whose last successful mutation carries this request ID. Scanned
     (recovery path only); Code is not consulted so renames stay recoverable. */
  function purchasingFindHeaderByRequest_(dbId, requestId) {
    var want = String(requestId || '');
    if (!want) return null;
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].last_request_id || '') === want) return rows[i];
    }
    return null;
  }
  /* Authoritative lines for a document: the header's active generation, or —
     for legacy documents never rewritten — rows without a generation. */
  function purchasingActiveLines_(allLines, code, header) {
    var active = header ? String(header.active_line_generation || '') : '';
    return (allLines || []).filter(function (r) {
      if (String(r.code) !== String(code)) return false;
      var gen = String(r.line_generation || '');
      return active ? gen === active : gen === '';
    });
  }
  /* Row-by-row business comparison of authoritative lines vs a payload. */
  function purchasingLineRowsMatch_(savedRows, lines) {
    var keys = ['product', 'qty', 'unit_price', 'other_cost', 'total_cost', 'movement_type',
      'lot_identification', 'receipt_date', 'invoice_date', 'Production date', 'Expiry date'];
    if (!Array.isArray(lines) || (savedRows || []).length !== lines.length) return false;
    for (var i = 0; i < savedRows.length; i++) {
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (!purchasingSameValue_(savedRows[i][k], lines[i] && lines[i][k])) return false;
      }
    }
    return true;
  }
  /* Internal request markers never leave the server. Both strippers delete in
     place (and return the row) so they work as forEach callbacks on live
     record objects. */
  function purchasingStripLineInternal_(row) {
    if (!row || typeof row !== 'object') return row;
    PURCHASING_LINE_MARKERS_.forEach(function (k) { delete row[k]; });
    Object.keys(row).forEach(function (k) {
      if (String(k).toLowerCase() === 'request_id') delete row[k];
    });
    return row;
  }
  function purchasingStripHeaderInternal_(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    PURCHASING_HEADER_MARKERS_.forEach(function (k) { delete rec[k]; });
    Object.keys(rec).forEach(function (k) {
      if (String(k).toLowerCase() === 'last_request_id') delete rec[k];
    });
    return rec;
  }
  /* Formula-column helpers shared by the staged and legacy line writers:
     movement_code and product_category are spreadsheet formulas addressing the
     row's own cells, so they are rebuilt per row from live header positions. */
  function formulaCols_(lineHeaders) {
    function col(name) { var i = (lineHeaders || []).findIndex(function (h) { return String(h).trim().toLowerCase() === name; }); if (i < 0) return null; var n = i + 1, s = ''; while (n) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
    return { id: col('id'), code: col('code'), product: col('product'), receipt: col('receipt_date') };
  }
  function canFormulaFor_(lineHeaders) {
    var cc = formulaCols_(lineHeaders);
    return !!(cc.id && cc.code && cc.product && cc.receipt);
  }
  /* Rows already staged under (code, generation). */
  function purchasingStagedRows_(dbId, code, generation) {
    return getAllRecords_(dbId, PURCHASING_LINE_SHEET).filter(function (r) {
      return String(r.code) === String(code) && String(r.line_generation || '') === String(generation);
    });
  }
  /* Bounded delete of staged rows for one (code, generation). Only ever
     targets a non-authoritative generation: callers activate first. */
  function purchasingDeleteStaged_(lineSheet, lineHeaders, code, generation) {
    var codeIdx = -1, genIdx = -1;
    for (var i = 0; i < lineHeaders.length; i++) {
      var n = String(lineHeaders[i]).trim().toLowerCase();
      if (n === 'code') codeIdx = i;
      if (n === 'line_generation') genIdx = i;
    }
    if (codeIdx === -1 || genIdx === -1) return 0;
    var values = lineSheet.getDataRange().getValues();
    var runs = [], runStart = -1, deleted = 0;
    for (var r = values.length - 1; r >= 1; r--) {
      var hit = String(values[r][codeIdx]) === String(code) && String(values[r][genIdx] || '') === String(generation);
      if (hit) {
        deleted++;
        if (deleted > PURCHASING_LINE_WRITE_CAP_) throw new Error('Staged cleanup exceeds the bounded cap');
        if (runStart === -1) runStart = r + 1;
      } else if (runStart !== -1) {
        lineSheet.deleteRows(r + 2, runStart - (r + 2) + 1);
        runStart = -1;
      }
    }
    if (runStart !== -1) lineSheet.deleteRows(2, runStart - 1);
    if (deleted) noteMutation_(lineSheet);
    return deleted;
  }
  /* Switch authority to a verified generation, stamp the request, and clean
     up superseded generations (bounded, best-effort: cleanup failure never
     fails an otherwise complete operation). opts: {criteria} is the header's
     current Code (the final save renames the header before activating, so its
     criteria is the new code; checkpoints never rename, so theirs is the
     stored code); {cleanupOld} removes a renamed-away line set only after the
     new generation is authoritative. */
  function purchasingActivateGeneration_(dbId, code, generation, requestId, opHash, opts) {
    var o = opts || {};
    var crit = o.criteria || code;
    var sheet = getSheet_(PURCHASING_COSTING_SHEET, dbId);
    var patch = { active_line_generation: generation, last_request_id: requestId,
      operation_hash: opHash, operation_state: 'complete' };
    if (code !== crit) patch.Code = code;
    if (fastSaveOnFor_(PURCHASE_BATCH_WRITES_)) {
      /* The engine throws a typed FAST_SAVE_MISSING_KEY instead of returning
         false, so the refusal is translated back into this operation's own
         message — the user sees exactly what they saw before. */
      var _genPatch = {};
      _genPatch[String(crit)] = patch;
      try {
        fsPatchRowsByKey_(dbId, sheet, 'Code', _genPatch);
      } catch (eGen) {
        if (eGen && eGen.code === 'FAST_SAVE_MISSING_KEY') throw new Error('عملية الشراء غير موجودة');
        throw eGen;
      }
    } else if (!patchRowByCriteria_(sheet, 'Code', crit, patch)) {
      throw new Error('عملية الشراء غير موجودة');
    }
    try { purchasingCleanupInactiveGenerations_(dbId, code, generation, o.cleanupOld || ''); }
    catch (cleanupErr) { try { console.log('purchasing generation cleanup deferred: ' + cleanupErr.message); } catch (ignore) {} }
    return true;
  }
  /* Delete non-authoritative line rows for a document (older generations and,
     once a generation is active, legacy unmarked rows), bounded. Also used by
     the admin maintenance path. Never touches the active generation. */
  function purchasingCleanupInactiveGenerations_(dbId, code, activeGeneration, oldCode) {
    var lineSheet = getSheet_(PURCHASING_LINE_SHEET, dbId);
    var headers = getHeaders_(lineSheet);
    if (!purchasingLineMarkersReady_(headers)) return 0;
    var active = String(activeGeneration || '');
    if (!active) return 0;
    var values = lineSheet.getDataRange().getValues();
    var codeIdx = -1, genIdx = -1;
    for (var i = 0; i < headers.length; i++) {
      var n = String(headers[i]).trim().toLowerCase();
      if (n === 'code') codeIdx = i;
      if (n === 'line_generation') genIdx = i;
    }
    if (codeIdx === -1) return 0;
    var total = 0, runStart = -1;
    function flush(runEndExclusive, at) {
      if (runStart === -1) return;
      lineSheet.deleteRows(at, runEndExclusive - at);
      runStart = -1;
    }
    for (var r = values.length - 1; r >= 1; r--) {
      var rowCode = String(values[r][codeIdx]);
      var inScope = rowCode === String(code) || (oldCode && rowCode === String(oldCode));
      var stale = inScope && String(values[r][genIdx] || '') !== active;
      if (stale) {
        total++;
        if (total > PURCHASING_LINE_WRITE_CAP_) throw new Error('Generation cleanup exceeds the bounded cap');
        if (runStart === -1) runStart = r + 1;
      } else if (runStart !== -1) { flush(runStart + 1, r + 2); }
    }
    if (runStart !== -1) flush(runStart + 1, 2);
    if (total) { noteMutation_(lineSheet); vfFlush_(); }
    return total;
  }
  /* Recovery is deliberately conservative.  It never replays a destructive
   * line replacement merely because a receipt is old.  A request is proven
   * applied only when the stored header/lines equal the original payload; an
   * absent create may be safely resumed, while a conflicting partial write is
   * left uncertain for review. */
  function purchasingSameValue_(a, b) {
    if (a instanceof Date) a = Utilities.formatDate(a, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (b instanceof Date) b = Utilities.formatDate(b, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (a == null || a === '') return b == null || b === '';
    if (b == null || b === '') return false;
    var na = Number(a), nb = Number(b);
    if (String(a).trim() !== '' && String(b).trim() !== '' && !isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) <= 0.000001;
    return String(a).slice(0, 10) === String(b).slice(0, 10);
  }
  function purchasingHeaderMatches_(hdr, rec) {
    var ok = true;
    Object.keys(hdr || {}).forEach(function (k) { if (ok && rec[k] !== undefined && !purchasingSameValue_(rec[k], hdr[k])) ok = false; });
    return ok;
  }
  function purchasingRecoveryUncertain_(message) { var e = new Error(message); throw e; }
  /* Marker-bound recovery proof. Never infers success from a matching Code
   * alone: only a header stamped with THIS request ID and the SAME operation
   * hash counts as evidence. Returns a success result when application is
   * proven (the guard finalizes the receipt as done with it), throws
   * vfNotApplied_ for proven non-application, throws a plain error when human
   * review is required, and returns null when the ordinary handler must run —
   * that path is resume-capable (idempotent replay, staged lines), so falling
   * through is a safe resume, never a blind replay. */
  function purchasingRecoverRequest_(action, data, dbId, guardCtx) {
    var reqId = (guardCtx && guardCtx.requestId) || '';
    var d = data || {}, hdr = d.header || {}, code = String(hdr.Code || d.code || '').trim();
    if (!code) vfNotApplied_('لا يمكن مطابقة الطلب المؤجل بدون Code');
    /* Hash and compare the same canonical business Code used by the original
       write. This is still the user's value (including case/leading zeros),
       never the request ID. */
    if (d.header && typeof d.header === 'object') hdr.Code = code;
    else d.code = code;
    if (!reqId) return null;
    /* A transport failure can occur before the first handler read, so the
       business sheets may not exist yet.  Creating their declared schemas is
       setup, not a replay of the business mutation. */
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var markerRec = purchasingFindHeaderByRequest_(dbId, reqId);
    if (action === 'save_valley_purchasing_header_checkpoint') {
      var opHashH = purchasingOperationHash_({ header: hdr, lines: [] });
      if (markerRec && String(markerRec.operation_hash || '') === opHashH &&
          purchasingHeaderMatches_(hdr, markerRec)) {
        return { status: 'success', message: 'تم حفظ بيانات العملية', code: String(markerRec.Code || code), checkpoint: 'header', recovered: true };
      }
      if (markerRec && String(markerRec.operation_hash || '') === opHashH) {
        purchasingRecoveryUncertain_('REQUEST_REVIEW_REQUIRED: بيانات الرأس المطابقة للطلب تغيرت بعد الحفظ');
      }
      if (markerRec) purchasingRecoveryUncertain_('REQUEST_REVIEW_REQUIRED: رقم الطلب مستخدم لبيانات مختلفة');
      return null; // no marker: the ordinary path decides (create resumes, duplicate refuses)
    }
    if (action === 'save_valley_purchasing_lines_checkpoint') {
      var lines = d.lines || [];
      var opHashL = purchasingOperationHash_({ header: { Code: code }, lines: lines });
      if (markerRec && String(markerRec.operation_hash || '') === opHashL &&
          purchasingLineRowsMatch_(purchasingActiveLines_(getAllRecords_(dbId, PURCHASING_LINE_SHEET), code, markerRec), lines)) {
        return { status: 'success', message: 'تم حفظ الأصناف', code: code, checkpoint: 'lines', line_count: lines.length, recovered: true };
      }
      if (markerRec && String(markerRec.operation_hash || '') === opHashL) {
        return null; // staged resume continues in the ordinary path (version re-check skipped for our own marker)
      }
      if (markerRec) purchasingRecoveryUncertain_('REQUEST_REVIEW_REQUIRED: رقم الطلب مستخدم لبيانات مختلفة');
      return null;
    }
    if (action === 'save_valley_purchasing_costing') {
      var opHashF = purchasingOperationHash_({ header: hdr, lines: d.lines || [] });
      if (markerRec && String(markerRec.operation_hash || '') === opHashF &&
          purchasingHeaderMatches_(hdr, markerRec) &&
          purchasingLineRowsMatch_(purchasingActiveLines_(getAllRecords_(dbId, PURCHASING_LINE_SHEET), String(markerRec.Code || code), markerRec), d.lines || [])) {
        return { status: 'success', message: 'تمت مطابقة الحفظ السابق', code: String(markerRec.Code || code), recovered: true, record: purchasingStripHeaderInternal_(markerRec) };
      }
      if (markerRec && String(markerRec.operation_hash || '') === opHashF) {
        return null; // partial application resumes in the ordinary path
      }
      if (markerRec) purchasingRecoveryUncertain_('REQUEST_REVIEW_REQUIRED: رقم الطلب مستخدم لبيانات مختلفة');
      return null;
    }
    return null;
  }
  function purchasingCheckpointHeader_(data, user, dbId, guardCtx) {
    var reqId = (guardCtx && guardCtx.requestId) || '';
    if (guardCtx && guardCtx.recovering) {
      var recovered = purchasingRecoverRequest_('save_valley_purchasing_header_checkpoint', data, dbId, guardCtx);
      if (recovered) return recovered;
    }
    var d = data || {}, hdr = d.header || {};
    var code = String(hdr.Code != null ? hdr.Code : '').trim();
    if (!code) vfNotApplied_('الكود (Code) مطلوب');
    if (!String(hdr.Type != null ? hdr.Type : '').trim()) vfNotApplied_('النوع مطلوب');
    if (!String(hdr['Shipping Type'] != null ? hdr['Shipping Type'] : '').trim()) vfNotApplied_('نوع الشحن مطلوب');
    if (!vfCanSeeCost_(user)) vfNotApplied_('لا تملك صلاحية عرض أو تعديل التكاليف (valley_cost_view) — لا يمكن حفظ عملية شراء.');
    var originalCode = String(d.originalCode != null ? d.originalCode : '').trim();
    if (originalCode && code !== originalCode) {
      vfNotApplied_('كود عملية الشراء ثابت بعد الإنشاء ولا يمكن تغييره.');
    }
    /* Store one canonical user-entered value in both header.Code and every
       line.code. This preserves case and leading zeros; only accidental edge
       whitespace is removed. Request IDs never replace the business Code. */
    hdr.Code = code;
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    /* Request markers bind this mutation to its request so a retry replays
       instead of duplicating. Without a request ID (internal callers) the
       legacy unmarked path applies. */
    var opHash = reqId ? purchasingOperationHash_({ header: hdr, lines: [] }) : '';
    var sheet = getSheet_(PURCHASING_COSTING_SHEET, dbId), rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    var existing = originalCode ? rows.find(function (r) { return String(r.Code) === originalCode; }) : null;
    var duplicate = rows.some(function (r) { return String(r.Code) === code && (!existing || String(r.Code) !== originalCode); });
    if (duplicate) vfNotApplied_('الكود (Code) مكرر — يجب أن يكون فريداً');
    if (existing) {
      /* Phase 2: dual-approved edit-block routed through transition table (no inline cur check).
       * 'edit' pseudo-target: Pending->edit allowed, Approved->edit blocked. */
      assertTransition_('vf_purchasing', String(existing.approval_status || 'Pending'), 'edit', 'لا يمكن تعديل عملية شراء معتمدة. يلزم إجراء إعادة فتح مصرح به خارج الحفظ العادي.');
      assertTransition_('vf_purchasing', String(existing.quality_approval_status || 'Pending'), 'edit', 'لا يمكن تعديل عملية شراء معتمدة. يلزم إجراء إعادة فتح مصرح به خارج الحفظ العادي.');
      /* Idempotent replay: the same request already patched this header. */
      if (reqId && String(existing.last_request_id || '') === reqId && String(existing.operation_hash || '') === opHash) {
        return { status: 'success', message: 'تم حفظ بيانات العملية', code: code, checkpoint: 'header', recovered: true };
      }
      var updates = {};
      PURCHASING_COSTING_HEADERS.forEach(function (col) {
        if (['id', 'unique_id', 'user', 'user_name', 'approval_status', 'approval', 'approval_time', 'quality_approval_status', 'quality_approval', 'quality_approval_time', 'Related valley_product_purchasings', 'code_identification'].indexOf(col) !== -1) return;
        if (PURCHASING_HEADER_MARKERS_.indexOf(col) !== -1) return;
        if (hdr[col] !== undefined && hdr[col] !== null) updates[col] = hdr[col];
      });
      PURCHASING_NUMERIC.forEach(function (c) { if (updates[c] !== '' && updates[c] !== undefined) updates[c] = Number(updates[c]); });
      if (code !== originalCode) updates.Code = code;
      var __hdrVer = checkRowVersion_(existing, (d.version !== undefined ? d.version : hdr.version));
      updates.version = __hdrVer + 1;
      if (reqId) { updates.last_request_id = reqId; updates.operation_hash = opHash; updates.operation_state = 'in_progress'; }
      if (!patchRowByCriteria_(sheet, 'Code', originalCode, updates)) throw new Error('عملية الشراء غير موجودة');
      try { logHistory_(dbId, PURCHASING_COSTING_SHEET, existing.record_uid || ('checkpoint_update_' + originalCode), code, (user && user.email) || '', 'update', Object.assign({}, existing, updates), existing); } catch (e) {}
      vfFlush_();
      return { status: 'success', message: 'تم حفظ بيانات العملية', code: code, checkpoint: 'header' };
    }
    var record = {};
    PURCHASING_COSTING_HEADERS.forEach(function (col) {
      if (['id', 'unique_id', 'user', 'user_name', 'approval_status', 'approval', 'approval_time', 'quality_approval_status', 'quality_approval', 'quality_approval_time', 'Related valley_product_purchasings', 'code_identification'].indexOf(col) !== -1) return;
      if (PURCHASING_HEADER_MARKERS_.indexOf(col) !== -1) return;
      var v = hdr[col]; record[col] = v === undefined || v === null ? '' : v;
    });
    PURCHASING_NUMERIC.forEach(function (c) { if (record[c] !== '' && record[c] !== undefined) record[c] = Number(record[c]); });
    record.unique_id = uid16_(); record.user = (user && user.email) || ''; record.user_name = (user && user.name) || (user && user.email) || '';
    if (reqId) { record.last_request_id = reqId; record.operation_hash = opHash; record.operation_state = 'in_progress'; record.active_line_generation = ''; }
    addRecord_(dbId, PURCHASING_COSTING_SHEET, record, ['Code']);
    try { logHistory_(dbId, PURCHASING_COSTING_SHEET, 'checkpoint_create_' + code, code, (user && user.email) || '', 'create', record, null); } catch (e) {}
    vfFlush_();
    return { status: 'success', message: 'تم حفظ بيانات العملية', code: code, checkpoint: 'header' };
  }

  function purchasingCheckpointLines_(data, user, dbId, guardCtx) {
    var reqId = (guardCtx && guardCtx.requestId) || '';
    if (guardCtx && guardCtx.recovering) {
      var recovered = purchasingRecoverRequest_('save_valley_purchasing_lines_checkpoint', data, dbId, guardCtx);
      if (recovered) return recovered;
    }
    var d = data || {}, code = String(d.code || '').trim(), originalCode = String(d.originalCode || '').trim(), lines = d.lines || [];
    if (!code) vfNotApplied_('الكود (Code) مطلوب');
    if (originalCode && code !== originalCode) {
      vfNotApplied_('كود عملية الشراء ثابت بعد الإنشاء ولا يمكن تغييره.');
    }
    if (!Array.isArray(lines) || !lines.length) vfNotApplied_('يجب إضافة صنف واحد على الأقل');
    var missing = []; lines.forEach(function (l, i) { if (!String((l && l.movement_type) || '').trim()) missing.push(i + 1); });
    if (missing.length) vfNotApplied_('نوع الحركة مطلوب لكل صنف — الأصناف رقم: ' + missing.join('، '));
    if (!vfCanSeeCost_(user)) vfNotApplied_('لا تملك صلاحية عرض أو تعديل التكاليف (valley_cost_view) — لا يمكن حفظ عملية شراء.');
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_LINE_HEADERS); settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var headers = getAllRecords_(dbId, PURCHASING_COSTING_SHEET), header = headers.find(function (r) { return String(r.Code) === code; });
    if (!header) vfNotApplied_('عملية الشراء غير موجودة — احفظ البيانات الأساسية أولاً');
    /* Phase 2: dual-approved edit-block routed through transition table (no inline cur check). */
    assertTransition_('vf_purchasing', String(header.approval_status || 'Pending'), 'edit', 'لا يمكن تعديل عملية شراء معتمدة. يلزم إجراء إعادة فتح مصرح به خارج الحفظ العادي.');
    assertTransition_('vf_purchasing', String(header.quality_approval_status || 'Pending'), 'edit', 'لا يمكن تعديل عملية شراء معتمدة. يلزم إجراء إعادة فتح مصرح به خارج الحفظ العادي.');
    var opHash = reqId ? purchasingOperationHash_({ header: { Code: code }, lines: lines }) : '';
    /* Idempotent replay: this request already made these lines authoritative. */
    if (reqId && String(header.last_request_id || '') === reqId && String(header.operation_hash || '') === opHash &&
        purchasingLineRowsMatch_(purchasingActiveLines_(getAllRecords_(dbId, PURCHASING_LINE_SHEET), code, header), lines)) {
      return { status: 'success', message: 'تم حفظ الأصناف', code: code, checkpoint: 'lines', line_count: lines.length, recovered: true };
    }
    /* Resuming our own interrupted attempt: the version was already bumped, so
       checking the client version again would falsely refuse. */
    var ownInFlight = !!(reqId && String(header.last_request_id || '') === reqId);
    var __linesHdrVer = checkRowVersion_(header, ownInFlight ? getRowVersion_(header) : d.version);
    var lineSheet = getSheet_(PURCHASING_LINE_SHEET, dbId);
    var lineHeaders = getHeaders_(lineSheet);
    var useStaged = !!(reqId && purchasingLineMarkersReady_(lineHeaders));
    var generation = useStaged ? purchasingGenerationId_(reqId) : '';
    if (!useStaged) {
      try {
        if (fastSaveOnFor_(PURCHASE_BATCH_WRITES_)) {
          var _verPatch = {};
          _verPatch[String(code)] = { version: __linesHdrVer + 1 };
          fsPatchRowsByKey_(dbId, getSheet_(PURCHASING_COSTING_SHEET, dbId), 'Code', _verPatch);
        } else {
          patchRowByCriteria_(getSheet_(PURCHASING_COSTING_SHEET, dbId), 'Code', code, { version: __linesHdrVer + 1 });
        }
      } catch (eVer) {}
      var _lineKeyDrop = originalCode && originalCode !== code ? originalCode : code;
      if (fastSaveOnFor_(PURCHASE_BATCH_WRITES_)) fsDeleteRowsByKeys_(dbId, lineSheet, 'code', [_lineKeyDrop]);
      else deleteRowsByCriteria_(lineSheet, 'code', _lineKeyDrop);
    } else if (!ownInFlight || String(header.operation_hash || '') !== opHash) {
      /* First touch of this request: bump the version and stamp ownership. A
         resumed attempt skips both — they already happened. */
      try { patchRowByCriteria_(getSheet_(PURCHASING_COSTING_SHEET, dbId), 'Code', code, { version: __linesHdrVer + 1, last_request_id: reqId, operation_hash: opHash }); } catch (eVer) {}
    }
    var shippingType = header['Shipping Type'] || '', receiptDateStr = header['Reciept Date'] || '', expiryDateStr = '', rd = receiptDateStr ? new Date(receiptDateStr) : null;
    if (rd && !isNaN(rd.getTime())) { rd.setDate(rd.getDate() + 720); expiryDateStr = Utilities.formatDate(rd, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
    var maps = lines.map(function (l) {
      var place = (shippingType === 'CIF' || shippingType === 'FOB' || shippingType === 'C&F') ? 'مستورد' : (shippingType === 'محلي' ? 'محلي' : ''), qty = Number(l.qty) || 0, unit = Number(l.unit_price) || 0;
      /* Phase 5: shared calcLineNet_ is source of truth for line net. */
      var _cc = (typeof calcLineNet_ === 'function') ? calcLineNet_(qty, unit) : unit * qty;
      return { unique_id: uid16_(), code: code, product: l.product || '', product_category: '', vendor: header['Supplier Name'] || l.vendor || '', lot_identification: l.lot_identification || '', qty: qty, unit_price: unit, other_cost: Number(l.other_cost) || 0, total_cost: Number(l.total_cost) || 0, sales_qty: Number(l.sales_qty) || 0, sales_value: Number(l.sales_value) || 0, sales_value_amount: Number(l.sales_value_amount) || 0, unit_cost: Number(l.unit_cost) || 0, movement_type: l.movement_type || '', movement_place: place, receipt_date: l.receipt_date || receiptDateStr, invoice_date: l.invoice_date || receiptDateStr, 'Production date': l['Production date'] || receiptDateStr, 'Expiry date': l['Expiry date'] || expiryDateStr, currency: l.currency || header.Currency || '', exchange_rate: Number(l.exchange_rate) || Number(header['Exchange rate']) || 0, cost_currency: _cc, user: (user && user.email) || '' };
    });
    if (useStaged) {
      /* Staged replacement: the active set is untouched until the complete new
         generation is written and verified, then authority switches. */
      for (var mi = 0; mi < maps.length; mi++) {
        maps[mi].request_id = reqId; maps[mi].line_generation = generation; maps[mi].generation_hash = opHash;
      }
      var stagedDone = purchasingStagedRows_(dbId, code, generation).filter(function (r) { return String(r.generation_hash || '') === opHash; });
      if (stagedDone.length !== maps.length) {
        purchasingDeleteStaged_(lineSheet, lineHeaders, code, generation);
        var startId = getNextIdBatch_(dbId, PURCHASING_LINE_SHEET, maps.length), startRow = lineSheet.getLastRow() + 1;
        var matrix = maps.map(function (m, i) { var row = startRow + i; if (canFormulaFor_(lineHeaders)) { var cc = formulaCols_(lineHeaders); m.movement_code = '=CONCATENATE(' + cc.id + row + ',"-",' + cc.code + row + ',"-",vlookup(' + cc.product + row + ',valley_products!$A:$F,2,0),"-",TEXT(' + cc.receipt + row + ',"DD/MM/YYYY"))'; m.product_category = '=vlookup(VLOOKUP(' + cc.product + row + ',valley_products!A:N,14,0),valley_categories!A:B,2,0)'; } return lineHeaders.map(function (h) { var n = String(h).trim(); if (n.toLowerCase() === 'id') return startId + i; if (m[n] !== undefined) return m[n]; var low = n.toLowerCase(); return m[low] !== undefined ? m[low] : ''; }); });
        lineSheet.getRange(startRow, 1, matrix.length, lineHeaders.length).setValues(matrix); noteMutation_(lineSheet);
        var stagedVerify = purchasingStagedRows_(dbId, code, generation);
        var stagedOk = stagedVerify.length === maps.length;
        if (stagedOk) stagedVerify.forEach(function (r) { if (String(r.generation_hash || '') !== opHash) stagedOk = false; });
        if (!stagedOk) throw new Error('تعذر تأكيد كتابة الأصناف — توقفت العملية قبل التفعيل والأصناف السابقة ما زالت سارية');
      }
      purchasingActivateGeneration_(dbId, code, generation, reqId, opHash, { criteria: code, cleanupOld: originalCode && originalCode !== code ? originalCode : '' });
      vfFlush_();
      try { logHistory_(dbId, PURCHASING_LINE_SHEET, 'checkpoint_lines_' + code, code, (user && user.email) || '', 'update', { code: code, line_count: maps.length }, null); } catch (e) {}
      return { status: 'success', message: 'تم حفظ الأصناف', code: code, checkpoint: 'lines', line_count: maps.length };
    }
    var lineHeaders = getHeaders_(lineSheet), startId = getNextIdBatch_(dbId, PURCHASING_LINE_SHEET, maps.length), startRow = lineSheet.getLastRow() + 1;
    function col(name) { var i = lineHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === name; }); if (i < 0) return null; var n = i + 1, s = ''; while (n) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
    var CL = { id: col('id'), code: col('code'), product: col('product'), receipt: col('receipt_date') }, canFormula = CL.id && CL.code && CL.product && CL.receipt;
    var matrix = maps.map(function (m, i) { var row = startRow + i; if (canFormula) { m.movement_code = '=CONCATENATE(' + CL.id + row + ',"-",' + CL.code + row + ',"-",vlookup(' + CL.product + row + ',valley_products!$A:$F,2,0),"-",TEXT(' + CL.receipt + row + ',"DD/MM/YYYY"))'; m.product_category = '=vlookup(VLOOKUP(' + CL.product + row + ',valley_products!A:N,14,0),valley_categories!A:B,2,0)'; } return lineHeaders.map(function (h) { var n = String(h).trim(); if (n.toLowerCase() === 'id') return startId + i; if (m[n] !== undefined) return m[n]; var low = n.toLowerCase(); return m[low] !== undefined ? m[low] : ''; }); });
    lineSheet.getRange(startRow, 1, matrix.length, lineHeaders.length).setValues(matrix); noteMutation_(lineSheet); vfFlush_();
    try { logHistory_(dbId, PURCHASING_LINE_SHEET, 'checkpoint_lines_' + code, code, (user && user.email) || '', 'update', { code: code, line_count: matrix.length }, null); } catch (e) {}
    return { status: 'success', message: 'تم حفظ الأصناف', code: code, checkpoint: 'lines', line_count: matrix.length };
  }

  function saveValleyPurchasingHeaderCheckpoint_(data, user, dbId, guardCtx) { return purchasingCheckpointHeader_(data, user, dbId, guardCtx); }
  function saveValleyPurchasingLinesCheckpoint_(data, user, dbId, guardCtx) { return purchasingCheckpointLines_(data, user, dbId, guardCtx); }

  /* Read-only fast path for the final commit. When both checkpoints already
   * match the submitted payload, return the existing record without rewriting
   * either table. Post-checkpoint edits deliberately miss this comparison and
   * use the unchanged full-save path. */
  function purchasingCommitAlreadyApplied_(data, dbId) {
    var d = data || {}, hdr = d.header || {}, code = String(hdr.Code || '').trim();
    if (!code || !Array.isArray(d.lines) || !d.lines.length) return null;
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET), rec = rows.find(function (r) { return String(r.Code) === code; });
    if (!rec) return null;
    function same(a, b) {
      if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
      if (a instanceof Date) a = a.toISOString().slice(0, 10);
      if (b instanceof Date) b = b.toISOString().slice(0, 10);
      if (a === '' || a === null || a === undefined) return b === '' || b === null || b === undefined;
      if (b === '' || b === null || b === undefined) return false;
      var na = Number(a), nb = Number(b);
      if (String(a).trim() !== '' && String(b).trim() !== '' && !isNaN(na) && !isNaN(nb)) return Math.abs(na - nb) <= 0.000001;
      return String(a).slice(0, 10) === String(b).slice(0, 10);
    }
    var headerMatches = true;
    Object.keys(hdr).forEach(function (k) { if (headerMatches && rec[k] !== undefined && !same(rec[k], hdr[k])) headerMatches = false; });
    if (!headerMatches) return null;
    /* Only the authoritative generation counts: staged leftovers from an
       interrupted attempt must not satisfy the fast path. */
    var saved = purchasingActiveLines_(getAllRecords_(dbId, PURCHASING_LINE_SHEET), code, rec);
    if (saved.length !== d.lines.length) return null;
    var keys = ['product', 'qty', 'unit_price', 'other_cost', 'total_cost', 'movement_type', 'lot_identification', 'receipt_date', 'invoice_date', 'Production date', 'Expiry date'];
    for (var i = 0; i < saved.length; i++) for (var j = 0; j < keys.length; j++) { var k = keys[j]; if (!same(saved[i][k], d.lines[i][k])) return null; }
    return purchasingStripHeaderInternal_(rec);
  }

  function saveValleyPurchasingCosting_(data, user, dbId, guardCtx) {
    var d = data || {};
    var hdr = d.header || {};
    var lines = d.lines || [];
    var code = String(hdr.Code != null ? hdr.Code : '').trim();
    var reqId = (guardCtx && guardCtx.requestId) || '';
    if (guardCtx && guardCtx.recovering) {
      var recovered = purchasingRecoverRequest_('save_valley_purchasing_costing', data, dbId, guardCtx);
      if (recovered) return recovered;
    }
    if (!code) vfNotApplied_('الكود (Code) مطلوب');
    if (!String(hdr['Type'] != null ? hdr['Type'] : '').trim()) vfNotApplied_('النوع مطلوب');
    if (!String(hdr['Shipping Type'] != null ? hdr['Shipping Type'] : '').trim()) {
      vfNotApplied_('نوع الشحن مطلوب');
    }
    /* A purchase with no lines has no cost to distribute and no stock movement
       to make, so it is refused rather than stored as an empty document. */
    if (!Array.isArray(lines) || !lines.length) {
      vfNotApplied_('يجب إضافة صنف واحد على الأقل');
    }
    /* movement_type drives the stock movement each line becomes, so a blank one
       is not a default — it is a line that does nothing. Checked server-side as
       well as in the form, because the server never trusts the client. */
    var _missingMovement = [];
    lines.forEach(function (l, i) {
      if (!String((l && l.movement_type) != null ? l.movement_type : '').trim()) _missingMovement.push(i + 1);
    });
    if (_missingMovement.length) {
      vfNotApplied_('نوع الحركة مطلوب لكل صنف — الأصناف رقم: ' + _missingMovement.join('، '));
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
      vfNotApplied_('لا تملك صلاحية عرض أو تعديل التكاليف (valley_cost_view) — لا يمكن حفظ عملية شراء.');
    }
    var originalCode = String(d.originalCode != null ? d.originalCode : '').trim();
    if (originalCode && code !== originalCode) {
      vfNotApplied_('كود عملية الشراء ثابت بعد الإنشاء ولا يمكن تغييره.');
    }
    hdr.Code = code;

    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    if (d.commitOnly) {
      var committed = purchasingCommitAlreadyApplied_(d, dbId);
      if (committed) return { status: 'success', message: 'تم الحفظ', code: code, record: committed, committed: true };
    }
    var sheet = getSheet_(PURCHASING_COSTING_SHEET, dbId);
    var rows = getAllRecords_(dbId, PURCHASING_COSTING_SHEET);
    var existingMatch = rows.filter(function (r) { return String(r.Code) === code; });
    var isEdit = originalCode !== '' && rows.some(function (r) { return String(r.Code) === originalCode; });
    var existingRecord = isEdit ? rows.find(function (r) { return String(r.Code) === originalCode; }) : null;
    /* Request identity for this mutation. Without it (internal callers) the
       legacy unmarked path applies. */
    var opHash = reqId ? purchasingOperationHash_({ header: hdr, lines: lines }) : '';

    /* Approval is a server-side business lock, never just a disabled client
     * button. Reopen is intentionally absent because the current schema has no
     * dedicated audited reopen state/field. */
    if (existingRecord) {
      var financialApproval = String(existingRecord.approval_status || '').trim().toLowerCase();
      var qualityApproval = String(existingRecord.quality_approval_status || '').trim().toLowerCase();
      if (financialApproval === 'approved' || qualityApproval === 'approved') {
        vfNotApplied_('لا يمكن تعديل عملية شراء معتمدة. يلزم إجراء إعادة فتح مصرح به خارج الحفظ العادي.');
      }
      /* Idempotent replay: this request already completed this exact document —
         return it without bumping versions or rewriting rows. */
      if (reqId && String(existingRecord.last_request_id || '') === reqId && String(existingRecord.operation_hash || '') === opHash) {
        var replayLines = purchasingActiveLines_(getAllRecords_(dbId, PURCHASING_LINE_SHEET), isEdit && code !== originalCode ? code : originalCode, existingRecord);
        if (purchasingLineRowsMatch_(replayLines, lines)) {
          var replayRec = rows.find(function (r) { return String(r.Code) === code; }) || existingRecord;
          return { status: 'success', message: isEdit ? 'تم تحديث عملية الشراء' : 'تمت إضافة عملية الشراء', code: code, record: purchasingStripHeaderInternal_(replayRec), recovered: true };
        }
        /* Header already patched by this request; resume with the lines only. */
        var resumeEditHeader = true;
      }
    }

    if (!isEdit) {
      if (existingMatch.length) {
        if (reqId && existingMatch[0] && String(existingMatch[0].last_request_id || '') === reqId &&
            String(existingMatch[0].operation_hash || '') === opHash) {
          /* This request created the header but the lines may never have
             landed: success only when the authoritative lines match, otherwise
             resume below without recreating the header. */
          if (purchasingLineRowsMatch_(purchasingActiveLines_(getAllRecords_(dbId, PURCHASING_LINE_SHEET), code, existingMatch[0]), lines)) {
            return { status: 'success', message: 'تمت إضافة عملية الشراء', code: code, record: purchasingStripHeaderInternal_(existingMatch[0]), recovered: true };
          }
          var resumeCreateHeader = existingMatch[0];
        } else {
          vfNotApplied_('الكود (Code) مكرر — يجب أن يكون فريداً');
        }
      }
    } else if (code !== originalCode && existingMatch.length) {
      vfNotApplied_('الكود (Code) مكرر — يُستخدم بالفعل لعملية أخرى');
    }

    var record = {};
    PURCHASING_COSTING_HEADERS.forEach(function (col) {
      if (['id', 'unique_id', 'user', 'user_name', 'approval_status', 'approval', 'approval_time',
        'quality_approval_status', 'quality_approval', 'quality_approval_time',
        'Related valley_product_purchasings', 'code_identification'].indexOf(col) !== -1) return;
      /* Request markers are server-stamped below, never copied from the client. */
      if (PURCHASING_HEADER_MARKERS_.indexOf(col) !== -1) return;
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
      vfNotApplied_('مجموع تكاليف الأصناف (' + incomingTotal.toFixed(2) + ') لا يساوي إجمالي التكاليف (' + headerTotal.toFixed(2) + ')');
    }

    var _oldPur = null;
    if (typeof resumeCreateHeader !== 'undefined' && resumeCreateHeader) {
      /* Header already created by this request; lines resume below. */
      _oldPur = resumeCreateHeader;
    } else if (typeof resumeEditHeader !== 'undefined' && resumeEditHeader) {
      /* Header already patched by this request; lines resume below. */
      _oldPur = existingRecord;
    } else if (isEdit) {
      _oldPur = rows.find(function(r){ return String(r.Code)===String(originalCode); }) || null;
      /* Row-edit repair (5.4): formula-safe patch for the purchase header. */
      if (fastSaveOnFor_(PURCHASE_BATCH_WRITES_)) {
        /* One key-column read instead of re-reading all 46 columns of the
           costing sheet to locate the row. */
        var _hdrPatch = {};
        _hdrPatch[String(originalCode)] = record;
        fsPatchRowsByKey_(dbId, sheet, 'Code', _hdrPatch);
      } else {
        patchRowByCriteria_(sheet, 'Code', originalCode, record);
      }
      try{ var _newPur = Object.assign({}, _oldPur||{}, record); logHistory_(dbId, PURCHASING_COSTING_SHEET, _oldPur&&_oldPur.record_uid ? _oldPur.record_uid : ('update_'+PURCHASING_COSTING_SHEET+'_'+originalCode), originalCode, (user&&user.email)||'', 'update', _newPur, _oldPur) }catch(e){}
    } else {
      record.unique_id = uid16_();
      record.user = (user && user.email) || '';
      record.user_name = (user && user.name) || (user && user.email) || '';
      if (reqId) { record.last_request_id = reqId; record.operation_hash = opHash; record.operation_state = 'in_progress'; record.active_line_generation = ''; }
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
    var lineHeadersLive = getHeaders_(lineSheet);
    /* Staged replacement when the request carries identity and the sheet is
       migrated; otherwise the legacy delete-then-insert path (also used by
       internal callers without a request ID). */
    var useStaged = !!(reqId && purchasingLineMarkersReady_(lineHeadersLive));
    var generation = useStaged ? purchasingGenerationId_(reqId) : '';
      var lineKey = (isEdit && code !== originalCode) ? originalCode : code;
      if (!useStaged) {
        if (fastSaveOnFor_(PURCHASE_BATCH_WRITES_)) fsDeleteRowsByKeys_(dbId, lineSheet, 'code', [lineKey]);
        else deleteRowsByCriteria_(lineSheet, 'code', lineKey);
      }
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

    if (useStaged && lineMaps.length) {
      /* Staged replacement: verify the complete new generation first, switch
         authority second. A retry reuses its already-staged rows. */
      for (var smi = 0; smi < lineMaps.length; smi++) {
        lineMaps[smi].request_id = reqId; lineMaps[smi].line_generation = generation; lineMaps[smi].generation_hash = opHash;
      }
      var stagedHit = purchasingStagedRows_(dbId, code, generation).filter(function (r) { return String(r.generation_hash || '') === opHash; });
      if (stagedHit.length !== lineMaps.length) {
        purchasingDeleteStaged_(lineSheet, lineHeadersLive, code, generation);
        var sStartId = getNextIdBatch_(dbId, PURCHASING_LINE_SHEET, lineMaps.length), sStartRow = lineSheet.getLastRow() + 1;
        var sMatrix = lineMaps.map(function (lm, i) {
          var rowNo = sStartRow + i;
          if (canFormulaFor_(lineHeadersLive)) {
            var cc = formulaCols_(lineHeadersLive);
            lm.movement_code = '=CONCATENATE(' + cc.id + rowNo + ',"-",' + cc.code + rowNo +
              ',"-",vlookup(' + cc.product + rowNo + ',valley_products!$A:$F,2,0),"-",TEXT(' +
              cc.receipt + rowNo + ',"DD/MM/YYYY"))';
            lm.product_category = '=vlookup(VLOOKUP(' + cc.product + rowNo +
              ',valley_products!A:N,14,0),valley_categories!A:B,2,0)';
          }
          return lineHeadersLive.map(function (h) {
            var name = String(h).trim();
            if (name.toLowerCase() === 'id') return sStartId + i;
            if (lm[name] !== undefined) return lm[name];
            var lower = name.toLowerCase();
            return lm[lower] !== undefined ? lm[lower] : '';
          });
        });
        lineSheet.getRange(sStartRow, 1, sMatrix.length, lineHeadersLive.length).setValues(sMatrix);
        noteMutation_(lineSheet);
        var stagedCheck = purchasingStagedRows_(dbId, code, generation);
        var stagedComplete = stagedCheck.length === lineMaps.length;
        if (stagedComplete) stagedCheck.forEach(function (r) { if (String(r.generation_hash || '') !== opHash) stagedComplete = false; });
        if (!stagedComplete) throw new Error('تعذر تأكيد كتابة الأصناف — توقفت العملية قبل التفعيل والأصناف السابقة ما زالت سارية');
      }
      purchasingActivateGeneration_(dbId, code, generation, reqId, opHash, { criteria: code, cleanupOld: (isEdit && code !== originalCode) ? originalCode : '' });
      vfFlush_();   /* the balance the client reads back must include this write */
      return { status: 'success', message: isEdit ? 'تم تحديث عملية الشراء' : 'تمت إضافة عملية الشراء', code: code };
    }

    /* PERF — the reason this save used to take minutes.
     *
     * This loop used to call addRecord_ once per line. Each of those calls
     * acquires the script lock, reads the id column of the ENTIRE
     * valley_product_purchasing sheet to recompute max(id), and appends one
     * row — and, before A1, also read and wrote the ID_Counter sheet. That is
     * several Sheets round trips per line, one of which is O(the whole table),
     * so a 40-line purchase against a 20 000-row line table did ~200 round
     * trips and read millions of cells before it could finish.
     *
     * logHistory_ already solved exactly this, and says so in its own comment:
     * ONE lock, ONE id allocation, ONE setValues. Same cell values, same ids,
     * same order — only the number of round trips changes. getNextIdBatch_ is
     * the allocator it uses and is lock-reentrant, so this is safe here too;
     * since A1 it derives startId from max(id) in the target table, floored by
     * this execution's high-water mark, and reserves the whole run at once so
     * the lines below cannot collide with a later allocation.
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

    vfFlush_();   /* the balance the client reads back must include this write */
    return { status: 'success', message: isEdit ? 'تم تحديث عملية الشراء' : 'تمت إضافة عملية الشراء', code: code };
  }

  function deleteValleyPurchasingCosting_(data, user, dbId) {
    var code = String((data && data.code) || '').trim();
    if (!code) vfNotApplied_('الكود (Code) مطلوب');
    if (!(user && user.isSuperAdmin)) vfNotApplied_('حذف عمليات الشراء من صلاحيات مدير النظام فقط');
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var _oldDelPur = getAllRecords_(dbId, PURCHASING_COSTING_SHEET).find(function(r){ return String(r.Code)===String(code); }) || null;
    var _oldDelUid = _oldDelPur ? (_oldDelPur.record_uid || ('del_'+PURCHASING_COSTING_SHEET+'_'+code)) : ('del_'+PURCHASING_COSTING_SHEET+'_'+code);
    try{ logHistory_(dbId, PURCHASING_COSTING_SHEET, _oldDelUid, code, (user&&user.email)||'', 'delete', null, _oldDelPur) }catch(e){}
    if (fastSaveOnFor_(PURCHASE_BATCH_WRITES_)) {
      /* Each legacy call re-reads the whole table to find its rows; these
         resolve from one column read and delete every matching row in one
         Sheets batch call. */
      fsDeleteRowsByKeys_(dbId, getSheet_(PURCHASING_COSTING_SHEET, dbId), 'Code', [code]);
      fsDeleteRowsByKeys_(dbId, getSheet_(PURCHASING_LINE_SHEET, dbId), 'code', [code]);
    } else {
      deleteRowsByCriteria_(getSheet_(PURCHASING_COSTING_SHEET, dbId), 'Code', code);
      deleteRowsByCriteria_(getSheet_(PURCHASING_LINE_SHEET, dbId), 'code', code);
    }
    vfFlush_();   /* the balance the client reads back must include this write */
    return { status: 'success', message: 'تم حذف عملية الشراء' };
  }

  function approveValleyPurchasingCosting_(data, user, dbId) {
    /* Phase 6: thin wrapper — step 'approve' of docType 'valley_purchasing'
     * in APPROVAL_CHAINS (Code.js). Unversioned row preserves this
     * approver's legacy no-version-check behaviour. */
    var code = String((data && data.code) || '').trim();
    if (!code) vfNotApplied_('الكود (Code) مطلوب');
    /* Phase 2: Pending->Approved each leg, Approved terminal — via table (no inline cur check). */
    var __curAppr = null; try { __curAppr = getAllRecords_(dbId, PURCHASING_COSTING_SHEET).find(function(r){ return String(r.Code)===String(code); }) || null; } catch(eRead){}
    if (__curAppr) assertTransition_('vf_purchasing', __curAppr.approval_status || 'Pending', 'Approved', 'لا يمكن اعتماد عملية الشراء من هذه الحالة');
    var res = approveStep_('valley_purchasing', code, 'approve', user, { dbId: dbId });
    if (!res || res.status !== 'success') throw new Error((res && res.message) || 'عملية الشراء غير موجودة');
    return { status: 'success', message: 'تم اعتماد عملية الشراء' };
  }

  function qualityApproveValleyPurchasingCosting_(data, user, dbId) {
    /* Phase 6: thin wrapper — step 'quality' of the same chain. */
    var code = String((data && data.code) || '').trim();
    if (!code) vfNotApplied_('الكود (Code) مطلوب');
    /* Phase 2: Pending->Approved each leg, Approved terminal — via table. */
    var __curQ = null; try { __curQ = getAllRecords_(dbId, PURCHASING_COSTING_SHEET).find(function(r){ return String(r.Code)===String(code); }) || null; } catch(eRead){}
    if (__curQ) assertTransition_('vf_purchasing', __curQ.quality_approval_status || 'Pending', 'Approved', 'لا يمكن اعتماد الجودة من هذه الحالة');
    var res = approveStep_('valley_purchasing', code, 'quality', user, { dbId: dbId });
    if (!res || res.status !== 'success') throw new Error((res && res.message) || 'عملية الشراء غير موجودة');
    return { status: 'success', message: 'تم اعتماد الجودة' };
  }

    ValleyFoods.register('get_valley_purchasing_costing', getValleyPurchasingCosting_);
    ValleyFoods.register('get_valley_purchasing_report', getValleyPurchasingReport_);
    ValleyFoods.register('get_valley_purchasing_options', getValleyPurchasingOptions_);
    ValleyFoods.register('get_valley_purchasing_lines', getValleyPurchasingLines_);
  ValleyFoods.register('save_valley_purchasing_header_checkpoint', saveValleyPurchasingHeaderCheckpoint_);
  ValleyFoods.register('save_valley_purchasing_lines_checkpoint', saveValleyPurchasingLinesCheckpoint_);
  ValleyFoods.register('save_valley_purchasing_costing', saveValleyPurchasingCosting_);
  ValleyFoods.register('delete_valley_purchasing_costing', deleteValleyPurchasingCosting_);
  ValleyFoods.register('approve_valley_purchasing_costing', approveValleyPurchasingCosting_);
  ValleyFoods.register('quality_approve_valley_purchasing_costing', qualityApproveValleyPurchasingCosting_);
  ValleyFoods.register('reconcile_valley_purchasing_receipts', reconcileValleyPurchasingReceipts_);

  /* Administrator-only reconciliation of pending/uncertain purchasing receipts.
   * Dry-run by default. For each receipt it reports request ID, user, action,
   * age, and state, then applies exactly one of:
   *  - done: a header stamped with THIS request ID exists, and — for actions
   *    that write lines — the header's authoritative generation holds rows
   *    stamped with the same request. The reconstructed response is stored.
   *  - manual review: everything else. Legacy receipts (no markers) can never
   *    be auto-proven and stay manual; failed is never inferred.
   * Never deletes receipt rows, purchases, or lines. Every applied decision is
   * audit-logged. Bounded: at most 50 receipts per run. */
  var PURCHASING_RECONCILE_ACTIONS_ = ['save_valley_purchasing_header_checkpoint',
    'save_valley_purchasing_lines_checkpoint', 'save_valley_purchasing_costing'];
  function reconcileValleyPurchasingReceipts_(data, user, dbId) {
    if (!(user && user.isSuperAdmin)) vfNotApplied_('تسوية الإيصالات غير المؤكدة من صلاحيات مدير النظام فقط');
    var opts = data || {};
    var dryRun = opts.dry_run === false ? false : true;
    var maxAgeDays = Number(opts.max_age_days) || 0;
    var limit = Math.min(Number(opts.limit) || 50, 50);
    settingsEnsureSheet_(dbId, PURCHASING_COSTING_SHEET, PURCHASING_COSTING_HEADERS);
    settingsEnsureSheet_(dbId, PURCHASING_LINE_SHEET, PURCHASING_LINE_HEADERS);
    var receipts = [];
    try { receipts = getAllRecords_(dbId, 'ERP_Request_Receipts'); } catch (e) { receipts = []; }
    var now = new Date().getTime(), out = { reviewed: 0, marked_done: [], manual_review: [] };
    for (var i = 0; i < receipts.length && out.reviewed < limit; i++) {
      var r = receipts[i] || {};
      if (PURCHASING_RECONCILE_ACTIONS_.indexOf(String(r.module_action || '')) === -1) continue;
      if (String(r.state) !== 'pending' && String(r.state) !== 'uncertain') continue;
      var created = new Date(r.created_at).getTime();
      var ageDays = isNaN(created) ? -1 : (now - created) / 86400000;
      if (maxAgeDays > 0 && (ageDays < 0 || ageDays > maxAgeDays)) continue;
      out.reviewed++;
      var requestId = String(r.request_id || '');
      var entry = { request_id: requestId, user: String(r.user_email || ''), action: String(r.module_action || ''),
        state: String(r.state), age_days: ageDays < 0 ? null : Math.round(ageDays * 10) / 10, evidence: '' };
      var markerRec = requestId ? purchasingFindHeaderByRequest_(dbId, requestId) : null;
      var proof = null;
      if (markerRec) {
        var hCode = String(markerRec.Code || '');
        if (String(r.module_action) === 'save_valley_purchasing_header_checkpoint') {
          proof = 'header Code=' + hCode + ' stamped with this request';
        } else {
          var active = String(markerRec.active_line_generation || '');
          var auth = active ? getAllRecords_(dbId, PURCHASING_LINE_SHEET).filter(function (l) {
            return String(l.code) === hCode && String(l.line_generation || '') === active &&
              String(l.request_id || '') === requestId;
          }) : [];
          if (active && auth.length) proof = 'header Code=' + hCode + ' with ' + auth.length + ' authoritative lines of this request (gen ' + active + ')';
          else entry.evidence = 'header stamped but no authoritative lines of this request';
        }
      } else {
        entry.evidence = 'no purchase stamped with this request ID';
      }
      if (proof) {
        entry.evidence = proof;
        var response = { status: 'success', reconciled: true, code: String((markerRec && markerRec.Code) || '') };
        if (String(r.module_action) === 'save_valley_purchasing_header_checkpoint') {
          response.message = 'تم حفظ بيانات العملية'; response.checkpoint = 'header';
        } else if (String(r.module_action) === 'save_valley_purchasing_lines_checkpoint') {
          response.message = 'تم حفظ الأصناف'; response.checkpoint = 'lines';
        } else {
          response.message = 'تمت مطابقة الحفظ السابق'; response.record = purchasingStripHeaderInternal_(markerRec);
        }
        if (!dryRun) {
          try {
            if (patchRowByCriteria_(getSheet_('ERP_Request_Receipts', dbId), 'request_key', String(r.request_key || ''), { state: 'done', response_json: JSON.stringify(response) })) {
              try { logHistory_(dbId, 'ERP_Request_Receipts', String(r.request_key || requestId), requestId, (user && user.email) || '', 'reconcile', { receipt: requestId, decision: 'done', evidence: proof }, null); } catch (auditErr) {}
              entry.decision = 'done';
            } else { entry.evidence += '؛ تعذر تحديث الإيصال'; }
          } catch (applyErr) { entry.evidence += '؛ تعذر تحديث الإيصال'; }
        } else { entry.decision = 'would-mark-done'; }
        out.marked_done.push(entry);
      } else {
        out.manual_review.push(entry);
      }
    }
    return { status: 'success', dry_run: dryRun, reviewed: out.reviewed, marked_done: out.marked_done, manual_review: out.manual_review };
  }

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
      if (!patchRowByCriteria_(sheet, 'id', Number(d.id), map)) throw new Error('تعذر تحديث السجل');
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

    /* Product maps (meta is additive: category/unit/client for the statement
       sections; the name/id maps below are untouched). */
    var productName = {}, partyProductIds = {}, productMeta = {};
    safeRows_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
      var pid = String(p.id);
      productName[pid] = String(p.name_ar || '');
      productMeta[pid] = {
        category: String(p.category == null ? '' : p.category).trim(),
        unit: String(p.unit || p.price_unit || ''),
        client_id: String(p.client_id == null ? '' : p.client_id).trim()
      };
      if (String(p.client_id || '').trim() === clientId) partyProductIds[pid] = true;
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
        /* Phase 5: shared calcLineNet_ is source of truth for line net. */
        value: (typeof calcLineNet_ === 'function') ? calcLineNet_(qty, price) : qty * price,
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

    /* Stock valuation rows for the party's own products. Valuation formula
       unchanged (qty from valley_current_products, latest selling price);
       product_id/category ride along so the modal can partition the rows. */
    var stockRows = [];
    try {
      vfCurrentProducts_(dbId).forEach(function (cs) {
        var pid = String(cs.product_id || '').trim();
        var qty = Number(cs.current_qty || 0);
        if (!partyProductIds[pid] || qty <= 0) return;
        var meta = productMeta[pid] || { category: '', unit: '' };
        stockRows.push({
          product_id: pid,
          name: productName[pid] || pid,
          qty: qty,
          latest_price: latestPrice[pid] ? latestPrice[pid].price : 0,
          category: meta.category,
          unit: meta.unit
        });
      });
    } catch (e) {}

    /* Factory vs packaging partition: category 4/23 go to مخزون المصنع,
       everything else to مخزون التعبئة والتغليف والأدوات. A partition, so
       each product appears in exactly one section. */
    var stockFactoryRows = [], stockPackagingRows = [];
    stockRows.forEach(function (r) {
      if (r.category === '4' || r.category === '23') stockFactoryRows.push(r);
      else stockPackagingRows.push(r);
    });

    /* Manufacturing agreements for this client, derived fresh on every
       statement call — never a stored balance, so reloads cannot stack. */
    var mfgAgreements = mfgAgreementsForClient_(dbId, clientId, productName, productMeta);

    /* Client-scoped product selector options for new agreement rows. */
    var clientProducts = [];
    Object.keys(partyProductIds).forEach(function (pid) {
      var meta = productMeta[pid] || {};
      clientProducts.push({
        value: pid,
        label: productName[pid] || pid,
        unit: meta.unit || '',
        category: meta.category || ''
      });
    });

    return {
      status: 'success',
      party: party,
      transactions: transactions,
      stock_rows: stockRows,
      stock_factory_rows: stockFactoryRows,
      stock_packaging_rows: stockPackagingRows,
      agreements: mfgAgreements.list,
      agreements_subtotal: mfgAgreements.subtotal,
      client_products: clientProducts
    };
  }

  /* ---------- MANUFACTURING AGREEMENTS (اتفاقات تحت التصنيع) ----------
   * Per-client editable rows inside the كشف حساب modal. Stored in
   * valley_manufacturing_agreements (created on first use via
   * settingsEnsureSheet_, same convention as the FIN sheets).
   *
   * Statuses: draft (no balance effect), active (affects balance),
   * cancelled (preserved for audit, no balance effect), completed
   * (future; affects balance like active).
   *
   * The subtotal is DERIVED on every read (SUM of active/completed line
   * totals). Nothing ever writes it back into a balance sheet, so repeated
   * saves and reloads cannot double-count. */
  const MFG_AGREE_SHEET = 'valley_manufacturing_agreements';
  const MFG_AGREE_HEADERS = ['unique_id','id','client_id','product_id','qty','unit_price','total','status','created_by','created_at','updated_by','updated_at','cancelled_by','cancelled_at'];
  const MFG_AGREE_FACTORY_CATS = ['4', '23'];

  function mfgAgreeRound2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function mfgAgreeRoundQty_(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
  function mfgAgreeAffectsBalance_(status) {
    var s = String(status || '').trim().toLowerCase();
    return s === 'active' || s === 'completed';
  }
  function mfgAgreeRows_(dbId) {
    settingsEnsureSheet_(dbId, MFG_AGREE_SHEET, MFG_AGREE_HEADERS);
    return safeRows_(dbId, MFG_AGREE_SHEET);
  }
  function mfgAgreePublicRow_(r, productName, productMeta) {
    var pid = String(r.product_id == null ? '' : r.product_id);
    var meta = (productMeta && productMeta[pid]) || {};
    return {
      unique_id: String(r.unique_id || ''),
      client_id: String(r.client_id == null ? '' : r.client_id),
      product_id: pid,
      product_name: (productName && productName[pid]) || pid,
      unit: meta.unit || '',
      qty: Number(r.qty) || 0,
      unit_price: Number(r.unit_price) || 0,
      total: mfgAgreeRound2_(r.total),
      status: String(r.status || 'draft'),
      created_at: r.created_at || ''
    };
  }
  /* All non-cancelled rows for the client + the balance-affecting subtotal. */
  function mfgAgreementsForClient_(dbId, clientId, productName, productMeta) {
    var list = [];
    mfgAgreeRows_(dbId).forEach(function (r) {
      if (String(r.client_id == null ? '' : r.client_id).trim() !== String(clientId)) return;
      if (String(r.status || '').trim().toLowerCase() === 'cancelled') return;
      list.push(mfgAgreePublicRow_(r, productName, productMeta));
    });
    var subtotal = 0;
    list.forEach(function (r) {
      if (mfgAgreeAffectsBalance_(r.status)) subtotal += mfgAgreeRound2_(r.qty * r.unit_price);
    });
    return { list: list, subtotal: mfgAgreeRound2_(subtotal) };
  }
  /* Shared validation: product must exist AND belong to the client (server
     re-reads valley_products; the client payload is never trusted). */
  function mfgAgreeCheckProduct_(dbId, clientId, productId) {
    var found = null;
    safeRows_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
      if (String(p.id) === String(productId)) found = p;
    });
    if (!found) throw new Error('الصنف غير موجود');
    if (String(found.client_id == null ? '' : found.client_id).trim() !== String(clientId)) {
      throw new Error('الصنف لا يتبع هذا العميل');
    }
    return found;
  }
  function mfgAgreeCheckMoney_(qty, unitPrice) {
    var q = Number(qty), pr = Number(unitPrice);
    if (!isFinite(q) || !isFinite(pr)) throw new Error('الكمية والسعر قيمان رقميتان مطلوبتان');
    if (q <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');
    if (pr < 0) throw new Error('السعر لا يمكن أن يكون سالباً');
    return { qty: mfgAgreeRoundQty_(q), unit_price: mfgAgreeRound2_(pr) };
  }

  /* Create or update one agreement row. Updates are keyed by unique_id, so a
     retried save is idempotent; creates carry no unique_id and get one. */
  function saveValleyMfgAgreement_(data, user, dbId) {
    var d = data || {};
    var clientId = String(d.client_id == null ? '' : d.client_id).trim();
    var productId = String(d.product_id == null ? '' : d.product_id).trim();
    if (!clientId) throw new Error('معرّف العميل مطلوب');
    if (!productId) throw new Error('الصنف مطلوب');
    var actor = (user && user.email) || '';
    mfgAgreeCheckProduct_(dbId, clientId, productId);
    var money = mfgAgreeCheckMoney_(d.qty, d.unit_price);
    var total = mfgAgreeRound2_(money.qty * money.unit_price);

    var uid = String(d.unique_id || '').trim();
    var status = String(d.status || 'draft').trim().toLowerCase();
    /* Phase 2: draft/active/completed + *->cancelled, cancelled terminal — via table.
     * Create allows draft/active/completed only (cancelled only via cancel handler). */
    if (!DOC_STATUS_TRANSITIONS['vf_mfg_agree'] || !DOC_STATUS_TRANSITIONS['vf_mfg_agree'][status] || status === 'cancelled') throw new Error('الحالة غير صالحة');

    var result;
    executeWithLock_(function () {
      settingsEnsureSheet_(dbId, MFG_AGREE_SHEET, MFG_AGREE_HEADERS);
      var sheet = getSheet_(MFG_AGREE_SHEET, dbId);
      var rows = getAllRecords_(dbId, MFG_AGREE_SHEET);
      if (uid) {
        var existing = null;
        rows.forEach(function (r) { if (String(r.unique_id) === uid) existing = r; });
        if (!existing) throw new Error('السجل غير موجود');
        /* Phase 2: cancelled terminal + forward transitions via table (no inline cur check). */
        assertTransition_('vf_mfg_agree', String(existing.status || 'draft'), status, 'السجل ملغي ولا يمكن تعديله');
        if (String(existing.client_id == null ? '' : existing.client_id).trim() !== clientId) {
          throw new Error('السجل لا يتبع هذا العميل');
        }
        mfgAgreeCheckProduct_(dbId, clientId, productId);
        var __agreeVer = checkRowVersion_(existing, d.version);
        var updates = {
          product_id: productId,
          qty: money.qty,
          unit_price: money.unit_price,
          total: total,
          status: status,
          updated_by: actor,
          updated_at: new Date(),
          version: __agreeVer + 1
        };
        if (!patchRowByCriteria_(sheet, 'unique_id', uid, updates)) throw new Error('تعذر حفظ السجل');
        try { logHistory_(dbId, MFG_AGREE_SHEET, existing.record_uid || ('update_' + MFG_AGREE_SHEET + '_' + uid), uid, actor, 'update', updates, existing); } catch (e) {}
        result = uid;
      } else {
        /* Double-submit guard: an identical active row is a retried create,
           not a second agreement — point at the existing row instead. */
        var dup = null;
        rows.forEach(function (r) {
          if (String(r.client_id == null ? '' : r.client_id).trim() !== clientId) return;
          if (!mfgAgreeAffectsBalance_(r.status)) return;
          if (String(r.product_id) !== productId) return;
          if (mfgAgreeRoundQty_(r.qty) !== money.qty) return;
          if (mfgAgreeRound2_(r.unit_price) !== money.unit_price) return;
          dup = r;
        });
        if (dup && mfgAgreeAffectsBalance_(status)) {
          throw new Error('يوجد اتفاق مطابق بالفعل لهذا الصنف');
        }
        var map = {
          unique_id: uid16_(),
          client_id: clientId,
          product_id: productId,
          qty: money.qty,
          unit_price: money.unit_price,
          total: total,
          status: status,
          created_by: actor,
          created_at: new Date(),
          updated_by: actor,
          updated_at: new Date(),
          cancelled_by: '',
          cancelled_at: ''
        };
        var res = addRecord_(dbId, MFG_AGREE_SHEET, map, ['client_id', 'product_id']);
        try { logHistory_(dbId, MFG_AGREE_SHEET, map.record_uid || ('create_' + MFG_AGREE_SHEET + '_' + map.unique_id), map.unique_id, actor, 'create', map, null); } catch (e) {}
        result = map.unique_id;
      }
    });

    /* Fresh derived lists, so the modal shows server-canonical totals. */
    var productName = {}, productMeta = {};
    safeRows_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
      var pid = String(p.id);
      productName[pid] = String(p.name_ar || '');
      productMeta[pid] = { unit: String(p.unit || p.price_unit || '') };
    });
    var fresh = mfgAgreementsForClient_(dbId, clientId, productName, productMeta);
    return {
      status: 'success',
      message: 'تم حفظ الاتفاق',
      unique_id: result,
      agreements: fresh.list,
      agreements_subtotal: fresh.subtotal
    };
  }

  /* Cancel preserves the row for audit (cancelled_by/at); cancelled rows
     never affect the balance and cannot be edited afterwards. */
  function cancelValleyMfgAgreement_(data, user, dbId) {
    var d = data || {};
    var uid = String(d.unique_id || '').trim();
    if (!uid) throw new Error('معرّف السجل مطلوب');
    var actor = (user && user.email) || '';
    var clientId = '';
    executeWithLock_(function () {
      settingsEnsureSheet_(dbId, MFG_AGREE_SHEET, MFG_AGREE_HEADERS);
      var sheet = getSheet_(MFG_AGREE_SHEET, dbId);
      var rows = getAllRecords_(dbId, MFG_AGREE_SHEET);
      var existing = null;
      rows.forEach(function (r) { if (String(r.unique_id) === uid) existing = r; });
      if (!existing) throw new Error('السجل غير موجود');
      /* Phase 2: *->cancelled, cancelled terminal — via table (no inline cur check). */
      assertTransition_('vf_mfg_agree', String(existing.status || 'draft'), 'cancelled', 'السجل ملغي بالفعل');
      clientId = String(existing.client_id == null ? '' : existing.client_id).trim();
      var updates = { status: 'cancelled', updated_by: actor, updated_at: new Date(), cancelled_by: actor, cancelled_at: new Date() };
      if (!patchRowByCriteria_(sheet, 'unique_id', uid, updates)) throw new Error('تعذر إلغاء السجل');
      try { logHistory_(dbId, MFG_AGREE_SHEET, existing.record_uid || ('cancel_' + MFG_AGREE_SHEET + '_' + uid), uid, actor, 'cancel', updates, existing); } catch (e) {}
    });
    var productName = {}, productMeta = {};
    safeRows_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
      var pid = String(p.id);
      productName[pid] = String(p.name_ar || '');
      productMeta[pid] = { unit: String(p.unit || p.price_unit || '') };
    });
    var fresh = mfgAgreementsForClient_(dbId, clientId, productName, productMeta);
    return {
      status: 'success',
      message: 'تم إلغاء الاتفاق',
      agreements: fresh.list,
      agreements_subtotal: fresh.subtotal
    };
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
    /* MO reads are schema-read-only. Opening an order must never append a
       missing column and turn a pre-existing layout problem into a different
       layout problem. The MO-only compatibility gate allows safe trailing
       columns, but protects the formula-addressed canonical prefix. */
    mfgAssertMfgSchema_(dbId, MFG_DETAIL_SCOPE_);
    var opts = getValleyOptionSets_(dbId);
    var moUid = String((data && data.mo_uid) || '').trim();
    if (!moUid) {
      return { status: 'success', is_new: true, recipe_options: opts.recipe_options, product_options: opts.product_options, work_center_options: opts.work_center_options, enums: opts.enums, can_see_cost: vfCanSeeCost_(user), edit_token: '', save_scope: MFG_DETAIL_SCOPE_.slice() };
    }
    var full = getValleyMfgOrderFull_(data, user, dbId);
    var ops = getValleyMfgWorkOps_({ mo_uid: moUid }, user, dbId);
    /* loadAll: the save path deletes by-product rows missing from the payload,
       so the detail must carry the FULL set — the default limit:15 slice would
       otherwise orphan-delete everything past the first 15 on resave. */
    var bps = getValleyMfgByproducts_({ mo_uid: moUid, loadAll: true }, user, dbId);
    /* Do not embed every available stock batch in the initial MO response.
       A newly-created draft can contain materials with hundreds of historical
       batches; composing all of them made google.script.run collapse the whole
       detail reply to null. The detail page loads a material's batches through
       get_valley_product_batches only when its allocation UI needs them.
       Persisted footer allocations remain on each output. */
    var outputs = full.outputs || [];
    return {
      status: 'success', is_new: false,
      recipe_options: opts.recipe_options, product_options: opts.product_options, work_center_options: opts.work_center_options, enums: opts.enums,
      order: full.order, outputs: outputs, workops: ops.workops || [], byproducts: bps.byproducts || [],
      /* Schema-free edit token for this editor's scope (detail page). The
         client returns both as base_token/save_scope on edit. */
      edit_token: mfgEditToken_(dbId, moUid, MFG_DETAIL_SCOPE_),
      save_scope: MFG_DETAIL_SCOPE_.slice(),
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

  /* ---------- Client manufacturing report (vf_mfg_client_report) ----------
   * Read-only period summary for one RPC: per (client, produced product) MO
   * counts and produced quantities pivoted by operation_type, materials used
   * (valley_manufacture_header_products) and by-products
   * (valley_manufacture_by_product) summed per item. All reads are single
   * getAllRecords_ calls (request-memoised); joins are exact in-memory maps.
   *
   * Filters (all optional; empty = all): client_ids[], product_ids[],
   * op_types[], statuses[] (default ['Locked']), from/to (ISO date-only,
   * inclusive, on manufacture_date). Unknown ids never match. Rows with a
   * blank/unparseable manufacture_date are excluded — they cannot belong to
   * any period. Money is rounded once at the end (qty 3dp, cost 2dp); cost
   * keys are stripped server-side for users without the valley_cost_view
   * grant (VF_COST_KEYS.mfg_output / mfg_bp — deleted, never zeroed). */
  function getValleyMfgClientReport_(data, user, dbId) {
    var d = data || {};
    /* Local mirror of the save flow's BP_SHEET (function-local there):
       by-products live in valley_manufacture_by_product. */
    var BP_SHEET_R = 'valley_manufacture_by_product';
    function idSet(v) {
      var out = {};
      ((Array.isArray(v) ? v : (v == null || v === '' ? [] : [v])) || []).forEach(function (x) {
        var k = String(x == null ? '' : x).trim();
        if (k) out[k] = true;
      });
      return out;
    }
    var fClients = idSet(d.client_ids !== undefined ? d.client_ids : d.client_id);
    var fProducts = idSet(d.product_ids !== undefined ? d.product_ids : d.product_id);
    var fOps = idSet(d.op_types !== undefined ? d.op_types : d.operation_type);
    var fStatus = idSet(d.statuses !== undefined ? d.statuses : d.mo_status);
    if (!Object.keys(fStatus).length) fStatus = { 'Locked': true };
    var from = vfDateBound_(d.from, false);
    var to = vfDateBound_(d.to, true);
    if (from && to && from > to) throw new Error('«من تاريخ» بعد «إلى تاريخ»');

    var products = {};
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
        var pid = String(p.id == null ? '' : p.id).trim();
        if (!pid || products[pid]) return;
        products[pid] = {
          name: String(p.name_ar || ('#' + pid)),
          unit: String(p.unit || '').trim(),
          client_id: String(p.client_id == null ? '' : p.client_id).trim()
        };
      });
    } catch (e) {}
    var partyNames = {};
    var partyDir = {};
    try {
      getAllRecords_(dbId, FIN_PARTIES_SHEET).forEach(function (p) {
        var pid = String(p.id == null ? '' : p.id).trim();
        if (!pid || partyNames[pid]) return;
        partyNames[pid] = String(p.name || ('#' + pid));
        partyDir[pid] = String(p.customer_direction || '').trim();
      });
    } catch (e) {}
    /* Filter dropdowns list only what actually exists in the manufacture
       header table — not every master product/client. Distinct produced
       products across ALL header rows (any status/date), so the lists are
       stable while the user changes period/status filters. */
    var hdrRows = [];
    try { hdrRows = getAllRecords_(dbId, MFG_ORDER_SHEET); } catch (e) {}
    var headerPids = {};
    hdrRows.forEach(function (r) {
      var pid = String(r.produced_product == null ? '' : r.produced_product).trim();
      if (pid) headerPids[pid] = true;
    });
    var clientOptions = [];
    var seenClients = {};
    Object.keys(headerPids).forEach(function (pid) {
      var cid = products[pid] ? products[pid].client_id : '';
      if (!cid || seenClients[cid]) return;
      if (partyDir[cid] !== 'عميل') return;
      seenClients[cid] = true;
      clientOptions.push({ value: cid, label: partyNames[cid] || ('#' + cid) });
    });
    clientOptions.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    var productOptions = Object.keys(headerPids).map(function (pid) {
      var pr = products[pid] || { name: '#' + pid, unit: '', client_id: '' };
      return { value: pid, label: pr.name, unit: pr.unit, client_id: pr.client_id };
    }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });

    function inPeriod(mdate) {
      if (!mdate) return false;
      var t = String(mdate).trim();
      if (!t) return false;
      var dt = (/^\d{4}-\d{2}-\d{2}$/.test(t)) ? new Date(t + 'T00:00:00.000') : new Date(t);
      if (isNaN(dt.getTime())) return false;
      if (from && dt < from) return false;
      if (to && dt > to) return false;
      return true;
    }

    /* MOs in scope, keyed by unique_id. hdrRows was already read above. */
    var moByUid = {};
    var moList = [];
    try {
      hdrRows.forEach(function (r) {
        var uid = String(r.unique_id || '').trim();
        if (!uid || moByUid[uid]) return;
        var st = String(r.mo_status || 'Draft').trim() || 'Draft';
        if (!fStatus[st]) return;
        if (!inPeriod(r.manufacture_date)) return;
        var pid = String(r.produced_product == null ? '' : r.produced_product).trim();
        var prod = products[pid] || { name: pid ? ('#' + pid) : '-', unit: '', client_id: '' };
        if (Object.keys(fProducts).length && !fProducts[pid]) return;
        if (Object.keys(fClients).length && !fClients[prod.client_id]) return;
        var op = String(r.operation_type || '').trim();
        if (Object.keys(fOps).length && !fOps[op]) return;
        var mo = { uid: uid, op: op, status: st, pid: pid, client_id: prod.client_id,
          qty: Math.round((Number(r.actual_qty) || 0) * 1000) / 1000,
          cost: Math.round((Number(r.total_batch_cost) || 0) * 100) / 100 };
        moByUid[uid] = mo;
        moList.push(mo);
      });
    } catch (e) {}

    function roundQty(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
    function roundMoney(n) { return Math.round((Number(n) || 0) * 100) / 100; }
    function blankOpSplit() {
      var o = {};
      MFG_OP_TYPES.forEach(function (t) { o[t] = { mo_count: 0, produced_qty: 0, batch_cost: 0 }; });
      return o;
    }
    var rows = {};
    function rowFor(mo) {
      var key = mo.client_id + '|' + mo.pid;
      var row = rows[key];
      if (!row) {
        var prod = products[mo.pid] || { name: mo.pid ? ('#' + mo.pid) : '-', unit: '' };
        row = { client_id: mo.client_id, client_name: partyNames[mo.client_id] || (mo.client_id ? ('#' + mo.client_id) : 'بدون عميل'),
          product_id: mo.pid, product_name: prod.name, unit: prod.unit,
          mo_count: 0, produced_qty: 0, batch_cost: 0, by_op: blankOpSplit(), materials: {}, byproducts: {}, byproducts_by_op: {} };
        rows[key] = row;
      }
      return row;
    }
    moList.forEach(function (mo) {
      var row = rowFor(mo);
      row.mo_count++;
      row.produced_qty = roundQty(row.produced_qty + mo.qty);
      row.batch_cost = roundMoney(row.batch_cost + mo.cost);
      if (!row.by_op[mo.op]) row.by_op[mo.op] = { mo_count: 0, produced_qty: 0, batch_cost: 0 };
      row.by_op[mo.op].mo_count++;
      row.by_op[mo.op].produced_qty = roundQty(row.by_op[mo.op].produced_qty + mo.qty);
      row.by_op[mo.op].batch_cost = roundMoney(row.by_op[mo.op].batch_cost + mo.cost);
    });

    /* Materials used, per (client, product, material item). Unit resolves via
       the products map when the material is a known product, else blank. */
    try {
      getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (l) {
        var mo = moByUid[String(l.valley_manufacture_header_id || '').trim()];
        if (!mo) return;
        var itemPid = String(l.product_id == null ? '' : l.product_id).trim();
        var itemKey = itemPid || String(l.product_name || '').trim() || '-';
        var row = rowFor(mo);
        var m = row.materials[itemKey] || { item: String(l.product_name || itemKey),
          unit: (products[itemPid] && products[itemPid].unit) || '', qty: 0, total_cost: 0 };
        m.qty = roundQty(m.qty + Number(l.product_qty));
        m.total_cost = roundMoney(m.total_cost + Number(l.total_cost));
        row.materials[itemKey] = m;
      });
    } catch (e) {}
    /* By-products, per (client, product, item) — kept both as a flat list
       and grouped by the parent MO's operation_type, so each op-type section
       renders its own by-products directly under its production table.
       The by-product qty is also added to the parent MO's operation_type
       produced sum (row split + row total; grand totals derive from rows),
       so each op-type total reflects everything that op produced. */
    try {
      getAllRecords_(dbId, BP_SHEET_R).forEach(function (b) {
        var mo = moByUid[String(b.valley_manufacture_header_id || '').trim()];
        if (!mo) return;
        var itemKey = String(b.item || '').trim() || '-';
        var bq = roundQty(Number(b.qty));
        /* itemKey is a valley_products numeric id — resolve its name_ar here;
           unknown/deleted products fall back to the raw id. */
        var bpName = (products[itemKey] && products[itemKey].name) || itemKey;
        var row = rowFor(mo);
        var m = row.byproducts[itemKey] || { item: itemKey, product_name: bpName, qty: 0, total_cost: 0 };
        m.qty = roundQty(m.qty + bq);
        m.total_cost = roundMoney(m.total_cost + Number(b.total_cost));
        row.byproducts[itemKey] = m;
        var ob = row.byproducts_by_op[mo.op] || (row.byproducts_by_op[mo.op] = {});
        var g = ob[itemKey] || (ob[itemKey] = { item: itemKey, product_name: bpName, qty: 0, total_cost: 0 });
        g.qty = roundQty(g.qty + bq);
        g.total_cost = roundMoney(g.total_cost + Number(b.total_cost));
        if (!row.by_op[mo.op]) row.by_op[mo.op] = { mo_count: 0, produced_qty: 0, batch_cost: 0 };
        row.by_op[mo.op].produced_qty = roundQty(row.by_op[mo.op].produced_qty + bq);
        row.produced_qty = roundQty(row.produced_qty + bq);
      });
    } catch (e) {}

    var canCost = vfCanSeeCost_(user);
    var outRows = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) {
      var c = String(a.client_name).localeCompare(String(b.client_name), 'ar');
      return c !== 0 ? c : String(a.product_name).localeCompare(String(b.product_name), 'ar');
    });
    var totals = { mo_count: 0, produced_qty: 0, batch_cost: 0, by_op: blankOpSplit() };
    outRows.forEach(function (row) {
      row.materials = Object.keys(row.materials).map(function (k) { return row.materials[k]; })
        .sort(function (a, b) { return String(a.item).localeCompare(String(b.item), 'ar'); });
      row.byproducts = Object.keys(row.byproducts).map(function (k) { return row.byproducts[k]; })
        .sort(function (a, b) { return String(a.item).localeCompare(String(b.item), 'ar'); });
      Object.keys(row.byproducts_by_op).forEach(function (t) {
        row.byproducts_by_op[t] = Object.keys(row.byproducts_by_op[t]).map(function (k) { return row.byproducts_by_op[t][k]; })
          .sort(function (a, b) { return String(a.item).localeCompare(String(b.item), 'ar'); });
      });
      totals.mo_count += row.mo_count;
      totals.produced_qty = roundQty(totals.produced_qty + row.produced_qty);
      totals.batch_cost = roundMoney(totals.batch_cost + row.batch_cost);
      Object.keys(row.by_op).forEach(function (t) {
        if (!totals.by_op[t]) totals.by_op[t] = { mo_count: 0, produced_qty: 0, batch_cost: 0 };
        totals.by_op[t].mo_count += row.by_op[t].mo_count;
        totals.by_op[t].produced_qty = roundQty(totals.by_op[t].produced_qty + row.by_op[t].produced_qty);
        totals.by_op[t].batch_cost = roundMoney(totals.by_op[t].batch_cost + (Number(row.by_op[t].batch_cost) || 0));
      });
      if (!canCost) {
        vfStripCostAll_(row.materials, VF_COST_KEYS.mfg_output);
        vfStripCostAll_(row.byproducts, VF_COST_KEYS.mfg_bp);
        Object.keys(row.byproducts_by_op).forEach(function (t) {
          vfStripCostAll_(row.byproducts_by_op[t], VF_COST_KEYS.mfg_bp);
        });
        /* total_batch_cost is a cost field: without the grant it must not
           reach the client at all (deleted, never zeroed). */
        delete row.batch_cost;
        Object.keys(row.by_op).forEach(function (t) { delete row.by_op[t].batch_cost; });
      }
    });
    if (!canCost) {
      delete totals.batch_cost;
      Object.keys(totals.by_op).forEach(function (t) { delete totals.by_op[t].batch_cost; });
    }

    return {
      status: 'success',
      can_see_cost: canCost,
      filters: { from: d.from || '', to: d.to || '' },
      filter_options: {
        clients: clientOptions,
        products: productOptions,
        op_types: MFG_OP_TYPES.slice(),
        statuses: ['Draft', 'In Progress', 'Locked']
      },
      rows: outRows,
      totals: totals
    };
  }

  function getValleyMfgOrders_(data, user, dbId) {
    mfgAssertMfgSchema_(dbId, ['header']);
    /* Category values in valley_manufacture_header are stored as IDs. Keep
       the raw ID for filtering, but expose the human label from
       valley_categories to the list page. Missing/legacy category rows fall
       back to the stored value so existing orders remain visible. */
    var categoryLabels = {};
    try {
      getAllRecords_(dbId, FIN_CATEGORIES_SHEET).forEach(function (c) {
        var cid = String(c.id == null ? '' : c.id).trim();
        if (!cid || categoryLabels[cid]) return;
        categoryLabels[cid] = String(c.name || c.name_ar || cid).trim() || cid;
      });
    } catch (eCat) {}
    function categoryLabel_(id) {
      var key = String(id == null ? '' : id).trim();
      return categoryLabels[key] || key;
    }
    var rows = getAllRecords_(dbId, MFG_ORDER_SHEET).map(function (r) {
      var rawCategory = r.product_category == null ? '' : String(r.product_category).trim();
      return {
        unique_id: r.unique_id,
        id: r.id,
        transaction_code: r.transaction_code || '',
        operation_type: r.operation_type || '',
        shift: r.shift || '',
        manufacture_date: r.manufacture_date,
        produced_product: r.produced_product,
        product_category: categoryLabel_(rawCategory),
        _product_category_id: rawCategory,
        manufacture_batch: r.manufacture_batch || '',
        manufactured_qty: r.manufactured_qty,
        expected_qty: r.expected_qty,
        actual_qty: r.actual_qty,
        mo_status: r.mo_status || 'Draft',
        production_approval: r.production_approval || '',
        quality_approval: r.quality_approval || '',
        recipe_id: r.recipe_id || ''
      };
    }).sort(function (a, b) { return Number(b.id || 0) - Number(a.id || 0); });
    var allHeaderProductIds = {};
    rows.forEach(function (r) {
      var pid = String(r.produced_product == null ? '' : r.produced_product).trim();
      if (pid) allHeaderProductIds[pid] = true;
    });

    /* List filters (vf_mfg_orders filter bar). Every dimension is exact-match
       and optional: blank/missing means no constraint, so a blank filter set
       returns everything. Applied before vfPage_ so totals and paging reflect
       the filter. Dates are additionally honored inside vfPage_. */
    function normF_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
    /* Distinct dropdown values, always computed from the unfiltered set so a
       narrowed filter never shrinks the other dropdowns. Stored values are
       already display labels, except produced_product (joined client-side via
       product_options, as before). */
    function distinctLabels_(arr, key) {
      var seen = {}, out = [];
      arr.forEach(function (r) {
        var v = normF_(r[key]);
        if (!v || seen[v]) return;
        seen[v] = true;
        out.push(v);
      });
      out.sort();
      return out;
    }
    var filterOptions = {
      shift: MFG_SHIFTS.slice(),
      operation_types: MFG_OP_TYPES.slice(),
      categories: (function () {
        var seen = {}, out = [];
        rows.forEach(function (r) {
          var id = normF_(r._product_category_id);
          if (!id || seen[id]) return;
          seen[id] = true;
          out.push({ value: id, label: normF_(r.product_category) || id });
        });
        out.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
        return out;
      }()),
      batches: distinctLabels_(rows, 'manufacture_batch')
    };
    var fOp = normF_(data.operation_type);
    var fShift = normF_(data.shift);
    var fProd = normF_(data.produced_product);
    var fCat = normF_(data.product_category);
    var fBatch = normF_(data.manufacture_batch);
    if (fOp || fShift || fProd || fCat || fBatch) {
      rows = rows.filter(function (r) {
        if (fOp && normF_(r.operation_type) !== fOp) return false;
        if (fShift && normF_(r.shift) !== fShift) return false;
        if (fProd && String(r.produced_product) !== fProd) return false;
        if (fCat && normF_(r._product_category_id) !== fCat && normF_(r.product_category) !== fCat) return false;
        if (fBatch && normF_(r.manufacture_batch) !== fBatch) return false;
        return true;
      });
    }

    var recipes = [];
    try { recipes = getAllRecords_(dbId, MFG_RECIPE_SHEET); } catch (e) {}
    var recipeOptions = recipes.map(function (r) {
      var active = !(r.is_active === false || String(r.is_active).toLowerCase() === 'false');
      return { value: String(r.unique_id), label: String(r.recipe_code || r.id) + ' — ' + String(r.recipe_name || ''), active: active };
    }).filter(function (o) { return o.value; });

    var mfgPage = vfPage_(rows, data, 'manufacture_date');
    mfgPage.rows.forEach(function (r) { delete r._product_category_id; });
    rows.forEach(function (r) { delete r._product_category_id; });
    var filterProductOptions = [];
    try {
      filterProductOptions = getAllRecords_(dbId, FIN_PRODUCTS_SHEET).map(function (p) {
        var pid = String(p.id == null ? '' : p.id).trim();
        if (!pid || !allHeaderProductIds[pid]) return null;
        return { value: p.id, label: String(p.name_ar || ('#' + pid)) };
      }).filter(Boolean).sort(function (a, b) { return a.label.localeCompare(b.label, 'ar'); });
    } catch (eFilterProducts) {}
    return {
      status: 'success',
      orders: mfgPage.rows,
      total: mfgPage.total,
      filter_options: filterOptions,
      filter_product_options: filterProductOptions,
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
        required_qty: Math.round(raw * 1000) / 1000,
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

    /* ---------- Uncertain-save repair (script-only, no schema change) ----------
     * Tokens, deterministic IDs, checkpoints and recovery for
     * save_valley_mfg_order. Uses only the existing UID columns and the
     * existing ERP_Request_Receipts.response_json cell. No version column, no
     * marker column, no new sheet, no migration. */
    var MFG_SAVE_SCOPE_ALLOW_ = ['header', 'outputs', 'consumption', 'work_ops', 'byproducts'];
    var MFG_LIST_SCOPE_ = ['header', 'outputs', 'consumption'];
    var MFG_DETAIL_SCOPE_ = ['header', 'outputs', 'consumption', 'work_ops', 'byproducts'];
    var MFG_WORKOP_HEADERS = ['unique_id','id','valley_manufacture_header_id','work_center_sequence','recipe_id','operation_status','start_time','end_time','notes','actual_hours','work_center_cost','total_cost','last_pause_time','total_pause_duration','user','created_at'];
    var MFG_BYPRODUCT_HEADERS = ['unique_id','id','valley_manufacture_header_id','code','manufacture_date','transaction_code','item','qty','total_cost','manufacture_internal_batch','user','created_at'];
    function mfgScopeFor_(d) {
      var dflt = MFG_LIST_SCOPE_;
      if (d && Array.isArray(d.save_scope) && d.save_scope.length) {
        var out = [];
        d.save_scope.forEach(function (s) {
          s = String(s || '').trim();
          if (MFG_SAVE_SCOPE_ALLOW_.indexOf(s) !== -1 && out.indexOf(s) === -1) out.push(s);
        });
        if (out.length) return out;
      }
      /* Legacy clients send no scope: list page never sends work_ops /
         byproducts keys, detail page always does. */
      var s2 = ['header', 'outputs', 'consumption'];
      if (d && Array.isArray(d.work_ops)) s2.push('work_ops');
      if (d && Array.isArray(d.byproducts)) s2.push('byproducts');
      return s2;
    }
    /* Explicit deletion contract for this MO only. Absence from a client
       array is never sufficient evidence to delete a persisted child row. */
    function mfgDeletedUids_(d, section) {
      var src = d && d.deleted_uids && Array.isArray(d.deleted_uids[section]) ? d.deleted_uids[section] : [];
      var seen = {}, out = [];
      src.forEach(function (v) {
        var u = String(v || '').trim();
        if (u && !seen[u]) { seen[u] = true; out.push(u); }
      });
      return out;
    }
    function mfgNormQty_(v) {
      if (v === '' || v === null || v === undefined) return '';
      var n = Number(v);
      if (!isFinite(n)) return '';
      return Math.round(n * 1000) / 1000;
    }
    function mfgNormDateKey_(v) {
      var d = null;
      try { d = parseDate_(v); } catch (e) { d = null; }
      if (!d || isNaN(d.getTime())) return '';
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    function mfgNormPid_(v) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return '';
      var n = Number(s);
      return (s !== '' && isFinite(n)) ? n : s;
    }
    function mfgHash_(s) {
      try {
        if (typeof requestGuardHash_ === 'function') return requestGuardHash_(String(s));
      } catch (e) {}
      var h1 = 0x811c9dc5, h2 = 0x01000193;
      var str = String(s), i, c;
      for (i = 0; i < str.length; i++) {
        c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
        h2 = Math.imul(h2 ^ (c + 31), 16777619) >>> 0;
      }
      var hex = function (x) { return ('0000000' + x.toString(16)).slice(-8); };
      return (hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(h2 ^ 0x9e3779b9)).slice(0, 64);
    }
    function mfgCanonical_(v) {
      try {
        if (typeof requestGuardCanonical_ === 'function') return requestGuardCanonical_(v);
      } catch (e) {}
      return JSON.stringify(v);
    }
    /* Deterministic 16-hex UID in the existing UID shape, derived from
     * SHA-256(requestId | moUid | section | index). A same-request retry
     * recomputes the identical UID and patches the same row. */
    function mfgDeterministicUid_(requestId, moUid, section, idx) {
      return String(mfgHash_([String(requestId || ''), String(moUid || ''), String(section || ''), String(idx)].join('|'))).slice(0, 16).toLowerCase();
    }
    function mfgNewUid_(requestId, moUid, section, idx) {
      if (requestId) return mfgDeterministicUid_(requestId, moUid, section, idx);
      return uid16Hex_();
    }
    /* Server-owned positive integer ID for new Valley Foods MO rows. The
       allocator already runs under the outer save lock and returns max+1;
       this boundary rejects a non-integer instead of persisting a malformed
       business ID. Existing-row updates never touch `id`. */
    function mfgNextIntegerId_(dbId, sheetName) {
      var raw = getNextIdUnderLock_(dbId, sheetName, 'id');
      var n = Number(raw);
      if (!isFinite(n) || n < 1 || Math.floor(n) !== n) {
        vfNotApplied_('تعذر توليد رقم id صحيح ومتزايد لجدول ' + sheetName + ' — راجع المسؤول');
      }
      return n;
    }
    /* Valley Foods MO-only schema compatibility assertion. The formulas in
     * this module deliberately address operational columns by letter, so that
     * formula-addressed prefix must remain byte-identical. The MO header's
     * audit/status/approval/recipe tail is different: every one of those fields
     * is read and written by header name, so their order is not a write-safety
     * constraint. This matters for the live sheet, where recipe_id predates the
     * later status/approval columns. Missing, duplicated or blank required
     * columns still remain a proven pre-mutation refusal with an actionable
     * diff, as does any reorder inside a formula-addressed prefix.
     *
     * `scope` also keeps a list-page read/save independent of optional work-op
     * or by-product sheets that it does not own. No sheet/header is created or
     * mutated here. */
    function mfgAssertMfgSchema_(dbId, scope) {
      scope = Array.isArray(scope) && scope.length ? scope : MFG_DETAIL_SCOPE_;
      var expected = {};
      expected[MFG_ORDER_SHEET] = MFG_ORDER_HEADERS;
      if (scope.indexOf('outputs') !== -1 || scope.indexOf('consumption') !== -1) {
        expected[MFG_ORDER_PRODUCTS_SHEET] = MFG_OUTPUT_HEADERS;
        expected[MFG_CONSUMPTION_SHEET] = MFG_CONSUMPTION_HEADERS;
      }
      if (scope.indexOf('work_ops') !== -1) expected[MFG_WORKOPS_SHEET] = MFG_WORKOP_HEADERS;
      if (scope.indexOf('byproducts') !== -1) expected[MFG_BYPRODUCT_SHEET] = MFG_BYPRODUCT_HEADERS;
      var positionalPrefix = {};
      /* Preserve only the columns addressed positionally by formulas. Audit
         timestamps/users after those blocks are name-mapped and may appear in
         either order on legacy live sheets. */
      positionalPrefix[MFG_ORDER_SHEET] = 20;
      positionalPrefix[MFG_ORDER_PRODUCTS_SHEET] = 8;
      positionalPrefix[MFG_CONSUMPTION_SHEET] = 8;
      positionalPrefix[MFG_WORKOPS_SHEET] = 12;
      positionalPrefix[MFG_BYPRODUCT_SHEET] = 10;
      Object.keys(expected).forEach(function (name) {
        var sheet;
        try { sheet = getSheet_(name, dbId); } catch (e) { vfNotApplied_('البنية الأساسية ناقصة (الشيت ' + name + ' غير موجود) — حدّث الصفحة وأعد المحاولة'); }
        var have = getHeaders_(sheet).map(function (h) { return String(h).trim(); });
        /* Google Sheets can retain a physically-used but unnamed trailing
           column after an old edit/import. It is not part of the table
           contract and is harmless to the name-mapped reads/writes below.
           Ignore only blank cells at the very end; an interior blank remains
           a hard schema error because it can shift positional formulas. */
        while (have.length && !have[have.length - 1]) have.pop();
        var want = expected[name];
        var seen = {}, duplicates = [], blanks = [];
        have.forEach(function (h, i) {
          if (!h) blanks.push(String(i + 1));
          if (h && seen[h] && duplicates.indexOf(h) === -1) duplicates.push(h);
          if (h) seen[h] = true;
        });
        var missing = want.filter(function (h) { return have.indexOf(h) === -1; });
        var misplaced = [];
        var strictLength = positionalPrefix[name] || want.length;
        want.slice(0, strictLength).forEach(function (h, i) { if (have[i] !== h) misplaced.push(h + '@' + (i + 1)); });
        var prefixOk = have.length >= strictLength && !misplaced.length;
        if (!prefixOk || missing.length || duplicates.length || blanks.length) {
          var details = [];
          if (missing.length) details.push('ناقص: ' + missing.join(', '));
          if (misplaced.length) details.push('موضع غير صحيح: ' + misplaced.slice(0, 6).join(', '));
          if (duplicates.length) details.push('مكرر: ' + duplicates.join(', '));
          if (blanks.length) details.push('عناوين فارغة: ' + blanks.join(', '));
          vfNotApplied_('البنية الأساسية غير متطابقة (أعمدة ' + name + ') — ' + details.join('؛ ') + ' — راجع المسؤول قبل الحفظ');
        }
        if (have.length > want.length) {
          try { Logger.log('VF-MFG schema: safe trailing columns in ' + name + ': ' + have.slice(want.length).join(', ')); } catch (eLog) {}
        }
      });
    }
    /* Normalized persisted projection for one MO (scope-filtered). Shared by
     * the edit token and the desired-state comparator. Formulas, costs,
     * display labels, transport fields and volatile timestamps excluded. */
    function mfgCurrentMfgState_(dbId, moUid, scope) {
      var rows = [];
      try { rows = getAllRecords_(dbId, MFG_ORDER_SHEET); } catch (e) { rows = []; }
      var header = null;
      rows.forEach(function (r) { if (String(r.unique_id || '').trim() === String(moUid)) header = r; });
      if (!header) return null;
      var st = {
        header: {
          manufacture_date: mfgNormDateKey_(header.manufacture_date),
          operation_type: String(header.operation_type || '').trim(),
          shift: String(header.shift || '').trim(),
          produced_product: mfgNormPid_(header.produced_product),
          manufactured_qty: mfgNormQty_(header.manufactured_qty),
          actual_qty: (header.actual_qty === '' || header.actual_qty == null) ? 0 : mfgNormQty_(header.actual_qty),
          recipe_id: String(header.recipe_id || '').trim(),
          manufacture_batch: String(header.manufacture_batch == null ? '' : header.manufacture_batch).trim(),
          mo_status: String(header.mo_status || 'Draft')
        },
        outputs: []
      };
      if (scope.indexOf('outputs') !== -1 || scope.indexOf('consumption') !== -1) {
        var outs = [];
        try {
          getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (o) {
            if (String(o.valley_manufacture_header_id || '').trim() === String(moUid)) outs.push(o);
          });
        } catch (e) {}
        var footByParent = {};
        try {
          getAllRecords_(dbId, MFG_CONSUMPTION_SHEET).forEach(function (cm) {
            var ref = String(cm.valley_manufacture_header_product_id || '').trim();
            if (!ref) return;
            if (!footByParent[ref]) footByParent[ref] = [];
            footByParent[ref].push(cm);
          });
        } catch (e) {}
        outs.forEach(function (o) {
          var ouid = String(o.unique_id || '').trim();
          var feet = (footByParent[ouid] || []).map(function (f) {
            return { uid: String(f.unique_id || '').trim(), item: String(f.item || '').trim(), qty: mfgNormQty_(f.qty) };
          }).sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
          st.outputs.push({ uid: ouid, product_id: String(o.product_id == null ? '' : o.product_id).trim(), qty: mfgNormQty_(o.product_qty), footers: feet });
        });
        st.outputs.sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
      }
      if (scope.indexOf('work_ops') !== -1) {
        var wops = [];
        try {
          getAllRecords_(dbId, MFG_WORKOPS_SHEET).forEach(function (r) {
            if (String(r.valley_manufacture_header_id || '').trim() === String(moUid)) {
              wops.push({ uid: String(r.unique_id || '').trim(), wc: String(r.recipe_id == null ? '' : r.recipe_id).trim(), st: String(r.operation_status || 'Pending').trim(), notes: String(r.notes || '').trim(), hrs: (r.actual_hours === '' || r.actual_hours == null) ? '' : mfgNormQty_(r.actual_hours) });
            }
          });
        } catch (e) {}
        wops.sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
        st.work_ops = wops;
      }
      if (scope.indexOf('byproducts') !== -1) {
        var bps = [];
        try {
          getAllRecords_(dbId, MFG_BYPRODUCT_SHEET).forEach(function (r) {
            if (String(r.valley_manufacture_header_id || '').trim() === String(moUid)) {
              bps.push({ uid: String(r.unique_id || '').trim(), item: String(r.item || '').trim(), qty: mfgNormQty_(r.qty) });
            }
          });
        } catch (e) {}
        bps.sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
        st.byproducts = bps;
      }
      return st;
    }
    /* Schema-free edit token: hash of the canonical persisted projection. No
     * version stored in any business sheet. */
    function mfgEditToken_(dbId, moUid, scope) {
      var st = mfgCurrentMfgState_(dbId, moUid, scope);
      if (!st) return '';
      return mfgHash_(mfgCanonical_({ scope: scope.slice().sort(), state: st }));
    }
    /* Resolve every payload row to its authoritative UID: supplied existing
     * UIDs kept, genuinely new rows mapped to deterministic UIDs when the
     * request ID is known. The SAME enumerator feeds the comparator and the
     * mutation so a retry converges on identical rows. */
    function mfgAssignDesiredUids_(d, moUid, requestId, scope) {
      var req = String(requestId || '');
      var outputs = (Array.isArray(d.outputs) ? d.outputs : [])
        .filter(function (o) { return o && String(o.product_id || '').trim(); })
        .map(function (o) { return o; });
      var nOut = 0, nFoot = 0;
      var outList = outputs.map(function (o) {
        var ouid = String(o.uid || '').trim();
        if (!ouid && req) ouid = mfgDeterministicUid_(req, moUid, 'output', nOut);
        if (!ouid) nOut++;
        else if (!String(o.uid || '').trim()) nOut++;
        var feet = (Array.isArray(o.footers) ? o.footers : [])
          .filter(function (f) { return f && String(f.item || '').trim(); })
          .map(function (f) {
            var fuid = String(f.uid || '').trim();
            if (!fuid && req) fuid = mfgDeterministicUid_(req, moUid, 'footer', nFoot);
            nFoot++;
            return { uid: fuid, item: String(f.item || '').trim(), qty: mfgNormQty_(f.qty) };
          })
          .sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
        return { uid: ouid, product_id: String(o.product_id || '').trim(), qty: mfgNormQty_(o.qty), footers: feet };
      });
      outList.sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
      var want = {
        header: {
          manufacture_date: mfgNormDateKey_(d.manufacture_date),
          operation_type: String(d.operation_type || '').trim(),
          shift: String(d.shift || '').trim(),
          produced_product: mfgNormPid_(d.produced_product_id),
          manufactured_qty: mfgNormQty_(d.manufactured_qty),
          actual_qty: (d.actual_qty === '' || d.actual_qty == null) ? 0 : mfgNormQty_(d.actual_qty),
          recipe_id: String(d.recipe_id || '').trim(),
          manufacture_batch: String(d.manufacture_batch == null ? '' : d.manufacture_batch).trim(),
          mo_status: String(d.mo_status || 'Draft')
        },
        outputs: (scope.indexOf('outputs') !== -1 || scope.indexOf('consumption') !== -1) ? outList : []
      };
      if (scope.indexOf('work_ops') !== -1 && Array.isArray(d.work_ops)) {
        var nWo = 0;
        want.work_ops = d.work_ops.map(function (w) {
          var u = String((w && w.uid) || '').trim();
          if (!u && req) u = mfgDeterministicUid_(req, moUid, 'work_op', nWo);
          nWo++;
          return { uid: u, wc: String((w && w.work_center_id) || '').trim(), st: String((w && w.operation_status) || 'Pending').trim(), notes: String((w && w.notes) || '').trim(), hrs: (w && (w.actual_hours === '' || w.actual_hours == null)) ? '' : mfgNormQty_(w && w.actual_hours) };
        }).sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
      }
      if (scope.indexOf('byproducts') !== -1 && Array.isArray(d.byproducts)) {
        var nBp = 0;
        want.byproducts = d.byproducts.map(function (b) {
          var u = String((b && b.uid) || '').trim();
          if (!u && req) u = mfgDeterministicUid_(req, moUid, 'by_product', nBp);
          nBp++;
          return { uid: u, item: String((b && b.item) || '').trim(), qty: mfgNormQty_(b && b.qty) };
        }).sort(function (a, b) { return a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0); });
      }
      return want;
    }
    /* Exact server-authoritative desired-state comparison for the supplied
     * scope. Formula results and client costs never compared. */
    function mfgDesiredMatches_(dbId, moUid, d, scope, requestId) {
      var cur = mfgCurrentMfgState_(dbId, moUid, scope);
      if (!cur) return { match: false, reason: 'missing' };
      var want = mfgAssignDesiredUids_(d, moUid, requestId, scope);
      var keys = ['manufacture_date', 'operation_type', 'shift', 'produced_product', 'manufactured_qty', 'actual_qty', 'recipe_id', 'manufacture_batch', 'mo_status'];
      for (var ki = 0; ki < keys.length; ki++) {
        var k = keys[ki];
        if (String(cur.header[k]) !== String(want.header[k])) return { match: false, reason: 'header.' + k };
      }
      var cmpOut = function (a, b) {
        if (a.uid !== b.uid || a.product_id !== b.product_id || String(a.qty) !== String(b.qty)) return false;
        if ((a.footers || []).length !== (b.footers || []).length) return false;
        for (var i = 0; i < a.footers.length; i++) {
          var fa = a.footers[i], fb = b.footers[i];
          if (fa.uid !== fb.uid || fa.item !== fb.item || String(fa.qty) !== String(fb.qty)) return false;
        }
        return true;
      };
      if ((cur.outputs || []).length !== (want.outputs || []).length) return { match: false, reason: 'outputs.count' };
      for (var oi = 0; oi < want.outputs.length; oi++) {
        if (!cmpOut(cur.outputs[oi], want.outputs[oi])) return { match: false, reason: 'outputs.' + oi };
      }
      if (want.work_ops) {
        var cw = cur.work_ops || [];
        if (cw.length !== want.work_ops.length) return { match: false, reason: 'work_ops.count' };
        for (var wi = 0; wi < want.work_ops.length; wi++) {
          var wa = cw[wi], wb = want.work_ops[wi];
          if (wa.uid !== wb.uid || wa.wc !== wb.wc || wa.st !== wb.st || wa.notes !== wb.notes || String(wa.hrs) !== String(wb.hrs)) return { match: false, reason: 'work_ops.' + wi };
        }
      }
      if (want.byproducts) {
        var cb = cur.byproducts || [];
        if (cb.length !== want.byproducts.length) return { match: false, reason: 'byproducts.count' };
        for (var bi = 0; bi < want.byproducts.length; bi++) {
          var ba = cb[bi], bb = want.byproducts[bi];
          if (ba.uid !== bb.uid || ba.item !== bb.item || String(ba.qty) !== String(bb.qty)) return { match: false, reason: 'byproducts.' + bi };
        }
      }
      return { match: true, reason: 'exact' };
    }
    /* Plain (uncertain, NOT notApplied) refusal carrying recovery evidence.
     * Used only after the not-applied gate has passed or when state is
     * genuinely ambiguous: zero business writes must have happened. */
    function mfgReviewRequired_(message, recovery) {
      var e = new Error(message);
      e.recovery = recovery || null;
      throw e;
    }
    /* Same-request recovery entry. Returns a recovered-success response, or
     * null when the repeat-safe mutation path must run. Throws (notApplied
     * for proven refusals, plain review-required for ambiguity) with zero
     * business writes in all refusal paths. */
    function mfgRecoverSameRequest_(data, user, dbId, guard, d, scope, editing, targetUid) {
      var reqId = String((guard && guard.requestId) || '');
      var prior = (guard && guard.priorRecovery) || null;
      if (targetUid && guard && typeof guard.findOpenEntity === 'function') {
        var other = '';
        try { other = guard.findOpenEntity('save_valley_mfg_order', targetUid); } catch (e) { other = ''; }
        if (other) vfNotApplied_('يوجد طلب آخر غير مؤكد لنفس أمر التصنيع (' + other + '). راجع السجل قبل إعادة الحفظ.');
      }
      if (!prior) {
        /* Legacy receipt (pre-checkpoint code, incl. the reported request):
           recover only on exact desired-state proof, else stay review-required
           with no business write. */
        if (editing) {
          var cmp;
          try { cmp = mfgDesiredMatches_(dbId, targetUid, d, scope, reqId); } catch (e) { cmp = { match: false, reason: 'read' }; }
          if (cmp.match) return { status: 'success', message: 'تمت مطابقة الحفظ السابق', mo_uid: targetUid, recovered: true };
        }
        mfgReviewRequired_('نتيجة الطلب غير مؤكدة وتتطلب مراجعة المسؤول. لا تنشئ طلبًا بديلًا؛ رقم الطلب: ' + reqId, null);
      }
      if (String(prior.type || '') !== 'vf_mfg_order_save_v1') mfgReviewRequired_('بيانات الاسترداد غير صالحة — يلزم مراجعة المسؤول. رقم الطلب: ' + reqId, prior);
      if (String(prior.request_id || '') !== reqId) mfgReviewRequired_('بيانات الاسترداد لا تخص هذا الطلب — يلزم مراجعة المسؤول. رقم الطلب: ' + reqId, prior);
      if (guard && guard.payloadHash && prior.payload_hash && String(prior.payload_hash) !== String(guard.payloadHash)) mfgReviewRequired_('بيانات الاسترداد لا تطابق محتوى الطلب — يلزم مراجعة المسؤول. رقم الطلب: ' + reqId, prior);
      if (String(prior.mo_uid || '') !== String(targetUid)) mfgReviewRequired_('بيانات الاسترداد تخص أمر تصنيع مختلف — يلزم مراجعة المسؤول. رقم الطلب: ' + reqId, prior);
      var cmp2;
      try { cmp2 = mfgDesiredMatches_(dbId, targetUid, d, scope, reqId); } catch (e) { cmp2 = { match: false, reason: 'read' }; }
      if (cmp2.match) return { status: 'success', message: 'تمت مطابقة الحفظ السابق', mo_uid: targetUid, recovered: true };
      return null;
    }
    /* Super-admin read-only diagnostic: receipt + envelope + current token +
     * child counts/duplicates/parent links + formula/total checks +
     * classification. Never mutates. */
    function getValleyMfgRequestDiagnosis_(data, user, dbId) {
      requireSuperAdmin_(user);
      var d = data || {};
      var reqId = String(d.request_id || '').trim();
      var moUid = String(d.mo_uid || '').trim();
      if (!reqId) throw new Error('request_id مطلوب');
      var receipts = [];
      try { receipts = getAllRecords_(dbId, 'ERP_Request_Receipts'); } catch (e) { receipts = []; }
      var found = null;
      receipts.forEach(function (r) {
        if (String(r.request_id || '') === reqId && String(r.module_action || '') === 'save_valley_mfg_order') found = r;
      });
      var envelope = null, receiptInfo = null;
      if (found) {
        receiptInfo = { request_id: String(found.request_id || ''), user_email: String(found.user_email || ''), module_action: String(found.module_action || ''), payload_hash: String(found.payload_hash || ''), state: String(found.state || ''), created_at: String(found.created_at || ''), updated_at: String(found.updated_at || '') };
        try {
          var body = JSON.parse(String(found.response_json || ''));
          if (body && body.recovery && typeof body.recovery === 'object') envelope = body.recovery;
        } catch (e) {}
      }
      var scope = MFG_DETAIL_SCOPE_;
      var token = moUid ? mfgEditToken_(dbId, moUid, scope) : '';
      var counts = { outputs: 0, footers: 0, workops: 0, byproducts: 0, dupUid: 0, orphanFooter: 0 };
      var seen = {};
      if (moUid) {
        try {
          var outUids = {};
          getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (o) {
            if (String(o.valley_manufacture_header_id || '').trim() !== moUid) return;
            counts.outputs++;
            var u = String(o.unique_id || '').trim();
            if (!u || seen['o' + u]) counts.dupUid++;
            seen['o' + u] = true;
            outUids[u] = true;
          });
          getAllRecords_(dbId, MFG_CONSUMPTION_SHEET).forEach(function (cm) {
            var ref = String(cm.valley_manufacture_header_product_id || '').trim();
            if (!ref || (ref !== moUid && !outUids[ref])) return;
            counts.footers++;
            var u2 = String(cm.unique_id || '').trim();
            if (!u2 || seen['c' + u2]) counts.dupUid++;
            seen['c' + u2] = true;
            if (!outUids[ref] && ref !== moUid) counts.orphanFooter++;
          });
          getAllRecords_(dbId, MFG_WORKOPS_SHEET).forEach(function (r) {
            if (String(r.valley_manufacture_header_id || '').trim() === moUid) counts.workops++;
          });
          getAllRecords_(dbId, MFG_BYPRODUCT_SHEET).forEach(function (r) {
            if (String(r.valley_manufacture_header_id || '').trim() === moUid) counts.byproducts++;
          });
        } catch (e) {}
      }
      var classification = 'manual_review';
      if (!found) classification = 'unknown_request';
      else if (String(found.state) === 'done') classification = 'completed';
      else if (String(found.state) === 'failed') classification = 'not_applied';
      else if (envelope) classification = 'resumable';
      return { status: 'success', receipt: receiptInfo, recovery: envelope, edit_token: token, save_scope: scope, counts: counts, classification: classification };
    }

    function saveValleyMfgOrder_(data, user, dbId, guardCtx) {

    var d = data || {};
    var guard = guardCtx || {};
    var reqId = String(guard.requestId || '');
    var scope = mfgScopeFor_(d);
    var recoveredResp = null;
    var isSuperAdmin = !!(user && user.isSuperAdmin);
    var editing = !!(d.mo_uid && String(d.mo_uid).trim());
    /* declared here, not inside executeWithLock_: the success return below needs it */
    var moUid;
    /* POLICY: add = page-write authority; edit existing = any writer, UNLESS the MO is Locked
       (Locked MOs are immutable and require super-admin unlock — enforced below at save time). */

    /* Pre-mutation validation. Every refusal below happens before any
       business-row write, so each is a proven not-applied outcome (failed
       receipt: safe to correct and retry), never an uncertain trap. */
    if (!d.manufacture_date) vfNotApplied_('تاريخ التصنيع مطلوب');
    var moDate = parseDate_(d.manufacture_date);
    if (!moDate) vfNotApplied_('تاريخ التصنيع غير صالح');
    moDate = new Date(moDate.getFullYear(), moDate.getMonth(), moDate.getDate()); /* date-only, strip time component */
    var opType = String(d.operation_type || '').trim();
    if (MFG_OP_TYPES.indexOf(opType) === -1) vfNotApplied_('نوع العملية مطلوب');
    var shift = String(d.shift || '').trim();
    if (MFG_SHIFTS.indexOf(shift) === -1) vfNotApplied_('الوردية مطلوبة');
    var producedPid = String(d.produced_product_id || '').trim();
    if (!producedPid) vfNotApplied_('المنتج المنتج مطلوب');
    var MFG_YIELD_FACTOR = 0.65;
    var manufacturedQty = Number(d.manufactured_qty);
    if (d.manufactured_qty === '' || d.manufactured_qty == null || isNaN(manufacturedQty) || manufacturedQty < 0) vfNotApplied_('كمية الخام الداخلة مطلوبة');
    var expectedQty = Math.round(manufacturedQty * MFG_YIELD_FACTOR * 1000) / 1000;
    if (!isFinite(expectedQty) || expectedQty <= 0) vfNotApplied_('كمية الخام الداخلة يجب أن تكون أكبر من صفر (الكمية المتوقعة = الخام × 0.65)');
    var recipeUid = String(d.recipe_id || '').trim();
    var outputs = Array.isArray(d.outputs) ? d.outputs.filter(function (o) { return o && String(o.product_id || '').trim(); }) : [];
    /* UI "add" buttons create temporary placeholder rows. A stale or older
       client may still submit one without a selected work centre/product;
       normalize those placeholders out before recovery comparison, ownership
       checks or persistence so they can never become null business rows. The
       array keys remain present, preserving the detail page's explicit section
       scope and remove-all semantics. */
    if (Array.isArray(d.work_ops)) {
      d.work_ops = d.work_ops.filter(function (w) { return w && String(w.work_center_id || '').trim(); });
    }
    if (Array.isArray(d.byproducts)) {
      d.byproducts = d.byproducts.filter(function (b) { return b && String(b.item || '').trim(); });
    }
    var deletedOutUids = mfgDeletedUids_(d, 'outputs');
    var deletedConsUids = mfgDeletedUids_(d, 'consumption');
    var deletedWoUids = mfgDeletedUids_(d, 'work_ops');
    var deletedBpUids = mfgDeletedUids_(d, 'byproducts');
    try { Logger.log('MFGTRACE payload: outputs_raw=' + (Array.isArray(d.outputs) ? d.outputs.length : 'NA') + ' outputs_kept=' + outputs.length + ' consumption_raw=' + (Array.isArray(d.consumption) ? d.consumption.length : 'NA') + ' work_ops=' + (Array.isArray(d.work_ops) ? d.work_ops.length : 'NA') + ' byproducts=' + (Array.isArray(d.byproducts) ? d.byproducts.length : 'NA') + ' mo_uid=' + String(d.mo_uid || '')); } catch (eLg) {}
    if (!outputs.length) vfNotApplied_('أضف منتج ناتج واحد على الأقل');
      var consumption = Array.isArray(d.consumption) ? d.consumption.filter(function (cm) { return cm && String(cm.batch_uid || '').trim() && Number(cm.qty || 0) > 0; }) : [];
      var hasFooters = outputs.some(function (o) { return Array.isArray(o.footers) && o.footers.some(function (f) { return String(f.item || '').trim(); }); });
      if (!consumption.length && !hasFooters) vfNotApplied_('خصص استهلاك الخامات من الدفعات أولاً');

    /* Read-only, scope-aware schema gate for this Valley Foods MO save. It
       requires the canonical positional prefix and permits safe trailing
       columns. It never creates schema; a missing/misplaced header is a proven
       pre-mutation refusal. Runs inside the lock before any business write. */

    executeWithLock_(function () {
      mfgAssertMfgSchema_(dbId, scope);
      /* Defensive: requested batch qty may not exceed the balance in
         valley_current_products, which is now the ONLY guard on the batch. It runs
         INSIDE the lock: outside it, two concurrent saves both read the same
         balance, both pass, and both write. It still runs before the first row is
         written, so a violation aborts cleanly with no orphan header. */
      (function assertFooterBalances_() {
        var needByBatch = {};
        var needOutByBatch = {}, needConsByBatch = {};
        function need_(buid, q, isOut) {
          buid = String(buid || '').trim(); q = Number(q) || 0;
          if (buid && q > 0) {
            needByBatch[buid] = Math.round(((needByBatch[buid] || 0) + q) * 1000) / 1000;
            var src = isOut ? needOutByBatch : needConsByBatch;
            src[buid] = Math.round(((src[buid] || 0) + q) * 1000) / 1000;
          }
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
            vfNotApplied_('مجموع الدفعات للصنف (' + (nameMap[opid] || opid || '?') + ') يجب أن يساوي كمية البند. مجموع الدفعات: ' + paySum + '، الكمية: ' + payQty);
          }
          /* numbers are stored exactly as sent — no rounding-up into any row */
          rows.forEach(function (r) { need_(r.batch, r.qty, true); });
        });
        (Array.isArray(consumption) ? consumption : []).forEach(function (cm) { need_(cm.batch_uid, cm.qty, false); });
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
            vfNotApplied_('الكمية المطلوبة من الدفعة (' + label + ') تتجاوز المتاح. المطلوب: ' + needByBatch[buid] + ' (مخرجات: ' + (needOutByBatch[buid] || 0) + ' + استهلاك: ' + (needConsByBatch[buid] || 0) + ')، المتاح: ' + avail);
          }
        });
      })();

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
              vfNotApplied_('أمر التصنيع مقفل — قم بفتح القفل أولاً');
            }
            break;
          }
        }
        if (!moNumberId) vfNotApplied_('أمر التصنيع غير موجود');
      } else {
        /* Genuinely new MO: the UID is deterministic per request ID, so a
           same-request retry re-binds the same row instead of duplicating it. */
        moUid = reqId ? mfgDeterministicUid_(reqId, 'new', 'mo', 0) : uid16Hex_();
        moNumberId = null;
        for (var r0n = 1; r0n < moDataAll.length; r0n++) {
          if (String(moDataAll[r0n][uidIdx]).trim() === moUid) {
            moNumberId = Number(moDataAll[r0n][idIdx]);
            editing = true;
            break;
          }
        }
        if (!moNumberId) moNumberId = mfgNextIntegerId_(dbId, MFG_ORDER_SHEET);
      }
      try { Logger.log('MFGTRACE resolved: moUid=' + moUid + ' editing=' + editing + ' dbId=' + String(dbId).slice(0, 8) + '…'); } catch (eLg2) {}

      var ckpt_ = function (stage) {
        if (guard.checkpoint) guard.checkpoint({ type: 'vf_mfg_order_save_v1', mo_uid: moUid, base_token: String(d.base_token || ''), scope: scope, stage: stage });
      };

      /* Same-request recovery: reconciles without a business write when the
         desired state is already present, else falls through to the
         repeat-safe mutation below. Refusals here write nothing. */
      if (guard.recovering) {
        var recResp = mfgRecoverSameRequest_(data, user, dbId, guard, d, scope, editing, moUid);
        if (recResp) { recoveredResp = recResp; return; }
      }

      /* Schema-free optimistic concurrency on existing-MO edits. Skipped for
         new MOs and for recovery resumes (the envelope + desired-state
         comparison govern there). A mismatch is proven pre-mutation. */
      if (editing && !guard.recovering) {
        var baseToken = String(d.base_token || '').trim();
        if (!baseToken) vfNotApplied_('الجلسة قديمة — حدّث الصفحة وأعد تحميل أمر التصنيع قبل الحفظ');
        var curTok = mfgEditToken_(dbId, moUid, scope);
        if (curTok && baseToken !== curTok) {
          var ve = new Error('تغيّرت بيانات أمر التصنيع على الخادم — حدّث الصفحة وراجع تعديلاتك قبل الحفظ');
          ve.notApplied = true; ve.code = 'VERSION_CONFLICT';
          throw ve;
        }
      }

      /* Child-ownership gate: every supplied existing UID must already belong
         to this MO. Explicit deletion UIDs obey the same rule on the first
         attempt. During a validated recovery they may already be absent (or a
         footer may be orphaned because its explicitly deleted parent output
         was removed before the interruption), but a UID currently owned by a
         different MO is still always refused. */
      (function assertMfgOwnership_() {
        var wantOut = {}, wantFoot = {}, wantWo = {}, wantBp = {};
        outputs.forEach(function (o) {
          var u = String(o.uid || '').trim();
          if (u) wantOut[u] = true;
          (Array.isArray(o.footers) ? o.footers : []).forEach(function (f) {
            var fu = String(f.uid || '').trim();
            if (fu) wantFoot[fu] = true;
          });
        });
        (Array.isArray(d.work_ops) ? d.work_ops : []).forEach(function (w) {
          var u = String((w && w.uid) || '').trim();
          if (u) wantWo[u] = true;
        });
        (Array.isArray(d.byproducts) ? d.byproducts : []).forEach(function (b) {
          var u = String((b && b.uid) || '').trim();
          if (u) wantBp[u] = true;
        });
        if (!Object.keys(wantOut).length && !Object.keys(wantFoot).length && !Object.keys(wantWo).length && !Object.keys(wantBp).length &&
            !deletedOutUids.length && !deletedConsUids.length && !deletedWoUids.length && !deletedBpUids.length) return;
        var haveOut = {}, haveFoot = {}, haveWo = {}, haveBp = {};
        var allOutOwner = {}, allFootOwner = {}, allFootOrphan = {}, allWoOwner = {}, allBpOwner = {};
        try {
          getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (r) {
            var u = String(r.unique_id || '').trim();
            var owner = String(r.valley_manufacture_header_id || '').trim();
            if (!u) return;
            allOutOwner[u] = owner;
            if (owner === moUid) haveOut[u] = true;
          });
        } catch (e) {}
        try {
          getAllRecords_(dbId, MFG_CONSUMPTION_SHEET).forEach(function (r) {
            var u = String(r.unique_id || '').trim();
            var ref = String(r.valley_manufacture_header_product_id || '').trim();
            if (!u) return;
            var owner = ref === moUid ? moUid : String(allOutOwner[ref] || '');
            allFootOwner[u] = owner;
            allFootOrphan[u] = !!(ref && ref !== moUid && !allOutOwner[ref]);
            if (owner === moUid) haveFoot[u] = true;
          });
        } catch (e) {}
        try {
          getAllRecords_(dbId, MFG_WORKOPS_SHEET).forEach(function (r) {
            var u = String(r.unique_id || '').trim();
            var owner = String(r.valley_manufacture_header_id || '').trim();
            if (!u) return;
            allWoOwner[u] = owner;
            if (owner === moUid) haveWo[u] = true;
          });
        } catch (e) {}
        try {
          getAllRecords_(dbId, MFG_BYPRODUCT_SHEET).forEach(function (r) {
            var u = String(r.unique_id || '').trim();
            var owner = String(r.valley_manufacture_header_id || '').trim();
            if (!u) return;
            allBpOwner[u] = owner;
            if (owner === moUid) haveBp[u] = true;
          });
        } catch (e) {}
        Object.keys(wantOut).forEach(function (u) { if (!haveOut[u]) vfNotApplied_('بند ناتج غير تابع لأمر التصنيع — حدّث الصفحة وأعد المحاولة'); });
        Object.keys(wantFoot).forEach(function (u) { if (!haveFoot[u]) vfNotApplied_('بند استهلاك غير تابع لأمر التصنيع — حدّث الصفحة وأعد المحاولة'); });
        Object.keys(wantWo).forEach(function (u) { if (!haveWo[u]) vfNotApplied_('عملية تشغيل غير تابعة لأمر التصنيع — حدّث الصفحة وأعد المحاولة'); });
        Object.keys(wantBp).forEach(function (u) { if (!haveBp[u]) vfNotApplied_('منتج ثانوي غير تابع لأمر التصنيع — حدّث الصفحة وأعد المحاولة'); });
        function assertDelete_(uids, owned, allOwner, message, orphanMap) {
          uids.forEach(function (u) {
            if (owned[u]) return;
            /* mfgRecoverSameRequest_ has already authenticated the persisted
               request/payload/MO envelope before this point. */
            if (guard.recovering && (!Object.prototype.hasOwnProperty.call(allOwner, u) || (orphanMap && orphanMap[u]))) return;
            vfNotApplied_(message);
          });
        }
        assertDelete_(deletedOutUids, haveOut, allOutOwner, 'بند ناتج غير تابع لأمر التصنيع — حدّث الصفحة وأعد المحاولة');
        assertDelete_(deletedConsUids, haveFoot, allFootOwner, 'بند استهلاك غير تابع لأمر التصنيع — حدّث الصفحة وأعد المحاولة', allFootOrphan);
        assertDelete_(deletedWoUids, haveWo, allWoOwner, 'عملية تشغيل غير تابعة لأمر التصنيع — حدّث الصفحة وأعد المحاولة');
        assertDelete_(deletedBpUids, haveBp, allBpOwner, 'منتج ثانوي غير تابع لأمر التصنيع — حدّث الصفحة وأعد المحاولة');
        outputs.forEach(function (o) {
          var ou = String(o.uid || '').trim();
          if (ou && deletedOutUids.indexOf(ou) !== -1) vfNotApplied_('لا يمكن تحديث وحذف بند الناتج نفسه في طلب واحد');
          (Array.isArray(o.footers) ? o.footers : []).forEach(function (f) {
            var fu = String(f.uid || '').trim();
            if (fu && deletedConsUids.indexOf(fu) !== -1) vfNotApplied_('لا يمكن تحديث وحذف بند الدفعة نفسه في طلب واحد');
          });
        });
        (Array.isArray(d.work_ops) ? d.work_ops : []).forEach(function (w) {
          var wu = String((w && w.uid) || '').trim();
          if (wu && deletedWoUids.indexOf(wu) !== -1) vfNotApplied_('لا يمكن تحديث وحذف عملية التشغيل نفسها في طلب واحد');
        });
        (Array.isArray(d.byproducts) ? d.byproducts : []).forEach(function (b) {
          var bu = String((b && b.uid) || '').trim();
          if (bu && deletedBpUids.indexOf(bu) !== -1) vfNotApplied_('لا يمكن تحديث وحذف المنتج الثانوي نفسه في طلب واحد');
        });
      })();

      /* A different unresolved request for this MO blocks before mutation. */
      if (!guard.recovering && guard.findOpenEntity) {
        var otherReq = '';
        try { otherReq = guard.findOpenEntity('save_valley_mfg_order', moUid); } catch (e) { otherReq = ''; }
        if (otherReq) vfNotApplied_('يوجد طلب غير مؤكد لنفس أمر التصنيع (' + otherReq + ') — راجع السجل قبل إعادة الحفظ');
      }

      /* Validated checkpoint BEFORE the first business-row write: a checkpoint
         failure here still means zero business writes. */
      ckpt_('validated');

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
            /* Formula-safe, name-based patch. Never rewrite the full row:
               doing so converts unknown trailing formulas to values. Identity
               and creation fields are immutable for an existing MO. */
            var headerPatch = {};
            Object.keys(map).forEach(function (k) {
              if (k === 'unique_id' || k === 'id' || k === 'created_at') return;
              headerPatch[k] = map[k];
            });
            try {
              if (typeof _stampExistingAuditCols_ === 'function') {
                _stampExistingAuditCols_(sheetMo, headerPatch, {
                  user: (user && user.email) || '',
                  updated_by: (user && user.email) || '',
                  updated_at: new Date()
                });
              }
            } catch (eStamp) {}
            if (!patchRowByCriteria_(sheetMo, 'unique_id', moUid, headerPatch)) vfNotApplied_('أمر التصنيع غير موجود');
            var newObj = Object.assign({}, oldObj, headerPatch);
            var oldUid = oldObj.record_uid || ('upd_' + MFG_ORDER_SHEET + '_' + moUid);
            try { logHistory_(dbId, MFG_ORDER_SHEET, oldUid, moUid, (user && user.email) || '', 'update', newObj, oldObj); } catch (eHist) {}
            newRow = rr + 1;
            break;
          }
        }
      } else {
        /* Already inside the MO save lock and `moNumberId` is the validated
           max+1 integer. Do not route through addRecord_, which owns a second
           allocator and would skip an ID. */
        map['record_uid'] = 'rec_' + Utilities.getUuid();
        try {
          if (typeof _stampExistingAuditCols_ === 'function') {
            _stampExistingAuditCols_(sheetMo, map, {
              user: (user && user.email) || '',
              created_by: (user && user.email) || '', created_at: map['created_at'],
              updated_by: (user && user.email) || '', updated_at: map['created_at'],
              record_uid: map['record_uid']
            });
          }
        } catch (eStampNew) {}
        rowVals = moHeaders.map(function (h) { var k = String(h).trim(); return map[k] !== undefined ? map[k] : ''; });
        newRow = sheetMo.getLastRow() + 1;
        ensureGridRows_(sheetMo, newRow);
        sheetMo.getRange(newRow, 1, 1, moHeaders.length).setValues([rowVals]);
        noteMutation_(sheetMo);
        try { logHistory_(dbId, MFG_ORDER_SHEET, map.record_uid, moUid, (user && user.email) || '', 'create', map, null); } catch (eHistNew) {}
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
      ckpt_('header');

      /* STABLE UPSERT outputs: a row the client sends back with its uid is
         patched in place (id/unique_id/created_at never touched — even a blank
         id stays blank); a row without uid is created with fresh uid + max+1
         id; persisted rows are deleted only through deleted_uids. */
      var existingOutByUid = {};
      try {
        getAllRecords_(dbId, MFG_ORDER_PRODUCTS_SHEET).forEach(function (eo) {
          if (String(eo.valley_manufacture_header_id || '').trim() === moUid) existingOutByUid[String(eo.unique_id).trim()] = eo;
        });
      } catch (e) {}
      var existingOutUids = Object.keys(existingOutByUid);
      var sheetOut = getSheet_(MFG_ORDER_PRODUCTS_SHEET, dbId);
      var outHeaders = getHeaders_(sheetOut);
      var prodNameMap = {};
      try {
        getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) { prodNameMap[String(p.id)] = String(p.name_ar || ''); });
      } catch (e5) {}
      var outputUidMap = {};
      var keepOutUids = [];
      var outNewRows = [];
      /* MFG_BATCH_WRITES_: existing output rows are collected here and written
         by ONE batched call after the loop, instead of one whole-sheet read per
         row inside it. The rows written, their values and their order are
         unchanged. */
      var mfgFast = fastSaveOnFor_(MFG_BATCH_WRITES_);
      var outPatches = {};
      /* nOutNew enumerates uid-less outputs in payload order — the identical
         enumeration mfgAssignDesiredUids_ uses, so a retry recomputes the same
         deterministic UID for the same row. */
      var nOutNew = 0;
      outputs.forEach(function (o, oi) {
        var suppliedUid = String(o.uid || '').trim();
        var ouid = suppliedUid;
        var oldOut = ouid ? existingOutByUid[ouid] : null;
        var detIdx = -1;
        if (!suppliedUid) detIdx = nOutNew++;
        if (!oldOut && detIdx !== -1 && reqId) {
          var detO = mfgDeterministicUid_(reqId, moUid, 'output', detIdx);
          if (existingOutByUid[detO]) { ouid = detO; oldOut = existingOutByUid[detO]; }
        }
        if (oldOut) {
          var m6u = {};
          m6u['product_id'] = String(o.product_id).trim();
          m6u['product_name'] = prodNameMap[String(o.product_id)] || '';
          m6u['product_qty'] = Math.round((Number(o.qty) || 0) * 1000) / 1000;
          m6u['user'] = (user && user.email) || '';
          /* cost columns are sheet formulas — patchRowByCriteria_ preserves
             live formula cells; only fill plain cells when the client sent one */
          if (o.cost_unit !== '' && o.cost_unit != null) m6u['cost_unit'] = o.cost_unit;
          if (o.total_cost !== '' && o.total_cost != null) m6u['total_cost'] = o.total_cost;
          if (mfgFast) outPatches[ouid] = m6u;
          else patchRowByCriteria_(sheetOut, 'unique_id', ouid, m6u);
          outputUidMap[oi] = ouid;
          keepOutUids.push(ouid);
        } else {
          var outUid = (detIdx !== -1 && reqId) ? mfgDeterministicUid_(reqId, moUid, 'output', detIdx) : uid16Hex_();
          outputUidMap[oi] = outUid;
          var m6 = {};
          m6['unique_id'] = outUid;
          m6['id'] = mfgNextIntegerId_(dbId, MFG_ORDER_PRODUCTS_SHEET);
          m6['valley_manufacture_header_id'] = moUid;
          m6['product_id'] = String(o.product_id).trim();
          m6['product_name'] = prodNameMap[String(o.product_id)] || '';
          m6['product_qty'] = Math.round((Number(o.qty) || 0) * 1000) / 1000;
          m6['cost_unit'] = o.cost_unit != null ? o.cost_unit : '';
          m6['total_cost'] = o.total_cost != null ? o.total_cost : '';
          m6['user'] = (user && user.email) || '';
          m6['created_at'] = new Date();
          outNewRows.push(outHeaders.map(function (h) {
            var k = String(h).trim();
            return m6[k] !== undefined ? m6[k] : '';
          }));
          keepOutUids.push(outUid);
        }
      });
      if (mfgFast && Object.keys(outPatches).length) {
        fsPatchRowsByKey_(dbId, sheetOut, 'unique_id', outPatches);
      }
      var outStart = sheetOut.getLastRow() + 1;
      try { Logger.log('MFGTRACE outputs upsert: kept=' + keepOutUids.length + ' new=' + outNewRows.length + ' explicit_delete=' + deletedOutUids.length + ' tab=' + sheetOut.getName()); } catch (eLg3) {}
      if (outNewRows.length) {
        /* Phase 8 (F-04): was one setValues followed by 2 writeFormula_ PER ROW.
         * The formulas are merged into the same block write, so a 5-output order
         * goes from 11 round trips to 1.
         *
         * Already under the outer save lock: no nested executeWithLock_ here
         * (the script lock is non-reentrant). Row numbers are unchanged. */
        outStart = sheetOut.getLastRow() + 1;
        ensureGridRows_(sheetOut, outStart + outNewRows.length - 1);
        outNewRows.forEach(function (rv, oi2) {
          applyRowFormulas_(rv, outHeaders, mfgOutputFormulaMap_(outStart + oi2));
        });
        sheetOut.getRange(outStart, 1, outNewRows.length, outHeaders.length).setValues(outNewRows);
        noteMutation_(sheetOut);
      }
      /* Delete only rows the editor explicitly removed. A missing client row
         is not deletion evidence (it may be a stale/partial UI state). */
      if (mfgFast) {
        if (deletedOutUids.length) fsDeleteRowsByKeys_(dbId, sheetOut, 'unique_id', deletedOutUids);
      } else {
        deleteRowsWhereIn_(sheetOut, 'unique_id', deletedOutUids);
      }
      ckpt_('outputs');

      /* STABLE UPSERT consumption: footer rows are keyed by their own uid
         (parented by the output uid, kept or new). Matched rows are patched in
         place — id/unique_id/created_at untouched; new rows receive fresh uid
         + max+1 id; deletion requires explicit deleted_uids evidence. */
      var sheetCons = getSheet_(MFG_CONSUMPTION_SHEET, dbId);
      var consHeaders = getHeaders_(sheetCons);
      /* scope = every consumption row parented by this MO's outputs (old uids)
         or by the MO uid itself (earlier `outUid || moUid` fallback rows) */
      /* MFG_BATCH_WRITES_: collected footer patches, written in one call after
         both the footer loop and the legacy recipe loop have run. */
      var consPatches = {};
      var existingConsByUid = {};
      try {
        getAllRecords_(dbId, MFG_CONSUMPTION_SHEET).forEach(function (cm) {
          var refId = String(cm.valley_manufacture_header_product_id || '').trim();
          if (refId && (existingOutByUid[refId] || refId === moUid)) existingConsByUid[String(cm.unique_id).trim()] = cm;
        });
      } catch (e) {}
      var keepConsUids = [];
      var consNewRows = [];
      /* nFootNew enumerates uid-less footers in payload order across all
         outputs — mirrored by mfgAssignDesiredUids_. */
      var nFootNew = 0;
      var nConsNew = 0;

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
        vfCurrentProducts_(dbId).forEach(function (r) {
          var u = String(r.unique_id || '').trim();
          if (u && footerBatchCost[u] === undefined) footerBatchCost[u] = Number(r.unit_cost) || 0;
        });
      } catch (eFbc) {}

      /* 1) Per-product footer rows (from outputs[].footers) */
      outputs.forEach(function (o, oi) {
        var outUid = outputUidMap[oi];
        var footers = (Array.isArray(o.footers) ? o.footers : []).filter(function (f) { return f && String(f.item || '').trim(); });
        footers.forEach(function (f) {
          var suppliedFuid = String(f.uid || '').trim();
          var fuid = suppliedFuid;
          var oldF = fuid ? existingConsByUid[fuid] : null;
          var detFIdx = -1;
          if (!suppliedFuid) detFIdx = nFootNew++;
          if (!oldF && detFIdx !== -1 && reqId) {
            var detF = mfgDeterministicUid_(reqId, moUid, 'footer', detFIdx);
            if (existingConsByUid[detF]) { fuid = detF; oldF = existingConsByUid[detF]; }
          }
          var fqty = Math.round((Number(f.qty) || 0) * 1000) / 1000;
          if (oldF) {
            var m7u = {};
            m7u['valley_manufacture_header_product_id'] = outUid || moUid;
            m7u['item'] = String(f.item || '').trim();
            if (String(f.item_code || '') !== '') m7u['item_code'] = String(f.item_code);
            m7u['qty'] = fqty;
            m7u['user'] = (user && user.email) || '';
            if (mfgFast) consPatches[fuid] = m7u;
            else patchRowByCriteria_(sheetCons, 'unique_id', fuid, m7u);
            keepConsUids.push(fuid);
          } else {
            var m7 = {};
            var newFUid = (detFIdx !== -1 && reqId) ? mfgDeterministicUid_(reqId, moUid, 'footer', detFIdx) : uid16Hex_();
            m7['unique_id'] = newFUid;
            m7['id'] = mfgNextIntegerId_(dbId, MFG_CONSUMPTION_SHEET);
            m7['valley_manufacture_header_product_id'] = outUid || moUid;
            m7['item'] = String(f.item || '').trim();
            m7['item_code'] = String(f.item_code || '');
            m7['qty'] = fqty;
            /* U-47: server-resolved, never f.unit_cost. */
            m7['cost_unit'] = footerBatchCost[m7['item']] || 0;
            m7['created_at'] = new Date();
            m7['user'] = (user && user.email) || '';
            consNewRows.push(consHeaders.map(function (h) {
              var k = String(h).trim();
              return m7[k] !== undefined ? m7[k] : '';
            }));
            keepConsUids.push(newFUid);
          }
        });
      });

      /* 2) Legacy recipe-driven consumption (shared) — ONLY when no footers
         exist for this save (same gate as before: footers and legacy must
         never double-count the same batch). Matched by parent+item so
         unchanged rows keep their id; linked to first output as before */
      var firstOutputUid = outputUidMap[0] || moUid;
      if (!keepConsUids.length && (Array.isArray(consumption) ? consumption : []).length) {
      var legacyByItem = {};
      Object.keys(existingConsByUid).forEach(function (cu) {
        var cm = existingConsByUid[cu];
        if (String(cm.valley_manufacture_header_product_id || '').trim() === firstOutputUid) {
          var ik = String(cm.item || '').trim();
          if (ik && !legacyByItem[ik]) legacyByItem[ik] = cu;
        }
      });
      (Array.isArray(consumption) ? consumption : []).forEach(function (cm) {
        var cmItem = String(cm.item_pid || '').trim();
        if (!cmItem) return;
        var cmQty = Math.round((Number(cm.qty) || 0) * 1000) / 1000;
        var oldC = legacyByItem[cmItem] || null;
        if (oldC && keepConsUids.indexOf(oldC) === -1) {
          var m7l = { qty: cmQty, user: (user && user.email) || '' };
          if (String(cm.lot || '') !== '') m7l['item_code'] = String(cm.lot);
          if (mfgFast) consPatches[oldC] = m7l;
          else patchRowByCriteria_(sheetCons, 'unique_id', oldC, m7l);
          keepConsUids.push(oldC);
        } else if (!oldC) {
          var m7c = {};
          var newCUid = reqId ? mfgDeterministicUid_(reqId, moUid, 'consumption', nConsNew++) : uid16Hex_();
          m7c['unique_id'] = newCUid;
          m7c['id'] = mfgNextIntegerId_(dbId, MFG_CONSUMPTION_SHEET);
          m7c['valley_manufacture_header_product_id'] = firstOutputUid;
          m7c['item'] = cmItem;
          m7c['item_code'] = String(cm.lot || '');
          m7c['qty'] = cmQty;
          m7c['created_at'] = new Date();
          m7c['user'] = (user && user.email) || '';
          consNewRows.push(consHeaders.map(function (h) {
            var k = String(h).trim();
            return m7c[k] !== undefined ? m7c[k] : '';
          }));
          keepConsUids.push(newCUid);
        }
      });
      } /* end legacy-only gate */

      try { Logger.log('MFGTRACE consumption upsert: kept=' + keepConsUids.length + ' new=' + consNewRows.length + ' tab=' + sheetCons.getName()); } catch (eLg4) {}
      if (mfgFast && Object.keys(consPatches).length) {
        fsPatchRowsByKey_(dbId, sheetCons, 'unique_id', consPatches);
      }
      if (consNewRows.length) {
        /* Phase 8 (F-04): one setValues + 2 writeFormula_ per row -> 1 write.
         * Already under the outer save lock: no nested executeWithLock_. */
        var consStart2 = sheetCons.getLastRow() + 1;
        ensureGridRows_(sheetCons, consStart2 + consNewRows.length - 1);
        consNewRows.forEach(function (rv, ci) {
          applyRowFormulas_(rv, consHeaders, mfgConsumptionFormulaMap_(consStart2 + ci));
        });
        sheetCons.getRange(consStart2, 1, consNewRows.length, consHeaders.length).setValues(consNewRows);
        noteMutation_(sheetCons);
      }
      /* Explicit footer deletes, plus the children of an explicitly deleted
         output (the parent deletion is itself the user's deletion evidence). */
      var cascadeConsDeletes = deletedConsUids.slice();
      Object.keys(existingConsByUid).forEach(function (u) {
        var parent = String(existingConsByUid[u].valley_manufacture_header_product_id || '').trim();
        if (deletedOutUids.indexOf(parent) !== -1 && cascadeConsDeletes.indexOf(u) === -1) cascadeConsDeletes.push(u);
      });
      deleteRowsWhereIn_(sheetCons, 'unique_id', cascadeConsDeletes);
      ckpt_('consumption');

      if (scope.indexOf('work_ops') !== -1) {
      /* ---- rewrite work-center rows (valley_manufacture_work_center, inline of header) ---- */
      var WC_SHEET = 'valley_manufacture_work_center';
      var WC_HEADERS = ['unique_id','id','valley_manufacture_header_id','work_center_sequence','recipe_id','operation_status','start_time','end_time','notes','actual_hours','work_center_cost','total_cost','last_pause_time','total_pause_duration','user','created_at'];
      /* Schema already asserted by mfgAssertMfgSchema_ above: no setup here. */
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
       * what it RETURNS.
       *
       * The reasoning that USED to be written here rested on ID_Counter: the old
       * allocator returned the counter's own value whenever the counter ran ahead of
       * the table, so from the second call onward the counter was strictly greater
       * than the table max whether or not the previous row had landed. That is no
       * longer true and must not be relied on — the allocator no longer reads the
       * counter at all (A1).
       *
       * What holds now: getNextIdUnderLock_ floors every answer at
       * max(live table max, highest id handed out this execution) + 1 — the
       * _idHighWater_ memo in Code.js. So the second iteration returns one
       * more than the first even though the first row has not landed, and the ids
       * this loop produces are consecutive and distinct in exactly the order the
       * batched setValues writes them. Deferring the appends is therefore still
       * invisible to the id sequence, for a reason that survives the counter's
       * removal. The update branch never writes the id column, so an interleaved
       * update cannot move tableMax either.
       * Row numbers are unchanged for the same reason the Phase 8 blocks are: only
       * appends change the row count during this loop (the deletes run after it), so
       * the batch starts at the same getLastRow() + 1 and lands in the same order.
       * Locked and grid-grown because a precomputed start row, unlike appendRow, is
       * not safe against a concurrent append. */
      var wcNewRows = [];
      var wcPatches = {};
      var nWoNew = 0;
      (Array.isArray(d.work_ops) ? d.work_ops : []).forEach(function (w, wi) {
        var suppliedWuid = String(w.uid || '').trim();
        var editingUid = suppliedWuid;
        var old = editingUid ? existingWCByUid[editingUid] : null;
        var detWIdx = -1;
        if (!suppliedWuid) detWIdx = nWoNew++;
        if (!old && detWIdx !== -1 && reqId) {
          var detW = mfgDeterministicUid_(reqId, moUid, 'work_op', detWIdx);
          if (existingWCByUid[detW]) { editingUid = detW; old = existingWCByUid[detW]; }
        }
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
          /* Row-edit repair (5.4): formula-safe patch; formulas reinstalled below. */
          if (mfgFast) wcPatches[editingUid] = m;
          else patchRowByCriteria_(sheetWC, 'unique_id', editingUid, m);
          keepWcUids.push(editingUid);
        } else {
          m['unique_id'] = (detWIdx !== -1 && reqId) ? mfgDeterministicUid_(reqId, moUid, 'work_op', detWIdx) : uid16Hex_();
          m['id'] = getNextIdUnderLock_(dbId, WC_SHEET, 'id');
          m['valley_manufacture_header_id'] = moUid;
          m['user'] = (user && user.email) || '';
          m['created_at'] = new Date();
          var vals = wcHeaders.map(function (h) { var k = String(h).trim(); return m[k] !== undefined ? m[k] : ''; });
          wcNewRows.push(vals);
          keepWcUids.push(m['unique_id']);
        }
      });
      if (mfgFast && Object.keys(wcPatches).length) {
        fsPatchRowsByKey_(dbId, sheetWC, 'unique_id', wcPatches);
      }
      if (wcNewRows.length) {
        /* Already under the outer save lock: no nested executeWithLock_. */
        var wcStart = sheetWC.getLastRow() + 1;
        ensureGridRows_(sheetWC, wcStart + wcNewRows.length - 1);
        sheetWC.getRange(wcStart, 1, wcNewRows.length, wcHeaders.length).setValues(wcNewRows);
        noteMutation_(sheetWC);
      }
      if (mfgFast) {
        if (deletedWoUids.length) fsDeleteRowsByKeys_(dbId, sheetWC, 'unique_id', deletedWoUids);
      } else {
        deleteRowsWhereIn_(sheetWC, 'unique_id', deletedWoUids);
      }
      try { Logger.log('MFGTRACE workops: in=' + (Array.isArray(d.work_ops) ? d.work_ops.length : 0) + ' kept=' + keepWcUids.length + ' tab=' + sheetWC.getName()); } catch (eLg5) {}

      /* work-center cost columns are SHEET FORMULAS */
      var wcHdrs = getHeaders_(sheetWC);
      if (mfgFast) {
        /* One key-column read locates every kept row; the legacy path reads the
           WHOLE work-centre table with getDataRange() to find the same rows. */
        var wcWanted = {};
        keepWcUids.forEach(function (uid) { wcWanted[String(uid).trim()] = true; });
        var wcLocated = fsKeyIndex_(sheetWC, 'unique_id', wcWanted);
        keepWcUids.forEach(function (uid) {
          var rN = wcLocated.map.get(String(uid).trim());
          if (rN) writeRowFormulas_(sheetWC, wcHdrs, rN, mfgWorkCenterFormulaMap_(rN));
        });
      } else {
        var wcAll = sheetWC.getDataRange().getValues();
        var wcUidIdx = wcHdrs.findIndex(function (h) { return String(h).trim() === 'unique_id'; });
        keepWcUids.forEach(function (uid) {
          for (var wr = 1; wr < wcAll.length; wr++) {
            if (String(wcAll[wr][wcUidIdx]).trim() === String(uid).trim()) {
              var rN2 = wr + 1;
              writeRowFormulas_(sheetWC, wcHdrs, rN2, mfgWorkCenterFormulaMap_(rN2));
              break;
            }
          }
        });
      }
      ckpt_('work_ops');
      }

      if (scope.indexOf('byproducts') !== -1) {
      /* ---- upsert by-products (valley_manufacture_by_product, inline of header) ---- */
      var BP_SHEET = 'valley_manufacture_by_product';
      var BP_HEADERS = ['unique_id','id','valley_manufacture_header_id','code','manufacture_date','transaction_code','item','qty','total_cost','manufacture_internal_batch','user','created_at'];
      /* Schema already asserted by mfgAssertMfgSchema_ above: no setup here. */
      /* STABLE UPSERT by-products: matched rows patched in place
         (id/unique_id/created_at/manufacture_date untouched; total_cost is a
         sheet formula so the client's value is never written back over it);
         new rows created with fresh uid + max+1 id; orphans deleted. */
      var sheetBP = getSheet_(BP_SHEET, dbId);
      var bpHeaders = getHeaders_(sheetBP);
      var existingBPByUid = {};
      try {
        getAllRecords_(dbId, BP_SHEET).forEach(function (r) {
          if (String(r.valley_manufacture_header_id || '').trim() === moUid) existingBPByUid[String(r.unique_id).trim()] = r;
        });
      } catch (e) {}
      var keepBpUids = [];
      var bpNewRows = [];
      var bpPatches = {};
      var nBpNew = 0;
      (Array.isArray(d.byproducts) ? d.byproducts : []).forEach(function (b) {
        var suppliedBuid = String(b.uid || '').trim();
        var buid = suppliedBuid;
        var oldB = buid ? existingBPByUid[buid] : null;
        var detBIdx = -1;
        if (!suppliedBuid) detBIdx = nBpNew++;
        if (!oldB && detBIdx !== -1 && reqId) {
          var detB = mfgDeterministicUid_(reqId, moUid, 'by_product', detBIdx);
          if (existingBPByUid[detB]) { buid = detB; oldB = existingBPByUid[detB]; }
        }
        if (oldB) {
          var bpPatch = {
            item: String(b.item || '').trim(),
            qty: Number(b.qty) || 0,
            transaction_code: String(b.transaction_code || '').trim(),
            user: (user && user.email) || ''
          };
          if (mfgFast) bpPatches[buid] = bpPatch;
          else patchRowByCriteria_(sheetBP, 'unique_id', buid, bpPatch);
          keepBpUids.push(buid);
        } else {
          var m = {};
          var newBUid = (detBIdx !== -1 && reqId) ? mfgDeterministicUid_(reqId, moUid, 'by_product', detBIdx) : uid16Hex_();
          m['unique_id'] = newBUid;
          m['id'] = mfgNextIntegerId_(dbId, BP_SHEET);
          m['valley_manufacture_header_id'] = moUid;
          m['item'] = String(b.item || '').trim();
          m['qty'] = Number(b.qty) || 0;
          m['transaction_code'] = String(b.transaction_code || '').trim();
          m['total_cost'] = Number(b.total_cost || 0);
          m['manufacture_date'] = new Date();
          m['user'] = (user && user.email) || '';
          m['created_at'] = new Date();
          bpNewRows.push(bpHeaders.map(function (h) { var k = String(h).trim(); return m[k] !== undefined ? m[k] : ''; }));
          keepBpUids.push(newBUid);
        }
      });
      if (bpNewRows.length) {
        /* Phase 8 (F-04): the worst site in the file — writeByproductFormulas_
         * issued FOUR writeFormula_ calls per row, each with its own getSheet_ +
         * getHeaders_ + setFormula. Merged into the block write: a 4-by-product
         * order goes from 17 round trips to 1. Already under the outer save
         * lock: no nested executeWithLock_. */
        var bpStart = sheetBP.getLastRow() + 1;
        ensureGridRows_(sheetBP, bpStart + bpNewRows.length - 1);
        bpNewRows.forEach(function (rv, bi) {
          applyRowFormulas_(rv, bpHeaders, byproductFormulaMap_(bpStart + bi));
        });
        sheetBP.getRange(bpStart, 1, bpNewRows.length, bpHeaders.length).setValues(bpNewRows);
        noteMutation_(sheetBP);
      }
      if (mfgFast && Object.keys(bpPatches).length) {
        fsPatchRowsByKey_(dbId, sheetBP, 'unique_id', bpPatches);
      }
      if (mfgFast) {
        if (deletedBpUids.length) fsDeleteRowsByKeys_(dbId, sheetBP, 'unique_id', deletedBpUids);
      } else {
        deleteRowsWhereIn_(sheetBP, 'unique_id', deletedBpUids);
      }
      ckpt_('byproducts');
      }
      ckpt_('complete');
    });

    if (recoveredResp) return recoveredResp;
    finBustRefs_(dbId);
    vfFlush_();   /* the balance the client reads back must include this write */
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
          /* OPT-3: history snapshot from the row just located — same
             trimmed-header mapping buildRecordsFromRaw_ applies — instead of
             a second full read of this sheet. */
          var _oldU = null;
          try {
            var _oldURec = {};
            headersU.forEach(function (h, ci) {
              var _uv = dataU[ru][ci];
              _oldURec[String(h).trim()] = _uv !== undefined ? _uv : '';
            });
            _oldU = _oldURec;
          } catch (e) { _oldU = null; }
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
        /* OPT-4: one contiguous range write per approval pair when the live
           layout keeps the pair adjacent — verified from the headers just
           read, never assumed. Same cells, same values. Otherwise the
           original single-cell writes run verbatim. */
        var _mfgEmail = (user && user.email) || '';
        var _mfgTime = new Date();
        if (kind === 'production') {
          if (paIdx !== -1 && patIdx === paIdx + 1) {
            sheet.getRange(r + 1, paIdx + 1, 1, 2).setValues([[_mfgEmail, _mfgTime]]);
            noteMutation_(sheet);
          } else {
            sheet.getRange(r + 1, paIdx + 1).setValue(_mfgEmail);
            noteMutation_(sheet);
            sheet.getRange(r + 1, patIdx + 1).setValue(_mfgTime);
            noteMutation_(sheet);
          }
        } else {
          if (qaIdx !== -1 && qatIdx === qaIdx + 1) {
            sheet.getRange(r + 1, qaIdx + 1, 1, 2).setValues([[_mfgEmail, _mfgTime]]);
            noteMutation_(sheet);
          } else {
            sheet.getRange(r + 1, qaIdx + 1).setValue(_mfgEmail);
            noteMutation_(sheet);
            sheet.getRange(r + 1, qatIdx + 1).setValue(_mfgTime);
            noteMutation_(sheet);
          }
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
        vfFlush_();   /* the balance the client reads back must include this write */
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
      if (String(dataAll[r][uidIdx]).trim() === moUid) {
        cur = String(dataAll[r][stIdx]).trim();
        /* Status values are displayed/stored as these English labels, but
           legacy sheets can differ only by case/spacing. Canonicalize them
           before routing the transition so a real Locked order can always be
           reopened by the super-admin unlock action. */
        var curNorm = (typeof normDocStatus_ === 'function') ? normDocStatus_(cur) : cur.toLowerCase();
        if (curNorm === 'draft') cur = 'Draft';
        else if (curNorm === 'in progress') cur = 'In Progress';
        else if (curNorm === 'locked') cur = 'Locked';
        break;
      }
    }
    if (cur === null) throw new Error('أمر التصنيع غير موجود');

    var next;
    if (kind === 'start') {
      next = 'In Progress';
    } else if (kind === 'lock') {
      var canLock = !!(user && (user.isSuperAdmin || unifiedCheck_(user, '9940659bd83035d7', 'vf_mfg_orders', 'write')));
      if (!canLock) throw new Error('القفل يتطلب صلاحية الكتابة على أوامر التصنيع');
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
      next = 'In Progress';
    }
    /* Phase 2: strict Draft->In Progress->Locked->In Progress routed through
       the policy table. The three canonical pairs are also guarded locally
       so valid status actions keep working if a stale deployment has not
       loaded the centralized policy object yet. */
    var exactStatusTransition =
      (cur === 'Draft' && next === 'In Progress') ||
      (cur === 'In Progress' && next === 'Locked') ||
      (cur === 'Locked' && next === 'In Progress');
    if (!exactStatusTransition) assertTransition_('vf_mfg_order', cur, next, 'تحويل حالة أمر التصنيع غير صالح من الحالة الحالية');
    var _oldMfgSt = getAllRecords_(dbId, MFG_ORDER_SHEET).find(function(r){ return String(r.unique_id)===String(moUid); }) || null;
    var __mfgStVer = checkRowVersion_(_oldMfgSt, data && data.version);
    executeWithLock_(function () {
      if (!patchRowByCriteria_(sheet, 'unique_id', moUid, { mo_status: next, version: __mfgStVer + 1 })) throw new Error('أمر التصنيع غير موجود');
    });
    try{ var _newMfgSt = Object.assign({}, _oldMfgSt||{}, { mo_status: next }); logHistory_(dbId, MFG_ORDER_SHEET, _oldMfgSt&&_oldMfgSt.record_uid ? _oldMfgSt.record_uid : ('update_'+MFG_ORDER_SHEET+'_'+moUid), moUid, (user&&user.email)||'', 'update', _newMfgSt, _oldMfgSt) }catch(e){}
    vfFlush_();   /* the balance the client reads back must include this write */
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
          required_qty: Math.round(raw * 1000) / 1000
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
    mfgAssertMfgSchema_(dbId, MFG_LIST_SCOPE_);
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
    try { vfCurrentProducts_(dbId).forEach(function (r) { var u = String(r.unique_id || '').trim(); if (u) batchCost[u] = Number(r.unit_cost) || 0; }); } catch (e) {}

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
      consumption: legacyConsumption,
      /* Schema-free edit token for this editor's scope (list page). The
         client returns both as base_token/save_scope on edit. */
      edit_token: mfgEditToken_(dbId, moUid, MFG_LIST_SCOPE_),
      save_scope: MFG_LIST_SCOPE_.slice()
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

    mfgAssertMfgSchema_(dbId, ['byproducts']);

    var _savedBP = null;
    executeWithLock_(function () {
      var sheet = getSheet_(MFG_BYPRODUCT_SHEET, dbId);
      var headers = getHeaders_(sheet);
      var dataAll = sheet.getDataRange().getValues();
      var m8 = {};
      m8['unique_id'] = uid16Hex_();
      m8['id'] = mfgNextIntegerId_(dbId, MFG_BYPRODUCT_SHEET);
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
            /* The work centre's key lives in the `recipe_id` COLUMN. That name is a
             * legacy misnomer, like movmenent_sign: the AppSheet schema declares
             * valley_manufacture_work_center.recipe_id a Ref to valley_work_centers,
             * and the sheet's own work_center_cost formula proves it — it is
             * INDEX(valley_work_centers!$H:$H, MATCH(E<row>, valley_work_centers!$A:$A, 0))
             * and column E IS recipe_id. There is NO work_center_id column on this
             * table, so reading one always yielded '': the picker came back empty on
             * every reload of a saved order, and the next save wrote that blank back
             * over the key the previous save had stored correctly.
             * The client keeps calling the field work_center_id — that is the wire
             * name and the options' value is valley_work_centers.unique_id. */
            work_center_id: String(r.recipe_id == null ? '' : r.recipe_id).trim(),
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
    /* Required when ADDING an operation. An edit (the manual start/end time
       tweak on vf_mfg_orders) sends no work_center_id because it is not
       changing one, and the unconditional check refused every such save. */
    if (!String(d.workop_uid || '').trim() && !d.work_center_id) throw new Error('مركز العمل مطلوب');
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
    /* Row-edit repair (5.2): the edited operation must belong to the stated
       parent order; a cross-order unique_id is a missing record, not an edit. */
    if (editingUid) {
      if (!_oldWO) throw new Error('السجل غير موجود');
      if (String(_oldWO.valley_manufacture_header_id || '').trim() !== moUid) throw new Error('السجل غير موجود');
    }
    executeWithLock_(function () {
      var map = {};
      map['operation_status'] = status;
      map['start_time'] = d.start_time ? parseDate_(d.start_time) : '';
      map['end_time'] = d.end_time ? parseDate_(d.end_time) : '';
      map['actual_hours'] = d.actual_hours !== '' && d.actual_hours != null ? Number(d.actual_hours) : '';
      map['notes'] = String(d.notes || '').trim();

      if (editingUid) {
        /* Manual time corrections write only the supplied times (and notes when
           the caller actually sends them — the inline editor has no notes
           input, so an absent key preserves the stored notes). Status
           transitions belong to control_valley_mfg_workop_, and hours/costs
           are sheet formulas reinstalled below through the trusted map —
           caller-supplied actual_hours/costs are never stored. */
        var editMap = {
          start_time: map['start_time'],
          end_time: map['end_time']
        };
        if (d.notes !== undefined && d.notes !== null) editMap['notes'] = String(d.notes).trim();
        if (!patchRowByCriteria_(sheet, 'unique_id', editingUid, editMap)) throw new Error('السجل غير موجود');
        try {
          var _freshWO = getAllRecords_(dbId, MFG_WORKOPS_SHEET);
          for (var _wi = 0; _wi < _freshWO.length; _wi++) {
            /* getAllRecords_ order matches sheet order; row numbers are 1-based
               with a header row, so index+2 locates the edited row for the
               trusted formula reinstall. */
            if (String(_freshWO[_wi].unique_id) === String(editingUid)) {
              writeRowFormulas_(sheet, headers, _wi + 2, mfgWorkCenterFormulaMap_(_wi + 2));
              break;
            }
          }
        } catch (eWF) {}
        try{ var _newWO = Object.assign({}, _oldWO||{}, editMap); logHistory_(dbId, MFG_WORKOPS_SHEET, _oldWO&&_oldWO.record_uid ? _oldWO.record_uid : ('update_'+MFG_WORKOPS_SHEET+'_'+editingUid), editingUid, (user&&user.email)||'', 'update', _newWO, _oldWO) }catch(e){}
      } else {
        var uid2 = Utilities.getUuid();
        map['unique_id'] = uid2;
        map['valley_manufacture_header_id'] = moUid;
        map['work_center_sequence'] = seqNum;
        map['recipe_id'] = String(d.work_center_id).trim();   /* the column holds valley_work_centers.unique_id */
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
      /* Row-edit repair (5.4): formula-safe patch with a checked result — a
         missing row throws instead of reporting success. */
      if (!patchRowByCriteria_(getSheet_(MFG_WORKOPS_SHEET, dbId), 'unique_id', workopUid, map)) throw new Error('السجل غير موجود');
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
    /* Row-edit repair (5.3): Add stays page-write; correcting an existing row
       requires super-admin, matching the Edit UI. No blanket save_ rule. */
    if (editing) requireSuperAdmin_(user);
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
        /* Row-edit repair (5.4): formula-safe patch with a checked result — a
           missing row throws instead of reporting success. */
        if (!patchRowByCriteria_(sheet, 'unique_id', String(d.unique_id).trim(), map)) throw new Error('السجل غير موجود');
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
    return { status: 'success', message: editing ? 'تم التحديث' : 'تمت الإضافة', unique_id: editing ? String(d.unique_id).trim() : map['unique_id'] };
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
    /* Row-edit repair (5.3): Add stays page-write; correcting an existing row
       requires super-admin, matching the Edit UI. No blanket save_ rule. */
    if (editing) requireSuperAdmin_(user);
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
        /* Row-edit repair (5.4): formula-safe patch with a checked result — a
           missing row throws instead of reporting success. */
        if (!patchRowByCriteria_(sheet, 'unique_id', String(d.unique_id).trim(), map)) throw new Error('السجل غير موجود');
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
    return { status: 'success', message: editing ? 'تم التحديث' : 'تمت الإضافة', unique_id: editing ? String(d.unique_id).trim() : map['unique_id'] };
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
    /* Row-edit repair (5.3): Add stays page-write; correcting an existing row
       requires super-admin, matching the Edit UI. No blanket save_ rule. */
    if (editing) requireSuperAdmin_(user);
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
        /* Row-edit repair (5.4): formula-safe patch with a checked result — a
           missing row throws instead of reporting success. */
        if (!patchRowByCriteria_(sheet, 'unique_id', String(d.unique_id).trim(), map)) throw new Error('السجل غير موجود');
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
        if (!patchRowByCriteria_(sheet, 'plan_unique_id', String(d.plan_unique_id).trim(), map)) throw new Error('الخطة غير موجودة');
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
    vfFlush_();   /* the balance the client reads back must include this write */
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
        /* Row-edit repair (5.4): formula-safe patch for the recipe header. */
        patchRowByCriteria_(sheet, 'unique_id', uid, {
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
  /* تقرير المصروفات — per expense account over a DATE RANGE on
   * transaction_date, with the previous equal-length period alongside for
   * comparison. Empty/unparseable bounds are unbounded on that side.
   *
   * Which accounts are expenses, and what each is called: chart rows whose
   * «المستوى الاساسي» = 3, shown by «كود المستوى». */
  function getValleyCashExpenseReport_(data, user, dbId) {
    var d = data || {};
    var now = new Date();
    var range = cashReportRange_(d, now);
    var from = range.from, to = range.to, prevFrom = range.prevFrom, prevTo = range.prevTo;

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

    var byAccount = {};        /* code -> { range, rangeCount, prev, prevCount } */
    var rangeTotal = 0, prevTotal = 0, rangeMoves = 0;

    getAllRecords_(dbId, FIN_CASH_SHEET).forEach(function (r) {
      var code = String(r.chart_code == null ? '' : r.chart_code).trim();
      if (!code || expenseLabels[code] === undefined) return;
      var dt = parseDate_(r.transaction_date);
      if (!dt) return;

      var amt = amountOf(r);
      if (!byAccount[code]) byAccount[code] = { range: 0, rangeCount: 0, prev: 0, prevCount: 0 };
      if ((!from || dt >= from) && (!to || dt <= to)) {
        byAccount[code].range += amt;
        byAccount[code].rangeCount++;
        rangeTotal += amt;
        rangeMoves++;
      } else if (prevFrom && prevTo && dt >= prevFrom && dt <= prevTo) {
        byAccount[code].prev += amt;
        byAccount[code].prevCount++;
        prevTotal += amt;
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
        range_amount: round2(a.range),
        range_pct: pct(a.range, rangeTotal),
        range_count: a.rangeCount,
        prev_amount: round2(a.prev),
        prev_pct: pct(a.prev, prevTotal),
        prev_count: a.prevCount
      };
    }).filter(function (r) { return r.range_amount !== 0 || r.prev_amount !== 0; });

    rows.sort(function (a, b) { return b.range_amount - a.range_amount || b.prev_amount - a.prev_amount; });

    return {
      status: 'success',
      range: range.iso,
      rows: rows,
      totals: { range_amount: round2(rangeTotal), prev_amount: round2(prevTotal), range_moves: rangeMoves },
      accounts_considered: expenseCount
    };
  }

  /* Shared range resolution for the cash expenses/incomes reports.
   * d.from/d.to are ISO date strings; a missing side is unbounded. No from/to
   * keys at all (first load) defaults to the current month-to-date; explicit
   * empty strings clear to unbounded. Unparseable bounds are unbounded, never
   * an error, so a filter can never hide data by accident. The comparison
   * period is the equal-length span immediately before `from` and needs a
   * bounded from. */
  function cashReportRange_(d, now) {
    d = d || {};
    var defFrom = now.getFullYear() + '-' + pad2_(now.getMonth() + 1) + '-01';
    var hasFromKey = Object.prototype.hasOwnProperty.call(d, 'from');
    var hasToKey = Object.prototype.hasOwnProperty.call(d, 'to');
    var from, to;
    if (!hasFromKey && !hasToKey) {
      from = vfDateBound_(defFrom, false);
      to = null;
    } else {
      from = hasFromKey ? vfDateBound_(d.from, false) : null;
      to = hasToKey ? vfDateBound_(d.to, true) : null;
    }
    var prevFrom = null, prevTo = null;
    if (from) {
      var effTo = to || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      var lenMs = Math.max(86400000, effTo.getTime() - from.getTime() + 1);
      prevTo = new Date(from.getTime() - 1);
      prevFrom = new Date(prevTo.getTime() - lenMs + 1);
    }
    function iso(v) {
      if (!v) return '';
      return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
    }
    return {
      from: from, to: to, prevFrom: prevFrom, prevTo: prevTo,
      iso: { from: iso(from), to: iso(to), prev_from: iso(prevFrom), prev_to: iso(prevTo) }
    };
  }

  /**
   * تقرير الايرادات الاخرى — other incomes aside from sales, per income
   * account, for one month and for the year to date, each as a share of its
   * own total. Mirrors getValleyCashExpenseReport_ shape and amount rule.
   *
   * WHAT COUNTS AS OTHER INCOME (owner-specified, unlike expenses which use
   * the المستوى الاساسي authority): a cash movement with transaction_type
   * 'Debit' whose numeric chart_code falls in [411102, 421201]. The account
   * is shown by its «كود المستوى» label, which is what people read.
   *
   * THE AMOUNT: the sheet's own `total` when it holds a number, else
   * transaction_amount − total_discount + taxes (same AppSheet formula).
   */
  function getValleyCashIncomeReport_(data, user, dbId) {
    var d = data || {};
    var now = new Date();
    var range = cashReportRange_(d, now);
    var from = range.from, to = range.to, prevFrom = range.prevFrom, prevTo = range.prevTo;

    var INC_FROM = 411102, INC_TO = 421201;

    /* Which accounts are in range, and what each is called. */
    var incomeLabels = {};
    var incomeCount = 0;
    getAllRecords_(dbId, FIN_CHART_SHEET).forEach(function (r) {
      var lvl5 = String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim();
      if (!lvl5) return;
      var codeNum = Number(lvl5);
      if (isNaN(codeNum) || codeNum < INC_FROM || codeNum > INC_TO) return;
      var label = String(r['كود المستوى'] == null ? '' : r['كود المستوى']).trim();
      incomeLabels[lvl5] = label || lvl5;
      incomeCount++;
    });
    if (!incomeCount) {
      throw new Error('لا توجد حسابات إيرادات في النطاق 411102..421201 — لم يُعثر على أي صف مطابق في دليل الحسابات');
    }

    function amountOf(r) {
      var t = Number(r.total);
      if (r.total !== '' && r.total != null && !isNaN(t)) return t;
      return (Number(r.transaction_amount) || 0)
        - (Number(r.total_discount) || 0)
        + (Number(r.taxes) || 0);
    }

    var byAccount = {};        /* code -> { range, rangeCount, prev, prevCount } */
    var rangeTotal = 0, prevTotal = 0, rangeMoves = 0;

    getAllRecords_(dbId, FIN_CASH_SHEET).forEach(function (r) {
      if (String(r.transaction_type || '').trim() !== 'Debit') return;
      var code = String(r.chart_code == null ? '' : r.chart_code).trim();
      if (!code || incomeLabels[code] === undefined) return;
      var dt = parseDate_(r.transaction_date);
      if (!dt) return;

      var amt = amountOf(r);
      if (!byAccount[code]) byAccount[code] = { range: 0, rangeCount: 0, prev: 0, prevCount: 0 };
      if ((!from || dt >= from) && (!to || dt <= to)) {
        byAccount[code].range += amt;
        byAccount[code].rangeCount++;
        rangeTotal += amt;
        rangeMoves++;
      } else if (prevFrom && prevTo && dt >= prevFrom && dt <= prevTo) {
        byAccount[code].prev += amt;
        byAccount[code].prevCount++;
        prevTotal += amt;
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
        label: incomeLabels[code],
        range_amount: round2(a.range),
        range_pct: pct(a.range, rangeTotal),
        range_count: a.rangeCount,
        prev_amount: round2(a.prev),
        prev_pct: pct(a.prev, prevTotal),
        prev_count: a.prevCount
      };
    }).filter(function (r) { return r.range_amount !== 0 || r.prev_amount !== 0; });

    rows.sort(function (a, b) { return b.range_amount - a.range_amount || b.prev_amount - a.prev_amount; });

    return {
      status: 'success',
      range: range.iso,
      rows: rows,
      totals: { range_amount: round2(rangeTotal), prev_amount: round2(prevTotal), range_moves: rangeMoves },
      accounts_considered: incomeCount
    };
  }

  /* تقرير أرصدة الصناديق — an unbounded movement statement by default.
   * When a from date is supplied, opening balance is every earlier movement
   * for the selected box(es). Period balance is then rebuilt as Debit minus
   * Credit in transaction_id order instead of trusting stored balance columns. */
  function getValleyCashBoxBalanceReport_(data, user, dbId) {
    var d = data || {};
    var from = vfDateBound_(d.from, false);
    var to = vfDateBound_(d.to, true);
    if (from && to && from.getTime() > to.getTime()) throw new Error('«من تاريخ» بعد «إلى تاريخ»');

    var requestedBox = String(d.related_box == null ? '' : d.related_box).trim();
    var boxMap = finBoxMap_(dbId);
    requestedBox = finResolveBoxKey_(boxMap, requestedBox);

    var partyNames = {};
    try {
      getAllRecords_(dbId, FIN_PARTIES_SHEET).forEach(function (p) {
        partyNames[String(p.id)] = String(p.name || p.id);
      });
    } catch (e) {}

    function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
    function amountOf(r) {
      var total = Number(r.total);
      if (r.total !== '' && r.total != null && !isNaN(total)) return total;
      return (Number(r.transaction_amount) || 0)
        - (Number(r.total_discount) || 0)
        + (Number(r.taxes) || 0);
    }
    function isCredit(r) {
      var type = String(r.transaction_type || '').trim();
      return type === 'Credit' || type === 'Credit Note';
    }
    function validDate(v) {
      var parsed = parseDate_(v);
      return parsed instanceof Date && !isNaN(parsed.getTime()) ? parsed : null;
    }
    function iso(v) {
      if (!v) return '';
      return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
    }

    var openingByBox = {};
    var periodRows = [];
    var seenBoxes = {};
    var invalidDateCount = 0;

    getAllRecords_(dbId, FIN_CASH_SHEET).forEach(function (r) {
      var boxKey = finResolveBoxKey_(boxMap, r.related_box);
      if (!boxKey || (requestedBox && boxKey !== requestedBox)) return;
      seenBoxes[boxKey] = true;

      var dt = validDate(r.transaction_date);
      if ((from || to) && !dt) { invalidDateCount++; return; }
      var amount = round2(amountOf(r));
      var signed = isCredit(r) ? -amount : amount;

      if (from && dt && dt < from) {
        openingByBox[boxKey] = round2((openingByBox[boxKey] || 0) + signed);
        return;
      }
      if (to && dt && dt > to) return;
      periodRows.push({ source: r, boxKey: boxKey, date: dt, amount: amount, credit: isCredit(r) });
    });

    periodRows.sort(function (a, b) {
      return (Number(a.source.transaction_id) || 0) - (Number(b.source.transaction_id) || 0);
    });

    var runningByBox = {};
    Object.keys(openingByBox).forEach(function (key) { runningByBox[key] = openingByBox[key]; });
    var debitByBox = {}, creditByBox = {};
    var totalDebit = 0, totalCredit = 0;
    var rows = periodRows.map(function (entry) {
      var r = entry.source;
      var key = entry.boxKey;
      var debit = entry.credit ? 0 : entry.amount;
      var credit = entry.credit ? entry.amount : 0;
      debitByBox[key] = round2((debitByBox[key] || 0) + debit);
      creditByBox[key] = round2((creditByBox[key] || 0) + credit);
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
      runningByBox[key] = round2((runningByBox[key] || 0) + debit - credit);
      var rawDate = r.transaction_date;
      var dateText = entry.date ? iso(entry.date) : String(rawDate == null ? '' : rawDate);
      return {
        transaction_id: r.transaction_id,
        transaction_date: dateText,
        related_box: key,
        box_name: boxMap.byKey[key] || key,
        party_name: partyNames[String(r.name)] || String(r.name_vendor || ''),
        transaction_details: r.transaction_details || '',
        transaction_type: r.transaction_type || '',
        transaction_method: r.transaction_method || '',
        chart_name: r.chart_name || r.chart_code || '',
        debit: round2(debit),
        credit: round2(credit),
        calculated_balance: runningByBox[key],
        approved: !(r.approved === false || String(r.approved).toLowerCase() === 'no' || r.approved === '')
      };
    });

    var summaryKeys = {};
    if (requestedBox) summaryKeys[requestedBox] = true;
    else {
      Object.keys(boxMap.byKey).forEach(function (key) { summaryKeys[key] = true; });
      Object.keys(seenBoxes).forEach(function (key) { summaryKeys[key] = true; });
    }
    var boxes = Object.keys(summaryKeys).map(function (key) {
      var opening = round2(openingByBox[key] || 0);
      var debit = round2(debitByBox[key] || 0);
      var credit = round2(creditByBox[key] || 0);
      return {
        related_box: key,
        box_name: boxMap.byKey[key] || key,
        opening_balance: opening,
        debit: debit,
        credit: credit,
        calculated_balance: round2(opening + debit - credit)
      };
    }).sort(function (a, b) {
      return String(a.box_name).localeCompare(String(b.box_name), 'ar');
    });

    var openingTotal = round2(boxes.reduce(function (sum, b) { return sum + b.opening_balance; }, 0));
    return {
      status: 'success',
      range: { from: iso(from), to: iso(to) },
      selected_box: requestedBox,
      box_options: Object.keys(boxMap.byKey).map(function (key) {
        return { value: key, label: boxMap.byKey[key] || key };
      }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); }),
      rows: rows,
      boxes: boxes,
      totals: {
        opening_balance: openingTotal,
        debit: round2(totalDebit),
        credit: round2(totalCredit),
        calculated_balance: round2(openingTotal + totalDebit - totalCredit),
        movement_count: rows.length
      },
      invalid_date_count: invalidDateCount
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
        name: (r.name === '' || r.name == null) ? '' : r.name,
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
      can_add_party: vfCanAddParty_(user),
      party_direction_options: FIN_DIRECTIONS,
      party_type_options: FIN_PARTY_TYPES,
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
    /* Ref-only policy: name_vendor is retired. Free text is rejected so every
     * movement links to valley_legal_customer_vendor; unregistered parties go
     * through the Parties form (or the Cash quick-add, same contract). */
    if (vendorName) throw new Error('سجل الطرف أولاً في العملاء والموردون ثم اختره من القائمة');
    if (!partyId) throw new Error('الطرف (عميل/مورد) مطلوب — اختره من القائمة');
    var partyOk = getAllRecords_(dbId, FIN_PARTIES_SHEET).some(function (p) {
      return String(p.id).trim() === partyId;
    });
    if (!partyOk) throw new Error('الطرف المختار غير مسجل في العملاء والموردون');
    var chartCode = String(d.chart_code || '').trim();
    if (!chartCode) throw new Error('كود الدليل المحاسبي مطلوب — اختره من القائمة');
    var chartOk = getAllRecords_(dbId, FIN_CHART_SHEET).some(function (r) {
      return String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim() === chartCode;
    });
    if (!chartOk) throw new Error('كود الدليل المحاسبي غير موجود ضمن دليل الحسابات');

    settingsEnsureSheet_(dbId, FIN_CASH_SHEET,
      ['transaction_id','invoice_id','name','name_vendor','transaction_purchasing_items','transaction_details','transaction_date','transaction_amount','total_discount','net_amount','taxes','total','transaction_type','balance_amount','box_balance','related_box','chart_code','chart_name','transaction_method','tax_system','chart_account_main','approved','user','created_at','Temp_Target_Box']);
    var sheet = getSheet_(FIN_CASH_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rows = getAllRecords_(dbId, FIN_CASH_SHEET);

    var dateVal = dateOnly_(d.transaction_date);
    if (!dateVal) throw new Error('تاريخ الحركة غير صالح');

    function buildValues(tid) {
      var rowNumber = sheet.getLastRow() + 1;
      var map = {};
      map['transaction_id'] = tid;
      map['invoice_id'] = String(d.invoice_id || '').trim();
      map['name'] = partyId ? Number(partyId) : '';
      map['name_vendor'] = '';
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
        name_vendor: '',
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
      /* Row-edit repair (5.4): formula-safe patch with a checked result — a
         missing row throws instead of reporting success. */
      if (!patchRowByCriteria_(sheet, 'transaction_id', tidEdit, editMap)) throw new Error('السجل غير موجود');
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
    if (!patchRowByCriteria_(sheet, 'transaction_id', key, { approved: newValue })) throw new Error('تعذر التحديث');
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
    var dateVal = dateOnly_(d.transaction_date);
    if (!dateVal) throw new Error('تاريخ التحويل غير صالح');
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
      vfCurrentProducts_(dbId).forEach(function (r) {
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

  /* unit of a batch, falling back to valley_products.unit via product_id.
   * OPT-3: when the caller passes a prebuilt unitByProductId map (exact
   * trimmed-string keys, first match wins — the same rows the old .find()
   * returned), no sheet is touched. Without it the original single lookup
   * runs, so standalone callers are unaffected. */
  function whBatchUnit_(dbId, batch, unitByProductId) {
    var unit = String((batch && batch.unit) || '').trim();
    if (unit || !batch || !batch.product_id) return unit;
    try {
      if (unitByProductId) {
        // The legacy predicate was String(stored id).trim() === input. Keep
        // its typed/case-sensitive behavior; object lookup also avoids names
        // such as "toString" being inherited from Object.prototype.
        if (typeof batch.product_id === 'string' && Object.prototype.hasOwnProperty.call(unitByProductId, batch.product_id)) {
          var hit = unitByProductId[batch.product_id];
          if (hit !== undefined) return hit;
        }
      } else {
        var p = getAllRecords_(dbId, FIN_PRODUCTS_SHEET).find(function (x) {
          return String(x.id == null ? '' : x.id).trim() === batch.product_id;
        });
        if (p) unit = String(p.unit || '').trim();
      }
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

  /* New records store valley_dept_section_index[section] in responsible_person —
     matching the legacy AppSheet Ref (key column `section`, القسم المسؤول) —
     NOT an emp_id. History rows keep their old emp_id values and still resolve
     through whEmployeeNames_ above. Reads the sheet directly (literal name, no
     outside-block const) so the s12 dry-run block stays self-contained. */
  function whSectionNames_(dbId) {
    var options = [];
    var labels = {};
    try {
      getAllRecords_(dbId, 'valley_dept_section_index').forEach(function (r) {
        var t = String(r['section'] != null ? r['section'] : (r['Section'] != null ? r['Section'] : (r['section_name'] != null ? r['section_name'] : ''))).trim();
        if (!t || labels[t]) return;
        labels[t] = t;
        options.push({ value: t, label: t });
      });
    } catch (e) {}
    options.sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    return { options: options, labels: labels };
  }

  /* ---------- list ---------- */
  function getValleyWarehouseMovements_(data, user, dbId) {
    var sheet = getSheet_(WH_MOVE_SHEET, dbId);
    whAssertHeaders_(sheet);

    var vendorNames = whVendorNames_(dbId);
    var empNames = whEmployeeNames_(dbId);
    var sectionLabels = whSectionNames_(dbId).labels;
    var batchInfo = {};
    try {
      vfCurrentProducts_(dbId).forEach(function (r) {
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
        /* History rows store an emp_id and resolve through empNames; new rows
           store a valley_dept_section_index[section] which resolves to itself.
           Legacy rows that stored a dept section also fall back to the stored
           value so they still read correctly. */
        responsible_name: rkey ? (empNames[rkey] || sectionLabels[rkey] || rkey) : '',
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

  /* ---------- form bootstrap: vendors + titles + available batches ---------- */
  function getValleyWarehouseMoveOptions_(data, user, dbId) {
    var vendorNames = whVendorNames_(dbId);
    var vendors = Object.keys(vendorNames).map(function (k) {
      return { value: k, label: vendorNames[k] };
    }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });

    /* The responsible-person picker offers valley_dept_section_index[section],
       not employees. `employees` is kept in the payload for backward
       compatibility but the form no longer uses it. */
    var empNames = whEmployeeNames_(dbId);
    var employees = Object.keys(empNames).map(function (k) {
      return { value: k, label: empNames[k] };
    }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    var sections = whSectionNames_(dbId).options;

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
      sections: sections,
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
    var sectionLabels = whSectionNames_(dbId).labels;
    var vendorNames = whVendorNames_(dbId);
    /* Product units are a fallback only. Build the exact, case-sensitive,
     * first-wins index on the first unit-less row that actually needs it. */
    var productUnits = null;
    var ensureProductUnits_ = function () {
      if (productUnits !== null) return productUnits;
      productUnits = Object.create(null);
      try {
        getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (x) {
          var pk = String(x.id == null ? '' : x.id).trim();
          if (pk && productUnits[pk] === undefined) productUnits[pk] = String(x.unit || '').trim();
        });
      } catch (e) {}
      return productUnits;
    }

    /* How much each batch has already been been drawn down by EARLIER ROWS IN THIS
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
      /* New records reference valley_dept_section_index[section]. History rows
         that stored an emp_id are never re-validated — this ledger is
         add-only. */
      if (!sectionLabels[resp]) throw new Error('القسم المختار غير موجود في دليل الأقسام' + at);

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

      if (!String(batch.unit || '').trim() && batch.product_id) ensureProductUnits_();
      var map = {};
      map['unique_id'] = uid16Hex_();
      map['warehouse'] = WH_WAREHOUSE;          /* constant, never rendered or edited */
      map['vendor'] = vendor;
      map['item'] = batchUid;
      map['unit'] = whBatchUnit_(dbId, batch, productUnits);
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

    vfFlush_();   /* the balance the client reads back must include this write */
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
  /* §5.1. valley_current_products is a SHEET FORMULA over the feeding tables,
   * and it only recalculates once the rows it reads are actually on the sheet.
   * Apps Script batches writes, so a save can return, the client can re-read the
   * balance, and the formula can still be answering from before that save. Every
   * handler that writes valley_manufacture_footer, valley_sales_product_stock,
   * valley_warehouse_movement, valley_product_purchasing, valley_manufacture_header
   * or valley_manufacture_header_products flushes before it returns.
   * Never throws: a failed flush must not turn a committed save into an error. */
  function vfFlush_() {
    try { SpreadsheetApp.flush(); } catch (e) {}
  }

  /* valley_current_products, read LIVE on every single call.
   *
   * Trusting current_qty means reading the CURRENT one. getAllRecords_ memoises
   * whole sheets in _recordCache_ for the life of a request, which is right for
   * a table code writes and wrong for one a sheet formula recalculates
   * underneath us — a save that writes a feeding table and then re-reads the
   * balance would see the value from before its own write.
   *
   * So this reads the range directly and neither populates nor consults that
   * memo. There is no CacheService entry either: the old one was keyed by
   * product and not by user, which would have handed one user another user's
   * batch list, cost columns included, the day someone added the put.
   *
   * Every reader of valley_current_products in this module goes through here.
   * The table is never written by code, and its formulas are never touched. */
  function vfCurrentProducts_(dbId) {
    var sheet = getSheet_('valley_current_products', dbId);
    var headers = getHeaders_(sheet);
    countSheetRead_();
    return buildRecordsFromRaw_(sheet.getDataRange().getValues(), headers);
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
      vfCurrentProducts_(dbId).forEach(function (r) {
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
    /* Phase 1: thin wrapper over the shared locked counter. Format unchanged:
     * integer seq; the caller builds `seq + '-' + year`. MUST be called while
     * holding executeWithLock_ (saveValleyInvoice_ opens it). */
    return nextDocumentNumber_(dbId, 'vf_sales_inv', year, {
      taxSystem: taxSystem,
      seedScanner: function () {
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
        return maxSeq;
      }
    });
  }

  /* ── Fast-save path for the sales allocation table (SALES_BATCH_WRITES_) ──
   * valley_sales_product_stock is the one hot spot in the invoice save: the
   * legacy reconciliation reads the whole table with getDataRange() and then
   * pays a setValue round trip per changed cell and a deleteRow round trip per
   * dropped allocation. This does the same reconciliation as one block read of
   * the four columns it needs, one batched patch and one batched delete.
   *
   * Semantics are deliberately identical to the legacy loop it replaces:
   *   - rows belonging to another invoice are skipped outright;
   *   - the first row of a (line, batch) pair wins and duplicates are dropped;
   *   - the user cell is written only when the quantity changes;
   *   - the lot is refreshed only when the stored one is empty;
   *   - row identity (unique_id) and created_at survive an in-place update.
   * preserveFormulas is false here because the legacy path writes these cells
   * with setValue() and this table is script-owned, so there is nothing to
   * protect and no formula probe to pay for. */
  function salesFastReconcileAllocations_(dbId, allocSheet, allocHeaders, invLineUids, wanted, batchCurrent, user) {
    var emailNow = (user && user.email) || '';
    var read = fsReadBlockRows_(allocSheet,
      ['valley_sales_products_id', 'product_unique_id', 'product_qty', 'product_transaction_code']);
    var patches = {};
    var dropRows = [];
    read.rows.forEach(function (a) {
      var luA = String(a.valley_sales_products_id || '').trim();
      if (!luA || !invLineUids[luA]) return;                  /* another invoice's row — never read further */
      var aKey = luA + '|' + String(a.product_unique_id || '').trim();
      var want = wanted[aKey];
      if (!want) { dropRows.push(a.__row); return; }
      var patch = null;
      if (Math.abs(Number(a.product_qty || 0) - want.qty) > 0.0000001) {
        patch = { product_qty: want.qty, user: emailNow };
      }
      if (!String(a.product_transaction_code || '').trim()) {
        var lotFix = (batchCurrent[want.batch_uid] || {}).lot || '';
        if (lotFix) { if (!patch) patch = {}; patch.product_transaction_code = lotFix; }
      }
      if (patch) patches[a.__row] = patch;
      delete wanted[aKey];                                    /* this pair already has its row */
    });
    if (Object.keys(patches).length) {
      fsPatchRowsByNumber_(dbId, allocSheet, patches, { preserveFormulas: false });
    }
    if (dropRows.length) fsDeleteRows_(dbId, allocSheet, dropRows);

    var allocRows = [];
    Object.keys(wanted).forEach(function (wk) {
      var w = wanted[wk];
      var binfo = batchCurrent[w.batch_uid] || {};
      var m3 = {};
      m3['unique_id'] = uid16_();
      m3['valley_sales_products_id'] = w.line_uid;
      m3['product_unique_id'] = w.batch_uid;
      m3['product_transaction_code'] = binfo.lot || '';
      m3['product_qty'] = w.qty;
      m3['user'] = emailNow;
      m3['created_at'] = new Date();
      allocRows.push(allocHeaders.map(function (h) {
        var k = String(h).trim();
        return m3[k] !== undefined ? m3[k] : '';
      }));
    });
    if (allocRows.length) fsAppendRowsBlock_(allocSheet, allocRows);
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
    invDate.setHours(0, 0, 0, 0); /* date-only: never persist a time component */
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
    try {
      var _partyRowsInv = vfRefsCached_(dbId, 'parties_raw', function () { return getAllRecords_(dbId, FIN_PARTIES_SHEET); });
      var _partyIdxInv = indexById(_partyRowsInv, 'id');
      var _partyKeyInv = String(partyId).trim();
      var _partyHitInv = _partyIdxInv.get(_partyKeyInv) || _partyIdxInv.get(_partyKeyInv.toLowerCase()) || null;
      if (_partyHitInv) partyName = String(_partyHitInv.name || partyId);
    } catch (e) {}

    var net = 0, taxVal = 0;
    var cleanLines = [];
    var _prodIdxInv = new Map();
    try {
      _prodIdxInv = indexById(vfRefsCached_(dbId, 'products_raw', function () { return getAllRecords_(dbId, FIN_PRODUCTS_SHEET); }), 'id');
    } catch (e) {}
    lines.forEach(function (ln, idx) {
      var pid = String(ln.product_id || '').trim();
      if (!pid || (!_prodIdxInv.has(pid) && !_prodIdxInv.has(pid.toLowerCase()))) throw new Error('البند ' + (idx + 1) + ': اختر منتجاً صحيحاً');
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
      /* Phase 5: shared totals lib (calcLineNet_) is source of truth. No rounding — raw preserved. */
      var lineNet = (typeof calcLineNet_ === 'function') ? calcLineNet_(qty, price) : qty * price;
      var lineTaxVal = lineNet * tax;
      net += lineNet;
      taxVal += lineTaxVal;
      cleanLines.push({
        unique_id: (ln.unique_id && String(ln.unique_id).trim()) || uid16_(),
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
    /* Phase 5: header totals from shared calcTotals_ (single calc, no parallel). */
    var total = net + taxVal;
    if (typeof calcTotals_ === 'function') {
      var _st = calcTotals_(cleanLines.map(function (cl) { return { qty: cl.qty, price: cl.price, tax: cl.tax }; }));
      net = _st.net; taxVal = _st.tax; total = _st.total;
    }

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
      /* The allocation rows must key on the REWRITTEN line uid: cleanLines[idx]
         minted a uuid when the payload carried none (a new invoice, or a new
         line added mid-edit), and the line rows on the sheet carry that uuid —
         keying on the raw payload uid would orphan the rows under ''. */
      allocByLine.push({ line_uid: cleanLines[idx].unique_id, allocations: als });
    });

    executeWithLock_(function () {
      var sheetInv = getSheet_(FIN_SALES_INV_SHEET, dbId);
      var invHeaders = getHeaders_(sheetInv);
      var dataAll = sheetInv.getDataRange().getValues();
      var numIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'رقم الفاتورة'; });
      var dateIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'تاريخ الفاتورة'; });
      var tsIdx = invHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'tax_system'; });
      var uidIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'invoice_unique_id'; });
      var createdAtIdx = invHeaders.findIndex(function (h) { return String(h).trim() === 'created_at'; });

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
        var __invVerIdx = invHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'version'; });
        var __invOldForVer = {};
        if (__invVerIdx !== -1) __invOldForVer.version = dataAll[rowNum - 1][__invVerIdx];
        var __invVer = checkRowVersion_(__invOldForVer, d.version);
        map.version = __invVer + 1;
        map['version'] = __invVer + 1;
        var rowVals = invHeaders.map(function (h, hi) {
          var k = String(h).trim();
          /* created_at is stamped once at creation and preserved on edit */
          if (k === 'created_at') return dataAll[rowNum - 1][hi];
          return map[k] !== undefined ? map[k] : (k === 'invoice_unique_id' ? existingUid : '');
        });
        sheetInv.getRange(rowNum, 1, 1, rowVals.length).setValues([rowVals]);
        noteMutation_(sheetInv);
        try{ var _oldInv = getAllRecords_(dbId, FIN_SALES_INV_SHEET).find(function(r){ return String(r.invoice_unique_id)===String(existingUid); }) || null; if(!_oldInv){ _oldInv={}; invHeaders.forEach(function(h,hi){ _oldInv[String(h).trim()] = dataAll[rowNum-1][hi]; }); } var _newInv = Object.assign({}, _oldInv||{}, map); logHistory_(dbId, FIN_SALES_INV_SHEET, _oldInv&&_oldInv.record_uid ? _oldInv.record_uid : ('update_'+FIN_SALES_INV_SHEET+'_'+existingUid), existingUid, (user&&user.email)||'', 'update', _newInv, _oldInv) }catch(e){}
      } else {
        map['رقم الفاتورة'] = invoiceNumber;
        map['approval_status'] = 'Pending';
        map['version'] = 0;
        map.version = 0;
        map['invoice_label'] = invoiceNumber + ' - ' + partyName + ' - ' + invDate.toISOString().slice(0, 10) + ' - ' + net;
        var uid = uid16_();
        map['invoice_unique_id'] = uid;
        map['created_at'] = new Date(); /* stamped once at creation; edit path preserves it */
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
      if (editing && fastSaveOnFor_(SALES_BATCH_WRITES_)) {
        /* One parent-scoped read of the invoice's own lines, then delete exactly
           those rows. The legacy pair below reads the whole table once to learn
           the uids and a second time inside deleteRowsByCriteria_ to find the
           rows again. */
        var _priorRows = [];
        try {
          fsReadRowsByParent_(sheetLines, 'valley_sales_header_id', existingUid, ['unique_id']).rows
            .forEach(function (l) {
              priorLineUids.push(String(l.unique_id || '').trim());
              _priorRows.push(l.__row);
            });
        } catch (ePl) {}
        if (_priorRows.length) fsDeleteRows_(dbId, sheetLines, _priorRows);
      } else if (editing) {
        try {
          getAllRecords_(dbId, FIN_SALES_LINES_SHEET).forEach(function (l) {
            if (String(l.valley_sales_header_id || '').trim() === existingUid) priorLineUids.push(String(l.unique_id || '').trim());
          });
        } catch (ePl) {}
        deleteRowsByCriteria_(sheetLines, 'valley_sales_header_id', existingUid);
      }
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

      /* ---- P2: batch-allocation rows (valley_sales_product_stock) ----
       * An edit UPDATES the rows this invoice already owns rather than deleting
       * and re-adding them. A row is identified by (line uid, batch uid), so a
       * changed quantity is one cell write on the SAME row, which keeps its
       * unique_id and created_at. A batch the user added gets a new row; a
       * batch removed — or a whole line removed — loses its row; an invoice
       * re-saved unchanged writes nothing at all.
       *
       * The sheet body is deliberately NOT rewritten in one setValues() the way
       * the previous version did: that rewrote every other invoice's rows too,
       * and regenerated a unique_id and created_at for rows that had merely
       * been re-saved. Deletions are the rare case here (a removed batch or a
       * removed line); the common edit is a quantity, which costs one cell. */
      settingsEnsureSheet_(dbId, 'valley_sales_product_stock',
        ['unique_id','id','valley_sales_products_id','product_unique_id','product_transaction_code','product_qty','user','created_at']);
      var allocSheet = getSheet_('valley_sales_product_stock', dbId);
      var allocHeaders = getHeaders_(allocSheet);
      var allocIdxOf = function (name) {
        return allocHeaders.findIndex(function (h) { return String(h).trim() === name; });
      };
      var aLineIdx = allocIdxOf('valley_sales_products_id');
      var aBatchIdx = allocIdxOf('product_unique_id');
      var aQtyIdx = allocIdxOf('product_qty');
      var aLotIdx = allocIdxOf('product_transaction_code');
      var aUserIdx = allocIdxOf('user');

      /* the line uids this invoice owns now, plus the ones it owned before the
         line rows were rewritten — a line the user deleted must release its
         batches too. The line rows keep their unique_id across that rewrite,
         which is exactly why keying allocation rows on them survives it. */
      var invLineUids = {};
      cleanLines.forEach(function (ln) { invLineUids[ln.unique_id] = true; });
      priorLineUids.forEach(function (lu) { if (lu) invLineUids[lu] = true; });

      /* what the invoice should hold after this save, keyed line|batch.
         batch_uid is trimmed here so the key matches the trimmed sheet key
         below (and the trimmed validation key above): an untrimmed uid would
         delete-then-re-append instead of updating in place. */
      var wanted = {};
      allocByLine.forEach(function (entry) {
        entry.allocations.forEach(function (a) {
          var wBatch = String(a.batch_uid || '').trim();
          wanted[entry.line_uid + '|' + wBatch] =
            { line_uid: entry.line_uid, batch_uid: wBatch, qty: Number(a.qty) };
        });
      });

      if (fastSaveOnFor_(SALES_BATCH_WRITES_)) {
        /* Fast path: the same reconciliation, done as one block read plus one
           batched patch and one batched delete. It returns from the lock
           callback; the shared tail (refs bust, flush, response) still runs. */
        salesFastReconcileAllocations_(dbId, allocSheet, allocHeaders, invLineUids, wanted, batchCurrent, user);
        return;
      }

      /* The whole-table read the legacy reconciliation needs, taken here so the
         fast path above never pays for it. */
      var aData = allocSheet.getDataRange().getValues();
      var dropRows = [];
      for (var ad = 1; ad < aData.length; ad++) {
        var luA = String(aData[ad][aLineIdx] || '').trim();
        if (!luA || !invLineUids[luA]) continue;                  /* another invoice's row — never read further */
        var aKey = luA + '|' + String(aData[ad][aBatchIdx] || '').trim();
        var want = wanted[aKey];
        /* No want left for this pair means either the batch is no longer
           allocated, or an earlier row already satisfied it — a hand-made
           duplicate of the same (line, batch). Either way this row goes, or the
           line would hold that batch's quantity twice. */
        if (!want) { dropRows.push(ad + 1); continue; }
        if (Math.abs(Number(aData[ad][aQtyIdx] || 0) - want.qty) > 0.0000001) {
          allocSheet.getRange(ad + 1, aQtyIdx + 1).setValue(want.qty);
          noteMutation_(allocSheet);
          if (aUserIdx !== -1) {
            allocSheet.getRange(ad + 1, aUserIdx + 1).setValue((user && user.email) || '');
            noteMutation_(allocSheet);
          }
        }
        /* the lot is a label, not a key: refresh it only when it is missing */
        if (aLotIdx !== -1 && !String(aData[ad][aLotIdx] || '').trim()) {
          var lotFix = (batchCurrent[want.batch_uid] || {}).lot || '';
          if (lotFix) {
            allocSheet.getRange(ad + 1, aLotIdx + 1).setValue(lotFix);
            noteMutation_(allocSheet);
          }
        }
        delete wanted[aKey];                                      /* this pair already has its row */
      }

      /* descending, so an earlier deletion cannot shift a later row number */
      for (var dr = dropRows.length - 1; dr >= 0; dr--) {
        allocSheet.deleteRow(dropRows[dr]);
        noteMutation_(allocSheet);
      }

      /* only genuinely new (line, batch) pairs are appended */
      var allocRows = [];
      Object.keys(wanted).forEach(function (wk) {
        var w = wanted[wk];
        var binfo = batchCurrent[w.batch_uid] || {};
        var m3 = {};
        m3['unique_id'] = uid16_();
        m3['valley_sales_products_id'] = w.line_uid;
        m3['product_unique_id'] = w.batch_uid;
        m3['product_transaction_code'] = binfo.lot || '';
        m3['product_qty'] = w.qty;
        m3['user'] = (user && user.email) || '';
        m3['created_at'] = new Date();
        allocRows.push(allocHeaders.map(function (h) {
          var k = String(h).trim();
          return m3[k] !== undefined ? m3[k] : '';
        }));
      });
      if (allocRows.length) {
        var allocStart = allocSheet.getLastRow() + 1;
        allocSheet.getRange(allocStart, 1, allocRows.length, allocHeaders.length).setValues(allocRows);
        noteMutation_(allocSheet);
      }
    });

    finBustRefs_(dbId);
    vfFlush_();   /* the balance the client reads back must include this write */
    return { status: 'success', message: editing ? 'تم تحديث الفاتورة' : 'تم إنشاء الفاتورة' };
  }

  function getValleySalesList_(data, user, dbId) {
    settingsEnsureSheet_(dbId, FIN_SALES_INV_SHEET, FIN_SALES_INV_HEADERS);
    var rows = getReadOnlyRecords_(dbId, FIN_SALES_INV_SHEET);
    /* Slim + newest-first: only the columns the list displays. */
    /* The source array is already oldest-first: new invoices append and edits
     * stay in place. Project and number in one pass, before filtering/paging,
     * so global serials and all vfPage_ modes remain unchanged. */
    var slim = rows.map(function (r, i) {
      return {
        invoice_unique_id: r.invoice_unique_id,
        'رقم الفاتورة': r['رقم الفاتورة'],
        'اسم العميل': r['اسم العميل'],
        'تاريخ الفاتورة': r['تاريخ الفاتورة'],
        'المبلغ الصافي': Number(r['المبلغ الصافي']) || 0,
        'قيمة الضريبة': Number(r['قيمة الضريبة']) || 0,
        'إجمالي': Number(r['إجمالي']) || 0,
        tax_system: String(r.tax_system || '').trim().toLowerCase(),
        approval_status: r.approval_status || 'Pending',
        'مسلسل': i + 1
      };
    });    const sp = vfPage_(slim, data, 'تاريخ الفاتورة');
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

  /* Sales report, invoice by invoice (تقرير المبيعات).
   * Per invoice: sales (إجمالي), discount (Σ valley_sales_products.product_discount —
   * that column has no writer in this app; it sums sheet values when present,
   * 0 otherwise — never added to any ensure-list), returns (Σ
   * valley_return_value by valley_sales_invoices_id), taxes (قيمة الضريبة),
   * net = إجمالي − returns (discount shown separately, not double-subtracted).
   * Rows follow the list rule (oldest-first by sheet order, global مسلسل),
   * then the date-range bounds. Read-only; no schema change. */
  function getValleySalesReport_(data, user, dbId) {
    data = data || {};
    settingsEnsureSheet_(dbId, FIN_SALES_INV_SHEET, FIN_SALES_INV_HEADERS);
    var invRows = getReadOnlyRecords_(dbId, FIN_SALES_INV_SHEET);
    var lineRows = [];
    try { lineRows = getReadOnlyRecords_(dbId, FIN_SALES_LINES_SHEET); } catch (eL) {}
    var retRows = [];
    try { retRows = getReadOnlyRecords_(dbId, FIN_RETURNS_SHEET); } catch (eR) {}

    var discountByInv = {};
    lineRows.forEach(function (l) {
      var key = String(l.valley_sales_header_id || '').trim();
      if (!key) return;
      /* product_discount has no app writer; read the sheet value when present */
      var dv = Number(l.product_discount);
      if (isNaN(dv) || !dv) return;
      discountByInv[key] = Math.round(((discountByInv[key] || 0) + dv) * 100) / 100;
    });

    var returnsByInv = {};
    retRows.forEach(function (r) {
      var key = String(r.valley_sales_invoices_id || '').trim();
      if (!key) return;
      var v = Math.abs(Number(r.valley_return_value) || 0);
      if (!v) return;
      returnsByInv[key] = Math.round(((returnsByInv[key] || 0) + v) * 100) / 100;
    });

    var partyName = {};
    try {
      getAllRecords_(dbId, FIN_PARTIES_SHEET).forEach(function (p) {
        partyName[String(p.id)] = String(p.name || p.id);
      });
    } catch (eP) {}

    var customer = String(data.customer || '').trim();
    var product = String(data.product || '').trim();

    /* Product id -> Arabic label, same resolution as getValleyInvoiceLines_. */
    var prodNameMap = {};
    try {
      getAllRecords_(dbId, FIN_PRODUCTS_SHEET).forEach(function (p) {
        prodNameMap[String(p.id)] = String(p.name_ar || p.id);
      });
    } catch (eN) {}
    var productLabel = product ? (prodNameMap[product] || product) : '';

    function salesLineMatches_(l) {
      if (!product) return true;
      var pid = String(l.product_id != null ? l.product_id : '');
      if (pid === product || pid === productLabel) return true;
      return String(prodNameMap[pid] || '') === product;
    }
    var invHasProduct = {};
    if (product) lineRows.forEach(function (l) {
      if (salesLineMatches_(l)) invHasProduct[String(l.valley_sales_header_id || '').trim()] = true;
    });

    var all = invRows.map(function (r, i) {
      var uid = String(r.invoice_unique_id || '').trim();
      var sales = Number(r['إجمالي']) || 0;
      var discount = discountByInv[uid] || 0;
      var returns = returnsByInv[uid] || 0;
      var taxes = Number(r['قيمة الضريبة']) || 0;
      var rawCustomer = String(r['اسم العميل'] != null ? r['اسم العميل'] : '');
      return {
        invoice_unique_id: uid,
        'مسلسل': i + 1,
        'رقم الفاتورة': r['رقم الفاتورة'],
        'اسم العميل': partyName[rawCustomer] || r['اسم العميل'],
        customer_ref: rawCustomer,
        'تاريخ الفاتورة': r['تاريخ الفاتورة'],
        sales: Math.round(sales * 100) / 100,
        discount: discount,
        returns: returns,
        taxes: Math.round(taxes * 100) / 100,
        net: Math.round((sales - returns) * 100) / 100,
        approval_status: r.approval_status || 'Pending'
      };
    });

    var rows = vfBoundRows_(all, data, 'تاريخ الفاتورة').filter(function (r) {
      if (customer && String(r.customer_ref) !== customer && String(r['اسم العميل']) !== customer) return false;
      if (product && !invHasProduct[String(r.invoice_unique_id)]) return false;
      return true;
    });
    var t = { sales: 0, discount: 0, returns: 0, taxes: 0, net: 0 };
    rows.forEach(function (r) {
      t.sales = Math.round((t.sales + r.sales) * 100) / 100;
      t.discount = Math.round((t.discount + r.discount) * 100) / 100;
      t.returns = Math.round((t.returns + r.returns) * 100) / 100;
      t.taxes = Math.round((t.taxes + r.taxes) * 100) / 100;
      t.net = Math.round((t.net + r.net) * 100) / 100;
    });

    /* Inlines + qty summary, restricted to the listed invoices so the payload
     * stays tight. Gross from invoice lines; net subtracts returns (joined by
     * line uid, the same key the statement uses) — both shown for revision. */
    var allowedInv = {};
    rows.forEach(function (r) { allowedInv[String(r.invoice_unique_id)] = true; });
    var linesByInvoice = {};
    var lineUidToProduct = {};
    var grossByProduct = {};
    lineRows.forEach(function (l) {
      var uid = String(l.valley_sales_header_id || '').trim();
      if (!uid || !allowedInv[uid]) return;
      if (product && !salesLineMatches_(l)) return;
      var pid = String(l.product_id != null ? l.product_id : '');
      var pname = prodNameMap[pid] || pid || '-';
      var qty = Number(l.product_qty) || 0;
      var price = Number(l.product_price) || 0;
      var item = {
        unique_id: l.unique_id,
        product_id: pid,
        product_name: pname,
        product_details: l.product_details || '',
        product_qty: qty,
        product_price: price,
        product_tax: Number(l.product_tax || 0),
        product_discount: Number(l.product_discount || 0)
      };
      (linesByInvoice[uid] = linesByInvoice[uid] || []).push(item);
      var lu = String(l.unique_id || '').trim();
      if (lu) lineUidToProduct[lu] = pname;
      var g = grossByProduct[pname] || (grossByProduct[pname] = { product: pname, gross_qty: 0, gross_value: 0, ret_qty: 0, ret_value: 0 });
      g.gross_qty = Math.round((g.gross_qty + qty) * 100) / 100;
      g.gross_value = Math.round((g.gross_value + qty * price) * 100) / 100;
    });
    retRows.forEach(function (r) {
      var uid = String(r.valley_sales_invoices_id || '').trim();
      if (!uid || !allowedInv[uid]) return;
      var pname = lineUidToProduct[String(r.valley_sales_products_id || '').trim()];
      if (!pname) return;
      var g = grossByProduct[pname] || (grossByProduct[pname] = { product: pname, gross_qty: 0, gross_value: 0, ret_qty: 0, ret_value: 0 });
      g.ret_qty = Math.round((g.ret_qty + (Math.abs(Number(r.valley_return_qty)) || 0)) * 100) / 100;
      g.ret_value = Math.round((g.ret_value + (Math.abs(Number(r.valley_return_value)) || 0)) * 100) / 100;
    });
    var productSummary = Object.keys(grossByProduct).map(function (k) {
      var g = grossByProduct[k];
      return {
        product: g.product,
        gross_qty: g.gross_qty,
        gross_value: Math.round(g.gross_value * 100) / 100,
        net_qty: Math.round((g.gross_qty - g.ret_qty) * 100) / 100,
        net_value: Math.round((g.gross_value - g.ret_value) * 100) / 100
      };
    });
    productSummary.sort(function (a, b) { return b.gross_qty - a.gross_qty; });
    return { status: 'success', rows: rows, totals: t, total: rows.length, linesByInvoice: linesByInvoice, productSummary: productSummary };
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
    /* OPT-3: hoisted out of the row loop — one findIndex per request, not per
       row. A missing header still yields -1, so the miss behavior below (no
       row matches, throw 'not found') is unchanged. */
    var invUidIdx = headers.findIndex(function (h) { return String(h).trim() === 'invoice_unique_id'; });
    for (var r = 1; r < dataAll.length; r++) {
      if (String(dataAll[r][invUidIdx]).trim() === uid) {
        var cur = String(dataAll[r][stIdx]).trim() || 'Pending';
        var next = cur === 'Approved' ? 'Pending' : 'Approved';
        /* Phase 2: Pending<->Approved toggle via table (no inline cur check retained). */
        assertTransition_('vf_sales_inv', cur, next, 'تحويل حالة الفاتورة غير صالح');
        /* OPT-3: the history snapshot comes from the row just located, with
           the same trimmed-header mapping buildRecordsFromRaw_ applies —
           instead of a second full read of this sheet. A matched row always
           carries the uid in a non-blank cell, so the blank-row filter would
           have kept it too; duplicate headers collapse last-wins, identically. */
        var _oldInvA = null;
        try {
          var _oldRec = {};
          headers.forEach(function (h, ci) {
            var _cv = dataAll[r][ci];
            _oldRec[String(h).trim()] = _cv !== undefined ? _cv : '';
          });
          _oldInvA = _oldRec;
        } catch (e) { _oldInvA = null; }
        var _apprEmail = next === 'Approved' ? ((user && user.email) || '') : '';
        var _apprTime = next === 'Approved' ? new Date() : '';
        /* OPT-4: one contiguous range write when the live layout keeps the
           three approval columns adjacent — verified from the headers just
           read, never assumed. Same cells, same values, one noteMutation_.
           Otherwise the three original single-cell writes run verbatim,
           preserving even their failure behavior on a drifted layout. */
        if (stIdx !== -1 && apIdx === stIdx + 1 && atIdx === apIdx + 1) {
          sheet.getRange(r + 1, stIdx + 1, 1, 3).setValues([[next, _apprEmail, _apprTime]]);
          noteMutation_(sheet);
        } else {
          sheet.getRange(r + 1, stIdx + 1).setValue(next);
          noteMutation_(sheet);
          sheet.getRange(r + 1, apIdx + 1).setValue(_apprEmail);
          noteMutation_(sheet);
          sheet.getRange(r + 1, atIdx + 1).setValue(_apprTime);
          noteMutation_(sheet);
        }
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
    /* Phase 2 S2: Approved delete-block routed through table (no inline cur check).
     * 'delete' pseudo-target: Pending->delete allowed, Approved->delete blocked. */
    var invRows = getReadOnlyRecords_(dbId, FIN_SALES_INV_SHEET);
    var __delCur = null;
    for (var vi = 0; vi < invRows.length; vi++) {
      if (String(invRows[vi].invoice_unique_id).trim() === uid) { __delCur = String(invRows[vi].approval_status || 'Pending'); break; }
    }
    if (__delCur !== null) assertTransition_('vf_sales_inv', __delCur, 'delete', 'لا يمكن حذف فاتورة معتمدة — أرجعها لقيد الانتظار أولاً');
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

  /* ── Fast-save path for sales returns (RETURNS_BATCH_WRITES_) ─────────────
   * Append-only module: two insert sections, no patching and no deletion.
   * What changes versus the legacy path is the READING, not the writing:
   *
   *   legacy                                          this path
   *   getAllRecords_(returns)  x2 (same table twice)   1 column read (id) + 1 two-column block
   *   getAllRecords_(lines)     full 13-col objects   1 four-column block for this invoice
   *   getAllRecords_(stock)     full 8-col objects    1 four-column block
   *   getAllRecords_(returns_stock) INSIDE items loop 1 two-column block, hoisted out
   *   getAllRecords_(invoices)  full 26-col objects   1 parent-scoped read of one column
   *
   * Every validation, every error message, the group serial, the FIFO restore
   * arithmetic and the history entry are identical to the legacy path. The
   * writes go through the engine's insert section, which is one contiguous
   * write per table plus the table-version stamp that drives the client's
   * refresh prompt. The legacy function is left untouched beneath this one. */
  function saveValleyReturnFast_(data, user, dbId) {
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
      var sheetStock = getSheet_(FIN_RETURNS_STOCK_SHEET, dbId);
      var stockHeaders = getHeaders_(sheetStock);

      /* group serial — the max id, read from the id column alone */
      var nextNum = 1;
      fsReadColumnValues_(sheetRet, 'id').values.forEach(function (v) {
        var n = Number(v);
        if (Number.isInteger(n) && n >= nextNum) nextNum = n + 1;
      });
      var groupId = nextNum;

      /* Line ownership, so an item naming another invoice's line still gets the
         legacy "does not belong to this invoice" refusal rather than a generic
         "line not found". Two narrow reads, no full-table object build. */
      var lineOwner = {};
      try {
        fsReadBlockRows_(getSheet_(FIN_SALES_LINES_SHEET, dbId), ['unique_id', 'valley_sales_header_id']).rows
          .forEach(function (l) {
            var lu = String(l.unique_id || '').trim();
            if (lu) lineOwner[lu] = String(l.valley_sales_header_id || '').trim();
          });
      } catch (eOwner) {}

      /* this invoice's own lines */
      var lineUids = {};
      var allocByLine = {};
      try {
        fsReadRowsByParent_(getSheet_(FIN_SALES_LINES_SHEET, dbId), 'valley_sales_header_id', invUid,
          ['unique_id', 'product_price', 'product_qty']).rows.forEach(function (l) {
            var lu = String(l.unique_id || '').trim();
            lineUids[lu] = {
              belongs: true,
              price: Number(l.product_price || 0),
              qty: Number(l.product_qty || 0)
            };
            allocByLine[lu] = [];
          });
      } catch (eLines) {}

      /* every line's allocations: one block on the set-membership columns */
      var restoredEver = {};
      try {
        fsReadBlockRows_(getSheet_('valley_sales_product_stock', dbId),
          ['valley_sales_products_id', 'unique_id', 'product_transaction_code', 'product_qty']).rows
          .forEach(function (a) {
            var lu = String(a.valley_sales_products_id || '').trim();
            if (!allocByLine[lu]) return;
            allocByLine[lu].push({
              alloc_uid: String(a.unique_id || ''),
              lot: String(a.product_transaction_code || ''),
              qty: Number(a.product_qty || 0)
            });
            restoredEver[String(a.unique_id || '')] = 0;
          });
      } catch (eStock) {}

      /* already returned, per line */
      var returnedByLine = {};
      fsReadBlockRows_(sheetRet, ['valley_sales_products_id', 'valley_return_qty']).rows.forEach(function (r) {
        var lu = String(r.valley_sales_products_id || '').trim();
        if (!lu) return;
        returnedByLine[lu] = (returnedByLine[lu] || 0) + Number(r.valley_return_qty || 0);
      });

      /* restored so far, per allocation — hoisted out of the item loop */
      fsReadBlockRows_(sheetStock, ['product_unique_id', 'product_qty']).rows.forEach(function (rs) {
        var au = String(rs.product_unique_id || '').trim();
        if (au && restoredEver[au] !== undefined) restoredEver[au] += Number(rs.product_qty || 0);
      });

      var retRowsToWrite = [];
      var stockRowsToWrite = [];
      var nowStamp = new Date();
      var email = (user && user.email) || '';

      items.forEach(function (it, idx) {
        var lu = String(it.line_uid || '').trim();
        var info = lineUids[lu];
        if (!info) {
          if (lineOwner[lu] !== undefined) throw new Error('البند ' + (idx + 1) + ': البند لا ينتمي لهذه الفاتورة');
          throw new Error('البند ' + (idx + 1) + ': بند غير موجود');
        }
        var qty = Number(it.qty);
        if (!isFinite(qty) || qty <= 0) throw new Error('البند ' + (idx + 1) + ': الكمية يجب أن تكون أكبر من صفر');
        var alreadyReturned = returnedByLine[lu] || 0;
        var returnable = info.qty - alreadyReturned;
        if (qty > returnable + 0.0001) {
          throw new Error('البند ' + (idx + 1) + ': الكمية المرتجعة تتجاوز المسموح (' + returnable + ')');
        }
        var value = qty * info.price;

        var rowUuid = uid16_();
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

        /* FIFO restore across the line's original allocations. The restored
           figure is the SHEET state, deliberately never mutated by this
           request: the legacy path re-derived it per item, so reproducing that
           exactly keeps the accepted/refused quantities identical. */
        var remainingRestore = qty;
        for (var ai = 0; ai < allocByLine[lu].length && remainingRestore > 0.0001; ai++) {
          var al = allocByLine[lu][ai];
          var capacity = al.qty - (restoredEver[al.alloc_uid] || 0);
          if (capacity <= 0.0001) continue;
          var take = Math.min(capacity, remainingRestore);
          stockRowsToWrite.push(stockHeaders.map(function (h) {
            var k = String(h).trim();
            var m4 = {
              unique_id: uid16_(),
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

      /* client id from the invoice header — one parent-scoped read */
      var clientId = '';
      try {
        var invRows = fsReadRowsByParent_(getSheet_(FIN_SALES_INV_SHEET, dbId), 'invoice_unique_id', invUid, ['اسم العميل']).rows;
        if (invRows.length) clientId = String(invRows[0]['اسم العميل'] || '');
      } catch (eInv) {}
      var ci = retHeaders.findIndex(function (h) { return String(h).trim() === 'valley_sales_invoices_client'; });
      retRowsToWrite = retRowsToWrite.map(function (row) {
        row[ci >= 0 ? ci : 3] = clientId;
        return row;
      });

      var sections = [];
      if (retRowsToWrite.length) sections.push({ sheetName: FIN_RETURNS_SHEET, mode: 'insert', insertRows: retRowsToWrite });
      if (stockRowsToWrite.length) sections.push({ sheetName: FIN_RETURNS_STOCK_SHEET, mode: 'insert', insertRows: stockRowsToWrite });
      if (sections.length) fastSaveSections_({ scopeId: dbId, lock: false, sections: sections });

      if (retRowsToWrite.length) {
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
    });

    finBustRefs_(dbId);
    vfFlush_();
    return { status: 'success', message: 'تم تسجيل المرتجع بنجاح' };
  }

  function saveValleyReturn_(data, user, dbId) {
    if (fastSaveOnFor_(RETURNS_BATCH_WRITES_)) return saveValleyReturnFast_(data, user, dbId);
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

        var rowUuid = uid16_();
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
              unique_id: uid16_(),
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
    vfFlush_();   /* the balance the client reads back must include this write */
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
    ValleyFoods.register('update_deduction',          updateDeduction_);
    ValleyFoods.register('get_contracts_data',        getContractsData_);
    ValleyFoods.register('add_contract',              addContract_);
    ValleyFoods.register('update_contract',           updateContract_);
    ValleyFoods.register('get_vacation_alloc_data',   getVacationAllocData_);
    ValleyFoods.register('add_vacation_alloc',        addVacationAlloc_);
    ValleyFoods.register('get_vacations_data',        getVacationsData_);
    ValleyFoods.register('add_vacation',              addVacation_);
    ValleyFoods.register('update_vacation',           updateVacation_);
    ValleyFoods.register('delete_vacation',           deleteVacation_);
    ValleyFoods.register('get_overtime_data',         getOvertimeData_);
    ValleyFoods.register('add_overtime',              addOvertime_);
    ValleyFoods.register('update_overtime',           updateOvertime_);
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
    ValleyFoods.register('save_valley_mfg_agreement', saveValleyMfgAgreement_);
    ValleyFoods.register('cancel_valley_mfg_agreement', cancelValleyMfgAgreement_);

    ValleyFoods.register('get_valley_cash',    getValleyCash_);
    ValleyFoods.register('get_valley_cash_expense_report', getValleyCashExpenseReport_);
    ValleyFoods.register('get_valley_cash_income_report', getValleyCashIncomeReport_);
    ValleyFoods.register('get_valley_cash_box_balance_report', getValleyCashBoxBalanceReport_);
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
    ValleyFoods.register('get_valley_mfg_request_diagnosis', getValleyMfgRequestDiagnosis_);
    ValleyFoods.register('get_valley_mfg_client_report', getValleyMfgClientReport_);
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
    ValleyFoods.register('get_valley_sales_report',   getValleySalesReport_);

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

  /* Phase 2: register field validators for validateBeforeWrite (no logic duplicated —
   * each entry calls the existing validators). Status-only paths skip via STATUS_ONLY_ACTIONS_. */
  try {
    if (typeof registerDocValidator_ === 'function') {
      registerDocValidator_('vf_mfg_agree', function(payloadData, dbId){
        var d = payloadData || {};
        mfgAgreeCheckProduct_(dbId, String(d.client_id == null ? '' : d.client_id).trim(), String(d.product_id == null ? '' : d.product_id).trim());
        mfgAgreeCheckMoney_(d.qty, d.unit_price);
      });
    }
  } catch(eRegVF){}
  }

  return {
    getDeductionsData_: getDeductionsData_,
    addDeduction_: addDeduction_,
    updateDeduction_: updateDeduction_,
    getContractsData_: getContractsData_,
    addContract_: addContract_,
    updateContract_: updateContract_,
    getVacationAllocData_: getVacationAllocData_,
    addVacationAlloc_: addVacationAlloc_,
    getVacationsData_: getVacationsData_,
    addVacation_: addVacation_,
    updateVacation_: updateVacation_,
    deleteVacation_: deleteVacation_,
    getOvertimeData_: getOvertimeData_,
    addOvertime_: addOvertime_,
    updateOvertime_: updateOvertime_,
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
    saveValleyParty_: saveValleyParty_,
    canSeeReportCost_: vfCanSeeCost_
  };
})();



/* CONSOLIDATED VALLEYFOODS FINANCIAL REPORTING — existing records only.
 * No setup helpers, company writes, persistent report cache, or accounting tables.
 * The surrounding authenticated router still touches sessions and audits reads.
 */
var ValleyFoodsFinancialReporting = (function () {
  var COMPANY = '9940659bd83035d7', PAGE = 'vf_income_statement';
  var TABLES = {
    invoices: 'valley_sales_invoices',
    lines: 'valley_sales_products',
    returns: 'valley_sales_returns',
    allocations: 'valley_sales_product_stock',
    purchases: 'valley_product_purchasing',
    manufacture: 'valley_manufacture_header',
    byproducts: 'valley_manufacture_by_product',
    products: 'valley_products',
    returnStock: 'valley_sales_returns_stock',
    consumption: 'valley_manufacture_footer',
    warehouse: 'valley_warehouse_movement'
  };
  var COST_TABLES = ['allocations','purchases','manufacture','byproducts','products','returnStock','consumption','warehouse'];
  function str_(v) { return v == null ? '' : String(v).trim(); }
  function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function t_(v) {
    var y, m, d;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return 0;
      y = v.getUTCFullYear(); m = v.getUTCMonth(); d = v.getUTCDate();
    } else {
      if (v == null || v === '') return 0;
      var mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v).trim());
      if (mt) { y = +mt[1]; m = +mt[2] - 1; d = +mt[3]; }
      else { var x = new Date(v); if (isNaN(x.getTime())) return 0; y = x.getUTCFullYear(); m = x.getUTCMonth(); d = x.getUTCDate(); }
    }
    return Date.UTC(y, m, d);
  }
  function period_(start, end) {
    var p = { start: '', end: '', fromT: 0, toT: 0 };
    p.fromT = t_(start); p.toT = t_(end);
    if (!p.fromT || !p.toT || p.fromT > p.toT) throw new Error('أدخل بداية ونهاية صحيحتين للفترة YYYY-MM-DD');
    function day(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2); }
    p.start = day(p.fromT); p.end = day(p.toT);
    return p;
  }
  function round_(v) { return v == null ? null : Math.round(v * 100) / 100; }
  function r3_(v) { return Math.round(v * 1000) / 1000; }
  function map_() { return Object.create(null); }
  function authorize_(user, dbId) {
    if (!user || (!user.isSuperAdmin && user.company !== COMPANY) || !unifiedCheck_(user, COMPANY, PAGE, 'read')) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    if (!dbId || String(dbId) !== String(getCompanySpreadsheetId_(COMPANY))) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    // Reuse the existing scoped write/full grant and legacy unused-grant policy.
    return !!ValleyFoodsHRModules.canSeeReportCost_(user);
  }
  function snapshot_(dbId, cost) {
    var rows = {}, ok = { invoices: true, lines: true, returns: true };
    Object.keys(TABLES).forEach(function (alias) {
      rows[alias] = [];
      if (!cost && COST_TABLES.indexOf(alias) !== -1) return;
      try { rows[alias] = getAllRecords_(dbId, TABLES[alias]) || []; }
      catch (e) { rows[alias] = []; if (alias === 'invoices' || alias === 'lines' || alias === 'returns') ok[alias] = false; }
    });
    return { rows: rows, cost: cost, ok: ok };
  }
  function prepare_(s) {
    var ix = { invoices: map_(), lines: map_(), returns: map_(), purchases: map_(), manufacture: map_(), byproducts: map_() };
    function put(map, k, r) { if (k && !Object.prototype.hasOwnProperty.call(map, k)) map[k] = r; }
    s.rows.invoices.forEach(function (r) { put(ix.invoices, str_(r.invoice_unique_id), r); });
    s.rows.lines.forEach(function (r) { put(ix.lines, str_(r.unique_id), r); });
    s.rows.returns.forEach(function (r) { put(ix.returns, str_(r.unique_id), r); });
    var allocByLine = map_();
    s.rows.allocations.forEach(function (a) {
      var k = str_(a.valley_sales_products_id);
      if (!k) return;
      if (!allocByLine[k]) allocByLine[k] = [];
      allocByLine[k].push(a);
    });
    var productCat = map_();
    s.rows.products.forEach(function (r) { var k = str_(r.id); if (k) productCat[k] = str_(r.category); });
    if (s.cost) {
      s.rows.purchases.forEach(function (r) { put(ix.purchases, str_(r.unique_id), r); });
      s.rows.manufacture.forEach(function (r) { put(ix.manufacture, str_(r.unique_id), r); });
      s.rows.byproducts.forEach(function (r) { put(ix.byproducts, str_(r.unique_id), r); });
    }
    s.ix = ix; s.allocByLine = allocByLine; s.productCat = productCat;
    s.invDate = map_();
    s.rows.invoices.forEach(function (r) { var k = str_(r.invoice_unique_id); if (k && !s.invDate[k]) s.invDate[k] = t_(r['تاريخ الفاتورة']); });
    s.retDate = map_();
    s.rows.returns.forEach(function (r) { var k = str_(r.unique_id); if (k && !s.retDate[k]) s.retDate[k] = t_(r.valley_return_date); });
    return s;
  }
  function rawNum_(r, field) {
    var v = r[field];
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function unitCost_(s, uid) {
    uid = str_(uid); if (!uid) return null;
    var p = s.ix.purchases[uid];
    if (p) { var u = rawNum_(p, 'unit_cost'); if (u !== null && u >= 0) return u; }
    var m = s.ix.manufacture[uid];
    if (m) { var t = rawNum_(m, 'total_batch_cost'), q = rawNum_(m, 'actual_qty'); if (t !== null && t >= 0 && q !== null && q > 0) return t / q; }
    var b = s.ix.byproducts[uid];
    if (b) { var t2 = rawNum_(b, 'total_cost'), q2 = rawNum_(b, 'qty'); if (t2 !== null && t2 >= 0 && q2 !== null && q2 > 0) return t2 / q2; }
    return null;
  }
  function ident_(s, uid) {
    uid = str_(uid); if (!uid) return '';
    var p = s.ix.purchases[uid];
    if (p && str_(p.movement_code)) return str_(p.movement_code);
    var m = s.ix.manufacture[uid];
    if (m && str_(m.transaction_code)) return str_(m.transaction_code);
    var b = s.ix.byproducts[uid];
    if (b && str_(b.transaction_code)) return str_(b.transaction_code);
    return '';
  }
  function qty_(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function core_(s, fromT, toT) {
    var revenue = { gross: 0, returns: 0, line_count: 0, return_count: 0 };
    var cTotal = 0, cQty = 0, cUnpriced = 0, cogBatch = map_(), cogOrder = [];
    var acc = map_(), order = [], excluded = 0;
    function batch(bk) {
      if (!Object.prototype.hasOwnProperty.call(acc, bk)) { acc[bk] = { start: 0, purch: 0, inOther: 0, sold: 0, out: 0, excl: 0, end: 0 }; order.push(bk); }
      return acc[bk];
    }
    function leg(uid, t, q, kind, product) {
      if (!uid || q === null) return;
      var g = batch(uid);
      if (!t || t < fromT) { g.start += q; g.end += q; return; }
      if (t > toT) return;
      g.end += q;
      if (kind === 1) {
        if (s.productCat[str_(product)] === '3') { excluded += q; g.excl += q; return; }
        g.purch += q;
      }
      else if (kind === 2) g.sold -= q;
      else if (kind === 3) g.out -= q;
      else g.inOther += q;
    }
    s.rows.lines.forEach(function (line) {
      var d = s.invDate[str_(line.valley_sales_header_id)] || 0;
      if (!d || d < fromT || d > toT) return;
      var v = qty_(line.product_net_value);
      revenue.gross += v === null ? 0 : v; revenue.line_count++;
      var allocs = s.allocByLine[str_(line.unique_id)] || [];
      if (!allocs.length) {
        var lq = qty_(line.product_qty);
        cUnpriced += lq === null ? 0 : lq;
        return;
      }
      allocs.forEach(function (a) {
        var aq = qty_(a.product_qty);
        if (aq === null) return;
        var bk = str_(a.product_unique_id);
        if (!bk) return;
        var u = unitCost_(s, bk);
        if (u === null) { cUnpriced += aq; leg(bk, d, -aq, 2); return; }
        cTotal += aq * u; cQty += aq;
        if (!Object.prototype.hasOwnProperty.call(cogBatch, bk)) { cogBatch[bk] = { batch: bk, qty: 0, unit_cost: u, total: 0 }; cogOrder.push(bk); }
        var g = cogBatch[bk];
        g.qty += aq; g.total += aq * u;
        leg(bk, d, -aq, 2);
      });
    });
    s.rows.returns.forEach(function (r) {
      var d = s.retDate[str_(r.unique_id)] || 0;
      if (!d || d < fromT || d > toT) return;
      var v = qty_(r.valley_return_value);
      revenue.returns += v === null ? 0 : v; revenue.return_count++;
    });
    s.rows.manufacture.forEach(function (r) {
      if (str_(r.mo_status) !== 'Locked') return;
      leg(str_(r.unique_id), t_(r.manufacture_date), qty_(r.actual_qty), 0);
    });
    s.rows.byproducts.forEach(function (r) { leg(str_(r.unique_id), t_(r.manufacture_date), qty_(r.qty), 0); });
    s.rows.purchases.forEach(function (r) {
      leg(str_(r.unique_id), t_(r.receipt_date) || t_(r.invoice_date), qty_(r.qty), 1, r.product);
    });
    s.rows.returnStock.forEach(function (r) {
      leg(str_(r.product_unique_id), s.retDate[str_(r.valley_sales_returns_id)] || 0, qty_(r.product_qty), 0);
    });
    s.rows.warehouse.forEach(function (r) {
      var q = qty_(r.movmenent_sign);
      leg(str_(r.item), t_(r.movement_date), q, q !== null && q < 0 ? 3 : 0);
    });
    s.rows.consumption.forEach(function (r) {
      var q = qty_(r.qty);
      if (q !== null) leg(str_(r.item), t_(r.created_at), -q, 3);
    });
    order.sort();
    var stockLines = order.map(function (bk) {
      var g = acc[bk], u = unitCost_(s, bk);
      function val(qty) { return u === null ? null : round_(qty * u); }
      return { batch: bk, ident: ident_(s, bk),
        start: r3_(g.start), purchasing: r3_(g.purch), in_other: r3_(g.inOther),
        sold: r3_(g.sold), out_other: r3_(g.out), excluded: r3_(g.excl), end: r3_(g.end),
        unit_cost: u === null ? null : round_(u),
        start_v: val(g.start), purch_v: val(g.purch), end_v: val(g.end), cogs_v: val(g.sold) };
    });
    var cogsLines = cogOrder.map(function (bk) { var g = cogBatch[bk]; return { batch: g.batch, ident: ident_(s, g.batch), qty: r3_(g.qty), unit_cost: round_(g.unit_cost), total: round_(g.total) }; });
    revenue.gross = round_(revenue.gross); revenue.returns = round_(revenue.returns);
    return {
      revenue: { gross: revenue.gross, returns: revenue.returns, net: round_(revenue.gross - revenue.returns),
        line_count: revenue.line_count, return_count: revenue.return_count,
        sources_ready: !!(s.ok.invoices && s.ok.lines && s.ok.returns) },
      cogs: { value: round_(cTotal), qty: r3_(cQty), unpriced_qty: r3_(cUnpriced), lines: cogsLines },
      stock: { lines: stockLines, excluded_fixed: r3_(excluded) }
    };
  }
  /* Revenue, COGS and stock now come from core_() in a single pass per table. */
  function calculate_(data, user, dbId) {
    data = data || {};
    var cost = authorize_(user, dbId), p = period_(data.start, data.end);
    var s = prepare_(snapshot_(dbId, cost));
    var r = core_(s, p.fromT, p.toT);
    return { cost: cost, period: { start: p.start, end: p.end },
      revenue: r.revenue, cogs: cost ? r.cogs : null, stock: cost ? r.stock : null };
  }
  function summary_(c) {
    function gross(rev, cg) { return cg ? round_(rev.net - cg.value) : null; }
    return { status: 'success', period: c.period, can_see_cost: c.cost,
      revenue: c.revenue,
      cogs: c.cogs || { state: 'restricted' },
      stock: c.stock || { state: 'restricted' },
      gross: gross(c.revenue, c.cogs),
      generated_at: new Date().toISOString() };
  }
  function reportAction_(data, user, dbId) { return summary_(calculate_(data, user, dbId)); }
  return { reportAction_: reportAction_ };
})();

if (typeof ValleyFoods !== 'undefined' && ValleyFoods.register) {
  ValleyFoods.register('get_valley_income_statement', ValleyFoodsFinancialReporting.reportAction_);
}

ValleyFoods.approvalPolicy_ = {
  aliases: { vf_purchasing_quality: 'vf_purchasing', vf_att_batch: 'att_batch', attendance_batch: 'att_batch' },
  chains: [
    { docType: 'valley_purchasing', step: 'approve', role: 'valley_approver', required: true, sheet: 'valley_purchasing_costing', keyColumn: 'Code', kind: 'standard', versioned: false, missingMsg: 'عملية الشراء غير موجودة' },
    { docType: 'valley_purchasing', step: 'quality', role: 'valley_quality', required: true, sheet: 'valley_purchasing_costing', keyColumn: 'Code', kind: 'quality', versioned: false, missingMsg: 'عملية الشراء غير موجودة' }
  ],
  transitions: {
    vf_purchasing: { pending: ['approved', 'edit'], approved: [] },
    vf_purchasing_quality: { pending: ['approved', 'edit'], approved: [] },
    vf_mfg_order: { draft: ['in progress'], 'in progress': ['locked'], locked: ['in progress'] },
    vf_mfg_agree: { draft: ['active', 'completed', 'cancelled'], active: ['completed', 'cancelled'], completed: ['cancelled'], cancelled: [] },
    vf_sales_inv: { pending: ['approved', 'delete'], approved: ['pending'] },
    att_batch: { active: ['reverted'], reverted: [] },
    vf_att_batch: { active: ['reverted'], reverted: [] },
    attendance_batch: { active: ['reverted'], reverted: [] }
  },
  actionToDocType: {
    save_valley_purchasing_header_checkpoint: 'vf_purchasing', save_valley_purchasing_lines_checkpoint: 'vf_purchasing',
    save_valley_purchasing_costing: 'vf_purchasing', delete_valley_purchasing_costing: 'vf_purchasing',
    approve_valley_purchasing_costing: 'vf_purchasing', quality_approve_valley_purchasing_costing: 'vf_purchasing',
    change_valley_mfg_status: 'vf_mfg_order', save_valley_mfg_order: 'vf_mfg_order',
    save_valley_mfg_agreement: 'vf_mfg_agree', cancel_valley_mfg_agreement: 'vf_mfg_agree',
    save_valley_invoice: 'vf_sales_inv', approve_valley_invoice: 'vf_sales_inv', delete_valley_invoice: 'vf_sales_inv',
    commit_attendance_import: 'att_batch', revert_attendance_import: 'att_batch'
  },
  statusOnly: {
    approve_valley_purchasing_costing: true, quality_approve_valley_purchasing_costing: true,
    change_valley_mfg_status: true, cancel_valley_mfg_agreement: true,
    approve_valley_invoice: true, delete_valley_invoice: true,
    revert_attendance_import: true, delete_valley_purchasing_costing: true
  }
};
ValleyFoods.themeCss_ = function () { return getGenericCompanyThemeCSS_('9940659bd83035d7'); };
ValleyFoods.blockTheme_ = function () { return { from: '#054719', to: '#16a34a' }; };
ValleyFoods.attachmentPolicy_ = function () { return {
  vf_hr_deductions: { company: '9940659bd83035d7', sheet: 'valley_emp_deductions', idField: 'unique_id', fileFields: ['deduction_attachement'], folder: 'valley_emp_deductions_Files_' },
  vf_hr_overtime: { company: '9940659bd83035d7', sheet: 'valley_emp_overtime', idField: 'unique_id', fileFields: ['overtime_attachement'], folder: 'valley_emp_overtime_Files_' },
  vf_hr_vacations: { company: '9940659bd83035d7', sheet: 'valley_employee_vacations', idField: 'unique_id', fileFields: ['attachment'], folder: 'valley_employee_vacations_Files_' }
}; };
ValleyFoods.artifactHandlers_ = {};
