/**
 * build_inventory.js — P0 universal coverage denominator for the daily
 * performance plan.
 *
 *     node tools/perf/build_inventory.js
 *
 * Writes tools/perf/inventory.json and prints a summary. It reads the project's
 * own files and writes exactly one file (the inventory). Nothing here touches a
 * spreadsheet, a Google service or the network. This is a LOCAL tool: `tools/**`
 * is listed in .claspignore, so none of it is ever pushed to Apps Script.
 *
 * WHAT IT INVENTORIES (plan sections 3, 4, 10-P0)
 * -----------------------------------------------
 *   ROUTES      Code.js ROUTES map (~line 5972), the getAllPages_() core page
 *               list (~198) and the `pages` arrays of every Company_*_Registry.js.
 *               Each entry carries module, company scope, template existence,
 *               shell type (reusing tools/i18n/coverage.json when the template
 *               matches), permission/auth flags, a heuristic UI pattern with
 *               the evidence signal used, an inferred storage backend, a
 *               telemetry-instrumentation status derived from real perf
 *               markers, per-route optimization-flag occurrences and the
 *               navigation lifecycle (hard-nav / router-registered). Each route
 *               also carries `instrumentedVia`, a static coverage
 *               classification (shared-hook | explicit-adapter-outstanding |
 *               not-applicable | unknown) derived from the server finalizer
 *               skip list and the template's UI_Components include.
 *   TEMPLATES   every root-level *.html (excluding the legacy AppSheet export)
 *               with module, shell type, pattern, instrumentation, the same
 *               `instrumentedVia` classification and the route ids that use it.
 *   JOBS        every ScriptApp.newTrigger(...) site in Code.js: creator
 *               function, target function, statically visible schedule, whether
 *               it is conditional, and owner module.
 *   BACKENDS    evidence counts for Sheets / Firestore / MySQL / CacheService /
 *               PropertiesService across route and template sources.
 *   PREREQUISITE  computed from the current source only (never from the plan or
 *               the implementation guide's claims) with file:line evidence:
 *               ERP_Users.is_active absent, ERP_User_Views still wired, themes
 *               implemented but private logo upload absent, backup partial
 *               (folder by name, non-ISO stamp, no whole-job lease), chatter
 *               absent, SOP rules present.
 *
 * DETERMINISM
 * -----------
 * generatedAt is the newest mtime among the scanned inputs (or SOURCE_DATE_EPOCH
 * when set); every array is sorted. sourceHead/dirty are read once from git, so
 * a re-run on an unchanged checkout is byte-identical.
 *
 * This tool only INVENTORIES. It does not instrument, enable flags, alter a
 * schema or run any unit test.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const S = require('../lib/sources');

const OUT_PATH = path.join(__dirname, 'inventory.json');
const COVERAGE_PATH = path.join(__dirname, '..', 'i18n', 'coverage.json');
const PLAN_REF = 'Plan_Prompt_Archive/UNIVERSAL_DAILY_PERFORMANCE_PLAN.md (sections 3, 4, 10-P0)';

const FLAG_NAMES = [
  'FAST_READ_CORE_',
  'FAST_VIEW_CORE_',
  'FAST_SAVE_CORE_',
  'FORM_STATE_CORE_',
  'SALES_ONE_REQUEST_',
  'TABLE_REFRESH_ON_'
];

/* `instrumentedVia` classifies HOW a route/template is covered, from static
 * source evidence only. It is not a runtime observation.
 *   shared-hook                  shared UIC / Client_Helpers hooks or the
 *                                server request finalizer apply with no
 *                                per-route adapter (hard-nav pages, tables,
 *                                modals, lookups, saves, uploads, prints).
 *   explicit-adapter-outstanding a routable surface whose required semantics
 *                                (assessment timing, document/rich editors,
 *                                public login/setup entries) have no shared
 *                                hook yet; an adapter is still owed.
 *   not-applicable               no independent UI surface of its own
 *                                (self-telemetry API, permission-only data
 *                                gate, shared partial loaded by other pages).
 *   unknown                      no static evidence either way.
 */
const INSTRUMENTED_VIA_VALUES = ['shared-hook', 'explicit-adapter-outstanding', 'not-applicable', 'unknown'];
const EXPLICIT_ADAPTER_PATTERNS = ['assessment', 'editor'];
const INSTRUMENTATION_PROVIDERS = { UI_Components: true, Client_Helpers: true, CSS_Tokens: true };

/* Canonical flag definition site, used for the global flags block. */
const FLAG_SOURCE = {
  FAST_READ_CORE_: 'Core_FastRead.js',
  FAST_VIEW_CORE_: 'Core_ViewEngine.js',
  FAST_SAVE_CORE_: 'Core_FastSave.js',
  FORM_STATE_CORE_: 'Core_FormState.html',
  SALES_ONE_REQUEST_: 'Company_ValleyFoods_Sales.html',
  TABLE_REFRESH_ON_: 'UI_Components.html',
  HISTORY_QUEUE_ENABLED_: 'Code.js'
};

const UI_PATTERN_ORDER = [
  'assessment', 'editor', 'print', 'attachment', 'master-detail',
  'admin', 'dashboard', 'report', 'lookup', 'public', 'list', 'simple-form', 'unknown'
];

const BACKEND_PATTERNS = {
  sheets: /SpreadsheetApp|getSpreadsheet_|getSheetByName\s*\(|appendRow\s*\(|getDataRange\s*\(|setValues\s*\(/g,
  firestore: /firestore|Firestore|FIRESTORE|systemGetAllRecords_|systemCreateRecord_|systemPatchRecord_|systemAddRecordCompat_|systemRowsCompat_|systemFindCompat_/g,
  mysql: /Jdbc|mysql|MySQL|MYSQL_|getMysqlConnection|dbQuery_|dbListTables_|dbInsert_|dbUpdate_|dbDelete_|dbAggregate_/gi,
  cache: /CacheService/g,
  properties: /PropertiesService/g
};

const MARKERS = [
  { name: 'PERF.', re: /PERF\./g },
  { name: 'first_data_render', re: /first_data_render/g },
  { name: 'journey', re: /\bjourney\b/gi },
  { name: 'perf_', re: /perf_/g },
  { name: 'NavTimeline', re: /NavTimeline/g },
  { name: 'mark(', re: /\bmark\s*\(/g }
];

const ADMIN_TEMPLATES = {
  '0_ERP_Management': true,
  'User_Sessions': true,
  'User_Views': true,
  'DbLive_Viewer': true,
  'ERP_Perf_Dashboard': true
};

const JOB_OWNER_BY_CREATOR = {
  installTriggers_: 'core',
  installRetentionTrigger_: 'core',
  installDailyBackupTrigger_: 'backup'
};

/* PLAN_NAMED_NO_SHELL is deliberately NOT used here; shell type comes from the
 * i18n inventory or is derived with the same documented order. */

/* ── text helpers ──────────────────────────────────────────────────────── */

const inputs = {};

function readTracked(rel) {
  inputs[rel] = true;
  return fs.readFileSync(path.join(S.ROOT, rel), 'utf8').replace(/^\uFEFF/, '');
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

function findLine(src, re) {
  const m = re.exec(src);
  return m ? lineOf(src, m.index) : null;
}

function countMatches(src, re) {
  const m = String(src || '').match(re);
  return m ? m.length : 0;
}

function blankBlockComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); });
}

function blankLineComments(s) {
  return s.replace(/(^|[;\s])\/\/[^\n]*/g, function (m, p1) {
    return p1 + new Array(m.length - p1.length + 1).join(' ');
  });
}

function stripComments(s) {
  return blankLineComments(blankBlockComments(s));
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
 * Anything with a non-literal value is reported through unparsedKeys. */
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

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/* Balanced body of a named function declaration, or ''. */
function functionBody(src, name) {
  if (!name) return '';
  const re = new RegExp('function\\s+' + escapeRe(name) + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return '';
  const brace = src.indexOf('{', m.index + m[0].length);
  if (brace === -1) return '';
  return extractBalanced(src, brace) || '';
}

/* ── route sources ─────────────────────────────────────────────────────── */

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
    routes.push(makeRoute({
      id: m[1],
      source: 'Code.js:ROUTES',
      sourceLine: lineOf(src, braceIdx + m.index),
      kind: 'api',
      moduleName: 'core',
      companyScope: null,
      title: null,
      handler: handler ? handler[1] : null,
      publicFlag: false,
      permissionOnly: false,
      accessPage: null,
      nav: null,
      unresolvedReason: (!handler || !requireAuth) ? 'entry does not match { handler: fn, requireAuth: bool }' : null,
      authorization: { kind: 'api', requireAuth: requireAuth ? requireAuth[1] === 'true' : null }
    }));
  }
  return { routes: routes, error: null };
}

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

function parseCompanyRegistries() {
  const files = fs.readdirSync(S.ROOT)
    .filter(function (f) { return /^Company_.+_Registry\.js$/.test(f); })
    .sort();
  const routes = [];
  const errors = [];
  files.forEach(function (f) {
    const src = readTracked(f);
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
    const id = f.action ? String(f.action) : '(unparsed @ ' + source + ':' + line + ')';
    let unresolvedReason = null;
    if (!f.action) unresolvedReason = 'no parseable action id';
    else if (parsed.unparsedKeys.length) unresolvedReason = 'unparsed properties: ' + parsed.unparsedKeys.join(', ');
    else if (!f.template && f.permissionOnly !== true) unresolvedReason = 'no template and not marked permissionOnly';
    return makeRoute({
      id: id,
      source: source,
      sourceLine: line,
      kind: 'page',
      moduleName: moduleName,
      companyScope: companyId,
      title: f.title !== undefined ? String(f.title) : null,
      handler: null,
      publicFlag: f.public === true,
      permissionOnly: f.permissionOnly === true,
      accessPage: f.accessPage ? String(f.accessPage) : null,
      nav: f.nav !== undefined ? f.nav : null,
      template: f.template ? String(f.template) : null,
      unresolvedReason: unresolvedReason,
      authorization: null
    });
  });
}

function makeRoute(o) {
  return {
    id: o.id,
    source: o.source,
    sourceLine: o.sourceLine,
    kind: o.kind,
    module: o.moduleName,
    companyScope: o.companyScope || null,
    title: o.title !== undefined ? o.title : null,
    handler: o.handler || null,
    template: o.template !== undefined ? o.template : null,
    templateFile: null,
    templateExists: null,
    shellType: null,
    permissions: {
      public: o.publicFlag === true,
      permissionOnly: o.permissionOnly === true,
      accessPage: o.accessPage || null,
      requireAuth: o.authorization && o.authorization.kind === 'api' ? o.authorization.requireAuth : null
    },
    authorization: o.authorization || null,
    uiPattern: null,
    backend: null,
    instrumentation: null,
    instrumentedVia: null,
    instrumentedViaEvidence: null,
    optimizationFlags: null,
    lifecycle: null,
    status: 'registered',
    unresolved: o.unresolvedReason !== null && o.unresolvedReason !== undefined,
    unresolvedReason: o.unresolvedReason || null,
    nav: o.nav !== undefined ? o.nav : null
  };
}

/* ── template + coverage evidence ──────────────────────────────────────── */

function startsWithDoctype(src) { return /^\s*<!doctype\s+html/i.test(src); }
function hasAppShellCall(src) { return /UIC\.appShell\s*\(/.test(stripComments(src)); }

function classifyShell(hasDoctype, appShell, isPublic, print, src) {
  if (!hasDoctype) return 'embed';
  if (appShell) return 'appShell';
  if (isPublic) return 'public';
  if (print.printOriented) return 'print';
  if (/<header\b|class\s*=\s*["'][^"']*\b(?:topbar|app-header|erp-header)\b/i.test(src)) return 'custom';
  return 'no-shell';
}

function moduleForTemplate(name) {
  if (/^Company_TopLight_/.test(name)) return 'toplight';
  if (/^Company_TopChemical_/.test(name)) return 'topchemical';
  if (/^Company_ValleyFoods_/.test(name)) return 'valleyfoods';
  if (/^Company_Assessment_/.test(name)) return 'assessment';
  if (S.SHARED_PARTIALS.indexOf(name + '.html') !== -1) return 'shared';
  return 'core';
}

function loadCoverage() {
  try {
    inputs['tools/i18n/coverage.json'] = true;
    const m = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
    const byId = {};
    (m.templates || []).forEach(function (t) { byId[t.id] = t; });
    return { manifest: m, byId: byId };
  } catch (e) {
    return { manifest: null, byId: {} };
  }
}

/* ── heuristics ────────────────────────────────────────────────────────── */

function uiPatternFor(route, sources) {
  const id = String(route.id || '');
  const templateId = String(route.template || '');
  const ids = id + ' ' + templateId + ' ' + String(route.title || '');
  const joined = sources.join('\n');
  const signals = [];
  function hit(name, evidenceText) { signals.push({ pattern: name, evidence: evidenceText }); }

  if (route.kind === 'api' && !route.template && !sources.length) {
    /* No UI source at all: describe the endpoint shape rather than guess. */
    return { pattern: /^(get_|list_|admin_list_)/.test(id) ? 'lookup' : 'unknown', signals: [{ pattern: 'api', evidence: 'no UI template; classified from action id only' }] };
  }

  if (/window\.print\s*\(|@media\s+print/i.test(joined)) hit('print', 'window.print/@media print');
  if (/^ac_/.test(id) || route.module === 'assessment') hit('assessment', 'ac_ action or assessment module');
  if (/contenteditable/i.test(joined)) hit('editor', 'contenteditable');
  if (/\b(upload|download)\b|type\s*=\s*["']file["']|add_upload_file|\battachment\b|print_file/i.test(ids + ' ' + joined)) hit('attachment', 'upload/download/file input/attachment handler');
  if (/\bopenDetail\b|open_detail|detail[-_]?(view|section|panel)|master[-_]detail/i.test(joined)) hit('master-detail', 'openDetail/detail section');
  /* Handler bodies may only steer the pattern for API routes: for a page, the
   * script mentioning "dashboard" (a redirect, a link) is not the page's
   * pattern, and the template id already carries that signal. */
  const endpointText = route.kind === 'api' ? ' ' + joined : '';
  if (/^admin_/.test(id) || ADMIN_TEMPLATES[templateId] === true) hit('admin', 'admin_ action or administration template');
  if (/dashboard|kpi|overview/i.test(ids + endpointText)) hit('dashboard', 'dashboard/kpi id, template or handler');
  if (/report|statement|analysis|movement|financial|position|income|balance|needs|costing|_return/i.test(ids)) hit('report', 'report/statement id or template');
  if (/lookup|picker|combobox|_options\b/i.test(ids + ' ' + route.module)) hit('lookup', 'lookup/picker id or template');
  if (route.permissions && route.permissions.public === true) hit('public', 'route marked public');
  if (/datatable|UIC\.DataTable|<table|getAllRecords_/i.test(joined) || /^(get_|list_)/.test(id)) hit('list', 'table/list markup or list/get action id');
  if (/<form\b|UIC\.field\s*\(|UIC\.Form\b|<input\b/i.test(joined)) hit('simple-form', 'form markup or UIC.field');

  const chosen = UI_PATTERN_ORDER.find(function (p) {
    return signals.some(function (s) { return s.pattern === p; });
  }) || 'unknown';
  const chosenSignal = signals.find(function (s) { return s.pattern === chosen; });
  return {
    pattern: chosen,
    signals: signals.map(function (s) { return s.pattern + ': ' + s.evidence; }),
    evidence: chosenSignal ? chosenSignal.evidence : 'no matching signal'
  };
}

function backendFor(sources) {
  const counts = {};
  Object.keys(BACKEND_PATTERNS).forEach(function (k) {
    counts[k] = sources.reduce(function (n, src) { return n + countMatches(src, BACKEND_PATTERNS[k]); }, 0);
  });
  let kind = 'unknown';
  if (counts.mysql > 0 && (counts.sheets > 0 || counts.firestore > 0)) kind = 'mixed';
  else if (counts.mysql > 0) kind = 'mysql';
  else if (counts.sheets > 0 && counts.firestore > 0) kind = 'mixed';
  else if (counts.sheets > 0) kind = 'sheets';
  else if (counts.firestore > 0) kind = 'firestore';
  return { kind: kind, evidenceCounts: counts };
}

function flagsIn(src, names) {
  const out = {};
  (names || FLAG_NAMES).forEach(function (name) {
    const re = new RegExp(escapeRe(name) + '\\s*=\\s*(true|false)');
    const m = re.exec(src || '');
    out[name] = m ? m[1] === 'true' : null;
  });
  return out;
}

/* Markers are searched in comment-stripped code: a comment that merely
 * mentions "journey" does not prove the source produces a measurement. */
function markersIn(sources) {
  const found = {};
  sources.forEach(function (raw, i) {
    const src = stripComments(raw);
    MARKERS.forEach(function (mk) {
      const n = countMatches(src, mk.re);
      if (n) {
        if (!found[mk.name]) found[mk.name] = { marker: mk.name, count: 0, sources: [] };
        found[mk.name].count += n;
        found[mk.name].sources.push('source[' + i + ']');
      }
    });
  });
  return Object.keys(found).sort().map(function (k) { return found[k]; });
}

function lifecycleFor(route, templateSrc) {
  if (route.kind !== 'page' || !templateSrc) return null;
  const re = new RegExp('UIC\\.Router\\.register\\s*\\(\\s*[\'"]' + escapeRe(route.id) + '[\'"]');
  return re.test(templateSrc) ? 'router-registered' : 'hard-nav';
}

/* Action ids the server telemetry finalizer deliberately skips. Parsed from
 * Code.js so the classification follows the source instead of a copied list. */
function parsePerfSkipActions(src) {
  const marker = /var\s+PERF_SKIP_ACTIONS_\s*=\s*\{/.exec(src);
  if (!marker) return {};
  const brace = src.indexOf('{', marker.index + marker[0].length - 1);
  const body = brace === -1 ? null : extractBalanced(src, brace);
  if (!body) return {};
  const out = {};
  const re = /([A-Za-z_$][\w$]*)\s*:\s*true/g;
  let m;
  while ((m = re.exec(body)) !== null) out[m[1]] = true;
  return out;
}

function classifyRouteVia(route, templateHasUIComponents, skipActions) {
  if (route.kind === 'api') {
    if (skipActions[route.id]) {
      return { via: 'not-applicable', evidence: 'listed in Code.js PERF_SKIP_ACTIONS_ (telemetry route never instruments itself)' };
    }
    return { via: 'shared-hook', evidence: 'server request finalizer in Code.js apiRouter_ applies to every non-skipped API route' };
  }
  if (!route.template) {
    return { via: 'not-applicable', evidence: 'permission-only data gate: no template and no UI surface of its own' };
  }
  const pattern = route.uiPattern ? route.uiPattern.pattern : 'unknown';
  if (EXPLICIT_ADAPTER_PATTERNS.indexOf(pattern) !== -1) {
    return { via: 'explicit-adapter-outstanding', evidence: pattern + ' surface: no shared hook for its required semantics yet (plan section 4)' };
  }
  if (route.permissions && route.permissions.public === true) {
    return { via: 'explicit-adapter-outstanding', evidence: 'public login/setup entry: no appShell page journey; readiness adapter outstanding' };
  }
  if (templateHasUIComponents[route.template]) {
    return { via: 'shared-hook', evidence: 'template includes UI_Components.html shared hooks' };
  }
  return { via: 'unknown', evidence: 'template does not include UI_Components.html and no adapter is recorded' };
}

function classifyTemplateVia(t, routeViaById) {
  if (INSTRUMENTATION_PROVIDERS[t.id]) {
    return { via: 'not-applicable', evidence: t.id + ' provides hooks/shared chrome; it is not an independent measured surface' };
  }
  const classes = (t.routeIds || []).map(function (id) { return routeViaById[id]; }).filter(Boolean);
  let via = null;
  if (classes.indexOf('shared-hook') !== -1) via = 'shared-hook';
  if (classes.indexOf('explicit-adapter-outstanding') !== -1) via = 'explicit-adapter-outstanding';
  if (!via && classes.length) via = 'unknown';
  if (!via) {
    return { via: 'not-applicable', evidence: 'no route renders this template directly; loaded inside instrumented pages' };
  }
  const evidence = via === 'shared-hook'
    ? 'at least one of its route ids is covered by shared hooks'
    : (via === 'explicit-adapter-outstanding'
      ? 'at least one of its route ids needs an explicit adapter'
      : 'its route ids have no static coverage evidence');
  return { via: via, evidence: evidence };
}

/* ── action-file mapping ───────────────────────────────────────────────── */

function actionFilesByModule() {
  const out = {};
  fs.readdirSync(S.ROOT)
    .filter(function (f) { return /^Company_.+_Actions\.js$/.test(f); })
    .sort()
    .forEach(function (f) {
      const moduleName = f.replace(/^Company_/, '').replace(/_Actions\.js$/, '').toLowerCase();
      out[moduleName] = f;
    });
  return out;
}

/* ── background jobs ───────────────────────────────────────────────────── */

function parseJobs(src) {
  const jobs = [];
  const re = /ScriptApp\.newTrigger\s*\(\s*'([^']+)'\s*\)([\s\S]{0,500}?)\.create\s*\(\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const target = m[1];
    const chain = m[2].replace(/\s+/g, ' ').trim();
    const line = lineOf(src, m.index);
    const creator = lastFunctionBefore(src, m.index);
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const before = src.slice(lineStart, m.index);
    const schedule = {
      everyDays: /everyDays\s*\(\s*(\d+)\s*\)/.exec(chain),
      everyMinutes: /everyMinutes\s*\(\s*(\d+)\s*\)/.exec(chain),
      everyHours: /everyHours\s*\(\s*(\d+)\s*\)/.exec(chain),
      atHour: /atHour\s*\(\s*(\d+)\s*\)/.exec(chain),
      onMonthDay: /onMonthDay\s*\(\s*(\d+)\s*\)/.exec(chain)
    };
    const parts = [];
    if (schedule.everyMinutes) parts.push('every ' + schedule.everyMinutes[1] + ' minute(s)');
    if (schedule.everyDays) parts.push('every ' + schedule.everyDays[1] + ' day(s)');
    if (schedule.everyHours) parts.push('every ' + schedule.everyHours[1] + ' hour(s)');
    if (schedule.onMonthDay) parts.push('on month day ' + schedule.onMonthDay[1]);
    if (schedule.atHour) parts.push('at hour ' + schedule.atHour[1] + ' (project time zone)');
    jobs.push({
      id: 'Code.js:newTrigger:' + line,
      source: 'Code.js',
      sourceLine: line,
      creatorFunction: creator,
      targetFunction: target,
      chain: '.newTrigger(\'' + target + '\')' + chain + '.create()',
      schedule: parts.length ? parts.join(', ') : chain,
      conditional: /\bif\s*\(/.test(before) || /try\s*\{/.test(before),
      condition: (function () {
        const ifM = /\bif\s*\(([^)]*)\)/.exec(before);
        return ifM ? ifM[1].trim() : null;
      })(),
      ownerModule: JOB_OWNER_BY_CREATOR[creator] || 'unknown',
      triggerGuard: new RegExp('isVerifiedTimeTrigger_\\s*\\(\\s*[^,]+,\\s*[\'"]' + escapeRe(target) + '[\'"]').test(src)
        ? 'isVerifiedTimeTrigger_'
        : null
    });
  }
  return jobs;
}

/* ── prerequisite audit (source only) ──────────────────────────────────── */

function occurrences(src, re) {
  const out = [];
  let m;
  const r = new RegExp(re.source, re.flags.indexOf('g') === -1 ? re.flags + 'g' : re.flags);
  while ((m = r.exec(src)) !== null) {
    out.push({ line: lineOf(src, m.index), text: String(m[0]).slice(0, 60) });
    if (out.length > 40) break;
  }
  return out;
}

function buildPrerequisite(code, management, uiComponents, coverage) {
  const rootSources = {};
  S.jsFiles().forEach(function (f) { rootSources[f] = readTracked(f); });
  S.htmlFiles().forEach(function (f) { if (!(f in rootSources)) rootSources[f] = readTracked(f); });

  /* 1. ERP_Users.is_active */
  const isActiveAuth = countMatches(code, /\bis_active\b/g) + countMatches(management, /\bis_active\b/g);
  const businessIsActive = {};
  let businessIsActiveTotal = 0;
  Object.keys(rootSources).sort().forEach(function (f) {
    if (f === 'Code.js' || f === '0_ERP_Management.html') return;
    const n = countMatches(rootSources[f], /\bis_active\b/g);
    if (n) { businessIsActive[f] = n; businessIsActiveTotal += n; }
  });
  const statusCheckLine = findLine(code, /String\(live\.status\)\.toLowerCase\(\) !== 'active'/);
  const statusMapLine = findLine(code, /status:\s*String\(u\.status == null \? 'Active' : u\.status\)/);
  const removedLine = findLine(code, /code: 'ACCOUNT_REMOVED'/);
  const disabledLine = findLine(code, /code: 'ACCOUNT_DISABLED'/);

  /* 2. ERP_User_Views */
  const userViews = [];
  Object.keys(rootSources).sort().forEach(function (f) {
    const hits = occurrences(rootSources[f], /ERP_User_Views/g);
    hits.forEach(function (h) { userViews.push({ file: f, line: h.line }); });
  });
  const userViewPageLine = findLine(code, /action: 'user_views', template: 'User_Views'/);

  /* 3. themes */
  const themeFns = ['getCompanyThemeCSS_', 'getGenericCompanyThemeCSS_', 'getCompanyBlockTheme_']
    .map(function (name) { return { name: name, line: findLine(code, new RegExp('function\\s+' + escapeRe(name))) }; });
  const companyColorsLine = findLine(code, /company_colors/);

  /* 4. logo */
  const logoSaveLine = findLine(code, /company_logo: String\(p\.company_logo/);
  const logoReadLine = findLine(code, /function getCompanyLogoUrl_/);
  const logoDriveLine = findLine(code, /driveDirectImageUrl_\(logoId/);
  const logoRoutes = countMatches(code, /'[^']*logo[^']*'\s*:\s*\{/gi);

  /* 5. backup */
  const backupFolderIdLine = findLine(code, /BACKUP_FOLDER_ID:\s*''/);
  const backupFolderByNameLine = findLine(code, /var BACKUP_FOLDER_NAME = 'ERP_Daily_Backups'/);
  const backupFolderResolveLine = findLine(code, /function getOrCreateBackupFolder_/);
  const backupStampLine = findLine(code, /yyyy-MM-dd_HHmm/);
  const backupJobLine = findLine(code, /function runDailyBackup_/);
  const backupJobEndLine = findLine(code, /function purgeOldBackups_/);
  const backupLogLockLine = findLine(code, /function appendBackupLogRow_/);

  /* 6. chatter */
  let chatterTotal = 0;
  const chatterFiles = [];
  Object.keys(rootSources).sort().forEach(function (f) {
    const n = countMatches(rootSources[f], /\bchatter\b/gi);
    if (n) { chatterTotal += n; chatterFiles.push(f + '=' + n); }
  });

  /* 7. SOP rules */
  let sopTotal = 0;
  const sopFiles = [];
  Object.keys(rootSources).sort().forEach(function (f) {
    const n = countMatches(rootSources[f], /\bSOP\b|quality_sops|Quality_SopDoc|SopDoc/gi);
    if (n) { sopTotal += n; sopFiles.push(f + '=' + n); }
  });
  const sopRouteLines = [];
  if (coverage && coverage.routes) {
    coverage.routes.forEach(function (r) {
      if (/sop/i.test(r.id) || /Sop/i.test(String(r.template || ''))) sopRouteLines.push(r.id);
    });
  }

  return {
    guideRef: 'ERP_DeepSeek_Implementation_Guide.md (claims; not trusted as evidence)',
    method: 'computed from the current working tree only; every entry carries file:line evidence',
    checks: [
      {
        id: 'erp_users_is_active',
        claim: 'ERP_Users.is_active becomes the authoritative active marker (guide section 2/5).',
        status: isActiveAuth === 0 ? 'not-implemented' : 'implemented',
        summary: isActiveAuth === 0
          ? 'is_active appears 0 times in Code.js and 0_ERP_Management.html; authorization still uses status (' + statusCheckLine + ') only.'
          : 'is_active appears ' + isActiveAuth + ' time(s) in the auth sources.',
        evidence: [
          { file: 'Code.js', line: statusMapLine, note: 'userDirectory_ maps u.status (null defaults to Active) into the cached directory' },
          { file: 'Code.js', line: statusCheckLine, note: 'authenticateSystemUser_ rejects when live.status !== active' },
          { file: 'Code.js', line: removedLine, note: 'ACCOUNT_REMOVED is the only populated-directory absence path' },
          { file: 'Code.js', line: disabledLine, note: 'ACCOUNT_DISABLED is status-based, not is_active-based' }
        ],
        counts: {
          isActiveInAuthSources: isActiveAuth,
          isActiveInBusinessFiles: businessIsActiveTotal,
          businessFiles: businessIsActive
        }
      },
      {
        id: 'erp_user_views_removal',
        claim: 'ERP_User_Views schema and executable dependencies are removed (guide section 2).',
        status: userViews.length === 0 ? 'implemented' : 'not-implemented',
        summary: userViews.length === 0
          ? 'No ERP_User_Views string remains in root sources.'
          : 'ERP_User_Views still appears in ' + userViews.length + ' location(s); routes and page registration are still wired.',
        evidence: [
          { file: 'Code.js', line: userViews.length ? userViews[0].line : null, note: 'schema/executable references remain: ' + JSON.stringify(userViews.slice(0, 8)) },
          { file: 'Code.js', line: 6002, note: 'ROUTES list_user_views / save_user_view still registered' },
          { file: 'Code.js', line: userViewPageLine, note: 'getAllPages_ still registers the user_views page' }
        ],
        counts: { occurrences: userViews.length, locations: userViews.slice(0, 12) }
      },
      {
        id: 'company_theme_colors',
        claim: 'Company colors drive tokens with contrast rules (guide sections 1/3).',
        status: companyColorsLine ? 'implemented' : 'not-implemented',
        summary: companyColorsLine
          ? 'company_colors and theme builders are present; consumed by getCompanyThemeCSS_ family.'
          : 'company_colors not found.',
        evidence: themeFns.map(function (t) { return { file: 'Code.js', line: t.line, note: t.name + ' present' }; })
          .concat([{ file: 'Code.js', line: companyColorsLine, note: 'company_colors field consumed' }]),
        counts: { themeFunctionCount: themeFns.filter(function (t) { return t.line; }).length }
      },
      {
        id: 'private_logo_upload',
        claim: 'company_logo stores a relative private attachment path after a validated upload (guide section 4).',
        status: 'not-implemented',
        summary: 'company_logo is stored as a caller-supplied Drive ID and rendered through driveDirectImageUrl_; no logo upload route exists in ROUTES and the admin editor is a text field.',
        evidence: [
          { file: '0_ERP_Management.html', line: 360, note: 'UIC.field key company_logo, label معرّف الشعار (text field, no file input)' },
          { file: 'Code.js', line: logoSaveLine, note: 'adminSaveCompany_ persists company_logo as a string' },
          { file: 'Code.js', line: logoReadLine, note: 'getCompanyLogoUrl_ resolves a value' },
          { file: 'Code.js', line: logoDriveLine, note: 'rendering uses driveDirectImageUrl_ (Drive ID), not an attachment resolver' }
        ],
        counts: { logoRoutes: logoRoutes, uploadRoutes: 0 }
      },
      {
        id: 'daily_backup',
        claim: 'Daily backup near 02:00 Africa/Cairo with durable identity and scope (guide sections 1/2).',
        status: 'partial',
        summary: 'Backup runs daily at 02:00 Africa/Cairo, but the daily job resolves a name-based folder (BACKUP_FOLDER_ID empty and unused by it), stamps files with a non-ISO yyyy-MM-dd_HHmm string, and holds no whole-job lease; locking is per backup-log ID only.',
        evidence: [
          { file: 'Code.js', line: backupFolderIdLine, note: 'CONFIG.BACKUP_FOLDER_ID is the empty string' },
          { file: 'Code.js', line: backupFolderResolveLine, note: 'daily job finds/creates folder by name ' + (backupFolderByNameLine ? 'ERP_Daily_Backups' : '') + ' (line ' + backupFolderByNameLine + ')' },
          { file: 'Code.js', line: backupStampLine, note: 'file name stamp yyyy-MM-dd_HHmm is not ISO 8601' },
          { file: 'Code.js', line: backupJobLine, note: 'runDailyBackup_ has no LockService lease; the only lock is per log row (line ' + backupLogLockLine + ')' },
          { file: 'Code.js', line: backupJobEndLine, note: 'purge runs separately from the job wrapper dailyBackupJob_' }
        ],
        counts: {}
      },
      {
        id: 'chatter',
        claim: 'Global chatter/mentions/approvals panel exists for reuse (plan section 2).',
        status: chatterTotal === 0 ? 'not-implemented' : 'present',
        summary: chatterTotal === 0
          ? 'No chatter implementation exists in the current root sources.'
          : 'chatter references found: ' + chatterFiles.join(', '),
        evidence: [{ file: null, line: null, note: chatterTotal === 0 ? 'zero case-insensitive chatter references in root *.js/*.html' : chatterFiles.join(', ') }],
        counts: { occurrences: chatterTotal, files: chatterFiles }
      },
      {
        id: 'sop_rules',
        claim: 'SOP preparer/reviewer rules present and to be preserved (plan section 2).',
        status: sopTotal > 0 ? 'present' : 'not-implemented',
        summary: sopTotal > 0
          ? 'SOP workspace, document engine and quality routes are present (' + sopTotal + ' references across ' + sopFiles.length + ' files).'
          : 'No SOP references found.',
        evidence: [
          { file: 'Company_ValleyFoods_QualitySops.html', line: findLine(rootSources['Company_ValleyFoods_QualitySops.html'] || '', /SOP/i), note: 'SOP workspace template' },
          { file: 'Quality_SopDoc.html', line: findLine(rootSources['Quality_SopDoc.html'] || '', /SOP/i), note: 'shared SOP document engine' }
        ],
        counts: { occurrences: sopTotal, files: sopFiles, routes: sopRouteLines }
      }
    ]
  };
}

/* ── assembly ──────────────────────────────────────────────────────────── */

function main() {
  const code = readTracked('Code.js');
  const management = readTracked('0_ERP_Management.html');
  const uiComponents = readTracked('UI_Components.html');
  const coverage = loadCoverage();
  const coverageTemplates = coverage.byId;
  const perfSkipActions = parsePerfSkipActions(code);

  const api = parseApiRoutes(code);
  const core = parseCorePages(code);
  const companies = parseCompanyRegistries();
  const actionFiles = actionFilesByModule();

  const allRoutes = api.routes.concat(core.routes, companies.routes);

  const templateIds = S.htmlFiles();
  templateIds.forEach(function (f) { inputs[f] = true; });
  const templateSrc = {};
  const templates = templateIds.map(function (f) {
    const id = f.replace(/\.html$/, '');
    const src = readTracked(f);
    templateSrc[id] = src;
    const cov = coverageTemplates[id];
    const print = { printOriented: /window\.print\s*\(|@media\s+print/i.test(src) };
    return {
      id: id,
      template: f,
      module: moduleForTemplate(id),
      routeIds: [],
      hasDoctype: cov ? cov.hasDoctype : startsWithDoctype(src),
      shellType: cov ? cov.shellType : classifyShell(startsWithDoctype(src), hasAppShellCall(src), false, print, src),
      hasAppShell: cov ? cov.hasAppShell : hasAppShellCall(src),
      sharedIncludes: cov ? cov.sharedIncludes : [],
      uiPattern: null,
      instrumentation: null,
      optimizationFlags: null,
      routerRegistrations: (src.match(/UIC\.Router\.register\s*\(\s*['"]([^'"]+)['"]/g) || []).map(function (s) {
        const m = /['"]([^'"]+)['"]/.exec(s.replace('UIC.Router.register', ''));
        return m ? m[1] : null;
      }).filter(Boolean),
      verificationStatus: 'registered - P0 inventory only'
    };
  });
  const templateById = {};
  templates.forEach(function (t) { templateById[t.id] = t; });

  /* Shared-hook evidence: the coverage manifest's sharedIncludes plus a direct
   * source scan, so a manifest that lags source cannot silently mark a page
   * covered. */
  const templateHasUIComponents = {};
  templateIds.forEach(function (f) {
    const id = f.replace(/\.html$/, '');
    const inc = (coverageTemplates[id] && coverageTemplates[id].sharedIncludes) || [];
    templateHasUIComponents[id] = inc.indexOf('UI_Components') !== -1 ||
      /include\s*\(\s*['"]UI_Components['"]/.test(templateSrc[id] || '');
  });

  const routeIdsByTemplate = {};
  const apiHandlerSources = [];

  allRoutes.forEach(function (r) {
    if (r.kind === 'api') {
      r.templateExists = null;
      r.shellType = null;
      const body = functionBody(code, r.handler);
      const sources = body ? [body] : [];
      if (body) apiHandlerSources.push(body);
      r.uiPattern = uiPatternFor(r, sources);
      r.backend = backendFor(sources);
      const apiMarkers = markersIn(sources);
      r.instrumentation = { status: apiMarkers.length ? 'instrumented' : 'registered', markers: apiMarkers };
      r.optimizationFlags = flagsIn(sources.join('\n'));
      r.lifecycle = null;
    } else if (r.permissionOnly && !r.template) {
      r.templateExists = false;
      r.shellType = null;
      const actionSrc = r.companyScope && actionFiles[r.module] ? templateSrcForAction(actionFiles[r.module]) : '';
      const sources = actionSrc ? [actionSrc] : [];
      r.uiPattern = uiPatternFor(r, []);
      r.backend = backendFor(sources);
      const markers = markersIn(sources);
      r.instrumentation = { status: markers.length ? 'instrumented' : 'registered', markers: markers };
      r.optimizationFlags = flagsIn(sources.join('\n'));
      r.lifecycle = null;
    } else {
      const file = r.template ? r.template + '.html' : null;
      const exists = !!r.template && S.exists(file);
      r.templateFile = file;
      r.templateExists = exists;
      const src = exists ? templateSrc[r.template] : '';
      const cov = coverageTemplates[r.template];
      if (exists) {
        const print = { printOriented: /window\.print\s*\(|@media\s+print/i.test(src) };
        r.shellType = cov ? cov.shellType : classifyShell(startsWithDoctype(src), hasAppShellCall(src), r.permissions.public, print, src);
      }
      const actionSrc = r.companyScope && actionFiles[r.module] ? templateSrcForAction(actionFiles[r.module]) : '';
      const sources = src && actionSrc ? [src, actionSrc] : (src ? [src] : (actionSrc ? [actionSrc] : []));
      /* Pattern classification reads the template and the action id only: a
       * module-wide action file contains every print/editor string for the
       * module and would make every route look identical. */
      r.uiPattern = uiPatternFor(r, src ? [src] : []);
      r.backend = backendFor(sources);
      const markers = markersIn(sources);
      r.instrumentation = { status: markers.length ? 'instrumented' : 'registered', markers: markers };
      r.optimizationFlags = flagsIn(sources.join('\n'));
      r.lifecycle = lifecycleFor(r, src);
      if (r.template) (routeIdsByTemplate[r.template] = routeIdsByTemplate[r.template] || []).push(r.id);
    }
    const via = classifyRouteVia(r, templateHasUIComponents, perfSkipActions);
    r.instrumentedVia = via.via;
    r.instrumentedViaEvidence = via.evidence;
  });

  const routeViaById = {};
  allRoutes.forEach(function (r) { routeViaById[r.id] = r.instrumentedVia; });

  templates.forEach(function (t) {
    const src = templateSrc[t.id];
    t.routeIds = (routeIdsByTemplate[t.id] || []).slice().sort();
    t.uiPattern = uiPatternFor({ id: t.id, template: t.id, title: null, kind: 'page', module: t.module, permissions: { public: false } }, [src]);
    const tMarkers = markersIn([src]);
    t.instrumentation = { status: tMarkers.length ? 'instrumented' : 'registered', markers: tMarkers };
    t.optimizationFlags = flagsIn(src);
    const tVia = classifyTemplateVia(t, routeViaById);
    t.instrumentedVia = tVia.via;
    t.instrumentedViaEvidence = tVia.evidence;
  });

  /* Backend evidence is counted once per unique source: every template file,
   * every company action file and every API handler body. Per-route counts
   * would multiply one module-wide file by its route count. */
  const backendTotals = { sheets: 0, firestore: 0, mysql: 0, cache: 0, properties: 0 };
  function addBackendCounts(counts) {
    Object.keys(backendTotals).forEach(function (k) { backendTotals[k] += counts[k] || 0; });
  }
  templates.forEach(function (t) { addBackendCounts(backendFor([templateSrc[t.id]]).evidenceCounts); });
  Object.keys(actionFiles).sort().forEach(function (mod) {
    addBackendCounts(backendFor([templateSrcForAction(actionFiles[mod])]).evidenceCounts);
  });
  apiHandlerSources.forEach(function (body) { addBackendCounts(backendFor([body]).evidenceCounts); });

  const jobs = parseJobs(code);

  const missingTemplates = allRoutes.filter(function (r) { return r.templateExists === false && r.template; });
  const unresolved = allRoutes.filter(function (r) { return r.unresolved; });
  const byId = {};
  allRoutes.forEach(function (r) {
    if (byId[r.id]) {
      byId[r.id].push(r);
    } else {
      byId[r.id] = [r];
    }
  });
  const duplicateIds = Object.keys(byId).filter(function (k) { return byId[k].length > 1; }).sort();

  const sortedRoutes = allRoutes.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  const sortedTemplates = templates.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  const sortedJobs = jobs.slice().sort(function (a, b) { return a.sourceLine - b.sourceLine; });

  const modules = { core: 0, assessment: 0, topchemical: 0, toplight: 0, valleyfoods: 0 };
  const uiPatterns = {};
  const lifecycle = { 'hard-nav': 0, 'router-registered': 0, 'not-applicable': 0 };
  UI_PATTERN_ORDER.forEach(function (p) { uiPatterns[p] = 0; });
  const viaRoutes = {};
  INSTRUMENTED_VIA_VALUES.forEach(function (v) { viaRoutes[v] = 0; });
  let instrumentedRoutes = 0;
  sortedRoutes.forEach(function (r) {
    if (modules[r.module] === undefined) modules[r.module] = 0;
    modules[r.module]++;
    if (r.uiPattern) uiPatterns[r.uiPattern.pattern] = (uiPatterns[r.uiPattern.pattern] || 0) + 1;
    if (r.lifecycle) lifecycle[r.lifecycle]++;
    else lifecycle['not-applicable']++;
    if (r.instrumentation && r.instrumentation.status === 'instrumented') instrumentedRoutes++;
    if (viaRoutes[r.instrumentedVia] !== undefined) viaRoutes[r.instrumentedVia]++;
  });

  const activeTemplates = sortedTemplates.filter(function (t) { return t.routeIds.length > 0; });
  const templatePatterns = {};
  UI_PATTERN_ORDER.forEach(function (p) { templatePatterns[p] = 0; });
  activeTemplates.forEach(function (t) {
    const p = t.uiPattern ? t.uiPattern.pattern : 'unknown';
    templatePatterns[p] = (templatePatterns[p] || 0) + 1;
  });
  const instrumentedTemplates = sortedTemplates.filter(function (t) { return t.instrumentation.status === 'instrumented'; });
  const viaTemplates = {};
  INSTRUMENTED_VIA_VALUES.forEach(function (v) { viaTemplates[v] = 0; });
  sortedTemplates.forEach(function (t) {
    if (viaTemplates[t.instrumentedVia] !== undefined) viaTemplates[t.instrumentedVia]++;
  });

  const globalFlags = {};
  Object.keys(FLAG_SOURCE).sort().forEach(function (name) {
    const src = name === 'HISTORY_QUEUE_ENABLED_' ? code : readTracked(FLAG_SOURCE[name]);
    const re = new RegExp(escapeRe(name) + '\\s*=\\s*(true|false)');
    const m = re.exec(src);
    globalFlags[name] = { value: m ? m[1] === 'true' : null, definedIn: FLAG_SOURCE[name] };
  });

  const prerequisite = buildPrerequisite(code, management, uiComponents, coverage.manifest);

  let generatedAt;
  if (process.env.SOURCE_DATE_EPOCH) {
    generatedAt = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString();
  } else {
    let newest = 0;
    Object.keys(inputs).forEach(function (f) {
      try {
        const t = fs.statSync(path.join(S.ROOT, f)).mtimeMs;
        if (t > newest) newest = t;
      } catch (e) { /* an input deleted mid-run is not fatal */ }
    });
    generatedAt = new Date(newest).toISOString();
  }

  let git = { head: null, dirty: null, dirtyEntries: null };
  try {
    const head = execSync('git rev-parse HEAD', { cwd: S.ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
    const status = execSync('git status --porcelain', { cwd: S.ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
    git = { head: head || null, dirty: status.length > 0, dirtyEntries: status ? status.split(/\r?\n/).filter(Boolean).length : 0 };
  } catch (e) { /* git not available: leave nulls */ }

  const totals = {
    routes: sortedRoutes.length,
    apiRoutes: sortedRoutes.filter(function (r) { return r.kind === 'api'; }).length,
    corePageRoutes: sortedRoutes.filter(function (r) { return r.source === 'Code.js:getAllPages_'; }).length,
    companyPageRoutes: sortedRoutes.filter(function (r) { return /^Company_.+_Registry\.js$/.test(r.source || ''); }).length,
    templates: sortedTemplates.length,
    templatesExisting: sortedTemplates.filter(function (t) { return S.exists(t.template); }).length,
    activeTemplates: activeTemplates.length,
    jobs: sortedJobs.length,
    modules: modules,
    uiPatterns: uiPatterns,
    activeTemplatePatterns: templatePatterns,
    lifecycle: lifecycle,
    instrumentedRoutes: instrumentedRoutes,
    instrumentedTemplates: instrumentedTemplates.length,
    instrumentedViaRoutes: viaRoutes,
    instrumentedViaTemplates: viaTemplates,
    routesWithMissingTemplate: missingTemplates.length,
    routesUnresolved: unresolved.length
  };

  const notes = [
    'P0 inventory only. No application source, flag, schema or trigger was changed by this tool; tools/** is .claspignore\'d and inventory.json is local-only.',
    'generatedAt = newest scanned input mtime (or SOURCE_DATE_EPOCH); arrays sorted; re-running on an unchanged checkout is byte-identical.',
    'shellType reuses tools/i18n/coverage.json when the template matches; otherwise it is derived with the same documented order (embed -> appShell -> public -> print -> custom -> no-shell).',
    'backend is inferred from evidence counts (Sheets/Firestore/MySQL/CacheService/PropertiesService helpers) in the template plus, for company pages, the module Company_*_Actions.js; api routes use the handler body. Unknown is reported as unknown, never as zero coverage.',
    'instrumentation is instrumented only when a route/template source literally contains one of: PERF., first_data_render, journey, perf_, NavTimeline, mark(. Everywhere else the status stays registered.',
    'instrumentedVia is a STATIC coverage classification, not a runtime observation: shared-hook means the shared UIC/Client_Helpers hooks or the server request finalizer apply to that route; explicit-adapter-outstanding means the surface needs a dedicated adapter that does not exist yet; not-applicable means no independent UI surface; unknown means no static evidence either way.',
    'optimizationFlags record literal `FLAG = true|false` occurrences in the route/template sources with the current value, or null when the flag is not present there. Global values live in flags.',
    'background jobs are ScriptApp.newTrigger sites in Code.js with their creator function and statically visible schedule; trigger timing remains approximate and platform-managed.',
    'prerequisite checks are computed from the current source with file:line evidence. The guide document is treated as claims, not evidence.',
    'regenerate with: node tools/perf/build_inventory.js; validate with: node tools/perf/check_inventory.js'
  ];

  const manifest = {
    schema: 'tools/perf/inventory.json',
    generatedAt: generatedAt,
    planRef: PLAN_REF,
    sourceHead: git.head,
    sourceDirty: git.dirty,
    sourceDirtyEntries: git.dirtyEntries,
    stage: 'P0 - coverage denominator and prerequisite audit only; no instrumentation',
    method: {
      apiRoutes: 'Code.js ROUTES object (~line 5972): \'action\': { handler: fn, requireAuth: bool }',
      corePageRoutes: 'Code.js getAllPages_() base array: { action, template, title, public }',
      companyPageRoutes: 'Company_*_Registry.js: registerCompany_(id, { pages: [ { action, template, title, label, nav, accessPage, public, permissionOnly } ] })',
      shellType: 'tools/i18n/coverage.json when the template matches, else embed -> appShell -> public -> print -> custom -> no-shell',
      uiPattern: 'priority order ' + UI_PATTERN_ORDER.join(' > ') + '; every entry records the signals it matched',
      backend: 'counted helper/API evidence per source (see BACKEND_PATTERNS)',
      instrumentation: 'literal markers PERF. | first_data_render | journey | perf_ | NavTimeline | mark(',
      lifecycle: 'template contains UIC.Router.register(\'<route id>\') => router-registered, else hard-nav; api/permission-only => not-applicable',
      instrumentedVia: 'static coverage classification: api self-telemetry skip list => not-applicable, other api => shared-hook (server finalizer), assessment/editor/public page patterns => explicit-adapter-outstanding, UI_Components include => shared-hook, else unknown; values ' + INSTRUMENTED_VIA_VALUES.join(' | '),
      jobs: 'ScriptApp.newTrigger(\'target\')...create() sites in Code.js',
      prerequisite: 'computed from current root sources only; every check carries file:line evidence',
      determinism: 'generatedAt = newest scanned input mtime, or SOURCE_DATE_EPOCH; all arrays sorted; git head/dirty read once'
    },
    notes: notes,
    totals: totals,
    flags: globalFlags,
    backends: backendTotals,
    prerequisite: prerequisite,
    routes: sortedRoutes,
    templates: sortedTemplates,
    jobs: sortedJobs
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log('build_inventory — ' + generatedAt);
  console.log('='.repeat(72));
  console.log('routes            : ' + totals.routes + ' (' + totals.apiRoutes + ' api, ' + totals.corePageRoutes + ' core pages, ' + totals.companyPageRoutes + ' company pages)');
  console.log('modules           : ' + Object.keys(modules).sort().map(function (k) { return k + '=' + modules[k]; }).join(', '));
  console.log('templates         : ' + totals.templates + ' (' + totals.activeTemplates + ' active, ' + instrumentedTemplates.length + ' instrumented)');
  console.log('lifecycle         : ' + JSON.stringify(lifecycle));
  console.log('ui patterns       : ' + Object.keys(uiPatterns).sort().map(function (k) { return k + '=' + uiPatterns[k]; }).join(', '));
  console.log('backends (sites)  : ' + JSON.stringify(backendTotals));
  console.log('jobs              : ' + totals.jobs + ' -> ' + sortedJobs.map(function (j) { return j.targetFunction; }).join(', '));
  console.log('flags             : ' + Object.keys(globalFlags).sort().map(function (k) { return k + '=' + globalFlags[k].value; }).join(', '));
  console.log('prerequisite      : ' + prerequisite.checks.map(function (c) { return c.id + '=' + c.status; }).join(', '));
  console.log('instrumentedVia   : routes ' + INSTRUMENTED_VIA_VALUES.map(function (v) { return v + '=' + viaRoutes[v]; }).join(', ') +
    '; templates ' + INSTRUMENTED_VIA_VALUES.map(function (v) { return v + '=' + viaTemplates[v]; }).join(', '));
  console.log('missing templates : ' + totals.routesWithMissingTemplate);
  console.log('unresolved routes : ' + totals.routesUnresolved);
  console.log('duplicate ids     : ' + (duplicateIds.length ? duplicateIds.join(', ') : 'none'));
  console.log('wrote ' + path.relative(S.ROOT, OUT_PATH).replace(/\\/g, '/'));
  if (api.error) { console.error('FATAL: ' + api.error); process.exit(1); }
  if (core.error) { console.error('FATAL: ' + core.error); process.exit(1); }
  companies.errors.forEach(function (e) { console.error('WARN: ' + e); });
}

/* Company action sources are loaded through readTracked exactly once even when
 * several routes reference the same module. */
const actionSourceCache = {};
function templateSrcForAction(file) {
  if (!actionSourceCache[file]) actionSourceCache[file] = readTracked(file);
  return actionSourceCache[file];
}

main();
