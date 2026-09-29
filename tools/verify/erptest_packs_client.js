'use strict';

/**
 * P11 client module (Company_ErpTest_Packs.html) against an in-memory IndexedDB
 * and a scripted server — local mirror of plan Appendix 2 T-CLIENT:
 * warm render before the network, sync-driven refresh, journal apply on save,
 * cash never stored, 7-day expiry, logout / different-user isolation.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
let failed = 0;
function ok(v, msg) { console.log((v ? '  PASS  ' : '  FAIL  ') + msg); if (!v) failed++; }

/* ── minimal IndexedDB ── */
function makeIDB() {
  const dbs = new Map();
  const later = (fn) => setTimeout(fn, 0);
  function request(run) {
    const r = { onsuccess: null, onerror: null, onupgradeneeded: null, result: undefined, error: null };
    later(function () { try { run(r); } catch (e) { r.error = e; if (r.onerror) r.onerror(); } });
    return r;
  }
  function dbObject(name) {
    const data = dbs.get(name);
    return {
      objectStoreNames: { contains: (s) => data.has(s) },
      createObjectStore: (s) => { data.set(s, new Map()); },
      transaction: (s) => ({
        objectStore: () => ({
          get: (k) => request((r) => { const v = data.get(s).get(k); r.result = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); r.onsuccess && r.onsuccess(); }),
          put: (v, k) => request((r) => { data.get(s).set(k, JSON.parse(JSON.stringify(v))); r.result = k; r.onsuccess && r.onsuccess(); })
        })
      })
    };
  }
  return {
    __dbs: dbs,
    open: (name) => request((r) => {
      const fresh = !dbs.has(name);
      if (fresh) dbs.set(name, new Map());
      r.result = dbObject(name);
      if (fresh && r.onupgradeneeded) r.onupgradeneeded();
      r.onsuccess && r.onsuccess();
    }),
    deleteDatabase: (name) => request((r) => { dbs.delete(name); r.onsuccess && r.onsuccess(); })
  };
}

/* ── browser-ish context ── */
function makeWindow(emailBox, idb) {
  const ls = new Map();
  const localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => ls.set(k, String(v)),
    removeItem: (k) => ls.delete(k),
    get length() { return ls.size; }
  };
  const lsProxy = new Proxy(localStorage, { ownKeys: () => Array.from(ls.keys()), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  const w = {
    indexedDB: idb, localStorage: lsProxy, setTimeout, console, Promise, JSON, Date, Object, Array, String, Number, Math,
    API: { getSession: () => ({ email: emailBox.email }) },
    SESSION: { logout: function () { w.__loggedOut = (w.__loggedOut || 0) + 1; } },
    __loggedOut: 0
  };
  w.window = w;
  vm.createContext(w);
  let src = fs.readFileSync(path.join(ROOT, 'Company_ErpTest_Packs.html'), 'utf8');
  src = src.replace(/^<script>/, '').replace(/<\/script>\s*$/, '').replace(/<\?!=[\s\S]*?\?>/, 'true');
  vm.runInContext(src, w, { filename: 'Company_ErpTest_Packs.html' });
  return w;
}

/* ── scripted server ── */
const server = {
  seq: { erp_test_sales_invoices: 3, erp_test_sales_products: 5, erp_test_cash_bank_movement: 9 },
  listCalls: 0, syncCalls: 0, version: 1, clientPacks: true,
  call: function (action, data) {
    if (action === 'get_et_sales_headers') { server.listCalls++; return Promise.resolve({ status: 'success', headers: [{ v: server.version }] }); }
    if (action === 'get_et_sync') {
      server.syncCalls++;
      if (!server.clientPacks) return Promise.resolve({ status: 'success', client_packs: false, tables: {} });
      const tables = {};
      const want = Object.assign({}, data.tables || {});
      if (!Object.keys(want).length) Object.keys(server.seq).forEach(function (t) { want[t] = -1; });
      Object.keys(want).forEach(function (t) {
        const head = server.seq[t];
        if (want[t] === head) tables[t] = { mode: 'same', seq: head };
        else if (t === 'erp_test_cash_bank_movement') tables[t] = { mode: 'changed', seq: head };
        else tables[t] = { mode: 'full', seq: head, pack: { t: t, seq: head, cols: ['unique_id', 'x'], rows: [['k1', head]] } };
      });
      return Promise.resolve({ status: 'success', client_packs: true, tables: tables });
    }
    if (action === 'add_et_sales') {
      server.seq.erp_test_sales_invoices++; server.version++;
      return Promise.resolve({ status: 'success', journal: [{ seq: server.seq.erp_test_sales_invoices, table: 'erp_test_sales_invoices', op: 'insert', key: 'k2', data: { unique_id: 'k2', x: 7 } }] });
    }
    return Promise.resolve({ status: 'success' });
  }
};
const tick = () => new Promise((r) => setTimeout(r, 5));

(async function () {
  const emailBox = { email: 'a@test' };
  const idb = makeIDB();
  let w = makeWindow(emailBox, idb);
  let refreshes = 0;
  let call = w.ET_PACKS.wrapCall(server.call, { page: 'et_sales', list: 'get_et_sales_headers', refresh: function () { refreshes++; } });

  // 1. cold
  let r = await call('get_et_sales_headers', {});
  ok(r.headers[0].v === 1 && server.listCalls === 1, 'cold load fetches the list from the server');
  await tick();
  ok(idb.__dbs.has('erp_packs_37fc50edf1424abd_a@test'), 'IndexedDB erp_packs_<company>_<email> created');

  // 2. warm, unchanged
  r = await call('get_et_sales_headers', {});
  ok(r.headers[0].v === 1 && server.listCalls === 1, 'warm load renders the cached view without a list call');
  await tick(); await tick();
  ok(refreshes === 0, 'unchanged seqs after sync -> no refresh');

  // 3. change on the server (another device)
  server.seq.erp_test_sales_invoices = 4; server.version = 2;
  r = await call('get_et_sales_headers', {});
  ok(r.headers[0].v === 1, 'warm load still paints first (before the network)');
  await tick(); await tick();
  ok(refreshes === 1, 'sync saw the change -> page refresh requested');
  r = await call('get_et_sales_headers', {});
  ok(r.headers[0].v === 2 && server.listCalls === 2, 'the refresh goes to the network and gets the new list');

  // 3b. a cash change (never stored) still refreshes the view
  await tick();
  server.seq.erp_test_cash_bank_movement = 10; server.version = 2;
  await call('get_et_sales_headers', {});
  await tick(); await tick();
  ok(refreshes === 2, 'a change to the (unstored) cash table still triggers a refresh');
  await call('get_et_sales_headers', {});

  // 4. save: journal applied locally, next list is fresh
  const before = await w.ET_PACKS.get('erp_test_sales_invoices');
  const save = await call('add_et_sales', {});
  await tick();
  const after = await w.ET_PACKS.get('erp_test_sales_invoices');
  ok(save.journal && after && after.rows.length === before.rows.length + 1 && after.seq === 5, 'save reply journal applied to the local pack');
  r = await call('get_et_sales_headers', {});
  ok(r.headers[0].v === 3 && server.listCalls === 4, 'after a save the next list read is fresh (no stale view)');

  // 5. cash never stored
  ok((await w.ET_PACKS.get('erp_test_cash_bank_movement')) === null, 'erp_test_cash_bank_movement is never stored');

  // 6. 7-day expiry
  const db = idb.__dbs.get('erp_packs_37fc50edf1424abd_a@test');
  const e = db.get('packs').get('erp_test_sales_products');
  e.ts = Date.now() - 8 * 24 * 3600 * 1000;
  ok((await w.ET_PACKS.get('erp_test_sales_products')) === null, 'entries older than 7 days are discarded');

  // 7. logout clears the database, then logs out
  w.SESSION.logout();
  await tick(); await tick();
  ok(!idb.__dbs.has('erp_packs_37fc50edf1424abd_a@test') && w.__loggedOut === 1, 'logout deletes erp_packs_… then runs the real logout');

  // 8. a different user on the same browser never sees the first user's data
  w = makeWindow(emailBox, idb);
  call = w.ET_PACKS.wrapCall(server.call, { page: 'et_sales', list: 'get_et_sales_headers', refresh: function () {} });
  await call('get_et_sales_headers', {});
  await tick();
  w.localStorage.setItem('erp_packs_last_email_37fc50edf1424abd', 'a@test');
  emailBox.email = 'b@test';
  const w2 = makeWindow(emailBox, idb);
  w2.localStorage.setItem('erp_packs_last_email_37fc50edf1424abd', 'a@test');
  await w2.ET_PACKS.open();
  await tick();
  ok(!idb.__dbs.has('erp_packs_37fc50edf1424abd_a@test') && idb.__dbs.has('erp_packs_37fc50edf1424abd_b@test'), 'a different signed-in email deletes the previous user\'s database');

  // 9. flag off on the server -> module steps aside
  server.clientPacks = false;
  const w3 = makeWindow(emailBox, idb);
  const c3 = w3.ET_PACKS.wrapCall(server.call, { page: 'et_sales', list: 'get_et_sales_headers', refresh: function () {} });
  const lc = server.listCalls;
  await c3('get_et_sales_headers', {});
  await c3('get_et_sales_headers', {});
  ok(server.listCalls === lc + 2 && w3.ET_CLIENT_PACKS === false, 'client_packs:false -> every list read goes to the server (legacy behaviour)');

  console.log('\n' + (failed ? failed + ' client-pack check(s) FAILED.' : 'erp_test client packs (T-CLIENT) passes.') + '\n');
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
