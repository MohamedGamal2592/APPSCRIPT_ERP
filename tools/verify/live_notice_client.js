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

  console.log(failed ? '\nlive_notice_client: FAIL (' + failed + ')' : '\nlive_notice_client: OK');
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
