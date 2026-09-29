/**
 * tl_sales: the row menu, and مرتجعات actually opening the returns page.
 *
 * Two asks:
 *   1. The المبيعات table reads like المشتريات — the shared row menu and the
 *      same 50-row pager — not a bare <select> in the actions column.
 *   2. Choosing مرتجعات opens the returns page. It used to call window.open and
 *      stop there, so a refused popup meant the action did nothing at all.
 *
 * Run: node tools/verify/s11_sales_returns.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const TLS = fs.readFileSync(path.join(ROOT, 'Company_TopLight_Sales.html'), 'utf8');
const RET = fs.readFileSync(path.join(ROOT, 'Company_TopLight_Sales_Returns.html'), 'utf8');
const VFP = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Purchasing.html'), 'utf8');

let failed = 0;
function check(cond, label) {
  if (cond) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}

const invoices = n => Array.from({ length: n }, (_, i) => ({
  invoice_unique_id: 'INV-' + i, 'رقم الفاتورة': (i + 1) + '-2026',
  customer_name: 'عميل ' + i, 'تاريخ الفاتورة': '2026-0' + ((i % 9) + 1) + '-01',
  'المبلغ الصافي': 1000 + i, 'نسبة الخصم': 0, 'قيمة الخصم': 0, 'إجمالي': 1140 + i,
  approval_status: 'Pending', fully_returned: i === 1
}));

async function renderSales(count, loadAll) {
  const s = bootPage({
    page: 'Company_TopLight_Sales.html',
    isSuperAdmin: true,
    containers: ['tl-content'],
    scriptlets: { CURRENT_ACTION: "'tl_sales'" },
    call: (action, data) => {
      if (action === 'get_sales_headers') {
        return { status: 'success', headers: invoices(data && data.loadAll ? count : 20) };
      }
      return { status: 'success' };
    }
  });
  s.renderList(!!loadAll);
  await flush(); await flush(); await flush();
  return s;
}

(async function () {
  console.log('\n1 — the actions column is the shared row menu\n');
  {
    const s = await renderSales(10, false);
    const h = s.html('tl-content');
    check(h.indexOf('<select') === -1, 'no <select> is left in the list view');
    /* Relaxed from the exact string `class="action-dropdown"` by the UI/UX run,
       step 3.3 (U-20). The row menu's wrapper now reads
       `class="action-dropdown erp-kebab"` — it gained the harvested kebab class
       and lost the brand-coloured pill. The `action-dropdown` class itself is
       unchanged, so this assertion's INTENT ("rows carry the same menu
       المشتريات uses") is intact; only its dependence on the exact spelling of
       a class attribute in a shared component was too tight. */
    check(h.indexOf('class="action-dropdown') !== -1, 'rows carry the same menu المشتريات uses');
    check(VFP.indexOf('UIC.actionBtns(btns)') !== -1 && TLS.indexOf('UIC.actionBtns(btns)') !== -1,
      'and it is literally the same helper, on both screens');
    check(h.indexOf("doAction('INV-0','returns')") !== -1, 'مرتجعات is an item on an open invoice');
    check(h.indexOf("doAction('INV-1','returns')") === -1, 'and is withheld from a fully returned one');
    check(h.indexOf("doAction('INV-0','print')") !== -1, 'طباعة, تحليل التكلفة and اذن صرف منتج stay');
    check(h.indexOf("doAction('INV-0','delete')") !== -1, 'so do تعديل and حذف, for a full grant');
  }

  console.log('\n2 — مرتجعات opens the returns page\n');
  {
    const s = await renderSales(10, false);
    const opened = [];
    s.open = (url) => { opened.push(url); return { focus() {} }; };
    s.doAction('INV-3', 'returns');
    check(opened.length === 1, 'the action opens exactly one page');
    check(String(opened[0]).indexOf('action=tl_sales_returns') !== -1, 'and it is the returns page');
    check(String(opened[0]).indexOf('purchase_code=INV-3') !== -1, 'for the invoice the row belongs to');
    check(String(opened[0]).indexOf('sessionToken=TEST-TOKEN') !== -1, 'carrying the session');
  }
  {
    /* The regression: a blocked popup used to end the action silently. */
    const s = await renderSales(10, false);
    s.open = () => null;
    s.location.href = 'https://example.invalid/';
    s.doAction('INV-3', 'returns');
    const href = String(s.location.href);
    check(href.indexOf('action=tl_sales_returns') !== -1,
      'when the tab is refused, this frame navigates to the returns page instead');
    check(href.indexOf('purchase_code=INV-3') !== -1, 'still for the right invoice');
  }

  console.log('\n3 — the returns screen can be left again\n');
  {
    check(RET.indexOf('onclick="closeReturns()"') !== -1, 'إغلاق runs closeReturns()');
    check(/function closeReturns\(\)/.test(RET), 'which is defined on the page');
    check(RET.indexOf('window.top.close()') !== -1, 'it still closes the tab when there is one');
    check(/action=tl_sales&sessionToken=/.test(RET),
      'and otherwise goes back to المبيعات, instead of leaving a dead button');
  }

  console.log('\n4 — pagination, the same as المشتريات\n');
  {
    const s = await renderSales(137, true);
    const h = s.html('tl-content');
    const store = s.__dtStore && s.__dtStore['sales-table'];
    check(h.indexOf('id="sales-table_pager"') !== -1, 'a pager appears once there is more than one page');
    check(!!store && store.pageSize === 50, '50 rows a page');
    check(!!store && store.rows.length === 137, 'with every loaded invoice in the store');
    check(!!store && Math.ceil(store.rows.length / store.pageSize) === 3, 'across 3 pages');
    check(TLS.indexOf('autoPage') === -1 && VFP.indexOf('autoPage') === -1,
      'neither screen opts out of the shared pager');
    const few = await renderSales(10, false);
    check(few.html('tl-content').indexOf('عرض الكل') !== -1,
      'and the 20-row default still offers عرض الكل, as المشتريات does');
  }

  console.log('\n' + (failed === 0
    ? 'OK — tl_sales uses the shared row menu, and مرتجعات always opens the returns page.'
    : 'FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})();
