/**
 * Boot a real ValleyFoods page template under node.
 *
 * Loads the REAL UI_Components.html script and the REAL page template into one
 * sandbox on top of domstub.js, substitutes the Apps Script <?!= ?> scriptlets
 * with test values, and routes companyCall/API.call to a fixture function the
 * caller supplies. The page's own render functions then run for real, so a test
 * can assert on the markup they actually produce rather than on the source text.
 *
 * It is not a browser: layout, CSS and event dispatch do not exist, and
 * innerHTML does not build a node tree. What it does give is the exact HTML
 * string each draw function writes, which is what the cost gating, the batch
 * modal and the material rows are made of.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox, makeElement } = require('./domstub');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Replace Apps Script scriptlets with test values.
 * `values` maps a variable name to the literal JS text to substitute.
 */
function substituteScriptlets(src, values) {
  const lines = src.split('\n');
  return lines.map(line => {
    if (line.indexOf('<?') === -1) return line;
    const decl = line.match(/var\s+([A-Za-z0-9_]+)\s*=/);
    const name = decl ? decl[1] : null;
    const replacement = (name && Object.prototype.hasOwnProperty.call(values, name))
      ? values[name]
      : 'null';
    /* If the scriptlet sits inside quotes ('<?!= x ?>'), the quotes stay and the
       substitution must be bare text, so strip an outer quoted literal down. */
    return line.replace(/<\?[\s\S]*?\?>/g, () => {
      const quoted = new RegExp("'[^']*<\\?");
      return quoted.test(line) ? String(replacement).replace(/^'|'$/g, '') : replacement;
    });
  }).join('\n');
}

/** All inline <script> bodies of a template, concatenated. */
function scriptOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out.join('\n');
}

/**
 * @param {object} opts
 *   page          template filename, e.g. 'Company_ValleyFoods_MfgOrderView.html'
 *   call          function(action, data) -> Promise, the companyCall router
 *   containers    element ids to pre-register so draw functions can find them
 *   scriptlets    variable-name -> literal text substitutions
 *   isSuperAdmin  convenience for the IS_SUPER_ADMIN scriptlet
 *   userPages     convenience for the USER_PAGES scriptlet
 */
function bootPage(opts) {
  const o = opts || {};
  const sandbox = makeSandbox();

  /* Containers the page's draw functions write into. innerHTML is captured, so
     a test can read exactly what was rendered. */
  const ids = ['vf-mo-view', 'vf-root', 'mo-kpi-body', 'outputs-body', 'workops-body',
    'byproducts-body', 'vf-loading-overlay'].concat(o.containers || []);
  ids.forEach(id => {
    /* Created through the document, not makeElement directly, so the element
       shares the document's id registry and ids written into its innerHTML
       become addressable — which is what makes in-place updates observable. */
    const el = sandbox.document.createElement('div');
    el.id = id;
    sandbox.document.body.appendChild(el);
  });

  /* The real shared component library. */
  vm.runInContext(scriptOf('UI_Components.html'), sandbox, { filename: 'UI_Components.html' });

  const tables = [];
  const realDataTable = sandbox.UIC.dataTable;
  sandbox.UIC.dataTable = function (containerId, opts) {
    tables.push({ containerId, opts });
    const html = realDataTable.call(sandbox.UIC, containerId, opts);
    const o2 = opts || {};
    const rows = o2.rows || [];
    if (!rows.length) return html;
    const hasStringHeaders = (o2.headers || []).some(h => typeof h === 'string');
    const headers = hasStringHeaders
      ? o2.headers.map((h, i) => (typeof h === 'string' ? { key: '__col' + i, label: h } : h))
      : (o2.headers || []);
    const fmtMoney = n => (Number(n) || 0).toFixed(2);
    const body = rows.map((r, i) => sandbox.UIC._dtRowHtml(r, headers, fmtMoney, i)).join('');
    return html.replace(/(<tbody id="[^"]*">)(<\/tbody>)/, '$1' + body + '$2');
  };
  sandbox.__tables = tables;

  const calls = [];
  /* The REAL shared client layer — FMT, UI and the rest of Client_Helpers —
     rather than a hand-written stand-in. A stub drifts: FMT.percent was missing
     from the old one and a page that used it rendered an error instead of a
     table, which is exactly the kind of thing these tests exist to catch. */
  vm.runInContext(
    scriptOf('Client_Helpers.html').replace(/<\?[\s\S]*?\?>/g, '0'),
    sandbox, { filename: 'Client_Helpers.html' });

  /* AFTER Client_Helpers, which defines its own API bound to google.script.run.
     Every request must go to the test's fixture router instead. */
  sandbox.API = {
    getSession: () => ({ token: 'TEST-TOKEN' }),
    call: (action, payload) => {
      calls.push({ action, payload });
      const inner = (payload && payload.module_action) || action;
      const data = (payload && payload.data) || payload;
      try {
        return Promise.resolve(o.call ? o.call(inner, data) : { status: 'success' });
      } catch (e) {
        return Promise.reject(e);
      }
    }
  };

  sandbox.UI = Object.assign({
    toast: (m, t) => { (sandbox.__toasts = sandbox.__toasts || []).push([m, t]); },
    showSpinner: () => {}, hideSpinner: () => {},
    submitOnce: (el, fn) => fn()
  }, sandbox.UI || {});
  /* Spinners want a real DOM; nothing under test depends on them. */
  sandbox.UI.showSpinner = () => {};
  sandbox.UI.hideSpinner = () => {};
  sandbox.UI.submitOnce = (el, fn) => fn();
  sandbox.SESSION = { token: 'TEST-TOKEN' };
  sandbox.scriptUrl = 'https://example.invalid/exec';
  sandbox.__calls = calls;

  const scriptletValues = Object.assign({
    PAGE_PARAMS: JSON.stringify(o.pageParams || { mo: 'MO-1', sessionToken: 'TEST-TOKEN' }),
    IS_SUPER_ADMIN: o.isSuperAdmin ? 'true' : 'false',
    COMPANY_LOGO_URL: "''",
    COMPANY_PAGES: '[]',
    CURRENT_ACTION: "'vf_mfg_order'",
    USER_PAGES: o.userPages === undefined ? 'null' : JSON.stringify(o.userPages)
  }, o.scriptlets || {});

  let pageSrc = substituteScriptlets(scriptOf(o.page), scriptletValues);

  /* Most page functions live inside an IIFE and are not reachable from outside.
     For those, append an export line to the LOADED COPY, just before the IIFE
     closes. The template on disk is never modified — this is a test hook, and
     the functions it reaches are the page's real ones. */
  if (o.expose && o.expose.length) {
    /* Most pages wrap their logic in an IIFE, so the export line has to go just
       before it closes. A few (Purchasing, Sales) declare theirs at top level,
       where appending at the end is both correct and simpler. */
    const close = pageSrc.lastIndexOf('})();');
    const marker = close === -1 ? pageSrc.length : close;
    /* An entry is a bare name, or 'alias=expression' when the thing under test
       is a variable the page later reassigns and a live getter is needed. */
    const line = '\ntry { window.__EXPORTS = { ' +
      o.expose.map(n => {
        const eq = n.indexOf('=');
        return eq === -1 ? n + ': ' + n : n.slice(0, eq) + ': ' + n.slice(eq + 1);
      }).join(', ') + ' }; } catch (e) {}\n';
    pageSrc = pageSrc.slice(0, marker) + line + pageSrc.slice(marker);
  }

  vm.runInContext(pageSrc, sandbox, { filename: o.page });
  sandbox.exported = name => {
    const fns = sandbox.__EXPORTS || {};
    if (typeof fns[name] !== 'function') throw new Error('not exposed: ' + name);
    return fns[name];
  };

  /** The HTML a container currently holds. */
  sandbox.html = id => {
    const el = sandbox.document.getElementById(id);
    return el ? String(el.innerHTML || '') : '';
  };
  return sandbox;
}

/** Let queued promise callbacks run. */
const flush = () => new Promise(r => setImmediate(r));

module.exports = { bootPage, scriptOf, substituteScriptlets, flush };
