/**
 * Box analysis — wiring and the access gate.
 *
 *   node tools/verify/box_wiring.js
 *
 * The page exposes fraud analysis over named employees AND an edit form over
 * financial rows, so it has to FAIL CLOSED: a user with no explicit grant sees
 * nothing, and a super admin is the only exception. That property is not
 * implemented by anything this run wrote — it falls out of two pieces of the
 * existing platform:
 *
 *   guard_(user, action) in Company_TopChemical_Actions.js does
 *       const req = PAGE_ACCESS[action];
 *       if (!req) return;                      // <- UNLISTED = UNGUARDED
 *   so an action that is not in PAGE_ACCESS is open to any authenticated user
 *   of the company. Being listed is the whole gate.
 *
 *   checkPageAccessForUI_ gates the route and the nav on unifiedCheck_, which
 *   returns false for a user with no grant on the page.
 *
 * So the thing worth asserting is not "the guard works" — it is "we are
 * actually inside the guard". This checks that, and that no second permission
 * mechanism was invented beside it.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); };

const ACTIONS = read('Company_TopChemical_Actions.js');
const REGISTRY = read('Company_TopChemical_Registry.js');
const NAV = read('Company_TopChemical_Nav.html');
const SECURITY = read('03_Security.js');

const PAGE = 'tc_box_analysis';
const TEMPLATE = 'Company_TopChemical_BoxAnalysis';
const READERS = ['get_box_analysis', 'get_box_item_history'];
const WRITERS = ['update_box_movement', 'revise_box_movement'];
const ALL = READERS.concat(WRITERS);

let failures = 0;
function ok(cond, label, extra) {
  if (cond) return true;
  failures++;
  console.log('  FAIL  ' + label + (extra !== undefined ? '  — ' + extra : ''));
  return false;
}

/* ── 1. Every action is INSIDE the guard ─────────────────────────────────── */
console.log('the guard — an unlisted action is an unguarded action');
READERS.forEach(function (a) {
  ok(ACTIONS.indexOf("'" + a + "': { page: '" + PAGE + "', access: 'read' }") !== -1,
    a + ' is in PAGE_ACCESS with read');
});
WRITERS.forEach(function (a) {
  ok(ACTIONS.indexOf("'" + a + "': { page: '" + PAGE + "', access: 'write' }") !== -1,
    a + ' is in PAGE_ACCESS with write');
});

/* The early return that makes the above load-bearing. If this shape ever
   changes, the comment above is wrong and so is the reasoning. */
ok(/const req = PAGE_ACCESS\[action\];\s*\n\s*if \(!req\) return;/.test(ACTIONS),
  'guard_ still returns early for an action it does not find (so listing IS the gate)');

/* ── 2. Every action is registered, and dispatch reaches it through guard_ ── */
console.log('registration');
ALL.forEach(function (a) {
  ok(new RegExp("register\\('" + a + "',").test(ACTIONS), a + ' is registered');
  ok(ACTIONS.indexOf("'" + a + "': 'mysql:regular_box_movement'") !== -1,
    a + " logs its table as 'mysql:regular_box_movement'");
});
ok(/function dispatch_\([\s\S]{0,300}?guard_\(user, action\);/.test(ACTIONS),
  'dispatch_ still calls guard_ before the action');

/* ── 3. No second permission mechanism ────────────────────────────────────
 * The wrappers must not roll their own check. Two gates that can disagree is
 * worse than one gate, because the loose one is the one that decides. */
console.log('one gate, not two');
const boxStart = ACTIONS.indexOf('function getBoxAnalysis_');
const boxEnd = ACTIONS.indexOf("register('revise_box_movement'");
ok(boxStart !== -1 && boxEnd > boxStart, 'the box wrapper block is found');
const BOX = ACTIONS.slice(boxStart, boxEnd);
['unifiedCheck_', 'canCompanyAction_', 'isSuperAdmin', 'authorizedPages'].forEach(function (sym) {
  ok(BOX.indexOf(sym) === -1, 'the box wrappers do not call ' + sym + ' themselves');
});
ok(BOX.indexOf('dbGuard_') === -1,
  'the box wrappers do not call dbGuard_ (page authority already applied, as clients_AR does it)');

/* ── 4. The route gate has no exemption for this page ─────────────────────
 * checkPageAccessForUI_ hard-allows a few page ids before it consults grants.
 * This page must not be one of them, now or after some future edit. */
console.log('no route exemption');
const gate = SECURITY.slice(SECURITY.indexOf('function checkPageAccessForUI_'),
  SECURITY.indexOf('function getFirstAuthorizedPageForUser_'));
ok(gate.indexOf(PAGE) === -1, PAGE + ' is not hard-allowed in checkPageAccessForUI_');
ok(/if \(authUser\.isSuperAdmin\) return true;/.test(gate),
  'super admin is still the only blanket exception');
ok(/unifiedCheck_\(authUser, authUser\.company, pageId, 'read'\)/.test(gate),
  'every other user needs a read grant on the page id');

/* This page is the DELIBERATE OPPOSITE of valley_cost_view. That one is a
   permission token: no template, unroutable, and the page it guards still
   renders for a user without it — costs are simply hidden. This one is a real
   page that exposes fraud analysis about named employees and an edit form over
   financial rows, so absence of a grant has to mean absence of the page. The
   contrast is asserted rather than described, so that if someone later gives
   valley_cost_view a template the difference stops being silent. */
const VF_REGISTRY = read('Company_ValleyFoods_Registry.js');
const vfLine = (VF_REGISTRY.match(/^.*action: 'valley_cost_view'.*$/m) || [''])[0];
ok(vfLine !== '', 'valley_cost_view is still in the ValleyFoods registry');
ok(vfLine.indexOf('template:') === -1,
  'valley_cost_view still has NO template — it is a token, not a page', vfLine.trim());
ok(new RegExp("action: '" + PAGE + "'[^}]*template:").test(REGISTRY),
  PAGE + ' by contrast HAS a template and is routable');

/* ── 5. Registry and nav ─────────────────────────────────────────────────── */
console.log('registry and nav');
ok(new RegExp("action: '" + PAGE + "', template: '" + TEMPLATE + "'").test(REGISTRY),
  PAGE + ' is registered against ' + TEMPLATE);
ok(new RegExp("action: '" + PAGE + "'[^}]*nav: false").test(REGISTRY),
  PAGE + " carries nav: false (it is reached from the Nav.html group, not the auto nav)");

const groupRe = /\{ label: 'تحليلات النظام الرئيسي', items: \[([\s\S]*?)\] \}/;
const group = NAV.match(groupRe);
ok(!!group, 'the تحليلات النظام الرئيسي nav group is present');
if (group) {
  const items = (group[1].match(/action: '(\w+)'/g) || []).map(function (s) { return s.slice(9, -1); });
  ok(items.length === 2, 'the group now has two items', items.join(', '));
  ok(items.indexOf('tc_main_review') !== -1, 'the existing item is still there');
  ok(items.indexOf(PAGE) !== -1, 'the new item is beside it');
}

/* ── 6. The existing page is untouched ───────────────────────────────────── */
console.log('tc_main_review is untouched');
[
  "'get_main_review': { page: 'tc_main_review', access: 'read' }",
  "'revise_main_review': { page: 'tc_main_review', access: 'write' }",
  "'get_main_review': 'mysql:clients_AR'",
  "register('get_main_review', getMainReview_);",
  "register('revise_main_review', reviseMainReview_);"
].forEach(function (needle) {
  ok(ACTIONS.indexOf(needle) !== -1, 'still present: ' + needle.slice(0, 56));
});
ok(REGISTRY.indexOf("action: 'tc_main_review', template: 'Company_TopChemical_MainReview'") !== -1,
  'the tc_main_review registry entry is unchanged');

/* ── 7. Three queries per page load, and none inside a loop ──────────────── */
console.log('the query budget');
const getter = ACTIONS.slice(ACTIONS.indexOf('function getBoxAnalysis_'),
  ACTIONS.indexOf('function getBoxItemHistory_'));
['dbBoxList_(', 'dbBoxAccountAggregates_(', 'boxAccountLabels_('].forEach(function (call) {
  const n = (getter.split(call).length - 1);
  ok(n === 1, 'getBoxAnalysis_ calls ' + call + ') exactly once', 'found ' + n);
});
/* No connector call may appear inside a forEach/for over the rows. */
const loops = getter.match(/rows\.forEach\(function[\s\S]*?\n    \}\);/g) || [];
loops.forEach(function (body, i) {
  ok(!/db[A-Z]\w+_\(/.test(body), 'row loop ' + (i + 1) + ' issues no query');
});
ok(getter.indexOf('BoxEngine.parseDetails') !== -1,
  'parsing happens server-side, where the engine actually lives');

console.log(failures === 0
  ? '\nAll wiring checks pass.'
  : '\n' + failures + ' wiring check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
