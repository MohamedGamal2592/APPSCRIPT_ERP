/**
 * UI-1.4 / U-04 — `.num` lives in the shared stylesheet, and all three
 * companies get it.
 *
 *   node tools/verify/ui1_num.js
 *
 * UIC._dtRowHtml puts `class="num"` on every money and numeric cell on every
 * page, but the rule that styled it existed only inside the two bespoke company
 * themes in 03_Security.js. ValleyFoods takes the generic theme path, so its
 * numeric columns were rendered in the body font, right-aligned and
 * non-tabular — figures did not line up.
 *
 * The risk in moving it is that TopLight or TopChemical render DIFFERENTLY
 * afterwards. This asserts they cannot: the shared rule's declarations are
 * compared against the ones the themes used to carry.
 */
'use strict';

const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

/* The rule as it stood in both themes before this change, verbatim. */
const WAS = {
  'font-family': 'var(--font-mono)',
  'direction': 'ltr',
  'text-align': 'left',
  'font-variant-numeric': 'tabular-nums'
};

function ruleBody(css, selector) {
  const re = new RegExp('(?:^|[},])\\s*' + selector.replace('.', '\\.') + '\\s*\\{([^}]*)\\}', 'm');
  const m = css.match(re);
  return m ? m[1] : null;
}
function decls(body) {
  const out = {};
  String(body || '').split(';').forEach(function (d) {
    const i = d.indexOf(':');
    if (i === -1) return;
    out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  });
  return out;
}

/* ── 1. The shared layer now defines .num ───────────────────────────────── */
const sharedCss = S.allCss(S.read('UI_Components.html'));
const numBody = ruleBody(sharedCss, '.num');
ok(!!numBody, 'UI_Components.html defines a .num rule');

const got = decls(numBody);
Object.keys(WAS).forEach(function (prop) {
  if (prop === 'font-family') {
    ok(/var\(--font-mono/.test(got['font-family'] || ''),
      '.num font-family still resolves through --font-mono', got['font-family']);
    ok(/Consolas/.test(got['font-family'] || ''),
      '.num carries a fallback stack for the company that defines no --font-mono',
      got['font-family']);
    return;
  }
  ok(got[prop] === WAS[prop],
    '.num ' + prop + ' is unchanged (' + WAS[prop] + ')', String(got[prop]));
});

/* ── 2. The duplicates are gone from both bespoke themes ────────────────── */
const sec = S.read('03_Security.js');
ok(!/'\.num \{/.test(sec) && !/\.num\s*\{[^}]*font-variant-numeric/.test(sec),
  '03_Security.js no longer defines .num anywhere');
/* Count DEFINITIONS, not mentions — the replacement comment names the token. */
const monoDefs = (sec.match(/--font-mono:\s*\\?'Consolas/g) || []).length;
ok(monoDefs === 2,
  'both bespoke themes still define --font-mono, so their stack is unchanged',
  String(monoDefs));

/* ── 3. The generated themes confirm it end to end ──────────────────────── */
const build = require('../build_preview');
build.build();
const bundle = require('fs').readFileSync(
  require('path').join(S.ROOT, 'design_preview', '_sources.js'), 'utf8');
const vm = require('vm');
const sb = { window: null };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(bundle, sb);
const themes = sb.__PREVIEW_SOURCES__.themes;

['TopLight', 'TopChemical', 'ValleyFoods'].forEach(function (co) {
  ok(!/\.num\s*\{/.test(themes[co].css), co + ': theme emits no .num of its own');
});
ok(/--font-mono/.test(themes.TopLight.css), 'TopLight still sets --font-mono');
ok(/--font-mono/.test(themes.TopChemical.css), 'TopChemical still sets --font-mono');
ok(!/--font-mono/.test(themes.ValleyFoods.css),
  'ValleyFoods sets no --font-mono, so it takes the shared fallback stack');

/* ── 4. The cells that need it still carry the class ────────────────────── */
const vmm = require('vm');
const { makeSandbox } = require('./domstub');
const sb2 = makeSandbox({});
S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
  vmm.runInContext(S.stripScriptlets(b.body), sb2, { filename: 'UI_Components#' + i });
});
const row = sb2.UIC._dtRowHtml(
  { a: 'نص', b: 12.5, c: 3 },
  [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', money: true }, { key: 'c', label: 'C', numeric: true }],
  function (n) { return String(n); }, 0);
ok((row.match(/class="num"/g) || []).length === 2,
  'money and numeric cells still emit class="num"; a text cell does not', row);

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-1.4 .num: all assertions pass.');
