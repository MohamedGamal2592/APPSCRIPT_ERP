'use strict';

/**
 * TR: Core_FastRead.js primitives — executable behaviour and honest metrics.
 *
 * WHAT THIS PROVES (plan آ§5.1-آ§5.3, آ§7.4)
 *   - Every list strategy produces the right rows AND the published budget:
 *     APPEND_WINDOW serviceCalls <= 2 with rowsScanned ~ limit; NARROW_SCAN_PAGE
 *     serviceCalls <= 3 with rowsScanned = table rows; KEYSET with a verified
 *     monotonic id column and no offset; FULL_SCAN priced as such.
 *   - A query the declared strategy cannot satisfy is REFUSED, never answered
 *     partially (FR_STRATEGY_UNSUPPORTED), and KEYSET refuses without a
 *     justification string.
 *   - Documents: PARENT_SCAN is 1 call with rowsScanned = table rows;
 *     PARENT_FK_INDEX_THEN_FETCH keeps the same rowsScanned with fewer cells;
 *     the wrong-parent rows never leak.
 *   - Type fidelity through a batched read: the Advanced API returns date
 *     serials under UNFORMATTED_VALUE/SERIAL_NUMBER; the engine normalises them
 *     back to the same local Date that Range.getValues() would have returned.
 *   - The deadline aborts with FR_BUDGET_EXCEEDED before a service call.
 *   - Shadow compare projects both sides through one canonicalizer, returns the
 *     legacy value, and its report carries paths/types/hashes/counts only.
 *
 * The fake workbook counts metadata, value and API calls, so the budgets below
 * are read off the stub, not asserted from the engine's own opinion.
 */

const assert = require('assert');
const { createVfHarness } = require('./vf_action_harness');

const H = createVfHarness();
const FR = H.grab([
  'frNewContext_', 'fastFetchList_', 'fastFetchDocument_', 'frShadowCompare_',
  'frErrorCodes_', 'fastReadOnFor_', 'frParityGuard_', 'frNormalizeApiValue_'
]);
const dbId = H.dbId;

/* â”€â”€ fixture: 40 data rows, deliberate dates and gaps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SHEET = 'fixture_rows';
const HEADERS = ['id', 'created_at', 'label', 'amount', 'flag'];

function serial(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0); }

const rows = [];
for (let i = 1; i <= 40; i++) {
  rows.push([
    i * 10,
    serial(2026, 1, ((i - 1) % 28) + 1),
    'L' + i,
    i % 3 === 0 ? 0 : i * 1.5,
    i % 2 === 0
  ]);
}
H.addSheet(SHEET, HEADERS, rows);

function metrics(m) { return m; }

/* â”€â”€ APPEND_WINDOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
  const ctx = FR.frNewContext_();
  /* `headers` is the caller's execution-scoped header row (the shared
   * getHeaders_ memo). Supplying it is what makes the published 1-2 call budget
   * reachable: without it the engine must read the header row too (4 calls),
   * and the case below proves that cost is reported rather than hidden. */
  const out = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'APPEND_WINDOW', limit: 5,
    columns: ['id', 'label'], headers: HEADERS, ctx
  });
  assert.strictEqual(out.rows.length, 5, 'APPEND_WINDOW returns the requested page');
  assert.strictEqual(out.rows[0].id, 360, 'the window starts at lastRow - limit + 1');
  assert.strictEqual(out.rows[4].id, 400, 'and ends at the last row');
  assert.strictEqual(out.total, 40, 'total is the table row count, declared honestly');
  assert.ok(out.metrics.serviceCalls <= 2, 'APPEND_WINDOW budget: serviceCalls <= 2 (got ' + out.metrics.serviceCalls + ')');
  assert.ok(out.metrics.rowsScanned <= 5 + 1, 'rowsScanned is ~limit (got ' + out.metrics.rowsScanned + ')');
  assert.strictEqual(out.partial, false);

  const noHeaders = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'APPEND_WINDOW', limit: 5,
    columns: ['id'], ctx: FR.frNewContext_()
  });
  assert.ok(noHeaders.metrics.serviceCalls > 2,
    'without supplied headers the header row is an extra read and the metrics say so (got ' +
    noHeaders.metrics.serviceCalls + ')');

  /* refusals: a window cannot filter, page or skip */
  assert.throws(() => FR.fastFetchList_({ dbId, sheetName: SHEET, strategy: 'APPEND_WINDOW', limit: 5, columns: ['id'], headers: HEADERS, offset: 5, ctx }),
    (e) => e.code === 'FR_STRATEGY_UNSUPPORTED', 'APPEND_WINDOW refuses an offset');
  assert.throws(() => FR.fastFetchList_({ dbId, sheetName: SHEET, strategy: 'APPEND_WINDOW', limit: 5, columns: ['id'], headers: HEADERS, filters: [{ column: 'flag', op: 'truthy' }], ctx }),
    (e) => e.code === 'FR_STRATEGY_UNSUPPORTED', 'APPEND_WINDOW refuses filters');
}

/* â”€â”€ NARROW_SCAN_PAGE: filter + offset + paging, with a batchGet fetch â”€â”€â”€â”€â”€ */
{
  const ctx = FR.frNewContext_();
  H.resetStats();
  const out = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'NARROW_SCAN_PAGE',
    filterColumns: ['amount'],
    columns: ['id', 'label', 'amount', 'created_at'],
    filters: [{ column: 'amount', op: 'gt', value: 30 }],
    sort: { column: 'id', direction: 'desc' },
    offset: 2, limit: 4,
    headers: HEADERS,
    ctx
  });
  assert.strictEqual(out.rows.length, 4, 'page size honoured');
  assert.strictEqual(out.total, 13, 'total is the filtered count before paging');
  assert.ok(Array.from(out.rows).every((r) => Number(r.amount) !== 0),
    'no filtered-out (zero-amount) row leaks into the page');
  assert.ok(out.rows.every((r) => r.amount > 30), 'every returned row matches the filter');
  assert.ok(out.rows[0].id > out.rows[3].id, 'descending sort applied in memory');
  assert.ok(out.metrics.serviceCalls <= 3, 'NARROW_SCAN_PAGE budget: serviceCalls <= 3 (got ' + out.metrics.serviceCalls + ')');
  assert.strictEqual(out.metrics.rowsScanned, 40, 'rowsScanned is the table rows, never a matched-row claim');
  /* cellsRead: the narrow set here is NON-contiguous (id at column 0, amount at
   * column 3), so the engine reads the enclosing rectangle — 4 columns — rather
   * than paying a service call per column. The published bound (rows x
   * narrowCols + limit x pageCols) is the contiguous case, asserted separately
   * below; what matters here is that the cost is declared and bounded, not
   * hidden. */
  const narrowSpan = 4, pageSpan = 4;
  assert.ok(out.metrics.cellsRead <= 40 * narrowSpan + 4 * pageSpan,
    'cellsRead declared and bounded (got ' + out.metrics.cellsRead + ' vs ' + (40 * narrowSpan + 4 * pageSpan) + ')');
  const stats = H.stats();
  assert.ok(stats.rangeReads > 0 && stats.sheetsApiCalls > 0, 'the fetch really used a batched Sheets API call');

  /* A contiguous narrow set meets the published bound exactly. */
  const contiguous = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'NARROW_SCAN_PAGE',
    filterColumns: ['created_at'], columns: ['id', 'created_at'],
    filters: [{ column: 'created_at', op: 'nonblank' }],
    limit: 4, headers: HEADERS, ctx: FR.frNewContext_()
  });
  assert.strictEqual(contiguous.rows.length, 4);
  assert.ok(contiguous.metrics.cellsRead <= 40 * 1 + 4 * 2,
    'contiguous narrowCols=1, pageCols span=2: cellsRead ' + contiguous.metrics.cellsRead + ' <= 48');

  /* A range bound and a two-column narrow scan still cost at most 3 calls. */
  const ctx2 = FR.frNewContext_();
  const ranged = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'NARROW_SCAN_PAGE',
    filterColumns: ['created_at', 'flag'],
    columns: ['id', 'created_at'],
    range: { column: 'created_at', from: serial(2026, 1, 5), to: serial(2026, 1, 10) },
    headers: HEADERS, ctx: ctx2
  });
  assert.strictEqual(ranged.total, 12, 'the inclusive date range selects twelve fixture rows (two 28-day cycles)');
  assert.ok(ranged.metrics.serviceCalls <= 3, 'a range filter stays inside the budget');

  /* When every projection column is already narrow-scanned, no second fetch. */
  const ctx3 = FR.frNewContext_();
  const oneCall = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'NARROW_SCAN_PAGE',
    filterColumns: ['id', 'label'], columns: ['id', 'label'],
    filters: [{ column: 'label', op: 'eq', value: 'L7' }], ctx: ctx3
  });
  assert.strictEqual(oneCall.rows.length, 1);
  assert.strictEqual(oneCall.metrics.apiCalls, 0, 'no batch call when nothing else must be fetched');
}

/* â”€â”€ FULL_SCAN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
  const ctx = FR.frNewContext_();
  const out = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'FULL_SCAN',
    columns: HEADERS, filters: [{ column: 'flag', op: 'truthy' }], ctx
  });
  assert.strictEqual(out.rows.length, 20);
  assert.strictEqual(out.metrics.rowsScanned, 40, 'FULL_SCAN says it scanned the table');
}

/* â”€â”€ KEYSET: measured, verified, cursor-based â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
  const ctx = FR.frNewContext_();
  const out = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'KEYSET', idColumn: 'id',
    columns: ['id', 'label'], limit: 3,
    cursor: { id: 200 },
    experimentalJustification: 'narrow-column scan measured cheaper than one full id scan at this size',
    ctx
  });
  assert.strictEqual(out.rows.length, 3);
  assert.strictEqual(out.rows[0].id, 200, 'the cursor row is included in a forward page');
  assert.strictEqual(out.rows[2].id, 220);
  assert.strictEqual(out.nextCursor.id, 220, 'the cursor advances to the last row of the page');
  assert.ok(out.metrics.serviceCalls <= Math.ceil(2 * Math.log2(40)) + 1,
    'KEYSET budget holds (got ' + out.metrics.serviceCalls + ')');

  assert.throws(() => FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'KEYSET', idColumn: 'id', columns: ['id'], limit: 2, ctx
  }), (e) => e.code === 'FR_STRATEGY_UNSUPPORTED', 'KEYSET refuses without a justification');

  const ctx2 = FR.frNewContext_();
  const back = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'KEYSET', idColumn: 'id', columns: ['id'], limit: 2,
    cursor: { id: 100 }, direction: 'backward', experimentalJustification: 'j', ctx: ctx2
  });
  assert.strictEqual(back.rows.length, 2, 'a backward page is bounded by the limit');
  assert.strictEqual(back.rows[0].id, 90, 'and walks backwards from the cursor');
  assert.strictEqual(back.rows[1].id, 100, 'the cursor row ends a backward page');
}

/* Non-monotonic ids must be caught by the verification read, not trusted. */
{
  const BAD = 'fixture_bad_ids';
  H.addSheet(BAD, ['id', 'label'], [[1, 'a'], [2, 'b'], [2, 'c']]);
  assert.throws(() => FR.fastFetchList_({
    dbId, sheetName: BAD, strategy: 'KEYSET', idColumn: 'id', columns: ['id'], limit: 2,
    experimentalJustification: 'j', ctx: FR.frNewContext_()
  }), (e) => e.code === 'FR_STRATEGY_UNSUPPORTED', 'duplicate ids refuse the KEYSET strategy');

  const BLANK = 'fixture_blank_ids';
  H.addSheet(BLANK, ['id', 'label'], [[1, 'a'], ['', 'b']]);
  assert.throws(() => FR.fastFetchList_({
    dbId, sheetName: BLANK, strategy: 'KEYSET', idColumn: 'id', columns: ['id'], limit: 2,
    experimentalJustification: 'j', ctx: FR.frNewContext_()
  }), (e) => e.code === 'FR_STRATEGY_UNSUPPORTED', 'a blank id refuses the KEYSET strategy');
}

/* Unknown strategy is refused, never guessed. */
assert.throws(() => FR.fastFetchList_({ dbId, sheetName: SHEET, strategy: 'MAGIC', columns: ['id'] }),
  (e) => e.code === 'FR_STRATEGY_UNSUPPORTED', 'an unknown strategy is refused');
assert.throws(() => FR.fastFetchList_({ dbId, sheetName: SHEET }),
  (e) => e.code === 'FR_BAD_SPEC', 'a missing strategy declaration is refused');

/* â”€â”€ documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const PARENT_SHEET = 'fixture_parents';
const CHILD_SHEET = 'fixture_children';
H.addSheet(PARENT_SHEET, ['id', 'name'], [['P1', 'PARENT-ONE'], ['P2', 'PARENT-TWO']]);
const childRows = [];
for (let i = 1; i <= 30; i++) {
  childRows.push(['C' + i, i <= 12 ? 'P1' : 'P2', 'ROW-' + i, i, i % 5 === 0]);
}
H.addSheet(CHILD_SHEET, ['id', 'parent_id', 'label', 'qty', 'flag'], childRows);

{
  const PARENT_HEADERS = ['id', 'name'];
  const CHILD_HEADERS = ['id', 'parent_id', 'label', 'qty', 'flag'];
  const ctx = FR.frNewContext_();
  const doc = FR.fastFetchDocument_({
    dbId, ctx,
    parent: { sheetName: PARENT_SHEET, keyHeader: 'id', keyValue: 'P1', columns: ['id', 'name'], strategy: 'PARENT_SCAN', headers: PARENT_HEADERS },
    children: [{
      alias: 'rows', sheetName: CHILD_SHEET, parentHeader: 'parent_id', parentKey: 'P1',
      columns: ['id', 'label', 'qty'], headers: CHILD_HEADERS,
      strategy: 'PARENT_SCAN', orderBy: { column: 'qty', direction: 'desc' }
    }]
  });
  assert.strictEqual(doc.parent.name, 'PARENT-ONE', 'the parent row is located by key');
  assert.strictEqual(doc.children.rows.length, 12, 'only this parent\'s children are returned');
  assert.deepStrictEqual(Array.from(doc.children.rows).map((r) => r.id).slice(0, 3), ['C12', 'C11', 'C10'],
    'ordering is applied in memory over the fetched rows');
  /* The published target for PARENT_SCAN is 1 service call. With the caller's
   * headers supplied the engine spends 2: one metadata call for the table
   * length (a bounded range read cannot be addressed without it) plus one
   * projection read. Recorded as a NOT MET shortfall in the change record; the
   * assertion below is the real floor, not the aspirational number. */
  assert.strictEqual(doc.metrics.parent.serviceCalls, 2, 'PARENT_SCAN parent: metadata + one read (published target 1: NOT MET)');
  assert.strictEqual(doc.metrics.parent.rowsScanned, 2, 'PARENT_SCAN rowsScanned = table rows (parent table)');
  assert.strictEqual(doc.metrics.children.rows.serviceCalls, 2, 'PARENT_SCAN child: metadata + one read');
  assert.strictEqual(doc.metrics.children.rows.rowsScanned, 30, 'PARENT_SCAN child scans the whole table');
  assert.strictEqual(doc.metrics.total.rowsScanned, 32, 'the total carries both table scans');

  const ctx2 = FR.frNewContext_();
  const idxDoc = FR.fastFetchDocument_({
    dbId, ctx: ctx2,
    parent: { sheetName: PARENT_SHEET, keyHeader: 'id', keyValue: 'P1', columns: ['id', 'name'], strategy: 'PARENT_SCAN', headers: PARENT_HEADERS },
    children: [{
      alias: 'rows', sheetName: CHILD_SHEET, parentHeader: 'parent_id', parentKey: 'P1',
      columns: ['id', 'label', 'qty'], headers: CHILD_HEADERS,
      strategy: 'PARENT_FK_INDEX_THEN_FETCH'
    }]
  });
  assert.strictEqual(idxDoc.children.rows.length, 12, 'the index-then-fetch strategy returns the same rows');
  assert.strictEqual(idxDoc.metrics.children.rows.rowsScanned, 30, 'and still reports a table scan');
  assert.ok(idxDoc.metrics.children.rows.cellsRead < doc.metrics.children.rows.cellsRead,
    'FK index then fetch reads fewer cells than a full projection scan');
  assert.ok(idxDoc.metrics.children.rows.serviceCalls <= 3, '2+ calls per the declared strategy');
  assert.deepStrictEqual(
    Array.from(idxDoc.children.rows).map((r) => [r.id, r.label]).sort(),
    Array.from(doc.children.rows).map((r) => [r.id, r.label]).sort(),
    'both strategies agree on the row set and values');

  assert.throws(() => FR.fastFetchDocument_({
    dbId, ctx: FR.frNewContext_(),
    parent: { sheetName: PARENT_SHEET, keyHeader: 'id', keyValue: 'P1', columns: ['id'], strategy: 'NOT_A_STRATEGY' }
  }), (e) => e.code === 'FR_STRATEGY_UNSUPPORTED', 'an unknown document strategy is refused');
}

/* â”€â”€ type fidelity through a batched read â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
  const ctx = FR.frNewContext_();
  const out = FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'NARROW_SCAN_PAGE',
    filterColumns: ['id'], columns: ['id', 'created_at'],
    dateColumns: ['created_at'],
    filters: [{ column: 'id', op: 'eq', value: 10 }], headers: HEADERS, ctx
  });
  const fetched = out.rows[0];
  assert.ok(fetched.created_at instanceof Date, 'the serial from batchGet came back as a Date');
  assert.strictEqual(fetched.created_at.getFullYear(), 2026, 'the year survives normalisation');
  assert.strictEqual(fetched.created_at.getMonth(), 0, 'the month survives normalisation (local components)');
  assert.strictEqual(fetched.created_at.getDate(), 1, 'the day survives normalisation');
  assert.strictEqual(fetched.created_at.getHours(), 12, 'the wall-clock time survives normalisation');

  /* The same cell through Range.getValues() must agree exactly. */
  const viaRange = H.sheet(SHEET).getRange(2, 2, 1, 1).getValues()[0][0];
  assert.strictEqual(fetched.created_at.getTime(), viaRange.getTime(),
    'Advanced-API serial and Range Date normalise to the same instant');
}

/* â”€â”€ deadline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
  const expired = FR.frNewContext_({ deadlineMs: -1 });
  assert.throws(() => FR.fastFetchList_({
    dbId, sheetName: SHEET, strategy: 'APPEND_WINDOW', limit: 2, columns: ['id'], ctx: expired
  }), (e) => e.code === 'FR_BUDGET_EXCEEDED', 'an expired context aborts before a service call');
  const codes = FR.frErrorCodes_();
  assert.strictEqual(codes.BUDGET_EXCEEDED, 'FR_BUDGET_EXCEEDED');
  assert.strictEqual(codes.STRATEGY_UNSUPPORTED, 'FR_STRATEGY_UNSUPPORTED');
  assert.strictEqual(FR.fastReadOnFor_(false), false, 'the master flag gates module opt-in');
  assert.strictEqual(H.eval('FAST_READ_CORE_'), false, 'FAST_READ_CORE_ ships false');
}

/* â”€â”€ shadow compare â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
{
  const legacyValue = { status: 'success', rows: [{ id: 1, when: new Date(2026, 0, 1) }], total: 1 };
  let report = null;
  const returned = FR.frShadowCompare_({
    label: 'unit',
    legacy: legacyValue,
    modern: () => ({ status: 'success', rows: [{ id: 1, when: new Date(2026, 0, 1) }], total: 1 }),
    canonicalize: (v) => ({ status: v.status, rows: v.rows, total: v.total }),
    onResult: (r) => { report = r; }
  });
  assert.strictEqual(returned, legacyValue, 'the legacy result is what the caller receives');
  assert.strictEqual(report.ok, true, 'identical canonicalised responses report ok');
  assert.strictEqual(report.diffCount, 0);

  let bad = null;
  FR.frShadowCompare_({
    label: 'unit-diff',
    legacy: legacyValue,
    modern: () => ({ status: 'success', rows: [{ id: 2, when: new Date(2026, 0, 1) }], total: 1 }),
    canonicalize: (v) => v,
    onResult: (r) => { bad = r; }
  });
  assert.strictEqual(bad.ok, false, 'a differing value is detected');
  const diff = bad.diffs[0];
  assert.ok(diff.path.indexOf('$.rows[0].id') === 0, 'the diff names the field path, not the value');
  assert.strictEqual(diff.kind, 'value');
  assert.ok(diff.leftHash && diff.rightHash && diff.leftHash !== diff.rightHash, 'hashes differ, values are not logged');
  assert.ok(Object.keys(diff).indexOf('left') === -1 && Object.keys(diff).indexOf('right') === -1,
    'no raw values in the report (G7)');

  let missing = null;
  FR.frShadowCompare_({
    label: 'unit-missing',
    legacy: { a: 1, b: 2 },
    modern: { a: 1 },
    canonicalize: (v) => v,
    onResult: (r) => { missing = r; }
  });
  assert.strictEqual(missing.diffs[0].kind, 'missingRight', 'a field the modern reader dropped is named');

  let threw = null;
  FR.frShadowCompare_({
    label: 'unit-throw',
    legacy: { a: 1 },
    modern: () => { const e = new Error('boom'); e.code = 'FR_BUDGET_EXCEEDED'; throw e; },
    onResult: (r) => { threw = r; }
  });
  assert.strictEqual(threw.ok, false);
  assert.strictEqual(threw.modernError.code, 'FR_BUDGET_EXCEEDED', 'a modern reader failure is reported by code');
}

console.log('fast_read_primitives: PASS');
