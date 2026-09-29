/**
 * S25 — ONE stock authority for Valley Foods.
 *
 *   valley_current_products.current_qty is the NET available quantity. It is
 *   produced by a sheet formula, that formula is correct, and it is TRUSTED.
 *
 *   There is exactly one availability formula in the system:
 *
 *       available(batch, document) = current_qty(batch) + held(document, batch)
 *
 *   `held` is what the document being edited already has recorded on the sheet
 *   against that batch, and it is ZERO for a new document. The add-back is not
 *   an optimisation, it is the correctness condition: the document's own
 *   committed quantity is already subtracted inside current_qty and the save is
 *   about to rewrite those very rows, so it is still the document's to spend.
 *   Without it, re-saving an unchanged order refuses its own stock — which is
 *   the bug this was written for.
 *
 * Four readers used to re-subtract commitments on top of that already-net base,
 * each a different subset, so each double-counted. This file exists to keep
 * them deleted. Half of it is static (the terms are gone, the table is read
 * live) and half is a dry run of the real code lifted out of the real source.
 *
 * Run: node tools/verify/s25_stock_authority.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const LINES = SRC.split('\n');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

/** Source text of a module-level (2-space indented) function, up to the next one. */
const STARTS = [];
LINES.forEach((l, i) => {
  /* saveValleyMfgOrder_ sits one level deeper than its neighbours, so the
     module level is 2 OR 4 spaces here; anything nested is deeper still. */
  const m = l.match(/^ {2,4}function ([A-Za-z0-9_]+)\s*\(/);
  if (m) STARTS.push([m[1], i]);
});
function fnText(name) {
  const at = STARTS.findIndex(s => s[0] === name);
  if (at === -1) throw new Error('function not found in the real source: ' + name);
  const to = at + 1 < STARTS.length ? STARTS[at + 1][1] : LINES.length;
  return LINES.slice(STARTS[at][1], to).join('\n');
}


/* ── 1. the four second subtractions are gone, and stay gone ─────────────── */
console.log('S25 — no reader subtracts from current_qty\n');

check(SRC.indexOf('vfLiveSalesLines_') === -1,
  'vfLiveSalesLines_ no longer exists');
check(SRC.indexOf('vfLiveMfgFooterOwners_') === -1,
  'vfLiveMfgFooterOwners_ no longer exists');
check(SRC.indexOf('usedByBatch') === -1,
  'the MO guard\'s usedByBatch term is gone');
check(!/\b(b|batches\[[^\]]+\])\.(used|restored|consumed|moved)\b/.test(SRC),
  'the warehouse reader\'s used / restored / consumed / moved terms are gone');
check(SRC.indexOf('existingAllocToBatch') === -1 && SRC.indexOf('existingAllocInv') === -1,
  'the sales save\'s existing-allocation baseline is gone');

/* Nothing anywhere decrements a balance. If a future edit reintroduces a second
   subtraction it will almost certainly look like one of these. */
check(!/(current_qty|available|balance|batchUsage|needByBatch)\s*-=/.test(SRC),
  'nothing decrements a balance in place (`-=` against a quantity)');

/* No line performs arithmetic ON current_qty. `Number(x.current_qty) || 0` is a
   read, not arithmetic, so it is excluded; a `- Σ something` is not. */
const ARITH = LINES
  .map((l, i) => [i + 1, l])
  .filter(p => /current_qty/.test(p[1]))
  .filter(p => !/^\s*(\*|\/\*|\/\/)/.test(p[1]))                 /* comment bodies */
  .map(p => [p[0], p[1].replace(/\|\|\s*0/g, '')])               /* the ` || 0` default */
  .filter(p => /current_qty\s*[-+]|[-+]\s*[A-Za-z0-9_.$[\]]*current_qty/.test(p[1]));
check(ARITH.length === 0,
  'no line adds to or subtracts from current_qty',
  ARITH.map(p => p[0] + ': ' + p[1].trim()).join('\n        '));

/* The ONLY adjustment in the module, stated positively. */
const FINANCE_MARKER = SRC.indexOf('/* CONSOLIDATED VALLEYFOODS FINANCIAL REPORTING');
const CODE = (FINANCE_MARKER >= 0 ? SRC.slice(0, FINANCE_MARKER) : SRC).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const AVAIL = (CODE.match(/\bavailable\s*[:=][^;\n]*/g) || []).map(x => x.trim());
const ALLOWED = [
  'available: Math.round((cur + h) * 1000) / 1000',   /* vfBatchBalance_: the add-back */
  'available = Math.max(0, b.current_qty)',           /* whBatchAvailability_: raw */
  'available: b.available'                            /* a pass-through, not an adjustment */
];
const STRAY = AVAIL.filter(x => !ALLOWED.some(a => x.indexOf(a) !== -1));
check(STRAY.length === 0,
  'the only two availability expressions in the module are `current_qty + held` and `current_qty`',
  STRAY.join('\n        '));

/* valley_products_movement is never touched. */
check(SRC.indexOf('valley_products_movement') === -1,
  'valley_products_movement is never read, written or referenced');


/* ── 2. one function, and every call site goes through it ────────────────── */
console.log('\nS25 — one availability function\n');

check(/function vfBatchBalance_\(dbId, opts\)/.test(SRC),
  'vfBatchBalance_(dbId, opts) exists');
check(/function vfMfgHeldByBatch_\(dbId, moUid\)/.test(SRC) &&
      /function vfSalesHeldByBatch_\(dbId, invoiceUid\)/.test(SRC),
  'and the two held-by helpers');

const BATCHES_FN = fnText('getValleyProductBatches_');
check(/vfBatchBalance_\(dbId, \{ product_id: pid/.test(BATCHES_FN),
  'getValleyProductBatches_ delegates to it and computes nothing itself');
check(BATCHES_FN.indexOf('CacheService') === -1 && BATCHES_FN.indexOf('vfbatch_') === -1,
  'getValleyProductBatches_ contains no CacheService read');
check(/data\.invoice_uid \|\| data\.exclude_invoice_unique_id/.test(BATCHES_FN),
  'invoice_uid is canonical and exclude_invoice_unique_id is still accepted as an alias');
check(/data && data\.mo_uid/.test(BATCHES_FN),
  'and mo_uid is accepted');

check(/vfBatchBalance_\(dbId, \{ mo_uid: myUid, include_empty: true \}\)/.test(SRC),
  'the MO save guard reads its balance from the same function');
check(/vfBatchBalance_\(dbId, \{\s*invoice_uid:/.test(SRC),
  'and so does the sales save baseline');
const MO_DETAIL = fnText('getValleyMfgOrderDetail_');
check(!/getValleyProductBatches_\(/.test(MO_DETAIL) && /var outputs = full\.outputs \|\| \[\]/.test(MO_DETAIL),
  'getValleyMfgOrderDetail_ leaves batch reads to the document-aware picker');
check(/getValleyProductBatches_\(\{ product_id: pid, mo_uid: moUid, invoice_uid: invoiceUid \}/.test(SRC),
  'and so does getValleyProductBatchesMulti_');


/* ── 3. valley_current_products is read live, never cached ───────────────── */
console.log('\nS25 — the table is read live\n');

check(!/getAllRecords_\(\s*dbId\s*,\s*'valley_current_products'\s*\)/.test(SRC),
  'valley_current_products is never reached through getAllRecords_');
const CP_READS = (SRC.match(/vfCurrentProducts_\(dbId\)/g) || []).length;
check(CP_READS >= 7,
  'every reader routes through vfCurrentProducts_ (' + CP_READS + ' call sites)');

const LIVE_FN = fnText('vfCurrentProducts_');
check(LIVE_FN.indexOf('_recordCache_') === -1 && LIVE_FN.indexOf('getAllRecords_') === -1,
  'vfCurrentProducts_ neither populates nor consults the per-request memo');
check(/getDataRange\(\)\.getValues\(\)/.test(LIVE_FN),
  'it reads the range directly, on every call');
check(LIVE_FN.indexOf('CacheService') === -1,
  'and there is no CacheService entry for it either');

/* Plan §4.3 — the client does not cache batch lists, and must not start. */
const PAGES = ['Company_ValleyFoods_MfgOrderView.html', 'Company_ValleyFoods_MfgOrders.html',
  'Company_ValleyFoods_Sales.html'];
PAGES.forEach(function (f) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { check(false, f + ' exists'); return; }
  const txt = fs.readFileSync(p, 'utf8');
  const swr = (txt.match(/swr\s*\([^)]*(get_valley_product_batches|get_valley_mfg_order_detail)/g) || []);
  check(swr.length === 0,
    f + ' routes no batch or MO-detail call through UIC.Cache.swr', swr.join(' | '));
});

/* The client sends the document it is editing — without it there is no add-back. */
const MV = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_MfgOrderView.html'), 'utf8');
check((MV.match(/mo_uid: MO_UID/g) || []).length >= 4,
  'MfgOrderView sends mo_uid on the detail call and all three batch calls');
check(MV.indexOf("(متاح: 0)") === -1,
  'and neither batch renderer prints a hard-coded «(متاح: 0)» any more');
check(fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Sales.html'), 'utf8')
  .indexOf('invoice_uid: EDIT_UID') !== -1,
  'the sales page sends invoice_uid');


/* ── 4. lock and flush ordering ──────────────────────────────────────────── */
console.log('\nS25 — the balance is read at the right moment\n');

const MO_SAVE = fnText('saveValleyMfgOrder_');
const lockAt = MO_SAVE.indexOf('executeWithLock_(function () {');
const guardAt = MO_SAVE.indexOf('(function assertFooterBalances_() {');
check(lockAt !== -1 && guardAt > lockAt,
  'the MO balance guard runs INSIDE executeWithLock_, not before it');
const firstWrite = MO_SAVE.search(/setValues\(|appendRow\(|\.setValue\(/);
const guardEnd = MO_SAVE.indexOf('})();', guardAt);
check(guardEnd !== -1 && firstWrite !== -1 && guardEnd < firstWrite,
  'and it still finishes before the first row is written — a violation aborts clean');

check(/function vfFlush_\(\)/.test(SRC) && /SpreadsheetApp\.flush\(\)/.test(SRC),
  'vfFlush_ exists and calls SpreadsheetApp.flush()');
['saveValleyMfgOrder_', 'saveValleyInvoice_', 'saveValleyWarehouseMovement_',
  'saveValleyPurchasingCosting_', 'deleteValleyMfgOrder_', 'saveValleyReturn_'
].forEach(function (name) {
  check(fnText(name).indexOf('vfFlush_()') !== -1,
    name + ' flushes before it returns');
});


/* ── 5. dry run, against the REAL functions lifted out of the real source ── */
console.log('\nS25 — dry run of the real readers, against stubbed sheet access\n');

const CP_HEADERS = ['unique_id', 'transaction_code', 'transaction_date', 'product_id',
  'product', 'unit', 'current_qty', 'unit_cost'];

/* One batch with 100 on the sheet, and — deliberately — a sale of 10, a
   consumption footer of 5 and a warehouse issue of 7 all sitting against it.
   Every one of those is ALREADY inside current_qty. A reader that answers 78,
   80, 85, 90 or 93 is subtracting one of them a second time. */
const CURRENT_PRODUCTS = [
  { unique_id: 'BATCH-A', transaction_code: 'PO-1001', transaction_date: '2026-01-10',
    product_id: '7', product: 'بطاطس خام', unit: 'كجم', current_qty: 100, unit_cost: 12.5 },
  /* fully consumed by MO-1 — current_qty is 0 and it must STILL be offered on
     MO-1's own form, or that order can never be edited again */
  { unique_id: 'BATCH-Z', transaction_code: 'PO-1002', transaction_date: '2026-02-01',
    product_id: '7', product: 'بطاطس خام', unit: 'كجم', current_qty: 0, unit_cost: 9 },
  /* the reported bug, to the uid: MO 4c2aa604a79df81f holds 500 of a batch
     whose current_qty is 0, and re-saving that same 500 must pass */
  { unique_id: 'BATCH-B', transaction_code: 'PO-1003', transaction_date: '2026-03-01',
    product_id: '9', product: 'زيت', unit: 'كجم', current_qty: 0, unit_cost: 4 }
];

const REPORTED_MO = '4c2aa604a79df81f';

const MFG_OUTPUTS = [
  { unique_id: 'OUT-1', valley_manufacture_header_id: 'MO-1' },
  { unique_id: 'OUT-2', valley_manufacture_header_id: 'MO-2' },
  { unique_id: 'OUT-3', valley_manufacture_header_id: 'MO-3' },
  { unique_id: 'OUT-9', valley_manufacture_header_id: REPORTED_MO }
];
const MFG_FOOTER = [
  { valley_manufacture_header_product_id: 'OUT-1', item: 'BATCH-A', qty: 30 },
  { valley_manufacture_header_product_id: 'OUT-1', item: 'BATCH-Z', qty: 40 },
  /* the `outUid || moUid` fallback: a footer parented directly on the MO uid */
  { valley_manufacture_header_product_id: REPORTED_MO, item: 'BATCH-B', qty: 500 },
  /* ANOTHER order's consumption of the same batch. It is already inside
     current_qty, so it must not move MO-2's figure by one gram. */
  { valley_manufacture_header_product_id: 'OUT-3', item: 'BATCH-A', qty: 5 }
];
const SALES_LINES = [{ unique_id: 'LINE-1', valley_sales_header_id: 'INV-1' }];
const SALES_STOCK = [
  { unique_id: 'ALLOC-1', valley_sales_products_id: 'LINE-1', product_unique_id: 'BATCH-A', product_qty: 10 }
];
const PRODUCTS = [{ id: '7', name_ar: 'بطاطس خام' }, { id: '9', name_ar: 'زيت' }];

const TABLES = {
  'valley_manufacture_header_products': MFG_OUTPUTS,
  'valley_manufacture_footer': MFG_FOOTER,
  'valley_sales_products': SALES_LINES,
  'valley_sales_product_stock': SALES_STOCK,
  'valley_warehouse_movement': [{ item: 'BATCH-A', qty: 7, movement_type: 'منصرف', movmenent_sign: -7 }],
  'valley_sales_returns_stock': [],
  'valley_products': PRODUCTS
};

const seen = { live: 0, memo: [] };

function rawOf(rows) {
  return [CP_HEADERS.slice()].concat(rows.map(r => CP_HEADERS.map(h => (r[h] === undefined ? '' : r[h]))));
}

const env = {
  /* vfCurrentProducts_ reads the range itself, so it gets the raw plumbing */
  getSheet_: (name) => {
    if (name !== 'valley_current_products') throw new Error('DRY RUN: unexpected getSheet_ ' + name);
    return { getDataRange: () => ({ getValues: () => rawOf(CURRENT_PRODUCTS) }) };
  },
  getHeaders_: () => CP_HEADERS.slice(),
  countSheetRead_: () => { seen.live++; },
  buildRecordsFromRaw_: (data, headers) => data.slice(1).map(row => {
    const o = {}; headers.forEach((h, c) => { o[h] = row[c]; }); return o;
  }),
  /* everything else goes through the memoising reader, and the balance table
     must NEVER appear here */
  getAllRecords_: (dbId, name) => {
    seen.memo.push(name);
    if (!TABLES[name]) throw new Error('no fixture for ' + name);
    return TABLES[name].map(r => Object.assign({}, r));
  },
  MFG_ORDER_PRODUCTS_SHEET: 'valley_manufacture_header_products',
  MFG_CONSUMPTION_SHEET: 'valley_manufacture_footer',
  FIN_SALES_LINES_SHEET: 'valley_sales_products',
  FIN_PRODUCTS_SHEET: 'valley_products',
  WH_MOVE_SHEET: 'valley_warehouse_movement',
  WH_IN_TYPE: 'وارد داخلي / مرتجع للمخزن',
  vfCanSeeCost_: (user) => !!(user && user.canCost),
  /* The balance guard raises proven pre-mutation refusals through
     vfNotApplied_ (failed receipt, safe to correct and retry) instead of a
     bare throw (which the request guard would file as uncertain). Same Arabic
     message, plus the notApplied marker. */
  vfNotApplied_: (message) => { const e = new Error(message); e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED'; throw e; },
  vfStripCostAll_: (list, keys) => { (list || []).forEach(o => keys.forEach(k => { delete o[k]; })); return list; },
  VF_COST_KEYS: { batch: ['unit_cost'] },
  dbId: 'db'
};

const READERS = fnText('vfCurrentProducts_') + '\n' + fnText('vfBatchBalance_') + '\n' +
  fnText('vfMfgHeldByBatch_') + '\n' + fnText('vfSalesHeldByBatch_') + '\n' +
  fnText('whBatchAvailability_') + '\n' + fnText('getValleyProductBatches_');

const H = new Function('env', 'with (env) {\n' + READERS + '\n' +
  'return { balance: vfBatchBalance_, mfgHeld: vfMfgHeldByBatch_,' +
  ' salesHeld: vfSalesHeldByBatch_, wh: whBatchAvailability_,' +
  ' batches: getValleyProductBatches_, live: vfCurrentProducts_ };\n}')(env);

/* the guard as it actually sits in the save, lifted verbatim */
const GUARD_FROM = SRC.indexOf('      (function assertFooterBalances_() {');
const GUARD_TO = SRC.indexOf('      })();', GUARD_FROM);
check(GUARD_FROM !== -1 && GUARD_TO > GUARD_FROM,
  'the MO balance guard can be located in the real source');
const GUARD_SRC = SRC.slice(GUARD_FROM, GUARD_TO + '      })();'.length);

const runGuard = new Function('env', 'with (env) {\n' +
  fnText('vfCurrentProducts_') + '\n' + fnText('vfBatchBalance_') + '\n' +
  fnText('vfMfgHeldByBatch_') + '\n' + fnText('vfSalesHeldByBatch_') + '\n' +
  'return function (ctx) { with (ctx) {\n' + GUARD_SRC + '\n} };\n}')(env);

/** Run the real guard for one MO asking for `qty` of `batch`. */
function guard(moUid, batch, qty) {
  const ctx = {
    dbId: 'db',
    editing: !!moUid,
    d: { mo_uid: moUid || '' },
    outputs: [{ product_id: '7', qty: 0, footers: [] }],
    consumption: [{ batch_uid: batch, qty: qty }]
  };
  try { runGuard(ctx); return null; } catch (e) { return e.message; }
}

/* -- 5a. the add-back -- */
const b1 = H.balance('db', { product_id: '7', mo_uid: 'MO-1' });
const a1 = b1.filter(b => b.batch_uid === 'BATCH-A')[0];
check(!!a1 && a1.available === 130,
  'current_qty 100, this MO already holds 30 → available 130',
  a1 ? 'got ' + a1.available : 'BATCH-A was not offered at all');
check(!!a1 && a1.current_qty === 100 && a1.held === 30,
  '  and the two terms are reported separately, so the arithmetic is visible',
  a1 ? 'current_qty ' + a1.current_qty + ', held ' + a1.held : '—');

/* -- 5b. the same batch, a DIFFERENT document -- */
const other = H.balance('db', { product_id: '7', mo_uid: 'MO-2' })
  .filter(b => b.batch_uid === 'BATCH-A')[0];
check(!!other && other.available === 100,
  'the same batch seen from a DIFFERENT MO → available 100, not 130',
  other ? 'got ' + other.available : '—');

/* -- 5c. a new document adds back nothing, and subtracts nothing -- */
const fresh = H.balance('db', { product_id: '7' }).filter(b => b.batch_uid === 'BATCH-A')[0];
check(!!fresh && fresh.available === 100 && fresh.held === 0,
  'a NEW document: held is 0 and available is 100, with a sale of 10, a footer of 5\n' +
  '        and a warehouse issue of 7 all present in the fixture',
  fresh ? 'got ' + fresh.available : '—');
const endpoint = H.batches({ product_id: '7' }, { canCost: true }, 'db').batches
  .filter(b => b.batch_uid === 'BATCH-A')[0];
check(!!endpoint && endpoint.available === 100,
  '  the get_valley_product_batches endpoint answers 100 too', endpoint ? 'got ' + endpoint.available : '—');
check(H.wh('db')['BATCH-A'].available === 100,
  '  and so does حركة المخزن', 'got ' + H.wh('db')['BATCH-A'].available);

/* -- 5d. a batch this order consumed entirely is still on its own form -- */
const zeroOnOwn = H.balance('db', { product_id: '7', mo_uid: 'MO-1' })
  .filter(b => b.batch_uid === 'BATCH-Z')[0];
check(!!zeroOnOwn && zeroOnOwn.available === 40,
  'a batch with current_qty 0 that this MO holds 40 of is still OFFERED, at 40',
  zeroOnOwn ? 'got ' + zeroOnOwn.available : 'it was filtered out — the order cannot be edited');
const zeroElsewhere = H.balance('db', { product_id: '7', mo_uid: 'MO-2' })
  .filter(b => b.batch_uid === 'BATCH-Z')[0];
check(!zeroElsewhere,
  '  and it is NOT offered to any other document');

/* -- 5e. ordering, because the FIFO allocator depends on it -- */
const ordered = H.balance('db', { product_id: '7', mo_uid: 'MO-1' }).map(b => b.batch_uid);
check(JSON.stringify(ordered) === JSON.stringify(['BATCH-A', 'BATCH-Z']),
  'the offered list stays oldest-first by transaction_date', ordered.join(', '));

/* -- 5f. the cost gate is unchanged -- */
const noCost = H.batches({ product_id: '7' }, { canCost: false }, 'db').batches;
const yesCost = H.batches({ product_id: '7' }, { canCost: true }, 'db').batches;
check(noCost.every(b => !('unit_cost' in b)) && yesCost.every(b => 'unit_cost' in b),
  'unit_cost is stripped without the grant and present with it');
check(noCost[0].available === yesCost[0].available && noCost[0].held === yesCost[0].held,
  'available and held survive the strip — the picker still works without cost');
check(JSON.stringify(noCost).indexOf('12.5') === -1,
  'the ungranted payload contains no cost value anywhere, at any depth');

/* -- 5g. the memo is bypassed for this ONE table -- */
check(seen.memo.indexOf('valley_current_products') === -1,
  'valley_current_products never went through the memoising reader');
check(seen.live > 0, 'and it was read live, every time (' + seen.live + ' reads)');

/* -- 5h. the MO save guard: the reported bug, to the uid -- */
console.log('');
check(guard('MO-1', 'BATCH-A', 30) === null,
  're-saving the 30 this MO already holds passes (30 <= 100 + 30)');
check(guard('MO-1', 'BATCH-A', 130) === null,
  'and so does exactly 130');
const over = guard('MO-1', 'BATCH-A', 131);
check(!!over && over.indexOf('تتجاوز المتاح') !== -1,
  '131 is refused with the Arabic over-allocation message', 'got: ' + over);
check(!!over && over.indexOf('المتاح: 130') !== -1,
  '  and the message names 130 — the same figure the form showed the user',
  'got: ' + over);
check(guard('MO-2', 'BATCH-A', 101) !== null && guard('MO-2', 'BATCH-A', 100) === null,
  'a DIFFERENT MO is held to 100');

check(guard(REPORTED_MO, 'BATCH-B', 500) === null,
  'MO 4c2aa604a79df81f re-saves its own 500 of a 0-qty batch — the reported bug');
check(guard(REPORTED_MO, 'BATCH-B', 501) !== null,
  '  501 is still refused');
check(guard('MO-1', 'BATCH-B', 1) !== null,
  '  and another MO gets nothing of it (0 + 0)');
check(guard('', 'BATCH-A', 100) === null && guard('', 'BATCH-A', 101) !== null,
  'a NEW order adds back nothing: it gets 100 and no more');

/* -- 5i. held is resolved through the line / the output row -- */
console.log('');
const mfgHeld = H.mfgHeld('db', 'MO-1');
check(mfgHeld['BATCH-A'] === 30 && mfgHeld['BATCH-Z'] === 40,
  'vfMfgHeldByBatch_ resolves a footer through its output row',
  JSON.stringify(mfgHeld));
check(H.mfgHeld('db', REPORTED_MO)['BATCH-B'] === 500,
  '  and a footer parented directly on the MO uid (the outUid || moUid fallback)');
check(Object.keys(H.mfgHeld('db', '')).length === 0,
  '  a new order holds nothing');
const salesHeld = H.salesHeld('db', 'INV-1');
check(salesHeld['BATCH-A'] === 10,
  'vfSalesHeldByBatch_ resolves an allocation through its line\'s invoice',
  JSON.stringify(salesHeld));
check(Object.keys(H.salesHeld('db', 'INV-9')).length === 0,
  '  and an invoice with no lines holds nothing');
const invBal = H.balance('db', { product_id: '7', invoice_uid: 'INV-1' })
  .filter(b => b.batch_uid === 'BATCH-A')[0];
check(!!invBal && invBal.available === 110,
  'an invoice being edited is offered the 10 it already holds back (100 + 10)',
  invBal ? 'got ' + invBal.available : '—');


console.log('\n' + (failed === 0
  ? 'S25 OK — one authority: available = current_qty + held(this document). Nothing subtracts.'
  : 'S25 — ' + failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);

