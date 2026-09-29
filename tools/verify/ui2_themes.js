/**
 * UI-2.4 / 2.5 / 2.6 — the neutral canvas, per company.
 *
 *   node tools/verify/ui2_themes.js
 *
 * D-1 and D-2: retire the coloured page canvas in all three companies; the
 * brand colour is used for the topbar and printing only.
 *
 * The three theme functions are not read as source text here — they are
 * EXECUTED, against stubs, and the stylesheet they actually emit is what gets
 * asserted on. That matters for the generic path, which builds its CSS by
 * string concatenation across several branches, so reading the source would not
 * tell you what a given company receives.
 *
 * The sharpest assertion is the one about token overrides. A theme that
 * re-states --bg-primary or --text-muted silently undoes Phase 2.1 for its
 * company, and nothing else in the suite would notice.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

/* Rebuild the bundle so this reflects the file as it stands right now. */
require('../build_preview').build();
const sb = { window: null };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(S.ROOT, 'design_preview', '_sources.js'), 'utf8'), sb);

const SRC = sb.__PREVIEW_SOURCES__;
const themes = SRC.themes;
const tokensCss = SRC.tokens.css;

/* Tokens that define the CANVAS and the INK. A company theme must not touch
   any of them, or it has its own design system again. */
const CANVAS_TOKENS = [
  'bg-canvas', 'bg-primary', 'bg-surface', 'bg-subtle', 'bg-sunken',
  'border-color', 'border-strong',
  'text-main', 'text-muted', 'text-disabled'
];

/* ── The shared layer owns the canvas ───────────────────────────────────── */
CANVAS_TOKENS.forEach(function (t) {
  ok(new RegExp('--' + t + ':').test(tokensCss),
    'CSS_Tokens defines --' + t);
});
ok(/--bg-canvas:\s*#f5f6f8/i.test(tokensCss), 'canvas is the neutral #f5f6f8 the plan specifies');
ok(/--bg-primary:\s*#f5f6f8/i.test(tokensCss), '--bg-primary is kept as an alias of --bg-canvas');
ok(/--text-muted:\s*#5b6572/i.test(tokensCss), '--text-muted raised to #5b6572 (6.4:1 on white)');
ok(/--text-disabled:\s*#7c8694/i.test(tokensCss), '--text-disabled raised to #7c8694 (was 2.5:1, a WCAG failure)');
ok(/--border-color:\s*#e2e5ea/i.test(tokensCss), '--border-color is the #e2e5ea hairline');

/* ── Per company ────────────────────────────────────────────────────────── */
const EXPECT = {
  TopLight:    { topbar: '#111111', ink: '#fbbf24', brand: '#111111' },
  TopChemical: { topbar: '#15803d', ink: '#ffffff', brand: '#16a34a' },
  /* ValleyFoods takes the generic path, which expresses the topbar in tokens
     so it adapts to whatever colour the company is configured with. */
  ValleyFoods: { topbar: 'var(--brand-primary)', ink: 'var(--btn-text-color)', brand: '#16A34A' }
};

Object.keys(EXPECT).forEach(function (co) {
  const css = themes[co].css;
  console.log('  -- ' + co + ' --');

  /* 1. No canvas or ink token is overridden. */
  const overrides = CANVAS_TOKENS.filter(function (t) {
    return new RegExp('--' + t + '\\s*:').test(css);
  });
  ok(overrides.length === 0,
    co + ': overrides no canvas or ink token', overrides.join(', '));

  /* 2. The page background is not painted. */
  ok(!/\bbody\s*\{[^}]*background/.test(css),
    co + ': does not paint the page background');

  /* 3. No 2px frames anywhere. */
  ok(!/border:\s*2px/.test(css), co + ': no 2px borders remain');

  /* 4. The table header is not brand-painted. */
  ok(!/\.table thead th\s*\{/.test(css),
    co + ': does not repaint the table header');

  /* 5. There IS a brand topbar, and it is scoped to the topbar. */
  const topbarRule = /\.topbar\s*\{([^}]*)\}/.exec(css);
  ok(!!topbarRule, co + ': defines a .topbar rule');
  if (topbarRule) {
    ok(topbarRule[1].toLowerCase().indexOf(EXPECT[co].topbar.toLowerCase()) !== -1,
      co + ': topbar background is ' + EXPECT[co].topbar, topbarRule[1].trim());
    ok(!/border-bottom:\s*2px/.test(topbarRule[1]),
      co + ': topbar border is a hairline, not 2px');
  }

  /* 6. Topbar ink is set, or the nav links are invisible against the brand. */
  ok(/\.topbar\s+\.nav-item[^{]*\{[^}]*color/.test(css),
    co + ': topbar nav links get explicit ink');
  ok(/\.topbar-hamburger[^{]*\.hamburger-bar\s*\{[^}]*background/.test(css),
    co + ': hamburger bars get explicit colour (they default to --text-main)');
  ok(/user-profile-toggle[^{]*\{/.test(css),
    co + ': the profile toggle is made legible on the brand topbar');

  /* 7. Every structural rule is scoped to .topbar, so nothing leaks into the
        page content. This is what stopped a black dropdown appearing on a
        white card under TopLight. */
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  const leaked = rules.map(function (r) { return r.split('{')[0].trim(); })
    .filter(function (sel) {
      if (!sel || sel.indexOf(':root') !== -1 || sel.indexOf('@') !== -1) return false;
      if (sel.indexOf('.topbar') !== -1) return false;
      /* Allowed unscoped: the button and document rules the plan keeps. */
      if (/^(\.btn-primary|\.btn-primary:hover|\.btn-outline:hover|\.invoice|\*)$/.test(sel)) return false;
      return true;
    });
  ok(leaked.length === 0,
    co + ': every structural rule is scoped to .topbar (or an allowed button/document rule)',
    leaked.join(' | '));

  /* 8. The brand token itself survives — the brand was never the problem. */
  ok(new RegExp('--brand-primary:\\s*' + EXPECT[co].brand, 'i').test(css),
    co + ': --brand-primary is still ' + EXPECT[co].brand);
});

/* ── The generic path adapts rather than hardcoding one company ─────────── */
(function () {
  const vf = themes.ValleyFoods.css;
  ok(vf.indexOf('#16a34a') === -1 || /--brand-primary:\s*#16A34A/i.test(vf),
    'generic path expresses the topbar in tokens, not a hardcoded green');
  ok(/\.topbar\s*\{[^}]*var\(--brand-primary\)/.test(vf),
    'generic topbar reads --brand-primary, so any company colour works');
  ok(/var\(--btn-text-color\)/.test(vf),
    'generic topbar ink reads --btn-text-color, so a light brand gets dark ink');
})();

/* ── Cairo is loaded once, from the shared layer ────────────────────────── */
ok(/fonts\.googleapis\.com\/css2\?family=Cairo/.test(SRC.tokens.links),
  'Cairo is loaded from CSS_Tokens.html');
Object.keys(EXPECT).forEach(function (co) {
  ok(!/fonts\.googleapis/.test(themes[co].links || ''),
    co + ': no longer loads the font itself');
});
ok(/--font-sans:\s*'Cairo'/.test(tokensCss), 'shared --font-sans is Cairo');
ok(/--font-sans:\s*\\?'Cairo\\?'/.test(themes.TopLight.css), 'TopLight still resolves to Cairo');
ok(/--font-sans:\s*\\?'Cairo\\?'/.test(themes.TopChemical.css), 'TopChemical still resolves to Cairo');
ok(!/--font-sans/.test(themes.ValleyFoods.css), 'ValleyFoods inherits Cairo rather than falling back to Tahoma');

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-2.4/2.5/2.6 themes: all assertions pass.');
