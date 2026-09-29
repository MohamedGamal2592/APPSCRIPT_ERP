  // =========================================
  // Manufacturing (plan P5) — orders + material lines.
  // State machine: add -> [Pending, Open]; approve -> [Approved, Open];
  // complete -> [Approved, Completed] (terminal, stock moves);
  // cancel -> [*, Cancelled] (terminal, no stock move).
  // Stock/costs only count orders with production_status = Completed and
  // an empty deleted_at (see etStockMap_, getProductMovement_, incomeStatementCore_).
  // =========================================
  function mfgStr_(v) { return String(v == null ? '' : v).trim(); }

  function unitCostOf_(dbId, productId) {
    const wanted = mfgStr_(productId);
    const row = tlDbList_(dbId, CURRENT_PRODUCTS_SHEET).find(function (s) { return mfgStr_(s.unique_id) === wanted; });
    if (!row) return 0;
    const q = num0_(row.current_qty);
    const c = num0_(row.total_cost_sign);
    return q > 0 ? c / q : 0;
  }

  function mfgProductNames_(dbId) {
    const out = {};
    productRefs_(dbId).forEach(function (p) { out[String(p.id)] = p.name_ar; });
    return out;
  }

  function mfgFindOrder_(dbId, uid) {
    return tlDbFind_(dbId, MFG_SHEET, 'unique_id', uid);
  }

  function mfgLiveLines_(dbId, uid) {
    const wanted = mfgStr_(uid);
    return tlDbList_(dbId, MFG_LINES_SHEET).filter(function (l) { return mfgStr_(l.mo_unique_id) === wanted; });
  }

  function mfgNextNumber_(dbId) {
    // Called inside executeWithLock_. Deleted rows are included on purpose.
    const yyyy = new Date().getFullYear();
    const re = new RegExp('^MO-(\\d+)-' + yyyy + '$');
    let max = 0;
    etRecords_(dbId, MFG_SHEET).forEach(function (r) {
      const m = re.exec(mfgStr_(r.mo_number));
      if (m) max = Math.max(max, Number(m[1]) || 0);
    });
    return 'MO-' + (max + 1) + '-' + yyyy;
  }

  function validateManufacture_(header, lines) {
    header = header || {};
    lines = lines || [];
    if (!mfgStr_(header.mo_date)) throw new Error('تاريخ الأمر مطلوب');
    if (!mfgStr_(header.product_id)) throw new Error('المنتج التام مطلوب');
    if (num0_(header.planned_qty) <= 0) throw new Error('الكمية المخططة يجب أن تكون أكبر من صفر');
    if (lines.length === 0) throw new Error('يجب إضافة خامة واحدة على الأقل');
    if (lines.some(function (l) { return !mfgStr_(l && l.product_id); })) throw new Error('الخامة مطلوبة لكل سطر');
    if (lines.some(function (l) { return mfgStr_(l.product_id) === mfgStr_(header.product_id); })) throw new Error('لا يمكن استخدام المنتج التام كخامة');
    const seen = {};
    if (lines.some(function (l) { const k = mfgStr_(l.product_id); if (seen[k]) return true; seen[k] = true; return false; })) throw new Error('الخامة مكررة في نفس الأمر');
    if (lines.some(function (l) { return num0_(l.planned_qty) <= 0; })) throw new Error('كمية الخامة يجب أن تكون أكبر من صفر');
    if (header.extra_cost !== undefined && header.extra_cost !== null && header.extra_cost !== '' && Number(header.extra_cost) < 0) {
      throw new Error('التكاليف الإضافية لا يمكن أن تكون سالبة');
    }
    return true;
  }

  // Estimates for add/edit: every line priced at the current unitCostOf_.
  function mfgEstimate_(dbId, header, lines) {
    let materials = 0;
    const priced = lines.map(function (l) {
      const uc = unitCostOf_(dbId, l.product_id);
      const total = num0_(l.planned_qty) * uc;
      materials += total;
      return { unique_id: mfgStr_(l.unique_id), product_id: mfgStr_(l.product_id), planned_qty: num0_(l.planned_qty), unit_cost: uc, total_cost: total, notes: l.notes == null ? '' : l.notes };
    });
    const extra = num0_(header.extra_cost);
    const total = materials + extra;
    const planned = num0_(header.planned_qty);
    return { lines: priced, materials_cost: materials, extra_cost: extra, total_cost: total, unit_cost: planned > 0 ? total / planned : 0 };
  }

  function mfgRowValues_(headers, values) {
    const idx = {};
    headers.forEach(function (h, i) { idx[String(h).trim().toLowerCase()] = i; });
    const row = headers.map(function () { return ''; });
    Object.keys(values).forEach(function (k) {
      const i = idx[String(k).toLowerCase()];
      if (i !== undefined) row[i] = values[k];
    });
    return row;
  }

  function mfgWriteLines_(dbId, uid, pricedLines, user) {
    if (!pricedLines.length) return;
    const sheet = getSheet_(MFG_LINES_SHEET, dbId);
    const headers = etHeaders_(sheet);
    const baseId = getNextIdBatch_(dbId, MFG_LINES_SHEET, pricedLines.length, etCol_(MFG_LINES_SHEET, 'id'));
    const now = new Date();
    const rows = pricedLines.map(function (l, i) {
      return mfgRowValues_(headers, {
        unique_id: l.unique_id || uid16_(),
        id: baseId + i,
        mo_unique_id: uid,
        product_id: l.product_id,
        planned_qty: l.planned_qty,
        consumed_qty: '',
        unit_cost: l.unit_cost,
        total_cost: l.total_cost,
        notes: l.notes,
        user: (user && user.email) || '',
        created_at: now,
        version: 0
      });
    });
    tlDbAppendValuesBatch_(dbId, MFG_LINES_SHEET, rows);
  }

  function mfgWithNames_(dbId, rows) {
    const names = mfgProductNames_(dbId);
    return rows.map(function (r) { return Object.assign({}, r, { product_name: names[mfgStr_(r.product_id)] || '' }); });
  }

  function getManufactureHeaders_(data, user, dbId) {
    const rows = tlDbList_(dbId, MFG_SHEET).slice();
    rows.sort(function (a, b) {
      const da = parseDate_(a.mo_date), db = parseDate_(b.mo_date);
      const ta = da instanceof Date ? da.getTime() : 0, tb = db instanceof Date ? db.getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
    const limit = Number(data && data.limit) || 20;
    const sliced = (data && data.loadAll) ? rows : rows.slice(0, limit);
    return { status: 'success', headers: mfgWithNames_(dbId, sliced), total: rows.length };
  }

  function getManufactureOptions_(data, user, dbId) {
    return { status: 'success', options: { product_options: salesProductOptions_(dbId) } };
  }

  function getManufactureLines_(data, user, dbId) {
    const parent = mfgStr_(data && data.parent_id);
    if (!parent) throw new Error('معرف الأمر مطلوب');
    return { status: 'success', lines: mfgWithNames_(dbId, mfgLiveLines_(dbId, parent)) };
  }

  function getManufactureTemplate_(data, user, dbId) {
    const pid = mfgStr_(data && data.product_id);
    let best = null;
    tlDbList_(dbId, MFG_SHEET).forEach(function (o) {
      if (mfgStr_(o.product_id) !== pid || mfgStr_(o.production_status) === 'Cancelled') return;
      if (!best || (Number(o.id) || 0) > (Number(best.id) || 0)) best = o;
    });
    if (!best) return { status: 'success', lines: [] };
    const names = mfgProductNames_(dbId);
    const lines = mfgLiveLines_(dbId, best.unique_id).map(function (l) {
      return { product_id: l.product_id, product_name: names[mfgStr_(l.product_id)] || '', planned_qty: num0_(l.planned_qty) };
    });
    return { status: 'success', lines: lines };
  }

  function getManufacturePrint_(data, user, dbId) {
    const uid = mfgStr_(data && (data.mo_code || data.unique_id));
    const order = uid ? mfgFindOrder_(dbId, uid) : null;
    if (!order) throw new Error('أمر التصنيع غير موجود');
    const names = mfgProductNames_(dbId);
    return {
      status: 'success',
      header: Object.assign({}, order, { product_name: names[mfgStr_(order.product_id)] || '' }),
      lines: mfgWithNames_(dbId, mfgLiveLines_(dbId, uid))
    };
  }

  function addManufacture_(data, user, dbId) {
    const header = (data && data.header) || {};
    const lines = (data && data.lines) || [];
    const reqKey = mfgStr_((data && (data.request_key || data.unique_id)) || header.request_key || '');
    const result = executeWithLock_(function () {
      validateManufacture_(header, lines);
      if (reqKey) {
        let seen = null;
        try { seen = requestDedupeExecute_(dbId, MFG_SHEET, reqKey, reqKey); } catch (eGuard) { seen = null; }
        if (seen) return { deduped: liveDedupeReply_(seen, 'تمت إضافة أمر التصنيع') };
      }
      const uid = reqKey || uid16_();
      const moNumber = mfgNextNumber_(dbId);
      const est = mfgEstimate_(dbId, header, lines);
      const sheet = getSheet_(MFG_SHEET, dbId);
      const headers = etHeaders_(sheet);
      const now = new Date();
      const record = {
        unique_id: uid,
        id: getNextIdUnderLock_(dbId, MFG_SHEET, etCol_(MFG_SHEET, 'id')),
        mo_number: moNumber,
        mo_date: parseDate_(header.mo_date),
        product_id: mfgStr_(header.product_id),
        planned_qty: num0_(header.planned_qty),
        produced_qty: '',
        materials_cost: est.materials_cost,
        extra_cost: est.extra_cost,
        total_cost: est.total_cost,
        unit_cost: est.unit_cost,
        production_status: 'Open',
        notes: header.notes == null ? '' : header.notes,
        approval_status: 'Pending',
        user: (user && user.email) || '',
        created_at: now,
        version: 0
      };
      tlDbAppendValues_(dbId, MFG_SHEET, mfgRowValues_(headers, record));
      mfgWriteLines_(dbId, uid, est.lines, user);
      return { uid: uid, record: record };
    });
    if (result.deduped) return result.deduped;
    try { logHistory_(dbId, MFG_SHEET, 'create_erp_test_manufacture_orders_' + result.uid, String(result.uid), (user && user.email) || '', 'create', result.record, null); } catch (e) {}
    bustTopLightCaches_(dbId, 'manufacture');
    return { status: 'success', message: 'تمت إضافة أمر التصنيع', unique_id: result.uid, assignedId: result.uid, record: result.record };
  }

  function mfgRequireEditable_(order) {
    if (!order) throw new Error('أمر التصنيع غير موجود');
    if (mfgStr_(order.approval_status || 'Pending') !== 'Pending' || mfgStr_(order.production_status || 'Open') !== 'Open') {
      throw new Error('لا يمكن تعديل أمر معتمد أو مغلق');
    }
  }

  function editManufacture_(data, user, dbId) {
    const header = (data && data.header) || {};
    const lines = (data && data.lines) || [];
    const uid = mfgStr_(header.unique_id || (data && data.unique_id));
    if (!uid) throw new Error('معرف الأمر مطلوب');
    const out = executeWithLock_(function () {
      const order = mfgFindOrder_(dbId, uid);
      mfgRequireEditable_(order);
      validateManufacture_(header, lines);
      const est = mfgEstimate_(dbId, header, lines);
      const changes = {
        mo_date: parseDate_(header.mo_date),
        product_id: mfgStr_(header.product_id),
        planned_qty: num0_(header.planned_qty),
        materials_cost: est.materials_cost,
        extra_cost: est.extra_cost,
        total_cost: est.total_cost,
        unit_cost: est.unit_cost,
        notes: header.notes == null ? '' : header.notes
      };
      const patched = tlDbPatch_(dbId, MFG_SHEET, uid, changes, { user: user, version: header.version });
      if (!patched) throw new Error('أمر التصنيع غير موجود');
      tlDbSoftDeleteWhere_(dbId, MFG_LINES_SHEET, 'mo_unique_id', uid, { user: user });
      mfgWriteLines_(dbId, uid, est.lines, user);
      return { old: order, record: patched.record };
    });
    try { logHistory_(dbId, MFG_SHEET, 'update_erp_test_manufacture_orders_' + uid, uid, (user && user.email) || '', 'update', out.record, out.old); } catch (e) {}
    bustTopLightCaches_(dbId, 'manufacture');
    return { status: 'success', message: 'تم تحديث أمر التصنيع', unique_id: uid, assignedId: uid, record: out.record };
  }

  function deleteManufacture_(data, user, dbId) {
    const uid = mfgStr_(data && data.unique_id);
    if (!uid) throw new Error('معرف الأمر مطلوب');
    const old = executeWithLock_(function () {
      const order = mfgFindOrder_(dbId, uid);
      mfgRequireEditable_(order);
      const patched = tlDbSoftDelete_(dbId, MFG_SHEET, uid, { user: user, version: data && data.version });
      if (!patched) throw new Error('أمر التصنيع غير موجود');
      tlDbSoftDeleteWhere_(dbId, MFG_LINES_SHEET, 'mo_unique_id', uid, { user: user });
      return patched.oldRecord;
    });
    try { logHistory_(dbId, MFG_SHEET, 'delete_erp_test_manufacture_orders_' + uid, uid, (user && user.email) || '', 'delete', null, old); } catch (e) {}
    bustTopLightCaches_(dbId, 'manufacture');
    return { status: 'success', message: 'تم حذف أمر التصنيع' };
  }

  function approveManufacture_(data, user, dbId) {
    const uid = mfgStr_(data && data.unique_id);
    if (!uid) throw new Error('معرف الأمر مطلوب');
    const current = mfgFindOrder_(dbId, uid);
    if (!current) throw new Error('أمر التصنيع غير موجود');
    assertTransition_('et_manufacture', current.approval_status || 'Pending', 'Approved', 'لا يمكن اعتماد أمر التصنيع من هذه الحالة');
    const res = approveStep_('et_manufacture', uid, 'approve', user, { dbId: dbId, version: data && data.version });
    if (!res || res.status !== 'success') throw new Error((res && res.message) || 'أمر التصنيع غير موجود');
    bustTopLightCaches_(dbId, 'manufacture');
    return { status: 'success', message: 'تم اعتماد أمر التصنيع' };
  }

  function completeManufacture_(data, user, dbId) {
    data = data || {};
    const uid = mfgStr_(data.unique_id);
    if (!uid) throw new Error('معرف الأمر مطلوب');
    const out = executeWithLock_(function () {
      const order = mfgFindOrder_(dbId, uid);
      if (!order) throw new Error('أمر التصنيع غير موجود');
      if (mfgStr_(order.approval_status) !== 'Approved') throw new Error('يجب اعتماد الأمر قبل الإكمال');
      if (mfgStr_(order.production_status || 'Open') !== 'Open') throw new Error('الأمر مغلق');
      const produced = num0_(data.produced_qty);
      if (!(produced > 0)) throw new Error('الكمية المنتجة مطلوبة');
      if (!mfgStr_(data.completion_date)) throw new Error('تاريخ الإكمال مطلوب');
      // Version check before any line is patched, so a stale request writes nothing.
      if (data.version !== undefined && data.version !== null && data.version !== '') checkRowVersion_(order, data.version);

      // Fresh stock, straight from the transaction tabs (never a cached map), so the
      // availability check cannot see a stale quantity.
      bustTopLightCaches_(dbId, 'products');
      const stockNow = etStockMap_(dbId);
      const available = {};
      Object.keys(stockNow).forEach(function (p) { available[p] = stockNow[p].qty; });
      const names = mfgProductNames_(dbId);
      const payload = {};
      (data.lines || []).forEach(function (l) { payload[mfgStr_(l.unique_id)] = l; });
      const lines = mfgLiveLines_(dbId, uid);
      const priced = lines.map(function (l) {
        const p = payload[mfgStr_(l.unique_id)];
        const consumed = (p && p.consumed_qty !== undefined && p.consumed_qty !== null && p.consumed_qty !== '') ? Number(p.consumed_qty) : num0_(l.planned_qty);
        const avail = num0_(available[mfgStr_(l.product_id)]);
        if (!(consumed >= 0) || consumed > avail) {
          throw new Error('الكمية المستهلكة من ' + (names[mfgStr_(l.product_id)] || l.product_id) + ' تتجاوز الرصيد المتاح (المتاح: ' + avail + ')');
        }
        const uc = unitCostOf_(dbId, l.product_id);
        return { line: l, consumed: consumed, unit_cost: uc, total_cost: consumed * uc };
      });
      let materials = 0;
      priced.forEach(function (x) {
        materials += x.total_cost;
        tlDbPatch_(dbId, MFG_LINES_SHEET, x.line.unique_id, { consumed_qty: x.consumed, unit_cost: x.unit_cost, total_cost: x.total_cost }, { user: user });
      });
      const extra = num0_(order.extra_cost);
      const total = materials + extra;
      const patched = tlDbPatch_(dbId, MFG_SHEET, uid, {
        materials_cost: materials,
        total_cost: total,
        unit_cost: total / produced,
        produced_qty: produced,
        completion_date: parseDate_(data.completion_date),
        completed_by: (user && user.email) || '',
        production_status: 'Completed'
      }, { user: user, version: data.version });
      if (!patched) throw new Error('أمر التصنيع غير موجود');
      return { old: order, record: patched.record };
    });
    // OD-A: stock is computed live, so there is no stock sheet to refresh; busting
    // the stock caches is what makes the new quantities visible (plan 5.3.5 / 7.2).
    try { logHistory_(dbId, MFG_SHEET, 'update_erp_test_manufacture_orders_' + uid, uid, (user && user.email) || '', 'update', out.record, out.old); } catch (e) {}
    bustTopLightCaches_(dbId, 'manufacture');
    bustTopLightCaches_(dbId, 'products');
    return { status: 'success', message: 'تم إكمال أمر التصنيع', unique_id: uid, record: out.record };
  }

  function cancelManufacture_(data, user, dbId) {
    const uid = mfgStr_(data && data.unique_id);
    if (!uid) throw new Error('معرف الأمر مطلوب');
    const out = executeWithLock_(function () {
      const order = mfgFindOrder_(dbId, uid);
      if (!order) throw new Error('أمر التصنيع غير موجود');
      if (mfgStr_(order.production_status || 'Open') !== 'Open') throw new Error('الأمر مغلق');
      const patched = tlDbPatch_(dbId, MFG_SHEET, uid, {
        production_status: 'Cancelled',
        cancelled_at: new Date(),
        cancelled_by: (user && user.email) || ''
      }, { user: user, version: data && data.version });
      if (!patched) throw new Error('أمر التصنيع غير موجود');
      return { old: order, record: patched.record };
    });
    try { logHistory_(dbId, MFG_SHEET, 'update_erp_test_manufacture_orders_' + uid, uid, (user && user.email) || '', 'update', out.record, out.old); } catch (e) {}
    bustTopLightCaches_(dbId, 'manufacture');
    return { status: 'success', message: 'تم إلغاء أمر التصنيع', unique_id: uid, record: out.record };
  }

  // Completed, live orders and the live lines whose parent is one of them (P7).
  function mfgCompleted_(dbId) {
    let orders = [];
    let lines = [];
    try {
      orders = tlDbList_(dbId, MFG_SHEET).filter(function (o) { return mfgStr_(o.production_status) === 'Completed'; });
      const byUid = {};
      orders.forEach(function (o) { byUid[mfgStr_(o.unique_id)] = o; });
      lines = tlDbList_(dbId, MFG_LINES_SHEET)
        .filter(function (l) { return !!byUid[mfgStr_(l.mo_unique_id)]; })
        .map(function (l) { return { line: l, parent: byUid[mfgStr_(l.mo_unique_id)] }; });
    } catch (e) { orders = []; lines = []; } // manufacture tabs not created yet (P2)
    return { orders: orders, lines: lines };
  }
