/*
 * erp_test clone static checker (plan P3 step 3.11 + 3.12.5, extended in P5/P6).
 * Exits 1 with file:line hits if any check fails. Reads local files only
 * (plus `git show HEAD:<file>` for the Top Light byte-identity check).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const fails = [];
const fail = (msg) => fails.push(msg);

const etFiles = fs.readdirSync(ROOT).filter((f) => /^Company_ErpTest_/.test(f)).sort();
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// B4 old -> new (non-KEEP), KEEP names, manufacturing names.
const B4 = {
  get_dashboard_data: 'get_et_dashboard_data', get_kpi_data: 'get_et_kpi_data',
  get_products: 'get_et_products', add_product: 'add_et_product', edit_product: 'edit_et_product',
  get_parties: 'get_et_parties', add_party: 'add_et_party', edit_party: 'edit_et_party',
  get_purchasing_headers: 'get_et_purchasing_headers', get_purchasing_options: 'get_et_purchasing_options',
  get_purchasing_lines: 'get_et_purchasing_lines', get_purchase_print: 'get_et_purchase_print',
  add_purchasing: 'add_et_purchasing', edit_purchasing: 'edit_et_purchasing', delete_purchasing: 'delete_et_purchasing', approve_purchasing: 'approve_et_purchasing',
  get_sales_headers: 'get_et_sales_headers', get_sales_options: 'get_et_sales_options', get_sales_lines: 'get_et_sales_lines',
  get_sales_print: 'get_et_sales_print', get_sales_costing: 'get_et_sales_costing',
  add_sales: 'add_et_sales', edit_sales: 'edit_et_sales', delete_sales: 'delete_et_sales', approve_sales: 'approve_et_sales',
  get_sales_returns: 'get_et_sales_returns', add_sales_return: 'add_et_sales_return', delete_sales_return: 'delete_et_sales_return',
  get_cash_headers: 'get_et_cash_headers', add_cash: 'add_et_cash', edit_cash: 'edit_et_cash', delete_cash: 'delete_et_cash', approve_cash: 'approve_et_cash',
  add_transfer: 'add_et_transfer', get_customer_statement: 'get_et_customer_statement',
  get_sales_offer_headers: 'get_et_sales_offer_headers', get_sales_offer_lines: 'get_et_sales_offer_lines', get_sales_offer_print: 'get_et_sales_offer_print',
  add_sales_offer: 'add_et_sales_offer', edit_sales_offer: 'edit_et_sales_offer', delete_sales_offer: 'delete_et_sales_offer', approve_sales_offer: 'approve_et_sales_offer',
  get_sales_analysis: 'get_et_sales_analysis', get_sales_costing_analysis: 'get_et_sales_costing_analysis',
  get_income_statement: 'get_et_income_statement', get_financial_position: 'get_et_financial_position',
  get_cash_report: 'get_et_cash_report', get_purchase_needs: 'get_et_purchase_needs', get_product_movement: 'get_et_product_movement',
};
const KEEP = ['get_xlsx_export', 'prefetch_refs', 'get_page_versions'];
const MFG = ['get_et_manufacture_headers', 'get_et_manufacture_options', 'get_et_manufacture_lines', 'get_et_manufacture_print',
  'get_et_manufacture_template', 'add_et_manufacture', 'edit_et_manufacture', 'delete_et_manufacture',
  'approve_et_manufacture', 'complete_et_manufacture', 'cancel_et_manufacture',
  'start_et_manufacture', 'save_et_manufacture_progress', 'get_et_manufacture_order'];
const EXTRA_ALLOWED = ['get_et_sync']; // P11
const allowedActions = new Set([...Object.values(B4), ...KEEP, ...MFG, ...EXTRA_ALLOWED]);

function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }
function scan(file, src, re, label) {
  let m; const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(src))) fail(`${file}:${lineOf(src, m.index)} ${label}: ${JSON.stringify(m[0])}`);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- 1 + 2: forbidden strings and old action names in every Company_ErpTest_* file ----
for (const f of etFiles) {
  const src = read(f);
  ['8df5c89a117fe9a5', 'TOPLIGHT_MENU', 'TopLight_Nav', 'القمة لايت', 'Top Light', 'action=tl_']
    .forEach((needle) => scan(f, src, new RegExp(esc(needle)), 'forbidden'));
  scan(f, src, /['"]tl_/, 'forbidden tl_ literal');
  Object.keys(B4).forEach((old) => scan(f, src, new RegExp('\\b' + old + '\\b'), 'old action name'));
}

// ---- 3: getHeaders_( / getAllRecords_( exactly once in the Actions file ----
const ACT = 'Company_ErpTest_Actions.js';
const actSrc = read(ACT);
const cnt = (s, sub) => s.split(sub).length - 1;
if (cnt(actSrc, 'getHeaders_(') !== 2) {
  // one inside etHeaders_, one inside etSchemaCheck_ (plan 3.12.1 reads physical headers).
  fail(`${ACT}: getHeaders_( expected 2 (etHeaders_ + etSchemaCheck_), found ${cnt(actSrc, 'getHeaders_(')}`);
}
if (cnt(actSrc, 'getAllRecords_(') !== 1) fail(`${ACT}: getAllRecords_( expected 1, found ${cnt(actSrc, 'getAllRecords_(')}`);

// ---- 4: ACTION_DEFINITIONS keys ----
const adStart = actSrc.indexOf('const ACTION_DEFINITIONS = {');
if (adStart === -1) fail(`${ACT}: ACTION_DEFINITIONS not found`);
else {
  const adEnd = actSrc.indexOf('\n  };', adStart);
  const block = actSrc.slice(adStart, adEnd);
  const keys = [...block.matchAll(/^\s*'([a-z0-9_]+)'\s*:/gm)].map((m) => m[1]);
  if (!keys.length) fail(`${ACT}: no ACTION_DEFINITIONS keys parsed`);
  keys.forEach((k) => { if (!allowedActions.has(k)) fail(`${ACT}: ACTION_DEFINITIONS key not allowed: ${k}`); });
  const keySet = new Set(keys);
  // P5 extension: all 11 manufacturing actions present (only once P5 code exists).
  if (actSrc.indexOf('const MFG_SHEET') !== -1) MFG.forEach((k) => { if (!keySet.has(k)) fail(`${ACT}: missing manufacturing action ${k}`); });
}

// ---- 5: Top Light files byte-identical to HEAD ----
fs.readdirSync(ROOT).filter((f) => /^Company_TopLight_/.test(f)).forEach((f) => {
  let head;
  try { head = execFileSync('git', ['show', 'HEAD:' + f], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { fail(`${f}: not in HEAD`); return; }
  if (!head.equals(fs.readFileSync(path.join(ROOT, f)))) fail(`${f}: differs from HEAD`);
});

// ---- 6: both policies load in one vm context; no duplicate docTypes/actions ----
(function () {
  const noop = function () {};
  let service;
  service = new Proxy(function () {}, {
    get: function (_t, prop) {
      if (prop === 'getScriptProperties') return function () { return { getProperty: function () { return null; } }; };
      if (prop === 'getScriptCache') return function () { return { get: () => null, getAll: () => ({}), put: noop, remove: noop, removeAll: noop }; };
      return function () { return service; };
    },
    apply: function () { return service; },
  });
  const ctx = { console, PropertiesService: service, CacheService: service, Utilities: service, SpreadsheetApp: service, DriveApp: service,
    UrlFetchApp: service, ScriptApp: service, HtmlService: service, ContentService: service, LockService: service, Session: service,
    Jdbc: service, Sheets: service, Logger: console, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Map, Set, Promise, Error,
    encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN };
  vm.createContext(ctx);
  const order = JSON.parse(read('.clasp.json')).filePushOrder;
  try {
    order.forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  } catch (e) { fail('vm load failed: ' + e.message); return; }
  let res;
  try {
    res = JSON.parse(vm.runInContext('JSON.stringify({tl: TopLight.approvalPolicy_, et: ErpTest.approvalPolicy_})', ctx));
  } catch (e) { fail('policy read failed: ' + e.message); return; }
  const tlA = Object.keys(res.tl.actionToDocType || {}), etA = Object.keys(res.et.actionToDocType || {});
  const dupA = tlA.filter((k) => etA.indexOf(k) !== -1);
  if (dupA.length) fail('duplicate actionToDocType keys across TopLight/ErpTest: ' + dupA.join(', '));
  const tlD = (res.tl.chains || []).map((c) => c.docType), etD = (res.et.chains || []).map((c) => c.docType);
  const dupD = tlD.filter((k) => etD.indexOf(k) !== -1);
  if (dupD.length) fail('duplicate chain docTypes across TopLight/ErpTest: ' + dupD.join(', '));
})();

// ---- 3.12.5: every field literal in the Actions file is known ----
(function () {
  const schemaCtx = {};
  vm.createContext(schemaCtx);
  vm.runInContext(read('Company_ErpTest_Schema.js') + '\nthis.__inv = ET_FIELD_INVENTORY;', schemaCtx);
  const known = new Set();
  Object.values(schemaCtx.__inv).forEach((t) => [...(t.R || []), ...(t.W || [])].forEach((n) => known.add(n)));
  ['deleted_at', 'deleted_by', 'version'].forEach((n) => known.add(n)); // audit columns (P2)
  // B7 notes — alias spellings the code reads as fallbacks.
  const ALIASES = ['receipt date', 'reciept_date', 'receipt_date', 'supplier_name', 'total_costs', 'Total Costs', 'Code', 'Items', 'item',
    'Type', 'Currency', 'Value', 'exchange_rate'];
  ALIASES.forEach((n) => known.add(n));
  // Keys the code builds itself in response objects (or passes through from the client payload); never read from a sheet.
  const RESPONSE_ONLY_KEYS = [
    'customer_name', 'product_name', 'box_name', 'supplier_name', 'fully_returned', 'category_name', 'balance',
  ];
  RESPONSE_ONLY_KEYS.forEach((n) => known.add(n));
  // OD-C / OD-D: guarded writes to columns the erp_test sheet does not have. The row
  // builder's set() skips a header it cannot find, so these are no-ops by design.
  const ABSENT_GUARDED_WRITES = ['name_vendor', 'نوع سلع الجدول'];
  ABSENT_GUARDED_WRITES.forEach((n) => known.add(n));
  const unknown = {};
  const res = [
    /(?<![.\w])(?:set|put|pick|pickP)\(\s*'([^'\n]+)'/g,
    /(?<![.\w])(?:set|put|pick|pickP)\(\s*"([^"\n]+)"/g,
    /\b(?:r|rec|inv|row)\['([^'\n]+)'\]/g,
    /\b(?:r|rec|inv|row)\["([^"\n]+)"\]/g,
  ];
  res.forEach((re) => {
    let m;
    while ((m = re.exec(actSrc))) {
      const name = m[1];
      if (known.has(name) || known.has(name.toLowerCase())) continue;
      (unknown[name] = unknown[name] || []).push(lineOf(actSrc, m.index));
    }
  });
  Object.keys(unknown).sort().forEach((n) => fail(`${ACT}:${unknown[n][0]} unknown field literal ${JSON.stringify(n)} (lines ${unknown[n].join(',')})`));
})();

if (fails.length) {
  console.error('erptest_clone_static: FAIL (' + fails.length + ')');
  fails.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log('erptest_clone_static: OK (' + etFiles.length + ' Company_ErpTest_* files)');
