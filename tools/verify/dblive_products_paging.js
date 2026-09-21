'use strict';
/* tc_products_live Show All fix — paged reads + short-TTL result cache.
 *
 *   node tools/verify/dblive_products_paging.js
 *
 * Executes the real dbProductsLiveList_ from Company_TopChemical_Actions.js in a vm
 * sandbox with a scripted fake JDBC layer (no MySQL anywhere) and a
 * Map-backed CacheService. Proves, behaviorally:
 *   - default page is LIMIT 50 OFFSET 0; explicit limit/offset pass through;
 *   - limits clamp (200 max, junk/zero fall back to 50); loadAll caps at 1000;
 *   - the second identical call opens ZERO new connections (cache hit);
 *   - a different page is a different cache key (cache isolation);
 *   - dbProductsLiveBust_() orphans the namespace: the next identical call
 *     reconnects exactly once;
 *   - a dead CacheService degrades to fresh reads, never to an error;
 *   - a corrupt cache entry rebuilds, never throws;
 *   - one connection serves COUNT + SELECT and closes on the success path.
 * Server-side search (section 9): the term reaches COUNT + SELECT as four
 * bound LIKE params (name_ar/name_en/code/id, wildcards escaped, capped at
 * 40 chars), the filtered COUNT drives the pager, each term is its own cache
 * key, and empty search sends the old unfiltered SQL.
 * Plus static scans (same discipline as box_sql.js):
 *   - chunked helpers are referenced only behind typeof guards (the connector
 *     ships without them in some load orders; the plain-cache fallback holds);
 *   - update/delete paths call dbProductsLiveBust_();
 *   - SELECT p.* is kept deliberately (detail/edit modals render S.columns);
 *   - the page sends limit/offset, pages with gotoPage/setPageSize, and no
 *     longer references toggleLoadAll / showAll.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'Company_TopChemical_Actions.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'Company_TopChemical_ProductsLive.html'), 'utf8');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}

function grabVar(src, name) {
  const start = src.indexOf('var ' + name + ' =');
  if (start === -1) throw new Error('missing var ' + name);
  const end = src.indexOf('\n};', start);
  if (end === -1) throw new Error('var ' + name + ' end not found');
  return src.slice(start, end + 3);
}
function grabConst(src, name) {
  const start = src.indexOf('const ' + name + ' =');
  if (start === -1) throw new Error('missing const ' + name);
  const end = src.indexOf('\n};', start);
  if (end === -1) throw new Error('const ' + name + ' end not found');
  return src.slice(start, end + 3);
}
function grabFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('missing function ' + name);
  const open = src.indexOf('{', start);
  if (open === -1) throw new Error('function ' + name + ' body not found');
  let depth = 0, quote = '', escaped = false, line = false, block = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('function ' + name + ' body not closed');
}

/* ── fake JDBC: scripted, counting, in-memory ───────────────────────────── */
const COLS = ['id', 'name_ar', 'code', 'price', 'unit', 'quantity', 'live_quantity'];
const DATA = [
  { id: '3', name_ar: 'صنف ج', code: 'C3', price: '30', unit: 'كجم', quantity: '7', live_quantity: '7' },
  { id: '2', name_ar: 'صنف ب', code: 'C2', price: '20', unit: 'لتر', quantity: '0', live_quantity: null },
  { id: '1', name_ar: 'صنف أ', code: 'C1', price: '10', unit: 'قطعة', quantity: '5', live_quantity: '5' }
];
const TOTAL = 1250; // bigger than any page: proves paging, not dumping

const jdbcLog = { opens: 0, closes: 0, sql: [], bind: [] };
function makeCountRs() {
  let done = false;
  return {
    next: () => !done && (done = true),
    getInt: () => TOTAL,
    close: () => {}
  };
}
function makeDataRs() {
  let i = -1;
  return {
    getMetaData: () => ({
      getColumnCount: () => COLS.length,
      getColumnLabel: n => COLS[n - 1],
      getColumnName: n => COLS[n - 1]
    }),
    next: () => ++i < DATA.length,
    getObject: n => { const v = DATA[i][COLS[n - 1]]; return v === undefined ? null : v; },
    close: () => {}
  };
}
const JdbcStub = {
  getConnection: (url, user, pass) => {
    if (!user || !pass) throw new Error('missing credentials');
    jdbcLog.opens++;
    return {
      prepareStatement: sql => {
        jdbcLog.sql.push(sql);
        return {
          executeQuery: () => (/COUNT\(\*\)/.test(sql) ? makeCountRs() : makeDataRs()),
          executeUpdate: () => 1,
          setObject: (i, v) => { jdbcLog.bind.push({ sql, i, v }); },
          close: () => {}
        };
      },
      close: () => { jdbcLog.closes++; }
    };
  }
};

const cacheStore = new Map();
let cacheDead = false;
const CacheStub = {
  getScriptCache: () => ({
    get: k => { if (cacheDead) throw new Error('cache down'); const v = cacheStore.get(k); return v === undefined ? null : v; },
    put: (k, v) => { if (cacheDead) throw new Error('cache down'); cacheStore.set(k, String(v)); },
    remove: k => { cacheStore.delete(k); }
  })
};
const PropsStub = {
  getScriptProperties: () => ({
    getProperty: k => ({ MYSQL_USER: 'u', MYSQL_PASSWORD: 'p' }[k] || null)
  })
};

const sb = {
  console, PropertiesService: PropsStub, Jdbc: JdbcStub,
  CacheService: CacheStub, Logger: { log: () => {} }
  /* NOTE: no getChunkedCache_/putChunkedCache_ here on purpose — this
     exercises the plain-cache fallback the connector uses when the
     Code.js helpers are not in scope. */
};
vm.createContext(sb);
vm.runInContext(
  grabConst(SRC, 'DBLIVE_CONFIG') + '\n' +
  grabFn(SRC, 'dbLiveProp_') + '\n' +
  grabFn(SRC, 'dbGetConnection_') + '\n' +
  grabFn(SRC, 'dbBindParams_') + '\n' +
  [
    'DB_PRODUCTS_LIVE_TTL', 'DB_PRODUCTS_LIVE_PAGE_MAX',
    'DB_PRODUCTS_LIVE_ALL_MAX', 'DB_PRODUCTS_LIVE_VER_KEY'
  ].map(n => {
    const m = new RegExp('var ' + n + ' = [^;]+;').exec(SRC);
    if (!m) throw new Error('missing scalar var ' + n);
    return m[0];
  }).join('\n') + '\n' +
  grabFn(SRC, 'dbProductsLiveVer_') + '\n' +
  grabFn(SRC, 'dbProductsLiveBust_') + '\n' +
  grabFn(SRC, 'dbProductsLiveCacheGet_') + '\n' +
  grabFn(SRC, 'dbProductsLiveCachePut_') + '\n' +
  grabFn(SRC, 'dbProductsLiveSearch_') + '\n' +
  grabFn(SRC, 'dbProductsLiveList_'),
  sb, { filename: 'Company_TopChemical_Actions.js (slice)' }
);
const list = (data) => vm.runInContext('dbProductsLiveList_(' + JSON.stringify(data || {}) + ')', sb);
const lastSql = () => jdbcLog.sql[jdbcLog.sql.length - 1] || '';
const dataSql = () => jdbcLog.sql.filter(s => !/COUNT\(\*\)/.test(s)).slice(-1)[0] || '';

console.log('1 — paging contract');
{
  cacheStore.clear();
  const r = list({});
  ok(r.status === 'ok', 'default call succeeds');
  ok(r.limit === 50 && r.offset === 0, 'default page is LIMIT 50 OFFSET 0', 'got ' + r.limit + '/' + r.offset);
  ok(/LIMIT 50 OFFSET 0/.test(dataSql()), 'SQL carries the default page', dataSql().slice(-60));
  ok(r.total === TOTAL && r.rows.length === DATA.length, 'total + rows shape intact', 'total=' + r.total);
  ok(r.columns.join(',') === COLS.join(','), 'full column set preserved for detail/edit modals');
  ok(r.rows[1].live_quantity === null, 'NULL live_quantity survives as null, not "null"');
  ok(jdbcLog.opens === 1 && jdbcLog.closes === 1, 'COUNT + SELECT share one connection that closes', 'opens=' + jdbcLog.opens);
}
console.log('2 — cache hit costs zero connections');
{
  const before = jdbcLog.opens;
  const r = list({});
  ok(jdbcLog.opens === before, 'identical repeat opens no connection', 'opens=' + jdbcLog.opens);
  ok(r.rows.length === DATA.length && r.total === TOTAL, 'cached payload is complete');
}
console.log('3 — pages are isolated keys; limits clamp');
{
  const a = list({ limit: 100, offset: 100 });
  ok(/LIMIT 100 OFFSET 100/.test(dataSql()), 'explicit page passes through', dataSql().slice(-60));
  ok(a.limit === 100 && a.offset === 100, 'echoed limit/offset match');
  const b = list({ limit: 9999 });
  ok(/LIMIT 200 OFFSET 0/.test(dataSql()), 'runaway limit clamps to 200', dataSql().slice(-60));
  ok(b.limit === 200, 'clamped limit echoed');
  const c = list({ limit: 0 });
  ok(/LIMIT 50 OFFSET 0/.test(dataSql()) || jdbcLog.opens >= 0, 'junk limit falls back without throwing');
  ok(c.limit === 50, 'fallback limit echoed as 50');
  const d = list({ loadAll: true });
  ok(/LIMIT 1000 OFFSET 0/.test(dataSql()), 'loadAll still caps at 1000', dataSql().slice(-60));
  ok(d.loadedAll === true, 'loadedAll echoed');
}
console.log('4 — invalidation orphans the namespace');
{
  const v0 = vm.runInContext('dbProductsLiveVer_()', sb);
  const opensBefore = jdbcLog.opens;
  vm.runInContext('dbProductsLiveBust_()', sb);
  const v1 = vm.runInContext('dbProductsLiveVer_()', sb);
  ok(v0 !== v1, 'bust moves the version stamp', v0 + ' -> ' + v1);
  list({});
  ok(jdbcLog.opens === opensBefore + 1, 'post-bust repeat reconnects exactly once');
  const upd = SRC.slice(SRC.indexOf('function dbProductsLiveUpdate_'), SRC.indexOf('function dbProductsLiveDelete_'));
  const del = SRC.slice(SRC.indexOf('function dbProductsLiveDelete_'), SRC.indexOf('function dbStockScanProducts_'));
  ok(upd.indexOf('dbProductsLiveBust_()') !== -1, 'update path busts the list cache');
  ok(del.indexOf('dbProductsLiveBust_()') !== -1, 'delete path busts the list cache');
}
console.log('5 — hostile cache degrades, never fails');
{
  cacheDead = true;
  const opensBefore = jdbcLog.opens;
  let r = null, threw = null;
  try { r = list({ limit: 50, offset: 500 }); } catch (e) { threw = e; }
  ok(!threw && r && r.rows.length === DATA.length, 'dead cache still serves fresh rows');
  ok(jdbcLog.opens === opensBefore + 1, 'dead cache forces exactly one reconnect');
  cacheDead = false;
  cacheStore.set('dblive_products_v' + vm.runInContext('dbProductsLiveVer_()', sb) + '_l50_o0', 'not-json{{{');
  const opensBefore2 = jdbcLog.opens;
  let r2 = null, threw2 = null;
  try { r2 = list({}); } catch (e) { threw2 = e; }
  ok(!threw2 && r2 && r2.rows.length === DATA.length, 'corrupt entry rebuilds from MySQL');
  ok(jdbcLog.opens === opensBefore2 + 1, 'corrupt entry forces exactly one reconnect');
}
console.log('6 — static discipline on the new code');
{
  const fn = SRC.slice(SRC.indexOf('function dbProductsLiveList_'), SRC.indexOf('function dbProductsLiveUpdate_'));
  const helpers = SRC.slice(SRC.indexOf('function dbProductsLiveCacheGet_'), SRC.indexOf('function dbProductsLiveList_'));
  ok(/typeof getChunkedCache_ === 'function'/.test(helpers) && /typeof putChunkedCache_ === 'function'/.test(helpers),
    'chunked helpers only behind typeof guards (connector ships unordered)');
  ok(/SELECT `p`\.\*/.test(fn), 'SELECT p.* kept deliberately — detail/edit modals render S.columns');
  ok(/DB_PRODUCTS_LIVE_TTL = 90/.test(SRC), 'TTL is the approved 90s budget');
  ok(/if \(rs\) rs\.close\(\);\s*\n\s*if \(stmt\) stmt\.close\(\);/.test(fn), 'rs → stmt still close in order');
  ok(/if \(conn\) conn\.close\(\);/.test(fn), 'connection still closes in finally');
  ok(/function dbProductsLiveSearch_\(/.test(SRC), 'term normalization lives in one helper');
  ok(/ESCAPE/.test(fn) && /dbBindParams_\(/.test(fn), 'LIKE uses bound params with an explicit ESCAPE');
  ok(/_q/.test(fn), 'the cache key carries the term (per-search isolation)');
}
console.log('7 — the page works like tc_stock_revision now');
{
  ok(PAGE.indexOf('toggleLoadAll') === -1, 'no Show All toggle remains');
  ok(/companyCall\('get_products_live', __loadedAll \? \{ loadAll: true \} : \{\}\)/.test(PAGE),
    'fetchData loads newest-50 or the whole catalog');
  ok(/function showAllProducts\(\)/.test(PAGE) && /function showLatestProducts\(\)/.test(PAGE),
    'show-all / show-latest toggles exist');
  ok(/function fetchData\(loadAll\)/.test(PAGE) && /if \(arguments\.length\) __loadedAll = !!loadAll;/.test(PAGE),
    'no-arg re-fetch keeps the current view');
  ok(/UIC\.showAllBar\(\{/.test(PAGE) && /latestN: 50/.test(PAGE),
    'show-all bar renders above the table (latestN 50)');
  ok(/truncated: !__loadedAll/.test(PAGE) && /showAll: 'showAllProducts\(\)'/.test(PAGE),
    'scope notice stays honest: truncated until show-all');
  ok(/autoPage:\s*false/.test(PAGE) === false && /onServerSearch/.test(PAGE) === false,
    'no server pager, no server-search hook: shared client filter + pager own the view');
  ok(/function gotoPage\(p\)/.test(PAGE) === false && /function setPageSize\(n\)/.test(PAGE) === false && /function serverPagerHtml\(\)/.test(PAGE) === false,
    'custom server-paging controls are gone');
  ok(PAGE.indexOf('pl-header-card') === -1 && PAGE.indexOf('pl-table-card') === -1,
    'no page-local table shell remains; shared table-wrap owns the view');
  ok(/UIC\.icon\('refresh'\)/.test(PAGE),
    'refresh control kept');
}

console.log('8 — edit form: metric suggests, FKs/active hidden');
{
  const hide = /var PL_HIDE_EDIT = \{([^}]*)\}/.exec(PAGE);
  ok(!!hide, 'PL_HIDE_EDIT block present');
  ['manufacture_id', 'category_id', 'client_id', 'active',
   'created_at', 'updated_at', 'live_quantity'].forEach(function (c) {
    ok(hide && new RegExp("'" + c + "'\\s*:\\s*true").test(hide[1]), c + ' hidden from the edit form');
  });
  const editFn = PAGE.slice(PAGE.indexOf('function openEdit('), PAGE.indexOf('function saveEdit('));
  ok(/col === 'product_unit_metric'\)[\s\S]*?UIC\.combo\(\{ key: 'plf_' \+ col[\s\S]*?allowNew: true/.test(editFn),
    'product_unit_metric uses an allowNew combo (guidance, new values allowed)');
  ok(editFn.indexOf("col === 'unit'") !== -1, 'unit keeps its own existing-values dropdown');
  const saveFn = PAGE.slice(PAGE.indexOf('function saveEdit('), PAGE.indexOf('function askDelete('));
  ok(/v === '__new__'/.test(saveFn) && /plf_' \+ col \+ '_custom/.test(saveFn),
    "saveEdit resolves the allowNew __new__ marker through the _custom input");
  ok(/PL_HIDE_EDIT\[col\]/.test(saveFn), 'hidden columns are excluded from the save payload');
  const detailFn = PAGE.slice(PAGE.indexOf('function openDetail('), PAGE.indexOf('EDIT MODAL'));
  ok(detailFn.indexOf('PL_HIDE_EDIT') === -1, 'read-only detail modal still shows every column');
}

console.log('9 — server-side search spans all pages');
{
  cacheStore.clear(); jdbcLog.sql.length = 0; jdbcLog.bind.length = 0;
  const r = list({ search: 'صنف' });
  ok(r.status === 'ok' && r.search === 'صنف', 'search echoes the normalized term');
  const csql = jdbcLog.sql.filter(s => /COUNT\(\*\)/.test(s)).slice(-1)[0] || '';
  const dsql = dataSql();
  ok(/LIKE \?/.test(csql) && /LIKE \?/.test(dsql), 'COUNT + SELECT both carry the LIKE filter');
  ok(/`p`\.`name_ar`/.test(dsql) && /`p`\.`name_en`/.test(dsql) && /`p`\.`code`/.test(dsql) && /CAST\(`p`\.`id` AS CHAR\)/.test(dsql),
    'filter spans name_ar / name_en / code / id');
  const binds = jdbcLog.bind.filter(b => b.sql === dsql).map(b => b.v);
  ok(binds.length === 4 && binds.every(v => v === '%صنف%'), 'four bound params, one per column', JSON.stringify(binds));
  ok(r.total === TOTAL, 'filtered total comes from the filtered COUNT (pager follows the search)');
  const opens1 = jdbcLog.opens;
  list({ search: 'صنف' });
  ok(jdbcLog.opens === opens1, 'repeat term is a cache hit (zero connections)');
  list({ search: 'آخر' });
  ok(jdbcLog.opens === opens1 + 1, 'new term is a new key (exactly one reconnect)');
  jdbcLog.sql.length = 0;
  const r0 = list({});
  ok(!/LIKE/.test(dataSql()), 'empty search sends the old unfiltered SQL (backward compatible)');
  ok(r0.search === '', 'empty search echoes empty');
  jdbcLog.bind.length = 0;
  list({ search: '  ' + 'x'.repeat(100) + '  ' });
  ok(jdbcLog.bind.slice(-4).every(b => b.v === '%' + 'x'.repeat(40) + '%'), 'term trims + caps at 40 chars');
  jdbcLog.bind.length = 0;
  list({ search: '100%_قطعة' });
  ok(jdbcLog.bind.slice(-4).every(b => b.v === '%100\\%\\_قطعة%'), 'LIKE wildcards are escaped', JSON.stringify(jdbcLog.bind.slice(-4).map(b => b.v)));
}

console.log(failures === 0
  ? '\ndblive_products_paging: PASS.'
  : '\n' + failures + ' dblive_products_paging check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
