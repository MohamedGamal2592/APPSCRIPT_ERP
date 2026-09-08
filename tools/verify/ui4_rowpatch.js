/**
 * UIC.PagedTable row patching — a row action costs one round trip, not a reload.
 *
 *   node tools/verify/ui4_rowpatch.js
 *
 * A status change or a delete alters ONE row. Refetching the page to show it
 * costs a full server read and throws away the user's scroll position, search
 * text, sort order and every extra page they pulled in with «عرض المزيد».
 *
 * The subtle part, and the reason this file exists: UIC.dataTable's store keeps
 * `originalRows` and `filtered` as SEPARATE arrays from the caller's `rows`.
 * They are shallow copies, so they hold the same row objects — which means a
 * patch has to mutate the row IN PLACE. Assigning a new array to allRows[i]
 * would look right until the user sorted or searched, at which point the table
 * would re-derive from originalRows and show the stale row again. That failure
 * is invisible in a screenshot and is what most of the checks below pin.
 *
 * The DOM repaint itself is NOT covered here: tools/verify/domstub.js renders
 * nothing and its querySelector returns null, so the repaint branch is a no-op
 * under node. What is covered is the data model the repaint reads from.
 */
'use strict';

const vm = require('vm');
const { makeSandbox } = require('./domstub');
const S = require('../lib/sources');

let failures = 0;
function ok(cond, label, extra) {
  if (cond) { console.log('  PASS  ' + label); return; }
  failures++;
  console.log('  FAIL  ' + label + (extra ? '  — ' + extra : ''));
}

function boot(src) {
  const sb = makeSandbox({ scriptUrl: '#', SESSION_TOKEN: 't', CURRENT_ACTION: 'vf_mfg_orders' });
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
const doc = sb.document;

/* The stub's querySelector always returns null; PagedTable needs '#id' to
   resolve. Teaching one container element to do that is enough to boot the real
   component — the ids it looks for are registered by the innerHTML assignment
   just above, exactly as they are in a browser. */
let seq = 0;
function makeContainer() {
  const el = doc.createElement('div');
  el.id = 'c' + (++seq);
  el.querySelector = function (sel) {
    const mm = String(sel).match(/^#([A-Za-z0-9_-]+)$/);
    return mm ? doc.getElementById(mm[1]) : null;
  };
  return el;
}

const HEADERS = ['كود', 'المنتج', 'الحالة', ''];
const COL_STATUS = 2, COL_ACTIONS = 3;

function recs() {
  return [
    { unique_id: 'MO-1', code: 'A-1', product: 'بطاطس', mo_status: 'Draft' },
    { unique_id: 'MO-2', code: 'A-2', product: 'زيت', mo_status: 'In Progress' },
    { unique_id: 'MO-3', code: 'A-3', product: 'سكر', mo_status: 'Locked' }
  ];
}

/** Build a real PagedTable over the fixture and hand back its handle + store. */
function build(opts) {
  const container = makeContainer();
  const rows = recs();
  const handle = UIC.PagedTable(Object.assign({
    container: container,
    headers: HEADERS,
    pageSize: 100,
    fetcher: function () { return Promise.resolve({ rows: rows, total: rows.length }); },
    mapRow: function (o) {
      return [o.code, o.product, 'pill:' + o.mo_status, 'btns:' + o.unique_id + ':' + o.mo_status];
    }
  }, opts || {}));
  return { handle: handle, container: container };
}

/* PagedTable's first fetch is a promise, so everything below waits for it. */
function afterLoad(fn) { return Promise.resolve().then(fn); }

/** The store the component rendered into — st.rows IS the component's allRows. */
function storeOf(handle) { return (sb.window.__dtStore || {})[handle.hostId]; }


(function main() {
  console.log('UI — PagedTable exposes a handle\n');
  const t = build({ rowKey: 'unique_id' });
  ok(!!t.handle, 'UIC.PagedTable returns a handle instead of undefined');
  ok(t.handle && typeof t.handle.patchRow === 'function', 'the handle carries patchRow');
  ok(t.handle && typeof t.handle.removeRow === 'function', 'and removeRow');

  return afterLoad(function () {
    const st = storeOf(t.handle);
    ok(!!st, 'the table rendered and registered its store');
    ok(st.rows.length === 3, 'three rows loaded', 'got ' + (st && st.rows.length));

    console.log('\nUI — patchRow rewrites one row and nothing else\n');
    const before2 = st.rows[1].slice();
    const hit = t.handle.patchRow('MO-1', (function () {
      const cells = [];
      cells[COL_STATUS] = 'pill:In Progress';
      cells[COL_ACTIONS] = 'btns:MO-1:In Progress';
      return cells;
    })());
    ok(hit === true, 'patchRow reports it found the row');
    ok(st.rows[0][COL_STATUS] === 'pill:In Progress', 'the status cell is the new one',
      st.rows[0][COL_STATUS]);
    ok(st.rows[0][COL_ACTIONS] === 'btns:MO-1:In Progress', 'and so is the actions cell');
    ok(st.rows[0][0] === 'A-1' && st.rows[0][1] === 'بطاطس',
      'the cells that were not passed are untouched');
    ok(JSON.stringify(st.rows[1]) === JSON.stringify(before2), 'the other rows are untouched');

    console.log('\nUI — the patch survives a sort or a search (the trap)\n');
    /* originalRows and filtered are separate arrays holding the same row
       objects. An in-place write is visible through all three; a replacement
       would only be visible through st.rows. */
    ok(st.originalRows[0] === st.rows[0],
      'originalRows still holds the very same row object — the row was mutated, not replaced');
    ok(st.filtered[0] === st.rows[0], 'and so does filtered');
    ok(st.originalRows[0][COL_STATUS] === 'pill:In Progress',
      'so re-deriving from the load order shows the PATCHED status, not the stale one');

    console.log('\nUI — a row that cannot be addressed reports false\n');
    ok(t.handle.patchRow('NOPE', { 2: 'x' }) === false,
      'an unknown key returns false, so the caller can fall back to a reload');
    ok(t.handle.patchRow('', { 2: 'x' }) === false, 'and so does an empty key');

    console.log('\nUI — removeRow drops exactly one row, with no fetch\n');
    let fetches = 0;
    const t2 = build({
      rowKey: 'unique_id',
      fetcher: function () {
        fetches++;
        const rows = recs();
        return Promise.resolve({ rows: rows, total: rows.length });
      }
    });
    return afterLoad(function () {
      const st2 = storeOf(t2.handle);
      ok(fetches === 1, 'one fetch to draw the table', 'got ' + fetches);
      ok(t2.handle.removeRow('MO-2') === true, 'removeRow reports it found the row');
      const st2b = storeOf(t2.handle);
      ok(fetches === 1, 'and removing a row cost NO extra fetch', 'got ' + fetches);
      ok(st2b.rows.length === 2, 'two rows remain', 'got ' + st2b.rows.length);
      ok(st2b.rows.map(function (r) { return r[0]; }).join(',') === 'A-1,A-3',
        'the right one went', st2b.rows.map(function (r) { return r[0]; }).join(','));
      ok(t2.handle.removeRow('MO-2') === false, 'removing it twice is a no-op, not a crash');

      console.log('\nUI — without rowKey the handle degrades honestly\n');
      const t3 = build({});
      return afterLoad(function () {
        ok(t3.handle.patchRow('MO-1', { 2: 'x' }) === false,
          'patchRow returns false when no rowKey was configured');
        ok(t3.handle.removeRow('MO-1') === false, 'and so does removeRow');
        ok(storeOf(t3.handle).rows.length === 3,
          'the table is left exactly as it was, so the caller reloads instead');

        console.log('\n' + (failures === 0
          ? 'OK — a row action patches its row; the table, its order and its pages survive.'
          : failures + ' check(s) FAILED.'));
        process.exit(failures === 0 ? 0 : 1);
      });
    });
  });
})();
