'use strict';
/* QUALITY-SOP-PERMISSIONS — offline proof for the SOP access matrix.

   The REAL PAGE_ACCESS and ACTION_TABLES blocks and the REAL PAGE_TABLES
   builder are sliced out of Company_ValleyFoods_Actions.js; the REAL
   _normalizeAccess_/_hasUnifiedAccess_ are sliced out of Code.js. The
   assertions therefore run against the same gate the dispatcher uses, not a
   re-implementation.

   Proves: the three decision actions (approve/reject/make-effective) demand
   'full' and a write-only grant cannot satisfy them while full can; read never
   implies write; full implies write+read; the SOP page declares all five sheets
   as arrays so the page watch set covers history and acknowledgements.

   Run: node tools/verify/quality_sop_permissions.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'Company_ValleyFoods_Actions.js'), 'utf8');
const code = fs.readFileSync(path.join(root, 'Code.js'), 'utf8');

function grabBlock(header) {
  const start = source.indexOf(header); assert(start >= 0, header);
  const end = source.indexOf('\n  };', start); assert(end >= 0, header + ' end');
  return source.slice(start, end + 5);
}
function grabFunction(src, name) {
  const start = src.indexOf('function ' + name + '('); assert(start >= 0, name);
  const end = src.indexOf('\n}', start); assert(end >= 0, name + ' end');
  return src.slice(start, end + 2);
}
function grabPageTablesBuilder() {
  const header = 'const PAGE_TABLES = (function () {';
  const start = source.indexOf(header); assert(start >= 0, header);
  const end = source.indexOf('})();', start); assert(end >= 0, 'PAGE_TABLES end');
  return source.slice(start, end + 5);
}

const script = [
  grabFunction(code, '_normalizeAccess_'),
  grabFunction(code, '_hasUnifiedAccess_'),
  grabBlock('const PAGE_ACCESS = {'),
  grabBlock('const ACTION_TABLES = {'),
  'function __rebuildPageTables_() {',
  grabPageTablesBuilder(),
  '  return PAGE_TABLES;',
  '}',
  'var __out = { PAGE_ACCESS: PAGE_ACCESS, ACTION_TABLES: ACTION_TABLES, PAGE_TABLES: __rebuildPageTables_(), normalize: _normalizeAccess_, has: _hasUnifiedAccess_ };'
].join('\n');

const ctx = { HR_EMPLOYEES_SHEET: 'vf_hr_employees', console: console };
vm.createContext(ctx); vm.runInContext(script, ctx);
const O = ctx.__out;

let failed = 0;
function check(ok, label) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}

const PAGE = 'vf_quality_sops';
const SHEETS = ['valley_quality_sops', 'valley_quality_sop_versions', 'valley_quality_sop_forms', 'valley_quality_sop_events', 'valley_quality_acknowledgements'];
const QUALITY_ACTIONS = {
  get_quality_sops: 'read',
  save_quality_sop: 'write',
  save_quality_sop_version: 'write',
  submit_quality_sop_version: 'write',
  approve_quality_sop_version: 'full',
  reject_quality_sop_version: 'full',
  make_effective_quality_sop_version: 'full',
  save_quality_sop_forms: 'write'
};
const FULL_ACTIONS = ['approve_quality_sop_version', 'reject_quality_sop_version', 'make_effective_quality_sop_version'];
const WRITE_ACTIONS = ['save_quality_sop', 'save_quality_sop_version', 'submit_quality_sop_version', 'save_quality_sop_forms'];

/* the real gate, as guard_ uses it: _hasUnifiedAccess_ over the page's grants */
const allow = (action, grants) => O.has(grants, O.PAGE_ACCESS[action].access);

/* ---- registration shape ---- */
const qualityKeys = Object.keys(O.PAGE_ACCESS).filter(k => k.indexOf('_quality_sop') !== -1);
check(qualityKeys.length === Object.keys(QUALITY_ACTIONS).length,
  'PAGE_ACCESS declares exactly the eight SOP actions (' + qualityKeys.length + ' found)');
Object.keys(QUALITY_ACTIONS).forEach(function (action) {
  const entry = O.PAGE_ACCESS[action];
  check(!!entry && entry.page === PAGE && entry.access === QUALITY_ACTIONS[action],
    action + ' -> ' + PAGE + ' / ' + QUALITY_ACTIONS[action]);
});

/* ---- table declarations: arrays covering all five sheets ---- */
Object.keys(QUALITY_ACTIONS).forEach(function (action) {
  check(Array.isArray(O.ACTION_TABLES[action]) && O.ACTION_TABLES[action].length > 0,
    action + ' declares its tables as an array');
});
const readTables = O.ACTION_TABLES['get_quality_sops'] || [];
check(SHEETS.every(s => readTables.indexOf(s) !== -1) && new Set(readTables).size === SHEETS.length,
  'get_quality_sops declares all five SOP sheets');
const union = {};
Object.keys(QUALITY_ACTIONS).forEach(function (action) {
  (O.ACTION_TABLES[action] || []).forEach(t => { union[t] = true; });
});
check(SHEETS.every(s => union[s]) && Object.keys(union).length === SHEETS.length,
  'the SOP page union is exactly the five sheets');
/* Phase 2: launch_quality_acks lives on this page and reads the employee roster
   for applicability, so the watch set is the five SOP sheets PLUS
   valley_employee_info.
   4.7.1: the department-abbreviation registry is configured FROM this page by a
   `full` user, so that table is a declared dependency of the page too (the
   configuration action is deliberately named outside the `_quality_sop`
   family, so the eight-action count above is unaffected). */
const pageTables = (O.PAGE_TABLES[PAGE] || []).slice().sort();
const expectedPageTables = SHEETS.concat(['valley_employee_info', 'valley_quality_dept_abbr']).sort();
check(JSON.stringify(pageTables) === JSON.stringify(expectedPageTables),
  'PAGE_TABLES[' + PAGE + '] covers all five sheets (history + acks included) plus valley_employee_info (launch) and the abbreviation registry (4.7.1 config)');
/* ---- 4.7.1: the abbreviation configuration action is full-only ---- */
check(O.PAGE_ACCESS['save_quality_dept_abbr'] && O.PAGE_ACCESS['save_quality_dept_abbr'].page === PAGE &&
  O.PAGE_ACCESS['save_quality_dept_abbr'].access === 'full',
  'save_quality_dept_abbr is a full-only configuration action on ' + PAGE);
check(!allow('save_quality_dept_abbr', ['write']) && !allow('save_quality_dept_abbr', ['read']) && allow('save_quality_dept_abbr', ['full']),
  'save_quality_dept_abbr: read and write grants are refused, full is admitted');
/* ---- 4.5: the general-quality page is its own permission key ---- */
check(O.PAGE_ACCESS['get_quality_general'].page === 'vf_quality_general' && O.PAGE_ACCESS['get_quality_general'].access === 'read' &&
  O.PAGE_ACCESS['save_quality_general'].access === 'write' && O.PAGE_ACCESS['set_quality_general_status'].access === 'full',
  'vf_quality_general declares read / write / full on its own page key');
check(!allow('save_quality_general', ['read']) && !allow('set_quality_general_status', ['write']) &&
  allow('set_quality_general_status', ['full']),
  'vf_quality_general: a reader cannot write and a writer cannot archive/restore');
check(!allow('get_quality_general', []), 'vf_quality_general: no grant is refused (fail closed)');
check(JSON.stringify(O.PAGE_TABLES['vf_quality_general']) === JSON.stringify(['valley_quality_general']),
  'PAGE_TABLES[vf_quality_general] is exactly its own single table');

/* ---- the access hierarchy, against the real Code.js gate ---- */
check(O.normalize('full access') === 'full' && O.normalize('view') === 'read' && O.normalize('Add') === 'write',
  'the sliced gate is the real _normalizeAccess_ (full access/view/add aliases)');
check(!O.has(['read'], 'write') && !O.has(['read'], 'full'), 'read does not imply write or full');
check(O.has(['full'], 'write') && O.has(['full'], 'read'), 'full implies write and read');
check(O.has(['write'], 'write') && O.has(['write'], 'read') && !O.has(['write'], 'full'),
  'write implies write+read but never full');

/* ---- the three decision actions are full-only ---- */
FULL_ACTIONS.forEach(function (action) {
  check(O.PAGE_ACCESS[action].access === 'full', action + ' is declared full');
  check(!allow(action, ['write']), action + ': a write-only grant is refused');
  check(!allow(action, ['read']), action + ': a read-only grant is refused');
  check(allow(action, ['full']), action + ': a full grant is admitted');
});
WRITE_ACTIONS.forEach(function (action) {
  check(!allow(action, ['read']), action + ': read-only is refused');
  check(allow(action, ['write']) && allow(action, ['full']), action + ': write and full are admitted');
});
check(allow('get_quality_sops', ['read']) && allow('get_quality_sops', ['write']) && allow('get_quality_sops', ['full']),
  'get_quality_sops: every grant level can read');
check(!allow('get_quality_sops', []), 'no grant at all is refused (fail closed)');

/* ---- one full simulated pass per grant level ---- */
function admitted(grants) {
  return Object.keys(QUALITY_ACTIONS).filter(a => allow(a, grants));
}
check(JSON.stringify(admitted(['read'])) === JSON.stringify(['get_quality_sops']),
  'read-only user: read the page, no writes');
check(WRITE_ACTIONS.every(a => admitted(['write']).indexOf(a) !== -1) &&
  FULL_ACTIONS.every(a => admitted(['write']).indexOf(a) === -1) &&
  admitted(['write']).indexOf('get_quality_sops') !== -1,
  'write-only user: drafts and submissions, but none of the three decisions');
check(admitted(['full']).length === Object.keys(QUALITY_ACTIONS).length,
  'full user: all eight actions admitted');

console.log(failed === 0
  ? 'quality_sop_permissions: PASS (page/tables/arrays, full-only decisions, hierarchy over the real gate)'
  : 'quality_sop_permissions: FAIL (' + failed + ' check(s))');
process.exit(failed === 0 ? 0 : 1);
