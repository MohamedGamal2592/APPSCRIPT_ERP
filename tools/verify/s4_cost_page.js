/**
 * S4 verification (U-46) — valley_cost_view is registered as a permission
 * token: grantable, but never navigable.
 *
 * Run: node tools/verify/s4_cost_page.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failed = 0;
const check = (ok, label, extra) => {
  if (!ok) { failed++; console.log('  FAIL  ' + label); if (extra) console.log('        ' + extra); }
  else console.log('  PASS  ' + label);
};

/* Evaluate the registry's pages array for real, by stubbing registerCompany_. */
const REG = read('Company_ValleyFoods_Registry.js');
let captured = null;
const sandbox = {
  ValleyFoods: { dispatch_: function () {}, pageForAction_: function () {}, tableForAction_: function () {} },
  registerCompany_: function (key, cfg) { captured = cfg; },
  console
};
vm.createContext(sandbox);
vm.runInContext(REG + '\nregisterValleyFoods_();', sandbox, { filename: 'Company_ValleyFoods_Registry.js' });

console.log('S4 — the registry entry\n');
check(!!captured, 'registerValleyFoods_ ran');
const pages = (captured && captured.pages) || [];
const tok = pages.filter(p => p.action === 'valley_cost_view');
check(tok.length === 1, 'valley_cost_view registered exactly once', 'found ' + tok.length);

const p = tok[0] || {};
check(p.nav === false, 'nav: false — never appears in a menu');
check(!p.template, 'no template — not a routable page');
check(p.permissionOnly === true, 'flagged permissionOnly');
check(typeof p.label === 'string' && /[؀-ۿ]/.test(p.label), 'has an Arabic label: ' + p.label);
check(typeof p.title === 'string' && /[؀-ۿ]/.test(p.title), 'has an Arabic title: ' + p.title);

/* It must be last, so it can never be picked as a landing page even if the
   template guard were ever removed. */
check(pages[pages.length - 1].action === 'valley_cost_view',
  'registered last in the pages array');

console.log('\nS4 — no other page entry lost its template\n');
const templateless = pages.filter(x => !x.template).map(x => x.action);
check(templateless.length === 1 && templateless[0] === 'valley_cost_view',
  'valley_cost_view is the only template-less entry',
  'template-less: [' + templateless.join(', ') + ']');
/* 31 real pages + valley_cost_view. Bumped from 30 when vf_warehouse_movement
   was registered, again when vf_cash_expenses was, again for vf_sales_print,
   again for vf_cash_incomes, again for vf_sales_report, and again for
   vf_purchasing_report — this line is a running total, not an assertion about
   the permission token — the check that matters is the template-less one above. */
check(pages.length === 37, 'page count is 36 + 1 = 37', 'got ' + pages.length);

console.log('\nS4 — the two guards that make it unroutable\n');
const CODE = read('Code.js');
check(CODE.indexOf('getAllPages_().find(p => p.action === action && p.template)') !== -1,
  'Code.js router ignores template-less entries (bounces home)');
const SEC = read('03_Security.js');
check(/if \(!pages\[i\]\.template\) continue;/.test(SEC),
  'getFirstAuthorizedPageForUser_ skips template-less entries');

console.log('\nS4 — nav construction still excludes it\n');
/* Reproduce Code.js's companyPages filter over the real entries. */
const navPages = pages.filter(x => x.nav !== false).map(x => x.action);
check(navPages.indexOf('valley_cost_view') === -1, 'not in the nav list');
console.log('        nav pages: [' + navPages.join(', ') + ']');

console.log('\nS4 — it reaches the admin page list (so the owner can grant it)\n');
/* adminListPages_ maps getAllPages_() -> {page_id, title, label}. */
const adminRow = { page_id: p.action, title: p.title || p.action, label: p.label || '' };
check(adminRow.page_id === 'valley_cost_view' && !!adminRow.title,
  'adminListPages_ would surface it as: ' + JSON.stringify(adminRow));

console.log('\n' + (failed === 0
  ? 'S4 OK — grantable in the admin UI, invisible to nav, unroutable.'
  : 'S4 FAILED: ' + failed));
process.exit(failed === 0 ? 0 : 1);
