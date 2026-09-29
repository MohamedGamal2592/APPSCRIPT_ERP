// P0 step 0.3/0.4 (+0.5, +0.6): build the TL->ET header map from discovery.json,
// check it against the B7 field inventory, run the required-exact and structure
// checks, and write header_map.json + header_map_report.md. Reads local files only.
const fs = require('path') && require('fs');
const DIR = __dirname;

const discovery = JSON.parse(fs.readFileSync(DIR + '/discovery.json', 'utf8'));
const fieldInv = JSON.parse(fs.readFileSync(DIR + '/field_inventory.json', 'utf8'));

// B3 — the 14 business tabs that have both a Top Light and a Testing System tab.
const B3 = [
  ['products',        'top_light_products',            'erp_test_products'],
  ['categories',      'top_light_categories',          'erp_test_categories'],
  ['parties',         'top_light_customer_vendor',     'erp_test_customer_vendor'],
  ['chart',           'top_light_chart_of_accounts',   'erp_test_chart_of_accounts'],
  ['stock',           'top_light_current_products',    'erp_test_current_products'],
  ['purchase_headers','top_light_purchasing_costing',  'erp_test_purchasing_costing'],
  ['purchase_lines',  'top_light_product_purchasing',  'erp_test_product_purchasing'],
  ['sales_headers',   'top_light_sales_invoices',      'erp_test_sales_invoices'],
  ['sales_lines',     'top_light_sales_products',      'erp_test_sales_products'],
  ['sales_returns',   'top_light_sales_returns',       'erp_test_sales_returns'],
  ['offer_headers',   'top_light_sales_offer',         'erp_test_sales_offer'],
  ['offer_lines',     'top_light_sales_offer_products','erp_test_sales_offer_products'],
  ['cash',            'top_light_cash_bank_movement',  'erp_test_cash_bank_movement'],
  ['boxes',           'top_light_box_account_codes',   'erp_test_box_account_codes'],
];

const AUDIT = ['deleted_at', 'deleted_by', 'version'];
const MANUFACTURE_TABS = ['erp_test_manufacture_orders', 'erp_test_manufacture_lines'];
// OD-A: stock is computed live from transaction tabs; no current_products sheet.
const COMPUTED_TABS = ['erp_test_current_products'];
let OVERRIDES = {};
try { OVERRIDES = JSON.parse(fs.readFileSync(DIR + '/header_map_overrides.json', 'utf8')); } catch (e) { OVERRIDES = {}; }
// active B3 rows = those still backed by a real erp_test sheet
const isComputed = (etTab) => COMPUTED_TABS.includes(etTab);

const norm = (x) => String(x).toLowerCase().replace(/[\s_]+/g, ' ').trim();
const replaceAll = (s, a, b) => s.split(a).join(b);

function sheetOf(book, name) {
  return (discovery[book] && discovery[book].sheets || []).find((s) => s.name === name) || null;
}
function headersOf(book, name) {
  const sh = sheetOf(book, name);
  return sh ? sh.headers.map((h) => String(h).trim()) : null; // null = tab missing
}
function formulaColsOf(book, name) {
  const sh = sheetOf(book, name);
  return sh ? (sh.formulaCols || {}) : {};
}

// ---- 0.3 steps 2-5: build the map per tab ----
const headerMap = {};
const B3M = B3.filter((r) => !isComputed(r[2]));
for (const [, tlTab, etTab] of B3M) {
  const TL = headersOf('top_light', tlTab);
  const ET = headersOf('erp_test', etTab);
  const map = {};
  const usedET = new Set();
  const etHeaders = ET || [];
  (TL || []).forEach((h) => {
    let candidate = replaceAll(h, 'top_light_', 'erp_test_');
    candidate = replaceAll(candidate, 'top_light', 'erp_test');
    if (etHeaders.indexOf(candidate) !== -1) { map[h] = candidate; usedET.add(candidate); return; }
    const hit = etHeaders.find((e) => norm(e) === norm(candidate));
    if (hit) { map[h] = hit; usedET.add(hit); return; }
    map[h] = null;
  });
  // apply manual overrides (owner-confirmed renames)
  const ov = OVERRIDES[etTab] || {};
  Object.keys(ov).forEach((tlH) => { if (tlH === '_note') return; map[tlH] = ov[tlH]; if (ov[tlH] != null) usedET.add(ov[tlH]); });
  const extra = etHeaders.filter((e) => !usedET.has(e));
  headerMap[etTab] = {
    map, extra,
    tlTabMissing: TL === null,
    etTabMissing: ET === null,
    tlFormulaCols: formulaColsOf('top_light', tlTab),
    etFormulaCols: formulaColsOf('erp_test', etTab),
  };
}
fs.writeFileSync(DIR + '/header_map.json',
  JSON.stringify(Object.fromEntries(Object.entries(headerMap).map(([k, v]) =>
    [k, { map: v.map, extra: v.extra, tlFormulaCols: v.tlFormulaCols, etFormulaCols: v.etFormulaCols }])), null, 2), 'utf8');

// ---- 0.3.7 + 0.3.8: field alignment vs B7 + formula guard ----
const alignment = {}; // tab -> [{name,cls,physical,status}]
const missingRequired = [];
const missingOptional = [];
const formulaConflicts = [];
for (const [etTab, inv] of Object.entries(fieldInv)) {
  const b3row = B3.find((r) => r[2] === etTab);
  const etHeaders = headersOf('erp_test', etTab); // null if missing
  const tlHeaders = b3row ? headersOf('top_light', b3row[1]) : null;
  const hm = headerMap[etTab];
  const rows = [];
  const etSet = new Set(etHeaders || []);
  const efc = (hm && hm.etFormulaCols) || {};
  const classify = (name, cls) => {
    if (AUDIT.indexOf(name) !== -1) { rows.push({ name, cls, physical: '(audit-P2)', status: 'AUDIT-SKIP' }); return; }
    // resolve physical
    let physical;
    const isTL = tlHeaders && tlHeaders.indexOf(name) !== -1;
    if (isTL) physical = hm ? hm.map[name] : undefined;
    else physical = etSet.has(name) ? name : (etHeaders || []).find((e) => norm(e) === norm(name));
    const found = physical && etSet.has(physical);
    let status;
    if (etHeaders === null) {
      // erp_test tab does not exist
      if (MANUFACTURE_TABS.indexOf(etTab) !== -1) status = 'PENDING-P2';
      else { status = cls === 'R' ? 'MISSING-REQUIRED' : 'MISSING-OPTIONAL'; }
    } else if (found) {
      status = 'ALIGNED';
      // OD-A: current_products (retired) and chart_of_accounts (read-only reference) are exempt from the formula guard.
      if (efc[physical] && ['erp_test_current_products', 'erp_test_chart_of_accounts'].indexOf(etTab) === -1) { status = 'FORMULA-CONFLICT'; formulaConflicts.push({ etTab, name, physical }); }
    } else {
      status = cls === 'R' ? 'MISSING-REQUIRED' : 'MISSING-OPTIONAL';
    }
    if (status === 'MISSING-REQUIRED') missingRequired.push({ etTab, name });
    if (status === 'MISSING-OPTIONAL') missingOptional.push({ etTab, name });
    rows.push({ name, cls, physical: physical || '(none)', status });
  };
  (inv.R || []).forEach((n) => classify(n, 'R'));
  (inv.W || []).forEach((n) => classify(n, 'W'));
  alignment[etTab] = rows;
}

// UNMATCHED TL headers not in B7 -> IGNORED
const ignored = [];
for (const [, tlTab, etTab] of B3M) {
  const hm = headerMap[etTab];
  if (!hm) continue;
  const inv = fieldInv[etTab] || { R: [], W: [] };
  const invNames = new Set([...(inv.R || []), ...(inv.W || [])]);
  for (const [tlH, etH] of Object.entries(hm.map)) {
    if (etH === null && !invNames.has(tlH)) ignored.push({ etTab, tlHeader: tlH });
  }
}

// ---- 0.5 required-exact ----
const businessExceptCBS = B3.filter((r) => !['chart', 'stock', 'boxes'].includes(r[0])).map((r) => r[2]);
const requiredExact = {
  // audit ones are non-blocking (P2 adds)
  __audit__: { tabs: businessExceptCBS, cols: AUDIT, blocking: false },
  erp_test_purchasing_costing: { cols: ['unique_id', 'approval_status', 'approval', 'approval_time'], blocking: true },
  erp_test_sales_invoices: { cols: ['invoice_unique_id', 'approval_status', 'approval', 'approval_time'], blocking: true },
  erp_test_sales_offer: { cols: ['offer_unique_id', 'approval_status', 'approval', 'approval_time'], blocking: true }, // OD-E: keep sheet's offer_unique_id
  erp_test_cash_bank_movement: { cols: ['transaction_id', 'approved', 'user'], blocking: true },
  erp_test_product_purchasing: { cols: ['unique_id', 'id'], blocking: true },
  erp_test_sales_products: { cols: ['unique_id', 'id'], blocking: true },
  erp_test_sales_returns: { cols: ['unique_id', 'id'], blocking: true },
  erp_test_sales_offer_products: { cols: ['unique_id', 'id'], blocking: true },
  erp_test_products: { cols: ['id'], blocking: true },
  erp_test_categories: { cols: ['id'], blocking: true },
  erp_test_customer_vendor: { cols: ['id'], blocking: true },
};
const reqExactResults = [];
let reqExactBlockingFail = 0;
for (const [key, spec] of Object.entries(requiredExact)) {
  const tabs = spec.tabs || [key];
  for (const tab of tabs) {
    const etHeaders = headersOf('erp_test', tab);
    for (const col of spec.cols) {
      const present = etHeaders !== null && etHeaders.indexOf(col) !== -1;
      const result = present ? 'PASS' : (spec.blocking ? 'FAIL' : 'MISSING(P2-adds)');
      if (!present && spec.blocking) reqExactBlockingFail++;
      reqExactResults.push({ tab, col, result });
    }
  }
}

// ---- 0.6 structure checks ----
const checks = [];
// 1. All 14 business tabs exist in erp_test
const missingBusinessTabs = B3.filter((r) => !isComputed(r[2]) && headersOf('erp_test', r[2]) === null).map((r) => r[2]);
checks.push({ n: 1, pass: missingBusinessTabs.length === 0, detail: missingBusinessTabs.length ? ('MISSING erp_test tabs: ' + missingBusinessTabs.join(', ')) : '13 sheet-backed tabs present; stock (current_products) computed live per OD-A' });
// 2. top_light_current_products formulas of current_qty and unit_cost
const tlcpFc = formulaColsOf('top_light', 'top_light_current_products');
const cq = tlcpFc['current_qty'] && tlcpFc['current_qty'].first;
const uc = tlcpFc['unit_cost'] && tlcpFc['unit_cost'].first;
checks.push({ n: 2, pass: !!(cq && uc), detail: 'current_qty.first=' + JSON.stringify(cq) + '\n\nunit_cost.first=' + JSON.stringify(uc) });
// 3. (OD-A reformulation) name-based: product, qty, total_cost exist in erp_test_product_purchasing (stock is computed by name, not position).
const ppTL = headersOf('top_light', 'top_light_product_purchasing') || [];
const ppET = headersOf('erp_test', 'erp_test_product_purchasing') || [];
const c3 = ['product', 'qty', 'total_cost'].every((c) => ppET.indexOf(c) !== -1);
checks.push({ n: 3, pass: c3, detail: '(OD-A name-based) product/qty/total_cost present in erp_test_product_purchasing=' + c3 + '; top_light indices product=' + ppTL.indexOf('product') + ' qty=' + ppTL.indexOf('qty') + ' total_cost=' + ppTL.indexOf('total_cost') + ' (plan said 7/10/13 — off by the movement_code column)' });
// 4. top_light_chart_of_accounts header names at index 8,13,14
const chH = headersOf('top_light', 'top_light_chart_of_accounts') || [];
const CHART_KEY_H = chH[8], CHART_NAME_H = chH[13], CHART_MAIN_H = chH[14];
checks.push({ n: 4, pass: !!(CHART_KEY_H && CHART_NAME_H && CHART_MAIN_H), detail: 'CHART_KEY_H(idx8)=' + JSON.stringify(CHART_KEY_H) + ' CHART_NAME_H(idx13)=' + JSON.stringify(CHART_NAME_H) + ' CHART_MAIN_H(idx14)=' + JSON.stringify(CHART_MAIN_H) });
// 5. erp_test_box_values contains 111101..111104 in المستوى الخامس column
const boxVals = discovery.erp_test_box_values;
let c5 = false, c5detail = 'erp_test_box_values missing';
if (Array.isArray(boxVals) && boxVals.length) {
  const hdr = boxVals[0].map(String);
  let col = hdr.indexOf('المستوى الخامس');
  const codes = new Set();
  if (col !== -1) boxVals.slice(1).forEach((r) => codes.add(String(r[col]).trim()));
  else boxVals.slice(1).forEach((r) => r.forEach((v) => codes.add(String(v).trim())));
  c5 = ['111101', '111102', '111103', '111104'].every((code) => codes.has(code));
  c5detail = 'col=' + col + ' codes=' + JSON.stringify([...codes]);
}
checks.push({ n: 5, pass: c5, detail: c5detail });
// 6. No erp_test tab has two headers mapping to the same TL header (i.e., no ET header claimed twice)
let c6 = true; const c6bad = [];
for (const [, , etTab] of B3M) {
  const hm = headerMap[etTab]; if (!hm) continue;
  const seen = {};
  for (const etH of Object.values(hm.map)) { if (etH === null) continue; seen[etH] = (seen[etH] || 0) + 1; }
  for (const [etH, cnt] of Object.entries(seen)) if (cnt > 1) { c6 = false; c6bad.push(etTab + ':' + etH + '(x' + cnt + ')'); }
}
checks.push({ n: 6, pass: c6, detail: c6bad.length ? c6bad.join(', ') : 'no duplicate ET target headers' });

// ---- write report ----
let md = '# erp_test header map report (P0)\n\n';
md += '_Generated by tools/erptest/build_header_map.js from discovery.json + field_inventory.json._\n\n';

md += '## Per-tab header map (TL header | ET header | match type)\n\n';
for (const [, tlTab, etTab] of B3M) {
  const hm = headerMap[etTab];
  md += '### ' + etTab + (hm.etTabMissing ? '  **(erp_test tab MISSING)**' : '') + '\n\n';
  md += '| TL header | ET header | match |\n|---|---|---|\n';
  const ovTab = OVERRIDES[etTab] || {};
  for (const [tlH, etH] of Object.entries(hm.map)) {
    const candidate = replaceAll(replaceAll(tlH, 'top_light_', 'erp_test_'), 'top_light', 'erp_test');
    let match = 'UNMATCHED';
    if (Object.prototype.hasOwnProperty.call(ovTab, tlH)) match = 'MANUAL';
    else if (etH !== null) match = (etH === candidate) ? 'EXACT' : 'NORMALIZED';
    md += '| ' + tlH + ' | ' + (etH === null ? '—' : etH) + ' | ' + match + ' |\n';
  }
  const unmatched = Object.entries(hm.map).filter(([, v]) => v === null).map(([k]) => k);
  md += '\n**UNMATCHED:** ' + (unmatched.length ? unmatched.join(' · ') : '(none)') + '\n';
  md += '\n**EXTRA (ET headers unused):** ' + (hm.extra.length ? hm.extra.join(' · ') : '(none)') + '\n\n';
}

md += '## Field alignment vs B7 (logical | class | erp_test header | status)\n\n';
for (const [etTab, rows] of Object.entries(alignment)) {
  md += '### ' + etTab + '\n\n| logical | class | erp_test header | status |\n|---|---|---|---|\n';
  for (const r of rows) md += '| ' + r.name + ' | ' + r.cls + ' | ' + r.physical + ' | ' + r.status + ' |\n';
  md += '\n';
}
md += '### MISSING-REQUIRED (' + missingRequired.length + ')\n\n';
md += missingRequired.length ? missingRequired.map((m) => '- ' + m.etTab + ' → `' + m.name + '`').join('\n') + '\n\n' : '_(none)_\n\n';
md += '### MISSING-OPTIONAL (' + missingOptional.length + ')\n\n';
md += missingOptional.length ? missingOptional.map((m) => '- ' + m.etTab + ' → `' + m.name + '`').join('\n') + '\n\n' : '_(none)_\n\n';
md += '### FORMULA-CONFLICT (' + formulaConflicts.length + ')\n\n';
md += formulaConflicts.length ? formulaConflicts.map((m) => '- ' + m.etTab + ' → `' + m.name + '` resolves to formula column `' + m.physical + '`').join('\n') + '\n\n' : '_(none)_\n\n';
md += '### IGNORED (TL header unmatched, not in B7) (' + ignored.length + ')\n\n';
md += ignored.length ? ignored.map((m) => '- ' + m.etTab + ' → `' + m.tlHeader + '`').join('\n') + '\n\n' : '_(none)_\n\n';

md += '## 0.5 Required-exact columns\n\n| tab | column | result |\n|---|---|---|\n';
for (const r of reqExactResults) md += '| ' + r.tab + ' | ' + r.col + ' | ' + r.result + ' |\n';
md += '\nBlocking required-exact failures: **' + reqExactBlockingFail + '**\n\n';

md += '## 0.6 Structure checks\n\n';
for (const c of checks) md += '- **Check ' + c.n + ': ' + (c.pass ? 'PASS' : 'FAIL') + '** — ' + c.detail + '\n';
md += '\n';

// ---- DONE-CHECK P0 verdict ----
const check16pass = checks.every((c) => c.pass);
const verdict = (missingRequired.length === 0 && formulaConflicts.length === 0 && reqExactBlockingFail === 0 && check16pass);
md += '## DONE-CHECK P0\n\n';
md += '- MISSING-REQUIRED: ' + missingRequired.length + '\n';
md += '- FORMULA-CONFLICT: ' + formulaConflicts.length + '\n';
md += '- Required-exact blocking failures: ' + reqExactBlockingFail + '\n';
md += '- Structure checks 1-6 all PASS: ' + check16pass + '\n';
md += '\n**VERDICT: ' + (verdict ? 'PASS' : 'FAIL — STOP') + '**\n';

fs.writeFileSync(DIR + '/header_map_report.md', md, 'utf8');

// ---- console summary ----
console.log('MISSING-REQUIRED:', missingRequired.length);
console.log('MISSING-OPTIONAL:', missingOptional.length);
console.log('FORMULA-CONFLICT:', formulaConflicts.length);
console.log('required-exact blocking failures:', reqExactBlockingFail);
checks.forEach((c) => console.log('check ' + c.n + ':', c.pass ? 'PASS' : 'FAIL'));
console.log('DONE-CHECK P0 VERDICT:', verdict ? 'PASS' : 'FAIL — STOP');
console.log('wrote header_map.json + header_map_report.md');
