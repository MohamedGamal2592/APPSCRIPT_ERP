/* ============================================================================
 * Core_ViewEngine.js — generic response projection (server-side only).
 *
 * WHAT THIS IS FOR
 * A read endpoint's response is a contract, not an accident of which columns a
 * sheet happens to have. This file turns a declared contract into the response:
 * an ordered field whitelist, optional renames, and an optional "drop fields
 * that are empty" rule. Everything it removes is removed AFTER authorization on
 * every request, from raw data — never from a cached DTO, because the script
 * cache is shared across users and a projection is audience-independent only if
 * it is applied per request (plan §3.2 G8).
 *
 * DECOUPLING CONTRACT (do not break)
 * Business-agnostic by design. No table or module names, no user-facing strings
 * in any language and no Arabic text; the static gate is a case-insensitive
 * search for company and module tokens returning zero hits. Callers pass their
 * own contract spec — the ordered field list, built from their own headers.
 *
 * FLAGS
 * FAST_VIEW_CORE_ is the master switch and defaults to false. `viewProject_`
 * itself is pure and callable; the flag gates the module opt-in through
 * viewOnFor_(moduleFlag), so a module serves projected responses only when its
 * own switch and this one are both true. (Same reasoning as Core_FastRead: a
 * projection must be usable in a comparison before the flag that serves it is
 * ever turned on.)
 *
 * COST
 * Every call reports bytesIn and bytesOut. Nothing here is allowed to claim a
 * transmission reduction it did not measure: the numbers are what the caller
 * put in and what it gets out, and the module logs them.
 * ==========================================================================*/

var FAST_VIEW_CORE_ = false;

/* Per-module opt-in switches live with the modules themselves: they name
 * modules, and this file must not. */
function viewOnFor_(flag) {
  return flag === true && FAST_VIEW_CORE_ === true;
}

/* ── typed errors ────────────────────────────────────────────────────────── */
function vwError_(code, message, detail) {
  var e = new Error(message);
  e.code = code;
  if (detail !== undefined) e.detail = detail;
  return e;
}

function vwErrorCodes_() {
  return {
    BAD_SPEC: 'VW_BAD_SPEC',
    UNKNOWN_FIELD: 'VW_UNKNOWN_FIELD'
  };
}

/* ── byte accounting ─────────────────────────────────────────────────────── */
function vwUtf8ByteLength_(text) {
  try { return encodeURIComponent(String(text)).replace(/%[0-9A-F]{2}/g, 'x').length; }
  catch (e) { return String(text).length; }
}

function vwBytesOf_(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object') {
    try { return vwUtf8ByteLength_(JSON.stringify(value)); } catch (e) { return 0; }
  }
  return vwUtf8ByteLength_(String(value));
}

/* ── contract spec normalisation ───────────────────────────────────────────
 * spec = {
 *   fields:   [ 'a', 'b', ... ]        ordered whitelist (required)
 *   renames:  { 'old': 'new' }         optional; applied to the OUTPUT key
 *   dropEmpty:{ 'a': true } or true    optional; an empty value is omitted
 *                                      ('' | null | undefined; 0 and false are
 *                                      values, not emptiness)
 *   keep:     [ 'x' ]                  optional escape hatch, documented per
 *                                      call site; ignored if not in fields
 * }
 * `fields` may also be a map of output name -> input name. */
function vwNormalizeSpec_(spec) {
  var s = spec || {};
  var ordered = [];
  var source = {};
  if (Array.isArray(s.fields)) {
    s.fields.forEach(function (f) {
      var out = String(f);
      ordered.push(out);
      source[out] = out;
    });
  } else if (s.fields && typeof s.fields === 'object') {
    Object.keys(s.fields).forEach(function (out) {
      ordered.push(String(out));
      source[String(out)] = String(s.fields[out]);
    });
  }
  if (!ordered.length) throw vwError_('VW_BAD_SPEC', 'A projection needs a non-empty field list');
  var renames = s.renames || {};
  var dropEmpty = s.dropEmpty === true ? { __all: true } : (s.dropEmpty || {});
  return { ordered: ordered, source: source, renames: renames, dropEmpty: dropEmpty };
}

function vwIsEmpty_(v) {
  return v === '' || v === null || v === undefined;
}

/* ── projection ────────────────────────────────────────────────────────────
 * Rows in, rows out. The output key order is the contract's order, which is the
 * order the JSON payload will carry and therefore the order the client sees.
 * A row that is not an object (or is null) is passed through untouched: this
 * function never invents a shape for a value it does not understand. */
function viewProject_(rows, contractSpec, opts) {
  var spec = vwNormalizeSpec_(contractSpec);
  var o = opts || {};
  var stats = { rowsIn: 0, rowsOut: 0, fieldsKept: 0, fieldsDropped: 0, bytesIn: 0, bytesOut: 0, renamed: {} };
  if (rows === null || rows === undefined) {
    /* Nothing to project, and inventing an empty row here would change an
     * absence into a value. Return it as-is. */
    if (typeof o.onStats === 'function') o.onStats(stats);
    return o.withStats === true ? { value: rows, stats: stats } : rows;
  }
  var list = rows;
  var single = false;
  if (rows && !Array.isArray(rows) && typeof rows === 'object') { list = [rows]; single = true; }

  var out = [];
  (list || []).forEach(function (row) {
    stats.rowsIn++;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) { out.push(row); stats.rowsOut++; return; }
    stats.bytesIn += vwBytesOf_(row);
    var projected = {};
    spec.ordered.forEach(function (outName) {
      var inName = spec.source[outName];
      if (!Object.prototype.hasOwnProperty.call(row, inName)) { stats.fieldsDropped++; return; }
      var value = row[inName];
      var drop = spec.dropEmpty.__all === true || spec.dropEmpty[outName] === true;
      if (drop && vwIsEmpty_(value)) { stats.fieldsDropped++; return; }
      var finalName = spec.renames[outName] || outName;
      projected[finalName] = value;
      stats.fieldsKept++;
    });
    stats.bytesOut += vwBytesOf_(projected);
    out.push(projected);
    stats.rowsOut++;
  });

  var result = single ? (out.length ? out[0] : null) : out;
  stats.reductionPercent = stats.bytesIn > 0
    ? Math.round((1 - (stats.bytesOut / stats.bytesIn)) * 1000) / 10
    : 0;
  if (typeof o.onStats === 'function') o.onStats(stats);
  return o.withStats === true ? { value: result, stats: stats } : result;
}

/* Project a whole response: `top` is the response's own field list and
 * `sections` names the fields to project — an array of rows or a single nested
 * object. A field with no section is passed through untouched, and a missing
 * field is not invented (an error response is not a data response). */
function viewProjectResponse_(response, spec) {
  var s = spec || {};
  if (!response || typeof response !== 'object') return response;
  var sections = s.sections || {};
  var out = {};
  (s.top || Object.keys(response)).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(response, key)) return;
    var value = response[key];
    var section = sections[key];
    if (section) { out[key] = viewProject_(value, section); return; }
    out[key] = value;
  });
  return out;
}

/* ── option bundles (plan §6.3) ───────────────────────────────────────────
 * Rebuild-avoidance only. This does NOT reduce what is transmitted: every RPC
 * still serialises and sends its options, and the plan says so explicitly — the
 * transmission half needs a client store and is deferred. `builder` is a
 * function returning the bundle; the cache is the read engine's, so the bundle
 * is stamp-gated raw data and never a DTO. */
function viewOptions_(scopeId, kind, builder, ttlSeconds, opts) {
  var o = opts || {};
  if (typeof frCachedRead_ !== 'function') return builder();
  var ctx = o.ctx || (typeof frNewContext_ === 'function' ? frNewContext_() : null);
  var result = frCachedRead_({
    ctx: ctx,
    scopeId: scopeId,
    dbId: o.dbId || scopeId,
    kind: 'view_options_' + String(kind),
    docKey: String(o.docKey || kind),
    tables: o.tables || [],
    ttlSeconds: ttlSeconds || 600,
    cache: o.cache !== false,
    payloadVersion: (typeof FR_CACHE_PAYLOAD_VERSION_ !== 'undefined' ? FR_CACHE_PAYLOAD_VERSION_ : 1),
    build: builder
  });
  return result.value;
}

/* ── diagnostics surface (same rule as the read engine's) ──────────────────
 * Nothing enumerates a cache: the caller supplies one key. */
function viewProjectionStats_(stats) {
  if (!stats) return null;
  return {
    rowsIn: stats.rowsIn, rowsOut: stats.rowsOut,
    fieldsKept: stats.fieldsKept, fieldsDropped: stats.fieldsDropped,
    bytesIn: stats.bytesIn, bytesOut: stats.bytesOut,
    reductionPercent: stats.reductionPercent
  };
}
