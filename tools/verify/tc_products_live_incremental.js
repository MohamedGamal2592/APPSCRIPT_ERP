'use strict';

/* Behavioral check for the tc_products_live incremental load-more flow. */
const assert = require('assert');
const { bootPage, flush } = require('./pageharness');
let liveQty = '5';

function products(offset, limit) {
  const out = [];
  for (let i = offset; i < Math.min(offset + limit, 450); i++) {
    out.push({
      id: String(450 - i), name_ar: 'صنف ' + i, name_en: 'Product ' + i,
      code: 'P' + i, category_id: '1', client_id: '2', price: '10',
      unit: 'قطعة', quantity: '5', live_quantity: liveQty,
      number_of_cartons_bags: '1', number_of_small_boxes: '2', product_unit_metric: 'علبة'
    });
  }
  return out;
}

async function main() {
  const calls = [];
  let failNextWindow = true;
  const s = bootPage({
    page: 'Company_TopChemical_ProductsLive.html',
    isSuperAdmin: true,
    containers: ['tc-root', 'pl-content', 'pl-load-more-bar', 'pl-table-host'],
    scriptlets: { CURRENT_ACTION: "'tc_products_live'" },
    expose: ['load', 'fetchData', 'showAllProducts', 'showLatestProducts', 'productsState=S'],
    call: (action, data) => {
      calls.push({ action, data: Object.assign({}, data) });
      if (action !== 'get_products_live') return { status: 'ok' };
      const limit = Number(data.limit) || 50;
      const offset = Number(data.offset) || 0;
      if (offset === 50 && failNextWindow) {
        failNextWindow = false;
        throw new Error('temporary network failure');
      }
      return { status: 'ok', columns: ['id', 'name_ar'], rows: products(offset, limit), total: 450 };
    }
  });

  await s.exported('load')();
  for (let i = 0; i < 5; i++) await flush();
  const state = s.__EXPORTS.productsState;
  const check = (ok, label) => {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label);
    if (!ok) process.exitCode = 1;
  };
  check(calls.length === 1 && calls[0].data.limit === 50 && calls[0].data.offset === 0,
    'navigation starts with one bounded 50-row request');
  check(state.rows.length === 50 && state.total === 450,
    'the first 50 rows and total are ready without loading the full catalog');
  check(s.html('pl-load-more-bar').includes('تم تحميل 50 من 450 صنف') &&
    s.html('pl-load-more-bar').includes('تحميل المزيد'),
    'the list shows loaded progress and a load-more control');

  const table = s.window.__dtStore && s.window.__dtStore['pl-table'];
  if (table) s.UIC.filterPaged('pl-table', 'Product 1');
  await s.exported('showAllProducts')();
  for (let i = 0; i < 5; i++) await flush();
  check(calls.length === 2 && calls[1].data.limit === 200 && calls[1].data.offset === 50,
    'load-more requests only the next 200 rows at the current offset');
  check(state.rows.length === 50 && s.html('pl-load-more-bar').includes('تعذر تحميل المزيد') &&
    s.html('pl-load-more-bar').includes('إعادة المحاولة'),
    'a failed continuation keeps the current rows and offers retry inline');
  await s.exported('showAllProducts')();
  for (let i = 0; i < 5; i++) await flush();
  check(calls.length === 3 && calls[2].data.offset === 50,
    'retry requests the same next window without skipping data');
  check(state.rows.length === 250 && state.total === 450 &&
    s.html('pl-load-more-bar').includes('تم تحميل 250 من 450 صنف'),
    'load-more appends the next window and updates progress');
  const tableAfter = s.window.__dtStore && s.window.__dtStore['pl-table'];
  check(tableAfter && tableAfter.originalRows.length === 250 && tableAfter.searchTerm === 'product 1',
    'the shared table includes new rows and retains the active universal search');
  check(calls.every(c => c.data.loadAll !== true),
    'no full-catalog request is sent');

  await s.exported('showAllProducts')();
  for (let i = 0; i < 5; i++) await flush();
  check(state.rows.length === 450, 'a second load-more completes the loaded range');
  liveQty = '9';
  const refreshStart = calls.length;
  await s.exported('fetchData')();
  for (let i = 0; i < 5; i++) await flush();
  const refreshCalls = calls.slice(refreshStart).map(c => [c.data.limit, c.data.offset]);
  check(JSON.stringify(refreshCalls) === JSON.stringify([[200, 0], [200, 200], [50, 400]]),
    'refresh rereads the 450 loaded rows in three bounded windows');
  check(state.rows.length === 450 && state.rows.every(r => r.live_quantity === '9'),
    'refresh replaces live quantities across every loaded page');

  if (!process.exitCode) console.log('tc_products_live_incremental: all assertions pass');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
