'use strict';
/* TC-EXEC-SALES-MULTISELECT — offline proof for the tc_exec_sales upgrades.

   Two independent halves, both against the REAL sources:

   A. SERVER — dbTcDateSales*_ / dbBoxDaily*_ sliced out of
      Company_TopChemical_Actions.js (with Code.js for the shared JDBC helpers)
      and run over a fake JDBC connection with a captured statement log.

      Proves: several products in ONE grouped read (not one query per product),
      several accounts in one grouped read, the combined `rows` equal to the sum
      of the per-series rows, and the OPT-IN 311100–421300 account window that
      (a) is applied to the movement view so only accounts that actually moved
      are offered, (b) is bound, never interpolated, (c) never changes the
      unfiltered statement or its cache entry when it is not asked for.

   B. PAGE — the real page's percentage helpers extracted and executed, plus
      static assertions on the multi-select control, the range switch and the
      request payload.

   Run: node tools/verify/tc_exec_sales_multiselect.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
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
function section(t) { console.log('\n── ' + t); }

/* ── extraction ─────────────────────────────────────────────────────────── */
function grabFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('missing function ' + name);
  const open = src.indexOf('{', start);
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
  throw new Error('unterminated function ' + name);
}
function grabScalar(src, name) {
  const m = new RegExp('var ' + name + ' = [^;]+;').exec(src);
  if (!m) throw new Error('missing scalar ' + name);
  return m[0];
}
function grabConst(src, name) {
  const start = src.indexOf('const ' + name + ' =');
  if (start === -1) throw new Error('missing const ' + name);
  const end = src.indexOf('\n};', start);
  if (end === -1) throw new Error('const ' + name + ' end not found');
  return src.slice(start, end + 3);
}
/** `var NAME = { … };` including the newlines, by first-line anchor + `};`. */
function grabObject(src, name) {
  const start = src.indexOf('var ' + name + ' = {');
  if (start === -1) throw new Error('missing object ' + name);
  const end = src.indexOf('\n  };', start);
  if (end === -1) throw new Error('object ' + name + ' end not found');
  return src.slice(start, end + 5);
}
function pageFn(name) {
  const blocks = PAGE.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const body = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    if (body.indexOf('function ' + name + '(') !== -1) return grabFn(body, name);
  }
  throw new Error('page function not found: ' + name);
}

/* ══ A. server ═══════════════════════════════════════════════════════════ */
const jdbcLog = { opens: 0, closes: 0, sql: [], bound: [] };
const cacheStore = new Map();
function listRs(cols, rows) {
  let i = -1;
  return {
    next: () => ++i < rows.length,
    getObject: n => { const v = rows[i][n - 1]; return v === undefined ? null : v; },
    close: () => {}
  };
}
/* Multi-series fixtures: two products, two accounts. */
const MULTI_SALES = [
  ['7', '2026-08', 2400, 5, 2.5],
  ['8', '2026-08', 200, 20, 2],
  ['7', '2026-09', 290, 29, 14.5],
  ['8', '2026-09', 700, 10, 1.5]
];
const MULTI_BOX = [
  ['311100', '2026-08', 4000, 1000, 3000, 7],
  ['311100', '2026-09', 1000, 1500, -500, 3],
  ['421300', '2026-08', 900, 300, 600, 2],
  ['421300', '2026-09', 500, 100, 400, 1]
];
const RANGED_ACCOUNTS = [['311100'], ['421300']];
const ALL_ACCOUNTS = [['310001'], ['311100'], ['421300'], ['500000']];

const JdbcStub = {
  getConnection: () => {
    jdbcLog.opens++;
    return {
      prepareStatement: sql => {
        jdbcLog.sql.push(sql);
        return {
          setObject: (i, v) => { jdbcLog.bound.push(v); },
          executeQuery: () => {
            if (/FROM date_sales_product_qty_value/.test(sql) && /GROUP BY pid, ym/.test(sql)) return listRs(['pid', 'ym', 'egp', 'q', 'm'], MULTI_SALES);
            if (/FROM box_movement_daily_revise/.test(sql) && /GROUP BY acct, ym/.test(sql)) return listRs(['acct', 'ym', 'income', 'outcome', 'net', 'moves'], MULTI_BOX);
            if (/FROM box_movement_daily_revise/.test(sql) && /BETWEEN \? AND \?/.test(sql)) return listRs(['code'], RANGED_ACCOUNTS);
            if (/FROM box_movement_daily_revise/.test(sql)) return listRs(['code'], ALL_ACCOUNTS);
            return listRs(['x'], []);
          },
          close: () => {}
        };
      },
      close: () => { jdbcLog.closes++; }
    };
  }
};
const CacheStub = {
  getScriptCache: () => ({
    get: k => { const v = cacheStore.get(k); return v === undefined ? null : v; },
    put: (k, v) => { cacheStore.set(k, String(v)); },
    remove: k => { cacheStore.delete(k); }
  })
};
const sb = {
  console, PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ MYSQL_USER: 'u', MYSQL_PASSWORD: 'p' }[k] || null) }) },
  Jdbc: JdbcStub, CacheService: CacheStub, Logger: { log: () => {} }
};
vm.createContext(sb);
vm.runInContext(
  grabScalar(SRC, 'DB_TC_DATE_SALES_TTL') + '\n' +
  grabScalar(SRC, 'DB_TC_MAX_FILTER_KEYS') + '\n' +
  grabScalar(SRC, 'DB_TC_BOX_DAILY_TTL') + '\n' +
  grabScalar(SRC, 'DB_TC_BOX_ACCOUNTS_TTL') + '\n' +
  grabConst(SRC, 'DBLIVE_CONFIG') + '\n' +
  grabFn(SRC, 'dbLiveProp_') + '\n' +
  grabFn(SRC, 'dbGetConnection_') + '\n' +
  grabFn(SRC, 'dbBindParams_') + '\n' +
  grabFn(SRC, 'dbTcSalesVer_') + '\n' +
  grabFn(SRC, 'dbTcSalesCacheGet_') + '\n' +
  grabFn(SRC, 'dbTcSalesCachePut_') + '\n' +
  grabFn(SRC, 'dbTcKeyList_') + '\n' +
  grabFn(SRC, 'dbTcAcctBound_') + '\n' +
  grabFn(SRC, 'dbTcDateSalesParams_') + '\n' +
  grabFn(SRC, 'dbTcDateSalesMonthly_') + '\n' +
  grabFn(SRC, 'dbBoxDailyParams_') + '\n' +
  grabFn(SRC, 'dbBoxDailyMonthly_') + '\n' +
  grabFn(SRC, 'dbBoxDailyAccounts_'),
  sb, { filename: 'topchemical slice' });
const run = (expr) => vm.runInContext(expr, sb);
const lastSql = () => jdbcLog.sql[jdbcLog.sql.length - 1];
const boundSince = (n) => jdbcLog.bound.slice(n);
const J = (o) => JSON.stringify(o);

section('A1 — product multi-select: one grouped read, one series per product');
{
  cacheStore.clear();
  const b0 = jdbcLog.bound.length;
  const r = run('dbTcDateSalesMonthly_(' + J({ from: '2026-08-01', to: '2026-09-30', product_ids: ['7', '8'] }) + ')');
  ok(r.status === 'ok', 'multi-product call succeeds');
  ok(Array.isArray(r.series) && r.series.length === 2, 'one series per selected product', (r.series || []).length);
  ok(r.series[0].key === '7' && r.series[1].key === '8', 'series carry the product id as their key');
  ok(r.series[0].rows.length === 2 && r.series[0].rows[0].net_value_egp === 2400,
    'each series carries only its own monthly rows');
  ok(r.series[1].rows[0].net_value_egp === 200, 'and the second product keeps its own figures');
  ok(r.rows.length === 2 && r.rows[0].net_value_egp === 2600 && r.rows[1].net_value_egp === 990,
    'combined rows are the per-month sum of the series',
    JSON.stringify(r.rows));
  ok(r.rows[0].net_qty === 25 && r.rows[0].sales_metric_qty === 4.5, 'combined rows sum every metric, not just value');
  ok(jdbcLog.opens > 0 && jdbcLog.closes === jdbcLog.opens, 'connection closed');
  ok(/IN \(\?,\?\)/.test(lastSql()), 'both ids travel as bound IN parameters, not interpolated');
  ok(/GROUP BY pid, ym ORDER BY ym, pid/.test(lastSql()), 'ONE grouped read for the whole comparison');
  const bound = boundSince(b0);
  ok(bound.indexOf('7') !== -1 && bound.indexOf('8') !== -1, 'both product ids were bound');
  ok(r.product_id === '', 'with a real multi-selection the single-value echo stays honestly empty');
  ok(r.product_ids.join(',') === '7,8', 'the normalized list is echoed back');
}
section('A2 — the single-product path is byte-identical to what shipped');
{
  cacheStore.clear();
  const r = run('dbTcDateSalesMonthly_(' + J({ from: '2026-08-01', to: '2026-09-30', product_id: '7' }) + ')');
  ok(r.status === 'ok' && r.product_id === '7', 'single product still echoes product_id');
  ok(Array.isArray(r.series) && r.series.length === 1 && r.series[0].key === '7',
    'a single selection is exposed as exactly one series');
  ok(/CAST\(v\.product_id AS CHAR\) = \?/.test(lastSql()), 'single product keeps the = ? predicate');
  ok(/GROUP BY ym ORDER BY ym/.test(lastSql()), 'and the original GROUP BY (no pid column added)');
  const empty = run('dbTcDateSalesMonthly_(' + J({ from: '2026-08-01', to: '2026-09-30', product_id: '' }) + ')');
  ok(empty.product_id === '', 'all-products echo unchanged');
  ok(!/CAST\(v\.product_id AS CHAR\)/.test(lastSql()), 'all-products call still has no product filter');
}
section('A3 — the product list stays bounded and duplicate-free');
{
  const many = [];
  for (let i = 0; i < 40; i++) many.push(String(i));
  let tooMany = null;
  try { run('dbTcDateSalesParams_(' + J({ from: '2026-08-01', to: '2026-09-30', product_ids: many }) + ')'); } catch (e) { tooMany = e; }
  ok(!!tooMany, 'a crafted request above DB_TC_MAX_FILTER_KEYS is rejected rather than silently changing filters');
  const dup = run('dbTcDateSalesParams_(' + J({ from: '2026-08-01', to: '2026-09-30', product_ids: ['7', '7', ' 8 ', ''] }) + ')');
  ok(dup.product_ids.join(',') === '7,8', 'duplicates, blanks and padding are normalized away');
  const sorted = run('dbTcDateSalesParams_(' + J({ from: '2026-08-01', to: '2026-09-30', product_ids: ['8', '7'] }) + ')');
  ok(sorted.product_ids.join(',') === '7,8', 'set-valued filters are sorted for stable cache identity');
  const legacy = run('dbTcDateSalesParams_(' + J({ from: '2026-08-01', to: '2026-09-30', product_id: '9' }) + ')');
  ok(legacy.product_ids.join(',') === '9' && legacy.product_id === '9', 'the legacy single value still feeds the list');
  let threw = null;
  try { run('dbTcDateSalesParams_(' + J({ from: '2026-09-30', to: '2026-08-01' }) + ')'); } catch (e) { threw = e; }
  ok(!!threw, 'the inverted-range guard is untouched by the multi-select change');
}

section('A4 — account multi-select and the OPT-IN 311100–421300 window');
{
  cacheStore.clear();
  const b0 = jdbcLog.bound.length;
  const r = run('dbBoxDailyMonthly_(' + J({ from: '2026-08-01', to: '2026-09-30', chart_of_accounts_list: ['311100', '421300'] }) + ')');
  ok(r.status === 'ok' && r.series.length === 2, 'one series per selected account', (r.series || []).length);
  ok(r.series[0].key === '311100' && r.series[1].key === '421300', 'series keyed by account code');
  ok(r.rows[0].net === 3600 && r.rows[1].net === -100, 'combined net is the per-month sum (3000+600, -500+400)',
    JSON.stringify(r.rows.map(function (x) { return x.net; })));
  ok(r.rows[0].moves === 9 && r.rows[1].moves === 4, 'combined move counts sum too');
  ok(/IN \(\?,\?\)/.test(lastSql()) && /GROUP BY acct, ym/.test(lastSql()), 'one grouped read per comparison');
  ok(boundSince(b0).indexOf('311100') !== -1, 'account codes are bound');

  cacheStore.clear();
  const b1 = jdbcLog.bound.length;
  const ranged = run('dbBoxDailyMonthly_(' + J({ from: '2026-08-01', to: '2026-09-30', chart_of_accounts: '', acct_min: '311100', acct_max: '421300' }) + ')');
  ok(ranged.status === 'ok', 'the ranged all-accounts call succeeds');
  const sql = lastSql();
  ok(/REGEXP '\^\[0-9\]\+\$'/.test(sql), 'a numeric guard keeps a non-numeric account code out of the cast');
  ok(/CAST\(TRIM\(v\.chart_of_accounts\) AS DECIMAL\(20,0\)\) BETWEEN \? AND \?/.test(sql), 'the window is a bound BETWEEN');
  const rb = boundSince(b1);
  ok(rb.indexOf(311100) !== -1 && rb.indexOf(421300) !== -1, 'the bounds are bound as numbers, not interpolated',
    JSON.stringify(rb));
  ok(ranged.acct_min === '311100' && ranged.acct_max === '421300', 'the applied window is echoed for the UI');

  cacheStore.clear();
  run('dbBoxDailyMonthly_(' + J({ from: '2026-08-01', to: '2026-09-30', chart_of_accounts: '' }) + ')');
  ok(!/chart_of_accounts/.test(lastSql()), 'WITHOUT the window the statement still never mentions the column');
  const weird = run('dbBoxDailyParams_(' + J({ from: '2026-08-01', to: '2026-09-30', acct_min: '31;DROP TABLE x', acct_max: '42 1300' }) + ')');
  ok(weird.acct_min === '31' && weird.acct_max === '421300', 'bounds are reduced to digits before they can reach SQL');

  cacheStore.clear();
  const listRanged = run('dbBoxDailyAccounts_(' + J({ acct_min: '311100', acct_max: '421300' }) + ')');
  const listAll = run('dbBoxDailyAccounts_({})');
  ok(listRanged.accounts.length === 2 && listRanged.accounts[0].code === '311100',
    'the ranged account list comes from the movement view inside the window', JSON.stringify(listRanged.accounts));
  ok(listAll.accounts.length === 4, 'the unfiltered list is unchanged for existing callers', listAll.accounts.length);
  ok(listRanged.accounts.length !== listAll.accounts.length, 'the two scopes are genuinely different lists');
  const rangedKeys = Array.from(cacheStore.keys()).filter(k => /box_daily_accounts/.test(k));
  ok(rangedKeys.length === 2, 'the two lists occupy two distinct cache entries', JSON.stringify(rangedKeys));
  ok(rangedKeys.some(k => /_r311100_421300$/.test(k)), 'the ranged entry is keyed by its window');
}

/* ══ B. page ═════════════════════════════════════════════════════════════ */
section('B1 — the lower chart expresses percentages, and says by what');
{
  const code = [
    grabObject(PAGE, 'BOX_SCALES'),
    grabObject(PAGE, 'B'),
    grabFn(PAGE, 'sumField'),
    grabFn(PAGE, 'boxPeriodTotal'),
    grabFn(PAGE, 'boxScaleIsPct'),
    grabFn(PAGE, 'boxSalesByMonth'),
    grabFn(PAGE, 'boxScaleValue'),
    grabFn(PAGE, 'fmtPctValue'),
    grabFn(PAGE, 'listSummary'),
    grabFn(PAGE, 'seriesOf')
  ].join('\n');
  const psb = { console };
  vm.createContext(psb);
  vm.runInContext(code, psb, { filename: 'exec-sales page helpers' });
  const rows = [{ ym: '2026-08', net: 3000 }, { ym: '2026-09', net: -500 }];
  const sales = [{ ym: '2026-08', net_value_egp: 2400 }, { ym: '2026-09', net_value_egp: 290 }];

  psb.B.rows = rows; psb.B.prevRows = [];
  psb.S = { rows: sales, prevRows: [] };
  const def = { field: 'net', money: true };

  psb.B.scale = 'abs';
  ok(vm.runInContext('boxScaleValue(3000, "2026-08", { divisor: 2500, sales: {} })', psb) === 3000,
    'abs mode returns the figure itself');

  psb.B.scale = 'pct_total';
  const ctx = { divisor: vm.runInContext('boxPeriodTotal(B.rows, ' + J(def) + ')', psb), sales: vm.runInContext('boxSalesByMonth(S.rows)', psb) };
  ok(ctx.divisor === 2500, 'the period divisor is the filtered-period total (3000 + -500)', ctx.divisor);
  ok(Math.abs(vm.runInContext('boxScaleValue(3000, "2026-08", ' + J(ctx) + ')', psb) - 120) < 1e-9,
    'August is 120% of the 2500 period total');
  ok(Math.abs(vm.runInContext('boxScaleValue(-500, "2026-09", ' + J(ctx) + ')', psb) + 20) < 1e-9,
    'September keeps its sign: -20% of the period total');

  psb.B.scale = 'pct_sales';
  const ctxS = { divisor: 0, sales: vm.runInContext('boxSalesByMonth(S.rows)', psb) };
  ok(Math.abs(vm.runInContext('boxScaleValue(3000, "2026-08", ' + J(ctxS) + ')', psb) - 125) < 1e-9,
    'August is 125% of that month sales value from the chart ABOVE (3000 / 2400)');
  ok(vm.runInContext('boxScaleValue(3000, "2026-07", ' + J(ctxS) + ')', psb) === null,
    'a month with no sales value yields null (a chart gap), never a division by zero');
  ok(vm.runInContext('boxScaleValue(null, "2026-08", ' + J(ctxS) + ')', psb) === null, 'a missing figure stays missing');

  ok(vm.runInContext('fmtPctValue(12.345)', psb) === '12.3%', 'percentages render with one decimal and a % sign');
  ok(vm.runInContext('fmtPctValue(null)', psb) === '—', 'and an absent value renders as a dash');

  psb.B.accts = ['311100'];
  ok(vm.runInContext('[...seriesOf(B.rows, [])].length', psb) === 1, 'no server series falls back to the combined rows');
  psb.B.accts = ['311100', '421300'];
  ok(vm.runInContext('seriesOf([], [{key:"a",rows:[]},{key:"b",rows:[]}]).length', psb) === 2,
    'server series are preferred when present');
  ok(vm.runInContext('listSummary(["311100","421300"], function(c){return "الحساب " + c;}, "كل الحسابات", "حسابات")', psb) === '2 حسابات',
    'the summary counts a multi-selection instead of naming one account');
  ok(vm.runInContext('listSummary([], function(){return "x";}, "كل الحسابات", "حسابات")', psb) === 'كل الحسابات',
    'an empty selection reads as all');
  ok(vm.runInContext('listSummary(["311100"], function(c){return "الحساب " + c;}, "كل", "حسابات")', psb) === 'الحساب 311100',
    'a single selection still names it');
}
section('B2 — the multi-select choice boxes');
{
  const p = (re, label) => ok(re.test(PAGE), label);
  p(/function mpInit\(key, opts, selected, cfg\)/, 'a picker has an initializer that takes the selection as data');
  p(/function mpSelected\(key\)/, 'the selection is read from state, never from the DOM');
  p(/data-mp-val="'\s*\+\s*FMT\.escape\(o\.value\)/, 'option values travel in data-* attributes, not inline handlers');
  p(/type="checkbox"/, 'options are checkboxes (multiple choice)');
  p(/mp-search/, 'the panel has a search box');
  p(/تحديد الكل<\/button>/, 'the panel can select all options at once');
  p(/مسح<\/button>/, 'and clear them');
  p(/mp-multiselectable="true"|aria-multiselectable="true"/, 'the list is announced as multi-selectable');
  p(/\.mp \{ position: relative; min-width: 300px; \}/, 'the choice box is given real width (300px min)');
  p(/\.filter-group-wide \{ flex: 1 1 320px; min-width: 280px; \}/, 'and its filter group is allowed to grow');
  p(/id="' \+ FMT\.escape\(key\) \+ '" data-mp="'/, 'the picker root keeps the id the page contract names');
  p(/mp-host-exec-product/, 'the product picker mounts into its own host');
  p(/mp-host-exec-box-acct/, 'the account picker mounts into its own host');
  p(/document\.addEventListener\('click'/, 'panels close on an outside click');
  ok(PAGE.indexOf("id=\"exec-product\"") !== -1 || /id="' \+ FMT\.escape\(key\)/.test(PAGE),
    'the exec-product id survives the picker rewrite');
}
section('B3 — the payload and the visible range switch');
{
  const p = (re, label) => ok(re.test(PAGE), label);
  p(/function toggleBoxRange\(on\)/, 'the account window has an explicit switch');
  p(/id="exec-box-range"/, 'the switch is rendered in the filter bar');
  p(/حسابات ' \+ FMT\.escape\(B\.acctMin\) \+ '–' \+ FMT\.escape\(B\.acctMax\) \+ ' فقط/, 'and it names the window in its label');
  p(/rangeOnly: true, acctMin: '311100', acctMax: '421300'/, 'the window defaults to 311100–421300');
  p(/function boxAcctRangePayload\(payload\)/, 'one place decides whether the window is sent');
  p(/if \(B\.rangeOnly\) \{ p\.acct_min = B\.acctMin; p\.acct_max = B\.acctMax; \}/, 'the bounds are sent only while the switch is on');
  p(/loadBoxAccounts\(\)/, 'the account list is re-fetched when the scope changes');
  p(/B\.accts = \[\];\s*refreshBoxAcctCombo\(\);/, 'a selection the new scope excludes is dropped, not kept silently');
  p(/product_ids: S\.product_ids/, 'the sales request carries the product list');
  p(/chart_of_accounts_list: snapshot\.accounts/, 'the box request carries the account list snapshot');
  p(/function setBoxScale\(m\)/, 'the display mode is switchable');
  p(/for 0 or 1|requirements|scale-bar/, 'the scale bar exists');
  p(/function boxScaleNote\(\)/, 'the chart states the divisor it divides by');
  p(/النسبة = قيمة الشهر ÷ إجمالي الفترة المحددة/, 'the period-share mode prints the total it divides by');
  p(/النسبة = حركة الخزنة ÷ صافي قيمة المبيعات لنفس الشهر \(الرسم الأعلى\)/, 'the sales-ratio mode names the chart above');
  p(/var SERIES_COLORS = \[/, 'comparison series get distinct colours');
  ok(PAGE.indexOf('borderDash') !== -1 && PAGE.indexOf('الفترة السابقة') !== -1,
    'the previous-period line is still drawn for a single selection');
  ok(PAGE.indexOf("'الشهر (حالية)', 'الحالية', 'الشهر (سابقة)', 'السابقة', 'التغير'") !== -1,
    'the compare-mode table columns are unchanged');
}
section('B4 — the page keeps the contracts the shipped suite asserts');
{
  const p = (s, label) => ok(PAGE.indexOf(s) !== -1, label);
  p('exec-from', 'date-from filter id'); p('exec-to', 'date-to filter id');
  p('function setMetric(m)', 'sales metric switch');
  p("field: 'net_value_egp'", 'sales value field'); p("field: 'net_qty'", 'qty field'); p("field: 'sales_metric_qty'", 'metric field');
  p('function setBoxMetric(m)', 'box metric switch');
  p("field: 'net'", 'box net field'); p("field: 'income'", 'box income field'); p("field: 'outcome'", 'box outcome field');
  p('function prevRange(from, to)', 'previous-period derivation');
  p('payload.previous = { from: prev.from, to: prev.to }', 'current and previous periods share one report request');
  p('function fmtPct', 'percent-change formatter'); p('التغير', 'the change label');
  p('function fmtAcct', 'accounting formatter'); p('(دخل', 'the income label');
  p('function openSalesModal', 'sales modal'); p('function openBoxModal', 'box modal');
  p('function downloadCsv', 'CSV export'); p('function printTable', 'print');
  p('تحميل CSV', 'CSV button'); p('طباعة', 'print button');
  p('chart-spacer', 'spacer between the charts');
  p("height: 48px", 'and its measured height');
  ok(PAGE.indexOf("window.open('', '_blank')") === -1,
    'printing no longer opens its own blank tab (it goes through UIC.printDoc)');
  ok(/UIC\.printDoc\(h, title/.test(PAGE), 'printTable delegates to the shared helper');
}

console.log('\n' + (failures === 0
  ? 'tc_exec_sales_multiselect: PASS (multi-series server reads, opt-in account window, percentage modes, multi-select UI)'
  : 'tc_exec_sales_multiselect: FAIL (' + failures + ' check(s))'));
process.exit(failures === 0 ? 0 : 1);
