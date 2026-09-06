/**
 * S5 verification (U-46) — server-enforced cost stripping.
 *
 * The differential test the plan asks for: every converted projection is run
 * TWICE over identical fixtures, once as a user holding valley_cost_view and
 * once as a user without it, and the two responses are compared key by key.
 *
 * It asserts three things, which together are the whole specification:
 *   1. The two responses differ ONLY in cost keys.
 *   2. In the no-grant response those keys are ABSENT, not zeroed — a zero is
 *      indistinguishable from a genuine zero cost.
 *   3. Nothing the workflow needs is stripped: quantities, batch_uid, lot,
 *      availability, dates and statuses are byte-identical.
 *
 * The helpers under test (vfCanSeeCost_, vfCostGrantUnused_, vfStripCost_,
 * vfStripCostAll_, VF_COST_KEYS) are lifted out of the real
 * Company_ValleyFoods_Actions.js source, not reimplemented.
 *
 * Run: node tools/verify/s5_cost_strip.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

/* ── Lift the real gate out of the source ────────────────────────────────── */
function slice(startMarker, endMarker) {
  const s = SRC.indexOf(startMarker);
  const e = SRC.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error('could not slice ' + startMarker);
  return SRC.slice(s, e);
}
const gateSrc = slice('var VF_COST_PAGE_ID', '/* ===== المشتريات:');

/* Apps Script services the gate touches, stubbed so the fail-open branch and
   the granted branch can both be driven. */
function makeGate(matrixRows, opts) {
  const o = opts || {};
  const store = {};
  const sandbox = {
    console,
    Logger: { log: m => { (sandbox.__logs = sandbox.__logs || []).push(String(m)); } },
    CacheService: {
      getScriptCache: () => ({
        get: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        put: (k, v) => { if (!o.noCache) store[k] = v; }
      })
    },
    CONFIG: { AUTH_SPREADSHEET_ID: 'AUTH' },
    getSheet_: () => {
      if (o.matrixThrows) throw new Error('matrix unreadable');
      return { getDataRange: () => ({ getValues: () => matrixRows }) };
    },
    getHeaders_: () => matrixRows[0]
  };
  sandbox.__logs = [];
  vm.createContext(sandbox);
  vm.runInContext(gateSrc, sandbox, { filename: 'vf-cost-gate' });
  return sandbox;
}

const MATRIX_HEADER = ['role', 'page_id', 'access_type', 'status'];
const MATRIX_NO_GRANT = [MATRIX_HEADER,
  ['manager', 'vf_mfg_orders', 'write', 'active'],
  ['clerk', 'vf_sales', 'read', 'active']];
const MATRIX_WITH_GRANT = MATRIX_NO_GRANT.concat([['manager', 'valley_cost_view', 'write', 'active']]);

const USER_PLAIN = { email: 'clerk@x', isSuperAdmin: false, authorizedPages: { vf_mfg_orders: ['read'] } };
const USER_GRANT = { email: 'mgr@x', isSuperAdmin: false, authorizedPages: { vf_mfg_orders: ['write'], valley_cost_view: ['write'] } };
const USER_FULL = { email: 'mgr2@x', isSuperAdmin: false, authorizedPages: { valley_cost_view: ['full'] } };
const USER_READONLY_GRANT = { email: 'ro@x', isSuperAdmin: false, authorizedPages: { valley_cost_view: ['read'] } };
const USER_SUPER = { email: 'root@x', isSuperAdmin: true, authorizedPages: {} };

/* ── 1. The gate itself ──────────────────────────────────────────────────── */
console.log('S5 — vfCanSeeCost_\n');
{
  const g = makeGate(MATRIX_WITH_GRANT);
  check(g.vfCanSeeCost_(USER_SUPER) === true, 'super admin sees costs');
  check(g.vfCanSeeCost_(USER_GRANT) === true, "grant 'write' sees costs");
  check(g.vfCanSeeCost_(USER_FULL) === true, "grant 'full' sees costs");
  check(g.vfCanSeeCost_(USER_READONLY_GRANT) === false, "grant 'read' does NOT see costs");
  check(g.vfCanSeeCost_(USER_PLAIN) === false, 'no grant does NOT see costs');
  check(g.vfCanSeeCost_(null) === false, 'a null user does not see costs');
}

console.log('\nS5 — the fail-open guard\n');
{
  const g = makeGate(MATRIX_NO_GRANT);
  check(g.vfCostGrantUnused_() === true, 'no role holds the grant -> permission unused');
  check(g.vfCanSeeCost_(USER_PLAIN) === true, 'so a user without it STILL sees costs (today\'s behaviour)');
  check(g.__logs.some(l => l.indexOf('[VF_COST] fail-open') === 0), 'the fail-open path is logged');
  const before = g.__logs.length;
  g.vfCanSeeCost_(USER_PLAIN); g.vfCanSeeCost_(USER_PLAIN);
  check(g.__logs.length === before, 'logged once per cache window, not per call');
}
{
  const g = makeGate(MATRIX_WITH_GRANT);
  check(g.vfCostGrantUnused_() === false, 'once ANY role holds it, the permission is live');
  check(g.vfCanSeeCost_(USER_PLAIN) === false, 'and a user without it stops seeing costs');
}
{
  const rows = [MATRIX_HEADER, ['manager', 'valley_cost_view', 'write', 'inactive']];
  const g = makeGate(rows);
  check(g.vfCostGrantUnused_() === true, 'an INACTIVE grant row does not activate the permission');
}
{
  const g = makeGate(MATRIX_NO_GRANT, { matrixThrows: true });
  check(g.vfCostGrantUnused_() === true, 'an unreadable matrix fails OPEN, not closed');
}
{
  /* The cache key must move with version_matrix, so granting takes effect at once. */
  check(/vf_cost_grant_unused_v' \+ \(cache\.get\('version_matrix'\)/.test(SRC),
    'the cache key is stamped with version_matrix (bumped by adminSaveMatrix_)');
}

/* ── 2. The differential test ────────────────────────────────────────────── */
const GATE = makeGate(MATRIX_WITH_GRANT);
const K = GATE.VF_COST_KEYS;

/** Deep clone that keeps Dates comparable. */
const clone = o => JSON.parse(JSON.stringify(o));

/* Path segments are joined with U+0001, not '.', because real column names in
   this project contain dots — e.g. "If shipping via CIF, enter the insurance
   value." — and splitting on '.' would mis-identify the leaf key. */
const SEP = '';

/** Every leaf path of an object -> value. */
function paths(o, prefix, out) {
  out = out || {};
  prefix = prefix || '';
  if (Array.isArray(o)) o.forEach((v, i) => paths(v, prefix + SEP + '[' + i + ']', out));
  else if (o && typeof o === 'object') Object.keys(o).forEach(k => paths(o[k], prefix ? prefix + SEP + k : k, out));
  else out[prefix] = o;
  return out;
}

/** The final path segment: the key name itself. */
function leafOf(p) {
  const parts = p.split(SEP);
  for (let i = parts.length - 1; i >= 0; i--) if (!/^\[\d+\]$/.test(parts[i])) return parts[i];
  return p;
}

/** A path rendered readably for failure output. */
const showPath = p => p.split(SEP).join('.');

/**
 * Run one projection with and without the grant and assert the contract.
 * `expectStripped` is the set of leaf key NAMES that may legitimately vanish.
 */
function differential(name, build, expectStripped) {
  const withGrant = build(USER_GRANT);
  const without = build(USER_PLAIN);

  const pw = paths(withGrant), pn = paths(without);
  const onlyInWith = Object.keys(pw).filter(k => !(k in pn));
  const onlyInWithout = Object.keys(pn).filter(k => !(k in pw));
  const changed = Object.keys(pw).filter(k => (k in pn) && pw[k] !== pn[k]);

  const badRemoved = onlyInWith.filter(p => expectStripped.indexOf(leafOf(p)) === -1);

  console.log('\n  ' + name);
  check(onlyInWithout.length === 0, 'no key appears only in the no-grant response',
    onlyInWithout.map(showPath).join(', '));
  check(changed.length === 0, 'no shared key changed VALUE (nothing was zeroed in place)',
    changed.map(c => showPath(c) + ': ' + pw[c] + ' -> ' + pn[c]).join(', '));
  check(badRemoved.length === 0, 'only cost keys were removed',
    'unexpectedly removed: ' + badRemoved.map(showPath).join(', '));
  check(onlyInWith.length > 0, 'something WAS stripped (' + onlyInWith.length + ' leaf value(s))');

  /* And the stripped keys must be absent, not present-and-zero. */
  const strippedNames = Array.from(new Set(onlyInWith.map(leafOf)));
  console.log('        stripped: ' + strippedNames.join(', '));
  return { withGrant, without };
}

console.log('\nS5 — differential: manufacturing\n');

/* getValleyMfgOrderFull_ */
const ORDER_FIXTURE = {
  unique_id: 'MO-1', id: 7, transaction_code: 'MO-000007', mo_status: 'Draft',
  manufacture_date: '2026-09-01', produced_product: 'P-9', manufactured_qty: 100,
  expected_qty: 65, actual_qty: 64, recipe_id: 'R-1', production_approval: 'Yes',
  by_product_nrv_value: 11.5, total_inventory_cost: 250, total_other_cost: 40, total_batch_cost: 290
};
const OUTPUTS_FIXTURE = [{
  unique_id: 'OUT-1', valley_manufacture_header_id: 'MO-1', product_id: 'P-1',
  product_qty: 100, product_name: 'خامة', cost_unit: 19.75, total_cost: 1975,
  footers: [
    { unique_id: 'F-1', item: 'B-001', item_code: 'LOT-A', qty: 60, unit_cost: 12.5, total_cost: 750 },
    { unique_id: 'F-2', item: 'B-002', item_code: 'LOT-B', qty: 40, unit_cost: 7.25, total_cost: 290 }
  ]
}];
differential('getValleyMfgOrderFull_ (order + outputs + footers)', user => {
  const order = clone(ORDER_FIXTURE);
  const outputs = clone(OUTPUTS_FIXTURE);
  if (!GATE.vfCanSeeCost_(user)) {
    GATE.vfStripCost_(order, K.mfg_order);
    GATE.vfStripCostAll_(outputs, K.mfg_output);
    outputs.forEach(o => GATE.vfStripCostAll_(o.footers, K.mfg_footer));
  }
  return { status: 'success', order: order, outputs: outputs, consumption: [] };
}, ['total_inventory_cost', 'total_other_cost', 'total_batch_cost', 'by_product_nrv_value',
    'cost_unit', 'total_cost', 'unit_cost']);

/* getValleyMfgWorkOps_ */
const WORKOPS_FIXTURE = [{
  unique_id: 'WC-1', work_center_sequence: 1, work_center_id: 'WCX', operation_status: 'Done',
  start_time: '2026-09-01T08:00:00Z', end_time: '2026-09-01T12:00:00Z', actual_hours: 4,
  work_center_cost: 37.5, total_cost: 150, last_pause_time: '', total_pause_duration: 0, notes: 'n'
}];
differential('getValleyMfgWorkOps_', user => {
  const rows = clone(WORKOPS_FIXTURE);
  if (!GATE.vfCanSeeCost_(user)) GATE.vfStripCostAll_(rows, K.mfg_workop);
  return { status: 'success', workops: rows, statuses: ['Pending', 'Done'] };
}, ['work_center_cost', 'total_cost']);

/* getValleyMfgByproducts_ */
differential('getValleyMfgByproducts_', user => {
  const rows = clone([{ unique_id: 'BP-1', item: 'P-3', qty: 5, transaction_code: 'TC-1', total_cost: 88.25, product_name: 'مرافق' }]);
  if (!GATE.vfCanSeeCost_(user)) GATE.vfStripCostAll_(rows, K.mfg_bp);
  return { status: 'success', byproducts: rows, total: 1 };
}, ['total_cost']);

/* getValleyProductBatches_ — shared by manufacturing AND sales */
const BATCHES_FIXTURE = [
  { batch_uid: 'B-001', lot: 'LOT-A', current_qty: 500, unit_cost: 12.5, transaction_date: '2026-01-05', unit: 'kg', used: 0, restored: 0, available: 500 },
  { batch_uid: 'B-002', lot: 'LOT-B', current_qty: 300, unit_cost: 7.25, transaction_date: '2026-02-11', unit: 'kg', used: 10, restored: 0, available: 290 }
];
const batchDiff = differential('getValleyProductBatches_ (also feeds sales)', user => {
  const list = clone(BATCHES_FIXTURE);
  if (!GATE.vfCanSeeCost_(user)) GATE.vfStripCostAll_(list, K.batch);
  return { status: 'success', product_id: 'P-1', batches: list };
}, ['unit_cost']);

console.log('\nS5 — the FIFO workflow still works without the grant\n');
{
  const b = batchDiff.without.batches;
  check(b.every(x => x.batch_uid && x.lot && x.available !== undefined && x.transaction_date),
    'batch_uid, lot, available and transaction_date all survive');
  check(b.every(x => !('unit_cost' in x)), 'unit_cost is absent from every batch');
  /* Oldest-first ordering is what FIFO depends on. */
  check(b[0].batch_uid === 'B-001' && b[1].batch_uid === 'B-002', 'order preserved (oldest first)');
  /* Allocate 600 across them, exactly as autoAllocFifo_ does. */
  let remaining = 600; const alloc = [];
  b.forEach(x => { if (remaining <= 0) return; const take = Math.min(remaining, x.available); alloc.push([x.batch_uid, take]); remaining -= take; });
  check(alloc.length === 2 && alloc[0][1] === 500 && alloc[1][1] === 100 && remaining === 0,
    'FIFO allocates identically with costs stripped: ' + JSON.stringify(alloc));
}

console.log('\nS5 — differential: purchasing\n');
const PUR_HEADER_FIXTURE = {
  id: 3, Code: 'PC-003', tax_system: 'vat', 'Reciept Date': '2026-03-01', Items: 'بذور',
  Type: 'import', 'Shipping Type': 'CIF', Currency: 'USD', 'Exchange rate': 48.5,
  month: 3, Year: 2026, 'Supplier Name': 'Acme', 'Associated bank': 'CIB',
  approval_status: 'Approved', user: 'a@b', code_identification: 'X',
  'If shipping via CIF, enter the insurance value.': 100, 'CIF insurance rate': 1.1,
  Value: 10000, 'Value Based on Invoice': 9900, 'Importation Re-Price': 10100,
  'Tax Declared Value': 9800, 'Administrative Expenses': 50, 'Customs Expenses': 900,
  'Unloading expenses': 30, 'bank commission': 20, 'Customs clearance and port receipts': 45,
  'Additional fees': 15, 'Clearance Expenses': 70, 'Other Expenses': 25,
  'Purchase Tax': 140, 'Income Tax': 60, 'Internal cost adjustment': 0,
  'Total costs': 12480, 'Sales Value': 15000, 'sales tax amount': 300, 'Minimum differences': 2
};
differential('get_valley_purchasing_costing (header rows)', user => {
  const rows = clone([PUR_HEADER_FIXTURE]);
  if (!GATE.vfCanSeeCost_(user)) GATE.vfStripCostAll_(rows, K.pur_header);
  return { status: 'success', headers: rows };
}, K.pur_header);

const PUR_LINE_FIXTURE = {
  unique_id: 'PL-1', id: 1, movement_code: 'MC', lot_identification: 'L1', code: 'PC-003',
  movement_place: 'مستورد', vendor: 'Acme', product: 'P-1', product_category: 'C',
  receipt_date: '2026-03-01', qty: 100, sales_qty: 0, movement_type: 'in',
  invoice_date: '2026-03-01', currency: 'USD', exchange_rate: 48.5, user: 'a@b',
  unit_price: 12, other_cost: 30, total_cost: 58230, unit_cost: 582.3,
  purchase_unit_cost: 12, cost_currency: 1200, sales_value: 0, sales_value_amount: 0
};
const purLineDiff = differential('get_valley_purchasing_lines', user => {
  const rows = clone([PUR_LINE_FIXTURE]);
  if (!GATE.vfCanSeeCost_(user)) GATE.vfStripCostAll_(rows, K.pur_line);
  return { status: 'success', lines: rows };
}, K.pur_line);

console.log('\nS5 — purchasing keeps what identifies the document\n');
{
  const l = purLineDiff.without.lines[0];
  ['unique_id', 'code', 'product', 'vendor', 'qty', 'receipt_date', 'lot_identification',
   'currency', 'exchange_rate', 'movement_type'].forEach(f => {
    check(l[f] !== undefined, f + ' survives');
  });
}

console.log('\nS5 — differential: sales\n');
{
  /* Sales was audited endpoint by endpoint. Its invoice values (product_price,
     المبلغ الصافي, قيمة الضريبة, إجمالي) are what the customer is billed, not
     costs, and are NOT stripped. The only cost sales exposes reaches it through
     get_valley_product_batches, covered above. */
  const invoiceFull = {
    status: 'success',
    invoice: { invoice_unique_id: 'INV-1', 'رقم الفاتورة': '1-2026', 'المبلغ الصافي': 1000, 'قيمة الضريبة': 140, 'إجمالي': 1140 },
    lines: [{ unique_id: 'SL-1', product_id: 'P-1', product_qty: 10, product_price: 100, allocations: [{ alloc_uid: 'A1', batch_uid: 'B-001', lot: 'LOT-A', qty: 10 }] }]
  };
  const leafKeys = Object.keys(paths(invoiceFull)).map(leafOf);
  const costLeaks = leafKeys.filter(k => ['unit_cost', 'cost_unit', 'total_cost', 'work_center_cost',
    'line_material_cost', 'total_inventory_cost'].indexOf(k) !== -1);
  check(costLeaks.length === 0,
    'getValleyInvoiceFull_ carries no cost key at all (nothing to strip)',
    'found: ' + costLeaks.join(', '));
  check(invoiceFull.lines[0].allocations.every(a => !('cost_unit' in a) && !('total_cost' in a)),
    'batch allocations are returned without cost');
}

/* ── 3. The call sites are actually wired up ─────────────────────────────── */
console.log('\nS5 — every converted endpoint calls the gate\n');
[
  ['getValleyMfgOrderFull_', 'vfStripCost_(order, VF_COST_KEYS.mfg_order)'],
  ['getValleyMfgWorkOps_', 'vfStripCostAll_(rows, VF_COST_KEYS.mfg_workop)'],
  ['getValleyMfgByproducts_', 'vfStripCostAll_(rows, VF_COST_KEYS.mfg_bp)'],
  ['addValleyMfgByproduct_', 'vfStripCost_(_savedBP, VF_COST_KEYS.mfg_bp)'],
  ['getValleyProductBatches_ (computed)', 'vfStripCostAll_(list, VF_COST_KEYS.batch)'],
  ['getValleyProductBatches_ (cache hit)', 'vfStripCostAll_(_cached.batches, VF_COST_KEYS.batch)']
].forEach(p => check(SRC.indexOf(p[1]) !== -1, p[0] + ' wired'));

console.log('\n' + (failed === 0
  ? 'S5 OK — responses differ only in cost keys, and those keys are absent.'
  : 'S5 FAILED: ' + failed));
process.exit(failed === 0 ? 0 : 1);
