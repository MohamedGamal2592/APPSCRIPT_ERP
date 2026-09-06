/**
 * UI-3.4 / U-24 — one loading overlay, and the two notification defects.
 *
 *   node tools/verify/ui3_loading.js
 *
 * There were FOUR loading overlays, each with its own look, so the same action
 * showed a different spinner depending on which page you were on. On the three
 * pages including ERP_Flow, one navigation fired two of them at once.
 *
 * This also covers baseline findings N-01 and N-02: UI.toast and UI.alert were
 * called but defined nowhere.
 */
'use strict';

const vm = require('vm');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

/* Boot the shared layer the way a page does: components, then helpers. */
const sb = makeSandbox({
  google: { script: { run: new Proxy({}, { get: () => function () { return this; } }), host: {}, history: {} } }
});
['UI_Components.html', 'Client_Helpers.html'].forEach(function (f) {
  S.scriptBlocks(S.read(f)).forEach(function (b, i) {
    try { vm.runInContext(S.stripScriptlets(b.body), sb, { filename: f + '#' + i }); }
    catch (e) { console.log('        (' + f + ' block ' + i + ': ' + e.message + ')'); }
  });
});
const UIC = sb.UIC, UI = sb.UI;

/* ── 1. There is exactly one overlay implementation left ────────────────── */
(function () {
  const builders = [];
  S.htmlFiles().forEach(function (f) {
    const src = S.read(f).replace(/\/\*[\s\S]*?\*\//g, '');   /* comments do not count */
    /* An element created and given a full-screen fixed position with a spinner
       inside it is an overlay implementation. */
    if (/id\s*=\s*['"]vf-loading-overlay['"]/.test(src)) builders.push(f + ' (vf-loading-overlay)');
    if (/id\s*=\s*['"]erp-flow-overlay['"]/.test(src)) builders.push(f + ' (erp-flow-overlay)');
    if (/id\s*=\s*['"]app-spinner['"]/.test(src)) builders.push(f + ' (app-spinner)');
    if (/getElementById\('page-loading'\)/.test(src) && f !== 'UI_Components.html') {
      builders.push(f + ' (touches page-loading directly)');
    }
  });
  ok(builders.length === 0,
    'no page or partial builds a loading overlay of its own any more',
    builders.join(' | '));
  ok(/id\s*=\s*['"]?page-loading/.test(S.read('UI_Components.html')) ||
     /d\.id = 'page-loading'/.test(S.read('UI_Components.html')),
    'the single implementation lives in UI_Components.html');
  /* The hardcoded spinner colours are gone from live code. */
  ['#875A7B', '#4a90d9'].forEach(function (hex) {
    const live = S.htmlFiles().filter(function (f) {
      return S.read(f).replace(/\/\*[\s\S]*?\*\//g, '').indexOf(hex) !== -1;
    });
    ok(live.length === 0, 'the hardcoded ' + hex + ' spinner colour is gone', live.join(', '));
  });
})();

/* ── 2. The public contract is intact ───────────────────────────────────── */
ok(typeof UI.showSpinner === 'function', 'UI.showSpinner still exists (80 pages call it)');
ok(typeof UI.hideSpinner === 'function', 'UI.hideSpinner still exists');
ok(typeof UIC.showPageLoading === 'function', 'UIC.showPageLoading still exists');
ok(typeof UIC.hidePageLoading === 'function', 'UIC.hidePageLoading still exists');
ok(UI.showSpinner.length <= 1, 'UI.showSpinner still takes one argument');

/* ── 3. N-01 and N-02: the two missing functions now exist ──────────────── */
ok(typeof UI.toast === 'function',
  'N-01: UI.toast exists — 40 calls on the manufacturing page were silently discarded');
ok(typeof UI.alert === 'function',
  'N-02: UI.alert exists — 9 UNGUARDED calls in DbLive_Viewer threw on every error path');
(function () {
  const before = sb.toasts().length;
  UI.toast('تم الحفظ', 'success');
  ok(sb.toasts().length === before + 1, 'UI.toast actually raises a toast');
  /* UPDATED by step 5.2: UI.alert raised a toast when it was introduced in 3.4;
     it now delegates to the styled UIC.alert, which is a dialog the user must
     acknowledge. That is the faithful replacement for the native alert() those
     9 DbLive_Viewer call sites were written against — all of them error
     reports, where a toast that vanishes after three seconds can be missed
     entirely. So the assertion moves from "raises a toast" to "raises a
     dialog", which is the stronger of the two. */
  const bodyBefore = sb.document.body.children.length;
  UI.alert('حدث خطأ');
  ok(sb.document.body.children.length === bodyBefore + 1,
    'UI.alert raises a dialog the user must acknowledge');
  const dlg = sb.document.body.children[sb.document.body.children.length - 1];
  ok(String(dlg.innerHTML).indexOf('حدث خطأ') !== -1,
    'and it carries the message', String(dlg.innerHTML).slice(0, 120));
})();

/* ── 4. Show / hide, and the ref counting ───────────────────────────────── */
function overlay() { return sb.document.getElementById('page-loading'); }
function visible() { const d = overlay(); return !!d && d.classList.contains('show'); }

(function () {
  UIC.hidePageLoading(true);
  ok(!visible(), 'starts hidden');

  UIC.showPageLoading('جاري التحميل');
  ok(visible(), 'showPageLoading shows it');
  ok(overlay().getAttribute('aria-busy') === 'true', 'aria-busy is set while loading');

  /* Nested: a save starting while a navigation overlay is already up. */
  UI.showSpinner('جاري الحفظ');
  ok(visible(), 'a nested caller keeps it visible');
  UI.hideSpinner();
  ok(visible(), 'the inner caller finishing does NOT hide the outer one');
  UIC.hidePageLoading();
  ok(!visible(), 'the last caller finishing hides it');
  ok(overlay().getAttribute('aria-busy') === 'false', 'aria-busy is cleared');

  /* A stray hide must not drive the count negative and strand the overlay. */
  UIC.hidePageLoading();
  UIC.hidePageLoading();
  UIC.showPageLoading('x');
  ok(visible(), 'a stray hide cannot leave the count negative and break the next show');
  UIC.hidePageLoading();
  ok(!visible(), 'and it still hides on one matching hide');

  /* Forced hide, which the boot watchdog and ERPFlow rely on. */
  UIC.showPageLoading('a'); UIC.showPageLoading('b'); UIC.showPageLoading('c');
  ok(visible(), 'three nested shows');
  UIC.hidePageLoading(true);
  ok(!visible(), 'hidePageLoading(true) drops it regardless of the count');
})();

/* ── 5. The rotating-message behaviour survived ─────────────────────────── */
(function () {
  /* The DOM stub does not build a node tree from innerHTML, so an element's
     querySelector always returns null and the message cannot be observed
     through the real overlay. UIC._loadMessage is therefore driven directly
     against a stand-in whose querySelector works — the logic under test is the
     message handling, not the stub's fidelity. */
  const msgEl = { textContent: '' };
  const fake = { querySelector: function (sel) { return sel === '.spinner-msg' ? msgEl : null; } };
  const realGet = sb.document.getElementById;
  sb.document.getElementById = function (id) {
    return id === 'page-loading' ? fake : realGet.call(sb.document, id);
  };

  UIC._loadMessage('جاري الحفظ…');
  ok(msgEl.textContent === 'جاري الحفظ…', 'a string message is shown', msgEl.textContent);

  /* The stub's setInterval returns 0, which is falsy — so asserting on
     UIC._loadTimer would be reading a stub artifact, not the behaviour. Replace
     it with a real recorder so the rotation can actually be driven and observed. */
  let ticks = [], cleared = 0, nextId = 1;
  const realSet = sb.setInterval, realClear = sb.clearInterval;
  sb.setInterval = function (fn, ms) { ticks.push({ fn: fn, ms: ms, id: nextId }); return nextId++; };
  sb.clearInterval = function (id) { cleared++; ticks = ticks.filter(t => t.id !== id); };

  UIC._loadMessage(['جاري التحقق…', 'جاري الحفظ…', 'اكتمل']);
  ok(msgEl.textContent === 'جاري التحقق…',
    'an array of messages shows the first line', msgEl.textContent);
  ok(ticks.length === 1 && ticks[0].ms === 2500,
    'and schedules the rest every 2500ms — the behaviour UI.showSpinner had',
    JSON.stringify(ticks.map(t => t.ms)));

  /* Drive the rotation: each tick should advance one line, then stop. */
  const tick = ticks[0].fn;
  tick();
  ok(msgEl.textContent === 'جاري الحفظ…', 'the first tick advances to line 2', msgEl.textContent);
  tick();
  ok(msgEl.textContent === 'اكتمل', 'the second tick advances to line 3', msgEl.textContent);
  const clearedBefore = cleared;
  tick();
  ok(cleared > clearedBefore, 'and the rotation stops itself after the last line');
  ok(msgEl.textContent === 'اكتمل', 'leaving the last line on screen', msgEl.textContent);

  UIC._loadMessage(['a', 'b']);
  const running = ticks.length;
  UIC._loadMessage('one line only');
  ok(msgEl.textContent === 'one line only', 'a later single message replaces the line');
  ok(ticks.length < running || ticks.length === 0,
    'and cancels the rotation that was still running');

  sb.setInterval = realSet; sb.clearInterval = realClear;

  UIC._loadMessage([]);
  ok(msgEl.textContent === 'one line only',
    'an empty message list leaves the current line alone rather than blanking it');

  sb.document.getElementById = realGet;
  UIC.hidePageLoading(true);
})();

/* ── 6. ERP_Flow delegates and owns no overlay ──────────────────────────── */
(function () {
  const flow = S.read('ERP_Flow.html');
  ok(flow.indexOf('erp-flow-overlay') === -1,
    'ERP_Flow no longer ships an overlay element or its styles');
  ok(/function start[\s\S]{0,400}UIC\.showPageLoading/.test(flow),
    'ERPFlow.start delegates to the shared service');
  ok(/UIC\.hidePageLoading\(true\)/.test(flow),
    'ERPFlow.finish force-hides, so an auto-wired navigation cannot strand it');
  ok(/refCount/.test(flow) && /minMs/.test(flow),
    'ERPFlow keeps its own ref count and minimum-visible-time rule');
  ok(/erp-flow-enter/.test(flow),
    'the content entrance animation, which is ERP_Flow\'s own idea, is kept');
  ok(/prefers-reduced-motion/.test(flow),
    'and it respects prefers-reduced-motion');
})();

/* ── 7. The overlay itself is accessible and calm ───────────────────────── */
(function () {
  const src = S.read('UI_Components.html');
  const at = src.indexOf('UIC.ensurePageLoading');
  const block = src.slice(at, at + 2200);
  ok(/role', 'status'/.test(block) || /setAttribute\('role', 'status'\)/.test(block),
    'the overlay is role="status"');
  ok(/aria-live', 'polite'/.test(block), 'and aria-live="polite"');
  ok(/prefers-reduced-motion/.test(block),
    'the spinner does not spin for someone who asked for reduced motion');
  ok(/var\(--bg-surface/.test(block) && /var\(--brand-primary/.test(block),
    'it is styled from tokens, so it themes with the company');
  ok(/z-index:1500/.test(block),
    'z-index 1500 — above the topbar and the sticky header, below toasts (2000)');
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-3.4 loading: all assertions pass.');
