/**
 * check_inventory.js — validator for tools/perf/inventory.json.
 *
 *     node tools/perf/check_inventory.js
 *
 * Exits 0 with a summary when the manifest is internally consistent and still
 * matches the working tree, and 1 with the specifics when it is not:
 *
 *   - the JSON parses and carries the P0 top-level sections;
 *   - every route id is unique and every page route maps to an existing root
 *     template (or is explicitly api / permissionOnly / flagged unresolved);
 *   - every root *.html appears exactly once in `templates`;
 *   - every background job names a creator and target function that still exist
 *     in Code.js, and its source line is inside the file;
 *   - the seven prerequisite checks are present, use a known status and carry
 *     at least one evidence note;
 *   - the six optimization flags and HISTORY_QUEUE_ENABLED_ still hold the
 *     values this P0 baseline recorded (existing flags false, queue true);
 *   - route count agrees with tools/i18n/coverage.json (run both builders);
 *   - every `totals` value matches the arrays.
 *
 * It re-reads the source files rather than trusting the manifest's own flags,
 * so a manifest left behind after a source change fails here.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('../lib/sources');

const MANIFEST_PATH = path.join(__dirname, 'inventory.json');
const COVERAGE_PATH = path.join(__dirname, '..', 'i18n', 'coverage.json');
const failures = [];

function fail(msg) { failures.push(msg); }

const MODULES = { core: true, assessment: true, topchemical: true, toplight: true, valleyfoods: true, shared: true };
const PATTERNS = {
  admin: true, public: true, print: true, report: true, dashboard: true, list: true,
  'simple-form': true, 'master-detail': true, editor: true, assessment: true,
  attachment: true, lookup: true, unknown: true
};
const BACKENDS = { sheets: true, firestore: true, mysql: true, mixed: true, unknown: true };
const FLAG_NAMES = ['FAST_READ_CORE_', 'FAST_VIEW_CORE_', 'FAST_SAVE_CORE_', 'FORM_STATE_CORE_', 'SALES_ONE_REQUEST_', 'TABLE_REFRESH_ON_'];
const PREREQ_IDS = ['erp_users_is_active', 'erp_user_views_removal', 'company_theme_colors', 'private_logo_upload', 'daily_backup', 'chatter', 'sop_rules'];
const PREREQ_STATUS = { implemented: true, partial: true, present: true, 'not-implemented': true, unknown: true };

/* ── load ──────────────────────────────────────────────────────────────── */

let m;
try {
  m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (e) {
  console.error('check_inventory: inventory.json does not parse — ' + e.message);
  console.error('run: node tools/perf/build_inventory.js');
  process.exit(1);
}

['generatedAt', 'planRef', 'totals', 'flags', 'backends', 'prerequisite', 'routes', 'templates', 'jobs'].forEach(function (k) {
  if (m[k] === undefined) fail('missing top-level key: ' + k);
});
if (!Array.isArray(m.routes) || !Array.isArray(m.templates) || !Array.isArray(m.jobs)) {
  console.error('check_inventory: routes/templates/jobs must be arrays');
  process.exit(1);
}
if (!['string', 'object'].includes(typeof m.generatedAt)) fail('generatedAt must be a string');
if (m.generatedAt === null || m.generatedAt === '') fail('generatedAt is empty');

/* ── templates: filesystem set equality, exactly once ──────────────────── */

const diskTemplates = S.htmlFiles();
const diskSet = {};
diskTemplates.forEach(function (f) { diskSet[f.replace(/\.html$/, '')] = f; });

const seenTemplates = {};
m.templates.forEach(function (t) {
  const id = t.id;
  const base = String(t.template || '').replace(/\.html$/, '');
  if (!id || base !== id) fail('template entry id/template mismatch: ' + JSON.stringify(t.id) + ' vs ' + JSON.stringify(t.template));
  if (seenTemplates[id]) fail('template appears more than once: ' + id);
  seenTemplates[id] = t;
  if (!diskSet[id]) fail('template listed in inventory but not on disk: ' + id);
  if (!MODULES[t.module]) fail('template ' + id + ': unknown module ' + t.module);
  if (t.uiPattern && !PATTERNS[t.uiPattern.pattern]) fail('template ' + id + ': unknown uiPattern ' + t.uiPattern.pattern);
  if (!t.instrumentation || ['registered', 'instrumented'].indexOf(t.instrumentation.status) === -1) {
    fail('template ' + id + ': instrumentation.status must be registered|instrumented');
  }
  if (!Array.isArray(t.routeIds)) fail('template ' + id + ': routeIds must be an array');
});
Object.keys(diskSet).sort().forEach(function (id) {
  if (!seenTemplates[id]) fail('root template missing from inventory: ' + diskSet[id]);
});

/* Route ids that reference a template must agree with the template's routeIds. */
const routeById = {};
m.routes.forEach(function (r) {
  if (!r.id) { fail('route with no id: ' + JSON.stringify(r)); return; }
  if (routeById[r.id]) fail('duplicate route id: ' + r.id);
  routeById[r.id] = r;
});
m.templates.forEach(function (t) {
  (t.routeIds || []).forEach(function (id) {
    const r = routeById[id];
    if (!r) fail('template ' + t.id + ' lists route id not present in routes: ' + id);
    else if (r.template !== t.id) fail('route ' + id + ' is listed under template ' + t.id + ' but carries template ' + r.template);
  });
});

/* ── routes: template mapping or explicit flags ────────────────────────── */

m.routes.forEach(function (r) {
  if (!MODULES[r.module]) fail('route ' + r.id + ': unknown module ' + r.module);
  if (r.status !== 'registered') fail('route ' + r.id + ': status must be registered in P0');
  if (!r.uiPattern || !PATTERNS[r.uiPattern.pattern]) fail('route ' + r.id + ': unknown uiPattern ' + (r.uiPattern && r.uiPattern.pattern));
  else if (!r.uiPattern.evidence) fail('route ' + r.id + ': uiPattern has no evidence signal');
  if (!r.backend || !BACKENDS[r.backend.kind]) fail('route ' + r.id + ': unknown backend kind ' + (r.backend && r.backend.kind));
  if (!r.instrumentation || ['registered', 'instrumented'].indexOf(r.instrumentation.status) === -1) {
    fail('route ' + r.id + ': instrumentation.status must be registered|instrumented');
  }
  if (!r.optimizationFlags || FLAG_NAMES.some(function (f) { return !(f in r.optimizationFlags); })) {
    fail('route ' + r.id + ': optimizationFlags must carry all ' + FLAG_NAMES.length + ' flags');
  }
  if (r.unresolved) {
    if (!r.unresolvedReason) fail('route ' + r.id + ': unresolved without a reason');
    return;
  }
  if (r.kind === 'api') {
    if (r.template !== null) fail('route ' + r.id + ': api route must not carry a template');
    if (r.templateExists !== null) fail('route ' + r.id + ': api route templateExists must be null');
    if (r.lifecycle !== null) fail('route ' + r.id + ': api route lifecycle must be null');
    if (!r.handler) fail('route ' + r.id + ': api route has no handler');
    return;
  }
  if (r.kind !== 'page') fail('route ' + r.id + ': kind must be api|page');
  if (r.permissions.permissionOnly && !r.template) {
    if (r.templateExists !== false) fail('route ' + r.id + ': permission-only route templateExists must be false');
    if (r.lifecycle !== null) fail('route ' + r.id + ': permission-only route lifecycle must be null');
    return;
  }
  if (!r.template) { fail('route ' + r.id + ': no template and not flagged permissionOnly/unresolved'); return; }
  const exists = S.exists(r.template + '.html');
  if (exists !== r.templateExists) fail('route ' + r.id + ': templateExists is ' + r.templateExists + ' but the file says ' + exists);
  if (r.templateFile !== r.template + '.html') fail('route ' + r.id + ': templateFile must be ' + r.template + '.html');
  if (!exists) { fail('route ' + r.id + ': template ' + r.template + ' is missing and not flagged'); return; }
  if (!seenTemplates[r.template]) fail('route ' + r.id + ': template ' + r.template + ' is not in the templates inventory');
  if (['hard-nav', 'router-registered'].indexOf(r.lifecycle) === -1) {
    fail('route ' + r.id + ': page route lifecycle must be hard-nav|router-registered');
  }
});

/* ── background jobs ───────────────────────────────────────────────────── */

let code = '';
try {
  code = fs.readFileSync(path.join(S.ROOT, 'Code.js'), 'utf8');
} catch (e) {
  fail('Code.js cannot be read: ' + e.message);
}
const codeLines = code.split('\n').length;
const jobIds = {};
m.jobs.forEach(function (j) {
  if (jobIds[j.id]) fail('duplicate job id: ' + j.id);
  jobIds[j.id] = true;
  if (typeof j.sourceLine !== 'number' || j.sourceLine < 1 || j.sourceLine > codeLines) {
    fail('job ' + j.id + ': sourceLine ' + j.sourceLine + ' is outside Code.js');
  }
  if (!j.creatorFunction || !new RegExp('function\\s+' + j.creatorFunction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(').test(code)) {
    fail('job ' + j.id + ': creator function ' + j.creatorFunction + ' not found in Code.js');
  }
  if (!j.targetFunction || !new RegExp('function\\s+' + j.targetFunction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(').test(code)) {
    fail('job ' + j.id + ': target function ' + j.targetFunction + ' not found in Code.js');
  }
  if (!j.schedule) fail('job ' + j.id + ': empty schedule');
  if (!MODULES[j.ownerModule] && j.ownerModule !== 'backup') fail('job ' + j.id + ': unknown ownerModule ' + j.ownerModule);
});

/* ── prerequisite checks ───────────────────────────────────────────────── */

if (!m.prerequisite || !Array.isArray(m.prerequisite.checks)) {
  fail('prerequisite.checks must be an array');
} else {
  const ids = {};
  m.prerequisite.checks.forEach(function (c) {
    ids[c.id] = c;
    if (!PREREQ_STATUS[c.status]) fail('prerequisite ' + c.id + ': unknown status ' + c.status);
    if (!Array.isArray(c.evidence) || !c.evidence.length) fail('prerequisite ' + c.id + ': no evidence');
    if (!c.summary) fail('prerequisite ' + c.id + ': no summary');
  });
  PREREQ_IDS.forEach(function (id) {
    if (!ids[id]) fail('prerequisite check missing: ' + id);
  });
}

/* ── flags: the P0 baseline this ledger records ────────────────────────── */

FLAG_NAMES.forEach(function (name) {
  const f = m.flags ? m.flags[name] : undefined;
  if (!f) { fail('flags.' + name + ' missing'); return; }
  if (f.value !== false) fail('flags.' + name + ' is ' + f.value + ' but the P0 baseline records false (source or baseline changed)');
});
const hq = m.flags ? m.flags.HISTORY_QUEUE_ENABLED_ : undefined;
if (!hq) fail('flags.HISTORY_QUEUE_ENABLED_ missing');
else if (hq.value !== true) fail('flags.HISTORY_QUEUE_ENABLED_ is ' + hq.value + ' but the P0 baseline records true');

/* ── coverage agreement ────────────────────────────────────────────────── */

try {
  const cov = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  if (cov.totals && typeof cov.totals.routes === 'number' && cov.totals.routes !== m.routes.length) {
    fail('route count drift: inventory has ' + m.routes.length + ' routes but tools/i18n/coverage.json has ' +
      cov.totals.routes + ' — run `node tools/i18n/build_coverage.js` and `node tools/perf/build_inventory.js`');
  }
} catch (e) {
  fail('tools/i18n/coverage.json cannot be read: ' + e.message);
}

/* ── totals consistency ────────────────────────────────────────────────── */

function countBy(arr, fn) {
  const out = {};
  arr.forEach(function (x) { const k = fn(x); out[k] = (out[k] || 0) + 1; });
  return out;
}
function zeroed(keys) {
  const out = {};
  keys.forEach(function (k) { out[k] = 0; });
  return out;
}

const modules = zeroed(['core', 'assessment', 'topchemical', 'toplight', 'valleyfoods']);
m.routes.forEach(function (r) { modules[r.module] = (modules[r.module] || 0) + 1; });
const routePatterns = countBy(m.routes, function (r) { return r.uiPattern.pattern; });
const templatePatterns = zeroed(Object.keys(PATTERNS));
m.templates.filter(function (t) { return (t.routeIds || []).length > 0; }).forEach(function (t) {
  const p = t.uiPattern ? t.uiPattern.pattern : 'unknown';
  templatePatterns[p] = (templatePatterns[p] || 0) + 1;
});
const lifecycle = zeroed(['hard-nav', 'router-registered', 'not-applicable']);
m.routes.forEach(function (r) { lifecycle[r.lifecycle || 'not-applicable']++; });

const expected = {
  routes: m.routes.length,
  apiRoutes: m.routes.filter(function (r) { return r.kind === 'api'; }).length,
  corePageRoutes: m.routes.filter(function (r) { return r.source === 'Code.js:getAllPages_'; }).length,
  companyPageRoutes: m.routes.filter(function (r) { return /^Company_.+_Registry\.js$/.test(r.source || ''); }).length,
  templates: m.templates.length,
  templatesExisting: m.templates.filter(function (t) { return S.exists(t.template); }).length,
  activeTemplates: m.templates.filter(function (t) { return (t.routeIds || []).length > 0; }).length,
  jobs: m.jobs.length,
  instrumentedRoutes: m.routes.filter(function (r) { return r.instrumentation && r.instrumentation.status === 'instrumented'; }).length,
  instrumentedTemplates: m.templates.filter(function (t) { return t.instrumentation && t.instrumentation.status === 'instrumented'; }).length,
  routesWithMissingTemplate: m.routes.filter(function (r) { return r.templateExists === false && r.template; }).length,
  routesUnresolved: m.routes.filter(function (r) { return r.unresolved === true; }).length
};
Object.keys(expected).forEach(function (k) {
  const have = m.totals ? m.totals[k] : undefined;
  if (have !== expected[k]) fail('totals.' + k + ' is ' + have + ' but the arrays say ' + expected[k]);
});
if (m.totals) {
  if (JSON.stringify(m.totals.modules) !== JSON.stringify(modules)) {
    fail('totals.modules is ' + JSON.stringify(m.totals.modules) + ' but the arrays say ' + JSON.stringify(modules));
  }
  const patternKeys = Object.keys(routePatterns).sort().join(',');
  const recordedKeys = Object.keys(m.totals.uiPatterns || {}).filter(function (k) { return m.totals.uiPatterns[k] > 0; }).sort().join(',');
  if (patternKeys !== recordedKeys) fail('totals.uiPatterns keys differ from the arrays: ' + recordedKeys + ' vs ' + patternKeys);
  Object.keys(routePatterns).forEach(function (k) {
    if (m.totals.uiPatterns[k] !== routePatterns[k]) fail('totals.uiPatterns.' + k + ' is ' + m.totals.uiPatterns[k] + ' but the arrays say ' + routePatterns[k]);
  });
  if (JSON.stringify(m.totals.lifecycle) !== JSON.stringify(lifecycle)) {
    fail('totals.lifecycle is ' + JSON.stringify(m.totals.lifecycle) + ' but the arrays say ' + JSON.stringify(lifecycle));
  }
  const recordedTp = m.totals.activeTemplatePatterns || {};
  Object.keys(templatePatterns).forEach(function (k) {
    if (recordedTp[k] !== templatePatterns[k]) {
      fail('totals.activeTemplatePatterns.' + k + ' is ' + recordedTp[k] + ' but the arrays say ' + templatePatterns[k]);
    }
  });
  const extraTp = Object.keys(recordedTp).filter(function (k) { return !(k in templatePatterns); });
  if (extraTp.length) fail('totals.activeTemplatePatterns has unknown keys: ' + extraTp.join(', '));
}

/* ── report ────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error('check_inventory: ' + failures.length + ' failure(s)');
  failures.forEach(function (f) { console.error('  FAIL ' + f); });
  process.exit(1);
}

const prereq = m.prerequisite.checks.map(function (c) { return c.id + '=' + c.status; }).join(', ');
console.log('check_inventory: OK — ' + m.routes.length + ' routes (' + m.totals.apiRoutes + ' api, ' +
  m.totals.companyPageRoutes + ' company pages), ' + m.templates.length + ' templates (' + m.totals.activeTemplates +
  ' active, ' + m.totals.instrumentedTemplates + ' instrumented), ' + m.jobs.length + ' jobs.');
console.log('  lifecycle: ' + JSON.stringify(m.totals.lifecycle) + '; instrumented routes: ' + m.totals.instrumentedRoutes);
console.log('  prerequisite: ' + prereq);
console.log('  generated ' + m.generatedAt + (m.sourceHead ? ' — source head ' + m.sourceHead + (m.sourceDirty ? ' (dirty)' : '') : ''));
