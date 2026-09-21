'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'Code.js'), 'utf8');
const state = { rows: [{ id: 'A-1', value: 'old' }] };
const sheet = {
  getLastRow: () => state.rows.length + 1,
  getLastColumn: () => 2,
  // getReadOnlyRecords_ reads through the real data-layer path, not the
  // getAllRecords_ stub below, so the sheet mock has to serve values itself.
  getDataRange: () => ({
    getValues: () => [['id', 'value']].concat(state.rows.map(r => [r.id, r.value]))
  })
};
const ctx = {
  console,
  CONFIG: { TABLE_CACHE_MAX_CHUNKS: 50, TABLE_CACHE_CHUNK_SIZE: 90000 },
  SpreadsheetApp: {},
  CacheService: { getScriptCache: () => ({}) },
  getSheet_: () => sheet,
  getHeaders_: () => ['id', 'value'],
  getAllRecords_: () => state.rows.map(r => Object.assign({}, r)),
  getSpreadsheet_: () => ({ getId: () => 'db-1' })
};
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'Code.js' });
// Replace the real sheet reader after loading the source; function declarations
// in the Apps Script file intentionally become the context's initial bindings.
ctx.getSheet_ = () => sheet;
ctx.getHeaders_ = () => ['id', 'value'];
ctx.getAllRecords_ = () => state.rows.map(r => Object.assign({}, r));

ctx.resetRecordCache_();
const first = ctx.getRecordsByPk_('db-1', 'items', 'id');
assert.strictEqual(first.byPk.get('A-1').value, 'old');

// Exercise the real mutation boundary helper between every read. A stale PK
// memo would keep returning the first object after these changes.
state.rows[0].value = 'updated';
ctx.noteMutation_();
const second = ctx.getRecordsByPk_('db-1', 'items', 'id');
assert.strictEqual(second.byPk.get('A-1').value, 'updated');

state.rows.unshift({ id: 'B-2', value: 'inserted' });
ctx.noteMutation_();
const third = ctx.getRecordsByPk_('db-1', 'items', 'id');
assert.strictEqual(third.byPk.get('B-2').value, 'inserted');

state.rows.splice(1, 1);
ctx.noteMutation_();
const fourth = ctx.getRecordsByPk_('db-1', 'items', 'id');
assert.strictEqual(fourth.byPk.get('A-1'), undefined);

state.rows = [{ id: 'A-1', value: 'old' }, { id: 'a-1', value: 'case-duplicate' }];
ctx.resetRecordCache_();
const duplicates = ctx.getRecordsByPk_('db-1', 'items', 'id');
assert.strictEqual(duplicates.byPk.get('a-1').value, 'case-duplicate', 'lowercase alias keeps the last stored duplicate');
assert.strictEqual(duplicates.byPk.get('A-1').value, 'old', 'case-distinct direct query retains the original key entry');
assert.strictEqual(duplicates.byPk.get(' A-1 '), undefined, 'query whitespace is not normalized by the restored Map contract');

const mixed = ctx.indexById([
  { id: '  X ', value: 1 },
  { id: 'x', value: 2 },
  { id: 7, value: 'number' },
  { id: '7', value: 'string' },
  { id: '', value: 'blank' },
  { id: null, value: 'null' }
], 'id');
assert.strictEqual(mixed.get('X').value, 1);
assert.strictEqual(mixed.get('x').value, 2, 'lowercase alias follows last stored duplicate');
assert.strictEqual(mixed.get('7').value, 'string', 'numeric/string aliases keep the pre-optimization last-match precedence');
assert.strictEqual(mixed.has(''), false);

// ── Task 1C: physical rows and historical snapshots stay distinct ──────────
// buildRecordsFromRaw_ filters blank rows from the RAW 2D array. Its output
// index is a FILTERED index: nothing here carries physical row numbers, which
// is what lets callers be audited separately for the "index + 2" anti-pattern.
const raw = [
  ['id', 'value', 'value'],              // duplicate header: LAST column wins
  ['A-1', 'old', 'x'],                   // kept; value = 'x' (last duplicate column)
  ['', '', ''],                          // all blank strings -> filtered
  [undefined, undefined, undefined],     // undefined reads as '' -> filtered
  ['', null, null],                      // null stringifies 'null' -> NOT blank, kept
  ['D-4', 0, false]                      // 0/false are values -> kept; value = false
];
const built = ctx.buildRecordsFromRaw_(raw, ['id', 'value', 'value']);
assert.strictEqual(built.length, 3, 'blank rows are filtered, null rows are not');
assert.strictEqual(built[0].id, 'A-1');
assert.strictEqual(built[0].value, 'x', 'duplicate headers collapse, last column wins');
assert.strictEqual(built[1].id, '');
assert.strictEqual(built[1].value, null, 'null is preserved as a value, not blank');
assert.strictEqual(built[2].id, 'D-4');
assert.strictEqual(built[2].value, false, 'false is a value, not blank');

// getReadOnlyRecords_ shares the memo's invalidation lifecycle: a mutation
// clears it, the next read is fresh, and only a LOCAL reference retained
// before the write still reflects the pre-write history.
state.rows = [{ id: 'A-1', value: 'snap-1' }];
ctx.resetRecordCache_();
const snapBefore = ctx.getReadOnlyRecords_('db-1', 'items');
assert.strictEqual(snapBefore[0].value, 'snap-1');
state.rows[0].value = 'snap-2';
ctx.noteMutation_();
const snapAfter = ctx.getReadOnlyRecords_('db-1', 'items');
assert.strictEqual(snapAfter[0].value, 'snap-2', 'read after a mutation is fresh, not the snapshot');
assert.strictEqual(snapBefore[0].value, 'snap-1', 'a retained pre-write reference is the historical snapshot');
// And the snapshot does not survive into the next request either.
ctx.resetRecordCache_();
state.rows[0].value = 'snap-3';
const snapNext = ctx.getReadOnlyRecords_('db-1', 'items');
assert.strictEqual(snapNext[0].value, 'snap-3', 'request reset re-reads');

console.log('optimization_record_cache: PASS');
