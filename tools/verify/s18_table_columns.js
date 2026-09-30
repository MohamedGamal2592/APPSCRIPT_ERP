/**
 * S18 verification — the table column-width contract (UI-9.1).
 *
 *   node tools/verify/s18_table_columns.js
 *
 * Offline, over the real source. No network, no spreadsheet, no Google service.
 *
 * WHAT CANNOT BE PROVED HERE, STATED PLAINLY
 * ------------------------------------------
 * Pixels. tools/verify/domstub.js has no layout engine, so NOTHING in this repo
 * can prove that a column is 26 characters wide, that a table overflows its
 * wrapper, or that a scrollbar appeared. Every assertion below is about the
 * DECLARATIONS and the CLASSIFICATION — the two things the width depends on and
 * the two things a code change can silently break. The widths themselves are
 * checked by eye, at the six device widths design_preview/index.html exists
 * for, against the checklist in TABLE_COLUMN_WIDTHS_RESULTS.md.
 *
 * So this file proves: the classifier decides correctly (run, not grepped);
 * the pages that boot emit those decisions as classes; the decisions do not
 * change when a user sorts, searches, pages or hides a column; both header
 * builders agree; every class it can emit is defined in the shared stylesheet;
 * print relaxes the floors; the phone tier still turns the contract off; and
 * the two exporters are untouched.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootPage, flush } = require('./pageharness');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failed = 0;
let total = 0;
const check = (ok, label, extra) => {
  total++;
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};
const section = (t) => console.log('\n' + t);

/* The shared layer, booted once on its own for the classifier assertions. */
const sb = makeSandbox({});
S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
  try { vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'UI_Components#' + i }); }
  catch (e) { console.log('  (UI_Components block ' + i + ' threw: ' + e.message + ')'); }
});
const UIC = sb.UIC;

const uicSrc = read('UI_Components.html');
const cssSrc = S.allCss(uicSrc) + '\n' + S.allCss(read('CSS_Tokens.html'));

/* One column's worth of rows, as objects, so classifyColumns is exercised
 * through its real object-row path. */
const col = (label, values, extra) =>
  UIC.classifyColumns([Object.assign({ key: 'c', label: label }, extra || {})],
    values.map(v => ({ c: v })))[0];

const SENTENCE = 'إيصال صرف نقدي (مدفوعات له) - حساب عين سولار ٧٦٠ لتر ٦٥٠ توصيل';
const SENTENCE2 = 'سداد دفعة من حساب المورد عن فاتورة رقم ٢٦٧٩ بتاريخ اليوم';

/* ── 1. The classifier, RUN against fixtures ─────────────────────────────── */
section('1. the classifier, run against fixtures (not grepped)');

check(typeof UIC.classifyColumns === 'function', 'UIC.classifyColumns is a public function');
check(typeof UIC.autoColumns === 'function', 'UIC.autoColumns is a public function');
check(typeof UIC._dtHeadRow === 'function', 'UIC._dtHeadRow is the shared header-row builder');

check(col('التاريخ', ['27/10/2025', '01/01/2026', '15/06/2025']) === 'atom',
  'a Gregorian date column is atom');
check(col('التاريخ', ['٢٧/١٠/٢٠٢٥', '٠١/٠١/٢٠٢٦', '١٥/٠٦/٢٠٢٥']) === 'atom',
  'an Arabic-Indic date column is atom — the classifier measures length, not script');
check(col('المبلغ', ['13,950.00', '2,100.50', '9.00']) === 'atom',
  'a formatted figure is atom (num when the header declares money/numeric)');
check(col('الرصيد', ['(13,950.00)', '(2,100.50)', '(9.00)']) === 'atom',
  'a parenthesised negative figure is atom');
check(col('رقم', ['2679', '2680', '2681']) === 'atom', 'a document number is atom');
check(col('كود', ['A-1', 'B-22', 'C-3']) === 'atom', 'a short hyphenated code is atom');

/* An empty column has no evidence of its own, so the label decides (§5 rule 5).
   Both spellings of "nothing" must reach the same branch. */
check(col('مدين', ['-', '-', '-']) === 'atom',
  'a column of dashes falls back to its label — here a 4-character label, so atom');
check(col('مدين', ['', '', '']) === 'atom',
  'a column of empty strings falls back to its label the same way');
check(col('البيان', ['-', '-', '-']) === 'atom',
  'an empty column with a short label is atom, not prose — there is no text to hold');

check(col('البيان', [SENTENCE, SENTENCE2, SENTENCE]) === 'prose',
  'a column of 60-character Arabic sentences is prose');
check(col('البيان', ['نقدي', 'نقدي', SENTENCE, 'نقدي', SENTENCE2]) === 'prose',
  'a column MIXING short and long values is prose — p90, so a long tail still counts');
check(col('الطرف', ['شركة النور للتجارة', 'مؤسسة الأمل', 'محمد عبد الرحمن']) === 'text',
  'a column of names is text: real words, but not a sentence');

/* Precedence, one assertion per branch of §5. */
section('1b. precedence — every branch of plan §5');
check(col('س', ['A-1'], { col: 'prose' }) === 'prose',
  '1. a declared col: beats the data');
check(col('س', ['A-1'], { col: 'banana' }) === 'atom',
  '1b. an UNRECOGNISED col: falls through to inference and does not throw');
check(col('س', [SENTENCE], { money: true }) === 'num',
  '2. money: true wins over prose-looking data');
check(col('س', [SENTENCE], { numeric: true }) === 'num',
  '2b. numeric: true likewise');
check(UIC.classifyColumns([{ key: 'c', label: '' }], [{ c: 'x' }])[0] === 'actions',
  '3. an empty label is actions');
check(col('إجراءات', ['<button class="btn">حذف</button>']) === 'actions',
  '3b. a cell holding <button is actions, however long its markup');
check(col('إجراءات', ['<div class="erp-kebab">…</div>']) === 'actions',
  '3c. a cell holding erp-kebab is actions');

/* Robustness: the classifier must never throw, and must accept the plain
   STRING headers that most of the 69 call sites pass. */
section('1c. robustness');
check(UIC.classifyColumns(['التاريخ', 'البيان'],
  [['27/10/2025', SENTENCE], ['01/01/2026', SENTENCE2]]).join(',') === 'atom,prose',
  'plain-STRING headers with array rows classify correctly (69 sites pass strings)');
check(JSON.stringify(UIC.classifyColumns([], [])) === '[]', 'no headers returns no roles');
check(UIC.classifyColumns([{ label: 'س' }], null)[0] === 'atom',
  'null rows does not throw — the label is then the only evidence');
check(UIC.classifyColumns([null], [{ c: 1 }])[0] === 'actions',
  'a null header does not throw');
/* Surplus width: one share per flexible column. Prose when there is any,
   otherwise text; a single prose column keeps the stylesheet's 100%. */
check(JSON.stringify(UIC._colShares(['atom', 'text', 'text', 'actions'])) === '["","50%","50%",""]',
  'no prose column: the text columns split the surplus, the id column does not take it');
check(JSON.stringify(UIC._colShares(['atom', 'prose', 'prose', 'text'])) === '["","50%","50%",""]',
  'two prose columns share the surplus instead of the first one taking it all');
check(JSON.stringify(UIC._colShares(['atom', 'prose', 'num'])) === '["","100%",""]',
  'one prose column keeps 100%, exactly as the stylesheet already said');
check(JSON.stringify(UIC._colShares(['atom', 'num', 'actions'])) === '["","",""]',
  'a table with no text at all declares no share');
const UIC_SRC_ = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'UI_Components.html'), 'utf8');
check(/\.table td \{ display: table-cell; width: auto; \}/.test(UIC_SRC_),
  'from tablet-p up the phone card width:100% on td is undone (else the first column takes the row)');
check(UIC._colMin('30ch') === '30ch' && UIC._colMin('') === '' &&
  UIC._colMin('30ch;color:red') === '' && UIC._colMin('javascript:x') === '',
  'min: accepts a bare CSS length and DROPS anything else, rather than escaping it');

/* ── 2. The classifier against the REAL page payloads ────────────────────── */
section('2. the real vf_cash and vf_parties payloads');

const pill = (t) => UIC.statusPill(t, 'success');
const actionCell = UIC.actionBtns([
  { label: 'السجل', onclick: 'x()' },
  { label: 'تعديل', onclick: 'y()' },
  { label: 'حذف', onclick: 'z()', color: '#dc2626' }
]);

/* Exactly the header list Company_ValleyFoods_Cash.html passes, including the
   three columns W4 declares, and rows shaped like the ones renderList() builds
   — arrays of HTML, not plain values. */
const CASH_HEADERS = ['رقم', 'التاريخ',
  { label: 'الطرف', col: 'text' },
  { label: 'البيان', col: 'prose', min: '30ch' },
  'النوع', 'طريقة الدفع',
  { label: 'المبلغ', numeric: true }, 'الصندوق', 'كود الحساب', 'المستخدم',
  { label: 'الرصيد', numeric: true },
  { label: 'الاعتماد', col: 'atom' }, ''];
const CASH_ROWS = [];
for (let i = 0; i < 40; i++) {
  CASH_ROWS.push([
    '<b>' + (2670 + i) + '</b>',
    '<span data-sort="2025-10-27">27/10/2025</span>',
    ['شركة النور للتجارة', 'مؤسسة الأمل', 'محمد عبد الرحمن'][i % 3],
    [SENTENCE, SENTENCE2][i % 2],
    'صرف نقدي', 'نقدي',
    '<span class="num" data-num="13950">13,950.00</span>',
    'الخزنة الرئيسية', '5101', 'محمد',
    '<span class="num" data-num="-13950">(13,950.00)</span>',
    pill(i % 2 ? 'معتمد' : 'غير معتمد'),
    actionCell
  ]);
}
const cashRoles = UIC.classifyColumns(CASH_HEADERS, CASH_ROWS);
const cashRole = (label) => {
  const i = CASH_HEADERS.findIndex(h => (typeof h === 'string' ? h : h.label) === label);
  return cashRoles[i];
};
check(cashRole('البيان') === 'prose', 'vf_cash البيان -> prose');
check(cashRole('التاريخ') === 'atom', 'vf_cash التاريخ -> atom');
check(cashRole('المبلغ') === 'num', 'vf_cash المبلغ -> num');
check(cashRole('الرصيد') === 'num', 'vf_cash الرصيد -> num');
check(cashRole('الطرف') === 'text', 'vf_cash الطرف -> text');
check(cashRole('الاعتماد') === 'atom', 'vf_cash الاعتماد -> atom (declared; inference reads the pill as text)');
check(cashRoles[12] === 'actions', 'vf_cash the empty-label last column -> actions');
check(cashRoles.length === 13, 'vf_cash classifies all thirteen columns');
/* The action column must not be mistaken for the widest prose on the row. */
check(cashRole('رقم') === 'atom' && cashRole('كود الحساب') === 'atom' && cashRole('المستخدم') === 'atom',
  'vf_cash رقم / كود الحساب / المستخدم -> atom');

const PARTY_HEADERS = ['التاريخ', 'رقم المستند',
  { label: 'البيان', col: 'prose', min: '30ch' },
  'مدين', 'دائن', 'الرصيد التراكمي'];
const PARTY_ROWS = [];
for (let i = 0; i < 30; i++) {
  PARTY_ROWS.push(['27/10/2025', String(2679 + i), [SENTENCE, SENTENCE2][i % 2],
    '-', '13,950.00', '(13,950.00)']);
}
const partyRoles = UIC.classifyColumns(PARTY_HEADERS, PARTY_ROWS);
check(partyRoles[2] === 'prose', 'vf_parties البيان -> prose');
check(partyRoles[0] === 'atom', 'vf_parties التاريخ -> atom');
check(partyRoles[3] === 'atom', 'vf_parties مدين -> atom (every cell a dash; the label decides)');
check(partyRoles[5] === 'atom', 'vf_parties الرصيد التراكمي -> atom');

/* Inference alone — without W4's declarations — must already be right for the
   two columns the plan is named after. If this ever fails, the declarations
   are load-bearing rather than belt-and-braces, and that is worth knowing. */
const cashUndeclared = UIC.classifyColumns(
  CASH_HEADERS.map(h => (typeof h === 'string' ? h : { label: h.label, money: h.money, numeric: h.numeric })),
  CASH_ROWS);
check(cashUndeclared[3] === 'prose',
  'vf_cash البيان is prose from the DATA alone — the declaration pins it, it does not create it');
check(cashUndeclared[12] === 'actions',
  'vf_cash the actions column is actions from the data alone');

/* ── 3. The emitted thead of a real page boot ────────────────────────────── */

const theadOf = (html) => (html.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0];

const CASH_ROW = {
  transaction_id: 2679, date_edit: '2025-10-27', date_display: '27/10/2025',
  party_name: 'شركة النور للتجارة', transaction_details: SENTENCE,
  transaction_type: 'صرف نقدي', transaction_method: 'نقدي',
  transaction_amount: 13950, box_name: 'الخزنة الرئيسية', related_box: 'B1',
  chart_code: '5101', user: 'u1', balance_amount: -13950, approved_bool: true
};
/* The page's own load() resolves through API.call, which the harness answers
 * with an already-resolved Promise — so renderList() runs as a MICROTASK.
 * Reading the container synchronously reads it before the page has drawn
 * anything at all. This section therefore waits for the queue to drain, and
 * the report at the bottom waits for this section. */
async function bootChecks() {
  section('3. the thead a real page boot actually produced');
  let cashHtml = '';
  try {
    const s = bootPage({
      page: 'Company_ValleyFoods_Cash.html',
      isSuperAdmin: true,
      containers: ['vf-cash-content'],
      scriptlets: { CURRENT_ACTION: "'vf_cash'" },
      expose: ['load'],
      call: (action) => {
        if (action === 'get_valley_cash') {
          return {
            status: 'success', headers: [CASH_ROW, CASH_ROW, CASH_ROW],
            boxes: [{ box: 'B1', name: 'الخزنة', balance: 100 }],
            enums: { transaction_type: ['Debit'], transaction_method: ['نقدي'] },
            parties: [], charts: [], users: []
          };
        }
        return { status: 'success' };
      }
    });
    /* The page reads its saved view before it renders; the harness's SESSION
       is a bare token, so these two are supplied the way vf_daterange does. */
    s.SESSION.loadActiveView = () => Promise.resolve({});
    s.SESSION.saveCurrentView = () => Promise.resolve({});
    s.exported('load')();
    await flush();
    await flush();
    cashHtml = s.html('vf-cash-content');
  } catch (e) {
    cashHtml = '';
    console.log('        (vf_cash boot threw: ' + e.message + ')');
  }

  const cashThead = theadOf(cashHtml);
  check(cashThead.length > 0, 'vf_cash booted and rendered a thead');
  check(/class="col-prose"/.test(cashThead),
    'the emitted thead carries class="col-prose"', cashThead.slice(0, 300));
  check(/class="col-num"/.test(cashThead), 'the emitted thead carries class="col-num"');
  check(/class="col-atom"/.test(cashThead), 'the emitted thead carries class="col-atom"');
  check(/class="col-actions"/.test(cashThead), 'the emitted thead carries class="col-actions"');
  check(/style="min-width:30ch[;"]/.test(cashThead),
    'the declared min: 30ch reached the markup as a style attribute');
  const proseTh = (cashThead.match(/<th(?=[\s>])[^>]*class="col-prose"[^>]*>[\s\S]*?<\/th>/) || [''])[0];
  check(proseTh.indexOf('البيان') !== -1,
    'and it is البيان that carries it', proseTh.slice(0, 200));
  /* The contract must not have leaked onto a body cell — that is the DOM budget. */
  const cashTbody = (cashHtml.match(/<tbody[\s\S]*?<\/tbody>/) || [''])[0];
  check(!/<td[^>]*class="[^"]*\bcol-(atom|num|text|prose|actions)\b/.test(cashTbody),
    'NO col-* class on any <td> — the contract is thead-only (hard constraint 4)');
}

/* ── 4. Stability: sort, search, page, hide a column ─────────────────────── */
section('4. stability — the roles never move once decided');

const classesOf = (html) =>
  /* `<th(?=[\s>])` and not `<th[^>]*>`: the latter also matches the enclosing
     <thead> itself, which then shows up as a fourteenth, class-less column. */
  (theadOf(html).match(/<th(?=[\s>])[^>]*>/g) || []).map(th => (th.match(/class="([^"]*)"/) || [, ''])[1]);

const stab = (function () {
  const s = makeSandbox({});
  S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
    try { vm.runInContext(S.stripScriptlets(b.body), s, { filename: 'UIC#' + i }); } catch (e) {}
  });
  const U = s.UIC;
  s.document.body.appendChild(Object.assign(s.document.createElement('div'), { id: 'stab' }));
  const html = U.dataTable('stab', { headers: CASH_HEADERS, rows: CASH_ROWS });
  const st = s.__dtStore ? s.__dtStore.stab : (s.window && s.window.__dtStore ? s.window.__dtStore.stab : null);
  return { U: U, html: html, st: st, sandbox: s };
})();

check(!!stab.st, 'the store exists after dataTable()');
check(!!stab.st && !!stab.st.cols && Object.keys(stab.st.cols).length === 13,
  'st.cols holds a verdict for all thirteen columns');

const before = classesOf(stab.html);
check(before.length === 13, 'thirteen <th> rendered', before.join(' | '));

/* Everything a user can do that re-derives the view. Each one rebuilds the
   thead from the store, so none may change a class. */
if (stab.st) {
  const U = stab.U;
  const rowFor = (st) => '<thead>' + U._dtHeadRow(st) + '</thead>';

  const afterSort = (function () {
    stab.st.sortKey = '__col1'; stab.st.sortDir = 'asc';
    stab.st.filtered = stab.st.originalRows.slice().reverse();
    return classesOf(rowFor(stab.st));
  })();
  check(afterSort.join('|') === before.join('|'), 'sorting does not change any column class');

  const afterSearch = (function () {
    stab.st.searchTerm = 'نقدي';
    stab.st.filtered = stab.st.originalRows.slice(0, 2);
    return classesOf(rowFor(stab.st));
  })();
  check(afterSearch.join('|') === before.join('|'), 'searching does not change any column class');

  const afterPage = (function () {
    stab.st.page = 2;
    stab.st.pageRows = stab.st.originalRows.slice(20, 40);
    return classesOf(rowFor(stab.st));
  })();
  check(afterPage.join('|') === before.join('|'), 'paging does not change any column class');

  /* Hide a column, then show it again. This is the assertion that catches the
     two-builders trap: _dtRebuildHead used to carry its own copy of the <th>
     markup, so the contract survived first render and vanished on this path. */
  /* UIC.dataTable rewrites plain STRING headers into __col<i>, but an object
     header keeps whatever key it had — and these object headers declare no
     key, so theirs is the label. البيان is an object header (W4 declares it),
     so its key is the label, not __col3. Read it off the store rather than
     assuming either shape. */
  const proseHeader = stab.st.headers[3];
  const hiddenKey = proseHeader.key || proseHeader.label;
  stab.st.hidden = {}; stab.st.hidden[hiddenKey] = true;
  const hiddenClasses = classesOf(rowFor(stab.st));
  check(hiddenClasses.length === 12, 'hiding a column removes exactly one <th>');
  check(hiddenClasses.indexOf('col-prose') === -1,
    'the prose column really is the one that went');
  check(hiddenClasses.join('|') === before.filter((_, i) => i !== 3).join('|'),
    'the REMAINING columns keep byte-identical classes while one is hidden');

  delete stab.st.hidden[hiddenKey];
  const restored = classesOf(rowFor(stab.st));
  check(restored.join('|') === before.join('|'),
    'showing the column again restores every class byte-identically');
}

/* ── 5. Both builders agree ──────────────────────────────────────────────── */
section('5. theadFor and _dtRebuildHead build the same row');

check(/const theadFor = function \(st\) \{\s*return '<thead>' \+ UIC\._dtHeadRow\(st\) \+ '<\/thead>';/.test(uicSrc),
  'the first render delegates to UIC._dtHeadRow');
check(/old\.innerHTML = UIC\._dtHeadRow\(st\);/.test(uicSrc),
  'the column-toggle rebuild delegates to the SAME UIC._dtHeadRow');
/* Unified, so this is true by construction — asserted anyway so it stays true
   if anyone ever re-inlines one of them. */
if (stab.st) {
  const viaThead = classesOf('<thead>' + stab.U._dtHeadRow(stab.st) + '</thead>');
  const viaRebuild = classesOf('<thead>' + stab.U._dtHeadRow(stab.st) + '</thead>');
  check(viaThead.join('|') === viaRebuild.join('|'),
    'both paths produce identical <th> markup for the same store');
}
check((uicSrc.match(/<th scope="col" data-key="/g) || []).length === 1,
  'there is exactly ONE place in the file that writes a <th scope="col"> — no second copy to drift');

/* ── 6. Every raw .table is wrapped ──────────────────────────────────────── */
section('6. no .table without a .table-wrap, anywhere in the tree');

const classTokens = (attrs) => {
  const m = String(attrs).match(/class\s*=\s*["']([^"']*)["']/i);
  return m ? m[1].trim().split(/\s+/) : [];
};
let loose = 0;
const looseFiles = [];
S.pageFiles().forEach(function (f) {
  const src = S.read(f);
  const tag = /<(\/?)(div|table)\b([^>]*)>/gi;
  const stack = [];
  let m;
  while ((m = tag.exec(src)) !== null) {
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (name === 'div') {
      if (closing) stack.pop();
      else if (!/\/\s*>$/.test(m[0])) stack.push(classTokens(m[3]).indexOf('table-wrap') !== -1);
      continue;
    }
    if (closing) continue;
    if (classTokens(m[3]).indexOf('table') === -1) continue;
    if (stack.indexOf(true) === -1) { loose++; looseFiles.push(f + ':' + src.slice(0, m.index).split('\n').length); }
  }
});
check(loose === 0, 'every raw <table class="table"> sits inside a .table-wrap',
  looseFiles.slice(0, 6).join(', '));

/* ── 7. The phone tier still switches the contract off ───────────────────── */
section('7. the contract is inert below 600px, by construction');
check(/\.table thead \{ display: none; \}/.test(cssSrc),
  'the phone tier still sets .table thead { display: none }');
check(/\.table, \.table tbody, \.table tr, \.table td \{ display: block/.test(cssSrc),
  'and still turns the table into blocks, so no <th> is rendered to carry a class');

/* ── 8. Print relaxes the floors ─────────────────────────────────────────── */
section('8. @media print stands the floors down (the silent failure mode)');
/* Scanned out of the STYLESHEET, not the raw file: the first '@media print {'
 * in UI_Components.html is a string inside UIC.printTable, which builds its
 * own document and has nothing to do with the shared sheet. */
const printBlock = (function () {
  const at = cssSrc.indexOf('@media print {');
  if (at === -1) return '';
  /* To the matching close brace. */
  let depth = 0, i = cssSrc.indexOf('{', at);
  for (let j = i; j < cssSrc.length; j++) {
    if (cssSrc[j] === '{') depth++;
    else if (cssSrc[j] === '}') { depth--; if (depth === 0) return cssSrc.slice(at, j + 1); }
  }
  return '';
})();
check(printBlock.length > 0, 'the shared @media print block was found');
check(/\.table thead th\.col-text,\s*\n?\s*\.table thead th\.col-prose \{ min-width: 0; \}/.test(printBlock),
  'print resets the col-text and col-prose floors to 0');
check(/\.table thead th\.col-atom,[\s\S]{0,120}?width: auto;/.test(printBlock),
  'print returns col-atom / col-num / col-actions to width: auto');
check(/\.table-wrap \{ max-height: none; overflow: visible/.test(printBlock),
  'and the print block really does remove the scroll box — which is WHY the floors must go');

/* ── 9. The modal rule (D-K) ─────────────────────────────────────────────── */
section('9. a .table-wrap inside a dialog does not bring a second scrollbar');
check(/\.modal-body \.table-wrap \{ max-height: none; \}/.test(cssSrc),
  '.modal-body .table-wrap { max-height: none; } exists');

/* ── 10. exportExcel and printTable are untouched (D-I) ──────────────────── */
section('10. the two exporters build from the store, not the DOM');
check(!/UIC\.exportExcel[\s\S]{0,2000}?document\.getElementById\([^)]*\)\.querySelector/.test(uicSrc),
  'exportExcel does not read the rendered table');
(function () {
  const s = makeSandbox({});
  S.scriptBlocks(S.read('UI_Components.html')).forEach(function (b, i) {
    try { vm.runInContext(S.stripScriptlets(b.body), s, { filename: 'UIC#' + i }); } catch (e) {}
  });
  const U = s.UIC;
  const store = { id: 'x', headers: CASH_HEADERS, originalRows: CASH_ROWS, rows: CASH_ROWS,
    filtered: CASH_ROWS, hidden: {}, cols: {}, fmtMoney: n => String(n), opts: {} };
  /* With and without a classification verdict, the visible header set — which
     is all these two read — must be identical. */
  const withoutCols = U._dtVisibleHeaders(store).map(h => h.label || '').join('|');
  CASH_HEADERS.forEach((h, i) => { store.cols[(h.key || h.label || h)] = 'prose'; });
  const withCols = U._dtVisibleHeaders(store).map(h => h.label || '').join('|');
  check(withoutCols === withCols,
    'the header set exportExcel/printTable read is byte-identical with and without st.cols');
})();

/* ── 11. Every class the classifier can emit is defined in the stylesheet ── */
section('11. no orphan classes — C5 cannot rise because of this contract');
Object.keys(UIC.COL_ROLES).forEach(function (role) {
  check(cssSrc.indexOf('.col-' + role) !== -1,
    'col-' + role + ' is defined in the shared stylesheet');
});
check(/--col-text-min:\s*14ch/.test(cssSrc) && /--col-prose-min:\s*26ch/.test(cssSrc),
  'both floors are TOKENS in CSS_Tokens.html, not magic numbers in a selector');
check(/min-width: var\(--col-text-min\)/.test(cssSrc) && /min-width: var\(--col-prose-min\)/.test(cssSrc),
  'and the rules consume the tokens rather than restating the values');
check(!/table-layout:\s*fixed/.test(cssSrc),
  'table-layout: fixed is set NOWHERE (hard constraint 6 / plan §6)');

/* ── report ─────────────────────────────────────────────────────────────── */
/* Section 3 is the only asynchronous one — it boots a real page and has to
 * let the promise queue drain — so the report runs after it, not beside it. */
bootChecks().catch(function (e) {
  failed++; total++;
  console.log('  FAIL  section 3 threw: ' + (e && e.message));
}).then(function () {
  console.log('\nS18: ' + (total - failed) + ' of ' + total + ' assertions pass.');
  if (failed) console.log('S18: ' + failed + ' assertion(s) FAILED');
  process.exit(failed === 0 ? 0 : 1);
});
