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
    if (!checkPageAccessForUI_(authUser, action)) {
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
    logSystemAction_(request, authUser, result, status, errorMessage, startTime);
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
  return company.dispatch(payload, authUser, dbId);
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
    if (!checkPageAccessForUI_(user, action)) {
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
  if (!product || !product.print_file) return ContentService.createTextOutput('Not found');

  const fileId = String(product.print_file).trim();
  if (!fileId) return ContentService.createTextOutput('Not found');

  const file = resolveDriveFile_(fileId);
  if (!file) return ContentService.createTextOutput('File not found by immutable ID');

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
 * Generic attachment viewer (image/pdf preview + download). Used by
 * tc_registration_papers (document_file) and vf_hr_overtime (overtime_attachement)
 * and any future folder/file reference. Auth + resolve same as legacy doc_file.
 * Params: download=attachment (or legacy doc_file), ref=<folder/file>, sessionToken
 */
function serveAttachment_(params) {
  const token = String(params.sessionToken || '').trim();
  const auth = token ? authenticateSystemUser_(token) : { authorized: false };
  if (!auth.authorized) {
    return _frame(HtmlService.createHtmlOutput(
      _topNavScript(ScriptApp.getService().getUrl() + '?action=login')
    )).setTitle('تسجيل الدخول');
  }
  /* Existing callers provide a filename/path, not a record-bound immutable
   * Drive ID. Without a schema-backed association, guessing a deployer-owned
   * filename is unsafe. Keep the path disabled rather than resolving globally. */
  return ContentService.createTextOutput('Attachment download is temporarily unavailable pending an immutable record/file association.');
}
function serveDocFile_(params) { return serveAttachment_(params); }

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

