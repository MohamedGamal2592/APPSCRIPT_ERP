/**
 * P6.2 — every watched page's view loads through the device cache.
 *
 * One line per page, just before its `function companyCall` declaration (the
 * declaration is hoisted, so the wrap is in place before any list call runs):
 *
 *   companyCall = UIC.Live.viewCache(companyCall, { page, view, lists });
 *
 * `lists` are the read actions the page's quiet reload reaches (the refresh
 * passed to UIC.Live.arrive and the page functions it calls, depth <= 3);
 * `view` is the view P3 declared. Pages on UIC.Live.VIEW_CACHE_OPT_OUT (OD7)
 * get the line too — the runtime list decides — so the owner can switch a
 * page on or off in one place. The single-form editor (AssessmentForm) is not
 * a list and is skipped.
 *
 * Testing System pages: their Top Light sources carry the line through
 * tools/erptest/gen_pages.js; Company_ErpTest_Manufacture.html is edited here.
 * Idempotent. Run: node tools/liveviews/adopt_views.js  (then gen_pages.js)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { functionSpans, stripComments } = require('./inventory');

const ROOT = path.resolve(__dirname, '..', '..');
const INV = JSON.parse(fs.readFileSync(path.join(__dirname, 'inventory.json'), 'utf8'));
const TAG = '/* [live-notice D6] list replies from the device cache, trusted by the stamps */';
const SKIP = { 'Company_Assessment_AssessmentForm.html': 'a single-record editor, not a list' };
const VIEW = {
  'Company_ValleyFoods_CashBoxBalances.html': 'report', 'Company_ValleyFoods_CashExpenses.html': 'report',
  'Company_ValleyFoods_CashIncomes.html': 'report', 'Company_ValleyFoods_MfgClientReport.html': 'report',
  'Company_ValleyFoods_MfgOrderView.html': 'detail',
  'Company_TopChemical_BudgetHR.html': 'tab:employees', 'Company_ValleyFoods_HR_Emp.html': 'tab:employees'
};
const isRead = a => /^(get|list|search|lookup)_/.test(a) && a !== 'get_page_versions' && !/^get_xlsx|_export/.test(a);

function listActions(src, refresh) {
  const code = stripComments(src);
  const spans = functionSpans(code);
  const byName = {};
  spans.forEach(s => { if (!byName[s.name]) byName[s.name] = s; });
  const seen = new Set();
  const acts = new Set();
  const visit = (text, depth) => {
    let m;
    const reAct = /companyCall\(\s*'([a-z0-9_]+)'/g;
    while ((m = reAct.exec(text)) !== null) if (isRead(m[1])) acts.add(m[1]);
    if (depth <= 0) return;
    const reCall = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    while ((m = reCall.exec(text)) !== null) {
      const n = m[1];
      if (!byName[n] || seen.has(n) || n === 'companyCall') continue;
      seen.add(n);
      visit(code.slice(byName[n].open, byName[n].close), depth - 1);
    }
  };
  visit(refresh || '', 3);
  return [...acts].sort();
}

const pages = [];
Object.keys(INV.companies).forEach(c => INV.companies[c].pages.forEach(p => pages.push(Object.assign({ company: c }, p))));
const out = { adopted: [], skipped: [], excluded: [] };
pages.forEach(p => {
  const f = p.file;
  if (/^Company_ErpTest_/.test(f) && f !== 'Company_ErpTest_Manufacture.html') { out.skipped.push(f + ' (generated)'); return; }
  if (SKIP[f]) { out.skipped.push(f + ' (' + SKIP[f] + ')'); return; }
  const fp = path.join(ROOT, f);
  let s = fs.readFileSync(fp, 'utf8');
  if (s.indexOf('UIC.Live.viewCache(') !== -1) { out.skipped.push(f + ' (already)'); return; }
  const refresh = f === 'Company_TopChemical_BudgetHR.html' ? 'fetchEmployees(true); fetchSalaries(true);' : p.refresh;
  const page = String(p.serverPage).split('|').pop();
  const view = VIEW[f] || 'list';
  /* A reply may be trusted by the view's stamps only if every table it was
     read from is one of the view's tables; an action that reads more (a
     per-record lookup, say) is left uncached. */
  const viewTables = new Set(((INV.companies[p.company].pageViews[page] || {})[view]) || []);
  const excluded = [];
  const lists = listActions(s, refresh).filter(a => {
    const t = p.tablesPerAction[a] || { declared: [], reads: {} };
    const need = t.declared.concat(Object.keys(t.reads)).filter(x => !/^mysql:/.test(x) && !/^(ERP_|AuditLog|SystemLog|erp_test__)/.test(x));
    const ok = need.length > 0 && need.every(x => viewTables.has(x));
    if (!ok) excluded.push(a + ' [' + need.filter(x => !viewTables.has(x)).join(',') + ']');
    return ok;
  });
  if (excluded.length) out.excluded.push(f + ': ' + excluded.join('; '));
  if (!lists.length) { out.skipped.push(f + ' (no list action whose tables the view covers)'); return; }
  const at = s.search(/^[ \t]*function companyCall\s*\(/m);
  if (at === -1) throw new Error(f + ': function companyCall not found');
  const indent = /^[ \t]*/.exec(s.slice(at))[0];
  const uid = (/target_system:\s*'([0-9a-f]{16})'/.exec(s.slice(at)) || [])[1];
  if (!uid) throw new Error(f + ': company uid not found in companyCall');
  const line = indent + TAG + '\n' + indent + "companyCall = UIC.Live.viewCache(companyCall, { company: '" + uid + "', page: '" + page + "', view: '" + view +
    "', lists: [" + lists.map(a => "'" + a + "'").join(', ') + '] });\n';
  s = s.slice(0, at) + line + s.slice(at);
  fs.writeFileSync(fp, s, 'utf8');
  out.adopted.push(f + ' → ' + page + '/' + view + ' ' + lists.join(','));
});
console.log('adopted: ' + out.adopted.length + '\n  ' + out.adopted.join('\n  '));
console.log('skipped: ' + out.skipped.length + '\n  ' + out.skipped.join('\n  '));
console.log('left uncached (reads tables outside the view): ' + out.excluded.length + '\n  ' + out.excluded.join('\n  '));
