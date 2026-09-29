  // =========================================
  // P10 — JSON write layer. Active only when ET_SJS_WRITE is true.
  // Every write action runs inside one transaction: the handler's sheet writes
  // land in an in-memory overlay (reads in the same request see them), then ONE
  // Sheets.Spreadsheets.batchUpdate commits the changed cells of every touched
  // tab plus the journal rows. The request is all-or-nothing: an exception in the
  // handler, or a rejected batchUpdate, leaves every sheet untouched.
  // Ids stay max(id)+1 of the target table (Code.js high-water covers the rows
  // still pending in the overlay).
  // =========================================
  var _etTx = null;
  const ET_WRITE_VERBS = /^(add|edit|delete|approve|complete|cancel)_/;

  function etSheet_(name, dbId) {
    if (_etTx && _etTx.dbId === dbId) return etTxSheet_(name);
    return getSheet_(name, dbId);
  }

  function etBlank_(v) { return v === '' || v === null || v === undefined; }
  function etSame_(a, b) {
    if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    if (etBlank_(a) && etBlank_(b)) return true;
    return a === b;
  }
  function etCopyVal_(v) { return v instanceof Date ? new Date(v.getTime()) : v; }

  function etTxSheet_(name) {
    var tx = _etTx;
    if (tx.sheets[name]) return tx.sheets[name];
    var base = getSheet_(name, tx.dbId);
    var lr = base.getLastRow(), lc = base.getLastColumn();
    var rows = (lr && lc) ? base.getRange(1, 1, lr, lc).getValues() : [];
    var st = {
      name: name, base: base, rows: rows.map(function (r) { return r.slice(); }), orig: rows,
      baseRows: rows.length, baseMaxRows: base.getMaxRows(), baseMaxCols: base.getMaxColumns(), dirty: {}
    };
    function cell(r, c) { var row = st.rows[r]; return row && row[c] !== undefined ? row[c] : ''; }
    function put(r, c, v) {
      while (st.rows.length <= r) st.rows.push([]);
      var row = st.rows[r];
      while (row.length <= c) row.push('');
      row[c] = etCopyVal_(v);
      var was = st.orig[r] ? (st.orig[r][c] !== undefined ? st.orig[r][c] : '') : '';
      var isNew = r >= st.baseRows;
      if (!isNew && etSame_(was, row[c])) { if (st.dirty[r]) delete st.dirty[r][c]; return; }
      (st.dirty[r] = st.dirty[r] || {})[c] = true;
    }
    var proxy = {
      getName: function () { return name; },
      getSheetId: function () { return base.getSheetId(); },
      getParent: function () { return base.getParent(); },
      getLastRow: function () {
        for (var i = st.rows.length - 1; i >= 0; i--) if (st.rows[i].some(function (v) { return !etBlank_(v); })) return i + 1;
        return 0;
      },
      getLastColumn: function () {
        var m = 0;
        st.rows.forEach(function (r) { for (var j = r.length - 1; j >= m; j--) if (!etBlank_(r[j])) { m = j + 1; break; } });
        return m;
      },
      getMaxRows: function () { return Math.max(st.baseMaxRows, st.rows.length); },
      getMaxColumns: function () { return Math.max(st.baseMaxCols, proxy.getLastColumn()); },
      insertRowsAfter: function () { return proxy; },
      getRange: function (r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        var range = {
          getRow: function () { return r; }, getColumn: function () { return c; },
          getNumRows: function () { return nr; }, getNumColumns: function () { return nc; },
          getSheet: function () { return proxy; },
          getValues: function () {
            var out = [];
            for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push(etCopyVal_(cell(r - 1 + i, c - 1 + j))); out.push(row); }
            return out;
          },
          getValue: function () { return etCopyVal_(cell(r - 1, c - 1)); },
          setValues: function (vals) {
            for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) put(r - 1 + i, c - 1 + j, vals[i][j]);
            return range;
          },
          setValue: function (v) { put(r - 1, c - 1, v); return range; },
          setNumberFormat: function () { return range; }
        };
        return range;
      },
      getDataRange: function () { return proxy.getRange(1, 1, Math.max(1, proxy.getLastRow()), Math.max(1, proxy.getLastColumn())); },
      __tx: st
    };
    tx.sheets[name] = proxy;
    return proxy;
  }

  // Records of a sheet touched by the running transaction (overlay included).
  function etTxRecords_(sheetName) {
    var proxy = _etTx.sheets[sheetName];
    var data = proxy.__tx.rows;
    var headers = (data[0] || []).map(function (h) { return etToLogical_(sheetName, String(h).trim()); });
    return buildRecordsFromRaw_(data.map(function (r) { return r.map(etCopyVal_); }), headers);
  }
  function etTxTouched_(dbId, table) { return !!(_etTx && _etTx.dbId === dbId && _etTx.sheets[table]); }

  function etStoredValue_(v) {
    var localMs = Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds(), v.getMilliseconds());
    return (localMs - ET_EPOCH_UTC_) / 86400000;
  }
  function etCellData_(v) {
    if (etBlank_(v)) return {};
    if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
    if (typeof v === 'boolean') return { userEnteredValue: { boolValue: v } };
    if (v instanceof Date) return { userEnteredValue: { numberValue: etStoredValue_(v) } };
    return { userEnteredValue: { stringValue: String(v) } };
  }
  function etDateFormat_(v) {
    var midnight = v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0 && v.getMilliseconds() === 0;
    return midnight ? { type: 'DATE', pattern: 'yyyy-mm-dd' } : { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm:ss' };
  }

  function etFormulaColsOf_(table) {
    return (typeof ET_FORMULA_COLS !== 'undefined' && ET_FORMULA_COLS[table]) || [];
  }

  // Changed/inserted data rows of one touched sheet -> journal entries (logical records).
  function etTxJournalOps_(st) {
    var physical = (st.rows[0] || []).map(function (h) { return String(h).trim(); });
    var logical = physical.map(function (h) { return etToLogical_(st.name, h); });
    var keyIdx = logical.indexOf(tlSchema_(st.name).key);
    var delIdx = logical.indexOf('deleted_at');
    var ops = [];
    Object.keys(st.dirty).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      if (r === 0) return;
      var cols = Object.keys(st.dirty[r]).map(Number);
      if (!cols.length) return;
      var row = st.rows[r] || [];
      var isInsert = r >= st.baseRows;
      var data = {};
      (isInsert ? logical.map(function (_, j) { return j; }) : cols).forEach(function (j) {
        if (!logical[j]) return;
        var v = row[j] === undefined ? '' : row[j];
        data[logical[j]] = v instanceof Date ? etEncodeDate_(v) : v;
      });
      var op = isInsert ? 'insert' : ((delIdx !== -1 && cols.indexOf(delIdx) !== -1 && !etBlank_(row[delIdx])) ? 'softDelete' : 'patch');
      ops.push({ table: st.name, op: op, key: keyIdx !== -1 ? String(row[keyIdx] == null ? '' : row[keyIdx]) : '', data: data });
    });
    return ops;
  }

  // One touched sheet -> batchUpdate requests (grid growth, changed values, date formats).
  function etTxRequests_(st, forbidden) {
    var sheetId = st.base.getSheetId();
    var req = [];
    var needRows = st.rows.length;
    var needCols = 0;
    st.rows.forEach(function (r) { needCols = Math.max(needCols, r.length); });
    if (needRows > st.baseMaxRows) req.push({ appendDimension: { sheetId: sheetId, dimension: 'ROWS', length: needRows - st.baseMaxRows } });
    if (needCols > st.baseMaxCols) req.push({ appendDimension: { sheetId: sheetId, dimension: 'COLUMNS', length: needCols - st.baseMaxCols } });
    var formats = [];
    Object.keys(st.dirty).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      var cols = Object.keys(st.dirty[r]).map(Number).sort(function (a, b) { return a - b; });
      var i = 0;
      while (i < cols.length) {
        var start = cols[i], end = start;
        while (i + 1 < cols.length && cols[i + 1] === end + 1) { i++; end = cols[i]; }
        var cells = [];
        for (var c = start; c <= end; c++) {
          var v = st.rows[r][c];
          if (r > 0 && forbidden[c]) throw new Error('ET_SJS_WRITE refused: column "' + forbidden[c] + '" of ' + st.name + ' holds formulas');
          cells.push(etCellData_(v));
          if (v instanceof Date) formats.push({ updateCells: { start: { sheetId: sheetId, rowIndex: r, columnIndex: c }, rows: [{ values: [{ userEnteredFormat: { numberFormat: etDateFormat_(v) } }] }], fields: 'userEnteredFormat.numberFormat' } });
        }
        req.push({ updateCells: { start: { sheetId: sheetId, rowIndex: r, columnIndex: start }, rows: [{ values: cells }], fields: 'userEnteredValue' } });
        i++;
      }
    });
    return req.concat(formats);
  }

  function etTxCommit_(tx) {
    var names = Object.keys(tx.sheets).filter(function (n) { return n !== ET_JOURNAL_SHEET; });
    var journal = [];
    names.forEach(function (n) { journal = journal.concat(etTxJournalOps_(tx.sheets[n].__tx)); });
    journal = journal.concat(tx.extraJournal || []);
    if (journal.length) {
      var js = etTxSheet_(ET_JOURNAL_SHEET);
      var jrows = js.__tx.rows;
      var jh = (jrows[0] || []).map(function (h) { return String(h).trim(); });
      var seqIdx = jh.indexOf('seq');
      var maxSeq = 0;
      for (var i = 1; i < jrows.length; i++) { var q = Number(jrows[i][seqIdx]); if (isFinite(q) && q > maxSeq) maxSeq = q; }
      var now = new Date();
      var at = js.getLastRow() + 1;
      journal.forEach(function (j, k) {
        j.seq = maxSeq + 1 + k;
        var values = { seq: j.seq, ts: now, user: (tx.user && tx.user.email) || '', table: j.table, op: j.op, key: j.key, request_key: tx.requestKey || '', data_json: JSON.stringify(j.data) };
        js.getRange(at + k, 1, 1, jh.length).setValues([jh.map(function (h) { return values[h] !== undefined ? values[h] : ''; })]);
      });
    }
    var requests = [];
    Object.keys(tx.sheets).forEach(function (n) {
      var st = tx.sheets[n].__tx;
      var forbidden = {};
      var fc = etFormulaColsOf_(n);
      (st.rows[0] || []).forEach(function (h, c) { if (fc.indexOf(String(h).trim()) !== -1) forbidden[c] = String(h).trim(); });
      requests = requests.concat(etTxRequests_(st, forbidden));
    });
    if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, tx.dbId);
    etBumpHead_(tx.dbId, names);
    names.forEach(function (n) { try { noteTableChange_(tx.dbId, n); } catch (e) {} });
    return journal.map(function (j) { return { seq: j.seq, table: j.table, op: j.op, key: j.key, data: j.data }; });
  }

  function etTxCleanup_(tx) {
    Object.keys(tx.sheets).forEach(function (n) {
      try { tlRefreshHeaderCache_(tx.sheets[n].__tx.base); } catch (e) {}
    });
    try { if (typeof resetRecordCache_ === 'function') resetRecordCache_(); } catch (e2) {}
  }

  // approveStep_ (Code.js) writes the approval straight to the sheet, outside the
  // overlay; record it in the journal so deltas (P11) still carry it.
  function etApprovalJournal_(tx, d) {
    try {
      var pol = ErpTest.approvalPolicy_ || {};
      var docType = (pol.actionToDocType || {})[tx.action];
      var chain = (pol.chains || []).find(function (c) { return c.docType === docType || (pol.aliases || {})[c.docType] === docType; });
      if (!chain) return;
      var key = String((d && d.unique_id) || '');
      var sheet = getSheet_(chain.sheet, tx.dbId);
      var v = etSysRows_(sheet);
      var h = v[0] || [];
      var kIdx = h.indexOf(chain.keyColumn);
      for (var i = 1; i < v.length; i++) {
        if (String(v[i][kIdx]) !== key) continue;
        var data = {};
        ['approval_status', 'approval', 'approval_time', 'approved', 'user', 'version'].forEach(function (c) {
          var j = h.indexOf(c);
          if (j !== -1) data[etToLogical_(chain.sheet, c)] = v[i][j] instanceof Date ? etEncodeDate_(v[i][j]) : v[i][j];
        });
        tx.extraJournal.push({ table: chain.sheet, op: 'patch', key: key, data: data });
        return;
      }
    } catch (e) {}
  }

  function etInTx_(dbId, user, data, fn, action) {
    if (_etTx) return fn();
    return executeWithLock_(function () {
      var d = data || {};
      var tx = { dbId: dbId, user: user, action: action || '', sheets: {}, extraJournal: [], requestKey: String(d.request_key || (d.header && d.header.request_key) || '') };
      _etTx = tx;
      try {
        var res = fn();
        if (tx.action && /^approve_/.test(tx.action)) etApprovalJournal_(tx, d);
        var journal = etTxCommit_(tx);
        if (res && typeof res === 'object' && journal.length) res.journal = journal;
        return res;
      } finally {
        _etTx = null;
        etTxCleanup_(tx);
      }
    });
  }

  // T-ATOMIC hook: a valid insert plus a request aimed at a sheet that does not exist.
  function etAtomicProbe_(dbId, table, record) {
    return executeWithLock_(function () {
      var sheet = getSheet_(table, dbId);
      var headers = etHeaders_(sheet);
      var row = headers.map(function (h) { return record[String(h).trim()] !== undefined ? record[String(h).trim()] : ''; });
      Sheets.Spreadsheets.batchUpdate({ requests: [
        { updateCells: { start: { sheetId: sheet.getSheetId(), rowIndex: sheet.getLastRow(), columnIndex: 0 }, rows: [{ values: row.map(etCellData_) }], fields: 'userEnteredValue' } },
        { updateCells: { start: { sheetId: 987654321, rowIndex: 1, columnIndex: 0 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'x' } }] }], fields: 'userEnteredValue' } }
      ] }, dbId);
    });
  }

  // P10.3 — compaction: snapshot every journaled table, then drop journal rows
  // at or below the lowest snapshot seq.
  function etCompact_(dbId) {
    var jsheet;
    try { jsheet = getSheet_(ET_JOURNAL_SHEET, dbId); } catch (e) { return { status: 'skipped', reason: 'no journal tab' }; }
    var rows = etSysRecords_(jsheet);
    var tables = {};
    rows.forEach(function (r) { if (r.table) tables[String(r.table)] = true; });
    var names = Object.keys(tables);
    if (!names.length) return { status: 'success', compacted: 0 };
    var seqs = [];
    names.forEach(function (t) {
      delete _etPackMemo[dbId + '|' + t];
      var pack = etPackGet_(dbId, t);
      etPackSaveSnapshot_(dbId, pack);
      seqs.push(Number(pack.seq) || 0);
    });
    var floor = Math.min.apply(null, seqs);
    return executeWithLock_(function () {
      var v = etSysRows_(jsheet);
      var seqIdx = (v[0] || []).indexOf('seq');
      var last = 0;
      for (var i = 1; i < v.length; i++) { if (Number(v[i][seqIdx]) <= floor) last = i; else break; }
      if (last > 0) {
        Sheets.Spreadsheets.batchUpdate({ requests: [{ deleteDimension: { range: { sheetId: jsheet.getSheetId(), dimension: 'ROWS', startIndex: 1, endIndex: last + 1 } } }] }, dbId);
      }
      etMetaPut_(dbId, 'compact_floor', floor);
      return { status: 'success', compacted: last, floor: floor };
    });
  }

  function etMetaPut_(dbId, key, value) {
    var sheet;
    try { sheet = getSheet_(ET_META_SHEET, dbId); } catch (e) { return; }
    var v = etSysRows_(sheet);
    var at = -1;
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(key)) { at = i; break; }
    var rowNumber = at === -1 ? Math.max(v.length, 1) + 1 : at + 1;
    sheet.getRange(rowNumber, 1, 1, 2).setValues([[key, typeof value === 'string' ? value : JSON.stringify(value)]]);
  }
  function etMetaGet_(dbId, key) {
    var sheet;
    try { sheet = getSheet_(ET_META_SHEET, dbId); } catch (e) { return null; }
    var v = etSysRows_(sheet);
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(key)) return v[i][1];
    return null;
  }

  // P10.4 — a manual edit (onEdit: one tab; onChange: every tab) invalidates the
  // cached packs AND the snapshot rows, so no level can serve the pre-edit data.
  const ET_PACK_TABLES = [PRODUCTS_SHEET, CATEGORIES_SHEET, CUSTOMERS_SHEET, CHART_SHEET, BOX_SHEET, PURCHASING_SHEET,
    PURCHASING_LINES_SHEET, SALES_SHEET, SALES_LINES_SHEET, SALES_RETURNS_SHEET, OFFER_SHEET, OFFER_LINES_SHEET, CASH_SHEET,
    MFG_SHEET, MFG_LINES_SHEET];
  function etInvalidateOnEdit_(dbId, e) {
    var names = ET_PACK_TABLES;
    try { if (e && e.range) names = [e.range.getSheet().getName()]; } catch (err) { names = ET_PACK_TABLES; }
    names = names.filter(function (n) { return ET_PACK_TABLES.indexOf(n) !== -1; });
    if (!names.length) return { status: 'ignored' };
    etBumpHead_(dbId, names);
    try {
      var sheet = getSheet_(ET_PACKS_SHEET, dbId);
      var v = etSysRows_(sheet);
      for (var i = v.length - 1; i >= 1; i--) {
        if (names.indexOf(String(v[i][0])) !== -1) sheet.getRange(i + 1, 1, 1, v[0].length).setValues([v[0].map(function () { return ''; })]);
      }
    } catch (e2) {}
    return { status: 'success', invalidated: names };
  }

  // P10.5 — nightly reconcile: source build vs cached pack (row count + key set),
  // aggregates recomputed from source vs cached; result into erp_test__meta.
  function etReconcile_(dbId) {
    var tables = ET_PACK_TABLES.filter(function (t) { try { getSheet_(t, dbId); return true; } catch (e) { return false; } });
    var src = etPackBuild_(dbId, tables);
    var diffs = [];
    tables.forEach(function (t) {
      var cached = null;
      try { var c = getChunkedCache_('etpack_' + dbId + '_' + t); cached = c && c.pack; } catch (e) { cached = null; }
      if (!cached) return;
      var k = tlSchema_(t).key;
      var keysOf = function (p) { var i = p.cols.indexOf(k); return p.rows.map(function (r) { return String(r[i]); }).sort().join('\u0001'); };
      if (cached.rows.length !== src[t].rows.length || keysOf(cached) !== keysOf(src[t])) {
        diffs.push({ table: t, cached: cached.rows.length, source: src[t].rows.length });
        try { putChunkedCache_('etpack_' + dbId + '_' + t, { head: etHead_(dbId), pack: src[t] }, ET_PACK_TTL); } catch (e2) {}
        if (ET_SJS_WRITE) { try { etPackSaveSnapshot_(dbId, src[t]); } catch (e3) {} }
      }
    });
    var aggDiffs = [];
    [['currentQtyMap_', function () { return currentQtyMapBase_(dbId); }],
     ['latestSalesPriceMap_', function () { return latestSalesPriceMapBase_(dbId); }],
     ['customerBalanceMap_', function () { return customerBalanceMapBase_(dbId); }]].forEach(function (a) {
      var key = 'etagg_' + a[0] + '_' + dbId + '_' + etHead_(dbId);
      var hit = null;
      try { hit = getChunkedCache_(key); } catch (e) { hit = null; }
      if (!hit) return;
      var fresh = a[1]();
      if (JSON.stringify(hit.v) !== JSON.stringify(fresh)) {
        aggDiffs.push(a[0]);
        try { putChunkedCache_(key, { v: fresh }, ET_PACK_TTL); } catch (e4) {}
      }
    });
    var day = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
    var result = { date: day, tables: tables.length, diffs: diffs, aggDiffs: aggDiffs, ok: !diffs.length && !aggDiffs.length };
    etMetaPut_(dbId, 'reconcile_' + day, result);
    return result;
  }
