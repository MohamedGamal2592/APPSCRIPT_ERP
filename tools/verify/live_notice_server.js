/**
 * LIVE-NOTICE P1 — the change stamp says who wrote and which request, and
 * get_page_versions says which view each table belongs to.
 *
 * Runs the REAL Code.js and the real company Actions files under gasstub (vm):
 *   1. a write served by apiRouter_ stamps w[0].r = the request id and
 *      w[0].u = the caller's email (and the meta is cleared afterwards);
 *   2. five writes keep five entries, a sixth drops the oldest;
 *   3. an old bare-number stamp still parses;
 *   4. get_page_versions returns views, labels and the union of tables, keeps
 *      `versions` as sheet -> raw stamp, and refuses a caller without read
 *      access exactly as before;
 *   5. a write outside apiRouter_ (a trigger) stamps u:'system';
 *   6. a missing stamp is seeded once (s:1) and then stays put.
 *
 * Run: node tools/verify/live_notice_server.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const gasstub = require('./gasstub');

const ROOT = path.resolve(__dirname, '..', '..');
const order = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8')).filePushOrder.filter(f => f !== 'Code.js');
const H = gasstub.createHarness({ sources: order });

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))); }
}
const stampOf = (db, t) => JSON.parse(H.rawGet('tv_' + db + '_' + t));

/* ── 1. apiRouter_ carries the request id and the caller into the stamp ── */
H.override('ensureCompaniesRegistered_', function () {});
H.override('logSystemAction_', function () {});
H.override('isSystemEnabled_', function () { return true; });
H.override('authenticateSystemUser_', function () { return { authorized: true, user: { email: 'Ahmed@X.com', name: 'أحمد' } }; });
H.eval("ROUTES.__live_test = { requireAuth: true, handler: function () { globalThis.__seen = JSON.stringify(_liveReqMeta_); noteTableChange_('db1', 'sales'); return { status: 'success' }; } };");
const RID = 'rid-0123456789abcdef';
const reply = H.call('apiRouter_', { action: '__live_test', sessionToken: 'tok', payload: { data: { __request_id: RID } } });
const seenDuring = JSON.parse(H.ctx.__seen || 'null');
check(reply && reply.status === 'success', 'the test route ran through apiRouter_', reply);
check(seenDuring && seenDuring.rid === RID && seenDuring.who === 'ahmed@x.com' && seenDuring.name === 'أحمد',
  '_liveReqMeta_ during the request = {rid, who (lower-cased email), name}', seenDuring);
check(H.eval('_liveReqMeta_') === null, '_liveReqMeta_ is cleared when the request ends');
let st = stampOf('db1', 'sales');
check(st.w.length === 1 && st.w[0].r === RID && st.w[0].u === 'ahmed@x.com' && st.w[0].n === 'أحمد' && st.t === st.w[0].t,
  'stamp after a routed write: w[0].r = request id, w[0].u = email, w[0].n = name, t = w[0].t', st);

/* A handler that throws still clears the meta. */
H.eval("ROUTES.__live_boom = { requireAuth: true, handler: function () { throw new Error('boom'); } };");
H.call('apiRouter_', { action: '__live_boom', sessionToken: 'tok', payload: { data: { __request_id: 'rid-boom-0123456789' } } });
check(H.eval('_liveReqMeta_') === null, '_liveReqMeta_ is cleared after a failing request too');

/* ── 2. five writers kept, the sixth drops the oldest; one entry per request ── */
for (let i = 1; i <= 6; i++) {
  H.eval("_liveReqMeta_ = { rid: 'r" + i + "', who: 'u" + i + "@x', name: 'U" + i + "' };");
  H.call('noteTableChange_', 'db2', 'inv');
  if (i === 5) {
    const s5 = stampOf('db2', 'inv');
    check(s5.w.length === 5 && s5.w[0].r === 'r5' && s5.w[4].r === 'r1', 'five writes keep five entries, newest first', s5.w.map(x => x.r));
  }
}
st = stampOf('db2', 'inv');
check(st.w.length === 5 && st.w[0].r === 'r6' && st.w.map(x => x.r).indexOf('r1') === -1, 'a sixth write drops the oldest', st.w.map(x => x.r));
H.eval("_liveReqMeta_ = { rid: 'r6', who: 'u6@x', name: 'U6' };");
const tBefore = st.t;
H.call('noteTableChange_', 'db2', 'inv');
st = stampOf('db2', 'inv');
check(st.w.length === 5 && st.w.filter(x => x.r === 'r6').length === 1 && st.t > tBefore,
  'the same request writing again keeps ONE entry, and t still moves', { t: st.t, before: tBefore, rs: st.w.map(x => x.r) });
/* Same millisecond: t is strictly increasing anyway. */
const t0 = stampOf('db2', 'inv').t;
H.call('noteTableChange_', 'db2', 'inv');
check(stampOf('db2', 'inv').t === t0 + 1, 'two writes in one millisecond still give two different t');
H.eval('_liveReqMeta_ = null;');

/* ── 3. an old numeric stamp still parses ── */
const old = H.call('parseTableStamp_', '1759219200123');
check(old.t === 1759219200123 && Array.isArray(old.w) && old.w.length === 0, 'parseTableStamp_ reads an old bare number as {t, w:[]}', old);
check(H.call('parseTableStamp_', null).t === 0 && H.call('parseTableStamp_', '{bad').t === 0, 'missing or unreadable stamps read as t:0');
H.ctx.CacheService.getScriptCache().put('tv_db3_legacy', '1700000000000', 600);
H.call('noteTableChange_', 'db3', 'legacy');
st = stampOf('db3', 'legacy');
check(st.t > 1700000000000 && st.w.length === 1, 'a write over an old numeric stamp upgrades it to JSON', st);

/* ── 5. a write outside apiRouter_ is the system ── */
H.call('noteTableChange_', 'db4', 'jobs');
st = stampOf('db4', 'jobs');
check(st.w[0].u === 'system' && st.w[0].r === '', 'a trigger write (no request) stamps u:"system", r:""', st.w[0]);

/* A failing cache never fails the write. */
H.failNextPut(1);
let threw = false;
try { H.call('noteTableChange_', 'db4', 'jobs'); } catch (e) { threw = true; }
check(!threw, 'noteTableChange_ still never throws');

/* ── 4. get_page_versions through a real company dispatcher ── */
const TL = H.eval('TopLight');
const SU = { isSuperAdmin: true, email: 'su@x', company: '8df5c89a117fe9a5' };
H.override('getCompanySpreadsheetId_', function () { return 'tl-db'; });
H.eval("_liveReqMeta_ = { rid: 'rid-sales-save-000001', who: 'ahmed@x.com', name: 'أحمد' };");
H.call('noteTableChange_', 'tl-db', 'top_light_sales_invoices');
H.eval('_liveReqMeta_ = null;');
const pv = TL.dispatch_({ module_action: 'get_page_versions', data: { page: 'tl_sales' } }, SU, 'tl-db');
check(pv && pv.status === 'success' && pv.page === 'tl_sales', 'get_page_versions answers for tl_sales', pv && pv.message);
const views = pv.views || {};
check(Array.isArray(views.list) && views.list.indexOf('top_light_customer_vendor') !== -1 && views.list.indexOf('top_light_sales_returns') !== -1,
  'views.list names what the list shows (customers, returns)', views.list);
check(Array.isArray(views.form) && views.form.indexOf('top_light_current_products') !== -1, 'views.form names the live stock table', views.form);
const union = new Set(['top_light_sales_invoices', 'top_light_sales_products'].concat(views.list || [], views.form || []));
check(pv.tables.length === union.size && pv.tables.every(t => union.has(t)), 'tables = PAGE_TABLES ∪ every view table', pv.tables);
check(pv.labels && pv.labels.top_light_sales_invoices === 'المبيعات' && pv.labels.top_light_sales_returns === 'مرتجعات المبيعات',
  'labels name the tables in Arabic', pv.labels);
check(Object.keys(pv.versions).every(k => typeof pv.versions[k] === 'string'), 'versions keeps its shape: sheet -> raw stamp string');
check(pv.meta.top_light_sales_invoices.w[0].r === 'rid-sales-save-000001' && pv.meta.top_light_sales_invoices.w[0].n === 'أحمد',
  'meta carries the parsed writer list', pv.meta.top_light_sales_invoices);
check(/^\d+$/.test(pv.now), 'now is still the server clock as a string');

/* Access: a caller without read access is refused exactly as before. */
H.override('unifiedCheck_', function () { return false; });
const reader = { isSuperAdmin: false, email: 'r@x', company: '8df5c89a117fe9a5' };
let refused = null;
try { TL.dispatch_({ module_action: 'get_page_versions', data: { page: 'tl_sales' } }, reader, 'tl-db'); }
catch (e) { refused = e.message; }
const NOT_AUTH = H.eval('ERP_MESSAGES.NOT_AUTHORIZED');
check(refused === NOT_AUTH, 'a caller without read access to the page is refused with NOT_AUTHORIZED', refused);
H.override('unifiedCheck_', function () { return true; });
const allowed = TL.dispatch_({ module_action: 'get_page_versions', data: { page: 'tl_sales' } }, reader, 'tl-db');
check(allowed && allowed.status === 'success', 'the same caller with read access gets the reply');

/* A page with no PAGE_VIEWS entry: views null, today's tables. */
const noViews = TL.dispatch_({ module_action: 'get_page_versions', data: { page: 'tl_no_such_page' } }, SU, 'tl-db');
check(noViews.views === null && Array.isArray(noViews.tables) && noViews.tables.length === 0, 'a page without PAGE_VIEWS answers views:null and its PAGE_TABLES (here none)');

/* ── 6. missing stamps are seeded once, then stable ── */
const p1 = TL.dispatch_({ module_action: 'get_page_versions', data: { page: 'tl_products' } }, SU, 'tl-db');
const seeded = p1.meta.top_light_categories;
check(seeded && seeded.s === 1 && seeded.w.length === 0, 'a table with no stamp is seeded with s:1 and no writers', seeded);
const p2 = TL.dispatch_({ module_action: 'get_page_versions', data: { page: 'tl_products' } }, SU, 'tl-db');
check(p2.versions.top_light_categories === p1.versions.top_light_categories, 'the seeded stamp is stable across polls');
H.call('noteTableChange_', 'tl-db', 'top_light_categories');
const p3 = TL.dispatch_({ module_action: 'get_page_versions', data: { page: 'tl_products' } }, SU, 'tl-db');
check(p3.versions.top_light_categories !== p1.versions.top_light_categories && !p3.meta.top_light_categories.s,
  'a real write replaces the seed (t moves, s gone)', p3.meta.top_light_categories);

/* Every company answers through the shared body. */
[['TopChemical', 'TopChemical', '3fe1b5cb67b7223e'], ['ValleyFoods', 'ValleyFoods', '9940659bd83035d7'],
 ['Assessment', 'AssessmentCenter', '32fafd256ccb7a1c'], ['ErpTest', 'ErpTest', '37fc50edf1424abd']].forEach(([file, ns, uid]) => {
  const C = H.eval(ns);
  const src = fs.readFileSync(path.join(ROOT, 'Company_' + file + '_Actions.js'), 'utf8');
  const m = /const PAGE_VIEWS = \{\s*'([a-z0-9_]+)'/.exec(src);
  const page = m ? m[1] : null;
  let r = null, err = null;
  try { r = C.dispatch_({ module_action: 'get_page_versions', data: { page: page } }, Object.assign({}, SU, { company: uid }), 'tl-db'); } catch (e) { err = e.message; }
  check(r && r.status === 'success' && r.views && Object.keys(r.views).length > 0 && r.labels && Object.keys(r.labels).length > 0,
    file + ': get_page_versions(' + page + ') returns views and labels', err || (r && Object.keys(r)));
});

console.log(failed ? '\nlive_notice_server: FAIL (' + failed + ')' : '\nlive_notice_server: OK');
process.exit(failed ? 1 : 0);
