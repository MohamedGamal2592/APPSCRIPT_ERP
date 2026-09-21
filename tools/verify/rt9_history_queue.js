/**
 * RT9 — the audit queue: nothing lost, nothing duplicated, nothing changed.
 *
 * A dropped audit row is the worst outcome in this whole programme. It is worse
 * than a slow save, worse than a stale cache, worse than a wrong number on a
 * dashboard, because nobody finds out. So this file is stricter than the rest
 * and it checks three separate things:
 *
 *   1. THE ROWS ARE THE SAME ROWS. The queue carries exactly what
 *      historyRowsFor_ produces today, column for column. This phase changes
 *      WHEN a history row is written and nothing else about it — not what it
 *      contains, not how many there are, not what Record_History_Panel reads.
 *
 *   2. THE DRAIN IS IDEMPOTENT UNDER A MID-DRAIN FAILURE. Simulated here, at
 *      every point a trigger can die: after the claim, after the write, after
 *      the done-mark. None of them may lose a row and none may duplicate one.
 *
 *   3. A QUEUE THAT CANNOT BE WRITTEN FALLS BACK TO THE OLD SYNCHRONOUS WRITE.
 *      A slow save is a much better outcome than a lost audit row, and it is
 *      the only trade this is allowed to make.
 *
 * Run: node tools/verify/rt9_history_queue.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const DA = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

function mask(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
}
const code = mask(DA);

function fnBody(name) {
  const at = code.indexOf('function ' + name);
  if (at === -1) return '';
  let d = 0;
  for (let i = code.indexOf('{', at); i < code.length; i++) {
    if (code[i] === '{') d++;
    else if (code[i] === '}') { d--; if (d === 0) return DA.slice(at, i + 1); }
  }
  return '';
}

/* ── 1. A sheet, not a cache, and the reason ─────────────────────────────── */

check(/var HISTORY_QUEUE_SHEET_ = 'ERP_History_Queue'/.test(DA),
  'the queue is ERP_History_Queue — a sheet');
const enqueue = fnBody('enqueueHistoryRows_');
check(!/CacheService/.test(enqueue),
  'and NOT a cache: CacheService entries can be evicted before their TTL, and an evicted audit row is a lost one');
check(/insertSheet\(HISTORY_QUEUE_SHEET_\)/.test(fnBody('ensureHistoryQueueSheet_')),
  'created on first use — new, additive, outside every business table');

/* ── 2. The request path gets cheaper, not just shorter ──────────────────── */

check(!/executeWithLock_/.test(enqueue),
  'the enqueue takes NO script lock — the lock is the part every other user was waiting on');
check(!/getNextIdBatch_/.test(enqueue),
  'and allocates no ids; both move to the drain');
check(/setValues\(matrix\)/.test(enqueue),
  'one setValues for the whole batch');

const writer = fnBody('writeHistoryRows_');
check(/enqueueHistoryRows_\(rows\)/.test(writer), 'writeHistoryRows_ enqueues');
check(/writeHistoryRowsDirect_\(rows\)/.test(writer),
  'and falls back to the old synchronous write when the queue is unavailable for any reason');
check(/HISTORY_QUEUE_ENABLED_ && enqueueHistoryRows_\(rows\)/.test(writer),
  'the fallback is the DEFAULT branch, not an error path — a slow save beats a lost audit row');
check(/return false;/.test(enqueue) && /catch \(e\)/.test(enqueue),
  'and the enqueue reports failure rather than throwing it at the caller');

const direct = fnBody('writeHistoryRowsDirect_');
check(/executeWithLock_/.test(direct) && /getNextIdBatch_/.test(direct),
  'the old writer is unchanged and still takes the lock — it is the fallback and the drain\'s own writer');

/* ── 3. The rows are the same rows ───────────────────────────────────────── */

const qHeaders = /var HISTORY_QUEUE_HEADERS_ = \[([\s\S]*?)\];/.exec(DA);
check(!!qHeaders, 'the queue declares its columns');
const cols = qHeaders ? qHeaders[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean) : [];

/* Exactly what historyRowsFor_ emits, plus the three the queue needs to BE a
 * queue. Those three live in the new sheet; ERP_Record_History is untouched. */
const emitted = ['sheet_name', 'record_uid', 'record_id', 'action', 'column_name',
  'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at'];
const rowsFor = fnBody('historyRowsFor_');
emitted.forEach(function (c) {
  check(new RegExp('\\b' + c + ':').test(rowsFor),
    'historyRowsFor_ still emits ' + c);
  check(cols.indexOf(c) !== -1, 'and the queue carries it');
});
check(JSON.stringify(cols.slice(emitted.length)) === JSON.stringify(['queued_at', 'claim_id', 'claimed_at']),
  'the only extra columns are the three the queue needs, and they are in the NEW sheet',
  '        extra: ' + cols.slice(emitted.length).join(', '));

/* The drain must strip those three back out before writing to history. */
const drain = fnBody('drainHistoryQueue_');
check(/if \(h === 'queued_at' \|\| h === 'claim_id' \|\| h === 'claimed_at'\) return;/.test(drain),
  'and the drain strips them before writing — ERP_Record_History gets exactly its own columns');
check(!/ERP_Record_History[\s\S]{0,200}appendRow\(\[/.test(DA),
  'nothing here adds a column to ERP_Record_History');

/* One row per changed column, unchanged. */
check(/businessHeaders\.forEach/.test(rowsFor) && /if \(action !== 'create' && safeStr_\(nVal\) === safeStr_\(oVal\)\) return;/.test(rowsFor),
  'one row per CHANGED column, and every column on a create — the rule is untouched');

/* ── 4. Idempotency, simulated ───────────────────────────────────────────── */

/* A tiny fake of the two sheets, enough to run the real drain against. */
function makeWorld(queueRows) {
  const HEAD = cols;
  const HIST_HEAD = ['id'].concat(emitted);
  const world = {
    queue: queueRows.map(r => HEAD.map(h => (r[h] === undefined ? '' : r[h]))),
    history: [],
    deletedCalls: 0
  };

  function sheetFor(name) {
    const isQueue = name === 'ERP_History_Queue';
    const data = isQueue ? world.queue : world.history;
    const head = isQueue ? HEAD : HIST_HEAD;
    return {
      getLastRow: () => data.length + 1,
      getRange: function (row, col, nRows, nCols) {
        nRows = nRows === undefined ? 1 : nRows;
        nCols = nCols === undefined ? 1 : nCols;
        return {
          getValues: function () {
            const out = [];
            for (let r = 0; r < nRows; r++) {
              const src = data[row - 2 + r] || [];
              out.push(src.slice(col - 1, col - 1 + nCols));
            }
            return out;
          },
          setValues: function (v) {
            for (let r = 0; r < v.length; r++) {
              const at = row - 2 + r;
              if (!data[at]) data[at] = new Array(head.length).fill('');
              for (let c = 0; c < v[r].length; c++) data[at][col - 1 + c] = v[r][c];
            }
          },
          setValue: function (v) {
            const at = row - 2;
            if (!data[at]) data[at] = new Array(head.length).fill('');
            data[at][col - 1] = v;
          }
        };
      },
      deleteRow: function (r) { world.deletedCalls++; data.splice(r - 2, 1); },
      appendRow: function () {},
      setFrozenRows: function () {},
      getName: () => name
    };
  }

  const sandbox = {
    console: { error: function () {} },
    Utilities: { getUuid: () => 'uuid-' + Math.random().toString(36).slice(2, 12) },
    CONFIG: { AUTH_SPREADSHEET_ID: 'auth' },
    Date: Date, String: String, Number: Number, Math: Math, JSON: JSON,
    Array: Array, Object: Object, isNaN: isNaN,
    getSpreadsheet_: () => ({ getSheetByName: sheetFor, insertSheet: sheetFor }),
    getHeaders_: sh => (sh.getName() === 'ERP_History_Queue' ? HEAD : HIST_HEAD),
    noteMutation_: function () {},
    getSheet_: sheetFor,
    /* The real writer is not exercised here — it is exercised by the suite that
       already covers it — so this records what WOULD be written. */
    writeHistoryRowsDirect_: function (rows) {
      rows.forEach(r => world.history.push(HIST_HEAD.map(h => (h === 'id' ? world.history.length + 1 : (r[h] === undefined ? '' : r[h])))));
    },
    __fail: null
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext([
    /var HISTORY_QUEUE_SHEET_ = [^;]+;/.exec(DA)[0],
    /var HISTORY_QUEUE_HEADERS_ = \[[\s\S]*?\];/.exec(DA)[0],
    /var HISTORY_CLAIM_STALE_MS_ = [^;]+;/.exec(DA)[0],
    /var HISTORY_STALE_REPORT_MS_ = [^;]+;/.exec(DA)[0],
    fnBody('ensureHistoryQueueSheet_'),
    fnBody('historyRowKey_'),
    fnBody('historyTailKeys_'),
    fnBody('reportStaleHistoryQueue_'),
    fnBody('drainHistoryQueue_')
  ].join('\n'), sandbox);
  world.run = () => vm.runInContext('drainHistoryQueue_()', sandbox);
  world.sandbox = sandbox;
  return world;
}

const SAMPLE = [
  { sheet_name: 'Sales', record_uid: 'rec_1', record_id: '1', action: 'update', column_name: 'qty', old_value: '1', new_value: '2', changed_by: 'a@b.c', changed_at: '2026-09-07T10:00:00Z', created_at: '2026-09-07T10:00:00Z', queued_at: new Date() },
  { sheet_name: 'Sales', record_uid: 'rec_1', record_id: '1', action: 'update', column_name: 'price', old_value: '10', new_value: '12', changed_by: 'a@b.c', changed_at: '2026-09-07T10:00:00Z', created_at: '2026-09-07T10:00:00Z', queued_at: new Date() }
];

/* The happy path. */
{
  const w = makeWorld(SAMPLE);
  const r = w.run();
  check(r.status === 'success' && r.written === 2, 'a clean drain writes both rows', '        ' + JSON.stringify(r));
  check(w.queue.length === 0, 'and empties the queue');
  check(w.history.length === 2, 'history has exactly two rows');
  const second = w.run();
  check(second.rows === 0 && w.history.length === 2,
    'running it again writes nothing — an empty queue is not a source of duplicates');
}

/* Death AFTER the claim, before the write: nothing may be lost. */
{
  const claimed = SAMPLE.map(r => Object.assign({}, r, {
    claim_id: 'dead-drain', claimed_at: new Date(Date.now() - 30 * 60 * 1000)
  }));
  const w = makeWorld(claimed);
  const r = w.run();
  check(r.written === 2,
    'a drain that died after claiming leaves rows that the NEXT drain re-claims and writes — nothing lost',
    '        ' + JSON.stringify(r));
  check(w.queue.length === 0 && w.history.length === 2, 'and the queue is emptied exactly once');
}

/* Death AFTER the write, before the delete: nothing may be duplicated. */
{
  const w = makeWorld(SAMPLE);
  /* Simulate: the rows ARE in history, and still on the queue with a stale
     claim, exactly as a drain that died between phase 3 and phase 5 leaves it. */
  w.sandbox.writeHistoryRowsDirect_(SAMPLE.map(r => Object.assign({}, r)));
  w.queue.forEach(row => {
    row[cols.indexOf('claim_id')] = 'dead-drain';
    row[cols.indexOf('claimed_at')] = new Date(Date.now() - 30 * 60 * 1000);
  });
  const before = w.history.length;
  const r = w.run();
  check(w.history.length === before,
    'a drain that died after writing does NOT write those rows again — the natural key catches them',
    '        history went ' + before + ' -> ' + w.history.length + ', result ' + JSON.stringify(r));
  check(r.deduped === 2, 'and it says so');
  check(w.queue.length === 0, 'while still clearing the queue');
}

/* Death AFTER the done-mark, before the delete. */
{
  const w = makeWorld(SAMPLE);
  w.sandbox.writeHistoryRowsDirect_(SAMPLE.map(r => Object.assign({}, r)));
  w.queue.forEach(row => { row[cols.indexOf('claim_id')] = 'dead-drain|done'; });
  const before = w.history.length;
  const r = w.run();
  check(w.history.length === before,
    'a row marked done is deleted without being written again');
  check(w.queue.length === 0, 'and the queue is cleared');
}

/* A fresh claim by another drain must NOT be stolen. */
{
  const w = makeWorld(SAMPLE.map(r => Object.assign({}, r, {
    claim_id: 'other-drain', claimed_at: new Date()
  })));
  const r = w.run();
  check(r.rows === 0 && w.queue.length === 2,
    'rows another drain has just claimed are left alone — two drains cannot write the same row');
}

/* ── 5. A stale row is reported, never dropped ───────────────────────────── */

const stale = fnBody('reportStaleHistoryQueue_');
check(/console\.error/.test(stale),
  'a row still queued after the reporting window is reported');
check(!/deleteRow|clearContent|splice/.test(stale),
  'and NEVER dropped — a queue that quietly discards is the failure this design exists to avoid');
check(/HISTORY_STALE_REPORT_MS_/.test(stale) && /drain trigger may not be installed/.test(DA),
  'and the message says what is probably wrong: the trigger is not installed');

const CODE = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
check(/newTrigger\('drainHistoryQueue_'\)[\s\S]{0,80}everyMinutes\(1\)/.test(CODE),
  'installTriggers_ registers the one-minute drain');

console.log('\n' + (failed === 0
  ? 'RT9 — the same rows, later; and no way for the drain to lose or double one.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
