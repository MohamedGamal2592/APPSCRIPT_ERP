'use strict';
/* TC-SCAN-CATALOG — instant products dropdown + product-level balances.
 *
 * Server: get_stock_scan_catalog / get_stock_scan_balances wiring, bounds,
 * overflow shapes, TTL/version/normalize/valid contracts, adapter SQL against
 * synthetic JDBC. Client: pure matcher behavior (Arabic normalization, exact
 * ID/code routing, 50-cap counts), page wiring, and a stubbed-browser run
 * proving zero-RPC typing, single-RPC product balances, instant warehouse
 * switches, stale-response guards, fallback entry, and local barcodes.
 *
 * Run: node tools/verify/tc_stock_scan_catalog.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const server = fs.readFileSync(path.join(root, 'Company_TopChemical_Actions.js'), 'utf8');
const codeJs = fs.readFileSync(path.join(root, 'Code.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'Company_TopChemical_StockScan.html'), 'utf8');

let checks = 0;
function ok(value, label) {
  checks++;
  assert.ok(value, label);
  console.log('  PASS  ' + label);
}
function extractFunction(src, name) {
  const re = new RegExp('function\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(');
  const m = re.exec(src);
  assert(m, 'missing ' + name);
  const start = m.index, open = src.indexOf('{', m.index);
  let d = 0, q = '', esc = false, line = false, block = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return src.slice(start, i + 1);
  }
  throw Error('unterminated ' + name);
}

console.log('\n1 — catalog + plural balances: permissions, wiring, specs');
ok(/'get_stock_scan_catalog':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'read'\s*\}/.test(server),
  "get_stock_scan_catalog is gated to page 'tc_stock_scan' (read)");
ok(/'get_stock_scan_balances':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'read'\s*\}/.test(server),
  "get_stock_scan_balances is gated to page 'tc_stock_scan' (read)");
ok(/'get_stock_scan_catalog':\s*'mysql:products'/.test(server),
  'ACTION_TABLES maps the catalog to mysql:products');
ok(/'get_stock_scan_balances':\s*'mysql:product_current_qty_warehouses'/.test(server),
  'ACTION_TABLES maps plural balances to mysql:product_current_qty_warehouses');
ok(/register\('get_stock_scan_catalog',\s*function \(data, user\)\s*\{\s*return readDiagnosticsForUser_\(getStockScanCatalog_\(data, user\), user\);\s*\}\)/.test(server),
  'get_stock_scan_catalog registration removes private diagnostics for non-admin users');
ok(/'get_stock_scan_sheet_catalog':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'read'\s*\}/.test(server),
  'Sheets catalog is independently gated to tc_stock_scan read access');
ok(/'get_stock_scan_sheet_catalog':\s*PRODUCTS_SHEET/.test(server) &&
  /register\('get_stock_scan_sheet_catalog',\s*function \(data, user, dbId\)\s*\{\s*return readDiagnosticsForUser_\(getStockScanSheetCatalog_\(data, user, dbId\), user\);\s*\}\)/.test(server),
  'Sheets catalog is wired to the products sheet and registered with private diagnostics');
ok(/register\('get_stock_scan_balances',\s*function \(data, user\)\s*\{\s*return readDiagnosticsForUser_\(getStockScanBalances_\(data, user\), user\);\s*\}\)/.test(server),
  'get_stock_scan_balances registration removes private diagnostics for non-admin users');
ok(/dbStockScanCatalog_: \[30,/.test(server), 'catalog cache TTL is 30s');
ok(/dbStockScanBalances_: \[30,/.test(server), 'plural balances cache short-lived for 30s');
ok(/name === 'dbStockScanCatalog_' \|\| name === 'dbStockScanBalances_' \? 1 :/.test(server),
  'both new definitions are version 1');

console.log('\n2 — normalize + valid contracts');
const defBox = { Number, String, Object, Array, Error };
vm.createContext(defBox);
vm.runInContext(
  extractFunction(codeJs, 'mysqlParams_') + '\n' +
  extractFunction(server, 'mysqlTcDefinition_') + '\nthis.def = mysqlTcDefinition_;',
  defBox);
const catDef = defBox.def('dbStockScanCatalog_');
const catNorm = catDef.normalize({ search: 'x', limit: 5, refresh: '1' });
ok(catNorm.refresh === true && Object.keys(catNorm).length === 1,
  'catalog normalize ignores search/limit so client filters never affect cache keys');
const catNorm2 = catDef.normalize({});
ok(catNorm2.refresh === false, 'catalog normalize defaults refresh false');
const balDef = defBox.def('dbStockScanBalances_');
const balNorm = balDef.normalize({ product_id: '12' });
ok(balNorm.product_id === '12' && balNorm.refresh === false,
  'balances normalize keeps the product predicate');
const balNormR = balDef.normalize({ product_id: '12', refresh: true });
ok(balNormR.product_id === '12' && balNormR.refresh === true,
  'balances normalize honors explicit refresh');
assert.throws(() => balDef.normalize({}), /Invalid product ID/, 'balances reject a missing product ID');
assert.throws(() => balDef.normalize({ product_id: '0' }), /Invalid product ID/, 'balances reject a bad product ID');
ok(true, 'normalize rejects invalid plural-balance input');
const goodCat = { status: 'ok', schema_version: 1, products: [{ id: '7', name_ar: 'صنف' }], count: 1,
  complete: true, overflow: false, reason: null, payload_bytes: 40 };
ok(catDef.valid(goodCat), 'a complete catalog validates');
ok(!catDef.valid(Object.assign({}, goodCat, { count: 2 })), 'count/products mismatch is invalid');
ok(!catDef.valid(Object.assign({}, goodCat, { products: [], count: 0, complete: false, overflow: false, reason: null })),
  'incomplete without overflow is invalid');
ok(catDef.valid({ status: 'ok', schema_version: 1, products: [], count: 0, complete: false,
  overflow: true, reason: 'row_limit', payload_bytes: 2 }), 'overflow shape validates');
ok(!catDef.valid(Object.assign({}, goodCat, { products: [{ id: 7, name_ar: 'x' }] })),
  'non-string entry IDs are invalid');
ok(balDef.valid({ status: 'ok', product_id: '12', balances: [{ warehouse_id: '3', current_qty: 5 }] }),
  'plural balances validate');
ok(!balDef.valid({ status: 'ok', product_id: '12', balances: [{ warehouse_id: '3', current_qty: 'x' }] }),
  'non-numeric balance quantities are invalid');

console.log('\n3 — adapters against synthetic JDBC');
function fakeBackend() {
  const b = {
    JSON, Math, Number, Object, Array, String, Error, isFinite,
    Logger: { log() {} }, mysqlReading_: () => true,
    dbBindParams_: (stmt, values) => { stmt.binds.push(...values); },
    dbGetConnection_: () => ({
      prepareStatement(sql) {
        b.sql = sql;
        const stmt = {
          binds: [],
          setObject(i, v) { this.binds[i - 1] = v; },
          setInt(i, v) { this.binds[i - 1] = v; },
          executeQuery() {
            b.lastBinds = this.binds.slice();
            let i = -1;
            const rows = b.rows;
            return {
              next: () => ++i < rows.length,
              getObject: n => rows[i][n - 1],
              getString: name => {
                const column = name === 'row_count' ? 0 : (name === 'products_json' ? 1 : Number(name) - 1);
                const value = rows[i][column];
                return value == null ? null : String(value);
              },
              close() {}
            };
          },
          close() {}
        };
        return stmt;
      },
      close() {}
    }),
    rows: [], sql: '', lastBinds: []
  };
  return b;
}
const closed = [];
function closingBackend() {
  const b = fakeBackend();
  const orig = b.dbGetConnection_;
  b.dbGetConnection_ = () => {
    const conn = orig();
    const origPrep = conn.prepareStatement;
    conn.prepareStatement = (sql) => {
      const stmt = origPrep(sql);
      const origExec = stmt.executeQuery;
      stmt.executeQuery = () => {
        const rs = origExec.call(stmt);
        const origClose = rs.close;
        rs.close = () => { closed.push('rs'); origClose(); };
        return rs;
      };
      const origStmtClose = stmt.close;
      stmt.close = () => { closed.push('stmt'); origStmtClose(); };
      return stmt;
    };
    const origConnClose = conn.close;
    conn.close = () => { closed.push('conn'); origConnClose(); };
    return conn;
  };
  return b;
}
const catCtx = closingBackend();
vm.createContext(catCtx);
const rowCap = Number(/var DB_CAPABILITY_CATALOG_ROW_CAP_ = (\d+)/.exec(server)[1]);
const byteCap = Number(/var DB_CAPABILITY_CATALOG_BYTE_CAP_ = (\d+)/.exec(server)[1]);
ok(rowCap === 2000 && byteCap === 262144, 'shared catalog bounds are 2,000 pairs / 256 KiB');
vm.runInContext(
  'var DB_CAPABILITY_CATALOG_ROW_CAP_ = ' + rowCap + ';\n' +
  'var DB_CAPABILITY_CATALOG_BYTE_CAP_ = ' + byteCap + ';\n' +
  extractFunction(server, 'tcUtf8Bytes_') + '\n' +
  extractFunction(server, 'dbCapabilityCatalogOverflow_') + '\n' +
  extractFunction(server, 'dbStockScanCatalog_') + '\n' +
  extractFunction(server, 'dbStockScanBalances_') +
  '\nthis.cat = dbStockScanCatalog_; this.bals = dbStockScanBalances_;', catCtx);
catCtx.rows = [[2, JSON.stringify([
  { id: '7', name_ar: 'صنف أ', code: 'C-7', per_unit: '5' },
  { id: '8', name_ar: '', code: null, per_unit: '' }
])]];
let cat = catCtx.cat({}, {});
assert.strictEqual(JSON.stringify(cat.products), JSON.stringify([
  { id: '7', name_ar: 'صنف أ', code: 'C-7', per_unit: '5' },
  { id: '8', name_ar: '', code: null, per_unit: '' }
]), 'catalog carries the count-form fields with IDs as strings');
assert.strictEqual(cat.count, 2, 'catalog count matches returned unique IDs');
ok(cat.complete && !cat.overflow && cat.reason === null && cat.schema_version === 1, 'complete catalog shape');
ok(catCtx.sql.includes('FROM `products`') && catCtx.sql.includes('`deleted_at` IS NULL') &&
  catCtx.sql.includes('ORDER BY `name_ar` ASC, `id` ASC') && catCtx.sql.includes('LIMIT 2001') &&
  !/LIKE|OFFSET/i.test(catCtx.sql), 'catalog is one bounded read with no per-term predicates');
ok(closed.join(',') === 'rs,stmt,conn', 'catalog closes result, statement, connection');
ok(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(catCtx.sql), 'catalog query is read only');
catCtx.rows = [[2001, '[]']];
cat = catCtx.cat({}, {});
ok(!cat.complete && cat.overflow && cat.reason === 'row_limit' && cat.products.length === 0 && cat.count === 0,
  'row 2001 overflows instead of silently truncating');
catCtx.rows = [[1, JSON.stringify([{ id: '0', name_ar: 'x', code: null, per_unit: '' }])]];
cat = catCtx.cat({}, {});
ok(!cat.complete && cat.reason === 'unsupported_id', 'IDs outside the detail contract overflow explicitly');
const bigName = 'م'.repeat(200);
catCtx.rows = [[2000, JSON.stringify(Array.from({ length: 2000 }, (_, i) =>
  ({ id: String(i + 1), name_ar: bigName + i, code: null, per_unit: '' })))]];
cat = catCtx.cat({}, {});
ok(!cat.complete && cat.reason === 'byte_limit', 'payloads beyond 256 KiB overflow instead of truncating names');
catCtx.rows = [[0, '[]']];
cat = catCtx.cat({}, {});
ok(cat.complete && cat.count === 0 && Array.isArray(cat.products), 'an empty table is a valid empty catalog');

catCtx.rows = [['3', 5], ['1', 0], ['2', -4.5]];
let bals = catCtx.bals({ product_id: '12' }, {});
assert.strictEqual(JSON.stringify(bals.balances), JSON.stringify([
  { warehouse_id: '1', current_qty: 0 },
  { warehouse_id: '2', current_qty: -4.5 },
  { warehouse_id: '3', current_qty: 5 }
]), 'one indexed read returns every warehouse pair, sorted, zero/negative intact');
ok(catCtx.sql.includes('WHERE `id` = ?') && !catCtx.sql.includes('warehouse_id` =') &&
  catCtx.lastBinds.length === 1 && catCtx.lastBinds[0] === '12',
  'plural balances bind one product predicate');
catCtx.rows = [['3', 5], ['3', 7]];
assert.throws(() => catCtx.bals({ product_id: '12' }, {}), /مكررة/,
  'duplicate pairs raise the explicit integrity error');
catCtx.rows = [['3', null], ['4', '  ']];
bals = catCtx.bals({ product_id: '12' }, {});
assert.strictEqual(JSON.stringify(bals.balances), JSON.stringify([]), 'NULL/blank quantities stay missing, never zero');
catCtx.rows = [['3', 'x']];
assert.throws(() => catCtx.bals({ product_id: '12' }, {}), /غير صالح/,
  'non-finite quantities are rejected');
catCtx.rows = [];
bals = catCtx.bals({ product_id: '12' }, {});
assert.strictEqual(JSON.stringify(bals.balances), JSON.stringify([]), 'a product without rows yields empty balances');
assert.throws(() => catCtx.bals({ product_id: '' }, {}), /Invalid product ID/,
  'plural balances require a product ID');

console.log('\n4 — local matcher behavior (synthetic fixtures)');
const matchBox = { Number, String, Object, Array, Math };
vm.createContext(matchBox);
vm.runInContext('var SCAN_CATALOG_MAX_OPTIONS = 50;\n' +
  extractFunction(page, 'normalizeScanName') + '\n' +
  extractFunction(page, 'isScanExactId') + '\n' +
  extractFunction(page, 'filterScanCatalog'), matchBox);
const norm = vm.runInNewContext('normalizeScanName', matchBox);
const isId = vm.runInNewContext('isScanExactId', matchBox);
const filt = vm.runInNewContext('filterScanCatalog', matchBox);
ok(norm('مُنتَج آلى  ') === 'منتج الي', 'tashkeel stripped, alef/ya unified, trimmed');
ok(norm('أحمد') === norm('احمد'), 'alef forms equate');
ok(norm('مادة') !== norm('ماده'), 'ta-marbuta and ha stay distinct');
ok(norm('ITEM X') === 'item x', 'Latin lowercased, whitespace collapsed');
ok(isId('7') && isId('9007199254740993') && !isId('07') && !isId('٧') && !isId(''),
  'ASCII numeric IDs route exact; Arabic-Indic digits stay name search');
const fixture = [
  { id: '7', name_ar: 'مادة لاصقة', code: 'C-7', per_unit: '5', key: norm('مادة لاصقة') },
  { id: '8', name_ar: 'مادة لاصقة', code: null, per_unit: '', key: norm('مادة لاصقة') },
  { id: '9', name_ar: 'صنف تجريبي', code: 'C-7', per_unit: '1', key: norm('صنف تجريبي') }
];
let f = filt(fixture, 'id', '7', 50);
ok(f.total === 1 && f.matches.length === 1 && f.matches[0].id === '7', 'ID mode matches exact string IDs only');
f = filt(fixture, 'id', '07', 50);
ok(f.total === 0, 'partial IDs never match in ID mode');
f = filt(fixture, 'code', 'C-7', 50);
ok(f.total === 2 && f.matches[0].id === '7' && f.matches[1].id === '9',
  'code mode matches exactly and keeps every duplicate across IDs');
f = filt(fixture, 'code', '', 50);
ok(f.total === 0, 'empty codes never match');
f = filt(fixture, 'name', 'مادة لاصقة', 50);
ok(f.total === 2, 'name mode matches normalized substrings across same-name IDs');
f = filt(fixture, 'name', '', 50);
ok(f.total === 3, 'empty name query matches the whole catalog');
const many = Array.from({ length: 60 }, (_, i) => ({ id: String(100 + i), name_ar: 'صنف ' + i, code: null, per_unit: '', key: norm('صنف ' + i) }));
f = filt(many, 'name', 'صنف', 50);
ok(f.matches.length === 50 && f.total === 60, 'rendering caps at 50 with the true total preserved');
f = filt(many, 'name', 'صنف', 50);
ok(f.matches[0].id === '100' && f.matches[49].id === '149', 'catalog order is preserved, never re-sorted');

console.log('\n5 — page wiring: catalog-first picker, plural balances, untouched save');
ok(/var SCAN_LOCAL_CATALOG_ENABLED = true;/.test(page), 'local catalog defaults on (rollback switch present)');
ok(/ensureScanCatalog\(false\)/.test(page) && /companyCall\('get_stock_scan_sheet_catalog'/.test(page),
  'the page fetches the Sheets-backed product catalog on load');
ok(/scanCatalogFresh\(\)\) \{/.test(page) &&
  page.indexOf('applyCatalogQuery()') < page.indexOf('productSearchTimer = setTimeout'),
  'fresh catalog filters synchronously before any debounce timer');
ok(/scanCatalogState === 'error'\) \{\s*\n?\s*\/\/ Permission\/session denial: never try an alternate request/.test(page),
  'denial never falls through to an alternate request');
ok(/companyCall\('get_stock_scan_options'/.test(page), 'server search stays as fallback/rollback');
ok(/scanCatalog\.byId\[digits\]/.test(page), 'barcodes resolve locally against the ready catalog');
ok(/companyCall\('get_stock_scan_balances'/.test(page), 'balances load per product in one indexed read');
ok(/balanceMapFresh\(productId\)/.test(page) && /30000/.test(page), 'warehouse switches reuse the short-lived product cache');
ok(/prefetchProductBalances\(currentProduct\.id\)/.test(page), 'selecting a product warms its balances early');
ok(!/companyCall\('get_stock_scan_balance',/.test(page), 'the page no longer issues single-pair balance reads');
ok(/productSearchTotal/.test(page) && /ضيّق البحث لعرض نتائج أدق/.test(page),
  'capped lists show rendered/total counts with a narrow-down hint');
ok(/البحث عبر الخادم/.test(page), 'fallback mode is visibly identified');

console.log('\n5a — Sheets catalog adapter matches barcode product references');
const sheetCatalogBox = {
  Number, String, Object, Array,
  tcProductsRaw_: () => [
    { id: 9, name_ar: 'منتج ب', code: 9, number_of_cartons_bags: 4 },
    { id: 7, name_ar: 'منتج أ', code: 7, number_of_cartons_bags: 2 },
    { id: 7, name_ar: 'اسم أحدث', code: 70, number_of_cartons_bags: 3 },
    { id: 'bad', name_ar: 'تجاهل' },
    { id: 10, name_ar: '', code: null, number_of_cartons_bags: null }
  ],
  bustTcRefs_: () => { sheetCatalogBox.busted = true; }
};
vm.createContext(sheetCatalogBox);
vm.runInContext(extractFunction(server, 'getStockScanSheetCatalog_') +
  '\nthis.sheetCatalog = getStockScanSheetCatalog_;', sheetCatalogBox);
const sheetCatalog = sheetCatalogBox.sheetCatalog({}, {}, 'db1');
const sheetProductsById = JSON.parse(JSON.stringify(sheetCatalog.products)).sort((a, b) => Number(a.id) - Number(b.id));
assert.deepStrictEqual(sheetProductsById, [
  { id: '7', name_ar: 'اسم أحدث', code: '70', per_unit: '3' },
  { id: '9', name_ar: 'منتج ب', code: '9', per_unit: '4' },
  { id: '10', name_ar: '#10', code: null, per_unit: '' }
]);
ok(sheetCatalog.complete && sheetCatalog.count === 3 && sheetCatalog.catalog_ttl_ms === 600000,
  'Sheets catalog returns the complete cached product list with count-form fields');
sheetCatalogBox.sheetCatalog({ refresh: true }, {}, 'db1');
ok(sheetCatalogBox.busted === true, 'explicit catalog refresh invalidates shared TopChemical references');

console.log('\n5b — the count form omits the balance row');
ok(!/count-balance-row|رصيد المخزن المحدد|مخفي حتى تأكيد الكمية/.test(page),
  'the count form has no balance row or hidden-balance caption');
ok(/currentBalance\.state !== 'ready'/.test(page) &&
  /requestBalance\(currentProduct\.id, currentWarehouse\.id, \{ refresh: true \}\)/.test(page),
  'confirmation still requires a ready balance and retries an unavailable pair');

console.log('\n6 — stubbed-browser run: zero-RPC typing, one-RPC balances, stale guards');
(async function () {
  const scripts = Array.from(page.matchAll(/<script>([\s\S]*?)<\/script>/g));
  const clientJs = scripts[scripts.length - 1][1]
    .replace(/var IS_SUPER_ADMIN = .*?;/, 'var IS_SUPER_ADMIN = false;')
    .replace(/var COMPANY_LOGO_URL = .*?;/, "var COMPANY_LOGO_URL = '';")
    .replace(/var COMPANY_PAGES = .*?;/, 'var COMPANY_PAGES = [];')
    .replace(/var CURRENT_ACTION = .*?;/, "var CURRENT_ACTION = 'tc_stock_scan';")
    .replace(/var USER_PAGES = .*?;/, 'var USER_PAGES = {};');
  const calls = [], elements = Object.create(null), timers = [];
  function element(id) {
    if (!elements[id]) elements[id] = {
      id, innerHTML: '', value: '', hidden: false, style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      listeners: {},
      addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
      setAttribute() {}, focus() {}, click() {}, contains() { return false; },
      dispatchEvent() {}
    };
    return elements[id];
  }
  const toasts = [];
  const browser = {
    URLSearchParams, Promise, Date, Math, Number, Object, Array, String, Error, isFinite,
    setTimeout: (fn, delay) => { const t = { fn, delay, cancelled: false }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.cancelled = true; },
    Event: function () {}, console,
    window: { location: { search: '' }, scriptUrl: '/', TOPCHEMICAL_MENU: [] },
    document: {
      getElementById: element, createElement: () => element('el-' + timers.length + '-' + Math.random()),
      querySelector: () => null, addEventListener() {},
      readyState: 'complete', visibilityState: 'visible'
    },
    navigator: { mediaDevices: {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    API: { getSession: () => ({}), call: (name, payload) => new Promise((resolve, reject) => calls.push({ name, payload, resolve, reject })) },
    FMT: { escape: v => String(v) },
    UIC: {
      appShell() {}, canAdd_: () => true, canFull_: () => true, field: () => '', toast: m => toasts.push(String(m)),
      showAllBar: () => '', dataTable: () => '', actionBtns: () => '', initTableSort() {},
      Calculator: { open() {} },
      Live: { watchPage() {}, arrive(fn) { fn(); } }, openModal() {}, closeModal() {}
    }
  };
  vm.createContext(browser);
  vm.runInContext(clientJs, browser);
  ok(true, 'scan page inline script parses and starts in the browser harness');
  const actions = () => calls.map(c => c.payload.module_action);
  ok(actions().includes('get_stock_scan_sheet_catalog') && actions().includes('get_stock_scan_warehouses') &&
    !actions().includes('get_stock_scan_options'),
    'bootstrap fires one Sheets catalog + warehouses request, no per-term search');
  const catCall = calls.find(c => c.payload.module_action === 'get_stock_scan_sheet_catalog');
  const whCall = calls.find(c => c.payload.module_action === 'get_stock_scan_warehouses');
  whCall.resolve({ warehouses: [{ value: 'W1', label: 'مخزن 1' }, { value: 'W2', label: 'مخزن 2' }] });
  const prods = Array.from({ length: 60 }, (_, i) => ({
    id: String(100 + i), name_ar: 'صنف ' + i, code: i === 5 ? 'C-5' : null, per_unit: '5'
  }));
  catCall.resolve({ status: 'ok', schema_version: 1, products: prods, count: 60, complete: true,
    overflow: false, reason: null, catalog_ttl_ms: 600000 });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  ok(elements['scan-product-results'].innerHTML.includes('صنف 0') &&
    elements['scan-product-results'].innerHTML.includes('عرض 50 من 60'),
    'catalog arrival renders the first 50 with a rendered/total count');
  const typed = calls.length;
  elements['scan-product-search'].value = 'صنف 5';
  browser.scheduleProductSearch('صنف 5');
  await Promise.resolve(); await Promise.resolve();
  ok(calls.length === typed, 'fresh-catalog typing issues zero lookup RPCs');
  const html = elements['scan-product-results'].innerHTML;
  ok(html.includes('صنف 5') && html.includes('صنف 59') && !html.includes('#112</span>') &&
    !html.includes('ضيّق البحث'),
    'local filtering matches normalized substrings with stable IDs and no cap note when all fit');
  browser.chooseScanProduct('105');
  ok(browser.currentProduct && browser.currentProduct.id === '105', 'selection commits the stable rendered ID');
  ok(!elements['count-step'].innerHTML.includes('رصيد المخزن المحدد') &&
    !elements['count-step'].innerHTML.includes('count-balance-row'),
    'rendered count form omits the balance row');
  ok(actions().filter(a => a === 'get_stock_scan_balances').length === 1,
    'selecting a product warms its balances with exactly one RPC');
  const balCall = calls.find(c => c.payload.module_action === 'get_stock_scan_balances');
  balCall.resolve({ status: 'ok', product_id: '105', balances: [{ warehouse_id: 'W1', current_qty: 5 }] });
  await Promise.resolve(); await Promise.resolve();
  elements['warehouse'].value = 'W1';
  browser.onWarehouseChange();
  await Promise.resolve();
  ok(calls.filter(c => c.payload.module_action === 'get_stock_scan_balances').length === 1 &&
    browser.currentBalance.state === 'ready' && browser.currentBalance.qty === 5,
    'a warmed warehouse resolves locally with zero new RPCs');
  elements['warehouse'].value = 'W2';
  browser.onWarehouseChange();
  ok(browser.currentBalance.state === 'missing' && browser.currentBalance.qty === null,
    'warehouses absent from the product map stay missing, never zero');
  elements['warehouse'].value = 'W1';
  browser.onWarehouseChange();
  browser.requestBalance('105', 'W1', { refresh: true });
  browser.requestBalance('105', 'W1', { refresh: true });
  const pairCalls = calls.filter(c => c.payload.module_action === 'get_stock_scan_balances');
  ok(pairCalls.length === 3, 'explicit refresh bypasses the product cache');
  pairCalls[2].resolve({ status: 'ok', product_id: '105', balances: [{ warehouse_id: 'W1', current_qty: 99 }] });
  await Promise.resolve(); await Promise.resolve();
  pairCalls[1].reject(new Error('late'));
  await Promise.resolve(); await Promise.resolve();
  ok(browser.currentBalance.state === 'ready' && browser.currentBalance.qty === 99,
    'a late balance failure cannot repaint a newer ready pair');
  const n0 = calls.length;
  browser.handleScannedCode('TCP-107');
  const afterScan = calls.slice(n0).map(c => c.payload.module_action);
  ok(browser.currentProduct && browser.currentProduct.id === '107' &&
    afterScan.includes('get_stock_scan_balances') && !afterScan.includes('get_stock_scan_options'),
    'barcodes resolve locally with zero lookup RPCs and warm the new balances');
  browser.handleScannedCode('TCP-999999');
  ok(toasts.some(t => t.includes('لم يتم العثور')) && browser.currentProduct.id === '107',
    'unknown barcodes are definitive misses that keep the current selection');
  browser.enterCatalogFallback('row_limit');
  await Promise.resolve(); await Promise.resolve();
  ok(calls[calls.length - 1].payload.module_action === 'get_stock_scan_options',
    'overflow enters visibly-identified server search with one current-query request');
})().then(() => {
  console.log('\ntc_stock_scan_catalog: ' + checks + ' checks passed');
}).catch(e => {
  console.error(e && e.stack || e);
  process.exit(1);
});
