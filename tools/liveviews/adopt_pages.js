/**
 * P3 — page adoption: tell UIC.Live which view is on screen.
 *
 * Generic pages (a list, forms in UIC.openModal dialogs): one line right after
 * the page's watchPage call —
 *     UIC.Live.setView('list', { refresh: function () { <the page's quiet reload> } });
 * — and the dialogs are counted by UIC.openModal/closeModal themselves.
 *
 * Pages that swap the whole screen between a list and a form, or between tabs,
 * get explicit calls at the switch points (anchors below, each asserted to
 * match exactly once). Report and detail pages declare their single view.
 *
 * Testing System pages are generated: their Top Light sources are edited here
 * and tools/erptest/gen_pages.js copies them; Company_ErpTest_Manufacture.html
 * has no generator and is edited directly.
 *
 * Idempotent: a file that already calls UIC.Live.setView is left alone.
 * Run: node tools/liveviews/adopt_pages.js   (then node tools/erptest/gen_pages.js)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TAG = '/* [live-notice] the view on screen */';

/* View for pages whose single screen is not a list. */
const SINGLE_VIEW = {
  'Company_ValleyFoods_CashBoxBalances.html': 'report',
  'Company_ValleyFoods_CashExpenses.html': 'report',
  'Company_ValleyFoods_CashIncomes.html': 'report',
  'Company_ValleyFoods_MfgClientReport.html': 'report',
  'Company_ValleyFoods_MfgOrderView.html': 'detail',
  'Company_Assessment_AssessmentForm.html': 'form'
};

/* list <-> form pages and tabbed pages: [find, replace] pairs, each once. */
const MANUAL = {
  'Company_TopLight_Sales.html': [
    ["  function renderList(loadAll, quiet) {\n    __loadedAll = arguments.length ? !!loadAll : __loadedAll;\n",
     "  function renderList(loadAll, quiet) {\n    __loadedAll = arguments.length ? !!loadAll : __loadedAll;\n    " + TAG +
     "\n    UIC.Live.setView('list', { refresh: function () { renderList(__loadedAll, true); }, loading: true });\n"],
    ["    UIC.readSkeleton('tl-content', { message: ['جاري استرجاع خيارات العملاء والأصناف...'] });\n    ensureOptions()\n",
     "    " + TAG + "\n    if (UIC.Live.setView('form', { refresh: function () { openForm(__editingUid); }, loading: true, key: __editingUid, table: 'top_light_sales_invoices' })) __optionsPromise = null;\n" +
     "    UIC.readSkeleton('tl-content', { message: ['جاري استرجاع خيارات العملاء والأصناف...'] });\n    ensureOptions()\n"]
  ],
  'Company_TopLight_Purchasing.html': [
    ["  function renderList(quiet) {\n    if (!quiet) UIC.readSkeleton('tl-content', { message: [\n      'جاري تحميل عمليات الشراء...',",
     "  function renderList(quiet) {\n    " + TAG + "\n    UIC.Live.setView('list', { refresh: function () { renderList(true); }, loading: true });\n" +
     "    if (!quiet) UIC.readSkeleton('tl-content', { message: [\n      'جاري تحميل عمليات الشراء...',"],
    ["    UIC.readSkeleton('tl-content', { message: ['جاري استرجاع الموردين والأصناف...'] });\n    ensureOptions()\n",
     "    " + TAG + "\n    if (UIC.Live.setView('form', { refresh: function () { openForm(__editingUid); }, loading: true, key: __editingUid, table: 'top_light_purchasing_costing' })) __optionsPromise = null;\n" +
     "    UIC.readSkeleton('tl-content', { message: ['جاري استرجاع الموردين والأصناف...'] });\n    ensureOptions()\n"]
  ],
  'Company_TopLight_Sales_Offer.html': [
    ["  function renderList(quiet) {\n    if (!quiet) UIC.readSkeleton('tl-content', { message: [\n      'جاري تحميل عروض الأسعار...',",
     "  function renderList(quiet) {\n    " + TAG + "\n    UIC.Live.setView('list', { refresh: function () { renderList(true); }, loading: true });\n" +
     "    if (!quiet) UIC.readSkeleton('tl-content', { message: [\n      'جاري تحميل عروض الأسعار...',"],
    ["      if (!record) { UIC.toast('السجل غير موجود — تم تحديث القائمة', 'error'); showList(); return; }\n    }\n    renderForm(record);\n  }",
     "      if (!record) { UIC.toast('السجل غير موجود — تم تحديث القائمة', 'error'); showList(); return; }\n    }\n    " + TAG +
     "\n    UIC.Live.setView('form', { refresh: function () { openForm(__editingUid); }, loading: true, key: __editingUid, table: 'top_light_sales_offer' });\n    renderForm(record);\n  }"]
  ],
  'Company_ErpTest_Manufacture.html': [
    ["  function renderList(quiet) {\n    if (!quiet) UIC.readSkeleton('tl-content', { message: [\n      'جاري تحميل أوامر التصنيع...',",
     "  function renderList(quiet) {\n    " + TAG + "\n    UIC.Live.setView('list', { refresh: function () { renderList(true); }, loading: true });\n" +
     "    if (!quiet) UIC.readSkeleton('tl-content', { message: [\n      'جاري تحميل أوامر التصنيع...',"],
    ["    UIC.readSkeleton('tl-content', { message: ['جاري استرجاع المنتجات والأرصدة...'] });\n    ensureOptions()\n",
     "    " + TAG + "\n    if (UIC.Live.setView('form', { refresh: function () { openForm(__editingUid); }, loading: true, key: __editingUid, table: 'erp_test_manufacture_orders' })) __optionsPromise = null;\n" +
     "    UIC.readSkeleton('tl-content', { message: ['جاري استرجاع المنتجات والأرصدة...'] });\n    ensureOptions()\n"]
  ],
  'Company_ValleyFoods_Purchasing.html': [
    ["      __loadedAll = arguments.length ? !!loadAll : __loadedAll;\n      if (!quiet) UIC.readSkeleton('vf-purchasing-content');\n",
     "      __loadedAll = arguments.length ? !!loadAll : __loadedAll;\n      " + TAG +
     "\n      UIC.Live.setView('list', { refresh: function () { showList(true); }, loading: true });\n      if (!quiet) UIC.readSkeleton('vf-purchasing-content');\n"],
    ["      UIC.readSkeleton('vf-purchasing-content', { message: 'جاري استرجاع الأصناف والموردين...' });\n      ensureOptions()\n",
     "      " + TAG + "\n      if (UIC.Live.setView('form', { refresh: function () { openForm(__editingCode, __viewOnly); }, loading: true })) __optionsPromise = null;\n" +
     "      UIC.readSkeleton('vf-purchasing-content', { message: 'جاري استرجاع الأصناف والموردين...' });\n      ensureOptions()\n"]
  ],
  'Company_TopChemical_BudgetHR.html': [
    ["  function switchTab(t) {\n",
     "  function switchTab(t) {\n    " + TAG + "\n    UIC.Live.setView('tab:' + t, { refresh: refreshQuiet });\n"],
    ["    onChange: function () { UIC.Live.arrive(refreshQuiet); }\n  });\n",
     "    onChange: function () { UIC.Live.arrive(refreshQuiet); }\n  });\n  " + TAG + "\n  UIC.Live.setView('tab:' + TAB, { refresh: refreshQuiet });\n"]
  ],
  'Company_ValleyFoods_HR_Emp.html': [
    ["    function switchTab(t) { TAB = t; render(); }",
     "    function switchTab(t) {\n      TAB = t;\n      " + TAG + "\n      UIC.Live.setView('tab:' + TAB, { refresh: function () { fetchAll(true); } });\n      render();\n    }"],
    ["          onChange: function () { UIC.Live.arrive(function () { fetchAll(true); }); }\n        });\n      });\n",
     "          onChange: function () { UIC.Live.arrive(function () { fetchAll(true); }); }\n        });\n      });\n    " + TAG +
     "\n    UIC.Live.setView('tab:' + TAB, { refresh: function () { fetchAll(true); } });\n"]
  ]
};

/* The end of the `UIC.Live.watchPage({ ... });` statement starting at `at`. */
function statementEnd(s, at) {
  const open = s.indexOf('(', at);
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { return s[i + 1] === ';' ? i + 2 : i + 1; } }
  }
  return -1;
}

/* The body of the function passed to UIC.Live.arrive, brace-matched (a lazy
 * regex stopped at the first `}` and cut `{ refresh: true }` in half). */
function refreshOf(s) {
  const at = s.search(/UIC\.Live\.arrive\(\s*function\s*\(\)\s*\{/);
  if (at === -1) return null;
  const open = s.indexOf('{', s.indexOf('function', at));
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(open + 1, i).trim(); }
  }
  return null;
}

const files = fs.readdirSync(ROOT).filter(f => /^Company_.*\.html$/.test(f) && fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('UIC.Live.watchPage') !== -1);
const report = { generic: [], manual: [], skipped: [] };
/* Statement-form calls are guarded, so a page evaluated with a partial
 * UIC.Live stub (tools/verify/s24_stock_scan.js) still loads. */
const guard = s => s.replace(/^([ \t]*)UIC\.Live\.setView\(/gm, '$1if (UIC.Live.setView) UIC.Live.setView(');
files.forEach(f => {
  if (/^Company_ErpTest_/.test(f) && f !== 'Company_ErpTest_Manufacture.html') { report.skipped.push(f + ' (generated by gen_pages.js)'); return; }
  const p = path.join(ROOT, f);
  let s = fs.readFileSync(p, 'utf8');
  if (s.indexOf('UIC.Live.setView(') !== -1) { report.skipped.push(f + ' (already adopted)'); return; }
  if (MANUAL[f]) {
    MANUAL[f].forEach(([find, repl]) => {
      const n = s.split(find).length - 1;
      if (n !== 1) throw new Error(f + ': anchor found ' + n + ' times: ' + JSON.stringify(find.slice(0, 80)));
      s = s.replace(find, () => repl);
    });
    fs.writeFileSync(p, guard(s), 'utf8');
    report.manual.push(f);
    return;
  }
  const at = s.indexOf('UIC.Live.watchPage(');
  const end = statementEnd(s, at);
  const refresh = refreshOf(s.slice(at, end));
  if (end === -1 || !refresh) throw new Error(f + ': watchPage/arrive shape not recognised');
  const lineStart = s.lastIndexOf('\n', at) + 1;
  const indent = s.slice(lineStart, at);
  const view = SINGLE_VIEW[f] || 'list';
  const line = '\n' + indent + TAG + '\n' + indent + "UIC.Live.setView('" + view + "', { refresh: function () { " + refresh + ' } });';
  s = s.slice(0, end) + line + s.slice(end);
  fs.writeFileSync(p, guard(s), 'utf8');
  report.generic.push(f + ' → ' + view);
});
console.log('generic: ' + report.generic.length + '\n  ' + report.generic.join('\n  '));
console.log('manual: ' + report.manual.length + '\n  ' + report.manual.join('\n  '));
console.log('skipped: ' + report.skipped.length + '\n  ' + report.skipped.join('\n  '));
