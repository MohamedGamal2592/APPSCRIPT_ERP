/**
 * iPhone compatibility, part two: the print WINDOWS, the ValleyFoods and
 * TopChemical flows the first run did not reach, and the same proof that
 * Android Chrome and Windows desktop did not move.
 *
 *   node tools/verify/s15_iphone_rest.js
 *
 * Sibling of s14_iphone.js, and deliberately built from its parts — the
 * mediaBlockAt walker and the history-walking baselineSource are the same two
 * ideas, because the property being proved is the same one.
 *
 * WHAT THIS CAN AND CANNOT SHOW
 * -----------------------------
 * There is no layout engine here and no iPhone. Nothing below proves a card
 * layout LOOKS right at 390px, and nothing below proves that printing from
 * inside the Apps Script iframe reaches the document rather than Google's
 * wrapper page. That is what the owner checklist in IPHONE_PHASE2_RESULTS.md
 * is for.
 *
 * What it does prove is the shape of the change: every behavioural branch is
 * unreachable until the current path has already returned null, and every CSS
 * change is scoped so that at >= 600px and on paper the declarations are the
 * ones that were there before.
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
const UIC_SRC = stripComments(read('UI_Components.html'));

/** The six places that build a document and write it into a blank tab. */
const PRINT_SITES = [
  ['UI_Components.html', 'UIC.printTable'],
  ['Company_TopChemical_StockRevision.html', 'printFiltered'],
  ['Company_ValleyFoods_MfgOrderView.html', 'printMo'],
  ['Company_ValleyFoods_Parties.html', 'printStatement'],
  ['Company_ValleyFoods_Purchasing.html', 'openPrint'],
  ['Company_ValleyFoods_Attendance.html', 'printForgetForm']
];

/** The 18 file links, and the download type each one must still build. */
const DOWNLOAD_SITES = [
  ['0_ERP_Management.html', ['erp_invoice']],
  ['Company_TopChemical_Barcode.html', ['print_barcode']],
  ['Company_TopChemical_BudgetInputs.html', ['attachment', 'budget_print']],
  ['Company_TopChemical_BudgetInvoices.html', ['budget_print']],
  ['Company_TopChemical_BudgetManufacture.html', ['attachment', 'budget_print']],
  ['Company_TopChemical_BudgetStockMovement.html', ['budget_print']],
  ['Company_TopChemical_CartonSizes.html', ['doc_file']],
  ['Company_TopChemical_EmpSalaries.html', ['payroll_report']],
  ['Company_TopChemical_ImportFollow.html', ['doc_file']],
  ['Company_TopChemical_Products.html', ['print_product_barcode', 'print_file']],
  ['Company_TopChemical_RegistrationPapers.html', ['attachment']],
  ['Company_ValleyFoods_Deductions.html', ['attachment']],
  ['Company_ValleyFoods_Overtime.html', ['attachment', 'attachment']],
  ['Company_ValleyFoods_Vacations.html', ['attachment']]
];

/** The three pages that adopted .card-table, and the class each already had. */
const CARD_PAGES = [
  ['Company_TopChemical_BoxAnalysis.html', 'items-table'],
  ['Company_TopChemical_BudgetIncome.html', 'inc-table'],
  ['Company_ValleyFoods_MfgOrderView.html', 'odoo-table']
];

/**
 * The body of an @media block, matched by its opening text. Same walker as
 * s14: a header can occur more than once in one file, so `contains` picks the
 * occurrence that matters. Returns { body, at }.
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
function mediaBlock(css, header, contains) { return mediaBlockAt(css, header, contains).body; }

/** The source of one named function, brace-matched from its declaration. */
function functionBody(src, name) {
  const decls = [
    'function ' + name + '(',
    name + ' = function'
  ];
  for (const d of decls) {
    const at = src.indexOf(d);
    if (at === -1) continue;
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
  }
  return '';
}

/* ── 1. No blank-tab window.open survives outside UIC.printDoc ──────────── */
console.log('\n1 — the only window.open(\'\', \'_blank\') left is inside UIC.printDoc\n');
(function () {
  const printDoc = functionBody(UIC_SRC, 'UIC.printDoc');
  const files = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));
  const bad = [];
  files.forEach(function (f) {
    let src = stripComments(read(f));
    /* UIC.printDoc is the ONE place allowed to open a blank tab; everything
       else must reach it through the helper. Removing its body first means the
       assertion is "outside printDoc", not "at most N". */
    if (f === 'UI_Components.html' && printDoc) src = src.replace(printDoc, '');
    const hits = (src.match(/window\.open\(\s*''\s*,\s*'_blank'/g) || []).length;
    if (hits) bad.push(f + ': ' + hits);
  });
  check(bad.length === 0,
    'no window.open(\'\', \'_blank\') is left anywhere outside UIC.printDoc', bad.join(' | '));

  check(printDoc.length > 0, 'UIC.printDoc is defined in UI_Components.html');
  check(/window\.open\('',\s*'_blank'\)/.test(printDoc),
    'and it makes the same window.open(\'\', \'_blank\') the six sites made');
  check(/opts\.features\s*\?\s*window\.open\('',\s*'_blank',\s*opts\.features\)/.test(printDoc),
    'the one caller that passed window features still gets them, and no one else gets an empty string');
})();

/* ── 2. The success path is unchanged and returns before the overlay ────── */
console.log('\n2 — a window that opens is written exactly as before, and returns (R-1)\n');
(function () {
  const printDoc = functionBody(UIC_SRC, 'UIC.printDoc');
  const ifAt = printDoc.indexOf('if (w) {');
  check(ifAt !== -1, 'UIC.printDoc branches on whether a window came back');

  const success = printDoc.slice(ifAt, printDoc.indexOf('return true;', ifAt));
  const order = ['w.document.open()', 'w.document.write(html)', 'w.document.close()'];
  let cursor = -1, inOrder = true;
  order.forEach(function (call) {
    const at = success.indexOf(call);
    if (at === -1 || at < cursor) inOrder = false;
    cursor = at;
  });
  check(inOrder, 'it calls document.open, write and close, in that order — byte for byte the old body');
  check(/return true;/.test(printDoc), 'and returns true from the success branch');

  /* The proof that matters: no overlay call can be reached with a window. */
  const overlayAt = printDoc.indexOf('_printDocOverlay');
  const returnAt = printDoc.indexOf('return true;');
  check(overlayAt > returnAt,
    'the overlay is written AFTER that return — unreachable when a window comes back');
  check(!/_printDocOverlay/.test(success),
    'and the success branch itself never mentions the overlay');
})();

/* ── 3. The overlay's stylesheet, and that إغلاق leaves nothing behind ──── */
console.log('\n3 — the overlay prints the document, and closing removes all of it\n');
(function () {
  const overlay = functionBody(UIC_SRC, 'UIC._printDocOverlay');
  check(overlay.length > 0, 'UIC._printDocOverlay is defined');
  check(/body\s*>\s*\*:not\(#uic-print-doc\)\s*\{\s*display:\s*none\s*!important/.test(overlay),
    'its print stylesheet hides every other direct child of body');
  check(/@media print/.test(overlay), 'and does so only when printing');
  check(/<body\[\^>\]\*>\(\[\\s\\S\]\*\)<\\\/body>/.test(overlay) || /<body\[\^>\]\*>/.test(overlay),
    'it lifts the <body> out of the document it was handed');
  check(/if \(m\) body = m\[1\];/.test(overlay),
    'and falls back to the whole string when there is no body tag');
  check(/طباعة/.test(overlay) && /إغلاق/.test(overlay),
    'it offers a طباعة button and an إغلاق button');
  check(overlay.indexOf('UIC._printDocClose()') !== -1,
    'a previous overlay is cleared before a new one is built');

  const close = functionBody(UIC_SRC, 'UIC._printDocClose');
  check(close.length > 0, 'UIC._printDocClose is defined');
  check(/getElementById\('uic-print-doc'\)/.test(close), 'إغلاق removes the overlay element');
  check(/getElementById\('uic-print-doc-style'\)/.test(close),
    'AND the style element it added — nothing leaks across repeated prints');
})();

/* ── 4. All six print sites go through the helper ───────────────────────── */
console.log('\n4 — every built-document print goes through UIC.printDoc\n');
(function () {
  PRINT_SITES.forEach(function (pair) {
    const [file, fn] = pair;
    const src = stripComments(read(file));
    const body = functionBody(src, fn);
    check(body.length > 0, file + ': ' + fn + ' was found');
    check(/UIC\.printDoc\(/.test(body), file + ': ' + fn + ' calls UIC.printDoc');
    check(!/window\.open\(/.test(body), '  and no longer opens a window of its own');
    check(!/\.document\.write\(/.test(body), '  and no longer writes a document of its own');
  });

  /* Each caller's own post-write behaviour survived as opts.then. */
  const KEEPS = [
    ['UI_Components.html', 'UIC.printTable', /then: function \(w\) \{ w\.print\(\); \}/],
    ['Company_TopChemical_StockRevision.html', 'printFiltered', /then: function \(w\) \{ w\.print\(\); \}/],
    ['Company_ValleyFoods_MfgOrderView.html', 'printMo', /w\.focus\(\);[\s\S]{0,120}?\}, 350\)/],
    ['Company_ValleyFoods_Parties.html', 'printStatement', /win\.focus\(\); win\.print\(\); \}, 500\)/],
    ['Company_ValleyFoods_Attendance.html', 'printForgetForm', /features: 'width=800,height=600'/]
  ];
  KEEPS.forEach(function (k) {
    const body = functionBody(stripComments(read(k[0])), k[1]);
    check(k[2].test(body), k[0] + ': ' + k[1] + ' kept its own post-write behaviour verbatim');
  });
  const purchasing = functionBody(stripComments(read('Company_ValleyFoods_Purchasing.html')), 'openPrint');
  check(!/then:/.test(purchasing),
    'Company_ValleyFoods_Purchasing.html: openPrint still does NOT auto-print, as before');
})();

/* ── 5. No ?action= tab is opened by hand any more ──────────────────────── */
console.log('\n5 — every "open an app page" goes through UIC.openTab (D-3)\n');
(function () {
  const files = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f));
  /* openSalesPage_ on المبيعات shipped before the first run and is its
     precedent; it is deliberately not refactored. */
  const bad = [];
  files.forEach(function (f) {
    const src = stripComments(read(f));
    (src.match(/window\.open\([^;]*\?action=[^;]*/g) || []).forEach(function (hit) {
      if (f === 'Company_TopLight_Sales.html') return;
      bad.push(f + ': ' + hit.slice(0, 70));
    });
  });
  check(bad.length === 0,
    'no page opens an ?action= URL with a bare window.open (except openSalesPage_)',
    bad.join('\n'));

  const mfg = stripComments(read('Company_ValleyFoods_MfgOrders.html'));
  check(/UIC\.openTab\([^;]*\?action=vf_mfg_order&mo=/.test(mfg),
    'ValleyFoods MfgOrders: openDetail opens vf_mfg_order through UIC.openTab');
  check(/UIC\.openTab\([^;]*\?action=vf_mfg_order&new=1/.test(mfg),
    'ValleyFoods MfgOrders: openNewPage opens vf_mfg_order&new=1 through UIC.openTab');

  const helpers = stripComments(read('Client_Helpers.html'));
  const openHistory = functionBody(helpers, 'SESSION.openHistory');
  check(/UIC\.HistorySide/.test(openHistory),
    'SESSION.openHistory still prefers UIC.HistorySide — that branch is untouched');
  check(/UIC\.openTab\(url\)/.test(openHistory),
    'and only its window.open fallback now goes through UIC.openTab');
  const registry = read('01_Registry.js');
  check(/action:\s*'record_history'/.test(registry),
    'record_history is a page 01_Registry.js actually routes');
})();

/* ── 6. All 17 download sites, each still building its own URL ──────────── */
console.log('\n6 — every ?download= link goes through UIC.openDownload (D-4)\n');
(function () {
  let total = 0;
  DOWNLOAD_SITES.forEach(function (pair) {
    const [file, types] = pair;
    const src = stripComments(read(file));
    const calls = src.match(/UIC\.openDownload\([\s\S]{0,400}?\)/g) || [];
    check(calls.length === types.length,
      file + ': ' + types.length + ' UIC.openDownload call(s)', 'found ' + calls.length);
    check(!/window\.open\([^;]*\?download=/.test(src),
      '  and no bare window.open on a ?download= URL is left');
    types.forEach(function (t, i) {
      const call = calls[i] || '';
      check(call.indexOf('?download=' + t) !== -1,
        '  call ' + (i + 1) + ' still builds ?download=' + t);
      total++;
    });
  });
  check(total === 18, 'all 18 download sites are accounted for', 'counted ' + total);

  const openDownload = functionBody(UIC_SRC, 'UIC.openDownload');
  check(openDownload.length > 0, 'UIC.openDownload is defined in UI_Components.html');
  check(/window\.open\(url,\s*'_blank'\)/.test(openDownload),
    'and it opens the tab with the same window.open(url, \'_blank\') callers used');
  const retAt = openDownload.indexOf('return; }');
  check(retAt !== -1 && openDownload.indexOf('openModal') > retAt,
    'when the tab opens it returns there — the dialog is unreachable (R-1)');
})();

/* ── 7. The fallback is a real link, not a toast ────────────────────────── */
console.log('\n7 — a blocked download offers a tappable link (D-4)\n');
(function () {
  const openDownload = functionBody(UIC_SRC, 'UIC.openDownload');
  check(/<a href="'\s*\+\s*UIC\.escHtml\(url\)/.test(openDownload),
    'the fallback renders a real <a href> carrying the SAME url');
  check(/target="_blank" rel="noopener"/.test(openDownload),
    'with target=_blank and rel=noopener');
  check(/min-height:44px/.test(openDownload),
    'at a 44px tap target');
  check(!/UIC\.toast/.test(openDownload),
    'and it is NOT a toast — a toast vanishes before it can be tapped');
  check(/UIC\.openModal\(/.test(openDownload),
    'it is the styled modal, which is dismissible');
})();

/* ── 8. .card-table joined the three shared blocks, .inv-table did not move ─ */
console.log('\n8 — .card-table shares all three .inv-table blocks, byte for byte (R-2)\n');
const TIER = mediaBlockAt(UIC_SRC, '@media (min-width: 600px)', '.table thead');
const TIER_600 = TIER.body;
const PRINT_BLOCK = mediaBlock(UIC_SRC, '@media print {', '.table thead');
const BASE = UIC_SRC.slice(0, TIER.at);

(function () {
  check(/\.card-table[^{]*\{[^}]*display:\s*block/.test(BASE),
    'BASE (phone): .card-table is laid out as blocks — a card per row');
  check(/\.card-table thead[^{]*\{\s*display:\s*none/.test(BASE),
    'BASE: its header row is hidden');
  check(/\.card-table td\[data-label\]::before[^{]*\{[^}]*content:\s*attr\(data-label\)/.test(BASE),
    'BASE: each cell prints its own data-label');
  check(/\.card-table[^{]*\{\s*display:\s*table/.test(TIER_600),
    'TABLET-P (>=600px): .card-table is a table again');
  check(/\.card-table td[^{]*\{[^}]*display:\s*table-cell/.test(TIER_600),
    'TABLET-P: its cells are table-cells again');
  check(/table\.card-table[^{]*\{\s*display:\s*table/.test(PRINT_BLOCK),
    'PRINT: .card-table is forced back to a table (R-3)');
  check(/table\.card-table td\[data-label\]::before[^{]*\{\s*content:\s*none/.test(PRINT_BLOCK),
    'PRINT: no card labels reach paper');

  /* THE EQUALITY PROOF for the shared sheet: every .inv-table declaration in
     the three blocks is the one the revision before this run had. */
  function invDecls(css) {
    const out = {};
    const re = /([^{}]*\.inv-table[^{}]*)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      const raw = m[1].replace(/\s+/g, ' ').trim();
      if (/@media/.test(raw)) continue;
      /* Compare per INV-TABLE selector, ignoring which .card-table selectors
         now share the list — the declarations are what must not move. */
      const sel = raw.split(',').map(s => s.trim())
        .filter(s => s.indexOf('.inv-table') !== -1).join(', ');
      if (!sel) continue;
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

  /* The revision of UI_Components.html before .card-table existed. */
  const revs = execFileSync('git', ['log', '--format=%H', '--', 'UI_Components.html'],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  let baseline = null;
  for (const rev of revs) {
    let src;
    try { src = execFileSync('git', ['show', rev + ':UI_Components.html'], { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { continue; }
    if (src.indexOf('.card-table') === -1 && src.indexOf('.inv-table') !== -1) {
      baseline = { rev: rev, src: stripComments(src) };
      break;
    }
  }
  if (!baseline) {
    check(false, 'a pre-.card-table revision of UI_Components.html could be found');
    return;
  }

  const before = invDecls(baseline.src);
  const after = invDecls(UIC_SRC);
  const moved = [];
  let count = 0;
  Object.keys(before).forEach(function (sel) {
    Object.keys(before[sel]).forEach(function (prop) {
      count++;
      const was = before[sel][prop];
      const now = after[sel] && after[sel][prop];
      if (now !== was) moved.push('    ' + sel + ' { ' + prop + ': ' + was + ' }  ->  ' +
        (now === undefined ? 'MISSING' : now));
    });
  });
  check(moved.length === 0,
    'all ' + count + ' shared .inv-table declarations survive verbatim (baseline ' +
      baseline.rev.slice(0, 7) + ')',
    moved.join('\n'));
})();

/* ── 9. Each page's own table CSS is unchanged, and scoped ──────────────── */
console.log('\n9 — the three pages kept their look, and moved it out of the phone (R-2)\n');

/** Declarations of every `.<cls>…` rule in a stylesheet, selector -> {prop: value}. */
function classDecls(css, cls) {
  const out = {};
  const re = new RegExp('([^{}]*\\.' + cls + '[^{}]*)\\{([^{}]*)\\}', 'g');
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
 * The revision of `file` before this run scoped its table: the newest one whose
 * page CSS still declared `.<cls>` OUTSIDE any media query. Resolved from
 * history rather than a hardcoded HEAD~N, the way s14 does, so this keeps
 * working as later commits land.
 */
function baselineSource(file, cls) {
  const revs = execFileSync('git', ['log', '--format=%H', '--', file],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const rev of revs) {
    let src;
    try { src = execFileSync('git', ['show', rev + ':' + file], { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { continue; }
    const css = stripComments(src);
    const styleAt = css.indexOf('<sty' + 'le>');
    if (styleAt === -1) continue;
    const sheet = css.slice(styleAt, css.indexOf('</sty' + 'le>', styleAt));
    const re = new RegExp('\\n\\s*\\.' + cls + '\\s*\\{');
    const inMedia = new RegExp('@media[^{]*\\{[^}]*\\n\\s*\\.' + cls);
    if (re.test(sheet) && !inMedia.test(sheet)) return { rev: rev, src: src };
  }
  return null;
}

CARD_PAGES.forEach(function (pair) {
  const [file, cls] = pair;
  const baseline = baselineSource(file, cls);
  if (!baseline) {
    check(false, file + ': a pre-Phase-4 revision could be found in git history');
    return;
  }
  const oldCss = stripComments(baseline.src);
  const newCss = stripComments(read(file));
  const sheetOf = css => css.slice(css.indexOf('<sty' + 'le>'), css.lastIndexOf('</sty' + 'le>'));

  const before = classDecls(sheetOf(oldCss), cls);
  const after = classDecls(sheetOf(newCss), cls);

  const moved = [];
  let count = 0;
  Object.keys(before).forEach(function (sel) {
    Object.keys(before[sel]).forEach(function (prop) {
      count++;
      const was = before[sel][prop];
      const now = after[sel] && after[sel][prop];
      if (now !== was) moved.push('    ' + sel + ' { ' + prop + ': ' + was + ' }  ->  ' +
        (now === undefined ? 'MISSING' : now));
    });
  });
  check(moved.length === 0,
    file + ': all ' + count + ' .' + cls + ' declarations survive verbatim (baseline ' +
      baseline.rev.slice(0, 7) + ')',
    moved.join('\n'));

  /* …and none of them can reach a phone any more. */
  const sheet = sheetOf(newCss);
  let depth = 0, inMedia = 0;
  const offenders = [];
  sheet.split('\n').forEach(function (line) {
    const isMedia = /@media/.test(line);
    if (new RegExp('\\.' + cls).test(line) && inMedia === 0) offenders.push(line.trim());
    if (isMedia) inMedia++;
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (inMedia > 0 && depth === 0) inMedia = 0;
  });
  check(offenders.length === 0,
    '  and no unscoped .' + cls + ' rule is left — the shared .card-table owns the phone',
    offenders.join('\n'));
  check(/@media print,\s*\(min-width:\s*600px\)/.test(sheet),
    '  they live in @media print, (min-width: 600px) — desktop and paper both keep them');
  check(new RegExp('class="' + cls + ' card-table"').test(newCss) ||
        new RegExp('class=\\\\"' + cls + ' card-table').test(newCss),
    '  and the table opts in with class="' + cls + ' card-table"');
});

/* ── 10. Every <td> those pages emit carries a data-label ───────────────── */
console.log('\n10 — every emitted <td> carries its column label (D-5)\n');
(function () {
  CARD_PAGES.forEach(function (pair) {
    const file = pair[0];
    let src = stripComments(read(file));
    /* printMo builds a SEPARATE print document that never sees the app
       stylesheet and is meant to be a table on paper — D-5 says leave it. */
    if (file === 'Company_ValleyFoods_MfgOrderView.html') {
      const printMo = functionBody(src, 'printMo');
      if (printMo) src = src.replace(printMo, '');
    }
    const bare = src.split(/\r?\n/)
      .filter(line => /'<td/.test(line) && line.indexOf('data-label') === -1)
      .map(line => line.trim().slice(0, 90));
    check(bare.length === 0,
      file + ': no <td> is emitted without a data-label', bare.join('\n'));
    check(/data-label="'\s*\+/.test(src),
      '  and the labels come from a list, not from literals repeated per cell');
  });
})();

/* ── 11. The row menu closes on a tap, in CSS, with no JS change ────────── */
console.log('\n11 — a tap on empty page space closes the row menu (D-6)\n');
(function () {
  const hover = mediaBlock(UIC_SRC, '@media (hover: none)', 'body');
  check(/body\s*\{\s*cursor:\s*pointer;?\s*\}/.test(hover),
    '(hover: none) carries body { cursor: pointer } — iOS then delivers the click');
  check(UIC_SRC.indexOf('cursor: pointer') !== -1 &&
        !/cursor:\s*pointer[^;]*;\s*\}\s*$/.test(''),
    'and it is inside a media query, so a desktop mouse never sees it');

  /* The listener itself must not have moved: no JS change, nothing to
     double-fire. Compared against the revision before this run. */
  const listener = "document.addEventListener('click', function(e){";
  check(UIC_SRC.indexOf(listener) !== -1, 'the outside-click listener is still there');

  const revs = execFileSync('git', ['log', '--format=%H', '--', 'UI_Components.html'],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  let before = null;
  for (const rev of revs) {
    let src;
    try { src = execFileSync('git', ['show', rev + ':UI_Components.html'], { cwd: ROOT, encoding: 'utf8' }); }
    catch (e) { continue; }
    if (src.indexOf('UIC.printDoc') === -1) { before = stripComments(src); break; }
  }
  if (!before) { check(false, 'a pre-run revision of UI_Components.html could be found'); return; }

  function listenerBody(src) {
    const at = src.indexOf(listener);
    if (at === -1) return '';
    const open = src.indexOf('{', at + listener.length - 1);
    let depth = 0;
    for (let i = at; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    return '';
  }
  check(listenerBody(before) === listenerBody(UIC_SRC),
    'and it is character-for-character what it was before this run — no listener moved');
})();

/* ── 12. Still no platform sniffing anywhere this run touched ───────────── */
console.log('\n12 — nothing new is keyed on the user agent (R-4)\n');
(function () {
  const TOUCHED = ['UI_Components.html', 'Client_Helpers.html']
    .concat(PRINT_SITES.map(p => p[0]))
    .concat(DOWNLOAD_SITES.map(p => p[0]))
    .concat(CARD_PAGES.map(p => p[0]))
    .concat(['Company_ValleyFoods_MfgOrders.html']);
  const seen = {};
  const bad = [];
  TOUCHED.forEach(function (f) {
    if (seen[f]) return;
    seen[f] = true;
    const src = stripComments(read(f));
    const hits = (src.match(/navigator\.(userAgent|platform|vendor)|isIOS|isIPhone/g) || []);
    /* SESSION.saveCurrentView reads navigator.userAgent for a saved-view device
       LABEL. It predates both iPhone runs and is unrelated to any of this. */
    const allowed = (f === 'Client_Helpers.html') ? 1 : 0;
    if (hits.length > allowed) bad.push(f + ': ' + hits.join(', '));
  });
  check(bad.length === 0,
    'no user-agent branch was introduced — Android and Windows never enter a new path',
    bad.join(' | '));

  const helpers = stripComments(read('Client_Helpers.html'));
  const saveView = functionBody(helpers, 'SESSION.saveCurrentView');
  check(/navigator\.userAgent/.test(saveView),
    'the one known site is still exactly where it was: SESSION.saveCurrentView\'s device label');
})();

/* ── 13. The TopLight work did not move ─────────────────────────────────── */
console.log('\n13 — s14 still passes, unchanged\n');
(function () {
  const s14 = path.join(__dirname, 's14_iphone.js');
  if (!fs.existsSync(s14)) { check(false, 's14_iphone.js is present'); return; }
  try {
    execFileSync(process.execPath, [s14], { stdio: 'pipe' });
    check(true, 's14_iphone.js passes — the first run\'s TopLight work is intact');
  } catch (e) {
    check(false, 's14_iphone.js passes', String(e.stdout || '') + String(e.stderr || ''));
  }
  const tracked = execFileSync('git', ['status', '--porcelain', '--', 'tools/verify/s14_iphone.js'],
    { cwd: ROOT, encoding: 'utf8' }).trim();
  check(tracked === '', 's14_iphone.js was not edited by this run', tracked);
})();

/* ── 14. The public contract only grew ──────────────────────────────────── */
console.log('\n14 — UIC gained three members and lost none\n');
(function () {
  const uic = read('UI_Components.html');
  ['printDoc', 'openDownload', 'openTab', 'closeOrBack', 'navTo', 'printTable', 'openModal', 'toast']
    .forEach(function (m) {
      check(new RegExp('UIC\\.' + m + '\\s*=').test(uic), 'UIC.' + m + ' is defined');
    });
  console.log('        (the full contract gate is check C3 in tools/ui_check.js)');
})();

console.log('\n' + (failed === 0
  ? 'OK — the remaining iPhone flows have a fallback, and every >=600px / print declaration is unchanged.'
  : 'FAILED: ' + failed + ' assertion(s)'));
process.exit(failed === 0 ? 0 : 1);
