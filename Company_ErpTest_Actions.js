/**
 * Company_TopLight_Actions.js
 * RESPONSIBILITY: Testing System business logic, IIFE-namespaced to TopLight.
 * Dashboard + Products + Customers/Vendors (create / list / edit).
 * All writes go through getNextId_ + addRecord_ from Code.js.
 * No functions leak into global scope (the only global is TopLight).
 */

const ErpTest = (function () {
  const actions = {};
  function register(name, fn) { actions[name] = fn; }

  const PRODUCTS_SHEET = 'erp_test_products';
  const CUSTOMERS_SHEET = 'erp_test_customer_vendor';
  const CATEGORIES_SHEET = 'erp_test_categories';
  const CHART_SHEET = 'erp_test_chart_of_accounts';
  const CURRENT_PRODUCTS_SHEET = 'erp_test_current_products';
  const PURCHASING_SHEET = 'erp_test_purchasing_costing';
  const PURCHASING_LINES_SHEET = 'erp_test_product_purchasing';
  const SALES_SHEET = 'erp_test_sales_invoices';
  const SALES_LINES_SHEET = 'erp_test_sales_products';
  const SALES_RETURNS_SHEET = 'erp_test_sales_returns';
  const OFFER_SHEET = 'erp_test_sales_offer';
  const OFFER_LINES_SHEET = 'erp_test_sales_offer_products';
  const CASH_SHEET = 'erp_test_cash_bank_movement';
  const BOX_SHEET = 'erp_test_box_account_codes';
  const CURRENCY_SHEET = 'ERP_currency_exchange';
  // Phase 3: own tenant UID for guard_/authorize_ (was inline literal).
  const COMPANY_UID = '37fc50edf1424abd';

  // --- erp_test header translation layer (ET_HEADER_MAP is a global from Company_ErpTest_Schema.js) ---
  var _etReverseMemo = {};
  function etMapFor_(sheetName) { return (typeof ET_HEADER_MAP !== 'undefined' && ET_HEADER_MAP[sheetName]) || {}; }
  function etToPhysical_(sheetName, logical) { return etMapFor_(sheetName)[logical] || logical; }
  function etToLogical_(sheetName, physical) {
    var p = String(physical == null ? '' : physical).trim();
    if (!_etReverseMemo[sheetName]) {
      var rev = {}, m = etMapFor_(sheetName);
      Object.keys(m).forEach(function (k) { rev[m[k]] = k; });
      _etReverseMemo[sheetName] = rev;
    }
    return _etReverseMemo[sheetName][p] || p;
  }
  function etHeaders_(sheet) { return getHeaders_(sheet).map(function (h) { return etToLogical_(sheet.getName(), String(h).trim()); }); }
  function etRecords_(dbId, sheetName) {
    var rows = getAllRecords_(dbId, sheetName), m = etMapFor_(sheetName);
    if (!Object.keys(m).length) return rows;
    return rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[etToLogical_(sheetName, k)] = r[k]; }); return o; });
  }
  function etCol_(sheetName, logical) { return etToPhysical_(sheetName, logical); }

  // --- OD-A: stock is computed live from transactions (no current_products sheet) ---
  //   qty = Σ purchases.qty − Σ sales.product_qty + Σ returns.return_qty (by product id)
  //   unit_cost = first live purchase line's total_cost/qty (qty>0), per OD1
  //   total_cost_sign = unit_cost × qty
  //   NOTE (P7): manufacturing in/out is folded in when the manufacture tabs exist.
  function etStockMap_(dbId) {
    var qty = {}, firstCost = {};
    tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(function (r) {
      var p = String(r.product == null ? '' : r.product).trim(); if (!p) return;
      qty[p] = (qty[p] || 0) + num0_(r.qty);
      if (firstCost[p] === undefined) { var q = num0_(r.qty); if (q > 0) firstCost[p] = num0_(r.total_cost) / q; }
    });
    tlDbList_(dbId, SALES_LINES_SHEET).forEach(function (r) {
      var p = String(r.product_id == null ? '' : r.product_id).trim(); if (!p) return;
      qty[p] = (qty[p] || 0) - num0_(r.product_qty);
    });
    tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(function (r) {
      var p = String(r['top_lightsales_products_id'] == null ? '' : r['top_lightsales_products_id']).trim(); if (!p) return;
      qty[p] = (qty[p] || 0) + num0_(r['top_lightreturn_qty']);
    });
    var out = {};
    Object.keys(qty).forEach(function (p) { var uc = firstCost[p] || 0; out[p] = { qty: qty[p], unit_cost: uc, cost: uc * qty[p] }; });
    return out;
  }
  function etStockRows_(dbId) {
    var m = etStockMap_(dbId), rows = [];
    Object.keys(m).forEach(function (p) { rows.push({ unique_id: p, product: '', unit: '', current_qty: m[p].qty, unit_cost: m[p].unit_cost, total_cost_sign: m[p].cost }); });
    return rows;
  }

  // --- 3.12 runtime schema check (physical names against the real sheet) ---
  function etSchemaCheck_(dbId) {
    var missingRequired = [], missingOptional = [];
    Object.keys(ET_FIELD_INVENTORY).forEach(function (tab) {
      var physical = [];
      try { physical = getHeaders_(getSheet_(tab, dbId)).map(function (h) { return String(h).trim(); }); } catch (e) { physical = []; }
      var inv = ET_FIELD_INVENTORY[tab];
      ['R', 'W'].forEach(function (cls) {
        (inv[cls] || []).forEach(function (name) {
          var p = etToPhysical_(tab, name);
          if (physical.indexOf(p) === -1) (cls === 'R' ? missingRequired : missingOptional).push({ tab: tab, name: name, physical: p });
        });
      });
    });
    return { ok: missingRequired.length === 0, missingRequired: missingRequired, missingOptional: missingOptional };
  }

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
      if (!unifiedCheck_(user, '37fc50edf1424abd', page, 'read')) {
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
  // allowed. Super-admin bypass preserved. Two intentional exceptions, both
  // reading no other page's sheets: get_page_versions gates itself on the page
  // asked about (see getPageVersions_), and get_xlsx_export builds an xlsx
  // from client-supplied cells only.
  function guard_(user, action) {
    if (user && user.isSuperAdmin) return;
    if (action === 'get_page_versions' || action === 'get_xlsx_export') return;
    const req = PAGE_ACCESS[action];
    if (!req) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    const need = _normalizeAccess_(req.access);
    // unified: view=any, add=write/full, edit/delete=full only
    if (!unifiedCheck_(user, COMPANY_UID, req.page, need)) {
      throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  // Phase 3: Valley-style tenant double-check. dbId must be this company's own
  // spreadsheet; a mismatched dbId (cross-tenant routing fault) is denied
  // before any sheet read.
  function authorize_(user, dbId) {
    if (!user || (!user.isSuperAdmin && user.company !== COMPANY_UID) || !dbId || String(dbId) !== String(getCompanySpreadsheetId_(COMPANY_UID))) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  }
  function dispatch_(payload, user, dbId) {
    const action = payload.module_action;
    if (!actions[action]) throw new Error('Unknown Testing System action: ' + action);
    guard_(user, action);
    /* Phase 2: defensive gate so direct dispatch also validates. Status-only
     * paths skip field validation inside validateBeforeWrite; handlers still
     * enforce status via canTransition/assertTransition_. */
    if (typeof validateBeforeWrite === 'function' && typeof docTypeForAction_ === 'function') {
      var __dt = docTypeForAction_(action);
      if (__dt) validateBeforeWrite(__dt, payload, dbId);
    }
    return actions[action](payload.data, user, dbId);
  }

  // =========================================
  // Page-level access control + audit mapping.
  // page values MUST match the `action` strings in registerTopLight_'s pages
  // array (Company_TopLight_Registry.js) verbatim — they are what
  // ERP_Pages_Matrix.page_id references and what checkPageAccess_ enforces.
  // get_et_dashboard_data is intentionally absent: it is shadowed by the global
  // ROUTES['get_et_dashboard_data'] and never reaches this dispatcher.
  // get_xlsx_export is intentionally unmapped: generic client-data exporter
  // usable from any page (coarse get_/add_ rules still apply).
  // =========================================
    /* One declaration per routine action. PAGE_ACCESS and ACTION_TABLES below are compatibility projections.
   * page/navigation metadata remains separate in Company_TopLight_Registry.js.
   * Empty page/table values intentionally preserve the existing unmapped
   * behavior for dashboard/export/special actions. */
  const ACTION_DEFINITIONS = {
    'get_et_dashboard_data': { handler: getDashboardData_, page: '', access: '', primaryLogTable: '' },
    'get_et_kpi_data': { handler: getKpiData_, page: 'et_kpi', access: 'read', primaryLogTable: '' },
    'get_et_products': { handler: getProducts_, page: 'et_products', access: 'read', primaryLogTable: PRODUCTS_SHEET },
    'add_et_product': { handler: addProduct_, page: 'et_products', access: 'write', primaryLogTable: PRODUCTS_SHEET },
    'edit_et_product': { handler: editProduct_, page: 'et_products', access: 'full', primaryLogTable: PRODUCTS_SHEET },
    'get_et_parties': { handler: getParties_, page: 'et_customers', access: 'read', primaryLogTable: CUSTOMERS_SHEET },
    'add_et_party': { handler: addParty_, page: 'et_customers', access: 'write', primaryLogTable: CUSTOMERS_SHEET },
    'edit_et_party': { handler: editParty_, page: 'et_customers', access: 'full', primaryLogTable: CUSTOMERS_SHEET },
    'get_et_purchasing_headers': { handler: getPurchasingHeaders_, page: 'et_purchasing', access: 'read', primaryLogTable: PURCHASING_SHEET },
    'get_et_purchasing_options': { handler: getPurchasingOptions_, page: 'et_purchasing', access: 'read', primaryLogTable: PURCHASING_SHEET },
    'get_et_purchasing_lines': { handler: getPurchasingLines_, page: 'et_purchasing', access: 'read', primaryLogTable: PURCHASING_LINES_SHEET },
    'get_et_purchase_print': { handler: getPurchasePrint_, page: 'et_purchase_print', access: 'read', primaryLogTable: PURCHASING_SHEET },
    'add_et_purchasing': { handler: addPurchasing_, page: 'et_purchasing', access: 'write', primaryLogTable: PURCHASING_SHEET },
    'edit_et_purchasing': { handler: editPurchasing_, page: 'et_purchasing', access: 'full', primaryLogTable: PURCHASING_SHEET },
    'delete_et_purchasing': { handler: deletePurchasing_, page: 'et_purchasing', access: 'full', primaryLogTable: PURCHASING_SHEET },
    'approve_et_purchasing': { handler: approvePurchasing_, page: 'et_purchasing', access: 'write', primaryLogTable: PURCHASING_SHEET },
    'get_et_sales_headers': { handler: getSalesHeaders_, page: 'et_sales', access: 'read', primaryLogTable: SALES_SHEET },
    'get_et_sales_options': { handler: getSalesOptions_, page: 'et_sales', access: 'read', primaryLogTable: SALES_SHEET },
    'get_et_sales_lines': { handler: getSalesLines_, page: 'et_sales', access: 'read', primaryLogTable: SALES_LINES_SHEET },
    'get_et_sales_print': { handler: getSalesPrint_, page: 'et_sales_print', access: 'read', primaryLogTable: SALES_SHEET },
    'get_et_sales_costing': { handler: getSalesCosting_, page: 'et_sales_costing_print', access: 'read', primaryLogTable: SALES_SHEET },
    'add_et_sales': { handler: addSales_, page: 'et_sales', access: 'write', primaryLogTable: SALES_SHEET },
    'edit_et_sales': { handler: editSales_, page: 'et_sales', access: 'full', primaryLogTable: SALES_SHEET },
    'delete_et_sales': { handler: deleteSales_, page: 'et_sales', access: 'full', primaryLogTable: SALES_SHEET },
    'approve_et_sales': { handler: approveSales_, page: 'et_sales', access: 'write', primaryLogTable: SALES_SHEET },
    'get_et_sales_returns': { handler: getSalesReturns_, page: 'et_sales_returns', access: 'read', primaryLogTable: SALES_RETURNS_SHEET },
    'add_et_sales_return': { handler: addSalesReturn_, page: 'et_sales_returns', access: 'write', primaryLogTable: SALES_RETURNS_SHEET },
    'delete_et_sales_return': { handler: deleteSalesReturn_, page: 'et_sales_returns', access: 'full', primaryLogTable: SALES_RETURNS_SHEET },
    'get_et_cash_headers': { handler: getCashHeaders_, page: 'et_cash', access: 'read', primaryLogTable: CASH_SHEET },
    'add_et_cash': { handler: addCash_, page: 'et_cash', access: 'write', primaryLogTable: CASH_SHEET },
    'edit_et_cash': { handler: editCash_, page: 'et_cash', access: 'full', primaryLogTable: CASH_SHEET },
    'delete_et_cash': { handler: deleteCash_, page: 'et_cash', access: 'full', primaryLogTable: CASH_SHEET },
    'approve_et_cash': { handler: approveCash_, page: 'et_cash', access: 'write', primaryLogTable: CASH_SHEET },
    'add_et_transfer': { handler: addTransfer_, page: 'et_cash', access: 'write', primaryLogTable: CASH_SHEET },
    'get_et_customer_statement': { handler: getCustomerStatement_, page: 'et_customer_statement', access: 'read', primaryLogTable: CUSTOMERS_SHEET },
    'get_et_sales_offer_headers': { handler: getSalesOfferHeaders_, page: 'et_sales_offer', access: 'read', primaryLogTable: OFFER_SHEET },
    'get_et_sales_offer_lines': { handler: getSalesOfferLines_, page: 'et_sales_offer', access: 'read', primaryLogTable: OFFER_LINES_SHEET },
    'get_et_sales_offer_print': { handler: getSalesOfferPrint_, page: 'et_sales_offer_print', access: 'read', primaryLogTable: OFFER_SHEET },
    'add_et_sales_offer': { handler: addSalesOffer_, page: 'et_sales_offer', access: 'write', primaryLogTable: OFFER_SHEET },
    'edit_et_sales_offer': { handler: editSalesOffer_, page: 'et_sales_offer', access: 'full', primaryLogTable: OFFER_SHEET },
    'delete_et_sales_offer': { handler: deleteSalesOffer_, page: 'et_sales_offer', access: 'full', primaryLogTable: OFFER_SHEET },
    'approve_et_sales_offer': { handler: approveSalesOffer_, page: 'et_sales_offer', access: 'write', primaryLogTable: OFFER_SHEET },
    'get_et_sales_analysis': { handler: getSalesAnalysis_, page: 'et_sales_analysis', access: 'read', primaryLogTable: SALES_SHEET },
    'get_et_sales_costing_analysis': { handler: getSalesCostingAnalysis_, page: 'et_sales_costing_analysis', access: 'read', primaryLogTable: SALES_SHEET },
    'get_et_income_statement': { handler: getIncomeStatement_, page: 'et_income_statement', access: 'read', primaryLogTable: SALES_SHEET },
    'get_et_financial_position': { handler: getFinancialPosition_, page: 'et_financial_position', access: 'read', primaryLogTable: CASH_SHEET },
    'get_et_cash_report': { handler: getCashReport_, page: 'et_cash_report', access: 'read', primaryLogTable: CASH_SHEET },
    'get_xlsx_export': { handler: getXlsxExport_, page: '', access: '', primaryLogTable: '' },
    'get_et_purchase_needs': { handler: getPurchaseNeeds_, page: 'et_purchase_needs', access: 'read', primaryLogTable: PURCHASING_LINES_SHEET },
    'get_et_product_movement': { handler: getProductMovement_, page: 'et_product_movement', access: 'read', primaryLogTable: CURRENT_PRODUCTS_SHEET },
    'prefetch_refs': { handler: prefetchRefs_, page: 'et_dashboard', access: 'read', primaryLogTable: PRODUCTS_SHEET },
    'get_page_versions': { handler: getPageVersions_, page: '', access: '', primaryLogTable: '' }
  };

  const PAGE_ACCESS = {};
  const ACTION_TABLES = {};
  Object.keys(ACTION_DEFINITIONS).forEach(function (action) {
    const definition = ACTION_DEFINITIONS[action];
    if (definition.page && definition.access) {
      PAGE_ACCESS[action] = { page: definition.page, access: definition.access };
    }
    if (definition.primaryLogTable) ACTION_TABLES[action] = definition.primaryLogTable;
  });

  /** Page for a module_action, for both page-access enforcement and SystemLog. */
  function pageForAction_(action) {
    const req = PAGE_ACCESS[action];
    return req ? req.page : '';
  }

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

  const TL_AUDIT_COLUMNS = ['deleted_at', 'deleted_by', 'version'];

  const TL_SCHEMAS = (function () {
    const schemas = {};
    schemas[PRODUCTS_SHEET] = {
      key: 'id',
      required: ['name_ar'],
      defaults: { name_en: '', category: '', unit: '', carton: '', sales_tax: '', asset_code: '' },
      derived: null
    };
    schemas[CUSTOMERS_SHEET] = {
      key: 'id',
      required: ['name'],
      defaults: { customer_direction: 'customer', type: '', country: '', region: '', registration_number: '', tax_id: '', name_en: '', telephone: '', address: '' },
      derived: null
    };
    schemas[CATEGORIES_SHEET] = {
      key: 'id',
      required: ['name_ar'],
      defaults: { name_eng: '' },
      derived: null
    };
    schemas[PURCHASING_SHEET] = { key: 'unique_id', required: ['code'], derived: 'purchasing_header' };
    schemas[PURCHASING_LINES_SHEET] = { key: 'unique_id', required: [], derived: 'purchasing_line' };
    schemas[SALES_SHEET] = { key: 'invoice_unique_id', required: [], derived: 'sales_header' };
    schemas[SALES_LINES_SHEET] = { key: 'unique_id', required: [], derived: 'sales_line' };
    schemas[SALES_RETURNS_SHEET] = { key: 'unique_id', required: ['top_lightsales_invoices_id', 'top_lightsales_products_id'], derived: null };
    schemas[OFFER_SHEET] = { key: 'invoice_unique_id', required: [], derived: 'sales_header' };
    schemas[OFFER_LINES_SHEET] = { key: 'unique_id', required: [], derived: 'sales_line' };
    schemas[CASH_SHEET] = { key: 'transaction_id', required: [], derived: 'cash' };
    return schemas;
  })();

  function tlSchema_(table) {
    return TL_SCHEMAS[table] || { key: 'unique_id', required: [], defaults: {}, derived: null };
  }

  function tlHeaderIndex_(headers, name) {
    const wanted = String(name).trim();
    let i = headers.findIndex(function (h) { return String(h).trim() === wanted; });
    if (i === -1) i = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === wanted.toLowerCase(); });
    return i;
  }

  function tlRefreshHeaderCache_(sheet) {
    try { delete _headerCache_[sheet.getParent().getId() + '_' + sheet.getSheetId()]; } catch (e) {}
  }

  function tlDbEnsureColumns_(sheet, headers, columns) {
    const missing = (columns || []).filter(function (c) { return tlHeaderIndex_(headers, c) === -1; });
    if (!missing.length) return headers;
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    noteMutation_(sheet);
    tlRefreshHeaderCache_(sheet);
    return etHeaders_(sheet);
  }

  function tlDbRowRecord_(headers, row) {
    const record = {};
    headers.forEach(function (h, i) { record[String(h).trim()] = row[i] !== undefined ? row[i] : ''; });
    return record;
  }

  function tlDbLowerMap_(payload) {
    const byLower = {};
    Object.keys(payload || {}).forEach(function (k) {
      const key = String(k).trim().toLowerCase();
      if (byLower[key] === undefined) byLower[key] = payload[k];
    });
    return byLower;
  }

  function tlDbApplyPayload_(table, payload, headers, opts) {
    const schema = tlSchema_(table);
    const byLower = tlDbLowerMap_(payload);
    const row = headers.map(function () { return ''; });
    headers.forEach(function (h, i) {
      const name = String(h).trim();
      if (payload[name] !== undefined) { row[i] = payload[name]; return; }
      const lower = name.toLowerCase();
      if (byLower[lower] !== undefined) { row[i] = byLower[lower]; return; }
      if (schema.defaults && schema.defaults[lower] !== undefined) { row[i] = schema.defaults[lower]; return; }
      if (lower === 'user') row[i] = (opts && opts.user && opts.user.email) || '';
      if (lower === 'created_at') row[i] = new Date();
      if (lower === 'deleted_at' || lower === 'deleted_by') row[i] = '';
      if (lower === 'version') row[i] = 0;
    });
    return row;
  }

  function tlDbValidate_(table, payload) {
    const schema = tlSchema_(table);
    const byLower = tlDbLowerMap_(payload);
    const missing = (schema.required || []).filter(function (f) {
      const v = payload[f] !== undefined ? payload[f] : byLower[String(f).toLowerCase()];
      return v === undefined || v === null || String(v).trim() === '';
    });
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
  }

  function tlDbLocate_(sheet, keyIdx, keyValue) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const values = sheet.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues();
    const wanted = String(keyValue == null ? '' : keyValue).trim();
    const wantedLower = wanted.toLowerCase();
    let rowNumber = -1;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0] == null ? '' : values[i][0]).trim() === wanted) { rowNumber = i + 2; break; }
    }
    if (rowNumber === -1) {
      for (let i = 0; i < values.length; i++) {
        if (String(values[i][0] == null ? '' : values[i][0]).trim().toLowerCase() === wantedLower) { rowNumber = i + 2; break; }
      }
    }
    if (rowNumber === -1) return null;
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    return { rowNumber: rowNumber, row: row };
  }

  function tlDbAppendRow_(sheet, row) {
    const newRow = sheet.getLastRow() + 1;
    if (newRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), newRow - sheet.getMaxRows());
    noteMutation_(sheet);
    sheet.getRange(newRow, 1, 1, row.length).setValues([row]);
    noteMutation_(sheet);
    return newRow;
  }

  function tlDbCreate_(dbId, table, payload, opts) {
    opts = opts || {};
    tlDbValidate_(table, payload);
    const sheet = getSheet_(table, dbId);
    let headers = etHeaders_(sheet);
    headers = tlDbEnsureColumns_(sheet, headers, TL_AUDIT_COLUMNS);
    const schema = tlSchema_(table);
    const row = tlDbApplyPayload_(table, payload, headers, opts);
    const idIdx = tlHeaderIndex_(headers, 'id');
    const keyIdx = tlHeaderIndex_(headers, schema.key);
    if (keyIdx === -1) throw new Error('Missing key column "' + schema.key + '" in ' + table);
    return executeWithLock_(function () {
      if (idIdx !== -1 && String(row[idIdx]).trim() === '') row[idIdx] = getNextIdUnderLock_(dbId, table, etCol_(table, 'id'));
      tlDbDeriveRow_(dbId, table, row, headers, {});
      const rowNumber = tlDbAppendRow_(sheet, row);
      const record = tlDbRowRecord_(headers, row);
      return { status: 'success', rowNumber: rowNumber, record: record, assignedId: row[keyIdx] };
    });
  }

  function tlDbAppendValues_(dbId, table, rowValues, opts) {
    opts = opts || {};
    const sheet = getSheet_(table, dbId);
    let headers = etHeaders_(sheet);
    headers = tlDbEnsureColumns_(sheet, headers, TL_AUDIT_COLUMNS);
    const row = rowValues.slice();
    while (row.length < headers.length) row.push('');
    return executeWithLock_(function () {
      tlDbDeriveRow_(dbId, table, row, headers, opts.ctx || {});
      const rowNumber = tlDbAppendRow_(sheet, row);
      return { rowNumber: rowNumber, record: tlDbRowRecord_(headers, row), headers: headers };
    });
  }

  function tlDbAppendValuesBatch_(dbId, table, rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) return { startRow: 0, headers: [] };
    const sheet = getSheet_(table, dbId);
    let headers = etHeaders_(sheet);
    headers = tlDbEnsureColumns_(sheet, headers, TL_AUDIT_COLUMNS);
    const normalized = rows.map(function (r) {
      const row = r.slice();
      while (row.length < headers.length) row.push('');
      return row;
    });
    return executeWithLock_(function () {
      normalized.forEach(function (row) { tlDbDeriveRow_(dbId, table, row, headers, {}); });
      const startRow = sheet.getLastRow() + 1;
      const lastNeeded = startRow + normalized.length - 1;
      if (lastNeeded > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), lastNeeded - sheet.getMaxRows());
      noteMutation_(sheet);
      sheet.getRange(startRow, 1, normalized.length, headers.length).setValues(normalized);
      noteMutation_(sheet);
      return { startRow: startRow, headers: headers };
    });
  }

  function tlDbPatch_(dbId, table, keyValue, changes, opts) {
    opts = opts || {};
    const schema = tlSchema_(table);
    const keyField = opts.keyField || schema.key;
    const sheet = getSheet_(table, dbId);
    let headers = etHeaders_(sheet);
    headers = tlDbEnsureColumns_(sheet, headers, TL_AUDIT_COLUMNS);
    const keyIdx = tlHeaderIndex_(headers, keyField);
    if (keyIdx === -1) throw new Error('Missing key column "' + keyField + '" in ' + table);
    const located = tlDbLocate_(sheet, keyIdx, keyValue);
    if (!located) return null;
    const row = located.row.slice();
    while (row.length < headers.length) row.push('');
    const oldRecord = tlDbRowRecord_(headers, row);
    const deletedIdx = tlHeaderIndex_(headers, 'deleted_at');
    if (deletedIdx !== -1 && String(row[deletedIdx] == null ? '' : row[deletedIdx]).trim() !== '' && !opts.allowDeleted) {
      throw new Error('Record is deleted: ' + table + '/' + keyValue);
    }
    const currentVersion = getRowVersion_(oldRecord);
    if (opts.version !== undefined && opts.version !== null && opts.version !== '') {
      checkRowVersion_(oldRecord, opts.version);
    }
    Object.keys(changes || {}).forEach(function (k) {
      const i = tlHeaderIndex_(headers, k);
      if (i !== -1) row[i] = changes[k];
    });
    const versionIdx = tlHeaderIndex_(headers, 'version');
    if (versionIdx !== -1) row[versionIdx] = currentVersion + 1;
    const updatedIdx = tlHeaderIndex_(headers, 'updated_at');
    if (updatedIdx !== -1 && opts.touchUpdatedAt !== false) row[updatedIdx] = new Date();
    tlDbDeriveRow_(dbId, table, row, headers, { rowNumber: located.rowNumber });
    sheet.getRange(located.rowNumber, 1, 1, row.length).setValues([row]);
    noteMutation_(sheet);
    noteTableChange_(dbId, table);
    const record = tlDbRowRecord_(headers, row);
    return { record: record, oldRecord: oldRecord, rowNumber: located.rowNumber, version: versionIdx !== -1 ? record[String(headers[versionIdx]).trim()] : currentVersion };
  }

  function tlDbSoftDelete_(dbId, table, keyValue, opts) {
    opts = opts || {};
    return tlDbPatch_(dbId, table, keyValue, {
      deleted_at: new Date(),
      deleted_by: (opts.user && opts.user.email) || ''
    }, Object.assign({}, opts, { allowDeleted: true, touchUpdatedAt: false }));
  }

  function tlDbSoftDeleteWhere_(dbId, table, keyField, keyValue, opts) {
    opts = opts || {};
    const sheet = getSheet_(table, dbId);
    let headers = etHeaders_(sheet);
    headers = tlDbEnsureColumns_(sheet, headers, TL_AUDIT_COLUMNS);
    const keyIdx = tlHeaderIndex_(headers, keyField);
    const delIdx = tlHeaderIndex_(headers, 'deleted_at');
    const byIdx = tlHeaderIndex_(headers, 'deleted_by');
    if (keyIdx === -1 || delIdx === -1) return 0;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return 0;
    const keys = sheet.getRange(2, keyIdx + 1, lastRow - 1, 1).getValues();
    const wanted = String(keyValue == null ? '' : keyValue).trim();
    let count = 0;
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0] == null ? '' : keys[i][0]).trim() !== wanted) continue;
      const rowNumber = i + 2;
      const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
      if (String(row[delIdx] == null ? '' : row[delIdx]).trim() !== '') continue;
      row[delIdx] = new Date();
      if (byIdx !== -1) row[byIdx] = (opts.user && opts.user.email) || '';
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      noteMutation_(sheet);
      count++;
    }
    if (count) noteTableChange_(dbId, table);
    return count;
  }

  function tlDbList_(dbId, table) {
    if (table === CURRENT_PRODUCTS_SHEET) return etStockRows_(dbId);
    const rows = etRecords_(dbId, table);
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const deleted = rows[i].deleted_at;
      if (deleted !== undefined && deleted !== null && String(deleted).trim() !== '') continue;
      out.push(rows[i]);
    }
    return out;
  }

  function tlDbFind_(dbId, table, keyField, keyValue) {
    const wanted = String(keyValue == null ? '' : keyValue).trim().toLowerCase();
    const rows = tlDbList_(dbId, table);
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][keyField];
      if (String(v == null ? '' : v).trim().toLowerCase() === wanted) return rows[i];
    }
    return null;
  }

  function tlDbDeriveRow_(dbId, table, row, headers, ctx) {
    const schema = tlSchema_(table);
    if (!schema.derived) return row;
    const idx = {};
    headers.forEach(function (h, i) { idx[String(h).trim().toLowerCase()] = i; });
    if (schema.derived === 'purchasing_header') tlDerivePurchasingHeader_(row, idx);
    else if (schema.derived === 'purchasing_line') tlDerivePurchasingLine_(dbId, row, idx);
    else if (schema.derived === 'sales_header') tlDeriveSalesHeader_(row, idx);
    else if (schema.derived === 'sales_line') tlDeriveSalesLine_(row, idx);
    else if (schema.derived === 'cash') tlDeriveCash_(dbId, row, idx, ctx || {});
    return row;
  }

  function tlDerivePurchasingHeader_(row, idx) {
    const get = function (n) { return idx[n] !== undefined ? row[idx[n]] : undefined; };
    const set = function (n, v) { if (idx[n] !== undefined) row[idx[n]] = v; };
    const value = num0_(get('value'));
    const rate = num0_(get('exchange rate'));
    set('value based on invoice', value * rate);
    const sumCols = ['value based on invoice', 'administrative expenses', 'customs expenses',
      'unloading expenses', 'bank commission', 'customs clearance and port receipts',
      'additional fees', 'clearance expenses', 'other expenses'];
    let sum = 0;
    sumCols.forEach(function (c) { sum += num0_(get(c)); });
    const isSale = String(get('type') == null ? '' : get('type')).trim() === 'بيع';
    const total = isSale ? sum : sum + num0_(get('internal cost adjustment')) + num0_(get('purchase tax'));
    set('total costs', total);
    const date = parseDate_(get('reciept date'));
    if (date instanceof Date && !isNaN(date.getTime())) {
      set('month', date.getMonth() + 1);
      set('year', date.getFullYear());
    }
    const shipping = String(get('shipping type') == null ? '' : get('shipping type')).trim();
    if (idx['cif insurance rate'] !== undefined) {
      row[idx['cif insurance rate']] = (shipping === 'CIF' && value > 0)
        ? (num0_(get('if shipping via cif, enter the insurance value.')) - value) / value
        : '';
    }
    const denom = num0_(get('importation re-price')) + num0_(get('customs expenses'));
    let taxType = '';
    if (denom > 0) {
      const ratio = num0_(get('purchase tax')) / denom;
      taxType = ratio >= 0.08 ? 0.14 : ratio;
    }
    set('tax type', taxType);
    const salesValue = isSale ? Math.round((total * 103 / 100) / 100) * 100 : 0;
    set('sales value', salesValue);
    set('sales tax amount', (typeof taxType === 'number' && taxType > 0.06) ? salesValue * 14 / 100 : 0);
  }

  function tlDerivePurchasingLine_(dbId, row, idx) {
    const get = function (n) { return idx[n] !== undefined ? row[idx[n]] : undefined; };
    const set = function (n, v) { if (idx[n] !== undefined) row[idx[n]] = v; };
    const qty = num0_(get('qty'));
    const unitPrice = num0_(get('unit_price'));
    const rate = num0_(get('exchange_rate'));
    const other = num0_(get('other_cost'));
    const totalCost = qty * unitPrice * rate + other;
    set('total_cost', totalCost);
    set('unit_cost', qty > 0 ? totalCost / qty : 0);
    set('sales_value_amount', num0_(get('sales_value')) * qty);
    set('sales_qty', qty);
    if (idx['cost_currency'] !== undefined) row[idx['cost_currency']] = qty * unitPrice + other / (rate || 1);
    if (idx['movement_code'] !== undefined) {
      const productId = String(get('product') == null ? '' : get('product')).trim();
      let productName = '';
      try {
        productRefs_(dbId).forEach(function (p) { if (String(p.id) === productId) productName = p.name_ar || ''; });
      } catch (e) {}
      const date = parseDate_(get('receipt_date'));
      const dateText = (date instanceof Date && !isNaN(date.getTime()))
        ? ('0' + date.getDate()).slice(-2) + '/' + ('0' + (date.getMonth() + 1)).slice(-2) + '/' + date.getFullYear()
        : '';
      set('movement_code', String(get('movement_type') == null ? '' : get('movement_type')) + '-' + String(get('id') == null ? '' : get('id')) + '-' + productName + '-' + dateText);
    }
  }

  function tlDeriveSalesHeader_(row, idx) {
    const get = function (n) { return idx[n] !== undefined ? row[idx[n]] : undefined; };
    const set = function (n, v) { if (idx[n] !== undefined) row[idx[n]] = v; };
    const tax = num0_(get('قيمة الضريبة'));
    const net = num0_(get('المبلغ الصافي'));
    set('نوع سلع الجدول', net > 0 ? (Math.abs(tax / net - 0.05) < 1e-9 ? 1 : 0) : '');
    const date = parseDate_(get('تاريخ الفاتورة'));
    if (date instanceof Date && !isNaN(date.getTime())) {
      set('الشهر', date.getMonth() + 1);
      set('العام', date.getFullYear());
    }
  }

  function tlDeriveSalesLine_(row, idx) {
    const get = function (n) { return idx[n] !== undefined ? row[idx[n]] : undefined; };
    const set = function (n, v) { if (idx[n] !== undefined) row[idx[n]] = v; };
    const net = num0_(get('product_qty')) * num0_(get('product_price'));
    const taxValue = net * num0_(get('product_tax'));
    set('product_net_value', net);
    set('product_tax_value', taxValue);
    set('product_total_value', net - num0_(get('product_discount')) + taxValue);
  }

  function tlCashRowBalance_(record) {
    const stored = record.balance_amount;
    if (stored !== undefined && stored !== null && String(stored).trim() !== '') return Number(stored) || 0;
    const amount = num0_(record.transaction_amount);
    const discount = num0_(record.total_discount);
    const taxes = num0_(record.taxes);
    const rate = num0_(record.exchange_rate);
    const total = ((amount - discount) * rate) + (taxes * rate);
    return isCreditType_(record.transaction_type) ? -total : total;
  }

  function tlChartPositionalLookup_(dbId, chartCode) {
    const wanted = String(chartCode == null ? '' : chartCode).trim();
    if (!wanted) return { name: '', main: '' };
    try {
      const map = tlRefs_(dbId, 'chart_positional', function () {
        const out = {};
        etRecords_(dbId, CHART_SHEET).forEach(function (r) {
          const key = String(r[ET_CHART_COLS.key] == null ? '' : r[ET_CHART_COLS.key]).trim();
          if (!key || out[key]) return;
          out[key] = { name: r[ET_CHART_COLS.name] == null ? '' : r[ET_CHART_COLS.name], main: r[ET_CHART_COLS.main] == null ? '' : r[ET_CHART_COLS.main] };
        });
        return out;
      });
      return map[wanted] || { name: '', main: '' };
    } catch (e) {
      return { name: '', main: '' };
    }
  }

  function tlCashBoxBalanceBefore_(dbId, box, rowNumber) {
    const wanted = String(box == null ? '' : box).trim();
    if (!wanted) return 0;
    try {
      const sheet = getSheet_(CASH_SHEET, dbId);
      const headers = etHeaders_(sheet);
      const boxIdx = tlHeaderIndex_(headers, 'related_box');
      const balIdx = tlHeaderIndex_(headers, 'balance_amount');
      const delIdx = tlHeaderIndex_(headers, 'deleted_at');
      if (boxIdx === -1) return 0;
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return 0;
      const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      let sum = 0;
      for (let i = 0; i < values.length; i++) {
        const physicalRow = i + 2;
        if (rowNumber && physicalRow >= rowNumber) break;
        const row = values[i];
        if (delIdx !== -1 && String(row[delIdx] == null ? '' : row[delIdx]).trim() !== '') continue;
        if (String(row[boxIdx] == null ? '' : row[boxIdx]).trim() !== wanted) continue;
        if (balIdx !== -1 && String(row[balIdx] == null ? '' : row[balIdx]).trim() !== '') sum += Number(row[balIdx]) || 0;
        else sum += tlCashRowBalance_(tlDbRowRecord_(headers, row));
      }
      return sum;
    } catch (e) {
      return 0;
    }
  }

  function tlDeriveCash_(dbId, row, idx, ctx) {
    const get = function (n) { return idx[n] !== undefined ? row[idx[n]] : undefined; };
    const set = function (n, v) { if (idx[n] !== undefined) row[idx[n]] = v; };
    const amount = num0_(get('transaction_amount'));
    const discount = num0_(get('total_discount'));
    const taxes = num0_(get('taxes'));
    const rate = num0_(get('exchange_rate'));
    const method = String(get('transaction_method') == null ? '' : get('transaction_method')).trim();
    const netAmount = method === 'فودافون كاش' ? amount * rate : (amount - discount) * rate;
    set('net_amount', netAmount);
    const total = ((amount - discount) * rate) + (taxes * rate);
    set('total', total);
    const signed = isCreditType_(get('transaction_type')) ? -total : total;
    set('balance_amount', signed);
    if (idx['name_vendor'] !== undefined && idx['name'] !== undefined) {
      const nameId = String(get('name') == null ? '' : get('name')).trim();
      let name = '';
      try {
        partyRefs_(dbId).forEach(function (p) { if (String(p.id) === nameId) name = p.name || ''; });
      } catch (e) {}
      set('name_vendor', name);
    }
    if (idx['chart_name'] !== undefined || idx['chart_account_main'] !== undefined) {
      const chart = tlChartPositionalLookup_(dbId, get('chart_code'));
      if (idx['chart_name'] !== undefined) set('chart_name', chart.name);
      if (idx['chart_account_main'] !== undefined) set('chart_account_main', chart.main);
    }
    if (idx['box_balance'] !== undefined) {
      set('box_balance', tlCashBoxBalanceBefore_(dbId, get('related_box'), ctx.rowNumber) + signed);
    }
  }

  function tlRecalcCashBoxBalances_(dbId, boxes) {
    const wanted = {};
    (boxes || []).forEach(function (b) { const k = String(b == null ? '' : b).trim(); if (k) wanted[k] = true; });
    if (!Object.keys(wanted).length) return;
    const sheet = getSheet_(CASH_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const boxIdx = tlHeaderIndex_(headers, 'related_box');
    const balIdx = tlHeaderIndex_(headers, 'box_balance');
    const delIdx = tlHeaderIndex_(headers, 'deleted_at');
    if (boxIdx === -1 || balIdx === -1) return;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    const running = {};
    const updates = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const box = String(row[boxIdx] == null ? '' : row[boxIdx]).trim();
      if (!wanted[box]) continue;
      if (delIdx !== -1 && String(row[delIdx] == null ? '' : row[delIdx]).trim() !== '') continue;
      running[box] = (running[box] || 0) + tlCashRowBalance_(tlDbRowRecord_(headers, row));
      const current = row[balIdx];
      if (String(current == null ? '' : current).trim() !== String(running[box])) {
        updates.push({ rowNumber: i + 2, value: running[box] });
      }
    }
    if (!updates.length) return;
    let run = [];
    const flush = function () {
      if (!run.length) return;
      sheet.getRange(run[0].rowNumber, balIdx + 1, run.length, 1).setValues(run.map(function (u) { return [u.value]; }));
      run = [];
    };
    updates.forEach(function (u) {
      if (run.length && u.rowNumber !== run[run.length - 1].rowNumber + 1) flush();
      run.push(u);
    });
    flush();
    noteMutation_(sheet);
  }

  // Normalize customer_direction to 'customer' | 'vendor' (handles Arabic + English).
  function normalizeDirection_(val) {
    const v = String(val).trim().toLowerCase();
    if (v === 'vendor' || v === 'مورد' || v === 'supplier') return 'vendor';
    if (v === 'customer' || v === 'عميل' || v === 'client') return 'customer';
    return '';
  }

  // Distinct non-empty string values for a column (enum dropdowns).
  function distinctValues_(rows, key) {
    const out = [];
    const seen = {};
    rows.forEach(r => {
      const v = String((r[key] == null) ? '' : r[key]).trim();
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out;
  }

  // Category ref: top_light_categories -> [{id, name_ar}].
  // Phase 11 — its own kind. This is a projected AND filtered shape; the four raw
  // consumers go through categoryRefs_. Sharing one key meant whichever ran first
  // inside the TTL won, and prefetch_refs warmed it raw, which silently dropped
  // this filter and let a blank-id category into the dropdown.
  function categoryOptions_(dbId) {
    return tlRefs_(dbId, 'categories_opts', function () {
      return tlDbList_(dbId, CATEGORIES_SHEET)
        .map(c => ({ id: c.id, name_ar: c.name_ar }))
        .filter(c => c.id !== undefined && c.id !== null && String(c.id).trim() !== '');
    });
  }

  // Asset code ref: chart_of_accounts, filter المستوى الخامس in [114100, 115100].
  // label = كود المستوى (composite text), value = المستوى الخامس (numeric code).
  function assetCodeOptions_(dbId) {
    const rows = chartRefs_(dbId);
    const out = [];
    rows.forEach(r => {
      const fifth = Number(r['المستوى الخامس']);
      if (!isNaN(fifth) && fifth >= 114100 && fifth <= 115100) {
        out.push({
          code: String((r['كود المستوى'] == null) ? '' : r['كود المستوى']),
          fifth: String((r['المستوى الخامس'] == null) ? '' : r['المستوى الخامس'])
        });
      }
    });
    return out;
  }

  // Movement type ref: chart_of_accounts, filter المستوى الخامس in [114100, 121800].
  // label = كود المستوى (composite text), value = المستوى الخامس (numeric code).
  function movementTypeOptions_(dbId) {
    const rows = chartRefs_(dbId);
    const out = [];
    rows.forEach(r => {
      const fifth = Number(r['المستوى الخامس']);
      if (!isNaN(fifth) && fifth >= 114100 && fifth <= 121800) {
        out.push({
          code: String((r['كود المستوى'] == null) ? '' : r['كود المستوى']),
          fifth: String((r['المستوى الخامس'] == null) ? '' : r['المستوى الخامس'])
        });
      }
    });
    return out;
  }

  function createCategory_(dbId, nameAr, userEmail) {
    const created = tlDbCreate_(dbId, CATEGORIES_SHEET, { name_ar: nameAr, name_eng: '', user: userEmail || '' }, {});
    bumpTlRefsVersion_(dbId);
    return created.assignedId;
  }

  // Resolve product.category: existing id, or create a new category from the
  // inline "add new" name.
  function resolveCategoryId_(data, user, dbId) {
    const newName = data && data.category_new ? String(data.category_new).trim() : '';
    if (newName) return createCategory_(dbId, newName, user ? user.email : '');
    return String((data && data.category) || '').trim();
  }

  // =========================================
  // Dashboard
  // =========================================
  function getDashboardData_(data, user, dbId) {
    const kpiAuthorized = !!(user && (user.isSuperAdmin || (user.authorizedPages && user.authorizedPages['et_dashboard'] && user.authorizedPages['et_dashboard'].indexOf('write') !== -1)));
    return {
      status: 'success',
      kpi_authorized: kpiAuthorized,
      kpis: kpiAuthorized ? dashboardKpis_(dbId) : null
    };
  }

  // Independent KPI page — Read => welcome ("مرحباً بك..."), Write => charts (same payload as dashboard, separate gate)
  function getKpiData_(data, user, dbId) {
    const kpiAuthorized = !!(user && (user.isSuperAdmin || unifiedCheck_(user, '37fc50edf1424abd', 'et_kpi', 'write')));
    return {
      status: 'success',
      kpi_authorized: kpiAuthorized,
      kpis: kpiAuthorized ? dashboardKpis_(dbId) : null
    };
  }

  function dashboardKpis_(dbId) {
    return cachedMap_('et_dashboard_kpis_' + dbId, 60, function () {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const retNet = {};
      tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(r => {
        const inv = String(r.top_lightsales_invoices_id);
        retNet[inv] = (retNet[inv] || 0) + (num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount));
      });

      const custNames = {};
      partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });

      const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const monthly = Array(12).fill(0);
      const byCustomer = {};
      let salesYtd = 0, salesMtd = 0;

      tlDbList_(dbId, SALES_SHEET).forEach(inv => {
        const d = parseDate_(inv['تاريخ الفاتورة']);
        if (!(d instanceof Date)) return;
        const net = num0_(inv['المبلغ الصافي']);
        const disc = num0_(inv['قيمة الخصم']);
        const tax = num0_(inv['قيمة الضريبة']);
        const ret = retNet[String(inv.invoice_unique_id)] || 0;
        const salesValue = net - disc + tax - ret;
        if (d.getFullYear() === year) {
          salesYtd += salesValue;
          monthly[d.getMonth()] += salesValue;
          if (d.getMonth() === month) salesMtd += salesValue;
          const cid = String((inv['اسم العميل'] == null) ? '' : inv['اسم العميل']).trim();
          if (cid) byCustomer[cid] = (byCustomer[cid] || 0) + salesValue;
        }
      });

      const monthlySales = monthly.map(function (v, i) { return { label: monthNames[i], value: v }; });

      const sortedCustomers = Object.keys(byCustomer).map(function (cid) {
        return { label: custNames[cid] || cid, value: byCustomer[cid] };
      }).sort(function (a, b) { return b.value - a.value; });

      const top = sortedCustomers.slice(0, 8);
      const rest = sortedCustomers.slice(8).reduce(function (s, c) { return s + c.value; }, 0);
      const pieData = top.map(function (c) { return { label: c.label, value: c.value }; });
      if (rest > 0) pieData.push({ label: 'أخرى', value: rest });

      let collectedCash = 0;
      const boxBal = {};
      tlDbList_(dbId, CASH_SHEET).forEach(r => {
        const rate = num0_(r.exchange_rate) || 1;
        const base = num0_(r.transaction_amount) * rate - num0_(r.total_discount) * rate + num0_(r.taxes) * rate;
        const type = String((r.transaction_type == null) ? '' : r.transaction_type).trim();
        const name = String((r.name == null) ? '' : r.name).trim();
        const d = parseDate_(r.transaction_date);
        if (type === 'Debit' && name && d instanceof Date && d.getFullYear() === year) collectedCash += base;
        const box = String((r.related_box == null) ? '' : r.related_box).trim();
        if (box) boxBal[box] = (boxBal[box] || 0) + (type === 'Debit' ? base : -base);
      });

      return {
        sales_ytd: salesYtd,
        sales_mtd: salesMtd,
        collected_cash: collectedCash,
        bank_balance: boxBal['111104'] || 0,
        box_balance: (boxBal['111101'] || 0) + (boxBal['111102'] || 0),
        monthly_sales: monthlySales,
        pie_data: pieData
      };
    });
  }

  // =========================================
  // Products — list / add / edit
  // =========================================
  function getProducts_(data, user, dbId) {
    const rows = tlDbList_(dbId, PRODUCTS_SHEET);
    const catNames = {};
    categoryRefs_(dbId).forEach(c => { catNames[String(c.id)] = c.name_ar; });
    const stockMap = {};
    tlDbList_(dbId, CURRENT_PRODUCTS_SHEET).forEach(s => {
      stockMap[String(s.unique_id)] = { qty: num0_(s.current_qty), cost: num0_(s.total_cost_sign) };
    });
    const products = rows.map(p => {
      const stock = stockMap[String(p.id)] || { qty: 0, cost: 0 };
      return {
        id: p.id,
        name_ar: p.name_ar,
        name_en: p.name_en,
        category: p.category,
        category_name: catNames[String(p.category)] || '',
        unit: p.unit,
        carton: p.carton,
        concentration: p.concentration,
        sales_tax: p.sales_tax,
        asset_code: p.asset_code,
        created_at: p.created_at,
        current_qty: stock.qty,
        total_cost_sign: stock.cost
      };
    });
    return {
      status: 'success',
      products: products,
      category_options: categoryOptions_(dbId),
      asset_code_options: assetCodeOptions_(dbId),
      unit_options: distinctValues_(rows, 'unit')
    };
  }

  function addProduct_(data, user, dbId) {
    const nameAr = String((data && data.name_ar) || '').trim();
    if (!nameAr) throw new Error('اسم المنتج مطلوب');
    const resolvedCategory = resolveCategoryId_(data, user, dbId);
    var _prodNewVals = {
      name_ar: nameAr,
      name_en: String((data && data.name_en) || '').trim(),
      category: resolvedCategory,
      unit: String((data && data.unit) || '').trim(),
      carton: (data && data.carton) || '',
      sales_tax: (data && data.sales_tax) || '',
      asset_code: String((data && data.asset_code) || '').trim(),
      user: user.email
    };
    const created = tlDbCreate_(dbId, PRODUCTS_SHEET, _prodNewVals, { user: user });
    const id = created.assignedId;
    const record = created.record;
    try { var _uid = 'create_erp_test_products_' + id; logHistory_(dbId, PRODUCTS_SHEET, _uid, String(id), (user&&user.email)||'', 'create', _prodNewVals, null); } catch(e){}
    bustTopLightCaches_(dbId, 'products');
    invalidateRefsCache_(dbId, 'products');
    var catNames = {};
    try{ categoryRefs_(dbId).forEach(function(c){ catNames[String(c.id)] = c.name_ar; }); }catch(e){}
    var savedRecord = {
      id: id,
      name_ar: nameAr,
      name_en: String((data && data.name_en) || '').trim(),
      category: resolvedCategory,
      category_name: catNames[String(resolvedCategory)] || '',
      unit: String((data && data.unit) || '').trim(),
      carton: (data && data.carton) || '',
      concentration: '',
      sales_tax: (data && data.sales_tax) || '',
      asset_code: String((data && data.asset_code) || '').trim(),
      created_at: new Date(),
      current_qty: 0,
      total_cost_sign: 0
    };
    return { status: 'success', message: 'تمت إضافة المنتج', data: record, record: savedRecord, assignedId: id, unique_id: String(id) };
  }

  function editProduct_(data, user, dbId) {
    const id = Number((data && data.id));
    if (!id) throw new Error('معرف المنتج مطلوب');
    const resolvedCat = resolveCategoryId_(data, user, dbId);
    var _editProdNewVals = {
      name_ar: String((data && data.name_ar) || '').trim(),
      name_en: String((data && data.name_en) || '').trim(),
      category: resolvedCat,
      unit: String((data && data.unit) || '').trim(),
      carton: (data && data.carton) || '',
      sales_tax: (data && data.sales_tax) || '',
      asset_code: String((data && data.asset_code) || '').trim()
    };
    const patched = tlDbPatch_(dbId, PRODUCTS_SHEET, id, _editProdNewVals, { keyField: 'id', user: user, version: data && data.version });
    if (!patched) throw new Error('المنتج غير موجود');
    var _editProdOld = patched.oldRecord;
    try { var _uid = (_editProdOld && _editProdOld.record_uid) ? String(_editProdOld.record_uid) : 'update_erp_test_products_' + id; logHistory_(dbId, PRODUCTS_SHEET, _uid, String(id), (user&&user.email)||'', 'update', _editProdNewVals, _editProdOld); } catch(e){}
    bustTopLightCaches_(dbId, 'products');
    invalidateRefsCache_(dbId, 'products');
    var catNames2 = {};
    try{ categoryRefs_(dbId).forEach(function(c){ catNames2[String(c.id)] = c.name_ar; }); }catch(e){}
    var stockMap2 = {};
    try{ tlDbList_(dbId, CURRENT_PRODUCTS_SHEET).forEach(function(s){ stockMap2[String(s.unique_id)] = { qty: num0_(s.current_qty), cost: num0_(s.total_cost_sign)}; }); }catch(e){}
    var st = stockMap2[String(id)] || { qty: 0, cost: 0 };
    var savedRecord2 = {
      id: id,
      name_ar: String((data && data.name_ar) || '').trim(),
      name_en: String((data && data.name_en) || '').trim(),
      category: resolvedCat,
      category_name: catNames2[String(resolvedCat)] || '',
      unit: String((data && data.unit) || '').trim(),
      carton: (data && data.carton) || '',
      concentration: (data && data.concentration) || '',
      sales_tax: (data && data.sales_tax) || '',
      asset_code: String((data && data.asset_code) || '').trim(),
      created_at: (data && data.created_at) || '',
      current_qty: st.qty,
      total_cost_sign: st.cost
    };
    return { status: 'success', message: 'تم تحديث المنتج', record: savedRecord2, unique_id: String(id), assignedId: id };
  }

  // =========================================
  // Customers / Vendors — list / add / edit
  // =========================================
  function getParties_(data, user, dbId) {
    const rows = tlDbList_(dbId, CUSTOMERS_SHEET);
    const direction = data && data.direction ? String(data.direction).trim().toLowerCase() : '';
    const balMap = customerBalanceMap_(dbId);
    const parties = rows
      .filter(p => !direction || normalizeDirection_(p.customer_direction) === direction)
      .map(p => ({
        id: p.id,
        name: p.name,
        customer_direction: normalizeDirection_(p.customer_direction) || p.customer_direction,
        type: p.type,
        country: p.country,
        region: p.region,
        registration_number: p.registration_number,
        tax_id: p.tax_id,
        telephone: p.telephone,
        address: p.address,
        created_at: p.created_at,
        balance: balMap[String(p.id)] || 0
      }));
    return {
      status: 'success',
      parties: parties,
      type_options: distinctValues_(rows, 'type'),
      country_options: distinctValues_(rows, 'country'),
      region_options: distinctValues_(rows, 'region')
    };
  }

  function addParty_(data, user, dbId) {
    const name = String((data && data.name) || '').trim();
    if (!name) throw new Error('الاسم مطلوب');
    const directionVal = String((data && data.customer_direction) || 'customer').trim();
    var _partyNewVals = {
      name: name,
      customer_direction: directionVal,
      type: String((data && data.type) || '').trim(),
      country: String((data && data.country) || '').trim(),
      region: String((data && data.region) || '').trim(),
      registration_number: String((data && data.registration_number) || '').trim(),
      tax_id: String((data && data.tax_id) || '').trim(),
      name_en: String((data && data.name_en) || '').trim(),
      telephone: String((data && data.telephone) || '').trim(),
      address: String((data && data.address) || '').trim(),
      user: user.email
    };
    const created = tlDbCreate_(dbId, CUSTOMERS_SHEET, _partyNewVals, { user: user });
    const id = created.assignedId;
    const record = created.record;
    try { var _uid = 'create_erp_test_customer_vendor_' + id; logHistory_(dbId, CUSTOMERS_SHEET, _uid, String(id), (user&&user.email)||'', 'create', _partyNewVals, null); } catch(e){}
    bustTopLightCaches_(dbId, 'parties');
    invalidateRefsCache_(dbId, 'parties');
    var savedParty = {
      id: id,
      name: name,
      customer_direction: normalizeDirection_(directionVal) || directionVal,
      type: String((data && data.type) || '').trim(),
      country: String((data && data.country) || '').trim(),
      region: String((data && data.region) || '').trim(),
      registration_number: String((data && data.registration_number) || '').trim(),
      tax_id: String((data && data.tax_id) || '').trim(),
      telephone: String((data && data.telephone) || '').trim(),
      address: String((data && data.address) || '').trim(),
      created_at: new Date(),
      balance: 0
    };
    return { status: 'success', message: 'تمت إضافة الطرف', data: record, record: savedParty, assignedId: id, unique_id: String(id) };
  }

  function editParty_(data, user, dbId) {
    const id = Number((data && data.id));
    if (!id) throw new Error('معرف الطرف مطلوب');
    const dirVal = String((data && data.customer_direction) || 'customer').trim();
    var _editPartyNewVals = {
      name: String((data && data.name) || '').trim(),
      customer_direction: dirVal,
      type: String((data && data.type) || '').trim(),
      country: String((data && data.country) || '').trim(),
      region: String((data && data.region) || '').trim(),
      registration_number: String((data && data.registration_number) || '').trim(),
      tax_id: String((data && data.tax_id) || '').trim(),
      name_en: String((data && data.name_en) || '').trim(),
      telephone: String((data && data.telephone) || '').trim(),
      address: String((data && data.address) || '').trim()
    };
    const patched = tlDbPatch_(dbId, CUSTOMERS_SHEET, id, _editPartyNewVals, { keyField: 'id', user: user, version: data && data.version });
    if (!patched) throw new Error('الطرف غير موجود');
    var _editPartyOld = patched.oldRecord;
    try { var _uid = (_editPartyOld && _editPartyOld.record_uid) ? String(_editPartyOld.record_uid) : 'update_erp_test_customer_vendor_' + id; logHistory_(dbId, CUSTOMERS_SHEET, _uid, String(id), (user&&user.email)||'', 'update', _editPartyNewVals, _editPartyOld); } catch(e){}
    bustTopLightCaches_(dbId, 'parties');
    invalidateRefsCache_(dbId, 'parties');
    var balMap = {};
    try{ balMap = customerBalanceMap_(dbId); }catch(e){}
    var savedParty2 = {
      id: id,
      name: String((data && data.name) || '').trim(),
      customer_direction: normalizeDirection_(dirVal) || dirVal,
      type: String((data && data.type) || '').trim(),
      country: String((data && data.country) || '').trim(),
      region: String((data && data.region) || '').trim(),
      registration_number: String((data && data.registration_number) || '').trim(),
      tax_id: String((data && data.tax_id) || '').trim(),
      telephone: String((data && data.telephone) || '').trim(),
      address: String((data && data.address) || '').trim(),
      created_at: (data && data.created_at) || '',
      balance: balMap[String(id)] || 0
    };
    return { status: 'success', message: 'تم تحديث الطرف', record: savedParty2, unique_id: String(id), assignedId: id };
  }

  // =========================================
  // Purchasing — costing header + product lines (master-detail)
  // =========================================
  /**
   * Phase 2, step 2.5 — hoist the per-row alias key-scan.
   *
   * The `pick()` closure below used to be rebuilt for every row and, for every
   * alias it was given, walked every key of the record with a lowercase+replace
   * on both sides: O(rows x fields x columns) string operations to read 8 fields.
   *
   * All records from getAllRecords_ share one key set (they are built from the
   * same header array), so the normalised-name -> actual-key mapping is resolved
   * ONCE here and reused for every row.
   *
   * Equivalence detail: the original scanned *all* keys matching an alias and
   * returned the first whose value was non-blank, so two headers normalising to
   * the same name (e.g. 'reciept date' and 'reciept_date') fall through from a
   * blank one to the next. The map therefore holds an ARRAY of actual keys per
   * normalised name, in key-enumeration (column) order, and the resolver walks it
   * the same way.
   */
  function makeAliasPicker_(sampleRow) {
    const byNorm = {};
    for (var kk in sampleRow) {
      var n = String(kk).toLowerCase().replace(/_/g, ' ');
      if (!byNorm[n]) byNorm[n] = [];
      byNorm[n].push(kk);
    }
    return function (obj) {
      var keys = Array.prototype.slice.call(arguments, 1);
      for (var i = 0; i < keys.length; i++) {
        var actuals = byNorm[String(keys[i]).toLowerCase().replace(/_/g, ' ')];
        if (!actuals) continue;
        for (var j = 0; j < actuals.length; j++) {
          var v = obj[actuals[j]];
          if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
      }
      return '';
    };
  }

  function getPurchasingHeaders_(data, user, dbId) {
    var limit = Number(data && data.limit) || 20;
    const rows = tlDbList_(dbId, PURCHASING_SHEET);
    const vendorNames = {};
    partyRefs_(dbId).forEach(v => { vendorNames[String(v.id)] = v.name; });
    const pick = rows.length ? makeAliasPicker_(rows[0]) : function () { return ''; };

    // Phase 2.2 — decorate/sort/slice, then map only the visible rows.
    // The old code sorted the MAPPED records on rec['reciept date'] (the picked
    // value) falling back to the raw 'receipt date' / 'reciept_date' / unique_id
    // keys, and called parseDate_ inside the comparator. The same key is computed
    // once per row here, so ordering is identical and parseDate_ runs O(n) times
    // instead of O(n log n).
    const decorated = rows.map(function (r) {
      const picked = pick(r, 'reciept date', 'receipt date', 'reciept_date', 'receipt_date');
      const sortRaw = picked || r['receipt date'] || r['reciept_date'] || r.unique_id;
      const d = parseDate_(sortRaw);
      return { row: r, picked: picked, t: d instanceof Date ? d.getTime() : 0, uid: String(r.unique_id || '') };
    });
    decorated.sort(function (a, b) {
      if (b.t !== a.t) return b.t - a.t;
      return b.uid.localeCompare(a.uid);
    });
    const visible = (!data || !data.loadAll) ? decorated.slice(0, limit) : decorated;

    var headers = visible.map(d => {
      const r = d.row;
      const rec = Object.assign({}, r);
      rec.code = pick(r, 'code', 'Code');
      rec['reciept date'] = pick(r, 'reciept date', 'receipt date', 'reciept_date', 'receipt_date');
      // Items is single text cell — show as is
      rec.items = pick(r, 'items', 'Items', 'item');
      rec.type = pick(r, 'type', 'Type');
      rec.currency = pick(r, 'currency', 'Currency');
      rec['total costs'] = pick(r, 'total costs', 'total_costs', 'Total Costs', 'Total costs');
      if (!rec['total costs']) {
        // fallback from computed formula if empty
        var v = Number(pick(r, 'value', 'Value')) || 0;
        var rate = Number(pick(r, 'exchange rate', 'exchange_rate')) || 1;
        rec['total costs'] = v * rate;
      }
      rec.supplier_name = vendorNames[String(r['supplier name'])] || vendorNames[String(r['supplier_name'])] || String(r['supplier name']||r['supplier_name']||'') || '';
      return rec;
    });
    // Phase 2.1 — options moved to get_et_purchasing_options, fetched when the form
    // opens. Pass withOptions:true for the old combined response.
    const out = { status: 'success', headers: headers };
    if (data && data.withOptions) out.options = purchasingOptions_(dbId);
    return out;
  }

  /** Phase 2.1 — the form's dropdown data, fetched when the form actually opens. */
  function getPurchasingOptions_(data, user, dbId) {
    return { status: 'success', options: purchasingOptions_(dbId) };
  }

  function getPurchasingLines_(data, user, dbId) {
    const parentId = String((data && data.parent_id) || '');
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = tlDbList_(dbId, PURCHASING_LINES_SHEET)
      .filter(r => String(r['top_light_purchasing_costing_id']) === parentId)
      .map(r => ({
        unique_id: r.unique_id,
        id: r.id,
        product: r.product,
        product_name: prodNames[String(r.product)] || '',
        qty: r.qty,
        unit_price: r.unit_price,
        other_cost: r.other_cost,
        unit_cost: r.unit_cost,
        total_cost: r.total_cost,
        sales_value: r.sales_value,
        movement_code: r.movement_code,
        movement_type: r.movement_type,
        movement_place: r.movement_place
      }));
    return { status: 'success', lines: lines };
  }

  function getPurchasePrint_(data, user, dbId) {
    const uid = String((data && data.purchase_code) || '').trim();
    if (!uid) throw new Error('معرف العملية مطلوب');

    const vendorNames = {};
    partyRefs_(dbId).forEach(v => { vendorNames[String(v.id)] = v.name; });
    const rec = tlDbList_(dbId, PURCHASING_SHEET).find(function(r){ return String(r.unique_id).trim().toLowerCase() === uid.toLowerCase(); });
    if (!rec) throw new Error('العملية غير موجودة');
    const header = Object.assign({}, rec);
    // Normalize same aliases as list — Items as text, receipt typo, etc.
    var pickP = function(obj){
      var keys = Array.prototype.slice.call(arguments, 1);
      for(var i=0;i<keys.length;i++){var k=keys[i]; for(var kk in obj) if(String(kk).toLowerCase().replace(/_/g,' ')===String(k).toLowerCase().replace(/_/g,' ')){var v=obj[kk]; if(v!==undefined && v!==null && String(v).trim()!=='') return v;}} return '';
    };
    header.code = pickP(rec, 'code', 'Code');
    header['reciept date'] = pickP(rec, 'reciept date', 'receipt date', 'reciept_date', 'receipt_date');
    header.items = pickP(rec, 'items', 'Items', 'item');
    header.type = pickP(rec, 'type', 'Type');
    header.currency = pickP(rec, 'currency', 'Currency');
    header['total costs'] = pickP(rec, 'total costs', 'total_costs', 'Total Costs');
    header.supplier_name = vendorNames[String(rec['supplier name'])] || vendorNames[String(rec['supplier_name'])] || String(rec['supplier name']||rec['supplier_name']||'') || '';

    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = tlDbList_(dbId, PURCHASING_LINES_SHEET)
      .filter(r => String(r['top_light_purchasing_costing_id']) === uid)
      .map(r => ({
        product_name: prodNames[String(r.product)] || '',
        qty: r.qty,
        unit_price: r.unit_price,
        other_cost: r.other_cost,
        unit_cost: r.unit_cost,
        total_cost: r.total_cost,
        sales_value: r.sales_value
      }));

    return { status: 'success', header: header, lines: lines };
  }

  function addPurchasing_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    validatePurchasingHeader_(header, lines);
    /* Phase 6 — Valley parity (requestDedupeExecute_ semantics): a replayed
     * create carries the same request_key/unique_id, so it returns the
     * committed row instead of writing a second document. The key is reused
     * as the row id so the retry converges on one row. Callers that send no
     * key get a minted id exactly as before. */
    const _reqKeyP = String((data && (data.request_key || data.unique_id)) || (header && (header.request_key || header.unique_id)) || '').trim();
    if (_reqKeyP) {
      var _seenP = null;
      try { _seenP = requestDedupeExecute_(dbId, PURCHASING_SHEET, _reqKeyP, _reqKeyP); } catch (eGuardP) { _seenP = null; }
      if (_seenP) return liveDedupeReply_(_seenP, 'تمت إضافة عملية الشراء');
    }
    const uid = _reqKeyP || uid16_();
    writeHeaderRow_(dbId, uid, header, user);
    writeLines_(dbId, uid, header, lines, user);
    try { var _uid = 'create_erp_test_purchasing_costing_' + uid; logHistory_(dbId, PURCHASING_SHEET, _uid, String(uid), (user&&user.email)||'', 'create', header, null); } catch(e){}
    bustTopLightCaches_(dbId, 'purchasing');
    var vNames = {};
    try{ partyRefs_(dbId).forEach(function(v){ vNames[String(v.id)] = v.name; }); }catch(e){}
    var ratePU = num0_(header.exchange_rate) || 1;
    var vbiPU = num0_(header.value) * ratePU;
    var expPU = num0_(header.administrative_expenses)+num0_(header.customs_expenses)+num0_(header.unloading_expenses)+num0_(header.bank_commission)+num0_(header.customs_clearance)+num0_(header.additional_fees)+num0_(header.clearance_expenses)+num0_(header.other_expenses);
    var totPU = vbiPU + expPU + (header.type==='بيع'?0:num0_(header.internal_cost_adjustment)+num0_(header.purchase_tax));
    var savedPH = {
      unique_id: uid,
      code: header.code,
      'reciept date': parseDate_(header.receipt_date),
      'receipt date': parseDate_(header.receipt_date),
      items: header.items,
      type: header.type,
      currency: header.currency,
      'total costs': totPU,
      'supplier name': header.supplier_name,
      supplier_name: vNames[String(header.supplier_name)] || String(header.supplier_name||'') || '',
      approval_status: 'Pending',
      'value': num0_(header.value),
      'exchange rate': ratePU,
      tax_system: header.tax_system === true || header.tax_system === 'true'
    };
    // copy all header keys for full fidelity
    Object.keys(header).forEach(function(k){ if(savedPH[k]===undefined) savedPH[k]=header[k]; });
    savedPH.unique_id = uid;
    return { status: 'success', message: 'تمت إضافة عملية الشراء', unique_id: uid, assignedId: uid, record: savedPH };
  }

  function editPurchasing_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    const uid = String((header.unique_id == null) ? '' : header.unique_id).trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    validatePurchasingHeader_(header, lines);

    const changes = purchasingHeaderDataMap_(header, user);
    if (header.approval_status == null || header.approval_status === '') delete changes.approval_status;
    const patched = tlDbPatch_(dbId, PURCHASING_SHEET, uid, changes, { user: user, version: header.version });
    if (!patched) throw new Error('الفاتورة غير موجودة');
    var _editPurchOld = patched.oldRecord;

    deleteLines_(dbId, uid, user);
    writeLines_(dbId, uid, header, lines, user);
    try { var _uid = (_editPurchOld && _editPurchOld.record_uid) ? String(_editPurchOld.record_uid) : 'update_erp_test_purchasing_costing_' + uid; logHistory_(dbId, PURCHASING_SHEET, _uid, String(uid), (user&&user.email)||'', 'update', header, _editPurchOld); } catch(e){}
    bustTopLightCaches_(dbId, 'purchasing');
    var vNamesE = {};
    try{ partyRefs_(dbId).forEach(function(v){ vNamesE[String(v.id)] = v.name; }); }catch(e){}
    var ratePUE = num0_(header.exchange_rate) || 1;
    var vbiPUE = num0_(header.value) * ratePUE;
    var expPUE = num0_(header.administrative_expenses)+num0_(header.customs_expenses)+num0_(header.unloading_expenses)+num0_(header.bank_commission)+num0_(header.customs_clearance)+num0_(header.additional_fees)+num0_(header.clearance_expenses)+num0_(header.other_expenses);
    var totPUE = vbiPUE + expPUE + (header.type==='بيع'?0:num0_(header.internal_cost_adjustment)+num0_(header.purchase_tax));
    var savedPHE = {
      unique_id: uid,
      code: header.code,
      'reciept date': parseDate_(header.receipt_date),
      'receipt date': parseDate_(header.receipt_date),
      items: header.items,
      type: header.type,
      currency: header.currency,
      'total costs': totPUE,
      'supplier name': header.supplier_name,
      supplier_name: vNamesE[String(header.supplier_name)] || String(header.supplier_name||'') || '',
      approval_status: header.approval_status || 'Pending',
      'value': num0_(header.value),
      'exchange rate': ratePUE,
      tax_system: header.tax_system === true || header.tax_system === 'true'
    };
    Object.keys(header).forEach(function(k){ if(savedPHE[k]===undefined) savedPHE[k]=header[k]; });
    savedPHE.unique_id = uid;
    return { status: 'success', message: 'تم تحديث عملية الشراء', unique_id: uid, assignedId: uid, record: savedPHE };
  }

  function deletePurchasing_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    const patched = tlDbSoftDelete_(dbId, PURCHASING_SHEET, uid, { user: user });
    if (!patched) throw new Error('الفاتورة غير موجودة');
    var _delPurchOld = patched.oldRecord;
    deleteLines_(dbId, uid, user);
    try { var _uid = (_delPurchOld && _delPurchOld.record_uid) ? String(_delPurchOld.record_uid) : 'delete_erp_test_purchasing_costing_' + uid; logHistory_(dbId, PURCHASING_SHEET, _uid, String(uid), (user&&user.email)||'', 'delete', null, _delPurchOld); } catch(e){}
    bustTopLightCaches_(dbId, 'purchasing');
    return { status: 'success', message: 'تم حذف عملية الشراء' };
  }

  function approvePurchasing_(data, user, dbId) {
    /* Phase 6: thin wrapper — routing + patch come from APPROVAL_CHAINS via
     * approveStep_ (Code.js). Cache bust stays here: it is a company
     * concern, not approval routing. */
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    /* Phase 2: Pending->Approved only, Approved terminal — via table (no inline cur check). */
    var __curPurch = null; try { __curPurch = tlDbList_(dbId, PURCHASING_SHEET).find(function(r){ return String(r.unique_id)===String(uid); }) || null; } catch(eRead){}
    if (__curPurch) assertTransition_('et_purchasing', __curPurch.approval_status || 'Pending', 'Approved', 'لا يمكن اعتماد عملية الشراء من هذه الحالة');
    const res = approveStep_('et_purchasing', uid, 'approve', user, { dbId: dbId, version: data && data.version });
    if (!res || res.status !== 'success') throw new Error((res && res.message) || 'الفاتورة غير موجودة');
    bustTopLightCaches_(dbId, 'purchasing');
    return { status: 'success', message: 'تمت الموافقة على العملية' };
  }

  // --- purchasing helpers ---
  function purchasingOptions_(dbId) {
    return {
      supplier_options: supplierOptions_(dbId),
      product_options: productOptions_(dbId),
      currency_options: currencyOptions_(),
      movement_type_options: movementTypeOptions_(dbId)
    };
  }

  function supplierOptions_(dbId) {
    // Phase 2.6 — version-stamped, 600s (was 120s).
    const raw = partyRefs_(dbId);
    return (raw || []).map(v => ({
      value: v.id != null ? v.id : (v.value != null ? v.value : ''),
      label: v.name || v.label || String(v.id != null ? v.id : (v.value || ''))
    }));
  }

  function productOptions_(dbId) {
    // Phase 2.6 — version-stamped, 600s (was 120s).
    const raw = productRefs_(dbId);
    return (raw || []).map(p => ({
      value: p.id != null ? p.id : (p.value != null ? p.value : ''),
      label: p.name_ar || p.label || String(p.id != null ? p.id : (p.value || ''))
    }));
  }

  function currencyOptions_() {
    return cachedMap_('et_curr_opts', 300, function () {
      try {
        return etRecords_(CONFIG.AUTH_SPREADSHEET_ID, CURRENCY_SHEET).map(r => ({
          value: String(r.currency).trim(),
          label: String(r.currency).trim(),
          rate: Number(r.rate) || 1
        }));
      } catch (e) { return []; }
    });
  }

  function uid16_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

  function colLetter_(idx) {
    let s = '';
    let n = idx + 1;
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
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

  function validatePurchasingHeader_(header, lines) {
    if (String((header.code == null) ? '' : header.code).trim() === '') throw new Error('الكود (Code) مطلوب');
    if (String((header.receipt_date == null) ? '' : header.receipt_date).trim() === '') throw new Error('تاريخ الاستلام مطلوب');
    if (String((header.value == null) ? '' : header.value).trim() === '') throw new Error('قيمة الفاتورة (Value) مطلوبة');
    const rate = num0_(header.exchange_rate);
    const lineSum = (lines || []).reduce((s, l) => s + (num0_(l.qty) * num0_(l.unit_price) * rate + num0_(l.other_cost)), 0);
    const vbi = num0_(header.value) * rate;
    const expenses = num0_(header.administrative_expenses) + num0_(header.customs_expenses) +
      num0_(header.unloading_expenses) + num0_(header.bank_commission) + num0_(header.customs_clearance) +
      num0_(header.additional_fees) + num0_(header.clearance_expenses) + num0_(header.other_expenses);
    const headerTotal = vbi + expenses + (header.type === 'بيع' ? 0 : num0_(header.internal_cost_adjustment) + num0_(header.purchase_tax));
    if (Math.abs(lineSum - headerTotal) > 0.01) {
      throw new Error('مجموع تكاليف الأصناف لا يساوي إجمالي التكاليف');
    }
  }

  function purchasingHeaderDataMap_(header, user) {
    return {
      code: header.code,
      tax_system: header.tax_system === true || header.tax_system === 'true',
      'reciept date': parseDate_(header.receipt_date),
      items: header.items,
      type: header.type,
      'shipping type': header.shipping_type,
      'if shipping via cif, enter the insurance value.': num0_(header.cif_insurance_value),
      value: num0_(header.value),
      currency: header.currency,
      'exchange rate': num0_(header.exchange_rate),
      'importation re-price': num0_(header.importation_reprice),
      'tax declared value': num0_(header.tax_declared_value),
      'administrative expenses': num0_(header.administrative_expenses),
      'customs expenses': num0_(header.customs_expenses),
      'unloading expenses': num0_(header.unloading_expenses),
      'bank commission': num0_(header.bank_commission),
      'customs clearance and port receipts': num0_(header.customs_clearance),
      'additional fees': num0_(header.additional_fees),
      'clearance expenses': num0_(header.clearance_expenses),
      'other expenses': num0_(header.other_expenses),
      'purchase tax': num0_(header.purchase_tax),
      'income tax': num0_(header.income_tax),
      'internal cost adjustment': num0_(header.internal_cost_adjustment),
      'minimum differences': header.minimum_differences,
      'supplier name': header.supplier_name,
      'approved this month': header.approved_this_month,
      'associated bank': header.associated_bank,
      user: user ? user.email : '',
      approval_status: (header.approval_status != null && header.approval_status !== '') ? header.approval_status : 'Pending'
    };
  }

  function buildHeaderValues_(headers, uid, header, user) {
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const rowValues = headers.map(() => '');
    const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };

    set('unique_id', uid);
    const data = purchasingHeaderDataMap_(header, user);
    Object.keys(data).forEach(function (k) { set(k, data[k]); });

    return rowValues;
  }

  function writeHeaderRow_(dbId, uid, header, user) {
    const sheet = getSheet_(PURCHASING_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const rowValues = buildHeaderValues_(headers, uid, header, user);
    return tlDbAppendValues_(dbId, PURCHASING_SHEET, rowValues).rowNumber;
  }

  function writeLines_(dbId, headerUid, header, lines, user) {
    const sheet = getSheet_(PURCHASING_LINES_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    const prodCat = {};
    productRefs_(dbId).forEach(p => { prodCat[String(p.id)] = p.category; });

    const ship = String((header.shipping_type == null) ? '' : header.shipping_type).trim();
    const movementPlace = (['CIF', 'FOB', 'C&F'].indexOf(ship) !== -1) ? 'مستورد' : (ship === 'محلي' ? 'محلي' : '');
    const receiptDate = parseDate_(header.receipt_date);

    const baseId = getNextIdBatch_(dbId, PURCHASING_LINES_SHEET, lines.length, etCol_(PURCHASING_LINES_SHEET, 'id'));

    const valueRows = (lines || []).map((line, i) => {
      const rowValues = headers.map(() => '');
      const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };
      set('unique_id', uid16_());
      set('id', baseId + i);
      set('top_light_purchasing_costing_id', headerUid);
      set('product', line.product);
      set('qty', num0_(line.qty));
      set('unit_price', num0_(line.unit_price));
      set('other_cost', num0_(line.other_cost));
      set('sales_value', num0_(line.sales_value));
      set('movement_type', line.movement_type);
      set('vendor', header.supplier_name);
      set('receipt_date', receiptDate);
      set('invoice_date', receiptDate);
      set('currency', header.currency);
      set('exchange_rate', num0_(header.exchange_rate));
      set('movement_place', movementPlace);
      set('product_category', prodCat[String(line.product)] || '');
      set('user', user ? user.email : '');
      return rowValues;
    });

    if (!valueRows.length) return;

    tlDbAppendValuesBatch_(dbId, PURCHASING_LINES_SHEET, valueRows);
  }

  function deleteLines_(dbId, headerUid, user) {
    tlDbSoftDeleteWhere_(dbId, PURCHASING_LINES_SHEET, 'top_light_purchasing_costing_id', headerUid, { user: user });
  }

  // =========================================
  // Sales — invoices header + product lines (master-detail)
  // =========================================
  /**
   * Phase 2, steps 2.1-2.3.
   *
   * 2.1 The form's dropdown data (customer/product options) used to be built on
   *     every list render via salesOptions_(), which pulls three more full sheet
   *     reads — top_light_current_products, top_light_product_purchasing and
   *     top_light_products — for a form the user may never open. Options now come
   *     from the separate get_et_sales_options action when the form is opened.
   *     Pass withOptions:true to get the old combined response.
   *     Reads on the common list path: 7 -> 4.
   * 2.2 Sorting happens on the raw rows and only the visible slice is mapped.
   *     The sort keys ('تاريخ الفاتورة', 'رقم الفاتورة', invoice_unique_id) are
   *     all present before mapping and untouched by it, so ordering is identical;
   *     previously every invoice ever was expanded into a derived object and
   *     ~99% were then discarded by the slice.
   * 2.3 fully_returned therefore gets computed for the returned slice only.
   */
  function getSalesHeaders_(data, user, dbId) {
    var limit = Number(data && data.limit) || 20;
    const rows = tlDbList_(dbId, SALES_SHEET);
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });

    const stockMaps = cachedMap_('et_sales_stock_' + dbId, 90, function () {
      const soldMap = {};
      tlDbList_(dbId, SALES_LINES_SHEET).forEach(l => {
        const k = String(l.top_lightsales_header_id);
        soldMap[k] = (soldMap[k] || 0) + num0_(l.product_qty);
      });
      const returnedMap = {};
      tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(rt => {
        const k = String(rt.top_lightsales_invoices_id);
        returnedMap[k] = (returnedMap[k] || 0) + num0_(rt.top_lightreturn_qty);
      });
      return { soldMap: soldMap, returnedMap: returnedMap };
    });
    const soldMap = stockMaps.soldMap || {};
    const returnedMap = stockMaps.returnedMap || {};

    rows.sort(function(a,b){
      var da = parseDate_(a['تاريخ الفاتورة']);
      var db = parseDate_(b['تاريخ الفاتورة']);
      var ta = da instanceof Date ? da.getTime() : 0;
      var tb = db instanceof Date ? db.getTime() : 0;
      if (tb !== ta) return tb - ta;
      var na = parseInt(String(a['رقم الفاتورة']||'').split('-')[0],10)||0;
      var nb = parseInt(String(b['رقم الفاتورة']||'').split('-')[0],10)||0;
      if (nb !== na) return nb - na;
      return String(b.invoice_unique_id||'').localeCompare(String(a.invoice_unique_id||''));
    });
    const visible = (!data || !data.loadAll) ? rows.slice(0, limit) : rows;
    var headers = visible.map(r => {
      const rec = Object.assign({}, r);
      rec.customer_name = custNames[String(r['اسم العميل'])] || '';
      const key = String(r.invoice_unique_id);
      const sold = soldMap[key] || 0;
      rec.fully_returned = sold > 0 && (returnedMap[key] || 0) >= sold;
      return rec;
    });
    const out = { status: 'success', headers: headers };
    if (data && data.withOptions) out.options = salesOptions_(dbId);
    return out;
  }

  /** Phase 2.1 — the form's dropdown data, fetched when the form actually opens. */
  function getSalesOptions_(data, user, dbId) {
    return { status: 'success', options: salesOptions_(dbId) };
  }

  function getSalesLines_(data, user, dbId) {
    const parentId = String((data && data.parent_id) || '');
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = tlDbList_(dbId, SALES_LINES_SHEET)
      .filter(r => String(r['top_lightsales_header_id']) === parentId)
      .map(r => ({
        unique_id: r.unique_id,
        id: r.id,
        product_id: r.product_id,
        product_name: prodNames[String(r.product_id)] || '',
        product_tax: r.product_tax,
        product_qty: r.product_qty,
        product_price: r.product_price,
        product_discount: r.product_discount,
        product_net_value: r.product_net_value,
        product_tax_value: r.product_tax_value,
        product_total_value: r.product_total_value
      }));
    return { status: 'success', lines: lines };
  }

  function getSalesPrint_(data, user, dbId) {
    const uid = String((data && data.sales_code) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');

    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    const rec = tlDbList_(dbId, SALES_SHEET).find(r => String(r.invoice_unique_id) === uid);
    if (!rec) throw new Error('الفاتورة غير موجودة');
    const header = Object.assign({}, rec);
    header.customer_name = custNames[String(rec['اسم العميل'])] || '';

    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = tlDbList_(dbId, SALES_LINES_SHEET)
      .filter(r => String(r['top_lightsales_header_id']) === uid)
      .map(r => ({
        product_id: r.product_id,
        product_name: prodNames[String(r.product_id)] || '',
        product_tax: r.product_tax,
        product_qty: r.product_qty,
        product_price: r.product_price,
        product_discount: r.product_discount,
        product_net_value: r.product_net_value,
        product_tax_value: r.product_tax_value,
        product_total_value: r.product_total_value
      }));

    const returns = tlDbList_(dbId, SALES_RETURNS_SHEET)
      .filter(r => String(r.top_lightsales_invoices_id) === uid)
      .map(r => ({
        product_id: r.top_lightsales_products_id,
        product_name: prodNames[String(r.top_lightsales_products_id)] || '',
        return_qty: r.top_lightreturn_qty,
        return_value: num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount),
        return_date: r.top_lightreturn_date
      }));
    const total_return_value = returns.reduce((s, r) => s + num0_(r.return_value), 0);

    // رصيد العميل قبل وبعد الفاتورة مباشرة (مطابق تماماً لتسلسل كشف حساب العميل)
    const customerId = String((rec['اسم العميل'] == null) ? '' : rec['اسم العميل']).trim();
    let balance_before = 0;
    let balance_after = 0;
    if (customerId) {
      const stmt = customerMovements_(dbId, customerId);
      const invMov = (stmt.movements || []).find(m => m.type === 'sales' && (String(m.invoice_unique_id) === uid || (m.reference && String(m.reference) === String(rec['رقم الفاتورة']))));
      if (invMov) {
        balance_before = invMov.balance_before;
        balance_after  = invMov.running_balance;
      } else {
        balance_before = 0;
        balance_after  = num0_(rec['إجمالي']);
      }
    }

    return { status: 'success', header: header, lines: lines, returns: returns, total_return_value: total_return_value, balance_before: balance_before, balance_after: balance_after };
  }

  // =========================================
  // Sales costing & profitability (print)
  // Locked rules: netInvoice = إجمالي − returnsValue (discount already
  // inside إجمالي); netCost excludes returned items' cost; unitCost =
  // total_cost_sign / current_qty (0 when qty is 0); profit = net − cost;
  // margin = profit / net (0 when net <= 0); net <= 0.05 zeroes everything.
  // =========================================
  function getSalesCosting_(data, user, dbId) {
    const uid = String((data && (data.sales_code || data.invoice_id)) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    const invoice = tlDbList_(dbId, SALES_SHEET).find(r => String(r.invoice_unique_id) === uid);
    if (!invoice) throw new Error('الفاتورة غير موجودة');

    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const costMap = {};
    tlDbList_(dbId, CURRENT_PRODUCTS_SHEET).forEach(s => {
      const q = num0_(s.current_qty);
      costMap[String(s.unique_id)] = q > 0 ? num0_(s.total_cost_sign) / q : 0;
    });
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });

    const items = [];
    let totalInvoiceCostOriginal = 0;
    tlDbList_(dbId, SALES_LINES_SHEET)
      .filter(r => String(r.top_lightsales_header_id) === uid)
      .forEach(l => {
        const pid = String(l.product_id);
        const qty = num0_(l.product_qty);
        const unitCost = costMap[pid] != null ? costMap[pid] : 0;
        const itemTotalCost = qty * unitCost;
        totalInvoiceCostOriginal += itemTotalCost;
        items.push({
          productName: prodNames[pid] || ('#' + pid),
          qty: qty,
          unitCost: unitCost,
          price: num0_(l.product_price),
          totalCost: itemTotalCost,
          totalValue: num0_(l.product_total_value),
          isReturn: false
        });
      });

    const returns = [];
    let totalReturnsValue = 0;
    let totalReturnsCostCalculated = 0;
    tlDbList_(dbId, SALES_RETURNS_SHEET)
      .filter(r => String(r.top_lightsales_invoices_id) === uid)
      .forEach(r => {
        const pid = String(r.top_lightsales_products_id);
        const rQty = num0_(r.top_lightreturn_qty);
        const unitCost = costMap[pid] != null ? costMap[pid] : 0;
        const returnItemCost = rQty * unitCost;
        const netReturnValue = num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount);
        totalReturnsValue += netReturnValue;
        totalReturnsCostCalculated += returnItemCost;
        returns.push({
          productName: '[مرتجع] ' + (prodNames[pid] || ('#' + pid)),
          qty: -rQty,
          unitCost: unitCost,
          price: num0_(r.top_lightreturn_price),
          totalCost: -returnItemCost,
          totalValue: -netReturnValue,
          isReturn: true
        });
      });

    let netInvoice = num0_(invoice['إجمالي']) - totalReturnsValue;
    let netCost = Math.max(0, totalInvoiceCostOriginal - totalReturnsCostCalculated);
    let profit = netInvoice - netCost;
    let margin = 0;
    if (netInvoice <= 0.05) {
      netInvoice = 0; netCost = 0; profit = 0; margin = 0;
    } else {
      margin = (profit / netInvoice) * 100;
    }

    return {
      status: 'success',
      meta: {
        invoice_number: invoice['رقم الفاتورة'],
        customer_name: custNames[String(invoice['اسم العميل'])] || '',
        invoice_date: invoice['تاريخ الفاتورة'],
        discount_value: num0_(invoice['قيمة الخصم']),
        approval_status: invoice.approval_status || 'Pending'
      },
      items: items,
      returns: returns,
      totals: {
        netInvoice: netInvoice,
        discountValue: num0_(invoice['قيمة الخصم']),
        netCost: netCost,
        profit: profit,
        margin: margin
      }
    };
  }

  function addSales_(data, user, dbId) {
    /* Phase 1: numbering via the shared locked counter must hold the lock. */
    return executeWithLock_(function () {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    validateSales_(header, lines, dbId);
    /* Phase 6 — Valley parity: replay guard inside the lock, before numbering,
     * so a retried save returns the committed invoice without burning the
     * next invoice number. See addPurchasing_. */
    const _reqKeyS = String((data && (data.request_key || data.unique_id)) || (header && (header.request_key || header.unique_id)) || '').trim();
    if (_reqKeyS) {
      var _seenS = null;
      try { _seenS = requestDedupeExecute_(dbId, SALES_SHEET, _reqKeyS, _reqKeyS); } catch (eGuardS) { _seenS = null; }
      if (_seenS) return liveDedupeReply_(_seenS, 'تمت إضافة الفاتورة');
    }
    const uid = _reqKeyS || uid16_();
    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = nextInvoiceNumber_(dbId);
    computeSalesTotals_(header, lines);
    header.version = 0;
    writeSalesHeaderRow_(dbId, uid, header, user);
    writeSalesLines_(dbId, uid, header, lines, user);
    try { var _uid = 'create_erp_test_sales_invoices_' + uid; logHistory_(dbId, SALES_SHEET, _uid, String(uid), (user&&user.email)||'', 'create', header, null); } catch(e){}
    bustTopLightCaches_(dbId, 'sales');
    var custNamesSales = {};
    try{ partyRefs_(dbId).forEach(function(c){ custNamesSales[String(c.id)] = c.name; }); }catch(e){}
    var savedSales = {
      invoice_unique_id: uid,
      'رقم الفاتورة': header.invoice_number,
      'اسم العميل': header.customer_id,
      'رقم التسجيل الضريبي للعميل': header.customer_tax_id || '',
      'العنوان': header.customer_address || '',
      'رقم الموبيل': header.customer_telephone || '',
      'تاريخ الفاتورة': parseDate_(header.invoice_date),
      'المبلغ الصافي': num0_(header.net_amount),
      'نسبة الخصم': num0_(header.discount_percent),
      'قيمة الخصم': num0_(header.discount_amount),
      'قيمة الضريبة': num0_(header.tax_amount),
      'إجمالي': num0_(header.total_amount),
      tax_system: header.tax_system === true || header.tax_system === 'true',
      approval_status: 'Pending',
      customer_name: custNamesSales[String(header.customer_id)] || '',
      fully_returned: false,
      unique_id: uid
    };
    // copy raw header keys for compatibility
    savedSales['invoice_unique_id'] = uid;
    return { status: 'success', message: 'تمت إضافة الفاتورة', unique_id: uid, assignedId: uid, record: savedSales };
    });
  }

  function editSales_(data, user, dbId) {
    /* Phase 1: fallback numbering via the shared locked counter must hold the lock. */
    return executeWithLock_(function () {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    const uid = String((header.unique_id == null) ? '' : header.unique_id).trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    validateSales_(header, lines, dbId);

    var _editSalesOld = tlDbFind_(dbId, SALES_SHEET, 'invoice_unique_id', uid);
    if (!_editSalesOld) throw new Error('الفاتورة غير موجودة');
    var __editSalesVer = checkRowVersion_(_editSalesOld, header.version);
    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = (_editSalesOld['رقم الفاتورة'] != null && String(_editSalesOld['رقم الفاتورة']).trim() !== '')
      ? _editSalesOld['رقم الفاتورة'] : nextInvoiceNumber_(dbId);
    computeSalesTotals_(header, lines);

    const changes = salesHeaderDataMap_(header, user);
    changes.approval_status = header.approval_status || _editSalesOld.approval_status || 'Pending';
    changes.version = __editSalesVer + 1;
    const patched = tlDbPatch_(dbId, SALES_SHEET, uid, changes, { user: user, version: header.version });
    if (!patched) throw new Error('الفاتورة غير موجودة');

    deleteSalesLines_(dbId, uid, user);
    writeSalesLines_(dbId, uid, header, lines, user);
    try { var _uid = (_editSalesOld && _editSalesOld.record_uid) ? String(_editSalesOld.record_uid) : 'update_erp_test_sales_invoices_' + uid; logHistory_(dbId, SALES_SHEET, _uid, String(uid), (user&&user.email)||'', 'update', header, _editSalesOld); } catch(e){}
    bustTopLightCaches_(dbId, 'sales');
    var custNamesSalesE = {};
    try{ partyRefs_(dbId).forEach(function(c){ custNamesSalesE[String(c.id)] = c.name; }); }catch(e){}
    var savedSalesE = {
      invoice_unique_id: uid,
      'رقم الفاتورة': header.invoice_number,
      'اسم العميل': header.customer_id,
      'رقم التسجيل الضريبي للعميل': header.customer_tax_id || '',
      'العنوان': header.customer_address || '',
      'رقم الموبيل': header.customer_telephone || '',
      'تاريخ الفاتورة': parseDate_(header.invoice_date),
      'المبلغ الصافي': num0_(header.net_amount),
      'نسبة الخصم': num0_(header.discount_percent),
      'قيمة الخصم': num0_(header.discount_amount),
      'قيمة الضريبة': num0_(header.tax_amount),
      'إجمالي': num0_(header.total_amount),
      tax_system: header.tax_system === true || header.tax_system === 'true',
      approval_status: changes.approval_status,
      customer_name: custNamesSalesE[String(header.customer_id)] || '',
      fully_returned: false,
      unique_id: uid
    };
    return { status: 'success', message: 'تم تحديث الفاتورة', unique_id: uid, assignedId: uid, record: savedSalesE };
    });
  }

  function deleteSales_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    const patched = tlDbSoftDelete_(dbId, SALES_SHEET, uid, { user: user });
    if (!patched) throw new Error('الفاتورة غير موجودة');
    var _delSalesOld = patched.oldRecord;
    deleteSalesLines_(dbId, uid, user);
    try { var _uid = (_delSalesOld && _delSalesOld.record_uid) ? String(_delSalesOld.record_uid) : 'delete_erp_test_sales_invoices_' + uid; logHistory_(dbId, SALES_SHEET, _uid, String(uid), (user&&user.email)||'', 'delete', null, _delSalesOld); } catch(e){}
    bustTopLightCaches_(dbId, 'sales');
    return { status: 'success', message: 'تم حذف الفاتورة' };
  }

  function approveSales_(data, user, dbId) {
    /* Phase 6: thin wrapper — see approvePurchasing_. */
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    /* Phase 2: Pending->Approved only, Approved terminal — via table. */
    var __curSales = null; try { __curSales = tlDbList_(dbId, SALES_SHEET).find(function(r){ return String(r.invoice_unique_id)===String(uid); }) || null; } catch(eRead){}
    if (__curSales) assertTransition_('et_sales', __curSales.approval_status || 'Pending', 'Approved', 'لا يمكن اعتماد الفاتورة من هذه الحالة');
    const res = approveStep_('et_sales', uid, 'approve', user, { dbId: dbId, version: data && data.version });
    if (!res || res.status !== 'success') throw new Error((res && res.message) || 'الفاتورة غير موجودة');
    bustTopLightCaches_(dbId, 'sales');
    return { status: 'success', message: 'تمت الموافقة على الفاتورة' };
  }

  // =========================================
  // Sales returns — per-product returns against a sales invoice
  // =========================================
  function getSalesReturns_(data, user, dbId) {
    const invoiceId = String((data && data.invoice_id) || '').trim();
    if (!invoiceId) throw new Error('معرف الفاتورة مطلوب');

    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    const invoice = tlDbList_(dbId, SALES_SHEET).find(r => String(r.invoice_unique_id) === invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة');

    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });

    const lines = tlDbList_(dbId, SALES_LINES_SHEET)
      .filter(r => String(r.top_lightsales_header_id) === invoiceId);

    const returnedMap = {};
    tlDbList_(dbId, SALES_RETURNS_SHEET)
      .filter(r => String(r.top_lightsales_invoices_id) === invoiceId)
      .forEach(r => {
        const k = String(r.top_lightsales_products_id);
        returnedMap[k] = (returnedMap[k] || 0) + num0_(r.top_lightreturn_qty);
      });

    const products = lines.map(l => {
      const pid = String(l.product_id);
      const sold = num0_(l.product_qty);
      const returned = returnedMap[pid] || 0;
      return {
        product_id: l.product_id,
        product_name: prodNames[pid] || '',
        product_price: l.product_price,
        sold_qty: sold,
        returned_qty: returned,
        available_qty: Math.max(0, sold - returned)
      };
    });

    const returns = tlDbList_(dbId, SALES_RETURNS_SHEET)
      .filter(r => String(r.top_lightsales_invoices_id) === invoiceId)
      .map(r => ({
        unique_id: r.unique_id,
        id: r.id,
        product_id: r.top_lightsales_products_id,
        product_name: prodNames[String(r.top_lightsales_products_id)] || '',
        return_qty: r.top_lightreturn_qty,
        return_date: r.top_lightreturn_date,
        return_price: r.top_lightreturn_price,
        return_discount: r.top_lightreturn_discount,
        return_value: r.top_lightreturn_value
      }));

    return {
      status: 'success',
      invoice: {
        invoice_unique_id: invoice.invoice_unique_id,
        invoice_number: invoice['رقم الفاتورة'],
        customer_name: custNames[String(invoice['اسم العميل'])] || '',
        invoice_date: invoice['تاريخ الفاتورة'],
        net: invoice['المبلغ الصافي'],
        discount_value: invoice['قيمة الخصم'],
        approval_status: invoice.approval_status
      },
      products: products,
      returns: returns
    };
  }

  function addSalesReturn_(data, user, dbId) {
    const invoiceId = String((data && data.invoice_id) || '').trim();
    const productId = String((data && data.product_id) || '').trim();
    const returnQty = num0_(data && data.return_qty);
    const returnDate = parseDate_(data && data.return_date);

    if (!invoiceId) throw new Error('معرف الفاتورة مطلوب');
    if (!productId) throw new Error('المنتج مطلوب');
    if (!returnDate) throw new Error('تاريخ المرتجع مطلوب');
    if (returnQty <= 0) throw new Error('كمية المرتجع يجب أن تكون أكبر من صفر');

    const invoice = tlDbList_(dbId, SALES_SHEET).find(r => String(r.invoice_unique_id) === invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة');

    const line = tlDbList_(dbId, SALES_LINES_SHEET)
      .find(r => String(r.top_lightsales_header_id) === invoiceId && String(r.product_id) === productId);
    if (!line) throw new Error('المنتج غير موجود في هذه الفاتورة');

    const alreadyReturned = tlDbList_(dbId, SALES_RETURNS_SHEET)
      .filter(r => String(r.top_lightsales_invoices_id) === invoiceId && String(r.top_lightsales_products_id) === productId)
      .reduce((s, r) => s + num0_(r.top_lightreturn_qty), 0);
    const available = num0_(line.product_qty) - alreadyReturned;
    if (returnQty > available) throw new Error('كمية المرتجع تتجاوز الكمية المتاحة (المتاح: ' + available + ')');

    const price = num0_(line.product_price);
    const value = price * returnQty;
    const net = num0_(invoice['المبلغ الصافي']);
    const discountValue = num0_(invoice['قيمة الخصم']);
    const discount = net > 0 ? (discountValue / net) * value : 0;

    var newUidRet = uid16_();

    var _retNewVals = {
      unique_id: newUidRet,
      top_lightsales_invoices_id: invoiceId,
      top_lightsales_invoices_client: numOrKeep_(invoice['اسم العميل']),
      top_lightreturn_date: returnDate,
      top_lightsales_products_id: numOrKeep_(productId),
      top_lightreturn_qty: returnQty,
      top_lightreturn_discount: discount,
      top_lightreturn_price: price,
      top_lightreturn_value: value,
      user: user ? user.email : ''
    };
    const createdRet = tlDbCreate_(dbId, SALES_RETURNS_SHEET, _retNewVals, { user: user });
    const nextId = createdRet.record.id;
    try { var _uid = 'create_erp_test_sales_returns_' + newUidRet; logHistory_(dbId, SALES_RETURNS_SHEET, _uid, String(newUidRet), (user&&user.email)||'', 'create', _retNewVals, null); } catch(e){}
    bustTopLightCaches_(dbId, 'sales');
    var prodNamesRet = {};
    try{ productRefs_(dbId).forEach(function(p){ prodNamesRet[String(p.id)] = p.name_ar; }); }catch(e){}
    var savedRet = {
      unique_id: newUidRet,
      id: nextId,
      product_id: productId,
      top_lightsales_products_id: productId,
      product_name: prodNamesRet[String(productId)] || '',
      return_qty: returnQty,
      top_lightreturn_qty: returnQty,
      return_date: returnDate,
      top_lightreturn_date: returnDate,
      return_price: price,
      top_lightreturn_price: price,
      return_discount: discount,
      top_lightreturn_discount: discount,
      return_value: value,
      top_lightreturn_value: value,
      top_lightsales_invoices_id: invoiceId
    };
    return { status: 'success', message: 'تمت إضافة المرتجع', unique_id: newUidRet, assignedId: nextId, record: savedRet };
  }

  function deleteSalesReturn_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف المرتجع مطلوب');
    const patched = tlDbSoftDelete_(dbId, SALES_RETURNS_SHEET, uid, { user: user });
    if (!patched) throw new Error('المرتجع غير موجود');
    var _delRetOld = patched.oldRecord;
    try { var _uid = (_delRetOld && _delRetOld.record_uid) ? String(_delRetOld.record_uid) : 'delete_erp_test_sales_returns_' + uid; var _delId = (_delRetOld && _delRetOld.id) ? String(_delRetOld.id) : String(uid); logHistory_(dbId, SALES_RETURNS_SHEET, _uid, _delId, (user&&user.email)||'', 'delete', null, _delRetOld); } catch(e){}
    bustTopLightCaches_(dbId, 'sales');
    return { status: 'success', message: 'تم حذف المرتجع' };
  }

  // --- sales helpers ---
  function salesOptions_(dbId) {
    return {
      customer_options: customerSalesOptions_(dbId),
      product_options: salesProductOptions_(dbId),
      discount_options: discountOptions_(),
      product_tax_options: [
        { value: 0, label: '0%' },
        { value: 0.05, label: '5%' },
        { value: 0.10, label: '10%' },
        { value: 0.14, label: '14%' }
      ]
    };
  }

  function customerSalesOptions_(dbId) {
    // Phase 2.6 — version-stamped, 600s (was 120s).
    const raw = partyRefs_(dbId);
    return (raw || []).map(c => ({
      value: c.id != null ? c.id : (c.value != null ? c.value : ''),
      label: c.name || c.label || String(c.id != null ? c.id : (c.value || '')),
      tax_id: c.tax_id || '',
      telephone: c.telephone || '',
      address: c.address || ''
    }));
  }

  // Cache an object derived from a heavy sheet read (TTL seconds, script cache).
  // OPT-2: chunked storage. A plain single-key put SILENTLY NEVER WORKS past
  // ~100 KB (the put throws, was swallowed), so the bigger the map the less
  // the cache helped — every call rebuilt from a full sheet read. Chunking
  // keeps the same logical key, TTL, and stamp-orphaning contract while
  // letting large maps actually persist. Small values cost one extra manifest
  // entry; misses (null, eviction, partial chunks) rebuild exactly as before.
  function cachedMap_(cacheKey, ttlSeconds, buildFn) {
    try {
      const cached = getChunkedCache_(cacheKey);
      if (cached !== null) return cached;
    } catch (e) {}
    const result = buildFn();
    try { putChunkedCache_(cacheKey, result, ttlSeconds); } catch (e) {}
    return result;
  }

  /**
   * Phase 2, step 2.6 — version-stamped reference cache for the Sales & Purchase
   * FORM option builders only.
   *
   * Why a stamp rather than just a longer TTL: the stamp is part of every derived
   * cache key, so one bump orphans every entry at once and no individual key can
   * be forgotten. bustTopLightCaches_ bumps it, and an audit of this file found
   * exactly four mutation sites for the two reference sheets — add_et_product,
   * edit_et_product, add_et_party, edit_et_party — all four of which already call
   * bustTopLightCaches_. Coverage for app-driven changes is therefore complete.
   *
   * TTL is 600s, not hours. The one path a stamp cannot cover is somebody editing
   * top_light_products or top_light_customer_vendor by hand in the spreadsheet;
   * that used to surface within 120s and now surfaces within 600s. Going to the
   * 1-6h the investigation floated would stretch that to hours, which is not a
   * trade worth making for a dropdown.
   */
  const TL_REF_TTL = 600;

  function tlRefsVersion_(dbId) {
    try {
      const cache = CacheService.getScriptCache();
      const k = 'et_refs_ver_' + dbId;
      let v = cache.get(k);
      if (!v) { v = String(new Date().getTime()); cache.put(k, v, 21600); }
      return v;
    } catch (e) { return '0'; }
  }

  function bumpTlRefsVersion_(dbId) {
    try { CacheService.getScriptCache().put('et_refs_ver_' + dbId, String(new Date().getTime()), 21600); } catch (e) {}
  }

  /** Version-stamped wrapper around getRefsCached_. */
  function tlRefs_(dbId, kind, builder) {
    return getRefsCached_(dbId, kind + '_v' + tlRefsVersion_(dbId), TL_REF_TTL, builder);
  }

  /** Version-stamped wrapper around cachedMap_. */
  function tlCachedMap_(dbId, baseKey, buildFn) {
    return cachedMap_(baseKey + '_v' + tlRefsVersion_(dbId), TL_REF_TTL, buildFn);
  }

  // =========================================
  // Reference accessors — Phase 11 (F-15, finishing what Phase 2.6 started).
  //
  // Phase 2.6 built tlRefs_ and the tl_refs_ver_<dbId> stamp but applied them only
  // to the Sales & Purchase form option builders. The other 51 reference reads in
  // this file still called getRefsCached_ directly at a 120s TTL, outside the
  // stamp — so bustTopLightCaches_ bumped a stamp those entries were not keyed on,
  // and a product or party edit did not invalidate them. They now all come through
  // here.
  //
  // ONE accessor per (sheet, shape). getRefsCached_ keys on refs_<dbId>_<kind>, so
  // two different value shapes under one kind is a live bug waiting for whichever
  // caller warms the key first — that is exactly what Phase 7.2 found in
  // TopChemical and ValleyFoods. 'categories' was already carrying two shapes here:
  // categoryOptions_ caches a projected+filtered [{id, name_ar}], four other sites
  // cache the raw records. It is benign only because those four read nothing but
  // .id and .name_ar. Split into 'categories_opts' and 'categories_raw' anyway.
  //
  // TTL is TL_REF_TTL (600s), matching TopChemical and ValleyFoods. Not hours: a
  // stamp cannot cover somebody editing a reference sheet by hand in the
  // spreadsheet, and top_light_chart_of_accounts and top_light_box_account_codes
  // have no app-driven mutator at all — they are hand-edited only.
  // =========================================
  function partyRefs_(dbId) {
    return tlRefs_(dbId, 'parties', function () { return tlDbList_(dbId, CUSTOMERS_SHEET); });
  }
  function productRefs_(dbId) {
    return tlRefs_(dbId, 'products', function () { return tlDbList_(dbId, PRODUCTS_SHEET); });
  }
  function categoryRefs_(dbId) {
    return tlRefs_(dbId, 'categories_raw', function () { return tlDbList_(dbId, CATEGORIES_SHEET); });
  }
  function chartRefs_(dbId) {
    return tlRefs_(dbId, 'chart_of_accounts', function () { return tlDbList_(dbId, CHART_SHEET); });
  }
  function boxRefs_(dbId) {
    return tlRefs_(dbId, 'boxes', function () { return tlDbList_(dbId, BOX_SHEET); });
  }

  function bustTopLightCaches_(dbId, type) {
    bumpTlRefsVersion_(dbId);
    try {
      const cache = CacheService.getScriptCache();
      const keys = ['et_dashboard_kpis_' + dbId];
      if (!type || type === 'parties') keys.push('et_cust_sales_opts_' + dbId);
      if (!type || type === 'products') { keys.push('et_qty_map_' + dbId, 'et_price_map_' + dbId, 'et_cat_opts_' + dbId); }
      if (!type || type === 'purchasing') { keys.push('et_qty_map_' + dbId, 'et_price_map_' + dbId); }
      if (!type || type === 'sales') { keys.push('et_qty_map_' + dbId); }
      if (!type || type === 'cash') { keys.push('et_box_names_' + dbId, 'et_box_opts_' + dbId, 'et_chart_opts_' + dbId); }
      // Legacy single-key entries from before chunking (OPT-2).
      cache.removeAll(keys);
      // OPT-2: cachedMap_ entries now live in chunk manifests/data, which a
      // plain removeAll cannot reach. Drop those namespaces too; the stamp
      // bump above already orphans every versioned key at once.
      keys.forEach(function (k) { removeChunkedCache_(k); });
    } catch (e) {}
  }

  // Available stock per product: top_light_current_products.unique_id -> current_qty.
  function currentQtyMap_(dbId) {
    // Phase 2.6 — version-stamped, 600s (was 90s).
    return tlCachedMap_(dbId, 'et_qty_map_' + dbId, function () {
      const map = {};
      tlDbList_(dbId, CURRENT_PRODUCTS_SHEET).forEach(s => {
        map[String(s.unique_id)] = num0_(s.current_qty);
      });
      return map;
    });
  }

  // Latest purchase unit sale price per product: for each top_light_product_purchasing
  // row, keep the max receipt_date per product and its sales_value.
  function latestSalesPriceMap_(dbId) {
    // Phase 2.6 — version-stamped, 600s (was 90s). This one scanned the ENTIRE
    // purchasing-lines table to derive one price per product, every 90 seconds.
    return tlCachedMap_(dbId, 'et_price_map_' + dbId, function () {
      const latest = {};
      tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(r => {
        const pid = String((r.product == null) ? '' : r.product).trim();
        if (!pid) return;
        const d = parseDate_(r.receipt_date);
        const t = d instanceof Date ? d.getTime() : 0;
        if (!(pid in latest) || t >= latest[pid].t) {
          latest[pid] = { t: t, price: r.sales_value };
        }
      });
      const out = {};
      Object.keys(latest).forEach(k => { out[k] = latest[k].price; });
      return out;
    });
  }

  function salesProductOptions_(dbId) {
    const qtyMap = currentQtyMap_(dbId);
    const priceMap = latestSalesPriceMap_(dbId);
    // Phase 2.6 — version-stamped, 600s (was 120s).
    const raw = productRefs_(dbId);
    return (raw || []).map(p => {
      const pid = p.id != null ? p.id : p.value;
      return {
        value: pid,
        label: p.name_ar || p.label || String(pid || ''),
        current_qty: qtyMap[String(pid)] != null ? qtyMap[String(pid)] : 0,
        default_price: priceMap[String(pid)] != null ? priceMap[String(pid)] : 0
      };
    });
  }

  function discountOptions_() {
    return [
      { value: 0, label: '0%' },
      { value: 0.35, label: '35%' },
      { value: 0.40, label: '40%' },
      { value: 0.45, label: '45%' },
      { value: 0.50, label: '50%' }
    ];
  }

  function numOrKeep_(v) {
    if (v == null || v === '') return v;
    const n = Number(v);
    return isNaN(n) ? v : n;
  }

  function lookupCustomerField_(dbId, customerId, field) {
    const rec = partyRefs_(dbId).find(c => String(c.id) === String(customerId));
    return rec ? (rec[field] != null ? rec[field] : '') : '';
  }

  function nextInvoiceNumber_(dbId) {
    /* Phase 1: delegates to the shared locked counter. Format identical:
     * "{seq}-{year}". MUST be called while holding executeWithLock_. */
    var year = new Date().getFullYear();
    var seq = nextDocumentNumber_(dbId, 'et_sales', year, {
      seedScanner: function () {
        var maxPrefix = 0;
        tlDbList_(dbId, SALES_SHEET).forEach(function (r) {
          var s = String((r['رقم الفاتورة'] == null) ? '' : r['رقم الفاتورة']).trim();
          var m = s.match(/^(\d+)-/);
          if (m) { var n = Number(m[1]); if (!isNaN(n) && n > maxPrefix) maxPrefix = n; }
        });
        return maxPrefix;
      }
    });
    return seq + '-' + year;
  }

  function computeSalesTotals_(header, lines) {
    /* Phase 5: shared totals lib (Code.js calcTotals_) is source of
     * truth. No rounding here — raw-float behavior preserved. */
    if (typeof calcTotals_ === 'function') {
      const mapped = (lines || []).map(l => ({ qty: l.product_qty, price: l.product_price, tax: l.product_tax, discount: l.product_discount }));
      const t = calcTotals_(mapped, header.discount_percent);
      header.net_amount = t.net;
      header.discount_amount = t.discount;
      header.tax_amount = t.tax;
      header.total_amount = t.total;
      return;
    }
    const discountPercent = num0_(header.discount_percent);
    let net = 0, lineDiscount = 0, tax = 0;
    (lines || []).forEach(l => {
      const nv = num0_(l.product_qty) * num0_(l.product_price);
      net += nv;
      lineDiscount += num0_(l.product_discount);
      tax += nv * num0_(l.product_tax);
    });
    header.net_amount = net;
    header.discount_amount = lineDiscount + net * discountPercent;
    header.tax_amount = tax;
    header.total_amount = net - header.discount_amount + tax;
  }

  function validateSales_(header, lines, dbId, allowOutOfStock) {
    if (String((header.customer_id == null) ? '' : header.customer_id).trim() === '') throw new Error('اسم العميل مطلوب');
    if (String((header.invoice_date == null) ? '' : header.invoice_date).trim() === '') throw new Error('تاريخ الفاتورة مطلوب');
    if (!(lines || []).length) throw new Error('يجب إضافة صنف واحد على الأقل');
    const qtyMap = currentQtyMap_(dbId);
    (lines || []).forEach(l => {
      if (isBlank_(l.product_id)) throw new Error('المنتج مطلوب لكل صنف');
      if (isBlank_(l.product_tax)) throw new Error('نسبة الضريبة مطلوبة لكل صنف');
      if (isBlank_(l.product_qty)) throw new Error('الكمية مطلوبة لكل صنف');
      if (isBlank_(l.product_price)) throw new Error('السعر مطلوب لكل صنف');
      if (isBlank_(l.product_discount)) throw new Error('الخصم مطلوب لكل صنف');
      if (num0_(l.product_qty) <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');
      if (num0_(l.product_price) < 0) throw new Error('السعر يجب أن يكون غير سالب');
      if (!allowOutOfStock) {
        const available = qtyMap[String(l.product_id)] != null ? qtyMap[String(l.product_id)] : 0;
        if (num0_(l.product_qty) > available) throw new Error('الكمية تتجاوز الرصيد المتاح للمنتج (المتاح: ' + available + ')');
      }
    });
  }

  function isBlank_(v) {
    return v == null || String(v).trim() === '';
  }

  function salesColIndex_(headers, key) {
    const k = key.toLowerCase();
    let i = headers.findIndex(h => String(h).trim().toLowerCase() === k);
    if (i === -1) i = headers.findIndex(h => String(h).trim().toLowerCase().indexOf(k) === 0);
    return i;
  }

  function salesHeaderDataMap_(header, user) {
    return {
      'ميزان حسابي': 5,
      'نوع الضريبة': 2,
      'رقم الفاتورة': header.invoice_number,
      'اسم العميل': numOrKeep_(header.customer_id),
      'رقم التسجيل الضريبي للعميل': header.customer_tax_id || '',
      'العنوان': header.customer_address || '',
      'رقم الموبيل': header.customer_telephone || '',
      'تاريخ الفاتورة': parseDate_(header.invoice_date),
      'نوع البيان': 3,
      'نوع السلعة': 14,
      'المبلغ الصافي': num0_(header.net_amount),
      'نسبة الخصم': num0_(header.discount_percent),
      'قيمة الخصم': num0_(header.discount_amount),
      'قيمة الضريبة': num0_(header.tax_amount),
      'إجمالي': num0_(header.total_amount),
      tax_system: header.tax_system === true || header.tax_system === 'true',
      user: user ? user.email : '',
      approval_status: (header.approval_status != null && header.approval_status !== '') ? header.approval_status : 'Pending'
    };
  }

  function buildSalesHeaderValues_(headers, uid, header, user) {
    const rowValues = headers.map(() => '');
    const put = (key, val) => { const i = salesColIndex_(headers, key); if (i !== -1) rowValues[i] = val; };

    put('invoice_unique_id', uid);
    const data = salesHeaderDataMap_(header, user);
    Object.keys(data).forEach(function (k) { put(k, data[k]); });
    put('created_at', new Date());
    put('version', header.version !== undefined ? header.version : 0);

    return rowValues;
  }

  function writeSalesHeaderRow_(dbId, uid, header, user) {
    const sheet = getSheet_(SALES_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const rowValues = buildSalesHeaderValues_(headers, uid, header, user);
    return tlDbAppendValues_(dbId, SALES_SHEET, rowValues).rowNumber;
  }

  function writeSalesLines_(dbId, headerUid, header, lines, user) {
    const sheet = getSheet_(SALES_LINES_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    const baseId = getNextIdBatch_(dbId, SALES_LINES_SHEET, lines.length, etCol_(SALES_LINES_SHEET, 'id'));

    const clientId = numOrKeep_(header.customer_id);
    const valueRows = (lines || []).map((line, i) => {
      const rowValues = headers.map(() => '');
      const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };
      set('unique_id', uid16_());
      set('id', baseId + i);
      set('top_lightsales_header_id', headerUid);
      set('top_lightsales_invoices_client', clientId);
      set('product_id', numOrKeep_(line.product_id));
      set('product_tax', num0_(line.product_tax));
      set('product_qty', num0_(line.product_qty));
      set('product_price', num0_(line.product_price));
      set('product_discount', num0_(line.product_discount));
      set('user', user ? user.email : '');
      set('created_at', new Date());
      return rowValues;
    });

    if (!valueRows.length) return;

    tlDbAppendValuesBatch_(dbId, SALES_LINES_SHEET, valueRows);
  }

  function deleteSalesLines_(dbId, headerUid, user) {
    tlDbSoftDeleteWhere_(dbId, SALES_LINES_SHEET, 'top_lightsales_header_id', headerUid, { user: user });
  }

  // =========================================
  // Cash / bank movement — transactions + box balances + transfer
  // =========================================
  function getCashHeaders_(data, user, dbId) {
    var limit = Number(data && data.limit) || 2000;
    const rows = tlDbList_(dbId, CASH_SHEET);
    const boxNames = boxNameMap_(dbId);
    const boxes = boxBalanceSummary_(dbId, boxNames);
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    // Phase 12 — slice before mapping. The map was a full Object.assign({}, r) copy
    // of every cash movement ever, and the sort key transaction_id is copied straight
    // off the raw row, so the same comparator over an index array gives the same
    // permutation. The two-branch cap below is applied to the index array unchanged.
    var order = [];
    for (var i = 0; i < rows.length; i++) order.push(i);
    order.sort(function(ia,ib){ return Number(rows[ib].transaction_id) - Number(rows[ia].transaction_id); });

    let totalDebit = 0;
    let totalCredit = 0;
    let totalCount = 0;
    const KPI_EXCLUDED_BOXES = ['111103'];
    rows.forEach(r => {
      const bx = String((r.related_box == null) ? '' : r.related_box).trim();
      if (KPI_EXCLUDED_BOXES.indexOf(bx) !== -1) return;
      const t = num0_(r.total != null && r.total !== '' ? r.total : r.transaction_amount);
      if (isCreditType_(r.transaction_type)) {
        totalCredit += t;
      } else {
        totalDebit += t;
      }
      totalCount++;
    });
    // Net is derived as debit − credit from signed types, never by summing
    // the balance_amount column (its stored sign is unreliable).
    const totalBalance = totalDebit - totalCredit;
    const summary = {
      total_debit: totalDebit,
      total_credit: totalCredit,
      total_balance: totalBalance,
      total_count: totalCount
    };

    if (data && data.limit) {
      order = order.slice(0, limit);
    } else if (!data || !data.loadAll) {
      if (order.length > 2000) order = order.slice(0, 2000);
    }
    var headers = order.map(idx => {
      const r = rows[idx];
      const rec = Object.assign({}, r);
      rec.box_name = boxNames[String(r.related_box)] || '';
      rec.customer_name = custNames[String(r.name)] || '';
      return rec;
    });
    return {
      status: 'success',
      headers: headers,
      boxes: boxes,
      summary: summary,
      options: cashOptions_(dbId)
    };
  }

  function addCash_(data, user, dbId) {
    const rec = data && data.record ? data.record : {};
    validateCash_(rec);
    const sheet = getSheet_(CASH_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const nextId = getNextId_(dbId, CASH_SHEET, etCol_(CASH_SHEET, 'transaction_id'));
    const rowValues = buildCashValues_(headers, nextId, rec, user);
    tlDbAppendValues_(dbId, CASH_SHEET, rowValues);
    try { var _uid = 'create_erp_test_cash_bank_movement_' + nextId; logHistory_(dbId, CASH_SHEET, _uid, String(nextId), (user&&user.email)||'', 'create', rec, null); } catch(e){}
    bustTopLightCaches_(dbId, 'cash');
    return { status: 'success', message: 'تمت إضافة الحركة', data: { assignedId: nextId } };
  }

  function editCash_(data, user, dbId) {
    const rec = data && data.record ? data.record : {};
    const id = Number(rec.transaction_id);
    if (!id) throw new Error('معرف الحركة مطلوب');
    validateCash_(rec);
    const patched = tlDbPatch_(dbId, CASH_SHEET, id, cashDataMap_(rec, user), { user: user, version: rec.version });
    if (!patched) throw new Error('الحركة غير موجودة');
    var _editCashOld = patched.oldRecord;
    tlRecalcCashBoxBalances_(dbId, [_editCashOld.related_box, rec.related_box]);
    try { var _uid = (_editCashOld && _editCashOld.record_uid) ? String(_editCashOld.record_uid) : 'update_erp_test_cash_bank_movement_' + id; logHistory_(dbId, CASH_SHEET, _uid, String(id), (user&&user.email)||'', 'update', rec, _editCashOld); } catch(e){}
    bustTopLightCaches_(dbId, 'cash');
    return { status: 'success', message: 'تم تحديث الحركة' };
  }

  function deleteCash_(data, user, dbId) {
    const id = Number(data && data.unique_id);
    if (!id) throw new Error('معرف الحركة مطلوب');
    const patched = tlDbSoftDelete_(dbId, CASH_SHEET, id, { user: user });
    if (!patched) throw new Error('الحركة غير موجودة');
    var _delCashOld = patched.oldRecord;
    tlRecalcCashBoxBalances_(dbId, [_delCashOld.related_box]);
    try { var _uid = (_delCashOld && _delCashOld.record_uid) ? String(_delCashOld.record_uid) : 'delete_erp_test_cash_bank_movement_' + id; logHistory_(dbId, CASH_SHEET, _uid, String(id), (user&&user.email)||'', 'delete', null, _delCashOld); } catch(e){}
    bustTopLightCaches_(dbId, 'cash');
    return { status: 'success', message: 'تم حذف الحركة' };
  }

  function approveCash_(data, user, dbId) {
    /* Phase 6: thin wrapper — kind 'cash' row in APPROVAL_CHAINS. */
    const id = Number(data && data.unique_id);
    if (!id) throw new Error('معرف الحركة مطلوب');
    /* Phase 2: approved bool false->true only, true terminal — via table. */
    var __curCash = null; try { __curCash = tlDbList_(dbId, CASH_SHEET).find(function(r){ return String(r.transaction_id)===String(id); }) || null; } catch(eRead){}
    if (__curCash) assertTransition_('et_cash', __curCash.approved, 'true', 'لا يمكن اعتماد الحركة من هذه الحالة');
    const res = approveStep_('et_cash', id, 'approve', user, { dbId: dbId, version: data && data.version });
    if (!res || res.status !== 'success') throw new Error((res && res.message) || 'الحركة غير موجودة');
    bustTopLightCaches_(dbId, 'cash');
    return { status: 'success', message: 'تم اعتماد الحركة' };
  }

  function addTransfer_(data, user, dbId) {
    const fromBox = String((data && data.from_box) || '').trim();
    const toBox = String((data && data.to_box) || '').trim();
    const amount = num0_(data && data.amount);
    const transferDate = parseDate_(data && data.transfer_date) || new Date();
    if (!fromBox) throw new Error('الصندوق المصدر مطلوب');
    if (!toBox) throw new Error('الصندوق الهدف مطلوب');
    if (fromBox === toBox) throw new Error('يجب اختيار صندوقين مختلفين');
    if (amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');

    const nextId = getNextIdBatch_(dbId, CASH_SHEET, 2, etCol_(CASH_SHEET, 'transaction_id'));

    const boxNames = boxNameMap_(dbId);
    const customDetails = String((data && data.details) || '').trim();
    const details = customDetails || 'تحويل صندوق إلى صندوق';

    writeCashTransferRow_(dbId, {
      transaction_id: nextId,
      name: '',
      transaction_details: details,
      transaction_date: transferDate,
      transaction_amount: amount,
      total_discount: 0,
      taxes: 0,
      transaction_type: 'Credit',
      related_box: fromBox,
      chart_code: '',
      transaction_method: '',
      tax_system: false,
      currency: 'EGP',
      exchange_rate: 1,
      temp_target_box: toBox
    }, user);

    writeCashTransferRow_(dbId, {
      transaction_id: nextId + 1,
      name: '',
      transaction_details: details,
      transaction_date: transferDate,
      transaction_amount: amount,
      total_discount: 0,
      taxes: 0,
      transaction_type: 'Debit',
      related_box: toBox,
      chart_code: '',
      transaction_method: '',
      tax_system: false,
      currency: 'EGP',
      exchange_rate: 1,
      temp_target_box: toBox
    }, user);

    try { var _transferVals = { from_box: fromBox, to_box: toBox, amount: amount, transfer_date: transferDate, details: details, credit_id: nextId, debit_id: nextId+1 }; var _uid = 'create_erp_test_cash_bank_movement_' + nextId + '_' + (nextId+1); logHistory_(dbId, CASH_SHEET, _uid, String(nextId+1), (user&&user.email)||'', 'create', _transferVals, null); } catch(e){}
    bustTopLightCaches_(dbId, 'cash');
    var debitRecord = {
      transaction_id: nextId + 1,
      related_box: toBox,
      box_name: boxNames[String(toBox)] || '',
      customer_name: '',
      name: '',
      transaction_details: details,
      transaction_date: transferDate,
      transaction_amount: amount,
      total_discount: 0,
      taxes: 0,
      transaction_type: 'Debit',
      currency: 'EGP',
      exchange_rate: 1,
      approved: false,
      temp_target_box: toBox
    };
    return { status: 'success', message: 'تم التحويل', data: { assignedId: nextId }, record: debitRecord, assignedId: nextId + 1, unique_id: String(nextId + 1) };
  }

  // --- cash helpers ---
  function boxNameMap_(dbId) {
    const rows = boxRefs_(dbId);
    const map = {};
    rows.forEach(b => {
      map[String(b['المستوى الخامس'])] = b['اسم المستوى الخامس'] || '';
    });
    return map;
  }

  function boxOptions_(dbId) {
    const rows = boxRefs_(dbId);
    return rows.map(b => ({
      value: b['المستوى الخامس'],
      label: b['اسم المستوى الخامس'] || ''
    }));
  }

  function chartOptions_(dbId) {
    const rows = chartRefs_(dbId);
    return rows.map(r => ({
      value: r['المستوى الخامس'],
      label: r['كود المستوى'] || ''
    })).filter(o => o.value !== undefined && o.value !== null && String(o.value).trim() !== '');
  }

  function cashOptions_(dbId) {
    return {
      customer_options: customerSalesOptions_(dbId),
      box_options: boxOptions_(dbId),
      chart_options: chartOptions_(dbId),
      currency_options: currencyOptions_(),
      method_options: ['نقدي', 'ايداع بنكي', 'تحويل بنكي', 'انستا باي', 'فودافون كاش'],
      type_options: [{ value: 'Debit', label: 'مدين (Debit)' }, { value: 'Credit', label: 'دائن (Credit)' }]
    };
  }

  // Credit-type normalization: 'Credit' any case, Arabic 'دائن', or 'c'.
  // Anything else (incl. empty) counts as Debit — matches the sheet formula
  // =IF(type="Credit",−total,total) intent while tolerating legacy values.
  function isCreditType_(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'credit' || s === 'c' || s.indexOf('دائن') !== -1;
  }

  function boxBalanceSummary_(dbId, boxNames) {
    const map = {};
    tlDbList_(dbId, CASH_SHEET).forEach(r => {
      const box = String((r.related_box == null) ? '' : r.related_box).trim();
      if (!box) return;
      const t = num0_(r.total != null && r.total !== '' ? r.total : r.transaction_amount);
      map[box] = (map[box] || 0) + (isCreditType_(r.transaction_type) ? -t : t);
    });
    return Object.keys(map).map(box => ({
      box: box,
      box_name: boxNames[box] || '',
      balance: map[box]
    }));
  }

  function validateCash_(rec) {
    if (String((rec.name == null) ? '' : rec.name).trim() === '') throw new Error('الطرف (name) مطلوب');
    if (String((rec.related_box == null) ? '' : rec.related_box).trim() === '') throw new Error('الصندوق (related_box) مطلوب');
    if (String((rec.chart_code == null) ? '' : rec.chart_code).trim() === '') throw new Error('كود الحساب (chart_code) مطلوب');
    if (String((rec.transaction_details == null) ? '' : rec.transaction_details).trim() === '') throw new Error('البيان مطلوب');
    if (num0_(rec.transaction_amount) <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
    if (String((rec.transaction_method == null) ? '' : rec.transaction_method).trim() === '') throw new Error('طريقة الدفع مطلوبة');
    if (String((rec.transaction_type == null) ? '' : rec.transaction_type).trim() === '') throw new Error('نوع الحركة مطلوب');
  }

  // Transfer payload {from_box, to_box, transfer_date, amount} carries no
  // counterparty / chart / method — those columns stay empty on both legs by
  // design (see writeCashTransferRow_). Validated separately so the cash
  // record validator never rejects a transfer for a missing name.
  function validateTransfer_(d) {
    if (String((d.from_box == null) ? '' : d.from_box).trim() === '') throw new Error('الصندوق المصدر مطلوب');
    if (String((d.to_box == null) ? '' : d.to_box).trim() === '') throw new Error('الصندوق الهدف مطلوب');
    if (String(d.from_box) === String(d.to_box)) throw new Error('يجب اختيار صندوقين مختلفين');
    if (num0_(d.amount) <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  }

  function cashDataMap_(rec, user) {
    return {
      invoice_id: rec.invoice_id != null ? rec.invoice_id : '',
      name: numOrKeep_(rec.name),
      transaction_purchasing_items: rec.transaction_purchasing_items != null ? rec.transaction_purchasing_items : '',
      transaction_details: rec.transaction_details,
      transaction_date: parseDate_(rec.transaction_date),
      transaction_amount: num0_(rec.transaction_amount),
      total_discount: num0_(rec.total_discount),
      taxes: num0_(rec.taxes),
      transaction_type: rec.transaction_type,
      related_box: numOrKeep_(rec.related_box),
      chart_code: numOrKeep_(rec.chart_code),
      transaction_method: rec.transaction_method,
      tax_system: rec.tax_system === true || rec.tax_system === 'true',
      approved: rec.approved === true || rec.approved === 'true',
      currency: rec.currency,
      exchange_rate: num0_(rec.exchange_rate),
      user: user ? user.email : ''
    };
  }

  function buildCashValues_(headers, transactionId, rec, user) {
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const rowValues = headers.map(() => '');
    const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };

    set('transaction_id', transactionId);
    const data = cashDataMap_(rec, user);
    Object.keys(data).forEach(function (k) { set(k, data[k]); });
    set('created_at', new Date());

    return rowValues;
  }

  function writeCashTransferRow_(dbId, rec, user) {
    const sheet = getSheet_(CASH_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const rowValues = headers.map(() => '');
    const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };

    set('transaction_id', rec.transaction_id);
    set('invoice_id', '');
    set('name', '');
    set('transaction_purchasing_items', '');
    set('transaction_details', rec.transaction_details);
    set('transaction_date', rec.transaction_date);
    set('transaction_amount', num0_(rec.transaction_amount));
    set('total_discount', 0);
    set('taxes', 0);
    set('transaction_type', rec.transaction_type);
    set('related_box', numOrKeep_(rec.related_box));
    set('chart_code', '');
    set('transaction_method', '');
    set('tax_system', false);
    set('approved', false);
    set('currency', 'EGP');
    set('exchange_rate', 1);
    set('user', user ? user.email : '');
    set('created_at', new Date());
    set('temp_target_box', rec.temp_target_box);

    tlDbAppendValues_(dbId, CASH_SHEET, rowValues);
  }

  // =========================================
  // Customer statement — aggregated movements + running balance
  // =========================================
  function customerRawMovements_(dbId) {
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const movements = [];

    // Sales (debit +)
    const invoices = tlDbList_(dbId, SALES_SHEET);
    const salesLines = tlDbList_(dbId, SALES_LINES_SHEET);
    const salesLineMap = {};
    salesLines.forEach(l => {
      const k = String(l.top_lightsales_header_id);
      (salesLineMap[k] = salesLineMap[k] || []).push(l);
    });
    invoices.forEach(inv => {
      const customer = String((inv['اسم العميل'] == null) ? '' : inv['اسم العميل']).trim();
      if (!customer) return;
      const lines = (salesLineMap[String(inv.invoice_unique_id)] || []).map(l => ({
        product_name: prodNames[String(l.product_id)] || '',
        qty: l.product_qty,
        price: l.product_price,
        discount: l.product_discount,
        net_value: num0_(l.product_net_value)
      }));
      movements.push({
        invoice_unique_id: String(inv.invoice_unique_id || ''),
        customer: customer,
        date: parseDate_(inv['تاريخ الفاتورة']),
        type: 'sales',
        reference: inv['رقم الفاتورة'] || '',
        description: '',
        amount: num0_(inv['إجمالي']),
        currency: 'EGP',
        rate: 1,
        net: num0_(inv['المبلغ الصافي']),
        discount: num0_(inv['قيمة الخصم']),
        total: num0_(inv['إجمالي']),
        item_count: lines.length,
        lines: lines
      });
    });

    // Returns (credit -), grouped by unique_id, reference = original invoice number
    const invByUid = {};
    invoices.forEach(inv => { invByUid[String(inv.invoice_unique_id)] = inv; });
    const retGroups = {};
    tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(r => {
      const customer = String((r.top_lightsales_invoices_client == null) ? '' : r.top_lightsales_invoices_client).trim();
      if (!customer) return;
      const key = String(r.unique_id);
      if (!retGroups[key]) {
        const inv = invByUid[String(r.top_lightsales_invoices_id)] || {};
        retGroups[key] = { customer: customer, date: parseDate_(r.top_lightreturn_date), invoice_unique_id: String(r.top_lightsales_invoices_id || ''), invoice_number: inv['رقم الفاتورة'] || '', total_qty: 0, total: 0, lines: [] };
      }
      const g = retGroups[key];
      const gross = num0_(r.top_lightreturn_value);
      const disc = num0_(r.top_lightreturn_discount);
      g.total_qty += num0_(r.top_lightreturn_qty);
      g.total += gross - disc;
      g.lines.push({ product_name: prodNames[String(r.top_lightsales_products_id)] || '', qty: r.top_lightreturn_qty, gross: gross, discount: disc, net: gross - disc });
    });
    Object.keys(retGroups).forEach(k => {
      const g = retGroups[k];
      movements.push({
        invoice_unique_id: g.invoice_unique_id,
        customer: g.customer,
        date: g.date,
        type: 'return',
        reference: g.invoice_number,
        description: '',
        amount: -g.total,
        currency: 'EGP',
        rate: 1,
        invoice_number: g.invoice_number,
        total_qty: g.total_qty,
        total: g.total,
        item_count: g.lines.length,
        lines: g.lines
      });
    });

    // Purchases (credit -), grouped by header, amount = qty * unit_price * exchange_rate
    const purchHeaders = {};
    tlDbList_(dbId, PURCHASING_SHEET).forEach(h => { purchHeaders[String(h.unique_id)] = h; });
    const purchGroups = {};
    tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(l => {
      const customer = String((l.vendor == null) ? '' : l.vendor).trim();
      if (!customer) return;
      const hid = String(l.top_light_purchasing_costing_id);
      if (!purchGroups[hid]) {
        const h = purchHeaders[hid] || {};
        purchGroups[hid] = { customer: customer, date: parseDate_(l.receipt_date), amount: 0, ref: h.code || hid, currency: h.currency || '', rate: num0_(h['exchange rate']) || 1 };
      }
      purchGroups[hid].amount += num0_(l.qty) * num0_(l.unit_price) * num0_(l.exchange_rate);
    });
    Object.keys(purchGroups).forEach(k => {
      const g = purchGroups[k];
      movements.push({ customer: g.customer, date: g.date, type: 'purchase', reference: g.ref, description: '', amount: -g.amount, currency: g.currency, rate: g.rate, lines: [] });
    });

    // Cash: Debit = collection (credit -), Credit = payment (debit +)
    tlDbList_(dbId, CASH_SHEET).forEach(r => {
      const customer = String((r.name == null) ? '' : r.name).trim();
      if (!customer) return;
      const rate = num0_(r.exchange_rate) || 1;
      const method = String((r.transaction_method == null) ? '' : r.transaction_method).trim();
      const isVodafone = method === 'فودافون كاش';
      const base = isVodafone
        ? num0_(r.transaction_amount) * rate
        : (r.total != null && r.total !== '' ? num0_(r.total) : ((num0_(r.transaction_amount) - num0_(r.total_discount) + num0_(r.taxes)) * rate));
      const isDebit = String((r.transaction_type == null) ? '' : r.transaction_type).trim() === 'Debit';
      movements.push({
        customer: customer,
        date: parseDate_(r.transaction_date),
        type: isDebit ? 'collection' : 'payment',
        reference: r.transaction_id != null ? String(r.transaction_id) : '',
        description: r.transaction_details || '',
        amount: isDebit ? -base : base,
        currency: r.currency || 'EGP',
        rate: rate,
        method: r.transaction_method || '',
        withdrawal: base,
        lines: []
      });
    });

    return movements;
  }

  function customerMovements_(dbId, customerId, dateFrom, dateTo) {
    const all = customerRawMovements_(dbId).filter(m => String(m.customer) === String(customerId));
    all.sort(function (a, b) {
      const ta = a.date instanceof Date ? a.date.getTime() : 0;
      const tb = b.date instanceof Date ? b.date.getTime() : 0;
      return ta - tb;
    });
    let opening = 0;
    const inRange = [];
    all.forEach(m => {
      const t = m.date instanceof Date ? m.date.getTime() : 0;
      if (dateFrom instanceof Date && t < dateFrom.getTime()) { opening += m.amount; return; }
      if (dateTo instanceof Date && t > dateTo.getTime()) return;
      inRange.push(m);
    });
    let running = opening;
    const movements = inRange.map(m => {
      const balBefore = running;
      running += m.amount;
      return {
        invoice_unique_id: m.invoice_unique_id || '',
        date: m.date,
        type: m.type,
        reference: m.reference,
        description: m.description,
        amount: m.amount,
        debit: m.amount > 0 ? m.amount : 0,
        credit: m.amount < 0 ? -m.amount : 0,
        balance_before: balBefore,
        running_balance: running,
        currency: m.currency,
        rate: m.rate,
        net: m.net,
        discount: m.discount,
        total: m.total,
        invoice_number: m.invoice_number,
        total_qty: m.total_qty,
        item_count: m.item_count,
        method: m.method,
        withdrawal: m.withdrawal,
        lines: m.lines || []
      };
    });
    return { movements: movements, balance: running, opening_balance: opening };
  }

  function customerBalanceMap_(dbId) {
    const map = {};
    customerRawMovements_(dbId).forEach(m => {
      map[m.customer] = (map[m.customer] || 0) + m.amount;
    });
    return map;
  }

  function getCustomerStatement_(data, user, dbId) {
    const customerId = String((data && data.customer_id) || '').trim();
    if (!customerId) throw new Error('كود العميل مطلوب');
    const dateFrom = parseDate_(data && data.date_from);
    const dateTo = parseDate_(data && data.date_to);
    const cust = partyRefs_(dbId).find(c => String(c.id) === customerId);
    if (!cust) throw new Error('العميل غير موجود');
    const stmt = customerMovements_(dbId, customerId, dateFrom, dateTo);
    return {
      status: 'success',
      customer: {
        id: cust.id,
        name: cust.name,
        customer_direction: normalizeDirection_(cust.customer_direction) || cust.customer_direction,
        telephone: cust.telephone || '',
        address: cust.address || ''
      },
      movements: stmt.movements,
      balance: stmt.balance,
      opening_balance: stmt.opening_balance
    };
  }

  // =========================================
  // Sales offers — clone of sales without returns, offer tables
  // =========================================
  function getSalesOfferHeaders_(data, user, dbId) {
    var limit = Number(data && data.limit) || 20;
    const rows = tlDbList_(dbId, OFFER_SHEET);
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    // Phase 12 — slice before mapping. The map was Object.assign({}, r) for every
    // offer ever, and the comparator reads only 'تاريخ الفاتورة', 'رقم الفاتورة' and
    // invoice_unique_id, all of which the map copies verbatim off the raw row. So the
    // same comparator over an index array gives the same permutation — sort is stable
    // and the index array starts in the same order the mapped array did — and the
    // slice stays ON THE INDEX ARRAY so an odd limit behaves identically.
    var order = [];
    for (var i = 0; i < rows.length; i++) order.push(i);
    order.sort(function(ia,ib){
      var a = rows[ia], b = rows[ib];
      var da = parseDate_(a['تاريخ الفاتورة']);
      var db = parseDate_(b['تاريخ الفاتورة']);
      var ta = da instanceof Date ? da.getTime() : 0;
      var tb = db instanceof Date ? db.getTime() : 0;
      if (tb !== ta) return tb - ta;
      var na = parseInt(String(a['رقم الفاتورة']||'').split('-')[0],10)||0;
      var nb = parseInt(String(b['رقم الفاتورة']||'').split('-')[0],10)||0;
      if (nb !== na) return nb - na;
      return String(b.invoice_unique_id||'').localeCompare(String(a.invoice_unique_id||''));
    });
    if (!data || !data.loadAll) order = order.slice(0, limit);
    var headers = order.map(idx => {
      const r = rows[idx];
      const rec = Object.assign({}, r);
      rec.customer_name = custNames[String(r['اسم العميل'])] || '';
      return rec;
    });
    return { status: 'success', headers: headers, options: salesOptions_(dbId) };
  }

  function getSalesOfferLines_(data, user, dbId) {
    const parentId = String((data && data.parent_id) || '');
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = tlDbList_(dbId, OFFER_LINES_SHEET)
      .filter(r => String(r['top_lightsales_offer_id']) === parentId)
      .map(r => ({
        unique_id: r.unique_id,
        id: r.id,
        product_id: r.product_id,
        product_name: prodNames[String(r.product_id)] || '',
        product_tax: r.product_tax,
        product_qty: r.product_qty,
        product_price: r.product_price,
        product_discount: r.product_discount,
        product_net_value: r.product_net_value,
        product_tax_value: r.product_tax_value,
        product_total_value: r.product_total_value
      }));
    return { status: 'success', lines: lines };
  }

  function getSalesOfferPrint_(data, user, dbId) {
    const uid = String((data && data.offer_code) || '').trim();
    if (!uid) throw new Error('معرف العرض مطلوب');
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    const rec = tlDbList_(dbId, OFFER_SHEET).find(r => String(r.invoice_unique_id) === uid);
    if (!rec) throw new Error('العرض غير موجود');
    const header = Object.assign({}, rec);
    header.customer_name = custNames[String(rec['اسم العميل'])] || '';
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = tlDbList_(dbId, OFFER_LINES_SHEET)
      .filter(r => String(r['top_lightsales_offer_id']) === uid)
      .map(r => ({
        product_id: r.product_id,
        product_name: prodNames[String(r.product_id)] || '',
        product_tax: r.product_tax,
        product_qty: r.product_qty,
        product_price: r.product_price,
        product_discount: r.product_discount,
        product_net_value: r.product_net_value,
        product_tax_value: r.product_tax_value,
        product_total_value: r.product_total_value
      }));
    return { status: 'success', header: header, lines: lines };
  }

  function addSalesOffer_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    validateSales_(header, lines, dbId, true);
    /* Phase 6 — Valley parity: see addPurchasing_. Guard sits before offer
     * numbering so a replay never allocates a second offer number. */
    const _reqKeyO = String((data && (data.request_key || data.unique_id)) || (header && (header.request_key || header.unique_id)) || '').trim();
    if (_reqKeyO) {
      var _seenO = null;
      try { _seenO = requestDedupeExecute_(dbId, OFFER_SHEET, _reqKeyO, _reqKeyO); } catch (eGuardO) { _seenO = null; }
      if (_seenO) return liveDedupeReply_(_seenO, 'تمت إضافة العرض');
    }
    const uid = _reqKeyO || uid16_();
    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = nextOfferNumber_(dbId);
    computeSalesTotals_(header, lines);
    writeOfferHeaderRow_(dbId, uid, header, user);
    writeOfferLines_(dbId, uid, lines, user);
    try { var _uid = 'create_erp_test_sales_offer_' + uid; logHistory_(dbId, OFFER_SHEET, _uid, String(uid), (user&&user.email)||'', 'create', header, null); } catch(e){}
    var custNamesOffer = {};
    try{ partyRefs_(dbId).forEach(function(c){ custNamesOffer[String(c.id)] = c.name; }); }catch(e){}
    var savedOffer = {
      invoice_unique_id: uid,
      'رقم الفاتورة': header.invoice_number,
      'اسم العميل': header.customer_id,
      'تاريخ الفاتورة': parseDate_(header.invoice_date),
      'المبلغ الصافي': num0_(header.net_amount),
      'نسبة الخصم': num0_(header.discount_percent),
      'قيمة الخصم': num0_(header.discount_amount),
      'قيمة الضريبة': num0_(header.tax_amount),
      'إجمالي': num0_(header.total_amount),
      tax_system: header.tax_system === true || header.tax_system === 'true',
      approval_status: 'Pending',
      customer_name: custNamesOffer[String(header.customer_id)] || '',
      unique_id: uid
    };
    return { status: 'success', message: 'تمت إضافة العرض', unique_id: uid, assignedId: uid, record: savedOffer };
  }

  function editSalesOffer_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    const uid = String((header.unique_id == null) ? '' : header.unique_id).trim();
    if (!uid) throw new Error('معرف العرض مطلوب');
    validateSales_(header, lines, dbId, true);

    var _editOfferOld = tlDbFind_(dbId, OFFER_SHEET, 'invoice_unique_id', uid);
    if (!_editOfferOld) throw new Error('العرض غير موجود');
    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = (_editOfferOld['رقم الفاتورة'] != null && String(_editOfferOld['رقم الفاتورة']).trim() !== '')
      ? _editOfferOld['رقم الفاتورة'] : nextOfferNumber_(dbId);
    computeSalesTotals_(header, lines);

    const changes = offerHeaderDataMap_(header, user);
    if (header.approval_status == null || header.approval_status === '') changes.approval_status = _editOfferOld.approval_status || 'Pending';
    const patched = tlDbPatch_(dbId, OFFER_SHEET, uid, changes, { user: user, version: header.version });
    if (!patched) throw new Error('العرض غير موجود');

    deleteOfferLines_(dbId, uid, user);
    writeOfferLines_(dbId, uid, lines, user);
    try { var _uid = (_editOfferOld && _editOfferOld.record_uid) ? String(_editOfferOld.record_uid) : 'update_erp_test_sales_offer_' + uid; logHistory_(dbId, OFFER_SHEET, _uid, String(uid), (user&&user.email)||'', 'update', header, _editOfferOld); } catch(e){}

    var custNamesOfferE = {};
    try{ partyRefs_(dbId).forEach(function(c){ custNamesOfferE[String(c.id)] = c.name; }); }catch(e){}
    var savedOfferE = {
      invoice_unique_id: uid,
      'رقم الفاتورة': header.invoice_number,
      'اسم العميل': header.customer_id,
      'تاريخ الفاتورة': parseDate_(header.invoice_date),
      'المبلغ الصافي': num0_(header.net_amount),
      'نسبة الخصم': num0_(header.discount_percent),
      'قيمة الخصم': num0_(header.discount_amount),
      'قيمة الضريبة': num0_(header.tax_amount),
      'إجمالي': num0_(header.total_amount),
      tax_system: header.tax_system === true || header.tax_system === 'true',
      approval_status: changes.approval_status,
      customer_name: custNamesOfferE[String(header.customer_id)] || '',
      unique_id: uid
    };
    return { status: 'success', message: 'تم تحديث العرض', unique_id: uid, assignedId: uid, record: savedOfferE };
  }

  function deleteSalesOffer_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف العرض مطلوب');
    const patched = tlDbSoftDelete_(dbId, OFFER_SHEET, uid, { user: user });
    if (!patched) throw new Error('العرض غير موجود');
    var _delOfferOld = patched.oldRecord;
    deleteOfferLines_(dbId, uid, user);
    try { var _uid = (_delOfferOld && _delOfferOld.record_uid) ? String(_delOfferOld.record_uid) : 'delete_erp_test_sales_offer_' + uid; logHistory_(dbId, OFFER_SHEET, _uid, String(uid), (user&&user.email)||'', 'delete', null, _delOfferOld); } catch(e){}
    return { status: 'success', message: 'تم حذف العرض' };
  }

  function approveSalesOffer_(data, user, dbId) {
    /* Phase 6: thin wrapper — see approvePurchasing_. */
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف العرض مطلوب');
    /* Phase 2: Pending->Approved only, Approved terminal — via table. */
    var __curOffer = null; try { __curOffer = tlDbList_(dbId, OFFER_SHEET).find(function(r){ return String(r.invoice_unique_id)===String(uid); }) || null; } catch(eRead){}
    if (__curOffer) assertTransition_('et_offer', __curOffer.approval_status || 'Pending', 'Approved', 'لا يمكن اعتماد العرض من هذه الحالة');
    const res = approveStep_('et_sales_offer', uid, 'approve', user, { dbId: dbId, version: data && data.version });
    if (!res || res.status !== 'success') throw new Error((res && res.message) || 'العرض غير موجود');
    return { status: 'success', message: 'تمت الموافقة على العرض' };
  }

  function nextOfferNumber_(dbId) {
    let maxPrefix = 0;
    tlDbList_(dbId, OFFER_SHEET).forEach(r => {
      const s = String((r['رقم الفاتورة'] == null) ? '' : r['رقم الفاتورة']).trim();
      const m = s.match(/^(\d+)-/);
      if (m) { const n = Number(m[1]); if (!isNaN(n) && n > maxPrefix) maxPrefix = n; }
    });
    return (maxPrefix + 1) + '-' + new Date().getFullYear();
  }

  function offerHeaderDataMap_(header, user) {
    const data = salesHeaderDataMap_(header, user);
    delete data['ميزان حسابي'];
    delete data['نوع الضريبة'];
    delete data['نوع البيان'];
    delete data['نوع السلعة'];
    return data;
  }

  function buildOfferHeaderValues_(headers, uid, header, user) {
    const rowValues = headers.map(() => '');
    const put = (key, val) => { const i = salesColIndex_(headers, key); if (i !== -1) rowValues[i] = val; };
    put('invoice_unique_id', uid);
    const data = offerHeaderDataMap_(header, user);
    Object.keys(data).forEach(function (k) { put(k, data[k]); });
    put('created_at', new Date());
    return rowValues;
  }

  function writeOfferHeaderRow_(dbId, uid, header, user) {
    const sheet = getSheet_(OFFER_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const rowValues = buildOfferHeaderValues_(headers, uid, header, user);
    return tlDbAppendValues_(dbId, OFFER_SHEET, rowValues).rowNumber;
  }

  function writeOfferLines_(dbId, headerUid, lines, user) {
    const sheet = getSheet_(OFFER_LINES_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

    const baseId = getNextIdBatch_(dbId, OFFER_LINES_SHEET, lines.length, etCol_(OFFER_LINES_SHEET, 'id'));

    const valueRows = (lines || []).map((line, i) => {
      const rowValues = headers.map(() => '');
      const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };
      set('unique_id', uid16_());
      set('id', baseId + i);
      set('top_lightsales_offer_id', headerUid);
      set('product_id', numOrKeep_(line.product_id));
      set('product_tax', num0_(line.product_tax));
      set('product_qty', num0_(line.product_qty));
      set('product_price', num0_(line.product_price));
      set('product_discount', num0_(line.product_discount));
      set('user', user ? user.email : '');
      set('created_at', new Date());
      return rowValues;
    });

    if (!valueRows.length) return;

    tlDbAppendValuesBatch_(dbId, OFFER_LINES_SHEET, valueRows);
  }

  function deleteOfferLines_(dbId, headerUid, user) {
    tlDbSoftDeleteWhere_(dbId, OFFER_LINES_SHEET, 'top_lightsales_offer_id', headerUid, { user: user });
  }

  // =========================================
  // Sales analysis report
  // =========================================
  function getSalesAnalysis_(data, user, dbId) {
    const dateFrom = parseDate_(data && data.date_from);
    const dateTo = parseDate_(data && data.date_to);
    const customerId = String((data && data.customer_id) || '').trim();
    const productId = String((data && data.product_id) || '').trim();

    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    const retNet = {};
    tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(r => {
      const inv = String(r.top_lightsales_invoices_id);
      retNet[inv] = (retNet[inv] || 0) + (num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount));
    });

    // invoices containing a product (for product filter)
    let invByProduct = null;
    if (productId) {
      invByProduct = {};
      tlDbList_(dbId, SALES_LINES_SHEET).forEach(l => {
        if (String(l.product_id) === productId) invByProduct[String(l.top_lightsales_header_id)] = true;
      });
    }

    const rows = tlDbList_(dbId, SALES_SHEET)
      .filter(inv => {
        if (customerId && String(inv['اسم العميل']) !== customerId) return false;
        if (productId && !invByProduct[String(inv.invoice_unique_id)]) return false;
        if (dateFrom) {
          const d = parseDate_(inv['تاريخ الفاتورة']);
          const t = d instanceof Date ? d.getTime() : 0;
          if (t && dateFrom instanceof Date && t < dateFrom.getTime()) return false;
        }
        if (dateTo) {
          const d = parseDate_(inv['تاريخ الفاتورة']);
          const t = d instanceof Date ? d.getTime() : 0;
          if (t && dateTo instanceof Date && t > dateTo.getTime()) return false;
        }
        return true;
      })
      .map(inv => {
        const netReturn = retNet[String(inv.invoice_unique_id)] || 0;
        const netAmount = num0_(inv['المبلغ الصافي']);
        const discount = num0_(inv['قيمة الخصم']);
        const tax = num0_(inv['قيمة الضريبة']);
        return {
          code: inv['رقم الفاتورة'] || '',
          invoice_unique_id: inv.invoice_unique_id,
          date: parseDate_(inv['تاريخ الفاتورة']),
          customer_name: custNames[String(inv['اسم العميل'])] || '',
          net_return: netReturn,
          net_amount: netAmount,
          discount: discount,
          tax: tax,
          net_collection: netAmount - discount + tax - netReturn
        };
      });
    rows.sort(function (a, b) {
      const na = parseInt(String(a.code).split('-')[0], 10) || 0;
      const nb = parseInt(String(b.code).split('-')[0], 10) || 0;
      return na - nb;
    });
    const totals = rows.reduce(function (t, r) {
      t.net_return += r.net_return;
      t.net_amount += r.net_amount;
      t.discount += r.discount;
      t.tax += r.tax;
      t.net_collection += r.net_collection;
      return t;
    }, { net_return: 0, net_amount: 0, discount: 0, tax: 0, net_collection: 0 });
    return {
      status: 'success',
      rows: rows,
      totals: totals,
      customer_options: customerSalesOptions_(dbId),
      product_options: productRefs_(dbId).map(p => ({ value: p.id, label: p.name_ar }))
    };
  }

  // =========================================
  // Sales costing analysis (universal report)
  // Same locked per-invoice math as getSalesCosting_, applied to every
  // invoice in the period. Single-pass aggregation (one scan per sheet) —
  // never per-invoice scans — to stay within execution limits.
  // =========================================
  function getSalesCostingAnalysis_(data, user, dbId) {
    const dateFrom = parseDate_(data && data.date_from);
    const dateTo = parseDate_(data && data.date_to);

    const costMap = {};
    tlDbList_(dbId, CURRENT_PRODUCTS_SHEET).forEach(s => {
      const q = num0_(s.current_qty);
      costMap[String(s.unique_id)] = q > 0 ? num0_(s.total_cost_sign) / q : 0;
    });
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });

    const lineAgg = {};
    tlDbList_(dbId, SALES_LINES_SHEET).forEach(l => {
      const inv = String(l.top_lightsales_header_id);
      const pid = String(l.product_id);
      const unitCost = costMap[pid] != null ? costMap[pid] : 0;
      if (!lineAgg[inv]) lineAgg[inv] = { costOrig: 0 };
      lineAgg[inv].costOrig += num0_(l.product_qty) * unitCost;
    });

    const retAgg = {};
    tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(r => {
      const inv = String(r.top_lightsales_invoices_id);
      const pid = String(r.top_lightsales_products_id);
      const unitCost = costMap[pid] != null ? costMap[pid] : 0;
      if (!retAgg[inv]) retAgg[inv] = { retValue: 0, retCost: 0 };
      retAgg[inv].retValue += num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount);
      retAgg[inv].retCost += num0_(r.top_lightreturn_qty) * unitCost;
    });

    const rows = tlDbList_(dbId, SALES_SHEET)
      .filter(inv => {
        if (dateFrom || dateTo) {
          const d = parseDate_(inv['تاريخ الفاتورة']);
          const t = d instanceof Date ? d.getTime() : 0;
          if (dateFrom && t && t < dateFrom.getTime()) return false;
          if (dateTo && t && t > dateTo.getTime()) return false;
        }
        return true;
      })
      .map(inv => {
        const uid = String(inv.invoice_unique_id);
        const la = lineAgg[uid] || { costOrig: 0 };
        const ra = retAgg[uid] || { retValue: 0, retCost: 0 };
        let net = num0_(inv['إجمالي']) - ra.retValue;
        let cost = Math.max(0, la.costOrig - ra.retCost);
        let profit = net - cost;
        let margin = 0;
        if (net <= 0.05) {
          net = 0; cost = 0; profit = 0; margin = 0;
        } else {
          margin = (profit / net) * 100;
        }
        return {
          code: inv['رقم الفاتورة'] || '',
          invoice_unique_id: uid,
          date: parseDate_(inv['تاريخ الفاتورة']),
          customer_name: custNames[String(inv['اسم العميل'])] || '',
          net: net,
          cost: cost,
          profit: profit,
          margin: margin,
          discount: num0_(inv['قيمة الخصم']),
          ret: ra.retValue
        };
      });
    rows.sort(function (a, b) {
      const na = parseInt(String(a.code).split('-')[0], 10) || 0;
      const nb = parseInt(String(b.code).split('-')[0], 10) || 0;
      return na - nb;
    });
    const totals = rows.reduce(function (t, r) {
      t.net += r.net;
      t.cost += r.cost;
      t.profit += r.profit;
      t.discount += r.discount;
      t.returns += r.ret;
      t.count += 1;
      return t;
    }, { net: 0, cost: 0, profit: 0, discount: 0, returns: 0, count: 0 });
    totals.margin = totals.net > 0.05 ? (totals.profit / totals.net) * 100 : 0;
    return { status: 'success', rows: rows, totals: totals };
  }

  // =========================================
  // Income statement (قائمة الدخل)
  // Net revenue: same locked per-invoice math as getSalesCostingAnalysis_
  //   (net = إجمالي − returnsValue). COGS from period stock movement:
  //   COGS = startVal + purchVal − endVal, where quantities are rebuilt
  //   from movement history and valued at the snapshot unitCost
  //   (total_cost_sign / current_qty, same as the costing page).
  // Direct expenses: top_light_cash_bank_movement rows with
  //   chart_account_main = 'التكاليف', dated by transaction_date,
  //   grouped by chart_name, amount = column `total` strictly.
  // Date columns: purchasing = top_light_product_purchasing[receipt_date];
  //   sales = joined top_light_sales_invoices[تاريخ الفاتورة];
  //   returns = top_light_sales_returns[top_lightreturn_date];
  //   expenses = top_light_cash_bank_movement[transaction_date].
  // Single-pass aggregation (one scan per sheet) — never per-invoice
  // scans — to stay within execution limits.
  // =========================================
  function getIncomeStatement_(data, user, dbId) {
    const core = incomeStatementCore_(dbId, parseDate_(data && data.date_from), parseDate_(data && data.date_to));
    return { status: 'success', summary: core.summary, expenses: core.expenses, revenueRows: core.revenueRows, stockDetail: core.stockDetail, startDetail: core.startDetail, purchDetail: core.purchDetail };
  }

  // Shared P&L core — single source of truth for period profit. Both the
  // income-statement page and the financial-position page (أرباح الفترة)
  // compute through here so the two statements can never drift apart.
  function incomeStatementCore_(dbId, dateFrom, dateTo) {
    const fromT = dateFrom instanceof Date ? dateFrom.getTime() : null;
    const toT = dateTo instanceof Date ? dateTo.getTime() : null;
    function inPeriod_(t) {
      if (t !== 0 && !t) return false;
      if (fromT != null && t < fromT) return false;
      if (toT != null && t > toT) return false;
      return true;
    }
    function timeOf_(v) {
      const d = parseDate_(v);
      return d instanceof Date ? d.getTime() : 0;
    }

    // Snapshot unit cost per product — identical to the costing page.
    const costMap = {};
    tlDbList_(dbId, CURRENT_PRODUCTS_SHEET).forEach(s => {
      const q = num0_(s.current_qty);
      costMap[String(s.unique_id)] = q > 0 ? num0_(s.total_cost_sign) / q : 0;
    });
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });

    // Invoice date lookup for sales-line joins.
    const invDate = {};
    const invNum = {};
    const invCustomer = {};
    tlDbList_(dbId, SALES_SHEET).forEach(inv => {
      const uid = String(inv.invoice_unique_id);
      invDate[uid] = timeOf_(inv['تاريخ الفاتورة']);
      invNum[uid] = inv['رقم الفاتورة'] || '';
      invCustomer[uid] = custNames[String(inv['اسم العميل'])] || '';
    });

    // ---- Revenue block: same math as getSalesCostingAnalysis_ ----
    const lineAgg = {};
    tlDbList_(dbId, SALES_LINES_SHEET).forEach(l => {
      const inv = String(l.top_lightsales_header_id);
      const pid = String(l.product_id);
      const unitCost = costMap[pid] != null ? costMap[pid] : 0;
      if (!lineAgg[inv]) lineAgg[inv] = { costOrig: 0, qty: 0 };
      lineAgg[inv].costOrig += num0_(l.product_qty) * unitCost;
      lineAgg[inv].qty += num0_(l.product_qty);
    });

    // Returns: revenue impact + cost relief use only returns whose
    // top_lightreturn_date falls in the period (period-correct, and this is
    // what makes net revenue match the costing page whenever returns fall in
    // the same period as their invoices). Pre-period returns still move the
    // opening stock quantity via the before-bucket below.
    const retAgg = {};
    const retQtyByDate = { before: {}, inPeriod: {} };
    tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(r => {
      const pid = String(r.top_lightsales_products_id);
      const unitCost = costMap[pid] != null ? costMap[pid] : 0;
      // Quantity movement dated by top_lightreturn_date (independent of invoice date).
      const t = timeOf_(r.top_lightreturn_date);
      if (fromT != null && t && t < fromT) {
        retQtyByDate.before[pid] = (retQtyByDate.before[pid] || 0) + num0_(r.top_lightreturn_qty);
        return;
      }
      if (!inPeriod_(t)) return;
      const inv = String(r.top_lightsales_invoices_id);
      if (!retAgg[inv]) retAgg[inv] = { retValue: 0, retCost: 0 };
      retAgg[inv].retValue += num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount);
      retAgg[inv].retCost += num0_(r.top_lightreturn_qty) * unitCost;
      retQtyByDate.inPeriod[pid] = (retQtyByDate.inPeriod[pid] || 0) + num0_(r.top_lightreturn_qty);
    });

    let gross = 0, netAmount = 0, discount = 0, tax = 0, returns = 0, net = 0, cost = 0, count = 0;
    const revRows = [];
    tlDbList_(dbId, SALES_SHEET).forEach(inv => {
      const uid = String(inv.invoice_unique_id);
      const t = invDate[uid] || 0;
      if (!inPeriod_(t)) return;
      const la = lineAgg[uid] || { costOrig: 0 };
      const ra = retAgg[uid] || { retValue: 0, retCost: 0 };
      let n = num0_(inv['إجمالي']) - ra.retValue;
      let c = Math.max(0, la.costOrig - ra.retCost);
      if (n <= 0.05) { n = 0; c = 0; }
      gross += num0_(inv['إجمالي']);
      netAmount += num0_(inv['المبلغ الصافي']);
      discount += num0_(inv['قيمة الخصم']);
      tax += num0_(inv['قيمة الضريبة']);
      returns += ra.retValue;
      net += n;
      cost += c;
      count += 1;
      revRows.push({
        code: inv['رقم الفاتورة'] || '',
        invoice_unique_id: uid,
        date: parseDate_(inv['تاريخ الفاتورة']),
        customer_name: custNames[String(inv['اسم العميل'])] || '',
        gross: num0_(inv['إجمالي']),
        discount: num0_(inv['قيمة الخصم']),
        ret: ra.retValue,
        net: n,
        cost: c,
        profit: n - c
      });
    });
    revRows.sort(function (a, b) {
      const na = parseInt(String(a.code).split('-')[0], 10) || 0;
      const nb = parseInt(String(b.code).split('-')[0], 10) || 0;
      return na - nb;
    });
    // COGS check value: net sales cost in period (sales cost − returns cost).
    const cogsCheck = cost;
    const grossProfit = net - cost;
    const grossMargin = net > 0.05 ? (grossProfit / net) * 100 : 0;

    // ---- Stock block: rebuild quantities from movement history ----
    const startQty = {}, purchQtyIn = {}, salesQtyIn = {};
    // Purchases dated by receipt_date.
    let purchVal = 0;
    const startDetail = [];
    const purchDetail = [];
    tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(l => {
      const pid = String((l.product == null) ? '' : l.product).trim();
      if (!pid) return;
      const t = timeOf_(l.receipt_date);
      const q = num0_(l.qty);
      if (fromT != null && t && t < fromT) {
        startQty[pid] = (startQty[pid] || 0) + q;
        return;
      }
      if (!inPeriod_(t)) return;
      purchQtyIn[pid] = (purchQtyIn[pid] || 0) + q;
      purchVal += num0_(l.total_cost);
      purchDetail.push({ product_id: pid, product_name: prodNames[pid] || ('#' + pid), qty: q, total_cost: num0_(l.total_cost), receipt_date: parseDate_(l.receipt_date) });
    });
    // Sales out dated by joined invoice date.
    tlDbList_(dbId, SALES_LINES_SHEET).forEach(l => {
      const pid = String(l.product_id);
      const t = invDate[String(l.top_lightsales_header_id)] || 0;
      const q = num0_(l.product_qty);
      if (fromT != null && t && t < fromT) {
        startQty[pid] = (startQty[pid] || 0) - q;
        return;
      }
      if (!inPeriod_(t)) return;
      salesQtyIn[pid] = (salesQtyIn[pid] || 0) + q;
    });
    // Returns in dated by top_lightreturn_date (already bucketed above).
    Object.keys(retQtyByDate.before).forEach(pid => {
      startQty[pid] = (startQty[pid] || 0) + retQtyByDate.before[pid];
    });
    const retQtyIn = retQtyByDate.inPeriod;

    let startVal = 0, endVal = 0, salesCostIn = 0, retCostIn = 0;
    const stockDetail = [];
    const allPids = {};
    [startQty, purchQtyIn, salesQtyIn, retQtyIn, costMap].forEach(m => {
      Object.keys(m).forEach(pid => { allPids[pid] = true; });
    });
    Object.keys(allPids).forEach(pid => {
      const unitCost = costMap[pid] != null ? costMap[pid] : 0;
      const sq = startQty[pid] || 0;
      if (sq > 0) startVal += sq * unitCost;
      const eq = sq + (purchQtyIn[pid] || 0) - (salesQtyIn[pid] || 0) + (retQtyIn[pid] || 0);
      if (eq > 0) endVal += eq * unitCost;
      if (sq > 0) startDetail.push({ product_id: pid, product_name: prodNames[pid] || ('#' + pid), qty: sq, unit_cost: unitCost, value: sq * unitCost });
      if (eq !== 0) stockDetail.push({ product_id: pid, product_name: prodNames[pid] || ('#' + pid), qty: eq, unit_cost: unitCost, value: eq > 0 ? eq * unitCost : 0 });
      salesCostIn += (salesQtyIn[pid] || 0) * unitCost;
      retCostIn += (retQtyIn[pid] || 0) * unitCost;
    });
    stockDetail.sort(function (a, b) { return b.value - a.value; });
    startDetail.sort(function (a, b) { return b.value - a.value; });
    purchDetail.sort(function (a, b) {
      const ta = a.receipt_date instanceof Date ? a.receipt_date.getTime() : 0;
      const tb = b.receipt_date instanceof Date ? b.receipt_date.getTime() : 0;
      return ta - tb;
    });
    const cogs = startVal + purchVal - endVal;

    // ---- Direct expenses: chart_account_main = 'التكاليف', amount = `total` ----
    const expByName = {};
    let expensesTotal = 0, expenseLines = 0;
    tlDbList_(dbId, CASH_SHEET).forEach(r => {
      if (String((r.chart_account_main == null) ? '' : r.chart_account_main).trim() !== 'التكاليف') return;
      const t = timeOf_(r.transaction_date);
      if (!inPeriod_(t)) return;
      const name = String((r.chart_name == null) ? '' : r.chart_name).trim() || '(بدون اسم حساب)';
      const amt = num0_(r.total);
      if (!expByName[name]) expByName[name] = { chart_name: name, amount: 0, count: 0 };
      expByName[name].amount += amt;
      expByName[name].count += 1;
      expensesTotal += amt;
      expenseLines += 1;
    });
    const expenses = Object.keys(expByName).map(k => expByName[k])
      .sort(function (a, b) { return b.amount - a.amount; });

    const netProfit = grossProfit - expensesTotal;
    const netMargin = net > 0.05 ? (netProfit / net) * 100 : 0;

    return {
      summary: {
        gross: gross,
        netAmount: netAmount,
        discount: discount,
        tax: tax,
        returns: returns,
        net: net,
        startVal: startVal,
        purchVal: purchVal,
        endVal: endVal,
        cogs: cogs,
        cogsCheck: cogsCheck,
        cogsDiff: cogs - cogsCheck,
        salesCostIn: salesCostIn,
        retCostIn: retCostIn,
        grossProfit: grossProfit,
        grossMargin: grossMargin,
        expensesTotal: expensesTotal,
        expenseLines: expenseLines,
        netProfit: netProfit,
        netMargin: netMargin,
        count: count
      },
      expenses: expenses,
      revenueRows: revRows,
      stockDetail: stockDetail,
      startDetail: startDetail,
      purchDetail: purchDetail
    };
  }

  // =========================================
  // Statement of financial position (قائمة المركز المالي) — balances as of
  // date_to (defaults to today); period P&L over [date_from, date_to] comes
  // from incomeStatementCore_ so both statements always agree.
  // Assets: fixed = purchasing lines with 121100 ≤ movement_type ≤ 211100
  //   (Σ total_cost, receipt_date ≤ as-of); cash = Σ balance_amount
  //   (transaction_date ≤ as-of, excluding related_box 111103 — same
  //   exclusion as the cash KPIs); AR = positive as-of party balances
  //   (same engine as the tl_customers الرصيد column).
  // Liabilities & equity: AP = negative as-of party balances; capital is a
  //   fixed 13,904,527.63; owner running account is 0 unless recalc_running is
  //   set, in which case it is recomputed to balance the statement.
  // Single-pass aggregation per sheet — never per-party scans.
  // =========================================
  // Fixed capital.
  var TL_FIXED_CAPITAL = 13904527.63;

  function getFinancialPosition_(data, user, dbId) {
    const dateFrom = parseDate_(data && data.date_from);
    const dateTo = parseDate_(data && data.date_to);
    const asofT = dateTo instanceof Date ? dateTo.getTime() : new Date().getTime();
    function asofOk_(v) {
      if (v == null || v === '') return true;
      const d = parseDate_(v);
      if (!(d instanceof Date)) return true;
      return d.getTime() <= asofT;
    }

    // ---- Fixed assets ----
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    let fixedAssets = 0;
    const fixedLines = [];
    tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(l => {
      const mt = Number(String((l.movement_type == null) ? '' : l.movement_type).trim());
      if (!(mt >= 121100 && mt <= 211100)) return;
      if (!asofOk_(l.receipt_date)) return;
      const amt = num0_(l.total_cost);
      fixedAssets += amt;
      fixedLines.push({
        product_name: prodNames[String(l.product)] || '',
        movement_type: l.movement_type,
        date: parseDate_(l.receipt_date),
        amount: amt
      });
    });
    fixedLines.sort(function (a, b) {
      const ta = a.date instanceof Date ? a.date.getTime() : 0;
      const tb = b.date instanceof Date ? b.date.getTime() : 0;
      return ta - tb;
    });

    // ---- Cash (signed balance_amount column, summed directly) ----
    const boxNames = boxNameMap_(dbId);
    let cash = 0;
    const boxMap = {};
    tlDbList_(dbId, CASH_SHEET).forEach(r => {
      if (String((r.related_box == null) ? '' : r.related_box).trim() === '111103') return;
      if (!asofOk_(r.transaction_date)) return;
      const amt = Number(r.balance_amount) || 0;
      cash += amt;
      const b = String((r.related_box == null) ? '' : r.related_box).trim() || '(بدون صندوق)';
      if (!boxMap[b]) boxMap[b] = { box: b, box_name: boxNames[b] || '', amount: 0 };
      boxMap[b].amount += amt;
    });
    const boxes = Object.keys(boxMap).map(k => boxMap[k])
      .sort(function (a, b) { return b.amount - a.amount; });

    // ---- AR / AP — as-of party balances, single scan ----
    const balAsOf = {};
    customerRawMovements_(dbId).forEach(m => {
      const t = m.date instanceof Date ? m.date.getTime() : 0;
      if (t > asofT) return;
      balAsOf[m.customer] = (balAsOf[m.customer] || 0) + m.amount;
    });
    const ar = [], ap = [];
    let arTotal = 0, apTotal = 0;
    partyRefs_(dbId).forEach(p => {
      if (String(p.id) === '19') return; // excluded from SFP AR/AP by policy
      const b = balAsOf[String(p.id)] || 0;
      if (b > 0) {
        ar.push({ id: p.id, name: p.name, direction: normalizeDirection_(p.customer_direction) || p.customer_direction, balance: b });
        arTotal += b;
      } else if (b < 0) {
        ap.push({ id: p.id, name: p.name, direction: normalizeDirection_(p.customer_direction) || p.customer_direction, balance: -b });
        apTotal += -b;
      }
    });
    ar.sort(function (a, b) { return b.balance - a.balance; });
    ap.sort(function (a, b) { return b.balance - a.balance; });

    // ---- Equity ----
    const pnl = incomeStatementCore_(dbId, dateFrom, dateTo);
    const periodProfit = pnl.summary.netProfit;
    // Stock as of the as-of date: same movement engine with an open start,
    // so it always agrees with the income statement's ending stock.
    const stockAsOf = incomeStatementCore_(dbId, '', dateTo);
    const stock = stockAsOf.summary.endVal;
    const stockDetail = stockAsOf.stockDetail;
    const capital = TL_FIXED_CAPITAL;
    const totalAssets = fixedAssets + cash + arTotal + stock;
    let running = 0;
    if (data && (data.recalc_running === true || data.recalc_running === 'true')) {
      running = totalAssets - apTotal - capital - periodProfit;
    }
    const totalEquity = capital + running + periodProfit;
    const totalLiabEquity = apTotal + totalEquity;
    const balanceDiff = totalAssets - totalLiabEquity;
    const currentAssets = cash + arTotal + stock;

    return {
      status: 'success',
      asof: dateTo instanceof Date ? dateTo : new Date(),
      summary: {
        fixedAssets: fixedAssets,
        fixedCount: fixedLines.length,
        cash: cash,
        arTotal: arTotal,
        arCount: ar.length,
        stock: stock,
        stockCount: stockDetail.length,
        currentAssets: currentAssets,
        totalAssets: totalAssets,
        apTotal: apTotal,
        apCount: ap.length,
        capital: capital,
        running: running,
        runningRecalculated: !!(data && (data.recalc_running === true || data.recalc_running === 'true')),
        periodProfit: periodProfit,
        totalEquity: totalEquity,
        totalLiabEquity: totalLiabEquity,
        balanceDiff: balanceDiff
      },
      boxes: boxes,
      ar: ar,
      ap: ap,
      fixedLines: fixedLines,
      stockDetail: stockDetail,
      pnlSummary: pnl.summary
    };
  }

  // =========================================
  // Cash movement report
  // =========================================
  function companyArabicName_() {
    try {
      const row = systemFindByBusinessKey_('ERP_Companies', 'company_unique_id', '37fc50edf1424abd');
      return row ? String(row.company_name_ar || '').trim() : 'النظام التجريبي';
    } catch (e) { return 'النظام التجريبي'; }
  }

  function getCashReport_(data, user, dbId) {
    const dateFrom = parseDate_(data && data.date_from);
    const dateTo = parseDate_(data && data.date_to);
    const boxId = String((data && data.box) || '').trim();
    const typeId = String((data && data.type) || '').trim();

    const boxMap = {};
    boxRefs_(dbId).forEach(b => {
      boxMap[String(b['المستوى الخامس'])] = [b['اسم المستوى الرابع'], b['المستوى الخامس'], b['اسم المستوى الخامس']].join('-');
    });
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });
    const companyName = companyArabicName_();
    const rows = tlDbList_(dbId, CASH_SHEET)
      .filter(r => {
        if (boxId && String(r.related_box) !== boxId) return false;
        if (typeId && String(r.transaction_type) !== typeId) return false;
        if (dateFrom) {
          const d = parseDate_(r.transaction_date);
          const t = d instanceof Date ? d.getTime() : 0;
          if (t && dateFrom instanceof Date && t < dateFrom.getTime()) return false;
        }
        if (dateTo) {
          const d = parseDate_(r.transaction_date);
          const t = d instanceof Date ? d.getTime() : 0;
          if (t && dateTo instanceof Date && t > dateTo.getTime()) return false;
        }
        return true;
      })
      .map(r => {
        let party = String((r.name_vendor == null) ? '' : r.name_vendor).trim();
        if (!party) party = String((r.name == null) ? '' : r.name).trim() ? (custNames[String(r.name)] || '') : companyName;
        return {
          transaction_id: r.transaction_id,
          date: parseDate_(r.transaction_date),
          party: party,
          details: r.transaction_details || '',
          account: boxMap[String(r.related_box)] || '',
          type: r.transaction_type || '',
          total: num0_(r.total),
          balance: num0_(r.box_balance),
          approved: r.approved === true || r.approved === 'true'
        };
      });
    rows.sort(function (a, b) { return Number(a.transaction_id) - Number(b.transaction_id); });
    return {
      status: 'success',
      rows: rows,
      box_options: boxOptions_(dbId),
      type_options: [{ value: 'Debit', label: 'مدين (Debit)' }, { value: 'Credit', label: 'دائن (Credit)' }]
    };
  }

  // =========================================
  // Generic XLSX export (built via Utilities.zip, no Drive API needed)
  // =========================================
  function getXlsxExport_(data, user, dbId) {
    const headers = (data && data.headers) || [];
    const rows = (data && data.rows) || [];
    const filename = (data && data.filename) || 'report.xlsx';
    if (!headers.length) throw new Error('headers required');
    const blob = buildXlsx_(headers, rows, filename);
    return { status: 'success', base64: Utilities.base64Encode(blob.getBytes()), filename: filename };
  }

  function buildXlsx_(headers, rows, filename) {
    const esc = function (s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    let sheetData = '';
    let hrow = '<row r="1">';
    headers.forEach(function (h, i) {
      hrow += '<c r="' + colLetter_(i) + '1" t="inlineStr"><is><t>' + esc(h) + '</t></is></c>';
    });
    hrow += '</row>';
    sheetData += hrow;
    rows.forEach(function (r, ri) {
      const rn = ri + 2;
      let row = '<row r="' + rn + '">';
      headers.forEach(function (h, ci) {
        const v = r[h];
        const ref = colLetter_(ci) + rn;
        if (typeof v === 'number' && isFinite(v)) {
          row += '<c r="' + ref + '"><v>' + v + '</v></c>';
        } else {
          row += '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(v) + '</t></is></c>';
        }
      });
      row += '</row>';
      sheetData += row;
    });

    const parts = {};
    parts['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    parts['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    parts['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
    parts['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
    parts['xl/worksheets/sheet1.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetData + '</sheetData></worksheet>';

    const blobs = [];
    Object.keys(parts).forEach(function (k) {
      blobs.push(Utilities.newBlob(parts[k], 'application/xml', k));
    });
    return Utilities.zip(blobs, filename);
  }

  // =========================================
  // Items needed to purchase (current_qty / last purchase qty <= 0.5)
  // =========================================
  function getPurchaseNeeds_(data, user, dbId) {
    const qtyMap = currentQtyMap_(dbId);
    // last purchase qty per product: qty of the purchasing line with max receipt_date
    const latest = {};
    tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(r => {
      const pid = String((r.product == null) ? '' : r.product).trim();
      if (!pid) return;
      const d = parseDate_(r.receipt_date);
      const t = d instanceof Date ? d.getTime() : 0;
      if (!(pid in latest) || t > latest[pid].t) {
        latest[pid] = { t: t, qty: num0_(r.qty) };
      }
    });

    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const rows = [];
    Object.keys(latest).forEach(pid => {
      const lastQty = latest[pid].qty;
      if (lastQty <= 0) return;
      const current = qtyMap[pid] != null ? qtyMap[pid] : 0;
      const ratio = current / lastQty;
      rows.push({
        product_id: pid,
        product_name: prodNames[pid] || '',
        current_qty: current,
        last_purchase_qty: lastQty,
        ratio: ratio,
        needs_purchase: ratio <= 0.5
      });
    });
    rows.sort(function (a, b) { return a.ratio - b.ratio; });
    return { status: 'success', rows: rows };
  }

  // =========================================
  // Product movement (purchases in, sales out, returns in)
  // =========================================
  function getProductMovement_(data, user, dbId) {
    const productId = String((data && data.product_id) || '').trim();
    if (!productId) throw new Error('معرف المنتج مطلوب');
    const dateFrom = parseDate_(data && data.date_from);
    const dateTo = parseDate_(data && data.date_to);
    const prodNames = {};
    productRefs_(dbId).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const custNames = {};
    partyRefs_(dbId).forEach(c => { custNames[String(c.id)] = c.name; });

    const invMap = {};
    tlDbList_(dbId, SALES_SHEET).forEach(inv => {
      invMap[String(inv.invoice_unique_id)] = {
        number: inv['رقم الفاتورة'] || '',
        customer: custNames[String(inv['اسم العميل'])] || '',
        date: parseDate_(inv['تاريخ الفاتورة'])
      };
    });

    const movements = [];

    // Purchases (in) — from purchasing lines, reference = header code
    const headerMap = {};
    tlDbList_(dbId, PURCHASING_SHEET).forEach(h => { headerMap[String(h.unique_id)] = h; });
    tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(l => {
      if (String(l.product) !== productId) return;
      const h = headerMap[String(l.top_light_purchasing_costing_id)] || {};
      movements.push({
        date: parseDate_(l.receipt_date),
        type: 'purchase',
        reference: h.code || '',
        customer: custNames[String(l.vendor)] || '',
        qty_in: num0_(l.qty),
        qty_out: 0
      });
    });

    // Sales (out)
    tlDbList_(dbId, SALES_LINES_SHEET).forEach(l => {
      if (String(l.product_id) !== productId) return;
      const inv = invMap[String(l.top_lightsales_header_id)] || {};
      movements.push({
        date: inv.date || parseDate_(l.created_at),
        type: 'sales',
        reference: inv.number || '',
        customer: inv.customer || '',
        qty_in: 0,
        qty_out: num0_(l.product_qty)
      });
    });

    // Returns (in)
    tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(r => {
      if (String(r.top_lightsales_products_id) !== productId) return;
      const inv = invMap[String(r.top_lightsales_invoices_id)] || {};
      movements.push({
        date: parseDate_(r.top_lightreturn_date),
        type: 'return',
        reference: inv.number || '',
        customer: custNames[String(r.top_lightsales_invoices_client)] || '',
        qty_in: num0_(r.top_lightreturn_qty),
        qty_out: 0
      });
    });

    movements.sort(function (a, b) {
      const ta = a.date instanceof Date ? a.date.getTime() : 0;
      const tb = b.date instanceof Date ? b.date.getTime() : 0;
      return ta - tb;
    });

    let opening = 0;
    const inRange = [];
    movements.forEach(m => {
      const t = m.date instanceof Date ? m.date.getTime() : 0;
      if (dateFrom instanceof Date && t < dateFrom.getTime()) { opening += m.qty_in - m.qty_out; return; }
      if (dateTo instanceof Date && t > dateTo.getTime()) return;
      inRange.push(m);
    });

    let running = opening;
    const rows = inRange.map(m => {
      running += m.qty_in - m.qty_out;
      return {
        date: m.date,
        type: m.type,
        reference: m.reference,
        customer: m.customer,
        qty_in: m.qty_in,
        qty_out: m.qty_out,
        running: running
      };
    });

    return {
      status: 'success',
      product: { id: productId, name: prodNames[productId] || '' },
      opening_balance: opening,
      rows: rows,
      balance: running
    };
  }

  // =========================================
  // Registration
  // =========================================
  register('get_et_dashboard_data', getDashboardData_);
  register('get_et_kpi_data', getKpiData_);
  register('get_et_products', getProducts_);
  register('add_et_product', addProduct_);
  register('edit_et_product', editProduct_);
  register('get_et_parties', getParties_);
  register('add_et_party', addParty_);
  register('edit_et_party', editParty_);
  register('get_et_purchasing_headers', getPurchasingHeaders_);
  register('get_et_purchasing_options', getPurchasingOptions_);
  register('get_et_purchasing_lines', getPurchasingLines_);
  register('get_et_purchase_print', getPurchasePrint_);
  register('add_et_purchasing', addPurchasing_);
  register('edit_et_purchasing', editPurchasing_);
  register('delete_et_purchasing', deletePurchasing_);
  register('approve_et_purchasing', approvePurchasing_);
  register('get_et_sales_headers', getSalesHeaders_);
  register('get_et_sales_options', getSalesOptions_);
  register('get_et_sales_lines', getSalesLines_);
  register('get_et_sales_print', getSalesPrint_);
  register('get_et_sales_costing', getSalesCosting_);
  register('add_et_sales', addSales_);
  register('edit_et_sales', editSales_);
  register('delete_et_sales', deleteSales_);
  register('approve_et_sales', approveSales_);
  register('get_et_sales_returns', getSalesReturns_);
  register('add_et_sales_return', addSalesReturn_);
  register('delete_et_sales_return', deleteSalesReturn_);
  register('get_et_cash_headers', getCashHeaders_);
  register('add_et_cash', addCash_);
  register('edit_et_cash', editCash_);
  register('delete_et_cash', deleteCash_);
  register('approve_et_cash', approveCash_);
  register('add_et_transfer', addTransfer_);
  register('get_et_customer_statement', getCustomerStatement_);
  register('get_et_sales_offer_headers', getSalesOfferHeaders_);
  register('get_et_sales_offer_lines', getSalesOfferLines_);
  register('get_et_sales_offer_print', getSalesOfferPrint_);
  register('add_et_sales_offer', addSalesOffer_);
  register('edit_et_sales_offer', editSalesOffer_);
  register('delete_et_sales_offer', deleteSalesOffer_);
  register('approve_et_sales_offer', approveSalesOffer_);
  register('get_et_sales_analysis', getSalesAnalysis_);
  register('get_et_sales_costing_analysis', getSalesCostingAnalysis_);
  register('get_et_income_statement', getIncomeStatement_);
  register('get_et_financial_position', getFinancialPosition_);
  register('get_et_cash_report', getCashReport_);
  register('get_xlsx_export', getXlsxExport_);
  register('get_et_purchase_needs', getPurchaseNeeds_);
  register('get_et_product_movement', getProductMovement_);

  // Phase 11 — warms through the accessors, so it warms the stamped keys readers
  // actually read. It used to warm the unstamped 120s keys, which after this phase
  // nothing reads at all; and it warmed 'categories' with the RAW shape, silently
  // overwriting the projected shape categoryOptions_ expects. Both category shapes
  // are warmed now — the second getAllRecords_ costs no sheet read, because the
  // Phase 9 request memo serves it.
  function prefetchRefs_(data, user, dbId) {
    try { categoryRefs_(dbId); } catch(e){}
    try { categoryOptions_(dbId); } catch(e){}
    try { chartRefs_(dbId); } catch(e){}
    try { partyRefs_(dbId); } catch(e){}
    try { productRefs_(dbId); } catch(e){}
    try { boxRefs_(dbId); } catch(e){}
    return { status: 'success' };
  }
  register('prefetch_refs', prefetchRefs_);
  /* One action for every page in this company. It does NOT go through
     PAGE_ACCESS, because one entry could only describe one page; it gates
     itself on the page it is asked about (see getPageVersions_). */
  register('get_page_versions', getPageVersions_);

  /* Phase 2: register field validators for validateBeforeWrite (no logic duplicated —
   * each entry calls the existing validator). Status-only paths skip via STATUS_ONLY_ACTIONS_. */
  try {
    if (typeof registerDocValidator_ === 'function') {
      registerDocValidator_('et_purchasing', function(payloadData, dbId){ var h=(payloadData&&payloadData.header)||{}; var l=(payloadData&&payloadData.lines)||[]; return validatePurchasingHeader_(h, l); });
      registerDocValidator_('et_sales', function(payloadData, dbId){ var h=(payloadData&&payloadData.header)||{}; var l=(payloadData&&payloadData.lines)||[]; return validateSales_(h, l, dbId, false); });
      registerDocValidator_('et_offer', function(payloadData, dbId){ var h=(payloadData&&payloadData.header)||{}; var l=(payloadData&&payloadData.lines)||[]; return validateSales_(h, l, dbId, true); });
      registerDocValidator_('et_cash', function(payloadData, dbId){ var d=payloadData||{}; if (d.from_box !== undefined || d.to_box !== undefined) return validateTransfer_(d); var r=d.record||d||{}; return validateCash_(r); });
    }
  } catch(eRegTL){}


  function erpTestThemeCss_() {
    return '' +
      '<style>\n' +
      ':root {\n' +
      /* [UI-2.4 / D-1 / U-10] Canvas, surfaces, borders and ink are NO LONGER
         overridden here. They come from CSS_Tokens.html, so all three companies
         share one neutral canvas and one hairline border, and TopLight is
         identified by its topbar and its buttons rather than by painting the
         whole page amber. What stays below is brand and semantics only. */
      '  --font-sans: \'Cairo\', sans-serif;\n' +
      '  --font-mono: \'Consolas\', \'Courier New\', monospace;\n' +
      '  --success: #16a34a;\n' +
      '  --success-bg: #f0fdf4;\n' +
      '  --success-text: #16a34a;\n' +
      '  --success-border: #bbf7d0;\n' +
      '  --warning: #c2410c;\n' +
      '  --warning-bg: #fff7ed;\n' +
      '  --warning-text: #c2410c;\n' +
      '  --warning-border: #fed7aa;\n' +
      '  --danger: #b91c1c;\n' +
      '  --danger-bg: #fef2f2;\n' +
      '  --danger-text: #b91c1c;\n' +
      '  --danger-border: #fecaca;\n' +
      '  --info: #0369a1;\n' +
      '  --amber: #1d4ed8;\n' +
      '  --brand-primary: #1e3a8a;\n' +
      '  --brand-primary-hover: #172554;\n' +
      '  --brand-subtle-bg: #dbeafe;\n' +
      '  --brand-border: #1e3a8a;\n' +
      '  --btn-text-color: #ffffff;\n' +
      '  --shadow-brand: 0 4px 14px rgba(30, 58, 138, 0.25);\n' +
      '}\n' +
      /* The brand topbar: black with amber ink. This, the primary button and the
         row-hover tint are where the brand lives now. */
      '.topbar { background: #1e3a8a; border-bottom: 1px solid #1e3a8a; }\n' +
      '.topbar .nav-item { color: #ffffff; }\n' +
      '.topbar .nav-item:hover, .topbar .nav-item.active { color: #1e3a8a; background: #ffffff; }\n' +
      '/* TopLight dropdowns: curved black fill, yellow ink + black-on-yellow hover — always apparent.\n' +
      '   Scoped to .topbar so a dropdown rendered in page content keeps the neutral surface. */\n' +
      '.topbar .nav-dropdown-menu {\n' +
      '  background: #1e3a8a;\n' +
      '  border: 1px solid #ffffff;\n' +
      '  border-radius: 16px;\n' +
      '  box-shadow: 0 12px 28px rgba(0,0,0,.45);\n' +
      '}\n' +
      '.topbar .nav-dropdown-toggle { color: #ffffff; }\n' +
      '.topbar .nav-dropdown-toggle:hover, .topbar .nav-dropdown-toggle.open { color: #1e3a8a; background: #ffffff; }\n' +
      '/* Profile toggle must read without hovering: pill button + yellow name (the .user-name\n' +
      '   rule would otherwise paint it near-black on the black topbar) */\n' +
      '.topbar .user-profile-toggle { border: 1px solid #ffffff; border-radius: 999px; padding: 4px 12px; background: #1e3a8a; }\n' +
      '.topbar .user-profile-toggle .user-name { color: #ffffff; }\n' +
      '.topbar .user-profile-toggle .nav-dropdown-caret { color: #ffffff; }\n' +
      '.topbar .user-profile-toggle:hover, .topbar .user-profile-toggle.open { background: #ffffff; }\n' +
      '.topbar .user-profile-toggle:hover .user-name, .topbar .user-profile-toggle.open .user-name,\n' +
      '.topbar .user-profile-toggle:hover .nav-dropdown-caret, .topbar .user-profile-toggle.open .nav-dropdown-caret { color: #1e3a8a; }\n' +
      '.topbar .nav-dropdown-item { color: #ffffff; font-weight: 700; border-radius: 10px; }\n' +
      '.topbar .nav-dropdown-item:hover { background: #ffffff; color: #1e3a8a; }\n' +
      '.topbar .nav-dropdown-item-active { background: #ffffff; color: #1e3a8a; font-weight: 800; }\n' +
      '.topbar .user-avatar { background: #ffffff; color: #1e3a8a; }\n' +
      '.topbar .user-profile-name { color: #ffffff; }\n' +
      '.topbar .user-profile-email { color: #dbeafe; }\n' +
      '.topbar .user-profile-divider { background: #ffffff; opacity: .4; }\n' +
      '.topbar .user-profile-logout { color: #ffffff; }\n' +
      '.topbar .user-profile-logout:hover { background: #ffffff; color: #1e3a8a; }\n' +
      '/* Mobile hamburger: black bars are invisible on the black topbar — yellow instead */\n' +
      '.topbar-hamburger { border: 1px solid #ffffff; }\n' +
      '.topbar-hamburger .hamburger-bar { background: #ffffff; }\n' +
      /* Documents keep a visible frame, but a hairline one rather than 2px black. */
      '.invoice { background: #ffffff; border: 1px solid var(--border-color); }\n' +
      /* [UI-7.2 / U-34] The blanket universal print-color-adjust:exact rule is
         gone. It forced the browser to render EVERY background, so this
         company's table header printed as a solid bar and a multi-page report
         cost a cartridge of toner. UI_Components.html now applies print colour
         deliberately, to the document header rule and the totals row only. */
      '</style>\n';
  }
  
  
  
  return { dispatch_: dispatch_,
    schemaCheck_: etSchemaCheck_,
    themeCss_: erpTestThemeCss_,
    blockTheme_: function () { return { from: '#1d4ed8', to: '#3b82f6' }; }, pageForAction_: pageForAction_, tableForAction_: tableForAction_,
    repo_: {
      create: tlDbCreate_,
      appendValues: tlDbAppendValues_,
      appendValuesBatch: tlDbAppendValuesBatch_,
      patch: tlDbPatch_,
      softDelete: tlDbSoftDelete_,
      softDeleteWhere: tlDbSoftDeleteWhere_,
      list: tlDbList_,
      find: tlDbFind_,
      ensureColumns: tlDbEnsureColumns_,
      deriveRow: tlDbDeriveRow_,
      recalcCashBoxBalances: tlRecalcCashBoxBalances_,
      schemas: TL_SCHEMAS,
      auditColumns: TL_AUDIT_COLUMNS
    } };
})();

ErpTest.approvalPolicy_ = {
  aliases: { et_sales_offer: 'et_offer' },
  chains: [
    { docType: 'et_purchasing', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_purchasing_costing', keyColumn: 'unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
    { docType: 'et_sales', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_sales_invoices', keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
    { docType: 'et_cash', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_cash_bank_movement', keyColumn: 'transaction_id', kind: 'cash', versioned: true, missingMsg: 'الحركة غير موجودة' },
    { docType: 'et_sales_offer', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_sales_offer', keyColumn: 'offer_unique_id', kind: 'standard', versioned: true, missingMsg: 'العرض غير موجود' },
    { docType: 'et_manufacture', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_manufacture_orders', keyColumn: 'unique_id', kind: 'standard', versioned: true, missingMsg: 'أمر التصنيع غير موجود' }
  ],
  transitions: {
    et_purchasing: { pending: ['approved'], approved: [] },
    et_sales: { pending: ['approved'], approved: [] },
    et_offer: { pending: ['approved'], approved: [] },
    et_sales_offer: { pending: ['approved'], approved: [] },
    et_cash: { false: ['true'], true: [] },
    et_manufacture: { pending: ['approved'], approved: [] }
  },
  actionToDocType: {
    add_et_purchasing: 'et_purchasing', edit_et_purchasing: 'et_purchasing', delete_et_purchasing: 'et_purchasing', approve_et_purchasing: 'et_purchasing',
    add_et_sales: 'et_sales', edit_et_sales: 'et_sales', delete_et_sales: 'et_sales', approve_et_sales: 'et_sales',
    add_et_sales_offer: 'et_offer', edit_et_sales_offer: 'et_offer', delete_et_sales_offer: 'et_offer', approve_et_sales_offer: 'et_offer',
    add_et_cash: 'et_cash', edit_et_cash: 'et_cash', delete_et_cash: 'et_cash', approve_et_cash: 'et_cash', add_et_transfer: 'et_cash',
    add_et_manufacture: 'et_manufacture', edit_et_manufacture: 'et_manufacture', delete_et_manufacture: 'et_manufacture',
    approve_et_manufacture: 'et_manufacture', complete_et_manufacture: 'et_manufacture', cancel_et_manufacture: 'et_manufacture'
  },
  statusOnly: {
    approve_et_purchasing: true, approve_et_sales: true, approve_et_sales_offer: true, approve_et_cash: true,
    delete_et_purchasing: true, delete_et_sales: true, delete_et_sales_offer: true, delete_et_cash: true,
    approve_et_manufacture: true, delete_et_manufacture: true, complete_et_manufacture: true, cancel_et_manufacture: true
  }
};
ErpTest.attachmentPolicy_ = function () { return {}; };
ErpTest.artifactHandlers_ = {};

function etSchemaCheckRun_() { var r = ErpTest.schemaCheck_('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE'); console.log(JSON.stringify(r)); return r; }
