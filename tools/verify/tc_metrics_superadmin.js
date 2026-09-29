'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const actions = fs.readFileSync(path.join(root, 'Company_TopChemical_Actions.js'), 'utf8');
const productsPage = fs.readFileSync(path.join(root, 'Company_TopChemical_ProductsLive.html'), 'utf8');
const stockPage = fs.readFileSync(path.join(root, 'Company_TopChemical_StockScan.html'), 'utf8');
const financialPage = fs.readFileSync(path.join(root, 'Company_TopChemical_FinancialRatios.html'), 'utf8');

function check(condition, message) {
  assert.ok(condition, message);
  console.log('  PASS  ' + message);
}

console.log('\n1 — server response redaction by authenticated role');
const sanitizerSource = actions.match(/function readDiagnosticsForUser_\(result, user\) \{[\s\S]*?\n  \}/);
assert(sanitizerSource, 'diagnostic response sanitizer exists');
const securityContext = { Object };
vm.createContext(securityContext);
vm.runInContext(sanitizerSource[0] + '\nthis.sanitize = readDiagnosticsForUser_;', securityContext);
const original = {
  status: 'ok', rows: [{ id: '7' }], count: 1,
  _mysql: { connection_ms: 12 }, timing_ms: { query: 4 }, payload_bytes: 800,
  served_at: 123, catalog_ttl_ms: 30000
};
const regular = securityContext.sanitize(original, { isSuperAdmin: false });
assert.deepStrictEqual(JSON.parse(JSON.stringify(regular)), { status: 'ok', rows: [{ id: '7' }], count: 1 });
assert.ok(original._mysql && original.timing_ms && original.payload_bytes === 800,
  'redaction clones the response instead of mutating the source object');
assert.strictEqual(securityContext.sanitize(original, { isSuperAdmin: true }), original,
  'super admins keep the complete response for diagnostics');
check(true, 'non-admin responses keep business data while hiding MySQL timings and payload/cache measurements');

console.log('\n2 — page diagnostics are created only for super admins');
check(/var IS_SUPER_ADMIN\s*=\s*<\?!= user && user\.isSuperAdmin \? 'true' : 'false' \?>/.test(productsPage) &&
  /function renderPlMeasurement\(m\) \{\s*if \(!IS_SUPER_ADMIN\) return;/.test(productsPage) &&
  /\(IS_SUPER_ADMIN \? '<div class="pl-measurement"/.test(productsPage),
  'tc_products_live measurement DOM, renderer, and stopwatch are super-admin gated');
check(/var IS_SUPER_ADMIN\s*=\s*<\?!= user && user\.isSuperAdmin \? 'true' : 'false' \?>/.test(stockPage) &&
  /function renderScanCatalogMetrics_\(metrics\) \{\s*if \(!IS_SUPER_ADMIN\) return;/.test(stockPage) &&
  /\(IS_SUPER_ADMIN \? '<div id="scan-catalog-metrics"/.test(stockPage),
  'tc_stock_scan diagnostics DOM, renderer, and stopwatch are super-admin gated');
check(/var IS_SUPER_ADMIN\s*=\s*<\?!= user && user\.isSuperAdmin \? 'true' : 'false' \?>/.test(financialPage) &&
  /\(IS_SUPER_ADMIN \? '<section class="fr-diagnostics"/.test(financialPage) &&
  /function frRenderMeasurement_\(\) \{\s*if \(!IS_SUPER_ADMIN\) return;/.test(financialPage) &&
  /function frRecordMeasurementCall_\([^]*?\n    if \(!IS_SUPER_ADMIN\) return;/.test(financialPage),
  'financial report timings and their UI are super-admin gated');
[
  ['tc_products_live', productsPage],
  ['tc_stock_scan', stockPage],
  ['tc_financial_ratios', financialPage]
].forEach(([name, html]) => {
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi));
  assert(scripts.length, name + ' has inline page scripts');
  scripts.forEach((match, index) => {
    new vm.Script(match[1].replace(/<\?[\s\S]*?\?>/g, 'false'),
      { filename: name + '.inline-' + index + '.js' });
  });
  check(true, name + ' inline scripts parse with template values substituted');
});

console.log('\n3 — every measured action removes diagnostics before RPC serialization');
check(/function getProductsLive_\(data, user, dbId\) \{\s*return readDiagnosticsForUser_\(dbProductsLiveList_\(data \|\| \{\}, user\), user\);/.test(actions),
  'tc_products_live list response strips diagnostics for non-admin users');
check(/return readDiagnosticsForUser_\(\{ status: 'ok', columns: columns, rows: rows, count: rows\.length,[\s\S]*?timing_ms: timing \}, user\);/.test(actions),
  'products direct-test endpoint strips diagnostics for non-admin users');
check(/function getProductsLiveDirectTest_\(data, user\) \{\s*if \(!user \|\| !user\.isSuperAdmin\) throw new Error\(/.test(actions),
  'the full-table timing experiment itself is restricted to super admins');
[
  ['get_stock_scan_options', 'getStockScanOptions_'],
  ['get_stock_scan_sheet_catalog', 'getStockScanSheetCatalog_'],
  ['get_stock_scan_warehouses', 'getStockScanWarehouses_'],
  ['get_stock_scan_balance', 'getStockScanBalance_'],
  ['get_stock_scan_catalog', 'getStockScanCatalog_'],
  ['get_stock_scan_balances', 'getStockScanBalances_'],
  ['get_stock_scan_history', 'getStockScanHistory_'],
  ['get_stock_scan_qty', 'getSystemQty_']
].forEach(([action, handler]) => {
  const registration = new RegExp("register\\('" + action + "',[\\s\\S]{0,180}readDiagnosticsForUser_\\(" + handler + "\\(");
  check(registration.test(actions), action + ' response strips non-admin diagnostics');
});
[
  ['get_financial_sales_totals', 'dbTcFinancialSalesTotals_'],
  ['get_financial_other_income', 'dbTcFinancialOtherIncome_'],
  ['get_financial_expenses', 'dbTcFinancialExpenses_'],
  ['get_financial_production', 'dbTcFinancialProduction_'],
  ['get_financial_used_materials', 'dbTcFinancialUsedMaterials_']
].forEach(([action, handler]) => {
  const registration = new RegExp("register\\('" + action + "',[\\s\\S]{0,150}readDiagnosticsForUser_\\(" + handler + "\\(");
  check(registration.test(actions), action + ' response strips non-admin diagnostics');
});

console.log('\ntc_metrics_superadmin: PASS');
