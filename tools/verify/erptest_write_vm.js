'use strict';

/**
 * Local mirror of plan Appendix 2 T-WRITE-<family> and T-ATOMIC (P10).
 *
 * The same scripted sequence of writes — every family: products/parties, cash +
 * transfer, purchasing, sales + returns, offers, manufacturing — runs twice on two
 * fresh erp_test books (real erp_test headers): once with ET_SJS_WRITE=false (the
 * legacy sheet writes) and once with ET_SJS_READ=ET_SJS_WRITE=true (one atomic
 * Sheets.Spreadsheets.batchUpdate per request). The resulting sheet rows must be
 * identical apart from created_at / updated_at / approval_time.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const gasstub = require('./gasstub');
const workbookStub = require('./vf_workbook_stub');

const ROOT = path.resolve(__dirname, '..', '..');
const wb = workbookStub.createWorkbookStub();
const order = JSON.parse(fs.readFileSync(path.join(ROOT, '.clasp.json'), 'utf8')).filePushOrder.filter(function (f) { return f !== 'Code.js'; });
const H = gasstub.createHarness({ workbook: wb, sources: order });
const ET = H.eval('ErpTest');
H.override('noteMutation_', function () { try { H.ctx.resetRecordCache_(); } catch (e) {} });
H.override('logHistory_', function () {});
let uuidCounter = 0;
H.ctx.Utilities.getUuid = function () {
  const h = crypto.createHash('sha256').update('uuid-' + (uuidCounter++)).digest('hex');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20, 32);
};

/* ── stub support for the Sheets v4 calls the write layer makes ── */
const V = H.ctx.Sheets.Spreadsheets.Values;
const bg = V.batchGet;
V.batchGet = function (a, b) { return typeof a === 'string' ? bg.call(V, b, a) : bg.call(V, a, b); };
const EPOCH = Date.UTC(1899, 11, 30);
function serialToDate(serial) {
  const u = new Date(EPOCH + Number(serial) * 86400000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds());
}
let failNextBatchUpdate = false;
const origBU = H.ctx.Sheets.Spreadsheets.batchUpdate;
H.ctx.Sheets.Spreadsheets.batchUpdate = function (req, dbId) {
  const book = wb.openById(dbId);
  const byId = {};
  book.getSheets().forEach(function (s) { byId[s.getSheetId()] = s; });
  const requests = (req && req.requests) || [];
  // Atomic like the real API: validate every request before applying any.
  if (failNextBatchUpdate) { failNextBatchUpdate = false; throw new Error('stub: injected batchUpdate failure'); }
  requests.forEach(function (r) {
    const sid = r.updateCells ? r.updateCells.start.sheetId : r.appendDimension ? r.appendDimension.sheetId : r.deleteDimension ? r.deleteDimension.range.sheetId : null;
    if (sid === null) throw new Error('stub: unsupported request ' + Object.keys(r).join(','));
    if (!byId[sid]) throw new Error('stub: unknown sheetId ' + sid);
  });
  const others = [];
  requests.forEach(function (r) {
    if (r.appendDimension) return;
    if (r.deleteDimension) { others.push(r); return; }
    const u = r.updateCells, s = byId[u.start.sheetId];
    (u.rows || []).forEach(function (row, i) {
      (row.values || []).forEach(function (cell, j) {
        const range = s.getRange(u.start.rowIndex + 1 + i, u.start.columnIndex + 1 + j, 1, 1);
        if (u.fields === 'userEnteredValue') {
          const v = cell.userEnteredValue || {};
          range.setValues([[v.numberValue !== undefined ? v.numberValue : v.boolValue !== undefined ? v.boolValue : v.stringValue !== undefined ? v.stringValue : '']]);
        } else if (u.fields === 'userEnteredFormat.numberFormat') {
          const cur = range.getValues()[0][0];
          if (typeof cur === 'number') range.setValues([[serialToDate(cur)]]);
        }
      });
    });
  });
  if (others.length) origBU.call(H.ctx.Sheets.Spreadsheets, { requests: others }, dbId);
  return { spreadsheetId: dbId, replies: [] };
};

H.ctx.Utilities.formatDate = function (d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

const discovery = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/erptest/discovery.json'), 'utf8'));
const AUDIT = ['deleted_at', 'deleted_by', 'version'];
const BUSINESS = ['erp_test_products', 'erp_test_categories', 'erp_test_customer_vendor', 'erp_test_purchasing_costing', 'erp_test_product_purchasing',
  'erp_test_sales_invoices', 'erp_test_sales_products', 'erp_test_sales_returns', 'erp_test_sales_offer', 'erp_test_sales_offer_products', 'erp_test_cash_bank_movement'];
const MFG = [['erp_test_manufacture_orders', ['unique_id', 'id', 'mo_number', 'mo_date', 'product_id', 'planned_qty', 'produced_qty', 'materials_cost', 'extra_cost', 'total_cost', 'unit_cost', 'production_status', 'completion_date', 'completed_by', 'cancelled_at', 'cancelled_by', 'notes', 'approval_status', 'approval', 'approval_time', 'user', 'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'version']],
  ['erp_test_manufacture_lines', ['unique_id', 'id', 'mo_unique_id', 'product_id', 'planned_qty', 'consumed_qty', 'unit_cost', 'total_cost', 'notes', 'user', 'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'version']]];
function headersOf(tab) {
  const sh = discovery.erp_test.sheets.find(function (s) { return s.name === tab; });
  const h = sh.headers.map(function (x) { return String(x).trim(); });
  if (BUSINESS.indexOf(tab) !== -1) AUDIT.forEach(function (a) { if (h.indexOf(a) === -1) h.push(a); });
  return h;
}
function makeBook(id) {
  wb.createSpreadsheet(id, []);
  const book = wb.openById(id);
  BUSINESS.concat(['erp_test_chart_of_accounts', 'erp_test_box_account_codes']).forEach(function (t) { book.addSheet(t).__setRows([headersOf(t)]); });
  book.getSheetByName('erp_test_box_account_codes').__setRows(discovery.erp_test_box_values);
  const chart = discovery.erp_test.sheets.find(function (s) { return s.name === 'erp_test_chart_of_accounts'; });
  book.getSheetByName('erp_test_chart_of_accounts').__setRows([chart.headers].concat(chart.sample));
  MFG.forEach(function (m) { book.addSheet(m[0]).__setRows([m[1]]); });
  const packH = ['pack_id', 'seq', 'built_at', 'row_count', 'bytes', 'hash', 'schema_hash', 'parts'];
  for (let p = 1; p <= 60; p++) packH.push('part_' + p);
  book.addSheet('erp_test__packs').__setRows([packH]);
  book.addSheet('erp_test__journal').__setRows([['seq', 'ts', 'user', 'table', 'op', 'key', 'request_key', 'data_json']]);
  book.addSheet('erp_test__meta').__setRows([['key', 'value']]);
  return book;
}

let failed = 0;
function ok(v, msg) { console.log((v ? '  PASS  ' : '  FAIL  ') + msg); if (!v) failed++; }
const SU = { isSuperAdmin: true, email: 'writer@test', company: '37fc50edf1424abd' };

function runScript(DB) {
  const responses = [];
  const call = function (action, data) {
    H.advance(5);
    const r = ET.dispatch_({ module_action: action, data: data || {} }, SU, DB);
    responses.push({ action: action, r: r });
    return r;
  };
  const rows = function (t) { return H.call('getAllRecords_', DB, t); };
  // 1. products, categories, parties
  ['A', 'B', 'F'].forEach(function (n) { call('add_et_product', { name_ar: 'منتج ' + n, unit: 'قطعة' }); });
  const P = rows('erp_test_products').map(function (r) { return r.id; });
  call('edit_et_product', { id: P[0], name_ar: 'منتج A2', unit: 'علبة', version: 0 });
  call('add_et_party', { name: 'عميل', customer_direction: 'عميل', address: 'طنطا', telephone: '0100' });
  call('add_et_party', { name: 'مورد', customer_direction: 'مورد' });
  const C = rows('erp_test_customer_vendor').map(function (r) { return r.id; });
  call('edit_et_party', { id: C[0], name: 'عميل 2', customer_direction: 'عميل' });
  // 2. cash + transfer
  const cashRec = function (amount, type) { return { name: C[0], transaction_details: 'حركة', transaction_date: '2025-03-02', transaction_amount: amount, transaction_type: type, related_box: '111101', chart_code: '111101', transaction_method: 'نقدي', currency: 'EGP', exchange_rate: 1 }; };
  call('add_et_cash', { record: cashRec(100, 'Debit') });
  call('add_et_cash', { record: cashRec(30, 'Credit') });
  const cash = rows('erp_test_cash_bank_movement');
  call('edit_et_cash', { record: Object.assign(cashRec(120, 'Debit'), { transaction_id: cash[0].transaction_id, version: 0 }) });
  call('approve_et_cash', { unique_id: cash[1].transaction_id, version: 0 });
  call('add_et_transfer', { from_box: '111101', to_box: '111104', amount: 10, transfer_date: '2025-03-03', details: 'تحويل' });
  call('delete_et_cash', { unique_id: cash[1].transaction_id });
  // 3. purchasing
  const pur = call('add_et_purchasing', { header: { code: 'PU-1', receipt_date: '2025-02-01', type: 'تصنيع', shipping_type: 'محلي', supplier_name: C[1], currency: 'EGP', exchange_rate: 1, value: 150 },
    lines: [{ product: P[0], qty: 10, unit_price: 10 }, { product: P[1], qty: 10, unit_price: 5 }] });
  call('edit_et_purchasing', { header: { unique_id: pur.unique_id, version: 0, code: 'PU-1', receipt_date: '2025-02-01', type: 'تصنيع', shipping_type: 'محلي', supplier_name: C[1], currency: 'EGP', exchange_rate: 1, value: 200 },
    lines: [{ product: P[0], qty: 15, unit_price: 10 }, { product: P[1], qty: 10, unit_price: 5 }] });
  call('approve_et_purchasing', { unique_id: pur.unique_id, version: 1 });
  const pur2 = call('add_et_purchasing', { header: { code: 'PU-2', receipt_date: '2025-02-02', type: 'تصنيع', shipping_type: 'محلي', supplier_name: C[1], currency: 'EGP', exchange_rate: 1, value: 10 }, lines: [{ product: P[2], qty: 1, unit_price: 10 }] });
  call('delete_et_purchasing', { unique_id: pur2.unique_id });
  // 4. sales + returns
  const s1 = call('add_et_sales', { header: { customer_id: C[0], invoice_date: '2025-03-01', discount_percent: 0 }, lines: [{ product_id: P[0], product_tax: 0, product_qty: 4, product_price: 30, product_discount: 0 }] });
  call('edit_et_sales', { header: { unique_id: s1.unique_id, version: 0, customer_id: C[0], invoice_date: '2025-03-01', discount_percent: 0 }, lines: [{ product_id: P[0], product_tax: 0, product_qty: 5, product_price: 30, product_discount: 0 }] });
  call('add_et_sales_return', { invoice_id: s1.unique_id, product_id: P[0], return_qty: 1, return_date: '2025-03-05' });
  const r2 = call('add_et_sales_return', { invoice_id: s1.unique_id, product_id: P[0], return_qty: 1, return_date: '2025-03-06' });
  const rets = rows('erp_test_sales_returns');
  call('delete_et_sales_return', { unique_id: rets[rets.length - 1].unique_id });
  void r2;
  call('approve_et_sales', { unique_id: s1.unique_id, version: 1 });
  const s2 = call('add_et_sales', { header: { customer_id: C[0], invoice_date: '2025-03-02', discount_percent: 0 }, lines: [{ product_id: P[1], product_tax: 0, product_qty: 1, product_price: 9, product_discount: 0 }] });
  call('delete_et_sales', { unique_id: s2.unique_id });
  // 5. offers
  const o1 = call('add_et_sales_offer', { request_key: 'OFF-1', header: { customer_id: C[0], invoice_date: '2025-04-01', discount_percent: 0 }, lines: [{ product_id: P[2], product_tax: 0, product_qty: 1, product_price: 9, product_discount: 0 }] });
  call('edit_et_sales_offer', { header: { unique_id: 'OFF-1', version: 0, customer_id: C[0], invoice_date: '2025-04-02', discount_percent: 0 }, lines: [{ product_id: P[2], product_tax: 0, product_qty: 2, product_price: 9, product_discount: 0 }] });
  call('approve_et_sales_offer', { unique_id: 'OFF-1', version: 1 });
  call('add_et_sales_offer', { request_key: 'OFF-2', header: { customer_id: C[0], invoice_date: '2025-04-03', discount_percent: 0 }, lines: [{ product_id: P[2], product_tax: 0, product_qty: 1, product_price: 9, product_discount: 0 }] });
  call('delete_et_sales_offer', { unique_id: 'OFF-2' });
  void o1;
  // 6. manufacturing
  call('add_et_manufacture', { request_key: 'MO-1', header: { mo_date: '2025-05-01', product_id: P[2], planned_qty: 2, extra_cost: 3 }, lines: [{ product_id: P[0], planned_qty: 2 }, { product_id: P[1], planned_qty: 1 }] });
  call('edit_et_manufacture', { header: { unique_id: 'MO-1', version: 0, mo_date: '2025-05-01', product_id: P[2], planned_qty: 2, extra_cost: 4 }, lines: [{ product_id: P[0], planned_qty: 3 }, { product_id: P[1], planned_qty: 1 }] });
  call('approve_et_manufacture', { unique_id: 'MO-1', version: 1 });
  call('complete_et_manufacture', { unique_id: 'MO-1', version: 2, produced_qty: 2, completion_date: '2025-05-02' });
  call('add_et_manufacture', { request_key: 'MO-2', header: { mo_date: '2025-05-03', product_id: P[2], planned_qty: 1 }, lines: [{ product_id: P[0], planned_qty: 1 }] });
  call('cancel_et_manufacture', { unique_id: 'MO-2', version: 0 });
  call('add_et_manufacture', { request_key: 'MO-3', header: { mo_date: '2025-05-04', product_id: P[2], planned_qty: 1 }, lines: [{ product_id: P[1], planned_qty: 1 }] });
  call('delete_et_manufacture', { unique_id: 'MO-3', version: 0 });
  return responses;
}

const START = Date.UTC(2025, 5, 1, 9, 0, 0);
const VOLATILE = { created_at: true, updated_at: true, approval_time: true };

// Run A: legacy writes.
uuidCounter = 0; H.setNow(START); H.cacheStore.clear();
ET.setFlag_('ET_SJS_READ', false); ET.setFlag_('ET_SJS_WRITE', false);
const bookA = makeBook('write-db-A');
let respA = [];
try { respA = runScript('write-db-A'); ok(true, 'legacy run completed (' + respA.length + ' write actions)'); } catch (e) { ok(false, 'legacy run threw: ' + e.stack); }

// Run C: packs AND the write layer. The chunked cache draws UUIDs too, so generated
// ids differ from run A; compared below with ids masked.
uuidCounter = 0; H.setNow(START); H.cacheStore.clear();
ET.setFlag_('ET_SJS_READ', true); ET.setFlag_('ET_SJS_WRITE', true);
const bookC = makeBook('write-db-C');
let respC = [];
try { respC = runScript('write-db-C'); ok(true, 'ET_SJS_READ+ET_SJS_WRITE run completed (' + respC.length + ' write actions)'); } catch (e) { ok(false, 'ET_SJS_READ+ET_SJS_WRITE run threw: ' + e.stack); }

// Run B: one atomic batchUpdate per request (write layer only: same ids as run A).
uuidCounter = 0; H.setNow(START); H.cacheStore.clear();
ET.setFlag_('ET_SJS_READ', false); ET.setFlag_('ET_SJS_WRITE', true);
let buCalls = 0;
const buInner = H.ctx.Sheets.Spreadsheets.batchUpdate;
H.ctx.Sheets.Spreadsheets.batchUpdate = function (req, dbId) { buCalls++; return buInner(req, dbId); };
const bookB = makeBook('write-db-B');
let respB = [];
try { respB = runScript('write-db-B'); ok(true, 'ET_SJS_WRITE run completed (' + respB.length + ' write actions)'); } catch (e) { ok(false, 'ET_SJS_WRITE run threw: ' + e.stack); }
H.ctx.Sheets.Spreadsheets.batchUpdate = buInner;

/* ── T-WRITE: same rows ── */
const UID = /^[0-9a-f]{16}$/;
[[bookB, 'B write layer', false], [bookC, 'C packs + write layer, ids masked', true]].forEach(function (pair) {
BUSINESS.concat(MFG.map(function (m) { return m[0]; })).forEach(function (t) {
  const a = bookA.getSheetByName(t).getDataRange().getValues();
  const b = pair[0].getSheetByName(t).getDataRange().getValues();
  const h = a[0].map(String);
  const diffs = [];
  if (a.length !== b.length) diffs.push('rows ' + a.length + ' != ' + b.length);
  for (let i = 1; i < Math.min(a.length, b.length); i++) {
    for (let j = 0; j < h.length; j++) {
      if (VOLATILE[h[j].trim()]) continue;
      const x = a[i][j], y = b[i][j];
      const same = (x instanceof Date || y instanceof Date) ? (x instanceof Date && y instanceof Date && x.getTime() === y.getTime()) : (x === y || ((x === '' || x == null) && (y === '' || y == null)) || (typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 1e-9));
      if (!same && pair[2] && UID.test(String(x)) && UID.test(String(y))) continue;
      if (!same) diffs.push('r' + (i + 1) + ' ' + h[j] + ': ' + JSON.stringify(x) + ' != ' + JSON.stringify(y));
    }
  }
  ok(diffs.length === 0, 'T-WRITE [' + pair[1] + '] ' + t + ' identical (' + (a.length - 1) + ' rows)' + (diffs.length ? '\n        ' + diffs.slice(0, 6).join('\n        ') : ''));
});
});

const writesB = respB.length;
ok(buCalls > 0 && buCalls <= writesB, 'ET_SJS_WRITE: at most one batchUpdate per write request (' + buCalls + ' for ' + writesB + ' requests)');
const journal = bookB.getSheetByName('erp_test__journal').getDataRange().getValues();
ok(journal.length > 20, 'journal rows written in the same batchUpdate (' + (journal.length - 1) + ')');
const seqs = journal.slice(1).map(function (r) { return Number(r[0]); });
ok(seqs.every(function (q, i) { return q === i + 1; }), 'journal seq is 1..n without gaps');
ok(respB.filter(function (x) { return /^add_/.test(x.action); }).every(function (x) { return Array.isArray(x.r.journal) && x.r.journal.length > 0; }), 'every add response carries its journal ops');
ok(journal.slice(1).some(function (r) { return r[4] === 'patch' && String(r[3]) === 'erp_test_sales_offer' && /Approved/.test(r[7]); }), 'approvals (approveStep_) are journaled too');
ok(bookA.getSheetByName('erp_test__journal').getLastRow() === 1, 'legacy run writes no journal');

/* ── T-ATOMIC ── */
const before = bookB.getSheetByName('erp_test_products').getLastRow();
let threw = false;
try { ET.atomicProbe_('write-db-B', 'erp_test_products', { id: 999, name_ar: 'atomic' }); } catch (e) { threw = true; }
ok(threw && bookB.getSheetByName('erp_test_products').getLastRow() === before, 'T-ATOMIC: valid insert + bad sheetId -> exception, no row written');
failNextBatchUpdate = true;
threw = false;
try { ET.dispatch_({ module_action: 'add_et_product', data: { name_ar: 'rolled back' } }, SU, 'write-db-B'); } catch (e) { threw = true; }
ok(threw && bookB.getSheetByName('erp_test_products').getLastRow() === before, 'a rejected commit leaves the sheet untouched (handler writes were only in the overlay)');
threw = false;
try { ET.dispatch_({ module_action: 'complete_et_manufacture', data: { unique_id: 'MO-2', produced_qty: 1, completion_date: '2025-05-05' } }, SU, 'write-db-B'); } catch (e) { threw = true; }
ok(threw, 'a handler exception inside the transaction propagates');

/* ── P10.3 compaction, P10.5 reconcile ── */
const comp = ET.compact_('write-db-B');
ok(comp.status === 'success' && bookB.getSheetByName('erp_test__journal').getLastRow() === 1, 'compaction snapshots every journaled table and empties the journal (' + JSON.stringify(comp) + ')');
ok(bookB.getSheetByName('erp_test__packs').getLastRow() > 5, 'snapshots saved in erp_test__packs');
H.cacheStore.clear();
const lst = ET.dispatch_({ module_action: 'get_et_sales_headers', data: { loadAll: true } }, SU, 'write-db-B');
ok(lst.status === 'success' && lst.headers.length === 1, 'reads after compaction come from snapshot + journal');
const rec = ET.reconcile_('write-db-B');
ok(rec && rec.ok === true, 'nightly reconcile: cached packs match the source (' + JSON.stringify(rec.diffs) + ')');
const edit = ET.onSheetEdit_('write-db-B', { range: { getSheet: function () { return { getName: function () { return 'erp_test_products'; } }; } } });
ok(edit.status === 'success', 'manual-edit trigger invalidates the edited table');

ET.setFlag_('ET_SJS_READ', false); ET.setFlag_('ET_SJS_WRITE', false);
console.log('\n' + (failed ? failed + ' write-layer check(s) FAILED.' : 'erp_test write layer (T-WRITE, T-ATOMIC) passes.') + '\n');
process.exit(failed ? 1 : 0);
