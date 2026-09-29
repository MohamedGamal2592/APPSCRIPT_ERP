/**
 * UI-1.5 / U-05 — the sticky table header, and the scroll region it needs.
 *
 *   node tools/verify/ui1_sticky.js
 *
 * This step is a trap, and the test exists to make sure it was not fallen into.
 *
 * The obvious change is `.table thead th { position: sticky; top: 0 }`. On its
 * own that is a NO-OP on every list page in this project. A sticky element
 * sticks within its nearest scrollport; `.table-wrap` sets `overflow-x: auto`,
 * and the CSS overflow spec computes the other axis from `visible` to `auto`
 * when one axis is not visible — so `.table-wrap` was already the scrollport,
 * and it was exactly as tall as its content, giving the header a scroll range
 * of zero. It would have looked done and changed nothing.
 *
 * So the assertions below check the whole mechanism, not just the one property:
 * the scroll range, the opaque background, the stacking order against the
 * topbar, and the print reset without which a printed table is clipped.
 */
'use strict';

const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

const css = S.allCss(S.read('UI_Components.html'));

function ruleBody(source, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|[}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}', 'm');
  const m = source.match(re);
  return m ? m[1] : null;
}

/* ── The header itself ──────────────────────────────────────────────────── */
const th = ruleBody(css, '.table thead th');
ok(!!th, '.table thead th rule found');
ok(/position:\s*sticky/.test(th), 'header is position: sticky', th && th.slice(0, 60));
ok(/top:\s*0/.test(th), 'header sticks to the top of its scrollport');
ok(/background:\s*var\(--bg-subtle\)/.test(th),
  'header has an opaque background, so rows cannot scroll through it');

const zMatch = /z-index:\s*(\d+)/.exec(th || '');
ok(!!zMatch, 'header declares a z-index');
const z = zMatch ? Number(zMatch[1]) : -1;
ok(z > 0, 'header stacks above the table rows', String(z));

/* ── Below the topbar, which is the constraint the plan names ───────────── */
const topbar = ruleBody(css, '.topbar');
const topbarZ = Number((/z-index:\s*(\d+)/.exec(topbar || '') || [])[1]);
ok(topbarZ === 1000, 'topbar z-index is still 1000', String(topbarZ));
ok(z < topbarZ,
  'header z-index (' + z + ') is BELOW the topbar (' + topbarZ + '), so it slides under it');

/* ── The scroll range, without which sticky does nothing ────────────────── */
const wrap = ruleBody(css, '.table-wrap');
ok(!!wrap, '.table-wrap rule found');
ok(/max-height:/.test(wrap),
  '.table-wrap has a max-height — THIS is what gives the header a scroll range');
ok(/overflow-y:\s*auto/.test(wrap), '.table-wrap scrolls vertically');
ok(/70dvh/.test(wrap), '.table-wrap uses a viewport-relative height, so it adapts to every tier');
ok(/var\(--vh/.test(wrap),
  '.table-wrap carries the project\'s --vh fallback for browsers without dvh');

/* ── The pager is pinned, not stranded under 50 rows ────────────────────── */
const pager = ruleBody(css, '.dt-pager');
ok(!!pager, '.dt-pager is now defined (it was an orphan class — U-08)');
ok(/position:\s*sticky/.test(pager || '') && /bottom:\s*0/.test(pager || ''),
  '.dt-pager sticks to the bottom of the scroll box');
ok(/background:/.test(pager || ''), '.dt-pager is opaque');

/* ── Print must not be clipped ──────────────────────────────────────────── */
/* Extract the @media print block by matching its braces, rather than guessing
   at an indentation the file is free to change. */
/* There is more than one `@media print` in this file — UIC.printTable builds a
   print-window stylesheet of its own as a string — so collect them all. */
function mediaBlocks(source, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf('@media ' + name, from);
    if (at === -1) break;
    const open = source.indexOf('{', at);
    if (open === -1) break;
    let depth = 0, end = -1;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) break;
    out.push(source.slice(open + 1, end));
    from = end;
  }
  return out.join('\n');
}
const printCss = mediaBlocks(css, 'print');
ok(/\.table-wrap\s*\{[^}]*max-height:\s*none/.test(printCss),
  'print resets .table-wrap max-height, so a printed table is not clipped to 70dvh');
ok(/\.table-wrap\s*\{[^}]*overflow:\s*visible/.test(printCss),
  'print resets .table-wrap overflow');
ok(/\.table thead th\s*\{[^}]*position:\s*static/.test(printCss),
  'print un-sticks the header');

/* ── The table markup still emits a real thead ──────────────────────────── */
const vm = require('vm');
const { makeSandbox } = require('./domstub');
const sb = makeSandbox({});
S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
  vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'UI_Components#' + i });
});
const rows = [];
for (let i = 0; i < 60; i++) rows.push({ a: i, b: 'x' + i });
const html = sb.UIC.dataTable('sticky1', { headers: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], rows: rows });
ok(/<thead><tr>/.test(html), 'dataTable still emits a thead for the sticky rule to bind to');
ok(/class="table-wrap"/.test(html), 'dataTable still emits the .table-wrap scroll container');
ok(/class="dt-pager"/.test(html), 'a 60-row table still emits the pager');

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-1.5 sticky header: all assertions pass.');
