/**
 * Verification for the two quantity calculators on the manufacturing order
 * page (vf_mfg_order), added alongside the one tc_stock_scan already uses.
 *
 * What is worth proving here is not the arithmetic — tc_stock_scan_calculator.js
 * covers the shared parser — but the wiring around it:
 *   1. Applying a result flows through the field's own input listeners, so the
 *      expected-quantity formula and the KPI strip stay in step. A calculator
 *      that wrote the value without firing the event would look right and leave
 *      الكمية المتوقعة stale.
 *   2. The produced-quantity calculator shows valley_products.carton FOR THE
 *      CURRENTLY CHOSEN PRODUCT, and says so plainly when there is no product
 *      or no carton on record rather than showing a misleading 0.
 *   3. A locked order offers no calculator at all.
 *
 * Run: node tools/verify/vf_mfg_order_calculator.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const ACTIONS = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

const PRODUCTS = [
  { value: 'P-1', label: 'زيت نخيل 1 لتر', carton: 20 },
  { value: 'P-2', label: 'منتج بلا تغليف', carton: '' }
];

function detail(status) {
  return {
    status: 'success', is_new: false, can_see_cost: true,
    recipe_options: [], product_options: JSON.parse(JSON.stringify(PRODUCTS)),
    work_center_options: [], enums: { operation_type: [], shift: [] },
    order: {
      unique_id: 'MO-1', transaction_code: 'MO-0001', mo_status: status,
      manufactured_qty: 0, actual_qty: 0, produced_product: 'P-1', operation_type: 'تصنيع وتعبئة'
    },
    outputs: [], workops: [], byproducts: []
  };
}

async function boot(status) {
  const s = bootPage({
    page: 'Company_ValleyFoods_MfgOrderView.html',
    isSuperAdmin: true,
    call: (action) => {
      if (action === 'get_valley_mfg_order_detail') return detail(status);
      return { status: 'success' };
    }
  });
  /* The calculator notifies its target with a real Event; the stub sandbox has
     no constructor for one, and without it apply() would silently skip the
     dispatch and test 2 would prove nothing. */
  s.Event = function (type) { this.type = type; };
  s.MFGVIEW_PAGE.load();
  await flush(); await flush(); await flush();
  return s;
}

/** The markup of the calculator dialog currently on screen. */
function dialog(s) {
  const kids = s.document.body.children.filter(c => c.id === 'uic-calculator-modal');
  return kids.length ? String(kids[kids.length - 1].innerHTML || '') : '';
}
const el = (s, id) => s.document.getElementById(id);

(async function () {
  console.log('\n1 — the triggers exist only where the order is editable\n');
  const s = await boot('Draft');
  const form = s.html('vf-mo-view');
  check(/id="calc-f-manufactured"/.test(form), 'كمية الخام الداخلة carries a calculator trigger');
  check(/id="calc-f-actual"/.test(form), 'الكمية الفعلية المنتجة carries a calculator trigger');
  check((form.match(/mo-calc-trigger/g) || []).length === 2, 'no other field grew one', form.match(/mo-calc-trigger/g));

  const locked = await boot('Locked');
  const lockedForm = locked.html('vf-mo-view');
  check(!/mo-calc-trigger/.test(lockedForm), 'a locked order offers no calculator');

  console.log('\n2 — applying a result runs the field’s own listeners\n');
  el(s, 'calc-f-manufactured').click();
  check(/كمية الخام الداخلة/.test(dialog(s)), 'the raw-input calculator opens with its own title');
  ['1', '0', '*', '5'].forEach(k => s.UIC.Calculator.press(k));
  s.UIC.Calculator.apply();
  check(el(s, 'f-manufactured').value === '50', 'the computed quantity lands in the field', el(s, 'f-manufactured').value);
  check(el(s, 'f-expected').value === '32.500', 'الكمية المتوقعة recalculated from it (×0.65)', el(s, 'f-expected').value);

  console.log('\n3 — the produced-quantity calculator shows the product’s carton\n');
  el(s, 'f-product').value = '';
  el(s, 'calc-f-actual').click();
  check(/اختر «المنتج المنتج» أولاً/.test(dialog(s)), 'with no product chosen the note says so');
  check(!/إدراج/.test(dialog(s)), 'and offers nothing to insert');
  s.UIC.Calculator.close();

  el(s, 'f-product').value = 'P-1';
  el(s, 'calc-f-actual').click();
  const note = dialog(s);
  check(/الكرتونة او التغليف/.test(note) && /زيت نخيل 1 لتر/.test(note) && /: 20</.test(note),
    'the chosen product’s carton is shown with its name', note.slice(note.indexOf('uic-calculator-note'), note.indexOf('uic-calculator-note') + 160));
  check(/إدراج/.test(note), 'and can be inserted into the expression');

  s.UIC.Calculator.press('1'); s.UIC.Calculator.press('2');
  s.UIC.Calculator.insertValue();
  check(el(s, 'uic-calculator-expression-view').textContent === '12×20',
    'inserting after a complete term implies ×', el(s, 'uic-calculator-expression-view').textContent);
  s.UIC.Calculator.apply();
  check(el(s, 'f-actual').value === '240', '12 cartons × 20 applies as 240', el(s, 'f-actual').value);

  el(s, 'f-product').value = 'P-2';
  el(s, 'calc-f-actual').click();
  check(/لا توجد كرتونة او تغليف مسجلة/.test(dialog(s)), 'a blank carton is reported, not shown as 0');
  check(!/إدراج/.test(dialog(s)), 'and nothing is offered for insertion');
  const beforeInsert = el(s, 'uic-calculator-expression-view').textContent;
  s.UIC.Calculator.insertValue();
  check(el(s, 'uic-calculator-expression-view').textContent === beforeInsert,
    'insertValue is inert without a value', beforeInsert);
  s.UIC.Calculator.close();

  console.log('\n4 — the server ships carton on every product_options builder\n');
  const builders = ACTIONS.split("finRefsCached_(dbId, 'vf_products_opts_sorted_carton'").length - 1;
  check(builders === 3, 'all three product_options builders share the renamed cache kind', builders);
  check(ACTIONS.indexOf("'vf_products_opts_sorted'") === -1,
    'no builder is left on the old kind, whose cached entries carry the old shape');
  const withCarton = ACTIONS.split('label: String(p.name_ar || (\'#\' + p.id)), carton: p.carton').length - 1;
  check(withCarton === 3, 'each of them emits carton', withCarton);
  check(/const FIN_PRODUCTS_HEADERS = \[[^\]]*'carton'/.test(ACTIONS), 'carton is a real valley_products column');

  console.log('\n' + (failed ? failed + ' check(s) FAILED.' : 'MO calculator checks pass.'));
  process.exit(failed ? 1 : 0);
})();
