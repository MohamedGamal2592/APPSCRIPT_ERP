/**
 * VF-PURCHASING-RECOVERY — durable, automatic reconciliation of uncertain
 * vf_purchasing requests, proved by failure injection against the REAL code.
 *
 * Loads the real Code.js plus the real purchasing block of
 * Company_ValleyFoods_Actions.js over fake Sheets, then drives every
 * purchasing write through crashes at each interruption boundary and a
 * subsequent same-request retry:
 *
 *  boundaries: validation refusal, header-created/lines-never-written,
 *  partial staged generation, complete-but-inactive generation, success with
 *  lost receipt, immutable user Code, duplicate Code, approval lock, totals mismatch,
 *  permission denial, checkpoint flow + commitOnly fast path.
 *
 * Proves: at most one header and one logical line generation per request ID;
 * no retry duplicates rows; a failed replacement never destroys the active
 * set; staged sets activate exactly once; lost-after-success recovers as
 * success; receipt-finalization loss recovers; deterministic failures stay
 * REQUEST_NOT_APPLIED; mismatched payloads hash differently; double
 * submission reuses one ID; approval/cost gates hold; reports and readers see
 * only active lines; legacy purchases stay readable; the status route and the
 * admin reconciler behave.
 *
 * Nothing here touches a spreadsheet, a Google service or the network.
 *
 * Run: node tools/verify/vf_purchasing_recovery.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('Company_ValleyFoods_Actions.js');
const CODE = read('Code.js');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + String(extra).slice(0, 300)); }
}

/* ══ fake Sheets ═════════════════════════════════════════════════════════ */
function makeSheet(name, headers, fail) {
  const grid = [headers.slice()];
  const sh = {
    __name: name, __grid: grid, __fail: fail || {},
    getName: () => name,
    getParent: () => ({ getId: () => 'ss' }),
    getSheetId: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getMaxRows: () => Math.max(1000, grid.length + 10),
    insertRowsAfter: () => {},
    getDataRange: () => ({ getValues: () => grid.map((r) => r.slice()) }),
    getRange: (row, col, nRows, nCols) => ({
      getValues: () => {
        const out = [];
        for (let r = 0; r < (nRows || 1); r++) {
          const src = grid[row - 1 + r] || [];
          out.push(src.slice(col - 1, col - 1 + (nCols || grid[0].length)));
        }
        return out;
      },
      getFormulas: () => [new Array(nCols || grid[0].length).fill('')],
      setValues: (v) => {
        if (sh.__fail.setValues > 0) { sh.__fail.setValues--; throw new Error('injected setValues failure on ' + name); }
        (v || []).forEach((r, i) => {
          const at = row - 1 + i;
          while (grid.length <= at) grid.push(new Array(grid[0].length).fill(''));
          for (let j = 0; j < r.length; j++) grid[at][col - 1 + j] = r[j];
        });
      },
    }),
    appendRow: (r) => {
      if (sh.__fail.appendRow > 0) { sh.__fail.appendRow--; throw new Error('injected appendRow failure on ' + name); }
      const row = r.slice();
      while (row.length < grid[0].length) row.push('');
      grid.push(row);
    },
    deleteRow: (n) => {
      if (sh.__fail.deleteRow > 0) { sh.__fail.deleteRow--; throw new Error('injected deleteRow failure on ' + name); }
      grid.splice(n - 1, 1);
    },
    deleteRows: (n, h) => {
      if (sh.__fail.deleteRows > 0) { sh.__fail.deleteRows--; throw new Error('injected deleteRows failure on ' + name); }
      grid.splice(n - 1, h);
    },
    setFrozenRows: () => {},
  };
  return sh;
}
function makeSS() {
  const sheets = {};
  return {
    sheets,
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n, headers) => {
      const sh = makeSheet(n, headers || []);
      sheets[n] = sh;
      return sh;
    },
  };
}

/* ══ sandbox: real data layer + real purchasing block ════════════════════ */
const HDR_EXTRA = ['last_request_id', 'active_line_generation', 'operation_state', 'operation_hash'];
const LINE_EXTRA = ['request_id', 'line_generation', 'generation_hash'];
const HDR_BASE = ['id', 'Code', 'tax_system', 'Reciept Date', 'Items', 'Type', 'Shipping Type',
  'Value', 'Currency', 'Exchange rate', 'Total costs', 'Supplier Name',
  'user', 'approval_status', 'approval', 'approval_time', 'quality_approval_status', 'quality_approval',
  'quality_approval_time', 'user_name', 'version'];
const LINE_BASE = ['unique_id', 'id', 'movement_code', 'lot_identification', 'code', 'movement_place',
  'vendor', 'product', 'product_category', 'receipt_date', 'qty', 'unit_price', 'other_cost', 'total_cost',
  'movement_type', 'sales_qty', 'sales_value', 'sales_value_amount', 'unit_cost', 'invoice_date',
  'Production date', 'Expiry date', 'user', 'currency', 'exchange_rate', 'cost_currency'];

function makeWorld() {
  const SS = makeSS();
  SS.insertSheet('valley_purchasing_costing', HDR_BASE.concat(HDR_EXTRA));
  SS.insertSheet('valley_product_purchasing', LINE_BASE.concat(LINE_EXTRA));
  let uuidN = 0;
  const sb = {
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => SS.getSheetByName(n), insertSheet: (n) => SS.insertSheet(n, []) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => 'uuid-' + String(uuidN++).padStart(4, '0'),
      formatDate: (d) => {
        const p = (n) => ('0' + n).slice(-2);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      },
      sleep: () => {},
      computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
    },
    Session: { getScriptTimeZone: () => 'Africa/Cairo', getActiveUser: () => ({ getEmail: () => '' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, getAll: () => ({}), putAll: () => {}, removeAll: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    Logger: { log: () => {} },
    ScriptApp: { getProjectTriggers: () => [] },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read('Code.js'), sb, { filename: 'Code.js' });
  vm.runInContext(read('Company_ValleyFoods_Actions.js'), sb, { filename: 'Company_ValleyFoods_Actions.js' });
  vm.runInContext(read('Company_ValleyFoods_Registry.js'), sb, { filename: 'Company_ValleyFoods_Registry.js' });
  vm.runInContext('COMPANY_REGISTRY = {}; registerValleyFoods_(); _companiesInitialized_ = true;', sb);
  vm.runInContext(
    "getSpreadsheet_ = function () { return SpreadsheetApp.openById('x'); };" +
    "getSheet_ = function (n) { var s = SpreadsheetApp.openById('x').getSheetByName(n);" +
    " if (!s) throw new Error('no sheet ' + n); return s; };", sb);

  const env = {
    settingsEnsureSheet_: function (dbId, sheetName, canonical) {
      let sh = SS.getSheetByName(sheetName);
      if (!sh) { sh = SS.insertSheet(sheetName, canonical.slice()); return sh; }
      const have = sh.__grid[0].map((h) => String(h).trim());
      canonical.forEach((h) => {
        if (have.indexOf(h) === -1) {
          sh.__grid[0].push(h);
          sh.__grid.forEach((r, i) => { if (i > 0) r.push(''); });
        }
      });
      return sh;
    },
    uid16_: (() => { let n = 0; return () => 'uid' + String(n++).padStart(13, '0'); })(),
    vfFlush_: () => {},
    vfCanSeeCost_: () => true,
    vfRefsCached_: (db, k, fn) => fn(),
    vfPage_: (rows) => ({ rows: rows, total: rows.length }),
    vfBoundRows_: (rows) => rows,
    vfStripCost_: (item, keys) => { (keys || []).forEach((k) => { delete item[k]; }); },
    vfStripCostAll_: (rows, keys) => { (rows || []).forEach((r) => (keys || []).forEach((k) => { delete r[k]; })); },
    vfDateStr_: (v) => (v instanceof Date ? sb.Utilities.formatDate(v) : String(v == null ? '' : v).slice(0, 10)),
    vfDateTimeStr_: (v) => String(v == null ? '' : v),
    VF_COST_KEYS: { pur_header: [], pur_line: [] },
    FIN_PARTIES_SHEET: 'vf_parties', FIN_PRODUCTS_SHEET: 'vf_products', FIN_CHART_SHEET: 'vf_chart',
    logHistory_: () => {},
    calcLineNet_: (q, u) => q * u,
  };
  sb.__env = env;
  const START = SRC.indexOf("  var PURCHASING_COSTING_SHEET = 'valley_purchasing_costing';");
  const END = SRC.indexOf('  function getValleyParties_(', START);
  assert(START !== -1 && END > START, 'purchasing block not located');
  env.ValleyFoods = { register: function () {} };
  const H = vm.runInContext('(function (env) { with (env) {\n' + SRC.slice(START, END) +
    '\n return { save: saveValleyPurchasingCosting_, hdrCkpt: saveValleyPurchasingHeaderCheckpoint_,' +
    ' linesCkpt: saveValleyPurchasingLinesCheckpoint_, commitApplied: purchasingCommitAlreadyApplied_,' +
    ' getLines: getValleyPurchasingLines_, getReport: getValleyPurchasingReport_,' +
    ' getCosting: getValleyPurchasingCosting_, del: deleteValleyPurchasingCosting_,' +
    ' reconcile: reconcileValleyPurchasingReceipts_, opHash: purchasingOperationHash_,' +
    ' genId: purchasingGenerationId_, activeLines: purchasingActiveLines_,' +
    ' findByReq: purchasingFindHeaderByRequest_, cleanup: purchasingCleanupInactiveGenerations_ }; } })', sb)(env);
  return { sb, SS, env, H };
}

const USER = { email: 'buyer@valley.test', name: 'Buyer' };
const ADMIN = { email: 'admin@valley.test', name: 'Admin', isSuperAdmin: true };
function payload(code, nLines, over) {
  const lines = [];
  for (let i = 0; i < nLines; i++) {
    lines.push({ product: 'P' + i, qty: 2, unit_price: 50, total_cost: 100, other_cost: 0, movement_type: 'بيع' });
  }
  const d = {
    header: {
      Code: code, 'Reciept Date': '2026-03-04', Type: 'تصنيع', 'Shipping Type': 'محلي',
      'Supplier Name': 'SUP-9', Currency: 'EGP', Value: 100 * nLines, 'Total costs': 100 * nLines,
    },
    originalCode: '', lines: lines,
  };
  return Object.assign(d, over || {});
}
function invoke(H, sb, fn, data, user, reqId, recovering) {
  sb.resetRecordCache_();
  try {
    return { result: H[fn](data, user || USER, 'db', reqId === undefined ? undefined : { requestId: reqId, recovering: !!recovering }) };
  } catch (e) { return { error: e }; }
}
function counts(SS) {
  const hdrs = SS.getSheetByName('valley_purchasing_costing').__grid.length - 1;
  const lines = SS.getSheetByName('valley_product_purchasing').__grid.length - 1;
  return { hdrs: hdrs, lines: lines };
}
function headerRow(SS, code) {
  const g = SS.getSheetByName('valley_purchasing_costing').__grid;
  const h = g[0];
  const row = g.find((r, i) => i > 0 && String(r[h.indexOf('Code')]) === code);
  if (!row) return null;
  const o = {};
  h.forEach((k, i) => { o[k] = row[i]; });
  return o;
}
function lineRows(SS, code) {
  const g = SS.getSheetByName('valley_product_purchasing').__grid;
  const h = g[0];
  return g.filter((r, i) => i > 0 && String(r[h.indexOf('code')]) === code)
    .map((r) => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; });
}
/* Seeding helpers (function declarations hoist above first use). */
function seedHeader(W, code, fields, markers) {
  const sh = SS_HDR(W);
  const h = sh.__grid[0];
  const row = new Array(h.length).fill('');
  Object.keys(fields || {}).forEach((k) => { const i = h.indexOf(k); if (i !== -1) row[i] = fields[k]; });
  Object.keys(markers || {}).forEach((k) => { const i = h.indexOf(k); if (i !== -1) row[i] = markers[k]; });
  row[h.indexOf('Code')] = code;
  sh.__grid.push(row);
}
function seedLine(W, vals) {
  const sh = SS_LINE(W);
  const h = sh.__grid[0];
  const row = new Array(h.length).fill('');
  Object.keys(vals || {}).forEach((k) => { const i = h.indexOf(k); if (i !== -1) row[i] = vals[k]; });
  sh.__grid.push(row);
}
function expiryYmd() {
  const d = new Date(2026, 2, 4);
  d.setDate(d.getDate() + 720);
  const p = (n) => ('0' + n).slice(-2);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
const EXPIRY_2026_03_04 = expiryYmd();
/* Real client payloads carry per-line dates; strict matching needs them. */
function fullLines(d) {
  d.lines.forEach((l) => {
    l.receipt_date = '2026-03-04'; l.invoice_date = '2026-03-04';
    l['Production date'] = '2026-03-04'; l['Expiry date'] = EXPIRY_2026_03_04;
  });
  return d;
}
function headerFields(d) {
  return {
    Type: d.header.Type, 'Shipping Type': d.header['Shipping Type'], 'Supplier Name': d.header['Supplier Name'],
    Currency: d.header.Currency, Value: d.header.Value, 'Total costs': d.header['Total costs'],
    'Reciept Date': d.header['Reciept Date'],
  };
}

/* ══ 1. deterministic refusals write nothing ═════════════════════════════ */
console.log('\n1 — deterministic failures are confirmed and write nothing\n');
{
  const W = makeWorld();
  let r = invoke(W.H, W.sb, 'save', payload('', 2), USER, 'req-0000000000000001');
  check(r.error && r.error.notApplied === true, 'missing Code is REQUEST_NOT_APPLIED');
  check(counts(W.SS).hdrs === 0 && counts(W.SS).lines === 0, '  and writes nothing');
  const bad = payload('P-BAD', 2);
  bad.lines[0].movement_type = '';
  r = invoke(W.H, W.sb, 'save', bad, USER, 'req-0000000000000002');
  check(r.error && /نوع الحركة/.test(r.error.message) && r.error.notApplied === true, 'missing movement_type is REQUEST_NOT_APPLIED');
  const tot = payload('P-TOT', 2);
  tot.header['Total costs'] = 1;
  r = invoke(W.H, W.sb, 'save', tot, USER, 'req-0000000000000003');
  check(r.error && /مجموع تكاليف/.test(r.error.message) && r.error.notApplied === true, 'totals mismatch is REQUEST_NOT_APPLIED');
  check(counts(W.SS).hdrs === 0 && counts(W.SS).lines === 0, '  still nothing written');
  W.env.vfCanSeeCost_ = () => false;
  r = invoke(W.H, W.sb, 'save', payload('P-PERM', 1), USER, 'req-0000000000000004');
  check(r.error && r.error.notApplied === true, 'cost-view denial is REQUEST_NOT_APPLIED');
  W.env.vfCanSeeCost_ = () => true;
  check(counts(W.SS).hdrs === 0, '  permission denial writes nothing');
}

/* ══ 2. success stamps markers; same-ID rerun duplicates nothing ═════════ */
console.log('\n2 — one request ID, one header, one line generation\n');
{
  const W = makeWorld();
  const R = 'req-0000000000000011';
  const USER_CODE = '000123-Ab';
  const d2 = fullLines(payload(USER_CODE, 3));
  const r = invoke(W.H, W.sb, 'save', d2, USER, R);
  check(r.result && r.result.status === 'success', 'create succeeds', r.error && r.error.message);
  const h = headerRow(W.SS, USER_CODE);
  check(h && h.Code === USER_CODE, 'user-entered Code keeps its case and leading zeros');
  check(h && h.last_request_id === R && h.operation_state === 'complete', 'header stamped with request + complete');
  check(h && h.operation_hash === W.H.opHash(d2), 'operation hash matches the payload');
  check(h && String(h.active_line_generation || '') === W.H.genId(R), 'active generation derives from the request');
  const ls = lineRows(W.SS, USER_CODE);
  check(ls.length === 3 && ls.every((l) => l.code === USER_CODE && l.code !== R),
    'the purchasing line Code stays the user value, never the request ID');
  check(ls.length === 3 && ls.every((l) => l.request_id === R && l.line_generation === W.H.genId(R) && l.generation_hash === h.operation_hash),
    'all lines carry the request marker + generation');
  const c0 = counts(W.SS);
  const r2 = invoke(W.H, W.sb, 'save', d2, USER, R);
  check(r2.result && r2.result.status === 'success', 'same-ID rerun succeeds');
  const c1 = counts(W.SS);
  check(c0.hdrs === c1.hdrs && c0.lines === c1.lines, '  with zero new rows');
  const r3 = invoke(W.H, W.sb, 'save', d2, USER, R, true);
  check(r3.result && r3.result.status === 'success' && r3.result.recovered === true, 'recovering retry returns the original as applied');
  check(counts(W.SS).hdrs === c0.hdrs && counts(W.SS).lines === c0.lines, '  still zero new rows');
}

/* ══ 3. header written, lines never landed → retry completes ═════════════ */
console.log('\n3 — interruption between header and lines resumes safely\n');
{
  const W = makeWorld();
  const R = 'req-0000000000000021';
  W.SS.getSheetByName('valley_product_purchasing').__fail.setValues = 1;
  const r = invoke(W.H, W.sb, 'save', payload('P-TWO', 2), USER, R);
  check(r.error && !r.error.notApplied, 'line-write crash stays uncertain (never a false failure)');
  check(counts(W.SS).hdrs === 1 && counts(W.SS).lines === 0, 'header exists, no lines');
  const h = headerRow(W.SS, 'P-TWO');
  check(h && h.last_request_id === R && h.operation_state === 'in_progress', 'interrupted header is marked in_progress');
  const r2 = invoke(W.H, W.sb, 'save', payload('P-TWO', 2), USER, R, true);
  check(r2.result && r2.result.status === 'success', 'recovering retry completes the document', r2.error && r2.error.message);
  check(counts(W.SS).hdrs === 1 && counts(W.SS).lines === 2, '  exactly one header and one line set');
  const h2 = headerRow(W.SS, 'P-TWO');
  check(h2 && h2.operation_state === 'complete', '  header flipped to complete on activation');
}

/* ══ 4. partial + complete staged sets ═══════════════════════════════════ */
console.log('\n4 — staged generations resume without duplicating\n');
{
  const W = makeWorld();
  const R = 'req-0000000000000031';
  const G = W.H.genId(R);
  const d = fullLines(payload('P-STG', 3));
  const H = W.H.opHash(d);
  /* header stamped by the interrupted attempt, plus 2 of 3 staged rows */
  seedHeader(W, 'P-STG', headerFields(d), { last_request_id: R, operation_hash: H, operation_state: 'in_progress', active_line_generation: '' });
  [['u1', 901, 'P0'], ['u2', 902, 'P1']].forEach(([u, id, p]) => {
    seedLine(W, {
      unique_id: u, id: id, code: 'P-STG', product: p, qty: 2, unit_price: 50, total_cost: 100,
      movement_type: 'بيع', receipt_date: '2026-03-04', invoice_date: '2026-03-04',
      'Production date': '2026-03-04', 'Expiry date': EXPIRY_2026_03_04,
      request_id: R, line_generation: G, generation_hash: H,
    });
  });
  const r = invoke(W.H, W.sb, 'save', d, USER, R, true);
  check(r.result && r.result.status === 'success', 'partial staged set resumes to success', r.error && r.error.message);
  const ls = lineRows(W.SS, 'P-STG');
  check(ls.length === 3, '  exactly 3 lines, no duplicates', ls.length);
  check(ls.every((l) => l.line_generation === G), '  all in the request generation');
}
function SS_LINE(W) { return W.SS.getSheetByName('valley_product_purchasing'); }
function SS_HDR(W) { return W.SS.getSheetByName('valley_purchasing_costing'); }

/* ══ 5. complete staged set without activation ═══════════════════════════ */
console.log('\n5 — activation is the commit point\n');
{
  const W = makeWorld();
  const R = 'req-0000000000000041';
  const G = W.H.genId(R);
  const d = fullLines(payload('P-ACT', 2));
  const H = W.H.opHash(d);
  seedHeader(W, 'P-ACT', headerFields(d), { last_request_id: R, operation_hash: H, operation_state: 'in_progress', active_line_generation: '' });
  d.lines.forEach((l, i) => {
    seedLine(W, {
      unique_id: 'su' + i, id: 910 + i, code: 'P-ACT', product: l.product, qty: 2, unit_price: 50,
      total_cost: 100, movement_type: 'بيع', receipt_date: '2026-03-04', invoice_date: '2026-03-04',
      'Production date': '2026-03-04', 'Expiry date': EXPIRY_2026_03_04,
      request_id: R, line_generation: G, generation_hash: H,
    });
  });
  const before = counts(W.SS);
  const r = invoke(W.H, W.sb, 'save', d, USER, R, true);
  check(r.result && r.result.status === 'success', 'staged-but-inactive activates on retry', r.error && r.error.message);
  check(counts(W.SS).lines === before.lines, '  activation writes zero new line rows');
  const got = invoke(W.H, W.sb, 'getLines', { code: 'P-ACT' }, USER);
  check(got.result && got.result.lines.length === 2, '  readers see the activated set');
}

/* ══ 6. rename edit + approval lock + duplicate Code ═════════════════════ */
console.log('\n6 — immutable user Code, locks, and duplicate protection\n');
{
  const W = makeWorld();
  invoke(W.H, W.sb, 'save', payload('P-OLD', 2), USER, 'req-0000000000000051');
  const e = invoke(W.H, W.sb, 'save', Object.assign(payload('P-NEW', 2), { originalCode: 'P-OLD' }), USER, 'req-0000000000000052');
  check(e.error && e.error.notApplied === true && /ثابت/.test(e.error.message), 'renaming the user-entered Code is refused');
  check(lineRows(W.SS, 'P-OLD').length === 2 && lineRows(W.SS, 'P-NEW').length === 0, '  original header/line key remains unchanged');
  const created = invoke(W.H, W.sb, 'save', payload('P-NEW', 1), USER, 'req-0000000000000053');
  check(created.result && created.result.status === 'success', 'a genuinely new Code can still be created');
  const dup = invoke(W.H, W.sb, 'save', payload('P-NEW', 1), USER, 'req-0000000000000054');
  check(dup.error && dup.error.notApplied === true && /مكرر/.test(dup.error.message), 'duplicate Code by another request is a confirmed refusal');
  /* approval lock engages for new mutations but never blocks recovery proof */
  const HG = W.SS.getSheetByName('valley_purchasing_costing').__grid;
  const hh = HG[0];
  const hr = HG.find((r, i) => i > 0 && String(r[hh.indexOf('Code')]) === 'P-NEW');
  hr[hh.indexOf('approval_status')] = 'Approved';
  const locked = invoke(W.H, W.sb, 'save', Object.assign(payload('P-NEW', 1), { originalCode: 'P-NEW' }), USER, 'req-0000000000000055');
  check(locked.error && locked.error.notApplied === true && /معتمدة/.test(locked.error.message), 'approved purchase refuses edits as a confirmed failure');
}

/* ══ 7. checkpoints + commitOnly fast path ═══════════════════════════════ */
console.log('\n7 — checkpoint flow converges once\n');
{
  const W = makeWorld();
  const d = fullLines(payload('P-CK', 2));
  const h1 = invoke(W.H, W.sb, 'hdrCkpt', { header: d.header, originalCode: '' }, USER, 'req-ck-00000000000001');
  check(h1.result && h1.result.status === 'success', 'header checkpoint succeeds', h1.error && h1.error.message);
  const l1 = invoke(W.H, W.sb, 'linesCkpt', { code: 'P-CK', originalCode: '', lines: d.lines }, USER, 'req-ck-00000000000002');
  check(l1.result && l1.result.status === 'success', 'lines checkpoint succeeds', l1.error && l1.error.message);
  const f1 = invoke(W.H, W.sb, 'save', Object.assign({}, d, { commitOnly: true }), USER, 'req-ck-00000000000003');
  check(f1.result && f1.result.status === 'success' && f1.result.committed === true, 'final commit fast-paths on matching checkpoints');
  check(counts(W.SS).hdrs === 1 && counts(W.SS).lines === 2, '  one header, one line set total');
  const f2 = invoke(W.H, W.sb, 'save', Object.assign({}, d, { commitOnly: true }), USER, 'req-ck-00000000000003', true);
  check(f2.result && f2.result.status === 'success', 'commit retry recovers');
}

/* ══ 8. legacy + foreign rows stay correct ═══════════════════════════════ */
console.log('\n8 — legacy purchases and inactive generations\n');
{
  const W = makeWorld();
  /* legacy rows: no markers at all */
  const HG = W.SS.getSheetByName('valley_purchasing_costing').__grid;
  const hh = HG[0];
  const hr = new Array(hh.length).fill('');
  hr[hh.indexOf('id')] = 1; hr[hh.indexOf('Code')] = 'P-LEG';
  hr[hh.indexOf('Type')] = 'تصنيع'; hr[hh.indexOf('Shipping Type')] = 'محلي';
  HG.push(hr);
  const LG = W.SS.getSheetByName('valley_product_purchasing').__grid;
  const lh = LG[0];
  const lr = new Array(lh.length).fill('');
  lr[lh.indexOf('id')] = 1; lr[lh.indexOf('code')] = 'P-LEG'; lr[lh.indexOf('product')] = 'PL';
  lr[lh.indexOf('qty')] = 1; lr[lh.indexOf('movement_type')] = 'بيع';
  LG.push(lr);
  const got = invoke(W.H, W.sb, 'getLines', { code: 'P-LEG' }, USER);
  check(got.result && got.result.lines.length === 1 && got.result.lines[0].product === 'PL', 'legacy lines remain readable');
  check(!('request_id' in got.result.lines[0]), '  with no internal IDs exposed');
  const rep = invoke(W.H, W.sb, 'getReport', {}, USER);
  const hasLeg = rep.result && rep.result.linesByCode && rep.result.linesByCode['P-LEG'];
  check(hasLeg && hasLeg.length === 1, '  legacy lines stay in reports');
  /* foreign staged generation for the same code is invisible until active */
  const fr = new Array(lh.length).fill('');
  fr[lh.indexOf('id')] = 2; fr[lh.indexOf('code')] = 'P-LEG'; fr[lh.indexOf('product')] = 'GHOST';
  fr[lh.indexOf('line_generation')] = 'g_other'; fr[lh.indexOf('request_id')] = 'req-other';
  LG.push(fr);
  const got2 = invoke(W.H, W.sb, 'getLines', { code: 'P-LEG' }, USER);
  check(got2.result && got2.result.lines.length === 1 && got2.result.lines[0].product === 'PL', 'inactive generations are invisible to readers');
  /* first staged rewrite absorbs the legacy set */
  const d = payload('P-LEG', 1);
  d.originalCode = 'P-LEG';
  const rw = invoke(W.H, W.sb, 'save', d, USER, 'req-0000000000000061');
  check(rw.result && rw.result.status === 'success', 'legacy rewrite succeeds', rw.error && rw.error.message);
  const after = lineRows(W.SS, 'P-LEG');
  check(after.length === 1 && after[0].product === 'P0', '  exactly one authoritative line afterwards', JSON.stringify(after.map((l) => l.product)));
}

/* ══ 9. operation hash contract ══════════════════════════════════════════ */
console.log('\n9 — canonical operation hash\n');
{
  const W = makeWorld();
  const a = payload('P-H', 2);
  const b = payload('P-H', 2);
  check(W.H.opHash(a) === W.H.opHash(b), 'identical payloads hash identically');
  const reordered = { header: {}, lines: a.lines };
  Object.keys(a.header).reverse().forEach((k) => { reordered.header[k] = a.header[k]; });
  check(W.H.opHash(reordered) === W.H.opHash(a), '  regardless of key order');
  const moved = payload('P-H', 2);
  moved.lines = [moved.lines[1], moved.lines[0]];
  moved.lines[0].product = 'PX';
  check(W.H.opHash(moved) !== W.H.opHash(a), '  different line content hashes differently');
  const withTransport = payload('P-H', 2);
  withTransport.header.__request_id = 'req-x';
  withTransport.header.__request_owner = 'someone@x.test';
  check(W.H.opHash(withTransport) === W.H.opHash(a), '  transport fields are excluded');
  check(/^[0-9a-f]{16}$/.test(W.H.opHash(a)), '  16-hex format');
  check(W.H.genId('req-abc-123') === W.H.genId('req-abc-123'), 'generation IDs are deterministic');
}

/* ══ 10. delete + reconcile + status route ═══════════════════════════════ */
console.log('\n10 — delete, admin reconcile, request status\n');
{
  const W = makeWorld();
  invoke(W.H, W.sb, 'save', payload('P-DEL', 2), USER, 'req-0000000000000071');
  const del = invoke(W.H, W.sb, 'del', { code: 'P-DEL' }, ADMIN);
  check(del.result && del.result.status === 'success', 'delete succeeds', del.error && del.error.message);
  check(counts(W.SS).hdrs === 0 && lineRows(W.SS, 'P-DEL').length === 0, '  header and all generations removed');

  /* reconcile: applied purchase + legacy uncertain receipt */
  invoke(W.H, W.sb, 'save', payload('P-RC', 1), USER, 'req-0000000000000072');
  const RG = W.SS.sheets['ERP_Request_Receipts'] ||
    W.SS.insertSheet('ERP_Request_Receipts', ['request_key', 'request_id', 'user_email', 'module_action', 'payload_hash', 'state', 'response_json', 'created_at', 'updated_at']);
  RG.appendRow(['k-applied', 'req-0000000000000072', USER.email, 'save_valley_purchasing_costing', 'h', 'uncertain', '{}', new Date().toISOString(), new Date().toISOString()]);
  RG.appendRow(['k-legacy', 'req-legacy-00000001', USER.email, 'save_valley_purchasing_costing', 'h', 'uncertain', '{}', new Date().toISOString(), new Date().toISOString()]);
  const nonAdmin = invoke(W.H, W.sb, 'reconcile', {}, USER);
  check(nonAdmin.error && nonAdmin.error.notApplied === true, 'reconcile is admin-only');
  const dry = invoke(W.H, W.sb, 'reconcile', { dry_run: true }, ADMIN);
  check(dry.result && dry.result.status === 'success', 'dry run succeeds');
  check(dry.result.reviewed === 2, '  both receipts reviewed', dry.result.reviewed);
  check(dry.result.marked_done.length === 1 && dry.result.marked_done[0].request_id === 'req-0000000000000072',
    '  applied purchase provable; legacy stays manual');
  check(dry.result.manual_review.length === 1 && dry.result.manual_review[0].request_id === 'req-legacy-00000001', '  legacy receipt untouched');
  const before = RG.__grid.length;
  const apply = invoke(W.H, W.sb, 'reconcile', { dry_run: false }, ADMIN);
  check(apply.result && apply.result.marked_done[0].decision === 'done', 'apply marks the proven receipt done');
  check(RG.__grid.length === before, '  no receipt row ever deleted');
  const patched = RG.__grid.find((r) => r[0] === 'k-applied');
  check(patched[5] === 'done' && JSON.parse(patched[6]).status === 'success', '  done state + reconstructed response stored');
}

/* status route: real Code.js requestStatusRoute_ over stub receipts */
{
  function grab(source, name) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, 'missing ' + name);
    const end = source.indexOf('\nfunction ', start + 10);
    return source.slice(start, end < 0 ? source.length : end);
  }
  const shared = {};
  function stSheet(rows) {
    return {
      rows, getLastRow: () => rows.length, getMaxRows: () => 1000, insertRowsAfter: () => {}, hideSheet: () => {},
      getRange: (r, c, n = 1, w = 1) => ({
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] || '')),
        setValues: (v) => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); },
        createTextFinder: (key) => ({
          matchEntireCell() { return this; }, matchCase() { return this; },
          findAll: () => rows.map((row, i) => ({ row, i })).filter((x) => x.i >= r - 1 && x.i < r - 1 + n && x.row[c - 1] === key).map((x) => ({ getRow: () => x.i + 1 })),
        }),
      }),
    };
  }
  const K = (rid) => crypto.createHash('sha256').update(JSON.stringify(['db', '9940659bd83035d7', 'buyer@valley.test', 'save_valley_purchasing_costing', rid])).digest('hex');
  const mk = (rid, state, resp) => [K(rid), rid, 'buyer@valley.test', 'save_valley_purchasing_costing', 'h', state, resp, new Date().toISOString(), new Date().toISOString()];
  const sheet = stSheet([['request_key', 'request_id', 'user_email', 'module_action', 'payload_hash', 'state', 'response_json', 'created_at', 'updated_at'],
    mk('req-done-0000000001', 'done', JSON.stringify({ status: 'success', record: { Code: 'P-1' } })),
    mk('req-fail-0000000001', 'failed', JSON.stringify({ status: 'error', code: 'REQUEST_NOT_APPLIED', notApplied: true })),
    mk('req-pend-0000000001', 'pending', ''), mk('req-old-00000000001', 'uncertain', '')]);
  sheet.rows[4][7] = new Date(Date.now() - 20 * 60000).toISOString();
  const ctx = {
    console,
    COMPANY_REGISTRY: { '9940659bd83035d7': {} },
    requestGuardIsWrite_: (a) => !/^(get_|list_|prefetch_|preview_|search_|check_|validate_|export_|lookup_|ping$)/.test(String(a || '')),
    getSpreadsheet_: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
    resolveDbId_: (u, p) => {
      if (u.company !== p.target_system && !u.isSuperAdmin) throw new Error('denied');
      return 'db';
    },
    Utilities: { DigestAlgorithm: { SHA_256: 'x' }, Charset: { UTF_8: 'y' }, computeDigest: () => [] },
  };
  ctx.Utilities.computeDigest = (a, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest());
  vm.createContext(ctx);
  const hStart = CODE.indexOf('var REQUEST_RECEIPT_HEADERS_');
  assert(hStart !== -1, 'receipt headers located');
  const hEnd = CODE.indexOf(';\n', hStart);
  vm.runInContext(
    CODE.slice(hStart, hEnd + 1) + '\n' +
    grab(CODE, 'requestGuardHash_') + '\n' + grab(CODE, 'requestGuardSheet_') + '\n' +
    grab(CODE, 'requestGuardFind_') + '\n' + grab(CODE, 'requestStatusRoute_'), ctx);
  const AU = { email: 'buyer@valley.test', company: '9940659bd83035d7' };
  const st = (rid, u) => ctx.requestStatusRoute_({ target_system: '9940659bd83035d7', module_action: 'save_valley_purchasing_costing', request_id: rid }, '', u || AU);
  const done = st('req-done-0000000001');
  check(done.status === 'done' && done.result.record.Code === 'P-1', 'done returns the stored result');
  const failedR = st('req-fail-0000000001');
  check(failedR.status === 'failed' && failedR.error.code === 'REQUEST_NOT_APPLIED', 'failed returns the stored refusal');
  const pend = st('req-pend-0000000001');
  check(pend.status === 'pending' && pend.retryAfterMs === 1500, 'fresh pending tells the client when to recheck');
  const old = st('req-old-00000000001');
  check(old.status === 'review_required', 'stale/uncertain requires review, never auto-mutation');
  const unknown = st('req-never-seen-000001');
  check(unknown.status === 'unknown' && unknown.retryable === true, 'unknown receipt is safely retryable');
  const other = st('req-done-0000000001', { email: 'stranger@x.test', company: '9940659bd83035d7' });
  check(other.status === 'unknown', 'another user learns nothing (no oracle)');
}

console.log(failed === 0 ? '\nvf_purchasing_recovery: PASS (failure injection across every interruption boundary)' : '\n' + failed + ' FAILURE(S)');
process.exitCode = failed === 0 ? 0 : 1;
