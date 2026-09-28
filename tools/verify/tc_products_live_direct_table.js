/* Focused offline UI check for the tc_products_live direct-test table. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.value = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
  }
  appendChild(child) {
    if (child.isFragment) this.children.push(...child.children);
    else this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = [];
    children.forEach(child => child && this.appendChild(child));
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  dispatch(name, event = {}) {
    event.target ||= this;
    (this.listeners[name] || []).forEach(fn => fn(event));
  }
  scrollIntoView() {}
}

async function main() {
  const html = fs.readFileSync('Company_TopChemical_ProductsLive_DirectTest.html', 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert(match, 'page inline script exists');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(item => item[1]);
  const elements = Object.fromEntries(ids.map(id => [id, new Element('div')]));
  const calls = [];
  const columns = ['id', 'name_ar', 'code', 'deleted_at'];
  const rows = Array.from({ length: 123 }, (_, i) => ({
    id: String(i + 1),
    name_ar: 'صنف ' + (i + 1),
    code: i === 100 ? 'find-this-on-later-page' : 'code-' + (i + 1),
    deleted_at: i === 10 ? '2026-09-01 00:00:00' : null
  }));
  const documentListeners = {};
  const document = {
    getElementById: id => elements[id] || null,
    createElement: tag => new Element(tag),
    createDocumentFragment: () => Object.assign(new Element('#fragment'), { isFragment: true }),
    addEventListener: (name, fn) => { (documentListeners[name] ||= []).push(fn); }
  };
  const context = {
    document,
    window: { location: { search: '' }, AUTH_USER_EMAIL: '' },
    URLSearchParams,
    API: {
      getSession: () => ({ token: 'offline-test-token' }),
      call: (...args) => {
        calls.push(args);
        return Promise.resolve({ status: 'ok', columns, rows, count: rows.length, payload_bytes: 1200,
          timing_ms: { connection: 10, query: 20, read: 3, parse: 4, server_total: 40 } });
      }
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    performance: { now: () => 1 },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    setTimeout,
    Date,
    Promise,
    console
  };
  new vm.Script(match[1], { filename: 'ProductsLive_DirectTest.inline.js' }).runInNewContext(context);
  await new Promise(resolve => setTimeout(resolve, 15));

  assert.strictEqual(calls.length, 1, 'one full-catalog read supplies both the dropdown and table');
  assert.strictEqual(calls[0][1].module_action, 'get_products_live_direct_test');
  assert.strictEqual(elements['products-table-head'].children[0].children.length, columns.length,
    'table shows all returned column headers');
  assert.strictEqual(elements['products-table-body'].children.length, 50,
    'first page renders 50 rows');
  assert.ok(elements.matches.textContent.includes('الإجمالي المحمّل: 122'),
    'the dropdown excludes soft-deleted rows while the table keeps all rows');
  assert.strictEqual(elements['table-page-label'].textContent, 'الصفحة 1 من 3');
  assert.ok(elements.timing.textContent.includes('حجم بيانات الصفوف: 1200 bytes'),
    'measurement block reports the received JSON byte size');
  assert.ok(elements.timing.textContent.includes('SQL: 20 ms') && elements.timing.textContent.includes('تحليل JSON على الخادم: 4 ms'),
    'measurement block exposes database and server parsing phases');

  elements['table-next'].dispatch('click');
  assert.strictEqual(elements['products-table-body'].children.length, 50,
    'next page also renders 50 rows');
  assert.strictEqual(elements['table-page-label'].textContent, 'الصفحة 2 من 3');

  elements['table-search'].value = 'find-this-on-later-page';
  elements['table-search'].dispatch('input');
  assert.strictEqual(elements['products-table-body'].children.length, 1,
    'search finds a value in an off-page row and non-name column');
  assert.strictEqual(elements['products-table-body'].children[0].children[2].textContent,
    'find-this-on-later-page');
  assert.ok(elements['table-status'].textContent.includes('المطابق: 1 من إجمالي 123'));
  console.log('tc_products_live_direct_table: PASS (all columns, 50-row pages, global search)');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
