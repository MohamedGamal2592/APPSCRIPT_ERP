'use strict';

/**
 * VM harness for Valley Foods SERVER actions.
 *
 * WHAT THIS IS
 * `gasstub.js` can load and run Code.js with faked Google services. This file
 * adds the missing half: a fake workbook (`vf_workbook_stub.js`) that the REAL
 * `getSheet_` / `getHeaders_` / `getAllRecords_` / `getReadOnlyRecords_` accept,
 * and a thin loader that brings `Company_ValleyFoods_Actions.js` into the same
 * VM context. A handler under test therefore runs its actual code — real
 * header resolution, real range reads, real record building, real cache use —
 * against fixture rows, with no spreadsheet, no network and no production data.
 *
 * The dispatch surface is the module's own (`ValleyFoods.dispatch_`,
 * `Company_ValleyFoods_Actions.js:504`). The production entry
 * `executeCompanyAction_` is deliberately bypassed: it authenticates against
 * live session state a VM cannot provide. `dispatch_` is the layer under it and
 * is what this harness drives, with an explicit tenant id.
 *
 * Guardrails honoured by construction: nothing here writes a business table
 * (the workbook lives in this process), nothing touches ScriptProperties, and
 * `noteMutation_` is a no-op — a harness run can never stamp or mutate the real
 * system.
 */

const fs = require('fs');
const path = require('path');
const gasstub = require('./gasstub');
const workbookStub = require('./vf_workbook_stub');

const EXTRA_SOURCES = ['Core_FastSave.js', 'Core_FastRead.js', 'Core_ViewEngine.js', 'Company_ValleyFoods_Actions.js']
  .filter(function (f) { return fs.existsSync(path.join(path.resolve(__dirname, '..', '..'), f)); });

/**
 * @param {object} [opts]
 * @param {string} [opts.dbId]  tenant spreadsheet id used for every dispatch
 * @param {number} [opts.now]   starting clock for the stub cache
 * @param {string[]} [opts.sources]  override the module sources (default
 *        Core_FastSave.js + Company_ValleyFoods_Actions.js). Paths may be
 *        absolute, which is how a "test the test" run loads a historical
 *        revision of the module from a temp file without touching the repo.
 * @param {Array<{file: string, find: string, replace: string}>} [opts.sourcePatches]
 *        in-memory source edits applied while loading (e.g. simulating the
 *        module flag being flipped by the owner). No file is written; a patch
 *        whose `find` text is absent throws, so a silent no-op is impossible.
 * @return {object} harness
 */
function createVfHarness(opts) {
  opts = opts || {};
  const dbId = String(opts.dbId || 'vf-harness-db');
  const workbook = workbookStub.createWorkbookStub();
  workbook.createSpreadsheet(dbId, []);

  const patches = opts.sourcePatches || [];
  const transformSource = patches.length ? function (file, src) {
    const base = path.basename(String(file));
    patches.forEach(function (p) {
      if (String(p.file) !== base) return;
      if (src.indexOf(p.find) === -1) {
        throw new Error('harness: source patch target not found in ' + base + ': ' + p.find);
      }
      src = src.split(p.find).join(p.replace);
    });
    return src;
  } : undefined;

  const H = gasstub.createHarness({
    workbook: workbook,
    sources: opts.sources || EXTRA_SOURCES,
    now: opts.now,
    transformSource: transformSource
  });

  /* The tenant double-check in `authorize_` compares the dispatched dbId with
   * this company's own spreadsheet id. In production that is a cache+sheet
   * lookup in the auth spreadsheet; here it is the harness tenant by
   * construction, which is what makes an explicit dbId dispatch legal. */
  H.override('getCompanySpreadsheetId_', function () { return dbId; });

  const valleyFoods = H.eval('ValleyFoods');
  const book = workbook.openById(dbId);

  /* ── fixtures ─────────────────────────────────────────────────────────── */
  /**
   * Create (or replace) a sheet with a header row and data rows.
   * @param {string} name
   * @param {string[]} headers
   * @param {Array<Array>} [rows]
   */
  H.addSheet = function (name, headers, rows) {
    let sheet = book.getSheetByName(name);
    if (!sheet) sheet = book.addSheet(name);
    sheet.__setRows([headers.slice()].concat((rows || []).map(function (r) { return r.slice(); })));
    return sheet;
  };

  H.sheet = function (name) {
    const sheet = book.getSheetByName(name);
    if (!sheet) throw new Error('harness: no fixture sheet named ' + name);
    return sheet;
  };

  H.hasSheet = function (name) { return !!book.getSheetByName(name); };

  /* ── dispatch ─────────────────────────────────────────────────────────── */
  /**
   * Run a registered VF action the way the module's dispatcher does.
   * @param {string} action  module_action name
   * @param {object} [data]
   * @param {object} [user]  defaults to a super-admin (guard_ short-circuits)
   * @param {object} [guardCtx]
   */
  H.dispatch = function (action, data, user, guardCtx) {
    const payload = { module_action: action, data: data || {} };
    return valleyFoods.dispatch_(payload, user || { isSuperAdmin: true }, dbId, guardCtx || {});
  };

  H.valleyFoods = valleyFoods;
  H.dbId = dbId;
  H.workbook = workbook;

  /* ── execution lifecycle ──────────────────────────────────────────────── */
  /** What the real request entry does before a handler runs. */
  H.newExecution = function () {
    H.ctx.resetRecordCache_();
    H.eval('for (const k in _headerCache_) delete _headerCache_[k];');
  };

  H.sheetsReadCount = function () { return H.ctx.getSheetsReadCount_(); };
  H.stats = function () { return workbook.stats(); };
  H.resetStats = function () { workbook.resetStats(); };

  /** Pull named globals out of the VM context (functions stay VM-realm, which
   *  is what makes them execute the loaded source rather than a copy). */
  H.grab = function (names) {
    const out = {};
    (names || []).forEach(function (n) {
      if (typeof H.ctx[n] === 'undefined') throw new Error('harness: global not found: ' + n);
      out[n] = H.ctx[n];
    });
    return out;
  };

  return H;
}

module.exports = { createVfHarness: createVfHarness, EXTRA_SOURCES: EXTRA_SOURCES };
