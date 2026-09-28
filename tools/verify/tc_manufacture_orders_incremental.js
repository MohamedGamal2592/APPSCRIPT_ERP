'use strict';

/* Behavioral check for incremental loading on tc_manufacture_orders. */
const { bootPage, flush } = require('./pageharness');

function headers(offset, limit) {
  const out = [];
  for (let i = offset; i < Math.min(offset + limit, 450); i++) {
    out.push({
      id: String(450 - i), name_ar: 'أمر ' + i, expected_quantity: '12',
      deliver_quantity: '10', product_id: '1', product_label: 'منتج الاختبار',
      status: 'In Progress', manufacture_number: 'MO-' + i,
      manufacture_delivery_number: 'DEL-' + i, is_revised: '0'
    });
  }
  return out;
}

async function main() {
  const calls = [];
  let failNextWindow = true;
  const s = bootPage({
    page: 'Company_TopChemical_ManufactureOrders.html',
    isSuperAdmin: true,
    containers: ['tc-root', 'mo-content', 'mo-table-host', 'mo-load-more-control'],
    scriptlets: { CURRENT_ACTION: "'tc_manufacture_orders'" },
    expose: ['load', 'loadMoreHeaders', 'showLatestHeaders', 'headersState=H'],
    call: (action, data) => {
      calls.push({ action, data: Object.assign({}, data) });
      if (action === 'get_manufacture_refs') return { products: [], products_full: [], warehouses: [], statuses: [] };
      if (action !== 'get_manufacture_headers') return { status: 'ok' };
      const limit = Number(data.limit) || 20;
      const offset = Number(data.offset) || 0;
      if (offset === 20 && failNextWindow) {
        failNextWindow = false;
        throw new Error('temporary network failure');
      }
      return { status: 'ok', columns: ['id', 'name_ar'], rows: headers(offset, limit), total: 450 };
    }
  });

  s.exported('load')();
  for (let i = 0; i < 8; i++) await flush();
  const state = s.__EXPORTS.headersState;
  const check = (ok, label) => {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label);
    if (!ok) process.exitCode = 1;
  };
  const first = calls.find(c => c.action === 'get_manufacture_headers');
  check(first && first.data.limit === 20 && first.data.offset === 0,
    'navigation starts with a bounded 20-header request');
  check(state.rows.length === 20 && state.total === 450 &&
    s.html('mo-load-more-control').includes('تم تحميل 20 من 450 سجل'),
    'the first headers render and show progress without downloading all orders');

  const table = s.window.__dtStore && s.window.__dtStore['mo-table'];
  if (table) s.UIC.filterPaged('mo-table', 'mo-1');
  await s.exported('loadMoreHeaders')();
  for (let i = 0; i < 5; i++) await flush();
  check(state.rows.length === 20 && s.html('mo-load-more-control').includes('تعذر تحميل المزيد') &&
    s.html('mo-load-more-control').includes('إعادة المحاولة'),
    'a failed continuation keeps existing rows and exposes inline retry');

  await s.exported('loadMoreHeaders')();
  for (let i = 0; i < 5; i++) await flush();
  const headerCalls = calls.filter(c => c.action === 'get_manufacture_headers');
  check(headerCalls.length === 3 && headerCalls[1].data.limit === 200 && headerCalls[1].data.offset === 20 &&
    headerCalls[2].data.offset === 20,
    'retry uses the same offset and each continuation is bounded to 200');
  check(state.rows.length === 220 && state.total === 450 &&
    s.html('mo-load-more-control').includes('تم تحميل 220 من 450 سجل'),
    'the next window appends and updates the loaded count');
  const tableAfter = s.window.__dtStore && s.window.__dtStore['mo-table'];
  check(tableAfter && tableAfter.originalRows.length === 220 && tableAfter.searchTerm === 'mo-1',
    'the shared table retains its universal search as new rows append');
  check(headerCalls.every(c => c.data.loadAll !== true),
    'the page no longer sends a full-catalog request');

  if (!process.exitCode) console.log('tc_manufacture_orders_incremental: all assertions pass');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
