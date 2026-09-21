/**
 * A deliberately small Apps Script stub, just large enough to let the REAL
 * server sources (Code.js, Code.js, Code.js) be loaded and
 * executed under node.
 *
 * It is the same idea as domstub.js/pageharness.js, pointed at Google's services
 * instead of the DOM. It exists because the authority change this run makes is
 * about cache SEMANTICS, and source-text matching cannot prove that an
 * invalidation actually invalidates. The only way to prove that offline is to
 * run the real functions against a cache you control.
 *
 * What it gives you:
 *   - CacheService.getScriptCache() over a Map, honouring TTL against a
 *     CONTROLLABLE clock, with evict(key) and failNextPut() hooks. It rejects a
 *     TTL over 21600 exactly as the real service does.
 *   - PropertiesService.getScriptProperties() over a Map, with failNextSet(),
 *     and a write counter so "never writes Properties" is testable.
 *   - A settable NOW, so a staleness-ceiling bucket rollover can be tested
 *     without waiting for one.
 *   - Sheet-touching leaves replaced by stubs (getSheet_, getSpreadsheet_,
 *     getAllRecords_, getHeaders_, ensureSystemWorkSheet_, readSystemWorkFlag_,
 *     noteMutation_) so everything ABOVE them is the project's real code.
 *
 * getRefsCached_ is deliberately NOT stubbed by default: the real one, with its
 * real chunking (getChunkedCache_/putChunkedCache_), runs against the stub
 * cache. Pass { stubRefsCache: true } to replace it with a flat equivalent.
 *
 * Nothing here touches a spreadsheet, a Google service or the network.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCES = ['Code.js'];
const CACHE_MAX_TTL = 21600;
const RealDate = Date;

/**
 * @param {object} [opts]
 * @param {number}  [opts.now]           starting clock, ms since epoch
 * @param {boolean} [opts.stubRefsCache] replace the real getRefsCached_
 * @param {string[]} [opts.sources]      extra project files to load after Code.js
 * @param {object} [opts.workbook]       a workbook stub from vf_workbook_stub.js.
 *        When supplied, the REAL getSheet_/getSpreadsheet_/getHeaders_/
 *        getAllRecords_ run against it (they need getParent/getSheetId/
 *        getLastColumn, which the fixtures below do not implement), and the
 *        sheet-touching leaf replacements are not installed.
 * @param {function} [opts.transformSource] (filename, source) => source, applied
 *        while loading. A harness uses it to simulate a source edit — a flag
 *        flip, say — in memory. No file is ever written.
 * @return {object} the harness
 */
function createHarness(opts) {
  opts = opts || {};
  const sources = SOURCES.concat(opts.sources || []);

  const H = {
    now: typeof opts.now === 'number' ? opts.now : 1700000000000,
    /* cache: key -> { value, ttl, putAt } */
    cacheStore: new Map(),
    propsStore: new Map(),
    propWrites: 0,
    _failPut: 0,
    _failSet: 0,
    /* what the stubbed sheets return */
    users: [],                       // records for ERP_Users
    companies: [                    // rows for ERP_Companies used by live gate fixtures
      { company_unique_id: 'NewCo', company_name_ar: 'NewCo', company_name_en: 'NewCo', company_sheet_link: 'new-db', enabled: true },
      { company_unique_id: 'OldCo', company_name_ar: 'OldCo', company_name_en: 'OldCo', company_sheet_link: 'old-db', enabled: true },
      { company_unique_id: 'VF', company_name_ar: 'VF', company_name_en: 'VF', company_sheet_link: 'vf-db', enabled: true }
    ],
    matrix: { headers: [], rows: [] },
    killFlag: 1,                     // what readSystemWorkFlag_ returns
    ensureThrows: false,             // make ensureSystemWorkSheet_ throw
    /* observability */
    reads: { users: 0, matrix: 0, b2: 0 },
    logs: []
  };

  /* ── clock ─────────────────────────────────────────────────────────────── */
  H.setNow = function (ms) { H.now = ms; };
  H.advance = function (ms) { H.now += ms; };

  function StubDate() {
    if (arguments.length === 0) return new RealDate(H.now);
    const args = Array.prototype.slice.call(arguments);
    return new (Function.prototype.bind.apply(RealDate, [null].concat(args)))();
  }
  StubDate.now = function () { return H.now; };
  StubDate.parse = RealDate.parse;
  StubDate.UTC = RealDate.UTC;
  StubDate.prototype = RealDate.prototype;

  /* ── CacheService ──────────────────────────────────────────────────────── */
  function expired(entry) { return H.now >= entry.putAt + entry.ttl * 1000; }

  function cacheGet(key) {
    const e = H.cacheStore.get(String(key));
    if (!e) return null;
    if (expired(e)) { H.cacheStore.delete(String(key)); return null; }
    return e.value;
  }

  function cachePut(key, value, ttl) {
    if (H._failPut > 0) { H._failPut--; throw new Error('stub: CacheService.put failed'); }
    let t = ttl === undefined || ttl === null ? 600 : Number(ttl);
    /* The real service rejects anything over six hours. Surfacing that as a
     * throw is the point: a future TTL raise past the cap must not pass silently. */
    if (!(t > 0)) throw new Error('stub: invalid cache TTL ' + ttl);
    if (t > CACHE_MAX_TTL) throw new Error('stub: cache TTL ' + t + ' exceeds the 21600s maximum');
    H.cacheStore.set(String(key), { value: String(value), ttl: t, putAt: H.now });
  }

  const scriptCache = {
    get: cacheGet,
    put: cachePut,
    remove: function (key) { H.cacheStore.delete(String(key)); },
    getAll: function (keys) {
      const out = {};
      (keys || []).forEach(function (k) { const v = cacheGet(k); if (v !== null) out[String(k)] = v; });
      return out;
    },
    putAll: function (obj, ttl) { for (const k in obj) cachePut(k, obj[k], ttl); },
    removeAll: function (keys) { (keys || []).forEach(function (k) { H.cacheStore.delete(String(k)); }); }
  };

  H.evict = function (key) { H.cacheStore.delete(String(key)); };
  H.failNextPut = function (n) { H._failPut = n === undefined ? 1 : n; };
  H.ttlOf = function (key) { const e = H.cacheStore.get(String(key)); return e ? e.ttl : null; };
  H.rawGet = function (key) { const e = H.cacheStore.get(String(key)); return e ? e.value : null; };
  H.cacheKeys = function () { return Array.from(H.cacheStore.keys()); };
  H.clearCache = function () { H.cacheStore.clear(); };

  /* ── PropertiesService ─────────────────────────────────────────────────── */
  const scriptProps = {
    getProperty: function (k) { return H.propsStore.has(String(k)) ? H.propsStore.get(String(k)) : null; },
    setProperty: function (k, v) {
      if (H._failSet > 0) { H._failSet--; throw new Error('stub: PropertiesService.setProperty failed'); }
      H.propWrites++;
      H.propsStore.set(String(k), String(v));
      return scriptProps;
    },
    deleteProperty: function (k) { H.propsStore.delete(String(k)); return scriptProps; },
    getProperties: function () { const o = {}; H.propsStore.forEach(function (v, k) { o[k] = v; }); return o; }
  };

  H.failNextSet = function (n) { H._failSet = n === undefined ? 1 : n; };
  H.setProp = function (k, v) { H.propsStore.set(String(k), String(v)); };   // seed without counting a write
  H.getProp = function (k) { return H.propsStore.has(String(k)) ? H.propsStore.get(String(k)) : null; };

  /* ── the sandbox ───────────────────────────────────────────────────────── */
  const sandbox = {
    Date: StubDate,
    JSON: JSON,
    Math: Math,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Object: Object,
    Array: Array,
    Error: Error,
    RegExp: RegExp,
    isNaN: isNaN,
    parseInt: parseInt,
    parseFloat: parseFloat,
    console: {
      log: function () { H.logs.push(['log'].concat(Array.prototype.slice.call(arguments)).join(' ')); },
      warn: function () { H.logs.push(['warn'].concat(Array.prototype.slice.call(arguments)).join(' ')); },
      error: function () { H.logs.push(['error'].concat(Array.prototype.slice.call(arguments)).join(' ')); }
    },
    CacheService: { getScriptCache: function () { return scriptCache; }, getUserCache: function () { return scriptCache; } },
    PropertiesService: {
      getScriptProperties: function () { return scriptProps; },
      getUserProperties: function () { return scriptProps; }
    },
    Utilities: {
      getUuid: function () { return 'uuid-' + (H.now++); },
      computeDigest: function (alg, s) {
        let h = 0; const str = String(s);
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
        return [(h >> 24) & 255, (h >> 16) & 255, (h >> 8) & 255, h & 255];
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      sleep: function () {}
    },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, waitLock: function () {}, releaseLock: function () {} }; } },
    SpreadsheetApp: opts.workbook ? opts.workbook.SpreadsheetApp : { openById: function () { throw new Error('stub: no spreadsheet'); } },
    Sheets: opts.workbook ? opts.workbook.Sheets : undefined,
    ScriptApp: { getProjectTriggers: function () { return []; } },
    Session: { getActiveUser: function () { return { getEmail: function () { return ''; } }; } },
    Logger: { log: function () { H.logs.push(['logger'].concat(Array.prototype.slice.call(arguments)).join(' ')); } }
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  H.ctx = ctx;

  /* ── load the real sources ─────────────────────────────────────────────── */
  sources.forEach(function (f) {
    const p = path.isAbsolute(f) ? f : path.join(ROOT, f);
    const loaded = fs.readFileSync(p, 'utf8');
    const src = typeof opts.transformSource === 'function' ? opts.transformSource(f, loaded) : loaded;
    vm.runInContext(src, ctx, { filename: f });
  });

  /* ── replace only the leaves that would touch a spreadsheet ──────────────
   * In workbook mode the real data layer runs instead: the workbook stub is
   * complete enough for getSheet_/getHeaders_/getAllRecords_, and replacing
   * them would hide exactly the code a harness exists to execute. */
  if (!opts.workbook) {
    function companiesSheet() {
      const headers = ['company_unique_id', 'company_name_ar', 'company_name_en', 'company_sheet_link', 'enabled'];
      const rows = H.companies.map(function (c) { return headers.map(function (h) { return c[h]; }); });
      return {
        __headers: headers.slice(),
        getName: function () { return 'ERP_Companies'; },
        getDataRange: function () { return { getValues: function () { return [headers.slice()].concat(rows.map(function (r) { return r.slice(); })); } }; }
      };
    }

    function matrixSheet() {
      H.reads.matrix++;
      return {
        __headers: H.matrix.headers.slice(),
        getName: function () { return 'ERP_Pages_Matrix'; },
        getDataRange: function () {
          return { getValues: function () { return [H.matrix.headers.slice()].concat(H.matrix.rows.map(function (r) { return r.slice(); })); } };
        }
      };
    }

    ctx.getSheet_ = function (sheetName) {
      if (sheetName === 'ERP_Companies') return companiesSheet();
      if (sheetName === 'ERP_Pages_Matrix') return matrixSheet();
      throw new Error('stub: getSheet_ has no fixture for ' + sheetName);
    };
    ctx.getSpreadsheet_ = function () { throw new Error('stub: getSpreadsheet_ is not available'); };
    ctx.getHeaders_ = function (sheet) { return (sheet && sheet.__headers) ? sheet.__headers.slice() : []; };
    ctx.getAllRecords_ = function (dbId, sheetName) {
      if (sheetName === 'ERP_Users') { H.reads.users++; return H.users.map(function (u) { return Object.assign({}, u); }); }
      return [];
    };
  }
  /* Code.js now contains the Firestore-backed system store. Keep the
     authority harness offline by replacing that leaf with the same fixtures
     used by the legacy Sheets compatibility path. */
  ctx.systemGetAllRecords_ = function (tableName) {
    if (tableName === 'ERP_Users') { H.reads.users++; return H.users.map(function (u) { return Object.assign({}, u); }); }
    if (tableName === 'ERP_Companies') return H.companies.map(function (c) { return Object.assign({}, c); });
    if (tableName === 'ERP_Pages_Matrix') {
      var matrix = ctx.getSheet_('ERP_Pages_Matrix');
      var values = matrix.getDataRange().getValues();
      var headers = values.shift() || [];
      return values.map(function (row) {
        var out = {};
        headers.forEach(function (header, i) { out[String(header).trim()] = row[i]; });
        return out;
      });
    }
    return [];
  };
  ctx.noteMutation_ = function () {};
  /* The real counter is kept in workbook mode: harnesses report the project's
   * own sheet-read metric, not a stub's approximation of it. */
  if (!opts.workbook) ctx.countSheetRead_ = function () {};
  ctx.ensureSystemWorkSheet_ = function () {
    if (H.ensureThrows) throw new Error('stub: ensureSystemWorkSheet_ failed');
    return { getName: function () { return 'ERP_system_work'; } };
  };
  ctx.readSystemWorkFlag_ = function () {
    H.reads.b2++;
    if (H.killFlag === 'throw') throw new Error('stub: readSystemWorkFlag_ failed');
    return H.killFlag;
  };

  if (opts.stubRefsCache) {
    /* Flat equivalent of the real getRefsCached_ — same key shape, same TTL,
     * no chunking. Only for tests that want the key without the manifest. */
    ctx.getRefsCached_ = function (dbId, kind, ttlSeconds, builder) {
      const key = 'refs_' + String(dbId) + '_' + String(kind);
      try { const c = scriptCache.get(key); if (c !== null) return JSON.parse(c); } catch (e) {}
      const value = builder();
      try { scriptCache.put(key, JSON.stringify(value), ttlSeconds); } catch (e) {}
      return value;
    };
  }

  /* ── convenience accessors ─────────────────────────────────────────────── */
  H.call = function (name) {
    const args = Array.prototype.slice.call(arguments, 1);
    return ctx[name].apply(null, args);
  };
  /* CONFIG is a top-level `const`, so it lives in the context's lexical scope
   * and is not a property of the sandbox object. Reach it by evaluating. */
  H.config = function () { return vm.runInContext('CONFIG', ctx); };
  H.eval = function (code) { return vm.runInContext(code, ctx); };
  /* Global function declarations in one canonical Code.js script keep their
     lexical binding, whereas the legacy multi-file harness replaced a global
     property. This bridge preserves the old test seam explicitly. */
  H.override = function (name, fn) {
    ctx.__codexOverride = fn;
    vm.runInContext(String(name) + ' = globalThis.__codexOverride;', ctx);
  };

  /** Replace SessionManager_.validate with a fixture. */
  H.setSession = function (v) { ctx.SessionManager_.validate = function () { return v; }; };

  /** What resetRecordCache_ does at the top of every real request. */
  H.newExecution = function () { ctx.resetRecordCache_(); };

  return H;
}

module.exports = { createHarness: createHarness, ROOT: ROOT, SOURCES: SOURCES, CACHE_MAX_TTL: CACHE_MAX_TTL };

