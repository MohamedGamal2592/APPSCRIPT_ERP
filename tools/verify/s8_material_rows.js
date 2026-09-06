/**
 * S8 verification (U-43) — material entry ergonomics.
 *
 * The claim that matters is behavioural: adding a material, changing a
 * quantity or editing a batch must NOT rebuild every material row, because
 * that is what was destroying the combo being typed into.
 *
 * The DOM stub makes ids written into innerHTML addressable, so a full rebuild
 * (which rewrites #outputs-body) is distinguishable from a per-row update
 * (which rewrites only #out-row-<i>). That difference is what these assertions
 * are built on.
 *
 * Run: node tools/verify/s8_material_rows.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEW = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_MfgOrderView.html'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

const BATCHES = [
  { batch_uid: 'B-001', lot: 'LOT-A', current_qty: 500, available: 100, unit_cost: 12.5, transaction_date: '2026-01-05' },
  { batch_uid: 'B-002', lot: 'LOT-B', current_qty: 300, available: 60, unit_cost: 7.25, transaction_date: '2026-02-11' }
];

function detail(canSeeCost, outputs) {
  return {
    status: 'success', is_new: false, can_see_cost: canSeeCost,
    recipe_options: [],
    product_options: [{ value: 'P-1', label: 'خامة أ' }, { value: 'P-2', label: 'خامة ب' }],
    work_center_options: [], enums: { operation_type: [], shift: [] },
    order: { unique_id: 'MO-1', mo_status: 'Draft', manufactured_qty: 200, actual_qty: 100 },
    outputs: outputs, workops: [], byproducts: []
  };
}

const OUT_FULL = () => ([{
  unique_id: 'OUT-1', product_id: 'P-1', product_qty: 150, product_name: 'خامة أ',
  footers: [
    { unique_id: 'F-1', item: 'B-001', item_code: 'LOT-A', qty: 100, unit_cost: 12.5 },
    { unique_id: 'F-2', item: 'B-002', item_code: 'LOT-B', qty: 50, unit_cost: 7.25 }
  ],
  batches: JSON.parse(JSON.stringify(BATCHES))
}]);

async function boot(canSeeCost, outputs) {
  const s = bootPage({
    page: 'Company_ValleyFoods_MfgOrderView.html',
    isSuperAdmin: true,
    expose: ['outputAllocState_', 'outputRowInner_', 'round3',
      'footers=function () { return OUTPUT_FOOTERS; }',
      'outs=function () { return MFG_OUTPUTS; }'],
    call: (action) => {
      if (action === 'get_valley_mfg_order_detail') return detail(canSeeCost, outputs ? outputs() : OUT_FULL());
      if (action === 'get_valley_product_batches') return { status: 'success', batches: JSON.parse(JSON.stringify(BATCHES)) };
      return { status: 'success' };
    }
  });
  s.MFGVIEW_PAGE.load();
  await flush(); await flush(); await flush();
  return s;
}

(async function () {
  console.log('S8 — the empty batch table is gone\n');
  {
    /* A material with no product and no quantity: nothing but the entry row. */
    const s = await boot(true, () => ([{ unique_id: 'OUT-1', product_id: '', product_qty: '', product_name: '', footers: [], batches: [] }]));
    const row = s.exported('outputRowInner_')(0);
    check(row.indexOf('لا توجد دفعات مسجلة') === -1,
      'the old "لا توجد دفعات مسجلة" empty table is gone from the codebase');
    /* The rendered string is gone; the phrase survives only in the comment that
       explains why it went. Match the rest of the old sentence instead. */
    check(VIEW.indexOf('استخدم «جرّب الوصفة» أو أضف دفعة يدوياً') === -1,
      'and its render site is gone from the page source');
    check(row.indexOf('<table') === -1, 'no batch table at all before a product and quantity exist');
    check(row.indexOf('المواد المستهلكة') === -1, 'nor its heading');
    check(row.indexOf('+ دفعة') === -1, 'nor the + دفعة button');
    check(row.indexOf('الخامة الداخلة') !== -1 && row.indexOf('الكمية') !== -1,
      'the compact entry row (product + quantity + delete) is all that shows');
  }
  {
    /* Product chosen but no quantity yet: still no table. */
    const s = await boot(true, () => ([{ unique_id: 'OUT-1', product_id: 'P-1', product_qty: '', product_name: 'خامة أ', footers: [], batches: [] }]));
    const row = s.exported('outputRowInner_')(0);
    check(row.indexOf('<table') === -1, 'a product without a quantity still shows no table');
  }
  {
    /* Both present, no batches yet: prompt, not an empty table. */
    const s = await boot(true, () => ([{ unique_id: 'OUT-1', product_id: 'P-1', product_qty: 150, product_name: 'خامة أ', footers: [], batches: JSON.parse(JSON.stringify(BATCHES)) }]));
    const row = s.exported('outputRowInner_')(0);
    check(row.indexOf('+ دفعة') !== -1, 'with product AND quantity, + دفعة appears');
    check(row.indexOf('اضغط «+ دفعة»') !== -1, 'and a prompt, not an empty table');
    check(row.indexOf('<table') === -1, 'still no table until batches exist');
  }

  console.log('\nS8 — the per-row indicator\n');
  {
    const s = await boot(true);
    const stateOf = s.exported('outputAllocState_');
    let st = stateOf(0);
    check(st.state === 'ok' && st.sum === 150 && st.qty === 150, 'matched -> ok');
    check(s.exported('outputRowInner_')(0).indexOf('الدفعات مطابقة') !== -1, 'and the row says الدفعات مطابقة');

    s.exported('footers')()[0][1].qty = 20;             /* 100 + 20 = 120 of 150 */
    st = stateOf(0);
    check(st.state === 'short' && st.diff === -30, 'short by 30 -> short');
    check(s.exported('outputRowInner_')(0).indexOf('ينقص 30.000') !== -1, 'and the row names the shortfall');

    s.exported('footers')()[0][1].qty = 90;             /* 100 + 90 = 190 of 150 */
    st = stateOf(0);
    check(st.state === 'over' && st.diff === 40, 'over by 40 -> over');
    check(s.exported('outputRowInner_')(0).indexOf('يزيد 40.000') !== -1, 'and the row names the excess');

    /* The indicator uses the same tolerance as the modal and the server. */
    s.exported('footers')()[0][1].qty = 50.01;
    check(stateOf(0).state === 'ok', '+0.01 is still "matched", exactly as the server accepts');
    s.exported('footers')()[0][1].qty = 50.011;
    check(stateOf(0).state === 'over', '+0.011 is not');
  }
  {
    const s = await boot(true);
    const row = s.exported('outputRowInner_')(0);
    check(row.indexOf('الصنف: خامة أ') !== -1, 'the row names the material');
    check(row.indexOf('الكمية: 150.000') !== -1, 'and its quantity');
    check(row.indexOf('الدفعات: 2 (150.000)') !== -1, 'and how many batches are allocated');
    check(row.indexOf('إجمالي التكلفة') !== -1, 'and, with the grant, the cost');
    const sNo = await boot(false);
    check(sNo.exported('outputRowInner_')(0).indexOf('إجمالي التكلفة') === -1,
      'without the grant: no cost on the row');
    check(sNo.exported('outputRowInner_')(0).indexOf('الدفعات: 2') !== -1,
      'but the batch count and the indicator stay');
  }

  console.log('\nS8 — only the row that changed is re-rendered\n');
  {
    const s = await boot(true);
    const body = () => s.html('outputs-body');
    const row0 = () => { const el = s.document.getElementById('out-row-0'); return el ? String(el.innerHTML) : null; };

    check(body().indexOf('id="outputs-rows"') !== -1, 'rows live in their own container');
    check(row0() !== null, 'and each row is addressable as #out-row-<i>');

    const bodyBefore = body();
    const rowBefore = row0();
    s.MFGVIEW_PAGE.setOutputQty(0, 160);
    check(body() === bodyBefore, 'setOutputQty did NOT rewrite the whole materials area');
    check(row0() !== rowBefore, 'it rewrote only that row');
    check(row0().indexOf('الكمية: 160.000') !== -1, 'and the row shows the new quantity');

    const bodyBefore2 = body();
    s.MFGVIEW_PAGE.addFooterRow(0);
    check(body() === bodyBefore2, 'addFooterRow did NOT rewrite the whole area either');

    const bodyBefore3 = body();
    s.MFGVIEW_PAGE.removeFooterRow(0, 2);
    check(body() === bodyBefore3, 'nor did removeFooterRow');
  }

  console.log('\nS8 — adding a material does not touch the rows above it\n');
  {
    const s = await boot(true);
    const bodyBefore = s.html('outputs-body');
    const row0Before = String(s.document.getElementById('out-row-0').innerHTML);

    s.MFGVIEW_PAGE.addOutput();

    check(s.exported('outs')().length === 2, 'a second material was added');
    check(s.html('outputs-body') === bodyBefore,
      'the materials container was NOT rewritten — the combo above survives');
    check(String(s.document.getElementById('out-row-0').innerHTML) === row0Before,
      'and row 0 is byte-identical afterwards');
    check(s.document.getElementById('out-row-1') !== null, 'the new row was appended');
    check(String(s.html('outputs-rows')).indexOf('out-row-1') !== -1, 'inside the rows container');
  }

  console.log('\nS8 — the batch modal still writes back to one row only\n');
  {
    const s = await boot(true);
    s.MFGVIEW_PAGE.addOutput();
    const bodyBefore = s.html('outputs-body');
    s.MFGVIEW_PAGE.openBatchModal(0);
    s.MFGVIEW_PAGE.batchModalSet(0, 100);
    s.MFGVIEW_PAGE.batchModalSet(1, 50);
    s.MFGVIEW_PAGE.batchModalConfirm();
    check(s.html('outputs-body') === bodyBefore, 'confirming did not rebuild every row');
    check(s.exported('footers')()[0].length === 2, 'and row 0 got its allocation');
  }

  console.log('\nS8 — the in-place indicator refresh is wired\n');
  {
    check(VIEW.indexOf("var sEl = document.getElementById('out-sum-' + i);") !== -1,
      'refreshFooterRow_ addresses the row summary');
    check(VIEW.indexOf('sEl.innerHTML = outputSummaryInnerHtml_(i);') !== -1,
      'and refreshes it while the user types, without re-rendering the row');
    check(VIEW.indexOf("id=\"out-sum-' + i + '\"") !== -1, 'the summary carries that id');
  }

  console.log('\nS8 — drawOutputs is no longer on the keystroke paths\n');
  {
    const fnBody = name => {
      const at = VIEW.indexOf('function ' + name + '(');
      if (at === -1) return '';
      let depth = 0, i = VIEW.indexOf('{', at);
      const start = i;
      for (; i < VIEW.length; i++) {
        if (VIEW[i] === '{') depth++;
        else if (VIEW[i] === '}') { depth--; if (depth === 0) break; }
      }
      return VIEW.slice(start, i + 1);
    };
    [['setOutputQty', 'quantity typing'], ['setOutputProduct', 'product picking'],
     ['addFooterRow', 'adding a batch row'], ['removeFooterRow', 'removing one'],
     ['batchModalConfirm', 'confirming the modal']].forEach(p => {
      check(fnBody(p[0]).indexOf('drawOutputs()') === -1,
        p[0] + ' (' + p[1] + ') no longer calls drawOutputs()');
    });
    check(fnBody('addOutput').indexOf('appendOutputRow_') !== -1,
      'addOutput appends instead of redrawing');
    /* The fallbacks are deliberate: a per-row update with no host must still
       render something. */
    check(/function redrawOutputRow_[\s\S]*?if \(!host\) \{ drawOutputs\(\); return; \}/.test(VIEW),
      'redrawOutputRow_ falls back to a full draw if the row is not there yet');
    check(/function appendOutputRow_[\s\S]*?if \(!host\) \{ drawOutputs\(\); return; \}/.test(VIEW),
      'appendOutputRow_ does the same');
  }

  console.log('\n' + (failed === 0
    ? 'S8 OK — compact rows, no empty table, and only the changed row re-renders.'
    : 'S8 FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})();
