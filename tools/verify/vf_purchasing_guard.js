/**
 * VF-PURCHASING-GUARD — the "uncertain submission result" safeguard, centrally fixed.
 *
 * Proves, offline against the REAL sources, that:
 *
 *  1. A deterministic pre-mutation refusal (validation, duplicate key, totals
 *     reconciliation, permission/state gate) is recorded as a CONFIRMED
 *     failure (REQUEST_NOT_APPLIED, uncertain=false), never as an uncertain
 *     outcome — so the user gets the real message and a corrected retry mints
 *     a fresh request instead of hitting a permanent uncertain block.
 *  2. A retry of the same request ID never re-executes the handler: success
 *     replays the original result (deduped), confirmed failure replays the
 *     stored failure, and an uncertain receipt stays blocked.
 *  3. The two global guards no longer collide: Code.js owns
 *     requestGuardExecute_ (receipt ledger); Code.js owns
 *     requestDedupeExecute_ (row probe). Exactly one definition of the former
 *     exists and every 4-arg probe call site uses the latter.
 *  4. The shared pre-mutation guards (assertTransition_, checkRowVersion_)
 *     carry the notApplied marker, so every form using them — not just
 *     vf_purchasing — classifies refusals correctly.
 *  5. The client keeps one stable request ID across transport loss / reload /
 *     checkpoint retry, and the Save button is held while pending.
 *
 * Nothing here touches a spreadsheet, a Google service or the network.
 *
 * Run: node tools/verify/vf_purchasing_guard.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const CODE = read('Code.js');
const DATA = read('Code.js');
const VALLEY = read('Company_ValleyFoods_Actions.js');
const TL = read('Company_TopLight_Actions.js');
const TC = read('Company_TopChemical_Actions.js');
const CLIENT = read('Client_Helpers.html');
const VF_PAGE = read('Company_ValleyFoods_Purchasing.html');

/* ══ 1. Real Code.js receipt guard ═══════════════════════════════════════ */
function grab(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing function ' + name);
  const end = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}
function grabVar(source, marker) {
  const start = source.indexOf(marker);
  assert(start >= 0, 'missing ' + marker);
  const end = source.indexOf(';\n', start);
  return source.slice(start, end + 1);
}

const GUARD_NAMES = ['requestGuardIsWrite_', 'requestGuardCanonical_', 'requestGuardHash_',
  'requestGuardReply_', 'requestGuardNotApplied_', 'requestGuardFailedReply_', 'notAppliedError_',
  'requestGuardSheet_', 'requestGuardFind_', 'requestGuardExecute_'];

function guardServer(shared) {
  shared = shared || { sheets: {}, business: [], fail: '' };
  function makeSheet() {
    const rows = [];
    let max = 100;
    return {
      rows,
      hideSheet() {},
      getLastRow: () => rows.length,
      getMaxRows: () => max,
      insertRowsAfter: (at, n) => { max += n; },
      getRange: (r, c, n = 1, w = 1) => ({
        getValues: () => Array.from({ length: n }, (_, i) =>
          Array.from({ length: w }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] === undefined ? '' : rows[r - 1 + i][c - 1 + j])),
        setValues: (values) => {
          values.forEach((row, i) => {
            rows[r - 1 + i] = rows[r - 1 + i] || [];
            row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; });
          });
        },
        createTextFinder: (key) => ({
          matchEntireCell() { return this; },
          matchCase() { return this; },
          findAll: () => rows.map((row, i) => ({ row, i }))
            .filter((x) => x.i >= r - 1 && x.i < r - 1 + n && x.row[c - 1] === key)
            .map((x) => ({ getRow: () => x.i + 1 })),
        }),
      }),
    };
  }
  const ctx = {
    console,
    noteMutation_() {},
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(text).digest()),
    },
    SpreadsheetApp: { flush() {} },
    executeWithLock_: (fn) => fn(),
    rearmRecordCache_() {},
    jsonSafe_: (x) => JSON.parse(JSON.stringify(x)),
    getSpreadsheet_: (db) => ({
      getSheetByName: (name) => shared.sheets[db + '/' + name],
      insertSheet: (name) => (shared.sheets[db + '/' + name] = makeSheet()),
    }),
  };
  vm.createContext(ctx);
  vm.runInContext(
    grabVar(CODE, 'var REQUEST_RECEIPT_HEADERS_') + '\n' + GUARD_NAMES.map((n) => grab(CODE, n)).join('\n'),
    ctx
  );
  return { ctx, shared };
}

const USER = { email: 'user@example.test', company: 'company' };
function req(id, body) {
  return {
    target_system: 'company',
    module_action: 'save_valley_purchasing_costing',
    data: Object.assign({ Code: 'P-1' }, body || {}, { __request_id: id, __request_owner: USER.email }),
  };
}

/* 1a. Valley-style pre-write validation refusal -> confirmed failure. */
{
  const S = guardServer();
  let calls = 0;
  const first = S.ctx.requestGuardExecute_(req('v'.repeat(24)), USER, 'company', () => {
    calls++;
    S.ctx.notAppliedError_('الكود (Code) مكرر — يجب أن يكون فريداً');
  });
  assert.strictEqual(first.code, 'REQUEST_NOT_APPLIED', 'duplicate code must be a confirmed failure');
  assert.strictEqual(first.notApplied, true);
  assert(!first.uncertain, 'confirmed failure must not be uncertain');
  const replay = S.ctx.requestGuardExecute_(req('v'.repeat(24)), USER, 'company', () => { calls++; });
  assert.strictEqual(replay.code, 'REQUEST_NOT_APPLIED', 'same request replays the stored failure');
  assert.strictEqual(calls, 1, 'validation refusal never re-executes the handler');
  assert.strictEqual(S.shared.business.length, 0, 'nothing was written');
  console.log('  PASS  1a — pre-mutation refusal is a confirmed failure, never re-executed');
}

/* 1b. Success still dedupes; post-write errors stay uncertain and blocked. */
{
  const S = guardServer();
  let calls = 0;
  const ok = S.ctx.requestGuardExecute_(req('w'.repeat(24)), USER, 'company', () => {
    calls++;
    S.shared.business.push({ id: 1 });
    return { status: 'success', record: { id: 1 } };
  });
  assert.strictEqual(ok.status, 'success');
  const dup = S.ctx.requestGuardExecute_(req('w'.repeat(24)), USER, 'company', () => { calls++; });
  assert.strictEqual(dup.deduped, true, 'same request returns the original result');
  assert.strictEqual(calls, 1, 'success handler ran exactly once');

  const U = guardServer();
  let uCalls = 0;
  const lost = U.ctx.requestGuardExecute_(req('x'.repeat(24)), USER, 'company', () => {
    uCalls++;
    U.shared.business.push({ id: 1 });
    throw Error('interrupted after write');
  });
  assert.strictEqual(lost.code, 'REQUEST_UNCERTAIN', 'post-write failure stays uncertain');
  assert.strictEqual(
    U.ctx.requestGuardExecute_(req('x'.repeat(24)), USER, 'company', () => { uCalls++; }).code,
    'REQUEST_UNCERTAIN', 'uncertain receipt blocks replay'
  );
  assert.strictEqual(uCalls, 1, 'uncertain handler never runs again');
  console.log('  PASS  1b — success dedupes; post-write failure stays uncertain and blocked');
}

/* ══ 2. Real Code.js shared guards ══════════════════════════════ */
function dataSandbox() {
  const sb = {
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    SpreadsheetApp: { openById: () => { throw new Error('no ss'); } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { getUuid: () => 'u', sleep: () => {} },
    Session: { getScriptTimeZone: () => 'UTC', getActiveUser: () => ({ getEmail: () => '' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {}, getAll: () => ({}), putAll: () => {}, removeAll: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) },
    Logger: { log: () => {} },
    ScriptApp: { getProjectTriggers: () => [] },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  ['Code.js'].forEach((f) => {
    vm.runInContext(read(f), sb, { filename: f });
  });
  /* Status transitions are now company policy supplied by the Valley action
     module/registry, rather than a shared literal in Code.js. */
  vm.runInContext(read('Company_ValleyFoods_Actions.js'), sb, { filename: 'Company_ValleyFoods_Actions.js' });
  vm.runInContext(read('Company_ValleyFoods_Registry.js'), sb, { filename: 'Company_ValleyFoods_Registry.js' });
  vm.runInContext('COMPANY_REGISTRY = {}; registerValleyFoods_(); _companiesInitialized_ = true;', sb);
  return sb;
}
{
  const sb = dataSandbox();
  /* Code.js now owns both shared guards after the consolidation. */
  assert.strictEqual(typeof sb.requestGuardExecute_, 'function', 'Code.js defines requestGuardExecute_');
  assert.strictEqual(typeof sb.requestDedupeExecute_, 'function', 'Code.js defines requestDedupeExecute_');

  /* assertTransition_ refusals are confirmed failures. */
  assert.strictEqual(sb.assertTransition_('vf_purchasing', 'Pending', 'edit', 'msg'), true);
  assert.throws(
    () => sb.assertTransition_('vf_purchasing', 'Approved', 'edit', 'لا يمكن تعديل عملية شراء معتمدة'),
    (e) => e.notApplied === true && e.code === 'REQUEST_NOT_APPLIED' && /لا يمكن تعديل/.test(e.message),
    'illegal transition must be marked notApplied'
  );
  /* checkRowVersion_ conflicts are confirmed failures. */
  assert.strictEqual(sb.checkRowVersion_({ version: 5 }, 5), 5);
  assert.throws(
    () => sb.checkRowVersion_({ version: 5 }, 3),
    (e) => e.notApplied === true && e.code === 'REQUEST_NOT_APPLIED',
    'stale version must be marked notApplied'
  );
  console.log('  PASS  2 — shared pre-mutation guards carry the confirmed-failure marker');
}

/* ══ 3. Static contracts: one guard, renamed probes, marked handlers ═════ */
function defCount(src, name) {
  const m = src.match(new RegExp('function ' + name + '_?\\(', 'g'));
  return m ? m.length : 0;
}
{
  const allProd = ['Code.js', 'Company_ValleyFoods_Actions.js', 'Company_ValleyFoods_Registry.js',
    'Company_ValleyFoods_Actions.js', 'Company_TopLight_Actions.js', 'Company_TopChemical_Actions.js',
    'Company_ValleyFoods_Registry.js', 'Company_TopLight_Registry.js', 'Company_TopChemical_Registry.js']
    .map((f) => { try { return read(f); } catch (e) { return ''; } });
  const defs = allProd.reduce((n, src) => n + defCount(src, 'requestGuardExecute'), 0);
  assert.strictEqual(defs, 1, 'exactly one global requestGuardExecute_ definition (Code.js), found ' + defs);

  const probeCalls = (TL.match(/requestDedupeExecute_\(dbId,/g) || []).length
    + (TC.match(/requestDedupeExecute_\(dbId,/g) || []).length;
  assert.strictEqual(probeCalls, 5, 'all 5 row-probe call sites use requestDedupeExecute_, found ' + probeCalls);
  const staleCalls = (TL.match(/requestGuardExecute_\(dbId,/g) || []).length
    + (TC.match(/requestGuardExecute_\(dbId,/g) || []).length
    + (DATA.match(/requestGuardExecute_\(dbId,/g) || []).length;
  assert.strictEqual(staleCalls, 0, 'no 4-arg probe call may resolve to the receipt guard');
  console.log('  PASS  3a — guard names are collision-free and every probe uses the dedupe guard');
}
{
  /* Every known vf_purchasing pre-write refusal must go through the marker.
     * Scope is the purchasing section only: other Valley write handlers keep
     * their current classification (follow-up inventory, same bug class). */
  const purStart = VALLEY.indexOf('function vfNotApplied_');
  const purEnd = VALLEY.indexOf("ValleyFoods.register('get_valley_purchasing_costing'");
  assert(purStart >= 0 && purEnd > purStart, 'purchasing section bounds');
  const purSection = VALLEY.slice(purStart, purEnd);
  const marked = (purSection.match(/vfNotApplied_\(/g) || []).length;
  assert(marked >= 20, 'expected >=20 marked pre-write refusals in vf_purchasing, found ' + marked);
  const bareThrows = purSection.split('\n').filter((line) => line.includes('throw new Error'));
  /* Only post-write/operational throws may stay bare (they must remain
     uncertain): a failed patch/activation, an unverifiable staged write
     (previous generation stays authoritative), and bounded-cleanup caps. */
  const allowedBare = ['عملية الشراء غير موجودة', 'تعذر تأكيد كتابة الأصناف', 'exceeds the bounded cap'];
  for (const line of bareThrows) {
    assert(allowedBare.some((m) => line.includes(m)),
      'unexpected bare pre-write throw in vf_purchasing: ' + line.trim().slice(0, 80));
  }
  assert(bareThrows.length === 8, 'expected exactly the 8 post-write bare throws, found ' + bareThrows.length);
  console.log('  PASS  3b — vf_purchasing pre-write refusals are marked confirmed failures');
}

/* ══ 3c. Recovery schema + wiring contracts ═══════════════════════════════ */
{
  /* Marker columns are appended, never reordered. */
  for (const c of ['last_request_id', 'active_line_generation', 'operation_state', 'operation_hash']) {
    assert(VALLEY.includes("PURCHASING_COSTING_HEADERS.push('last_request_id'") || VALLEY.includes("'" + c + "'"),
      'header marker column ' + c);
  }
  for (const c of ["'request_id', 'line_generation', 'generation_hash'"]) {
    assert(VALLEY.includes(c), 'line marker columns ' + c);
  }
  /* Recovery is marker-bound, never Code-only. */
  const recIdx = VALLEY.indexOf('function purchasingRecoverRequest_');
  const recEnd = VALLEY.indexOf('function purchasingCheckpointHeader_');
  const recBody = VALLEY.slice(recIdx, recEnd);
  assert(!recBody.includes('headers.find(function (r) { return String(r.Code) === code; })'),
    'recovery must not prove application by Code match alone');
  assert(recBody.includes('purchasingFindHeaderByRequest_'), 'recovery proves via request marker');
  /* All three purchasing writes opt into request-id recovery; handlers take guardCtx. */
  for (const a of ['save_valley_purchasing_costing', 'save_valley_purchasing_header_checkpoint', 'save_valley_purchasing_lines_checkpoint']) {
    assert(VALLEY.includes("action === '" + a + "'"), 'recovery opt-in covers ' + a);
  }
  for (const fn of ['function purchasingCheckpointHeader_(data, user, dbId, guardCtx)',
    'function purchasingCheckpointLines_(data, user, dbId, guardCtx)',
    'function saveValleyPurchasingCosting_(data, user, dbId, guardCtx)']) {
    assert(VALLEY.includes(fn), 'handler receives guard context: ' + fn.slice(9, 45));
  }
  /* Status route + admin reconcile wiring. */
  assert(CODE.includes("'request_status': { handler: requestStatusRoute_, requireAuth: true }"), 'status route registered');
  const statusFn = CODE.slice(CODE.indexOf('function requestStatusRoute_'), CODE.indexOf('function requestStatusRoute_') + 4000);
  assert(!statusFn.includes('setValues') && !statusFn.includes('appendRow') && !statusFn.includes('deleteRows'),
    'status lookup must never mutate');
  assert(VALLEY.includes("ValleyFoods.register('reconcile_valley_purchasing_receipts'"), 'reconcile action registered');
  assert(VALLEY.includes("'reconcile_valley_purchasing_receipts': { page: 'vf_purchasing', access: 'full' }"), 'reconcile is full-access gated');
  console.log('  PASS  3c — marker schema, marker-bound recovery, status route, reconcile wiring');
}

/* ══ 4b. Client recovery-poll contracts ══════════════════════════════════ */
{
  assert(CLIENT.includes('recoverAfterLoss:recoverAfterLoss'), 'poll helper exposed on the request guard');
  assert(CLIENT.includes('recoverAfterLoss(recoverMeta, sessionToken)'), 'loss and in-progress replies poll first');
  assert(CLIENT.includes("payload: { target_system: meta.target_system, module_action: meta.module_action, request_id: meta.requestId }"),
    'the poll carries identity only — it mints no new write');
  assert(CLIENT.includes('checkStatus: !!intent'), 'exhaustion carries a check-status action with the request ID');
  console.log('  PASS  4b — bounded same-ID status poll, check-status action, no new identity');
}
{
  assert(CLIENT.includes('pending[signature] = {id:requestId}'), 'client persists the request ID per payload signature');
  assert(CLIENT.includes('var requestId = data.__request_id || (existing && existing.id)'),
    'retry reuses the persisted ID instead of minting a new one');
  assert(CLIENT.includes('if (error) return;'), 'transport loss keeps the pending ID for the next attempt');
  assert(CLIENT.includes('btn.disabled = true'), 'submitOnce holds the Save button while pending');
  assert(VF_PAGE.includes('UI.submitOnce(this, savePurchasing)'), 'vf_purchasing Save is double-click guarded');
  assert(VF_PAGE.includes('checkpointSend(entry, attempt + 1)'), 'checkpoints retry the same entry (same request ID)');
  assert(VF_PAGE.includes('codeEl.readOnly = true'), 'saved purchasing Code is read-only in the form');
  assert(VALLEY.includes("if (originalCode && code !== originalCode)"), 'server rejects purchasing Code renames');
  console.log('  PASS  4 — stable request ID, held Save button, same-ID checkpoint retry');
}

console.log('vf_purchasing_guard: PASS (confirmed failures, no duplicate execution, collision-free guards, stable client IDs)');
