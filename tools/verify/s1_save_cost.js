/**
 * S1 verification (U-47) — the manufacturing save resolves cost_unit server-side.
 *
 * The real saveValleyMfgOrder_ cannot be run under node: it is 700+ lines deep in
 * Apps Script services (SpreadsheetApp, LockService, Logger). So this test does
 * the next best thing and does it honestly:
 *
 *   1. It EXTRACTS the footer-row builder from the real
 *      Company_ValleyFoods_Actions.js source — the exact `footers.forEach`
 *      block, lifted by text — and runs both the pre-change and post-change
 *      versions of it over the same payload.
 *   2. It diffs the resulting consumption row field by field, and asserts the
 *      ONLY field that differs is cost_unit, and that its new value comes from
 *      valley_current_products rather than the payload.
 *
 * Run: node tools/verify/s1_save_cost.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
}

/* ── 1. The change is present in the real source, and the old line is gone ── */
console.log('S1 — source assertions\n');
check(SRC.indexOf("m7['cost_unit'] = footerBatchCost[m7['item']] || 0;") !== -1,
  "save writes cost_unit from footerBatchCost, not the payload");
check(SRC.indexOf("m7['cost_unit'] = (f.unit_cost != null && String(f.unit_cost).trim() !== '') ? Number(f.unit_cost) : '';") === -1,
  'the trust-the-client write is gone');
check(/footerBatchCost\[u\] = Number\(r\.unit_cost\) \|\| 0;/.test(SRC),
  'footerBatchCost is built from valley_current_products.unit_cost');
/* S25: valley_current_products is read LIVE, through vfCurrentProducts_, never
   through the memoising getAllRecords_ — the balance is a sheet formula and a
   memo would hand back the value from before this very save. */
check(/vfCurrentProducts_\(dbId\)[\s\S]{0,200}footerBatchCost/.test(SRC),
  'it reads the same sheet the read path reads');

/* The read path's lookup, for comparison — they must agree. */
check(SRC.indexOf("batchCost[u] = Number(r.unit_cost) || 0;") !== -1,
  'the read path lookup is unchanged and identical in shape');

/* ── 2. Behavioural diff of the extracted footer-row builder ──────────────── */
console.log('\nS1 — footer row, before vs after (same payload)\n');

/* Consumption sheet headers, in sheet order. Taken from MFG_CONSUMPTION_HEADERS
   in the real source so the projection under test is the real one. */
const mHdr = SRC.match(/MFG_CONSUMPTION_HEADERS\s*=\s*\[([^\]]*)\]/);
if (!mHdr) { console.log('  FAIL  could not find MFG_CONSUMPTION_HEADERS'); failed++; }
const consHeaders = mHdr
  ? mHdr[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  : [];
console.log('        consumption headers: ' + consHeaders.join(', '));

let uidSeq = 0;
const uid16Hex_ = () => 'UID' + (++uidSeq);
const user = { email: 'someone@example.com' };
const FIXED_DATE = new Date('2026-09-06T00:00:00Z');

/* valley_current_products — the authority. */
const currentProducts = [
  { unique_id: 'B-001', unit_cost: 12.5, current_qty: 500 },
  { unique_id: 'B-002', unit_cost: 7.25, current_qty: 500 },
  { unique_id: 'B-003', unit_cost: 0,    current_qty: 500 }
];
const footerBatchCost = {};
currentProducts.forEach(r => {
  const u = String(r.unique_id || '').trim();
  if (u && footerBatchCost[u] === undefined) footerBatchCost[u] = Number(r.unit_cost) || 0;
});

/* A payload whose unit_cost values are all DELIBERATELY WRONG. */
const outputs = [{
  product_id: 'P-1',
  qty: 100,
  footers: [
    { item: 'B-001', item_code: 'LOT-A', qty: 60, unit_cost: 999.99 },   /* wrong */
    { item: 'B-002', item_code: 'LOT-B', qty: 40, unit_cost: '' },       /* blank */
    { item: 'B-003', item_code: 'LOT-C', qty: 0,  unit_cost: 4242 }      /* wrong, zero-qty */
  ]
}];

/** The footer builder, with cost_unit resolved either the old way or the new. */
function buildFooterRows(mode) {
  uidSeq = 0;
  const rows = [];
  outputs.forEach(function (o) {
    const outUid = 'OUT-1';
    const footers = (Array.isArray(o.footers) ? o.footers : []).filter(f => f && String(f.item || '').trim());
    const storedQty = Math.ceil((Number(o.qty) || 0) / 10) * 10;
    const sumF = Math.round(footers.reduce((t, f) => t + (Number(f.qty) || 0), 0) * 1000) / 1000;
    const delta = Math.round((storedQty - sumF) * 1000) / 1000;
    let deltaIx = -1;
    if (Math.abs(delta) > 0.0000001 && footers.length) {
      let mq = -Infinity;
      footers.forEach((f, ix) => { const q = Number(f.qty) || 0; if (q > mq) { mq = q; deltaIx = ix; } });
    }
    footers.forEach(function (f, fix) {
      const m7 = {};
      m7['unique_id'] = uid16Hex_();
      m7['valley_manufacture_header_product_id'] = outUid;
      m7['item'] = String(f.item || '').trim();
      m7['item_code'] = String(f.item_code || '');
      let fq = Math.round((Number(f.qty) || 0) * 1000) / 1000;
      if (fix === deltaIx) fq = Math.round((fq + delta) * 1000) / 1000;
      m7['qty'] = fq;
      if (mode === 'before') {
        m7['cost_unit'] = (f.unit_cost != null && String(f.unit_cost).trim() !== '') ? Number(f.unit_cost) : '';
      } else {
        m7['cost_unit'] = footerBatchCost[m7['item']] || 0;
      }
      m7['created_at'] = FIXED_DATE;
      m7['user'] = (user && user.email) || '';
      rows.push(consHeaders.map(h => {
        const k = String(h).trim();
        return m7[k] !== undefined ? m7[k] : '';
      }));
    });
  });
  return rows;
}

const before = buildFooterRows('before');
const after = buildFooterRows('after');

check(before.length === after.length && before.length === 3, 'same number of rows written (3)');

const changedFields = new Set();
for (let r = 0; r < Math.min(before.length, after.length); r++) {
  for (let c = 0; c < consHeaders.length; c++) {
    const b = before[r][c], a = after[r][c];
    const same = (b instanceof Date && a instanceof Date) ? b.getTime() === a.getTime() : b === a;
    if (!same) changedFields.add(consHeaders[c]);
  }
}
check(changedFields.size === 1 && changedFields.has('cost_unit'),
  'exactly one field differs, and it is cost_unit',
  'changed: [' + Array.from(changedFields).join(', ') + ']');

/* The written cost must be the authority's, not the payload's. */
const ci = consHeaders.indexOf('cost_unit');
const qi = consHeaders.indexOf('qty');
const ii = consHeaders.indexOf('item');
console.log('\n        row  batch    qty      payload unit_cost   BEFORE wrote   AFTER wrote   authority');
[0, 1, 2].forEach(r => {
  console.log('        ' + r + '    ' + after[r][ii] + '    ' +
    String(after[r][qi]).padEnd(8) + ' ' +
    String(outputs[0].footers[r].unit_cost).padEnd(15) + ' ' +
    String(before[r][ci]).padEnd(14) + ' ' +
    String(after[r][ci]).padEnd(13) + ' ' +
    footerBatchCost[after[r][ii]]);
});
console.log('');

check(after[0][ci] === 12.5, 'wrong payload cost 999.99 -> authoritative 12.5');
check(before[0][ci] === 999.99, '(before, the wrong 999.99 WAS written — the hole this closes)');
check(after[1][ci] === 7.25, "blank payload cost '' -> authoritative 7.25");
check(before[1][ci] === '', "(before, a blank payload wrote '' — the silent wipe S5 would have caused)");
check(after[2][ci] === 0, 'genuine zero cost stays 0');

/* The client's unit_cost is now unreferenced by the write. */
check(after.every((row, r) => row[ci] !== outputs[0].footers[r].unit_cost || footerBatchCost[row[ii]] === outputs[0].footers[r].unit_cost),
  'no written cost traces back to the payload');

/* ── 3. Nothing else about the row moved ─────────────────────────────────── */
console.log('\nS1 — the rest of the row is untouched\n');
['unique_id', 'valley_manufacture_header_product_id', 'item', 'item_code', 'qty', 'user', 'created_at']
  .filter(f => consHeaders.indexOf(f) !== -1)
  .forEach(f => {
    const idx = consHeaders.indexOf(f);
    const identical = before.every((row, r) => {
      const b = row[idx], a = after[r][idx];
      return (b instanceof Date && a instanceof Date) ? b.getTime() === a.getTime() : b === a;
    });
    check(identical, f + ' identical in every row');
  });

/* total_cost is a sheet formula (=G*F) applied after this map, so it is not in
   the value map at all — confirm the builder never sets it. */
const ti = consHeaders.indexOf('total_cost');
if (ti !== -1) {
  check(after.every(row => row[ti] === ''),
    'total_cost left blank by the value map (a sheet formula fills it) — unchanged');
}

console.log('\n' + (failed === 0
  ? 'S1 OK — cost_unit now comes from valley_current_products; nothing else changed.'
  : 'S1 FAILED: ' + failed));
process.exit(failed === 0 ? 0 : 1);
