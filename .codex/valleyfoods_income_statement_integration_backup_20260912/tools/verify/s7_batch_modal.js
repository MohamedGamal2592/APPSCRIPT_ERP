/**
 * S7 verification (U-44) — the FIFO batch modal.
 *
 * Boots the REAL manufacturing view, opens the modal through the page's own
 * + دفعة entry point, and asserts on the markup and state it produces.
 *
 * The two things most worth proving:
 *   1. There is still only ONE FIFO. fifoFill_ with no prior allocation is
 *      differentially compared against the original autoAllocFifo_ body over
 *      randomised inputs — same allocations, same order, same rounding.
 *   2. The client's tolerance is the server's, to the digit. A looser one would
 *      let the modal accept an allocation the save then rejects.
 *
 * Run: node tools/verify/s7_batch_modal.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEW = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_MfgOrderView.html'), 'utf8');
const ACTIONS = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_HR_Modules.js'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

const BATCHES = [
  { batch_uid: 'B-001', lot: 'LOT-A', current_qty: 500, available: 100, unit_cost: 12.5, transaction_date: '2026-01-05', unit: 'kg' },
  { batch_uid: 'B-002', lot: 'LOT-B', current_qty: 300, available: 60, unit_cost: 7.25, transaction_date: '2026-02-11', unit: 'kg' },
  { batch_uid: 'B-003', lot: 'LOT-C', current_qty: 200, available: 40, unit_cost: 9, transaction_date: '2026-03-02', unit: 'kg' }
];

function detail(canSeeCost, footers) {
  const strip = (o, keys) => { keys.forEach(k => delete o[k]); return o; };
  const batches = JSON.parse(JSON.stringify(BATCHES));
  const outputs = [{
    unique_id: 'OUT-1', product_id: 'P-1', product_qty: 150, product_name: 'خامة أ',
    cost_unit: 10, total_cost: 1500,
    footers: footers || [],
    batches: batches
  }];
  if (!canSeeCost) {
    batches.forEach(b => strip(b, ['unit_cost']));
    outputs[0].footers.forEach(f => strip(f, ['unit_cost', 'total_cost']));
    strip(outputs[0], ['cost_unit', 'total_cost']);
  }
  return {
    status: 'success', is_new: false, can_see_cost: canSeeCost,
    recipe_options: [], product_options: [{ value: 'P-1', label: 'خامة أ' }],
    work_center_options: [], enums: { operation_type: [], shift: [] },
    order: { unique_id: 'MO-1', mo_status: 'Draft', manufactured_qty: 200, actual_qty: 100 },
    outputs: outputs, workops: [], byproducts: []
  };
}

async function boot(canSeeCost, footers) {
  const s = bootPage({
    page: 'Company_ValleyFoods_MfgOrderView.html',
    isSuperAdmin: true,
    expose: ['fifoFill_', 'batchModalState_', 'round3',
      'BATCH_TOLERANCE=function () { return BATCH_TOLERANCE; }',
      'footers=function () { return OUTPUT_FOOTERS; }',
      'outputsOf=function () { return MFG_OUTPUTS; }'],
    call: (action) => {
      if (action === 'get_valley_mfg_order_detail') return detail(canSeeCost, footers ? JSON.parse(JSON.stringify(footers)) : []);
      if (action === 'get_valley_product_batches') return { status: 'success', batches: JSON.parse(JSON.stringify(BATCHES)) };
      return { status: 'success' };
    }
  });
  s.MFGVIEW_PAGE.load();
  await flush(); await flush(); await flush();
  return s;
}

/* The ORIGINAL autoAllocFifo_ body, as it stood before S7, for the differential. */
function originalFifo(batches, qty) {
  if (qty <= 0 || !batches.length) return [];
  let remaining = qty; const footers = [];
  for (let b = 0; b < batches.length && remaining > 0.0001; b++) {
    const avail = Number(batches[b].available) || 0;
    if (avail <= 0) continue;
    const take = avail >= remaining ? remaining : avail;
    footers.push({ item: String(batches[b].batch_uid || ''), item_code: String(batches[b].lot || ''), qty: Math.round(take * 1000) / 1000 });
    remaining = Math.round((remaining - take) * 1000) / 1000;
  }
  return footers;
}

(async function () {
  const s = await boot(true);
  const fifoFill_ = s.exported('fifoFill_');

  console.log('S7 — there is still only one FIFO\n');
  {
    /* Deterministic pseudo-random inputs, so a failure is reproducible. */
    let seed = 20260906;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let mismatches = 0, cases = 0;
    for (let t = 0; t < 400; t++) {
      const n = 1 + Math.floor(rnd() * 6);
      const bs = [];
      for (let i = 0; i < n; i++) {
        bs.push({ batch_uid: 'B' + i, lot: 'L' + i, available: Math.round(rnd() * 200 * 1000) / 1000 });
      }
      const qty = Math.round(rnd() * 500 * 1000) / 1000;
      const mine = fifoFill_(bs, qty, null).map(r => [r.item, r.item_code, r.qty]);
      const theirs = originalFifo(bs, qty).map(r => [r.item, r.item_code, r.qty]);
      cases++;
      if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
        mismatches++;
        if (mismatches === 1) console.log('        first mismatch: qty=' + qty + ' ' + JSON.stringify(bs));
      }
    }
    check(mismatches === 0, 'fifoFill_(batches, qty, null) matches the original autoAllocFifo_ on all ' + cases + ' randomised cases');
    const loops = (VIEW.match(/remaining > 0\.0001/g) || []).length;
    check(loops === 1, 'exactly one oldest-first allocation loop exists in the page', 'found ' + loops);
  }

  console.log('\nS7 — the tolerance is the server\'s, exactly\n');
  {
    const tol = s.exported('BATCH_TOLERANCE')();
    check(tol === 0.01, 'client tolerance is 0.01');
    check(/Math\.abs\(paySum - payQty\) > 0\.01/.test(ACTIONS),
      'server compares Math.abs(paySum - payQty) > 0.01');
    check(/var paySum = Math\.round\(rows\.reduce[\s\S]{0,120}\* 1000\) \/ 1000;/.test(ACTIONS),
      'server rounds the sum to 3 decimals before comparing');
    check(VIEW.indexOf('function round3(v) { return Math.round((Number(v) || 0) * 1000) / 1000; }') !== -1,
      'client rounds to 3 decimals the same way');
    check(/Math\.abs\(diff\) <= BATCH_TOLERANCE/.test(VIEW), 'client comparison mirrors it');
  }

  console.log('\nS7 — on open with nothing allocated: FIFO proposed, oldest first\n');
  {
    const s1 = await boot(true, []);
    s1.MFGVIEW_PAGE.openBatchModal(0);
    const body = s1.html('vf-batch-modal');
    check(body.length > 0, 'the modal opened');
    check(body.indexOf('class="modal modal-lg"') !== -1, 'it is UIC.openModal with size lg');
    check(body.indexOf('LOT-A') < body.indexOf('LOT-B') && body.indexOf('LOT-B') < body.indexOf('LOT-C'),
      'rows are oldest-first');
    const st = s1.exported('batchModalState_')();
    check(st.qty === 150, 'required quantity is 150');
    check(st.sum === 150, 'FIFO proposed exactly 150');
    check(st.matched === true, 'so the modal opens matched');
    /* 100 from the oldest, then 50 from the next, nothing from the third. */
    check(/bm-qty-0[^>]*value="100"/.test(body), 'batch 1 proposed 100 (all of it)');
    check(/bm-qty-1[^>]*value="50"/.test(body), 'batch 2 proposed 50 (the shortfall)');
    check(/bm-qty-2[^>]*value=""/.test(body) || /bm-qty-2[^>]*value="0"/.test(body), 'batch 3 proposed nothing');
    check(body.indexOf('مجموع الدفعات: 150.000 من 150.000') !== -1, 'running total reads X من Y');
    check(body.indexOf('✔') !== -1, 'green tick when matched');
    check(s1.html('vf-batch-modal').indexOf('id="bm-confirm"') !== -1 &&
      !/id="bm-confirm"[^>]*disabled/.test(body), 'confirm is enabled while matched');
  }

  console.log('\nS7 — on open with batches already allocated: they are kept\n');
  {
    /* The user hand-picked 40 from the THIRD (newest) batch. FIFO must keep it
       and fill only the 110 shortfall from the oldest batches. */
    const s2 = await boot(true, [{ item: 'B-003', item_code: 'LOT-C', qty: 40, unit_cost: 9, saved: true }]);
    s2.MFGVIEW_PAGE.openBatchModal(0);
    const body = s2.html('vf-batch-modal');
    const st = s2.exported('batchModalState_')();
    check(/bm-qty-2[^>]*value="40"/.test(body), 'the hand-picked batch keeps its 40');
    check(/bm-qty-0[^>]*value="100"/.test(body), 'the shortfall is filled oldest-first: 100 from batch 1');
    check(/bm-qty-1[^>]*value="10"/.test(body), 'and 10 from batch 2');
    check(st.sum === 150 && st.matched, 'total is 150 and matched');
  }

  console.log('\nS7 — confirm is disabled until the total matches\n');
  {
    const s3 = await boot(true, []);
    s3.MFGVIEW_PAGE.openBatchModal(0);
    const stateOf = s3.exported('batchModalState_');

    s3.MFGVIEW_PAGE.batchModalSet(1, 40);   /* 100 + 40 = 140, short by 10 */
    let st = stateOf();
    check(st.sum === 140 && !st.matched, 'short by 10 -> not matched');
    check(s3.exported('round3')(st.diff) === -10, 'diff is -10');
    let sum = s3.MFGVIEW_PAGE; /* summary is re-rendered in place; assert via state */

    s3.MFGVIEW_PAGE.batchModalSet(1, 60);   /* 100 + 60 = 160, over by 10 */
    st = stateOf();
    check(st.sum === 160 && !st.matched, 'over by 10 -> not matched');

    /* The boundary: the server rejects > 0.01, so 0.01 exactly must be accepted
       and 0.011 rejected — on both sides. */
    s3.MFGVIEW_PAGE.batchModalSet(1, 50.01);
    check(stateOf().matched === true, 'exactly +0.01 over -> matched (server accepts it)');
    s3.MFGVIEW_PAGE.batchModalSet(1, 49.99);
    check(stateOf().matched === true, 'exactly -0.01 under -> matched');
    s3.MFGVIEW_PAGE.batchModalSet(1, 50.011);
    check(stateOf().matched === false, '+0.011 -> not matched (server would reject)');
    s3.MFGVIEW_PAGE.batchModalSet(1, 49.989);
    check(stateOf().matched === false, '-0.011 -> not matched');
  }

  console.log('\nS7 — over-allocation is flagged, and the server is named as the authority\n');
  {
    const s4 = await boot(true, []);
    s4.MFGVIEW_PAGE.openBatchModal(0);
    s4.MFGVIEW_PAGE.batchModalSet(0, 120);   /* only 100 available */
    s4.MFGVIEW_PAGE.batchModalSet(1, 30);    /* 120 + 30 = 150, matched but over on row 0 */
    const st = s4.exported('batchModalState_')();
    check(st.matched === true, 'the total still matches');
    check(st.over.length === 1 && st.over[0] === 0, 'row 0 is flagged as over its availability');
    check(VIEW.indexOf('المتاح المعروض تقديري، والخادم يتحقق منه مقابل أرصدة الدفعات الفعلية عند الحفظ') !== -1,
      'the message says the shown availability is indicative and the server is the authority');
  }

  console.log('\nS7 — cancel leaves the existing allocation untouched\n');
  {
    const existing = [{ item: 'B-003', item_code: 'LOT-C', qty: 40, unit_cost: 9, saved: true }];
    const s5 = await boot(true, existing);
    const before = JSON.stringify(s5.exported('footers')()[0]);
    s5.MFGVIEW_PAGE.openBatchModal(0);
    s5.MFGVIEW_PAGE.batchModalSet(0, 999);
    s5.MFGVIEW_PAGE.batchModalCancel();
    const after = JSON.stringify(s5.exported('footers')()[0]);
    check(before === after, 'OUTPUT_FOOTERS is byte-identical after cancel');
    check(s5.html('vf-batch-modal') === '', 'and the modal is closed');
  }

  console.log('\nS7 — confirm writes back and re-renders\n');
  {
    const s6 = await boot(true, []);
    s6.MFGVIEW_PAGE.openBatchModal(0);
    s6.MFGVIEW_PAGE.batchModalSet(0, 90);
    s6.MFGVIEW_PAGE.batchModalSet(1, 60);
    s6.MFGVIEW_PAGE.batchModalConfirm();
    const f = s6.exported('footers')()[0];
    check(f.length === 2, 'two allocations written back');
    check(f[0].item === 'B-001' && f[0].qty === 90, 'first is B-001 x 90');
    check(f[1].item === 'B-002' && f[1].qty === 60, 'second is B-002 x 60');
    check(f.every(r => r.qty > 0), 'zero rows are not written');
    /* S8: confirm re-renders that material's row, not the whole materials area. */
    const row0 = s6.document.getElementById('out-row-0');
    check(row0 && String(row0.innerHTML).indexOf('LOT-A') !== -1,
      "the material's own row was re-rendered with the new allocation");
  }

  console.log('\nS7 — a mismatched confirm cannot be forced through\n');
  {
    const s7 = await boot(true, []);
    s7.MFGVIEW_PAGE.openBatchModal(0);
    s7.MFGVIEW_PAGE.batchModalSet(0, 10);   /* 10 + 50 = 60, well short */
    s7.MFGVIEW_PAGE.batchModalSet(1, 0);
    const before = JSON.stringify(s7.exported('footers')()[0]);
    s7.MFGVIEW_PAGE.batchModalConfirm();    /* button is disabled; call it anyway */
    check(JSON.stringify(s7.exported('footers')()[0]) === before,
      'confirming while mismatched changes nothing');
  }

  console.log('\nS7 — cost columns only with the grant\n');
  {
    const sWith = await boot(true, []);
    sWith.MFGVIEW_PAGE.openBatchModal(0);
    const bWith = sWith.html('vf-batch-modal');
    const sNo = await boot(false, []);
    sNo.MFGVIEW_PAGE.openBatchModal(0);
    const bNo = sNo.html('vf-batch-modal');
    check(bWith.indexOf('تكلفة الوحدة') !== -1, 'with the grant: unit cost column present');
    check(bWith.indexOf('12.500') !== -1, 'with the grant: the unit cost is shown');
    check(bNo.indexOf('تكلفة الوحدة') === -1, 'without: no unit cost column');
    check(bNo.indexOf('12.5') === -1 && bNo.indexOf('7.25') === -1, 'without: no cost figure at all');
    check(bNo.indexOf('LOT-A') !== -1 && bNo.indexOf('المتاح') !== -1 && bNo.indexOf('المخصص') !== -1,
      'without: lot, available and allocated all still there — allocation still works');
    const stNo = sNo.exported('batchModalState_')();
    check(stNo.sum === 150 && stNo.matched, 'and FIFO still proposes a matching allocation');
  }

  console.log('\nS7 — the quantity-change drift is fixed\n');
  {
    /* Hand-edit a batch, then change the quantity. Before this fix, changing the
       quantity did nothing at all once any batch was allocated. */
    const s8 = await boot(true, [{ item: 'B-001', item_code: 'LOT-A', qty: 30, unit_cost: 12.5, saved: true }]);
    s8.MFGVIEW_PAGE.setOutputQty(0, 120);
    const f = s8.exported('footers')()[0];
    const sum = f.reduce((t, r) => t + (Number(r.qty) || 0), 0);
    check(Math.abs(sum - 120) <= 0.01, 'shortfall re-allocated: batches now total ' + sum + ' for qty 120');
    check(f.some(r => r.item === 'B-001' && r.qty === 30), 'the hand-made allocation of 30 was KEPT');
    check(f.length > 1, 'and the rest was filled from other batches, oldest-first');

    /* Excess is not silently discarded — it is reported. */
    const s9 = await boot(true, [{ item: 'B-001', item_code: 'LOT-A', qty: 100, unit_cost: 12.5, saved: true }]);
    s9.MFGVIEW_PAGE.setOutputQty(0, 40);
    /* The page's `UI` is UIC when it exists, so UI.toast is UIC.toast, which
       appends a .toast element to <body>. Read it from the DOM. */
    const toasts = s9.toasts();
    check(toasts.some(t => t.indexOf('أكبر من الكمية الجديدة') !== -1),
      'reducing the quantity below what is allocated warns instead of staying silent',
      JSON.stringify(toasts));
    check(s9.exported('footers')()[0].length === 1,
      'and does not silently discard the user\'s own allocation');
  }

  console.log('\nS7 — no second overlay, no hardcoded width\n');
  {
    check(VIEW.indexOf("UIC.openModal('vf-batch-modal'") !== -1, 'built on UIC.openModal');
    check(VIEW.indexOf("size: 'lg'") !== -1, "with size: 'lg'");
    /* STRENGTHENED by the UI/UX run, step 3.4 (U-24).
     *
     * This used to assert `overlays > 0` — "the batch modal did not add a
     * SECOND bespoke overlay; the one that was already here is still the only
     * one". That was the right guard at the time.
     *
     * The page-local overlay has since been removed entirely: showLoading and
     * hideLoading now delegate to the single shared loading service, so there
     * is no bespoke overlay on this page at all. The assertion is therefore
     * inverted to the STRONGER statement rather than deleted. */
    const overlays = (VIEW.match(/vf-loading-overlay/g) || []).length;
    check(overlays === 0, 'no bespoke loading overlay is built on this page at all');
    check(/function showLoading[\s\S]{0,200}UIC\.showPageLoading/.test(VIEW),
      'showLoading delegates to the one shared loading service');
    check(/function hideLoading[\s\S]{0,200}UIC\.hidePageLoading/.test(VIEW),
      'hideLoading delegates to the one shared loading service');
    check(!/vf-batch-modal[\s\S]{0,400}max-width:\s*\d/.test(VIEW), 'no hardcoded width on the modal');
    check(VIEW.indexOf('#875A7B') === -1 || (VIEW.match(/#875A7B/g) || []).length === 1,
      'no second hardcoded-colour spinner was added');
  }

  console.log('\n' + (failed === 0
    ? 'S7 OK — one FIFO, the server\'s tolerance, and the drift closed.'
    : 'S7 FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})();

