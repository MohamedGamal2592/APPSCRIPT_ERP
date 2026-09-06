/**
 * UI-3.3 / U-20 — the row action kebab.
 *
 *   node tools/verify/ui3_kebab.js
 *
 * A 50-row list drew 50 filled, brand-coloured buttons reading
 * "إجراءات / Actions" — the loudest thing on the page, competing with the data
 * it belongs to. It is now a quiet kebab.
 *
 * Two things here are easy to get wrong and are therefore asserted rather than
 * assumed:
 *
 *   1. THE PER-ROW COST. This control renders once per row, so anything added
 *      to it is multiplied by the page size. The check compares against the
 *      Phase 0 tree directly, by reading UI_Components.html out of git.
 *   2. THE HOVER GATE. "Reveal on hover" is unusable on a touchscreen, and
 *      screen width is not a proxy for input type — a Windows laptop can have
 *      both. The reveal must be gated on the pointer's capability, and there
 *      must be a non-hover path.
 */
'use strict';

const vm = require('vm');
const { execSync } = require('child_process');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

function bootFrom(src) {
  const sb = makeSandbox({});
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!m[1].trim()) continue;
    try { vm.runInContext(m[1].replace(/<\?[\s\S]*?\?>/g, '0'), sb); } catch (e) {}
  }
  return sb;
}

const BTNS = [
  { label: 'تعديل', onclick: 'doEdit()' },
  { label: 'طباعة', onclick: 'doPrint()' },
  { label: 'حذف', onclick: 'doDelete()', color: 'var(--danger)' }
];

const sb = bootFrom(S.read('UI_Components.html'));
const html = sb.UIC.actionDropdown(BTNS);

/* ── 1. It is a kebab, not a pill ───────────────────────────────────────── */
ok(/class="erp-kebab-btn"/.test(html), 'the trigger is an .erp-kebab-btn');
ok(!/class="btn btn-primary"/.test(html),
  'the trigger is no longer a filled primary button on every row');
ok(html.indexOf('إجراءات / Actions') === -1,
  'the bilingual "إجراءات / Actions" label is gone from the row');
ok(/>⋮</.test(html), 'the glyph is the kebab character');
ok(!/<svg/.test(html),
  'the trigger uses NO inline svg — this control renders once per row');

/* ── 2. Accessibility ───────────────────────────────────────────────────── */
ok(/aria-label="إجراءات"/.test(html), 'the icon-only trigger has an accessible name');
ok(/aria-haspopup="true"/.test(html), 'aria-haspopup declares the menu');
ok(/aria-expanded="false"/.test(html), 'aria-expanded starts false');

(function () {
  const id = (/id="(ad_[a-z0-9]+)"/.exec(html) || [])[1];
  ok(!!id, 'the wrapper carries an id');
  /* Register the markup so the stub can find the elements by id. */
  sb.document.body.innerHTML = html;
  const wrap = sb.document.getElementById(id);
  ok(!!wrap, 'the wrapper is addressable');
  /* The stub has no querySelector on elements, so exercise the state directly:
     what matters is that open/close maintain the attribute at all. */
  const src = S.read('UI_Components.html');
  /* Brace-match the function rather than scanning a fixed character window: the
     first version used {0,400} and failed only because the file has CRLF line
     endings, which is a maddening way for a correct implementation to look
     broken. */
  const fnBody = function (name) {
    const at = src.indexOf('UIC.' + name + ' = function');
    if (at === -1) return '';
    const open = src.indexOf('{', at);
    let d = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) return src.slice(open, i); }
    }
    return '';
  };
  ok(/setAttribute\('aria-expanded', 'true'\)/.test(fnBody('openActionMenu')),
    'opening the menu sets aria-expanded="true"');
  ok(/setAttribute\('aria-expanded', 'false'\)/.test(fnBody('closeActionMenu')),
    'closing the menu sets aria-expanded="false"');
})();

/* ── 3. The hover gate, and the non-hover path ──────────────────────────── */
(function () {
  const css = S.allCss(S.read('UI_Components.html'));
  const at = css.indexOf('@media (hover: hover) and (pointer: fine)');
  ok(at !== -1,
    'the reveal is gated on (hover: hover) AND (pointer: fine), not on width');
  const open = css.indexOf('{', at);
  let d = 0, end = -1;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') d++;
    else if (css[i] === '}') { d--; if (d === 0) { end = i; break; } }
  }
  const block = css.slice(open + 1, end);
  ok(/\.erp-kebab-btn\s*\{\s*opacity:\s*\.?\d/.test(block),
    'inside that block the button is dimmed by default');
  ok(/tr:hover .erp-kebab-btn/.test(block), 'row hover reveals it');
  ok(/\.erp-kebab-btn:focus-visible/.test(block),
    'keyboard focus reveals it too — it is never reachable-but-invisible');
  ok(/\.erp-kebab\.open .erp-kebab-btn/.test(block),
    'an open menu keeps its own trigger visible');

  /* Outside that block there must be no rule that hides it, or touch users
     would never see it. */
  const outside = css.slice(0, at) + css.slice(end + 1);
  ok(!/\.erp-kebab-btn\s*\{[^}]*opacity:\s*0/.test(outside),
    'nothing outside the pointer guard hides the button — touch always sees it');
})();

/* ── 4. Tap target ──────────────────────────────────────────────────────── */
(function () {
  const css = S.allCss(S.read('UI_Components.html'));
  const m = /\.erp-kebab-btn\s*\{([^}]*)\}/.exec(css);
  ok(!!m, '.erp-kebab-btn is styled');
  ok(/width:\s*var\(--tap-sm/.test(m[1]) && /height:\s*var\(--tap-sm/.test(m[1]),
    'the trigger is a full 44px tap target at every width');
  const item = /\.erp-kebab-item\s*\{([^}]*)\}/.exec(css);
  ok(item && /min-height:\s*var\(--tap-sm/.test(item[1]),
    'each menu item is a 44px tap target');
})();

/* ── 5. Per-row cost, measured against the Phase 0 tree ─────────────────── */
(function () {
  let before;
  try {
    before = bootFrom(execSync('git show e324cfc:UI_Components.html',
      { encoding: 'utf8', maxBuffer: 1e8 })).UIC.actionDropdown(BTNS);
  } catch (e) {
    console.log('  SKIP  cannot read the Phase 0 tree from git (' + e.message + ')');
    return;
  }
  const n = h => (h.match(/<[a-zA-Z]/g) || []).length;
  ok(n(html) <= n(before),
    'element count per action cell did not grow: ' + n(before) + ' -> ' + n(html));
  ok(html.length < before.length,
    'bytes per action cell fell: ' + before.length + ' -> ' + html.length +
    '  (' + (before.length * 50) + ' -> ' + (html.length * 50) + ' per 50-row page)');
  ok(!/style="display:block;width:100%/.test(html),
    'the per-item inline style block is gone — it was unthemeable and pure payload');
})();

/* ── 6. The public contract is unchanged ────────────────────────────────── */
ok(typeof sb.UIC.actionDropdown === 'function', 'UIC.actionDropdown still exists');
ok(sb.UIC.actionBtns === sb.UIC.actionDropdown || typeof sb.UIC.actionBtns === 'function',
  'UIC.actionBtns still exists');
ok(sb.UIC.actionDropdown([]) === '' && sb.UIC.actionDropdown(null) === '',
  'an empty or null button list still renders nothing');
ok(/color:var\(--danger\)/.test(html.replace(/\s/g, '')),
  'a per-item colour is still honoured');
ok(/doDelete\(\)/.test(html), 'the item onclick is still wired');
ok(/UIC\.closeActionMenu/.test(html), 'choosing an item still closes the menu');

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-3.3 kebab: all assertions pass.');
