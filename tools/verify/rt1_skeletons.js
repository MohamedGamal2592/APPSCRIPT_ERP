/**
 * RT1 — a read draws a skeleton, not a blocking overlay.
 *
 * The rule this enforces, stated once at UIC.showPageLoading and enforced here:
 *
 *   A full-screen overlay is for a WRITE THE USER MUST NOT INTERRUPT and for
 *   nothing else. A read draws a skeleton in place. A background refresh draws
 *   nothing but the progress hairline.
 *
 * The overlay covers the shell as well as the content, so raising it for a read
 * takes away the nav, the header and every part of the page that was already on
 * screen and working. That is why this is a rule rather than a preference, and
 * why a load/fetch/render function that raises it fails the build.
 *
 * What this file CANNOT prove, and does not pretend to: that a skeleton is on
 * screen within 150 ms, that it does not flash, or that the table stops
 * reflowing when data lands. There is no layout engine here and no real event
 * loop. Those are on the owner's visual checklist. What is provable is the
 * shape — which function draws what, and that the shared helper degrades safely
 * — and that is what is checked.
 *
 * Run: node tools/verify/rt1_skeletons.js
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

/* Blank comments and the CONTENTS of string/template literals, keeping length
 * and newlines, so brace counting and pattern matching see code only. Written
 * out rather than reused from s20 because that file's stripper leaves string
 * literals intact, and a `{` inside one silently breaks the brace walk. */
function mask(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2;
      blank(i, end); i = end; continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      let e = src.indexOf('\n', i); if (e < 0) e = n;
      blank(i, e); i = e; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) break;
        j++;
      }
      blank(i + 1, Math.min(j, n)); i = Math.min(j + 1, n); continue;
    }
    i++;
  }
  return out.join('');
}

function spans(masked) {
  const out = [];
  const re = /function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const open = masked.indexOf('{', m.index + m[0].length - 1);
    if (open === -1) continue;
    let d = 0;
    for (let j = open; j < masked.length; j++) {
      if (masked[j] === '{') d++;
      else if (masked[j] === '}') { d--; if (d === 0) { out.push({ name: m[1], open, close: j }); break; } }
    }
  }
  return out;
}

const PAGES = fs.readdirSync(ROOT).filter(function (f) {
  return f.endsWith('.html') && f !== 'appsheet_old_project.html';
});

/* ── 1. The rule is written where it cannot be missed ────────────────────── */

const UICRAW = fs.readFileSync(path.join(ROOT, 'UI_Components.html'), 'utf8');
const UIC = mask(UICRAW);

const ruleAt = UICRAW.indexOf('UIC.showPageLoading = function');
const preamble = UICRAW.slice(Math.max(0, ruleAt - 1200), ruleAt);
check(/write the user must not interrupt/i.test(preamble),
  'the rule is stated immediately above UIC.showPageLoading');
check(/UIC\.readSkeleton/.test(preamble),
  'and it names the helper to use instead');

/* ── 2. The three skeletons exist and degrade safely ─────────────────────── */

['readSkeleton', 'tableSkeleton', 'formSkeleton', 'cardSkeleton'].forEach(function (n) {
  check(new RegExp('UIC\\.' + n + '\\s*=\\s*function').test(UIC), 'UIC.' + n + ' exists');
});

const rs = UIC.slice(UIC.indexOf('UIC.readSkeleton = function'));
const rsBody = rs.slice(0, rs.indexOf('\nUIC._clearReadProgress'));
check(/showPageLoading\(/.test(rsBody),
  'readSkeleton falls back to the overlay when it cannot find a container — a wrong id degrades to today, not to a blank page');
check(/listProgress\(/.test(rsBody),
  'a container that already holds content gets the hairline, so a refresh never wipes what someone is reading');
check(/_skelPainted\.push/.test(rsBody),
  'every painted skeleton is recorded, so it can be cleared if the render never comes');

const clr = UIC.slice(UIC.indexOf('UIC._clearReadProgress = function'));
const clrBody = clr.slice(0, clr.indexOf('\n};') + 3);
check(/_skelPainted/.test(clrBody) && /innerHTML\s*=\s*''/.test(clrBody),
  'a skeleton still on screen when the read ends is cleared — no page can be stranded shimmering');
check(/nextElementSibling/.test(clrBody),
  'and a render that replaced the skeleton is left alone');

const helpers = mask(fs.readFileSync(path.join(ROOT, 'Client_Helpers.html'), 'utf8'));
check(/UI\.hideSpinner\s*=\s*function[\s\S]{0,300}_clearReadProgress/.test(helpers),
  'UI.hideSpinner drains both, so no call site had to learn a second name');

/* The real <thead> is what stops the table reflowing when the rows land. */
check(/_dtHeadRow\(/.test(UIC.slice(UIC.indexOf('UIC.tableSkeleton = function'), UIC.indexOf('UIC.formSkeleton = function'))),
  'tableSkeleton draws the REAL head row, so the table does not jump when data arrives');

/* ── 3. No read path raises the overlay ──────────────────────────────────── */

const OVERLAY = /(UI\.showSpinner|UIC\.showPageLoading|UIC\.withPageLoading)\s*\(/g;
const READ_NAME = /^(load|render|show)(List|Data|Table)?$/;    /* the plan's own rule */
const BROAD_READ = /^(load|fetch|render|refresh|reload|display|populate)[A-Za-z0-9_$]*$/;
const WRITE_ACTION = /['"](add|edit|save|update|delete|remove|approve|post|submit|transfer|assign|revise|cancel|import|generate|close|open)_[a-z0-9_]+['"]/i;

const strict = [];
const broad = [];
let converted = 0;

PAGES.forEach(function (file) {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = mask(raw);
  const fns = spans(m);
  converted += (raw.match(/UIC\.readSkeleton\(/g) || []).length;

  fns.forEach(function (fn) {
    const body = m.slice(fn.open, fn.close);
    const hits = (body.match(OVERLAY) || []).length;
    if (!hits) return;
    /* the innermost declaration owns the site */
    const inner = fns.filter(function (o) { return o !== fn && o.open > fn.open && o.close < fn.close; });
    const own = hits - inner.reduce(function (a, o) {
      return a + ((m.slice(o.open, o.close).match(OVERLAY) || []).length);
    }, 0);
    if (own <= 0) return;

    const rawBody = raw.slice(fn.open, fn.close);
    if (WRITE_ACTION.test(rawBody)) return;          /* a genuine write keeps it */
    if (READ_NAME.test(fn.name)) strict.push('        ' + file + ' — ' + fn.name + '()');
    else if (BROAD_READ.test(fn.name)) broad.push('        ' + file + ' — ' + fn.name + '()');
  });
});

check(strict.length === 0,
  'no load/render/show function raises the blocking overlay (the plan\'s rule, exactly)',
  strict.join('\n'));
check(broad.length === 0,
  'and neither does any other fetch/refresh/populate function',
  broad.join('\n'));
check(converted >= 90,
  converted + ' read sites draw a skeleton instead of an overlay');

/* ── 4. The shell is painted before the data call, never inside it ───────── */

const late = [];
PAGES.forEach(function (file) {
  const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = mask(raw);
  const re = /\.then\s*\(/g;
  let x;
  while ((x = re.exec(m)) !== null) {
    const o = m.indexOf('(', x.index + x[0].length - 1);
    let d = 0, c = -1;
    for (let j = o; j < m.length; j++) {
      if (m[j] === '(') d++;
      else if (m[j] === ')') { d--; if (d === 0) { c = j; break; } }
    }
    if (c === -1) continue;
    if (/UIC\.appShell\s*\(/.test(m.slice(o, c))) {
      late.push('        ' + file + ' line ' + raw.slice(0, o).split('\n').length);
    }
  }
});
check(late.length === 0,
  'UIC.appShell is never called inside a .then() — nav and header are on screen in the first frame',
  late.join('\n'));

console.log('\n' + (failed === 0
  ? 'RT1 — reads draw skeletons, writes keep the overlay, and nothing can be stranded loading.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);
