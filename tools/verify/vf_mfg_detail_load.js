/**
 * Manufacturing-order detail load recovery.
 *
 * Exercises the real page through pageharness and proves that an empty
 * google.script.run success result is retried once, then either renders the
 * order or produces a useful error instead of dereferencing null.
 *
 * Run: node tools/verify/vf_mfg_detail_load.js
 */
'use strict';

const { bootPage, flush } = require('./pageharness');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else {
    failed++;
    console.log('  FAIL  ' + label);
    if (extra) console.log('        ' + extra);
  }
}

function validDetail() {
  return {
    status: 'success',
    is_new: false,
    can_see_cost: true,
    recipe_options: [],
    product_options: [],
    work_center_options: [],
    enums: { operation_type: [], shift: [] },
    order: {
      unique_id: 'MO-1',
      transaction_code: 'MO-DRAFT-1',
      mo_status: 'Draft',
      manufacture_date: '2026-09-20',
      operation_type: '',
      shift: '',
      produced_product: '',
      manufactured_qty: 0,
      expected_qty: 0,
      actual_qty: 0
    },
    outputs: [],
    workops: [],
    byproducts: []
  };
}

async function settle() {
  await flush();
  await flush();
  await flush();
  await flush();
}

(async function () {
  console.log('VF MFG detail load recovery\n');

  {
    let detailCalls = 0;
    const page = bootPage({
      page: 'Company_ValleyFoods_MfgOrderView.html',
      isSuperAdmin: true,
      call: (action) => {
        if (action !== 'get_valley_mfg_order_detail') return { status: 'success' };
        detailCalls++;
        return detailCalls === 1 ? null : validDetail();
      }
    });
    page.MFGVIEW_PAGE.load();
    await settle();
    check(detailCalls === 2, 'a null detail response is replayed exactly once', detailCalls);
    check(page.html('vf-mo-view').indexOf('MO-DRAFT-1') !== -1,
      'a valid replay response renders the draft order');
  }

  {
    let detailCalls = 0;
    const page = bootPage({
      page: 'Company_ValleyFoods_MfgOrderView.html',
      isSuperAdmin: true,
      call: (action) => {
        if (action === 'get_valley_mfg_order_detail') detailCalls++;
        return null;
      }
    });
    page.MFGVIEW_PAGE.load();
    await settle();
    const html = page.html('vf-mo-view');
    check(detailCalls === 2, 'a persistently null response is not retried forever', detailCalls);
    check(html.indexOf('تعذر تحميل أمر التصنيع') !== -1,
      'the existing recovery panel is rendered');
    check(html.indexOf('لم يُرجع الخادم بيانات أمر التصنيع') !== -1,
      'the panel explains the empty server response');
    check(html.indexOf("Cannot read properties of null") === -1,
      'the raw null-property exception is gone');
  }

  {
    let detailCalls = 0;
    const page = bootPage({
      page: 'Company_ValleyFoods_MfgOrderView.html',
      isSuperAdmin: true,
      call: (action) => {
        if (action === 'get_valley_mfg_order_detail') detailCalls++;
        return {};
      }
    });
    page.MFGVIEW_PAGE.load();
    await settle();
    check(detailCalls === 1, 'a malformed non-null response is rejected without replay', detailCalls);
    check(page.html('vf-mo-view').indexOf('لم يُرجع الخادم سجل أمر التصنيع المطلوب') !== -1,
      'a missing order record gets a specific error');
  }

  console.log('\n' + (failed === 0
    ? 'VF MFG DETAIL LOAD OK'
    : 'VF MFG DETAIL LOAD FAILED: ' + failed));
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
