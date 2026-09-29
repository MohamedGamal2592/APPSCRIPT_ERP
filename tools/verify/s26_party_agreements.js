/**
 * S26 verification — vf_parties كشف حساب: factory/agreements/packaging
 * sections + valley_manufacturing_agreements persistence + balance-once.
 *
 * Offline, over the real source. No network, no spreadsheet, no Google service.
 *
 *   node tools/verify/s26_party_agreements.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ACTIONS = read('Company_ValleyFoods_Actions.js');
const PAGE = read('Company_ValleyFoods_Parties.html');

let failed = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) failed++;
}
function section(t) { console.log('\n' + t); }

/* ── 1. Persistence contract ── */
section('1. valley_manufacturing_agreements sheet + statuses');
ok(/const MFG_AGREE_SHEET = 'valley_manufacturing_agreements'/.test(ACTIONS),
  'sheet is named valley_manufacturing_agreements');
ok(/const MFG_AGREE_HEADERS = \['unique_id','id','client_id','product_id','qty','unit_price','total','status','created_by','created_at','updated_by','updated_at','cancelled_by','cancelled_at'\]/.test(ACTIONS),
  'headers store client/product/qty/price/status/creator/cancellation audit/timestamps');
ok(/settingsEnsureSheet_\(dbId, MFG_AGREE_SHEET, MFG_AGREE_HEADERS\)/.test(ACTIONS),
  'sheet is created on first use via the project convention');
ok(/'save_valley_mfg_agreement': \{ page: 'vf_parties', access: 'write' \}/.test(ACTIONS) &&
   /'cancel_valley_mfg_agreement': \{ page: 'vf_parties', access: 'write' \}/.test(ACTIONS),
  'both actions gated on vf_parties / write in PAGE_ACCESS');
ok(/'save_valley_mfg_agreement': 'valley_manufacturing_agreements'/.test(ACTIONS) &&
   /'cancel_valley_mfg_agreement': 'valley_manufacturing_agreements'/.test(ACTIONS),
  'both actions mapped to the sheet in ACTION_TABLES');
ok(/ValleyFoods\.register\('save_valley_mfg_agreement', saveValleyMfgAgreement_\)/.test(ACTIONS) &&
   /ValleyFoods\.register\('cancel_valley_mfg_agreement', cancelValleyMfgAgreement_\)/.test(ACTIONS),
  'both handlers registered on the dispatcher');

/* ── 2. Statement integration: partition + additive response ── */
section('2. statement split: factory 4/23 vs packaging, no duplicates');
ok(/stock_factory_rows/.test(ACTIONS) && /stock_packaging_rows/.test(ACTIONS),
  'statement returns both partition arrays');
ok(/if \(r\.category === '4' \|\| r\.category === '23'\) stockFactoryRows\.push\(r\);/.test(ACTIONS),
  'category IDs 4 and 23 route to the factory section');
ok(/else stockPackagingRows\.push\(r\);/.test(ACTIONS),
  'every remaining category routes to packaging (a partition: no product twice)');
ok(/stock_rows: stockRows,/.test(ACTIONS),
  'legacy stock_rows shape is kept alongside the split');
ok(/product_id: pid,/.test(ACTIONS) && /category: meta\.category,/.test(ACTIONS),
  'stock rows carry product_id + category for the split');
ok(/agreements: mfgAgreements\.list,/.test(ACTIONS) &&
   /agreements_subtotal: mfgAgreements\.subtotal,/.test(ACTIONS) &&
   /client_products: clientProducts/.test(ACTIONS),
  'statement derives agreements, subtotal and the client-scoped selector options');
ok(/category: meta\.category \|\| ''/.test(ACTIONS),
  'client_products include category for factory-only filtering');

/* ── 3. Server validation ── */
section('3. save/cancel validation + audit');
ok(/mfgAgreeCheckProduct_\(dbId, clientId, productId\)/.test(ACTIONS),
  'product ownership is re-checked server-side');
ok(/if \(String\(found\.client_id[^)]*\)\.trim\(\) !== String\(clientId\)\) \{\s*\n?\s*throw new Error\('الصنف لا يتبع هذا العميل'\)/.test(ACTIONS),
  'cross-client product submissions are rejected');
ok(/if \(q <= 0\) throw new Error\('الكمية يجب أن تكون أكبر من صفر'\)/.test(ACTIONS),
  'non-positive quantities are rejected');
ok(/if \(pr < 0\) throw new Error\('السعر لا يمكن أن يكون سالباً'\)/.test(ACTIONS),
  'negative prices are rejected');
ok(/!isFinite\(q\) \|\| !isFinite\(pr\)/.test(ACTIONS),
  'malformed (non-finite) quantity/price values are rejected');
ok(/var total = mfgAgreeRound2_\(money\.qty \* money\.unit_price\);/.test(ACTIONS),
  'line totals are calculated server-side (qty 3dp, money 2dp)');
ok(/يوجد اتفاق مطابق بالفعل لهذا الصنف/.test(ACTIONS),
  'exact active duplicates are rejected (double-submit guard)');
ok(/(?:patchRowByCriteria_|updateRowByCriteria_)\(sheet, 'unique_id', uid, (?:updates|map)\)/.test(ACTIONS),
  'edits are idempotent updates keyed by unique_id');
ok(/status: 'cancelled', updated_by: actor, updated_at: new Date\(\), cancelled_by: actor, cancelled_at: new Date\(\)/.test(ACTIONS),
  'cancel preserves the row with cancelling user + time (audit, no hard delete)');
ok(!/deleteRowsByCriteria_\(getSheet_\(MFG_AGREE_SHEET/.test(ACTIONS) &&
   !/deleteRowsWhereIn_\(sheet, 'unique_id'/.test(ACTIONS.replace(/deleteRowsWhereIn_\(sheetWC[\s\S]*?;/g, '')),
  'no hard-delete path touches the agreements sheet');
ok(/السجل ملغي ولا يمكن تعديله/.test(ACTIONS),
  'cancelled rows are immutable');

/* ── 4. Balance-once ── */
section('4. subtotal derived, added exactly once, never stored');
ok(/if \(mfgAgreeAffectsBalance_\(r\.status\)\) subtotal \+= mfgAgreeRound2_\(r\.qty \* r\.unit_price\);/.test(ACTIONS),
  'subtotal = SUM(qty x unit_price) over balance-affecting rows only');
ok(/return s === 'active' \|\| s === 'completed';/.test(ACTIONS),
  'active (+future completed) affect balance; draft/cancelled do not');
ok(/STMT_NET = running;/.test(PAGE),
  'modal stores the pristine ledger net per render');
ok(/var final = adjusted - sub;/.test(PAGE),
  'final = adjusted - subtotal (agreements increase customer debt), recomputed (never accumulated)');
ok(!/STMT_NET \+=/.test(PAGE) && !/agreements_subtotal \+=/.test(PAGE) &&
   !/STMT\.agreements_subtotal \+=/.test(PAGE),
  'no accumulation operators on the net or the subtotal across re-renders');

/* ── 5. Modal sections in order + agreement ergonomics ── */
section('5. modal: factory, agreements, packaging — in order');
/* Runtime order comes from the container assembly: factory block, the
   agreements placeholder (filled by renderAgreementsSection), packaging
   block — the agreements header itself lives in its own render function. */
const iF = PAGE.indexOf("'stock-price-f-', 'st-stock-factory-table'");
const iA = PAGE.indexOf("'<div id=\"st-agree\"></div>'");
const iP = PAGE.indexOf("'stock-price-p-', 'st-stock-packaging-table'");
ok(PAGE.includes('مخزون في المصنع') && PAGE.includes('اتفاقات تحت التصنيع') &&
   PAGE.includes('مخزون التعبئة والتغليف والأدوات'),
  'all three section titles exist');
ok(iF !== -1 && iA !== -1 && iP !== -1 && iF < iA && iA < iP,
  'sections render in order: factory, agreements, packaging');
ok(/STMT\.client_products \|\| \[\]/.test(PAGE),
  'product selector is fed by the client-scoped server options');
ok(/agreeFactoryProducts/.test(PAGE) && /category.*4.*23/.test(PAGE),
  'agreements product list is filtered to factory categories 4 and 23');
ok(/UIC\.combo\(\{.*key: 'agr-prod-' \+ i/.test(PAGE),
  'product selector uses searchable UIC.combo');
ok(/wireAgreeCombos/.test(PAGE),
  'combo change events are wired after render');
ok(/<span id="agr-unit-' \+ i \+ '">/.test(PAGE),
  'unit cell is a read-only span, autofilled from the selected product');
ok(/agreeOnProduct/.test(PAGE) && /AGREE_UNITS\[String\(pid\)\]/.test(PAGE),
  'changing the product autofills its unit');
ok(/agreeRecalcRow/.test(PAGE) && /parseFloat\(q\.value\) \|\| 0\) : 0\) \* \(p \?/.test(PAGE),
  'row total = qty x unit_price, live in the row');
ok(/agreeAddRow/.test(PAGE) && /agreeSaveRow/.test(PAGE) && /agreeCancelRow/.test(PAGE),
  'add / save / cancel-remove row actions exist');
ok(/openStatement\(pid\) \{/.test(PAGE) &&
   /companyCall\('get_valley_party_statement', \{ id: pid \}\)/.test(PAGE),
  'saved agreements reload from the server on every modal open');
ok(/AGREE_SAVING/.test(PAGE) && /if \(!r \|\| AGREE_SAVING\) return;/.test(PAGE),
  'single-flight save blocks duplicate submissions client-side');
ok(/document\.getElementById\('st-stock'\) \? document\.getElementById\('st-stock'\)\.outerHTML : ''/.test(PAGE),
  'print includes the inventory + agreements + final-balance sections');

/* ── 6. Logic mirrors: partition, subtotal, exactly-once ── */
section('6. executable mirrors of the shipped logic');
function partition(rows) {
  const f = [], p = [];
  rows.forEach((r) => {
    if (String(r.category) === '4' || String(r.category) === '23') f.push(r); else p.push(r);
  });
  return { f, p };
}
const fixture = [
  { product_id: '1', category: '4' }, { product_id: '2', category: '23' },
  { product_id: '3', category: '5' }, { product_id: '4', category: '' },
  { product_id: '5', category: '4' },
];
const part = partition(fixture);
ok(part.f.length === 3 && part.p.length === 2, '4/23 vs rest splits 5 rows into 3 + 2');
ok(new Set([...part.f, ...part.p].map((r) => r.product_id)).size === 5,
  'partitioned rows cover every product exactly once');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const affects = (s) => s === 'active' || s === 'completed';
function subtotal(rows) {
  let s = 0;
  rows.forEach((r) => { if (affects(r.status)) s += round2(r.qty * r.unit_price); });
  return round2(s);
}
const agreeFixture = [
  { status: 'active', qty: 10, unit_price: 2.5 },
  { status: 'draft', qty: 100, unit_price: 100 },
  { status: 'cancelled', qty: 50, unit_price: 50 },
  { status: 'completed', qty: 3, unit_price: 1.115 },
  { status: 'active', qty: 1.2345, unit_price: 2 },
];
ok(subtotal(agreeFixture) === round2(25 + round2(3 * 1.115) + round2(1.2345 * 2)),
  'draft + cancelled excluded; active + completed included with money rounding, got ' + subtotal(agreeFixture));
function finalOnce(net, stock, sub) { return (net - stock) - sub; }
const r1 = finalOnce(1000, 200, 50);
const r2 = finalOnce(1000, 200, 50);
ok(r1 === 750 && r2 === 750 && r1 === r2,
  'repeated renders derive the same final (750): no double-count, got ' + r1 + '/' + r2);

function factoryProducts(products) {
  return products.filter(function (o) { var c = String(o.category || ''); return c === '4' || c === '23'; });
}
const prodFixture = [
  { value: '1', label: 'A', category: '4' },
  { value: '2', label: 'B', category: '5' },
  { value: '3', label: 'C', category: '23' },
  { value: '4', label: 'D', category: '' },
];
const fp = factoryProducts(prodFixture);
ok(fp.length === 2 && fp[0].value === '1' && fp[1].value === '3',
  'factory filter keeps category 4 and 23, drops rest');

console.log(failed === 0 ? '\nS26 OK — party agreements verified, offline.' : '\nS26 FAILED');
process.exit(failed === 0 ? 0 : 1);
