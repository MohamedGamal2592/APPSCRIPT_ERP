/**
 * Company_TopChemical_Actions.js
 * RESPONSIBILITY: Top Chemical business logic, IIFE-namespaced to TopChemical.
 * Modules so far: dashboard (placeholder), عملاء وموردين (clients_vendors),
 * مديونيات (AR_AP), الأصناف (products with Drive print_file). More modules added
 * as pages are built.
 * Action logic stays inside the IIFE namespace (the only global is TopChemical).
 * The payroll print reports (كشف الكروت / كشف الأقسام) live at the bottom of
 * this file at global scope because Code.js routes download=payroll_report
 * straight to servePayrollReport_().
 */

const TopChemical = (function () {
  const actions = {};
  function register(name, fn) { actions[name] = fn; }

  // MySQL timing metadata is operational diagnostics, not page data. Keep it
  // in action results for super admins only; authorized users can otherwise
  // inspect the full RPC result in their browser.
  function readDiagnosticsForUser_(result, user) {
    if (user && user.isSuperAdmin) return result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
    var safe = Object.assign({}, result);
    delete safe._mysql;
    delete safe.timing_ms;
    delete safe.payload_bytes;
    delete safe.served_at;
    delete safe.catalog_ttl_ms;
    return safe;
  }

  const COMPANY_UID = '3fe1b5cb67b7223e';
  const CLIENTS_SHEET = 'clients_vendors';
  const ARAP_SHEET = 'AR_AP';
  const PRODUCTS_SHEET = 'products';
  const CATEGORIES_SHEET = 'product_categories';
  const CURRENCY_SHEET = 'ERP_currency_exchange';
  const BARCODE_SHEET = 'top_chemical_barcode_generator';
  const REGISTRATION_SHEET = 'registration_papers';
  const TRUST_SHEET = 'عهد وحسابات خاصة';
  const EMPLOYEE_SHEET = 'employee_info';
  const STOCK_SHEET = 'stock_revision';
  const CUSTOMS_OFFICE_SHEET = 'مكتب الجمارك';
  const VENDORS_SHEET = 'top_chemical_vendors';
  const ITEMS_SHEET = 'top_chemical_items';
  const PURCHASE_SHEET = 'top_chemical_purchase_items';
  const IMPORT_FOLLOW_SHEET = 'legal_importation_follow';
  const CUSTOMER_VENDOR_SHEET = 'legal_customer_vendor';
  const CARTON_SIZES_SHEET = 'purchasing_support_data';
  const EMP_STATUS_SHEET = 'employee_status';
  const EMP_SALARY_SHEET = 'employee_salary';
  const EMP_DEDUCTIONS_SHEET = 'emp_deductions';
  const EMP_PERMITS_SHEET = 'emp_permits';
  const EMP_OVERTIME_SHEET = 'emp_overtime';
  const EMP_SALARIES_SHEET = 'emp_salaries';
  const EMP_SALARIES_CLOSE_SHEET = 'emp_salaries_close';
  const TITLE_INDEX_SHEET = 'title_index';
  // حسابات الميزانية (legal budget) — used AS-IS, no schema changes.
  const LEGAL_PRODUCTS_SHEET = 'legal_products';
  const LEGAL_PARTIES_SHEET = 'legal_customer_vendor';
  const LEGAL_COSTING_SHEET = 'legal_purchasing_costing';
  const LEGAL_PURCHASING_SHEET = 'legal_product_purchasing';
  const LEGAL_INVOICES_SHEET = 'legal_invoices';
  const LEGAL_CASH_SHEET = 'legal_cash_bank_movement';
  const LEGAL_MANUFACTURE_SHEET = 'legal_manufacture';
  const LEGAL_EMPLOYEES_SHEET = 'legal_employee_info';
  const LEGAL_SALARIES_SHEET = 'legal_salaries';
  const LEGAL_CURRENT_SHEET = 'legal_current_products';
  const LEGAL_MOVEMENT_SHEET = 'legal_products_movement';
  const LEGAL_INCOME_SHEET = 'income_statement_yearly';
  const LEGAL_BANK_SHEET = 'bank_index';
  const LEGAL_BOX_SHEET = 'box_account_codes';
  const LEGAL_CHART_SHEET = 'chart_of_accounts';

  /**
   * Page-level access requirements per action. 'read' actions need any grant
   * (read or write) on the page; 'write' actions need the 'write' grant.
   * Edit actions are not listed: they stay Super Admin only (canCompanyAction_).
   */
  const PAGE_ACCESS = {
    'get_dashboard_data': { page: 'tc_dashboard', access: 'read' },
    'get_executive_followup': { page: 'tc_executive_followup', access: 'read' },
    'get_executive_followup_summary': { page: 'tc_executive_followup', access: 'read' },
    'get_clients_vendors': { page: 'tc_clients_vendors', access: 'read' },
    'add_client_vendor': { page: 'tc_clients_vendors', access: 'write' },
    'get_ar_ap': { page: 'tc_debts', access: 'read' },
    'get_ar_ap_client': { page: 'tc_debts', access: 'read' },
    'add_ar_ap': { page: 'tc_debts', access: 'write' },
    'get_products': { page: 'tc_products', access: 'read' },
    'add_product': { page: 'tc_products', access: 'write' },
    'get_barcode': { page: 'tc_barcode', access: 'read' },
    'add_barcode': { page: 'tc_barcode', access: 'write' },
    'get_registration_papers': { page: 'tc_registration_papers', access: 'read' },
    'add_registration_paper': { page: 'tc_registration_papers', access: 'write' },
    'update_registration_paper': { page: 'tc_registration_papers', access: 'write' },
    'get_trust_accounts': { page: 'tc_trust', access: 'read' },
    'get_trust_movements': { page: 'tc_trust', access: 'read' },
    'add_trust_movement': { page: 'tc_trust', access: 'write' },
    'get_stock_revision': { page: 'tc_stock_revision', access: 'read' },
    'add_stock_revision': { page: 'tc_stock_revision', access: 'write' },
    'update_stock_revision': { page: 'tc_stock_revision', access: 'full' },
    'get_system_qty': { page: 'tc_stock_revision', access: 'read' },
    /* جرد دوري مخازن باركود — the floor-facing scan screen. Same underlying
       sheet and mostly the same handlers as tc_stock_revision (accounting),
       registered under separate action names below so the two pages can be
       granted independently instead of sharing one permission. */
    'get_stock_scan_options': { page: 'tc_stock_scan', access: 'read' },
    'get_stock_scan_sheet_catalog': { page: 'tc_stock_scan', access: 'read' },
    'get_stock_scan_history': { page: 'tc_stock_scan', access: 'read' },
    'get_stock_scan_qty': { page: 'tc_stock_scan', access: 'read' },
    'get_stock_scan_warehouses': { page: 'tc_stock_scan', access: 'read' },
    'get_stock_scan_balance': { page: 'tc_stock_scan', access: 'read' },
    'get_stock_scan_catalog': { page: 'tc_stock_scan', access: 'read' },
    'get_stock_scan_balances': { page: 'tc_stock_scan', access: 'read' },
    'add_stock_scan': { page: 'tc_stock_scan', access: 'write' },
    'get_customs_office': { page: 'tc_customs_office', access: 'read' },
    'add_customs_office': { page: 'tc_customs_office', access: 'write' },
    'get_purchase_items': { page: 'tc_purchasing', access: 'read' },
    'get_purchase_options': { page: 'tc_purchasing', access: 'read' },
    'add_purchase_item': { page: 'tc_purchasing', access: 'write' },
    'add_vendor': { page: 'tc_purchasing', access: 'write' },
    'add_item': { page: 'tc_purchasing', access: 'write' },
    'get_import_follow': { page: 'tc_import_follow', access: 'read' },
    'add_import_follow': { page: 'tc_import_follow', access: 'write' },
    'add_import_follow_files': { page: 'tc_import_follow', access: 'write' },
    'update_import_follow_status': { page: 'tc_import_follow', access: 'full' },
    'get_carton_sizes': { page: 'tc_carton_sizes', access: 'read' },
    'add_carton_size': { page: 'tc_carton_sizes', access: 'write' },
    'add_carton_size_files': { page: 'tc_carton_sizes', access: 'write' },
    'get_employees': { page: 'tc_employee_reg', access: 'read' },
    'add_employee': { page: 'tc_employee_reg', access: 'write' },
    'edit_employee': { page: 'tc_employee_reg', access: 'full' },
    'get_employee_status': { page: 'tc_employee_status', access: 'read' },
    'add_employee_status': { page: 'tc_employee_status', access: 'write' },
    'get_employee_salary': { page: 'tc_employee_salary', access: 'read' },
    'add_employee_salary': { page: 'tc_employee_salary', access: 'write' },
    'get_emp_deductions': { page: 'tc_emp_deductions', access: 'read' },
    'add_emp_deduction': { page: 'tc_emp_deductions', access: 'write' },
    'get_emp_permits': { page: 'tc_emp_permits', access: 'read' },
    'add_emp_permit': { page: 'tc_emp_permits', access: 'write' },
    'get_emp_overtime': { page: 'tc_emp_overtime', access: 'read' },
    'add_emp_overtime': { page: 'tc_emp_overtime', access: 'write' },
    'get_emp_salaries': { page: 'tc_emp_salaries', access: 'read' },
    'get_emp_salary_comparison': { page: 'tc_emp_salaries', access: 'read' },
    'add_emp_salaries': { page: 'tc_emp_salaries', access: 'write' },
    'edit_emp_salary': { page: 'tc_emp_salaries', access: 'full' },
    'delete_emp_salary': { page: 'tc_emp_salaries', access: 'full' },
    'update_emp_salary_receipt': { page: 'tc_emp_salaries', access: 'full' },
    'get_payroll_months': { page: 'tc_emp_salaries_close', access: 'read' },
    'close_payroll_month': { page: 'tc_emp_salaries_close', access: 'full' },
    // حسابات الميزانية (legal budget) pages
    'get_legal_parties': { page: 'tc_budget_parties', access: 'read' },
    'add_legal_party': { page: 'tc_budget_parties', access: 'write' },
    'get_legal_products': { page: 'tc_budget_stock_balance', access: 'read' },
    'get_legal_current_products': { page: 'tc_budget_stock_balance', access: 'read' },
    'get_legal_stock_balance': { page: 'tc_budget_stock_balance', access: 'read' },
    'get_system_product_options': { page: 'tc_budget_stock_balance', access: 'read' },
    'update_legal_product': { page: 'tc_budget_stock_balance', access: 'write' },
    'get_legal_products_movement': { page: 'tc_budget_stock_balance', access: 'read' },
    'get_legal_inputs': { page: 'tc_budget_inputs', access: 'read' },
    'export_vat_purchasing_xlsx': { page: 'tc_budget_inputs', access: 'write' },
    'add_legal_costing': { page: 'tc_budget_inputs', access: 'write' },
    'add_legal_purchasing_line': { page: 'tc_budget_inputs', access: 'write' },
    'add_legal_costing_bundle': { page: 'tc_budget_inputs', access: 'write' },
    'edit_legal_costing_bundle': { page: 'tc_budget_inputs', access: 'full' },
    'delete_legal_costing': { page: 'tc_budget_inputs', access: 'full' },
    'get_legal_manufacture': { page: 'tc_budget_manufacture', access: 'read' },
    'add_legal_manufacture': { page: 'tc_budget_manufacture', access: 'write' },
    'update_legal_manufacture': { page: 'tc_budget_manufacture', access: 'write' },
    'get_legal_invoices': { page: 'tc_budget_invoices', access: 'read' },
    'add_legal_invoice': { page: 'tc_budget_invoices', access: 'write' },
    'make_collection_from_invoice': { page: 'tc_budget_invoices', access: 'full' },
    'make_collections_from_invoices': { page: 'tc_budget_invoices', access: 'full' },
    'get_legal_cash': { page: 'tc_budget_cash', access: 'read' },
    'add_legal_cash': { page: 'tc_budget_cash', access: 'write' },
    'toggle_legal_cash_approved': { page: 'tc_budget_cash', access: 'full' },
    'get_legal_hr': { page: 'tc_budget_hr', access: 'read' },
    'add_legal_employee': { page: 'tc_budget_hr', access: 'write' },
    'get_legal_salaries': { page: 'tc_budget_hr', access: 'read' },
    'add_legal_salary': { page: 'tc_budget_hr', access: 'write' },
    'get_income_statement': { page: 'tc_budget_income', access: 'read' },
    'get_kpi_data': { page: 'tc_kpi', access: 'read' },
    'prefetch_refs': { page: 'tc_dashboard', access: 'read' },
    'get_main_review': { page: 'tc_main_review', access: 'read' },
    'revise_main_review': { page: 'tc_main_review', access: 'write' },
    'get_client_balance_sheets': { page: 'tc_client_balance_sheets', access: 'read' },
    'save_client_balance_sheet': { page: 'tc_client_balance_sheets', access: 'write' },
    'delete_client_balance_sheet': { page: 'tc_client_balance_sheets', access: 'write' },
    // تحليل حركة الخزنة العادية — live MySQL regular_box_movement.
    // Listing an action here is what makes it FAIL CLOSED: guard_ returns
    // early for anything it does not find, so an unlisted action is open to
    // any authenticated user of the company. This page exposes fraud analysis
    // and an edit form over financial rows, so all four are listed.
    'get_box_analysis': { page: 'tc_box_analysis', access: 'read' },
    'get_box_item_history': { page: 'tc_box_analysis', access: 'read' },
    'update_box_movement': { page: 'tc_box_analysis', access: 'write' },
    'revise_box_movement': { page: 'tc_box_analysis', access: 'write' },
    'get_box_alerts': { page: 'tc_box_analysis', access: 'read' },
    'save_box_item_alias': { page: 'tc_box_analysis', access: 'write' },
    // ── manufacture orders (tc_manufacture_orders) ──
    'get_manufacture_headers':  { page: 'tc_manufacture_orders', access: 'read' },
    'get_manufacture_footers':  { page: 'tc_manufacture_orders', access: 'read' },
    'save_manufacture_header':  { page: 'tc_manufacture_orders', access: 'write' },
    'save_manufacture_footer':  { page: 'tc_manufacture_orders', access: 'write' },
    'add_manufacture_footer':   { page: 'tc_manufacture_orders', access: 'write' },
    'delete_manufacture_header': { page: 'tc_manufacture_orders', access: 'write' },
    'delete_manufacture_footer': { page: 'tc_manufacture_orders', access: 'write' },
    'get_manufacture_refs':     { page: 'tc_manufacture_orders', access: 'read' },
    // ── products live table (tc_products_live / اصناف النظام الرئيسي) ──
    'get_products_live':    { page: 'tc_products_live', access: 'read' },
    'get_product_live_warehouse_quantities': { page: 'tc_products_live', access: 'read' },
    'get_products_live_direct_test': { page: 'tc_products_live', access: 'read' },
    'get_mysql_connection_probe': { page: 'tc_products_live', access: 'read' },
    'add_product_live':     { page: 'tc_products_live', access: 'write' },
    'get_production_capability_products': { page: 'tc_production_capability', access: 'read' },
    'get_production_capability_rows': { page: 'tc_production_capability', access: 'read' },
    'get_production_capability_catalog': { page: 'tc_production_capability', access: 'read' },
    'get_sales_capacity_catalog': { page: 'tc_sales_capacity', access: 'read' },
    'get_sales_capacity_products': { page: 'tc_sales_capacity', access: 'read' },
    'get_sales_capacity_rows': { page: 'tc_sales_capacity', access: 'read' },
    'save_product_live':    { page: 'tc_products_live', access: 'write' },
    'delete_product_live':  { page: 'tc_products_live', access: 'write' },
    'get_financial_sales_totals': { page: 'tc_financial_ratios', access: 'read' },
    'get_financial_other_income': { page: 'tc_financial_ratios', access: 'read' },
    'get_financial_expenses': { page: 'tc_financial_ratios', access: 'read' },
    'get_financial_production': { page: 'tc_financial_ratios', access: 'read' },
    'get_financial_used_materials': { page: 'tc_financial_ratios', access: 'read' },
    'get_financial_used_materials_plan': { page: 'tc_financial_ratios', access: 'read' }
  };

  /** page for a module_action, reused for both access-control and logging. */
  function pageForAction_(action) {
    const req = PAGE_ACCESS[action];
    return req ? req.page : '';
  }

  /**
   * Sheet(s) touched per module_action, for SystemLog's Table column.
   * SEED LIST — covers customs office + budget actions today. Extend
   * incrementally as you touch other actions.
   */
  const ACTION_TABLES = {
    'get_customs_office': CUSTOMS_OFFICE_SHEET,
    'add_customs_office': CUSTOMS_OFFICE_SHEET,
    'get_legal_parties': LEGAL_PARTIES_SHEET,
    'add_legal_party': LEGAL_PARTIES_SHEET,
    'get_legal_products': LEGAL_PRODUCTS_SHEET,
    'update_legal_product': LEGAL_PRODUCTS_SHEET,
    'get_legal_current_products': LEGAL_CURRENT_SHEET,
    'get_legal_stock_balance': LEGAL_PRODUCTS_SHEET + '/' + LEGAL_CURRENT_SHEET,
    'get_system_product_options': 'mysql:products',
    'get_legal_products_movement': LEGAL_MOVEMENT_SHEET,
    'get_legal_inputs': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'add_legal_costing': LEGAL_COSTING_SHEET,
    'add_legal_purchasing_line': LEGAL_PURCHASING_SHEET,
    'add_legal_costing_bundle': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'edit_legal_costing_bundle': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'delete_legal_costing': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'get_legal_manufacture': LEGAL_MANUFACTURE_SHEET,
    'add_legal_manufacture': LEGAL_MANUFACTURE_SHEET,
    'update_legal_manufacture': LEGAL_MANUFACTURE_SHEET,
    'get_legal_invoices': LEGAL_INVOICES_SHEET,
    'add_legal_invoice': LEGAL_INVOICES_SHEET,
    'make_collection_from_invoice': LEGAL_CASH_SHEET,
    'make_collections_from_invoices': LEGAL_CASH_SHEET,
    'get_legal_cash': LEGAL_CASH_SHEET,
    'add_legal_cash': LEGAL_CASH_SHEET,
    'toggle_legal_cash_approved': LEGAL_CASH_SHEET,
    'get_legal_hr': LEGAL_EMPLOYEES_SHEET,
    'add_legal_employee': LEGAL_EMPLOYEES_SHEET,
    'get_legal_salaries': LEGAL_SALARIES_SHEET,
    'add_legal_salary': LEGAL_SALARIES_SHEET,
    'get_income_statement': LEGAL_INCOME_SHEET,
    'get_dashboard_data': '',
    'get_executive_followup': 'mysql:COO_TEST',
    'get_executive_followup_summary': 'mysql:COO_TEST,manufacture_headers,manufacture_footers,regular_box_movement,chart_of_accounts_main',
    'get_clients_vendors': CLIENTS_SHEET,
    'add_client_vendor': CLIENTS_SHEET,
    'edit_client_vendor': CLIENTS_SHEET,
    'get_ar_ap': ARAP_SHEET,
    'get_ar_ap_client': ARAP_SHEET,
    'add_ar_ap': ARAP_SHEET,
    'get_products': PRODUCTS_SHEET,
    'add_product': PRODUCTS_SHEET,
    'edit_product': PRODUCTS_SHEET,
    'get_barcode': BARCODE_SHEET,
    'add_barcode': BARCODE_SHEET,
    'get_registration_papers': REGISTRATION_SHEET,
    'add_registration_paper': REGISTRATION_SHEET,
    'update_registration_paper': REGISTRATION_SHEET,
    'get_trust_accounts': TRUST_SHEET,
    'get_trust_movements': TRUST_SHEET,
    'add_trust_movement': TRUST_SHEET,
    'get_stock_revision': STOCK_SHEET,
    'add_stock_revision': STOCK_SHEET,
    'get_stock_scan_options': PRODUCTS_SHEET,
    'get_stock_scan_sheet_catalog': PRODUCTS_SHEET,
    'get_stock_scan_history': STOCK_SHEET,
    'get_stock_scan_warehouses': 'mysql:warehouse_locations',
    'get_stock_scan_balance': 'mysql:product_current_qty_warehouses',
    'get_stock_scan_catalog': 'mysql:products',
    'get_stock_scan_balances': 'mysql:product_current_qty_warehouses',
    'add_stock_scan': STOCK_SHEET,
    'get_purchase_items': PURCHASE_SHEET,
    'get_purchase_options': PURCHASE_SHEET,
    'add_purchase_item': PURCHASE_SHEET,
    'add_vendor': VENDORS_SHEET,
    'add_item': ITEMS_SHEET,
    'get_import_follow': IMPORT_FOLLOW_SHEET,
    'add_import_follow': IMPORT_FOLLOW_SHEET,
    'add_import_follow_files': IMPORT_FOLLOW_SHEET,
    'update_import_follow_status': IMPORT_FOLLOW_SHEET,
    'get_carton_sizes': CARTON_SIZES_SHEET,
    'add_carton_size': CARTON_SIZES_SHEET,
    'add_carton_size_files': CARTON_SIZES_SHEET,
    'get_employees': EMPLOYEE_SHEET,
    'add_employee': EMPLOYEE_SHEET,
    'edit_employee': EMPLOYEE_SHEET,
    'get_employee_status': EMP_STATUS_SHEET,
    'add_employee_status': EMP_STATUS_SHEET,
    'get_employee_salary': EMP_SALARY_SHEET,
    'add_employee_salary': EMP_SALARY_SHEET,
    'get_emp_deductions': EMP_DEDUCTIONS_SHEET,
    'add_emp_deduction': EMP_DEDUCTIONS_SHEET,
    'get_emp_permits': EMP_PERMITS_SHEET,
    'add_emp_permit': EMP_PERMITS_SHEET,
    'get_emp_overtime': EMP_OVERTIME_SHEET,
    'add_emp_overtime': EMP_OVERTIME_SHEET,
    'get_emp_salaries': EMP_SALARIES_SHEET,
    'get_emp_salary_comparison': EMP_SALARIES_SHEET,
    'add_emp_salaries': EMP_SALARIES_SHEET,
    'edit_emp_salary': EMP_SALARIES_SHEET,
    'delete_emp_salary': EMP_SALARIES_SHEET,
    'update_emp_salary_receipt': EMP_SALARIES_SHEET,
    'get_payroll_months': EMP_SALARIES_CLOSE_SHEET,
    'close_payroll_month': EMP_SALARIES_CLOSE_SHEET,
    'add_upload_file': '',
    'export_vat_purchasing_xlsx': LEGAL_PURCHASING_SHEET,
    'get_budget_refs': LEGAL_CHART_SHEET,
    'prefetch_refs': PRODUCTS_SHEET,
    'get_main_review': 'mysql:clients_AR',
    'revise_main_review': 'mysql:clients_AR',
    'get_client_balance_sheets': 'mysql:client_balance_sheets',
    'save_client_balance_sheet': 'mysql:client_balance_sheets',
    'delete_client_balance_sheet': 'mysql:client_balance_sheets',
    'get_box_analysis': 'mysql:regular_box_movement',
    'get_box_item_history': 'mysql:regular_box_movement',
    'update_box_movement': 'mysql:regular_box_movement',
    'revise_box_movement': 'mysql:regular_box_movement',
    'get_box_alerts': 'mysql:regular_box_movement',
    // The alias overrides are a Drive JSON file, not a table — there is no
    // DDL available, and this records that honestly rather than naming a
    // table that does not exist.
    'save_box_item_alias': 'drive:Box_Analysis_Audit/box_item_aliases.json',
    'get_manufacture_headers': 'mysql:manufacture_headers',
    'get_manufacture_footers': 'mysql:manufacture_footers',
    'save_manufacture_header': 'mysql:manufacture_headers',
    'save_manufacture_footer': 'mysql:manufacture_footers',
    'add_manufacture_footer':  'mysql:manufacture_footers',
    'delete_manufacture_header': 'mysql:manufacture_headers',
    'delete_manufacture_footer': 'mysql:manufacture_footers',
    'get_manufacture_refs':     'mysql:manufacture_headers',
    'get_products_live':   'mysql:products',
    'get_product_live_warehouse_quantities': 'mysql:product_current_qty_warehouses',
    'get_products_live_direct_test': 'mysql:products',
    'get_mysql_connection_probe': 'mysql:connection',
    'add_product_live':    'mysql:products',
    'get_production_capability_products': 'mysql:manuf_product_support_capability',
    'get_production_capability_rows': 'mysql:manuf_product_support_capability',
    'get_production_capability_catalog': 'mysql:manuf_product_support_capability',
    'get_sales_capacity_catalog': 'mysql:manuf_product_support_capability',
    'get_sales_capacity_products': 'mysql:manuf_product_support_capability',
    'get_sales_capacity_rows': 'mysql:manuf_product_support_capability',
    'save_product_live':   'mysql:products',
    'delete_product_live': 'mysql:products',
    'get_financial_sales_totals': 'mysql:invoice_headers,invoice_footers,item_returns',
    'get_financial_other_income': 'mysql:expenses_income_report',
    'get_financial_expenses': 'mysql:expenses_income_report',
    'get_financial_production': 'mysql:manufacture_headers,products',
    'get_financial_used_materials': 'mysql:manufacture_report_view,manufacture_headers,products',
    'get_financial_used_materials_plan': 'mysql:manufacture_report_view,manufacture_headers,products'
  };

  function tableForAction_(action) {
    return ACTION_TABLES[action] || '';
  }

  /* ── [RT-6] The change watch, ported from ValleyFoods ───────────────────
   *
   * page -> the tables its actions touch, DERIVED by joining the two maps this
   * file already has. There is no new configuration to keep in step: a page's
   * watch set is exactly the set of tables its own actions declare, so a new
   * action that names a table joins the watch automatically and one that does
   * not is visibly absent.
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
   * Gated EXPLICITLY rather than through PAGE_ACCESS, and this is the important
   * part: one action serves every page, so guard_ would only ever check the
   * grant for get_page_versions itself. The page being ASKED ABOUT is what has
   * to be checked, and it is checked here against the caller's real read grant.
   * An optimisation that is also a way around an access check is not an
   * optimisation.
   */
  function getPageVersions_(data, user, dbId) {
    const page = String((data && data.page) || '').trim();
    if (!page) throw new Error('الصفحة مطلوبة');
    if (!(user && user.isSuperAdmin)) {
      if (!unifiedCheck_(user, '3fe1b5cb67b7223e', page, 'read')) {
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

  // Phase 3: FAIL-CLOSED. An action not listed in PAGE_ACCESS is denied, not
  // allowed. Super-admin bypass preserved. get_page_versions is the sole
  // exception: it gates itself on the page asked about (see getPageVersions_).
  // tc_box_analysis is explicitly listed above (get_box_analysis,
  // get_box_item_history, update_box_movement, revise_box_movement,
  // get_box_alerts, save_box_item_alias) — no hole.
  function uploadDenied_(message) {
    const e = new Error(message);
    e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED';
    throw e;
  }
  function guard_(user, action, data) {
    if (user && user.isSuperAdmin) return;
    if (action === 'get_page_versions') return;
    /* One upload action serves every registered attachment table. Authorize
       against the page owning the submitted sheet rather than a static page. */
    if (action === 'add_upload_file') {
      const uploadSheet = String((data && data.sheet) || '').trim();
      const uploadCfg = UPLOAD_META[uploadSheet];
      if (!uploadCfg || !unifiedCheck_(user, COMPANY_UID, uploadCfg.page, 'write')) {
        uploadDenied_(ERP_MESSAGES.NOT_AUTHORIZED);
      }
      return;
    }
    /* Shared budget references are used by every tc_budget_* page. They cannot
       be represented by one PAGE_ACCESS page without making the reference
       request either too narrow or too broad, so authorize it against the
       caller's actual budget-page grants. */
    if (action === 'get_budget_refs') {
      const pages = (typeof COMPANY_REGISTRY !== 'undefined' && COMPANY_REGISTRY[COMPANY_UID] && COMPANY_REGISTRY[COMPANY_UID].pages) || [];
      const allowed = pages.some(function (p) {
        const pageId = String(p && p.action || '').trim();
        return /^tc_budget_/.test(pageId) && unifiedCheck_(user, COMPANY_UID, pageId, 'read');
      });
      if (!allowed) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
      return;
    }
    const req = PAGE_ACCESS[action];
    if (!req) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    if (!unifiedCheck_(user, COMPANY_UID, req.page, req.access)) {
      throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  // Phase 3: Valley-style tenant double-check. dbId must be this company's own
  // spreadsheet; a mismatched dbId (cross-tenant routing fault) is denied
  // before any sheet read.
  function authorize_(user, dbId) {
    if (!user || (!user.isSuperAdmin && user.company !== COMPANY_UID) || !dbId || String(dbId) !== String(getCompanySpreadsheetId_(COMPANY_UID))) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  }

  function dispatch_(payload, user, dbId, ctx) {
    const action = payload.module_action;
    if (!actions[action]) throw new Error('Unknown Top Chemical action: ' + action);
    guard_(user, action, payload.data);
    authorize_(user, dbId);
    /* Phase 2: defensive gate so direct dispatch also validates. Status-only
     * paths skip field validation inside validateBeforeWrite; handlers still
     * enforce status via canTransition/assertTransition_. */
    if (typeof validateBeforeWrite === 'function' && typeof docTypeForAction_ === 'function') {
      var __dt = docTypeForAction_(action);
      if (__dt) validateBeforeWrite(__dt, payload, dbId);
    }
    return mysqlWithRequest_(COMPANY_UID + ':' + dbId, user, action, function () {
      return actions[action](payload.data, user, dbId, ctx);
    });
  }

  /* Server-owned query catalogue. SQL builders and result mapping stay in the
   * named adapters below, preserving their columns, totals and permissions.
   * A zero TTL deliberately preserves formerly uncached freshness. All reads
   * depend conservatively on mysql:*; every application SQL write bumps its
   * durable epoch. External writes become visible at the stated expiry. */
  function mysqlTcDefinition_(name) {
    var specs = {
      systemQtyMap_: [120, 'id,current_qty', 'all current quantities'],
      systemProductOptions_: [120, 'id,name_ar', 'all eligible products'],
      dbProductsLiveCount_: [90, 'total', 1],
      dbProductsLiveList_: [90, 'product columns except products.quantity; product_current_quantity.current_qty as quantity', 'existing page/loadAll caps'],
      dbProductLiveWarehouseQuantities_: [0, 'product_current_qty_warehouses.warehouse_id,current_qty', 500],
      dbProductionCapabilityProducts_: [30, 'manufacture_product_id,manufacture_product_name,name_count', 100],
      dbProductionCapabilityRows_: [30, 'manufacture_order_count,required_qty_per_mo,required_qty_per_unit,required_qty_per_single_mo,products.product_unit_metric,products.unit,product_current_quantity.current_qty', 1000],
      dbSalesCapacityProducts_: [30, 'manufacture_product_id,manufacture_product_name,name_count', 100],
      dbSalesCapacityRows_: [30, 'manufacture_order_count,required_qty_per_mo,required_qty_per_unit,required_qty_per_single_mo,products.product_unit_metric,products.unit,product_current_quantity.current_qty', 1000],
      dbCapabilityCatalog_: [30, 'manufacture_product_id,manufacture_product_name,catalog', 2001],
      dbClientsArList_: [0, 'existing client/vendor view columns', 200],
      dbClientBalanceSheetsList_: [0, 'existing balance columns', 200],
      dbManufactureList_: [0, 'existing header columns', 200],
      dbManufactureGetFooters_: [0, 'existing footer columns', 'all lines of one header'],
      dbManufactureRefs_: [0, 'id,label,code,unit,status', '500 products/warehouses; all statuses'],
      dbStockScanProducts_: [60, 'id,name_ar,number_of_cartons_bags,code', 'exact ID/code or bounded name-prefix search'],
      dbStockScanWarehouses_: [300, 'id,location', 'warehouse labels'],
      dbStockScanBalance_: [30, 'id,warehouse_id,current_qty', 'one product-warehouse pair'],
      dbStockScanCatalog_: [30, 'id,name_ar,code,number_of_cartons_bags,catalog', 2001],
      dbStockScanBalances_: [30, 'id,warehouse_id,current_qty', 'all warehouses of one product'],
      dbBoxList_: [0, 'DB_BOX_COLUMNS', 'existing page cap'],
      dbBoxAccountAggregates_: [0, 'account,debit,credit,net,moves', 'existing aggregation cap'],
      dbChartAccountLabels_: [21600, 'id_5,account_5_name', 20000],
      dbBoxItemHistory_: [0, 'existing history projection', 'existing date/window cap'],
      dbBoxAnalysisScan_: [0, 'existing analysis projection', 'existing date/window cap'],
      dbBoxMaxUpdatedAt_: [0, 'MAX(updated_at)', 1],
      dbTcFinancialSalesTotals_: [0, 'sales_value,return_value,net_sales_value,monthly', 1200],
      dbTcFinancialOtherIncome_: [0, 'account_5_name,net_amount,monthly', 1000],
      dbTcFinancialExpenses_: [0, 'account_5_name,net_amount,monthly', 1000],
      dbTcFinancialProduction_: [0, 'product_id,name_ar,expected_quantity,deliver_quantity,total,offset,limit,has_more', 31],
      dbTcFinancialUsedMaterials_: [0, 'product_id,name_ar,unit,supposed_qty,used_qty,difference_qty,difference_ratio,total,offset,limit,has_more', 31],
      dbTcFinancialProductionSnapshot_: [120, 'product_id,name_ar,expected_quantity,deliver_quantity,total,snapshot', 2000],
      dbTcFinancialUsedMaterialsSnapshot_: [120, 'product_id,name_ar,unit,supposed_qty,used_qty,difference_qty,difference_ratio,total,snapshot', 2000],
      dbExecutiveFollowup_: [120, 'COO_TEST decision rows as one JSON snapshot', 5000],
      dbExecutiveSummary_: [120, 'COO manufacturing, purchasing, weekly expense and account chart JSON', 500]
    };
    var spec = specs[name];
    if (!spec) throw new Error('Unknown MySQL definition');
    return { name: 'tc.' + name, version: name === 'dbExecutiveFollowup_' ? 1 : name === 'dbExecutiveSummary_' ? 7 : name === 'dbCapabilityCatalog_' || name === 'dbStockScanCatalog_' || name === 'dbStockScanBalances_' ? 1 : name === 'dbProductsLiveList_' ? 7 : name === 'dbProductsLiveCount_' ? 3 : name === 'dbStockScanProducts_' ? 4 : name === 'dbProductionCapabilityRows_' ? 5 : name === 'dbSalesCapacityRows_' ? 5 : 2, ttl: spec[0], columns: spec[1], rowLimit: spec[2],
      dependencies: ['mysql:*'], builder: name, mapping: name,
      normalize: function (data) {
        var p = mysqlParams_(data);
        if (name === 'dbTcFinancialSalesTotals_' || name === 'dbTcFinancialOtherIncome_' || name === 'dbTcFinancialExpenses_') return dbTcFinancialSalesParams_(p);
        if (name === 'dbTcFinancialProductionSnapshot_' || name === 'dbTcFinancialUsedMaterialsSnapshot_') {
          var snapRange = dbTcFinancialSalesParams_(p);
          snapRange.refresh = p.refresh === true || p.refresh === 'true' || p.refresh === '1';
          return snapRange;
        }
        if (name === 'dbTcFinancialProduction_') return dbTcFinancialProductionParams_(p);
        if (name === 'dbTcFinancialUsedMaterials_') return dbTcFinancialUsedMaterialsParams_(p);
        if (name === 'dbExecutiveFollowup_') {
          var planYear = (p.year === undefined || p.year === null || p.year === '') ? 0 : Number(p.year);
          if (!Number.isInteger(planYear) || (planYear !== 0 && (planYear < 2000 || planYear > 2100))) throw new Error('Invalid executive follow-up year');
          return { year: planYear, refresh: p.refresh === true || p.refresh === 'true' || p.refresh === '1' };
        }
        if (name === 'dbExecutiveSummary_') {
          return { refresh: p.refresh === true || p.refresh === 'true' || p.refresh === '1' };
        }
        if (name === 'dbStockScanProducts_') {
          p.id = p.id == null || p.id === '' ? '' : String(p.id).trim();
          if (p.id && !/^[1-9]\d{0,19}$/.test(p.id)) throw new Error('Invalid product ID');
          p.code = p.code == null || p.code === '' ? '' : String(p.code).trim().slice(0, 64);
          p.search = String(p.search == null ? '' : p.search).trim().slice(0, 120);
          p.mode = String(p.mode == null ? '' : p.mode).trim().toLowerCase();
          if (!p.mode) p.mode = p.id ? 'id' : (p.code ? 'code' : 'name');
          if (['id', 'code', 'name'].indexOf(p.mode) === -1) throw new Error('Invalid product search mode');
          if (p.mode === 'id' && !p.id) throw new Error('Invalid product ID');
          if (p.mode === 'code' && !p.code) throw new Error('Invalid product code');
          p.limit = Math.min(Math.max(Math.floor(Number(p.limit) || 30), 1), 50);
          p.offset = Math.max(0, Math.floor(Number(p.offset) || 0));
          if (p.mode === 'id') { p.search = ''; p.code = ''; p.offset = 0; }
          if (p.mode === 'code') { p.search = ''; p.id = ''; p.offset = 0; }
          if (p.mode === 'name') { p.id = ''; p.code = ''; }
          p.refresh = p.refresh === true || p.refresh === 'true' || p.refresh === '1';
        }
        if (name === 'dbStockScanWarehouses_') {
          p.refresh = p.refresh === true || p.refresh === 'true' || p.refresh === '1';
        }
        if (name === 'dbStockScanBalance_') {
          p.product_id = p.product_id == null || p.product_id === '' ? '' : String(p.product_id).trim();
          p.warehouse_id = p.warehouse_id == null || p.warehouse_id === '' ? '' : String(p.warehouse_id).trim();
          if (!/^[1-9]\d{0,19}$/.test(p.product_id)) throw new Error('Invalid product ID');
          if (!/^[1-9]\d{0,19}$/.test(p.warehouse_id)) throw new Error('Invalid warehouse ID');
          p.refresh = p.refresh === true || p.refresh === 'true' || p.refresh === '1';
        }
        if (name === 'dbStockScanCatalog_') {
          return { refresh: p.refresh === true || p.refresh === 'true' || p.refresh === '1' };
        }
        if (name === 'dbStockScanBalances_') {
          p.product_id = p.product_id == null || p.product_id === '' ? '' : String(p.product_id).trim();
          if (!/^[1-9]\d{0,19}$/.test(p.product_id)) throw new Error('Invalid product ID');
          p.refresh = p.refresh === true || p.refresh === 'true' || p.refresh === '1';
        }
        if (name === 'dbProductLiveWarehouseQuantities_') {
          p.id = p.id == null || p.id === '' ? '' : String(p.id).trim();
          if (!/^[1-9]\d{0,19}$/.test(p.id)) throw new Error('Invalid product ID');
        }
        if (name === 'dbCapabilityCatalog_') {
          // Only the refresh boolean is a catalog input. Every other field
          // (search text, client limits, …) is ignored so it can never affect
          // the catalog cache key.
          return { refresh: p.refresh === true || p.refresh === 'true' || p.refresh === '1' };
        }
        if (name === 'dbProductionCapabilityProducts_' || name === 'dbSalesCapacityProducts_') {
          p.search = String(p.search == null ? '' : p.search).trim().slice(0, 80);
          p.limit = Math.min(Math.max(Math.floor(Number(p.limit) || 100), 1), 100);
          p.refresh = p.refresh === true || p.refresh === 'true' || p.refresh === '1';
        }
        if (name === 'dbProductionCapabilityRows_' || name === 'dbSalesCapacityRows_') {
          p.id = String(p.id == null ? '' : p.id).trim();
          if (!/^[1-9]\d{0,9}$/.test(p.id)) throw new Error('Invalid manufactured product ID');
          p.refresh = p.refresh === true || p.refresh === 'true' || p.refresh === '1';
        }
        return p;
      },
      authorize: function (request) {
        // dispatch_ already checked both tenant and current page grants; repeat
        // the page check before cache access (including nested read helpers).
        guard_(request.user, request.action, dataForGuard_());
        function dataForGuard_() { return {}; }
      },
      valid: function (value) {
        if (name === 'systemQtyMap_') return !!(value && typeof value === 'object' && !Array.isArray(value));
        if (name === 'systemProductOptions_') return !!(value && Array.isArray(value.options) && value.map);
        if (!value || value.status !== 'ok') return false;
        if (name === 'dbTcFinancialOtherIncome_' || name === 'dbTcFinancialExpenses_') return Array.isArray(value.rows) && Array.isArray(value.monthly) && Number.isFinite(Number(value.total_net_amount));
        if (name === 'dbTcFinancialProduction_') return Array.isArray(value.rows) && Number.isInteger(Number(value.total)) && Number.isInteger(Number(value.offset)) && Number.isInteger(Number(value.limit)) && typeof value.has_more === 'boolean';
        if (name === 'dbTcFinancialUsedMaterials_') return Array.isArray(value.rows) && Number.isInteger(Number(value.total)) && Number.isInteger(Number(value.offset)) && Number.isInteger(Number(value.limit)) && typeof value.has_more === 'boolean';
        if (name === 'dbTcFinancialProductionSnapshot_' || name === 'dbTcFinancialUsedMaterialsSnapshot_') return Array.isArray(value.rows) && Number.isInteger(Number(value.total)) && typeof value.truncated === 'boolean' && Number.isFinite(Number(value.snapshot_at));
        if (name === 'dbExecutiveFollowup_') return Array.isArray(value.rows) && Number.isInteger(Number(value.total)) && typeof value.truncated === 'boolean' && value.schema_version === 1;
        if (name === 'dbExecutiveSummary_') return value.schema_version === 2 && Array.isArray(value.manufacturing) && Array.isArray(value.purchasing) && Array.isArray(value.weekly_expenses) && Array.isArray(value.weekly_expense_accounts);
        if (name === 'dbProductsLiveCount_') return Number.isInteger(value.total) && value.total >= 0;
        if (name === 'dbProductsLiveList_') {
          if (!Array.isArray(value.columns) || !Array.isArray(value.rows) ||
              !Number.isInteger(Number(value.total)) || Number(value.total) < 0) return false;
          if (value.schema_version !== 1) return true; // Existing loadAll/offset/cursor envelopes.
          if (!value.page || typeof value.page.has_more !== 'boolean' ||
              typeof value.page.next_cursor !== 'string' || typeof value.page.snapshot !== 'string' ||
              value.rows.length > Number(value.page.limit) || Number(value.page.limit) > 200 ||
              typeof value.data_version !== 'string' || value.total_is_exact !== true) return false;
          return value.rows.every(function (row) {
            return row && typeof row.id === 'string' && /^[1-9]\d{0,19}$/.test(row.id);
          });
        }
        if (name === 'dbCapabilityCatalog_') {
          if (value.status !== 'ok' || value.schema_version !== 1) return false;
          if (!Array.isArray(value.products) || !Number.isInteger(value.count)) return false;
          if (value.count !== value.products.length) return false;
          if (value.count > 2000) return false;
          if (!Number.isFinite(Number(value.payload_bytes)) || Number(value.payload_bytes) > 262144) return false;
          if (typeof value.complete !== 'boolean' || typeof value.overflow !== 'boolean') return false;
          if (['row_limit', 'byte_limit', 'unsupported_id'].indexOf(value.reason) === -1 && value.reason !== null) return false;
          if (value.complete && (value.overflow || value.reason !== null)) return false;
          if (!value.complete && (!value.overflow || value.products.length !== 0 || value.count !== 0)) return false;
          for (var ci = 0; ci < value.products.length; ci++) {
            var cp = value.products[ci];
            if (!cp || typeof cp.id !== 'string' || typeof cp.name !== 'string') return false;
          }
          return true;
        }
        if (name === 'dbProductionCapabilityProducts_' || name === 'dbSalesCapacityProducts_') return Array.isArray(value.products) && typeof value.has_more === 'boolean';
        if (name === 'dbProductionCapabilityRows_' || name === 'dbSalesCapacityRows_') return Array.isArray(value.rows) && typeof value.truncated === 'boolean' &&
          Object.prototype.hasOwnProperty.call(value, 'product_current_quantity') && Object.prototype.hasOwnProperty.call(value, 'product_unit_metric') &&
          Object.prototype.hasOwnProperty.call(value, 'product_unit');
        if (name === 'dbStockScanCatalog_') {
          if (value.status !== 'ok' || value.schema_version !== 1) return false;
          if (!Array.isArray(value.products) || !Number.isInteger(value.count)) return false;
          if (value.count !== value.products.length) return false;
          if (value.count > 2000) return false;
          if (!Number.isFinite(Number(value.payload_bytes)) || Number(value.payload_bytes) > 262144) return false;
          if (typeof value.complete !== 'boolean' || typeof value.overflow !== 'boolean') return false;
          if (['row_limit', 'byte_limit', 'unsupported_id'].indexOf(value.reason) === -1 && value.reason !== null) return false;
          if (value.complete && (value.overflow || value.reason !== null)) return false;
          if (!value.complete && (!value.overflow || value.products.length !== 0 || value.count !== 0)) return false;
          for (var sci = 0; sci < value.products.length; sci++) {
            var sp = value.products[sci];
            if (!sp || typeof sp.id !== 'string' || typeof sp.name_ar !== 'string') return false;
          }
          return true;
        }
        if (name === 'dbStockScanBalances_') {
          if (!value || value.status !== 'ok') return false;
          if (typeof value.product_id !== 'string' || !Array.isArray(value.balances)) return false;
          for (var sbi = 0; sbi < value.balances.length; sbi++) {
            var sb = value.balances[sbi];
            if (!sb || typeof sb.warehouse_id !== 'string' || !Number.isFinite(Number(sb.current_qty))) return false;
          }
          return true;
        }
        if (name === 'dbProductLiveWarehouseQuantities_') {
          if (typeof value.product_id !== 'string' || !Array.isArray(value.balances) || value.balances.length > 500) return false;
          return value.balances.every(function (balance) {
            return balance && typeof balance.warehouse_id === 'string' &&
              (typeof balance.current_qty === 'string' || Number.isFinite(Number(balance.current_qty)));
          });
        }
        if (name === 'dbStockScanProducts_') return Array.isArray(value.products) && typeof value.has_more === 'boolean';
        if (name === 'dbStockScanWarehouses_') return Array.isArray(value.warehouses) && typeof value.truncated === 'boolean';
        if (name === 'dbStockScanBalance_') return value && (value.state === 'ready' || value.state === 'missing') && Object.prototype.hasOwnProperty.call(value, 'product_id') && Object.prototype.hasOwnProperty.call(value, 'warehouse_id');
        if (/Monthly_|List_|Rows_|Footers_|Scan_|History_/.test(name)) return Array.isArray(value.rows);
        return true;
      }
    };
  }

  /* Request-scoped recovery allowlist: these handlers can locate an earlier
     result by request ID without creating anything new, so the request guard
     may re-run them to reconcile a stale receipt. Every other action stays
     blocked on uncertain receipts to avoid duplicate replay. */
  const REQUEST_RECOVERABLE_ACTIONS_ = { add_upload_file: 'request-id' };
  function requestRecovery_(action) {
    return REQUEST_RECOVERABLE_ACTIONS_[String(action || '')] || '';
  }

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

  /**
   * Phase 7.2 (F-15) — version-stamped reference cache, ported from the TopLight
   * pattern Phase 2.6 established. TTL 600s, up from the uniform 120s.
   *
   * Audit that justifies it — every mutation site for every sheet cached here:
   *   clients_vendors        add_client_vendor, edit_client_vendor   both bust
   *   products               add_product, edit_product               both bust
   *   legal_customer_vendor  add_legal_party                         busts
   *   product_categories     none - no add/edit/delete action exists
   *   legal_products         none
   *   chart_of_accounts      none
   * App-driven coverage is therefore complete: every mutation path that exists
   * bumps the stamp, and three of the six sheets have no app mutation path at
   * all. As on TopLight the TTL stays at 600s rather than the 1-6h F-15 floated,
   * because a stamp cannot cover somebody editing a sheet by hand.
   *
   * FIXED HERE, and the reason the TTL could not simply be raised: the cache
   * keys collided. getRefsCached_'s key is refs_<dbId>_<kind>, and TopChemical
   * reused three kinds across different sheets AND different value shapes -
   * 'parties' alone meant four different things (a {map,options} object over
   * clients_vendors, a raw record array over clients_vendors, a [{value,label}]
   * list over legal_customer_vendor, and a raw array over legal_customer_vendor),
   * all sharing one key. Whichever ran first inside the TTL won and the rest
   * silently read the wrong shape. Worst case was routine, not rare:
   * prefetch_refs warmed all of them as raw arrays on an idle timer, after which
   * add_product's category check ran indexOf over an array of objects, always
   * missed, and rejected a valid category with
   * "الفئة غير موجودة في جدول الفئات".
   * Every (sheet, shape) now has its own kind, and each one is reached through
   * exactly one named accessor below so the collision cannot come back.
   */
  const TC_REF_TTL = 600;

  function tcRefsVersion_(dbId) {
    try {
      const cache = CacheService.getScriptCache();
      const k = 'tc_refs_ver_' + dbId;
      let v = cache.get(k);
      if (!v) { v = String(new Date().getTime()); cache.put(k, v, 21600); }
      return v;
    } catch (e) { return '0'; }
  }

  function bumpTcRefsVersion_(dbId) {
    try { CacheService.getScriptCache().put('tc_refs_ver_' + dbId, String(new Date().getTime()), 21600); } catch (e) {}
  }

  /** Version-stamped wrapper around getRefsCached_. */
  function tcRefs_(dbId, kind, builder) {
    return getRefsCached_(dbId, kind + '_v' + tcRefsVersion_(dbId), TC_REF_TTL, builder);
  }

  /**
   * One bump orphans every derived key at once, so no individual kind can be
   * forgotten. Call after any mutation of a sheet cached above.
   */
  function bustTcRefs_(dbId) {
    bumpTcRefsVersion_(dbId);
  }

  // --- one accessor per (sheet, shape); builder bodies moved verbatim ---

  function tcProductsRaw_(dbId) {
    return tcRefs_(dbId, 'tc_products_raw', function(){ return getAllRecords_(dbId, PRODUCTS_SHEET); });
  }

  function tcClientsRaw_(dbId) {
    return tcRefs_(dbId, 'tc_clients_raw', function(){ return getAllRecords_(dbId, CLIENTS_SHEET); });
  }

  function tcLegalPartiesRaw_(dbId) {
    return tcRefs_(dbId, 'tc_legal_parties_raw', function(){ return getAllRecords_(dbId, LEGAL_PARTIES_SHEET); });
  }

  function tcLegalProductsRaw_(dbId) {
    return tcRefs_(dbId, 'tc_legal_products_raw', function(){ return getAllRecords_(dbId, LEGAL_PRODUCTS_SHEET); });
  }

  /** Category names as plain strings — what add_product/edit_product validate against. */
  function tcCategoryNames_(dbId) {
    return tcRefs_(dbId, 'tc_categories_names', function(){
      return getAllRecords_(dbId, CATEGORIES_SHEET).map(function (c) {
        return String(c['الاسم بالعربى'] || '').trim();
      });
    });
  }

  /** Category [{value,label}] — what the products page's dropdown renders. */
  function tcCategoryOptions_(dbId) {
    return tcRefs_(dbId, 'tc_categories_opts', function(){
      return getAllRecords_(dbId, CATEGORIES_SHEET)
        .map(function (c) {
          const name = String(c['الاسم بالعربى'] || '').trim();
          return { value: name, label: name };
        })
        .filter(function (c) { return c.value; });
    });
  }

  /** clients_vendors as [{value:Number,label}] — the AR/AP screen's shape. */
  function tcClientOptions_(dbId) {
    return tcRefs_(dbId, 'tc_clients_opts', function(){
      return getAllRecords_(dbId, CLIENTS_SHEET)
        .map(function (c) {
          return { value: Number(c.id), label: String(c.name_ar || '').trim() || ('#' + c.id) };
        })
        .filter(function (c) { return !isNaN(c.value); })
        .sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    });
  }

  /** chart_of_accounts as [{code,name}] — the budget forms' shape. */
  function tcChartOptions_(dbId) {
    return tcRefs_(dbId, 'tc_chart_opts', function(){
      return getAllRecords_(dbId, LEGAL_CHART_SHEET).map(function (r) {
        return {
          code: String(r['كود المستوى'] == null ? '' : r['كود المستوى']).trim(),
          name: String(r['اسم الحساب الرئيسي'] == null ? '' : r['اسم الحساب الرئيسي']).trim() ||
            String(r['اسم المستوى الخامس'] == null ? '' : r['اسم المستوى الخامس']).trim()
        };
      }).filter(function (c) { return c.code; });
    });
  }

  /**
   * chart_of_accounts level-5 accounts as { options, map }.
   *
   * legal_products.asset_code is a REFERENCE into this list: the stored value
   * is المستوى الخامس (the level-5 code) and the shown label is اسم المستوى
   * الخامس. One accessor serves both the select options and the id→name
   * resolution, so a display and its editor can never disagree. chart_of_accounts
   * has no app mutation path, which is what makes the tcRefs_ cache safe here.
   */
  function tcAssetCodeRefs_(dbId) {
    return tcRefs_(dbId, 'tc_legal_asset_refs', function () {
      const options = [];
      const map = {};
      getAllRecords_(dbId, LEGAL_CHART_SHEET).forEach(function (r) {
        const code = String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim();
        if (!code) return;
        if (Object.prototype.hasOwnProperty.call(map, code)) return;
        const name = String(r['اسم المستوى الخامس'] == null ? '' : r['اسم المستوى الخامس']).trim() || code;
        map[code] = name;
        options.push({ value: code, label: name });
      });
      return { options: options, map: map };
    });
  }


  /** Products: id -> name_ar map + [{value,label}] options for ref selects. */
  function productRefs_(dbId) {
    return tcRefs_(dbId, 'tc_products_refs', function(){
      const map = {};
      const rows = getAllRecords_(dbId, PRODUCTS_SHEET);
      rows.forEach(function (p) {
        const pid = Number(p.id);
        if (Number.isInteger(pid)) map[pid] = String(p.name_ar || '').trim() || ('#' + pid);
      });
      return {
        map: map,
        options: Object.keys(map).map(function (k) {
          return { value: Number(k), label: map[k] };
        }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); })
      };
    });
  }

  /** clients_vendors: id -> name_ar map + [{value,label}] options for ref selects. */
  function clientVendorRefs_(dbId) {
    return tcRefs_(dbId, 'tc_clients_refs', function(){
      const map = {};
      const rows = getAllRecords_(dbId, CLIENTS_SHEET);
      rows.forEach(function (v) {
        const vid = Number(v.id);
        if (Number.isInteger(vid) && vid > 0) map[vid] = String(v.name_ar || '').trim() || ('#' + vid);
      });
      return {
        map: map,
        options: Object.keys(map).map(function (k) {
          return { value: Number(k), label: map[k] };
        }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); })
      };
    });
  }

  /** employee_info: emp_id -> name_ar map + [{value,label}] options for ref selects.
   * OPT-2: cached under its own projected kind (never mixed with raw shapes).
   * Invalidation: the ONLY employee_info writer is addEmployee_, which calls
   * bustTcRefs_ after a successful append; status writes do not touch the
   * name map (getEmployeeStatus_ still reads EMP_STATUS_SHEET fresh). 600s TTL
   * bounds hand-edit visibility, as with every other tcRefs_ family. */
  /** employee_info: emp_id -> name_ar map + [{value,label}] options for ref selects.
   * This accessor deliberately reads fresh. There is no approved freshness
   * budget or reliable invalidation signal for manual/external employee edits,
   * so a ten-minute cache would change the established read contract. */
  function employeeRefs_(dbId) {
    const map = {};
    const rows = getAllRecords_(dbId, EMPLOYEE_SHEET);
    rows.forEach(function (e) {
      const eid = Number(e.emp_id);
      if (Number.isInteger(eid)) map[eid] = String(e.name_ar || '').trim() || ('#' + eid);
    });
    return {
      map: map,
      options: Object.keys(map).map(function (k) {
        return { value: Number(k), label: map[k] };
      }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); })
    };
  }

  function buildBarcodeData_(rec) {
    const d = parseDate_(rec.production_date);
    const sysId = String(rec.system_id == null ? '' : rec.system_id).trim();
    return String(rec.id) + pad2_(d.getFullYear() % 100) + String(rec.emp_id) +
      pad2_(d.getMonth() + 1) + String(rec.production_id) + pad2_(d.getDate()) + sysId;
  }

  /**
   * Append a row preserving caller-supplied values (user-entered ids for
   * clients/products — must NOT go through addRecord_ which assigns ids).
   */
  function appendRow_(dbId, sheetName, dataMap) {
    const sheet = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = headers.map(function (h) {
      const key = String(h).trim().toLowerCase();
      return dataMap[key] !== undefined ? dataMap[key] : '';
    });
    sheet.appendRow(rowValues);
    noteMutation_(sheet);
    return { status: 'success', message: 'تمت الإضافة', rowNumber: sheet.getLastRow() };
  }

  // =========================================
  // شئون العاملين: قوائم ثابتة + أدوات مساعدة.
  // قيم القوائم مأخوذة من القيم الفعلية في بيانات الجداول (نطاقات
  // القوائم القديمة في الجداول تشير لخلايا غير سليمة).
  // =========================================
  const HR_STATUS_TYPES = ['يعمل بالشركة', 'استقالة', 'انهاء تعاقد', 'انقطاع عن العمل', 'بلوغ سن التقاعد', 'الوفاة', 'معاش عجز'];
  const HR_DEDUCTION_TYPES = ['سلف', 'غياب', 'جزاء'];
  const HR_PERMIT_TYPES = ['انصراف باكر', 'حضور متأخر'];
  const HR_OVERTIME_TYPES = ['عمل اضافي', 'مبيت', 'كونتر'];
  const HR_CATEGORIES = ['اعانات', 'الصعايدة', 'المرقب', 'المصنع', 'الميكروباص', 'الميني باص', 'شبرا'];
  const HR_MONTHS = [
    { value: 1, label: 'يناير' }, { value: 2, label: 'فبراير' }, { value: 3, label: 'مارس' },
    { value: 4, label: 'أبريل' }, { value: 5, label: 'مايو' }, { value: 6, label: 'يونيو' },
    { value: 7, label: 'يوليو' }, { value: 8, label: 'أغسطس' }, { value: 9, label: 'سبتمبر' },
    { value: 10, label: 'أكتوبر' }, { value: 11, label: 'نوفمبر' }, { value: 12, label: 'ديسمبر' }
  ];

  function hrOptions_(list) {
    return list.map(function (v) { return { value: v, label: v }; });
  }

  /** Default status assumed for an employee who has never had a status event logged. */
  const DEFAULT_EMPLOYEE_STATUS_ = 'يعمل بالشركة';

  /**
   * emp_id -> most recent status_type from EMP_STATUS_SHEET (by latest status_date).
   * Employees with no rows in EMP_STATUS_SHEET are NOT included in the map —
   * callers must fall back to DEFAULT_EMPLOYEE_STATUS_ for those.
   */
  function getCurrentEmployeeStatusMap_(dbId) {
    const latest = {};
    getAllRecords_(dbId, EMP_STATUS_SHEET).forEach(function (r) {
      let empCode = '';
      let statusType = '';
      let statusDate = '';
      for (const k in r) {
        const norm = String(k).trim().toLowerCase().replace(/_/g, ' ');
        if (norm === 'employee code' || norm === 'emp id' || norm === 'كود الموظف' || norm === 'كود_الموظف' || norm === 'code') empCode = r[k];
        else if (norm === 'status type' || norm === 'نوع الحالة' || norm === 'الحالة' || norm === 'status' || norm === 'نوع_الحالة') statusType = r[k];
        else if (norm === 'status date' || norm === 'تاريخ الحالة' || norm === 'التاريخ' || norm === 'date' || norm === 'تاريخ_الحالة') statusDate = r[k];
      }
      if (!empCode && r.employee_code !== undefined) empCode = r.employee_code;
      if (!statusType && r.status_type !== undefined) statusType = r.status_type;
      if (!statusDate && r.status_date !== undefined) statusDate = r.status_date;

      const empId = Number(empCode);
      if (!Number.isInteger(empId)) return;
      const type = String(statusType || '').trim();
      if (!type) return;
      const d = parseDate_(statusDate);
      if (!(d instanceof Date) || isNaN(d.getTime())) return;
      if (!latest[empId] || d.getTime() >= latest[empId].date.getTime()) {
        latest[empId] = { date: d, type: type };
      }
    });
    const map = {};
    Object.keys(latest).forEach(function (k) { map[k] = latest[k].type; });
    return map;
  }

  function titleOptions_(dbId) {
    const records = getAllRecords_(dbId, TITLE_INDEX_SHEET);
    Logger.log('[titleOptions_] recordCount=' + records.length);
    if (records.length > 0) {
      Logger.log('[titleOptions_] firstRecord keys=' + JSON.stringify(Object.keys(records[0])));
      Logger.log('[titleOptions_] firstRecord=' + JSON.stringify(records[0]));
    }
    const map = {};
    records.forEach(function (r) {
      const t = String(r['Title Name'] != null ? r['Title Name'] : (r['title_name'] != null ? r['title_name'] : (r['title'] != null ? r['title'] : ''))).trim();
      if (!t) return;
      const s = String(r.section != null ? r.section : (r['القسم'] != null ? r['القسم'] : '')).trim();
      map[t] = s;
    });
    const result = Object.keys(map).map(function (t) {
      return { value: t, label: t, section: map[t] };
    }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    Logger.log('[titleOptions_] optionCount=' + result.length);
    if (result.length > 0) Logger.log('[titleOptions_] first3=' + JSON.stringify(result.slice(0, 3)));
    return result;
  }

  function hrEmployeeOptions_(dbId) {
    return employeeRefs_(dbId).options;
  }

  /** Employees still working at the company (الحالة الوظيفية = يعمل بالشركة from employee_info VLOOKUP). */
  function hrWorkingEmployeeOptions_(dbId) {
    const map = {};
    getAllRecords_(dbId, EMPLOYEE_SHEET).forEach(function (e) {
      const eid = Number(e.emp_id);
      if (!Number.isInteger(eid)) return;
      const status = String(e['الحالة الوظيفية'] || '').trim();
      if (status !== 'يعمل بالشركة') return;
      map[eid] = String(e.name_ar || '').trim() || ('#' + eid);
    });
    return Object.keys(map).map(function (k) {
      return { value: Number(k), label: map[k] };
    }).sort(function (a, b) { return a.value - b.value; });
  }

  /** HH:MM string -> spreadsheet time fraction (day units). */
  function timeFrac_(s) {
    const t = String(s == null ? '' : s).trim();
    if (!t) return '';
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = Number(m[1]); const mn = Number(m[2]);
      if (h <= 23 && mn <= 59) return (h + mn / 60) / 24;
    }
    return t;
  }

  function hrRequireEmployee_(dbId, id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new Error('الموظف مطلوب');
    if (!employeeRefs_(dbId).map[n]) throw new Error('الموظف غير موجود');
    return n;
  }

  function hrBool_(v) {
    return !!(v === true || v === 'true' || v === 1 || v === '1');
  }

  /**
   * Append a row at getLastRow()+1 preserving leading-'=' cells as live
   * formulas (mirrors the sheet's embedded calculations).
   */
  function appendHrRow_(dbId, sheetName, dataMap) {
    const sheet = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = headers.map(function (h) {
      const orig = String(h).trim();
      const low = orig.toLowerCase();
      const clean = low.replace(/_/g, ' ');
      if (dataMap[orig] !== undefined) return dataMap[orig];
      if (dataMap[low] !== undefined) return dataMap[low];
      if (dataMap[clean] !== undefined) return dataMap[clean];
      return '';
    });
    const rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    noteMutation_(sheet);
    return rowNumber;
  }

  function companyArabicName_() {
    try {
      const row = systemFindByBusinessKey_('ERP_Companies', 'company_unique_id', COMPANY_UID);
      return row ? String(row.company_name_ar || '').trim() : 'توب كيميكال';
    } catch (e) { return 'توب كيميكال'; }
  }

  // =========================================
  // Dashboard
  // =========================================
  function getDashboardData_(data, user, dbId) {
    const currentYear = new Date().getFullYear();
    const filterYear = Number((data && data.year) || currentYear);

    const canViewKPIs = !!(user && (user.isSuperAdmin || (user.authorizedPages && user.authorizedPages['tc_dashboard'] && user.authorizedPages['tc_dashboard'].indexOf('write') !== -1)));
    if (!canViewKPIs) {
      return {
        status: 'success',
        company_name: companyArabicName_(),
        year: filterYear,
        kpi_authorized: false,
        kpi: null,
        monthlyInvoices: [],
        topClients: [],
        monthlyCosts: []
      };
    }

    const ARABIC_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

    // Helper to safely parse dates from Date objects, ISO strings, or DD/MM/YYYY
    function parseDateParts(val) {
      if (!val) return null;
      if (val instanceof Date && !isNaN(val.getTime())) {
        return { year: val.getFullYear(), month: val.getMonth() + 1 };
      }
      const s = String(val).trim();
      if (!s) return null;
      const mIso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (mIso) {
        return { year: Number(mIso[1]), month: Number(mIso[2]) };
      }
      const mDm = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
      if (mDm) {
        return { year: Number(mDm[3]), month: Number(mDm[2]) };
      }
      const dt = new Date(s);
      if (!isNaN(dt.getTime())) {
        return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
      }
      return null;
    }

    // ── Monthly invoices (legal_invoices_sales) ──────────────────────────────
    const invoiceRows = getAllRecords_(dbId, LEGAL_INVOICES_SHEET);
    const monthlyInvoices = {};
    ARABIC_MONTHS.forEach(function (m, i) { monthlyInvoices[i + 1] = { month: m, net: 0, tax: 0, total: 0 }; });
    const clientTotals = {};

    invoiceRows.forEach(function (r) {
      const invDateParts = parseDateParts(r['تاريخ الفاتورة']);
      const yr = Number(r['العام']) || (invDateParts ? invDateParts.year : 0);
      if (yr !== filterYear) return;
      const mo = Number(r['الشهر']) || (invDateParts ? invDateParts.month : 0);
      const net = Number(r['المبلغ الصافي']) || 0;
      const tax = Number(r['قيمة الضريبة']) || 0;
      const tot = Number(r['إجمالي']) || 0;
      if (mo >= 1 && mo <= 12) {
        monthlyInvoices[mo].net   += net;
        monthlyInvoices[mo].tax   += tax;
        monthlyInvoices[mo].total += tot;
      }
      const client = String(r['اسم العميل'] || r['العميل'] || '').trim();
      if (client) {
        clientTotals[client] = (clientTotals[client] || 0) + (tot || net);
      }
    });

    const monthlyInvoicesList = ARABIC_MONTHS.map(function (m, i) {
      return monthlyInvoices[i + 1];
    });

    // Top 8 clients by total
    const topClients = Object.keys(clientTotals)
      .map(function (k) { return { name: k, total: clientTotals[k] }; })
      .sort(function (a, b) { return b.total - a.total; })
      .slice(0, 8);

    // ── Monthly costs (legal_cash_bank_movement) ─────────────────────────────
    // Filter condition: chart_account_main = 'التكاليف' and approved = true
    // Amount: balance_amount * -1
    // Date: transaction_date
    const cashRows = getAllRecords_(dbId, LEGAL_CASH_SHEET);
    const monthlyCosts = {};
    ARABIC_MONTHS.forEach(function (m, i) { monthlyCosts[i + 1] = { month: m, costs: 0 }; });

    cashRows.forEach(function (r) {
      const chartAcc = String(r.chart_account_main || r['chart_account_main'] || r['الحساب الرئيسي'] || '').trim();
      if (chartAcc !== 'التكاليف') return;

      const app = r.approved !== undefined ? r.approved : r['approved'];
      const isApproved = (app === true || app === 1 || String(app).trim().toLowerCase() === 'true');
      if (!isApproved) return;

      const dParts = parseDateParts(r.transaction_date || r['transaction_date'] || r['التاريخ']);
      if (!dParts || dParts.year !== filterYear) return;

      const mo = dParts.month;
      const rawBal = Number(r.balance_amount !== undefined ? r.balance_amount : r['balance_amount']) || 0;
      const costAmount = rawBal * -1;

      if (mo >= 1 && mo <= 12) {
        monthlyCosts[mo].costs += costAmount;
      }
    });

    const monthlyCostsList = ARABIC_MONTHS.map(function (m, i) {
      return monthlyCosts[i + 1];
    });

    // ── KPI summary ──────────────────────────────────────────────────────────
    const totalNet   = monthlyInvoicesList.reduce(function (s, r) { return s + r.net;   }, 0);
    const totalTax   = monthlyInvoicesList.reduce(function (s, r) { return s + r.tax;   }, 0);
    const totalSales = monthlyInvoicesList.reduce(function (s, r) { return s + r.total; }, 0);
    const totalCosts = monthlyCostsList.reduce(function (s, r)    { return s + r.costs; }, 0);

    return {
      status: 'success',
      company_name: companyArabicName_(),
      year: filterYear,
      kpi_authorized: true,
      kpi: { totalNet: totalNet, totalTax: totalTax, totalSales: totalSales, totalCosts: totalCosts },
      monthlyInvoices: monthlyInvoicesList,
      topClients: topClients,
      monthlyCosts: monthlyCostsList
    };
  }

  // Independent KPI page — Read => welcome, Write => charts (same data as dashboard, separate gate)
  function getKpiData_(data, user, dbId) {
    const filterYear = Number((data && data.year) || new Date().getFullYear());
    const canViewKPIs = !!(user && (user.isSuperAdmin || unifiedCheck_(user, '3fe1b5cb67b7223e', 'tc_kpi', 'write')));
    if (!canViewKPIs) {
      return { status: 'success', company_name: companyArabicName_(), year: filterYear, kpi_authorized: false, kpi: null, monthlyInvoices: [], topClients: [], monthlyCosts: [] };
    }
    // reuse dashboard aggregation (already write-gated) — bypass tc_dashboard re-check by directly building KPI if needed
    // call original dashboard logic with same user (now known to have tc_kpi:write, so we grant tc_dashboard:write temporarily)
    return getDashboardData_(data, { ...user, authorizedPages: { ...user.authorizedPages, tc_dashboard: ['write'] } }, dbId);
  }

  // =========================================
  // عملاء وموردين (clients_vendors)
  // =========================================
  function getClientsVendors_(data, user, dbId) {
    const rows = tcClientsRaw_(dbId);
    return { status: 'success', clients: rows };
  }

  function addClientVendor_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('المعرف مطلوب (رقم صحيح موجب)');
    const nameAr = String(data.name_ar || '').trim();
    if (!nameAr) throw new Error('الاسم مطلوب');
    const exists = (function () { var _idx = indexById(tcClientsRaw_(dbId), 'id'); var _k = String(id).trim(); return _idx.has(_k) || _idx.has(_k.toLowerCase()); })();
    if (exists) throw new Error('المعرف مستخدم بالفعل: ' + id);
    var rec = {
      id: id,
      name_ar: nameAr,
      cell_phone: String(data.cell_phone || '').trim(),
      address: String(data.address || '').trim(),
      google_maps: String(data.google_maps || '').trim(),
      notes: String(data.notes || '').trim(),
      tax_id: String(data.tax_id || '').trim()
    };
    var res = appendRow_(dbId, CLIENTS_SHEET, rec);
    try { logHistory_(dbId, CLIENTS_SHEET, rec.record_uid || ('create_'+CLIENTS_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    try { bustTcRefs_(dbId); } catch(e){}
    try { invalidateRefsCache_(dbId, 'tc_clients_raw'); } catch(e2){}
    try { invalidateRefsCache_(dbId, 'tc_clients_opts'); } catch(e3){}
    try { invalidateRefsCache_(dbId, 'tc_clients_refs'); } catch(e4){}
    res.record = rec;
    res.data = { assignedId: id };
    return res;
  }

  function editClientVendor_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id)) throw new Error('المعرف مطلوب');
    const updates = {};
    if (data.name_ar !== undefined) {
      const nameAr = String(data.name_ar || '').trim();
      if (!nameAr) throw new Error('الاسم مطلوب');
      updates['name_ar'] = nameAr;
    }
    if (data.cell_phone !== undefined) updates['cell_phone'] = String(data.cell_phone || '').trim();
    if (data.address !== undefined) updates['address'] = String(data.address || '').trim();
    if (data.google_maps !== undefined) updates['google_maps'] = String(data.google_maps || '').trim();
    if (data.notes !== undefined) updates['notes'] = String(data.notes || '').trim();
    if (data.tax_id !== undefined) updates['tax_id'] = String(data.tax_id || '').trim();
    var _oldClientVendor = null; try { var _ocvRows = getAllRecords_(dbId, CLIENTS_SHEET); var _ocvIdx = indexById(_ocvRows, 'id'); var _ocvKey = String(id).trim(); _oldClientVendor = _ocvIdx.get(_ocvKey) || _ocvIdx.get(_ocvKey.toLowerCase()) || null; } catch(e2){}
    const sheet = getSheet_(CLIENTS_SHEET, dbId);
    if (!patchRowByCriteria_(sheet, 'id', id, updates)) throw new Error('العميل غير موجود');
    var savedRecord = { id: id };
    Object.keys(updates).forEach(function(k){ savedRecord[k]=updates[k]; });
    // fill missing from existing
    try { var _exRows = tcClientsRaw_(dbId); var _exIdx = indexById(_exRows, 'id'); var _exKey = String(id).trim(); var existing = _exIdx.get(_exKey) || _exIdx.get(_exKey.toLowerCase()) || null; if(existing){ Object.keys(existing).forEach(function(k){ if(savedRecord[k]===undefined) savedRecord[k]=existing[k]; }); } } catch(e){}
    try { var _uidCV = _oldClientVendor && _oldClientVendor.record_uid ? _oldClientVendor.record_uid : 'create_'+CLIENTS_SHEET+'_'+id; var _newCV = {}; if(_oldClientVendor) Object.keys(_oldClientVendor).forEach(function(k){ _newCV[k]=_oldClientVendor[k]; }); Object.keys(updates).forEach(function(k){ _newCV[k]=updates[k]; }); if(!Object.keys(_newCV).length) _newCV = savedRecord; logHistory_(dbId, CLIENTS_SHEET, _uidCV, String(id), (user&&user.email)||'', 'update', _newCV, _oldClientVendor); } catch(e){}
    try { bustTcRefs_(dbId); } catch(e){}
    try { invalidateRefsCache_(dbId, 'tc_clients_raw'); } catch(e2){}
    try { invalidateRefsCache_(dbId, 'tc_clients_opts'); } catch(e3){}
    try { invalidateRefsCache_(dbId, 'tc_clients_refs'); } catch(e4){}
    return { status: 'success', message: 'تم تحديث العميل', record: savedRecord, data: { assignedId: id } };
  }

  // =========================================
  // مديونيات (AR_AP)
  // =========================================
  function getArAp_(data, user, dbId) {
    const clients = tcClientOptions_(dbId);

    const clientMap = {};
    clients.forEach(function (c) { clientMap[String(c.value)] = c.label; });

    const rows = getAllRecords_(dbId, ARAP_SHEET);
    const reasonSet = {};
    const grouped = {};
    rows.forEach(function (r) {
      const cid = String((r.client == null) ? '' : r.client).trim();
      const isDebit = String((r.transaction_type == null) ? '' : r.transaction_type).trim() === 'مدين';
      const amt = num0_(r.amount);
      if (!grouped[cid]) grouped[cid] = { client_id: r.client, client_name: clientMap[cid] || ('#' + cid), debit: 0, credit: 0 };
      if (isDebit) grouped[cid].debit += amt; else grouped[cid].credit += amt;
      const reason = String((r.reason == null) ? '' : r.reason).trim();
      if (reason) reasonSet[reason] = true;
    });

    var summary = Object.keys(grouped).map(function (cid) {
      const g = grouped[cid];
      return { client_id: g.client_id, client_name: g.client_name, debit: g.debit, credit: g.credit, net: g.debit - g.credit };
    }).sort(function (a, b) { return String(a.client_name).localeCompare(String(b.client_name), 'ar'); });
    // No cap: one row per client, the set is small, and the page totals the
    // visible summary — slicing it would silently drop clients AND their
    // amounts from the grand total. (Per-client drill-down via getArApClient_
    // keeps the shared 20-row window.) `limit`/`loadAll` accepted, ignored.
    return {
      status: 'success',
      summary: summary,
      clients: clients,
      reasons: Object.keys(reasonSet).sort(),
      currencies: currencyOptions_()
    };
  }

  /** Fetch the AR_AP transactions for a single client (loaded on expand). */
  function getArApClient_(data, user, dbId) {
    const clientId = Number(data.client_id);
    if (!Number.isInteger(clientId) || clientId <= 0) throw new Error('client_id مطلوب');
    const clientMap = {};
    tcClientsRaw_(dbId).forEach(function (c) {
      clientMap[String(Number(c.id))] = String(c.name_ar || '').trim();
    });
    var rows = getAllRecords_(dbId, ARAP_SHEET)
      .filter(function (r) { return Number(r.client) === clientId; })
      .map(function (r) {
        const isDebit = String((r.transaction_type == null) ? '' : r.transaction_type).trim() === 'مدين';
        const amt = num0_(r.amount);
        return {
          id: r.id,
          client_id: r.client,
          client_name: clientMap[String(Number(r.client))] || ('#' + r.client),
          date: r.date,
          amount: amt,
          signed_amount: isDebit ? amt : -amt,
          currency: String(r.currency || 'EGP').trim(),
          transaction_type: isDebit ? 'مدين' : 'دائن',
          reason: r.reason,
          invoice_id: r.invoice_id
        };
      })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return {
      status: 'success',
      client_id: clientId,
      client_name: clientMap[String(clientId)] || ('#' + clientId),
      transactions: rows
    };
  }

  function addArAp_(data, user, dbId) {
    const amount = Number(data.amount);
    if (isNaN(amount) || amount < 0) throw new Error('المبلغ مطلوب (قيمة رقمية)');
    const client = Number(data.client);
    if (!Number.isInteger(client) || client <= 0) throw new Error('العميل مطلوب');
    const type = String(data.transaction_type || '').trim();
    if (type !== 'مدين' && type !== 'دائن') throw new Error('نوع الحركة مطلوب (مدين / دائن)');
    const reason = String(data.reason || '').trim();
    if (!reason) throw new Error('السبب مطلوب');
    const currency = String(data.currency || 'EGP').trim();
    const date = data.date ? parseDate_(data.date) : new Date();
    const invoiceId = (data.invoice_id === undefined || data.invoice_id === null || String(data.invoice_id).trim() === '')
      ? '' : String(data.invoice_id).trim();

    const clientExists = tcClientsRaw_(dbId).some(function(c){ return Number(c.id) === client; });
    if (!clientExists) throw new Error('العميل غير موجود');

    return executeWithLock_(function () {
      const id = getNextIdUnderLock_(dbId, ARAP_SHEET);
      const sheet = getSheet_(ARAP_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        if (key === 'id') return id;
        if (key === 'date') return date;
        if (key === 'client') return client;
        if (key === 'name_ar') return ''; // VLOOKUP formula set below
        if (key === 'amount') return amount;
        if (key === 'currency') return currency;
        if (key === 'transaction_type') return type;
        if (key === 'reason') return reason;
        if (key === 'invoice_id') return invoiceId;
        return '';
      });
      // Phase 8 (F-04): appendRow + setFormula -> one setValues. The formula
      // string, the column it lands in and the guard around it are unchanged —
      // only the destination moves from the sheet to the row being written.
      // setValues treats a leading '=' as a formula exactly as appendRow and
      // setFormula do. Already inside executeWithLock_, so the precomputed
      // target row is safe against a concurrent append and is the same row
      // appendRow would have used; ensureGridRows_ grows the grid the way
      // appendRow did implicitly.
      const rowNum = sheet.getLastRow() + 1;
      const nameIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'name_ar');
      const clientIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'client');
      if (nameIdx !== -1 && clientIdx !== -1) {
        rowValues[nameIdx] =
          '=VLOOKUP(' + colLetter_(clientIdx) + rowNum + ',clients_vendors!A:B,2,0)';
      }
      ensureGridRows_(sheet, rowNum);
      sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
      noteMutation_(sheet);
      var cMap = clientVendorRefs_(dbId).map;
      var savedRecord = {
        id: id,
        client: client,
        client_id: client,
        client_name: cMap[client] || ('#' + client),
        date: date,
        amount: amount,
        signed_amount: type === 'مدين' ? amount : -amount,
        currency: currency,
        transaction_type: type,
        reason: reason,
        invoice_id: invoiceId
      };
      try { var _newArAp = { id: id, date: date, client: client, amount: amount, currency: currency, transaction_type: type, reason: reason, invoice_id: invoiceId }; logHistory_(dbId, ARAP_SHEET, 'create_'+ARAP_SHEET+'_'+id, String(id), (user&&user.email)||'', 'create', _newArAp, null); } catch(e){}
      return { status: 'success', message: 'تمت إضافة الحركة', record: savedRecord, data: { assignedId: id, rowNumber: rowNum } };
    });
  }

  // =========================================
  // الأصناف (products)
  // =========================================
  function getProducts_(data, user, dbId) {
    const rows = tcProductsRaw_(dbId);
    const unitSet = {};
    rows.forEach(function (r) { const u = String(r.unit || '').trim(); if (u) unitSet[u] = true; });
    const unitOptions = Object.keys(unitSet).sort();
    const categoryOptions = tcCategoryOptions_(dbId);
    return { status: 'success', products: rows, unit_options: unitOptions, category_options: categoryOptions };
  }

  function addProduct_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('المعرف مطلوب (رقم صحيح موجب)');
    const codeRaw = String(data.code == null ? '' : data.code).trim();
    if (codeRaw === '') throw new Error('الكود مطلوب');
    const code = Number(codeRaw);
    if (!Number.isInteger(code)) throw new Error('الكود يجب أن يكون رقماً صحيحاً');
    const nameAr = String(data.name_ar || '').trim();
    if (!nameAr) throw new Error('الاسم مطلوب');
    const unit = String(data.unit || '').trim();
    if (!unit) throw new Error('الوحدة مطلوبة');
    const category = String(data.category || '').trim();
    if (!category) throw new Error('الفئة مطلوبة');
    const cartonsRaw = String(data.number_of_cartons_bags == null ? '' : data.number_of_cartons_bags).trim();
    if (cartonsRaw === '') throw new Error('عدد الكراتين/الشنط مطلوب');
    const cartons = Number(cartonsRaw);
    if (!Number.isInteger(cartons)) throw new Error('عدد الكراتين/الشنط يجب أن يكون رقماً صحيحاً');

    const cats = tcCategoryNames_(dbId);
    if (cats.indexOf(category) === -1) throw new Error('الفئة غير موجودة في جدول الفئات');

    const exists = (function () { var _idx = indexById(tcProductsRaw_(dbId), 'id'); var _k = String(id).trim(); return _idx.has(_k) || _idx.has(_k.toLowerCase()); })();
    if (exists) throw new Error('المعرف مستخدم بالفعل: ' + id);

    var recP = {
      id: id,
      code: code,
      name_ar: nameAr,
      unit: unit,
      category: category,
      number_of_cartons_bags: cartons,
      print_file: String(data.print_file || '').trim()
    };
    var _pfId = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'print_file') || '').trim() : '';
    if (!_pfId && recP.print_file) { try { _pfId = String(CacheService.getScriptCache().get('attid_' + recP.print_file) || '').trim(); } catch (e2) {} }
    _pfId = requireAttachmentBinding_(recP.print_file, _pfId, 'print_file');
    if (_pfId) {
      recP.print_file_id = _pfId;
      try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, PRODUCTS_SHEET, 'print_file_id'); } catch (e3) {}
    }
    var resP = appendRow_(dbId, PRODUCTS_SHEET, recP);
    try { logHistory_(dbId, PRODUCTS_SHEET, recP.record_uid || ('create_'+PRODUCTS_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', recP, null); } catch(e){}
    try { bustTcRefs_(dbId); } catch(e){}
    try { invalidateRefsCache_(dbId, 'tc_products_raw'); } catch(e2){}
    try { invalidateRefsCache_(dbId, 'tc_products_refs'); } catch(e3){}
    resP.record = recP;
    resP.data = { assignedId: id };
    return resP;
  }

  function editProduct_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id)) throw new Error('المعرف مطلوب');
    const updates = {};
    if (data.code !== undefined) {
      const codeRaw = String(data.code == null ? '' : data.code).trim();
      if (codeRaw === '') throw new Error('الكود مطلوب');
      const code = Number(codeRaw);
      if (!Number.isInteger(code)) throw new Error('الكود يجب أن يكون رقماً صحيحاً');
      updates['code'] = code;
    }
    if (data.name_ar !== undefined) {
      const nameAr = String(data.name_ar || '').trim();
      if (!nameAr) throw new Error('الاسم مطلوب');
      updates['name_ar'] = nameAr;
    }
    if (data.unit !== undefined) {
      const unit = String(data.unit || '').trim();
      if (!unit) throw new Error('الوحدة مطلوبة');
      updates['unit'] = unit;
    }
    if (data.category !== undefined) {
      const category = String(data.category || '').trim();
      if (!category) throw new Error('الفئة مطلوبة');
      const cats = tcCategoryNames_(dbId);
      if (cats.indexOf(category) === -1) throw new Error('الفئة غير موجودة في جدول الفئات');
      updates['category'] = category;
    }
    if (data.number_of_cartons_bags !== undefined) {
      const cartonsRaw = String(data.number_of_cartons_bags == null ? '' : data.number_of_cartons_bags).trim();
      if (cartonsRaw === '') throw new Error('عدد الكراتين/الشنط مطلوب');
      const cartons = Number(cartonsRaw);
      if (!Number.isInteger(cartons)) throw new Error('عدد الكراتين/الشنط يجب أن يكون رقماً صحيحاً');
      updates['number_of_cartons_bags'] = cartons;
    }
    if (data.print_file !== undefined) {
      updates['print_file'] = String(data.print_file || '').trim();
      var _epfId = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'print_file') || '').trim() : '';
      if (!_epfId && updates['print_file']) { try { _epfId = String(CacheService.getScriptCache().get('attid_' + updates['print_file']) || '').trim(); } catch (e2) {} }
      if (!_epfId && updates['print_file'] && data.print_file_id && typeof attachmentAuthorizedStoredId_ === 'function') _epfId = attachmentAuthorizedStoredId_(dbId, PRODUCTS_SHEET, data, 'print_file', data.print_file_id);
      _epfId = requireAttachmentBinding_(updates['print_file'], _epfId, 'print_file');
      updates['print_file_id'] = _epfId;
      if (_epfId || updates['print_file'] === '') {
        try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, PRODUCTS_SHEET, 'print_file_id'); } catch (e3) {}
      }
    }
    var _oldProd = null; try { var _opRows = getAllRecords_(dbId, PRODUCTS_SHEET); var _opIdx = indexById(_opRows, 'id'); var _opKey = String(id).trim(); _oldProd = _opIdx.get(_opKey) || _opIdx.get(_opKey.toLowerCase()) || null; } catch(e2){}
    const sheet = getSheet_(PRODUCTS_SHEET, dbId);
    if (!patchRowByCriteria_(sheet, 'id', id, updates)) throw new Error('المنتج غير موجود');
    try { var _uidProd = _oldProd && _oldProd.record_uid ? _oldProd.record_uid : 'create_'+PRODUCTS_SHEET+'_'+id; var _newProd = {}; if(_oldProd) Object.keys(_oldProd).forEach(function(k){ _newProd[k]=_oldProd[k]; }); Object.keys(updates).forEach(function(k){ _newProd[k]=updates[k]; }); logHistory_(dbId, PRODUCTS_SHEET, _uidProd, String(id), (user&&user.email)||'', 'update', _newProd, _oldProd); } catch(e){}
    try { bustTcRefs_(dbId); } catch(e){}
    try { invalidateRefsCache_(dbId, 'tc_products_raw'); } catch(e2b){}
    try { invalidateRefsCache_(dbId, 'tc_products_refs'); } catch(e3b){}
    var savedRecProd = { id: id };
    Object.keys(updates).forEach(function(k){ savedRecProd[k]=updates[k]; });
    try { var _exPRows = tcProductsRaw_(dbId); var _exPIdx = indexById(_exPRows, 'id'); var _exPKey = String(id).trim(); var exP = _exPIdx.get(_exPKey) || _exPIdx.get(_exPKey.toLowerCase()) || null; if(exP){ Object.keys(exP).forEach(function(k){ if(savedRecProd[k]===undefined) savedRecProd[k]=exP[k]; }); } } catch(e){}
    return { status: 'success', message: 'تم تحديث المنتج', record: savedRecProd, data: { assignedId: id } };
  }

  // =========================================
  // باركود الإنتاج (top_chemical_barcode_generator)
  // =========================================
  function getBarcode_(data, user, dbId) {
    const products = productRefs_(dbId);
    const employees = employeeRefs_(dbId);
    // Phase 12 — slice before mapping. The sort key is `id`, which the map copies
    // straight off the raw row, so the same comparator applied to raw[i].id over an
    // index array gives the same permutation: Array.prototype.sort is stable and the
    // index array starts in the same order the mapped array did.
    var raw = getAllRecords_(dbId, BARCODE_SHEET);
    var order = [];
    for (var i = 0; i < raw.length; i++) order.push(i);
    order.sort(function (a, b) { return Number(raw[b].id) - Number(raw[a].id); });
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) order = order.slice(0, limit);
    var rows = order.map(function (idx) {
      var r = raw[idx];
      return {
        id: r.id,
        unique_id: r.unique_id,
        production_date: r.production_date,
        product_id: r.product_id,
        product_name: products.map[Number(r.product_id)] || ('#' + r.product_id),
        emp_id: r.emp_id,
        emp_name: employees.map[Number(r.emp_id)] || ('#' + r.emp_id),
        system_id: r.system_id,
        production_id: r.production_id,
        print_unique_id: r.print_unique_id,
        display_barcode: r.display_barcode,
        print_link: r.print_link,
        user: r.user,
        created_at: r.created_at
      };
    });
    return { status: 'success', barcodes: rows, product_options: products.options, emp_options: employees.options };
  }

  function addBarcode_(data, user, dbId) {
    const productId = Number(data.product_id);
    if (!Number.isInteger(productId) || productId <= 0) throw new Error('المنتج مطلوب');
    const empId = Number(data.emp_id);
    if (!Number.isInteger(empId) || empId <= 0) throw new Error('الموظف مطلوب');
    const systemIdRaw = String(data.system_id == null ? '' : data.system_id).trim();
    if (systemIdRaw === '') throw new Error('نظام ID مطلوب');
    const systemId = Number(systemIdRaw);
    if (!Number.isInteger(systemId)) throw new Error('نظام ID يجب أن يكون رقماً صحيحاً');
    const productionIdRaw = String(data.production_id == null ? '' : data.production_id).trim();
    if (productionIdRaw === '') throw new Error('Production ID مطلوب');
    const productionId = Number(productionIdRaw);
    if (!Number.isInteger(productionId)) throw new Error('Production ID يجب أن يكون رقماً صحيحاً');
    const productionDate = data.production_date ? parseDate_(data.production_date) : new Date();
    if (isNaN(productionDate.getTime())) throw new Error('تاريخ الإنتاج غير صحيح');

    const productExists = Number.isInteger(productRefs_(dbId).map[productId] ? productId : -1);
    if (!productExists) throw new Error('المنتج غير موجود');
    const empExists = Number.isInteger(employeeRefs_(dbId).map[empId] ? empId : -1);
    if (!empExists) throw new Error('الموظف غير موجود');

    return executeWithLock_(function () {
      const id = getNextIdUnderLock_(dbId, BARCODE_SHEET);
      const sheet = getSheet_(BARCODE_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const uniqueId = uid16_();
      const printUniqueId = uid8_();
      const rec = {
        id: id,
        unique_id: uniqueId,
        production_date: productionDate,
        product_id: productId,
        emp_id: empId,
        system_id: systemId,
        production_id: productionId,
        print_unique_id: printUniqueId
      };
      const dataValue = buildBarcodeData_(rec);
      rec.display_barcode = 'https://barcode.tec-it.com/barcode.ashx?data=' +
        encodeURIComponent(dataValue) + '&code=Code128';
      rec.user = (user && user.email) || '';
      rec.created_at = new Date();
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      const rowNum = sheet.getLastRow() + 1;
      sheet.appendRow(rowValues);
      noteMutation_(sheet);
      try { logHistory_(dbId, BARCODE_SHEET, rec.record_uid || ('create_'+BARCODE_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
      var pMap = productRefs_(dbId).map;
      var eMap = employeeRefs_(dbId).map;
      var savedRecord = {
        id: rec.id,
        unique_id: rec.unique_id,
        production_date: rec.production_date,
        product_id: rec.product_id,
        product_name: pMap[Number(rec.product_id)] || ('#' + rec.product_id),
        emp_id: rec.emp_id,
        emp_name: eMap[Number(rec.emp_id)] || ('#' + rec.emp_id),
        system_id: rec.system_id,
        production_id: rec.production_id,
        print_unique_id: rec.print_unique_id,
        display_barcode: rec.display_barcode,
        print_link: '',
        user: rec.user,
        created_at: rec.created_at
      };
      return { status: 'success', message: 'تمت إضافة الباركود', record: savedRecord, data: { assignedId: id, rowNumber: rowNum, display_barcode: rec.display_barcode } };
    });
  }

  // =========================================
  // تصاريح وتراخيص (registration_papers)
  // =========================================
  function getRegistrationPapers_(data, user, dbId) {
    const products = productRefs_(dbId);
    const rows = getAllRecords_(dbId, REGISTRATION_SHEET);
    const typeSet = {};
    rows.forEach(function (r) {
      const t = String(r.document_type || '').trim();
      if (t) typeSet[t] = true;
    });
    /* The registration-papers page uses a local JSON snapshot and the shared
       table's universal search. Do not send a newest-20 window here: a local
       search cannot be universal if the server has already discarded older
       rows. Keep newest-first ordering, but include every record in the
       snapshot. */
    var papers = rows.map(function (r) {
        return {
          document_name_ar: r.document_name_ar,
          document_name_en: r.document_name_en,
          product_id: r.product,
          product_name: products.map[Number(r.product)] || '',
          document_number: r.document_number,
          document_type: r.document_type,
          document_start_date: r.document_start_date,
          document_end_date: r.document_end_date,
          document_file: r.document_file,
          document_file_id: r.document_file_id || ''
        };
      });
    papers.reverse();
    var snapshot = {
      schema_version: 1,
      table: REGISTRATION_SHEET,
      rows: papers,
      document_types: Object.keys(typeSet).sort(function (a, b) { return String(a).localeCompare(String(b), 'ar'); }),
      product_options: products.options
    };
    return {
      status: 'success',
      data_json: JSON.stringify(snapshot),
      loaded_all: true,
      total: papers.length
    };
  }

  function addRegistrationPaper_(data, user, dbId) {
    const nameAr = String(data.document_name_ar || '').trim();
    if (!nameAr) throw new Error('اسم المستند بالعربية مطلوب');
    const numRaw = String(data.document_number == null ? '' : data.document_number).trim();
    if (numRaw === '') throw new Error('رقم المستند مطلوب');
    const num = Number(numRaw);
    if (!Number.isInteger(num)) throw new Error('رقم المستند يجب أن يكون رقماً صحيحاً');
    const type = String(data.document_type || '').trim();
    if (!type) throw new Error('نوع المستند مطلوب');
    const startDate = data.document_start_date ? parseDate_(data.document_start_date) : new Date();
    const endDate = data.document_end_date ? parseDate_(data.document_end_date) : new Date();
    const product = Number(data.product);
    const documentFile = String(data.document_file || '').trim();
    var documentFileId = '';
    try { documentFileId = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(data, 'document_file') || '').trim() : ''; } catch (e) {}
    if (!documentFileId && documentFile) {
      try { documentFileId = String(CacheService.getScriptCache().get('attid_' + documentFile) || '').trim(); } catch (e) {}
    }
    documentFileId = requireAttachmentBinding_(documentFile, documentFileId, 'document_file');
    try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, REGISTRATION_SHEET, 'document_file_id'); } catch (e) {}

    if (product) {
      const productExists = productRefs_(dbId).map[product];
      if (!productExists) throw new Error('المنتج غير موجود');
    }

    var pMap2 = productRefs_(dbId).map;
    var savedRecord = {
      document_name_ar: nameAr,
      document_name_en: String(data.document_name_en || '').trim(),
      product: product || '',
      product_id: product || '',
      product_name: product ? (pMap2[product] || '') : '',
      document_number: num,
      document_type: type,
      document_start_date: startDate,
      document_end_date: endDate,
      document_file: documentFile,
      document_file_id: documentFileId
    };
    var _mapReg = {
      document_name_ar: nameAr,
      document_name_en: String(data.document_name_en || '').trim(),
      product: product || '',
      document_number: num,
      document_type: type,
      document_start_date: startDate,
      document_end_date: endDate,
      document_file: documentFile,
      document_file_id: documentFileId
    };
    var res = appendRow_(dbId, REGISTRATION_SHEET, _mapReg);
    try { logHistory_(dbId, REGISTRATION_SHEET, 'create_'+REGISTRATION_SHEET+'_'+num, String(num), (user&&user.email)||'', 'create', _mapReg, null); }catch(e){}
    res.record = savedRecord;
    res.data = res.data || {};
    res.data.assignedId = num;
    return res;
  }

  /* Row-edit repair (Stage 4): keyed registration-paper correction. The sheet
   * carries no UID column, so the original document_number is the selector:
   * it must match exactly one row or the edit is refused (missing/ambiguous).
   * Manual validation mirrors addRegistrationPaper_; only manual literals are
   * written through the formula-safe patch helper. The existing attachment
   * pair is retained unless a replacement arrives through the trusted upload
   * flow; a changed business number must not collide with another row. */
  function updateRegistrationPaper_(data, user, dbId) {
    if (!(user && user.isSuperAdmin)) throw new Error('التعديل مسموح فقط للمشرف العام');
    var originalRaw = String((data && data.original_document_number) == null ? '' : data.original_document_number).trim();
    if (originalRaw === '') throw new Error('رقم المستند الأصلي مطلوب');
    const nameAr = String(data.document_name_ar || '').trim();
    if (!nameAr) throw new Error('اسم المستند بالعربية مطلوب');
    const numRaw = String(data.document_number == null ? '' : data.document_number).trim();
    if (numRaw === '') throw new Error('رقم المستند مطلوب');
    const num = Number(numRaw);
    if (!Number.isInteger(num)) throw new Error('رقم المستند يجب أن يكون رقماً صحيحاً');
    const type = String(data.document_type || '').trim();
    if (!type) throw new Error('نوع المستند مطلوب');
    const startDate = data.document_start_date ? parseDate_(data.document_start_date) : new Date();
    const endDate = data.document_end_date ? parseDate_(data.document_end_date) : new Date();
    const product = Number(data.product);
    if (product) {
      const productExists = productRefs_(dbId).map[product];
      if (!productExists) throw new Error('المنتج غير موجود');
    }

    var sheet = getSheet_(REGISTRATION_SHEET, dbId);
    var allReg = getAllRecords_(dbId, REGISTRATION_SHEET);
    var matches = allReg.filter(function (r) {
      return String(r.document_number == null ? '' : r.document_number).trim() === originalRaw;
    });
    if (!matches.length) throw new Error('السجل غير موجود');
    if (matches.length > 1) throw new Error('رقم المستند مكرر — يلزم مراجعة السجل قبل التعديل');
    var oldRow = matches[0];
    if (String(num) !== originalRaw) {
      var clash = allReg.some(function (r) {
        return r !== oldRow && String(r.document_number == null ? '' : r.document_number).trim() === String(num);
      });
      if (clash) throw new Error('رقم المستند مستخدم في سجل آخر');
    }

    var merged = Object.assign({}, data);
    if ((merged.document_file == null || String(merged.document_file).trim() === '') && oldRow.document_file) {
      merged.document_file = oldRow.document_file;
      if (oldRow.document_file_id) merged.document_file_id = oldRow.document_file_id;
    }
    var documentFile = String(merged.document_file || '').trim();
    var documentFileId = '';
    try { documentFileId = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(merged, 'document_file') || '').trim() : ''; } catch (e) {}
    if (!documentFileId && documentFile) {
      try { documentFileId = String(CacheService.getScriptCache().get('attid_' + documentFile) || '').trim(); } catch (e2) {}
    }
    documentFileId = requireAttachmentBinding_(documentFile, documentFileId, 'document_file');
    try { if (typeof ensureAttachmentColumn_ === 'function') ensureAttachmentColumn_(dbId, REGISTRATION_SHEET, 'document_file_id'); } catch (e3) {}

    var pMapU = productRefs_(dbId).map;
    var map = {
      document_name_ar: nameAr,
      document_name_en: String(merged.document_name_en || '').trim(),
      product: product || '',
      document_number: num,
      document_type: type,
      document_start_date: startDate,
      document_end_date: endDate,
      document_file: documentFile,
      document_file_id: documentFileId
    };
    var result;
    executeWithLock_(function () {
      if (!patchRowByCriteria_(sheet, 'document_number', originalRaw, map)) throw new Error('السجل غير موجود');
      var savedUpdated = {
        document_name_ar: nameAr,
        document_name_en: String(merged.document_name_en || '').trim(),
        product: product || '',
        product_id: product || '',
        product_name: product ? (pMapU[product] || '') : '',
        document_number: num,
        document_type: type,
        document_start_date: startDate,
        document_end_date: endDate,
        document_file: documentFile,
        document_file_id: documentFileId
      };
      try { logHistory_(dbId, REGISTRATION_SHEET, oldRow.record_uid || ('update_' + REGISTRATION_SHEET + '_' + originalRaw), originalRaw, (user && user.email) || '', 'update', savedUpdated, oldRow); } catch (e4) {}
      result = { status: 'success', message: 'تم تحديث المستند', record: savedUpdated, data: { assignedId: num } };
    });
    return result;
  }

  // =========================================
  // عهد خاصة (عهد وحسابات خاصة)
  // =========================================
  function getTrustAccounts_(data, user, dbId) {
    const rows = getAllRecords_(dbId, TRUST_SHEET);
    const grouped = {};
    const accountSet = {};
    rows.forEach(function (r) {
      const acct = String((r.account == null) ? '' : r.account).trim();
      if (!acct) return;
      accountSet[acct] = true;
      if (!grouped[acct]) grouped[acct] = { account: acct, in_total: 0, out_total: 0, count: 0 };
      const isIn = String((r.movement_type == null) ? '' : r.movement_type).trim() === 'عهدة';
      const amt = num0_(r.value);
      if (isIn) grouped[acct].in_total += amt; else grouped[acct].out_total += amt;
      grouped[acct].count++;
    });
    const accounts = Object.keys(grouped).map(function (acct) {
      const g = grouped[acct];
      return {
        account: g.account,
        in_total: g.in_total,
        out_total: g.out_total,
        net: g.in_total - g.out_total,
        count: g.count
      };
    }).sort(function (a, b) { return String(a.account).localeCompare(String(b.account), 'ar'); });
    return {
      status: 'success',
      accounts: accounts,
      account_options: Object.keys(accountSet).sort(function (a, b) { return String(a).localeCompare(String(b), 'ar'); })
    };
  }

  function getTrustMovements_(data, user, dbId) {
    const acct = String((data && data.account) || '').trim();
    if (!acct) throw new Error('الحساب مطلوب');
    var rows = getAllRecords_(dbId, TRUST_SHEET)
      .filter(function (r) { return String((r.account == null) ? '' : r.account).trim() === acct; })
      .map(function (r) {
        const isIn = String((r.movement_type == null) ? '' : r.movement_type).trim() === 'عهدة';
        const amt = num0_(r.value);
        return {
          id: r.id,
          account: String((r.account == null) ? '' : r.account).trim(),
          date: r.date,
          movement_type: isIn ? 'عهدة' : 'مصروف',
          reason: r.reason,
          value: amt,
          signed_value: isIn ? amt : -amt,
          details: r.details,
          user: r.user,
          created_at: r.created_at
        };
      })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', account: acct, movements: rows };
  }

  function addTrustMovement_(data, user, dbId) {
    const acct = String((data && data.account) || '').trim();
    if (!acct) throw new Error('الحساب مطلوب');
    const type = String((data && data.movement_type) || '').trim();
    if (type !== 'عهدة' && type !== 'مصروف') throw new Error('نوع الحركة مطلوب (عهدة / مصروف)');
    const reason = String((data && data.reason) || '').trim();
    if (!reason) throw new Error('السبب مطلوب');
    const valueRaw = String(data.value == null ? '' : data.value).trim();
    if (valueRaw === '') throw new Error('القيمة مطلوبة');
    const value = Number(valueRaw);
    if (isNaN(value) || value < 0) throw new Error('القيمة يجب أن تكون رقماً موجباً');
    const date = data.date ? parseDate_(data.date) : new Date();
    const details = String((data && data.details) || '').trim();

    return executeWithLock_(function () {
      const id = getNextIdUnderLock_(dbId, TRUST_SHEET);
      const sheet = getSheet_(TRUST_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const rec = {
        id: id,
        account: acct,
        date: date,
        movement_type: type,
        reason: reason,
        value: value,
        details: details,
        user: (user && user.email) || '',
        created_at: new Date()
      };
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      const rowNum = sheet.getLastRow() + 1;
      sheet.appendRow(rowValues);
      noteMutation_(sheet);
      try { logHistory_(dbId, TRUST_SHEET, rec.record_uid || ('create_'+TRUST_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
      var savedRecord = {
        id: rec.id,
        account: rec.account,
        date: rec.date,
        movement_type: rec.movement_type,
        reason: rec.reason,
        value: rec.value,
        signed_value: rec.movement_type === 'عهدة' ? rec.value : -rec.value,
        details: rec.details,
        user: rec.user,
        created_at: rec.created_at
      };
      return { status: 'success', message: 'تمت إضافة الحركة', record: savedRecord, data: { assignedId: id, rowNumber: rowNum } };
    });
  }

  /* Not a sheet: a MySQL view on the live database, read for one column. */
  const SYSTEM_QTY_VIEW = 'product_current_quantity';
  const SYSTEM_QTY_KEY = 'tc_system_qty';
  const SYSTEM_QTY_TTL = 120;

  /**
   * product id -> current_qty, from the MySQL view product_current_quantity.
   *
   * رصيد السيستم is the balance a physical count is judged against, and it was
   * typed from memory — so a slip put the count against the wrong balance and
   * the difference/percentage formulas dutifully computed a shortage that was
   * never real. The view's `id` is the same product id this sheet stores in
   * `product`, so the join needs no mapping table.
   *
   * Cached briefly and shared across users: one JDBC connection costs more
   * than everything else this page does, and the view is two columns wide.
   * Deliberately NOT folded into get_stock_revision — the list must not wait
   * on a database on another host before it can paint.
   */
  function systemQtyMap_() {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.systemQtyMap_')) {
      return mysqlRead_(mysqlTcDefinition_('systemQtyMap_'), {}, function (p) { return systemQtyMap_(); });
    }
    
    
    
    const cached = (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) ? null : getChunkedCache_(SYSTEM_QTY_KEY);
    if (cached) return cached;
    const map = {};
    let conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.createStatement();
      rs = stmt.executeQuery('SELECT id, current_qty FROM ' + SYSTEM_QTY_VIEW);
      while (rs.next()) {
        const id = Number(rs.getString('id'));
        if (!Number.isInteger(id) || id <= 0) continue;
        const qty = rs.getString('current_qty');
        if (qty === null || qty === '') continue;
        const n = Number(qty);
        if (!isNaN(n)) map[id] = n;
      }
    } finally {
      try { if (rs) rs.close(); } catch (e) {}
      try { if (stmt) stmt.close(); } catch (e) {}
      try { if (conn) conn.close(); } catch (e) {}
    }
    if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) putChunkedCache_(SYSTEM_QTY_KEY, map, SYSTEM_QTY_TTL);
    return map;
  }

  /* Not a sheet either: the products table on the same live database, read for
   * the two columns a picker needs. `id` is the value a legal product stores in
   * product_system_id and `name_ar` is what it is shown by. Cached with the
   * same short TTL as the balance view, and cleared when a products row is
   * written on the products-live page, so a renamed product is not shown by its
   * old name for the rest of the TTL. */
  const SYSTEM_PRODUCT_OPTIONS_KEY = 'tc_system_product_options';
  const SYSTEM_PRODUCT_OPTIONS_TTL = 120;

  /* The cached bundle, or null. NEVER touches the database: callers that only
   * want names (the balance report) must not pay a JDBC round trip for them. */
  function systemProductOptionsCached_() {
    try { if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) return null; return getChunkedCache_(SYSTEM_PRODUCT_OPTIONS_KEY); } catch (e) { return null; }
  }

  function systemProductOptions_() {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.systemProductOptions_')) {
      return mysqlRead_(mysqlTcDefinition_('systemProductOptions_'), {}, function (p) { return systemProductOptions_(); });
    }
    
    
    
    const cached = systemProductOptionsCached_();
    if (cached) return cached;
    const options = [];
    const map = {};
    let conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.createStatement();
      rs = stmt.executeQuery('SELECT id, name_ar FROM products WHERE deleted_at IS NULL ORDER BY id');
      while (rs.next()) {
        const id = Number(rs.getString('id'));
        if (!Number.isInteger(id) || id <= 0) continue;
        const name = String(rs.getString('name_ar') == null ? '' : rs.getString('name_ar')).trim();
        const key = String(id);
        if (map[key] !== undefined) continue;
        map[key] = name || key;
        options.push({ value: key, label: name || key });
      }
    } finally {
      try { if (rs) rs.close(); } catch (e) {}
      try { if (stmt) stmt.close(); } catch (e) {}
      try { if (conn) conn.close(); } catch (e) {}
    }
    const out = { options: options, map: map };
    if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) if (typeof _mysqlRequest_ === 'undefined' || !_mysqlRequest_) putChunkedCache_(SYSTEM_PRODUCT_OPTIONS_KEY, out, SYSTEM_PRODUCT_OPTIONS_TTL);
    return out;
  }

  /* legal_products.product_system_id is a multi-choice column: one legal product
   * may be linked to several system products. It is stored the way AppSheet
   * stores an EnumList — a comma-separated list in one cell ('10,11,20') — so
   * the sheet needs no new column and a single stored id keeps working exactly
   * as before. Anything that is not a positive integer is dropped from the
   * parsed list; the raw cell value is still returned by the read path so a
   * malformed cell is visible rather than silently swallowed. */
  function parseSystemIds_(v) {
    const out = [];
    const seen = {};
    String(v == null ? '' : v).split(/[,،;\s]+/).forEach(function (part) {
      const s = String(part == null ? '' : part).trim();
      if (!s) return;
      const n = Number(s);
      if (!Number.isInteger(n) || n <= 0) return;
      const key = String(n);
      if (seen[key]) return;
      seen[key] = true;
      out.push(n);
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  /**
   * The map, for the count form's default.
   *
   * A MySQL that is down throws from here, and the form falls back to a
   * hand-typed balance: جرد المخزون must not become unusable because a
   * database on another host is.
   */
  function getSystemQty_() {
    return { status: 'success', system_qty: systemQtyMap_() };
  }

  // =========================================
  // جرد المخزون (stock_revision)
  // Columns (real sheet): product | name_ar | category | date | unit | amount |
  // warehouse | notes | available_amount | difference | percentage | user | created_at
  // name_ar/category/unit/difference/percentage are sheet formulas (set on insert).
  // =========================================
  function getStockRevision_(data, user, dbId) {
    const products = productRefs_(dbId);
    const sheet = getSheet_(STOCK_SHEET, dbId);
    const allData = sheet.getDataRange().getValues();
    const hdrs = getHeaders_(sheet);
    var rows = [];
    for (let i = 1; i < allData.length; i++) {
      const record = {};
      hdrs.forEach(function (h, ci) { record[String(h).trim()] = allData[i][ci] !== undefined ? allData[i][ci] : ''; });
      if (Object.values(record).some(function (v) { return String(v).trim() !== ''; })) {
        record._sheetRow = i + 1;
        record.product_name = products.map[Number(record.product)] || ('#' + record.product);
        rows.push(record);
      }
    }
    rows = rows.reverse();
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', stock: rows, product_options: products.options };
  }

  /** جرد دوري مخازن باركود — bootstrap for the scan page: product options
   *  (id, name, per-container qty) straight from the MySQL products master —
   *  the same source of truth as tc_products_live — not the sheets copy.
   *  number_of_cartons_bags rides along as per_unit so the count form can
   *  pre-fill الكمية بالعبوة الواحدة for the picked product. */
  function getStockScanOptions_(data, user, dbId) {
    const res = dbStockScanProducts_(data || {}, user);
    const productOptions = (res && res.products ? res.products : []).map(function (p) {
      const pid = String(p.id == null ? '' : p.id).trim();
      return {
        value: pid,
        label: String(p.name_ar || ('#' + pid)),
        per_unit: p.number_of_cartons_bags == null ? '' : String(p.number_of_cartons_bags),
        code: p.code == null ? null : String(p.code)
      };
    });
    return { status: 'success', mode: (res && res.mode) || String((data || {}).mode || ''), product_options: productOptions, has_more: !!(res && res.has_more), offset: Number((data || {}).offset) || 0 };
  }
  /** Stock Scan picker catalog from the same Google Sheets products source
   * used by tc_barcode. This keeps the product-name picker independent of a
   * potentially slow MySQL catalog read; balance and save authority remain on
   * their existing MySQL paths. */
  function getStockScanSheetCatalog_(data, user, dbId) {
    data = data || {};
    if (data.refresh === true) bustTcRefs_(dbId);
    var rows = tcProductsRaw_(dbId);
    var byId = Object.create(null);
    (rows || []).forEach(function (p) {
      var numericId = Number(p && p.id);
      if (!Number.isInteger(numericId) || numericId <= 0) return;
      var id = String(numericId);
      byId[id] = {
        id: id,
        name_ar: String(p.name_ar || '').trim() || ('#' + id),
        code: p.code == null || p.code === '' ? null : String(p.code),
        per_unit: p.number_of_cartons_bags == null ? '' : String(p.number_of_cartons_bags)
      };
    });
    var products = Object.keys(byId).map(function (id) { return byId[id]; });
    products.sort(function (a, b) {
      return String(a.name_ar).localeCompare(String(b.name_ar), 'ar') ||
        (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
    });
    return { status: 'ok', schema_version: 1, products: products, count: products.length,
      complete: true, overflow: false, reason: null, catalog_ttl_ms: 600000 };
  }
  function getStockScanWarehouses_(data, user) {
    return dbStockScanWarehouses_(data || {}, user);
  }
  function getStockScanBalance_(data, user) {
    return dbStockScanBalance_(data || {}, user);
  }

  /** The scan page's independent history read. The normal revision list also
   * builds a full product reference list; these rows already carry name_ar,
   * so a scan history read needs only the stock_revision sheet. */
  function getStockScanHistory_(data, user, dbId) {
    var sheet = getSheet_(STOCK_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var lastRow = sheet.getLastRow();
    var minimumDate = '2026-09-01';
    var dateColumn = headers.indexOf('date');
    var rows = [];
    if (!headers.length || dateColumn < 0 || lastRow < 2) {
      return {
        status: 'success',
        data_json: JSON.stringify({ schema_version: 1, table: STOCK_SHEET, rows: rows, from_date: minimumDate }),
        loadedAll: true, total: 0, from_date: minimumDate
      };
    }
    function checkedDateKey(year, month, day) {
      var date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
      return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
    }
    function dateKey(value) {
      if (value instanceof Date && !isNaN(value.getTime())) {
        return value.getFullYear() + '-' + ('0' + (value.getMonth() + 1)).slice(-2) + '-' + ('0' + value.getDate()).slice(-2);
      }
      var raw = String(value == null ? '' : value).trim();
      var iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return checkedDateKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      var dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (dmy) return checkedDateKey(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
      return '';
    }
    /* The scan history table now consumes one complete JSON snapshot. Read the
       sheet once and let the browser table own search and pagination; a
       newest-20 server window makes universal search miss older counts. */
    var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      if (!values[i].some(function (v) { return String(v == null ? '' : v).trim() !== ''; })) continue;
      var rowDate = dateKey(values[i][dateColumn]);
      if (!rowDate || rowDate < minimumDate) continue;
      var record = {};
      headers.forEach(function (h, ci) { record[String(h).trim()] = values[i][ci] === undefined ? '' : values[i][ci]; });
      /* Keep the actual sheet row: filtered/reversed history indexes are not
         stable identities and cannot reconcile an optimistic save safely. */
      record._sheetRow = i + 2;
      record.product_name = String(record.name_ar || '').trim() || ('#' + record.product);
      rows.push(record);
    }
    return {
      status: 'success',
      data_json: JSON.stringify({ schema_version: 1, table: STOCK_SHEET, rows: rows, from_date: minimumDate }),
      loadedAll: true,
      total: rows.length,
      from_date: minimumDate
    };
  }

  /** Same semantics as the retired difference formula:
   *  =IF(ISBLANK(avail),"",IF(avail-amount=0,"مظبوط",avail>amount ? (avail-amount)+" عجز" : (avail-amount)+" زيادة")) */
  function stockRevisionDifference_(amount, avail) {
    if (avail === '' || avail === undefined || avail === null || isNaN(avail)) return '';
    var d = Math.round((Number(avail) - Number(amount)) * 100) / 100;
    if (d === 0) return 'مظبوط';
    return d + '  ' + (Number(avail) > Number(amount) ? 'عجز' : 'زيادة');
  }

  /** Same semantics as the retired percentage formula:
   *  =IFERROR(IF(ISBLANK(avail),"",IF(1-((amount-avail)/avail)>1, amount/avail, 1-((amount-avail)/avail))),"") */
  function stockRevisionPercentage_(amount, avail) {
    if (avail === '' || avail === undefined || avail === null || isNaN(avail) || Number(avail) === 0) return '';
    var v = 1 - ((Number(amount) - Number(avail)) / Number(avail));
    return v > 1 ? Number(amount) / Number(avail) : v;
  }

  function addStockRevision_(data, user, dbId) {
    const product = Number(data.product);
    if (!Number.isInteger(product) || product <= 0) throw new Error('المنتج مطلوب');
    if (!productRefs_(dbId).map[product]) throw new Error('المنتج غير موجود');
    const amountRaw = String(data.amount == null ? '' : data.amount).trim();
    if (amountRaw === '') throw new Error('الكمية مطلوبة');
    const amount = Number(amountRaw);
    if (isNaN(amount)) throw new Error('الكمية يجب أن تكون رقماً');
    const warehouse = String(data.warehouse || '').trim();
    if (warehouse === '') throw new Error('المخزن مطلوب');
    if (['1', '2', '3', '4', '5', 'شبرا'].indexOf(warehouse) === -1) throw new Error('المخزن غير صحيح');
    const availRaw = String(data.available_amount == null ? '' : data.available_amount).trim();
    if (availRaw === '') throw new Error('رصيد السيستم مطلوب');
    const avail = Number(availRaw);
    if (isNaN(avail)) throw new Error('رصيد السيستم يجب أن يكون رقماً');
    let date = data.date ? parseDate_(data.date) : new Date();
    if (!(date instanceof Date) || isNaN(date.getTime())) date = new Date();
    /* A date-only entry records WHEN the revision was taken, not midnight:
       two counts of the same product on one day must be distinguishable, and
       the cell is a real datetime in the sheet. A value that already carries a
       time is kept as written. */
    if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
      const now = new Date();
      date.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }
    const notes = String(data.notes || '').trim();

    const sheet = getSheet_(STOCK_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = headers.map(function (h) {
      const key = String(h).trim().toLowerCase();
      if (key === 'product') return product;
      if (key === 'date') return date;
      if (key === 'amount') return amount;
      if (key === 'warehouse') return warehouse;
      if (key === 'notes') return notes;
      if (key === 'available_amount') return avail;
      if (key === 'user') return (user && user.email) || '';
      if (key === 'created_at') return new Date();
      return ''; // formula columns start blank
    });
    // Phase 8 (F-04): appendRow + up to 5 setFormula -> one setValues. The loop
    // below is the original, unchanged in its conditions, its formula strings
    // and the column each one targets; the only difference is that it writes
    // into rowValues instead of issuing a setFormula per column.
    //
    // Unlike the other two converted sites in this file, this handler holds no
    // lock, and a precomputed target range — unlike appendRow — is not safe
    // against a concurrent append: two saves could otherwise compute the same
    // row and one would silently overwrite the other. The write therefore runs
    // inside executeWithLock_ (reentrant, so nesting is harmless), with the row
    // number computed inside it. ensureGridRows_ grows the grid the way
    // appendRow did implicitly.
    // fetch product name/category/unit BEFORE the lock, so the values (not
    // formulas) are ready to write in the same setValues call below.
    var prodMap = productRefs_(dbId).map;
    var nameArVal = prodMap[product] || '';
    var categoryVal = '';
    var unitVal = '';
    try {
      var prodRow = tcProductsRaw_(dbId).find(function(p){ return Number(p.id)===product; });
      if (prodRow) { nameArVal = String(prodRow.name_ar||'').trim(); categoryVal = String(prodRow.category||'').trim(); unitVal = String(prodRow.unit||'').trim(); }
    } catch(e){}
    var differenceVal = stockRevisionDifference_(amount, avail);
    var percentageVal = stockRevisionPercentage_(amount, avail);

    let rowNum;
    executeWithLock_(function () {
      rowNum = sheet.getLastRow() + 1;
      headers.forEach(function (h, i) {
        const key = String(h).trim().toLowerCase();
        // Computed once above, in JS, and written as a literal VALUE — not a
        // live Sheet formula. Each revision is a point-in-time snapshot: if a
        // product is renamed/recategorised later, past revisions keep showing
        // what was true when counted, which is the more correct behaviour for
        // an audit record. This also means the response below can carry the
        // real difference/percentage immediately, with no wait on a sheet
        // recalculation — which a live formula could never give the caller.
        if (key === 'name_ar') rowValues[i] = nameArVal;
        if (key === 'category') rowValues[i] = categoryVal;
        if (key === 'unit') rowValues[i] = unitVal;
        if (key === 'difference') rowValues[i] = differenceVal;
        if (key === 'percentage') rowValues[i] = percentageVal;
      });
      ensureGridRows_(sheet, rowNum);
      sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
      noteMutation_(sheet);
    });
    var savedRecord = {
      product: product,
      product_name: nameArVal || ('#' + product),
      name_ar: nameArVal,
      category: categoryVal,
      unit: unitVal,
      date: date,
      amount: amount,
      warehouse: warehouse,
      notes: notes,
      available_amount: avail,
      difference: differenceVal,
      percentage: percentageVal,
      user: (user && user.email) || '',
      created_at: new Date(),
      _sheetRow: rowNum
    };
    try { var _mapStock = { product: product, date: date, amount: amount, warehouse: warehouse, notes: notes, available_amount: avail, user: (user && user.email) || '', created_at: new Date() }; logHistory_(dbId, STOCK_SHEET, 'create_'+STOCK_SHEET+'_'+rowNum, String(rowNum), (user&&user.email)||'', 'create', _mapStock, null); } catch(e){}
    return { status: 'success', message: 'تمت إضافة جرد المخزون', record: savedRecord, data: { assignedId: rowNum, rowNumber: rowNum } };
  }

  /* Scan-specific save: warehouse IDs are validated against warehouse_locations
     (not the legacy hard-coded list shared with tc_stock_revision), and the
     balance is re-read authoritatively for the same product+warehouse pair at
     save time — the client's available_amount is never trusted. New rows
     persist the warehouse ID; legacy text values in old rows are untouched. */
  function addStockScan_(data, user, dbId) {
    data = data || {};
    var productRaw = String(data.product == null ? '' : data.product).trim();
    if (!/^[1-9]\d{0,19}$/.test(productRaw)) throw new Error('المنتج مطلوب');
    var product = Number(productRaw);
    if (!productRefs_(dbId).map[product]) throw new Error('المنتج غير موجود');
    var warehouseId = String(data.warehouse_id == null ? (data.warehouse == null ? '' : data.warehouse) : data.warehouse_id).trim();
    if (!/^[1-9]\d{0,19}$/.test(warehouseId)) throw new Error('المخزن مطلوب');
    var whList = dbStockScanWarehouses_({}, user);
    var warehouseLocation = null;
    (whList.warehouses || []).forEach(function (w) { if (String(w.value) === warehouseId) warehouseLocation = w.label; });
    if (warehouseLocation == null) throw new Error('المخزن غير صحيح');
    var amountRaw = String(data.amount == null ? '' : data.amount).trim();
    if (amountRaw === '') throw new Error('الكمية مطلوبة');
    var amount = Number(amountRaw);
    if (isNaN(amount)) throw new Error('الكمية يجب أن تكون رقماً');
    var balance = dbStockScanBalance_({ product_id: productRaw, warehouse_id: warehouseId, refresh: true }, user);
    if (!balance || balance.state !== 'ready' || !Number.isFinite(Number(balance.current_qty))) throw new Error('لا يمكن الحفظ بدون رصيد سيستم متاح لهذا الصنف والمخزن');
    var avail = Number(balance.current_qty);
    var date = data.date ? parseDate_(data.date) : new Date();
    if (!(date instanceof Date) || isNaN(date.getTime())) date = new Date();
    if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
      var nowScan = new Date();
      date.setHours(nowScan.getHours(), nowScan.getMinutes(), nowScan.getSeconds(), nowScan.getMilliseconds());
    }
    var notes = String(data.notes || '').trim();
    var sheet = getSheet_(STOCK_SHEET, dbId);
    var headers = getHeaders_(sheet);
    var rowValues = headers.map(function (h) {
      var key = String(h).trim().toLowerCase();
      if (key === 'product') return product;
      if (key === 'date') return date;
      if (key === 'amount') return amount;
      if (key === 'warehouse') return warehouseId;
      if (key === 'notes') return notes;
      if (key === 'available_amount') return avail;
      if (key === 'user') return (user && user.email) || '';
      if (key === 'created_at') return new Date();
      return '';
    });
    var prodMapScan = productRefs_(dbId).map;
    var nameArVal = prodMapScan[product] || '';
    var categoryVal = '';
    var unitVal = '';
    try {
      var prodRow = tcProductsRaw_(dbId).find(function (p) { return Number(p.id) === product; });
      if (prodRow) { nameArVal = String(prodRow.name_ar || '').trim(); categoryVal = String(prodRow.category || '').trim(); unitVal = String(prodRow.unit || '').trim(); }
    } catch (e) {}
    var differenceVal = stockRevisionDifference_(amount, avail);
    var percentageVal = stockRevisionPercentage_(amount, avail);
    var rowNum;
    executeWithLock_(function () {
      rowNum = sheet.getLastRow() + 1;
      headers.forEach(function (h, i) {
        var key = String(h).trim().toLowerCase();
        if (key === 'name_ar') rowValues[i] = nameArVal;
        if (key === 'category') rowValues[i] = categoryVal;
        if (key === 'unit') rowValues[i] = unitVal;
        if (key === 'difference') rowValues[i] = differenceVal;
        if (key === 'percentage') rowValues[i] = percentageVal;
      });
      ensureGridRows_(sheet, rowNum);
      sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
      noteMutation_(sheet);
    });
    var savedRecord = {
      product: product,
      product_name: nameArVal || ('#' + product),
      name_ar: nameArVal,
      category: categoryVal,
      unit: unitVal,
      date: date,
      amount: amount,
      warehouse: warehouseId,
      warehouse_location: warehouseLocation,
      notes: notes,
      available_amount: avail,
      difference: differenceVal,
      percentage: percentageVal,
      user: (user && user.email) || '',
      created_at: new Date(),
      _sheetRow: rowNum
    };
    try { var mapStock = { product: product, date: date, amount: amount, warehouse: warehouseId, notes: notes, available_amount: avail, user: (user && user.email) || '', created_at: new Date() }; logHistory_(dbId, STOCK_SHEET, 'create_' + STOCK_SHEET + '_' + rowNum, String(rowNum), (user && user.email) || '', 'create', mapStock, null); } catch (e) {}
    return { status: 'success', message: 'تمت إضافة جرد المخزون', record: savedRecord, data: { assignedId: rowNum, rowNumber: rowNum } };
  }

  function updateStockRevision_(data, user, dbId) {
    const sheetRow = Number(data._sheetRow);
    if (!Number.isFinite(sheetRow) || sheetRow < 2) throw new Error('معرف السطر مطلوب');
    const sheet = getSheet_(STOCK_SHEET, dbId);
    const lastRow = sheet.getLastRow();
    if (sheetRow > lastRow) throw new Error('السطر غير موجود');
    const headers = getHeaders_(sheet);
    const hMap = {};
    headers.forEach(function (h, i) { hMap[String(h).trim().toLowerCase()] = i; });
    const expectedProduct = data._expectedProduct != null ? Number(data._expectedProduct) : null;
    if (expectedProduct != null) {
      const productCol = hMap['product'];
      if (productCol != null) {
        const actualProduct = Number(sheet.getRange(sheetRow, productCol + 1).getValue());
        if (actualProduct !== expectedProduct) {
          throw new Error('السطر غير متطابق — يرجى إعادة تحميل الصفحة والمحاولة مرة أخرى');
        }
      }
    }

    const updates = {};
    if (data.date != null) updates.date = parseDate_(data.date) || new Date();
    if (data.amount != null) {
      const amt = Number(data.amount);
      if (isNaN(amt)) throw new Error('الكمية يجب أن تكون رقماً');
      updates.amount = amt;
    }
    if (data.warehouse != null) {
      const wh = String(data.warehouse).trim();
      if (['1', '2', '3', '4', '5', 'شبرا'].indexOf(wh) === -1) throw new Error('المخزن غير صحيح');
      updates.warehouse = wh;
    }
    if (data.notes != null) updates.notes = String(data.notes).trim();
    if (data.available_amount != null) {
      const av = Number(data.available_amount);
      if (isNaN(av)) throw new Error('رصيد السيستم يجب أن يكون رقماً');
      updates.available_amount = av;
    }

    var _oldStock = null; try { var _vals = sheet.getDataRange().getValues(); if(sheetRow>=1 && sheetRow<_vals.length+1){ var _hdrs = headers; _oldStock={}; _hdrs.forEach(function(h,i){ _oldStock[String(h).trim()]=_vals[sheetRow-1][i]; }); } } catch(e2){}
    Object.keys(updates).forEach(function (key) {
      const col = hMap[key];
      if (col != null) {
        sheet.getRange(sheetRow, col + 1).setValue(updates[key]);
        noteMutation_(sheet);
      }
    });
    /* Row-edit repair (5.1): recompute the derived snapshot literals when a
       corrected input changes them. Rows designed as literals get fresh
       values; older rows whose cells still hold live formulas are left alone
       so the sheet recalculates them. */
    if (updates.amount != null || updates.available_amount != null) {
      try {
        var _amtCol = hMap['amount'], _availCol = hMap['available_amount'];
        var _curAmt = (updates.amount != null) ? updates.amount : Number(sheet.getRange(sheetRow, _amtCol + 1).getValue());
        var _curAvl = (updates.available_amount != null) ? updates.available_amount : Number(sheet.getRange(sheetRow, _availCol + 1).getValue());
        var _diffVal = stockRevisionDifference_(_curAmt, _curAvl);
        var _pctVal = stockRevisionPercentage_(_curAmt, _curAvl);
        var _formRow = sheet.getRange(sheetRow, 1, 1, headers.length).getFormulas()[0];
        [['difference', _diffVal], ['percentage', _pctVal]].forEach(function (pair) {
          var _c = hMap[pair[0]];
          if (_c != null && !_formRow[_c]) {
            sheet.getRange(sheetRow, _c + 1).setValue(pair[1]);
            noteMutation_(sheet);
          }
        });
      } catch (e3) {}
    }
    try { var _uidStock = _oldStock && _oldStock.record_uid ? _oldStock.record_uid : 'create_'+STOCK_SHEET+'_'+sheetRow; var _newStock = {}; if(_oldStock) Object.keys(_oldStock).forEach(function(k){ _newStock[k]=_oldStock[k]; }); Object.keys(updates).forEach(function(k){ _newStock[k]=updates[k]; }); logHistory_(dbId, STOCK_SHEET, _uidStock, String(sheetRow), (user&&user.email)||'', 'update', _newStock, _oldStock); } catch(e){}

    return { status: 'success', message: 'تم تحديث جرد المخزون' };
  }

  // =========================================
  // مكتب الجمارك — existing live sheet KEEPS its 10 Arabic/English headers:
  // التاريخ | نوع المعاملة | سبب العملية | المبلغ | تفاصيل المعاملة |
  // تكليف المطالبة | تخليص الشحنة | المبلغ_دولار | user | created_at
  // The original ten business columns are retained; attachment references remain in the two business columns.
  // Attachment IDs and customs_uid are intentionally not part of this table API.
  // =========================================
  const CUSTOMS_HEADERS = [
    'التاريخ', 'نوع المعاملة', 'سبب العملية', 'المبلغ', 'تفاصيل المعاملة',
    'تكليف المطالبة', 'تخليص الشحنة', 'المبلغ_دولار', 'user', 'created_at'
  ];

  function ensureCustomsOfficeSheet_(dbId) {
    const ss = getSpreadsheet_(dbId);
    let sheet = ss.getSheetByName(CUSTOMS_OFFICE_SHEET);
    if (sheet) {
      return sheet;
    }
    sheet = ss.insertSheet(CUSTOMS_OFFICE_SHEET);
    noteMutation_(sheet);
    sheet.appendRow(CUSTOMS_HEADERS);
    noteMutation_(sheet);
    sheet.setFrozenRows(1);
    return sheet;
  }

  function customsSigned_(transactionType, amount) {
    const a = Number(amount) || 0;
    return String(transactionType).trim() === 'مدين' ? -a : a;
  }

  function getCustomsOffice_(data, user, dbId) {
    ensureCustomsOfficeSheet_(dbId);
    const rows = getAllRecords_(dbId, CUSTOMS_OFFICE_SHEET);

    // Phase 12 — slice before mapping. The two running totals were accumulated
    // INSIDE the map over every row and are reported from the full set (the old
    // comment below says so), so they move to their own pass in the same 0..n-1
    // order — same additions in the same sequence, so the same float result. `id`
    // was the map index, which ran before the reverse, so it is the index into the
    // unreversed array: idx + 1.
    let egpTotal = 0;
    let usdTotal = 0;
    rows.forEach(function (r) {
      const egp = Number(r['المبلغ']) || 0;
      const usd = Number(r['المبلغ_دولار']) || 0;
      const sgn = String(r['نوع المعاملة']).trim() === 'مدين' ? -1 : 1;
      egpTotal += egp * sgn;
      usdTotal += usd * sgn;
    });
    var order = [];
    for (var i = rows.length - 1; i >= 0; i--) order.push(i);
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) order = order.slice(0, limit);
    var transactions = order.map(function (idx) {
      const r = rows[idx];
      const egp = Number(r['المبلغ']) || 0;
      const usd = Number(r['المبلغ_دولار']) || 0;
      return {
        id: idx + 1,
        user_email: r['user'],
        transaction_date: r['التاريخ'],
        transaction_type: r['نوع المعاملة'],
        operation_reason: r['سبب العملية'],
        amount_egp: egp,
        amount_usd: usd,
        transaction_details: r['تفاصيل المعاملة'],
        claim_assignment: r['تكليف المطالبة'],
        shipment_clearance: r['تخليص الشحنة'],
        created_at: r['created_at']
      };
    });
    // summary computed from FULL before slice
    return {
      status: 'success',
      transactions: transactions,
      summary: {
        egp_total: Number(egpTotal.toFixed(2)),
        usd_total: Number(usdTotal.toFixed(2))
      }
    };
  }

  function addCustomsOffice_(data, user, dbId) {
    const d = data || {};
    const mode = String(d.mode || 'egp').trim().toLowerCase();

    const dateVal = d.transaction_date ? parseDate_(d.transaction_date) : new Date();
    if (isNaN(dateVal.getTime())) throw new Error('تاريخ المعاملة غير صحيح');

    const type = String(d.transaction_type || '').trim();
    if (type !== 'مدين' && type !== 'دائن') throw new Error('نوع المعاملة مطلوب (مدين / دائن)');

    const reason = String(d.operation_reason || '').trim();
    if (!reason) throw new Error('سبب العملية مطلوب');

    const egpRaw = String(d.amount_egp == null ? '' : d.amount_egp).trim();
    const usdRaw = String(d.amount_usd == null ? '' : d.amount_usd).trim();

    let egp = 0;
    let usd = 0;
    if (mode === 'usd') {
      if (usdRaw === '') throw new Error('المبلغ بالدولار مطلوب');
      usd = Number(usdRaw);
      if (isNaN(usd) || usd < 0) throw new Error('المبلغ بالدولار يجب أن يكون رقماً موجباً');
    } else {
      if (egpRaw === '') throw new Error('المبلغ بالجنيه مطلوب');
      egp = Number(egpRaw);
      if (isNaN(egp) || egp < 0) throw new Error('المبلغ بالجنيه يجب أن يكون رقماً موجباً');
    }

    const claimAssignment = String(d.claim_assignment || '').trim();
    const shipmentClearance = String(d.shipment_clearance || '').trim();

    const details = String(d.transaction_details || '').trim();

    return executeWithLock_(function () {
      const sheet = ensureCustomsOfficeSheet_(dbId);
      const rowValues = [
        dateVal,
        type,
        reason,
        egp,
        details,
        claimAssignment,
        shipmentClearance,
        usd,
        (user && user.email) || '',
        new Date(),
      ];
      sheet.appendRow(rowValues);
      noteMutation_(sheet);
      const rowNumber = sheet.getLastRow();
      var savedRecord = {
        id: rowNumber - 1,
        user_email: (user && user.email) || '',
        transaction_date: dateVal,
        transaction_type: type,
        operation_reason: reason,
        amount_egp: egp,
        amount_usd: usd,
        transaction_details: details,
        claim_assignment: claimAssignment,
        shipment_clearance: shipmentClearance,
        created_at: new Date()
      };
      return { status: 'success', message: 'تمت إضافة المعاملة', record: savedRecord, data: { assignedId: rowNumber - 1, rowNumber: rowNumber } };
    });
  }

  // =========================================
  // توريدات ومشتريات (top_chemical_purchase_items)
  // vendor/item store the 16-char UUID; display names are joined from the
  // top_chemical_vendors / top_chemical_items tables.
  // =========================================
  function vendorRefs_(dbId) {
    const map = {};
    const options = getAllRecords_(dbId, VENDORS_SHEET).map(function (v) {
      const vid = String(v.vendor_id || '').trim();
      if (!vid) return null;
      const name = String(v.vendor_name_ar || '').trim() || ('#' + vid);
      map[vid] = name;
      return { value: vid, label: name };
    }).filter(Boolean).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    return { map: map, options: options };
  }

  function itemRefs_(dbId) {
    const map = {};
    const options = getAllRecords_(dbId, ITEMS_SHEET).map(function (it) {
      const iid = String(it.item_id || '').trim();
      if (!iid) return null;
      const name = String(it.item_name_ar || '').trim() || ('#' + iid);
      map[iid] = name;
      return { value: iid, label: name };
    }).filter(Boolean).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    return { map: map, options: options };
  }

  /**
   * Phase 7.1 — the id -> name maps are what the LIST needs; the sorted option
   * lists are what the FORM needs. vendorRefs_/itemRefs_ build both together, and
   * the Arabic-collated localeCompare sort over every vendor and every item is
   * the expensive half of that. These are the map half, extracted verbatim
   * (same trim, same '#'+id fallback, same last-one-wins on a duplicate id), so
   * a caller that only reads `.map` can skip the sort entirely.
   */
  function vendorNameMap_(dbId) {
    const map = {};
    getAllRecords_(dbId, VENDORS_SHEET).forEach(function (v) {
      const vid = String(v.vendor_id || '').trim();
      if (!vid) return;
      map[vid] = String(v.vendor_name_ar || '').trim() || ('#' + vid);
    });
    return map;
  }

  function itemNameMap_(dbId) {
    const map = {};
    getAllRecords_(dbId, ITEMS_SHEET).forEach(function (it) {
      const iid = String(it.item_id || '').trim();
      if (!iid) return;
      map[iid] = String(it.item_name_ar || '').trim() || ('#' + iid);
    });
    return map;
  }

  /**
   * Phase 7.1 — this endpoint had the same shape Phase 2 fixed on the TopLight
   * screens, and was missed there: it expanded EVERY purchase row ever into a
   * derived object, reversed the whole array, and only then sliced to 10.
   *
   * Order is now computed on an index array first, so `reverse().slice(0, limit)`
   * keeps its exact semantics (including a negative or fractional limit) while
   * only the visible rows are mapped. The form's option lists moved to
   * get_purchase_options, fetched when the form opens; pass withOptions:true for
   * the old combined response.
   */
  function getPurchaseItems_(data, user, dbId) {
    const vendorNames = vendorNameMap_(dbId);
    const itemNames = itemNameMap_(dbId);
    const raw = getAllRecords_(dbId, PURCHASE_SHEET);
    var limit = Number(data && data.limit) || 20;

    var order = [];
    for (var i = raw.length - 1; i >= 0; i--) order.push(i);
    if (!data || !data.loadAll) order = order.slice(0, limit);

    var rows = order.map(function (idx) {
      const r = raw[idx];
      const vid = String(r.vendor || '').trim();
      const iid = String(r.item || '').trim();
      return {
        unique_id: r.unique_id,
        id: r.id,
        vendor: vid,
        vendor_name: vendorNames[vid] || '',
        invoice_no: r.invoice_no,
        invoice_date: r.invoice_date,
        item: iid,
        item_name: itemNames[iid] || '',
        item_brand: r.item_brand,
        qty: r.qty,
        price: r.price,
        receipt_date: r.receipt_date,
        user: r.user,
        created_at: r.created_at
      };
    });
    const out = { status: 'success', purchases: rows };
    if (data && data.withOptions) {
      out.vendor_options = vendorRefs_(dbId).options;
      out.item_options = itemRefs_(dbId).options;
    }
    return out;
  }

  /** Phase 7.1 — the form's dropdown data, fetched when the form actually opens. */
  function getPurchaseOptions_(data, user, dbId) {
    return {
      status: 'success',
      vendor_options: vendorRefs_(dbId).options,
      item_options: itemRefs_(dbId).options
    };
  }

  function addPurchaseItem_(data, user, dbId) {
    const vendor = String(data.vendor || '').trim();
    if (!vendor) throw new Error('المورد مطلوب');
    if (!vendorNameMap_(dbId)[vendor]) throw new Error('المورد غير موجود');
    const item = String(data.item || '').trim();
    if (!item) throw new Error('الصنف مطلوب');
    if (!itemNameMap_(dbId)[item]) throw new Error('الصنف غير موجود');
    const invoiceNo = String(data.invoice_no || '').trim();
    if (!invoiceNo) throw new Error('رقم الفاتورة مطلوب');
    const brand = String(data.item_brand || '').trim();
    if (!brand) throw new Error('البراند مطلوب');
    const qtyRaw = String(data.qty == null ? '' : data.qty).trim();
    if (qtyRaw === '') throw new Error('الكمية مطلوبة');
    const qty = Number(qtyRaw);
    if (isNaN(qty) || qty < 0) throw new Error('الكمية يجب أن تكون رقماً موجباً');
    const priceRaw = String(data.price == null ? '' : data.price).trim();
    if (priceRaw === '') throw new Error('سعر الوحدة مطلوب');
    const price = Number(priceRaw);
    if (isNaN(price) || price < 0) throw new Error('سعر الوحدة يجب أن يكون رقماً موجباً');
    const invoiceDate = data.invoice_date ? parseDate_(data.invoice_date) : new Date();
    const receiptDate = data.receipt_date ? parseDate_(data.receipt_date) : new Date();

    return executeWithLock_(function () {
      /* Phase 6 — Valley parity: honor the caller's request_key/unique_id so
       * a replay converges on one row; otherwise mint exactly as before.
       * Guard runs before id allocation so a replay burns no counter value. */
      const _reqKeyPI = String(data.request_key || data.unique_id || '').trim();
      if (_reqKeyPI) {
        var _seenPI = null;
        try { _seenPI = requestDedupeExecute_(dbId, PURCHASE_SHEET, _reqKeyPI, _reqKeyPI); } catch (eGuardPI) { _seenPI = null; }
        if (_seenPI) return liveDedupeReply_(_seenPI, 'تمت إضافة التوريد');
      }
      const id = getNextIdUnderLock_(dbId, PURCHASE_SHEET);
      const sheet = getSheet_(PURCHASE_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const rec = {
        unique_id: _reqKeyPI || uid16_(),
        id: id,
        vendor: vendor,
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        item: item,
        item_brand: brand,
        qty: qty,
        price: price,
        receipt_date: receiptDate,
        user: (user && user.email) || '',
        created_at: new Date()
      };
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      const rowNum = sheet.getLastRow() + 1;
      sheet.appendRow(rowValues);
      noteMutation_(sheet);
      try { logHistory_(dbId, PURCHASE_SHEET, rec.record_uid || ('create_'+PURCHASE_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
      var vendorsMap = vendorNameMap_(dbId);
      var itemsMap = itemNameMap_(dbId);
      var savedRecord = {
        unique_id: rec.unique_id,
        id: rec.id,
        vendor: rec.vendor,
        vendor_name: vendorsMap[rec.vendor] || '',
        invoice_no: rec.invoice_no,
        invoice_date: rec.invoice_date,
        item: rec.item,
        item_name: itemsMap[rec.item] || '',
        item_brand: rec.item_brand,
        qty: rec.qty,
        price: rec.price,
        receipt_date: rec.receipt_date,
        user: rec.user,
        created_at: rec.created_at
      };
      return { status: 'success', message: 'تمت إضافة التوريد', record: savedRecord, data: { assignedId: id, uniqueId: rec.unique_id, rowNumber: rowNum } };
    });
  }

  function addVendor_(data, user, dbId) {
    const nameAr = String(data.vendor_name_ar || '').trim();
    if (!nameAr) throw new Error('اسم المورد مطلوب');
    const rec = {
      vendor_id: uid16_(),
      vendor_name_ar: nameAr,
      vendor_name_en: String(data.vendor_name_en || '').trim(),
      vendor_address: String(data.vendor_address || '').trim(),
      vendor_vat: String(data.vendor_vat || '').trim(),
      'vendor_1%_status': String(data.vendor_1_percent_status || '').trim(),
      contact_person: String(data.contact_person || '').trim(),
      contact_number: String(data.contact_number || '').trim(),
      contact_email: String(data.contact_email || '').trim(),
      'vat_1% certificate': String(data.vat_1_percent_certificate || '').trim(),
      user: (user && user.email) || '',
      created_at: new Date()
    };
    appendRow_(dbId, VENDORS_SHEET, rec);
    try { logHistory_(dbId, VENDORS_SHEET, rec.record_uid || ('create_'+VENDORS_SHEET+'_'+rec.vendor_id), String(rec.vendor_id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    return { status: 'success', message: 'تمت إضافة المورد', vendor: { value: rec.vendor_id, label: nameAr }, record: { vendor_id: rec.vendor_id, vendor_name_ar: nameAr, vendor_name_en: rec.vendor_name_en }, data: { assignedId: rec.vendor_id } };
  }

  function addItem_(data, user, dbId) {
    const nameAr = String(data.item_name_ar || '').trim();
    if (!nameAr) throw new Error('اسم الصنف مطلوب');
    const rec = {
      item_id: uid16_(),
      item_name_ar: nameAr,
      item_name_en: String(data.item_name_en || '').trim(),
      item_technical_details: String(data.item_technical_details || '').trim(),
      category_id: String(data.category_id || '').trim(),
      unit_type: String(data.unit_type || '').trim(),
      user: (user && user.email) || '',
      created_at: new Date()
    };
    appendRow_(dbId, ITEMS_SHEET, rec);
    try { logHistory_(dbId, ITEMS_SHEET, rec.record_uid || ('create_'+ITEMS_SHEET+'_'+rec.item_id), String(rec.item_id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    return { status: 'success', message: 'تمت إضافة الصنف', item: { value: rec.item_id, label: nameAr }, record: { item_id: rec.item_id, item_name_ar: nameAr, item_name_en: rec.item_name_en }, data: { assignedId: rec.item_id } };
  }

  // =========================================
  // متابعة موافقات الاستيراد (legal_importation_follow)
  // vendor stores the vendor NAME (from legal_customer_vendor.name), product
  // stores products.id. Files/photos are uploaded AppSheet-style (two folders:
  // <table>_Files_ for docs, <table>_Images for photos) with names
  // <id>.<field>.<HHMMSS>.<ext>. approval_expiry_date = approval_date + 180.
  // =========================================
  function customerVendorOptions_(dbId) {
    return tcRefs_(dbId, 'tc_legal_parties_opts', function(){
      return getAllRecords_(dbId, CUSTOMER_VENDOR_SHEET).map(function (v) {
        const name = String(v.name || '').trim();
        return name ? { value: name, label: name } : null;
      }).filter(Boolean).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    });
  }

  function getImportFollow_(data, user, dbId) {
    const products = productRefs_(dbId);
    // Phase 12 — same transformation as 7.1: order is computed on an index array
    // first, so reverse().slice(0, limit) keeps its exact semantics while only the
    // visible rows are mapped. Keeping the slice on the index array is the point:
    // a counted loop would not reproduce a negative, fractional, string or NaN limit.
    var raw = getAllRecords_(dbId, IMPORT_FOLLOW_SHEET);
    var order = [];
    for (var i = raw.length - 1; i >= 0; i--) order.push(i);
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) order = order.slice(0, limit);
    var rows = order.map(function (idx) {
      var r = raw[idx];
      return {
        id: r.id,
        vendor: r.vendor,
        product: r.product,
        product_name: products.map[Number(r.product)] || ('#' + r.product),
        approval_sent_date: r.approval_sent_date,
        proforma_invoice_code: r.proforma_invoice_code,
        acid: r.acid,
        proforma_invoice_date: r.proforma_invoice_date,
        invoice_value: r.invoice_value,
        product_amount: r.product_amount,
        porforma_file: r.porforma_file,
        swift_file: r.swift_file,
        bank: r.bank,
        approval_number: r.approval_number,
        approval_date: r.approval_date,
        approval_expiry_date: r.approval_expiry_date,
        approval_1: r.approval_1,
        approval_2: r.approval_2,
        approval_3: r.approval_3,
        status: r.status,
        user: r.user,
        created_at: r.created_at
      };
    });
    return { status: 'success', follows: rows, vendor_options: customerVendorOptions_(dbId), product_options: products.options };
  }

  function addImportFollow_(data, user, dbId) {
    attachmentIdsForFields_(dbId, IMPORT_FOLLOW_SHEET, data || {}, ['porforma_file', 'swift_file', 'approval_1', 'approval_2', 'approval_3']);
    const vendor = String(data.vendor || '').trim();
    if (!vendor) throw new Error('المورد مطلوب');
    const product = Number(data.product);
    if (!Number.isInteger(product) || product <= 0) throw new Error('المنتج مطلوب');
    if (!productRefs_(dbId).map[product]) throw new Error('المنتج غير موجود');
    const proformaCode = String(data.proforma_invoice_code || '').trim();
    if (!proformaCode) throw new Error('كود الفاتورة المبدئية مطلوب');
    const invoiceValueRaw = String(data.invoice_value == null ? '' : data.invoice_value).trim();
    if (invoiceValueRaw === '') throw new Error('قيمة الفاتورة مطلوبة');
    const invoiceValue = Number(invoiceValueRaw);
    if (isNaN(invoiceValue)) throw new Error('قيمة الفاتورة يجب أن تكون رقماً');
    const productAmountRaw = String(data.product_amount == null ? '' : data.product_amount).trim();
    if (productAmountRaw === '') throw new Error('كمية المنتج مطلوبة');
    const productAmount = Number(productAmountRaw);
    if (isNaN(productAmount)) throw new Error('كمية المنتج يجب أن تكون رقماً');
    const acidRaw = String(data.acid == null ? '' : data.acid).trim();
    if (acidRaw !== '' && !/^\d+$/.test(acidRaw)) throw new Error('رقم ACID يجب أن يكون رقماً صحيحاً');
    const approvalNumberRaw = String(data.approval_number == null ? '' : data.approval_number).trim();
    let approvalNumber = '';
    if (approvalNumberRaw !== '') {
      approvalNumber = Number(approvalNumberRaw);
      if (!Number.isInteger(approvalNumber)) throw new Error('رقم الموافقة يجب أن يكون رقماً صحيحاً');
    }
    const sentDate = data.approval_sent_date ? parseDate_(data.approval_sent_date) : new Date();
    const proformaDate = data.proforma_invoice_date ? parseDate_(data.proforma_invoice_date) : new Date();
    const approvalDate = data.approval_date ? parseDate_(data.approval_date) : '';

    return executeWithLock_(function () {
      const id = getNextIdUnderLock_(dbId, IMPORT_FOLLOW_SHEET);
      var _impFileIds = attachmentIdsForFields_(dbId, IMPORT_FOLLOW_SHEET, data || {}, ['porforma_file', 'swift_file', 'approval_1', 'approval_2', 'approval_3']);
      const sheet = getSheet_(IMPORT_FOLLOW_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const rec = {
        id: id,
        vendor: vendor,
        product: product,
        approval_sent_date: sentDate,
        proforma_invoice_code: proformaCode,
        acid: acidRaw,
        proforma_invoice_date: proformaDate,
        invoice_value: invoiceValue,
        product_amount: productAmount,
        porforma_file: String(data.porforma_file || '').trim(),
        swift_file: String(data.swift_file || '').trim(),
        bank: String(data.bank || '').trim(),
        approval_number: approvalNumber,
        approval_date: approvalDate,
        approval_1: String(data.approval_1 || '').trim(),
        approval_2: String(data.approval_2 || '').trim(),
        approval_3: String(data.approval_3 || '').trim(),
        status: 'Approve',
        user: (user && user.email) || '',
        created_at: new Date()
      };
      try { Object.keys(_impFileIds).forEach(function (k) { rec[k] = _impFileIds[k]; rec[String(k).toLowerCase()] = _impFileIds[k]; }); } catch (e) {}
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      // Phase 8 (F-04): appendRow + setFormula -> one setValues. Same loop, same
      // condition, same formula string, same target column — only the
      // destination changes. Already inside executeWithLock_, so the precomputed
      // row is safe and identical to appendRow's.
      const rowNum = sheet.getLastRow() + 1;
      headers.forEach(function (h, i) {
        const key = String(h).trim().toLowerCase();
        if (key === 'approval_expiry_date') {
          const dateIdx = headers.findIndex(function (hh) {
            return String(hh).trim().toLowerCase() === 'approval_date';
          });
          const ref = colLetter_(dateIdx === -1 ? i : dateIdx) + rowNum;
          rowValues[i] = '=IF(ISBLANK(' + ref + '),"",' + ref + '+180)';
        }
      });
      ensureGridRows_(sheet, rowNum);
      sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
      noteMutation_(sheet);
      try { logHistory_(dbId, IMPORT_FOLLOW_SHEET, rec.record_uid || ('create_'+IMPORT_FOLLOW_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
      var pMapImp = productRefs_(dbId).map;
      var savedRecord = {
        id: rec.id,
        vendor: rec.vendor,
        product: rec.product,
        product_name: pMapImp[Number(rec.product)] || ('#' + rec.product),
        approval_sent_date: rec.approval_sent_date,
        proforma_invoice_code: rec.proforma_invoice_code,
        acid: rec.acid,
        proforma_invoice_date: rec.proforma_invoice_date,
        invoice_value: rec.invoice_value,
        product_amount: rec.product_amount,
        porforma_file: rec.porforma_file,
        swift_file: rec.swift_file,
        bank: rec.bank,
        approval_number: rec.approval_number,
        approval_date: rec.approval_date,
        approval_expiry_date: rec.approval_date ? new Date(new Date(rec.approval_date).getTime() + 180*24*60*60*1000) : '',
        approval_1: rec.approval_1,
        approval_2: rec.approval_2,
        approval_3: rec.approval_3,
        status: rec.status,
        user: rec.user,
        created_at: rec.created_at
      };
      return { status: 'success', message: 'تمت إضافة المتابعة', record: savedRecord, data: { assignedId: id, rowNumber: rowNum } };
    });
  }

  /** Update only the file-reference cells of an import-follow row (after upload). */
  function addImportFollowFiles_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id)) throw new Error('id مطلوب');
    const updates = {};
    ['porforma_file', 'swift_file', 'approval_1', 'approval_2', 'approval_3'].forEach(function (f) {
      if (data[f] !== undefined && data[f] !== null) updates[f] = String(data[f]).trim();
    });
    if (!Object.keys(updates).length) throw new Error('لا توجد ملفات للتحديث');
    var _impFIds = attachmentIdsForFields_(dbId, IMPORT_FOLLOW_SHEET, data || {}, ['porforma_file', 'swift_file', 'approval_1', 'approval_2', 'approval_3']);
    Object.keys(_impFIds).forEach(function (k) { updates[k] = _impFIds[k]; });
    var _oldImpFiles = null; try { _oldImpFiles = getAllRecords_(dbId, IMPORT_FOLLOW_SHEET).find(function(r){ return String(r.id)===String(id); }) || null; } catch(e2){}
    const sheet = getSheet_(IMPORT_FOLLOW_SHEET, dbId);
    if (!patchRowByCriteria_(sheet, 'id', id, updates)) throw new Error('السجل غير موجود');
    try { var _uidImpF = _oldImpFiles && _oldImpFiles.record_uid ? _oldImpFiles.record_uid : 'create_'+IMPORT_FOLLOW_SHEET+'_'+id; var _newImpF = {}; if(_oldImpFiles) Object.keys(_oldImpFiles).forEach(function(k){ _newImpF[k]=_oldImpFiles[k]; }); Object.keys(updates).forEach(function(k){ _newImpF[k]=updates[k]; }); logHistory_(dbId, IMPORT_FOLLOW_SHEET, _uidImpF, String(id), (user&&user.email)||'', 'update', _newImpF, _oldImpFiles); } catch(e){}
    return { status: 'success', message: 'تم تحديث الملفات' };
  }

  /** Advance an import-follow record's status: '' -> Approve -> Imported -> Received. */
  function updateImportFollowStatus_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id)) throw new Error('id مطلوب');
    const sheet = getSheet_(IMPORT_FOLLOW_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'id'; });
    const statusIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'status'; });
    if (idIdx === -1 || statusIdx === -1) throw new Error('جدول متابعة الاستيراد غير جاهز');
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idIdx]).trim() === String(id)) {
        const current = String(values[i][statusIdx] == null ? '' : values[i][statusIdx]).trim();
        const next = current === 'Approve' ? 'Imported' : (current === 'Imported' ? 'Received' : (current === '' ? 'Approve' : ''));
        if (!next) throw new Error('السجل في الحالة النهائية');
        var _oldImpSt = null; try { _oldImpSt = getAllRecords_(dbId, IMPORT_FOLLOW_SHEET).find(function(r){ return String(r.id)===String(id); }) || null; } catch(e2){}
        sheet.getRange(i + 1, statusIdx + 1).setValue(next);
        noteMutation_(sheet);
        try { var _uidImpSt = _oldImpSt && _oldImpSt.record_uid ? _oldImpSt.record_uid : 'create_'+IMPORT_FOLLOW_SHEET+'_'+id; var _newImpSt = {}; if(_oldImpSt) Object.keys(_oldImpSt).forEach(function(k){ _newImpSt[k]=_oldImpSt[k]; }); _newImpSt['status']=next; logHistory_(dbId, IMPORT_FOLLOW_SHEET, _uidImpSt, String(id), (user&&user.email)||'', 'update', _newImpSt, _oldImpSt); } catch(e){}
        // Phase 7.3 — this object used to carry `status` TWICE: 'success' and
        // then the new status, so the later key won and the response's `status`
        // was 'Approve'/'Imported'/'Received'. Nothing read it, and API.call
        // only rejects on status === 'error', so it never broke — but it is one
        // renamed status away from a successful save being reported as a
        // failure. The new status now has its own field, which is also what the
        // page's local row patch reads.
        return { status: 'success', message: 'تم النقل إلى الحالة: ' + next, new_status: next };
      }
    }
    throw new Error('السجل غير موجود');
  }

  // =========================================
  // مقاسات الكراتين والعبوات (purchasing_support_data)
  // id: autoincrement. product: ref products.id. common_vendor: ref
  // clients_vendors.id (stored as number, displayed as name_ar). type: free
  // enum (existing distinct values offered, new values allowed). length/width/
  // height: mandatory decimals. other_details: mandatory text. document: Drive
  // upload stored as "<Folder>/<filename>" (two-step save like import follow).
  // =========================================
  function getCartonSizes_(data, user, dbId) {
    const products = productRefs_(dbId);
    const vendors = clientVendorRefs_(dbId);
    // Phase 12 — slice before mapping. typeSet was accumulated INSIDE the map, over
    // every row, and type_options is built from it — so it moves to its own pass in
    // the same 0..n-1 order. Object key insertion order is therefore identical, and
    // Array.prototype.sort is stable, so type_options is unchanged.
    var raw = getAllRecords_(dbId, CARTON_SIZES_SHEET);
    const typeSet = {};
    raw.forEach(function (r) {
      const t = String(r.type || '').trim();
      if (t) typeSet[t] = true;
    });
    var order = [];
    for (var i = raw.length - 1; i >= 0; i--) order.push(i);
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) order = order.slice(0, limit);
    var rows = order.map(function (idx) {
      var r = raw[idx];
      return {
        id: r.id,
        product: r.product,
        product_name: products.map[Number(r.product)] || ('#' + r.product),
        common_vendor: r.common_vendor,
        vendor_name: vendors.map[Number(r.common_vendor)] || ('#' + r.common_vendor),
        type: r.type,
        length: r.length,
        width: r.width,
        height: r.height,
        other_details: r.other_details,
        document: r.document,
        user: r.user,
        created_at: r.created_at
      };
    });
    const typeOptions = Object.keys(typeSet).map(function (t) {
      return { value: t, label: t };
    }).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    return {
      status: 'success',
      sizes: rows,
      product_options: products.options,
      vendor_options: vendors.options,
      type_options: typeOptions
    };
  }

  function addCartonSize_(data, user, dbId) {
    attachmentIdsForFields_(dbId, CARTON_SIZES_SHEET, data || {}, ['document']);
    const product = Number(data.product);
    if (!Number.isInteger(product) || product <= 0) throw new Error('المنتج مطلوب');
    if (!productRefs_(dbId).map[product]) throw new Error('المنتج غير موجود');
    const vendor = Number(data.common_vendor);
    if (!Number.isInteger(vendor) || vendor <= 0) throw new Error('المورد المشترك مطلوب');
    if (!clientVendorRefs_(dbId).map[vendor]) throw new Error('المورد المشترك غير موجود');
    const type = String(data.type || '').trim();
    if (!type) throw new Error('النوع مطلوب');
    const dims = {};
    ['length', 'width', 'height'].forEach(function (k) {
      const raw = String(data[k] == null ? '' : data[k]).trim();
      if (raw === '') throw new Error((k === 'length' ? 'الطول' : k === 'width' ? 'العرض' : 'الارتفاع') + ' مطلوب');
      const v = Number(raw);
      if (!isFinite(v)) throw new Error((k === 'length' ? 'الطول' : k === 'width' ? 'العرض' : 'الارتفاع') + ' يجب أن يكون رقماً');
      dims[k] = v;
    });
    const otherDetails = String(data.other_details || '').trim();
    if (!otherDetails) throw new Error('تفاصيل أخرى مطلوبة');

    return executeWithLock_(function () {
      const id = getNextIdUnderLock_(dbId, CARTON_SIZES_SHEET);
      var _csFileIds = attachmentIdsForFields_(dbId, CARTON_SIZES_SHEET, data || {}, ['document']);
      const sheet = getSheet_(CARTON_SIZES_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const rec = {
        id: id,
        product: product,
        common_vendor: vendor,
        type: type,
        length: dims.length,
        width: dims.width,
        height: dims.height,
        other_details: otherDetails,
        document: String(data.document || '').trim(),
        user: (user && user.email) || '',
        created_at: new Date()
      };
      try { Object.keys(_csFileIds).forEach(function (k) { rec[k] = _csFileIds[k]; rec[String(k).toLowerCase()] = _csFileIds[k]; }); } catch (e) {}
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      sheet.appendRow(rowValues);
      noteMutation_(sheet);
      try { logHistory_(dbId, CARTON_SIZES_SHEET, rec.record_uid || ('create_'+CARTON_SIZES_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
      var pMapC = productRefs_(dbId).map;
      var vMapC = clientVendorRefs_(dbId).map;
      var savedRecord = {
        id: rec.id,
        product: rec.product,
        product_name: pMapC[Number(rec.product)] || ('#' + rec.product),
        common_vendor: rec.common_vendor,
        vendor_name: vMapC[Number(rec.common_vendor)] || ('#' + rec.common_vendor),
        type: rec.type,
        length: rec.length,
        width: rec.width,
        height: rec.height,
        other_details: rec.other_details,
        document: rec.document,
        user: rec.user,
        created_at: rec.created_at
      };
      return { status: 'success', message: 'تمت إضافة المقاس', record: savedRecord, data: { assignedId: id } };
    });
  }

  /** Update only the document cell of a carton-size row (after upload). */
  function addCartonSizeFiles_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id)) throw new Error('id مطلوب');
    const updates = {};
    if (data.document !== undefined && data.document !== null) updates['document'] = String(data.document).trim();
    if (!Object.keys(updates).length) throw new Error('لا توجد ملفات للتحديث');
    var _csFIds = attachmentIdsForFields_(dbId, CARTON_SIZES_SHEET, data || {}, ['document']);
    Object.keys(_csFIds).forEach(function (k) { updates[k] = _csFIds[k]; });
    var _oldCarton = null; try { _oldCarton = getAllRecords_(dbId, CARTON_SIZES_SHEET).find(function(r){ return String(r.id)===String(id); }) || null; } catch(e2){}
    const sheet = getSheet_(CARTON_SIZES_SHEET, dbId);
    if (!patchRowByCriteria_(sheet, 'id', id, updates)) throw new Error('السجل غير موجود');
    try { var _uidCarton = _oldCarton && _oldCarton.record_uid ? _oldCarton.record_uid : 'create_'+CARTON_SIZES_SHEET+'_'+id; var _newCarton = {}; if(_oldCarton) Object.keys(_oldCarton).forEach(function(k){ _newCarton[k]=_oldCarton[k]; }); Object.keys(updates).forEach(function(k){ _newCarton[k]=updates[k]; }); logHistory_(dbId, CARTON_SIZES_SHEET, _uidCarton, String(id), (user&&user.email)||'', 'update', _newCarton, _oldCarton); } catch(e){}
    return { status: 'success', message: 'تم تحديث المستند' };
  }

  // =========================================
  // شئون العاملين — تسجيل الموظفين (employee_info)
  // إدخال المستخدم: الاسم، الرقم القومي، تاريخ التعيين، المسمى الوظيفي،
  // التصنيف، التأمين. باقي الأعمدة معادلات حية مطابقة لأعمدة الجدول.
  // =========================================
  function getEmployees_(data, user, dbId) {
    const statusMap = getCurrentEmployeeStatusMap_(dbId);
    const rows = getAllRecords_(dbId, EMPLOYEE_SHEET).map(function (r) {
      const eid = Number(r.emp_id);
      return {
        emp_id: r.emp_id, name_ar: r.name_ar, main_salary: r.main_salary,
        allow: r.allow, national_id: r.national_id, hiring_date: r.hiring_date,
        title: r.title, section: r.section, category: r.category,
        insurance: hrBool_(r.insurance),
        status: statusMap[eid] || DEFAULT_EMPLOYEE_STATUS_,
        basic_salary: r.basic_salary,
        emp_id_1: r.emp_id_1
      };
    }).reverse();
    const titleOpts = titleOptions_(dbId);
    Logger.log('[getEmployees_] title_options count=' + titleOpts.length);
    return {
      status: 'success',
      employees: rows,
      title_options: titleOpts,
      category_options: hrOptions_(HR_CATEGORIES),
      _debug_title: { optionCount: titleOpts.length, first3: titleOpts.slice(0, 3) }
    };
  }

  function addEmployee_(data, user, dbId) {
    const nameAr = String(data.name_ar || '').trim();
    if (!nameAr) throw new Error('اسم الموظف مطلوب');
    const nationalId = String(data.national_id == null ? '' : data.national_id).trim();
    if (!nationalId || Number(nationalId) <= 20000000000000) throw new Error('الرقم القومي مطلوب (14 رقم)');
    const hiringDate = parseDate_(data.hiring_date);
    if (!(hiringDate instanceof Date) || isNaN(hiringDate.getTime())) throw new Error('تاريخ التعيين مطلوب');
    const title = String(data.title || '').trim();
    if (!title) throw new Error('المسمى الوظيفي مطلوب');
    const category = String(data.category || '').trim();
    if (!category) throw new Error('التصنيف مطلوب');
    const insurance = hrBool_(data.insurance);

    return executeWithLock_(function () {
      let maxId = 0;
      getAllRecords_(dbId, EMPLOYEE_SHEET).forEach(function (r) {
        const n = Number(r.emp_id);
        if (Number.isInteger(n) && n > maxId) maxId = n;
      });
      const empId = maxId + 1;
      const sheet = getSheet_(EMPLOYEE_SHEET, dbId);
      const rowNumber = sheet.getLastRow() + 1;
      appendHrRow_(dbId, EMPLOYEE_SHEET, {
        emp_id: empId,
        name_ar: nameAr,
        main_salary: '=INDEX(employee_salary_updated!D:D,MATCH(A' + rowNumber + ',employee_salary_updated!A:A,0))',
        allow: '=INDEX(employee_salary_updated!E:E,MATCH(A' + rowNumber + ',employee_salary_updated!A:A,0))',
        national_id: nationalId,
        hiring_date: hiringDate,
        title: title,
        section: '=INDEX(title_index!H:H,MATCH(G' + rowNumber + ',title_index!B:B,0))',
        category: category,
        insurance: insurance,
        'الحالة الوظيفية': '=VLOOKUP(A' + rowNumber + ',employee_status_updated!$A:$C,3,0)',
        basic_salary: '=INDEX(employee_salary_updated!F:F,MATCH(A' + rowNumber + ',employee_salary_updated!A:A,0))',
        emp_id_1: '=A' + rowNumber
      });
      var sec = '';
      try { var tt = titleOptions_(dbId).find(function(x){ return String(x.value)===String(title); }); if(tt) sec=tt.section; } catch(e){}
      var savedRecEmp = {
        emp_id: empId,
        name_ar: nameAr,
        main_salary: 0,
        allow: 0,
        national_id: nationalId,
        hiring_date: hiringDate,
        title: title,
        section: sec,
        category: category,
        insurance: !!insurance,
        status: 'يعمل بالشركة',
        basic_salary: 0,
        emp_id_1: empId
      };
      return { status: 'success', message: 'تم تسجيل الموظف', record: savedRecEmp, data: { assignedId: empId } };
    });
  }

  function editEmployee_(data, user, dbId) {
    const empId = hrRequireEmployee_(dbId, data.emp_id);
    const nameAr = String(data.name_ar || '').trim();
    if (!nameAr) throw new Error('اسم الموظف مطلوب');
    const nationalId = String(data.national_id == null ? '' : data.national_id).trim();
    if (!nationalId || Number(nationalId) <= 20000000000000) throw new Error('الرقم القومي مطلوب (14 رقم)');
    const hiringDate = parseDate_(data.hiring_date);
    if (!(hiringDate instanceof Date) || isNaN(hiringDate.getTime())) throw new Error('تاريخ التعيين مطلوب');
    const title = String(data.title || '').trim();
    if (!title) throw new Error('المسمى الوظيفي مطلوب');
    const category = String(data.category || '').trim();
    if (!category) throw new Error('التصنيف مطلوب');
    const insurance = hrBool_(data.insurance);

    return executeWithLock_(function () {
      const rows = getAllRecords_(dbId, EMPLOYEE_SHEET);
      const current = rows.find(function (r) { return String(r.emp_id) === String(empId); });
      if (!current) throw new Error('الموظف غير موجود');
      const sheet = getSheet_(EMPLOYEE_SHEET, dbId);
      const updates = {
        name_ar: nameAr,
        national_id: nationalId,
        hiring_date: hiringDate,
        title: title,
        category: category,
        insurance: insurance
      };
      if (!patchRowByCriteria_(sheet, 'emp_id', empId, updates)) throw new Error('الموظف غير موجود');
      var section = String(current.section || '');
      try {
        var titleRef = titleOptions_(dbId).find(function (x) { return String(x.value) === String(title); });
        if (titleRef) section = String(titleRef.section || '');
      } catch (e) {}
      var statusMap = getCurrentEmployeeStatusMap_(dbId);
      var savedRecord = {
        emp_id: empId,
        name_ar: nameAr,
        main_salary: current.main_salary,
        allow: current.allow,
        national_id: nationalId,
        hiring_date: hiringDate,
        title: title,
        section: section,
        category: category,
        insurance: insurance,
        status: statusMap[empId] || DEFAULT_EMPLOYEE_STATUS_,
        basic_salary: current.basic_salary,
        emp_id_1: current.emp_id_1 || empId
      };
      try {
        var auditRecord = Object.assign({}, current, updates, { section: section });
        logHistory_(dbId, EMPLOYEE_SHEET, 'employee_info_' + empId, String(empId),
          (user && user.email) || '', 'update', auditRecord, current);
      } catch (e2) {}
      return { status: 'success', message: 'تم تعديل بيانات الموظف', record: savedRecord };
    });
  }

  // =========================================
  // شئون العاملين — حالة الموظف (employee_status)
  // =========================================
  function getEmployeeStatus_(data, user, dbId) {
    const names = employeeRefs_(dbId).map;
    const rawRows = getAllRecords_(dbId, EMP_STATUS_SHEET);
    let rows = rawRows.map(function (r) {
      let empCode = '';
      let statusType = '';
      let statusDate = '';
      let empName = '';
      for (const k in r) {
        const norm = String(k).trim().toLowerCase().replace(/_/g, ' ');
        if (norm === 'employee code' || norm === 'emp id' || norm === 'كود الموظف' || norm === 'كود_الموظف' || norm === 'code') {
          empCode = r[k];
        } else if (norm === 'status type' || norm === 'نوع الحالة' || norm === 'الحالة' || norm === 'status' || norm === 'نوع_الحالة') {
          statusType = r[k];
        } else if (norm === 'status date' || norm === 'تاريخ الحالة' || norm === 'التاريخ' || norm === 'date' || norm === 'تاريخ_الحالة') {
          statusDate = r[k];
        } else if (norm === 'employee name' || norm === 'اسم الموظف' || norm === 'الاسم' || norm === 'name') {
          empName = r[k];
        }
      }
      if (!empCode && r.employee_code !== undefined) empCode = r.employee_code;
      if (!statusType && r.status_type !== undefined) statusType = r.status_type;
      if (!statusDate && r.status_date !== undefined) statusDate = r.status_date;
      if (!empName && r.employee_name !== undefined) empName = r.employee_name;

      const eid = Number(empCode);
      return {
        employee_code: empCode,
        employee_name: (Number.isInteger(eid) && names[eid]) ? names[eid] : (empName || '-'),
        status_type: statusType,
        status_date: statusDate
      };
    }).filter(function (r) {
      return (r.employee_code !== '' && r.employee_code != null) || (r.status_type !== '' && r.status_type != null);
    }).reverse();
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return {
      status: 'success',
      rows: rows,
      employee_options: hrEmployeeOptions_(dbId),
      status_options: hrOptions_(HR_STATUS_TYPES)
    };
  }

  function addEmployeeStatus_(data, user, dbId) {
    const empId = hrRequireEmployee_(dbId, data.employee_code);
    const statusType = String(data.status_type || '').trim();
    if (HR_STATUS_TYPES.indexOf(statusType) === -1) throw new Error('نوع الحالة مطلوب');
    const statusDate = parseDate_(data.status_date);
    if (!(statusDate instanceof Date) || isNaN(statusDate.getTime())) throw new Error('تاريخ الحالة مطلوب');
    return executeWithLock_(function () {
      const sheet = getSheet_(EMP_STATUS_SHEET, dbId);
      const rowNumber = sheet.getLastRow() + 1;
      appendHrRow_(dbId, EMP_STATUS_SHEET, {
        employee_code: empId,
        'employee_code': empId,
        'employee code': empId,
        'كود الموظف': empId,
        status_type: statusType,
        'status_type': statusType,
        'status type': statusType,
        'نوع الحالة': statusType,
        status_date: statusDate,
        'status_date': statusDate,
        'status date': statusDate,
        'تاريخ الحالة': statusDate,
        employee_name: '=VLOOKUP(A' + rowNumber + ',employee_info!A:B,2,0)',
        'اسم الموظف': '=VLOOKUP(A' + rowNumber + ',employee_info!A:B,2,0)'
      });
      try { var _mapSt = { employee_code: empId, status_type: statusType, status_date: statusDate }; logHistory_(dbId, EMP_STATUS_SHEET, 'create_'+EMP_STATUS_SHEET+'_'+empId+'_'+Date.now(), String(empId), (user&&user.email)||'', 'create', _mapSt, null); } catch(e){}
      var eMapSt = employeeRefs_(dbId).map;
      var savedRecord = {
        employee_code: empId,
        employee_name: eMapSt[empId] || ('#' + empId),
        status_type: statusType,
        status_date: statusDate
      };
      return { status: 'success', message: 'تم تسجيل حالة الموظف', record: savedRecord, data: { assignedId: empId } };
    });
  }

  // =========================================
  // شئون العاملين — راتب الموظف (employee_salary)
  // =========================================
  function getEmployeeSalary_(data, user, dbId) {
    const names = employeeRefs_(dbId).map;
    var rows = getAllRecords_(dbId, EMP_SALARY_SHEET).slice(-300).reverse().map(function (r) {
      return {
        id: r.id, salary_date: r.salary_date, emp_id: r.emp_id,
        name_ar: names[Number(r.emp_id)] || r.name_ar,
        main_salary: r.main_salary, allow: r.allow, basic_salary: r.basic_salary,
        user: r.user, created_at: r.created_at
      };
    });
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return {
      status: 'success',
      rows: rows,
      employee_options: hrEmployeeOptions_(dbId)
    };
  }

  function addEmployeeSalary_(data, user, dbId) {
    const empId = hrRequireEmployee_(dbId, data.emp_id);
    const salaryDate = parseDate_(data.salary_date);
    if (!(salaryDate instanceof Date) || isNaN(salaryDate.getTime())) throw new Error('تاريخ الراتب مطلوب');
    const mainSalary = Number(data.main_salary);
    if (isNaN(mainSalary) || mainSalary < 0) throw new Error('الراتب الأساسي مطلوب');
    const allow = Number(data.allow);
    if (isNaN(allow) || allow < 0) throw new Error('البدلات مطلوبة');
    const basicSalary = Number(data.basic_salary);
    if (isNaN(basicSalary) || basicSalary < 0) throw new Error('الأساسي مطلوب');
    return executeWithLock_(function () {
      const id = getNextIdUnderLock_(dbId, EMP_SALARY_SHEET);
      const sheet = getSheet_(EMP_SALARY_SHEET, dbId);
      const rowNumber = sheet.getLastRow() + 1;
      appendHrRow_(dbId, EMP_SALARY_SHEET, {
        id: id,
        salary_date: salaryDate,
        emp_id: empId,
        name_ar: '=INDEX(employee_info!B:B,MATCH(C' + rowNumber + ',employee_info!A:A,0))',
        main_salary: mainSalary,
        allow: allow,
        basic_salary: basicSalary,
        user: (user && user.email) || '',
        created_at: new Date(),
        updated_at: new Date()
      });
      try { var _mapSal = { id: id, salary_date: salaryDate, emp_id: empId, main_salary: mainSalary, allow: allow, basic_salary: basicSalary }; logHistory_(dbId, EMP_SALARY_SHEET, 'create_'+EMP_SALARY_SHEET+'_'+id, String(id), (user&&user.email)||'', 'create', _mapSal, null); } catch(e){}
      var eMapSa = employeeRefs_(dbId).map;
      var savedRecord = {
        id: id,
        salary_date: salaryDate,
        emp_id: empId,
        name_ar: eMapSa[empId] || ('#' + empId),
        main_salary: mainSalary,
        allow: allow,
        basic_salary: basicSalary,
        user: (user && user.email) || '',
        created_at: new Date()
      };
      return { status: 'success', message: 'تم تسجيل الراتب', record: savedRecord, data: { assignedId: id } };
    });
  }

  // =========================================
  // شئون العاملين — الغياب والخصومات (emp_deductions)
  // =========================================
  function getEmpDeductions_(data, user, dbId) {
    const names = employeeRefs_(dbId).map;
    var rows = getAllRecords_(dbId, EMP_DEDUCTIONS_SHEET).slice(-300).reverse().map(function (r) {
      return {
        emp_id: r.emp_id, name_ar: names[Number(r.emp_id)] || r.name_ar,
        deduction_type: r.deduction_type, date: r.date, number_of_days: r.number_of_days,
        penalty_value: r.penalty_value, deduction_value_other: r.deduction_value_other,
        details: r.details, user: r.user, created_at: r.created_at
      };
    });
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return {
      status: 'success',
      rows: rows,
      employee_options: hrEmployeeOptions_(dbId),
      deduction_options: hrOptions_(HR_DEDUCTION_TYPES)
    };
  }

  function addEmpDeduction_(data, user, dbId) {
    const empId = hrRequireEmployee_(dbId, data.emp_id);
    const type = String(data.deduction_type || '').trim();
    if (HR_DEDUCTION_TYPES.indexOf(type) === -1) throw new Error('نوع الخصم مطلوب');
    const date = parseDate_(data.date);
    if (!(date instanceof Date) || isNaN(date.getTime())) throw new Error('التاريخ مطلوب');
    const daysRaw = String(data.number_of_days == null ? '' : data.number_of_days).trim();
    const days = daysRaw === '' ? 0 : Number(daysRaw);
    if (isNaN(days) || days < 0) throw new Error('عدد الأيام غير صحيح');
    if ((type === 'غياب' || type === 'جزاء') && days <= 0) throw new Error('عدد الأيام مطلوب لهذا النوع');
    const other = Number(data.deduction_value_other) || 0;
    if (other < 0) throw new Error('قيمة الخصم غير صحيحة');
    if (type === 'سلف' && other <= 0) throw new Error('قيمة الخصم مطلوبة لهذا النوع');
    const details = String(data.details || '').trim();
    return executeWithLock_(function () {
      const sheet = getSheet_(EMP_DEDUCTIONS_SHEET, dbId);
      const rowNumber = sheet.getLastRow() + 1;
      appendHrRow_(dbId, EMP_DEDUCTIONS_SHEET, {
        emp_id: empId,
        name_ar: '=VLOOKUP(A' + rowNumber + ',employee_info!A:B,2,0)',
        deduction_type: type,
        date: date,
        number_of_days: days,
        penalty_value: '=IF(C' + rowNumber + '="جزاء",VLOOKUP(B' + rowNumber + ',employee_info!B:C,2,0)/30*E' + rowNumber + ',0)',
        deduction_value_other: other,
        details: details,
        month: '=MONTH(D' + rowNumber + ')',
        year: '=YEAR(D' + rowNumber + ')',
        user: (user && user.email) || '',
        created_at: new Date()
      });
      var eMapDed = employeeRefs_(dbId).map;
      var savedRecord = {
        emp_id: empId,
        name_ar: eMapDed[empId] || ('#' + empId),
        deduction_type: type,
        date: date,
        number_of_days: days,
        penalty_value: 0,
        deduction_value_other: other,
        details: details,
        user: (user && user.email) || '',
        created_at: new Date()
      };
      return { status: 'success', message: 'تم تسجيل الخصم', record: savedRecord, data: { assignedId: empId } };
    });
  }

  // =========================================
  // شئون العاملين — الأذونات والتأخيرات (emp_permits)
  // =========================================
  function getEmpPermits_(data, user, dbId) {
    const names = employeeRefs_(dbId).map;
    var rows = getAllRecords_(dbId, EMP_PERMITS_SHEET).slice(-300).reverse().map(function (r) {
      return {
        emp_id: r.emp_id, name_ar: names[Number(r.emp_id)] || r.name_ar,
        permit_type: r.permit_type, permit_date: r.permit_date,
        start_time: r.start_time, end_time: r.end_time, total_minutes: r.total_minutes
      };
    });
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return {
      status: 'success',
      rows: rows,
      employee_options: hrEmployeeOptions_(dbId),
      permit_options: hrOptions_(HR_PERMIT_TYPES)
    };
  }

  function addEmpPermit_(data, user, dbId) {
    const empId = hrRequireEmployee_(dbId, data.emp_id);
    const type = String(data.permit_type || '').trim();
    if (HR_PERMIT_TYPES.indexOf(type) === -1) throw new Error('نوع الإذن مطلوب');
    const date = parseDate_(data.permit_date);
    if (!(date instanceof Date) || isNaN(date.getTime())) throw new Error('تاريخ الإذن مطلوب');
    const start = timeFrac_(data.start_time);
    const end = timeFrac_(data.end_time);
    if (start === '') throw new Error('وقت البداية مطلوب');
    if (end === '') throw new Error('وقت النهاية مطلوب');
    return executeWithLock_(function () {
      const sheet = getSheet_(EMP_PERMITS_SHEET, dbId);
      const rowNumber = sheet.getLastRow() + 1;
      appendHrRow_(dbId, EMP_PERMITS_SHEET, {
        emp_id: empId,
        name_ar: '=VLOOKUP(A' + rowNumber + ',employee_info!A:B,2,0)',
        permit_type: type,
        permit_date: date,
        start_time: start,
        end_time: end,
        total_minutes: '=IF(F' + rowNumber + '>E' + rowNumber + ',(F' + rowNumber + '-E' + rowNumber + ')*24,((F' + rowNumber + '-E' + rowNumber + ')*24)+24)*60',
        permit_month: '=MONTH(D' + rowNumber + ')',
        permit_year: '=YEAR(D' + rowNumber + ')'
      });
      try { var _mapPerm = { emp_id: empId, permit_type: type, permit_date: date, start_time: start, end_time: end }; logHistory_(dbId, EMP_PERMITS_SHEET, 'create_'+EMP_PERMITS_SHEET+'_'+empId+'_'+Date.now(), String(empId), (user&&user.email)||'', 'create', _mapPerm, null); } catch(e){}
      var eMapPerm = employeeRefs_(dbId).map;
      var savedRecord = {
        emp_id: empId,
        name_ar: eMapPerm[empId] || ('#' + empId),
        permit_type: type,
        permit_date: date,
        start_time: start,
        end_time: end,
        total_minutes: 0
      };
      return { status: 'success', message: 'تم تسجيل الإذن', record: savedRecord, data: { assignedId: empId } };
    });
  }

  // =========================================
  // شئون العاملين — العمل الإضافي (emp_overtime)
  // =========================================
  function getEmpOvertime_(data, user, dbId) {
    const names = employeeRefs_(dbId).map;
    var rows = getAllRecords_(dbId, EMP_OVERTIME_SHEET).slice(-300).reverse().map(function (r) {
      return {
        emp_id: r.emp_id, name_ar: names[Number(r.emp_id)] || r.name_ar,
        date: r.date, start_time: r.start_time, end_time: r.end_time, details: r.details,
        total_time: r.total_time, approved: hrBool_(r.approved), overtime_type: r.overtime_type,
        amount: r.amount, approved_amount: r.approved_amount,
        user: r.user, created_at: r.created_at
      };
    });
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return {
      status: 'success',
      rows: rows,
      employee_options: hrEmployeeOptions_(dbId),
      overtime_options: hrOptions_(HR_OVERTIME_TYPES)
    };
  }

  function addEmpOvertime_(data, user, dbId) {
    const empId = hrRequireEmployee_(dbId, data.emp_id);
    const date = parseDate_(data.date);
    if (!(date instanceof Date) || isNaN(date.getTime())) throw new Error('التاريخ مطلوب');
    const type = String(data.overtime_type || '').trim();
    if (HR_OVERTIME_TYPES.indexOf(type) === -1) throw new Error('نوع العمل الإضافي مطلوب');
    const start = type === 'عمل اضافي' ? timeFrac_(data.start_time) : '';
    const end = type === 'عمل اضافي' ? timeFrac_(data.end_time) : '';
    if (type === 'عمل اضافي' && start === '') throw new Error('وقت البداية مطلوب');
    if (type === 'عمل اضافي' && end === '') throw new Error('وقت النهاية مطلوب');
    const amount = Number(data.amount) || 0;
    if (amount < 0) throw new Error('المبلغ غير صحيح');
    if (type !== 'عمل اضافي' && amount <= 0) throw new Error('المبلغ مطلوب لهذا النوع');
    const approved = hrBool_(data.approved);
    const details = String(data.details || '').trim();
    if (!details) throw new Error('التفاصيل مطلوبة');
    return executeWithLock_(function () {
      const sheet = getSheet_(EMP_OVERTIME_SHEET, dbId);
      const rowNumber = sheet.getLastRow() + 1;
      appendHrRow_(dbId, EMP_OVERTIME_SHEET, {
        emp_id: empId,
        name_ar: '=VLOOKUP(A' + rowNumber + ',employee_info!A:B,2,0)',
        date: date,
        start_time: start,
        end_time: end,
        details: details,
        total_time: '=if(H' + rowNumber + '=TRUE , IF(I' + rowNumber + '="عمل اضافي",IF(E' + rowNumber + '>D' + rowNumber + ',(E' + rowNumber + '-D' + rowNumber + ')*24,((E' + rowNumber + '-D' + rowNumber + ')*24)+24),0),0)',
        approved: approved,
        overtime_type: type,
        amount: type === 'عمل اضافي' ? 0 : amount,
        approved_amount: '=IF(AND(H' + rowNumber + '=TRUE,I' + rowNumber + '<>"عمل اضافي"),J' + rowNumber + ',0)',
        month: '=MONTH(C' + rowNumber + ')',
        year: '=YEAR(C' + rowNumber + ')',
        user: (user && user.email) || '',
        created_at: new Date()
      });
      try { var _mapOt = { emp_id: empId, date: date, start_time: start, end_time: end, details: details, approved: approved, overtime_type: type, amount: type === 'عمل اضافي' ? 0 : amount }; logHistory_(dbId, EMP_OVERTIME_SHEET, 'create_'+EMP_OVERTIME_SHEET+'_'+empId+'_'+Date.now(), String(empId), (user&&user.email)||'', 'create', _mapOt, null); } catch(e){}
      var eMapOt = employeeRefs_(dbId).map;
      var savedRecord = {
        emp_id: empId,
        name_ar: eMapOt[empId] || ('#' + empId),
        date: date,
        start_time: start,
        end_time: end,
        details: details,
        total_time: 0,
        approved: approved,
        overtime_type: type,
        amount: type === 'عمل اضافي' ? 0 : amount,
        approved_amount: type !== 'عمل اضافي' && approved ? amount : 0,
        user: (user && user.email) || '',
        created_at: new Date()
      };
      return { status: 'success', message: 'تم تسجيل العمل الإضافي', record: savedRecord, data: { assignedId: empId } };
    });
  }

  // =========================================
  // شئون العاملين — صرف المرتبات الشهرية (emp_salaries)
  // التوليد يكتب صفاً لكل موظف مع نسخ معادلات الجدول كما هي
  // (المقسوم عليه للأيام = 30 يوم عمل).
  // =========================================
  function getEmpSalaries_(data, user, dbId) {
    const month = Number(data.month);
    const year = Number(data.year);
    const hasFilter = Number.isInteger(month) && Number.isInteger(year);
    const all = getAllRecords_(dbId, EMP_SALARIES_SHEET);
    const monthsSet = {};
    all.forEach(function (r) {
      const m = Number(r.month); const y = Number(r.year);
      if (Number.isInteger(m) && Number.isInteger(y)) monthsSet[y + '-' + m] = { year: y, month: m };
    });
    let list = all;
    if (hasFilter) {
      list = all.filter(function (r) { return Number(r.month) === month && Number(r.year) === year; });
    }
    var rows = list.slice(-300).sort(function (a, b) { return Number(a.emp_id) - Number(b.emp_id); }).map(function (r) {
      return {
        emp_id: r.emp_id, name_ar: r.name_ar, basic_salary: r.basic_salary,
        allow: r.allow, section: r.section, working_days: r.working_days,
        working_days_value: r.working_days_value, deduction_day: r.deduction_day,
        overtime_days: r.overtime_days, loans_other_deductions: r.loans_other_deductions,
        delay_deductions: r.delay_deductions, other_addition: r.other_addition,
        overtime_days_value: r.overtime_days_value, deduction_day_value: r.deduction_day_value,
        net_salary: r.net_salary, net_salary_nearest: r.net_salary_nearest,
        month_name: r.month_name, internal_section: r.internal_section,
        section_type: r.section_type, year: r.year, month: r.month,
        salary_date: r.salary_date, user: r.user, created_at: r.created_at, receipt: !!r.receipt
      };
    });
    var _fullTotal = rows.reduce(function (s, r) { return s + (Number(r.net_salary) || 0); }, 0);
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);

    const closedMap = {};
    getAllRecords_(dbId, EMP_SALARIES_CLOSE_SHEET).forEach(function (r) {
      const m = Number(r.month); const y = Number(r.year);
      if (Number.isInteger(m) && Number.isInteger(y)) closedMap[y + '-' + m] = true;
    });

    const activeEmployees = [];
    const statusMap = getCurrentEmployeeStatusMap_(dbId);
    getAllRecords_(dbId, EMPLOYEE_SHEET).forEach(function (e) {
      const eid = Number(e.emp_id);
      if (!Number.isInteger(eid)) return;
      const st = statusMap[eid] || DEFAULT_EMPLOYEE_STATUS_;
      if (st !== 'يعمل بالشركة') return;

      let hiringDateStr = '';
      let hiringDay = null;
      let hiringMonth = null;
      let hiringYear = null;

      if (e.hiring_date) {
        const d = parseDate_(e.hiring_date);
        if (d instanceof Date && !isNaN(d.getTime())) {
          hiringDay = d.getDate();
          hiringMonth = d.getMonth() + 1;
          hiringYear = d.getFullYear();
          hiringDateStr = hiringYear + '-' + (hiringMonth < 10 ? '0' + hiringMonth : hiringMonth) + '-' + (hiringDay < 10 ? '0' + hiringDay : hiringDay);
        }
      }

      activeEmployees.push({
        emp_id: eid,
        name_ar: String(e.name_ar || '').trim() || ('#' + eid),
        hiring_date: hiringDateStr,
        hiring_day: hiringDay,
        hiring_month: hiringMonth,
        hiring_year: hiringYear
      });
    });

    return {
      status: 'success',
      salaries: rows,
      total: _fullTotal,
      existing_emp_ids: rows.map(function (r) { return Number(r.emp_id); }),
      months: Object.keys(monthsSet).sort().reverse().map(function (k) { return monthsSet[k]; }),
      month_options: HR_MONTHS,
      employee_options: hrWorkingEmployeeOptions_(dbId),
      closed_months: closedMap,
      active_employees: activeEmployees
    };
  }

  function getEmpSalaryComparison_(data, user, dbId) {
    const month = Number(data && data.month);
    const year = Number(data && data.year);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(year) || year < 2000) throw new Error('السنة مطلوبة');

    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    const currentMap = {};
    const previousMap = {};
    getAllRecords_(dbId, EMP_SALARIES_SHEET).forEach(function (r) {
      const empId = String(r.emp_id == null ? '' : r.emp_id).trim();
      if (!empId) return;
      const rowMonth = Number(r.month);
      const rowYear = Number(r.year);
      if (rowMonth === month && rowYear === year) currentMap[empId] = r;
      if (rowMonth === previousMonth && rowYear === previousYear) previousMap[empId] = r;
    });

    const employeeNames = employeeRefs_(dbId).map;
    const ids = {};
    Object.keys(currentMap).forEach(function (id) { ids[id] = true; });
    Object.keys(previousMap).forEach(function (id) { ids[id] = true; });

    function amount_(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }

    function rounded_(value) {
      return Math.round(amount_(value) * 100) / 100;
    }

    function metrics_(row) {
      if (!row) return {
        salary: 0, total_deductions: 0, total_overtime: 0,
        basic_salary: 0, allow: 0, working_days: 0, working_days_value: 0,
        deduction_day_value: 0, loans_other_deductions: 0, delay_deductions: 0,
        overtime_days: 0, overtime_days_value: 0, other_addition: 0,
        rounding_adjustment: 0
      };
      const net = amount_(row.net_salary);
      const salary = row.net_salary_nearest !== '' && row.net_salary_nearest != null
        ? amount_(row.net_salary_nearest) : net;
      return {
        salary: rounded_(salary),
        total_deductions: rounded_(amount_(row.loans_other_deductions) + amount_(row.delay_deductions) + amount_(row.deduction_day_value)),
        total_overtime: rounded_(amount_(row.overtime_days_value) + amount_(row.other_addition)),
        basic_salary: rounded_(row.basic_salary),
        allow: rounded_(row.allow),
        working_days: rounded_(row.working_days),
        working_days_value: rounded_(row.working_days_value),
        deduction_day_value: rounded_(row.deduction_day_value),
        loans_other_deductions: rounded_(row.loans_other_deductions),
        delay_deductions: rounded_(row.delay_deductions),
        overtime_days: rounded_(row.overtime_days),
        overtime_days_value: rounded_(row.overtime_days_value),
        other_addition: rounded_(row.other_addition),
        rounding_adjustment: rounded_(salary - net)
      };
    }

    function amountText_(value) {
      return Math.abs(rounded_(value)).toFixed(2);
    }

    function changeText_(label, current, previous) {
      const difference = rounded_(current - previous);
      if (Math.abs(difference) < 0.005) return '';
      return (difference > 0 ? 'زيادة ' : 'انخفاض ') + label + ' بمقدار ' + amountText_(difference);
    }

    function justification_(currentRow, previousRow, current, previous) {
      if (!previousRow) return 'لا توجد بيانات للشهر السابق؛ الموظف جديد في الكشف أو لم يتم توليد راتبه سابقاً.';
      if (!currentRow) return 'لا توجد بيانات للموظف في الشهر المختار، بينما كان له راتب في الشهر السابق.';
      const parts = [];
      if (Math.abs(current.basic_salary - previous.basic_salary) >= 0.005) {
        parts.push('تغير الراتب الأساسي من ' + amountText_(previous.basic_salary) + ' إلى ' + amountText_(current.basic_salary));
      }
      if (Math.abs(current.allow - previous.allow) >= 0.005) {
        parts.push('تغير البدلات من ' + amountText_(previous.allow) + ' إلى ' + amountText_(current.allow));
      }
      if (Math.abs(current.working_days - previous.working_days) >= 0.005) {
        parts.push('تغيرت أيام العمل من ' + amountText_(previous.working_days) + ' إلى ' + amountText_(current.working_days));
      }
      if (Math.abs(current.overtime_days - previous.overtime_days) >= 0.005) {
        parts.push('تغيرت أيام الإضافي من ' + amountText_(previous.overtime_days) + ' إلى ' + amountText_(current.overtime_days));
      }
      [
        ['قيمة أيام العمل', current.working_days_value, previous.working_days_value],
        ['قيمة العمل الإضافي', current.overtime_days_value, previous.overtime_days_value],
        ['الإضافات الأخرى', current.other_addition, previous.other_addition],
        ['خصم الغياب', current.deduction_day_value, previous.deduction_day_value],
        ['خصومات السلف والجزاء والخصومات الأخرى', current.loans_other_deductions, previous.loans_other_deductions],
        ['خصم التأخير', current.delay_deductions, previous.delay_deductions],
        ['فرق التقريب', current.rounding_adjustment, previous.rounding_adjustment]
      ].forEach(function (item) {
        const text = changeText_(item[0], item[1], item[2]);
        if (text) parts.push(text);
      });
      return parts.length ? parts.join('؛ ') + '.' : 'لا يوجد تغيير في مكونات الراتب.';
    }

    const rows = Object.keys(ids).sort(function (a, b) {
      const na = Number(a); const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    }).map(function (empId) {
      const currentRow = currentMap[empId] || null;
      const previousRow = previousMap[empId] || null;
      const current = metrics_(currentRow);
      const previous = metrics_(previousRow);
      const name = (currentRow && currentRow.name_ar) || (previousRow && previousRow.name_ar) || employeeNames[Number(empId)] || ('#' + empId);
      return {
        emp_id: empId,
        name_ar: name,
        has_current: !!currentRow,
        has_previous: !!previousRow,
        current: current,
        previous: previous,
        difference: {
          salary: rounded_(current.salary - previous.salary),
          total_deductions: rounded_(current.total_deductions - previous.total_deductions),
          total_overtime: rounded_(current.total_overtime - previous.total_overtime)
        },
        justification: justification_(currentRow, previousRow, current, previous)
      };
    });

    function totals_(key) {
      return rows.reduce(function (total, row) {
        total.salary += row[key].salary;
        total.total_deductions += row[key].total_deductions;
        total.total_overtime += row[key].total_overtime;
        return total;
      }, { salary: 0, total_deductions: 0, total_overtime: 0 });
    }

    function monthLabel_(value) {
      const found = HR_MONTHS.find(function (m) { return Number(m.value) === Number(value); });
      return found ? found.label : String(value);
    }

    const currentTotals = totals_('current');
    const previousTotals = totals_('previous');
    return {
      status: 'success',
      selected_period: { month: month, year: year, label: monthLabel_(month) + ' ' + year },
      previous_period: { month: previousMonth, year: previousYear, label: monthLabel_(previousMonth) + ' ' + previousYear },
      rows: rows,
      summary: {
        current: currentTotals,
        previous: previousTotals,
        difference: {
          salary: rounded_(currentTotals.salary - previousTotals.salary),
          total_deductions: rounded_(currentTotals.total_deductions - previousTotals.total_deductions),
          total_overtime: rounded_(currentTotals.total_overtime - previousTotals.total_overtime)
        }
      }
    };
  }

  function addEmpSalaries_(data, user, dbId) {
    const month = Number(data.month);
    const year = Number(data.year);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(year) || year < 2000) throw new Error('السنة مطلوبة');
    const entries = (data.entries || []).filter(function (e) { return e && e.emp_id; });
    if (!entries.length) throw new Error('لا توجد موظفين للإضافة');
    const empMap = employeeRefs_(dbId).map;
    entries.forEach(function (e) {
      const id = Number(e.emp_id);
      if (!Number.isInteger(id) || !empMap[id]) throw new Error('موظف غير صالح في القائمة');
      const wd = Number(e.working_days);
      if (isNaN(wd) || wd < 0) throw new Error('أيام العمل غير صحيحة');
    });
    return executeWithLock_(function () {
      var existingEmpIds = new Set();
      getAllRecords_(dbId, EMP_SALARIES_SHEET).forEach(function (r) {
        if (Number(r.month) === month && Number(r.year) === year) {
          existingEmpIds.add(Number(r.emp_id));
        }
      });
      var newEntries = entries.filter(function (e) {
        return !existingEmpIds.has(Number(e.emp_id));
      });
      var skippedCount = entries.length - newEntries.length;
      if (!newEntries.length) {
        throw new Error('جميع الموظفين مسجلون مسبقاً لهذا الشهر');
      }
      const sheet = getSheet_(EMP_SALARIES_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const startRow = sheet.getLastRow() + 1;
      const rows = newEntries.map(function (e, i) {
        const r = startRow + i;
        const empId = Number(e.emp_id);
        const wd = Number(e.working_days);
        const rec = {
          emp_id: empId,
          name_ar: '=VLOOKUP(A' + r + ',employee_info!A:B,2,0)',
          basic_salary: '=DGET(employee_salary!$A:$J,employee_salary!$E$1 , {employee_salary!$B$1,employee_salary!$C$1 ;MAXIFS(employee_salary!B:B,employee_salary!B:B,"<=" & V' + r + ',employee_salary!C:C,A' + r + '),A' + r + '})',
          allow: '=DGET(employee_salary!$A:$J,employee_salary!$F$1 , {employee_salary!$B$1,employee_salary!$C$1 ;MAXIFS(employee_salary!$B:$B,employee_salary!$B:$B,"<=" & V' + r + ',employee_salary!$C:$C,A' + r + '),A' + r + '})',
          section: '=INDEX(employee_info!$I:$I,MATCH($A' + r + ',employee_info!$A:$A,0))',
          working_days: wd,
          working_days_value: '=(C' + r + '+D' + r + ')/30*F' + r,
          deduction_day: '=if(SUMIFS(emp_deductions!$E:$E,emp_deductions!A:A,A' + r + ',emp_deductions!I:I,U' + r + ',emp_deductions!J:J,T' + r + ',emp_deductions!C:C,"غياب")-1 <0,0,SUMIFS(emp_deductions!$E:$E,emp_deductions!A:A,A' + r + ',emp_deductions!I:I,U' + r + ',emp_deductions!J:J,T' + r + ',emp_deductions!C:C,"غياب")-1)',
          overtime_days: '=SUMIFS(emp_overtime!G:G,emp_overtime!A:A,A' + r + ',emp_overtime!M:M,T' + r + ',emp_overtime!L:L,U' + r + ')/8',
          loans_other_deductions: '=SUMIFS(emp_deductions!G:G,emp_deductions!A:A,A' + r + ',emp_deductions!I:I,U' + r + ',emp_deductions!J:J,T' + r + ',emp_deductions!C:C,"<>" & "غياب",emp_deductions!C:C,"<>" & "جزاء")+SUMIFS(emp_deductions!$E:$E,emp_deductions!A:A,A' + r + ',emp_deductions!I:I,U' + r + ',emp_deductions!J:J,T' + r + ',emp_deductions!C:C,"جزاء")*C' + r + '/30',
          delay_deductions: '=SUMIFS(emp_permits!G:G,emp_permits!A:A,A' + r + ',emp_permits!H:H,U' + r + ',emp_permits!I:I,T' + r + ')/60*(C' + r + '/8/30)',
          other_addition: '=SUMIFS(emp_overtime!J:J,emp_overtime!A:A,A' + r + ',emp_overtime!L:L,U' + r + ',emp_overtime!M:M,T' + r + ',emp_overtime!I:I,"<>" & "عمل اضافي")',
          overtime_days_value: '=C' + r + '/30*I' + r,
          deduction_day_value: '=C' + r + '/30*H' + r,
          net_salary: '=G' + r + '+L' + r + '+M' + r + '-N' + r + '-K' + r + '-J' + r,
          net_salary_nearest: '=IF(CEILING(O' + r + ',5)<0,0,CEILING(O' + r + ',5))',
          month_name: '=VLOOKUP(U' + r + ',data_validation_hr!$A$1:$C$13,3,0)',
          internal_section: '=INDEX(employee_info!$H:$H,MATCH(A' + r + ',employee_info!$A:$A,0))',
          section_type: '=VLOOKUP(R' + r + ',dept_section_index!$B:$D,2,0)',
          year: year,
          month: month,
          salary_date: '=EOMONTH(DATE(T' + r + ',U' + r + ',1),0)',
          user: (user && user.email) || '',
          created_at: new Date()
        };
        return headers.map(function (h) {
          const key = String(h).trim().toLowerCase();
          return rec[key] !== undefined ? rec[key] : '';
        });
      });
      sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
      noteMutation_(sheet);
      try { newEntries.forEach(function(e){ var _eid = Number(e.emp_id); var _mapSal2 = { emp_id: _eid, month: month, year: year, working_days: Number(e.working_days) }; logHistory_(dbId, EMP_SALARIES_SHEET, 'create_'+EMP_SALARIES_SHEET+'_'+_eid+'_'+month+'_'+year, String(_eid), (user&&user.email)||'', 'create', _mapSal2, null); }); } catch(e){}
      var msg = 'تم توليد المرتبات (' + rows.length + ' موظف)';
      if (skippedCount) msg += ' — تم تخطي ' + skippedCount + ' موظف مسجل مسبقاً';
      var savedRecords = newEntries.map(function(e){ return { emp_id: Number(e.emp_id), month: month, year: year, working_days: Number(e.working_days), name_ar: employeeRefs_(dbId).map[Number(e.emp_id)] || ('#' + e.emp_id) }; });
      return { status: 'success', message: msg, records: savedRecords, data: { count: rows.length, skipped: skippedCount, assignedId: month+'-'+year } };
    });
  }

  function editEmpSalary_(data, user, dbId) {
    const empId = Number(data.emp_id);
    const oldMonth = Number(data.old_month || data.month);
    const oldYear = Number(data.old_year || data.year);
    const newMonth = Number(data.month);
    const newYear = Number(data.year);
    const workingDays = Number(data.working_days);

    if (!Number.isInteger(empId)) throw new Error('كود الموظف مطلوب');
    if (!Number.isInteger(newMonth) || newMonth < 1 || newMonth > 12) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(newYear) || newYear < 2000) throw new Error('السنة مطلوبة');
    if (isNaN(workingDays) || workingDays < 0) throw new Error('أيام العمل غير صحيحة');

    const closeRows = getAllRecords_(dbId, EMP_SALARIES_CLOSE_SHEET);
    const isOldClosed = closeRows.some(function (r) { return Number(r.month) === oldMonth && Number(r.year) === oldYear; });
    const isNewClosed = closeRows.some(function (r) { return Number(r.month) === newMonth && Number(r.year) === newYear; });
    if (isOldClosed || isNewClosed) {
      throw new Error('لا يمكن التعديل: المرتبات لهذا الشهر مغلقة مسبقاً (تم غلق الشهر في emp_salaries_close)');
    }

    return executeWithLock_(function () {
      const sheet = getSheet_(EMP_SALARIES_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const values = sheet.getDataRange().getValues();
      const empIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'emp_id'; });
      const monthIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'month'; });
      const yearIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'year'; });
      const wdIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'working_days'; });

      let rowNum = -1;
      for (let i = 1; i < values.length; i++) {
        if (Number(values[i][empIdx]) === empId && Number(values[i][monthIdx]) === oldMonth && Number(values[i][yearIdx]) === oldYear) {
          rowNum = i + 1; break;
        }
      }
      if (rowNum === -1) throw new Error('السجل غير موجود');

      var _oldSal = null; try { _oldSal = getAllRecords_(dbId, EMP_SALARIES_SHEET).find(function(r){ return Number(r.emp_id)===Number(empId) && Number(r.month)===Number(oldMonth) && Number(r.year)===Number(oldYear); })||null; } catch(e2){}
      if (wdIdx !== -1) sheet.getRange(rowNum, wdIdx + 1).setValue(workingDays);
      noteMutation_(sheet);
      if (monthIdx !== -1) sheet.getRange(rowNum, monthIdx + 1).setValue(newMonth);
      noteMutation_(sheet);
      if (yearIdx !== -1) sheet.getRange(rowNum, yearIdx + 1).setValue(newYear);
      noteMutation_(sheet);
      try { var _uidSal = _oldSal && _oldSal.record_uid ? _oldSal.record_uid : 'create_'+EMP_SALARIES_SHEET+'_'+empId+'_'+oldMonth+'_'+oldYear; var _newSal = {}; if(_oldSal) Object.keys(_oldSal).forEach(function(k){ _newSal[k]=_oldSal[k]; }); _newSal.working_days=workingDays; _newSal.month=newMonth; _newSal.year=newYear; logHistory_(dbId, EMP_SALARIES_SHEET, _uidSal, String(empId), (user&&user.email)||'', 'update', _newSal, _oldSal); } catch(e){}

      return { status: 'success', message: 'تم تعديل بيانات الراتب بنجاح' };
    });
  }

  function deleteEmpSalary_(data, user, dbId) {
    const empId = Number(data.emp_id);
    const month = Number(data.month);
    const year = Number(data.year);
    if (!Number.isInteger(empId)) throw new Error('كود الموظف مطلوب');
    if (!Number.isInteger(month)) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(year)) throw new Error('السنة مطلوبة');

    const closeRows = getAllRecords_(dbId, EMP_SALARIES_CLOSE_SHEET);
    const isClosed = closeRows.some(function (r) { return Number(r.month) === month && Number(r.year) === year; });
    if (isClosed) throw new Error('لا يمكن الحذف: المرتبات لهذا الشهر مغلقة مسبقاً');

    return executeWithLock_(function () {
      const sheet = getSheet_(EMP_SALARIES_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const values = sheet.getDataRange().getValues();
      const empIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'emp_id'; });
      const monthIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'month'; });
      const yearIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'year'; });
      let rowNum = -1;
      for (let i = 1; i < values.length; i++) {
        if (Number(values[i][empIdx]) === empId && Number(values[i][monthIdx]) === month && Number(values[i][yearIdx]) === year) {
          rowNum = i + 1; break;
        }
      }
      if (rowNum === -1) throw new Error('السجل غير موجود');
      /* OPT-3: history snapshot from the row just located (same trimmed-header
         mapping buildRecordsFromRaw_ applies) instead of a second full read.
         The located row matched numerically, so it carries non-blank cells
         and the blank-row filter would have kept it too. */
      var _oldDel = null; try { _oldDel = {}; headers.forEach(function (h, ci) { var _dv = values[rowNum - 1][ci]; _oldDel[String(h).trim()] = _dv !== undefined ? _dv : ''; }); } catch(e2){ _oldDel = null; }
      try { var _uidDel = _oldDel && _oldDel.record_uid ? _oldDel.record_uid : 'create_'+EMP_SALARIES_SHEET+'_'+empId+'_'+month+'_'+year; logHistory_(dbId, EMP_SALARIES_SHEET, _uidDel, String(empId), (user&&user.email)||'', 'delete', null, _oldDel); } catch(e){}
      sheet.deleteRow(rowNum);
      noteMutation_(sheet);
      return { status: 'success', message: 'تم حذف سجل الراتب' };
    });
  }

  function updateEmpSalaryReceipt_(data, user, dbId) {
    const empId = Number(data.emp_id);
    const month = Number(data.month);
    const year = Number(data.year);
    if (!Number.isInteger(empId)) throw new Error('كود الموظف مطلوب');
    if (!Number.isInteger(month)) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(year)) throw new Error('السنة مطلوبة');
    return executeWithLock_(function () {
      const sheet = getSheet_(EMP_SALARIES_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const values = sheet.getDataRange().getValues();
      const empIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'emp_id'; });
      const monthIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'month'; });
      const yearIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'year'; });
      const receiptIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'receipt'; });
      if (receiptIdx === -1) throw new Error('عمود الإيصال غير موجود في الجدول');
      let rowNum = -1;
      for (let i = 1; i < values.length; i++) {
        if (Number(values[i][empIdx]) === empId && Number(values[i][monthIdx]) === month && Number(values[i][yearIdx]) === year) {
          rowNum = i + 1; break;
        }
      }
      if (rowNum === -1) throw new Error('السجل غير موجود');
      /* OPT-3: history snapshot from the row just located (same mapping as
         above) instead of a second full read of the salaries sheet. */
      var _oldRec = null; try { _oldRec = {}; headers.forEach(function (h, ci) { var _rv = values[rowNum - 1][ci]; _oldRec[String(h).trim()] = _rv !== undefined ? _rv : ''; }); } catch(e2){ _oldRec = null; }
      sheet.getRange(rowNum, receiptIdx + 1).setValue(true);
      noteMutation_(sheet);
      try { var _uidRec = _oldRec && _oldRec.record_uid ? _oldRec.record_uid : 'create_'+EMP_SALARIES_SHEET+'_'+empId+'_'+month+'_'+year; var _newRec = {}; if(_oldRec) Object.keys(_oldRec).forEach(function(k){ _newRec[k]=_oldRec[k]; }); _newRec.receipt=true; logHistory_(dbId, EMP_SALARIES_SHEET, _uidRec, String(empId), (user&&user.email)||'', 'update', _newRec, _oldRec); } catch(e){}
      return { status: 'success', message: 'تم تسجيل استلام الراتب' };
    });
  }

  // =========================================
  // شئون العاملين — غلق المرتبات الشهرية (emp_salaries_close)
  // =========================================
  function getPayrollMonths_(data, user, dbId) {
    const openMap = {};
    getAllRecords_(dbId, EMP_SALARIES_SHEET).forEach(function (r) {
      const m = Number(r.month); const y = Number(r.year);
      if (Number.isInteger(m) && Number.isInteger(y)) openMap[y + '-' + m] = { month: m, year: y };
    });
    const closedSet = {};
    const closed = getAllRecords_(dbId, EMP_SALARIES_CLOSE_SHEET).map(function (r) {
      closedSet[String(r.year) + '-' + String(r.month)] = true;
      return {
        id: r.id, month: r.month, year: r.year, amount: r.amount,
        user: r.user, created_at: r.created_at
      };
    }).reverse();
    const open = Object.keys(openMap).sort().reverse().map(function (k) {
      return closedSet[k] ? null : openMap[k];
    }).filter(Boolean);
    return { status: 'success', closed: closed, open: open, month_options: HR_MONTHS };
  }

  function closePayrollMonth_(data, user, dbId) {
    const month = Number(data.month);
    const year = Number(data.year);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('الشهر مطلوب');
    if (!Number.isInteger(year) || year < 2000) throw new Error('السنة مطلوبة');
    return executeWithLock_(function () {
      const closeRows = getAllRecords_(dbId, EMP_SALARIES_CLOSE_SHEET);
      const dup = closeRows.some(function (r) { return Number(r.month) === month && Number(r.year) === year; });
      /* Phase 2: open->closed via insert, closed terminal — via table (no inline dup check retained). */
      assertTransition_('payroll_month', dup ? 'closed' : 'open', 'closed', 'هذا الشهر مغلق مسبقاً');
      const salaryRows = getAllRecords_(dbId, EMP_SALARIES_SHEET).filter(function (r) {
        return Number(r.month) === month && Number(r.year) === year;
      });
      /* Phase 5: shared num0_ is source of truth for the sum (no parallel calc). */
      const total = salaryRows.reduce(function (s, r) { return s + num0_(r.net_salary); }, 0);
      const id = getNextIdUnderLock_(dbId, EMP_SALARIES_CLOSE_SHEET);
      const sheet = getSheet_(EMP_SALARIES_CLOSE_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const rec = {
        id: id, month: month, year: year, amount: total,
        user: (user && user.email) || '', created_at: new Date()
      };
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      sheet.appendRow(rowValues);
      noteMutation_(sheet);
      try { logHistory_(dbId, EMP_SALARIES_CLOSE_SHEET, rec.record_uid || ('create_'+EMP_SALARIES_CLOSE_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
      return { status: 'success', message: 'تم غلق المرتبات', data: { id: id, amount: total } };
    });
  }

  // =========================================
  // حسابات الميزانية (legal budget) — tables used AS-IS (no schema changes).
  // Read-only derived tables (current products / movement / income statement)
  // have NO add_* actions. Client sends keys = column headers (trimmed/lower).
  // =========================================

  /** Distinct non-empty values of a column across rows (for dropdowns). */
  function distinctValues_(rows, key) {
    const set = {};
    rows.forEach(function (r) {
      const v = String(r[key] == null ? '' : r[key]).trim();
      if (v) set[v] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ar'); });
  }

  /**
   * Append a budget row at getLastRow()+1. valueMap holds plain values;
   * formulaMap maps header-key -> formula string that may contain {r} which
   * is substituted with the real row number. Strings starting with '=' are
   * written via setValues so Sheets keeps them as live formulas (mirrors the
   * embedded sheet calculations). Flushes so formulas evaluate immediately.
   */
  function writeBudgetRow_(dbId, sheetName, valueMap, formulaMap) {
    const sheet = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sheet);
    const rowNumber = sheet.getLastRow() + 1;
    const rowValues = headers.map(function (h) {
      const key = String(h).trim().toLowerCase();
      if (formulaMap && formulaMap[key] !== undefined) {
        return String(formulaMap[key]).split('{r}').join(rowNumber);
      }
      return valueMap[key] !== undefined ? valueMap[key] : '';
    });
    sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    noteMutation_(sheet);
    SpreadsheetApp.flush();
    return rowNumber;
  }

  /** Append a header column to a sheet if missing (idempotent). */
  function ensureBudgetHeader_(dbId, sheetName, header) {
    const sheet = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sheet).map(function (h) { return String(h).trim().toLowerCase(); });
    const key = String(header).toLowerCase();
    if (headers.indexOf(key) !== -1) return;
    sheet.getRange(1, headers.length + 1).setValue(header);
    noteMutation_(sheet);
    SpreadsheetApp.flush();
  }

  /* Formula columns of legal_purchasing_costing. The browser may calculate
   * these values for a live preview, but the sheet remains the source of
   * truth: every create/edit path writes the same formulas into the row. */
  function legalCostingFormulaMap_() {
    return {
      'القيمه بالسعر المعلن': '=H{r}*I{r}',
      'اجمالي التكاليف': '=IF(D{r}="بيع",J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r},J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r}+U{r})',
      'المبيعات': '=IF(D{r}="بيع",ROUND(Y{r}*103/100,-2),0)',
      'نوع الضريبة': '=Y{r}*14/100',
      'ضريبة المبيعات': '=IF(AA{r}>0.06,Z{r}*14/100,0)',
      'الشهر': '=MONTH(B{r})',
      'العام': '=YEAR(B{r})'
    };
  }

  /** Next invoice number for a year: "{seq}-{year}" with seq = max+1 (resets yearly). */
  function nextInvoiceNumber_(dbId, year) {
    /* Phase 1: delegates to the shared locked counter. Format identical.
     * MUST be called while holding executeWithLock_. */
    var seq = nextDocumentNumber_(dbId, 'tc_legal_inv', year, {
      seedScanner: function () {
        var maxSeq = 0;
        getAllRecords_(dbId, LEGAL_INVOICES_SHEET).forEach(function (r) {
          var m = String(r['رقم الفاتورة'] || '').trim().match(/^(\d+)\s*-\s*(\d+)$/);
          if (!m) return;
          if (Number(m[2]) !== Number(year)) return;
          var s = Number(m[1]);
          if (s > maxSeq) maxSeq = s;
        });
        return maxSeq;
      }
    });
    return seq + '-' + year;
  }

  /** Phase 5: Sheet-formula version is display-only. JS shared calcManufactureTotal_
   *  (Code.js) is the source of truth for server-side totals; this keeps
   *  returning the operator's formula text (incl. T×M and T×N multipliers) only so
   *  the sheet cell keeps calculating for display. No rounding — raw preserved. */
  function buildManufactureTotalCost_(r) {
    const pairs = [
      { item: 'G', qty: 'O' }, { item: 'H', qty: 'P' }, { item: 'I', qty: 'Q' },
      { item: 'J', qty: 'R' }, { item: 'K', qty: 'S' }, { item: 'L', qty: 'T' },
      { item: 'M', qty: 'U', mQty: 'T' }, { item: 'N', qty: 'V', mQty: 'T' }
    ];
    const parts = [];
    pairs.forEach(function (p) {
      const mq = p.mQty || p.qty;
      parts.push(
        'IFERROR(' + p.qty + r + '*SUMIFS(legal_product_purchasing!$M:$M,legal_product_purchasing!$A:$A,' + p.item + r + '),0)' +
        '+IFERROR(' + mq + r + '*SUMIFS(legal_products_movement!$M:$M,legal_products_movement!$A:$A,' + p.item + r + ',legal_products_movement!$C:$C,"انتاج"),0)'
      );
    });
    return '=' + parts.join('+');
  }

  /** Phase 5: JS path for manufacture total — calls shared lib (source of truth).
   *  Components are resolved numbers [{qty, unitCost[, mult]}]; mult covers T×M/T×N. */
  function calcManufactureTotalCostJS_(components) {
    if (typeof calcManufactureTotal_ === 'function') return calcManufactureTotal_(components);
    var t = 0;
    (components || []).forEach(function (c) {
      var m = (c && c.mult !== undefined && c.mult !== null && c.mult !== '') ? Number(c.mult) : 1;
      if (!isFinite(m)) m = 1;
      t += num0_(c ? c.qty : 0) * num0_(c ? (c.unitCost !== undefined ? c.unitCost : c.price) : 0) * m;
    });
    return t;
  }

  /** Combined reference data for the budget forms (one call per page). */
  function getBudgetRefs_(data, user, dbId) {
    const parties = tcLegalPartiesRaw_(dbId);
    const products = tcLegalProductsRaw_(dbId);
    const current = getAllRecords_(dbId, LEGAL_CURRENT_SHEET);
    const costing = getAllRecords_(dbId, LEGAL_COSTING_SHEET);
    const income = getAllRecords_(dbId, LEGAL_INCOME_SHEET);
    const sectionMap = {};
    income.forEach(function (r) {
      const t = String(r['نوع البند'] || '').trim();
      if (!t) return;
      const no = Number(r['رقم_نوع_البند']) || 0;
      if (!sectionMap[t] || no < sectionMap[t].order) sectionMap[t] = { label: t, order: no };
    });
    return {
      status: 'success',
      refs: {
        banks: getAllRecords_(dbId, LEGAL_BANK_SHEET).map(function (r) {
          return { id: r.id, bank_name: String(r.bank_name || '').trim() };
        }).filter(function (b) { return b.bank_name; }),
        boxes: getAllRecords_(dbId, LEGAL_BOX_SHEET).map(function (r) {
          return {
            level5: String(r['المستوى الخامس'] == null ? '' : r['المستوى الخامس']).trim(),
            name5: String(r['اسم المستوى الخامس'] == null ? '' : r['اسم المستوى الخامس']).trim(),
            level4: String(r['المستوى الرابع'] == null ? '' : r['المستوى الرابع']).trim(),
            name4: String(r['اسم المستوى الرابع'] == null ? '' : r['اسم المستوى الرابع']).trim()
          };
        }).filter(function (b) { return b.level5; }),
        charts: tcChartOptions_(dbId),
        parties: parties.map(function (p) { return { id: p.id, name: p.name, tax_id: p.tax_id }; }),
        party_types: distinctValues_(parties, 'type'),
        products: products.map(function (p) {
          return { id: p.id, name_ar: p.name_ar, gpc: p.gpc, unit: p.unit };
        }).filter(function (p) { return p.name_ar; }),
        current_products: current.map(function (c) {
          return {
            transaction_code: String(c.transaction_code || '').trim(),
            product: String(c.product || '').trim(),
            current_qty: Number(c.current_qty) || 0
          };
        }).filter(function (c) { return c.transaction_code; }),
        cert_types: distinctValues_(costing, 'نوع الشهادة'),
        ship_types: ['FOB', 'CIF', 'C&F', 'محلي'],
        income_sections: Object.keys(sectionMap).map(function (k) { return sectionMap[k]; })
          .sort(function (a, b) { return a.order - b.order; })
      }
    };
  }

  function getLegalProducts_(data, user, dbId) {
    return { status: 'success', products: tcLegalProductsRaw_(dbId) };
  }

  function getLegalParties_(data, user, dbId) {
    return { status: 'success', parties: tcLegalPartiesRaw_(dbId) };
  }

  function addLegalParty_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('المعرف مطلوب (رقم صحيح موجب)');
    const name = String(data.name || '').trim();
    if (!name) throw new Error('الاسم مطلوب');
    if (!String(data.tax_id || '').trim()) throw new Error('الرقم الضريبي مطلوب');
    const exists = (function () { var _idx = indexById(tcLegalPartiesRaw_(dbId), 'id'); var _k = String(id).trim(); return _idx.has(_k) || _idx.has(_k.toLowerCase()); })();
    if (exists) throw new Error('المعرف مستخدم بالفعل: ' + id);
    const rec = {};
    Object.keys(data).forEach(function (k) { rec[k.trim().toLowerCase()] = data[k]; });
    rec['id'] = id; rec['name'] = name;
    var resLP = appendRow_(dbId, LEGAL_PARTIES_SHEET, rec);
    try { logHistory_(dbId, LEGAL_PARTIES_SHEET, rec.record_uid || ('create_'+LEGAL_PARTIES_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    try { bustTcRefs_(dbId); } catch(e){}
    try { invalidateRefsCache_(dbId, 'tc_legal_parties_raw'); } catch(e2){}
    try { invalidateRefsCache_(dbId, 'tc_legal_parties_opts'); } catch(e3){}
    var savedLP = {}; Object.keys(rec).forEach(function(k){ savedLP[k]=rec[k]; });
    resLP.record = savedLP;
    resLP.data = { assignedId: id };
    return resLP;
  }

  function getLegalCurrentProducts_(data, user, dbId) {
    return { status: 'success', items: getAllRecords_(dbId, LEGAL_CURRENT_SHEET) };
  }

  /**
   * The system-products picker for the balance page: id + name_ar from the live
   * `products` table. A MySQL that is down answers with an empty list and
   * error:true instead of failing the request — the modal says why, and the
   * page keeps working.
   */
  function getSystemProductOptions_(data, user, dbId) {
    try {
      return { status: 'success', options: systemProductOptions_().options };
    } catch (e) {
      return { status: 'success', options: [], error: true, message: 'تعذر جلب أصناف النظام من قاعدة البيانات' };
    }
  }

  /**
   * رصيد أصناف الميزانية — one row per legal_products record, not per
   * legal_current_products transaction.
   *
   * legal_current_products.product is the product NAME as AppSheet wrote it,
   * so the only key back to legal_products is the trimmed name_ar — and the
   * page is a GROUP BY that name: the sums it shows are the sums of exactly
   * the transaction lines the modal lists for that product. Two edge cases are
   * surfaced rather than hidden. A name_ar duplicated in legal_products keeps
   * its lines on the lowest id, so no quantity is summed twice and the copied
   * name is reported in duplicate_names. Lines whose product matches no legal
   * product (blank included) are counted in unmatched_count instead of
   * silently disappearing from a report.
   *
   * The live balance is product_current_quantity.current_qty where
   * legal_products.product_system_id is that view's id. A MySQL that is down
   * must not blank the report: the aggregation still returns and
   * system_qty_error says why the system column is empty.
   */
  function getLegalStockBalance_(data, user, dbId) {
    const products = tcLegalProductsRaw_(dbId);
    const current = getAllRecords_(dbId, LEGAL_CURRENT_SHEET);

    const linesByName = {};
    const blankLines = [];
    current.forEach(function (c) {
      const name = String(c.product == null ? '' : c.product).trim();
      const line = {
        transaction_code: String(c.transaction_code == null ? '' : c.transaction_code).trim(),
        transaction_name: String(c.transaction_name == null ? '' : c.transaction_name).trim(),
        code: String(c.code == null ? '' : c.code).trim(),
        unit: String(c.unit == null ? '' : c.unit).trim(),
        current_qty: Number(c.current_qty) || 0,
        total_cost_sign: Number(c.total_cost_sign) || 0,
        total_sales_value: Number(c.total_sales_value) || 0,
        sales_per_qty: Number(c.sales_per_qty) || 0,
        product_target: String(c.product_target == null ? '' : c.product_target).trim()
      };
      if (!name) { blankLines.push(line); return; }
      if (!linesByName[name]) linesByName[name] = [];
      linesByName[name].push(line);
    });

    const claimed = {};
    const duplicateNames = [];
    const assetRefs = tcAssetCodeRefs_(dbId);
    const rows = products.slice().sort(function (a, b) {
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    }).map(function (p) {
      const name = String(p.name_ar == null ? '' : p.name_ar).trim();
      let lines = [];
      if (name && !claimed[name]) {
        claimed[name] = true;
        lines = linesByName[name] || [];
      } else if (name) {
        if (duplicateNames.indexOf(name) === -1) duplicateNames.push(name);
      }
      let qty = 0, cost = 0, sales = 0;
      lines.forEach(function (l) {
        qty += l.current_qty;
        cost += l.total_cost_sign;
        sales += l.total_sales_value;
      });
      const assetCode = String(p.asset_code == null ? '' : p.asset_code).trim();
      return {
        id: p.id,
        name_ar: name,
        unit: String(p.unit == null ? '' : p.unit).trim(),
        category: String(p.category == null ? '' : p.category).trim(),
        product_type: String(p.product_type == null ? '' : p.product_type).trim(),
        /* raw cell kept for display/back-compat; the parsed list is the contract */
        product_system_id: p.product_system_id == null ? '' : p.product_system_id,
        product_system_ids: parseSystemIds_(p.product_system_id),
        product_system_names: [],
        system_ids_missing: [],
        asset_code: assetCode,
        asset_code_name: assetRefs.map[assetCode] || '',
        lines_count: lines.length,
        current_qty: qty,
        total_cost_sign: cost,
        total_sales_value: sales,
        system_qty: null,
        difference: null,
        lines: lines
      };
    });

    /* The warning chips on the page are not just counts: each one can open the
       problem VALUES. unmatched lists every legal_current_products product name
       that matched no legal_products.name_ar (blank included), grouped by name
       with its totals, so the sheet can be fixed from the screen. duplicates
       lists every name_ar that appears more than once, its ids, and which id
       actually claimed the lines (the lowest one — see the map above). */
    function sumLines(lines) {
      let qty = 0, cost = 0, sales = 0;
      (lines || []).forEach(function (l) {
        qty += l.current_qty;
        cost += l.total_cost_sign;
        sales += l.total_sales_value;
      });
      return { current_qty: qty, total_cost_sign: cost, total_sales_value: sales };
    }
    const unmatched = [];
    if (blankLines.length) {
      const sBlank = sumLines(blankLines);
      unmatched.push({
        product: '', lines_count: blankLines.length,
        current_qty: sBlank.current_qty, total_cost_sign: sBlank.total_cost_sign, total_sales_value: sBlank.total_sales_value
      });
    }
    Object.keys(linesByName).forEach(function (name) {
      if (claimed[name]) return;
      const s = sumLines(linesByName[name]);
      unmatched.push({
        product: name, lines_count: linesByName[name].length,
        current_qty: s.current_qty, total_cost_sign: s.total_cost_sign, total_sales_value: s.total_sales_value
      });
    });
    unmatched.sort(function (a, b) { return b.lines_count - a.lines_count; });

    const groupsByName = {};
    rows.forEach(function (r) {
      if (!r.name_ar) return;
      if (!groupsByName[r.name_ar]) groupsByName[r.name_ar] = [];
      groupsByName[r.name_ar].push(r);
    });
    const duplicates = [];
    Object.keys(groupsByName).forEach(function (name) {
      const group = groupsByName[name];
      if (group.length < 2) return;
      const owner = group[0]; // rows are id-ascending, so this is the lowest id
      duplicates.push({
        name: name,
        claimed_id: owner.id,
        ids: group.map(function (r) { return r.id; }),
        lines_count: owner.lines_count,
        current_qty: owner.current_qty,
        total_cost_sign: owner.total_cost_sign
      });
    });

    let unmatchedCount = blankLines.length;
    Object.keys(linesByName).forEach(function (name) {
      if (!claimed[name]) unmatchedCount += linesByName[name].length;
    });

    let systemQty = {};
    let systemQtyError = false;
    try { systemQty = systemQtyMap_(); } catch (e) { systemQtyError = true; }
    /* Names are a DISPLAY nicety and must never cost the report a database
     * round trip, so this reads the picker's cache only and never opens a JDBC
     * connection. The cache is populated by get_system_product_options (the
     * modal picker, or the page's background prefetch), so the ids are shown
     * until names are cached and the next render swaps them in. */
    let systemNames = {};
    try {
      const cachedOptions = systemProductOptionsCached_();
      if (cachedOptions && cachedOptions.map) systemNames = cachedOptions.map;
    } catch (eNames) {}
    rows.forEach(function (r) {
      const ids = r.product_system_ids || [];
      r.product_system_names = ids.map(function (sid) { return systemNames[String(sid)] || String(sid); });
      if (!ids.length) return;
      /* A legal product may be linked to several system ids, so the balance is
       * the SUM of the ids the view knows. An id the view does not know is
       * reported in system_ids_missing rather than silently dropped, so a
       * partial sum is never mistaken for a complete one. */
      let sum = 0, found = 0;
      const missing = [];
      ids.forEach(function (sid) {
        if (Object.prototype.hasOwnProperty.call(systemQty, sid)) {
          sum += Number(systemQty[sid]) || 0;
          found++;
        } else {
          missing.push(sid);
        }
      });
      r.system_ids_missing = missing;
      if (!found) return;
      r.system_qty = Math.round(sum * 1000) / 1000;
      r.difference = Math.round((r.system_qty - r.current_qty) * 1000) / 1000;
    });

    return {
      status: 'success',
      products: rows,
      asset_code_options: assetRefs.options,
      system_qty_error: systemQtyError,
      unmatched_count: unmatchedCount,
      unmatched: unmatched,
      duplicate_names: duplicateNames,
      duplicates: duplicates
    };
  }

  /**
   * Set legal_products.asset_code and/or legal_products.product_system_ids for
   * one product.
   *
   * asset_code is a reference into chart_of_accounts level-5: the value stored
   * is المستوى الخامس and the label shown is اسم المستوى الخامس. The value is
   * validated against that list here, so the sheet cannot be handed a code no
   * account owns. Empty clears the reference. legal_products is served from the
   * tcRefs_ cache, so a successful write busts it — otherwise the product list
   * would keep showing the old account for up to the TTL.
   *
   * product_system_id is the multi-choice link to the live MySQL products
   * table: the payload carries an array (or a comma string), every id is
   * validated against that table, and the column stores the canonical
   * comma-separated list. An empty list clears the link and needs no database;
   * a non-empty list is refused when MySQL cannot confirm the ids rather than
   * written unverified.
   */
  function updateLegalProduct_(data, user, dbId) {
    const d = data || {};
    const id = Number(d.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('معرف الصنف مطلوب');
    const hasAsset = Object.prototype.hasOwnProperty.call(d, 'asset_code');
    const hasSystem = Object.prototype.hasOwnProperty.call(d, 'product_system_ids');
    if (!hasAsset && !hasSystem) throw new Error('لا توجد حقول للتحديث');

    let assetCode = '';
    let assetRefs = { options: [], map: {} };
    if (hasAsset) {
      assetCode = String(d.asset_code == null ? '' : d.asset_code).trim();
      assetRefs = tcAssetCodeRefs_(dbId);
      if (assetCode && !Object.prototype.hasOwnProperty.call(assetRefs.map, assetCode)) {
        throw new Error('كود الأصل غير موجود في شجرة الحسابات');
      }
    }

    let systemIds = [];
    let systemNameMap = {};
    if (hasSystem) {
      systemIds = parseSystemIds_(d.product_system_ids);
      if (systemIds.length) {
        let refs = null;
        try { refs = systemProductOptions_(); } catch (eSysRefs) { refs = null; }
        if (!refs) throw new Error('تعذر التحقق من أصناف النظام — قاعدة البيانات غير متاحة؛ لم يتم الحفظ');
        const bad = systemIds.filter(function (sid) {
          return !Object.prototype.hasOwnProperty.call(refs.map, String(sid));
        });
        if (bad.length) throw new Error('أصناف نظام غير موجودة: ' + bad.join('، '));
        systemNameMap = refs.map;
      }
    }

    const sheet = getSheet_(LEGAL_PRODUCTS_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idCol = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'id'; });
    const codeCol = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'asset_code'; });
    const sysCol = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'product_system_id'; });
    if (idCol === -1 || (hasAsset && codeCol === -1) || (hasSystem && sysCol === -1)) throw new Error('أعمدة الجدول غير مكتملة');
    const values = sheet.getDataRange().getValues();
    let rowNum = -1;
    for (let r = 1; r < values.length; r++) {
      if (Number(values[r][idCol]) === id) { rowNum = r + 1; break; }
    }
    if (rowNum === -1) throw new Error('الصنف غير موجود');
    const oldCode = codeCol === -1 ? '' : String(values[rowNum - 1][codeCol] == null ? '' : values[rowNum - 1][codeCol]).trim();
    const oldSystem = sysCol === -1 ? '' : String(values[rowNum - 1][sysCol] == null ? '' : values[rowNum - 1][sysCol]).trim();
    const systemValue = systemIds.join(',');
    const writes = [];
    if (hasAsset) writes.push({ col: codeCol, value: assetCode });
    if (hasSystem) writes.push({ col: sysCol, value: systemValue });
    executeWithLock_(function () {
      writes.forEach(function (w) { sheet.getRange(rowNum, w.col + 1).setValue(w.value); });
      noteMutation_(sheet);
    });
    const oldValues = {}, newValues = {};
    if (hasAsset) { oldValues.asset_code = oldCode; newValues.asset_code = assetCode; }
    if (hasSystem) { oldValues.product_system_id = oldSystem; newValues.product_system_id = systemValue; }
    try {
      logHistory_(dbId, LEGAL_PRODUCTS_SHEET, 'update_' + LEGAL_PRODUCTS_SHEET + '_' + id, String(id),
        (user && user.email) || '', 'update', Object.assign({ id: id }, newValues), Object.assign({ id: id }, oldValues));
    } catch (e) {}
    try { bustTcRefs_(dbId); } catch (e) {}
    const record = { id: id };
    if (hasAsset) { record.asset_code = assetCode; record.asset_code_name = assetRefs.map[assetCode] || ''; }
    if (hasSystem) {
      record.product_system_id = systemValue;
      record.product_system_ids = systemIds;
      record.product_system_names = systemIds.map(function (sid) { return systemNameMap[String(sid)] || String(sid); });
    }
    const messages = [];
    if (hasAsset) messages.push('تم تحديث كود الأصل');
    if (hasSystem) messages.push('تم تحديث أصناف النظام');
    return { status: 'success', message: messages.join(' و '), record: record };
  }

  function getLegalProductsMovement_(data, user, dbId) {
    const month = Number(data.month);
    const year = Number(data.year);
    const type = String(data.type || '').trim();
    const product = String(data.product || '').trim();
    const search = String(data.search || '').trim().toLowerCase();
    const offset = Math.max(0, Number(data.offset) || 0);
    const limit = Math.min(500, Math.max(1, Number(data.limit) || 200));
    let rows = getAllRecords_(dbId, LEGAL_MOVEMENT_SHEET);
    if (Number.isInteger(month) && month >= 1 && month <= 12) rows = rows.filter(r => Number(r.month) === month);
    if (Number.isInteger(year) && year >= 2000) rows = rows.filter(r => Number(r.year) === year);
    if (type) rows = rows.filter(r => String(r.transaction_type || '').trim() === type);
    if (product) rows = rows.filter(r => String(r.product || '').trim() === product);
    if (search) {
      rows = rows.filter(function (r) {
        return String(r.product || '').toLowerCase().indexOf(search) !== -1 ||
          String(r.transaction_code || '').toLowerCase().indexOf(search) !== -1;
      });
    }
    rows = rows.filter(function (r) {
      return String(r.transaction_code || '').trim() !== '' ||
        String(r.code || '').trim() !== '' ||
        String(r.product || '').trim() !== '';
    });
    rows.sort(function (a, b) { return String(b.transaction_date || '').localeCompare(String(a.transaction_date || '')); });
    const total = rows.length;
    /* transaction_date_display: the wall date/time a user can read. Raw
       transaction_date stays on the row for sorting and existing consumers. */
    const items = rows.slice(offset, offset + limit).map(function (r) {
      const out = {};
      Object.keys(r).forEach(function (k) { out[k] = r[k]; });
      out.transaction_date_display = (typeof budgetDateDisplay_ === 'function')
        ? budgetDateDisplay_(r.transaction_date)
        : r.transaction_date;
      return out;
    });
    return { status: 'success', items: items, total: total, offset: offset, limit: limit };
  }

  function getLegalInputs_(data, user, dbId) {
    return {
      status: 'success',
      costing: getAllRecords_(dbId, LEGAL_COSTING_SHEET),
      lines: getAllRecords_(dbId, LEGAL_PURCHASING_SHEET)
    };
  }

  function addLegalCosting_(data, user, dbId) {
    var _costFileIds = attachmentIdsForFields_(dbId, LEGAL_COSTING_SHEET, data || {}, ['invoice_swift']);
    const cert = String(data['رقم الشهاده'] || '').trim();
    if (!cert) throw new Error('رقم الشهادة مطلوب');
    if (!String(data['تاريخ الافراج'] || '').trim()) throw new Error('تاريخ الافراج مطلوب');
    if (!String(data['الصنف'] || '').trim()) throw new Error('الصنف مطلوب');
    if (!String(data['نوع الشهادة'] || '').trim()) throw new Error('نوع الشهادة مطلوب');
    if (!String(data['نوع الشحن'] || '').trim()) throw new Error('نوع الشحن مطلوب');
    if (!String(data['اسم_المورد'] || '').trim()) throw new Error('المورد مطلوب');
    validateBudgetMonth_(data['تم_الاقرار_شهر']);
    validateBudgetExchangeValues_(data);
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
    Object.keys(_costFileIds).forEach(function (k) { valueMap[k] = _costFileIds[k]; });
    valueMap['user'] = (user && user.email) || '';
    const formulaMap = legalCostingFormulaMap_();
    var rowNum = writeBudgetRow_(dbId, LEGAL_COSTING_SHEET, valueMap, formulaMap);
    try { logHistory_(dbId, LEGAL_COSTING_SHEET, valueMap.record_uid || ('create_'+LEGAL_COSTING_SHEET+'_'+cert), String(cert), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
    var savedRecord = {};
    Object.keys(data).forEach(function(k){ savedRecord[k]=data[k]; });
    savedRecord['رقم الشهاده'] = cert;
    savedRecord['user'] = (user && user.email) || '';
    savedRecord['_sheetRow'] = rowNum;
    return { status: 'success', message: 'تمت إضافة شهادة التسعير', record: savedRecord, data: { assignedId: cert } };
  }

  function addLegalPurchasingLine_(data, user, dbId) {
    var _lineFileIds = attachmentIdsForFields_(dbId, LEGAL_PURCHASING_SHEET, data || {}, ['شهادة_تحليل_ان_وجد', 'ترخيص_بالافراج_الزراعي', 'صورة الافراج', 'صورة التسجيل']);
    const item = String(data['المادة'] || '').trim();
    if (!item) throw new Error('المادة مطلوبة');
    if (!(Number(data['الكمية']) > 0)) throw new Error('الكمية مطلوبة (أكبر من صفر)');
    if (!(Number(data['قيمة التكلفة']) >= 0)) throw new Error('قيمة التكلفة مطلوبة');
    if (!String(data['المعاملة'] || '').trim()) throw new Error('المعاملة مطلوبة');
    if (String(data['نوع الشهادة'] || '').trim() === 'بيع' && !(Number(data['سعر البيع']) > 0)) throw new Error('سعر البيع مطلوب عندما يكون نوع الشهادة بيع');
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
    Object.keys(_lineFileIds).forEach(function (k) { valueMap[k] = _lineFileIds[k]; });
    valueMap['user'] = (user && user.email) || '';
    if (String(valueMap['رقم الشهاده'] || '').trim()) {
      ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'رقم الشهاده');
    }
    const formulaMap = {
      'كود المعاملة': '=CONCATENATE(I{r},"-",B{r},"-",E{r},"-",TEXT(F{r},"DD/MM/YYYY"))',
      'قيمة البيع': '=G{r}',
      'تسوية البيع': '=K{r}',
      'تكلفة الوحدة': '=H{r}/G{r}'
    };
    var rowNum = writeBudgetRow_(dbId, LEGAL_PURCHASING_SHEET, valueMap, formulaMap);
    try { var _certPl = String(data['رقم الشهاده'] || data['الرقم'] || '').trim() || ('row_'+rowNum); logHistory_(dbId, LEGAL_PURCHASING_SHEET, valueMap.record_uid || ('create_'+LEGAL_PURCHASING_SHEET+'_'+_certPl+'_'+rowNum), String(_certPl), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
    var savedLine = {};
    Object.keys(data).forEach(function(k){ savedLine[k]=data[k]; });
    savedLine['user']=(user && user.email)||'';
    savedLine['_sheetRow']=rowNum;
    return { status: 'success', message: 'تمت إضافة بند المشتريات', record: savedLine, data: { assignedId: data['رقم الشهاده'] || '' } };
  }

  /** YYYY-MM-DD from a Date (manual pad, no padStart dependency). */
  function budgetDateStr_(d) {
    const m = String(d.getMonth() + 1);
    const day = String(d.getDate());
    return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
  }

  function formatShortDate_(d) {
    if (!d) return '';
    if (d instanceof Date) {
      return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
    }
    const date = parseDate_(d);
    if (date instanceof Date && !isNaN(date.getTime())) {
      return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
    }
    return String(d);
  }

  /** Robust YYYY-MM-DD normalizer for Date objects, ISO strings, and DD/MM/YYYY */
  function normalizeDateStr_(d) {
    if (!d) return '';
    if (d instanceof Date) return budgetDateStr_(d);
    const s = String(d).trim();
    if (!s) return '';
    const mIso = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (mIso) {
      const m = Number(mIso[2]);
      const day = Number(mIso[3]);
      return mIso[1] + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
    }
    const mDm = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (mDm) {
      const day = Number(mDm[1]);
      const m = Number(mDm[2]);
      return mDm[3] + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
    }
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) return budgetDateStr_(dt);
    return s;
  }

  /** Validate شهر الإقرار (تم_الاقرار_شهر): blank allowed, else integer 0..12. */
  function validateBudgetMonth_(v) {
    if (v === undefined || v === null || String(v).trim() === '') return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 12) throw new Error('شهر الإقرار يجب أن يكون رقماً صحيحاً بين 0 و 12');
  }

  function validateBudgetExchangeValues_(data) {
    [
      { key: 'القيمه بالدولار', label: 'القيمة بالعملة الأصلية' },
      { key: 'سعر الصرف', label: 'سعر الصرف' }
    ].forEach(function (field) {
      var raw = data && data[field.key];
      var value = raw == null ? NaN : Number(String(raw).replace(/,/g, '').trim());
      if (!isFinite(value) || value <= 0) throw new Error(field.label + ' مطلوب ويجب أن يكون أكبر من صفر');
    });
  }

  function validateBudgetCostingBundle_(header, lines) {
    if (!String(header && header['اسم_المورد'] || '').trim()) throw new Error('المورد مطلوب');
    if (!Array.isArray(lines) || !lines.length) throw new Error('أضف بند مشتريات واحداً على الأقل');
    var isSale = String(header && header['نوع الشهادة'] || '').trim() === 'بيع';
    lines.forEach(function (line) {
      if (!String(line && line['المادة'] || '').trim()) throw new Error('المادة مطلوبة');
      if (!(Number(line['الكمية']) > 0)) throw new Error('الكمية مطلوبة (أكبر من صفر)');
      if (!(Number(line['قيمة التكلفة']) >= 0)) throw new Error('قيمة التكلفة مطلوبة');
      if (!String(line['المعاملة'] || '').trim()) throw new Error('المعاملة مطلوبة');
      if (isSale && !(Number(line['سعر البيع']) > 0)) throw new Error('سعر البيع مطلوب عندما يكون نوع الشهادة بيع');
    });
  }

  /** Helper to extract certificate number flexibly */
  function getCertNo_(r) {
    if (!r) return '';
    return String(r['رقم الشهاده'] || r['الرقم'] || r['رقم الشهادة'] || r['رقم_الشهاده'] || '').trim();
  }

  /** Delete purchasing lines for a certificate matching any common key header */
  function deletePurchasingLinesForCert_(dbId, cert) {
    const sheet = getSheet_(LEGAL_PURCHASING_SHEET, dbId);
    if (!sheet) return 0;
    let count = 0;
    count += deleteRowsByCriteria_(sheet, 'رقم الشهاده', cert);
    count += deleteRowsByCriteria_(sheet, 'الرقم', cert);
    count += deleteRowsByCriteria_(sheet, 'رقم الشهادة', cert);
    count += deleteRowsByCriteria_(sheet, 'رقم_الشهاده', cert);
    return count;
  }

  /** Shared line-append for costing bundles: maps line fields, applies auto-fills. */
  function writeCostingBundleLine_(dbId, header, line, user, cert) {
    const ship = String(header['نوع الشحن'] || '').trim();
    const lm = {};
    Object.keys(line).forEach(function (k) { lm[k.trim().toLowerCase()] = line[k]; });
    lm['قيمة التكلفة'] = Number(line['قيمة التكلفة']) || 0;
    lm['الكمية'] = Number(line['الكمية']) || 0;
    lm['رقم الشهاده'] = cert;
    lm['الرقم'] = cert;
    lm['نوع البند'] = ship === 'محلي' ? 'محلي' : 'مستورد';
    lm['تفاصيل بند'] = String(header['اسم_المورد'] || line['تفاصيل بند'] || '').trim();
    lm['تاريخ الدخول'] = String(header['تاريخ الافراج'] || line['تاريخ الدخول'] || '').trim();
    const prodDate = String(line['تاريخ الانتاج'] || '').trim() || budgetDateStr_(new Date());
    let expDate = String(line['تاريخ الانتهاء'] || '').trim();
    if (!expDate && prodDate) {
      const d = new Date(prodDate);
      if (!isNaN(d.getTime())) {
        d.setFullYear(d.getFullYear() + 3);
        expDate = budgetDateStr_(d);
      }
    }
    lm['تاريخ الانتاج'] = prodDate;
    lm['تاريخ الانتهاء'] = expDate || budgetDateStr_(new Date());
    lm['المعاملة'] = String(line['المعاملة'] || 'مشتريات').trim();
    lm['سعر البيع'] = line['سعر البيع'] !== undefined && line['سعر البيع'] !== '' ? Number(line['سعر البيع']) : '';
    lm['user'] = (user && user.email) || '';
    var _bundleLineFileIds = attachmentIdsForFields_(dbId, LEGAL_PURCHASING_SHEET, line || {}, ['شهادة_تحليل_ان_وجد', 'ترخيص_بالافراج_الزراعي', 'صورة الافراج', 'صورة التسجيل']);
    Object.keys(_bundleLineFileIds).forEach(function (k) { lm[k] = _bundleLineFileIds[k]; });
    writeBudgetRow_(dbId, LEGAL_PURCHASING_SHEET, lm, {
      'كود المعاملة': '=CONCATENATE(I{r},"-",B{r},"-",E{r},"-",TEXT(F{r},"DD/MM/YYYY"))',
      'قيمة البيع': '=G{r}',
      'تسوية البيع': '=K{r}',
      'تكلفة الوحدة': '=H{r}/G{r}'
    });
  }

  function addLegalCostingBundle_(data, user, dbId) {
    const header = (data && data.header) || {};
    const lines = (data && data.lines) || [];
    const cert = String(header['رقم الشهاده'] || header['الرقم'] || '').trim();
    if (!cert) throw new Error('رقم الشهادة مطلوب');
    if (!String(header['تاريخ الافراج'] || '').trim()) throw new Error('تاريخ الافراج مطلوب');
    if (!String(header['الصنف'] || '').trim()) throw new Error('الصنف مطلوب');
    if (!String(header['نوع الشهادة'] || '').trim()) throw new Error('نوع الشهادة مطلوب');
    if (!String(header['نوع الشحن'] || '').trim()) throw new Error('نوع الشحن مطلوب');
    validateBudgetCostingBundle_(header, lines);
    validateBudgetMonth_(header['تم_الاقرار_شهر']);
    validateBudgetExchangeValues_(header);
    const exists = getAllRecords_(dbId, LEGAL_COSTING_SHEET).some(function (c) {
      return getCertNo_(c) === cert;
    });
    if (exists) throw new Error('رقم الشهادة مستخدم بالفعل: ' + cert);
    ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'الرقم');
    ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'رقم الشهاده');
    const valueMap = {};
    Object.keys(header).forEach(function (k) { valueMap[k.trim().toLowerCase()] = header[k]; });
    valueMap['رقم الشهاده'] = cert;
    valueMap['user'] = (user && user.email) || '';
    const formulaMap = legalCostingFormulaMap_();
    var headerRow = writeBudgetRow_(dbId, LEGAL_COSTING_SHEET, valueMap, formulaMap);
    let saved = 0;
    var savedLines = [];
    lines.forEach(function (line) {
      const item = String(line['المادة'] || '').trim();
      if (!item) throw new Error('المادة مطلوبة');
      if (!(Number(line['الكمية']) > 0)) throw new Error('الكمية مطلوبة (أكبر من صفر)');
      if (!(Number(line['قيمة التكلفة']) >= 0)) throw new Error('قيمة التكلفة مطلوبة');
      writeCostingBundleLine_(dbId, header, line, user, cert);
      saved++;
      // build enriched line as getLegalInputs does
      var enrichedLine = {};
      Object.keys(line).forEach(function(k){ enrichedLine[k]=line[k]; });
      enrichedLine['رقم الشهاده'] = cert;
      enrichedLine['الرقم'] = cert;
      enrichedLine['نوع البند'] = String(header['نوع الشحن'] || '').trim() === 'محلي' ? 'محلي' : 'مستورد';
      enrichedLine['تفاصيل بند'] = String(header['اسم_المورد'] || line['تفاصيل بند'] || '').trim();
      enrichedLine['تاريخ الدخول'] = String(header['تاريخ الافراج'] || line['تاريخ الدخول'] || '').trim();
      enrichedLine['المعاملة'] = String(line['المعاملة'] || 'مشتريات').trim();
      enrichedLine['user'] = (user && user.email) || '';
      savedLines.push(enrichedLine);
    });
    try { logHistory_(dbId, LEGAL_COSTING_SHEET, valueMap.record_uid || ('create_'+LEGAL_COSTING_SHEET+'_'+cert), String(cert), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
    try { savedLines.forEach(function(l){ logHistory_(dbId, LEGAL_PURCHASING_SHEET, l.record_uid || ('create_'+LEGAL_PURCHASING_SHEET+'_'+cert+'_'+String(l['المادة'])), String(cert), (user&&user.email)||'', 'create', l, null); }); } catch(e){}
    var savedHeader = {};
    Object.keys(header).forEach(function(k){ savedHeader[k]=header[k]; });
    savedHeader['رقم الشهاده'] = cert;
    savedHeader['_sheetRow'] = headerRow;
    savedHeader['user'] = (user && user.email) || '';
    return { status: 'success', message: 'تمت إضافة الشهادة و ' + saved + ' بند مشتريات', record: savedHeader, records: savedLines, lines: savedLines, data: { assignedId: cert } };
  }

  function editLegalCostingBundle_(data, user, dbId) {
    if (!(user && user.isSuperAdmin)) throw new Error('التعديل مسموح فقط للمشرف العام');
    const header = (data && data.header) || {};
    const lines = (data && data.lines) || [];
    const cert = String(header['رقم الشهاده'] || header['الرقم'] || '').trim();
    if (!cert) throw new Error('رقم الشهادة مطلوب');
    if (!String(header['اسم_المورد'] || '').trim()) throw new Error('المورد مطلوب');
    validateBudgetCostingBundle_(header, lines);
    validateBudgetMonth_(header['تم_الاقرار_شهر']);
    validateBudgetExchangeValues_(header);
    var __oldCostBundle = null; try { __oldCostBundle = getAllRecords_(dbId, LEGAL_COSTING_SHEET).find(function(r){ return getCertNo_(r)===cert; }) || null; } catch(eVb){}
    var __costVer = checkRowVersion_(__oldCostBundle, header.version !== undefined ? header.version : (data && data.version));
    const sheet = getSheet_(LEGAL_COSTING_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const formulaMap = legalCostingFormulaMap_();
    const formulaKeys = Object.keys(formulaMap).map(function (k) { return String(k).toLowerCase(); });
    const updates = {};
    Object.keys(header).forEach(function (k) {
      const key = String(k).trim().toLowerCase();
      if (formulaKeys.indexOf(key) !== -1) return;
      updates[key] = header[k];
    });
    updates.version = __costVer + 1;
    const values = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === cert) { rowIndex = i; break; }
    }
    if (rowIndex === -1) throw new Error('الشهادة غير موجودة: ' + cert);
    ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'الرقم');
    ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'رقم الشهاده');
    headers.forEach(function (h, col) {
      const key = String(h).trim().toLowerCase();
      if (formulaKeys.indexOf(key) === -1 && updates[key] !== undefined) {
        sheet.getRange(rowIndex + 1, col + 1).setValue(updates[key]);
        noteMutation_(sheet);
      }
    });
    SpreadsheetApp.flush();
    deletePurchasingLinesForCert_(dbId, cert);
    var savedLinesE = [];
    if (lines.length) {
      lines.forEach(function (line) {
        const item = String(line['المادة'] || '').trim();
        if (!item) throw new Error('المادة مطلوبة');
        if (!(Number(line['الكمية']) > 0)) throw new Error('الكمية مطلوبة (أكبر من صفر)');
        if (!(Number(line['قيمة التكلفة']) >= 0)) throw new Error('قيمة التكلفة مطلوبة');
        writeCostingBundleLine_(dbId, header, line, user, cert);
        var enrichedLineE = {};
        Object.keys(line).forEach(function(k){ enrichedLineE[k]=line[k]; });
        enrichedLineE['رقم الشهاده'] = cert;
        enrichedLineE['الرقم'] = cert;
        enrichedLineE['نوع البند'] = String(header['نوع الشحن'] || '').trim() === 'محلي' ? 'محلي' : 'مستورد';
        enrichedLineE['تفاصيل بند'] = String(header['اسم_المورد'] || line['تفاصيل بند'] || '').trim();
        enrichedLineE['تاريخ الدخول'] = String(header['تاريخ الافراج'] || line['تاريخ الدخول'] || '').trim();
        enrichedLineE['المعاملة'] = String(line['المعاملة'] || 'مشتريات').trim();
        enrichedLineE['user'] = (user && user.email) || '';
        savedLinesE.push(enrichedLineE);
      });
    }
    headers.forEach(function (h, col) {
      var formula = formulaMap[String(h).trim()];
      if (formula) {
        sheet.getRange(rowIndex + 1, col + 1).setFormula(formula.replace(/\{r\}/g, String(rowIndex + 1)));
        noteMutation_(sheet);
      }
    });
    SpreadsheetApp.flush();
    var savedHeaderE = {};
    Object.keys(header).forEach(function(k){ savedHeaderE[k]=header[k]; });
    savedHeaderE['رقم الشهاده'] = cert;
    savedHeaderE['user'] = (user && user.email) || '';
    try { var _oldCostE = getAllRecords_(dbId, LEGAL_COSTING_SHEET).find(function(r){ return getCertNo_(r)===cert; }) || header; var _uidCostE = _oldCostE && _oldCostE.record_uid ? _oldCostE.record_uid : 'create_'+LEGAL_COSTING_SHEET+'_'+cert; var _newCostE = {}; Object.keys(header).forEach(function(k){ _newCostE[k]=header[k]; }); logHistory_(dbId, LEGAL_COSTING_SHEET, _uidCostE, String(cert), (user&&user.email)||'', 'update', _newCostE, _oldCostE); } catch(e){}
    try { savedLinesE.forEach(function(l){ logHistory_(dbId, LEGAL_PURCHASING_SHEET, l.record_uid || ('create_'+LEGAL_PURCHASING_SHEET+'_'+cert+'_'+String(l['المادة'])), String(cert), (user&&user.email)||'', 'create', l, null); }); } catch(e){}
    return { status: 'success', message: 'تم تحديث الشهادة وبنودها', record: savedHeaderE, records: savedLinesE, lines: savedLinesE, data: { assignedId: cert } };
  }

  function deleteLegalCosting_(data, user, dbId) {
    if (!(user && user.isSuperAdmin)) throw new Error('الحذف مسموح فقط للمشرف العام');
    const cert = String((data && data['رقم الشهاده']) || (data && data['الرقم']) || (data && data.cert) || '').trim();
    if (!cert) throw new Error('رقم الشهادة مطلوب');
    var _oldDelCost = null; try { _oldDelCost = getAllRecords_(dbId, LEGAL_COSTING_SHEET).find(function(r){ return getCertNo_(r)===cert; }) || null; } catch(e2){}
    const linesDeleted = deletePurchasingLinesForCert_(dbId, cert);
    let headerDeleted = deleteRowsByCriteria_(getSheet_(LEGAL_COSTING_SHEET, dbId), 'رقم الشهاده', cert);
    if (!headerDeleted) {
      headerDeleted = deleteRowsByCriteria_(getSheet_(LEGAL_COSTING_SHEET, dbId), 'رقم الشهادة', cert);
    }
    if (!headerDeleted) {
      headerDeleted = deleteRowsByCriteria_(getSheet_(LEGAL_COSTING_SHEET, dbId), 'الرقم', cert);
    }
    if (!headerDeleted) throw new Error('الشهادة غير موجودة: ' + cert);
    try { var _uidDelCost = _oldDelCost && _oldDelCost.record_uid ? _oldDelCost.record_uid : 'create_'+LEGAL_COSTING_SHEET+'_'+cert; logHistory_(dbId, LEGAL_COSTING_SHEET, _uidDelCost, String(cert), (user&&user.email)||'', 'delete', null, _oldDelCost); } catch(e){}
    return { status: 'success', message: 'تم حذف الشهادة و ' + linesDeleted + ' بند' };
  }

  function getLegalManufacture_(data, user, dbId) {
    var items = getAllRecords_(dbId, LEGAL_MANUFACTURE_SHEET).slice().reverse();
    var limit = Number(data && data.limit) || 20;
    if (!data || !data.loadAll) items = items.slice(0, limit);
    return { status: 'success', items: items };
  }

  function addLegalManufacture_(data, user, dbId) {
    var _manufactureFileIds = attachmentIdsForFields_(dbId, LEGAL_MANUFACTURE_SHEET, data || {}, ['analysis_certificate', 'sales_permit', 'technical_permit', 'registration']);
    const product = String(data.produced_product || '').trim();
    if (!product) throw new Error('المنتج المنتج مطلوب');
    if (!(Number(data.manufactured_qty) > 0)) throw new Error('الكمية المنتجة مطلوبة');
    if (!String(data.manufcture_number || '').trim()) throw new Error('رقم التشغيلة مطلوب');
    if (!String(data.manufacture_date || '').trim()) throw new Error('تاريخ التصنيع مطلوب');
    if (!String(data.item_1 || '').trim()) throw new Error('المادة الأولى مطلوبة');
    if (!(Number(data.qty_1) > 0)) throw new Error('كمية المادة الأولى مطلوبة');
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
    Object.keys(_manufactureFileIds).forEach(function (k) { valueMap[k] = _manufactureFileIds[k]; });
    valueMap['transaction_type'] = 'التصنيع الداخلي';
    valueMap['user'] = (user && user.email) || '';
    const formulaMap = {
      'transaction_code': '=CONCATENATE(B{r},"-",C{r},"-",E{r},"-",TEXT(D{r},"DD/MM/YYYY"))',
      'code': '=CONCATENATE("M -",Row()-1)',
      'dep_qty': '=ROUNDDOWN(F{r}*0.02,0)',
      'net_qty': '=ROUNDDOWN(F{r}-W{r},0)',
      'total_cost': buildManufactureTotalCost_('{r}'),
      'sales_amount': '=Z{r}*(1+Y{r})',
      'sales_price': '=AA{r}/X{r}'
    };
    var rowNum = writeBudgetRow_(dbId, LEGAL_MANUFACTURE_SHEET, valueMap, formulaMap);
    try { logHistory_(dbId, LEGAL_MANUFACTURE_SHEET, valueMap.record_uid || ('create_'+LEGAL_MANUFACTURE_SHEET+'_'+rowNum), String(rowNum), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
    var savedRecord = {};
    Object.keys(data).forEach(function(k){ savedRecord[k] = data[k]; });
    savedRecord['transaction_type'] = 'التصنيع الداخلي';
    savedRecord['transaction_code'] = String(data.produced_product||'') + '-' + String(data.manufcture_number||'') + '-' + String(data.produced_product||'') + '-' + String(data.manufacture_date||'');
    savedRecord['manufactured_qty'] = Number(data.manufactured_qty) || 0;
    savedRecord['user'] = (user && user.email) || '';
    return { status: 'success', message: 'تمت إضافة عملية التصنيع', record: savedRecord, data: { assignedId: savedRecord['transaction_code'], rowNumber: rowNum } };
  }

  /* Row-edit repair (Stage 4): keyed manufacture correction. The sheet carries
   * no UID column, so the original transaction_code is the selector: it must
   * match exactly one row or the edit is refused (missing/ambiguous). Manual
   * validation mirrors addLegalManufacture_; only manual inputs are written
   * through the formula-safe patch helper, so calculated cells
   * (transaction_code, code, dep_qty, net_qty, total_cost, sales_amount,
   * sales_price) recompute from the corrected inputs and creation metadata is
   * preserved. Existing attachment pairs are retained unless a replacement
   * arrives through the trusted upload flow. */
  function updateLegalManufacture_(data, user, dbId) {
    if (!(user && user.isSuperAdmin)) throw new Error('التعديل مسموح فقط للمشرف العام');
    var originalCode = String((data && data.original_transaction_code) || '').trim();
    if (!originalCode) throw new Error('كود المعاملة الأصلي مطلوب');
    const product = String(data.produced_product || '').trim();
    if (!product) throw new Error('المنتج المنتج مطلوب');
    if (!(Number(data.manufactured_qty) > 0)) throw new Error('الكمية المنتجة مطلوبة');
    if (!String(data.manufcture_number || '').trim()) throw new Error('رقم التشغيلة مطلوب');
    if (!String(data.manufacture_date || '').trim()) throw new Error('تاريخ التصنيع مطلوب');
    if (!String(data.item_1 || '').trim()) throw new Error('المادة الأولى مطلوبة');
    if (!(Number(data.qty_1) > 0)) throw new Error('كمية المادة الأولى مطلوبة');

    var sheet = getSheet_(LEGAL_MANUFACTURE_SHEET, dbId);
    var matches = getAllRecords_(dbId, LEGAL_MANUFACTURE_SHEET).filter(function (r) {
      return String(r.transaction_code || '').trim() === originalCode;
    });
    if (!matches.length) throw new Error('السجل غير موجود');
    if (matches.length > 1) throw new Error('كود المعاملة مكرر — يلزم مراجعة السجل قبل التعديل');
    var oldRow = matches[0];

    var merged = Object.assign({}, data);
    ['analysis_certificate', 'sales_permit', 'technical_permit', 'registration'].forEach(function (k) {
      if ((merged[k] == null || String(merged[k]).trim() === '') && oldRow[k]) {
        merged[k] = oldRow[k];
        var oldIdKey = k + '_id';
        if (oldRow[oldIdKey]) merged[oldIdKey] = oldRow[oldIdKey];
      }
    });
    var fileIds = attachmentIdsForFields_(dbId, LEGAL_MANUFACTURE_SHEET, merged, ['analysis_certificate', 'sales_permit', 'technical_permit', 'registration']);

    var PROTECTED_MANF = ['transaction_code', 'code', 'dep_qty', 'net_qty', 'total_cost', 'sales_amount', 'sales_price', 'transaction_type', 'user', 'created_at', 'original_transaction_code'];
    var map = {};
    Object.keys(merged).forEach(function (k) {
      var key = String(k).trim().toLowerCase();
      if (PROTECTED_MANF.indexOf(key) !== -1) return;
      map[key] = merged[k];
    });
    Object.keys(fileIds).forEach(function (k) { map[k] = fileIds[k]; });
    var __manfVer = checkRowVersion_(oldRow, data.version !== undefined ? data.version : merged.version);
    map.version = __manfVer + 1;
    var result;
    executeWithLock_(function () {
      if (!patchRowByCriteria_(sheet, 'transaction_code', originalCode, map)) throw new Error('السجل غير موجود');
      try { logHistory_(dbId, LEGAL_MANUFACTURE_SHEET, oldRow.record_uid || ('update_' + LEGAL_MANUFACTURE_SHEET + '_' + originalCode), originalCode, (user && user.email) || '', 'update', map, oldRow); } catch (e) {}
      var savedUpdated = {};
      Object.keys(merged).forEach(function (k) { savedUpdated[k] = merged[k]; });
      savedUpdated['transaction_type'] = 'التصنيع الداخلي';
      savedUpdated['transaction_code'] = String(product) + '-' + String(data.manufcture_number || '') + '-' + String(product) + '-' + String(data.manufacture_date || '');
      savedUpdated['manufactured_qty'] = Number(data.manufactured_qty) || 0;
      result = { status: 'success', message: 'تم تحديث عملية التصنيع', record: savedUpdated, data: { assignedId: savedUpdated['transaction_code'] } };
    });
    return result;
  }

  function getLegalInvoices_(data, user, dbId) {
    const month = Number(data.month);
    const year = Number(data.year);
    const fromDate = String(data.from_date || data.fromDate || '').trim();
    const toDate = String(data.to_date || data.toDate || '').trim();
    const search = String(data.search || '').trim().toLowerCase();
    const offset = Math.max(0, Number(data.offset) || 0);
    const limit = Math.min(10000, Math.max(1, Number(data.limit) || 200));
    const all = getAllRecords_(dbId, LEGAL_INVOICES_SHEET);
    const yearSet = {};
    all.forEach(function (r) { const y = String(r['العام'] || '').trim(); if (y) yearSet[y] = true; });
    let rows = all;
    if (Number.isInteger(month) && month >= 1 && month <= 12) rows = rows.filter(r => Number(r['الشهر']) === month);
    if (Number.isInteger(year) && year >= 2000) rows = rows.filter(r => Number(r['العام']) === year);
    if (fromDate) {
      rows = rows.filter(function (r) {
        const d = String(r['تاريخ الفاتورة'] || '').trim();
        return d && d >= fromDate;
      });
    }
    if (toDate) {
      rows = rows.filter(function (r) {
        const d = String(r['تاريخ الفاتورة'] || '').trim();
        return d && d <= toDate;
      });
    }
    if (search) {
      var normSearch = String(data.search || '').trim().toLowerCase().replace(/[\s\-_/.]+/g, '');
      rows = rows.filter(function (r) {
        var invRaw = String(r['رقم الفاتورة'] || '').toLowerCase();
        var invNorm = String(r['رقم الفاتورة'] || '').trim().toLowerCase().replace(/[\s\-_/.]+/g, '');
        var invMatch = invRaw.indexOf(search) !== -1 || (normSearch && invNorm.indexOf(normSearch) !== -1);
        return String(r['اسم العميل'] || '').toLowerCase().indexOf(search) !== -1 ||
          String(r['إسم المنتج'] || '').toLowerCase().indexOf(search) !== -1 ||
          invMatch;
      });
    }
    rows = rows.slice().sort(function (a, b) {
      function invParts(v) {
        const m = String(v || '').trim().match(/^(\d+)\s*-\s*(\d+)$/);
        return m ? { s: Number(m[1]), y: Number(m[2]) } : { s: 0, y: 0 };
      }
      const A = invParts(a['رقم الفاتورة']);
      const B = invParts(b['رقم الفاتورة']);
      if (B.y !== A.y) return B.y - A.y;
      return B.s - A.s;
    });
    const total = rows.length;
    return {
      status: 'success',
      items: rows.slice(offset, offset + limit),
      total: total,
      offset: offset,
      limit: limit,
      years: Object.keys(yearSet).sort()
    };
  }

  function addLegalInvoice_(data, user, dbId) {
    /* Phase 1: numbering via the shared locked counter must hold the lock. */
    return executeWithLock_(function () {
    const cust = String(data['اسم العميل'] || '').trim();
    if (!cust) throw new Error('اسم العميل مطلوب');
    const code = String(data['كود المعاملة المباعة'] || '').trim();
    if (!code) throw new Error('كود المعاملة المباعة مطلوب');
    const dateStr = String(data['تاريخ الفاتورة'] || '').trim();
    if (!dateStr) throw new Error('تاريخ الفاتورة مطلوب');
    if (!(Number(data['كمية المنتج']) > 0)) throw new Error('كمية المنتج يجب أن تكون أكبر من صفر');
    const year = Number(data['العام']) || (parseDate_(dateStr).getFullYear()) || new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000) throw new Error('العام غير صحيح');
    /* Phase 6 — Valley parity: replay guard before numbering, so a retried
     * save returns the committed row instead of allocating a second invoice
     * number. Fires when the client sends request_key/unique_id AND the
     * sheet carries the key (probes are null-safe otherwise); persisting a
     * request_key column is deferred — no schema change this phase. */
    const _reqKeyLI = String(data['request_key'] || data['unique_id'] || '').trim();
    if (_reqKeyLI) {
      var _seenLI = null;
      try { _seenLI = requestDedupeExecute_(dbId, LEGAL_INVOICES_SHEET, _reqKeyLI, _reqKeyLI); } catch (eGuardLI) { _seenLI = null; }
      if (_seenLI) return liveDedupeReply_(_seenLI, 'تمت إضافة الفاتورة');
    }
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
    var invNo = nextInvoiceNumber_(dbId, year);
    valueMap['رقم الفاتورة'] = invNo;
    valueMap['ميزان حسابي - 26 - 1'] = 5;
    valueMap['نوع الضريبة (سلع عامة 1/سلع جدول 2)'] = 2;
    valueMap['نوع البيان (سلعة 3/خدمة 4/تسويات 5)'] = 3;
    valueMap['نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7 /  سلع الجدول  مراجعة الإرشادات )'] = 14;
    valueMap['user'] = (user && user.email) || '';
    valueMap['version'] = 0;
    const formulaMap = {
      'رقم التسجيل الضريبي للعميل': '=IFERROR(INDEX(legal_customer_vendor!E:E,MATCH(F{r},legal_customer_vendor!B:B,0)),"")',
      'إسم المنتج': '=IFERROR(VLOOKUP(A{r},legal_current_products!$A:$B,2,0),"")',
      'كود المنتج': '=IFERROR(INDEX(legal_products!E:E,MATCH(M{r},legal_products!B:B,0)),"")',
      'وحدة قياس المنتج': '=IFERROR(INDEX(legal_products!F:F,MATCH(M{r},legal_products!B:B,0)),"")',
      'سعر الوحدة': '=ROUND(IFERROR(SUMIFS(legal_product_purchasing!$K:$K,legal_product_purchasing!$A:$A,A{r})/SUMIFS(legal_product_purchasing!$G:$G,legal_product_purchasing!A:A,A{r}),SUMIFS(legal_products_movement!$N:$N,legal_products_movement!A:A,A{r},legal_products_movement!$C:$C,"انتاج")),2)',
      'نوع سلع الجدول (لايوجد 0/جدول أولا 1/جدول ثانيا 2)': '=IF(S{r}=0.05,1,0)',
      'المبلغ الصافي': '=T{r}*R{r}',
      'قيمة الضريبة': '=U{r}*S{r}',
      'إجمالي': '=V{r}+U{r}',
      'الشهر': '=MONTH(L{r})',
      'العام': '=YEAR(L{r})'
    };
    writeBudgetRow_(dbId, LEGAL_INVOICES_SHEET, valueMap, formulaMap);
    try { logHistory_(dbId, LEGAL_INVOICES_SHEET, valueMap.record_uid || ('create_'+LEGAL_INVOICES_SHEET+'_'+invNo), String(invNo), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
    var qty = Number(data['كمية المنتج']) || 0;
    var unitPrice = 0;
    try { var cp = getAllRecords_(dbId, LEGAL_CURRENT_SHEET).find(function(c){ return String(c.transaction_code)===String(code); }); if(cp) unitPrice = 0; } catch(e){}
    var savedRecord = {
      'رقم الفاتورة': invNo,
      'اسم العميل': cust,
      'كود المعاملة المباعة': code,
      'تاريخ الفاتورة': dateStr,
      'كمية المنتج': qty,
      'سعر الوحدة': unitPrice,
      'فئة الضريبة (14%/5%)': String(data['فئة الضريبة (14%/5%)']||''),
      'المبلغ الصافي': 0,
      'قيمة الضريبة': 0,
      'إجمالي': 0,
      'الشهر': new Date(dateStr).getMonth()+1,
      'العام': year,
      'user': (user && user.email) || ''
    };
    Object.keys(data).forEach(function(k){ savedRecord[k] = data[k]; });
    savedRecord['رقم الفاتورة'] = invNo;
    return { status: 'success', message: 'تمت إضافة الفاتورة', record: savedRecord, data: { assignedId: invNo } };
    });
  }

  function getLegalCash_(data, user, dbId) {
    const type = String(data.transaction_type || '').trim();
    const method = String(data.transaction_method || '').trim();
    const box = String(data.related_box || '').trim();
    const offset = Math.max(0, Number(data.offset) || 0);
    const limit = Math.min(500, Math.max(1, Number(data.limit) || 200));
    let rows = getAllRecords_(dbId, LEGAL_CASH_SHEET);
    if (type) rows = rows.filter(r => String(r.transaction_type || '').trim() === type);
    if (method) rows = rows.filter(r => String(r.transaction_method || '').trim() === method);
    if (box) rows = rows.filter(r => String(r.related_box || '').trim() === box);
    rows.sort(function (a, b) { return (Number(b.transaction_id) || 0) - (Number(a.transaction_id) || 0); });
    const total = rows.length;
    const summary = { debit: 0, credit: 0, count: total };
    const boxMap = {};
    rows.forEach(function (r) {
      const t = Number(r.transaction_amount) || 0;
      if (String(r.transaction_type || '').indexOf('Debit') !== -1) summary.debit += t;
      else if (String(r.transaction_type || '').indexOf('Credit') !== -1) summary.credit += t;
      const b = String(r.related_box || '').trim();
      if (!b) return;
      if (!boxMap[b]) boxMap[b] = 0;
      boxMap[b] += Number(r.balance_amount) || 0;
    });
    const boxes = Object.keys(boxMap).map(function (b) {
      return { box: b, balance: boxMap[b], count: rows.filter(function (r) { return String(r.related_box || '').trim() === b; }).length };
    }).sort(function (a, b) { return String(a.box).localeCompare(String(b.box), 'ar'); });
    return { status: 'success', items: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit, summary: summary, boxes: boxes };
  }

  function addLegalCash_(data, user, dbId) {
    const details = String(data.transaction_details || '').trim();
    if (!details) throw new Error('التفاصيل مطلوبة');
    if (!(Number(data.transaction_amount) > 0)) throw new Error('المبلغ مطلوب');
    const type = String(data.transaction_type || '').trim();
    if (!type) throw new Error('نوع الحركة مطلوب');
    if (!String(data.transaction_date || '').trim()) throw new Error('التاريخ مطلوب');
    if (!String(data.name || '').trim()) throw new Error('الاسم مطلوب');
    if (!String(data.related_box || '').trim()) throw new Error('الصندوق مطلوب');
    return executeWithLock_(function () {
      const rows = getAllRecords_(dbId, LEGAL_CASH_SHEET);
      let maxId = 0;
      rows.forEach(function (r) { const n = Number(r.transaction_id); if (Number.isInteger(n) && n > maxId) maxId = n; });
const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
    valueMap['transaction_id'] = maxId + 1;
    valueMap['transaction_date'] = String(data.transaction_date || '').trim().replace('T', ' ');
    valueMap['user'] = (user && user.email) || '';
    valueMap['company'] = 'توب كيميكال';
    const formulaMap = {
      'balance_amount': '=IF(K{r}="Debit Note",J{r}*-1,IF(K{r}="Credit",J{r}*-1,J{r}))',
      'chart_account_main': '=VLOOKUP(N{r},chart_of_accounts!N:O,2,0)'
    };
    writeBudgetRow_(dbId, LEGAL_CASH_SHEET, valueMap, formulaMap);
    try { logHistory_(dbId, LEGAL_CASH_SHEET, valueMap.record_uid || ('create_'+LEGAL_CASH_SHEET+'_'+(maxId+1)), String(maxId+1), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
    var txnAmt = Number(data.transaction_amount) || 0;
    var bal = (type === 'Debit Note' || type === 'Credit') ? -txnAmt : txnAmt;
    var savedRecord = {
      transaction_id: maxId + 1,
      name: String(data.name || '').trim(),
      transaction_details: details,
      transaction_date: String(data.transaction_date || '').trim().replace('T', ' '),
      transaction_amount: txnAmt,
      total_discount: Number(data.total_discount) || 0,
      taxes: Number(data.taxes) || 0,
      net_amount: Number(data.net_amount) || txnAmt,
      total: Number(data.total) || txnAmt,
      transaction_type: type,
      related_box: String(data.related_box || '').trim(),
      transaction_method: String(data.transaction_method || '').trim(),
      chart_code: String(data.chart_code || '').trim(),
      balance_amount: bal,
      chart_account_main: '',
      approved: data.approved,
      user: (user && user.email) || ''
    };
    return { status: 'success', message: 'تمت إضافة الحركة', record: savedRecord, data: { assignedId: maxId + 1, transaction_id: maxId + 1 } };
    });
  }

  var COLLECTION_FORMULA_MAP = {
    'balance_amount': '=IF(K{r}="Debit Note",J{r}*-1,IF(K{r}="Credit",J{r}*-1,J{r}))',
    'chart_account_main': '=VLOOKUP(N{r},chart_of_accounts!N:O,2,0)'
  };

  function buildCollectionValueMap_(invoice, transactionId, user) {
    var customerName = String(invoice['اسم العميل'] || invoice['العميل'] || '').trim();
    var rawInvDate = invoice['تاريخ الفاتورة'] || invoice['تاريخ'];
    var invDate = normalizeDateStr_(rawInvDate) || budgetDateStr_(new Date());
    var netAmount = Number(invoice['المبلغ الصافي'] || invoice['الصافي'] || invoice['إجمالي'] || 0) || 0;
    var invNo = String(invoice['رقم الفاتورة'] || '').trim();
    return {
      'transaction_id': transactionId,
      'invoice_id': invNo,
      'name': customerName,
      'transaction_details': 'تحصيلات مبيعات',
      'transaction_date': invDate,
      'transaction_amount': netAmount,
      'total_discount': 0,
      'taxes': 0,
      'net_amount': netAmount,
      'total': netAmount,
      'transaction_type': 'Debit',
      'related_box': '111102',
      'chart_code': 'ايرادات المبيعات-411101-ايرادات مبيعات المخزون التام',
      'transaction_method': 'Cash',
      'approved': true,
      'company': 'توب كيميكال',
      'user': (user && user.email) || ''
    };
  }

  function collectedInvoiceIdSet_(dbId) {
    var set = {};
    try {
      getAllRecords_(dbId, LEGAL_CASH_SHEET).forEach(function (r) {
        var k = String(r.invoice_id || r['invoice_id'] || '').trim();
        if (k) set[k] = true;
      });
    } catch (e) {}
    return set;
  }

  function findInvoiceById_(invoices, invId) {
    return invoices.find(function (i) {
      return String(i['رقم الفاتورة'] || '').trim() === invId ||
             String(i.unique_id || '').trim() === invId ||
             String(i.id || '').trim() === invId;
    });
  }

  function makeCollectionFromInvoice_(data, user, dbId) {
    const invId = String((data && (data.invoice_id || data.id || data.unique_id)) || '').trim();
    if (!invId) throw new Error('معرف أو رقم الفاتورة مطلوب');

    // Get all invoice records to find the target invoice
    const invoices = getAllRecords_(dbId, LEGAL_INVOICES_SHEET);
    const invoice = findInvoiceById_(invoices, invId);

    if (!invoice) throw new Error('الفاتورة غير موجودة برقم: ' + invId);

    const customerName = String(invoice['اسم العميل'] || invoice['العميل'] || '').trim();
    if (!customerName) throw new Error('اسم العميل غير موجود في الفاتورة');

    const rawInvDate = invoice['تاريخ الفاتورة'] || invoice['تاريخ'];
    const invDate = normalizeDateStr_(rawInvDate) || budgetDateStr_(new Date());
    const netAmount = Number(invoice['المبلغ الصافي'] || invoice['الصافي'] || invoice['إجمالي'] || 0) || 0;
    if (netAmount <= 0) throw new Error('المبلغ الصافي يجب أن يكون أكبر من الصفر');

    const invNo = String(invoice['رقم الفاتورة'] || invId).trim();

    return executeWithLock_(function () {
      const collected = collectedInvoiceIdSet_(dbId);
      if (collected[invNo]) throw new Error('تم تحصيل هذه الفاتورة مسبقاً: ' + invNo);
      const rows = getAllRecords_(dbId, LEGAL_CASH_SHEET);
      let maxId = 0;
      rows.forEach(function (r) {
        const n = Number(r.transaction_id);
        if (Number.isInteger(n) && n > maxId) maxId = n;
      });

      const valueMap = buildCollectionValueMap_(invoice, maxId + 1, user);

      const formulaMap = COLLECTION_FORMULA_MAP;

      writeBudgetRow_(dbId, LEGAL_CASH_SHEET, valueMap, formulaMap);
      try { logHistory_(dbId, LEGAL_CASH_SHEET, valueMap.record_uid || ('create_'+LEGAL_CASH_SHEET+'_'+(maxId+1)), String(maxId+1), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
      return { status: 'success', message: 'تم إنشاء عملية التحصيل بنجاح برقم حركة: ' + (maxId + 1), data: { transaction_id: maxId + 1 } };
    });
  }

  function makeCollectionsFromInvoices_(data, user, dbId) {
    var raw = data ? (data.invoice_ids || data.invoiceIds || data.ids) : null;
    var ids = [];
    if (Object.prototype.toString.call(raw) === '[object Array]') {
      ids = raw.map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
    } else if (typeof raw === 'string' && raw.trim()) {
      ids = raw.split(',').map(function (v) { return String(v || '').trim(); }).filter(Boolean);
    } else {
      var single = String((data && (data.invoice_id || data.id || data.unique_id)) || '').trim();
      if (single) ids = [single];
    }
    // De-dupe while preserving order.
    var seen = {};
    ids = ids.filter(function (v) { if (seen[v]) return false; seen[v] = true; return true; });
    if (!ids.length) throw new Error('اختر فاتورة واحدة على الأقل');
    if (ids.length > 500) throw new Error('الحد الأقصى 500 فاتورة في العملية الواحدة');

    return executeWithLock_(function () {
      var invoices = getAllRecords_(dbId, LEGAL_INVOICES_SHEET);
      var cashRows = getAllRecords_(dbId, LEGAL_CASH_SHEET);
      var collected = {};
      cashRows.forEach(function (r) {
        var k = String(r.invoice_id || '').trim();
        if (k) collected[k] = true;
      });
      var maxId = 0;
      cashRows.forEach(function (r) {
        var n = Number(r.transaction_id);
        if (Number.isInteger(n) && n > maxId) maxId = n;
      });
      var collectedOut = [];
      var skipped = [];
      var failed = [];
      ids.forEach(function (invId) {
        if (collected[invId]) { skipped.push({ id: invId, reason: 'تم تحصيله مسبقاً' }); return; }
        var invoice = findInvoiceById_(invoices, invId);
        if (!invoice) { failed.push({ id: invId, reason: 'الفاتورة غير موجودة' }); return; }
        var invNo = String(invoice['رقم الفاتورة'] || invId).trim();
        if (collected[invNo]) { skipped.push({ id: invNo, reason: 'تم تحصيله مسبقاً' }); return; }
        var customerName = String(invoice['اسم العميل'] || invoice['العميل'] || '').trim();
        if (!customerName) { failed.push({ id: invNo, reason: 'اسم العميل غير موجود في الفاتورة' }); return; }
        var netAmount = Number(invoice['المبلغ الصافي'] || invoice['الصافي'] || invoice['إجمالي'] || 0) || 0;
        if (!(netAmount > 0)) { failed.push({ id: invNo, reason: 'المبلغ الصافي يجب أن يكون أكبر من الصفر' }); return; }
        maxId += 1;
        var valueMap = buildCollectionValueMap_(invoice, maxId, user);
        try {
          writeBudgetRow_(dbId, LEGAL_CASH_SHEET, valueMap, COLLECTION_FORMULA_MAP);
          try { logHistory_(dbId, LEGAL_CASH_SHEET, valueMap.record_uid || ('create_'+LEGAL_CASH_SHEET+'_'+maxId), String(maxId), (user && user.email) || '', 'create', valueMap, null); } catch (e) {}
          collected[invNo] = true;
          collectedOut.push(invNo);
        } catch (e) {
          maxId -= 1;
          failed.push({ id: invNo, reason: (e && e.message) || 'فشل الحفظ' });
        }
      });
      var msg = 'تم تحصيل ' + collectedOut.length + ' فاتورة';
      if (skipped.length) msg += '، وتجاوز ' + skipped.length + ' محصلة مسبقاً';
      if (failed.length) msg += '، وفشل ' + failed.length;
      return { status: 'success', message: msg, data: { collected: collectedOut, skipped: skipped, failed: failed } };
    });
  }

  function toggleLegalCashApproved_(data, user, dbId) {
    const id = Number((data && data.transaction_id));
    if (!Number.isInteger(id) || id <= 0) throw new Error('رقم الحركة مطلوب');
    const sheet = getSheet_(LEGAL_CASH_SHEET, dbId);
    const rows = getAllRecords_(dbId, LEGAL_CASH_SHEET);
    let current = null;
    rows.forEach(function (r) { if (Number(r.transaction_id) === id) current = r; });
    if (!current) throw new Error('الحركة غير موجودة: ' + id);
    const val = String(current.approved || '').trim().toUpperCase();
    const next = val === 'TRUE' ? false : true;
    /* Phase 2: boolean toggle false<->true via table (no inline cur check retained). */
    assertTransition_('tc_legal_cash', val === 'TRUE' ? 'true' : 'false', next ? 'true' : 'false', 'تحويل حالة الاعتماد غير صالح');
    var __cashVer = checkRowVersion_(current, data && data.version);
    patchRowByCriteria_(sheet, 'transaction_id', id, { approved: next, version: __cashVer + 1 });
    try { var _uidCashAp = current && current.record_uid ? current.record_uid : 'create_'+LEGAL_CASH_SHEET+'_'+id; var _newCashAp = {}; if(current) Object.keys(current).forEach(function(k){ _newCashAp[k]=current[k]; }); _newCashAp.approved = next; logHistory_(dbId, LEGAL_CASH_SHEET, _uidCashAp, String(id), (user&&user.email)||'', 'approve', _newCashAp, current); } catch(e){}
    return { status: 'success', message: next ? 'تم اعتماد الحركة' : 'تم إلغاء الاعتماد' };
  }

  // legal_employee_info schema (AppSheet truth source):
  // Employee_Code(Number,Key,autoincrement) Employee_name(Name) title(Ref title_index)
  // section(Ref dept_section_index) gross_salary/allow(Decimal) Hiring_Date/Birth_Date(Date,TODAY())
  // National_ID/Insusrance_number/insurance_place(Number) Address(Address)
  // age(Decimal,ReadOnly,sheet fn round((TODAY()-Birth_Date)/365,2))
  // Military_status(Text->enum dropdown) Insurance_Status(Yes/No)
  // Vacation_Limit(Enum 21/30) Gender(Enum Male/Female) status(Enum يعمل بالشركة/استقالة/معاش/الوفاة)
  const LEGAL_EMP_GENDER_OPTS = ['Male', 'Female'];
  const LEGAL_EMP_GENDER_AR = { 'ذكر': 'Male', 'أنثى': 'Female', 'Male': 'Male', 'Female': 'Female' };
  const LEGAL_EMP_STATUS_OPTS = ['يعمل بالشركة', 'استقالة', 'معاش', 'الوفاة'];
  const LEGAL_EMP_VACATION_OPTS = ['21', '30'];
  const LEGAL_EMP_MILITARY_OPTS = ['أدى الخدمة', 'إعفاء', 'مؤجل', 'معاف', 'لم يحدد'];
  const LEGAL_EMP_INSURANCE_OPTS = [{ value: 'TRUE', label: 'مؤمن' }, { value: 'FALSE', label: 'غير مؤمن' }];

  function legalEmployeeAge_(birthVal) {
    var d = parseDate_(birthVal);
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    var today = new Date(); today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    var age = (today.getTime() - d.getTime()) / (365 * 24 * 60 * 60 * 1000);
    return Math.round(age * 100) / 100;
  }

  function legalSectionOptions_(dbId) {
    return tcRefs_(dbId, 'tc_legal_sections_opts', function () {
      var seen = {};
      try {
        getAllRecords_(dbId, 'dept_section_index').forEach(function (r) {
          var s = String(r.section != null ? r.section : (r['القسم'] != null ? r['القسم'] : '')).trim();
          if (s) seen[s] = true;
        });
      } catch (e) {}
      try {
        titleOptions_(dbId).forEach(function (o) { if (o.section) seen[String(o.section).trim()] = true; });
      } catch (e) {}
      return Object.keys(seen).map(function (s) { return { value: s, label: s }; })
        .sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    });
  }

  // Normalise mixed-case AppSheet column headers (e.g. "Employee_Code" -> "employee_code")
  // so the client can use consistent lowercase key access everywhere.
  function legalNormalizeKeys_(records) {
    return records.map(function (e) {
      var norm = {};
      Object.keys(e).forEach(function (k) { norm[k.trim().toLowerCase()] = e[k]; });
      return norm;
    });
  }

  function getLegalHr_(data, user, dbId) {
    var nextCode = null;
    try { nextCode = peekNextId_(dbId, LEGAL_EMPLOYEES_SHEET, 'employee_code'); } catch (e) {}
    var employees = legalNormalizeKeys_(getAllRecords_(dbId, LEGAL_EMPLOYEES_SHEET));
    // Collect unique non-empty insurance_place values from existing records.
    var ipSeen = {};
    employees.forEach(function (e) {
      var v = String(e.insurance_place != null ? e.insurance_place : '').trim();
      if (v) ipSeen[v] = true;
    });
    var insurancePlaceOpts = Object.keys(ipSeen).sort(function (a, b) {
      return String(a).localeCompare(String(b), 'ar');
    }).map(function (v) { return { value: v, label: v }; });
    return {
      status: 'success',
      employees: employees,
      title_options: titleOptions_(dbId),
      section_options: legalSectionOptions_(dbId),
      next_code: nextCode,
      gender_options: [{ value: 'ذكر', label: 'ذكر' }, { value: 'أنثى', label: 'أنثى' }],
      status_options: LEGAL_EMP_STATUS_OPTS.map(function (v) { return { value: v, label: v }; }),
      vacation_options: LEGAL_EMP_VACATION_OPTS.map(function (v) { return { value: v, label: v }; }),
      military_options: LEGAL_EMP_MILITARY_OPTS.map(function (v) { return { value: v, label: v }; }),
      insurance_options: LEGAL_EMP_INSURANCE_OPTS,
      insurance_place_options: insurancePlaceOpts
    };
  }

  function addLegalEmployee_(data, user, dbId) {
    data = data || {};
    const name = String(data.Employee_name || data.employee_name || '').trim();
    if (!name) throw new Error('اسم الموظف مطلوب');

    const title = String(data.title || '').trim();
    if (!title) throw new Error('المسمى الوظيفي مطلوب');

    var section = String(data.section || '').trim();
    if (title && !section) {
      try {
        var hit = titleOptions_(dbId).filter(function (x) { return String(x.value) === title; })[0];
        if (hit && hit.section) section = String(hit.section);
      } catch (e) {}
    }
    if (!section) throw new Error('القسم مطلوب');

    if (data.gross_salary === '' || data.gross_salary == null || isNaN(Number(data.gross_salary))) throw new Error('الراتب الأساسي مطلوب ويجب أن يكون رقماً');
    const gross = Number(data.gross_salary);

    if (data.allow === '' || data.allow == null || isNaN(Number(data.allow))) throw new Error('البدلات مطلوبة ويجب أن تكون رقماً');
    const allow = Number(data.allow);

    const hireRaw = data.Hiring_Date != null ? data.Hiring_Date : data.hiring_date;
    if (!hireRaw) throw new Error('تاريخ التعيين مطلوب');

    const natId = String(data.National_ID != null ? data.National_ID : (data.national_id != null ? data.national_id : '')).trim();
    if (!/^\d{14}$/.test(natId)) throw new Error('الرقم القومي مطلوب ويجب أن يتكون من 14 رقماً بالضبط');

    const address = String(data.Address || data.address || '').trim();
    if (!address) throw new Error('العنوان مطلوب');

    const birthRaw = data.Birth_Date != null ? data.Birth_Date : data.birth_date;
    if (!birthRaw) throw new Error('تاريخ الميلاد مطلوب');

    const insNum = String(data.Insusrance_number != null ? data.Insusrance_number : (data.insusrance_number != null ? data.insusrance_number : (data.insurance_number != null ? data.insurance_number : ''))).trim();
    if (!insNum || !/^\d+$/.test(insNum)) throw new Error('رقم التأمين مطلوب ويجب أن يكون رقماً صحيحاً');

    const insPlace = String(data.insurance_place || '').trim();
    if (!insPlace) throw new Error('جهة التأمين مطلوبة');

    const mil = String(data.Military_status != null ? data.Military_status : (data.military_status != null ? data.military_status : '')).trim();
    if (!mil) throw new Error('حالة التجنيد مطلوبة');

    const genderAr = String(data.Gender != null ? data.Gender : (data.gender != null ? data.gender : '')).trim();
    if (!genderAr) throw new Error('النوع مطلوب');
    const gender = LEGAL_EMP_GENDER_AR[genderAr] || genderAr;

    const status = String(data.status || '').trim();
    if (!status) throw new Error('الحالة الوظيفية مطلوبة');
    if (LEGAL_EMP_STATUS_OPTS.indexOf(status) === -1) throw new Error('الحالة الوظيفية غير صالحة');

    const vac = String(data.Vacation_Limit != null ? data.Vacation_Limit : (data.vacation_limit != null ? data.vacation_limit : '')).trim();
    if (!vac || !/^\d+$/.test(vac)) throw new Error('رصيد الإجازات مطلوب ويجب أن يكون رقماً صحيحاً');

    var insRaw = String(data.Insurance_Status != null ? data.Insurance_Status : (data.insurance_status != null ? data.insurance_status : '')).trim();
    var insBool = hrBool_(data.Insurance_Status != null ? data.Insurance_Status : data.insurance_status);
    if (/^(مؤمن|TRUE|true|1|yes)$/i.test(insRaw)) insBool = true;
    else if (/^(غير مؤمن|غير_مؤمن|FALSE|false|0|no)$/i.test(insRaw)) insBool = false;

    return executeWithLock_(function () {
      const code = getNextIdUnderLock_(dbId, LEGAL_EMPLOYEES_SHEET, 'employee_code');
      var age = legalEmployeeAge_(birthRaw);

      const rec = {};
      Object.keys(data).forEach(function (k) { rec[k.trim().toLowerCase()] = data[k]; });
      rec['employee_code'] = code;
      rec['employee_name'] = name;
      rec['title'] = title;
      rec['section'] = section;
      rec['gross_salary'] = gross;
      rec['allow'] = allow;
      rec['hiring_date'] = hireRaw;
      rec['national_id'] = natId;
      rec['address'] = address;
      rec['birth_date'] = birthRaw;
      rec['age'] = age;
      rec['insusrance_number'] = parseInt(insNum, 10);
      rec['insurance_number'] = parseInt(insNum, 10);
      rec['military_status'] = mil;
      rec['insurance_status'] = insBool;
      rec['vacation_limit'] = parseInt(vac, 10);
      rec['gender'] = gender;
      rec['status'] = status;
      rec['insurance_place'] = insPlace;

      var resLE = appendRow_(dbId, LEGAL_EMPLOYEES_SHEET, rec);
      try { logHistory_(dbId, LEGAL_EMPLOYEES_SHEET, rec.record_uid || ('create_' + LEGAL_EMPLOYEES_SHEET + '_' + code), String(code), (user && user.email) || '', 'create', rec, null); } catch (e) {}
      try { bustTcRefs_(dbId); } catch (e) {}
      var savedLE = {}; Object.keys(rec).forEach(function (k) { savedLE[k] = rec[k]; });
      savedLE['employee_code'] = code; savedLE['employee_name'] = name;
      resLE.record = savedLE;
      resLE.data = { assignedId: code };
      return resLE;
    });
  }

  const LEGAL_MONTH_ARABIC = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  function legalSalaryTax_(pool) {
    pool = Number(pool) || 0;
    if (pool <= 0) return 0;
    if (pool <= 21000) return 0;
    if (pool <= 30000) return 0;
    if (pool <= 45000) return Math.round((pool - 30000) * 0.10 * 100) / 100;
    if (pool <= 60000) return Math.round(((pool - 45000) * 0.15 + 1500) * 100) / 100;
    if (pool <= 200000) return Math.round(((pool - 60000) * 0.20 + 3750) * 100) / 100;
    if (pool <= 400000) return Math.round(((pool - 200000) * 0.225 + 31750) * 100) / 100;
    if (pool <= 600000) return Math.round(((pool - 400000) * 0.25 + 76750) * 100) / 100;
    if (pool <= 700000) return Math.round(((pool - 400000) * 0.25 + 77500) * 100) / 100;
    if (pool <= 800000) return Math.round(((pool - 400000) * 0.25 + 79750) * 100) / 100;
    if (pool <= 900000) return Math.round(((pool - 400000) * 0.25 + 82000) * 100) / 100;
    if (pool <= 1200000) return Math.round(((pool - 400000) * 0.25 + 90000) * 100) / 100;
    return Math.round(((pool - 1200000) * 0.275 + 300000) * 100) / 100;
  }

  function deptClassificationMap_(dbId) {
    return tcRefs_(dbId, 'tc_dept_classification_map', function () {
      var map = {};
      try {
        getAllRecords_(dbId, 'dept_section_index').forEach(function (r) {
          var s = String(r.section != null ? r.section : (r['القسم'] != null ? r['القسم'] : (r.id != null ? r.id : ''))).trim();
          var c = String(r.department != null ? r.department : (r.classification != null ? r.classification : (r['تصنيف_القسم'] || r['الإدارة'] || ''))).trim();
          if (s && c) map[s] = c;
        });
      } catch (e) {}
      return map;
    });
  }

  function legalMonthOptions_(dbId) {
    return tcRefs_(dbId, 'tc_legal_month_opts', function () {
      var map = {};
      try {
        getAllRecords_(dbId, 'data_validation_hr').forEach(function (r) {
          var num = Number(r.month_number != null ? r.month_number : (r['رقم_الشهر'] != null ? r['رقم_الشهر'] : r.A));
          var name = String(r.month_arabic_name != null ? r.month_arabic_name : (r.month_name != null ? r.month_name : (r['اسم_الشهر'] || ''))).trim();
          if (num >= 1 && num <= 12 && name) map[num] = name;
        });
      } catch (e) {}
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (n) {
        return { value: n, label: map[n] || LEGAL_MONTH_ARABIC[n] };
      });
    });
  }

  function legalMonthArabicName_(monthNum, dbId) {
    monthNum = Number(monthNum);
    if (dbId) {
      try {
        var opts = legalMonthOptions_(dbId);
        var hit = opts.find(function (o) { return Number(o.value) === monthNum; });
        if (hit && hit.label) return hit.label;
      } catch (e) {}
    }
    return LEGAL_MONTH_ARABIC[monthNum] || '';
  }

  function legalSalaryCompute_(emp, inputs, dbId) {
    emp = emp || {};
    inputs = inputs || {};
    var code = Number(emp.employee_code || inputs.employee_code);
    var name = String(emp.employee_name || inputs.employee_name || '').trim();
    var gross = Number(emp.gross_salary != null ? emp.gross_salary : inputs.gross_salary) || 0;
    var allow = Number(emp.allow != null ? emp.allow : (emp.emp_allow != null ? emp.emp_allow : inputs.emp_allow)) || 0;
    var dept = String(emp.section || emp.employee_dept || inputs.employee_dept || '').trim();

    var insVal = emp.insurance_status != null ? emp.insurance_status : emp.Insurance_Status;
    var isInsured = (insVal === true || insVal === 'TRUE' || insVal === 'true' || insVal === 'مؤمن' || insVal === 1 || insVal === '1');

    var age = (emp.age != null && emp.age !== '') ? Number(emp.age) : (emp.birth_date ? legalEmployeeAge_(emp.birth_date) : 0);

    var type = String(inputs.transaction_type || 'salaries').trim();
    if (type !== 'salaries' && type !== 'Bonus') type = 'salaries';

    var compIns = 0;
    var empIns = 0;
    if (type === 'Bonus') {
      compIns = 0;
      empIns = 0;
    } else if (isInsured) {
      if (age > 60) {
        compIns = Math.round(gross * 0.0475 * 100) / 100;
        empIns = Math.round(gross * 0.01 * 100) / 100;
      } else {
        compIns = Math.round(gross * 0.1875 * 100) / 100;
        empIns = Math.round(gross * 0.11 * 100) / 100;
      }
    }

    var loan = Number(inputs.emp_loan) || 0;
    var others = Number(inputs.emp_others) || 0;
    var penalties = Number(inputs.emp_penalties) || 0;

    var taxPool = Math.round((gross + allow - empIns - 1250) * 12 * 100) / 100;
    var tax = legalSalaryTax_(taxPool);

    var net = Math.round((gross + allow - loan - empIns - tax - others - penalties) * 100) / 100;

    var month = Number(inputs.payroll_month);
    var year = Number(inputs.payroll_year);
    var monthStr = month < 10 ? '0' + month : String(month);
    var payrollDate = year + '-' + monthStr + '-28';

    var monthAr = legalMonthArabicName_(month, dbId);

    var classification = '';
    if (dbId && dept) {
      try {
        var map = deptClassificationMap_(dbId);
        classification = map[dept] || '';
      } catch (e) {}
    }

    return {
      employee_code: code,
      employee_name: name,
      gross_salary: gross,
      comp_insurance: compIns,
      emp_insurance: empIns,
      emp_allow: allow,
      emp_loan: loan,
      tax_pool: taxPool,
      emp_tax: tax,
      emp_others: others,
      emp_penalties: penalties,
      emp_net_salary: net,
      month_arabic_name: monthAr,
      payroll_month: month,
      payroll_year: year,
      payroll_date: payrollDate,
      employee_dept: dept,
      dept_classification: classification,
      transaction_type: type,
      tax_period: 'period 5'
    };
  }

  function getLegalSalaries_(data, user, dbId) {
    data = data || {};
    const month = Number(data.payroll_month);
    const year = Number(data.payroll_year);
    // Normalize mixed-case AppSheet headers on salary rows (e.g. "Employee_Code" -> "employee_code").
    let rows = legalNormalizeKeys_(getAllRecords_(dbId, LEGAL_SALARIES_SHEET));
    if (Number.isInteger(month) && month >= 1 && month <= 12) rows = rows.filter(r => Number(r.payroll_month) === month);
    if (Number.isInteger(year) && year >= 2000) rows = rows.filter(r => Number(r.payroll_year) === year);

    // Normalize mixed-case AppSheet headers before processing employee fields.
    var employees = legalNormalizeKeys_(getAllRecords_(dbId, LEGAL_EMPLOYEES_SHEET));
    var deptMap = deptClassificationMap_(dbId);
    var empOpts = employees.map(function (e) {
      var code = Number(e.employee_code);
      var gross = Number(e.gross_salary) || 0;
      var allow = Number(e.allow != null ? e.allow : (e.emp_allow != null ? e.emp_allow : 0));
      var dept = String(e.section || e.employee_dept || '').trim();
      var insVal = e.insurance_status;
      var isIns = (insVal === true || insVal === 'TRUE' || insVal === 'true' || insVal === 'مؤمن' || insVal === 1 || insVal === '1');
      var age = (e.age != null && e.age !== '') ? Number(e.age) : (e.birth_date ? legalEmployeeAge_(e.birth_date) : 0);
      return {
        value: code,
        label: String(code) + ' - ' + (e.employee_name || ''),
        employee_code: code,
        employee_name: e.employee_name || '',
        gross_salary: gross,
        emp_allow: allow,
        section: dept,
        employee_dept: dept,
        dept_classification: deptMap[dept] || '',
        insurance_status: isIns,
        age: age,
        birth_date: e.birth_date || ''
      };
    });

    var monthOpts = legalMonthOptions_(dbId);

    return {
      status: 'success',
      items: rows,
      month_options: monthOpts,
      transaction_options: [
        { value: 'salaries', label: 'salaries' },
        { value: 'Bonus', label: 'Bonus' }
      ],
      employee_options: empOpts
    };
  }

  function addLegalSalary_(data, user, dbId) {
    data = data || {};
    const code = Number(data.employee_code);
    if (!code || code <= 0) throw new Error('كود الموظف مطلوب');
    const month = Number(data.payroll_month);
    const year = Number(data.payroll_year);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('شهر المرتب مطلوب');
    if (!Number.isInteger(year) || year < 2000) throw new Error('سنة المرتب مطلوبة');
    var type = String(data.transaction_type || 'salaries').trim();
    if (type !== 'salaries' && type !== 'Bonus') {
      if (type === 'مرتب شهري') type = 'salaries';
      else if (type === 'مكافأة') type = 'Bonus';
      else throw new Error('نوع المعاملة يجب أن يكون salaries أو Bonus');
    }

    var employees = legalNormalizeKeys_(getAllRecords_(dbId, LEGAL_EMPLOYEES_SHEET));
    var emp = employees.find(function (e) { return Number(e.employee_code) === code; });
    if (!emp) throw new Error('الموظف غير موجود');

    return executeWithLock_(function () {
      if (type === 'salaries') {
        var existing = legalNormalizeKeys_(getAllRecords_(dbId, LEGAL_SALARIES_SHEET));
        var dup = existing.some(function (r) {
          return Number(r.employee_code) === code &&
                 Number(r.payroll_month) === month &&
                 Number(r.payroll_year) === year &&
                 String(r.transaction_type || 'salaries') === 'salaries';
        });
        if (dup) throw new Error('تم تسجيل مرتب هذا الشهر للموظف مسبقاً');
      }

      var computed = legalSalaryCompute_(emp, {
        employee_code: code,
        payroll_month: month,
        payroll_year: year,
        transaction_type: type,
        emp_loan: Number(data.emp_loan) || 0,
        emp_others: Number(data.emp_others) || 0,
        emp_penalties: Number(data.emp_penalties) || 0
      }, dbId);

      const rec = {};
      Object.keys(computed).forEach(function (k) { rec[k.trim().toLowerCase()] = computed[k]; });
      var resLS = appendRow_(dbId, LEGAL_SALARIES_SHEET, rec);
      try {
        var _codeLS = String(code);
        logHistory_(dbId, LEGAL_SALARIES_SHEET, rec.record_uid || ('create_' + LEGAL_SALARIES_SHEET + '_' + _codeLS + '_' + Date.now()), String(_codeLS), (user && user.email) || '', 'create', rec, null);
      } catch (e) {}
      var savedLS = {}; Object.keys(rec).forEach(function (k) { savedLS[k] = rec[k]; });
      resLS.record = savedLS;
      resLS.data = { assignedId: code };
      return resLS;
    });
  }

  function getIncomeStatement_(data, user, dbId) {
    const year = Number(data.year);
    let rows = getAllRecords_(dbId, LEGAL_INCOME_SHEET);
    if (Number.isInteger(year) && year >= 2000) rows = rows.filter(r => Number(r['العام']) === year);
    return { status: 'success', items: rows };
  }

  // =========================================
  // ملفات Drive بأسلوب AppSheet: مجلد لكل جدول "<table>_Files_" بجوار الجدول،
  // والخانة تخزن المسار النسبي "<Folder>/<filename>".
  // =========================================
  const UPLOAD_META = {
    'products': { uid: COMPANY_UID, page: 'tc_products', folder: 'products_Files_' },
    'registration_papers': { uid: COMPANY_UID, page: 'tc_registration_papers', folder: 'registration_papers 2_Files_' },
    'purchasing_support_data': { uid: COMPANY_UID, page: 'tc_carton_sizes', folder: 'purchasing_support_data_Images' },
    'legal_importation_follow': {
      uid: COMPANY_UID,
      page: 'tc_import_follow',
      folder: 'legal_importation_follow_Files_',
      folderByField: {
        'porforma_file': 'legal_importation_follow_Files_',
        'swift_file': 'legal_importation_follow_Files_',
        'approval_1': 'legal_importation_follow_Images',
        'approval_2': 'legal_importation_follow_Images',
        'approval_3': 'legal_importation_follow_Images'
      }
    },
    'legal_purchasing_costing': {
      uid: COMPANY_UID,
      page: 'tc_budget_inputs',
      folder: 'legal_purchasing_costing_Files_',
      folderByField: {
        'invoice_swift': 'legal_purchasing_costing_Files_'
      }
    },
    'legal_product_purchasing': {
      uid: COMPANY_UID,
      page: 'tc_budget_inputs',
      folder: 'legal_product_purchasing_Files_',
      folderByField: {
        'شهادة_تحليل_ان_وجد': 'legal_product_purchasing_Files_',
        'ترخيص_بالافراج_الزراعي': 'legal_product_purchasing_Files_',
        'صورة الافراج': 'legal_product_purchasing_Files_',
        'صورة التسجيل': 'legal_product_purchasing_Files_'
      }
    },
    'legal_manufacture': {
      uid: COMPANY_UID,
      page: 'tc_budget_manufacture',
      folder: 'legal_manufacture_Files_',
      folderByField: {
        'analysis_certificate': 'manufacture_Images',
        'sales_permit': 'manufacture_Images',
        'technical_permit': 'manufacture_Images',
        'registration': 'legal_manufacture_Files_'
      }
    },
    'customs_office_transactions': {
      uid: COMPANY_UID,
      page: 'tc_customs_office',
      folder: 'customs_office_Files_'
    }
  };

  function attachmentIdsForFields_(dbId, sheetName, data, fileFields) {
    var out = {}, source = data || {};
    (fileFields || []).forEach(function (ff) {
      var fid = (typeof attachmentPickFileId_ === 'function') ? String(attachmentPickFileId_(source, ff) || '').trim() : '';
      var ref = source[ff] != null ? String(source[ff]).trim() : '';
      if (!fid && ref && source[ff + '_id'] && typeof attachmentAuthorizedStoredId_ === 'function') fid = attachmentAuthorizedStoredId_(dbId, sheetName, source, ff, source[ff + '_id']);
      if (ref && !fid) throw new Error('لم يتم تثبيت معرف Drive للمرفق ' + ff + '؛ أعد رفع الملف ثم احفظ السجل.');
      if (Object.prototype.hasOwnProperty.call(source, ff)) out[ff + '_id'] = fid;
      if (fid) {
        if (typeof ensureAttachmentColumn_ === 'function' && !ensureAttachmentColumn_(dbId, sheetName, ff + '_id')) {
          var check = getHeaders_(getSheet_(sheetName, dbId)).map(function (h) { return String(h).trim().toLowerCase(); });
          if (check.indexOf(String(ff + '_id').toLowerCase()) === -1) throw new Error('تعذر تجهيز عمود ارتباط المرفق ' + ff + '_id');
        }
      }
    });
    return out;
  }

  function ensureDriveFolderId_(folderName) {
    const cache = CacheService.getScriptCache();
    const key = 'uploadfolder_' + folderName;
    try {
      const cachedId = cache.get(key);
      if (cachedId) return cachedId;
    } catch (e) {}

    // 1. Try Advanced Drive API v3 (Drive.Files.list / Drive.Files.create)
    try {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
        const q = "name = '" + folderName.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        const res = Drive.Files.list({ q: q, fields: 'files(id, name)' });
        if (res && res.files && res.files.length > 1) throw new Error('مجلد Google Drive مكرر: ' + folderName);
        if (res && res.files && res.files.length === 1) {
          const folderId = res.files[0].id;
          try { cache.put(key, folderId, 21600); } catch (e) {}
          return folderId;
        }
        const created = Drive.Files.create({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        });
        if (created && created.id) {
          try { cache.put(key, created.id, 21600); } catch (e) {}
          return created.id;
        }
      }
    } catch (advErr) {
      console.warn('Advanced Drive API folder lookup failed: ' + advErr.message);
    }

    // 2. Fallback via UrlFetchApp REST API (bypasses DriveApp permissions)
    try {
      const token = ScriptApp.getOAuthToken();
      const q = "name = '" + folderName.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
      const searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)';
      const searchRes = UrlFetchApp.fetch(searchUrl, {
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });
      if (searchRes.getResponseCode() === 200) {
        const data = JSON.parse(searchRes.getContentText());
        if (data.files && data.files.length > 1) throw new Error('مجلد Google Drive مكرر: ' + folderName);
        if (data.files && data.files.length === 1) {
          const folderId = data.files[0].id;
          try { cache.put(key, folderId, 21600); } catch (e) {}
          return folderId;
        }
      }
      const createRes = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
        muteHttpExceptions: true
      });
      if (createRes.getResponseCode() === 200 || createRes.getResponseCode() === 201) {
        const created = JSON.parse(createRes.getContentText());
        try { cache.put(key, created.id, 21600); } catch (e) {}
        return created.id;
      }
    } catch (restErr) {
      console.warn('UrlFetchApp Drive REST API failed: ' + restErr.message);
    }

    throw new Error('تعذر العثور على مجلد حفظ الملفات أو إنشائه في Google Drive');
  }

  function uploadDriveFileRest_(folderId, blob, fileName, requestId) {
    /* Private request tag for idempotent recovery (Drive appProperties are
       visible only to this app; the file is never made public). */
    var reqProps = (/^[A-Za-z0-9_-]{16,100}$/.test(String(requestId || '')))
      ? { erpRequestId: String(requestId) } : null;
    // 1. Try Advanced Drive API v3 (Drive.Files.create)
    try {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.create) {
        const resource = {
          name: fileName,
          parents: [folderId]
        };
        if (reqProps) resource.appProperties = reqProps;
        const created = Drive.Files.create(resource, blob);
        if (created && created.id) return created;
      }
    } catch (advErr) {
      console.warn('Drive.Files.create failed, trying UrlFetchApp multipart: ' + advErr.message);
    }

    // 2. Fallback via UrlFetchApp Multipart Upload (bypasses DriveApp permission locks)
    const token = ScriptApp.getOAuthToken();
    const metadata = { name: fileName, parents: [folderId] };
    if (reqProps) metadata.appProperties = reqProps;
    const boundary = '-------' + Utilities.getUuid();
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";
    const contentType = blob.getContentType() || 'application/octet-stream';
    const base64Data = Utilities.base64Encode(blob.getBytes());

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: ' + contentType + '\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      close_delim;

    const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      headers: { Authorization: 'Bearer ' + token },
      payload: body,
      muteHttpExceptions: true
    });

    if (response.getResponseCode() === 200 || response.getResponseCode() === 201) {
      return JSON.parse(response.getContentText());
    }
    throw new Error('فشل رفع الملف إلى Google Drive (' + response.getResponseCode() + '): ' + response.getContentText());
  }

  function hhmmss_() {
    const d = new Date();
    const p = function (n) { return ('0' + n).slice(-2); };
    return p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function buildUploadName_(sheet, o, ext) {
    const ts = hhmmss_();
    if (sheet === 'products') {
      const id = String((o && o.id) || 'file').trim();
      return id + '.print_file.' + ts + (ext ? '.' + ext : '');
    }
    if (sheet === 'legal_importation_follow') {
      const id = String((o && o.id) || 'file').trim();
      const field = String((o && o.field) || 'file').trim();
      return id + '.' + field + '.' + ts + (ext ? '.' + ext : '');
    }
    if (sheet === 'purchasing_support_data') {
      const id = String((o && o.id) || 'file').trim();
      return id + '.document.' + ts + (ext ? '.' + ext : '');
    }
    const raw = String((o && o.name) || 'file').trim() || 'file';
    const clean = raw.replace(/[\\/:*?"<>|]/g, '_');
    return clean + '.document_file.' + ts + (ext ? '.' + ext : '');
  }

  function uniqueDriveName_(fileName) {
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    const ts = hhmmss_();
    const rand = Utilities.getUuid().replace(/-/g, '').slice(0, 6);
    return base + '_' + ts + '_' + rand + ext;
  }

  function mimeForExt_(ext) {
    const map = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg'
    };
    return map[ext] || 'application/octet-stream';
  }

  /** استقبال الملف base64 عبر router (add_upload_file) وحفظه بأسلوب AppSheet. */
  function addUploadFile_(data, user, dbId, ctx) {
    const sheet = String((data && data.sheet) || '').trim();
    const cfg = UPLOAD_META[sheet];
    const requestId = String((ctx && ctx.requestId) || '').trim();
    /* Deterministic pre-mutation checks first: these failures prove nothing
       was written, so they are marked notApplied (safe to correct and retry)
       instead of uncertain. Only errors raised before any mutation may carry
       that marker. */
    const notApplied = function (message) { const e = new Error(message); e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED'; throw e; };
    if (!cfg) notApplied('الجدول غير معروف');
    if (!(user && user.isSuperAdmin) && !unifiedCheck_(user, COMPANY_UID, cfg.page, 'write')) {
      notApplied('لا يوجد صلاحية لإضافة سجلات في هذه الصفحة');
    }
    const filename = String((data && data.filename) || '').trim();
    if (!filename) notApplied('اسم الملف مطلوب');
    const dot = filename.lastIndexOf('.');
    const ext = (dot > 0 ? filename.slice(dot + 1) : '').toLowerCase();
    const allowedExt = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    if (allowedExt.indexOf(ext) === -1) {
      notApplied('نوع الملف غير مسموح (pdf, word, png, jpg فقط)');
    }
    const b64 = String((data && data.base64) || '').replace(/\s/g, '');
    if (!b64) notApplied('لا يوجد ملف');
    const bytes = Utilities.base64Decode(b64);
    if (bytes.length > 10 * 1024 * 1024) {
      notApplied('حجم الملف يتجاوز 10 ميجابايت');
    }
    const field = String((data && data.field) || '').trim();
    const folderName = (cfg.folderByField && cfg.folderByField[field]) || cfg.folder;
    const folderId = ensureDriveFolderId_(folderName);
    /* Idempotent recovery: a retry carrying the same client request ID finds
       the file created by the unconfirmed attempt (folder-scoped appProperties
       lookup — never a global filename search) instead of uploading again. */
    if (/^[A-Za-z0-9_-]{16,100}$/.test(requestId) && typeof findDriveFileByRequestId_ === 'function') {
      var prior = null;
      try { prior = findDriveFileByRequestId_(folderId, requestId); } catch (ePrior) { prior = null; }
      if (prior && prior.id) {
        var priorRef = folderName + '/' + (prior.name || filename);
        try { CacheService.getScriptCache().put('attid_' + priorRef, prior.id, 21600); } catch (eCache) {}
        return { status: 'success', reference: priorRef, fileId: prior.id, recovered: true };
      }
    }
    let newName = buildUploadName_(sheet, data, ext);
    newName = uniqueDriveName_(newName);

    const blob = Utilities.newBlob(bytes, mimeForExt_(ext), newName);
    const created = uploadDriveFileRest_(folderId, blob, newName, requestId);
    var fileId = (created && created.id) ? String(created.id) : '';
    var reference = folderName + '/' + newName;
    if (!fileId) throw new Error('تم رفع الملف دون معرف Drive قابل للحفظ؛ لم يتم إنشاء ارتباط بالسجل.');
    if (fileId) {
      try { CacheService.getScriptCache().put('attid_' + reference, fileId, 21600); } catch (e) {}
    }

    return { status: 'success', reference: reference, fileId: fileId };
  }

  /**
   * Generates a multi-tab Excel (.xlsx) file formatted specifically for Egyptian VAT compliance
   * based on legal_product_purchasing (child) and legal_purchasing_costing (parent).
   */
  function exportVatPurchasingXlsx_(data, user, dbId) {
    const fromDate = String((data && (data.from_date || data.fromDate)) || '').trim();
    const toDate = String((data && (data.to_date || data.toDate)) || '').trim();
    const itemType = String((data && (data.item_type || data.itemType || data.item_category)) || '').trim().toLowerCase();
    const month = Number(data && data.month);
    const year = Number(data && data.year);
    const search = String((data && data.search) || '').trim().toLowerCase();

    const lines = getAllRecords_(dbId, LEGAL_PURCHASING_SHEET);
    const costings = getAllRecords_(dbId, LEGAL_COSTING_SHEET);
    const parties = tcLegalPartiesRaw_(dbId);

    // Index parent costing records by certificate number
    const costingMap = {};
    costings.forEach(function (c) {
      const k = getCertNo_(c);
      if (k) {
        costingMap[k.toLowerCase()] = c;
        costingMap[k.replace(/\s+/g, '').toLowerCase()] = c;
      }
    });

    // Index customer_vendor records by name for tax_id
    const taxIdMap = {};
    parties.forEach(function (p) {
      const name = String(p.name || '').trim().toLowerCase();
      if (name) {
        taxIdMap[name] = String(p.tax_id || '').trim();
        taxIdMap[name.replace(/\s+/g, '')] = String(p.tax_id || '').trim();
      }
    });

    // Filter child lines by all applied filters
    const filtered = lines.filter(function (l) {
      const cert = getCertNo_(l);
      const parent = costingMap[cert.toLowerCase()] || costingMap[cert.replace(/\s+/g, '').toLowerCase()] || {};
      
      // Date filter
      const entryDate = normalizeDateStr_(l['تاريخ الدخول'] || parent['تاريخ الافراج']);
      if (fromDate && entryDate && entryDate < fromDate) return false;
      if (toDate && entryDate && entryDate > toDate) return false;

      // نوع البند filter (محلي / مستورد)
      if (itemType) {
        const lineType = String(l['نوع البند'] || (parent['نوع الشحن'] === 'محلي' ? 'محلي' : 'مستورد') || '').trim().toLowerCase();
        if (lineType !== itemType && lineType.indexOf(itemType) === -1) return false;
      }

      // Month filter
      if (Number.isInteger(month) && month >= 1 && month <= 12) {
        const lineMonth = Number(parent['الشهر']) || (entryDate ? Number(entryDate.split('-')[1]) : 0);
        if (lineMonth !== month) return false;
      }

      // Year filter
      if (Number.isInteger(year) && year >= 2000) {
        const lineYear = Number(parent['العام']) || (entryDate ? Number(entryDate.split('-')[0]) : 0);
        if (lineYear !== year) return false;
      }

      // Search filter
      if (search) {
        const cLower = cert.toLowerCase();
        const itemLower = String(l['المادة'] || parent['الصنف'] || '').toLowerCase();
        const suppLower = String(l['تفاصيل بند'] || parent['اسم_المورد'] || '').toLowerCase();
        if (cLower.indexOf(search) === -1 && itemLower.indexOf(search) === -1 && suppLower.indexOf(search) === -1) {
          return false;
        }
      }

      return true;
    });

    // Create a temporary Google Spreadsheet — single sheet, clean headers + data only
    const tempName = 'VAT_Purchasing_Export_' + Utilities.getUuid();
    const ss = SpreadsheetApp.create(tempName);
    const ssId = ss.getId();

    try {
      // ══════════════════════════════════════════════════════════
      // SHEET: المشتريات الضريبية — header row 1, data from row 2
      // ══════════════════════════════════════════════════════════
      const sheet1 = ss.getActiveSheet();
      sheet1.setName('المشتريات الضريبية');
      sheet1.setRightToLeft(true);

      // Single header row (Row 1)
      const headers = [
        'نوع المستند',
        'نوع الضريبة',
        'نوع سلع الجدول',
        'رقم الفاتورة',
        'اسم المورد',
        'رقم التسجيل الضريبي',
        'رقم الملف الضريبي للعميل',
        'العنوان',
        'رقم الموبيل',
        'تاريخ الفاتورة',
        'إسم المنتج',
        'كود المنتج',
        'نوع البيان',
        'نوع السلعة',
        'وحدة قياس المنتج',
        'سعر الوحدة',
        'فئة الضريبة',
        'الكمية',
        'المبلغ الصافي',
        'قيمة الضريبة',
        'إجمالي'
      ];

      sheet1.getRange(1, 1, 1, 21)
        .setValues([headers])
        .setBackground('#1F4E78')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setFontSize(11)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setWrap(true);
      /* [RT-5] Deliberately unstamped, and it must stay that way. sheet1 lives
       * in a throwaway spreadsheet this export creates for the user to
       * download; it is not a business table and nothing watches it. A stamp
       * here would put a version on a file that is deleted minutes later. The
       * bare call is kept only for the per-request memo. */
      noteMutation_();
      sheet1.setRowHeight(1, 34);

      // Data rows start at row 2
      const startRow = 2;
      const numItems = filtered.length;
      const dataRows = [];

      for (let i = 0; i < numItems; i++) {
        const l = filtered[i];
        const r = startRow + i;
        const cert = getCertNo_(l);
        const parent = costingMap[cert.toLowerCase()] || costingMap[cert.replace(/\s+/g, '').toLowerCase()] || {};
        const certType = String(parent['نوع الشهادة'] || '').trim();
        const isSale = certType === 'بيع';

        const supplier = String(l['تفاصيل بند'] || parent['اسم_المورد'] || '').trim();
        const supplierKey = supplier.toLowerCase();
        const taxId = taxIdMap[supplierKey] || taxIdMap[supplierKey.replace(/\s+/g, '')] || '';
        const entryDate = normalizeDateStr_(l['تاريخ الدخول'] || parent['تاريخ الافراج']);
        const item = String(l['المادة'] || '').trim();
        const qty = Number(l['الكمية']) || 0;
        const cost = Number(l['قيمة التكلفة']) || 0;
        const taxRate = isSale ? 14 : 0;

        dataRows.push([
          1,                                            // Col A: نوع المستند
          1,                                            // Col B: نوع الضريبة
          0,                                            // Col C: نوع سلع الجدول
          cert,                                         // Col D: رقم الفاتورة
          supplier,                                     // Col E: اسم المورد
          taxId,                                        // Col F: رقم التسجيل الضريبي
          '',                                           // Col G: رقم الملف الضريبي للعميل
          '',                                           // Col H: العنوان
          '',                                           // Col I: رقم الموبيل
          entryDate,                                    // Col J: تاريخ الفاتورة
          item,                                         // Col K: إسم المنتج
          '',                                           // Col L: كود المنتج
          1,                                            // Col M: نوع البيان
          3,                                            // Col N: نوع السلعة
          'وحدة',                                       // Col O: وحدة قياس المنتج
          '=IFERROR(S' + r + '/R' + r + ',0)',          // Col P: سعر الوحدة
          taxRate,                                      // Col Q: فئة الضريبة
          qty,                                          // Col R: الكمية
          cost,                                         // Col S: المبلغ الصافي
          isSale ? ('=S' + r + '*0.14') : 0,            // Col T: قيمة الضريبة
          isSale ? ('=S' + r + '+T' + r) : ('=S' + r)  // Col U: إجمالي
        ]);
      }

      if (dataRows.length > 0) {
        const dataRange = sheet1.getRange(startRow, 1, dataRows.length, 21);
        dataRange.setValues(dataRows);
        noteMutation_();

        // Zebra striping
        for (let i = 0; i < dataRows.length; i++) {
          if (i % 2 === 1) sheet1.getRange(startRow + i, 1, 1, 21).setBackground('#F9FAFB');
          sheet1.setRowHeight(startRow + i, 22);
        }

        // Borders
        dataRange.setBorder(true, true, true, true, true, true, '#D1D5DB', SpreadsheetApp.BorderStyle.SOLID);

        // Number formatting
        sheet1.getRange(startRow, 16, dataRows.length, 1).setNumberFormat('#,##0.00');  // سعر الوحدة
        sheet1.getRange(startRow, 17, dataRows.length, 1).setNumberFormat('0"%"');      // فئة الضريبة
        sheet1.getRange(startRow, 18, dataRows.length, 1).setNumberFormat('#,##0.000'); // الكمية
        sheet1.getRange(startRow, 19, dataRows.length, 3).setNumberFormat('#,##0.00');  // الصافي، الضريبة، الإجمالي

        // AutoFilter on header row
        sheet1.getRange(1, 1, dataRows.length + 1, 21).createFilter();
      }

      // Auto-resize columns
      for (let c = 1; c <= 21; c++) {
        sheet1.autoResizeColumn(c);
        if (sheet1.getColumnWidth(c) < 90) sheet1.setColumnWidth(c, 90);
      }
      sheet1.setColumnWidth(5, 180);  // اسم المورد
      sheet1.setColumnWidth(11, 180); // إسم المنتج

      SpreadsheetApp.flush();

      // Export as XLSX
      const url = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx';
      const fetchRes = UrlFetchApp.fetch(url, {
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });

      if (fetchRes.getResponseCode() !== 200) {
        throw new Error('تعذر تحويل الملف إلى XLSX (كود ' + fetchRes.getResponseCode() + ')');
      }

      const blob = fetchRes.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      const fileName = 'المشتريات_الضريبية_' + (fromDate ? ('من_' + fromDate + '_') : '') + (toDate ? ('إلى_' + toDate + '_') : '') + budgetDateStr_(new Date()) + '.xlsx';

      return { status: 'success', base64: base64, filename: fileName, count: numItems };
    } finally {
      try { DriveApp.getFileById(ssId).setTrashed(true); } catch (e) { console.warn('Could not trash temp sheet: ' + e); }
    }
  }

  register('add_upload_file', addUploadFile_);
  register('export_vat_purchasing_xlsx', exportVatPurchasingXlsx_);
  register('get_dashboard_data', getDashboardData_);
  register('get_kpi_data', getKpiData_);
  register('get_clients_vendors', getClientsVendors_);
  register('add_client_vendor', addClientVendor_);
  register('edit_client_vendor', editClientVendor_);
  register('get_ar_ap', getArAp_);
  register('get_ar_ap_client', getArApClient_);
  register('add_ar_ap', addArAp_);
  register('get_products', getProducts_);
  register('add_product', addProduct_);
  register('edit_product', editProduct_);
  register('get_barcode', getBarcode_);
  register('add_barcode', addBarcode_);
  register('get_registration_papers', getRegistrationPapers_);
  register('add_registration_paper', addRegistrationPaper_);
  register('update_registration_paper', updateRegistrationPaper_);
  register('get_trust_accounts', getTrustAccounts_);
  register('get_trust_movements', getTrustMovements_);
  register('add_trust_movement', addTrustMovement_);
  register('get_stock_revision', getStockRevision_);
  register('add_stock_revision', addStockRevision_);
  register('update_stock_revision', updateStockRevision_);
  register('get_system_qty', getSystemQty_);
  register('get_stock_scan_options', function (data, user, dbId) {
    return readDiagnosticsForUser_(getStockScanOptions_(data, user, dbId), user);
  });
  register('get_stock_scan_sheet_catalog', function (data, user, dbId) {
    return readDiagnosticsForUser_(getStockScanSheetCatalog_(data, user, dbId), user);
  });
  register('get_stock_scan_warehouses', function (data, user) {
    return readDiagnosticsForUser_(getStockScanWarehouses_(data, user), user);
  });
  register('get_stock_scan_balance', function (data, user) {
    return readDiagnosticsForUser_(getStockScanBalance_(data, user), user);
  });
  register('get_stock_scan_catalog', function (data, user) {
    return readDiagnosticsForUser_(getStockScanCatalog_(data, user), user);
  });
  register('get_stock_scan_balances', function (data, user) {
    return readDiagnosticsForUser_(getStockScanBalances_(data, user), user);
  });
  register('get_stock_scan_history', function (data, user, dbId) {
    return readDiagnosticsForUser_(getStockScanHistory_(data, user, dbId), user);
  });
  register('get_stock_scan_qty', function (data, user, dbId) {
    return readDiagnosticsForUser_(getSystemQty_(data, user, dbId), user);
  });
  register('add_stock_scan', addStockScan_);
  register('get_customs_office', getCustomsOffice_);
  register('add_customs_office', addCustomsOffice_);
  register('get_purchase_items', getPurchaseItems_);
  register('get_purchase_options', getPurchaseOptions_);
  register('add_purchase_item', addPurchaseItem_);
  register('add_vendor', addVendor_);
  register('add_item', addItem_);
  register('get_import_follow', getImportFollow_);
  register('add_import_follow', addImportFollow_);
  register('add_import_follow_files', addImportFollowFiles_);
  register('update_import_follow_status', updateImportFollowStatus_);
  register('get_carton_sizes', getCartonSizes_);
  register('add_carton_size', addCartonSize_);
  register('add_carton_size_files', addCartonSizeFiles_);
  register('get_employees', getEmployees_);
  register('add_employee', addEmployee_);
  register('edit_employee', editEmployee_);
  register('get_employee_status', getEmployeeStatus_);
  register('add_employee_status', addEmployeeStatus_);
  register('get_employee_salary', getEmployeeSalary_);
  register('add_employee_salary', addEmployeeSalary_);
  register('get_emp_deductions', getEmpDeductions_);
  register('add_emp_deduction', addEmpDeduction_);
  register('get_emp_permits', getEmpPermits_);
  register('add_emp_permit', addEmpPermit_);
  register('get_emp_overtime', getEmpOvertime_);
  register('add_emp_overtime', addEmpOvertime_);
  register('get_emp_salaries', getEmpSalaries_);
  register('get_emp_salary_comparison', getEmpSalaryComparison_);
  register('add_emp_salaries', addEmpSalaries_);
  register('edit_emp_salary', editEmpSalary_);
  register('delete_emp_salary', deleteEmpSalary_);
  register('update_emp_salary_receipt', updateEmpSalaryReceipt_);
  register('get_payroll_months', getPayrollMonths_);
  register('close_payroll_month', closePayrollMonth_);
  register('get_legal_products', getLegalProducts_);
  register('get_legal_parties', getLegalParties_);
  register('add_legal_party', addLegalParty_);
  register('get_budget_refs', getBudgetRefs_);
  register('get_legal_current_products', getLegalCurrentProducts_);
  register('get_legal_stock_balance', getLegalStockBalance_);
  register('get_system_product_options', getSystemProductOptions_);
  register('update_legal_product', updateLegalProduct_);
  register('get_legal_products_movement', getLegalProductsMovement_);
  register('get_legal_inputs', getLegalInputs_);
  register('add_legal_costing', addLegalCosting_);
  register('add_legal_purchasing_line', addLegalPurchasingLine_);
  register('add_legal_costing_bundle', addLegalCostingBundle_);
  register('edit_legal_costing_bundle', editLegalCostingBundle_);
  register('delete_legal_costing', deleteLegalCosting_);
  register('get_legal_manufacture', getLegalManufacture_);
  register('add_legal_manufacture', addLegalManufacture_);
  register('update_legal_manufacture', updateLegalManufacture_);
  register('get_legal_invoices', getLegalInvoices_);
  register('add_legal_invoice', addLegalInvoice_);
  register('get_legal_cash', getLegalCash_);
  register('add_legal_cash', addLegalCash_);
  register('toggle_legal_cash_approved', toggleLegalCashApproved_);
  register('get_legal_hr', getLegalHr_);
  register('add_legal_employee', addLegalEmployee_);
  register('get_legal_salaries', getLegalSalaries_);
  register('add_legal_salary', addLegalSalary_);
  register('get_income_statement', getIncomeStatement_);
  register('make_collection_from_invoice', makeCollectionFromInvoice_);
  register('make_collections_from_invoices', makeCollectionsFromInvoices_);

  function prefetchRefs_(data, user, dbId) {
    // Phase 7.2 — one warm per reference sheet, each in a shape a reader
    // actually consumes. It used to warm all six as RAW record arrays under the
    // same keys the shaped readers use, so an idle prefetch poisoned them.
    try { tcCategoryOptions_(dbId); } catch(e){}
    try { tcChartOptions_(dbId); } catch(e){}
    try { tcClientsRaw_(dbId); } catch(e){}
    try { tcProductsRaw_(dbId); } catch(e){}
    try { tcLegalPartiesRaw_(dbId); } catch(e){}
    try { tcLegalProductsRaw_(dbId); } catch(e){}
    return { status: 'success' };
  }
  register('prefetch_refs', prefetchRefs_);
  /* One action for every page in this company. It does NOT go through
     PAGE_ACCESS, because one entry could only describe one page; it gates
     itself on the page it is asked about (see getPageVersions_). */
  register('get_page_versions', getPageVersions_);

  // ─── Main-system debts review (live MySQL view clients_AR) ──
  // Thin wrappers: authority enforced by guard_() via PAGE_ACCESS above.
  function getMainReview_(data, user, dbId) {
    return dbClientsArList_(data || {}, user);
  }
  function reviseMainReview_(data, user, dbId) {
    data = data || {};
    var id = String(data.client_balance_sheet_id === undefined || data.client_balance_sheet_id === null ? '' : data.client_balance_sheet_id).trim();
    if (!id) throw new Error('client_balance_sheet_id is required');
    return dbClientsArRevise_(data, user);
  }
  register('get_main_review', getMainReview_);
  register('revise_main_review', reviseMainReview_);

  // ─── client_balance_sheets (live MySQL base table) ──
  // PK is `id` (bigint AUTO_INCREMENT).  Authority via PAGE_ACCESS (above).
  function getClientBalanceSheets_(data, user, dbId) {
    return dbClientBalanceSheetsList_(data || {}, user);
  }
  function saveClientBalanceSheet_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required for client_balance_sheets update');
    return dbClientBalanceSheetsUpdate_(data, user);
  }
  function deleteClientBalanceSheet_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required for client_balance_sheets soft-delete');
    return dbClientBalanceSheetsDelete_(data, user);
  }
  register('get_client_balance_sheets', getClientBalanceSheets_);
  register('save_client_balance_sheet', saveClientBalanceSheet_);
  register('delete_client_balance_sheet', deleteClientBalanceSheet_);

  // ─── manufacture_headers / manufacture_footers (tc_manufacture_orders) ──
  function getManufactureHeaders_(data, user, dbId) {
    return dbManufactureList_(data || {}, user);
  }
  function getManufactureFooters_(data, user, dbId) {
    return dbManufactureGetFooters_(data || {}, user);
  }
  function saveManufactureHeader_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required for manufacture_headers update');
    return dbManufactureUpdateHeader_(data, user);
  }
  function saveManufactureFooter_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required for manufacture_footers update');
    return dbManufactureUpdateFooter_(data, user);
  }
  function addManufactureFooter_(data, user, dbId) {
    data = data || {};
    var hid = String(data.manufacture_header_id !== null && data.manufacture_header_id !== undefined ? data.manufacture_header_id : '').trim();
    if (!hid) throw new Error('manufacture_header_id is required');
    return dbManufactureInsertFooter_(data, user);
  }
  function getManufactureRefs_(data, user, dbId) {
    return dbManufactureRefs_(data || {}, user);
  }
  function deleteManufactureHeader_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required for manufacture_headers soft-delete');
    return dbManufactureSoftDeleteHeader_(data, user);
  }
  function deleteManufactureFooter_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required for manufacture_footers delete');
    return dbManufactureDeleteFooter_(data, user);
  }
  register('get_manufacture_headers', getManufactureHeaders_);
  register('get_manufacture_footers', getManufactureFooters_);
  register('save_manufacture_header', saveManufactureHeader_);
  register('save_manufacture_footer', saveManufactureFooter_);
  register('add_manufacture_footer',  addManufactureFooter_);
  register('delete_manufacture_header', deleteManufactureHeader_);
  register('delete_manufacture_footer', deleteManufactureFooter_);
  register('get_manufacture_refs',    getManufactureRefs_);

  // ─── products live table (tc_products_live / اصناف النظام الرئيسي) ──
  // Restored into the live bundle: the old standalone connector root file
  // is no longer deployed (see .clasp.json filePushOrder), so these run
  // here. Behavior matches the archived implementation, plus an optional
  // `search` term applied to BOTH the COUNT and the SELECT via bound LIKE
  // parameters (name_ar / name_en / code / id). Empty search is byte-identical
  // to the old no-filter behavior, including the cache key.
  var DB_PRODUCTS_LIVE_TTL = 90;
  var DB_PRODUCTS_LIVE_PAGE_MAX = 200;
  var DB_PRODUCTS_LIVE_ALL_MAX = 1000;
  var DB_PRODUCTS_LIVE_VER_KEY = 'dblive_products_ver';

  function dbProductsLiveVer_() {
    try {
      var v = CacheService.getScriptCache().get(DB_PRODUCTS_LIVE_VER_KEY);
      return v || '0';
    } catch (e) { return '0'; }
  }

  function dbProductsLiveBust_() {
    try { CacheService.getScriptCache().put(DB_PRODUCTS_LIVE_VER_KEY, String(Date.now()), 21600); } catch (e) {}
    try { if (typeof removeChunkedCache_ === 'function') removeChunkedCache_(SYSTEM_PRODUCT_OPTIONS_KEY); } catch (e2) {}
  }

  function dbProductsLiveCacheGet_(key) {
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) return null;
    try {
      if (typeof getChunkedCache_ === 'function') return getChunkedCache_(key);
      var raw = CacheService.getScriptCache().get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function dbProductsLiveCachePut_(key, value) {
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) return;
    try {
      if (typeof putChunkedCache_ === 'function') { putChunkedCache_(key, value, DB_PRODUCTS_LIVE_TTL); return; }
      CacheService.getScriptCache().put(key, JSON.stringify(value), DB_PRODUCTS_LIVE_TTL);
    } catch (e) {}
  }

  /* Normalized search term: trimmed, capped at 40 chars. '' means no filter. */
  function dbProductsLiveSearch_(data) {
    var raw = '';
    if (data) {
      if (data.search !== undefined && data.search !== null) raw = String(data.search);
      else if (data.q !== undefined && data.q !== null) raw = String(data.q);
    }
    return raw.trim().slice(0, 40);
  }

  function dbProductsLiveCountQuery_(conn, where, likeParams, diagnose) {
    var countStmt, countRs, phaseStart = 0, sqlMs = 0, readMs = 0;
    try {
      countStmt = conn.prepareStatement('SELECT COUNT(*) AS cnt FROM `products` `p` ' + where);
      if (likeParams) dbBindParams_(countStmt, likeParams);
      if (diagnose) phaseStart = Date.now();
      countRs = countStmt.executeQuery();
      if (diagnose) { sqlMs = Date.now() - phaseStart; phaseStart = Date.now(); }
      var total = countRs.next() ? countRs.getInt('cnt') : 0;
      if (diagnose) readMs = Date.now() - phaseStart;
      return { status: 'ok', total: total, sql_ms: sqlMs, read_ms: readMs };
    } finally {
      if (countRs) countRs.close();
      if (countStmt) countStmt.close();
    }
  }

  function dbProductsLiveList_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbProductsLiveList_')) {
      return mysqlRead_(mysqlTcDefinition_('dbProductsLiveList_'), data, function (p) { return dbProductsLiveList_(p, user); });
    }
    
    
    
    data = data || {};
    var loadAll = !!(data.loadAll === true || data.loadAll === 'true' || data.loadAll === '1' || data.loadAll === 1);
    /* The versioned cursor route is opt-in. Legacy offset and loadAll callers
       keep their existing response and SQL paths until the page is validated. */
    var cursorJson = data.pagination === 'cursor_json';
    var cursorPaging = data.pagination === 'cursor' || cursorJson;
    if (cursorPaging) loadAll = false;
    var limit = loadAll ? DB_PRODUCTS_LIVE_ALL_MAX : Math.min(Math.max(Math.floor(Number(data.limit) || 50), 1), DB_PRODUCTS_LIVE_PAGE_MAX);
    var offset = cursorPaging ? 0 : Math.max(Math.floor(Number(data.offset) || 0), 0);
    if (!Number.isFinite(offset)) throw new Error('Invalid product offset');
    var q = dbProductsLiveSearch_(data);
    var searchMode = String(data.search_mode || 'contains');
    if (['contains', 'prefix', 'id', 'code'].indexOf(searchMode) === -1) throw new Error('Invalid product search mode');
    if (q && searchMode === 'id' && !/^[1-9]\d{0,19}$/.test(q)) throw new Error('Invalid product ID');
    var beforeId = cursorPaging && !cursorJson && data.before_id != null ? String(data.before_id).trim() : '';
    var snapshotMaxId = cursorJson && data.snapshot_max_id != null ? String(data.snapshot_max_id).trim() : '';
    if (cursorJson && data.cursor) {
      var token = String(data.cursor);
      if (token.length > 1024) throw new Error('Invalid product cursor');
      var decoded;
      try { decoded = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token)).getDataAsString()); }
      catch (cursorError) { throw new Error('Invalid product cursor'); }
      if (!decoded || decoded.v !== 1 || decoded.q !== q || decoded.mode !== searchMode ||
          !decoded.before || !decoded.snapshot ||
          (snapshotMaxId && snapshotMaxId !== decoded.snapshot)) throw new Error('Product cursor scope changed');
      beforeId = String(decoded.before);
      snapshotMaxId = String(decoded.snapshot);
    }
    if (beforeId && !/^[1-9]\d{0,19}$/.test(beforeId)) throw new Error('Invalid product cursor');
    if (snapshotMaxId && !/^[1-9]\d{0,19}$/.test(snapshotMaxId)) throw new Error('Invalid product snapshot');
    if (cursorJson && beforeId && !snapshotMaxId) throw new Error('Product cursor requires a snapshot');
    var cacheKey = 'dblive_products_v' + dbProductsLiveVer_() + '_l' + limit + '_o' + offset +
      '_filter' + JSON.stringify(q ? [q, searchMode] : []) +
      (cursorPaging ? '_seek' + beforeId : '') + (cursorJson ? '_json_snap' + snapshotMaxId : '');
    var cached = data.refresh ? null : dbProductsLiveCacheGet_(cacheKey);
    if (cached && cached.status === 'ok' && Array.isArray(cached.rows)) return cached;
    var where = 'WHERE `p`.`deleted_at` IS NULL';
    var likeParams = null;
    if (q && (searchMode === 'id' || searchMode === 'code')) {
      where += searchMode === 'id' ? ' AND `p`.`id` = ?' : ' AND `p`.`code` = ?';
      likeParams = [q];
    } else if (q && searchMode === 'prefix') {
      where += ' AND `p`.`name_ar` LIKE ? ESCAPE \'\\\\\'';
      likeParams = [q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%'];
    } else if (q) {
      where += ' AND (`p`.`name_ar` LIKE ? ESCAPE \'\\\\\' OR `p`.`name_en` LIKE ? ESCAPE \'\\\\\' OR `p`.`code` LIKE ? ESCAPE \'\\\\\' OR CAST(`p`.`id` AS CHAR) LIKE ? ESCAPE \'\\\\\')';
      var esc = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      likeParams = ['%' + esc + '%', '%' + esc + '%', '%' + esc + '%', '%' + esc + '%'];
    }
    var whereParams = (likeParams || []).slice();
    if (snapshotMaxId) {
      where += ' AND `p`.`id` <= ?';
      whereParams.push(snapshotMaxId);
    }
    var conn, stmt, rs, schemaStmt, schemaRs;
    var diagnose = typeof perfDiagnosticsEnabled_ === 'function' && perfDiagnosticsEnabled_();
    var countSqlMs = 0, countReadMs = 0, productSqlMs = 0, productReadMs = 0, phaseStart = 0;
    var aggregateLoad = (loadAll && !cursorPaging && offset === 0) || cursorJson;
    try {
      var total, count = null;
      if (!aggregateLoad) {
        if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
          count = mysqlRead_(mysqlTcDefinition_('dbProductsLiveCount_'), { search: q, search_mode: searchMode, refresh: data.refresh }, function () {
            return dbProductsLiveCountQuery_(dbGetConnection_(), where, whereParams, diagnose);
          });
        } else {
          conn = dbGetConnection_();
          count = dbProductsLiveCountQuery_(conn, where, whereParams, diagnose);
        }
        total = count.total;
        if (diagnose && !(count._mysql && count._mysql.cache_hit)) {
          countSqlMs = count.sql_ms; countReadMs = count.read_ms;
        }
      }
      conn = conn || dbGetConnection_();
      // Project the product schema dynamically, but deliberately exclude
      // products.quantity. The page's quantity column is selected only from
      // product_current_quantity.current_qty below.
      schemaStmt = conn.prepareStatement('SELECT `p`.* FROM `products` `p` LIMIT 0');
      schemaRs = schemaStmt.executeQuery();
      var productMeta = schemaRs.getMetaData(), productColumnCount = productMeta.getColumnCount();
      var productColumns = [], quantitySelect = [];
      for (var pc = 1; pc <= productColumnCount; pc++) {
        var productColumn = String(productMeta.getColumnLabel(pc) || productMeta.getColumnName(pc) || '');
        if (!/^[A-Za-z0-9_$]+$/.test(productColumn)) throw new Error('Unsupported products column name');
        if (productColumn === 'quantity') continue;
        productColumns.push(productColumn);
        quantitySelect.push('`p`.`' + productColumn.replace(/`/g, '``') + '`');
      }
      columns = productColumns.concat(['quantity']);
      quantitySelect.push('`q`.`current_qty` AS `quantity`');
      schemaRs.close(); schemaRs = null;
      schemaStmt.close(); schemaStmt = null;
      // Seek from the last displayed ID; COUNT remains for the entire search.
      var pageWhere = where + (beforeId ? ' AND `p`.`id` < ?' : '');
      var pageParams = whereParams.slice();
      if (beforeId) pageParams.push(beforeId); // Keep BIGINT IDs as strings.
      var pageLimit = cursorPaging ? limit + 1 : limit;
      var rows = [];
      if (aggregateLoad) {
        // Match the proven direct-table experiment: MySQL builds one bounded
        // JSON result so Apps Script does not make a JDBC call for every cell.
        var jsonArgs = [];
        for (var c = 0; c < columns.length; c++) {
          var column = columns[c];
          jsonArgs.push("'" + column.replace(/'/g, "''") + "'");
          var ident = '`x`.`' + column.replace(/`/g, '``') + '`';
          jsonArgs.push('CASE WHEN ' + ident + ' IS NULL THEN NULL ELSE CAST(' + ident + ' AS CHAR) END');
        }
        if (!columns.length) throw new Error('products table has no readable columns');
        var aggregateSql =
          'SELECT (SELECT COUNT(*) FROM `products` `p` ' + where + ') AS `total_count`, COUNT(*) AS `row_count`,' +
          ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + jsonArgs.join(',') + ')), JSON_ARRAY()) AS `rows_json` FROM (' +
          ' SELECT ' + quantitySelect.join(',') + ' FROM (' +
          '  SELECT * FROM `products` `p` ' + pageWhere +
          '  ORDER BY `p`.`id` DESC LIMIT ' + pageLimit + (cursorPaging ? '' : ' OFFSET ' + offset) +
          ' ) `p` LEFT JOIN `product_current_quantity` `q` ON `q`.`id` = `p`.`id`' +
          ') `x`';
        stmt = conn.prepareStatement(aggregateSql);
        var aggregateParams = whereParams.concat(pageParams);
        if (aggregateParams.length) dbBindParams_(stmt, aggregateParams);
        if (diagnose) phaseStart = Date.now();
        rs = stmt.executeQuery();
        if (diagnose) { productSqlMs = Date.now() - phaseStart; phaseStart = Date.now(); }
        var aggregateCount = 0, rowsJson = '[]';
        if (rs.next()) {
          total = Number(rs.getString('total_count') || 0);
          aggregateCount = Number(rs.getString('row_count') || 0);
          rowsJson = String(rs.getString('rows_json') || '[]');
        }
        var parseStarted = Date.now();
        var parsedRows = JSON.parse(rowsJson);
        if (!Array.isArray(parsedRows) || parsedRows.length !== aggregateCount || parsedRows.length > pageLimit) {
          throw new Error('MySQL products aggregate is invalid');
        }
        rows = parsedRows.map(function (item) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('MySQL products row is invalid');
          var clean = {};
          columns.forEach(function (key) { clean[key] = item[key] == null ? null : String(item[key]); });
          return clean;
        });
        rows.sort(function (a, b) {
          var left = String(a.id == null ? '' : a.id), right = String(b.id == null ? '' : b.id);
          if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
            left = left.replace(/^0+(?=\d)/, ''); right = right.replace(/^0+(?=\d)/, '');
            if (left.length !== right.length) return right.length - left.length;
            return left < right ? 1 : (left > right ? -1 : 0);
          }
          return right.localeCompare(left);
        });
        if (cursorJson) {
          for (var ri = 0; ri < rows.length; ri++) {
            if (!/^[1-9]\d{0,19}$/.test(String(rows[ri].id || '')) ||
                (ri > 0 && String(rows[ri - 1].id) === String(rows[ri].id))) {
              throw new Error('Product cursor requires unique string IDs');
            }
          }
        }
        if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
          _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - parseStarted;
        }
      } else {
        stmt = conn.prepareStatement(
          'SELECT ' + quantitySelect.join(',') + ' FROM (' +
          ' SELECT * FROM `products` `p` ' + pageWhere +
          ' ORDER BY `p`.`id` DESC LIMIT ' + pageLimit + (cursorPaging ? '' : ' OFFSET ' + offset) +
          ') `p` LEFT JOIN `product_current_quantity` `q` ON `q`.`id` = `p`.`id`' +
          ' ORDER BY `p`.`id` DESC'
        );
        if (pageParams.length) dbBindParams_(stmt, pageParams);
        if (diagnose) phaseStart = Date.now();
        rs = stmt.executeQuery();
        if (diagnose) { productSqlMs = Date.now() - phaseStart; phaseStart = Date.now(); }
        var md = rs.getMetaData(), colCount = md.getColumnCount();
        while (rs.next()) {
          var row = {};
          for (var i = 1; i <= colCount; i++) { var v = rs.getObject(i); row[columns[i-1]] = v !== null ? String(v) : null; }
          rows.push(row);
        }
      }
      if (columns.indexOf('quantity') < 0) throw new Error('Live quantity view column is missing');
      if (diagnose) {
        productReadMs = Date.now() - phaseStart;
        try {
          Logger.log('tc.products_live.read ' + JSON.stringify({ count_sql_ms: countSqlMs,
            count_read_ms: countReadMs, product_sql_ms: productSqlMs,
            product_read_ms: productReadMs, count_cache_hit: !!(count && count._mysql && count._mysql.cache_hit),
            rows: rows.length, limit: limit }));
        } catch (diagnosticError) {}
      }
      var hasMore = cursorPaging ? rows.length > limit : offset + rows.length < total;
      if (cursorPaging) rows = rows.slice(0, limit);
      var out = { status: 'ok', columns: columns, rows: rows, total: total, limit: limit, offset: offset, loadedAll: loadAll, search: q,
        search_mode: searchMode, has_more: hasMore,
        next_cursor: cursorPaging && hasMore && rows.length ? String(rows[rows.length - 1].id) : '' };
      if (cursorJson) {
        var firstId = rows.length ? String(rows[0].id) : '';
        var pageSnapshot = snapshotMaxId || firstId;
        if (hasMore && !pageSnapshot) throw new Error('Product page has no snapshot');
        out.schema_version = 1;
        out.total_is_exact = true;
        out.data_version = dbProductsLiveVer_();
        out.next_cursor = hasMore ? Utilities.base64EncodeWebSafe(JSON.stringify({
          v: 1, before: out.next_cursor, snapshot: pageSnapshot, q: q, mode: searchMode
        })) : '';
        out.page = { limit: limit, has_more: hasMore, next_cursor: out.next_cursor,
          snapshot: pageSnapshot };
      }
      dbProductsLiveCachePut_(cacheKey, out);
      return out;
    } catch (err) {
      Logger.log('dbProductsLiveList_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (schemaRs) schemaRs.close();
      if (schemaStmt) schemaStmt.close();
      if (conn) conn.close();
    }
  }

  /* Warehouse-level quantity detail for the Products Live modal. MySQL emits
   * one compact JSON row instead of Apps Script making JDBC calls per cell.
   * This is read-only and uncached so opening the modal shows the view's
   * current values. */
  function dbProductLiveWarehouseQuantities_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbProductLiveWarehouseQuantities_')) {
      return mysqlRead_(mysqlTcDefinition_('dbProductLiveWarehouseQuantities_'), data,
        function (p) { return dbProductLiveWarehouseQuantities_(p, user); });
    }
    data = data || {};
    var id = String(data.id == null ? '' : data.id).trim();
    if (!/^[1-9]\d{0,19}$/.test(id)) throw new Error('Invalid product ID');
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
        "'warehouse_id', CASE WHEN `q`.`warehouse_id` IS NULL THEN NULL ELSE CAST(`q`.`warehouse_id` AS CHAR) END," +
        "'current_qty', CASE WHEN `q`.`current_qty` IS NULL THEN NULL ELSE CAST(`q`.`current_qty` AS CHAR) END)), JSON_ARRAY()) AS `balances_json` " +
        'FROM `product_current_qty_warehouses` `q` INNER JOIN `products` `p` ON `p`.`id` = `q`.`id` AND `p`.`deleted_at` IS NULL WHERE `q`.`id` = ?'
      );
      dbBindParams_(stmt, [id]);
      rs = stmt.executeQuery();
      if (!rs.next()) throw new Error('Warehouse balance query returned no result');
      var count = Number(rs.getString('row_count') || 0);
      if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error('Too many warehouse balances for this product');
      var balances = JSON.parse(String(rs.getString('balances_json') || '[]'));
      if (!Array.isArray(balances) || balances.length !== count || balances.length > 500) throw new Error('Warehouse balance JSON is invalid');
      var seen = Object.create(null);
      balances = balances.map(function (item) {
        if (!item || item.warehouse_id == null || String(item.warehouse_id) === '') throw new Error('Warehouse balance has no warehouse ID');
        var warehouseId = String(item.warehouse_id);
        if (seen[warehouseId]) throw new Error('Duplicate warehouse balance for product');
        seen[warehouseId] = true;
        return { warehouse_id: warehouseId, current_qty: item.current_qty == null ? null : String(item.current_qty) };
      });
      balances.sort(function (a, b) {
        var x = a.warehouse_id, y = b.warehouse_id;
        if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
          x = x.replace(/^0+(?=\d)/, ''); y = y.replace(/^0+(?=\d)/, '');
          if (x.length !== y.length) return x.length - y.length;
        }
        return x < y ? -1 : (x > y ? 1 : 0);
      });
      return { status: 'ok', product_id: id, balances: balances };
    } catch (err) {
      Logger.log('dbProductLiveWarehouseQuantities_ MySQL read failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  /**
   * INSERT a product using an explicit editable-column allowlist. IDs,
   * quantity, foreign keys, timestamps, and delete state remain server-owned.
   */
  function dbProductsLiveInsert_(data, user) {
    data = data || {};
    function textValue(key, maxLength, required) {
      var value = String(data[key] == null ? '' : data[key]).trim();
      if (required && !value) throw new Error('الحقل مطلوب: ' + key);
      if (value.length > maxLength) throw new Error('قيمة الحقل أطول من المسموح: ' + key);
      return value || null;
    }
    function decimalValue(key, required) {
      var value = String(data[key] == null ? '' : data[key]).trim();
      if (!value) {
        if (required) throw new Error('الحقل مطلوب: ' + key);
        return null;
      }
      if (value.length > 40 || !/^(?:\d+)(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
        throw new Error('قيمة رقمية غير صالحة: ' + key);
      }
      return value;
    }

    var columns = ['name_ar', 'code', 'unit', 'number_of_cartons_bags'];
    var values = [
      textValue('name_ar', 255, true),
      textValue('code', 100, true),
      textValue('unit', 80, true),
      decimalValue('number_of_cartons_bags', true)
    ];
    // Omit blank optional columns so MySQL can apply a column default (and so
    // NOT NULL fields with defaults are not accidentally sent an explicit NULL).
    [
      ['name_en', function () { return textValue('name_en', 255, false); }],
      ['price', function () { return decimalValue('price', false); }],
      ['number_of_small_boxes', function () { return decimalValue('number_of_small_boxes', false); }],
      ['product_unit_metric', function () { return textValue('product_unit_metric', 80, false); }]
    ].forEach(function (field) {
      var value = field[1]();
      if (value !== null) { columns.push(field[0]); values.push(value); }
    });
    columns.push('active', 'deleted_at');
    values.push(1, null);
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'INSERT INTO `products` (' + columns.map(function (c) { return '`' + c + '`'; }).join(',') +
        ') VALUES (' + columns.map(function () { return '?'; }).join(',') + ')'
      );
      dbBindParams_(stmt, values);
      var affected = stmt.executeUpdate();
      if (affected !== 1) throw new Error('لم تتم إضافة الصنف');
      dbProductsLiveBust_();
      return { status: 'ok', affected: affected };
    } catch (err) {
      Logger.log('dbProductsLiveInsert_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  /**
   * UPDATE one products row by id. Everything is editable except the PK,
   * server-managed timestamps, and quantity — quantity is read-only live data
   * from the product_current_quantity view (see dbProductsLiveList_).
   */
  function dbProductsLiveUpdate_(data, user) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required');
    var readOnlyCols = { 'id': true, 'created_at': true, 'updated_at': true, 'quantity': true, 'live_quantity': true };
    var updates = [], params = [];
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      if (readOnlyCols[key]) continue;
      if (key.charAt(0) === '_') continue;
      var safeCol = dbSanitizeIdentifier_(key);
      var rawVal = data[key];
      updates.push(safeCol + ' = ?');
      params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
    }
    if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');
    params.push(id);
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement('UPDATE `products` SET ' + updates.join(', ') + ' WHERE `id` = ?');
      dbBindParams_(stmt, params);
      var affected = stmt.executeUpdate();
      dbProductsLiveBust_();
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbProductsLiveUpdate_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  /**
   * Soft-delete one products row: SET deleted_at = NOW().
   * data: { id }.
   */
  function dbProductsLiveDelete_(data, user) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required');
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'UPDATE `products` SET `deleted_at` = NOW(), `updated_at` = NOW()' +
        ' WHERE `id` = ? AND `deleted_at` IS NULL'
      );
      stmt.setObject(1, id);
      var affected = stmt.executeUpdate();
      if (affected === 0) throw new Error('الصنف غير موجود أو محذوف مسبقاً');
      dbProductsLiveBust_();
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbProductsLiveDelete_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  function getProductsLive_(data, user, dbId) {
    var result = dbProductsLiveList_(data || {}, user);
    if (data && data.pagination === 'cursor_json' && result && result.status === 'ok') {
      result = Object.assign({}, result, { request_id: Utilities.getUuid() });
    }
    return readDiagnosticsForUser_(result, user);
  }
  function getProductLiveWarehouseQuantities_(data, user, dbId) {
    return dbProductLiveWarehouseQuantities_(data || {}, user);
  }

  /* Super-admin-only, read-only connection probe. It deliberately bypasses
   * every application cache and opens the same request-owned JDBC connection
   * used by production reads. SELECT 1 isolates connection/authentication from
   * business SQL; the session-status query proves whether this exact Apps
   * Script connection negotiated TLS. */
  function getMysqlConnectionProbe_(data, user) {
    if (!user || !user.isSuperAdmin) throw new Error('اختبار اتصال MySQL متاح للمسؤول الأعلى فقط');
    var started = Date.now(), tracker = _mysqlRequest_;
    var before = tracker ? {
      connection: tracker.connectionMs,
      sql: tracker.sqlMs,
      read: tracker.readMs,
      rows: tracker.rows
    } : null;
    var conn, selectStmt, selectRs, tlsStmt, tlsRs;
    var connectMs = 0, selectSqlMs = 0, selectReadMs = 0;
    var tlsSqlMs = 0, tlsReadMs = 0, sslCipher = '';
    try {
      var phase = Date.now();
      conn = dbGetConnection_();
      connectMs = Date.now() - phase;

      selectStmt = conn.prepareStatement('SELECT 1 AS `ok`');
      phase = Date.now();
      selectRs = selectStmt.executeQuery();
      selectSqlMs = Date.now() - phase;
      phase = Date.now();
      if (!selectRs.next() || Number(selectRs.getInt('ok')) !== 1) throw new Error('MySQL SELECT 1 probe failed');
      selectReadMs = Date.now() - phase;
      selectRs.close(); selectRs = null;
      selectStmt.close(); selectStmt = null;

      tlsStmt = conn.createStatement();
      phase = Date.now();
      tlsRs = tlsStmt.executeQuery("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
      tlsSqlMs = Date.now() - phase;
      phase = Date.now();
      if (tlsRs.next()) sslCipher = String(tlsRs.getString(2) || '');
      tlsReadMs = Date.now() - phase;

      var serverTotalMs = Date.now() - started;
      var trackedConnectionMs = tracker && before ? tracker.connectionMs - before.connection : connectMs;
      var trackedSqlMs = tracker && before ? tracker.sqlMs - before.sql : selectSqlMs + tlsSqlMs;
      var trackedReadMs = tracker && before ? tracker.readMs - before.read : selectReadMs + tlsReadMs;
      return {
        status: 'ok',
        probe_id: Utilities.getUuid(),
        tls_active: sslCipher !== '',
        ssl_cipher: sslCipher,
        timing_ms: {
          server_total: serverTotalMs,
          connection: trackedConnectionMs,
          select_1_sql: selectSqlMs,
          select_1_read: selectReadMs,
          tls_check_sql: tlsSqlMs,
          tls_check_read: tlsReadMs,
          tracked_sql_total: trackedSqlMs,
          tracked_read_total: trackedReadMs,
          server_unaccounted: Math.max(0, serverTotalMs - trackedConnectionMs - trackedSqlMs - trackedReadMs)
        },
        rows_read: tracker && before ? tracker.rows - before.rows : 2
      };
    } finally {
      if (tlsRs) tlsRs.close();
      if (tlsStmt) tlsStmt.close();
      if (selectRs) selectRs.close();
      if (selectStmt) selectStmt.close();
      if (conn) conn.close();
    }
  }

  // Isolated tc_products_live experiment: fetch the full products table once
  // as a compact JSON aggregate. MySQL does the row serialization so Apps
  // Script avoids the slow JDBC per-cell loop. The client derives its dropdown
  // pairs from these rows and also exercises local search/pagination.
  function getProductsLiveDirectTest_(data, user) {
    if (!user || !user.isSuperAdmin) throw new Error('اختبار قياس جدول المنتجات متاح للمسؤول الأعلى فقط');
    var started = Date.now(), tracker = _mysqlRequest_;
    var before = tracker ? { connection: tracker.connectionMs, query: tracker.sqlMs, read: tracker.readMs } : null;
    var conn, schemaStmt, schemaRs, stmt, rs;
    try {
      conn = dbGetConnection_();
      schemaStmt = conn.prepareStatement('SELECT * FROM `products` LIMIT 0');
      schemaRs = schemaStmt.executeQuery();
      var md = schemaRs.getMetaData(), columns = [], jsonArgs = [];
      for (var i = 1; i <= md.getColumnCount(); i++) {
        var column = String(md.getColumnLabel(i) || md.getColumnName(i) || '');
        // Names originate from MySQL schema metadata, but still constrain and
        // quote them before using them as SQL identifiers or JSON keys.
        if (!/^[A-Za-z0-9_$]+$/.test(column)) throw new Error('Unsupported products column name');
        var ident = '`p`.`' + column.replace(/`/g, '``') + '`';
        jsonArgs.push("'" + column.replace(/'/g, "''") + "'");
        jsonArgs.push('CASE WHEN ' + ident + ' IS NULL THEN NULL ELSE CAST(' + ident + ' AS CHAR) END');
        columns.push(column);
      }
      schemaRs.close(); schemaRs = null;
      schemaStmt.close(); schemaStmt = null;
      if (!columns.length) throw new Error('products table has no readable columns');

      // Bound this experiment's response so a future table growth cannot turn
      // this whole-catalog test into an unbounded Apps Script payload.
      stmt = conn.prepareStatement(
        'SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + jsonArgs.join(',') +
          ')), JSON_ARRAY()) AS `rows_json` FROM (' +
          'SELECT * FROM `products` ORDER BY `id` ASC LIMIT 5001' +
        ') AS `p`'
      );
      rs = stmt.executeQuery();
      var rowCount = 0, productsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        productsJson = String(rs.getString('rows_json') || '[]');
      }
      if (rowCount > 5000) throw new Error('products table exceeds the 5000-row test limit');
      var payloadBytes = Utilities.newBlob(productsJson).getBytes().length;
      if (payloadBytes > 5 * 1024 * 1024) {
        throw new Error('products table exceeds the 5 MB test response limit');
      }
      var parseStarted = Date.now();
      var parsed = JSON.parse(productsJson);
      if (!Array.isArray(parsed) || parsed.length !== rowCount) throw new Error('MySQL products aggregate is invalid');
      var rows = parsed.map(function (row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('MySQL products row is invalid');
        var clean = {};
        columns.forEach(function (column) {
          var value = row[column];
          clean[column] = value == null ? null : String(value);
        });
        return clean;
      });
      var parseMs = Date.now() - parseStarted;
      var timing = tracker && before ? {
        connection: tracker.connectionMs - before.connection,
        query: tracker.sqlMs - before.query,
        read: tracker.readMs - before.read
      } : { connection: null, query: null, read: null };
      timing.parse = parseMs;
      timing.server_total = Date.now() - started;
      return readDiagnosticsForUser_({ status: 'ok', columns: columns, rows: rows, count: rows.length,
        payload_bytes: payloadBytes,
        timing_ms: timing }, user);
    } catch (err) {
      Logger.log('tc.products_live.direct_test failed; see MySQL diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (schemaRs) schemaRs.close();
      if (schemaStmt) schemaStmt.close();
      if (conn) conn.close();
    }
  }
  register('get_products_live_direct_test', getProductsLiveDirectTest_);
  register('get_mysql_connection_probe', getMysqlConnectionProbe_);

  // ─── read-only production-capability view ────────────────────────────────
  // Rows are returned as supplied by the view. The adapter deliberately does
  // not SUM or otherwise aggregate material relationships.
  // MySQL JSON aggregates avoid Apps Script's slow row-by-row JDBC bridge.
  // The aggregate itself has no guaranteed element order, so each item carries
  // a SQL rank that is validated and restored after parsing.
  function tcCapabilityParseRankedJson_(raw, expectedRows, maxRows, label) {
    var parseStarted = Date.now();
    var parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed) || parsed.length !== expectedRows || parsed.length > maxRows) {
      throw new Error(label + ' MySQL aggregate is invalid');
    }
    parsed.sort(function (a, b) { return Number(a && a._row_num) - Number(b && b._row_num); });
    for (var i = 0; i < parsed.length; i++) {
      if (!parsed[i] || typeof parsed[i] !== 'object' || Array.isArray(parsed[i]) || Number(parsed[i]._row_num) !== i + 1) {
        throw new Error(label + ' MySQL aggregate order is invalid');
      }
      delete parsed[i]._row_num;
    }
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
      _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - parseStarted;
    }
    return parsed;
  }

  function getProductionCapabilityProducts_(data, user) {
    data = data || {};
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbProductionCapabilityProducts_')) {
      return mysqlRead_(mysqlTcDefinition_('dbProductionCapabilityProducts_'), data,
        function (p) { return getProductionCapabilityProducts_(p, user); });
    }
    var search = String(data.search == null ? '' : data.search).trim().slice(0, 80);
    var limit = Math.min(Math.max(Math.floor(Number(data.limit) || 100), 1), 100);
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      var numericSearch = /^[1-9]\d{0,9}$/.test(search);
      var sql = 'SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
        "'_row_num', `ranked`.`_row_num`, 'id', CASE WHEN `ranked`.`manufacture_product_id` IS NULL THEN NULL ELSE CAST(`ranked`.`manufacture_product_id` AS CHAR) END," +
        "'name', `ranked`.`manufacture_product_name`)), JSON_ARRAY()) AS `products_json` FROM (" +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`manufacture_product_name`, `page`.`manufacture_product_id`) AS `_row_num` FROM (' +
        ' SELECT DISTINCT `manufacture_product_id`, `manufacture_product_name`' +
        ' FROM `manuf_product_support_capability` WHERE `manufacture_product_id` IS NOT NULL';
      var bind = [];
      if (search) {
        if (numericSearch) { sql += ' AND `manufacture_product_id` = ?'; bind.push(Number(search)); }
        else { sql += ' AND `manufacture_product_name` LIKE ?'; bind.push('%' + search.replace(/[%_\\]/g, '\\$&') + '%'); }
      }
      sql += ' ORDER BY `manufacture_product_name`, `manufacture_product_id` LIMIT ' + (limit + 1) +
        ') AS `page`) AS `ranked`';
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, bind);
      rs = stmt.executeQuery();
      var rawCount = 0, productsJson = '[]';
      if (rs.next()) {
        rawCount = Number(rs.getString('row_count') || 0);
        productsJson = String(rs.getString('products_json') || '[]');
      }
      var parsed = tcCapabilityParseRankedJson_(productsJson, rawCount, limit + 1, 'Production capability products');
      var byId = {}, products = [];
      parsed.forEach(function (item) {
        var productId = item.id;
        if (productId != null && !byId[String(productId)]) {
          byId[String(productId)] = true;
          products.push({ id: String(productId), name: item.name == null ? '' : String(item.name), name_count: 1 });
        }
      });
      return { status: 'ok', products: products.slice(0, limit), has_more: products.length > limit };
    } catch (err) {
      Logger.log('getProductionCapabilityProducts_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      try { if (rs) rs.close(); } finally { try { if (stmt) stmt.close(); } finally { if (conn) conn.close(); } }
    }
  }

  function getProductionCapabilityRows_(data, user) {
    data = data || {};
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbProductionCapabilityRows_')) {
      return mysqlRead_(mysqlTcDefinition_('dbProductionCapabilityRows_'), data,
        function (p) { return getProductionCapabilityRows_(p, user); });
    }
    var id = String(data.id == null ? '' : data.id).trim();
    if (!/^[1-9]\d{0,9}$/.test(id)) throw new Error('Invalid manufactured product ID');
    var conn, stmt, rs, qtyStmt, qtyRs, metricStmt, metricRs;
    var productCurrentQuantity = null, productUnitMetric = null, productUnit = null;
    try {
      conn = dbGetConnection_();
      try {
        qtyStmt = conn.prepareStatement('SELECT `current_qty` FROM `product_current_quantity` WHERE `id` = ? LIMIT 1');
        dbBindParams_(qtyStmt, [Number(id)]);
        qtyRs = qtyStmt.executeQuery();
        var quantityValue = qtyRs.next() ? qtyRs.getObject('current_qty') : null;
        productCurrentQuantity = quantityValue == null ? null : String(quantityValue);
      } catch (quantityError) {
        // The live balance is optional context; it must not block the BOM read.
        Logger.log('getProductionCapabilityRows_ current quantity lookup failed; continuing without it');
        productCurrentQuantity = null;
      } finally {
        try { if (qtyRs) qtyRs.close(); } catch (closeQtyResultError) {}
        qtyRs = null;
        try { if (qtyStmt) qtyStmt.close(); } catch (closeQtyStatementError) {}
        qtyStmt = null;
      }
      try {
        metricStmt = conn.prepareStatement('SELECT `product_unit_metric`, `unit` FROM `products` WHERE `id` = ? LIMIT 1');
        dbBindParams_(metricStmt, [Number(id)]);
        metricRs = metricStmt.executeQuery();
        if (metricRs.next()) {
          var metricValue = metricRs.getObject('product_unit_metric');
          var unitValue = metricRs.getObject('unit');
          productUnitMetric = metricValue == null ? null : String(metricValue);
          productUnit = unitValue == null ? null : String(unitValue);
        }
      } catch (metricError) {
        Logger.log('getProductionCapabilityRows_ product metric lookup failed; continuing without it');
        productUnitMetric = null;
        productUnit = null;
      } finally {
        try { if (metricRs) metricRs.close(); } catch (closeMetricResultError) {}
        metricRs = null;
        try { if (metricStmt) metricStmt.close(); } catch (closeMetricStatementError) {}
        metricStmt = null;
      }
      var cols = ['manufacture_product_id','manufacture_product_name','total_produced','manufacture_order_count',
        'used_product_id','used_product_name','used_product_category_id','used_product_category','total_used',
        'required_qty_per_mo','required_qty_per_unit','required_qty_per_single_mo','current_stock','production_capability'];
      var jsonArgs = ["'_row_num'", '`ranked`.`_row_num`'];
      cols.forEach(function (col) {
        var ident = '`ranked`.`' + col.replace(/`/g, '``') + '`';
        jsonArgs.push("'" + col.replace(/'/g, "''") + "'");
        jsonArgs.push('CASE WHEN ' + ident + ' IS NULL THEN NULL ELSE CAST(' + ident + ' AS CHAR) END');
      });
      stmt = conn.prepareStatement(
        'SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + jsonArgs.join(',') +
        ')), JSON_ARRAY()) AS `rows_json` FROM (' +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`used_product_id`) AS `_row_num` FROM (' +
        '  SELECT `manufacture_product_id`, `manufacture_product_name`, `total_produced`, `manufacture_order_count`,' +
        '   `used_product_id`, `used_product_name`, `used_product_category_id`, `used_product_category`, `total_used`,' +
        '   `required_qty_per_mo`, `required_qty_per_unit`, `required_qty_per_single_mo`,' +
        '   `current_stock`, `production_capability`' +
        '  FROM `manuf_product_support_capability` WHERE `manufacture_product_id` = ?' +
        '  ORDER BY `used_product_id` LIMIT 1001' +
        ' ) AS `page`' +
        ') AS `ranked`'
      );
      dbBindParams_(stmt, [Number(id)]);
      rs = stmt.executeQuery();
      var rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var parsedRows = tcCapabilityParseRankedJson_(rowsJson, rowCount, 1001, 'Production capability rows');
      var rows = parsedRows.map(function (item) {
        var row = {};
        cols.forEach(function (col) { row[col] = item[col] == null ? null : String(item[col]); });
        return row;
      });
      var truncated = rowCount > 1000;
      return { status: 'ok', rows: rows.slice(0, 1000), truncated: truncated, product_current_quantity: productCurrentQuantity,
        product_unit_metric: productUnitMetric, product_unit: productUnit };
    } catch (err) {
      Logger.log('getProductionCapabilityRows_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      try { if (rs) rs.close(); } finally { try { if (stmt) stmt.close(); } finally { try { if (qtyRs) qtyRs.close(); } finally { try { if (qtyStmt) qtyStmt.close(); } finally { try { if (metricRs) metricRs.close(); } finally { try { if (metricStmt) metricStmt.close(); } finally { if (conn) conn.close(); } } } } } }
    }
  }
  function saveProductLive_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required for products update');
    return dbProductsLiveUpdate_(data, user);
  }
  function addProductLive_(data, user, dbId) {
    return dbProductsLiveInsert_(data || {}, user);
  }
  function deleteProductLive_(data, user, dbId) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required for products soft-delete');
    return dbProductsLiveDelete_(data, user);
  }
  register('get_products_live', getProductsLive_);
  register('get_product_live_warehouse_quantities', getProductLiveWarehouseQuantities_);
  register('add_product_live', addProductLive_);
  /* Capability catalog: the complete eligible ID/name list for local picker
   * filtering. Bounded at 2,000 raw pairs / 256 KiB; anything beyond returns
   * an explicit overflow shape that must never be filtered locally. */
  var DB_CAPABILITY_CATALOG_ROW_CAP_ = 2000;
  var DB_CAPABILITY_CATALOG_BYTE_CAP_ = 262144;

  function tcUtf8Bytes_(s) {
    var bytes = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) bytes += 1;
      else if (c < 0x800) bytes += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var n = s.charCodeAt(i + 1);
        if (n >= 0xDC00 && n <= 0xDFFF) { bytes += 4; i++; } else bytes += 3;
      } else bytes += 3;
    }
    return bytes;
  }

  function dbCapabilityCatalogOverflow_(reason) {
    return { status: 'ok', schema_version: 1, products: [], count: 0,
      complete: false, overflow: true, reason: reason,
      payload_bytes: tcUtf8Bytes_('[]') };
  }

  function dbCapabilityCatalog_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbCapabilityCatalog_')) {
      return mysqlRead_(mysqlTcDefinition_('dbCapabilityCatalog_'), data,
        function (p) { return dbCapabilityCatalog_(p, user); });
    }
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
        "'_row_num', `ranked`.`_row_num`, 'id', CASE WHEN `ranked`.`manufacture_product_id` IS NULL THEN NULL ELSE CAST(`ranked`.`manufacture_product_id` AS CHAR) END," +
        "'name', `ranked`.`manufacture_product_name`)), JSON_ARRAY()) AS `products_json` FROM (" +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`manufacture_product_name`, `page`.`manufacture_product_id`) AS `_row_num` FROM (' +
        '  SELECT DISTINCT `manufacture_product_id`, `manufacture_product_name`' +
        '  FROM `manuf_product_support_capability` WHERE `manufacture_product_id` IS NOT NULL' +
        '  ORDER BY `manufacture_product_name`, `manufacture_product_id` LIMIT 2001' +
        ' ) AS `page`' +
        ') AS `ranked`');
      rs = stmt.executeQuery();
      var raw = 0, productsJson = '[]';
      if (rs.next()) {
        raw = Number(rs.getString('row_count') || 0);
        productsJson = String(rs.getString('products_json') || '[]');
      }
      if (raw > DB_CAPABILITY_CATALOG_ROW_CAP_) return dbCapabilityCatalogOverflow_('row_limit');
      var parsed = tcCapabilityParseRankedJson_(productsJson, raw, DB_CAPABILITY_CATALOG_ROW_CAP_, 'Production capability catalog');
      var byId = {}, products = [], unsupported = false;
      parsed.forEach(function (item) {
        var productId = item.id;
        var productName = item.name;
        if (productId == null) return;
        var idStr = String(productId);
        if (!/^[1-9]\d{0,9}$/.test(idStr)) { unsupported = true; return; }
        if (!byId[idStr]) {
          byId[idStr] = true;
          products.push({ id: idStr, name: productName == null ? '' : String(productName) });
        }
      });
      if (unsupported) return dbCapabilityCatalogOverflow_('unsupported_id');
      var payload = JSON.stringify(products);
      if (tcUtf8Bytes_(payload) > DB_CAPABILITY_CATALOG_BYTE_CAP_) return dbCapabilityCatalogOverflow_('byte_limit');
      return { status: 'ok', schema_version: 1, products: products, count: products.length,
        complete: true, overflow: false, reason: null, payload_bytes: tcUtf8Bytes_(payload) };
    } catch (err) {
      Logger.log('dbCapabilityCatalog_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      try { if (rs) rs.close(); } finally { try { if (stmt) stmt.close(); } finally { if (conn) conn.close(); } }
    }
  }

  function withCatalogServedAt_(res) {
    return { status: 'ok', schema_version: 1, products: res.products, count: res.count,
      complete: res.complete, overflow: res.overflow, reason: res.reason,
      payload_bytes: res.payload_bytes, served_at: Date.now(), _mysql: res._mysql };
  }

  function getProductionCapabilityCatalog_(data, user) {
    var res;
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbCapabilityCatalog_')) {
      res = mysqlRead_(mysqlTcDefinition_('dbCapabilityCatalog_'), data,
        function (p) { return dbCapabilityCatalog_(p, user); });
    } else {
      res = dbCapabilityCatalog_(data, user);
    }
    return withCatalogServedAt_(res);
  }

  function getSalesCapacityCatalog_(data, user) {
    var res;
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbCapabilityCatalog_')) {
      res = mysqlRead_(mysqlTcDefinition_('dbCapabilityCatalog_'), data,
        function (p) { return dbCapabilityCatalog_(p, user); });
    } else {
      res = dbCapabilityCatalog_(data, user);
    }
    return withCatalogServedAt_(res);
  }

  register('get_production_capability_products', getProductionCapabilityProducts_);
  register('get_production_capability_rows', getProductionCapabilityRows_);
  // Sales capacity (tc_sales_capacity) — same live view + planning math as
  // tc_production_capability. Thin delegates so future sales factors can diverge
  // without forking the SQL. Permission + cache isolation comes from the
  // distinct action names (PAGE_ACCESS / r.action), not from duplicated SQL.
  function getSalesCapacityProducts_(data, user) {
    return getProductionCapabilityProducts_(data || {}, user);
  }
  function getSalesCapacityRows_(data, user) {
    return getProductionCapabilityRows_(data || {}, user);
  }
  register('get_sales_capacity_products', getSalesCapacityProducts_);
  register('get_sales_capacity_rows', getSalesCapacityRows_);
  register('get_production_capability_catalog', getProductionCapabilityCatalog_);
  register('get_sales_capacity_catalog', getSalesCapacityCatalog_);
  register('save_product_live', saveProductLive_);
  register('delete_product_live', deleteProductLive_);

  // ─── COO executive daily follow-up (read-only MySQL JSON snapshot) ───────
  // COO_TEST is the fast materialized view created by coo_supply_plan_materialized.sql.
  // The query deliberately returns one JSON aggregate instead of walking every
  // JDBC row in Apps Script. mysqlRead_ then keeps the parsed response in the
  // existing versioned, chunked CacheService layer for 120 seconds.
  var DB_EXECUTIVE_FOLLOWUP_LIMIT_ = 5000;
  var DB_EXECUTIVE_FOLLOWUP_TTL_ = 120;
  var DB_EXECUTIVE_FOLLOWUP_FIELDS_ = [
    'supply_type', 'item_role', 'plan_year', 'item_id', 'item_name',
    'category_id', 'category_name', 'is_raw_material', 'has_bom',
    'sales_history_years', 'last_sales_year', 'weighted_sales_average_qty',
    'forecast_this_year_qty', 'sales_actual_this_year_qty',
    'forecast_next_year_qty', 'forecast_growth_next_year_pct',
    'manufacture_history_years', 'last_manufacture_year',
    'average_manufactured_qty', 'parent_product_count',
    'average_unit_ratio_from_parent', 'direct_need_qty', 'dependent_need_qty',
    'total_need_qty', 'current_stock_qty', 'safety_stock_qty',
    'lead_time_demand_qty', 'stock_coverage_days',
    'dependent_demand_share_pct', 'suggested_make_qty', 'suggested_buy_qty',
    'uncovered_qty_before_action', 'abc_class', 'decision_confidence',
    'decision_status', 'decision_explanation', 'next_plan_year',
    'next_year_direct_need_qty', 'next_year_dependent_need_qty',
    'next_year_total_need_qty', 'next_year_suggested_make_qty',
    'next_year_suggested_buy_qty'
  ];
  var DB_EXECUTIVE_FOLLOWUP_NUMERIC_ = {};
  [
    'plan_year', 'item_id', 'category_id', 'is_raw_material', 'has_bom',
    'sales_history_years', 'last_sales_year', 'weighted_sales_average_qty',
    'forecast_this_year_qty', 'sales_actual_this_year_qty',
    'forecast_next_year_qty', 'forecast_growth_next_year_pct',
    'manufacture_history_years', 'last_manufacture_year',
    'average_manufactured_qty', 'parent_product_count',
    'average_unit_ratio_from_parent', 'direct_need_qty', 'dependent_need_qty',
    'total_need_qty', 'current_stock_qty', 'safety_stock_qty',
    'lead_time_demand_qty', 'stock_coverage_days',
    'dependent_demand_share_pct', 'suggested_make_qty', 'suggested_buy_qty',
    'uncovered_qty_before_action', 'next_plan_year',
    'next_year_direct_need_qty', 'next_year_dependent_need_qty',
    'next_year_total_need_qty', 'next_year_suggested_make_qty',
    'next_year_suggested_buy_qty'
  ].forEach(function (key) { DB_EXECUTIVE_FOLLOWUP_NUMERIC_[key] = true; });

  function dbExecutiveFollowupParseJson_(raw, expectedRows) {
    var started = Date.now();
    var parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed) || parsed.length !== expectedRows || parsed.length > DB_EXECUTIVE_FOLLOWUP_LIMIT_) {
      throw new Error('COO follow-up MySQL JSON aggregate is invalid');
    }
    parsed.sort(function (a, b) { return Number(a && a._row_num) - Number(b && b._row_num); });
    for (var i = 0; i < parsed.length; i++) {
      if (!parsed[i] || typeof parsed[i] !== 'object' || Array.isArray(parsed[i]) || Number(parsed[i]._row_num) !== i + 1) {
        throw new Error('COO follow-up MySQL JSON order is invalid');
      }
      delete parsed[i]._row_num;
    }
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
      _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - started;
    }
    return parsed.map(function (row) {
      var clean = {};
      DB_EXECUTIVE_FOLLOWUP_FIELDS_.forEach(function (key) {
        var value = row[key];
        if (DB_EXECUTIVE_FOLLOWUP_NUMERIC_[key]) {
          clean[key] = value === null || value === undefined || value === '' ? null : Number(value);
          if (clean[key] !== null && !Number.isFinite(clean[key])) clean[key] = null;
        } else {
          clean[key] = value === null || value === undefined ? '' : String(value);
        }
      });
      return clean;
    });
  }

  function dbExecutiveFollowup_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbExecutiveFollowup_')) {
      return mysqlRead_(mysqlTcDefinition_('dbExecutiveFollowup_'), data,
        function (p) { return dbExecutiveFollowup_(p, user); });
    }
    var p = data || {};
    var conn, stmt, rs;
    var fieldsSql = DB_EXECUTIVE_FOLLOWUP_FIELDS_.map(function (key) { return '`' + key + '`'; }).join(', ');
    var jsonArgs = ["'_row_num', `_row_num`"];
    DB_EXECUTIVE_FOLLOWUP_FIELDS_.forEach(function (key) {
      jsonArgs.push("'" + key + "', `" + key + "`");
    });
    var orderSql = "CASE WHEN `decision_status` = 'ACTION_REQUIRED' THEN 0 ELSE 1 END, COALESCE(`suggested_make_qty`, 0) DESC, COALESCE(`suggested_buy_qty`, 0) DESC, `item_id` ASC";
    var whereSql = p.year ? ' WHERE `plan_year` = ?' : ' WHERE `plan_year` = YEAR(CURDATE())';
    var bind = p.year ? [Number(p.year)] : [];
    var sql = 'SELECT COUNT(*) AS `row_count`, COALESCE(MAX(`total_count`), 0) AS `total_count`,' +
      " COALESCE(MAX(`cache_refreshed_at`), '') AS `source_refreshed_at`," +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + jsonArgs.join(', ') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        'SELECT `coo_page`.*, ROW_NUMBER() OVER (ORDER BY ' + orderSql + ') AS `_row_num`' +
        ' FROM (' +
          'SELECT ' + fieldsSql + ', `cache_refreshed_at`, COUNT(*) OVER() AS `total_count`' +
          ' FROM `COO_TEST`' + whereSql +
          ' ORDER BY ' + orderSql +
          ' LIMIT ' + DB_EXECUTIVE_FOLLOWUP_LIMIT_ +
        ') AS `coo_page`' +
      ') AS `coo_ranked`';
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, bind);
      rs = stmt.executeQuery();
      var rowCount = 0, total = 0, rowsJson = '[]', sourceRefreshedAt = '';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        total = Number(rs.getString('total_count') || 0);
        sourceRefreshedAt = String(rs.getString('source_refreshed_at') || '');
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var rows = dbExecutiveFollowupParseJson_(rowsJson, rowCount);
      var truncated = total > DB_EXECUTIVE_FOLLOWUP_LIMIT_ || rowCount > DB_EXECUTIVE_FOLLOWUP_LIMIT_;
      if (truncated) rows = rows.slice(0, DB_EXECUTIVE_FOLLOWUP_LIMIT_);
      return {
        status: 'ok', schema_version: 1, rows: rows, total: total,
        truncated: truncated, source: 'MySQL COO_TEST',
        source_refreshed_at: sourceRefreshedAt, served_at: Date.now(),
        snapshot_ttl: DB_EXECUTIVE_FOLLOWUP_TTL_
      };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  function getExecutiveFollowup_(data, user) {
    return readDiagnosticsForUser_(dbExecutiveFollowup_(data || {}, user), user);
  }
  register('get_executive_followup', getExecutiveFollowup_);

  // Compact COO landing payload. This is intentionally separate from the
  // detailed follow-up reader above: the landing page should load three small
  // decision datasets, not hundreds of rows that a COO does not need first.
  function dbExecutiveSummaryParseRankedJson_(raw, expectedRows, maxRows, label) {
    var started = Date.now();
    var parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed) || parsed.length !== expectedRows || parsed.length > maxRows) {
      throw new Error((label || 'COO summary') + ' MySQL JSON aggregate is invalid');
    }
    parsed.sort(function (a, b) { return Number(a && a._row_num) - Number(b && b._row_num); });
    for (var i = 0; i < parsed.length; i++) {
      if (!parsed[i] || typeof parsed[i] !== 'object' || Array.isArray(parsed[i]) || Number(parsed[i]._row_num) !== i + 1) {
        throw new Error((label || 'COO summary') + ' MySQL JSON order is invalid');
      }
      delete parsed[i]._row_num;
    }
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
      _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - started;
    }
    return parsed;
  }

  function dbExecutiveSummaryAggregate_(conn, sql, params, maxRows, label) {
    var stmt, rs;
    try {
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, params || []);
      try {
        rs = stmt.executeQuery();
      } catch (queryError) {
        throw new Error((label || 'COO summary') + ' failed: ' + String(queryError && queryError.message || queryError));
      }
      var rowCount = 0, rowsJson = '[]', sourceRefreshedAt = '', weekTotal = 0;
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
        try { sourceRefreshedAt = String(rs.getString('source_refreshed_at') || ''); } catch (ignoreSource) {}
        try { weekTotal = Number(rs.getString('week_total') || 0); } catch (ignoreTotal) {}
      }
      return {
        rows: dbExecutiveSummaryParseRankedJson_(rowsJson, rowCount, maxRows, label),
        source_refreshed_at: sourceRefreshedAt,
        week_total: weekTotal
      };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
    }
  }

  function dbExecutiveSummaryDecisionSql_(type, limit) {
    var isMake = type === 'MAKE';
    var quantity = isMake ? 'suggested_make_qty' : 'suggested_buy_qty';
    var json = [
      "'_row_num', `_row_num`", "'rank_no', `_row_num`", "'item_id', `item_id`", "'item_name', `item_name`",
      "'suggested_qty', `suggested_qty`", "'total_need_qty', `total_need_qty`",
      "'direct_need_qty', `direct_need_qty`", "'dependent_need_qty', `dependent_need_qty`",
      "'current_stock_qty', `current_stock_qty`", "'safety_stock_qty', `safety_stock_qty`",
      "'stock_coverage_days', `stock_coverage_days`", "'lead_time_demand_qty', `lead_time_demand_qty`",
      "'weighted_sales_average_qty', `weighted_sales_average_qty`", "'forecast_this_year_qty', `forecast_this_year_qty`",
      "'sales_actual_this_year_qty', `sales_actual_this_year_qty`",
      "'sales_history_years', `sales_history_years`", "'last_sales_year', `last_sales_year`",
      "'manufacture_history_years', `manufacture_history_years`", "'average_manufactured_qty', `average_manufactured_qty`",
      "'decision_confidence', `decision_confidence`", "'decision_explanation', `decision_explanation`"
    ];
    return 'SELECT COUNT(*) AS `row_count`,' +
      " COALESCE(MAX(`source_refreshed_at`), '') AS `source_refreshed_at`," +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + json.join(', ') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        'SELECT `top_page`.*, ROW_NUMBER() OVER (ORDER BY `suggested_qty` DESC, `item_id` ASC) AS `_row_num`' +
        ' FROM (' +
          'SELECT `candidate`.* FROM (' +
            'SELECT `c`.`item_id`, `c`.`item_name`, `c`.`' + quantity + '` AS `suggested_qty`,' +
              ' `c`.`total_need_qty`, `c`.`direct_need_qty`, `c`.`dependent_need_qty`,' +
              ' `c`.`current_stock_qty`, `c`.`safety_stock_qty`, `c`.`stock_coverage_days`, `c`.`lead_time_demand_qty`,' +
              ' `c`.`weighted_sales_average_qty`, `c`.`forecast_this_year_qty`,' +
              ' `c`.`sales_actual_this_year_qty`, `c`.`sales_history_years`, `c`.`last_sales_year`,' +
              ' `c`.`manufacture_history_years`, `c`.`average_manufactured_qty`,' +
              ' `c`.`decision_confidence`, `c`.`decision_explanation`,' +
              ' `c`.`cache_refreshed_at` AS `source_refreshed_at`,' +
              ' ROW_NUMBER() OVER (PARTITION BY `c`.`item_id` ORDER BY `c`.`' + quantity + '` DESC, `c`.`last_sales_year` DESC, `c`.`item_id` ASC) AS `item_rank`' +
            ' FROM `COO_TEST` `c`' +
            " WHERE `c`.`plan_year` = YEAR(CURDATE()) AND `c`.`supply_type` = '" + type + "'" +
            " AND `c`.`decision_status` = 'ACTION_REQUIRED' AND COALESCE(`c`.`" + quantity + "`, 0) > 0" +
          ') AS `candidate` WHERE `candidate`.`item_rank` = 1' +
          ' ORDER BY `candidate`.`suggested_qty` DESC, `candidate`.`item_id` ASC LIMIT ' + limit +
        ') AS `top_page`' +
      ') AS `ranked`';
  }

  function dbExecutiveSummaryComponents_(conn, parents) {
    if (!parents.length) return [];
    var parentPlan = parents.map(function () { return 'SELECT ? AS `parent_id`, ? AS `suggested_qty`'; }).join(' UNION ALL ');
    var inMarks = parents.map(function () { return '?'; }).join(', ');
    var parentParams = [];
    parents.forEach(function (parent) {
      parentParams.push(String(parent.item_id), Number(parent.suggested_qty) || 0);
    });
    var inParams = parents.map(function (parent) { return String(parent.item_id); });
    var json = [
      "'_row_num', `_row_num`", "'parent_id', `parent_id`", "'component_id', `component_id`", "'component_name', `component_name`",
      "'unit_ratio', `unit_ratio`", "'required_qty', `required_qty`", "'current_qty', `current_qty`",
      "'component_rank', `component_rank`"
    ];
    var sql = 'WITH `parent_plan` AS (' + parentPlan + '),' +
      ' `usage_ratio` AS (' +
        'SELECT `mh`.`product_id` AS `parent_id`, `mf`.`product_id` AS `component_id`,' +
          ' SUM(CAST(`mf`.`productQuantity` AS DECIMAL(24,6))) / NULLIF(SUM(CAST(`mh`.`deliver_quantity` AS DECIMAL(24,6))), 0) AS `unit_ratio`' +
        ' FROM `manufacture_headers` `mh` JOIN `manufacture_footers` `mf`' +
          ' ON `mh`.`id` = `mf`.`manufacture_header_id`' +
        ' WHERE `mh`.`product_id` IN (' + inMarks + ')' +
          ' AND `mh`.`deleted_at` IS NULL AND `mh`.`deliver_quantity` <> 0' +
          ' AND `mf`.`productQuantity` <> 0' +
          " AND `mh`.`updated_at` < STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-01-01'), '%Y-%m-%d')" +
        ' GROUP BY `mh`.`product_id`, `mf`.`product_id`' +
      '),' +
      ' `component_page` AS (' +
        'SELECT `pp`.`parent_id`, `ur`.`component_id`,' +
          " COALESCE(`p`.`name_ar`, CONCAT('#', `ur`.`component_id`)) AS `component_name`," +
          ' `ur`.`unit_ratio`,' +
          ' (`pp`.`suggested_qty` * `ur`.`unit_ratio`) AS `required_qty`,' +
          ' COALESCE(`pc`.`current_qty`, 0) AS `current_qty`,' +
          ' ROW_NUMBER() OVER (PARTITION BY `pp`.`parent_id` ORDER BY (`pp`.`suggested_qty` * `ur`.`unit_ratio`) DESC, `ur`.`component_id` ASC) AS `component_rank`' +
        ' FROM `usage_ratio` `ur` JOIN `parent_plan` `pp` ON `pp`.`parent_id` = `ur`.`parent_id`' +
        ' LEFT JOIN `products` `p` ON `p`.`id` = `ur`.`component_id`' +
          ' LEFT JOIN `product_current_quantity` `pc` ON `pc`.`id` = `ur`.`component_id`' +
      '),' +
      ' `limited` AS (SELECT * FROM `component_page` WHERE `component_rank` <= 5)' +
      ' SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + json.join(', ') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        'SELECT `limited`.*, ROW_NUMBER() OVER (ORDER BY `parent_id` ASC, `component_rank` ASC, `component_id` ASC) AS `_row_num`' +
        ' FROM `limited`' +
      ') AS `ranked`';
    var result = dbExecutiveSummaryAggregate_(conn, sql, parentParams.concat(inParams), 250, 'COO component summary');
    return result.rows.map(function (row) {
      return {
        parent_id: String(row.parent_id || ''),
        component_id: row.component_id == null ? null : Number(row.component_id),
        component_name: String(row.component_name || ''),
        unit_ratio: Number(row.unit_ratio) || 0,
        required_qty: Number(row.required_qty) || 0,
        current_qty: Number(row.current_qty) || 0,
        component_rank: Number(row.component_rank) || 0
      };
    });
  }

  function dbExecutiveSummaryExpensesSql_() {
    return 'SELECT COUNT(*) AS `row_count`, COALESCE(SUM(`expense_day_amount`), 0) AS `week_total`,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
        "'_row_num', `_row_num`, 'day', `expense_day`, 'amount', `expense_day_amount`, 'moves', `move_count`" +
      ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        'SELECT `daily`.*, ROW_NUMBER() OVER (ORDER BY `expense_day` ASC) AS `_row_num`' +
        ' FROM (' +
          'SELECT DATE(`transaction_date`) AS `expense_day`,' +
            ' SUM(CAST(COALESCE(`transaction_amount`, 0) AS DECIMAL(24,6))) AS `expense_day_amount`,' +
            ' COUNT(*) AS `move_count`' +
          ' FROM `regular_box_movement`' +
          " WHERE `transaction_type` = 'credit'" +
            ' AND `transaction_date` >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)' +
            ' AND `transaction_date` < DATE_ADD(CURDATE(), INTERVAL 1 DAY)' +
          ' GROUP BY DATE(`transaction_date`)' +
          ' ORDER BY `expense_day` ASC' +
        ') AS `daily`' +
      ') AS `ranked`';
  }

  function dbExecutiveSummaryExpenseAccountsSql_() {
    return 'WITH `weekly_accounts` AS (' +
        'SELECT TRIM(COALESCE(`chart_of_accounts`, \'\')) AS `account_code`,' +
          ' SUM(CAST(COALESCE(`transaction_amount`, 0) AS DECIMAL(24,6))) AS `account_amount`,' +
          ' COUNT(*) AS `move_count`' +
        ' FROM `regular_box_movement`' +
        " WHERE `transaction_type` = 'credit'" +
          ' AND `transaction_date` >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)' +
          ' AND `transaction_date` < DATE_ADD(CURDATE(), INTERVAL 1 DAY)' +
          ' AND TRIM(COALESCE(`chart_of_accounts`, \'\')) <> \'\'' +
        ' GROUP BY TRIM(COALESCE(`chart_of_accounts`, \'\'))' +
      '), `account_labels` AS (' +
        'SELECT TRIM(CAST(`id_5` AS CHAR)) AS `account_code`,' +
          ' MAX(NULLIF(TRIM(`account_5_name`), \'\')) AS `account_name`' +
        ' FROM `chart_of_accounts_main` WHERE `id_5` IS NOT NULL' +
        ' GROUP BY TRIM(CAST(`id_5` AS CHAR))' +
      '), `account_page` AS (' +
        'SELECT `w`.`account_code`,' +
          ' COALESCE(`l`.`account_name`, CONCAT(\'Account \', `w`.`account_code`)) AS `account_name`,' +
          ' `w`.`account_amount`, `w`.`move_count`,' +
          ' CASE WHEN SUM(`w`.`account_amount`) OVER () = 0 THEN 0' +
            ' ELSE (`w`.`account_amount` * 100.0 / SUM(`w`.`account_amount`) OVER ()) END AS `share_pct`' +
        ' FROM `weekly_accounts` `w` LEFT JOIN `account_labels` `l`' +
          ' ON `l`.`account_code` = `w`.`account_code`' +
        ' ORDER BY `w`.`account_amount` DESC, `w`.`account_code` ASC LIMIT 12' +
      ')' +
      ' SELECT COUNT(*) AS `row_count`,' +
        ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
          "'_row_num', `_row_num`, 'account_code', `account_code`, 'account_name', `account_name`," +
          " 'amount', `account_amount`, 'moves', `move_count`, 'share_pct', `share_pct`" +
        ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        'SELECT `account_page`.*, ROW_NUMBER() OVER (ORDER BY `account_amount` DESC, `account_code` ASC) AS `_row_num`' +
        ' FROM `account_page`' +
      ') AS `ranked`';
  }

  function dbExecutiveSummary_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbExecutiveSummary_')) {
      return mysqlRead_(mysqlTcDefinition_('dbExecutiveSummary_'), data,
        function (p) { return dbExecutiveSummary_(p, user); });
    }
    var conn, makeAgg, buyAgg, expenseAgg, expenseAccountAgg, components;
    try {
      conn = dbGetConnection_();
      makeAgg = dbExecutiveSummaryAggregate_(conn, dbExecutiveSummaryDecisionSql_('MAKE', 15), [], 15, 'COO manufacturing summary');
      var manufacturing = makeAgg.rows.map(function (row) {
        return {
          rank: Number(row.rank_no) || 0,
          item_id: row.item_id == null ? null : Number(row.item_id),
          item_name: String(row.item_name || ''),
          suggested_qty: Number(row.suggested_qty) || 0,
          total_need_qty: Number(row.total_need_qty) || 0,
          direct_need_qty: Number(row.direct_need_qty) || 0,
          dependent_need_qty: Number(row.dependent_need_qty) || 0,
          current_stock_qty: Number(row.current_stock_qty) || 0,
          safety_stock_qty: Number(row.safety_stock_qty) || 0,
          stock_coverage_days: row.stock_coverage_days == null ? null : Number(row.stock_coverage_days),
          lead_time_demand_qty: Number(row.lead_time_demand_qty) || 0,
          weighted_sales_average_qty: Number(row.weighted_sales_average_qty) || 0,
          forecast_this_year_qty: Number(row.forecast_this_year_qty) || 0,
          sales_actual_this_year_qty: Number(row.sales_actual_this_year_qty) || 0,
          sales_history_years: Number(row.sales_history_years) || 0,
          last_sales_year: Number(row.last_sales_year) || 0,
          manufacture_history_years: Number(row.manufacture_history_years) || 0,
          average_manufactured_qty: Number(row.average_manufactured_qty) || 0,
          decision_confidence: String(row.decision_confidence || ''),
          decision_explanation: String(row.decision_explanation || ''),
          components: []
        };
      });
      components = dbExecutiveSummaryComponents_(conn, manufacturing);
      var componentsByParent = {};
      components.forEach(function (component) {
        (componentsByParent[component.parent_id] = componentsByParent[component.parent_id] || []).push(component);
      });
      manufacturing.forEach(function (parent) {
        parent.components = componentsByParent[String(parent.item_id)] || [];
      });

      buyAgg = dbExecutiveSummaryAggregate_(conn, dbExecutiveSummaryDecisionSql_('BUY', 15), [], 15, 'COO purchasing summary');
      var purchasing = buyAgg.rows.map(function (row) {
        return {
          rank: Number(row.rank_no) || 0,
          item_id: row.item_id == null ? null : Number(row.item_id),
          item_name: String(row.item_name || ''),
          suggested_qty: Number(row.suggested_qty) || 0,
          total_need_qty: Number(row.total_need_qty) || 0,
          direct_need_qty: Number(row.direct_need_qty) || 0,
          dependent_need_qty: Number(row.dependent_need_qty) || 0,
          current_stock_qty: Number(row.current_stock_qty) || 0,
          safety_stock_qty: Number(row.safety_stock_qty) || 0,
          stock_coverage_days: row.stock_coverage_days == null ? null : Number(row.stock_coverage_days),
          lead_time_demand_qty: Number(row.lead_time_demand_qty) || 0,
          weighted_sales_average_qty: Number(row.weighted_sales_average_qty) || 0,
          forecast_this_year_qty: Number(row.forecast_this_year_qty) || 0,
          sales_actual_this_year_qty: Number(row.sales_actual_this_year_qty) || 0,
          sales_history_years: Number(row.sales_history_years) || 0,
          last_sales_year: Number(row.last_sales_year) || 0,
          manufacture_history_years: Number(row.manufacture_history_years) || 0,
          average_manufactured_qty: Number(row.average_manufactured_qty) || 0,
          decision_confidence: String(row.decision_confidence || ''),
          decision_explanation: String(row.decision_explanation || '')
        };
      });
      expenseAgg = dbExecutiveSummaryAggregate_(conn, dbExecutiveSummaryExpensesSql_(), [], 7, 'COO weekly expense summary');
      var weeklyExpenses = expenseAgg.rows.map(function (row) {
        return {
          day: String(row.day || ''),
          amount: Number(row.amount) || 0,
          moves: Number(row.moves) || 0
        };
      });
      expenseAccountAgg = dbExecutiveSummaryAggregate_(conn, dbExecutiveSummaryExpenseAccountsSql_(), [], 12, 'COO weekly expense account summary');
      var weeklyExpenseAccounts = expenseAccountAgg.rows.map(function (row) {
        return {
          account_code: String(row.account_code || ''),
          account_name: String(row.account_name || ''),
          amount: Number(row.amount) || 0,
          moves: Number(row.moves) || 0,
          share_pct: Number(row.share_pct) || 0
        };
      });
      return {
        status: 'ok', schema_version: 2,
        source: 'MySQL COO_TEST + manufacture history + regular_box_movement + chart_of_accounts_main',
        source_refreshed_at: makeAgg.source_refreshed_at || buyAgg.source_refreshed_at || '',
        generated_at: Date.now(),
        manufacturing: manufacturing,
        purchasing: purchasing,
        weekly_expenses: weeklyExpenses,
        weekly_expense_accounts: weeklyExpenseAccounts,
        weekly_expense_total: Number(expenseAgg.week_total) || 0
      };
    } finally {
      if (conn) conn.close();
    }
  }

  function getExecutiveFollowupSummary_(data, user) {
    return readDiagnosticsForUser_(dbExecutiveSummary_(data || {}, user), user);
  }
  register('get_executive_followup_summary', getExecutiveFollowupSummary_);

  // Financial ratios page: shared selectable periods for sales, returns and
  // the income-statement view; every query below is read-only.
  function dbTcFinancialSalesParams_(data) {
    data = data || {};
    function date_(key) {
      var value = String(data[key] == null ? '' : data[key]).trim();
      var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!parts) throw new Error('تاريخ غير صحيح: ' + key);
      var day = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
      if (day.getUTCFullYear() !== Number(parts[1]) || day.getUTCMonth() + 1 !== Number(parts[2]) || day.getUTCDate() !== Number(parts[3])) throw new Error('تاريخ غير صحيح: ' + key);
      return value;
    }
    var p = { from: date_('from'), to: date_('to') };
    if (p.from > p.to) throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    return p;
  }

  // These stored value fields mirror sales_product_qty_value. EXISTS keeps a
  // return linked to an invoice product from multiplying across repeated lines.
  function dbTcFinancialSalesTotals_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbTcFinancialSalesTotals_')) {
      return mysqlRead_(mysqlTcDefinition_('dbTcFinancialSalesTotals_'), data,
        function (p) { return dbTcFinancialSalesTotals_(p, user); });
    }
    var p = dbTcFinancialSalesParams_(data);
    var sql = 'SELECT' +
      ' (SELECT COALESCE(SUM(f.productTotalMoney), 0)' +
      ' FROM invoice_footers f JOIN invoice_headers h ON h.id = f.invoice_header_id' +
      ' WHERE h.invoiceDate >= ? AND h.invoiceDate <= ?) AS sales_value,' +
      ' (SELECT COALESCE(SUM(r.total_amount), 0)' +
      ' FROM item_returns r JOIN invoice_headers h ON h.id = r.invoice_id' +
      ' WHERE r.created_at >= ? AND r.created_at < DATE_ADD(?, INTERVAL 1 DAY)' +
      ' AND EXISTS (SELECT 1 FROM invoice_footers f' +
      ' WHERE f.invoice_header_id = r.invoice_id AND f.product_id = r.product_id)) AS return_value';
    var conn, stmt, rs, monthRows = [];
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, [p.from, p.to, p.from, p.to]);
      rs = stmt.executeQuery();
      if (!rs.next()) throw new Error('تعذر قراءة إجمالي المبيعات');
      var sales = Number(rs.getObject(1)) || 0;
      var returns = Number(rs.getObject(2)) || 0;
      rs.close(); rs = null;
      stmt.close(); stmt = null;
      var monthSql = 'SELECT monthly_events.month_key,' +
        ' SUM(monthly_events.sales_value) AS sales_value,' +
        ' SUM(monthly_events.return_value) AS return_value' +
        ' FROM (' +
          ' SELECT DATE_FORMAT(h.invoiceDate, \'%Y-%m\') AS month_key,' +
          ' SUM(f.productTotalMoney) AS sales_value, 0 AS return_value' +
          ' FROM invoice_footers f JOIN invoice_headers h ON h.id = f.invoice_header_id' +
          ' WHERE h.invoiceDate >= ? AND h.invoiceDate <= ?' +
          ' GROUP BY DATE_FORMAT(h.invoiceDate, \'%Y-%m\')' +
          ' UNION ALL' +
          ' SELECT DATE_FORMAT(r.created_at, \'%Y-%m\') AS month_key,' +
          ' 0 AS sales_value, SUM(r.total_amount) AS return_value' +
          ' FROM item_returns r JOIN invoice_headers h ON h.id = r.invoice_id' +
          ' WHERE r.created_at >= ? AND r.created_at < DATE_ADD(?, INTERVAL 1 DAY)' +
          ' AND EXISTS (SELECT 1 FROM invoice_footers f' +
          ' WHERE f.invoice_header_id = r.invoice_id AND f.product_id = r.product_id)' +
          ' GROUP BY DATE_FORMAT(r.created_at, \'%Y-%m\')' +
        ') monthly_events GROUP BY monthly_events.month_key ORDER BY monthly_events.month_key';
      stmt = conn.prepareStatement(monthSql);
      dbBindParams_(stmt, [p.from, p.to, p.from, p.to]);
      rs = stmt.executeQuery();
      while (rs.next()) {
        var monthSales = Number(rs.getObject(2)) || 0;
        var monthReturns = Number(rs.getObject(3)) || 0;
        monthRows.push({ month: String(rs.getString(1)), sales_value: monthSales,
          return_value: monthReturns, net_sales_value: monthSales - monthReturns });
      }
      return { status: 'ok', filters: p, currency: 'EGP', sales_value: sales,
        return_value: returns, net_sales_value: sales - returns, monthly: monthRows };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  register('get_financial_sales_totals', function (data, user) {
    return readDiagnosticsForUser_(dbTcFinancialSalesTotals_(data, user), user);
  });

  function dbTcFinancialOtherIncome_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbTcFinancialOtherIncome_')) {
      return mysqlRead_(mysqlTcDefinition_('dbTcFinancialOtherIncome_'), data,
        function (p) { return dbTcFinancialOtherIncome_(p, user); });
    }
    var p = dbTcFinancialSalesParams_(data);
    var sql = 'SELECT account_5_name,' +
      ' COALESCE(SUM(COALESCE(debit_sum, 0) - COALESCE(credit_sum, 0)), 0) AS net_amount' +
      ' FROM expenses_income_report' +
      ' WHERE transaction_date >= ? AND transaction_date <= ?' +
      " AND TRIM(chart_of_accounts) REGEXP '^[0-9]+$'" +
      ' AND CAST(TRIM(chart_of_accounts) AS DECIMAL(20,0)) > 412100' +
      ' GROUP BY account_5_name ORDER BY account_5_name';
    var conn, stmt, rs, rows = [], total = 0;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, [p.from, p.to]);
      rs = stmt.executeQuery();
      while (rs.next()) {
        var amount = Number(rs.getObject(2)) || 0;
        rows.push({ account_5_name: rs.getString(1), net_amount: amount });
        total += amount;
      }
      rs.close(); rs = null;
      stmt.close(); stmt = null;
      var monthlySql = 'SELECT DATE_FORMAT(transaction_date, \'%Y-%m\') AS month_key,' +
        ' COALESCE(SUM(COALESCE(debit_sum, 0) - COALESCE(credit_sum, 0)), 0) AS net_amount' +
        ' FROM expenses_income_report' +
        ' WHERE transaction_date >= ? AND transaction_date <= ?' +
        " AND TRIM(chart_of_accounts) REGEXP '^[0-9]+$'" +
        ' AND CAST(TRIM(chart_of_accounts) AS DECIMAL(20,0)) > 412100' +
        ' GROUP BY DATE_FORMAT(transaction_date, \'%Y-%m\') ORDER BY month_key';
      stmt = conn.prepareStatement(monthlySql);
      dbBindParams_(stmt, [p.from, p.to]);
      rs = stmt.executeQuery();
      var monthly = [];
      while (rs.next()) monthly.push({ month: String(rs.getString(1)), net_amount: Number(rs.getObject(2)) || 0 });
      return { status: 'ok', filters: p, rows: rows, total_net_amount: total, monthly: monthly };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  register('get_financial_other_income', function (data, user) {
    return readDiagnosticsForUser_(dbTcFinancialOtherIncome_(data, user), user);
  });

  function dbTcFinancialExpenses_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbTcFinancialExpenses_')) {
      return mysqlRead_(mysqlTcDefinition_('dbTcFinancialExpenses_'), data,
        function (p) { return dbTcFinancialExpenses_(p, user); });
    }
    var p = dbTcFinancialSalesParams_(data);
    var sql = 'SELECT account_5_name,' +
      ' COALESCE(SUM(COALESCE(debit_sum, 0) - COALESCE(credit_sum, 0)), 0) AS net_amount' +
      ' FROM expenses_income_report' +
      ' WHERE transaction_date >= ? AND transaction_date <= ?' +
      " AND TRIM(chart_of_accounts) REGEXP '^[0-9]+$'" +
      ' AND CAST(TRIM(chart_of_accounts) AS DECIMAL(20,0)) < 411100' +
      ' GROUP BY account_5_name ORDER BY net_amount ASC, account_5_name';
    var conn, stmt, rs, rows = [], total = 0;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, [p.from, p.to]);
      rs = stmt.executeQuery();
      while (rs.next()) {
        var amount = Number(rs.getObject(2)) || 0;
        rows.push({ account_5_name: rs.getString(1), net_amount: amount });
        total += amount;
      }
      rs.close(); rs = null;
      stmt.close(); stmt = null;
      var monthlySql = 'SELECT DATE_FORMAT(transaction_date, \'%Y-%m\') AS month_key,' +
        ' COALESCE(SUM(COALESCE(debit_sum, 0) - COALESCE(credit_sum, 0)), 0) AS net_amount' +
        ' FROM expenses_income_report' +
        ' WHERE transaction_date >= ? AND transaction_date <= ?' +
        " AND TRIM(chart_of_accounts) REGEXP '^[0-9]+$'" +
        ' AND CAST(TRIM(chart_of_accounts) AS DECIMAL(20,0)) < 411100' +
        ' GROUP BY DATE_FORMAT(transaction_date, \'%Y-%m\') ORDER BY month_key';
      stmt = conn.prepareStatement(monthlySql);
      dbBindParams_(stmt, [p.from, p.to]);
      rs = stmt.executeQuery();
      var monthly = [];
      while (rs.next()) monthly.push({ month: String(rs.getString(1)), net_amount: Number(rs.getObject(2)) || 0 });
      return { status: 'ok', filters: p, rows: rows, total_net_amount: total, monthly: monthly };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  register('get_financial_expenses', function (data, user) {
    return readDiagnosticsForUser_(dbTcFinancialExpenses_(data, user), user);
  });

  function dbTcFinancialProductionParams_(data) {
    var p = dbTcFinancialSalesParams_(data);
    var offset = data && data.offset !== undefined && data.offset !== '' ? Number(data.offset) : 0;
    if (!Number.isInteger(offset) || offset < 0) throw new Error('صفحة الإنتاج غير صحيحة');
    return { from: p.from, to: p.to, offset: Math.min(offset, 1000000), limit: 30,
      refresh: data && (data.refresh === true || data.refresh === 'true' || data.refresh === '1') };
  }

  // Bounded report snapshots: one aggregation per normalized date range,
  // served for 120s. Pages slice the snapshot without repeating the heavy
  // GROUP BY. Filter changes use a different cache key, refresh:true bypasses
  // the cached snapshot, and every application SQL write bumps the durable
  // epoch (mysqlInvalidate_) so the next page recomputes. External writes
  // become visible at expiry. Snapshot cap 2000 distinct products keeps the
  // cached payload bounded; totals stay accurate via COUNT, rows beyond the
  // cap set truncated:true.
  var DB_TC_FINANCIAL_SNAPSHOT_TTL_ = 120;
  var DB_TC_FINANCIAL_SNAPSHOT_LIMIT_ = 2000;

  // MySQL's JSON aggregate avoids Apps Script's slow row-by-row JDBC bridge.
  // JSON_ARRAYAGG does not promise element order, so each SQL row carries an
  // explicit rank and we restore the report's stable SQL order after parsing.
  function dbTcFinancialParseSnapshotJson_(raw, expectedRows) {
    var parseStarted = Date.now();
    var parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed) || parsed.length !== expectedRows || parsed.length > DB_TC_FINANCIAL_SNAPSHOT_LIMIT_ + 1) {
      throw new Error('Financial report MySQL aggregate is invalid');
    }
    parsed.sort(function (a, b) { return Number(a && a._row_num) - Number(b && b._row_num); });
    for (var i = 0; i < parsed.length; i++) {
      if (!parsed[i] || typeof parsed[i] !== 'object' || Array.isArray(parsed[i]) || Number(parsed[i]._row_num) !== i + 1) {
        throw new Error('Financial report MySQL aggregate order is invalid');
      }
      delete parsed[i]._row_num;
    }
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
      _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - parseStarted;
    }
    return parsed;
  }

  // Build the shared used-material query for both the report and its admin-only EXPLAIN.
  function dbTcFinancialUsedMaterialsSnapshotSql_() {
    var baseSql = ' FROM manufacture_headers h' +
      ' STRAIGHT_JOIN manufacture_report_view v ON v.col1_id = CAST(h.id AS CHAR CHARACTER SET utf8mb4)' +
      ' JOIN products pr ON pr.id = CAST(v.col2_prod_id AS UNSIGNED)' +
      " WHERE v.sort_order = 3 AND h.status = 'delivered' AND h.deleted_at IS NULL" +
      ' AND h.created_at >= ? AND h.created_at < DATE_ADD(?, INTERVAL 1 DAY)' +
      ' AND pr.category_id NOT IN (3, 9, 10, 11, 13, 14, 15, 18, 19, 20, 21)';
    var normalizedSql = 'SELECT CAST(v.col2_prod_id AS UNSIGNED) AS product_id,' +
      ' MAX(pr.name_ar) AS name_ar, MAX(v.col4_expected) AS unit,' +
      ' SUM(CASE' +
        " WHEN TRIM(COALESCE(v.col6_deliv_ratio, '')) REGEXP '^[0-9]+([.][0-9]+)?$'" +
        ' AND CAST(TRIM(v.col6_deliv_ratio) AS DECIMAL(18,4)) > 0' +
        ' THEN SIGN(CAST(TRIM(v.col6_deliv_ratio) AS DECIMAL(18,4))) * CEIL(ABS(CAST(TRIM(v.col6_deliv_ratio) AS DECIMAL(18,4))))' +
        " WHEN TRIM(COALESCE(v.col5_deliv_qty, '')) REGEXP '^-?[0-9]+([.][0-9]+)?$'" +
        ' THEN SIGN(CAST(TRIM(v.col5_deliv_qty) AS DECIMAL(18,4))) * CEIL(ABS(CAST(TRIM(v.col5_deliv_qty) AS DECIMAL(18,4)))) ELSE 0 END) AS supposed_qty,' +
      ' SUM(CASE WHEN TRIM(COALESCE(v.col7_manuf_num, \'\')) REGEXP \'^[0-9]+([.][0-9]+)?$\'' +
        ' THEN CAST(TRIM(v.col7_manuf_num) AS DECIMAL(18,4)) ELSE 0 END) AS used_qty' + baseSql +
      ' GROUP BY CAST(v.col2_prod_id AS UNSIGNED)';
    return 'SELECT COUNT(*) AS row_count, COALESCE(MAX(total_count), 0) AS total_count,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
        "'_row_num', _row_num," +
        "'product_id', CAST(product_id AS CHAR)," +
        "'name_ar', name_ar," +
        "'unit', unit," +
        "'supposed_qty', supposed_qty," +
        "'used_qty', used_qty," +
        "'difference_qty', difference_qty," +
        "'difference_ratio', difference_ratio" +
      ')), JSON_ARRAY()) AS rows_json FROM (' +
        'SELECT material_page.*,' +
          ' ROW_NUMBER() OVER (ORDER BY used_qty DESC, product_id ASC) AS _row_num' +
        ' FROM (' +
          'SELECT product_id, name_ar, unit, supposed_qty, used_qty,' +
            ' (used_qty - supposed_qty) AS difference_qty,' +
            ' CASE WHEN supposed_qty = 0 THEN NULL ELSE ((used_qty - supposed_qty) / supposed_qty) * 100 END AS difference_ratio,' +
            ' COUNT(*) OVER() AS total_count' +
          ' FROM (' + normalizedSql + ') material_totals' +
          ' ORDER BY used_qty DESC, product_id ASC' +
          ' LIMIT ' + (DB_TC_FINANCIAL_SNAPSHOT_LIMIT_ + 1) +
        ') material_page' +
      ') material_ranked';
  }

  function dbTcFinancialProductionSnapshot_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbTcFinancialProductionSnapshot_')) {
      return mysqlRead_(mysqlTcDefinition_('dbTcFinancialProductionSnapshot_'), data,
        function (p) { return dbTcFinancialProductionSnapshot_(p, user); });
    }
    var p = dbTcFinancialSalesParams_(data);
    var conn, stmt, rs, total = 0, rows = [];
    var filterSql = ' FROM manufacture_headers h JOIN products p ON p.id = h.product_id' +
      " WHERE h.status = 'delivered' AND h.deleted_at IS NULL AND h.product_id IS NOT NULL" +
      ' AND h.created_at >= ? AND h.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'SELECT COUNT(*) AS row_count, COALESCE(MAX(total_count), 0) AS total_count,' +
        ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
          "'_row_num', _row_num," +
          "'product_id', CAST(product_id AS CHAR)," +
          "'name_ar', name_ar," +
          "'expected_quantity', expected_quantity," +
          "'deliver_quantity', deliver_quantity" +
        ')), JSON_ARRAY()) AS rows_json FROM (' +
          'SELECT production_page.*,' +
            ' ROW_NUMBER() OVER (ORDER BY deliver_quantity DESC, product_id ASC) AS _row_num' +
          ' FROM (' +
            'SELECT production_totals.*, COUNT(*) OVER() AS total_count' +
            ' FROM (' +
              'SELECT h.product_id, MAX(p.name_ar) AS name_ar,' +
                ' SUM(COALESCE(h.expected_quantity, 0)) AS expected_quantity,' +
                ' SUM(COALESCE(h.deliver_quantity, 0)) AS deliver_quantity' + filterSql +
                ' GROUP BY h.product_id' +
            ') production_totals' +
            ' ORDER BY deliver_quantity DESC, product_id ASC' +
            ' LIMIT ' + (DB_TC_FINANCIAL_SNAPSHOT_LIMIT_ + 1) +
          ') production_page' +
        ') production_ranked');
      dbBindParams_(stmt, [p.from, p.to]);
      rs = stmt.executeQuery();
      var rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        total = Number(rs.getString('total_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      rows = dbTcFinancialParseSnapshotJson_(rowsJson, rowCount).map(function (row) {
        return {
          product_id: String(row.product_id == null ? '' : row.product_id),
          name_ar: String(row.name_ar == null ? '' : row.name_ar),
          expected_quantity: Number(row.expected_quantity) || 0,
          deliver_quantity: Number(row.deliver_quantity) || 0
        };
      });
      var truncated = rows.length > DB_TC_FINANCIAL_SNAPSHOT_LIMIT_;
      if (truncated) rows = rows.slice(0, DB_TC_FINANCIAL_SNAPSHOT_LIMIT_);
      return { status: 'ok', filters: { from: p.from, to: p.to }, rows: rows,
        total: total, truncated: truncated, snapshot_at: Date.now(),
        snapshot_ttl: DB_TC_FINANCIAL_SNAPSHOT_TTL_ };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  function dbTcFinancialProduction_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbTcFinancialProduction_')) {
      return mysqlRead_(mysqlTcDefinition_('dbTcFinancialProduction_'), data,
        function (p) { return dbTcFinancialProduction_(p, user); });
    }
    var p = dbTcFinancialProductionParams_(data);
    var snap = dbTcFinancialProductionSnapshot_({ from: p.from, to: p.to, refresh: p.refresh }, user);
    var pageRows = snap.rows.slice(p.offset, p.offset + p.limit);
    return { status: 'ok', filters: { from: p.from, to: p.to }, rows: pageRows,
      total: snap.total, offset: p.offset, limit: p.limit, has_more: p.offset + pageRows.length < snap.total,
      truncated: snap.truncated, snapshot_at: snap.snapshot_at, snapshot_ttl: snap.snapshot_ttl };
  }

  register('get_financial_production', function (data, user) {
    return readDiagnosticsForUser_(dbTcFinancialProduction_(data, user), user);
  });

  function dbTcFinancialUsedMaterialsParams_(data) {
    var p = dbTcFinancialProductionParams_(data);
    return { from: p.from, to: p.to, offset: p.offset, limit: 30, refresh: p.refresh };
  }

  function dbTcFinancialUsedMaterialsSnapshot_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbTcFinancialUsedMaterialsSnapshot_')) {
      return mysqlRead_(mysqlTcDefinition_('dbTcFinancialUsedMaterialsSnapshot_'), data,
        function (p) { return dbTcFinancialUsedMaterialsSnapshot_(p, user); });
    }
    var p = dbTcFinancialSalesParams_(data);
    var conn, stmt, rs, total = 0, rows = [];
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(dbTcFinancialUsedMaterialsSnapshotSql_());
      dbBindParams_(stmt, [p.from, p.to]);
      rs = stmt.executeQuery();
      var rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        total = Number(rs.getString('total_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      rows = dbTcFinancialParseSnapshotJson_(rowsJson, rowCount).map(function (row) {
        return {
          product_id: String(row.product_id == null ? '' : row.product_id),
          name_ar: String(row.name_ar == null ? '' : row.name_ar),
          unit: String(row.unit == null ? '' : row.unit),
          supposed_qty: Number(row.supposed_qty) || 0,
          used_qty: Number(row.used_qty) || 0,
          difference_qty: Number(row.difference_qty) || 0,
          difference_ratio: row.difference_ratio == null ? null : Number(row.difference_ratio)
        };
      });
      var truncated = rows.length > DB_TC_FINANCIAL_SNAPSHOT_LIMIT_;
      if (truncated) rows = rows.slice(0, DB_TC_FINANCIAL_SNAPSHOT_LIMIT_);
      return { status: 'ok', filters: { from: p.from, to: p.to }, rows: rows,
        total: total, truncated: truncated, snapshot_at: Date.now(),
        snapshot_ttl: DB_TC_FINANCIAL_SNAPSHOT_TTL_ };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  function dbTcFinancialUsedMaterials_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbTcFinancialUsedMaterials_')) {
      return mysqlRead_(mysqlTcDefinition_('dbTcFinancialUsedMaterials_'), data,
        function (p) { return dbTcFinancialUsedMaterials_(p, user); });
    }
    var p = dbTcFinancialUsedMaterialsParams_(data);
    var snap = dbTcFinancialUsedMaterialsSnapshot_({ from: p.from, to: p.to, refresh: p.refresh }, user);
    var pageRows = snap.rows.slice(p.offset, p.offset + p.limit);
    return { status: 'ok', filters: { from: p.from, to: p.to }, rows: pageRows,
      total: snap.total, offset: p.offset, limit: p.limit, has_more: p.offset + pageRows.length < snap.total,
      truncated: snap.truncated, snapshot_at: snap.snapshot_at, snapshot_ttl: snap.snapshot_ttl };
  }

  register('get_financial_used_materials', function (data, user) {
    return readDiagnosticsForUser_(dbTcFinancialUsedMaterials_(data, user), user);
  });

  function dbTcFinancialUsedMaterialsPlan_(data, user) {
    if (!user || !user.isSuperAdmin) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    var p = dbTcFinancialSalesParams_(data);
    var tracker = typeof _mysqlRequest_ !== 'undefined' ? _mysqlRequest_ : null;
    var before = tracker ? [tracker.connectionMs, tracker.sqlMs, tracker.readMs, tracker.rows] : null;
    var started = Date.now(), conn, stmt, rs, plan = '';
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement('EXPLAIN FORMAT=JSON ' + dbTcFinancialUsedMaterialsSnapshotSql_());
      dbBindParams_(stmt, [p.from, p.to]);
      rs = stmt.executeQuery();
      if (rs.next()) plan = String(rs.getString(1) || '');
      if (!plan) throw new Error('MySQL did not return an execution plan');
      return { status: 'ok', filters: p, plan_json: plan, payload_bytes: tcUtf8Bytes_(plan),
        _mysql: tracker ? {
          elapsed_ms: Date.now() - started, cache_hit: false,
          connection_ms: tracker.connectionMs - before[0], sql_ms: tracker.sqlMs - before[1],
          read_ms: tracker.readMs - before[2], json_parse_ms: 0, rows_read: tracker.rows - before[3]
        } : null };
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  register('get_financial_used_materials_plan', function (data, user) {
    return readDiagnosticsForUser_(dbTcFinancialUsedMaterialsPlan_(data, user), user);
  });

  const BOX_CACHE_SCOPE = 'mysql_topchemical';
  const BOX_LABEL_TTL = 21600;            /* 6h, per plan §10 */

  /**
   * chart_of_accounts_main labels, cached.
   *
   * Through getRefsCached_, which chunks — CacheService rejects a single value
   * over ~100 KB, and a full chart of accounts can exceed that. A plain
   * cache.put would throw, be swallowed, and the cache would silently never
   * work: every page load would re-read the whole account tree.
   */
  function boxAccountLabels_(user) {
    return getRefsCached_(BOX_CACHE_SCOPE, 'box_account_labels_v1', BOX_LABEL_TTL, function () {
      const r = dbChartAccountLabels_({}, user);
      return { labels: r.labels, duplicate_ids: r.duplicate_ids, count: r.count, truncated: r.truncated };
    });
  }

  function boxTodayIso_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  function boxRefDate_(v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : boxTodayIso_();
  }

  /**
   * The page's read call. THREE queries, maximum, and never one inside a loop:
   *
   *   1. dbBoxList_                the movement page
   *   2. dbBoxAccountAggregates_   the four windows, grouped, for the accounts
   *                                actually on this page
   *   3. dbChartAccountLabels_     cached for 6h, so most loads issue two
   *
   * JDBC round trips are the entire cost of this page. A per-row history query
   * would turn one page load into fifty.
   */
  function getBoxAnalysis_(data, user, dbId) {
    data = data || {};
    const refDate = boxRefDate_(data.ref_date);

    /* 1 — the page of movements. */
    const page = dbBoxList_(data, user);

    /* Parse in memory. Pure, no I/O, and the failures come back attached to
       their row rather than being dropped — a row whose details will not parse
       is one a human needs to see, not one to hide. */
    const accounts = [];
    const seenAcct = {};
    page.rows.forEach(function (row) {
      row.parse = BoxEngine.parseDetails(row.transaction_details);
      const a = String(row.chart_of_accounts || '').trim();
      if (a && !seenAcct[a]) { seenAcct[a] = true; accounts.push(a); }
    });

    /* 2 — the four windows, for exactly the accounts on this page. */
    let windows = BoxEngine.accountWindows(refDate);
    const aggregates = {};
    if (accounts.length) {
      const agg = dbBoxAccountAggregates_({ ref_date: refDate, accounts: accounts }, user);
      windows = agg.windows;
      agg.rows.forEach(function (r) { aggregates[String(r.chart_of_accounts)] = r; });
    }

    /* 3 — labels, cached. Only the accounts on this page are sent down: the
       full map can be thousands of entries, and shipping it on every page load
       would dwarf the rows themselves. */
    const labels = {};
    const dupes = [];
    try {
      const lbl = boxAccountLabels_(user);
      accounts.forEach(function (a) {
        if (Object.prototype.hasOwnProperty.call(lbl.labels, a)) labels[a] = lbl.labels[a];
        if ((lbl.duplicate_ids || []).indexOf(a) !== -1) dupes.push(a);
      });
    } catch (e) {
      /* A missing or unreadable chart_of_accounts_main must not blank the whole
         page — the movements and their figures are still correct without their
         Arabic names. The page shows the bare code and says why. */
      Logger.log('getBoxAnalysis_ labels unavailable: ' + e.message);
    }

    /* Tier 1 over the visible page. It needs no extra query — the audit index
       is a Drive read, not a round trip — so the three-query budget holds.
       Tier 2 needs the parsed item history and Tier 3 needs a population, so
       both live on their own tabs with their own single query rather than
       being smuggled into the page load. */
    let flags = { flags: [], by_row: {}, notes: [], structuring: null };
    try {
      flags = BoxEngine.runTier1(page.rows, { auditIndex: boxAuditIndex_(12) });
    } catch (e) {
      /* A rules failure must not blank the movements. The list is the page's
         job; the flags are its opinion. */
      Logger.log('getBoxAnalysis_ Tier 1 failed: ' + e.message);
    }
    page.rows.forEach(function (row) {
      row.risk = BoxEngine.riskScore(flags.by_row[String(row.id)] || []);
    });

    return {
      status: 'ok',
      ref_date: refDate,
      columns: page.columns,
      rows: page.rows,
      rule_notes: flags.notes,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      windows: windows,
      aggregates: aggregates,
      labels: labels,
      /* A duplicated id_5 makes a label ambiguous. It is surfaced rather than
         resolved silently, because the same duplication in a SQL JOIN would
         have doubled every figure on this page (plan §12 q.4). */
      label_duplicate_ids: dupes
    };
  }

  /**
   * Item price history: one bounded read, parsed and clustered in memory.
   *
   * data: { ref_date, months, chart_of_accounts, limit, aliases }
   * Returns the clusters and, per cluster, every observed purchase with its
   * unit price, date and buyer. The statistics that turn those into findings
   * are Tier 2 of the rules engine.
   */
  function getBoxItemHistory_(data, user, dbId) {
    data = data || {};
    const refDate = boxRefDate_(data.ref_date);
    const hist = dbBoxItemHistory_({
      ref_date: refDate,
      months: data.months,
      limit: data.limit,
      chart_of_accounts: data.chart_of_accounts
    }, user);

    const occurrences = [];
    let parsedRows = 0, failedSegments = 0, mismatchRows = 0;
    hist.rows.forEach(function (row) {
      const p = BoxEngine.parseDetails(row.transaction_details);
      if (p.parsed_count > 0) parsedRows++;
      failedSegments += p.failed_count;
      const amount = Number(row.transaction_amount);
      if (p.parsed_count > 0 && p.failed_count === 0 && isFinite(amount) &&
          Math.abs(p.sum - amount) > 1) mismatchRows++;
      p.items.forEach(function (it) {
        occurrences.push({
          movement_id: row.id,
          transaction_date: row.transaction_date,
          chart_of_accounts: row.chart_of_accounts,
          responsible_person: row.responsible_person,
          box_code: row.box_code,
          item_norm: it.item_norm,
          unit: it.unit,
          qty: it.qty,
          price: it.price,
          unit_price: it.unit_price,
          confidence: it.confidence
        });
      });
    });

    /* The reviewer's corrections always win over the score, so they are loaded
       here rather than trusted from the client. */
    const aliases = boxLoadAliases_();
    const clustered = BoxEngine.clusterItems(occurrences, { aliases: aliases });
    const byCluster = {};
    occurrences.forEach(function (o) {
      const cid = clustered.byNorm[o.item_norm];
      (byCluster[cid] = byCluster[cid] || []).push(o);
    });

    /* Tier 2 runs on exactly the occurrences that were just clustered, so the
       statistics a reviewer reads in tab 3 and the ones the rules fired on are
       the same objects. */
    let t2 = { flags: [], by_row: {}, notes: [], stats: {} };
    try {
      t2 = BoxEngine.runTier2(occurrences, { byNorm: clustered.byNorm });
    } catch (e) {
      Logger.log('getBoxItemHistory_ Tier 2 failed: ' + e.message);
    }

    /* Occurrence arrays are dropped from the stats sent to the client: they are
       the bulk of the payload and the page already has them in
       occurrences_by_cluster. */
    const slimStats = {};
    Object.keys(t2.stats).forEach(function (cid) {
      const c = t2.stats[cid];
      slimStats[cid] = { cluster_id: c.cluster_id, label: c.label, n: c.n,
                         price: c.price, qty: c.qty, by_person: c.by_person };
    });

    return {
      status: 'ok',
      ref_date: refDate,
      from: hist.from,
      to: hist.to,
      months: hist.months,
      /* The page must say so rather than analysing a silent subset. */
      truncated: hist.truncated,
      row_count: hist.rows.length,
      /* Parse coverage over the rows actually read. This is a REAL measurement
         against production text, unlike the fixture figure — it is the number
         NEXT_STEPS_OWNER.md asks the owner to report. */
      coverage: {
        rows_read: hist.rows.length,
        rows_with_items: parsedRows,
        failed_segments: failedSegments,
        sum_mismatch_rows: mismatchRows
      },
      clusters: clustered.clusters,
      occurrences_by_cluster: byCluster,
      threshold: clustered.threshold,
      aliases: { merge: aliases.merge, split: aliases.split,
                 updated_at: aliases.updated_at, updated_by: aliases.updated_by },
      stats: slimStats,
      item_flags: t2.flags,
      item_flags_by_row: t2.by_row,
      rule_notes: t2.notes
    };
  }


  // ─── The audit trail (plan §8.5) ────────────────────────────────────────
  //
  // WHY THIS IS NOT OPTIONAL. This page hunts for tampering, and one of its
  // rules (EDITED_AFTER_REVIEW) fires on updated_at > created_at for a reviewed
  // row. If the page could edit rows without leaving a record, two things break
  // at once: it becomes a way to quietly alter the evidence it is auditing, and
  // it starts flagging its OWN legitimate edits as suspicious with no way to
  // tell them from an outside change. The rules engine reads this log to make
  // exactly that distinction.
  //
  // WHERE IT LIVES. No DDL is available, so this is not a table. It is
  // append-only NDJSON — one JSON object per line — in a Drive folder,
  // one file per month. That is a deliberate compromise and it is registered in
  // NEXT_STEPS_OWNER.md as promotable to a real table the moment DDL exists:
  // a Drive file has no transactions, no constraints, and no query engine.
  //
  // ORDERING. The intent line is written BEFORE the UPDATE, and the applied
  // line after. If Drive is unavailable, the write never happens — better a
  // refused edit than an unrecorded one. If the SECOND write fails, the row has
  // already changed, so the caller gets audit_error back and the page says so
  // loudly rather than reporting a clean save.

  const BOX_AUDIT_FOLDER = 'Box_Analysis_Audit';
  const BOX_AUDIT_MAX_BYTES = 5000000;   /* roll to a new part beyond this */

  function boxAuditFolder_() {
    const it = DriveApp.getFoldersByName(BOX_AUDIT_FOLDER);
    if (it.hasNext()) return it.next();
    return DriveApp.createFolder(BOX_AUDIT_FOLDER);
  }

  function boxAuditMonthKey_(d) {
    return Utilities.formatDate(d || new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  }

  /**
   * The file to append to for a month, rolling to _p2, _p3 … once a part grows
   * past BOX_AUDIT_MAX_BYTES. Appending to a Drive file is a read-modify-write,
   * so an unbounded file would get slower every edit and would eventually
   * exceed what a single execution can hold in memory.
   */
  function boxAuditFile_(folder, monthKey) {
    let n = 1, file = null;
    for (;;) {
      const name = 'box_audit_' + monthKey + (n === 1 ? '' : '_p' + n) + '.ndjson';
      const it = folder.getFilesByName(name);
      if (!it.hasNext()) return folder.createFile(name, '', MimeType.PLAIN_TEXT);
      file = it.next();
      if (file.getSize() < BOX_AUDIT_MAX_BYTES) return file;
      n++;
      if (n > 500) return file;          /* pathological; keep appending rather than loop */
    }
  }

  /**
   * Append one or more entries as NDJSON lines.
   *
   * Serialized through executeWithLock_ because Drive gives no append
   * primitive: this is read-then-write, and two concurrent edits without the
   * lock would lose one of them — in the audit log, of all places.
   * Throws on failure. Every caller must treat that as fatal to the edit.
   */
  function boxAuditAppend_(entries) {
    const lines = (entries || []).map(function (e) { return JSON.stringify(e); }).join('\n');
    if (!lines) return 0;
    return executeWithLock_(function () {
      const folder = boxAuditFolder_();
      const file = boxAuditFile_(folder, boxAuditMonthKey_());
      const existing = file.getBlob().getDataAsString('UTF-8');
      const sep = (existing && existing.charAt(existing.length - 1) !== '\n') ? '\n' : '';
      file.setContent(existing + sep + lines + '\n');
      return entries.length;
    }, 20000);
  }

  /**
   * Every audit entry from the last `months` months, newest file last.
   * Used by the rules engine to tell this page's own edits from an outside
   * change. A malformed line is skipped rather than throwing — a corrupt line
   * must not make the whole log unreadable and take the rule down with it.
   */
  function boxAuditRead_(months) {
    const want = {};
    const now = new Date();
    const back = Math.min(Math.max(Number(months) || 3, 1), 24);
    for (let i = 0; i < back; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      want[boxAuditMonthKey_(d)] = true;
    }
    const out = [];
    try {
      const folder = boxAuditFolder_();
      const files = folder.getFiles();
      while (files.hasNext()) {
        const f = files.next();
        const m = /^box_audit_(\d{4}-\d{2})(?:_p\d+)?\.ndjson$/.exec(f.getName());
        if (!m || !want[m[1]]) continue;
        f.getBlob().getDataAsString('UTF-8').split('\n').forEach(function (line) {
          const s = line.trim();
          if (!s) return;
          try { out.push(JSON.parse(s)); } catch (e) { /* skip a corrupt line */ }
        });
      }
    } catch (e) {
      Logger.log('boxAuditRead_ unavailable: ' + e.message);
    }
    return out;
  }

  function boxAuditActor_(user) {
    return {
      email: (user && user.email) || '',
      name: (user && user.name) || '',
      role: (user && user.role) || ''
    };
  }

  function boxEditId_() {
    return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  }

  function boxNowIso_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  }

  /**
   * The ONE write. One row, by primary key, from a user who filled in a form,
   * clicked Save, and confirmed a dialog that named the change.
   *
   * data: { id, changes: { column: value, ... } }
   *
   * The audit intent line is written FIRST. If Drive will not take it, the
   * update never happens — a refused edit is recoverable, an unrecorded one is
   * not. The allowlist and every per-column rule are enforced again in
   * dbBoxUpdate_ via BoxEngine.validateChanges: the client's validation is a
   * courtesy to the user, this one is the rule.
   */
  function updateBoxMovement_(data, user, dbId) {
    data = data || {};
    const editId = boxEditId_();
    const actor = boxAuditActor_(user);
    const when = boxNowIso_();
    const id = String(data.id === undefined || data.id === null ? '' : data.id).trim();
    if (!id) throw new Error('رقم الحركة مطلوب');

    /* Validate before writing anything at all, so a rejected edit leaves no
       intent line behind and the log is not full of attempts that could never
       have succeeded. Throws with an Arabic message naming the column. */
    const checked = BoxEngine.validateChanges(data.changes);

    /* 1 — intent. Old values are not known yet (reading them would cost a round
       trip this function does not need); what this line guarantees is that no
       row can change without a record of the attempt existing first. */
    boxAuditAppend_([{
      edit_id: editId, phase: 'intent', action: 'update_box_movement',
      when: when, user: actor, movement_id: id,
      columns: checked.columns,
      proposed: checked.columns.map(function (c) { return { column: c, new: checked.values[c] }; })
    }]);

    /* 2 — the write. */
    const res = dbBoxUpdate_({ id: id, changes: data.changes }, user);

    /* 3 — applied, with the before/after pairs the rules engine reads. Per the
       plan's shape: when, user, row id, column, old value, new value. */
    let auditError = '';
    try {
      boxAuditAppend_([{
        edit_id: editId, phase: 'applied', action: 'update_box_movement',
        when: boxNowIso_(), user: actor, movement_id: id,
        changes: res.changed.map(function (c) {
          return { column: c, old: res.before ? res.before[c] : null, new: res.after ? res.after[c] : null };
        }),
        updated_at_before: res.before ? res.before.updated_at : null,
        updated_at_after: res.after ? res.after.updated_at : null,
        boundary: res.boundary || null
      }]);
    } catch (e) {
      /* The row HAS changed. Saying "saved" and nothing else would leave an
         edit the audit cannot explain, and B7 would later flag it as an
         outside change. The page shows this prominently. */
      auditError = e.message || String(e);
      Logger.log('updateBoxMovement_ audit(applied) FAILED for id ' + id + ': ' + auditError);
    }

    return {
      status: 'ok',
      id: res.id,
      changed: res.changed,
      row: res.after,
      boundary: res.boundary || null,
      edit_id: editId,
      audit_error: auditError
    };
  }

  /**
   * The one-click review flip, mirroring revise_main_review — audited on the
   * same path, because it moves updated_at and is therefore visible to the
   * EDITED_AFTER_REVIEW rule just like any other edit.
   */
  function reviseBoxMovement_(data, user, dbId) {
    data = data || {};
    const id = String(data.id === undefined || data.id === null ? '' : data.id).trim();
    if (!id) throw new Error('رقم الحركة مطلوب');
    const editId = boxEditId_();
    const actor = boxAuditActor_(user);

    boxAuditAppend_([{
      edit_id: editId, phase: 'intent', action: 'revise_box_movement',
      when: boxNowIso_(), user: actor, movement_id: id,
      columns: ['is_revised'],
      proposed: [{ column: 'is_revised', new: 1 }]
    }]);

    const res = dbBoxRevise_({ id: id }, user);

    let auditError = '';
    try {
      boxAuditAppend_([{
        edit_id: editId, phase: 'applied', action: 'revise_box_movement',
        when: boxNowIso_(), user: actor, movement_id: id,
        changes: [{ column: 'is_revised', old: '0', new: '1' }]
      }]);
    } catch (e) {
      auditError = e.message || String(e);
      Logger.log('reviseBoxMovement_ audit(applied) FAILED for id ' + id + ': ' + auditError);
    }

    return { status: 'ok', id: id, is_revised: 1, edit_id: editId, audit_error: auditError };
  }


  // ─── The alias / override store (plan §5.3) ─────────────────────────────
  //
  // The matcher WILL be wrong sometimes. Without a way to correct it
  // permanently the reviewer ends up arguing with the algorithm every week and
  // stops trusting the whole page — which costs more than the wrong merge did.
  //
  // Same mechanism as the audit trail, for the same reason: no DDL. One JSON
  // file in the Box_Analysis_Audit Drive folder. Registered in
  // NEXT_STEPS_OWNER.md as promotable to a table alongside the audit log.

  const BOX_ALIAS_FILE = 'box_item_aliases.json';

  function boxAliasFileHandle_() {
    const folder = boxAuditFolder_();
    const it = folder.getFilesByName(BOX_ALIAS_FILE);
    if (it.hasNext()) return it.next();
    return folder.createFile(BOX_ALIAS_FILE,
      JSON.stringify({ merge: [], split: [], updated_at: null, updated_by: null }, null, 2),
      MimeType.PLAIN_TEXT);
  }

  /**
   * { merge: [[a,b],…], split: [[a,b],…] }. Never throws: a missing or corrupt
   * override file must degrade the clustering, not take the page down with it.
   */
  function boxLoadAliases_() {
    try {
      const raw = boxAliasFileHandle_().getBlob().getDataAsString('UTF-8');
      const j = JSON.parse(raw);
      return {
        merge: Array.isArray(j.merge) ? j.merge : [],
        split: Array.isArray(j.split) ? j.split : [],
        updated_at: j.updated_at || null,
        updated_by: j.updated_by || null
      };
    } catch (e) {
      Logger.log('boxLoadAliases_ unavailable: ' + e.message);
      return { merge: [], split: [], updated_at: null, updated_by: null, error: e.message };
    }
  }

  /**
   * Record one reviewer correction. data: { op: 'merge'|'split', a, b }.
   *
   * Audited on the same path as a row edit — it changes what the analysis
   * says, so it is exactly the kind of change that has to be attributable.
   * Serialized through the same lock, because this is read-modify-write too.
   */
  function saveBoxItemAlias_(data, user, dbId) {
    data = data || {};
    const op = String(data.op || '').trim();
    if (op !== 'merge' && op !== 'split') throw new Error('نوع التصحيح يجب أن يكون دمج أو فصل');
    const a = BoxEngine.normAr(data.a);
    const b = BoxEngine.normAr(data.b);
    if (!a || !b) throw new Error('يجب تحديد صنفين');
    if (a === b) throw new Error('لا يمكن ربط الصنف بنفسه');

    const actor = boxAuditActor_(user);
    const editId = boxEditId_();

    boxAuditAppend_([{
      edit_id: editId, phase: 'intent', action: 'save_box_item_alias',
      when: boxNowIso_(), user: actor, movement_id: null,
      alias: { op: op, a: a, b: b }
    }]);

    const result = executeWithLock_(function () {
      const file = boxAliasFileHandle_();
      let j;
      try { j = JSON.parse(file.getBlob().getDataAsString('UTF-8')); }
      catch (e) { j = { merge: [], split: [] }; }
      j.merge = Array.isArray(j.merge) ? j.merge : [];
      j.split = Array.isArray(j.split) ? j.split : [];
      /* A pair can be a merge or a split, never both — recording the reviewer's
         latest instruction means removing the opposite one. */
      const other = op === 'merge' ? 'split' : 'merge';
      const same = function (p) {
        return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
      };
      j[other] = j[other].filter(function (p) { return !same(p); });
      if (!j[op].some(same)) j[op].push([a, b]);
      j.updated_at = boxNowIso_();
      j.updated_by = actor.email || actor.name || '';
      file.setContent(JSON.stringify(j, null, 2));
      return { merge: j.merge.length, split: j.split.length };
    }, 20000);

    let auditError = '';
    try {
      boxAuditAppend_([{
        edit_id: editId, phase: 'applied', action: 'save_box_item_alias',
        when: boxNowIso_(), user: actor, movement_id: null,
        alias: { op: op, a: a, b: b }, totals: result
      }]);
    } catch (e) {
      auditError = e.message || String(e);
      Logger.log('saveBoxItemAlias_ audit(applied) FAILED: ' + auditError);
    }
    return { status: 'ok', op: op, a: a, b: b, totals: result, audit_error: auditError };
  }

  // ─── The audit index the rules engine reads ─────────────────────────────

  /**
   * { movement_id: [applied audit entries, oldest first] }.
   *
   * This is what lets EDITED_AFTER_REVIEW tell an edit made through this page
   * from a change made somewhere else. Reading Drive is I/O, so it happens
   * here and the engine stays pure.
   */
  function boxAuditIndex_(months) {
    const idx = {};
    boxAuditRead_(months || 6).forEach(function (e) {
      if (!e || e.phase !== 'applied' || !e.movement_id) return;
      (idx[String(e.movement_id)] = idx[String(e.movement_id)] || []).push(e);
    });
    Object.keys(idx).forEach(function (k) {
      idx[k].sort(function (a, b) { return String(a.when) < String(b.when) ? -1 : 1; });
    });
    return idx;
  }

  // ─── The alerts tab ─────────────────────────────────────────────────────

  /* Apps Script kills an execution at six minutes. Every long-running path here
     checks its own clock against this budget and returns what it has WITH a
     clear Arabic message, rather than being killed mid-response and showing the
     user a blank page or a raw timeout. */
  const BOX_TIME_BUDGET_MS = 240000;   /* 4 minutes, leaving headroom */

  function boxOverBudget_(startedAt) {
    return (Date.now() - startedAt) > BOX_TIME_BUDGET_MS;
  }

  /**
   * Tab 2 — every flagged row across a bounded window, ranked by risk.
   *
   * ONE query (dbBoxAnalysisScan_) plus the Drive audit read. Tier 1 runs on
   * every row; Tier 3 runs on the same population, which is what it needs —
   * Benford alone is gated at 300 amounts, and the 50-row page load could never
   * satisfy that. Tier 2 is not run here: it needs the parsed item history,
   * which is its own query and belongs to tab 3.
   *
   * data: { ref_date, months, chart_of_accounts, responsible_person, limit }
   */
  function getBoxAlerts_(data, user, dbId) {
    data = data || {};
    const startedAt = Date.now();
    const refDate = boxRefDate_(data.ref_date);

    const scan = dbBoxAnalysisScan_({
      ref_date: refDate, months: data.months, limit: data.limit,
      chart_of_accounts: data.chart_of_accounts,
      responsible_person: data.responsible_person
    }, user);

    scan.rows.forEach(function (row) { row.parse = BoxEngine.parseDetails(row.transaction_details); });

    const auditIndex = boxAuditIndex_(12);
    const t1 = BoxEngine.runTier1(scan.rows, { auditIndex: auditIndex });

    let t3 = { flags: [], by_entity: {}, notes: [] };
    if (!boxOverBudget_(startedAt)) {
      t3 = BoxEngine.runTier3(scan.rows, { current_month: refDate.slice(0, 7) });
    }

    const ranked = BoxEngine.rankRows(scan.rows, t1.by_row)
      .filter(function (x) { return x.risk.score > 0; });

    return {
      status: 'ok',
      ref_date: refDate,
      from: scan.from, to: scan.to, months: scan.months,
      rows_scanned: scan.rows.length,
      /* Said out loud rather than implied: the page reports what it analysed. */
      truncated: scan.truncated,
      truncated_message_ar: scan.truncated
        ? 'تم تحليل أحدث ' + scan.rows.length + ' حركة فقط ضمن الفترة المحددة — وسّع أو ضيّق الفلاتر لتغطية باقي الفترة'
        : '',
      timed_out: boxOverBudget_(startedAt),
      timed_out_message_ar: boxOverBudget_(startedAt)
        ? 'انتهت المهلة المتاحة للتحليل قبل إتمام القواعد السلوكية — النتائج المعروضة ناقصة، جرّب فترة أقصر'
        : '',
      alerts: ranked.map(function (x) {
        return {
          id: x.row.id,
          transaction_date: x.row.transaction_date,
          transaction_details: x.row.transaction_details,
          transaction_amount: x.row.transaction_amount,
          transaction_type: x.row.transaction_type,
          chart_of_accounts: x.row.chart_of_accounts,
          responsible_person: x.row.responsible_person,
          box_code: x.row.box_code,
          is_revised: x.row.is_revised,
          risk: x.risk
        };
      }),
      entity_findings: t3.flags,
      notes: t1.notes.concat(t3.notes),
      structuring: t1.structuring
    };
  }

  // ─── The nightly precompute (NOT INSTALLED) ─────────────────────────────

  /**
   * Rebuild the item index and cache it as a Drive JSON blob.
   *
   * THIS IS NOT INSTALLED AS A TRIGGER, deliberately: installing one would
   * modify the owner's Apps Script project outside a push, which this work is
   * not permitted to do. To install it later:
   *
   *     Apps Script editor → Triggers (clock icon) → Add Trigger
   *       Function: rebuildBoxAnalysisIndex
   *       Event source: Time-driven → Day timer → 2am–3am
   *
   * Until then nothing runs it, and the page computes on demand for the window
   * it is showing — which is why every on-demand path above is bounded and
   * checks its own clock.
   *
   * The blob is keyed by MAX(updated_at), so any insert or edit invalidates it
   * without anyone having to guess a TTL.
   */
  function rebuildBoxAnalysisIndex_(opts) {
    const o = opts || {};
    const startedAt = Date.now();
    const refDate = boxRefDate_(o.ref_date);
    const stamp = dbBoxMaxUpdatedAt_({}, null);

    const hist = dbBoxItemHistory_({ ref_date: refDate, months: o.months || 24,
                                     limit: o.limit || 20000 }, null);
    const occurrences = [];
    hist.rows.forEach(function (row) {
      const p = BoxEngine.parseDetails(row.transaction_details);
      p.items.forEach(function (it) {
        occurrences.push({
          movement_id: row.id, transaction_date: row.transaction_date,
          chart_of_accounts: row.chart_of_accounts, responsible_person: row.responsible_person,
          box_code: row.box_code, item_norm: it.item_norm, unit: it.unit,
          qty: it.qty, price: it.price, unit_price: it.unit_price, confidence: it.confidence
        });
      });
    });

    const aliases = boxLoadAliases_();
    const clustered = BoxEngine.clusterItems(occurrences, { aliases: aliases });
    const stats = BoxEngine.clusterPriceStats(occurrences, clustered.byNorm);

    /* The occurrence lists are dropped from the stored blob: they are the bulk
       of it and the page re-reads them from the database anyway. */
    const slim = {};
    Object.keys(stats).forEach(function (cid) {
      const c = stats[cid];
      slim[cid] = { cluster_id: c.cluster_id, label: c.label, n: c.n,
                    price: c.price, qty: c.qty, by_person: c.by_person };
    });

    const payload = {
      built_at: boxNowIso_(),
      built_ms: Date.now() - startedAt,
      key: stamp.max_updated_at,
      row_count: stamp.count,
      ref_date: refDate,
      window: { from: hist.from, to: hist.to, months: hist.months },
      truncated: hist.truncated,
      occurrence_count: occurrences.length,
      clusters: clustered.clusters,
      stats: slim
    };

    const folder = boxAuditFolder_();
    const name = 'box_item_index.json';
    const it = folder.getFilesByName(name);
    if (it.hasNext()) it.next().setContent(JSON.stringify(payload));
    else folder.createFile(name, JSON.stringify(payload), MimeType.PLAIN_TEXT);
    return { status: 'ok', clusters: clustered.clusters.length,
             occurrences: occurrences.length, key: payload.key, ms: payload.built_ms };
  }

  register('get_box_analysis', getBoxAnalysis_);
  register('get_box_item_history', getBoxItemHistory_);
  register('get_box_alerts', getBoxAlerts_);
  register('update_box_movement', updateBoxMovement_);
  register('revise_box_movement', reviseBoxMovement_);
  register('save_box_item_alias', saveBoxItemAlias_);

  /* Phase 2: register field validators for validateBeforeWrite (no logic duplicated —
   * each entry calls the existing validator). Status-only paths skip via STATUS_ONLY_ACTIONS_. */
  try {
    if (typeof registerDocValidator_ === 'function') {
      registerDocValidator_('tc_costing', function(payloadData, dbId){
        var h = (payloadData && payloadData.header) || payloadData || {};
        return validateBudgetMonth_(h['تم_الاقرار_شهر']);
      });
    }
  } catch(eRegTC){}


  /**
   * Company_TopChemical_Actions.js
   * RESPONSIBILITY: the pure analysis core for تحليل حركة الخزنة العادية
   * (page tc_box_analysis) — parsing `transaction_details`, matching item texts
   * across rows, and the fraud/anomaly rules.
   *
   * EVERY FUNCTION IN THIS FILE IS PURE. No SpreadsheetApp, no Jdbc, no DriveApp,
   * no CacheService, no Logger. That is not stylistic: it is the only reason any
   * of this can be verified at all. There is no browser and no database reachable
   * from the machine this was written on, so the parser, the matcher and every
   * rule are tested under plain `node` against
   * tools/verify/fixtures/box_details.json. Reach for a Google service here and
   * that verification stops working.
   *
   * I/O lives in this Actions file (SQL) and Company_TopChemical_Actions.js
   * (Drive audit log, cache, session user).
   *
   * Loaded by Apps Script as a plain global script file; also `require`-able from
   * tools/verify/ via the module.exports block at the bottom.
   *
   * ARABIC IN REGEXES IS WRITTEN AS \uXXXX, ALWAYS. This file is edited in a
   * left-to-right editor, where a literal Arabic character class reorders on
   * screen and cannot be reviewed reliably — a range that reads correctly may not
   * be the range that was written. Arabic in plain string literals (the
   * dictionaries, the Arabic reason texts) stays literal, because those are read
   * as words rather than as ranges.
   *
   * Plan: BOX_ANALYSIS_PLAN.md §4 (parser), §5 (matcher), §7 (rules).
   */
  
  var BoxEngine = (function () {
    'use strict';
  
    // ═══════════════════════════════════════════════════════════════════════
    // §4.1  Normalization
    // ═══════════════════════════════════════════════════════════════════════
  
    /* Codepoints, named once so the folds below read as intentions. */
    var AR = {
      INDIC_0: 0x0660,          /* ٠ .. ٩            U+0660–U+0669 */
      EXT_INDIC_0: 0x06F0,      /* ۰ .. ۹            U+06F0–U+06F9 */
      ALEF: 'ا',           /* ا */
      HEH: 'ه',            /* ه */
      YEH: 'ي',            /* ي */
      WAW: 'و'             /* و */
    };
  
    var RE_INDIC_DIGITS = /[٠-٩]/g;
    var RE_EXT_INDIC_DIGITS = /[۰-۹]/g;
    var RE_ARABIC_DECIMAL_SEP = /٫/g;      /* ٫ */
    var RE_ARABIC_THOUSANDS_SEP = /٬/g;    /* ٬ */
    var RE_TASHKEEL = /[ً-ٰٕ]/g; /* harakat + superscript alef */
    var RE_TATWEEL = /ـ/g;                 /* ـ */
    var RE_ALEF_FORMS = /[آأإٱ]/g;  /* آ أ إ ٱ */
    var RE_TEH_MARBUTA = /ة/g;             /* ة */
    var RE_ALEF_MAQSURA = /ى/g;            /* ى */
    var RE_WAW_HAMZA = /ؤ/g;               /* ؤ */
    var RE_YEH_HAMZA = /ئ/g;               /* ئ */
    /* Keep: Arabic letters U+0621–U+064A, Latin letters, digits, '.', the segment
       separator '+', and the alternate price marker '='. */
    var RE_NOISE = /[^ء-ي0-9a-zA-Z.+=\s]/g;
  
    /**
     * Fold Arabic orthographic variation away so that two spellings of the same
     * purchase compare equal before any fuzzy scoring runs.
     *
     * Order matters. Digits are converted BEFORE punctuation is stripped, because
     * the Arabic decimal separator ٫ (U+066B) is punctuation and would otherwise
     * be deleted, silently turning ٩٢٥٫٥٠ into 92550.
     *
     * The consecutive-duplicate-token collapse at the end is not defensive
     * programming: the one real sample string we have literally contains
     * "نص كيلو  كيلو سلك لحام زهر". Repeated adjacent identical tokens in this
     * data are keying noise, never meaningful repetition.
     */
    function normAr(s) {
      if (s === null || s === undefined) return '';
      var t = String(s);
  
      t = t.replace(RE_INDIC_DIGITS, function (d) { return String(d.charCodeAt(0) - AR.INDIC_0); });
      t = t.replace(RE_EXT_INDIC_DIGITS, function (d) { return String(d.charCodeAt(0) - AR.EXT_INDIC_0); });
      t = t.replace(RE_ARABIC_DECIMAL_SEP, '.').replace(RE_ARABIC_THOUSANDS_SEP, '');
  
      /* Stripping tatweel is what makes "بـ 700" parse: بـ is ب + U+0640, and
         after this line it is just ب. */
      t = t.replace(RE_TASHKEEL, '').replace(RE_TATWEEL, '');
  
      t = t.replace(RE_ALEF_FORMS, AR.ALEF);
      t = t.replace(RE_TEH_MARBUTA, AR.HEH);
      t = t.replace(RE_ALEF_MAQSURA, AR.YEH);
      t = t.replace(RE_WAW_HAMZA, AR.WAW);
      t = t.replace(RE_YEH_HAMZA, AR.YEH);
  
      /* Punctuation becomes a space, so tokens either side of a comma or a
         bracket do not fuse into one. */
      t = t.replace(RE_NOISE, ' ');
      t = t.replace(/\s+/g, ' ').trim();
  
      if (!t) return '';
      var toks = t.split(' ');
      var out = [];
      for (var i = 0; i < toks.length; i++) {
        if (i === 0 || toks[i] !== toks[i - 1]) out.push(toks[i]);
      }
      return out.join(' ');
    }
  
    // ═══════════════════════════════════════════════════════════════════════
    // §4.2  Dictionaries
    // ═══════════════════════════════════════════════════════════════════════
  
    /* Written in their natural spelling and normalized once at load, so the
       dictionary and the input are folded by exactly the same function. Writing
       'طبه' here by hand instead would work today and break the first time normAr
       learns another fold. */
    var QUANTITY_WORDS_RAW = {
      'نص': 0.5, 'نصف': 0.5, 'النص': 0.5,
      'ربع': 0.25, 'الربع': 0.25,
      'تلت': 1 / 3, 'ثلث': 1 / 3,
      'تلتين': 2 / 3, 'ثلثين': 2 / 3,
      'تمن': 0.125, 'ثمن': 0.125,
      'واحد': 1, 'واحدة': 1,
      'اتنين': 2, 'اثنين': 2,
      'تلاتة': 3, 'ثلاثة': 3,
      'أربعة': 4, 'خمسة': 5, 'ستة': 6, 'سبعة': 7, 'ثمانية': 8, 'تسعة': 9, 'عشرة': 10
    };
  
    var UNIT_WORDS_RAW = [
      'كيلو', 'كجم', 'كج', 'جرام', 'جم', 'طن',
      'لتر', 'مللي', 'جالون', 'برميل', 'صفيحة', 'جردل',
      'متر', 'سم', 'مم', 'لفة', 'رول', 'شريط',
      'طبة', 'علبة', 'عبوة', 'زجاجة', 'شكارة', 'كيس', 'باكو', 'بوكس',
      'كرتونة', 'كرتون', 'شنطة', 'صندوق',
      'قطعة', 'عدد', 'حتة', 'لوح', 'صاج', 'اسطوانة', 'دستة', 'درزن'
    ];
  
    var QUANTITY_WORDS = (function () {
      var m = {};
      for (var k in QUANTITY_WORDS_RAW) {
        if (Object.prototype.hasOwnProperty.call(QUANTITY_WORDS_RAW, k)) m[normAr(k)] = QUANTITY_WORDS_RAW[k];
      }
      return m;
    })();
  
    var UNIT_WORDS = (function () {
      var m = {};
      for (var i = 0; i < UNIT_WORDS_RAW.length; i++) m[normAr(UNIT_WORDS_RAW[i])] = true;
      return m;
    })();
  
    function round_(v, dp) {
      var f = Math.pow(10, dp === undefined ? 2 : dp);
      return Math.round((Number(v) + Number.EPSILON) * f) / f;
    }
  
    function tokens_(s) {
      var t = String(s || '').trim();
      return t ? t.split(' ') : [];
    }
  
    // ═══════════════════════════════════════════════════════════════════════
    // §4.2  Segment parsing
    // ═══════════════════════════════════════════════════════════════════════
  
    /* The price marker must be a STANDALONE ب (U+0628) or '=', followed by
       digits. A ب that merely begins a word must never be read as a price marker,
       or "2 لتر بويه بيضا ب 240" (white paint) reads its own item name as a
       number. */
    var PRICE_AT_END = /(?:^|\s)(?:ب|=)\s*(\d+(?:\.\d+)?)\s*$/;
    var PRICE_ANYWHERE = /(?:^|\s)(?:ب|=)\s*(\d+(?:\.\d+)?)/g;
  
    /**
     * Pull the price off a normalized segment.
     * Returns { price, rest } or null when the segment carries no price at all.
     *
     * There is deliberately NO "trailing bare number" fallback. A segment such as
     * "طبة حديد" with no price must be reported as a failure — guessing a price
     * out of some other number in the text is exactly how the sum check would
     * come to agree with a description that does not account for the money.
     */
    function takePrice(seg) {
      var s = String(seg || '').trim();
      if (!s) return null;
      var m = s.match(PRICE_AT_END);
      if (m) return { price: Number(m[1]), rest: s.slice(0, m.index).trim() };
  
      PRICE_ANYWHERE.lastIndex = 0;
      var last = null, x;
      while ((x = PRICE_ANYWHERE.exec(s)) !== null) last = x;
      if (!last) return null;
      var rest = (s.slice(0, last.index) + ' ' + s.slice(last.index + last[0].length))
        .replace(/\s+/g, ' ').trim();
      return { price: Number(last[1]), rest: rest };
    }
  
    /**
     * Take a leading quantity — numeric ("5", "0.5") or a word ("نص", "ربع",
     * "تلت"). Word quantities resolve to numbers so that unit prices from
     * differently-worded rows are comparable at all.
     * Returns { value, rest }; value is null when there is no quantity.
     */
    function takeQuantity(text) {
      var s = String(text || '').trim();
      if (!s) return { value: null, rest: '' };
      var toks = tokens_(s);
  
      if (/^\d+(?:\.\d+)?$/.test(toks[0])) {
        return { value: Number(toks[0]), rest: toks.slice(1).join(' ') };
      }
      if (Object.prototype.hasOwnProperty.call(QUANTITY_WORDS, toks[0])) {
        return { value: QUANTITY_WORDS[toks[0]], rest: toks.slice(1).join(' ') };
      }
      return { value: null, rest: s };
    }
  
    /**
     * Take a leading unit token. Returns { value, rest }; value is null when the
     * first token is not a known unit.
     */
    function takeUnit(text) {
      var s = String(text || '').trim();
      if (!s) return { value: null, rest: '' };
      var toks = tokens_(s);
      if (Object.prototype.hasOwnProperty.call(UNIT_WORDS, toks[0])) {
        return { value: toks[0], rest: toks.slice(1).join(' ') };
      }
      return { value: null, rest: s };
    }
  
    /**
     * The Egyptian "كيلو ونص" shape, where the fraction FOLLOWS the unit instead
     * of preceding it. Handled here rather than inside takeQuantity because it
     * can only be recognised once the unit has been consumed.
     * Returns { value, rest } — value null when the pattern is absent.
     */
    function takeTrailingFraction(text) {
      var s = String(text || '').trim();
      if (!s) return { value: null, rest: '' };
      var toks = tokens_(s);
      var t = toks[0];
      if (t && t.length > 1 && t.charAt(0) === AR.WAW) {
        var word = t.slice(1);
        if (Object.prototype.hasOwnProperty.call(QUANTITY_WORDS, word)) {
          return { value: QUANTITY_WORDS[word], rest: toks.slice(1).join(' ') };
        }
      }
      if (t === AR.WAW && toks.length > 1 &&
          Object.prototype.hasOwnProperty.call(QUANTITY_WORDS, toks[1])) {
        return { value: QUANTITY_WORDS[toks[1]], rest: toks.slice(2).join(' ') };
      }
      return { value: null, rest: s };
    }
  
    /**
     * Order-invariant identity for an item text: its tokens, deduped and sorted.
     * This is what makes flipped wording ("معجون شروخ" / "شروخ معجون") match for
     * free, before a single fuzzy score has been computed.
     */
    function itemKey(itemNorm) {
      var seen = {}, out = [];
      tokens_(itemNorm).forEach(function (t) {
        if (!t || Object.prototype.hasOwnProperty.call(seen, t)) return;
        seen[t] = true;
        out.push(t);
      });
      out.sort();
      return out.join(' ');
    }
  
    /**
     * How much to trust one parsed segment. Not a probability — a rank, used to
     * sort the "needs a human" list and to damp the price rules on shaky parses.
     */
    function scoreParse(qty, unit, itemNorm) {
      var c = 1;
      if (qty === null || qty === undefined) c -= 0.2;
      if (!unit) c -= 0.15;
      var toks = tokens_(itemNorm);
      if (toks.length <= 1) c -= 0.05;
      if (/\d/.test(itemNorm)) c -= 0.15;   /* stray digits left in the item name */
      if (c < 0) c = 0;
      if (c > 1) c = 1;
      return round_(c, 3);
    }
  
    /**
     * Parse one `transaction_details` value into line items.
     *
     *   record  := segment ("+" segment)*
     *   segment := [qty] [unit] item ("ب"|"=") price
     *
     * A segment that cannot be parsed comes back in `failures`, NEVER dropped.
     * Dropping it would make `sum` agree with `transaction_amount` on exactly the
     * rows where the description does not account for the money — the rows a
     * human most needs to see.
     *
     * An EMPTY segment (a trailing "+", a double separator) is skipped and is not
     * a failure; otherwise every stray separator becomes a fake finding.
     */
    function parseDetails(text) {
      var raw = (text === null || text === undefined) ? '' : String(text);
      var norm = normAr(raw);
      var parts = norm.split('+');
      var items = [], failures = [], sum = 0, seq = 0;
  
      for (var i = 0; i < parts.length; i++) {
        var seg = parts[i].trim();
        if (!seg) continue;
        seq++;
  
        var p = takePrice(seg);
        if (!p) {
          failures.push({ seq: seq, segment: seg, reason: 'NO_PRICE', reason_ar: 'لا يوجد سعر في هذا الجزء' });
          continue;
        }
  
        var q = takeQuantity(p.rest);
        var u = takeUnit(q.rest);
        var qty = q.value;
        var rest = u.rest;
  
        if (u.value) {
          var extra = takeTrailingFraction(rest);
          if (extra.value !== null) {
            qty = (qty === null ? 1 : qty) + extra.value;
            rest = extra.rest;
          }
        }
  
        var itemNorm = String(rest || '').trim();
        if (!itemNorm) {
          failures.push({ seq: seq, segment: seg, reason: 'NO_ITEM', reason_ar: 'لا يوجد اسم صنف في هذا الجزء' });
          continue;
        }
  
        var unitPrice = (qty !== null && qty > 0) ? round_(p.price / qty, 4) : null;
        items.push({
          seq: seq,
          qty: qty,
          unit: u.value,
          item_raw: itemNorm,
          item_norm: itemNorm,
          item_key: itemKey(itemNorm),
          price: round_(p.price, 2),
          unit_price: unitPrice,
          confidence: scoreParse(qty, u.value, itemNorm)
        });
        sum += p.price;
      }
  
      var total = items.length + failures.length;
      return {
        raw: raw,
        norm: norm,
        items: items,
        failures: failures,
        sum: round_(sum, 2),
        parsed_count: items.length,
        failed_count: failures.length,
        segment_count: total,
        coverage: total === 0 ? null : round_(items.length / total, 4)
      };
    }
  
    // ═══════════════════════════════════════════════════════════════════════
    // §5  Item identity — the matcher
    // ═══════════════════════════════════════════════════════════════════════
  
    /* Tuning lives here, in one object, because a threshold nobody can see is a
       threshold nobody can tune. The verify run prints the score of every fixture
       pair against these numbers; change one and the run tells you what moved. */
    var MATCH = {
      /* Weights sum to 1. Dice carries the most because whole shared tokens are
         the strongest evidence in this vocabulary; the trigram cosine is second
         because it is what separates a typo from a genuinely different product. */
      W_DICE: 0.40,
      W_LEV: 0.20,
      W_TRIGRAM: 0.30,
      W_UNIT: 0.10,
      /* Chosen against tools/verify/fixtures/box_details.json — see the measured
         score table printed by `node tools/verify/box_matcher.js --show`. It sits
         between the hardest true pair (a one-character typo) and the hardest
         false pair (سلك لحام زهر vs سلك لحام المونيوم, two of three tokens
         shared, different metals, different prices). */
      THRESHOLD: 0.58,
      /* Blocking guards. A token appearing in more posting-list entries than this
         is too common to block on — that is the IDF floor of plan §5.1, expressed
         as the thing it actually controls. */
      MAX_POSTING: 200,
      RARE_STEMS: 2,
      RARE_TRIGRAMS: 4,
      MAX_CANDIDATES: 400,
      /* Suffix stripping only when at least this much stem survives. Without it
         "زيتون" stems to "زيت" and olives merge with oil, and "معجون" stems to
         "معج". Both are real words in this vocabulary. */
      MIN_STEM: 4
    };
  
    var RE_AL_PREFIX = /^ال/;
    var SUFFIXES = ['ات', 'ين', 'ون', 'ه'];
  
    /**
     * Light Arabic stemming (plan §5.2): strip the definite article and a small
     * set of suffixes. Deliberately not a real morphological stemmer — this
     * vocabulary is workshop consumables, and an aggressive stemmer conflates
     * more than it merges.
     */
    function stemAr(token) {
      var t = String(token || '');
      if (!t) return '';
      if (RE_AL_PREFIX.test(t) && t.length - 2 >= 3) t = t.slice(2);
      for (var i = 0; i < SUFFIXES.length; i++) {
        var s = SUFFIXES[i];
        if (t.length > s.length && t.slice(-s.length) === s && t.length - s.length >= MATCH.MIN_STEM) {
          t = t.slice(0, t.length - s.length);
          break;
        }
      }
      return t;
    }
  
    function stemTokens(itemNorm) {
      var seen = {}, out = [];
      tokens_(itemNorm).forEach(function (t) {
        var s = stemAr(t);
        if (!s || Object.prototype.hasOwnProperty.call(seen, s)) return;
        seen[s] = true;
        out.push(s);
      });
      return out;
    }
  
    /** Order-invariant identity AFTER stemming — the second exact-match block. */
    function stemKey(itemNorm) {
      return stemTokens(itemNorm).slice().sort().join(' ');
    }
  
    function tokenSetDice(aTokens, bTokens) {
      if (!aTokens.length || !bTokens.length) return 0;
      var set = {}, i;
      for (i = 0; i < aTokens.length; i++) set[aTokens[i]] = true;
      var shared = 0;
      for (i = 0; i < bTokens.length; i++) {
        if (Object.prototype.hasOwnProperty.call(set, bTokens[i])) shared++;
      }
      return (2 * shared) / (aTokens.length + bTokens.length);
    }
  
    /** Levenshtein distance, two-row DP. Strings here are short item names. */
    function levenshtein(a, b) {
      a = String(a || ''); b = String(b || '');
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;
      var prev = [], cur = [], i, j;
      for (j = 0; j <= b.length; j++) prev[j] = j;
      for (i = 1; i <= a.length; i++) {
        cur[0] = i;
        for (j = 1; j <= b.length; j++) {
          var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
          cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        for (j = 0; j <= b.length; j++) prev[j] = cur[j];
      }
      return prev[b.length];
    }
  
    function normLevenshtein(a, b) {
      var m = Math.max(String(a || '').length, String(b || '').length);
      return m === 0 ? 0 : levenshtein(a, b) / m;
    }
  
    /** Character 3-grams with a boundary pad, as a {gram: count} bag. */
    function trigramBag(s) {
      var t = '  ' + String(s || '') + '  ';
      var m = {};
      for (var i = 0; i + 3 <= t.length; i++) {
        var g = t.substr(i, 3);
        m[g] = (m[g] || 0) + 1;
      }
      return m;
    }
  
    /**
     * Cosine between two trigram bags, each component weighted by the gram's IDF.
     *
     * The IDF weighting is the part that earns its keep. "سلك" and "لحام" appear
     * in most welding-wire rows, so their grams carry almost no weight; the grams
     * that distinguish زهر from المونيوم carry nearly all of it. Unweighted, two
     * different welding wires look nearly identical.
     */
    function idfTrigramCosine(bagA, bagB, idfOf) {
      var dot = 0, na = 0, nb = 0, g, w;
      for (g in bagA) {
        if (!Object.prototype.hasOwnProperty.call(bagA, g)) continue;
        w = idfOf(g);
        na += (bagA[g] * w) * (bagA[g] * w);
        if (Object.prototype.hasOwnProperty.call(bagB, g)) dot += (bagA[g] * w) * (bagB[g] * w);
      }
      for (g in bagB) {
        if (!Object.prototype.hasOwnProperty.call(bagB, g)) continue;
        w = idfOf(g);
        nb += (bagB[g] * w) * (bagB[g] * w);
      }
      if (na === 0 || nb === 0) return 0;
      return dot / (Math.sqrt(na) * Math.sqrt(nb));
    }
  
    /* Units grouped by physical dimension. Two items measured in different
       dimensions are not the same purchase however similar the words look. */
    var UNIT_FAMILY_RAW = {
      'كيلو': 'mass', 'كجم': 'mass', 'كج': 'mass', 'جرام': 'mass', 'جم': 'mass', 'طن': 'mass',
      'لتر': 'volume', 'مللي': 'volume', 'جالون': 'volume', 'برميل': 'volume',
      'صفيحة': 'volume', 'جردل': 'volume',
      'متر': 'length', 'سم': 'length', 'مم': 'length', 'لفة': 'length', 'رول': 'length', 'شريط': 'length',
      'طبة': 'count', 'علبة': 'count', 'عبوة': 'count', 'زجاجة': 'count', 'شكارة': 'count',
      'كيس': 'count', 'باكو': 'count', 'بوكس': 'count', 'كرتونة': 'count', 'كرتون': 'count',
      'شنطة': 'count', 'صندوق': 'count', 'قطعة': 'count', 'عدد': 'count', 'حتة': 'count',
      'لوح': 'count', 'صاج': 'count', 'اسطوانة': 'count', 'دستة': 'count', 'درزن': 'count'
    };
  
    var UNIT_FAMILY = (function () {
      var m = {};
      for (var k in UNIT_FAMILY_RAW) {
        if (Object.prototype.hasOwnProperty.call(UNIT_FAMILY_RAW, k)) m[normAr(k)] = UNIT_FAMILY_RAW[k];
      }
      return m;
    })();
  
    /**
     * 1.0 same unit · 0.8 same dimension · 0.5 at least one unknown · 0 different
     * dimension.
     *
     * An unknown unit scores 0.5, not 1.0, on purpose: "we do not know" is not
     * evidence of compatibility, and roughly half this corpus carries no unit at
     * all. Scoring it as agreement would hand every unitless pair a free 0.1.
     */
    function unitCompatible(unitA, unitB) {
      var a = unitA ? normAr(unitA) : '';
      var b = unitB ? normAr(unitB) : '';
      if (!a || !b) return 0.5;
      if (a === b) return 1;
      var fa = UNIT_FAMILY[a], fb = UNIT_FAMILY[b];
      if (fa && fb && fa === fb) return 0.8;
      if (!fa || !fb) return 0.5;
      return 0;
    }
  
    /**
     * Build the blocking + IDF index over a set of DISTINCT normalized item
     * texts. Distinct texts, not occurrences: a thousand rows buying "معجون شروخ"
     * are one node here, which is what keeps this inside the execution limit.
     */
    function buildMatchIndex(records) {
      var nodes = [], byNorm = {};
      (records || []).forEach(function (r) {
        var norm = typeof r === 'string' ? r : (r && r.item_norm) || '';
        var unit = (typeof r === 'string') ? null : (r && r.unit) || null;
        if (!norm) return;
        if (Object.prototype.hasOwnProperty.call(byNorm, norm)) {
          var ex = nodes[byNorm[norm]];
          ex.count++;
          if (unit) ex.units[unit] = (ex.units[unit] || 0) + 1;
          return;
        }
        var stems = stemTokens(norm);
        byNorm[norm] = nodes.length;
        var n = {
          i: nodes.length,
          norm: norm,
          tokens: tokens_(norm),
          stems: stems,
          key: itemKey(norm),
          stem_key: stems.slice().sort().join(' '),
          tri: trigramBag(norm),
          units: {},
          count: 1
        };
        if (unit) n.units[unit] = 1;
        nodes.push(n);
      });
  
      var N = nodes.length;
      var stemDf = {}, triDf = {}, byKey = {}, byStemKey = {}, postings = {}, triPostings = {};
  
      nodes.forEach(function (n) {
        var seen = {};
        n.stems.forEach(function (s) {
          if (seen[s]) return;
          seen[s] = true;
          stemDf[s] = (stemDf[s] || 0) + 1;
          (postings[s] = postings[s] || []).push(n.i);
        });
        var seenG = {};
        for (var g in n.tri) {
          if (!Object.prototype.hasOwnProperty.call(n.tri, g) || seenG[g]) continue;
          seenG[g] = true;
          triDf[g] = (triDf[g] || 0) + 1;
          (triPostings[g] = triPostings[g] || []).push(n.i);
        }
        (byKey[n.key] = byKey[n.key] || []).push(n.i);
        (byStemKey[n.stem_key] = byStemKey[n.stem_key] || []).push(n.i);
      });
  
      function idfStem(t) { return Math.log(1 + N / (1 + (stemDf[t] || 0))); }
      function idfTri(g) { return Math.log(1 + N / (1 + (triDf[g] || 0))); }
  
      /* The unit a text is most often bought in — used for unitCompatible when
         scoring two texts rather than two individual occurrences. */
      nodes.forEach(function (n) {
        var best = null, bestN = 0;
        for (var u in n.units) {
          if (Object.prototype.hasOwnProperty.call(n.units, u) && n.units[u] > bestN) { best = u; bestN = n.units[u]; }
        }
        n.unit = best;
      });
  
      return {
        N: N, nodes: nodes, byNorm: byNorm,
        byKey: byKey, byStemKey: byStemKey,
        postings: postings, triPostings: triPostings,
        stemDf: stemDf, triDf: triDf,
        idfStem: idfStem, idfTri: idfTri
      };
    }
  
    /**
     * Score two index nodes. Returns the total AND every component, because a
     * merge an accountant disagrees with has to be explainable — "0.71" is not an
     * answer to "why did you put these together".
     */
    function matchScore(a, b, idx) {
      var dice = tokenSetDice(a.stems, b.stems);
      var lev = 1 - normLevenshtein(a.stems.slice().sort().join(' '), b.stems.slice().sort().join(' '));
      var tri = idx ? idfTrigramCosine(a.tri, b.tri, idx.idfTri) : 0;
      var unit = unitCompatible(a.unit, b.unit);
      var score = MATCH.W_DICE * dice + MATCH.W_LEV * lev + MATCH.W_TRIGRAM * tri + MATCH.W_UNIT * unit;
      return {
        score: round_(score, 4),
        dice: round_(dice, 4),
        lev: round_(lev, 4),
        trigram: round_(tri, 4),
        unit: round_(unit, 4)
      };
    }
  
    /**
     * Candidate generation for one node (plan §5.1), cheapest block first:
     *   1. identical item_key      — flipped word order, free
     *   2. identical stem_key      — definite articles and plurals, free
     *   3. rarest shared stems     — the IDF-weighted inverted index
     *   4. rarest shared trigrams  — typos that share no whole token
     * A posting list longer than MATCH.MAX_POSTING is skipped: a token that
     * common cannot discriminate, and walking it would dominate the run.
     */
    function matchCandidates(node, idx) {
      var out = {}, i;
      function add(list) {
        if (!list || list.length > MATCH.MAX_POSTING) return;
        for (var k = 0; k < list.length; k++) if (list[k] !== node.i) out[list[k]] = true;
      }
      add(idx.byKey[node.key]);
      add(idx.byStemKey[node.stem_key]);
  
      var stems = node.stems.slice().sort(function (x, y) { return idx.idfStem(y) - idx.idfStem(x); });
      for (i = 0; i < Math.min(stems.length, MATCH.RARE_STEMS); i++) add(idx.postings[stems[i]]);
  
      var grams = Object.keys(node.tri).sort(function (x, y) { return idx.idfTri(y) - idx.idfTri(x); });
      for (i = 0; i < Math.min(grams.length, MATCH.RARE_TRIGRAMS); i++) add(idx.triPostings[grams[i]]);
  
      var ids = Object.keys(out).map(Number);
      return ids.length > MATCH.MAX_CANDIDATES ? ids.slice(0, MATCH.MAX_CANDIDATES) : ids;
    }
  
    function makeDsu_(n) {
      var p = [];
      for (var i = 0; i < n; i++) p.push(i);
      function find(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
      function union(a, b) { a = find(a); b = find(b); if (a === b) return false; p[b] = a; return true; }
      return { find: find, union: union };
    }
  
    /**
     * Cluster item texts into one group per real-world purchase.
     *
     * opts.aliases carries the human overrides from §5.3 — the reviewer's
     * corrections, which always win over the score:
     *   { merge: [[normA, normB], ...], split: [[normA, normB], ...] }
     *
     * A split is enforced by refusing any union that would put a forbidden pair
     * in one component. That makes the result depend on the order unions are
     * attempted, so pairs are processed in a fixed sorted order and the outcome
     * is deterministic for a given input. It is not a general constrained
     * clustering, and it does not pretend to be: it is "the reviewer said these
     * two are different, so never merge them".
     */
    function clusterItems(records, opts) {
      var o = opts || {};
      var threshold = o.threshold === undefined ? MATCH.THRESHOLD : o.threshold;
      var idx = o.index || buildMatchIndex(records);
      var dsu = makeDsu_(idx.N);
  
      var forbidden = [];
      ((o.aliases && o.aliases.split) || []).forEach(function (pair) {
        var a = idx.byNorm[normAr(pair[0])], b = idx.byNorm[normAr(pair[1])];
        if (a !== undefined && b !== undefined) forbidden.push([a, b]);
      });
  
      function wouldViolate(a, b) {
        var ra = dsu.find(a), rb = dsu.find(b);
        for (var i = 0; i < forbidden.length; i++) {
          var fa = dsu.find(forbidden[i][0]), fb = dsu.find(forbidden[i][1]);
          if ((fa === ra && fb === rb) || (fa === rb && fb === ra)) return true;
        }
        return false;
      }
      function tryUnion(a, b) {
        if (dsu.find(a) === dsu.find(b)) return false;
        if (wouldViolate(a, b)) return false;
        return dsu.union(a, b);
      }
  
      /* Reviewer merges first: they are facts, not evidence. */
      ((o.aliases && o.aliases.merge) || []).forEach(function (pair) {
        var a = idx.byNorm[normAr(pair[0])], b = idx.byNorm[normAr(pair[1])];
        if (a !== undefined && b !== undefined) tryUnion(a, b);
      });
  
      /* Score every candidate pair once, then union in descending score order so
         the strongest evidence is applied first and the result does not depend on
         node ordering. */
      var pairs = [], seenPair = {};
      idx.nodes.forEach(function (n) {
        matchCandidates(n, idx).forEach(function (j) {
          var lo = Math.min(n.i, j), hi = Math.max(n.i, j);
          var pk = lo + ':' + hi;
          if (seenPair[pk]) return;
          seenPair[pk] = true;
          var s = matchScore(idx.nodes[lo], idx.nodes[hi], idx);
          if (s.score >= threshold) pairs.push({ a: lo, b: hi, s: s.score });
        });
      });
      pairs.sort(function (x, y) { return y.s - x.s || x.a - y.a || x.b - y.b; });
      pairs.forEach(function (p) { tryUnion(p.a, p.b); });
  
      var groups = {};
      idx.nodes.forEach(function (n) {
        var r = dsu.find(n.i);
        (groups[r] = groups[r] || []).push(n);
      });
  
      var clusters = Object.keys(groups).map(function (r) {
        var members = groups[r].slice().sort(function (x, y) { return y.count - x.count || (x.norm < y.norm ? -1 : 1); });
        var total = 0;
        members.forEach(function (m) { total += m.count; });
        /* cluster_id is the lexicographically smallest MEMBER TEXT, not the
           representative's item_key. item_key is order-invariant, so a reviewer
           who splits "معجون شروخ" from "شروخ معجون" would get two clusters
           carrying the SAME id — and every downstream lookup keyed by cluster id
           would quietly merge them back, undoing the correction. Membership sets
           are disjoint, so the smallest member text is unique by construction,
           and it does not move when purchase counts shift. */
        var ids = members.map(function (m) { return m.norm; }).sort();
        return {
          cluster_id: ids[0],
          label: members[0].norm,              /* the most-used member — what a reviewer reads */
          members: members.map(function (m) { return m.norm; }),
          member_count: members.length,
          occurrence_count: total
        };
      }).sort(function (x, y) { return y.occurrence_count - x.occurrence_count; });
  
      var byNormCluster = {};
      clusters.forEach(function (c) {
        c.members.forEach(function (m) { byNormCluster[m] = c.cluster_id; });
      });
  
      return { clusters: clusters, byNorm: byNormCluster, index: idx, threshold: threshold };
    }
  
    // ═══════════════════════════════════════════════════════════════════════
    // §6  Account period windows
    // ═══════════════════════════════════════════════════════════════════════
  
    /* Deliberately integer arithmetic on a YYYY-MM-DD string, with no Date
       object anywhere. Apps Script runs in the script's timezone, the database
       stores a bare DATE, and the browser is in the user's timezone; routing
       these bounds through a Date is how a movement dated the 1st ends up
       excluded from its own month. Strings in, strings out, no zone ever
       consulted. */
  
    function daysInMonth(y, m) {
      if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
      return [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
    }
  
    function pad2_(n) { return (n < 10 ? '0' : '') + n; }
    function iso_(y, m, d) { return y + '-' + pad2_(m) + '-' + pad2_(d); }
  
    function parseIsoDate(s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
      if (!m) return null;
      var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      if (mo < 1 || mo > 12) return null;
      if (d < 1 || d > daysInMonth(y, mo)) return null;
      return { y: y, m: mo, d: d };
    }
  
    /**
     * The first day of the month N months before refIso.
     *
     * Month arithmetic on a running month-index, not on a Date: subtracting 24
     * months from September 2026 has to give September 2024 whatever the day of
     * the month is, and has to cross a year boundary without a timezone getting
     * an opinion.
     */
    function monthsBefore(refIso, n) {
      var r = parseIsoDate(refIso);
      if (!r) throw new Error('Invalid reference date (expected YYYY-MM-DD): ' + refIso);
      var idx = r.y * 12 + (r.m - 1) - Math.max(0, Math.floor(Number(n) || 0));
      var y = Math.floor(idx / 12);
      var m = idx - y * 12 + 1;
      return iso_(y, m, 1);
    }
  
    /**
     * The four spend windows of plan §6, anchored on a reference date D.
     *
     * Last month and last year are cut to the SAME DAY-OF-PERIOD as D, never to
     * the whole period. Comparing 12 days of this month against 31 days of last
     * month manufactures a decline on the 12th of every month, and someone will
     * act on it.
     *
     * The day is clamped to the target month's length, so 31 March compares
     * against 1–28 February and never asks the database for 31 February.
     */
    function accountWindows(refIso) {
      var r = parseIsoDate(refIso);
      if (!r) throw new Error('Invalid reference date (expected YYYY-MM-DD): ' + refIso);
  
      var pmY = r.m === 1 ? r.y - 1 : r.y;
      var pmM = r.m === 1 ? 12 : r.m - 1;
      var lmDay = Math.min(r.d, daysInMonth(pmY, pmM));
      var lyDay = Math.min(r.d, daysInMonth(r.y - 1, r.m));
  
      return {
        ref: iso_(r.y, r.m, r.d),
        mtd: { from: iso_(r.y, r.m, 1), to: iso_(r.y, r.m, r.d), label_ar: 'الشهر الحالي' },
        last_month: { from: iso_(pmY, pmM, 1), to: iso_(pmY, pmM, lmDay), label_ar: 'الشهر السابق (نفس المدة)' },
        ytd: { from: iso_(r.y, 1, 1), to: iso_(r.y, r.m, r.d), label_ar: 'العام الحالي' },
        last_ytd: { from: iso_(r.y - 1, 1, 1), to: iso_(r.y - 1, r.m, lyDay), label_ar: 'العام السابق (نفس المدة)' },
        /* The outer bound the aggregate query needs: everything the four windows
           can touch, and nothing else. */
        span: { from: iso_(r.y - 1, 1, 1), to: iso_(r.y, r.m, r.d) }
      };
    }
  
    // ═══════════════════════════════════════════════════════════════════════
    // Date/time arithmetic for the rules — still no Date object
    // ═══════════════════════════════════════════════════════════════════════
  
    var CUM_DAYS = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  
    function isLeap_(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  
    /** Days since 1970-01-01, as an integer. Pure, and free of any timezone. */
    function dayNumber(y, m, d) {
      var days = 365 * (y - 1970);
      /* Leap days between 1970 and y, exclusive of y itself. */
      days += Math.floor((y - 1969) / 4) - Math.floor((y - 1901) / 100) + Math.floor((y - 1601) / 400);
      days += CUM_DAYS[m] + (m > 2 && isLeap_(y) ? 1 : 0);
      return days + d - 1;
    }
  
    /** Whole days from a to b (both 'YYYY-MM-DD'). Negative when b precedes a. */
    function daysBetween(aIso, bIso) {
      var a = parseIsoDate(aIso), b = parseIsoDate(bIso);
      if (!a || !b) return null;
      return dayNumber(b.y, b.m, b.d) - dayNumber(a.y, a.m, a.d);
    }
  
    /** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday (4). */
    function dayOfWeek(y, m, d) {
      var n = dayNumber(y, m, d) + 4;
      return ((n % 7) + 7) % 7;
    }
  
    /**
     * 'YYYY-MM-DD HH:MM:SS' (or with a 'T') → { y, m, d, hh, mm, ss, date }.
     * Returns null for anything else, rather than guessing — a rule that fires on
     * a misparsed timestamp is an accusation built on nothing.
     */
    function parseDateTime(s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || '').trim());
      if (!m) return null;
      var d = parseIsoDate(m[1] + '-' + m[2] + '-' + m[3]);
      if (!d) return null;
      return {
        y: d.y, m: d.m, d: d.d,
        hh: m[4] === undefined ? null : Number(m[4]),
        mm: m[5] === undefined ? null : Number(m[5]),
        ss: m[6] === undefined ? 0 : Number(m[6]),
        date: m[1] + '-' + m[2] + '-' + m[3]
      };
    }
  
    /** Percentile of a numeric array, linear interpolation. Sorts a copy. */
    function percentile(values, p) {
      var v = (values || []).filter(function (x) { return typeof x === 'number' && isFinite(x); })
        .slice().sort(function (a, b) { return a - b; });
      if (!v.length) return null;
      if (v.length === 1) return v[0];
      var idx = (v.length - 1) * p;
      var lo = Math.floor(idx), hi = Math.ceil(idx);
      if (lo === hi) return v[lo];
      return v[lo] + (v[hi] - v[lo]) * (idx - lo);
    }
  
    function median(values) { return percentile(values, 0.5); }
  
    // ═══════════════════════════════════════════════════════════════════════
    // §8.5  The edit path — allowlist and validators
    // ═══════════════════════════════════════════════════════════════════════
  
    /**
     * The columns an edit may touch. A FIXED ALLOWLIST, never a sanitizer over a
     * client-supplied column name: a sanitizer answers "is this string safe to
     * put in SQL", and the question that matters is "is this a column a user is
     * allowed to change at all".
     *
     * Absent on purpose, and each for its own reason:
     *   id          the primary key the update targets
     *   created_at  THE EVIDENCE. The backdating rules (BACKDATED, ODD_HOUR,
     *               OUT_OF_SEQUENCE) all run on created_at. A page whose job is
     *               to find tampering must not offer a field for editing the
     *               timestamps it audits.
     *   updated_at  server-set to NOW() on every edit, so EDITED_AFTER_REVIEW
     *               cannot be defeated by writing an old value into it.
     *
     * Types come straight from the schema in plan §2, so the validation is exact
     * rather than defensive: transaction_details is varchar(255) and MySQL would
     * truncate or throw, so 256 characters is rejected HERE, with an Arabic
     * message naming the column, rather than becoming a driver error or, worse,
     * a silently shortened description.
     */
    var EDITABLE_COLUMNS = {
      transaction_date:    { type: 'date',    label_ar: 'التاريخ' },
      transaction_details: { type: 'text255', label_ar: 'التفاصيل', max: 255 },
      transaction_amount:  { type: 'money',   label_ar: 'المبلغ' },
      transaction_type:    { type: 'enum',    label_ar: 'النوع', values: ['credit', 'debit'],
                             labels_ar: { credit: 'منصرف', debit: 'محصّل' } },
      chart_of_accounts:   { type: 'digits',  label_ar: 'كود الحساب' },
      responsible_person:  { type: 'text',    label_ar: 'المسؤول', max: 65535 },
      box_code:            { type: 'int',     label_ar: 'كود الخزنة' },
      client_id:           { type: 'intNull', label_ar: 'كود العميل' },
      related_id:          { type: 'intNull', label_ar: 'الكود المرتبط' },
      user_id:             { type: 'intNull', label_ar: 'كود المستخدم', max: 2147483647 },
      is_revised:          { type: 'bool01',  label_ar: 'حالة المراجعة' }
    };
  
    var LOCKED_COLUMNS = {
      id: 'المفتاح الأساسي لا يمكن تعديله',
      created_at: 'تاريخ الإنشاء دليل تدقيق ولا يمكن تعديله من هذه الصفحة',
      updated_at: 'تاريخ آخر تعديل يضبطه الخادم تلقائياً'
    };
  
    /* double(16,2): 16 significant digits with 2 after the point, so the largest
       representable magnitude is 99999999999999.99. */
    var MONEY_MAX = 99999999999999.99;
  
    function isEditableColumn(col) {
      return Object.prototype.hasOwnProperty.call(EDITABLE_COLUMNS, String(col));
    }
  
    /**
     * Validate and coerce ONE column's value. Throws an Arabic Error naming the
     * column when the value will not do.
     *
     * Returns the value in the form the prepared statement should bind: a string
     * for text and dates, a Number for money and integers, or null for an empty
     * nullable id. Returning the coerced value rather than a boolean is what
     * keeps the caller from binding the raw client string by accident.
     */
    function validateColumn(col, value) {
      var name = String(col);
      if (Object.prototype.hasOwnProperty.call(LOCKED_COLUMNS, name)) {
        throw new Error(LOCKED_COLUMNS[name]);
      }
      if (!isEditableColumn(name)) {
        throw new Error('عمود غير مسموح بتعديله: ' + name);
      }
      var spec = EDITABLE_COLUMNS[name];
      var raw = (value === undefined || value === null) ? '' : String(value);
      var s = raw.trim();
      var L = spec.label_ar;
  
      switch (spec.type) {
        case 'date':
          if (!s) throw new Error(L + ': التاريخ مطلوب');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(L + ': صيغة التاريخ غير صحيحة (المتوقع YYYY-MM-DD)');
          /* Shape is not enough — 2026-02-31 has the right shape and is not a
             day. MySQL would take it as a zero date or reject it depending on
             sql_mode, and either way the row's date would no longer mean what it
             says. */
          if (!parseIsoDate(s)) throw new Error(L + ': تاريخ غير موجود في التقويم');
          return s;
  
        case 'text255':
          if (s.length > spec.max) {
            throw new Error(L + ': الحد الأقصى ' + spec.max + ' حرفاً، والمُدخل ' + s.length +
              ' — اختصر النص، فقاعدة البيانات ستقتطعه دون تنبيه');
          }
          return s;
  
        case 'text':
          if (s.length > spec.max) throw new Error(L + ': الحد الأقصى ' + spec.max + ' حرفاً');
          return s;
  
        case 'money': {
          if (!s) throw new Error(L + ': القيمة مطلوبة');
          if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
            throw new Error(L + ': رقم بحد أقصى منزلتين عشريتين');
          }
          var n = Number(s);
          if (!isFinite(n)) throw new Error(L + ': قيمة رقمية غير صالحة');
          if (Math.abs(n) > MONEY_MAX) throw new Error(L + ': القيمة أكبر مما يتسع له الحقل');
          return n;
        }
  
        case 'enum':
          if (spec.values.indexOf(s) === -1) {
            throw new Error(L + ': القيمة يجب أن تكون ' + spec.values.join(' أو '));
          }
          return s;
  
        case 'digits':
          if (!s) throw new Error(L + ': القيمة مطلوبة');
          if (!/^\d{1,20}$/.test(s)) throw new Error(L + ': أرقام فقط');
          return s;
  
        case 'int': {
          if (!s) throw new Error(L + ': القيمة مطلوبة');
          if (!/^-?\d{1,19}$/.test(s)) throw new Error(L + ': رقم صحيح فقط');
          return s;                       /* bigint — kept as a string, never through a float */
        }
  
        case 'intNull': {
          if (!s) return null;            /* empty means NULL, which is the schema's default */
          if (!/^-?\d{1,19}$/.test(s)) throw new Error(L + ': رقم صحيح أو فراغ');
          if (spec.max !== undefined && Math.abs(Number(s)) > spec.max) {
            throw new Error(L + ': القيمة خارج المدى المسموح');
          }
          return s;
        }
  
        case 'bool01':
          if (s !== '0' && s !== '1') throw new Error(L + ': القيمة يجب أن تكون 0 أو 1');
          return Number(s);
      }
      throw new Error('نوع تحقق غير معروف للعمود: ' + name);
    }
  
    /**
     * Validate a whole change set. Returns { values, columns } with every value
     * coerced, or throws on the first column that will not validate.
     * Rejecting an EMPTY change set is deliberate: an update with nothing to set
     * is a client bug, and letting it through would move updated_at — which the
     * EDITED_AFTER_REVIEW rule reads — for no reason at all.
     */
    function validateChanges(changes) {
      var out = {}, cols = [];
      var src = changes || {};
      for (var col in src) {
        if (!Object.prototype.hasOwnProperty.call(src, col)) continue;
        out[col] = validateColumn(col, src[col]);
        cols.push(col);
      }
      if (!cols.length) throw new Error('لا توجد تغييرات');
      cols.sort();                        /* deterministic SET order and audit order */
      return { values: out, columns: cols };
    }
  
    /** Is this account code inside the item engine's range? (plan §2.1) */
    function inItemRange(code) {
      var s = String(code === undefined || code === null ? '' : code).trim();
      if (!/^\d+$/.test(s)) return false;
      var n = Number(s);
      return n >= 300000 && n <= 400000;
    }
  
    /**
     * Does this edit move the row across the 300000–400000 boundary? Worth
     * saying out loud in the confirmation, because it silently changes WHICH
     * ANALYSES APPLY to the row — the item parsing and every price rule are
     * scoped to that range — and nothing else on screen would show it.
     */
    function crossesItemBoundary(oldCode, newCode) {
      var a = inItemRange(oldCode), b = inItemRange(newCode);
      if (a === b) return null;
      return {
        from_in_range: a,
        to_in_range: b,
        reason_ar: b
          ? 'هذا التعديل يُدخل الحركة في نطاق تحليل البنود (300000–400000)، فتصبح خاضعة لتحليل الأسعار'
          : 'هذا التعديل يُخرج الحركة من نطاق تحليل البنود (300000–400000)، فتتوقف عنها قواعد تحليل الأسعار'
      };
    }
  
    /**
     * Which columns actually differ, comparing as the form would produce them.
     * Only changed columns are sent, so an edit that touches one field does not
     * rewrite ten and does not fill the audit log with lines saying nothing
     * changed.
     */
    function diffChanges(original, edited) {
      var out = {};
      var src = edited || {};
      for (var col in src) {
        if (!Object.prototype.hasOwnProperty.call(src, col)) continue;
        if (!isEditableColumn(col)) continue;
        var before = (original || {})[col];
        var a = (before === undefined || before === null) ? '' : String(before).trim();
        var b = (src[col] === undefined || src[col] === null) ? '' : String(src[col]).trim();
        /* Money compares by value, not by spelling: "725.00" and "725" are the
           same amount, and an edit that changed neither must not be recorded as
           one. */
        if (EDITABLE_COLUMNS[col].type === 'money' && a !== '' && b !== '' &&
            isFinite(Number(a)) && isFinite(Number(b))) {
          if (Number(a) === Number(b)) continue;
        } else if (a === b) {
          continue;
        }
        out[col] = src[col];
      }
      return out;
    }
  
  
    // ═══════════════════════════════════════════════════════════════════════
    // §7 Tier 1 — deterministic integrity rules
    // ═══════════════════════════════════════════════════════════════════════
    //
    // The highest-precision findings in the whole feature, and the only tier that
    // uses no statistics at all. Every one of them is a fact about the row or
    // about a pair of rows, not an inference about a distribution.
    //
    // Every rule returns { rule_id, severity, row_id, evidence[], reason_ar }.
    // reason_ar is a SENTENCE with the numbers in it, not a rule name: this
    // output has to survive an accountant asking "why", and "SUM_MISMATCH" is not
    // an answer to that question. evidence[] carries the rows the reader needs to
    // see to check the claim themselves.
    //
    // Rules that need a population (BACKDATED needs a p95, STRUCTURING needs a
    // histogram) REFUSE to fire below their minimum n and say so in `notes`.
    // A finding is aimed at a named employee; "بيانات غير كافية" is the honest
    // output when there is not enough data, and a weak verdict is not.
  
    var SEVERITY_AR = { high: 'مرتفع', medium: 'متوسط', low: 'منخفض' };
  
    var TIER1 = {
      SUM_EPSILON: 1.00,          /* double(16,2) — below this is rounding */
      DUP_WINDOW_DAYS: 7,
      NEAR_DUP_SIMILARITY: 0.85,
      NEAR_DUP_AMOUNT_PCT: 0.02,
      BACKDATE_MIN_N: 30,         /* below this a p95 is noise */
      BACKDATE_MIN_DAYS: 3,       /* never flag a lag this small, whatever p95 says */
      WORK_START_HOUR: 8,
      WORK_END_HOUR: 18,
      WEEKEND_DAYS: [5, 6],       /* Friday, Saturday — the Egyptian week */
      SEQUENCE_TOLERANCE_DAYS: 30,
      STRUCTURING_CANDIDATES: [500, 1000, 2000, 5000, 10000, 20000, 50000],
      STRUCTURING_BAND: 0.10,     /* "just below" = within 10% under the threshold */
      STRUCTURING_MIN_RATIO: 3,   /* the spike must be this much taller than above */
      STRUCTURING_MIN_COUNT: 5,   /* and this many rows, or it is not a spike */
      STRUCTURING_WINDOW_DAYS: 2
    };
  
    function flag_(ruleId, severity, rowId, reasonAr, evidence) {
      return {
        rule_id: ruleId,
        severity: severity,
        severity_ar: SEVERITY_AR[severity] || severity,
        row_id: rowId === undefined || rowId === null ? null : String(rowId),
        reason_ar: reasonAr,
        evidence: evidence || []
      };
    }
  
    function amountOf_(row) {
      var n = Number(row && row.transaction_amount);
      return isFinite(n) ? n : null;
    }
  
    function fmt2_(n) {
      return (Math.round(Number(n) * 100) / 100).toFixed(2);
    }
  
    /**
     * Arabic numeral–noun agreement.
     *
     * Arabic does not pluralise the way English does, and getting it wrong is
     * visible in every sentence this engine produces. "4 عملية" is simply
     * incorrect; it has to be "4 عمليات". The rule that matters here:
     *   1        → singular            عملية
     *   2        → dual                عمليتان
     *   3 – 10   → plural              عمليات
     *   11 +     → singular (accusative) عملية
     * so plural and singular ALTERNATE as the number grows, which is exactly the
     * case a naive `n === 1 ? x : xs` gets wrong at 11 and again at 101.
     *
     * A findings page that an accountant is meant to act on cannot be written in
     * broken Arabic; the reader stops trusting the arithmetic too.
     */
    var AR_NOUNS = {
      op:       { one: 'عملية', two: 'عمليتان', few: 'عمليات', many: 'عملية' },
      purchase: { one: 'عملية شراء', two: 'عمليتا شراء', few: 'عمليات شراء', many: 'عملية شراء' },
      movement: { one: 'حركة', two: 'حركتان', few: 'حركات', many: 'حركة' },
      day:      { one: 'يوم', two: 'يومان', few: 'أيام', many: 'يوماً' },
      workday:  { one: 'يوم عمل', two: 'يوما عمل', few: 'أيام عمل', many: 'يوم عمل' },
      month:    { one: 'شهر', two: 'شهران', few: 'أشهر', many: 'شهراً' },
      item:     { one: 'بند', two: 'بندان', few: 'بنود', many: 'بنداً' },
      amount:   { one: 'مبلغ', two: 'مبلغان', few: 'مبالغ', many: 'مبلغاً' }
    };
  
    function arCount(n, kind) {
      var forms = AR_NOUNS[kind];
      if (!forms) return String(n);
      var v = Math.abs(Number(n));
      /* Agreement follows the last two digits: 111 behaves like 11, not like 1. */
      var mod100 = v % 100;
      var word;
      if (v === 1) word = forms.one;
      else if (v === 2) word = forms.two;
      else if (mod100 >= 3 && mod100 <= 10) word = forms.few;
      else if (mod100 === 1 || mod100 === 2 || mod100 === 0 || mod100 > 10) word = forms.many;
      else word = forms.many;
      /* 1 and 2 carry the count in the noun itself, so the digit is redundant. */
      return (v === 1 || v === 2) ? word : (n + ' ' + word);
    }
  
    /* ── SUM_MISMATCH ───────────────────────────────────────────────────────
     * Σ parsed item prices against transaction_amount. Free, needs nothing but
     * the parser, and it is the highest-precision signal in the feature: either
     * the parse failed or the description does not account for the money, and
     * both need a human.
     *
     * It does NOT fire when the row has no parsed items, and it does NOT fire
     * when some segment failed to parse — in that case the sum is known to be
     * incomplete, which is a different (and already reported) finding. Firing
     * here too would blame the row for the parser's gap. */
    function ruleSumMismatch(row) {
      var p = row && row.parse;
      if (!p || !p.items || !p.items.length) return null;
      if (p.failed_count > 0) return null;
      var amount = amountOf_(row);
      if (amount === null) return null;
      var diff = round_(p.sum - amount, 2);
      if (Math.abs(diff) <= TIER1.SUM_EPSILON) return null;
      return flag_('SUM_MISMATCH', 'high', row.id,
        'مجموع أسعار البنود ' + fmt2_(p.sum) + ' لا يساوي المبلغ المسجل ' + fmt2_(amount) +
        ' — الفرق ' + fmt2_(Math.abs(diff)) + ' ' +
        (diff > 0 ? '(البنود أكبر من المبلغ)' : '(المبلغ أكبر من البنود)'),
        [{ row_id: String(row.id), items_sum: p.sum, transaction_amount: amount, difference: diff }]);
    }
  
    /* ── EXACT_DUP and NEAR_DUP ─────────────────────────────────────────────
     * Double claiming. Both are pair rules, so both flag BOTH rows — a reader
     * looking at either one needs to be told about the other. */
    function ruleDuplicates(rows, opts) {
      var o = opts || {};
      var windowDays = o.dup_window_days || TIER1.DUP_WINDOW_DAYS;
      var simThreshold = o.near_dup_similarity || TIER1.NEAR_DUP_SIMILARITY;
      var amtPct = o.near_dup_amount_pct || TIER1.NEAR_DUP_AMOUNT_PCT;
      var out = [];
  
      var list = (rows || []).filter(function (r) {
        return r && r.transaction_date && amountOf_(r) !== null;
      }).map(function (r) {
        var norm = normAr(r.transaction_details);
        /* NEAR_DUP compares WHAT WAS BOUGHT, not the raw details string.
           Comparing the whole string puts the price digits in the token set, so
           two rows that differ only in price — the exact shape a near-duplicate
           claim takes — score LOWER than two unrelated rows that happen to share
           a price. On the first run this cost the intended fixture pair 0.833
           against a 0.85 threshold and the rule found nothing at all.
           The amounts are compared separately, just below, so leaving them out of
           the text similarity is not losing a signal; it is not counting the same
           one twice. Rows whose details did not parse fall back to the full text,
           which is the best available. */
        var items = (r.parse && r.parse.items) || [];
        var itemText = items.length
          ? items.map(function (it) { return it.item_norm; }).join(' ')
          : norm;
        return {
          row: r,
          norm: norm,
          stems: stemTokens(itemText),
          amount: amountOf_(r),
          box: String(r.box_code == null ? '' : r.box_code),
          person: String(r.responsible_person == null ? '' : r.responsible_person).trim()
        };
      });
  
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          var gap = daysBetween(a.row.transaction_date, b.row.transaction_date);
          if (gap === null || Math.abs(gap) > windowDays) continue;
          if (!a.norm && !b.norm) continue;
  
          if (a.norm === b.norm && a.amount === b.amount && a.box === b.box) {
            var ev = [
              { row_id: String(a.row.id), transaction_date: a.row.transaction_date, transaction_amount: a.amount, transaction_details: a.row.transaction_details },
              { row_id: String(b.row.id), transaction_date: b.row.transaction_date, transaction_amount: b.amount, transaction_details: b.row.transaction_details }
            ];
            var msg = 'حركة مطابقة تماماً: نفس التفاصيل ونفس المبلغ ' + fmt2_(a.amount) +
              ' ونفس الخزنة، بفارق ' + arCount(Math.abs(gap), 'day') + ' — الحركتان رقم ' +
              a.row.id + ' و' + b.row.id;
            out.push(flag_('EXACT_DUP', 'high', a.row.id, msg, ev));
            out.push(flag_('EXACT_DUP', 'high', b.row.id, msg, ev));
            continue;
          }
  
          /* Near duplicate: similar wording AND a similar amount. Either alone is
             ordinary — the same item bought twice at different prices, or two
             unrelated purchases that happen to cost the same. */
          var denom = Math.max(Math.abs(a.amount), Math.abs(b.amount));
          var amtClose = denom === 0 ? (a.amount === b.amount)
            : (Math.abs(a.amount - b.amount) / denom) <= amtPct;
          if (!amtClose) continue;
          var sim = tokenSetDice(a.stems, b.stems);
          if (sim < simThreshold) continue;
          if (a.norm === b.norm && a.amount === b.amount && a.box === b.box) continue;   /* already EXACT */
  
          var ev2 = [
            { row_id: String(a.row.id), transaction_date: a.row.transaction_date, transaction_amount: a.amount, transaction_details: a.row.transaction_details },
            { row_id: String(b.row.id), transaction_date: b.row.transaction_date, transaction_amount: b.amount, transaction_details: b.row.transaction_details }
          ];
          var msg2 = 'حركتان متقاربتان جداً: تشابه التفاصيل ' + Math.round(sim * 100) + '%' +
            ' والمبلغان ' + fmt2_(a.amount) + ' و' + fmt2_(b.amount) +
            ' بفارق ' + arCount(Math.abs(gap), 'day') + ' — الحركتان رقم ' + a.row.id + ' و' + b.row.id;
          out.push(flag_('NEAR_DUP', 'medium', a.row.id, msg2, ev2));
          out.push(flag_('NEAR_DUP', 'medium', b.row.id, msg2, ev2));
        }
      }
      return out;
    }
  
    /* ── BACKDATED ──────────────────────────────────────────────────────────
     * created_at − transaction_date, against the p95 of THIS population rather
     * than a number somebody picked. In an office where everything is keyed a
     * week late, a week late is not evidence of anything.
     *
     * Refuses to fire below BACKDATE_MIN_N: a p95 over 12 rows is the second
     * largest value, which is not a percentile, it is just the second largest
     * value. */
    function ruleBackdated(rows, opts) {
      var o = opts || {};
      var minN = o.backdate_min_n === undefined ? TIER1.BACKDATE_MIN_N : o.backdate_min_n;
      var lags = [];
      var perRow = [];
  
      (rows || []).forEach(function (r) {
        if (!r || !r.transaction_date || !r.created_at) return;
        var c = parseDateTime(r.created_at);
        if (!c) return;
        var lag = daysBetween(r.transaction_date, c.date);
        if (lag === null) return;
        lags.push(lag);
        perRow.push({ row: r, lag: lag });
      });
  
      if (lags.length < minN) {
        return {
          flags: [],
          note: {
            rule_id: 'BACKDATED',
            status: 'insufficient_data',
            n: lags.length,
            required: minN,
            reason_ar: 'بيانات غير كافية لحساب حد التأخير (المطلوب ' + arCount(minN, 'movement') +
              ' على الأقل، والمتاح ' + lags.length + ')'
          }
        };
      }
  
      var p95 = percentile(lags, 0.95);
      var threshold = Math.max(p95, TIER1.BACKDATE_MIN_DAYS);
      var flags = [];
      perRow.forEach(function (x) {
        if (x.lag <= threshold) return;
        flags.push(flag_('BACKDATED', 'medium', x.row.id,
          'أُدخلت الحركة بعد تاريخها بـ ' + arCount(x.lag, 'day') + '، وهو أعلى من الحد المحسوب من هذه المجموعة نفسها (' +
          'الشريحة 95% = ' + fmt2_(p95) + ' يوم من ' + arCount(lags.length, 'movement') + ')',
          [{ row_id: String(x.row.id), transaction_date: x.row.transaction_date,
             created_at: x.row.created_at, lag_days: x.lag, p95_days: round_(p95, 2), n: lags.length }]));
      });
      return { flags: flags, note: null };
    }
  
    /* ── ODD_HOUR ───────────────────────────────────────────────────────────
     * Keyed outside working hours or at the weekend. Weekend here is Friday and
     * Saturday.
     *
     * PUBLIC HOLIDAYS ARE NOT CHECKED — there is no holiday calendar in this
     * system, and inventing one would produce confident nonsense twice a year.
     * The severity is deliberately 'low': working late is not fraud, it is a
     * detail that matters only next to something else. */
    function ruleOddHour(row, opts) {
      var o = opts || {};
      var startH = o.work_start_hour === undefined ? TIER1.WORK_START_HOUR : o.work_start_hour;
      var endH = o.work_end_hour === undefined ? TIER1.WORK_END_HOUR : o.work_end_hour;
      var weekend = o.weekend_days || TIER1.WEEKEND_DAYS;
      if (!row || !row.created_at) return null;
      var c = parseDateTime(row.created_at);
      if (!c || c.hh === null) return null;
  
      var dow = dayOfWeek(c.y, c.m, c.d);
      var isWeekend = weekend.indexOf(dow) !== -1;
      var outOfHours = c.hh < startH || c.hh >= endH;
      if (!isWeekend && !outOfHours) return null;
  
      var names = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      var parts = [];
      if (isWeekend) parts.push('يوم ' + names[dow] + ' (عطلة أسبوعية)');
      if (outOfHours) parts.push('الساعة ' + (c.hh < 10 ? '0' : '') + c.hh + ':' +
        (c.mm === null ? '00' : (c.mm < 10 ? '0' : '') + c.mm) +
        ' خارج ساعات العمل ' + startH + ':00–' + endH + ':00');
      return flag_('ODD_HOUR', 'low', row.id,
        'أُدخلت الحركة ' + parts.join(' و') + ' (لا تُحتسب الأعياد الرسمية — لا يوجد تقويم إجازات في النظام)',
        [{ row_id: String(row.id), created_at: row.created_at, day_of_week: dow }]);
    }
  
    /* ── EDITED_AFTER_REVIEW ────────────────────────────────────────────────
     * updated_at > created_at on a row marked reviewed.
     *
     * THIS IS WHY THE AUDIT LOG EXISTS. Without it, this rule fires on the
     * page's own legitimate edits with no way to tell them from an outside
     * change, and the feature spends its credibility flagging itself. With it,
     * an edit made through this page is reported at LOW severity naming who made
     * it, and only an unexplained change is reported at HIGH.
     *
     * auditIndex: { movement_id: [applied entries] } — built by the caller,
     * because reading Drive is I/O and this file does none. */
    function ruleEditedAfterReview(row, auditIndex) {
      if (!row) return null;
      if (String(row.is_revised) !== '1') return null;
      if (!row.created_at || !row.updated_at) return null;
      /* 'YYYY-MM-DD HH:MM:SS' compares correctly as a string. */
      if (!(String(row.updated_at) > String(row.created_at))) return null;
  
      var entries = (auditIndex || {})[String(row.id)] || [];
      if (entries.length) {
        var last = entries[entries.length - 1];
        var who = (last.user && (last.user.name || last.user.email)) || 'مستخدم غير معروف';
        var cols = (last.changes || []).map(function (c) {
          var spec = EDITABLE_COLUMNS[c.column];
          return spec ? spec.label_ar : c.column;
        });
        return flag_('EDITED_AFTER_REVIEW', 'low', row.id,
          'عُدِّلت الحركة بعد اعتماد مراجعتها — والتعديل مسجَّل في سجل التدقيق بواسطة ' + who +
          (cols.length ? ' على: ' + cols.join('، ') : '') + ' بتاريخ ' + (last.when || '—'),
          [{ row_id: String(row.id), created_at: row.created_at, updated_at: row.updated_at,
             audit: last }]);
      }
  
      return flag_('EDITED_AFTER_REVIEW', 'high', row.id,
        'عُدِّلت الحركة بعد اعتماد مراجعتها ولا يوجد لها أي سجل تدقيق — أي أن التغيير لم يتم من خلال هذه الصفحة',
        [{ row_id: String(row.id), created_at: row.created_at, updated_at: row.updated_at, audit: null }]);
    }
  
    /* ── OUT_OF_SEQUENCE ────────────────────────────────────────────────────
     * id order contradicting transaction_date order. ids are assigned on insert,
     * so a much later id carrying a much earlier date is a row entered out of
     * order.
     *
     * Tolerance is 30 days by default and deliberately generous. Petty cash is
     * routinely keyed a few days late, so a small inversion is normal life; a
     * tight tolerance here would flag half the table and the rule would be
     * switched off within a week. It is also only meaningful over a CONTIGUOUS
     * range of ids — on a filtered page the gaps are the filter's, not the
     * data's — which is why the caller is told so in `notes`.
     *
     * IT FLAGS THE ODD ONE OUT, NOT EVERYTHING AFTER IT. The first version
     * compared each row against the running maximum date, so a single row dated
     * three months in the future flagged all twelve rows that followed it — one
     * anomaly, twelve accusations, and an alerts tab nobody would read twice.
     * A row is reported only when it is far from BOTH of its id-neighbours in the
     * same direction, which is what "out of sequence" actually means. The first
     * and last rows of the set have one neighbour each and are skipped: a
     * one-sided comparison is exactly the thing that cascaded. */
    function ruleOutOfSequence(rows, opts) {
      var o = opts || {};
      var tol = o.sequence_tolerance_days === undefined ? TIER1.SEQUENCE_TOLERANCE_DAYS : o.sequence_tolerance_days;
      var list = (rows || []).filter(function (r) {
        return r && r.transaction_date && r.id !== undefined && r.id !== null && /^\d+$/.test(String(r.id));
      }).slice().sort(function (a, b) {
        var x = String(a.id), y = String(b.id);
        return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);   /* bigint-safe */
      });
  
      var out = [];
      for (var i = 1; i < list.length - 1; i++) {
        var prev = list[i - 1], cur = list[i], next = list[i + 1];
        var backGap = daysBetween(prev.transaction_date, cur.transaction_date);   /* cur − prev */
        var fwdGap = daysBetween(next.transaction_date, cur.transaction_date);    /* cur − next */
        if (backGap === null || fwdGap === null) continue;
  
        var ev = [
          { row_id: String(prev.id), transaction_date: prev.transaction_date },
          { row_id: String(cur.id), transaction_date: cur.transaction_date },
          { row_id: String(next.id), transaction_date: next.transaction_date }
        ];
  
        if (backGap < -tol && fwdGap < -tol) {
          out.push(flag_('OUT_OF_SEQUENCE', 'medium', cur.id,
            'ترتيب الإدخال يخالف التاريخ: الحركة رقم ' + cur.id + ' مسجَّلة بين الحركتين ' +
            prev.id + ' و' + next.id + ' لكن تاريخها ' + cur.transaction_date +
            ' أقدم من كلتيهما بـ ' + Math.abs(backGap) + ' و' + arCount(Math.abs(fwdGap), 'day') + '',
            ev));
        } else if (backGap > tol && fwdGap > tol) {
          out.push(flag_('OUT_OF_SEQUENCE', 'medium', cur.id,
            'ترتيب الإدخال يخالف التاريخ: الحركة رقم ' + cur.id + ' مسجَّلة بين الحركتين ' +
            prev.id + ' و' + next.id + ' لكن تاريخها ' + cur.transaction_date +
            ' أحدث من كلتيهما بـ ' + backGap + ' و' + arCount(fwdGap, 'day') + '',
            ev));
        }
      }
      return out;
    }
  
    /* ── STRUCTURING ────────────────────────────────────────────────────────
     * Several rows, same account and person, inside a short window, each just
     * under a round threshold, summing above it.
     *
     * The thresholds are DERIVED, not guessed. For each candidate round number T
     * the amount histogram is checked for a spike immediately below it: the count
     * in [0.9T, T) against the count in [T, 1.1T). A real approval limit leaves a
     * pile just under it and a hole just over it. A candidate with no such spike
     * is not a limit in this organisation and is dropped, so the rule cannot flag
     * people for being near a number that means nothing here.
     *
     * Below STRUCTURING_MIN_COUNT rows in the band there is no histogram to read
     * and the rule reports insufficient data rather than a weak verdict. */
    function detectStructuringThresholds(rows, opts) {
      var o = opts || {};
      var candidates = o.structuring_candidates || TIER1.STRUCTURING_CANDIDATES;
      var band = o.structuring_band === undefined ? TIER1.STRUCTURING_BAND : o.structuring_band;
      var minRatio = o.structuring_min_ratio === undefined ? TIER1.STRUCTURING_MIN_RATIO : o.structuring_min_ratio;
      var minCount = o.structuring_min_count === undefined ? TIER1.STRUCTURING_MIN_COUNT : o.structuring_min_count;
  
      var amounts = (rows || []).map(amountOf_).filter(function (a) { return a !== null && a > 0; });
      var active = [];
      candidates.forEach(function (T) {
        var below = 0, above = 0;
        amounts.forEach(function (a) {
          if (a >= T * (1 - band) && a < T) below++;
          else if (a >= T && a < T * (1 + band)) above++;
        });
        var ratio = below / Math.max(1, above);
        if (below >= minCount && ratio >= minRatio) {
          active.push({ threshold: T, below: below, above: above, ratio: round_(ratio, 2) });
        }
      });
      return { thresholds: active, n_amounts: amounts.length, band: band };
    }
  
    function ruleStructuring(rows, opts) {
      var o = opts || {};
      var windowDays = o.structuring_window_days === undefined ? TIER1.STRUCTURING_WINDOW_DAYS : o.structuring_window_days;
      var detected = detectStructuringThresholds(rows, o);
  
      if (!detected.thresholds.length) {
        return {
          flags: [],
          detected: detected,
          note: {
            rule_id: 'STRUCTURING',
            status: 'no_threshold_detected',
            n: detected.n_amounts,
            reason_ar: 'لم يظهر في توزيع المبالغ أي تكدّس أسفل رقم مستدير، فلا يوجد حد اعتماد يُستدل عليه من البيانات — ' +
              'ولا تُطبَّق هذه القاعدة بحدود مفترضة'
          }
        };
      }
  
      /* Group by account + person, then slide a window over each group's dates. */
      var groups = {};
      (rows || []).forEach(function (r) {
        if (!r || !r.transaction_date) return;
        var amt = amountOf_(r);
        if (amt === null || amt <= 0) return;
        var key = String(r.chart_of_accounts || '') + ' ' + String(r.responsible_person || '').trim();
        (groups[key] = groups[key] || []).push(r);
      });
  
      var out = [];
      var seen = {};
      Object.keys(groups).forEach(function (key) {
        var g = groups[key].slice().sort(function (a, b) {
          return a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : 0;
        });
        detected.thresholds.forEach(function (t) {
          var T = t.threshold;
          var inBand = g.filter(function (r) {
            var a = amountOf_(r);
            return a >= T * (1 - detected.band) && a < T;
          });
          for (var i = 0; i < inBand.length; i++) {
            var cluster = [inBand[i]];
            var sum = amountOf_(inBand[i]);
            for (var j = i + 1; j < inBand.length; j++) {
              var gap = daysBetween(inBand[i].transaction_date, inBand[j].transaction_date);
              if (gap === null || gap > windowDays) break;
              cluster.push(inBand[j]);
              sum += amountOf_(inBand[j]);
            }
            if (cluster.length < 2 || sum <= T) continue;
  
            var ids = cluster.map(function (r) { return String(r.id); });
            var sig = ids.join(',') + '@' + T;
            if (seen[sig]) continue;
            seen[sig] = true;
  
            var ev = cluster.map(function (r) {
              return { row_id: String(r.id), transaction_date: r.transaction_date,
                       transaction_amount: amountOf_(r), responsible_person: r.responsible_person,
                       chart_of_accounts: r.chart_of_accounts };
            });
            var msg = arCount(cluster.length, 'movement') + ' لنفس المسؤول ونفس الحساب خلال ' +
              arCount(daysBetween(cluster[0].transaction_date, cluster[cluster.length - 1].transaction_date) || 0, 'day') +
              '، كل منها أقل بقليل من ' + fmt2_(T) + ' ومجموعها ' + fmt2_(sum) +
              ' أي أعلى منه. وحد الـ' + fmt2_(T) + ' مستنتج من البيانات نفسها: ' +
              arCount(t.below, 'movement') + ' أسفله مقابل ' + t.above + ' فوقه.';
            cluster.forEach(function (r) {
              out.push(flag_('STRUCTURING', 'high', r.id, msg, ev));
            });
            i += cluster.length - 1;
          }
        });
      });
      return { flags: out, detected: detected, note: null };
    }
  
    /**
     * Run every Tier 1 rule over a set of movement rows.
     *
     * rows: movement rows, each optionally carrying `parse` from parseDetails.
     * opts.auditIndex: { movement_id: [applied audit entries] }, built by the
     *   caller — reading Drive is I/O and this file does none.
     *
     * Returns { flags, by_row, notes, structuring }.
     * `notes` is where a rule says it did NOT run and why. That is not an
     * implementation detail to hide: "no finding" and "could not look" are
     * different answers, and only one of them is reassuring.
     */
    function runTier1(rows, opts) {
      var o = opts || {};
      var list = rows || [];
      var flags = [];
      var notes = [];
  
      list.forEach(function (row) {
        var f;
        f = ruleSumMismatch(row); if (f) flags.push(f);
        f = ruleOddHour(row, o); if (f) flags.push(f);
        f = ruleEditedAfterReview(row, o.auditIndex); if (f) flags.push(f);
      });
  
      flags = flags.concat(ruleDuplicates(list, o));
      flags = flags.concat(ruleOutOfSequence(list, o));
  
      var back = ruleBackdated(list, o);
      flags = flags.concat(back.flags);
      if (back.note) notes.push(back.note);
  
      var struct = ruleStructuring(list, o);
      flags = flags.concat(struct.flags);
      if (struct.note) notes.push(struct.note);
  
      if (list.length) {
        notes.push({
          rule_id: 'OUT_OF_SEQUENCE',
          status: 'scope',
          reason_ar: 'تُقارَن أرقام الحركات داخل المعروض فقط؛ إذا كانت الفلاتر تُخفي حركات بينها فقد ' +
            'تظهر مخالفات ترتيب ليست في البيانات الأصلية'
        });
      }
  
      var byRow = {};
      flags.forEach(function (f) {
        if (f.row_id === null) return;
        (byRow[f.row_id] = byRow[f.row_id] || []).push(f);
      });
  
      return { flags: flags, by_row: byRow, notes: notes, structuring: struct.detected };
    }
  
  
    // ═══════════════════════════════════════════════════════════════════════
    // §7 Tier 2 — price anomalies, per item cluster
    // ═══════════════════════════════════════════════════════════════════════
    //
    // MEDIAN AND MAD, NEVER MEAN AND σ. This is not a style preference. These
    // samples are small — a dozen purchases of one item is a good sample here —
    // and the contamination is exactly what we are hunting. A mean is dragged
    // toward the very rows it is supposed to expose: one inflated purchase raises
    // the average, which raises the threshold, which makes that purchase look
    // less unusual than it is. The median does not move, and the MAD does not
    // move, so an outlier stays an outlier no matter how large it is.
    //
    // Every rule here refuses to run below a minimum n and says so. A price
    // finding names an employee; "بيانات غير كافية" is the honest output when
    // there is not enough history, and a weak verdict is not.
  
    var TIER2 = {
      MIN_N: 6,                  /* below this, a median and a MAD say nothing */
      Z_THRESHOLD: 3.5,          /* modified z-score, the conventional cut */
      MAD_SCALE: 0.6745,         /* 0.6745 = Φ⁻¹(0.75); makes MAD comparable to σ */
      MEANAD_SCALE: 1.253314,    /* used only when MAD is exactly 0 */
      PEER_MIN_N: 3,             /* per side */
      PEER_RATIO: 1.25,          /* 25% above the peer median */
      RATCHET_MIN_N: 5,
      RATCHET_TAU: 0.6,          /* Mann–Kendall τ for the person */
      RATCHET_PEER_TAU: 0.3,     /* …while everyone else is flatter than this */
      NEW_ITEM_MIN_ACCOUNT_N: 10,
      NEW_ITEM_PERCENTILE: 0.9
    };
  
    /** Median absolute deviation. */
    function mad(values) {
      var m = median(values);
      if (m === null) return null;
      return median(values.map(function (x) { return Math.abs(x - m); }));
    }
  
    /**
     * Robust dispersion summary. `scale` is what the modified z-score divides by:
     * the MAD normally, and — only when the MAD is exactly zero, which happens
     * whenever more than half the sample is one identical price — the mean
     * absolute deviation instead. Without that fallback, a single different price
     * against a pile of identical ones divides by zero and every rule downstream
     * reports Infinity.
     */
    function robustStats(values) {
      var v = (values || []).filter(function (x) { return typeof x === 'number' && isFinite(x); });
      if (!v.length) return null;
      var m = median(v);
      var d = mad(v);
      var scale = d, scaleKind = 'mad';
      if (!d) {
        var meanAd = v.reduce(function (a, x) { return a + Math.abs(x - m); }, 0) / v.length;
        scale = meanAd * TIER2.MEANAD_SCALE;
        scaleKind = meanAd ? 'meanad' : 'none';
      }
      return {
        n: v.length,
        median: round_(m, 4),
        mad: d === null ? null : round_(d, 4),
        scale: scale ? round_(scale, 6) : 0,
        scale_kind: scaleKind,
        min: round_(Math.min.apply(null, v), 4),
        max: round_(Math.max.apply(null, v), 4),
        p25: round_(percentile(v, 0.25), 4),
        p75: round_(percentile(v, 0.75), 4)
      };
    }
  
    /** Modified z-score. Null when there is no dispersion to measure against. */
    function modifiedZ(x, stats) {
      if (!stats || !stats.scale) return null;
      return round_(TIER2.MAD_SCALE * (x - stats.median) / stats.scale, 3);
    }
  
    /**
     * Mann–Kendall τ over a series already in time order. +1 is monotone
     * increasing, −1 monotone decreasing, 0 no trend. Rank-based, so one wild
     * value cannot manufacture a trend the way a least-squares slope can.
     */
    function mannKendallTau(series) {
      var v = (series || []).filter(function (x) { return typeof x === 'number' && isFinite(x); });
      var n = v.length;
      if (n < 3) return null;
      var s = 0;
      for (var i = 0; i < n - 1; i++) {
        for (var j = i + 1; j < n; j++) {
          s += (v[j] > v[i]) ? 1 : (v[j] < v[i]) ? -1 : 0;
        }
      }
      return round_(s / (n * (n - 1) / 2), 4);
    }
  
    /**
     * Per-cluster price statistics. This is both what Tier 2 reasons over and
     * what tab 3 renders, so the number a reviewer reads and the number the rule
     * fired on are the same number by construction.
     *
     * occurrences: [{ movement_id, transaction_date, item_norm, unit, qty,
     *                 price, unit_price, responsible_person, chart_of_accounts }]
     * byNorm: { item_norm: cluster_id } from clusterItems.
     */
    function clusterPriceStats(occurrences, byNorm) {
      var buckets = {};
      (occurrences || []).forEach(function (o) {
        if (!o || o.unit_price === null || o.unit_price === undefined) return;
        var cid = (byNorm || {})[o.item_norm];
        if (cid === undefined) cid = o.item_norm;
        var b = buckets[cid] = buckets[cid] || { cluster_id: cid, occurrences: [], labels: {} };
        b.occurrences.push(o);
        b.labels[o.item_norm] = (b.labels[o.item_norm] || 0) + 1;
      });
  
      var out = {};
      Object.keys(buckets).forEach(function (cid) {
        var b = buckets[cid];
        var prices = b.occurrences.map(function (o) { return Number(o.unit_price); });
        var qtys = b.occurrences.map(function (o) { return Number(o.qty); })
          .filter(function (q) { return isFinite(q); });
        var label = Object.keys(b.labels).sort(function (x, y) { return b.labels[y] - b.labels[x]; })[0];
  
        var byPerson = {};
        b.occurrences.forEach(function (o) {
          var p = String(o.responsible_person || '').trim() || '(غير محدد)';
          (byPerson[p] = byPerson[p] || []).push(Number(o.unit_price));
        });
        var people = {};
        Object.keys(byPerson).forEach(function (p) {
          people[p] = { n: byPerson[p].length, median: round_(median(byPerson[p]), 4) };
        });
  
        out[cid] = {
          cluster_id: cid,
          label: label,
          n: b.occurrences.length,
          price: robustStats(prices),
          qty: robustStats(qtys),
          by_person: people,
          occurrences: b.occurrences
        };
      });
      return out;
    }
  
    /* ── PRICE_OUTLIER ──────────────────────────────────────────────────────
     * Modified z-score on unit_price within the item's own cluster. */
    function rulePriceOutlier(stats, opts) {
      var o = opts || {};
      var minN = o.tier2_min_n === undefined ? TIER2.MIN_N : o.tier2_min_n;
      var zCut = o.tier2_z === undefined ? TIER2.Z_THRESHOLD : o.tier2_z;
      var flags = [], notes = [];
  
      Object.keys(stats).forEach(function (cid) {
        var c = stats[cid];
        if (c.n < minN) {
          notes.push({ rule_id: 'PRICE_OUTLIER', status: 'insufficient_data', cluster_id: cid,
            n: c.n, required: minN,
            reason_ar: 'بيانات غير كافية لتحليل سعر «' + c.label + '» (المتاح ' + arCount(c.n, 'purchase') +
              '، والمطلوب ' + minN + ')' });
          return;
        }
        if (!c.price || !c.price.scale) {
          notes.push({ rule_id: 'PRICE_OUTLIER', status: 'no_dispersion', cluster_id: cid, n: c.n,
            reason_ar: 'كل عمليات شراء «' + c.label + '» بنفس سعر الوحدة، فلا يوجد تشتت يُقاس عليه' });
          return;
        }
        c.occurrences.forEach(function (occ) {
          var z = modifiedZ(Number(occ.unit_price), c.price);
          if (z === null || Math.abs(z) <= zCut) return;
          flags.push(flag_('PRICE_OUTLIER', Math.abs(z) > zCut * 2 ? 'high' : 'medium', occ.movement_id,
            'سعر وحدة «' + c.label + '» في هذه الحركة ' + fmt2_(occ.unit_price) +
            '، والوسيط التاريخي ' + fmt2_(c.price.median) + ' من ' + arCount(c.n, 'purchase') +
            ' (المدى ' + fmt2_(c.price.min) + '–' + fmt2_(c.price.max) + ')' +
            ' — درجة انحراف ' + z + ' مقياس مقاوم للقيم الشاذة (الوسيط والانحراف المطلق الوسيط، لا المتوسط)',
            [{ row_id: String(occ.movement_id), transaction_date: occ.transaction_date,
               item: occ.item_norm, unit_price: occ.unit_price,
               cluster_median: c.price.median, cluster_n: c.n, modified_z: z,
               responsible_person: occ.responsible_person }]));
        });
      });
      return { flags: flags, notes: notes };
    }
  
    /* ── PEER_GAP ───────────────────────────────────────────────────────────
     * The same item, the same period: this person's median unit price against
     * everyone else's. The single strongest petty-cash signal, because it holds
     * the item constant and varies only who bought it. */
    function rulePeerGap(stats, opts) {
      var o = opts || {};
      var minSide = o.peer_min_n === undefined ? TIER2.PEER_MIN_N : o.peer_min_n;
      var ratioCut = o.peer_ratio === undefined ? TIER2.PEER_RATIO : o.peer_ratio;
      var flags = [], notes = [];
  
      Object.keys(stats).forEach(function (cid) {
        var c = stats[cid];
        var people = Object.keys(c.by_person);
        if (people.length < 2) return;
  
        people.forEach(function (person) {
          var mine = [], theirs = [];
          c.occurrences.forEach(function (occ) {
            var p = String(occ.responsible_person || '').trim() || '(غير محدد)';
            (p === person ? mine : theirs).push(Number(occ.unit_price));
          });
          if (mine.length < minSide || theirs.length < minSide) return;
          var myMed = median(mine), theirMed = median(theirs);
          if (!theirMed) return;
          var ratio = myMed / theirMed;
          if (ratio < ratioCut) return;
  
          var rows = c.occurrences.filter(function (occ) {
            return (String(occ.responsible_person || '').trim() || '(غير محدد)') === person;
          });
          var msg = 'يشتري ' + person + ' صنف «' + c.label + '» بوسيط سعر وحدة ' + fmt2_(myMed) +
            ' مقابل ' + fmt2_(theirMed) + ' لباقي المسؤولين — أي أعلى بنسبة ' +
            Math.round((ratio - 1) * 100) + '% (' + arCount(mine.length, 'op') + ' مقابل ' + theirs.length + ')';
          rows.forEach(function (occ) {
            flags.push(flag_('PEER_GAP', ratio >= ratioCut * 1.6 ? 'high' : 'medium', occ.movement_id, msg,
              rows.map(function (r) {
                return { row_id: String(r.movement_id), transaction_date: r.transaction_date,
                         item: r.item_norm, unit_price: r.unit_price, responsible_person: person };
              }).concat([{ row_id: null, peer_median: round_(theirMed, 4), peer_n: theirs.length }])));
          });
        });
      });
      return { flags: flags, notes: notes };
    }
  
    /* ── PRICE_RATCHET ──────────────────────────────────────────────────────
     * One person's unit price for an item climbing monotonically while everyone
     * else's stays flat. Mann–Kendall rather than a regression slope: it is
     * rank-based, so a single large purchase cannot manufacture a trend. */
    function rulePriceRatchet(stats, opts) {
      var o = opts || {};
      var minN = o.ratchet_min_n === undefined ? TIER2.RATCHET_MIN_N : o.ratchet_min_n;
      var tauCut = o.ratchet_tau === undefined ? TIER2.RATCHET_TAU : o.ratchet_tau;
      var peerTauCut = o.ratchet_peer_tau === undefined ? TIER2.RATCHET_PEER_TAU : o.ratchet_peer_tau;
      var flags = [], notes = [];
  
      Object.keys(stats).forEach(function (cid) {
        var c = stats[cid];
        var people = Object.keys(c.by_person);
        people.forEach(function (person) {
          var mine = [], theirs = [];
          c.occurrences.slice().sort(function (a, b) {
            return a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : 0;
          }).forEach(function (occ) {
            var p = String(occ.responsible_person || '').trim() || '(غير محدد)';
            (p === person ? mine : theirs).push(occ);
          });
          if (mine.length < minN) return;
  
          var myTau = mannKendallTau(mine.map(function (x) { return Number(x.unit_price); }));
          if (myTau === null || myTau < tauCut) return;
          var theirTau = theirs.length >= 3
            ? mannKendallTau(theirs.map(function (x) { return Number(x.unit_price); }))
            : null;
          if (theirTau !== null && theirTau >= peerTauCut) return;   /* everyone is rising — a market move */
  
          var first = Number(mine[0].unit_price), last = Number(mine[mine.length - 1].unit_price);
          if (!(last > first)) return;
  
          var msg = 'سعر وحدة «' + c.label + '» لدى ' + person + ' في ارتفاع مطّرد: من ' +
            fmt2_(first) + ' في ' + mine[0].transaction_date + ' إلى ' + fmt2_(last) + ' في ' +
            mine[mine.length - 1].transaction_date + ' عبر ' + arCount(mine.length, 'op') + ' (معامل اتجاه ' +
            myTau + ')' +
            (theirTau === null
              ? ' — ولا توجد بيانات كافية لباقي المسؤولين للمقارنة'
              : '، بينما اتجاه باقي المسؤولين ' + theirTau + ' أي شبه ثابت');
          mine.forEach(function (occ) {
            flags.push(flag_('PRICE_RATCHET', 'medium', occ.movement_id, msg,
              mine.map(function (r) {
                return { row_id: String(r.movement_id), transaction_date: r.transaction_date,
                         item: r.item_norm, unit_price: r.unit_price, responsible_person: person };
              })));
          });
        });
      });
      return { flags: flags, notes: notes };
    }
  
    /* ── NEW_ITEM_HIGH_VALUE ────────────────────────────────────────────────
     * An item bought exactly once, at a price high for its account. Cheap to
     * check and it is where a fabricated purchase tends to land: something that
     * has no history to be compared against. */
    function ruleNewItemHighValue(stats, occurrences, opts) {
      var o = opts || {};
      var minAcctN = o.new_item_min_account_n === undefined ? TIER2.NEW_ITEM_MIN_ACCOUNT_N : o.new_item_min_account_n;
      var pct = o.new_item_percentile === undefined ? TIER2.NEW_ITEM_PERCENTILE : o.new_item_percentile;
      var flags = [], notes = [];
  
      var byAccount = {};
      (occurrences || []).forEach(function (occ) {
        var a = String(occ.chart_of_accounts || '').trim();
        if (!a) return;
        (byAccount[a] = byAccount[a] || []).push(Number(occ.price));
      });
  
      Object.keys(stats).forEach(function (cid) {
        var c = stats[cid];
        if (c.n !== 1) return;
        var occ = c.occurrences[0];
        var acct = String(occ.chart_of_accounts || '').trim();
        var pop = byAccount[acct] || [];
        if (pop.length < minAcctN) {
          notes.push({ rule_id: 'NEW_ITEM_HIGH_VALUE', status: 'insufficient_data', cluster_id: cid,
            n: pop.length, required: minAcctN,
            reason_ar: 'بيانات غير كافية لحساب المعتاد لحساب ' + acct + ' (المتاح ' + arCount(pop.length, 'item') +
              '، والمطلوب ' + minAcctN + ')' });
          return;
        }
        var cut = percentile(pop, pct);
        if (!(Number(occ.price) > cut)) return;
        flags.push(flag_('NEW_ITEM_HIGH_VALUE', 'medium', occ.movement_id,
          'صنف «' + c.label + '» لم يُشترَ من قبل في هذه الفترة، وسعره ' + fmt2_(occ.price) +
          ' أعلى من ' + Math.round(pct * 100) + '% من بنود حساب ' + acct +
          ' (الحد ' + fmt2_(cut) + ' من ' + arCount(pop.length, 'item') + ')',
          [{ row_id: String(occ.movement_id), transaction_date: occ.transaction_date,
             item: occ.item_norm, price: occ.price, account_cut: round_(cut, 2),
             account_n: pop.length, responsible_person: occ.responsible_person }]));
      });
      return { flags: flags, notes: notes };
    }
  
    /* ── QUANTITY_ANOMALY ───────────────────────────────────────────────────
     * The unit price is entirely normal and the QUANTITY is not. Worth its own
     * rule because a price check alone cannot see it: buying ten times the usual
     * amount at the usual price passes every price rule in this tier. */
    function ruleQuantityAnomaly(stats, opts) {
      var o = opts || {};
      var minN = o.tier2_min_n === undefined ? TIER2.MIN_N : o.tier2_min_n;
      var zCut = o.tier2_z === undefined ? TIER2.Z_THRESHOLD : o.tier2_z;
      var flags = [];
  
      Object.keys(stats).forEach(function (cid) {
        var c = stats[cid];
        if (c.n < minN || !c.qty || !c.qty.scale) return;
        c.occurrences.forEach(function (occ) {
          var q = Number(occ.qty);
          if (!isFinite(q)) return;
          var qz = modifiedZ(q, c.qty);
          if (qz === null || qz <= zCut) return;               /* only unusually LARGE quantities */
          var pz = c.price && c.price.scale ? modifiedZ(Number(occ.unit_price), c.price) : null;
          if (pz !== null && Math.abs(pz) > zCut) return;       /* the price rule already has this row */
          flags.push(flag_('QUANTITY_ANOMALY', 'medium', occ.movement_id,
            'كمية «' + c.label + '» في هذه الحركة ' + fmt2_(q) + ' مقابل وسيط ' +
            fmt2_(c.qty.median) + ' من ' + arCount(c.n, 'purchase') + '، مع أن سعر الوحدة طبيعي — ' +
            'درجة انحراف الكمية ' + qz,
            [{ row_id: String(occ.movement_id), transaction_date: occ.transaction_date,
               item: occ.item_norm, qty: q, qty_median: c.qty.median, modified_z: qz,
               unit_price: occ.unit_price, responsible_person: occ.responsible_person }]));
        });
      });
      return { flags: flags, notes: [] };
    }
  
    /**
     * Run Tier 2 over parsed item occurrences.
     *
     * occurrences: as produced by getBoxItemHistory_.
     * opts.byNorm: item_norm → cluster_id, from clusterItems. When absent, each
     *   distinct text is its own cluster, which is strictly worse and is the
     *   caller's choice to make knowingly.
     *
     * Returns { flags, by_row, notes, stats }.
     */
    function runTier2(occurrences, opts) {
      var o = opts || {};
      var byNorm = o.byNorm || null;
      if (!byNorm) {
        var clustered = clusterItems(occurrences || [], { aliases: o.aliases || null });
        byNorm = clustered.byNorm;
      }
      var stats = clusterPriceStats(occurrences, byNorm);
  
      var flags = [], notes = [];
      [rulePriceOutlier(stats, o),
       rulePeerGap(stats, o),
       rulePriceRatchet(stats, o),
       ruleNewItemHighValue(stats, occurrences, o),
       ruleQuantityAnomaly(stats, o)].forEach(function (r) {
        flags = flags.concat(r.flags);
        notes = notes.concat(r.notes || []);
      });
  
      var byRow = {};
      flags.forEach(function (f) {
        if (f.row_id === null) return;
        (byRow[f.row_id] = byRow[f.row_id] || []).push(f);
      });
      return { flags: flags, by_row: byRow, notes: notes, stats: stats };
    }
  
  
    // ═══════════════════════════════════════════════════════════════════════
    // §7 Tier 3 — distributional and behavioural, per entity
    // ═══════════════════════════════════════════════════════════════════════
    //
    // These rules describe a PERSON or an ACCOUNT, not a row, so their findings
    // carry an `entity` and their `row_id` is null. That distinction matters on
    // screen: "this movement is wrong" and "this person's spending has changed
    // shape" are different claims and must not render as the same badge.
    //
    // Every one of them is gated on a minimum n, and Benford's is gated hard at
    // 300. That gate is a CORRECTNESS REQUIREMENT, not a statistical nicety. A
    // Benford verdict on forty rows is noise, and this page attaches it to a
    // named employee. Below the gate the page must show "بيانات غير كافية" and
    // nothing else — there is no such thing as a weak accusation.
  
    var TIER3 = {
      BENFORD_MIN_N: 300,
      BENFORD_MAD_MARGINAL: 0.012,   /* Nigrini's conformity bands, first digit */
      BENFORD_MAD_NONCONFORM: 0.015,
      ROUND_MIN_N: 30,
      ROUND_Z: 3,
      ROUND_DIVISORS: [100, 50],
      VELOCITY_MIN_DAYS: 20,
      VELOCITY_MIN_COUNT: 5,
      VELOCITY_P: 0.001,
      DRIFT_MIN_N: 30,               /* per side */
      DRIFT_PSI: 0.25,               /* the conventional "significant shift" cut */
      SEASON_MIN_MONTHS: 6,
      SEASON_Z: 3.5
    };
  
    function firstDigit_(v) {
      var s = String(Math.abs(Number(v))).replace(/[^0-9]/g, '').replace(/^0+/, '');
      return s.length ? Number(s.charAt(0)) : null;
    }
  
    function secondDigit_(v) {
      var s = String(Math.abs(Number(v))).replace(/[^0-9]/g, '').replace(/^0+/, '');
      return s.length >= 2 ? Number(s.charAt(1)) : null;
    }
  
    /**
     * Benford's law on the leading digit.
     *
     * Returns { status, n, observed, expected, chi2, mad, verdict_ar } — or
     * status 'insufficient_data' below the gate, with NO verdict of any kind.
     * Returning a weak verdict here and letting the caller decide whether to
     * show it would be the same mistake one layer up: the gate has to be where
     * the number is computed.
     */
    function benfordFirstDigit(values, opts) {
      var o = opts || {};
      var minN = o.benford_min_n === undefined ? TIER3.BENFORD_MIN_N : o.benford_min_n;
      var digits = (values || []).map(firstDigit_).filter(function (d) { return d >= 1 && d <= 9; });
      var n = digits.length;
      if (n < minN) {
        return {
          status: 'insufficient_data', n: n, required: minN,
          reason_ar: 'بيانات غير كافية لتحليل بنفورد (المتاح ' + arCount(n, 'amount') + '، والمطلوب ' + minN +
            ' على الأقل) — لا يصدر أي حكم دون ذلك'
        };
      }
      var observed = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      digits.forEach(function (d) { observed[d - 1]++; });
      var chi2 = 0, madSum = 0, expected = [];
      for (var d = 1; d <= 9; d++) {
        var p = Math.log(1 + 1 / d) / Math.LN10;
        var e = p * n;
        expected.push(round_(p, 6));
        chi2 += ((observed[d - 1] - e) * (observed[d - 1] - e)) / e;
        madSum += Math.abs(observed[d - 1] / n - p);
      }
      var madVal = madSum / 9;
      var verdict = madVal < 0.006 ? 'مطابقة وثيقة'
        : madVal < TIER3.BENFORD_MAD_MARGINAL ? 'مطابقة مقبولة'
        : madVal < TIER3.BENFORD_MAD_NONCONFORM ? 'مطابقة حدية'
        : 'عدم مطابقة';
      return {
        status: 'ok', n: n, observed: observed, expected: expected,
        chi2: round_(chi2, 3), df: 8, mad: round_(madVal, 5),
        conforms: madVal < TIER3.BENFORD_MAD_NONCONFORM,
        verdict_ar: verdict
      };
    }
  
    /** Benford on the SECOND digit (0–9). Same gate, same refusal. */
    function benfordSecondDigit(values, opts) {
      var o = opts || {};
      var minN = o.benford_min_n === undefined ? TIER3.BENFORD_MIN_N : o.benford_min_n;
      var digits = (values || []).map(secondDigit_).filter(function (d) { return d !== null && d >= 0 && d <= 9; });
      var n = digits.length;
      if (n < minN) {
        return { status: 'insufficient_data', n: n, required: minN,
          reason_ar: 'بيانات غير كافية لتحليل بنفورد للرقم الثاني (المتاح ' + n + '، والمطلوب ' + minN + ')' };
      }
      var observed = [], expected = [], d, k;
      for (d = 0; d <= 9; d++) observed.push(0);
      digits.forEach(function (x) { observed[x]++; });
      var chi2 = 0, madSum = 0;
      for (d = 0; d <= 9; d++) {
        var p = 0;
        for (k = 1; k <= 9; k++) p += Math.log(1 + 1 / (10 * k + d)) / Math.LN10;
        expected.push(round_(p, 6));
        var e = p * n;
        chi2 += ((observed[d] - e) * (observed[d] - e)) / e;
        madSum += Math.abs(observed[d] / n - p);
      }
      var madVal = madSum / 10;
      return { status: 'ok', n: n, observed: observed, expected: expected,
        chi2: round_(chi2, 3), df: 9, mad: round_(madVal, 5),
        conforms: madVal < TIER3.BENFORD_MAD_NONCONFORM };
    }
  
    /**
     * Benford per entity. Entities are built by the caller's grouping key so the
     * same function serves "per person" and "per account".
     */
    function ruleBenford(rows, opts) {
      var o = opts || {};
      var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
      var kind = o.entity_kind || 'المسؤول';
      var groups = {};
      (rows || []).forEach(function (r) {
        var amt = amountOf_(r);
        if (amt === null || amt <= 0) return;
        var k = keyFn(r);
        if (!k) return;
        (groups[k] = groups[k] || []).push(r);
      });
  
      var flags = [], notes = [];
      Object.keys(groups).forEach(function (k) {
        var rowsFor = groups[k];
        var amounts = rowsFor.map(amountOf_);
        var b = benfordFirstDigit(amounts, o);
        if (b.status !== 'ok') {
          notes.push({ rule_id: 'BENFORD', status: 'insufficient_data', entity: k, entity_kind: kind,
            n: b.n, required: b.required, reason_ar: kind + ' ' + k + ': ' + b.reason_ar });
          return;
        }
        if (b.conforms) return;
        var f = flag_('BENFORD', 'medium', null,
          'توزيع الرقم الأول لمبالغ ' + kind + ' ' + k + ' لا يطابق قانون بنفورد على ' + arCount(b.n, 'amount') +
          ' (متوسط الانحراف المطلق ' + b.mad + '، كاي-تربيع ' + b.chi2 + ' بدرجات حرية 8) — ' +
          b.verdict_ar + '. هذا مؤشر إحصائي على مستوى المجموعة، وليس اتهاماً لأي حركة بعينها؛ ' +
          'يُستخدَم لترتيب أولوية المراجعة فقط',
          rowsFor.slice(0, 20).map(function (r) {
            return { row_id: String(r.id), transaction_date: r.transaction_date,
                     transaction_amount: amountOf_(r) };
          }));
        f.entity = k;
        f.entity_kind = kind;
        f.detail = b;
        flags.push(f);
      });
      return { flags: flags, notes: notes };
    }
  
    /**
     * ROUND_NUMBER_BIAS — a person producing far more round amounts than the
     * population does. Estimated amounts cluster on round numbers; measured ones
     * do not.
     *
     * The baseline is THIS POPULATION's own rate, not a textbook figure: in an
     * organisation that mostly buys in round quantities, round totals are normal
     * and a fixed expectation would flag everyone.
     */
    function ruleRoundNumberBias(rows, opts) {
      var o = opts || {};
      var minN = o.round_min_n === undefined ? TIER3.ROUND_MIN_N : o.round_min_n;
      var zCut = o.round_z === undefined ? TIER3.ROUND_Z : o.round_z;
      var divisors = o.round_divisors || TIER3.ROUND_DIVISORS;
      var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
      var kind = o.entity_kind || 'المسؤول';
  
      var all = (rows || []).filter(function (r) { return amountOf_(r) !== null && amountOf_(r) > 0; });
      if (!all.length) return { flags: [], notes: [] };
  
      var flags = [], notes = [];
      divisors.forEach(function (div) {
        var isRound = function (r) { return Math.abs(amountOf_(r) % div) < 1e-9; };
        var p0 = all.filter(isRound).length / all.length;
        if (p0 <= 0 || p0 >= 1) return;
  
        var groups = {};
        all.forEach(function (r) {
          var k = keyFn(r);
          if (!k) return;
          (groups[k] = groups[k] || []).push(r);
        });
        Object.keys(groups).forEach(function (k) {
          var g = groups[k];
          if (g.length < minN) {
            notes.push({ rule_id: 'ROUND_NUMBER_BIAS', status: 'insufficient_data', entity: k,
              entity_kind: kind, n: g.length, required: minN,
              reason_ar: kind + ' ' + k + ': بيانات غير كافية لاختبار الأرقام المستديرة (المتاح ' +
                g.length + '، والمطلوب ' + minN + ')' });
            return;
          }
          var hits = g.filter(isRound).length;
          var pHat = hits / g.length;
          var se = Math.sqrt(p0 * (1 - p0) / g.length);
          if (!se) return;
          var z = (pHat - p0) / se;
          if (z < zCut) return;
          var f = flag_('ROUND_NUMBER_BIAS', 'medium', null,
            Math.round(pHat * 100) + '% من مبالغ ' + kind + ' ' + k + ' من مضاعفات ' + div +
            ' (' + hits + ' من ' + g.length + ')، مقابل ' + Math.round(p0 * 100) +
            '% في باقي البيانات — انحراف ' + round_(z, 2) + ' وحدة معيارية. ' +
            'المبالغ المقدَّرة تتكدّس على الأرقام المستديرة، والمقيسة لا تفعل',
            g.filter(isRound).slice(0, 20).map(function (r) {
              return { row_id: String(r.id), transaction_date: r.transaction_date,
                       transaction_amount: amountOf_(r) };
            }));
          f.entity = k;
          f.entity_kind = kind;
          f.detail = { divisor: div, rate: round_(pHat, 4), baseline: round_(p0, 4), z: round_(z, 3), n: g.length };
          flags.push(f);
        });
      });
      return { flags: flags, notes: notes };
    }
  
    /** Poisson upper tail P(X >= k) for mean lambda. k is small here. */
    function poissonTail(k, lambda) {
      if (lambda <= 0) return k > 0 ? 0 : 1;
      var cum = 0, term = Math.exp(-lambda);
      for (var i = 0; i < k; i++) {
        cum += term;
        term = term * lambda / (i + 1);
      }
      var tail = 1 - cum;
      return tail < 0 ? 0 : tail;
    }
  
    /**
     * VELOCITY_BURST — a person filing far more movements in one day than they
     * normally do. Compared against THEIR OWN baseline, never against the busiest
     * person in the office: a storekeeper who files twenty a day every day is
     * doing their job, and a rule that cannot tell them apart from someone who
     * suddenly files twenty after months of two is not measuring anything.
     */
    function ruleVelocityBurst(rows, opts) {
      var o = opts || {};
      var minDays = o.velocity_min_days === undefined ? TIER3.VELOCITY_MIN_DAYS : o.velocity_min_days;
      var minCount = o.velocity_min_count === undefined ? TIER3.VELOCITY_MIN_COUNT : o.velocity_min_count;
      var pCut = o.velocity_p === undefined ? TIER3.VELOCITY_P : o.velocity_p;
      var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
      var kind = o.entity_kind || 'المسؤول';
  
      var groups = {};
      (rows || []).forEach(function (r) {
        if (!r || !r.transaction_date) return;
        var k = keyFn(r);
        if (!k) return;
        (groups[k] = groups[k] || []).push(r);
      });
  
      var flags = [], notes = [];
      Object.keys(groups).forEach(function (k) {
        var byDay = {};
        groups[k].forEach(function (r) { (byDay[r.transaction_date] = byDay[r.transaction_date] || []).push(r); });
        var days = Object.keys(byDay);
        if (days.length < minDays) {
          notes.push({ rule_id: 'VELOCITY_BURST', status: 'insufficient_data', entity: k, entity_kind: kind,
            n: days.length, required: minDays,
            reason_ar: kind + ' ' + k + ': بيانات غير كافية لحساب المعدل اليومي المعتاد (المتاح ' +
              arCount(days.length, 'workday') + '، والمطلوب ' + minDays + ')' });
          return;
        }
        var counts = days.map(function (d) { return byDay[d].length; });
        var lambda = median(counts);
        if (!lambda || lambda <= 0) lambda = counts.reduce(function (a, b) { return a + b; }, 0) / counts.length;
        if (!lambda || lambda <= 0) return;
  
        days.forEach(function (d) {
          var kCount = byDay[d].length;
          if (kCount < minCount) return;
          var p = poissonTail(kCount, lambda);
          if (p >= pCut) return;
          var f = flag_('VELOCITY_BURST', 'medium', null,
            'سجّل ' + kind + ' ' + k + ' عدد ' + arCount(kCount, 'movement') + ' في يوم ' + d +
            '، والمعتاد له ' + round_(lambda, 2) + ' حركة في اليوم عبر ' + arCount(days.length, 'workday') +
            ' — احتمال ذلك بالصدفة أقل من ' + (p < 0.0001 ? '0.01%' : round_(p * 100, 3) + '%'),
            byDay[d].slice(0, 20).map(function (r) {
              return { row_id: String(r.id), transaction_date: r.transaction_date,
                       transaction_amount: amountOf_(r) };
            }));
          f.entity = k;
          f.entity_kind = kind;
          f.detail = { day: d, count: kCount, baseline: round_(lambda, 3), p: p, active_days: days.length };
          flags.push(f);
        });
      });
      return { flags: flags, notes: notes };
    }
  
    /**
     * ACCOUNT_MIX_DRIFT — the shape of a person's spending across accounts,
     * compared with their OWN earlier history. Population Stability Index; > 0.25
     * is the conventional "significant shift".
     *
     * This is what catches miscoding used to hide spend: the totals can look
     * entirely normal while the mix moves.
     */
    function populationStabilityIndex(recent, baseline) {
      var keys = {};
      Object.keys(recent).forEach(function (k) { keys[k] = true; });
      Object.keys(baseline).forEach(function (k) { keys[k] = true; });
      var rTot = 0, bTot = 0;
      Object.keys(recent).forEach(function (k) { rTot += recent[k]; });
      Object.keys(baseline).forEach(function (k) { bTot += baseline[k]; });
      if (!rTot || !bTot) return null;
      var psi = 0, parts = [];
      Object.keys(keys).forEach(function (k) {
        /* A small floor keeps a category that is absent on one side from making
           the index infinite; without it one new account code dominates. */
        var a = Math.max((recent[k] || 0) / rTot, 0.0001);
        var b = Math.max((baseline[k] || 0) / bTot, 0.0001);
        var part = (a - b) * Math.log(a / b);
        psi += part;
        parts.push({ key: k, recent: round_(a, 4), baseline: round_(b, 4), contribution: round_(part, 4) });
      });
      parts.sort(function (x, y) { return y.contribution - x.contribution; });
      return { psi: round_(psi, 4), parts: parts };
    }
  
    function ruleAccountMixDrift(rows, opts) {
      var o = opts || {};
      var minN = o.drift_min_n === undefined ? TIER3.DRIFT_MIN_N : o.drift_min_n;
      var psiCut = o.drift_psi === undefined ? TIER3.DRIFT_PSI : o.drift_psi;
      var splitDate = o.drift_split_date || null;
      var keyFn = o.entity_key || function (r) { return String(r.responsible_person || '').trim(); };
      var kind = o.entity_kind || 'المسؤول';
  
      var groups = {};
      (rows || []).forEach(function (r) {
        if (!r || !r.transaction_date || !r.chart_of_accounts) return;
        var k = keyFn(r);
        if (!k) return;
        (groups[k] = groups[k] || []).push(r);
      });
  
      var flags = [], notes = [];
      Object.keys(groups).forEach(function (k) {
        var g = groups[k].slice().sort(function (a, b) {
          return a.transaction_date < b.transaction_date ? -1 : a.transaction_date > b.transaction_date ? 1 : 0;
        });
        var recent = {}, baseline = {}, nR = 0, nB = 0;
        if (splitDate) {
          g.forEach(function (r) {
            var t = r.transaction_date >= splitDate ? recent : baseline;
            t[r.chart_of_accounts] = (t[r.chart_of_accounts] || 0) + 1;
            if (t === recent) nR++; else nB++;
          });
        } else {
          /* No split given: the most recent third against the rest. */
          var cut = Math.floor(g.length * 2 / 3);
          g.forEach(function (r, i) {
            var t = i >= cut ? recent : baseline;
            t[r.chart_of_accounts] = (t[r.chart_of_accounts] || 0) + 1;
            if (t === recent) nR++; else nB++;
          });
        }
        if (nR < minN || nB < minN) {
          notes.push({ rule_id: 'ACCOUNT_MIX_DRIFT', status: 'insufficient_data', entity: k, entity_kind: kind,
            n: Math.min(nR, nB), required: minN,
            reason_ar: kind + ' ' + k + ': بيانات غير كافية لمقارنة توزيع الحسابات (' + nB +
              ' سابقة و' + nR + ' حديثة، والمطلوب ' + minN + ' لكل جانب)' });
          return;
        }
        var psi = populationStabilityIndex(recent, baseline);
        if (!psi || psi.psi < psiCut) return;
        var top = psi.parts.slice(0, 3).map(function (p) {
          return 'حساب ' + p.key + ' من ' + Math.round(p.baseline * 100) + '% إلى ' + Math.round(p.recent * 100) + '%';
        });
        var f = flag_('ACCOUNT_MIX_DRIFT', 'medium', null,
          'تغيّر توزيع مصروفات ' + kind + ' ' + k + ' بين الحسابات مقارنةً بسجله السابق ' +
          '(مؤشر الاستقرار ' + psi.psi + '، والحد المعتاد ' + psiCut + ') — أبرز التحولات: ' +
          top.join('، ') + '. الإجماليات قد تبدو طبيعية بينما يتغيّر التوزيع، وهو ما يُخفي المصروف بإعادة تصنيفه',
          g.slice(-20).map(function (r) {
            return { row_id: String(r.id), transaction_date: r.transaction_date,
                     chart_of_accounts: r.chart_of_accounts, transaction_amount: amountOf_(r) };
          }));
        f.entity = k;
        f.entity_kind = kind;
        f.detail = { psi: psi.psi, parts: psi.parts.slice(0, 6), n_recent: nR, n_baseline: nB };
        flags.push(f);
      });
      return { flags: flags, notes: notes };
    }
  
    /**
     * SEASONALITY — this month's spend for an account against its own trailing
     * monthly distribution, on the median/MAD scale for the same reason Tier 2
     * uses it. Needs at least SEASON_MIN_MONTHS complete prior months.
     *
     * The current (partial) month is EXCLUDED from its own baseline, and it is
     * compared only when the caller supplies a completed-month figure — a partial
     * month measured against complete ones is the same mistake the four windows
     * were built to avoid.
     */
    function ruleSeasonality(rows, opts) {
      var o = opts || {};
      var minMonths = o.season_min_months === undefined ? TIER3.SEASON_MIN_MONTHS : o.season_min_months;
      var zCut = o.season_z === undefined ? TIER3.SEASON_Z : o.season_z;
      var currentMonth = o.current_month || null;    /* 'YYYY-MM'; required */
      var flags = [], notes = [];
      if (!currentMonth) {
        notes.push({ rule_id: 'SEASONALITY', status: 'not_run',
          reason_ar: 'لم يُحدَّد الشهر الحالي، فلا تُشغَّل مقارنة الموسمية' });
        return { flags: flags, notes: notes };
      }
  
      var byAccount = {};
      (rows || []).forEach(function (r) {
        var amt = amountOf_(r);
        if (amt === null || !r.transaction_date || !r.chart_of_accounts) return;
        if (String(r.transaction_type) === 'debit') return;      /* spend only */
        var mon = String(r.transaction_date).slice(0, 7);
        var a = String(r.chart_of_accounts);
        var m = byAccount[a] = byAccount[a] || {};
        m[mon] = (m[mon] || 0) + amt;
      });
  
      Object.keys(byAccount).forEach(function (acct) {
        var months = byAccount[acct];
        var prior = Object.keys(months).filter(function (m) { return m < currentMonth; }).sort();
        if (prior.length < minMonths) {
          notes.push({ rule_id: 'SEASONALITY', status: 'insufficient_data', entity: acct,
            entity_kind: 'الحساب', n: prior.length, required: minMonths,
            reason_ar: 'حساب ' + acct + ': بيانات غير كافية لمقارنة الموسمية (المتاح ' +
              arCount(prior.length, 'month') + ' مكتملة، والمطلوب ' + minMonths + ')' });
          return;
        }
        if (months[currentMonth] === undefined) return;
        var hist = prior.map(function (m) { return months[m]; });
        var st = robustStats(hist);
        var cur = months[currentMonth];
        var z = modifiedZ(cur, st);
  
        /* A history with NO dispersion at all — the same figure every month —
           makes every scale zero and the z-score undefined. That is not "no
           signal": it is the strongest possible baseline. An account that spent
           exactly the same for a year and then nine times that is precisely what
           this rule is for, and the first version of it returned silence there.
           So the departure is expressed as a direct ratio instead, and only a
           large one counts — with no variance there is no noise floor to
           calibrate against. `basis` reports which comparison was used. */
        var reason = null, detail = null;
        if (z !== null && Math.abs(z) > zCut) {
          reason = 'مصروف حساب ' + acct + ' في شهر ' + currentMonth + ' بلغ ' + fmt2_(cur) +
            ' مقابل وسيط ' + fmt2_(st.median) + ' عبر ' + arCount(prior.length, 'month') + ' سابقة (المدى ' +
            fmt2_(st.min) + '–' + fmt2_(st.max) + ') — درجة انحراف ' + z +
            (z > 0 ? ' بالزيادة' : ' بالنقصان');
          detail = { month: currentMonth, value: round_(cur, 2), median: st.median,
                     n_months: prior.length, modified_z: z, basis: 'modified_z' };
        } else if (z === null && st.scale === 0 && st.median > 0 &&
                   Math.abs(cur - st.median) / st.median >= (o.season_flat_ratio || 0.5)) {
          var mult = round_(cur / st.median, 2);
          reason = 'مصروف حساب ' + acct + ' في شهر ' + currentMonth + ' بلغ ' + fmt2_(cur) +
            ' بينما كان ثابتاً عند ' + fmt2_(st.median) + ' في كل شهر من الـ' + prior.length +
            ' شهراً السابقة دون أي تغيّر — أي ' + mult + ' ضعف' +
            (cur > st.median ? ' بالزيادة' : ' بالنقصان') +
            '. لا يوجد تشتت تاريخي تُحسب عليه درجة انحراف، فالمقارنة هنا نسبة مباشرة';
          detail = { month: currentMonth, value: round_(cur, 2), median: st.median,
                     n_months: prior.length, ratio: mult, basis: 'flat_history_ratio' };
        }
        if (!reason) return;
  
        var f = flag_('SEASONALITY', 'low', null, reason, []);
        f.entity = acct;
        f.entity_kind = 'الحساب';
        f.detail = detail;
        flags.push(f);
      });
      return { flags: flags, notes: notes };
    }
  
    /**
     * Run Tier 3. Findings are ENTITY-level: `row_id` is null, `entity` and
     * `entity_kind` say who or what the finding is about, and `evidence` carries
     * a sample of the contributing rows so a reader can start somewhere.
     *
     * opts.current_month ('YYYY-MM') enables SEASONALITY; without it that rule
     * reports not_run rather than guessing which month is current.
     */
    function runTier3(rows, opts) {
      var o = opts || {};
      var flags = [], notes = [];
      [ruleBenford(rows, o),
       ruleRoundNumberBias(rows, o),
       ruleVelocityBurst(rows, o),
       ruleAccountMixDrift(rows, o),
       ruleSeasonality(rows, o)].forEach(function (r) {
        flags = flags.concat(r.flags);
        notes = notes.concat(r.notes || []);
      });
  
      var byEntity = {};
      flags.forEach(function (f) {
        var k = (f.entity_kind || '') + ':' + (f.entity || '');
        (byEntity[k] = byEntity[k] || []).push(f);
      });
      return { flags: flags, by_entity: byEntity, notes: notes };
    }
  
  
    // ═══════════════════════════════════════════════════════════════════════
    // §7 Scoring — risk ranking
    // ═══════════════════════════════════════════════════════════════════════
    //
    // A row's risk is a SATURATING combination of the severities that fired, not
    // a sum. Two reasons why:
    //
    //   - A sum is unbounded, so a row with nine low-severity notes outranks a
    //     row with one confirmed integrity failure. That is backwards, and it is
    //     what an unbounded score does every time.
    //   - Saturation matches how the finding is actually used. The second
    //     duplicate-detection flag on a row does not double the case for looking
    //     at it; the first one already earned the look.
    //
    // The combination is 1 − Π(1 − wᵢ), the probability that at least one of a
    // set of independent signals fires. The independence assumption is not
    // literally true — SUM_MISMATCH and NEAR_DUP correlate — so the number is a
    // RANKING, not a probability, and nothing here presents it as one.
    //
    // THE SCORE IS NEVER SHOWN ALONE. riskScore returns the flags that produced
    // it, and the page renders them. A bare number with nothing behind it does
    // not survive an accountant asking "why", which is the only conversation
    // this output exists to have.
  
    var RISK = {
      WEIGHT: { high: 0.70, medium: 0.35, low: 0.12 },
      /* Bucket cuts on the 0–100 scale. 'high' is reachable by ONE high-severity
         flag (70) so a single confirmed integrity failure ranks as high on its
         own — it should not need corroboration from two weak notes. */
      BUCKET_HIGH: 70,
      BUCKET_MEDIUM: 35
    };
  
    var RISK_LEVEL_AR = { high: 'مرتفع', medium: 'متوسط', low: 'منخفض', none: 'لا يوجد' };
  
    /**
     * Combine a row's flags into a ranking score.
     * Returns { score 0–100, level, level_ar, counts, flags } — always with the
     * flags, so the caller cannot render the number without its reasons.
     */
    function riskScore(flags) {
      var list = (flags || []).filter(function (f) { return f && f.severity; });
      if (!list.length) {
        return { score: 0, level: 'none', level_ar: RISK_LEVEL_AR.none,
                 counts: { high: 0, medium: 0, low: 0 }, flags: [] };
      }
      var counts = { high: 0, medium: 0, low: 0 };
      var product = 1;
      list.forEach(function (f) {
        var w = RISK.WEIGHT[f.severity];
        if (w === undefined) return;
        counts[f.severity]++;
        product *= (1 - w);
      });
      var score = Math.round((1 - product) * 100);
      var level = score >= RISK.BUCKET_HIGH ? 'high'
        : score >= RISK.BUCKET_MEDIUM ? 'medium'
        : score > 0 ? 'low' : 'none';
  
      /* Most severe first, so the reason a reader sees first is the reason the
         row is ranked where it is. */
      var order = { high: 0, medium: 1, low: 2 };
      var sorted = list.slice().sort(function (a, b) {
        return (order[a.severity] - order[b.severity]) ||
               (a.rule_id < b.rule_id ? -1 : a.rule_id > b.rule_id ? 1 : 0);
      });
  
      return {
        score: score,
        level: level,
        level_ar: RISK_LEVEL_AR[level],
        counts: counts,
        flags: sorted
      };
    }
  
    /**
     * Rank rows by risk. Rows with no flags are returned too, at score 0 — the
     * alerts tab filters them out, but the caller needs every row scored so the
     * movements tab can badge them without a second pass.
     */
    function rankRows(rows, byRow) {
      var out = (rows || []).map(function (r) {
        var risk = riskScore((byRow || {})[String(r.id)] || []);
        return { row: r, risk: risk };
      });
      out.sort(function (a, b) {
        if (b.risk.score !== a.risk.score) return b.risk.score - a.risk.score;
        /* Stable, and newest-first within a score, which is the order a reviewer
           works in. */
        var da = String(a.row.transaction_date || ''), db = String(b.row.transaction_date || '');
        if (da !== db) return da < db ? 1 : -1;
        return String(b.row.id).localeCompare(String(a.row.id));
      });
      return out;
    }
  
    // ═══════════════════════════════════════════════════════════════════════
    // Public surface
    // ═══════════════════════════════════════════════════════════════════════
  
    return {
      normAr: normAr,
      takePrice: takePrice,
      takeQuantity: takeQuantity,
      takeUnit: takeUnit,
      takeTrailingFraction: takeTrailingFraction,
      itemKey: itemKey,
      scoreParse: scoreParse,
      parseDetails: parseDetails,
  
      /* §5 — the matcher */
      stemAr: stemAr,
      stemTokens: stemTokens,
      stemKey: stemKey,
      tokenSetDice: tokenSetDice,
      levenshtein: levenshtein,
      normLevenshtein: normLevenshtein,
      trigramBag: trigramBag,
      idfTrigramCosine: idfTrigramCosine,
      unitCompatible: unitCompatible,
      buildMatchIndex: buildMatchIndex,
      matchScore: matchScore,
      matchCandidates: matchCandidates,
      clusterItems: clusterItems,
      MATCH: MATCH,
  
      /* §8.5 — the edit path */
      EDITABLE_COLUMNS: EDITABLE_COLUMNS,
      LOCKED_COLUMNS: LOCKED_COLUMNS,
      isEditableColumn: isEditableColumn,
      validateColumn: validateColumn,
      validateChanges: validateChanges,
      inItemRange: inItemRange,
      crossesItemBoundary: crossesItemBoundary,
      diffChanges: diffChanges,
  
      /* date/time arithmetic */
      dayNumber: dayNumber,
      daysBetween: daysBetween,
      dayOfWeek: dayOfWeek,
      parseDateTime: parseDateTime,
      percentile: percentile,
      median: median,
  
      arCount: arCount,
  
      /* §7 Tier 1 — deterministic integrity */
      TIER1: TIER1,
      SEVERITY_AR: SEVERITY_AR,
      ruleSumMismatch: ruleSumMismatch,
      ruleDuplicates: ruleDuplicates,
      ruleBackdated: ruleBackdated,
      ruleOddHour: ruleOddHour,
      ruleEditedAfterReview: ruleEditedAfterReview,
      ruleOutOfSequence: ruleOutOfSequence,
      detectStructuringThresholds: detectStructuringThresholds,
      ruleStructuring: ruleStructuring,
      runTier1: runTier1,
  
      /* §7 Tier 2 — price anomalies, median/MAD */
      TIER2: TIER2,
      mad: mad,
      robustStats: robustStats,
      modifiedZ: modifiedZ,
      mannKendallTau: mannKendallTau,
      clusterPriceStats: clusterPriceStats,
      rulePriceOutlier: rulePriceOutlier,
      rulePeerGap: rulePeerGap,
      rulePriceRatchet: rulePriceRatchet,
      ruleNewItemHighValue: ruleNewItemHighValue,
      ruleQuantityAnomaly: ruleQuantityAnomaly,
      runTier2: runTier2,
  
      /* §7 Tier 3 — distributional / behavioural, per entity */
      TIER3: TIER3,
      benfordFirstDigit: benfordFirstDigit,
      benfordSecondDigit: benfordSecondDigit,
      poissonTail: poissonTail,
      populationStabilityIndex: populationStabilityIndex,
      ruleBenford: ruleBenford,
      ruleRoundNumberBias: ruleRoundNumberBias,
      ruleVelocityBurst: ruleVelocityBurst,
      ruleAccountMixDrift: ruleAccountMixDrift,
      ruleSeasonality: ruleSeasonality,
      runTier3: runTier3,
  
      /* §7 — risk ranking */
      RISK: RISK,
      RISK_LEVEL_AR: RISK_LEVEL_AR,
      riskScore: riskScore,
      rankRows: rankRows,
  
      /* §6 — period windows */
      daysInMonth: daysInMonth,
      parseIsoDate: parseIsoDate,
      monthsBefore: monthsBefore,
      accountWindows: accountWindows,
      /* Exposed for the verify harness and for the alias/override UI, which needs
         to show a reviewer which tokens the engine recognises as units. */
      _QUANTITY_WORDS: QUANTITY_WORDS,
      _UNIT_WORDS: UNIT_WORDS,
      _round: round_
    };
  })();
  
  
  var DB_CLIENTS_AR_COLUMNS = [
    'client_balance_sheet_id', 'client_id', 'name_ar', 'balance_amount',
    'notes', 'payment_date', 'created_at', 'is_revised'
  ];
  
  function dbClientsArValidateDate_(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Invalid date format (expected YYYY-MM-DD): ' + s);
    return s;
  }
  
  function dbClientsArWhere_(data) {
    // Returns { sql, params } — shared by COUNT and SELECT so both agree.
    var conditions = [];
    var params = [];
    var from = dbClientsArValidateDate_(data.payment_from);
    var to = dbClientsArValidateDate_(data.payment_to);
    if (from) { conditions.push('`payment_date` >= ?'); params.push(from); }
    if (to) { conditions.push('`payment_date` <= ?'); params.push(to); }
    var rev = String(data.is_revised === undefined || data.is_revised === null ? '' : data.is_revised).trim();
    if (rev === '0' || rev === '1') { conditions.push('`is_revised` = ?'); params.push(Number(rev)); }
    else if (rev !== '') { throw new Error('Invalid is_revised filter (expected 0, 1, or empty)'); }
    var sql = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    return { sql: sql, params: params };
  }
  
  /**
   * Paginated list from the clients_AR view.
   * data: { payment_from, payment_to, is_revised ('0'/'1'/''), limit, offset }
   * Returns { status:'ok', columns, rows, total, limit, offset }.
   * NULL payment_date rows never match a set date bound (standard SQL).
   */
  function dbClientsArList_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbClientsArList_')) {
      return mysqlRead_(mysqlTcDefinition_('dbClientsArList_'), data, function (p) { return dbClientsArList_(p, user); });
    }
    
    
    
    data = data || {};
    var limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
    var offset = Math.max(Number(data.offset) || 0, 0);
    var where = dbClientsArWhere_(data);
    var cols = DB_CLIENTS_AR_COLUMNS.map(dbSanitizeIdentifier_).join(', ');
    var isVendor = String(data.source || data.view || '').trim() === 'vendors_AP';
    var conn, countStmt, countRs, stmt, rs;
    try {
      conn = dbGetConnection_();
      countStmt = conn.prepareStatement(isVendor
        ? 'SELECT COUNT(*) AS cnt FROM `vendors_AP`' + where.sql
        : 'SELECT COUNT(*) AS cnt FROM `clients_AR`' + where.sql);
      dbBindParams_(countStmt, where.params);
      countRs = countStmt.executeQuery();
      var total = countRs.next() ? countRs.getInt('cnt') : 0;
      stmt = conn.prepareStatement(isVendor
        ? 'SELECT ' + cols + ' FROM `vendors_AP`' + where.sql +
          ' ORDER BY `payment_date` DESC, `client_balance_sheet_id` DESC' +
          ' LIMIT ' + limit + ' OFFSET ' + offset
        : 'SELECT ' + cols + ' FROM `clients_AR`' + where.sql +
          ' ORDER BY `payment_date` DESC, `client_balance_sheet_id` DESC' +
          ' LIMIT ' + limit + ' OFFSET ' + offset);
      dbBindParams_(stmt, where.params);
      rs = stmt.executeQuery();
      var rows = [];
      while (rs.next()) {
        rows.push({
          client_balance_sheet_id: rs.getObject(1) !== null ? String(rs.getObject(1)) : null,
          client_id: rs.getObject(2) !== null ? String(rs.getObject(2)) : null,
          name_ar: rs.getObject(3) !== null ? String(rs.getObject(3)) : null,
          balance_amount: rs.getObject(4) !== null ? String(rs.getObject(4)) : null,
          notes: rs.getObject(5) !== null ? String(rs.getObject(5)) : null,
          payment_date: rs.getObject(6) !== null ? String(rs.getObject(6)).slice(0, 10) : null,
          created_at: rs.getObject(7) !== null ? String(rs.getObject(7)) : null,
          is_revised: rs.getObject(8) !== null ? String(rs.getObject(8)) : '0'
        });
      }
      return { status: 'ok', columns: DB_CLIENTS_AR_COLUMNS.slice(), rows: rows, total: total, limit: limit, offset: offset, source: isVendor ? 'vendors_AP' : 'clients_AR' };
    } catch (err) {
      Logger.log('dbClientsArList_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Flip one row 0 -> 1. data: { client_balance_sheet_id, source }.
   * NOTE: if clients_AR / vendors_AP is a non-updatable view (joins/aggregates) MySQL
   * raises 1288/1353 — then retarget this UPDATE to the base table holding
   * is_revised (find via SHOW CREATE VIEW clients_AR); SELECT stays on view.
   */
  function dbClientsArRevise_(data, user) {
    data = data || {};
    var id = String(data.client_balance_sheet_id === undefined || data.client_balance_sheet_id === null ? '' : data.client_balance_sheet_id).trim();
    if (!id) throw new Error('client_balance_sheet_id is required');
    var isVendor = String(data.source || data.view || '').trim() === 'vendors_AP';
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(isVendor
        ? 'UPDATE `vendors_AP` SET `is_revised` = 1 WHERE `client_balance_sheet_id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)'
        : 'UPDATE `clients_AR` SET `is_revised` = 1 WHERE `client_balance_sheet_id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)');
      stmt.setObject(1, id);
      var affected = stmt.executeUpdate();
      if (affected === 0) throw new Error('البند غير موجود أو تمت مراجعته مسبقاً');
      return { status: 'ok', affected: affected, client_balance_sheet_id: id, is_revised: 1, source: isVendor ? 'vendors_AP' : 'clients_AR' };
    } catch (err) {
      Logger.log('dbClientsArRevise_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  // ─── client_balance_sheets (Top Chemical: tc_client_balance_sheets) ──
  //
  // Schema (16 columns): id (PK), client_id, admin_id, debit_currency_id,
  // credit_currency_id, invoice_id, debit_amount, credit_amount, balance_amount,
  // notes, payment_type, payment_date, created_at, updated_at, deleted_at, is_revised.
  // Soft-deleted rows (deleted_at IS NOT NULL) are excluded from reads.
  
  /**
   * Paginated or full list from the client_balance_sheets table.
   * Default: last 20 rows (ORDER BY id DESC). Pass loadAll:true for up to 1000.
   * Soft-deleted rows are excluded (WHERE deleted_at IS NULL).
   */
  function dbClientBalanceSheetsList_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbClientBalanceSheetsList_')) {
      return mysqlRead_(mysqlTcDefinition_('dbClientBalanceSheetsList_'), data, function (p) { return dbClientBalanceSheetsList_(p, user); });
    }
    
    
    
    data = data || {};
    var loadAll = !!(data.loadAll === true || data.loadAll === 'true' || data.loadAll === '1' || data.loadAll === 1);
    var limit = loadAll ? 1000 : Math.min(Math.max(Number(data.limit) || 20, 1), 1000);
    var offset = Math.max(Number(data.offset) || 0, 0);
  
    var conn, countStmt, countRs, stmt, rs;
    try {
      conn = dbGetConnection_();
      countStmt = conn.prepareStatement(
        'SELECT COUNT(*) AS cnt FROM `client_balance_sheets` WHERE `deleted_at` IS NULL'
      );
      countRs = countStmt.executeQuery();
      var total = countRs.next() ? countRs.getInt('cnt') : 0;
  
      stmt = conn.prepareStatement(
        'SELECT * FROM `client_balance_sheets` WHERE `deleted_at` IS NULL' +
        ' ORDER BY `id` DESC LIMIT ' + limit + ' OFFSET ' + offset
      );
      rs = stmt.executeQuery();
  
      var md = rs.getMetaData();
      var colCount = md.getColumnCount();
      var columns = [];
      for (var c = 1; c <= colCount; c++) {
        columns.push(md.getColumnLabel(c) || md.getColumnName(c));
      }
  
      var rows = [];
      while (rs.next()) {
        var row = {};
        for (var i = 1; i <= colCount; i++) {
          var colName = columns[i - 1];
          var val = rs.getObject(i);
          row[colName] = val !== null ? String(val) : null;
        }
        rows.push(row);
      }
  
      return {
        status: 'ok',
        columns: columns,
        rows: rows,
        total: total,
        limit: limit,
        offset: offset,
        loadedAll: loadAll
      };
    } catch (err) {
      Logger.log('dbClientBalanceSheetsList_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (countRs) countRs.close();
      if (countStmt) countStmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Update a single row in client_balance_sheets by the real PK `id`.
   * Read-only / server-managed columns are stripped before building the SET clause.
   */
  function dbClientBalanceSheetsUpdate_(data, user) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required');
  
    // Columns the client must not overwrite — PK and server-managed audit timestamps.
    // deleted_at IS editable: it controls soft-delete and the admin may need to restore rows.
    var readOnlyCols = {
      'id':         true,
      'created_at': true,
      'updated_at': true
    };
  
    var updates = [];
    var params = [];
  
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      if (readOnlyCols[key]) continue;
      // Skip internal/private keys (prefixed _)
      if (key.charAt(0) === '_') continue;
      var safeCol = dbSanitizeIdentifier_(key);
      var rawVal = data[key];
      updates.push(safeCol + ' = ?');
      params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
    }
  
    if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');
  
    params.push(id);
  
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      var sql = 'UPDATE `client_balance_sheets` SET ' + updates.join(', ') + ' WHERE `id` = ?';
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, params);
      var affected = stmt.executeUpdate();
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbClientBalanceSheetsUpdate_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  // ─── manufacture_headers / manufacture_footers (Top Chemical: tc_manufacture_orders) ──
  //
  // manufacture_headers (17 cols): id, user_id, user_type, name_ar,
  //   expected_quantity, deliver_quantity, is_product, product_id, status,
  //   manufacture_number, manufacture_delivery_number, admin_approved,
  //   admin_approved_at, created_at, updated_at, deleted_at, is_revised.
  // manufacture_footers (9 cols): id, manufacture_header_id, product_id,
  //   product_code, productUnit, productQuantity, created_at, updated_at, warehouse_id.

  var DB_MANUFACTURE_HEADER_COLUMNS = [
    'id', 'user_id', 'user_type', 'name_ar', 'expected_quantity',
    'deliver_quantity', 'is_product', 'product_id', 'status',
    'manufacture_number', 'manufacture_delivery_number', 'admin_approved',
    'admin_approved_at', 'created_at', 'updated_at', 'deleted_at', 'is_revised'
  ];
  var DB_MANUFACTURE_FOOTER_COLUMNS = [
    'id', 'manufacture_header_id', 'product_id', 'product_code',
    'productUnit', 'productQuantity', 'created_at', 'updated_at', 'warehouse_id'
  ];
  var DB_MANUFACTURE_FOOTER_JOIN_COLUMNS = [
    'product_name_ar', 'product_code_ref', 'product_unit_ref'
  ];

  /* JSON_ARRAYAGG does not guarantee element order. Carry a row number inside
     the JSON payload, validate the complete aggregate, then restore the same
     order that the old JDBC loop returned. */
  function dbManufactureParseRankedJson_(raw, expectedRows, maxRows, label) {
    var started = Date.now();
    var parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed) || parsed.length !== expectedRows || parsed.length > maxRows) {
      throw new Error((label || 'Manufacture') + ' MySQL aggregate is invalid');
    }
    parsed.sort(function (a, b) { return Number(a && a._row_num) - Number(b && b._row_num); });
    for (var i = 0; i < parsed.length; i++) {
      if (!parsed[i] || typeof parsed[i] !== 'object' || Array.isArray(parsed[i]) || Number(parsed[i]._row_num) !== i + 1) {
        throw new Error((label || 'Manufacture') + ' MySQL aggregate order is invalid');
      }
      delete parsed[i]._row_num;
    }
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
      _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - started;
    }
    return parsed;
  }

  function dbManufactureJsonField_(alias, column) {
    var ident = dbSanitizeIdentifier_(alias) + '.' + dbSanitizeIdentifier_(column);
    return 'CASE WHEN ' + ident + ' IS NULL THEN NULL ELSE CAST(' + ident + ' AS CHAR) END';
  }

  function dbManufactureJsonArgs_(alias, columns) {
    var args = ["'_row_num', " + dbSanitizeIdentifier_(alias) + '._row_num'];
    columns.forEach(function (column) {
      args.push("'" + column.replace(/'/g, "''") + "'");
      args.push(dbManufactureJsonField_(alias, column));
    });
    return args;
  }

  function dbManufactureReadJsonRows_(raw, expectedRows, maxRows, columns, label) {
    return dbManufactureParseRankedJson_(raw, expectedRows, maxRows, label).map(function (item) {
      var row = {};
      columns.forEach(function (column) {
        row[column] = item[column] == null ? null : String(item[column]);
      });
      return row;
    });
  }
  
  /**
   * Paginated / full list of manufacture_headers.
   * Soft-deleted rows (deleted_at IS NOT NULL) are excluded.
   */
  function dbManufactureList_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbManufactureList_')) {
      return mysqlRead_(mysqlTcDefinition_('dbManufactureList_'), data, function (p) { return dbManufactureList_(p, user); });
    }
    
    
    
    data = data || {};
    var loadAll = !!(data.loadAll === true || data.loadAll === 'true' || data.loadAll === '1' || data.loadAll === 1);
    var limit  = loadAll ? 1000 : Math.min(Math.max(Math.floor(Number(data.limit) || 20), 1), 1000);
    var offset = Math.max(Math.floor(Number(data.offset) || 0), 0);
    var headerArgs = dbManufactureJsonArgs_('ranked', DB_MANUFACTURE_HEADER_COLUMNS.concat(['product_label']));
    var headerSelect = DB_MANUFACTURE_HEADER_COLUMNS.map(function (column) {
      return '`h`.`' + column.replace(/`/g, '``') + '`';
    }).join(', ') + ', `p`.`name_ar` AS `product_label`';
    var aggregateSql =
      'SELECT (SELECT COUNT(*) FROM `manufacture_headers` `hc` WHERE `hc`.`deleted_at` IS NULL) AS `total_count`,' +
      ' COUNT(*) AS `row_count`,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + headerArgs.join(',') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`id` DESC) AS `_row_num`' +
        ' FROM (' +
          ' SELECT ' + headerSelect +
          ' FROM `manufacture_headers` `h`' +
          ' LEFT JOIN `products` `p` ON `p`.`id` = `h`.`product_id`' +
          ' WHERE `h`.`deleted_at` IS NULL' +
          ' ORDER BY `h`.`id` DESC LIMIT ' + limit + ' OFFSET ' + offset +
        ' ) AS `page`' +
      ' ) AS `ranked`';
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(aggregateSql);
      rs = stmt.executeQuery();
      var total = 0, rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        total = Number(rs.getString('total_count') || 0);
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var columns = DB_MANUFACTURE_HEADER_COLUMNS.concat(['product_label']);
      var rows = dbManufactureReadJsonRows_(rowsJson, rowCount, limit, columns, 'Manufacture headers');
      return { status: 'ok', columns: columns, rows: rows, total: total, limit: limit, offset: offset, loadedAll: loadAll };
    } catch (err) {
      Logger.log('dbManufactureList_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Return all footers for one header. data: { manufacture_header_id }.
   */
  function dbManufactureGetFooters_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbManufactureGetFooters_')) {
      return mysqlRead_(mysqlTcDefinition_('dbManufactureGetFooters_'), data, function (p) { return dbManufactureGetFooters_(p, user); });
    }
    
    
    
    data = data || {};
    var hid = String(data.manufacture_header_id !== null && data.manufacture_header_id !== undefined ? data.manufacture_header_id : '').trim();
    if (!hid) throw new Error('manufacture_header_id is required');
    var footerColumns = DB_MANUFACTURE_FOOTER_COLUMNS.concat(DB_MANUFACTURE_FOOTER_JOIN_COLUMNS);
    var footerArgs = dbManufactureJsonArgs_('ranked', footerColumns);
    var footerSelect = DB_MANUFACTURE_FOOTER_COLUMNS.map(function (column) {
      return '`f`.`' + column.replace(/`/g, '``') + '`';
    }).join(', ') +
      ', `p`.`name_ar` AS `product_name_ar`,' +
      ' `p`.`code` AS `product_code_ref`,' +
      ' `p`.`unit` AS `product_unit_ref`';
    var aggregateSql =
      'SELECT COUNT(*) AS `row_count`,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + footerArgs.join(',') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`id` ASC) AS `_row_num`' +
        ' FROM (' +
          ' SELECT ' + footerSelect +
          ' FROM `manufacture_footers` `f`' +
          ' LEFT JOIN `products` `p` ON `p`.`id` = `f`.`product_id`' +
          ' WHERE `f`.`manufacture_header_id` = ?' +
          ' ORDER BY `f`.`id` ASC' +
        ' ) AS `page`' +
      ' ) AS `ranked`';
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(aggregateSql);
      stmt.setObject(1, hid);
      rs = stmt.executeQuery();
      var rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var rows = dbManufactureReadJsonRows_(rowsJson, rowCount, rowCount, footerColumns, 'Manufacture footers');
      return { status: 'ok', columns: footerColumns, rows: rows, manufacture_header_id: hid };
    } catch (err) {
      Logger.log('dbManufactureGetFooters_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * UPDATE one manufacture_headers row by id.
   * read-only: id, created_at, updated_at.
   */
  function dbManufactureUpdateHeader_(data, user) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required');
    var RO = { 'id': true, 'created_at': true, 'updated_at': true };
    var updates = [], params = [];
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      if (RO[key]) continue;
      if (key.charAt(0) === '_') continue;
      var safeCol = dbSanitizeIdentifier_(key);
      var rawVal = data[key];
      updates.push(safeCol + ' = ?');
      params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
    }
    if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');
    params.push(id);
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement('UPDATE `manufacture_headers` SET ' + updates.join(', ') + ' WHERE `id` = ?');
      dbBindParams_(stmt, params);
      var affected = stmt.executeUpdate();
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbManufactureUpdateHeader_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Look up a product's code + unit from the products master.
   * Returns { code, unit } (nullable strings) or null when not found.
   * Caller must close the connection it opens — this helper takes an OPEN
   * connection so updates/inserts stay on one connection.
   */
  function dbProductCodeUnit_(conn, productId) {
    var stmt = null, rs = null;
    try {
      stmt = conn.prepareStatement(
        'SELECT `code`, `unit` FROM `products` WHERE `id` = ? LIMIT 1'
      );
      stmt.setObject(1, productId);
      rs = stmt.executeQuery();
      if (rs.next()) {
        var c = rs.getObject(1), u = rs.getObject(2);
        return {
          code: c !== null ? String(c) : null,
          unit: u !== null ? String(u) : null
        };
      }
      return null;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
    }
  }
  
  /**
   * UPDATE one manufacture_footers row by id.
   * read-only: id, manufacture_header_id, created_at, updated_at.
   */
  function dbManufactureUpdateFooter_(data, user) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required');
    var RO = { 'id': true, 'manufacture_header_id': true, 'created_at': true, 'updated_at': true };
    var updates = [], params = [];
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      if (RO[key]) continue;
      if (key.charAt(0) === '_') continue;
      // product_code / productUnit are withdrawn automatically from products —
      // ignore client-sent values when product_id is being changed; the lookup
      // below overwrites them authoritatively.
      if ((key === 'product_code' || key === 'productUnit') && data.product_id) continue;
      var safeCol = dbSanitizeIdentifier_(key);
      var rawVal = data[key];
      updates.push(safeCol + ' = ?');
      params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
    }
    if (updates.length === 0 && !data.product_id) throw new Error('لا توجد حقول للتحديث');
    params.push(id);
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      // Authoritative auto-fill: changing product_id re-withdraws code/unit.
      var newPid = data.product_id !== null && data.product_id !== undefined
        ? String(data.product_id).trim() : '';
      if (newPid) {
        var ref = dbProductCodeUnit_(conn, newPid);
        if (ref) {
          updates.push('`product_code` = ?');
          params.splice(params.length - 1, 0, ref.code);
          updates.push('`productUnit` = ?');
          params.splice(params.length - 1, 0, ref.unit);
        }
      }
      if (updates.length === 0) throw new Error('لا توجد حقول للتحديث');
      stmt = conn.prepareStatement('UPDATE `manufacture_footers` SET ' + updates.join(', ') + ' WHERE `id` = ?');
      dbBindParams_(stmt, params);
      var affected = stmt.executeUpdate();
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbManufactureUpdateFooter_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * INSERT a new manufacture_footers row (used for the copy-row feature).
   * data: { manufacture_header_id, product_id, product_code, productUnit,
   *         productQuantity, warehouse_id }
   * Returns { status:'ok', id: newId, manufacture_header_id }
   */
  function dbManufactureInsertFooter_(data, user) {
    data = data || {};
    var hid = String(data.manufacture_header_id !== null && data.manufacture_header_id !== undefined ? data.manufacture_header_id : '').trim();
    if (!hid) throw new Error('manufacture_header_id is required');
  
    var ALLOWED = ['manufacture_header_id', 'product_id', 'product_code', 'productUnit', 'productQuantity', 'warehouse_id'];
    var insertCols = [], params = [];
    ALLOWED.forEach(function (col) {
      if (Object.prototype.hasOwnProperty.call(data, col)) {
        insertCols.push(dbSanitizeIdentifier_(col));
        var rawVal = data[col];
        params.push(rawVal === null || rawVal === undefined || rawVal === '' ? null : rawVal);
      }
    });
    if (!insertCols.length) throw new Error('لا توجد بيانات للإدراج');
  
    var conn, stmt, idStmt, idRs;
    try {
      conn = dbGetConnection_();
      // Auto-withdraw code/unit from products when only product_id is supplied,
      // and default warehouse_id to 1. created_at/updated_at are left to the
      // DB CURRENT_TIMESTAMP defaults.
      var pidForLookup = data.product_id !== null && data.product_id !== undefined
        ? String(data.product_id).trim() : '';
      if (pidForLookup) {
        var ref = dbProductCodeUnit_(conn, pidForLookup);
        if (ref) {
          if (insertCols.indexOf('`product_code`') === -1) {
            insertCols.push('`product_code`');
            params.push(ref.code);
          }
          if (insertCols.indexOf('`productUnit`') === -1) {
            insertCols.push('`productUnit`');
            params.push(ref.unit);
          }
        }
      }
      if (insertCols.indexOf('`warehouse_id`') === -1) {
        insertCols.push('`warehouse_id`');
        params.push('1');
      }
      var sql = 'INSERT INTO `manufacture_footers` (' + insertCols.join(', ') + ') VALUES (' +
                insertCols.map(function () { return '?'; }).join(', ') + ')';
      stmt = conn.prepareStatement(sql);
      dbBindParams_(stmt, params);
      stmt.executeUpdate();
      idStmt = conn.prepareStatement('SELECT LAST_INSERT_ID() AS new_id');
      idRs   = idStmt.executeQuery();
      var newId = idRs.next() ? String(idRs.getLong('new_id')) : null;
      return { status: 'ok', id: newId, manufacture_header_id: hid };
    } catch (err) {
      Logger.log('dbManufactureInsertFooter_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (idRs)   idRs.close();
      if (idStmt) idStmt.close();
      if (stmt)   stmt.close();
      if (conn)   conn.close();
    }
  }
  
  /**
   * Label lists for the manufacture-orders forms: product options, warehouse
   * options, and the DISTINCT status values actually present in
   * manufacture_headers. Every candidate query is attempted defensively — the
   * products/warehouses table and column names are NOT guaranteed, so a miss
   * yields an empty list (the page falls back to free-text inputs) instead of
   * an error. Only the status list (known table + column) is required.
   * Returns { status:'ok', products:[{value,label}], warehouses:[...], statuses:[...] }.
   */
  function dbManufactureRefs_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbManufactureRefs_')) {
      return mysqlRead_(mysqlTcDefinition_('dbManufactureRefs_'), data, function (p) { return dbManufactureRefs_(p, user); });
    }
    
    
    
    var products = [], productsFull = [], warehouses = [], statuses = [];
    var conn;
    try {
      conn = dbGetConnection_();
      products = tryLabelList_(conn, [
        'SELECT `id`, `name_ar` AS `label` FROM `products` ORDER BY `id` ASC LIMIT 500',
        'SELECT `id`, `name` AS `label` FROM `products` ORDER BY `id` ASC LIMIT 500'
      ]);
      // Full option rows so the page can auto-fill code/unit on product change
      // and show the Arabic name next to raw product_id values.
      productsFull = tryFullList_(conn, [
        'SELECT `id`, `name_ar`, `code`, `unit` FROM `products` ORDER BY `id` ASC LIMIT 500'
      ]);
      warehouses = tryLabelList_(conn, [
        'SELECT `id`, `name_ar` AS `label` FROM `warehouses` ORDER BY `id` ASC LIMIT 500',
        'SELECT `id`, `name` AS `label` FROM `warehouses` ORDER BY `id` ASC LIMIT 500'
      ]);
      statuses = tryLabelList_(conn, [
        'SELECT DISTINCT `status` AS `label` FROM `manufacture_headers` WHERE `status` IS NOT NULL ORDER BY `status` ASC'
      ]);
      statuses = statuses.map(function (s) { return { value: s.label, label: s.label }; });
    } catch (err) {
      Logger.log('dbManufactureRefs_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (conn) conn.close();
    }
    return { status: 'ok', products: products, products_full: productsFull, warehouses: warehouses, statuses: statuses };
  }
  
  /**
   * Like tryLabelList_ but returns full rows { value, name_ar, code, unit } for
   * the products master. Misses → [] (page falls back to the plain label list).
   */
  function tryFullList_(conn, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var stmt = null, rs = null;
      try {
        stmt = conn.prepareStatement(candidates[i]);
        rs = stmt.executeQuery();
        var out = [];
        while (rs.next()) {
          var v = rs.getObject(1), n = rs.getObject(2), c = rs.getObject(3), u = rs.getObject(4);
          out.push({
            value: v !== null ? String(v) : '',
            label: (n !== null ? String(n) : '') || (v !== null ? String(v) : ''),
            code: c !== null ? String(c) : '',
            unit: u !== null ? String(u) : ''
          });
        }
        return out;
      } catch (e) {
        /* candidate shape absent — try the next one */
      } finally {
        try { if (rs) rs.close(); } catch (e2) {}
        try { if (stmt) stmt.close(); } catch (e3) {}
      }
    }
    return [];
  }
  
  /**
   * Run each candidate SELECT in order; return rows of the first one that
   * executes ({value, label} stringified). All misses → []. One statement and
   * result set are open at a time and always closed, including on error paths.
   */
  function tryLabelList_(conn, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var stmt = null, rs = null;
      try {
        stmt = conn.prepareStatement(candidates[i]);
        rs = stmt.executeQuery();
        var md = rs.getMetaData();
        var colCount = md.getColumnCount();
        var out = [];
        while (rs.next()) {
          var v = rs.getObject(1), l = colCount > 1 ? rs.getObject(2) : rs.getObject(1);
          out.push({
            value: v !== null ? String(v) : '',
            label: (l !== null ? String(l) : '') || (v !== null ? String(v) : '')
          });
        }
        return out;
      } catch (e) {
        /* candidate table/columns absent — try the next shape */
      } finally {
        try { if (rs) rs.close(); } catch (e2) {}
        try { if (stmt) stmt.close(); } catch (e3) {}
      }
    }
    return [];
  }
  
  // ─── manufacture soft-delete ──
  //
  // manufacture_headers HAS deleted_at → soft delete stores NOW() timestamp.
  // manufacture_footers has NO deleted_at column (9 cols per schema) → footer
  // lines are deleted with a real DELETE. Both are page-level authorized (no
  // dbGuard_), exactly like the update/insert helpers above.
  
  /**
   * Soft-delete one manufacture_headers row: SET deleted_at = NOW().
   * data: { id }. Only touches rows not already deleted.
   */
  function dbManufactureSoftDeleteHeader_(data, user) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required');
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'UPDATE `manufacture_headers` SET `deleted_at` = NOW(), `updated_at` = NOW()' +
        ' WHERE `id` = ? AND `deleted_at` IS NULL'
      );
      stmt.setObject(1, id);
      var affected = stmt.executeUpdate();
      if (affected === 0) throw new Error('السجل غير موجود أو محذوف مسبقاً');
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbManufactureSoftDeleteHeader_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Delete one manufacture_footers row by id.
   * NOTE: footers table has no deleted_at column, so this is a hard DELETE.
   */
  function dbManufactureDeleteFooter_(data, user) {
    data = data || {};
    var id = String(data.id !== null && data.id !== undefined ? data.id : '').trim();
    if (!id) throw new Error('id is required');
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement('DELETE FROM `manufacture_footers` WHERE `id` = ?');
      stmt.setObject(1, id);
      var affected = stmt.executeUpdate();
      if (affected === 0) throw new Error('البند غير موجود');
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbManufactureDeleteFooter_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  // ─── client_balance_sheets soft-delete (Top Chemical: tc_client_balance_sheets) ──
  
  /**
   * Soft-delete one client_balance_sheets row: SET deleted_at = NOW().
   * data: { id }. Reads already exclude deleted_at IS NOT NULL rows.
   */
  function dbClientBalanceSheetsDelete_(data, user) {
    data = data || {};
    var id = String(data.id !== undefined && data.id !== null ? data.id : '').trim();
    if (!id) throw new Error('id is required');
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'UPDATE `client_balance_sheets` SET `deleted_at` = NOW(), `updated_at` = NOW()' +
        ' WHERE `id` = ? AND `deleted_at` IS NULL'
      );
      stmt.setObject(1, id);
      var affected = stmt.executeUpdate();
      if (affected === 0) throw new Error('السجل غير موجود أو محذوف مسبقاً');
      return { status: 'ok', affected: affected, id: id };
    } catch (err) {
      Logger.log('dbClientBalanceSheetsDelete_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Exact positive-ID lookup or bounded name search for tc_stock_scan.
   * Soft-deleted rows are excluded and the projection is limited to the three
   * fields needed by the scanner/count form.
   * Called via get_stock_scan_options, so page-level authority applies.
   */
  function dbStockScanProducts_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbStockScanProducts_')) {
      return mysqlRead_(mysqlTcDefinition_('dbStockScanProducts_'), data, function (p) { return dbStockScanProducts_(p, user); });
    }
    
    
    
    data = data || {};
    var mode = String(data.mode == null ? '' : data.mode).trim().toLowerCase();
    var id = data.id == null || data.id === '' ? '' : String(data.id).trim();
    var code = data.code == null || data.code === '' ? '' : String(data.code).trim().slice(0, 64);
    if (!mode) mode = id ? 'id' : (code ? 'code' : 'name');
    if (['id', 'code', 'name'].indexOf(mode) === -1) throw new Error('Invalid product search mode');
    if (mode === 'id' && !/^[1-9]\d{0,19}$/.test(id)) throw new Error('Invalid product ID');
    if (mode === 'code' && !code) throw new Error('Invalid product code');
    var search = String(data.search == null ? '' : data.search).trim().slice(0, 120);
    var limit = Math.min(Math.max(Math.floor(Number(data.limit) || 30), 1), 50);
    var offset = Math.min(Math.max(0, Math.floor(Number(data.offset) || 0)), 10000000);
    if (mode === 'id') { search = ''; code = ''; offset = 0; }
    if (mode === 'code') { search = ''; id = ''; offset = 0; }
    if (mode === 'name') { id = ''; code = ''; }
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      var sql = 'SELECT `id`, `name_ar`, `number_of_cartons_bags`, `code` FROM `products` WHERE `deleted_at` IS NULL';
      var bind = [];
      if (mode === 'id') { sql += ' AND `id` = ?'; bind.push(id); }
      else if (mode === 'code') { sql += ' AND `code` = ?'; bind.push(code); }
      else if (search) { sql += ' AND `name_ar` LIKE ?'; bind.push(search.replace(/[%_\\]/g, '\\$&') + '%'); }
      sql += ' ORDER BY `name_ar` ASC, `id` ASC';
      if (mode === 'name' || (mode === 'code')) sql += ' LIMIT ? OFFSET ?';
      stmt = conn.prepareStatement(sql);
      if (bind.length) dbBindParams_(stmt, bind);
      // Apps Script's setObject may send JavaScript numbers as floating point.
      // MySQL requires integer parameters for LIMIT/OFFSET.
      if (mode === 'name' || mode === 'code') {
        stmt.setInt(bind.length + 1, limit + 1);
        stmt.setInt(bind.length + 2, offset);
      }
      rs = stmt.executeQuery();
      var products = [];
      var exact = (mode === 'id');
      while (rs.next() && (exact || products.length < limit + 1)) {
        var productId = rs.getObject(1);
        products.push({
          id: productId !== null ? String(productId) : null,
          name_ar: String(rs.getObject(2) || '').trim(),
          number_of_cartons_bags: rs.getObject(3),
          code: rs.getObject(4) == null ? null : String(rs.getObject(4))
        });
      }
      return { status: 'ok', mode: mode, products: products.slice(0, exact ? 1 : limit), has_more: !exact && products.length > limit };
    } catch (err) {
      Logger.log('dbStockScanProducts_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  function dbStockScanWarehouses_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbStockScanWarehouses_')) {
      return mysqlRead_(mysqlTcDefinition_('dbStockScanWarehouses_'), data,
        function (p) { return dbStockScanWarehouses_(p, user); });
    }
    data = data || {};
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement('SELECT `id`, `location` FROM `warehouse_locations` ORDER BY `location` ASC, `id` ASC LIMIT 501');
      rs = stmt.executeQuery();
      var warehouses = [];
      while (rs.next() && warehouses.length < 501) {
        var wid = rs.getObject(1);
        warehouses.push({
          value: wid !== null ? String(wid) : null,
          label: String(rs.getObject(2) == null ? '' : rs.getObject(2)).trim()
        });
      }
      var truncated = warehouses.length > 500;
      return { status: 'ok', warehouses: warehouses.slice(0, 500), truncated: truncated };
    } catch (err) {
      Logger.log('dbStockScanWarehouses_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }

  function dbStockScanBalance_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbStockScanBalance_')) {
      return mysqlRead_(mysqlTcDefinition_('dbStockScanBalance_'), data,
        function (p) { return dbStockScanBalance_(p, user); });
    }
    data = data || {};
    var productId = String(data.product_id == null ? '' : data.product_id).trim();
    var warehouseId = String(data.warehouse_id == null ? '' : data.warehouse_id).trim();
    if (!/^[1-9]\d{0,19}$/.test(productId)) throw new Error('Invalid product ID');
    if (!/^[1-9]\d{0,19}$/.test(warehouseId)) throw new Error('Invalid warehouse ID');
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement('SELECT `id`, `warehouse_id`, `current_qty` FROM `product_current_qty_warehouses` WHERE `id` = ? AND `warehouse_id` = ? LIMIT 3');
      dbBindParams_(stmt, [productId, warehouseId]);
      rs = stmt.executeQuery();
      var rows = [];
      while (rs.next() && rows.length < 3) {
        rows.push({ id: rs.getObject(1), warehouse_id: rs.getObject(2), current_qty: rs.getObject(3) });
      }
      if (rows.length > 1) throw new Error('بيانات المخزون مكررة لهذا الصنف والمخزن — راجع مسؤول النظام');
      if (!rows.length) return { status: 'ok', state: 'missing', product_id: productId, warehouse_id: warehouseId, current_qty: null };
      var qty = rows[0].current_qty;
      if (qty === null || qty === undefined || String(qty).trim() === '') return { status: 'ok', state: 'missing', product_id: productId, warehouse_id: warehouseId, current_qty: null };
      var n = Number(qty);
      if (!Number.isFinite(n)) throw new Error('رصيد السيستم غير صالح');
      return { status: 'ok', state: 'ready', product_id: productId, warehouse_id: warehouseId, current_qty: n };
    } catch (err) {
      Logger.log('dbStockScanBalance_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /* Stock-scan instant catalog: the complete eligible products list for
   * local picker filtering. Same contract as dbCapabilityCatalog_ (2,000 raw
   * rows / 256 KiB, explicit overflow shape). Entries carry the fields the
   * count form needs (per-unit quantity, code) so selection needs no lookup. */
  function dbStockScanCatalog_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbStockScanCatalog_')) {
      return mysqlRead_(mysqlTcDefinition_('dbStockScanCatalog_'), data,
        function (p) { return dbStockScanCatalog_(p, user); });
    }
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
        "'id', CASE WHEN `p`.`id` IS NULL THEN NULL ELSE CAST(`p`.`id` AS CHAR) END," +
        "'name_ar', CASE WHEN `p`.`name_ar` IS NULL THEN '' ELSE CAST(`p`.`name_ar` AS CHAR) END," +
        "'code', CASE WHEN `p`.`code` IS NULL THEN NULL ELSE CAST(`p`.`code` AS CHAR) END," +
        "'per_unit', CASE WHEN `p`.`number_of_cartons_bags` IS NULL THEN '' ELSE CAST(`p`.`number_of_cartons_bags` AS CHAR) END" +
        ')), JSON_ARRAY()) AS `products_json` FROM (' +
        ' SELECT `id`, `name_ar`, `code`, `number_of_cartons_bags` FROM `products`' +
        ' WHERE `deleted_at` IS NULL ORDER BY `name_ar` ASC, `id` ASC LIMIT 2001' +
        ') `p`');
      rs = stmt.executeQuery();
      var raw = 0, productsJson = '[]';
      if (rs.next()) {
        raw = Number(rs.getString('row_count') || 0);
        productsJson = String(rs.getString('products_json') || '[]');
      }
      if (raw > DB_CAPABILITY_CATALOG_ROW_CAP_) return dbCapabilityCatalogOverflow_('row_limit');
      var parseStarted = Date.now();
      var parsed = JSON.parse(productsJson);
      if (!Array.isArray(parsed) || parsed.length !== raw) throw new Error('MySQL products catalog aggregate is invalid');
      var products = [], unsupported = false;
      for (var i = 0; i < parsed.length; i++) {
        var item = parsed[i];
        var scanIdStr = item && item.id != null ? String(item.id).trim() : '';
        if (!/^[1-9]\d{0,19}$/.test(scanIdStr)) { unsupported = true; continue; }
        products.push({ id: scanIdStr, name_ar: String(item.name_ar == null ? '' : item.name_ar).trim(),
          code: item.code == null ? null : String(item.code),
          per_unit: item.per_unit == null ? '' : String(item.per_unit) });
      }
      if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
        _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - parseStarted;
      }
      if (unsupported) return dbCapabilityCatalogOverflow_('unsupported_id');
      var scanPayload = JSON.stringify(products);
      if (tcUtf8Bytes_(scanPayload) > DB_CAPABILITY_CATALOG_BYTE_CAP_) return dbCapabilityCatalogOverflow_('byte_limit');
      return { status: 'ok', schema_version: 1, products: products, count: products.length,
        complete: true, overflow: false, reason: null, payload_bytes: tcUtf8Bytes_(scanPayload) };
    } catch (err) {
      Logger.log('dbStockScanCatalog_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      try { if (rs) rs.close(); } finally { try { if (stmt) stmt.close(); } finally { if (conn) conn.close(); } }
    }
  }
  
  /* All warehouse balances of one product in one bounded JSON read. The page
   * starts this only after the operator chooses a warehouse; returning the
   * compact array lets the selected pair be ready while count entry continues.
   * Absent warehouses stay missing (never zero); duplicate pairs are an
   * explicit integrity error, same as the single-pair read. */
  function dbStockScanBalances_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbStockScanBalances_')) {
      return mysqlRead_(mysqlTcDefinition_('dbStockScanBalances_'), data,
        function (p) { return dbStockScanBalances_(p, user); });
    }
    data = data || {};
    var allProductId = String(data.product_id == null ? '' : data.product_id).trim();
    if (!/^[1-9]\d{0,19}$/.test(allProductId)) throw new Error('Invalid product ID');
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'SELECT COUNT(*) AS `row_count`, COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' +
        "'warehouse_id', CASE WHEN `b`.`warehouse_id` IS NULL THEN NULL ELSE CAST(`b`.`warehouse_id` AS CHAR) END," +
        "'current_qty', CASE WHEN `b`.`current_qty` IS NULL THEN NULL ELSE CAST(`b`.`current_qty` AS CHAR) END" +
        ')), JSON_ARRAY()) AS `balances_json` FROM (' +
        ' SELECT `warehouse_id`, `current_qty` FROM `product_current_qty_warehouses` WHERE `id` = ? LIMIT 501' +
        ') `b`'
      );
      dbBindParams_(stmt, [allProductId]);
      rs = stmt.executeQuery();
      var rowCount = 0, balancesJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        balancesJson = String(rs.getString('balances_json') || '[]');
      }
      if (!Number.isFinite(rowCount) || rowCount > 500) throw new Error('عدد مخازن الصنف تجاوز الحد المسموح');
      var parseStarted = Date.now();
      var parsedBalances = JSON.parse(balancesJson);
      if (!Array.isArray(parsedBalances) || parsedBalances.length !== rowCount) {
        throw new Error('استجابة أرصدة الصنف غير صالحة');
      }
      if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
        _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - parseStarted;
      }
      var seen = {}, balances = [];
      parsedBalances.forEach(function (balance) {
        var balWid = balance && balance.warehouse_id;
        var balQty = balance && balance.current_qty;
        if (balWid == null) return;
        var balWidStr = String(balWid);
        if (seen[balWidStr]) throw new Error('بيانات المخزون مكررة لهذا الصنف والمخزن — راجع مسؤول النظام');
        seen[balWidStr] = true;
        if (balQty === null || balQty === undefined || String(balQty).trim() === '') return;
        var balN = Number(balQty);
        if (!Number.isFinite(balN)) throw new Error('رصيد السيستم غير صالح');
        balances.push({ warehouse_id: balWidStr, current_qty: balN });
      });
      balances.sort(function (a, b) { return a.warehouse_id < b.warehouse_id ? -1 : (a.warehouse_id > b.warehouse_id ? 1 : 0); });
      return { status: 'ok', product_id: allProductId, balances: balances };
    } catch (err) {
      Logger.log('dbStockScanBalances_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  function getStockScanCatalog_(data, user) {
    var res;
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbStockScanCatalog_')) {
      res = mysqlRead_(mysqlTcDefinition_('dbStockScanCatalog_'), data,
        function (p) { return dbStockScanCatalog_(p, user); });
    } else {
      res = dbStockScanCatalog_(data, user);
    }
    var catalog = withCatalogServedAt_(res);
    catalog.catalog_ttl_ms = 30000;
    return catalog;
  }
  
  function getStockScanBalances_(data, user) {
    return dbStockScanBalances_(data || {}, user);
  }
  
  // ─── regular_box_movement analysis (Top Chemical: tc_box_analysis) ──
  //
  // Read path for the box-analysis page. Same discipline as the clients_AR block
  // above: prepared statements, bound parameters, a shared WHERE builder so COUNT
  // and SELECT can never disagree, clamped limits, and one `finally` that closes
  // result set → statement → connection on every path including the error path.
  //
  // Called via TopChemical company actions (get_box_analysis / get_box_item_history
  // / update_box_movement / revise_box_movement) so page-level authority applies;
  // no dbGuard_ here, exactly as the clients_AR functions do it.
  //
  // NOTHING IN THIS FILE HAS EVER BEEN RUN. There is no MySQL client on the
  // machine this was written on and the credentials live only in Script
  // Properties. Every statement below was verified by reading it against the
  // schema in BOX_ANALYSIS_PLAN.md §2, not by executing it. The first execution
  // will be the owner's.
  
  var DB_BOX_TABLE = '`regular_box_movement`';
  
  var DB_BOX_COLUMNS = [
    'id', 'transaction_date', 'transaction_details', 'client_id', 'related_id',
    'transaction_type', 'transaction_amount', 'chart_of_accounts',
    'responsible_person', 'box_code', 'user_id', 'created_at', 'updated_at',
    'is_revised'
  ];
  
  /* The item engine runs only on accounts numerically inside [300000, 400000]
     (plan §2.1). `chart_of_accounts` is a `text` column holding a number, so the
     comparison has to cast.
  
     NOT SARGABLE, ON PURPOSE, FOR NOW: CAST(...) around the column defeats any
     index, and `text` cannot be indexed without a prefix index anyway. If the
     codes in this family turn out to be uniformly 6 digits, the plain string
     range `>= '300000' AND < '400000'` is exactly equivalent and CAN use a prefix
     index — but that is a measurement nobody has been able to take yet, not an
     assumption to build on. It is registered in NEXT_STEPS_OWNER.md.
  
     The REGEXP guard is not decoration: MySQL's CAST of a non-numeric string
     yields 0 with a warning rather than an error, so without it every row whose
     account code is blank or non-numeric would silently fall outside the range —
     which is the right answer here, but by accident. Stating it makes the
     intent survive the next edit. */
  var DB_BOX_RANGE_SQL =
    "(`chart_of_accounts` REGEXP '^[0-9]+$' AND CAST(`chart_of_accounts` AS UNSIGNED) BETWEEN 300000 AND 400000)";
  
  function dbBoxValidateDate_(v) {
    var s = String(v === undefined || v === null ? '' : v).trim();
    if (!s) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('صيغة التاريخ غير صحيحة (المتوقع YYYY-MM-DD): ' + s);
    return s;
  }
  
  function dbBoxValidateAccount_(v) {
    var s = String(v === undefined || v === null ? '' : v).trim();
    if (!s) return '';
    if (!/^\d{1,20}$/.test(s)) throw new Error('كود الحساب يجب أن يكون أرقاماً فقط: ' + s);
    return s;
  }
  
  function dbBoxValidateType_(v) {
    var s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
    if (!s) return '';
    if (s !== 'credit' && s !== 'debit') throw new Error("نوع الحركة يجب أن يكون credit أو debit: " + v);
    return s;
  }
  
  /** Integer or '' (meaning "no filter"). Rejects anything else rather than coercing. */
  function dbBoxValidateInt_(v, label) {
    var s = String(v === undefined || v === null ? '' : v).trim();
    if (!s) return '';
    if (!/^-?\d{1,19}$/.test(s)) throw new Error((label || 'القيمة') + ' يجب أن تكون رقماً صحيحاً: ' + v);
    return s;
  }
  
  /**
   * Shared WHERE builder — used by BOTH the COUNT and the SELECT in dbBoxList_,
   * so the pager total can never describe a different set of rows than the page
   * shows. Same reason dbClientsArWhere_ exists.
   *
   * data: { date_from, date_to, chart_of_accounts, responsible_person, box_code,
   *         transaction_type, is_revised, items_only }
   * Returns { sql, params }.
   *
   * NULL transaction_date rows never match a set date bound (standard SQL), the
   * same behaviour the clients_AR list already has.
   */
  function dbBoxWhere_(data) {
    var conditions = [];
    var params = [];
  
    var from = dbBoxValidateDate_(data.date_from);
    var to = dbBoxValidateDate_(data.date_to);
    if (from && to && from > to) throw new Error('تاريخ "من" يجب أن يكون قبل تاريخ "إلى"');
    if (from) { conditions.push('`transaction_date` >= ?'); params.push(from); }
    if (to) { conditions.push('`transaction_date` <= ?'); params.push(to); }
  
    var acct = dbBoxValidateAccount_(data.chart_of_accounts);
    if (acct) { conditions.push('`chart_of_accounts` = ?'); params.push(acct); }
  
    /* responsible_person is free `text` and is typed inconsistently (plan §2
       caveat), so an exact match would find nothing most of the time. LIKE with
       both wildcards is a scan — acceptable because the date bound above already
       limits the set, and because this is a filter a human typed, not something
       the page issues on its own. */
    var person = String(data.responsible_person === undefined || data.responsible_person === null ? '' : data.responsible_person).trim();
    if (person) { conditions.push('`responsible_person` LIKE ?'); params.push('%' + person + '%'); }
  
    var box = dbBoxValidateInt_(data.box_code, 'كود الخزنة');
    if (box) { conditions.push('`box_code` = ?'); params.push(box); }
  
    var type = dbBoxValidateType_(data.transaction_type);
    if (type) { conditions.push('`transaction_type` = ?'); params.push(type); }
  
    var rev = String(data.is_revised === undefined || data.is_revised === null ? '' : data.is_revised).trim();
    if (rev === '0' || rev === '1') { conditions.push('`is_revised` = ?'); params.push(Number(rev)); }
    else if (rev !== '') throw new Error('قيمة حالة المراجعة غير صحيحة (المتوقع 0 أو 1 أو فراغ)');
  
    if (data.items_only === true || data.items_only === 'true' || data.items_only === 1 || data.items_only === '1') {
      conditions.push(DB_BOX_RANGE_SQL);
    }
  
    return {
      sql: conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '',
      params: params
    };
  }
  
  /** Every column of one result-set row, as strings (or null), in DB_BOX_COLUMNS order. */
  function dbBoxReadRow_(rs) {
    function s(i) { var v = rs.getObject(i); return v !== null ? String(v) : null; }
    return {
      id: s(1),
      /* DATE comes back as 'YYYY-MM-DD'; slice defends against a driver that
         appends a time, exactly as dbClientsArList_ does for payment_date. */
      transaction_date: rs.getObject(2) !== null ? String(rs.getObject(2)).slice(0, 10) : null,
      transaction_details: s(3),
      client_id: s(4),
      related_id: s(5),
      transaction_type: s(6),
      transaction_amount: s(7),
      chart_of_accounts: s(8),
      responsible_person: s(9),
      box_code: s(10),
      user_id: s(11),
      created_at: s(12),
      updated_at: s(13),
      is_revised: rs.getObject(14) !== null ? String(rs.getObject(14)) : '0'
    };
  }

  /* MySQL JSON_ARRAYAGG does not promise element order. Keep the row number in
     the payload, validate it on the Apps Script side, and restore the same
     order the old JDBC loop returned. This is the box page's equivalent of
     the proven fast-read JSON readers used by the other TopChemical pages. */
  function dbBoxParseRankedJson_(raw, expectedRows, maxRows, label) {
    var started = Date.now();
    var parsed = JSON.parse(String(raw || '[]'));
    if (!Array.isArray(parsed) || parsed.length !== expectedRows || parsed.length > maxRows) {
      throw new Error((label || 'Box') + ' MySQL aggregate is invalid');
    }
    parsed.sort(function (a, b) { return Number(a && a._row_num) - Number(b && b._row_num); });
    for (var i = 0; i < parsed.length; i++) {
      if (!parsed[i] || typeof parsed[i] !== 'object' || Array.isArray(parsed[i]) || Number(parsed[i]._row_num) !== i + 1) {
        throw new Error((label || 'Box') + ' MySQL aggregate order is invalid');
      }
      delete parsed[i]._row_num;
    }
    if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) {
      _mysqlRequest_.jsonParseMs = (_mysqlRequest_.jsonParseMs || 0) + Date.now() - started;
    }
    return parsed;
  }

  function dbBoxJsonField_(alias, column) {
    var ident = dbSanitizeIdentifier_(alias) + '.' + dbSanitizeIdentifier_(column);
    return 'CASE WHEN ' + ident + ' IS NULL THEN NULL ELSE CAST(' + ident + ' AS CHAR) END';
  }

  function dbBoxJsonArgs_(alias, columns) {
    var args = ["'_row_num', " + dbSanitizeIdentifier_(alias) + '._row_num'];
    columns.forEach(function (column) {
      args.push("'" + column.replace(/'/g, "''") + "'");
      args.push(dbBoxJsonField_(alias, column));
    });
    return args;
  }

  function dbBoxReadJsonRow_(row) {
    function s(key) { return row[key] == null ? null : String(row[key]); }
    return {
      id: s('id'),
      transaction_date: row.transaction_date == null ? null : String(row.transaction_date).slice(0, 10),
      transaction_details: s('transaction_details'),
      client_id: s('client_id'),
      related_id: s('related_id'),
      transaction_type: s('transaction_type'),
      transaction_amount: s('transaction_amount'),
      chart_of_accounts: s('chart_of_accounts'),
      responsible_person: s('responsible_person'),
      box_code: s('box_code'),
      user_id: s('user_id'),
      created_at: s('created_at'),
      updated_at: s('updated_at'),
      is_revised: row.is_revised == null ? '0' : String(row.is_revised)
    };
  }
  
  /**
   * Paginated list of movements.
   * data: the dbBoxWhere_ filters, plus { limit, offset }.
   * Returns { status:'ok', columns, rows, total, limit, offset }.
   *
   * Limits clamped exactly as dbClientsArList_ clamps them — nothing unbounded
   * ever leaves the database. The clamped values are integers produced here, not
   * client strings, which is why they can be concatenated into the SQL.
   */
  function dbBoxList_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbBoxList_')) {
      return mysqlRead_(mysqlTcDefinition_('dbBoxList_'), data, function (p) { return dbBoxList_(p, user); });
    }
    
    
    
    data = data || {};
    var limit = Math.min(Math.max(Number(data.limit) || 50, 1), 200);
    var offset = Math.max(Number(data.offset) || 0, 0);
    var where = dbBoxWhere_(data);
    var cols = DB_BOX_COLUMNS.map(dbSanitizeIdentifier_).join(', ');
    var jsonArgs = dbBoxJsonArgs_('ranked', DB_BOX_COLUMNS);
    var aggregateSql =
      'SELECT (SELECT COUNT(*) FROM ' + DB_BOX_TABLE + where.sql + ') AS `total_count`,' +
      ' COUNT(*) AS `row_count`,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + jsonArgs.join(',') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`transaction_date` DESC, `page`.`id` DESC) AS `_row_num`' +
        ' FROM (' +
          ' SELECT ' + cols + ' FROM ' + DB_BOX_TABLE + where.sql +
          ' ORDER BY `transaction_date` DESC, `id` DESC' +
          ' LIMIT ' + limit + ' OFFSET ' + offset +
        ' ) AS `page`' +
      ' ) AS `ranked`';
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(aggregateSql);
      dbBindParams_(stmt, where.params.concat(where.params));
      rs = stmt.executeQuery();
      var total = 0, rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        total = Number(rs.getString('total_count') || 0);
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var rows = dbBoxParseRankedJson_(rowsJson, rowCount, limit, 'Box movement');
      rows = rows.map(dbBoxReadJsonRow_);
      return { status: 'ok', columns: DB_BOX_COLUMNS.slice(), rows: rows, total: total, limit: limit, offset: offset };
    } catch (err) {
      Logger.log('dbBoxList_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * The four spend windows per chart_of_accounts, in ONE round trip (plan §6).
   *
   * data: { ref_date 'YYYY-MM-DD', chart_of_accounts (optional), limit }.
   *
   * credit = spend (منصرف), debit = collected (محصّل). They are returned in
   * SEPARATE columns and are never netted: netting lets an inflow mask an
   * outflow, which is the opposite of what this page is for.
   *
   * Last month and last year are cut to the same day-of-period as the reference
   * date, computed by BoxEngine.accountWindows — a partial month measured against
   * a complete one manufactures a decline every time.
   *
   * The bound parameters go in in the same order the CASE expressions consume
   * them. That ordering is the one thing here a reader has to check by eye, so
   * the window list and the SELECT are built from the SAME array below rather
   * than written out twice.
   */
  function dbBoxAccountAggregates_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbBoxAccountAggregates_')) {
      return mysqlRead_(mysqlTcDefinition_('dbBoxAccountAggregates_'), data, function (p) { return dbBoxAccountAggregates_(p, user); });
    }
    
    
    
    data = data || {};
    var ref = dbBoxValidateDate_(data.ref_date);
    if (!ref) throw new Error('ref_date is required (YYYY-MM-DD)');
    var w = BoxEngine.accountWindows(ref);
    var acct = dbBoxValidateAccount_(data.chart_of_accounts);
    /* Without a single-account filter this groups the whole table's accounts, so
       it is capped. With one, the cap is irrelevant — there is one group. */
    var limit = Math.min(Math.max(Number(data.limit) || 300, 1), 1000);
  
    var WINDOWS = [
      { key: 'mtd', w: w.mtd },
      { key: 'last_month', w: w.last_month },
      { key: 'ytd', w: w.ytd },
      { key: 'last_ytd', w: w.last_ytd }
    ];
  
    var selects = [];
    var params = [];
    WINDOWS.forEach(function (x) {
      selects.push("SUM(CASE WHEN `transaction_type` = 'credit' AND `transaction_date` BETWEEN ? AND ? THEN `transaction_amount` ELSE 0 END) AS `spend_" + x.key + '`');
      params.push(x.w.from, x.w.to);
    });
    WINDOWS.forEach(function (x) {
      selects.push("SUM(CASE WHEN `transaction_type` = 'debit' AND `transaction_date` BETWEEN ? AND ? THEN `transaction_amount` ELSE 0 END) AS `collected_" + x.key + '`');
      params.push(x.w.from, x.w.to);
    });
    WINDOWS.forEach(function (x) {
      selects.push("COUNT(CASE WHEN `transaction_type` = 'credit' AND `transaction_date` BETWEEN ? AND ? THEN 1 END) AS `n_" + x.key + '`');
      params.push(x.w.from, x.w.to);
    });
  
    /* The outer bound is exactly the span the four windows can touch: 1 January
       of last year through the reference date. Anything outside it contributes 0
       to every CASE, so reading it would be pure cost. */
    var whereSql = ' WHERE `transaction_date` BETWEEN ? AND ?';
    params.push(w.span.from, w.span.to);
    if (acct) { whereSql += ' AND `chart_of_accounts` = ?'; params.push(acct); }
  
    /* The page needs figures for exactly the accounts on the visible page —
       rarely more than a dozen. Restricting to them keeps the GROUP BY off the
       whole account tree and, more importantly, means the answer cannot depend on
       the ORDER BY / LIMIT below: without it, an account on the page that is not
       in the top N by YTD spend would come back with no figures at all and the
       strip would read zero for a perfectly ordinary account.
       The placeholders are generated from the validated list's LENGTH; the values
       themselves bind. */
    var list = [];
    if (data.accounts && data.accounts.length) {
      for (var ai = 0; ai < data.accounts.length; ai++) {
        var one = dbBoxValidateAccount_(data.accounts[ai]);
        if (one && list.indexOf(one) === -1) list.push(one);
      }
      if (list.length > 500) list = list.slice(0, 500);
    }
    if (list.length) {
      var marks = [];
      for (var mi = 0; mi < list.length; mi++) marks.push('?');
      whereSql += ' AND `chart_of_accounts` IN (' + marks.join(', ') + ')';
      for (var pi = 0; pi < list.length; pi++) params.push(list[pi]);
    }
  
    var metricKeys = [];
    WINDOWS.forEach(function (x) { metricKeys.push('spend_' + x.key); });
    WINDOWS.forEach(function (x) { metricKeys.push('collected_' + x.key); });
    WINDOWS.forEach(function (x) { metricKeys.push('n_' + x.key); });
    var aggregateArgs = ["'_row_num', `ranked`.`_row_num`", "'chart_of_accounts', " + dbBoxJsonField_('ranked', 'chart_of_accounts')];
    metricKeys.forEach(function (key) {
      aggregateArgs.push("'" + key + "'");
      aggregateArgs.push('`ranked`.`' + key + '`');
    });
    var aggregateSql =
      'SELECT COUNT(*) AS `row_count`,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + aggregateArgs.join(',') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        ' SELECT `grouped`.*, ROW_NUMBER() OVER (ORDER BY `grouped`.`spend_ytd` DESC) AS `_row_num`' +
        ' FROM (' +
          ' SELECT `chart_of_accounts`, ' + selects.join(', ') +
          ' FROM ' + DB_BOX_TABLE + whereSql +
          ' GROUP BY `chart_of_accounts`' +
          ' ORDER BY `spend_ytd` DESC' +
          ' LIMIT ' + limit +
        ' ) AS `grouped`' +
      ' ) AS `ranked`';

    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(aggregateSql);
      dbBindParams_(stmt, params);
      rs = stmt.executeQuery();
      var rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var parsed = dbBoxParseRankedJson_(rowsJson, rowCount, limit, 'Box account aggregate');
      var rows = parsed.map(function (item) {
        var row = { chart_of_accounts: item.chart_of_accounts == null ? null : String(item.chart_of_accounts) };
        WINDOWS.forEach(function (x) { row['spend_' + x.key] = Number(item['spend_' + x.key]) || 0; });
        WINDOWS.forEach(function (x) { row['collected_' + x.key] = Number(item['collected_' + x.key]) || 0; });
        WINDOWS.forEach(function (x) { row['n_' + x.key] = Number(item['n_' + x.key]) || 0; });
        return row;
      });
      return { status: 'ok', ref_date: ref, windows: w, rows: rows, limit: limit };
    } catch (err) {
      Logger.log('dbBoxAccountAggregates_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Account code → Arabic label, from chart_of_accounts_main.
   *
   * DELIBERATELY NOT A JOIN. Whether `chart_of_accounts_main.id_5` is unique per
   * row has not been confirmed against the data (plan §12 q.4), and a duplicated
   * id_5 in a SQL join would fan out the aggregate rows and DOUBLE every account
   * total on the page — a wrong number that looks entirely plausible. Labelling
   * in JavaScript from a map cannot fan anything out: a duplicate can only make a
   * label ambiguous, and `duplicate_ids` reports exactly which ones so the page
   * can say so rather than pick one silently.
   */
  function dbChartAccountLabels_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbChartAccountLabels_')) {
      return mysqlRead_(mysqlTcDefinition_('dbChartAccountLabels_'), data, function (p) { return dbChartAccountLabels_(p, user); });
    }
    
    
    
    data = data || {};
    var limit = Math.min(Math.max(Number(data.limit) || 5000, 1), 20000);
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'SELECT `id_5`, `account_5_name` FROM `chart_of_accounts_main`' +
        ' WHERE `id_5` IS NOT NULL LIMIT ' + limit);
      rs = stmt.executeQuery();
      var labels = {}, duplicates = {}, n = 0;
      while (rs.next()) {
        var id = rs.getObject(1) !== null ? String(rs.getObject(1)).trim() : '';
        var name = rs.getObject(2) !== null ? String(rs.getObject(2)).trim() : '';
        if (!id) continue;
        n++;
        if (Object.prototype.hasOwnProperty.call(labels, id)) {
          if (labels[id] !== name) duplicates[id] = true;
          continue;                       /* first spelling wins, and it is reported */
        }
        labels[id] = name;
      }
      return {
        status: 'ok', labels: labels, count: n,
        duplicate_ids: Object.keys(duplicates),
        truncated: n >= limit
      };
    } catch (err) {
      Logger.log('dbChartAccountLabels_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * The rows the item engine needs: a bounded window of in-range movements, with
   * only the columns parsing and price analysis actually consume.
   *
   * This is the ONE query that feeds the whole item index. It is never issued per
   * row and never inside a loop — JDBC round trips are the entire cost of this
   * page, and a per-row history query would turn one page load into fifty.
   *
   * Two hard bounds, both because Apps Script kills a script at six minutes:
   *   months  — how far back to look, default 24, capped at 60
   *   limit   — a hard row cap, capped at DB_BOX_HISTORY_MAX
   * `truncated` tells the caller the window was cut, so the page can say
   * "التحليل على أحدث N حركة" instead of quietly analysing a subset.
   */
  var DB_BOX_HISTORY_MAX = 20000;
  
  function dbBoxItemHistory_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbBoxItemHistory_')) {
      return mysqlRead_(mysqlTcDefinition_('dbBoxItemHistory_'), data, function (p) { return dbBoxItemHistory_(p, user); });
    }
    
    
    
    data = data || {};
    var ref = dbBoxValidateDate_(data.ref_date);
    if (!ref) throw new Error('ref_date is required (YYYY-MM-DD)');
    var months = Math.min(Math.max(Number(data.months) || 24, 1), 60);
    var limit = Math.min(Math.max(Number(data.limit) || 5000, 1), DB_BOX_HISTORY_MAX);
  
    var fromIso = BoxEngine.monthsBefore(ref, months);
  
    var params = [fromIso, ref];
    var whereSql = ' WHERE `transaction_date` BETWEEN ? AND ?' +
      "  AND `transaction_type` = 'credit'" +      /* spend only; debit is collection */
      ' AND ' + DB_BOX_RANGE_SQL;                  /* the item engine's scope, plan §2.1 */
  
    var acct = dbBoxValidateAccount_(data.chart_of_accounts);
    if (acct) { whereSql += ' AND `chart_of_accounts` = ?'; params.push(acct); }
  
    var historyColumns = ['id', 'transaction_date', 'transaction_details', 'transaction_amount',
      'chart_of_accounts', 'responsible_person', 'box_code', 'created_at', 'is_revised'];
    var historyArgs = dbBoxJsonArgs_('ranked', historyColumns);
    var aggregateSql =
      'SELECT COUNT(*) AS `row_count`,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + historyArgs.join(',') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`transaction_date` DESC, `page`.`id` DESC) AS `_row_num`' +
        ' FROM (' +
          ' SELECT ' + historyColumns.map(dbSanitizeIdentifier_).join(', ') +
          ' FROM ' + DB_BOX_TABLE + whereSql +
          ' ORDER BY `transaction_date` DESC, `id` DESC' +
          ' LIMIT ' + limit +
        ' ) AS `page`' +
      ' ) AS `ranked`';
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(aggregateSql);
      dbBindParams_(stmt, params);
      rs = stmt.executeQuery();
      var rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var rows = dbBoxParseRankedJson_(rowsJson, rowCount, limit, 'Box item history');
      return {
        status: 'ok', rows: rows, from: fromIso, to: ref,
        months: months, limit: limit, truncated: rows.length >= limit
      };
    } catch (err) {
      Logger.log('dbBoxItemHistory_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  // ─── regular_box_movement: the ONE write path ───────────────────────────────
  //
  // This feature has exactly one write: one row, addressed by primary key, from a
  // user who filled in a form, clicked Save, and then confirmed a dialog that
  // named the change. There is no bulk correction here, no backfill, no
  // "normalize the existing data" pass, and no DELETE. If the parser shows four
  // hundred rows with malformed details, that is a number to report, not a job to
  // run.
  //
  // Never executed against anything. Verified by reading, and by the invariants
  // tools/verify/box_sql.js asserts over this text.
  
  /** Reads one row by id. Used for the before/after snapshots the audit needs. */
  function dbBoxGetOne_(conn, id) {
    var cols = DB_BOX_COLUMNS.map(dbSanitizeIdentifier_).join(', ');
    var stmt, rs;
    try {
      stmt = conn.prepareStatement('SELECT ' + cols + ' FROM ' + DB_BOX_TABLE + ' WHERE `id` = ? LIMIT 1');
      stmt.setObject(1, id);
      rs = stmt.executeQuery();
      return rs.next() ? dbBoxReadRow_(rs) : null;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
    }
  }
  
  /**
   * Update ONE movement row.
   *
   * data: { id, changes: { column: value, ... } }
   * Returns { status:'ok', id, changed:[cols], before:{row}, after:{row},
   *           boundary:{...}|null }
   *
   * The column names in the SET clause come from BoxEngine.EDITABLE_COLUMNS — a
   * fixed allowlist — and are re-derived here through dbSanitizeIdentifier_ so
   * that even a bug in the allowlist cannot put arbitrary text into the
   * statement. Values bind as parameters, every one of them.
   *
   * updated_at is set by the SERVER to NOW() and is not in the allowlist, so an
   * edit cannot write an old timestamp into the column that the
   * EDITED_AFTER_REVIEW rule reads.
   *
   * The caller (updateBoxMovement_) writes the audit trail. It is not done here
   * because this file talks to MySQL and the audit lives in Drive, and mixing the
   * two would make this function untestable in exactly the way the rest of the
   * connector is.
   */
  function dbBoxUpdate_(data, user) {
    data = data || {};
    var id = dbBoxValidateInt_(data.id, 'رقم الحركة');
    if (!id) throw new Error('رقم الحركة مطلوب');
  
    /* Allowlist + per-column validation, before a connection is even opened.
       A change set that will not validate must not cost a round trip. */
    var checked = BoxEngine.validateChanges(data.changes);
  
    var setParts = [];
    var params = [];
    checked.columns.forEach(function (col) {
      setParts.push(dbSanitizeIdentifier_(col) + ' = ?');
      params.push(checked.values[col]);
    });
    /* Server-set, always, and last in the SET list so it is impossible to read
       the statement without seeing it. */
    setParts.push('`updated_at` = NOW()');
  
    var conn, stmt;
    try {
      conn = dbGetConnection_();
  
      var before = dbBoxGetOne_(conn, id);
      if (!before) throw new Error('البند غير موجود');
  
      stmt = conn.prepareStatement(
        'UPDATE ' + DB_BOX_TABLE + ' SET ' + setParts.join(', ') + ' WHERE `id` = ?');
      dbBindParams_(stmt, params);
      stmt.setObject(params.length + 1, id);
      var affected = stmt.executeUpdate();
      if (affected === 0) throw new Error('البند غير موجود');
  
      var after = dbBoxGetOne_(conn, id);
      return {
        status: 'ok',
        id: id,
        affected: affected,
        changed: checked.columns,
        before: before,
        after: after,
        /* Crossing the 300000–400000 boundary changes which analyses apply to
           this row and nothing else on screen would show it. */
        boundary: checked.columns.indexOf('chart_of_accounts') !== -1
          ? BoxEngine.crossesItemBoundary(before.chart_of_accounts, after ? after.chart_of_accounts : null)
          : null
      };
    } catch (err) {
      Logger.log('dbBoxUpdate_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * Flip one row's review flag 0 -> 1, mirroring dbClientsArRevise_.
   *
   * The `AND is_revised = 0 OR IS NULL` guard makes this idempotent-safe: a
   * second click reports "already reviewed" rather than silently moving
   * updated_at, which the EDITED_AFTER_REVIEW rule would then read as a post-hoc
   * edit of a reviewed row. The rule this page ships would have fired on the
   * page's own double-click.
   */
  function dbBoxRevise_(data, user) {
    data = data || {};
    var id = dbBoxValidateInt_(data.id, 'رقم الحركة');
    if (!id) throw new Error('رقم الحركة مطلوب');
    var conn, stmt;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'UPDATE ' + DB_BOX_TABLE + ' SET `is_revised` = 1, `updated_at` = NOW()' +
        ' WHERE `id` = ? AND (`is_revised` = 0 OR `is_revised` IS NULL)');
      stmt.setObject(1, id);
      var affected = stmt.executeUpdate();
      if (affected === 0) throw new Error('البند غير موجود أو تمت مراجعته مسبقاً');
      return { status: 'ok', affected: affected, id: id, is_revised: 1 };
    } catch (err) {
      Logger.log('dbBoxRevise_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  // ─── Wider reads for the alerts tab and the precomputed index ───────────────
  //
  // dbBoxList_ is the PAGE's read and is clamped to 200 rows, which is right for
  // something a human scrolls. The behavioural rules in Tier 3 need a population
  // rather than a page — Benford alone is gated at 300 amounts — so they get
  // their own bounded scan rather than a raised clamp on the page query.
  
  var DB_BOX_SCAN_MAX = 8000;
  
  /**
   * A bounded scan for the rules engine.
   *
   * data: { ref_date, months, limit, chart_of_accounts, responsible_person }
   *
   * ALL transaction types come back, unlike dbBoxItemHistory_: Tier 1 reasons
   * about duplicates, sequence and edit timestamps, which apply to a collection
   * exactly as much as to a payment. The rules that are about SPEND filter to
   * credit themselves, close to where that decision matters.
   *
   * `truncated` says the window was cut, so the page can report what it actually
   * analysed instead of implying it saw everything.
   */
  function dbBoxAnalysisScan_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbBoxAnalysisScan_')) {
      return mysqlRead_(mysqlTcDefinition_('dbBoxAnalysisScan_'), data, function (p) { return dbBoxAnalysisScan_(p, user); });
    }
    
    
    
    data = data || {};
    var ref = dbBoxValidateDate_(data.ref_date);
    if (!ref) throw new Error('ref_date is required (YYYY-MM-DD)');
    var months = Math.min(Math.max(Number(data.months) || 12, 1), 60);
    var limit = Math.min(Math.max(Number(data.limit) || 3000, 1), DB_BOX_SCAN_MAX);
    var fromIso = BoxEngine.monthsBefore(ref, months);
  
    var conditions = ['`transaction_date` BETWEEN ? AND ?'];
    var params = [fromIso, ref];
  
    var acct = dbBoxValidateAccount_(data.chart_of_accounts);
    if (acct) { conditions.push('`chart_of_accounts` = ?'); params.push(acct); }
    var person = String(data.responsible_person === undefined || data.responsible_person === null ? '' : data.responsible_person).trim();
    if (person) { conditions.push('`responsible_person` LIKE ?'); params.push('%' + person + '%'); }
  
    var scanArgs = dbBoxJsonArgs_('ranked', DB_BOX_COLUMNS);
    var aggregateSql =
      'SELECT COUNT(*) AS `row_count`,' +
      ' COALESCE(JSON_ARRAYAGG(JSON_OBJECT(' + scanArgs.join(',') + ')), JSON_ARRAY()) AS `rows_json`' +
      ' FROM (' +
        ' SELECT `page`.*, ROW_NUMBER() OVER (ORDER BY `page`.`transaction_date` DESC, `page`.`id` DESC) AS `_row_num`' +
        ' FROM (' +
          ' SELECT ' + DB_BOX_COLUMNS.map(dbSanitizeIdentifier_).join(', ') +
          ' FROM ' + DB_BOX_TABLE +
          ' WHERE ' + conditions.join(' AND ') +
          ' ORDER BY `transaction_date` DESC, `id` DESC' +
          ' LIMIT ' + limit +
        ' ) AS `page`' +
      ' ) AS `ranked`';
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(aggregateSql);
      dbBindParams_(stmt, params);
      rs = stmt.executeQuery();
      var rowCount = 0, rowsJson = '[]';
      if (rs.next()) {
        rowCount = Number(rs.getString('row_count') || 0);
        rowsJson = String(rs.getString('rows_json') || '[]');
      }
      var rows = dbBoxParseRankedJson_(rowsJson, rowCount, limit, 'Box analysis scan').map(dbBoxReadJsonRow_);
      return {
        status: 'ok', rows: rows, from: fromIso, to: ref, months: months,
        limit: limit, truncated: rows.length >= limit
      };
    } catch (err) {
      Logger.log('dbBoxAnalysisScan_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  /**
   * MAX(updated_at) over the table — the cache key for the precomputed item
   * index. Any insert or edit moves it, so a stale index can never be served as
   * a fresh one, and nothing has to guess at a TTL.
   */
  function dbBoxMaxUpdatedAt_(data, user) {
    if (typeof mysqlRead_ === 'function' && !mysqlReading_('tc.dbBoxMaxUpdatedAt_')) {
      return mysqlRead_(mysqlTcDefinition_('dbBoxMaxUpdatedAt_'), data, function (p) { return dbBoxMaxUpdatedAt_(p, user); });
    }
    
    
    
    var conn, stmt, rs;
    try {
      conn = dbGetConnection_();
      stmt = conn.prepareStatement(
        'SELECT MAX(`updated_at`) AS mx, COUNT(*) AS cnt FROM ' + DB_BOX_TABLE);
      rs = stmt.executeQuery();
      if (!rs.next()) return { status: 'ok', max_updated_at: null, count: 0 };
      var mx = rs.getObject(1);
      return {
        status: 'ok',
        max_updated_at: mx !== null ? String(mx) : null,
        count: Number(rs.getObject(2)) || 0
      };
    } catch (err) {
      Logger.log('dbBoxMaxUpdatedAt_ MySQL adapter completed or failed; see named diagnostics');
      throw err;
    } finally {
      if (rs) rs.close();
      if (stmt) stmt.close();
      if (conn) conn.close();
    }
  }
  
  function topChemicalThemeCss_() {
    return '' +
      '<style>\n' +
      ':root {\n' +
      /* [UI-2.5 / D-1 / U-10] Same treatment as TopLight: canvas, surfaces,
         borders and ink now come from CSS_Tokens.html. The page stops being
         painted green; the brand lives in the topbar and the buttons. */
      '  --font-sans: \'Cairo\', sans-serif;\n' +
      '  --font-mono: \'Consolas\', \'Courier New\', monospace;\n' +
      '  --success: #16a34a;\n' +
      '  --success-bg: #f0fdf4;\n' +
      '  --success-text: #16a34a;\n' +
      '  --success-border: #bbf7d0;\n' +
      '  --warning: #b45309;\n' +
      '  --warning-bg: #fffbeb;\n' +
      '  --warning-text: #b45309;\n' +
      '  --warning-border: #fde68a;\n' +
      '  --danger: #b91c1c;\n' +
      '  --danger-bg: #fef2f2;\n' +
      '  --danger-text: #b91c1c;\n' +
      '  --danger-border: #fecaca;\n' +
      '  --info: #0369a1;\n' +
      '  --amber: #b45309;\n' +
      '  --brand-primary: #16a34a;\n' +
      '  --brand-primary-hover: #15803d;\n' +
      '  --brand-subtle-bg: #dcfce7;\n' +
      '  --brand-border: #16a34a;\n' +
      '  --btn-text-color: #ffffff;\n' +
      '  --shadow-brand: 0 4px 14px rgba(22, 163, 74, 0.25);\n' +
      '}\n' +
      /* The brand topbar: green with white ink. */
      '.topbar { background: #15803d; border-bottom: 1px solid #14532d; }\n' +
      '.topbar .nav-item { color: #ffffff; }\n' +
      '.topbar .nav-item:hover, .topbar .nav-item.active { color: #15803d; background: #ffffff; }\n' +
      '.topbar .nav-dropdown-toggle { color: #ffffff; }\n' +
      '.topbar .nav-dropdown-toggle:hover, .topbar .nav-dropdown-toggle.open { color: #15803d; background: #ffffff; }\n' +
      '.topbar .nav-dropdown-menu { background: #ffffff; border: 1px solid var(--border-color); }\n' +
      '.topbar .nav-dropdown-item:hover { background: #dcfce7; color: #15803d; }\n' +
      '/* Profile toggle must read without hovering: the shared .user-name rule\n' +
      '   would otherwise paint it near-black on the green topbar. */\n' +
      '.topbar .user-profile-toggle { border: 1px solid #ffffff; border-radius: 999px; padding: 4px 12px; }\n' +
      '.topbar .user-profile-toggle .user-name { color: #ffffff; }\n' +
      '.topbar .user-profile-toggle .nav-dropdown-caret { color: #ffffff; }\n' +
      '.topbar .user-profile-toggle:hover, .topbar .user-profile-toggle.open { background: #ffffff; }\n' +
      '.topbar .user-profile-toggle:hover .user-name, .topbar .user-profile-toggle.open .user-name,\n' +
      '.topbar .user-profile-toggle:hover .nav-dropdown-caret, .topbar .user-profile-toggle.open .nav-dropdown-caret { color: #15803d; }\n' +
      '.topbar .user-avatar { background: #ffffff; color: #15803d; }\n' +
      '/* Mobile hamburger: dark bars are invisible on the green topbar. */\n' +
      '.topbar-hamburger { border: 1px solid #ffffff; }\n' +
      '.topbar-hamburger .hamburger-bar { background: #ffffff; }\n' +
      /* Buttons keep the darker green they already used. */
      '.btn-primary { background: #15803d; box-shadow: 0 4px 14px rgba(20, 83, 45, 0.3); }\n' +
      '.btn-primary:hover { background: #14532d; box-shadow: 0 6px 16px rgba(20, 83, 45, 0.35); }\n' +
      '.btn-outline:hover { background: #dcfce7; border-color: #15803d; color: #14532d; }\n' +
      /* Documents keep a visible frame, but a hairline one rather than 2px green. */
      '.invoice { background: #ffffff; border: 1px solid var(--border-color); }\n' +
      /* [UI-7.2 / U-34] The blanket universal print-color-adjust:exact rule is
         gone. It forced the browser to render EVERY background, so this
         company's table header printed as a solid bar and a multi-page report
         cost a cartridge of toner. UI_Components.html now applies print colour
         deliberately, to the document header rule and the totals row only. */
      '</style>\n';
  }
  
  
  
  return {
    dispatch_: dispatch_,
    boxEngine_: BoxEngine,
    themeCss_: topChemicalThemeCss_,
    blockTheme_: function () { return { from: '#15803d', to: '#22c55e' }; },
    pageForAction_: pageForAction_,
    tableForAction_: tableForAction_,
    requestRecovery_: requestRecovery_,
    /* Exposed only so the global trigger entry point below can reach it. */
    rebuildBoxAnalysisIndex_: rebuildBoxAnalysisIndex_
  };
})();

/**
 * Nightly precompute entry point for تحليل حركة الخزنة العادية.
 *
 * NO TRIGGER IS INSTALLED. This work is not permitted to modify the owner's
 * Apps Script project outside a push, and installing a trigger would do exactly
 * that. To install it after review:
 *
 *     Apps Script editor → Triggers (clock icon) → Add Trigger
 *       Function:      rebuildBoxAnalysisIndex
 *       Event source:  Time-driven → Day timer → 2am to 3am
 *
 * The name has NO trailing underscore on purpose: a trailing underscore makes a
 * function private to the project, and the trigger dialog will not list it.
 *
 * Until it is installed nothing calls this, and the page computes on demand for
 * the window it is showing — which is why every on-demand path is bounded and
 * checks its own clock against the six-minute execution limit.
 */
function rebuildBoxAnalysisIndex() {
  return TopChemical.rebuildBoxAnalysisIndex_({});
}

// =========================================
// PRINT REPORTS — صرف المرتبات الشهرية
// كشف الكروت (8/ورقة) وكشف الأقسام. Faithful ports of the legacy
// AppSheet report layouts, driven by the app's emp_salaries data.
// Route: download=payroll_report&type=cards|sections&month&year.
// These helpers are globals (used directly by Code.js doGet).
// =========================================

const PAYROLL_MONTH_NAMES = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function servePayrollReport_(params) {
  authorizeArtifact_(params, { company: '3fe1b5cb67b7223e', page: 'tc_emp_salaries', access: 'read' });
  const month = Number(params.month);
  const year = Number(params.year);
  if (!Number.isInteger(month) || month < 1 || month > 12) return ContentService.createTextOutput('Invalid month');
  if (!Number.isInteger(year) || year < 2000) return ContentService.createTextOutput('Invalid year');
  const type = String(params.type || 'cards').trim();
  if (type !== 'cards' && type !== 'sections') return ContentService.createTextOutput('Invalid type');

  const dbId = getCompanySpreadsheetId_('3fe1b5cb67b7223e');
  const rows = getAllRecords_(dbId, 'emp_salaries')
    .filter(function (r) { return Number(r.month) === month && Number(r.year) === year; })
    .sort(function (a, b) {
      const sa = String(a.section || '').trim();
      const sb = String(b.section || '').trim();
      if (sa !== sb) return sa.localeCompare(sb, 'ar');
      return (Number(a.emp_id) || 0) - (Number(b.emp_id) || 0);
    });

  const monthName = PAYROLL_MONTH_NAMES[month] || String(month);
  const html = type === 'cards'
    ? buildPayrollCardsHtml_(rows, monthName, year)
    : buildPayrollSectionsHtml_(rows, monthName, year);

  return HtmlService.createHtmlOutput(html)
    .setTitle((type === 'cards' ? 'كشف الكروت (8/ورقة)' : 'كشف الأقسام') + ' - ' + monthName + ' ' + year)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function payrollMoney_(n) {
  const v = Number(n) || 0;
  const fixed = v.toFixed(2);
  const parts = fixed.split('.');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + parts[1];
}

function payrollEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function payrollRow_1(r) {
  return {
    empId: Number(r.emp_id) || 0,
    name: String(r.name_ar || ''),
    section: String(r.section || '').trim() || '-',
    basic: Number(r.basic_salary) || 0,
    allow: Number(r.allow) || 0,
    workingDays: Number(r.working_days) || 0,
    workingDaysValue: Number(r.working_days_value) || 0,
    overtimeDays: Number(r.overtime_days) || 0,
    additions: (Number(r.other_addition) || 0) + (Number(r.overtime_days_value) || 0),
    deductions: (Number(r.loans_other_deductions) || 0) +
      (Number(r.delay_deductions) || 0) + (Number(r.deduction_day_value) || 0),
    net: Number(r.net_salary_nearest) || 0
  };
}

// -----------------------------------------
// كشف الكروت — A4 portrait، شبكة 2×4 (8 بطاقات/ورقة)
// -----------------------------------------
function buildPayrollCardsHtml_(rows, monthName, year) {
  const cards = rows.map(payrollRow_1);
  const cardHtml = cards.map(function (c) {
    return '' +
      '<div class="card-top"><b>' + payrollEsc_(c.name) + '</b>' +
      '<span class="code">كود: ' + c.empId + '</span></div>' +
      '<div class="sec">' + payrollEsc_(c.section) + '</div>' +
      '<table class="kv">' +
      '<tr><td>الأساسي</td><td class="v">' + payrollMoney_(c.basic) + '</td><td>البدلات</td><td class="v">' + payrollMoney_(c.allow) + '</td></tr>' +
      '<tr><td>أيام العمل</td><td class="v">' + c.workingDays + '</td><td>قيمة أيام العمل</td><td class="v">' + payrollMoney_(c.workingDaysValue) + '</td></tr>' +
      '<tr><td>أيام الإضافي</td><td class="v">' + c.overtimeDays + '</td><td>الإضافات</td><td class="v">' + payrollMoney_(c.additions) + '</td></tr>' +
      '<tr><td>الخصومات</td><td class="v">' + payrollMoney_(c.deductions) + '</td><td>الصافي</td><td class="v net">' + payrollMoney_(c.net) + '</td></tr>' +
      '</table>' +
      '<div class="receipt">أقر أنا الموقع أدناه باستلام مبلغ وقدره <b>' + payrollMoney_(c.net) + '</b> جنيه فقط لا غير عن ' +
      payrollEsc_(monthName) + ' ' + year + '.</div>' +
      '<div class="sig"><span>توقيع الموظف</span><span>الختم</span></div>';
  });

  let body = '';
  const sectionTotals = {};
  cards.forEach(function (c) {
    sectionTotals[c.section] = sectionTotals[c.section] || { count: 0, net: 0 };
    sectionTotals[c.section].count++;
    sectionTotals[c.section].net += c.net;
  });
  const sections = Object.keys(sectionTotals).sort(function (a, b) { return a.localeCompare(b, 'ar'); });

  const pageHeader = function (extra) {
    return '<div class="phead"><div class="ptitle">كشف كروت المرتبات — ' + payrollEsc_(monthName) + ' ' + year + '</div>' +
      '<div class="pmeta">توب كيميكال' + (extra ? ' | ' + extra : '') + '</div></div>';
  };

  const emitCards = function (list) {
    let full = pageHeader();
    let table = '<table class="grid">';
    let cell = 0;
    list.forEach(function (html) {
      if (cell % 2 === 0) table += '<tr>';
      table += '<td class="card">' + html + '</td>';
      cell++;
      if (cell % 2 === 0) table += '</tr>';
      if (cell % 8 === 0) {
        table += '</table>';
        body += full + table;
        table = '<table class="grid">';
        cell = 0;
        full = pageHeader();
      }
    });
    if (cell % 2 === 1) table += '<td class="card"></td></tr>';
    if (cell > 0) {
      table += '</table>';
      body += full + table;
    }
    body += '<div class="page-break"></div>';
  };

  let currentSection = null;
  let bucket = [];
  /* OPT-3: cards[] holds map-built distinct objects, so indexOf(c) always
     equals the iteration index — the O(n) scan per card only burned CPU in a
     print path. Using ci directly is identical (no repeated references can
     exist to change numbering). */
  cards.forEach(function (c, ci) {
    if (currentSection !== null && c.section !== currentSection) {
      emitCards(bucket);
      bucket = [];
    }
    currentSection = c.section;
    bucket.push(cardHtml[ci]);
  });
  if (bucket.length) emitCards(bucket);

  body += '<div class="page-break"></div>';
  body += pageHeader('ملخص الأقسام');
  body += '<table class="summary">' +
    '<tr><th>القسم</th><th>عدد الموظفين</th><th>إجمالي الصافي</th></tr>';
  let grandCount = 0;
  let grandNet = 0;
  sections.forEach(function (s) {
    const t = sectionTotals[s];
    grandCount += t.count;
    grandNet += t.net;
    body += '<tr><td>' + payrollEsc_(s) + '</td><td class="num">' + t.count + '</td><td class="num">' + payrollMoney_(t.net) + '</td></tr>';
  });
  body += '<tr class="grand"><td>الإجمالي العام</td><td class="num">' + grandCount + '</td><td class="num">' + payrollMoney_(grandNet) + '</td></tr>' +
    '</table>';

  return '' +
    '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><title>كشف الكروت (8/ورقة)</title><style>' +
    '@page{size:A4 portrait;margin:6mm;}' +
    'html,body{margin:0;padding:0;font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#111;}' +
    '.page-break{page-break-after:always;}' +
    '.phead{display:flex;justify-content:space-between;align-items:center;padding:2mm 0 3mm;border-bottom:2px solid #000;margin-bottom:3mm;}' +
    '.ptitle{font-size:13pt;font-weight:800;}' +
    '.pmeta{font-size:9pt;color:#333;}' +
    'table.grid{width:100%;table-layout:fixed;border-collapse:collapse;}' +
    'td.card{width:50%;height:72mm;border:0.6px solid #000;padding:2.5mm;vertical-align:top;}' +
    '.card-top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #000;padding-bottom:1mm;margin-bottom:1.5mm;}' +
    '.card-top b{font-size:10.5pt;}' +
    '.code{font-size:8.5pt;color:#333;}' +
    '.sec{font-size:9pt;color:#333;margin-bottom:1.5mm;}' +
    'table.kv{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:1.5mm;}' +
    'table.kv td{border:0.4px solid #bbb;padding:0.6mm 1.2mm;}' +
    'table.kv td.v{text-align:left;font-weight:600;}' +
    'table.kv td.net{background:#f3f3f3;font-size:9.5pt;}' +
    '.receipt{font-size:8pt;line-height:1.5;margin-bottom:2mm;}' +
    '.sig{display:flex;justify-content:space-between;font-size:8pt;color:#333;}' +
    'table.summary{width:100%;border-collapse:collapse;font-size:10pt;margin-top:3mm;}' +
    'table.summary th,table.summary td{border:1px solid #000;padding:2mm;text-align:right;}' +
    'table.summary th{background:#eee;}' +
    'table.summary td.num{text-align:left;}' +
    'tr.grand td{background:#eee;font-weight:800;}' +
    '</style></head><body>' + body +
    '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' +
    '</body></html>';
}

// -----------------------------------------
// كشف الأقسام — A4 landscape، صفحة لكل قسم
// -----------------------------------------
function buildPayrollSectionsHtml_(rows, monthName, year) {
  const data = rows.map(payrollRow_1);
  const sections = {};
  data.forEach(function (c) {
    sections[c.section] = sections[c.section] || [];
    sections[c.section].push(c);
  });
  const order = Object.keys(sections).sort(function (a, b) { return a.localeCompare(b, 'ar'); });

  const pageHeader = function (title) {
    return '<div class="phead"><div class="ptitle">كشف الأقسام — ' + payrollEsc_(monthName) + ' ' + year + '</div>' +
      '<div class="pmeta">' + payrollEsc_(title) + '</div></div>';
  };

  let body = '';
  let grand = { count: 0, additions: 0, deductions: 0, net: 0 };

  order.forEach(function (s, idx) {
    const list = sections[s];
    let sum = { count: 0, additions: 0, deductions: 0, net: 0 };
    let table = '<table class="sec"><thead><tr>' +
      '<th>كود</th><th>الاسم</th><th>الأساسي</th><th>البدلات</th><th>أيام العمل</th><th>الإضافات</th><th>الخصومات</th><th>الصافي</th>' +
      '</tr></thead><tbody>';
    list.forEach(function (c) {
      sum.count++;
      sum.additions += c.additions;
      sum.deductions += c.deductions;
      sum.net += c.net;
      table += '<tr><td>' + c.empId + '</td><td>' + payrollEsc_(c.name) + '</td>' +
        '<td class="num">' + payrollMoney_(c.basic) + '</td>' +
        '<td class="num">' + payrollMoney_(c.allow) + '</td>' +
        '<td class="num">' + c.workingDays + '</td>' +
        '<td class="num">' + payrollMoney_(c.additions) + '</td>' +
        '<td class="num">' + payrollMoney_(c.deductions) + '</td>' +
        '<td class="num">' + payrollMoney_(c.net) + '</td></tr>';
    });
    table += '<tr class="sub"><td colspan="2">إجمالي القسم (' + sum.count + ')</td>' +
      '<td class="num"></td><td class="num"></td><td class="num"></td>' +
      '<td class="num">' + payrollMoney_(sum.additions) + '</td>' +
      '<td class="num">' + payrollMoney_(sum.deductions) + '</td>' +
      '<td class="num">' + payrollMoney_(sum.net) + '</td></tr>';
    table += '</tbody></table>';

    body += pageHeader('القسم: ' + payrollEsc_(s)) + table;
    if (idx < order.length - 1) body += '<div class="page-break"></div>';

    grand.count += sum.count;
    grand.additions += sum.additions;
    grand.deductions += sum.deductions;
    grand.net += sum.net;
  });

  body += '<div class="page-break"></div>';
  body += pageHeader('ملخص عام');
  body += '<table class="grand-box">' +
    '<tr><th>إجمالي عدد الموظفين</th><td>' + grand.count + '</td></tr>' +
    '<tr><th>إجمالي الإضافات</th><td>' + payrollMoney_(grand.additions) + '</td></tr>' +
    '<tr><th>إجمالي الخصومات</th><td>' + payrollMoney_(grand.deductions) + '</td></tr>' +
    '<tr><th>إجمالي الصافي</th><td class="final">' + payrollMoney_(grand.net) + '</td></tr>' +
    '</table>';

  return '' +
    '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><title>كشف الأقسام</title><style>' +
    '@page{size:A4 landscape;margin:8mm;}' +
    'html,body{margin:0;padding:0;font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#111;}' +
    '.page-break{page-break-after:always;}' +
    '.phead{display:flex;justify-content:space-between;align-items:center;padding:2mm 0 3mm;border-bottom:2px solid #000;margin-bottom:3mm;}' +
    '.ptitle{font-size:14pt;font-weight:800;}' +
    '.pmeta{font-size:10pt;color:#333;}' +
    'table.sec{width:100%;border-collapse:collapse;font-size:10pt;}' +
    'table.sec th,table.sec td{border:1px solid #000;padding:1.8mm;text-align:right;}' +
    'table.sec th{background:#eee;}' +
    'table.sec td.num{text-align:left;}' +
    'tr.sub td{background:#f5f5f5;font-weight:800;}' +
    'table.grand-box{width:60%;border-collapse:collapse;font-size:12pt;margin-top:4mm;}' +
    'table.grand-box th,table.grand-box td{border:1px solid #000;padding:3mm;text-align:right;}' +
    'table.grand-box th{background:#eee;}' +
    'table.grand-box td{font-weight:700;}' +
    'table.grand-box td.final{color:#0a7d32;font-size:14pt;}' +
    '</style></head><body>' + body +
    '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' +
    '</body></html>';
}

// =========================================
// PRINT REPORTS — فواتير الميزانية و عمليات التصنيع.
// Route: download=budget_print&type=invoice|manufacture&id=<key>.
// =========================================

const BUDGET_PRINT_MONTH_NAMES = [
  '', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function serveBudgetPrint_(params) {
  const type = String(params.type || '').trim();
  const pages = { invoice: 'tc_budget_invoices', manufacture: 'tc_budget_manufacture', costing: 'tc_budget_inputs', cash: 'tc_budget_cash', movement: 'tc_budget_stock_balance' };
  if (!pages[type]) return ContentService.createTextOutput('Invalid type');
  authorizeArtifact_(params, { company: '3fe1b5cb67b7223e', page: pages[type], access: 'read' });
  const id = decodeURIComponent(String(params.id || '')).trim();
  if (!id) return ContentService.createTextOutput('Invalid id');
  const dbId = getCompanySpreadsheetId_('3fe1b5cb67b7223e');
  let html = '';
  let title = 'طباعة';
  if (type === 'invoice') {
    const row = getAllRecords_(dbId, 'legal_invoices').find(function (r) {
      return String(r['رقم الفاتورة'] || '').trim() === id;
    });
    if (!row) return ContentService.createTextOutput('Invoice not found');
    html = buildInvoicePrintHtml_(row);
    title = 'فاتورة ' + id;
  } else if (type === 'manufacture') {
    const row = getAllRecords_(dbId, 'legal_manufacture').find(function (r) {
      return String(r.transaction_code || '').trim() === id;
    });
    if (!row) return ContentService.createTextOutput('Manufacture not found');
    html = buildManufacturePrintHtml_(row);
    title = 'عملية تصنيع ' + id;
  } else if (type === 'costing') {
    const header = getAllRecords_(dbId, 'legal_purchasing_costing').find(function (r) {
      const c = String(r['رقم الشهاده'] || r['الرقم'] || r['رقم الشهادة'] || r['رقم_الشهاده'] || '').trim();
      return c === id;
    });
    if (!header) return ContentService.createTextOutput('Costing not found');
    const lines = getAllRecords_(dbId, 'legal_product_purchasing').filter(function (l) {
      const lc = String(l['الرقم'] || l['رقم الشهاده'] || l['رقم الشهادة'] || l['رقم_الشهاده'] || '').trim();
      return lc === id;
    });
    html = buildCostingPrintHtml_(header, lines);
    title = 'شهادة تسعير ' + id;
  } else if (type === 'cash') {
    const row = getAllRecords_(dbId, 'legal_cash_bank_movement').find(function (r) {
      return String(r.transaction_id) === id;
    });
    if (!row) return ContentService.createTextOutput('Cash not found');
    html = buildCashReceiptHtml_(row);
    title = 'إيصال #' + id;
  } else if (type === 'movement') {
    const product = String(id);
    const rows = getAllRecords_(dbId, 'legal_products_movement').filter(function (r) {
      return String(r.product || '').trim() === product;
    });
    if (!rows.length) return ContentService.createTextOutput('Product not found');
    html = buildMovementPrintHtml_(product, rows);
    title = 'حركة ' + product;
  } else {
    return ContentService.createTextOutput('Invalid type');
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function budgetMoney_(n) {
  const v = Number(n) || 0;
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Normal display form for a date that may be a Date (a sheet cell), a
 * date-only string, or a UTC ISO datetime string.
 *
 * A sheet date cell comes back from getValues() as a Date at midnight in the
 * script timezone, which JSON-serialises to the previous day's 21:00Z — the
 * "2026-05-05T21:00:00.000Z" a raw render shows. Formatting the Date in the
 * script timezone recovers the wall date, and a value carrying a real time
 * keeps it; a date-only value stays date-only.
 */
function budgetDateDisplay_(v) {
  if (v === null || v === undefined || v === '') return '';
  var tz = 'Africa/Cairo';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var dt = Utilities.formatDate(v, tz, 'HH:mm');
    var dd = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    return dt === '00:00' ? dd : dd + ' ' + dt;
  }
  var s = String(v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) {
    /* A string that carries a zone is converted to the script timezone; a
       naked local datetime is already the wall time and is kept as written. */
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
      var zoned = new Date(s);
      if (!isNaN(zoned.getTime())) {
        var zt = Utilities.formatDate(zoned, tz, 'HH:mm');
        var zd = Utilities.formatDate(zoned, tz, 'yyyy-MM-dd');
        return zt === '00:00' ? zd : zd + ' ' + zt;
      }
    }
    return m[2] === '00:00' ? m[1] : m[1] + ' ' + m[2];
  }
  var d = new Date(s);
  if (isNaN(d.getTime())) return s;
  var t = Utilities.formatDate(d, tz, 'HH:mm');
  var day = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return t === '00:00' ? day : day + ' ' + t;
}

function buildInvoicePrintHtml_(r) {
  const esc = payrollEsc_;
  const month = Number(r['الشهر']) || 0;
  const monthName = BUDGET_PRINT_MONTH_NAMES[month] || '-';
  const taxClass = String(r['فئة الضريبة (14%/5%)'] == null ? '' : r['فئة الضريبة (14%/5%)']);
  const taxPct = taxClass === '0.05' ? '5%' : taxClass === '0.14' ? '14%' : (taxClass || '-');
  const invoiceDate = r['تاريخ الفاتورة'] || '-';
  
  const body = '' +
    '<div class="print-header">' +
    '<div class="print-title">فاتورة ضريبية رسمية</div>' +
    '<div class="print-subtitle">توب كيميكال للكيماويات</div>' +
    '</div>' +
    '<div class="print-meta">' +
    '<div class="print-meta-code">رقم الفاتورة: ' + esc(r['رقم الفاتورة']) + '</div>' +
    '</div>' +
    '<div class="print-body">' +
    '<div class="section-title">معلومات الفاتورة</div>' +
    '<table class="info">' +
    '<tr><td class="info-label">التاريخ</td><td class="info-value">' + esc(invoiceDate) + '</td></tr>' +
    '<tr><td class="info-label">الشهر / السنة</td><td class="info-value">' + esc(monthName + ' ' + (r['العام'] || '')) + '</td></tr>' +
    '<tr><td class="info-label">اسم العميل</td><td class="info-value">' + esc(r['اسم العميل']) + '</td></tr>' +
    '<tr><td class="info-label">الرقم الضريبي للعميل</td><td class="info-value">' + esc(r['رقم التسجيل الضريبي للعميل']) + '</td></tr>' +
    '</table>' +
    '<div class="section-title">تفاصيل المنتج</div>' +
    '<table class="grid">' +
    '<tr><th>كود المعاملة المباعة</th><td>' + esc(r['كود المعاملة المباعة']) + '</td></tr>' +
    '<tr><th>إسم المنتج</th><td><strong>' + esc(r['إسم المنتج']) + '</strong></td></tr>' +
    '<tr><th>كود المنتج</th><td>' + esc(r['كود المنتج']) + '</td></tr>' +
    '<tr><th>وحدة قياس المنتج</th><td>' + esc(r['وحدة قياس المنتج']) + '</td></tr>' +
    '<tr><th>كمية المنتج</th><td>' + (Number(r['كمية المنتج']) || 0) + '</td></tr>' +
    '<tr><th>سعر الوحدة</th><td>' + budgetMoney_(r['سعر الوحدة']) + '</td></tr>' +
    '<tr><th>فئة الضريبة</th><td>' + esc(taxPct) + '</td></tr>' +
    '<tr><th>المبلغ الصافي</th><td>' + budgetMoney_(r['المبلغ الصافي']) + '</td></tr>' +
    '<tr><th>قيمة الضريبة</th><td>' + budgetMoney_(r['قيمة الضريبة']) + '</td></tr>' +
    '<tr class="total"><th>الإجمالي</th><td><strong>' + budgetMoney_(r['إجمالي']) + '</strong></td></tr>' +
    '</table>' +
    '<div class="signature-section">' +
    '<div class="signature-box">' +
    '<div class="signature-title">المسؤول</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">المحاسب</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">اعتماد و ختم</div>' +
    '<div class="qr-placeholder"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '</div>' +
    '</div>';
  return budgetPrintShell_('فاتورة ضريبية - ' + esc(r['رقم الفاتورة']), body);
}

function buildManufacturePrintHtml_(r) {
  const esc = payrollEsc_;
  const profitMargin = r.profit_percent ? parseFloat(r.profit_percent) : 0;
  const profitColor = profitMargin >= 0 ? '#155724' : '#dc3545';
  
  let recipe = [];
  for (let i = 1; i <= 8; i++) {
    const it = r['item_' + i], q = r['qty_' + i];
    if (it) {
      recipe.push({
        item: esc(it),
        qty: Number(q) || 0
      });
    }
  }
  
  const body = '' +
    '<div class="print-header">' +
    '<div class="print-title">عملية تصنيع داخلي</div>' +
    '<div class="print-subtitle">توب كيميكال للكيماويات</div>' +
    '</div>' +
    '<div class="print-meta">' +
    '<div class="print-meta-code">رقم التشغيلة: ' + esc(r.transaction_code) + '</div>' +
    '</div>' +
    '<div class="print-body">' +
    '<div class="section-title">معلومات التصنيع</div>' +
    '<table class="info">' +
    '<tr><td class="info-label">الكود</td><td class="info-value">' + esc(r.code) + '</td></tr>' +
    '<tr><td class="info-label">تاريخ التصنيع</td><td class="info-value">' + esc(r.manufacture_date) + '</td></tr>' +
    '<tr><td class="info-label">رقم التشغيلة</td><td class="info-value">' + esc(r.manufcture_number) + '</td></tr>' +
    '<tr><td class="info-label">المنتج المنتج</td><td class="info-value"><strong>' + esc(r.produced_product) + '</strong></td></tr>' +
    '<tr><td class="info-label">الكمية المنتجة</td><td class="info-value">' + (Number(r.manufactured_qty) || 0) + '</td></tr>' +
    '<tr><td class="info-label">كمية المخلفات</td><td class="info-value">' + (Number(r.dep_qty) || 0) + '</td></tr>' +
    '<tr><td class="info-label">صافي الكمية</td><td class="info-value">' + (Number(r.net_qty) || 0) + '</td></tr>' +
    '<tr><td class="info-label">نسبة الربح</td><td class="info-value" style="color:' + profitColor + ';font-weight:800;">' + (profitMargin >= 0 ? '+' : '') + profitMargin + '%</td></tr>' +
    '</table>' +
    '<div class="section-title">المكونات الرئيسية</div>' +
    '<table class="grid">' +
    recipe.map(function(item, idx) {
      return '<tr>' +
        '<th>مادة ' + (idx + 1) + '</th>' +
        '<td>' + item.item + '</td>' +
        '<th>الكمية</th>' +
        '<td style="color:#1e3c72;font-weight:600;">' + item.qty + '</td>' +
        '</tr>';
    }).join('') +
    '</table>' +
    '<div class="info-section" style="display:flex;justify-content:space-between;align-items:center;margin:12mm 0;">' +
    '<div style="text-align:center;flex:1;padding:6mm;background:linear-gradient(135deg,#f8f9fa,#e9ecef);border-radius:4px;">' +
      '<div class="info-label">إجمالي التكاليف</div>' +
      '<div class="info-value" style="color:#dc3545;font-size:16pt;font-weight:800;">' + budgetMoney_(r.total_cost) + '</div>' +
    '</div>' +
    '<div style="text-align:center;flex:1;padding:6mm;background:linear-gradient(135deg,#f8f9fa,#e9ecef);border-radius:4px;margin:0 6mm;">' +
      '<div class="info-label">قيمة المبيعات</div>' +
      '<div class="info-value" style="color:#155724;font-size:16pt;font-weight:800;">' + budgetMoney_(r.sales_amount) + '</div>' +
    '</div>' +
    '<div style="text-align:center;flex:1;padding:6mm;background:linear-gradient(135deg,#f8f9fa,#e9ecef);border-radius:4px;">' +
      '<div class="info-label">سعر البيع للوحدة</div>' +
      '<div class="info-value" style="color:#0c5460;font-size:16pt;font-weight:800;">' + budgetMoney_(r.sales_price) + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="section-title">مواعيد التنفيذ</div>' +
    '<table class="info">' +
    '<tr><td class="info-label">تاريخ البدء</td><td class="info-value">' + esc(r.start_date) + '</td></tr>' +
    '<tr><td class="info-label">تاريخ الانتهاء</td><td class="info-value">' + esc(r.end_date) + '</td></tr>' +
    '</table>' +
    '<div class="signature-section">' +
    '<div class="signature-box">' +
    '<div class="signature-title">مسؤول الجودة</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">مدير الإنتاج</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">اعتماد و ختم</div>' +
    '<div class="qr-placeholder"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '</div>' +
    '</div>';
  return budgetPrintShell_('عملية تصنيع - ' + esc(r.transaction_code), body);
}

function buildCostingPrintHtml_(h, lines) {
  const esc = payrollEsc_;
  let totalQty = 0;
  let totalCost = 0;
  let totalSales = 0;

  const rows = lines.map(function (l) {
    const q = Number(l['الكمية']) || 0;
    const c = Number(l['قيمة التكلفة']) || 0;
    const s = Number(l['سعر البيع']) || Number(l['قيمة البيع']) || 0;
    const unitCost = q > 0 ? (c / q) : (Number(l['تكلفة الوحدة']) || 0);
    totalQty += q;
    totalCost += c;
    totalSales += s;

    return '<tr>' +
      '<td>' + esc(l['كود المعاملة'] || '-') + '</td>' +
      '<td><strong>' + esc(l['المادة'] || '-') + '</strong></td>' +
      '<td>' + esc(l['تفاصيل بند'] || h['اسم_المورد'] || '-') + '</td>' +
      '<td>' + esc(l['نوع البند'] || (h['نوع الشحن'] === 'محلي' ? 'محلي' : 'مستورد')) + '</td>' +
      '<td style="text-align:center;">' + (q ? q.toLocaleString('en-US') : '0') + '</td>' +
      '<td style="text-align:left;" style="color:#1e3c72;font-weight:600;">' + budgetMoney_(unitCost) + '</td>' +
      '<td style="text-align:left;" style="color:#155724;font-weight:600;">' + budgetMoney_(c) + '</td>' +
      '<td style="text-align:left;" style="color:#0c5460;font-weight:600;">' + budgetMoney_(s) + '</td>' +
      '<td>' + esc(l['المعاملة'] || 'مشتريات') + '</td>' +
      '<td>' + esc(l['تاريخ الانتاج'] || '-') + '</td>' +
      '<td>' + esc(l['تاريخ الانتهاء'] || '-') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="11" style="text-align:center;">لا توجد بنود مرتبطة</td></tr>';

  const certNo = esc(h['رقم الشهاده'] || h['الرقم'] || '-');
  const body = '' +
    '<div class="print-header">' +
    '<div class="print-title">شهادة تسعير وتكاليف المشتريات</div>' +
    '<div class="print-subtitle">توب كيميكال للكيماويات</div>' +
    '</div>' +
    '<div class="print-meta">' +
    '<div class="print-meta-code">شهادة رقم: ' + certNo + '</div>' +
    '</div>' +
    '<div class="print-body">' +
    '<div class="section-title">معلومات الشهادة</div>' +
    '<table class="info">' +
    '<tr><td class="info-label">رقم الشهادة</td><td class="info-value">' + certNo + '</td></tr>' +
    '<tr><td class="info-label">تاريخ الإفراج</td><td class="info-value">' + esc(h['تاريخ الافراج'] || '-') + '</td></tr>' +
    '<tr><td class="info-label">الصنف</td><td class="info-value">' + esc(h['الصنف'] || '-') + '</td></tr>' +
    '<tr><td class="info-label">نوع الشهادة</td><td class="info-value">' + esc(h['نوع الشهادة'] || '-') + '</td></tr>' +
    '<tr><td class="info-label">نوع الشحن</td><td class="info-value">' + esc(h['نوع الشحن'] || '-') + '</td></tr>' +
    '<tr><td class="info-label">المورد</td><td class="info-value">' + esc(h['اسم_المورد'] || '-') + '</td></tr>' +
    '<tr><td class="info-label">القيمة بالعملة الأصلية</td><td class="info-value">' + budgetMoney_(h['القيمه بالدولار']) + '</td></tr>' +
    '<tr><td class="info-label">سعر الصرف</td><td class="info-value">' + esc(h['سعر الصرف'] || '-') + '</td></tr>' +
    '<tr><td class="info-label">القيمة بالسعر المعلن</td><td class="info-value">' + budgetMoney_(h['القيمه بالسعر المعلن']) + '</td></tr>' +
    '</table>' +
    '<div class="info-section" style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="text-align:center;flex:1;">' +
      '<div class="info-label">إجمالي التكاليف</div>' +
      '<div class="info-value" style="color:#155724;font-size:16pt;font-weight:800;">' + budgetMoney_(h['اجمالي التكاليف']) + '</div>' +
    '</div>' +
    '<div style="text-align:center;flex:1;">' +
      '<div class="info-label">المبيعات المحسوبة</div>' +
      '<div class="info-value" style="color:#0c5460;font-size:16pt;font-weight:800;">' + budgetMoney_(h['المبيعات']) + '</div>' +
    '</div>' +
    '<div style="text-align:center;flex:1;">' +
      '<div class="info-label">البنك المرتبط</div>' +
      '<div class="info-value">' + esc(h['البنك المرتبط'] || '-') + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="section-title">بنود المنتجات المرتبطة بالشهادة</div>' +
    '<table class="grid">' +
    '<thead><tr style="background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff;">' +
      '<th>كود المعاملة</th><th>المادة</th><th>تفاصيل البند</th><th>نوع البند</th><th>الكمية</th><th>تكلفة الوحدة</th><th>قيمة التكلفة</th><th>سعر البيع</th><th>المعاملة</th><th>تاريخ الإنتاج</th><th>تاريخ الانتهاء</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '<tfoot><tr class="total">' +
      '<th colspan="4">الإجمالي الكلي للبنود</th>' +
      '<td style="text-align:center;">' + totalQty.toLocaleString('en-US') + '</td>' +
      '<td>-</td>' +
      '<td style="text-align:left;font-weight:800;color:#155724;">' + budgetMoney_(totalCost) + '</td>' +
      '<td style="text-align:left;font-weight:800;color:#0c5460;">' + budgetMoney_(totalSales) + '</td>' +
      '<td colspan="3"></td>' +
    '</tr></tfoot>' +
    '</table>' +
    '<div class="signature-section">' +
    '<div class="signature-box">' +
    '<div class="signature-title">المسؤول / المحاسب</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">المدير المالي</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">اعتماد و ختم</div>' +
    '<div class="qr-placeholder"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '</div>' +
    '</div>';
  return budgetPrintShell_('شهادة تسعير رقم ' + certNo, body);
}

function buildCashReceiptHtml_(r) {
  const esc = payrollEsc_;
  const amountColor = r.transaction_type === 'Debit' ? '#155724' : '#dc3545';
  const amountLabel = r.transaction_type === 'Debit' ? 'التحصيل' : 'الدفع';
  
  const body = '' +
    '<div class="print-header">' +
    '<div class="print-title">إيصال حركة صندوق رسمي</div>' +
    '<div class="print-subtitle">توب كيميكال للكيماويات</div>' +
    '</div>' +
    '<div class="print-meta">' +
    '<div class="print-meta-code">رقم المعاملة: ' + esc(r.transaction_id) + '</div>' +
    '</div>' +
    '<div class="print-body">' +
    '<div class="section-title">معلومات الحركة</div>' +
    '<table class="info">' +
    '<tr><td class="info-label">التاريخ</td><td class="info-value">' + esc(r.transaction_date) + '</td></tr>' +
    '<tr><td class="info-label">الاسم</td><td class="info-value">' + esc(r.name) + '</td></tr>' +
    '<tr><td class="info-label">التفاصيل</td><td class="info-value">' + esc(r.transaction_details) + '</td></tr>' +
    '<tr><td class="info-label">النوع</td><td class="info-value">' + esc(r.transaction_type) + '</td></tr>' +
    '<tr><td class="info-label">الصندوق</td><td class="info-value">' + esc(r.related_box) + '</td></tr>' +
    '<tr><td class="info-label">طريقة الدفع</td><td class="info-value">' + esc(r.transaction_method) + '</td></tr>' +
    '<tr><td class="info-label">كود الحساب</td><td class="info-value">' + esc(r.chart_code) + '</td></tr>' +
    '</table>' +
    '<div class="section-title">المالية</div>' +
    '<table class="grid">' +
    '<tr><th>المبلغ الأساسي</th><td style="color:' + amountColor + ';font-weight:800;">' + budgetMoney_(r.transaction_amount) + ' (' + amountLabel + ')</td></tr>' +
    '<tr><th>الخصم</th><td>' + budgetMoney_(r.total_discount) + '</td></tr>' +
    '<tr><th>الضرائب</th><td>' + budgetMoney_(r.taxes) + '</td></tr>' +
    '<tr><th>الصافي</th><td style="color:' + amountColor + ';font-weight:800;">' + budgetMoney_(r.net_amount) + '</td></tr>' +
    '<tr><th>الإجمالي</th><td style="color:' + amountColor + ';font-weight:800;">' + budgetMoney_(r.total) + '</td></tr>' +
    '</table>' +
    '<div class="info-section">' +
    '<div class="info-label">حالة الاعتماد:</div>' +
    '<div class="info-value" style="color:' + (r.approved === 'true' || r.approved === true ? '#155724' : '#dc3545') + ';font-weight:800;">' + (r.approved === 'true' || r.approved === true ? 'معتمدة' : 'غير معتمدة') + '</div>' +
    '</div>' +
    '<div class="signature-section">' +
    '<div class="signature-box">' +
    '<div class="signature-title">المسؤول</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">المحاسب</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">اعتماد و ختم</div>' +
    '<div class="qr-placeholder"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '</div>' +
    '</div>';
  return budgetPrintShell_('إيصال صندوق - ' + esc(r.transaction_id), body);
}

function buildMovementPrintHtml_(product, rows) {
  const esc = payrollEsc_;
  
  // Calculate summary totals
  const summary = {
    totalIn: 0,
    totalOut: 0,
    transactions: 0
  };
  
  const grid = rows.map(function (r) {
    const qty = Math.abs(Number(r.qty)) || 0;
    const sign = Number(r.transaction_sign);
    const inQty = sign > 0 ? qty : 0;
    const outQty = sign < 0 ? qty : 0;
    
    summary.totalIn += inQty;
    summary.totalOut += outQty;
    summary.transactions++;
    
    return '<tr>' +
      '<td>' + esc(r.transaction_code || '-') + '</td>' +
      '<td><strong>' + esc(r.transaction_type || '-') + '</strong></td>' +
      '<td>' + esc(budgetDateDisplay_(r.transaction_date) || '-') + '</td>' +
      '<td style="color:#155724;font-weight:600;" >' + (inQty || 0) + '</td>' +
      '<td style="color:#dc3545;font-weight:600;" >' + (outQty || 0) + '</td>' +
      '</tr>';
  }).join('');
  
  const body = '' +
    '<div class="print-header">' +
    '<div class="print-title">حركة صنف مستودع</div>' +
    '<div class="print-subtitle">توب كيميكال للكيماويات</div>' +
    '</div>' +
    '<div class="print-meta">' +
    '<div class="print-meta-code">كود الصنف: ' + esc(product) + '</div>' +
    '</div>' +
    '<div class="print-body">' +
    '<div class="info-section" style="display:flex;justify-content:space-between;align-items:center;margin:12mm 0;padding:8mm;background:linear-gradient(135deg,#f8f9fa,#e9ecef);border-radius:4px;">' +
    '<div style="text-align:center;flex:1;">' +
      '<div class="info-label">إجمالي الواردات</div>' +
      '<div class="info-value" style="color:#155724;font-size:16pt;font-weight:800;">' + summary.totalIn + '</div>' +
    '</div>' +
    '<div style="text-align:center;flex:1;">' +
      '<div class="info-label">إجمالي الصادرات</div>' +
      '<div class="info-value" style="color:#dc3545;font-size:16pt;font-weight:800;">' + summary.totalOut + '</div>' +
    '</div>' +
    '<div style="text-align:center;flex:1;">' +
      '<div class="info-label">عدد المعاملات</div>' +
      '<div class="info-value" style="color:#1e3c72;font-size:16pt;font-weight:800;">' + summary.transactions + '</div>' +
    '</div>' +
    '</div>' +
    '<div class="section-title">تفاصيل الحركة</div>' +
    '<table class="grid" style="margin-bottom:8mm;">' +
    '<thead style="background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff;">' +
      '<tr>' +
      '<th>كود المعاملة</th>' +
      '<th>النوع</th>' +
      '<th>التاريخ</th>' +
      '<th style="color:#155724;">وارد</th>' +
      '<th style="color:#dc3545;">صادر</th>' +
      '</tr>' +
    '</thead>' +
    '<tbody>' + grid + '</tbody>' +
    '</table>' +
    '<div class="signature-section">' +
    '<div class="signature-box">' +
    '<div class="signature-title">المستودع</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">مسؤول الجودة</div>' +
    '<div class="signature-line"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '<div class="signature-box">' +
    '<div class="signature-title">اعتماد و ختم</div>' +
    '<div class="qr-placeholder"></div>' +
    '<div class="signature-name">__________________</div>' +
    '</div>' +
    '</div>' +
    '</div>';
  return budgetPrintShell_('حركة صنف - ' + esc(product), body);
}

function budgetPrintShell_(title, body) {
  return '' +
    '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><title>' + payrollEsc_(title) + '</title><style>' +
    '@page{size:A4 portrait;margin:12mm;}' +
    '@media print{body{-webkit-print-color-adjust:exact;}}' +
    '@page{margin:20mm;}' +
    'html{font-size:10pt;}' +
    'body{margin:0;padding:0;font-family:"Segoe UI","Arial",sans-serif;color:#2c3e50;direction:rtl;background:#fff;}' +
    '.print-container{max-width:700px;margin:0 auto;background:#fff;}' +
    '.print-header{background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff;padding:12mm 0;text-align:center;border-bottom:3px solid #fff;}' +
    '.print-logo{width:120px;height:40px;margin:0 auto 4px;background:#fff;border-radius:4px;}' +
    '.print-title{font-size:16pt;font-weight:900;margin:0;letter-spacing:-0.5px;}' +
    '.print-subtitle{font-size:12pt;margin:2px 0;font-weight:300;}' +
    '.print-meta{background:#f8f9fa;padding:4mm 8mm;border-bottom:2px solid #e9ecef;text-align:center;}' +
    '.print-meta-code{font-size:14pt;font-weight:700;color:#495057;letter-spacing:1px;}' +
    '.print-body{padding:6mm 8mm;}' +
    'table.info{width:100%;border-collapse:collapse;margin-bottom:8mm;background:#fff;}' +
    'table.info td,table.info th{border:1px solid #dee2e6;padding:3mm 4mm;text-align:right;vertical-align:middle;}' +
    'table.info th{background:#f8f9fa;color:#495057;font-weight:700;letter-spacing:0.5px;}' +
    'table.info td{background:#fff;}' +
    'table.grid{width:100%;border-collapse:collapse;margin:6mm 0;background:#fff;}' +
    'table.grid th,table.grid td{border:1px solid #dee2e6;padding:3mm 4mm;text-align:right;vertical-align:middle;}' +
    'table.grid th{background:#f8f9fa;color:#495057;font-weight:700;letter-spacing:0.5px;}' +
    'table.grid td{background:#fff;}' +
    'table.grid tr:nth-child(even) td{background:#f8f9fa;}' +
    'tr.total{background:linear-gradient(135deg,#d4edda,#c3e6cb)!important;}' +
    'tr.total td,tr.total th{border:2px solid #155724;font-weight:800;color:#155724;}' +
    'h3{margin:8mm 0 4mm;font-size:14pt;color:#1e3c72;font-weight:800;letter-spacing:0.5px;border-bottom:2px solid #e9ecef;padding-bottom:2px;}' +
    '.info-section{background:#f8f9fa;padding:6mm;border-radius:4px;margin:8mm 0;}' +
    '.info-label{font-weight:700;color:#6c757d;margin-bottom:2px;letter-spacing:0.5px;}' +
    '.info-value{font-size:13pt;color:#212529;}' +
    '.section-title{background:linear-gradient(135deg,#17a2b8,#138496);color:#fff;padding:3mm 6mm;border-radius:4px;margin:8mm 0 4mm;letter-spacing:0.5px;}' +
    '.signature-section{margin-top:20mm;padding-top:8mm;border-top:2px solid #dee2e6;display:flex;justify-content:space-between;align-items:flex-end;}' +
    '.signature-box{width:30%;text-align:center;padding:4mm;background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;}' +
    '.signature-title{font-size:11pt;font-weight:700;color:#6c757d;margin-bottom:2px;letter-spacing:0.5px;}' +
    '.signature-line{height:2px;background:#dee2e6;margin:4px 0;}' +
    '.signature-name{font-size:12pt;font-weight:700;color:#495057;}' +
    '.company-info{text-align:center;font-size:10pt;color:#6c757d;margin:8mm 0;}' +
    '.qr-placeholder{width:60px;height:60px;background:#f8f9fa;border:1px solid #dee2e6;margin:0 auto 4px;}' +
    '@media print{.no-print{display:none;}}' +
    '</style></head><body>' +
    '<div class="print-container">' + body + 
    '<div class="company-info">توب كيميكال © 2026 | نظام إدارة المحاسبة</div>' +
    '</div>' +
    '<script>window.onload=function(){setTimeout(function(){window.print();window.close();},500);};</script>' +
    '</body></html>';
}

function kv_(k, v) {
  return '<tr><th>' + payrollEsc_(k) + '</th><td>' + payrollEsc_(v == null ? '' : v) + '</td></tr>';
}

TopChemical.attachmentPolicy_ = function () { return {
  tc_products: { company: '3fe1b5cb67b7223e', sheet: 'products', idField: 'id', fileFields: ['print_file'], folder: 'products_Files_' },
  tc_registration_papers: { company: '3fe1b5cb67b7223e', sheet: 'registration_papers', idField: 'document_number', fileFields: ['document_file'], folder: 'registration_papers 2_Files_', legacyFolders: ['registration_papers_Files_', 'registration_papers_Images', 'registration_papers 2_Images'], folderAliases: { registration_papers_Files_: 'registration_papers 2_Files_' } },
  tc_carton_sizes: { company: '3fe1b5cb67b7223e', sheet: 'purchasing_support_data', idField: 'id', fileFields: ['document'], folder: 'purchasing_support_data_Images' },
  tc_import_follow: { company: '3fe1b5cb67b7223e', sheet: 'legal_importation_follow', idField: 'id', fileFields: ['porforma_file', 'swift_file', 'approval_1', 'approval_2', 'approval_3'], folder: 'legal_importation_follow_Files_', folderByField: { approval_1: 'legal_importation_follow_Images', approval_2: 'legal_importation_follow_Images', approval_3: 'legal_importation_follow_Images' } },
  tc_budget_inputs: { company: '3fe1b5cb67b7223e', sheet: 'legal_purchasing_costing', idField: 'رقم الشهاده', fileFields: ['invoice_swift'], folder: 'legal_purchasing_costing_Files_', altSheets: [{ sheet: 'legal_product_purchasing', idField: 'كود المعاملة', fileFields: ['شهادة_تحليل_ان_وجد', 'ترخيص_بالافراج_الزراعي', 'صورة الافراج', 'صورة التسجيل'], folder: 'legal_product_purchasing_Files_' }] },
  tc_budget_manufacture: { company: '3fe1b5cb67b7223e', sheet: 'legal_manufacture', idField: 'transaction_code', fileFields: ['analysis_certificate', 'sales_permit', 'technical_permit', 'registration'], folder: 'legal_manufacture_Files_', folderByField: { analysis_certificate: 'manufacture_Images', sales_permit: 'manufacture_Images', technical_permit: 'manufacture_Images' } },
  tc_customs_office: { company: '3fe1b5cb67b7223e', sheet: 'مكتب الجمارك', idField: '', fileFields: ['تكليف المطالبة', 'تخليص الشحنة'], folder: 'customs_office_Files_', legacyFolders: ['مكتب الجماركFiles'], folderByField: { 'تكليف المطالبة': 'customs_office_Files_', 'تخليص الشحنة': 'customs_office_Files_', claim_assignment: 'customs_office_Files_', shipment_clearance: 'customs_office_Files_' } }
}; };
TopChemical.artifactHandlers_ = {
  printFile: function (params) { return servePrintFile_(params); },
  printBarcode: function (params) { return servePrintBarcode_(params); },
  printProductBarcode: function (params) { return servePrintProductBarcode_(params); },
  payrollReport: function (params) { return servePayrollReport_(params); },
  budgetPrint: function (params) { return serveBudgetPrint_(params); },
  customsOfficePathRepair: function (payload, sessionToken, authUser) { return customsOfficePathRepair_(payload, sessionToken, authUser); }
};
TopChemical.approvalPolicy_ = TopChemical.approvalPolicy_ = {
  aliases: { payroll: 'payroll_month', tc_payroll_month: 'payroll_month' },
  chains: [],
  transitions: {
    tc_legal_cash: { false: ['true'], true: ['false'] },
    payroll_month: { open: ['closed'], closed: [] },
    payroll: { open: ['closed'], closed: [] },
    tc_payroll_month: { open: ['closed'], closed: [] }
  },
  actionToDocType: {
    add_legal_costing: 'tc_costing', add_legal_costing_bundle: 'tc_costing', edit_legal_costing_bundle: 'tc_costing', delete_legal_costing: 'tc_costing',
    add_legal_cash: 'tc_legal_cash', toggle_legal_cash_approved: 'tc_legal_cash', close_payroll_month: 'payroll_month'
  },
  statusOnly: { toggle_legal_cash_approved: true, close_payroll_month: true, delete_legal_costing: true }
};
if (typeof module !== 'undefined' && module.exports) module.exports = TopChemical.boxEngine_;

function servePrintFile_(params) {
  const artifact = authorizeArtifact_(params, { company: '3fe1b5cb67b7223e', page: 'tc_products', access: 'read' });
  const company = artifact.company;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return ContentService.createTextOutput('Invalid id');

  const dbId = getCompanySpreadsheetId_(company);
  const product = (function () { var _idx = indexById(getAllRecords_(dbId, 'products'), 'id'); var _k = String(id).trim(); return _idx.get(_k) || _idx.get(_k.toLowerCase()) || null; })();
  if (!product || (!product.print_file && !product.print_file_id)) return ContentService.createTextOutput('Not found');

  var file;
  try { file = attachmentOpenFile_(product, 'print_file', attachmentRegistry_().tc_products); }
  catch (e) { return ContentService.createTextOutput(e.message || 'تعذر فتح المرفق.'); }

  return dataUriDownloadHtml_(file.getName(), file.getBlob());
}
function servePrintBarcode_(params) {
  const artifact = authorizeArtifact_(params, { company: '3fe1b5cb67b7223e', page: 'tc_barcode', access: 'read' });
  const company = artifact.company;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return ContentService.createTextOutput('Invalid id');

  const dbId = getCompanySpreadsheetId_(company);
  const row = (function () { var _idx = indexById(getAllRecords_(dbId, 'top_chemical_barcode_generator'), 'id'); var _k = String(id).trim(); return _idx.get(_k) || _idx.get(_k.toLowerCase()) || null; })();
  if (!row) return ContentService.createTextOutput('Not found');

  let data = '';
  const m = String(row.display_barcode || '').match(/data=([^&]+)/);
  if (m) { try { data = decodeURIComponent(m[1]); } catch (e) { data = m[1]; } }
  if (!data) data = barcodeDataFromRecord_(row);

  const imgUrl = 'https://barcode.tec-it.com/barcode.ashx?data=' +
    encodeURIComponent(data) + '&code=Code128&dpi=300';
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const cell =
    '<td style="width:33.33%;height:40mm;border:0.5px dashed #999;text-align:center;vertical-align:middle;padding:0.5mm;">' +
    '<img src="' + esc(imgUrl) + '" alt="باركود" style="max-width:92%;max-height:27mm;height:auto;">' +
    '<div style="margin-top:0.5mm;font-size:8.5pt;font-weight:700;letter-spacing:0.5px;word-break:break-all;line-height:1.2;">' + esc(data) + '</div>' +
    '</td>';
  let rowsHtml = '';
  for (let r = 0; r < 6; r++) { rowsHtml += '<tr>' + cell + cell + cell + '</tr>'; }
  const html =
    '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><title>باركود الإنتاج #' + id + '</title>' +
    '<style>' +
    '@page{size:A4 portrait;margin:3mm;}' +
    'html,body{margin:0;padding:0;font-family:sans-serif;}' +
    'table.labels{width:100%;height:240mm;table-layout:fixed;border-collapse:collapse;}' +
    'tr{page-break-inside:avoid;}' +
    '</style></head>' +
    '<body><table class="labels">' + rowsHtml + '</table>' +
    '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' +
    '</body></html>';
  return _frame(HtmlService.createHtmlOutput(html)).setTitle('باركود الإنتاج #' + id);
}

/** Recomputed barcode data from a stored row (fallback when display_barcode missing). */
function barcodeDataFromRecord_(rec) {
  const pad = function (n) { return ('0' + n).slice(-2); };
  let d = null;
  const raw = rec.production_date;
  if (raw instanceof Date) { d = raw; } else {
    const s = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    d = s ? new Date(Number(s[1]), Number(s[2]) - 1, Number(s[3])) : (raw ? new Date(raw) : null);
  }
  if (!d || isNaN(d.getTime())) d = new Date();
  const sysId = String(rec.system_id == null ? '' : rec.system_id).trim();
  return String(rec.id) + pad(d.getFullYear() % 100) + String(rec.emp_id) +
    pad(d.getMonth() + 1) + String(rec.production_id) + pad(d.getDate()) + sysId;
}

/**
 * Print ONE product's warehouse barcode as a full A4 label sheet — the same
 * 3×6 repeat grid as the production print (servePrintBarcode_ above), because
 * both feed the same label paper: 18 identical labels of a single product,
 * cut apart and stuck on that product's containers.
 *
 * Reached from a row action on tc_products. It replaces the one-label-per-
 * product sheet that used to hang off tc_stock_scan — a whole-catalogue print
 * is not what anyone needs at a shelf; relabelling one product is.
 *
 * The label carries NOTHING but the barcode and its number: no product name,
 * not on the sticker and not in the document title either, because a browser
 * printing with headers on would put that title straight onto the paper.
 *
 * Encoded is 'TCP-' + product id; printed underneath is the bare id. The two
 * agree — handleScannedCode in Company_TopChemical_StockScan.html takes either
 * form, so a scan and a hand-typed number land on the same product. The prefix
 * stays in the encoded value on purpose: it is what marks a code as OUR label,
 * so a supplier's numeric barcode on the same carton cannot be scanned during a
 * count and silently resolve to some unrelated product id.
 *
 * The id is a pure function of the product, nothing is read from a stored
 * barcode column because none exists.
 *
 * Params: download=print_product_barcode, id=<product id>,
 * sessionToken=<valid token>, company=<uid> (optional).
 */
function servePrintProductBarcode_(params) {
  const artifact = authorizeArtifact_(params, { company: '3fe1b5cb67b7223e', page: 'tc_products', access: 'read' });
  const company = artifact.company;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return ContentService.createTextOutput('Invalid id');

  /* Nothing off the product row is printed any more, but it is still looked up:
     it is the only thing standing between a mistyped id and a sheet of 18
     labels for a product that does not exist. */
  const dbId = getCompanySpreadsheetId_(company);
  const product = (function () { var _idx = indexById(getAllRecords_(dbId, 'products'), 'id'); var _k = String(id).trim(); return _idx.get(_k) || _idx.get(_k.toLowerCase()) || null; })();
  if (!product) return ContentService.createTextOutput('Not found');

  const data = 'TCP-' + id;
  /* hidehrt suppresses the generator's own caption. Left on, it draws the
     encoded value — 'TCP-12' — under the bars, and the sticker would carry
     that on top of the plain number printed below. The number is set here
     instead so the label reads as digits and nothing else. */
  const imgUrl = 'https://barcode.tec-it.com/barcode.ashx?data=' +
    encodeURIComponent(data) + '&code=Code128&dpi=300&hidehrt=True';
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const human = String(id);
  const cell =
    '<td style="width:33.33%;height:40mm;border:0.5px dashed #999;text-align:center;vertical-align:middle;padding:0.5mm;">' +
    '<img src="' + esc(imgUrl) + '" alt="باركود" style="max-width:92%;max-height:28mm;height:auto;">' +
    '<div style="margin-top:0.5mm;font-size:10pt;font-weight:700;letter-spacing:1px;">' + esc(human) + '</div>' +
    '</td>';
  let rowsHtml = '';
  for (let r = 0; r < 6; r++) { rowsHtml += '<tr>' + cell + cell + cell + '</tr>'; }
  const title = 'باركود الصنف رقم ' + id;
  const html =
    '<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
    '<style>' +
    '@page{size:A4 portrait;margin:3mm;}' +
    'html,body{margin:0;padding:0;font-family:sans-serif;}' +
    'table.labels{width:100%;height:240mm;table-layout:fixed;border-collapse:collapse;}' +
    'tr{page-break-inside:avoid;}' +
    '</style></head>' +
    '<body><table class="labels">' + rowsHtml + '</table>' +
    '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' +
    '</body></html>';
  return _frame(HtmlService.createHtmlOutput(html)).setTitle(title);
}

function customsOfficePathPreview_(raw) {
  var TARGET = 'customs_office_Files_';
  var LEGACY_IMAGES = 'مكتب الجمارك_Images';
  var LEGACY_FILES = 'مكتب الجمارك_Files_';
  var s = raw == null ? '' : String(raw);
  var t = s.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
  if (!t) return { action: 'blank', newRef: '', reason: 'blank' };
  var c0 = t.charAt(0);
  if (c0 === '=' || c0 === '+' || c0 === '-' || c0 === '@') return { action: 'malformed', newRef: '', reason: 'formula' };
  if (t.indexOf('://') !== -1) return { action: 'skip', newRef: '', reason: 'url' };
  if (/\/d\/[A-Za-z0-9_-]+/.test(t)) return { action: 'skip', newRef: '', reason: 'drive-id-url' };
  if (/^[A-Za-z0-9_-]{20,}$/.test(t)) return { action: 'skip', newRef: '', reason: 'drive-id' };
  if (t.indexOf('&#x20;') !== -1) return { action: 'malformed', newRef: '', reason: 'encoded-space' };
  if (t.indexOf('customs_office_Files_/') === 0) {
    var rest0 = t.slice('customs_office_Files_/'.length);
    if (!rest0 || rest0.indexOf('/') !== -1 || rest0 === '.' || rest0 === '..') return { action: 'malformed', newRef: '', reason: 'bad-target-shape' };
    return { action: 'already-correct', newRef: '', reason: 'already-correct' };
  }
  var slash = t.indexOf('/');
  if (slash <= 0) return { action: 'malformed', newRef: '', reason: 'no-folder-prefix' };
  var folder = t.slice(0, slash);
  var filename = t.slice(slash + 1);
  if (!filename || filename.indexOf('/') !== -1 || filename === '.' || filename === '..') return { action: 'malformed', newRef: '', reason: 'bad-path-shape' };
  if (folder === LEGACY_IMAGES || folder === LEGACY_FILES) return { action: 'rewrite', newRef: TARGET + '/' + filename, reason: folder, filename: filename };
  return { action: 'unexpected', newRef: '', reason: 'unknown-folder:' + folder };
}
function customsOfficePathRepair_(payload, sessionToken, authUser) {
  payload = payload || {};
  var user = authUser || null;
  if (!user && sessionToken) { try { var a = authenticateSystemUser_(String(sessionToken).trim()); if (a && a.authorized) user = a.user; } catch (e) {} }
  if (!(user && user.isSuperAdmin)) throw new Error('صلاحية غير كافية؛ يلزم تشغيل الترحيل من جلسة مدير النظام المصادق عليها.');
  var dryRun = !(payload.dryRun === false || String(payload.dryRun).toLowerCase() === 'false');
  var offset = Math.max(0, Number(payload.offset) || 0);
  var limit = Math.max(1, Math.min(500, Number(payload.limit) || 500));
  var TARGET = 'customs_office_Files_';
  var FIELDS = ['تكليف المطالبة', 'تخليص الشحنة'];
  var reg = attachmentRegistry_();
  var cfg = reg['tc_customs_office'];
  if (!cfg) throw new Error('missing tc_customs_office registry entry');
  var stat = { sheet: cfg.sheet, targetFolder: TARGET, dryRun: dryRun, offset: offset, limit: limit, totalCells: 0, blank: 0, alreadyCorrect: 0, legacyImages: 0, legacyFiles: 0, wouldRewrite: 0, malformed: 0, unexpected: 0, skippedUrlOrId: 0, missingInTarget: 0, conflicts: 0, updated: 0, backupSheet: '', errors: [], exceptions: [], verification: null, nextOffset: null, blocked: false, blockReason: '' };
  try {
    var targetFolderId = findDriveFolderIdByName_(TARGET);
    if (!targetFolderId) {
      stat.blocked = true;
      stat.blockReason = 'target Drive folder missing, duplicated or inaccessible: ' + TARGET;
      stat.exceptions.push(stat.blockReason);
      return { status: 'blocked', summary: stat };
    }
    var dbId = getCompanySpreadsheetId_(cfg.company);
    var sheet = getSheet_(cfg.sheet, dbId);
    var headers = getHeaders_(sheet).map(function (h) { return String(h == null ? '' : h).trim(); });
    var lower = headers.map(function (h) { return String(h).toLowerCase(); });
    var colIdx = {};
    lower.forEach(function (h, i) { if (h && !(h in colIdx)) colIdx[h] = i; });
    var fieldCols = [];
    FIELDS.forEach(function (ff) {
      var k = String(ff).toLowerCase();
      if (!(k in colIdx)) stat.errors.push('source column missing: ' + ff);
      else fieldCols.push({ field: ff, col: colIdx[k] });
    });
    if (stat.errors.length) { stat.blocked = true; stat.blockReason = 'required column missing'; return { status: 'blocked', summary: stat }; }
    var idColKey = String(cfg.idField || 'customs_uid').toLowerCase();
    var idCol = (idColKey in colIdx) ? colIdx[idColKey] : -1;
    var values = sheet.getDataRange().getValues();
    var startRow = 1 + offset;
    var endRow = Math.min(values.length, startRow + limit);
    var candidates = [];
    for (var r = startRow; r < endRow; r++) {
      for (var f = 0; f < fieldCols.length; f++) {
        var fc = fieldCols[f];
        var raw = values[r] ? values[r][fc.col] : '';
        stat.totalCells++;
        var prev = customsOfficePathPreview_(raw);
        var keyVal = idCol >= 0 ? String(values[r][idCol] == null ? '' : values[r][idCol]).trim() : '';
        if (prev.action === 'blank') { stat.blank++; continue; }
        if (prev.action === 'already-correct') { stat.alreadyCorrect++; continue; }
        if (prev.action === 'skip') { stat.skippedUrlOrId++; stat.exceptions.push('row ' + (r + 1) + ' ' + fc.field + ': skipped ' + prev.reason); continue; }
        if (prev.action === 'malformed') { stat.malformed++; stat.exceptions.push('row ' + (r + 1) + ' ' + fc.field + ': malformed (' + prev.reason + ')'); continue; }
        if (prev.action === 'unexpected') { stat.unexpected++; stat.exceptions.push('row ' + (r + 1) + ' ' + fc.field + ': ' + prev.reason); continue; }
        if (prev.action === 'rewrite') {
          if (prev.reason === 'مكتب الجمارك_Images') stat.legacyImages++;
          else stat.legacyFiles++;
          stat.wouldRewrite++;
          var fileId = '';
          try { fileId = findDriveFileIdInFolder_(targetFolderId, prev.filename); } catch (e) { fileId = ''; }
          if (!fileId) {
            stat.missingInTarget++;
            stat.exceptions.push('row ' + (r + 1) + ' ' + fc.field + ': "' + prev.filename + '" not found exactly once in ' + TARGET);
            continue;
          }
          candidates.push({ row: r + 1, col: fc.col + 1, field: fc.field, oldRef: String(raw == null ? '' : String(raw)).replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, ''), newRef: prev.newRef, filename: prev.filename, keyValue: keyVal, fileId: fileId });
        }
      }
    }
    stat.nextOffset = endRow < values.length ? endRow - 1 : null;
    if (!dryRun) {
      if (stat.missingInTarget > 0) {
        stat.blocked = true;
        stat.blockReason = stat.missingInTarget + ' file(s) missing or ambiguous in ' + TARGET + '; refusing to rewrite. Resolve exceptions first.';
        return { status: 'blocked', summary: stat };
      }
      if (!candidates.length) {
        stat.verification = { legacyRemaining: 0, changedPrefixOk: true, filenamesIntact: true, note: 'nothing to apply in this batch' };
        return { status: 'success', summary: stat };
      }
      var applied = executeWithLock_(function () {
        var ss = null;
        try { ss = sheet.getParent ? sheet.getParent() : null; } catch (e) { ss = null; }
        var stamp = '';
        try { stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyyMMdd_HHmmss'); } catch (e) { stamp = String(Date.now()); }
        var backupName = String(payload.backupSheet || '').trim() || ('مكتب الجمارك_path_backup_' + stamp);
        var backupLoc = '';
        try {
          var parent = ss;
          if (!parent) {
            var bk = { name: backupName, rows: [['row', 'customs_uid', 'field', 'oldRef', 'newRef']] };
            candidates.forEach(function (c) { bk.rows.push([c.row, c.keyValue, c.field, c.oldRef, c.newRef]); });
            try { CacheService.getScriptCache().put('customs_path_backup_' + stamp, JSON.stringify(bk).slice(0, 90000), 21600); } catch (e2) {}
            backupLoc = 'cache:customs_path_backup_' + stamp;
          } else {
            var exists = null;
            try { exists = parent.getSheetByName(backupName); } catch (e3) { exists = null; }
            if (!exists) {
              var nb = parent.insertSheet(backupName);
              nb.appendRow(['row', 'customs_uid', 'field', 'oldRef', 'newRef', 'at']);
              candidates.forEach(function (c) { nb.appendRow([c.row, c.keyValue, c.field, c.oldRef, c.newRef, new Date()]); });
              try { noteMutation_(nb); } catch (e4) {}
            }
            backupLoc = 'sheet:' + backupName;
          }
        } catch (e5) { backupLoc = 'backup-failed:' + String((e5 && e5.message) || e5); }
        stat.backupSheet = backupLoc;
        var n = 0;
        candidates.forEach(function (c) {
          try {
            var rowNow = sheet.getRange(c.row, 1, 1, headers.length).getValues()[0];
            var curNow = String(rowNow[c.col - 1] == null ? '' : rowNow[c.col - 1]).replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');
            var keyNow = idCol >= 0 ? String(rowNow[idCol] == null ? '' : rowNow[idCol]).trim() : '';
            if (curNow !== c.oldRef || (c.keyValue != null && keyNow !== c.keyValue)) { stat.conflicts++; stat.exceptions.push('row ' + c.row + ' ' + c.field + ': concurrent change, skipped'); return; }
            sheet.getRange(c.row, c.col).setValue(c.newRef);
            n++;
          } catch (e6) { stat.errors.push('row ' + c.row + ' ' + c.field + ': ' + String((e6 && e6.message) || e6)); }
        });
        stat.updated = n;
        try { if (n) noteMutation_(sheet); } catch (e7) {}
        return n;
      });
      void applied;
      var reValues = sheet.getDataRange().getValues();
      var reEnd = Math.min(reValues.length, startRow + limit);
      var legacyRemaining = 0;
      var changedPrefixOk = true;
      var filenamesIntact = true;
      candidates.forEach(function (c) {
        var cur = String(reValues[c.row - 1][c.col - 1] == null ? '' : reValues[c.row - 1][c.col - 1]).trim();
        if (cur.indexOf('مكتب الجمارك_Images/') === 0 || cur.indexOf('مكتب الجمارك_Files_/') === 0) legacyRemaining++;
        if (cur !== c.newRef) { changedPrefixOk = false; }
        var base = cur.split('/').pop();
        if (base !== c.filename) filenamesIntact = false;
      });
      for (var rr = startRow; rr < reEnd; rr++) {
        for (var ff2 = 0; ff2 < fieldCols.length; ff2++) {
          var v2 = String(reValues[rr][fieldCols[ff2].col] == null ? '' : reValues[rr][fieldCols[ff2].col]).trim();
          if (v2.indexOf('مكتب الجمارك_Images/') === 0 || v2.indexOf('مكتب الجمارك_Files_/') === 0) legacyRemaining++;
        }
      }
      var jpgOk = null;
      var pdfOk = null;
      try {
        var pickJpg = null;
        var pickPdf = null;
        candidates.forEach(function (c) {
          var ln = String(c.filename).toLowerCase();
          if (!pickJpg && (ln.slice(-4) === '.jpg' || ln.slice(-5) === '.jpeg')) pickJpg = c;
          if (!pickPdf && ln.slice(-4) === '.pdf') pickPdf = c;
        });
        if (pickJpg) {
          var jid = findDriveFileIdInFolder_(targetFolderId, pickJpg.filename);
          jpgOk = !!jid;
        }
        if (pickPdf) {
          var pid = findDriveFileIdInFolder_(targetFolderId, pickPdf.filename);
          pdfOk = !!pid;
        }
      } catch (e8) { stat.errors.push('open-check: ' + String((e8 && e8.message) || e8)); }
      stat.verification = { legacyRemaining: legacyRemaining, changedPrefixOk: changedPrefixOk, filenamesIntact: filenamesIntact, jpgInTarget: jpgOk, pdfInTarget: pdfOk };
    }
    return { status: stat.blocked ? 'blocked' : 'success', summary: stat };
  } catch (e) {
    stat.errors.push(String((e && e.message) || e));
    return { status: 'error', summary: stat };
  }
}
