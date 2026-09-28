'use strict';
/* TC-CAPABILITY-PICKER — instant TopChemical capability dropdowns.
 *
 * Server: get_production_capability_catalog / get_sales_capacity_catalog
 * wiring, bounds, overflow shapes, TTL/version/normalize/valid contracts,
 * adapter SQL against synthetic JDBC, served_at freshness wrapper.
 * Client: shared UIC.TcCapabilityPicker — pure matching, bootstrap sharing,
 * zero-RPC typing, freshness/deadline lifecycle, refresh/invalidation, races,
 * fallback + rollout flags — with injected RPC/clock/DOM seams and synthetic
 * fixtures, plus stubbed-browser runs of both pages in both flag modes.
 *
 * Run: node tools/verify/tc_capability_picker.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const server = fs.readFileSync(path.join(root, 'Company_TopChemical_Actions.js'), 'utf8');
const codeJs = fs.readFileSync(path.join(root, 'Code.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'UI_Components.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'Client_Helpers.html'), 'utf8');
const prodPage = fs.readFileSync(path.join(root, 'Company_TopChemical_ProductionCapability.html'), 'utf8');
const salesPage = fs.readFileSync(path.join(root, 'Company_TopChemical_SalesCapacity.html'), 'utf8');

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
function extractBlock(src, name) {
  const start = src.indexOf('const ' + name + ' =');
  assert(start >= 0, 'missing block ' + name);
  const open = src.indexOf('{', start);
  let d = 0, q = '', esc = false, line = false, block = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return src.slice(open, i + 1);
  }
  throw Error('unterminated block ' + name);
}
const pickerBlock = ui.slice(ui.indexOf('/* TC_CAPABILITY_PICKER_BEGIN'), ui.indexOf('/* TC_CAPABILITY_PICKER_END */'));
assert(pickerBlock.length > 5000, 'shared picker block is present in UI_Components.html');
function escTest(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const ticks = (n) => { let p = Promise.resolve(); for (let i = 0; i < (n || 10); i++) p = p.then(() => {}); return p; };

console.log('\n1 — catalog actions: permissions, wiring, specs');
ok(/'get_production_capability_catalog':\s*\{\s*page:\s*'tc_production_capability',\s*access:\s*'read'\s*\}/.test(server),
  "get_production_capability_catalog is gated to page 'tc_production_capability' (read)");
ok(/'get_sales_capacity_catalog':\s*\{\s*page:\s*'tc_sales_capacity',\s*access:\s*'read'\s*\}/.test(server),
  "get_sales_capacity_catalog is gated to page 'tc_sales_capacity' (read)");
ok(/'get_production_capability_catalog':\s*'mysql:manuf_product_support_capability'/.test(server),
  'ACTION_TABLES maps the production catalog to mysql:manuf_product_support_capability');
ok(/'get_sales_capacity_catalog':\s*'mysql:manuf_product_support_capability'/.test(server),
  'ACTION_TABLES maps the sales catalog to mysql:manuf_product_support_capability');
ok(/register\('get_production_capability_catalog',\s*getProductionCapabilityCatalog_\)/.test(server),
  'get_production_capability_catalog registered');
ok(/register\('get_sales_capacity_catalog',\s*getSalesCapacityCatalog_\)/.test(server),
  'get_sales_capacity_catalog registered');
ok(/dbCapabilityCatalog_: \[30,/.test(server), 'catalog cache TTL is 30s');
ok(/name === 'dbCapabilityCatalog_' \|\|/.test(server) && /'dbCapabilityCatalog_'[^?]*\? 1/.test(server),
  'the catalog definition is version 1');
ok(/dependencies:\s*\['mysql:\*'\]/.test(server), 'catalog reads depend conservatively on mysql:*');
const defBox = { Number, String, Object, Array, Error };
vm.createContext(defBox);
vm.runInContext(
  extractFunction(codeJs, 'mysqlParams_') + '\n' +
  extractFunction(server, 'mysqlTcDefinition_') + '\nthis.def = mysqlTcDefinition_;',
  defBox);
const catDef = defBox.def('dbCapabilityCatalog_');
const catNorm = catDef.normalize({ search: 'منتج', limit: 5, refresh: '1' });
ok(catNorm.refresh === true && Object.keys(catNorm).length === 1,
  'catalog normalize keeps only the refresh boolean so search/limits never affect cache keys');
ok(catDef.normalize({}).refresh === false, 'catalog normalize defaults refresh to false');
const goodCat = { status: 'ok', schema_version: 1, products: [{ id: '7', name: 'صنف' }], count: 1,
  complete: true, overflow: false, reason: null, payload_bytes: 40 };
ok(catDef.valid(goodCat), 'a complete catalog validates');
ok(!catDef.valid(Object.assign({}, goodCat, { count: 2 })), 'count/products mismatch is invalid');
ok(!catDef.valid(Object.assign({}, goodCat, { products: [], count: 0, complete: false, overflow: false, reason: null })),
  'incomplete without overflow is invalid');
ok(catDef.valid({ status: 'ok', schema_version: 1, products: [], count: 0, complete: false,
  overflow: true, reason: 'row_limit', payload_bytes: 2 }), 'overflow shape validates');
ok(catDef.valid({ status: 'ok', schema_version: 1, products: [], count: 0, complete: false,
  overflow: true, reason: 'byte_limit', payload_bytes: 2 }), 'byte overflow shape validates');
ok(catDef.valid({ status: 'ok', schema_version: 1, products: [], count: 0, complete: false,
  overflow: true, reason: 'unsupported_id', payload_bytes: 2 }), 'unsupported-ID shape validates');
ok(!catDef.valid(Object.assign({}, goodCat, { products: [{ id: 7, name: 'x' }] })),
  'non-string entry IDs are invalid');
ok(!catDef.valid(Object.assign({}, goodCat, { complete: true, overflow: true })),
  'complete with overflow is invalid');
const access = vm.runInNewContext('(' + extractBlock(server, 'PAGE_ACCESS') + ')');
ok(access.get_production_capability_catalog.page === 'tc_production_capability' &&
  access.get_sales_capacity_catalog.page === 'tc_sales_capacity',
  'no OR-permission action: each catalog has its own page grant');
const guardSrc = extractFunction(server, 'guard_');
const denied = { PAGE_ACCESS: access, COMPANY_UID: '3fe1b5cb67b7223e', ERP_MESSAGES: { NOT_AUTHORIZED: 'denied' }, unifiedCheck_: () => false };
vm.createContext(denied);
vm.runInContext(guardSrc + '\nthis.call = guard_;', denied);
assert.throws(() => denied.call({ id: 'prod' }, 'get_sales_capacity_catalog', {}), /denied/);
ok(true, 'a production-only user cannot invoke the sales catalog action');
assert.throws(() => denied.call({ id: 'x' }, 'get_production_capability_catalog', {}), /denied/);
ok(true, 'an ungranted user cannot invoke the production catalog action');
const prodOnly = { PAGE_ACCESS: access, COMPANY_UID: '3fe1b5cb67b7223e', ERP_MESSAGES: { NOT_AUTHORIZED: 'denied' },
  unifiedCheck_: (u, c, p) => p === 'tc_production_capability' };
vm.createContext(prodOnly);
vm.runInContext(guardSrc + '\nthis.call = guard_;', prodOnly);
prodOnly.call({ id: 'prod' }, 'get_production_capability_catalog', {});
assert.throws(() => prodOnly.call({ id: 'prod' }, 'get_sales_capacity_catalog', {}), /denied/);
ok(true, 'production grant authorizes its own catalog but not the sales one (and vice versa by symmetry)');
ok(/def\.authorize\(r\);\s*\/\/ Runs on hits as well as misses/.test(codeJs),
  'mysqlRead_ authorizes every cache hit and miss against the actual request action');
ok(/mysqlDigest_\(\[mysqlDatabase_\(\), r\.scope, r\.action,/.test(codeJs),
  'cache keys isolate the requesting action, scope and authority');
ok(/authorize: function \(request\) \{\s*\n?\s*\/\/ dispatch_ already checked/.test(server) ||
  /guard_\(request\.user, request\.action/.test(server),
  'the catalog definition repeats server authorization before cache access');

console.log('\n2 — catalog adapter against synthetic JDBC');
function fakeBackend() {
  const b = {
    JSON, Math, Number, Object, Array, String, Error, isFinite,
    Logger: { log() {} }, mysqlReading_: () => true,
    dbGetConnection_: () => ({
      prepareStatement(sql) {
        b.sql = sql;
        return {
          executeQuery() {
            let i = -1;
            const rows = b.rows;
            return {
              next: () => ++i < rows.length,
              getString: (col) => col === 'manufacture_product_id' ? rows[i][0] : rows[i][1],
              close() { b.closed.push('rs'); }
            };
          },
          close() { b.closed.push('stmt'); }
        };
      },
      close() { b.closed.push('conn'); }
    }),
    rows: [], sql: '', closed: []
  };
  return b;
}
const capCtx = fakeBackend();
vm.createContext(capCtx);
const rowCap = Number(/var DB_CAPABILITY_CATALOG_ROW_CAP_ = (\d+)/.exec(server)[1]);
const byteCap = Number(/var DB_CAPABILITY_CATALOG_BYTE_CAP_ = (\d+)/.exec(server)[1]);
ok(rowCap === 2000 && byteCap === 262144, 'shared catalog bounds are 2,000 pairs / 256 KiB');
vm.runInContext(
  'var DB_CAPABILITY_CATALOG_ROW_CAP_ = ' + rowCap + ';\n' +
  'var DB_CAPABILITY_CATALOG_BYTE_CAP_ = ' + byteCap + ';\n' +
  extractFunction(server, 'tcUtf8Bytes_') + '\n' +
  extractFunction(server, 'dbCapabilityCatalogOverflow_') + '\n' +
  extractFunction(server, 'dbCapabilityCatalog_') +
  '\nthis.cat = dbCapabilityCatalog_; this.utf8 = tcUtf8Bytes_;', capCtx);
ok(capCtx.utf8('a') === 1 && capCtx.utf8('م') === 2 && capCtx.utf8('😀') === 4,
  'byte counts are UTF-8, not string length');
capCtx.rows = Array.from({ length: 150 }, (_, i) => [String(i + 1), 'صنف ' + (i + 1)]);
let cat = capCtx.cat({}, {});
ok(cat.complete && !cat.overflow && cat.count === 150 && cat.reason === null && cat.schema_version === 1,
  'complete catalogs beyond the old 100-product search cap stay complete');
assert.strictEqual(JSON.stringify(cat.products[0]), JSON.stringify({ id: '1', name: 'صنف 1' }));
ok(true, 'IDs stay strings with display names from the view');
ok(capCtx.sql.includes('FROM `manuf_product_support_capability`') &&
  capCtx.sql.includes('`manufacture_product_id` IS NOT NULL') &&
  capCtx.sql.includes('ORDER BY `manufacture_product_name`, `manufacture_product_id`') &&
  capCtx.sql.includes('LIMIT 2001') && !/LIKE|OFFSET/i.test(capCtx.sql),
  'catalog is one bounded read with no per-term predicates');
ok(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(capCtx.sql), 'catalog query is read only');
ok(capCtx.closed.join(',') === 'rs,stmt,conn', 'catalog closes result, statement and connection');
capCtx.rows = [['7', 'صنف أ'], ['8', 'صنف أ']];
cat = capCtx.cat({}, {});
assert.strictEqual(JSON.stringify(cat.products), JSON.stringify([{ id: '7', name: 'صنف أ' }, { id: '8', name: 'صنف أ' }]));
ok(true, 'same names with different IDs remain separate entries');
capCtx.rows = [['7', 'أول'], ['7', 'ثان']];
cat = capCtx.cat({}, {});
assert.strictEqual(JSON.stringify(cat.products), JSON.stringify([{ id: '7', name: 'أول' }]));
ok(true, 'conflicting names for one ID keep the first in stable database order');
capCtx.rows = [['7', null], [null, 'بلا معرف']];
cat = capCtx.cat({}, {});
assert.strictEqual(JSON.stringify(cat.products), JSON.stringify([{ id: '7', name: '' }]));
ok(true, 'NULL names become empty strings with IDs visible; NULL IDs are skipped');
capCtx.rows = Array.from({ length: 2000 }, (_, i) => [String(i + 1), 'صنف ' + (i + 1)]);
cat = capCtx.cat({}, {});
ok(cat.complete && cat.count === 2000, 'exactly 2,000 pairs is a complete catalog');
capCtx.rows = Array.from({ length: 2001 }, (_, i) => [String(i + 1), 'صنف ' + (i + 1)]);
cat = capCtx.cat({}, {});
ok(!cat.complete && cat.overflow && cat.reason === 'row_limit' && cat.products.length === 0 && cat.count === 0,
  'row 2001 overflows instead of silently truncating');
capCtx.rows = Array.from({ length: 2001 }, (_, i) => ['5', 'اسم ' + i]);
cat = capCtx.cat({}, {});
ok(!cat.complete && cat.reason === 'row_limit',
  'row 2001 overflows even when deduplication would reduce unique IDs below the cap');
['0', '007', 'abc', ''].forEach((bad) => {
  capCtx.rows = [[bad, 'x']];
  const r = capCtx.cat({}, {});
  assert(!r.complete && r.reason === 'unsupported_id', 'invalid ID overflows: ' + JSON.stringify(bad));
});
ok(true, 'IDs outside the detail contract return unsupported_id instead of a partial catalog');
const bigName = 'م'.repeat(200);
capCtx.rows = Array.from({ length: 2000 }, (_, i) => [String(i + 1), bigName + i]);
cat = capCtx.cat({}, {});
ok(!cat.complete && cat.reason === 'byte_limit', 'payloads beyond 256 KiB overflow instead of truncating names');
capCtx.rows = [];
cat = capCtx.cat({}, {});
ok(cat.complete && cat.count === 0 && Array.isArray(cat.products), 'an empty table is a valid empty catalog');

console.log('\n2b — served_at freshness wrapper');
const serveBox = { Number, String, Object, Array, Error, Date: { now: () => 5000 } };
vm.createContext(serveBox);
vm.runInContext(
  extractFunction(server, 'withCatalogServedAt_') + '\n' +
  'function dbCapabilityCatalog_(data, user) { return this.fixture; }\n' +
  'function mysqlTcDefinition_() { return {}; }\n' +
  'var __mysqlReading = false;\n' +
  'function mysqlReading_() { return __mysqlReading; }\n' +
  'function mysqlRead_(def, data, run) { return this.fixture; }\n' +
  extractFunction(server, 'getProductionCapabilityCatalog_') + '\n' +
  extractFunction(server, 'getSalesCapacityCatalog_') +
  '\nthis.prod = getProductionCapabilityCatalog_; this.sales = getSalesCapacityCatalog_;',
  serveBox);
serveBox.fixture = { status: 'ok', schema_version: 1, products: [{ id: '7', name: 'x' }], count: 1,
  complete: true, overflow: false, reason: null, payload_bytes: 20,
  _mysql: { read_at: 4000, expires_at: 34000, cache_hit: true } };
const served = serveBox.prod({}, {});
ok(served.served_at === 5000 && served._mysql.cache_hit === true && served.count === 1,
  'fresh served_at is attached on a response copy, including on cache hits');
ok(!('served_at' in serveBox.fixture), 'the cached payload is not mutated with a stale served-at');
serveBox.Date = { now: () => 6000 };
const served2 = serveBox.prod({}, {});
ok(served2.served_at === 6000, 'each response carries a fresh served-at timestamp');

console.log('\n3 — shared picker: pure matching');
const pureBox = { UIC: {}, Promise, Date, Math, Number, String, Object, Array, Error, setTimeout, clearTimeout };
vm.createContext(pureBox);
vm.runInContext(pickerBlock, pureBox);
const P = pureBox.UIC.TcCapabilityPicker;
ok(JSON.stringify(pureBox.UIC.TC_CAPABILITY_LOCAL_PICKER_FLAGS) ===
  JSON.stringify({ tc_production_capability: true, tc_sales_capacity: false }),
  'prepared source flags: production enabled, sales disabled');
ok(P.normalizeName('مُنتَج آلى  ') === 'منتج الي', 'tashkeel stripped, alef/ya unified, trimmed');
ok(P.normalizeName('أحمد') === P.normalizeName('احمد'), 'alef forms equate');
ok(P.normalizeName('مادة') !== P.normalizeName('ماده'), 'ta marbuta and ha stay distinct');
ok(P.normalizeName('ITEM X') === 'item x', 'Latin lowercased, whitespace collapsed');
ok(P.isExactId('7') && P.isExactId('9999999999') && !P.isExactId('07') && !P.isExactId('٧') && !P.isExactId(''),
  'ASCII numeric IDs route exact; Arabic-Indic digits stay name search');
ok(!P.isExactId('12345678901'), 'IDs beyond 10 digits are not exact capability IDs');
const normOf = (n) => P.normalizeName(n);
const fixture = [
  { id: '7', name: 'مادة لاصقة', key: normOf('مادة لاصقة') },
  { id: '8', name: 'مادة لاصقة', key: normOf('مادة لاصقة') },
  { id: '9', name: 'صنف تجريبي', key: normOf('صنف تجريبي') }
];
let f = P.filterCatalog(fixture, '7', 50);
ok(f.total === 1 && f.matches.length === 1 && f.matches[0].id === '7', 'ID query matches the exact string ID only');
f = P.filterCatalog(fixture, '07', 50);
ok(f.total === 0, 'partial IDs never match');
f = P.filterCatalog(fixture, 'مادة لاصقة', 50);
ok(f.total === 2, 'name queries match normalized substrings across same-name IDs');
f = P.filterCatalog(fixture, '', 50);
ok(f.total === 3, 'empty query matches the whole catalog');
const longName = 'س'.repeat(80);
const longFix = [{ id: '1', name: longName, key: normOf(longName) }];
f = P.filterCatalog(longFix, 'س'.repeat(81), 50);
ok(f.total === 1, 'the 80-character bound applies to the trimmed matching query');
f = P.filterCatalog(fixture, '٧', 50);
ok(f.total === 0, 'Arabic-Indic digits keep name-search behavior, never exact-ID');
const many = Array.from({ length: 60 }, (_, i) => ({ id: String(100 + i), name: 'صنف ' + i, key: normOf('صنف ' + i) }));
f = P.filterCatalog(many, 'صنف', 50);
ok(f.matches.length === 50 && f.total === 60, 'rendering caps at 50 with the true total preserved');
ok(f.matches[0].id === '100' && f.matches[49].id === '149', 'server order is preserved, never re-sorted');
const accGood = P.acceptCatalog({ status: 'ok', schema_version: 1,
  products: [{ id: '7', name: 'x' }], count: 1, complete: true, overflow: false, reason: null, payload_bytes: 20 });
ok(accGood.ok && accGood.products[0].key === P.normalizeName('x'), 'acceptance precomputes normalized keys');
ok(!P.acceptCatalog({ status: 'ok', schema_version: 1, products: [], count: 0, complete: false,
  overflow: true, reason: 'row_limit', payload_bytes: 2 }).ok, 'overflow never becomes a ready catalog');
ok(P.acceptCatalog({ status: 'ok', schema_version: 1, products: [], count: 0, complete: true,
  overflow: false, reason: null, payload_bytes: 2 }).ok, 'a complete empty catalog is valid no-results');
ok(!P.acceptCatalog({ status: 'ok', schema_version: 2, products: [], count: 0, complete: true,
  overflow: false, reason: null, payload_bytes: 2 }).ok, 'schema version is enforced');
ok(!P.acceptCatalog({ status: 'ok', schema_version: 1, products: [{ id: 7, name: 'x' }], count: 1,
  complete: true, overflow: false, reason: null, payload_bytes: 20 }).ok, 'non-string IDs are rejected');
ok(P.catalogDeadline(1000, { served_at: 900, _mysql: { read_at: 500, expires_at: 30500 } }) === 1000 + 29600,
  'deadline charges the whole RPC time: request start + clamp(expires - served)');
ok(P.catalogDeadline(1000, { served_at: 900, _mysql: { read_at: 500, expires_at: 99999 } }) === 1000 + 30000,
  'remaining freshness never exceeds the 30s TTL');
ok(P.catalogDeadline(1000, { served_at: 900 }) === -1, 'missing freshness metadata cannot become ready');
ok(P.catalogDeadline(1000, { served_at: 900, _mysql: { read_at: 500, expires_at: 100 } }) === -1,
  'expires before read is invalid metadata');
ok(P.isDenial({ code: 'NOT_AUTHORIZED' }) && P.isDenial({ message: 'session expired SESSION_EXPIRED' }) &&
  !P.isDenial(new Error('boom')), 'denial classification separates auth loss from transport errors');

/* Controller harness with injected RPC/clock/DOM seams. */
function makeTimers() {
  const q = [];
  return {
    q,
    setTimeout: (fn, ms) => { const t = { fn, ms: ms || 0, cancelled: false }; q.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cancelled = true; },
    flush(ms) {
      const run = q.filter((t) => !t.cancelled && t.ms <= (ms == null ? 1e9 : ms));
      run.forEach((t) => { t.cancelled = true; });
      run.forEach((t) => { t.fn(); });
      return run.length;
    }
  };
}
function makeEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', _attrs: {}, _listeners: {},
    classList: { _s: {}, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; }, toggle(c, f) { if (f) this._s[c] = 1; else delete this._s[c]; } },
    style: {},
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k]; },
    removeAttribute(k) { delete this._attrs[k]; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener() {},
    focus() {}, contains() { return false; }, scrollIntoView() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    fire(t, e) { (this._listeners[t] || []).slice().forEach((fn) => fn.call(this, e || {})); }
  };
}
function pickerEnv(opts) {
  const o = opts || {};
  const T = makeTimers();
  let fakeNow = o.now0 != null ? o.now0 : 1000000;
  const calls = [];
  const fn = (action, data) => new Promise((res, rej) => calls.push({ action, data, res, rej }));
  const elements = {};
  const element = (id) => (elements[id] = elements[id] || makeEl(id));
  const doc = {
    visibilityState: 'visible', _listeners: {},
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    removeEventListener() {},
    getElementById: element,
    fire(t, e) { (this._listeners[t] || []).slice().forEach((fn2) => fn2.call(this, e || {})); }
  };
  const sb = { UIC: {}, Promise, Date, Math, Number, String, Object, Array, Error,
    setTimeout: T.setTimeout, clearTimeout: T.clearTimeout, document: doc };
  vm.createContext(sb);
  vm.runInContext(pickerBlock, sb);
  const PP = sb.UIC.TcCapabilityPicker;
  const seen = { queries: [], selects: [], catalogs: 0, denied: 0, invalidated: [], results: [],
    selectedId: o.selectedId || '', selectedName: o.selectedName || '' };
  const picker = PP.create({
    enabled: o.enabled !== undefined ? o.enabled : true,
    catalogAction: 'get_production_capability_catalog',
    fallbackAction: 'get_production_capability_products',
    companyCall: fn,
    input: element('in'), list: element('list'), statusEl: element('status'),
    selectedEl: element('sel'), toggle: element('tog'), wrap: element('wrap'),
    optionClass: 'pc-option', noteClass: 'pc-note', escape: escTest,
    getSelectedId: () => seen.selectedId,
    getSelectedName: () => seen.selectedName,
    onQuery: (t) => seen.queries.push(t),
    onSelect: (id, name) => { seen.selects.push([id, name]); },
    onResults: (r, total, info) => { seen.results.push({ n: r.length, total, state: info.state }); },
    onCatalog: () => { seen.catalogs++; },
    onDenied: () => { seen.denied++; },
    onInvalidate: (r) => { seen.invalidated.push(r); },
    formatSelected: (id, name, missing) => (!id ? '' : (name ? name + ' (#' + id + ')' : '#' + id) + (missing ? ' (missing)' : '')),
    now: () => fakeNow
  });
  return { P: PP, picker, calls, T, elements, seen, sb, doc,
    setNow: (v) => { fakeNow = v; }, getNow: () => fakeNow };
}
function catResponse(names, now, extra) {
  const products = names.map((n, i) => ({ id: String(i + 1), name: n }));
  return Object.assign({ status: 'ok', schema_version: 1, products, count: products.length,
    complete: true, overflow: false, reason: null, payload_bytes: 10, served_at: now,
    _mysql: { read_at: now - 400, expires_at: now + 29600, cache_hit: false } }, extra || {});
}
function listHtml(env) { return env.elements.list.innerHTML; }
function optionCount(env) { return (listHtml(env).match(/data-cap-idx/g) || []).length; }

(async function () {
  console.log('\n4 — bootstrap sharing, latest query, zero-RPC typing, 50-cap');
  let env = pickerEnv({});
  env.picker.boot();
  ok(env.calls.length === 1 && env.calls[0].action === 'get_production_capability_catalog' &&
    JSON.stringify(env.calls[0].data) === '{}', 'one bootstrap catalog request with no search/limit payload');
  env.picker.open();
  env.picker.query('x');
  ok(env.calls.length === 1, 'overlapping opens share the single bootstrap request');
  function typePick(v) { env.elements.in.value = v; env.elements.in.fire('input'); }
  typePick('alpha');
  typePick('beta');
  env.calls[0].res(catResponse(['alpha item', 'beta item', 'other'], env.getNow()));
  await ticks();
  const last = env.seen.results[env.seen.results.length - 1];
  ok(last.total === 1 && listHtml(env).includes('beta item') && !listHtml(env).includes('alpha item'),
    'catalog arrival filters the latest query, not a captured old one');
  const rpcAfterArrival = env.calls.length;
  typePick('b'); typePick('be'); typePick('bet'); typePick('beta');
  env.elements.in.value = 'beta '; env.elements.in.fire('paste'); await ticks();
  typePick('');
  await ticks();
  ok(env.calls.length === rpcAfterArrival, 'fresh typing, paste and erase issue zero lookup RPCs');
  ok(env.seen.results[env.seen.results.length - 1].total === 3, 'erasing restores the full catalog locally');
  env = pickerEnv({});
  env.picker.boot();
  const sixty = Array.from({ length: 60 }, (_, i) => 'صنف ' + i);
  env.calls[0].res(catResponse(sixty, env.getNow()));
  await ticks();
  ok(optionCount(env) === 50 && env.picker.getState().total === 60, 'at most 50 options render with the true total kept');
  ok(listHtml(env).includes('عرض 50 من 60') && listHtml(env).includes('ضيّق البحث'),
    'capped lists carry an Arabic narrow-down instruction with rendered/total counts');
  ok(env.picker.getState().rendered === 50, 'state reports rendered/total separately');

  console.log('\n5 — keyboard, IME, pointer selection, committed-ID independence');
  env = pickerEnv({});
  env.picker.boot();
  env.calls[0].res(catResponse(['مادة لاصقة', 'صنف <img src=x> تجريبي', 'أخرى'], env.getNow()));
  await ticks();
  ok(listHtml(env).includes('&lt;img src=x&gt;') && !listHtml(env).includes('<img src=x>'),
    'markup-like names render safely escaped');
  env.picker.open();
  env.elements.in.fire('keydown', { key: 'ArrowDown', preventDefault() {} });
  ok(env.picker.getState().active === 0, 'ArrowDown arms the first option without committing');
  ok(env.seen.selects.length === 0, 'arming never commits a selection');
  env.elements.in.fire('keydown', { key: 'Enter', preventDefault() {} });
  ok(JSON.stringify(env.seen.selects[env.seen.selects.length - 1]) === JSON.stringify(['1', 'مادة لاصقة']),
    'Enter commits the stable ID of the current rendered result');
  env.elements.in.fire('compositionstart');
  env.elements.in.fire('keydown', { key: 'ArrowDown', preventDefault() {} });
  env.elements.in.fire('keydown', { key: 'Enter', preventDefault() {} });
  ok(env.seen.selects.length === 1, 'Enter during IME composition commits nothing');
  env.elements.in.fire('compositionend');
  const beforePointer = env.seen.selects.length;
  env.picker.query('صنف');
  await ticks();
  const firstNow = env.picker.getState();
  ok(firstNow.total === 1, 're-query re-renders the current result set');
  const target = { getAttribute: (k) => (k === 'data-cap-idx' ? '0' : null), parentNode: env.elements.list };
  env.elements.list.fire('click', { target });
  ok(env.seen.selects.length === beforePointer + 1 &&
    env.seen.selects[env.seen.selects.length - 1][0] === '2',
    'pointer selection resolves the current rendered ID, never a stale index');
  const selCount = env.seen.selects.length;
  env.picker.query('م'); env.picker.query('ما'); env.picker.query('');
  await ticks();
  ok(env.seen.selects.length === selCount, 'typing/clearing never clears or moves the committed selection');
  env.elements.in.fire('keydown', { key: 'Escape' });
  ok(env.picker.getState().open === false, 'Escape closes the dropdown');

  console.log('\n6 — freshness lifecycle');
  env = pickerEnv({ now0: 2000000 });
  env.picker.boot();
  env.calls[0].res(catResponse(['a'], 2000000, { _mysql: { read_at: 1999600, expires_at: 2002000, cache_hit: false } }));
  await ticks();
  ok(env.picker.getState().fresh === true, 'a fresh catalog is usable');
  env.setNow(2001999);
  ok(env.picker.getState().fresh === true, 'catalog stays fresh just before its deadline');
  env.setNow(2002000);
  ok(env.picker.getState().fresh === false, 'near-expiry server hits do not gain another TTL');
  env.picker.open();
  await ticks();
  ok(env.calls.length === 2, 'expiry while open on a visible page issues one replacement request');
  env = pickerEnv({ now0: 3000000 });
  env.picker.boot();
  env.calls[0].res(catResponse(['a'], 3000000));
  await ticks();
  env.picker.close();
  env.setNow(3000000 + 29600 + 1);
  await ticks();
  ok(env.calls.length === 1, 'an expired catalog issues no request while closed');
  env.picker.open();
  await ticks();
  ok(env.calls.length === 2, 'the next open refetches after expiry');
  env = pickerEnv({ now0: 4000000 });
  env.picker.boot();
  env.calls[0].res(catResponse(['a'], 3960000, { served_at: 3960000,
    _mysql: { read_at: 3959600, expires_at: 3960000, cache_hit: true } }));
  await ticks();
  ok(env.picker.getState().state === 'fallback' && env.calls.length === 2 &&
    env.calls[1].action === 'get_production_capability_products',
    'expired-on-arrival responses enter fallback with one current-query request');
  ok(listHtml(env).includes('البحث عبر الخادم'), 'fallback mode is visibly identified');
  env = pickerEnv({ now0: 5000000 });
  env.picker.boot();
  const noMeta = catResponse(['a'], 5000000); delete noMeta._mysql;
  env.calls[0].res(noMeta);
  await ticks();
  ok(env.picker.getState().state === 'fallback', 'invalid freshness metadata enters fallback, never a ready catalog');
  env = pickerEnv({ now0: 6000000 });
  env.picker.boot();
  env.calls[0].rej(new Error('transport boom'));
  await ticks();
  ok(env.picker.getState().state === 'fallback', 'transient transport errors enter fallback');
  env.picker.refresh();
  ok(env.calls.length === 3 && JSON.stringify(env.calls[2].data) === JSON.stringify({ refresh: true }),
    'explicit Refresh retries catalog mode with refresh:true');
  env.calls[2].res(catResponse(['a'], 6000000));
  await ticks();
  ok(env.picker.getState().state === 'ready' && env.seen.catalogs === 1, 'a forced refresh restores ready mode');
  env = pickerEnv({ now0: 7000000 });
  env.picker.boot();
  env.picker.query('a'); env.picker.query('ab'); env.picker.open();
  ok(env.calls.length === 1, 'no catalog retry storm while the bootstrap is in flight');
  env.picker.refresh(); env.picker.refresh();
  ok(env.calls.length === 2, 'repeated Refresh clicks share the same forced request');

  console.log('\n7 — refresh generation guards, invalidation, denials, removed IDs');
  env = pickerEnv({ now0: 8000000 });
  env.picker.boot();
  const firstCall = env.calls[0];
  env.picker.refresh();
  ok(env.calls.length === 2, 'refresh bypasses any coalescing with the older normal request');
  firstCall.res(catResponse(['stale'], 8000000));
  await ticks();
  ok(env.seen.catalogs === 0 && env.picker.getState().state === 'loading', 'an older success never repaints a newer refresh');
  env.calls[1].res(catResponse(['fresh'], 8000000));
  await ticks();
  ok(env.seen.catalogs === 1 && listHtml(env).includes('fresh'), 'the forced response wins');
  env = pickerEnv({ now0: 8100000 });
  env.picker.boot();
  const pending = env.calls[0];
  env.picker.query('x');
  env.picker.refresh();
  pending.rej(new Error('late failure'));
  await ticks();
  ok(env.picker.getState().state === 'loading', 'an older failure never repaints a newer refresh');
  env = pickerEnv({ now0: 8200000 });
  env.picker.boot();
  env.calls[0].res(catResponse(['a', 'b'], 8200000));
  await ticks();
  env.picker.invalidate('session');
  ok(env.picker.getState().catalogSize === 0 && env.picker.getState().rendered === 0 &&
    JSON.stringify(env.seen.invalidated) === JSON.stringify(['session']),
    'session invalidation clears catalog and results through the additive hook');
  env = pickerEnv({ now0: 8300000 });
  env.picker.boot();
  const late = env.calls[0];
  env.picker.invalidate('session');
  late.res(catResponse(['a'], 8300000));
  await ticks();
  ok(env.picker.getState().catalogSize === 0 && env.seen.catalogs === 0, 'late promises cannot repaint after invalidation');
  env = pickerEnv({ now0: 8400000 });
  env.picker.boot();
  env.calls[0].rej({ code: 'NOT_AUTHORIZED', message: 'denied' });
  await ticks();
  ok(env.picker.getState().state === 'error' && env.seen.denied === 1 && env.calls.length === 1,
    'permission denial clears data and never tries an alternate action');
  env = pickerEnv({ now0: 8500000 });
  env.picker.boot();
  env.calls[0].res(catResponse(['a'], 8500000));
  await ticks();
  env.picker.open();
  const rpcBeforeMutation = env.calls.length;
  env.picker.invalidate('mutation');
  await ticks();
  ok(env.calls.length === rpcBeforeMutation + 1, 'mutation expiry refetches once while open and visible');
  env = pickerEnv({ now0: 8600000, selectedId: '2', selectedName: '' });
  env.picker.boot();
  env.calls[0].res({ status: 'ok', schema_version: 1, products: [{ id: '1', name: 'one' }], count: 1,
    complete: true, overflow: false, reason: null, payload_bytes: 20, served_at: 8600000,
    _mysql: { read_at: 8599600, expires_at: 8629600, cache_hit: false } });
  await ticks();
  ok(env.seen.selectedId === '2' && env.elements.sel.textContent.includes('(missing)'),
    'a refreshed catalog that omits the selected ID retains it and marks it unavailable');

  console.log('\n8 — fallback behavior and rollout flags');
  env = pickerEnv({ now0: 9000000 });
  env.picker.boot();
  env.calls[0].res({ status: 'ok', schema_version: 1, products: [], count: 0, complete: false,
    overflow: true, reason: 'row_limit', payload_bytes: 2, served_at: 9000000,
    _mysql: { read_at: 8999600, expires_at: 9029600, cache_hit: false } });
  await ticks();
  ok(env.picker.getState().state === 'fallback' && env.calls.length === 2, 'overflow enters server-search mode');
  ok(JSON.stringify(env.calls[1].data).includes('"limit":100'), 'fallback keeps the existing limit:100 contract');
  env.calls[1].res({ status: 'ok', products: [{ id: '7', name: 'صنف' }], has_more: true });
  await ticks();
  ok(env.elements.status.innerHTML.includes('محدودة بـ100'), 'fallback keeps the has_more notice');
  env = pickerEnv({ now0: 9100000 });
  env.picker.boot();
  env.calls[0].rej(new Error('down'));
  await ticks();
  env.calls[1].res({ status: 'ok', products: [], has_more: false });
  await ticks();
  env.picker.query('');
  env.T.flush(280); await ticks();
  ok(env.calls[env.calls.length - 1].data.search === '', 'empty queries still search in fallback (no new minimum length)');
  env.picker.query('ق');
  env.T.flush(280); await ticks();
  ok(env.calls[env.calls.length - 1].data.search === 'ق', 'one-character queries still search in fallback');
  env = pickerEnv({ now0: 9200000 });
  env.picker.boot();
  env.calls[0].rej(new Error('down'));
  await ticks();
  env.picker.query('a');
  env.T.flush(280); await ticks();
  const fb1 = env.calls[env.calls.length - 1];
  env.picker.query('ab');
  env.T.flush(280); await ticks();
  const fb2 = env.calls[env.calls.length - 1];
  ok(fb1 !== fb2, 'distinct fallback queries issue distinct requests');
  fb2.res({ status: 'ok', products: [{ id: '2', name: 'ab item' }], has_more: false });
  await ticks();
  fb1.res({ status: 'ok', products: [{ id: '1', name: 'a item' }], has_more: false });
  await ticks();
  ok(listHtml(env).includes('ab item') && !listHtml(env).includes('a item'),
    'late fallback responses cannot repaint a newer query (success, failure and shared-promise paths guarded)');
  env = pickerEnv({ now0: 9300000 });
  env.picker.boot();
  env.calls[0].rej(new Error('down'));
  await ticks();
  env.picker.query('a');
  env.T.flush(280); await ticks();
  env.calls[env.calls.length - 1].rej({ code: 'SESSION_EXPIRED', message: 'gone' });
  await ticks();
  ok(env.picker.getState().state === 'error' && env.seen.denied === 1, 'fallback denial uses denial handling, never another action');
  const rpcAfterDenial = env.calls.length;
  env.picker.query('ab');
  env.T.flush(280); await ticks();
  ok(env.calls.length === rpcAfterDenial, 'no fallback requests after denial');
  const off = pickerEnv({ enabled: false, now0: 9400000 });
  off.picker.boot();
  await ticks();
  ok(off.calls.length === 1 && off.calls[0].action === 'get_production_capability_products' &&
    !off.calls.some((c) => c.action === 'get_production_capability_catalog'),
    'disabled flag means server search and no catalog request');
  off.picker.query('x');
  await ticks();
  ok(off.calls.length === 1, 'disabled mode debounces instead of filtering instantly');
  off.T.flush(280); await ticks();
  ok(off.calls.length === 2, 'disabled typing still searches after debounce');
  ok(/get_production_capability_catalog get_sales_capacity_catalog/.test(
    client.match(/var reads = \(([^;]+)\)\.split/)[1]),
    'both catalog actions join the existing MySQL read deduplicator');
  ok(/API\._notifyCapabilityPickers = function/.test(client), 'additive picker-invalidation helper exists');
  ok(/API\.setSession = function[\s\S]{0,200}_notifyCapabilityPickers\('session'\)/.test(client) &&
    /API\.clearSession = function[\s\S]{0,200}_notifyCapabilityPickers\('session'\)/.test(client),
    'session set/clear invalidate mounted pickers');
  ok(/_notifyCapabilityPickers\('mutation'\)/.test(client), 'relevant mutations expire picker catalogs');
  ok(/_notifyCapabilityPickers\('denial'\)/.test(client), 'observed permission/session failures invalidate pickers');

  console.log('\n9 — page wiring, flags and preserved calculations');
  ok(/tc_production_capability:\s*true/.test(pickerBlock) && /tc_sales_capacity:\s*false/.test(pickerBlock),
    'prepared source defaults: production on, sales off');
  ok(prodPage.includes("catalogAction: 'get_production_capability_catalog'") &&
    prodPage.includes("fallbackAction: 'get_production_capability_products'") &&
    prodPage.includes('TC_CAPABILITY_LOCAL_PICKER_FLAGS.tc_production_capability') &&
    prodPage.includes('picker.boot()'),
    'production page integrates the shared picker with its own actions and flag');
  ok(salesPage.includes("catalogAction: 'get_sales_capacity_catalog'") &&
    salesPage.includes("fallbackAction: 'get_sales_capacity_products'") &&
    salesPage.includes('TC_CAPABILITY_LOCAL_PICKER_FLAGS.tc_sales_capacity') &&
    salesPage.includes('picker.boot()'),
    'sales page integrates the shared picker with its own actions and flag');
  ok(prodPage.includes('getQueryGen') && prodPage.includes('isComposing') &&
    salesPage.includes('getQueryGen') && salesPage.includes('isComposing'),
    'both pages guard detail repaint with the selection-time query generation and IME state');
  ok(prodPage.includes('fromDetail || (fromList') && salesPage.includes('fromDetail || (fromList'),
    'both pages prefer the current detail name over older catalog/saved labels');
  ok(prodPage.includes('onSelect: function (id, name) { selectProduct(id, true, name); }') &&
    salesPage.includes('onSelect: function (id, name) { selectProduct(id, true, name); }'),
    'click selection passes the stable ID with its full name immediately');
  ok(prodPage.includes('غير متاح في الكتالوج الحالي') && salesPage.includes('غير متاح في الكتالوج الحالي'),
    'both pages retain (never silently replace) IDs missing from a refreshed catalog');
  ok(prodPage.includes('role="combobox"') && prodPage.includes('role="listbox"') &&
    salesPage.includes('role="combobox"') && salesPage.includes('role="listbox"'),
    'combobox/listbox wiring is preserved on both pages');
  ok(salesPage.includes("badClass: 'sc-bad'") && prodPage.includes("badClass: 'pc-bad'"),
    'picker error styling uses each page-owned class');
  ok(!/pickerCache|pickerSeq|pickerTimer|setPickerStatus|searchProducts\(false/.test(prodPage) &&
    !/pickerCache|pickerSeq|pickerTimer|setPickerStatus|searchProducts\(false/.test(salesPage),
    'legacy per-query RPC state is gone from both pages; the picker owns fetching');
  ok(/companyCall\('get_production_capability_products'/.test(pickerBlock) === false,
    'the shared controller never hardcodes page actions (sanity)');
  const pcalc = extractFunction(prodPage, 'calculatePlan'), pparse = extractFunction(prodPage, 'parseQty');
  const pbox = { Number, Math, String, Array, Object };
  pbox.detailSeq = 2; pbox.S = { selectedId: '22', rows: [] };
  vm.createContext(pbox);
  vm.runInContext([pparse, pcalc].join('\n'), pbox);
  const plan = vm.runInContext("calculatePlan([{used_product_id:'1',required_qty_per_unit:'2.5',current_stock:'120'}],'100',false)", pbox);
  ok(plan.items[0].needed === 250 && plan.capacity === 48, 'planning math is unchanged by the picker integration');
  console.log('\n10 — stubbed-browser page runs: both pages, both flag modes, detail races');
  function pageEnv(pageSrc, flagOverrides) {
    const scripts = Array.from(pageSrc.matchAll(/<script>([\s\S]*?)<\/script>/g));
    const code = scripts[scripts.length - 1][1].replace(/<\?[\s\S]*?\?>/g, '');
    const T = makeTimers();
    const calls = [];
    const elements = {};
    const element = (id) => (elements[id] = elements[id] || makeEl(id));
    const doc = {
      visibilityState: 'visible', readyState: 'complete', _listeners: {},
      addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
      removeEventListener() {},
      getElementById: element,
      createElement: () => makeEl('dyn'),
      querySelector: () => null
    };
    const store = {};
    const sb = { URLSearchParams, Promise, Date, Math, Number, String, Object, Array, Error, isFinite, Intl,
      setTimeout: T.setTimeout, clearTimeout: T.clearTimeout,
      window: { scriptUrl: '/', location: { search: '' }, TOPCHEMICAL_MENU: [] },
      document: doc, navigator: {},
      localStorage: { getItem: (k) => (store[k] != null ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      API: { getSession: () => ({}),
        call: (action, payload) => new Promise((res, rej) => calls.push({ action, payload, res, rej })) },
      FMT: { escape: escTest },
      UIC: {} };
    vm.createContext(sb);
    vm.runInContext(pickerBlock, sb);
    if (flagOverrides) Object.assign(sb.UIC.TC_CAPABILITY_LOCAL_PICKER_FLAGS, flagOverrides);
    sb.UIC.appShell = function () {};
    sb.UIC.navTo = function () {};
    vm.runInContext(code, sb);
    return { sb, calls, T, elements, doc, store };
  }
  function detailRes(id, name) {
    return { status: 'ok',
      rows: [{ manufacture_product_id: String(id), manufacture_product_name: name, total_produced: '5',
        manufacture_order_count: '1', used_product_id: '11', used_product_name: 'مادة 11',
        used_product_category_id: '4', used_product_category: 'فئة', total_used: '2',
        required_qty_per_mo: '3', required_qty_per_unit: '2', required_qty_per_single_mo: '2',
        current_stock: '100', production_capability: '50' }],
      truncated: false, product_current_quantity: '10', product_unit_metric: '2', product_unit: 'علبة' };
  }
  function modActions(env) { return env.calls.map((c) => c.payload.module_action); }
  function findCall(env, action, id) {
    return env.calls.filter((c) => c.payload.module_action === action &&
      (!id || String(c.payload.data.id) === String(id)));
  }
  // Production page, flag on (prepared default).
  let penv = pageEnv(prodPage, null);
  ok(modActions(penv).includes('get_production_capability_catalog') &&
    !modActions(penv).includes('get_production_capability_products'),
    'production boot (flag on) fires one catalog request, no per-term search');
  const pcat = findCall(penv, 'get_production_capability_catalog')[0];
  pcat.res(catResponse(['منتج أ', 'منتج ب'], 1000000));
  await ticks();
  ok(penv.elements['pc-product-options'].innerHTML.includes('منتج أ') &&
    penv.elements['pc-product-options'].innerHTML.includes('منتج ب'),
    'production catalog arrival renders matching options');
  const rpcBeforeType = penv.calls.length;
  penv.elements['pc-search'].value = 'ب';
  penv.elements['pc-search'].fire('input');
  await ticks();
  ok(penv.calls.length === rpcBeforeType &&
    penv.elements['pc-product-options'].innerHTML.includes('منتج ب') &&
    !penv.elements['pc-product-options'].innerHTML.includes('منتج أ'),
    'production typing filters locally with zero RPCs');
  penv.elements['pc-product-options'].fire('click', {
    target: { getAttribute: (k) => (k === 'data-cap-idx' ? '0' : null),
      parentNode: penv.elements['pc-product-options'] }
  });
  await ticks();
  ok(findCall(penv, 'get_production_capability_rows', '2').length === 1 &&
    penv.elements['pc-search'].value === 'منتج ب',
    'pointer selection commits the stable ID and loads its detail');
  findCall(penv, 'get_production_capability_rows', '2')[0].res(detailRes('2', 'منتج ب (محدّث)'));
  await ticks();
  ok(penv.elements['pc-search'].value === 'منتج ب (محدّث)',
    'the current detail name wins over the older catalog label when the query is untouched');
  // Required race: select A, type B, resolve A detail — B stays.
  penv.sb.selectProduct('7', true, 'منتج أ');
  await ticks();
  penv.elements['pc-search'].value = 'نص-ب';
  penv.elements['pc-search'].fire('input');
  await ticks();
  findCall(penv, 'get_production_capability_rows', '7').slice(-1)[0].res(detailRes('7', 'منتج أ'));
  await ticks();
  ok(penv.elements['pc-search'].value === 'نص-ب' &&
    penv.elements['pc-content-panels'].innerHTML.includes('منتج أ'),
    'select A, type B, resolve A: A panels may update but query/results remain B');
  // Required race: select A then C, resolve C then A — A cannot repaint.
  penv.sb.selectProduct('7', true, 'منتج أ');
  await ticks();
  penv.sb.selectProduct('9', true, 'منتج ب');
  await ticks();
  const dCalls = findCall(penv, 'get_production_capability_rows');
  dCalls[dCalls.length - 1].res(detailRes('9', 'منتج ب'));
  await ticks();
  dCalls[dCalls.length - 2].res(detailRes('7', 'منتج أ'));
  await ticks();
  ok(penv.elements['pc-content-panels'].innerHTML.includes('#9') &&
    penv.elements['pc-selected-product'].textContent.includes('منتج ب'),
    'out-of-order detail responses cannot repaint a newer selection');
  // Sales page, flag off (prepared default): pure server search, no catalog.
  let senv = pageEnv(salesPage, null);
  ok(modActions(senv).includes('get_sales_capacity_products') &&
    !modActions(senv).some((a) => a === 'get_sales_capacity_catalog'),
    'sales boot (flag off) uses server search and sends no catalog request');
  findCall(senv, 'get_sales_capacity_products')[0].res({ status: 'ok',
    products: [{ id: '5', name: 'صنف ج' }], has_more: false });
  await ticks();
  senv.elements['sc-search'].value = 'صنف';
  senv.elements['sc-search'].fire('input');
  await ticks();
  ok(!modActions(senv).some((a) => a === 'get_sales_capacity_catalog'),
    'sales typing with the flag off never requests a catalog');
  senv.T.flush(280); await ticks();
  ok(findCall(senv, 'get_sales_capacity_products').length === 2, 'sales typing searches after debounce');
  // Sales page, flag forced on: catalog mode works there too.
  senv = pageEnv(salesPage, { tc_sales_capacity: true });
  ok(modActions(senv).includes('get_sales_capacity_catalog'),
    'sales boot with the flag on fires the sales catalog request');
  findCall(senv, 'get_sales_capacity_catalog')[0].res(catResponse(['صنف س'], 1000000));
  await ticks();
  ok(senv.elements['sc-product-options'].innerHTML.includes('صنف س'), 'sales catalog arrival renders locally');
  // Production page, flag forced off: server search, no catalog.
  penv = pageEnv(prodPage, { tc_production_capability: false });
  ok(modActions(penv).includes('get_production_capability_products') &&
    !modActions(penv).some((a) => a === 'get_production_capability_catalog'),
    'production boot with the flag off restores server search without a catalog request');

  console.log('\ntc_capability_picker: ' + checks + ' checks passed');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
