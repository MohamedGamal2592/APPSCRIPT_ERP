/**
 * Deployment smoke test — boot every page template and see if it throws.
 *
 *   node tools/verify/ui_smoke_pages.js
 *
 * WHY THIS IS DIFFERENT FROM ui_check C2
 * --------------------------------------
 * C2 PARSES each template's inline <script>. Parsing catches a syntax error and
 * nothing else. It cannot catch a reference to a variable that no longer
 * exists, a call to a function that was renamed, or a component that throws the
 * moment it runs — and this programme rewrote large parts of the shared layer,
 * where exactly those mistakes live.
 *
 * This loads the REAL UI_Components.html and Client_Helpers.html, substitutes
 * the Apps Script scriptlets with plausible values, then EXECUTES each page's
 * own script on the DOM stub and reports anything that throws.
 *
 * It is not a browser. It proves a page's top-level code runs and its render
 * entry point can be called; it does not prove the page looks right. What it
 * does catch is the class of error that turns a page blank.
 */
'use strict';

const vm = require('vm');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

const args = process.argv.slice(2);
const VERBOSE = args.indexOf('--verbose') !== -1;

/* Scriptlet substitutions: what the server would print into each page. */
function substitute(src) {
  return src
    .replace(/<\?!?=\s*companyPages\s*\?>/g, '[{"action":"vf_products","label":"المنتجات"}]')
    .replace(/<\?!?=\s*currentAction\s*\?>/g, 'vf_dashboard')
    .replace(/<\?!?=\s*getCompanyLogoUrl_\([^)]*\)\s*\?>/g, 'https://example.invalid/logo.png')
    .replace(/<\?!?=\s*getCompanyThemeCSS_\([^)]*\)\s*\?>/g, '')
    .replace(/<\?!?=\s*include\([^)]*\)\s*;?\s*\?>/g, '')
    .replace(/<\?!?=\s*scriptUrl\s*\?>/g, 'https://example.invalid/exec')
    .replace(/<\?!?=\s*sessionToken\s*\?>/g, 'tok')
    .replace(/<\?[\s\S]*?\?>/g, '0');
}

function freshSandbox() {
  const sb = makeSandbox({
    google: {
      script: {
        run: new Proxy({}, { get: () => function () { return this; } }),
        host: { close: function () {}, setHeight: function () {} },
        history: { push: function () {}, replace: function () {} }
      }
    },
    scriptUrl: 'https://example.invalid/exec',
    SESSION_TOKEN: 'tok',
    CURRENT_ACTION: 'smoke',
    COMPANY_PAGES: [{ action: 'a', label: 'صفحة' }],
    USER_PAGES: null,
    IS_SUPER_ADMIN: true,
    Chart: undefined,
    XLSX: undefined
  });
  sb.location = { href: 'https://example.invalid/exec?action=smoke', search: '?action=smoke&sessionToken=tok', origin: 'https://example.invalid', pathname: '/exec' };
  /* The shared layer, exactly as a page loads it. */
  ['UI_Components.html', 'Client_Helpers.html'].forEach(function (f) {
    S.scriptBlocks(S.read(f)).forEach(function (b, i) {
      vm.runInContext(S.stripScriptlets(b.body), sb, { filename: f + '#' + i });
    });
  });
  return sb;
}

/* Sanity: the shared layer itself must boot cleanly before judging any page. */
let shared;
try {
  shared = freshSandbox();
} catch (e) {
  console.log('FATAL — the shared layer itself throws: ' + e.message);
  console.log(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}
console.log('shared layer boots. UIC symbols: ' + Object.keys(shared.UIC).length +
  ', FMT: ' + Object.keys(shared.FMT || {}).length +
  ', UI: ' + Object.keys(shared.UI || {}).length + '\n');

/* Pages that ALSO threw on the untouched Phase 0 tree (commit e324cfc), checked
 * by running this same harness against `git show e324cfc:<file>`. They are not
 * regressions from this programme, so they must not mask one — the run fails on
 * anything OUTSIDE this list, and equally on any entry here that starts passing
 * without the list being updated.
 *
 *   0_ERP_Management.html            DOM-stub artifact. The stub does not build
 *   Company_TopChemical_MainReview   nodes from the page's STATIC body markup,
 *                                    so getElementById returns null for an id
 *                                    declared in <body> rather than written by
 *                                    innerHTML. Both pages target such an id.
 *   DbLive_Viewer.html               calls getQueryParam() before it is in
 *                                    scope in this harness. Pre-existing, and a
 *                                    developer-tools page, not a business one.
 */
const KNOWN_PREEXISTING = [
  '0_ERP_Management.html',
  'Company_TopChemical_MainReview.html',
  'DbLive_Viewer.html'
];

const pages = S.pageFiles();
const failed = [];
let booted = 0, noScript = 0;

pages.forEach(function (f) {
  const src = S.read(f);
  const blocks = S.scriptBlocks(src);
  if (!blocks.length) { noScript++; return; }

  let sb;
  try { sb = freshSandbox(); }
  catch (e) { failed.push({ f: f, where: 'sandbox', msg: e.message }); return; }

  let threw = null;
  blocks.forEach(function (b, i) {
    if (threw) return;
    try {
      vm.runInContext(substitute(b.body), sb, { filename: f + '#' + i });
    } catch (e) {
      threw = { where: 'block ' + i + ' (line ' + b.line + ')', msg: e.message, stack: e.stack };
    }
  });

  if (threw) failed.push({ f: f, where: threw.where, msg: threw.msg, stack: threw.stack });
  else booted++;
});

console.log('page templates: ' + pages.length);
console.log('  booted with no error : ' + booted);
console.log('  no inline script     : ' + noScript);
console.log('  THREW                : ' + failed.length + '\n');

const regressions = failed.filter(function (x) { return KNOWN_PREEXISTING.indexOf(x.f) === -1; });
const knownStillFailing = failed.filter(function (x) { return KNOWN_PREEXISTING.indexOf(x.f) !== -1; });
const knownNowPassing = KNOWN_PREEXISTING.filter(function (f) {
  return !failed.some(function (x) { return x.f === f; });
});

knownStillFailing.forEach(function (x) {
  console.log('  known (also fails at Phase 0)  ' + x.f + '  — ' + x.msg);
});

regressions.forEach(function (x) {
  console.log('  REGRESSION  ' + x.f + '  ' + x.where);
  console.log('              ' + x.msg);
  if (VERBOSE && x.stack) {
    console.log(x.stack.split('\n').slice(1, 4).map(function (l) { return '              ' + l.trim(); }).join('\n'));
  }
});

if (knownNowPassing.length) {
  console.log('\n  ' + knownNowPassing.join(', ') + ' no longer throws.');
  console.log('  Remove it from KNOWN_PREEXISTING so a future break is caught.');
}

if (regressions.length || knownNowPassing.length) {
  console.log('\n' + (regressions.length
    ? regressions.length + ' page(s) newly throw while booting.'
    : 'the known-failure list is stale.'));
  process.exit(1);
}
console.log('\nEvery page template boots against the real shared layer, except ' +
  knownStillFailing.length + ' that behaved identically before this programme began.');
