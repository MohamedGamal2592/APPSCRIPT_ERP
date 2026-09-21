/**
 * ac1_wiring.js — Phase 1 control-plane wiring: the registry call, the
 * PAGE_ACCESS/registry cross-reference, the PUBLIC_ACTIONS/actions
 * separation (D-14/T-2), and the company_public_action route.
 *
 *   node tools/verify/ac1_wiring.js
 *
 * Written during Phase 7 (an oversight in Phase 1 — recorded plainly in
 * ASSESSMENT_CENTER_RESULTS.md rather than pretending it always existed).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const S = require('../lib/sources');

const ROOT = path.resolve(__dirname, '..', '..');
const helper = fs.readFileSync(path.join(ROOT, 'Company_Assessment_Actions.js'), 'utf8');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + JSON.stringify(extra) : ''));
}

/* ── 1. The registry call exists and is invoked ────────────────────────────── */
console.log('Code.js — the call exists and is wired in\n');
(function () {
  const reg = S.read('Code.js');
  ok(/function registerAssessmentCenter_\s*\(/.test(S.read('Company_Assessment_Registry.js')),
    'Company_Assessment_Registry.js defines registerAssessmentCenter_()');
  ok(/registerAssessmentCenter_\(\);/.test(reg),
    'ensureCompaniesRegistered_() calls it');
})();

/* ── 2. The registry's own shape: pages[0], the one public page, tables ──── */
console.log('\nCompany_Assessment_Registry.js — shape\n');
const registrySrc = S.read('Company_Assessment_Registry.js');
const pagesMatch = registrySrc.match(/pages:\s*\[([\s\S]*?)\n\s*\]\s*\}\);/);
const pageBlocks = pagesMatch ? pagesMatch[1].match(/\{[^{}]*\}/g) || [] : [];
const registryPages = pageBlocks.map(function (block) {
  const action = (block.match(/action:\s*'([^']+)'/) || [])[1];
  const isPublic = /public:\s*true/.test(block);
  const navFalse = /nav:\s*false/.test(block);
  return { action: action, public: isPublic, navFalse: navFalse, raw: block };
});
ok(registryPages.length === 7, 'the registry declares exactly seven pages', registryPages.length);
ok(registryPages[0] && registryPages[0].action === 'ac_dashboard', 'ac_dashboard is pages[0] — the tile target', registryPages[0]);
const publicPages = registryPages.filter(function (p) { return p.public; });
ok(publicPages.length === 1 && publicPages[0].action === 'ac_take', 'exactly one page is public, and it is ac_take', publicPages);

/* ── 3. ac_take is the ONLY public page across every company in the project ── */
console.log('\nac_take is the only public COMPANY page in the whole project\n');
(function () {
  const registryFiles = fs.readdirSync(ROOT).filter(function (f) { return /^Company_.*_Registry\.js$/.test(f); });
  const otherPublicActions = [];
  registryFiles.forEach(function (f) {
    if (f === 'Company_Assessment_Registry.js') return;
    const src = S.read(f);
    const m = src.match(/pages:\s*\[([\s\S]*?)\n\s*\]/);
    const blocks = m ? (m[1].match(/\{[^{}]*\}/g) || []) : [];
    blocks.forEach(function (b) {
      if (/public:\s*true/.test(b)) {
        const a = (b.match(/action:\s*'([^']+)'/) || [])[1];
        otherPublicActions.push(f + ':' + a);
      }
    });
    ok(!/publicDispatch\s*:/.test(src), f + ' registers no publicDispatch key (the route stays inert for it)');
  });
  ok(otherPublicActions.length === 0, 'no OTHER company registers a public page', otherPublicActions);
})();

/* ── 4. PAGE_ACCESS <-> registry cross-reference ───────────────────────────── */
console.log('\nCompany_Assessment_Actions.js — PAGE_ACCESS cross-referenced against the registry\n');
const actionsSrc = S.read('Company_Assessment_Actions.js');
const pageAccessBlock = (actionsSrc.match(/const PAGE_ACCESS = \{([\s\S]*?)\n {2}\};/) || [])[1] || '';
const pageAccessEntries = [];
{
  const re = /'([a-z_]+)':\s*\{\s*page:\s*'([a-z_]+)',\s*access:\s*'(read|write|full)'\s*\}/g;
  let m;
  while ((m = re.exec(pageAccessBlock)) !== null) pageAccessEntries.push({ action: m[1], page: m[2], access: m[3] });
}
ok(pageAccessEntries.length > 0, 'PAGE_ACCESS entries were parsed out of the source', pageAccessEntries.length);

const registryActionSet = {};
registryPages.forEach(function (p) { registryActionSet[p.action] = true; });
const unknownPages = pageAccessEntries.filter(function (e) { return !registryActionSet[e.page]; });
ok(unknownPages.length === 0, 'every PAGE_ACCESS entry points at a page the registry actually declares', unknownPages);

// D-15: ac_assessment_form and ac_result_view are their own registry entries
// (the router needs a template per action) but deliberately do NOT appear as
// a `page:` value of their own — their actions map to the LIST page's id
// instead (ac_assessments / ac_results), so the two share one access gate.
const SHARES_ACCESS_WITH = { ac_assessment_form: 'ac_assessments', ac_result_view: 'ac_results' };
const nonPublicPages = registryPages.filter(function (p) { return !p.public; });
const mappedPages = {};
pageAccessEntries.forEach(function (e) { mappedPages[e.page] = true; });
const unmapped = nonPublicPages.filter(function (p) {
  const effectivePage = SHARES_ACCESS_WITH[p.action] || p.action;
  return !mappedPages[effectivePage];
});
ok(unmapped.length === 0, 'every registered non-public page has at least one PAGE_ACCESS entry mapping to it (directly, or via D-15\'s shared list-page gate)', unmapped.map(function (p) { return p.action; }));
Object.keys(SHARES_ACCESS_WITH).forEach(function (detailPage) {
  ok(mappedPages[SHARES_ACCESS_WITH[detailPage]], detailPage + ' shares its access gate with ' + SHARES_ACCESS_WITH[detailPage] + ' (D-15)');
});

/* ── 5. PUBLIC_ACTIONS and `actions` share no key (D-14) ───────────────────── */
console.log('\nPUBLIC_ACTIONS and the authenticated `actions` map share NO key (D-14/T-2)\n');
function buildSandbox() {
  const sandbox = {
    unifiedCheck_: function () { return true; },
    ERP_MESSAGES: { NOT_AUTHORIZED: 'غير مصرح' },
    CacheService: { getScriptCache: function () { const c = {}; return { get: function (k) { return c[k] || null; }, put: function (k, v) { c[k] = v; } }; } },
    Utilities: { getUuid: function () { return 'u-' + Math.random(); }, formatDate: function (d) { return String(d); } },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    getAllRecords_: function () { return []; }, getRecordsByPk_: function () { return { rows: [], byPk: new Map() }; },
    getSheet_: function () { throw new Error('no sheet in this stub'); }, getHeaders_: function () { return []; },
    appendRowWithRetry_: function () {}, noteMutation_: function () {}, executeWithLock_: function (fn) { return fn(); },
    updateRowByCriteria_: function () { return true; }, logHistory_: function () {}
  };
  vm.createContext(sandbox);
  vm.runInContext(actionsSrc, sandbox, { filename: 'Company_Assessment_Actions.js' });
  return { sandbox: sandbox, AC: vm.runInContext('AssessmentCenter', sandbox) };
}
const built = buildSandbox();
const AC = built.AC;
const SUPER = { isSuperAdmin: true, email: 'admin@example.com' };

const publicNames = ['get_ac_candidate_assessment', 'add_ac_candidate_attempt', 'add_ac_candidate_submission'];
const authedNames = pageAccessEntries.map(function (e) { return e.action; });

publicNames.forEach(function (name) {
  let threw = null;
  try { AC.dispatch_({ module_action: name, data: {} }, SUPER, 'DB1'); } catch (e) { threw = e; }
  ok(!!threw && /Unknown Assessment Center action/.test(threw.message),
    'a PUBLIC action ("' + name + '") is unreachable through the AUTHENTICATED dispatch_', threw && threw.message);
});
authedNames.forEach(function (name) {
  let threw = null;
  try { AC.publicDispatch_({ module_action: name, data: { token: '0'.repeat(72) } }, 'DB1'); } catch (e) { threw = e; }
  ok(!!threw && /Unknown public action/.test(threw.message),
    'an AUTHENTICATED action ("' + name + '") is unreachable through publicDispatch_', threw && threw.message);
});

/* ── 6. publicDispatch_ never references `actions` (source-level) ─────────── */
console.log('\npublicDispatch_ never references the authenticated `actions` map (source)\n');
(function () {
  const at = actionsSrc.indexOf('function publicDispatch_');
  const open = actionsSrc.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < actionsSrc.length; i++) {
    if (actionsSrc[i] === '{') depth++;
    else if (actionsSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = actionsSrc.slice(open, end);
  ok(!/\bactions\[/.test(body), 'publicDispatch_\'s body never indexes into `actions`', body);
  ok(/PUBLIC_ACTIONS\[/.test(body), 'it looks up PUBLIC_ACTIONS instead');
})();

/* ── 7. The route: requireAuth:false, and it throws for a company with no
 *     publicDispatch ────────────────────────────────────────────────────── */
console.log('\nCode.js — the company_public_action route\n');
(function () {
  const code = S.read('Code.js');
  ok(/'company_public_action':\s*\{\s*handler:\s*executeCompanyPublicAction_,\s*requireAuth:\s*false\s*\}/.test(code),
    'the route is registered with requireAuth:false');

  const at = code.indexOf('function executeCompanyPublicAction_');
  const open = code.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const fnSrc = code.slice(at, end + 1);
  const sandbox = { COMPANY_REGISTRY: { withPublic: { publicDispatch: function (p, dbId) { return { called: true, dbId: dbId }; } }, withoutPublic: {} }, getCompanySpreadsheetId_: function () { return 'DB-X'; } };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc, sandbox, { filename: 'executeCompanyPublicAction_' });
  const fn = vm.runInContext('executeCompanyPublicAction_', sandbox);

  const result = fn({ target_system: 'withPublic', module_action: 'x' }, null, null);
  ok(result && result.called === true && result.dbId === 'DB-X', 'a company WITH publicDispatch is dispatched to correctly', result);

  let threw = null;
  try { fn({ target_system: 'withoutPublic', module_action: 'x' }, null, null); } catch (e) { threw = e; }
  ok(!!threw, 'a company with NO publicDispatch throws rather than silently doing nothing', threw && threw.message);

  let threwUnknown = null;
  try { fn({ target_system: 'no-such-company', module_action: 'x' }, null, null); } catch (e) { threwUnknown = e; }
  ok(!!threwUnknown, 'an unknown target_system throws too');
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('ac1_wiring: all assertions pass.');

