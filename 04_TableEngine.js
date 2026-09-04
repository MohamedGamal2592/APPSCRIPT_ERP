/**
 * 04_TableEngine.js
 * RESPONSIBILITY: Unified data-listing engine — two-tier cache, O(1) PK lookups,
 * batched I/O, standardized tbl_* actions, write-driven invalidation.
 * Schema-agnostic: adapts to any business sheet via header-name resolution.
 * Loaded AFTER 03_Security.js and BEFORE Company_* files (numeric prefix).
 * ZERO spreadsheet schema modification — header validation only.
 */

/** Counter for §4.3 acceptance criterion #2 — at most one Sheets read per request for tbl_list */
let _tblSheetsReadCount_ = 0;

// ──────────────────────────────────────────────────────────
// 2.1 Declarative, runtime-validated Table Catalog
// Each company's Registry may provide `tables: [{id, sheetName, pkColumn,labelAr,actions}]`
// Metadata only — NEVER requires schema changes.
// ──────────────────────────────────────────────────────────
function getTableCatalog_(companyKey) {
  const reg = COMPANY_REGISTRY[companyKey];
  if (!reg) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  return reg.tables || [];
}

function resolveTableEntry_(companyKey, tableId) {
  const catalog = getTableCatalog_(companyKey);
  const entry = catalog.find(t => String(t.id).trim().toLowerCase() === String(tableId).trim().toLowerCase());
  if (!entry) throw new Error('الجدول غير معروف: ' + tableId);
  return entry;
}

/**
 * Validate sheetName + pkColumn against live headers (case-insensitive).
 * Missing pk → throw Arabic error. Missing UI column → hide gracefully (caller filters).
 */
function validateTableEntry_(dbId, entry) {
  let sheet;
  try { sheet = getSheet_(entry.sheetName, dbId); } catch (e) {
    throw new Error('الجدول غير موجود: ' + entry.sheetName);
  }
  const headers = getHeaders_(sheet).map(h => String(h).trim());
  const lc = headers.map(h => h.toLowerCase());
  const pkLc = String(entry.pkColumn || 'id').trim().toLowerCase();
  if (lc.indexOf(pkLc) === -1) {
    throw new Error('عمود المفتاح غير موجود في الجدول «' + entry.sheetName + '»: ' + entry.pkColumn);
  }
  return { sheet: sheet, headers: headers };
}

// ──────────────────────────────────────────────────────────
// 2.2 Two-tier read engine
// TIER A — execution-scoped O(1) index: { rows, byPk: Map, pks, headers, stamp }
// TIER B — cross-request script cache (chunked, manifest + chunks)
// ──────────────────────────────────────────────────────────
const _tableIndexCache_ = {}; // key = dbId|sheetName|pkColumn

function getIndexedRecords_(dbId, sheetName, pkColumn) {
  const key = dbId + '|' + sheetName + '|' + String(pkColumn).toLowerCase();
  if (_tableIndexCache_[key]) return _tableIndexCache_[key];

  const sheet = getSheet_(sheetName, dbId);
  const headers = getHeaders_(sheet);
  _tblSheetsReadCount_++;
  const raw = sheet.getDataRange().getValues();
  const rows = buildRecordsFromRaw_(raw, headers);

  const pkLc = String(pkColumn).trim().toLowerCase();
  let pkHeaderOriginal = null;
  let pkIdx = -1;
  headers.forEach((h, i) => { if (String(h).trim().toLowerCase() === pkLc) { pkHeaderOriginal = String(h).trim(); pkIdx = i; } });
  // pkHeaderOriginal is the exact header string as stored; rows use trimmed keys (see buildRecordsFromRaw_)
  const byPk = new Map();
  const pks = [];
  rows.forEach(r => {
    const pkVal = r[pkHeaderOriginal] !== undefined ? r[pkHeaderOriginal] : r[pkLc];
    const pk = String(pkVal == null ? '' : pkVal).trim();
    if (pk) { byPk.set(pk, r); byPk.set(String(pk).toLowerCase(), r); pks.push(pk); }
  });

  // Stamp = lightweight content hash: rowCount + lastRowId + headerHash (no extra read)
  const stamp = String(rows.length) + '_' + (pks.length ? pks[pks.length - 1] : '0') + '_' + headers.length;
  const entry = { rows: rows, byPk: byPk, pks: pks, headers: headers, stamp: stamp, pkHeader: pkHeaderOriginal || pkColumn };
  _tableIndexCache_[key] = entry;
  return entry;
}

function resetTableIndexCache_() {
  for (const k in _tableIndexCache_) delete _tableIndexCache_[k];
  _tblSheetsReadCount_ = 0;
}

// Tier B — chunked CacheService (manifest + chunks)
// Manifest key 'tbl_{dbId}_{tableId}_m' = JSON {n, chunks, stamp, ttl}
// chunk keys 'tbl_{dbId}_{tableId}_c0..cN' each ≤ 90k chars
function tableCacheKeys_(dbId, tableId) {
  const safe = String(dbId).slice(0, 12) + '_' + String(tableId).replace(/[^a-zA-Z0-9_]/g, '_');
  return { manifest: 'tbl_' + safe + '_m', prefix: 'tbl_' + safe + '_c' };
}

function normalizeForCache_(rows) {
  // Dates → ISO strings at cache boundary (§1.4)
  return rows.map(r => {
    const out = {};
    Object.keys(r).forEach(k => {
      const v = r[k];
      out[k] = (v instanceof Date) ? v.toISOString() : v;
    });
    return out;
  });
}

function putTableCache_(dbId, tableId, rows, headers, stamp) {
  try {
    const keys = tableCacheKeys_(dbId, tableId);
    const cache = CacheService.getScriptCache();
    const payload = JSON.stringify({ rows: normalizeForCache_(rows), headers: headers, stamp: stamp });
    if (payload.length > CONFIG.TABLE_CACHE_MAX_CHUNKS * CONFIG.TABLE_CACHE_CHUNK_SIZE) {
      console.warn('[TableEngine] skip cache: payload too large (' + payload.length + ' chars) for ' + tableId);
      return;
    }
    const chunks = [];
    for (let i = 0; i < payload.length; i += CONFIG.TABLE_CACHE_CHUNK_SIZE) chunks.push(payload.slice(i, i + CONFIG.TABLE_CACHE_CHUNK_SIZE));
    if (chunks.length > CONFIG.TABLE_CACHE_MAX_CHUNKS) {
      console.warn('[TableEngine] skip cache: too many chunks ' + chunks.length);
      return;
    }
    const manifest = JSON.stringify({ n: chunks.length, stamp: stamp, ts: Date.now(), ttl: CONFIG.TABLE_CACHE_TTL_SECONDS });
    // Remove old chunks first to avoid stale leftovers when chunk count shrinks
    try { invalidateTableCache_(dbId, tableId); } catch(e){}
    cache.put(keys.manifest, manifest, CONFIG.TABLE_CACHE_TTL_SECONDS);
    chunks.forEach((c, i) => { try { cache.put(keys.prefix + i, c, CONFIG.TABLE_CACHE_TTL_SECONDS); } catch(e){} });
  } catch (e) { console.warn('[TableEngine] putTableCache failed: ' + e.message); }
}

function getTableCache_(dbId, tableId) {
  try {
    const keys = tableCacheKeys_(dbId, tableId);
    const cache = CacheService.getScriptCache();
    const manifestRaw = cache.get(keys.manifest);
    if (!manifestRaw) return null;
    let manifest;
    try { manifest = JSON.parse(manifestRaw); } catch(e){ return null; }
    if (!manifest || !manifest.n) return null;
    const chunkKeys = [];
    for (let i = 0; i < manifest.n; i++) chunkKeys.push(keys.prefix + i);
    const chunkMap = cache.getAll(chunkKeys);
    let payload = '';
    for (let i = 0; i < manifest.n; i++) {
      const ck = keys.prefix + i;
      if (!chunkMap[ck]) return null; // any miss → full rebuild
      payload += chunkMap[ck];
    }
    const parsed = JSON.parse(payload);
    return { rows: parsed.rows, headers: parsed.headers, stamp: manifest.stamp || parsed.stamp || '' };
  } catch (e) { return null; }
}

function invalidateTableCache_(dbId, tableId) {
  try {
    const keys = tableCacheKeys_(dbId, tableId);
    const cache = CacheService.getScriptCache();
    // Remove manifest + up to MAX_CHUNKS chunk keys in one call
    const all = [keys.manifest];
    for (let i = 0; i < CONFIG.TABLE_CACHE_MAX_CHUNKS; i++) all.push(keys.prefix + i);
    try { cache.removeAll(all); } catch(e){ all.forEach(k => { try{cache.remove(k);}catch(e2){} }); }
    // Also bust Tier A for this sheet
    const lk = String(tableId).toLowerCase();
    Object.keys(_tableIndexCache_).forEach(k => { if (k.toLowerCase().indexOf(lk) !== -1 || k.indexOf(dbId) !== -1) delete _tableIndexCache_[k]; });
  } catch (e) {}
}

// Extend resetRecordCache_ to also reset TableEngine Tier A (called at request entry in apiRouter_/doGet)
(function wrapResetRecordCache_(){
  const orig = resetRecordCache_;
  resetRecordCache_ = function() { try{ orig(); }catch(e){} try{ resetTableIndexCache_(); }catch(e){} };
})();

// ──────────────────────────────────────────────────────────
// 2.3 Standardized action surface (routed through existing dispatch)
// ──────────────────────────────────────────────────────────
function tbl_list(ctx, args) {
  const company = ctx.company;
  const dbId = ctx.dbId;
  const tableId = args.tableId;
  const entry = resolveTableEntry_(company, tableId);
  const v = validateTableEntry_(dbId, entry);
  // 'read' access via checkPageAccess_
  const pageForTbl = entry.pageId || entry.page || tableId;
  checkPageAccess_(ctx.authUser, company, pageForTbl, 'read');

  // Try Tier B cache first (one getAll)
  let cached = getTableCache_(dbId, tableId);
  let rows, headers, stamp;
  if (cached) {
    rows = cached.rows; headers = cached.headers; stamp = cached.stamp;
  } else {
    const idx = getIndexedRecords_(dbId, entry.sheetName, entry.pkColumn || 'id');
    rows = idx.rows; headers = idx.headers; stamp = idx.stamp;
    putTableCache_(dbId, tableId, rows, headers, stamp);
  }

  // Row-level permission filtering server-side AFTER cache read (§2.3) — currently no row-level predicate;
  // hook: if entry.rowFilter is a function (ctx, row) => boolean, apply it here. Never store filtered subset.
  if (entry.rowFilter && typeof entry.rowFilter === 'function') {
    try { rows = rows.filter(r => entry.rowFilter(ctx, r)); } catch(e){ console.warn('rowFilter failed: '+e.message); }
  }

  // Optional server-side filters/sort/pagination (for large tables)
  let filtered = rows;
  if (args.filters && typeof args.filters === 'object') {
    const f = args.filters;
    filtered = filtered.filter(r => {
      for (let k in f) {
        const want = String(f[k]).trim().toLowerCase();
        if (!want) continue;
        const got = String(r[k] !== undefined ? r[k] : (r[String(k).toLowerCase()] !== undefined ? r[String(k).toLowerCase()] : '')).trim().toLowerCase();
        if (got.indexOf(want) === -1) return false;
      }
      return true;
    });
  }
  if (args.sort && args.sort.field) {
    const field = args.sort.field;
    const dir = String(args.sort.dir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
    filtered = filtered.slice().sort((a,b) => {
      const av = a[field] != null ? String(a[field]) : '';
      const bv = b[field] != null ? String(b[field]) : '';
      const na = parseFloat(av), nb = parseFloat(bv);
      if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
      return av.localeCompare(bv, 'ar') * dir;
    });
  }
  const total = filtered.length;
  const page = Math.max(1, Number(args.page) || 1);
  const pageSize = Math.max(0, Number(args.pageSize) || 0);
  let paged = filtered;
  if (pageSize > 0) paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Schema = live headers (case-preserved) so client maps by header NAME (§2.1)
  return { status: 'success', data: { schema: headers, rows: paged, stamp: stamp, total: total, sheetsRead: _tblSheetsReadCount_ } };
}

function tbl_get(ctx, args) {
  const entry = resolveTableEntry_(ctx.company, args.tableId);
  validateTableEntry_(ctx.dbId, entry);
  checkPageAccess_(ctx.authUser, ctx.company, entry.pageId || entry.page || args.tableId, 'read');
  const idx = getIndexedRecords_(ctx.dbId, entry.sheetName, entry.pkColumn || 'id');
  const rec = idx.byPk.get(String(args.pk).trim()) || idx.byPk.get(String(args.pk).trim().toLowerCase()) || null;
  if (!rec) throw new Error('السجل غير موجود');
  return { status: 'success', data: { record: rec, stamp: idx.stamp } };
}

function tbl_save(ctx, args) {
  disableRecordCache_();
  const entry = resolveTableEntry_(ctx.company, args.tableId);
  validateTableEntry_(ctx.dbId, entry);
  const pkTmp = args.pk != null && String(args.pk).trim() !== '' ? String(args.pk).trim() : null;
  // unified: create (no pk) -> write, update (has pk) -> full
  checkPageAccess_(ctx.authUser, ctx.company, entry.pageId || entry.page || args.tableId, pkTmp ? 'full' : 'write');
  const pkCol = entry.pkColumn || 'id';
  const pk = args.pk != null && String(args.pk).trim() !== '' ? String(args.pk).trim() : null;
  const record = args.record || {};
  // Normalize record keys to trimmed strings; matching is case-insensitive downstream
  const dataMap = {};
  Object.keys(record).forEach(k => { dataMap[String(k).trim()] = record[k]; });

  let result;
  if (pk) {
    // Update existing — match by pk, never row index (§1.4)
    const oldIdx = getIndexedRecords_(ctx.dbId, entry.sheetName, pkCol);
    const oldRow = oldIdx.byPk.get(pk) || oldIdx.byPk.get(pk.toLowerCase()) || null;
    const oldByUid = {};
    if (oldRow) oldByUid[pk] = oldRow;
    result = saveRecordWithAudit_(ctx.dbId, entry.sheetName, pk, dataMap, 'update', ctx.authUser.email || '', null, null, oldByUid, pkCol);
    if (result.status === 'error' || result.status === 'failed') throw new Error(result.message || 'فشل الحفظ');
    invalidateTableCache_(ctx.dbId, args.tableId);
    const fresh = getIndexedRecords_(ctx.dbId, entry.sheetName, pkCol);
    const saved = fresh.byPk.get(pk) || fresh.byPk.get(pk.toLowerCase()) || dataMap;
    return { status: 'success', data: { record: saved, pk: pk, stamp: fresh.stamp } };
  } else {
    const created = saveRecordWithAudit_(ctx.dbId, entry.sheetName, null, dataMap, 'create', ctx.authUser.email || '', null, null, null, pkCol);
    if (created.status === 'error') throw new Error(created.message || 'فشل الإنشاء');
    invalidateTableCache_(ctx.dbId, args.tableId);
    const fresh = getIndexedRecords_(ctx.dbId, entry.sheetName, pkCol);
    const assignedId = created.data && (created.data.assignedId || created.data.record && created.data.record[pkCol]) || null;
    const pkNew = assignedId != null ? String(assignedId) : (fresh.pks.length ? fresh.pks[fresh.pks.length - 1] : '');
    const saved = pkNew ? (fresh.byPk.get(pkNew) || fresh.byPk.get(pkNew.toLowerCase())) : null;
    return { status: 'success', data: { record: saved || dataMap, pk: pkNew, stamp: fresh.stamp } };
  }
}

function tbl_delete(ctx, args) {
  disableRecordCache_();
  const entry = resolveTableEntry_(ctx.company, args.tableId);
  validateTableEntry_(ctx.dbId, entry);
  checkPageAccess_(ctx.authUser, ctx.company, entry.pageId || entry.page || args.tableId, 'full');
  const pkCol = entry.pkColumn || 'id';
  const pk = String(args.pk || '').trim();
  if (!pk) throw new Error('المعرّف مطلوب للحذف');
  const oldIdx = getIndexedRecords_(ctx.dbId, entry.sheetName, pkCol);
  const oldRow = oldIdx.byPk.get(pk) || oldIdx.byPk.get(pk.toLowerCase()) || null;
  const oldByUid = {};
  if (oldRow) oldByUid[pk] = oldRow;
  const res = deleteRecordWithAudit_(ctx.dbId, entry.sheetName, pk, ctx.authUser.email || '', null, oldByUid, pkCol);
  invalidateTableCache_(ctx.dbId, args.tableId);
  const fresh = (()=>{ try{ return getIndexedRecords_(ctx.dbId, entry.sheetName, pkCol).stamp; } catch(e){ return Date.now().toString(); } })();
  return { status: 'success', data: { pk: pk, stamp: fresh, removed: res.removed } };
}

function tbl_export(ctx, args) {
  const entry = resolveTableEntry_(ctx.company, args.tableId);
  validateTableEntry_(ctx.dbId, entry);
  checkPageAccess_(ctx.authUser, ctx.company, entry.pageId || entry.page || args.tableId, 'read');
  // Generic export: return Drive export URL stub — non-blocking; caller opens in new tab.
  // For concrete sheets (e.g. sales invoices) the company can provide a custom export hook.
  const custom = entry.exportHook;
  if (custom && typeof custom === 'function') return custom(ctx, args);
  return { status: 'success', data: { url: '', message: 'التصدير غير مهيأ لهذا الجدول بعد' } };
}

// Unified dispatcher for ApiRouter — keeps existing company dispatch() but also handles tbl_* generically
function tableEngineDispatch_(payload, authUser, dbId) {
  const action = payload.module_action;
  const data = payload.data || {};
  const ctx = { authUser: authUser, company: payload.target_system, dbId: dbId };
  // Route tbl_* through TableEngine regardless of company
  if (action === 'tbl_list') return tbl_list(ctx, data);
  if (action === 'tbl_get') return tbl_get(ctx, data);
  if (action === 'tbl_save') return tbl_save(ctx, data);
  if (action === 'tbl_delete') return tbl_delete(ctx, data);
  if (action === 'tbl_export') return tbl_export(ctx, data);
  return null; // not a table-engine action — let company dispatch handle
}

// Patch executeCompanyAction_ to try TableEngine first (non-invasive wrapper)
(function wrapExecuteCompanyAction_(){
  const orig = executeCompanyAction_;
  executeCompanyAction_ = function(payload, sessionToken, authUser) {
    // If it's a tbl_* action, resolve company/dbId and delegate to TableEngine before company dispatch
    if (payload && payload.module_action && String(payload.module_action).indexOf('tbl_') === 0) {
      const companyKey = payload.target_system;
      if (!COMPANY_REGISTRY[companyKey]) throw new Error('Unknown company: ' + companyKey);
      if (!authUser.isSuperAdmin && authUser.company !== companyKey) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
      const dbId = authUser.isSuperAdmin ? getCompanySpreadsheetId_(companyKey) : getCompanySpreadsheetId_(authUser.company);
      const res = tableEngineDispatch_(payload, authUser, dbId);
      if (res) return res;
      throw new Error('TableEngine: unknown tbl action');
    }
    return orig(payload, sessionToken, authUser);
  };
})();
