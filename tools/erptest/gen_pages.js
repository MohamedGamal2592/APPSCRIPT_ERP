// P4 — clone the 22 Top Light page templates to Company_ErpTest_<X>.html (plan 4.1 + 4.2).
// Reads/writes local files only. Regenerate with: node tools/erptest/gen_pages.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const PAGES = ['Cash', 'Cash_Report', 'Customer_Statement', 'Customers', 'Dashboard', 'Financial_Position', 'Income_Statement',
  'KPI', 'Product_Movement', 'Products', 'Purchase_Needs', 'Purchase_Print', 'Purchasing', 'Sales', 'Sales_Analysis',
  'Sales_Costing_Analysis', 'Sales_Costing_Print', 'Sales_Offer', 'Sales_Offer_Print', 'Sales_Print', 'Sales_Release', 'Sales_Returns'];

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
].sort((a, b) => b[0].length - a[0].length);

const B3_TABS = ['products', 'categories', 'customer_vendor', 'chart_of_accounts', 'current_products', 'purchasing_costing',
  'product_purchasing', 'sales_invoices', 'sales_products', 'sales_returns', 'sales_offer', 'sales_offer_products',
  'cash_bank_movement', 'box_account_codes'].sort((a, b) => b.length - a.length);

const all = (s, a, b) => s.split(a).join(b);
const missing = PAGES.filter((p) => !fs.existsSync(`${ROOT}/Company_TopLight_${p}.html`));
if (missing.length) { console.error('STOP — missing Top Light templates: ' + missing.join(', ')); process.exit(1); }

PAGES.forEach((p) => {
  let s = fs.readFileSync(`${ROOT}/Company_TopLight_${p}.html`, 'utf8');
  s = all(s, '8df5c89a117fe9a5', '37fc50edf1424abd');                                   // 4.2.1
  s = all(s, "include('Company_TopLight_Nav')", "include('Company_ErpTest_Nav')");      // 4.2.2
  s = all(s, 'TOPLIGHT_MENU', 'ERPTEST_MENU');                                         // 4.2.3
  B4.forEach(([o, n]) => { s = all(s, `'${o}'`, `'${n}'`); s = all(s, `"${o}"`, `"${n}"`); }); // 4.2.4
  B4.forEach(([o, n]) => { s = s.replace(new RegExp('\\b' + o + '\\b', 'g'), n); });   // comments / unquoted mentions
  s = s.replace(/\btl_/g, 'et_');                                                       // 4.2.5
  s = all(s, 'القمة لايت', 'النظام التجريبي');                                          // 4.2.6
  s = all(s, 'Top Light', 'Testing System');                                           // 4.2.7
  // Table names used by the history panel (e.g. SESSION.openHistory('top_light_cash_bank_movement', …)).
  B3_TABS.forEach((t) => { s = all(s, 'top_light_' + t, 'erp_test_' + t); });
  s = all(s, 'Company_TopLight_', 'Company_ErpTest_');
  fs.writeFileSync(`${ROOT}/Company_ErpTest_${p}.html`, s, 'utf8');
});
console.log('wrote ' + PAGES.length + ' Company_ErpTest_*.html pages');
