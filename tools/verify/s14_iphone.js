/**
 * iPhone compatibility for the TopLight print / report / "opens in a new page"
 * flows — and, just as importantly, the proof that Android Chrome and Windows
 * desktop did not move.
 *
 *   node tools/verify/s14_iphone.js
 *
 * WHAT THIS CAN AND CANNOT SHOW
 * -----------------------------
 * There is no layout engine here and no iPhone. Nothing below proves that a
 * card layout LOOKS right on a 390px screen — only a device can say that, and
 * the owner's checklist in IPHONE_RESULTS.md exists for exactly that reason.
 *
 * What it does prove is the property the whole run was shaped around: every
 * change is either a fallback that fires only after the current path has
 * already failed, or a rule scoped below 600px. So the assertions are about
 * the SHAPE of the change — no user-agent branch, no bare window.open left, the
 * three states of .inv-table, and above all a declaration-level diff of each
 * page's own .inv-table CSS against the commit before Phase 2. That last one is
 * the one that matters: these five pages print invoices that customers receive.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failed++;
  console.log('  FAIL  ' + label + (extra ? '\n        ' + String(extra).split('\n').join('\n        ') : ''));
}

const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every Company_TopLight_*.html at the repo root. */
const TL_PAGES = fs.readdirSync(ROOT)
  .filter(f => /^Company_TopLight_.*\.html$/.test(f)).sort();

const PRINT_PAGES = [
  'Company_TopLight_Sales_Print.html',
  'Company_TopLight_Purchase_Print.html',
  'Company_TopLight_Sales_Offer_Print.html',
  'Company_TopLight_Customer_Statement.html',
  'Company_TopLight_Sales_Release.html'
];

/* ── 1. No bare window.open is left ─────────────────────────────────────── */
console.log('\n1 — every "open another page" goes through UIC.openTab\n');
(function () {
  /* openSalesPage_ on المبيعات shipped before this run and is its precedent;
     it is deliberately not refactored to call the helper. */
  const ALLOWED = { 'Company_TopLight_Sales.html': 1 };
  const bad = [];
  TL_PAGES.forEach(function (f) {
    const src = stripComments(read(f));
    const n = (src.match(/window\.open\s*\(/g) || []).length;
    if (n > (ALLOWED[f] || 0)) bad.push(f + ': ' + n + ' call(s)');
  });
  check(bad.length === 0,
    'no bare window.open( remains on any TopLight page (except openSalesPage_)', bad.join(' | '));

  const uic = stripComments(read('UI_Components.html'));
  check(/UIC\.openTab\s*=\s*function/.test(uic), 'UIC.openTab is defined in UI_Components.html');
  check(/UIC\.openTab\s*=\s*function[\s\S]{0,400}?window\.open\(url,\s*'_blank'\)/.test(uic),
    'and it opens the tab with the same window.open(url, \'_blank\') callers used');
  check(/UIC\.openTab\s*=\s*function[\s\S]{0,400}?if\s*\(w\)\s*\{[\s\S]{0,80}?return;/.test(uic),
    'when the tab opens, it returns there — the fallback cannot fire');

  /* The six call sites, each still building the URL it built before. */
  const CALLERS = [
    ['Company_TopLight_Customers.html', 'tl_customer_statement'],
    ['Company_TopLight_Products.html', 'tl_product_movement'],
    ['Company_TopLight_Products.html', 'tl_purchase_needs'],
    ['Company_TopLight_Purchasing.html', 'tl_purchase_print'],
    ['Company_TopLight_Sales_Offer.html', 'tl_sales_offer_print'],
    ['Company_TopLight_Sales_Costing_Analysis.html', 'tl_sales_costing_print']
  ];
  CALLERS.forEach(function (pair) {
    const src = read(pair[0]);
    const re = new RegExp("UIC\\.openTab\\([^;]*\\?action=" + pair[1]);
    check(re.test(src), pair[0] + ' opens ' + pair[1] + ' through UIC.openTab');
  });
})();

/* ── 2. No inline window.close is left, and every إغلاق has a back URL ──── */
console.log('\n2 — إغلاق goes through UIC.closeOrBack, with a real list to go back to\n');
const CLOSE_PAGES = {
  'Company_TopLight_Sales_Print.html': 'tl_sales',
  'Company_TopLight_Sales_Release.html': 'tl_sales',
  'Company_TopLight_Purchase_Print.html': 'tl_purchasing',
  'Company_TopLight_Sales_Offer_Print.html': 'tl_sales_offer',
  'Company_TopLight_Customer_Statement.html': 'tl_customers',
  'Company_TopLight_Product_Movement.html': 'tl_products',
  'Company_TopLight_Purchase_Needs.html': 'tl_products'
};
(function () {
  /* closeReturns on المرتجعات is the precedent and keeps its own copy. */
  const ALLOWED = { 'Company_TopLight_Sales_Returns.html': true };
  const bad = [];
  TL_PAGES.forEach(function (f) {
    if (ALLOWED[f]) return;
    const src = stripComments(read(f));
    if (/window\.(top\.)?close\s*\(/.test(src)) bad.push(f);
  });
  check(bad.length === 0,
    'no inline window.close() / window.top.close() remains on any TopLight page', bad.join(' | '));

  const uic = stripComments(read('UI_Components.html'));
  check(/UIC\.closeOrBack\s*=\s*function/.test(uic), 'UIC.closeOrBack is defined in UI_Components.html');
  check(/UIC\.closeOrBack[\s\S]{0,400}?window\.top\.close\(\)[\s\S]{0,120}?window\.close\(\)/.test(uic),
    'it still tries to close the tab first, exactly as the inline handlers did');
  check(/UIC\.closeOrBack[\s\S]{0,500}?if\s*\(window\.closed\)\s*return;/.test(uic),
    'and gives up if the window really did close');
  check(/UIC\.closeOrBack[\s\S]{0,600}?\}\s*,\s*200\s*\)/.test(uic),
    'after the same 200ms the المرتجعات precedent waits');

  /* Every backUrl action must be a page the registry actually routes. */
  const registry = read('Company_TopLight_Registry.js');
  const routed = {};
  (registry.match(/action:\s*'([a-z0-9_]+)'/g) || [])
    .forEach(m => { routed[m.replace(/.*'([a-z0-9_]+)'.*/, '$1')] = true; });

  Object.keys(CLOSE_PAGES).forEach(function (f) {
    const action = CLOSE_PAGES[f];
    const src = read(f);
    check(src.indexOf('UIC.closeOrBack(backUrl_())') !== -1, f + ': إغلاق calls UIC.closeOrBack');
    check(new RegExp("function backUrl_\\(\\)[\\s\\S]{0,300}?\\?action=" + action + "&").test(src),
      '  and backUrl_() points at ' + action);
    check(routed[action] === true, '  and ' + action + ' is a page Company_TopLight_Registry.js routes');
  });
})();

/* ── 3. No platform sniffing anywhere in the run's file set ─────────────── */
console.log('\n3 — nothing is keyed on the user agent (R-4)\n');
(function () {
  const bad = [];
  TL_PAGES.concat(['UI_Components.html']).forEach(function (f) {
    const src = stripComments(read(f));
    if (/navigator\.(userAgent|platform|vendor)|isIOS|iPhone|iPad|Safari/i.test(src)) bad.push(f);
  });
  check(bad.length === 0,
    'no user-agent / iOS / Safari branch was introduced — Android and Windows never enter a new path',
    bad.join(' | '));
})();

/* ── 4. .inv-table is shared, and has all three states ──────────────────── */
console.log('\n4 — .inv-table is defined once, in three states\n');

/**
 * The body of an @media block, matched by its opening text. A header can occur
 * more than once in one file — UI_Components writes a tiny
 * `@media (min-width: 600px){#home-logo-fab…}` into a JS style string long
 * before the real tier — so `contains` picks the occurrence that matters.
 * Returns { body, at } so a caller can also slice the region before it.
 */
function mediaBlockAt(css, header, contains) {
  let from = 0;
  for (;;) {
    const at = css.indexOf(header, from);
    if (at === -1) return { body: '', at: -1 };
    const open = css.indexOf('{', at);
    let depth = 0, body = null;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') { depth--; if (depth === 0) { body = css.slice(open + 1, i); break; } }
    }
    if (body === null) return { body: '', at: -1 };
    if (!contains || body.indexOf(contains) !== -1) return { body: body, at: at };
    from = at + header.length;
  }
}
function mediaBlock(css, header, contains) {
  return mediaBlockAt(css, header, contains).body;
}

const UIC_SRC = stripComments(read('UI_Components.html'));
/* The real tablet-p tier is the one that restores the data table, not the FAB
   sizing string that shares its header. */
const TIER = mediaBlockAt(UIC_SRC, '@media (min-width: 600px)', '.table thead');
const TIER_600 = TIER.body;
const PRINT_BLOCK = mediaBlock(UIC_SRC, '@media print {', '.table thead');

(function () {
  /* Only UI_Components may carry an UNSCOPED .inv-table rule: the five pages
     keep their own declarations, but every one of them must sit inside a media
     query so it cannot reach a phone. */
  const offenders = [];
  TL_PAGES.forEach(function (f) {
    const src = stripComments(read(f));
    const styleAt = src.indexOf('<style>');
    if (styleAt === -1) return;
    const css = src.slice(styleAt, src.indexOf('</style>', styleAt));
    /* Walk the page CSS tracking @media depth; a .inv-table selector at depth 0
       is a rule that would apply on a phone. */
    let depth = 0, inMedia = 0, i = 0;
    const lines = css.split('\n');
    lines.forEach(function (line) {
      const isMedia = /@media/.test(line);
      if (/\.inv-table/.test(line) && inMedia === 0) offenders.push(f + ': ' + line.trim());
      if (isMedia) inMedia++;
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      depth += opens - closes;
      if (inMedia > 0 && depth === 0) inMedia = 0;
    });
  });
  check(offenders.length === 0,
    'no TopLight page carries an unscoped .inv-table rule — the shared one owns the phone',
    offenders.join('\n'));

  const base = UIC_SRC.slice(0, TIER.at);
  check(/\.inv-table[^{]*\{[^}]*display:\s*block/.test(base),
    'BASE (phone): .inv-table is laid out as blocks — a card per row');
  check(/\.inv-table\s+thead\s*\{\s*display:\s*none/.test(base),
    'BASE: the header row is hidden, its labels move into the cells');
  check(/\.inv-table td\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/.test(base),
    'BASE: each cell prints its own data-label');

  check(/\.inv-table\s*\{\s*display:\s*table/.test(TIER_600),
    'TABLET-P (>=600px): .inv-table is a table again');
  check(/\.inv-table td\s*\{[^}]*display:\s*table-cell/.test(TIER_600),
    'TABLET-P: its cells are table-cells again');
  check(/\.inv-table td\[data-label\]::before\s*\{\s*content:\s*none/.test(TIER_600),
    'TABLET-P: the data-label is invisible — desktop is untouched');

  check(/table\.inv-table\s*\{\s*display:\s*table/.test(PRINT_BLOCK),
    'PRINT: .inv-table is forced back to a table, as .table already was (R-3)');
  check(/table\.inv-table td\[data-label\]::before\s*\{\s*content:\s*none/.test(PRINT_BLOCK),
    'PRINT: no card labels reach paper');
  /* The print rules sit ABOVE the card rules in the file, so equal specificity
     would lose. The type selector is what makes them win. */
  check(UIC_SRC.indexOf('@media print {') < UIC_SRC.indexOf('.inv-table thead { display: none'),
    'the print block precedes the card rules, which is why it uses table.inv-table');
})();

/* ── 5. THE EQUALITY PROOF ──────────────────────────────────────────────── */
console.log('\n5 — every page\'s .inv-table declarations are unchanged at >=600px and in print\n');

/** Declarations of every `.inv-table…` rule in a stylesheet, as selector -> {prop: value}. */
function invTableDecls(css) {
  const out = {};
  const re = /([^{}]*\.inv-table[^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (/@media/.test(sel)) continue;
    out[sel] = out[sel] || {};
    m[2].split(';').forEach(function (d) {
      const c = d.indexOf(':');
      if (c === -1) return;
      const prop = d.slice(0, c).trim();
      const val = d.slice(c + 1).replace(/\s+/g, ' ').trim();
      if (prop) out[sel][prop] = val;
    });
  }
  return out;
}

/**
 * The revision of `file` immediately BEFORE the Phase 2 commit: the newest one
 * whose page CSS still declared .inv-table outside any media query. Resolved
 * from history rather than hardcoded as HEAD~N, so this check keeps working as
 * later commits land on top of it.
 */
function baselineSource(file) {
  const revs = execFileSync('git', ['log', '--format=%H', '--', file],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const rev of revs) {
    let src;
    try { src = execFileSync('git', ['show', rev + ':' + file], { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { continue; }
    const css = stripComments(src);
    const styleAt = css.indexOf('<style>');
    if (styleAt === -1) continue;
    const sheet = css.slice(styleAt, css.indexOf('</style>', styleAt));
    /* Pre-Phase-2 shape: a .inv-table rule that is NOT inside a media query. */
    if (/\n\s*\.inv-table\s*\{/.test(sheet) && !/@media[^{]*\{[^}]*\n\s*\.inv-table/.test(sheet)) {
      return { rev: rev, src: src };
    }
  }
  return null;
}

PRINT_PAGES.forEach(function (file) {
  const baseline = baselineSource(file);
  if (!baseline) {
    check(false, file + ': a pre-Phase-2 revision could be found in git history');
    return;
  }
  const oldCss = stripComments(baseline.src);
  const newCss = stripComments(read(file));

  const before = invTableDecls(oldCss.slice(oldCss.indexOf('<style>'), oldCss.indexOf('</style>')));
  const after = invTableDecls(newCss.slice(newCss.indexOf('<style>'), newCss.indexOf('</style>')));

  const missing = [];
  let count = 0;
  Object.keys(before).forEach(function (sel) {
    Object.keys(before[sel]).forEach(function (prop) {
      count++;
      const was = before[sel][prop];
      const now = after[sel] && after[sel][prop];
      if (now !== was) missing.push('    ' + sel + ' { ' + prop + ': ' + was + ' }  ->  ' +
        (now === undefined ? 'MISSING' : now));
    });
  });
  check(missing.length === 0,
    file + ': all ' + count + ' .inv-table declarations survive verbatim (baseline ' +
      baseline.rev.slice(0, 7) + ')',
    missing.join('\n'));

  /* …and they are now inside a query that covers BOTH the desktop and paper. */
  const sheet = newCss.slice(newCss.indexOf('<style>'), newCss.indexOf('</style>'));
  check(/@media print,\s*\(min-width:\s*600px\)/.test(sheet),
    '  and they now live in @media print, (min-width: 600px) — desktop and paper both keep them');
});

/* ── 6. .inv-totals no longer overflows a phone ─────────────────────────── */
console.log('\n6 — the totals block fits a narrow screen (D-9)\n');
(function () {
  [['Company_TopLight_Sales_Print.html', '320px'],
   ['Company_TopLight_Purchase_Print.html', '300px'],
   ['Company_TopLight_Sales_Offer_Print.html', '300px']].forEach(function (p) {
    const src = read(p[0]);
    check(new RegExp('\\.inv-totals\\s*\\{[^}]*width:\\s*min\\(' + p[1] + ',\\s*100%\\)').test(src),
      p[0] + ': .inv-totals is width: min(' + p[1] + ', 100%) — identical wherever there is room');
  });
})();

/* ── 7. Every <td> the five pages emit carries a data-label ─────────────── */
console.log('\n7 — every emitted <td> carries its column label (D-5)\n');
(function () {
  PRINT_PAGES.forEach(function (f) {
    const src = stripComments(read(f));
    /* Literal <td …> strings the page builds. A page that routes every cell
       through a row builder emits none, which is the better answer. */
    const literals = src.split(/\r?\n/)
      .filter(line => /'<td/.test(line) && line.indexOf('data-label') === -1)
      .map(line => line.trim());
    check(literals.length === 0,
      f + ': no <td> is emitted without a data-label', literals.join(' | '));
    check(/data-label="/.test(src), f + ': its rows are built with data-label');
    /* The header and the labels come from one list, so they cannot drift. */
    check(/var COLS = \[/.test(src) && /COLS\[i\]/.test(src),
      f + ': the <th> row and the data-labels are built from the same COLS list');
  });
})();

/* ── 8. Costing_Print's narrow base is real ─────────────────────────────── */
console.log('\n8 — the costing print page has a real phone layout (D-10)\n');
(function () {
  const f = 'Company_TopLight_Sales_Costing_Print.html';
  const src = stripComments(read(f));
  const sheet = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  const tier = mediaBlock(sheet, '@media (min-width: 600px)');
  const base = sheet.slice(0, sheet.indexOf('@media (min-width: 600px)'));

  function decl(css, sel, prop) {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*\\{[^}]*?' + prop + ':\\s*([^;}]+)');
    const m = css.match(re);
    return m ? m[1].trim() : null;
  }

  const pairs = [['.meta-grid', 'grid-template-columns'],
                 ['.cards-grid', 'grid-template-columns'],
                 ['.acard.span2', 'grid-column'],
                 ['.cost-doc', 'padding']];
  pairs.forEach(function (p) {
    const b = decl(base, p[0], p[1]);
    const t = decl(tier, p[0], p[1]);
    check(b !== null && t !== null && b !== t,
      f + ': ' + p[0] + ' ' + p[1] + ' differs between base and tablet-p (base ' + b + ' / tier ' + t + ')');
  });
  check(decl(base, '.meta-grid', 'grid-template-columns') === '1fr',
    '  the yellow meta block is one column on a phone');
  check(decl(tier, '.meta-grid', 'grid-template-columns') === 'repeat(3, 1fr)',
    '  and still three columns from tablet-p up — the desktop is untouched');
  check(/\.print-btn\s*\{[^}]*min-height:\s*44px/.test(sheet),
    '  the print button meets the 44px tap target (it was ~40px, so it only grows)');
})();

/* ── 9. The viewport meta tag ───────────────────────────────────────────── */
console.log('\n9 — the server viewport tag opts into the safe area (D-8)\n');
(function () {
  const code = read('Code.js');
  const tags = code.match(/addMetaTag\('viewport',\s*'([^']*)'\)/g) || [];
  check(tags.length === 1, 'Code.js emits exactly one addMetaTag(\'viewport\', …)', tags.join(' | '));
  check(tags.length === 1 && tags[0].indexOf('viewport-fit=cover') !== -1,
    'and it carries viewport-fit=cover, which activates the --safe-* tokens already in the CSS');
  check(tags.length === 1 && /width=device-width,\s*initial-scale=1/.test(tags[0]),
    'while keeping width=device-width, initial-scale=1 exactly as before');
  const uic = read('UI_Components.html');
  check(/var\(--safe-bottom/.test(uic) && /var\(--safe-right/.test(uic),
    'the home FAB already reads the safe-area tokens, so it moves clear of the home indicator');
})();

/* ── 10. The public contract only grew ──────────────────────────────────── */
console.log('\n10 — UIC gained two members and lost none\n');
(function () {
  const uic = read('UI_Components.html');
  check(/UIC\.openTab\s*=/.test(uic) && /UIC\.closeOrBack\s*=/.test(uic),
    'UIC.openTab and UIC.closeOrBack both exist');
  ['navTo', 'baseUrl', 'token', 'actionBtns', 'dataTable', 'toast']
    .forEach(function (m) {
      check(new RegExp('UIC\\.' + m + '\\s*=').test(uic), 'UIC.' + m + ' is still defined');
    });
  /* ui_check C3 is the real contract gate; this only catches an outright
     deletion, and says where the full check lives. */
  console.log('        (the full contract gate is check C3 in tools/ui_check.js)');
})();

console.log('\n' + (failed === 0
  ? 'OK — the iPhone fallbacks are in place and every >=600px / print declaration is unchanged.'
  : 'FAILED: ' + failed + ' assertion(s)'));
process.exit(failed === 0 ? 0 : 1);
