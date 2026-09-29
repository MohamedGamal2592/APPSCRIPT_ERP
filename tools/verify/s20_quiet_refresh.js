/**
 * S20 — the quiet-refresh contract.
 *
 * Pages were moved off the blocking save+reload by giving each page's refresh
 * function a `quiet` flag that suppresses the loading overlay, so a refresh
 * caused by a write never interrupts a user who has already seen the change.
 *
 * That rollout is a text edit applied across ~20 files, and it has one failure
 * mode that is invisible to a parser: guarding a `UI.hideSpinner()` that sits
 * in a DIFFERENT function, one that never took the flag. The file still parses;
 * `quiet` is simply not in scope, and the page throws a ReferenceError at the
 * exact moment a save is completing. Fifteen of those existed when this check
 * was first written.
 *
 * So: every reference to `quiet` must sit inside a function that declares it.
 *
 * The second half checks the rollout is actually wired: a page that registers a
 * change watch must name a real page id and call a real function.
 *
 * Run: node tools/verify/s20_quiet_refresh.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ACTIONS = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

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

/** [openBrace, closeBrace, declaresQuiet, name] for every function body. */
function functionSpans(src) {
  const out = [];
  const re = /function\s*([A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const declares = /\bquiet\b/.test(m[2]);
    const open = src.indexOf('{', m.index + m[0].length - 1);
    if (open === -1) continue;
    let depth = 0;
    for (let j = open; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) { out.push([open, j, declares, m[1] || '(anonymous)']); break; }
      }
    }
  }
  return out;
}

const pages = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f)).sort();

/* ══ 1. no `quiet` outside a function that declares it ══════════════════ */
console.log('\n1 — every `quiet` reference is in scope\n');
{
  let offenders = 0;
  const detail = [];
  pages.forEach(function (f) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (src.indexOf('quiet') === -1) return;
    const fns = functionSpans(src);
    const re = /\bquiet\b/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      let lineEnd = src.indexOf('\n', m.index);
      if (lineEnd === -1) lineEnd = src.length;
      const line = src.slice(lineStart, lineEnd);
      /* the parameter declaration itself is what puts it in scope */
      if (/function\s*[A-Za-z0-9_]*\s*\([^)]*\bquiet\b/.test(line)) continue;
      const covering = fns.filter(s => m.index > s[0] && m.index < s[1]);
      if (!covering.some(s => s[2])) {
        offenders++;
        detail.push('        ' + f + ':' + src.slice(0, m.index).split('\n').length +
          '  ' + line.trim().slice(0, 88));
      }
    }
  });
  check(offenders === 0,
    'no page references `quiet` outside a function that declares it',
    detail.join('\n'));
}

/* ══ 2. a guarded show implies a guarded hide, in the same function ═════ */
console.log('\n2 — a refresh that suppresses the overlay also suppresses hiding it\n');
{
  const bad = [];
  pages.forEach(function (f) {
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (src.indexOf('if (!quiet) UI.showSpinner()') === -1) return;
    const fns = functionSpans(src).filter(s => s[2]);
    /* the function that guards the show must also guard every hide it owns */
    fns.forEach(function (s) {
      const body = src.slice(s[0], s[1]);
      if (body.indexOf('if (!quiet) UI.showSpinner()') === -1) return;
      const unguarded = (body.match(/(?<!if \(!quiet\) )UI\.hideSpinner\(\)/g) || []).length;
      if (unguarded) bad.push('        ' + f + ' — ' + s[3] + '() hides the overlay unguarded');
    });
  });
  check(bad.length === 0,
    'every quiet-aware refresh guards its hideSpinner too',
    bad.join('\n'));
}

/* ══ 3. the watches are wired to something real ═════════════════════════ */
console.log('\n3 — every change watch names a real page and a real function\n');
{
  /* UPDATED 2026-09-07 by the realtime-feel run, R6, and the reason is recorded
   * here rather than in a commit nobody will re-read:
   *
   *   This read PAGE_ACCESS from Company_ValleyFoods_Actions.js alone, because
   *   ValleyFoods was the only company with a change watch. The watch now runs
   *   in TopChemical and TopLight too, and their page ids live in THEIR OWN
   *   actions files — so every one of them looked like "a page id no action
   *   maps to".
   *
   * The assertion is not weakened: a watch on a page id that no company gates
   * still fails, and that is the failure worth catching (it polls forever and
   * is refused every time). It now checks against every registry instead of
   * one. */
  const knownPages = {};
  let m;
  ['Company_ValleyFoods_Actions.js', 'Company_TopChemical_Actions.js',
   'Company_TopLight_Actions.js', 'Company_Assessment_Actions.js']
    .filter(f => fs.existsSync(path.join(ROOT, f)))
    .forEach(function (f) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const re = /'[a-z0-9_]+':\s*\{\s*page:\s*'([a-z0-9_]+)'/g;
      let x;
      while ((x = re.exec(src)) !== null) knownPages[x[1]] = true;
      const defs = /handler:\s*(?:'[^']*'|[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*page:\s*'([a-z0-9_]+)'/g;
      while ((x = defs.exec(src)) !== null) knownPages[x[1]] = true;
    });

  let watched = 0;
  const bad = [];
  pages.forEach(function (f) {
    const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const src = stripComments(raw);
    const wre = /UIC\.Live\.watchPage\(\{([\s\S]{0,400}?)\}\)/g;
    let w;
    while ((w = wre.exec(src)) !== null) {
      watched++;
      const block = w[1];
      const pg = /page:\s*'([a-z0-9_]+)'/.exec(block);
      if (pg) {
        if (!knownPages[pg[1]]) {
          bad.push('        ' + f + " — watches '" + pg[1] + "', which no action maps to");
        }
      } else if (/page:\s*[A-Za-z_$][A-Za-z0-9_$]*\s*,/.test(block)) {
        /* One screen may watch several page ids by looping an array literal
           (HR_Emp does: employees, status, shifts, salary all render there).
           Validate the ids in the nearest preceding array instead. */
        const before = src.slice(Math.max(0, w.index - 400), w.index);
        const arr = /\[([^\]]*'[a-z0-9_]+'[^\]]*)\]/.exec(before);
        const ids = arr ? (arr[1].match(/'([a-z0-9_]+)'/g) || []).map(x => x.replace(/'/g, '')) : [];
        if (!ids.length) {
          bad.push('        ' + f + ' — a watch over a variable with no page-id list to check');
        }
        ids.forEach(function (id) {
          if (!knownPages[id]) bad.push('        ' + f + " — watches '" + id + "', which no action maps to");
        });
      } else {
        bad.push('        ' + f + ' — a watch with no page id');
        continue;
      }
      const fn = /onChange:\s*function\s*\(\)\s*\{\s*([A-Za-z0-9_]+)\s*\(/.exec(block);
      if (fn && src.indexOf('function ' + fn[1] + '(') === -1) {
        bad.push('        ' + f + ' — onChange calls ' + fn[1] + '(), which the page does not define');
      }
      if (!/call:\s*companyCall/.test(block)) {
        bad.push('        ' + f + ' — a watch with no call transport');
      }
    }
  });
  check(watched > 0, watched + ' page(s) register a change watch');
  check(bad.length === 0, 'every watch names a real page id and a real function', bad.join('\n'));
}

/* ══ 4. no page still blocks on a write-triggered refresh ═══════════════ */
console.log('\n4 — a converted page does not still block on its own writes\n');
{
  const WRITE = '(?:save|add|approve|delete|remove|toggle|transfer|commit|resolve|revert)_[a-z_]+';
  const bad = [];
  let converted = 0;
  pages.forEach(function (f) {
    if (!/^Company_ValleyFoods_/.test(f)) return;
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (src.indexOf('UIC.Live.watchPage') === -1) return;
    converted++;
    /* the refresh function the page made quiet */
    const sig = /function\s+([A-Za-z0-9_]+)\s*\(\s*quiet\s*\)/.exec(src);
    if (!sig) { bad.push('        ' + f + ' — watches, but no function takes `quiet`'); return; }
    const name = sig[1];
    /* a write .then that calls it WITHOUT the flag is still a blocking reload */
    const re = new RegExp("companyCall\\('" + WRITE + "'[\\s\\S]{0,1200}?\\.then\\(function[^)]*\\)\\s*\\{[\\s\\S]{0,600}?\\}\\)", 'g');
    let mm;
    while ((mm = re.exec(src)) !== null) {
      if (new RegExp('\\b' + name + '\\(\\s*\\)').test(mm[0])) {
        bad.push('        ' + f + ' — a write still calls ' + name + '() blocking');
      }
    }
  });
  check(converted > 0, converted + ' ValleyFoods page(s) converted');
  check(bad.length === 0, 'no converted page blocks on a refresh it triggered itself', bad.join('\n'));
}

/* ══ 5. no save leaves the loading overlay up ═══════════════════════════ */
console.log('\n5 — a save that raises the overlay also lowers it\n');
{
  /* Before the rollout most saves did NOT hide their own spinner: they called
     load(), and load()'s own .finally(UI.hideSpinner) cleared it as a side
     effect. Making that refresh quiet removed the hide, so the overlay stayed
     up after a successful save — the success toast appearing behind a modal
     that never closed. Two purchasing paths did exactly that.

     A save leaks when, in the same function, it shows the overlay and the only
     hide is inside .catch(...) — or there is no hide at all. */
  const WRITE = /companyCall\('(?:save|add|approve|delete|remove|toggle|transfer|commit|resolve|revert)_[a-z_]+'/;

  function bodies(src) {
    const out = [];
    const re = /function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const open = src.indexOf('{', m.index + m[0].length - 1);
      let depth = 0;
      for (let j = open; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') {
          depth--;
          if (depth === 0) { out.push({ name: m[1], args: m[2], body: src.slice(open, j + 1) }); break; }
        }
      }
    }
    return out;
  }

  function catches(body) {
    const out = [];
    const re = /\.catch\s*\(/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      let depth = 0;
      for (let j = m.index + m[0].length - 1; j < body.length; j++) {
        if (body[j] === '(') depth++;
        else if (body[j] === ')') { depth--; if (depth === 0) { out.push(body.slice(m.index, j + 1)); break; } }
      }
    }
    return out;
  }

  const SHOW = /UI\.showSpinner\(|(?:^|[^A-Za-z_.])showLoading\(/;
  const HIDE = /UI\.hideSpinner\(|(?:^|[^A-Za-z_.])hideLoading\(/g;

  const bad = [];
  let checked = 0;
  pages.forEach(function (f) {
    if (!/^Company_ValleyFoods_/.test(f)) return;
    const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    bodies(src).forEach(function (fn) {
      if (!WRITE.test(fn.body)) return;
      if (/\bquiet\b/.test(fn.args)) return;      /* that is the refresh itself */
      if (!SHOW.test(fn.body)) return;
      checked++;
      const inCatch = catches(fn.body).join('\n');
      const all = (fn.body.match(HIDE) || []).length;
      const only = (inCatch.match(HIDE) || []).length;
      if (all - only === 0) {
        bad.push('        ' + f + ' — ' + fn.name +
          '() raises the overlay and only lowers it on error');
      }
    });
  });
  check(checked > 0, checked + ' write path(s) raise the loading overlay');
  check(bad.length === 0,
    'every one of them lowers it on success too, not just on error',
    bad.join('\n'));
}

console.log('\n' + (failed === 0
  ? 'S20 — the quiet-refresh rollout is consistent.'
  : failed + ' check(s) FAILED.'));
process.exit(failed === 0 ? 0 : 1);


