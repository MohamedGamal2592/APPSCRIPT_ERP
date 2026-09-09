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
/* get_box_alerts and save_box_item_alias are ADDITIONS to the four actions the
   plan's wiring step names. The alerts tab needs a wider population than the
   50-row page load (Benford alone is gated at 300 amounts), and the merge/split
   control of plan §5.3 has to persist a correction somewhere. Both are listed
   in PAGE_ACCESS like the rest, which is what puts them inside the guard. */
const READERS = ['get_box_analysis', 'get_box_item_history', 'get_box_alerts'];
const WRITERS = ['update_box_movement', 'revise_box_movement', 'save_box_item_alias'];
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
});
/* The five that touch the table say so; the alias store is a Drive file and
   records that honestly rather than naming a table that does not exist. */
ALL.filter(function (a) { return a !== 'save_box_item_alias'; }).forEach(function (a) {
  ok(ACTIONS.indexOf("'" + a + "': 'mysql:regular_box_movement'") !== -1,
    a + " logs its table as 'mysql:regular_box_movement'");
});
ok(ACTIONS.indexOf("'save_box_item_alias': 'drive:Box_Analysis_Audit/box_item_aliases.json'") !== -1,
  'save_box_item_alias logs the Drive file it actually writes');
ok(/function dispatch_\([\s\S]{0,300}?guard_\(user, action\);/.test(ACTIONS),
  'dispatch_ still calls guard_ before the action');

/* ── 3. No second permission mechanism ────────────────────────────────────
 * The wrappers must not roll their own check. Two gates that can disagree is
 * worse than one gate, because the loose one is the one that decides. */
console.log('one gate, not two');
const boxStart = ACTIONS.indexOf('function getBoxAnalysis_');
const boxEnd = ACTIONS.indexOf("register('get_box_analysis'");
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
  ok(items.length === 3, 'the group now has three items (tc_main_review + tc_client_balance_sheets + tc_box_analysis)', items.join(', '));
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

/* ── 8. The template the registry points at actually exists ──────────────
 * A registry entry naming a template that is not there gives a user who
 * clicks the nav item a server error, not a page. */
console.log('the template exists');
ok(fs.existsSync(path.join(ROOT, TEMPLATE + '.html')), TEMPLATE + '.html is present');
const PAGE_SRC = fs.existsSync(path.join(ROOT, TEMPLATE + '.html')) ? read(TEMPLATE + '.html') : '';
ok(/<div id="tc-root" dir="rtl">/.test(PAGE_SRC), 'the page has an RTL root');
ok(PAGE_SRC.indexOf("UIC.appShell('tc-root'") !== -1, 'the page renders through UIC.appShell');
ok(PAGE_SRC.indexOf("include('UI_Components')") !== -1, 'the page includes the shared component layer');
ok(/CAN_WRITE = UIC\.canAdd_\(\)/.test(PAGE_SRC), 'the page reads its write grant from UIC.canAdd_');
ok(PAGE_SRC.indexOf("companyCall('get_box_analysis'") !== -1, 'the page calls get_box_analysis');
/* Every dynamic value reaching innerHTML goes through FMT.escape. */
ok(PAGE_SRC.indexOf('function esc(v) { return FMT.escape(v); }') !== -1,
  'the page escapes through FMT.escape');

/* ── 9. The offline preview cannot drift away from the real engine ────────
 * The preview pastes in parse output and claims it came from running the real
 * engine. That claim decays the moment the parser changes, and a preview that
 * quietly shows stale output is worse than no preview — the owner would be
 * signing off on something that is not what ships. So it is re-derived here
 * and compared. */
console.log('the design preview matches the real engine');
const PREVIEW = 'design_preview/tc_box_analysis.html';
ok(fs.existsSync(path.join(ROOT, PREVIEW)), PREVIEW + ' is present');
if (fs.existsSync(path.join(ROOT, PREVIEW))) {
  const PV = read(PREVIEW);
  const E = require(path.join(ROOT, 'Box_Analysis_Engine.js'));

  ok(PV.indexOf("'CSS_Tokens.html', 'UI_Components.html', 'Client_Helpers.html'") !== -1 &&
     PV.indexOf("'" + TEMPLATE + ".html'") !== -1,
    'the preview loads the REAL shared files and the REAL page, not copies');

  const dm = PV.match(/var REAL_DETAILS = '([^']*)';/);
  ok(!!dm, 'the preview carries the real transaction_details string');
  const pm = PV.match(/var PARSE_REAL = (\{[\s\S]*?\n  \});/);
  ok(!!pm, 'the preview carries a PARSE_REAL fixture');

  if (dm && pm) {
    const fixture = Function('return (' + pm[1] + ');')();
    const real = E.parseDetails(dm[1]);
    ok(fixture.sum === real.sum, 'preview PARSE_REAL.sum matches the engine', fixture.sum + ' vs ' + real.sum);
    ok(fixture.parsed_count === real.parsed_count, 'preview parsed_count matches', fixture.parsed_count + ' vs ' + real.parsed_count);
    ok(fixture.failed_count === real.failed_count, 'preview failed_count matches', fixture.failed_count + ' vs ' + real.failed_count);
    ok(fixture.items.length === real.items.length, 'preview item count matches', fixture.items.length + ' vs ' + real.items.length);
    real.items.forEach(function (it, i) {
      const f = fixture.items[i] || {};
      ['qty', 'unit', 'item_norm', 'item_key', 'price', 'unit_price', 'confidence'].forEach(function (k) {
        const a = f[k] === undefined ? null : f[k];
        const b = it[k] === undefined ? null : it[k];
        ok(a === b, 'preview item ' + i + '.' + k + ' matches the engine', JSON.stringify(a) + ' vs ' + JSON.stringify(b));
      });
    });
  }

  /* The preview must never be pushed to Apps Script. */
  const CLASPIGNORE = read('.claspignore');
  ok(/^design_preview\/\*\*$/m.test(CLASPIGNORE), 'design_preview/** is in .claspignore');
  ok(/^tools\/\*\*$/m.test(CLASPIGNORE), 'tools/** is in .claspignore');
}

/* ── 10. The nightly precompute exists but is NOT installed ──────────────
 * The brief forbids installing a trigger: it would modify the owner's Apps
 * Script project outside a push. So the function is written, named without a
 * trailing underscore so the trigger dialog can list it, documented with the
 * steps to install it — and nothing in this repo calls ScriptApp to create it. */
console.log('the precompute is written but NOT installed');
ok(/^function rebuildBoxAnalysisIndex\(\) \{/m.test(ACTIONS),
  'rebuildBoxAnalysisIndex is a global with NO trailing underscore, so the trigger dialog lists it');
ok(ACTIONS.indexOf('rebuildBoxAnalysisIndex_') !== -1, 'and it delegates into the namespace');
ok(!/ScriptApp\s*\.\s*newTrigger/.test(ACTIONS),
  'nothing in the actions file creates a trigger');
['Box_Analysis_Engine.js', 'DbLive_Connector.js', TEMPLATE + '.html'].forEach(function (f) {
  ok(!/ScriptApp\s*\.\s*newTrigger/.test(read(f)), f + ' creates no trigger either');
});
ok(/Triggers \(clock icon\)/.test(ACTIONS),
  'the install steps are recorded next to the function, so nobody has to guess');

/* ── 11. Bounded work, and honest about being bounded ────────────────────
 * Apps Script kills an execution at six minutes. Every long path checks its own
 * clock and reports a partial result in Arabic rather than being killed
 * mid-response. */
console.log('the six-minute limit');
ok(/BOX_TIME_BUDGET_MS = \d+/.test(ACTIONS), 'there is an explicit time budget');
ok(ACTIONS.indexOf('boxOverBudget_') !== -1, 'and it is checked, not just declared');
ok(ACTIONS.indexOf('timed_out_message_ar') !== -1,
  'a timed-out analysis says so in Arabic instead of silently returning less');
ok(ACTIONS.indexOf('truncated_message_ar') !== -1,
  'and a truncated window says how much it actually analysed');

console.log(failures === 0
  ? '\nAll wiring checks pass.'
  : '\n' + failures + ' wiring check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
