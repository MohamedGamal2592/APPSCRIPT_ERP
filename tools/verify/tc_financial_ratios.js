'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '../..');
const server = fs.readFileSync(path.join(root, 'Company_TopChemical_Actions.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'Company_TopChemical_FinancialRatios.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'Company_TopChemical_Nav.html'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'Company_TopChemical_Registry.js'), 'utf8');
const start = server.indexOf('  // Financial ratios page:');
const end = server.indexOf('  const BOX_CACHE_SCOPE =', start);
assert(start >= 0 && end > start, 'financial sales implementation exists');

const log = { sql: '', binds: [], queries: [], closed: [] };
const context = {
  Date, Number, String, Error,
  readDiagnosticsForUser_(result) { return result; },
  register(name, handler) {
    if (name === 'get_financial_sales_totals') context.handler = handler;
    if (name === 'get_financial_other_income') context.incomeHandler = handler;
    if (name === 'get_financial_expenses') context.expensesHandler = handler;
    if (name === 'get_financial_production') context.productionHandler = handler;
    if (name === 'get_financial_used_materials') context.usedMaterialsHandler = handler;
  },
  dbGetConnection_() {
    return {
      prepareStatement(sql) {
        log.sql = sql;
        const query = { sql, binds: [] };
        log.queries.push(query);
        return {
          setObject(i, value) { log.binds[i - 1] = value; query.binds[i - 1] = value; },
          executeQuery() {
            let row = 0;
            return {
              next() { row++; return sql.includes('COUNT(DISTINCT h.product_id)') || sql.includes('COUNT(*) FROM (SELECT CAST(v.col2_prod_id') ? row <= 1 : sql.includes('manufacture_report_view') ? row <= 30 : sql.includes('manufacture_headers') ? row <= 30 : sql.includes('DATE_FORMAT') ? row <= 2 : sql.includes('expenses_income_report') ? row <= 2 : row <= 1; },
              getObject(i) {
                if (sql.includes('COUNT(DISTINCT h.product_id)')) return 35;
                if (sql.includes('COUNT(*) FROM (SELECT CAST(v.col2_prod_id')) return 35;
                if (sql.includes('manufacture_report_view')) {
                  if (i === 1) return row;
                  if (i === 2) return 'مادة ' + row;
                  if (i === 3) return 'كجم';
                  return { 4: 5, 5: 6, 6: 1, 7: 20, 8: 35 }[i];
                }
                if (sql.includes('manufacture_headers')) {
                  if (i === 1) return 'p-' + row;
                  if (i === 2) return 'اسم المنتج ' + row;
                  return i === 3 ? 40 + row : 35 + row;
                }
                if (sql.includes('DATE_FORMAT')) {
                  if (i === 1) return row === 1 ? '2026-01' : '2026-02';
                  if (sql.includes('monthly_events')) return i === 2 ? (row === 1 ? 100 : 150) : (row === 1 ? 10 : 30);
                  return row === 1 ? 100 : 150;
                }
                if (sql.includes('expenses_income_report')) return row === 1 ? 30 : 10;
                return i === 1 ? 250 : 40;
              },
              getString() { return sql.includes('DATE_FORMAT') ? (row === 1 ? '2026-01' : '2026-02') : 'Income account ' + row; },
              close() { log.closed.push('result'); }
            };
          },
          close() { log.closed.push('statement'); }
        };
      },
      close() { log.closed.push('connection'); }
    };
  },
  dbBindParams_(stmt, values) { values.forEach((v, i) => stmt.setObject(i + 1, v)); }
};
vm.createContext(context);
vm.runInContext(server.slice(start, end), context);

const filters = { from: '2026-01-01', to: '2026-03-31' };
const result = context.handler(filters, {});
assert.strictEqual(result.sales_value, 250);
assert.strictEqual(result.return_value, 40);
assert.strictEqual(result.net_sales_value, 210);
assert.deepStrictEqual(JSON.parse(JSON.stringify(result.monthly)), [
  { month: '2026-01', sales_value: 100, return_value: 10, net_sales_value: 90 },
  { month: '2026-02', sales_value: 150, return_value: 30, net_sales_value: 120 }
]);
const totalsSql = log.queries[0];
const monthlySql = log.queries[1];
assert.deepStrictEqual(totalsSql.binds, [filters.from, filters.to, filters.from, filters.to], 'one range binds to sales and returns');
assert(/h\.invoiceDate >= \? AND h\.invoiceDate <= \?/.test(totalsSql.sql), 'invoice date is inclusive');
assert(/r\.created_at >= \? AND r\.created_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/.test(totalsSql.sql), 'return datetime includes all of end date');
assert(/EXISTS \(SELECT 1 FROM invoice_footers/.test(totalsSql.sql), 'a return is counted once for a matching invoice product');
assert.deepStrictEqual(monthlySql.binds, [filters.from, filters.to, filters.from, filters.to], 'monthly sales and returns use the same date range');
assert(/DATE_FORMAT\(h\.invoiceDate/.test(monthlySql.sql) && /DATE_FORMAT\(r\.created_at/.test(monthlySql.sql), 'monthly chart groups invoice sales and return creation dates by month');
assert(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(monthlySql.sql), 'monthly query is read only');
assert.deepStrictEqual(log.closed, ['result', 'statement', 'result', 'statement', 'connection']);
assert.throws(() => context.handler({ ...filters, from: '2026-02-30' }, {}), /تاريخ غير صحيح/);
assert.throws(() => context.handler({ ...filters, from: '2026-05-01' }, {}), /تاريخ البداية/);

log.binds = [];
const incomeQueryStart = log.queries.length;
const income = context.incomeHandler(filters, {});
assert.deepStrictEqual(JSON.parse(JSON.stringify(income.rows)), [
  { account_5_name: 'Income account 1', net_amount: 30 },
  { account_5_name: 'Income account 2', net_amount: 10 }
]);
assert.strictEqual(income.total_net_amount, 40);
assert.deepStrictEqual(JSON.parse(JSON.stringify(income.monthly)), [
  { month: '2026-01', net_amount: 100 }, { month: '2026-02', net_amount: 150 }
]);
const incomeQueries = log.queries.slice(incomeQueryStart);
assert.strictEqual(incomeQueries.length, 2, 'other income reads account totals and monthly chart totals');
incomeQueries.forEach(query => {
  assert.deepStrictEqual(query.binds, [filters.from, filters.to], 'other income uses the shared date range');
  assert(/FROM expenses_income_report/.test(query.sql), 'other income reads the requested MySQL view');
  assert(/transaction_date >= \? AND transaction_date <= \?/.test(query.sql), 'income uses an inclusive transaction date range');
  assert(/TRIM\(chart_of_accounts\) REGEXP '\^\[0-9\]\+\$'/.test(query.sql) && /CAST\(TRIM\(chart_of_accounts\) AS DECIMAL\(20,0\)\) > 412100/.test(query.sql), 'income filters numeric account codes above 412100');
  assert(/SUM\(COALESCE\(debit_sum, 0\) - COALESCE\(credit_sum, 0\)\)/.test(query.sql), 'income is net debit less credit');
  assert(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(query.sql), 'income queries are read only');
});
assert(/GROUP BY account_5_name/.test(incomeQueries[0].sql), 'income is summed by account_5_name');
assert(/GROUP BY DATE_FORMAT\(transaction_date, '\%Y-%m'\)/.test(incomeQueries[1].sql), 'income chart totals are grouped by month');

log.binds = [];
const expenseQueryStart = log.queries.length;
const expenses = context.expensesHandler(filters, {});
assert.deepStrictEqual(JSON.parse(JSON.stringify(expenses.rows)), [
  { account_5_name: 'Income account 1', net_amount: 30 },
  { account_5_name: 'Income account 2', net_amount: 10 }
]);
assert.strictEqual(expenses.total_net_amount, 40);
assert.deepStrictEqual(JSON.parse(JSON.stringify(expenses.monthly)), [
  { month: '2026-01', net_amount: 100 }, { month: '2026-02', net_amount: 150 }
]);
const expenseQueries = log.queries.slice(expenseQueryStart);
assert.strictEqual(expenseQueries.length, 2, 'expenses read account totals and monthly chart totals');
expenseQueries.forEach(query => {
  assert.deepStrictEqual(query.binds, [filters.from, filters.to], 'expenses use the shared date range');
  assert(/FROM expenses_income_report/.test(query.sql), 'expenses read the same MySQL view');
  assert(/transaction_date >= \? AND transaction_date <= \?/.test(query.sql), 'expenses use an inclusive transaction date range');
  assert(/TRIM\(chart_of_accounts\) REGEXP '\^\[0-9\]\+\$'/.test(query.sql) && /CAST\(TRIM\(chart_of_accounts\) AS DECIMAL\(20,0\)\) < 411100/.test(query.sql), 'expenses filter numeric account codes below 411100');
  assert(/SUM\(COALESCE\(debit_sum, 0\) - COALESCE\(credit_sum, 0\)\)/.test(query.sql), 'expenses are net debit less credit');
  assert(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(query.sql), 'expenses queries are read only');
});
assert(/GROUP BY account_5_name ORDER BY net_amount ASC/.test(expenseQueries[0].sql), 'expenses put the most negative net amount first');
assert(/GROUP BY DATE_FORMAT\(transaction_date, '\%Y-%m'\)/.test(expenseQueries[1].sql), 'expense chart totals are grouped by month');

log.binds = [];
const productionQueryStart = log.queries.length;
const production = context.productionHandler({ ...filters, offset: 0 }, {});
assert.strictEqual(production.total, 35);
assert.strictEqual(production.rows.length, 30, 'production shows thirty grouped products per page');
assert.deepStrictEqual(JSON.parse(JSON.stringify(production.rows[0])), {
  product_id: 'p-1', name_ar: 'اسم المنتج 1', expected_quantity: 41, deliver_quantity: 36
});
assert.strictEqual(production.has_more, true, 'production indicates that the table has another page');
const productionQueries = log.queries.slice(productionQueryStart);
assert.strictEqual(productionQueries.length, 2, 'production snapshot reads a distinct product count and one bounded aggregation');
productionQueries.forEach(query => {
  assert.deepStrictEqual(query.binds, [filters.from, filters.to], 'production uses the selected date range');
  assert(/h\.status = 'delivered'/.test(query.sql) && /h\.deleted_at IS NULL/.test(query.sql), 'production includes only delivered active headers');
  assert(/h\.created_at >= \? AND h\.created_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/.test(query.sql), 'production filters on the full created_at date range');
  assert(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(query.sql), 'production queries are read only');
});
assert(/COUNT\(DISTINCT h\.product_id\)/.test(productionQueries[0].sql), 'production pagination counts distinct products');
assert(/JOIN products p ON p\.id = h\.product_id/.test(productionQueries[1].sql) && /MAX\(p\.name_ar\)/.test(productionQueries[1].sql), 'production resolves product labels from products.name_ar');
assert(/SUM\(COALESCE\(h\.expected_quantity, 0\)\)/.test(productionQueries[1].sql) && /SUM\(COALESCE\(h\.deliver_quantity, 0\)\)/.test(productionQueries[1].sql), 'production aggregates expected and delivered quantities by product');
assert(/ORDER BY deliver_quantity DESC/.test(productionQueries[1].sql) && /LIMIT 2001/.test(productionQueries[1].sql) && !/OFFSET/.test(productionQueries[1].sql), 'production snapshot sorts by delivered quantity and is bounded without per-page OFFSET');
assert.strictEqual(production.limit, 30, 'production pages stay at thirty rows');
assert.strictEqual(production.offset, 0, 'first production page starts at zero');
assert.ok(Number.isFinite(Number(production.snapshot_at)), 'production page carries its snapshot timestamp');
assert.strictEqual(production.truncated, false, 'mocked snapshot below the cap is not truncated');

log.binds = [];
const usedMaterialsQueryStart = log.queries.length;
const usedMaterials = context.usedMaterialsHandler({ ...filters, offset: 0 }, {});
assert.strictEqual(usedMaterials.total, 35);
assert.strictEqual(usedMaterials.rows.length, 30, 'used materials show thirty grouped products per page');
assert.deepStrictEqual(JSON.parse(JSON.stringify(usedMaterials.rows[0])), {
  product_id: '1', name_ar: 'مادة 1', unit: 'كجم', supposed_qty: 5, used_qty: 6,
  difference_qty: 1, difference_ratio: 20
});
assert.strictEqual(usedMaterials.has_more, true, 'used materials indicate that another page exists');
const usedMaterialsQueries = log.queries.slice(usedMaterialsQueryStart);
assert.strictEqual(usedMaterialsQueries.length, 1, 'used materials fetch a page and its total in one query');
usedMaterialsQueries.forEach(query => {
  assert.deepStrictEqual(query.binds, [filters.from, filters.to], 'used materials use the selected date range');
  assert(/STRAIGHT_JOIN manufacture_report_view v/.test(query.sql), 'used materials read the requested MySQL view');
  assert(/MAX\(v\.col4_expected\) AS unit/.test(query.sql), 'view union supplies the ingredient unit in the fourth output column');
  assert(/v\.col1_id = CAST\(h\.id AS CHAR CHARACTER SET utf8mb4\)/.test(query.sql), 'header IDs join the view using matching character types');
  assert(/h\.created_at >= \? AND h\.created_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/.test(query.sql), 'used materials filter by the full header created_at date range');
  assert(/v\.sort_order = 3/.test(query.sql) && /h\.status = 'delivered'/.test(query.sql) && /h\.deleted_at IS NULL/.test(query.sql), 'only ingredient rows from delivered active production are included');
  assert(/pr\.category_id NOT IN \(3, 9, 10, 11, 13, 14, 15, 18, 19, 20, 21\)/.test(query.sql), 'excluded product categories are filtered');
  assert(/THEN SIGN\(CAST\(TRIM\(v\.col6_deliv_ratio\).*CEIL\(ABS\(CAST\(TRIM\(v\.col6_deliv_ratio\)/.test(query.sql) && /THEN SIGN\(CAST\(TRIM\(v\.col5_deliv_qty\).*CEIL\(ABS\(CAST\(TRIM\(v\.col5_deliv_qty\)/.test(query.sql), 'basic and fallback quantities use Excel ROUNDUP-to-zero-decimals behavior');
  assert(/CAST\(TRIM\(v\.col7_manuf_num\) AS DECIMAL\(18,4\)\) ELSE 0 END\) AS used_qty/.test(query.sql), 'actual used quantity comes from col7_manuf_num');
  if (query.sql.includes('difference_qty')) assert(/\(used_qty - supposed_qty\) AS difference_qty/.test(query.sql) && /\(\(used_qty - supposed_qty\) \/ supposed_qty\) \* 100/.test(query.sql), 'difference and percentage compare actual with supposed use');
  assert(!/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(query.sql), 'used-material queries are read only');
});
assert(/GROUP BY CAST\(v\.col2_prod_id AS UNSIGNED\)/.test(usedMaterialsQueries[0].sql), 'used quantities aggregate by ingredient product');
assert(/COUNT\(\*\) OVER\(\) AS total/.test(usedMaterialsQueries[0].sql), 'total product count is read in the page query');
assert(/ORDER BY used_qty DESC/.test(usedMaterialsQueries[0].sql) && /LIMIT 2001/.test(usedMaterialsQueries[0].sql) && !/OFFSET/.test(usedMaterialsQueries[0].sql), 'used products sort by actual use and snapshot without per-page OFFSET');
assert.strictEqual(usedMaterials.limit, 30, 'used-material pages stay at thirty rows');
assert.strictEqual(usedMaterials.offset, 0, 'first used-materials page starts at zero');
assert.ok(Number.isFinite(Number(usedMaterials.snapshot_at)), 'used-materials page carries its snapshot timestamp');
assert.strictEqual(usedMaterials.truncated, false, 'mocked used-materials snapshot below the cap is not truncated');

// Snapshot lifecycle: bounded aggregation reused across pages.
assert(server.includes('dbTcFinancialProductionSnapshot_: [120'), 'production snapshot caches for 120s');
assert(server.includes('dbTcFinancialUsedMaterialsSnapshot_: [120'), 'used-materials snapshot caches for 120s');
assert(server.includes('DB_TC_FINANCIAL_SNAPSHOT_LIMIT_ = 2000'), 'snapshots are bounded to 2000 distinct products');
assert(server.includes('dbTcFinancialProductionSnapshot_({ from: p.from'), 'production pages slice a shared snapshot instead of regrouping per page');
assert(server.includes('dbTcFinancialUsedMaterialsSnapshot_({ from: p.from'), 'used-material pages slice a shared snapshot');
assert(server.includes('.slice(p.offset, p.offset + p.limit)'), 'pages slice snapshot rows without new aggregation');
assert(/refresh:\s*p\.refresh/.test(server) || server.includes('refresh: p.refresh'), 'explicit refresh bypasses the snapshot');
assert(server.includes("name === 'dbTcFinancialProductionSnapshot_' || name === 'dbTcFinancialUsedMaterialsSnapshot_'"), 'snapshot definitions normalize the shared date range');
assert(server.includes('snapshot_at: Date.now()'), 'snapshots carry a timestamp for client freshness');
assert(page.includes('_productionPages') && page.includes('_usedMaterialsPages'), 'visited pages are retained in the browser within the snapshot');
assert(page.includes('_productionSnapSeq') && page.includes('_usedMaterialsSnapSeq'), 'filter changes start a new snapshot generation');
assert(page.includes('fr-production-refresh') && page.includes('fr-used-materials-refresh'), 'explicit snapshot refresh controls exist');
assert(page.includes('fr-production-snapshot-note') && page.includes('fr-used-materials-snapshot-note'), 'snapshot freshness is visible to users');
assert(page.includes('جارٍ تحميل الصفحة'), 'page navigation shows loading without clearing existing rows');
assert(!/fetchProductionPage[\s\S]{0,600}fr-production-rows'\)\.innerHTML = '<tr><td colspan="5" class="fr-empty">جارٍ تحميل بيانات الإنتاج/.test(page), 'production navigation keeps existing rows visible');
assert(!/fetchUsedMaterialsPage[\s\S]{0,600}fr-used-materials-rows'\)\.innerHTML = '<tr><td colspan="7" class="fr-empty">جارٍ تحميل المواد المستخدمة/.test(page), 'used-materials navigation keeps existing rows visible');
assert(page.includes('snapSeq !== _productionSnapSeq') && page.includes('snapSeq !== _usedMaterialsSnapSeq'), 'stale page responses are ignored after snapshot changes');
assert(page.includes('var frozen = { from:'), 'PDF export freezes one consistent range across all pages');

const inline = (page.match(/<script>([\s\S]*?)<\/script>/i) || [])[1];
assert(inline, 'page has an inline script');
new vm.Script(inline.replace(/<\?[\s\S]*?\?>/g, 'null'), { filename: 'Company_TopChemical_FinancialRatios.html' });
assert(page.includes("request('current', 'sales', 'get_financial_sales_totals')"));
assert(page.includes("request('current', 'income', 'get_financial_other_income')"));
assert(page.includes("request('current', 'expenses', 'get_financial_expenses')"));
assert(page.includes("request('current', 'production', 'get_financial_production'"));
assert(page.includes("request('current', 'usedMaterials', 'get_financial_used_materials'"));
assert(page.includes('fr-production-rows') && page.includes('fr-production-prev') && page.includes('fr-production-next'));
assert(page.includes('fr-used-materials-rows') && page.includes('fr-used-materials-prev') && page.includes('fr-used-materials-next'));
assert(page.includes('.fr-production-data-table { table-layout: fixed; font-size: 14px; }') && page.includes('height: 38px;') && page.includes('overflow: hidden; text-overflow: ellipsis;'), 'production table text is larger while row height stays fixed and long labels clip');
assert(page.includes('.fr-production-data-table { min-width: 0 !important; font-size: 9pt; }'), 'printed production tables keep fixed rows with readable text');
assert((page.match(/class="fr-number">الكمية المتوقعة/g) || []).length >= 2 && page.includes('.fr-table th.fr-number { direction: ltr; text-align: left;'), 'production numeric headers align with the values in screen and print tables');
assert(/return n < 0 \? '\(' \+ body \+ '\)' : body;/.test(inline), 'negative production quantities render in financial parentheses');
assert(/return n < 0 \? '\(' \+ body \+ '%\)'/.test(inline), 'negative material-use percentages render in financial parentheses');
assert(page.includes('function prepareFullReportPrint()') && page.includes('fetchAllReportRows(\'get_financial_production\'') && page.includes('fetchAllReportRows(\'get_financial_used_materials\''), 'print prepares every page of both production lists');
assert(page.includes('fr-production-print-rows') && page.includes('fr-used-materials-print-rows') && page.includes('.fr-print-only { display: block !important; }'), 'print layout includes full production and usage lists');
assert(page.includes('إيرادات أخرى') && page.includes('fr-income-rows'));
assert(page.includes('المصروفات') && page.includes('fr-expense-rows') && page.includes('fr-expenses-chart'));
assert(page.includes('<h2 id="fr-sales-section-title">المبيعات</h2>') && page.indexOf('fr-expenses-title') < page.indexOf('fr-production-title'), 'sales and expenses precede the production section');
assert(page.includes('fr-income-chart') && page.includes('الإيرادات الأخرى شهريًا'));
const expenseRender = (inline.match(/function renderExpenses\([\s\S]*?\n  }/) || [])[0] || '';
assert(/namedMap\(current, comparison\)\.sort\(function \(a, b\) \{ return a\.current - b\.current/.test(expenseRender), 'expense rows put the most negative current amount first');
const incomeRender = (inline.match(/function renderIncome\([\s\S]*?\n  }/) || [])[0] || '';
assert(/namedMap\(current, comparison\)\.sort\(function \(a, b\) \{ return b\.current - a\.current/.test(incomeRender), 'other income rows remain sorted highest amount first');
assert(/curIncome \+ curNetSales/.test(page) && /cmpIncome \+ cmpNetSales/.test(page), 'revenue is net sales plus other income for each period');
assert(page.includes("field('fr-from'") && page.includes("field('fr-to'") && page.includes("field('fr-compare-from'") && page.includes("field('fr-compare-to'"));
assert(page.includes('shiftYear(current.from, -1)') && page.includes('shiftYear(current.to, -1)'), 'comparison defaults to the same dates one year earlier');
assert(page.includes('window.print()') && page.includes('@page { size: A4 portrait;'), 'report supports A4 PDF printing');
assert(/\.fr-table tfoot \{ display: table-row-group; \}/.test(page), 'printed table totals appear once at the end instead of repeating on each page');
assert(page.includes('class="fr-expense-ratio"') && page.includes('.fr-expense-ratio { display: inline-block;') && page.includes('.fr-expense-ratio { color: #111 !important;'), 'expense-to-revenue ratios are highlighted on screen and in print');
assert(page.includes("'net_sales_value', 'fr-sales-chart'") && page.includes("'net_amount', 'fr-income-chart'") && page.includes("'net_amount', 'fr-expenses-chart'"), 'net sales, other income, and expenses each have monthly comparison charts');
assert(page.includes('String(Number(thousands.toFixed(1)))') && page.includes("return (number < 0 ? '-' : '') + rounded + 'k'"), 'chart axis and data labels use compact thousands suffixes without group separators');
assert(nav.includes("action: 'tc_financial_ratios'"));
assert(registry.includes("action: 'tc_financial_ratios', template: 'Company_TopChemical_FinancialRatios'"));
assert(server.includes("'get_financial_sales_totals': { page: 'tc_financial_ratios', access: 'read' }"));
assert(server.includes("'get_financial_production': { page: 'tc_financial_ratios', access: 'read' }"));
assert(server.includes("'get_financial_used_materials': { page: 'tc_financial_ratios', access: 'read' }"));
console.log('tc_financial_ratios: comparison periods, monthly charts, production aggregation/pagination, expense ratios/order/cutoff, A4 PDF styling, read-only queries, and route checks passed');
