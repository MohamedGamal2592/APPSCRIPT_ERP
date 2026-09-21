'use strict';
/* OPT-4 — formula-safe, concurrency-safe spreadsheet batching (Task 4).
 *
 * approveValleyInvoice_ writes 3 approval cells; approveValleyMfgOrder_
 * writes an approval pair. Both now issue ONE contiguous setValues when the
 * LIVE layout keeps those columns adjacent (verified from the headers just
 * read — never assumed), and fall back to the original single-cell writes
 * otherwise. Same cells, same values, same history, one noteMutation_.
 * Proves: batched branch cell values, fallback branch cell values, final-grid
 * differential between the two branches, single vs triple write counts, and
 * that a drifted layout changes nothing observable.
 * Nothing here touches a spreadsheet, a Google service or the network. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
function grabNested(src, name) {
  const start = src.indexOf('  function ' + name + '(');
  assert(start >= 0, 'missing nested ' + name);
  const end = src.indexOf('\n  function ', start + 10);
  return src.slice(start, end < 0 ? src.length : end);
}
const vfSource = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

function makeSheet(headers, seedRows) {
  const grid = [headers.slice()].concat(seedRows.map(r => r.slice()));
  let singles = 0, batches = 0, notes = 0;
  const cells = [];
  const sheet = {
    __headers: headers.slice(),
    data: () => grid.map(r => r.slice()),
    get singles() { return singles; },
    get batches() { return batches; },
    get notes() { return notes; },
    note: () => { notes++; },
    cells,
    getDataRange: () => ({ getValues: () => grid.map(r => r.slice()) }),
    getRange: (r, c, nRows, nCols) => ({
      setValue: v => { singles++; cells.push({ row: r, col: c, value: v }); grid[r - 1][c - 1] = v; },
      setValues: vv => { batches++; (vv[0] || []).forEach((v, i) => { cells.push({ row: r, col: c + i, value: v }); grid[r - 1][c + i - 1] = v; }); }
    }),
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length
  };
  return sheet;
}

const FIN = ['id', 'invoice_unique_id', 'approval_status', 'approval', 'approval_time', 'record_uid'];
// Same columns, approval_time moved away: adjacency no longer holds.
const FIN_SHUFFLED = ['id', 'invoice_unique_id', 'approval_status', 'approval', 'record_uid', 'approval_time'];
const MFG = ['id', 'unique_id', 'mo_status', 'production_approval', 'production_approval_time', 'record_uid'];
const MFG_SHUFFLED = ['id', 'unique_id', 'mo_status', 'production_approval', 'record_uid', 'production_approval_time'];

let historyCalls = [];
let activeSheet = null;
const ctx = {
  console,
  requireSuperAdmin_: user => { if (!user || !user.isSuperAdmin) throw new Error('denied'); },
  getSheet_: () => activeSheet,
  getHeaders_: sheet => (sheet.__headers || []).slice(),
  getAllRecords_: () => { throw new Error('OPT-4: no re-reads on the approval paths'); },
  assertTransition_: (dt, from, to) => {
    const f = String(from), t = String(to);
    const ok = (f === 'Pending' && t === 'Approved') ||
      (f === 'Approved' && t === 'Pending') ||
      (String(dt) === 'vf_mfg_order' && f === 'Locked' && t === 'In Progress') ||
      (String(dt) === 'vf_mfg_order' && ((f === 'Draft' && t === 'In Progress') || (f === 'In Progress' && t === 'Locked')));
    if (!ok) throw new Error('bad transition');
    return true;
  },
  noteMutation_: sheet => sheet.note(),
  logHistory_: function () { historyCalls.push(Array.prototype.slice.call(arguments)); },
  vfFlush_: () => {},
  FIN_SALES_INV_SHEET: (vfSource.match(/const FIN_SALES_INV_SHEET\s*=\s*'([^']+)'/) || [])[1],
  MFG_ORDER_SHEET: (vfSource.match(/const MFG_ORDER_SHEET\s*=\s*'([^']+)'/) || [])[1]
};
assert.ok(ctx.FIN_SALES_INV_SHEET && ctx.MFG_ORDER_SHEET, 'sheet names located');
vm.createContext(ctx);
vm.runInContext(
  ['approveValleyInvoice_', 'approveValleyMfgOrder_'].map(n => grabNested(vfSource, n)).join('\n'),
  ctx, { filename: 'approval slice' }
);
const SUPER = { isSuperAdmin: true, email: 'gm@valley.test' };
function seedInv(status) { return [[1, 'INV-X', status, status === 'Approved' ? 'gm@valley.test' : '', status === 'Approved' ? '2026-09-01' : '', 'ru-X']]; }

// ── 1. invoice approval, adjacent layout: one 3-cell write ─────────────────
activeSheet = makeSheet(FIN, seedInv('Pending'));
historyCalls = [];
const r1 = ctx.approveValleyInvoice_({ invoice_unique_id: 'INV-X' }, SUPER, 'db');
assert.strictEqual(r1.approval_status, 'Approved');
assert.strictEqual(activeSheet.batches, 1, 'adjacent approval columns collapse to one range write');
assert.strictEqual(activeSheet.singles, 0, 'no single-cell writes on the batched branch');
assert.strictEqual(activeSheet.notes, 1, 'one mutation stamp, not three');
const got = {};
activeSheet.cells.forEach(c => { got[c.col] = c.value; });
assert.strictEqual(got[3], 'Approved');
assert.strictEqual(got[4], 'gm@valley.test');
// (toString-tag, not instanceof: the Date is minted inside the vm context.)
assert.strictEqual(Object.prototype.toString.call(got[5]), '[object Date]', 'approval_time is a real Date in the batch');
assert.ok(!isNaN(got[5].getTime()));
assert.strictEqual(historyCalls[0][6].approval_status, 'Approved');
const batchedGrid = activeSheet.data();

// ── 2. invoice approval, drifted layout: verbatim fallback, same outcome ───
activeSheet = makeSheet(FIN_SHUFFLED, seedInv('Pending'));
historyCalls = [];
const r2 = ctx.approveValleyInvoice_({ invoice_unique_id: 'INV-X' }, SUPER, 'db');
assert.strictEqual(r2.approval_status, 'Approved');
assert.strictEqual(activeSheet.batches, 0, 'non-adjacent layout never batches');
assert.strictEqual(activeSheet.singles, 3, 'the three original writes run verbatim');
assert.strictEqual(activeSheet.notes, 3);
assert.strictEqual(historyCalls[0][6].approval_status, 'Approved');
// Differential: same final values under both layouts (column order aside).
const finIdx = h => FIN_SHUFFLED.indexOf(h);
assert.strictEqual(activeSheet.data()[1][finIdx('approval_status')], batchedGrid[1][FIN.indexOf('approval_status')]);
assert.strictEqual(activeSheet.data()[1][finIdx('approval')], batchedGrid[1][FIN.indexOf('approval')]);
assert.strictEqual(String(activeSheet.data()[1][finIdx('approval_time')] || ''), String(batchedGrid[1][FIN.indexOf('approval_time')] || ''));

// ── 3. revert also batches (empty approver/time), still one write ──────────
activeSheet = makeSheet(FIN, seedInv('Approved'));
historyCalls = [];
const r3 = ctx.approveValleyInvoice_({ invoice_unique_id: 'INV-X' }, SUPER, 'db');
assert.strictEqual(r3.approval_status, 'Pending');
assert.strictEqual(activeSheet.batches, 1);
assert.strictEqual(activeSheet.singles, 0);
const back = {};
activeSheet.cells.forEach(c => { back[c.col] = c.value; });
assert.strictEqual(back[3], 'Pending');
assert.strictEqual(back[4], '', 'approver cleared in the batch');
assert.strictEqual(back[5], '', 'time cleared in the batch');

// ── 4. mfg production pair: batched when adjacent, split when drifted ──────
function seedMfg(status) { return [[1, 'MO-X', status, '', '', 'ru-M']]; }
activeSheet = makeSheet(MFG, seedMfg('Draft'));
historyCalls = [];
// Draft -> Locked is illegal; drive the legal Draft -> In Progress first via status path? No:
// approveValleyMfgOrder_ production kind stamps the pair regardless of status, so call directly.
const m1 = ctx.approveValleyMfgOrder_({ mo_uid: 'MO-X', kind: 'production' }, SUPER, 'db');
assert.strictEqual(m1.status, 'success');
assert.strictEqual(activeSheet.batches, 1, 'adjacent pair collapses to one range write');
assert.strictEqual(activeSheet.singles, 0);
assert.strictEqual(activeSheet.notes, 1);
const mGot = {};
activeSheet.cells.forEach(c => { mGot[c.col] = c.value; });
assert.strictEqual(mGot[4], 'gm@valley.test');
assert.strictEqual(Object.prototype.toString.call(mGot[5]), '[object Date]');
assert.ok(!isNaN(mGot[5].getTime()));
const mfgGrid = activeSheet.data();

activeSheet = makeSheet(MFG_SHUFFLED, seedMfg('Draft'));
historyCalls = [];
const m2 = ctx.approveValleyMfgOrder_({ mo_uid: 'MO-X', kind: 'production' }, SUPER, 'db');
assert.strictEqual(m2.status, 'success');
assert.strictEqual(activeSheet.batches, 0, 'drifted pair never batches');
assert.strictEqual(activeSheet.singles, 2, 'the two original writes run verbatim');
const shIdx = h => MFG_SHUFFLED.indexOf(h);
assert.strictEqual(activeSheet.data()[1][shIdx('production_approval')], mfgGrid[1][MFG.indexOf('production_approval')]);
assert.strictEqual(String(activeSheet.data()[1][shIdx('production_approval_time')] || ''), String(mfgGrid[1][MFG.indexOf('production_approval_time')] || ''));

console.log('optimization_writes: PASS');
