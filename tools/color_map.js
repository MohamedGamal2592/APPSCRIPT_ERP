/**
 * color_map.js — the evidence behind the Phase 2.7 hardcoded-colour sweep.
 *
 *   node tools/color_map.js                 # the mapping table + what is skipped
 *   node tools/color_map.js --company=TopLight
 *   node tools/color_map.js --apply --company=TopLight
 *
 * U-07: hundreds of hardcoded hex colours bypass the token layer, so the design
 * system can only be changed by find-and-replace and dark mode is impossible.
 *
 * This is deliberately NOT a blind find-and-replace. A colour literal is only
 * rewritten when BOTH of these hold:
 *
 *   1. the literal is one of the known token values, AND
 *   2. it is being assigned to a CSS property whose ROLE matches that token
 *      (a border colour becomes --border-color, ink becomes --text-*, a
 *      surface background becomes --bg-*).
 *
 * Everything else is reported and left alone. In particular, per the standing
 * answer on ambiguity: a literal whose meaning IS the specific colour — chart
 * palettes, legend status swatches, anything inside a JS array or a Chart.js
 * config — is never guessed at. Getting one of those wrong silently changes
 * what a chart means.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const S = require('./lib/sources');

const ARGS = process.argv.slice(2);
const APPLY = ARGS.indexOf('--apply') !== -1;
const COMPANY = (ARGS.find(a => a.indexOf('--company=') === 0) || '').split('=')[1] || '';

/* ── Which files belong to which company ────────────────────────────────── */
function filesFor(company) {
  const all = S.pageFiles();
  if (!company) return all;
  if (company === 'shared') {
    return all.filter(f => f.indexOf('Company_') !== 0);
  }
  return all.filter(f => f.indexOf('Company_' + company + '_') === 0);
}

/* ── The token roles ────────────────────────────────────────────────────
 * Each entry: the literals that mean this token, and the CSS properties where
 * that meaning holds. A literal seen on a property outside its list is left
 * alone, because the same hex can mean different things in different roles —
 * #ffffff is a surface as a background and is button ink as a colour. */
const ROLES = [
  {
    token: '--border-color',
    literals: ['#e5e7eb', '#e5e7eb', '#eee', '#eeeeee', '#e2e8f0', '#e2e5ea', '#ddd', '#dddddd'],
    props: ['border', 'border-top', 'border-bottom', 'border-left', 'border-right',
            'border-color', 'border-block', 'border-inline', 'border-block-end',
            'border-block-start', 'border-inline-end', 'border-inline-start',
            'outline', 'outline-color']
  },
  {
    token: '--text-main',
    literals: ['#111827', '#111', '#111111', '#1f2937'],
    props: ['color']
  },
  {
    token: '--text-muted',
    literals: ['#6b7280', '#666', '#666666', '#777', '#777777', '#5b6572', '#64748b'],
    props: ['color']
  },
  {
    token: '--bg-surface',
    literals: ['#ffffff', '#fff'],
    props: ['background', 'background-color']
  },
  {
    token: '--bg-subtle',
    literals: ['#f3f4f6', '#f9fafb', '#f7f8fa', '#f0f0f0', '#fafafa', '#f8fafc'],
    props: ['background', 'background-color']
  },
  {
    token: '--bg-canvas',
    literals: ['#f4f5f7', '#f5f6f8'],
    props: ['background', 'background-color']
  },
  {
    token: '--danger',
    literals: ['#dc2626', '#ef4444'],
    props: ['color', 'background', 'background-color', 'border-color']
  },
  {
    token: '--danger-text',
    literals: ['#991b1b', '#b91c1c'],
    props: ['color']
  },
  {
    token: '--danger-bg',
    literals: ['#fef2f2'],
    props: ['background', 'background-color']
  },
  {
    token: '--warning-bg',
    literals: ['#fffbeb', '#fff7ed'],
    props: ['background', 'background-color']
  },
  {
    token: '--success-bg',
    literals: ['#f0fdf4'],
    props: ['background', 'background-color']
  }
];

/* Contexts in which a colour is DATA, not styling. Never touched. */
const DATA_CONTEXT = [
  /backgroundColor/i, /borderColor/i, /hoverBackground/i, /pointBackground/i,
  /\bcolors?\s*[:=]\s*\[/i, /palette/i, /Chart\b/, /datasets?\b/,
  /\bPALETTE\b/, /\bCOLORS\b/
];

/** Is this position inside something that looks like chart/palette data? */
function inDataContext(line) {
  return DATA_CONTEXT.some(re => re.test(line));
}

/* ── Scan ───────────────────────────────────────────────────────────────── */
const rewrites = [];   /* {file, line, from, to, prop} */
const UNMATCHED = {};
const skipped = {};    /* reason -> [{file,line,text}] */

function skip(reason, file, line, text) {
  (skipped[reason] = skipped[reason] || []).push({ file, line, text: text.trim().slice(0, 110) });
}

function scanFile(file) {
  const src = S.read(file);
  const lines = src.split('\n');
  const out = lines.slice();
  let changed = 0;

  lines.forEach(function (line, i) {
    if (!/#[0-9a-fA-F]{3,8}\b/.test(line)) return;

    if (inDataContext(line)) {
      (line.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(function (hex) {
        skip('chart or palette data — the colour IS the meaning', file, i + 1, line);
      });
      return;
    }

    let newLine = out[i];
    /* `prop: <stuff> #hex <stuff>` — capture the property this colour serves. */
    const re = /([a-zA-Z-]+)\s*:\s*([^;"'`]*?)(#[0-9a-fA-F]{3,8})\b/g;
    let m;
    const edits = [];
    while ((m = re.exec(line)) !== null) {
      const prop = m[1].toLowerCase();
      const hex = m[3].toLowerCase();
      const role = ROLES.find(r =>
        r.literals.indexOf(hex) !== -1 && r.props.indexOf(prop) !== -1);
      if (!role) {
        skip('no role matches this hex on this property', file, i + 1, prop + ': ' + hex);
        UNMATCHED[prop + ': ' + hex] = (UNMATCHED[prop + ': ' + hex] || 0) + 1;
        continue;
      }
      edits.push({ hex: m[3], token: role.token, prop: prop });
    }
    edits.forEach(function (e) {
      /* Replace only the first remaining occurrence of that exact literal. */
      const idx = newLine.indexOf(e.hex);
      if (idx === -1) return;
      /* A literal fallback is kept inside every var(). Several pages build a
         PRINT WINDOW with document.write and their own <style>, and that window
         never includes CSS_Tokens.html — so an unqualified var() there would
         resolve to nothing. With the fallback the rendering is identical
         wherever the token is absent, and tokenised wherever it is present.
         It is also the house style already used in UI_Components.html. */
      newLine = newLine.slice(0, idx) + 'var(' + e.token + ', ' + e.hex + ')' + newLine.slice(idx + e.hex.length);
      rewrites.push({ file, line: i + 1, from: e.hex, to: e.token, prop: e.prop });
      changed++;
    });
    out[i] = newLine;
  });

  return { changed, text: out.join('\n') };
}

const targets = filesFor(COMPANY);
let totalChanged = 0;
const perFile = {};

targets.forEach(function (f) {
  const r = scanFile(f);
  if (!r.changed) return;
  perFile[f] = r.changed;
  totalChanged += r.changed;
  if (APPLY) fs.writeFileSync(path.join(S.ROOT, f), r.text, 'utf8');
});

/* ── Report ─────────────────────────────────────────────────────────────── */
console.log((APPLY ? 'APPLIED' : 'DRY RUN') + (COMPANY ? '  company=' + COMPANY : '  (all pages)'));
console.log('files scanned: ' + targets.length);
console.log('');
console.log('MAPPING TABLE — literal -> token, by role');
console.log('-'.repeat(72));
const byMap = {};
rewrites.forEach(function (r) {
  const k = r.from + '  ->  var(' + r.to + ')';
  byMap[k] = (byMap[k] || 0) + 1;
});
Object.keys(byMap).sort(function (a, b) { return byMap[b] - byMap[a]; })
  .forEach(function (k) { console.log('  ' + String(byMap[k]).padStart(4) + '  ' + k); });
console.log('');
console.log('  total rewrites: ' + totalChanged + ' across ' + Object.keys(perFile).length + ' file(s)');
console.log('');
console.log('LEFT ALONE — reported, never guessed at');
console.log('-'.repeat(72));
Object.keys(skipped).forEach(function (reason) {
  const list = skipped[reason];
  console.log('  ' + list.length + '  ' + reason);
  const files = {};
  list.forEach(s => { files[s.file] = (files[s.file] || 0) + 1; });
  Object.keys(files).sort((a, b) => files[b] - files[a]).slice(0, 6)
    .forEach(f => console.log('        ' + String(files[f]).padStart(4) + '  ' + f));
});

console.log('');
console.log('TOP UNMATCHED property/hex pairs — reviewed, deliberately not rewritten');
console.log('-'.repeat(72));
Object.keys(UNMATCHED).sort(function (a, b) { return UNMATCHED[b] - UNMATCHED[a]; }).slice(0, 30)
  .forEach(function (k) { console.log('  ' + String(UNMATCHED[k]).padStart(4) + '  ' + k); });

if (!APPLY) console.log('\n(nothing written — pass --apply)');
