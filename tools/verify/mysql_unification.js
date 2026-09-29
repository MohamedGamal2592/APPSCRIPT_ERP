'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const code = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
const actions = fs.readFileSync(path.join(ROOT, 'Company_TopChemical_Actions.js'), 'utf8');
const client = fs.readFileSync(path.join(ROOT, 'Client_Helpers.html'), 'utf8');

function fn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing ' + name);
  const open = src.indexOf('{', start); let d = 0, quote = '', esc = false, line = false, block = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === quote) quote = ''; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error('unclosed function ' + name);
}
let checks = 0;
function check(value, label) { assert(value, label); checks++; console.log('  PASS  ' + label); }

console.log('\nMySQL shared execution — fake JDBC');
const start = code.indexOf('var _mysqlRequest_ = null;');
const end = code.indexOf('\nfunction dbOpenConnection_', start);
assert(start >= 0 && end > start, 'shared server execution source found');
const entries = new Map(), props = new Map(), log = { opens: 0, closes: 0, stmtCloses: 0, rsCloses: 0, reads: 0, sql: [], values: [] };
let failCacheRead = false, failSql = false, uuid = 0;
const user = { canRead: true, authorizedPages: { tc_main_review: 'read' } };
const sb = {
  JSON, Date, Math, Number, Object, Array, String, Error, isFinite, Uint8Array,
  DBLIVE_CONFIG: { props: { host: 'h', port: 'p', database: 'd' }, host: 'host', port: 3306, database: 'db' },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props.get(k) || null,
    setProperty: (k, v) => { props.set(k, String(v)); }
  }) },
  Utilities: {
    Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (alg, value) => Array.from(crypto.createHash('sha256').update(value).digest()).map(x => x > 127 ? x - 256 : x),
    getUuid: () => 'epoch-' + (++uuid)
  },
  Logger: { log: v => log.sql.push(String(v)) },
  CacheService: { getScriptCache: () => ({
    get: k => { if (k === 'MYSQL_READ_EPOCH_FALLBACK') return entries.get(k) || null; return null; },
    put: (k, v) => { entries.set(k, String(v)); }
  }) },
  getChunkedCache_: k => { log.reads++; if (failCacheRead) throw new Error('offline'); return entries.get(k) || null; },
  putChunkedCache_: (k, v) => { entries.set(k, JSON.parse(JSON.stringify(v))); return true; },
  dbOpenConnection_: () => {
    log.opens++;
    return {
      prepareStatement: sql => {
        log.sql.push(sql); const binds = [];
        return {
          setObject: (i, v) => { binds[i - 1] = v; },
          executeQuery: () => {
            if (failSql) throw new Error('driver message with sensitive details');
            log.values.push(binds.slice()); let i = -1;
            return { next: () => ++i < 1, getObject: n => n === 1 ? 'row' : null, close: () => { log.rsCloses++; } };
          },
          executeUpdate: () => 1,
          close: () => { log.stmtCloses++; }
        };
      }, close: () => { log.closes++; }
    };
  },
  console
};
vm.createContext(sb);
vm.runInContext(code.slice(start, end) + '\n' + fn(code, 'dbGetConnection_'), sb);
vm.runInContext(`
function definition() { return { name:'tc.test_lookup', version:3, ttl:60, dependencies:['products'],
  normalize:function(p){ return { ids:(p.ids||[]).map(String).filter(function(v,i,a){return a.indexOf(v)===i;}).sort()}; },
  authorize:function(r){ if (!r.user.canRead) throw new Error('denied'); },
  valid:function(v){ return !!(v && v.status === 'ok' && Array.isArray(v.rows)); }
}; }
function execute(ids, principal) {
  return mysqlWithRequest_('topchemical:sheet-1', principal || ${JSON.stringify(user)}, 'get_main_review', function(){
    return mysqlRead_(definition(), {ids:ids}, function(p){
      var c=dbGetConnection_(), s=c.prepareStatement('SELECT id FROM products WHERE id IN (?)');
      s.setObject(1,p.ids.join(',')); var r=s.executeQuery(), rows=[];
      while(r.next()) rows.push(r.getObject(1));
      return {status:'ok', rows:rows, filters:p.ids};
    });
  });
}
`, sb);
const run = (expr) => vm.runInContext(expr, sb);
const first = run("execute(['2','1','1'])");
check(first.filters.join(',') === '1,2' && log.opens === 1, 'canonical filter sets bind in stable order on a cache miss');
check(log.closes === 1 && log.stmtCloses === 1 && log.rsCloses === 1, 'connection, statement and result set close after a successful read');
const opens = log.opens;
const second = run("execute(['1','2'])");
check(log.opens === opens && second._mysql.cache_hit === true, 'equivalent filters reuse a successful result');
run("execute(['2','1'], {canRead:true, authorizedPages:{tc_main_review:'write'}})");
check(log.opens === opens + 1, 'permission scope changes isolate cache entries');
const reads = log.reads;
let denied = false; try { run("execute(['1'], {canRead:false})"); } catch (e) { denied = true; }
check(denied && log.reads === reads && log.opens === opens + 1, 'authorization is checked before cache access or JDBC');
const cacheKeys = Array.from(entries.keys()).filter(k => k.startsWith('mysql_'));
entries.set(cacheKeys[0], { broken: true });
run("execute(['2','1','1'])");
check(log.opens === opens + 2, 'corrupt cached entries fall back to a fresh read');
failCacheRead = true; run("execute(['fresh-cache-outage'])"); failCacheRead = false;
check(log.opens === opens + 3, 'cache-service failures fall back to a fresh read');
const closes = [log.closes, log.stmtCloses, log.rsCloses];
failSql = true; let sanitized = '';
try { run("execute(['sql-error'])"); } catch (e) { sanitized = String(e.message); }
failSql = false;
check(log.closes === closes[0] + 1 && log.stmtCloses === closes[1] + 1 && log.rsCloses === closes[2], 'connections and statements close after SQL errors');
check(!/sensitive details/.test(sanitized), 'SQL parameter or driver details do not reach diagnostic errors');
const cachedBeforeWrite = log.opens;
run(`mysqlWithRequest_('topchemical:sheet-1', ${JSON.stringify(user)}, 'save_product_live', function(){
  var c=dbGetConnection_(), s=c.prepareStatement('UPDATE products SET name = ? WHERE id = ?');
  s.setObject(1,'private'); s.setObject(2,'1'); return s.executeUpdate();
});`);
run("execute(['2','1','1'])");
check(log.opens === cachedBeforeWrite + 2, 'a successful application write bumps the shared cache epoch');
check(log.sql.every(x => !/private|sensitive details/.test(x)), 'diagnostics retain query shape without parameter values');

console.log('\nBrowser MySQL read coordination');
const clientStart = client.indexOf('API._mysqlReads = (function () {');
const clientEnd = client.indexOf('\n})();\n\nAPI._dispatch', clientStart);
assert(clientStart >= 0 && clientEnd > clientStart, 'browser coordinator source found');
let dispatched = 0, settle;
const api = { _coord: { submit: () => { dispatched++; return new Promise(resolve => { settle = resolve; }); } }, _dispatch: () => {} };
const cb = { API: api, JSON, Promise, Date, Object, Array, Math, String, Error };
vm.createContext(cb); vm.runInContext(client.slice(clientStart, clientEnd + 5), cb);
const payload = { target_system: 'company', module_action: 'get_box_analysis', data: { ids:['2','1'] } };
cb.API._mysqlReads.scope('session-a', 'company');
const shared1 = cb.API._mysqlReads.call('company_action', payload, 'session-a');
const shared2 = cb.API._mysqlReads.call('company_action', payload, 'session-a');
check(shared1 === shared2 && dispatched === 1, 'identical in-flight read requests share one bounded RPC');
cb.API._mysqlReads.scope('session-b', 'company');
settle({ status:'ok', products:[] });

shared1.then(() => { throw new Error("outdated scope unexpectedly accepted"); }, e => {
  check(e.code === "MYSQL_SCOPE_CHANGED", "late results from a previous session scope are discarded");
}).then(() => {
  console.log("mysql_unification: PASS (" + checks + " assertions; fake JDBC only; no production latency claim)");
}).catch(e => { console.error(e); process.exitCode = 1; });
