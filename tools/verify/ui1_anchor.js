/**
 * UI-1.2 / U-01 — the viewport anchoring that lets popups escape the table's
 * clip box.
 *
 *   node tools/verify/ui1_anchor.js
 *
 * `.table-wrap { overflow-x: auto }` clips any absolutely positioned popup
 * inside it, so a row's action menu on the last row is invisible. The fix
 * switches the popup to `position: fixed` while open and places it against the
 * viewport. That is pure arithmetic, and arithmetic is exactly what can be
 * wrong in a way no static check would notice — so it is tested here rather
 * than assumed.
 *
 * The DOM stub has no layout engine, so this supplies its own rectangles. What
 * is under test is UIC._anchorFixed's placement decisions, not the browser.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox } = require('./domstub');

const ROOT = path.resolve(__dirname, '..', '..');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

/* ── Boot the real UI_Components.html ───────────────────────────────────── */
const sb = makeSandbox({ innerWidth: 1440, innerHeight: 900 });
S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
  vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'UI_Components#' + i });
});
const UIC = sb.UIC;

/* ── A fake element with a controllable rectangle ───────────────────────── */
function elem(rect, opts) {
  const o = opts || {};
  const style = {};
  const attrs = {};
  return {
    style: style,
    _attrs: attrs,
    isConnected: true,
    getAttribute: k => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = String(v); },
    removeAttribute: k => { delete attrs[k]; },
    getBoundingClientRect: function () {
      /* Once placed, report where the element ACTUALLY landed. `drift` models a
         containing block that is not the viewport — the case a `.modal` with
         `will-change: transform` creates for a combo inside a dialog. */
      if (style.position === 'fixed' && style.left !== undefined) {
        const l = parseFloat(style.left) - (o.drift ? o.drift.x : 0);
        const t = parseFloat(style.top) - (o.drift ? o.drift.y : 0);
        const w = style.width !== undefined ? parseFloat(style.width) : rect.width;
        return { left: l, top: t, right: l + w, bottom: t + rect.height, width: w, height: rect.height };
      }
      return rect;
    }
  };
}
function rect(left, top, width, height) {
  return { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height };
}
function setDir(d) { sb.document.documentElement.setAttribute('dir', d); }

const GAP = 4, EDGE = 8;

/* ── 1. RTL, room below: end edges align, menu sits under the anchor ────── */
setDir('rtl');
(function () {
  const anchor = elem(rect(200, 100, 100, 30));
  const menu = elem(rect(0, 0, 200, 150));
  UIC._anchorFixed(menu, anchor, {});
  ok(menu.style.position === 'fixed', 'RTL/below: switches to position:fixed', menu.style.position);
  ok(parseFloat(menu.style.top) === 130 + GAP, 'RTL/below: top is anchor.bottom + gap', menu.style.top);
  ok(parseFloat(menu.style.left) === 300 - 200, 'RTL/below: right edges align (left = anchor.right - width)', menu.style.left);
  ok(menu.style.right === 'auto' && menu.style.bottom === 'auto', 'RTL/below: physical right/bottom cleared');
  UIC._unanchor(menu);
})();

/* ── 2. No room below: flips above the anchor ───────────────────────────── */
(function () {
  const anchor = elem(rect(200, 800, 100, 30));   /* bottom 830 of 900 */
  const menu = elem(rect(0, 0, 200, 150));
  UIC._anchorFixed(menu, anchor, {});
  /* below = 900-830-4 = 66 < 150; above = 796 > 66 → flip */
  ok(parseFloat(menu.style.top) === 800 - 150 - GAP,
    'no room below: flips above the anchor', menu.style.top);
  UIC._unanchor(menu);
})();

/* ── 3. Room below is enough: does NOT flip ─────────────────────────────── */
(function () {
  const anchor = elem(rect(200, 400, 100, 30));
  const menu = elem(rect(0, 0, 200, 150));
  UIC._anchorFixed(menu, anchor, {});
  ok(parseFloat(menu.style.top) === 430 + GAP, 'room below: stays below', menu.style.top);
  UIC._unanchor(menu);
})();

/* ── 4. Overflowing the inline edge is clamped into the viewport ────────── */
(function () {
  const anchor = elem(rect(10, 100, 90, 30));      /* right = 100 */
  const menu = elem(rect(0, 0, 300, 100));         /* would need left = -200 */
  UIC._anchorFixed(menu, anchor, {});
  ok(parseFloat(menu.style.left) === EDGE, 'clamps to the viewport start edge', menu.style.left);
  UIC._unanchor(menu);
})();

(function () {
  const anchor = elem(rect(1380, 100, 50, 30));    /* right = 1430 */
  const menu = elem(rect(0, 0, 300, 100));
  setDir('ltr');
  UIC._anchorFixed(menu, anchor, {});
  ok(parseFloat(menu.style.left) === 1440 - 300 - EDGE, 'clamps to the viewport end edge', menu.style.left);
  UIC._unanchor(menu);
  setDir('rtl');
})();

/* ── 5. LTR aligns start edges instead ──────────────────────────────────── */
(function () {
  setDir('ltr');
  const anchor = elem(rect(200, 100, 100, 30));
  const menu = elem(rect(0, 0, 200, 150));
  UIC._anchorFixed(menu, anchor, {});
  ok(parseFloat(menu.style.left) === 200, 'LTR: left edges align', menu.style.left);
  UIC._unanchor(menu);
  setDir('rtl');
})();

/* ── 6. A containing block that is not the viewport is corrected for ────── */
/* This is the `.modal { will-change: transform }` case. Without the
   measure-then-correct step the popup lands 60px/25px away from its input. */
(function () {
  const anchor = elem(rect(200, 100, 100, 30));
  const menu = elem(rect(0, 0, 200, 150), { drift: { x: 60, y: 25 } });
  UIC._anchorFixed(menu, anchor, {});
  const got = menu.getBoundingClientRect();
  ok(Math.abs(got.top - (130 + GAP)) < 0.5,
    'non-viewport containing block: corrected vertically', 'landed at ' + got.top);
  ok(Math.abs(got.left - 100) < 0.5,
    'non-viewport containing block: corrected horizontally', 'landed at ' + got.left);
  UIC._unanchor(menu);
})();

/* ── 7. matchWidth pins a combo list to its input's width ───────────────── */
(function () {
  const anchor = elem(rect(200, 100, 264, 44));
  const list = elem(rect(0, 0, 200, 150));
  UIC._anchorFixed(list, anchor, { matchWidth: true });
  ok(parseFloat(list.style.width) === 264, 'matchWidth: list width equals the input width', list.style.width);
  UIC._unanchor(list);
})();

/* ── 8. Anchored elements are tracked and released ──────────────────────── */
(function () {
  const before = UIC._anchored.length;
  const anchor = elem(rect(200, 100, 100, 30));
  const a = elem(rect(0, 0, 100, 100));
  const b = elem(rect(0, 0, 100, 100));
  UIC._anchorFixed(a, anchor, {});
  UIC._anchorFixed(b, anchor, {});
  ok(UIC._anchored.length === before + 2, 'two open popups are tracked', String(UIC._anchored.length));
  UIC._anchorFixed(a, anchor, {});
  ok(UIC._anchored.length === before + 2, 're-anchoring does not double-register', String(UIC._anchored.length));
  UIC._unanchor(a); UIC._unanchor(b);
  ok(UIC._anchored.length === before, 'closing releases both', String(UIC._anchored.length));
})();

/* ── 9. _unanchor restores the element's original inline style ──────────── */
(function () {
  const anchor = elem(rect(200, 100, 100, 30));
  const menu = elem(rect(0, 0, 200, 150));
  menu.setAttribute('style', 'display:none;position:absolute;right:0;top:100%;');
  UIC._anchorFixed(menu, anchor, {});
  UIC._unanchor(menu);
  ok(menu.getAttribute('style') === 'display:none;position:absolute;right:0;top:100%;',
    'unanchor restores the original inline style verbatim', menu.getAttribute('style'));
})();

/* ── 10. The emitted row-menu markup routes through the new open/close ──── */
(function () {
  const html = UIC.actionDropdown([{ label: 'تعديل', onclick: 'doEdit()' }]);
  ok(/UIC\.toggleActionMenu\('ad_[a-z0-9]+', event\)/.test(html),
    'toggle button calls UIC.toggleActionMenu');
  ok(/UIC\.closeActionMenu\('ad_[a-z0-9]+'\)/.test(html),
    'an item click closes the menu through UIC.closeActionMenu');
  ok(/z-index:1400/.test(html),
    'menu z-index raised above the sticky table header');
  ok(!/classList\.toggle\('open'\)/.test(html),
    'the old inline classList.toggle is gone');
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-1.2 anchoring: all assertions pass.');
