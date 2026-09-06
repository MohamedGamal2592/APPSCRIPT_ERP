/**
 * UI-4.1 / U-13 — the control panel.
 *
 *   node tools/verify/ui4_controlpanel.js
 *
 * The riskiest property of this component is not what it renders but what it
 * does to the 53 pages that have NOT been converted. It is opt-in, and the
 * assertions below prove that a page passing no `controlPanel` still gets
 * byte-identical shell markup.
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

function boot(src) {
  const sb = makeSandbox({ scriptUrl: 'https://x.invalid/exec', SESSION_TOKEN: 'tok', CURRENT_ACTION: 'p' });
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!m[1].trim()) continue;
    try { vm.runInContext(m[1].replace(/<\?[\s\S]*?\?>/g, '0'), sb); } catch (e) {}
  }
  return sb;
}

const sb = boot(S.read('UI_Components.html'));
const UIC = sb.UIC;

/* ── 1. Opt-in: an unconverted page is untouched ────────────────────────── */
(function () {
  const SHELL_OPTS = {
    nav: [{ label: 'الرئيسية', href: '#', active: true }, { label: 'الأصناف', href: '#a' }],
    menuGroups: [{ label: 'التصنيع', items: [{ action: 'x', label: 'أوامر' }] }],
    breadcrumb: 'الرئيسية / الأصناف',
    userName: 'مستخدم'
  };

  sb.document.body.appendChild(Object.assign(sb.document.createElement('div'), { id: 'h1' }));
  UIC.appShell('h1', SHELL_OPTS);
  const now = sb.document.getElementById('h1').innerHTML;

  /* The same call against the tree as it stood before Phase 4. */
  let before = null;
  try {
    const old = boot(execSync('git show 90adbc8:UI_Components.html', { encoding: 'utf8', maxBuffer: 1e8 }));
    old.document.body.appendChild(Object.assign(old.document.createElement('div'), { id: 'h1' }));
    old.UIC.appShell('h1', SHELL_OPTS);
    before = old.document.getElementById('h1').innerHTML;
  } catch (e) {
    console.log('  SKIP  cannot read the pre-Phase-4 tree (' + e.message + ')');
  }
  if (before !== null) {
    ok(now === before,
      'a page that passes no controlPanel gets BYTE-IDENTICAL shell markup',
      'lengths ' + before.length + ' vs ' + now.length);
  }
  ok(now.indexOf('<div class="breadcrumb">') !== -1,
    'and still gets the plain breadcrumb strip');
  ok(now.indexOf('control-panel') === -1, 'and no control panel');
})();

/* ── 2. Opting in replaces the strip ────────────────────────────────────── */
(function () {
  sb.document.body.appendChild(Object.assign(sb.document.createElement('div'), { id: 'h2' }));
  UIC.appShell('h2', {
    nav: [], breadcrumb: 'الرئيسية',
    controlPanel: { title: 'أوامر الشراء', actions: [{ text: 'جديد', onClick: 'n()' }] }
  });
  const html = sb.document.getElementById('h2').innerHTML;
  ok(html.indexOf('control-panel') !== -1, 'opting in renders the control panel');
  ok(html.indexOf('<div class="breadcrumb">') === -1,
    'and replaces the old strip rather than stacking two breadcrumbs');
})();

/* ── 3. Breadcrumb: array segments are clickable, strings still work ────── */
(function () {
  const arr = UIC.controlPanel({
    breadcrumb: [
      { label: 'الرئيسية', action: 'ERPDashboard' },
      { label: 'المشتريات', action: 'vf_purchasing' },
      { label: 'أمر شراء' }
    ]
  });
  ok((arr.match(/class="cp-crumb"/g) || []).length === 2,
    'two of three segments are links');
  ok(/action=ERPDashboard/.test(arr) && /sessionToken=/.test(arr),
    'a segment builds a real in-app URL with the session token');
  ok(/UIC\.navTo/.test(arr), 'and navigates through UIC.navTo');
  ok(/aria-current="page"/.test(arr), 'the last segment is marked aria-current');
  ok((arr.match(/cp-sep/g) || []).length === 2, 'separators between, not after');

  const str = UIC.controlPanel({ breadcrumb: 'الرئيسية / الأصناف' });
  ok(str.indexOf('الرئيسية / الأصناف') !== -1,
    "a hand-typed breadcrumb string still renders as-is — that is what today's 53 pages pass");
  ok(str.indexOf('<a class="cp-crumb"') === -1, 'and is not turned into links by guesswork');
})();

/* ── 4. Search wires to the EXISTING debounced filter ───────────────────── */
(function () {
  const cp = UIC.controlPanel({ search: { table: 'tbl', placeholder: 'ابحث' } });
  ok(/UIC\._cpSearch\('tbl'/.test(cp), 'the search input calls UIC._cpSearch');
  ok(/aria-label="ابحث"/.test(cp), 'the search input has an accessible name');
  ok(/id="cp-chips-tbl"/.test(cp), 'and a chip container bound to that table');

  /* _cpSearch must delegate to the existing filter, not reimplement it. */
  const src = S.read('UI_Components.html');
  const at = src.indexOf('UIC._cpSearch = function');
  const body = src.slice(at, src.indexOf('};', at));
  ok(/UIC\._dtSearchInput\(/.test(body),
    'it calls straight into the existing debounced search — no second filter path');
  ok(!/\.filter\(/.test(body), 'and does no filtering of its own');
})();

/* ── 5. Chips appear and clear ──────────────────────────────────────────── */
(function () {
  const box = sb.document.createElement('div');
  box.id = 'cp-chips-t2';
  sb.document.body.appendChild(box);
  sb.window.__dtStore = sb.window.__dtStore || {};
  sb.window.__dtStore.t2 = { rows: [], filtered: [], opts: {}, headers: [] };

  UIC._cpSearch('t2', 'زيت');
  ok(String(box.innerHTML).indexOf('cp-chip') !== -1, 'typing produces a removable chip');
  ok(String(box.innerHTML).indexOf('زيت') !== -1, 'carrying the term');
  ok(/aria-label="إزالة عامل التصفية"/.test(String(box.innerHTML)),
    'the chip remove button has an accessible name');

  UIC._cpSearch('t2', '');
  ok(String(box.innerHTML) === '', 'clearing the box removes the chip');
})();

/* ── 6. The record pager ────────────────────────────────────────────────── */
(function () {
  const cp = UIC.controlPanel({ pager: { index: 4, total: 137, onPrev: 'p()', onNext: 'n()' } });
  ok(/4 \/ 137/.test(cp), 'shows position within the set');
  ok(/aria-label="السابق"/.test(cp) && /aria-label="التالي"/.test(cp),
    'both arrows have accessible names');
  const none = UIC.controlPanel({});
  ok(none.indexOf('cp-pager') === -1, 'and is absent when no record is open');

  const noHandlers = UIC.controlPanel({ pager: { index: 1, total: 5 } });
  ok((noHandlers.match(/disabled/g) || []).length === 2,
    'arrows without handlers are disabled rather than dead');
})();

/* ── 7. Actions go through UIC.button, not raw markup ───────────────────── */
(function () {
  const cp = UIC.controlPanel({ actions: [{ text: 'جديد', onClick: 'n()' }] });
  ok(/class="btn btn-primary"/.test(cp),
    'the primary action is a real UIC.button, so it matches every other button');
  ok(/cp-actions/.test(cp), 'and sits in the dedicated action slot');
})();

/* ── 8. Responsive shape ────────────────────────────────────────────────── */
(function () {
  const css = S.allCss(S.read('UI_Components.html'));
  const main = /\.cp-row-main\s*\{([^}]*)\}/.exec(css);
  ok(main && /flex-direction:\s*column/.test(main[1]),
    'mobile-first: the control panel stacks by default');
  const at = css.indexOf('@media (min-width: 900px)');
  const blk = css.slice(at, css.indexOf('}\n', css.indexOf('.cp-row-main', at)) + 2);
  ok(/\.cp-row-main\s*\{\s*flex-direction:\s*row/.test(css.slice(at, at + 1200)),
    'and goes to one row at tablet-l, the first tier with room for it');
  ok(/\.cp-search-icon[^}]*inset-inline-start/.test(css),
    'the search icon uses a logical inset, so it mirrors with the direction');
  ok(/\.cp-breadcrumb[^}]*overflow-x:\s*auto/.test(css),
    'a long breadcrumb scrolls inside itself rather than widening the page');
})();

/* ── 9. [UI-4.3 / U-13] Field-targeted search, and its guard ────────────── */
(function () {
  const H = [{ key: 'cust', label: 'العميل' }, { key: 'note', label: 'ملاحظة' }];
  const R = [
    { cust: 'أحمد', note: 'موعد 10:30' },
    { cust: 'سارة', note: 'أحمد أوصى' },
    { cust: 'محمد', note: 'لا شيء' }
  ];
  function run(term) {
    UIC.dataTable('fs', { headers: H, rows: R, autoPage: false });
    const st = sb.window.__dtStore.fs;
    st.searchTerm = String(term).toLowerCase();
    UIC._applyFilters('fs');
    return st.filtered.map(r => r.cust);
  }
  /* The whole-row scan exactly as it stood before this step. */
  function original(term) {
    const q = String(term).toLowerCase();
    return R.filter(function (r) {
      try { return JSON.stringify(r).toLowerCase().indexOf(q) !== -1; } catch (e) { return false; }
    }).map(r => r.cust);
  }

  ok(JSON.stringify(run('العميل: أحمد')) === JSON.stringify(['أحمد']),
    'a column name before the colon narrows to that column', JSON.stringify(run('العميل: أحمد')));
  ok(JSON.stringify(run('cust: سارة')) === JSON.stringify(['سارة']),
    'the column KEY works as well as its label');

  /* Everything that is not a real column must behave exactly as before. */
  ['أحمد', '10:30', 'xyz: أحمد', 'لا شيء', '', 'موعد', ':', 'a:b:c'].forEach(function (t) {
    ok(JSON.stringify(run(t)) === JSON.stringify(original(t)),
      'plain search unchanged for ' + JSON.stringify(t),
      JSON.stringify(run(t)) + ' vs ' + JSON.stringify(original(t)));
  });
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-4.1/4.3 control panel and search: all assertions pass.');
