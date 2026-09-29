/**
 * S5c (U-46) — the sales audit.
 *
 * The owner asked for cost stripping in "purchasing, sales and manufacturing".
 * Manufacturing (S5a) and purchasing (S5b) both needed work. This script is the
 * evidence for the third: sales exposes NO cost of its own, so there is nothing
 * to strip there beyond the shared batch endpoint already handled in S5a.
 *
 * It also keeps a regression guard for the pre-existing sales-save defect: the current
handler must remain executable and the stock-authority fixture must continue to pass.
 *
 * Run: node tools/verify/s5c_sales_audit.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const SALES = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Sales.html'), 'utf8');
const LINES = SRC.split('\n');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

/** Body of a top-level (2-space indented) function in the file. */
function bodyOf(name) {
  const starts = [];
  LINES.forEach((l, i) => { const m = l.match(/^  function ([A-Za-z0-9_]+)\s*\(/); if (m) starts.push([m[1], i]); });
  const at = starts.findIndex(s => s[0] === name);
  if (at === -1) throw new Error('function not found: ' + name);
  const from = starts[at][1];
  const to = at + 1 < starts.length ? starts[at + 1][1] : LINES.length;
  return { text: LINES.slice(from, to).join('\n'), from: from + 1, to: to };
}

/* Keys that would be a COST leaking to a sales client. Invoice values —
   product_price, المبلغ الصافي, قيمة الضريبة, إجمالي, valley_return_value — are
   deliberately NOT in this list: they are what the customer is billed, not what
   the goods cost, and hiding them would make the sales module unusable while
   answering a question the owner did not ask. */
const COST_KEYS = ['unit_cost', 'cost_unit', 'work_center_cost', 'purchase_unit_cost',
  'line_material_cost', 'total_inventory_cost', 'total_other_cost', 'total_batch_cost',
  'by_product_nrv_value', 'other_cost', 'total_cost'];

const SALES_READS = [
  'getValleySalesBootstrap_',
  'getValleySalesList_',
  'getValleySalesPage_',
  'getValleyInvoiceLines_',
  'getValleyInvoiceFull_',
  'getValleyReturnsList_',
  'getValleyInvoiceForReturn_'
];

console.log('S5c — every sales read endpoint, audited for cost keys\n');
SALES_READS.forEach(fn => {
  const b = bodyOf(fn);
  /* Only look at keys the function PROJECTS into its response, i.e. `key:` in
     an object literal, plus any raw-row pass-through. */
  const projected = COST_KEYS.filter(k => new RegExp('(^|[^\\w.])' + k + '\\s*:').test(b.text));
  check(projected.length === 0, fn + ' projects no cost key  [' + b.from + '-' + b.to + ']',
    'found: ' + projected.join(', '));
});

console.log('\nS5c — the raw-row endpoints return sheets that have no cost column\n');
/* getValleySalesList_ and getValleyInvoiceFull_ pass whole invoice rows through,
   so the invoice sheet's own header list is the thing to check. */
const invHdr = SRC.match(/FIN_SALES_INV_HEADERS\s*=\s*\[([\s\S]*?)\]/);
const invCols = invHdr ? invHdr[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : [];
const invCost = invCols.filter(c => COST_KEYS.indexOf(c) !== -1);
check(invCost.length === 0, 'valley_sales_invoices has no cost column', invCost.join(', '));

const lineHdr = SRC.match(/FIN_SALES_LINE_HEADERS\s*=\s*\[([\s\S]*?)\]/);
const lineCols = lineHdr ? lineHdr[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : [];
const lineCost = lineCols.filter(c => COST_KEYS.indexOf(c) !== -1);
check(lineCost.length === 0, 'valley_sales_products has no cost column', lineCost.join(', '));
console.log('        invoice line columns: ' + lineCols.join(', '));

/* The batch-allocation sheet, ensured inline in saveValleyInvoice_. */
const allocHdr = SRC.match(/settingsEnsureSheet_\(dbId, 'valley_sales_product_stock',\s*\n?\s*\[([^\]]*)\]/);
const allocCols = allocHdr ? allocHdr[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')) : [];
check(allocCols.length > 0 && allocCols.filter(c => COST_KEYS.indexOf(c) !== -1).length === 0,
  'valley_sales_product_stock has no cost column');
console.log('        allocation columns: ' + allocCols.join(', '));

console.log('\nS5c — the one cost path into sales, and why it is safe\n');
check(SALES.indexOf('unit_cost: batches[i].unit_cost || 0') !== -1,
  'the sales page reads unit_cost from get_valley_product_batches (stripped in S5a)');
const salesCostLines = SALES.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(p => /cost/i.test(p[1]));
check(salesCostLines.length === 1,
  'and that is the ONLY line mentioning cost in the whole sales page — sales displays none',
  'lines: ' + salesCostLines.map(p => p[0]).join(', '));
check(/a\.cost_unit = batchCurrent\[buid\]/.test(SRC),
  'saveValleyInvoice_ resolves allocation cost server-side, ignoring the payload');
check(allocCols.indexOf('unit_cost') === -1 && allocCols.indexOf('cost_unit') === -1,
  'so a stripped unit_cost in the payload cannot wipe anything — the sheet stores no cost');

/* ── U-48 — behavioral regression for the current sales-save path ───────── */
console.log('\nS5c — U-48: the historical undeclared `outputs` assertion is obsolete\n');
{
  const b = bodyOf('saveValleyInvoice_');
  const uses = (b.text.match(/(^|[^\w.])outputs\b/gm) || []).length;
  check(uses === 0,
    'saveValleyInvoice_ has no undeclared `outputs` reference in the current source',
    'references: ' + uses);

  /* The sales-save behavior is exercised by the existing stock-authority
   * fixture, which loads the real handler guards and compares available stock,
   * held-this-document stock, FIFO order and insufficient-stock rejection. It
   * is a behavioral check, not a second implementation hidden in this audit. */
  try {
    execFileSync(process.execPath, [path.join(__dirname, 's25_stock_authority.js')], { stdio: 'pipe' });
    check(true, 'the sales-save stock/cost authority regression fixture passes');
  } catch (e) {
    const detail = String(e.stdout || e.stderr || '').split('\n').slice(-8).join(' ');
    check(false, 'the sales-save stock/cost authority regression fixture passes', detail);
  }
}
console.log('\n' + (failed === 0
  ? 'S5c OK — sales exposes no cost of its own; nothing to strip. U-48 recorded.'
  : 'S5c FAILED: ' + failed));
process.exit(failed === 0 ? 0 : 1);


