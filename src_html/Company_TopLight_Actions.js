/**
 * Company_TopLight_Actions.js
 * RESPONSIBILITY: Top Light business logic, IIFE-namespaced to TopLight.
 * Dashboard + Products + Customers/Vendors (create / list / edit).
 * All writes go through getNextId_ + addRecord_ from 02_DataAccess.js.
 * No functions leak into global scope (the only global is TopLight).
 */

const TopLight = (function () {
  const actions = {};
  function register(name, fn) { actions[name] = fn; }

  const PRODUCTS_SHEET = 'top_light_products';
  const CUSTOMERS_SHEET = 'top_light_customer_vendor';
  const CATEGORIES_SHEET = 'top_light_categories';
  const CHART_SHEET = 'top_light_chart_of_accounts';
  const CURRENT_PRODUCTS_SHEET = 'top_light_current_products';
  const PURCHASING_SHEET = 'top_light_purchasing_costing';
  const PURCHASING_LINES_SHEET = 'top_light_product_purchasing';
  const SALES_SHEET = 'top_light_sales_invoices';
  const SALES_LINES_SHEET = 'top_light_sales_products';
  const SALES_RETURNS_SHEET = 'top_light_sales_returns';
  const OFFER_SHEET = 'top_light_sales_offer';
  const OFFER_LINES_SHEET = 'top_light_sales_offer_products';
  const CASH_SHEET = 'top_light_cash_bank_movement';
  const BOX_SHEET = 'top_light_box_account_codes';
  const CURRENCY_SHEET = 'ERP_currency_exchange';

  function dispatch_(payload, user, dbId) {
    const action = payload.module_action;
    if (!actions[action]) throw new Error('Unknown Top Light action: ' + action);
    return actions[action](payload.data, user, dbId);
  }

  // =========================================
  // Page-level access control + audit mapping.
  // page values MUST match the `action` strings in registerTopLight_'s pages
  // array (Company_TopLight_Registry.js) verbatim — they are what
  // ERP_Pages_Matrix.page_id references and what checkPageAccess_ enforces.
  // get_dashboard_data is intentionally absent: it is shadowed by the global
  // ROUTES['get_dashboard_data'] and never reaches this dispatcher.
  // get_xlsx_export is intentionally unmapped: generic client-data exporter
  // usable from any page (coarse get_/add_ rules still apply).
  // =========================================
  const PAGE_ACCESS = {
    'get_products':            { page: 'tl_products', access: 'read' },
    'add_product':             { page: 'tl_products', access: 'write' },
    'edit_product':            { page: 'tl_products', access: 'write' },

    'get_parties':             { page: 'tl_customers', access: 'read' },
    'add_party':               { page: 'tl_customers', access: 'write' },
    'edit_party':              { page: 'tl_customers', access: 'write' },

    'get_purchasing_headers':  { page: 'tl_purchasing', access: 'read' },
    'get_purchasing_lines':    { page: 'tl_purchasing', access: 'read' },
    'add_purchasing':          { page: 'tl_purchasing', access: 'write' },
    'edit_purchasing':         { page: 'tl_purchasing', access: 'write' },
    'delete_purchasing':       { page: 'tl_purchasing', access: 'write' },
    'approve_purchasing':      { page: 'tl_purchasing', access: 'write' },
    'get_purchase_print':      { page: 'tl_purchase_print', access: 'read' },

    'get_sales_headers':       { page: 'tl_sales', access: 'read' },
    'get_sales_lines':         { page: 'tl_sales', access: 'read' },
    'add_sales':               { page: 'tl_sales', access: 'write' },
    'edit_sales':              { page: 'tl_sales', access: 'write' },
    'delete_sales':            { page: 'tl_sales', access: 'write' },
    'approve_sales':           { page: 'tl_sales', access: 'write' },
    'get_sales_print':         { page: 'tl_sales_print', access: 'read' },

    'get_sales_returns':       { page: 'tl_sales_returns', access: 'read' },
    'add_sales_return':        { page: 'tl_sales_returns', access: 'write' },
    'delete_sales_return':     { page: 'tl_sales_returns', access: 'write' },

    'get_sales_offer_headers': { page: 'tl_sales_offer', access: 'read' },
    'get_sales_offer_lines':   { page: 'tl_sales_offer', access: 'read' },
    'add_sales_offer':         { page: 'tl_sales_offer', access: 'write' },
    'edit_sales_offer':        { page: 'tl_sales_offer', access: 'write' },
    'delete_sales_offer':      { page: 'tl_sales_offer', access: 'write' },
    'approve_sales_offer':     { page: 'tl_sales_offer', access: 'write' },
    'get_sales_offer_print':   { page: 'tl_sales_offer_print', access: 'read' },

    'get_sales_analysis':      { page: 'tl_sales_analysis', access: 'read' },

    'get_cash_headers':        { page: 'tl_cash', access: 'read' },
    'add_cash':                { page: 'tl_cash', access: 'write' },
    'edit_cash':               { page: 'tl_cash', access: 'write' },
    'delete_cash':             { page: 'tl_cash', access: 'write' },
    'approve_cash':            { page: 'tl_cash', access: 'write' },
    'add_transfer':            { page: 'tl_cash', access: 'write' },

    'get_cash_report':         { page: 'tl_cash_report', access: 'read' },
    'get_customer_statement':  { page: 'tl_customer_statement', access: 'read' },
    'get_purchase_needs':      { page: 'tl_purchase_needs', access: 'read' },
    'get_product_movement':    { page: 'tl_product_movement', access: 'read' }
  };

  /** Page for a module_action, for both page-access enforcement and SystemLog. */
  function pageForAction_(action) {
    const req = PAGE_ACCESS[action];
    return req ? req.page : '';
  }

  /** Sheet/table touched by a module_action, for the SystemLog Table column. */
  const ACTION_TABLES = {
    'get_products': PRODUCTS_SHEET, 'add_product': PRODUCTS_SHEET, 'edit_product': PRODUCTS_SHEET,

    'get_parties': CUSTOMERS_SHEET, 'add_party': CUSTOMERS_SHEET, 'edit_party': CUSTOMERS_SHEET,

    'get_purchasing_headers': PURCHASING_SHEET, 'add_purchasing': PURCHASING_SHEET,
    'edit_purchasing': PURCHASING_SHEET, 'delete_purchasing': PURCHASING_SHEET,
    'approve_purchasing': PURCHASING_SHEET, 'get_purchase_print': PURCHASING_SHEET,
    'get_purchasing_lines': PURCHASING_LINES_SHEET,

    'get_sales_headers': SALES_SHEET, 'add_sales': SALES_SHEET, 'edit_sales': SALES_SHEET,
    'delete_sales': SALES_SHEET, 'approve_sales': SALES_SHEET, 'get_sales_print': SALES_SHEET,
    'get_sales_lines': SALES_LINES_SHEET,

    'get_sales_returns': SALES_RETURNS_SHEET, 'add_sales_return': SALES_RETURNS_SHEET,
    'delete_sales_return': SALES_RETURNS_SHEET,

    'get_sales_offer_headers': OFFER_SHEET, 'add_sales_offer': OFFER_SHEET,
    'edit_sales_offer': OFFER_SHEET, 'delete_sales_offer': OFFER_SHEET,
    'approve_sales_offer': OFFER_SHEET, 'get_sales_offer_print': OFFER_SHEET,
    'get_sales_offer_lines': OFFER_LINES_SHEET,

    'get_sales_analysis': SALES_SHEET,

    'get_cash_headers': CASH_SHEET, 'add_cash': CASH_SHEET, 'edit_cash': CASH_SHEET,
    'delete_cash': CASH_SHEET, 'approve_cash': CASH_SHEET, 'add_transfer': CASH_SHEET,
    'get_cash_report': CASH_SHEET,

    'get_customer_statement': CUSTOMERS_SHEET,
    'get_purchase_needs': PURCHASING_LINES_SHEET,
    'get_product_movement': CURRENT_PRODUCTS_SHEET
  };

  function tableForAction_(action) {
    return ACTION_TABLES[action] || '';
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
  function categoryOptions_(dbId) {
    return getAllRecords_(dbId, CATEGORIES_SHEET)
      .map(c => ({ id: c.id, name_ar: c.name_ar }))
      .filter(c => c.id !== undefined && c.id !== null && String(c.id).trim() !== '');
  }

  // Asset code ref: chart_of_accounts, filter المستوى الخامس in [114100, 115100].
  // label = كود المستوى (composite text), value = المستوى الخامس (numeric code).
  function assetCodeOptions_(dbId) {
    const rows = getAllRecords_(dbId, CHART_SHEET);
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
    const rows = getAllRecords_(dbId, CHART_SHEET);
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

  // Create a new top_light_categories row (inline add) and return its id.
  function createCategory_(dbId, nameAr, userEmail) {
    const rows = getAllRecords_(dbId, CATEGORIES_SHEET);
    let maxId = 0;
    rows.forEach(c => { const n = Number(c.id); if (!isNaN(n) && n > maxId) maxId = n; });
    const newId = maxId + 1;
    const sheet = getSheet_(CATEGORIES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = headers.map(h => {
      const key = String(h).trim().toLowerCase();
      if (key === 'id') return newId;
      if (key === 'name_ar') return nameAr;
      if (key === 'name_eng') return '';
      if (key === 'user') return userEmail || '';
      if (key === 'created_at') return new Date();
      return '';
    });
    sheet.appendRow(rowValues);
    return newId;
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
    const kpiAuthorized = !!(user && (user.isSuperAdmin || (user.authorizedPages && user.authorizedPages['tl_analysis_review'])));
    return {
      status: 'success',
      kpi_authorized: kpiAuthorized,
      kpis: kpiAuthorized ? dashboardKpis_(dbId) : null
    };
  }

  function dashboardKpis_(dbId) {
    return cachedMap_('tl_dashboard_kpis_' + dbId, 60, function () {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      const retNet = {};
      getAllRecords_(dbId, SALES_RETURNS_SHEET).forEach(r => {
        const inv = String(r.top_lightsales_invoices_id);
        retNet[inv] = (retNet[inv] || 0) + (num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount));
      });

      const custNames = {};
      getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });

      const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const monthly = Array(12).fill(0);
      const byCustomer = {};
      let salesYtd = 0, salesMtd = 0;

      getAllRecords_(dbId, SALES_SHEET).forEach(inv => {
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
      getAllRecords_(dbId, CASH_SHEET).forEach(r => {
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
    const rows = getAllRecords_(dbId, PRODUCTS_SHEET);
    const catNames = {};
    getAllRecords_(dbId, CATEGORIES_SHEET).forEach(c => { catNames[String(c.id)] = c.name_ar; });
    const stockMap = {};
    getAllRecords_(dbId, CURRENT_PRODUCTS_SHEET).forEach(s => {
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
    const id = getNextId_(dbId, PRODUCTS_SHEET);
    const record = addRecord_(dbId, PRODUCTS_SHEET, {
      id: id,
      name_ar: nameAr,
      name_en: String((data && data.name_en) || '').trim(),
      category: resolveCategoryId_(data, user, dbId),
      unit: String((data && data.unit) || '').trim(),
      carton: (data && data.carton) || '',
      sales_tax: (data && data.sales_tax) || '',
      asset_code: String((data && data.asset_code) || '').trim(),
      user: user.email,
      created_at: new Date()
    }, ['name_ar']);
    return { status: 'success', message: 'تمت إضافة المنتج', data: record };
  }

  function editProduct_(data, user, dbId) {
    const id = Number((data && data.id));
    if (!id) throw new Error('معرف المنتج مطلوب');
    const sheet = getSheet_(PRODUCTS_SHEET, dbId);
    const updated = updateRowByCriteria_(sheet, 'id', id, {
      name_ar: String((data && data.name_ar) || '').trim(),
      name_en: String((data && data.name_en) || '').trim(),
      category: resolveCategoryId_(data, user, dbId),
      unit: String((data && data.unit) || '').trim(),
      carton: (data && data.carton) || '',
      sales_tax: (data && data.sales_tax) || '',
      asset_code: String((data && data.asset_code) || '').trim(),
      updated_at: new Date()
    });
    if (!updated) throw new Error('المنتج غير موجود');
    return { status: 'success', message: 'تم تحديث المنتج' };
  }

  // =========================================
  // Customers / Vendors — list / add / edit
  // =========================================
  function getParties_(data, user, dbId) {
    const rows = getAllRecords_(dbId, CUSTOMERS_SHEET);
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
    const id = getNextId_(dbId, CUSTOMERS_SHEET);
    const record = addRecord_(dbId, CUSTOMERS_SHEET, {
      id: id,
      name: name,
      customer_direction: String((data && data.customer_direction) || 'customer').trim(),
      type: String((data && data.type) || '').trim(),
      country: String((data && data.country) || '').trim(),
      region: String((data && data.region) || '').trim(),
      registration_number: String((data && data.registration_number) || '').trim(),
      tax_id: String((data && data.tax_id) || '').trim(),
      name_en: String((data && data.name_en) || '').trim(),
      telephone: String((data && data.telephone) || '').trim(),
      address: String((data && data.address) || '').trim(),
      user: user.email,
      created_at: new Date()
    }, ['name']);
    return { status: 'success', message: 'تمت إضافة الطرف', data: record };
  }

  function editParty_(data, user, dbId) {
    const id = Number((data && data.id));
    if (!id) throw new Error('معرف الطرف مطلوب');
    const sheet = getSheet_(CUSTOMERS_SHEET, dbId);
    const updated = updateRowByCriteria_(sheet, 'id', id, {
      name: String((data && data.name) || '').trim(),
      customer_direction: String((data && data.customer_direction) || 'customer').trim(),
      type: String((data && data.type) || '').trim(),
      country: String((data && data.country) || '').trim(),
      region: String((data && data.region) || '').trim(),
      registration_number: String((data && data.registration_number) || '').trim(),
      tax_id: String((data && data.tax_id) || '').trim(),
      name_en: String((data && data.name_en) || '').trim(),
      telephone: String((data && data.telephone) || '').trim(),
      address: String((data && data.address) || '').trim(),
      updated_at: new Date()
    });
    if (!updated) throw new Error('الطرف غير موجود');
    return { status: 'success', message: 'تم تحديث الطرف' };
  }

  // =========================================
  // Purchasing — costing header + product lines (master-detail)
  // =========================================
  function getPurchasingHeaders_(data, user, dbId) {
    const rows = getAllRecords_(dbId, PURCHASING_SHEET);
    const vendorNames = {};
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(v => { vendorNames[String(v.id)] = v.name; });
    const headers = rows.map(r => {
      const rec = Object.assign({}, r);
      rec.supplier_name = vendorNames[String(r['supplier name'])] || '';
      return rec;
    });
    return { status: 'success', headers: headers, options: purchasingOptions_(dbId) };
  }

  function getPurchasingLines_(data, user, dbId) {
    const parentId = String((data && data.parent_id) || '');
    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = getAllRecords_(dbId, PURCHASING_LINES_SHEET)
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
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(v => { vendorNames[String(v.id)] = v.name; });
    const rec = getAllRecords_(dbId, PURCHASING_SHEET).find(r => String(r.unique_id) === uid);
    if (!rec) throw new Error('العملية غير موجودة');
    const header = Object.assign({}, rec);
    header.supplier_name = vendorNames[String(rec['supplier name'])] || '';

    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = getAllRecords_(dbId, PURCHASING_LINES_SHEET)
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
    const uid = uid16_();
    writeHeaderRow_(dbId, uid, header, user);
    writeLines_(dbId, uid, header, lines, user);
    return { status: 'success', message: 'تمت إضافة عملية الشراء', unique_id: uid };
  }

  function editPurchasing_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    const uid = String((header.unique_id == null) ? '' : header.unique_id).trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    validatePurchasingHeader_(header, lines);

    const sheet = getSheet_(PURCHASING_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const uIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'unique_id');
    const dataArr = sheet.getDataRange().getValues();
    let rowNum = -1;
    for (let i = 1; i < dataArr.length; i++) {
      if (String(dataArr[i][uIdx]).trim() === uid) { rowNum = i + 1; break; }
    }
    if (rowNum === -1) throw new Error('الفاتورة غير موجودة');

    deleteLines_(dbId, uid);
    const rowValues = buildHeaderValues_(headers, uid, header, user);
    sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
    setHeaderFormulas_(sheet, headers, rowNum);
    writeLines_(dbId, uid, header, lines, user);

    return { status: 'success', message: 'تم تحديث عملية الشراء', unique_id: uid };
  }

  function deletePurchasing_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    deleteLines_(dbId, uid);
    const sheet = getSheet_(PURCHASING_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const uIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'unique_id');
    const dataArr = sheet.getDataRange().getValues();
    for (let i = dataArr.length - 1; i >= 1; i--) {
      if (String(dataArr[i][uIdx]).trim() === uid) { sheet.deleteRow(i + 1); break; }
    }
    return { status: 'success', message: 'تم حذف عملية الشراء' };
  }

  function approvePurchasing_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    const sheet = getSheet_(PURCHASING_SHEET, dbId);
    const updated = updateRowByCriteria_(sheet, 'unique_id', uid, {
      approval_status: 'Approved',
      approval: user ? user.email : '',
      approval_time: new Date()
    });
    if (!updated) throw new Error('الفاتورة غير موجودة');
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
    return getAllRecords_(dbId, CUSTOMERS_SHEET).map(v => ({ value: v.id, label: v.name }));
  }

  function productOptions_(dbId) {
    return getAllRecords_(dbId, PRODUCTS_SHEET).map(p => ({ value: p.id, label: p.name_ar }));
  }

  function currencyOptions_() {
    try {
      return getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, CURRENCY_SHEET).map(r => ({
        value: String(r.currency).trim(),
        label: String(r.currency).trim(),
        rate: Number(r.rate) || 1
      }));
    } catch (e) { return []; }
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

  function num0_(v) { return Math.max(0, Number(v) || 0); }

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

  function buildHeaderValues_(headers, uid, header, user) {
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const rowValues = headers.map(() => '');
    const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };

    set('unique_id', uid);
    set('code', header.code);
    set('tax_system', header.tax_system === true || header.tax_system === 'true');
    set('reciept date', parseDate_(header.receipt_date));
    set('items', header.items);
    set('type', header.type);
    set('shipping type', header.shipping_type);
    set('if shipping via cif, enter the insurance value.', num0_(header.cif_insurance_value));
    set('value', num0_(header.value));
    set('currency', header.currency);
    set('exchange rate', num0_(header.exchange_rate));
    set('importation re-price', num0_(header.importation_reprice));
    set('tax declared value', num0_(header.tax_declared_value));
    set('administrative expenses', num0_(header.administrative_expenses));
    set('customs expenses', num0_(header.customs_expenses));
    set('unloading expenses', num0_(header.unloading_expenses));
    set('bank commission', num0_(header.bank_commission));
    set('customs clearance and port receipts', num0_(header.customs_clearance));
    set('additional fees', num0_(header.additional_fees));
    set('clearance expenses', num0_(header.clearance_expenses));
    set('other expenses', num0_(header.other_expenses));
    set('purchase tax', num0_(header.purchase_tax));
    set('income tax', num0_(header.income_tax));
    set('internal cost adjustment', num0_(header.internal_cost_adjustment));
    set('minimum differences', header.minimum_differences);
    set('supplier name', header.supplier_name);
    set('approved this month', header.approved_this_month);
    set('associated bank', header.associated_bank);
    set('user', user ? user.email : '');
    set('approval_status', (header.approval_status != null && header.approval_status !== '') ? header.approval_status : 'Pending');

    return rowValues;
  }

  function setHeaderFormulas_(sheet, headers, rowNum) {
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const L = (name) => colLetter_(idx[name]);

    if (idx['value based on invoice'] !== undefined) {
      sheet.getRange(rowNum, idx['value based on invoice'] + 1).setFormula(
        '=' + L('value') + rowNum + '*' + L('exchange rate') + rowNum);
    }
    if (idx['total costs'] !== undefined) {
      const sumCols = ['value based on invoice', 'administrative expenses', 'customs expenses',
        'unloading expenses', 'bank commission', 'customs clearance and port receipts',
        'additional fees', 'clearance expenses', 'other expenses'];
      const sum = sumCols.map(c => L(c) + rowNum).join('+');
      const sumWithAdj = sum + '+' + L('internal cost adjustment') + rowNum + '+' + L('purchase tax') + rowNum;
      sheet.getRange(rowNum, idx['total costs'] + 1).setFormula(
        '=IF(' + L('type') + rowNum + '="بيع",' + sum + ',' + sumWithAdj + ')');
    }
    if (idx['month'] !== undefined) {
      sheet.getRange(rowNum, idx['month'] + 1).setFormula('=MONTH(' + L('reciept date') + rowNum + ')');
    }
    if (idx['year'] !== undefined) {
      sheet.getRange(rowNum, idx['year'] + 1).setFormula('=YEAR(' + L('reciept date') + rowNum + ')');
    }
    if (idx['cif insurance rate'] !== undefined) {
      sheet.getRange(rowNum, idx['cif insurance rate'] + 1).setFormula(
        '=IF(' + L('shipping type') + rowNum + '="CIF", (' + L('if shipping via cif, enter the insurance value.') + rowNum + '-' + L('value') + rowNum + ')/' + L('value') + rowNum + ', "")');
    }
    if (idx['tax type'] !== undefined) {
      const ratio = L('purchase tax') + rowNum + '/(' + L('importation re-price') + rowNum + '+' + L('customs expenses') + rowNum + ')';
      sheet.getRange(rowNum, idx['tax type'] + 1).setFormula(
        '=IFERROR(IF(' + ratio + ' >= 0.08, 0.14, ' + ratio + '), "")');
    }
    if (idx['sales value'] !== undefined) {
      sheet.getRange(rowNum, idx['sales value'] + 1).setFormula(
        '=IF(' + L('type') + rowNum + '="بيع", ROUND(' + L('total costs') + rowNum + '*103/100,-2), 0)');
    }
    if (idx['sales tax amount'] !== undefined) {
      sheet.getRange(rowNum, idx['sales tax amount'] + 1).setFormula(
        '=IFERROR(IF(' + L('tax type') + rowNum + '>0.06, ' + L('sales value') + rowNum + '*14/100, 0), "")');
    }
  }

  function writeHeaderRow_(dbId, uid, header, user) {
    const sheet = getSheet_(PURCHASING_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = buildHeaderValues_(headers, uid, header, user);
    sheet.appendRow(rowValues);
    const newRow = sheet.getLastRow();
    setHeaderFormulas_(sheet, headers, newRow);
    return newRow;
  }

  function writeLines_(dbId, headerUid, header, lines, user) {
    const sheet = getSheet_(PURCHASING_LINES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const L = (name) => colLetter_(idx[name]);

    const prodCat = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodCat[String(p.id)] = p.category; });

    const ship = String((header.shipping_type == null) ? '' : header.shipping_type).trim();
    const movementPlace = (['CIF', 'FOB', 'C&F'].indexOf(ship) !== -1) ? 'مستورد' : (ship === 'محلي' ? 'محلي' : '');
    const receiptDate = parseDate_(header.receipt_date);

    const baseId = getNextIdBatch_(dbId, PURCHASING_LINES_SHEET, lines.length, 'id');

    (lines || []).forEach((line, i) => {
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
      sheet.appendRow(rowValues);

      const r = sheet.getLastRow();
      if (idx['total_cost'] !== undefined) {
        sheet.getRange(r, idx['total_cost'] + 1).setFormula(
          '=' + L('qty') + r + '*' + L('unit_price') + r + '*' + L('exchange_rate') + r + '+' + L('other_cost') + r);
      }
      if (idx['unit_cost'] !== undefined) {
        sheet.getRange(r, idx['unit_cost'] + 1).setFormula('=' + L('total_cost') + r + '/' + L('qty') + r);
      }
      if (idx['movement_code'] !== undefined) {
        sheet.getRange(r, idx['movement_code'] + 1).setFormula(
          '=CONCATENATE(' + L('movement_type') + r + ',"-",' + L('id') + r + ',"-",VLOOKUP(' + L('product') + r + ',top_light_products!$A:$D,2,0),"-",TEXT(' + L('receipt_date') + r + ',"DD/MM/YYYY"))');
      }
      if (idx['sales_value_amount'] !== undefined) {
        sheet.getRange(r, idx['sales_value_amount'] + 1).setFormula(
          '=' + L('sales_value') + r + '*' + L('qty') + r);
      }
      if (idx['sales_qty'] !== undefined) {
        sheet.getRange(r, idx['sales_qty'] + 1).setFormula('=' + L('qty') + r);
      }
      if (idx['cost_currency'] !== undefined) {
        sheet.getRange(r, idx['cost_currency'] + 1).setFormula(
          '=' + L('qty') + r + '*' + L('unit_price') + r + '+' + L('other_cost') + r + '/' + L('exchange_rate') + r);
      }
    });
  }

  function deleteLines_(dbId, headerUid) {
    const sheet = getSheet_(PURCHASING_LINES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idx = headers.findIndex(h => String(h).trim().toLowerCase() === 'top_light_purchasing_costing_id');
    if (idx === -1) return;
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idx]).trim() === headerUid) sheet.deleteRow(i + 1);
    }
  }

  // =========================================
  // Sales — invoices header + product lines (master-detail)
  // =========================================
  function getSalesHeaders_(data, user, dbId) {
    const rows = getAllRecords_(dbId, SALES_SHEET);
    const custNames = {};
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });

    const stockMaps = cachedMap_('tl_sales_stock_' + dbId, 90, function () {
      const soldMap = {};
      getAllRecords_(dbId, SALES_LINES_SHEET).forEach(l => {
        const k = String(l.top_lightsales_header_id);
        soldMap[k] = (soldMap[k] || 0) + num0_(l.product_qty);
      });
      const returnedMap = {};
      getAllRecords_(dbId, SALES_RETURNS_SHEET).forEach(rt => {
        const k = String(rt.top_lightsales_invoices_id);
        returnedMap[k] = (returnedMap[k] || 0) + num0_(rt.top_lightreturn_qty);
      });
      return { soldMap: soldMap, returnedMap: returnedMap };
    });
    const soldMap = stockMaps.soldMap || {};
    const returnedMap = stockMaps.returnedMap || {};

    const headers = rows.map(r => {
      const rec = Object.assign({}, r);
      rec.customer_name = custNames[String(r['اسم العميل'])] || '';
      const key = String(r.invoice_unique_id);
      const sold = soldMap[key] || 0;
      rec.fully_returned = sold > 0 && (returnedMap[key] || 0) >= sold;
      return rec;
    });
    return { status: 'success', headers: headers, options: salesOptions_(dbId) };
  }

  function getSalesLines_(data, user, dbId) {
    const parentId = String((data && data.parent_id) || '');
    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = getAllRecords_(dbId, SALES_LINES_SHEET)
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
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });
    const rec = getAllRecords_(dbId, SALES_SHEET).find(r => String(r.invoice_unique_id) === uid);
    if (!rec) throw new Error('الفاتورة غير موجودة');
    const header = Object.assign({}, rec);
    header.customer_name = custNames[String(rec['اسم العميل'])] || '';

    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = getAllRecords_(dbId, SALES_LINES_SHEET)
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

    const returns = getAllRecords_(dbId, SALES_RETURNS_SHEET)
      .filter(r => String(r.top_lightsales_invoices_id) === uid)
      .map(r => ({
        product_id: r.top_lightsales_products_id,
        product_name: prodNames[String(r.top_lightsales_products_id)] || '',
        return_qty: r.top_lightreturn_qty,
        return_value: num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount),
        return_date: r.top_lightreturn_date
      }));
    const total_return_value = returns.reduce((s, r) => s + num0_(r.return_value), 0);

    return { status: 'success', header: header, lines: lines, returns: returns, total_return_value: total_return_value };
  }

  function addSales_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    validateSales_(header, lines, dbId);
    const uid = uid16_();
    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = nextInvoiceNumber_(dbId);
    computeSalesTotals_(header, lines);
    writeSalesHeaderRow_(dbId, uid, header, user);
    writeSalesLines_(dbId, uid, header, lines, user);
    return { status: 'success', message: 'تمت إضافة الفاتورة', unique_id: uid };
  }

  function editSales_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    const uid = String((header.unique_id == null) ? '' : header.unique_id).trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    validateSales_(header, lines, dbId);

    const sheet = getSheet_(SALES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const uIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'invoice_unique_id');
    const invIdx = headers.findIndex(h => String(h).trim() === 'رقم الفاتورة');
    const dataArr = sheet.getDataRange().getValues();
    let rowNum = -1;
    for (let i = 1; i < dataArr.length; i++) {
      if (String(dataArr[i][uIdx]).trim() === uid) { rowNum = i + 1; break; }
    }
    if (rowNum === -1) throw new Error('الفاتورة غير موجودة');

    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = (invIdx !== -1 && dataArr[rowNum - 1][invIdx] != null && String(dataArr[rowNum - 1][invIdx]).trim() !== '')
      ? dataArr[rowNum - 1][invIdx] : nextInvoiceNumber_(dbId);
    computeSalesTotals_(header, lines);

    deleteSalesLines_(dbId, uid);
    const rowValues = buildSalesHeaderValues_(headers, uid, header, user);
    sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
    setSalesHeaderFormulas_(sheet, headers, rowNum);
    writeSalesLines_(dbId, uid, header, lines, user);

    return { status: 'success', message: 'تم تحديث الفاتورة', unique_id: uid };
  }

  function deleteSales_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    deleteSalesLines_(dbId, uid);
    const sheet = getSheet_(SALES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const uIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'invoice_unique_id');
    const dataArr = sheet.getDataRange().getValues();
    for (let i = dataArr.length - 1; i >= 1; i--) {
      if (String(dataArr[i][uIdx]).trim() === uid) { sheet.deleteRow(i + 1); break; }
    }
    return { status: 'success', message: 'تم حذف الفاتورة' };
  }

  function approveSales_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف الفاتورة مطلوب');
    const sheet = getSheet_(SALES_SHEET, dbId);
    const updated = updateRowByCriteria_(sheet, 'invoice_unique_id', uid, {
      approval_status: 'Approved',
      approval: user ? user.email : '',
      approval_time: new Date()
    });
    if (!updated) throw new Error('الفاتورة غير موجودة');
    return { status: 'success', message: 'تمت الموافقة على الفاتورة' };
  }

  // =========================================
  // Sales returns — per-product returns against a sales invoice
  // =========================================
  function getSalesReturns_(data, user, dbId) {
    const invoiceId = String((data && data.invoice_id) || '').trim();
    if (!invoiceId) throw new Error('معرف الفاتورة مطلوب');

    const custNames = {};
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });
    const invoice = getAllRecords_(dbId, SALES_SHEET).find(r => String(r.invoice_unique_id) === invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة');

    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });

    const lines = getAllRecords_(dbId, SALES_LINES_SHEET)
      .filter(r => String(r.top_lightsales_header_id) === invoiceId);

    const returnedMap = {};
    getAllRecords_(dbId, SALES_RETURNS_SHEET)
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

    const returns = getAllRecords_(dbId, SALES_RETURNS_SHEET)
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

    const invoice = getAllRecords_(dbId, SALES_SHEET).find(r => String(r.invoice_unique_id) === invoiceId);
    if (!invoice) throw new Error('الفاتورة غير موجودة');

    const line = getAllRecords_(dbId, SALES_LINES_SHEET)
      .find(r => String(r.top_lightsales_header_id) === invoiceId && String(r.product_id) === productId);
    if (!line) throw new Error('المنتج غير موجود في هذه الفاتورة');

    const alreadyReturned = getAllRecords_(dbId, SALES_RETURNS_SHEET)
      .filter(r => String(r.top_lightsales_invoices_id) === invoiceId && String(r.top_lightsales_products_id) === productId)
      .reduce((s, r) => s + num0_(r.top_lightreturn_qty), 0);
    const available = num0_(line.product_qty) - alreadyReturned;
    if (returnQty > available) throw new Error('كمية المرتجع تتجاوز الكمية المتاحة (المتاح: ' + available + ')');

    const price = num0_(line.product_price);
    const value = price * returnQty;
    const net = num0_(invoice['المبلغ الصافي']);
    const discountValue = num0_(invoice['قيمة الخصم']);
    const discount = net > 0 ? (discountValue / net) * value : 0;

    const sheet = getSheet_(SALES_RETURNS_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });

     const nextId = getNextId_(dbId, SALES_RETURNS_SHEET, 'id');

    const rowValues = headers.map(() => '');
    const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };
    set('unique_id', uid16_());
    set('id', nextId);
    set('top_lightsales_invoices_id', invoiceId);
    set('top_lightsales_invoices_client', numOrKeep_(invoice['اسم العميل']));
    set('top_lightreturn_date', returnDate);
    set('top_lightsales_products_id', numOrKeep_(productId));
    set('top_lightreturn_qty', returnQty);
    set('top_lightreturn_discount', discount);
    set('top_lightreturn_price', price);
    set('top_lightreturn_value', value);
    set('user', user ? user.email : '');
    set('created_at', new Date());
    sheet.appendRow(rowValues);

    return { status: 'success', message: 'تمت إضافة المرتجع' };
  }

  function deleteSalesReturn_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف المرتجع مطلوب');
    const sheet = getSheet_(SALES_RETURNS_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const uIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'unique_id');
    const dataArr = sheet.getDataRange().getValues();
    for (let i = dataArr.length - 1; i >= 1; i--) {
      if (String(dataArr[i][uIdx]).trim() === uid) { sheet.deleteRow(i + 1); break; }
    }
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
    return getAllRecords_(dbId, CUSTOMERS_SHEET).map(c => ({
      value: c.id,
      label: c.name,
      tax_id: c.tax_id || '',
      telephone: c.telephone || '',
      address: c.address || ''
    }));
  }

  // Cache an object derived from a heavy sheet read (TTL seconds, script cache).
  function cachedMap_(cacheKey, ttlSeconds, buildFn) {
    try {
      const cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    const result = buildFn();
    try { CacheService.getScriptCache().put(cacheKey, JSON.stringify(result), ttlSeconds); } catch (e) {}
    return result;
  }

  // Available stock per product: top_light_current_products.unique_id -> current_qty.
  function currentQtyMap_(dbId) {
    return cachedMap_('tl_qty_map_' + dbId, 90, function () {
      const map = {};
      getAllRecords_(dbId, CURRENT_PRODUCTS_SHEET).forEach(s => {
        map[String(s.unique_id)] = num0_(s.current_qty);
      });
      return map;
    });
  }

  // Latest purchase unit sale price per product: for each top_light_product_purchasing
  // row, keep the max receipt_date per product and its sales_value.
  function latestSalesPriceMap_(dbId) {
    return cachedMap_('tl_price_map_' + dbId, 90, function () {
      const latest = {};
      getAllRecords_(dbId, PURCHASING_LINES_SHEET).forEach(r => {
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
    return getAllRecords_(dbId, PRODUCTS_SHEET).map(p => ({
      value: p.id,
      label: p.name_ar,
      current_qty: qtyMap[String(p.id)] != null ? qtyMap[String(p.id)] : 0,
      default_price: priceMap[String(p.id)] != null ? priceMap[String(p.id)] : 0
    }));
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
    const rec = getAllRecords_(dbId, CUSTOMERS_SHEET).find(c => String(c.id) === String(customerId));
    return rec ? (rec[field] != null ? rec[field] : '') : '';
  }

  function nextInvoiceNumber_(dbId) {
    let maxPrefix = 0;
    getAllRecords_(dbId, SALES_SHEET).forEach(r => {
      const s = String((r['رقم الفاتورة'] == null) ? '' : r['رقم الفاتورة']).trim();
      const m = s.match(/^(\d+)-/);
      if (m) { const n = Number(m[1]); if (!isNaN(n) && n > maxPrefix) maxPrefix = n; }
    });
    return (maxPrefix + 1) + '-' + new Date().getFullYear();
  }

  function computeSalesTotals_(header, lines) {
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

  function validateSales_(header, lines, dbId) {
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
      if (num0_(l.product_price) <= 0) throw new Error('السعر يجب أن يكون أكبر من صفر');
      const available = qtyMap[String(l.product_id)] != null ? qtyMap[String(l.product_id)] : 0;
      if (num0_(l.product_qty) > available) throw new Error('الكمية تتجاوز الرصيد المتاح للمنتج (المتاح: ' + available + ')');
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

  function buildSalesHeaderValues_(headers, uid, header, user) {
    const rowValues = headers.map(() => '');
    const put = (key, val) => { const i = salesColIndex_(headers, key); if (i !== -1) rowValues[i] = val; };

    put('invoice_unique_id', uid);
    put('ميزان حسابي', 5);
    put('نوع الضريبة', 2);
    put('رقم الفاتورة', header.invoice_number);
    put('اسم العميل', numOrKeep_(header.customer_id));
    put('رقم التسجيل الضريبي للعميل', header.customer_tax_id || '');
    put('العنوان', header.customer_address || '');
    put('رقم الموبيل', header.customer_telephone || '');
    put('تاريخ الفاتورة', parseDate_(header.invoice_date));
    put('نوع البيان', 3);
    put('نوع السلعة', 14);
    put('المبلغ الصافي', num0_(header.net_amount));
    put('نسبة الخصم', num0_(header.discount_percent));
    put('قيمة الخصم', num0_(header.discount_amount));
    put('قيمة الضريبة', num0_(header.tax_amount));
    put('إجمالي', num0_(header.total_amount));
    put('tax_system', header.tax_system === true || header.tax_system === 'true');
    put('user', user ? user.email : '');
    put('created_at', new Date());
    put('approval_status', (header.approval_status != null && header.approval_status !== '') ? header.approval_status : 'Pending');

    return rowValues;
  }

  function setSalesHeaderFormulas_(sheet, headers, rowNum) {
    const jIdx = salesColIndex_(headers, 'نوع سلع الجدول');
    const tIdx = salesColIndex_(headers, 'تاريخ الفاتورة');
    const rIdx = salesColIndex_(headers, 'قيمة الضريبة');
    const oIdx = salesColIndex_(headers, 'المبلغ الصافي');
    const mIdx = salesColIndex_(headers, 'الشهر');
    const yIdx = salesColIndex_(headers, 'العام');

    if (jIdx !== -1 && rIdx !== -1 && oIdx !== -1) {
      sheet.getRange(rowNum, jIdx + 1).setFormula(
        '=IFERROR(IF(' + colLetter_(rIdx) + rowNum + '/' + colLetter_(oIdx) + rowNum + '=0.05,1,0),"")');
    }
    if (mIdx !== -1 && tIdx !== -1) {
      sheet.getRange(rowNum, mIdx + 1).setFormula('=MONTH(' + colLetter_(tIdx) + rowNum + ')');
    }
    if (yIdx !== -1 && tIdx !== -1) {
      sheet.getRange(rowNum, yIdx + 1).setFormula('=YEAR(' + colLetter_(tIdx) + rowNum + ')');
    }
  }

  function writeSalesHeaderRow_(dbId, uid, header, user) {
    const sheet = getSheet_(SALES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = buildSalesHeaderValues_(headers, uid, header, user);
    sheet.appendRow(rowValues);
    const newRow = sheet.getLastRow();
    setSalesHeaderFormulas_(sheet, headers, newRow);
    return newRow;
  }

  function writeSalesLines_(dbId, headerUid, header, lines, user) {
    const sheet = getSheet_(SALES_LINES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const L = (name) => colLetter_(idx[name]);

    const baseId = getNextIdBatch_(dbId, SALES_LINES_SHEET, lines.length, 'id');

    const clientId = numOrKeep_(header.customer_id);
    (lines || []).forEach((line, i) => {
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
      sheet.appendRow(rowValues);

      const r = sheet.getLastRow();
      if (idx['product_net_value'] !== undefined) {
        sheet.getRange(r, idx['product_net_value'] + 1).setFormula(
          '=' + L('product_qty') + r + '*' + L('product_price') + r);
      }
      if (idx['product_tax_value'] !== undefined) {
        sheet.getRange(r, idx['product_tax_value'] + 1).setFormula(
          '=' + L('product_net_value') + r + '*' + L('product_tax') + r);
      }
      if (idx['product_total_value'] !== undefined) {
        sheet.getRange(r, idx['product_total_value'] + 1).setFormula(
          '=' + L('product_net_value') + r + '-' + L('product_discount') + r + '+' + L('product_tax_value') + r);
      }
    });
  }

  function deleteSalesLines_(dbId, headerUid) {
    const sheet = getSheet_(SALES_LINES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idx = headers.findIndex(h => String(h).trim().toLowerCase() === 'top_lightsales_header_id');
    if (idx === -1) return;
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idx]).trim() === headerUid) sheet.deleteRow(i + 1);
    }
  }

  // =========================================
  // Cash / bank movement — transactions + box balances + transfer
  // =========================================
  function getCashHeaders_(data, user, dbId) {
    const rows = getAllRecords_(dbId, CASH_SHEET);
    const boxNames = boxNameMap_(dbId);
    const custNames = {};
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });
    const headers = rows.map(r => {
      const rec = Object.assign({}, r);
      rec.box_name = boxNames[String(r.related_box)] || '';
      rec.customer_name = custNames[String(r.name)] || '';
      return rec;
    });
    return {
      status: 'success',
      headers: headers,
      boxes: boxBalanceSummary_(dbId, boxNames),
      options: cashOptions_(dbId)
    };
  }

  function addCash_(data, user, dbId) {
    const rec = data && data.record ? data.record : {};
    validateCash_(rec);
    const sheet = getSheet_(CASH_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const nextId = getNextId_(dbId, CASH_SHEET, 'transaction_id');
    const rowValues = buildCashValues_(headers, nextId, rec, user);
    sheet.appendRow(rowValues);
    setCashFormulas_(sheet, headers, sheet.getLastRow());
    return { status: 'success', message: 'تمت إضافة الحركة', data: { assignedId: nextId } };
  }

  function editCash_(data, user, dbId) {
    const rec = data && data.record ? data.record : {};
    const id = Number(rec.transaction_id);
    if (!id) throw new Error('معرف الحركة مطلوب');
    validateCash_(rec);
    const sheet = getSheet_(CASH_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'transaction_id');
    const dataArr = sheet.getDataRange().getValues();
    let rowNum = -1;
    for (let i = 1; i < dataArr.length; i++) {
      if (Number(dataArr[i][idIdx]) === id) { rowNum = i + 1; break; }
    }
    if (rowNum === -1) throw new Error('الحركة غير موجودة');
    const rowValues = buildCashValues_(headers, id, rec, user);
    sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
    setCashFormulas_(sheet, headers, rowNum);
    return { status: 'success', message: 'تم تحديث الحركة' };
  }

  function deleteCash_(data, user, dbId) {
    const id = Number(data && data.unique_id);
    if (!id) throw new Error('معرف الحركة مطلوب');
    const sheet = getSheet_(CASH_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'transaction_id');
    const dataArr = sheet.getDataRange().getValues();
    for (let i = dataArr.length - 1; i >= 1; i--) {
      if (Number(dataArr[i][idIdx]) === id) { sheet.deleteRow(i + 1); break; }
    }
    return { status: 'success', message: 'تم حذف الحركة' };
  }

  function approveCash_(data, user, dbId) {
    const id = Number(data && data.unique_id);
    if (!id) throw new Error('معرف الحركة مطلوب');
    const sheet = getSheet_(CASH_SHEET, dbId);
    const updated = updateRowByCriteria_(sheet, 'transaction_id', id, {
      approved: true,
      user: user ? user.email : ''
    });
    if (!updated) throw new Error('الحركة غير موجودة');
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

    const sheet = getSheet_(CASH_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const nextId = getNextIdBatch_(dbId, CASH_SHEET, 2, 'transaction_id');

    const boxNames = boxNameMap_(dbId);
    const customDetails = String((data && data.details) || '').trim();
    const details = customDetails || 'تحويل صندوق إلى صندوق';

    writeCashTransferRow_(sheet, headers, {
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

    writeCashTransferRow_(sheet, headers, {
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

    return { status: 'success', message: 'تم التحويل', data: { assignedId: nextId } };
  }

  // --- cash helpers ---
  function boxNameMap_(dbId) {
    const map = {};
    getAllRecords_(dbId, BOX_SHEET).forEach(b => {
      map[String(b['المستوى الخامس'])] = b['اسم المستوى الخامس'] || '';
    });
    return map;
  }

  function boxOptions_(dbId) {
    return getAllRecords_(dbId, BOX_SHEET).map(b => ({
      value: b['المستوى الخامس'],
      label: b['اسم المستوى الخامس'] || ''
    }));
  }

  function chartOptions_(dbId) {
    return getAllRecords_(dbId, CHART_SHEET).map(r => ({
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

  function boxBalanceSummary_(dbId, boxNames) {
    const map = {};
    getAllRecords_(dbId, CASH_SHEET).forEach(r => {
      const box = String((r.related_box == null) ? '' : r.related_box).trim();
      if (!box) return;
      map[box] = (map[box] || 0) + num0_(r.balance_amount);
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

  function buildCashValues_(headers, transactionId, rec, user) {
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const rowValues = headers.map(() => '');
    const set = (name, val) => { if (idx[name] !== undefined) rowValues[idx[name]] = val; };

    set('transaction_id', transactionId);
    set('invoice_id', rec.invoice_id != null ? rec.invoice_id : '');
    set('name', numOrKeep_(rec.name));
    set('transaction_purchasing_items', rec.transaction_purchasing_items != null ? rec.transaction_purchasing_items : '');
    set('transaction_details', rec.transaction_details);
    set('transaction_date', parseDate_(rec.transaction_date));
    set('transaction_amount', num0_(rec.transaction_amount));
    set('total_discount', num0_(rec.total_discount));
    set('taxes', num0_(rec.taxes));
    set('transaction_type', rec.transaction_type);
    set('related_box', numOrKeep_(rec.related_box));
    set('chart_code', numOrKeep_(rec.chart_code));
    set('transaction_method', rec.transaction_method);
    set('tax_system', rec.tax_system === true || rec.tax_system === 'true');
    set('approved', rec.approved === true || rec.approved === 'true');
    set('currency', rec.currency);
    set('exchange_rate', num0_(rec.exchange_rate));
    set('user', user ? user.email : '');
    set('created_at', new Date());

    return rowValues;
  }

  function writeCashTransferRow_(sheet, headers, rec, user) {
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

    sheet.appendRow(rowValues);
    setCashFormulas_(sheet, headers, sheet.getLastRow());
  }

  function setCashFormulas_(sheet, headers, rowNum) {
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const col = (name) => (idx[name] !== undefined ? colLetter_(idx[name]) : undefined);
    const M = col('transaction_type'), S = col('transaction_method'), H = col('transaction_amount'),
          I = col('total_discount'), K = col('taxes'), AA = col('exchange_rate'),
          N = col('net_amount'), B = col('balance_amount'), P = col('related_box');

    if (idx['name_vendor'] !== undefined && idx['name'] !== undefined) {
      sheet.getRange(rowNum, idx['name_vendor'] + 1).setFormula(
        '=IFERROR(VLOOKUP(' + col('name') + rowNum + ',top_light_customer_vendor!A:B,2,0),"")');
    }
    if (N !== undefined && H !== undefined && I !== undefined && S !== undefined && AA !== undefined) {
      sheet.getRange(rowNum, idx['net_amount'] + 1).setFormula(
        '=IF(' + S + rowNum + '="فودافون كاش",' + H + rowNum + '*' + AA + rowNum + ',(' + H + rowNum + '-' + I + rowNum + ')*' + AA + rowNum + ')');
    }
    if (idx['total'] !== undefined && N !== undefined && K !== undefined && AA !== undefined) {
      sheet.getRange(rowNum, idx['total'] + 1).setFormula(
        '=' + N + rowNum + '+' + K + rowNum + '*' + AA + rowNum);
    }
    if (B !== undefined && M !== undefined && S !== undefined && H !== undefined && I !== undefined && K !== undefined && AA !== undefined) {
      const inner = 'IF(' + S + rowNum + '="فودافون كاش",' + H + rowNum + '*' + AA + rowNum + ',(' + H + rowNum + '-' + I + rowNum + ')*' + AA + rowNum + ')+' + K + rowNum + '*' + AA + rowNum;
      sheet.getRange(rowNum, idx['balance_amount'] + 1).setFormula(
        '=IF(' + M + rowNum + '="Credit",(' + inner + ')*-1,' + inner + ')');
    }
    if (B !== undefined && P !== undefined) {
      sheet.getRange(rowNum, idx['box_balance'] + 1).setFormula(
        '=SUMIFS($' + B + '$2:' + B + rowNum + ',$' + P + '$2:' + P + rowNum + ',' + P + rowNum + ')');
    }
    if (idx['chart_name'] !== undefined && idx['chart_code'] !== undefined) {
      sheet.getRange(rowNum, idx['chart_name'] + 1).setFormula(
        '=IFERROR(VLOOKUP(' + col('chart_code') + rowNum + ',top_light_chart_of_accounts!I:N,6,0),"")');
    }
    if (idx['chart_account_main'] !== undefined && idx['chart_code'] !== undefined) {
      sheet.getRange(rowNum, idx['chart_account_main'] + 1).setFormula(
        '=IFERROR(VLOOKUP(' + col('chart_code') + rowNum + ',top_light_chart_of_accounts!I:O,7,0),"")');
    }
  }

  // =========================================
  // Customer statement — aggregated movements + running balance
  // =========================================
  function customerRawMovements_(dbId) {
    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const movements = [];

    // Sales (debit +)
    const invoices = getAllRecords_(dbId, SALES_SHEET);
    const salesLines = getAllRecords_(dbId, SALES_LINES_SHEET);
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
    getAllRecords_(dbId, SALES_RETURNS_SHEET).forEach(r => {
      const customer = String((r.top_lightsales_invoices_client == null) ? '' : r.top_lightsales_invoices_client).trim();
      if (!customer) return;
      const key = String(r.unique_id);
      if (!retGroups[key]) {
        const inv = invByUid[String(r.top_lightsales_invoices_id)] || {};
        retGroups[key] = { customer: customer, date: parseDate_(r.top_lightreturn_date), invoice_number: inv['رقم الفاتورة'] || '', total_qty: 0, total: 0, lines: [] };
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
    getAllRecords_(dbId, PURCHASING_SHEET).forEach(h => { purchHeaders[String(h.unique_id)] = h; });
    const purchGroups = {};
    getAllRecords_(dbId, PURCHASING_LINES_SHEET).forEach(l => {
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
    getAllRecords_(dbId, CASH_SHEET).forEach(r => {
      const customer = String((r.name == null) ? '' : r.name).trim();
      if (!customer) return;
      const rate = num0_(r.exchange_rate) || 1;
      const base = num0_(r.transaction_amount) * rate - num0_(r.total_discount) * rate + num0_(r.taxes) * rate;
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
      running += m.amount;
      return {
        date: m.date,
        type: m.type,
        reference: m.reference,
        description: m.description,
        amount: m.amount,
        debit: m.amount > 0 ? m.amount : 0,
        credit: m.amount < 0 ? -m.amount : 0,
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
    const cust = getAllRecords_(dbId, CUSTOMERS_SHEET).find(c => String(c.id) === customerId);
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
    const rows = getAllRecords_(dbId, OFFER_SHEET);
    const custNames = {};
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });
    const headers = rows.map(r => {
      const rec = Object.assign({}, r);
      rec.customer_name = custNames[String(r['اسم العميل'])] || '';
      return rec;
    });
    return { status: 'success', headers: headers, options: salesOptions_(dbId) };
  }

  function getSalesOfferLines_(data, user, dbId) {
    const parentId = String((data && data.parent_id) || '');
    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = getAllRecords_(dbId, OFFER_LINES_SHEET)
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
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });
    const rec = getAllRecords_(dbId, OFFER_SHEET).find(r => String(r.invoice_unique_id) === uid);
    if (!rec) throw new Error('العرض غير موجود');
    const header = Object.assign({}, rec);
    header.customer_name = custNames[String(rec['اسم العميل'])] || '';
    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const lines = getAllRecords_(dbId, OFFER_LINES_SHEET)
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
    validateSales_(header, lines, dbId);
    const uid = uid16_();
    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = nextOfferNumber_(dbId);
    computeSalesTotals_(header, lines);
    writeOfferHeaderRow_(dbId, uid, header, user);
    writeOfferLines_(dbId, uid, lines, user);
    return { status: 'success', message: 'تمت إضافة العرض', unique_id: uid };
  }

  function editSalesOffer_(data, user, dbId) {
    const header = data && data.header ? data.header : {};
    const lines = (data && data.lines) ? data.lines : [];
    const uid = String((header.unique_id == null) ? '' : header.unique_id).trim();
    if (!uid) throw new Error('معرف العرض مطلوب');
    validateSales_(header, lines, dbId);

    const sheet = getSheet_(OFFER_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const uIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'invoice_unique_id');
    const invIdx = headers.findIndex(h => String(h).trim() === 'رقم الفاتورة');
    const dataArr = sheet.getDataRange().getValues();
    let rowNum = -1;
    for (let i = 1; i < dataArr.length; i++) {
      if (String(dataArr[i][uIdx]).trim() === uid) { rowNum = i + 1; break; }
    }
    if (rowNum === -1) throw new Error('العرض غير موجود');

    header.customer_tax_id = lookupCustomerField_(dbId, header.customer_id, 'tax_id');
    header.customer_telephone = lookupCustomerField_(dbId, header.customer_id, 'telephone');
    header.customer_address = lookupCustomerField_(dbId, header.customer_id, 'address');
    header.invoice_number = (invIdx !== -1 && dataArr[rowNum - 1][invIdx] != null && String(dataArr[rowNum - 1][invIdx]).trim() !== '')
      ? dataArr[rowNum - 1][invIdx] : nextOfferNumber_(dbId);
    computeSalesTotals_(header, lines);

    deleteOfferLines_(dbId, uid);
    const rowValues = buildOfferHeaderValues_(headers, uid, header, user);
    sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
    setSalesHeaderFormulas_(sheet, headers, rowNum);
    writeOfferLines_(dbId, uid, lines, user);

    return { status: 'success', message: 'تم تحديث العرض', unique_id: uid };
  }

  function deleteSalesOffer_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف العرض مطلوب');
    deleteOfferLines_(dbId, uid);
    const sheet = getSheet_(OFFER_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const uIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'invoice_unique_id');
    const dataArr = sheet.getDataRange().getValues();
    for (let i = dataArr.length - 1; i >= 1; i--) {
      if (String(dataArr[i][uIdx]).trim() === uid) { sheet.deleteRow(i + 1); break; }
    }
    return { status: 'success', message: 'تم حذف العرض' };
  }

  function approveSalesOffer_(data, user, dbId) {
    const uid = String((data && data.unique_id) || '').trim();
    if (!uid) throw new Error('معرف العرض مطلوب');
    const sheet = getSheet_(OFFER_SHEET, dbId);
    const updated = updateRowByCriteria_(sheet, 'invoice_unique_id', uid, {
      approval_status: 'Approved',
      approval: user ? user.email : '',
      approval_time: new Date()
    });
    if (!updated) throw new Error('العرض غير موجود');
    return { status: 'success', message: 'تمت الموافقة على العرض' };
  }

  function nextOfferNumber_(dbId) {
    let maxPrefix = 0;
    getAllRecords_(dbId, OFFER_SHEET).forEach(r => {
      const s = String((r['رقم الفاتورة'] == null) ? '' : r['رقم الفاتورة']).trim();
      const m = s.match(/^(\d+)-/);
      if (m) { const n = Number(m[1]); if (!isNaN(n) && n > maxPrefix) maxPrefix = n; }
    });
    return (maxPrefix + 1) + '-' + new Date().getFullYear();
  }

  function buildOfferHeaderValues_(headers, uid, header, user) {
    const rowValues = headers.map(() => '');
    const put = (key, val) => { const i = salesColIndex_(headers, key); if (i !== -1) rowValues[i] = val; };
    put('invoice_unique_id', uid);
    put('رقم الفاتورة', header.invoice_number);
    put('اسم العميل', numOrKeep_(header.customer_id));
    put('رقم التسجيل الضريبي للعميل', header.customer_tax_id || '');
    put('العنوان', header.customer_address || '');
    put('رقم الموبيل', header.customer_telephone || '');
    put('تاريخ الفاتورة', parseDate_(header.invoice_date));
    put('المبلغ الصافي', num0_(header.net_amount));
    put('نسبة الخصم', num0_(header.discount_percent));
    put('قيمة الخصم', num0_(header.discount_amount));
    put('قيمة الضريبة', num0_(header.tax_amount));
    put('إجمالي', num0_(header.total_amount));
    put('tax_system', header.tax_system === true || header.tax_system === 'true');
    put('user', user ? user.email : '');
    put('created_at', new Date());
    put('approval_status', (header.approval_status != null && header.approval_status !== '') ? header.approval_status : 'Pending');
    return rowValues;
  }

  function writeOfferHeaderRow_(dbId, uid, header, user) {
    const sheet = getSheet_(OFFER_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const rowValues = buildOfferHeaderValues_(headers, uid, header, user);
    sheet.appendRow(rowValues);
    const newRow = sheet.getLastRow();
    setSalesHeaderFormulas_(sheet, headers, newRow);
    return newRow;
  }

  function writeOfferLines_(dbId, headerUid, lines, user) {
    const sheet = getSheet_(OFFER_LINES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idx = {};
    headers.forEach((h, i) => { idx[String(h).trim().toLowerCase()] = i; });
    const L = (name) => colLetter_(idx[name]);

    const baseId = getNextIdBatch_(dbId, OFFER_LINES_SHEET, lines.length, 'id');

    (lines || []).forEach((line, i) => {
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
      sheet.appendRow(rowValues);

      const r = sheet.getLastRow();
      if (idx['product_net_value'] !== undefined) {
        sheet.getRange(r, idx['product_net_value'] + 1).setFormula('=' + L('product_qty') + r + '*' + L('product_price') + r);
      }
      if (idx['product_tax_value'] !== undefined) {
        sheet.getRange(r, idx['product_tax_value'] + 1).setFormula('=' + L('product_net_value') + r + '*' + L('product_tax') + r);
      }
      if (idx['product_total_value'] !== undefined) {
        sheet.getRange(r, idx['product_total_value'] + 1).setFormula('=' + L('product_net_value') + r + '-' + L('product_discount') + r + '+' + L('product_tax_value') + r);
      }
    });
  }

  function deleteOfferLines_(dbId, headerUid) {
    const sheet = getSheet_(OFFER_LINES_SHEET, dbId);
    const headers = getHeaders_(sheet);
    const idx = headers.findIndex(h => String(h).trim().toLowerCase() === 'top_lightsales_offer_id');
    if (idx === -1) return;
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idx]).trim() === headerUid) sheet.deleteRow(i + 1);
    }
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
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });
    const retNet = {};
    getAllRecords_(dbId, SALES_RETURNS_SHEET).forEach(r => {
      const inv = String(r.top_lightsales_invoices_id);
      retNet[inv] = (retNet[inv] || 0) + (num0_(r.top_lightreturn_value) - num0_(r.top_lightreturn_discount));
    });

    // invoices containing a product (for product filter)
    let invByProduct = null;
    if (productId) {
      invByProduct = {};
      getAllRecords_(dbId, SALES_LINES_SHEET).forEach(l => {
        if (String(l.product_id) === productId) invByProduct[String(l.top_lightsales_header_id)] = true;
      });
    }

    const rows = getAllRecords_(dbId, SALES_SHEET)
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
      product_options: getAllRecords_(dbId, PRODUCTS_SHEET).map(p => ({ value: p.id, label: p.name_ar }))
    };
  }

  // =========================================
  // Cash movement report
  // =========================================
  function companyArabicName_() {
    try {
      const sheet = getSheet_('ERP_Companies', CONFIG.AUTH_SPREADSHEET_ID);
      const headers = getHeaders_(sheet);
      const data = sheet.getDataRange().getValues();
      const uidIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_unique_id');
      const arIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_name_ar');
      const row = data.slice(1).find(r => uidIdx !== -1 && String(r[uidIdx]).trim() === '8df5c89a117fe9a5');
      return (row && arIdx !== -1) ? String(row[arIdx]).trim() : 'شركة القمة لايت';
    } catch (e) { return 'شركة القمة لايت'; }
  }

  function getCashReport_(data, user, dbId) {
    const dateFrom = parseDate_(data && data.date_from);
    const dateTo = parseDate_(data && data.date_to);
    const boxId = String((data && data.box) || '').trim();
    const typeId = String((data && data.type) || '').trim();

    const boxMap = {};
    getAllRecords_(dbId, BOX_SHEET).forEach(b => {
      boxMap[String(b['المستوى الخامس'])] = [b['اسم المستوى الرابع'], b['المستوى الخامس'], b['اسم المستوى الخامس']].join('-');
    });
    const custNames = {};
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });
    const companyName = companyArabicName_();
    const rows = getAllRecords_(dbId, CASH_SHEET)
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
    getAllRecords_(dbId, PURCHASING_LINES_SHEET).forEach(r => {
      const pid = String((r.product == null) ? '' : r.product).trim();
      if (!pid) return;
      const d = parseDate_(r.receipt_date);
      const t = d instanceof Date ? d.getTime() : 0;
      if (!(pid in latest) || t > latest[pid].t) {
        latest[pid] = { t: t, qty: num0_(r.qty) };
      }
    });

    const prodNames = {};
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
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
    getAllRecords_(dbId, PRODUCTS_SHEET).forEach(p => { prodNames[String(p.id)] = p.name_ar; });
    const custNames = {};
    getAllRecords_(dbId, CUSTOMERS_SHEET).forEach(c => { custNames[String(c.id)] = c.name; });

    const invMap = {};
    getAllRecords_(dbId, SALES_SHEET).forEach(inv => {
      invMap[String(inv.invoice_unique_id)] = {
        number: inv['رقم الفاتورة'] || '',
        customer: custNames[String(inv['اسم العميل'])] || '',
        date: parseDate_(inv['تاريخ الفاتورة'])
      };
    });

    const movements = [];

    // Purchases (in) — from purchasing lines, reference = header code
    const headerMap = {};
    getAllRecords_(dbId, PURCHASING_SHEET).forEach(h => { headerMap[String(h.unique_id)] = h; });
    getAllRecords_(dbId, PURCHASING_LINES_SHEET).forEach(l => {
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
    getAllRecords_(dbId, SALES_LINES_SHEET).forEach(l => {
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
    getAllRecords_(dbId, SALES_RETURNS_SHEET).forEach(r => {
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
  register('get_dashboard_data', getDashboardData_);
  register('get_products', getProducts_);
  register('add_product', addProduct_);
  register('edit_product', editProduct_);
  register('get_parties', getParties_);
  register('add_party', addParty_);
  register('edit_party', editParty_);
  register('get_purchasing_headers', getPurchasingHeaders_);
  register('get_purchasing_lines', getPurchasingLines_);
  register('get_purchase_print', getPurchasePrint_);
  register('add_purchasing', addPurchasing_);
  register('edit_purchasing', editPurchasing_);
  register('delete_purchasing', deletePurchasing_);
  register('approve_purchasing', approvePurchasing_);
  register('get_sales_headers', getSalesHeaders_);
  register('get_sales_lines', getSalesLines_);
  register('get_sales_print', getSalesPrint_);
  register('add_sales', addSales_);
  register('edit_sales', editSales_);
  register('delete_sales', deleteSales_);
  register('approve_sales', approveSales_);
  register('get_sales_returns', getSalesReturns_);
  register('add_sales_return', addSalesReturn_);
  register('delete_sales_return', deleteSalesReturn_);
  register('get_cash_headers', getCashHeaders_);
  register('add_cash', addCash_);
  register('edit_cash', editCash_);
  register('delete_cash', deleteCash_);
  register('approve_cash', approveCash_);
  register('add_transfer', addTransfer_);
  register('get_customer_statement', getCustomerStatement_);
  register('get_sales_offer_headers', getSalesOfferHeaders_);
  register('get_sales_offer_lines', getSalesOfferLines_);
  register('get_sales_offer_print', getSalesOfferPrint_);
  register('add_sales_offer', addSalesOffer_);
  register('edit_sales_offer', editSalesOffer_);
  register('delete_sales_offer', deleteSalesOffer_);
  register('approve_sales_offer', approveSalesOffer_);
  register('get_sales_analysis', getSalesAnalysis_);
  register('get_cash_report', getCashReport_);
  register('get_xlsx_export', getXlsxExport_);
  register('get_purchase_needs', getPurchaseNeeds_);
  register('get_product_movement', getProductMovement_);

  return { dispatch_: dispatch_, pageForAction_: pageForAction_, tableForAction_: tableForAction_ };
})();