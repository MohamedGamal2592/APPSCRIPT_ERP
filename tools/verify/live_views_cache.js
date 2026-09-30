/**
 * LIVE-NOTICE P6 — views from JSON kept on the device, trusted only as far as
 * the stamps allow.
 *
 * Real pages (one per company) boot through pageharness.js on ONE shared
 * localStorage ("the same browser"); each boot is a visit. A scripted server
 * answers get_page_versions with stamps and counts the list calls.
 *
 *   1 first visit                         → full fetch; reply stored with its tag
 *   2 second visit, stamps unchanged      → inert paint at once → live; NO list call
 *   3 second visit, a view table moved    → inert paint → one list call → live
 *   4 a stamp missing (evicted)           → list call
 *   5 entry older than maxAge             → list call
 *   6 open; another user, off-view table  → only entries on that table dropped
 *   7 open; my own save                   → no notice; this view's entry dropped
 *   8 another user, same browser          → never reads the first user's entry
 *   9 logout                              → erp_c_* cleared
 *  10 reply > 400 KB, or an opt-out page  → never stored
 *  11 a click while the inert paint shows → ignored
 *
 * Run: node tools/verify/live_views_cache.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage } = require('./pageharness');

const INV = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'liveviews', 'inventory.json'), 'utf8'));
let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))); }
}
const settle = () => new Promise(r => setImmediate(r));

function memStorage() {
  const m = {};
  return {
    getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    key: i => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    _keys: () => Object.keys(m)
  };
}

/** The server: stamps per table for the page's declared views; counts calls. */
function makeServer(company, page) {
  const views = INV.companies[company].pageViews[page];
  const tables = [];
  Object.keys(views).forEach(v => views[v].forEach(t => { if (tables.indexOf(t) === -1) tables.push(t); }));
  let clock = 1759219200000;
  const stamps = {};
  tables.forEach(t => { stamps[t] = { t: clock, w: [] }; });
  const srv = {
    views, tables, calls: [], rows: 1, big: false,
    write(t, rid, who) { clock += 10; stamps[t] = { t: clock, w: [{ t: clock, r: rid || ('rid-' + who + '-000000000000'), u: who + '@x', n: who }] }; },
    evict(t) { delete stamps[t]; },
    reply() {
      const versions = {}, meta = {};
      Object.keys(stamps).forEach(t => { versions[t] = JSON.stringify(stamps[t]); meta[t] = JSON.parse(versions[t]); });
      return { status: 'success', page, tables, versions, meta, views, labels: {}, now: String(clock) };
    },
    count(a) { return srv.calls.filter(x => x === a).length; }
  };
  return srv;
}

function visit(file, srv, storage, user, listReply) {
  const sb = bootPage({
    page: file, isSuperAdmin: true,
    containers: ['tl-content', 'products-content', 'content', 'app', 'ac-root', 'vf-products-content'],
    scriptlets: { CURRENT_ACTION: "'x'" },
    globals: { localStorage: storage, AUTH_USER_EMAIL: user },
    call: (a) => {
      srv.calls.push(a);
      if (a === 'get_page_versions') return srv.reply();
      return listReply(a);
    }
  });
  sb.fireReady();
  return sb;
}
async function drive(sb, n) {
  for (let i = 0; i < (n || 3); i++) {
    await settle();
    const due = sb.__timers.slice();
    sb.__timers.length = 0;
    due.forEach(t => {
      if (t && t.ms !== undefined && t.ms >= 1000) { sb.__timers.push(t); return; }   // long timers stay queued
      try { if (t && typeof t.fn === 'function') t.fn(); } catch (e) {}
    });
    await settle();
  }
}
const lvKeys = (storage, page) => storage._keys().filter(k => k.indexOf('|lv:' + page + ':') !== -1);

const CASES = [
  { company: 'ErpTest', file: 'Company_ErpTest_Sales.html', page: 'et_sales', list: 'get_et_sales_headers', reply: { headers: [{ invoice_unique_id: 'I-1' }] } },
  { company: 'TopLight', file: 'Company_TopLight_Products.html', page: 'tl_products', list: 'get_products', reply: { products: [{ id: 1, name_ar: 'منتج' }] } },
  { company: 'TopChemical', file: 'Company_TopChemical_Products.html', page: 'tc_products', list: 'get_products', reply: { products: [], data: [] } },
  { company: 'ValleyFoods', file: 'Company_ValleyFoods_Products.html', page: 'vf_products', list: 'get_valley_products', reply: { products: [], data: [] } },
  { company: 'Assessment', file: 'Company_Assessment_Assessments.html', page: 'ac_assessments', list: 'get_ac_assessments', reply: { assessments: [], data: [] } }
];

async function runCase(c) {
  console.log('\n' + c.company + ' — ' + c.file + '\n');
  const storage = memStorage();
  const srv = makeServer(c.company, c.page);
  let marker = 1;
  const listReply = a => Object.assign({ status: 'success', marker: a === c.list ? marker : 0 }, c.reply);
  const listView = srv.views.list || srv.views[Object.keys(srv.views)[0]];

  /* 1 — first visit */
  let sb = visit(c.file, srv, storage, 'a@x', listReply);
  await drive(sb);
  check(srv.count(c.list) === 1, '1 first visit: one list call', srv.calls);
  const k1 = lvKeys(storage, c.page);
  check(k1.length === 1, '  the reply is stored under this company/user/page/view', storage._keys());
  const stored = k1.length ? JSON.parse(storage.getItem(k1[0])) : null;
  check(stored && stored.v && listView.every(t => stored.v.indexOf(t + ':') !== -1), '  tagged with the view\'s stamps', stored && stored.v);
  const firstVersions = srv.calls.indexOf('get_page_versions'), firstList = srv.calls.indexOf(c.list);
  check(firstVersions !== -1 && firstVersions < firstList, '  on a miss the stamps are read BEFORE the list', srv.calls);

  /* 2 — second visit, nothing changed */
  srv.calls.length = 0;
  sb = visit(c.file, srv, storage, 'a@x', listReply);
  check(sb.UIC.Live.isInert() === true, '2 second visit: painted at once, inert');
  /* 11 — a click on the inert paint is ignored */
  check(sb.UIC.Live._inertBlocks({ target: { closest: () => null } }) === true, '11 a click on a row while inert is ignored');
  check(sb.UIC.Live._inertBlocks({ target: { closest: () => ({}) } }) === false, '   (the nav and the notice stay clickable)');
  await drive(sb);
  check(sb.UIC.Live.isInert() === false && srv.count(c.list) === 0 && srv.count('get_page_versions') >= 1,
    '  → live after the stamp check, with NO list call', srv.calls);

  /* 3 — second visit, a view table moved */
  srv.calls.length = 0;
  srv.write(listView[0], '', 'sara');
  marker = 2;
  sb = visit(c.file, srv, storage, 'a@x', listReply);
  check(sb.UIC.Live.isInert() === true, '3 a view table moved: still painted inert first');
  await drive(sb);
  check(srv.count(c.list) === 1 && sb.UIC.Live.isInert() === false, '  → exactly one list call, then live', srv.calls);
  const s3 = JSON.parse(storage.getItem(lvKeys(storage, c.page)[0]));
  check(s3 && s3.d && s3.d.marker === 2, '  and the new reply replaced the stored one', s3 && s3.d && s3.d.marker);

  /* 4 — a stamp missing */
  srv.calls.length = 0;
  const saved = JSON.stringify(srv.reply().versions[listView[0]]);
  srv.evict(listView[0]);
  sb = visit(c.file, srv, storage, 'a@x', listReply);
  await drive(sb);
  check(srv.count(c.list) === 1, '4 a missing stamp is unknown: list call', srv.calls);
  void saved;
  srv.write(listView[0], '', 'sara');
  srv.calls.length = 0;
  sb = visit(c.file, srv, storage, 'a@x', listReply);
  await drive(sb);

  /* 5 — too old */
  srv.calls.length = 0;
  const key = lvKeys(storage, c.page)[0];
  const rec = JSON.parse(storage.getItem(key));
  rec.at -= 11 * 60 * 1000;
  storage.setItem(key, JSON.stringify(rec));
  sb = visit(c.file, srv, storage, 'a@x', listReply);
  await drive(sb);
  check(srv.count(c.list) === 1, '5 older than maxAge (10 min): list call even with matching stamps', srv.calls);

  /* 6 — while open: another user, off-view table */
  const offView = srv.tables.filter(t => listView.indexOf(t) === -1);
  {
    /* An unrelated entry on the same browser, depending on a table this page does not show. */
    sb.UIC.Cache.set(sb.UIC.Cache.key('', 'lv:other:list:x', {}, ''), { status: 'success' }, { version: 'x', tables: ['some_other_table'] });
    const before = storage._keys().length;
    sb.UIC.Live.watchPage({ call: a => Promise.resolve(srv.reply()), page: c.page, onChange: () => {} });
    const tick = async () => { const due = sb.__timers.slice(); sb.__timers.length = 0; due.forEach(t => { try { t.fn(); } catch (e) {} }); await settle(); await settle(); };
    await tick();
    if (offView.length) {
      srv.write(offView[0], '', 'sara');
      await tick();
      check(lvKeys(storage, c.page).length === 1 && storage._keys().length === before,
        '6 another user changes an off-view table (' + offView[0] + '): this view\'s entry and unrelated ones survive', storage._keys().length - before);
      check(sb.UIC.Live.staleTables().indexOf(offView[0]) !== -1, '  and nothing on screen moves (marked stale)');
    } else {
      srv.write(listView[0], '', 'sara');
      await tick();
      check(lvKeys(storage, c.page).length === 0 && storage._keys().some(k => k.indexOf('lv:other:list') !== -1),
        '6 (no off-view table) a view table moved: only entries that depend on it are dropped', storage._keys());
      sb.UIC.Live.unwatchPage();
      srv.calls.length = 0;
      sb = visit(c.file, srv, storage, 'a@x', listReply);
      await drive(sb);
      sb.UIC.Live.watchPage({ call: a => Promise.resolve(srv.reply()), page: c.page, onChange: () => {} });
      await tick();
    }
    /* 7 — my own save */
    sb.UIC.Live.markOwnRequest('rid-mine-000000000001');
    srv.write(listView[0], 'rid-mine-000000000001', 'a');
    await tick();
    check(!sb.document.getElementById('uic-live-fresh') && lvKeys(storage, c.page).length === 0,
      '7 my own save: no notice, and this view\'s entry is dropped', lvKeys(storage, c.page));
    sb.UIC.Live.unwatchPage();
    srv.calls.length = 0;
    sb = visit(c.file, srv, storage, 'a@x', listReply);
    await drive(sb);
    check(srv.count(c.list) === 1, '  the next visit fetches', srv.calls);
  }

  /* 8 — another user on the same browser */
  srv.calls.length = 0;
  sb = visit(c.file, srv, storage, 'b@x', listReply);
  check(sb.UIC.Live.isInert() === false, '8 another user: nothing painted from the first user\'s entry');
  await drive(sb);
  check(srv.count(c.list) === 1 && lvKeys(storage, c.page).length === 2, '  a list call, stored under their own key', lvKeys(storage, c.page).length);

  /* 9 — logout */
  let loggedOut = false;
  sb.SESSION = sb.SESSION || {};
  sb.SESSION.logout = function () { loggedOut = true; };
  sb.UIC.Live.viewCache(function () { return Promise.resolve({}); }, { page: 'p', lists: [] });   // installs the hook lazily
  sb.document.addEventListener = sb.document.addEventListener || function () {};
  storage.setItem('erp_c_unindexed_leftover', '1');
  storage.setItem('not_ours', '1');
  sb.UIC.Live.viewCache(function () {}, { company: 'x', page: 'p', lists: ['q'] })('q');
  sb.SESSION.logout();
  check(loggedOut && storage._keys().filter(k => k.indexOf('erp_c_') === 0).length === 0 && storage.getItem('not_ours') === '1',
    '9 logout clears every erp_c_* entry (and only those)', storage._keys());
}

async function limits() {
  console.log('\n10 — limits\n');
  const c = CASES[1];
  {
    const storage = memStorage();
    const srv = makeServer(c.company, c.page);
    const big = 'x'.repeat(410000);
    const sb = visit(c.file, srv, storage, 'a@x', () => ({ status: 'success', products: [], blob: big }));
    await drive(sb);
    check(lvKeys(storage, c.page).length === 0, '10 a reply over 400 KB is never stored', storage._keys());
  }
  {
    const storage = memStorage();
    const srv = makeServer('TopLight', 'tl_cash');
    const sb = visit('Company_TopLight_Cash.html', srv, storage, 'a@x', () => ({ status: 'success', rows: [] }));
    await drive(sb);
    check(lvKeys(storage, 'tl_cash').length === 0 && srv.count('get_cash_headers') >= 1, '   an OD7 page (tl_cash) is never stored, and still loads', srv.calls);
  }
  {
    const storage = memStorage();
    const srv = makeServer(c.company, c.page);
    const sb = visit(c.file, srv, storage, 'a@x', () => ({ status: 'success', products: [] }));
    await drive(sb);
    check(lvKeys(storage, c.page).length === 1, '   (an entry is stored while the switch is on)');
    sb.UIC.Live.VIEW_CACHE = false;
    srv.calls.length = 0;
    await sb.companyCall('get_products');
    check(srv.calls.join() === 'get_products' && sb.UIC.Live.isInert() === false,
      '   UIC.Live.VIEW_CACHE = false: the list goes straight to the server, nothing painted from the device', srv.calls);
  }
  {
    /* A refresh that never collects the fresh reply must not leave the page inert. */
    const storage = memStorage();
    const srv = makeServer(c.company, c.page);
    let sb = visit(c.file, srv, storage, 'a@x', () => ({ status: 'success', products: [] }));
    await drive(sb);
    srv.write(srv.views.list[0], '', 'sara');
    sb = visit(c.file, srv, storage, 'a@x', () => ({ status: 'success', products: [] }));
    sb.UIC.Live.setView('list', { refresh: function () {} });   // collects nothing
    await drive(sb);
    const late = sb.__timers.filter(t => t.ms === 10000);
    check(sb.UIC.Live.isInert() === true && late.length === 1, '   (a refresh that ignores the fresh reply: still inert, a 10 s safety timer queued)');
    late.forEach(t => t.fn());
    check(sb.UIC.Live.isInert() === false, '   the safety timer makes the page usable again');
  }
  {
    /* loadView, the render-callback form, on its own */
    const storage = memStorage();
    const srv = makeServer(c.company, c.page);
    const sb = visit(c.file, srv, storage, 'a@x', () => ({ status: 'success', products: [] }));
    await drive(sb);
    const call = a => { srv.calls.push(a); return Promise.resolve(a === 'get_page_versions' ? srv.reply() : { status: 'success', v: 1 }); };
    const renders = [];
    await sb.UIC.Live.loadView({ company: '8df5c89a117fe9a5', page: c.page, view: 'list', action: 'get_x', payload: {}, call, render: (r, i) => renders.push(i.inert) });
    srv.calls.length = 0;
    await sb.UIC.Live.loadView({ company: '8df5c89a117fe9a5', page: c.page, view: 'list', action: 'get_x', payload: {}, call, render: (r, i) => renders.push(i.inert) });
    check(JSON.stringify(renders) === JSON.stringify([false, true, false]) && srv.calls.indexOf('get_x') === -1,
      'loadView: first load live; second paints inert then live with no list call', { renders, calls: srv.calls });
  }
}

(async function main() {
  for (const c of CASES) await runCase(c);
  await limits();
  console.log(failed ? '\nlive_views_cache: FAIL (' + failed + ')' : '\nlive_views_cache: OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
