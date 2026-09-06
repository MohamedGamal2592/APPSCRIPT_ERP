/**
 * A deliberately small DOM stub, just large enough to let the real inline
 * scripts of the project's .html templates be loaded and exercised under node.
 *
 * It is NOT a browser. It renders nothing and lays nothing out. It exists so the
 * pure logic in those scripts — markup builders, FIFO allocation, cost gating —
 * can be tested without a browser, which is the only kind of verification
 * available on this project.
 *
 * Used by every tools/verify/*.js script.
 */
'use strict';

const vm = require('vm');

/* Registry shared by a document, so ids written into innerHTML stay findable. */
function makeElement(tag, registry) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    /* Enough of CSSStyleDeclaration for code that sets custom properties. */
    style: { _p: {}, setProperty: function (k, v) { this._p[k] = v; }, getPropertyValue: function (k) { return this._p[k] || ''; }, removeProperty: function (k) { delete this._p[k]; } },
    dataset: {},
    children: [],
    parentNode: null,
    _attrs: {},
    _listeners: {},
    classList: {
      _set: {},
      add: function () { for (const a of arguments) this._set[a] = true; },
      remove: function () { for (const a of arguments) delete this._set[a]; },
      toggle: function (c, on) { if (on === undefined) on = !this._set[c]; if (on) this._set[c] = true; else delete this._set[c]; },
      contains: function (c) { return !!this._set[c]; }
    },
    setAttribute: function (k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    removeAttribute: function (k) { delete this._attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
    appendChild: function (c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild: function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    insertBefore: function (c) { this.children.unshift(c); c.parentNode = this; return c; },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
    addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function (e) { (this._listeners[e && e.type] || []).forEach(function (f) { f(e); }); return true; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    focus: function () {},
    blur: function () {},
    click: function () { this.dispatchEvent({ type: 'click', target: this }); },
    scrollIntoView: function () {},
    getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    contains: function () { return false; }
  };

  /* innerHTML is a real string, but assigning it also registers every id the
     markup declares. A browser builds nodes; this builds just enough of one —
     an addressable element per id — so code that renders a block and then
     updates one cell inside it by id behaves as it does in a browser. Without
     this, every in-place update would silently no-op under test and a broken
     one would look identical to a working one. */
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    enumerable: true,
    get: function () { return _html; },
    set: function (v) {
      _html = String(v == null ? '' : v);
      if (registry) registerIds(_html, registry);
    }
  });
  el.insertAdjacentHTML = function (position, html) {
    const h = String(html == null ? '' : html);
    if (position === 'afterbegin') _html = h + _html;
    else _html = _html + h;          /* beforeend, and anything else */
    if (registry) registerIds(h, registry);
  };
  return el;
}

/** Register an addressable element for every id="..." in a markup string. */
function registerIds(html, registry) {
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (registry[id]) continue;      /* first writer wins, as in a document */
    const child = makeElement('div', registry);
    child.id = id;
    /* disabled is an attribute in the markup; reflect it so a test can read it */
    child.disabled = new RegExp('\\sid="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*\\sdisabled').test(html);
    registry[id] = child;
  }
}

function makeDocument() {
  const byId = {};
  const doc = {
    _byId: byId,
    body: makeElement('body', byId),
    documentElement: makeElement('html', byId),
    head: makeElement('head', byId),
    readyState: 'complete',
    createElement: function (tag) { return makeElement(tag, byId); },
    createTextNode: function (t) { const e = makeElement('#text', byId); e.textContent = t; return e; },
    createDocumentFragment: function () { return makeElement('#fragment', byId); },
    getElementById: function (id) { return byId[id] || null; },
    getElementsByClassName: function () { return []; },
    getElementsByTagName: function () { return []; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () { return true; },
    execCommand: function () { return true; },
    activeElement: null
  };
  /* Anything appended to <body> becomes reachable by id, which is all the
     project's code relies on (UIC.openModal / UIC.closeModal). */
  doc.body.appendChild = function (c) {
    this.children.push(c);
    c.parentNode = this;
    if (c.id) byId[c.id] = c;
    return c;
  };
  doc.body.removeChild = function (c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    if (c.id) delete byId[c.id];
    /* Drop ids that lived inside it, so a closed modal stops being findable. */
    const re = /\sid="([^"]+)"/g;
    let m;
    while ((m = re.exec(String(c.innerHTML || ''))) !== null) delete byId[m[1]];
    return c;
  };
  return doc;
}

/**
 * Build a sandbox whose global object doubles as `window`, the way a browser's
 * does — so `window.UIC = ...` also defines a bare `UIC`.
 */
function makeSandbox(extra) {
  const doc = makeDocument();
  const sandbox = {
    document: doc,
    console: console,
    navigator: { userAgent: 'node', language: 'ar' },
    location: { href: 'https://example.invalid/', search: '', hash: '' },
    localStorage: {
      _d: {},
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem: function (k, v) { this._d[k] = String(v); },
      removeItem: function (k) { delete this._d[k]; }
    },
    /* Timers are QUEUED, not run. Running them inline fired every page's load
       watchdog immediately and swallowed toasts (UIC.toast removes itself on a
       timer), which made both invisible to tests. Call sandbox.runTimers() to
       fire them deliberately. */
    setTimeout: function (fn, ms) {
      if (typeof fn !== 'function') return 0;
      sandbox.__timers.push({ fn: fn, ms: Number(ms) || 0 });
      return sandbox.__timers.length;
    },
    clearTimeout: function (id) { if (id && sandbox.__timers[id - 1]) sandbox.__timers[id - 1] = null; },
    setInterval: function () { return 0; },
    clearInterval: function () {},
    requestAnimationFrame: function (fn) { if (typeof fn === 'function') fn(0); return 0; },
    matchMedia: function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; },
    getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; },
    alert: function () {},
    confirm: function () { return true; },
    /* window-level listeners: recorded, never dispatched. Real client code
       registers error/unhandledrejection handlers at load time. */
    addEventListener: function (t, fn) { (sandbox.__winListeners[t] = sandbox.__winListeners[t] || []).push(fn); },
    removeEventListener: function () {},
    dispatchEvent: function () { return true; },
    open: function () { return { document: { write: function () {}, close: function () {} }, focus: function () {}, print: function () {}, close: function () {} }; },
    close: function () {},
    performance: { now: function () { return Date.now(); } },
    URLSearchParams: URLSearchParams,
    URL: URL,
    Promise: Promise,
    Math: Math, JSON: JSON, Date: Date, Number: Number, String: String,
    Array: Array, Object: Object, RegExp: RegExp, Error: Error, isNaN: isNaN,
    parseFloat: parseFloat, parseInt: parseInt, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent
  };
  sandbox.__winListeners = {};
  sandbox.__timers = [];
  /* Fire queued timers up to `maxMs` (default: all). */
  sandbox.runTimers = function (maxMs) {
    const due = sandbox.__timers.filter(t => t && (maxMs === undefined || t.ms <= maxMs));
    sandbox.__timers = sandbox.__timers.map(t => (t && due.indexOf(t) !== -1) ? null : t);
    due.forEach(t => { try { t.fn(); } catch (e) {} });
    return due.length;
  };
  /* Toasts: UIC.toast appends a .toast div to <body>. */
  sandbox.toasts = function () {
    return sandbox.document.body.children
      .filter(c => /(^|\s)toast(\s|$)/.test(String(c.className || '')))
      .map(c => String(c.textContent || ''));
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  return sandbox;
}

module.exports = { makeElement, makeDocument, makeSandbox };
