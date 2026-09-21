/**
 * RT6 — the soft-navigation pilot: authorized, and leak-free.
 *
 * Two risks, and they are not equal.
 *
 * THE AUTHORIZATION RISK is the serious one. get_page_body renders any page's
 * template. If it does not run the SAME check doGet runs, it is a way to read a
 * page you are not allowed to read, and it is a fast one. An optimisation that
 * is also a way around an access check is not an optimisation.
 *
 * THE LEAK RISK is the one that shows up a week later. Page scripts here assume
 * they own the document: they register window listeners, start intervals, and
 * call UIC.Live.watchPage. A router that mounts correctly and unmounts sloppily
 * leaks one poll per page visited, each one a real Apps Script execution every
 * interval, for as long as the tab stays open. An afternoon of navigating turns
 * a user's tab into a quota problem nobody can see.
 *
 * So: unmount is the phase, and this file exercises it — it mounts a page that
 * starts a timer, an interval, a listener and a watch, tears it down, and
 * checks all four are gone.
 *
 * What this CANNOT prove, and does not claim: that a swap looks smooth, that
 * nothing flickers, or that the scroll position is right. There is no layout
 * engine here. Those are on the owner's checklist.
 *
 * Run: node tools/verify/rt6_router.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox } = require('./domstub');

const ROOT = path.resolve(__dirname, '..', '..');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

function mask(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
}

/* ── 1. The endpoint runs doGet's gate, not a version of it ──────────────── */

const CODE = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');
const code = mask(CODE);

const at = code.indexOf('function getPageBody_');
check(at !== -1, 'get_page_body exists');
const body = code.slice(at, code.indexOf('\nfunction extractBody_'));

check(/checkPageAccessForUI_\(user, page\.accessPage \|\| action\)/.test(body),
  'it runs checkPageAccessForUI_ on the resolved page access id — the same check doGet runs');
check(/if \(!user\) throw/.test(body),
  'an unauthenticated caller gets nothing');
check(/p\.action === action && p\.template/.test(body),
  'a registry entry with no template is a permission token, not a page, and is refused like doGet refuses it');

/* Same message for "does not exist" and "not allowed", so the endpoint cannot
 * be used to enumerate which pages exist. */
const throws = (body.match(/throw new Error\(([^)]*)\)/g) || []);
const notAuth = throws.filter(t => /NOT_AUTHORIZED/.test(t)).length;
check(notAuth >= 3,
  'unknown page and unauthorized page fail identically — the endpoint is not an oracle for what exists',
  '        only ' + notAuth + ' of ' + throws.length + ' throws use the shared message');

check(/'get_page_body':\s*\{\s*handler:\s*getPageBody_,\s*requireAuth:\s*true\s*\}/.test(code),
  'and the route itself requires authentication');

/* The shared bundle must not be sent twice, and the suppression must not leak
 * into the next request in the same execution. */
check(/SUPPRESS_SHARED_INCLUDES\s*=\s*true/.test(body) && /finally\s*\{[\s\S]{0,600}?SUPPRESS_SHARED_INCLUDES\s*=\s*false/.test(body),
  'the shared includes are suppressed for this call and restored in a finally, even if the template throws');
check(/if \(SUPPRESS_SHARED_INCLUDES && MINIFY_FILES_\[filename\]\) return ''/.test(code),
  'include() honours it — a soft navigation does not re-send the bundle already in the document');

/* ── 2. The router: fallback, opt-in, and the guard ──────────────────────── */

const UICSRC = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
const uic = mask(UICSRC);
const rAt = uic.indexOf('UIC.Router = (function');
check(rAt !== -1, 'UIC.Router exists');
const router = uic.slice(rAt, uic.indexOf('UIC.Cache = (function'));

check(/\.catch\(function \(\) \{[\s\S]{0,400}hard\(urlFor\(action\)\)/.test(router),
  'ANY failure falls back to a hard navigation — the worst case of this phase is today\'s behaviour');
check(/if \(!registered\[action\] \|\| !registered\[current\]\) return false/.test(router),
  'both sides must be registered: a soft navigation INTO an unconverted page would leave its script running in a document it did not build');
check(/history\.pushState/.test(router) && /popstate/.test(router),
  'the address bar, deep links and back/forward keep working');
check(/UIC\.Live[\s\S]{0,60}guardMessage/.test(router),
  'and an unsaved optimistic row is guarded here too — it is lost with the page that drew it, softly or otherwise');

check(/UIC\.Router && UIC\.Router\.isRegistered\(target\) && UIC\.Router\.go\(target\)/.test(uic),
  'UIC.navTo tries the router first and falls through for every unregistered page');

/* ── 3. unmount, exercised ───────────────────────────────────────────────── */

function loadUIC() {
  const m = UICSRC.match(/^<script>([\s\S]*)<\/script>\s*$/);
  const sandbox = makeSandbox();
  vm.runInContext(m[1], sandbox, { filename: 'UI_Components.html' });
  return sandbox;
}

{
  const box = loadUIC();
  const R = box.UIC.Router;

  let unmounted = 0;
  R.register('page_a', { mount: function () {}, unmount: function () { unmounted++; } });
  R.register('page_b', { mount: function () {} });

  check(R.isRegistered('page_a') && R.isRegistered('page_b'), 'pages register');
  check(!R.isRegistered('page_c'), 'and an unregistered page stays unregistered');

  /* Simulate what a mounted page does: start things. The router wraps the
   * globals while a page is live, so this is the real path. */
  vm.runInContext(`
    UIC.Router.register('live_page', { mount: function () {}, unmount: function () { window.__um = (window.__um||0)+1; } });
    UIC.Router._startForTest();
    window.__t = setTimeout(function(){}, 100000);
    window.__i = setInterval(function(){}, 100000);
    window.__l = function(){};
    window.addEventListener('resize', window.__l);
    UIC.Live.watchPage({ call: function(){ return Promise.resolve({versions:{}}); }, page: 'p', onChange: function(){} });
  `, box);

  const tracked = R._tracked();
  check(tracked.timers >= 1, 'a timer started by a mounted page is tracked', '        ' + JSON.stringify(tracked));
  check(tracked.intervals >= 1, 'and an interval');
  check(tracked.listeners >= 1, 'and a window listener');

  /* Register the page's own unmount the way go() does, then tear down. */
  vm.runInContext(`UIC.Router._pushTeardown(function(){ window.__um = (window.__um||0)+1; }); UIC.Router._tearDown();`, box);

  const after = R._tracked();
  check(after.timers === 0 && after.intervals === 0 && after.listeners === 0,
    'unmount clears every timer, interval and listener the page started',
    '        left: ' + JSON.stringify(after));
  check(box.__um === 1, 'and runs the page\'s own unmount hook');

  /* The watch is the leak that matters most: one abandoned poll per page
   * visited, each a real execution every interval, for as long as the tab
   * stays open. */
  check(/UIC\.Live\.unwatchPage\(\)/.test(router),
    'and stops the change watch — the leak that turns an afternoon of navigating into a quota problem');
}

/* ── 4. Only the two pilot pages, and they declare what they hold ────────── */

const PILOTS = ['Company_TopLight_Dashboard.html', 'Company_TopLight_KPI.html'];
/* UI_Components.html DEFINES register; it does not call it. */
const SHARED = ['UI_Components.html', 'Client_Helpers.html', 'CSS_Tokens.html'];
const registeredPages = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && SHARED.indexOf(f) === -1)
  .filter(f => /UIC\.Router\.register\(\s*'/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));

check(JSON.stringify(registeredPages.sort()) === JSON.stringify(PILOTS.slice().sort()),
  'exactly the two pilot pages are registered; every other page hard-navigates as today',
  '        registered: ' + registeredPages.join(', '));

registeredPages.forEach(function (f) {
  const src = mask(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const reg = /UIC\.Router\.register\(\s*'([a-z0-9_]+)'\s*,\s*\{([^}]*)\}/.exec(src);
  check(!!reg, f + ': registers with a mount function');
  if (!reg) return;
  check(/mount:/.test(reg[2]), f + ': declares mount');

  /* A page that starts something the router cannot see generically must
   * declare an unmount for it. Timers, listeners and the watch ARE seen
   * generically; anything else is the page's own to clean up. */
  const starts = [];
  if (/setInterval\s*\(/.test(src)) starts.push('setInterval');
  if (/document\.addEventListener\s*\(/.test(src)) starts.push('document listener');
  if (/new\s+(MutationObserver|ResizeObserver|IntersectionObserver)/.test(src)) starts.push('an observer');
  if (starts.length) {
    check(/unmount:/.test(reg[2]),
      f + ': starts ' + starts.join(', ') + ' and must declare an unmount for it',
      '        the router clears window timers, window listeners and the change watch;\n' +
      '        anything else belongs to the page');
  } else {
    console.log('  ..    ' + f.replace('.html', '') +
      ': starts nothing that outlives it, so no unmount is needed');
  }
});

console.log('\n' + (failed === 0
  ? 'RT6 — the same gate, a hard-navigation fallback, and nothing left running.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
