/**
 * ui_check.js — the static invariant suite for the UI/UX programme.
 *
 *     node tools/ui_check.js            # full report
 *     node tools/ui_check.js --json     # machine-readable, for diffing phases
 *     node tools/ui_check.js --save     # rewrite tools/ui_baseline.json
 *
 * WHY THIS EXISTS
 * ---------------
 * This programme redesigns a production Apps Script ERP that nobody can open in
 * a browser until the owner pushes. A visual regression is therefore invisible
 * to everyone involved. These checks cannot see a colour, but they can see the
 * things that silently break a page: a syntax error in a template, a component
 * a page calls that no longer exists, an anchor id that moved, a stylesheet
 * class nothing defines, a breakpoint outside the agreed scale.
 *
 * Metric checks compare against tools/ui_baseline.json and fail only when a
 * number moves the WRONG way, so the suite stays useful as the code changes
 * shape rather than freezing it.
 *
 * Nothing here writes to a spreadsheet, calls a Google service, or hits the
 * network. It reads the project's own files and exits non-zero on failure.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const S = require('./lib/sources');

const BASELINE_PATH = path.join(__dirname, 'ui_baseline.json');
const ARGS = process.argv.slice(2);
const AS_JSON = ARGS.indexOf('--json') !== -1;
const SAVE = ARGS.indexOf('--save') !== -1;

const results = [];
const metrics = {};

function check(name, fn) {
  const r = { name: name, status: 'PASS', detail: [] };
  try {
    fn(r);
  } catch (e) {
    r.status = 'FAIL';
    r.detail.push('threw: ' + (e && e.message));
  }
  results.push(r);
  return r;
}

function baseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch (e) { return null; }
}

/* A metric that must not grow. Absent baseline = record only, never fail. */
function noWorse(r, key, value, label) {
  metrics[key] = value;
  const b = baseline();
  const prev = b && b.metrics ? b.metrics[key] : undefined;
  if (prev === undefined) {
    r.detail.push(label + ': ' + value + '  (no baseline yet — recorded)');
    return;
  }
  if (value > prev) {
    r.status = 'FAIL';
    r.detail.push(label + ': ' + value + '  — WORSE than baseline ' + prev);
  } else {
    r.detail.push(label + ': ' + value + '  (baseline ' + prev + (value < prev ? ', improved' : '') + ')');
  }
}

/* ── C1 — every server-side .js file parses ─────────────────────────────── */
check('C1  node --check on every .js file', function (r) {
  const files = S.jsFiles();
  const bad = [];
  files.forEach(function (f) {
    try {
      execFileSync(process.execPath, ['--check', path.join(S.ROOT, f)], { stdio: 'pipe' });
    } catch (e) {
      bad.push(f + ': ' + String(e.stderr || '').split('\n').slice(0, 3).join(' '));
    }
  });
  metrics.js_files = files.length;
  if (bad.length) { r.status = 'FAIL'; bad.forEach(b => r.detail.push(b)); }
  else r.detail.push(files.length + ' files parse');
});

/* ── C2 — every inline <script> in every template parses ────────────────── */
check('C2  inline <script> of every .html template parses', function (r) {
  const files = S.htmlFiles();
  let blocks = 0;
  const bad = [];
  files.forEach(function (f) {
    S.scriptBlocks(S.read(f)).forEach(function (b) {
      blocks++;
      try {
        new vm.Script(S.stripScriptlets(b.body), { filename: f + ':' + b.line });
      } catch (e) {
        bad.push(f + ' (block at line ' + b.line + '): ' + e.message);
      }
    });
  });
  metrics.html_files = files.length;
  metrics.script_blocks = blocks;
  if (bad.length) { r.status = 'FAIL'; bad.forEach(b => r.detail.push(b)); }
  else r.detail.push(files.length + ' templates, ' + blocks + ' script blocks parse');
});

/* ── C3 — public contracts: every namespaced symbol a page calls exists ─── */
const NAMESPACES = ['UIC', 'API', 'FMT', 'UI', 'ERPModal', 'ERPFlow', 'SESSION'];

function definedSymbols() {
  const defined = {};
  NAMESPACES.forEach(n => { defined[n] = {}; });
  S.htmlFiles().concat(S.jsFiles()).forEach(function (f) {
    const src = S.read(f);
    NAMESPACES.forEach(function (ns) {
      /* NS.member = ...   and   NS = { member: ... } object literals */
      const re = new RegExp('\\b' + ns + '\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)', 'g');
      let m;
      while ((m = re.exec(src)) !== null) defined[ns][m[1]] = true;
      /* window.NS = { a: .., b: .. }  /  var NS = (function(){ return {a:..} })() */
      const lit = new RegExp('(?:window\\.)?' + ns + '\\s*=\\s*\\{([\\s\\S]{0,4000}?)\\}\\s*;', 'g');
      while ((m = lit.exec(src)) !== null) {
        const keys = m[1].match(/(^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g) || [];
        keys.forEach(k => { defined[ns][k.replace(/[\s,{:]/g, '')] = true; });
      }
      /* ERPFlow and ERPModal are built as
             window.ERPFlow = window.ERPFlow || (function(){ … return {start, finish}; })();
         so their members exist only inside the IIFE's return object. When a
         file assigns the namespace to an IIFE, harvest the keys of every
         `return { … }` in it. Without this the suite reports five members of
         two working components as missing. */
      if (new RegExp('(?:window\\.)?' + ns + '\\s*=[\\s\\S]{0,80}?\\(\\s*function').test(src)) {
        const ret = /return\s*\{([\s\S]{0,1500}?)\}\s*;/g;
        let rm;
        while ((rm = ret.exec(src)) !== null) {
          (rm[1].match(/(^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g) || [])
            .forEach(k => { defined[ns][k.replace(/[\s,{:]/g, '')] = true; });
        }
      }
    });
  });
  return defined;
}

check('C3  public contracts — UIC/API/FMT/UI/ERPModal/ERPFlow/SESSION', function (r) {
  const defined = definedSymbols();
  const missing = {};
  let refs = 0;
  S.htmlFiles().forEach(function (f) {
    const src = S.read(f);
    NAMESPACES.forEach(function (ns) {
      const re = new RegExp('\\b' + ns + '\\.([A-Za-z_$][\\w$]*)', 'g');
      let m;
      while ((m = re.exec(src)) !== null) {
        refs++;
        const name = m[1];
        /* Skip the definition site itself and JS builtins on the namespace. */
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 4);
        if (/^\s*=(?!=)/.test(after)) continue;
        if (defined[ns][name]) continue;
        const key = ns + '.' + name;
        missing[key] = missing[key] || {};
        missing[key][f] = (missing[key][f] || 0) + 1;
      }
    });
  });
  metrics.symbol_refs = refs;
  const names = Object.keys(missing).sort();
  metrics.symbols_undefined = names.length;
  names.forEach(function (k) {
    const files = Object.keys(missing[k]);
    const calls = files.reduce((n, f) => n + missing[k][f], 0);
    r.detail.push('  ' + k + '  ← ' + calls + ' call(s) in ' + files.length + ' file(s): ' +
      files.slice(0, 3).join(', ') + (files.length > 3 ? ' …' : ''));
  });
  noWorse(r, 'symbols_undefined_gate', names.length, 'undefined namespaced symbols');
  if (!names.length) r.detail.push(refs + ' references, all resolve');
});

/* ── C4 — anchor ids the routing and pages depend on still exist ────────── */
const CRITICAL_IDS = [
  ['app-content', null],
  ['tl-root', null], ['vf-root', null], ['tc-root', null],
  ['admin-root', null], ['dash-shell', null], ['tab-body', null],
  ['invoice-root', null], ['mx-grid', null],
  ['uic-drawer', 'UI_Components.html'],
  ['uic-drawer-overlay', 'UI_Components.html'],
  ['page-loading', 'UI_Components.html'],
  ['history-side', 'UI_Components.html']
];

check('C4  anchor ids the pages depend on still exist', function (r) {
  const all = {};
  S.htmlFiles().forEach(function (f) {
    const src = S.read(f);
    const re = /\bid\s*=\s*["']([A-Za-z][\w:.-]*)["']/g;
    let m;
    while ((m = re.exec(src)) !== null) (all[m[1]] = all[m[1]] || []).push(f);
    /* ids created in JS: el.id = 'x'  /  d.id = 'x' */
    const re2 = /\.id\s*=\s*['"]([^'"]+)['"]/g;
    while ((m = re2.exec(src)) !== null) (all[m[1]] = all[m[1]] || []).push(f);
    /* Ids assembled by concatenation. UIC.appShell emits
         '<main class="app-content" id="' + (opts.contentId || 'app-content') + '">'
       so the id never appears as a literal attribute value anywhere. Anything
       quoted and then looked up by getElementById counts as defined. */
    const re3 = /getElementById\(\s*['"]([A-Za-z][\w:.-]*)['"]/g;
    while ((m = re3.exec(src)) !== null) (all[m[1]] = all[m[1]] || []).push(f);
    const re4 = /\|\|\s*['"]([A-Za-z][\w:.-]*)['"]\s*\)/g;
    while ((m = re4.exec(src)) !== null) (all[m[1]] = all[m[1]] || []).push(f);
  });
  const gone = [];
  CRITICAL_IDS.forEach(function (pair) {
    const id = pair[0], where = pair[1];
    if (!all[id]) { gone.push(id + ' — NOT FOUND anywhere'); return; }
    if (where && all[id].indexOf(where) === -1) gone.push(id + ' — no longer in ' + where);
  });
  metrics.distinct_ids = Object.keys(all).length;
  if (gone.length) { r.status = 'FAIL'; gone.forEach(g => r.detail.push(g)); }
  else r.detail.push(CRITICAL_IDS.length + ' critical ids present; ' +
    Object.keys(all).length + ' distinct ids across the tree');
});

/* ── C5 — every CSS class a page uses is defined somewhere (U-08) ───────── */
function definedClasses() {
  const set = {};
  S.htmlFiles().forEach(function (f) {
    const css = S.allCss(S.read(f));
    const re = /\.(-?[_a-zA-Z][\w-]*)/g;
    let m;
    while ((m = re.exec(css)) !== null) set[m[1]] = true;
  });
  /* 03_Security.js emits the per-company theme stylesheets as JS strings, so
     those selectors are only visible through the same concatenation reader. */
  S.jsFiles().forEach(function (f) {
    const css = S.allCss(S.read(f));
    const re = /\.(-?[_a-zA-Z][\w-]*)/g;
    let m;
    while ((m = re.exec(css)) !== null) set[m[1]] = true;
  });
  return set;
}

check('C5  CSS classes used by pages are defined somewhere (U-08)', function (r) {
  const defined = definedClasses();
  const used = {};
  S.htmlFiles().forEach(function (f) {
    const src = S.read(f);
    const re = /\bclass\s*=\s*"([^"<>]*)"/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const value = m[1];
      /* Skip values built by string concatenation, ternaries or scriptlets —
         `class="btn ' + (x ? 'a' : 'b') + '"` is JavaScript, not a class list,
         and tokenising it produces noise, not findings. */
      if (/[<?+(){}$:'"]/.test(value)) continue;
      value.split(/\s+/).forEach(function (c) {
        if (!/^-?[_a-zA-Z][\w-]*$/.test(c)) return;
        (used[c] = used[c] || {})[f] = true;
      });
    }
  });
  const orphans = Object.keys(used).filter(c => !defined[c]).sort();
  metrics.classes_used = Object.keys(used).length;
  metrics.classes_defined = Object.keys(defined).length;
  orphans.slice(0, 25).forEach(function (c) {
    const files = Object.keys(used[c]);
    r.detail.push('  .' + c + '  ← ' + files.length + ' file(s): ' + files.slice(0, 2).join(', '));
  });
  if (orphans.length > 25) r.detail.push('  … and ' + (orphans.length - 25) + ' more');
  noWorse(r, 'classes_orphan', orphans.length, 'used-but-undefined classes');
});

/* ── C6 — token discipline: hardcoded colours vs var(--token) (U-07) ────── */
check('C6  token discipline — hardcoded colours vs tokens (U-07)', function (r) {
  let hex = 0, rgba = 0, tokens = 0, bare = 0;
  const perFile = {};
  S.htmlFiles().forEach(function (f) {
    const src = S.read(f);
    const h = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
    const g = (src.match(/\brgba?\s*\(/g) || []).length;
    const t = (src.match(/var\(\s*--/g) || []).length;
    /* BARE literals are the ones that actually matter. The Phase 2.7 sweep
       keeps a fallback inside every var() — `var(--border-color, #e5e7eb)` —
       because pages that build a print window with document.write have no token
       layer to resolve against. So the raw hex count barely moves even when
       hundreds of colours have been tokenised. Stripping the fallbacks first is
       what makes this metric measure the thing it claims to. */
    const stripped = src.replace(/var\(\s*--[a-z0-9-]+\s*,\s*[^)]*\)/gi, 'var(--x)');
    const b = (stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length +
              (stripped.match(/\brgba?\s*\(/g) || []).length;
    hex += h; rgba += g; tokens += t; bare += b;
    if (b) perFile[f] = b;
  });
  metrics.color_bare = bare;
  metrics.color_hex = hex;
  metrics.color_rgba = rgba;
  metrics.token_uses = tokens;
  const literals = hex + rgba;
  metrics.color_literals = literals;
  metrics.token_ratio = Number((tokens / (tokens + literals || 1)).toFixed(4));
  metrics.bare_ratio = Number((tokens / (tokens + bare || 1)).toFixed(4));
  const worst = Object.keys(perFile).sort((a, b) => perFile[b] - perFile[a]).slice(0, 8);
  r.detail.push('colour literals, all occurrences: ' + literals + ' (' + hex + ' hex, ' + rgba + ' rgb/rgba)');
  r.detail.push('colour literals NOT inside a var() fallback: ' + bare + '   <- the real number');
  r.detail.push('var(--token) uses: ' + tokens);
  r.detail.push('token share (vs bare literals): ' + (metrics.bare_ratio * 100).toFixed(1) + '%');
  r.detail.push('heaviest files, by bare literals: ' + worst.map(f => f + '(' + perFile[f] + ')').join(', '));
  /* Informational until Phase 2 moves it; never fails the build. */
  r.status = 'INFO';
});

/* ── C7 — breakpoint scale conformance (§0.4, U-48) ─────────────────────── */
/* The five agreed tiers. A min-width query may only use these values.        */
const TIERS = { 600: 'tablet-p', 900: 'tablet-l', 1280: 'desktop', 1920: 'wide' };
/* Legacy values still present before step 2.9b lands. Listed so the report
   shows what remains to retire rather than hiding it. */
check('C7  breakpoint scale conformance (§0.4 / U-48)', function (r) {
  const offenders = {};
  let total = 0, conforming = 0, maxWidthMain = 0;
  /* Strip block comments first. A comment explaining which query was RETIRED
     names the old value, and counting that as a live query would make the check
     un-passable and, worse, discourage explaining the change. */
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
  S.htmlFiles().forEach(function (f) {
    const src = strip(S.read(f));
    const re = /@media[^{]*?\(\s*(min|max)-width\s*:\s*(\d+)px/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      total++;
      const dir = m[1], px = Number(m[2]);
      if (dir === 'min' && TIERS[px]) { conforming++; continue; }
      if (dir === 'max') maxWidthMain++;
      const key = dir + '-width:' + px;
      (offenders[key] = offenders[key] || {})[f] = true;
    }
  });
  S.jsFiles().forEach(function (f) {
    const src = strip(S.read(f));
    const re = /@media[^{]*?\(\s*(min|max)-width\s*:\s*(\d+)px/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      total++;
      const dir = m[1], px = Number(m[2]);
      if (dir === 'min' && TIERS[px]) { conforming++; continue; }
      if (dir === 'max') maxWidthMain++;
      const key = dir + '-width:' + px;
      (offenders[key] = offenders[key] || {})[f] = true;
    }
  });
  metrics.media_queries = total;
  metrics.media_conforming = conforming;
  metrics.media_maxwidth = maxWidthMain;
  const keys = Object.keys(offenders).sort();
  metrics.media_offbrand = keys.reduce((n, k) => n + Object.keys(offenders[k]).length, 0);
  keys.forEach(function (k) {
    const files = Object.keys(offenders[k]);
    r.detail.push('  ' + k + '  × ' + files.length + ' file(s): ' + files.slice(0, 3).join(', ') +
      (files.length > 3 ? ' …' : ''));
  });
  r.detail.push('total width queries: ' + total + ', on-scale min-width: ' + conforming +
    ', max-width: ' + maxWidthMain);
  noWorse(r, 'media_offbrand_gate', metrics.media_offbrand, 'off-scale width queries');
});

/* ── C8 — DOM cost per rendered table row (do not regress the perf run) ─── */
check('C8  DOM nodes per rendered table row', function (r) {
  const { makeSandbox } = require('./verify/domstub');
  const sb = makeSandbox({});
  const uic = S.read('UI_Components.html');
  S.scriptBlocks(uic).forEach(function (b, i) {
    try { vm.runInContext(S.stripScriptlets(b.body), sb, { filename: 'UI_Components#' + i }); }
    catch (e) { r.detail.push('UI_Components block ' + i + ' threw: ' + e.message); }
  });
  if (!sb.UIC || !sb.UIC._dtRowHtml) { r.status = 'FAIL'; r.detail.push('UIC._dtRowHtml unavailable'); return; }
  const headers = [
    { key: 'code', label: 'كود' }, { key: 'name', label: 'الصنف' },
    { key: 'qty', label: 'كمية', numeric: true }, { key: 'price', label: 'سعر', money: true },
    { key: 'total', label: 'إجمالي', money: true }, { key: 'date', label: 'تاريخ' }
  ];
  const row = { code: 'A-1', name: 'صنف', qty: 3, price: 10.5, total: 31.5, date: '2026-01-01' };
  const fmt = function (n) { return String(n); };
  const html = sb.UIC._dtRowHtml(row, headers, fmt, 0);
  const tags = (html.match(/<[a-zA-Z]/g) || []).length;
  metrics.dom_nodes_per_row = tags;
  metrics.dom_row_bytes = html.length;
  r.detail.push('6-column row → ' + tags + ' element(s), ' + html.length + ' bytes');

  /* The row ACTION cell is the other per-row cost, and it is the one most at
     risk: it is built by UIC.actionDropdown and rendered once per row, so an
     icon or a wrapper added there is multiplied by the page size. _dtRowHtml
     alone would not see it, because pages pass the action cell in as a
     pre-rendered value. */
  const act = sb.UIC.actionDropdown([
    { label: 'تعديل', onclick: 'e()' },
    { label: 'طباعة', onclick: 'p()' },
    { label: 'حذف', onclick: 'd()', color: 'var(--danger)' }
  ]);
  const actTags = (act.match(/<[a-zA-Z]/g) || []).length;
  metrics.dom_nodes_per_action_cell = actTags;
  metrics.dom_action_bytes = act.length;
  r.detail.push('3-item action cell → ' + actTags + ' element(s), ' + act.length + ' bytes');
  const perRow = tags + actTags;
  r.detail.push('at the 50-row page size that is ' + (perRow * 50) +
    ' elements per rendered page (row + action cell)');

  const b = baseline();
  const m = b && b.metrics ? b.metrics : {};
  if (m.dom_nodes_per_row !== undefined && tags > m.dom_nodes_per_row) {
    r.status = 'FAIL';
    r.detail.push('REGRESSION: row was ' + m.dom_nodes_per_row + ' element(s)');
  }
  if (m.dom_nodes_per_action_cell !== undefined && actTags > m.dom_nodes_per_action_cell) {
    r.status = 'FAIL';
    r.detail.push('REGRESSION: action cell was ' + m.dom_nodes_per_action_cell + ' element(s)');
  }
});

/* ── C9 — the design preview is not stale ───────────────────────────────── */
check('C9  design preview harness is current', function (r) {
  const bundle = path.join(S.ROOT, 'design_preview', '_sources.js');
  if (!fs.existsSync(bundle)) {
    r.status = 'INFO';
    r.detail.push('design_preview/_sources.js absent — run: node tools/build_preview.js');
    return;
  }
  const build = require('./build_preview');
  const fresh = build.fingerprint();
  const onDisk = (fs.readFileSync(bundle, 'utf8').match(/__PREVIEW_FINGERPRINT__\s*=\s*'([^']+)'/) || [])[1];
  if (onDisk !== fresh) {
    r.status = 'FAIL';
    r.detail.push('STALE — the preview no longer matches the source files it claims to show.');
    r.detail.push('Run: node tools/build_preview.js');
    r.detail.push('on disk ' + onDisk + ' vs source ' + fresh);
  } else {
    r.detail.push('preview bundle matches the live shared layer (' + fresh + ')');
  }
});

/* ── C10 — every component the preview renders still builds ─────────────── */
/* This boots the shared layer the same way design_preview/gallery.html does —
 * from the generated bundle, in the same order a page template includes it —
 * and calls every component builder. It is the nearest thing available offline
 * to "the harness opens and renders every component". A component that throws
 * here renders as a blank space in the preview and on 85 live pages. */
check('C10 every component builds without throwing', function (r) {
  const { makeSandbox } = require('./verify/domstub');
  const bundlePath = path.join(S.ROOT, 'design_preview', '_sources.js');
  if (!fs.existsSync(bundlePath)) { r.status = 'INFO'; r.detail.push('no bundle — run build_preview'); return; }

  const sb = makeSandbox({
    google: { script: { run: new Proxy({}, { get: function () { return function () { return this; }; } }), host: {}, history: {} } },
    scriptUrl: '#', SESSION_TOKEN: 't', CURRENT_ACTION: 'preview', IS_SUPER_ADMIN: true
  });
  vm.runInContext(fs.readFileSync(bundlePath, 'utf8'), sb, { filename: '_sources.js' });
  const src = sb.__PREVIEW_SOURCES__;
  const boot = [];
  ['componentsJs', 'helpersJs'].forEach(function (k) {
    try { vm.runInContext(src[k], sb, { filename: k }); }
    catch (e) { boot.push(k + ': ' + e.message); }
  });
  if (boot.length) { r.status = 'FAIL'; boot.forEach(b => r.detail.push(b)); return; }

  const H = [
    { key: 'a', label: 'كود' }, { key: 'b', label: 'صنف' },
    { key: 'c', label: 'كمية', numeric: true }, { key: 'd', label: 'سعر', money: true }
  ];
  const R = [{ a: '1', b: 'صنف', c: 2, d: 3 }, { a: '2', b: 'آخر', c: 4, d: 5 }];
  const cases = [
    ['UIC.button', () => sb.UIC.button({ text: 'حفظ' })],
    ['UIC.actionDropdown', () => sb.UIC.actionDropdown([{ label: 'تعديل', onclick: 'x()' }])],
    ['UIC.statusPill', () => sb.UIC.statusPill('معتمد', 'success')],
    ['UIC.dataTable', () => sb.UIC.dataTable('t1', { headers: H, rows: R })],
    ['UIC.dataTable (empty)', () => sb.UIC.dataTable('t2', { headers: H, rows: [] })],
    ['UIC.tableSkeleton', () => sb.UIC.tableSkeleton(H, 3)],
    ['UIC.field', () => sb.UIC.field({ key: 'k', label: 'ل' })],
    ['UIC.field (select)', () => sb.UIC.field({ key: 'k2', label: 'ل', type: 'select', combo: false, options: ['a'] })],
    ['UIC.combo', () => sb.UIC.combo({ key: 'k3', label: 'ل', options: ['a', 'b'] })],
    ['UIC.datalist', () => sb.UIC.datalist('d1', ['a'])],
    ['UIC.fileField', () => sb.UIC.fileField({ key: 'f1', label: 'ملف' })],
    ['UIC.statCard', () => sb.UIC.statCard({ value: 1, label: 'ل' })],
    ['UIC.companyTile', () => sb.UIC.companyTile({ name_ar: 'ش', name_en: 'C' })],
    ['UIC.moduleTile', () => sb.UIC.moduleTile({ title: 'ت', subtitle: 'س' })],
    ['UIC.buildLogoMarkup', () => sb.UIC.buildLogoMarkup('#', '', '', '')],
    ['UIC._dtPagerHtml', () => { sb.UIC.dataTable('t3', { headers: H, rows: R }); return 'ok'; }]
  ];
  const bad = [];
  cases.forEach(function (c) {
    try {
      const out = c[1]();
      if (out === undefined || out === null || String(out) === '') bad.push(c[0] + ' → empty');
    } catch (e) { bad.push(c[0] + ' threw: ' + e.message); }
  });
  /* Side-effecting components: they append to <body> rather than return markup. */
  try {
    sb.UIC.openModal('m1', { title: 'ت', body: '<p>x</p>', size: 'lg' });
    if (!sb.document.getElementById('m1')) bad.push('UIC.openModal → nothing appended');
    sb.UIC.closeModal('m1');
  } catch (e) { bad.push('UIC.openModal threw: ' + e.message); }
  try { sb.UIC.toast('رسالة', 'success'); if (!sb.toasts().length) bad.push('UIC.toast → no toast'); }
  catch (e) { bad.push('UIC.toast threw: ' + e.message); }
  try {
    sb.document.body.appendChild(Object.assign(sb.document.createElement('div'), { id: 'shellhost' }));
    sb.UIC.appShell('shellhost', { nav: [{ label: 'ر', href: '#' }], breadcrumb: 'ر' });
  } catch (e) { bad.push('UIC.appShell threw: ' + e.message); }

  metrics.components_checked = cases.length + 3;
  if (bad.length) { r.status = 'FAIL'; bad.forEach(b => r.detail.push(b)); }
  else r.detail.push(metrics.components_checked + ' components build from the preview bundle');
});

/* ── C11 — hazards specific to CSS written inside a JS template literal ─── */
/* UI_Components.html builds ~500 lines of the design system inside
 * `const css = ` … ``. Two things inside that string are silently fatal, and
 * both have actually happened during this programme:
 *
 *   a BACKTICK, even inside a CSS /* comment *​/, ends the template literal —
 *     the rest of the stylesheet is then parsed as JavaScript;
 *   a SINGLE-BACKSLASH unicode escape such as a bare \\2195 is read as an OCTAL
 *     escape, which is a SyntaxError in a template string.
 *
 * C2 does catch both, but it reports them as "Unexpected identifier 'right'" at
 * line 1, which points nowhere useful. This names the actual line and says what
 * to do, so the next person loses seconds rather than minutes.
 */
check('C11 template-literal CSS hazards (backticks, octal escapes)', function (r) {
  const problems = [];
  S.htmlFiles().forEach(function (f) {
    const src = S.read(f);
    const re = /(?:const|var|let)\s+\w*css\w*\s*=\s*`/gi;
    let m;
    while ((m = re.exec(src)) !== null) {
      const startIdx = m.index + m[0].length;
      const startLine = src.slice(0, startIdx).split('\n').length;
      /* Walk to the literal's real end: the first unescaped backtick. Anything
         before that which looks like a comment-borne backtick is the bug. */
      let i = startIdx;
      for (; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === '`') break;
      }
      const body = src.slice(startIdx, i);
      /* An octal-looking escape: a single backslash followed by digits. */
      const oct = body.match(/(^|[^\\])\\[0-7]{2,}/g);
      if (oct) {
        problems.push(f + ': a single-backslash escape inside the stylesheet — ' +
          'write \\\\XXXX for a CSS unicode escape, or JS reads it as octal');
      }
      /* If the literal ends before the stylesheet plausibly does, a stray
         backtick closed it early. A real stylesheet is thousands of chars. */
      const rest = src.slice(i + 1, i + 400);
      if (/^[\s\S]{0,120}(?:\{|:\s*var\(|;\s*\n\s*\.)/.test(rest) && body.length > 200) {
        problems.push(f + ':' + startLine + ' — the stylesheet literal appears to END at ' +
          'line ' + src.slice(0, i).split('\n').length + ' with CSS still following it. ' +
          'A backtick inside a CSS comment closes the template literal.');
      }
    }
  });
  metrics.template_css_hazards = problems.length;
  if (problems.length) { r.status = 'FAIL'; problems.forEach(p => r.detail.push(p)); }
  else r.detail.push('no stray backticks or octal escapes in template-literal CSS');
});

/* ── C12 — the column-width contract's reach ────────────────────────────── */
/* Two counts, both of which must only ever fall.
 *
 * `tables_unwrapped` — a raw <table class="table"> written as page markup with
 *   no .table-wrap ancestor. Such a table has never had horizontal scroll and
 *   has never had a sticky header, because both live on the wrapper. Once the
 *   width floors exist, an unwrapped wide table has nowhere to overflow TO, so
 *   this number reaching zero is what makes the contract safe.
 *
 * `tables_untyped` — a raw page .table that no UIC.autoColumns() call types.
 *   The 69 UIC.dataTable sites classify themselves and are not counted here;
 *   this counts only the tables a page writes by hand.
 *
 * Both are deliberately counted from the SOURCE, not from a boot: a page that
 * fails to render would otherwise silently report zero of each.
 *
 * The class attribute is split on whitespace and compared token-by-token.
 * Substring-matching `table` would also match card-table, inv-table,
 * items-table and pt-sk-table, which are page-local classes this contract
 * deliberately does not cover (plan §7 W5). */
const TABLE_OPEN_RE = /<table\b([^>]*)>/gi;

function classTokens(attrs) {
  const m = String(attrs).match(/class\s*=\s*["']([^"']*)["']/i);
  return m ? m[1].trim().split(/\s+/) : [];
}

/* Every raw `.table` a page writes as markup, with whether a .table-wrap
 * element is open at that point. The ancestry is resolved by walking the div
 * tags before it and keeping a stack, rather than by looking at a window of
 * preceding characters — a table two divs deep inside a wrapper is wrapped,
 * and a table after a wrapper has closed is not. */
function rawPageTables(src) {
  const out = [];
  const tag = /<(\/?)(div|table)\b([^>]*)>/gi;
  const stack = [];
  let m;
  while ((m = tag.exec(src)) !== null) {
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    if (name === 'div') {
      if (closing) stack.pop();
      else if (!/\/\s*>$/.test(m[0])) stack.push(classTokens(m[3]).indexOf('table-wrap') !== -1);
      continue;
    }
    if (closing) continue;
    if (classTokens(m[3]).indexOf('table') === -1) continue;
    out.push({
      line: src.slice(0, m.index).split('\n').length,
      wrapped: stack.indexOf(true) !== -1
    });
  }
  return out;
}

check('C12 raw page tables: wrapped, and typed by the column contract', function (r) {
  let unwrapped = 0;
  let untyped = 0;
  const badWrap = [];
  const badType = [];
  S.pageFiles().forEach(function (f) {
    const src = S.read(f);
    const tables = rawPageTables(src);
    if (!tables.length) return;
    const loose = tables.filter(t => !t.wrapped);
    if (loose.length) {
      unwrapped += loose.length;
      badWrap.push(f + ' ×' + loose.length + ' (L' + loose.map(t => t.line).join(',') + ')');
    }
    /* One autoColumns call types one table. A page with three raw tables and
       two calls still has one untyped, and says so.

       UIC.autoColumnsAll types EVERY table under a root in one call, which is
       what the pages that render N tables from one string use — a card per
       certificate, a group per deduction date. One of those covers the file, so
       the per-table arithmetic does not apply to it. */
    const all = /UIC\.autoColumnsAll\s*\(/.test(src);
    const typed = (src.match(/UIC\.autoColumns\s*\(/g) || []).length;
    const gap = all ? 0 : Math.max(0, tables.length - typed);
    if (gap) { untyped += gap; badType.push(f + ' ×' + gap + ' of ' + tables.length); }
  });
  if (badWrap.length) r.detail.push('unwrapped: ' + badWrap.slice(0, 6).join('; ') +
    (badWrap.length > 6 ? ' …' : ''));
  if (badType.length) r.detail.push('untyped: ' + badType.slice(0, 6).join('; ') +
    (badType.length > 6 ? ' …' : ''));
  noWorse(r, 'tables_unwrapped', unwrapped, 'raw .table with no .table-wrap');
  noWorse(r, 'tables_untyped', untyped, 'raw .table no autoColumns call types');
});

/* ── report ─────────────────────────────────────────────────────────────── */
const failed = results.filter(r => r.status === 'FAIL');

if (AS_JSON) {
  console.log(JSON.stringify({ metrics: metrics, results: results }, null, 2));
} else {
  console.log('ui_check — ' + new Date().toISOString().slice(0, 19).replace('T', ' '));
  console.log('='.repeat(72));
  results.forEach(function (r) {
    console.log('[' + r.status.padEnd(4) + '] ' + r.name);
    r.detail.forEach(d => console.log('        ' + d));
    console.log('');
  });
  console.log('='.repeat(72));
  console.log(failed.length === 0
    ? 'ui_check: ' + results.length + ' checks, 0 failures.'
    : 'ui_check: ' + failed.length + ' of ' + results.length + ' checks FAILED — ' +
      failed.map(f => f.name.split(/\s{2}/)[0]).join(', '));
}

if (SAVE) {
  /* [RT-0] Other programmes record their own census under their own top-level
   * key in this file (`realtime_baseline`, and whatever comes after it). Those
   * keys are not ui_check's to own, so --save rewrites `recorded` and `metrics`
   * and carries everything else through untouched. Without this, one --save
   * silently deletes another run's baseline. */
  let carried = {};
  try { carried = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (e) { carried = {}; }
  delete carried.recorded;
  delete carried.metrics;
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(Object.assign({
    recorded: new Date().toISOString(),
    metrics: metrics
  }, carried), null, 2) + '\n');
  if (!AS_JSON) console.log('baseline written to tools/ui_baseline.json');
}

process.exit(failed.length === 0 ? 0 : 1);
