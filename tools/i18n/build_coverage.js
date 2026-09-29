/**
 * build_coverage.js — Stage A inventory for the Arabic/English language switch.
 *
 *     node tools/i18n/build_coverage.js
 *
 * Writes tools/i18n/coverage.json and prints a summary. It reads the project's
 * own files and writes exactly one file (the manifest). Nothing here touches a
 * spreadsheet, a Google service or the network. This is a LOCAL tool: `tools/**`
 * is listed in .claspignore, so none of it is ever pushed to Apps Script.
 *
 * WHAT IT INVENTORIES (plan sections 2, 6, 9)
 * -------------------------------------------
 *   ACTIVE ROUTES   the Code.js ROUTES map (~line 5972), the Code.js
 *                   getAllPages_() core page list, and the `pages` arrays of
 *                   every Company_*_Registry.js. Route -> template -> module ->
 *                   permission, with missing/unresolved routes flagged
 *                   explicitly instead of guessed.
 *   TEMPLATES       every top-level root *.html except appsheet_old_project.html,
 *                   with doctype, include order, direct UIC.appShell calls,
 *                   shell classification, direction overrides, print behaviour
 *                   and dynamic-state markers.
 *   NO-SHELL QUEUE  computed (never hardcoded): doctype templates with no direct
 *                   UIC.appShell call. The plan's 20 named templates are used
 *                   only for a cross-check note.
 *   GENERATED PAGES static full-page HTML emitted from Code.js strings.
 *
 * DETERMINISM
 * -----------
 * generatedAt is the newest mtime among the scanned inputs (or
 * SOURCE_DATE_EPOCH when set), and every array is sorted, so re-running on an
 * unchanged checkout writes byte-identical JSON.
 *
 * STAGE A STOPS HERE. No runtime, catalog or template was changed: there is no
 * representative browser performance measurement access (no staging deployment,
 * no real target phone, no browser tooling in the repo) and production
 * profiling is prohibited. Every entry carries that blocked verification state.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('../lib/sources');

const OUT_PATH = path.join(__dirname, 'coverage.json');
const PLAN_REF = 'Plan_Prompt_Archive/Plan_Language_Switch_Performance_First.md (sections 2, 6, 9)';
const VERIFICATION_STATUS = 'not started - Stage A only; blocked: no representative browser measurement access';
const CATALOGS_PLANNED = { common: true, page: false, companyNav: false };

/* Plan section 6 names these 20 templates as doctype-without-appShell. This list
 * is used ONLY to cross-check the COMPUTED queue and to put the difference in
 * the notes. The queue itself is derived from the files, never from this list. */
const PLAN_NAMED_NO_SHELL = [
  '0_ERPlogin', '0_ERPsetup', '0_ERP_Management',
  'Company_Assessment_Take',
  'Company_TopLight_Customer_Statement', 'Company_TopLight_Product_Movement',
  'Company_TopLight_Purchase_Needs', 'Company_TopLight_Purchase_Print',
  'Company_TopLight_Sales_Costing_Print', 'Company_TopLight_Sales_Offer_Print',
  'Company_TopLight_Sales_Print', 'Company_TopLight_Sales_Release',
  'Company_TopLight_Sales_Returns',
  'Company_ValleyFoods_MfgOrderView', 'Company_ValleyFoods_SalesPrint',
  'Company_ValleyFoods_TestData',
  'DbLive_Viewer', 'Record_History_Panel', 'User_Sessions', 'User_Views'
];

/* Curated purpose labels for the static HTML emitters. Keyed by enclosing
 * function; a missing key falls back to the nearest JSDoc comment. */
const PURPOSE_BY_FUNCTION = {
  serveErpInvoiceFirestore_: 'ERP system invoice receipt (Firestore branch) — inline HTML with a print button.',
  serveErpInvoice_: 'ERP system invoice print page (AppSheet receipt layout) — <html lang="en" dir="ltr">.',
  renderAccessDeniedPage_: 'Access-denied screen for a failed page/permission check (no attempted page revealed).',
  renderMissingPagePage_: 'Deployment-fault screen: route registered but its template is absent from the deployment.',
  renderSessionExpiredPage_: 'Session-expired interstitial whose button continues to the login page.',
  renderSystemDisabledPage_: 'Kill-switch block screen for non-admin users.',
  renderSystemShutdownAdminPage_: 'Kill-switch super-admin recovery screen with one-click re-enable.',
  attachmentPreviewHtml_: 'Attachment inline preview page (image or iframe) with a download link.',
  dataUriDownloadHtml_: 'Data-URI download page for Drive files.'
};

/* ── text helpers ──────────────────────────────────────────────────────── */

function read(rel) {
  return fs.readFileSync(path.join(S.ROOT, rel), 'utf8').replace(/^\uFEFF/, '');
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

/* Comment blanking preserves byte length, so match offsets stay line-accurate. */
function stripBlockComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); });
}

function stripLineComments(s) {
  return s.replace(/(^|[;\s])\/\/[^\n]*/g, function (m, p1) {
    return p1 + new Array(m.length - p1.length + 1).join(' ');
  });
}

function stripComments(s) {
  return stripLineComments(stripBlockComments(s));
}

/* Balanced extraction from an opening `{` or `[`, honouring strings and
 * comments. Returns the slice INCLUDING the delimiters, or null. */
function extractBalanced(src, startIdx) {
  const open = src[startIdx];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let quote = null;
  let i = startIdx;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); if (end < 0) return null; i = end + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  return null;
}

/* Every `{ ... }` object at the top level of an array body, with its offset in
 * that body so the caller can point back at a source line. */
function splitTopLevelObjects(arrayText) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = -1;
  let i = 0;
  for (; i < arrayText.length; i++) {
    const c = arrayText[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && arrayText[i + 1] === '/') { while (i < arrayText.length && arrayText[i] !== '\n') i++; continue; }
    if (c === '/' && arrayText[i + 1] === '*') {
      const end = arrayText.indexOf('*/', i + 2);
      i = end < 0 ? arrayText.length : end + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) { out.push({ text: arrayText.slice(start, i + 1), index: start }); start = -1; }
    }
  }
  return out;
}

/* Literal string / boolean / number / null properties of one object text.
 * Anything with a non-literal value is reported through unparsedKeys so the
 * caller can flag the route `unresolved` rather than guess. */
function objectFields(text) {
  const clean = stripComments(text);
  const fields = {};
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(true|false|null)|(-?\d+(?:\.\d+)?))/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    fields[m[1]] = (m[2] !== undefined) ? m[2]
      : (m[3] !== undefined) ? m[3]
        : (m[4] !== undefined) ? (m[4] === 'true' ? true : (m[4] === 'false' ? false : null))
          : Number(m[5]);
  }
  const seen = {};
  const keyRe = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  while ((m = keyRe.exec(clean)) !== null) seen[m[1]] = true;
  const unparsedKeys = Object.keys(seen).filter(function (k) { return !(k in fields); }).sort();
  return { fields: fields, unparsedKeys: unparsedKeys };
}

/* ── route sources ─────────────────────────────────────────────────────── */

/* Code.js ROUTES, the API action map:
 *     'login_user': { handler: handleLoginWithDevice_, requireAuth: false },
 * These are server endpoints, not pages, so they carry no template. */
function parseApiRoutes(src) {
  const marker = /(?:const|var|let)\s+ROUTES\s*=\s*\{/.exec(src);
  if (!marker) return { routes: [], error: 'Code.js ROUTES registry not found' };
  const braceIdx = marker.index + marker[0].length - 1;
  const body = extractBalanced(src, braceIdx);
  if (!body) return { routes: [], error: 'Code.js ROUTES registry does not balance' };
  const clean = stripComments(body);
  const routes = [];
  const re = /'([^']+)'\s*:\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const handler = /handler\s*:\s*([A-Za-z_$][\w$]*)/.exec(m[2]);
    const requireAuth = /requireAuth\s*:\s*(true|false)/.exec(m[2]);
    const entry = baseRoute('Code.js:ROUTES', lineOf(src, braceIdx + m.index), 'api', 'core-api', null);
    entry.id = m[1];
    entry.handler = handler ? handler[1] : null;
    entry.authorization = { kind: 'api', requireAuth: requireAuth ? requireAuth[1] === 'true' : null };
    if (!handler || !requireAuth) {
      entry.unresolvedReason = 'entry does not match { handler: fn, requireAuth: bool }';
    }
    routes.push(entry);
  }
  return { routes: routes, error: null };
}

/* Code.js getAllPages_() core list:
 *     { action: 'login', template: '0_ERPlogin', title: 'Login', public: true }, */
function parseCorePages(src) {
  const fn = /function\s+getAllPages_\s*\([^)]*\)\s*\{/.exec(src);
  if (!fn) return { routes: [], error: 'Code.js getAllPages_ not found' };
  const rel = /\bconst\s+base\s*=\s*\[/.exec(src.slice(fn.index));
  if (!rel) return { routes: [], error: 'Code.js getAllPages_ base array not found' };
  const abs = fn.index + rel.index + rel[0].length - 1;
  const arr = extractBalanced(src, abs);
  if (!arr) return { routes: [], error: 'Code.js getAllPages_ base array does not balance' };
  return { routes: parsePageObjects(arr, abs, src, 'Code.js:getAllPages_', 'core', null), error: null };
}

/* Company_*_Registry.js pages:
 *     registerCompany_('8df5c89a117fe9a5', { ..., pages: [
 *       { action: 'tl_dashboard', template: 'Company_TopLight_Dashboard',
 *         title: '...', label: '...', nav: false, accessPage: 'vf_cash',
 *         public: true, permissionOnly: true }, ... ] }); */
function parseCompanyRegistries() {
  const files = fs.readdirSync(S.ROOT)
    .filter(function (f) { return /^Company_.+_Registry\.js$/.test(f); })
    .sort();
  const routes = [];
  const errors = [];
  files.forEach(function (f) {
    const src = read(f);
    const call = /registerCompany_\s*\(\s*'([^']+)'/.exec(src);
    if (!call) { errors.push(f + ': registerCompany_ call not found'); return; }
    const braceIdx = src.indexOf('{', call.index + call[0].length);
    if (braceIdx === -1) { errors.push(f + ': config object not found'); return; }
    const config = extractBalanced(src, braceIdx);
    if (!config) { errors.push(f + ': config object does not balance'); return; }
    const pagesMarker = /\bpages\s*:\s*\[/.exec(config);
    if (!pagesMarker) { errors.push(f + ': pages array not found'); return; }
    const abs = braceIdx + config.indexOf('[', pagesMarker.index);
    const arr = extractBalanced(src, abs);
    if (!arr) { errors.push(f + ': pages array does not balance'); return; }
    const moduleName = f.replace(/^Company_/, '').replace(/_Registry\.js$/, '').toLowerCase();
    parsePageObjects(arr, abs, src, f, moduleName, call[1]).forEach(function (r) { routes.push(r); });
  });
  return { routes: routes, errors: errors, files: files };
}

function parsePageObjects(arrayText, absoluteBase, src, source, moduleName, companyId) {
  return splitTopLevelObjects(arrayText).map(function (obj) {
    const line = lineOf(src, absoluteBase + obj.index);
    const parsed = objectFields(obj.text);
    const f = parsed.fields;
    const entry = baseRoute(source, line, 'page', moduleName, companyId);
    entry.id = f.action ? String(f.action) : '(unparsed @ line ' + line + ')';
    entry.template = f.template ? String(f.template) : null;
    entry.title = f.title !== undefined ? String(f.title) : null;
    entry.public = f.public === true;
    entry.nav = f.nav !== undefined ? f.nav : null;
    entry.accessPage = f.accessPage ? String(f.accessPage) : null;
    entry.permissionOnly = f.permissionOnly === true;
    if (!f.action) entry.unresolvedReason = 'no parseable action id';
    else if (parsed.unparsedKeys.length) entry.unresolvedReason = 'unparsed properties: ' + parsed.unparsedKeys.join(', ');
    else if (!entry.template && !entry.permissionOnly) entry.unresolvedReason = 'no template and not marked permissionOnly';
    return entry;
  });
}

/* Shared skeleton so every route entry carries the full Stage A field set. */
function baseRoute(source, line, kind, moduleName, companyId) {
  return {
    id: null,
    source: source,
    sourceLine: line,
    kind: kind,
    template: null,
    templateFile: null,
    module: moduleName,
    companyId: companyId || null,
    title: null,
    handler: null,
    public: false,
    nav: null,
    accessPage: null,
    permissionOnly: false,
    authorization: null,
    templateStatus: null,
    missingTemplate: null,
    unresolved: false,
    unresolvedReason: null,
    shellType: null,
    hasAppShell: null,
    sharedIncludes: null,
    dirOverrides: null,
    printBehavior: null,
    dynamicStates: null,
    catalogsPlanned: CATALOGS_PLANNED,
    directionExceptions: null,
    verificationStatus: VERIFICATION_STATUS
  };
}

/* ── template evidence ─────────────────────────────────────────────────── */

function detectIncludes(src) {
  const list = [];
  const re = /(?:include|createHtmlOutputFromFile)\s*\(\s*(?:'([^']+)'|"([^"]+)")/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1] !== undefined ? m[1] : m[2];
    if (list.indexOf(name) === -1) list.push(name);
  }
  return list;
}

function dirEvidence(src) {
  const attributes = {};
  let rootHtmlDir = null;
  const rootRe = /<html\b[^>]*\bdir\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(src);
  if (rootRe) rootHtmlDir = (rootRe[1] !== undefined ? rootRe[1] : rootRe[2]).trim();
  const re = /\bdir\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const value = (m[1] !== undefined ? m[1] : m[2]).trim();
    const before = src.slice(Math.max(0, m.index - 120), m.index);
    if (/<html\b[^>]*$/i.test(before)) continue;
    attributes[value] = (attributes[value] || 0) + 1;
  }
  return {
    rootHtmlDir: rootHtmlDir,
    attributes: attributes,
    setAttributeCalls: (src.match(/setAttribute\s*\(\s*['"]dir['"]/g) || []).length,
    cssDirectionDeclarations: (src.match(/direction\s*:\s*(rtl|ltr|inherit|initial)/g) || []).length
  };
}

function printEvidence(code) {
  const windowPrint = (code.match(/window\.print\s*\(/g) || []).length;
  const mediaPrint = (code.match(/@media\s+print/gi) || []).length;
  return {
    windowPrint: windowPrint,
    mediaPrint: mediaPrint,
    noPrintClass: (code.match(/\bno-print\b/g) || []).length,
    printOriented: windowPrint > 0 || mediaPrint > 0
  };
}

function dynamicEvidence(src) {
  const tokens = {};
  const attrRe = /\b(?:id|class)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = attrRe.exec(src)) !== null) {
    const value = m[1] !== undefined ? m[1] : m[2];
    value.split(/\s+/).forEach(function (tok) {
      if (/(loading|empty|error|skeleton|spinner|no-data|no_data|placeholder)/i.test(tok)) tokens[tok] = true;
    });
  }
  if (/UIC\.emptyState\s*\(/.test(src)) tokens['UIC.emptyState'] = true;
  if (/UIC\.tableSkeleton\s*\(/.test(src)) tokens['UIC.tableSkeleton'] = true;
  if (/UIC\.loadingState\s*\(/.test(src)) tokens['UIC.loadingState'] = true;
  return Object.keys(tokens).sort();
}

function directionExceptions(dir) {
  const out = [];
  Object.keys(dir.attributes).sort().forEach(function (v) {
    out.push({ source: 'dir-attribute', value: v, count: dir.attributes[v] });
  });
  if (dir.setAttributeCalls) out.push({ source: 'setAttribute-dir', value: null, count: dir.setAttributeCalls });
  if (dir.cssDirectionDeclarations) out.push({ source: 'css-direction', value: null, count: dir.cssDirectionDeclarations });
  return out;
}

function moduleForTemplate(name) {
  if (/^Company_TopLight_/.test(name)) return 'toplight';
  if (/^Company_TopChemical_/.test(name)) return 'topchemical';
  if (/^Company_ValleyFoods_/.test(name)) return 'valleyfoods';
  if (/^Company_Assessment_/.test(name)) return 'assessment';
  if (S.SHARED_PARTIALS.indexOf(name + '.html') !== -1) return 'shared';
  return 'core';
}

/* `UIC.appShell(` is the call that mounts the shared shell. A comment that
 * merely mentions it (Company_Assessment_Take explains it is never called
 * there) does not count, which is why the call pattern requires the `(`. */
function hasAppShellCall(code) {
  return /UIC\.appShell\s*\(/.test(code);
}

function classifyShell(hasDoctype, appShell, isPublic, print, src) {
  if (!hasDoctype) return 'embed';
  if (appShell) return 'appShell';
  if (isPublic) return 'public';
  if (print.printOriented) return 'print';
  if (/<header\b|class\s*=\s*["'][^"']*\b(?:topbar|app-header|erp-header)\b/i.test(src)) return 'custom';
  return 'no-shell';
}

/* ── Code.js static full-page HTML ─────────────────────────────────────── */

function scanGeneratedPages(src) {
  const out = [];
  const re = /<!(?:DOCTYPE|doctype)\s+html/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const idx = m.index;
    const snippet = src.slice(idx, idx + 260);
    const fn = lastFunctionBefore(src, idx);
    const head = /<html\b([^>]*)>/i.exec(snippet);
    const attrs = head ? head[1] : '';
    const lang = /lang\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const dir = /dir\s*=\s*["']([^"']+)["']/i.exec(attrs);
    out.push({
      line: lineOf(src, idx),
      function: fn,
      purpose: PURPOSE_BY_FUNCTION[fn] || nearestDocComment(src, idx) || fn,
      lang: lang ? lang[1] : null,
      dir: dir ? dir[1] : null,
      hardcodedRtl: /dir\s*=\s*["']rtl["']/i.test(attrs),
      langAr: lang ? lang[1] === 'ar' : false
    });
  }
  return out;
}

function lastFunctionBefore(src, idx) {
  const re = /\bfunction\s+([A-Za-z0-9_$]+)\s*\(/g;
  let name = null;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > idx) break;
    name = m[1];
  }
  return name;
}

function nearestDocComment(src, idx) {
  const start = src.lastIndexOf('/**', idx);
  if (start === -1 || idx - start > 4000) return null;
  const end = src.indexOf('*/', start);
  if (end === -1 || end > idx) return null;
  return src.slice(start + 3, end)
    .split('\n')
    .map(function (l) { return l.replace(/^\s*\*?\s?/, '').trim(); })
    .filter(Boolean)
    .join(' ')
    .slice(0, 220);
}

/* ── assembly ──────────────────────────────────────────────────────────── */

function main() {
  const inputs = [];
  const apiSource = read('Code.js');
  inputs.push('Code.js');

  const api = parseApiRoutes(apiSource);
  const core = parseCorePages(apiSource);
  const companies = parseCompanyRegistries();
  companies.files.forEach(function (f) { inputs.push(f); });

  const allRoutes = api.routes.concat(core.routes, companies.routes);

  const templateFiles = S.htmlFiles();
  templateFiles.forEach(function (f) { inputs.push(f); });

  const analyzed = templateFiles.map(function (f) {
    const src = read(f);
    const code = stripComments(src);
    const id = f.replace(/\.html$/, '');
    return {
      id: id,
      template: f,
      src: src,
      hasDoctype: /^\s*<!doctype\s+html/i.test(src),
      hasAppShell: hasAppShellCall(code),
      includes: detectIncludes(src),
      dir: dirEvidence(src),
      print: printEvidence(code),
      dynamic: dynamicEvidence(src)
    };
  });
  const byId = {};
  analyzed.forEach(function (t) { byId[t.id] = t; });

  const publicTemplates = {};
  allRoutes.forEach(function (r) {
    if (r.public && r.template) publicTemplates[r.template] = true;
  });

  /* Finalise routes: resolve template existence and borrow template evidence. */
  allRoutes.forEach(function (r) {
    if (r.kind === 'api') {
      r.templateStatus = 'not-applicable';
      r.missingTemplate = null;
      r.authorization = r.authorization || { kind: 'api', requireAuth: null };
    } else if (r.unresolvedReason) {
      r.unresolved = true;
      r.templateStatus = 'unresolved';
      r.missingTemplate = false;
    } else if (r.permissionOnly) {
      r.templateStatus = 'permission-only';
      r.missingTemplate = false;
      r.authorization = { kind: 'permission-token', pageKey: r.accessPage || r.id };
    } else {
      const file = r.template + '.html';
      const exists = !!r.template && S.exists(file);
      r.templateFile = r.template ? file : null;
      r.missingTemplate = !exists;
      r.templateStatus = exists ? 'present' : 'missingTemplate';
      r.authorization = { kind: 'page-access', pageKey: r.accessPage || r.id, public: r.public === true };
      const t = byId[r.template];
      if (t) {
        r.shellType = classifyShell(t.hasDoctype, t.hasAppShell, !!publicTemplates[r.template], t.print, t.src);
        r.hasAppShell = t.hasAppShell;
        r.sharedIncludes = t.includes;
        r.dirOverrides = t.dir;
        r.printBehavior = t.print;
        r.dynamicStates = t.dynamic;
        r.directionExceptions = directionExceptions(t.dir);
      }
    }
    r.unresolved = r.unresolvedReason !== null;
    if (r.templateFile === null && r.template) r.templateFile = r.template + '.html';
  });

  const routeIdsByTemplate = {};
  allRoutes.forEach(function (r) {
    if (!r.template) return;
    (routeIdsByTemplate[r.template] = routeIdsByTemplate[r.template] || []).push(r.id);
  });

  const templateEntries = analyzed.map(function (t) {
    const shellType = classifyShell(t.hasDoctype, t.hasAppShell, !!publicTemplates[t.id], t.print, t.src);
    return {
      id: t.id,
      template: t.template,
      module: moduleForTemplate(t.id),
      routeIds: (routeIdsByTemplate[t.id] || []).slice().sort(),
      hasDoctype: t.hasDoctype,
      shellType: shellType,
      hasAppShell: t.hasAppShell,
      sharedIncludes: t.includes,
      catalogIncludes: {
        cssTokens: t.includes.indexOf('CSS_Tokens') !== -1,
        uiComponents: t.includes.indexOf('UI_Components') !== -1,
        clientHelpers: t.includes.indexOf('Client_Helpers') !== -1,
        companyNav: t.includes.filter(function (n) { return /^Company_.+_Nav$/.test(n); })
      },
      dirOverrides: t.dir,
      printBehavior: t.print,
      dynamicStates: t.dynamic,
      catalogsPlanned: CATALOGS_PLANNED,
      directionExceptions: directionExceptions(t.dir),
      verificationStatus: VERIFICATION_STATUS
    };
  });

  const noShellQueue = templateEntries
    .filter(function (t) { return t.hasDoctype && !t.hasAppShell; })
    .map(function (t) {
      return {
        id: t.id,
        template: t.template,
        shellType: t.shellType,
        interactive: t.shellType !== 'print' && t.shellType !== 'embed' && t.shellType !== 'generated',
        reason: 'starts with <!doctype html and contains no UIC.appShell( call'
      };
    })
    .sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });

  const computedNoShell = noShellQueue.map(function (q) { return q.id; });
  const missingFromComputed = PLAN_NAMED_NO_SHELL
    .filter(function (id) { return computedNoShell.indexOf(id) === -1; })
    .sort();
  const extraBeyondPlan = computedNoShell
    .filter(function (id) { return PLAN_NAMED_NO_SHELL.indexOf(id) === -1; })
    .sort();

  const serverGeneratedPages = scanGeneratedPages(apiSource)
    .sort(function (a, b) { return a.line - b.line; });

  const missingTemplates = allRoutes.filter(function (r) { return r.missingTemplate === true; });
  const unresolvedRoutes = allRoutes.filter(function (r) { return r.unresolved; });

  const routesSorted = allRoutes.slice().sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const templatesSorted = templateEntries.slice().sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const doctypeTemplates = templateEntries.filter(function (t) { return t.hasDoctype; });
  const appShellTemplates = templateEntries.filter(function (t) { return t.hasAppShell; });
  const clientHelpers = templateEntries.filter(function (t) { return t.sharedIncludes.indexOf('Client_Helpers') !== -1; });

  const notes = [
    'Stage A stopped before implementation because representative browser performance measurement access is unavailable (no staging deployment, no real target phone, repo has no browser tooling; production profiling is prohibited). No template, catalog or runtime file was changed.',
    VERIFICATION_STATUS + ' — route-level and flip-level verification is blocked by the same measurement gap.',
    'templates: root *.html excluding appsheet_old_project.html (tools/** is .claspignore\'d, so this manifest and its scripts are local-only).',
    'api routes: Code.js ROUTES map, shape `\'action\': { handler: fn, requireAuth: bool }`; these are endpoints and deliberately have no template.',
    'core page routes: Code.js getAllPages_() base array, shape `{ action: \'login\', template: \'0_ERPlogin\', title: \'Login\', public: true }`.',
    'company page routes: Company_*_Registry.js pages arrays, shape `{ action, template, title, label, nav, accessPage, public, permissionOnly }` — parsed with balanced-bracket extraction, not line regex.',
    'no-shell queue is computed: hasDoctype (first non-whitespace token is <!doctype html) AND no literal UIC.appShell( call. A comment mentioning UIC.appShell does not count.',
    'shell classification order: embed (no doctype) -> appShell (direct call) -> public (public route) -> print (window.print or @media print) -> custom (own topbar/header markup) -> no-shell.',
    'routes with an unparseable registry entry are recorded as unresolved with the reason; nothing is guessed.',
    'plan section 2 historical counts (raw source scan, separate method): 114 doctype templates, 113 with Client_Helpers, 94 with UIC.appShell. This manifest records its own scan: ' +
      doctypeTemplates.length + ' doctype templates, ' + clientHelpers.length + ' with Client_Helpers, ' + appShellTemplates.length + ' with a direct UIC.appShell( call. Differences are expected: the plan counted a raw source listing before later working-tree changes.',
    'plan cross-check (section 6): ' + PLAN_NAMED_NO_SHELL.length + ' named templates, computed queue has ' + noShellQueue.length +
      ', missing from computed [' + (missingFromComputed.join(', ') || 'none') + '], extra beyond plan [' + (extraBeyondPlan.join(', ') || 'none') + '].',
    'regenerate with: node tools/i18n/build_coverage.js; validate with: node tools/i18n/check_coverage.js'
  ];

  const totals = {
    templates: templatesSorted.length,
    routes: routesSorted.length,
    apiRoutes: allRoutes.filter(function (r) { return r.kind === 'api'; }).length,
    corePageRoutes: allRoutes.filter(function (r) { return r.source === 'Code.js:getAllPages_'; }).length,
    companyPageRoutes: allRoutes.filter(function (r) {
      return /^Company_.+_Registry\.js$/.test(r.source || '');
    }).length,
    appShellTemplates: appShellTemplates.length,
    noShellQueue: noShellQueue.length,
    generatedPages: serverGeneratedPages.length,
    routesWithMissingTemplate: missingTemplates.length,
    routesUnresolved: unresolvedRoutes.length
  };

  let generatedAt;
  if (process.env.SOURCE_DATE_EPOCH) {
    generatedAt = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  } else {
    let newest = 0;
    inputs.forEach(function (f) {
      const t = fs.statSync(path.join(S.ROOT, f)).mtimeMs;
      if (t > newest) newest = t;
    });
    generatedAt = new Date(newest).toISOString();
  }

  const manifest = {
    schema: 'tools/i18n/coverage.json',
    generatedAt: generatedAt,
    planRef: PLAN_REF,
    stage: 'A - inventory only; no implementation',
    method: {
      templateSet: 'root-level *.html via tools/lib/sources.js htmlFiles(), excluding appsheet_old_project.html',
      apiRoutes: 'Code.js ROUTES object (~line 5972): \'action\': { handler: fn, requireAuth: bool }',
      corePageRoutes: 'Code.js getAllPages_() base array: { action, template, title, public }',
      companyPageRoutes: 'Company_*_Registry.js: registerCompany_(id, { pages: [ { action, template, title, label, nav, accessPage, public, permissionOnly } ] })',
      templateEvidence: 'literal include(\'X\') / createHtmlOutputFromFile(\'X\') order; UIC.appShell( call (comment mention excluded); dir=, setAttribute(\'dir\'), direction:; window.print, @media print; loading/empty/error/skeleton/spinner markers',
      noShellQueue: 'computed per template: starts with <!doctype html AND no literal UIC.appShell( call',
      serverGeneratedPages: 'Code.js `<!DOCTYPE html` / `<html ...>` emissions enclosing function + purpose; dir/lang read from the emitted <html> tag',
      determinism: 'generatedAt = newest scanned input mtime, or SOURCE_DATE_EPOCH; all arrays sorted'
    },
    notes: notes,
    totals: totals,
    planCrossCheck: {
      expectedNoShellTemplates: PLAN_NAMED_NO_SHELL.length,
      computedNoShellTemplates: noShellQueue.length,
      missingFromComputed: missingFromComputed,
      extraBeyondPlan: extraBeyondPlan
    },
    routes: routesSorted,
    templates: templatesSorted,
    noShellQueue: noShellQueue,
    serverGeneratedPages: serverGeneratedPages
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log('build_coverage — ' + generatedAt);
  console.log('='.repeat(72));
  console.log('templates           : ' + totals.templates + ' (' + totals.appShellTemplates + ' appShell, ' + noShellQueue.length + ' no-shell queue)');
  console.log('routes              : ' + totals.routes + ' (' + totals.apiRoutes + ' api, ' + totals.corePageRoutes + ' core pages, ' + totals.companyPageRoutes + ' company pages)');
  console.log('missing templates   : ' + totals.routesWithMissingTemplate +
    (missingTemplates.length ? ' -> ' + missingTemplates.map(function (r) { return r.id + ':' + r.template; }).join(', ') : ''));
  console.log('unresolved routes   : ' + totals.routesUnresolved +
    (unresolvedRoutes.length ? ' -> ' + unresolvedRoutes.map(function (r) { return r.id + ' (' + r.unresolvedReason + ')'; }).join(', ') : ''));
  console.log('generated pages     : ' + totals.generatedPages);
  console.log('plan cross-check    : missing from computed [' + (missingFromComputed.join(', ') || 'none') + '], extra beyond plan [' + (extraBeyondPlan.join(', ') || 'none') + ']');
  console.log('wrote ' + path.relative(S.ROOT, OUT_PATH).replace(/\\/g, '/'));
  if (api.error) { console.error('FATAL: ' + api.error); process.exit(1); }
  if (core.error) { console.error('FATAL: ' + core.error); process.exit(1); }
  companies.errors.forEach(function (e) { console.error('WARN: ' + e); });
}

main();
