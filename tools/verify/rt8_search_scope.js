/**
 * RT8 — the search box may not lie about what it searched.
 *
 * `UIC.dataTable` renders a search box by default (`o.searchable !== false`),
 * and `UIC._applyFilters` filters `st.originalRows` in memory. It never calls
 * the server. Meanwhile the list endpoints cap their reply at the newest
 * `limit` rows — `if (!data || !data.loadAll) rows = rows.slice(0, limit)` —
 * unless the page asks for `loadAll`.
 *
 * Put together: on those pages a user searching for a record that exists gets
 * "no results", with nothing on screen to say the search only ever looked at a
 * slice of the table. That is a correctness bug, not a performance one, and it
 * is the one thing in the realtime work that makes the system *wrong* rather
 * than merely slow.
 *
 * This check keeps it fixed. For every registered action whose handler
 * truncates, it finds the pages that call it, and requires the page's
 * `UIC.dataTable` to either
 *
 *   - turn the box off (`searchable: false`), or
 *   - declare the scope (`truncated:`), which makes `UIC.dataTable` draw the
 *     notice beside the box, or
 *   - drive the box from the server (a `search` parameter in the payload).
 *
 * It does NOT check Arabic normalisation (أ/إ/آ→ا, ة→ه, ى→ي). That belongs to
 * the index work and is deliberately out of this run's scope: this check is
 * about *what* is searched, not *how* it is matched.
 *
 * Run: node tools/verify/rt8_search_scope.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let failed = 0;
function check(ok, label, extra) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); if (extra !== undefined) console.log(extra); }
}

/** Blank every comment, keeping character positions, so prose is not read as code. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, function (m) {
    return m.replace(/[^\n]/g, ' ');
  });
}

const ACTION_FILES = [
  'Company_TopChemical_Actions.js',
  'Company_TopLight_Actions.js',
  'Company_ValleyFoods_Actions.js',
  'Company_Assessment_Actions.js'
].filter(function (f) { return fs.existsSync(path.join(ROOT, f)); });

/* ── 1. Which registered actions hand the client a truncated list? ───────── */

const truncatingActions = {};   /* action -> 'File:handlerName' */
const searchBacked = {};        /* action -> true when the handler reads data.search */

ACTION_FILES.forEach(function (file) {
  const src = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const lines = src.split('\n');

  /* A handler truncates when it caps its own reply behind the `loadAll` escape
   * hatch. Walking back to the nearest `function name(` is enough here because
   * these handlers are top-level declarations inside one IIFE, never nested. */
  const truncating = new Set();
  const searches = new Set();
  lines.forEach(function (L, i) {
    const caps = /\bloadAll\b/.test(L) && /\.slice\(\s*0\s*,\s*limit\s*\)/.test(L);
    const srch = /\bdata\s*(?:&&\s*data)?\s*\.\s*search\b/.test(L);
    if (!caps && !srch) return;
    for (let j = i; j >= 0 && j > i - 300; j--) {
      const m = /^\s*function\s+([A-Za-z0-9_]+)\s*\(/.exec(lines[j]);
      if (m) { (caps ? truncating : searches).add(m[1]); break; }
    }
  });

  const re = /register\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (truncating.has(m[2])) truncatingActions[m[1]] = file + ':' + m[2];
    if (searches.has(m[2])) searchBacked[m[1]] = true;
  }
});

check(Object.keys(truncatingActions).length > 0,
  Object.keys(truncatingActions).length + ' registered action(s) return a truncated list');

/* ── 2. Every page rendering one of those lists must declare its search scope ── */

const PAGES = fs.readdirSync(ROOT).filter(function (f) {
  return f.endsWith('.html') && /^(Company_|User_|DbLive_|0_|Platform)/.test(f);
});

const offenders = [];
const declared = [];

PAGES.forEach(function (page) {
  const raw = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const src = stripComments(raw);
  if (src.indexOf('UIC.dataTable(') === -1) return;

  const acts = Object.keys(truncatingActions).filter(function (a) {
    return new RegExp("['\"]" + a + "['\"]").test(src);
  });
  if (!acts.length) return;

  /* The whole page is the unit here on purpose. Every one of these pages
   * renders exactly one data table, so "the page declares its scope" and "the
   * truncated table declares its scope" are the same statement — and a check
   * that tried to bind a particular call site to a particular action would be
   * guessing at which of two tables held which list. If a page ever grows a
   * second table this check gets stricter, not looser. */
  const serverBacked = acts.every(function (a) { return searchBacked[a]; });
  const offNoBox = /searchable\s*:\s*false/.test(src);
  const declares = /\btruncated\s*:/.test(src);

  if (serverBacked || offNoBox || declares) {
    declared.push('        ' + page + ' — ' +
      (serverBacked ? 'server-backed search' : declares ? 'scope declared' : 'search box off') +
      '  [' + acts.join(', ') + ']');
  } else {
    offenders.push('        ' + page + ' searches only the rows ' + acts.join('/') +
      ' returned, and says nothing  (' + truncatingActions[acts[0]] + ')');
  }
});

check(declared.length > 0, declared.length + ' page(s) over a truncated list declare their search scope');
check(offenders.length === 0,
  'no page renders a search box over a truncated list in silence',
  offenders.join('\n'));

/* ── 3. The component has to honour the declaration ──────────────────────── */

const UIC = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
const uicCode = stripComments(UIC);

check(/if\s*\(\s*o\.truncated\s*\)/.test(uicCode),
  'UIC.dataTable acts on `truncated`');
check(/dt-search-scope/.test(uicCode),
  'the notice is rendered with the .dt-search-scope class');
check(/\.dt-search-scope\s*\{/.test(UIC),
  '.dt-search-scope is defined in the shared stylesheet, not left an orphan class');

/* The notice must sit inside the `searchable` branch: a table with no search
 * box has nothing to be honest about, and a notice there is just noise. */
const searchBranch = uicCode.indexOf('if (searchable) {');
const truncBranch = uicCode.indexOf('if (o.truncated) {');
const dateBranch = uicCode.indexOf('if (o.dateFilter) {');
check(searchBranch !== -1 && truncBranch > searchBranch && truncBranch < dateBranch,
  'the notice is drawn only when the search box is drawn');

console.log('\n' + (failed === 0
  ? 'RT8 — every search box says what it searched.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
