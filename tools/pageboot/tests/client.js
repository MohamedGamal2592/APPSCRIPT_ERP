/**
 * Page boot — client checks: the runtime (Page_Boot.html) behind the real
 * API.call wrapper from Client_Helpers.html. Run from the repository root
 * after phase 1: node tools/pageboot/tests/client.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const rtSrc = fs.readFileSync(path.join(ROOT, 'Page_Boot.html'), 'utf8');
const RUNTIME = rtSrc.slice(rtSrc.indexOf('<script>') + 8, rtSrc.lastIndexOf('</script>'));
const helpers = fs.readFileSync(path.join(ROOT, 'Client_Helpers.html'), 'utf8');
const wStart = helpers.indexOf('/* [page-boot] A read this page already received inside its HTML');
const wEnd = helpers.indexOf('API._callInner = function (action, payload, sessionToken, opts) {');
let failed = 0;
function check(ok, label, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label);
  if (!ok) { failed++; if (extra !== undefined) console.log('        ' + JSON.stringify(extra).slice(0, 500)); }
}
check(wStart !== -1 && wEnd > wStart, 'Client_Helpers.html carries the API.call wrapper before API._callInner');
const WRAPPER = helpers.slice(wStart, wEnd);

const CO = 'C1';
function boot(mode, reads, extra) {
  return Object.assign({ page: 'p1', company: CO, mode: mode, admin: false, waitFor: '', query: 'action=p1', server_ms: 5, reads: reads }, extra || {});
}
const R = (action, data, reply, ok) => ({ action, data, ok: ok !== false, reply: ok === false ? null : reply, ms: 1 });

function world(cfg, opts) {
  opts = opts || {};
  let now = opts.now || 1000000;
  const net = [];
  const store = {};
  const timers = [];
  const ctx = {
    console, JSON, Object, Array, String, Number, Math, Promise,
    Date: Object.assign(function (x) { return x === undefined ? new Date(now) : new Date(x); }, { now: () => now }),
    setTimeout: (f) => { timers.push(f); return timers.length; },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { readyState: 'complete', getElementById: () => null, createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {} }, addEventListener() {} },
    URLSearchParams: URLSearchParams, location: { search: '?sessionToken=tok' },
    __PAGE_BOOT__: cfg
  };
  ctx.window = ctx; ctx.top = { location: {} };
  vm.createContext(ctx);
  vm.runInContext(RUNTIME, ctx);
  vm.runInContext('var API = {};\n' + WRAPPER + '\nAPI._callInner = function (a, p) { __net(a, p); return new Promise(function (res) { __resolvers.push(res); }); };', Object.assign(ctx, {
    __net: (a, p) => net.push(a + ' ' + (p && p.module_action) + ' ' + JSON.stringify(p && p.data)), __resolvers: []
  }));
  const call = (action, data, company) => ctx.API.call('company_action', { target_system: company || CO, module_action: action, data: data });
  const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); while (timers.length) timers.shift()(); await Promise.resolve(); } };
  return { ctx, net, call, flush, store, tick: ms => { now += ms; }, resolveAll: v => { ctx.__resolvers.splice(0).forEach(r => r(v)); } };
}

(async function () {
  console.log('\n1 — answering\n');
  const V = { status: 'success', versions: { t: 1 } };
  const L = { status: 'success', list: [1, 2] };
  let w = world(boot('embed', [R('get_page_versions', { page: 'p1' }, V), R('get_list', { b: 2, a: 1 }, L)]));
  let r = await w.call('get_list', { a: 1, b: 2 });
  check(JSON.stringify(r) === JSON.stringify(L) && w.net.length === 0, 'a matching read (keys in another order) is answered from the page, no network');
  await w.call('get_list', { a: 1, b: 2 });
  check(w.net.length === 1, 'the same read again goes to the server (used once)', w.net);
  await w.call('get_list', { a: 1, b: 3 });
  check(w.net.length === 2, 'different data → server');
  w.call('get_list', { a: 1, b: 2 }, 'OTHER');
  check(w.net.length === 3, "another company's call is never answered");
  w.ctx.API.call('admin_list_users', {});
  check(w.net.length === 4, 'a router route (not company_action) is never answered');

  console.log('\n2 — stamps reuse window, data age limit\n');
  w = world(boot('embed', [R('get_page_versions', { page: 'p1' }, V), R('get_list', {}, L)]));
  await w.call('get_page_versions', { page: 'p1' });
  w.tick(3000); await w.call('get_page_versions', { page: 'p1' });
  check(w.net.length === 0, 'stamps answered twice within 8 s');
  w.tick(6000); await w.call('get_page_versions', { page: 'p1' });
  check(w.net.length === 1, 'after 8 s a used stamps entry goes to the server (the live watch always polls for real)', w.net);
  w = world(boot('embed', [R('get_page_versions', { page: 'p1' }, V), R('get_list', {}, L)]));
  w.tick(9000); await w.call('get_page_versions', { page: 'p1' });
  check(w.net.length === 0, 'an unused stamps entry still answers the FIRST call after 8 s');
  w.tick(200000); await w.call('get_list', {});
  check(w.net.length === 1, 'a data read first asked 120 s+ after load goes to the server');
  const a1 = await (w = world(boot('embed', [R('get_page_versions', { page: 'p1' }, V)]))).call('get_page_versions', { page: 'p1' });
  a1.versions.t = 999;
  const a2 = await w.call('get_page_versions', { page: 'p1' });
  check(a2.versions.t === 1, 'stamps are handed out as copies (a caller cannot change the next answer)');

  console.log('\n3 — failed embeds, off mode, no config\n');
  w = world(boot('embed', [R('get_list', {}, null, false)]));
  await w.call('get_list', {});
  check(w.net.length === 1, 'a read that failed on the server (ok:false) is fetched');
  w = world(boot('off', [R('get_list', {}, null, false)]));
  await w.call('get_list', {});
  check(w.net.length === 1, 'off mode answers nothing');
  w = world(undefined);
  await w.call('get_list', {});
  check(w.net.length === 1 && !!w.ctx.PageBoot, 'no __PAGE_BOOT__ → the runtime is inert, everything goes to the server');

  console.log('\n4 — timing a measured load\n');
  function series(w, mode) {
    w.store.erp_navprobe_v1 = JSON.stringify({ pending: { page: 'p1', mode: mode, t: 1000000 - 4000 }, queue: [], samples: [] });
  }
  w = world(boot('embed', [R('get_page_versions', { page: 'p1' }, V), R('get_a', {}, L), R('get_b', { x: 1 }, L)]));
  series(w, 'embed');
  await w.call('get_a', {});
  await w.flush();
  let st = JSON.parse(w.store.erp_navprobe_v1);
  check(st.samples.length === 0, 'not «shown» while a declared read is still missing');
  w.tick(700);
  await w.call('get_b', { x: 1 });
  await w.flush();
  st = JSON.parse(w.store.erp_navprobe_v1);
  check(st.samples.length === 1 && st.samples[0].mode === 'embed' && st.samples[0].page_ms === 4000 && st.samples[0].content_ms === 4700 && !st.pending, 'shown once every declared read is handed over: page 4000 ms, data 4700 ms', st);
  check(st.samples[0].boot_server_ms === 5 && st.samples[0].boot_bytes > 0, 'the sample carries the server time and size of the embedded data');

  w = world(boot('off', [R('get_a', {}, null, false)]));
  series(w, 'off');
  const pa = w.call('get_a', {});
  check(w.net.length === 1, 'off: the read goes to the server');
  w.tick(2500);
  w.resolveAll(L);
  await pa; await w.flush();
  st = JSON.parse(w.store.erp_navprobe_v1);
  check(st.samples.length === 1 && st.samples[0].mode === 'off' && st.samples[0].content_ms === 6500, 'off: timed when the server answer is handed over (6500 ms)', st.samples);

  w = world(boot('embed', [R('get_a', {}, L)], { waitFor: 'later' }));
  w.store.erp_navprobe_v1 = JSON.stringify({ pending: { page: 'p1', mode: 'embed', t: 1000000 - 1000 }, queue: [{ page: 'p1', mode: 'off', url: 'U-off' }], samples: [] });
  await w.call('get_a', {}); await w.flush();
  st = JSON.parse(w.store.erp_navprobe_v1);
  check(st.queue.length === 1, 'waitFor: the series waits for the later part before moving on');
  w.tick(3000);
  w.ctx.PageBoot.mark('later');
  await w.flush();
  st = JSON.parse(w.store.erp_navprobe_v1);
  check(st.queue.length === 0 && st.pending && st.pending.mode === 'off' && st.samples[0].marks.later === 4000, '…then records the mark (4000 ms from the click) and moves on', st);

  console.log(failed ? '\n' + failed + ' client check(s) FAILED' : '\npage boot client checks pass');
  process.exit(failed ? 1 : 0);
})();
