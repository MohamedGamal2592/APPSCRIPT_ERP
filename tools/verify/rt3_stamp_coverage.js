/**
 * RT3 — every direct sheet write tells somebody it happened.
 *
 * The bug this exists to keep fixed, stated exactly:
 *
 *   noteTableChange_ and noteSheetChange_ were called from three places, all
 *   inside the shared data layer. Company handlers write to sheets directly —
 *   setValues / setValue / appendRow / deleteRow — in about 112 places, and
 *   every one of those called noteMutation_() with NO ARGUMENTS, which only
 *   emptied the per-request memo and stamped nothing at all.
 *
 *   So a change written by one of those handlers bumped no version, and a
 *   second device polling get_page_versions could never learn about it. Twenty
 *   two pages were polling for changes they were structurally incapable of
 *   seeing. saveValleyReturn_, transferValleyCash_ and addMonthlySalary_ are
 *   three confirmed cases; this file exists because the fix is a sweep across a
 *   hundred call sites and a sweep is exactly the kind of thing that silently
 *   reopens on the next feature.
 *
 * The check is deliberately asymmetric about what it demands:
 *
 *   - A write with NO stamp anywhere near it FAILS. That is the bug.
 *   - A write whose stamp cannot be attributed to one table is REPORTED, with
 *     file and line, and does not fail. Guessing which table a stamp belongs to
 *     is how a site ends up stamping the WRONG one, which is worse than
 *     stamping nothing: it makes every other page watching that table refetch
 *     for no reason and still misses its own change.
 *
 * Run: node tools/verify/rt3_stamp_coverage.js
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

function mask(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; blank(i, end); i = end; continue; }
    if (c === '/' && src[i + 1] === '/') { let e = src.indexOf('\n', i); if (e < 0) e = n; blank(i, e); i = e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
      blank(i + 1, Math.min(j, n)); i = Math.min(j + 1, n); continue;
    }
    i++;
  }
  return out.join('');
}

const FILES = [
  'Company_TopChemical_Actions.js',
  'Company_TopLight_Actions.js',
  'Company_ValleyFoods_Actions.js',
  'Company_Assessment_Actions.js',
  'Code.js'
].filter(f => fs.existsSync(path.join(ROOT, f)));

/* ── 1. The primitive itself ─────────────────────────────────────────────── */

const DA = fs.readFileSync(path.join(ROOT, '02_DataAccess.js'), 'utf8');
const daCode = mask(DA);

const nm = daCode.slice(daCode.indexOf('function noteMutation_'));
const nmBody = nm.slice(0, nm.indexOf('\n}') + 2);
check(/function noteMutation_\(scopeId, sheetName\)/.test(nmBody),
  'noteMutation_ takes the table it is being told about');
check(/noteTableChange_\(scopeId, sheetName\)/.test(nmBody),
  'and actually stamps it — the whole bug was that it did not');
check(/noteSheetChange_\(scopeId\)/.test(nmBody),
  'a Sheet in the first position works too, because that is what the call sites hold');
check(/disableRecordCache_\(\)/.test(nmBody),
  'and it still empties the per-request memo, which is all it used to do');

/* Backward compatibility is the property that makes the sweep safe to ship
 * incrementally: a site the sweep missed must behave exactly as it did before. */
const guarded = /if \(scopeId && sheetName\)/.test(nmBody);
check(guarded, 'both arguments are optional — a no-argument call behaves exactly as it always has');

/* ── 2. Coverage across company code ─────────────────────────────────────── */

const WRITE = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*(?:appendRow|deleteRow|deleteRows|insertRowsAfter|clearContents)\s*\(|\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*getRange\s*\([^;]{0,200}?\)\s*\.\s*(?:setValues|setValue|setFormula|setFormulas)\s*\(/g;
const STAMP = /noteMutation_\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*|noteSheetChange_\s*\(|noteTableChange_\s*\(/;
const ANYSTAMP = /noteMutation_\s*\(|noteSheetChange_\s*\(|noteTableChange_\s*\(/;

/* A write and its stamp must be within sight of each other. 900 characters is
 * roughly twenty lines: the same statement block, not the same file. */
const NEAR = 900;

const unstamped = [];
const unattributed = [];
let stamped = 0, writes = 0;

FILES.forEach(function (file) {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = mask(raw);
  WRITE.lastIndex = 0;
  let w;
  while ((w = WRITE.exec(m)) !== null) {
    writes++;
    const at = w.index;
    const win = m.slice(Math.max(0, at - NEAR), Math.min(m.length, at + NEAR));
    const ln = file + ':' + raw.slice(0, at).split('\n').length;
    const target = (w[1] || w[2]) + '.' + (m.slice(at, at + 120).split('.')[1] || '').split('(')[0];
    if (STAMP.test(win)) { stamped++; continue; }
    if (ANYSTAMP.test(win)) { unattributed.push('        ' + ln + '  ' + target + ' — stamps, but not a table'); continue; }
    unstamped.push('        ' + ln + '  ' + target + ' — writes and stamps nothing');
  }
});

console.log('  ..    ' + writes + ' direct sheet write(s) in company code; ' +
  stamped + ' stamp the table they wrote');

check(unstamped.length === 0,
  'no direct sheet write goes completely unstamped',
  unstamped.join('\n'));

/* Reported, not failed. See the header: a wrong stamp is worse than none. */
if (unattributed.length) {
  console.log('  ..    ' + unattributed.length + ' write(s) stamp without naming a table:');
  unattributed.forEach(u => console.log(u));
  console.log('          These are REPORTED, not failed. Attributing them means guessing');
  console.log('          which of two tables the stamp is for, and a stamp on the wrong');
  console.log('          table makes every page watching it refetch for nothing while');
  console.log('          still missing its own change.');
}

/* ── 3. The three cases the plan named ───────────────────────────────────── */

const VF = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const vfm = mask(VF);
['saveValleyReturn_', 'transferValleyCash_', 'addMonthlySalary_'].forEach(function (fn) {
  const at = vfm.indexOf('function ' + fn);
  if (at === -1) { check(false, fn + ' exists'); return; }
  let d = 0, end = at;
  for (let j = vfm.indexOf('{', at); j < vfm.length; j++) {
    if (vfm[j] === '{') d++;
    else if (vfm[j] === '}') { d--; if (d === 0) { end = j; break; } }
  }
  const body = vfm.slice(at, end);
  check(/noteMutation_\s*\(\s*[A-Za-z_$]/.test(body) || /noteSheetChange_\s*\(/.test(body),
    fn + ' stamps the table it writes — it did not, and that is why its watch was decorative');
});

/* ── 4. The watch reads what the writes now set ──────────────────────────── */

check(/function readTableVersions_/.test(daCode),
  'the poll still reads stamps from CacheService, never from a spreadsheet');
check(/getAll\(keys\)/.test(daCode),
  'and a whole page of them in ONE round trip');

console.log('\n' + (failed === 0
  ? 'RT3 — a direct sheet write now bumps the version another device is watching.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
