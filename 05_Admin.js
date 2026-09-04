/**
 * 05_Admin.js
 * RESPONSIBILITY: Super-admin handlers for the control plane:
 *   companies CRUD (with 'enabled' toggle), users CRUD (with password reset),
 *   roles matrix CRUD.
 * No routing here — handlers are wired into Code.js ROUTES. Every handler
 * re-checks isSuperAdmin server-side (never trusts the client).
 */

function requireSuperAdmin_(authUser) {
  if (!authUser || !authUser.isSuperAdmin) throw new Error('Access Denied: Super admin only.');
}

function adminListCompanies_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
  return { status: 'success', companies: rows };
}

function adminSaveCompany_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const p = payload || {};
  let uid = String(p.company_unique_id || '').trim();
  const nameAr = String(p.company_name_ar || '').trim();
  const nameEn = String(p.company_name_en || '').trim();
  const link = String(p.company_sheet_link || '').trim();
  if (!nameAr) throw new Error('الاسم العربي مطلوب');
  if (!uid) uid = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  if (!/^[a-zA-Z0-9_-]+$/.test(uid)) throw new Error('المعرف يجب أن يكون أحرفاً لاتينية وأرقاماً فقط');

  const sheet = getSheet_('ERP_Companies', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const uidIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_unique_id');
  const data = sheet.getDataRange().getValues();
  const existingRow = data.slice(1).find(r => String(r[uidIdx]).trim().toLowerCase() === uid.toLowerCase());

  const enabled = p.enabled === true || String(p.enabled).trim().toLowerCase() === 'true';
  const fields = {
    company_unique_id: uid,
    company_name_ar: nameAr,
    company_name_en: nameEn,
    company_sheet_link: link,
    company_colors: String(p.company_colors || ''),
    company_logo: String(p.company_logo || ''),
    company_main_page: String(p.company_main_page || ''),
    enabled: enabled ? 'TRUE' : 'FALSE',
    updated_at: new Date()
  };

  if (existingRow) {
    updateRowByCriteria_(sheet, 'company_unique_id', uid, fields);
    bumpVersion_('ERP_Companies');
    return { status: 'success', message: 'تم تحديث الشركة', company: fields };
  }

  const id = getNextId_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
  addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies', Object.assign({ id: id, created_at: new Date() }, fields), ['company_unique_id', 'company_name_ar']);
  bumpVersion_('ERP_Companies');
  return { status: 'success', message: 'تمت إضافة الشركة', company: fields };
}

function adminListUsers_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users');
  const roles = [];
  const seen = {};
  rows.forEach(u => {
    const r = String((u.role == null) ? '' : u.role).trim();
    if (r && !seen[r]) { seen[r] = true; roles.push(r); }
  });
  const companies = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({
    value: String(c.company_unique_id || '').trim(),
    label: String(c.company_name_ar || c.company_name_en || c.company_unique_id || '').trim()
  })).filter(c => c.value);
  return { status: 'success', users: rows, role_options: roles, company_options: companies };
}

/**
 * Add a user, or (if password supplied) reset an existing user's password with
 * a fresh salt. Returning the password is a design choice: super admin creates
 * the user, then the user sets their own password via the first-time setup flow.
 * To trigger that flow, add a user with NO password → login returns setup_required.
 */
function adminSaveUser_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const p = payload || {};
  const email = String(p.email || '').trim().toLowerCase();
  const name = String(p.name || '').trim();
  const role = String(p.role || '').trim() || 'User';
  const company = String(p.company || '').trim();
  const status = String(p.status || 'Active').trim();
  const isActive = status.toLowerCase() === 'active' ? 'Active' : 'InActive';
  if (!email || !name) throw new Error('الاسم والبريد الإلكتروني مطلوبان');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('بريد إلكتروني غير صالح');

  const sheet = getSheet_('ERP_Users', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const emailIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'email');
  const data = sheet.getDataRange().getValues();
  const existing = data.slice(1).find(r => String(r[emailIdx]).trim().toLowerCase() === email);

  const base = {
    name: name,
    email: email,
    role: role,
    company: company,
    status: isActive,
    updated_at: new Date()
  };

  if (p.resetPassword && String(p.resetPassword).trim()) {
    const salt = generateSalt_();
    base['passwordhash'] = hashPassword_(String(p.resetPassword), salt);
    base['salt'] = salt;
    base['sessiontoken'] = '';
    base['sessionexpiry'] = '';
  }

  if (existing) {
    updateRowByCriteria_(sheet, 'email', email, base);
    bumpVersion_('ERP_Users');
    return { status: 'success', message: 'تم تحديث المستخدم', user: { email: email, name: name, role: role, company: company, status: isActive } };
  }

  const id = getNextId_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users');
  addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users',
    Object.assign({ id: id, created_at: new Date(), sessiontoken: '', sessionexpiry: '', passwordhash: '', salt: '' }, base),
    ['name', 'email', 'role']);
  bumpVersion_('ERP_Users');
  return { status: 'success', message: 'تمت إضافة المستخدم', user: { email: email, name: name, role: role, company: company, status: isActive } };
}

function adminListMatrix_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const matrix = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Pages_Matrix');
  const pages = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_System_Pages');
  const users = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users');
  const companyOptions = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({ value: String(c.company_unique_id || '').trim(), label: String(c.company_name_ar || c.company_name_en || c.company_unique_id || '').trim() })).filter(c => c.value);
  const roles = [];
  const seen = {};
  users.forEach(u => {
    const r = String((u.role == null) ? '' : u.role).trim();
    if (r && !seen[r]) { seen[r] = true; roles.push(r); }
  });
  return { status: 'success', matrix: matrix, pages: pages, roles: roles, company_options: companyOptions };
}

/**
 * Bulk save of a role's page assignments. Upserts by (role, page_id): inserts a
 * new row (16-char UUID) when missing, updates only changed columns otherwise.
 */
function adminSaveMatrix_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const p = payload || {};
  const role = String(p.role || '').trim();
  const assignments = Array.isArray(p.assignments) ? p.assignments : [];
  if (!role) throw new Error('الدور مطلوب');
  if (!assignments.length) throw new Error('لا توجد صلاحيات للحفظ');

  const sheet = getSheet_('ERP_Pages_Matrix', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const rowData = data.slice(1);
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const roleIdx = idx('role');
  const pageIdx = idx('page_id');
  const accessIdx = idx('access_type');
  const statusIdx = idx('status');
  const uidIdx = idx('erp_pages_matrix_unique_id');
  const userIdx = idx('user');
  const createdIdx = idx('created_at');
  if (roleIdx === -1 || pageIdx === -1) throw new Error('ERP_Pages_Matrix missing role/page_id columns');

  const existingMap = {};
  rowData.forEach((r, i) => {
    const rl = String(r[roleIdx]).trim().toLowerCase();
    const pg = String(r[pageIdx]).trim().toLowerCase();
    if (rl && pg) existingMap[rl + '|' + pg] = i + 2;
  });

  let added = 0, updated = 0, skipped = 0;
  assignments.forEach(a => {
    const pageId = String(a.page_id || '').trim();
    if (!pageId) return;
    const accessType = String(a.access_type || 'Read').trim();
    const status = String(a.status || 'Active').trim() === 'Active' ? 'Active' : 'InActive';
    const key = role.toLowerCase() + '|' + pageId.toLowerCase();
    const rowNum = existingMap[key];
    if (!rowNum) {
      const rowValues = headers.map(() => '');
      const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };
      set('erp_pages_matrix_unique_id', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
      set('role', role);
      set('page_id', pageId);
      set('access_type', accessType);
      set('status', status);
      set('user', authUser ? authUser.email : '');
      set('created_at', new Date());
      sheet.appendRow(rowValues);
      existingMap[key] = sheet.getLastRow();
      added++;
    } else {
      const existing = data[rowNum - 1];
      const curAccess = accessIdx !== -1 ? String(existing[accessIdx]).trim() : '';
      const curStatus = statusIdx !== -1 ? String(existing[statusIdx]).trim() : '';
      if (curAccess !== accessType || curStatus !== status) {
        const uidVal = uidIdx !== -1 ? existing[uidIdx] : '';
        const updates = {};
        if (accessIdx !== -1) updates['access_type'] = accessType;
        if (statusIdx !== -1) updates['status'] = status;
        if (userIdx !== -1) updates['user'] = authUser ? authUser.email : '';
        if (uidIdx !== -1 && String(uidVal).trim() !== '') {
          updateRowByCriteria_(sheet, 'erp_pages_matrix_unique_id', uidVal, updates);
        }
        updated++;
      } else {
        skipped++;
      }
    }
  });
  bumpVersion_('ERP_Pages_Matrix');
  return { status: 'success', message: 'تم حفظ الصلاحيات', added: added, updated: updated, skipped: skipped };
}

/* =========================================
 * System Pages — list + bulk upsert (dedup by page_id)
 * ========================================= */
function adminListPages_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const systemPages = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_System_Pages');
  const allPages = getAllPages_().map(p => ({ page_id: p.action, title: p.title || p.action, label: p.label || '' }));
  const companyOptions = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({ value: String(c.company_unique_id || '').trim(), label: String(c.company_name_ar || c.company_name_en || c.company_unique_id || '').trim() })).filter(c => c.value);
  return {
    status: 'success',
    system_pages: systemPages,
    all_pages: allPages,
    company_options: companyOptions,
    module_options: ['HR', 'Finance', 'Warehouse', 'Production', 'Quality', 'Sales', 'General', 'Top Management']
  };
}

function adminSavePages_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const pages = Array.isArray(payload && payload.pages) ? payload.pages : [];
  if (!pages.length) throw new Error('لا توجد صفحات للحفظ');

  const sheet = getSheet_('ERP_System_Pages', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const rowData = data.slice(1);
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const pageIdIdx = idx('page_id');
  const nameIdx = idx('page_name');
  const moduleIdx = idx('page_module');
  const companyIdx = idx('page_company');
  if (pageIdIdx === -1) throw new Error('ERP_System_Pages missing page_id column');

  const existingMap = {};
  rowData.forEach((r, i) => {
    const pid = String(r[pageIdIdx]).trim().toLowerCase();
    if (pid) existingMap[pid] = i + 2;
  });

  let added = 0, updated = 0, skipped = 0;
  pages.forEach(p => {
    const pageId = String(p.page_id || '').trim();
    if (!pageId) return;
    const name = String(p.page_name || '').trim();
    const module = String(p.page_module || '').trim();
    const company = String(p.page_company || '').trim();
    const rowNum = existingMap[pageId.toLowerCase()];
    if (!rowNum) {
      const rowValues = headers.map(() => '');
      const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };
      set('page_id', pageId);
      set('page_name', name);
      set('page_module', module);
      set('page_company', company);
      sheet.appendRow(rowValues);
      existingMap[pageId.toLowerCase()] = sheet.getLastRow();
      added++;
    } else {
      const existing = data[rowNum - 1];
      const curName = nameIdx !== -1 ? String(existing[nameIdx]).trim() : '';
      const curModule = moduleIdx !== -1 ? String(existing[moduleIdx]).trim() : '';
      const curCompany = companyIdx !== -1 ? String(existing[companyIdx]).trim() : '';
      if (curName !== name || curModule !== module || curCompany !== company) {
        const updates = {};
        if (nameIdx !== -1) updates['page_name'] = name;
        if (moduleIdx !== -1) updates['page_module'] = module;
        if (companyIdx !== -1) updates['page_company'] = company;
        updateRowByCriteria_(sheet, 'page_id', pageId, updates);
        updated++;
      } else {
        skipped++;
      }
    }
  });
  bumpVersion_('ERP_Pages_Matrix');
  return { status: 'success', message: 'تم حفظ الصفحات', added: added, updated: updated, skipped: skipped };
}

/* =========================================
 * Currency — list / add / update / delete (GOOGLEFINANCE rate)
 * ========================================= */
function adminListCurrency_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_currency_exchange');
  return { status: 'success', currencies: rows };
}

function setRateFormula_(sheet, headers, rowNum) {
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const currencyIdx = idx('currency');
  const rateIdx = idx('rate');
  if (currencyIdx === -1 || rateIdx === -1) return;
  const colLetter = function (ci) {
    let s = ''; let n = ci + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  const B = colLetter(currencyIdx);
  sheet.getRange(rowNum, rateIdx + 1).setFormula(
    '=IF(' + B + rowNum + '="EGP", 1, GOOGLEFINANCE("CURRENCY:" & ' + B + rowNum + ' & "EGP"))');
}

function adminSaveCurrency_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const currency = String((payload && payload.currency) || '').trim().toUpperCase();
  if (!currency) throw new Error('العملة مطلوبة');

  const sheet = getSheet_('ERP_currency_exchange', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const currencyIdx = idx('currency');
  const idIdx = idx('id');
  if (currencyIdx === -1) throw new Error('ERP_currency_exchange missing currency column');

  let existingRowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][currencyIdx]).trim().toUpperCase() === currency) { existingRowNum = i + 1; break; }
  }

  if (existingRowNum !== -1) {
    sheet.getRange(existingRowNum, currencyIdx + 1).setValue(currency);
    setRateFormula_(sheet, headers, existingRowNum);
    return { status: 'success', message: 'تم تحديث العملة' };
  }

  const nextId = getNextId_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_currency_exchange', 'id');
  const rowValues = headers.map(() => '');
  const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };
  set('id', nextId);
  set('currency', currency);
  set('user', authUser ? authUser.email : '');
  set('created_at', new Date());
  sheet.appendRow(rowValues);
  setRateFormula_(sheet, headers, sheet.getLastRow());
  return { status: 'success', message: 'تمت إضافة العملة' };
}

function adminDeleteCurrency_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const id = Number(payload && payload.id);
  if (!id) throw new Error('معرف العملة مطلوب');
  const sheet = getSheet_('ERP_currency_exchange', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const idIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'id');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][idIdx]) === id) { sheet.deleteRow(i + 1); break; }
  }
  return { status: 'success', message: 'تم حذف العملة' };
}

/* =========================================
 * ERP System Invoices — list / save / delete / print
 * ========================================= */
const ERP_INVOICES_SHEET = 'ERP_system_invoices';
const ERP_INVOICES_HEADERS = [
  'unique_id',
  'id',
  'invoice_number',
  'invoice_date',
  'company',
  'no_of_user',
  'cost_per_user_usd',
  'current_exchange_rate',
  'cost_per_user_egp',
  'maintenance_cost_usd',
  'maintenance_cost_per_user_egp',
  'user',
  'created_at',
  'updated_at'
];

function getOrCreateErpInvoicesSheet_() {
  const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ERP_INVOICES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ERP_INVOICES_SHEET);
    sheet.appendRow(ERP_INVOICES_HEADERS);
  }
  return sheet;
}

function adminListInvoices_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  getOrCreateErpInvoicesSheet_();
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, ERP_INVOICES_SHEET);
  const companies = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({
    value: String(c.company_unique_id || '').trim(),
    name_en: String(c.company_name_en || c.company_name_ar || '').trim(),
    name_ar: String(c.company_name_ar || '').trim()
  }));

  // Auto-sort descending by id / invoice_date
  rows.sort(function (a, b) {
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  return { status: 'success', invoices: rows, company_options: companies };
}

function adminSaveInvoice_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  getOrCreateErpInvoicesSheet_();
  const p = payload || {};

  const invoiceNumber = String(p.invoice_number || '').trim();
  if (!invoiceNumber) throw new Error('رقم الفاتورة مطلوب (invoice_number)');

  const invoiceDate = String(p.invoice_date || '').trim();
  if (!invoiceDate) throw new Error('تاريخ الفاتورة مطلوب (invoice_date)');

  const company = String(p.company || '').trim();
  if (!company) throw new Error('الشركة مطلوبة (company)');

  const noOfUsers = parseInt(p.no_of_user, 10);
  if (isNaN(noOfUsers) || noOfUsers < 0) throw new Error('عدد المستخدمين يجب أن يكون رقماً صحيحاً (no_of_user)');

  const costPerUserUsd = parseFloat(p.cost_per_user_usd);
  if (isNaN(costPerUserUsd) || costPerUserUsd < 0) throw new Error('تكلفة المستخدم بالدولار مطلوبة (cost_per_user_usd)');

  const currentExchangeRate = parseFloat(p.current_exchange_rate);
  if (isNaN(currentExchangeRate) || currentExchangeRate <= 0) throw new Error('سعر الصرف الحالي بالجنيه مطلوب (current_exchange_rate)');

  const maintenanceCostUsd = p.maintenance_cost_usd !== undefined && p.maintenance_cost_usd !== '' ? parseFloat(p.maintenance_cost_usd) : 14;
  if (isNaN(maintenanceCostUsd) || maintenanceCostUsd < 0) throw new Error('تكلفة الصيانة بالدولار غير صالحة');

  // Calculations per specifications:
  // cost_per_user_egp = cost_per_user_usd * current_exchange_rate * 1.04
  // maintenance_cost_per_user_egp = maintenance_cost_usd * current_exchange_rate
  const costPerUserEgp = Math.round(costPerUserUsd * currentExchangeRate * 1.04 * 100) / 100;
  const maintenanceCostPerUserEgp = Math.round(maintenanceCostUsd * currentExchangeRate * 100) / 100;

  const sheet = getSheet_(ERP_INVOICES_SHEET, CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);

  let uid = String(p.unique_id || '').trim();

  // If editing an existing invoice
  if (uid) {
    const data = sheet.getDataRange().getValues();
    const uiIdx = idx('unique_id');
    let rowNum = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][uiIdx]).trim() === uid) {
        rowNum = i + 1;
        break;
      }
    }
    if (rowNum === -1) throw new Error('الفاتورة غير موجودة لتعديلها');

    const updates = {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      company: company,
      no_of_user: noOfUsers,
      cost_per_user_usd: costPerUserUsd,
      current_exchange_rate: currentExchangeRate,
      cost_per_user_egp: costPerUserEgp,
      maintenance_cost_usd: maintenanceCostUsd,
      maintenance_cost_per_user_egp: maintenanceCostPerUserEgp,
      user: authUser ? authUser.email : '',
      updated_at: new Date()
    };

    updateRowByCriteria_(sheet, 'unique_id', uid, updates);
    return { status: 'success', message: 'تم تحديث الفاتورة بنجاح', unique_id: uid };
  }

  // Creating a new invoice: unique_id is 8-char UUID, id is auto-increment
  uid = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  const nextId = getNextId_(CONFIG.AUTH_SPREADSHEET_ID, ERP_INVOICES_SHEET, 'id');

  const rowValues = headers.map(() => '');
  const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };

  set('unique_id', uid);
  set('id', nextId);
  set('invoice_number', invoiceNumber);
  set('invoice_date', invoiceDate);
  set('company', company);
  set('no_of_user', noOfUsers);
  set('cost_per_user_usd', costPerUserUsd);
  set('current_exchange_rate', currentExchangeRate);
  set('cost_per_user_egp', costPerUserEgp);
  set('maintenance_cost_usd', maintenanceCostUsd);
  set('maintenance_cost_per_user_egp', maintenanceCostPerUserEgp);
  set('user', authUser ? authUser.email : '');
  set('created_at', new Date());
  set('updated_at', new Date());

  sheet.appendRow(rowValues);
  return { status: 'success', message: 'تم إصدار الفاتورة بنجاح', unique_id: uid, id: nextId };
}

function adminDeleteInvoice_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const uid = String(payload && payload.unique_id || '').trim();
  if (!uid) throw new Error('معرف الفاتورة مطلوب');
  const sheet = getSheet_(ERP_INVOICES_SHEET, CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const uiIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'unique_id');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][uiIdx]).trim() === uid) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { status: 'success', message: 'تم حذف الفاتورة' };
}

/**
 * Print module for ERP System Invoices (AppSheet Receipt Layout)
 */
function serveErpInvoice_(params) {
  try {
    const targetUniqueId = String(params.unique_id || params.id || '').trim();
    if (!targetUniqueId) {
      throw new Error('لم يتم تحديد كود السند الفريد (unique_id) المطلوب عرضه.');
    }

    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    const appsheetInvSheet = ss.getSheetByName(ERP_INVOICES_SHEET);
    if (!appsheetInvSheet) {
      throw new Error('تنبيه: جدول فواتير النظام (' + ERP_INVOICES_SHEET + ') غير موجود.');
    }

    const data = appsheetInvSheet.getDataRange().getValues();
    if (data.length < 2) {
      throw new Error('جدول الفواتير لا يحتوي على أي سجلات حالياً.');
    }

    const headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
    const idxUi = headers.indexOf('unique_id');
    const idxInvNumber = headers.indexOf('invoice_number');
    const idxInvDate = headers.indexOf('invoice_date');
    const idxCompany = headers.indexOf('company');
    const idxNoOfUsers = headers.indexOf('no_of_user');
    const idxCostUser = headers.indexOf('cost_per_user_usd');
    const idxMaintCost = headers.indexOf('maintenance_cost_usd');

    if (idxUi === -1 || idxInvNumber === -1 || idxInvDate === -1 || idxNoOfUsers === -1 || idxCostUser === -1) {
      throw new Error('فشل فحص بنية الجدول: تأكد من مطابقة أسماء الأعمدة في شيت ' + ERP_INVOICES_SHEET + '.');
    }

    let invRow = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxUi]).trim() === targetUniqueId) {
        invRow = data[i];
        break;
      }
    }

    if (!invRow) {
      throw new Error('السند الفريد المطلوب (ID: ' + targetUniqueId + ') غير مسجل بالجدول.');
    }

    const invoiceNumber = String(invRow[idxInvNumber]).trim();
    const companyUid = idxCompany !== -1 ? String(invRow[idxCompany]).trim() : '';

    let companyName = companyUid;
    let companyLogo = '';
    const compRows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
    const comp = compRows.find(function (c) { return String(c.company_unique_id || '').trim() === companyUid; });
    if (comp) {
      companyName = String(comp.company_name_en || comp.company_name_ar || companyUid).trim();
      companyLogo = String(comp.company_logo || '').trim();
    }
    if (!companyName) companyName = 'Top Chemical Factory';

    const noOfUsers = parseInt(invRow[idxNoOfUsers], 10) || 0;
    const costPerUser = parseFloat(invRow[idxCostUser]) || 0;
    const maintCost = idxMaintCost !== -1 ? (parseFloat(invRow[idxMaintCost]) || 0) : 0;

    const rawDate = invRow[idxInvDate];
    let formattedDate = '---';
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      formattedDate = Utilities.formatDate(rawDate, 'Africa/Cairo', 'MMMM d, yyyy');
    } else if (rawDate) {
      const dt = new Date(rawDate);
      if (!isNaN(dt.getTime())) {
        formattedDate = Utilities.formatDate(dt, 'Africa/Cairo', 'MMMM d, yyyy');
      } else {
        formattedDate = String(rawDate);
      }
    }

    const licenseSubtotal = noOfUsers * costPerUser;
    const totalAmount = licenseSubtotal + maintCost;

    const rightLogoUrl = 'https://lh3.googleusercontent.com/d/1OJN15s3LHY4EL2Vcn90X07NnucIjgfJa';
    const leftLogoUrl = 'https://lh3.googleusercontent.com/d/1Ug1T9j5vQBeBA_5w52ufDO07IsefW6QH';

    const htmlContent = `<!DOCTYPE html>
    <html lang="en" dir="ltr">
    <head>
      <meta charset="UTF-8">
      <title>Receipt from AppSheet - ${invoiceNumber}</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #32325d; background-color: #ffffff; margin: 0; padding: 0; font-size: 13px; -webkit-font-smoothing: antialiased; }
        
        .top-stripe {
          background-color: #4285f4;
          height: 10px;
          width: 100%;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .invoice-wrapper { max-width: 660px; margin: 0 auto; padding: 24px 18px; box-sizing: border-box; }
        
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .header-table td { vertical-align: middle; padding: 0; }
        .logo-left img { max-height: 80px; max-width: 170px; object-fit: contain; }
        .logo-right { text-align: right; }
        .logo-right img { max-height: 60px; max-width: 170px; object-fit: contain; }
        .title-text { font-size: 22px; font-weight: 600; color: #111111; margin-bottom: 18px; }
        
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .meta-table td { vertical-align: top; padding: 0; padding-bottom: 6px; font-size: 13px; }
        .meta-label { color: #4f5b66; width: 130px; font-weight: 400; }
        .meta-value { color: #111111; font-weight: 600; }
        
        .info-row { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; line-height: 1.5; color: #4f5b66; }
        
        .info-left { width: 50%; }
        .info-left strong { color: #111111; font-size: 15px; font-weight: 600; display: inline-block; margin-bottom: 4px; }
        
        .info-right { width: 45%; }
        .bill-to-title { color: #7a8c9e; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .bill-to-company { color: #111111; font-weight: 600; margin-bottom: 2px; }
        
        .amount-paid-text { display: inline-block; margin-top: 10px; color: #111111; font-weight: 600; font-size: 13px; }

        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; margin-top: 8px; }
        .items-table th { text-align: left; color: #7a8c9e; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e3e8ee; padding-bottom: 6px; }
        .items-table td { padding: 12px 0; border-bottom: 1px solid #e3e8ee; color: #111111; font-size: 13px; vertical-align: top; }
        .items-table th.num-col, .items-table td.num-col { text-align: right; }
        
        .description-text { font-weight: 500; margin: 0; color: #111111; }
        .description-sub { color: #4f5b66; font-size: 11.5px; margin: 3px 0 0 0; }

        .totals-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .totals-table td { padding: 5px 0; font-size: 13px; }
        .totals-label { text-align: right; color: #7a8c9e; padding-right: 20px !important; }
        .totals-value { text-align: right; color: #111111; font-weight: 500; width: 100px; }
        
        .divider-row td { border-top: 1px solid #e3e8ee; padding-top: 8px !important; }
        .grand-total td { font-size: 14px; font-weight: 600; color: #111111; }

        .footer-clause { margin-top: 30px; border-top: 1px solid #e3e8ee; padding-top: 12px; color: #7a8c9e; font-size: 11px; line-height: 1.5; text-align: center; }
        
        .print-button-wrapper {
          max-width: 660px;
          margin: 12px auto 0 auto;
          text-align: center;
        }

        .print-btn {
          background-color: #4285f4;
          color: #ffffff;
          border: none;
          padding: 8px 24px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
        }

        .print-btn:hover {
          background-color: #3367d6;
        }

        @media print {
          .invoice-wrapper { padding: 10mm 8mm; }
          .print-button-wrapper { display: none; }
        }
      </style>
    </head>
    <body>

      <div class="top-stripe"></div>

      <div class="print-button-wrapper">
        <button onclick="window.print()" class="print-btn">
          🖨️ طباعة الإيصال
        </button>
      </div>

      <div class="invoice-wrapper">
        
        <table class="header-table">
          <tr>
            <td class="logo-left">
              <img src="${leftLogoUrl}" alt="Company Logo">
            </td>
            <td class="logo-right">
              <img src="${rightLogoUrl}" alt="AppSheet Logo">
            </td>
          </tr>
        </table>

        <div class="title-text">Receipt</div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">Invoice number</td>
            <td class="meta-value">${invoiceNumber}</td>
          </tr>
          <tr>
            <td class="meta-label">Date paid</td>
            <td class="meta-value">${formattedDate}</td>
          </tr>
          <tr>
            <td class="meta-label">Payment method</td>
            <td class="meta-value">USD Balance Account</td>
          </tr>
        </table>

        <div class="info-row">
          <div class="info-left">
            <strong>AppSheet</strong><br>
            AppSheet<br>
            1600 Amphitheatre Pkwy<br>
            Mountain View, California 94043<br>
            United States<br>
            +1 206-486-4185<br>
            sales@appsheet.com<br>
            <div class="amount-paid-text">$${totalAmount.toFixed(2)} paid on ${formattedDate}</div>
          </div>
          <div class="info-right">
            <div class="bill-to-title">Bill to</div>
            <div class="bill-to-company">${companyName}</div>
            <div class="bill-to-email">m.gamal2363@gmail.com</div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 50%;">Description</th>
              <th class="num-col" style="width: 10%;">Qty</th>
              <th class="num-col" style="width: 20%;">Unit Price</th>
              <th class="num-col" style="width: 20%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <p class="description-text">AppSheet PREMIUM User Licenses</p>
                <p class="description-sub">Monthly active operational application seats subscription</p>
              </td>
              <td class="num-col">${noOfUsers}</td>
              <td class="num-col">$${costPerUser.toFixed(2)}</td>
              <td class="num-col">$${licenseSubtotal.toFixed(2)}</td>
            </tr>
            ${maintCost > 0 ? `
            <tr>
              <td>
                <p class="description-text">AppSheet Server Infrastructure Maintenance Cost</p>
                <p class="description-sub">Technical optimization, data safety & backup routine control</p>
              </td>
              <td class="num-col">1</td>
              <td class="num-col">$${maintCost.toFixed(2)}</td>
              <td class="num-col">$${maintCost.toFixed(2)}</td>
            </tr>
            ` : ''}
          </tbody>
        </table>

        <table class="totals-table">
          <tr>
            <td class="totals-label">Subtotal</td>
            <td class="totals-value">$${totalAmount.toFixed(2)}</td>
          </tr>
          <tr class="divider-row grand-total">
            <td class="totals-label">Total</td>
            <td class="totals-value">$${totalAmount.toFixed(2)}</td>
          </tr>
          <tr class="grand-total">
            <td class="totals-label" style="color:#111111;">Amount paid</td>
            <td class="totals-value" style="color:#111111;">$${totalAmount.toFixed(2)}</td>
          </tr>
        </table>

        <div class="footer-clause">
          <br>
          Generated automatically via ERP System Architecture.
        </div>

      </div>

    </body>
    </html>`;

    return HtmlService.createHtmlOutput(htmlContent)
      .setTitle("Receipt from AppSheet - " + invoiceNumber)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    return HtmlService.createHtmlOutput(
      "<h3 style='direction:rtl; text-align:center; color:#c53030; padding-top:40px;'>❌ خطأ في معالجة إيصال الأب شيت: " + err.message + "</h3>"
    );
  }
}

/* =========================================
 * Multi-device sessions + audit trail endpoints (B6)
 * All require an authenticated user (wired in Code.js ROUTES). No super-admin
 * gate — any logged-in user manages their own sessions/views. Authority for
 * business pages is untouched (ERP_Users.authorizedPages / guard_ unchanged).
 * ========================================= */
function list_user_views(payload, sessionToken, authUser) {
  const dbId = CONFIG.AUTH_SPREADSHEET_ID;
  const pageAction = payload && payload.page_action ? String(payload.page_action) : '';
  const all = getAllRecords_(dbId, 'ERP_User_Views');
  const mine = all.filter(function (v) {
    return v.email === authUser.email && (!pageAction || v.page_action === pageAction);
  });
  mine.sort(function (a, b) { return (Number(b.is_default) || 0) - (Number(a.is_default) || 0); });
  return { status: 'success', views: mine };
}

function save_user_view(payload, sessionToken, authUser) {
  const dbId = CONFIG.AUTH_SPREADSHEET_ID;
  const isDelete = !!(payload && payload._delete);
  const viewId = payload && payload.view_id ? String(payload.view_id).trim() : '';
  const viewName = payload && payload.view_name ? String(payload.view_name).trim() :
    (payload && payload.name ? String(payload.name).trim() : '');
  const pageAction = payload && payload.page_action ? String(payload.page_action).trim() :
    (payload && payload.page_key ? String(payload.page_key).trim() : '');
  const layoutJson = payload && (payload.layout_json !== undefined) ? payload.layout_json :
    (payload && payload.definition !== undefined ? payload.definition : '');
  const sheet = getSheet_('ERP_User_Views', dbId);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const idx = function (n) { return headers.findIndex(function (h) { return String(h).trim().toLowerCase() === n; }); };
  const emIdx = idx('email'), paIdx = idx('page_action'), vaIdx = idx('view_name'), idIdx = idx('view_id');

  if (isDelete) {
    if (!viewId) throw new Error('معرف العرض مطلوب للحذف');
    let found = -1;
    for (let i = 1; i < data.length; i++) {
      if (idIdx !== -1 && String(data[i][idIdx]).trim() === viewId &&
          String(data[i][emIdx]).trim().toLowerCase() === authUser.email) { found = i + 1; break; }
    }
    if (found === -1) throw new Error('العرض غير موجود');
    sheet.deleteRow(found);
    return { status: 'success', message: 'تم حذف العرض' };
  }

  if (!viewName) throw new Error('اسم العرض مطلوب');
  if (!pageAction) throw new Error('الصفحة غير محددة');
  if (!layoutJson) throw new Error('تخطيط العرض مطلوب');
  const isDefault = !!(payload && (payload.is_default === true || String(payload.is_default).trim().toLowerCase() === 'true'));
  let existingRowNum = -1;
  for (let i = 1; i < data.length; i++) {
    const matchId = idIdx !== -1 && viewId && String(data[i][idIdx]).trim() === viewId;
    const matchName = String(data[i][emIdx]).trim().toLowerCase() === authUser.email &&
      String(data[i][paIdx]).trim() === pageAction && String(data[i][vaIdx]).trim() === viewName;
    if (matchId || matchName) { existingRowNum = i + 1; break; }
  }
  if (isDefault) {
    for (let i = 1; i < data.length; i++) {
      if (i + 1 === existingRowNum) continue;
      if (String(data[i][emIdx]).trim().toLowerCase() === authUser.email &&
          String(data[i][paIdx]).trim() === pageAction) {
        const newRow = data[i].slice();
        newRow[idx('is_default')] = false;
        sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      }
    }
  }
  const layoutStr = typeof layoutJson === 'string' ? layoutJson : JSON.stringify(layoutJson);
  const now = new Date();
  if (existingRowNum !== -1) {
    const newRow = data[existingRowNum - 1].slice();
    newRow[idx('layout_json')] = layoutStr;
    newRow[idx('is_default')] = isDefault;
    newRow[idx('updated_at')] = now;
    sheet.getRange(existingRowNum, 1, 1, newRow.length).setValues([newRow]);
    return { status: 'success', message: 'تم تحديث العرض', view_name: viewName };
  }
  const rowValues = headers.map(function () { return ''; });
  const set = function (n, v) { const ci = idx(n); if (ci !== -1) rowValues[ci] = v; };
  if (idIdx !== -1) set('view_id', getNextId_(dbId, 'ERP_User_Views', 'view_id'));
  set('email', authUser.email);
  set('page_action', pageAction);
  set('view_name', viewName);
  set('layout_json', layoutStr);
  set('is_default', isDefault);
  set('created_at', now);
  set('updated_at', now);
  sheet.appendRow(rowValues);
  return { status: 'success', message: 'تم حفظ العرض', view_name: viewName };
}

function get_record_history(payload, sessionToken, authUser) {
  const dbId = CONFIG.AUTH_SPREADSHEET_ID;
  const sheetName = payload && payload.sheet_name ? String(payload.sheet_name) : '';
  const recordId = payload && payload.record_id ? String(payload.record_id) : '';
  const recordUid = payload && payload.record_uid ? String(payload.record_uid) : '';
  if (!sheetName) throw new Error('بيانات غير مكتملة');
  const all = getAllRecords_(dbId, 'ERP_Record_History');
  let rows = all.filter(function (h) { return h.sheet_name === sheetName; });
  if (recordId) rows = rows.filter(function (h) { return h.record_id === recordId; });
  else if (recordUid) rows = rows.filter(function (h) { return h.record_uid === recordUid; });
  const specific = recordId || recordUid;
  rows.sort(function (a, b) {
    return specific ? (new Date(a.changed_at) - new Date(b.changed_at)) : (new Date(b.changed_at) - new Date(a.changed_at));
  });
  return { status: 'success', history: rows };
}

function list_my_sessions(payload, sessionToken, authUser) {
  const tokenHash = SessionManager_.hashToken_(sessionToken);
  const list = SessionManager_.listSessions(authUser.email).map(function (s) {
    return {
      token_hash: s.token_hash, device_name: s.device_name, device_id: s.device_id,
      created_at: s.created_at, last_activity: s.last_activity,
      is_current: s.token_hash === tokenHash
    };
  });
  return { status: 'success', sessions: list };
}

function revoke_session(payload, sessionToken, authUser) {
  const tokenHash = payload && payload.token_hash ? String(payload.token_hash) : '';
  if (!tokenHash) throw new Error('معرف الجلسة مطلوب');
  const sessions = SessionManager_.listSessions(authUser.email);
  const target = sessions.find(function (s) { return s.token_hash === tokenHash; });
  if (!target) throw new Error('الجلسة غير موجودة أو لا تملك صلاحاً بإلغائها');
  SessionManager_.revoke(tokenHash);
  return { status: 'success', message: 'تم إلغاء الجلسة' };
}

function revoke_all_sessions(payload, sessionToken, authUser) {
  const n = SessionManager_.revokeAllForUser(authUser.email);
  return { status: 'success', message: 'تم تسجيل الخروج من جميع الأجهزة', revoked: n };
}

function logout(payload, sessionToken, authUser) {
  SessionManager_.revokeAllForUser(authUser.email);
  return { status: 'success', message: 'تم تسجيل الخروج' };
}

function get_erp_session_meta(payload, sessionToken, authUser) {
  return {
    status: 'success',
    max_concurrent_sessions: readMaxConcurrent_(authUser.email),
    requires_device_name: false,
    session_expiry_hours: CONFIG.SESSION_EXPIRY_HOURS
  };
}