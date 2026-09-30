/**
 * Page boot — inventory of every registered page (read-only, local files only).
 *
 * For each page in getAllPages_ (the nine system pages + every company
 * registry) it RUNS the page's own <script> blocks in a vm with stubs and
 * records what the page asks the server for when it opens, exactly as sent.
 * Four runs per page, compared:
 *   A  base clock, URL parameters answered with «__P_<name>__»
 *   B  clock +40 days       — a difference means the data follows the date
 *   C  clock +400 days      — catches «this year» as well as «this month»
 *   D  parameters answered with «__Q_<name>__» — a difference that is not a
 *      plain substitution means the page TRANSFORMS a parameter (split,
 *      Number(), …), which the server cannot reproduce
 * The server's replies never arrive in runs A–D, so they see only the FIRST
 * wave of requests. Run A is then continued: every pending reply is answered
 * with a stub and anything the page asks for next is recorded as wave 2
 * (a read that depends on the first reply; it cannot be embedded).
 *
 * Each first-wave company read is classified from the server source:
 *   - read / write (get_ prefix, as isReadAction_);
 *   - MYSQL when its handler can reach mysqlRead_ / dbGetConnection_ /
 *     mysqlTcDefinition_ / Jdbc through any chain of calls, or when the
 *     company's ACTION_TABLES maps it to «mysql:…»;
 *   - UNKNOWN when no handler is registered under that name.
 * Hand-checked decisions for what the harness cannot see: overrides.json.
 *
 * Every page ends with exactly one decision and a reason. Outputs next to
 * this file: inventory.json (machine) and inventory.md (human).
 * Run: node tools/pageboot/inventory.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { runPage, any } = require('./harness');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = f => fs.existsSync(path.join(ROOT, f));

/* ── 1. Pages ─────────────────────────────────────────────────────────────── */

/* Mirror of getAllPages_'s base list in Code.js. check.js fails if the two drift. */
const SYSTEM_PAGES = [
  { action: 'login', template: '0_ERPlogin', title: 'Login', public: true },
  { action: 'setup', template: '0_ERPsetup', title: 'Setup Password', public: true },
  { action: 'ERPDashboard', template: '0_ERPDashboard', title: 'Dashboard' },
  { action: 'ERP_Management', template: '0_ERP_Management', title: 'System Admin' },
  { action: 'user_sessions', template: 'User_Sessions', title: 'جلساتي' },
  { action: 'user_views', template: 'User_Views', title: 'العروض المحفوظة' },
  { action: 'record_history', template: 'Record_History_Panel', title: 'السجل' },
  { action: 'db_live_viewer', template: 'DbLive_Viewer', title: 'MySQL Database' },
  { action: 'perf_dashboard', template: 'ERP_Perf_Dashboard', title: 'أداء النظام' }
];

/* The registries call registerCompany_(uid, cfg) once each; run them with
   stubs and keep the config. */
function companies() {
  const out = [];
  const files = fs.readdirSync(ROOT).filter(f => /^Company_[A-Za-z]+_Registry\.js$/.test(f)).sort();
  files.forEach(function (f) {
    const name = f.replace(/^Company_|_Registry\.js$/g, '');
    const ns = new Proxy({}, { get: () => function () {} });
    const ctx = { registerCompany_: function (uid, cfg) { out.push({ name: name, uid: uid, cfg: cfg, registry: f }); } };
    ['ErpTest', 'TopLight', 'TopChemical', 'ValleyFoods', 'AssessmentCenter', 'Assessment', 'ValleyFoodsHRModules', name].forEach(n => { ctx[n] = ns; });
    vm.createContext(ctx);
    const src = read(f);
    vm.runInContext(src, ctx);
    const fn = (src.match(/function\s+(register[A-Za-z]*_)\s*\(/) || [])[1];
    if (fn) vm.runInContext(fn + '();', ctx);
  });
  return out;
}

/* Pages whose list replies never go through the device cache (UIC.Live
   VIEW_CACHE_OPT_OUT): they never ask for stamps before their list, so
   embedding stamps for them would be work nobody reads. */
function viewCacheOptOut() {
  const src = read('UI_Components.html');
  const m = /var VIEW_CACHE_OPT_OUT = \[([\s\S]*?)\];/.exec(src);
  if (!m) return new Set();
  return new Set((m[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)));
}

/* ── 2. Server classification ─────────────────────────────────────────────── */

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"\\])\/\/[^\n]*/g, function (m, pre) {
    return (pre || '') + m.slice((pre || '').length).replace(/[^\n]/g, ' ');
  });
}
function matchBrace(src, open) {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return j; }
  }
  return -1;
}
function functionSpans(src) {
  const out = [];
  const re = /(?:function\s+([A-Za-z0-9_$]+)\s*\(|([A-Za-z0-9_$]+)\s*[:=]\s*function\s*\(|([A-Za-z0-9_$]+)\s*=\s*\([^)]*\)\s*=>\s*\{)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1] || m[2] || m[3];
    const open = src.indexOf('{', m.index + m[0].length - 1);
    if (open === -1) continue;
    const close = matchBrace(src, open);
    if (close !== -1) out.push({ name, open, close });
  }
  return out;
}
const MYSQL_SINKS = /\b(mysqlRead_|dbGetConnection_|mysqlTcDefinition_|Jdbc)\b/;

/* The call graph. Company Actions files are IIFEs: a function there can call
   its own file's functions and the shared globals (Code.js, Core_*.js), never
   another company's. So names resolve PER FILE — own file first, then shared —
   which keeps ErpTest's getManufactureHeaders_ apart from Top Chemical's.
   Anonymous handlers (register('x', function () {…})) get «<file>#<action>». */
const SHARED = ['Code.js'].concat(fs.readdirSync(ROOT).filter(f => /^Core_[A-Za-z]+\.js$/.test(f)).sort());
function buildGraph() {
  const files = SHARED.concat(fs.readdirSync(ROOT).filter(f => /^Company_[A-Za-z]+_Actions\.js$/.test(f)).sort());
  const fns = {};
  const byFile = {};
  files.forEach(function (f) {
    const src = stripComments(read(f));
    byFile[f] = new Set();
    functionSpans(src).forEach(function (sp) {
      const key = f + '#' + sp.name;
      fns[key] = (fns[key] || '') + src.slice(sp.open, sp.close + 1);
      byFile[f].add(sp.name);
    });
    const anon = /register\(\s*'([A-Za-z0-9_]+)'\s*,\s*function\s*\(/g;
    let m;
    while ((m = anon.exec(src)) !== null) {
      const open = src.indexOf('{', m.index + m[0].length);
      const close = matchBrace(src, open);
      if (close !== -1) fns[f + '#' + m[1]] = src.slice(open, close + 1);
    }
  });
  function resolve(file, name) {
    if (byFile[file] && byFile[file].has(name)) return file + '#' + name;
    for (const sf of SHARED) if (byFile[sf].has(name)) return sf + '#' + name;
    return null;
  }
  const memo = {};
  function mysqlPath(key, seen) {
    if (memo[key] !== undefined) return memo[key];
    const body = fns[key];
    if (body === undefined) return null;
    if (MYSQL_SINKS.test(body)) return (memo[key] = [key]);
    seen = seen || new Set();
    if (seen.has(key)) return null;
    seen.add(key);
    const file = key.split('#')[0];
    const re = /([A-Za-z0-9_$]+)\s*\(/g;
    let m;
    const tried = new Set();
    while ((m = re.exec(body)) !== null) {
      const callee = resolve(file, m[1]);
      if (!callee || callee === key || tried.has(callee)) continue;
      tried.add(callee);
      const p = mysqlPath(callee, seen);
      if (p) { seen.delete(key); return (memo[key] = [key].concat(p)); }
    }
    seen.delete(key);
    return null;
  }
  return { resolve, mysqlPath };
}

/* action -> graph key of its handler, per company Actions file, plus the
   ACTION_TABLES «mysql:» entries (a second, independent MySQL signal). */
function handlerMap(company, graph) {
  const file = 'Company_' + company + '_Actions.js';
  if (!exists(file)) return { map: {}, mysqlTables: {} };
  const src = stripComments(read(file));
  const map = {};
  let m;
  /* A handler can be a property of another namespace in the same file
     (ValleyFoods.register('x', ValleyFoodsFinancialReporting.reportAction_)):
     resolved by its last segment. */
  const reg = /register\(\s*'([A-Za-z0-9_]+)'\s*,\s*([A-Za-z0-9_$.]+)\s*\)/g;
  while ((m = reg.exec(src)) !== null) map[m[1]] = graph.resolve(file, m[2].split('.').pop());
  const anon = /register\(\s*'([A-Za-z0-9_]+)'\s*,\s*function\s*\(/g;
  while ((m = anon.exec(src)) !== null) if (!map[m[1]]) map[m[1]] = file + '#' + m[1];
  const def = /'([A-Za-z0-9_]+)'\s*:\s*\{\s*handler\s*:\s*([A-Za-z0-9_$]+)/g;
  while ((m = def.exec(src)) !== null) if (!map[m[1]]) map[m[1]] = graph.resolve(file, m[2]);
  const obj = /actions\[\s*'([A-Za-z0-9_]+)'\s*\]\s*=\s*([A-Za-z0-9_$]+)/g;
  while ((m = obj.exec(src)) !== null) if (!map[m[1]]) map[m[1]] = graph.resolve(file, m[2]);
  const mysqlTables = {};
  const at = /'([A-Za-z0-9_]+)'\s*:\s*'mysql:[^']*'/g;
  while ((m = at.exec(src)) !== null) mysqlTables[m[1]] = true;
  return { map: map, mysqlTables: mysqlTables };
}

/* ── 4. Decisions ─────────────────────────────────────────────────────────── */

/* DECISION values:
 *   BOOT          embed the reads listed under boot
 *   SKIP_PUBLIC   public page: no signed-in user to authorize an embedded read
 *   SKIP_NO_READ  the page asks the server for nothing when it opens
 *   SKIP_MYSQL    a first-wave read reaches MySQL (out of scope by owner decision)
 *   SKIP_SYSTEM   the first reads are router routes (Firestore / auth / admin), not company sheets
 *   SKIP_DIRECT   the page calls google.script.run directly, not through API.call
 *   SKIP_DATE     a read's data depends on the browser's date
 *   SKIP_PARAM    the page transforms a URL parameter before sending it
 *   REVIEW        the harness could not run the page cleanly — must be read by hand
 */

/* The run's calendar, as a page computes it (local getters), keyed by value:
   the four date tokens the server can reproduce (Code.js pageBootResolve_). */
function dateMap(dayShift) {
  const d = new Date(new Date('2026-09-15T10:00:00Z').getTime() + (dayShift || 0) * 86400000);
  const pad = n => ('0' + n).slice(-2);
  const ymd = x => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  const map = {};
  map['s:' + ymd(d)] = '$date:today';
  map['s:' + ymd(new Date(d.getFullYear(), d.getMonth(), 1))] = '$date:monthStart';
  map['s:' + ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))] = '$date:monthEnd';
  map['n:' + d.getFullYear()] = '$date:year';
  return map;
}

/* Sentinels → tokens the server fills in (Code.js pageBootResolve_). */
function tokenize(v, P, dmap) {
  dmap = dmap || {};
  if (typeof v === 'string') {
    const re = new RegExp('^' + P + '([A-Za-z0-9_]+?)__$');
    const m = re.exec(v);
    if (m) return '$param:' + m[1];
    if (v === 'tok') return '$sessionToken';
    if (v === 'BASE') return '$scriptUrl';
    if (dmap['s:' + v]) return dmap['s:' + v];
    if (v.indexOf(P) !== -1 || v.indexOf('BASE') !== -1 || /(^|[^a-z])tok([^a-z]|$)/.test(v)) return { __unresolvable: v };
    return v;
  }
  if (typeof v === 'number' && dmap['n:' + v]) return dmap['n:' + v];
  if (Array.isArray(v)) return v.map(x => tokenize(x, P, dmap));
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = tokenize(v[k], P, dmap); }); return o; }
  return v;
}
const hasToken = v => JSON.stringify(v).indexOf('$param:') !== -1;
const unresolvable = v => JSON.stringify(v).indexOf('__unresolvable') !== -1;
/* A token inside an array or nested object means the page reshaped the value. */
function nestedToken(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return Object.keys(data).some(k => typeof data[k] === 'object' && data[k] !== null && JSON.stringify(data[k]).indexOf('$') !== -1);
}
function shape(calls, P, dmap) {
  return calls.map(c => c.route === 'company_action' && c.payload && typeof c.payload === 'object'
    ? { route: c.route, company: c.payload.target_system, action: c.payload.module_action, data: tokenize(c.payload.data === undefined ? {} : c.payload.data, P, dmap) }
    : { route: c.route, payload: tokenize(c.payload, P, dmap) });
}
/* A reply whose every property is 777 — a first reply with DIFFERENT content
   from any(), so a second-wave read built from the first reply changes. */
function reply777() {
  return new Proxy({}, { get: function (t, k) { if (k === 'then') return undefined; if (typeof k === 'symbol') return undefined; if (k === 'status') return 'success'; return 777; } });
}

async function main() {
  const comps = companies();
  const graph = buildGraph();
  const optOut = viewCacheOptOut();
  const handlers = {};
  comps.forEach(c => { const hm = handlerMap(c.name, graph); handlers[c.uid] = { name: c.name, map: hm.map, mysqlTables: hm.mysqlTables }; });
  const overrides = exists('tools/pageboot/overrides.json') ? JSON.parse(read('tools/pageboot/overrides.json')) : {};

  const pages = [];
  SYSTEM_PAGES.forEach(p => pages.push(Object.assign({ company: '', companyName: 'System', registry: 'Code.js' }, p)));
  comps.forEach(c => (c.cfg.pages || []).forEach(p => pages.push(Object.assign({ company: c.uid, companyName: c.name, registry: c.registry }, p))));

  const rows = [];
  for (const p of pages) {
    const row = { company: p.companyName, uid: p.company, action: p.action, template: p.template || '', title: p.title || '', nav: p.nav !== false, public: !!p.public, accessPage: p.accessPage || '', registry: p.registry };
    rows.push(row);
    if (!p.template) { row.decision = 'SKIP_NO_READ'; row.reason = 'registered without a template (a permission token, not a page)'; continue; }
    if (!exists(p.template + '.html')) { row.decision = 'REVIEW'; row.reason = 'template file missing: ' + p.template + '.html'; continue; }
    /* A base · B +40 days · C +400 days · D other parameter values · E a first
       reply with different content. Every run continues into wave 2. */
    const A = await runPage(p, { secondWave: true });
    const B = await runPage(p, { secondWave: true, dayShift: 40 });
    const C = await runPage(p, { secondWave: true, dayShift: 400 });
    const D = await runPage(p, { secondWave: true, paramPrefix: '__Q_' });
    const E = await runPage(p, { secondWave: true, reply: reply777 });
    const w = (run, n) => run.calls.filter(c => c.wave === n);
    const dA = dateMap(0), dB = dateMap(40), dC = dateMap(400);
    const sa = shape(w(A, 1), '__P_', dA), sb = shape(w(B, 1), '__P_', dB), sc = shape(w(C, 1), '__P_', dC), sd = shape(w(D, 1), '__Q_', dA);
    const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    row.stubbed = A.stubbed;
    row.errors = A.notes.errors.slice(0, 3);
    row.router = A.notes.router;
    row.viewCachePage = A.notes.viewCachePage || '';
    row.watchPage = A.notes.watchPage || '';
    row.calls = sa;
    const dateDep = !same(sa, sb) || !same(sa, sc);
    const paramXform = !same(sa, sd);
    /* Wave 2: a read is INDEPENDENT of the first reply when it comes out the
       same in every run — whatever the first reply said (E), whatever the date
       (B, C, after tokens) and the parameters (D). Those are embedded too; the
       rest make the page PARTIAL. */
    const keyOf = c => (c.action || c.route) + ' ' + JSON.stringify(c.data !== undefined ? c.data : c.payload);
    const w2 = run => new Set(shape(w(run, 2), run === D ? '__Q_' : '__P_', run === B ? dB : run === C ? dC : dA)
      .filter(c => c.route === 'company_action' && c.action !== 'get_page_versions').map(keyOf));
    const w2A = shape(w(A, 2), '__P_', dA).filter(c => c.route === 'company_action' && c.action !== 'get_page_versions');
    const sets = [w2(B), w2(C), w2(D), w2(E)];
    row.wave2Independent = [];
    row.wave2 = [];
    const seenW2 = new Set();
    w2A.forEach(function (c) {
      const k = keyOf(c);
      if (seenW2.has(k)) return;
      seenW2.add(k);
      if (sets.every(s => s.has(k)) && !unresolvable(c.data) && !nestedToken(c.data)) row.wave2Independent.push(c);
      else row.wave2.push(c.action);
    });

    const o = overrides[p.action];
    if (o && typeof o === 'object') { row.decision = o.decision; row.reason = o.reason + ' (manual — see overrides.json)'; row.manual = true; if (o.boot) row.boot = o.boot; continue; }

    const companyCalls = sa.filter(c => c.route === 'company_action' && c.action !== 'get_page_versions');
    const otherCalls = sa.filter(c => c.route !== 'company_action');

    if (p.public) { row.decision = 'SKIP_PUBLIC'; row.reason = 'public page: no signed-in user to authorize an embedded read'; continue; }
    if (A.notes.gsr.length) { row.decision = 'SKIP_DIRECT'; row.reason = 'calls google.script.run directly (' + Array.from(new Set(A.notes.gsr)).join(', ') + '), not through API.call'; continue; }
    if (row.errors.length && !sa.length) { row.decision = 'REVIEW'; row.reason = 'page script failed in the harness: ' + row.errors[0]; continue; }
    if (!companyCalls.length) {
      if (otherCalls.length) { row.decision = 'SKIP_SYSTEM'; row.reason = 'first reads are router routes: ' + Array.from(new Set(otherCalls.map(c => c.route))).join(', '); continue; }
      row.decision = 'SKIP_NO_READ'; row.reason = 'no read when the page opens (data loads only after a user action)'; continue;
    }
    const problems = [];
    companyCalls.forEach(function (c) {
      const h = handlers[c.company];
      const fn = h && h.map[c.action];
      c.read = /^get_/.test(String(c.action));
      if (!c.read) problems.push('WRITE:' + c.action);
      if (!fn) { c.kind = 'UNKNOWN'; problems.push('UNKNOWN:' + c.action); return; }
      const mp = graph.mysqlPath(fn);
      const tableSaysMysql = !!(h.mysqlTables && h.mysqlTables[c.action]);
      c.kind = (mp || tableSaysMysql) ? 'MYSQL' : 'SHEETS';
      if (mp) c.mysqlPath = mp.map(k => k.split('#')[1]).join(' → ');
      else if (tableSaysMysql) c.mysqlPath = 'ACTION_TABLES says mysql:';
      if (unresolvable(c.data)) problems.push('UNRESOLVABLE:' + c.action);
      if (nestedToken(c.data)) problems.push('NESTED_PARAM:' + c.action);
    });
    const mysql = companyCalls.filter(c => c.kind === 'MYSQL');
    if (mysql.length) { row.decision = 'SKIP_MYSQL'; row.reason = mysql.map(c => c.action + ' (' + c.mysqlPath + ')').join('; '); continue; }
    if (dateDep) { row.decision = 'SKIP_DATE'; row.reason = 'data follows the browser date: ' + companyCalls.map(c => c.action).join(', '); continue; }
    if (paramXform || problems.some(x => /^NESTED_PARAM|^UNRESOLVABLE/.test(x))) { row.decision = 'SKIP_PARAM'; row.reason = 'the page reshapes a URL parameter before sending it' + (problems.length ? ' (' + problems.join(', ') + ')' : ''); continue; }
    if (problems.length) { row.decision = 'REVIEW'; row.reason = problems.join(', '); continue; }

    row.decision = 'BOOT';
    row.boot = [];
    /* Stamps first, and only for a page whose list goes through the device
       cache (a miss asks for them before the list). */
    const stampsPage = row.viewCachePage && !optOut.has(row.viewCachePage) ? row.viewCachePage : '';
    if (stampsPage) row.boot.push({ action: 'get_page_versions', data: { page: stampsPage } });
    const seen = new Set();
    const mysqlW2 = [];
    companyCalls.concat(row.wave2Independent).forEach(function (c) {
      const key = c.action + ' ' + JSON.stringify(c.data);
      if (seen.has(key)) return;
      seen.add(key);
      /* A wave-2 read joins only if it is a Sheets read too. */
      if (row.wave2Independent.indexOf(c) !== -1) {
        const h = handlers[c.company];
        const fn = h && h.map[c.action];
        if (!/^get_/.test(String(c.action)) || !fn || graph.mysqlPath(fn) || (h.mysqlTables && h.mysqlTables[c.action])) { mysqlW2.push(c.action); return; }
      }
      row.boot.push({ action: c.action, data: c.data });
    });
    if (mysqlW2.length) row.wave2 = row.wave2.concat(mysqlW2);
    row.reason = companyCalls.length + ' first-wave read(s)' + (stampsPage ? ' + stamps' : '') +
      (row.wave2.length ? '; PARTIAL — the page then asks for ' + Array.from(new Set(row.wave2)).join(', ') + ', which depends on the first reply' : '');
    if (otherCalls.length) row.alsoSystem = Array.from(new Set(otherCalls.map(c => c.route)));
  }

  const counts = {};
  rows.forEach(r => { counts[r.decision] = (counts[r.decision] || 0) + 1; });
  fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify({ generated: 'node tools/pageboot/inventory.js', counts: counts, pages: rows }, null, 1) + '\n');

  const md = ['# Page boot — page inventory', '', 'Generated by `node tools/pageboot/inventory.js`. Do not edit by hand; hand decisions go in `overrides.json`.', '',
    '| decision | pages |', '|---|---|'].concat(Object.keys(counts).sort().map(k => '| ' + k + ' | ' + counts[k] + ' |'),
    ['', '| # | company | action | template | decision | boot reads / reason |', '|---|---|---|---|---|---|'],
    rows.map((r, i) => '| ' + (i + 1) + ' | ' + r.company + ' | ' + r.action + ' | ' + r.template + ' | ' + r.decision + (r.manual ? ' (manual)' : '') + ' | ' +
      (r.decision === 'BOOT' ? r.boot.map(x => '`' + x.action + ' ' + JSON.stringify(x.data) + '`').join('<br>') + (r.wave2 && r.wave2.length ? '<br>_partial: then ' + Array.from(new Set(r.wave2)).join(', ') + '_' : '')
        : String(r.reason || '').replace(/\|/g, '\\|')) + ' |'));
  fs.writeFileSync(path.join(OUT, 'inventory.md'), md.join('\n') + '\n');
  console.log(JSON.stringify(counts));
}

/* A page reacting badly to a stub reply throws inside its own promise chain;
   in the harness that only means «this wave-2 read did not happen». */
process.on('unhandledRejection', function () {});
process.on('uncaughtException', function () {});
main().catch(function (e) { console.error(e); process.exit(1); });
