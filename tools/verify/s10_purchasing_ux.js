/**
 * Purchasing UX (owner request, 2026-09-06) and TopLight sales pagination.
 *
 * Four asks:
 *   1. المورد mandatory when adding a purchase.
 *   2. الأصناف boxes were cramped and unfriendly — give them room.
 *   3. المنتج must be searchable, with enough space for the other line fields.
 *   4. "القيمة (Value) *" renamed to "القيمة السعرية الاجمالية للمورد".
 * Plus: tl_sales needs an option to show all sales, paginated.
 *
 * Run: node tools/verify/s10_purchasing_ux.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const PUR = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Purchasing.html'), 'utf8');
const TLS = fs.readFileSync(path.join(ROOT, 'Company_TopLight_Sales.html'), 'utf8');
const TLA = fs.readFileSync(path.join(ROOT, 'Company_TopLight_Actions.js'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

const PRODUCTS = [
  { value: 'P-1', label: 'بذور عباد الشمس' },
  { value: 'P-2', label: 'زيت خام' },
  { value: 'P-3', label: 'نخالة' }
];
const SUPPLIERS = [{ value: 'S-1', label: 'Acme Trading' }, { value: 'S-2', label: 'شركة النيل' }];

const HEADER = {
  id: 3, Code: 'PC-003', tax_system: 'false', 'Reciept Date': '2026-03-01', Items: 'بذور',
  Type: 'بيع', 'Shipping Type': 'CIF', Currency: 'EGP', 'Exchange rate': 1,
  'Supplier Name': 'S-1', approval_status: 'Pending', quality_approval_status: 'Pending',
  Value: 10000, 'Total costs': 12480
};
const LINES = [
  { unique_id: 'PL-1', code: 'PC-003', product: 'P-1', qty: 10, unit_price: 12, other_cost: 30,
    sales_value: 0, total_cost: 150, movement_type: 'in', movement_place: 'مستورد',
    receipt_date: '2026-03-01', invoice_date: '2026-03-01', currency: 'EGP', exchange_rate: 1,
    'Production date': '2026-02-01', 'Expiry date': '2028-01-20' }
];

async function openPurchasingForm(viewOnly) {
  const s = bootPage({
    page: 'Company_ValleyFoods_Purchasing.html',
    isSuperAdmin: true,
    containers: ['vf-purchasing-content', 'lines-body'],
    scriptlets: { CURRENT_ACTION: "'vf_purchasing'" },
    expose: ['lineCardHtml', 'duplicateLineIdx', 'renderLines',
      'lines=function () { return __lines; }',
      'setLines=function (v) { __lines = v; }'],
    call: action => {
      if (action === 'get_valley_purchasing_costing') {
        return { status: 'success', can_see_cost: true, headers: [HEADER],
          options: { supplier_options: SUPPLIERS, currency_options: [{ value: 'EGP', label: 'EGP' }], movement_type_options: [{ fifth: 'in', code: 'وارد' }] } };
      }
      if (action === 'get_valley_purchasing_options') {
        return { status: 'success', options: { supplier_options: SUPPLIERS, product_options: PRODUCTS, currency_options: [{ value: 'EGP', label: 'EGP' }], movement_type_options: [{ fifth: 'in', code: 'وارد' }] } };
      }
      if (action === 'get_valley_purchasing_lines') {
        return { status: 'success', can_see_cost: true, lines: JSON.parse(JSON.stringify(LINES)) };
      }
      return { status: 'success' };
    }
  });
  s.renderList();
  await flush(); await flush();
  /* Always open an EXISTING document, so the line fixtures load; viewOnly only
     controls whether it is editable. */
  s.openForm('PC-003', !!viewOnly);
  /* openForm -> ensureOptions() -> renderForm() -> get_valley_purchasing_lines
     -> renderLines(): four promise hops before the cards exist. */
  for (let i = 0; i < 8; i++) await flush();
  return s;
}

(async function () {
  console.log('1 — المورد is mandatory\n');
  {
    check(/key: 'supplier_name'[^}]*required: true/.test(PUR),
      'supplier_name is declared required');
    check(/type: 'select', options: opts, value: v, required: !!s\.required/.test(PUR),
      'renderField now passes `required` through for selects (it was being dropped)');
    const s = await openPurchasingForm(false);
    const html = s.html('vf-purchasing-content');
    check(html.indexOf('id="supplier_name_display"') !== -1, 'the supplier field rendered');
    check(/id="supplier_name_display"[^>]*\srequired/.test(html),
      'and its input carries the required attribute, so UIC.validateForm blocks an empty one');
    const label = html.match(/<label[^>]*for="supplier_name_display"[^>]*>([\s\S]*?)<\/label>/);
    check(!!label && label[1].indexOf('<span class="req">*</span>') !== -1,
      'the label shows the required asterisk');
    check(PUR.indexOf("String(header['Supplier Name']).trim() === ''") !== -1,
      'and the save refuses an empty supplier with its own message');
  }

  console.log('\n2 — the القيمة label\n');
  {
    check(PUR.indexOf("label: 'القيمة السعرية الاجمالية للمورد'") !== -1,
      'the field is labelled القيمة السعرية الاجمالية للمورد');
    check(PUR.indexOf("'القيمة (Value) *'") === -1, 'the old label is gone');
    check(PUR.indexOf('قيمة الفاتورة (Value) مطلوبة') === -1,
      "and the save's error message no longer uses the old name");
    check(PUR.indexOf('القيمة السعرية الاجمالية للمورد مطلوبة') !== -1,
      'it uses the new one');
    const s = await openPurchasingForm(false);
    const html = s.html('vf-purchasing-content');
    check(html.indexOf('القيمة السعرية الاجمالية للمورد') !== -1, 'and that is what renders');
    /* The other two required labels had a hand-written ' *' AND the component's
       own asterisk — a double marker that a third required field would have
       made obvious. */
    check(html.indexOf('* <span class="req">*</span>') === -1,
      'no field renders a double asterisk any more');
  }

  console.log('\n3 — the product picker is searchable\n');
  {
    const s = await openPurchasingForm(false);
    const card = s.exported('lineCardHtml')(0);
    check(card.indexOf('id="product_0_display"') !== -1, 'the line product is a UIC.combo, not a plain <select>');
    check(card.indexOf('UIC.comboFilter(\'product_0\'') !== -1, 'with type-to-filter wired');
    check(card.indexOf('id="product_0_list"') !== -1, 'and a filterable option list');
    check(card.indexOf('بذور عباد الشمس') !== -1, 'listing the real product labels');
    check(PUR.indexOf('<select id="product_') === -1, 'the old plain product <select> is gone');
    check(/placeholder="ابحث عن منتج…"/.test(card), 'it prompts the user to search');
  }

  console.log('\n4 — the line boxes have room\n');
  {
    const s = await openPurchasingForm(false);
    const card = s.exported('lineCardHtml')(0);
    /* The phrase survives only in the comment explaining why it went. */
    check(PUR.indexOf('<table class="table" style="min-width:1200px;">') === -1,
      'the 15-column table pinned to 1200px is gone');
    check(PUR.indexOf('id="lines-tbody"') === -1, 'and so is its tbody');
    check(PUR.indexOf('<div id="lines-body"></div>') !== -1, 'lines render into a card list now');
    check(card.indexOf('minmax(210px,1fr)') !== -1,
      'each line is a responsive grid with a 210px minimum per field');
    /* Every field is labelled — in the old table the labels were column headers
       far away from the controls once you scrolled sideways. */
    ['المنتج', 'الكمية', 'سعر الوحدة', 'تكاليف أخرى', 'سعر البيع', 'نوع الحركة',
     'مكان الحركة', 'تاريخ الاستلام', 'تاريخ الفاتورة', 'تاريخ الإنتاج',
     'تاريخ الانتهاء', 'العملة', 'سعر الصرف', 'تكلفة العملة', 'الإجمالي'].forEach(l => {
      check(card.indexOf('>' + l + '</label>') !== -1, 'field "' + l + '" is labelled in the card');
    });
    check(card.indexOf('grid-column:span 2') !== -1, 'the product field spans two columns');
    check(card.indexOf('id="cost_currency_0"') !== -1 && card.indexOf('id="total_cost_0"') !== -1,
      'the computed cells keep their ids, so recalc() still finds them');
    check(card.indexOf('id="movement_type_0"') !== -1, 'and so does the movement select');
  }

  console.log('\n5 — typing into a combo is not destroyed by other edits\n');
  {
    const s = await openPurchasingForm(false);
    const body = () => s.html('lines-body');

    const before = body();
    s.updateLineSelect(0, 'movement_type', 'in');
    check(body() === before, 'changing a line select does NOT re-render the lines');
    check(PUR.indexOf('function updateLineSelect(i, key, value) {\n      __lines[i][key] = value;\n      renderLines();') === -1,
      'the old re-render-everything path is gone');

    const before2 = body();
    s.updateLineProduct(0, 'P-2');
    check(body() === before2, 'picking a product does not re-render either');
    check(s.exported('lines')()[0].product === 'P-2', 'but the value is recorded');

    /* Adding a second line must not touch the first. */
    const card0Before = s.document.getElementById('line-card-0');
    const card0Html = card0Before ? String(card0Before.innerHTML) : null;
    s.addLine();
    check(s.exported('lines')().length === 2, 'a second line was added');
    check(String(s.document.getElementById('line-card-0').innerHTML) === card0Html,
      'and line 1 is byte-identical afterwards — the combo survives');
    check(s.document.getElementById('line-card-1') !== null, 'the new line was appended');
  }

  console.log('\n6 — duplicates are caught, since the combo no longer hides them\n');
  {
    const s = await openPurchasingForm(false);
    s.exported('setLines')([
      { product: 'P-1', qty: 1 }, { product: 'P-2', qty: 1 }, { product: 'P-1', qty: 1 }
    ]);
    const dup = s.exported('duplicateLineIdx')();
    check(Object.keys(dup).length === 2 && dup[0] && dup[2],
      'both lines holding P-1 are flagged, the P-2 line is not');
    s.exported('renderLines')();
    const warn = s.document.getElementById('line-warn-0');
    check(warn && String(warn.textContent).indexOf('مكرر') !== -1,
      'and the duplicate line says so inline');
    const warn1 = s.document.getElementById('line-warn-1');
    check(warn1 && String(warn1.textContent) === '', 'while the non-duplicate line stays quiet');
    check(PUR.indexOf('مكرر في أكثر من صنف') !== -1, 'and the save blocks it too');
    check(PUR.indexOf('كل صنف يجب أن يكون له منتج') !== -1,
      'as well as a line left without a product');
  }

  console.log('\n7 — read-only mode still reads\n');
  {
    const s = await openPurchasingForm(true);
    const card = s.exported('lineCardHtml')(0);
    check(card.indexOf('id="product_0_display"') === -1,
      'a view-only line shows the product as text, not an editable combo');
    check(card.indexOf('بذور عباد الشمس') !== -1, 'resolved to its label, not its id');
    check(card.indexOf('حذف</button>') === -1, 'and offers no delete');
    check(/disabled/.test(card), 'its inputs are disabled');
  }

  console.log('\n8 — tl_sales: an option to show all, paginated\n');
  {
    check(/const visible = \(!data \|\| !data\.loadAll\) \? rows\.slice\(0, limit\) : rows;/.test(TLA),
      'the server already supported loadAll — only the client never asked');
    check(TLS.indexOf("companyCall('get_sales_headers', __loadedAll ? { loadAll: true } : {})") !== -1,
      'renderList now passes loadAll when the user asked for everything');
    check(TLS.indexOf('function showAllSales() { renderList(true); }') !== -1,
      'عرض الكل is wired');
    check(TLS.indexOf("__loadedAll = arguments.length ? !!loadAll : __loadedAll;") !== -1,
      'and a save or delete keeps the user in whichever view they were in');
    check(TLS.indexOf('pageSize: 50') !== -1, 'the table paginates at 50 rows a page');

    /* Render it both ways. */
    const invoices = n => Array.from({ length: n }, (_, i) => ({
      invoice_unique_id: 'INV-' + i, 'رقم الفاتورة': (i + 1) + '-2026',
      customer_name: 'عميل ' + i, 'تاريخ الفاتورة': '2026-0' + ((i % 9) + 1) + '-01',
      'المبلغ الصافي': 1000 + i, 'نسبة الخصم': 0, 'قيمة الخصم': 0, 'إجمالي': 1140 + i,
      approval_status: 'Pending', fully_returned: false
    }));
    async function renderSales(all) {
      const s = bootPage({
        page: 'Company_TopLight_Sales.html',
        isSuperAdmin: true,
        containers: ['tl-content'],
        scriptlets: { CURRENT_ACTION: "'tl_sales'" },
        call: (action, data) => {
          if (action === 'get_sales_headers') {
            return { status: 'success', headers: invoices(data && data.loadAll ? 137 : 20) };
          }
          return { status: 'success' };
        }
      });
      s.renderList(all);
      await flush(); await flush(); await flush();
      return s;
    }
    const few = await renderSales(false);
    const hFew = few.html('tl-content');
    check(hFew.indexOf('📊 عرض الكل') !== -1, 'the default view offers عرض الكل');
    check(hFew.indexOf('آخر 20 سجل') !== -1, 'and says which window it is showing');
    check(hFew.indexOf('_pager') === -1, 'no pager for 20 rows');

    const all = await renderSales(true);
    const hAll = all.html('tl-content');
    check(hAll.indexOf('الوضع: <b>عرض الكل</b>') !== -1, 'showing all says so, with the count');
    check(hAll.indexOf('showAllSales()') === -1, 'and stops offering the button it already honoured');
    check(hAll.indexOf('📄 عرض آخر 20 سجل فقط') !== -1, 'offering the way back instead');
    check(hAll.indexOf('id="sales-table_pager"') !== -1, 'a pager appears for 137 rows');
    const store = all.__dtStore && all.__dtStore['sales-table'];
    check(!!store && store.pageSize === 50, 'page size is 50');
    check(!!store && store.rows.length === 137, 'all 137 rows are in the table store');
    check(!!store && Math.ceil(store.rows.length / store.pageSize) === 3, 'across 3 pages');
  }

  console.log('\n' + (failed === 0
    ? 'OK — purchasing form and lines reworked; tl_sales can show all, paginated.'
    : 'FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})();
