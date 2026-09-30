  // =========================================
  // P11 — browser local packs: server side (get_et_sync). Active only when
  // ET_CLIENT_PACKS is true AND the journal is authoritative (ET_SJS_WRITE), in
  // the order P12 turns them on; otherwise it answers client_packs:false.
  // Per table: {mode:'same'} | {mode:'delta', ops} | {mode:'full', pack}.
  // Tables the user may not read are omitted. Cash rows are never sent (only its seq).
  // =========================================
  function etClientPacksOn_() { return !!(ET_CLIENT_PACKS && ET_SJS_WRITE); }

  function etReadableTables_(user) {
    var all = ET_PACK_TABLES.slice();
    if (user && user.isSuperAdmin) return all;
    var ok = {};
    Object.keys(PAGE_TABLES).forEach(function (page) {
      var granted = false;
      try { granted = unifiedCheck_(user, COMPANY_UID, page, 'read'); } catch (e) { granted = false; }
      if (granted) PAGE_TABLES[page].forEach(function (t) { ok[t] = true; });
    });
    return all.filter(function (t) { return ok[t]; });
  }

  function getEtSync_(data, user, dbId) {
    if (!etClientPacksOn_()) return { status: 'success', client_packs: false, tables: {} };
    var want = Object.assign({}, (data && data.tables) || {});
    var page = String((data && data.page) || '');
    if (page && PAGE_TABLES[page]) PAGE_TABLES[page].forEach(function (t) { if (!(t in want)) want[t] = -1; });
    var readable = etReadableTables_(user);
    var floor = Number(etMetaGet_(dbId, 'compact_floor')) || 0;
    var journal = null;
    var out = {};
    Object.keys(want).forEach(function (t) {
      if (readable.indexOf(t) === -1) return;
      var pack = etPackGet_(dbId, t);
      // Per-table content seq: an unrelated table's write does not disturb this one.
      var head = Number(pack.cseq) || 0;
      var seq = Number(want[t]);
      if (seq === head) { out[t] = { mode: 'same', seq: head }; return; }
      // Cash is never stored in the browser: report that it changed, send no rows.
      if (t === CASH_SHEET) { out[t] = { mode: 'changed', seq: head }; return; }
      if (seq >= 0 && seq >= floor && seq < head && head > 0) {
        if (!journal) { try { journal = etSysRecords_(getSheet_(ET_JOURNAL_SHEET, dbId)); } catch (e) { journal = []; } }
        var ops = journal.filter(function (j) { return String(j.table) === t && Number(j.seq) > seq; })
          .sort(function (a, b) { return Number(a.seq) - Number(b.seq); });
        // A manual edit leaves a 'reset' marker: the client must take a full pack.
        if (!ops.some(function (j) { return j.op === 'reset'; })) {
          out[t] = { mode: 'delta', seq: head, ops: ops.map(function (j) { var d = {}; try { d = JSON.parse(j.data_json || '{}'); } catch (e) {} return { seq: Number(j.seq), op: j.op, key: String(j.key), data: d }; }) };
          return;
        }
      }
      out[t] = { mode: 'full', seq: head, pack: Object.assign({}, pack, { seq: head }) };
    });
    return { status: 'success', client_packs: true, tables: out };
  }

  // After a manual edit, deltas must not paper over the change: journal a 'reset'.
  function etJournalReset_(dbId, names) {
    if (!ET_SJS_WRITE) return;
    try {
      var sheet = getSheet_(ET_JOURNAL_SHEET, dbId);
      var v = etSysRows_(sheet);
      var h = v[0] || [];
      var seqIdx = h.indexOf('seq');
      var max = Number(etMetaGet_(dbId, 'compact_floor')) || 0;
      for (var i = 1; i < v.length; i++) { var q = Number(v[i][seqIdx]); if (isFinite(q) && q > max) max = q; }
      var rows = names.map(function (n, k) {
        var values = { seq: max + 1 + k, ts: new Date(), user: 'onEdit', table: n, op: 'reset', key: '', request_key: '', data_json: '{}' };
        return h.map(function (c) { return values[c] !== undefined ? values[c] : ''; });
      });
      if (rows.length) sheet.getRange(Math.max(v.length, 1) + 1, 1, rows.length, h.length).setValues(rows);
    } catch (e) {}
  }
