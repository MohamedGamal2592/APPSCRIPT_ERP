/**
 * VF-MFG-REQUEST-RECOVERY — uncertain-save repair for save_valley_mfg_order.
 *
 * Drives the REAL manufacturing save (extracted from
 * Company_ValleyFoods_Actions.js) plus the REAL stock authority
 * (vfBatchBalance_/vfCurrentProducts_) and the REAL order-full reader over
 * fake Sheets, then fault-injects every interruption boundary with a
 * same-request retry:
 *
 *  boundaries: validation refusal, stale/missing edit token, foreign child
 *  UID, unresolved competing request, checkpoint failure before mutation,
 *  complete save with lost response (legacy receipt), interruption after
 *  header / outputs / work-ops, explicit new child, omitted vs explicitly
 *  empty optional sections, malformed recovery envelope.
 *
 * Proves: unchanged edits preserve output/footer/work-op/by-product
 * unique_id + numeric id + created_at; stale/missing tokens and proven
 * pre-mutation failures finalize not-applied with zero business writes;
 * deterministic UIDs converge retries with no duplicates; legacy uncertain
 * receipts recover only on exact desired-state match and otherwise stay
 * review-required with zero writes; header arrays stay byte-identical.
 *
 * Nothing here touches a spreadsheet, a Google service or the network.
 *
 * Run: node tools/verify/vf_mfg_request_recovery.js
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
const LIST_PAGE = read('Company_ValleyFoods_MfgOrders.html');
const DETAIL_PAGE = read('Company_ValleyFoods_MfgOrderView.html');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + String(extra).slice(0, 400)); }
}

/* ══ static contracts over the real source ═══════════════════════════ */
function parseArrLiteral(src, name) {
  const m = src.match(new RegExp('(?:const|var)\\s+' + name + '\\s*=\\s*(\\[[^\\]]*\\])'));
  assert(m, name + ' literal not found');
  return JSON.parse(m[1].replace(/'/g, '"'));
}
const EXP_MFG_ORDER = ['unique_id', 'id', 'transaction_code', 'transaction_type', 'code', 'operation_type', 'shift', 'by_product_nrv_value', 'total_inventory_cost', 'total_other_cost', 'total_batch_cost', 'manufacture_date', 'produced_product', 'product_category', 'manufactured_qty', 'expected_qty', 'actual_qty', 'manufacture_internal_batch', 'manufacture_batch', 'user', 'created_at', 'mo_status', 'abnormal_amount', 'production_approval', 'production_approval_time', 'quality_approval', 'quality_approval_time', 'recipe_id'];
const EXP_MFG_OUTPUT = ['unique_id', 'id', 'valley_manufacture_header_id', 'product_id', 'product_name', 'product_qty', 'cost_unit', 'total_cost', 'user', 'created_at'];
const EXP_MFG_CONS = ['unique_id', 'id', 'valley_manufacture_header_product_id', 'item', 'item_code', 'qty', 'cost_unit', 'total_cost', 'created_at', 'user'];
const EXP_MFG_WO = ['unique_id', 'id', 'valley_manufacture_header_id', 'work_center_sequence', 'recipe_id', 'operation_status', 'start_time', 'end_time', 'notes', 'actual_hours', 'work_center_cost', 'total_cost', 'last_pause_time', 'total_pause_duration', 'user', 'created_at'];
const EXP_MFG_BP = ['unique_id', 'id', 'valley_manufacture_header_id', 'code', 'manufacture_date', 'transaction_code', 'item', 'qty', 'total_cost', 'manufacture_internal_batch', 'user', 'created_at'];
check(JSON.stringify(parseArrLiteral(SRC, 'MFG_ORDER_HEADERS')) === JSON.stringify(EXP_MFG_ORDER), 'MFG_ORDER_HEADERS byte-identical membership/order');
check(JSON.stringify(parseArrLiteral(SRC, 'MFG_OUTPUT_HEADERS')) === JSON.stringify(EXP_MFG_OUTPUT), 'MFG_OUTPUT_HEADERS byte-identical membership/order');
check(JSON.stringify(parseArrLiteral(SRC, 'MFG_CONSUMPTION_HEADERS')) === JSON.stringify(EXP_MFG_CONS), 'MFG_CONSUMPTION_HEADERS byte-identical membership/order');
check(JSON.stringify(parseArrLiteral(SRC, 'MFG_WORKOP_HEADERS')) === JSON.stringify(EXP_MFG_WO), 'MFG_WORKOP_HEADERS byte-identical membership/order');
check(JSON.stringify(parseArrLiteral(SRC, 'MFG_BYPRODUCT_HEADERS')) === JSON.stringify(EXP_MFG_BP), 'MFG_BYPRODUCT_HEADERS byte-identical membership/order');
['last_request_id', 'operation_state', 'operation_stage', 'updated_by', 'line_generation'].forEach((bad) => {
  check(EXP_MFG_ORDER.indexOf(bad) === -1 && EXP_MFG_OUTPUT.indexOf(bad) === -1 && EXP_MFG_CONS.indexOf(bad) === -1,
    'no forbidden marker column ' + bad + ' in manufacturing headers');
});
check(/requestRecovery_[\s\S]*?save_valley_mfg_order/.test(SRC), 'save_valley_mfg_order registered for request-id recovery');
check(SRC.indexOf('function mfgEditToken_(') !== -1, 'mfgEditToken_ helper exists');
check(SRC.indexOf('function mfgDeterministicUid_(') !== -1, 'mfgDeterministicUid_ helper exists');
check(SRC.indexOf('function mfgDesiredMatches_(') !== -1, 'mfgDesiredMatches_ comparator exists');
check(SRC.indexOf('function mfgAssertMfgSchema_(') !== -1, 'mfgAssertMfgSchema_ read-only gate exists');
check(['MFG_ORDER_SHEET', 'MFG_ORDER_PRODUCTS_SHEET', 'MFG_CONSUMPTION_SHEET', 'BP_SHEET'].every((name) =>
  SRC.indexOf('mfgNextIntegerId_(dbId, ' + name + ')') !== -1),
  'header/products/footer/by-product inserts use the MO integer max+1 allocator');
check(SRC.indexOf('mfgNextIntegerId_(dbId, MFG_BYPRODUCT_SHEET)') !== -1,
  'standalone by-product insert uses the MO integer max+1 allocator');
(function () {
  const at = SRC.indexOf('function saveValleyMfgOrder_(');
  const end = SRC.indexOf('function approveValleyMfgOrder_(', at);
  const body = SRC.slice(at, end);
  check(body.indexOf('settingsEnsureSheet_(') === -1, 'save path performs no schema-mutating setup');
  check(/START[\s\S]{0,60}executeWithLock_/.test(body) || (body.match(/executeWithLock_\(/g) || []).length === 1,
    'save holds one outer lock with no nested re-lock');
})();
check(CODE.indexOf('priorRecovery') !== -1 && CODE.indexOf('findOpenEntity') !== -1 && CODE.indexOf('checkpoint') !== -1,
  'request guard exposes checkpoint/priorRecovery/findOpenEntity');
check(LIST_PAGE.indexOf('uid: o.uid') !== -1, 'list-page save submits output UIDs');
check(LIST_PAGE.indexOf('base_token: MFG_EDIT_TOKEN') !== -1, 'list-page save submits base_token');
check(DETAIL_PAGE.indexOf('base_token: MFG_EDIT_TOKEN') !== -1, 'detail-page save submits base_token');
check(DETAIL_PAGE.indexOf("var oldUid = oldUidByBatch[String(r.batch_uid || '')] || ''") !== -1,
  'detail batch modal preserves the existing footer UID by batch');
check(DETAIL_PAGE.indexOf("rememberDeleted_('consumption', f.uid)") !== -1 && LIST_PAGE.indexOf("rememberDeleted_('consumption'") !== -1,
  'both MO editors send explicit footer deletions');
check(SRC.indexOf("deleteRowsWhereIn_(sheetOut, 'unique_id', deletedOutUids)") !== -1 &&
  SRC.indexOf("deleteRowsWhereIn_(sheetCons, 'unique_id', cascadeConsDeletes)") !== -1,
  'server deletes MO children only from explicit UID lists');
check(SRC.indexOf("edit_token: mfgEditToken_") !== -1, 'load endpoints return edit_token');
check(/reconcileReplayUsed/.test(read('Client_Helpers.html')), 'client performs at most one same-ID reconciliation replay');
check(/RECOVER_POLL_MS_\s*=\s*\[[^\]]+\]/.test(read('Client_Helpers.html')), 'client status poll stays on a bounded budget');

/* ══ fake Sheets ═════════════════════════════════════════════════════ */
function makeSheet(name, headers, fail) {
  const grid = [headers.slice()];
  const sh = {
    __name: name, __grid: grid, __fail: fail || {},
    getName: () => name,
    getParent: () => ({ getId: () => 'ss' }),
    getSheetByName: () => null,
    getSheetId: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getMaxRows: () => Math.max(1000, grid.length + 10),
    insertRowsAfter: () => {},
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => grid.map((r) => r.slice()) }),
    getRange: (row, col, nRows, nCols) => {
      const nr = nRows || 1, nc = nCols || 1;
      return {
        getValues: () => {
          const out = [];
          for (let r = 0; r < nr; r++) {
            const src = grid[row - 1 + r] || [];
            const line = [];
            for (let c = 0; c < nc; c++) line.push(src[col - 1 + c] === undefined ? '' : src[col - 1 + c]);
            out.push(line);
          }
          return out;
        },
        getFormulas: () => [new Array(nc).fill('')],
        setValues: (v) => {
          if (sh.__fail.setValues > 0) { sh.__fail.setValues--; throw new Error('injected setValues failure on ' + name); }
          (v || []).forEach((r, i) => {
            const at = row - 1 + i;
            while (grid.length <= at) grid.push(new Array(grid[0].length).fill(''));
            for (let j = 0; j < r.length; j++) grid[at][col - 1 + j] = r[j];
          });
        },
        setValue: (v) => {
          if (sh.__fail.setValues > 0) { sh.__fail.setValues--; throw new Error('injected setValue failure on ' + name); }
          const at = row - 1;
          while (grid.length <= at) grid.push(new Array(grid[0].length).fill(''));
          grid[at][col - 1] = v;
        },
        setFormula: function (v) { return this.setValue(v); },
      };
    },
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

/* ══ sandbox: real Code.js + real manufacturing block ═══════════════ */
const MFG_START = SRC.indexOf("  const MFG_ORDER_SHEET = 'valley_manufacture_header';");
const MFG_END = SRC.indexOf('  function approveValleyMfgOrder_(', MFG_START);
assert(MFG_START !== -1 && MFG_END > MFG_START, 'manufacturing block not located');
const BAL_START = SRC.indexOf('  function vfCurrentProducts_(');
const BAL_END = SRC.indexOf('  /* ---------- P2: batch availability for a product ----------', BAL_START);
assert(BAL_START !== -1 && BAL_END > BAL_START, 'stock-authority block not located');
const FIND_START = SRC.indexOf('  function vfFindRowByUid_(');
const FIND_END = SRC.indexOf('  /* ---------- PC: BY-PRODUCTS', FIND_START);
assert(FIND_START !== -1 && FIND_END > FIND_START, 'order-full reader block not located');
const PAGE_START = SRC.indexOf('  function vfDateBound_(');
const PAGE_END = SRC.indexOf('  function getValleyMfgOrderFull_(', PAGE_START);
assert(PAGE_START !== -1 && PAGE_END > PAGE_START, 'list-paging block not located');

function makeWorld() {
  const SS = makeSS();
  SS.insertSheet('valley_manufacture_header', EXP_MFG_ORDER.slice());
  SS.insertSheet('valley_manufacture_header_products', EXP_MFG_OUTPUT.slice());
  SS.insertSheet('valley_manufacture_footer', EXP_MFG_CONS.slice());
  SS.insertSheet('valley_manufacture_work_center', EXP_MFG_WO.slice());
  SS.insertSheet('valley_manufacture_by_product', EXP_MFG_BP.slice());
  SS.insertSheet('valley_current_products', ['unique_id', 'product_id', 'product', 'unit', 'transaction_date', 'transaction_code', 'current_qty', 'unit_cost']);
  SS.insertSheet('valley_products', ['id', 'name_ar', 'category']);
  SS.insertSheet('valley_product_recipe_footer', ['valley_product_recipe_id', 'work_center_id', 'sequence']);
  SS.insertSheet('valley_employee_shift_schedule', ['shift_unique_id', 'shift_name', 'shift_type', 'shift_start_time', 'shift_end_time', 'is_active']);
  let uuidN = 0;
  const sb = {
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: (n) => SS.getSheetByName(n), insertSheet: (n) => SS.insertSheet(n, []) }),
      flush: () => {},
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => 'uuid-' + String(uuidN++).padStart(4, '0') + '-0000-0000-000000000000',
      formatDate: (d) => {
        const p = (n) => ('0' + n).slice(-2);
        const dd = (d instanceof Date) ? d : new Date(d);
        return dd.getFullYear() + '-' + p(dd.getMonth() + 1) + '-' + p(dd.getDate());
      },
      sleep: () => {},
      computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
    },
    Session: { getScriptTimeZone: () => 'Africa/Cairo', getActiveUser: () => ({ getEmail: () => '' }) },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, getAll: () => ({}), putAll: () => {}, removeAll: () => {} }),
      getUserCache: () => ({ get: () => null, put: () => {}, remove: () => {} }),
      getDocumentCache: () => ({ get: () => null, put: () => {}, remove: () => {} }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }), getUserProperties: () => ({ getProperty: () => null }) },
    Logger: { log: () => {} },
    ScriptApp: { getProjectTriggers: () => [] },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(CODE, sb, { filename: 'Code.js' });
  vm.runInContext(SRC, sb, { filename: 'Company_ValleyFoods_Actions.js' });
  vm.runInContext(
    "getSpreadsheet_ = function () { return { getSheetByName: function (n) { return SpreadsheetApp.openById('x').getSheetByName(n); }, getId: function () { return 'ss'; } }; };" +
    "getSheet_ = function (n) { var s = SpreadsheetApp.openById('x').getSheetByName(n);" +
    " if (!s) throw new Error('no sheet ' + n); return s; };", sb);
  const env = {
    parseDate_: function (v) {
      if (v == null || v === '') return '';
      if (v instanceof Date) return v;
      const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return new Date(v);
    },
    vfNotApplied_: function (message) { const e = new Error(message); e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED'; throw e; },
    vfCanSeeCost_: () => true,
    vfStripCost_: () => {},
    vfStripCostAll_: () => {},
    vfFlush_: () => {},
    finBustRefs_: () => {},
    finRefsCached_: (db, k, fn) => fn(),
    mfgWorkCenterOptions_: () => [],
    getValleyMfgWorkOps_: () => ({ status: 'success', workops: [] }),
    getValleyMfgByproducts_: () => ({ status: 'success', byproducts: [] }),
    VF_COST_KEYS: { mfg_order: [], mfg_output: [], mfg_footer: [], mfg_bp: [], batch: [] },
    FIN_PRODUCTS_SHEET: 'valley_products',
    FIN_CATEGORIES_SHEET: 'valley_categories',
    FIN_SALES_LINES_SHEET: 'valley_sales_lines',
    MFG_RECIPE_SHEET: 'valley_product_recipe',
    MFG_RECIPE_FOOTER_SHEET: 'valley_product_recipe_footer',
    MFG_WORKOPS_SHEET: 'valley_manufacture_work_center',
    MFG_BYPRODUCT_SHEET: 'valley_manufacture_by_product',
    logHistory_: () => {},
  };
  sb.__env = env;
  const factorySrc = '(function (env) { with (env) {\n' +
    SRC.slice(MFG_START, MFG_END) + '\n' +
    SRC.slice(BAL_START, BAL_END) + '\n' +
    SRC.slice(FIND_START, FIND_END) + '\n' +
    SRC.slice(PAGE_START, PAGE_END) +
    '\n return { save: saveValleyMfgOrder_, token: mfgEditToken_, det: mfgDeterministicUid_,' +
    ' scope: mfgScopeFor_, match: mfgDesiredMatches_, current: mfgCurrentMfgState_,' +
    ' full: getValleyMfgOrderFull_, detail: getValleyMfgOrderDetail_, schema: mfgAssertMfgSchema_, balance: vfBatchBalance_, orders: getValleyMfgOrders_ }; } })';
  const H = vm.runInContext(factorySrc, sb, { filename: 'mfg-slice.js' })(env);
  return { sb, SS, env, H };
}

const USER = { email: 'op@valley.test', name: 'Op', company: '9940659bd83035d7' };
function seedRow(SS, sheet, obj) {
  const sh = SS.getSheetByName(sheet);
  const h = sh.__grid[0];
  const row = new Array(h.length).fill('');
  Object.keys(obj).forEach((k) => { const i = h.indexOf(k); if (i !== -1) row[i] = obj[k]; });
  sh.__grid.push(row);
}
function seedWorld(W) {
  seedRow(W.SS, 'valley_current_products', { unique_id: 'BATCH-A', product_id: 'RM1', product: 'خامة', unit: 'كجم', transaction_date: '2026-09-01', transaction_code: 'LOT-A', current_qty: 1000, unit_cost: 5 });
  seedRow(W.SS, 'valley_products', { id: 'P1', name_ar: 'صنف 1', category: 'CAT' });
  seedRow(W.SS, 'valley_product_recipe_footer', { valley_product_recipe_id: 'R1', work_center_id: 'WC1', sequence: 1 });
  seedRow(W.SS, 'valley_employee_shift_schedule', { shift_unique_id: 'SH-1', shift_name: 'وردية الاختبار 1', shift_type: 'Fixed Shift', shift_start_time: '08:00', shift_end_time: '16:00', is_active: true });
  seedRow(W.SS, 'valley_employee_shift_schedule', { shift_unique_id: 'SH-2', shift_name: 'وردية الاختبار 2', shift_type: 'Variable Shift', shift_start_time: '16:00', shift_end_time: '00:00', is_active: true });
  seedRow(W.SS, 'valley_employee_shift_schedule', { shift_unique_id: 'SH-3', shift_name: 'وردية موقوفة', shift_type: 'Fixed Shift', shift_start_time: '00:00', shift_end_time: '08:00', is_active: false });
}
function basePayload(over) {
  const d = {
    manufacture_date: '2026-09-10', operation_type: 'تصنيع وتعبئة', shift: 'SH-1',
    produced_product_id: 'P1', manufactured_qty: 100, actual_qty: 90, recipe_id: 'R1',
    manufacture_batch: 'B-1', mo_status: 'Draft',
    outputs: [{ product_id: 'P1', qty: 10, footers: [{ item: 'BATCH-A', qty: 10 }] }],
    consumption: [],
    work_ops: [{ work_center_id: 'WC1', operation_status: 'Pending', notes: 'n1' }],
    byproducts: [{ item: 'BP1', qty: 2 }],
    deleted_uids: { outputs: [], consumption: [], work_ops: [], byproducts: [] },
  };
  return Object.assign(d, over || {});
}
function guardCtx(W, reqId, data, over) {
  const clean = JSON.parse(JSON.stringify(data));
  const hash = W.sb.requestGuardHash_(W.sb.requestGuardCanonical_(clean));
  const g = {
    requestId: reqId, payloadHash: hash, recovering: false, priorState: '',
    userEmail: USER.email, moduleAction: 'save_valley_mfg_order',
    priorRecovery: null, stages: [],
    checkpoint: function (rec) {
      if (g.failCheckpoint) throw new Error('injected checkpoint failure');
      const sized = JSON.stringify({ status: 'pending', recovery: rec });
      if (sized.length > 5000) throw new Error('Recovery checkpoint too large');
      if (!rec || rec.type !== 'vf_mfg_order_save_v1' || !rec.mo_uid || !rec.stage) throw new Error('bad envelope');
      g.stages.push(rec.stage);
      if (g.failAfterStage === rec.stage) throw new Error('injected checkpoint failure after ' + rec.stage);
      return true;
    },
    findOpenEntity: function () { return g.openConflict || ''; },
  };
  return Object.assign(g, over || {});
}
function invoke(W, fn, data, user, guard) {
  W.sb.rearmRecordCache_();
  try {
    return { result: W.H[fn](data, user || USER, 'db', guard) };
  } catch (e) { return { error: e }; }
}
function rowsByUid(W, sheet, parentCol, parentUid) {
  const sh = W.SS.getSheetByName(sheet);
  const h = sh.__grid[0];
  const out = {};
  sh.__grid.forEach((r, i) => {
    if (!i) return;
    const o = {};
    h.forEach((k, ci) => { o[k] = r[ci]; });
    if (parentCol && String(o[parentCol] || '') !== String(parentUid)) return;
    if (o.unique_id !== undefined && o.unique_id !== '') out[String(o.unique_id)] = o;
  });
  return out;
}
function counts(W) {
  const n = (s) => W.SS.getSheetByName(s).__grid.length - 1;
  return {
    header: n('valley_manufacture_header'), outputs: n('valley_manufacture_header_products'),
    cons: n('valley_manufacture_footer'), wo: n('valley_manufacture_work_center'), bp: n('valley_manufacture_by_product'),
  };
}
function snapshot(W) { return JSON.stringify(W.SS.sheets, (k, v) => (k === '__fail' ? undefined : v)); }
const REQ = (c) => String(c).repeat(24);

/* ══ behavioral proofs ═════════════════════════════════════════════ */
(function () {
  // 3. create new MO: one deterministic UID per genuinely new row.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('a');
  const p = basePayload();
  const g = guardCtx(W, R1, p);
  const r = invoke(W, 'save', p, USER, g);
  check(r.result && r.result.status === 'success', 'create new MO succeeds', JSON.stringify(r.error && r.error.message));
  const moUid = r.result && r.result.mo_uid;
  check(moUid === W.H.det(R1, 'new', 'mo', 0), 'new MO UID is deterministic per request ID', moUid);
  const c = counts(W);
  check(c.header === 1 && c.outputs === 1 && c.cons === 1 && c.wo === 1 && c.bp === 1, 'one row per section on create', JSON.stringify(c));
  check(g.stages.join(',') === 'validated,header,outputs,consumption,work_ops,byproducts,complete', 'checkpoints advance through every stage', g.stages.join(','));
  const outs = rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid);
  const oUid = Object.keys(outs)[0];
  check(oUid === W.H.det(R1, moUid, 'output', 0), 'new output UID deterministic', oUid);
  const conss = rowsByUid(W, 'valley_manufacture_footer', null, null);
  const fUid = Object.keys(conss)[0];
  check(fUid === W.H.det(R1, moUid, 'footer', 0), 'new footer UID deterministic', fUid);
  const hdr = rowsByUid(W, 'valley_manufacture_header', null, null)[moUid];
  const bp = rowsByUid(W, 'valley_manufacture_by_product', 'valley_manufacture_header_id', moUid);
  const firstIds = [hdr && hdr.id, outs[oUid] && outs[oUid].id, conss[fUid] && conss[fUid].id, bp[Object.keys(bp)[0]] && bp[Object.keys(bp)[0]].id];
  check(firstIds.every((v) => Number.isInteger(Number(v)) && Number(v) === 1),
    'first header/product/footer/by-product rows receive integer id 1', JSON.stringify(firstIds));
  // load endpoint returns a token that verifies against persisted state.
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {});
  check(full.result && full.result.edit_token && Array.isArray(full.result.save_scope), 'order-full returns edit_token + save_scope');
  check(full.result && full.result.edit_token === W.H.token('db', moUid, ['header', 'outputs', 'consumption']), 'returned token matches recomputed token');
  const detail = invoke(W, 'detail', { mo_uid: moUid }, USER, {});
  check(detail.result && detail.result.outputs.every((o) => !Object.prototype.hasOwnProperty.call(o, 'batches')),
    'detail response does not embed the material batch catalog',
    JSON.stringify(detail.error && (detail.error.stack || detail.error.message || detail.error)));
})();

(function () {
  // Temporary UI rows with no selected reference are not business records.
  const W = makeWorld(); seedWorld(W);
  const p = basePayload({
    work_ops: [{ uid: '', work_center_id: '', operation_status: 'Pending', notes: '' }],
    byproducts: [{ uid: '', item: '', qty: '', transaction_code: '' }],
  });
  const r = invoke(W, 'save', p, USER, guardCtx(W, REQ('p'), p));
  const moUid = r.result && r.result.mo_uid;
  check(r.result && r.result.status === 'success', 'blank optional placeholders do not block the MO save', r.error && r.error.message);
  check(Object.keys(rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid)).length === 0,
    'blank work-centre placeholder is not persisted');
  check(Object.keys(rowsByUid(W, 'valley_manufacture_by_product', 'valley_manufacture_header_id', moUid)).length === 0,
    'blank by-product placeholder is not persisted');
})();

(function () {
  // 4. unchanged edit from either editor preserves every child identity.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('b');
  const first = invoke(W, 'save', basePayload(), USER, guardCtx(W, R1, basePayload()));
  const moUid = first.result.mo_uid;
  const before = {
    out: rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid),
    con: rowsByUid(W, 'valley_manufacture_footer', null, null),
    wo: rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid),
    bp: rowsByUid(W, 'valley_manufacture_by_product', 'valley_manufacture_header_id', moUid),
  };
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const R2 = REQ('c');
  const woRows = rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid);
  const bpRows = rowsByUid(W, 'valley_manufacture_by_product', 'valley_manufacture_header_id', moUid);
  const wUid = Object.keys(woRows)[0], bUid = Object.keys(bpRows)[0];
  const edit = basePayload({
    mo_uid: moUid, base_token: full.edit_token, save_scope: full.save_scope,
    outputs: full.outputs.map((o) => ({ uid: o.unique_id, product_id: o.product_id, qty: o.product_qty, footers: (o.footers || []).map((f) => ({ uid: f.unique_id, item: f.item, qty: f.qty })) })),
    work_ops: [{ uid: wUid, work_center_id: 'WC1', operation_status: 'Pending', notes: 'n1' }],
    byproducts: [{ uid: bUid, item: 'BP1', qty: 2 }],
  });
  const g2 = guardCtx(W, R2, edit);
  const r2 = invoke(W, 'save', edit, USER, g2);
  check(r2.result && r2.result.status === 'success', 'unchanged edit succeeds', JSON.stringify(r2.error && r2.error.message));
  const after = {
    out: rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid),
    con: rowsByUid(W, 'valley_manufacture_footer', null, null),
    wo: rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid),
    bp: rowsByUid(W, 'valley_manufacture_by_product', 'valley_manufacture_header_id', moUid),
  };
  check(JSON.stringify(Object.keys(after.out)) === JSON.stringify(Object.keys(before.out)), 'output UIDs preserved (no replacement rows)');
  check(JSON.stringify(Object.keys(after.con)) === JSON.stringify(Object.keys(before.con)), 'footer UIDs preserved (no replacement rows)');
  const k = Object.keys(before.out)[0];
  check(after.out[k] && String(after.out[k].id) === String(before.out[k].id) && String(after.out[k].created_at) === String(before.out[k].created_at),
    'output numeric id + created_at untouched');
  const kf = Object.keys(before.con)[0];
  check(after.con[kf] && String(after.con[kf].id) === String(before.con[kf].id) && String(after.con[kf].created_at) === String(before.con[kf].created_at),
    'footer numeric id + created_at untouched');
  check(JSON.stringify(Object.keys(after.wo)) === JSON.stringify(Object.keys(before.wo)), 'work-op identities preserved when section omitted');
  check(JSON.stringify(Object.keys(after.bp)) === JSON.stringify(Object.keys(before.bp)), 'by-product identities preserved when section omitted');
  check(String(after.wo[wUid].id) === String(before.wo[wUid].id) && String(after.wo[wUid].created_at) === String(before.wo[wUid].created_at), 'work-op numeric id + created_at untouched');
  check(String(after.bp[bUid].id) === String(before.bp[bUid].id) && String(after.bp[bUid].created_at) === String(before.bp[bUid].created_at), 'by-product numeric id + created_at untouched');
})();

(function () {
  // Live regression: retain the 45,477 footer identity and insert only the
  // newly-added 1,183 allocation needed to reach product_qty 46,660.
  const W = makeWorld(); seedWorld(W);
  const cp = W.SS.getSheetByName('valley_current_products');
  const ch = cp.__grid[0];
  cp.__grid[1][ch.indexOf('current_qty')] = 50000;
  seedRow(W.SS, 'valley_current_products', { unique_id: 'BATCH-B', product_id: 'RM1', product: 'خامة', transaction_date: '2026-06-30', transaction_code: 'LOT-B', current_qty: 7630, unit_cost: 11.071 });
  const initial = basePayload({
    manufactured_qty: 46660, actual_qty: 46660,
    outputs: [{ product_id: 'P1', qty: 46660, footers: [{ item: 'BATCH-A', qty: 46660 }] }],
  });
  const created = invoke(W, 'save', initial, USER, guardCtx(W, REQ('live-a'), initial));
  const moUid = created.result && created.result.mo_uid;
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const oldFooter = full.outputs[0].footers[0];
  const before = rowsByUid(W, 'valley_manufacture_footer', null, null)[oldFooter.unique_id];
  const edit = basePayload({
    mo_uid: moUid, base_token: full.edit_token,
    manufactured_qty: 46660, actual_qty: 46660,
    outputs: [{
      uid: full.outputs[0].unique_id, product_id: 'P1', qty: 46660,
      footers: [
        { uid: oldFooter.unique_id, item: 'BATCH-A', qty: 45477 },
        { uid: '', item: 'BATCH-B', qty: 1183 },
      ],
    }],
  });
  delete edit.work_ops; delete edit.byproducts;
  const saved = invoke(W, 'save', edit, USER, guardCtx(W, REQ('live-b'), edit));
  const after = rowsByUid(W, 'valley_manufacture_footer', null, null);
  const kept = after[oldFooter.unique_id];
  check(saved.result && saved.result.status === 'success', '46,660 batch correction saves successfully', saved.error && saved.error.message);
  check(Object.keys(after).length === 2, 'batch correction inserts exactly one new footer row');
  check(kept && Number(kept.qty) === 45477 && String(kept.id) === String(before.id) && String(kept.created_at) === String(before.created_at),
    'existing 45,477 footer UID/id/created_at preserved in place');
  const addedUid = Object.keys(after).find((u) => u !== oldFooter.unique_id && Number(after[u].qty) === 1183);
  check(!!addedUid,
    'only the new 1,183 allocation receives a new UID');
  check(addedUid && Number.isInteger(Number(after[addedUid].id)) && Number(after[addedUid].id) === Number(before.id) + 1,
    'new footer receives the next auto-increment integer id');
})();

(function () {
  // 5/6. stale + missing tokens: zero business writes, proven not-applied.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('d');
  const first = invoke(W, 'save', basePayload(), USER, guardCtx(W, R1, basePayload()));
  const moUid = first.result.mo_uid;
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const snap = snapshot(W);
  const stale = basePayload({ mo_uid: moUid, base_token: 'deadbeefdeadbeef', outputs: [{ uid: Object.keys(rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid))[0], product_id: 'P1', qty: 10, footers: [] }] });
  // footers emptied here would orphan-delete; keep them so only the token is wrong.
  stale.outputs[0].footers = full.outputs[0].footers.map((f) => ({ uid: f.unique_id, item: f.item, qty: f.qty }));
  const rs = invoke(W, 'save', stale, USER, guardCtx(W, REQ('e'), stale));
  check(rs.error && rs.error.code === 'VERSION_CONFLICT' && rs.error.notApplied === true, 'stale token is VERSION_CONFLICT + notApplied', rs.error && rs.error.message);
  check(snapshot(W) === snap, 'stale token causes zero business writes');
  const missing = basePayload({ mo_uid: moUid, outputs: stale.outputs });
  const rm = invoke(W, 'save', missing, USER, guardCtx(W, REQ('f'), missing));
  check(rm.error && rm.error.notApplied === true, 'missing token is refresh-required + notApplied', rm.error && rm.error.message);
  check(snapshot(W) === snap, 'missing token causes zero business writes');
})();

(function () {
  // 7. deterministic preflight failures finalize not-applied, never uncertain.
  const W = makeWorld(); seedWorld(W);
  const bad = basePayload({ manufacture_date: '' });
  const r = invoke(W, 'save', bad, USER, guardCtx(W, REQ('g'), bad));
  check(r.error && r.error.notApplied === true, 'empty date is proven not-applied', r.error && r.error.message);
  check(JSON.stringify(counts(W)) === JSON.stringify({ header: 0, outputs: 0, cons: 0, wo: 0, bp: 0 }), 'pre-mutation refusal writes nothing');
  const bad2 = basePayload({ outputs: [{ product_id: 'P1', qty: 10, footers: [{ item: 'BATCH-A', qty: 4 }] }] });
  const r2 = invoke(W, 'save', bad2, USER, guardCtx(W, REQ('h'), bad2));
  check(r2.error && r2.error.notApplied === true, 'footer-sum mismatch is proven not-applied', r2.error && r2.error.message);
  const badShift = basePayload({ shift: 'SH-9' });
  const rs = invoke(W, 'save', badShift, USER, guardCtx(W, REQ('h2'), badShift));
  check(rs.error && rs.error.notApplied === true && /غير مسجلة أو غير مفعّلة/.test(rs.error.message), 'unknown shift ref is proven not-applied', rs.error && rs.error.message);
  const legacyShift = basePayload({ shift: 'وردية 1' });
  const rl = invoke(W, 'save', legacyShift, USER, guardCtx(W, REQ('h3'), legacyShift));
  check(rl.error && rl.error.notApplied === true, 'legacy free-text shift is refused (ref required)', rl.error && rl.error.message);
  const offShift = basePayload({ shift: 'SH-3' });
  const ro = invoke(W, 'save', offShift, USER, guardCtx(W, REQ('h4'), offShift));
  check(ro.error && ro.error.notApplied === true, 'inactive schedule row is refused', ro.error && ro.error.message);
  check(JSON.stringify(counts(W)) === JSON.stringify({ header: 0, outputs: 0, cons: 0, wo: 0, bp: 0 }), 'shift refusals write nothing');
})();

(function () {
  // MO-only schema compatibility: safe trailing business/audit columns survive
  // edits, while a moved canonical formula-addressed column fails pre-write.
  const W = makeWorld(); seedWorld(W);
  const initial = basePayload();
  const created = invoke(W, 'save', initial, USER, guardCtx(W, REQ('schema-a'), initial));
  const moUid = created.result.mo_uid;
  const hs = W.SS.getSheetByName('valley_manufacture_header');
  hs.__grid[0].push('custom_mo_note');
  hs.__grid[1].push('KEEP-ME');
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const edit = basePayload({
    mo_uid: moUid, base_token: full.edit_token, save_scope: full.save_scope,
    outputs: full.outputs.map((o) => ({
      uid: o.unique_id, product_id: o.product_id, qty: o.product_qty,
      footers: (o.footers || []).map((f) => ({ uid: f.unique_id, item: f.item, qty: f.qty })),
    })),
  });
  delete edit.work_ops; delete edit.byproducts;
  const saved = invoke(W, 'save', edit, USER, guardCtx(W, REQ('schema-b'), edit));
  check(saved.result && saved.result.status === 'success', 'safe trailing MO header column is accepted', saved.error && saved.error.message);
  check(hs.__grid[1][hs.__grid[0].indexOf('custom_mo_note')] === 'KEEP-ME', 'trailing MO header value survives formula-safe patch');

  const W2 = makeWorld(); seedWorld(W2);
  const h2 = W2.SS.getSheetByName('valley_manufacture_header').__grid[0];
  const oi = h2.indexOf('operation_type'), si = h2.indexOf('shift');
  const tmp = h2[oi]; h2[oi] = h2[si]; h2[si] = tmp;
  const bad = basePayload();
  const refused = invoke(W2, 'save', bad, USER, guardCtx(W2, REQ('schema-c'), bad));
  check(refused.error && refused.error.notApplied === true && /موضع غير صحيح/.test(refused.error.message),
    'misordered canonical MO header is refused with exact diagnostic', refused.error && refused.error.message);
  check(counts(W2).header === 0 && counts(W2).outputs === 0 && counts(W2).cons === 0, 'schema refusal performs zero MO writes');

  // The live layout has recipe_id before the later audit/status/approval tail.
  // Those fields are all name-mapped; their order must not blank the list/detail
  // pages or reject an otherwise safe save.
  const W3 = makeWorld(); seedWorld(W3);
  const h3 = W3.SS.getSheetByName('valley_manufacture_header').__grid[0];
  h3.splice(20, 0, h3.splice(h3.indexOf('recipe_id'), 1)[0]);
  const liveLayoutPayload = basePayload();
  const accepted = invoke(W3, 'save', liveLayoutPayload, USER, guardCtx(W3, REQ('schema-d'), liveLayoutPayload));
  check(accepted.result && accepted.result.status === 'success', 'name-mapped MO tail may use the live column order', accepted.error && accepted.error.message);
  const acceptedRow = rowsByUid(W3, 'valley_manufacture_header', null, null)[accepted.result && accepted.result.mo_uid];
  check(acceptedRow && acceptedRow.recipe_id === 'R1' && acceptedRow.mo_status === 'Draft', 'live-order tail values land under their named headers');

  // A legacy/imported child sheet may retain one unnamed column at the far
  // right. It is outside the table contract and must not blank the detail page.
  const W4 = makeWorld(); seedWorld(W4);
  const created4 = invoke(W4, 'save', basePayload(), USER, guardCtx(W4, REQ('schema-e'), basePayload()));
  W4.SS.getSheetByName('valley_manufacture_header_products').__grid[0].push('');
  W4.SS.getSheetByName('valley_manufacture_header_products').__grid[1].push('');
  const loaded4 = invoke(W4, 'full', { mo_uid: created4.result.mo_uid }, USER, {});
  check(loaded4.result && loaded4.result.order, 'trailing blank child header is ignored on detail load', loaded4.error && loaded4.error.message);

  // All MO child tables may carry the legacy audit tail in either order, plus
  // a retained unnamed column at the far right.
  const W5 = makeWorld(); seedWorld(W5);
  const p5 = basePayload();
  const created5 = invoke(W5, 'save', p5, USER, guardCtx(W5, REQ('schema-f'), p5));
  [
    ['valley_manufacture_header_products', 8, 9],
    ['valley_manufacture_footer', 8, 9],
    ['valley_manufacture_work_center', 14, 15],
    ['valley_manufacture_by_product', 10, 11],
  ].forEach(([name, a, b]) => {
    const sh = W5.SS.getSheetByName(name);
    const t = sh.__grid[0][a]; sh.__grid[0][a] = sh.__grid[0][b]; sh.__grid[0][b] = t;
    sh.__grid[0].push('');
    sh.__grid.slice(1).forEach((row) => row.push(''));
  });
  const loaded5 = invoke(W5, 'full', { mo_uid: created5.result.mo_uid }, USER, {});
  check(loaded5.result && loaded5.result.order, 'all MO child audit tails may be reordered', loaded5.error && loaded5.error.message);
  let schema5 = null;
  try { W5.H.schema('db', ['header', 'outputs', 'consumption', 'work_ops', 'byproducts']); schema5 = true; }
  catch (e) { schema5 = e; }
  check(schema5 === true, 'all MO child trailing blanks are ignored', schema5 && schema5.message);
})();

(function () {
  // 8/14. lost response after complete save (legacy receipt): recovered success, no second write.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('i');
  const p = basePayload();
  const first = invoke(W, 'save', p, USER, guardCtx(W, R1, p));
  const moUid = first.result.mo_uid;
  const snap = snapshot(W);
  const g = guardCtx(W, R1, p, { recovering: true, priorState: 'uncertain', priorRecovery: null });
  const r = invoke(W, 'save', Object.assign({ mo_uid: moUid }, p), USER, g);
  check(r.result && r.result.status === 'success' && r.result.recovered === true, 'legacy exact match returns recovered success', JSON.stringify((r.result || r.error) && (r.result || r.error.message)));
  check(snapshot(W) === snap, 'recovered success performs no business write');
})();

(function () {
  // 9. interruption after header resumes the same request with no duplicates.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('j');
  seedRow(W.SS, 'valley_manufacture_header', { unique_id: 'MO-PART', id: 7, operation_type: 'تصنيع وتعبئة', shift: 'وردية 1', manufacture_date: '2026-09-10', produced_product: 'P1', manufactured_qty: 100, expected_qty: 65, actual_qty: 90, recipe_id: 'R1', manufacture_batch: 'B-1', mo_status: 'Draft', transaction_type: 'التصنيع الداخلي', user: USER.email });
  const p = basePayload({ mo_uid: 'MO-PART' });
  const env = { type: 'vf_mfg_order_save_v1', request_id: R1, payload_hash: W.sb.requestGuardHash_(W.sb.requestGuardCanonical_(JSON.parse(JSON.stringify(p)))), mo_uid: 'MO-PART', base_token: '', scope: ['header', 'outputs', 'consumption'], stage: 'header' };
  const g = guardCtx(W, R1, p, { recovering: true, priorState: 'uncertain', priorRecovery: env });
  const r = invoke(W, 'save', p, USER, g);
  check(r.result && r.result.status === 'success', 'resume after header converges', JSON.stringify(r.error && r.error.message));
  const c = counts(W);
  check(c.header === 1 && c.outputs === 1 && c.cons === 1, 'resume creates exactly one row per section, no duplicates', JSON.stringify(c));
})();

(function () {
  // 10/11. new child uses one deterministic UID across retries.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('k');
  const first = invoke(W, 'save', basePayload(), USER, guardCtx(W, R1, basePayload()));
  const moUid = first.result.mo_uid;
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const R2 = REQ('l');
  const edit = basePayload({
    mo_uid: moUid, base_token: full.edit_token,
    outputs: full.outputs.map((o) => ({ uid: o.unique_id, product_id: o.product_id, qty: o.product_qty, footers: (o.footers || []).map((f) => ({ uid: f.unique_id, item: f.item, qty: f.qty })) }))
      .concat([{ product_id: 'P1', qty: 5, footers: [{ item: 'BATCH-A', qty: 5 }] }]),
  });
  delete edit.work_ops; delete edit.byproducts; // list-page scope: optional sections omitted, left untouched
  const r2 = invoke(W, 'save', edit, USER, guardCtx(W, R2, edit));
  check(r2.result && r2.result.status === 'success', 'save with one explicit new child succeeds', JSON.stringify(r2.error && r2.error.message));
  const outs = rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid);
  check(Object.keys(outs).length === 2, 'exactly one new output row added');
  const newUid = Object.keys(outs).filter((u) => full.outputs.every((o) => o.unique_id !== u))[0];
  check(newUid === W.H.det(R2, moUid, 'output', 0), 'new child UID is deterministic', newUid);
  const snap = snapshot(W);
  const env = { type: 'vf_mfg_order_save_v1', request_id: R2, payload_hash: W.sb.requestGuardHash_(W.sb.requestGuardCanonical_(JSON.parse(JSON.stringify(edit)))), mo_uid: moUid, base_token: full.edit_token, scope: ['header', 'outputs', 'consumption'], stage: 'outputs' };
  const g3 = guardCtx(W, R2, edit, { recovering: true, priorState: 'uncertain', priorRecovery: env });
  const r3 = invoke(W, 'save', edit, USER, g3);
  check(r3.result && r3.result.status === 'success', 'retry of the same request recovers', JSON.stringify(r3.error && r3.error.message));
  check(snapshot(W) === snap, 'retry adds no duplicate child row');
})();

(function () {
  // 12. omitted optional section untouched; explicitly empty section keeps deliberate semantics.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('m');
  const first = invoke(W, 'save', basePayload(), USER, guardCtx(W, R1, basePayload()));
  const moUid = first.result.mo_uid;
  const woBefore = rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid);
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const R2 = REQ('n');
  const edit = basePayload({ mo_uid: moUid, base_token: full.edit_token });
  delete edit.work_ops; delete edit.byproducts;
  const r2 = invoke(W, 'save', edit, USER, guardCtx(W, R2, edit));
  check(r2.result && r2.result.status === 'success', 'edit omitting optional sections succeeds', JSON.stringify(r2.error && r2.error.message));
  check(JSON.stringify(Object.keys(rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid))) === JSON.stringify(Object.keys(woBefore)),
    'omitted work-ops section remains untouched');
  const full2 = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const R3 = REQ('o');
  const detailScope = ['header', 'outputs', 'consumption', 'work_ops', 'byproducts'];
  const woUids = Object.keys(rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid));
  const bpUids = Object.keys(rowsByUid(W, 'valley_manufacture_by_product', 'valley_manufacture_header_id', moUid));
  const wipe = basePayload({
    mo_uid: moUid, base_token: W.H.token('db', moUid, detailScope), save_scope: detailScope,
    work_ops: [], byproducts: [],
    deleted_uids: { outputs: [], consumption: [], work_ops: woUids, byproducts: bpUids },
  });
  const r3 = invoke(W, 'save', wipe, USER, guardCtx(W, R3, wipe));
  check(r3.result && r3.result.status === 'success', 'explicitly empty sections save', JSON.stringify(r3.error && r3.error.message));
  check(Object.keys(rowsByUid(W, 'valley_manufacture_work_center', 'valley_manufacture_header_id', moUid)).length === 0, 'explicitly empty work-ops keeps deliberate remove-all meaning');
})();

(function () {
  // 13. closed failures: foreign UID, competing request, malformed envelope.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('p');
  const first = invoke(W, 'save', basePayload(), USER, guardCtx(W, R1, basePayload()));
  const moUid = first.result.mo_uid;
  const snap = snapshot(W);
  const full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const evil = basePayload({ mo_uid: moUid, base_token: full.edit_token, outputs: [{ uid: 'ffffffffffffffff', product_id: 'P1', qty: 10, footers: [{ uid: 'eeeeeeeeeeeeeeee', item: 'BATCH-A', qty: 10 }] }] });
  delete evil.work_ops; delete evil.byproducts;
  const re = invoke(W, 'save', evil, USER, guardCtx(W, REQ('q'), evil));
  check(re.error && re.error.notApplied === true, 'foreign child UID fails closed, notApplied', re.error && re.error.message);
  check(snapshot(W) === snap, 'foreign UID causes zero business writes');
  const conflict = basePayload({ mo_uid: moUid, base_token: full.edit_token });
  delete conflict.work_ops; delete conflict.byproducts;
  const rc = invoke(W, 'save', conflict, USER, guardCtx(W, REQ('r'), conflict, { openConflict: 'OTHER-REQ-1234567890' }));
  check(rc.error && rc.error.notApplied === true, 'competing unresolved request refused before mutation', rc.error && rc.error.message);
  check(snapshot(W) === snap, 'competing request causes zero business writes');
  const badEnv = { type: 'nope', request_id: REQ('s'), mo_uid: moUid, stage: 'header' };
  const rb = invoke(W, 'save', conflict, USER, guardCtx(W, REQ('s'), conflict, { recovering: true, priorState: 'uncertain', priorRecovery: badEnv }));
  check(rb.error && !rb.error.notApplied, 'malformed envelope stays review-required (not notApplied)', rb.error && rb.error.message);
  check(snapshot(W) === snap, 'malformed envelope causes zero business writes');
})();

(function () {
  // 15/16. legacy ambiguous state stays review-required; checkpoint failure writes nothing.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('t');
  const first = invoke(W, 'save', basePayload(), USER, guardCtx(W, R1, basePayload()));
  const moUid = first.result.mo_uid;
  const snap = snapshot(W);
  const diverged = basePayload({ mo_uid: moUid, manufactured_qty: 111 });
  const g = guardCtx(W, R1, diverged, { recovering: true, priorState: 'uncertain', priorRecovery: null });
  const r = invoke(W, 'save', diverged, USER, g);
  check(r.error && !r.error.notApplied, 'legacy partial/ambiguous state remains review-required', r.error && r.error.message);
  check(snapshot(W) === snap, 'legacy ambiguous recovery performs zero writes');
  const p2 = basePayload();
  const g2 = guardCtx(W, REQ('u'), p2, { failCheckpoint: true });
  const r2 = invoke(W, 'save', p2, USER, g2);
  check(r2.error, 'checkpoint failure aborts the save', r2.error && r2.error.message);
  check(JSON.stringify(counts(W)) === JSON.stringify({ header: 1, outputs: 1, cons: 1, wo: 1, bp: 1 }), 'checkpoint failure before mutation writes nothing new');
})();

(function () {
  // 17. new-MO retry binds the same deterministic MO UID; orphan deletion converges.
  const W = makeWorld(); seedWorld(W);
  const R1 = REQ('v');
  const two = basePayload({
    outputs: [
      { product_id: 'P1', qty: 6, footers: [{ item: 'BATCH-A', qty: 6 }] },
      { product_id: 'P1', qty: 4, footers: [{ item: 'BATCH-A', qty: 4 }] },
    ],
  });
  const first = invoke(W, 'save', two, USER, guardCtx(W, R1, two));
  check(first.result && first.result.status === 'success', 'two-output MO created', JSON.stringify(first.error && first.error.message));
  const moUid = first.result.mo_uid;
  const twoOutRows = rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid);
  check(Object.keys(twoOutRows).length === 2, 'two outputs persisted');
  check(Object.keys(twoOutRows).map((u) => Number(twoOutRows[u].id)).sort((a, b) => a - b).join(',') === '1,2',
    'multiple output rows receive consecutive integer ids');
  // Same new-MO request retried (lost response): must not create a second MO.
  const envNew = { type: 'vf_mfg_order_save_v1', request_id: R1, payload_hash: W.sb.requestGuardHash_(W.sb.requestGuardCanonical_(JSON.parse(JSON.stringify(two)))), mo_uid: moUid, base_token: '', scope: ['header', 'outputs', 'consumption'], stage: 'outputs' };
  const rr = invoke(W, 'save', two, USER, guardCtx(W, R1, two, { recovering: true, priorState: 'uncertain', priorRecovery: envNew }));
  check(rr.result && rr.result.status === 'success', 'new-MO retry converges', JSON.stringify(rr.error && rr.error.message));
  check(counts(W).header === 1, 'new-MO retry creates no second MO');
  // A row merely missing from client state is preserved; deletion requires an
  // explicit owned UID.
  let full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const partial = basePayload({
    mo_uid: moUid, base_token: full.edit_token,
    outputs: [{ uid: full.outputs[0].unique_id, product_id: 'P1', qty: 6, footers: full.outputs[0].footers.map((f) => ({ uid: f.unique_id, item: f.item, qty: f.qty })) }],
  });
  delete partial.work_ops; delete partial.byproducts;
  const keepMissing = invoke(W, 'save', partial, USER, guardCtx(W, REQ('v2'), partial));
  check(keepMissing.result && Object.keys(rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid)).length === 2,
    'missing client row is preserved without explicit delete UID');

  // Explicit child deletion interrupted after the output row is gone but before
  // its footer is removed. Recovery must accept the now-absent owned UID,
  // remove the orphan footer, and converge without touching another MO.
  full = invoke(W, 'full', { mo_uid: moUid }, USER, {}).result;
  const R2 = REQ('w');
  const shrink = basePayload({
    mo_uid: moUid, base_token: full.edit_token,
    outputs: [{ uid: full.outputs[0].unique_id, product_id: 'P1', qty: 6, footers: full.outputs[0].footers.map((f) => ({ uid: f.unique_id, item: f.item, qty: f.qty })) }],
    deleted_uids: {
      outputs: [full.outputs[1].unique_id],
      consumption: full.outputs[1].footers.map((f) => f.unique_id),
      work_ops: [], byproducts: [],
    },
  });
  delete shrink.work_ops; delete shrink.byproducts;
  const interrupted = guardCtx(W, R2, shrink, { failAfterStage: 'outputs' });
  const r2 = invoke(W, 'save', shrink, USER, interrupted);
  check(r2.error && interrupted.stages.indexOf('outputs') !== -1, 'explicit deletion interruption occurs after output deletion', JSON.stringify(r2.error && r2.error.message));
  check(Object.keys(rowsByUid(W, 'valley_manufacture_header_products', 'valley_manufacture_header_id', moUid)).length === 1, 'interrupted delete removed the explicit output row');
  const envDel = { type: 'vf_mfg_order_save_v1', request_id: R2, payload_hash: W.sb.requestGuardHash_(W.sb.requestGuardCanonical_(JSON.parse(JSON.stringify(shrink)))), mo_uid: moUid, base_token: full.edit_token, scope: ['header', 'outputs', 'consumption'], stage: 'outputs' };
  const r3 = invoke(W, 'save', shrink, USER, guardCtx(W, R2, shrink, { recovering: true, priorState: 'uncertain', priorRecovery: envDel }));
  check(r3.result && r3.result.status === 'success', 'partial explicit deletion resumes through its orphan footer', JSON.stringify(r3.error && r3.error.message));
  const snap = snapshot(W);
  const r4 = invoke(W, 'save', shrink, USER, guardCtx(W, R2, shrink, { recovering: true, priorState: 'uncertain', priorRecovery: envDel }));
  check(r4.result && r4.result.status === 'success', 'retry over completed explicit deletion recovers', JSON.stringify(r4.error && r4.error.message));
  check(snapshot(W) === snap, 'orphan-deletion retry is stable (no resurrection, no duplicate)');
})();

(function () {
  // 18. recovery metadata bound + ownership, proved against the REAL request guard.
  const src = CODE;
  function grab(name) {
    const s = src.indexOf('function ' + name + '(');
    assert(s >= 0, name);
    const e = src.indexOf('\nfunction ', s + 10);
    return src.slice(s, e < 0 ? src.length : e);
  }
  const names = ['requestGuardIsWrite_', 'requestGuardCanonical_', 'requestGuardHash_', 'requestGuardReply_', 'requestGuardNotApplied_', 'requestGuardFailedReply_', 'requestGuardSheet_', 'requestGuardFind_', 'requestGuardExecute_'];
  const hdrStart = src.indexOf('var REQUEST_RECEIPT_HEADERS_');
  const hdrEnd = src.indexOf(';\n', hdrStart);
  const shared = { sheets: {} };
  function fakeSheet() {
    const rows = [];
    return {
      rows, hideSheet() {}, getLastRow: () => rows.length, getMaxRows: () => 1000, insertRowsAfter: () => {},
      getRange: (r, c, n, w) => {
        n = n || 1; w = w || 1;
        return {
          getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] === undefined ? '' : rows[r - 1 + i][c - 1 + j])),
          setValues: (vals) => { vals.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; }); }); },
          createTextFinder: (key) => ({ matchEntireCell() { return this; }, matchCase() { return this; }, findAll: () => rows.map((row, i) => ({ row, i })).filter((x) => x.row[c - 1] === key).map((x) => ({ getRow: () => x.i + 1 })) }),
        };
      },
    };
  }
  const ctx = {
    console, noteMutation_() {}, Utilities: { DigestAlgorithm: { SHA_256: 'x' }, Charset: { UTF_8: 'x' }, computeDigest: (_, t) => Array.from(crypto.createHash('sha256').update(String(t), 'utf8').digest()) },
    SpreadsheetApp: { flush() {} }, executeWithLock_: (fn) => fn(), rearmRecordCache_() {}, jsonSafe_: (x) => JSON.parse(JSON.stringify(x)),
    getSpreadsheet_: () => ({ getSheetByName: (n) => shared.sheets[n] || null, insertSheet: (n) => (shared.sheets[n] = fakeSheet()) }),
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(hdrStart, hdrEnd + 1) + '\n' + names.map(grab).join('\n'), ctx);
  const user = { email: 'op@valley.test' };
  const payload = (id, extra) => ({ target_system: 'co', module_action: 'save_valley_mfg_order', data: Object.assign({ x: 1, __request_id: id, __request_owner: user.email }, extra || {}) });
  let business = 0;
  const ID = REQ('x');
  // Oversized recovery metadata must throw inside the handler and persist nothing.
  const big = ctx.requestGuardExecute_(payload(ID), user, 'co', (safe, g) => {
    business++;
    g.checkpoint({ type: 'vf_mfg_order_save_v1', mo_uid: 'M1', base_token: '', scope: ['header'], stage: 'validated'.padEnd(6000, 'z') });
    return { status: 'success' };
  });
  check(big.code === 'REQUEST_UNCERTAIN', 'oversized checkpoint metadata cannot finalize success', big.code);
  check(business === 1, 'oversized checkpoint threw before any claimed business effect completed');
  const stored = shared.sheets['ERP_Request_Receipts'].rows[0][6];
  check(stored.indexOf('padEnd') === -1 && stored.length < 5000, 'oversized recovery envelope never persisted in the receipt');
  // A second user cannot observe or resume the first user's receipt.
  const other = ctx.requestGuardExecute_(payload(ID), { email: 'stranger@valley.test' }, 'co', () => { business++; return { status: 'success' }; });
  check(other.code === 'REQUEST_OWNER_MISMATCH' && business === 1, 'recovery metadata never escapes request ownership');
})();

(function () {
  // 19. list filters: date range + shift/product/category/batch dropdowns, blank = all.
  const W = makeWorld(); seedWorld(W);
  seedRow(W.SS, 'valley_products', { id: 'P2', name_ar: 'صنف 2', category: 'CAT' });
  seedRow(W.SS, 'valley_products', { id: 'P3', name_ar: 'صنف غير مستخدم', category: 'CAT' });
  W.SS.insertSheet('valley_categories', ['id', 'name']);
  seedRow(W.SS, 'valley_categories', { id: 'CAT-A', name: 'فئة أ' });
  seedRow(W.SS, 'valley_categories', { id: 'CAT-B', name: 'فئة ب' });
  const mo = (uid, id, shift, pid, cat, batch, date) => seedRow(W.SS, 'valley_manufacture_header', {
    unique_id: uid, id: id, operation_type: 'تصنيع وتعبئة', shift: shift, manufacture_date: date,
    produced_product: pid, product_category: cat, manufacture_batch: batch,
    manufactured_qty: 100, expected_qty: 65, actual_qty: 90, mo_status: 'Draft',
  });
  mo('MO-A', 1, 'SH-1', 'P1', 'CAT-A', 'B-1', '2026-09-05');
  mo('MO-B', 2, 'SH-2', 'P2', 'CAT-B', 'B-2', '2026-09-20');
  mo('MO-C', 3, 'SH-1', 'P1', 'CAT-A', 'B-3', '2026-08-10');
  const ids = (r) => (r.result.orders || []).map((o) => o.unique_id).sort().join(',');
  const all = invoke(W, 'orders', {}, USER, {});
  check(all.result && all.result.status === 'success' && all.result.total === 3, 'blank filters return all data', JSON.stringify(all.error && all.error.message));
  check(all.result.orders[0].unique_id === 'MO-C' && all.result.orders[0].product_category === 'فئة أ' && all.result.orders[0].manufacture_batch === 'B-3', 'projection carries category label + batch (newest first)');
  check(all.result.orders[1].shift === 'SH-2' && all.result.orders[1].shift_name === 'وردية الاختبار 2', 'rows carry the stored shift id plus the resolved shift_name');
  const fo = all.result.filter_options || {};
  check(Array.isArray(fo.shift) && JSON.stringify(fo.shift.map(function (o) { return { value: o.value, label: o.label }; })) === JSON.stringify([{ value: 'SH-1', label: 'وردية الاختبار 1' }, { value: 'SH-2', label: 'وردية الاختبار 2' }]), 'shift dropdown serves schedule ids with names');
  check(fo.shift[0].start === '08:00' && fo.shift[0].end === '16:00' && fo.shift[1].start === '16:00' && fo.shift[1].end === '00:00', 'shift options carry start/end times for the work-op prefill');
  check(JSON.stringify(fo.categories) === JSON.stringify([{ value: 'CAT-A', label: 'فئة أ' }, { value: 'CAT-B', label: 'فئة ب' }]), 'category dropdown labels served');
  check(JSON.stringify(fo.operation_types) === JSON.stringify(['تصنيع وتعبئة', 'تصنيع (كميات)', 'اعادة تعبئة']), 'operation-type dropdown served');
  check(JSON.stringify(all.result.filter_product_options) === JSON.stringify([{ value: 'P1', label: 'صنف 1' }, { value: 'P2', label: 'صنف 2' }]), 'product filter only lists products used by manufacturing headers');
  check(JSON.stringify(fo.batches) === JSON.stringify(['B-1', 'B-2', 'B-3']), 'batch dropdown labels served');
  check(ids(invoke(W, 'orders', { shift: 'SH-1' }, USER, {})) === 'MO-A,MO-C', 'shift filter narrows');
  check(ids(invoke(W, 'orders', { operation_type: 'تصنيع وتعبئة' }, USER, {})) === 'MO-A,MO-B,MO-C', 'operation-type filter narrows');
  check(ids(invoke(W, 'orders', { produced_product: 'P2' }, USER, {})) === 'MO-B', 'product filter narrows by id');
  check(ids(invoke(W, 'orders', { product_category: 'CAT-B' }, USER, {})) === 'MO-B', 'category filter narrows');
  check(ids(invoke(W, 'orders', { manufacture_batch: 'B-3' }, USER, {})) === 'MO-C', 'batch filter narrows');
  check(ids(invoke(W, 'orders', { from: '2026-09-01', to: '2026-09-30' }, USER, {})) === 'MO-A,MO-B', 'date range narrows');
  check(ids(invoke(W, 'orders', { shift: 'SH-1', product_category: 'CAT-A', from: '2026-09-01', to: '2026-09-30' }, USER, {})) === 'MO-A', 'combined filters intersect');
  const none = invoke(W, 'orders', { shift: 'SH-9' }, USER, {});
  check(none.result && none.result.total === 0 && none.result.orders.length === 0, 'unknown value is honest empty, not an error');
  const stillAll = invoke(W, 'orders', { shift: '', produced_product: '', product_category: '', manufacture_batch: '', from: '', to: '' }, USER, {});
  check(stillAll.result && stillAll.result.total === 3, 'explicit blanks return all data');
})();

console.log(failed === 0 ? 'vf_mfg_request_recovery: PASS' : 'vf_mfg_request_recovery: ' + failed + ' check(s) FAILED.');
process.exit(failed === 0 ? 0 : 1);
