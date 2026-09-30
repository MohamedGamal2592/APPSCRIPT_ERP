// P3 steps 3.6 + 3.7 — generate Company_ErpTest_Registry.js and Company_ErpTest_Nav.html
// from the Top Light originals. Reads/writes local files only.
// Regenerate with: node tools/erptest/gen_registry_nav.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

const problems = [];
const count = (s, sub) => s.split(sub).length - 1;
const all = (s, a, b) => s.split(a).join(b);

const B3_TABS = [
  'products', 'categories', 'customer_vendor', 'chart_of_accounts', 'current_products',
  'purchasing_costing', 'product_purchasing', 'sales_invoices', 'sales_products', 'sales_returns',
  'sales_offer', 'sales_offer_products', 'cash_bank_movement', 'box_account_codes',
];

// ---------- 3.6 Registry ----------
let r = fs.readFileSync(ROOT + '/Company_TopLight_Registry.js', 'utf8');
if (count(r, '8df5c89a117fe9a5') < 1) problems.push('registry: uid not found');
r = all(r, '8df5c89a117fe9a5', '37fc50edf1424abd');                       // 3.3.5
B3_TABS.forEach((t) => {                                                  // 3.3.7
  r = all(r, `'top_light_${t}'`, `'erp_test_${t}'`);
  r = all(r, `"top_light_${t}"`, `"erp_test_${t}"`);
});
r = r.replace(/(['"])tl_/g, '$1et_');                                     // 3.3.9
if (count(r, 'function registerTopLight_') !== 1) problems.push('registry: registerTopLight_ not found once');
r = all(r, 'registerTopLight_', 'registerErpTest_');
r = all(r, 'TopLight.', 'ErpTest.');
r = all(r, 'Top Light', 'Testing System');
// B2 file prefix / B5 templates: the pages must render the ErpTest templates.
r = all(r, 'Company_TopLight_', 'Company_ErpTest_');

// 3.6.3 append the two manufacturing pages at the end of `pages`
const PAGES_END = "      { action: 'et_product_movement', template: 'Company_ErpTest_Product_Movement', title: 'حركة المنتج', nav: false }\n    ]";
if (count(r, PAGES_END) !== 1) problems.push('registry: pages array end not found');
r = r.replace(PAGES_END,
  "      { action: 'et_product_movement', template: 'Company_ErpTest_Product_Movement', title: 'حركة المنتج', nav: false },\n" +
  "      { action: 'et_manufacture', template: 'Company_ErpTest_Manufacture', title: 'Testing System — التصنيع', label: 'التصنيع' },\n" +
  "      { action: 'et_manufacture_print', template: 'Company_ErpTest_Manufacture_Print', title: 'أمر تصنيع', nav: false }\n    ]");

// 3.6.4 append the manufacture table at the end of `tables`
const TABLES_END = "      { id: 'et_cash_tbl', sheetName: 'erp_test_cash_bank_movement', pkColumn: 'unique_id', labelAr: 'حركة النقدية', pageId: 'et_cash' }\n    ]";
if (count(r, TABLES_END) !== 1) problems.push('registry: tables array end not found');
r = r.replace(TABLES_END,
  "      { id: 'et_cash_tbl', sheetName: 'erp_test_cash_bank_movement', pkColumn: 'unique_id', labelAr: 'حركة النقدية', pageId: 'et_cash' },\n" +
  "      { id: 'et_manufacture_tbl', sheetName: 'erp_test_manufacture_orders', pkColumn: 'unique_id', labelAr: 'التصنيع', pageId: 'et_manufacture' }\n    ]");

// ---------- 3.7 Nav ----------
let n = fs.readFileSync(ROOT + '/Company_TopLight_Nav.html', 'utf8');
n = all(n, 'TOPLIGHT_MENU', 'ERPTEST_MENU');
n = all(n, 'tl_', 'et_');
n = all(n, 'Top Light', 'Testing System');
n = all(n, 'Company_TopLight_Nav', 'Company_ErpTest_Nav');

if (problems.length) { console.error('FAILED:\n  - ' + problems.join('\n  - ')); process.exit(1); }
fs.writeFileSync(ROOT + '/Company_ErpTest_Registry.js', r, 'utf8');
fs.writeFileSync(ROOT + '/Company_ErpTest_Nav.html', n, 'utf8');
console.log('wrote Company_ErpTest_Registry.js and Company_ErpTest_Nav.html');
