/**
 * RV-1.1 — defect regression guard for getValleyInvoiceForReturn_.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * It is an EXECUTABLE CONTRACT REGRESSION TEST: it reads the real source files,
 * extracts the two required regions, executes real assertions over them and exits
 * non-zero on any violation. It protects the fix from being silently undone and
 * protects the client/server field contract from drifting apart.
 *
 * It is NOT a VM harness: it does not boot the Apps Script module or execute the
 * handler. No VM scaffolding exists for VF server actions (gasstub.js loads
 * Code.js only; s11_sales_returns.js is a page harness), so the RV-1.1 Change
 * Record marks "VM harness or staging result" as NOT RUN and the step stays open.
 *
 * The defect it guards (Company_ValleyFoods_Actions.js, getValleyInvoiceForReturn_):
 *   invInfo = { uid: uid, ... }   // `uid` declared nowhere -> ReferenceError
 *                                 // swallowed by `catch (e) {}`  -> invInfo null
 *   -> the returns banner rendered three dashes instead of number/client/date.
 *
 * Run: node tools/verify/rv11_invoice_return_contract.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
/* RV11_SERVER lets this guard be pointed at a historical copy of the file, so the
 * guard itself can be proven to catch the defect it exists for:
 *   git show 815c6c7^:Company_ValleyFoods_Actions.js > old.js
 *   RV11_SERVER=old.js node tools/verify/rv11_invoice_return_contract.js   # must FAIL
 */
const SERVER = process.env.RV11_SERVER
  ? path.resolve(process.env.RV11_SERVER)
  : path.join(ROOT, 'Company_ValleyFoods_Actions.js');
const CLIENT = path.join(ROOT, 'Company_ValleyFoods_SalesReturns.html');

const server = fs.readFileSync(SERVER, 'utf8');
const client = fs.readFileSync(CLIENT, 'utf8');

/* ── 1. isolate the handler region, from its declaration to its return ─────── */
const startMarker = 'function getValleyInvoiceForReturn_(';
const start = server.indexOf(startMarker);
assert.ok(start !== -1, 'getValleyInvoiceForReturn_ must exist in ' + path.basename(SERVER));

const returnMarker = "return { status: 'success', invoice: invInfo";
const returnAt = server.indexOf(returnMarker, start);
assert.ok(returnAt !== -1, 'the handler must return the invoice envelope');

const body = server.slice(start, returnAt + returnMarker.length);

/* ── 2. the defect must not come back ──────────────────────────────────────── */
assert.ok(
  !/(^|[^_\w])uid:\s*uid\s*,/.test(body),
  'RV-1.1 regression: `uid: uid,` (an unresolved reference) is present again'
);

/* ── 3. the fix must be present, and must use the function\'s own local ────── */
assert.ok(/uid:\s*invUid\s*,/.test(body), 'invInfo.uid must be built from invUid');
assert.ok(
  /var\s+invUid\s*=/.test(body),
  'invUid must remain the handler\'s local invoice identity'
);

/* ── 4. the four contract fields must all be constructed ───────────────────── */
const requiredFields = ['uid', 'number', 'client_name', 'date_display'];
const missingInvoices = requiredFields.filter(function (f) {
  return !new RegExp('\\b' + f + ':').test(body);
});
assert.deepStrictEqual(
  missingInvoices,
  [],
  'invInfo must construct every field the client reads; missing: ' + missingInvoices.join(', ')
);

/* ── 5. the missing-invoice path must still degrade to the existing fallback ─ */
assert.ok(
  /invoice:\s*invInfo\s*\|\|\s*\{[^}]*uid:\s*invUid[^}]*\}/.test(server.slice(start, start + body.length + 400)),
  'the null-invoice fallback must remain `invInfo || { uid: invUid, number: \'-\' }`'
);

/* ── 6. the client must genuinely consume those fields (the reason it matters) */
const clientFields = ['number', 'client_name', 'date_display'];
const unconsumed = clientFields.filter(function (f) {
  return !new RegExp('res\\.invoice[^;]{0,200}' + f).test(client) &&
         !new RegExp('\\(\\s*res\\.invoice\\s*\\|\\|\\s*\\{\\}\\s*\\)\\.' + f).test(client);
});
assert.deepStrictEqual(
  unconsumed,
  [],
  'the Sales Returns banner must read these fields from res.invoice; not found: ' + unconsumed.join(', ')
);

/* ── 7. the Arabic source headers the projection depends on must be present ── */
['رقم الفاتورة', 'اسم العميل', 'تاريخ الفاتورة'].forEach(function (h) {
  assert.ok(body.indexOf(h) !== -1, 'the projection must read the source header ' + h);
});

console.log('rv11_invoice_return_contract: PASS');
console.log('  server region: ' + body.split('\n').length + ' lines');
console.log('  fields asserted: ' + requiredFields.join(', '));
console.log('  client fields asserted: ' + clientFields.join(', '));
console.log('  NOTE: static contract regression only; VM harness/staging = NOT RUN');
