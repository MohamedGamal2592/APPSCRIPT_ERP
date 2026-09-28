'use strict';
/**
 * Offline proof for the tc_budget_inputs unified data view.
 *
 *   node tools/verify/tc_budget_inputs_ui.js
 *
 * The page used to render a bespoke accordion (master-card / master-head /
 * hand-built <table>) instead of the system's UIC.dataTable + row-modal
 * pattern. This checks the conversion landed, that nothing behavioural was
 * lost on the way (bootstrap actions, attachments, add/edit/delete, VAT
 * export, live save/watch), and that the date formatter never lets a sheet
 * date cell reach the screen as its UTC ISO string.
 */
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const root = path.resolve(__dirname, '../..');
const S = require('../lib/sources');

let checks = 0;
function ok(cond, label, extra) {
  checks++;
  assert.ok(cond, label + (extra !== undefined ? ' — ' + JSON.stringify(extra) : ''));
  console.log('  PASS  ' + label);
}

const page = S.read('Company_TopChemical_BudgetInputs.html');
const actions = S.read('Company_TopChemical_Actions.js');

/* ── 1. the unified list ──────────────────────────────────────────────────── */
console.log('\nUnified data view');
ok(page.indexOf("UIC.dataTable('inputs-table'") !== -1, 'the certificate list is a UIC.dataTable');
ok(page.indexOf("UIC.dataTable('input-lines-table'") !== -1, 'the details modal renders its lines through UIC.dataTable');
ok(page.indexOf("UIC.openModal('input-detail-modal'") !== -1, 'a row opens the details modal');
ok(page.indexOf('rowClick: function (rec, tr)') !== -1, 'the list opts into row click');
ok(page.indexOf('class="master-card"') === -1 && page.indexOf('toggleExpand') === -1 && page.indexOf('autoColumnsAll') === -1,
  'the bespoke accordion (master-card / toggleExpand / autoColumnsAll) is gone');
ok(page.indexOf("UIC.dataTable('inputs-table'") !== -1 && page.indexOf('searchable: false') !== -1,
  'the page keeps its own filter bar instead of a second search box');

/* ── 2. behaviour preserved ───────────────────────────────────────────────── */
console.log('\nBehaviour preserved');
ok(/viewAttachment\([^\n]+legal_product_purchasing/.test(page),
  'purchasing-line attachment buttons keep the child sheet on one line');
ok(page.indexOf("companyCall('get_legal_inputs')") !== -1 &&
  page.indexOf("companyCall('get_budget_refs')") !== -1 &&
  page.indexOf("companyCall('get_legal_parties')") !== -1,
  'the same three bootstrap actions are still called');
ok(page.indexOf("'add_legal_costing_bundle'") !== -1 &&
  page.indexOf("'edit_legal_costing_bundle'") !== -1 &&
  page.indexOf("'delete_legal_costing'") !== -1,
  'add/edit/delete actions are unchanged');
ok(page.indexOf("UIC.openModal('costing-modal'") !== -1 && page.indexOf('function openCostingModal(') !== -1,
  'the add/edit modal is unchanged');
ok(page.indexOf('export_vat_purchasing_xlsx') !== -1 &&
  /\(CAN_WRITE \? '<button[^\n]*exportVatPurchasingXlsx\(\)[^\n]*: ''\)/.test(page),
  'the VAT Excel export button is shown to write-authorized users');
ok(/'export_vat_purchasing_xlsx': \{ page: 'tc_budget_inputs', access: 'write' \}/.test(actions),
  'the server export endpoint requires write permission on tc_budget_inputs');
ok(/if \(!unifiedCheck_\(user, COMPANY_UID, req\.page, req\.access\)\)/.test(actions),
  'the export remains behind the shared server-side permission check');
ok(page.indexOf('UIC.Live.save') !== -1 && page.indexOf('UIC.Live.watchPage') !== -1,
  'live save and the change watch are unchanged');
ok(page.indexOf('function renderCosting(') !== -1, 'renderCosting keeps its name — the live-save callbacks still point at it');
ok((page.match(/UIC\.openDownload\(/g) || []).length === 2,
  'exactly two download sites remain (attachment + budget_print)', (page.match(/UIC\.openDownload\(/g) || []).length);

/* ── 3. dates ─────────────────────────────────────────────────────────────── */
console.log('\nDate display');
ok(page.indexOf('function fmtDateSmart(') !== -1, 'a smart date formatter exists');
ok(page.indexOf("escHtml(fmtDateSmart(r['تاريخ الافراج'])") !== -1, 'the list release-date column is formatted');
ok(page.indexOf("escHtml(fmtDateSmart(h['تاريخ الافراج'])") !== -1 &&
  page.indexOf("escHtml(fmtDateSmart(h['invoice_date'])") !== -1,
  'the modal header dates are formatted');
ok(page.indexOf("escHtml(fmtDateSmart(l['تاريخ الانتاج'])") !== -1 &&
  page.indexOf("escHtml(fmtDateSmart(l['تاريخ الانتهاء'])") !== -1,
  'line production/expiry dates are formatted');

function fnBody(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert(at >= 0, 'missing function ' + name);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('unterminated ' + name);
}
const ctx = { console, Date, Object, String, Number, isNaN, isFinite };
vm.createContext(ctx);
vm.runInContext(fnBody(page, 'dateWithOptionalTime') + '\n' + fnBody(page, 'fmtDateSmart') +
  '\nthis.__f = fmtDateSmart;', ctx, { filename: 'BudgetInputs#fmtDateSmart' });
const fd = ctx.__f;
ok(fd('2026-05-06') === '2026-05-06', 'a date-only string stays opaque');
ok(fd(new Date(2026, 4, 6, 0, 0)) === '2026-05-06', 'a midnight Date renders date-only');
ok(fd(new Date(2026, 4, 6, 9, 5)) === '2026-05-06 09:05', 'a Date with a time keeps it');
ok(fd('') === '' && fd(null) === '' && fd(undefined) === '', 'blank values render empty');
ok(fd('2026-05-05T21:00:00.000Z').indexOf('T') === -1, 'an ISO datetime never leaks its T form');

/* ── 4. pre-save costing preview ─────────────────────────────────────────── */
console.log('\nPre-save costing preview');
ok(page.indexOf('function costingPreviewHeaderRef(') !== -1 &&
  page.indexOf('function calculateCostingPreview(') !== -1 &&
  page.indexOf("modeEl.textContent = 'معاينة أولية قبل الحفظ'") !== -1 &&
  page.indexOf('readonly aria-readonly="true"') !== -1 &&
  page.indexOf('COSTING_FORMULA_KEYS') !== -1,
  'the preview is driven by the purchase header reference');
ok(page.indexOf('if (totalEl) totalEl.textContent = costingPreviewMoney(calc.totalCost);') !== -1 &&
  page.indexOf("savedFormulaDisplay('اجمالي التكاليف')") === -1,
  'total cost is rendered from the live sheet-formula calculation, not a saved inline formula display');
const previewBody = fnBody(page, 'costingPreviewNumber') + '\n' + fnBody(page, 'calculateCostingPreview');
const previewCtx = { Number, String, isFinite };
vm.createContext(previewCtx);
vm.runInContext(previewBody + '\nthis.__preview = calculateCostingPreview;', previewCtx, { filename: 'BudgetInputs#calculateCostingPreview' });
const preview = previewCtx.__preview({ 'نوع الشهادة': 'مشتريات', 'القيمه بالدولار': '115500', 'سعر الصرف': '49.92', 'ض شراء': '0', 'اجمالي التكاليف': '0' }, 0);
ok(preview.originalCurrency === 115500 && preview.exchangeRate === 49.92 &&
  preview.advertised === 5765760 && preview.taxType === 807206.4 &&
  preview.totalCost === 5765760 && preview.linesTotal === 0 && preview.headerTotal === 0,
  'header reference produces the expected currency, exchange, tax, and formula total');
const previewWithPurchaseTax = previewCtx.__preview({ 'نوع الشهادة': 'مشتريات', 'القيمه بالدولار': '115500', 'سعر الصرف': '49.92', 'ض شراء': '100', 'م اداريه': '50', 'اجمالي التكاليف': '0' }, 1250.5);
ok(previewWithPurchaseTax.totalCost === 5765910 && previewWithPurchaseTax.linesTotal === 1250.5 && previewWithPurchaseTax.headerTotal === 0,
  'non-sale formula includes header fees and purchase tax, independent of line markup');
const salePreview = previewCtx.__preview({ 'نوع الشهادة': 'بيع', 'القيمه بالدولار': '115500', 'سعر الصرف': '49.92', 'ض شراء': '100' }, 0);
ok(salePreview.totalCost === 5765760, 'sale formula excludes purchase tax exactly like the sheet');
ok(actions.indexOf('function legalCostingFormulaMap_()') !== -1 &&
  actions.indexOf("'القيمه بالسعر المعلن': '=H{r}*I{r}'") !== -1 &&
  actions.indexOf("'اجمالي التكاليف': '=IF(D{r}=\"بيع\",J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r},J{r}+M{r}+N{r}+O{r}+P{r}+Q{r}+R{r}+S{r}+T{r}+U{r})'") !== -1 &&
  actions.indexOf("'المبيعات': '=IF(D{r}=\"بيع\",ROUND(Y{r}*103/100,-2),0)'") !== -1 &&
  (actions.match(/legalCostingFormulaMap_\(\)/g) || []).length >= 3,
  'create and edit paths write the shared formula map across legal_purchasing_costing');
ok(page.indexOf('COSTING_FORMULA_KEYS.forEach(function (key) { delete data[key]; });') !== -1,
  'calculated fields are excluded from the user save payload');

/* ── 4. the script still parses ───────────────────────────────────────────── */
console.log('\nTemplate');
const blocks = S.scriptBlocks(page);
assert.ok(blocks.length > 0, 'page has an inline script');
blocks.forEach(function (b, i) {
  new vm.Script(S.stripScriptlets(b.body), { filename: 'Company_TopChemical_BudgetInputs.html#' + i });
});
checks++;
console.log('  PASS  every inline script block parses');

console.log('\nAll ' + checks + ' checks pass.');
