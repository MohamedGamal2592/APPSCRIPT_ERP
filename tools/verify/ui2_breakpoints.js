/**
 * UI-2.9b / U-48 — the five-tier breakpoint scale.
 *
 *   node tools/verify/ui2_breakpoints.js
 *
 * Before this there were effectively two tiers, 767 and 768. A 768px iPad in
 * portrait therefore received the identical layout to a 2560px monitor: the
 * full topbar nav crammed into 768px with no drawer, and .app-content clamped
 * to 1200px on a screen more than three times that wide.
 *
 * Device support is an acceptance condition on every phase of this programme,
 * not a phase of its own, so these assertions are about the SHAPE of the rules
 * — mobile-first, min-width only, on-scale values, and never screen width used
 * as a proxy for input type — rather than about any one component.
 */
'use strict';

const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

const TIERS = { 600: 'tablet-p', 900: 'tablet-l', 1280: 'desktop', 1920: 'wide' };
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

/* ── 1. The tokens exist and record the scale ───────────────────────────── */
const tokens = S.read('CSS_Tokens.html');
[['phone', 599], ['tablet-p', 600], ['tablet-l', 900], ['desktop', 1280], ['wide', 1920]]
  .forEach(function (pair) {
    ok(new RegExp('--bp-' + pair[0] + ':\\s*' + pair[1] + 'px').test(tokens),
      '--bp-' + pair[0] + ' is ' + pair[1] + 'px');
  });
ok(/cannot be used inside an @media query/i.test(tokens),
  'the tokens carry the note that a media query cannot read a custom property');

/* ── 2. Every width query in the whole tree is on-scale and min-width ───── */
(function () {
  const bad = [];
  let total = 0;
  S.htmlFiles().concat(S.jsFiles()).forEach(function (f) {
    const src = stripComments(S.read(f));
    const re = /@media[^{]*?\(\s*(min|max)-width\s*:\s*(\d+)px/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      total++;
      const dir = m[1], px = Number(m[2]);
      if (dir !== 'min' || !TIERS[px]) bad.push(f + ': ' + dir + '-width:' + px);
    }
  });
  ok(total > 0, 'width queries were found at all (' + total + ')');
  ok(bad.length === 0,
    'all ' + total + ' width queries are min-width on one of the five tiers',
    bad.join(' | '));
})();

/* ── 3. The drawer survives into tablet-p ───────────────────────────────── */
const uic = stripComments(S.allCss(S.read('UI_Components.html')));

function blockAt(css, minWidth) {
  const at = css.indexOf('@media (min-width: ' + minWidth + 'px)');
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(open + 1, i); }
  }
  return '';
}

const t600 = blockAt(uic, 600);
const t900 = blockAt(uic, 900);
const t1920 = blockAt(uic, 1920);

ok(t600.length > 0, 'a tablet-p (600px) block exists');
ok(t900.length > 0, 'a tablet-l (900px) block exists');
ok(t1920.length > 0, 'a wide (1920px) block exists');

ok(/\.topbar-hamburger\s*\{\s*display:\s*none/.test(t900),
  'the hamburger is hidden at tablet-l, NOT at 768 — so the drawer survives on a portrait iPad');
ok(!/\.topbar-hamburger\s*\{\s*display:\s*none/.test(t600),
  'the hamburger is NOT hidden at tablet-p');
ok(/\.topbar-nav\s*\{\s*display:\s*flex/.test(t900),
  'the topbar nav appears at tablet-l');

/* Base (phone) rules must be outside any media query. */
const base = uic.split('@media')[0];
ok(/\.topbar-hamburger\s*\{\s*display:\s*flex/.test(uic.slice(0, uic.indexOf('@media (min-width: 600px)'))),
  'the hamburger is shown by default (mobile-first base)');
ok(/\.topbar-nav\s*\{\s*display:\s*none/.test(uic.slice(0, uic.indexOf('@media (min-width: 600px)'))),
  'the topbar nav is hidden by default (mobile-first base)');

/* ── 4. Dialogs centre at tablet-p, and the sizes moved with them ───────── */
ok(/\.modal-overlay\s*\{\s*align-items:\s*center/.test(t600),
  'dialogs stop being bottom sheets at tablet-p');
['modal-sm', 'modal-lg', 'modal-xl'].forEach(function (c) {
  ok(new RegExp('\\.modal\\.' + c + '\\s*\\{\\s*max-width').test(t600),
    'the ' + c + ' width moved into the tablet-p tier with the rest');
});
ok(uic.indexOf('@media (min-width: 640px)') === -1,
  'the off-scale 640px dialog query is gone');

/* ── 5. Content unclamps on a wide screen ───────────────────────────────── */
ok(/\.app-content\s*\{\s*max-width:\s*1600px/.test(t1920),
  'app-content unclamps from 1200px at the wide tier');

/* ── 6. The FAB and the shell no longer disagree at 768 ─────────────────── */
const fabCss = S.read('UI_Components.html');
ok(!/@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{[^}]*home-logo-fab/.test(stripComments(fabCss)),
  'the home FAB no longer uses a max-width:768 query that fought the shell switch');
ok(/@media \(min-width: 600px\)\{#home-logo-fab/.test(fabCss),
  'the FAB grows at tablet-p, mobile-first');

/* ── 7. Screen width is never used as a proxy for input type ───────────── */
ok(/@media \(hover: none\)/.test(uic),
  'pointer affordances are gated on (hover: none), not on width');
ok(/--tap-min/.test(S.read('CSS_Tokens.html')) && /--tap-sm/.test(S.read('CSS_Tokens.html')),
  'the 48px / 44px tap-target tokens still exist');
/* Tap targets must not be shrunk inside any tier — a Windows desktop can have
   a touchscreen. */
[t600, t900, t1920].forEach(function (blk, i) {
  ok(!/min-height:\s*(?:[0-9]|[1-3][0-9]|4[0-3])px/.test(blk),
    'tier ' + ['tablet-p', 'tablet-l', 'wide'][i] + ' does not shrink a tap target below 44px');
});

/* ── 8. No component sets a horizontal scroll on the page body ──────────── */
ok(/overflow-x:\s*hidden/.test(S.read('CSS_Tokens.html')),
  'the page body still cannot scroll horizontally at any width (plan §0.4 rule 6)');
ok(/\.table-wrap\s*\{[\s\S]{0,400}overflow-x:\s*auto/.test(uic),
  'wide tables scroll inside their own container instead');

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-2.9b breakpoints: all assertions pass.');
