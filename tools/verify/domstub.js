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

function makeElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    style: {},
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
  return el;
}

function makeDocument() {
  const byId = {};
  const doc = {
    _byId: byId,
    body: makeElement('body'),
    documentElement: makeElement('html'),
    head: makeElement('head'),
    readyState: 'complete',
    createElement: makeElement,
    createTextNode: function (t) { const e = makeElement('#text'); e.textContent = t; return e; },
    createDocumentFragment: function () { return makeElement('#fragment'); },
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
    setTimeout: function (fn) { if (typeof fn === 'function') fn(); return 0; },
    clearTimeout: function () {},
    setInterval: function () { return 0; },
    clearInterval: function () {},
    requestAnimationFrame: function (fn) { if (typeof fn === 'function') fn(0); return 0; },
    matchMedia: function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; },
    getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; },
    alert: function () {},
    confirm: function () { return true; },
    Math: Math, JSON: JSON, Date: Date, Number: Number, String: String,
    Array: Array, Object: Object, RegExp: RegExp, Error: Error, isNaN: isNaN,
    parseFloat: parseFloat, parseInt: parseInt, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  Object.assign(sandbox, extra || {});
  vm.createContext(sandbox);
  return sandbox;
}

module.exports = { makeElement, makeDocument, makeSandbox };
