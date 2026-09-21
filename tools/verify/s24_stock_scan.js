/**
 * S24 — جرد دوري مخازن باركود (Top Chemical scan page) + two fixes found and
 * made while building it: the Valley Foods dashboard nav-visibility gap, and
 * addEmpStatus_'s status sync becoming a full recompute.
 *
 * Offline, over the real source, in the established harness style. Nothing
 * here touches a spreadsheet, calls a Google service or hits the network.
 *
 * Run: node tools/verify/s24_stock_scan.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

/* ══ 1. Company_TopChemical_Actions.js — new actions, own permission surface ══ */
console.log('\n1 — tc_stock_scan actions exist, gated independently from tc_stock_revision\n');

const tcActions = read('Company_TopChemical_Actions.js');

check(/'get_stock_scan_options':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'read'\s*\}/.test(tcActions),
  "get_stock_scan_options is gated to page 'tc_stock_scan' (read)");
check(/'get_stock_scan_qty':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'read'\s*\}/.test(tcActions),
  "get_stock_scan_qty is gated to page 'tc_stock_scan' (read)");
check(/'add_stock_scan':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'write'\s*\}/.test(tcActions),
  "add_stock_scan is gated to page 'tc_stock_scan' (write) — independent of tc_stock_revision");
check(/'add_stock_scan':\s*STOCK_SHEET/.test(tcActions),
  'ACTION_TABLES maps add_stock_scan to STOCK_SHEET, same table as add_stock_revision');
check(/register\('get_stock_scan_options',\s*getStockScanOptions_\)/.test(tcActions),
  'get_stock_scan_options registered');
check(/register\('get_stock_scan_qty',\s*getSystemQty_\)/.test(tcActions),
  'get_stock_scan_qty reuses getSystemQty_ — no duplicated MySQL-view logic');
check(/register\('add_stock_scan',\s*addStockRevision_\)/.test(tcActions),
  'add_stock_scan reuses addStockRevision_ — no duplicated write logic');

/* ══ 2. addStockRevision_ — formulas retired, values computed instead ═══════ */
console.log('\n2 — addStockRevision_: five sheet formulas replaced by computed values\n');

const fnStart = tcActions.indexOf('function addStockRevision_');
const fnBody = fnStart === -1 ? '' : tcActions.slice(fnStart, tcActions.indexOf('\n  function ', fnStart + 30));

check(fnStart !== -1, 'addStockRevision_ found');
check(!/=VLOOKUP\(A'\s*\+\s*rowNum/.test(fnBody), 'name_ar VLOOKUP formula string is gone');
check(!/=INDEX\(products!E:E/.test(fnBody), 'category INDEX/MATCH formula string is gone');
check(!/=INDEX\(products!D:D/.test(fnBody), 'unit INDEX/MATCH formula string is gone');
check(!/ISBLANK\(I'\s*\+\s*rowNum/.test(fnBody), 'difference/percentage ISBLANK formula strings are gone');
check(/rowValues\[i\]\s*=\s*nameArVal/.test(fnBody) && /rowValues\[i\]\s*=\s*differenceVal/.test(fnBody)
  && /rowValues\[i\]\s*=\s*percentageVal/.test(fnBody),
  'name_ar/category/unit/difference/percentage are written as literal values in the same setValues call');
check(/differenceVal\s*=\s*stockRevisionDifference_\(amount,\s*avail\)/.test(fnBody)
  && /percentageVal\s*=\s*stockRevisionPercentage_\(amount,\s*avail\)/.test(fnBody),
  'both computed BEFORE the lock, so the response can carry them immediately');
check(/difference:\s*differenceVal/.test(fnBody) && /percentage:\s*percentageVal/.test(fnBody),
  'savedRecord.difference/.percentage are no longer hardcoded empty strings');

/* Differential check: the JS replicas must agree with the retired formulas'
 * documented semantics on representative inputs (blank avail, exact match,
 * shortage, surplus, avail=0). Extracted and evaluated in isolation — the
 * functions have no dependency on any Apps Script service. */
console.log('\n3 — stockRevisionDifference_/stockRevisionPercentage_, evaluated in isolation\n');

function extractFn(name) {
  const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(tcActions);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  while (depth > 0 && i < tcActions.length) {
    if (tcActions[i] === '{') depth++;
    else if (tcActions[i] === '}') depth--;
    i++;
  }
  return tcActions.slice(m.index, i);
}

let diffFn = null, pctFn = null;
try {
  const diffSrc = extractFn('stockRevisionDifference_');
  const pctSrc = extractFn('stockRevisionPercentage_');
  check(!!diffSrc && !!pctSrc, 'both function bodies extracted from source');
  /* eslint-disable no-eval */
  eval('diffFn = ' + diffSrc);
  eval('pctFn = ' + pctSrc);
} catch (e) {
  check(false, 'functions are syntactically evaluable in isolation', e.message);
}

if (diffFn && pctFn) {
  check(diffFn(100, '') === '', 'difference: blank avail -> ""');
  check(diffFn(100, 100) === 'مظبوط', 'difference: exact match -> "مظبوط"');
  check(diffFn(90, 100) === '10  عجز', 'difference: avail>amount -> shortage "عجز"', diffFn(90, 100));
  check(diffFn(110, 100) === '-10  زيادة', 'difference: avail<amount -> surplus "زيادة"', diffFn(110, 100));
  check(pctFn(100, '') === '', 'percentage: blank avail -> ""');
  check(pctFn(100, 0) === '', 'percentage: avail=0 -> "" (no divide-by-zero)');
  check(pctFn(100, 100) === 1, 'percentage: exact match -> 1', pctFn(100, 100));
  check(Math.abs(pctFn(90, 100) - 0.9) < 1e-9, 'percentage: shortage -> 0.9', pctFn(90, 100));
}

/* ══ 4. Registry + nav: new page, own action id, placed after existing groups ══ */
console.log('\n4 — registration, nav group position, authority wiring\n');

const registry = read('Company_TopChemical_Registry.js');
check(/action:\s*'tc_stock_scan',\s*template:\s*'Company_TopChemical_StockScan'/.test(registry),
  'tc_stock_scan registered with template Company_TopChemical_StockScan');

const nav = read('Company_TopChemical_Nav.html');
const idxWarehouseGroup = nav.indexOf("label: 'المخازن'");
const idxLastExistingGroup = nav.indexOf("label: 'شئون العاملين'");
check(idxWarehouseGroup !== -1, "'المخازن' group exists in TOPCHEMICAL_MENU");
check(idxLastExistingGroup !== -1 && idxWarehouseGroup > idxLastExistingGroup,
  "'المخازن' is appended AFTER the existing groups, not first");
check(/action:\s*'tc_stock_scan'/.test(nav), "the new group's item points at action 'tc_stock_scan'");

const scanPage = read('Company_TopChemical_StockScan.html');
check(fs.existsSync(path.join(ROOT, 'Company_TopChemical_StockScan.html')), 'Company_TopChemical_StockScan.html exists');
check(/var IS_SUPER_ADMIN = <\?!= user && user\.isSuperAdmin/.test(scanPage)
  && /var USER_PAGES = <\?!= user && user\.isSuperAdmin/.test(scanPage),
  'the new page sets IS_SUPER_ADMIN/USER_PAGES from the start — the exact gap found on the Valley Foods dashboard (§5)');
check(/CONTAINER_TYPES = \['شيكارة', 'كرتونة', 'برميل', 'بستلة', 'جونية'\]/.test(scanPage),
  'container type is the fixed five-option list (جونية added for the sack container), not free text');
check(/companyCall\('get_stock_scan_options'\)/.test(scanPage) && /companyCall\('get_stock_scan_qty'\)/.test(scanPage)
  && /companyCall\('add_stock_scan'/.test(scanPage),
  'the page calls all three new actions by name');
check(/TCP-/.test(scanPage), "barcode resolution uses the 'TCP-' computed-id convention, matching the print route");

const codeJs = read('Code.js') + '\n' + read('Company_TopChemical_Actions.js');
/* Label printing moved after this run. The scan page's "طباعة باركود الأصناف"
 * printed the whole catalogue, one label per product — not what anyone needs
 * standing at a shelf. It is gone; tc_products now prints a full A4 sheet of
 * ONE product's barcode from a row action, the same 3×6 repeat grid the
 * production barcode print uses. The 'TCP-' + id convention is unchanged, so
 * the scan side of §4 above still holds. */
check(/download === 'print_product_barcode'/.test(codeJs) && /function servePrintProductBarcode_/.test(codeJs),
  'print_product_barcode download route and handler exist');
check(!/print_stock_barcodes/.test(codeJs) && !/servePrintStockBarcodes_/.test(codeJs),
  'the print-every-product route is gone along with the button that was its only caller');
check(!/servePrintProductBarcode_[\s\S]{0,900}top_chemical_barcode_generator/.test(codeJs),
  "the product print route reads the products sheet, not the production barcode table — a separate concept");
check(/for \(let r = 0; r < 6; r\+\+\)[\s\S]{0,80}cell \+ cell \+ cell/.test(codeJs),
  'one product prints as a repeated 3×6 label sheet, matching the production print');

/* The label went name-free: the sticker shows the barcode and its number and
 * nothing else. The document title counts as part of that — a browser printing
 * with headers turned on stamps the title across the top of the paper, which
 * would put the product name back on a sheet meant not to carry it. */
const pbStart = codeJs.indexOf('function servePrintProductBarcode_');
/* The handler is now in the company Actions file, after shared Code.js has
   already defined serveAttachment_. Balance this one function so the test is
   independent of concatenation order and indentation. */
let pbEnd = -1;
if (pbStart !== -1) {
  const open = codeJs.indexOf('{', pbStart);
  let depth = 0;
  for (let i = open; i < codeJs.length; i++) {
    if (codeJs[i] === '{') depth++;
    else if (codeJs[i] === '}') { depth--; if (depth === 0) { pbEnd = i + 1; break; } }
  }
}
check(pbStart !== -1 && pbEnd > pbStart, 'servePrintProductBarcode_ body located');
const pbFn = codeJs.slice(pbStart, pbEnd);
check(!/name_ar/.test(pbFn),
  'the label prints no product name — only the barcode and its number');
/* Load-bearing, and easy to drop as noise: without it the generator draws the
   encoded 'TCP-12' under the bars and the sticker stops being digits-only. */
check(/hidehrt=True/.test(pbFn),
  "the generator's own caption is suppressed, so the only text on the label is the number below it");
check(/const human = String\(id\)/.test(pbFn),
  'the human-readable line under the barcode is the bare id, digits only');
check(/const title = 'باركود الصنف رقم ' \+ id/.test(pbFn),
  'the document title carries no name either, so print headers cannot leak it onto the sheet');
check(/const data = 'TCP-' \+ id/.test(pbFn),
  "the ENCODED value keeps the 'TCP-' namespace — a supplier's numeric barcode must not resolve as one of ours");
check(scanPage.indexOf('raw.match(/^TCP-(') !== -1 && /Number\(raw\)/.test(scanPage),
  'the scanner takes both the namespaced code and a bare number, so printed and typed agree');
check(!/printLabels/.test(scanPage) && !/طباعة باركود الأصناف/.test(scanPage),
  'the scan page no longer carries the print-all-labels button');

const productsPage = read('Company_TopChemical_Products.html');
check(/download=print_product_barcode/.test(productsPage) && /function printProductBarcode/.test(productsPage),
  'tc_products carries the per-product barcode print');
check(/label: 'طباعة باركود'/.test(productsPage),
  'the print is a row action on the product, not a page-level button');

/* ══ 5. Valley Foods dashboard — the nav-visibility gap, fixed ═══════════════ */
console.log('\n5 — Valley Foods dashboard: IS_SUPER_ADMIN/USER_PAGES no longer missing\n');

const vfDash = read('Company_ValleyFoods_Dashboard.html');
check(/var IS_SUPER_ADMIN = <\?!= user && user\.isSuperAdmin/.test(vfDash), 'IS_SUPER_ADMIN is now set');
check(/var USER_PAGES = <\?!= user && user\.isSuperAdmin \? 'null' : JSON\.stringify/.test(vfDash), 'USER_PAGES is now set');

/* Regression guard for the exact class of bug found — scoped to the actual
 * invariant, not "every file with this prefix": a page only NEEDS USER_PAGES
 * if it actually renders a menuGroups header dropdown (UIC.appShell's
 * menuGroupsHtml is what reads window.USER_PAGES to filter it — see
 * UI_Components.html). Pages with no dropdown (print/report views, and every
 * Top Light page — Company_TopLight_Nav.html does not exist, Top Light has no
 * menuGroups system at all) have nothing for the global to gate, so requiring
 * it there would be a false positive, not a real finding. Assessment is
 * excluded outright — a different, unverified auth model; Take.html is a
 * public candidate page by design. */
console.log('\n6 — regression guard: no page with a menuGroups dropdown can silently lose USER_PAGES again\n');

const EXCLUDE = /(_Nav\.html$|_TestData\.html$)/;
['Company_TopChemical_', 'Company_TopLight_', 'Company_ValleyFoods_'].forEach(function (prefix) {
  const files = fs.readdirSync(ROOT).filter(function (f) {
    return f.indexOf(prefix) === 0 && f.endsWith('.html') && !EXCLUDE.test(f);
  });
  check(files.length > 0, prefix + '*.html — at least one page file found (' + files.length + ')');
  const withDropdown = files.filter(function (f) { return /menuGroups\s*:/.test(read(f)); });
  const missing = withDropdown.filter(function (f) { return !/\bUSER_PAGES\s*=/.test(read(f)); });
  check(missing.length === 0,
    prefix + '*.html — every page with a menuGroups dropdown (' + withDropdown.length + ') sets USER_PAGES',
    missing.join(', '));
});

/* ══ 7. addEmpStatus_ — full recompute, not a single trusted row ═══════════ */
console.log('\n7 — addEmpStatus_: recomputes every emp_id from getLatestStatusMap_\n');

const vfActions = read('Company_ValleyFoods_Actions.js') + '\n' + '';
const empFnStart = vfActions.indexOf('function addEmpStatus_');
const empFnBody = empFnStart === -1 ? '' : vfActions.slice(empFnStart, vfActions.indexOf('\n  // ===================== 3)', empFnStart));

check(empFnStart !== -1, 'addEmpStatus_ found');
check(/const statusMap = getLatestStatusMap_\(dbId\);/.test(empFnBody),
  'calls getLatestStatusMap_(dbId) with no cached array — re-reads post-insert, so the new row is included');
check(/for \(var r = 1; r < empData\.length; r\+\+\) \{\s*const eid = String\(empData\[r\]\[empIdIdx\]\);/.test(empFnBody),
  'loops every employee row (not just the one on the submitted record)');
check(!/empSheet\.getRange\(r \+ 1, statusIdx \+ 1\)\.setValue\(statusType\);/.test(empFnBody),
  'no longer writes the just-submitted value directly — writes the recomputed value per employee instead');
check(/console\.error\('addEmpStatus_: status sync failed/.test(empFnBody),
  'a sync failure is now logged, not silently swallowed');

console.log('\n' + (failed === 0 ? 'All checks pass.' : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);

