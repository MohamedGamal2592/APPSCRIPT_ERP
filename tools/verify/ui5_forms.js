/**
 * UI-5.1 / 5.2 / 5.3 — the Phase 5 safety items.
 *
 *   node tools/verify/ui5_forms.js
 *
 * Phase 5 carries the run's sharpest risk: a save payload must never change
 * shape. Everything asserted here is ADDITIVE — a dirty guard, a dialog and a
 * validator — and the last section proves that none of it touches a save.
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

const sb = makeSandbox({
  scriptUrl: '#', SESSION_TOKEN: 't',
  google: { script: { run: new Proxy({}, { get: () => function () { return this; } }), host: {}, history: {} } }
});
['UI_Components.html', 'Client_Helpers.html'].forEach(function (f) {
  S.scriptBlocks(S.read(f)).forEach(function (b, i) {
    try { vm.runInContext(S.stripScriptlets(b.body), sb, { filename: f + i }); } catch (e) {}
  });
});
const UIC = sb.UIC, UI = sb.UI;
const SRC = S.read('UI_Components.html');

/* ── 1. UIC.confirm ─────────────────────────────────────────────────────── */
(function () {
  ok(typeof UIC.confirm === 'function', 'UIC.confirm exists');
  const p = UIC.confirm({ message: 'حذف؟', record: 'INV-2026-0043', confirmText: 'حذف', danger: true });
  ok(p && typeof p.then === 'function', 'it returns a Promise');

  const overlay = sb.document.body.children[sb.document.body.children.length - 1];
  const html = String(overlay.innerHTML);
  ok(/INV-2026-0043/.test(html),
    'the dialog NAMES the record — "Delete?" and "Delete invoice INV-2026-0043?" are not the same question');
  ok(/btn-danger/.test(html), 'a destructive action gets the red variant');
  ok(/modal-sm/.test(html), 'and a small dialog');
  ok(/uic-confirm-record/.test(html), 'the record name has its own styled block');

  /* Answering resolves. */
  const id = overlay.id;
  let resolved = null;
  p.then(function (v) { resolved = v; });
  UIC._confirmAnswer(id, true);
  return new Promise(function (r) { setTimeout(r, 0); }).then(function () {
    ok(resolved === true, 'confirming resolves true');
  });
})();

/* ── 2. Cancelling, and closing, both mean "no" ─────────────────────────── */
(function () {
  const p = UIC.confirm('متأكد؟');
  const overlay = sb.document.body.children[sb.document.body.children.length - 1];
  let v = null;
  p.then(function (x) { v = x; });
  UIC._confirmAnswer(overlay.id, false);
  setTimeout(function () {
    ok(v === false, 'cancelling resolves false, never hangs');
  }, 0);

  /* Answering twice must not resolve twice. */
  const p2 = UIC.confirm('مرة أخرى؟');
  const o2 = sb.document.body.children[sb.document.body.children.length - 1];
  let count = 0;
  p2.then(function () { count++; });
  UIC._confirmAnswer(o2.id, true);
  UIC._confirmAnswer(o2.id, false);
  setTimeout(function () { ok(count === 1, 'a double answer resolves exactly once'); }, 0);
})();

/* ── 3. UIC.alert is acknowledge-only ───────────────────────────────────── */
(function () {
  ok(typeof UIC.alert === 'function', 'UIC.alert exists');
  UIC.alert('حدث خطأ');
  const overlay = sb.document.body.children[sb.document.body.children.length - 1];
  const html = String(overlay.innerHTML);
  const buttons = (html.match(/<button/g) || []).length;
  /* One close × in the header, one acknowledge button in the footer. */
  ok(buttons === 2, 'an alert offers ONE action, not a misleading Cancel', String(buttons));
  ok(/حسناً/.test(html), 'labelled as an acknowledgement');
  ok(typeof UI.alert === 'function' && /UIC\.alert/.test(S.read('Client_Helpers.html')),
    'UI.alert delegates to it, so the 9 DbLive error paths get a dialog they must acknowledge');
})();

/* ── 4. Dirty tracking ──────────────────────────────────────────────────── */
(function () {
  ok(typeof UIC.trackDirty === 'function', 'UIC.trackDirty exists');
  ok(typeof UIC.isDirty === 'function', 'UIC.isDirty exists');

  /* A stand-in form: the stub does not build nodes from innerHTML. */
  const inputs = [
    { id: 'f1', type: 'text', value: 'a' },
    { id: 'f2', type: 'checkbox', checked: false, value: '' },
    { id: 'f3', type: 'file', value: 'ignored' }
  ];
  const form = { id: 'frm', querySelectorAll: function () { return inputs; } };

  UIC.trackDirty(form, { label: 'فاتورة جديدة' });
  ok(UIC.isDirty() === false, 'a freshly tracked form is clean');

  inputs[0].value = 'b';
  ok(UIC.isDirty() === true, 'changing a field makes it dirty');
  ok(UIC.dirtyForms()[0].label === 'فاتورة جديدة',
    'and the dirty form carries its label, so the dialog can name it');

  UIC.clearDirty('frm');
  ok(UIC.isDirty() === false,
    'clearDirty re-snapshots after a save rather than untracking — the form is still on screen and may be edited again');

  inputs[1].checked = true;
  ok(UIC.isDirty() === true, 'a checkbox counts too');

  inputs[1].checked = false;
  ok(UIC.isDirty() === false, 'and reverting a change makes it clean again');

  inputs[2].value = 'changed';
  ok(UIC.isDirty() === false,
    'a file input is ignored — its value cannot be restored anyway and it would report false positives');

  UIC.untrackDirty('frm');
  ok(UIC.isDirty() === false, 'untrackDirty removes it');
})();

/* ── 5. Both guards are wired ───────────────────────────────────────────── */
(function () {
  ok(!!sb.__winListeners.beforeunload,
    'the browser guard is registered — it is the ONLY thing that catches a tab close or Back');
  ok(UIC._navToOriginal && UIC.navTo !== UIC._navToOriginal,
    'UIC.navTo is wrapped, so the in-app guard covers the topbar, drawer, dropdowns, breadcrumb and home button in one place');

  const src = /UIC\._wireDirtyGuard = function[\s\S]*?\n};/.exec(SRC)[0];
  ok(/UIC\.confirm\(/.test(src),
    'the in-app path uses the STYLED dialog, where the discarded work can be named');
  ok(/bypass/.test(src),
    'and suppresses the browser dialog once the user has already answered the styled one');
  ok(/if \(!UIC\.isDirty\(\)\) return UIC\._navToOriginal/.test(src),
    'a clean form navigates with no interception at all');
})();

/* ── 6. Validation ──────────────────────────────────────────────────────── */
(function () {
  const rules = {
    name: 'required',
    qty: ['required', 'number', 'positive'],
    disc: [['max', 100]],
    email: 'email',
    total: function (v, _a, all) {
      return Number(all.qty) * 10 === Number(v) || 'الإجمالي لا يطابق الكمية';
    }
  };
  let r = UIC.validate(rules, { name: '', qty: '-1', disc: '150', email: 'nope', total: '0' });
  ok(r.valid === false, 'invalid values are rejected');
  ok(r.errors.name === 'هذا الحقل مطلوب', 'required reports its own message');
  ok(/أكبر من صفر/.test(r.errors.qty), 'and the FIRST failing rule wins, not the last', r.errors.qty);
  ok(/100/.test(r.errors.disc), 'a parameterised rule names its bound');
  ok(/بريد/.test(r.errors.email), 'email is checked');
  ok(/الإجمالي/.test(r.errors.total),
    'a cross-field rule can see the whole value object');

  r = UIC.validate(rules, { name: 'x', qty: '2', disc: '10', email: 'a@b.co', total: '20' });
  ok(r.valid === true, 'valid values pass', JSON.stringify(r.errors));

  /* An empty optional field must not fail a format rule. */
  r = UIC.validate({ email: 'email', disc: [['max', 100]] }, { email: '', disc: '' });
  ok(r.valid === true, 'an empty optional field is not a format error');

  ok(typeof UIC.setFieldError === 'function' && typeof UIC.setLineError === 'function',
    'errors can be anchored to a field and to a line');
  const fn = /UIC\.setFieldError = function[\s\S]*?\n};/.exec(SRC)[0];
  ok(/aria-invalid/.test(fn) && /aria-describedby/.test(fn),
    'a field error is announced to assistive tech, not only coloured red');
  ok(!/UIC\.toast/.test(fn),
    'and is NOT a toast that vanishes after three seconds while the user is still scrolling');
})();

/* ── 7. Nothing here touches a save ─────────────────────────────────────── */
(function () {
  const blocks = ['UIC.confirm', 'UIC.alert', 'UIC.trackDirty', 'UIC.validate',
                  'UIC.validateAndShow', 'UIC.setFieldError', 'UIC._wireDirtyGuard'];
  const bad = [];
  blocks.forEach(function (name) {
    const re = new RegExp(name.replace('.', '\\.') + ' = function[\\s\\S]*?\\n};');
    const m = re.exec(SRC);
    if (!m) return;
    if (/API\.call|google\.script\.run|companyCall|save_/.test(m[0])) bad.push(name);
  });
  ok(bad.length === 0,
    'none of the Phase 5 components makes a server call or touches a save payload',
    bad.join(', '));

  /* UIC._readForm is what every existing save path collects from. It must be
     byte-for-byte the same shape as before. */
  ok(/UIC\._readForm = function \(formId\)/.test(SRC),
    'UIC._readForm still exists with its original signature');
  ok(/return \{ data: data, valid: valid \};/.test(SRC),
    'and still returns { data, valid } — the shape every save path reads');
})();

setTimeout(function () {
  console.log('');
  if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
  console.log('UI-5.1/5.2/5.3 form safety: all assertions pass.');
}, 10);
