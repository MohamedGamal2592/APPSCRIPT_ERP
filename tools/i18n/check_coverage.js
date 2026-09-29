/**
 * check_coverage.js — validator for tools/i18n/coverage.json.
 *
 *     node tools/i18n/check_coverage.js
 *
 * Exits 0 with a summary when the manifest is internally consistent and still
 * matches the working tree, and 1 with the specifics when it is not:
 *
 *   - the JSON parses and has the Stage A top-level sections;
 *   - every route entry maps to an existing root template or is explicitly
 *     flagged `missingTemplate: true` (API routes / permission tokens are
 *     `not-applicable` / `permission-only`) — unresolved entries must carry a
 *     reason, never a guess;
 *   - every top-level root *.html (except appsheet_old_project.html) appears
 *     exactly once in `templates`;
 *   - `noShellQueue` is RE-DERIVED from the files on disk (doctype start and
 *     no literal UIC.appShell call) and compared with the recorded queue;
 *   - counts in `totals` match the arrays.
 *
 * It re-reads the source files rather than trusting the manifest's own flags,
 * so a manifest left behind after a template/registry change fails here.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('../lib/sources');

const MANIFEST_PATH = path.join(__dirname, 'coverage.json');
const failures = [];

function fail(msg) { failures.push(msg); }

function read(rel) {
  return fs.readFileSync(path.join(S.ROOT, rel), 'utf8').replace(/^\uFEFF/, '');
}

function blankBlockComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); });
}

function blankLineComments(s) {
  return s.replace(/(^|[;\s])\/\/[^\n]*/g, function (m, p1) { return p1 + new Array(m.length - p1.length + 1).join(' '); });
}

function startsWithDoctype(src) { return /^\s*<!doctype\s+html/i.test(src); }

function hasAppShellCall(src) {
  return /UIC\.appShell\s*\(/.test(blankLineComments(blankBlockComments(src)));
}

function existsTemplate(base) { return typeof base === 'string' && S.exists(base + '.html'); }

/* ── load ──────────────────────────────────────────────────────────────── */

let m;
try {
  m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (e) {
  console.error('check_coverage: coverage.json does not parse — ' + e.message);
  console.error('run: node tools/i18n/build_coverage.js');
  process.exit(1);
}

['generatedAt', 'planRef', 'totals', 'routes', 'templates', 'noShellQueue', 'serverGeneratedPages'].forEach(function (k) {
  if (m[k] === undefined) fail('missing top-level key: ' + k);
});
if (!Array.isArray(m.routes) || !Array.isArray(m.templates) || !Array.isArray(m.noShellQueue) || !Array.isArray(m.serverGeneratedPages)) {
  console.error('check_coverage: routes/templates/noShellQueue/serverGeneratedPages must be arrays');
  process.exit(1);
}

/* ── templates: filesystem set equality, exactly once ──────────────────── */

const diskTemplates = S.htmlFiles();
const diskSet = {};
diskTemplates.forEach(function (f) { diskSet[f.replace(/\.html$/, '')] = f; });

const seen = {};
m.templates.forEach(function (t) {
  const id = t.id;
  const base = String(t.template || '').replace(/\.html$/, '');
  if (!id || base !== id) fail('template entry id/template mismatch: ' + JSON.stringify(t.id) + ' vs ' + JSON.stringify(t.template));
  if (seen[id]) fail('template appears more than once: ' + id);
  seen[id] = t;
  if (!diskSet[id]) fail('template listed in manifest but not on disk: ' + id);
});
Object.keys(diskSet).sort().forEach(function (id) {
  if (!seen[id]) fail('root template missing from manifest: ' + diskSet[id]);
});

m.templates.forEach(function (t) {
  if (!t.verificationStatus) fail('template ' + t.id + ': no verificationStatus');
  if (typeof t.hasDoctype !== 'boolean' || typeof t.hasAppShell !== 'boolean') {
    fail('template ' + t.id + ': hasDoctype/hasAppShell must be boolean');
    return;
  }
  const src = read(t.template);
  const diskDoctype = startsWithDoctype(src);
  const diskShell = hasAppShellCall(src);
  if (diskDoctype !== t.hasDoctype) fail('template ' + t.id + ': hasDoctype is ' + t.hasDoctype + ' but the file says ' + diskDoctype);
  if (diskShell !== t.hasAppShell) fail('template ' + t.id + ': hasAppShell is ' + t.hasAppShell + ' but the file says ' + diskShell);
});

/* ── routes: template mapping or explicit flags ────────────────────────── */

const routeIds = {};
m.routes.forEach(function (r) {
  if (!r.id) { fail('route with no id: ' + JSON.stringify(r)); return; }
  if (routeIds[r.id]) fail('duplicate route id: ' + r.id);
  routeIds[r.id] = r;
  if (!r.verificationStatus) fail('route ' + r.id + ': no verificationStatus');
  if (r.unresolved) {
    if (!r.unresolvedReason) fail('route ' + r.id + ': unresolved without a reason');
    return;
  }
  if (r.kind === 'api') {
    if (r.template !== null) fail('route ' + r.id + ': api route must not carry a template');
    if (r.templateStatus !== 'not-applicable') fail('route ' + r.id + ': api route templateStatus must be not-applicable');
    return;
  }
  if (r.permissionOnly) {
    if (r.template !== null) fail('route ' + r.id + ': permission-only entry must not carry a template');
    if (r.templateStatus !== 'permission-only') fail('route ' + r.id + ': permission-only templateStatus must be permission-only');
    return;
  }
  if (!r.template) { fail('route ' + r.id + ': no template and not flagged permission-only/unresolved'); return; }
  if (existsTemplate(r.template)) {
    if (r.missingTemplate !== false) fail('route ' + r.id + ': template ' + r.template + ' exists but missingTemplate is not false');
    if (r.templateStatus !== 'present') fail('route ' + r.id + ': template exists but templateStatus is ' + r.templateStatus);
    if (!seen[r.template]) fail('route ' + r.id + ': template ' + r.template + ' is not in the templates inventory');
  } else {
    if (r.missingTemplate !== true) fail('route ' + r.id + ': template ' + r.template + ' is missing but missingTemplate is not true');
    if (r.templateStatus !== 'missingTemplate') fail('route ' + r.id + ': missing template but templateStatus is ' + r.templateStatus);
  }
});

/* ── no-shell queue: re-derive from disk ───────────────────────────────── */

const derivedQueue = diskTemplates
  .filter(function (f) {
    const src = read(f);
    return startsWithDoctype(src) && !hasAppShellCall(src);
  })
  .map(function (f) { return f.replace(/\.html$/, ''); })
  .sort();

const recordedQueue = m.noShellQueue.map(function (q) { return q.id; }).slice().sort();
if (derivedQueue.join('\n') !== recordedQueue.join('\n')) {
  const missing = derivedQueue.filter(function (id) { return recordedQueue.indexOf(id) === -1; });
  const stale = recordedQueue.filter(function (id) { return derivedQueue.indexOf(id) === -1; });
  if (missing.length) fail('no-shell queue missing derived entries: ' + missing.join(', '));
  if (stale.length) fail('no-shell queue contains entries that no longer qualify: ' + stale.join(', '));
}
m.noShellQueue.forEach(function (q) {
  if (!q.template || !q.shellType) fail('no-shell queue entry ' + q.id + ': missing template/shellType');
  if (typeof q.interactive !== 'boolean') fail('no-shell queue entry ' + q.id + ': interactive must be boolean');
});

/* ── generated pages ───────────────────────────────────────────────────── */

if (!m.serverGeneratedPages.length) fail('serverGeneratedPages is empty — Code.js emits full HTML pages');
m.serverGeneratedPages.forEach(function (p, i) {
  if (typeof p.line !== 'number' || !p.function || !p.purpose) {
    fail('serverGeneratedPages[' + i + ']: line/function/purpose required');
  }
});

/* ── totals consistency ────────────────────────────────────────────────── */

const expectedTotals = {
  templates: m.templates.length,
  routes: m.routes.length,
  apiRoutes: m.routes.filter(function (r) { return r.kind === 'api'; }).length,
  corePageRoutes: m.routes.filter(function (r) { return r.source === 'Code.js:getAllPages_'; }).length,
  companyPageRoutes: m.routes.filter(function (r) { return /^Company_.+_Registry\.js$/.test(r.source || ''); }).length,
  appShellTemplates: m.templates.filter(function (t) { return t.shellType === 'appShell'; }).length,
  noShellQueue: m.noShellQueue.length,
  generatedPages: m.serverGeneratedPages.length,
  routesWithMissingTemplate: m.routes.filter(function (r) { return r.missingTemplate === true; }).length,
  routesUnresolved: m.routes.filter(function (r) { return r.unresolved === true; }).length
};
Object.keys(expectedTotals).forEach(function (k) {
  const have = m.totals ? m.totals[k] : undefined;
  if (have !== expectedTotals[k]) fail('totals.' + k + ' is ' + have + ' but the arrays say ' + expectedTotals[k]);
});

/* ── report ────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error('check_coverage: ' + failures.length + ' failure(s)');
  failures.forEach(function (f) { console.error('  FAIL ' + f); });
  process.exit(1);
}

const missingList = m.routes.filter(function (r) { return r.missingTemplate === true; });
const unresolvedList = m.routes.filter(function (r) { return r.unresolved === true; });
console.log('check_coverage: OK — ' + m.templates.length + ' templates, ' + m.routes.length + ' routes ' +
  '(' + m.totals.apiRoutes + ' api, ' + m.totals.corePageRoutes + ' core pages, ' + m.totals.companyPageRoutes + ' company pages), ' +
  m.noShellQueue.length + ' no-shell queue items, ' + m.serverGeneratedPages.length + ' generated pages.');
console.log('  routes with missing templates: ' + missingList.length +
  (missingList.length ? ' -> ' + missingList.map(function (r) { return r.id + ':' + r.template; }).join(', ') : ''));
console.log('  unresolved routes: ' + unresolvedList.length +
  (unresolvedList.length ? ' -> ' + unresolvedList.map(function (r) { return r.id; }).join(', ') : ''));
console.log('  generated ' + m.generatedAt + ' — ' + m.planRef);
