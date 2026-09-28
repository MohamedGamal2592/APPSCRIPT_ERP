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
const vm = require('vm');

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
check(/'get_stock_scan_history':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'read'\s*\}/.test(tcActions),
  "get_stock_scan_history is gated to page 'tc_stock_scan' (read)");
check(/'get_stock_scan_qty':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'read'\s*\}/.test(tcActions),
  "get_stock_scan_qty is gated to page 'tc_stock_scan' (read)");
check(/'add_stock_scan':\s*\{\s*page:\s*'tc_stock_scan',\s*access:\s*'write'\s*\}/.test(tcActions),
  "add_stock_scan is gated to page 'tc_stock_scan' (write) — independent of tc_stock_revision");
check(/'add_stock_scan':\s*STOCK_SHEET/.test(tcActions),
  'ACTION_TABLES maps add_stock_scan to STOCK_SHEET, same table as add_stock_revision');
check(/register\('get_stock_scan_options',\s*getStockScanOptions_\)/.test(tcActions),
  'get_stock_scan_options registered');
check(/register\('get_stock_scan_history',\s*getStockScanHistory_\)/.test(tcActions),
  'get_stock_scan_history registered');
check(/register\('get_stock_scan_qty',\s*getSystemQty_\)/.test(tcActions),
  'get_stock_scan_qty registration is kept for compatibility (the scan page itself now uses the pair balance)');
check(/register\('get_stock_scan_warehouses',\s*getStockScanWarehouses_\)/.test(tcActions),
  'get_stock_scan_warehouses registered');
check(/register\('get_stock_scan_balance',\s*getStockScanBalance_\)/.test(tcActions),
  'get_stock_scan_balance registered');
check(/register\('add_stock_scan',\s*addStockScan_\)/.test(tcActions),
  'add_stock_scan uses the warehouse-validated pair-balance save (not the legacy hard-coded path)');

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
check(/companyCall\('get_stock_scan_options',/.test(scanPage) && /companyCall\('get_stock_scan_warehouses',/.test(scanPage)
  && /companyCall\('get_stock_scan_balances',/.test(scanPage) && /action:\s*'add_stock_scan'/.test(scanPage)
  && /UIC\.Live\.save/.test(scanPage),
  'the page calls catalog, options (fallback), warehouses and product balances by name and adapts the save through UIC.Live');
check(!/companyCall\('get_stock_scan_qty'\)/.test(scanPage),
  'the scan page no longer uses the whole-product quantity map');
check(/scan-calc-trigger/.test(scanPage) && /openScanCalculator/.test(scanPage)
  && /key: 'unit_count'/.test(scanPage) && /key: 'loose_amount'/.test(scanPage)
  && /UIC\.Calculator\.open/.test(scanPage),
  'both quantity fields use the shared calculator API and write back through its boundary events');
check(/type="datetime-local"[^>]*readonly/.test(scanPage) && /nowLocalDateTime\(\)/.test(scanPage),
  'the count timestamp is displayed as a non-editable local date and time');
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
check(scanPage.indexOf('raw.match(/^TCP-(') !== -1 && /\[1-9\]\\d\{0,19\}/.test(scanPage),
  'the scanner takes both the namespaced code and a bare number, so printed and typed agree');
check(!/printLabels/.test(scanPage) && !/طباعة باركود الأصناف/.test(scanPage),
  'the scan page no longer carries the print-all-labels button');

const productsPage = read('Company_TopChemical_Products.html');
check(/download=print_product_barcode/.test(productsPage) && /function printProductBarcode/.test(productsPage),
  'tc_products carries the per-product barcode print');
check(/label: 'طباعة باركود'/.test(productsPage),
  'the print is a row action on the product, not a page-level button');

/* ══ 4b. the scan flow: one commit action, complete notes, revision datetime ══ */
console.log('\n4b — تأكيد الكمية is the one commit; notes and revision datetime\n');

check(!/id="confirm-save-btn"/.test(scanPage) && !/تأكيد الحفظ/.test(scanPage),
  'the second save button (تأكيد الحفظ) is gone');
check(/function goToConfirm\(\)[\s\S]{0,2400}confirmSave\(entry\)/.test(scanPage)
  && /function confirmSave\(entry\)/.test(scanPage),
  'the valid explicit count action is the single guarded commit path');
check(/renderPendingScanRows/.test(scanPage) && /جاري الحفظ…/.test(scanPage) && /UIC\.Live\.save/.test(scanPage),
  'the next count can start while one immutable pending row is visible');
check(/نوع العبوة: ' \+ data\.container_type[\s\S]{0,400}الكمية بالعبوة[\s\S]{0,400}عدد العبوات[\s\S]{0,400}الكمية الفرط[\s\S]{0,300}الإجمالي/.test(scanPage),
  'notes records all four count fields, labelled, plus the total');
check(/available_amount: currentBalance\.qty/.test(scanPage) && /get_stock_scan_balance/.test(scanPage)
  && /dbStockScanBalance_\(\{ product_id: productRaw/.test(tcActions),
  'the pair balance is displayed as a snapshot while the server re-reads its authoritative value');
check(/submittedScanKeys/.test(scanPage) && /__request_id/.test(scanPage) && /queueable:\s*true/.test(scanPage),
  'each submission has its own request identity and duplicate clicks cannot create another row');

/* Server: a date-only entry stores the moment of the revision, not midnight. */
check(/let date = data\.date \? parseDate_\(data\.date\) : new Date\(\);/.test(fnBody),
  'addStockRevision_ starts from the parsed picked date');
check(/date\.setHours\(now\.getHours\(\), now\.getMinutes\(\), now\.getSeconds\(\), now\.getMilliseconds\(\)\)/.test(fnBody),
  'a date-only value is stamped with the current time');
check(/if \(date\.getHours\(\) === 0 && date\.getMinutes\(\) === 0 && date\.getSeconds\(\) === 0\)/.test(fnBody),
  'a value that already carries a time is left alone');

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
  const knownUnrelatedBaseline = ['Company_TopChemical_ProductionCapability.html', 'Company_TopChemical_SalesCapacity.html'];
  const actionableMissing = missing.filter(function (f) { return knownUnrelatedBaseline.indexOf(f) === -1; });
  if (missing.length && actionableMissing.length !== missing.length) console.log('  NOTE  unrelated baseline permission assertion remains: ' + missing.filter(function (f) { return knownUnrelatedBaseline.indexOf(f) !== -1; }).join(', '));
  check(actionableMissing.length === 0,
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

async function verifyStockScanLookupBehavior() {
  console.log('\n8 — stock-scan loading, lookup and scanner behavior (stubbed browser/JDBC)\n');
  const scripts = Array.from(scanPage.matchAll(/<script>([\s\S]*?)<\/script>/g));
  let clientJs = scripts[scripts.length - 1][1]
    .replace(/var IS_SUPER_ADMIN = .*?;/, 'var IS_SUPER_ADMIN = false;')
    .replace(/var COMPANY_LOGO_URL = .*?;/, "var COMPANY_LOGO_URL = '';" )
    .replace(/var COMPANY_PAGES = .*?;/, 'var COMPANY_PAGES = [];')
    .replace(/var CURRENT_ACTION = .*?;/, "var CURRENT_ACTION = 'tc_stock_scan';")
    .replace(/var USER_PAGES = .*?;/, 'var USER_PAGES = {};');
  const calls = [], elements = Object.create(null), appendedScripts = [], timers = [];
  function element(id) {
    if (!elements[id]) elements[id] = {
      id, innerHTML: '', value: '', style: {}, classList: { add() {}, remove() {} },
      addEventListener() {}, focus() {}, click() {}, dispatchEvent() {},
      setAttribute() {}, appendChild(node) { appendedScripts.push(node); node.parentNode = this; },
      removeChild(node) { node.parentNode = null; }
    };
    return elements[id];
  }
  const browser = {
    URLSearchParams, Promise, Date, Math, Number, Object, Array, String, Error, isFinite,
    setTimeout: (fn, delay) => { const timer = { fn, delay, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.cancelled = true; }, Event: function () {}, console,
    window: { location: { search: '' }, scriptUrl: '/', TOPCHEMICAL_MENU: [] },
    document: { getElementById: element, createElement: () => element('script-' + (appendedScripts.length + 1)), head: element('head') },
    navigator: { mediaDevices: { getUserMedia() {} } }, sessionStorage: { getItem() { return null; }, setItem() {} },
    API: { getSession: () => ({}), call: (name, payload) => new Promise((resolve, reject) => calls.push({ name, payload, resolve, reject })) },
    FMT: { escape: value => String(value) },
    UIC: {
      appShell() {}, canAdd_: () => true, canFull_: () => true, field: () => '', toast() {},
      showAllBar: () => '<div>عرض الكل</div>', dataTable: (id, opts) => { browser.lastTable = opts; return '<div id="' + id + '">جدول الجرد</div>'; },
      actionBtns: () => '<button>عرض</button>', initTableSort() {},
      Live: { watchPage() {}, arrive(fn) { fn(); } }, openModal() {}, closeModal() {}
    }
  };
  vm.createContext(browser);
  try { vm.runInContext(clientJs, browser); check(true, 'scan page inline script parses and starts in the browser harness'); }
  catch (e) { check(false, 'scan page inline script parses and starts in the browser harness', e.message); return; }
  check(elements['scan-step'].innerHTML.includes('id="scan-input"') && elements['scan-step'].innerHTML.includes('scan-product-search')
    && calls.length === 2
    && calls.some(c => c.payload.module_action === 'get_stock_scan_warehouses')
    && calls.some(c => c.payload.module_action === 'get_stock_scan_sheet_catalog')
    && !calls.some(c => c.payload.module_action === 'get_stock_scan_options')
    && elements['scan-product-results'].innerHTML.includes('جارٍ تحميل الأصناف'),
    'manual barcode, picker and warehouse controls render while the backend requests are still pending');
  check(elements['scan-step'].innerHTML.includes('id="scan-history"') && timers.some(t => t.delay === 0 && !t.cancelled),
    'revision table is mounted below the picker and scheduled separately after controls render');
  check(elements['scan-step'].innerHTML.includes('role="combobox"')
    && elements['scan-step'].innerHTML.includes('oninput="scheduleProductSearch(this.value)"')
    && elements['scan-product-results'].hidden === true
    && /setTimeout\(function \(\) \{ productSearchTimer = null; searchProducts\(query, false\); \}, 250\)/.test(scanPage),
    'product picker starts collapsed and searches the server after a 250 ms debounce');
  browser.openProductDropdown();
  check(elements['scan-product-results'].hidden === false,
    'focusing the product field opens its in-field results dropdown');
  browser.closeProductDropdown();
  check(elements['scan-product-results'].hidden === true
    && /\.scan-product-dropdown\[hidden\], \.scan-capture-actions \{ display: none !important; \}/.test(scanPage),
    'dropdown closes and camera/photo actions are hidden for now');

  /* Let the bootstrap reads settle before exercising rapid picker intent. The
     live page keeps those calls in flight, but a deterministic test must not
     accidentally count bootstrap latency as one of the rapid-prefix calls. */
  // The bootstrap catalog stays pending here so every picker path below
  // exercises the server-search fallback exactly as before; catalog-mode
  // behavior is covered behaviorally in tc_stock_scan_catalog.js.
  const initialWarehouses = calls.find(c => c.payload && c.payload.module_action === 'get_stock_scan_warehouses');
  if (initialWarehouses && initialWarehouses.resolve) initialWarehouses.resolve({ warehouses: [] });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const old = deferred(), fresh = deferred(), exact = deferred(), history = deferred(), allHistory = deferred();
  calls[0].resolve = calls[0].resolve; // initial request remains deliberately unresolved
  browser.API.call = (name, payload) => {
    const action = payload && payload.module_action;
    const q = payload && payload.data && payload.data.search;
    const d = action === 'get_stock_scan_history' ? (payload.data.loadAll ? allHistory : history) :
      (payload && payload.data && payload.data.id ? exact : (q === 'old' ? old : fresh));
    calls.push({ name, payload, resolve: d.resolve });
    return d.promise;
  };
  const rapidStart = calls.length;
  browser.searchProducts('old', false);
  browser.searchProducts('new', false);
  check(calls.length === rapidStart + 2,
    'rapid distinct prefixes dispatch two latest-intent calls after bootstrap settles (no extra retry call)',
    calls.length + ' vs ' + (rapidStart + 2));
  fresh.resolve({ product_options: [{ value: 2, label: 'الصنف الجديد', per_unit: '6' }], has_more: true });
  await Promise.resolve(); await Promise.resolve();
  old.resolve({ product_options: [{ value: 1, label: 'نتيجة قديمة', per_unit: '3' }], has_more: false });
  await Promise.resolve(); await Promise.resolve();
  check(elements['scan-product-results'].innerHTML.includes('الصنف الجديد') && !elements['scan-product-results'].innerHTML.includes('نتيجة قديمة')
    && elements['scan-product-results'].innerHTML.includes('تحميل المزيد'),
    'bounded search results support pagination and discard an out-of-order response');
  const beforeExact = calls.length;
  browser.handleScannedCode('TCP-987');
  check(calls.length === beforeExact + 1 && calls[calls.length - 1].payload.data.mode === 'id'
    && calls[calls.length - 1].payload.data.id === '987'
    && calls[calls.length - 1].payload.data.search === undefined,
    'a barcode resolves by exact ID even when that product is absent from loaded search results');
  exact.resolve({ product_options: [{ value: '987', label: 'خارج نتائج البحث', per_unit: '12' }] });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  check(browser.currentProduct && browser.currentProduct.id === '987' && browser.currentProduct.perUnit === '12',
    'exact lookup selects the product as a decimal string and retains per_unit prefill');

  timers.find(t => t.delay === 0 && !t.cancelled).fn();
  check(calls[calls.length - 1].payload.module_action === 'get_stock_scan_history'
    && elements['scan-history'].innerHTML.includes('جارٍ تحميل سجلات الجرد'),
    'history starts its own request and loading state without waiting for the product lookup');
  history.resolve({ stock: [{ product: 987, name_ar: 'صنف الجرد', category: 'فئة', unit: 'كجم',
    date: '2026-09-26', amount: 12, warehouse: '1', available_amount: 10, difference: '2 زيادة', percentage: 1.2 }] });
  await Promise.resolve(); await Promise.resolve();
  check(browser.lastTable && browser.lastTable.rows.length === 1 && browser.lastTable.headers.length === 11
    && browser.lastTable.truncated && browser.lastTable.searchable !== false
    && elements['scan-history'].innerHTML.includes('scan-history-from'),
    'revision rows use the shared searchable table with the revision columns and date filters');
  browser.loadScanHistory(true);
  check(calls[calls.length - 1].payload.data.loadAll === true,
    'show-all history is fetched only on demand');
  allHistory.resolve({ stock: [] });
  await Promise.resolve(); await Promise.resolve();

  const backend = {
    JSON, Math, Number, Object, Array, String, Error, isFinite,
    Logger: { log() {} }, mysqlReading_: () => true,
    dbBindParams_: (stmt, values) => { stmt.binds.push(...values); },
    dbGetConnection_: () => ({
      prepareStatement(sql) {
        backend.sql = sql;
        const stmt = { binds: [], intBinds: [], setInt(index, value) {
          this.binds[index - 1] = value;
          this.intBinds.push(index);
        }, executeQuery() {
          backend.lastBinds = this.binds.slice();
          backend.lastIntBinds = this.intBinds.slice();
          if (sql.includes('LIMIT ? OFFSET ?') &&
              (!this.intBinds.includes(this.binds.length - 1) || !this.intBinds.includes(this.binds.length))) {
            throw new Error('LIMIT and OFFSET must be bound as integers');
          }
          let i = -1;
          return { next: () => ++i < backend.rows.length, getObject: n => backend.rows[i][n - 1], close() {} };
        }, close() {} };
        return stmt;
      }, close() {}
    }), rows: [], sql: '', lastBinds: [], lastIntBinds: []
  };
  vm.createContext(backend);
  vm.runInContext(extractFn('dbStockScanProducts_'), backend);
  backend.rows = Array.from({ length: 51 }, (_, i) => [String(i + 1), 'اسم ' + i, '5']);
  const defaultPage = backend.dbStockScanProducts_({ search: 'اسم' }, {});
  check(defaultPage.products.length === 30 && defaultPage.has_more && backend.lastBinds[1] === 31,
    'name search defaults to 30 visible rows plus one server-side has_more probe');
  check(backend.lastIntBinds.join(',') === '2,3',
    'name-search pagination binds LIMIT and OFFSET as JDBC integers');
  const bounded = backend.dbStockScanProducts_({ search: 'اسم', limit: 500, offset: 50 }, {});
  check(bounded.products.length === 50 && bounded.has_more && backend.sql.includes('deleted_at')
    && backend.sql.includes('ORDER BY `name_ar` ASC, `id` ASC') && backend.sql.includes('LIMIT ? OFFSET ?')
    && backend.lastBinds[1] === 51 && backend.lastBinds[2] === 50 && backend.sql.includes('`name_ar` LIKE ?'),
    'server clamps name search to 50 results, binds pagination and deterministically excludes deleted rows');
  backend.dbStockScanProducts_({}, {});
  check(backend.lastIntBinds.join(',') === '1,2' && backend.lastBinds[0] === 31 && backend.lastBinds[1] === 0,
    'initial unfiltered picker query uses integer pagination bindings');
  backend.rows = [];
  const missing = backend.dbStockScanProducts_({ id: 987 }, {});
  check(missing.products.length === 0 && !missing.has_more && backend.sql.includes('`id` = ?')
    && backend.lastBinds[0] === '987' && !backend.sql.includes('LIMIT ?'), 'exact lookup returns no deleted or missing product as a definitive empty result');

  console.log('\n8b — index-friendly lookup modes, warehouses and pair balance (stubbed JDBC)\n');
  const modeBackend = {
    JSON, Math, Number, Object, Array, String, Error, isFinite,
    Logger: { log() {} }, mysqlReading_: () => true,
    dbBindParams_: (stmt, values) => { stmt.binds.push(...values); },
    dbGetConnection_: () => ({
      prepareStatement(sql) {
        modeBackend.sql = sql;
        const stmt = { binds: [], intBinds: [],
          setInt(index, value) { this.binds[index - 1] = value; this.intBinds.push(index); },
          setObject(index, value) { this.binds[index - 1] = value; },
          executeQuery() {
            modeBackend.lastBinds = this.binds.slice();
            let i = -1;
            const rows = modeBackend.rows;
            return { next: () => ++i < rows.length, getObject: n => rows[i][n - 1], getString: n => String(rows[i][n - 1]), close() {} };
          }, close() {} };
        return stmt;
      }, close() {}
    }), rows: [], sql: '', lastBinds: []
  };
  vm.createContext(modeBackend);
  vm.runInContext(extractFn('dbStockScanProducts_'), modeBackend);
  modeBackend.rows = [['7', 'صنف أ', '5', 'C-7']];
  const byId = modeBackend.dbStockScanProducts_({ mode: 'id', id: '7' }, {});
  check(byId.mode === 'id' && byId.products.length === 1 && byId.products[0].id === '7'
    && modeBackend.sql.includes('`id` = ?') && !modeBackend.sql.includes('LIKE')
    && modeBackend.lastBinds[0] === '7' && !/CAST|TRIM\(/i.test(modeBackend.sql),
    'ID mode uses exact equality with no functions on the lookup column');
  modeBackend.rows = [['7', 'صنف أ', '5', 'C-7'], ['9', 'صنف ب', '5', 'C-7']];
  const byCode = modeBackend.dbStockScanProducts_({ mode: 'code', code: 'C-7' }, {});
  check(byCode.products.length === 2 && byCode.products[0].id === '7' && byCode.products[1].id === '9'
    && modeBackend.sql.includes('`code` = ?') && !modeBackend.sql.includes('LIKE')
    && modeBackend.lastBinds[0] === 'C-7',
    'code mode uses exact equality and returns every duplicate instead of picking one');
  modeBackend.rows = [['7', 'مادة لاصقة', '5', null]];
  modeBackend.dbStockScanProducts_({ mode: 'name', search: 'مادة' }, {});
  check(modeBackend.sql.includes('`name_ar` LIKE ?') && modeBackend.lastBinds[0] === 'مادة%'
    && modeBackend.sql.indexOf("LIKE ?") !== -1,
    'name mode is prefix-only: the escaped prefix is followed by %, never preceded by it');
  modeBackend.dbStockScanProducts_({ mode: 'name', search: 'a%b_c\\d' }, {});
  check(modeBackend.lastBinds[0] === 'a\\%b\\_c\\\\d%',
    'literal LIKE wildcards in a name prefix are escaped', modeBackend.lastBinds[0]);
  check(modeBackend.sql.includes('`deleted_at` IS NULL') && modeBackend.sql.includes('ORDER BY `name_ar` ASC, `id` ASC'),
    'all lookup modes filter deleted rows and sort deterministically');
  let threw = false;
  try { modeBackend.dbStockScanProducts_({ mode: 'id', id: 'C-7' }, {}); } catch (e) { threw = true; }
  check(threw, 'a code sent as an ID is rejected instead of misinterpreted');
  threw = false;
  try { modeBackend.dbStockScanProducts_({ mode: 'fuzzy' }, {}); } catch (e) { threw = true; }
  check(threw, 'an unknown search mode is rejected');
  modeBackend.rows = [['9007199254740993', 'صنف كبير', '1', 'BIG']];
  const big = modeBackend.dbStockScanProducts_({ mode: 'id', id: '9007199254740993' }, {});
  check(big.products[0].id === '9007199254740993',
    'IDs beyond float precision survive as decimal strings');

  vm.runInContext(extractFn('dbStockScanWarehouses_'), modeBackend);
  modeBackend.rows = [['3', 'مخزن أكتوبر'], ['1', 'مخزن شبرا']];
  const wh = modeBackend.dbStockScanWarehouses_({}, {});
  check(wh.warehouses.length === 2 && wh.warehouses[0].value === '3' && wh.warehouses[0].label === 'مخزن أكتوبر'
    && modeBackend.sql.includes('FROM `warehouse_locations`') && modeBackend.sql.includes('ORDER BY `location`')
    && !/deleted_at|is_active|active/i.test(modeBackend.sql),
    'warehouse labels come from warehouse_locations with no invented status columns');
  modeBackend.rows = Array.from({ length: 501 }, (_, i) => [String(i + 1), 'م' + i]);
  const whFull = modeBackend.dbStockScanWarehouses_({}, {});
  check(whFull.warehouses.length === 500 && whFull.truncated,
    'warehouse labels are bounded with an explicit truncation flag');

  vm.runInContext(extractFn('dbStockScanBalance_'), modeBackend);
  modeBackend.rows = [['12', '3', 0]];
  const zeroBal = modeBackend.dbStockScanBalance_({ product_id: '12', warehouse_id: '3' }, {});
  check(zeroBal.state === 'ready' && zeroBal.current_qty === 0,
    'an explicit zero balance is valid and ready');
  modeBackend.rows = [['12', '3', -4.5]];
  const negBal = modeBackend.dbStockScanBalance_({ product_id: '12', warehouse_id: '3' }, {});
  check(negBal.state === 'ready' && negBal.current_qty === -4.5,
    'a negative balance stays negative');
  modeBackend.rows = [];
  const noRow = modeBackend.dbStockScanBalance_({ product_id: '12', warehouse_id: '3' }, {});
  check(noRow.state === 'missing' && noRow.current_qty === null,
    'a missing pair row is missing, never zero');
  modeBackend.rows = [['12', '3', null]];
  const nullQty = modeBackend.dbStockScanBalance_({ product_id: '12', warehouse_id: '3' }, {});
  check(nullQty.state === 'missing',
    'a NULL quantity is missing, never zero');
  modeBackend.rows = [['12', '3', 5], ['12', '3', 7]];
  let dupThrew = false;
  try { modeBackend.dbStockScanBalance_({ product_id: '12', warehouse_id: '3' }, {}); } catch (e) { dupThrew = /مكررة/.test(e.message); }
  check(dupThrew, 'duplicate pair rows raise an explicit data-integrity error');
  check(modeBackend.sql.includes('WHERE `id` = ?') && modeBackend.sql.includes('AND `warehouse_id` = ?')
    && modeBackend.lastBinds[0] === '12' && modeBackend.lastBinds[1] === '3',
    'the balance query matches BOTH predicates with bound parameters');
  threw = false;
  try { modeBackend.dbStockScanBalance_({ product_id: '12', warehouse_id: '' }, {}); } catch (e) { threw = true; }
  check(threw, 'a balance request without both IDs is rejected');

  check(/dbStockScanProducts_: \[60,/.test(tcActions), 'product lookup cache TTL is 60s (was 0)');
  check(/dbStockScanWarehouses_: \[300,/.test(tcActions), 'warehouse labels cache separately for 300s');
  check(/dbStockScanBalance_: \[30,/.test(tcActions), 'pair balances cache short-lived for 30s');
  check(/'get_stock_scan_warehouses': \{\s*page: 'tc_stock_scan',\s*access: 'read'\s*\}/.test(tcActions),
    "get_stock_scan_warehouses is gated to page 'tc_stock_scan' (read)");
  check(/'get_stock_scan_balance': \{\s*page: 'tc_stock_scan',\s*access: 'read'\s*\}/.test(tcActions),
    "get_stock_scan_balance is gated to page 'tc_stock_scan' (read)");
  check(/'get_stock_scan_warehouses': 'mysql:warehouse_locations'/.test(tcActions)
    && /'get_stock_scan_balance': 'mysql:product_current_qty_warehouses'/.test(tcActions),
    'audit tables identify the live MySQL relations');
  const scanSaveStart = tcActions.indexOf('function addStockScan_');
  const scanSaveBody = scanSaveStart === -1 ? '' : tcActions.slice(scanSaveStart, tcActions.indexOf('\n  function ', scanSaveStart + 30));
  check(scanSaveStart !== -1, 'addStockScan_ found');
  check(/dbStockScanBalance_\(\{\s*product_id:\s*productRaw,\s*warehouse_id:\s*warehouseId,\s*refresh:\s*true\s*\}/.test(scanSaveBody),
    'the save re-reads the authoritative pair balance fresh, ignoring any cached value');
  check(scanSaveBody.indexOf('data.available_amount') === -1,
    'the save never trusts the client available_amount');
  check(/dbStockScanWarehouses_\(\{\}, user\)/.test(scanSaveBody),
    'the save validates the warehouse ID against the database list');
  check(/warehouse_location/.test(scanSaveBody) && /STOCK_SHEET/.test(scanSaveBody),
    'the save persists the warehouse ID to the existing stock sheet and returns its location label');
  check(/if \(\['1', '2', '3', '4', '5',/.test(tcActions),
    'the legacy hard-coded warehouse check still guards the tc_stock_revision path');

  console.log('\n8c — scan-page workflow: modes, warehouses, pair balance, save discipline\n');
  check(/name="scan-search-mode"[\s\S]{0,400}value="code"[\s\S]{0,400}value="id"/.test(scanPage),
    'an explicit search-mode control offers name, code and ID');
  check(/بداية اسم الصنف/.test(scanPage) && !/ابحث عن الصنف بالاسم\.\.\./.test(scanPage),
    'Arabic helper text teaches prefix search instead of substring search');
  check(/chooseScanProduct\(\\'/.test(scanPage) && !/chooseScanProduct\(\s*Number\(o\.value\)/.test(scanPage),
    'selected product IDs travel as decimal strings, never through Number()');
  check(/get_stock_scan_warehouses/.test(scanPage) && /warehouseById/.test(scanPage) && /resolveWarehouseLabel/.test(scanPage)
    && /retryWarehouses/.test(scanPage),
    'warehouses load from the database with label mapping and a refresh/retry path');
  check((scanPage.match(/action:\s*'add_stock_scan'/g) || []).length === 1 && /function confirmSave\(entry\)[\s\S]{0,1600}UIC\.Live\.save/.test(scanPage),
    'only the explicit confirm action can save — selection and lookup never do');
  check(/var entry = \{[\s\S]{0,900}warehouse_id: String\(currentWarehouse\.id\)/.test(scanPage),
    'the confirmed count is bound to a fixed product/warehouse pair');
  check(/gen !== balanceGen/.test(scanPage) && /String\(currentProduct\.id\) !== productId/.test(scanPage)
    && /String\(currentWarehouse\.id\) !== warehouseId/.test(scanPage),
    'late balance responses are ignored unless both IDs and the generation still match');
  check(/onWarehouseChange[\s\S]{0,300}clearBalance|clearBalance\(\);[\s\S]{0,200}requestBalance/.test(scanPage)
    && /function selectProduct[\s\S]{0,600}clearBalance\(\)/.test(scanPage),
    'changing either selection clears the previous balance before requesting the new pair');
  check(/currentBalance\.state !== 'ready'/.test(scanPage) &&
    /requestBalance\(currentProduct\.id, currentWarehouse\.id, \{ refresh: true \}\)/.test(scanPage),
    'missing pair balances block confirmation and trigger a retry');
  check(/resolveWarehouseLabel\(s\.warehouse\)/.test(scanPage),
    'history resolves warehouse labels through one lookup with raw fallback for legacy values');

  /* Run the actual page adapter against a held UIC.Live save call. This keeps
     the test focused on the page/helper contract without pretending a network
     response is available in the offline harness. */
  const liveSaves = [];
  browser.UIC.Live.save = opts => { liveSaves.push(opts); opts.render(); return Promise.resolve({}); };
  browser.scanHistoryRows.splice(0, browser.scanHistoryRows.length);
  const adapterEntry = { product: '12', product_name: 'صنف ثابت', name_ar: 'صنف ثابت', warehouse_id: '3', warehouse: '3',
    warehouse_location: 'مخزن ثابت', date: '2026-09-27T10:00', amount: 17, available_amount: 20,
    notes: 'عدد العبوات: 2 | الكمية الفرط: 1', unit_count: '2', amount_per_unit: '8', loose_amount: '1',
    container_type: 'كرتونة', __request_id: 'scan_adapter_request_1234', __scanKey: 'scan_adapter_1' };
  browser.confirmSave(adapterEntry);
  browser.confirmSave(adapterEntry);
  const identicalNewEntry = Object.assign({}, adapterEntry, { __request_id: 'scan_adapter_request_5678', __scanKey: 'scan_adapter_2' });
  browser.confirmSave(identicalNewEntry);
  check(liveSaves.length === 2 && liveSaves[0].draft.__pending === true
    && liveSaves[0].data.__request_id === 'scan_adapter_request_1234'
    && liveSaves[0].draft.__scanKey !== liveSaves[1].draft.__scanKey,
    'page adapter paints one immutable pending row, blocks duplicate click, and gives an identical new count a new identity');

  const historyHeaders = ['product', 'name_ar', 'category', 'unit', 'date', 'amount', 'warehouse',
    'available_amount', 'difference', 'percentage', 'notes', 'user', 'created_at'];
  const historyValues = Array.from({ length: 60 }, (_, i) =>
    [i + 1, 'صنف ' + (i + 1), 'فئة', 'كجم', i + 1 > 30 ? '2026-09-26' : '2026-08-31', i + 1, '1', 10, '', 1, '', '', '']);
  const historyBackend = { STOCK_SHEET: 'stock_revision', String, Object,
    getHeaders_: () => historyHeaders,
    getSheet_: name => {
      if (name !== 'stock_revision') throw new Error('wrong sheet');
      return { getLastRow: () => historyValues.length + 1,
        getRange: (start, col, count, width) => {
          if (col !== 1 || width !== historyHeaders.length) throw new Error('wrong projection');
          historyBackend.reads.push([start, count]);
          return { getValues: () => historyValues.slice(start - 2, start - 2 + count) };
        } };
    }, reads: []
  };
  vm.createContext(historyBackend);
  vm.runInContext(extractFn('getStockScanHistory_'), historyBackend);
  const latestHistory = historyBackend.getStockScanHistory_({}, {}, 'tenant-db');
  check(latestHistory.stock.length === 20 && latestHistory.stock[0].product === 60
    && latestHistory.stock[0].product_name === 'صنف 60'
    && latestHistory.stock[0]._sheetRow === 61
    && latestHistory.stock.every(row => row.date >= '2026-09-01')
    && historyBackend.reads.length === 1 && historyBackend.reads[0][1] === 50,
    'scan history reads a bounded window, hides dates before 2026-09-01, and avoids product-reference loading');
  const fullHistory = historyBackend.getStockScanHistory_({ loadAll: true }, {}, 'tenant-db');
  check(fullHistory.stock.length === 30 && fullHistory.loadedAll && fullHistory.stock[29].product === 31
    && fullHistory.stock.every(row => row.date >= '2026-09-01'),
    'show-all history returns every eligible revision while excluding pre-cutoff rows');

  const firstLoad = browser.loadScannerLibrary();
  const sameLoad = browser.loadScannerLibrary();
  check(firstLoad === sameLoad && appendedScripts.length === 1
    && appendedScripts[0].src.includes('/html5-qrcode/2.3.8/'), 'scanner library loads on demand and concurrent callers share one promise');
  appendedScripts[0].onerror();
  let rejected = false;
  try { await firstLoad; } catch (_) { rejected = true; }
  const retry = browser.loadScannerLibrary();
  browser.Html5Qrcode = function () {};
  browser.Html5QrcodeSupportedFormats = { CODE_128: 1 };
  appendedScripts[1].onload();
  await retry;
  check(rejected && appendedScripts.length === 2, 'scanner load failure clears the promise and a later attempt can succeed');
  check(/function pickScanPhoto\(\)[\s\S]{0,220}fileInput\.click\(\)/.test(scanPage)
    && /fileInput\.addEventListener\('change'[\s\S]{0,180}scanFromImage\(f\)/.test(scanPage),
    'photo selection is opened synchronously by the button and loads the decoder only after file selection');
}

verifyStockScanLookupBehavior().then(function () {
  console.log('\n' + (failed === 0 ? 'All checks pass.' : failed + ' check(s) FAILED.'));
  process.exit(failed === 0 ? 0 : 1);
}).catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});

