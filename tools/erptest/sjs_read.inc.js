  // =========================================
  // P9 — JSON read layer (packs). Active only when ET_SJS_READ is true.
  // Pack: {"t":tab,"seq":int,"schemaHash":sha1(physical header row),"builtAt":ms,
  //        "cols":[logical…],"rows":[[…],…]} — live rows only; dates "yyyy-mm-dd"
  // at midnight, else ISO. Numbers stay numbers (so records read back exactly as
  // getAllRecords_ returns them, which the parity DONE-CHECK requires).
  // Resolution: request memo -> chunked cache (same head) -> snapshot + journal
  // (only while ET_SJS_WRITE, when the journal is authoritative) -> source build.
  // =========================================
  const ET_PACKS_SHEET = 'erp_test__packs';
  const ET_JOURNAL_SHEET = 'erp_test__journal';
  const ET_META_SHEET = 'erp_test__meta';
  const ET_PACK_PART_CHARS = 45000;
  const ET_PACK_MAX_PARTS = 60;
  const ET_PACK_TTL = 21600;
  var _etPackMemo = {};
  var ET_EPOCH_UTC_ = Date.UTC(1899, 11, 30);

  function etSetFlag_(name, value) {
    if (name === 'ET_SJS_READ') ET_SJS_READ = !!value;
    else if (name === 'ET_SJS_WRITE') ET_SJS_WRITE = !!value;
    else if (name === 'ET_CLIENT_PACKS') ET_CLIENT_PACKS = !!value;
    _etPackMemo = {};
    return { ET_SJS_READ: ET_SJS_READ, ET_SJS_WRITE: ET_SJS_WRITE, ET_CLIENT_PACKS: ET_CLIENT_PACKS };
  }

  function etIsDateCol_(logical) {
    var n = String(logical == null ? '' : logical).trim().toLowerCase();
    // Plan 9.3 list plus *_time (approval_time), which also holds dates.
    return /date$/.test(n) || /_at$/.test(n) || /_time$/.test(n) || n === 'تاريخ الفاتورة' || n === 'reciept date';
  }
  function etSerialToDate_(serial) {
    var utc = new Date(ET_EPOCH_UTC_ + Number(serial) * 86400000);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(),
      utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(), utc.getUTCMilliseconds());
  }
  function etEncodeDate_(d) {
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0) {
      var m = d.getMonth() + 1, day = d.getDate();
      return 'd:' + d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    }
    return 't:' + d.toISOString();
  }
  function etDecodeDate_(s) {
    if (typeof s !== 'string') return s;
    if (s.indexOf('d:') === 0) { var p = s.slice(2).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
    if (s.indexOf('t:') === 0) return new Date(s.slice(2));
    return s;
  }
  function etSha1_(text) {
    try {
      var alg = (Utilities.DigestAlgorithm && Utilities.DigestAlgorithm.SHA_1) || 'SHA_1';
      return Utilities.computeDigest(alg, String(text)).map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
    } catch (e) { return String(text).length + ':' + String(text).slice(0, 32); }
  }
  function etQuote_(name) { return "'" + String(name).replace(/'/g, "''") + "'"; }
  function etColLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s || 'A'; }

  function etHead_(dbId) {
    try {
      var cache = CacheService.getScriptCache();
      var v = cache.get('ethead_' + dbId);
      if (!v) { v = String(new Date().getTime()); cache.put('ethead_' + dbId, v, ET_PACK_TTL); }
      return v;
    } catch (e) { return '0'; }
  }
  function etBumpHead_(dbId, tables) {
    try {
      var cache = CacheService.getScriptCache();
      var cur = Number(cache.get('ethead_' + dbId)) || 0;
      cache.put('ethead_' + dbId, String(Math.max(cur + 1, new Date().getTime())), ET_PACK_TTL);
    } catch (e) {}
    (tables || []).forEach(function (t) {
      delete _etPackMemo[dbId + '|' + t];
      try { removeChunkedCache_('etpack_' + dbId + '_' + t); } catch (e2) {}
    });
  }

  function etBatchGet_(dbId, ranges, opts) {
    return Sheets.Spreadsheets.Values.batchGet(dbId, Object.assign({ ranges: ranges }, opts || {}));
  }

  // Build packs for several tables with one values.batchGet.
  function etPackBuild_(dbId, tables) {
    var metas = tables.map(function (t) {
      var sh = getSheet_(t, dbId);
      return { t: t, lastRow: Math.max(1, sh.getLastRow()), lastCol: Math.max(1, sh.getLastColumn()) };
    });
    var ranges = metas.map(function (m) { return etQuote_(m.t) + '!A1:' + etColLetter_(m.lastCol) + m.lastRow; });
    // pack.seq is the journal position the pack includes (0 before any journal).
    var withJournal = false;
    if (ET_SJS_WRITE) { try { getSheet_(ET_JOURNAL_SHEET, dbId); withJournal = true; } catch (eJ) { withJournal = false; } }
    if (withJournal) ranges.push(etQuote_(ET_JOURNAL_SHEET) + '!A:D');
    var res = etBatchGet_(dbId, ranges, { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
    var vrs = (res && res.valueRanges) || [];
    // head: journal position the pack includes; cseq[t]: last journal op on table t.
    var head = 0, cseq = {};
    if (withJournal) ((vrs[metas.length] && vrs[metas.length].values) || []).forEach(function (r) {
      var q = Number(r[0]);
      if (!isFinite(q)) return;
      if (q > head) head = q;
      var t = String(r[3] == null ? '' : r[3]);
      if (t && q > (cseq[t] || 0)) cseq[t] = q;
    });
    var out = {};
    metas.forEach(function (m, i) {
      var values = (vrs[i] && vrs[i].values) || [];
      var physical = [];
      for (var c = 0; c < m.lastCol; c++) physical.push(values[0] && values[0][c] !== undefined ? values[0][c] : '');
      var keys = physical.map(function (h) { return etToLogical_(m.t, String(h).trim()); });
      var lastColForKey = {}, cols = [];
      keys.forEach(function (k, c) { if (lastColForKey[k] === undefined) cols.push(k); lastColForKey[k] = c; });
      var dateCol = cols.map(etIsDateCol_);
      var delCol = cols.indexOf('deleted_at');
      var rows = [];
      for (var r = 1; r < values.length; r++) {
        var raw = values[r] || [];
        var hasValue = false;
        for (var t = 0; t < cols.length; t++) {
          var v0 = raw[lastColForKey[cols[t]]];
          if (v0 === undefined || v0 === '' || v0 === null) continue;
          if (typeof v0 === 'string' && v0.trim() === '') continue;
          hasValue = true; break;
        }
        if (!hasValue) continue;
        var row = cols.map(function (k, j) {
          var v = raw[lastColForKey[k]];
          if (v === undefined || v === null) v = '';
          if (dateCol[j] && typeof v === 'number' && isFinite(v)) return etEncodeDate_(etSerialToDate_(v));
          if (typeof v === 'string' && /^[dts]:/.test(v)) return 's:' + v; // escape literal text that looks encoded
          return v;
        });
        if (delCol !== -1 && String(row[delCol] == null ? '' : row[delCol]).trim() !== '') continue;
        rows.push(row);
      }
      out[m.t] = { t: m.t, seq: head, cseq: cseq[m.t] || 0, schemaHash: etSha1_(physical.join('\u0001')), builtAt: new Date().getTime(), cols: cols, rows: rows };
    });
    return out;
  }

  // System tabs (packs/journal/meta) carry physical names; they are read straight
  // from the sheet, outside the header-translation layer.
  function etSysRows_(sheet) {
    var lr = sheet.getLastRow(), lc = sheet.getLastColumn();
    if (!lr || !lc) return [];
    return sheet.getRange(1, 1, lr, lc).getValues().map(function (r, i) { return i === 0 ? r.map(function (h) { return String(h).trim(); }) : r; });
  }
  function etSysRecords_(sheet) {
    var v = etSysRows_(sheet);
    if (v.length < 2) return [];
    return v.slice(1).map(function (r) { var o = {}; v[0].forEach(function (h, j) { o[h] = r[j]; }); return o; });
  }

  function etPackSaveSnapshot_(dbId, pack) {
    var json = JSON.stringify(pack);
    var parts = [];
    for (var i = 0; i < json.length; i += ET_PACK_PART_CHARS) parts.push(json.slice(i, i + ET_PACK_PART_CHARS));
    if (parts.length > ET_PACK_MAX_PARTS) throw new Error('pack too large for snapshot: ' + pack.t);
    var sheet = getSheet_(ET_PACKS_SHEET, dbId);
    var headers = etSysRows_(sheet)[0] || [];
    var row = headers.map(function () { return ''; });
    var values = { pack_id: pack.t, seq: pack.seq, built_at: new Date(pack.builtAt), row_count: pack.rows.length,
      bytes: json.length, hash: etSha1_(json), schema_hash: pack.schemaHash, parts: parts.length };
    parts.forEach(function (p, k) { values['part_' + (k + 1)] = p; });
    headers.forEach(function (h, j) { if (values[h] !== undefined) row[j] = values[h]; });
    var lastRow = sheet.getLastRow();
    var ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
    var at = ids.indexOf(pack.t);
    var rowNumber = at === -1 ? lastRow + 1 : at + 2;
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  }

  function etPackLoadSnapshot_(dbId, table) {
    var sheet;
    try { sheet = getSheet_(ET_PACKS_SHEET, dbId); } catch (e) { return null; }
    var rows = etSysRecords_(sheet);
    var rec = rows.find(function (r) { return String(r.pack_id) === String(table); });
    if (!rec) return null;
    var json = '';
    for (var k = 1; k <= Number(rec.parts || 0); k++) json += String(rec['part_' + k] == null ? '' : rec['part_' + k]);
    try { return JSON.parse(json); } catch (e2) { return null; }
  }

  // Journal ops of one table after `seq`, and the journal head (max seq of ANY table):
  // a replayed pack is current up to the head, not just up to its own last op.
  function etJournalSince_(dbId, table, seq) {
    var rows;
    try { rows = etSysRecords_(getSheet_(ET_JOURNAL_SHEET, dbId)); } catch (e) { return { ops: [], head: Number(seq) || 0 }; }
    var head = Number(seq) || 0;
    rows.forEach(function (r) { var q = Number(r.seq); if (isFinite(q) && q > head) head = q; });
    return {
      head: head,
      ops: rows.filter(function (r) { return String(r.table) === String(table) && Number(r.seq) > Number(seq); })
        .sort(function (a, b) { return Number(a.seq) - Number(b.seq); })
    };
  }

  // Apply journal ops ({op, key, data_json}) to a pack in place.
  function etPackApply_(pack, ops) {
    var keyName = tlSchema_(pack.t).key;
    var kIdx = pack.cols.indexOf(keyName);
    ops.forEach(function (j) {
      var rec = {};
      try { rec = JSON.parse(j.data_json || '{}'); } catch (e) { rec = {}; }
      var key = String(j.key == null ? '' : j.key);
      var at = -1;
      if (kIdx !== -1) for (var i = 0; i < pack.rows.length; i++) if (String(pack.rows[i][kIdx]) === key) { at = i; break; }
      if (j.op === 'softDelete') { if (at !== -1) pack.rows.splice(at, 1); return; }
      Object.keys(rec).forEach(function (c) { if (pack.cols.indexOf(c) === -1) { pack.cols.push(c); pack.rows.forEach(function (r) { r.push(''); }); } });
      var row = at === -1 ? pack.cols.map(function () { return ''; }) : pack.rows[at];
      Object.keys(rec).forEach(function (c) { row[pack.cols.indexOf(c)] = rec[c]; });
      if (at === -1) pack.rows.push(row);
      pack.seq = Math.max(Number(pack.seq) || 0, Number(j.seq) || 0);
      pack.cseq = Math.max(Number(pack.cseq) || 0, Number(j.seq) || 0);
    });
    return pack;
  }

  function etPackGet_(dbId, table) {
    var memoKey = dbId + '|' + table;
    if (_etPackMemo[memoKey]) return _etPackMemo[memoKey];
    var head = etHead_(dbId);
    var cacheKey = 'etpack_' + dbId + '_' + table;
    var cached = null;
    try { cached = getChunkedCache_(cacheKey); } catch (e) { cached = null; }
    if (cached && cached.head === head && cached.pack) { _etPackMemo[memoKey] = cached.pack; return cached.pack; }
    var pack = null;
    if (ET_SJS_WRITE) {
      var snap = etPackLoadSnapshot_(dbId, table);
      if (snap) {
        var since = etJournalSince_(dbId, table, snap.seq);
        pack = etPackApply_(snap, since.ops);
        pack.seq = since.head;
      }
    }
    if (!pack) {
      pack = etPackBuild_(dbId, [table])[table];
      if (ET_SJS_WRITE) { try { etPackSaveSnapshot_(dbId, pack); } catch (eSave) {} }
    }
    try { putChunkedCache_(cacheKey, { head: head, pack: pack }, ET_PACK_TTL); } catch (e3) {}
    _etPackMemo[memoKey] = pack;
    return pack;
  }

  // Records keyed by logical names, rebuilt fresh on every call (callers mutate).
  function etRows_(dbId, table) {
    var pack = etPackGet_(dbId, table);
    return pack.rows.map(function (row) {
      var o = {};
      pack.cols.forEach(function (c, j) {
        var v = row[j];
        if (typeof v === 'string' && v.length > 1 && v.charAt(1) === ':') {
          if (v.indexOf('s:') === 0) v = v.slice(2); else v = etDecodeDate_(v);
        }
        o[c] = v;
      });
      return o;
    });
  }

  // P9.6 — aggregates cached per head (JSON-safe results only).
  function etAgg_(dbId, name, args, build) {
    if (!ET_SJS_READ) return build();
    var key = 'etagg_' + name + '_' + dbId + '_' + etHead_(dbId) + (args ? '_' + etSha1_(JSON.stringify(args)).slice(0, 12) : '');
    var hit = null;
    try { hit = getChunkedCache_(key); } catch (e) { hit = null; }
    if (hit && hit.v !== undefined) return hit.v;
    var v = build();
    try { putChunkedCache_(key, { v: v }, ET_PACK_TTL); } catch (e2) {}
    return v;
  }
  var _etIsMemo = {};
