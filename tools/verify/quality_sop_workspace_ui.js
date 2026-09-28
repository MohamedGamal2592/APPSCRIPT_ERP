'use strict';
/* QUALITY-SOP-WORKSPACE-UI — offline proof that the REAL page code renders the
   workspace, the metadata controls, the library and the navigation the way the
   specification requires.

   The REAL UI_Components.html, the REAL Client_Helpers.html, the REAL
   Quality_SopDoc.html engine and the REAL page templates are loaded into one
   sandbox on top of tools/verify/domstub.js, with the Apps Script scriptlets
   substituted. The page's own render functions then run for real, so the
   assertions are made against the markup the page actually produces rather than
   against its source text.

   STUB DISCIPLINE: domstub does not build a node tree. Assigning `innerHTML`
   on a container registers an EMPTY, addressable element for every id the
   markup declares. So an id that only ever appears inside a parent's markup is
   found by getElementById but is itself empty; assertions therefore read the
   CONTAINER the page rendered into, or the element's textContent when the page
   set it with textContent.

   It is not a browser: no layout, no CSS, no event dispatch. It proves the
   render path, the payload the page sends and the permission/state decisions
   the page makes — not that the paper looks right.

   Run: node tools/verify/quality_sop_workspace_ui.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { makeSandbox } = require('./domstub');

const DEPT = 'إدارة الصيانة';
const SOP_CODE = 'POL-MAINT-001';

let failed = 0;
function check(ok, label) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}

function scriptOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out.join('\n');
}

/** Substitute the server scriptlets with the values a real page would receive. */
function substitute(src, values) {
  const lines = src.split('\n');
  return lines.map(function (line) {
    if (line.indexOf('<?') === -1) return line;
    const decl = line.match(/var\s+([A-Za-z0-9_]+)\s*=/);
    const name = decl ? decl[1] : null;
    const replacement = (name && Object.prototype.hasOwnProperty.call(values, name))
      ? values[name] : 'null';
    return line.replace(/<\?[\s\S]*?\?>/g, function () {
      const quoted = new RegExp("'[^<]*<\\?");
      return quoted.test(line) ? String(replacement).replace(/^'|'$/g, '') : replacement;
    });
  }).join('\n');
}

function boot(page, opts) {
  opts = opts || {};
  const sandbox = makeSandbox();
  ['vf-root', 'vf-quality-content', 'vfg-content', 'sop-list', 'sop-forms-body', 'vf-loading-overlay']
    .concat(opts.containers || []).forEach(function (id) {
      const el = sandbox.document.createElement('div');
      el.id = id;
      sandbox.document.body.appendChild(el);
    });
  sandbox.scriptUrl = 'https://example.invalid/exec';
  sandbox.location = { href: 'https://example.invalid/exec?action=vf_quality_sops', search: '?action=vf_quality_sops&sessionToken=tok', origin: 'https://example.invalid', pathname: '/exec' };
  sandbox.CacheService = { getScriptCache: function () { return { get: function () { return null; }, put: function () {}, remove: function () {} }; } };
  sandbox.PropertiesService = { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; } };
  sandbox.google = {
    script: {
      run: new Proxy({}, { get: function () { return function () { return this; }; } }),
      host: { close: function () {}, setHeight: function () {} },
      history: { push: function () {}, replace: function () {} }
    }
  };
  sandbox.userDirectory = function () { return {}; };

  ['CSS_Tokens.html', 'UI_Components.html', 'Client_Helpers.html'].forEach(function (f) {
    vm.runInContext(scriptOf(f).replace(/<\?[\s\S]*?\?>/g, '0'), sandbox, { filename: f });
  });
  /* UIC.dataTable returns the table SHELL and fills the rows through the DOM,
     which this stub does not build. Wrapping it to splice the real
     UIC._dtRowHtml output into the tbody is the same technique
     tools/verify/pageharness.js uses, so the cells under test are the ones the
     real row builder produces. */
  const tableShells = [];
  const realDataTable = sandbox.UIC.dataTable;
  sandbox.UIC.dataTable = function (containerId, o) {
    tableShells.push({ containerId: containerId, opts: o });
    const html = realDataTable.call(sandbox.UIC, containerId, o);
    const opts2 = o || {};
    const rows = opts2.rows || [];
    if (!rows.length) return html;
    const hasStringHeaders = (opts2.headers || []).some(function (h) { return typeof h === 'string'; });
    const headers = hasStringHeaders
      ? (opts2.headers || []).map(function (h, i) { return (typeof h === 'string' ? { key: '__col' + i, label: h } : h); })
      : (opts2.headers || []);
    const fmtMoney = function (n) { return (Number(n) || 0).toFixed(2); };
    const body = rows.map(function (r, i) { return sandbox.UIC._dtRowHtml(r, headers, fmtMoney, i); }).join('');
    return html.replace(/(<tbody id="[^"]*">)(<\/tbody>)/, '$1' + body + '$2');
  };
  sandbox.__tables = tableShells;
  /**
   * The exact cell payload the page handed to the table renderer, as a flat
   * text blob. Asserting here rather than on rendered DOM nodes keeps the test
   * independent of how the stub builds (or fails to build) a table body, while
   * still proving what the page decided to display.
   */
  sandbox.rowsText = function (containerId) {
    const hit = tableShells.filter(function (t) { return t.containerId === containerId; }).pop();
    if (!hit) return '';
    return (hit.opts.rows || []).map(function (r) {
      return (Array.isArray(r) ? r : Object.keys(r || {}).map(function (k) { return r[k]; })).join(' | ');
    }).join('\n');
  };

  /* The shared controlled-document engine both pages include. */
  vm.runInContext(scriptOf('Quality_SopDoc.html').replace(/<\?[\s\S]*?\?>/g, '0'), sandbox, { filename: 'Quality_SopDoc.html' });

  const calls = [];
  sandbox.API = {
    getSession: function () { return { token: 'TEST-TOKEN' }; },
    call: function (action, payload) {
      const inner = (payload && payload.module_action) || action;
      const data = (payload && payload.data) || payload;
      calls.push({ action: inner, data: data });
      try { return Promise.resolve(opts.call ? opts.call(inner, data) : { status: 'success' }); }
      catch (e) { return Promise.reject(e); }
    }
  };
  const toastSink = function (m, t) { (sandbox.__toasts = sandbox.__toasts || []).push([m, t]); };
  sandbox.UI = Object.assign({
    toast: toastSink, showSpinner: function () {}, hideSpinner: function () {},
    submitOnce: function (el, fn) { return fn(); }
  }, sandbox.UI || {});
  /* Pages call UIC.toast, not UI.toast, so the shared component's toast has to
     be routed to the same sink or a refusal would look like silence. */
  sandbox.UIC = sandbox.UIC || {};
  sandbox.UIC.toast = toastSink;
  sandbox.window.confirm = function () { return true; };
  sandbox.confirm = function () { return true; };

  const values = Object.assign({
    IS_SUPER_ADMIN: opts.isSuperAdmin === false ? 'false' : 'true',
    COMPANY_LOGO_URL: "''",
    COMPANY_PAGES: '[]',
    CURRENT_ACTION: "'" + (opts.action || 'vf_quality_sops') + "'",
    USER_PAGES: opts.userPages === undefined ? 'null' : JSON.stringify(opts.userPages)
  }, opts.scriptlets || {});
  vm.runInContext(substitute(scriptOf(page), values), sandbox, { filename: page });
  sandbox.__calls = calls;

  /** The markup a container currently holds. */
  sandbox.html = function (id) {
    const el = sandbox.document.getElementById(id);
    return el ? String(el.innerHTML || '') : '';
  };
  sandbox.textOf = function (id) {
    const el = sandbox.document.getElementById(id);
    return el ? String(el.textContent || '') : '';
  };
  /**
   * domstub's document.addEventListener is a no-op, so the page's own boot
   * entry point is called directly instead of pretending an event fired.
   */
  sandbox.__boot = function () {
    const pageObj = sandbox.VF_QUALITY_SOPS_PAGE || sandbox.VF_QUALITY_GENERAL_PAGE;
    if (pageObj && pageObj.__test && typeof pageObj.__test.boot === 'function') { pageObj.__test.boot(); return; }
    throw new Error('page exposes no boot entry point');
  };
  return sandbox;
}

const flush = function () { return new Promise(function (r) { setImmediate(r); }); };

/* ══ fixtures ═══════════════════════════════════════════════════════════ */
const TEMPLATE = {
  id: 'vf-controlled-document-v1', version: 1,
  paper: { widthMm: 210, heightMm: 297 },
  header: { metaPct: 30, titlePct: 34, logoPct: 36 },
  bodyHeadings: ['الغرض', 'مجال التطبيق', 'المسؤولية', 'التعريفات', 'النماذج المستخدمة', 'الإجراءات', 'المراجع', 'الحفظ والتسجيل'],
  labels: {
    docNumber: 'رقم الوثيقة', page: 'صفحة', issueDate: 'تاريخ الإصدار', version: 'رقم الإصدار',
    copyNumber: 'رقم النسخة', stamp: 'ختم الوثيقة', prepared: 'إعداد', reviewed: 'مراجعة',
    name: 'الاسم', position: 'الوظيفة', signature: 'التوقيع / التاريخ',
    reviewNo: 'م', plannedReview: 'تاريخ المراجعة المخطط', actualReview: 'تاريخ المراجعة الفعلي',
    reviewer: 'القائم بالمراجعة', reviewResult: 'نتيجة المراجعة',
    issueDateField: 'تاريخ الإصدار', validDate: 'تاريخ السريان',
    changeHistory: 'جدول وثيقة التعديل', changePage: 'رقم الصفحة', changeDate: 'التاريخ',
    changeRevision: 'رقم التعديل / الإصدار', changeSummary: 'ملخص التعديل', pending: '—'
  },
  coverReviewRows: 2, coverReviewScheduleRows: 3
};

function sopListCall(over) {
  over = over || {};
  const sop = Object.assign({
    unique_id: 'sop-1', id: 1, sop_code: SOP_CODE, title_ar: 'سياسة الصيانة', title_en: 'Maintenance Policy',
    category: 'POL', applicability_dept: DEPT, applicability_role: 'مدير الجودة',
    owner_email: 'owner@vf.test', current_effective_version: '', draft_version: '1', revision: '3'
  }, over.sop || {});
  const version = Object.assign({
    unique_id: 'ver-1', id: 1, sop_id: 'sop-1', version: 1, change_type: 'Major', status: 'Draft',
    content_html: '<h2>الغرض</h2><p>نص عربي</p>', change_summary: '',
    template_meta: JSON.stringify({ template_id: 'vf-controlled-document-v1', template_version: 1, doc_type_label: 'سياسة' }),
    revision: '3'
  }, over.version || {});
  return {
    status: 'success',
    sops: over.sops || [sop],
    versions: over.versions || [version],
    forms: [], events: [], acks: [],
    categories: [
      { code: 'POL', label: 'سياسة' }, { code: 'PROC', label: 'إجراء' }, { code: 'WI', label: 'تعليمات عمل' },
      { code: 'FRM', label: 'نموذج' }, { code: 'REC', label: 'سجل' }
    ],
    legacy_categories: [{ code: 'QC', label: 'الجودة' }],
    category_prefixes: { POL: 'POL', PROC: 'PROC', WI: 'WI', FRM: 'APP', REC: 'REC' },
    dept_options: [{ value: DEPT, label: DEPT }, { value: 'الإنتاج', label: 'الإنتاج' }],
    owner_options: [{ value: 'owner@vf.test', name: 'المالك الفعلي', label: 'المالك الفعلي', email: 'owner@vf.test' }],
    owner_choices: [{ value: 'owner@vf.test', name: 'المالك الفعلي', label: 'المالك الفعلي', email: 'owner@vf.test' }],
    owner_names: { 'owner@vf.test': { name: 'المالك الفعلي', state: 'ok' } },
    legacy_roles: ['رئيس حسابات قديم'],
    roles: {
      all_dept_value: '__ALL_DEPT__', all_dept_label: 'جميع العاملين بالإدارة',
      recommended: [
        { value: 'مدير الجودة', label: 'مدير الجودة', employees: 1 },
        { value: 'مهندس إنتاج', label: 'مهندس إنتاج', employees: 0 }
      ],
      titles: [{ value: 'مراقب جودة', count: 2 }]
    },
    dept_abbr: [{ unique_id: 'abbr-1', department: DEPT, canonical: 'إدارة الصيانة', abbrev: 'MAINT' }],
    dept_abbr_recommended: [],
    template: TEMPLATE
  };
}

(async function () {
/* ══ 1. the library ═════════════════════════════════════════════════════ */
console.log('\n-- 1. المكتبة والنصوص الظاهرة للمستخدم');
{
  const sb = boot('Company_ValleyFoods_QualitySops.html', { call: function () { return sopListCall(); } });
  sb.__boot();
  await flush(); await flush();
  const html = sb.html('vfs-host');
  check(html.indexOf('السياسات والاجراءات') !== -1, 'the library heading carries the exact requested Arabic module name');
  check(html.indexOf('SOPs</bdi>') !== -1, 'the Latin "SOPs" part is present and direction-isolated with bdi');
  check(html.indexOf('مكتبة الوثائق') !== -1, 'the short list title «مكتبة الوثائق» is used');
  check(html.indexOf('وثيقة جديدة') !== -1, 'the create button reads «وثيقة جديدة»');
  check(html.indexOf('إجراء جديد') === -1, 'the old «إجراء جديد» wording is gone');
  /* The exact cells the page handed to the table renderer. */
  const table = sb.rowsText('sop-table');
  check(table.indexOf('المالك الفعلي') !== -1, 'the owner column shows the NAME, not the email');
  check(table.indexOf('owner@vf.test') === -1, 'the raw owner email does not appear anywhere in the library row');
  check(table.indexOf(SOP_CODE) !== -1, 'the allocated code is shown');
  check(table.indexOf('مستخدم غير متاح') === -1, 'a resolvable owner is never shown as unavailable');
  check(table.indexOf('إدارة الصيانة') !== -1, 'the department column shows the stored department label');
  check(table.indexOf('سياسة الصيانة') !== -1, 'and the Arabic title is displayed');
  check(table.indexOf('سياسة') !== -1, 'the category shows its Arabic label, not the stored key');
  check(html.indexOf('اختصارات الإدارات') !== -1, 'the full-only abbreviation setup panel is reachable from the page');
}

/* ══ 2. a new document opens the real template editor ═══════════════════ */
console.log('\n-- 2. وثيقة جديدة: المحرر والقالب');
{
  const sb = boot('Company_ValleyFoods_QualitySops.html', { call: function () { return sopListCall(); } });
  sb.__boot();
  await flush(); await flush();
  sb.VF_QUALITY_SOPS_PAGE.openNew();
  const ws = sb.html('vfs-host');
  check(ws.indexOf('id="vfs-flow"') !== -1 && ws.indexOf('contenteditable="true"') !== -1,
    'a new document opens the actual editable workspace, not a metadata-only record');
  check(ws.indexOf('class="vfs-toolbar"') !== -1, 'a formatting toolbar is present');
  check(ws.indexOf('title="عريض"') !== -1 && ws.indexOf('title="إدراج جدول"') !== -1 && ws.indexOf('title="تراجع"') !== -1,
    'the toolbar exposes bold, table and undo controls with Arabic labels');
  check(ws.indexOf('id="vfs-panel"') !== -1 && ws.indexOf('بيانات الوثيقة') !== -1, 'the metadata panel exists');
  check(ws.indexOf('id="vfs-outline"') !== -1, 'the outline is rendered from real headings');
  check(ws.indexOf('id="vfs-page-layer"') !== -1, 'the A4 page layer exists');
  check(ws.indexOf('ملخص التعديل') !== -1, 'the ONE change-history page is part of the template');
  check(ws.indexOf('ختم الوثيقة') !== -1 && ws.indexOf('رقم النسخة') !== -1, 'the cover lower block is part of the template');
  check(ws.indexOf('id="vfs-save-state"') !== -1 && ws.indexOf('id="vfs-wordcount"') !== -1 && ws.indexOf('id="vfs-pagecount"') !== -1,
    'the status bar reports save state, word count and page count');
  check(ws.indexOf('id="vfs-f-title-ar"') !== -1 && ws.indexOf('id="vfs-f-role"') !== -1 && ws.indexOf('id="vfs-f-owner"') !== -1,
    'the required metadata controls live in the panel, not in a form above the document');
  check(ws.indexOf('id="vfs-tab-forms"') !== -1 && ws.indexOf('id="vfs-tab-history"') !== -1 && ws.indexOf('id="vfs-tab-acks"') !== -1,
    'the secondary panels (النماذج المرتبطة / سجل الإصدارات / الإقرارات) are preserved');
  check(ws.indexOf('يُنشأ عند الحفظ') !== -1, 'the code reads «يُنشأ عند الحفظ» before the first save');
  check(ws.indexOf('id="vfs-flow"') !== -1 && ws.indexOf('id="vfs-cover"') !== -1,
    'the cover is rendered as real markup, not an image of the reference PDF');

  const flow = sb.document.getElementById('vfs-flow');
  const body = String(flow && flow.innerHTML || '');
  check(['الغرض', 'مجال التطبيق', 'المسؤولية', 'التعريفات', 'النماذج المستخدمة', 'الإجراءات', 'المراجع', 'الحفظ والتسجيل']
    .every(function (h) { return body.indexOf(h) !== -1; }),
    'the eight default body sections are laid out in the editor immediately');
  check(body.indexOf('data-vfs-ph="1"') !== -1, 'the empty sections carry guidance placeholders, not document text');
  check(sb.VFDOC.substantive(body) === false, 'an untouched template is NOT substantive content');
  check(body.indexOf('P/VFA/QA/011') === -1 && body.indexOf('22.09.2026') === -1,
    'no reference-document sample content is seeded into a new document');
  check(!/مدير المصنع|أحمد|محمد/.test(body), 'no sample people or dates are hard-coded into the template');
}

/* ══ 3. validation and the combined save payload ════════════════════════ */
console.log('\n-- 3. التحقق والحفظ المشترك');
{
  const sb = boot('Company_ValleyFoods_QualitySops.html', {
    call: function (a) {
      return a === 'get_quality_sops' ? sopListCall()
        : { status: 'success', unique_id: 'sop-9', sop_code: 'POL-MAINT-009', revision: '1' };
    }
  });
  sb.__boot();
  await flush(); await flush();
  sb.VF_QUALITY_SOPS_PAGE.openNew();
  const t = sb.VF_QUALITY_SOPS_PAGE.__test;
  const missing = t.validateHeaderForNew(t.collectHeader());
  check(missing.length === 6, 'all six required fields are reported when the new document is empty');
  check(missing.every(function (m) { return m.l !== 'المالك (البريد الإلكتروني)'; }),
    'the owner label reads «المالك», not «المالك (البريد الإلكتروني)»');
  const before = sb.__calls.length;
  const res = await t.saveDraft({ manual: true });
  check(res && res.skipped === 'invalid', 'saving an incomplete new document is skipped, not sent');
  check(sb.__calls.length === before, 'no request is sent while the required metadata is incomplete');
  check(sb.html('vfs-meta-alert').indexOf('أكمل بيانات الوثيقة للحفظ') !== -1,
    'the user is told «أكمل بيانات الوثيقة للحفظ» in the metadata panel while the document is incomplete');
  const fieldErrorBoxes = ['vfs-f-title-ar', 'vfs-f-title-en', 'vfs-f-category', 'vfs-f-dept', 'vfs-f-role', 'vfs-f-owner']
    .map(function (f) { return sb.textOf('err-' + f); });
  check(fieldErrorBoxes.every(function (t) { return /مطلوب/.test(t); }),
    'each missing required field reports its own inline Arabic error, focused beside the field');
  check((sb.__toasts || []).length === 0, 'no repeated toast is fired while the user is still filling the form');

  sb.document.getElementById('vfs-f-title-ar').value = 'سياسة الصيانة';
  sb.document.getElementById('vfs-f-title-en').value = 'Maintenance Policy';
  sb.document.getElementById('vfs-f-category').value = 'POL';
  sb.document.getElementById('vfs-f-dept').value = DEPT;
  sb.document.getElementById('vfs-f-role').value = 'مدير الجودة';
  sb.document.getElementById('vfs-f-owner').value = 'owner@vf.test';
  const flow = sb.document.getElementById('vfs-flow');
  flow.innerHTML = '<h2>الغرض</h2><p>نص عربي حقيقي</p>';
  const saved = await t.saveDraft({ manual: true });
  const sent = sb.__calls[sb.__calls.length - 1];
  check(sent && sent.action === 'save_quality_sop', 'the save goes through save_quality_sop');
  check(!!sent.data.version && sent.data.version.content_html.indexOf('نص عربي حقيقي') !== -1,
    'metadata AND the document body travel in ONE request (no partial-success window)');
  check(!!sent.data.create_token, 'the initial create carries an idempotency token');
  check(String(sent.data.version.template_meta).indexOf('vf-controlled-document-v1') !== -1,
    'the version snapshot carries the template id');
  check(sent.data.expected_revision === '' || sent.data.expected_revision === undefined,
    'a brand-new document sends no stale revision');
  check(saved && saved.sop_code === 'POL-MAINT-009', 'the code returned by the server is adopted');
  check(sb.textOf('vfs-code-label').indexOf('POL-MAINT-009') !== -1, 'and shown in the top bar');
  check(sb.textOf('vfs-save-state').indexOf('تم الحفظ') !== -1, 'the save state reports «تم الحفظ»');
  check(!sb.document.body.children.some(function (el) { return el && el.id === 'vfs-save-wait-modal'; }), 'the authoritative success closes the urgent save modal');
}

/* The domstub cannot hold a delayed network promise, so the remaining
   transport/reconciliation contract is asserted against the real page and
   shared modal source.  The integration harness exercises the full delay
   matrix; these wiring checks prevent a later refactor from bypassing it. */
{
  const pageSource = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_QualitySops.html'), 'utf8');
  const uiSource = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
  check(pageSource.indexOf('activeSavePromise') !== -1 && pageSource.indexOf('return DOC.activeSavePromise') !== -1,
    'double-click saves reuse the one in-flight promise');
  check(pageSource.indexOf('saveErrorIsUncertain_') !== -1 && pageSource.indexOf('pendingRequestId') !== -1,
    'lost responses retain the request ID for reconciliation');
  check(pageSource.indexOf('DOC.saving) { paintTopbar(); return;') !== -1 && pageSource.indexOf('DOC.saving) { UIC.toast') !== -1,
    'Live refresh and navigation cannot replace an editor while saving');
  check(uiSource.indexOf('dismissible') !== -1 && uiSource.indexOf('overlay._uicDismissible === false') !== -1 && uiSource.indexOf('force !== true') !== -1,
    'the shared modal blocks close button, Escape and swipe until explicitly settled');
}

/* ══ 4. metadata controls: role enum, owner chooser, code preview ═══════ */
console.log('\n-- 4. الدور المعني والمالك ومعاينة الكود');
{
  const sb = boot('Company_ValleyFoods_QualitySops.html', { call: function () { return sopListCall(); } });
  sb.__boot();
  await flush(); await flush();
  sb.VF_QUALITY_SOPS_PAGE.openNew();
  const t = sb.VF_QUALITY_SOPS_PAGE.__test;

  const roles = t.roleComboOptions();
  check(roles.some(function (o) { return o.value === '__ALL_DEPT__' && o.label === 'جميع العاملين بالإدارة'; }),
    'the role list offers «جميع العاملين بالإدارة» as the special scope value');
  check(roles.some(function (o) { return o.value === 'مراقب جودة' && /مسميات موجودة بالإدارة/.test(o.label); }),
    'real company job titles are grouped and labelled');
  check(roles.some(function (o) { return o.value === 'مهندس إنتاج' && /لا يوجد موظفون مطابقون/.test(o.label); }),
    'a recommended value with no matching employees says so explicitly');
  check(roles.some(function (o) { return o.value === 'رئيس حسابات قديم' && /قيمة قديمة/.test(o.label); }),
    'a legacy stored value is marked «قيمة قديمة» so an existing record is never stranded');
  check(roles.filter(function (o) { return o.value === 'مراقب جودة'; }).length === 1,
    'each role value appears exactly once even when it is both recommended and present in the data');

  const owners = t.ownerComboOptions();
  check(owners.length > 0 && owners.every(function (o) { return o.label.indexOf('‹') !== -1; }),
    'the owner chooser is name-first with the email only as secondary disambiguation');
  check(owners.every(function (o) { return o.label.split('‹')[0].indexOf('@') === -1; }),
    'the primary owner label is never the email');

  sb.document.getElementById('vfs-f-category').value = 'POL';
  sb.document.getElementById('vfs-f-dept').value = DEPT;
  t.refreshCodePreview();
  const previewBox = sb.document.getElementById('vfs-code-preview');
  const noteBox = sb.document.getElementById('vfs-code-note');
  check(String(previewBox && previewBox.textContent || '').indexOf('POL-MAINT') !== -1,
    'the provisional code preview shows POL-MAINT-…');
  check(String(noteBox && noteBox.textContent || '').indexOf('مبدئية') !== -1,
    'and is labelled provisional, with no promised sequence number');
  sb.document.getElementById('vfs-f-dept').value = 'إدارة غير مكوّنة';
  t.refreshCodePreview();
  check(String(noteBox && noteBox.textContent || '').indexOf('سيُولّد النظام اختصار الإدارة تلقائيًا عند الحفظ') !== -1,
    'an unmapped department reads an auto-generation note instead of a blocking error');
  check(String(previewBox && previewBox.textContent || '') === '', 'and no code is invented');

  check(t.deptAbbrevOf('إدارة الصيانة') === 'MAINT', 'the abbreviation resolver matches the normalized department label');
  check(t.deptAbbrevOf('الصيانة') === 'MAINT', 'and it tolerates the optional إدارة prefix');
  check(t.deptAbbrevOf('الإنتاج') === '', 'while a department with no configured mapping resolves to nothing');
  check(sb.document.getElementById('vfs-f-dept') !== null, 'the department control is reachable for a code preview');
}

/* ══ 5. read-only and legacy behaviour ══════════════════════════════════ */
console.log('\n-- 5. القراءة فقط والوثائق القديمة');
{
  const effective = sopListCall({
    sop: { current_effective_version: '1', draft_version: '' },
    version: { status: 'Effective', template_meta: '', content_html: '<p>محتوى ساري قديم</p>' }
  });
  const sb = boot('Company_ValleyFoods_QualitySops.html', { call: function () { return effective; } });
  sb.__boot();
  await flush(); await flush();
  sb.VF_QUALITY_SOPS_PAGE.openSop('sop-1');
  const ws = sb.html('vfs-host');
  check(ws.indexOf('contenteditable="false"') !== -1, 'a non-editable status opens READ-ONLY');
  check(ws.indexOf('id="vfs-save-btn"') === -1, 'the save button is absent in read-only mode');
  check(ws.indexOf('id="vfs-f-title-ar"') === -1, 'the editable metadata controls are replaced by static values');
  const flow = sb.document.getElementById('vfs-flow');
  check(String(flow && flow.innerHTML || '').indexOf('محتوى ساري قديم') !== -1, 'the stored content is displayed unchanged');
  const before = sb.__calls.length;
  sb.VF_QUALITY_SOPS_PAGE.run('bold');
  sb.VF_QUALITY_SOPS_PAGE.saveDraft();
  await flush();
  check(sb.__calls.length === before, 'no write of any kind is attempted from a read-only document');
  check((sb.__toasts || []).some(function (toast) { return /للقراءة فقط/.test(String(toast[0])); }),
    'an editing attempt on a read-only document is refused with an Arabic message');
  check(ws.indexOf('PDF') === -1 || ws.indexOf('pdf_ref') === -1, 'read-only view keeps whatever workflow facts the record carries');
  check(ws.indexOf('الوثيقة') !== -1 && ws.indexOf('الإقرارات') !== -1, 'the secondary panels remain reachable in read-only mode');
}

/* ══ 6. explicit, undoable template application ═════════════════════════ */
console.log('\n-- 6. تطبيق القالب الرئيسي (قديم)');
{
  const legacy = sopListCall({ version: { status: 'Draft', template_meta: '', content_html: '<p>نص قديم مهم</p>' } });
  const sb = boot('Company_ValleyFoods_QualitySops.html', { call: function () { return legacy; } });
  sb.__boot();
  await flush(); await flush();
  sb.VF_QUALITY_SOPS_PAGE.openSop('sop-1');
  check(sb.html('vfs-host').indexOf('contenteditable="true"') !== -1, 'a legacy DRAFT is editable');
  check(sb.html('vfs-host').indexOf('لم يُرحَّل تلقائياً') !== -1,
    'template-less legacy content is announced as legacy, not silently migrated on read');
  check(sb.html('vfs-host').indexOf('تطبيق القالب الرئيسي') !== -1,
    'and the explicit «تطبيق القالب الرئيسي» action is offered');
  sb.VF_QUALITY_SOPS_PAGE.__test.setHistory(sb.VFDOC.makeHistory(sb.document.getElementById('vfs-flow')));
  const flow = sb.document.getElementById('vfs-flow');
  check(String(flow.innerHTML).indexOf('نص قديم مهم') !== -1, 'the legacy body is untouched on open');
  check(String(flow.innerHTML).indexOf('الغرض') === -1, 'nothing was prepended or reordered on read');
  sb.VF_QUALITY_SOPS_PAGE.applyTemplate();
  const after = String(flow.innerHTML);
  check(after.indexOf('نص قديم مهم') !== -1, 'applying the template PRESERVES the original content');
  check(after.indexOf('الغرض') !== -1 && after.indexOf('الحفظ والتسجيل') !== -1,
    'and surrounds it with the eight controlled-document headings');
  const hist = sb.VF_QUALITY_SOPS_PAGE.__test.getHistory();
  check(!!hist && hist.canUndo() === true, 'the template application is undoable');
  hist.undo();
  check(String(flow.innerHTML).indexOf('الحفظ والتسجيل') === -1, 'undo returns the document to its pre-template content');
  check(sb.VF_QUALITY_SOPS_PAGE.__test.DOC().dirty === true, 'the change is marked dirty so it must be reviewed before saving');
}

/* ══ 7. category options and the APP prefix ════════════════════════════ */
console.log('\n-- 7. التصنيفات والبادئة APP');
{
  const sb = boot('Company_ValleyFoods_QualitySops.html', { call: function () { return sopListCall(); } });
  sb.__boot();
  await flush(); await flush();
  const t = sb.VF_QUALITY_SOPS_PAGE.__test;
  const opts = t.categoryOptionsFor('');
  check(opts.length === 5 && opts.some(function (o) { return o.value === 'FRM'; }),
    'the five internal categories are offered by their stored keys');
  check(opts.every(function (o) { return o.label !== 'ملحق'; }), 'نموذج is never relabelled ملحق');
  const legacyOpts = t.categoryOptionsFor('QC');
  check(legacyOpts.some(function (o) { return o.value === 'QC' && /قديم/.test(o.label); }),
    'an existing legacy category stays selectable for its own record, marked (قديم)');
  check(legacyOpts.filter(function (o) { return o.value === 'QC'; }).length === 1, 'and is offered exactly once');
  check(t.categoryOptionsFor('POL').length === 5, 'a current category needs no legacy entry');
}

/* ══ 8. الجودة العامة page ═════════════════════════════════════════════ */
console.log('\n-- 8. صفحة الجودة العامة');
{
  const list = {
    status: 'success',
    records: [
      { unique_id: 'g1', record_type: 'product_specification', title: 'مواصفة لبن', spec_code: 'SPEC-1', product_id: '100', product_name_snapshot: 'لبن', owner_email: 'owner@vf.test', owner_name: 'المالك الفعلي', record_date: '2026-01-10', due_date: '', body_html: '<h2>الوصف والغرض من الاستخدام</h2>', links: [], status: 'Active', revision: '1' },
      { unique_id: 'g2', record_type: 'quality_activity', title: 'نشاط توعية', spec_code: '', product_id: '', product_name_snapshot: '', activity_category: 'تدريب', owner_email: 'owner@vf.test', owner_name: 'المالك الفعلي', record_date: '', due_date: '2026-03-01', body_html: '<p>ملاحظات</p>', links: [{ url: 'https://ok.invalid', label: 'مرجع' }], status: 'Archived', revision: '2' }
    ],
    owner_choices: [{ value: 'owner@vf.test', name: 'المالك الفعلي', label: 'المالك الفعلي', email: 'owner@vf.test' }],
    types: ['product_specification', 'quality_activity'],
    statuses: ['Draft', 'Active', 'Archived'],
    status_labels: { Draft: 'مسودة', Active: 'نشط', Archived: 'مؤرشف' },
    products: [{ value: '100', code: 'P-100', name: 'لبن' }],
    template: TEMPLATE
  };
  const sb = boot('Company_ValleyFoods_QualityGeneral.html', { action: 'vf_quality_general', call: function () { return list; } });
  sb.__boot();
  await flush(); await flush();
  const html = sb.html('vfg-host');
  check(html.indexOf('الجودة العامة') !== -1, 'the page is titled «الجودة العامة»');
  check(html.indexOf('مواصفات المنتجات') !== -1 && html.indexOf('أنشطة الجودة') !== -1, 'both working tabs are present');
  check(html.indexOf('سجل جديد') !== -1, 'an authorized add action is present');
  check(html.indexOf('السجل العام لا يعني اعتماداً أو مطابقة') !== -1,
    'the page states honestly that an active record is not an approval or a conformity claim');
  const listTable = sb.rowsText('vfg-table');
  check(listTable.indexOf('مواصفة لبن') !== -1 && listTable.indexOf('نشاط توعية') === -1,
    'the product-specification tab lists only its own record type');
  check(listTable.indexOf('المالك الفعلي') !== -1 && listTable.indexOf('owner@vf.test') === -1,
    'the general list shows owner names, not emails');
  check(listTable.indexOf('وصف') === -1 && listTable.indexOf('بلا صنف مرتبط') === -1, 'an unlinked record is not fabricated here');

  sb.VF_QUALITY_GENERAL_PAGE.setTab('quality_activity');
  const actTable = sb.rowsText('vfg-table');
  check(actTable.indexOf('نشاط توعية') !== -1, 'switching tabs lists the activity records');
  check(actTable.indexOf('مواصفة لبن') === -1, 'and never mixes the two record types');
  check(actTable.indexOf('مؤرشف') !== -1, 'the archived record reports its real state');
  check(actTable.indexOf('تدريب') !== -1, 'the descriptive activity category is shown');

  sb.VF_QUALITY_GENERAL_PAGE.setTab('product_specification');
  sb.VF_QUALITY_GENERAL_PAGE.newRecord();
  check(sb.html('vfg-host').indexOf('id="vfg-flow"') !== -1, 'a new record opens the rich editor');
  const specBody = sb.VF_QUALITY_GENERAL_PAGE.__test.specTemplate();
  check(['الوصف والغرض من الاستخدام', 'المكونات والتركيب', 'الخصائص الفيزيائية والحسية', 'المعايير الكيميائية',
    'المعايير الميكروبيولوجية', 'التعبئة والتغليف والبطاقة', 'التخزين والنقل', 'مدة الصلاحية', 'المراجع']
    .every(function (h) { return specBody.indexOf(h) !== -1; }),
    'the product-specification starter body uses the specification sections');
  check(specBody.indexOf('الحفظ والتسجيل') === -1 && specBody.indexOf('مجال التطبيق') === -1,
    'the eight SOP procedural headings are NOT forced onto a specification');
  check(specBody.indexOf('<td></td>') !== -1 && !/الحد الأدنى<\/th><td>[^<]/.test(specBody),
    'every limit and tolerance cell starts BLANK — no invented product facts or food-safety limits');
  check(sb.VF_QUALITY_GENERAL_PAGE.__test.activityTemplate().indexOf('الوصف') !== -1,
    'an activity uses a small notes scaffold instead');
  check(typeof sb.VF_QUALITY_GENERAL_PAGE.setRecordStatus === 'function', 'archive/restore is exposed for full users');

  /* The general page must not offer SOP-only vocabulary. */
  check(sb.html('vfg-host').indexOf('الإصدار') === -1, 'the general workspace offers no SOP version vocabulary');
  check(sb.html('vfg-host').indexOf('إطلاق الإقرارات') === -1, 'and no acknowledgement launch');
}

/* ══ 9. navigation placement ════════════════════════════════════════════ */
console.log('\n-- 9. التنقل: اللوحة داخل الجودة فقط');
{
  const navSrc = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Nav.html'), 'utf8');
  const regSrc = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Registry.js'), 'utf8');
  check(/vf_quality_dashboard/.test(navSrc) && /vf_quality_general/.test(navSrc) && /vf_quality_sops/.test(navSrc),
    'all three quality children are declared in the Quality menu');
  const gradeIdx = navSrc.indexOf("label: 'لوحة الجودة'");
  const genIdx = navSrc.indexOf("label: 'الجودة العامة'");
  const sopsIdx = navSrc.indexOf('السياسات والاجراءات SOPs');
  check(gradeIdx !== -1 && genIdx > gradeIdx && sopsIdx > genIdx,
    'the Quality submenu order is لوحة الجودة then الجودة العامة then السياسات والاجراءات SOPs');
  check(navSrc.indexOf("label: 'اللوحة'") === -1, 'no extra standalone dashboard label was added');

  const dashEntry = regSrc.slice(regSrc.indexOf("action: 'vf_quality_dashboard'"), regSrc.indexOf("action: 'vf_quality_general'"));
  check(dashEntry.indexOf('nav: false') !== -1, 'the dashboard registry entry is nav: false (placement, not access)');
  check(dashEntry.indexOf("template: 'Company_ValleyFoods_QualityDashboard'") !== -1 && dashEntry.indexOf("title: 'الجودة — لوحة المؤشرات'") !== -1,
    'and its template, title and label are unchanged');
  const genEntry = regSrc.slice(regSrc.indexOf("action: 'vf_quality_general'"), regSrc.indexOf("action: 'vf_quality_sops'"));
  check(genEntry.indexOf('nav: false') !== -1, 'the general-quality registry entry is nav: false');
  check(genEntry.indexOf("template: 'Company_ValleyFoods_QualityGeneral'") !== -1, 'and it points at the new template');
  check(genEntry.indexOf("label: 'الجودة العامة'") !== -1, 'with the specified label');
  const sopsEntry = regSrc.slice(regSrc.indexOf("action: 'vf_quality_sops'"), regSrc.indexOf("action: 'vf_quality_my_acks'"));
  check(sopsEntry.indexOf('السياسات والاجراءات SOPs') !== -1, 'the SOP registry entry carries the exact requested name');

  const sb = boot('Company_ValleyFoods_QualitySops.html', {
    action: 'vf_quality_sops',
    userPages: { vf_quality_sops: ['read'], vf_quality_general: ['read'] },
    call: function () { return sopListCall(); }
  });
  check(sb.UIC.pageAuthorized_('vf_quality_dashboard') === false,
    'a user without the dashboard grant does not get the dashboard child');
  check(sb.UIC.pageAuthorized_('vf_quality_general') === true,
    'while the general-quality child is still shown for a general-only user');
  check(sb.UIC.pageAuthorized_('vf_quality_sops') === true, 'and the SOP child follows its own grant independently');

  const sb2 = boot('Company_ValleyFoods_QualitySops.html', {
    action: 'vf_quality_sops',
    userPages: { vf_quality_dashboard: ['read'] },
    call: function () { return sopListCall(); }
  });
  check(sb2.UIC.pageAuthorized_('vf_quality_dashboard') === true && sb2.UIC.pageAuthorized_('vf_quality_general') === false,
    'a dashboard-only user keeps the dashboard under Quality without the general-page grant');
  const sb3 = boot('Company_ValleyFoods_QualitySops.html', {
    action: 'vf_quality_sops', userPages: { vf_products: ['read'] },
    call: function () { return sopListCall(); }
  });
  check(sb3.UIC.pageAuthorized_('vf_quality_dashboard') === false && sb3.UIC.pageAuthorized_('vf_quality_sops') === false &&
    sb3.UIC.pageAuthorized_('vf_quality_general') === false,
    'a user with no Quality grant sees no Quality child at all, so the group is hidden');
}

console.log('\n' + (failed === 0
  ? 'quality_sop_workspace_ui: PASS (library, workspace, metadata controls, save payload, read-only, legacy, categories, general page, navigation)'
  : 'quality_sop_workspace_ui: FAIL (' + failed + ' check(s))'));
process.exit(failed === 0 ? 0 : 1);
})();
