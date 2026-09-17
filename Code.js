/**
 * Code.js
 * RESPONSIBILITY: doGet, doPost, ROUTES map, executeCompanyAction_, json_, include.
 * Routing and dispatch glue ONLY. No business logic. Target: <150 lines.
 */

/* Globals shared with HTML templates via include() (set per request in doGet). */
var SCRIPT_URL = '';
var CURRENT_SESSION_TOKEN = '';
/* [RT-8] ?nominify=1 serves the shared files exactly as they are on disk.
 * The minifier is the change in this programme that can ship silently wrong —
 * a file that still parses and behaves differently — so there is a way to turn
 * it off without a deploy while it is being trusted. */
var NO_MINIFY = false;
var CURRENT_USER = null;

function doGet(e) {
  resetRecordCache_();
  // System kill switch — checked before anything else, including download
  // branches and company registration. A disabled system blocks every action…
  // except: an authenticated SUPER ADMIN gets the recovery screen with a
  // one-click re-open button (the only app-side lever while shut down).
  if (!isSystemEnabled_()) {
    const saToken = String(e.parameter.sessionToken || '').trim();
    let isSuperAdmin = false;
    if (saToken) {
      try {
        const saAuth = authenticateSystemUser_(saToken);
        isSuperAdmin = !!(saAuth && saAuth.authorized && saAuth.user && saAuth.user.isSuperAdmin);
      } catch (err) { isSuperAdmin = false; }
    }
    if (isSuperAdmin) return renderSystemShutdownAdminPage_(ScriptApp.getService().getUrl(), saToken);
    return renderSystemDisabledPage_();
  }
  ensureCompaniesRegistered_();
  const download = String(e.parameter.download || '').trim();
  if (download === 'print_file') return servePrintFile_(e.parameter);
  if (download === 'print_barcode') return servePrintBarcode_(e.parameter);
  if (download === 'print_product_barcode') return servePrintProductBarcode_(e.parameter);
  if (download === 'attachment' || download === 'doc_file') return serveAttachment_(e.parameter);
  if (download === 'payroll_report') return servePayrollReport_(e.parameter);
  if (download === 'budget_print') return serveBudgetPrint_(e.parameter);
  if (download === 'erp_invoice' || download === 'appsheet_invoice') return serveErpInvoice_(e.parameter);
  const action = (e.parameter.action || 'login').trim();
  const scriptUrl = ScriptApp.getService().getUrl();
  SCRIPT_URL = scriptUrl;
  CURRENT_SESSION_TOKEN = String(e.parameter.sessionToken || '').trim();
  NO_MINIFY = String(e.parameter.nominify || '') === '1';

  // Session-expired interstitial: API layer redirects here; the button goes on
  // to the login page. Shown before any auth/page lookup.
  if (action === 'session_expired') return renderSessionExpiredPage_(scriptUrl);
  if ((action === 'login' || action === 'ERPDashboard') && String(e.parameter.expired || '').trim() === '1') {
    return renderSessionExpiredPage_(scriptUrl);
  }

  // A registry entry with no template is a permission token, not a page (see
  // valley_cost_view in Company_ValleyFoods_Registry.js). It must never be
  // rendered — treat it exactly like an unknown action and bounce home, rather
  // than reaching createTemplateFromFile(undefined) below.
  const page = getAllPages_().find(p => p.action === action && p.template);
  if (!page) {
    // Unknown/deleted action — bounce home instead of a dead-end message.
    return _frame(HtmlService.createHtmlOutput(_topNavScript(scriptUrl + '?action=ERPDashboard&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || ''))));
  }

  let authUser = null;
  if (!page.public) {
    const token = (e.parameter.sessionToken || '').trim();
    const auth = token ? authenticateSystemUser_(token) : { authorized: false };
    if (!auth.authorized) {
      if (token) return renderSessionExpiredPage_(scriptUrl);
      return _frame(HtmlService.createHtmlOutput(_topNavScript(scriptUrl + '?action=login')));
    }
    authUser = auth.user;
    try { SessionManager_.touch(e.parameter.sessionToken); } catch (e) {}
    if (!checkPageAccessForUI_(authUser, page.accessPage || action)) {
      // §5.2 L2 + §5.4: unified screen, no reveal of attempted page. backUrl is first authorized page or ERPDashboard with logout.
      let backUrl = scriptUrl + '?action=ERPDashboard&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || '');
      try {
        const first = getFirstAuthorizedPageForUser_(authUser);
        if (first) backUrl = scriptUrl + '?action=' + encodeURIComponent(first) + '&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || '');
      } catch(err){}
      let blockCompany = '';
      for (const key in COMPANY_REGISTRY) {
        const c = COMPANY_REGISTRY[key];
        if (c.pages && c.pages.some(p => p.action === action)) { blockCompany = key; break; }
      }
      // §5.3 zero-authorized: still show unified screen; logout affordance handled inside render.
      return renderAccessDeniedPage_(page.title || action, backUrl, blockCompany);
    }
  }

  /* A registry entry can name a template that is not in the deployment — a page
   * registered by one branch whose HTML landed on another, or a file left out of
   * a push. createTemplateFromFile throws a raw Apps Script exception at that
   * point ("No HTML file named X was found"), which reaches the user as a stack
   * trace on a white page and tells them nothing they can act on.
   *
   * The router already handles the two neighbouring cases — an unknown action,
   * and an entry deliberately registered with no template — so this is the third
   * one, and it fails the same way: a page that says what is wrong, with a way
   * back, and a console line naming the missing file for whoever deploys. */
  let tmpl;
  try {
    tmpl = HtmlService.createTemplateFromFile(page.template);
  } catch (missingTemplate) {
    try {
      console.error('doGet: action "' + action + '" is registered against template "' +
        page.template + '", which is not in this deployment — ' + missingTemplate.message);
    } catch (logErr) {}
    let backUrl = scriptUrl + '?action=ERPDashboard&sessionToken=' +
      encodeURIComponent(e.parameter.sessionToken || '');
    try {
      const firstPage = authUser ? getFirstAuthorizedPageForUser_(authUser) : null;
      if (firstPage) {
        backUrl = scriptUrl + '?action=' + encodeURIComponent(firstPage) +
          '&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || '');
      }
    } catch (backErr) {}
    return renderMissingPagePage_(page.title || action, page.template, backUrl);
  }
  tmpl.user = authUser;
  CURRENT_USER = authUser;
  tmpl.email = (e.parameter.email || '').trim();
  tmpl.purchaseCode = (e.parameter.purchase_code || '').trim();
  tmpl.currentAction = action;
  tmpl.pageParams = JSON.stringify(e.parameter || {});
  tmpl.companyPages = '[]';
  for (const key in COMPANY_REGISTRY) {
    const c = COMPANY_REGISTRY[key];
    if (c.pages && c.pages.some(p => p.action === action)) {
      tmpl.companyPages = JSON.stringify(
        c.pages
          .filter(p => p.nav !== false && (!authUser || checkPageAccessForUI_(authUser, p.action)))
          .map(p => ({ action: p.action, label: p.label || p.title }))
      );
      break;
    }
  }
  var rendered = tmpl.evaluate().getContent();
  rendered = rendered.split('__APP_WEB_URL__').join(scriptUrl)
                   .split('__APP_SESSION_TOKEN__').join(CURRENT_SESSION_TOKEN);
  var userNamesJson = '{}';
  try { userNamesJson = JSON.stringify(userNameMap_()).replace(/</g, '\\u003c'); } catch (eUN) {}
  var headInjection = '<meta name="app-web-url" content="' + scriptUrl + '">'
    + '<script>try{window.scriptUrl=document.querySelector(\'meta[name="app-web-url"]\').getAttribute(\'content\')||\'\';}catch(e){}</' + 'script>'
    + '<script>window.USER_NAMES=' + userNamesJson + ';</' + 'script>'
    // Phase 0b: tells the client whether a measurement window is open, so page
    // timings cost nothing at all while it is closed.
    + '<script>window.PERF_LOG=' + (perfLogReadsEnabled_() ? 'true' : 'false') + ';</' + 'script>';
  rendered = rendered.replace('<head>', '<head>' + headInjection);
  // viewport-fit=cover opts the page into the display's safe-area insets. It
  // has no effect at all on Windows or on Android Chrome in a browser tab; on
  // an iPhone it is what makes env(safe-area-inset-*) resolve to anything but
  // zero, which activates the --safe-* tokens CSS_Tokens already defines and
  // the home FAB and drawer already read. Without it the notch and the home
  // indicator sit on top of the content in landscape.
  return _frame(HtmlService.createHtmlOutput(rendered)).setTitle(page.title).addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Friendly access-denied page — unified §5.4. Never reveals attempted page/action (§5.4). Theme tokens only. */
function renderAccessDeniedPage_(pageTitle, backUrl, companyUid) {
  const theme = getCompanyBlockTheme_(companyUid);
  // pageTitle intentionally NOT rendered — unified message only (ERP_MESSAGES.NOT_AUTHORIZED)
  const msg = (typeof ERP_MESSAGES !== 'undefined' && ERP_MESSAGES.NOT_AUTHORIZED) ? ERP_MESSAGES.NOT_AUTHORIZED : 'غير مصرح لك بالوصول';
  const loginUrl = (backUrl && backUrl.indexOf('sessionToken=') !== -1) ? backUrl.split('?')[0] + '?action=login' : backUrl;
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,' + theme.from + ' 0%,' + theme.to + ' 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#128274;</div>' +
        '<h2 style="margin:0;font-size:19px;">' + msg + '</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;line-height:1.7;">ليس لديك صلاحية للوصول إلى هذه الصفحة. إذا كنت تحتاج صلاحية، تواصل مع مدير النظام لإضافتها لدورك من شاشة «صلاحيات الأدوار».</p>' +
         '<a href="' + backUrl + '" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 28px;background:' + theme.to + ';color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin:4px;">' +
        '&#127968;&nbsp; العودة إلى الرئيسية</a>' +
        ' <a href="' + loginUrl + '" onclick="try{localStorage.removeItem(\'erp_session\');}catch(e){}; window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 22px;background:#fff;color:' + theme.to + ';border:1px solid ' + theme.to + ';border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;margin:4px;">تسجيل خروج</a>' +
      '</div>' +
    '</div>' +
    '</body></html>'
  )).setTitle(msg);
}

/**
 * A page is registered but its HTML file is not in this deployment.
 *
 * This is a deployment fault, not a user fault and not a permissions fault, so
 * it says so rather than borrowing the access-denied wording — a user sent to
 * "you are not authorised" for a file that was never pushed will ask for a
 * grant that would change nothing. The template name is shown because the only
 * person who can act on this needs it, and it reveals nothing sensitive: it is
 * a file name already listed in the registry.
 */
function renderMissingPagePage_(pageTitle, templateName, backUrl) {
  const esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const title = 'الصفحة غير متوفرة في هذه النسخة';
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:460px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#64748b 0%,#334155 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#128679;</div>' +
        '<h2 style="margin:0;font-size:19px;">' + title + '</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.8;">صفحة «' + esc(pageTitle) +
          '» مُعرَّفة في النظام لكن ملفها غير موجود في النسخة المنشورة حالياً.</p>' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">' +
          'هذه مشكلة في النشر وليست مشكلة صلاحيات — إضافة صلاحية لن تحلّها. ' +
          'أبلغ مدير النظام بالملف الناقص:</p>' +
        '<code style="display:block;margin:0 0 20px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;' +
          'border-radius:8px;font-size:12.5px;direction:ltr;color:#334155;">' + esc(templateName) + '.html</code>' +
        '<a href="' + backUrl + '" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 28px;background:#334155;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin:4px;">' +
        '&#127968;&nbsp; العودة إلى الرئيسية</a>' +
      '</div>' +
    '</div>' +
    '</body></html>'
  )).setTitle(title);
}

/** Session-expired interstitial — button continues to the login page. */
function renderSessionExpiredPage_(scriptUrl) {
  const loginUrl = scriptUrl + '?action=login';
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#92400e 0%,#d97706 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#8987;</div>' +
        '<h2 style="margin:0;font-size:19px;">انتهت صلاحية الجلسة</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 8px;color:#374151;font-size:14px;">انتهت مدة تسجيل الدخول الخاصة بك لأسباب أمنية.</p>' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">اضغط الزر بالأسفل لتسجيل الدخول من جديد ومتابعة العمل.</p>' +
         '<a href="' + loginUrl + '" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 32px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">' +
        '&#128273;&nbsp; تسجيل الدخول</a>' +
      '</div>' +
    '</div>' +
    '</body></html>'
  )).setTitle('انتهت صلاحية الجلسة');
}

/** Kill-switch block page (non-admin view) — same card language as the access-denied page. */
function renderSystemDisabledPage_() {
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#9888;</div>' +
        '<h2 style="margin:0;font-size:19px;">عطل في السيستم</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 8px;color:#374151;font-size:14px;">النظام متوقف مؤقتاً للصيانة.</p>' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">يرجى المحاولة مرة أخرى لاحقاً. إذا كان الاستمرار مستعجلاً تواصل مع مدير النظام.</p>' +
        (url
          ? '<a href="' + url + '?action=login" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
            ' style="display:inline-block;padding:11px 32px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">' +
            '&#8635;&nbsp; إعادة المحاولة</a>'
          : '') +
      '</div>' +
    '</div>' +
    '</body></html>'
  ).setTitle('عطل في السيستم'));
}

/**
 * Super-admin shutdown recovery page — shown ONLY to authenticated super
 * admins while the kill switch is engaged. Offers a one-click re-open via
 * toggle_kill_switch (the sole action permitted through the router while the
 * system is disabled).
 */
function renderSystemShutdownAdminPage_(scriptUrl, sessionToken) {
  var safeToken = String(sessionToken || '');
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#9888;</div>' +
        '<h2 style="margin:0;font-size:19px;">النظام متوقف حالياً</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 8px;color:#374151;font-size:14px;">تم إيقاف النظام من لوحة الإدارة.</p>' +
        '<p id="shut-msg" style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">بصفتك مدير النظام يمكنك إعادة تشغيله فوراً بالزر بالأسفل، أو بتعديل خلية B2 في جدول ERP_system_work.</p>' +
        '<button id="shut-btn" onclick="reopenSystem()"' +
        ' style="display:inline-block;padding:11px 32px;background:#16a34a;color:#fff;border:0;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;">' +
        '&#8635;&nbsp; إعادة تشغيل النظام</button>' +
      '</div>' +
    '</div>' +
    '<script>' +
    'function reopenSystem(){' +
    '  var b=document.getElementById("shut-btn");var m=document.getElementById("shut-msg");' +
    '  b.disabled=true;b.style.opacity=".6";m.textContent="جاري إعادة التشغيل...";' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){window.top.location.href=' + JSON.stringify(scriptUrl + '?action=ERPDashboard&sessionToken=' + safeToken) + ';})' +
    '    .withFailureHandler(function(e){b.disabled=false;b.style.opacity="";m.textContent=(e&&e.message)?e.message:"فشل التشغيل، حاول مجدداً.";})' +
    '    .apiRouter({action:"toggle_kill_switch",payload:{on:true},sessionToken:' + JSON.stringify(safeToken) + '});' +
    '}' +
    '</script>' +
    '</body></html>'
  ).setTitle('إيقاف النظام'));
}

const ROUTES = {
  'login_user': { handler: handleLoginWithDevice_, requireAuth: false },
  'setup_password': { handler: handleSetupWithDevice_, requireAuth: false },
  'ping': { handler: handlePing_, requireAuth: true },
  'get_dashboard_data': { handler: getDashboardData_, requireAuth: true },
  'company_action': { handler: executeCompanyAction_, requireAuth: true },
  // T-2 — the ONLY unauthenticated door into a company namespace. A company
  // registers no `publicDispatch` unless it opts in (only AssessmentCenter
  // does, for its candidate-facing pages), so this route is inert for every
  // other company (asserted by ac1_wiring.js).
  'company_public_action': { handler: executeCompanyPublicAction_, requireAuth: false },
  'admin_list_companies': { handler: adminListCompanies_, requireAuth: true },
  'admin_save_company': { handler: adminSaveCompany_, requireAuth: true },
  'admin_list_users': { handler: adminListUsers_, requireAuth: true },
  'admin_save_user': { handler: adminSaveUser_, requireAuth: true },
  'admin_list_matrix': { handler: adminListMatrix_, requireAuth: true },
  'admin_save_matrix': { handler: adminSaveMatrix_, requireAuth: true },
  'admin_list_pages': { handler: adminListPages_, requireAuth: true },
  'admin_save_pages': { handler: adminSavePages_, requireAuth: true },
  'admin_list_currency': { handler: adminListCurrency_, requireAuth: true },
  'admin_save_currency': { handler: adminSaveCurrency_, requireAuth: true },
  'admin_delete_currency': { handler: adminDeleteCurrency_, requireAuth: true },
  'admin_list_invoices': { handler: adminListInvoices_, requireAuth: true },
  'admin_save_invoice': { handler: adminSaveInvoice_, requireAuth: true },
  'admin_delete_invoice': { handler: adminDeleteInvoice_, requireAuth: true },
  'toggle_kill_switch': { handler: toggleKillSwitch_, requireAuth: true },
  'list_user_views': { handler: list_user_views_, requireAuth: true },
  'save_user_view': { handler: save_user_view_, requireAuth: true },
  'get_record_history': { handler: get_record_history_, requireAuth: true },
  'list_my_sessions': { handler: list_my_sessions_, requireAuth: true },
  'revoke_session': { handler: revoke_session_, requireAuth: true },
  'revoke_all_sessions': { handler: revoke_all_sessions_, requireAuth: true },
  'logout': { handler: logout_, requireAuth: true },
  'get_erp_session_meta': { handler: get_erp_session_meta_, requireAuth: true },
  'cleanup_sessions': { handler: cleanupOldSessions_, requireAuth: true },
  'backfill_attachment_ids': { handler: backfillAttachmentIds_, requireAuth: true },
  'customs_office_path_repair': { handler: customsOfficePathRepair_, requireAuth: true },
  'install_triggers': { handler: installTriggers_, requireAuth: true },
  'install_retention_trigger': { handler: installRetentionTrigger_, requireAuth: true },
  'archive_old_records': { handler: archiveOldRecordsRoute_, requireAuth: true },
  'daily_csv_backup': { handler: dailyCsvBackupRoute_, requireAuth: true },
  'log_client_error': { handler: logClientError_, requireAuth: false },
  'log_client_perf': { handler: logClientPerf_, requireAuth: false },
  /* [RT-9] The soft-navigation body route. requireAuth is true and the handler
     ALSO runs checkPageAccessForUI_ on the page being asked for — being logged
     in is not the same as being allowed to see this page, and this endpoint
     must not be the one place where those two are confused. */
  'get_page_body': { handler: getPageBody_, requireAuth: true },
  /* [RT-10] Super-admin only; the handler checks, not just the route. */
  'get_perf_dashboard': { handler: getPerfDashboard_, requireAuth: true },

  // ─── MySQL Live Module (DbLive_Connector.js) ──────────
  'db_list_tables': { handler: dbListTables_, requireAuth: true },
  'db_get_columns': { handler: dbGetColumns_, requireAuth: true },
  'db_query':       { handler: dbQuery_,       requireAuth: true },
  'db_insert':      { handler: dbInsert_,      requireAuth: true },
  'db_update':      { handler: dbUpdate_,      requireAuth: true },
  'db_delete':      { handler: dbDelete_,      requireAuth: true },
  'db_aggregate':   { handler: dbAggregate_,   requireAuth: true }
};

/* An Apps Script time trigger is the only legitimate caller of the two public
 * maintenance wrappers. A client-side RPC can provide JSON but never the
 * platform trigger object, so both the event UID and registered handler name
 * must match before the wrapper performs work. */
function isVerifiedTimeTrigger_(e, handlerName) {
  const uid = String(e && e.triggerUid || '').trim();
  if (!uid || !handlerName) return false;
  try {
    return ScriptApp.getProjectTriggers().some(function (trigger) {
      return String(trigger.getUniqueId()) === uid && trigger.getHandlerFunction() === handlerName;
    });
  } catch (err) {
    return false;
  }
}

/* All browser download endpoints pass through this single fail-closed gate.
 * The tenant is derived from the authenticated identity or a fixed artifact
 * policy, never trusted from a request parameter. */
function authorizeArtifact_(params, policy) {
  params = params || {};
  policy = policy || {};
  const token = String(params.sessionToken || '').trim();
  const auth = token ? authenticateSystemUser_(token) : { authorized: false };
  if (!auth.authorized || !auth.user) throw new Error('تسجيل الدخول مطلوب لعرض هذا الملف.');
  const user = auth.user;
  if (policy.superAdmin && !user.isSuperAdmin) throw new Error('صلاحية غير كافية لعرض هذا الملف.');

  const requested = String(params.company || params.target_system || '').trim();
  const company = String(policy.company || user.company || '').trim();
  if (policy.company && requested && requested !== policy.company) throw new Error('الشركة المطلوبة غير مطابقة للملف.');
  if (!policy.superAdmin && !user.isSuperAdmin && requested && requested !== user.company) throw new Error('ليس لديك صلاحية هذه الشركة.');
  if (company) {
    assertCompanyEnabled_(company);
    if (policy.page) checkPageAccess_(user, company, policy.page, policy.access || 'read');
  } else if (!policy.superAdmin) {
    throw new Error('تعذر تحديد شركة الملف بشكل آمن.');
  }
  return { user: user, company: company };
}

function apiRouter(request) {
  return apiRouter_(request);
}

function isReadAction_(action) {
  return action === 'ping' || action.indexOf('get_') === 0 || action.indexOf('admin_list_') === 0;
}

/**
 * Phase 9. Whether this request can write anything.
 *
 * The reason F-01's "the memo is disabled for writes" description understated
 * the problem: every company page calls the single route 'company_action', so
 * testing request.action alone classified EVERY company request — reads included
 * — as a write. The real action for those lives in payload.module_action, and
 * that is what is tested here.
 *
 * Used only to arm the memo's shape guard, so a misclassification costs
 * performance, never correctness: a read wrongly called a write just pays the
 * guard, and a write wrongly called a read still has noteMutation_ underneath it.
 */
function requestMayWrite_(request) {
  let a = String((request && request.action) || '');
  if (a === 'company_action') {
    a = String((request.payload && request.payload.module_action) || '');
  }
  return !isReadAction_(a);
}

function apiRouter_(request) {
  // Request-scoped memoization for getAllRecords_() — start every invocation
  // with a fresh cache.
  //
  // Phase 9 (F-01): the unconditional disableRecordCache_() for non-read actions
  // is GONE. It was doing far more than its comment claimed. isReadAction_ tests
  // the ROUTER action, and every company page calls the single route
  // 'company_action' — which never starts with 'get_'. So the memo was switched
  // off for every company request in the application, reads included, not just
  // for writes. get_sales_headers, get_valley_purchasing_costing and every other
  // list endpoint have been paying full re-reads for repeated access to the same
  // sheet within one request.
  //
  // The memo now starts enabled and the first mutation disables it for the rest
  // of the request (noteMutation_ in 02_DataAccess.js). A read action never
  // mutates, so it keeps the memo throughout; a write action behaves exactly as
  // today from its first write onward.
  resetRecordCache_();
  setMemoGuard_(requestMayWrite_(request));
  ensureCompaniesRegistered_();
  let startTime = new Date();
  let result;
  let status = 'SUCCESS';
  let errorMessage = '';
  let authUser = null;
  
  try {
    const route = ROUTES[request.action];
    if (!route) throw new Error('Invalid action: ' + request.action);

    if (route.requireAuth) {
      const auth = authenticateSystemUser_(request.sessionToken);
      if (!auth.authorized) {
        status = 'FAILED';
        errorMessage = 'SESSION_EXPIRED';
        return { status: 'error', code: 'SESSION_EXPIRED' };
      }
      authUser = auth.user;
      try { SessionManager_.touch(request.sessionToken); } catch (e) {}
    } else if (request.sessionToken) {
      /* Optional identity lets unauthenticated telemetry attribute a legitimate
       * session without turning login/error reporting into an auth-required
       * route. An invalid token is simply treated as anonymous. */
      const optionalAuth = authenticateSystemUser_(request.sessionToken);
      if (optionalAuth.authorized) authUser = optionalAuth.user;
    }

    // System kill switch — blocks EVERY action for EVERYONE once engaged,
    // with exactly one exception: an authenticated SUPER ADMIN calling
    // toggle_kill_switch (the recovery lever). Auth therefore runs BEFORE
    // this check so the exception can be identified.
    if (!isSystemEnabled_() &&
        !(request.action === 'toggle_kill_switch' && authUser && authUser.isSuperAdmin)) {
      status = 'FAILED';
      errorMessage = 'SYSTEM_DISABLED';
      return { status: 'error', code: 'SYSTEM_DISABLED', message: 'عطل في السيستم' };
    }

    // Phase 9: re-arm the memo immediately before the handler. The preamble
    // above authenticates and may touch the session row, and that write would
    // otherwise disable the memo for the whole request through noteMutation_ —
    // costing the handler its memo because of a write it does not care about.
    // Safe: the memo is empty here, so nothing in it can predate those writes.
    rearmRecordCache_();
    result = jsonSafe_(route.handler(request.payload, request.sessionToken, authUser));
    
    // Log successful operation
    try { logSystemAction_(request, authUser, result, status, errorMessage, startTime); } catch (loggingError) {}
    /* [RT-10] One cache write, no sheet write. See perfRecord_. */
    perfRecordRequest_(request, authUser, status, startTime);

    return result;
  } catch (err) {
    status = 'FAILED';
    errorMessage = err.message;
    
    // Log failed operation
    logSystemAction_(request, authUser, null, status, errorMessage, startTime);
    perfRecordRequest_(request, authUser, status, startTime);

    return { status: 'error', message: err.message };
  }
}

/**
 * [RT-10] Turn one request into one telemetry entry.
 *
 * Every field comes from something apiRouter_ already had: the action, the
 * company, the page (through the same resolveLogPage_ SystemLog uses), the
 * elapsed time and the sheet-read counter. Nothing is computed for telemetry
 * that was not already being computed for the request.
 *
 * Wrapped whole. A telemetry path that can throw is a telemetry path that can
 * fail a save.
 */
function perfRecordRequest_(request, authUser, status, startTime) {
  try {
    var payload = (request && request.payload) || {};
    var action = String(request && request.action || '');
    var moduleAction = String(payload.module_action || '');
    var companyID = String(payload.target_system || '');
    var elapsed = startTime ? (new Date().getTime() - startTime.getTime()) : 0;
    perfRecord_({
      action: moduleAction || action,
      company: companyID,
      page: payload.page_id || resolveLogPage_(companyID, moduleAction || action),
      elapsed_ms: elapsed,
      sheet_reads: (typeof getSheetsReadCount_ === 'function') ? getSheetsReadCount_() : 0,
      status: status,
      user_email: (authUser && authUser.email) || '',
      client_ms: Number(payload.client_ms) || 0,
      isWrite: requestMayWrite_(request)
    });
  } catch (e) { /* never the reason a request fails */ }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ status: 'error', message: err.message });
  }
  return json_(apiRouter_(body));
}

/** Durable at-most-once execution for authenticated company write requests.
 * A pending/uncertain receipt is NEVER expired into permission to run again.
 * Sheets cannot atomically commit a whole handler plus its receipt: interrupted
 * handlers therefore require review rather than a potentially duplicate replay.
 */
function requestGuardIsWrite_(action) {
  return !/^(get_|list_|prefetch_|preview_|search_|check_|validate_|export_|lookup_|ping$)/.test(String(action || ''));
}
function requestGuardCanonical_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(requestGuardCanonical_).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + requestGuardCanonical_(value[key]); }).join(',') + '}';
}
function requestGuardHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function requestGuardReply_(code, message, uncertain, retryable) {
  return { status: 'error', code: code, message: message, uncertain: !!uncertain, transport: !!retryable };
}
/* Receipt states: done (mutation confirmed, response stored), failed (a proven
 * pre-mutation deterministic error — validation, auth, bad input — safe to
 * correct and retry), uncertain (mutation may have occurred, never replayed),
 * pending (execution inside the active processing window). Handlers opt into
 * 'failed' by throwing or returning an error with notApplied === true; only
 * errors raised before any mutation may carry that marker. */
function requestGuardNotApplied_(err) {
  return !!(err && err.notApplied === true);
}
function requestGuardFailedReply_(err) {
  var message = (err && err.message) || 'تعذر إكمال العملية.';
  var code = (err && err.code) || 'REQUEST_NOT_APPLIED';
  return { status: 'error', code: code, message: message, notApplied: true, uncertain: false, transport: false };
}
var REQUEST_RECEIPT_HEADERS_ = ['request_key','request_id','user_email','module_action','payload_hash','state','response_json','created_at','updated_at'];
function requestGuardSheet_(dbId) {
  var ss = getSpreadsheet_(dbId), sheet = ss.getSheetByName('ERP_Request_Receipts');
  if (!sheet) {
    sheet = ss.insertSheet('ERP_Request_Receipts');
    sheet.getRange(1, 1, 1, REQUEST_RECEIPT_HEADERS_.length).setValues([REQUEST_RECEIPT_HEADERS_]);
    noteMutation_(dbId, 'ERP_Request_Receipts');
    try { sheet.hideSheet(); } catch (ignore) {}
  }
  var headers = sheet.getRange(1, 1, 1, REQUEST_RECEIPT_HEADERS_.length).getValues()[0];
  if (headers.join('|') !== REQUEST_RECEIPT_HEADERS_.join('|')) throw new Error('Invalid request receipt schema');
  return sheet;
}
function requestGuardFind_(sheet, key) {
  if (sheet.getLastRow() < 2) return null;
  var found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).matchCase(true).findAll();
  if (found.length > 1) throw new Error('Duplicate request receipts');
  if (!found.length) return null;
  var row = found[0].getRow();
  return { row: row, values: sheet.getRange(row, 1, 1, REQUEST_RECEIPT_HEADERS_.length).getValues()[0] };
}
function requestGuardExecute_(payload, user, dbId, invoke, opts) {
  var action = String(payload.module_action || '');
  if (!requestGuardIsWrite_(action)) return invoke(payload);
  var input = payload.data || {}, requestId = String(input.__request_id || '');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) {
    return requestGuardReply_('REQUEST_ID_REQUIRED', 'حدّث صفحة التطبيق قبل الحفظ لتفعيل الحماية من التكرار. لم تُنفذ العملية.', false, false);
  }
  var clean = JSON.parse(JSON.stringify(input)); delete clean.__request_id; delete clean.__request_owner;
  var safePayload = Object.assign({}, payload, { data: clean });
  var email = String(user.email || '').trim().toLowerCase();
  if (input.__request_owner && input.__request_owner !== email) return requestGuardReply_('REQUEST_OWNER_MISMATCH', 'الطلب المؤجل يخص مستخدمًا آخر. راجعه بالحساب الأصلي.', true, false);
  if (!email) return requestGuardReply_('REQUEST_USER_REQUIRED', 'تعذر تحديد المستخدم لحماية العملية من التكرار.', false, false);
  var key = requestGuardHash_(JSON.stringify([dbId, payload.target_system, email, action, requestId]));
  var hash = requestGuardHash_(requestGuardCanonical_(clean));
  var claim;
  try {
    claim = executeWithLock_(function () {
      var sheet = requestGuardSheet_(dbId), prior = requestGuardFind_(sheet, key);
      if (prior) {
        if (String(prior.values[4]) !== hash) return { reply: requestGuardReply_('REQUEST_ID_CONFLICT', 'رقم الطلب مستخدم لبيانات مختلفة. راجع العملية قبل إعادة الحفظ.', true, false) };
        if (String(prior.values[5]) === 'done') {
          var reply = JSON.parse(String(prior.values[6])); reply.deduped = true;
          return { reply: reply };
        }
        if (String(prior.values[5]) === 'failed') {
          /* Confirmed non-mutation: replay the stored failure so corrections
             can retry instead of hitting a permanent uncertain block. */
          var failedReply = null;
          try { failedReply = JSON.parse(String(prior.values[6])); } catch (ignoreFailed) {}
          if (failedReply && failedReply.status === 'error') { failedReply.deduped = true; return { reply: failedReply }; }
        }
        var age = new Date().getTime() - new Date(prior.values[7]).getTime();
        if (String(prior.values[5]) === 'pending' && age >= 0 && age < 360000) {
          return { reply: requestGuardReply_('REQUEST_IN_PROGRESS', 'الطلب قيد المعالجة. ستتحقق إعادة المحاولة من نفس الطلب دون إنشاء نسخة أخرى.', true, true) };
        }
        /* Request-scoped recovery (opt-in per action via the company module):
           the handler locates its earlier result by request ID without
           creating anything new, so a stale receipt is safe to reconcile.
           Anything else stays blocked to avoid duplicate replay. */
        if (opts && opts.recovery === 'request-id') return { recover: true };
        return { reply: requestGuardReply_('REQUEST_UNCERTAIN', 'نتيجة الطلب غير مؤكدة. راجع السجل مع المسؤول قبل إنشاء طلب جديد؛ تم منع إعادة التنفيذ لتجنب التكرار. رقم الطلب: ' + requestId, true, false) };
      }
      var now = new Date(), row = sheet.getLastRow() + 1;
      if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
      sheet.getRange(row, 1, 1, REQUEST_RECEIPT_HEADERS_.length).setValues([[key,requestId,email,action,hash,'pending','',now,now]]);
      noteMutation_(dbId, 'ERP_Request_Receipts');
      SpreadsheetApp.flush();
      return { claimed: true };
    }, 10000);
  } catch (e) {
    return requestGuardReply_('REQUEST_GUARD_UNAVAILABLE', 'تعذر تثبيت حماية الطلب؛ لم تُنفذ العملية. أعد المحاولة بنفس الطلب.', true, false);
  }
  if (claim.reply) return claim.reply;
  var result, state = 'done';
  try {
    rearmRecordCache_();
    result = jsonSafe_(invoke(safePayload, { requestId: requestId }));
    if (!result || result.status === 'error') {
      if (requestGuardNotApplied_(result)) {
        state = 'failed';
        result = jsonSafe_(requestGuardFailedReply_(result));
      } else {
        state = 'uncertain';
        result = requestGuardReply_('REQUEST_UNCERTAIN', ((result && result.message) || 'تعذر إكمال العملية.') + ' راجع السجل قبل إنشاء طلب جديد. رقم الطلب: ' + requestId, true, false);
      }
    }
  } catch (err) {
    if (requestGuardNotApplied_(err)) {
      state = 'failed';
      result = jsonSafe_(requestGuardFailedReply_(err));
    } else {
      state = 'uncertain';
      result = requestGuardReply_('REQUEST_UNCERTAIN', (err.message || 'تعذر إكمال العملية.') + ' قد تكون بعض البيانات حُفظت؛ راجع السجل قبل إنشاء طلب جديد. رقم الطلب: ' + requestId, true, false);
    }
  }
  try {
    executeWithLock_(function () {
      var sheet = requestGuardSheet_(dbId), receipt = requestGuardFind_(sheet, key);
      if (!receipt || String(receipt.values[4]) !== hash) throw new Error('Receipt not found');
      var encoded = JSON.stringify(result);
      if (encoded.length > 40000) encoded = JSON.stringify({ status: 'success', reloadRequired: true, message: 'تم تسجيل الطلب مسبقًا. حدّث الصفحة لعرض البيانات.' });
      sheet.getRange(receipt.row, 6, 1, 4).setValues([[state,encoded,receipt.values[7],new Date()]]);
      noteMutation_(dbId, 'ERP_Request_Receipts');
      SpreadsheetApp.flush();
    }, 10000);
  } catch (err) {
    // A claim already exists: never execute the business handler again.
    return requestGuardReply_('REQUEST_UNCERTAIN', 'قد تكون العملية حُفظت، لكن تعذر تأكيد النتيجة. لا تنشئ طلبًا بديلًا قبل مراجعة السجل. رقم الطلب: ' + requestId, true, false);
  }
  return result;
}

function executeCompanyAction_(payload, sessionToken, authUser) {
  const company = COMPANY_REGISTRY[payload.target_system];
  if (!company) throw new Error('Unknown company: ' + payload.target_system);
  if (!authUser.isSuperAdmin && authUser.company !== payload.target_system) {
    throw new Error('Access Denied.');
  }
  // Page-level authorization is derived SERVER-SIDE from the company's own
  // action->page map — never from a client-supplied page_id. Unified:
  // view=any grant, add=write/full, edit/delete family=full only.
  const pageId = company.pageForAction ? company.pageForAction(payload.module_action) : null;
  if (pageId) {
    const m = String(payload.module_action || '');
    let required = payload.access_type || 'read';
    // infer from verb if caller didn't specify typed access
    if (!payload.access_type) {
      if (/^add_/.test(m)) required = 'write';
      else if (COMPANY_SA_ONLY_RE.test(m)) required = 'full';
      else required = 'read';
    }
    checkPageAccess_(authUser, payload.target_system, pageId, required);
  }
  if (!canCompanyAction_(authUser, payload.module_action, pageId)) {
    throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  }
  const dbId = authUser.isSuperAdmin ? getCompanySpreadsheetId_(payload.target_system) : getCompanySpreadsheetId_(authUser.company);
  /* Request-scoped recovery is opt-in per action on the company module (the
     handler must locate its earlier result by request ID without mutating).
     Extra dispatch arguments are ignored by modules that do not accept them. */
  var recovery = (company.requestRecovery_ && company.requestRecovery_(payload.module_action)) || '';
  return requestGuardExecute_(payload, authUser, dbId, function (safePayload, guardCtx) {
    return company.dispatch(safePayload, authUser, dbId, guardCtx);
  }, { recovery: recovery });
}

/**
 * T-2 — the only unauthenticated door into a company namespace. `authUser` is
 * always null here (the route is requireAuth:false, so apiRouter_ never
 * authenticates), which is why SystemLog.UserEmail comes back empty for every
 * candidate-side action — expected, per plan §5.6.
 *
 * No page-access check runs here on purpose: a company opts into this surface
 * by registering `publicDispatch`, and it alone decides what that surface
 * exposes (its own PUBLIC_ACTIONS allowlist, never its authenticated `actions`
 * map). The kill switch still runs first in apiRouter_, so a disabled system
 * blocks candidates too — the same message they would get from any other
 * route (R2/T-2).
 */
function executeCompanyPublicAction_(payload, sessionToken, authUser) {
  const company = COMPANY_REGISTRY[payload && payload.target_system];
  if (!company || typeof company.publicDispatch !== 'function') {
    throw new Error('Unknown company: ' + (payload && payload.target_system));
  }
  return company.publicDispatch(payload, getCompanySpreadsheetId_(payload.target_system));
}

/**
 * Unified company action authorization — merged layer.
 * view/add  -> handled via checkPageAccess_ (write/full hierarchy)
 * edit_/delete_/remove_/update_/toggle_/close_/make_ family -> Full Access only
 * Super Admin bypasses all. Mirrored in UI via IS_SUPER_ADMIN / Full Access check.
 */
var COMPANY_SA_ONLY_RE = /^(edit_|delete_|remove_|update_|toggle_|close_|make_)/;
function canCompanyAction_(authUser, moduleAction, pageId) {
  if (!authUser) return false;
  if (authUser.isSuperAdmin) return true;
  const m = String(moduleAction || '');
  const isEditDelete = COMPANY_SA_ONLY_RE.test(m);
  if (!isEditDelete) return true; // add/read already gated via checkPageAccess_
  // edit/delete family requires Full Access on that page
  if (!pageId) return false;
  return unifiedCheck_(authUser, authUser.company, pageId, 'full');
}

/**
 * System kill-switch toggle. Super-admin only.
 * Storage contract: sheet 'ERP_system_work', B1 header «on_off», B2 = 1/0
 * (1 = system works, 0 = system closed). C2/D2 hold audit stamps.
 * payload.on === undefined → read-only current state.
 * payload.on = true|false  → write B2 (1/0) + C2/D2 and explicitly call
 *                            bumpVersion_('ERP_system_work'), which bumps the
 *                            authority generation — invariant: programmatic
 *                            writes don't fire any edit trigger.
 * NOTE: once B2 = 0 the apiRouter gate blocks EVERY action, including this
 * one. Recovery when closed is always via editing B2 directly in the sheet.
 * That direct edit is caught by the INSTALLABLE onAuthSheetEdit trigger
 * (installTriggers_), which re-enables on the next request. The simple
 * onEdit(e) has never fired — this is a standalone script. If the installable
 * trigger is missing, recovery still happens, bounded by
 * AUTH_STALENESS_CEILING_SECONDS.
 */
function toggleKillSwitch_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const flagRecord = ensureSystemWorkSheet_();

  // Read-only mode
  if (!payload || payload.on === undefined || payload.on === null) {
    const flag = readSystemWorkFlag_(flagRecord);
    return { status: 'success', enabled: flag !== 0 }; // fail-open when unreadable
  }

  const newValue = !!payload.on;
  if (!flagRecord) throw new Error('STORAGE_NOT_FOUND: ERP_system_work flag document');
  systemPatchRecord_('ERP_system_work', flagRecord.meta.documentId, {
    on_off: newValue ? 1 : 0,
    updated_at: new Date(),
    updated_by: (authUser && authUser.email) || ''
  }, { expectedUpdateTime: flagRecord.meta.updateTime });
  // Explicit invalidation — onEdit does NOT fire for script writes.
  bumpVersion_('ERP_system_work');
  return { status: 'success', message: newValue ? 'تم تشغيل النظام' : 'تم إيقاف النظام', enabled: newValue };
}

// DEV-ONLY test route. Removed before deploy (Phase 7).
function handlePing_(payload, sessionToken, authUser) {
  return { status: 'success', user: authUser ? authUser.email : null };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Recursively sanitize a value for google.script.run serialization: Date -> ISO
 * string, undefined -> null. google.script.run does NOT reliably serialize Date
 * objects (returns null to the client), while doPost's JSON.stringify converts
 * them to ISO strings — which is why API tests pass but the UI fails.
 */
function jsonSafe_(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe_);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => { out[k] = jsonSafe_(value[k]); });
    return out;
  }
  return value;
}

/**
 * F-09: every shared include is 100% static — UI_Components, CSS_Tokens,
 * Client_Helpers, both *_Nav files, ERP_Modal and ERP_Flow contain zero
 * <? ?> scriptlets — yet all of it was pushed through the Apps Script
 * templating engine on every single page load.
 *
 * [UI-10.2 / U-35] ERP_DataTable and ERP_DataTable_JS were named here too.
 * They were included by ZERO pages and were deleted in step 10.1, so naming
 * them here was telling the next reader that 42 KB of dead code was live.
 *
 * Now: read the file directly and only fall back to template evaluation if the
 * content actually contains a scriptlet, so an include that later gains one keeps
 * working with no further change here. Placeholder substitution is unchanged.
 */
/* ══════════════════════════════════════════════════════════════════════════
 * [RT-8] minifyInclude_ — comments and whitespace off the wire, nothing else
 *
 * Every navigation is a full document load and HtmlService cannot set
 * Cache-Control, so the shared bundle is downloaded, parsed and executed again
 * on every single navigation: 268 KB of UI_Components, 24 KB of Client_Helpers
 * and 14 KB of CSS_Tokens, 85 times over. UI_Components alone is 37% comments
 * and whitespace by byte. Gzip helps the transfer and does nothing at all for
 * the parse, which is the part that blocks first paint.
 *
 * WHAT THIS MAY DO: remove comments, and collapse whitespace that is not inside
 * a string, a template literal or a regular expression.
 *
 * WHAT THIS MAY NOT DO, ever: rename anything. UIC.*, API.*, FMT.*, UI.*,
 * SESSION.*, ERPFlow.* and ERPModal.* are a cross-file public surface — pages
 * call them by name and tools/ui_check.js C3 verifies them. An identifier
 * mangler here would break every page in the product at once and pass every
 * test that only looks at one file.
 *
 * The comments in this codebase are unusually good and they all stay in source.
 * This removes them from the wire only.
 *
 * WHY A SCANNER AND NOT REGEXES. A regex that eats `//` inside a string
 * literal, or `/* *\/` inside a template literal, produces a file that still
 * parses and behaves differently — the worst possible failure, because nothing
 * reports it. This walks the source one character at a time and knows exactly
 * which of five states it is in. The two genuinely hard cases are handled
 * explicitly:
 *
 *   - `/` is division or the start of a regex depending on what came before it.
 *     Decided on the last significant token, the standard rule.
 *   - A template literal may contain `${ ... }` holding arbitrary code, which
 *     may itself contain another template literal. Depth is tracked.
 *
 * Everything inside a string, a template literal or a regex is copied byte for
 * byte, which is what keeps Arabic literals, CSS in template literals and
 * `https://` URLs intact.
 * ══════════════════════════════════════════════════════════════════════════ */
function minifyInclude_(src) {
  if (!src) return src;
  var out = [];
  var n = src.length;
  var i = 0;

  /* The last significant character emitted, for the regex-vs-division call. */
  var prev = '';
  var prevWord = '';

  /* Template-literal nesting: each entry is the ${} depth inside that level. */
  var tmpl = [];

  function lastNonSpace() {
    for (var k = out.length - 1; k >= 0; k--) {
      var c = out[k];
      if (c !== ' ' && c !== '\n') return c;
    }
    return '';
  }

  /* A `/` begins a regex when the previous significant token cannot end an
   * expression. Everything that CAN end one (an identifier, a number, `)`,
   * `]`, a string) means division instead. */
  function regexAllowed() {
    var c = lastNonSpace();
    if (c === '') return true;
    if ('([{,;:!&|?+-*%^~=<>'.indexOf(c) !== -1) return true;
    if (c === ')' || c === ']' || c === '}') return false;
    /* keyword-then-slash: `return /x/`, `typeof /x/`, `case /x/` */
    return /\b(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/.test(prevWord);
  }

  while (i < n) {
    var c = src[i];
    var d = src[i + 1];

    /* ── inside a template literal ─────────────────────────────────────── */
    if (tmpl.length && tmpl[tmpl.length - 1].raw) {
      if (c === '\\') { out.push(c, src[i + 1]); i += 2; continue; }
      if (c === '`') { tmpl.pop(); out.push(c); i++; prev = c; continue; }
      if (c === '$' && d === '{') {
        tmpl[tmpl.length - 1].raw = false;
        tmpl[tmpl.length - 1].depth = 1;
        out.push('$', '{'); i += 2; continue;
      }
      out.push(c); i++; continue;      /* byte for byte, newlines included */
    }

    /* ── block comment ─────────────────────────────────────────────────── */
    if (c === '/' && d === '*') {
      var end = src.indexOf('*/', i + 2);
      i = (end === -1) ? n : end + 2;
      /* A comment separated two tokens; leave one space so `a/*x*\/b` does not
       * become `ab`. */
      if (out.length && lastNonSpace() !== '') out.push(' ');
      continue;
    }

    /* ── line comment ──────────────────────────────────────────────────── */
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    /* ── HTML comment ──────────────────────────────────────────────────── */
    if (c === '<' && src.substr(i, 4) === '<!--') {
      var he = src.indexOf('-->', i + 4);
      i = (he === -1) ? n : he + 3;
      continue;
    }

    /* ── string ────────────────────────────────────────────────────────── */
    if (c === '"' || c === "'") {
      var q = c;
      out.push(c); i++;
      while (i < n) {
        if (src[i] === '\\') { out.push(src[i], src[i + 1]); i += 2; continue; }
        out.push(src[i]);
        if (src[i] === q) { i++; break; }
        i++;
      }
      prev = q; prevWord = '';
      continue;
    }

    /* ── template literal opens ────────────────────────────────────────── */
    if (c === '`') {
      tmpl.push({ raw: true, depth: 0 });
      out.push(c); i++; prev = c; prevWord = '';
      continue;
    }

    /* ── regex literal ─────────────────────────────────────────────────── */
    if (c === '/' && regexAllowed()) {
      out.push(c); i++;
      var inClass = false;
      while (i < n) {
        var r = src[i];
        if (r === '\\') { out.push(r, src[i + 1]); i += 2; continue; }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) { out.push(r); i++; break; }
        else if (r === '\n') break;       /* not a regex after all; bail safely */
        out.push(r); i++;
      }
      /* flags */
      while (i < n && /[a-z]/.test(src[i])) { out.push(src[i]); i++; }
      prev = '/'; prevWord = '';
      continue;
    }

    /* ── whitespace ────────────────────────────────────────────────────── */
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      var j = i;
      var sawNewline = false;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r' || src[j] === '\n')) {
        if (src[j] === '\n') sawNewline = true;
        j++;
      }
      var before = lastNonSpace();
      var after = src[j] || '';
      /* Keep ONE separator when removing it would join two tokens, or when a
       * newline is doing the job of a semicolon (ASI). Otherwise drop it. */
      var wordish = function (ch) { return /[A-Za-z0-9_$-￿]/.test(ch); };
      if (before && after && (wordish(before) && wordish(after))) out.push(' ');
      else if (sawNewline && before && after && '+-'.indexOf(after) !== -1) out.push('\n');
      else if (sawNewline && before && ')]}'.indexOf(before) === -1 &&
               ';{}(,:[=&|?+-*/%<>!'.indexOf(before) === -1 && after && '.)]},;:'.indexOf(after) === -1) {
        /* A line break that could be terminating a statement. Cheaper to keep
         * it than to reason about automatic semicolon insertion. */
        out.push('\n');
      }
      i = j;
      continue;
    }

    /* ── ordinary code ─────────────────────────────────────────────────── */
    if (tmpl.length && !tmpl[tmpl.length - 1].raw) {
      if (c === '{') tmpl[tmpl.length - 1].depth++;
      else if (c === '}') {
        tmpl[tmpl.length - 1].depth--;
        if (tmpl[tmpl.length - 1].depth === 0) tmpl[tmpl.length - 1].raw = true;
      }
    }
    out.push(c);
    prevWord = /[A-Za-z0-9_$]/.test(c) ? (prevWord + c) : '';
    prev = c;
    i++;
  }

  return out.join('');
}

/* ══════════════════════════════════════════════════════════════════════════
 * [RT-9] get_page_body — the same page, without the 190 KB that is already here
 *
 * doGet renders a page by evaluating its template with include() inlining the
 * shared bundle. On a navigation from one page of the app to another, all of
 * that shared bundle is ALREADY in the document: the browser downloads it,
 * parses it and executes it a second time for no reason at all.
 *
 * This returns the same template, evaluated the same way, with the shared
 * includes suppressed — so a soft navigation transfers a page's own body and
 * script and nothing else.
 *
 * THE AUTHORIZATION GATE IS THE SAME GATE. checkPageAccessForUI_, on the same
 * action, with the same registry lookup and the same public-page rule as doGet.
 * A faster route to a page must never be a route around the check that decides
 * whether you may see it. This is the single highest-risk line in the whole
 * programme and it is deliberately a copy of doGet's, not a variation on it.
 * ══════════════════════════════════════════════════════════════════════════ */

/* Set only for the duration of one getPageBody_ call. include() reads it and
 * returns nothing for the three shared files, which are already in the
 * document the router is swapping content inside. */
var SUPPRESS_SHARED_INCLUDES = false;

function getPageBody_(data, user) {
  const action = String((data && data.action) || '').trim();
  if (!action) throw new Error('الصفحة مطلوبة');

  /* Same registry rule as doGet: an entry with no template is a permission
   * token, not a page, and must never be rendered. */
  const page = getAllPages_().find(p => p.action === action && p.template);
  if (!page) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);

  if (!page.public) {
    if (!user) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    if (!checkPageAccessForUI_(user, page.accessPage || action)) {
      /* Deliberately the same opaque message as an unknown page: a soft
       * navigation must not become an oracle for which pages exist. */
      throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  let tmpl;
  try {
    tmpl = HtmlService.createTemplateFromFile(page.template);
  } catch (missing) {
    throw new Error('الصفحة غير متاحة');
  }

  tmpl.user = user || null;
  tmpl.email = '';
  tmpl.purchaseCode = '';
  tmpl.currentAction = action;
  tmpl.pageParams = JSON.stringify({ action: action });
  tmpl.companyPages = '[]';
  for (const key in COMPANY_REGISTRY) {
    const c = COMPANY_REGISTRY[key];
    if (c.pages && c.pages.some(p => p.action === action)) {
      tmpl.companyPages = JSON.stringify(
        c.pages
          .filter(p => p.nav !== false && (!user || checkPageAccessForUI_(user, p.action)))
          .map(p => ({ action: p.action, label: p.label || p.title }))
      );
      break;
    }
  }

  let rendered;
  SUPPRESS_SHARED_INCLUDES = true;
  try {
    rendered = tmpl.evaluate().getContent();
  } finally {
    /* In a finally, so a template that throws cannot leave every LATER request
     * in this execution rendering pages with no shared bundle at all. */
    SUPPRESS_SHARED_INCLUDES = false;
  }
  rendered = rendered.split('__APP_WEB_URL__').join(SCRIPT_URL)
                     .split('__APP_SESSION_TOKEN__').join(CURRENT_SESSION_TOKEN);

  /* Split the rendered document into the two things the router needs. The
   * scripts are returned SEPARATELY rather than left in the html, because
   * assigning innerHTML does not execute <script> tags — the router has to
   * evaluate them itself, and it needs them in order. */
  const scripts = [];
  const body = extractBody_(rendered).replace(
    /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi,
    function (m, code) { scripts.push(code); return ''; }
  );

  /* Inline <style> blocks survive inside the html and are applied when it is
   * inserted, so they need no special handling. */
  return {
    status: 'success',
    action: action,
    title: page.title || action,
    html: body,
    scripts: scripts
  };
}

/** The contents of <body>, or the whole document when there is no body tag. */
function extractBody_(html) {
  const open = html.search(/<body[^>]*>/i);
  if (open === -1) return html;
  const start = html.indexOf('>', open) + 1;
  const close = html.toLowerCase().lastIndexOf('</body>');
  return (close === -1) ? html.slice(start) : html.slice(start, close);
}

/* Which files are worth minifying. The three shared ones are 87% of every
 * page's payload and are included by 85 pages each; a page's own body is
 * included once and is small. Keeping the list explicit means a new page
 * template cannot accidentally be run through the minifier before anyone has
 * looked at it. */
var MINIFY_FILES_ = { 'UI_Components': 1, 'Client_Helpers': 1, 'CSS_Tokens': 1 };

/* A cheap, stable content hash. Not a checksum — a cache key. */
function contentHash_(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '_' + s.length.toString(36);
}

/*
 * [RT-8] include() runs for every shared file on every page render — 85 times
 * per navigation — and already did a split().join() over the whole string
 * twice. Minifying on top of that, per request, would cost far more than the
 * bytes it saves.
 *
 * So the result is held in CacheService keyed by a hash of the CONTENT, not by
 * the filename: a filename key would go stale on the next deploy and serve the
 * previous release's JavaScript, which is a much worse bug than a slow render.
 * With a content key, a deploy simply misses once and re-fills.
 */
function include(filename) {
  var rendered;
  try {
    var raw = HtmlService.createHtmlOutputFromFile(filename).getContent();
    rendered = (raw.indexOf('<?') === -1)
      ? raw
      : HtmlService.createTemplateFromFile(filename).evaluate().getContent();
  } catch (e) {
    rendered = HtmlService.createTemplateFromFile(filename).evaluate().getContent();
  }

  /* [RT-9] A soft navigation already has the shared bundle in the document.
   * Returning it again would make the "cheap" route the expensive one. */
  if (SUPPRESS_SHARED_INCLUDES && MINIFY_FILES_[filename]) return '';

  if (MINIFY_FILES_[filename] && !NO_MINIFY) {
    try {
      var key = 'min_' + contentHash_(rendered);
      /* The CHUNKED cache, not CacheService directly: the minified
       * UI_Components is about 195 KB and a single CacheService value is
       * capped at 100 KB. A plain put() would fail silently and this would
       * re-minify a 300 KB file on every one of the 85 include() calls per
       * navigation — far more expensive than the bytes it saves.
       * putChunkedCache_/getChunkedCache_ already solve exactly this, and
       * already treat a partial eviction as a total miss. */
      var hit = getChunkedCache_(key);
      if (hit === null || typeof hit !== 'string') {
        hit = minifyInclude_(rendered);
        /* Six hours, the CacheService maximum. An eviction costs one
         * re-minify, never a wrong answer, because the key IS the content. */
        putChunkedCache_(key, hit, 21600);
      }
      rendered = hit;
    } catch (eMin) {
      /* A minifier that throws must never take a page down with it. The
       * unminified file is always a correct answer. */
    }
  }

  rendered = rendered.split('__APP_WEB_URL__').join(SCRIPT_URL)
                   .split('__APP_SESSION_TOKEN__').join(CURRENT_SESSION_TOKEN);
  return rendered;
}

/* Defense mechanism: append client-side JS errors to ERP_Client_Log so issues
 * surfaced in the browser can be diagnosed later. Called via google.script.run. */
function redactClientErrorText_(value, limit) {
  return String(value == null ? '' : value).slice(0, limit || 2000)
    .replace(/(sessionToken|token|password|authorization)\s*[=:]\s*[^\s&"']+/gi, '$1=[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]');
}

function logClientError_(payload, sessionToken, authUser) {
  try {
    payload = payload || {};
    if (systemStorageTarget_().backend === 'firestore') {
      var actorFs = authUser && authUser.email ? String(authUser.email).toLowerCase() : 'anonymous';
      systemCreateRecord_('ERP_Client_Log', { timestamp: new Date(), page: redactClientErrorText_(payload.page, 300), message: redactClientErrorText_(payload.message, 2000), stack: redactClientErrorText_(payload.stack, 4000), url: redactClientErrorText_(payload.url, 1500), user_email: actorFs === 'anonymous' ? '' : actorFs }, { operationId: 'client-error:' + actorFs + ':' + String(payload.page || '') + ':' + String(payload.message || '').slice(0, 80) });
      return { status: 'success' };
    }
    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    const sh = ss.getSheetByName('ERP_Client_Log');
    /* Creating a new log tab would be a schema change. A missing configured
     * observability sink is a deployment issue, not a reason to mutate schema. */
    if (!sh) return { status: 'error', code: 'CLIENT_LOG_NOT_CONFIGURED' };
    const actor = authUser && authUser.email ? String(authUser.email).toLowerCase() : 'anonymous';
    const rateKey = 'client_error_' + actor.replace(/[^a-z0-9]/g, '_');
    const cache = CacheService.getScriptCache();
    if (cache.get(rateKey)) return { status: 'success', skipped: true };
    cache.put(rateKey, '1', actor === 'anonymous' ? 60 : 10);
    sh.appendRow([
      new Date().toISOString(),
      redactClientErrorText_(payload.page, 300),
      redactClientErrorText_(payload.message, 2000),
      redactClientErrorText_(payload.stack, 4000),
      redactClientErrorText_(payload.url, 1500),
      actor === 'anonymous' ? '' : actor
    ]);
    noteMutation_(sh);
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Stream a product's print_file from Drive as a browser download. The server
 * runs as the deployer (owner), so no public sharing is required — mirrors
 * AppSheet pulling the file from the owner's Drive.
 * Params: download=print_file, id=<product id>, company=<uid> (optional),
 * sessionToken=<valid token>.
 */
function servePrintFile_(params) {
  const artifact = authorizeArtifact_(params, { company: '3fe1b5cb67b7223e', page: 'tc_products', access: 'read' });
  const company = artifact.company;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return ContentService.createTextOutput('Invalid id');

  const dbId = getCompanySpreadsheetId_(company);
  const product = getAllRecords_(dbId, 'products').find(function (r) { return Number(r.id) === id; });
  if (!product || (!product.print_file && !product.print_file_id)) return ContentService.createTextOutput('Not found');

  var file;
  try { file = attachmentOpenFile_(product, 'print_file', attachmentRegistry_().tc_products); }
  catch (e) { return ContentService.createTextOutput(e.message || 'تعذر فتح المرفق.'); }

  return dataUriDownloadHtml_(file.getName(), file.getBlob());
}

/* Phase 0b / [RT-2] — client-side timing. Sibling of logClientError_ so page
 * timings do not pollute the error log. Only writes when Script Property
 * PERF_LOG_READS is on; the client is told via window.PERF_LOG (injected in
 * doGet) so a disabled measurement window costs no round trip at all.
 *
 * The client now batches a navigation's marks into ONE call — four to six
 * metrics arrive together in payload.marks — so this appends them in one
 * setValues rather than one appendRow each. A navigation therefore costs one
 * request and one write instead of four of each.
 *
 * The single-metric shape (payload.metric / payload.ms) is still accepted: a
 * cached page served before this deploy will keep sending it, and a
 * measurement window that silently drops half its rows is worse than none.
 *
 * ERP_Client_Perf keeps exactly the six columns it has always had. Byte counts
 * (nav_transfer_bytes, nav_decoded_bytes) travel in the `ms` column with the
 * unit in the metric name, because changing this sheet's columns is not what
 * this work is for. */
function logClientPerf_(payload) {
  try {
    if (!perfLogReadsEnabled_()) return { status: 'success', skipped: true };
    payload = payload || {};

    var marks = Array.isArray(payload.marks) ? payload.marks : null;
    if (!marks) {
      if (!payload.metric) return { status: 'success', skipped: true };
      marks = [{ metric: payload.metric, ms: payload.ms }];
    }
    /* A runaway client must not be able to turn one request into a thousand
     * rows; a navigation produces six marks at the most. */
    marks = marks.slice(0, 20).filter(function (m) { return m && m.metric; });
    if (!marks.length) return { status: 'success', skipped: true };

    if (systemStorageTarget_().backend === 'firestore') {
      marks.forEach(function (m, i) { systemCreateRecord_('ERP_Client_Perf', { ts: new Date(), page: String(payload.page || '').slice(0, 200), metric: String(m.metric).slice(0, 60), ms: Number(m.ms) || 0, url: String(payload.url || '').slice(0, 1500), user_email: String(payload.user || '').slice(0, 200) }, { operationId: 'client-perf:' + String(payload.page || '') + ':' + String(m.metric) + ':' + String(new Date().getTime()) + ':' + i }); });
      return { status: 'success', rows: marks.length };
    }

    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    let sh = ss.getSheetByName('ERP_Client_Perf');
    if (!sh) {
      sh = ss.insertSheet('ERP_Client_Perf');
      noteMutation_(sh);
      sh.appendRow(['ts', 'page', 'metric', 'ms', 'url', 'user_email']);
      noteMutation_(sh);
    }
    const ts = new Date().toISOString();
    const page = String(payload.page || '').slice(0, 200);
    const url = String(payload.url || '').slice(0, 1500);
    const who = String(payload.user || '').slice(0, 200);
    const rows = marks.map(function (m) {
      return [ts, page, String(m.metric).slice(0, 60), Number(m.ms) || 0, url, who];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    noteMutation_(sh);
    return { status: 'success', rows: rows.length };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * [RT-10] Request telemetry — cheap enough to leave on permanently
 *
 * PERF_LOG_READS answers "what is slow today", once, and then has to be turned
 * off again: it appends a SystemLog row per request, so it adds a WRITE TO
 * EVERY READ, and SystemLog already grows without bound and carries
 * JSON.stringify(result.data) on every write row. PERF_BASELINE.md is explicit
 * that it is a measuring instrument, not a monitor.
 *
 * That means it cannot tell you that Thursday's release made المشتريات 400 ms
 * slower. Nothing can, today. So the thing worth building is not a better
 * measurement — it is a telemetry path so cheap that leaving it on is not a
 * decision anybody has to revisit.
 *
 * FOUR DESIGN DECISIONS, each answering a way this could go wrong:
 *
 * 1. A REQUEST PAYS ONE CACHE WRITE, NEVER A SHEET WRITE. apiRouter_ already
 *    measures elapsed and sheet reads; the numbers exist. They go onto a
 *    CacheService buffer keyed by the current minute, and a one-minute trigger
 *    drains the whole minute in one setValues. Losing a telemetry row to a
 *    cache eviction is acceptable — that is exactly why telemetry may use a
 *    cache and the audit queue may not.
 *
 * 2. SAMPLING FROM THE START, not retrofitted. 100% of writes, 100% of
 *    anything over a second, and a configurable fraction of fast reads. Without
 *    it the first busy week produces a sheet nobody can open, and by then it is
 *    too late to add.
 *
 * 3. NUMBERS ONLY. No payload, no record id, no email. The user column is a
 *    salted hash, which gives concurrency without a per-person activity record.
 *    SystemLog keeps the audit story; this sheet is what got slower. A perf log
 *    that quietly becomes a surveillance log is a failure even if every
 *    millisecond in it is correct.
 *
 * 4. IT CAN NEVER FAIL A REQUEST. Every path is wrapped. A full cache, a
 *    throwing cache, a missing sheet — all of them mean "log nothing", never
 *    "fail the thing the user asked for".
 * ══════════════════════════════════════════════════════════════════════════ */

function perfLogReadsEnabled_() {
  if (_perfLogReads_ === null) {
    _perfLogReads_ = false;
    try {
      const v = PropertiesService.getScriptProperties().getProperty('PERF_LOG_READS');
      _perfLogReads_ = (v === '1' || String(v).toLowerCase() === 'true');
    } catch (e) {}
  }
  return _perfLogReads_;
}

function ensureSystemLogSheet_() {
  try {
    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('SystemLog');
    if (!sheet) {
      sheet = ss.insertSheet('SystemLog');
      noteMutation_(sheet);
      sheet.appendRow(SYSTEM_LOG_HEADERS);
      noteMutation_(sheet);
      return sheet;
    }
    // Sheet already exists live — migrate in place. Only ADD missing headers
    // at the end; never touch existing columns or historical rows.
    const existing = getHeaders_(sheet).map(function (h) { return String(h).trim(); });
    const missing = SYSTEM_LOG_HEADERS.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) {
      sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
      noteMutation_(sheet);
      delete _headerCache_[sheet.getParent().getId() + '_' + sheet.getSheetId()]; // bust getHeaders_ cache
    }
    return sheet;
  } catch (e) {
    throw new Error('Failed to create/access SystemLog sheet: ' + e.message);
  }
}

/** Looks up the page for a module_action via each company's optional pageForAction(). */
function resolveLogPage_(companyID, moduleAction) {
  const company = COMPANY_REGISTRY[companyID];
  if (company && typeof company.pageForAction === 'function') {
    return company.pageForAction(moduleAction) || '';
  }
  return '';
}

/** Looks up the sheet/table touched by a module_action via each company's optional tableForAction(). */
function resolveLogTable_(companyID, moduleAction) {
  const company = COMPANY_REGISTRY[companyID];
  if (company && typeof company.tableForAction === 'function') {
    return company.tableForAction(moduleAction) || '';
  }
  return '';
}

function logSystemAction_(request, authUser, result, status, errorMessage, startTime) {
  try {
  const payload = (request && request.payload) || {};
  // company_action calls carry the real action in payload.module_action;
  // direct admin_* routes carry it as the top-level request.action.
  const sourceAction = payload.module_action || request.action;
  let classified = classifyAction_(sourceAction);

  if (classified === 'NO_LOG') {
    // Phase 0b: optionally log reads so they can be ranked. Never log the
    // credential-bearing actions, regardless of the flag.
    const src = String(sourceAction).toLowerCase();
    const isCredentialAction = (src === 'login_user' || src === 'setup_password');
    if (!perfLogReadsEnabled_() || isCredentialAction) return;
    classified = 'READ';
  }

  const companyID = payload.target_system || '';
  const companyName = getCompanyName_(companyID);
  const recordID = extractRecordId_(sourceAction, result);
  const userEmail = authUser ? authUser.email : '';
  // A read's result.data is the whole list — serialising it would balloon
  // SystemLog by megabytes per measurement window, so reads log a size instead.
  const changedFields = classified === 'READ'
    ? '(read)'
    : (result && result.data ? JSON.stringify(result.data) : '');
  const tableName = resolveLogTable_(companyID, sourceAction);
  // Prefer an explicit page_id from the payload if the client ever sends one;
  // otherwise fall back to the per-company action->page map.
  const pageName = payload.page_id || resolveLogPage_(companyID, sourceAction);

  let finalAction = classified;
  if (finalAction === 'ADMIN_SAVE') {
    finalAction = String(sourceAction).indexOf('save') !== -1 ? 'EDIT' : 'ADD';
  }

  const values = {
    logid: Utilities.getUuid(),
    timestamp: startTime,
    companyid: companyID,
    companyname: companyName,
    action: finalAction,
    sourceaction: sourceAction,
    recordid: recordID,
    useremail: userEmail,
    changedfields: changedFields,
    status: status,
    errormessage: errorMessage,
    table: tableName,
    page: pageName,
    // Phase 0b instrumentation.
    elapsedms: startTime ? (new Date().getTime() - startTime.getTime()) : '',
    sheetreads: (typeof getSheetsReadCount_ === 'function') ? getSheetsReadCount_() : ''
  };

  if (systemStorageTarget_().backend === 'firestore') {
    try {
      systemCreateRecord_('SystemLog', values, { operationId: 'system-log:' + values.logid });
    } catch (e) { try { console.error('Failed to log system action: ' + e.message); } catch (ignore) {} }
    return;
  }

  const logEntry = SYSTEM_LOG_HEADERS.map(function (h) {
    const v = values[String(h).toLowerCase()];
    return v === undefined || v === null ? '' : v;
  });

  try {
    const sheet = ensureSystemLogSheet_();
    appendRowWithRetry_(sheet, logEntry);
  } catch (e) {
    try { console.error('Failed to log system action: ' + e.message); } catch (ignore) {}
  }
  } catch (e) {
    try { console.error('System logging disabled: ' + String(e && e.message || e).slice(0, 180)); } catch (ignore) {}
  }
}

/** Resolve only a stored immutable Drive file ID. Filename lookup is forbidden. */
function resolveDriveFile_(storedFileId) {
  const raw = String(storedFileId || '').trim();
  const matched = raw.match(/\/d\/([A-Za-z0-9_-]+)/);
  const fileId = matched ? matched[1] : raw;
  if (!/^[A-Za-z0-9_-]{20,}$/.test(fileId)) return null;
  try { return DriveApp.getFileById(fileId); } catch (e) { return null; }
}

/**
 * Print a production barcode as PDF via the browser print dialog. Renders the
 * Code128 image (high DPI) + the raw data string, then auto-prints.
 * Params: download=print_barcode, id=<barcode id>, sessionToken=<valid token>.
 */
function servePrintBarcode_(params) {
  const artifact = authorizeArtifact_(params, { company: '3fe1b5cb67b7223e', page: 'tc_barcode', access: 'read' });
  const company = artifact.company;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return ContentService.createTextOutput('Invalid id');

  const dbId = getCompanySpreadsheetId_(company);
  const row = getAllRecords_(dbId, 'top_chemical_barcode_generator').find(function (r) { return Number(r.id) === id; });
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
  const product = getAllRecords_(dbId, 'products').find(function (p) { return Number(p.id) === id; });
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

/**
 * Generic attachment viewer (image/pdf preview + download). Authorizes the
 * business record, then opens its stored Drive ID or exact AppSheet path
 * within a uniquely resolved, registered table folder. No backfill is required.
 * Params: download=attachment (or legacy doc_file),
 *   page=<page>, id=<record key> (preferred) OR ref=<folder/file> (legacy),
 *   field=<file field> (optional when a record has several), sheet=<sheet>
 *   (optional override for pages with several sheets), sessionToken
 */
function attachmentFileIdField_(fileField) {
  return String(fileField || '').trim() + '_id';
}
function requireAttachmentBinding_(reference, fileId, label) {
  var ref = String(reference || '').trim(), id = extractDriveId_(fileId);
  if (ref && !id) throw new Error('لم يتم تثبيت معرف Drive للمرفق ' + String(label || '') + '؛ أعد رفع الملف ثم احفظ السجل.');
  return id;
}
function attachmentCachedFileId_(reference) {
  try {
    var ref = String(reference || '').trim();
    if (!ref) return '';
    return String(CacheService.getScriptCache().get('attid_' + ref) || '').trim();
  } catch (e) { return ''; }
}
function attachmentPickFileId_(data, fileField) {
  data = data || {};
  var idField = attachmentFileIdField_(fileField);
  var cand = data[idField] != null ? String(data[idField]).trim() : '';
  if (!cand) cand = data[String(idField).toLowerCase()] != null ? String(data[String(idField).toLowerCase()]).trim() : '';
  var ref = data[fileField] != null ? String(data[fileField]).trim() : '';
  if (!ref) ref = data[String(fileField).toLowerCase()] != null ? String(data[String(fileField).toLowerCase()]).trim() : '';
  var suppliedId = extractDriveId_(cand || (data.fileId && fileField ? String(data.fileId).trim() : ''));
  if (suppliedId) {
    /* A client ID is accepted only when it matches the exact upload binding. */
    var bound = attachmentCachedFileId_(ref);
    return bound && bound === suppliedId ? suppliedId : '';
  }
  if (ref) {
    var fromCache = attachmentCachedFileId_(ref);
    if (extractDriveId_(fromCache)) return extractDriveId_(fromCache);
  }
  return extractDriveId_(ref);
}
/** Known AppSheet storage folders for a registered table/field. */
function attachmentFoldersForField_(target, field) {
  var preferred = (target.folderByField && target.folderByField[field]) || target.folder;
  var folders = [preferred].concat(target.legacyFolders || []);
  if (target.sheet) folders = folders.concat([target.sheet + '_Files_', target.sheet + '_Images']);
  return folders.filter(function (folder, i) { return folder && folders.indexOf(folder) === i; });
}
function findAttachmentFileIdAcrossFolders_(target, field, reference) { var parts = String(reference || '').split('/'), filename = parts[parts.length - 1], exact = parts.length === 2 ? parts[0] : '', hits = [], allowed = attachmentFoldersForField_(target, field); allowed.forEach(function (folderName) { var folders = null; try { folders = DriveApp.getFoldersByName(folderName); } catch (e) { return; } while (folders.hasNext()) { var folder = folders.next(), fileId = ''; try { fileId = findDriveFileIdInFolder_(folder.getId(), filename); } catch (e2) { fileId = ''; } if (fileId) hits.push({ folder: folderName, id: fileId }); } }); /* A stored prefix may be a legacy alias of a renamed physical folder: when a mapping applies, only the mapped folder may win, so a stale same-named decoy can never shadow it. Non-aliased references keep the exact historical behavior below. */ var mapped = attachmentReferenceFolder_(target, field, reference); if (mapped && mapped !== exact) { var mappedHits = hits.filter(function (hit) { return hit.folder === mapped; }); if (mappedHits.length === 1) return mappedHits[0].id; return ''; } var exactHits = hits.filter(function (hit) { return hit.folder === exact; }); if (exactHits.length === 1) return exactHits[0].id; return hits.length === 1 ? hits[0].id : ''; }
function attachmentTargets_(config) { return [config].concat(config.altSheets || []); }
function attachmentTargetMatchesRef_(target, reference) {
  if (String(reference || '').split('/').length !== 2) return false;
  return target.fileFields.some(function (field) { return !!attachmentReferenceFolder_(target, field, reference); });
}
/** Read only: resolve the authorized record's ID or its exact AppSheet path. */
function attachmentOpenFile_(record, field, target) {
  var isCustomsOffice = !!(target && target.sheet === 'مكتب الجمارك');
  var rawId = isCustomsOffice ? '' : String(record[attachmentFileIdField_(field)] || '').trim();
  var storedId = isCustomsOffice ? '' : recordAttachmentFileId_(record, field);
  if (rawId && !extractDriveId_(rawId)) throw new Error('معرف المرفق المحفوظ غير صالح؛ يلزم مراجعة السجل.');
  if (storedId) {
    var existing = resolveDriveFile_(storedId);
    if (!existing) throw new Error('تعذر الوصول إلى الملف بمعرف Drive المحفوظ. تحقق من وجوده وصلاحية حساب التطبيق.');
    return existing;
  }
  var ref = String(record[field] == null ? record[String(field).toLowerCase()] || '' : record[field]).trim();
  if (!ref) throw new Error('لا يوجد مرفق في الحقل المحدد.');
  var folderName = attachmentReferenceFolder_(target, field, ref);
  if (!folderName) throw new Error('مسار المرفق ليس ضمن مجلدات هذا الجدول المسموح بها.');
  var fileId = findAttachmentFileIdAcrossFolders_(target, field, ref);
  if (!fileId) throw new Error('الملف غير موجود أو مكرر داخل مجلد المرفقات المحدد.');
  var file = resolveDriveFile_(fileId);
  if (!file) throw new Error('تعذر قراءة المرفق. تحقق من صلاحيات حساب التطبيق على الملف.');
  return file;
}
function attachmentRegistry_() {
  var TC = '3fe1b5cb67b7223e';
  var VF = '9940659bd83035d7';
  return {
    'tc_products': { company: TC, sheet: 'products', idField: 'id', fileFields: ['print_file'], folder: 'products_Files_' },
    'tc_registration_papers': { company: TC, sheet: 'registration_papers', idField: 'document_number', fileFields: ['document_file'], folder: 'registration_papers 2_Files_', legacyFolders: ['registration_papers_Files_', 'registration_papers_Images', 'registration_papers 2_Images'], folderAliases: { 'registration_papers_Files_': 'registration_papers 2_Files_' } },
    'tc_carton_sizes': { company: TC, sheet: 'purchasing_support_data', idField: 'id', fileFields: ['document'], folder: 'purchasing_support_data_Images' },
    'tc_import_follow': { company: TC, sheet: 'legal_importation_follow', idField: 'id', fileFields: ['porforma_file', 'swift_file', 'approval_1', 'approval_2', 'approval_3'], folder: 'legal_importation_follow_Files_', folderByField: { approval_1: 'legal_importation_follow_Images', approval_2: 'legal_importation_follow_Images', approval_3: 'legal_importation_follow_Images' } },
    'tc_budget_inputs': { company: TC, sheet: 'legal_purchasing_costing', idField: 'رقم الشهاده', fileFields: ['invoice_swift'], folder: 'legal_purchasing_costing_Files_', altSheets: [{ sheet: 'legal_product_purchasing', idField: 'كود المعاملة', fileFields: ['شهادة_تحليل_ان_وجد', 'ترخيص_بالافراج_الزراعي', 'صورة الافراج', 'صورة التسجيل'], folder: 'legal_product_purchasing_Files_' }] },
    'tc_budget_manufacture': { company: TC, sheet: 'legal_manufacture', idField: 'transaction_code', fileFields: ['analysis_certificate', 'sales_permit', 'technical_permit', 'registration'], folder: 'legal_manufacture_Files_', folderByField: { analysis_certificate: 'manufacture_Images', sales_permit: 'manufacture_Images', technical_permit: 'manufacture_Images' } },
    'tc_customs_office': { company: TC, sheet: 'مكتب الجمارك', idField: '', fileFields: ['تكليف المطالبة', 'تخليص الشحنة'], folder: 'customs_office_Files_', legacyFolders: ['مكتب الجماركFiles'], folderByField: { 'تكليف المطالبة': 'customs_office_Files_', 'تخليص الشحنة': 'customs_office_Files_', claim_assignment: 'customs_office_Files_', shipment_clearance: 'customs_office_Files_' } },
    'vf_hr_deductions': { company: VF, sheet: 'valley_emp_deductions', idField: 'unique_id', fileFields: ['deduction_attachement'], folder: 'valley_emp_deductions_Files_' },
    'vf_hr_overtime': { company: VF, sheet: 'valley_emp_overtime', idField: 'unique_id', fileFields: ['overtime_attachement'], folder: 'valley_emp_overtime_Files_' },
    'vf_hr_vacations': { company: VF, sheet: 'valley_employee_vacations', idField: 'unique_id', fileFields: ['attachment'], folder: 'valley_employee_vacations_Files_' }
  };
}
function ensureAttachmentColumn_(dbId, sheetName, fileIdField) {
  try {
    var sheet = getSheet_(sheetName, dbId);
    var headers = getHeaders_(sheet);
    var want = String(fileIdField || '').trim().toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === want) return false;
    }
    sheet.getRange(1, headers.length + 1).setValue(fileIdField);
    try { noteMutation_(sheet); } catch (e) {}
    return true;
  } catch (e) { return false; }
}
function extractDriveId_(v) {
  var raw = String(v || '').trim();
  if (!raw) return '';
  var m = raw.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) return raw;
  return '';
}
function recordAttachmentFileId_(record, fileField) {
  if (!record) return '';
  var idField = attachmentFileIdField_(fileField);
  var cand = record[idField] != null ? String(record[idField]).trim() : '';
  if (!cand) cand = record[String(idField).toLowerCase()] != null ? String(record[String(idField).toLowerCase()]).trim() : '';
  var id = extractDriveId_(cand);
  if (id) return id;
  var ref = record[fileField] != null ? String(record[fileField]).trim() : '';
  if (!ref) ref = record[String(fileField).toLowerCase()] != null ? String(record[String(fileField).toLowerCase()]).trim() : '';
  return extractDriveId_(ref);
}
function attachmentAuthorizedStoredId_(dbId, sheetName, source, fileField, candidateId) {
  var ref = source && source[fileField] != null ? String(source[fileField]).trim() : '';
  var candidate = extractDriveId_(candidateId);
  if (!ref || !candidate) return '';
  try {
    var rows = getAllRecords_(dbId, sheetName) || [], matches = [];
    rows.forEach(function (row) {
      var storedRef = row[fileField] != null ? String(row[fileField]).trim() : '';
      if (!storedRef) storedRef = row[String(fileField).toLowerCase()] != null ? String(row[String(fileField).toLowerCase()]).trim() : '';
      if (storedRef === ref && recordAttachmentFileId_(row, fileField) === candidate) matches.push(row);
    });
    return matches.length === 1 ? candidate : '';
  } catch (e) { return ''; }
}
function findAttachmentRecord_(allRows, idField, idValue, fileFields, refValue) {
  var idStr = String(idValue == null ? '' : idValue).trim();
  if (idStr) {
    var idMatches = [];
    for (var i = 0; i < allRows.length; i++) {
      var r = allRows[i];
      var v = r[idField] != null ? r[idField] : r[String(idField).toLowerCase()];
      if (v == null) continue;
      if (String(v).trim() === idStr || (!isNaN(Number(v)) && !isNaN(Number(idStr)) && Number(v) === Number(idStr))) idMatches.push(r);
    }
    if (idMatches.length === 1) return { record: idMatches[0], fileField: '' };
    if (idMatches.length > 1) {
      /* Duplicate keys allowed (e.g. registration_papers reuses document_number
         and only the date changes): disambiguate by the owning document_file path. */
      var refForId = String(refValue == null ? '' : refValue).trim();
      if (refForId) {
        var owned = [];
        for (var oi = 0; oi < idMatches.length; oi++) {
          var orow = idMatches[oi];
          for (var ok = 0; ok < fileFields.length; ok++) {
            var off = fileFields[ok];
            var ofv = orow[off] != null ? String(orow[off]).trim() : '';
            if (!ofv) ofv = orow[String(off).toLowerCase()] != null ? String(orow[String(off).toLowerCase()]).trim() : '';
            if (ofv === refForId) { owned.push({ record: orow, fileField: off }); break; }
          }
        }
        if (owned.length === 1) return owned[0];
        if (owned.length === 0) return null;
        return { ambiguous: true, count: owned.length };
      }
      return { ambiguous: true, count: idMatches.length };
    }
    /* An explicit record key is authoritative; never fall back to another row. */
    return null;
  }
  var ref = String(refValue == null ? '' : refValue).trim();
  if (ref) {
    var matches = [];
    for (var j = 0; j < allRows.length; j++) {
      var row = allRows[j];
      for (var k = 0; k < fileFields.length; k++) {
        var ff = fileFields[k];
        var fv = row[ff] != null ? String(row[ff]).trim() : '';
        if (!fv) fv = row[String(ff).toLowerCase()] != null ? String(row[String(ff).toLowerCase()]).trim() : '';
        if (fv === ref) matches.push({ record: row, fileField: ff });
      }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return { ambiguous: true, count: matches.length };
  }
  return null;
}
function serveAttachment_(params) {
  params = params || {};
  var token = String(params.sessionToken || '').trim();
  var auth = token ? authenticateSystemUser_(token) : { authorized: false };
  if (!auth.authorized) {
    return _frame(HtmlService.createHtmlOutput(
      _topNavScript(ScriptApp.getService().getUrl() + '?action=login')
    )).setTitle('تسجيل الدخول');
  }
  var registry = attachmentRegistry_();
  var page = String(params.page || '').trim();
  var cfg = registry[page] || null;
  var refParam = String(params.ref || params.file || '').trim();
  if (page && !cfg) return ContentService.createTextOutput('Attachment page not found');
  if (!cfg && refParam) {
    var inferred = [];
    Object.keys(registry).forEach(function (key) {
      if (attachmentTargets_(registry[key]).some(function (target) { return attachmentTargetMatchesRef_(target, refParam); })) inferred.push(key);
    });
    if (inferred.length !== 1) return ContentService.createTextOutput('تعذر تحديد صفحة المرفق؛ افتحه من السجل الأصلي.');
    page = inferred[0]; cfg = registry[page];
  }
  if (!cfg) return ContentService.createTextOutput('Not found');
  var artifact;
  try {
    artifact = authorizeArtifact_(params, { company: cfg.company, page: page, access: 'read' });
  } catch (e) {
    return ContentService.createTextOutput(e && e.message ? e.message : 'غير مصرح');
  }
  var company = artifact.company;
  var sheetName = String(params.sheet || '').trim() || cfg.sheet;
  if (!params.sheet && refParam) {
    var matchingTargets = attachmentTargets_(cfg).filter(function (target) { return attachmentTargetMatchesRef_(target, refParam); });
    if (matchingTargets.length > 1) return ContentService.createTextOutput('Attachment table is ambiguous');
    if (matchingTargets.length === 1) sheetName = matchingTargets[0].sheet;
  }
  var selectedTarget = attachmentTargets_(cfg).filter(function (target) { return target.sheet === sheetName; })[0];
  var allowedSheets = [cfg.sheet];
  var fileFields = cfg.fileFields.slice();
  var idField = cfg.idField;
  if (cfg.altSheets) {
    for (var s = 0; s < cfg.altSheets.length; s++) allowedSheets.push(cfg.altSheets[s].sheet);
    for (var a = 0; a < cfg.altSheets.length; a++) {
      if (cfg.altSheets[a].sheet === sheetName) {
        fileFields = cfg.altSheets[a].fileFields.slice();
        idField = cfg.altSheets[a].idField;
        break;
      }
    }
  }
  if (allowedSheets.indexOf(sheetName) === -1) return ContentService.createTextOutput('Not found');
  var fieldParam = String(params.field || '').trim();
  if (fieldParam) {
    var ok = false;
    for (var f = 0; f < fileFields.length; f++) {
      if (fileFields[f] === fieldParam || String(fileFields[f]).toLowerCase() === fieldParam.toLowerCase()) { ok = true; break; }
    }
    if (!ok) return ContentService.createTextOutput('Not found');
    fileFields = [fileFields[f]];
  }
  var dbId;
  try { dbId = getCompanySpreadsheetId_(company); }
  catch (e) { return ContentService.createTextOutput('Not found'); }
  var rows;
  try { rows = getAllRecords_(dbId, sheetName); }
  catch (e) { return ContentService.createTextOutput('Not found'); }
  var idParam = String(params.id || params.document_number || params.unique_id || '').trim();
  var found = findAttachmentRecord_(rows, idField, idParam, fileFields, refParam);
  if (!found) return ContentService.createTextOutput(idParam ? 'Attachment record not found' : 'Attachment reference not found');
  if (found.ambiguous) return ContentService.createTextOutput('Attachment reference is ambiguous; open it from the record that owns it.');
  var rec = found.record;
  var fieldsToTry = found.fileField ? [found.fileField] : fileFields;
  if (idParam && refParam) {
    var refMatches = [];
    fieldsToTry.forEach(function (ff) {
      var raw = rec[ff] != null ? String(rec[ff]).trim() : '';
      if (!raw) raw = rec[String(ff).toLowerCase()] != null ? String(rec[String(ff).toLowerCase()]).trim() : '';
      if (raw === refParam) refMatches.push(ff);
    });
    if (refMatches.length !== 1) return ContentService.createTextOutput('Attachment reference does not belong to this record/field');
    fieldsToTry = [refMatches[0]];
  }
  fieldsToTry = fieldsToTry.filter(function (field) {
    return recordAttachmentFileId_(rec, field) || String(rec[field] || rec[String(field).toLowerCase()] || '').trim();
  });
  if (fieldsToTry.length !== 1) return ContentService.createTextOutput('حدد المرفق المطلوب من السجل.');
  var usedField = fieldsToTry[0], file;
  try { file = attachmentOpenFile_(rec, usedField, selectedTarget); }
  catch (e) { return ContentService.createTextOutput(e.message || 'تعذر فتح المرفق.'); }
  var blob;
  try { blob = file.getBlob(); }
  catch (e) { return ContentService.createTextOutput('File not found by immutable ID'); }
  var fname = '';
  try { fname = file.getName(); } catch (e) { fname = String(usedField || 'attachment'); }
  var ctype = '';
  try { ctype = String(blob.getContentType() || '').toLowerCase(); } catch (e) {}
  if (ctype.indexOf('image/') === 0 || ctype === 'application/pdf' || /\.pdf$/i.test(fname)) {
    return attachmentPreviewHtml_(fname, blob);
  }
  return dataUriDownloadHtml_(fname, blob);
}
function serveDocFile_(params) { return serveAttachment_(params); }

function findDriveFolderIdByName_(folderName) {
  try {
    var it = DriveApp.getFoldersByName(folderName);
    var ids = []; while (it && it.hasNext()) ids.push(it.next().getId());
    if (ids.length === 1) return ids[0];
    if (ids.length > 1) return '';
  } catch (e) {}
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
      var q = "name = '" + String(folderName).replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
      var res = Drive.Files.list({ q: q, fields: 'files(id)' });
      if (res && res.files && res.files.length === 1) return res.files[0].id;
    }
  } catch (e) {}
  return '';
}
function findDriveFileIdInFolder_(folderId, fileName) {
  var name = String(fileName || '').trim();
  if (!name || !folderId) return '';
  try {
    var folder = DriveApp.getFolderById(folderId);
    var it = folder.getFilesByName(name);
    var ids = []; while (it && it.hasNext()) ids.push(it.next().getId());
    if (ids.length === 1) return ids[0];
    if (ids.length > 1) return '';
  } catch (e) {}
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
      var q = "name = '" + name.replace(/'/g, "\\'") + "' and '" + folderId + "' in parents and trashed = false";
      var res = Drive.Files.list({ q: q, fields: 'files(id,name)' });
      if (res && res.files && res.files.length === 1) return res.files[0].id;
    }
  } catch (e) {}
  return '';
}
/* Folder-scoped upload recovery: find the one file tagged with a request ID
 * (Drive appProperties, private to this app — nothing is made public). Never a
 * global or filename-only search: the query is confined to one trusted folder.
 * Returns {id, name} on exactly one hit, null when missing or ambiguous. */
function findDriveFileByRequestId_(folderId, requestId) {
  var rid = String(requestId || '').trim();
  if (!folderId || !/^[A-Za-z0-9_-]{16,100}$/.test(rid)) return null;
  var q = "appProperties has {key='erpRequestId' and value='" + rid + "'} and '" +
    String(folderId).replace(/'/g, "\\'") + "' in parents and trashed = false";
  function pick(files) {
    if (files && files.length === 1 && files[0] && files[0].id) {
      return { id: String(files[0].id), name: String(files[0].name || '') };
    }
    return null;
  }
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
      var res = Drive.Files.list({ q: q, fields: 'files(id,name)', pageSize: 10 });
      if (res && res.files) {
        if (res.files.length === 1) return pick(res.files);
        if (res.files.length > 1) return null;
      }
    }
  } catch (e) {}
  try {
    var token = ScriptApp.getOAuthToken();
    var url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=files(id,name)&pageSize=10';
    var fetched = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (fetched.getResponseCode() === 200) {
      var data = JSON.parse(fetched.getContentText());
      if (data && data.files) {
        if (data.files.length === 1) return pick(data.files);
        if (data.files.length > 1) return null;
      }
    }
  } catch (e2) {}
  return null;
}
/**
 * One-time backfill: folder/filename -> Drive file ID for all attachment sheets.
 * Run manually (superAdmin) or via company_action. Params: {dryRun:true, page:<optional>}.
 * Resolves each stored ref basename inside its expected Drive folder(s) and writes
 * <file>_id columns. Never does global filename search — folder-constrained only.
 */
/** Resolve a stored AppSheet path only within folders allowed for this field. */
function attachmentReferenceFolder_(target, field, reference) {
  var preferred = (target.folderByField && target.folderByField[field]) || target.folder;
  var parts = String(reference || '').trim().split('/');
  if (parts.length === 1) return parts[0] && parts[0] !== '.' && parts[0] !== '..' ? preferred : '';
  if (parts.length !== 2 || !parts[1] || parts[1] === '.' || parts[1] === '..') return '';
  var allowed = attachmentFoldersForField_(target, field);
  if (allowed.indexOf(parts[0]) === -1) return '';
  // Some AppSheet references retain an old name after the Drive folder was renamed.
  var physicalFolder = (target.folderAliases && target.folderAliases[parts[0]]) || parts[0];
  return allowed.indexOf(physicalFolder) !== -1 ? physicalFolder : '';
}
function backfillAttachmentIds_(payload, sessionToken, authUser) {
  payload = payload || {};
  var user = authUser || null;
  if (!user && sessionToken) { try { var a = authenticateSystemUser_(String(sessionToken).trim()); if (a && a.authorized) user = a.user; } catch (e) {} }
  if (!(user && user.isSuperAdmin)) throw new Error('صلاحية غير كافية؛ يلزم تشغيل الترحيل من جلسة مدير النظام المصادق عليها.');
  var dryRun = !(payload.dryRun === false || String(payload.dryRun).toLowerCase() === 'false');
  var onlyPage = String(payload.page || '').trim();
  var onlyReference = String(payload.reference || '').trim();
  if (onlyReference && !onlyPage) throw new Error('A page is required for a targeted attachment repair.');
  var offset = Math.max(0, Number(payload.offset) || 0), limit = Math.max(1, Math.min(500, Number(payload.limit) || 500));
  var registry = attachmentRegistry_(), summary = { dryRun: dryRun, reference: onlyReference, offset: offset, limit: limit, pages: {} };
  var pages = Object.keys(registry); if (onlyPage) pages = pages.filter(function (p) { return p === onlyPage; });
  pages.forEach(function (page) {
    var cfg = registry[page], targets = [{ sheet: cfg.sheet, idField: cfg.idField, fileFields: cfg.fileFields, folder: cfg.folder, folderByField: cfg.folderByField || {}, legacyFolders: cfg.legacyFolders || [], folderAliases: cfg.folderAliases || {} }];
    if (cfg.altSheets) cfg.altSheets.forEach(function (alt) { targets.push({ sheet: alt.sheet, idField: alt.idField, fileFields: alt.fileFields, folder: alt.folder, folderByField: alt.folderByField || {}, legacyFolders: alt.legacyFolders || [], folderAliases: alt.folderAliases || {} }); });
    var extraFolders = []; if (page === 'tc_import_follow') extraFolders.push('legal_importation_follow_Images'); if (page === 'tc_budget_manufacture') extraFolders.push('manufacture_Images');
    targets.forEach(function (t) {
      var key = page + '/' + t.sheet, stat = { sheet: t.sheet, total: 0, alreadyHaveId: 0, inlineId: 0, wouldUpdate: 0, updated: 0, missing: 0, invalidExistingIds: 0, conflicts: 0, errors: [], unresolved: [], missingIdColumns: [], nextOffset: null };
      try {
        var dbId = getCompanySpreadsheetId_(cfg.company), sheet = getSheet_(t.sheet, dbId), headers = getHeaders_(sheet).map(function (h) { return String(h || '').trim(); });
        var lower = headers.map(function (h) { return h.toLowerCase(); }), colIdx = {}; lower.forEach(function (h, i) { if (h) colIdx[h] = i; });
        t.fileFields.forEach(function (ff) { var idName = attachmentFileIdField_(ff), want = idName.toLowerCase(); if (lower.indexOf(want) === -1) stat.missingIdColumns.push(idName); });
        var folders = []; t.fileFields.forEach(function (ff) { folders = folders.concat(attachmentFoldersForField_(t, ff)); }); folders = folders.filter(function (folder, i) { return folders.indexOf(folder) === i; }); var folderIds = {}; folders.forEach(function (fn) { folderIds[fn] = findDriveFolderIdByName_(fn); });
        var values = sheet.getDataRange().getValues(), updates = [], startRow = 1 + offset, endRow = Math.min(values.length, startRow + limit);
        for (var r = startRow; r < endRow; r++) {
          stat.total++;
          for (var f = 0; f < t.fileFields.length; f++) {
            var ff = t.fileFields[f], ffLow = ff.toLowerCase(), idLow = attachmentFileIdField_(ff).toLowerCase();
            if (!(ffLow in colIdx)) { stat.errors.push('row ' + (r + 1) + ' field ' + ff + ': source column missing'); continue; }
            var ref = String(values[r][colIdx[ffLow]] == null ? '' : values[r][colIdx[ffLow]]).trim(); if (!ref || (onlyReference && ref !== onlyReference)) continue;
            var existing = idLow in colIdx ? String(values[r][colIdx[idLow]] == null ? '' : values[r][colIdx[idLow]]).trim() : '';
            if (extractDriveId_(existing)) { stat.alreadyHaveId++; continue; }
            if (existing) stat.invalidExistingIds++;
            if (extractDriveId_(ref)) { stat.inlineId++; continue; }
            var base = ref.split('/').pop(), expectedFolder = attachmentReferenceFolder_(t, ff, ref), foundId = '', ambiguousScope = false;
            if (!expectedFolder) { stat.missing++; stat.unresolved.push({ row: r + 1, field: ff, reference: ref, reason: 'stored reference folder does not match trusted field folder' }); continue; }
            var expectedFolderId = folderIds[expectedFolder];
            if (!expectedFolderId) ambiguousScope = true;
            else foundId = findDriveFileIdInFolder_(expectedFolderId, base);
            if (!foundId) { stat.missing++; stat.unresolved.push({ row: r + 1, field: ff, reference: ref, reason: ambiguousScope ? 'expected folder missing or ambiguous, or filename missing/ambiguous' : 'filename not found in expected folder' }); continue; }
            stat.wouldUpdate++;
            if (idLow in colIdx) updates.push({ row: r + 1, col: colIdx[idLow] + 1, id: foundId, expected: existing, sourceCol: colIdx[ffLow], sourceRef: ref, keyCol: colIdx[String(t.idField || '').toLowerCase()], keyValue: String(values[r][colIdx[String(t.idField || '').toLowerCase()]] == null ? '' : values[r][colIdx[String(t.idField || '').toLowerCase()]]).trim() });
          }
        }
        if (!dryRun && stat.missingIdColumns.length) {
          stat.missingIdColumns.forEach(function (idName) { sheet.getRange(1, headers.length + 1).setValue(idName); headers.push(idName); lower.push(idName.toLowerCase()); colIdx[idName.toLowerCase()] = headers.length - 1; try { noteMutation_(sheet); } catch (e) {} });
          updates = [];
          for (var rr = startRow; rr < endRow; rr++) for (var f2 = 0; f2 < t.fileFields.length; f2++) {
            var field2 = t.fileFields[f2], source2 = String(values[rr][colIdx[field2.toLowerCase()]] == null ? '' : values[rr][colIdx[field2.toLowerCase()]]).trim(), id2 = attachmentFileIdField_(field2).toLowerCase();
            if (!source2 || (onlyReference && source2 !== onlyReference) || extractDriveId_(source2) || extractDriveId_(String(values[rr][colIdx[id2]] || ''))) continue;
            var found2 = '', base2 = source2.split('/').pop(), expectedFolder2 = attachmentReferenceFolder_(t, field2, source2);
            if (!expectedFolder2) continue;
            if (folderIds[expectedFolder2]) found2 = findDriveFileIdInFolder_(folderIds[expectedFolder2], base2);
            if (found2) updates.push({ row: rr + 1, col: colIdx[id2] + 1, id: found2, expected: '', sourceCol: colIdx[field2.toLowerCase()], sourceRef: source2, keyCol: colIdx[String(t.idField || '').toLowerCase()], keyValue: String(values[rr][colIdx[String(t.idField || '').toLowerCase()]] == null ? '' : values[rr][colIdx[String(t.idField || '').toLowerCase()]]).trim() });
          }
        }
        if (!dryRun) updates.forEach(function (u) { try { var rowNow = sheet.getRange(u.row, 1, 1, headers.length).getValues()[0]; var current = String(rowNow[u.col - 1] == null ? '' : rowNow[u.col - 1]).trim(); var sourceNow = String(rowNow[u.sourceCol] == null ? '' : rowNow[u.sourceCol]).trim(); var keyNow = u.keyCol != null ? String(rowNow[u.keyCol] == null ? '' : rowNow[u.keyCol]).trim() : ''; if ((current && current !== u.expected) || sourceNow !== u.sourceRef || (u.keyValue != null && keyNow !== u.keyValue)) { stat.conflicts++; return; } sheet.getRange(u.row, u.col).setValue(u.id); stat.updated++; } catch (e) { stat.errors.push('row ' + u.row + ': ' + String(e && e.message || e)); } });
        if (!dryRun && stat.updated) { try { noteMutation_(sheet); } catch (e) {} }
        stat.nextOffset = endRow < values.length ? endRow - 1 : null;
      } catch (e) { stat.errors.push(String(e && e.message || e)); }
      summary.pages[key] = stat;
    });
  });
  return { status: 'success', summary: summary };
}
/**
 * Customs-office attachment path correction (sheet `مكتب الجمارك` only).
 * Scope: columns `تكليف المطالبة` and `تخليص الشحنة` only. Replaces only the
 * complete leading folder prefix before the slash:
 *   `مكتب الجمارك_Images/` -> `customs_office_Files_/`
 *   `مكتب الجمارك_Files_/`  -> `customs_office_Files_/`
 * Filenames are preserved byte-for-byte (no trimming inside the name, no extra
 * space, never the literal `&#x20;`). Values already starting with
 * `customs_office_Files_/` are left unchanged. URLs, Drive IDs, formulas,
 * blanks, malformed paths and unknown folder prefixes are never rewritten.
 * Params: {dryRun:true|false, offset:0, limit:<=500, backupSheet:<optional>}.
 * Dry-run (default) performs zero sheet writes. Apply path first verifies the
 * physical files exist in `customs_office_Files_`, captures a recoverable
 * backup sheet, then applies a bounded idempotent batch under script lock.
 */
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
/** Preview page for image/pdf: inline view + download button. */
function attachmentPreviewHtml_(fileName, blob) {
  const b64 = Utilities.base64Encode(blob.getBytes());
  const contentType = blob.getContentType() || 'application/octet-stream';
  const safeName = fileName.replace(/["'<>\\/]/g, '_');
  const esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  const isImage = contentType.toLowerCase().indexOf('image/') === 0;
  const viewer = isImage
    ? '<img src="data:' + contentType + ';base64,' + b64 + '" alt="' + esc(fileName) + '" style="max-width:100%;max-height:82vh;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12)">'
    : '<iframe src="data:' + contentType + ';base64,' + b64 + '" style="width:100%;height:82vh;border:1px solid #e5e7eb;border-radius:8px" title="' + esc(fileName) + '"></iframe>';
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(fileName) + '</title></head>' +
    '<body style="margin:0;font-family:sans-serif;background:#f3f4f6;">' +
    '<div style="position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<span style="flex:1;font-weight:700;font-size:14px;word-break:break-all;">' + esc(fileName) + '</span>' +
      '<a id="dl" href="data:' + contentType + ';base64,' + b64 + '" download="' + safeName + '" style="padding:8px 16px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">⬇ تحميل</a>' +
    '</div>' +
    '<div style="padding:16px;display:flex;justify-content:center;align-items:flex-start;min-height:60vh;">' + viewer + '</div>' +
    '</body></html>'
  )).setTitle(fileName);
}

/** Shared data-URI download page for Drive files. */
function dataUriDownloadHtml_(fileName, blob) {
  const b64 = Utilities.base64Encode(blob.getBytes());
  const contentType = blob.getContentType() || 'application/octet-stream';
  const safeName = fileName.replace(/["'<>\\/]/g, '_');
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تحميل الملف</title></head>' +
    '<body style="font-family:sans-serif;text-align:center;padding:24px;">' +
    '<h3>جاري تحميل الملف...</h3>' +
    '<p style="color:#555;">إذا لم يبدأ التحميل تلقائياً، <a id="dl" href="#" style="color:#16a34a;font-weight:bold;">اضغط هنا للتحميل</a></p>' +
    '<script>' +
    'var a=document.createElement("a");' +
    'a.href="data:' + contentType + ';base64,' + b64 + '";' +
    'a.download="' + safeName + '";' +
    'document.body.appendChild(a);a.click();' +
    'document.getElementById("dl").href=a.href;' +
    '</script></body></html>'
  )).setTitle(fileName);
}

/* Batch 11 — Phase 6: prune expired sessions from the AUTH ERP_Sessions sheet. */
function cleanupOldSessions_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  var removed = 0;
  if (systemStorageTarget_().backend === 'firestore') {
    try {
      systemGetAllRecords_('ERP_Sessions').forEach(function (s) {
        var exp = s.expires_at ? new Date(s.expires_at) : null;
        if (exp && !isNaN(exp.getTime()) && Date.now() > exp.getTime() && s._meta) {
          if (systemRemoveRecord_('ERP_Sessions', s._meta.documentId, { expectedUpdateTime: s._meta.updateTime })) removed++;
        }
      });
      return { status: 'success', data: { removed: removed } };
    } catch (e) { return { status: 'error', message: e.message }; }
  }
  try {
    // Phase 5 (F-14). This used to call deleteRowsByCriteria_ once PER expired
    // session, and each of those does a full getDataRange().getValues() plus a
    // structural deleteRow — so cleaning N sessions cost N full reads of
    // ERP_Sessions. Now: one read, then delete the matching rows bottom-up in a
    // single pass. deleteRow is kept (rather than a bulk body rewrite) because
    // it is safe against a concurrent login appending a row.
    var sheet = getSheet_('ERP_Sessions', CONFIG.AUTH_SPREADSHEET_ID);
    var headers = getHeaders_(sheet);
    var expIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'expires_at'; });
    if (expIdx === -1) return { status: 'error', message: 'ERP_Sessions is missing expires_at' };
    var now = Date.now();
    executeWithLock_(function () {
      var data = sheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        var raw = data[i][expIdx];
        if (raw === '' || raw === null || raw === undefined) continue;
        var exp = (raw instanceof Date) ? raw : new Date(raw);
        if (!isNaN(exp.getTime()) && now > exp.getTime()) {
          sheet.deleteRow(i + 1);
          noteMutation_(sheet);
          removed++;
        }
      }
    });
  } catch (e) {
    return { status: 'error', message: e.message };
  }
  return { status: 'success', data: { removed: removed } };
}

/* Batch 11 — Phase 6: install a daily time-driven trigger that prunes expired
 * sessions, plus the installable onEdit trigger on the AUTH spreadsheet.
 * Safe to call repeatedly (removes any prior instance of each first). */
function installTriggers_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'cleanupOldSessions_' || h === 'dailyCsvBackup' || h === 'onAuthSheetEdit') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  ScriptApp.newTrigger('cleanupOldSessions_').timeBased().everyDays(1).atHour(3).create();
  try {
    // 01:00 local, deliberately outside working hours: dailyCsvBackup reads every
    // sheet of every company spreadsheet in full and is visible to users if it
    // runs mid-day. (Was 07:00, which is inside the working day in Cairo.)
    ScriptApp.newTrigger('dailyCsvBackup').timeBased().everyDays(1).atHour(1).create();
  } catch (e) {}
  try {
    // The INSTALLABLE onEdit on the AUTH spreadsheet. The simple onEdit(e) in
    // 02_DataAccess.js never fires — this is a standalone script and simple
    // triggers only run in container-bound projects — so without this trigger a
    // change typed directly into ERP_Users / ERP_Pages_Matrix / ERP_system_work
    // is caught only by the AUTH_STALENESS_CEILING_SECONDS bucket.
    // Its own try/catch: this trigger needs a spreadsheet scope the others do
    // not, and a scope failure here must not take down the installs above.
    if (systemStorageTarget_().backend === 'sheets') ScriptApp.newTrigger('onAuthSheetEdit')
      .forSpreadsheet(CONFIG.AUTH_SPREADSHEET_ID).onEdit().create();
  } catch (e) {
    try { console.error('installTriggers_: onAuthSheetEdit not created — ' + e.message); } catch (e2) {}
  }
  /* [RT-10 / RT-11] The two one-minute drains, and the weekly rollup.
   *
   * Until these exist the telemetry buffer and the audit queue both FILL AND
   * NEVER EMPTY. The telemetry buffer expires on its own, so the cost there is
   * a lost measurement. The audit queue is a SHEET and does not expire, so
   * without its drain it grows silently — which is why this is on the owner
   * checklist in plain words rather than as an implementation detail.
   *
   * They share the same shape as the daily triggers above: removed first so a
   * second install cannot double them up, then created. */
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'drainPerfBuffer_' || h === 'drainHistoryQueue_' ||
        h === 'rollupPerfWeekly_' || h === 'prunePerfLog_') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  try { ScriptApp.newTrigger('drainPerfBuffer_').timeBased().everyMinutes(1).create(); } catch (e) {
    try { console.error('installTriggers_: drainPerfBuffer_ not created — ' + e.message); } catch (e2) {}
  }
  try { ScriptApp.newTrigger('drainHistoryQueue_').timeBased().everyMinutes(1).create(); } catch (e) {
    try { console.error('installTriggers_: drainHistoryQueue_ not created — ' + e.message); } catch (e2) {}
  }
  /* Weekly, and the pruning with it: both read the raw log, and running them
   * together keeps that read to one a week. */
  try { ScriptApp.newTrigger('rollupPerfWeekly_').timeBased().everyDays(1).atHour(2).create(); } catch (e) {}
  try { ScriptApp.newTrigger('prunePerfLog_').timeBased().everyDays(1).atHour(2).create(); } catch (e) {}

  return { status: 'success', message: 'تم تثبيت المؤقتات اليومية والدقيقية' };
}

/* Migration batch functions (batch0_preflight, batch1_createSystemSheets, …)
 * live in 06_Migration.js and can be invoked from the Apps Script editor or
 * via clasp. The temporary unauthenticated run_migration web route was removed
 * after migrations completed. */


function _frame(html) {
  return html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Safe top-frame navigation script. Tries window.top.location (so the address
 *  bar reflects ?action=...); falls back to the iframe if the sandbox blocks it. */
function _topNavScript(url) {
  return '<script>try{window.top.location.href=' + JSON.stringify(url) + '}catch(e){window.location.href=' + JSON.stringify(url) + '}</' + 'script>';
}

/* v@496 sync marker — forces clasp to re-upload Code.js after a transient
 * server-side corruption reported a stale SyntaxError. */
