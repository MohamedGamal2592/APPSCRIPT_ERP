/**
 * S19 — the UIC.Live rollout, across all four companies.
 *
 * EXTENDED 2026-09-07 by the realtime-feel run, R4. It covered ValleyFoods
 * alone, because ValleyFoods was the only company with any of this wired. The
 * rollout now reaches TopChemical, TopLight and the Assessment Centre, and a
 * check that looks at one company out of four reports a migration as finished
 * when three quarters of it has not started.
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
/* The four registries, and the page prefix each one serves. PAGE_ACCESS lives
 * in the company's own actions file, so a page id is only "known" to the
 * company that gates it — checking a TopLight page against the ValleyFoods
 * registry would recognise nothing and fail everything. */
const COMPANIES = [
  { prefix: 'Company_ValleyFoods_', actions: 'Company_ValleyFoods_Actions.js', label: 'ValleyFoods' },
  { prefix: 'Company_TopChemical_', actions: 'Company_TopChemical_Actions.js', label: 'TopChemical' },
  { prefix: 'Company_TopLight_', actions: 'Company_TopLight_Actions.js', label: 'TopLight' },
  { prefix: 'Company_Assessment_', actions: 'Company_Assessment_Actions.js', label: 'Assessment' }
].filter(c => fs.existsSync(path.join(ROOT, c.actions)));

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log('        ' + extra); }
}

/* Every page id a company's server knows about, from its own PAGE_ACCESS. */
const _knownCache = {};
function knownPages(actionsFile) {
  if (_knownCache[actionsFile]) return _knownCache[actionsFile];
  const src = fs.readFileSync(path.join(ROOT, actionsFile), 'utf8');
  const out = {};
  const re = /'[a-z0-9_]+':\s*\{\s*page:\s*'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out[m[1]] = true;
  const defs = /handler:\s*(?:'[^']*'|[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*page:\s*'([a-z0-9_]+)'/g;
  while ((m = defs.exec(src)) !== null) out[m[1]] = true;
  _knownCache[actionsFile] = out;
  return out;
}

function companyOf(file) {
  return COMPANIES.filter(c => file.indexOf(c.prefix) === 0)[0] || null;
}

const converted = [];
const pending = [];

fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && companyOf(f)).sort().forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  /* A converted page no longer contains a literal companyCall('save_...' —
     the action name moved into the UIC.Live.save options — so the write action
     is looked for wherever it appears, not only at a call site. */
  /* UPDATED 2026-09-07, R4: `action:` is very often a ternary —
   * `action: isEdit ? 'edit_x' : 'add_x'` — so anchoring on `action: '` missed
   * every page converted with an edit/add pair and quietly dropped it out of
   * the census entirely. A converted page disappearing from the rollout report
   * is the one bug a rollout report must not have. */
  const WRITE_VERB = '(save|add|edit|update|approve|delete|remove|toggle|transfer|commit|resolve|revert)';
  const savesToServer =
    new RegExp("companyCall\\(\\s*'" + WRITE_VERB + '_').test(src) ||
    new RegExp('action:[^,\\n]{0,80}?' + "'" + WRITE_VERB + '_').test(src);
  if (!savesToServer) return;
  (src.indexOf('UIC.Live.save') !== -1 || src.indexOf('UIC.Live.watchPage') !== -1 ? converted : pending).push(f);
});

console.log('\n1 — converted pages are converted correctly\n');

converted.forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const co = companyOf(f);
  const KNOWN_PAGES = knownPages(co.actions);
  const label = co.label + '/' + f.replace(co.prefix, '').replace('.html', '');

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
  /* A watch is only possible where the company's server answers
   * get_page_versions. Requiring one before that endpoint exists would demand
   * a poll that is refused on every tick — worse than no watch, because it
   * costs an execution every interval and never returns anything. So the
   * requirement is conditional on the endpoint, and the companies that lack it
   * are named in the report rather than passing silently. */
  const canWatch = fs.readFileSync(path.join(ROOT, co.actions), 'utf8')
    .indexOf("'get_page_versions'") !== -1;
  if (canWatch) {
    check(watched.length > 0, label + ': registers a change watch', 'none found');
  } else if (!watched.length) {
    console.log('  ..    ' + label + ': no change watch — ' + co.label +
      ' has no get_page_versions endpoint yet');
  }
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
    /* Three first-paint helpers are now in use: UIC.readSkeleton on the pages
       the skeleton rollout converted, UI.showSpinner on the ones it did not,
       and the page-local showLoading() on the two manufacturing screens. Any
       of them counts, so long as the quiet flag suppresses it.
     *
     * UPDATED 2026-09-07 by the realtime-feel run, R3, and the reason is
     * recorded here rather than in a commit nobody will re-read:
     *
     *   A read no longer raises the blocking overlay at all — it draws a
     *   skeleton, or, over content that is already on screen, a progress
     *   hairline. So `if (!quiet) UI.showSpinner()` is not the shape these
     *   pages have any more.
     *
     * What this line guards is unchanged and is the thing that matters: a
     * refresh the user did not ask for must not draw anything over the screen
     * they are reading. The assertion is retargeted at the helper that now
     * does the drawing, NOT weakened — an unguarded draw of any of the three
     * still fails, and a page that drew unconditionally would still be
     * caught. */
    check(/if \(!quiet\) UIC\.readSkeleton\(/.test(src) ||
          /if \(!quiet\) UI\.showSpinner\(\)/.test(src) ||
          /if \(!quiet\) showLoading\(/.test(src),
      label + ': and a quiet refresh does not draw over the screen');
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
function short(f) {
  const co = companyOf(f);
  return co.label + '/' + f.replace(co.prefix, '').replace('.html', '');
}
COMPANIES.forEach(function (c) {
  const cv = converted.filter(f => f.indexOf(c.prefix) === 0).length;
  const total = cv + pending.filter(f => f.indexOf(c.prefix) === 0).length;
  if (total) console.log('  ' + c.label + ': ' + cv + ' of ' + total + ' write page(s) converted');
});
console.log('\n  converted (' + converted.length + '):');
converted.forEach(f => console.log('    ' + short(f)));
console.log('\n  still on the blocking save+reload (' + pending.length + '):');
pending.forEach(f => console.log('    ' + short(f)));
console.log('\n  These are reported, not failed: the migration is staged on purpose.');
console.log('  They behave exactly as they always did until they are converted.\n');

console.log((failed === 0
  ? 'S19 — every converted page is converted correctly.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);



