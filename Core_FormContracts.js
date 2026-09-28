/* ============================================================================
 * Core_FormContracts.js — shared form/command contracts and a planned
 * document-save context.
 *
 * Stage B (shared contracts) and the reusable half of stages D/E of
 * Plan_Instant_Forms_Production_Safe.md. It owns three things and nothing else:
 *
 *   1. fcTableSpec_        declarative table metadata (key, parent, writable
 *                          fields, formula-owned fields, storage route).
 *   2. fcNormalizeCommand_ one normalizer for a form submission: header,
 *                          present-but-empty vs omitted sections, explicit
 *                          deletion lists, scope, base token, request identity.
 *   3. fcDocContext_       a request-scoped document context: ONE bounded read
 *                          per table, key/row-location maps reused by every
 *                          consumer, per-table numeric-ID range reservation
 *                          inside the caller's existing lock, a complete write
 *                          plan, a pre-write budget check, and a commit that
 *                          executes the plan through the existing fast-save
 *                          primitives (fsPatchRowsByNumber_ / fsAppendRowsBlock_
 *                          / fsDeleteRows_).
 *
 * WHAT THIS IS NOT
 * It holds no business rules, no table names, no module identifiers and no
 * user-facing strings (the same decoupling contract Core_FastSave.js and
 * Core_ViewEngine.js carry). Callers declare their own specs, compute their own
 * values and keep their own validation; this file only reads, plans, counts and
 * commits what they asked for.
 *
 * FLAGS
 * FORM_CONTRACTS_CORE_ is the master switch and defaults to false. Every entry
 * point refuses to run while it is false, so shipping this file changes no
 * behaviour until an owner turns it on together with a module flag.
 * formContractsOnFor_(flag) answers "module flag AND master switch".
 *
 * COMMIT DEPENDS ON THE FAST-SAVE ENGINE
 * The commit step deliberately delegates every sheet write to Core_FastSave.js
 * rather than opening a second write path: those primitives already own
 * formula protection, row-range refusal, batched ranges and the mutation
 * stamp. A caller enabling this context therefore also needs FAST_SAVE_CORE_
 * true; commit refuses with FC_ENGINE_DISABLED otherwise instead of silently
 * falling back to the legacy writer.
 *
 * OPERATION ORDER (and why it differs from the legacy per-table order)
 * Per table: patch -> delete -> append. Deletes run BEFORE appends so the row
 * numbers a caller computed during planning are still valid when the patch is
 * written, and so an append's own row number — which its formulas address by
 * letter+row — is computed AFTER every deletion that shifts rows. The legacy
 * manufacturing path appends before deleting; that ordering is preserved where
 * it is live, and this context is only used by candidates that opt in.
 * ==========================================================================*/

var FORM_CONTRACTS_CORE_ = false;

/* Per-module opt-in switches live with the modules themselves. */
function formContractsOnFor_(flag) {
  return flag === true && FORM_CONTRACTS_CORE_ === true;
}

/* Safety valves, not performance claims. The write-call allowance is per
 * section and deliberately covers the worst case the plan documents:
 * patches + deletes + one append block. */
var FC_MAX_RANGES_PER_BATCH_ = 100;
var FC_BUDGET_KEY_READS_PER_SECTION_ = 1;
var FC_BUDGET_WRITE_CALLS_PER_SECTION_ = 3;
var FC_BUDGET_WRITE_CALLS_TOTAL_ = 24;
var FC_BUDGET_PATCH_CELLS_TOTAL_ = 400000;
var FC_BUDGET_APPEND_ROWS_TOTAL_ = 2000;

var FC_RESPONSE_VERSION_ = 1;

/* ── typed errors ────────────────────────────────────────────────────────── */
function fcError_(code, message, detail) {
  var e = new Error(message);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function fcAssertOn_() {
  if (FORM_CONTRACTS_CORE_ !== true) {
    throw fcError_('FC_DISABLED', 'Form-contracts core is disabled (FORM_CONTRACTS_CORE_ is false)');
  }
}

function fcAssertEngine_() {
  if (typeof fastSaveIsOn_ !== 'function' || !fastSaveIsOn_()) {
    throw fcError_('FC_ENGINE_DISABLED',
      'Form-contracts commit needs the fast-save engine (FAST_SAVE_CORE_ is false)');
  }
}

/* ── key encoding ──────────────────────────────────────────────────────────
 * A single-column key is the trimmed string, unchanged from the fast-save
 * engine's contract (fsKeyFromValues_ / fsKeyIndex_). A COMPOSITE key is
 * length-prefixed — ['abc','12'] encodes as '3:abc2:12' — instead of being
 * joined with an unescaped delimiter, so two different value tuples can never
 * collide (the engine's own '|' join cannot distinguish ['a|b'] from ['a','b'];
 * that contract is left untouched for its callers, and the context uses this
 * encoding for its own maps). Blank components are preserved so a composite
 * key never collapses, and a row whose components are ALL blank is not
 * addressable (the same rule fsKeyIndex_ applies). */
function fcEncodeKeyParts_(parts) {
  var out = '';
  for (var i = 0; i < parts.length; i++) {
    var p = String(parts[i] == null ? '' : parts[i]);
    out += p.length + ':' + p;
  }
  return out;
}

function fcKeyFromParts_(parts) {
  if (!parts || !parts.length) return '';
  if (parts.length === 1) return String(parts[0] == null ? '' : parts[0]);
  return fcEncodeKeyParts_(parts);
}

/* ── 1. table specification ────────────────────────────────────────────────
 * spec = {
 *   name          caller-chosen context key (required)
 *   sheetName     the sheet the repository reads/writes (required)
 *   keyColumn     string or [strings] — the row identity column(s) (required)
 *   parentColumn  optional: the column holding the owning document's key
 *   idColumn      optional numeric id column, default 'id'
 *   columns       optional explicit read/column list; defaults to
 *                 keyColumns + parentColumn + idColumn + fields
 *   fields        writable business fields this table may be patched with
 *   formulaFields fields whose cells are sheet formulas and must never be
 *                 written as values (the fast-save primitive also probes live
 *                 formulas; this list is the caller's own declaration)
 *   storage       'sheet' (default). Adapters that are not sheets must not be
 *                 routed through this context; the field exists so a caller
 *                 can declare its route instead of assuming one.
 *   duplicatePolicy 'first' (default) or 'last': which row a duplicated key
 *                 resolves to. The context does NOT pick a winner for the
 *                 caller — fsKeyIndex_ documents first-match, while the
 *                 legacy getAllRecords_ object-assignment maps used by the
 *                 manufacturing save resolve last-match. A caller that needs
 *                 the legacy answer must say so.
 *   keyCase       'exact' (default) or 'insensitive'. Insensitive lowercases
 *                 the lookup key on both sides; it never changes what is
 *                 stored on the row.
 *   immutable     true freezes every loaded row, so one consumer cannot mutate
 *                 a snapshot another validator is about to read. Default false
 *                 keeps the read cost of the existing context unchanged.
 *   derivedFrom   table names whose mutation invalidates this table's snapshot
 *                 (formula-derived data). Used by
 *                 invalidateDerivedDependencies.
 * }
 */
function fcTableSpec_(spec) {
  var s = spec || {};
  var name = String(s.name || '').trim();
  if (!name) throw fcError_('FC_BAD_SPEC', 'A table spec needs a name');
  var sheetName = String(s.sheetName || '').trim();
  if (!sheetName) throw fcError_('FC_BAD_SPEC', 'Table "' + name + '" needs a sheetName');
  var keyColumns = [];
  (Array.isArray(s.keyColumn) ? s.keyColumn : [s.keyColumn]).forEach(function (k) {
    var kk = String(k == null ? '' : k).trim();
    if (kk && keyColumns.indexOf(kk) === -1) keyColumns.push(kk);
  });
  if (!keyColumns.length) throw fcError_('FC_BAD_SPEC', 'Table "' + name + '" needs a keyColumn');
  var fields = [];
  (s.fields || []).forEach(function (f) {
    var ff = String(f == null ? '' : f).trim();
    if (ff && fields.indexOf(ff) === -1) fields.push(ff);
  });
  var formulaFields = [];
  (s.formulaFields || []).forEach(function (f) {
    var ff = String(f == null ? '' : f).trim();
    if (ff && formulaFields.indexOf(ff) === -1) formulaFields.push(ff);
  });
  var parentColumn = String(s.parentColumn || '').trim();
  var idColumn = String(s.idColumn || 'id').trim();
  var columns = [];
  (s.columns || []).forEach(function (c) {
    var cc = String(c == null ? '' : c).trim();
    if (cc && columns.indexOf(cc) === -1) columns.push(cc);
  });
  keyColumns.concat(parentColumn ? [parentColumn] : [], idColumn ? [idColumn] : [], fields, formulaFields)
    .forEach(function (c) { if (c && columns.indexOf(c) === -1) columns.push(c); });
  return {
    name: name,
    sheetName: sheetName,
    keyColumns: keyColumns,
    keyColumn: keyColumns[0],
    compositeKey: keyColumns.length > 1,
    parentColumn: parentColumn,
    idColumn: idColumn,
    columns: columns,
    fields: fields,
    formulaFields: formulaFields,
    storage: String(s.storage || 'sheet'),
    duplicatePolicy: String(s.duplicatePolicy || 'first') === 'last' ? 'last' : 'first',
    keyCase: String(s.keyCase || 'exact') === 'insensitive' ? 'insensitive' : 'exact',
    immutable: s.immutable === true,
    derivedFrom: (s.derivedFrom || []).map(function (n) { return String(n == null ? '' : n).trim(); }).filter(Boolean)
  };
}

/* ── 2. command normalization ──────────────────────────────────────────────
 * raw = {
 *   header     { field: value }        omitted/null => header untouched
 *   sections   { sectionName: rows }   an OMITTED key means "untouched".
 *                                      A PRESENT but empty array means "no rows
 *                                      supplied", which is NEVER deletion
 *                                      evidence.
 *   deletions  { sectionName: [uid] }  the only deletion evidence accepted
 *   scope      [sectionName]           optional; intersected with spec.sections
 *   baseToken  string                  optimistic-concurrency token, opaque here
 *   requestId  string                  request identity, opaque here
 * }
 * spec = { sections: ['a','b', ...] }
 *
 * The returned `present` map is what callers must consult before treating an
 * absent section as an empty one; `sections[name]` is null when omitted.
 */
function fcNormalizeCommand_(raw, spec) {
  var r = raw || {};
  var s = spec || {};
  var names = [];
  (s.sections || []).forEach(function (n) {
    var nn = String(n == null ? '' : n).trim();
    if (nn && names.indexOf(nn) === -1) names.push(nn);
  });

  var sections = {}, present = {}, deletions = {};
  names.forEach(function (n) {
    var supplied = Object.prototype.hasOwnProperty.call(r.sections || {}, n);
    present[n] = supplied;
    if (!supplied) { sections[n] = null; }
    else {
      var list = r.sections[n];
      sections[n] = Array.isArray(list) ? list.slice() : [];
    }
    var del = (r.deletions && Array.isArray(r.deletions[n])) ? r.deletions[n] : [];
    var seen = {}, out = [];
    del.forEach(function (v) {
      var u = String(v == null ? '' : v).trim();
      if (u && !seen[u]) { seen[u] = true; out.push(u); }
    });
    deletions[n] = out;
  });

  var scope = [];
  var wanted = Array.isArray(r.scope) && r.scope.length ? r.scope : names;
  wanted.forEach(function (n) {
    var nn = String(n == null ? '' : n).trim();
    if (nn && names.indexOf(nn) !== -1 && scope.indexOf(nn) === -1) scope.push(nn);
  });

  return {
    header: (r.header === null || r.header === undefined) ? null : r.header,
    sections: sections,
    present: present,
    deletions: deletions,
    scope: scope,
    baseToken: String(r.baseToken || ''),
    requestId: String(r.requestId || '')
  };
}

/* ── 3. document context ───────────────────────────────────────────────────
 * ctx = fcDocContext_({ scopeId: dbId, label: 'action_name' })
 *
 * Read API (one bounded read per table; repeated calls are free):
 *   ctx.table(spec)                    register, returns the normalized spec
 *   ctx.readByKey(name)                full declared-column rows + key->row map
 *   ctx.readAll(name)                  full declared-column rows, no key map
 *   ctx.readChildren(name, parentVal)  parent-scoped rows + key->row map
 *   ctx.scopeChildren(name, parents)   scope an already-read table by parent
 *   ctx.markEmpty(name)                declare a provably-new document empty
 *   ctx.locateKeys(name, keys)         key-column read -> { map: key->row }
 *   ctx.relocateKeys(name, keys)       the same, deliberately fresh
 *   ctx.reserveIds(name, count)        count consecutive ids, one column scan,
 *                                      inside the caller's existing lock
 *
 * Lookup API (all in memory; they never read a sheet):
 *   ctx.keyFor(name, values)           canonical key for a row/values object
 *   ctx.getByKey(name, key)            row or null
 *   ctx.getManyByKeys(name, keys)      { found: [...], missing: [...] }
 *   ctx.getChildren(name, parentKey)   child rows in sheet order (child index)
 *   ctx.buildChildIndex(name)          parent -> children Map from readAll rows
 *   ctx.getRowLocation(name, key)      spreadsheet row number or 0
 *   ctx.epochOf(name)                  snapshot generation for a table
 *   ctx.invalidateTable(name)          drop rows/maps/locations, bump the epoch
 *   ctx.invalidateDerivedDependencies(name)  invalidate tables that declare
 *                                      derivedFrom: [name] (formula-derived)
 *
 * Snapshot rules:
 *   - One read per (table, projection); the declared columns ARE the
 *     projection, so a consumer that needs a field must declare it.
 *   - Maps are null-prototype objects (or a Map for parent indexes) so an
 *     inherited property can never be mistaken for a row.
 *   - duplicatePolicy / keyCase / immutable are per table; see fcTableSpec_.
 *   - After a business mutation the caller invalidates the written tables and
 *     their derived dependents. A stale row number must never be reused.
 *
 * Plan API (no writes):
 *   ctx.plan(name)                     the section plan
 *   ctx.addPatch(name, key, values)    patch by row number, resolved from the
 *                                      loaded map (throws FC_MISSING_KEY when
 *                                      the key is not in the loaded state)
 *   ctx.addAppend(name, values, formulas)  values in header order; `formulas`
 *                                      optional fn(rowNumber, headers) -> map
 *   ctx.addDelete(name, key)           explicit deletion only
 *
 * Execution:
 *   ctx.preflight(limits)              shape/keys/formulas/coordinates/size/
 *                                      operation budget — BEFORE any write
 *   ctx.commit()                       patch -> delete -> append per section
 *   ctx.manifest()                     JSON-safe counters, no business values
 */
function fcDocContext_(opts) {
  fcAssertOn_();
  var o = opts || {};
  var scopeId = o.scopeId;
  if (!scopeId) throw fcError_('FC_BAD_SPEC', 'A document context needs a scopeId');

  var tables = {};
  var plans = {};
  var readCount = 0;

  function sheetFor(t) { return getSheet_(t.sheetName, scopeId); }

  function register(spec) {
    var t = fcTableSpec_(spec);
    t.rows = null;
    t.byKey = null;
    t.children = null;
    t.childrenParent = null;
    t.allRows = null;
    t.childIndex = null;
    t.located = null;
    t.idRanges = [];
    t.epoch = 0;
    tables[t.name] = t;
    return t;
  }

  function needTable(name) {
    var t = tables[name];
    if (!t) throw fcError_('FC_UNKNOWN_TABLE', 'Table "' + String(name) + '" is not registered in this context');
    return t;
  }

  /* ── identity + map helpers ───────────────────────────────────────────────
   * One place that decides what a key IS, so every map in the context agrees:
   * trimmed components, an unambiguous encoding for composites, a blank-key
   * row not addressable, and the table's own duplicate/case policy. */
  function keyForSpec_(t, values) {
    var parts = [];
    t.keyColumns.forEach(function (kc) { parts.push(fsNormalizeKeyPart_(values ? values[kc] : '')); });
    if (!parts.some(function (p) { return !!p; })) return '';
    return fcKeyFromParts_(parts);
  }

  function keyFor(name, values) {
    return keyForSpec_(needTable(name), values);
  }

  function mapKey_(t, key) {
    var k = String(key == null ? '' : key);
    return t.keyCase === 'insensitive' ? k.toLowerCase() : k;
  }

  function putKey_(t, map, key, row) {
    if (!key) return;
    var k = mapKey_(t, key);
    if (t.duplicatePolicy === 'last' || !Object.prototype.hasOwnProperty.call(map, k)) map[k] = row;
  }

  function freezeRows_(t, rows) {
    if (!t.immutable) return rows;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row && !Object.isFrozen(row)) { try { Object.freeze(row); } catch (e) {} }
    }
    return rows;
  }

  function indexRows_(t, rows) {
    freezeRows_(t, rows);
    var byKey = Object.create(null);
    rows.forEach(function (row) { putKey_(t, byKey, keyForSpec_(t, row), row); });
    return byKey;
  }

  /* ── lookup API (in memory only) ─────────────────────────────────────────
   * None of these reads a sheet. A table that has not been loaded throws
   * FC_NOT_READ rather than answering with an empty table — a storage error
   * must never be reported as "no records". */
  function assertLoaded_(t) {
    if (!t.byKey) throw fcError_('FC_NOT_READ', 'Table "' + t.name + '" must be read before it is looked up');
  }

  function getByKey(name, key) {
    var t = needTable(name);
    assertLoaded_(t);
    return t.byKey[mapKey_(t, key)] || null;
  }

  function getManyByKeys(name, keys) {
    var t = needTable(name);
    assertLoaded_(t);
    var found = [], missing = [];
    (keys || []).forEach(function (k) {
      var row = t.byKey[mapKey_(t, k)];
      if (row) found.push(row);
      else missing.push(String(k == null ? '' : k).trim());
    });
    return { found: found, missing: missing };
  }

  function buildChildIndex(name) {
    var t = needTable(name);
    if (!t.parentColumn) throw fcError_('FC_BAD_SPEC', 'Table "' + t.name + '" has no parentColumn');
    if (!t.allRows) throw fcError_('FC_NOT_READ', 'Table "' + t.name + '" must be read with readAll before a child index is built');
    if (t.childIndex) return t.childIndex;
    var index = new Map();
    t.allRows.forEach(function (row) {
      var p = fsNormalizeKeyPart_(row[t.parentColumn]);
      if (!p) return;
      var list = index.get(p);
      if (!list) { list = []; index.set(p, list); }
      list.push(row);
    });
    t.childIndex = index;
    return index;
  }

  /* Children in sheet-row order, which is the order every existing reader
   * produces (fsReadRowsByParent_ and a filtered getAllRecords_ both walk the
   * sheet top-down). The array belongs to the snapshot: callers must not
   * mutate it or the rows in it. */
  function getChildren(name, parentKey) {
    var t = needTable(name);
    var index = t.childIndex || buildChildIndex(name);
    var p = fsNormalizeKeyPart_(parentKey);
    if (!p) return [];
    return index.get(p) || [];
  }

  function getRowLocation(name, key) {
    var row = getByKey(name, key);
    return row && row.__row ? row.__row : 0;
  }

  function epochOf(name) { return needTable(name).epoch || 0; }

  /* Drop every derived structure for one table. Row locations go with them:
   * a row number is a physical position, not an identity, and an append,
   * delete or external sort invalidates it. */
  function clearSnapshot_(t) {
    t.rows = null;
    t.byKey = null;
    t.children = null;
    t.childrenParent = null;
    t.allRows = null;
    t.childIndex = null;
    t.located = null;
    t.idRanges = [];
  }

  function invalidateTable(name) {
    var t = needTable(name);
    clearSnapshot_(t);
    t.epoch = (t.epoch || 0) + 1;
    return t;
  }

  function invalidateDerivedDependencies(name) {
    var changed = [];
    Object.keys(tables).forEach(function (n) {
      if (n === name) return;
      var t = tables[n];
      if ((t.derivedFrom || []).indexOf(name) !== -1) { invalidateTable(n); changed.push(n); }
    });
    return changed;
  }

  function readByKey(name) {
    var t = needTable(name);
    if (t.byKey) return t;
    var block = fsReadBlockRows_(sheetFor(t), t.columns);
    readCount += block.reads;
    t.rows = block.rows;
    t.childIndex = null;
    t.byKey = indexRows_(t, block.rows);
    return t;
  }

  function readChildren(name, parentValue) {
    var t = needTable(name);
    if (!t.parentColumn) throw fcError_('FC_BAD_SPEC', 'Table "' + t.name + '" has no parentColumn');
    var want = String(parentValue == null ? '' : parentValue).trim();
    if (t.children && t.childrenParent === want) return t;
    var block = fsReadRowsByParent_(sheetFor(t), t.parentColumn, want, t.columns);
    readCount += block.reads;
    t.children = block.rows;
    t.childrenParent = want;
    t.byKey = indexRows_(t, block.rows);
    return t;
  }

  function readAll(name) {
    var t = needTable(name);
    if (t.allRows) return t;
    var block = fsReadBlockRows_(sheetFor(t), t.columns);
    readCount += block.reads;
    t.allRows = block.rows;
    t.childIndex = null;
    freezeRows_(t, block.rows);
    return t;
  }

  /* Build the child scope of an already-read table from its full row set.
   * Used where ownership must be judged against the WHOLE table (a supplied
   * key owned by a different parent must be refused) while the plan only ever
   * touches this document's rows. */
  function scopeChildren(name, parentValues) {
    var t = needTable(name);
    if (!t.allRows) throw fcError_('FC_NOT_READ', 'Table "' + t.name + '" must be read with readAll before it can be scoped');
    if (!t.parentColumn) throw fcError_('FC_BAD_SPEC', 'Table "' + t.name + '" has no parentColumn');
    var want = Object.create(null);
    (Array.isArray(parentValues) ? parentValues : [parentValues]).forEach(function (v) {
      var vv = String(v == null ? '' : v).trim();
      if (vv) want[vv] = true;
    });
    t.children = t.allRows.filter(function (row) {
      return want[fsNormalizeKeyPart_(row[t.parentColumn])] === true;
    });
    t.childrenParent = null;
    t.byKey = indexRows_(t, t.children);
    return t;
  }

  /* Declare a table known-empty for this document without reading it. Only
   * sound when the parent key provably did not exist before this request (a
   * brand-new deterministic identity), so no child row can reference it. */
  function markEmpty(name) {
    var t = needTable(name);
    t.allRows = t.allRows || [];
    t.children = [];
    t.byKey = Object.create(null);
    t.childrenParent = null;
    t.childIndex = new Map();
    return t;
  }

  function locateKeys(name, keys) {
    var t = needTable(name);
    if (t.located) return t.located;
    var wanted = {};
    (keys || []).forEach(function (k) { var kk = String(k == null ? '' : k).trim(); if (kk) wanted[kk] = true; });
    var located = fsKeyIndex_(sheetFor(t), t.compositeKey ? t.keyColumns : t.keyColumn, wanted);
    readCount += located.reads;
    t.located = located;
    return located;
  }

  /* A fresh key-column location that does NOT reuse the cached map. Needed
   * after a delete has shifted rows: a row number read before the delete is
   * no longer trustworthy, and trusting it would write the wrong row. */
  function relocateKeys(name, keys) {
    var t = needTable(name);
    var wanted = {};
    (keys || []).forEach(function (k) { var kk = String(k == null ? '' : k).trim(); if (kk) wanted[kk] = true; });
    var located = fsKeyIndex_(sheetFor(t), t.compositeKey ? t.keyColumns : t.keyColumn, wanted);
    readCount += located.reads;
    t.located = located;
    return located;
  }

  /* Numeric-ID range reservation. Delegates to the existing batch allocator,
   * which is itself lock-protected and re-entrant, reads the id column ONCE
   * per call and floors every answer at max(live table max, high-water) + 1.
   * No counter, column or row is written by this call. */
  function reserveIds(name, count) {
    var t = needTable(name);
    var n = Number(count);
    if (!isFinite(n) || n <= 0) return 0;
    n = Math.floor(n);
    var start = getNextIdBatch_(scopeId, t.sheetName, n, t.idColumn);
    t.idRanges.push({ start: start, count: n });
    return start;
  }

  function plan(name) {
    needTable(name);
    if (!plans[name]) {
      plans[name] = {
        name: name,
        patchesByRow: {},
        patchKeys: {},
        appends: [],
        deletes: [],
        preserveFormulas: true,
        overwriteColumns: null,
        skipFormulaProbe: false,
        keyReads: 0,
        writeCalls: 0,
        cells: 0,
        startRow: 0
      };
    }
    return plans[name];
  }

  /* Resolve one key to its loaded row. `allowMissing` exists only for callers
   * whose recovery contract has already authenticated an absent row; ordinary
   * planning must fail loudly rather than write into an unverified row number. */
  function rowFor(name, key, allowMissing) {
    var t = needTable(name);
    if (!t.byKey) {
      throw fcError_('FC_NOT_READ', 'Table "' + t.name + '" must be read before it is planned');
    }
    var k = String(key == null ? '' : key).trim();
    var row = t.byKey[mapKey_(t, k)];
    if (!row && !allowMissing) {
      throw fcError_('FC_MISSING_KEY', 'Row not found for key in ' + t.sheetName, { sheetName: t.sheetName, key: k });
    }
    return row || null;
  }

  function addPatch(name, key, values, optsPatch) {
    var p = plan(name);
    var row = rowFor(name, key, optsPatch && optsPatch.allowMissing);
    if (!row) return null;
    var t = tables[name];
    var mapped = {};
    Object.keys(values || {}).forEach(function (field) {
      var idx = fsHeaderIndex_(getHeaders_(sheetFor(t)), field);
      if (idx === -1) return; /* unknown keys are ignored, as patchRowByCriteria_ does */
      mapped[String(field).trim()] = values[field];
    });
    if (!Object.keys(mapped).length) return row;
    var rowNum = row.__row;
    p.patchesByRow[rowNum] = Object.assign(p.patchesByRow[rowNum] || {}, mapped);
    p.patchKeys[String(key).trim()] = rowNum;
    return row;
  }

  function addAppend(name, values, formulas) {
    var p = plan(name);
    var t = tables[name];
    var headers = getHeaders_(sheetFor(t));
    if (!Array.isArray(values) || values.length !== headers.length) {
      throw fcError_('FC_SHAPE_ERROR',
        'Append row for ' + t.sheetName + ' has ' + (values ? values.length : 'no') +
        ' values for ' + headers.length + ' columns');
    }
    p.appends.push({ values: values, formulas: typeof formulas === 'function' ? formulas : null });
  }

  function addDelete(name, key, optsDel) {
    var p = plan(name);
    var t = needTable(name);
    var k = String(key == null ? '' : key).trim();
    if (!k) return;
    /* A deletion is only planned for a row this context has actually seen, so
     * a stale client UID can never delete a row the plan did not inspect.
     * allowMissing exists only for a caller whose recovery envelope has
     * already authenticated an absent row (it was deleted by an interrupted
     * earlier attempt); it is never set on the ordinary path. */
    rowFor(name, k, !!(optsDel && optsDel.allowMissing));
    if (p.deletes.indexOf(k) === -1) p.deletes.push(k);
  }

  function preflight(limits) {
    var L = limits || {};
    var maxWritePerSection = Number(L.writeCallsPerSection) || FC_BUDGET_WRITE_CALLS_PER_SECTION_;
    var maxWriteTotal = Number(L.writeCallsTotal) || FC_BUDGET_WRITE_CALLS_TOTAL_;
    var maxCells = Number(L.patchCellsTotal) || FC_BUDGET_PATCH_CELLS_TOTAL_;
    var maxAppendRows = Number(L.appendRowsTotal) || FC_BUDGET_APPEND_ROWS_TOTAL_;

    var totals = { keyReads: 0, writeCalls: 0, patchRows: 0, patchCells: 0, appendRows: 0, deleteRows: 0, sections: 0 };
    var report = [];

    Object.keys(plans).forEach(function (name) {
      var p = plans[name];
      var t = tables[name];
      var headers = getHeaders_(sheetFor(t));
      p.patchCells = 0;

      /* Shape: every append row already matches header width (addAppend threw
       * otherwise), and every patch/delete key resolved to a loaded row. */
      /* Formula fields: a caller must never patch a formula-owned cell as a
       * plain value; the engine probes live formulas too, but a declaration
       * mismatch is a planning bug and is refused here. */
      Object.keys(p.patchesByRow).forEach(function (rowNum) {
        var fields = Object.keys(p.patchesByRow[rowNum]);
        fields.forEach(function (f) {
          var isFormulaField = t.formulaFields.some(function (ff) { return ff.toLowerCase() === String(f).toLowerCase(); });
          if (isFormulaField && !(p.overwriteColumns || []).some(function (c) { return String(c).toLowerCase() === String(f).toLowerCase(); })) {
            throw fcError_('FC_FORMULA_FIELD', 'Refusing to patch formula-owned field "' + f + '" in ' + t.sheetName, { sheetName: t.sheetName, field: f });
          }
        });
        p.patchCells += fields.length;
      });
      /* Row coordinates: a planned patch must point at a row the engine will
       * accept. The engine refuses out-of-range rows at write time; refusing
       * here keeps that refusal before the first business write. */
      var lastRow = sheetFor(t).getLastRow();
      Object.keys(p.patchesByRow).forEach(function (rowNum) {
        var n = Number(rowNum);
        if (!isFinite(n) || n < 2 || n > lastRow) {
          throw fcError_('FC_ROW_OUT_OF_RANGE', 'Planned patch row ' + rowNum + ' is outside ' + t.sheetName, { sheetName: t.sheetName, row: n, lastRow: lastRow });
        }
      });

      var patchRanges = 0;
      Object.keys(p.patchesByRow).forEach(function (rowNum) {
        var idxs = Object.keys(p.patchesByRow[rowNum]).map(function (f) { return fsHeaderIndex_(headers, f); })
          .filter(function (i) { return i !== -1; }).sort(function (a, b) { return a - b; });
        if (!idxs.length) return;
        patchRanges++;
        for (var i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i - 1] + 1) patchRanges++;
      });
      /* Delete runs are computed from the loaded row numbers, not the keys. */
      var deleteRuns = 0;
      var delRows = p.deletes.map(function (k) { return t.byKey[mapKey_(t, k)] ? t.byKey[mapKey_(t, k)].__row : 0; }).filter(Boolean).sort(function (a, b) { return a - b; });
      for (var r = 0; r < delRows.length; r++) {
        if (r === 0 || delRows[r] !== delRows[r - 1] + 1) deleteRuns++;
      }
      var writeCalls = Math.ceil(patchRanges / FC_MAX_RANGES_PER_BATCH_) +
        Math.ceil(deleteRuns / FC_MAX_RANGES_PER_BATCH_) +
        (p.appends.length ? 1 : 0);

      if (writeCalls > maxWritePerSection) {
        throw fcError_('FC_BUDGET_ERROR', 'Section "' + t.sheetName + '" would use ' + writeCalls + ' write calls (allowed ' + maxWritePerSection + ')',
          { sheetName: t.sheetName, writeCalls: writeCalls, allowed: maxWritePerSection });
      }
      totals.writeCalls += writeCalls;
      totals.patchRows += Object.keys(p.patchesByRow).length;
      totals.patchCells += p.patchCells;
      totals.appendRows += p.appends.length;
      totals.deleteRows += p.deletes.length;
      totals.sections++;
      report.push({ sheetName: t.sheetName, writeCalls: writeCalls, patchRows: Object.keys(p.patchesByRow).length, appends: p.appends.length, deletes: p.deletes.length });
    });

    if (totals.writeCalls > maxWriteTotal) {
      throw fcError_('FC_BUDGET_ERROR', 'Document would use ' + totals.writeCalls + ' write calls (allowed ' + maxWriteTotal + ')',
        { totals: totals, allowed: maxWriteTotal });
    }
    if (totals.patchCells > maxCells) {
      throw fcError_('FC_BUDGET_ERROR', 'Document would patch ' + totals.patchCells + ' cells (allowed ' + maxCells + ')',
        { totals: totals, allowed: maxCells });
    }
    if (totals.appendRows > maxAppendRows) {
      throw fcError_('FC_BUDGET_ERROR', 'Document would append ' + totals.appendRows + ' rows (allowed ' + maxAppendRows + ')',
        { totals: totals, allowed: maxAppendRows });
    }
    return { ok: true, totals: totals, sections: report, reads: readCount };
  }

  function commitSection(name) {
    fcAssertOn_();
    fcAssertEngine_();
    var p = plan(name);
    var t = needTable(name);
    var sheet = sheetFor(t);
    /* 1. patches: row numbers came from the context's own read and are still
     *    valid because no delete has run yet. */
    if (Object.keys(p.patchesByRow).length) {
      var patched = fsPatchRowsByNumber_(scopeId, sheet, p.patchesByRow, {
        preserveFormulas: p.preserveFormulas !== false,
        overwriteColumns: p.overwriteColumns || undefined,
        skipFormulaProbe: p.skipFormulaProbe === true
      });
      p.writeCalls += patched.writeCalls;
      p.cells += patched.cellCount;
    }
    /* 2. deletes: before the appends, so an appended row's own formula row
     *    number is computed after every row shift. */
    if (p.deletes.length) {
      var delRows = p.deletes.map(function (k) { return t.byKey[mapKey_(t, k)] ? t.byKey[mapKey_(t, k)].__row : 0; }).filter(Boolean);
      var deleted = fsDeleteRows_(scopeId, sheet, delRows, {});
      p.writeCalls += deleted.writeCalls;
    }
    /* 3. appends: one contiguous block; formulas are installed into the same
     *    block write with the row number the block actually landed on. */
    if (p.appends.length) {
      var startRow = sheet.getLastRow() + 1;
      ensureGridRows_(sheet, startRow + p.appends.length - 1);
      var rows = p.appends.map(function (a, i) {
        var vals = a.values.slice();
        if (a.formulas) {
          var map = a.formulas(startRow + i, getHeaders_(sheet)) || {};
          Object.keys(map).forEach(function (field) {
            var idx = fsHeaderIndex_(getHeaders_(sheet), field);
            if (idx !== -1) vals[idx] = map[field];
          });
        }
        return vals;
      });
      var appended = fsAppendRowsBlock_(sheet, rows, {});
      p.startRow = appended.startRow || startRow;
      p.writeCalls += appended.writeCalls;
      p.cells += appended.cellCount;
    }
    return manifest();
  }

  function commit() {
    Object.keys(plans).forEach(function (name) { commitSection(name); });
    return manifest();
  }

  function manifest() {
    var out = { label: String(o.label || ''), reads: readCount, sections: [], totals: { writeCalls: 0, patchRows: 0, cells: 0, appends: 0, deletes: 0 } };
    Object.keys(plans).forEach(function (name) {
      var p = plans[name];
      var entry = {
        name: name,
        sheetName: tables[name].sheetName,
        writeCalls: p.writeCalls,
        patchRows: Object.keys(p.patchesByRow).length,
        appends: p.appends.length,
        deletes: p.deletes.length,
        cells: p.cells,
        startRow: p.startRow
      };
      out.totals.writeCalls += entry.writeCalls;
      out.totals.patchRows += entry.patchRows;
      out.totals.cells += entry.cells;
      out.totals.appends += entry.appends;
      out.totals.deletes += entry.deletes;
      out.sections.push(entry);
    });
    return out;
  }

  return {
    scopeId: scopeId,
    label: String(o.label || ''),
    table: register,
    tables: tables,
    readByKey: readByKey,
    readAll: readAll,
    scopeChildren: scopeChildren,
    markEmpty: markEmpty,
    readChildren: readChildren,
    locateKeys: locateKeys,
    relocateKeys: relocateKeys,
    reserveIds: reserveIds,
    keyFor: keyFor,
    getByKey: getByKey,
    getManyByKeys: getManyByKeys,
    getChildren: getChildren,
    buildChildIndex: buildChildIndex,
    getRowLocation: getRowLocation,
    epochOf: epochOf,
    invalidateTable: invalidateTable,
    invalidateDerivedDependencies: invalidateDerivedDependencies,
    plan: plan,
    addPatch: addPatch,
    addAppend: addAppend,
    addDelete: addDelete,
    rowFor: rowFor,
    preflight: preflight,
    commit: commit,
    commitSection: commitSection,
    manifest: manifest,
    reads: function () { return readCount; }
  };
}

/* ── 4. permission-filtered response projection ────────────────────────────
 * The reconciliation section is versioned and bounded. `fields` is what the
 * caller decided this audience may see — this function never decides
 * permissions itself, and never reads a sheet.
 *
 * opts = {
 *   version     default FC_RESPONSE_VERSION_
 *   requestId   string
 *   documentId  string            authoritative parent identity
 *   created     boolean           true when the commit created the document
 *   mapped      { section: { localKey: persistentKey } }
 *   removed     { section: [persistentKey] }
 *   corrected   { header: {...}, section: [...] }  saved values that differ
 *                               from what was submitted
 *   nextToken   string            derived from committed authoritative state
 *   invalidations [string]
 *   computed    { field: value }  permission-filtered, freshness established
 *   manifest    { ... }           counters only
 * }
 */
function fcResponse_(opts) {
  var o = opts || {};
  var out = { v: FC_RESPONSE_VERSION_ };
  if (o.requestId) out.request_id = String(o.requestId);
  if (o.documentId) out.document_id = String(o.documentId);
  out.created = o.created === true;
  out.mapped = o.mapped || {};
  out.removed = o.removed || {};
  if (o.corrected) out.corrected = o.corrected;
  if (o.nextToken) out.next_token = String(o.nextToken);
  if (o.invalidations && o.invalidations.length) out.invalidations = o.invalidations.slice();
  if (o.computed) out.computed = o.computed;
  if (o.manifest) out.manifest = o.manifest;
  return out;
}
