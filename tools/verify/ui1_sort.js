/**
 * UI-1.3 / U-03 — tri-state sort, preserved load order, sort indicators.
 *
 *   node tools/verify/ui1_sort.js
 *
 * Two things are proved here.
 *
 * 1. EQUIVALENCE. The comparator was rewritten, so it is run against a faithful
 *    copy of the ORIGINAL comparator (reproduced below from the code this
 *    commit replaces) over randomised data. Ascending and descending results
 *    must be identical, element for element. A sort that quietly reorders rows
 *    differently from before would be invisible in a static check and obvious
 *    to a user who knows their data.
 *
 * 2. THE LOAD ORDER SURVIVES. That is the actual bug: `st.filtered` was the same
 *    array object as `st.rows` and as the caller's own array, so one click on a
 *    header destroyed the server's order permanently. The third sort state has
 *    nothing to restore unless that is fixed.
 */
'use strict';

const vm = require('vm');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

const sb = makeSandbox({ innerWidth: 1440, innerHeight: 900 });
S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
  vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'UI_Components#' + i });
});
const UIC = sb.UIC;

/* ── The original comparator, verbatim in behaviour ─────────────────────── */
/* From UI_Components.html before this commit: decorate, sort, undecorate, with
   the direction folded into the comparator and no tie-break. */
function originalSort(list, headers, key, asc) {
  const hIdx = headers.findIndex(h => (h.key || h.label) === key);
  const sortKey = (hIdx !== -1 && headers[hIdx].sortKey) ? headers[hIdx].sortKey : null;
  const decorated = list.map(function (r) {
    let raw;
    if (Array.isArray(r)) raw = r[hIdx];
    else if (sortKey) raw = r[sortKey];
    else raw = r[key];
    const s = (raw == null) ? '' : String(raw);
    const n = parseFloat(s.replace(/,/g, ''));
    return { r: r, s: s, n: n, isNum: !isNaN(n) && s.trim() !== '' };
  });
  decorated.sort(function (a, b) {
    if (a.isNum && b.isNum) return asc ? a.n - b.n : b.n - a.n;
    return asc ? a.s.localeCompare(b.s, 'ar') : b.s.localeCompare(a.s, 'ar');
  });
  return decorated.map(d => d.r);
}

/* ── Randomised data, deliberately awkward ──────────────────────────────── */
let seed = 20260906;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }

const NAMES = ['زيت', 'دقيق', 'سكر', 'ملح', 'خميرة', 'نشا', 'حمض', 'عبوة', 'كرتون', 'ملصق'];
function makeRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: i,
      /* Ties, blanks, thousands separators, numeric strings, nulls and mixed
         numeric/textual columns — every case the comparator branches on. */
      name: pick(NAMES),
      qty: pick([0, 1, 12.5, '1,234.5', '', null, '7', 7, -3, 1000000]),
      code: pick(['A-1', 'A-10', 'A-2', '', 'b-1', 'B-2', null]),
      mixed: pick([1, 'نص', '2', '', null, 3.5])
    });
  }
  return out;
}

const HEADERS = [
  { key: 'name', label: 'الصنف' },
  { key: 'qty', label: 'الكمية', numeric: true },
  { key: 'code', label: 'الكود' },
  { key: 'mixed', label: 'مختلط' },
  { key: 'actions', label: '' }
];

/* ── 1. Differential: new comparator === old comparator ─────────────────── */
(function () {
  let mismatches = 0, compared = 0;
  for (let trial = 0; trial < 60; trial++) {
    const rows = makeRows(40 + Math.floor(rnd() * 60));
    ['name', 'qty', 'code', 'mixed'].forEach(function (key) {
      ['asc', 'desc'].forEach(function (dir) {
        const expected = originalSort(rows.slice(), HEADERS, key, dir === 'asc');

        const st = {
          headers: HEADERS,
          filtered: rows.slice(),
          sortKey: key,
          sortDir: dir
        };
        sb.window.__dtStore = sb.window.__dtStore || {};
        sb.window.__dtStore.__diff = st;
        UIC._applySort('__diff');

        compared++;
        for (let i = 0; i < expected.length; i++) {
          if (st.filtered[i] !== expected[i]) {
            mismatches++;
            if (mismatches <= 3) {
              console.log('        first divergence: key=' + key + ' dir=' + dir + ' at ' + i +
                ' expected id=' + expected[i].id + ' got id=' + st.filtered[i].id);
            }
            break;
          }
        }
      });
    });
  }
  ok(mismatches === 0,
    'differential: ' + compared + ' randomised sorts match the original comparator exactly',
    mismatches + ' mismatched');
})();

/* ── 2. The sort is stable ──────────────────────────────────────────────── */
(function () {
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push({ id: i, g: i % 3 });
  const st = { headers: [{ key: 'g', label: 'g' }], filtered: rows.slice(), sortKey: 'g', sortDir: 'asc' };
  sb.window.__dtStore.__stable = st;
  UIC._applySort('__stable');
  let stable = true;
  for (let i = 1; i < st.filtered.length; i++) {
    const a = st.filtered[i - 1], b = st.filtered[i];
    if (a.g === b.g && a.id > b.id) stable = false;
  }
  ok(stable, 'rows that compare equal keep their load order (stable sort)');
})();

/* ── 3. Tri-state cycle ─────────────────────────────────────────────────── */
(function () {
  ok(UIC._dtNextSortDir(null) === 'asc', 'cycle: none -> asc');
  ok(UIC._dtNextSortDir('asc') === 'desc', 'cycle: asc -> desc');
  ok(UIC._dtNextSortDir('desc') === null, 'cycle: desc -> none (load order)');
})();

/* ── 4. The load order survives sorting — the actual defect ─────────────── */
(function () {
  const rows = makeRows(80);
  const callerCopy = rows.slice();           /* what the page passed in */
  UIC.dataTable('dt1', { headers: HEADERS, rows: rows, autoPage: false });
  const st = sb.window.__dtStore.dt1;

  ok(st.originalRows && st.originalRows.length === rows.length,
    'store keeps an originalRows snapshot');
  ok(st.filtered !== rows && st.originalRows !== rows,
    'filtered and originalRows are their own arrays, not the caller\'s');

  /* Sort ascending, then descending, then back to load order. */
  st.sortKey = 'name'; st.sortDir = 'asc'; UIC._applyFilters('dt1');
  st.sortDir = 'desc'; UIC._applyFilters('dt1');

  let callerIntact = true;
  for (let i = 0; i < callerCopy.length; i++) if (rows[i] !== callerCopy[i]) callerIntact = false;
  ok(callerIntact, 'the caller\'s own array is never reordered');

  let originalIntact = true;
  for (let i = 0; i < callerCopy.length; i++) if (st.originalRows[i] !== callerCopy[i]) originalIntact = false;
  ok(originalIntact, 'originalRows still holds the load order after two sorts');

  /* Third state. */
  st.sortKey = null; st.sortDir = null; UIC._applyFilters('dt1');
  let restored = true;
  for (let i = 0; i < callerCopy.length; i++) if (st.filtered[i] !== callerCopy[i]) restored = false;
  ok(restored, 'the third sort state restores the original order exactly');
})();

/* ── 5. Search and sort compose, and clearing search keeps the sort ─────── */
(function () {
  const rows = makeRows(120);
  UIC.dataTable('dt2', { headers: HEADERS, rows: rows, autoPage: false });
  const st = sb.window.__dtStore.dt2;

  st.sortKey = 'name'; st.sortDir = 'asc';
  st.searchTerm = 'زيت';
  UIC._applyFilters('dt2');
  const allMatch = st.filtered.every(r => JSON.stringify(r).indexOf('زيت') !== -1);
  ok(allMatch, 'search narrows the set');
  let sorted = true;
  for (let i = 1; i < st.filtered.length; i++) {
    if (String(st.filtered[i - 1].name).localeCompare(String(st.filtered[i].name), 'ar') > 0) sorted = false;
  }
  ok(sorted, 'the filtered set is still sorted (search -> filter -> sort -> slice)');

  st.searchTerm = '';
  UIC._applyFilters('dt2');
  ok(st.filtered.length === rows.length, 'clearing the search restores every row');
  let stillSorted = true;
  for (let i = 1; i < st.filtered.length; i++) {
    if (String(st.filtered[i - 1].name).localeCompare(String(st.filtered[i].name), 'ar') > 0) stillSorted = false;
  }
  ok(stillSorted, 'clearing the search keeps the active sort');
})();

/* ── 6. Column opt-out and the emitted header markup ────────────────────── */
(function () {
  const html = UIC.dataTable('dt3', {
    headers: [
      { key: 'a', label: 'كود' },
      { key: 'b', label: 'اسم', sortable: false },
      { key: 'actions', label: 'إجراءات' }
    ],
    rows: [{ a: 1, b: 2, actions: '' }]
  });
  /* scope="col" was added by step 6.3; the assertions move with it.
   *
   * UPDATED by the table column-width run (UI-9.1), and the reason is recorded
   * here rather than in a commit nobody will re-read:
   *
   *   Every <th> now carries a col-* class naming what the column HOLDS, which
   *   is the whole of the width contract. It sits between data-key and
   *   data-sortable, so a reference that spelled out the full tag no longer
   *   matches. All three columns here classify as `atom`: 'كود' and 'اسم' hold
   *   single short unbreakable values, and the actions column has no data at
   *   all, so it falls back to its own label.
   *
   * What these two lines actually guard is the SORT contract — that a sortable
   * column advertises itself to assistive tech and that sortable:false opts a
   * column out completely. Neither is weakened: the class is added to the
   * reference markup, and the negative assertion still proves that column b
   * carries no data-sortable in any form. */
  ok(/<th scope="col" data-key="a" class="col-atom" data-sortable="true" aria-sort="none">/.test(html),
    'a sortable column advertises data-sortable and aria-sort="none"');
  ok(/<th scope="col" data-key="b" class="col-atom">/.test(html) && !/data-key="b"[^>]*data-sortable/.test(html),
    'sortable:false opts a column out entirely');
  ok(/<th scope="col"/.test(html),
    'and every header carries scope="col" (U-31/6.3)');
  ok(!/data-key="actions" data-sortable/.test(html),
    'the actions column is opted out automatically');
  ok((html.match(/class="th-sort"/g) || []).length === 1,
    'exactly one chevron — only on the sortable column');
  ok(/<span class="th-label">كود<\/span>/.test(html),
    'the header label is wrapped so the chevron cannot be sorted into the text');
})();

/* ── 7. Backwards compatibility: string headers and array rows ──────────── */
(function () {
  const html = UIC.dataTable('dt4', {
    headers: ['كود', 'اسم'],
    rows: [['A', 'ب'], ['B', 'أ']]
  });
  ok(/data-key="__col0"/.test(html), 'plain-string headers still become positional columns');
  const st = sb.window.__dtStore.dt4;
  st.sortKey = '__col0'; st.sortDir = 'desc';
  UIC._applySort('dt4');
  ok(st.filtered[0][0] === 'B', 'array rows still sort by index', JSON.stringify(st.filtered[0]));
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-1.3 sort: all assertions pass.');
