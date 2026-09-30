/**
 * P0 — live-notice inventory (read-only, local files only).
 *
 * For every page that calls UIC.Live.watchPage it records:
 *   - the page id passed to watchPage and the refresh passed to arrive;
 *   - every company action the page calls, grouped by the function that calls
 *     it, which gives a view hint (list / form / print / tab:<id>);
 *   - for each action, the tables it reads: ACTION_TABLES plus a static scan of
 *     its handler and the helpers it calls (sheet constants they reference);
 *   - whether the page has tabs, modal forms and a print view;
 *   - per company, the write helpers (for Phase 5).
 *
 * It then proposes PAGE_VIEWS per the plan's rule D2 ("every table whose data
 * is visible in that view"), with a reason next to every table, and a label
 * for every table (Registry labelAr, else a curated label, else a page title).
 *
 * Outputs: inventory.json, inventory.md, labels.md (next to this file).
 * Run: node tools/liveviews/inventory.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const COMPANIES = ['ErpTest', 'TopLight', 'TopChemical', 'ValleyFoods', 'Assessment'];

/* Tables that are never "shown" by a page even when a handler touches them:
 * they live on the auth spreadsheet (no per-company stamp), or are
 * bookkeeping for the request guard, the logs or the Testing System packs. */
const NEVER_SHOWN = /^(ERP_currency_exchange|ERP_Request_Receipts|erp_test__packs|erp_test__journal|erp_test__meta|AuditLog|SystemLog|ERP_.*)$/;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|(^|[^:'"\\])\/\/[^\n]*/g, function (m, pre) {
    return (pre || '') + m.slice((pre || '').length).replace(/[^\n]/g, ' ');
  });
}

/** Named function spans: [{name, open, close}] for `function x(`, `x = function(`, `x: function(`. */
function functionSpans(src) {
  const out = [];
  const re = /(?:function\s+([A-Za-z0-9_$]+)\s*\(|([A-Za-z0-9_$]+)\s*[:=]\s*function\s*\(|([A-Za-z0-9_$]+)\s*=\s*\([^)]*\)\s*=>\s*\{)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1] || m[2] || m[3];
    const open = src.indexOf('{', m.index + m[0].length - 1);
    if (open === -1) continue;
    let depth = 0, close = -1;
    for (let j = open; j < src.length; j++) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { close = j; break; } }
    }
    if (close !== -1) out.push({ name, open, close });
  }
  return out;
}

function innermost(spans, pos) {
  let best = null;
  spans.forEach(s => {
    if (s.open < pos && pos < s.close && (!best || s.open > best.open)) best = s;
  });
  return best;
}

/* ── server side ───────────────────────────────────────────────────────── */

function scanActions(company) {
  const file = 'Company_' + company + '_Actions.js';
  const raw = read(file);
  const src = stripComments(raw);
  const consts = {};
  let m;
  const reConst = /\b(?:const|var|let)\s+([A-Z][A-Z0-9_]*)\s*=\s*'([^']+)'/g;
  while ((m = reConst.exec(src)) !== null) consts[m[1]] = m[2];
  const sheetConsts = {};
  Object.keys(consts).forEach(k => { if (/SHEET|_TBL$|_TABLE$/.test(k)) sheetConsts[k] = consts[k]; });

  /* ACTION_TABLES: 'action': CONST | 'literal' | [CONST, ...] */
  const actionTables = {};
  const atStart = src.indexOf('ACTION_TABLES = {');
  if (atStart !== -1) {
    let depth = 0, end = atStart;
    for (let j = src.indexOf('{', atStart); j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    const body = src.slice(atStart, end);
    const reAt = /'([a-z0-9_]+)'\s*:\s*(\[[^\]]*\]|[A-Z][A-Z0-9_]*|'[^']*')/g;
    while ((m = reAt.exec(body)) !== null) {
      const vals = m[2].replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean)
        .map(v => v[0] === "'" ? v.slice(1, -1) : (consts[v] || null)).filter(Boolean);
      actionTables[m[1]] = vals;
    }
  }
  /* primaryLogTable in ACTION_DEFINITIONS (Top Light / Testing System) */
  const reDef = /'([a-z0-9_]+)'\s*:\s*\{\s*handler\s*:\s*([A-Za-z0-9_$]+)[^}]*?primaryLogTable\s*:\s*([A-Z][A-Z0-9_]*|'[^']*')/g;
  const handlers = {};
  while ((m = reDef.exec(src)) !== null) {
    handlers[m[1]] = m[2];
    const t = m[3][0] === "'" ? m[3].slice(1, -1) : consts[m[3]];
    if (t && !actionTables[m[1]]) actionTables[m[1]] = [t];
  }
  const reReg = /register\(\s*'([a-z0-9_]+)'\s*,\s*([A-Za-z0-9_$]+)/g;
  while ((m = reReg.exec(src)) !== null) handlers[m[1]] = handlers[m[1]] || m[2];

  /* PAGE_ACCESS: 'action': { page: 'x', ... } */
  const pageOf = {};
  const rePa = /'([a-z0-9_]+)'\s*:\s*\{\s*(?:handler\s*:\s*[A-Za-z0-9_$]+\s*,\s*)?page\s*:\s*'([^']*)'/g;
  while ((m = rePa.exec(src)) !== null) pageOf[m[1]] = m[2];

  const spans = functionSpans(src);
  const byName = {};
  spans.forEach(s => { if (!byName[s.name]) byName[s.name] = s; });
  const sheetNames = Object.keys(sheetConsts);
  const sheetValues = new Set(Object.values(sheetConsts));
  /* Sheets named by literal at a read/write site, with no constant. */
  const reLitSheet = /\b(?:getSheet_|getAllRecords_|acRows_|tlDbList_)\(\s*(?:[A-Za-z0-9_.]+\s*,\s*)?'([A-Za-z0-9_ ]+)'/g;
  while ((m = reLitSheet.exec(src)) !== null) sheetValues.add(m[1]);

  /* Tables a function references (sheet constants + literal sheet names),
   * directly and through helpers defined in this file, depth <= 3. A helper
   * that references more than 12 tables is a generic hub (reference caches,
   * migration code) and is not followed past the first level. */
  const memo = {};
  function direct(name) {
    const s = byName[name];
    if (!s) return { tables: [], calls: [] };
    const body = src.slice(s.open, s.close);
    const tables = new Set();
    sheetNames.forEach(k => { if (new RegExp('\\b' + k + '\\b').test(body)) tables.add(sheetConsts[k]); });
    const reLit = /'([A-Za-z0-9_]+)'/g;
    let lm;
    while ((lm = reLit.exec(body)) !== null) if (sheetValues.has(lm[1])) tables.add(lm[1]);
    const calls = new Set();
    const reCall = /\b([A-Za-z0-9_$]+)\s*\(/g;
    let cm;
    while ((cm = reCall.exec(body)) !== null) if (byName[cm[1]] && cm[1] !== name) calls.add(cm[1]);
    return { tables: [...tables], calls: [...calls] };
  }
  function reach(name, depth, seen) {
    const key = name + '@' + depth;
    if (memo[key]) return memo[key];
    seen = seen || new Set();
    if (seen.has(name)) return {};
    seen.add(name);
    const d = direct(name);
    const out = {};
    d.tables.forEach(t => { out[t] = out[t] || name; });
    if (depth > 0) {
      d.calls.forEach(c => {
        const sub = direct(c);
        if (depth < 3 && sub.tables.length > 12) return;   // generic hub
        const r = reach(c, depth - 1, seen);
        Object.keys(r).forEach(t => { if (!out[t]) out[t] = c === r[t] ? c : (c + '→' + r[t]); });
      });
    }
    memo[key] = out;
    return out;
  }
  const actionReads = {};
  Object.keys(handlers).forEach(a => {
    const r = reach(handlers[a], 3);
    Object.keys(r).forEach(t => { if (NEVER_SHOWN.test(t)) delete r[t]; });
    actionReads[a] = r;
  });

  /* Write helpers, for Phase 5. */
  const writers = spans.map(s => s.name).filter(n =>
    /^(tlDb(Create|Patch|SoftDelete|SoftDeleteWhere|AppendValues\w*)_|sjs\w*Write\w*_|vf\w*(Append|Save|Write|Update|Delete)\w*_|tc\w*(Append|Save|Write|Update|Delete)\w*_|ac\w*(Append|Save|Write|Update)\w*_)$/.test(n));

  const sheetSet = sheetValues;
  return { file, consts, sheetConsts, sheetSet, actionTables, handlers, pageOf, actionReads, writers: [...new Set(writers)] };
}

/* ── registry: page id → template, labels ──────────────────────────────── */

function scanRegistry(company) {
  const src = read('Company_' + company + '_Registry.js');
  const tables = {};
  const pages = {};
  let m;
  const reT = /sheetName\s*:\s*'([^']+)'[^}]*?labelAr\s*:\s*'([^']+)'/g;
  while ((m = reT.exec(src)) !== null) tables[m[1]] = m[2];
  const reP = /action\s*:\s*'([^']+)'\s*,\s*template\s*:\s*'([^']+)'\s*,\s*title\s*:\s*'([^']*)'(?:\s*,\s*label\s*:\s*'([^']*)')?/g;
  while ((m = reP.exec(src)) !== null) pages[m[1]] = { template: m[2], title: m[3], label: m[4] || '' };
  return { tables, pages };
}

/* ── client side ───────────────────────────────────────────────────────── */

function viewHint(fn) {
  if (!fn) return 'list';
  if (/print/i.test(fn)) return 'print';
  if (/tab/i.test(fn) && !/table/i.test(fn)) return 'tab';
  if (/(modal|form|edit|open|detail|line|option|picker|dialog|^show[A-Z]|stock|batch|add|save|submit|delete|remove|approve|confirm|lookup|candidate|invite|scan)/i.test(fn)) return 'form';
  return 'list';
}

function scanPage(company, file, known) {
  const raw = read(file);
  const src = stripComments(raw);
  const spans = functionSpans(src);
  const w = /UIC\.Live\.watchPage\(\s*\{[\s\S]*?page\s*:\s*'([^']+)'[\s\S]*?\}\s*\)/.exec(src);
  let pageId = w ? w[1] : null;
  /* One page watches several page ids in a loop (vf HR): keep them all. */
  const multi = /\[\s*('[a-z0-9_]+'(?:\s*,\s*'[a-z0-9_]+')+)\s*\]\s*\.forEach\(\s*function\s*\(\s*pg\s*\)[\s\S]{0,200}?UIC\.Live\.watchPage/.exec(src);
  if (!pageId && multi) pageId = multi[1].replace(/'|\s/g, '').split(',').join('|');
  const a = /UIC\.Live\.arrive\(\s*function\s*\(\)\s*\{([\s\S]*?)\}\s*\)/.exec(src);
  const refresh = a ? a[1].trim().replace(/\s+/g, ' ') : null;

  const calls = {};   // action -> {fns:Set, views:Set}
  const reAct = /'([a-z][a-z0-9_]+)'/g;
  let m;
  while ((m = reAct.exec(src)) !== null) {
    const act = m[1];
    if (!known.handlers[act] || act === 'get_page_versions') continue;
    const fnSpan = innermost(spans, m.index);
    const fn = fnSpan ? fnSpan.name : '(top level)';
    calls[act] = calls[act] || { fns: new Set(), views: new Set() };
    calls[act].fns.add(fn);
    calls[act].views.add(viewHint(fnSpan && fnSpan.name));
  }
  const refreshFns = refresh ? (refresh.match(/[A-Za-z0-9_$]+(?=\s*\()/g) || []) : [];
  return {
    file, pageId, refresh, refreshFns,
    modals: (src.match(/UIC\.openModal\(/g) || []).length,
    pageModals: (src.match(/\bopen[A-Za-z]*Modal\s*\(|showModal\(/g) || []).length,
    tabs: /switchTab|setTab|showTab|data-tab|UIC\.tabs/.test(src),
    print: /window\.print|printDoc/.test(src),
    calls: Object.keys(calls).sort().map(k => ({ action: k, fns: [...calls[k].fns], views: [...calls[k].views] }))
  };
}

/* ── curated labels for tables no Registry names ──────────────────────── */
const CURATED = JSON.parse(fs.readFileSync(path.join(OUT, 'label_overrides.json'), 'utf8'));

/* Curated view decisions (tables a view shows that the static scan cannot
 * see, or scan noise to drop). Keys: page id → view → {add:{t:reason}, drop:[t]} */
const DECISIONS = JSON.parse(fs.readFileSync(path.join(OUT, 'view_decisions.json'), 'utf8'));

function isRead(action) { return /^(get|list|prefetch|preview|search|check|lookup|export)_/.test(action); }

function proposeViews(page, known, pageTables) {
  const views = {};   // view -> {table: reason}
  const add = (v, t, why) => {
    if (!t || NEVER_SHOWN.test(t)) return;
    views[v] = views[v] || {};
    if (!views[v][t]) views[v][t] = why;
  };
  const readCalls = page.calls.filter(c => isRead(c.action));
  readCalls.forEach(c => {
    const reads = known.actionReads[c.action] || {};
    const direct = known.actionTables[c.action] || [];
    c.views.forEach(v0 => {
      const v = (v0 === 'tab') ? 'list' : v0;   // tabs: see DECISIONS; default to list
      direct.forEach(t => add(v, t, c.action + ' (ACTION_TABLES)'));
      Object.keys(reads).forEach(t => add(v, t, c.action + ' reads it via ' + reads[t]));
    });
  });
  /* The list always keeps today's watch set's primary tables that the page's
   * list-read actions declare; the page's write targets are shown in its list. */
  page.calls.filter(c => !isRead(c.action)).forEach(c => {
    (known.actionTables[c.action] || []).forEach(t => {
      if (!views.list || !views.list[t]) add('form', t, c.action + ' saves to it (the form shows it)');
    });
  });
  if (!views.list) {
    (pageTables || []).forEach(t => add('list', t, 'today\'s watch set (no list read found)'));
  }
  /* A list with nothing but the fallback: the page loads its screen from
   * functions the name heuristic called "form" — the list shows those reads. */
  if (views.list && Object.keys(views.list).every(t => /no list read found/.test(views.list[t]))) {
    Object.keys(views).forEach(v => { if (v !== 'list') Object.keys(views[v]).forEach(t => add('list', t, views[v][t] + ' (loaded with the main screen)')); });
  }
  /* Only real tables: a name that is not one of the company's sheets (or a
   * mysql: source, which this app never stamps) is dropped. */
  Object.keys(views).forEach(v => Object.keys(views[v]).forEach(t => {
    if (/^mysql:/.test(t) || !known.sheetSet.has(t)) delete views[v][t];
  }));
  const dec = DECISIONS[page.file] || {};
  Object.keys(dec.rename || {}).forEach(from => {
    if (!views[from]) return;
    const to = dec.rename[from];
    Object.keys(views[from]).forEach(t => add(to, t, views[from][t]));
    delete views[from];
  });
  const d = dec.views || {};
  Object.keys(d).forEach(v => {
    const dv = d[v];
    if (dv.replace) { views[v] = {}; }
    Object.keys(dv.add || {}).forEach(t => add(v, t, dv.add[t]));
    (dv.drop || []).forEach(t => { if (views[v]) delete views[v][t]; });
  });
  Object.keys(views).forEach(v => { if (!Object.keys(views[v]).length) delete views[v]; });
  return views;
}

/* PAGE_TABLES as the server derives it today (PAGE_ACCESS page ⨝ ACTION_TABLES). */
function pageTablesOf(known, pageId) {
  const out = new Set();
  Object.keys(known.pageOf).forEach(a => {
    if (String(pageId || '').split('|').indexOf(known.pageOf[a]) === -1) return;
    (known.actionTables[a] || []).forEach(t => out.add(t));
  });
  return [...out];
}

/* OD7: pages whose data is never cached on the device. */
const OPT_OUT_RE = /(salar|hr_|_hr|deduction|overtime|attendance|cash|bank|emp_|employee|vacation|permit|budget_hr|contract|shift)/i;

function main() {
  const result = { generated: 'tools/liveviews/inventory.js', companies: {} };
  const labels = {};
  COMPANIES.forEach(company => {
    const known = scanActions(company);
    const reg = scanRegistry(company);
    const files = fs.readdirSync(ROOT).filter(f => f.startsWith('Company_' + company + '_') && f.endsWith('.html')).sort();
    const pages = [];
    files.forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (s.indexOf('UIC.Live.watchPage') === -1) return;
      const p = scanPage(company, f, known);
      const pt = pageTablesOf(known, p.pageId);
      p.pageTables = pt;
      p.views = proposeViews(p, known, pt);
      const dec = DECISIONS[f] || {};
      p.serverPage = dec.serverPage || p.pageId;
      p.note = dec._note || '';
      p.optOut = OPT_OUT_RE.test(p.serverPage || '');
      const regPage = reg.pages[String(p.pageId).split('|')[0]] || reg.pages[f.replace(/^Company_[A-Za-z]+_|\.html$/g, '')];
      p.title = regPage ? (regPage.label || regPage.title) : '';
      pages.push(p);
    });
    /* Labels for every table any view names. */
    const all = new Set();
    pages.forEach(p => Object.keys(p.views).forEach(v => Object.keys(p.views[v]).forEach(t => all.add(t))));
    pages.forEach(p => p.pageTables.forEach(t => all.add(t)));
    const compLabels = {};
    [...all].sort().forEach(t => {
      let label = reg.tables[t], src = 'Registry labelAr';
      if (!label && CURATED[company] && CURATED[company][t]) { label = CURATED[company][t]; src = 'curated (label_overrides.json)'; }
      if (!label) { label = t; src = 'MISSING — table name used'; }
      compLabels[t] = { label, source: src };
    });
    labels[company] = compLabels;
    /* PAGE_VIEWS as the server will carry it: files merged by server page. */
    const pageViews = {};
    pages.forEach(p => {
      const pv = pageViews[p.serverPage] = pageViews[p.serverPage] || {};
      Object.keys(p.views).forEach(v => {
        pv[v] = pv[v] || [];
        Object.keys(p.views[v]).forEach(t => { if (pv[v].indexOf(t) === -1) pv[v].push(t); });
      });
    });
    result.companies[company] = {
      actionsFile: known.file,
      pageViews: pageViews,
      optOut: [...new Set(pages.filter(p => p.optOut).map(p => p.serverPage))],
      writers: known.writers,
      pages: pages.map(p => ({
        file: p.file, pageId: p.pageId, serverPage: p.serverPage, note: p.note, title: p.title, refresh: p.refresh,
        modals: p.modals, pageModals: p.pageModals, tabs: p.tabs, print: p.print,
        optOut: p.optOut, pageTables: p.pageTables, calls: p.calls,
        tablesPerAction: p.calls.reduce((o, c) => {
          o[c.action] = { declared: known.actionTables[c.action] || [], reads: known.actionReads[c.action] || {} };
          return o;
        }, {}),
        views: p.views
      }))
    };
  });
  result.labels = labels;
  fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(result, null, 1) + '\n');

  /* inventory.md */
  const md = [];
  let total = 0;
  md.push('# Live notice — P0 inventory (generated by `tools/liveviews/inventory.js`)', '');
  md.push('Rule D2: a view lists **every table whose data is visible in that view** — including tables that only supply a looked-up name, a total or an available quantity. The reason is written next to each table. Curated decisions live in `view_decisions.json`; the scan cannot see everything.', '');
  md.push('A modal opened with `UIC.openModal` over a view makes the visible set **that view ∪ `form`** (the list stays visible under the dialog). A page or view without an entry falls back to *all* its tables, which is today\'s behaviour.', '');
  const optOut = [];
  COMPANIES.forEach(company => {
    const c = result.companies[company];
    md.push('## ' + company + ' (' + c.pages.length + ' pages)', '');
    md.push('Write helpers (Phase 5): ' + (c.writers.length ? c.writers.map(w => '`' + w + '`').join(', ') : '(none matched by name; savers are per handler)'), '');
    c.pages.forEach(p => {
      total++;
      if (p.optOut && optOut.indexOf(p.serverPage) === -1) optOut.push(p.serverPage);
      md.push('### `' + p.serverPage + '` — ' + (p.title || '') + ' (`' + p.file + '`)', '');
      if (p.note) md.push('- note: ' + p.note);
      md.push('- refresh passed to `arrive`: `' + (p.refresh || '?') + '`');
      md.push('- UIC.openModal sites: ' + p.modals + '; page modal openers: ' + p.pageModals + '; tabs: ' + (p.tabs ? 'yes' : 'no') + '; print: ' + (p.print ? 'yes' : 'no') + (p.optOut ? '; **OD7 opt-out (never cached on the device)**' : ''));
      md.push('- today\'s watch set (PAGE_TABLES): ' + (p.pageTables.map(t => '`' + t + '`').join(', ') || '(none)'));
      md.push('- actions called: ' + p.calls.map(x => '`' + x.action + '` (' + x.fns.join(', ') + ' → ' + x.views.join('/') + ')').join('; '));
      Object.keys(p.views).forEach(v => {
        md.push('- **view `' + v + '`**:');
        Object.keys(p.views[v]).forEach(t => md.push('  - `' + t + '` — ' + p.views[v][t]));
      });
      md.push('');
    });
  });
  md.push('## OD7 — pages never cached on the device', '', optOut.map(x => '`' + x + '`').join(', '), '');
  md.splice(1, 0, '', '**Pages: ' + total + '**');
  fs.writeFileSync(path.join(OUT, 'inventory.md'), md.join('\n') + '\n');

  const lm = ['# Live notice — table labels (proposed)', '', 'Source: Registry `labelAr` where it exists, else `label_overrides.json` (curated).', ''];
  let missing = 0;
  COMPANIES.forEach(company => {
    lm.push('## ' + company, '', '| Table | Label | Source |', '|---|---|---|');
    Object.keys(labels[company]).forEach(t => {
      const l = labels[company][t];
      if (/MISSING/.test(l.source)) missing++;
      lm.push('| `' + t + '` | ' + l.label + ' | ' + l.source + ' |');
    });
    lm.push('');
  });
  fs.writeFileSync(path.join(OUT, 'labels.md'), lm.join('\n') + '\n');
  console.log('pages: ' + total + ', labels missing: ' + missing);
  COMPANIES.forEach(c => console.log('  ' + c + ': ' + result.companies[c].pages.length + ' pages'));
}

if (require.main === module) main();
module.exports = { scanActions, scanPage, functionSpans, stripComments };
