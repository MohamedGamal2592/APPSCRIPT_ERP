/**
 * S6b verification (U-46) — client-side cost gating on the list pages.
 *
 * Boots the REAL Company_ValleyFoods_Purchasing.html and
 * Company_ValleyFoods_MfgOrders.html and renders each twice, with and without
 * the grant, asserting on the markup they actually produce.
 *
 * Run: node tools/verify/s6b_list_gate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const SALES = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Sales.html'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

const PUR_COST_COLS = ['Value', 'Total costs', 'Sales Value', 'Purchase Tax', 'Income Tax',
  'Administrative Expenses', 'Customs Expenses', 'Unloading expenses', 'bank commission',
  'Customs clearance and port receipts', 'Additional fees', 'Clearance Expenses',
  'Other Expenses', 'Internal cost adjustment', 'sales tax amount', 'Minimum differences',
  'If shipping via CIF, enter the insurance value.', 'CIF insurance rate',
  'Value Based on Invoice', 'Importation Re-Price', 'Tax Declared Value'];

function purchasingHeaders(canSeeCost) {
  const h = {
    id: 3, Code: 'PC-003', tax_system: 'vat', 'Reciept Date': '2026-03-01',
    Items: 'بذور', Type: 'import', 'Shipping Type': 'CIF', Currency: 'USD',
    'Exchange rate': 48.5, 'Supplier Name': 'S-1', approval_status: 'Pending',
    quality_approval_status: 'Pending',
    Value: 10000, 'Total costs': 12480, 'Sales Value': 15000, 'Purchase Tax': 140,
    'Income Tax': 60, 'Administrative Expenses': 50
  };
  if (!canSeeCost) PUR_COST_COLS.forEach(k => delete h[k]);
  return h;
}

async function renderPurchasing(canSeeCost) {
  const s = bootPage({
    page: 'Company_ValleyFoods_Purchasing.html',
    isSuperAdmin: true,
    containers: ['vf-purchasing-content'],
    scriptlets: { CURRENT_ACTION: "'vf_purchasing'" },
    call: action => {
      if (action === 'get_valley_purchasing_costing') {
        return {
          status: 'success',
          can_see_cost: canSeeCost,
          headers: [purchasingHeaders(canSeeCost)],
          options: { supplier_options: [{ value: 'S-1', label: 'Acme' }], currency_options: ['USD'], movement_type_options: ['in'] }
        };
      }
      return { status: 'success' };
    }
  });
  s.PURCHASING_PAGE ? s.PURCHASING_PAGE.renderList() : s.renderList();
  await flush(); await flush(); await flush();
  return s;
}

async function renderMfgOrders(canSeeCost) {
  const s = bootPage({
    page: 'Company_ValleyFoods_MfgOrders.html',
    isSuperAdmin: true,
    containers: ['byproducts-body', 'vf-mfg-content'],
    expose: ['loadByproductsTab'],
    scriptlets: { CURRENT_ACTION: "'vf_mfg_orders'" },
    call: action => {
      if (action === 'get_valley_mfg_byproducts') {
        const bp = { unique_id: 'BP-1', item: 'P-3', qty: 5, transaction_code: 'TC-1', total_cost: 88.25 };
        if (!canSeeCost) delete bp.total_cost;
        return { status: 'success', can_see_cost: canSeeCost, byproducts: [bp], total: 1, product_options: [{ value: 'P-3', label: 'مرافق' }] };
      }
      return { status: 'success' };
    }
  });
  s.exported('loadByproductsTab')('MO-1');
  await flush(); await flush(); await flush();
  return s;
}

(async function () {
  console.log('S6b — purchasing list\n');
  const pWith = await renderPurchasing(true);
  const pNo = await renderPurchasing(false);
  const hWith = pWith.html('vf-purchasing-content');
  const hNo = pNo.html('vf-purchasing-content');

  check(hWith.length > 0 && hNo.length > 0, 'both variants rendered');
  check(hWith.indexOf('إجمالي التكاليف') !== -1, 'with the grant: إجمالي التكاليف column present');
  check(hWith.indexOf('12,480') !== -1, 'with the grant: the figure 12,480 is shown');
  check(hNo.indexOf('إجمالي التكاليف') === -1, 'without: the column is gone');
  check(hNo.indexOf('12,480') === -1 && hNo.indexOf('12480') === -1,
    'without: the figure appears nowhere');
  check(hNo.indexOf('PC-003') !== -1, 'without: the document code still listed');
  check(hNo.indexOf('Acme') !== -1, 'without: the supplier still listed');
  check(hNo.indexOf('2026-03-01') !== -1, 'without: the receipt date still listed');
  check(hNo.indexOf('بذور') !== -1, 'without: the items description still listed');

  console.log('\nS6b — purchasing: an unsaveable form is not offered\n');
  check(hWith.indexOf('+ إضافة عملية شراء') !== -1, 'with the grant: the add button is there');
  check(hNo.indexOf('+ إضافة عملية شراء') === -1,
    'without: no add button — the server would refuse the save');
  check(hWith.indexOf("'edit'") !== -1 || hWith.indexOf('\\u0027edit\\u0027') !== -1 || hWith.indexOf('تعديل') !== -1,
    'with the grant: the edit action is offered');
  check(hNo.indexOf('تعديل') === -1, 'without: no edit action');
  check(hNo.indexOf('عرض') !== -1, 'without: the read-only view IS still offered');
  check(hNo.indexOf('اعتماد') !== -1, 'without: approval still offered (it cannot wipe a figure)');
  check(hNo.indexOf('طباعة') !== -1, 'without: printing still offered');

  console.log('\nS6b — purchasing column counts\n');
  const th = h => (h.match(/<th[ >]/g) || []).length;
  const firstRowTds = h => {
    /* UIC.dataTable emits <tbody id="..._tbody">, the hand-rolled tables a
       plain <tbody>. Match both. */
    const m = h.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    if (!m) return 0;
    const r = m[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    return r ? (r[1].match(/<td[ >]/g) || []).length : 0;
  };
  check(th(hWith) === firstRowTds(hWith), 'with the grant: ' + th(hWith) + ' headers = ' + firstRowTds(hWith) + ' cells');
  check(th(hNo) === firstRowTds(hNo), 'without: ' + th(hNo) + ' headers = ' + firstRowTds(hNo) + ' cells');
  check(th(hWith) - th(hNo) === 1, 'exactly one column disappears');

  console.log('\nS6b — manufacturing orders, by-products tab\n');
  const mWith = await renderMfgOrders(true);
  const mNo = await renderMfgOrders(false);
  const bWith = mWith.html('byproducts-body');
  const bNo = mNo.html('byproducts-body');
  check(bWith.indexOf('التكلفة') !== -1, 'with the grant: التكلفة column present');
  check(bWith.indexOf('88.25') !== -1, 'with the grant: the figure 88.25 is shown');
  check(bNo.indexOf('التكلفة') === -1, 'without: the column and its form field are gone');
  check(bNo.indexOf('88.25') === -1, 'without: the figure appears nowhere');
  check(bNo.indexOf('الكمية') !== -1 && bNo.indexOf('الدفعة') !== -1,
    'without: quantity and batch code stay');
  check(th(bWith) - th(bNo) === 1, 'exactly one column disappears');
  check(th(bNo) === firstRowTds(bNo), 'without: ' + th(bNo) + ' headers = ' + firstRowTds(bNo) + ' cells');

  console.log('\nS6b — sales needs no gate\n');
  const salesCostLines = SALES.split('\n').filter(l => /cost/i.test(l));
  check(salesCostLines.length === 1,
    'the sales page has exactly one line mentioning cost, and it renders nothing');
  check(/unit_cost: batches\[i\]\.unit_cost \|\| 0/.test(salesCostLines[0] || ''),
    'it only copies unit_cost into a payload the server ignores');
  check(SALES.indexOf('canCost()') === -1,
    'so no gate was added to Company_ValleyFoods_Sales.html — there is nothing to hide');

  console.log('\n' + (failed === 0
    ? 'S6b OK — list pages hide costs and keep everything else.'
    : 'S6b FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})();
