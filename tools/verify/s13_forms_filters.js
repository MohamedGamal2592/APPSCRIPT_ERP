/**
 * S13 verification — forms readability (F1, A1, F2, F4a) and the two filter
 * features (P1 vf_products, P2 vf_parties).
 *
 * Offline, over the real source. No network, no spreadsheet, no Google service.
 *
 *   node tools/verify/s13_forms_filters.js
 *
 * There is no layout engine in this repo, so nothing here measures a width.
 * What it CAN prove is that the declarations the layout depends on are present
 * and mutually consistent — in particular the invariant in §1b, which is the
 * one R-12 violated: a modal that opens content wider than the modal itself.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failed = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) failed++;
}
function section(t) { console.log('\n' + t); }

/* ── 1. F1 — every line-item editor has BOTH a scroll wrapper and a floor ── */
section('1. F1 — line-item tables have an overflow-x wrapper AND a min-width');

/* Each entry: file, a marker unique to the table, and the floor it must declare.
 * The marker is matched inside the same emitted string as the <table>, so a
 * wrapper belonging to a different table cannot satisfy the assertion. */
const F1_TABLES = [
  ['Company_ValleyFoods_Sales.html', 'id="lines-table"', 900],
  ['Company_ValleyFoods_SalesReturns.html', 'كمية المرتجع', 820],
  ['Company_ValleyFoods_MfgOrders.html', 'مركز العمل</th><th>الحالة', 900],
  ['Company_ValleyFoods_MfgRecipes.html', 'min-width:760px', 760],
];

F1_TABLES.forEach(function (t) {
  const [file, marker, floor] = t;
  const src = read(file);
  const at = src.indexOf(marker);
  ok(at !== -1, file + ' — the table marker ' + JSON.stringify(marker.slice(0, 24)) + ' is still present');
  if (at === -1) return;
  /* Look back to the start of the emitted line and forward to its end. */
  const lineStart = src.lastIndexOf('\n', at) + 1;
  const lineEnd = src.indexOf('\n', at);
  const line = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
  /* The wrapper may be emitted on the same line (all five are). */
  ok(/overflow-x\s*:\s*auto/.test(line),
    file + ' — the table is inside an overflow-x:auto wrapper');
  const mw = line.match(/min-width\s*:\s*(\d+)px/);
  ok(!!mw && Number(mw[1]) >= floor,
    file + ' — the table declares min-width >= ' + floor + 'px (found ' + (mw ? mw[1] : 'none') + ')');
});

/* The MfgOrders outputs table is a fifth, smaller editor on the same page. */
(function () {
  const src = read('Company_ValleyFoods_MfgOrders.html');
  const at = src.indexOf('min-width:560px');
  ok(at !== -1, 'Company_ValleyFoods_MfgOrders.html — the outputs table declares min-width:560px');
  if (at === -1) return;
  const lineStart = src.lastIndexOf('\n', at) + 1;
  const line = src.slice(lineStart, src.indexOf('\n', at));
  ok(/overflow-x\s*:\s*auto/.test(line),
    'Company_ValleyFoods_MfgOrders.html — the outputs table is inside an overflow-x:auto wrapper');
})();

/* ── 1b. A1 — the R-12 invariant, stated generically ─────────────────────── */
section('1b. A1 — no modal opens content wider than the modal it opens in');

const uic = read('UI_Components.html');

/* The size ladder is read from the source, not hardcoded, so this check
 * follows UIC.MODAL_SIZES if the ladder is ever re-tuned. */
const MODAL_PX = (function () {
  const px = { md: null, sm: null, lg: null, xl: null };
  ['sm', 'lg', 'xl'].forEach(function (k) {
    const m = uic.match(new RegExp('\\.modal\\.modal-' + k + '\\s*\\{\\s*max-width:\\s*(\\d+)px'));
    if (m) px[k] = Number(m[1]);
  });
  const base = uic.match(/\.modal\s*\{\s*border-radius:[^}]*?max-width:\s*(\d+)px/);
  px.md = base ? Number(base[1]) : null;
  return px;
})();

ok(MODAL_PX.md === 560, 'the default modal is 560px, read from source (found ' + MODAL_PX.md + ')');
ok(MODAL_PX.lg === 880, 'modal-lg is 880px (found ' + MODAL_PX.lg + ')');
ok(MODAL_PX.xl === 1100, 'modal-xl is 1100px (found ' + MODAL_PX.xl + ')');
ok(/UIC\.MODAL_SIZES\s*=\s*\{[^}]*xl:\s*' modal-xl'/.test(uic),
  "UIC.MODAL_SIZES still maps 'xl' -> ' modal-xl'");

/* .modal-body adds 24px of padding on each side. */
const BODY_PADDING = 48;

/* For every UIC.openModal call in the admin file, pair the size it passes with
 * the widest min-width declared in the body it builds. This is the check that
 * would have failed on R-12: a 700px table opened in the 560px default. */
(function () {
  const src = read('0_ERP_Management.html');
  const calls = [];
  const re = /UIC\.openModal\(\s*'([^']+)'\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    /* The options object ends at the matching brace. */
    let depth = 1, i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    calls.push({ id: m[1], opts: src.slice(re.lastIndex, i), at: m.index });
  }
  ok(calls.length >= 5, 'found the admin modals to check (' + calls.length + ')');

  calls.forEach(function (c) {
    const sizeM = c.opts.match(/size:\s*'(sm|md|lg|xl)'/);
    const size = sizeM ? sizeM[1] : 'md';
    const avail = MODAL_PX[size] - BODY_PADDING;

    /* The body is built above the call; scan back to the start of the enclosing
     * function for min-width declarations that will land inside this modal. */
    const fnStart = src.lastIndexOf('\n  function ', c.at);
    const region = src.slice(fnStart === -1 ? 0 : fnStart, c.at);
    let widest = 0;
    const mw = /min-width:\s*(\d+)px/g;
    let w;
    while ((w = mw.exec(region)) !== null) widest = Math.max(widest, Number(w[1]));

    if (widest === 0) {
      ok(true, c.id + ' — declares no min-width content; ' + size + ' (' + avail + 'px usable) is unconstrained');
      return;
    }
    ok(widest <= avail,
      c.id + ' — content min-width ' + widest + 'px fits size:' + size +
      ' (' + avail + 'px usable)');
  });

  /* The specific fix, pinned so it cannot silently regress. */
  const pm = calls.filter(function (c) { return c.id === 'pages-matrix-modal'; })[0];
  ok(!!pm && /size:\s*'xl'/.test(pm.opts),
    "pages-matrix-modal is opened with size:'xl' (R-12)");
})();

/* ── 1c. A1.2 — the role authority matrix declares a floor ───────────────── */
section('1c. A1.2 — صلاحيات الأدوار declares a min-width');
(function () {
  const src = read('0_ERP_Management.html');
  const at = src.indexOf('class="table-wrap"');
  ok(at !== -1, 'the صلاحيات الأدوار grid still uses .table-wrap');
  if (at === -1) return;
  const line = src.slice(src.lastIndexOf('\n', at) + 1, src.indexOf('\n', at));
  const mw = line.match(/min-width:\s*(\d+)px/);
  ok(!!mw && Number(mw[1]) >= 820,
    'its table declares min-width >= 820px (found ' + (mw ? mw[1] : 'none') + ')');
  /* .table-wrap must still be the thing that scrolls it. */
  ok(/\.table-wrap\s*\{[^}]*overflow-x:\s*auto/.test(uic),
    '.table-wrap still supplies overflow-x:auto, so the floor has something to scroll in');
})();

/* ── 2. F4a — .form-grid is defined, and its floor is >= 240px ───────────── */
section('2. F4a — .form-grid is defined with a >= 240px floor');

ok(/\.form-grid\s*\{[^}]*display:\s*grid/.test(uic), '.form-grid is defined');
ok(/\.form-grid-wide\s*\{[^}]*display:\s*grid/.test(uic), '.form-grid-wide is defined');
ok(/\.form-grid-narrow\s*\{[^}]*display:\s*grid/.test(uic), '.form-grid-narrow is defined');

(function () {
  const m = uic.match(/\.form-grid\s*\{\s*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\((\d+)px/);
  ok(!!m && Number(m[1]) >= 240,
    '.form-grid columns floor at >= 240px (found ' + (m ? m[1] : 'none') + ')');
  const w = uic.match(/\.form-grid-wide\s*\{\s*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\((\d+)px/);
  ok(!!w && Number(w[1]) >= 320, '.form-grid-wide floors at >= 320px (found ' + (w ? w[1] : 'none') + ')');
})();

/* Single column below tablet-p: the responsive half must sit in the ONE
 * canonical tablet-p tier. A second `@media (min-width: 600px)` block breaks
 * ui2_breakpoints.js and ui4_listview.js, which slice the stylesheet on the
 * FIRST occurrence of that string. This assertion exists so the next person to
 * add a responsive rule finds out here rather than there. */
(function () {
  const n = (uic.match(/@media \(min-width: 600px\) \{/g) || []).length;
  ok(n === 1,
    'exactly one canonical `@media (min-width: 600px) {` tier block in the stylesheet (found ' + n + ')');
  ok(/@media \(min-width: 600px\) \{[\s\S]*?\.form-grid \{ grid-template-columns/.test(uic),
    'the .form-grid columns are declared inside that tier, not in a second block');
})();

/* ── 3. F2 — the combo carries titles ────────────────────────────────────── */
section('3. F2 — combo display input and every option carry a title');

ok(/class="combo-option"[\s\S]{0,260}?title="'\s*\+\s*esc\(op\.label\)/.test(uic),
  'every .combo-option is rendered with title=esc(op.label)');
ok(/id="'\s*\+\s*key\s*\+\s*'_display"[\s\S]{0,200}?title="'\s*\+\s*esc\(curLabel\)/.test(uic),
  'the combo display input is rendered with title=esc(curLabel)');
ok(/UIC\.comboPick[\s\S]*?disp\.title\s*=\s*op\.label/.test(uic),
  'UIC.comboPick keeps the title in sync when it writes a new value');
ok(/UIC\.comboBlur[\s\S]*?disp\.title\s*=\s*disp\.value/.test(uic),
  'UIC.comboBlur keeps the title in sync when it clears or rewrites the value');
/* The title must not have displaced the value or the id contract. */
ok(/id="'\s*\+\s*key\s*\+\s*'_display"/.test(uic), 'the _display id contract is unchanged');
ok(/<input type="hidden" id="'\s*\+\s*key\s*\+\s*'"/.test(uic), 'the hidden value input is unchanged');

/* ── 4/5/6. P2 — the balance aggregate ───────────────────────────────────── */
section('4-6. P2 — getValleyPartyBalances_: joins, signs, registration, sources');

const actions = read('Company_ValleyFoods_Actions.js');
const balFnM = actions.match(/function getValleyPartyBalances_\(data, user, dbId\) \{[\s\S]*?\n  \}/);
ok(!!balFnM, 'getValleyPartyBalances_ exists');
const balFn = balFnM ? balFnM[0] : '';

/* 4. The four join fields appear verbatim. Getting one wrong produces a
 * plausible number that silently disagrees with the كشف حساب. */
const JOINS = [
  ["s['اسم العميل']", 'valley_sales_invoices joins on اسم العميل'],
  ['p.vendor', 'valley_product_purchasing joins on vendor'],
  ['cb.name', 'valley_cash_bank_movement joins on name'],
  ['r.valley_sales_invoices_client', 'valley_sales_returns joins on valley_sales_invoices_client'],
];
JOINS.forEach(function (j) { ok(balFn.indexOf(j[0]) !== -1, j[1]); });

ok(balFn.indexOf("s['إجمالي']") !== -1, 'the sales value is إجمالي');
ok(/p\.qty[\s\S]{0,40}p\.unit_price/.test(balFn), 'the purchases value is qty x unit_price');
ok(/Math\.abs\(Number\(cb\.total\)/.test(balFn), 'the cash value is abs(total)');
ok(/Math\.abs\(Number\(r\.valley_return_value\)/.test(balFn), 'the returns value is abs(valley_return_value)');

/* The sign map must match the statement's, which the client applies in
 * Company_ValleyFoods_Parties.html: +1 collections/purchases/returns, else -1. */
const parties = read('Company_ValleyFoods_Parties.html');
ok(/t\.type === 'collections' \|\| t\.type === 'purchases' \|\| t\.type === 'returns'\) \? 1 : -1/.test(parties),
  "the statement's sign map is unchanged: +1 for collections/purchases/returns, else -1");
ok(/add_\(s\['اسم العميل'\],\s*-1 \*/.test(balFn), 'sales are signed -1');
ok(/add_\(p\.vendor,\s*\+1 \*/.test(balFn), 'purchases are signed +1');
ok(/isDebit \? 1 : -1/.test(balFn), 'cash is +1 when transaction_type is debit, else -1');
ok(/toLowerCase\(\) === 'debit'/.test(balFn), 'the debit test is case-insensitive and trimmed, as the statement does it');
ok(/add_\(r\.valley_sales_invoices_client,\s*\+1 \*/.test(balFn), 'returns are signed +1');

/* The LEDGER figure, not the stock-adjusted one. */
ok(balFn.indexOf('valley_current_products') === -1,
  'the aggregate does NOT read valley_current_products — this is the ledger balance, not the stock-adjusted figure');

/* 5. Registered in all three places. */
ok(/'get_valley_party_balances':\s*\{\s*page:\s*'vf_parties',\s*access:\s*'read'\s*\}/.test(actions),
  'registered in PAGE_ACCESS as vf_parties / read');
ok(/'get_valley_party_balances':\s*'valley_legal_customer_vendor'/.test(actions),
  'registered in ACTION_TABLES as valley_legal_customer_vendor');
ok(/ValleyFoods\.register\('get_valley_party_balances',\s*getValleyPartyBalances_\)/.test(actions),
  'registered in the ValleyFoods.register tail block');

/* 6. It reads the sheets, never the payload. */
['valley_sales_invoices', 'valley_product_purchasing', 'valley_cash_bank_movement', 'valley_sales_returns']
  .forEach(function (sheet) {
    ok(new RegExp("safeRows_\\(dbId, '" + sheet + "'\\)").test(balFn),
      'reads ' + sheet + ' through safeRows_(dbId, ...)');
  });
ok(!/\bdata\.(rows|balances|parties)\b/.test(balFn),
  'the aggregate never trusts the client payload for its figures');
/* One read per sheet, not one per party. */
ok((balFn.match(/safeRows_\(/g) || []).length === 4,
  'exactly four sheet reads — once each, not once per party');

/* getValleyParties_ response shape must be untouched. */
(function () {
  const m = actions.match(/function getValleyParties_\(data, user, dbId\) \{[\s\S]*?\n  \}/);
  ok(!!m, 'getValleyParties_ is still present');
  ok(!!m && m[0].indexOf('balances') === -1,
    "getValleyParties_'s response shape is unchanged — no balances folded into it (D-H)");
  ok(!!m && (m[0].match(/getAllRecords_\(|safeRows_\(/g) || []).length === 1,
    'getValleyParties_ still reads exactly ONE sheet — first paint is as fast as before');
})();

/* ── 7. P1 — the products filter semantics ───────────────────────────────── */
section('7. P1 — vf_products filter semantics, by executing the real predicate');

const products = read('Company_ValleyFoods_Products.html');
const predM = products.match(/function passesFilters\(r, f\) \{[\s\S]*?\n    \}/);
ok(!!predM, 'passesFilters is present in the products page');

if (predM) {
  /* Executed, not merely pattern-matched. It takes `f` as a parameter for
     exactly this reason, so it runs without booting the page. */
  const passes = new Function('return ' + predM[0].replace(/^function passesFilters/, 'function') + ';')();
  const rows = [
    { id: 1, category: 'CAT_A', current_stock_qty: 0 },
    { id: 2, category: 'CAT_A', current_stock_qty: 5 },
    { id: 3, category: 'CAT_B', current_stock_qty: 10 },
    { id: 4, category: 'CAT_B', current_stock_qty: null },
    { id: 5, category: '', current_stock_qty: '' },
    { id: 6, category: 'CAT_A' },
  ];
  const sel = (c, lo, hi) =>
    rows.filter(r => passes(r, { category: c, qtyMin: lo, qtyMax: hi })).map(r => r.id).join(',');

  ok(sel('', null, null) === '1,2,3,4,5,6', 'no filter passes every row');
  ok(sel('CAT_A', null, null) === '1,2,6', 'category is an EXACT match on the raw id, not the mapped label');
  ok(sel('CAT_Z', null, null) === '', 'a category that matches nothing yields no rows');
  ok(sel('', 5, 10) === '2,3', 'qty bounds are INCLUSIVE at both ends');
  ok(sel('', 5, null) === '2,3', 'a blank max bound is unbounded');
  ok(sel('', null, 5) === '1,2,4,5,6', 'a blank min bound is unbounded');
  ok(sel('', 0, 0) === '1,4,5,6', 'null, blank and absent current_stock_qty are all treated as 0');
  ok(sel('CAT_A', 0, 0) === '1,6', 'category and qty bounds compose');

  /* The label map must not be what is compared. */
  ok(!/passesFilters[\s\S]{0,400}catMap/.test(products),
    'the predicate does not consult catMap — it compares the raw id');
}

/* ── 8. P1 is client-side by design — no server call for filtering ───────── */
section('8. P1 — no server call was added for filtering');

(function () {
  /* The action name is not always at the call site any more: UIC.Live.save
     takes it as an option, so a converted page has `action: 'save_valley_product'`
     and no literal companyCall for it. Both shapes are collected, because what
     this assertion is actually about is that FILTERING added no server call —
     not about which syntax the save happens to use.
     get_page_versions is the cross-device change poll, which returns timestamps
     and never filters anything, so it is allowed by name rather than silently
     widening the set. */
  const calls = []
    .concat(products.match(/companyCall\('([a-z_]+)'/g) || [])
    .concat(products.match(/action:\s*'([a-z_]+)'/g) || [])
    .map(s => s.replace(/companyCall\('/, '').replace(/action:\s*'/, '').replace(/'/, ''));
  const uniq = Array.from(new Set(calls)).filter(a => a !== 'get_page_versions').sort();
  ok(uniq.join(',') === 'get_valley_products,save_valley_product',
    'the products page still makes exactly its two pre-existing calls (' + uniq.join(', ') + ')');
  ok(/CATEGORY_OPTIONS = \(res && res\.category_options\)/.test(products),
    'the category options still come from the existing get_valley_products response');
  ok(/renderFilters/.test(products) && /applyFilters/.test(products),
    'the filter bar and its apply path exist on the client');
})();

/* The shared column filter was deliberately NOT touched (decision D-G). */
ok(/UIC\._applyFilters/.test(uic), 'UIC._applyFilters still exists');
ok(!/UIC\._applyFilters/.test(products),
  'the products page does not reach into UIC._applyFilters — filtering is page-level (D-G)');

/* ── 9. P2 client — the column degrades safely ───────────────────────────── */
section('9. P2 client — the column is lazy, sortable, and fails safe');

ok(/\{ label: 'الرصيد الحالي', numeric: true \}/.test(parties),
  'the الرصيد الحالي header is declared numeric, so the column sorts numerically');
ok(/data-bal="'\s*\+\s*esc\(r\.id\)\s*\+\s*'"\s*data-num="0"/.test(parties),
  'each cell starts as a placeholder carrying data-bal and data-num="0"');
ok(/companyCall\('get_valley_party_balances'\)/.test(parties),
  'the balances are fetched by the new action');
ok(/renderTable\(\)[\s\S]{0,200}?loadBalances\(\)|loadBalances\(\);/.test(parties),
  'the fetch happens after the table paints, not before');
ok(/BALANCES = null;[\s\S]{0,120}?UIC\.toast/.test(parties),
  'a failed balance call toasts once and leaves the list usable');
ok(/cells\[i\]\.textContent = '—'/.test(parties),
  'on failure the cells show an em dash rather than a stale or fake number');
ok(/setAttribute\('data-num', String\(v\)\)/.test(parties),
  'the raw number is written to data-num so the numeric sort is on the value, not the formatted text');
ok(/textContent = finFmt\(v\)/.test(parties),
  "the column reuses the page's own finFmt, matching the statement's formatting");
ok(/onRendered: function \(\) \{ paintBalances\(\); \}/.test(parties),
  'onRendered repaints after a sort, search or page change rebuilds the tbody');

/* ── Result ──────────────────────────────────────────────────────────────── */
console.log('');
if (failed === 0) {
  console.log('S13 OK — forms readability and both filter features verified, offline.');
  process.exit(0);
}
console.log('S13: ' + failed + ' assertion(s) FAILED');
process.exit(1);
