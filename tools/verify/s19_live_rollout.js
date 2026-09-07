/**
 * S19 — the UIC.Live rollout across the ValleyFoods pages.
 *
 * This is a STAGED migration, so this file has two jobs and only one of them
 * fails the build:
 *
 *   - Anything already converted must be converted CORRECTLY. A half-converted
 *     page is worse than an unconverted one: it shows the user a row the server
 *     never accepted, or it watches a page id that does not exist and silently
 *     never refreshes.
 *   - Anything not yet converted is REPORTED, not failed, so the remaining work
 *     is visible instead of forgotten.
 *
 * Run: node tools/verify/s19_live_rollout.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ACTIONS = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

/* Every page id the server knows about, from PAGE_ACCESS itself. */
const KNOWN_PAGES = (function () {
  const out = {};
  const re = /'[a-z0-9_]+':\s*\{\s*page:\s*'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(ACTIONS)) !== null) out[m[1]] = true;
  return out;
})();

const pages = fs.readdirSync(ROOT)
  .filter(f => /^Company_ValleyFoods_.*\.html$/.test(f))
  .sort();

const converted = [];
const pending = [];

pages.forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* A converted page no longer contains a literal companyCall('save_...' —
     the action name moved into the UIC.Live.save options — so the write action
     is looked for wherever it appears, not only at a call site. */
  const savesToServer =
    /companyCall\('(save|add|approve|delete|remove|toggle|transfer|commit|resolve|revert)_/.test(src) ||
    /action:\s*'(save|add|approve|delete|remove|toggle|transfer|commit|resolve|revert)_/.test(src);
  if (!savesToServer) return;
  (src.indexOf('UIC.Live.save') !== -1 || src.indexOf('UIC.Live.watchPage') !== -1 ? converted : pending).push(f);
});

console.log('\n1 — converted pages are converted correctly\n');

converted.forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const label = f.replace('Company_ValleyFoods_', '').replace('.html', '');

  /* The watch must name a page the server actually gates, or it polls forever
     and is refused every time. */
  const watchRe = /UIC\.Live\.watchPage\(\{[\s\S]{0,400}?page:\s*'([a-z0-9_]+)'/g;
  let m, watched = [];
  while ((m = watchRe.exec(src)) !== null) watched.push(m[1]);
  /* One screen may watch several page ids by looping an array literal, when
     several gated pages render into it (HR_Emp: employees, status, shifts,
     salary). Those ids come from the array, not from a literal in the call. */
  if (!watched.length && /UIC\.Live\.watchPage\(\{[\s\S]{0,300}?page:\s*[A-Za-z_$]/.test(src)) {
    const loop = /\[([^\]]*'[a-z0-9_]+'[^\]]*)\]\s*\.forEach\(function\s*\([A-Za-z_$][A-Za-z0-9_$]*\)\s*\{[\s\S]{0,400}?UIC\.Live\.watchPage/.exec(src);
    if (loop) watched = (loop[1].match(/'([a-z0-9_]+)'/g) || []).map(x => x.replace(/'/g, ''));
  }
  check(watched.length > 0, label + ': registers a change watch', 'none found');
  watched.forEach(function (p) {
    check(!!KNOWN_PAGES[p], label + ': watches a page id the server knows (' + p + ')',
      'not present in PAGE_ACCESS');
  });

  /* A converted save must not ALSO block on a full reload — that is the second
     round trip the whole exercise removes. */
  const blockingReload = /companyCall\('(?:save|add|approve|transfer)_[a-z_]+'[\s\S]{0,600}?\.then\(function[^)]*\)\s*\{[\s\S]{0,400}?\n\s*load\(\);/;
  check(!blockingReload.test(src), label + ': no save still blocks on a full load()',
    blockingReload.test(src) ? 'a save handler still calls load() with no quiet flag' : '');

  /* The refresh function must accept the quiet flag the helper drives it with. */
  if (src.indexOf('load(true)') !== -1) {
    check(/function load\(quiet\)/.test(src), label + ': load() takes the quiet flag it is called with',
      'load(true) is called but load() has no parameter');
    /* Two overlay helpers are in use: UI.showSpinner on most pages, and the
       page-local showLoading() on the two manufacturing screens. Either one
       counts, so long as the quiet flag suppresses it. */
    check(/if \(!quiet\) UI\.showSpinner\(\)/.test(src) || /if \(!quiet\) showLoading\(/.test(src),
      label + ': and a quiet refresh does not raise the blocking overlay');
  }

  /* An optimistic save has to be able to roll back, which needs all four. */
  if (src.indexOf('UIC.Live.save') !== -1) {
    const blocks = src.split('UIC.Live.save(').slice(1);
    blocks.forEach(function (b, i) {
      const head = b.slice(0, 700);
      const has = k => new RegExp('\\b' + k + ':').test(head);
      check(has('call') && has('action') && has('data'),
        label + ': save #' + (i + 1) + ' passes call/action/data');
      if (has('list')) {
        check(has('key') && has('draft') && has('render'),
          label + ': save #' + (i + 1) + ' patches a list, so it also gives key, draft and render',
          'an optimistic patch without all four cannot be rolled back');
      }
    });
  }
});

if (!converted.length) check(false, 'at least one page has been converted');

console.log('\n2 — rollout state\n');
console.log('  converted (' + converted.length + '):');
converted.forEach(f => console.log('    ' + f.replace('Company_ValleyFoods_', '').replace('.html', '')));
console.log('\n  still on the blocking save+reload (' + pending.length + '):');
pending.forEach(f => console.log('    ' + f.replace('Company_ValleyFoods_', '').replace('.html', '')));
console.log('\n  These are reported, not failed: the migration is staged on purpose.');
console.log('  They behave exactly as they always did until they are converted.\n');

console.log((failed === 0
  ? 'S19 — every converted page is converted correctly.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
