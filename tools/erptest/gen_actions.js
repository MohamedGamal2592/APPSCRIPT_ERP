// P3 — generate Company_ErpTest_Actions.js from Company_TopLight_Actions.js.
// Deterministic codemod with assertions (fails loudly if the source drifts from
// the plan). Implements plan 3.2-3.5 + 3.12, plus owner decisions OD-A/OD-C/OD-E.
// Reads/writes local files only. Regenerate with: node tools/erptest/gen_actions.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = ROOT + '/Company_TopLight_Actions.js';
const OUT = ROOT + '/Company_ErpTest_Actions.js';

let s = fs.readFileSync(SRC, 'utf8');
const problems = [];
function count(str, sub) { return str.split(sub).length - 1; }
function replaceOnce(find, repl) {
  const n = count(s, find);
  if (n !== 1) { problems.push(`expected 1 of ${JSON.stringify(find.slice(0, 60))}, found ${n}`); return; }
  s = s.replace(find, repl);
}
function replaceExactCount(find, repl, expect) {
  const n = count(s, find);
  if (n !== expect) { problems.push(`expected ${expect} of ${JSON.stringify(find.slice(0, 40))}, found ${n}`); return; }
  s = s.split(find).join(repl);
}
function replaceAll(find, repl) { s = s.split(find).join(repl); }

// ---------- 3.3.12 (do the approvalPolicy block first, matching the original) ----------
const APPROVAL_NEW = `ErpTest.approvalPolicy_ = {
  aliases: { et_sales_offer: 'et_offer' },
  chains: [
    { docType: 'et_purchasing', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_purchasing_costing', keyColumn: 'unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
    { docType: 'et_sales', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_sales_invoices', keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
    { docType: 'et_cash', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_cash_bank_movement', keyColumn: 'transaction_id', kind: 'cash', versioned: true, missingMsg: 'الحركة غير موجودة' },
    { docType: 'et_sales_offer', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_sales_offer', keyColumn: 'offer_unique_id', kind: 'standard', versioned: true, missingMsg: 'العرض غير موجود' },
    { docType: 'et_manufacture', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_manufacture_orders', keyColumn: 'unique_id', kind: 'standard', versioned: true, missingMsg: 'أمر التصنيع غير موجود' }
  ],
  transitions: {
    et_purchasing: { pending: ['approved'], approved: [] },
    et_sales: { pending: ['approved'], approved: [] },
    et_offer: { pending: ['approved'], approved: [] },
    et_sales_offer: { pending: ['approved'], approved: [] },
    et_cash: { false: ['true'], true: [] },
    et_manufacture: { pending: ['approved'], approved: [] }
  },
  actionToDocType: {
    add_et_purchasing: 'et_purchasing', edit_et_purchasing: 'et_purchasing', delete_et_purchasing: 'et_purchasing', approve_et_purchasing: 'et_purchasing',
    add_et_sales: 'et_sales', edit_et_sales: 'et_sales', delete_et_sales: 'et_sales', approve_et_sales: 'et_sales',
    add_et_sales_offer: 'et_offer', edit_et_sales_offer: 'et_offer', delete_et_sales_offer: 'et_offer', approve_et_sales_offer: 'et_offer',
    add_et_cash: 'et_cash', edit_et_cash: 'et_cash', delete_et_cash: 'et_cash', approve_et_cash: 'et_cash', add_et_transfer: 'et_cash',
    add_et_manufacture: 'et_manufacture', edit_et_manufacture: 'et_manufacture', delete_et_manufacture: 'et_manufacture',
    approve_et_manufacture: 'et_manufacture', complete_et_manufacture: 'et_manufacture', cancel_et_manufacture: 'et_manufacture'
  },
  statusOnly: {
    approve_et_purchasing: true, approve_et_sales: true, approve_et_sales_offer: true, approve_et_cash: true,
    delete_et_purchasing: true, delete_et_sales: true, delete_et_sales_offer: true, delete_et_cash: true,
    approve_et_manufacture: true, delete_et_manufacture: true, complete_et_manufacture: true, cancel_et_manufacture: true
  }
};`;
// Match the original block from its start to the closing "};" that precedes attachmentPolicy_.
{
  const start = s.indexOf('TopLight.approvalPolicy_ = {');
  const anchor = s.indexOf('TopLight.attachmentPolicy_', start);
  if (start === -1 || anchor === -1) problems.push('approvalPolicy block not found');
  else {
    const end = s.lastIndexOf('};', anchor) + 2;
    s = s.slice(0, start) + APPROVAL_NEW + s.slice(end);
  }
}

// ---------- 3.3.5 uid ----------
replaceExactCount('8df5c89a117fe9a5', '37fc50edf1424abd', 4);

// ---------- 3.3.1-3.3.4 namespace ----------
replaceOnce('const TopLight = (function', 'const ErpTest = (function');
replaceAll('TopLight.attachmentPolicy_', 'ErpTest.attachmentPolicy_');
replaceAll('TopLight.artifactHandlers_', 'ErpTest.artifactHandlers_');

// ---------- 3.3.6 action renames (B4, non-KEEP), longest old-name first ----------
const B4 = [
  ['get_dashboard_data', 'get_et_dashboard_data'], ['get_kpi_data', 'get_et_kpi_data'],
  ['get_products', 'get_et_products'], ['add_product', 'add_et_product'], ['edit_product', 'edit_et_product'],
  ['get_parties', 'get_et_parties'], ['add_party', 'add_et_party'], ['edit_party', 'edit_et_party'],
  ['get_purchasing_headers', 'get_et_purchasing_headers'], ['get_purchasing_options', 'get_et_purchasing_options'],
  ['get_purchasing_lines', 'get_et_purchasing_lines'], ['get_purchase_print', 'get_et_purchase_print'],
  ['add_purchasing', 'add_et_purchasing'], ['edit_purchasing', 'edit_et_purchasing'], ['delete_purchasing', 'delete_et_purchasing'], ['approve_purchasing', 'approve_et_purchasing'],
  ['get_sales_headers', 'get_et_sales_headers'], ['get_sales_options', 'get_et_sales_options'], ['get_sales_lines', 'get_et_sales_lines'],
  ['get_sales_print', 'get_et_sales_print'], ['get_sales_costing', 'get_et_sales_costing'],
  ['add_sales', 'add_et_sales'], ['edit_sales', 'edit_et_sales'], ['delete_sales', 'delete_et_sales'], ['approve_sales', 'approve_et_sales'],
  ['get_sales_returns', 'get_et_sales_returns'], ['add_sales_return', 'add_et_sales_return'], ['delete_sales_return', 'delete_et_sales_return'],
  ['get_cash_headers', 'get_et_cash_headers'], ['add_cash', 'add_et_cash'], ['edit_cash', 'edit_et_cash'], ['delete_cash', 'delete_et_cash'], ['approve_cash', 'approve_et_cash'],
  ['add_transfer', 'add_et_transfer'], ['get_customer_statement', 'get_et_customer_statement'],
  ['get_sales_offer_headers', 'get_et_sales_offer_headers'], ['get_sales_offer_lines', 'get_et_sales_offer_lines'], ['get_sales_offer_print', 'get_et_sales_offer_print'],
  ['add_sales_offer', 'add_et_sales_offer'], ['edit_sales_offer', 'edit_et_sales_offer'], ['delete_sales_offer', 'delete_et_sales_offer'], ['approve_sales_offer', 'approve_et_sales_offer'],
  ['get_sales_analysis', 'get_et_sales_analysis'], ['get_sales_costing_analysis', 'get_et_sales_costing_analysis'],
  ['get_income_statement', 'get_et_income_statement'], ['get_financial_position', 'get_et_financial_position'],
  ['get_cash_report', 'get_et_cash_report'], ['get_purchase_needs', 'get_et_purchase_needs'], ['get_product_movement', 'get_et_product_movement'],
];
B4.slice().sort((a, b) => b[0].length - a[0].length).forEach(([oldN, newN]) => {
  replaceAll(`'${oldN}'`, `'${newN}'`);
  replaceAll(`"${oldN}"`, `"${newN}"`);
});
// Remaining bare mentions of old action names live only in comments; rename them too
// so the static checker's word-boundary scan (3.11.2) stays clean.
B4.slice().sort((a, b) => b[0].length - a[0].length).forEach(([oldN, newN]) => {
  s = s.replace(new RegExp('\\b' + oldN + '\\b', 'g'), newN);
});

// ---------- 3.3.7 tab renames (B3), quoted so FK names are untouched ----------
const B3_TABS = [
  'products', 'categories', 'customer_vendor', 'chart_of_accounts', 'current_products',
  'purchasing_costing', 'product_purchasing', 'sales_invoices', 'sales_products', 'sales_returns',
  'sales_offer', 'sales_offer_products', 'cash_bank_movement', 'box_account_codes',
];
B3_TABS.forEach((t) => {
  replaceAll(`'top_light_${t}'`, `'erp_test_${t}'`);
  replaceAll(`"top_light_${t}"`, `"erp_test_${t}"`);
});

// ---------- 3.3.8 history-uid prefixes ----------
replaceAll("'create_top_light_", "'create_erp_test_");
replaceAll("'update_top_light_", "'update_erp_test_");
replaceAll("'delete_top_light_", "'delete_erp_test_");

// ---------- 3.3.9 tl_ -> et_ inside string literals ----------
s = s.replace(/(['"])tl_/g, '$1et_');

// ---------- 3.3.10 + brand strings (for the static checker) ----------
replaceAll("'شركة القمة لايت'", "'النظام التجريبي'");
replaceAll('Top Light', 'Testing System');

// ---------- 3.3.11 theme colours + function rename ----------
[['#111111', '#1e3a8a'], ['#000000', '#172554'], ['#fbbf24', '#ffffff'], ['#fde68a', '#dbeafe'],
 ['#fef08a', '#dbeafe'], ['rgba(17, 17, 17,', 'rgba(30, 58, 138,'], ['#b45309', '#1d4ed8'], ['#f59e0b', '#3b82f6']]
  .forEach(([a, b]) => replaceAll(a, b));
replaceAll('topLightThemeCss_', 'erpTestThemeCss_');

// ---------- 3.5.1 / 3.5.2 repository -> translation layer (before inserting the layer) ----------
replaceExactCount('getHeaders_(', 'etHeaders_(', 16);
replaceExactCount('getAllRecords_(', 'etRecords_(', 2);

// ---------- 3.5.3 id-column arguments ----------
replaceOnce('getNextIdUnderLock_(dbId, table)', "getNextIdUnderLock_(dbId, table, etCol_(table, 'id'))");
replaceOnce("getNextIdBatch_(dbId, PURCHASING_LINES_SHEET, lines.length, 'id')", "getNextIdBatch_(dbId, PURCHASING_LINES_SHEET, lines.length, etCol_(PURCHASING_LINES_SHEET, 'id'))");
replaceOnce("getNextIdBatch_(dbId, SALES_LINES_SHEET, lines.length, 'id')", "getNextIdBatch_(dbId, SALES_LINES_SHEET, lines.length, etCol_(SALES_LINES_SHEET, 'id'))");
replaceOnce("getNextIdBatch_(dbId, OFFER_LINES_SHEET, lines.length, 'id')", "getNextIdBatch_(dbId, OFFER_LINES_SHEET, lines.length, etCol_(OFFER_LINES_SHEET, 'id'))");
replaceOnce("getNextId_(dbId, CASH_SHEET, 'transaction_id')", "getNextId_(dbId, CASH_SHEET, etCol_(CASH_SHEET, 'transaction_id'))");
replaceOnce("getNextIdBatch_(dbId, CASH_SHEET, 2, 'transaction_id')", "getNextIdBatch_(dbId, CASH_SHEET, 2, etCol_(CASH_SHEET, 'transaction_id'))");

// ---------- 3.5.4 chart positional lookup -> by name ----------
replaceOnce(
  `        const sheet = getSheet_(CHART_SHEET, dbId);
        const values = sheet.getDataRange().getValues();
        const out = {};
        for (let i = 1; i < values.length; i++) {
          const key = String(values[i][8] == null ? '' : values[i][8]).trim();
          if (!key || out[key]) continue;
          out[key] = { name: values[i][13] == null ? '' : values[i][13], main: values[i][14] == null ? '' : values[i][14] };
        }
        return out;`,
  `        const out = {};
        etRecords_(dbId, CHART_SHEET).forEach(function (r) {
          const key = String(r[ET_CHART_COLS.key] == null ? '' : r[ET_CHART_COLS.key]).trim();
          if (!key || out[key]) return;
          out[key] = { name: r[ET_CHART_COLS.name] == null ? '' : r[ET_CHART_COLS.name], main: r[ET_CHART_COLS.main] == null ? '' : r[ET_CHART_COLS.main] };
        });
        return out;`);

// ---------- OD-A: virtualize current_products in tlDbList_ ----------
replaceOnce(
  `  function tlDbList_(dbId, table) {
    const rows = etRecords_(dbId, table);`,
  `  function tlDbList_(dbId, table) {
    if (table === CURRENT_PRODUCTS_SHEET) return etStockRows_(dbId);
    const rows = etRecords_(dbId, table);`);

// ---------- 3.4 + OD-A helpers + 3.12 schemaCheck_ : insert after COMPANY_UID ----------
const INSERT = `

  // --- erp_test header translation layer (ET_HEADER_MAP is a global from Company_ErpTest_Schema.js) ---
  var _etReverseMemo = {};
  function etMapFor_(sheetName) { return (typeof ET_HEADER_MAP !== 'undefined' && ET_HEADER_MAP[sheetName]) || {}; }
  function etToPhysical_(sheetName, logical) { return etMapFor_(sheetName)[logical] || logical; }
  function etToLogical_(sheetName, physical) {
    var p = String(physical == null ? '' : physical).trim();
    if (!_etReverseMemo[sheetName]) {
      var rev = {}, m = etMapFor_(sheetName);
      Object.keys(m).forEach(function (k) { rev[m[k]] = k; });
      _etReverseMemo[sheetName] = rev;
    }
    return _etReverseMemo[sheetName][p] || p;
  }
  function etHeaders_(sheet) { return getHeaders_(sheet).map(function (h) { return etToLogical_(sheet.getName(), String(h).trim()); }); }
  function etRecords_(dbId, sheetName) {
    var rows = getAllRecords_(dbId, sheetName), m = etMapFor_(sheetName);
    if (!Object.keys(m).length) return rows;
    return rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { o[etToLogical_(sheetName, k)] = r[k]; }); return o; });
  }
  function etCol_(sheetName, logical) { return etToPhysical_(sheetName, logical); }

  // --- OD-A: stock is computed live from transactions (no current_products sheet) ---
  //   qty = Σ purchases.qty − Σ sales.product_qty + Σ returns.return_qty (by product id)
  //   unit_cost = first live purchase line's total_cost/qty (qty>0), per OD1
  //   total_cost_sign = unit_cost × qty
  //   NOTE (P7): manufacturing in/out is folded in when the manufacture tabs exist.
  function etStockMap_(dbId) {
    var qty = {}, firstCost = {};
    tlDbList_(dbId, PURCHASING_LINES_SHEET).forEach(function (r) {
      var p = String(r.product == null ? '' : r.product).trim(); if (!p) return;
      qty[p] = (qty[p] || 0) + num0_(r.qty);
      if (firstCost[p] === undefined) { var q = num0_(r.qty); if (q > 0) firstCost[p] = num0_(r.total_cost) / q; }
    });
    tlDbList_(dbId, SALES_LINES_SHEET).forEach(function (r) {
      var p = String(r.product_id == null ? '' : r.product_id).trim(); if (!p) return;
      qty[p] = (qty[p] || 0) - num0_(r.product_qty);
    });
    tlDbList_(dbId, SALES_RETURNS_SHEET).forEach(function (r) {
      var p = String(r['top_lightsales_products_id'] == null ? '' : r['top_lightsales_products_id']).trim(); if (!p) return;
      qty[p] = (qty[p] || 0) + num0_(r['top_lightreturn_qty']);
    });
    var out = {};
    Object.keys(qty).forEach(function (p) { var uc = firstCost[p] || 0; out[p] = { qty: qty[p], unit_cost: uc, cost: uc * qty[p] }; });
    return out;
  }
  function etStockRows_(dbId) {
    var m = etStockMap_(dbId), rows = [];
    Object.keys(m).forEach(function (p) { rows.push({ unique_id: p, product: '', unit: '', current_qty: m[p].qty, unit_cost: m[p].unit_cost, total_cost_sign: m[p].cost }); });
    return rows;
  }

  // --- 3.12 runtime schema check (physical names against the real sheet) ---
  function etSchemaCheck_(dbId) {
    var missingRequired = [], missingOptional = [];
    Object.keys(ET_FIELD_INVENTORY).forEach(function (tab) {
      var physical = [];
      try { physical = getHeaders_(getSheet_(tab, dbId)).map(function (h) { return String(h).trim(); }); } catch (e) { physical = []; }
      var inv = ET_FIELD_INVENTORY[tab];
      ['R', 'W'].forEach(function (cls) {
        (inv[cls] || []).forEach(function (name) {
          var p = etToPhysical_(tab, name);
          if (physical.indexOf(p) === -1) (cls === 'R' ? missingRequired : missingOptional).push({ tab: tab, name: name, physical: p });
        });
      });
    });
    return { ok: missingRequired.length === 0, missingRequired: missingRequired, missingOptional: missingOptional };
  }`;
replaceOnce("  const COMPANY_UID = '37fc50edf1424abd';", "  const COMPANY_UID = '37fc50edf1424abd';" + INSERT);

// ---------- 3.12.3 export schemaCheck_ in the return object ----------
replaceOnce('return { dispatch_: dispatch_,', 'return { dispatch_: dispatch_,\n    schemaCheck_: etSchemaCheck_,');

// ---------- 3.12.4 global runner at the bottom ----------
s += `
function etSchemaCheckRun_() { var r = ErpTest.schemaCheck_('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE'); console.log(JSON.stringify(r)); return r; }
`;

// ---------- finalize ----------
if (problems.length) {
  console.error('CODEMOD FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
fs.writeFileSync(OUT, s, 'utf8');
console.log('wrote Company_ErpTest_Actions.js (' + s.split('\n').length + ' lines)');
console.log('sanity: getHeaders_(=' + count(s, 'getHeaders_(') + ' (expect 2), getAllRecords_(=' + count(s, 'getAllRecords_(') + ' (expect 1), 8df5c89a117fe9a5=' + count(s, '8df5c89a117fe9a5') + ' (0)');
