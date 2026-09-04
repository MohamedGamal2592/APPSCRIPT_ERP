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
    'get_trust_accounts': { page: 'tc_trust', access: 'read' },
    'get_trust_movements': { page: 'tc_trust', access: 'read' },
    'add_trust_movement': { page: 'tc_trust', access: 'write' },
    'get_stock_revision': { page: 'tc_stock_revision', access: 'read' },
    'add_stock_revision': { page: 'tc_stock_revision', access: 'write' },
    'update_stock_revision': { page: 'tc_stock_revision', access: 'full' },
    'get_customs_office': { page: 'tc_customs_office', access: 'read' },
    'add_customs_office': { page: 'tc_customs_office', access: 'write' },
    'get_purchase_items': { page: 'tc_purchasing', access: 'read' },
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
    'get_legal_products_movement': { page: 'tc_budget_stock_movement', access: 'read' },
    'get_legal_inputs': { page: 'tc_budget_inputs', access: 'read' },
    'add_legal_costing': { page: 'tc_budget_inputs', access: 'write' },
    'add_legal_purchasing_line': { page: 'tc_budget_inputs', access: 'write' },
    'add_legal_costing_bundle': { page: 'tc_budget_inputs', access: 'write' },
    'edit_legal_costing_bundle': { page: 'tc_budget_inputs', access: 'full' },
    'delete_legal_costing': { page: 'tc_budget_inputs', access: 'full' },
    'get_legal_manufacture': { page: 'tc_budget_manufacture', access: 'read' },
    'add_legal_manufacture': { page: 'tc_budget_manufacture', access: 'write' },
    'get_legal_invoices': { page: 'tc_budget_invoices', access: 'read' },
    'add_legal_invoice': { page: 'tc_budget_invoices', access: 'write' },
    'make_collection_from_invoice': { page: 'tc_budget_invoices', access: 'full' },
    'get_legal_cash': { page: 'tc_budget_cash', access: 'read' },
    'add_legal_cash': { page: 'tc_budget_cash', access: 'write' },
    'toggle_legal_cash_approved': { page: 'tc_budget_cash', access: 'full' },
    'get_legal_hr': { page: 'tc_budget_hr', access: 'read' },
    'add_legal_employee': { page: 'tc_budget_hr', access: 'write' },
    'get_legal_salaries': { page: 'tc_budget_hr', access: 'read' },
    'add_legal_salary': { page: 'tc_budget_hr', access: 'write' },
    'get_income_statement': { page: 'tc_budget_income', access: 'read' },
    'get_kpi_data': { page: 'tc_kpi', access: 'read' },
    'prefetch_refs': { page: 'tc_dashboard', access: 'read' }
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
    'get_legal_current_products': LEGAL_CURRENT_SHEET,
    'get_legal_products_movement': LEGAL_MOVEMENT_SHEET,
    'get_legal_inputs': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'add_legal_costing': LEGAL_COSTING_SHEET,
    'add_legal_purchasing_line': LEGAL_PURCHASING_SHEET,
    'add_legal_costing_bundle': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'edit_legal_costing_bundle': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'delete_legal_costing': LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET,
    'get_legal_manufacture': LEGAL_MANUFACTURE_SHEET,
    'add_legal_manufacture': LEGAL_MANUFACTURE_SHEET,
    'get_legal_invoices': LEGAL_INVOICES_SHEET,
    'add_legal_invoice': LEGAL_INVOICES_SHEET,
    'make_collection_from_invoice': LEGAL_CASH_SHEET,
    'get_legal_cash': LEGAL_CASH_SHEET,
    'add_legal_cash': LEGAL_CASH_SHEET,
    'toggle_legal_cash_approved': LEGAL_CASH_SHEET,
    'get_legal_hr': LEGAL_EMPLOYEES_SHEET,
    'add_legal_employee': LEGAL_EMPLOYEES_SHEET,
    'get_legal_salaries': LEGAL_SALARIES_SHEET,
    'add_legal_salary': LEGAL_SALARIES_SHEET,
    'get_income_statement': LEGAL_INCOME_SHEET,
    'get_dashboard_data': '',
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
    'get_trust_accounts': TRUST_SHEET,
    'get_trust_movements': TRUST_SHEET,
    'add_trust_movement': TRUST_SHEET,
    'get_stock_revision': STOCK_SHEET,
    'add_stock_revision': STOCK_SHEET,
    'get_purchase_items': PURCHASE_SHEET,
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
    'add_emp_salaries': EMP_SALARIES_SHEET,
    'edit_emp_salary': EMP_SALARIES_SHEET,
    'delete_emp_salary': EMP_SALARIES_SHEET,
    'update_emp_salary_receipt': EMP_SALARIES_SHEET,
    'get_payroll_months': EMP_SALARIES_CLOSE_SHEET,
    'close_payroll_month': EMP_SALARIES_CLOSE_SHEET,
    'add_upload_file': '',
    'export_vat_purchasing_xlsx': LEGAL_PURCHASING_SHEET,
    'get_budget_refs': LEGAL_CHART_SHEET,
    'prefetch_refs': PRODUCTS_SHEET
  };

  function tableForAction_(action) {
    return ACTION_TABLES[action] || '';
  }

  function guard_(user, action) {
    if (!user || user.isSuperAdmin) return;
    const req = PAGE_ACCESS[action];
    if (!req) return;
    if (!unifiedCheck_(user, '3fe1b5cb67b7223e', req.page, req.access)) {
      throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  function dispatch_(payload, user, dbId) {
    const action = payload.module_action;
    if (!actions[action]) throw new Error('Unknown Top Chemical action: ' + action);
    guard_(user, action);
    return actions[action](payload.data, user, dbId);
  }

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

  /** Products: id -> name_ar map + [{value,label}] options for ref selects. */
  function productRefs_(dbId) {
    return getRefsCached_(dbId, 'products', 120, function(){
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
    return getRefsCached_(dbId, 'parties', 120, function(){
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

  /** employee_info: emp_id -> name_ar map + [{value,label}] options for ref selects. */
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

  /**
   * AppSheet barcode data: CONCATENATE([id], TEXT(production_date,"YY"),
   * [emp_id], TEXT(production_date,"MM"), [production_id],
   * TEXT(production_date,"DD"), [system_id]) using the LOCAL calendar date.
   */
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
    return rowNumber;
  }

  function companyArabicName_() {
    try {
      const sheet = getSheet_('ERP_Companies', CONFIG.AUTH_SPREADSHEET_ID);
      const headers = getHeaders_(sheet);
      const data = sheet.getDataRange().getValues();
      const uidIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_unique_id');
      const arIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_name_ar');
      const row = data.slice(1).find(r => uidIdx !== -1 && String(r[uidIdx]).trim() === COMPANY_UID);
      return (row && arIdx !== -1) ? String(row[arIdx]).trim() : 'توب كيميكال';
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
    const rows = getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, CLIENTS_SHEET); });
    return { status: 'success', clients: rows };
  }

  function addClientVendor_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('المعرف مطلوب (رقم صحيح موجب)');
    const nameAr = String(data.name_ar || '').trim();
    if (!nameAr) throw new Error('الاسم مطلوب');
    const exists = getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, CLIENTS_SHEET); }).some(function(c){ return Number(c.id) === id; });
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
    try { invalidateRefsCache_(dbId, 'parties'); } catch(e){}
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
    var _oldClientVendor = null; try { _oldClientVendor = getAllRecords_(dbId, CLIENTS_SHEET).find(function(r){ return String(r.id)===String(id); }) || null; } catch(e2){}
    const sheet = getSheet_(CLIENTS_SHEET, dbId);
    if (!updateRowByCriteria_(sheet, 'id', id, updates)) throw new Error('العميل غير موجود');
    var savedRecord = { id: id };
    Object.keys(updates).forEach(function(k){ savedRecord[k]=updates[k]; });
    // fill missing from existing
    try { var existing = getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, CLIENTS_SHEET); }).find(function(c){ return Number(c.id)===id; }); if(existing){ Object.keys(existing).forEach(function(k){ if(savedRecord[k]===undefined) savedRecord[k]=existing[k]; }); } } catch(e){}
    try { var _uidCV = _oldClientVendor && _oldClientVendor.record_uid ? _oldClientVendor.record_uid : 'create_'+CLIENTS_SHEET+'_'+id; var _newCV = {}; if(_oldClientVendor) Object.keys(_oldClientVendor).forEach(function(k){ _newCV[k]=_oldClientVendor[k]; }); Object.keys(updates).forEach(function(k){ _newCV[k]=updates[k]; }); if(!Object.keys(_newCV).length) _newCV = savedRecord; logHistory_(dbId, CLIENTS_SHEET, _uidCV, String(id), (user&&user.email)||'', 'update', _newCV, _oldClientVendor); } catch(e){}
    try { invalidateRefsCache_(dbId, 'parties'); } catch(e){}
    return { status: 'success', message: 'تم تحديث العميل', record: savedRecord, data: { assignedId: id } };
  }

  // =========================================
  // مديونيات (AR_AP)
  // =========================================
  function getArAp_(data, user, dbId) {
    const clients = getRefsCached_(dbId, 'parties', 120, function(){
      return getAllRecords_(dbId, CLIENTS_SHEET)
        .map(function (c) {
          return { value: Number(c.id), label: String(c.name_ar || '').trim() || ('#' + c.id) };
        })
        .filter(function (c) { return !isNaN(c.value); })
        .sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    });

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
    // cap after summary computed from FULL
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) summary = summary.slice(0, limit);
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
    getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, CLIENTS_SHEET); }).forEach(function (c) {
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
    var limit = Number(data && data.limit) || 10;
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

    const clientExists = getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, CLIENTS_SHEET); }).some(function(c){ return Number(c.id) === client; });
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
      const rowNum = sheet.getLastRow() + 1;
      sheet.appendRow(rowValues);
      const nameIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'name_ar');
      const clientIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'client');
      if (nameIdx !== -1 && clientIdx !== -1) {
        sheet.getRange(rowNum, nameIdx + 1).setFormula(
          '=VLOOKUP(' + colLetter_(clientIdx) + rowNum + ',clients_vendors!A:B,2,0)');
      }
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
    const rows = getRefsCached_(dbId, 'products', 120, function(){ return getAllRecords_(dbId, PRODUCTS_SHEET); });
    const unitSet = {};
    rows.forEach(function (r) { const u = String(r.unit || '').trim(); if (u) unitSet[u] = true; });
    const unitOptions = Object.keys(unitSet).sort();
    const categoryOptions = getRefsCached_(dbId, 'categories', 120, function(){
      return getAllRecords_(dbId, CATEGORIES_SHEET)
        .map(function (c) {
          const name = String(c['الاسم بالعربى'] || '').trim();
          return { value: name, label: name };
        })
        .filter(function (c) { return c.value; });
    });
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

    const cats = getRefsCached_(dbId, 'categories', 120, function(){
      return getAllRecords_(dbId, CATEGORIES_SHEET).map(function (c) {
        return String(c['الاسم بالعربى'] || '').trim();
      });
    });
    if (cats.indexOf(category) === -1) throw new Error('الفئة غير موجودة في جدول الفئات');

    const exists = getRefsCached_(dbId, 'products', 120, function(){ return getAllRecords_(dbId, PRODUCTS_SHEET); }).some(function(p){ return Number(p.id) === id; });
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
    var resP = appendRow_(dbId, PRODUCTS_SHEET, recP);
    try { logHistory_(dbId, PRODUCTS_SHEET, recP.record_uid || ('create_'+PRODUCTS_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', recP, null); } catch(e){}
    try { invalidateRefsCache_(dbId, 'products'); } catch(e){}
    try { invalidateRefsCache_(dbId, 'categories'); } catch(e){}
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
      const cats = getRefsCached_(dbId, 'categories', 120, function(){
        return getAllRecords_(dbId, CATEGORIES_SHEET).map(function (c) {
          return String(c['الاسم بالعربى'] || '').trim();
        });
      });
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
    if (data.print_file !== undefined) updates['print_file'] = String(data.print_file || '').trim();
    var _oldProd = null; try { _oldProd = getAllRecords_(dbId, PRODUCTS_SHEET).find(function(r){ return String(r.id)===String(id); }) || null; } catch(e2){}
    const sheet = getSheet_(PRODUCTS_SHEET, dbId);
    if (!updateRowByCriteria_(sheet, 'id', id, updates)) throw new Error('المنتج غير موجود');
    try { var _uidProd = _oldProd && _oldProd.record_uid ? _oldProd.record_uid : 'create_'+PRODUCTS_SHEET+'_'+id; var _newProd = {}; if(_oldProd) Object.keys(_oldProd).forEach(function(k){ _newProd[k]=_oldProd[k]; }); Object.keys(updates).forEach(function(k){ _newProd[k]=updates[k]; }); logHistory_(dbId, PRODUCTS_SHEET, _uidProd, String(id), (user&&user.email)||'', 'update', _newProd, _oldProd); } catch(e){}
    try { invalidateRefsCache_(dbId, 'products'); } catch(e){}
    try { invalidateRefsCache_(dbId, 'categories'); } catch(e){}
    var savedRecProd = { id: id };
    Object.keys(updates).forEach(function(k){ savedRecProd[k]=updates[k]; });
    try { var exP = getRefsCached_(dbId, 'products', 120, function(){ return getAllRecords_(dbId, PRODUCTS_SHEET); }).find(function(p){ return Number(p.id)===id; }); if(exP){ Object.keys(exP).forEach(function(k){ if(savedRecProd[k]===undefined) savedRecProd[k]=exP[k]; }); } } catch(e){}
    return { status: 'success', message: 'تم تحديث المنتج', record: savedRecProd, data: { assignedId: id } };
  }

  // =========================================
  // باركود الإنتاج (top_chemical_barcode_generator)
  // =========================================
  function getBarcode_(data, user, dbId) {
    const products = productRefs_(dbId);
    const employees = employeeRefs_(dbId);
    var rows = getAllRecords_(dbId, BARCODE_SHEET).map(function (r) {
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
    }).sort(function (a, b) { return Number(b.id) - Number(a.id); });
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
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
          document_file: r.document_file
        };
      }).reverse();
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) papers = papers.slice(0, limit);
    return {
      status: 'success',
      papers: papers,
      document_types: Object.keys(typeSet).sort(function (a, b) { return String(a).localeCompare(String(b), 'ar'); }),
      product_options: products.options
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
      document_file: documentFile
    };
    var _mapReg = {
      document_name_ar: nameAr,
      document_name_en: String(data.document_name_en || '').trim(),
      product: product || '',
      document_number: num,
      document_type: type,
      document_start_date: startDate,
      document_end_date: endDate,
      document_file: documentFile
    };
    var res = appendRow_(dbId, REGISTRATION_SHEET, _mapReg);
    try { logHistory_(dbId, REGISTRATION_SHEET, 'create_'+REGISTRATION_SHEET+'_'+num, String(num), (user&&user.email)||'', 'create', _mapReg, null); } catch(e){}
    res.record = savedRecord;
    res.data = res.data || {};
    res.data.assignedId = num;
    return res;
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
    var limit = Number(data && data.limit) || 10;
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
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', stock: rows, product_options: products.options };
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
    const date = data.date ? parseDate_(data.date) : new Date();
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
    const rowNum = sheet.getLastRow() + 1;
    sheet.appendRow(rowValues);

    headers.forEach(function (h, i) {
      const key = String(h).trim().toLowerCase();
      let f = '';
      if (key === 'name_ar') f = '=VLOOKUP(A' + rowNum + ',products!A:C,3,0)';
      if (key === 'category') f = '=VLOOKUP(A' + rowNum + ',products!A:E,5,0)';
      if (key === 'unit') f = '=VLOOKUP(A' + rowNum + ',products!A:D,4,0)';
      if (key === 'difference') {
        f = '=IF(ISBLANK(I' + rowNum + '),"",IF(I' + rowNum + '-F' + rowNum + '=0,"مظبوط",IF(I' + rowNum + '>F' + rowNum + ',ROUND(I' + rowNum + '-F' + rowNum + ',2) & "  عجز",ROUND(I' + rowNum + '-F' + rowNum + ',2) & "  زيادة")))';
      }
      if (key === 'percentage') {
        f = '=iferror(IF(ISBLANK(I' + rowNum + '),"",IF(1-((F' + rowNum + '-I' + rowNum + ')/I' + rowNum + ')>1,F' + rowNum + '/I' + rowNum + ',1-((F' + rowNum + '-I' + rowNum + ')/I' + rowNum + '))),"")';
      }
      if (f) sheet.getRange(rowNum, i + 1).setFormula(f);
    });
    var prodMap = productRefs_(dbId).map;
    var savedRecord = {
      product: product,
      product_name: prodMap[product] || ('#' + product),
      name_ar: prodMap[product] || '',
      category: '',
      unit: '',
      date: date,
      amount: amount,
      warehouse: warehouse,
      notes: notes,
      available_amount: avail,
      difference: '',
      percentage: '',
      user: (user && user.email) || '',
      created_at: new Date(),
      _sheetRow: rowNum
    };
    // fill category/unit from products sheet if available
    try {
      var prodRow = getRefsCached_(dbId, 'products', 120, function(){ return getAllRecords_(dbId, PRODUCTS_SHEET); }).find(function(p){ return Number(p.id)===product; });
      if (prodRow) { savedRecord.name_ar = String(prodRow.name_ar||'').trim(); savedRecord.category = String(prodRow.category||'').trim(); savedRecord.unit = String(prodRow.unit||'').trim(); }
    } catch(e){}
    try { var _mapStock = { product: product, date: date, amount: amount, warehouse: warehouse, notes: notes, available_amount: avail, user: (user && user.email) || '', created_at: new Date() }; logHistory_(dbId, STOCK_SHEET, 'create_'+STOCK_SHEET+'_'+rowNum, String(rowNum), (user&&user.email)||'', 'create', _mapStock, null); } catch(e){}
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
      }
    });
    try { var _uidStock = _oldStock && _oldStock.record_uid ? _oldStock.record_uid : 'create_'+STOCK_SHEET+'_'+sheetRow; var _newStock = {}; if(_oldStock) Object.keys(_oldStock).forEach(function(k){ _newStock[k]=_oldStock[k]; }); Object.keys(updates).forEach(function(k){ _newStock[k]=updates[k]; }); logHistory_(dbId, STOCK_SHEET, _uidStock, String(sheetRow), (user&&user.email)||'', 'update', _newStock, _oldStock); } catch(e){}

    return { status: 'success', message: 'تم تحديث جرد المخزون' };
  }

  // =========================================
  // مكتب الجمارك — existing live sheet KEEPS its 10 Arabic/English headers:
  // التاريخ | نوع المعاملة | سبب العملية | المبلغ | تفاصيل المعاملة |
  // تكليف المطالبة | تخليص الشحنة | المبلغ_دولار | user | created_at
  // (no id column — id is synthesized from the row index at read time)
  // تكليف المطالبة / تخليص الشحنة are optional file uploads stored as text refs.
  // =========================================
  const CUSTOMS_HEADERS = [
    'التاريخ', 'نوع المعاملة', 'سبب العملية', 'المبلغ', 'تفاصيل المعاملة',
    'تكليف المطالبة', 'تخليص الشحنة', 'المبلغ_دولار', 'user', 'created_at'
  ];

  function ensureCustomsOfficeSheet_(dbId) {
    const ss = getSpreadsheet_(dbId);
    let sheet = ss.getSheetByName(CUSTOMS_OFFICE_SHEET);
    if (sheet) return sheet;
    sheet = ss.insertSheet(CUSTOMS_OFFICE_SHEET);
    sheet.appendRow(CUSTOMS_HEADERS);
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

    let egpTotal = 0;
    let usdTotal = 0;
    var transactions = rows.map(function (r, i) {
      const egp = Number(r['المبلغ']) || 0;
      const usd = Number(r['المبلغ_دولار']) || 0;
      const sgn = String(r['نوع المعاملة']).trim() === 'مدين' ? -1 : 1;
      egpTotal += egp * sgn;
      usdTotal += usd * sgn;
      return {
        id: i + 1,
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
    }).reverse();
    // summary computed from FULL before slice
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) transactions = transactions.slice(0, limit);
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
        new Date()
      ];
      sheet.appendRow(rowValues);
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

  function getPurchaseItems_(data, user, dbId) {
    const vendors = vendorRefs_(dbId);
    const items = itemRefs_(dbId);
    var rows = getAllRecords_(dbId, PURCHASE_SHEET).map(function (r) {
      const vid = String(r.vendor || '').trim();
      const iid = String(r.item || '').trim();
      return {
        unique_id: r.unique_id,
        id: r.id,
        vendor: vid,
        vendor_name: vendors.map[vid] || '',
        invoice_no: r.invoice_no,
        invoice_date: r.invoice_date,
        item: iid,
        item_name: items.map[iid] || '',
        item_brand: r.item_brand,
        qty: r.qty,
        price: r.price,
        receipt_date: r.receipt_date,
        user: r.user,
        created_at: r.created_at
      };
    }).reverse();
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return {
      status: 'success',
      purchases: rows,
      vendor_options: vendors.options,
      item_options: items.options
    };
  }

  function addPurchaseItem_(data, user, dbId) {
    const vendor = String(data.vendor || '').trim();
    if (!vendor) throw new Error('المورد مطلوب');
    if (!vendorRefs_(dbId).map[vendor]) throw new Error('المورد غير موجود');
    const item = String(data.item || '').trim();
    if (!item) throw new Error('الصنف مطلوب');
    if (!itemRefs_(dbId).map[item]) throw new Error('الصنف غير موجود');
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
      const id = getNextIdUnderLock_(dbId, PURCHASE_SHEET);
      const sheet = getSheet_(PURCHASE_SHEET, dbId);
      const headers = getHeaders_(sheet);
      const rec = {
        unique_id: uid16_(),
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
      try { logHistory_(dbId, PURCHASE_SHEET, rec.record_uid || ('create_'+PURCHASE_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
      var vendorsMap = vendorRefs_(dbId).map;
      var itemsMap = itemRefs_(dbId).map;
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
    return getRefsCached_(dbId, 'parties', 120, function(){
      return getAllRecords_(dbId, CUSTOMER_VENDOR_SHEET).map(function (v) {
        const name = String(v.name || '').trim();
        return name ? { value: name, label: name } : null;
      }).filter(Boolean).sort(function (a, b) { return String(a.label).localeCompare(String(b.label), 'ar'); });
    });
  }

  function getImportFollow_(data, user, dbId) {
    const products = productRefs_(dbId);
    var rows = getAllRecords_(dbId, IMPORT_FOLLOW_SHEET).map(function (r) {
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
    }).reverse();
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
    return { status: 'success', follows: rows, vendor_options: customerVendorOptions_(dbId), product_options: products.options };
  }

  function addImportFollow_(data, user, dbId) {
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
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      const rowNum = sheet.getLastRow() + 1;
      sheet.appendRow(rowValues);
      headers.forEach(function (h, i) {
        const key = String(h).trim().toLowerCase();
        if (key === 'approval_expiry_date') {
          const dateIdx = headers.findIndex(function (hh) {
            return String(hh).trim().toLowerCase() === 'approval_date';
          });
          const ref = colLetter_(dateIdx === -1 ? i : dateIdx) + rowNum;
          sheet.getRange(rowNum, i + 1).setFormula('=IF(ISBLANK(' + ref + '),"",' + ref + '+180)');
        }
      });
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
    var _oldImpFiles = null; try { _oldImpFiles = getAllRecords_(dbId, IMPORT_FOLLOW_SHEET).find(function(r){ return String(r.id)===String(id); }) || null; } catch(e2){}
    const sheet = getSheet_(IMPORT_FOLLOW_SHEET, dbId);
    if (!updateRowByCriteria_(sheet, 'id', id, updates)) throw new Error('السجل غير موجود');
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
        try { var _uidImpSt = _oldImpSt && _oldImpSt.record_uid ? _oldImpSt.record_uid : 'create_'+IMPORT_FOLLOW_SHEET+'_'+id; var _newImpSt = {}; if(_oldImpSt) Object.keys(_oldImpSt).forEach(function(k){ _newImpSt[k]=_oldImpSt[k]; }); _newImpSt['status']=next; logHistory_(dbId, IMPORT_FOLLOW_SHEET, _uidImpSt, String(id), (user&&user.email)||'', 'update', _newImpSt, _oldImpSt); } catch(e){}
        return { status: 'success', message: 'تم النقل إلى الحالة: ' + next, status: next };
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
    const typeSet = {};
    var rows = getAllRecords_(dbId, CARTON_SIZES_SHEET).map(function (r) {
      const t = String(r.type || '').trim();
      if (t) typeSet[t] = true;
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
    }).reverse();
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) rows = rows.slice(0, limit);
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
      const rowValues = headers.map(function (h) {
        const key = String(h).trim().toLowerCase();
        return rec[key] !== undefined ? rec[key] : '';
      });
      sheet.appendRow(rowValues);
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
    var _oldCarton = null; try { _oldCarton = getAllRecords_(dbId, CARTON_SIZES_SHEET).find(function(r){ return String(r.id)===String(id); }) || null; } catch(e2){}
    const sheet = getSheet_(CARTON_SIZES_SHEET, dbId);
    if (!updateRowByCriteria_(sheet, 'id', id, updates)) throw new Error('السجل غير موجود');
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
        insurance: !!r.insurance,
        status: statusMap[eid] || DEFAULT_EMPLOYEE_STATUS_,
        basic_salary: r.basic_salary
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
        main_salary: '=VLOOKUP(A' + rowNumber + ',employee_salary_updated!A:F,4,0)',
        allow: '=VLOOKUP(A' + rowNumber + ',employee_salary_updated!A:F,5,0)',
        national_id: nationalId,
        hiring_date: hiringDate,
        title: title,
        section: '=VLOOKUP(G' + rowNumber + ',title_index!B:H,7,0)',
        category: category,
        insurance: insurance,
        'الحالة الوظيفية': '=VLOOKUP(A' + rowNumber + ',employee_status_updated!$A:$C,3,0)',
        basic_salary: '=VLOOKUP(A' + rowNumber + ',employee_salary_updated!A:F,6,0)',
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
        basic_salary: 0
      };
      return { status: 'success', message: 'تم تسجيل الموظف', record: savedRecEmp, data: { assignedId: empId } };
    });
  }

  // =========================================
  // شئون العاملين — حالة الموظف (employee_status)
  // =========================================
  function getEmployeeStatus_(data, user, dbId) {
    const names = employeeRefs_(dbId).map;
    const rawRows = getAllRecords_(dbId, EMP_STATUS_SHEET);
    const rows = rawRows.map(function (r) {
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
    }).slice(-300).reverse();
    var limit = Number(data && data.limit) || 10;
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
    var limit = Number(data && data.limit) || 10;
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
        name_ar: '=VLOOKUP(C' + rowNumber + ',employee_info!A:M,2,0)',
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
    var limit = Number(data && data.limit) || 10;
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
    var limit = Number(data && data.limit) || 10;
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
        total_time: r.total_time, approved: !!r.approved, overtime_type: r.overtime_type,
        amount: r.amount, approved_amount: r.approved_amount,
        user: r.user, created_at: r.created_at
      };
    });
    var limit = Number(data && data.limit) || 10;
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
    const start = timeFrac_(data.start_time);
    const end = timeFrac_(data.end_time);
    if (start === '') throw new Error('وقت البداية مطلوب');
    if (end === '') throw new Error('وقت النهاية مطلوب');
    const type = String(data.overtime_type || '').trim();
    if (HR_OVERTIME_TYPES.indexOf(type) === -1) throw new Error('نوع العمل الإضافي مطلوب');
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
    var limit = Number(data && data.limit) || 10;
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
          section: '=VLOOKUP($A' + r + ',employee_info!$A:$L,9,0)',
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
          internal_section: '=VLOOKUP(A' + r + ',employee_info!$A:$L,8,0)',
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
      if (monthIdx !== -1) sheet.getRange(rowNum, monthIdx + 1).setValue(newMonth);
      if (yearIdx !== -1) sheet.getRange(rowNum, yearIdx + 1).setValue(newYear);
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
      var _oldDel = null; try { _oldDel = getAllRecords_(dbId, EMP_SALARIES_SHEET).find(function(r){ return Number(r.emp_id)===Number(empId) && Number(r.month)===Number(month) && Number(r.year)===Number(year); })||null; } catch(e2){}
      try { var _uidDel = _oldDel && _oldDel.record_uid ? _oldDel.record_uid : 'create_'+EMP_SALARIES_SHEET+'_'+empId+'_'+month+'_'+year; logHistory_(dbId, EMP_SALARIES_SHEET, _uidDel, String(empId), (user&&user.email)||'', 'delete', null, _oldDel); } catch(e){}
      sheet.deleteRow(rowNum);
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
      var _oldRec = null; try { _oldRec = getAllRecords_(dbId, EMP_SALARIES_SHEET).find(function(r){ return Number(r.emp_id)===Number(empId) && Number(r.month)===Number(month) && Number(r.year)===Number(year); })||null; } catch(e2){}
      sheet.getRange(rowNum, receiptIdx + 1).setValue(true);
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
      if (dup) throw new Error('هذا الشهر مغلق مسبقاً');
      const salaryRows = getAllRecords_(dbId, EMP_SALARIES_SHEET).filter(function (r) {
        return Number(r.month) === month && Number(r.year) === year;
      });
      const total = salaryRows.reduce(function (s, r) { return s + (Number(r.net_salary) || 0); }, 0);
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
    SpreadsheetApp.flush();
  }

  /** Next invoice number for a year: "{seq}-{year}" with seq = max+1 (resets yearly). */
  function nextInvoiceNumber_(dbId, year) {
    let maxSeq = 0;
    getAllRecords_(dbId, LEGAL_INVOICES_SHEET).forEach(function (r) {
      const m = String(r['رقم الفاتورة'] || '').trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return;
      if (Number(m[2]) !== Number(year)) return;
      const seq = Number(m[1]);
      if (seq > maxSeq) maxSeq = seq;
    });
    return (maxSeq + 1) + '-' + year;
  }

  /** Manufacture total_cost — faithful to the operator's formula (kept as sent,
   *  incl. the movement-part qty multipliers T×M and T×N). */
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

  /** Combined reference data for the budget forms (one call per page). */
  function getBudgetRefs_(data, user, dbId) {
    const parties = getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, LEGAL_PARTIES_SHEET); });
    const products = getRefsCached_(dbId, 'products', 120, function(){ return getAllRecords_(dbId, LEGAL_PRODUCTS_SHEET); });
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
        charts: getRefsCached_(dbId, 'chart_of_accounts', 120, function(){
          return getAllRecords_(dbId, LEGAL_CHART_SHEET).map(function (r) {
            return {
              code: String(r['كود المستوى'] == null ? '' : r['كود المستوى']).trim(),
              name: String(r['اسم الحساب الرئيسي'] == null ? '' : r['اسم الحساب الرئيسي']).trim() ||
                String(r['اسم المستوى الخامس'] == null ? '' : r['اسم المستوى الخامس']).trim()
            };
          }).filter(function (c) { return c.code; });
        }),
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
    return { status: 'success', products: getRefsCached_(dbId, 'products', 120, function(){ return getAllRecords_(dbId, LEGAL_PRODUCTS_SHEET); }) };
  }

  function getLegalParties_(data, user, dbId) {
    return { status: 'success', parties: getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, LEGAL_PARTIES_SHEET); }) };
  }

  function addLegalParty_(data, user, dbId) {
    const id = Number(data.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error('المعرف مطلوب (رقم صحيح موجب)');
    const name = String(data.name || '').trim();
    if (!name) throw new Error('الاسم مطلوب');
    if (!String(data.tax_id || '').trim()) throw new Error('الرقم الضريبي مطلوب');
    const exists = getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, LEGAL_PARTIES_SHEET); }).some(function (p) { return Number(p.id) === id; });
    if (exists) throw new Error('المعرف مستخدم بالفعل: ' + id);
    const rec = {};
    Object.keys(data).forEach(function (k) { rec[k.trim().toLowerCase()] = data[k]; });
    rec['id'] = id; rec['name'] = name;
    var resLP = appendRow_(dbId, LEGAL_PARTIES_SHEET, rec);
    try { logHistory_(dbId, LEGAL_PARTIES_SHEET, rec.record_uid || ('create_'+LEGAL_PARTIES_SHEET+'_'+id), String(id), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    try { invalidateRefsCache_(dbId, 'parties'); } catch(e){}
    var savedLP = {}; Object.keys(rec).forEach(function(k){ savedLP[k]=rec[k]; });
    resLP.record = savedLP;
    resLP.data = { assignedId: id };
    return resLP;
  }

  function getLegalCurrentProducts_(data, user, dbId) {
    return { status: 'success', items: getAllRecords_(dbId, LEGAL_CURRENT_SHEET) };
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
    return { status: 'success', items: rows.slice(offset, offset + limit), total: total, offset: offset, limit: limit };
  }

  function getLegalInputs_(data, user, dbId) {
    return {
      status: 'success',
      costing: getAllRecords_(dbId, LEGAL_COSTING_SHEET),
      lines: getAllRecords_(dbId, LEGAL_PURCHASING_SHEET)
    };
  }

  function addLegalCosting_(data, user, dbId) {
    const cert = String(data['رقم الشهاده'] || '').trim();
    if (!cert) throw new Error('رقم الشهادة مطلوب');
    if (!String(data['تاريخ الافراج'] || '').trim()) throw new Error('تاريخ الافراج مطلوب');
    if (!String(data['الصنف'] || '').trim()) throw new Error('الصنف مطلوب');
    if (!String(data['نوع الشهادة'] || '').trim()) throw new Error('نوع الشهادة مطلوب');
    if (!String(data['نوع الشحن'] || '').trim()) throw new Error('نوع الشحن مطلوب');
    validateBudgetMonth_(data['تم_الاقرار_شهر']);
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
    valueMap['user'] = (user && user.email) || '';
    const formulaMap = {
      'القيمه بالسعر المعلن': '=G{r}*H{r}',
      'اجمالي التكاليف': '=IF(D{r}="بيع",J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r},J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r}+U{r})',
      'المبيعات': '=IF(D{r}="بيع",ROUND(X{r}*103/100,-2),0)',
      'نوع الضريبة': '=Y{r}*14/100',
      'ضريبة المبيعات': '=IF(Z{r}>0.06,Y{r}*14/100,0)',
      'الشهر': '=MONTH(B{r})',
      'العام': '=YEAR(B{r})'
    };
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
    const item = String(data['المادة'] || '').trim();
    if (!item) throw new Error('المادة مطلوبة');
    if (!(Number(data['الكمية']) > 0)) throw new Error('الكمية مطلوبة (أكبر من صفر)');
    if (!(Number(data['قيمة التكلفة']) >= 0)) throw new Error('قيمة التكلفة مطلوبة');
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
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
    if (!lines.length) throw new Error('أضف بند مشتريات واحداً على الأقل');
    validateBudgetMonth_(header['تم_الاقرار_شهر']);
    const exists = getAllRecords_(dbId, LEGAL_COSTING_SHEET).some(function (c) {
      return getCertNo_(c) === cert;
    });
    if (exists) throw new Error('رقم الشهادة مستخدم بالفعل: ' + cert);
    const valueMap = {};
    Object.keys(header).forEach(function (k) { valueMap[k.trim().toLowerCase()] = header[k]; });
    valueMap['رقم الشهاده'] = cert;
    valueMap['user'] = (user && user.email) || '';
    const formulaMap = {
      'القيمه بالسعر المعلن': '=G{r}*H{r}',
      'اجمالي التكاليف': '=IF(D{r}="بيع",J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r},J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r}+U{r})',
      'المبيعات': '=IF(D{r}="بيع",ROUND(X{r}*103/100,-2),0)',
      'نوع الضريبة': '=Y{r}*14/100',
      'ضريبة المبيعات': '=IF(Z{r}>0.06,Y{r}*14/100,0)',
      'الشهر': '=MONTH(B{r})',
      'العام': '=YEAR(B{r})'
    };
    var headerRow = writeBudgetRow_(dbId, LEGAL_COSTING_SHEET, valueMap, formulaMap);
    ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'الرقم');
    ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'رقم الشهاده');
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
    validateBudgetMonth_(header['تم_الاقرار_شهر']);
    const sheet = getSheet_(LEGAL_COSTING_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const formulaKeys = ['اجمالي التكاليف', 'المبيعات', 'نوع الضريبة', 'ضريبة المبيعات', 'الشهر', 'العام'].map(function (k) { return String(k).toLowerCase(); });
    const updates = {};
    Object.keys(header).forEach(function (k) {
      const key = String(k).trim().toLowerCase();
      if (formulaKeys.indexOf(key) !== -1) return;
      updates[key] = header[k];
    });
    const values = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === cert) { rowIndex = i; break; }
    }
    if (rowIndex === -1) throw new Error('الشهادة غير موجودة: ' + cert);
    headers.forEach(function (h, col) {
      const key = String(h).trim().toLowerCase();
      if (formulaKeys.indexOf(key) === -1 && updates[key] !== undefined) {
        sheet.getRange(rowIndex + 1, col + 1).setValue(updates[key]);
      }
    });
    SpreadsheetApp.flush();
    deletePurchasingLinesForCert_(dbId, cert);
    var savedLinesE = [];
    if (lines.length) {
      ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'الرقم');
      ensureBudgetHeader_(dbId, LEGAL_PURCHASING_SHEET, 'رقم الشهاده');
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
    var limit = Number(data && data.limit) || 10;
    if (!data || !data.loadAll) items = items.slice(0, limit);
    return { status: 'success', items: items };
  }

  function addLegalManufacture_(data, user, dbId) {
    const product = String(data.produced_product || '').trim();
    if (!product) throw new Error('المنتج المنتج مطلوب');
    if (!(Number(data.manufactured_qty) > 0)) throw new Error('الكمية المنتجة مطلوبة');
    if (!String(data.manufcture_number || '').trim()) throw new Error('رقم التشغيلة مطلوب');
    if (!String(data.manufacture_date || '').trim()) throw new Error('تاريخ التصنيع مطلوب');
    if (!String(data.item_1 || '').trim()) throw new Error('المادة الأولى مطلوبة');
    if (!(Number(data.qty_1) > 0)) throw new Error('كمية المادة الأولى مطلوبة');
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
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
      rows = rows.filter(function (r) {
        return String(r['اسم العميل'] || '').toLowerCase().indexOf(search) !== -1 ||
          String(r['إسم المنتج'] || '').toLowerCase().indexOf(search) !== -1 ||
          String(r['رقم الفاتورة'] || '').toLowerCase().indexOf(search) !== -1;
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
    const cust = String(data['اسم العميل'] || '').trim();
    if (!cust) throw new Error('اسم العميل مطلوب');
    const code = String(data['كود المعاملة المباعة'] || '').trim();
    if (!code) throw new Error('كود المعاملة المباعة مطلوب');
    const dateStr = String(data['تاريخ الفاتورة'] || '').trim();
    if (!dateStr) throw new Error('تاريخ الفاتورة مطلوب');
    if (!(Number(data['كمية المنتج']) > 0)) throw new Error('كمية المنتج يجب أن تكون أكبر من صفر');
    const year = Number(data['العام']) || (parseDate_(dateStr).getFullYear()) || new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000) throw new Error('العام غير صحيح');
    const valueMap = {};
    Object.keys(data).forEach(function (k) { valueMap[k.trim().toLowerCase()] = data[k]; });
    var invNo = nextInvoiceNumber_(dbId, year);
    valueMap['رقم الفاتورة'] = invNo;
    valueMap['ميزان حسابي - 26 - 1'] = 5;
    valueMap['نوع الضريبة (سلع عامة 1/سلع جدول 2)'] = 2;
    valueMap['نوع البيان (سلعة 3/خدمة 4/تسويات 5)'] = 3;
    valueMap['نوع السلعة (محلي 1/صادرات 2/آلات ومعدات 5/أجزاء آلات 6/إعفاءات 7 /  سلع الجدول  مراجعة الإرشادات )'] = 14;
    valueMap['user'] = (user && user.email) || '';
    const formulaMap = {
      'رقم التسجيل الضريبي للعميل': '=IFERROR(VLOOKUP(F{r},legal_customer_vendor!B:E,4,0),"")',
      'إسم المنتج': '=IFERROR(VLOOKUP(A{r},legal_current_products!$A:$B,2,0),"")',
      'كود المنتج': '=IFERROR(VLOOKUP(M{r},legal_products!B:G,4,0),"")',
      'وحدة قياس المنتج': '=IFERROR(VLOOKUP(M{r},legal_products!B:F,5,0),"")',
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

  function makeCollectionFromInvoice_(data, user, dbId) {
    const invId = String((data && (data.invoice_id || data.id || data.unique_id)) || '').trim();
    if (!invId) throw new Error('معرف أو رقم الفاتورة مطلوب');

    // Get all invoice records to find the target invoice
    const invoices = getAllRecords_(dbId, LEGAL_INVOICES_SHEET);
    const invoice = invoices.find(function (i) {
      return String(i['رقم الفاتورة'] || '').trim() === invId ||
             String(i.unique_id || '').trim() === invId ||
             String(i.id || '').trim() === invId;
    });

    if (!invoice) throw new Error('الفاتورة غير موجودة برقم: ' + invId);

    const customerName = String(invoice['اسم العميل'] || invoice['العميل'] || '').trim();
    if (!customerName) throw new Error('اسم العميل غير موجود في الفاتورة');

    const rawInvDate = invoice['تاريخ الفاتورة'] || invoice['تاريخ'];
    const invDate = normalizeDateStr_(rawInvDate) || budgetDateStr_(new Date());
    const netAmount = Number(invoice['المبلغ الصافي'] || invoice['الصافي'] || invoice['إجمالي'] || 0) || 0;
    if (netAmount <= 0) throw new Error('المبلغ الصافي يجب أن يكون أكبر من الصفر');

    const invNo = String(invoice['رقم الفاتورة'] || invId).trim();

    return executeWithLock_(function () {
      const rows = getAllRecords_(dbId, LEGAL_CASH_SHEET);
      let maxId = 0;
      rows.forEach(function (r) {
        const n = Number(r.transaction_id);
        if (Number.isInteger(n) && n > maxId) maxId = n;
      });

      const valueMap = {
        'transaction_id': maxId + 1,
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

      const formulaMap = {
        'balance_amount': '=IF(K{r}="Debit Note",J{r}*-1,IF(K{r}="Credit",J{r}*-1,J{r}))',
        'chart_account_main': '=VLOOKUP(N{r},chart_of_accounts!N:O,2,0)'
      };

      writeBudgetRow_(dbId, LEGAL_CASH_SHEET, valueMap, formulaMap);
      try { logHistory_(dbId, LEGAL_CASH_SHEET, valueMap.record_uid || ('create_'+LEGAL_CASH_SHEET+'_'+(maxId+1)), String(maxId+1), (user&&user.email)||'', 'create', valueMap, null); } catch(e){}
      return { status: 'success', message: 'تم إنشاء عملية التحصيل بنجاح برقم حركة: ' + (maxId + 1), data: { transaction_id: maxId + 1 } };
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
    updateRowByCriteria_(sheet, 'transaction_id', id, { approved: next });
    try { var _uidCashAp = current && current.record_uid ? current.record_uid : 'create_'+LEGAL_CASH_SHEET+'_'+id; var _newCashAp = {}; if(current) Object.keys(current).forEach(function(k){ _newCashAp[k]=current[k]; }); _newCashAp.approved = next; logHistory_(dbId, LEGAL_CASH_SHEET, _uidCashAp, String(id), (user&&user.email)||'', 'approve', _newCashAp, current); } catch(e){}
    return { status: 'success', message: next ? 'تم اعتماد الحركة' : 'تم إلغاء الاعتماد' };
  }

  function getLegalHr_(data, user, dbId) {
    return { status: 'success', employees: getAllRecords_(dbId, LEGAL_EMPLOYEES_SHEET) };
  }

  function addLegalEmployee_(data, user, dbId) {
    const code = Number(data.employee_code);
    if (!Number.isInteger(code) || code <= 0) throw new Error('كود الموظف مطلوب');
    const name = String(data.employee_name || '').trim();
    if (!name) throw new Error('اسم الموظف مطلوب');
    const exists = getAllRecords_(dbId, LEGAL_EMPLOYEES_SHEET).some(function (e) { return Number(e.employee_code) === code; });
    if (exists) throw new Error('الكود مستخدم بالفعل: ' + code);
    const rec = {};
    Object.keys(data).forEach(function (k) { rec[k.trim().toLowerCase()] = data[k]; });
    var resLE = appendRow_(dbId, LEGAL_EMPLOYEES_SHEET, rec);
    try { logHistory_(dbId, LEGAL_EMPLOYEES_SHEET, rec.record_uid || ('create_'+LEGAL_EMPLOYEES_SHEET+'_'+code), String(code), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    var savedLE = {}; Object.keys(rec).forEach(function(k){ savedLE[k]=rec[k]; });
    savedLE['employee_code']=code; savedLE['employee_name']=name;
    resLE.record = savedLE;
    resLE.data = { assignedId: code };
    return resLE;
  }

  function getLegalSalaries_(data, user, dbId) {
    const month = Number(data.payroll_month);
    const year = Number(data.payroll_year);
    let rows = getAllRecords_(dbId, LEGAL_SALARIES_SHEET);
    if (Number.isInteger(month) && month >= 1 && month <= 12) rows = rows.filter(r => Number(r.payroll_month) === month);
    if (Number.isInteger(year) && year >= 2000) rows = rows.filter(r => Number(r.payroll_year) === year);
    return { status: 'success', items: rows };
  }

  function addLegalSalary_(data, user, dbId) {
    if (!(Number(data.employee_code) > 0)) throw new Error('كود الموظف مطلوب');
    const month = Number(data.payroll_month);
    const year = Number(data.payroll_year);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('شهر المرتب مطلوب');
    if (!Number.isInteger(year) || year < 2000) throw new Error('سنة المرتب مطلوبة');
    const rec = {};
    Object.keys(data).forEach(function (k) { rec[k.trim().toLowerCase()] = data[k]; });
    var resLS = appendRow_(dbId, LEGAL_SALARIES_SHEET, rec);
    try { var _codeLS = String(data.employee_code); logHistory_(dbId, LEGAL_SALARIES_SHEET, rec.record_uid || ('create_'+LEGAL_SALARIES_SHEET+'_'+_codeLS+'_'+Date.now()), String(_codeLS), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    var savedLS = {}; Object.keys(rec).forEach(function(k){ savedLS[k]=rec[k]; });
    resLS.record = savedLS;
    resLS.data = { assignedId: data.employee_code };
    return resLS;
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
        if (res && res.files && res.files.length > 0) {
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
        if (data.files && data.files.length > 0) {
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

  function uploadDriveFileRest_(folderId, blob, fileName) {
    // 1. Try Advanced Drive API v3 (Drive.Files.create)
    try {
      if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.create) {
        const resource = {
          name: fileName,
          parents: [folderId]
        };
        const created = Drive.Files.create(resource, blob);
        if (created && created.id) return created;
      }
    } catch (advErr) {
      console.warn('Drive.Files.create failed, trying UrlFetchApp multipart: ' + advErr.message);
    }

    // 2. Fallback via UrlFetchApp Multipart Upload (bypasses DriveApp permission locks)
    const token = ScriptApp.getOAuthToken();
    const metadata = { name: fileName, parents: [folderId] };
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
  function addUploadFile_(data, user, dbId) {
    const sheet = String((data && data.sheet) || '').trim();
    const cfg = UPLOAD_META[sheet];
    if (!cfg) throw new Error('الجدول غير معروف');
    if (!(user && user.isSuperAdmin)) {
      const grants = ((user && user.authorizedPages) || {})[cfg.page] || [];
      if (grants.indexOf('write') === -1) {
        throw new Error('لا يوجد صلاحية لإضافة سجلات في هذه الصفحة');
      }
    }
    const filename = String((data && data.filename) || '').trim();
    if (!filename) throw new Error('اسم الملف مطلوب');
    const dot = filename.lastIndexOf('.');
    const ext = (dot > 0 ? filename.slice(dot + 1) : '').toLowerCase();
    const allowedExt = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    if (allowedExt.indexOf(ext) === -1) {
      throw new Error('نوع الملف غير مسموح (pdf, word, png, jpg فقط)');
    }
    const b64 = String((data && data.base64) || '').replace(/\s/g, '');
    if (!b64) throw new Error('لا يوجد ملف');
    const bytes = Utilities.base64Decode(b64);
    if (bytes.length > 10 * 1024 * 1024) {
      throw new Error('حجم الملف يتجاوز 10 ميجابايت');
    }
    const field = String((data && data.field) || '').trim();
    const folderName = (cfg.folderByField && cfg.folderByField[field]) || cfg.folder;
    const folderId = ensureDriveFolderId_(folderName);
    let newName = buildUploadName_(sheet, data, ext);
    newName = uniqueDriveName_(newName);

    const blob = Utilities.newBlob(bytes, mimeForExt_(ext), newName);
    uploadDriveFileRest_(folderId, blob, newName);

    return { status: 'success', reference: folderName + '/' + newName };
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
    const parties = getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, CUSTOMER_VENDOR_SHEET); });

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
  register('get_trust_accounts', getTrustAccounts_);
  register('get_trust_movements', getTrustMovements_);
  register('add_trust_movement', addTrustMovement_);
  register('get_stock_revision', getStockRevision_);
  register('add_stock_revision', addStockRevision_);
  register('update_stock_revision', updateStockRevision_);
  register('get_customs_office', getCustomsOffice_);
  register('add_customs_office', addCustomsOffice_);
  register('get_purchase_items', getPurchaseItems_);
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
  register('get_legal_products_movement', getLegalProductsMovement_);
  register('get_legal_inputs', getLegalInputs_);
  register('add_legal_costing', addLegalCosting_);
  register('add_legal_purchasing_line', addLegalPurchasingLine_);
  register('add_legal_costing_bundle', addLegalCostingBundle_);
  register('edit_legal_costing_bundle', editLegalCostingBundle_);
  register('delete_legal_costing', deleteLegalCosting_);
  register('get_legal_manufacture', getLegalManufacture_);
  register('add_legal_manufacture', addLegalManufacture_);
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

  function prefetchRefs_(data, user, dbId) {
    try { getRefsCached_(dbId, 'categories', 120, function(){ return getAllRecords_(dbId, CATEGORIES_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'chart_of_accounts', 120, function(){ return getAllRecords_(dbId, LEGAL_CHART_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'parties', 120, function(){ return getAllRecords_(dbId, CLIENTS_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'products', 120, function(){ return getAllRecords_(dbId, PRODUCTS_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'legal_parties', 120, function(){ return getAllRecords_(dbId, LEGAL_PARTIES_SHEET); }); } catch(e){}
    try { getRefsCached_(dbId, 'legal_products', 120, function(){ return getAllRecords_(dbId, LEGAL_PRODUCTS_SHEET); }); } catch(e){}
    return { status: 'success' };
  }
  register('prefetch_refs', prefetchRefs_);

  return { dispatch_: dispatch_, pageForAction_: pageForAction_, tableForAction_: tableForAction_ };
})();

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
  const token = String(params.sessionToken || '').trim();
  const auth = token ? authenticateSystemUser_(token) : { authorized: false };
  if (!auth.authorized) {
    return HtmlService.createHtmlOutput(
      '<script>window.top.location.href="' + ScriptApp.getService().getUrl() + '?action=login";</script>'
    ).setTitle('تسجيل الدخول');
  }
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
  cards.forEach(function (c) {
    if (currentSection !== null && c.section !== currentSection) {
      emitCards(bucket);
      bucket = [];
    }
    currentSection = c.section;
    bucket.push(cardHtml[cards.indexOf(c)]);
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
  const token = String(params.sessionToken || '').trim();
  const auth = token ? authenticateSystemUser_(token) : { authorized: false };
  if (!auth.authorized) {
    return HtmlService.createHtmlOutput(
      '<script>window.top.location.href="' + ScriptApp.getService().getUrl() + '?action=login";</script>'
    ).setTitle('تسجيل الدخول');
  }
  const type = String(params.type || '').trim();
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
    '<tr><td class="info-label">القيمة بالعملة الأجنبية</td><td class="info-value">' + budgetMoney_(h['القيمه بالدولار']) + '</td></tr>' +
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
      '<td>' + esc(r.transaction_date || '-') + '</td>' +
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

function kv(k, v) {
  return '<tr><th>' + payrollEsc_(k) + '</th><td>' + payrollEsc_(v == null ? '' : v) + '</td></tr>';
}
