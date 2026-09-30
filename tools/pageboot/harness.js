/**
 * Page boot — the page harness shared by inventory.js and tests/pages.js.
 *
 * runPage(page, opts) RUNS a page's own <script> blocks in a vm with stubs and
 * records every request it makes (route + payload + wave + via). Replies are
 * held, so a run sees the first wave; opts.secondWave answers them (with
 * opts.reply(), default a catch-all stub) and records what follows as wave 2.
 * opts.boot (a __PAGE_BOOT__ config) + opts.runtime (Page_Boot.html's script)
 * install the real client runtime first, and API.call then asks
 * PageBoot.answer before «sending» — a call answered from the page is
 * recorded with via 'boot'.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const HTML_HOOK = { scan: null };

function any() {
  const fn = function () {};
  return new Proxy(fn, {
    get: function (t, k) {
      if (k === 'then') return undefined;                       // never a thenable
      if (k === Symbol.toPrimitive) return function () { return ''; };
      if (k === 'length') return 0;
      if (k === 'toString' || k === 'valueOf') return function () { return ''; };
      if (typeof k === 'symbol') return undefined;
      if (!(k in t)) t[k] = any();
      return t[k];
    },
    set: function (t, k, v) {
      t[k] = v;
      if ((k === 'innerHTML' || k === 'outerHTML') && typeof v === 'string' && HTML_HOOK.scan) HTML_HOOK.scan(v);
      return true;
    },
    apply: function (t, self, args) {
      if (HTML_HOOK.scan) (args || []).forEach(function (a) { if (typeof a === 'string' && a.indexOf('<') !== -1) HTML_HOOK.scan(a); });
      return any();
    },
    construct: function () { return any(); }
  });
}

/* Pages often build their form with innerHTML and then read the first
   request's values back out of it (a default date range, a default filter).
   The scanner remembers value="…" per id, so getElementById(id).value returns
   what the real page would read. */
function scanFormValues(html, into) {
  const tagRe = /<(input|textarea|select)\b([^>]*)>([\s\S]*?<\/select>)?/gi;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[2] || '';
    const idm = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (!idm) continue;
    const id = idm[1];
    if (m[1].toLowerCase() === 'select') {
      const body = m[3] || '';
      const sel = /<option\b[^>]*\bselected\b[^>]*>/i.exec(body) || /<option\b[^>]*>/i.exec(body);
      const v2 = sel ? /\bvalue\s*=\s*["']([^"']*)["']/i.exec(sel[0]) : null;
      if (v2) into[id] = v2[1];
      continue;
    }
    const v1 = /\bvalue\s*=\s*"([^"]*)"|\bvalue\s*=\s*'([^']*)'/i.exec(attrs);
    if (v1) into[id] = v1[1] !== undefined ? v1[1] : v1[2];
    if (/\bchecked\b/i.test(attrs)) into[id + '::checked'] = true;
  }
}

function templateScripts(html, P) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out.map(function (js) {
    return js
      .replace(/<\?!?=\s*pageParams\s*\?>/g, '__PARAMS_JSON__')
      .replace(/<\?!?=\s*purchaseCode\s*\?>/g, P + 'purchase_code__')
      .replace(/<\?!?=\s*email\s*\?>/g, P + 'email__')
      .replace(/<\?!?=\s*currentAction\s*\?>/g, '__CURRENT_ACTION__')
      .replace(/<\?!?=[\s\S]*?\?>/g, 'null')
      .replace(/<\?[\s\S]*?\?>/g, '');
  });
}

async function runPage(page, opts) {
  opts = opts || {};
  /* Every attempt runs in a FRESH context: a page that stops on an unguarded
     reference to a shared-bundle global is run again from nothing, with that
     global stubbed, so no state (and no used-up embedded reply) carries over. */
  const stubbed = [];
  let st = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    st = build(page, opts, stubbed);
    if (!st.failedName) break;
    stubbed.push(st.failedName);
  }
  return st.finish();
}

function build(page, opts, stubs) {
  const P = opts.paramPrefix || '__P_';
  const calls = [];
  const pending = [];
  const notes = { viewCachePage: null, watchPage: null, router: false, gsr: [], errors: [] };
  const timers = [];
  const listeners = [];
  const store = {};
  const RealDate = Date;
  const base = new RealDate('2026-09-15T10:00:00Z').getTime() + (opts.dayShift || 0) * 86400000;
  function FakeDate() {
    const a = Array.prototype.slice.call(arguments);
    return a.length ? new (Function.prototype.bind.apply(RealDate, [null].concat(a)))() : new RealDate(base);
  }
  FakeDate.now = function () { return base; };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC; FakeDate.prototype = RealDate.prototype;

  let wave = 1;
  function record(route, payload, via) {
    let p;
    try { p = JSON.parse(JSON.stringify(payload === undefined ? null : payload)); } catch (e) { p = String(payload); }
    calls.push({ route: String(route), payload: p, via: via || '', wave: wave });
  }
  const held = function () { return new Promise(function (resolve) { pending.push(resolve); }); };
  const paramOf = function (k) { return k === 'sessionToken' ? 'tok' : (k === 'action' ? page.action : P + k + '__'); };
  const params = new Proxy({}, { get: function (t, k) { return typeof k === 'string' ? paramOf(k) : undefined; }, has: () => true });
  function USP() {}
  USP.prototype.get = function (k) { return paramOf(k); };
  USP.prototype.has = function () { return true; };
  USP.prototype.getAll = function (k) { return [this.get(k)]; };
  USP.prototype.toString = function () { return ''; };
  USP.prototype.forEach = function () {};
  USP.prototype.set = function () {};

  const formValues = {};
  HTML_HOOK.scan = function (html) { scanFormValues(html, formValues); };
  const elById = {};
  const el = function (id) {
    if (typeof id === 'string' && id.charAt(0) === '#') id = id.slice(1);
    if (typeof id === 'string' && elById[id]) return elById[id];
    const e = any();
    e.style = {}; e.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } }; e.dataset = {};
    e.textContent = '';
    if (typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id)) {
      Object.defineProperty(e, 'value', { get: () => (id in formValues ? formValues[id] : ''), set: v => { formValues[id] = String(v); }, configurable: true });
      Object.defineProperty(e, 'checked', { get: () => !!formValues[id + '::checked'], set: v => { formValues[id + '::checked'] = !!v; }, configurable: true });
      elById[id] = e;
    } else { e.value = ''; e.checked = false; }
    return e;
  };
  const document = {
    readyState: 'loading', cookie: '', title: '',
    getElementById: el, querySelector: el, querySelectorAll: function () { return []; },
    getElementsByClassName: function () { return []; }, getElementsByTagName: function () { return []; },
    createElement: function () { return el(); }, createTextNode: function () { return el(); }, createDocumentFragment: function () { return el(); },
    addEventListener: function (ev, fn) { listeners.push({ ev: ev, fn: fn }); }, removeEventListener: function () {},
    body: el(), head: el(), documentElement: el(), hidden: false, visibilityState: 'visible', activeElement: null,
    execCommand: function () {}
  };
  const gsr = new Proxy({}, {
    get: function (t, k) {
      if (k === 'withSuccessHandler' || k === 'withFailureHandler' || k === 'withUserObject') return function () { return gsr; };
      return function () { notes.gsr.push(String(k)); record('gsr:' + String(k), Array.prototype.slice.call(arguments)); };
    }
  });

  const UIC = any();
  UIC.Live = any();
  /* The real viewCache, on a miss: stamps first, then the list. Here both are
     recorded at once, since no reply ever arrives. */
  UIC.Live.viewCache = function (call, cfg) {
    notes.viewCachePage = (cfg && cfg.page) || notes.viewCachePage;
    const lists = (cfg && cfg.lists) || [];
    return function (action, payload) {
      if (lists.indexOf(action) !== -1) {
        call('get_page_versions', { page: cfg.page });
        return call(action, payload);
      }
      return call.apply(this, arguments);
    };
  };
  UIC.Live.loadView = function (o) {
    notes.viewCachePage = (o && o.page) || notes.viewCachePage;
    if (o && o.call) { o.call('get_page_versions', { page: o.page }); return o.call(o.action, o.payload); }
    return held();
  };
  UIC.Live.watchPage = function (o) { notes.watchPage = (o && o.page) || null; };
  UIC.Live.setView = function () {};
  UIC.Live.arrive = function (f) { try { f(); } catch (e) {} };
  UIC.Live.save = held;
  UIC.Router = any();
  UIC.Router.register = function () { notes.router = true; };
  UIC.canAdd_ = function () { return true; }; UIC.canFull_ = function () { return true; }; UIC.canEdit_ = function () { return true; };
  UIC.baseUrl = function () { return 'BASE'; }; UIC.token = function () { return 'tok'; };

  const API = any();
  API.call = function (route, payload) {
    if (ctx.PageBoot && typeof ctx.PageBoot.answer === 'function') {
      const b = ctx.PageBoot.answer(route, payload);
      if (b) { record(route, payload, 'boot'); return b; }
    }
    record(route, payload, 'API.call');
    return held();
  };
  API.getSession = function () { return { token: 'tok', email: 'u@x.com', name: 'U', role: 'Super Admin', company: '' }; };

  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Promise, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error, TypeError, Map, Set, WeakMap, Symbol, Intl,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
    Date: FakeDate, URLSearchParams: USP, URL: URL,
    __PARAMS_JSON__: params, __CURRENT_ACTION__: page.action,
    location: { search: '?sessionToken=tok&action=' + page.action, href: 'BASE?action=' + page.action, origin: 'https://x', pathname: '/exec', hash: '', reload() {}, replace() {}, assign() {} },
    navigator: { userAgent: 'node', language: 'ar', onLine: true, clipboard: any(), serviceWorker: undefined },
    document: document, history: any(), screen: { width: 1280, height: 800 },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear() {}, key: () => null, length: 0 },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    setTimeout: function (f, ms) { if (typeof f === 'function') timers.push({ f: f, ms: Number(ms) || 0 }); return timers.length; },
    clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    requestAnimationFrame: function (f) { timers.push({ f: f, ms: 0 }); return 0; }, cancelAnimationFrame: function () {},
    queueMicrotask: function (f) { timers.push({ f: f, ms: 0 }); },
    addEventListener: function (ev, fn) { listeners.push({ ev: ev, fn: fn }); }, removeEventListener: function () {},
    getComputedStyle: function () { return any(); }, matchMedia: function () { return { matches: false, addListener() {}, addEventListener() {} }; },
    fetch: held, alert() {}, confirm() { return true; }, prompt() { return ''; }, open() { return null; }, print() {},
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {}, unobserve() {} }; },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    Event: function () {}, CustomEvent: function () {}, FormData: function () { return any(); }, Blob: function () {}, FileReader: function () { return any(); },
    atob: s => Buffer.from(String(s), 'base64').toString('binary'), btoa: s => Buffer.from(String(s), 'binary').toString('base64'),
    indexedDB: undefined, performance: { now: () => 0, getEntriesByType: () => [], mark() {}, measure() {} },
    google: { script: { run: gsr, host: any(), url: any() } },
    UIC: UIC, API: API, UI: any(), FMT: any(), SESSION: any(), scriptUrl: 'BASE'
  };
  ctx[P + 'purchase_code__'] = P + 'purchase_code__';
  ctx[P + 'email__'] = P + 'email__';
  ctx.window = ctx; ctx.self = ctx; ctx.top = ctx; ctx.parent = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  if (opts.boot) {
    ctx.__PAGE_BOOT__ = opts.boot;
    if (opts.runtime) vm.runInContext(opts.runtime, ctx);
  }

  (stubs || []).forEach(function (n) { ctx[n] = any(); });
  const scripts = templateScripts(read(page.template + '.html'), P);
  for (let i = 0; i < scripts.length; i++) {
    try { vm.runInContext(scripts[i], ctx, { timeout: 2000 }); }
    catch (e) {
      const m = /^([A-Za-z_$][\w$]*) is not defined$/.exec(String(e && e.message));
      /* An unguarded reference to something the shared bundle defines: stop;
         runPage builds a fresh context with it stubbed. */
      if (m && !(m[1] in ctx)) { HTML_HOOK.scan = null; return { failedName: m[1] }; }
      notes.errors.push(String(e && e.message).slice(0, 160));
    }
  }
  document.readyState = 'complete';
  const fire = function (ev) { listeners.filter(l => l.ev === ev).forEach(function (l) { try { l.fn({ type: ev, target: document, preventDefault() {} }); } catch (e) { notes.errors.push(ev + ': ' + String(e && e.message).slice(0, 140)); } }); };
  fire('DOMContentLoaded'); fire('load'); fire('pageshow');
  if (typeof ctx.onload === 'function') { try { ctx.onload(); } catch (e) { notes.errors.push('onload: ' + String(e && e.message).slice(0, 140)); } }
  const drainTimers = function () {
    for (let round = 0; round < 4; round++) {
      const due = timers.splice(0).filter(t => t.ms <= 1500);
      if (!due.length) break;
      due.forEach(function (t) { try { t.f(); } catch (e) { notes.errors.push('timer: ' + String(e && e.message).slice(0, 140)); } });
    }
  };
  drainTimers();

  return { failedName: null, finish: async function () {
  if (opts.secondWave) {
    wave = 2;
    const first = pending.splice(0);
    first.forEach(function (resolve) { resolve(opts.reply ? opts.reply() : any()); });
    for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
    drainTimers();
    for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
  }
  HTML_HOOK.scan = null;
  return { calls: calls, notes: notes, stubbed: (stubs || []).slice() };
  } };
}


module.exports = { runPage: runPage, any: any, ROOT: ROOT };
