/**
 * UI-3.8 / U-42 — the persistent home button.
 *
 *   node tools/verify/ui3_homefab.js
 *
 * This is an EXPLICIT owner requirement, not a polish item: the system logo
 * floats above the page on every page, one click back to the main dashboard.
 *
 * The component already existed and was gated off. Removing the gate is easy;
 * the value of this file is the two things that would otherwise have shipped it
 * broken, both of which are invisible to a static read of the diff:
 *
 *   - it was positioned top-right, and this app is RTL, so `.topbar-left` — the
 *     hamburger plus BOTH logos — renders on the right. A top-right FAB lands
 *     on top of it on all 82 shell pages.
 *   - it was z-index 9998, ABOVE the modal overlay, the drawer and the loading
 *     overlay. A home link floating over a half-finished Save dialog is a way
 *     to lose work.
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

const SRC = S.read('UI_Components.html');

/* ── 1. The gate is gone — it renders on EVERY page ─────────────────────── */
(function () {
  const at = SRC.indexOf('UIC.ensureHomeLogo = function');
  const open = SRC.indexOf('{', at);
  let d = 0, end = -1;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  const body = SRC.slice(open, end);

  ok(body.indexOf("action !== 'ERPDashboard'") === -1,
    'the ERPDashboard-only gate is removed');
  ok(body.indexOf("CURRENT_ACTION !== 'ERPDashboard'") === -1,
    'the CURRENT_ACTION gate is removed too');
  ok(/if \(document\.getElementById\('home-logo-fab'\)\) return;/.test(body),
    'it is still idempotent — a second call does not add a second button');

  /* Render it and check what it produces. */
  const sb = makeSandbox({ scriptUrl: 'https://example.invalid/exec', SESSION_TOKEN: 'tok' });
  S.scriptBlocks(SRC).forEach(function (b, i) {
    try { vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'u' + i }); } catch (e) {}
  });
  const fab = sb.document.getElementById('home-logo-fab');
  ok(!!fab, 'the button is created on a page that is not the dashboard');
  if (fab) {
    /* The stub sets .href as a property, as a browser does; read it that way. */
    const href = String(fab.href || fab.getAttribute('href') || '');
    ok(href.indexOf('action=ERPDashboard') !== -1,
      'it navigates to the main dashboard', href);
    ok(href.indexOf('sessionToken=') !== -1,
      'and carries the session token', href);
    ok(/UIC\.navTo/.test(String(fab.getAttribute('onclick'))),
      'through UIC.navTo, which handles top-frame navigation and the overlay');
    ok(fab.getAttribute('aria-label') === 'الرئيسية',
      'it has a real aria-label — it had only title and alt before');
    ok(/alt=""/.test(String(fab.innerHTML)),
      'the inner image is alt="" so the name is not announced twice');
  }
})();

/* ── 2. Position: bottom, inline-end — NOT over .topbar-left ────────────── */
(function () {
  const css = S.allCss(SRC) + SRC;   /* the FAB's CSS is a JS string */
  const rule = /#home-logo-fab\{([^}]*)\}/.exec(SRC);
  ok(!!rule, 'the FAB rule is present');
  const r = rule ? rule[1] : '';

  ok(/bottom:/.test(r), 'anchored to the BOTTOM');
  ok(!/top:\s*\d/.test(r),
    'NOT anchored to the top — in RTL that is where .topbar-left renders, on 82 shell pages');
  ok(/inset-inline-end/.test(r),
    'uses inset-inline-end, so it mirrors with the direction instead of being pinned right');
  ok(!/\bright:\s*\d/.test(r), 'no physical right offset remains');
  ok(/var\(--safe-bottom/.test(r) && /var\(--safe-right/.test(r),
    'clears the device safe area on a notched phone');
})();

/* ── 3. Stacking, and yielding to dialogs ───────────────────────────────── */
(function () {
  const rule = /#home-logo-fab\{([^}]*)\}/.exec(SRC);
  const z = Number((/z-index:(\d+)/.exec(rule ? rule[1] : '') || [])[1]);
  ok(z === 1100, 'z-index is 1100', String(z));

  const shared = S.allCss(SRC);
  const zOf = function (sel) {
    const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(shared);
    return Number((/z-index:\s*(\d+)/.exec(m ? m[1] : '') || [])[1]);
  };
  const topbar = zOf('.topbar'), overlayZ = zOf('.modal-overlay'), toast = zOf('.toast');
  ok(z > topbar, 'above the sticky topbar (' + topbar + ')');
  ok(z > 2, 'above the sticky table header (2)');
  ok(z < toast, 'below toasts (' + toast + ')');
  ok(z < 1500, 'below the loading overlay (1500)');

  /* The plan expected the FAB to sit below the modal overlay on z-index alone.
     In this codebase it cannot: .modal-overlay is z-index 1000, the SAME as
     .topbar, so no single value is both above the topbar and below the overlay.
     What actually guarantees the button never floats over a dialog is the
     display:none rule below — and that is the stronger guarantee anyway, since
     it removes the button rather than merely stacking it behind a scrim.
     Recorded rather than papered over. */
  ok(overlayZ === topbar,
    'noted: .modal-overlay and .topbar share z-index ' + overlayZ +
    ', so dialog stacking rests on DOM order, not z-index');
  ok(z < 99990,
    'below ERPModal\'s own overlay (99990), which is the other dialog implementation');

  ok(/body\.modal-open #home-logo-fab\{display:none;\}/.test(SRC),
    'hidden while a dialog is open — .modal-open is set by BOTH UIC.openModal and ERPModal.open');
  ok(/body\.drawer-open #home-logo-fab\{display:none;\}/.test(SRC),
    'hidden while the drawer is open');
  ok(/@media print\{#home-logo-fab\{display:none;\}\}/.test(SRC),
    'and it does not print');
})();

/* ── 4. The drawer really toggles that class ────────────────────────────── */
(function () {
  const sb = makeSandbox({});
  S.scriptBlocks(SRC).forEach(function (b, i) {
    try { vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'u' + i }); } catch (e) {}
  });
  /* openDrawer returns early without a #uic-drawer element, so register one. */
  const drawer = sb.document.createElement('nav');
  drawer.id = 'uic-drawer';
  sb.document.body.appendChild(drawer);

  sb.UIC.openDrawer();
  ok(sb.document.body.classList.contains('drawer-open'),
    'opening the drawer marks the body, so the CSS above can hide the button');
  sb.UIC.closeDrawer();
  ok(!sb.document.body.classList.contains('drawer-open'),
    'closing it clears the mark');
})();

/* ── 5. Target size, focus, and tokens ──────────────────────────────────── */
(function () {
  const rule = /#home-logo-fab\{([^}]*)\}/.exec(SRC);
  const r = rule ? rule[1] : '';
  ok(/width:var\(--tap-sm/.test(r) && /height:var\(--tap-sm/.test(r),
    'at least a 44px target at the smallest size');
  ok(/@media \(min-width: 600px\)\{#home-logo-fab\{width:48px/.test(SRC),
    'and 48px from tablet-p up — mobile-first, on the tier scale');
  ok(/#home-logo-fab:focus-visible\{outline:2px solid var\(--brand-primary\)/.test(SRC),
    'it has a visible focus ring and is reachable by keyboard');
  ok(/background:var\(--bg-surface/.test(r),
    'background comes from the Phase 2 tokens, not a hardcoded #fff');
  ok(/box-shadow:var\(--shadow-md/.test(r),
    'shadow comes from a token, not a hardcoded rgba(0,0,0,.2)');
  ok(!/#fff\b/.test(r.replace(/var\([^)]*\)/g, '')),
    'no hardcoded white outside a token fallback');
})();

/* ── 6. The topbar home link still exists — two affordances, deliberately ─ */
ok(/app-logo-main/.test(SRC),
  'the topbar system logo still links home; the redundancy is noted for the owner, not removed');

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-3.8 home button: all assertions pass.');
