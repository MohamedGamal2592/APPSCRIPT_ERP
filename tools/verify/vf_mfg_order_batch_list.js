/**
 * رقم التشغيلة on the manufacturing-order editor (vf_mfg_order) offers the
 * batch numbers already in use as a reference to pick or copy from, while the
 * field itself stays free text — a brand-new batch number has to be typeable,
 * so this must never become a closed list.
 *
 * The client half runs for real through pageharness. The server half is
 * asserted over the source: mfgBatchOptions_ lives inside the module IIFE and
 * the VF action harness would have to satisfy mfgAssertMfgSchema_ across five
 * sheets to reach it, which would test the fixture more than the code. What is
 * checked here is what a reviewer would otherwise have to take on trust — that
 * both detail responses carry the list, and that the builder walks the sheet
 * backwards (most recently used first) rather than sorting.
 *
 * Run: node tools/verify/vf_mfg_order_batch_list.js
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

/* Newest first, as the server sends them, and one value carrying a quote. */
const BATCHES = ['TS-0099', 'TS-0098', 'TS-"08"', 'TS-0097'];

function detail(batchOptions) {
  return {
    status: 'success', is_new: false, can_see_cost: true,
    recipe_options: [], product_options: [], work_center_options: [],
    enums: { operation_type: [], shift: [] },
    batch_options: batchOptions,
    order: {
      unique_id: 'MO-1', transaction_code: 'MO-0001', mo_status: 'Draft',
      manufacture_batch: 'TS-0099', manufactured_qty: 0, actual_qty: 0, produced_product: ''
    },
    outputs: [], workops: [], byproducts: []
  };
}

async function boot(batchOptions) {
  const s = bootPage({
    page: 'Company_ValleyFoods_MfgOrderView.html',
    isSuperAdmin: true,
    call: (action) => (action === 'get_valley_mfg_order_detail' ? detail(batchOptions) : { status: 'success' })
  });
  s.MFGVIEW_PAGE.load();
  await flush(); await flush(); await flush();
  return s.html('vf-mo-view');
}

(async function () {
  console.log('\n1 — a reference list, not a constraint\n');
  const form = await boot(BATCHES);

  check(/id="f-batch"[^>]*list="f-batch-options"/.test(form),
    'رقم التشغيلة points at the reference list');
  check(/id="f-batch" class="input" type="text"/.test(form),
    'and is still a free-text input, so a new batch number can be typed');
  check(form.indexOf('<datalist id="f-batch-options">') !== -1, 'the list itself is rendered');
  check(/id="f-batch"[^>]*value="TS-0099"/.test(form),
    'the order’s own batch number is still what the field shows');

  console.log('\n2 — the values, in the order the server sent them\n');
  const list = form.slice(form.indexOf('<datalist id="f-batch-options">'), form.indexOf('</datalist>'));
  check((list.match(/<option /g) || []).length === BATCHES.length,
    'every supplied value is offered', (list.match(/<option /g) || []).length);
  check(list.indexOf('value="TS-0099"') < list.indexOf('value="TS-0098"')
    && list.indexOf('value="TS-0098"') < list.indexOf('value="TS-0097"'),
    'most-recently-used-first survives the trip to the markup');
  check(list.indexOf('value="TS-&quot;08&quot;"') !== -1,
    'a value carrying a quote is escaped rather than left to break the attribute',
    list.slice(list.indexOf('TS-')));

  console.log('\n3 — placement and the empty case\n');
  check(form.indexOf('<datalist') > form.indexOf('id="f-actual"')
    && form.indexOf('<datalist') < form.indexOf('id="f-product"'),
    'the list sits between the two field grids, so it is no grid child');

  const bare = await boot(undefined);
  check(bare.indexOf('<datalist id="f-batch-options">') !== -1
    && bare.indexOf('<option') === -1,
    'a server that sends no list still renders the field and an empty list');
  check(/id="f-batch"[^>]*list="f-batch-options"/.test(bare),
    'and the field is unharmed by it');

  console.log('\n4 — the server ships the list on both detail responses\n');
  check(ACTIONS.split('batch_options: mfgBatchOptions_(dbId)').length - 1 === 2,
    'a new order and an existing one both carry it — copying an existing number matters most on a new order');
  check(/function mfgBatchOptions_\(dbId\) \{\s*return finRefsCached_\(dbId, 'vf_mfg_batch_options'/.test(ACTIONS),
    'it is cached like every other reference set, under its own kind');
  check(/for \(var i = rows\.length - 1; i >= 0 && out\.length < MFG_BATCH_OPTIONS_LIMIT_; i--\)/.test(ACTIONS),
    'the builder walks the appended rows backwards and stops at the cap — no sort, no unbounded list');
  check(/var MFG_BATCH_OPTIONS_LIMIT_ = \d+;/.test(ACTIONS), 'the cap is a named constant');
  check(ACTIONS.indexOf("rows[i].manufacture_batch") !== -1,
    'the column read is valley_manufacture_header.manufacture_batch');
  check(/const MFG_ORDER_HEADERS = \[[^\]]*'manufacture_batch'/.test(ACTIONS),
    'which is a real column of that sheet');

  console.log('\n' + (failed ? failed + ' check(s) FAILED.' : 'MO batch reference list checks pass.'));
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err && err.stack ? err.stack : err); process.exit(1); });
