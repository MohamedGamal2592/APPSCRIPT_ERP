/**
 * UI-4.4 / U-18 and UI-4.7 / U-23 — grouping with subtotals, and skeleton loads.
 *
 *   node tools/verify/ui4_grouping.js
 *
 * The performance programme owns the chunked renderer. Grouping runs inside it,
 * so the assertions that matter most here are about COST: the group index is
 * built once per render in O(n), the per-row work stays a single comparison,
 * and no server call is added — grouping operates only on rows already loaded.
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

const sb = makeSandbox({ scriptUrl: '#', SESSION_TOKEN: 't', CURRENT_ACTION: 'p' });
S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
  try { vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'u' + i }); } catch (e) {}
});
const UIC = sb.UIC;
const SRC = S.read('UI_Components.html');

const H = [
  { key: 'cust', label: 'العميل' },
  { key: 'item', label: 'الصنف' },
  { key: 'qty', label: 'الكمية', numeric: true },
  { key: 'amt', label: 'المبلغ', money: true }
];
const R = [
  { cust: 'أحمد', item: 'زيت', qty: 2, amt: 100 },
  { cust: 'أحمد', item: 'سكر', qty: 3, amt: 50 },
  { cust: 'سارة', item: 'ملح', qty: 1, amt: 70 },
  { cust: '', item: 'بدون', qty: 4, amt: 5 }
];

/* ── 1. Aggregates are correct ──────────────────────────────────────────── */
(function () {
  UIC.dataTable('g1', { headers: H, rows: R, totals: true });
  const st = sb.window.__dtStore.g1;
  const all = UIC._dtAggregate(st, R);
  ok(all.sums.amt === 225, 'money column sums across all rows', String(all.sums.amt));
  ok(all.sums.qty === 10, 'numeric column sums too', String(all.sums.qty));
  ok(!all.sums.hasOwnProperty('cust') && !all.sums.hasOwnProperty('item'),
    'text columns are not summed');

  const one = UIC._dtAggregate(st, [R[0], R[1]]);
  ok(one.sums.amt === 150, 'a subtotal sums only its own group', String(one.sums.amt));

  /* Values that are not numbers must not poison a total. */
  const messy = UIC._dtAggregate(st, [{ amt: '1,250.50' }, { amt: 'غير محدد' }, { amt: null }, { amt: 10 }]);
  ok(Math.abs(messy.sums.amt - 1260.5) < 0.001,
    'thousands separators parse, and text/null contribute nothing rather than NaN',
    String(messy.sums.amt));
})();

/* ── 2. Grouping also sorts, and says so ────────────────────────────────── */
(function () {
  UIC.dataTable('g2', { headers: H, rows: R.slice() });
  const st = sb.window.__dtStore.g2;
  UIC.dtGroupBy('g2', 'cust');
  ok(st.groupKey === 'cust', 'the group key is set');
  ok(st.sortKey === 'cust' && st.sortDir === 'asc',
    'and the table is sorted by it — a group is only meaningful when its rows are contiguous');

  /* Rows of the same group must now be adjacent. */
  const seen = {};
  let contiguous = true;
  let prev = null;
  st.filtered.forEach(function (r) {
    const g = String(r.cust == null ? '' : r.cust);
    if (g !== prev) { if (seen[g]) contiguous = false; seen[g] = true; prev = g; }
  });
  ok(contiguous, 'every group\'s rows are contiguous after grouping');

  UIC.dtGroupBy('g2', null);
  ok(st.groupKey === null, 'grouping can be turned off again');
})();

/* ── 3. The group header row ────────────────────────────────────────────── */
(function () {
  UIC.dataTable('g3', { headers: H, rows: R });
  const st = sb.window.__dtStore.g3;
  const html = UIC._dtGroupRowHtml(st, 'أحمد', 'أحمد', [R[0], R[1]]);

  ok(/class="dt-group"/.test(html), 'it is a group row');
  ok(/dt-group-count">2</.test(html), 'showing how many records it holds');
  ok(/150\.00/.test(html), 'and the subtotal of the money column', html.slice(0, 200));
  ok(/aria-expanded="true"/.test(html), 'the collapse toggle declares its state');

  st.collapsed = { 'أحمد': true };
  const collapsed = UIC._dtGroupRowHtml(st, 'أحمد', 'أحمد', [R[0], R[1]]);
  ok(/aria-expanded="false"/.test(collapsed), 'and updates it when collapsed');

  /* A blank group value must still render something a user can click. */
  const blank = UIC._dtGroupRowHtml(st, '—', '', [R[3]]);
  ok(/dt-group-label">—</.test(blank), 'an empty group value renders as a dash, not as nothing');
})();

/* ── 4. Collapsing hides the rows ───────────────────────────────────────── */
(function () {
  UIC.dataTable('g4', { headers: H, rows: R });
  const st = sb.window.__dtStore.g4;
  UIC.dtGroupBy('g4', 'cust');
  UIC.dtToggleGroup('g4', 'أحمد');
  ok(st.collapsed['أحمد'] === true, 'toggling collapses the group');
  UIC.dtToggleGroup('g4', 'أحمد');
  ok(!st.collapsed['أحمد'], 'and toggling again expands it');

  /* The renderer must skip collapsed rows. */
  const renderer = /UIC\._renderChunked = function[\s\S]*?\n};/.exec(SRC)[0];
  ok(/st\.collapsed && st\.collapsed\[gid\]\) continue;/.test(renderer),
    'the render loop skips the rows of a collapsed group');
})();

/* ── 5. Cost: no extra pass, no server call ─────────────────────────────── */
(function () {
  const renderer = /UIC\._renderChunked = function[\s\S]*?\n};/.exec(SRC)[0];
  ok(!/API\.call|google\.script\.run|companyCall/.test(renderer),
    'grouping adds NO server call — it works on rows already loaded');

  /* The group index is built once, outside the chunk loop. */
  const beforeLoop = renderer.slice(0, renderer.indexOf('function tick()'));
  ok(/view\.forEach\(/.test(beforeLoop),
    'the group index is built ONCE per render, before the chunk loop');
  const insideLoop = renderer.slice(renderer.indexOf('function tick()'));
  ok(!/view\.forEach\(/.test(insideLoop),
    'and not rebuilt per chunk');
  ok(/const CHUNK = 75, BUDGET = 12;/.test(renderer),
    'the 75-row / 12ms chunk budget the performance run set is untouched');

  const agg = /UIC\._dtAggregate = function[\s\S]*?\n};/.exec(SRC)[0];
  ok(!/API\.call|google\.script\.run/.test(agg), 'aggregates make no server call either');
})();

/* ── 6. The column footer ───────────────────────────────────────────────── */
(function () {
  UIC.dataTable('g5', { headers: H, rows: R, totals: true });
  const st = sb.window.__dtStore.g5;
  ok(st.opts.totals === true, 'the footer is opt-in with totals: true');

  UIC.dataTable('g6', { headers: H, rows: R });
  const src = /UIC\._dtRefreshFooter = function[\s\S]*?\n};/.exec(SRC)[0];
  ok(/if \(!\(st\.opts && st\.opts\.totals\)\) return;/.test(src),
    'and a table that did not ask for it gets no footer at all');
})();

/* ── 7. Skeleton loading, and the rule it establishes ───────────────────── */
(function () {
  ok(typeof UIC.listSkeleton === 'function', 'UIC.listSkeleton exists');
  ok(typeof UIC.listProgress === 'function', 'UIC.listProgress exists');

  const host = sb.document.createElement('div');
  host.id = 'lh';
  sb.document.body.appendChild(host);

  UIC.listSkeleton('lh', H, 5);
  ok(String(host.innerHTML).indexOf('pt-sk-bar') !== -1,
    'the skeleton draws ghost rows rather than a blocking scrim');
  ok(String(host.innerHTML).indexOf('table-wrap') !== -1, 'inside a normal table container');

  const skel = /UIC\.listSkeleton = function[\s\S]*?\n};/.exec(SRC)[0];
  ok(!/showPageLoading|showSpinner/.test(skel),
    'reading a list does NOT raise the blocking overlay — that is reserved for saves');

  const css = S.allCss(SRC);
  ok(/\.dt-progress\s*\{/.test(css), 'the inline refresh progress bar is styled');
  ok(/prefers-reduced-motion[^}]*\}\s*[^@]*\.dt-progress/.test(css) ||
     /\.dt-progress\s*\{\s*animation:\s*none/.test(css),
    'and it stops animating under prefers-reduced-motion');
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-4.4/4.7 grouping and skeletons: all assertions pass.');
