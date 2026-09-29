'use strict';
/* tc_exec_sales timeouts — permanent fix: cache the split endpoints.
 *
 *   node tools/verify/dblive_sales_cache.js
 *
 * Executes the real dbTcSalesViewList_ / dbTcSalesCharts_ from
 * Company_TopChemical_Actions.js in a vm sandbox with a scripted fake JDBC layer (no
 * MySQL anywhere) and a Map-backed CacheService. Proves, behaviorally:
 *   view list:
 *   - default page is LIMIT 50 OFFSET 0 over the sales view; repeat costs
 *     zero connections; other pages are isolated keys; refresh:true rebuilds;
 *   charts (the timeout source — three full-view GROUP BYs):
 *   - first call opens ONE connection serving all aggregations; repeat costs
 *     zero; other years/search are isolated keys; refresh:true rebuilds;
 *   both:
 *   - dead CacheService degrades to fresh reads (exactly one reconnect);
 *   - corrupt entries rebuild, never throw;
 *   - connections close on the success path.
 * Plus static scans: TTL budgets (600 charts / 90 view), key scope
 * (years+search[+limit+offset]), typeof-guarded chunked helpers, refresh
 * honored by both endpoints, close discipline intact.
 * Section 6 covers the overhauled page's date_sales_product_qty_value
 * monthly endpoint: buckets, EGP math, range/product binding, key scope,
 * refresh, close discipline, product dropdown list, and range validation.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'Company_TopChemical_Actions.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(ROOT, 'Company_TopChemical_ExecSales.html'), 'utf8');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}

function grabConst(src, name) {
  const start = src.indexOf('const ' + name + ' =');
  if (start === -1) throw new Error('missing const ' + name);
  const end = src.indexOf('\n};', start);
  if (end === -1) throw new Error('const ' + name + ' end not found');
  return src.slice(start, end + 3);
}
function grabArr(src, name) {
  const m = new RegExp('var ' + name + ' = \\[[\\s\\S]*?\\];').exec(src);
  if (!m) throw new Error('missing array var ' + name);
  return m[0];
}
function grabScalar(src, name) {
  const m = new RegExp('var ' + name + ' = [^;]+;').exec(src);
  if (!m) throw new Error('missing scalar var ' + name);
  return m[0];
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

/* ── fake JDBC: scripted by statement shape, counting ───────────────────── */
const VCOLS = ['sales_year', 'sales_month', 'product_id', 'name_ar', 'total_qty',
  'return_qty', 'net_qty', 'total_value', 'return_value', 'net_value',
  'currency', 'currency_ratio', 'product_unit_metric'];
const VROWS = [
  { sales_year: '2026', sales_month: '9', product_id: '7', name_ar: 'صنف أ', total_qty: '10', return_qty: '1', net_qty: '9', total_value: '100', return_value: '10', net_value: '90', currency: 'EGP', currency_ratio: '1', product_unit_metric: '1' },
  { sales_year: '2026', sales_month: '9', product_id: '8', name_ar: 'صنف ب', total_qty: '20', return_qty: '0', net_qty: '20', total_value: '200', return_value: '0', net_value: '200', currency: 'EGP', currency_ratio: '1', product_unit_metric: '2' },
  { sales_year: '2026', sales_month: '8', product_id: '7', name_ar: 'صنف أ', total_qty: '5', return_qty: '0', net_qty: '5', total_value: '50', return_value: '0', net_value: '50', currency: 'USD', currency_ratio: '48', product_unit_metric: '1' },
  { sales_year: '2025', sales_month: '12', product_id: '9', name_ar: 'صنف ج', total_qty: '3', return_qty: '0', net_qty: '3', total_value: '30', return_value: '0', net_value: '30', currency: 'EGP', currency_ratio: '1', product_unit_metric: '1' }
];
const VTOTAL = 4;
const MONTHLY = [
  [2026, 9, 290, 29],
  [2026, 8, 2400, 5]
];
const TOPRODS = [
  ['7', 'صنف أ', 14, 2490, '1'],
  ['8', 'صنف ب', 20, 200, '2']
];
const YEARLY = [
  ['7', 2026, 14, 2490],
  ['8', 2026, 20, 200]
];
const DMONTHLY = [
  ['2026-08', 2400, 5, 2.5],
  ['2026-09', 290, 29, 14.5]
];
const DPRODS = [
  ['7', 'صنف أ'],
  ['8', 'صنف ب']
];
const BMONTHLY = [
  ['2026-08', 5000, 3000, 2000, 12],
  ['2026-09', 7000, 7500, -500, 15]
];
const BACCOUNTS = [
  ['310001'],
  ['310002']
];

const jdbcLog = { opens: 0, closes: 0, sql: [], bound: [] };
function listRs(cols, rows) {
  let i = -1;
  return {
    getMetaData: () => ({
      getColumnCount: () => cols.length,
      getColumnLabel: n => cols[n - 1],
      getColumnName: n => cols[n - 1]
    }),
    next: () => ++i < rows.length,
    getObject: n => { const v = rows[i][n - 1]; return v === undefined ? null : v; },
    getInt: () => Number(rows[i][0]),
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
          setObject: (i, v) => { jdbcLog.bound.push(v); },
          executeQuery: () => {
            if (/FROM box_movement_daily_revise/.test(sql) && /GROUP BY ym/.test(sql)) return listRs(['ym', 'income', 'outcome', 'net', 'moves'], BMONTHLY);
            if (/FROM box_movement_daily_revise/.test(sql)) return listRs(['code'], BACCOUNTS);
            if (/FROM date_sales_product_qty_value/.test(sql) && /GROUP BY ym/.test(sql)) return listRs(['ym', 'egp', 'q', 'm'], DMONTHLY);
            if (/COUNT\(\*\)/.test(sql)) return listRs(['cnt'], [[VTOTAL]]);
            if (/FROM date_sales_product_qty_value/.test(sql)) return listRs(['p', 'n'], DPRODS);
            if (/GROUP BY v\.sales_year, v\.sales_month/.test(sql)) return listRs(['y', 'm', 'egp', 'q'], MONTHLY);
            if (/GROUP BY v\.product_id, v\.sales_year/.test(sql)) return listRs(['p', 'y', 'q', 'egp'], YEARLY);
            if (/GROUP BY v\.product_id/.test(sql)) return listRs(['p', 'n', 'q', 'egp', 'div'], TOPRODS);
            return listRs(VCOLS, VROWS.map(r => VCOLS.map(c => r[c])));
          },
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
  /* No chunked helpers on purpose — exercises the plain-cache fallback. */
};
vm.createContext(sb);
vm.runInContext(
  grabConst(SRC, 'DBLIVE_CONFIG') + '\n' +
  grabFn(SRC, 'dbLiveProp_') + '\n' +
  grabFn(SRC, 'dbGetConnection_') + '\n' +
  grabFn(SRC, 'dbBindParams_') + '\n' +
  grabArr(SRC, 'DB_TC_SALES_VIEW_COLUMNS') + '\n' +
  ['DB_TC_SALES_CHARTS_TTL', 'DB_TC_SALES_VIEW_TTL', 'DB_TC_SALES_VER_KEY']
    .map(n => grabScalar(SRC, n)).join('\n') + '\n' +
  grabFn(SRC, 'dbTcSalesVer_') + '\n' +
  grabFn(SRC, 'dbTcSalesCacheGet_') + '\n' +
  grabFn(SRC, 'dbTcSalesCachePut_') + '\n' +
  grabFn(SRC, 'dbTcSalesCacheKey_') + '\n' +
  grabFn(SRC, 'dbTcExecSalesValidateYears_') + '\n' +
  grabFn(SRC, 'dbTcSalesViewWhere_') + '\n' +
  grabFn(SRC, 'dbTcSalesViewList_') + '\n' +
  grabFn(SRC, 'dbTcSalesCharts_') + '\n' +
  grabScalar(SRC, 'DB_TC_DATE_SALES_TTL') + '\n' +
  /* The multi-select comparison added DB_TC_MAX_FILTER_KEYS + the two key/bound
     normalizers. The slice has to carry its dependencies or it would be running
     a different program than the one that ships. */
  grabScalar(SRC, 'DB_TC_MAX_FILTER_KEYS') + '\n' +
  grabFn(SRC, 'dbTcKeyList_') + '\n' +
  grabFn(SRC, 'dbTcAcctBound_') + '\n' +
  grabFn(SRC, 'dbTcDateSalesParams_') + '\n' +
  grabFn(SRC, 'dbTcDateSalesMonthly_') + '\n' +
  grabFn(SRC, 'dbTcDateSalesProducts_') + '\n' +
  grabScalar(SRC, 'DB_TC_BOX_DAILY_TTL') + '\n' +
  grabScalar(SRC, 'DB_TC_BOX_ACCOUNTS_TTL') + '\n' +
  grabFn(SRC, 'dbBoxDailyParams_') + '\n' +
  grabFn(SRC, 'dbBoxDailyMonthly_') + '\n' +
  grabFn(SRC, 'dbBoxDailyAccounts_'),
  sb, { filename: 'Company_TopChemical_Actions.js (slice)' }
);
console.log('1 — view list: paged, cached, isolated');
{
  cacheStore.clear();
  const r = vm.runInContext('dbTcSalesViewList_({years:[2026]})', sb);
  ok(r.status === 'ok', 'default view call succeeds');
  ok(r.limit === 50 && r.offset === 0, 'default page is LIMIT 50 OFFSET 0');
  ok(r.rows.length === VROWS.length && r.total === VTOTAL, 'rows + total shape intact');
  ok(jdbcLog.opens === 1 && jdbcLog.closes === 1, 'COUNT + SELECT share one closing connection', 'opens=' + jdbcLog.opens);
  const before = jdbcLog.opens;
  const r2 = vm.runInContext('dbTcSalesViewList_({years:[2026]})', sb);
  ok(jdbcLog.opens === before, 'identical repeat costs zero connections');
  ok(r2.total === VTOTAL, 'cached total served');
  vm.runInContext('dbTcSalesViewList_({years:[2026], limit:50, offset:50})', sb);
  ok(jdbcLog.opens === before + 1, 'another page is another key: exactly one reconnect');
  const sqls = jdbcLog.sql.join('\n');
  ok(/LIMIT 50 OFFSET 50/.test(sqls), 'offset passes through to SQL');
}
console.log('2 — charts: one connection, then free');
{
  const before = jdbcLog.opens;
  const c = vm.runInContext('dbTcSalesCharts_({years:[2026]})', sb);
  ok(c.status === 'ok', 'charts call succeeds');
  ok(c.monthly.length === MONTHLY.length && c.products.length === TOPRODS.length, 'both aggregations returned');
  ok(Array.isArray(c.products_yearly) && c.products_yearly.length === YEARLY.length, 'per-year matrix returned');
  ok(c.products_yearly[0].product_id === '7' && c.products_yearly[0].year === 2026 && c.products_yearly[0].net_value_egp === 2490, 'per-year row shape intact');
  ok(jdbcLog.opens === before + 1, 'all three GROUP BYs share a single connection');
  ok(jdbcLog.closes === jdbcLog.opens, 'every opened connection closed');
  const before2 = jdbcLog.opens;
  const c2 = vm.runInContext('dbTcSalesCharts_({years:[2026]})', sb);
  ok(jdbcLog.opens === before2, 'identical repeat costs zero connections');
  ok(c2.monthly[0].net_value_egp === MONTHLY[0][2], 'cached aggregates intact');
  ok(Array.isArray(c2.products_yearly) && c2.products_yearly.length === YEARLY.length, 'cached yearly matrix intact');
  vm.runInContext('dbTcSalesCharts_({years:[2025]})', sb);
  ok(jdbcLog.opens === before2 + 1, 'other years are another key: exactly one reconnect');
  vm.runInContext('dbTcSalesCharts_({years:[2026], search:"صنف"})', sb);
  ok(jdbcLog.opens === before2 + 2, 'search term splits the key too');
}
console.log('3 — refresh forces rebuild on both endpoints');
{
  const b0 = jdbcLog.opens;
  vm.runInContext('dbTcSalesViewList_({years:[2026], refresh:true})', sb);
  ok(jdbcLog.opens === b0 + 1, 'view refresh:true reconnects');
  const b1 = jdbcLog.opens;
  vm.runInContext('dbTcSalesViewList_({years:[2026]})', sb);
  ok(jdbcLog.opens === b1, 'refresh rewrote the entry the next read hits');
  const b2 = jdbcLog.opens;
  vm.runInContext('dbTcSalesCharts_({years:[2026], refresh:true})', sb);
  ok(jdbcLog.opens === b2 + 1, 'charts refresh:true reconnects');
}
console.log('4 — hostile cache degrades, never fails');
{
  cacheDead = true;
  const b0 = jdbcLog.opens;
  let v = null, c = null, t1 = null, t2 = null;
  try { v = vm.runInContext('dbTcSalesViewList_({years:[2026]})', sb); } catch (e) { t1 = e; }
  try { c = vm.runInContext('dbTcSalesCharts_({years:[2026]})', sb); } catch (e) { t2 = e; }
  ok(!t1 && v && v.rows.length === VROWS.length, 'dead cache: view still serves fresh rows');
  ok(!t2 && c && c.products.length === TOPRODS.length, 'dead cache: charts still serve fresh aggregates');
  ok(jdbcLog.opens === b0 + 2, 'dead cache forces exactly one reconnect per endpoint');
  cacheDead = false;
  const ver = vm.runInContext('dbTcSalesVer_()', sb);
  cacheStore.set('dblive_sales_view_v' + ver + '_y2026_q_l50_o0', 'not-json{{{');
  cacheStore.set('dblive_sales_charts_v' + ver + '_y2026_q', 'not-json{{{');
  const b1 = jdbcLog.opens;
  let v2 = null, c2 = null, u1 = null, u2 = null;
  try { v2 = vm.runInContext('dbTcSalesViewList_({years:[2026]})', sb); } catch (e) { u1 = e; }
  try { c2 = vm.runInContext('dbTcSalesCharts_({years:[2026]})', sb); } catch (e) { u2 = e; }
  ok(!u1 && v2 && v2.rows.length === VROWS.length, 'corrupt view entry rebuilds');
  ok(!u2 && c2 && c2.monthly.length === MONTHLY.length, 'corrupt charts entry rebuilds');
  ok(jdbcLog.opens === b1 + 2, 'corrupt entries force exactly one reconnect each');
}
console.log('5 — static discipline');
{
  ok(/var DB_TC_SALES_CHARTS_TTL = 600/.test(SRC), 'charts TTL is the approved 600s');
  ok(/var DB_TC_SALES_VIEW_TTL = 90/.test(SRC), 'view TTL is the approved 90s');
  const helpers = SRC.slice(SRC.indexOf('function dbTcSalesCacheGet_'), SRC.indexOf('function dbTcSalesViewWhere_'));
  ok(/typeof getChunkedCache_ === 'function'/.test(helpers) && /typeof putChunkedCache_ === 'function'/.test(helpers),
    'chunked helpers only behind typeof guards');
  const viewFn = SRC.slice(SRC.indexOf('function dbTcSalesViewList_'), SRC.indexOf('function dbTcSalesCharts_'));
  const chartsFn = SRC.slice(SRC.indexOf('function dbTcSalesCharts_'), SRC.indexOf('var DB_TC_DATE_SALES_TTL'));
  ok((viewFn.match(/if \(!data\.refresh\)/g) || []).length === 1, 'view honors refresh bypass');
  ok((chartsFn.match(/if \(!data\.refresh\)/g) || []).length === 1, 'charts honor refresh bypass');
  ok(/_y' \+ \(where\.years \|\| \[\]\)\.join\('-'\)/.test(SRC), 'keys scope on years');
  ok(/_l' \+ limit \+ '_o' \+ offset/.test(viewFn), 'view keys scope on page');
  ok(/if \(conn\) conn\.close\(\);/.test(viewFn) && /if \(conn\) conn\.close\(\);/.test(chartsFn),
    'both endpoints still close the connection in finally');
  ok(PAGE.indexOf('get_date_sales_monthly') !== -1 && PAGE.indexOf('get_sales_charts') === -1 && PAGE.indexOf('get_sales_view') === -1,
    'page is monthly-chart-only (new view endpoint, no legacy calls)');
  ok(PAGE.indexOf('<table') === -1 || PAGE.indexOf('modal-table') !== -1,
    'tables only inside detail modals (modal-table), no legacy inline tables');
  ok(PAGE.indexOf('buildTopTable') === -1 && PAGE.indexOf('drawTop10') === -1,
    'no legacy top-10 table builders remain on the page');
  ok(PAGE.indexOf('exec-from') !== -1 && PAGE.indexOf('exec-to') !== -1 && PAGE.indexOf('exec-product') !== -1,
    'date-range + product-dropdown filters present');
  ok(/function setMetric\(m\)/.test(PAGE) && /field: 'net_value_egp'/.test(PAGE) && /field: 'net_qty'/.test(PAGE) && /field: 'sales_metric_qty'/.test(PAGE),
    'three metric switch buttons present (value/qty/metric)');
  ok(PAGE.indexOf('exec-compare') !== -1 && PAGE.indexOf('مقارنة بالفترة السابقة') !== -1,
    'comparison toggle present in the filter bar');
  ok(/function prevRange\(from, to\)/.test(PAGE) && /payload\.previous = \{ from: prev\.from, to: prev\.to \}/.test(PAGE),
    'previous equal-length period is derived client-side and included with its report request');
  ok(/الفترة السابقة/.test(PAGE) && /borderDash/.test(PAGE),
    'dashed previous-period dataset with legend');
  ok(/function fmtPct/.test(PAGE) && PAGE.indexOf('التغير') !== -1,
    'totals + % change summary rendered');
  ok(PAGE.indexOf('get_box_daily_monthly') !== -1 && PAGE.indexOf('get_box_daily_accounts') !== -1,
    'box daily monthly + accounts endpoints called');
  ok(PAGE.indexOf('exec-box-acct') !== -1 && PAGE.indexOf('chart-box-monthly') !== -1,
    'box account filter (chart_of_accounts) + second chart canvas present');
  ok(PAGE.indexOf('chart-spacer') !== -1 && /height: 48px/.test(PAGE),
    'generous spacing between the sales chart and the box chart');
  ok(/function setBoxMetric\(m\)/.test(PAGE) && /field: 'net'/.test(PAGE) && /field: 'income'/.test(PAGE) && /field: 'outcome'/.test(PAGE),
    'box metric switch present (net/income/outcome)');
  ok(/function fmtAcct/.test(PAGE) && PAGE.indexOf('(دخل') !== -1,
    'accounting negatives-between-parentheses formatter present');
  ok(PAGE.indexOf('openSalesModal') !== -1 && PAGE.indexOf('openBoxModal') !== -1,
    'detail modals for both charts present');
  ok(/function downloadCsv/.test(PAGE) && /function printTable/.test(PAGE) && PAGE.indexOf('تحميل CSV') !== -1 && PAGE.indexOf('طباعة') !== -1,
    'CSV download + print actions present in modals');
  ok(/'get_box_daily_monthly':\s*\{[^}]*page:\s*'tc_exec_sales'/.test(SRC) && /'get_box_daily_accounts':\s*\{[^}]*page:\s*'tc_exec_sales'/.test(SRC),
    'new actions fail-closed to tc_exec_sales in PAGE_ACCESS');
  ok(/'get_box_daily_monthly':\s*'mysql:box_movement_daily_revise'/.test(SRC) && /'get_box_daily_accounts':\s*'mysql:box_movement_daily_revise'/.test(SRC),
    'new actions mapped to mysql:box_movement_daily_revise in ACTION_TABLES');
}
console.log('6 — date_sales monthly endpoint (new view)');
{
  const P = { from: '2026-08-01', to: '2026-09-30', product_id: '' };
  cacheStore.clear();
  const r = vm.runInContext('dbTcDateSalesMonthly_(' + JSON.stringify(P) + ')', sb);
  ok(r.status === 'ok', 'monthly call succeeds');
  ok(r.rows.length === DMONTHLY.length && r.rows[0].ym === '2026-08' && r.rows[1].net_value_egp === 290, 'monthly buckets + EGP shape intact');
  ok(r.rows[1].net_qty === 29 && r.rows[1].sales_metric_qty === 14.5, 'qty + metric qty carried per bucket');
  ok(r.from === P.from && r.to === P.to && r.product_id === '', 'range echo intact');
  const sqls = jdbcLog.sql.join('\n');
  ok(/DATE_FORMAT\(v\.sales_date, '%Y-%m'\)/.test(sqls) && /GROUP BY ym ORDER BY ym/.test(sqls), 'single monthly GROUP BY, no COUNT needed');
  ok(/v\.sales_date >= \?/.test(sqls) && /v\.sales_date <= \?/.test(sqls), 'range is bound, not interpolated');
  ok(/COALESCE\(NULLIF\(CAST\(v\.currency_ratio/.test(sqls), 'EGP conversion mirrors the old chart math');
  ok(jdbcLog.bound.indexOf('2026-08-01') !== -1 && jdbcLog.bound.indexOf('2026-09-30') !== -1, 'range values bound in order');
  ok(!/CAST\(v\.product_id AS CHAR\) = \?/.test(jdbcLog.sql[jdbcLog.sql.length - 1]), 'all-products call has no product filter');
  const b0 = jdbcLog.opens;
  const r2 = vm.runInContext('dbTcDateSalesMonthly_(' + JSON.stringify(P) + ')', sb);
  ok(jdbcLog.opens === b0, 'identical repeat costs zero connections');
  ok(r2.rows.length === DMONTHLY.length, 'cached buckets intact');
  vm.runInContext('dbTcDateSalesMonthly_(' + JSON.stringify({ from: '2026-08-01', to: '2026-09-30', product_id: '7' }) + ')', sb);
  ok(jdbcLog.opens === b0 + 1, 'product filter splits the key: exactly one reconnect');
  ok(/CAST\(v\.product_id AS CHAR\) = \?/.test(jdbcLog.sql[jdbcLog.sql.length - 1]) && jdbcLog.bound.indexOf('7') !== -1, 'product id bound when set');
  vm.runInContext('dbTcDateSalesMonthly_(' + JSON.stringify({ from: '2026-09-01', to: '2026-09-30', product_id: '' }) + ')', sb);
  ok(jdbcLog.opens === b0 + 2, 'other ranges are another key: exactly one reconnect');
  const b1 = jdbcLog.opens;
  vm.runInContext('dbTcDateSalesMonthly_(' + JSON.stringify({ from: '2026-08-01', to: '2026-09-30', product_id: '', refresh: true }) + ')', sb);
  ok(jdbcLog.opens === b1 + 1, 'refresh:true rebuilds');
  ok(jdbcLog.closes === jdbcLog.opens, 'every opened connection closed');
  const pr = vm.runInContext('dbTcDateSalesProducts_({})', sb);
  ok(pr.status === 'ok' && pr.products.length === DPRODS.length && pr.products[0].product_id === '7', 'product dropdown list shape intact');
  const pb0 = jdbcLog.opens;
  vm.runInContext('dbTcDateSalesProducts_({})', sb);
  ok(jdbcLog.opens === pb0, 'product list repeat is a cache hit');
  let threw = null;
  try { vm.runInContext('dbTcDateSalesParams_({from:"2026-09-30", to:"2026-08-01"})', sb); } catch (e) { threw = e; }
  ok(!!threw, 'inverted range rejected before any query');
  threw = null;
  try { vm.runInContext('dbTcDateSalesParams_({from:"", to:""})', sb); } catch (e) { threw = e; }
  ok(!!threw, 'missing range rejected before any query');
}
console.log('7 — box_movement_daily_revise monthly endpoint (chart_of_accounts filter)');
{
  const P = { from: '2026-08-01', to: '2026-09-30', chart_of_accounts: '' };
  cacheStore.clear();
  const r = vm.runInContext('dbBoxDailyMonthly_(' + JSON.stringify(P) + ')', sb);
  ok(r.status === 'ok', 'box monthly call succeeds');
  ok(r.rows.length === BMONTHLY.length && r.rows[0].ym === '2026-08' && r.rows[0].income === 5000, 'box monthly buckets shape intact');
  ok(r.rows[0].net === 2000 && r.rows[1].net === -500, 'net = income - outcome per bucket');
  ok(r.from === P.from && r.to === P.to && r.chart_of_accounts === '', 'range + account echo intact');
  const sqls = jdbcLog.sql.join('\n');
  ok(/DATE_FORMAT\(v\.transaction_date, '%Y-%m'\)/.test(sqls) && /GROUP BY ym ORDER BY ym/.test(sqls), 'single monthly GROUP BY, no COUNT needed');
  ok(/v\.transaction_date >= \?/.test(sqls) && /v\.transaction_date <= \?/.test(sqls), 'range is bound, not interpolated');
  ok(/COALESCE\(v\.income,0\)/.test(sqls) && /COALESCE\(v\.outcome,0\)/.test(sqls), 'NULL income/outcome treated as 0');
  ok(jdbcLog.bound.indexOf('2026-08-01') !== -1 && jdbcLog.bound.indexOf('2026-09-30') !== -1, 'range values bound in order');
  ok(!/chart_of_accounts/.test(jdbcLog.sql[jdbcLog.sql.length - 1]), 'all-accounts call has no account filter');
  const b0 = jdbcLog.opens;
  const r2 = vm.runInContext('dbBoxDailyMonthly_(' + JSON.stringify(P) + ')', sb);
  ok(jdbcLog.opens === b0, 'identical repeat costs zero connections');
  ok(r2.rows.length === BMONTHLY.length, 'cached buckets intact');
  vm.runInContext('dbBoxDailyMonthly_(' + JSON.stringify({ from: '2026-08-01', to: '2026-09-30', chart_of_accounts: '310001' }) + ')', sb);
  ok(jdbcLog.opens === b0 + 1, 'account filter splits the key: exactly one reconnect');
  ok(/chart_of_accounts/.test(jdbcLog.sql[jdbcLog.sql.length - 1]) && jdbcLog.bound.indexOf('310001') !== -1, 'account code bound when set');
  vm.runInContext('dbBoxDailyMonthly_(' + JSON.stringify({ from: '2026-09-01', to: '2026-09-30', chart_of_accounts: '' }) + ')', sb);
  ok(jdbcLog.opens === b0 + 2, 'other ranges are another key: exactly one reconnect');
  const b1 = jdbcLog.opens;
  vm.runInContext('dbBoxDailyMonthly_(' + JSON.stringify({ from: '2026-08-01', to: '2026-09-30', chart_of_accounts: '', refresh: true }) + ')', sb);
  ok(jdbcLog.opens === b1 + 1, 'refresh:true rebuilds');
  ok(jdbcLog.closes === jdbcLog.opens, 'every opened connection closed');
  const ar = vm.runInContext('dbBoxDailyAccounts_({})', sb);
  ok(ar.status === 'ok' && ar.accounts.length === BACCOUNTS.length && ar.accounts[0].code === '310001', 'account dropdown list shape intact');
  const ab0 = jdbcLog.opens;
  vm.runInContext('dbBoxDailyAccounts_({})', sb);
  ok(jdbcLog.opens === ab0, 'account list repeat is a cache hit');
  let threw = null;
  try { vm.runInContext('dbBoxDailyParams_({from:"2026-09-30", to:"2026-08-01"})', sb); } catch (e) { threw = e; }
  ok(!!threw, 'inverted range rejected before any query');
  threw = null;
  try { vm.runInContext('dbBoxDailyParams_({from:"", to:""})', sb); } catch (e) { threw = e; }
  ok(!!threw, 'missing range rejected before any query');
}

console.log(failures === 0
  ? '\ndblive_sales_cache: PASS.'
  : '\n' + failures + ' dblive_sales_cache check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
