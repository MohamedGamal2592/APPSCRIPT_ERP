/**
 * S0 verification — UIC.openModal `size` option is purely additive.
 *
 * Loads the REAL inline script of UI_Components.html, runs UIC.openModal under a
 * minimal DOM stub, and asserts that the markup produced for a call with no
 * `size` is byte-identical to the markup the pre-change implementation produced.
 *
 * The pre-change markup is regenerated here from the committed original template
 * rather than hardcoded, so the comparison stays honest if UIC.button changes.
 *
 *   node tools/verify/s0_modal_size.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeSandbox } = require('./domstub');

const ROOT = path.resolve(__dirname, '..', '..');

function loadUIC() {
  const src = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
  const m = src.match(/^<script>([\s\S]*)<\/script>\s*$/);
  if (!m) throw new Error('UI_Components.html is not a single <script> block');
  const sandbox = makeSandbox();
  vm.runInContext(m[1], sandbox, { filename: 'UI_Components.html' });
  return sandbox.UIC;
}

/* The template exactly as it stood at HEAD 001d077, before S0.
 *
 * UPDATED 2026-09-06 by the UI/UX run, step 3.2 (U-09), and the reason is
 * recorded here rather than in a commit nobody will re-read:
 *
 *   The close button's glyph changed from the `&times;` HTML entity to
 *   UIC.icon('close'). That is a DELIBERATE, reviewed change — emoji and
 *   entities are rendered by the operating system, cannot inherit the text
 *   colour and are sized inconsistently across platforms.
 *
 * What this file actually guards is that the `size` option is PURELY ADDITIVE:
 * a call passing no size must render exactly as a call would with the size
 * logic removed. That guarantee is untouched, and the reference below is
 * updated to the intended markup rather than the assertion being weakened or
 * the test being deleted. If the glyph is ever changed again, this line must be
 * changed with it — deliberately, and never to make a red test go green.
 */
function originalMarkup(UIC, modalId, opts) {
  const o = opts || {};
  return '<div class="modal" role="dialog" aria-modal="true">' +
      '<div class="modal-header"><h3>' + (o.title || '') + '</h3>' +
        '<button class="btn-icon" onclick="UIC.closeModal(\'' + modalId + '\')" aria-label="إغلاق">' + UIC.icon('close', { size: 18 }) + '</button></div>' +
      '<div class="modal-body">' + (o.body || '') + '</div>' +
      (o.footer !== false ? '<div class="modal-footer">' + UIC.button({ text: 'إلغاء', type: 'outline', onClick: 'UIC.closeModal(\'' + modalId + '\')' }) + ' ' + UIC.button({ text: 'حفظ', onClick: 'UI.submitOnce(this, function(){' + (o.onSave || '') + '})' }) + '</div>' : '') +
    '</div>';
}

const UIC = loadUIC();

/* Option shapes drawn from the real call sites across the 49 pages. */
const CASES = [
  ['bare', {}],
  ['title only', { title: 'تفاصيل' }],
  ['title + body', { title: 'تعديل', body: '<div class="form-grid"><input id="x"></div>' }],
  ['with onSave', { title: 'إضافة', body: '<p>x</p>', onSave: 'saveIt()' }],
  ['footer false', { title: 'عرض', body: '<table><tr><td>1</td></tr></table>', footer: false }],
  ['quotes in body', { title: "It's here", body: '<a href="#" onclick="f(\'a\')">go</a>', onSave: "g('b')" }],
  ['explicit md', { title: 'تعديل', body: '<p>y</p>', size: 'md' }],
  ['unknown size', { title: 'تعديل', body: '<p>y</p>', size: 'nonsense' }],
  ['size undefined', { title: 'تعديل', body: '<p>y</p>', size: undefined }]
];

let failed = 0;
console.log('S0 — UIC.openModal markup, before vs after\n');

CASES.forEach(function (c) {
  const name = c[0], opts = c[1];
  const after = UIC.openModal('m_' + name.replace(/\W/g, ''), opts).innerHTML;
  const before = originalMarkup(UIC, 'm_' + name.replace(/\W/g, ''), opts);
  const same = after === before;
  if (!same) failed++;
  console.log((same ? '  PASS  ' : '  FAIL  ') + name + ' — markup ' + (same ? 'identical' : 'DIFFERS'));
  if (!same) {
    console.log('    before: ' + before.slice(0, 120));
    console.log('    after : ' + after.slice(0, 120));
  }
});

console.log('\nS0 — new sizes emit their class\n');
[['sm', 'modal modal-sm'], ['lg', 'modal modal-lg'], ['xl', 'modal modal-xl']].forEach(function (p) {
  const html = UIC.openModal('sz_' + p[0], { title: 't', body: 'b', size: p[0] }).innerHTML;
  const ok = html.indexOf('<div class="' + p[1] + '" role="dialog"') === 0;
  if (!ok) failed++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + "size:'" + p[0] + "' -> class=\"" + p[1] + '"');
});

console.log('\nS0 — CSS declares the three widths, default untouched\n');
const css = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
[
  ['.modal { border-radius: var(--radius-lg); max-width: 560px; padding-bottom: 0; }', 'default still 560px'],
  ['.modal.modal-sm { max-width: 420px; }', 'sm 420'],
  ['.modal.modal-lg { max-width: 880px; }', 'lg 880'],
  ['.modal.modal-xl { max-width: 1100px; }', 'xl 1100']
].forEach(function (p) {
  const ok = css.indexOf(p[0]) !== -1;
  if (!ok) failed++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + p[1]);
});

console.log('\n' + (failed === 0 ? 'S0 OK — all existing callers render byte-identically.' : 'S0 FAILED: ' + failed));
process.exit(failed === 0 ? 0 : 1);
