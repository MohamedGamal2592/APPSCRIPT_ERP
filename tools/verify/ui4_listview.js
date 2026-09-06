/**
 * UI-4.5 / 4.6 / 4.8 — optional columns, multi-select, and the phone card view.
 *
 *   node tools/verify/ui4_listview.js
 *
 * Three things here are worth more than the features themselves:
 *
 *   D-5 IS HONOURED. The selection can be exported and printed. There is no
 *   batch write of any kind, and this file asserts that no write action exists
 *   rather than trusting the reading.
 *
 *   NO SCHEMA CHANGE. Column preferences ride on localStorage. Hard constraint
 *   1 forbids the alternative, so the check confirms nothing is written to a
 *   server.
 *
 *   THE PER-ROW DOM COST IS UNCHANGED. The card view needs a label per cell; it
 *   uses an ATTRIBUTE rather than an element, so the element count the
 *   performance programme owns does not move.
 */
'use strict';

const vm = require('vm');
const { execSync } = require('child_process');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

function boot(src) {
  const sb = makeSandbox({ scriptUrl: '#', SESSION_TOKEN: 't', CURRENT_ACTION: 'vf_purchasing' });
  const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!m[1].trim()) continue;
    try { vm.runInContext(m[1].replace(/<\?[\s\S]*?\?>/g, '0'), sb); } catch (e) {}
  }
  return sb;
}
const sb = boot(S.read('UI_Components.html'));
const UIC = sb.UIC;

const HEADERS = [
  { key: 'id', label: 'المعرف' },
  { key: 'name', label: 'الصنف' },
  { key: 'qty', label: 'الكمية', numeric: true },
  { key: 'total', label: 'الإجمالي', money: true }
];
function rows(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: 'R' + i, name: 'صنف ' + i, qty: i, total: i * 10 });
  return out;
}

/* ── 1. Opt-in: a plain table is unchanged ──────────────────────────────── */
(function () {
  UIC.dataTable('plain', { headers: HEADERS, rows: rows(5) });
  const st = sb.window.__dtStore.plain;
  ok(st.selectable === false, 'selection is off unless the page asks for it');
  const html = UIC.dataTable('plain2', { headers: HEADERS, rows: rows(5) });
  ok(html.indexOf('dt-sel') === -1, 'a plain table emits no checkbox column');
  ok(html.indexOf('dt-batch') === -1, 'and no batch bar');
})();

/* ── 2. Selection survives sort, filter and paging ──────────────────────── */
(function () {
  UIC.dataTable('sel', { headers: HEADERS, rows: rows(120), selectable: true, autoPage: false });
  const st = sb.window.__dtStore.sel;
  ok(st.selectable === true, 'selection is on when asked for');

  /* Select two rows by identity. */
  st.selected['R3'] = true;
  st.selected['R99'] = true;
  ok(UIC._dtSelectedRows('sel').length === 2, 'two rows selected');

  st.sortKey = 'qty'; st.sortDir = 'desc';
  UIC._applyFilters('sel');
  ok(UIC._dtSelectedRows('sel').length === 2, 'the selection survives a sort');

  st.searchTerm = 'صنف 3';
  UIC._applyFilters('sel');
  ok(st.selected['R3'] === true && st.selected['R99'] === true,
    'and survives a search that hides one of the selected rows');

  st.searchTerm = '';
  UIC._applyFilters('sel');
  const keys = UIC._dtSelectedRows('sel').map(r => r.id);
  ok(keys.indexOf('R3') !== -1 && keys.indexOf('R99') !== -1,
    'and both come back when the search is cleared', JSON.stringify(keys));

  UIC.dtClearSelection('sel');
  ok(UIC._dtSelectedRows('sel').length === 0, 'clearing empties it');
})();

/* ── 3. Select-all applies to the FILTERED set, not every loaded row ────── */
(function () {
  UIC.dataTable('all', { headers: HEADERS, rows: rows(50), selectable: true, autoPage: false });
  const st = sb.window.__dtStore.all;
  st.searchTerm = 'صنف 1';           /* matches 1, 10..19 */
  UIC._applyFilters('all');
  const shown = st.filtered.length;
  ok(shown > 0 && shown < 50, 'a search narrows the set to ' + shown);

  UIC._dtToggleAll('all', { checked: true });
  ok(UIC._dtSelectedRows('all').length === shown,
    'select-all selects exactly what is visible, not all 50 — selecting rows the ' +
    'user cannot see is how people act on the wrong records',
    String(UIC._dtSelectedRows('all').length));

  UIC._dtToggleAll('all', { checked: false });
  ok(UIC._dtSelectedRows('all').length === 0, 'and unselects them again');
})();

/* ── 4. D-5: read-only actions ONLY ─────────────────────────────────────── */
(function () {
  const src = S.read('UI_Components.html');
  ok(typeof UIC.dtExportSelection === 'function', 'export selection exists');
  ok(typeof UIC.dtPrintSelection === 'function', 'print selection exists');

  const forbidden = ['dtDeleteSelection', 'dtApproveSelection', 'dtBatchSave',
                     'dtBatchUpdate', 'dtBatchDelete', 'dtBatchApprove'];
  const found = forbidden.filter(n => typeof UIC[n] === 'function' || src.indexOf('UIC.' + n) !== -1);
  ok(found.length === 0,
    'D-5: NO batch write action of any kind ships', found.join(', '));

  /* The batch bar must offer nothing but the read-only three. */
  const bar = /UIC\._dtRefreshBatchBar = function[\s\S]*?\n};/.exec(src)[0];
  ok(!/API\.call|google\.script\.run|companyCall/.test(bar),
    'the batch bar makes no server call at all');
  ok(/dtExportSelection/.test(bar) && /dtPrintSelection/.test(bar) && /dtClearSelection/.test(bar),
    'it offers export, print and clear');
  const btns = (bar.match(/<button/g) || []).length;
  ok(btns === 3, 'and exactly three buttons', String(btns));

  /* Export and print must reuse the single existing implementation. */
  ok(/UIC\.exportExcel\(id\)/.test(src) && /UIC\.printTable\(id\)/.test(src),
    'they narrow the filtered set and call the ONE exporter and the ONE printer');
})();

/* ── 5. Optional columns, on localStorage, with no schema change ────────── */
(function () {
  UIC.dataTable('cols', { headers: HEADERS, rows: rows(5) });
  const st = sb.window.__dtStore.cols;
  ok(UIC._dtVisibleHeaders(st).length === 4, 'all columns visible by default');

  UIC.dtToggleColumn('cols', 'qty', false);
  ok(UIC._dtVisibleHeaders(st).length === 3, 'hiding one removes it from the render set');
  ok(UIC._dtVisibleHeaders(st).every(h => h.key !== 'qty'), 'and it is the right one');

  const key = UIC._dtColKey('cols');
  ok(key.indexOf('vf_purchasing') !== -1 && key.indexOf('cols') !== -1,
    'the preference is keyed by page action AND table id', key);
  const saved = sb.localStorage.getItem(key);
  ok(saved && JSON.parse(saved).qty === true, 'and is persisted to localStorage', String(saved));

  /* Reload the same table: the preference must come back. */
  UIC.dataTable('cols', { headers: HEADERS, rows: rows(5) });
  ok(UIC._dtVisibleHeaders(sb.window.__dtStore.cols).length === 3,
    'and is restored when the table is rebuilt');

  /* The last column cannot be hidden. */
  ['id', 'name', 'total'].forEach(k => UIC.dtToggleColumn('cols', k, false));
  ok(UIC._dtVisibleHeaders(sb.window.__dtStore.cols).length >= 1,
    'the user cannot hide every column and end up with a blank table',
    String(UIC._dtVisibleHeaders(sb.window.__dtStore.cols).length));

  const src = S.read('UI_Components.html');
  const fn = /UIC\._dtSaveColumnPrefs = function[\s\S]*?\n};/.exec(src)[0];
  ok(!/API\.call|google\.script\.run/.test(fn),
    'NO SCHEMA CHANGE and no server call — it is a per-device preference');
  ok(/try \{/.test(fn), 'and it tolerates localStorage being unavailable');
})();

/* ── 6. The columns menu ────────────────────────────────────────────────── */
(function () {
  UIC.dataTable('menu', { headers: HEADERS, rows: rows(3) });
  const m = UIC.columnsMenu('menu');
  ok((m.match(/type="checkbox"/g) || []).length === 4, 'one checkbox per column');
  ok(/aria-haspopup="true"/.test(m), 'the toggle declares its menu');
  ok(/UIC\.dtToggleColumn\('menu'/.test(m), 'each item toggles that table');
  ok(/dt-col-item/.test(m), 'items are styled by class, not inline');
})();

/* ── 7. The phone card view costs no DOM ────────────────────────────────── */
(function () {
  const st = sb.window.__dtStore.plain;
  const html = UIC._dtRowHtml(rows(1)[0], HEADERS, String, 0, st);
  ok((html.match(/data-label=/g) || []).length === 4,
    'every cell carries its column name for the card layout');
  const els = (html.match(/<[a-zA-Z]/g) || []).length;
  ok(els === 5, 'a 4-column row is still 5 elements — tr plus four td', String(els));

  /* Compare against Phase 0 for the count the performance programme owns. */
  try {
    const old = boot(execSync('git show e324cfc:UI_Components.html', { encoding: 'utf8', maxBuffer: 1e8 }));
    const oldHtml = old.UIC._dtRowHtml(rows(1)[0], HEADERS, String, 0);
    const oldEls = (oldHtml.match(/<[a-zA-Z]/g) || []).length;
    ok(els === oldEls, 'identical element count to the Phase 0 tree (' + oldEls + ')');
    console.log('        bytes per row ' + oldHtml.length + ' -> ' + html.length +
      ' (data-label attributes; the action cell saved far more)');
  } catch (e) {
    console.log('  SKIP  cannot read the Phase 0 tree (' + e.message + ')');
  }

  const css = S.allCss(S.read('UI_Components.html'));
  const base = css.slice(0, css.indexOf('@media (min-width: 600px)'));
  ok(/\.table thead \{ display: none; \}/.test(base) || /\.table thead\s*\{\s*display:\s*none/.test(base),
    'on a phone the header row is replaced by per-cell labels');
  ok(/td\[data-label\]::before/.test(base), 'and the label is drawn from the attribute');
  const t600 = css.slice(css.indexOf('@media (min-width: 600px)'));
  ok(/\.table thead \{ display: table-header-group; \}/.test(t600) ||
     /\.table thead\s*\{\s*display:\s*table-header-group/.test(t600),
    'and a real table returns from tablet-p up');
  ok(/\.table-wrap \{ max-height: none; \}/.test(base) || /max-height:\s*none/.test(base),
    'the card list scrolls with the page rather than inside a 70dvh box');
})();

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('UI-4.5/4.6/4.8 list view: all assertions pass.');
