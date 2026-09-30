/**
 * LIVE-NOTICE P2 — the client knows the view, its own saves, and what is stale.
 *
 * Loads the REAL UI_Components.html + Client_Helpers.html into the DOM stub and
 * drives UIC.Live.watchPage with scripted get_page_versions replies (the shape
 * pageVersionsReply_ returns), through the plan's scenario matrix:
 *
 *   1 my own save, list open                       → no notice, no refresh
 *   2 another user's save, list open, not busy     → refresh in place, no notice
 *   3 same, but typing                             → named notice
 *   4 another user saves a table not in the list   → nothing; table stale
 *   5 then the form opens                          → form refresh once; stale cleared
 *   6 my save and another's in one poll window     → notice (not mine)
 *   7 two tables moved while busy                  → one notice naming both
 *   8 × then another change                        → notice shows again
 *   9 page without PAGE_VIEWS                      → today's behaviour
 *  10 old server reply (no meta / views)           → today's behaviour exactly
 *
 * plus: a page that never calls setView, a seeded stamp, a dialog over the
 * list, the system writer, and the request guard feeding markOwnRequest.
 *
 * Run: node tools/verify/live_notice_client.js
 */
'use strict';

const vm = require('vm');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))); }
}

function freshSandbox() {
  const sb = makeSandbox({
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }), host: {}, history: {} } },
    scriptUrl: 'https://example.invalid/exec',
    SESSION_TOKEN: 'tok', CURRENT_ACTION: 'tl_sales',
    COMPANY_PAGES: [], USER_PAGES: null, IS_SUPER_ADMIN: true
  });
  sb.location = { href: '', search: '', origin: '', pathname: '/' };
  ['UI_Components.html', 'Client_Helpers.html'].forEach(function (f) {
    S.scriptBlocks(S.read(f)).forEach(function (b, i) {
      vm.runInContext(S.stripScriptlets(b.body), sb, { filename: f + '#' + i });
    });
  });
  return sb;
}
function runTimers(sb) {
  const due = sb.__timers.slice();
  sb.__timers.length = 0;
  due.forEach(t => { if (t && typeof t.fn === 'function') t.fn(); });
}
const settle = () => new Promise(r => setImmediate(r));

const SALES = 'top_light_sales_invoices', LINES = 'top_light_sales_products', RET = 'top_light_sales_returns',
  CUST = 'top_light_customer_vendor', PROD = 'top_light_products', STOCK = 'top_light_current_products';
const VIEWS = { list: [SALES, LINES, RET, CUST], form: [SALES, LINES, PROD, STOCK, CUST] };
const LABELS = {}; LABELS[SALES] = 'المبيعات'; LABELS[LINES] = 'أصناف المبيعات'; LABELS[RET] = 'مرتجعات المبيعات';
LABELS[CUST] = 'العملاء والموردون'; LABELS[PROD] = 'المنتجات'; LABELS[STOCK] = 'أرصدة المخزون';
const ALL = [SALES, LINES, RET, CUST, PROD, STOCK];

/** A scripted server: tables -> {t, w}. write() is one save by someone. */
function makeServer(opts) {
  const o = opts || {};
  const stamps = {};
  let clock = 1759219200000;
  ALL.forEach(t => { stamps[t] = { t: clock - 3600000, w: [] }; });
  const srv = {
    now: () => clock,
    tick: ms => { clock += ms; },
    write: (t, rid, u, n) => {
      clock += 1;
      const s = stamps[t];
      s.w.unshift({ t: clock, r: rid || '', u: u || 'system', n: n || '' });
      if (s.w.length > 5) s.w.length = 5;
      s.t = clock;
    },
    seed: t => { clock += 1; stamps[t] = { t: clock, w: [], s: 1 }; },
    reply: () => {
      const versions = {}, meta = {};
      ALL.forEach(t => { versions[t] = JSON.stringify(stamps[t]); meta[t] = JSON.parse(JSON.stringify(stamps[t])); });
      if (o.old) {
        const v = {};
        ALL.forEach(t => { v[t] = String(stamps[t].t); });
        return { status: 'success', page: 'tl_sales', tables: ALL, versions: v, now: String(clock) };
      }
      return { status: 'success', page: 'tl_sales', tables: ALL, versions, meta,
        views: o.noViews ? null : VIEWS, labels: o.noLabels ? {} : LABELS, now: String(clock) };
    }
  };
  return srv;
}

/** Watch + a page that routes onChange through arrive, like every real page. */
async function setup(opts) {
  const o = opts || {};
  const sb = freshSandbox();
  const srv = makeServer(o);
  const log = { listRefresh: 0, formRefresh: 0, changes: [], busts: 0 };
  const realBust = sb.UIC.Cache.bust;
  sb.UIC.Cache.bust = function () { log.busts++; return realBust.apply(this, arguments); };
  sb.UIC.Live.watchPage({
    call: (a) => Promise.resolve(a === 'get_page_versions' ? srv.reply() : { status: 'success' }),
    page: 'tl_sales',
    onChange: function (tables) { log.changes.push(tables.slice()); sb.UIC.Live.arrive(function () { log.listRefresh++; }); }
  });
  if (!o.noSetView) sb.UIC.Live.setView('list', { refresh: function () { log.listRefresh++; } });
  runTimers(sb); await settle();          // baseline
  const poll = async () => { runTimers(sb); await settle(); };
  const chip = () => { const el = sb.document.getElementById('uic-live-fresh'); return el ? String(el.innerHTML) : ''; };
  const typing = on => { sb.document.activeElement = on ? { tagName: 'INPUT' } : null; };
  return { sb, srv, log, poll, chip, typing };
}

async function main() {
  console.log('\n1 — my own save is silent\n');
  {
    const { sb, srv, log, poll, chip } = await setup();
    sb.UIC.Live.markOwnRequest('rid-mine-000000000001');
    srv.write(SALES, 'rid-mine-000000000001', 'me@x', 'أنا');
    await poll();
    check(log.changes.length === 0 && log.listRefresh === 0 && chip() === '', 'no notice, no refresh', log);
  }

  console.log('\n2 — another user, list open, not busy → refresh in place\n');
  {
    const { srv, log, poll, chip } = await setup();
    srv.write(SALES, 'rid-other-00000000001', 'ahmed@x', 'أحمد');
    await poll();
    check(log.changes.length === 1 && log.changes[0].join() === SALES, 'onChange names the in-view table', log.changes);
    check(log.listRefresh === 1 && chip() === '', 'refreshed in place, no notice', { refresh: log.listRefresh, chip: chip() });
  }

  console.log('\n3 — same, but typing → named notice\n');
  {
    const { srv, log, poll, chip, typing } = await setup();
    typing(true);
    srv.write(SALES, 'rid-other-00000000001', 'ahmed@x', 'أحمد');
    srv.tick(65000);
    await poll();
    check(log.listRefresh === 0, 'nothing refreshed under the user');
    check(/تم تحديث <b>المبيعات<\/b> بواسطة <b>أحمد<\/b> منذ <b>دقيقة<\/b> · اضغط للتحديث/.test(chip()), 'notice «تم تحديث المبيعات بواسطة أحمد منذ دقيقة»', chip());
    check(/role/.test('role') && /uic-live-fresh-x/.test(chip()), 'the notice carries the × button');
  }

  console.log('\n4 + 5 — off-view change is silent and stale; opening the form refreshes it once\n');
  {
    const { sb, srv, log, poll, chip } = await setup();
    srv.write(PROD, 'rid-other-00000000002', 'sara@x', 'سارة');
    await poll();
    check(log.changes.length === 0 && log.listRefresh === 0 && chip() === '', 'products moved (not in the list): nothing happens', log);
    check(sb.UIC.Live.staleTables().indexOf(PROD) !== -1, 'products is marked stale', sb.UIC.Live.staleTables());
    sb.UIC.Live.setView('form', { refresh: function () { log.formRefresh++; } });
    check(log.formRefresh === 1, 'opening the form runs the form refresh once', log.formRefresh);
    check(sb.UIC.Live.staleTables().indexOf(PROD) === -1, 'and clears the stale flag');
    sb.UIC.Live.setView('form', { refresh: function () { log.formRefresh++; } });
    check(log.formRefresh === 1, 'opening it again does not refresh again');
  }

  console.log('\n6 — my save and another in one window → not mine\n');
  {
    const { sb, srv, poll, chip, typing } = await setup();
    typing(true);
    sb.UIC.Live.markOwnRequest('rid-mine-000000000002');
    srv.write(SALES, 'rid-mine-000000000002', 'me@x', 'أنا');
    srv.write(SALES, 'rid-other-00000000003', 'ahmed@x', 'أحمد');
    await poll();
    check(/بواسطة <b>أحمد<\/b>/.test(chip()) && !/أنا/.test(chip()), 'notice names the other writer only', chip());
  }

  console.log('\n7 — two tables while busy → one notice naming both\n');
  {
    const { srv, poll, chip, typing } = await setup();
    typing(true);
    srv.write(SALES, 'rid-other-00000000004', 'ahmed@x', 'أحمد');
    srv.write(RET, 'rid-other-00000000005', 'sara@x', 'سارة');
    await poll();
    check(/تم تحديث: <b>المبيعات<\/b>، <b>مرتجعات المبيعات<\/b> · اضغط للتحديث/.test(chip()), 'one notice naming both tables', chip());
  }

  console.log('\n8 — × hides it; the next change shows it again, merged\n');
  {
    const { sb, srv, log, poll, chip, typing } = await setup();
    typing(true);
    srv.write(SALES, 'rid-other-00000000006', 'ahmed@x', 'أحمد');
    await poll();
    check(chip() !== '', 'notice showing');
    sb.UIC.Live.dismissFresh();
    check(chip() === '', '× hides it');
    await poll();
    check(chip() === '', 'a quiet poll does not bring it back');
    srv.write(RET, 'rid-other-00000000007', 'sara@x', 'سارة');
    await poll();
    check(/المبيعات<\/b>، <b>مرتجعات المبيعات/.test(chip()), 'the next change shows it again, merged with the first', chip());
    sb.UIC.Live.applyFresh();
    check(log.listRefresh === 1 && chip() === '', 'clicking it runs the pending refresh once and clears it', log.listRefresh);
  }

  console.log('\n9 — a page without PAGE_VIEWS keeps today\'s behaviour\n');
  {
    const { srv, log, poll, chip, typing } = await setup({ noViews: true, noLabels: true });
    srv.write(PROD, 'rid-other-00000000008', 'ahmed@x', 'أحمد');
    await poll();
    check(log.changes.length === 1 && log.changes[0].join() === PROD && log.listRefresh === 1, 'every table counts as in view', log);
    typing(true);
    srv.write(PROD, 'rid-other-00000000009', 'ahmed@x', 'أحمد');
    await poll();
    check(/هناك تغييرات جديدة · اضغط للتحديث/.test(chip()), 'generic wording when there are no labels', chip());
  }

  console.log('\n10 — an old server reply (no meta, no views) → today exactly\n');
  {
    const { srv, log, poll, chip, typing } = await setup({ old: true });
    const b0 = log.busts;
    srv.write(PROD, '', '', '');
    await poll();
    check(log.changes.length === 1 && log.changes[0].join() === PROD && log.listRefresh === 1 && log.busts === b0 + 1,
      'onChange(moved), refresh in place, whole client cache busted', log);
    typing(true);
    srv.write(SALES, '', '', '');
    await poll();
    check(/هناك تغييرات جديدة · اضغط للتحديث/.test(chip()), 'generic wording', chip());
  }

  console.log('\nextra — the rules around the matrix\n');
  {
    const { sb, srv, log, poll } = await setup({ noSetView: true });
    srv.write(PROD, 'rid-other-00000000010', 'ahmed@x', 'أحمد');
    await poll();
    check(log.changes.length === 1 && log.listRefresh === 1, 'a page that never calls setView: every table is in view (today)', log);
    sb.UIC.Live.markOwnRequest('rid-mine-000000000003');
    srv.write(SALES, 'rid-mine-000000000003', 'me@x', 'أنا');
    await poll();
    check(log.changes.length === 1, '  but its own saves are silent');
  }
  {
    const { srv, log, poll, chip } = await setup();
    srv.seed(SALES);
    await poll();
    check(log.changes.length === 0 && chip() === '', 'a move to a seeded stamp (eviction) is no information: silent', log);
  }
  {
    const { srv, poll, chip, typing } = await setup();
    typing(true);
    srv.write(SALES, '', 'system', '');
    await poll();
    check(/تم تحديث <b>المبيعات<\/b> تلقائياً · اضغط للتحديث/.test(chip()), 'a system writer reads «تلقائياً»', chip());
  }
  {
    const { srv, poll, chip, typing } = await setup();
    typing(true);
    srv.write(SALES, 'r-a-0000000000000001', 'a@x', 'أ');
    srv.write(SALES, 'r-b-0000000000000001', 'b@x', 'ب');
    srv.write(SALES, 'r-c-0000000000000001', 'c@x', 'ج');
    await poll();
    check(/تم تحديث <b>المبيعات<\/b> \(3 تعديلات\) · اضغط للتحديث/.test(chip()), 'several writers → «(3 تعديلات)»', chip());
  }
  {
    const { srv, poll, chip, typing } = await setup();
    typing(true);
    srv.write(SALES, 'r-x-0000000000000001', 'x@x', '<img src=x onerror=alert(1)>');
    await poll();
    check(chip().indexOf('<img') === -1 && /&lt;img/.test(chip()), 'writer names are escaped', chip());
  }
  {
    const { sb, srv, log, poll } = await setup();
    sb.UIC.openModal('m-test', { title: 't', body: '' });
    srv.write(STOCK, 'rid-other-00000000011', 'ahmed@x', 'أحمد');
    await poll();
    check(log.changes.length === 1 && log.changes[0].join() === STOCK, 'a dialog over the list makes the form tables visible', log.changes);
    sb.UIC.closeModal('m-test');
    srv.write(STOCK, 'rid-other-00000000012', 'ahmed@x', 'أحمد');
    await poll();
    check(log.changes.length === 1 && sb.UIC.Live.staleTables().indexOf(STOCK) !== -1, 'after it closes, the form-only table is off-view again', log.changes);
  }
  {
    const { sb, srv, log, poll } = await setup();
    srv.write(RET, 'rid-other-00000000013', 'ahmed@x', 'أحمد');
    sb.UIC.Live.setView('form', { refresh: function () { log.formRefresh++; } });
    await poll();
    check(log.changes.length === 0 && sb.UIC.Live.staleTables().indexOf(RET) !== -1, 'returns (list only) moves while the form is open: stale, silent');
    const n = log.listRefresh;
    sb.UIC.Live.setView('list', { refresh: function () { log.listRefresh++; } });
    check(log.listRefresh === n + 1, 'returning to the list refreshes it once', log.listRefresh - n);
  }
  {
    const { sb, srv, log, poll } = await setup();
    sb.UIC.Live.setView('form', { refresh: function () { log.formRefresh++; } });
    sb.UIC.Live.setView('list', { refresh: function () { log.listRefresh++; } });
    srv.write(STOCK, 'rid-other-00000000014', 'ahmed@x', 'أحمد');
    await poll();
    const was = sb.UIC.Live.setView('form', { refresh: function () { log.formRefresh++; }, loading: true });
    check(was === true && log.formRefresh === 0 && sb.UIC.Live.staleTables().length === 0,
      'setView(…, {loading:true}) reports the stale view without running its refresh twice', { was, formRefresh: log.formRefresh });
    check(sb.UIC.Live.setView('list', { refresh: function () {}, loading: true }) === false, '  and reports false when nothing was stale');
  }
  {
    /* The request guard is what feeds markOwnRequest in production. */
    const sb = freshSandbox();
    const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, key: i => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } }; };
    sb.sessionStorage = mem(); sb.localStorage = mem();
    sb.AUTH_USER_EMAIL = 'me@x';
    const payload = { target_system: 'X', module_action: 'save_sales', data: { a: 1 } };
    const entry = sb.API._requestGuard.prepare('company_action', payload, 'tok');
    const rid = payload.data.__request_id;
    const srv = makeServer();
    const log = { changes: [] };
    sb.UIC.Live.watchPage({ call: () => Promise.resolve(srv.reply()), page: 'tl_sales', onChange: t => log.changes.push(t) });
    runTimers(sb); await settle();
    srv.write(SALES, rid, 'me@x', 'أنا');
    runTimers(sb); await settle();
    check(!!entry && !!rid && log.changes.length === 0, 'a write prepared by the request guard is recognised as mine', { rid, changes: log.changes });
    const payloadGet = { target_system: 'X', module_action: 'get_sales', data: {} };
    sb.API._requestGuard.prepare('company_action', payloadGet, 'tok');
    check(!payloadGet.data.__request_id, 'reads are not stamped (get_ actions are not writes)');
  }

  await realPages();
  await recordLevel();

  console.log(failed ? '\nlive_notice_client: FAIL (' + failed + ')' : '\nlive_notice_client: OK');
  process.exit(failed ? 1 : 0);
}

/* ── P3.4 — one real page per company, driven list → form → list ─────── */
const path = require('path');
const fs = require('fs');
const { bootPage } = require('./pageharness');
const INV = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'liveviews', 'inventory.json'), 'utf8'));

/** A server for a real page: its declared views, labels, and scripted writes. */
function pageServer(company, page) {
  const views = INV.companies[company].pageViews[page];
  const labels = {};
  const tables = [];
  Object.keys(views).forEach(v => views[v].forEach(t => { if (tables.indexOf(t) === -1) tables.push(t); }));
  tables.forEach(t => { const l = INV.labels[company][t]; if (l) labels[t] = l.label; });
  let clock = 1759219200000;
  const stamps = {};
  tables.forEach(t => { stamps[t] = { t: clock - 1000, w: [] }; });
  return {
    views, tables,
    write: (t, who) => { clock += 5; stamps[t] = { t: clock, w: [{ t: clock, r: 'rid-' + who + '-0000000000', u: who + '@x', n: who }].concat(stamps[t].w).slice(0, 5) }; },
    reply: () => {
      const versions = {}, meta = {};
      tables.forEach(t => { versions[t] = JSON.stringify(stamps[t]); meta[t] = JSON.parse(versions[t]); });
      return { status: 'success', page, tables, versions, meta, views, labels, now: String(clock) };
    }
  };
}

async function drive(sb) {
  for (let i = 0; i < 2; i++) {
    const due = sb.__timers.slice();
    sb.__timers.length = 0;
    due.forEach(t => { try { if (t && typeof t.fn === 'function') t.fn(); } catch (e) {} });
    await settle();
  }
}

function bootReal(file, company, page, extra) {
  const srv = pageServer(company, page);
  const calls = [];
  const sb = bootPage(Object.assign({
    page: file, isSuperAdmin: true,
    containers: ['tl-content', 'vf-purchasing-content', 'content', 'app', 'ac-root'],
    scriptlets: { CURRENT_ACTION: "'" + page + "'" },
    call: (a) => {
      calls.push(a);
      if (a === 'get_page_versions') return srv.reply();
      return { status: 'success', headers: [], rows: [], data: [], items: [], options: {}, employees: [], salaries: [], batches: [] };
    }
  }, extra || {}));
  const count = a => calls.filter(x => x === a).length;
  return { sb, srv, calls, count };
}
const onlyIn = (views, a, b) => views[a].filter(t => views[b].indexOf(t) === -1);

async function realPages() {
  /* Testing System + Top Light: a list that swaps to a full-screen form. */
  for (const [company, file, page, optionsAction] of [
    ['ErpTest', 'Company_ErpTest_Sales.html', 'et_sales', 'get_et_sales_options'],
    ['TopLight', 'Company_TopLight_Sales.html', 'tl_sales', 'get_sales_options']]) {
    console.log('\nP3 — ' + company + ': ' + file + ' (list → form → list)\n');
    const { sb, srv, count } = bootReal(file, company, page);
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'list', 'the page opens on the list view', sb.UIC.Live.currentView());
    sb.openForm('');
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'form', 'openForm switches to the form view');
    srv.write(srv.views.form[0], 'ahmed');
    await drive(sb);
    const chip = sb.document.getElementById('uic-live-fresh');
    check(chip && /بواسطة <b>ahmed<\/b>/.test(chip.innerHTML), 'a change to the open form asks first (never redrawn under the user)', chip && chip.innerHTML);
    sb.UIC.Live.dismissFresh();
    const listOnly = onlyIn(srv.views, 'list', 'form');
    if (listOnly.length) {
      srv.write(listOnly[0], 'sara');
      await drive(sb);
      check(sb.UIC.Live.staleTables().indexOf(listOnly[0]) !== -1, 'a list-only table (' + listOnly[0] + ') moving while the form is open is stale, silent');
    }
    const listAction = 'get_' + (company === 'ErpTest' ? 'et_' : '') + 'sales_headers';
    const n0 = count(listAction);
    sb.showList();
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'list' && count(listAction) === n0 + 1 && sb.UIC.Live.staleTables().length === 0,
      'back to the list: one list fetch, stale cleared', { view: sb.UIC.Live.currentView(), fetches: count(listAction) - n0, stale: sb.UIC.Live.staleTables() });
    void optionsAction;
  }

  /* Top Chemical: tabs. */
  {
    console.log('\nP3 — TopChemical: Company_TopChemical_BudgetHR.html (tab → tab)\n');
    const { sb, srv, count } = bootReal('Company_TopChemical_BudgetHR.html', 'TopChemical', 'tc_budget_hr');
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'tab:employees', 'the page opens on tab:employees', sb.UIC.Live.currentView());
    srv.write('legal_salaries', 'sara');
    const n0 = count('get_legal_salaries');
    await drive(sb);
    check(sb.UIC.Live.staleTables().indexOf('legal_salaries') !== -1 && count('get_legal_salaries') === n0, 'salaries moved on the employees tab: stale, nothing reloads');
    sb.switchTab('salaries');
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'tab:salaries' && count('get_legal_salaries') >= n0 + 1 && sb.UIC.Live.staleTables().length === 0,
      'switching to the salaries tab reloads it (stale cleared)', { view: sb.UIC.Live.currentView(), loads: count('get_legal_salaries') - n0 });
  }

  /* Valley Foods: list ↔ full-screen form. */
  {
    console.log('\nP3 — ValleyFoods: Company_ValleyFoods_Purchasing.html (list → form → list)\n');
    const { sb, srv, count } = bootReal('Company_ValleyFoods_Purchasing.html', 'ValleyFoods', 'vf_purchasing',
      { expose: ['openForm', 'showList'] });
    await drive(sb);
    const fn = n => (typeof sb[n] === 'function' ? sb[n] : sb.exported(n));
    check(sb.UIC.Live.currentView() === 'list', 'the page opens on the list view', sb.UIC.Live.currentView());
    fn('openForm')('');
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'form', 'openForm switches to the form view');
    const opt1 = count('get_valley_purchasing_options');
    fn('showList')();
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'list', 'back to the list view');
    const listTable = srv.views.list[0];
    srv.write(listTable, 'sara');
    await drive(sb);
    check(sb.UIC.Live.staleTables().length === 0, 'a list table moving while on the list is in view (not stale)');
    void opt1;
  }

  /* Assessment: a list with dialogs. */
  {
    console.log('\nP3 — Assessment: Company_Assessment_Batches.html (list + dialog)\n');
    const { sb, srv } = bootReal('Company_Assessment_Batches.html', 'Assessment', 'ac_batches');
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'list', 'the page opens on the list view', sb.UIC.Live.currentView());
    sb.UIC.openModal('ac-batch-modal', { title: 't', body: '' });
    srv.write(srv.views.list[0], 'ahmed');
    await drive(sb);
    const chip = sb.document.getElementById('uic-live-fresh');
    check(chip && /ahmed/.test(chip.innerHTML), 'a list table changing under an open dialog asks first, naming the writer', chip && chip.innerHTML);
    sb.UIC.closeModal('ac-batch-modal');
  }

  /* Valley Foods: dialog-only tables (the invoice dialog shows live stock). */
  {
    console.log('\nP3 — ValleyFoods: Company_ValleyFoods_Sales.html (list + invoice dialog)\n');
    const { sb, srv } = bootReal('Company_ValleyFoods_Sales.html', 'ValleyFoods', 'vf_sales');
    /* This page starts its watch on DOMContentLoaded. */
    sb.fireReady();
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'list', 'the page opens on the list view', sb.UIC.Live.currentView());
    const formOnly = onlyIn(srv.views, 'form', 'list');
    check(formOnly.indexOf('valley_current_products') !== -1, '  (the dialog shows stock tables the list does not: ' + formOnly.join(', ') + ')');
    srv.write('valley_current_products', 'sara');
    await drive(sb);
    check(sb.UIC.Live.staleTables().indexOf('valley_current_products') !== -1 && !sb.document.getElementById('uic-live-fresh'),
      'with no dialog open, a stock change is stale and silent');
    sb.UIC.openModal('vf-inv-modal', { title: 't', body: '' });
    srv.write('valley_current_products', 'ahmed');
    await drive(sb);
    const chip = sb.document.getElementById('uic-live-fresh');
    check(chip && /أرصدة المخزون/.test(chip.innerHTML) && /ahmed/.test(chip.innerHTML), 'with the invoice dialog open, the stock change is on screen: «تم تحديث أرصدة المخزون بواسطة ahmed …»', chip && chip.innerHTML);
    sb.UIC.closeModal('vf-inv-modal');
  }
}

/* ── P5 — record level for an open form (Top Light and Testing System) ── */
async function recordLevel() {
  for (const [company, file, page, table] of [
    ['TopLight', 'Company_TopLight_Sales.html', 'tl_sales', 'top_light_sales_invoices'],
    ['ErpTest', 'Company_ErpTest_Sales.html', 'et_sales', 'erp_test_sales_invoices']]) {
    console.log('\nP5 — ' + company + ': another user edits the invoice I have open\n');
    const srv = pageServer(company, page);
    const calls = [];
    const listAction = company === 'ErpTest' ? 'get_et_sales_headers' : 'get_sales_headers';
    const sb = bootPage({
      page: file, isSuperAdmin: true, containers: ['tl-content'],
      scriptlets: { CURRENT_ACTION: "'" + page + "'" },
      call: (a) => {
        calls.push(a);
        if (a === 'get_page_versions') return srv.reply();
        return { status: 'success', headers: [{ invoice_unique_id: 'INV-1' }, { invoice_unique_id: 'INV-2' }], lines: [], options: {} };
      }
    });
    const count = a => calls.filter(x => x === a).length;
    /* Writes whose stamp entry carries record keys, as noteRecordChange_ stores them. */
    const baseReply = srv.reply;
    const keyed = {};
    const writeKeyed = (t, who, keys) => {
      srv.write(t, who);
      const st = JSON.parse(baseReply().versions[t]);
      st.w[0].k = keys;
      st.w.slice(1).forEach(w => { const prev = (keyed[t] || { w: [] }).w.find(x => x.t === w.t); if (prev) w.k = prev.k; });
      keyed[t] = st;
    };
    srv.reply = () => {
      const r = baseReply();
      Object.keys(keyed).forEach(t => { r.versions[t] = JSON.stringify(keyed[t]); r.meta[t] = JSON.parse(r.versions[t]); });
      return r;
    };
    await drive(sb);
    sb.openForm('INV-1');
    await drive(sb);
    check(sb.UIC.Live.currentView() === 'form', 'editing INV-1: the form view is on screen');
    sb.document.activeElement = { tagName: 'INPUT' };

    writeKeyed(table, 'ahmed', ['INV-2']);
    await drive(sb);
    const chipA = sb.document.getElementById('uic-live-fresh');
    check(!chipA, 'another user saves INV-2 (a different invoice): my form is not interrupted', chipA && chipA.innerHTML);
    check(sb.UIC.Live.staleTables().indexOf(table) !== -1, '  and the list is marked stale');

    writeKeyed(table, 'ahmed', ['INV-1']);
    await drive(sb);
    const chipB = sb.document.getElementById('uic-live-fresh');
    check(chipB && /قام <b>ahmed<\/b> بتعديل هذا السجل أثناء فتحه — أعد التحميل قبل الحفظ/.test(chipB.innerHTML),
      'another user saves INV-1 (mine): the conflict notice shows, even while I am typing', chipB && chipB.innerHTML);

    sb.document.activeElement = null;
    sb.UIC.Live.dismissFresh();
    const n0 = count(listAction);
    sb.showList();
    await drive(sb);
    check(count(listAction) === n0 + 1 && sb.UIC.Live.staleTables().indexOf(table) === -1, 'closing the form: the list refreshes once, stale cleared');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
