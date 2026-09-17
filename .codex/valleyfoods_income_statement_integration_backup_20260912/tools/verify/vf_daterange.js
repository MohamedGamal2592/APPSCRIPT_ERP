/**
 * Date-range filter (من تاريخ / إلى تاريخ) on the three Valley Foods finance
 * lists: vf_cash, vf_sales and vf_purchasing.
 *
 *   node tools/verify/vf_daterange.js
 *
 * Offline, over the real source. The three pages are booted for real and their
 * own render functions run, so what is asserted is the markup they produce and
 * the payloads they actually send — not the shape of the source text.
 *
 * The one thing a node harness cannot do is parse a date the way Apps Script's
 * V8 runtime does in a non-UTC script timezone, so §5 asserts the bound helper
 * builds LOCAL times at both ends rather than trusting Date's ISO parsing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootPage, flush } = require('./pageharness');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};
const section = (t) => console.log('\n' + t);

/** Set a rendered input's value the way a user typing into it would. */
function setInput(sandbox, id, value) {
  const el = sandbox.document.getElementById(id);
  if (!el) return false;
  el.value = value;
  return true;
}
const lastCall = (sandbox, action) => {
  const hits = sandbox.__calls.filter(c => (c.payload && c.payload.module_action) === action);
  return hits.length ? hits[hits.length - 1].payload.data : null;
};
const settle = async (n) => { for (let i = 0; i < (n || 8); i++) await flush(); };

/* ── 1. The shared component ─────────────────────────────────────────────── */
section('1. UIC.dateRangeBar — the one strip all three pages render');

const uicSandbox = bootPage({
  page: 'Company_ValleyFoods_Cash.html',
  containers: ['vf-cash-content'],
  scriptlets: { CURRENT_ACTION: "'vf_cash'" },
  call: () => ({ status: 'success' })
});
const UIC = uicSandbox.UIC;

check(typeof UIC.dateRangeBar === 'function', 'UIC.dateRangeBar exists');
check(typeof UIC.dateRangeValues === 'function', 'UIC.dateRangeValues exists');

const bare = UIC.dateRangeBar('k', {});
check(/id="k-from"[^>]*type="date"/.test(bare) || /type="date"[^>]*id="k-from"/.test(bare),
  'renders a date input at <key>-from', bare);
check(/id="k-to"/.test(bare) && /type="date"/.test(bare), 'renders a date input at <key>-to');
check(bare.indexOf('من تاريخ') !== -1 && bare.indexOf('إلى تاريخ') !== -1,
  'both ends are labelled in Arabic');
check(bare.indexOf('مسح التاريخ') === -1, 'no clear button while the range is empty');

const filled = UIC.dateRangeBar('k', { from: '2026-03-01', to: '2026-03-31', onchange: 'A()', onclear: 'B()' });
check(filled.indexOf('value="2026-03-01"') !== -1 && filled.indexOf('value="2026-03-31"') !== -1,
  'the current range comes back as the input values');
check((filled.match(/onchange="A\(\)"/g) || []).length === 2, 'both inputs carry the change handler');
check(filled.indexOf('onclick="B()"') !== -1 && filled.indexOf('مسح التاريخ') !== -1,
  'a set range gets a clear button');

/* A value is escaped, not concatenated raw, so a crafted saved view cannot
   break out of the attribute. */
const nasty = UIC.dateRangeBar('k', { from: '"><img src=x onerror=alert(1)>' });
check(nasty.indexOf('<img') === -1, 'the value is escaped into the attribute', nasty);

/* Reading back what the page rendered. */
uicSandbox.document.getElementById('vf-cash-content').innerHTML = filled;
setInput(uicSandbox, 'k-from', '2026-01-05');
setInput(uicSandbox, 'k-to', '2026-02-06');
const vals = UIC.dateRangeValues('k');
check(vals.from === '2026-01-05' && vals.to === '2026-02-06',
  'UIC.dateRangeValues reads both inputs back', JSON.stringify(vals));
check(UIC.dateRangeValues('no-such-bar').from === '', 'a bar that is not on the page reads as empty');

const CASH_ROW = {
  transaction_id: 7, date_display: '01/03/2026', date_edit: '2026-03-01',
  party_name: 'عميل', transaction_details: 'دفعة', transaction_type: 'Debit',
  transaction_method: 'نقدي', transaction_amount: 100, related_box: 'B1',
  box_name: 'الخزنة', chart_code: '1101', user: 'a@b.c',
  balance_amount: 100, approved_bool: true
};

async function cashPage(savedView) {
  const s = bootPage({
    page: 'Company_ValleyFoods_Cash.html',
    isSuperAdmin: true,
    containers: ['vf-cash-content'],
    scriptlets: { CURRENT_ACTION: "'vf_cash'" },
    expose: ['load'],
    call: (action) => {
      if (action === 'get_valley_cash') {
        return {
          status: 'success', headers: [CASH_ROW],
          boxes: [{ box: 'B1', name: 'الخزنة', balance: 100 }],
          enums: { transaction_type: ['Debit', 'Credit'], transaction_method: ['نقدي'] },
          item_suggestions: [], next_id: 8,
          party_options: [], box_options: [{ value: 'B1', label: 'الخزنة' }], chart_options: []
        };
      }
      return { status: 'success' };
    }
  });
  s.SESSION.loadActiveView = () => Promise.resolve(savedView || {});
  s.SESSION.saveCurrentView = () => Promise.resolve({});
  s.exported('load')();
  await settle();
  return s;
}

(async () => {
  /* ── 2. vf_cash ────────────────────────────────────────────────────────── */
  section('2. vf_cash — the range travels to get_valley_cash');

  const s = await cashPage();
  const html = s.html('vf-cash-content');
  check(html.indexOf('id="cash-date-from"') !== -1 && html.indexOf('id="cash-date-to"') !== -1,
    'the list renders the range bar');
  check(html.indexOf('CASH_PAGE.applyDateFilter()') !== -1, 'the inputs are wired to the page');
  check(html.indexOf('cash-table-id') !== -1, 'the movements table still renders alongside it');

  const first = lastCall(s, 'get_valley_cash');
  check(first && first.from === '' && first.to === '',
    'the first load asks for an unbounded list', JSON.stringify(first));

  setInput(s, 'cash-date-from', '2026-03-01');
  setInput(s, 'cash-date-to', '2026-03-31');
  s.CASH_PAGE.applyDateFilter();
  await settle();
  const bounded = lastCall(s, 'get_valley_cash');
  check(bounded && bounded.from === '2026-03-01' && bounded.to === '2026-03-31',
    'applying the range refetches with from/to — the server bounds the full ledger',
    JSON.stringify(bounded));
  check(s.html('vf-cash-content').indexOf('value="2026-03-01"') !== -1,
    'the range survives the redraw');

  /* An inverted range is refused rather than sent. */
  const before = s.__calls.length;
  setInput(s, 'cash-date-from', '2026-05-01');
  setInput(s, 'cash-date-to', '2026-04-01');
  s.CASH_PAGE.applyDateFilter();
  await flush();
  check(s.__calls.length === before, 'from > to is refused without a round trip');
  check(s.toasts().some(t => String(t).indexOf('من تاريخ') !== -1), 'and the user is told why',
    JSON.stringify(s.toasts()));

  /* Clearing goes back to the whole ledger. */
  s.CASH_PAGE.clearDateFilter();
  await settle();
  const cleared = lastCall(s, 'get_valley_cash');
  check(cleared && cleared.from === '' && cleared.to === '', 'clearing removes both bounds');

  /* The saved view carries the range, and restoring it refetches bounded. */
  const s2 = await cashPage({ box: '', from: '2026-02-01', to: '2026-02-28' });
  await settle();
  const restored = lastCall(s2, 'get_valley_cash');
  check(restored && restored.from === '2026-02-01' && restored.to === '2026-02-28',
    'a saved view restores the range and reloads bounded', JSON.stringify(restored));
  const cashSrc = read('Company_ValleyFoods_Cash.html');
  check(/saveCurrentView\('vf_cash', \{ box: [^}]*from:/.test(cashSrc),
    'حفظ العرض persists the range next to the box filter');

  /* ── 3. vf_sales ───────────────────────────────────────────────────────── */
  section('3. vf_sales — the range travels with every page of the paged table');

  const INV = {
    invoice_unique_id: 'INV-1', 'رقم الفاتورة': '1001', 'اسم العميل': 'C-1',
    'تاريخ الفاتورة': '2026-03-05', 'المبلغ الصافي': 100, 'قيمة الضريبة': 14,
    'إجمالي': 114, approval_status: 'Pending'
  };
  /* The list is a unified UIC.dataTable (full rows client-side, 50-row pager):
     the shim records the options the page hands it — empty text, truncated /
     showAll — instead of driving a pager. */
  function shimPagedTable(sandbox) {
    sandbox.UIC.dataTable = function (containerId, opts) {
      sandbox.__pt = { emptyText: opts.emptyText, showAll: opts.showAll, truncated: opts.truncated };
    };
  }

  const sales = bootPage({
    page: 'Company_ValleyFoods_Sales.html',
    isSuperAdmin: true,
    containers: ['vf-sales-content', 'sales-filter', 'sales-table'],
    scriptlets: { CURRENT_ACTION: "'vf_sales'" },
    expose: ['renderApp'],
    call: (action) => {
      if (action === 'get_valley_sales_page') {
        return { status: 'success', invoices: [INV], total: 1,
          parties: [{ value: 'C-1', label: 'عميل' }], products: [], enums: {} };
      }
      return { status: 'success' };
    }
  });
  shimPagedTable(sales);
  sales.exported('renderApp')();
  await settle();

  check(sales.html('sales-filter').indexOf('id="sales-date-from"') !== -1,
    'the range bar renders above the invoice table');
  check(sales.html('vf-sales-content').indexOf('sales-filter') <
        sales.html('vf-sales-content').indexOf('sales-table'),
    'and it sits before the table, not inside it');
  check(!!sales.__pt && /لا توجد فواتير/.test(sales.__pt.emptyText),
    'the empty text is the invoice one');
  const sFirst = lastCall(sales, 'get_valley_sales_page');
  check(sFirst && sFirst.offset === 0 && sFirst.from === '' && sFirst.to === '',
    'the first page is unbounded', JSON.stringify(sFirst));

  setInput(sales, 'sales-date-from', '2026-03-01');
  setInput(sales, 'sales-date-to', '2026-03-31');
  sales.SALES_PAGE.applyDateFilter();
  await settle();
  const sBounded = lastCall(sales, 'get_valley_sales_page');
  check(sBounded && sBounded.from === '2026-03-01' && sBounded.to === '2026-03-31',
    'the fetcher sends from/to — paging cannot outrun the filter', JSON.stringify(sBounded));
  check(sBounded && sBounded.offset === 0 && sBounded.limit > 0,
    'and it restarts at offset 0 with the page size intact');
  check(sales.html('sales-filter').indexOf('value="2026-03-01"') !== -1,
    'the bar redraws with the range it is now showing');

  sales.SALES_PAGE.clearDateFilter();
  await settle();
  const sCleared = lastCall(sales, 'get_valley_sales_page');
  check(sCleared && sCleared.from === '' && sCleared.to === '', 'clearing removes both bounds');

  /* ── 4. vf_purchasing ──────────────────────────────────────────────────── */
  section('4. vf_purchasing — the range travels to get_valley_purchasing_costing');

  const PUR_HEADER = {
    id: 3, Code: 'PC-003', 'Reciept Date': '2026-03-01', Items: 'بذور',
    'Supplier Name': 'S-1', approval_status: 'Pending', quality_approval_status: 'Pending',
    'Total costs': 12480
  };
  const pur = bootPage({
    page: 'Company_ValleyFoods_Purchasing.html',
    isSuperAdmin: true,
    containers: ['vf-purchasing-content'],
    scriptlets: { CURRENT_ACTION: "'vf_purchasing'" },
    call: (action) => {
      if (action === 'get_valley_purchasing_costing') {
        return { status: 'success', can_see_cost: true, headers: [PUR_HEADER],
          options: { supplier_options: [{ value: 'S-1', label: 'Acme' }], currency_options: [], movement_type_options: [] } };
      }
      return { status: 'success' };
    }
  });
  pur.renderList();
  await settle();

  const purHtml = pur.html('vf-purchasing-content');
  check(purHtml.indexOf('id="pur-date-from"') !== -1 && purHtml.indexOf('id="pur-date-to"') !== -1,
    'the range bar renders above the purchases table');
  check(purHtml.indexOf('purchasing-table') !== -1, 'the purchases table still renders');
  const pFirst = lastCall(pur, 'get_valley_purchasing_costing');
  check(pFirst && !pFirst.loadAll, 'unfiltered, the list still asks for the newest rows only');

  setInput(pur, 'pur-date-from', '2026-03-01');
  setInput(pur, 'pur-date-to', '2026-03-31');
  pur.applyPurchasingDateFilter();
  await settle();
  const pBounded = lastCall(pur, 'get_valley_purchasing_costing');
  check(pBounded && pBounded.from === '2026-03-01' && pBounded.to === '2026-03-31',
    'applying the range refetches with from/to', JSON.stringify(pBounded));
  check(pBounded && pBounded.loadAll === true,
    'a range implies "everything inside it", not the newest ten of it');

  const pBefore = pur.__calls.length;
  setInput(pur, 'pur-date-from', '2026-05-01');
  setInput(pur, 'pur-date-to', '2026-04-01');
  pur.applyPurchasingDateFilter();
  await flush();
  check(pur.__calls.length === pBefore, 'from > to is refused without a round trip');

  pur.clearPurchasingDateFilter();
  await settle();
  const pCleared = lastCall(pur, 'get_valley_purchasing_costing');
  check(pCleared && pCleared.from === '' && pCleared.to === '' && !pCleared.loadAll,
    'clearing removes the bounds and the implied loadAll');

  /* ── 5. The server side ────────────────────────────────────────────────── */
  section('5. Company_ValleyFoods_Actions.js — the bounds, and where they apply');

  const actions = read('Company_ValleyFoods_Actions.js') + '\n' + read('Company_ValleyFoods_HR_Modules.js');
  const helper = actions.match(/function vfDateBound_\([\s\S]*?\n  \}/);
  check(!!helper, 'vfDateBound_ is defined');
  if (helper) {
    const ctx = { out: null };
    vm.createContext(ctx);
    vm.runInContext(helper[0] + '; out = vfDateBound_;', ctx);
    const vfDateBound_ = ctx.out;

    const from = vfDateBound_('2026-03-01', false);
    const to = vfDateBound_('2026-03-31', true);
    check(from.getHours() === 0 && from.getMinutes() === 0 && from.getDate() === 1,
      '"from" is local midnight on its own day — not UTC midnight', String(from));
    check(to.getHours() === 23 && to.getMinutes() === 59 && to.getDate() === 31,
      '"to" is the END of its day, so same-day rows are inside the range', String(to));
    /* The bug this closes: a row stamped 2026-03-31 14:00 must be <= "to". */
    check(new Date(2026, 2, 31, 14, 0, 0) <= to, 'an afternoon row on the last day is included');
    check(new Date(2026, 2, 1, 0, 30, 0) >= from, 'an early row on the first day is included');
    check(vfDateBound_('', true) === null && vfDateBound_(null, false) === null,
      'an empty bound is no bound');
    check(vfDateBound_('not a date', true) === null, 'an unparseable bound is no bound');
    const stamped = vfDateBound_('2026-03-31T08:15:00', true);
    check(stamped && stamped.getHours() === 8, 'a full timestamp is used as given, not widened');
  }

  check((actions.match(/vfDateBound_\(payload\.from, false\)/g) || []).length === 2
    && (actions.match(/vfDateBound_\(payload\.to, true\)/g) || []).length === 2,
    'both vfBoundRows_ and vfPage_ use the helper at both ends');

  const purFn = actions.match(/function getValleyPurchasingCosting_\([\s\S]*?\n  \}/);
  check(!!purFn && /vfBoundRows_\(rows, data, 'Reciept Date'\)/.test(purFn[0]),
    'getValleyPurchasingCosting_ bounds by the receipt date');
  if (purFn) {
    const bound = purFn[0].indexOf("vfBoundRows_(rows, data, 'Reciept Date')");
    const slice = purFn[0].indexOf('rows.slice(0, limit)');
    check(bound !== -1 && slice !== -1 && bound < slice,
      'and it bounds BEFORE the newest-ten slice, so an old month is reachable');
  }
  check(/vfBoundRows_\(allRows, data, 'transaction_date'\)/.test(actions),
    'get_valley_cash already bounds the ledger by transaction_date');
  check(/vfPage_\(slim, data, 'تاريخ الفاتورة'\)/.test(actions),
    'get_valley_sales_page already bounds the invoices by their date');

  console.log('\n' + (failed ? failed + ' FAILED' : 'all checks passed'));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

