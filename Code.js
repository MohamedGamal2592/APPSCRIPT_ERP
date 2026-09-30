/* ========================================================================
 * Code.js — shared runtime (single deployed shared source)
 * Table of contents:
 * 1. Configuration and registry bootstrap
 * 2. Storage, schema, Firestore and system store
 * 3. Generic data access and policy engines
 * 4. Security and authorization
 * 5. Administration and generic themes
 * 6. Generic DB Viewer infrastructure
 * 7. Routing, rendering and artifact delivery
 * 8. Telemetry and logging
 * 9. Backup, retention and runtime operations
 * ======================================================================== */

/* ===================== 1. CONFIGURATION / REGISTRY ===================== */
/**
 * shared Code.js section
 * RESPONSIBILITY: CONFIG constants and the empty mutable COMPANY_REGISTRY = {}.
 * No business logic. Loaded first (numeric prefix + filePushOrder).
 */

const CONFIG = {
  SESSION_EXPIRY_HOURS: 12,
  AUTH_SPREADSHEET_ID: '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM',
  // System data is Firestore-backed in the release build. The project/database
  // and environment are Script Properties, never client configuration.
  SYSTEM_STORAGE_BACKEND: 'firestore',
  // Bootstrap only the linked production script. A copied or staging script
  // has a different ID and must configure FIRESTORE_PROJECT_ID explicitly.
  FIRESTORE_PROJECT_IDS_BY_SCRIPT: {
    '1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM': 'erp-project-3cae0'
  },
  FIRESTORE_DATABASE_ID: '(default)',
  ERP_ENVIRONMENT: 'production',
  SESSION_SALT: 'erp-salt-2024',
  MAX_CONCURRENT_SESSIONS: 5,
  BACKUP_FOLDER_ID: '',   // <-- SET to a Drive folder ID before running migration batches (batch0_preflight warns if empty)
  CACHE_SESSION_SECONDS: 360,
  // Authority caches are invalidated by the authority GENERATION (see
  // authGeneration_ in shared Code.js section), not by expiry. These TTLs are now only
  // an upper bound on how long a generation's payload may occupy the cache.
  // Shortening them does NOT make the system fresher — it only adds sheet reads.
  CACHE_MATRIX_SECONDS: 21600,       // was 120
  CACHE_THEME_SECONDS: 21600,
  CACHE_LOGO_SECONDS: 21600,
  CACHE_GENERAL_SECONDS: 600,
  CACHE_KILLSWITCH_SECONDS: 21600,   // was 15
  // The user directory (email -> name/role/company/status) is keyed by the
  // generation too; an admin saving a user bumps it, so this TTL is a ceiling
  // on cache occupancy, not the freshness mechanism.
  CACHE_USER_DIR_SECONDS: 21600,

  // Worst-case staleness when NOTHING bumps the generation — i.e. a direct edit
  // in the AUTH spreadsheet made while the installable onEdit trigger is missing
  // or broken. Folded into the generation as a time bucket, so it is a hard
  // ceiling and not a hope. START AT 300. Raise to 3600 only after the owner has
  // confirmed the onAuthSheetEdit trigger is installed and firing.
  AUTH_STALENESS_CEILING_SECONDS: 300,

  // A kill-switch read that FAILED must never earn the long TTL — caching a
  // fail-open default for six hours would hide a real shutdown.
  CACHE_AUTH_FAILREAD_SECONDS: 15,
  // F-07: how often a session's last_activity is written back to ERP_Sessions.
  // Each write is a full read + full-row write of the shared AUTH spreadsheet,
  // per active user, so at 30s it was a hot spot under concurrent load.
  // last_activity is a soft "last seen" field; 5-minute staleness is harmless.
  SESSION_TOUCH_THROTTLE_SECONDS: 300,
  LOGIN_LOCKOUT_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_TTL_SECONDS: 900,
  // ── Retention (Phase 5, F-12 / F-13) ──────────────────────────────────────
  // How many months of ERP_Record_History and SystemLog stay in the LIVE tab.
  // Older rows move to dated archive tabs in the same spreadsheet — same columns,
  // nothing is deleted. THIS IS THE ONLY PLACE THE PERIOD IS DEFINED.
  //
  // *** 24 IS AN ASSUMPTION, NOT A DECISION. *** The retention period is an
  // audit/business question (Q2 in the investigation) that was never answered.
  // Change this one number if 24 months is wrong; nothing else needs editing.
  ARCHIVE_RETENTION_MONTHS: 24,
  // TableEngine cache (spec §2.2 Tier B)
  TABLE_CACHE_TTL_SECONDS: 600,
  TABLE_CACHE_MAX_CHUNKS: 50,
  TABLE_CACHE_CHUNK_SIZE: 90000
};

/**
 * Staging switch (Phase 0, Step 2). AUTH_SPREADSHEET_ID is the ONLY hardcoded
 * spreadsheet id in the project — every company database is resolved at runtime
 * from ERP_Companies.company_sheet_link — so redirecting this one value points
 * the whole system at a copied dataset.
 *
 * Resolution order: Script Property 'AUTH_SPREADSHEET_ID', else the literal
 * above. Production therefore needs NO property set: the fallback is the live
 * id, and staging sets the property. That way identical source can be pushed to
 * both projects and a staging id can never be committed into production code.
 *
 * The lookup is memoised per execution, so it costs at most one PropertiesService
 * call per request and only when the id is first used.
 */
(function () {
  var literalAuthId = CONFIG.AUTH_SPREADSHEET_ID;
  var resolved = null;
  Object.defineProperty(CONFIG, 'AUTH_SPREADSHEET_ID', {
    enumerable: true,
    configurable: true,
    get: function () {
      if (resolved === null) {
        resolved = literalAuthId;
        try {
          var override = PropertiesService.getScriptProperties().getProperty('AUTH_SPREADSHEET_ID');
          if (override && String(override).trim()) resolved = String(override).trim();
        } catch (e) { /* properties unavailable — keep the literal */ }
      }
      return resolved;
    }
  });
})();

let COMPANY_REGISTRY = {};

/**
 * Unified system messages — single source of truth (§5.4).
 * Constants only, lives in shared Code.js section. Injected to client via include helper.
 * SYSTEM_OFF must stay byte-identical to the kill-switch message ('عطل في السيستم' used live;
 * spec requires 'عطل في النظام' — we expose both and alias SYSTEM_OFF to the canonical spec string
 * while preserving the live check via check via isSystemEnabled_ string-agnostic flag).
 */
const ERP_MESSAGES = {
  SYSTEM_OFF: 'عطل في النظام',
  SYSTEM_OFF_LEGACY: 'عطل في السيستم',
  NOT_AUTHORIZED: 'غير مصرح لك بالوصول',
  SESSION_EXPIRED: 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى'
};

// Tunable for ERPFlow (§3.8) — minimum overlay lifetime in ms. 300-1000 allowed, default 600.
const ERP_FLOW_MIN_MS = 600;

/**
 * shared Code.js section
 * RESPONSIBILITY: registerCompany_(key, config) — the ONE function that populates
 * COMPANY_REGISTRY, plus getAllPages_() used by the router.
 * No business logic. Loaded second.
 */

let _companiesInitialized_ = false;

function ensureCompaniesRegistered_() {
  if (_companiesInitialized_) return COMPANY_REGISTRY;
  /* Company action files register their document validators while their IIFEs
   * are being evaluated. registerDocValidator_ normalizes the document type
   * through companyPolicies_(), which can reach this function before all four
   * Registry files have loaded. The old bootstrap set the completion flag
   * before its first registration call; that expected early miss was caught by
   * companyPolicies_(), but the flag stayed true forever and the dashboard saw
   * an empty registry, marking every company "under construction".
   *
   * Preflight every registration function and publish a fresh registry only
   * after the complete set succeeds. This keeps initialization retryable during
   * source evaluation and atomic for real doGet/apiRouter requests. */
  const registrations = [
    ['Top Light', typeof registerTopLight_ === 'function' ? registerTopLight_ : null],
    ['Top Chemical', typeof registerTopChemical_ === 'function' ? registerTopChemical_ : null],
    ['Valley Foods', typeof registerValleyFoods_ === 'function' ? registerValleyFoods_ : null],
    ['Assessment Center', typeof registerAssessmentCenter_ === 'function' ? registerAssessmentCenter_ : null],
    ['Testing System', typeof registerErpTest_ === 'function' ? registerErpTest_ : null]
  ];
  const missing = registrations.filter(function (entry) { return !entry[1]; }).map(function (entry) { return entry[0]; });
  if (missing.length) throw new Error('Company registries are not loaded yet: ' + missing.join(', '));

  const previousRegistry = COMPANY_REGISTRY;
  COMPANY_REGISTRY = {};
  try {
    // Keep these calls explicit: besides being easier to audit when a company
    // is added, the registry/page cross-reference checks verify each one.
    registerTopLight_();
    registerTopChemical_();
    registerValleyFoods_();
    registerAssessmentCenter_();
    registerErpTest_();
    _companiesInitialized_ = true;
  } catch (registrationError) {
    COMPANY_REGISTRY = previousRegistry;
    _companiesInitialized_ = false;
    throw registrationError;
  }
  // MANUAL STEP: every new company (Company_*_Registry.js) MUST be added here.
  // registerValleyFoods_(), etc. as they are built —
  // forgetting this is the classic "registered company missing" bug.
  return COMPANY_REGISTRY;
}

function registerCompany_(key, config) {
  if (COMPANY_REGISTRY[key]) throw new Error('Duplicate company registration: ' + key);
  if (!config.dispatch || typeof config.dispatch !== 'function') {
    throw new Error('Company "' + key + '" must provide a dispatch function');
  }
  COMPANY_REGISTRY[key] = config;
}

function getAllPages_() {
  const base = [
    { action: 'login', template: '0_ERPlogin', title: 'Login', public: true },
    { action: 'setup', template: '0_ERPsetup', title: 'Setup Password', public: true },
    { action: 'ERPDashboard', template: '0_ERPDashboard', title: 'Dashboard' },
    { action: 'ERP_Management', template: '0_ERP_Management', title: 'System Admin' },
    { action: 'user_sessions', template: 'User_Sessions', title: 'جلساتي' },
    { action: 'user_views', template: 'User_Views', title: 'العروض المحفوظة' },
    { action: 'record_history', template: 'Record_History_Panel', title: 'السجل' },
    { action: 'db_live_viewer', template: 'DbLive_Viewer', title: 'MySQL Database' },
    /* [RT-10] The weekly performance review. Registered like any other page;
       the handler behind it checks isSuperAdmin itself, so the registration
       is not what keeps it private. */
    { action: 'perf_dashboard', template: 'ERP_Perf_Dashboard', title: 'أداء النظام' }
  ];
  return base.concat(Object.values(COMPANY_REGISTRY).flatMap(c => c.pages));
}

/* ===================== 2. STORAGE / SCHEMA / FIRESTORE ================ */
/** Storage target resolution. System and company backends are separate. */
var SYSTEM_STORAGE_PROPERTY_KEYS_ = { backend: 'SYSTEM_STORAGE_BACKEND', projectId: 'FIRESTORE_PROJECT_ID', databaseId: 'FIRESTORE_DATABASE_ID', environment: 'ERP_ENVIRONMENT' };
var STORAGE_BACKENDS_ = { firestore: true, sheets: true };
var STORAGE_ENVIRONMENTS_ = { staging: true, production: true };
function storageError_(code, message, cause) { var e = new Error(code + ': ' + message); e.code = code; if (cause) e.cause = String(cause && cause.message || cause).slice(0, 160); return e; }
function readScriptProperty_(key, fallback) {
  try { var v = PropertiesService.getScriptProperties().getProperty(key); return v === null || v === undefined ? fallback : String(v).trim(); }
  catch (e) { throw storageError_('STORAGE_PROPERTY_ACCESS_ERROR', 'Unable to read Script Property ' + key, e); }
}
function getSystemStorageConfig_() {
  var backend = String(readScriptProperty_(SYSTEM_STORAGE_PROPERTY_KEYS_.backend, CONFIG.SYSTEM_STORAGE_BACKEND || 'firestore')).trim().toLowerCase();
  if (!STORAGE_BACKENDS_[backend]) throw storageError_('STORAGE_BACKEND_ERROR', 'Unsupported system storage backend');
  var projectId = String(readScriptProperty_(SYSTEM_STORAGE_PROPERTY_KEYS_.projectId, '') || '').trim();
  if (!projectId && backend === 'firestore') {
    var scriptId = '';
    try { scriptId = String(ScriptApp.getScriptId() || '').trim(); } catch (e) {}
    var projectIdsByScript = CONFIG.FIRESTORE_PROJECT_IDS_BY_SCRIPT || {};
    projectId = String(projectIdsByScript[scriptId] || '').trim();
  }
  var databaseId = String(readScriptProperty_(SYSTEM_STORAGE_PROPERTY_KEYS_.databaseId, CONFIG.FIRESTORE_DATABASE_ID || '(default)') || '').trim();
  var environment = String(readScriptProperty_(SYSTEM_STORAGE_PROPERTY_KEYS_.environment, CONFIG.ERP_ENVIRONMENT || 'production') || '').trim().toLowerCase();
  if (!STORAGE_ENVIRONMENTS_[environment]) throw storageError_('STORAGE_CONFIGURATION_ERROR', 'ERP_ENVIRONMENT must be staging or production');
  if (!databaseId || !/^[A-Za-z0-9_-]{1,63}$|^\(default\)$/.test(databaseId)) throw storageError_('STORAGE_CONFIGURATION_ERROR', 'FIRESTORE_DATABASE_ID is invalid');
  if (backend === 'firestore' && !projectId) throw storageError_('STORAGE_CONFIGURATION_ERROR', 'FIRESTORE_PROJECT_ID is not configured');
  if (backend === 'firestore' && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw storageError_('STORAGE_CONFIGURATION_ERROR', 'FIRESTORE_PROJECT_ID is invalid');
  return { backend: backend, projectId: projectId, databaseId: databaseId, environment: environment };
}
function systemStorageTarget_() { return getSystemStorageConfig_(); }
function firestoreConfigurationPreflight_() {
  var c;
  try { c = getSystemStorageConfig_(); } catch (e) { return { ok: false, code: e.code || 'STORAGE_CONFIGURATION_ERROR', message: 'Firestore configuration is not ready' }; }
  if (c.backend !== 'firestore') return { ok: true, backend: c.backend, environment: c.environment, read: false };
  try { firestoreRequest_('get', firestoreDocumentsBaseUrl_(c, 'erp_preflight_probe') + '?pageSize=1', null, { maxRetries: 0 }); return { ok: true, backend: c.backend, projectId: c.projectId, databaseId: c.databaseId, environment: c.environment, read: true }; }
  catch (e) {
    var status = Number(e.httpStatus || 0), code = e.code || '';
    var category = status === 401 || status === 403 || code === 'UNAUTHENTICATED' || code === 'PERMISSION_DENIED' ? 'STORAGE_OAUTH_IAM_ERROR' : status === 404 ? 'STORAGE_DATABASE_PATH_ERROR' : code === 'FAILED_PRECONDITION' ? 'STORAGE_INDEX_ERROR' : e.retryable ? 'STORAGE_TRANSPORT_ERROR' : 'STORAGE_FIRESTORE_ERROR';
    return { ok: false, code: category, message: 'Read-only Firestore preflight failed' };
  }
}
function getCompanyStorage_(companyUid) {
  var uid = String(companyUid || '').trim();
  if (!uid) throw new Error('COMPANY_STORAGE_ERROR: company UID is required');
  var record = companyRecord_(uid);
  return { backend: 'sheets', companyUid: record.uid || uid, spreadsheetId: record.spreadsheetId, supported: true };
}
function assertCompanyStorageSupported_(descriptor) {
  if (!descriptor || descriptor.backend !== 'sheets' || !descriptor.spreadsheetId) throw new Error('COMPANY_STORAGE_ERROR: unsupported company backend');
  return descriptor;
}

/** Canonical imported system collection mappings. */
var SYSTEM_TABLE_SCHEMAS_ = {
  ERP_Users: { collection: 'ERP_Users', keys: ['email'], unique: ['email'] },
  ERP_Companies: { collection: 'ERP_Companies', keys: ['company_unique_id'], unique: ['company_unique_id'] },
  ERP_Pages_Matrix: { collection: 'ERP_Pages_Matrix', keys: ['erp_pages_matrix_unique_id'], unique: ['role', 'page_id'] },
  ERP_System_Pages: { collection: 'ERP_System_Pages', keys: ['page_id'], unique: ['page_id'] },
  ERP_system_work: { collection: 'ERP_system_work', keys: [], unique: [] },
  ERP_Sessions: { collection: 'ERP_Sessions', keys: ['token_hash'], unique: ['token_hash'] },
  ERP_User_Devices: { collection: 'ERP_User_Devices', keys: ['email', 'device_id'], unique: ['email', 'device_id'] },
  ERP_User_Views: { collection: 'ERP_User_Views', keys: ['view_id'], unique: ['email', 'page_action', 'view_name'] },
  ERP_currency_exchange: { collection: 'ERP_currency_exchange', keys: ['id'], unique: ['currency'] },
  ERP_system_invoices: { collection: 'ERP_system_invoices', keys: ['unique_id'], unique: ['unique_id'] },
  ERP_Record_History: { collection: 'ERP_Record_History', keys: [], unique: [] },
  ERP_History_Queue: { collection: 'ERP_History_Queue', keys: ['event_id'], unique: ['event_id'] },
  SystemLog: { collection: 'SystemLog', keys: [], unique: [] },
  ERP_Client_Log: { collection: 'ERP_Client_Log', keys: [], unique: [] },
  ERP_Client_Perf: { collection: 'ERP_Client_Perf', keys: [], unique: [] },
  ERP_Perf_Log: { collection: 'ERP_Perf_Log', keys: [], unique: [] },
  ERP_Perf_Weekly: { collection: 'ERP_Perf_Weekly', keys: [], unique: [] }
  ,ERP_Record_History_Archive: { collection: 'ERP_Record_History_Archive', keys: [], unique: [] }
  ,SystemLog_Archive: { collection: 'SystemLog_Archive', keys: [], unique: [] }
};
function systemSchema_(tableKey) { var s = SYSTEM_TABLE_SCHEMAS_[String(tableKey || '')]; if (!s) throw new Error('STORAGE_SCHEMA_ERROR: unknown system table ' + tableKey); return s; }
function isSystemTable_(tableKey) { return !!SYSTEM_TABLE_SCHEMAS_[String(tableKey || '')]; }
function systemTableNames_() { return Object.keys(SYSTEM_TABLE_SCHEMAS_); }

/** Typed Firestore REST adapter. Credentials and REST envelopes stay server-side. */
var FIRESTORE_MAX_RETRIES_ = 5;
var FIRESTORE_PAGE_SIZE_ = 250;
var FIRESTORE_RETRY_BASE_MS_ = 750;
var FIRESTORE_RETRY_MAX_MS_ = 15000;
var FIRESTORE_METRICS_ = { calls: 0, reads: 0, writes: 0, retries: 0, cacheHits: 0, latencyMs: 0 };
function firestoreMetric_(kind, count) { if (kind === 'call') FIRESTORE_METRICS_.calls++; else if (kind === 'read') FIRESTORE_METRICS_.reads += Number(count || 1); else if (kind === 'write') FIRESTORE_METRICS_.writes += Number(count || 1); else if (kind === 'retry') FIRESTORE_METRICS_.retries++; }
function getFirestoreMetrics_() { return JSON.parse(JSON.stringify(FIRESTORE_METRICS_)); }
function resetFirestoreMetrics_() { FIRESTORE_METRICS_ = { calls: 0, reads: 0, writes: 0, retries: 0, cacheHits: 0, latencyMs: 0 }; }
function firestoreEncodeValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v === '') return { stringValue: '' };
  if (Object.prototype.toString.call(v) === '[object Date]') { if (isNaN(v.getTime())) throw new Error('STORAGE_VALUE_ERROR: invalid date'); return { timestampValue: v.toISOString() }; }
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') { if (!isFinite(v)) throw new Error('STORAGE_VALUE_ERROR: non-finite number'); return Math.floor(v) === v && Math.abs(v) <= 9007199254740991 ? { integerValue: String(v) } : { doubleValue: v }; }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(firestoreEncodeValue_) } };
  if (typeof v === 'object') { var f = {}; Object.keys(v).forEach(function (k) { f[k] = firestoreEncodeValue_(v[k]); }); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function firestoreDecodeValue_(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('bytesValue' in v) return v.bytesValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(firestoreDecodeValue_);
  if ('mapValue' in v) { var o = {}; Object.keys(v.mapValue.fields || {}).forEach(function (k) { o[k] = firestoreDecodeValue_(v.mapValue.fields[k]); }); return o; }
  return null;
}
function firestoreEncodeFields_(record) { var f = {}; Object.keys(record || {}).forEach(function (k) { f[k] = firestoreEncodeValue_(record[k]); }); return f; }
function firestoreDecodeDocument_(doc) { var d = {}; Object.keys((doc && doc.fields) || {}).forEach(function (k) { d[k] = firestoreDecodeValue_(doc.fields[k]); }); var n = String((doc && doc.name) || ''); return { data: d, meta: { documentId: n ? n.split('/').pop() : '', name: n, updateTime: doc && doc.updateTime ? doc.updateTime : '' } }; }
function firestoreQuoteFieldPath_(p) { p = String(p || ''); return /^[A-Za-z_][A-Za-z0-9_]*$/.test(p) ? p : '`' + p.replace(/`/g, '``') + '`'; }
function firestorePathPart_(v) { return encodeURIComponent(String(v)); }
function firestoreDocumentsBaseUrl_(c, collection) { return 'https://firestore.googleapis.com/v1/projects/' + firestorePathPart_(c.projectId) + '/databases/' + firestorePathPart_(c.databaseId) + '/documents/' + firestorePathPart_(collection); }
function firestoreDocumentUrl_(c, collection, id) { return firestoreDocumentsBaseUrl_(c, collection) + '/' + firestorePathPart_(id); }
function firestoreError_(status, body, url) { var msg = body && body.error && body.error.message ? body.error.message : 'Firestore request failed'; var code = body && body.error && body.error.status ? String(body.error.status) : 'HTTP_' + status; var e = new Error('FIRESTORE_' + code + ': ' + msg); e.code = code; e.httpStatus = status; e.retryable = status === 408 || status === 429 || status >= 500; e.url = url; return e; }
function firestoreRetryAfterMs_(response) {
  if (!response || typeof response.getAllHeaders !== 'function') return 0;
  var headers = {}; try { headers = response.getAllHeaders() || {}; } catch (e) { return 0; }
  var value = ''; Object.keys(headers).some(function (key) { if (String(key).toLowerCase() !== 'retry-after') return false; value = Array.isArray(headers[key]) ? headers[key][0] : headers[key]; return true; });
  if (value === '' || value === null || value === undefined) return 0;
  var seconds = Number(value); if (isFinite(seconds) && seconds >= 0) return Math.min(60000, Math.ceil(seconds * 1000));
  var at = new Date(String(value)).getTime(); return isFinite(at) ? Math.min(60000, Math.max(0, at - new Date().getTime())) : 0;
}
function firestoreRetryDelayMs_(attempt, response) {
  var cap = Math.min(FIRESTORE_RETRY_MAX_MS_, FIRESTORE_RETRY_BASE_MS_ * Math.pow(2, Math.max(0, attempt - 1)));
  var jittered = Math.floor(cap / 2 + Math.random() * Math.max(1, cap / 2));
  return Math.min(60000, Math.max(jittered, firestoreRetryAfterMs_(response)));
}
function firestoreRequest_(method, url, body, options) {
  var o = options || {}, retries = Number(o.maxRetries === undefined ? FIRESTORE_MAX_RETRIES_ : o.maxRetries), attempt = 0;
  while (true) {
    var started = new Date().getTime(); firestoreMetric_('call'); var req = { method: method, muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }; if (body !== undefined && body !== null) req.payload = JSON.stringify(body);
    var response;
    try { response = UrlFetchApp.fetch(url, req); } catch (err) { if (attempt < retries) { attempt++; firestoreMetric_('retry'); Utilities.sleep(firestoreRetryDelayMs_(attempt, null)); continue; } var te = new Error('FIRESTORE_TRANSPORT_ERROR: ' + err.message); te.retryable = true; throw te; }
    FIRESTORE_METRICS_.latencyMs += new Date().getTime() - started; var status = response.getResponseCode(), text = response.getContentText() || '', parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch (ignore) {}
    if (status >= 200 && status < 300) return parsed || {};
    var error = firestoreError_(status, parsed, url); if (error.retryable && attempt < retries) { attempt++; firestoreMetric_('retry'); Utilities.sleep(firestoreRetryDelayMs_(attempt, response)); continue; } throw error;
  }
}
function firestoreGetDocument_(c, collection, id, options) { var r; try { r = firestoreRequest_('get', firestoreDocumentUrl_(c, collection, id), null, options); } catch (e) { if (e.httpStatus === 404) return null; throw e; } firestoreMetric_('read'); return firestoreDecodeDocument_(r); }
function firestoreOperationId_(id) { var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(id), Utilities.Charset.UTF_8); return 'op_' + raw.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 40); }
function firestoreCreateDocument_(c, collection, record, options) { var o = options || {}, id = o.documentId || (o.operationId ? firestoreOperationId_(o.operationId) : Utilities.getUuid().replace(/-/g, '')), url = firestoreDocumentsBaseUrl_(c, collection) + '?documentId=' + firestorePathPart_(id), r; try { r = firestoreRequest_('post', url, { fields: firestoreEncodeFields_(record) }, o); } catch (e) { if (o.operationId && (e.httpStatus === 409 || e.code === 'ALREADY_EXISTS')) { var existing = firestoreGetDocument_(c, collection, id, o); if (existing) return existing; } throw e; } firestoreMetric_('write'); return firestoreDecodeDocument_(r); }
function firestoreCreateDocuments_(c, collection, items) {
  var prepared = (items || []).map(function (item) { var operationId = String(item.operationId || Utilities.getUuid()), id = firestoreOperationId_(operationId); return { id: id, operationId: operationId, record: item.record || {}, name: 'projects/' + c.projectId + '/databases/' + c.databaseId + '/documents/' + collection + '/' + id }; });
  var out = [];
  for (var offset = 0; offset < prepared.length; offset += 500) {
    var chunk = prepared.slice(offset, offset + 500), result;
    try { result = firestoreCommit_(c, chunk.map(function (item) { return { update: { name: item.name, fields: firestoreEncodeFields_(item.record) }, currentDocument: { exists: false } }; })); }
    catch (e) {
      if (e.httpStatus !== 409 && e.code !== 'ALREADY_EXISTS') throw e;
      chunk.forEach(function (item) { out.push(firestoreCreateDocument_(c, collection, item.record, { operationId: item.operationId })); });
      continue;
    }
    var writeResults = result.writeResults || [];
    chunk.forEach(function (item, index) { out.push({ data: item.record, meta: { documentId: item.id, name: item.name, updateTime: writeResults[index] && writeResults[index].updateTime || result.commitTime || '' } }); });
  }
  return out;
}
function firestorePatchDocument_(c, collection, id, changes, options) { var o = options || {}, keys = Object.keys(changes || {}); if (!keys.length) return firestoreGetDocument_(c, collection, id, o); var q = keys.map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(firestoreQuoteFieldPath_(k)); }).join('&'); if (o.expectedUpdateTime) q += '&currentDocument.updateTime=' + encodeURIComponent(o.expectedUpdateTime); var r = firestoreRequest_('patch', firestoreDocumentUrl_(c, collection, id) + '?' + q, { fields: firestoreEncodeFields_(changes) }, o); firestoreMetric_('write'); return firestoreDecodeDocument_(r); }
function firestoreDeleteDocument_(c, collection, id, options) { var o = options || {}, url = firestoreDocumentUrl_(c, collection, id); if (o.expectedUpdateTime) url += '?currentDocument.updateTime=' + encodeURIComponent(o.expectedUpdateTime); try { firestoreRequest_('delete', url, null, o); } catch (e) { if (e.httpStatus === 404) return false; throw e; } firestoreMetric_('write'); return true; }
function firestoreQueryDocuments_(c, collection, options) {
  var o = options || {}, filters = o.filters || [], order = (o.orderBy || []).slice(); if (!order.length) order.push({ field: '__name__', direction: 'ASCENDING' }); if (!order.some(function (x) { return x.field === '__name__'; })) order.push({ field: '__name__', direction: 'ASCENDING' });
  var where = null; if (filters.length === 1) where = { fieldFilter: { field: { fieldPath: firestoreQuoteFieldPath_(filters[0].field) }, op: filters[0].op || 'EQUAL', value: firestoreEncodeValue_(filters[0].value) } }; else if (filters.length > 1) where = { compositeFilter: { op: 'AND', filters: filters.map(function (f) { return { fieldFilter: { field: { fieldPath: firestoreQuoteFieldPath_(f.field) }, op: f.op || 'EQUAL', value: firestoreEncodeValue_(f.value) } }; }) } };
  var query = { from: [{ collectionId: collection }], orderBy: order.map(function (x) { return { field: { fieldPath: firestoreQuoteFieldPath_(x.field) }, direction: x.direction || 'ASCENDING' }; }), limit: Number(o.limit || FIRESTORE_PAGE_SIZE_) }; if (where) query.where = where; if (o.cursor) { var cursor = typeof o.cursor === 'string' ? JSON.parse(o.cursor) : o.cursor; query.startAt = { values: cursor.values || [], before: false }; }
  var url = 'https://firestore.googleapis.com/v1/projects/' + firestorePathPart_(c.projectId) + '/databases/' + firestorePathPart_(c.databaseId) + '/documents:runQuery', result = firestoreRequest_('post', url, { structuredQuery: query }, o), records = [];
  (Array.isArray(result) ? result : []).forEach(function (item) { if (item && item.document) { firestoreMetric_('read'); records.push(firestoreDecodeDocument_(item.document)); } });
  var nextCursor = null; if (records.length >= Number(o.limit || FIRESTORE_PAGE_SIZE_)) { var last = records[records.length - 1]; nextCursor = JSON.stringify({ values: order.map(function (x) { return x.field === '__name__' ? { referenceValue: last.meta.name } : firestoreEncodeValue_(last.data[x.field]); }) }); }
  return { records: records, nextCursor: nextCursor };
}
function firestoreCommit_(c, writes, transaction) { var body = { writes: writes }; if (transaction) body.transaction = transaction; var url = 'https://firestore.googleapis.com/v1/projects/' + firestorePathPart_(c.projectId) + '/databases/' + firestorePathPart_(c.databaseId) + '/documents:commit'; var r = firestoreRequest_('post', url, body, {}); firestoreMetric_('write', writes.length); return r; }

/** Repository boundary for system data; company code keeps using Sheet helpers. */
function isSystemTableBackend_(dbId, tableName) { return String(dbId || '') === String(CONFIG.AUTH_SPREADSHEET_ID || '') && isSystemTable_(tableName); }
function systemLegacyRecord_(r) { var out = {}; Object.keys(r.data || {}).forEach(function (k) { out[String(k).trim().toLowerCase()] = r.data[k]; }); try { Object.defineProperty(out, '_meta', { value: r.meta, enumerable: false }); } catch (e) { out._meta = r.meta; } return out; }
function systemRecordData_(r) { var out = {}; Object.keys(r || {}).forEach(function (k) { if (k !== '_meta') out[k] = r[k]; }); return out; }
function systemGetAllRecords_(table, options) { return systemStore_().queryAll(table, options || {}).records.map(systemLegacyRecord_); }
function systemFindByBusinessKey_(table, field, value, options) { var r = systemStore_().query(table, { filters: [{ field: field, value: value, op: 'EQUAL' }], limit: 2 }); if (r.records.length > 1 && !(options && options.allowMultiple)) throw new Error('STORAGE_INTEGRITY_ERROR: duplicate ' + table + '.' + field); return r.records.length ? systemLegacyRecord_(r.records[0]) : null; }
function systemFindByFields_(table, filters, options) { var r = systemStore_().query(table, { filters: (filters || []).map(function (f) { return { field: f.field, value: f.value, op: f.op || 'EQUAL' }; }), limit: (options && options.limit) || 2 }); if (r.records.length > 1 && !(options && options.allowMultiple)) throw new Error('STORAGE_INTEGRITY_ERROR: duplicate query for ' + table); return r.records.length ? systemLegacyRecord_(r.records[0]) : null; }
function systemPatchByFields_(table, filters, changes, options) { var found = systemFindByFields_(table, filters, options); if (!found) throw new Error('STORAGE_NOT_FOUND: ' + table); return systemPatchRecord_(table, found._meta.documentId, changes, Object.assign({}, options || {}, { expectedUpdateTime: options && options.expectedUpdateTime || found._meta.updateTime })); }
function systemCreateRecord_(table, data, options) { return systemStore_().create(table, data, options || {}); }
function systemAddRecordCompat_(table, data, requiredFields) {
  var missing = (requiredFields || []).filter(function (f) { return data[f] === undefined || data[f] === null || String(data[f]).trim() === ''; });
  if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
  var payload = Object.assign({}, data);
  if (payload.id === undefined && systemSchema_(table).keys.indexOf('id') === -1) {
    var wantsId = table === 'ERP_Users' || table === 'ERP_Companies' || table === 'ERP_currency_exchange' || table === 'ERP_User_Views';
    if (wantsId) payload.id = systemNextNumericId_(table, 'id');
  }
  var operationId = payload.unique_id || payload.event_id || payload.email || Utilities.getUuid();
  var created = systemCreateRecord_(table, payload, { operationId: operationId });
  var record = systemLegacyRecord_(created);
  return { status: 'success', message: 'Record added successfully', data: { record: record, newRowNumber: null, assignedId: payload.id } };
}
function systemPatchRecord_(table, id, changes, options) { return systemStore_().patch(table, id, changes, options || {}); }
function systemRemoveRecord_(table, id, options) { return systemStore_().remove(table, id, options || {}); }
function systemPatchByBusinessKey_(table, field, value, changes, options) { var found = systemFindByBusinessKey_(table, field, value, options); if (!found) throw new Error('STORAGE_NOT_FOUND: ' + table + '.' + field); return systemPatchRecord_(table, found._meta.documentId, changes, Object.assign({}, options || {}, { expectedUpdateTime: options && options.expectedUpdateTime || found._meta.updateTime })); }
function systemRemoveByBusinessKey_(table, field, value, options) { var found = systemFindByBusinessKey_(table, field, value, options); if (!found) return false; return systemRemoveRecord_(table, found._meta.documentId, Object.assign({}, options || {}, { expectedUpdateTime: options && options.expectedUpdateTime || found._meta.updateTime })); }
function systemFindFlagRecord_() { var rows = systemStore_().queryAll('ERP_system_work', {}).records.filter(function (r) { return Object.prototype.hasOwnProperty.call(r.data || {}, 'on_off'); }); if (rows.length > 1) throw new Error('STORAGE_INTEGRITY_ERROR: multiple ERP_system_work flag documents'); return rows.length ? rows[0] : null; }
function systemNextNumericId_(table, field) { var rows = systemStore_().queryAll(table, {}).records, max = 0; rows.forEach(function (r) { var n = Number(r.data[field]); if (isFinite(n) && Math.floor(n) === n && n > max) max = n; }); return max + 1; }
function systemStore_() { var c = systemStorageTarget_(); return c.backend === 'sheets' ? sheetsStore_() : firestoreStore_(c); }
function getAllRecordsFromSheets_(dbId, table) { var sheet = getSheet_(table, dbId), headers = getHeaders_(sheet), rows = buildRecordsFromRaw_(sheet.getDataRange().getValues(), headers); rows.forEach(function (r, i) { try { Object.defineProperty(r, '_meta', { value: { documentId: String(i + 2), updateTime: '' }, enumerable: false }); } catch (e) { r._meta = { documentId: String(i + 2), updateTime: '' }; } }); return rows; }
function sheetsStore_() { return { query: function (table, options) { var rows = getAllRecordsFromSheets_(CONFIG.AUTH_SPREADSHEET_ID, table), fs = (options && options.filters) || []; rows = rows.filter(function (r) { return fs.every(function (f) { var actual = r[String(f.field).toLowerCase()]; return String(actual == null ? '' : actual).trim().toLowerCase() === String(f.value == null ? '' : f.value).trim().toLowerCase(); }); }); return { records: rows.map(function (r) { return { data: systemRecordData_(r), meta: r._meta || {} }; }), nextCursor: null }; }, queryAll: function (t, o) { return this.query(t, o || {}); }, create: function (t, d, o) { var sheet = getSheet_(t, CONFIG.AUTH_SPREADSHEET_ID), headers = getHeaders_(sheet), id = o && o.documentId ? o.documentId : getNextId_(CONFIG.AUTH_SPREADSHEET_ID, t), values = headers.map(function (h) { var k = String(h).trim(); return k.toLowerCase() === 'id' ? id : (d[k] !== undefined ? d[k] : (d[k.toLowerCase()] !== undefined ? d[k.toLowerCase()] : '')); }); sheet.appendRow(values); noteMutation_(sheet); var rec = {}; headers.forEach(function (h, i) { rec[String(h).trim().toLowerCase()] = values[i]; }); return { data: rec, meta: { documentId: String(sheet.getLastRow()), updateTime: '' } }; }, patch: function (t, id, d) { var sheet = getSheet_(t, CONFIG.AUTH_SPREADSHEET_ID), row = Number(id); if (!isFinite(row) || row < 2 || row !== Math.floor(row) || row > sheet.getLastRow()) throw new Error('STORAGE_NOT_FOUND: ' + t + '/' + id); var headers = getHeaders_(sheet), current = sheet.getRange(row, 1, 1, headers.length).getValues()[0], next = current.map(function (value, index) { var key = String(headers[index]).trim().toLowerCase(), found = Object.keys(d || {}).find(function (k) { return String(k).trim().toLowerCase() === key; }); return found === undefined ? value : d[found]; }); sheet.getRange(row, 1, 1, next.length).setValues([next]); noteMutation_(sheet); var rec = {}; headers.forEach(function (h, i) { rec[String(h).trim().toLowerCase()] = next[i]; }); return { data: rec, meta: { documentId: String(row), updateTime: '' } }; }, remove: function (t, id) { var sheet = getSheet_(t, CONFIG.AUTH_SPREADSHEET_ID), row = Number(id); if (!isFinite(row) || row < 2 || row !== Math.floor(row) || row > sheet.getLastRow()) throw new Error('STORAGE_NOT_FOUND: ' + t + '/' + id); sheet.deleteRow(row); noteMutation_(sheet); return true; } }; }
function firestoreStore_(c) { return { query: function (t, o) { var r = firestoreQueryDocuments_(c, systemSchema_(t).collection, o || {}); return { records: r.records, nextCursor: r.nextCursor }; }, queryAll: function (t, o) { var opts = o || {}, out = [], cursor = opts.cursor || null, pages = 0; do { var p = this.query(t, Object.assign({}, opts, { cursor: cursor, limit: opts.limit || FIRESTORE_PAGE_SIZE_ })); out = out.concat(p.records); cursor = p.nextCursor; if (++pages > 1000) throw new Error('STORAGE_LIMIT_ERROR: pagination exceeded 250000 records'); } while (cursor); return { records: out, nextCursor: null }; }, create: function (t, d, o) { var r = firestoreCreateDocument_(c, systemSchema_(t).collection, d, o || {}); return { data: r.data, meta: r.meta }; }, patch: function (t, id, d, o) { var r = firestorePatchDocument_(c, systemSchema_(t).collection, id, d, o || {}); return { data: r.data, meta: r.meta }; }, remove: function (t, id, o) { return firestoreDeleteDocument_(c, systemSchema_(t).collection, id, o || {}); }, transact: function (writes) { var encoded = (writes || []).map(function (w) { var s = systemSchema_(w.tableName); return { update: { name: 'projects/' + c.projectId + '/databases/' + c.databaseId + '/documents/' + s.collection + '/' + w.documentId, fields: firestoreEncodeFields_(w.data || {}) }, updateMask: { fieldPaths: Object.keys(w.data || {}).map(firestoreQuoteFieldPath_) } }; }); return firestoreCommit_(c, encoded); } }; }


/* ===================== 3. DATA ACCESS / POLICY ========================= */
/**
 * shared Code.js section
 * RESPONSIBILITY: Generic sheet CRUD: getSheet_, getHeaders_, getAllRecords_,
 * addRecord_, updateRowByCriteria_, getNextId_ (lock-protected via executeWithLock_),
 * plus versioned-cache invalidation (bumpVersion_ / onEdit).
 * getNextId_ is the ONLY ID-assignment function in the project.
 * No business logic. Loaded third.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// WARNING: DO NOT send row indices to the client and trust them back for writes.
// The pattern getStockRevision_ → _sheetRow → updateStockRevision_ was FRAGILE
// because empty rows can shift indices. ALWAYS match by a business key
// (unique_id, product+date, etc.) server-side in the write function.
// ═══════════════════════════════════════════════════════════════════════════════

/* Stable canonicalization + hash for operation identity (recovery design).
 * Pure JavaScript: no GAS services, so vm-based verify suites can load it.
 * - stableCanonical_: sorted-key JSON; object key order, Dates (ISO day),
 *   and undefined-vs-missing are normalized. Arrays keep their order.
 * - stableHash64_: FNV-1a 64-bit over UTF-16 code units, 16 hex chars.
 *   Strength is adequate for accidental-collision detection between a request
 *   ID and one payload: the receipt ledger's SHA-256 hash remains the primary
 *   request-ID/payload binding enforced before any recovery runs. */
function stableCanonical_(value) {
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) {
    var t = value.getTime();
    if (isNaN(t)) return 'null';
    return JSON.stringify(value.toISOString().slice(0, 10));
  }
  if (Array.isArray(value)) return '[' + value.map(stableCanonical_).join(',') + ']';
  if (typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableCanonical_(value[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}
function stableHash64_(text) {
  var s = String(text == null ? '' : text);
  var hi = 0x811c9dc5, lo = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    hi = Math.imul(hi ^ c, 16777619) >>> 0;
    lo = Math.imul(lo ^ (c + ((i * 31) | 0)), 16777619) >>> 0;
  }
  function hex(n) { return ('00000000' + (n >>> 0).toString(16)).slice(-8); }
  return hex(hi) + hex(lo);
}

// Execution-scoped memoization so SpreadsheetApp.openById is called once per execution.
const _ssCache_ = {};

// Batch 1: request-scoped memoization for getAllRecords_(). Lives only for the
// duration of a single apiRouter_()/doGet execution (reset at entry) and is
// disabled entirely for mutating actions so a write can never be served stale
// data. Stores the raw getValues() 2D array; record objects are rebuilt on each
// read so callers may mutate them freely (identical behavior to before).
const _recordCache_ = {};
let _recordCacheDisabled_ = false;

/* Opt-in read-only snapshot ownership. Legacy getAllRecords_ callers still get
 * fresh mutable record objects. Audited readers may retain one materialized
 * row array per table for this execution, subject to a conservative budget. */
const _readOnlySnapshots_ = {};
let _readOnlySnapshotBytes_ = 0;
const READ_ONLY_SNAPSHOT_MAX_BYTES_ = 2 * 1024 * 1024;
const READ_ONLY_SNAPSHOT_MAX_ROWS_ = 50000;

function resetReadOnlySnapshots_() {
  for (const k in _readOnlySnapshots_) delete _readOnlySnapshots_[k];
  _readOnlySnapshotBytes_ = 0;
}

// Batch 8: request-scoped memo of sheets already ensured this execution, so
// repeated ensureSheet_/settingsEnsureSheet_ calls (getSheetByName round trips)
// are paid at most once per sheet per request.
const _ensuredSheets_ = {};

// Phase 0b instrumentation: how many real Sheets value-reads this execution paid
// for. Counted at the data-layer read sites only, so it undercounts any company
// code that calls getDataRange().getValues() directly — it is a floor, not a
// total. Reported in the SystemLog SheetReads column.
let _sheetsReadCount_ = 0;

function countSheetRead_() { _sheetsReadCount_++; }

function getSheetsReadCount_() { return _sheetsReadCount_; }

function resetRecordCache_() {
  for (const k in _recordCache_) delete _recordCache_[k];
  resetReadOnlySnapshots_();
  for (const k in _ensuredSheets_) delete _ensuredSheets_[k];
  // The id high-water mark is request-scoped by construction: it only ever
  // raises the floor above what the target table already says, and a value from
  // a previous request must never be allowed to do even that.
  for (const k in _idHighWater_) delete _idHighWater_[k];
  _recordCacheDisabled_ = false;
  _sheetsReadCount_ = 0;
  for (const k in _pkIndexCache_) delete _pkIndexCache_[k];
  // Per-execution authority memos (see authGeneration_ / isSystemEnabled_).
  // Called at the top of both doGet and apiRouter_, so every request starts
  // with a freshly-read generation.
  _genMemo_ = null;
  _ksMemo_ = null;
}

function disableRecordCache_() {
  _recordCacheDisabled_ = true;
  for (const k in _recordCache_) delete _recordCache_[k];
  resetReadOnlySnapshots_();
  for (const k in _pkIndexCache_) delete _pkIndexCache_[k];
}

/**
 * Phase 9 (F-01, conservative variant). Clear and RE-ENABLE the memo, without
 * touching the Phase 0b read counter or the ensured-sheets memo.
 *
 * apiRouter_ calls this once more immediately before the handler runs. The
 * preamble before it authenticates and may TOUCH the session row, and that write
 * would otherwise reach noteMutation_ and cost the handler its memo because of a
 * write the handler does not care about. Re-arming instead of leaving it
 * disabled is safe: the memo is empty at that point, so nothing in it can
 * predate the preamble's writes.
 */
function rearmRecordCache_() {
  for (const k in _recordCache_) delete _recordCache_[k];
  resetReadOnlySnapshots_();
  for (const k in _pkIndexCache_) delete _pkIndexCache_[k];
  _recordCacheDisabled_ = false;
}

/**
 * Phase 9 (F-01, conservative variant) — the whole of it, in one function.
 *
 * The memo used to be switched OFF for the entire request as soon as the router
 * saw a non-read action, so a save handler that legitimately reads six sheets
 * paid six full getDataRange().getValues() with zero reuse. The concern behind
 * that was real: a memo taken BEFORE a write must never be served AFTER it.
 *
 * The cure is narrower than the disease. The memo now starts ENABLED, and the
 * FIRST mutation of the request turns it off — clearing it — for the remainder
 * of that request. So:
 *   - reads before any write are memoised and reused;
 *   - the instant anything is written, the memo is emptied and stays off,
 *     exactly as today;
 *   - therefore no read can ever be served from a memo taken before a write it
 *     did not see. The memo is either younger than every write so far, or gone.
 *
 * Over-calling this is always SAFE — it only ever costs a cache, never
 * correctness — which is why it is called liberally, including at sites that may
 * not strictly need it.
 */
/*
 * [RT-5] …and, since this run, it also STAMPS the table it was told about.
 *
 * That it did not was a defect, not a gap in coverage, and it is the reason the
 * live-change watch has been decorative on the pages that had it. The stamp
 * helpers (noteTableChange_ / noteSheetChange_) were called from exactly three
 * places, all inside the shared data layer — addRecord_, updateRowByCriteria_
 * and the delete helpers. Company handlers write to sheets directly with
 * setValues/setValue/appendRow/deleteRow in about 112 places, and every one of
 * those called noteMutation_() with no arguments, which only ever emptied the
 * per-request memo.
 *
 * The consequence, stated plainly: a change written by one of those handlers
 * bumped no version, so a second device polling get_page_versions could never
 * learn about it. saveValleyReturn_, transferValleyCash_ and addMonthlySalary_
 * are three confirmed examples. Twenty-two pages have been polling for changes
 * they were structurally incapable of seeing.
 *
 * Both arguments are OPTIONAL and the no-argument call behaves EXACTLY as it
 * always has. That is deliberate: the signature change and the call-site sweep
 * ship together, but a site the sweep missed is no worse off than it was
 * yesterday, and tools/verify/rt3_stamp_coverage.js reports every one of them
 * with a file and a line rather than leaving them to be rediscovered.
 *
 * Where a caller holds a Sheet rather than a pair of ids, noteSheetChange_
 * derives both. Where a caller genuinely cannot tell which table it wrote,
 * it stamps NOTHING and is reported: a site that stamps the WRONG table is
 * worse than one that stamps none, because it makes every other page watching
 * that table refetch for no reason and still misses its own change.
 */
function noteMutation_(scopeId, sheetName) {
  if (scopeId && sheetName) {
    noteTableChange_(scopeId, sheetName);
  } else if (scopeId && typeof scopeId === 'object' && typeof scopeId.getName === 'function') {
    /* A Sheet in the first position. Almost every company write site holds one
     * — `const sheet = getSheet_(SOME_SHEET, dbId)` — and does NOT hold the
     * spreadsheet id separately, so demanding the pair would have meant
     * inventing a local at a hundred sites and getting some of them wrong.
     * noteSheetChange_ derives both from the sheet itself. */
    noteSheetChange_(scopeId);
  }
  if (_recordCacheDisabled_) return;   // already off for this request
  disableRecordCache_();
}

/**
 * Phase 9, defence in depth — see the guard in getAllRecords_.
 *
 * Set by apiRouter_ for any request whose effective action is not a read. On a
 * pure read request nothing writes at all, so the guard would be paying two
 * metadata round trips per memo hit to protect against a write that cannot
 * happen; it stays off there and the read path is exactly as fast as before.
 */
let _guardMemoHits_ = false;

function setMemoGuard_(on) { _guardMemoHits_ = !!on; }

/**
 * F-02.1: the empty-row test used to be Object.values(record).some(v =>
 * String(v).trim() !== ''), i.e. a second full pass over every cell, allocating
 * an array and coercing every value to a string — after already having built the
 * object. On a 20-column x 10,000-row sheet that is ~200,000 needless string
 * coercions per call.
 *
 * Now the row is tested directly on the raw array before any object is built.
 * Same predicate, same result — a row counts as non-empty iff at least one cell
 * is a non-blank string once trimmed — but it short-circuits on the first
 * non-empty cell and skips object construction entirely for blank rows.
 *
 * Trimmed header names are hoisted out of the loop too; they were being
 * recomputed for every row.
 */
function buildRecordsFromRaw_(data, headers) {
  const records = [];
  if (!data || data.length < 2) return records;
  const keys = headers.map(h => String(h).trim());
  const colCount = keys.length;
  // Headers that trim to the same name (including several blank ones) collapse
  // onto one object key, and the LAST such column wins. The old emptiness test
  // ran over Object.values(record), so it only ever saw those surviving columns.
  // testCols reproduces that exact set, so filtering is unchanged.
  const lastColForKey = {};
  for (let c = 0; c < colCount; c++) lastColForKey[keys[c]] = c;
  const testCols = Object.keys(lastColForKey).map(k => lastColForKey[k]);
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let hasValue = false;
    for (let t = 0; t < testCols.length; t++) {
      const v = row[testCols[t]];
      // Reproduces String(v).trim() !== '' exactly. Note the two traps:
      //   undefined -> the old code substituted '' at assignment, so it is EMPTY;
      //   null      -> String(null) is 'null', so it is NOT empty.
      // Everything else (0, false, a Date) stringifies non-blank and is not empty.
      if (v === undefined || v === '') continue;
      if (typeof v === 'string') { if (v.trim() !== '') { hasValue = true; break; } continue; }
      hasValue = true;
      break;
    }
    if (!hasValue) continue;
    const record = {};
    for (let c = 0; c < colCount; c++) {
      record[keys[c]] = row[c] !== undefined ? row[c] : '';
    }
    records.push(record);
  }
  return records;
}

function getSpreadsheet_(ssId) {
  if (!_ssCache_[ssId]) _ssCache_[ssId] = SpreadsheetApp.openById(ssId);
  return _ssCache_[ssId];
}

function getSheet_(sheetName, ssId) {
  const sheet = getSpreadsheet_(ssId).getSheetByName(sheetName);
  if (!sheet) throw new Error('Database Error: Missing tab "' + sheetName + '" in spreadsheet ' + ssId + '.');
  return sheet;
}

const _headerCache_ = {};

function getHeaders_(sheet) {
  const key = sheet.getParent().getId() + '_' + sheet.getSheetId();
  if (!_headerCache_[key]) {
    const lastCol = sheet.getLastColumn();
    countSheetRead_();
    _headerCache_[key] = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  }
  return _headerCache_[key];
}

/**
 * Writes a sheet formula into the cell at (rowNumber, headerName).
 * GLOBAL scope (not inside any IIFE) so every company namespace
 * (ValleyFoods, TopLight, TopChemical, HR modules) can call it.
 */
function writeFormula_(dbId, sheetName, rowNumber, headerName, formula) {
  const sheet = getSheet_(sheetName, dbId);
  const headers = getHeaders_(sheet);
  const idx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === headerName.toLowerCase(); });
  if (idx !== -1) {
    var cell = sheet.getRange(rowNumber, idx + 1);
    if (typeof cell.setFormula === 'function') {
      cell.setFormula(formula);
      noteMutation_();
    } else {
      cell.setValue(formula);
      noteMutation_();
    }
  }
}

/**
 * Phase 8 (F-04). Merge a { headerName: formulaString } map into a row array
 * that is ABOUT to be written, so the formulas ride along in the same setValues
 * instead of costing a writeFormula_ round trip each.
 *
 * setValues() treats a string beginning with '=' as a formula, exactly as
 * appendRow() and setFormula() already do throughout this codebase, so the cells
 * end up as formulas with identical text. This is the same equivalence Phase 3
 * rests on.
 *
 * Mutates and returns rowValues. A header the map names but the sheet does not
 * have is skipped, matching writeFormula_'s `if (idx !== -1)`.
 */
function applyRowFormulas_(rowValues, headers, formulaMap) {
  const idx = {};
  // First match wins, exactly as writeFormula_'s findIndex does, so a sheet with
  // two columns trimming to the same header name behaves identically.
  headers.forEach(function (h, i) {
    const k = String(h).trim().toLowerCase();
    if (idx[k] === undefined) idx[k] = i;
  });
  Object.keys(formulaMap).forEach(function (name) {
    const i = idx[String(name).trim().toLowerCase()];
    if (i !== undefined) rowValues[i] = formulaMap[name];
  });
  return rowValues;
}

/**
 * Phase 8 (F-04). Write a { headerName: formulaString } map onto a row that has
 * ALREADY been written and so cannot be merged into.
 *
 * Replaces N x writeFormula_, each of which paid its own getSheet_ +
 * getHeaders_ + setFormula: the sheet and its headers are passed in once, and
 * columns that happen to be adjacent are written as a single setValues. Only the
 * named columns are touched — exactly what the individual setFormula calls did —
 * so nothing else on the row is read or rewritten.
 */
function writeRowFormulas_(sheet, headers, rowNum, formulaMap) {
  const idx = {};
  // First match wins, exactly as writeFormula_'s findIndex does, so a sheet with
  // two columns trimming to the same header name behaves identically.
  headers.forEach(function (h, i) {
    const k = String(h).trim().toLowerCase();
    if (idx[k] === undefined) idx[k] = i;
  });
  const cols = [];
  Object.keys(formulaMap).forEach(function (name) {
    const i = idx[String(name).trim().toLowerCase()];
    if (i !== undefined) cols.push({ i: i, f: formulaMap[name] });
  });
  if (!cols.length) return;
  cols.sort(function (a, b) { return a.i - b.i; });

  let run = [cols[0]];
  for (let k = 1; k <= cols.length; k++) {
    const cur = cols[k];
    if (cur && cur.i === run[run.length - 1].i + 1) { run.push(cur); continue; }
    sheet.getRange(rowNum, run[0].i + 1, 1, run.length)
      .setValues([run.map(function (c) { return c.f; })]);
    noteMutation_();
    if (cur) run = [cur];
  }
}

/**
 * Phase 8 (F-04). Grow the grid so a block ending at `lastNeeded` fits.
 * appendRow() did this implicitly; a precomputed target range does not, and
 * setValues() past getMaxRows() throws.
 */
function ensureGridRows_(sheet, lastNeeded) {
  const max = sheet.getMaxRows();
  if (lastNeeded > max) sheet.insertRowsAfter(max, lastNeeded - max);
  noteMutation_();
}

// Reentrant-safe script lock: a nested executeWithLock_ (e.g. an audit helper
// called from inside a company action that already holds the lock) runs its fn
// directly instead of re-acquiring, while still blocking other executions.
let _scriptLockHeld_ = false;

/* ── per-table change stamps ───────────────────────────────────────────────
 *
 * Apps Script has no server push: no sockets, no long poll worth having. The
 * only way one user's device can learn that another user's device changed
 * something is to ASK — so the ask has to be cheap enough to repeat.
 *
 * A stamp is one CacheService entry per (spreadsheet, sheet). Writing one costs
 * nothing measurable next to the Sheets write that earned it; reading a page's
 * worth costs ONE CacheService.getAll, which is memory, not a spreadsheet.
 * That is the whole point: polling must never touch a sheet.
 *
 * Honest limits, and the client is written to them:
 *   - CacheService entries can be EVICTED before their TTL. A vanished stamp is
 *     therefore treated by the client as "no information", never as a change,
 *     so an eviction costs a missed refresh rather than a storm of them.
 *   - A stamp says a table changed, not what changed. It is a hint to refetch,
 *     not a substitute for the refetch.
 *   - Coverage is best-effort: a handler that writes with a raw setValues and
 *     does not stamp is simply not noticed. The shared write helpers below all
 *     stamp, which is most of them.
 */
var TABLE_VERSION_TTL_ = 21600;   // 6h, the CacheService maximum

function tableVersionKey_(scopeId, sheetName) {
  return 'tv_' + String(scopeId) + '_' + String(sheetName);
}

/**
 * [live-notice] Who is writing, for the stamp. apiRouter_ sets it for the
 * request it serves ({rid, who, name}) and clears it when the request ends; a
 * trigger or other background job has none and stamps as 'system'.
 */
var _liveReqMeta_ = null;
var LIVE_STAMP_WRITERS_ = 5;

/**
 * A stamp as stored: {t, w:[{t, r, u, n, k}]} — t is the newest write, w the
 * last five writes newest first. An old bare-number stamp reads as {t, w:[]};
 * anything unreadable reads as {t:0, w:[]}. `s` marks a stamp seeded by a poll.
 */
function parseTableStamp_(value) {
  if (value === null || value === undefined || value === '') return { t: 0, w: [] };
  var s = String(value);
  if (/^\d+$/.test(s)) return { t: Number(s), w: [] };
  try {
    var o = JSON.parse(s);
    if (!o || typeof o !== 'object') return { t: 0, w: [] };
    var w = Array.isArray(o.w) ? o.w.filter(function (x) { return x && typeof x === 'object'; }) : [];
    var out = { t: Number(o.t) || 0, w: w };
    if (o.s) out.s = 1;
    return out;
  } catch (e) { return { t: 0, w: [] }; }
}

/**
 * Record that a table changed. Never throws — a failed stamp must not fail a save.
 *
 * [live-notice D1] The stamp is JSON carrying WHO wrote and WHICH request, so a
 * page can tell its own save from someone else's. It is a read-modify-write of
 * one cache entry; the write paths that allocate ids hold the script lock, and
 * where one does not the worst case is a writer missing from the list, never a
 * missing change (t always moves). An evicted entry starts a fresh list.
 */
function noteTableChange_(scopeId, sheetName) {
  if (!scopeId || !sheetName) return;
  try {
    var cache = CacheService.getScriptCache();
    var key = tableVersionKey_(scopeId, sheetName);
    var prev = parseTableStamp_(cache.get(key));
    /* Strictly increasing, so two writes in one millisecond are still two. */
    var now = Math.max(new Date().getTime(), (Number(prev.t) || 0) + 1);
    var meta = _liveReqMeta_;
    var rid = meta ? String(meta.rid || '') : '';
    var entry = { t: now, r: rid, u: meta && meta.who ? String(meta.who) : 'system', n: meta && meta.name ? String(meta.name) : '', k: [] };
    var w = [];
    prev.w.forEach(function (x) {
      /* One entry per request: a request that writes the table twice keeps the
         keys it already recorded (Phase 5) and moves to the front. */
      if (rid && x.r === rid) { entry.k = Array.isArray(x.k) ? x.k : []; return; }
      w.push(x);
    });
    w.unshift(entry);
    if (w.length > LIVE_STAMP_WRITERS_) w.length = LIVE_STAMP_WRITERS_;
    cache.put(key, JSON.stringify({ t: now, w: w }), TABLE_VERSION_TTL_);
  } catch (e) { /* a stamp is a convenience, never a requirement */ }
}

/**
 * [live-notice D2] The body every company's get_page_versions returns.
 *
 * `versions` keeps its old shape (sheet -> raw stamp), so an old client keeps
 * working; `meta`, `views` and `labels` are additive. The tables are fixed by
 * the page's own server-side declaration — the client cannot name others — and
 * the caller's read access to the page has already been checked.
 *
 * A table with NO stamp (never written in the last six hours, or evicted) is
 * seeded here with a fresh time marked s:1. "Missing" means "unknown", and an
 * unknown stamp can never confirm a cached view; a seeded one can, because any
 * later write replaces it with a different time. The client treats a move TO a
 * seeded stamp as "no information", never as someone else's change. Still one
 * CacheService.getAll per poll, plus one putAll only when something was missing.
 */
function pageVersionsReply_(dbId, page, pageTables, pageViews, tableLabels) {
  var seen = {};
  var tables = [];
  function addTable(t) { if (t && !seen[t]) { seen[t] = true; tables.push(t); } }
  (pageTables || []).forEach(addTable);
  var views = null;
  if (pageViews && typeof pageViews === 'object') {
    views = {};
    Object.keys(pageViews).forEach(function (v) {
      views[v] = (pageViews[v] || []).slice();
      views[v].forEach(addTable);
    });
  }
  var versions = readTableVersions_(dbId, tables);
  var nowMs = new Date().getTime();
  var missing = tables.filter(function (t) { return versions[t] === undefined; });
  if (dbId && missing.length) {
    try {
      var seed = {};
      missing.forEach(function (t) {
        var v = JSON.stringify({ t: nowMs, w: [], s: 1 });
        seed[tableVersionKey_(dbId, t)] = v;
        versions[t] = v;
      });
      CacheService.getScriptCache().putAll(seed, TABLE_VERSION_TTL_);
    } catch (e) {
      missing.forEach(function (t) { delete versions[t]; });
    }
  }
  var meta = {};
  Object.keys(versions).forEach(function (t) {
    var p = parseTableStamp_(versions[t]);
    var m = { t: p.t, w: p.w.map(function (x) {
      var o = { t: Number(x.t) || 0, r: String(x.r || ''), u: String(x.u || ''), n: String(x.n || '') };
      if (Array.isArray(x.k) && x.k.length) o.k = x.k.slice(0, 6);
      return o;
    }) };
    if (p.s) m.s = 1;
    meta[t] = m;
  });
  var labels = {};
  tables.forEach(function (t) { if (tableLabels && tableLabels[t]) labels[t] = tableLabels[t]; });
  return {
    status: 'success',
    page: page,
    tables: tables,
    versions: versions,
    meta: meta,
    views: views,
    labels: labels,
    /* The server's own clock, so a client can tell a stalled poll from a
       quiet system, and can say "منذ دقيقة" without trusting the device clock. */
    now: String(nowMs)
  };
}

/** Stamp from a Sheet object, when that is all the caller has. */
function noteSheetChange_(sheet) {
  if (!sheet) return;
  try { noteTableChange_(sheet.getParent().getId(), sheet.getName()); } catch (e) {}
}

/** Current stamps for a set of tables, in ONE CacheService round trip. */
function readTableVersions_(scopeId, sheetNames) {
  const out = {};
  const names = (sheetNames || []).filter(Boolean);
  if (!scopeId || !names.length) return out;
  try {
    const keys = names.map(function (n) { return tableVersionKey_(scopeId, n); });
    const got = CacheService.getScriptCache().getAll(keys) || {};
    names.forEach(function (n) {
      const v = got[tableVersionKey_(scopeId, n)];
      if (v) out[n] = v;
    });
  } catch (e) { /* no stamps is a valid answer: the client learns nothing and does nothing */ }
  return out;
}

/**
 * The highest id currently in a table's id column.
 *
 * Both id allocators call this INSIDE the one global script lock, so its cost
 * is time every other user in every company spends queued. It therefore reads
 * ONE COLUMN rather than the whole sheet: identical answer, and on a 33-column
 * table it is 33x less data held under the lock (a 20 000-row purchasing line
 * table drops from ~660 000 cells to ~20 000).
 *
 * Deliberately a direct range read, not getAllRecords_: this runs under the
 * lock and must not populate or depend on the per-request memo.
 */
function maxIdOf_(sheet, idColumnName) {
  if (!sheet) return 0;
  const headers = getHeaders_(sheet);
  const want = String(idColumnName || 'id').toLowerCase();
  const idIdx = headers.findIndex(h => String(h).trim().toLowerCase() === want);
  if (idIdx === -1) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  countSheetRead_();
  const col = sheet.getRange(2, idIdx + 1, lastRow - 1, 1).getValues();
  let max = 0;
  for (let i = 0; i < col.length; i++) {
    const v = Number(col[i][0]);
    if (Number.isInteger(v) && v > max) max = v;
  }
  return max;
}

function executeWithLock_(fn, timeoutMs) {
  if (_scriptLockHeld_) return fn();
  _scriptLockHeld_ = true;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(timeoutMs || 5000);
    return fn();
  } finally {
    _scriptLockHeld_ = false;
    try { lock.releaseLock(); } catch (e) {}
  }
}

/**
 * Shared locked document counter (Phase 1 numbering).
 *
 * Modeled on ValleyFoods `nextInvoiceSeq_`: a PropertiesService persisted
 * counter keyed by dbId + docType + year (+ taxSystem variant via opts),
 * seeded once from the sheet max via a scanner callback. Returns an integer
 * seq; formatting (e.g. `seq + '-' + year`) stays in the callers so existing
 * formats are preserved.
 *
 * MUST be called while already holding `executeWithLock_` (throws otherwise).
 * A missing counter defaults to 0, so the first allocation seeds (via the
 * scanner when provided) and then returns `seededMax + 1`.
 *
 * @param {string} dbId spreadsheet id / scope.
 * @param {string} docType caller-chosen sequence name (e.g. 'tl_sales').
 * @param {number} year full year for the key.
 * @param {Object|Function} opts either a scanner fn or
 *   `{ taxSystem, seedScanner|scanner|seedMax|scanMax, taxVariant }`.
 * @return {number} next integer sequence value.
 */
function nextDocumentNumber_(dbId, docType, year, opts) {
  if (!_scriptLockHeld_) {
    throw new Error('nextDocumentNumber_ must be called inside executeWithLock_');
  }
  var scanner = null;
  var taxSuffix = '';
  if (typeof opts === 'function') {
    scanner = opts;
  } else if (opts) {
    if (typeof opts.seedScanner === 'function') scanner = opts.seedScanner;
    else if (typeof opts.scanner === 'function') scanner = opts.scanner;
    else if (typeof opts.seedMax === 'function') scanner = opts.seedMax;
    else if (typeof opts.scanMax === 'function') scanner = opts.scanMax;
    if ('taxSystem' in opts) taxSuffix = '_' + (opts.taxSystem ? '1' : '0');
    else if ('taxVariant' in opts) taxSuffix = '_' + String(opts.taxVariant);
  }
  var y = Number(year) || new Date().getFullYear();
  var key = 'doc_seq_' + String(dbId) + '_' + String(docType) + '_' + y + taxSuffix;
  var props = PropertiesService.getScriptProperties();
  var cur = Number(props.getProperty(key));
  if (!cur || cur <= 0) {
    var seeded = 0;
    if (scanner) {
      try { seeded = Number(scanner()) || 0; } catch (e) { seeded = 0; }
    }
    cur = seeded > 0 ? seeded : 0;
  }
  var next = (cur || 0) + 1;
  props.setProperty(key, String(next));
  return next;
}

/**
 * Single-attempt append; legacy signature retained for existing callers.
 */
function appendRowWithRetry_(sheet, values, maxRetries = 3, delayMs = 1000) {
  // appendRow is not idempotent: a timeout can arrive AFTER it committed.
  // Retain the signature for callers, but never blindly repeat an append.
  try {
    sheet.appendRow(values);
    noteMutation_();
    return true;
  } catch (e) {
    var err = new Error('Append outcome is uncertain; check the saved record before retrying: ' + e.message);
    err.code = 'WRITE_OUTCOME_UNKNOWN'; err.uncertain = true;
    throw err;
  }
}

/**
 * The id floor for allocations already made in THIS execution.
 *
 * Several handlers allocate ids in a LOOP and write the rows AFTERWARDS in one
 * batched setValues — the work-centre and by-product loops in
 * saveValleyMfgOrder_ are the clearest examples, and getNextIdBatch_'s callers
 * do the same thing deliberately. `max(id) + 1` on its own hands every
 * iteration of such a loop the SAME id, because no row has landed in between:
 * the table each call reads is identical. That is silent, and it is the one way
 * deriving ids from the table breaks production.
 *
 * So an allocation is floored by BOTH the live table and this execution's
 * high-water mark for that (spreadsheet, table, id column):
 *
 *     next = max(maxIdOf_(table), highWater) + 1
 *
 * The target table is still read on EVERY allocation, so the id remains
 * `max(id in the target table) + 1` and a row another execution appended
 * between two of our allocations is seen. The memo can only ever RAISE the
 * floor; it can never return a value the sheet does not already justify. It is
 * request-scoped and cleared by resetRecordCache_() at the top of every
 * request, so it can never outlive the execution that filled it.
 */
const _idHighWater_ = {};

function idHighWaterKey_(dbId, tableName, idColumnName) {
  return String(dbId) + '|' + String(tableName).trim().toLowerCase() + '|' +
         String(idColumnName || 'id').trim().toLowerCase();
}

/**
 * Internal id logic — MUST be called while already holding the script lock
 * (i.e. from getNextId_ or addRecord_, never standalone).
 *
 * The id is ALWAYS `max(id in the target table) + 1`, floored by the
 * in-execution high-water mark above. `ID_Counter` is not read, not written and
 * not created here.
 *
 * Why the counter is gone: this function used to return the counter's own value
 * whenever the counter ran AHEAD of the table (`current > tableMax` → return
 * `current`). The table was then never consulted for the answer, so a counter
 * that had drifted — and the owner reports it has — handed out ids the data
 * does not justify. `max(id) + 1` cannot drift, because it is measured from the
 * only thing that matters.
 */
function getNextIdUnderLock_(dbId, tableName, idColumnName = 'id') {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, tableName)) {
    const key = idHighWaterKey_(dbId, tableName, idColumnName);
    const live = systemNextNumericId_(tableName, idColumnName);
    const seen = Number(_idHighWater_[key]) || 0;
    const next = Math.max(live, seen + 1);
    _idHighWater_[key] = next;
    return next;
  }
  const ss = getSpreadsheet_(dbId);
  /* One column, not the whole sheet — see maxIdOf_. This runs under the global
     script lock, so its size is every other user's queue time. */
  const tableMax = maxIdOf_(ss.getSheetByName(tableName), idColumnName);
  const key = idHighWaterKey_(dbId, tableName, idColumnName);
  const seen = Number(_idHighWater_[key]) || 0;
  const next = (tableMax > seen ? tableMax : seen) + 1;
  _idHighWater_[key] = next;
  return next;
}

/* RFC 9562 UUIDv7: 48-bit Unix-ms timestamp + version/variant + 74 random bits.
   Lexicographically sortable by creation time, so unique_id doubles as a
   chronological index key. Canonical 36-char form (dashes) so Sheets never
   coerces it to a number. */
function uidV7_() {
  var ms = Date.now();
  var ts = ('000000000000' + ms.toString(16)).slice(-12);            // 48-bit ms → 12 hex
  var r  = Utilities.getUuid().replace(/-/g, '');                    // 32 random hex (entropy)
  var variant = ((parseInt(r.charAt(16), 16) & 0x3) | 0x8).toString(16); // variant 10xx
  return ts.slice(0, 8) + '-' + ts.slice(8, 12) + '-7' + r.slice(13, 16) +
         '-' + variant + r.slice(17, 20) + '-' + r.slice(20, 32);
}

/**
 * Canonical ID assignment. The ONLY public function that computes a new ID.
 * Lock-protected. Returns the current counter value and increments it.
 */
function getNextId_(dbId, tableName, idColumnName = 'id') {
  return executeWithLock_(function () {
    return getNextIdUnderLock_(dbId, tableName, idColumnName);
  });
}

/**
 * Read-only peek at the next ID for a table without allocating it.
 * Used for UI display of "next ID" only — never for writes.
 *
 * Same source as the allocator: max(id in the target table) + 1. It used to
 * read the ID_Counter row instead, so the number it showed the user was the
 * counter's, and on a table where the counter had drifted it did not match the
 * id the save would go on to assign. It is a DISPLAY value and stays advisory:
 * the row is not reserved, so two users peeking at once see the same number and
 * the allocator, under the lock, decides.
 *
 * Read-only, and it must stay that way. It writes nothing, creates nothing, and
 * deliberately does NOT touch the _idHighWater_ memo — a peek that raised the
 * floor would burn an id nobody asked for.
 */
function peekNextId_(dbId, tableName, idColumnName = 'id') {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, tableName)) return systemNextNumericId_(tableName, idColumnName);
  const ss = getSpreadsheet_(dbId);
  return maxIdOf_(ss.getSheetByName(tableName), idColumnName) + 1;
}

/**
 * Batch ID assignment. Lock-protected. Returns the starting ID for `count`
 * consecutive IDs (caller uses startId, startId+1, ..., startId+count-1).
 */
function getNextIdBatch_(dbId, tableName, count, idColumnName = 'id') {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Count must be a positive integer');
  }
  
  return executeWithLock_(function () {
    if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, tableName)) {
      const key = idHighWaterKey_(dbId, tableName, idColumnName);
      const startId = Math.max(systemNextNumericId_(tableName, idColumnName), (Number(_idHighWater_[key]) || 0) + 1);
      _idHighWater_[key] = startId + count - 1;
      return startId;
    }
    const ss = getSpreadsheet_(dbId);
    /* One column, not the whole sheet — see maxIdOf_. */
    const tableMax = maxIdOf_(ss.getSheetByName(tableName), idColumnName);
    /* Same floor as getNextIdUnderLock_, and the same reason: the caller writes
       `count` rows AFTER this returns, so a second batch (or a single
       allocation) taken before those rows land must not see the same table max
       twice. The counter bookkeeping this used to do is gone — the number was
       already derived from tableMax, so only the write to ID_Counter is lost. */
    const key = idHighWaterKey_(dbId, tableName, idColumnName);
    const seen = Number(_idHighWater_[key]) || 0;
    const startId = (tableMax > seen ? tableMax : seen) + 1;
    _idHighWater_[key] = startId + count - 1;
    return startId;
  });
}

/**
 * Get all records from a sheet as an array of objects with lowercase keys.
 * Empty rows are filtered out. Does not touch any counter.
 */
function getAllRecords_(dbId, sheetName) {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName)) return systemGetAllRecords_(sheetName);
  const sheet = getSheet_(sheetName, dbId);
  const headers = getHeaders_(sheet);
  if (!_recordCacheDisabled_) {
    const key = dbId + '|' + sheetName;
    const cached = _recordCache_[key];
    if (cached) {
      // Phase 9, defence in depth. The conservative variant is only as good as
      // noteMutation_'s coverage of the 183 direct write sites, and a missed one
      // would show up as a stale read INSIDE a save handler — silent, and
      // expensive. So on a request that CAN write, a memo entry is reused only
      // if the sheet still has the same shape.
      //
      // getLastRow/getLastColumn are metadata calls, not a values read, so this
      // costs a small fraction of a rebuild, and it independently catches an
      // append or a delete that reached the sheet without going through
      // noteMutation_. It does NOT catch an in-place update of an existing cell;
      // that case rests on coverage alone.
      //
      // On a read request the guard is off (setMemoGuard_), because nothing can
      // write, so the read path pays nothing for it.
      if (!_guardMemoHits_) return buildRecordsFromRaw_(cached.data, cached.headers);
      const cRows = cached.data.length;
      const cCols = cRows ? cached.data[0].length : 0;
      if (sheet.getLastRow() === cRows && sheet.getLastColumn() === cCols) {
        return buildRecordsFromRaw_(cached.data, cached.headers);
      }
      delete _recordCache_[key];
    }
    countSheetRead_();
    const data = sheet.getDataRange().getValues();
    _recordCache_[key] = { data: data, headers: headers };
    return buildRecordsFromRaw_(data, headers);
  }
  countSheetRead_();
  const data = sheet.getDataRange().getValues();
  return buildRecordsFromRaw_(data, headers);
}

/**
 * Opt-in read-only path for audited consumers. It shares the existing raw
 * request memo and invalidation lifecycle, materializes rows once, and returns
 * the owned array to code that promises not to mutate it. A large table falls
 * back to the legacy mutable reader without truncating results. 
 */
function getReadOnlyRecords_(dbId, sheetName) {
  if (_recordCacheDisabled_) return getAllRecords_(dbId, sheetName);
  const key = String(dbId) + '|' + String(sheetName);
  let snapshot = _readOnlySnapshots_[key];
  if (!snapshot) {
    let raw = _recordCache_[key];
    if (!raw) {
      const sheet = getSheet_(sheetName, dbId);
      const headers = getHeaders_(sheet);
      countSheetRead_();
      const data = sheet.getDataRange().getValues();
      raw = { data: data, headers: headers };
      _recordCache_[key] = raw;
    }
    const rows = Math.max(0, (raw.data || []).length - 1);
    const estimatedBytes = (raw.data || []).reduce(function (total, row) {
      return total + (row || []).reduce(function (n, value) {
        return n + 16 + String(value == null ? '' : value).length * 2;
      }, 0);
    }, (raw.headers || []).length * 32);
    if (rows > READ_ONLY_SNAPSHOT_MAX_ROWS_ ||
        _readOnlySnapshotBytes_ + estimatedBytes > READ_ONLY_SNAPSHOT_MAX_BYTES_) {
      return buildRecordsFromRaw_(raw.data, raw.headers);
    }
    snapshot = { data: raw.data, headers: raw.headers, rows: null,
      estimatedBytes: estimatedBytes, retainedRows: rows };
    _readOnlySnapshots_[key] = snapshot;
    _readOnlySnapshotBytes_ += estimatedBytes;
  }
  if (!snapshot.rows) snapshot.rows = buildRecordsFromRaw_(snapshot.data, snapshot.headers);
  return snapshot.rows;
}
/* ══ [I1] EXACTLY ONCE — a replayed write must never create a second row ═════
 *
 * THE RISK, and it is the largest one the optimistic-save design introduces.
 * A transport failure is *ambiguous*: the request may have reached the server
 * and COMMITTED before the connection dropped. The client's queue then replays
 * it. Nothing in the write path is idempotent — every add_* handler appends —
 * so the replay writes the row AGAIN. On a cash movement or a stock scan that
 * is duplicated money or duplicated stock, and neither the user nor the sheet
 * shows any sign that it happened.
 *
 * THE NATURAL KEY, and why it is not a new column. `unique_id` already exists
 * on these tables and already identifies a row; the client mints it, sends it,
 * and re-sends the SAME one on every retry because it lives in the queued
 * payload. So "have I already committed this request?" and "does a row with
 * this unique_id exist?" are the same question, answered from columns that are
 * already there. A `request_uid` column would be a schema change, and the
 * schema is not this programme's to touch — that constraint dictated the
 * design rather than the other way round. Same discipline as the audit-queue
 * drain above, which dedupes on record_uid/column_name/action/changed_at for
 * exactly the same reason.
 *
 * THE CRASH MATRIX, stated the way drainHistoryQueue_ states its own:
 *   died BEFORE the write   no row exists. The replay finds nothing and writes.
 *                           NOTHING LOST.
 *   died AFTER the write,   the row exists, carrying the client's unique_id.
 *   before the reply        The replay finds it and returns it as success
 *                           without writing. NOTHING DUPLICATED. This is the
 *                           case that actually happens, and the one worth
 *                           testing.
 *   the reply arrived       Nothing is queued at all; there is no replay.
 *
 * WHAT THIS DOES NOT DO. It does not scan for duplicates that already exist,
 * and it never deletes anything. I1 prevents duplicates at the source; a job
 * that removes rows it believes are duplicates is a data-loss engine.
 *
 * COST. One column of the target table, read the way maxIdOf_ reads one column
 * — the same cost class as the id allocation the same handler already pays,
 * and it reads the WHOLE column rather than a tail on purpose: a queued change
 * can be replayed hours later, from a phone that spent the night in a pocket,
 * so a tail scan would silently stop deduping exactly when it matters most.
 */

/**
 * The first row whose `columnName` equals `value`, as a lowercase-keyed record,
 * or null. Read-only.
 */
function findRowByColumn_(dbId, sheetName, columnName, value) {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName)) return systemFindByBusinessKey_(sheetName, columnName, value);
  const want = String(value == null ? '' : value).trim();
  if (!want) return null;
  const sheet = getSpreadsheet_(dbId).getSheetByName(sheetName);
  if (!sheet) return null;
  const headers = getHeaders_(sheet);
  const wantCol = String(columnName || 'unique_id').trim().toLowerCase();
  const idx = headers.findIndex(h => String(h).trim().toLowerCase() === wantCol);
  if (idx === -1) return null;
  const last = sheet.getLastRow();
  if (last < 2) return null;
  countSheetRead_();
  const col = sheet.getRange(2, idx + 1, last - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim() === want) {
      countSheetRead_();
      const row = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
      const rec = {};
      headers.forEach((h, c) => { rec[String(h).trim().toLowerCase()] = row[c]; });
      return rec;
    }
  }
  return null;
}

/**
 * [I1] The exactly-once guard. Call it FIRST in a queueable add handler:
 *
 *     const dup = liveDedupe_(dbId, SHEET, d.unique_id);
 *     if (dup) return liveDedupeReply_(dup);
 *
 * Returns the already-committed record when this request has been seen, and
 * null when it has not — including when the client sent no unique_id at all, in
 * which case the action is simply not queueable (plan §4.3) and the handler
 * behaves exactly as it always has.
 *
 * Deliberately NOT wrapped in a try/catch that swallows. The audit drain can
 * afford "no dedupe, worst case a duplicated audit row"; a business table
 * cannot. If the table cannot be read, the handler's own write would fail on
 * the same sheet a moment later anyway, so letting it throw loses nothing and
 * refuses rather than risking a second money row.
 */
function liveDedupe_(dbId, sheetName, uniqueId) {
  return findRowByColumn_(dbId, sheetName, 'unique_id', uniqueId);
}

/** The success reply for a request that had already been committed. */
function liveDedupeReply_(record, message) {
  return {
    status: 'success',
    deduped: true,
    message: message || 'تم الحفظ',
    data: { record: record }
  };
}

/**
 * Add a record to a sheet. Assigns the ID via getNextIdUnderLock_ (the canonical
 * counter logic) inside a single lock acquisition — no nested locking.
 * All sheet writes must go through this or getNextId_.
 */
function addRecord_(dbId, sheetName, dataMap, requiredFields) {
  if (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName)) return systemAddRecordCompat_(sheetName, dataMap, requiredFields);
  const missing = (requiredFields || []).filter(f => dataMap[f] === undefined || dataMap[f] === null || String(dataMap[f]).trim() === '');
  if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));

  return executeWithLock_(function () {
    const id = getNextIdUnderLock_(dbId, sheetName);
    const sheet = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sheet);
    /* Match the header EXACTLY first, then fall back to the lowercased name.
     *
     * This used to lowercase the header and look up only that, so a dataMap
     * keyed by the real header name lost every column whose name is not already
     * lowercase. On valley_purchasing_costing that is 32 of 46 columns — Code,
     * Type, Shipping Type, Supplier Name, Total costs, the lot — so creating a
     * purchase wrote a row that was blank apart from the audit columns. Worse,
     * requiredFields is checked against the map (where 'Code' is present) and
     * the row is then written from the lowercase lookup (where it is not), so
     * it validated and discarded the same value.
     *
     * The lowercase lookup stays as the fallback, so every caller that already
     * worked still behaves identically; this can only recover columns that were
     * being dropped. */
    const rowValues = headers.map(h => {
      const name = String(h).trim();
      if (name.toLowerCase() === 'id') return id;
      if (dataMap[name] !== undefined) return dataMap[name];
      const lower = name.toLowerCase();
      return dataMap[lower] !== undefined ? dataMap[lower] : '';
    });
    const newRowNumber = sheet.getLastRow() + 1;
    sheet.appendRow(rowValues);
    noteMutation_();
    noteTableChange_(dbId, sheetName);

    const savedRecord = {};
    headers.forEach((h, colIdx) => {
      savedRecord[String(h).trim().toLowerCase()] = rowValues[colIdx];
    });

    return {
      status: 'success',
      message: 'Record added successfully (row ' + newRowNumber + ')',
      data: { record: savedRecord, newRowNumber: newRowNumber, assignedId: id }
    };
  });
}

/**
 * Update a row by matching criteriaHeader == criteriaValue.
 * Uses a single batched setValues() write.
 */
function updateRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject) {
  const headers = getHeaders_(sheet);
  countSheetRead_();
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) throw new Error('Criteria header "' + criteriaHeader + '" not found.');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) {
      const newRow = data[i].map((originalVal, colIdx) => {
        const header = headers[colIdx];
        const updateKey = Object.keys(updatesObject).find(k => k.trim().toLowerCase() === String(header).trim().toLowerCase());
        return updateKey !== undefined ? updatesObject[updateKey] : originalVal;
      });
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      noteMutation_();
      noteSheetChange_(sheet);
      return true;
    }
  }
  return false;
}

/**
 * Row-edit repair (Stage 2): formula-safe patch for keyed record updates.
 *
 * Same match contract as updateRowByCriteria_ (case-insensitive header and
 * criteria match; returns true when a row matches, false when none does) but
 * writes ONLY cells that satisfy both conditions:
 *   1. the update map names the column (case-insensitive, as before), and
 *   2. the cell does not currently hold a sheet formula.
 * Cells holding formulas are preserved unconditionally — even when the update
 * map names them — so evaluated values are never written back over live
 * expressions and array/spill outputs are never clipped. Update keys with no
 * matching header are ignored, as with updateRowByCriteria_.
 *
 * Adjacent writable columns are written in single contiguous setValues calls;
 * formula cells, untouched columns and unknown keys break batches, so a write
 * can never span a protected gap. Callers that must install or refresh
 * application-owned formulas use the explicit writeFormula_/writeRowFormulas_
 * path instead; this helper never writes a formula.
 *
 * The extra single-row getFormulas() read runs only after a row matches.
 * Callers must still check the Boolean result: false means no matching row
 * (missing record), never a silent success.
 */
function patchRowByCriteria_(sheet, criteriaHeader, criteriaValue, updatesObject) {
  const headers = getHeaders_(sheet);
  countSheetRead_();
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) throw new Error('Criteria header "' + criteriaHeader + '" not found.');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) {
      const formulas = sheet.getRange(i + 1, 1, 1, headers.length).getFormulas()[0];
      const cells = [];
      headers.forEach(function (header, colIdx) {
        const updateKey = Object.keys(updatesObject).find(k => k.trim().toLowerCase() === String(header).trim().toLowerCase());
        if (updateKey === undefined) return;
        if (formulas[colIdx]) return; /* live formula: preserve, never overwrite */
        cells.push({ col: colIdx, value: updatesObject[updateKey] });
      });
      /* Batch adjacent writable columns; a protected/untouched column ends the run. */
      let run = [];
      const flush = function () {
        if (!run.length) return;
        const start = run[0].col;
        sheet.getRange(i + 1, start + 1, 1, run.length).setValues([run.map(function (c) { return c.value; })]);
        run = [];
      };
      cells.forEach(function (c) {
        if (run.length && c.col !== run[run.length - 1].col + 1) flush();
        run.push(c);
      });
      flush();
      noteMutation_();
      noteSheetChange_(sheet);
      return true;
    }
  }
  return false;
}

/**
 * Phase 1 version-check (optimistic concurrency, static only).
 * No `version` column exists yet; AUDIT_COLUMNS has updated_at but business
 * headers lack version. Missing column/value safely defaults to 0 and unknown
 * `version` keys are ignored by patchRowByCriteria_, so this never backfills.
 */
function getRowVersion_(row) {
  if (!row) return 0;
  var v = row.version;
  if (v === undefined) {
    var k = Object.keys(row).find(function (kk) { return String(kk).trim().toLowerCase() === 'version'; });
    v = k ? row[k] : undefined;
  }
  if (v === undefined || v === null || v === '') return 0;
  var n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
function checkRowVersion_(oldRow, clientVersion) {
  var current = getRowVersion_(oldRow);
  var want = (clientVersion === undefined || clientVersion === null || clientVersion === '') ? 0 : Number(clientVersion);
  if (!isFinite(want) || want < 0) want = 0;
  else want = Math.floor(want);
  if (want !== current) {
    /* Pre-mutation optimistic-locking refusal: nothing has been written, so the
       request-guard ledger must record a confirmed failure (safe to correct and
       retry with a fresh request), never an uncertain outcome. */
    var _conflict = new Error('CONFLICT: stale version — reload and retry | تعارض: النسخة قديمة — أعد التحميل وحاول مجدداً');
    _conflict.notApplied = true; _conflict.code = 'REQUEST_NOT_APPLIED';
    throw _conflict;
  }
  return current;
}

/**
 * Delete all rows where criteriaHeader == criteriaValue.
 * Deletes bottom-up so earlier row indices stay valid. Returns count deleted.
 *
 * PERF: matching rows are removed in CONTIGUOUS BLOCKS — one deleteRows(start,
 * n) per run rather than one deleteRow() per row. Exactly the same rows go, in
 * the same bottom-up order, and the same count comes back; the only difference
 * is the number of round trips. That matters because the rows this is used on
 * are almost always contiguous (a document's lines are appended together), so
 * a 40-line purchase went from 40 API calls to 1, and each deleteRow on a
 * 20 000-row sheet also forced Sheets to shift every row beneath it.
 */
function deleteRowsByCriteria_(sheet, criteriaHeader, criteriaValue) {
  return deleteRowsWhereIn_(sheet, criteriaHeader, [criteriaValue]);
}

/**
 * Delete every row whose criteriaHeader is ANY OF `values`, in ONE pass.
 *
 * Calling deleteRowsByCriteria_ in a loop costs a full getDataRange() read per
 * value, which is how deleting the 10 outputs of a manufacturing order came to
 * read the whole consumption sheet ten times. One read, one predicate, the same
 * contiguous-block deletion.
 *
 * Returns the number of rows removed.
 */
function deleteRowsWhereIn_(sheet, criteriaHeader, values) {
  const want = Object.create(null);
  let any = false;
  (values || []).forEach(function (v) {
    if (v === undefined || v === null) return;
    want[String(v).trim()] = true;
    any = true;
  });
  if (!any) return 0;

  const headers = getHeaders_(sheet);
  countSheetRead_();
  const data = sheet.getDataRange().getValues();
  const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
  if (critIdx === -1) return 0;

  /* 1-based sheet row numbers, ascending. */
  const target = [];
  for (let i = 1; i < data.length; i++) {
    if (want[String(data[i][critIdx]).trim()]) target.push(i + 1);
  }
  if (!target.length) return 0;

  /* Bottom-up, in contiguous blocks: same rows, same order, one API call per
     run instead of one per row. */
  let deleted = 0;
  let end = target.length - 1;
  while (end >= 0) {
    let start = end;
    while (start > 0 && target[start - 1] === target[start] - 1) start--;
    const count = end - start + 1;
    sheet.deleteRows(target[start], count);
    noteMutation_();
    deleted += count;
    end = start - 1;
  }
  noteSheetChange_(sheet);
  return deleted;
}

// ==========================================
// Canonical per-company reference-data cache (Part 1)
// ==========================================
/**
 * Canonical per-company reference-data cache. Every key is namespaced by
 * dbId, so one company's cached data can never be served to a request for
 * a different company — this is the ONLY caching helper any company's
 * Actions file should use for hot reference-data reads going forward.
 *
 * Cache-key / version contract (Phase 4):
 *   Base key format:    refs_<dbId>_<kind>
 *   Versioned key:      refs_<dbId>_<kind>_v<version>
 *     Versioned callers (tlRefs_/tcRefs_/vfRefsCached_) append
 *     '_v' + <stamp> to `kind` BEFORE calling here, so the final
 *     CacheService key carries the stamp (e.g. refs_<dbId>_products_v171...).
 *   TTL: 600s for reference entries (TL_REF_TTL / TC_REF_TTL / FIN_REF_TTL_G).
 *     Stamps (tl_refs_ver_<dbId> / tc_refs_ver_<dbId> / vf_refs_ver_<dbId>)
 *     live 21600s (6h) and are bumped on write, not expired.
 *   Version bump rule: after EVERY successful write to a cached table
 *     (title_index/parties/products and per-company equivalents), bump the
 *     company's stamp (bumpTlRefsVersion_/bumpTcRefsVersion_/bumpVfRefsVersion_
 *     or the bust* wrapper) to orphan ALL derived versioned keys at once.
 *     ALSO call invalidateRefsCache_(dbId, kind) for each touched kind so
 *     legacy unstamped keys (refs_<dbId>_<kind> written before versioning)
 *     are removed too. Manual sheet edits bypass both and surface within TTL.
 *
 * @param {string} dbId - the requesting company's own spreadsheet ID,
 *   always taken from the resolved company context of the CURRENT
 *   request — never from a raw client-supplied parameter (see Part 1b).
 * @param {string} kind - a short label for what's being cached, e.g.
 *   'categories', 'chart_of_accounts', 'products', 'parties'.
 * @param {number} ttlSeconds - how long to keep the cached value.
 * @param {function} builder - a zero-argument function that performs the
 *   actual (expensive) Sheets read when there's a cache miss.
 */
function getRefsCached_(dbId, kind, ttlSeconds, builder) {
  if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_ && String(dbId).indexOf('mysql_') === 0) return builder();
  if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_ && String(dbId).indexOf('mysql_') === 0) return builder();
  if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_ && String(dbId).indexOf('mysql_') === 0) return builder();
  if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_ && String(dbId).indexOf('mysql_') === 0) return builder();
  const key = 'refs_' + String(dbId) + '_' + String(kind);
  try {
    const cached = getChunkedCache_(key);
    if (cached !== null) return cached;
  } catch (e) { /* fall through to rebuild */ }
  const value = builder();
  try { putChunkedCache_(key, value, ttlSeconds); } catch (e2) { /* cache write failures are non-fatal */ }
  return value;
}

// ==========================================
// Chunked CacheService (Phase 6 — harvested from 04_TableEngine.js)
// ==========================================
/**
 * CacheService rejects any single value over ~100 KB. getRefsCached_ used to do
 * a plain cache.put inside a try/catch, so for a large reference list — a big
 * products or parties table — the put threw, was swallowed, and the cache
 * SILENTLY NEVER WORKED: every call rebuilt from a full sheet read. The bigger
 * the company, the less the cache helped.
 *
 * 04_TableEngine.js had a correct chunked implementation (manifest + numbered
 * chunk keys) that nothing could reach, because that whole engine was dead code
 * (F-17). It is harvested here, generalised, before the engine is deleted.
 *
 * Layout: '<key>__m' is a stable pointer to immutable generation-specific chunks.
 * Chunks are published before the pointer, so readers see one complete generation or
 * a miss. The old sanitized namespace is not read: punctuation-colliding legacy
 * keys are ambiguous and must cold-migrate.
 */
function chunkedCacheKeyDigest_(value) {
  var text = String(value);
  try {
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest && Utilities.DigestAlgorithm && Utilities.Charset) {
      return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
        .map(function (b) { var n = b < 0 ? b + 256 : b; return ('0' + n.toString(16)).slice(-2); }).join('').slice(0, 16);
    }
  } catch (e) {}
  // Offline harnesses do not provide Utilities. Two independent 32-bit hashes
  // still keep sanitized/truncated cache namespaces isolated in that fallback.
  var h1 = 2166136261, h2 = 2246822519;
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 16777619);
    h2 ^= c + i; h2 = Math.imul(h2, 3266489917);
  }
  return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
}

function chunkedCacheKeys_(key) {
  var raw = String(key);
  var safe = raw.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 184);
  var scoped = 'ck2_' + safe + '_' + chunkedCacheKeyDigest_(raw);
  var generation = arguments.length > 1 && arguments[1] != null ? String(arguments[1]).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) : '';
  return { manifest: scoped + '__m', prefix: scoped + (generation ? '__g' + generation : '') + '__c', generation: generation, base: scoped };
}

// Read the pre-byte-aware namespace during the migration window. New writes
// always use chunkedCacheKeys_; removal clears both layouts for rollback safety.
function legacyChunkedCacheKeys_(key) {
  var safe = String(key).replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 200);
  return { manifest: safe + '__m', prefix: safe + '__c' };
}

function utf8ByteLength_(text) {
  try { return encodeURIComponent(String(text)).replace(/%[0-9A-F]{2}/g, 'x').length; }
  catch (e) { return String(text).length; }
}

function utf8Chunks_(text, maxBytes) {
  var chunks = [], part = '', bytes = 0;
  Array.from(String(text)).forEach(function (ch) {
    var n = utf8ByteLength_(ch);
    if (part && bytes + n > maxBytes) { chunks.push(part); part = ''; bytes = 0; }
    part += ch; bytes += n;
  });
  if (part || !chunks.length) chunks.push(part);
  return chunks;
}

function chunkedCacheEpochKey_(key) {
  return 'ck2e_' + chunkedCacheKeyDigest_(String(key));
}

function chunkedCacheGeneration_() {
  var uuid = '';
  try { if (Utilities && Utilities.getUuid) uuid = String(Utilities.getUuid()); } catch (e) {}
  if (!uuid) uuid = String(new Date().getTime()) + '_' + String(Math.random()).slice(2);
  return uuid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'g' + String(new Date().getTime());
}

function withChunkedCacheLock_(fn) {
  var lock = null;
  try {
    if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) return null;
    }
    return fn();
  } catch (e) { return null; }
  finally { try { if (lock) lock.releaseLock(); } catch (e2) {} }
}

function removeChunkedPublication_(cache, keys, maxChunks) {
  if (!keys || !keys.generation) return;
  var all = [];
  for (var i = 0; i < maxChunks; i++) all.push(keys.prefix + i);
  if (all.length) cache.removeAll(all);
}

function readChunkedCache_(keys, maxChunks) {
  try {
    var cache = CacheService.getScriptCache();
    var manifestRaw = cache.get(keys.manifest);
    if (!manifestRaw) return null;
    var manifest = JSON.parse(manifestRaw);
    if (!manifest || !manifest.g || (keys.generation && String(manifest.g) !== String(keys.generation))) return null;
    var n = Number(manifest.n);
    if (!isFinite(n) || n < 1 || n !== Math.floor(n) || n > maxChunks) return null;
    var chunkKeys = [], payload = '';
    for (var i = 0; i < n; i++) chunkKeys.push(keys.prefix + i);
    var map = cache.getAll(chunkKeys) || {};
    for (var j = 0; j < n; j++) {
      var ck = keys.prefix + j;
      if (map[ck] === undefined || map[ck] === null) return null;
      payload += map[ck];
    }
    if (Number(manifest.bytes) !== utf8ByteLength_(payload) || String(manifest.h || '') !== chunkedCacheKeyDigest_(payload)) return null;
    return JSON.parse(payload);
  } catch (e) { return null; }
}

function putChunkedCache_(key, value, ttlSeconds) {
  try {
    var baseKeys = chunkedCacheKeys_(key);
    var cache = CacheService.getScriptCache();
    var payload = JSON.stringify(value);
    var chunkSize = Number(CONFIG.TABLE_CACHE_CHUNK_SIZE || 90000);
    var maxChunks = Number(CONFIG.TABLE_CACHE_MAX_CHUNKS || 50);
    var chunks = utf8Chunks_(payload, chunkSize);
    if (!isFinite(chunkSize) || chunkSize < 1 || !isFinite(maxChunks) || maxChunks < 1 || chunks.length > maxChunks || chunks.some(function (c) { return utf8ByteLength_(c) > chunkSize; })) return false;
    var generation = chunkedCacheGeneration_();
    var keys = chunkedCacheKeys_(key, generation);
    var epochKey = chunkedCacheEpochKey_(key);
    var epoch = cache.get(epochKey) || '0';
    var put = {};
    chunks.forEach(function (c, i) { put[keys.prefix + i] = c; });
    // Chunks are immutable and unreferenced until the manifest is written.
    cache.putAll(put, ttlSeconds);
    var published = withChunkedCacheLock_(function () {
      var currentEpoch = cache.get(epochKey) || '0';
      if (String(currentEpoch) !== String(epoch)) {
        removeChunkedPublication_(cache, keys, maxChunks);
        return false;
      }
      var oldManifest = null;
      try { oldManifest = JSON.parse(cache.get(baseKeys.manifest) || ''); } catch (e) {}
      cache.put(baseKeys.manifest, JSON.stringify({ v: 2, g: generation, n: chunks.length, bytes: utf8ByteLength_(payload), h: chunkedCacheKeyDigest_(payload), ts: new Date().getTime() }), ttlSeconds);
      if (oldManifest && oldManifest.g && String(oldManifest.g) !== generation) removeChunkedPublication_(cache, chunkedCacheKeys_(key, oldManifest.g), maxChunks);
      return true;
    });
    return published === true;
  } catch (e) { return false; }
}

/** @return the cached value, or null on any miss. */
function getChunkedCache_(key) {
  try {
    var maxChunks = Number(CONFIG.TABLE_CACHE_MAX_CHUNKS || 50);
    var base = chunkedCacheKeys_(key);
    var raw = CacheService.getScriptCache().get(base.manifest);
    if (!raw) return null;
    var manifest = JSON.parse(raw);
    if (!manifest || !manifest.g) return null;
    return readChunkedCache_(chunkedCacheKeys_(key, manifest.g), maxChunks);
  } catch (e) { return null; }
}

function removeChunkedCache_(key) {
  try {
    var maxChunks = Number(CONFIG.TABLE_CACHE_MAX_CHUNKS || 50);
    var base = chunkedCacheKeys_(key);
    withChunkedCacheLock_(function () {
      var cache = CacheService.getScriptCache();
      var current = null;
      try { current = JSON.parse(cache.get(base.manifest) || ''); } catch (e) {}
      var epochKey = chunkedCacheEpochKey_(key);
      cache.put(epochKey, String(Number(cache.get(epochKey) || 0) + 1), 21600);
      cache.remove(base.manifest);
      if (current && current.g) removeChunkedPublication_(cache, chunkedCacheKeys_(key, current.g), maxChunks);
      // Legacy fixed-key entries are safe to remove, but never read.
      var legacy = legacyChunkedCacheKeys_(key), old = [legacy.manifest];
      for (var i = 0; i < maxChunks; i++) old.push(legacy.prefix + i);
      cache.removeAll(old);
      return true;
    });
  } catch (e) {}
}

// ==========================================
// O(1) primary-key lookup (Phase 6 — harvested from 04_TableEngine.js)
// ==========================================
/**
 * Returns { rows, byPk, pks, headers } for a sheet, with byPk a Map giving O(1)
 * lookup by primary key. Callers that repeatedly do
 * rows.find(r => String(r.id) === String(x)) inside a loop are O(n*m); this
 * makes them O(n+m).
 *
 * Built on getAllRecords_, so it shares the request memo and is counted by the
 * Phase 0b SheetReads instrumentation — unlike the TableEngine original, which
 * kept a second parallel read path and its own cache.
 *
 * byPk preserves the pre-optimization Map contract from indexById: stored
 * trimmed keys and lowercase aliases are indexed, but Map queries are not
 * normalized. Callers that need an alias must probe it explicitly. The whole
 * entry { rows, byPk, pks, headers } is memoised per request; rows and the
 * records byPk returns are SHARED objects across memo hits — do not mutate
 * them unless you are the sole owner of this read.
 */
const _pkIndexCache_ = {};

/**
 * Generalised O(1) id index over an in-memory row array (Phase 4).
 * Use instead of rows.find(function(r){ return String(r.id)===String(x); })
 * or full-range forEach scans for party/product lookups.
 *
 * MATCHING CONTRACT (Task 1B — read before converting a .find() to this):
 * - Header resolution: idField is matched case-insensitively and after trim
 *   against the record keys; the record's own key spelling is used to read
 *   the value. Default field is 'id'.
 * - Stored ids are keyed by their trimmed string form AND their lowercase
 *   alias. Queries are ordinary Map queries: whitespace is not removed and
 *   case is not repaired unless the caller explicitly probes the alias.
 * - Duplicate precedence: LAST match wins, as in the pre-optimization Map.
 * - Blank/null ids are skipped (never indexed). A miss returns undefined
 *   from get() / false from has() — callers decide what a miss means.
 * - Numeric ids are string-normalized (7 and '7' are the same key; the
 *   first-stored row wins).
 * - Ownership: the Map holds REFERENCES to the caller's row objects. When
 *   obtained via getRecordsByPk_ the entry (rows + index) is memoised for
 *   the request, so mutating a returned record is visible to later readers
 *   in the same request. Treat returned records as read-only unless you
 *   own the rows array you passed in.
 *
 * @param {Array} rows - records from getAllRecords_ (or a cached accessor).
 * @param {string} idField - id column name, default 'id' (case-insensitive).
 * @return {Map} the pre-optimization exact-query Map with lowercase aliases.
 */
function indexById(rows, idField) {
  var want = String(idField == null || idField === '' ? 'id' : idField).trim().toLowerCase() || 'id';
  var byId = new Map();
  if (!rows || !rows.length) return byId;
  var actual = null;
  try {
    var sample = rows[0];
    for (var k in sample) {
      if (String(k).trim().toLowerCase() === want) { actual = k; break; }
    }
  } catch (e) { actual = null; }
  rows.forEach(function (r) {
    var raw = actual !== null ? r[actual] : (r[want] !== undefined ? r[want] : r[idField]);
    var pk = String(raw == null ? '' : raw).trim();
    if (!pk) return;
    var lc = pk.toLowerCase();
    // Preserve the original last-write-wins behavior for both the stored key
    // and lowercase alias. Query normalization belongs to callers, not here.
    byId.set(pk, r);
    byId.set(lc, r);
  });
  return byId;
}

function getRecordsByPk_(dbId, sheetName, pkColumn) {
  const pkLc = String(pkColumn || 'id').trim().toLowerCase();
  const key = dbId + '|' + sheetName + '|' + pkLc;
  if (!_recordCacheDisabled_ && _pkIndexCache_[key]) return _pkIndexCache_[key];

  const rows = getAllRecords_(dbId, sheetName);
  const headers = getHeaders_(getSheet_(sheetName, dbId)).map(function (h) { return String(h).trim(); });
  let pkHeader = null;
  headers.forEach(function (h) { if (h.toLowerCase() === pkLc) pkHeader = h; });

  const byPk = indexById(rows, pkHeader || pkColumn || 'id');
  const pks = [];
  rows.forEach(function (r) {
    const raw = pkHeader !== null && r[pkHeader] !== undefined ? r[pkHeader] : r[pkLc];
    const pk = String(raw == null ? '' : raw).trim();
    if (!pk) return;
    pks.push(pk);
  });

  const entry = { rows: rows, byPk: byPk, pks: pks, headers: headers, pkHeader: pkHeader || pkColumn };
  if (!_recordCacheDisabled_) _pkIndexCache_[key] = entry;
  return entry;
}

/**
 * Invalidates one company's cached reference data for one kind. Call this
 * from every add_/edit_/delete_ action that mutates a sheet this helper
 * caches, immediately after the mutation succeeds.
 */
function invalidateRefsCache_(dbId, kind) {
  const key = 'refs_' + String(dbId) + '_' + kind;
  // Remove both forms: the chunked entry written today, and the single-key entry
  // any still-live cache may hold from before Phase 6.
  try { removeChunkedCache_(key); } catch (e) {}
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
}

/**
 * email(lowercased) -> { name, role, company, status } from ERP_Users.
 * Keyed by the authority generation, NOT a TTL: an admin saving a user bumps the
 * generation, so the next request anywhere in the system rebuilds this map.
 *
 * getRefsCached_ chunks, so a large ERP_Users cannot silently blow the ~100KB
 * single-value cap. Do not swap it for a bare cache.put.
 */
function userDirectory_() {
  try {
    return getRefsCached_(CONFIG.AUTH_SPREADSHEET_ID, 'user_dir_g' + authGeneration_(),
      CONFIG.CACHE_USER_DIR_SECONDS, function () {
        var map = {};
        getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users').forEach(function (u) {
          var em = String(u.email || '').trim().toLowerCase();
          if (!em) return;
          map[em] = {
            name:    String(u.name || '').trim(),
            role:    String(u.role || '').trim(),
            company: String(u.company || '').trim(),
            status:  String(u.status == null ? 'Active' : u.status).trim() || 'Active'
          };
        });
        return map;
      }) || {};
  } catch (e) { return {}; }
}

/**
 * Unchanged contract: email(lowercased) -> display name. Now a projection over
 * userDirectory_. Consumed at Code.js:110 — name, signature and return shape
 * are a public contract and do not change.
 *
 * This costs nothing extra: userNameMap_() already read ERP_Users on every page
 * load; the 300s TTL is simply replaced by a generation key on the same read.
 */
function userNameMap_() {
  var dir = userDirectory_(), out = {};
  for (var em in dir) if (dir[em].name) out[em] = dir[em].name;
  return out;
}

// ==========================================
// Versioned cache invalidation
// ==========================================
/**
 * Installable onEdit target. THE SIMPLE TRIGGER onEdit(e) BELOW NEVER FIRES:
 * this is a standalone script (.clasp.json carries a bare scriptId, no
 * container) and simple triggers only run in container-bound projects. Until
 * installTriggers_ creates this trigger, a change typed directly into the AUTH
 * spreadsheet reaches no invalidation at all beyond the staleness ceiling
 * folded into authGeneration_.
 */
function onAuthSheetEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getParent().getId() !== CONFIG.AUTH_SPREADSHEET_ID) return;
    const sheetName = sheet.getName();
    if (sheetName === 'ERP_Users') bumpVersion_('ERP_Users');
    else if (sheetName === 'ERP_Companies') bumpVersion_('ERP_Companies');
    else if (sheetName === 'ERP_Pages_Matrix') bumpVersion_('ERP_Pages_Matrix');
    else if (sheetName === 'ERP_Information') bumpVersion_('ERP_Information');
    else if (sheetName === 'ERP_system_work') bumpVersion_('ERP_system_work');
  } catch (err) { console.error('onAuthSheetEdit failed: ' + err.message); }
}

/** Retained for compatibility. Never fires — see onAuthSheetEdit. */
function onEdit(e) { onAuthSheetEdit(e); }

// ==========================================
// Authority generation (durable, event-driven invalidation)
// ==========================================
var _genMemo_ = null;   // per-execution memo, cleared by resetRecordCache_
var _ksMemo_  = null;   // kill-switch memo, cleared by resetRecordCache_ and by a bump

/**
 * The authority generation. Durable in ScriptProperties, mirrored in
 * CacheService at max TTL, so the steady-state cost is one cache get.
 *
 * NEVER writes to ScriptProperties — only bumpAuthGeneration_ does, and only in
 * response to a real mutation. A fresh deployment with no property set reads '0'
 * and works correctly; the first admin save bootstraps the real stamp.
 *
 * The trailing time bucket is the staleness CEILING: it guarantees that a direct
 * sheet edit made while the onAuthSheetEdit trigger is missing or broken clears
 * within AUTH_STALENESS_CEILING_SECONDS, so the trigger is not load-bearing.
 */
function authGeneration_() {
  if (_genMemo_ !== null) return _genMemo_;
  var base = null;
  try { base = CacheService.getScriptCache().get('erp_gen'); } catch (e) {}
  if (!base) {
    try { base = PropertiesService.getScriptProperties().getProperty('erp_gen'); } catch (e) {}
    if (!base) base = '0';
    try { CacheService.getScriptCache().put('erp_gen', base, 21600); } catch (e) {}
  }
  var ceilSec = Number(CONFIG.AUTH_STALENESS_CEILING_SECONDS) || 300;
  _genMemo_ = base + '.' + Math.floor(new Date().getTime() / (ceilSec * 1000));
  return _genMemo_;
}

/**
 * Invalidate every cached authority payload for every user, everywhere, at once.
 *
 * Order matters: the DURABLE write is the source of truth and goes first. If it
 * fails, the cache mirror gets a 60s TTL instead of 6h, so a later eviction
 * cannot strand readers on a stale Properties generation for six hours.
 */
function bumpAuthGeneration_() {
  var g = String(new Date().getTime());
  var durable = false;
  try {
    PropertiesService.getScriptProperties().setProperty('erp_gen', g);
    durable = true;
  } catch (e) {
    try { console.error('bumpAuthGeneration_: durable write failed — ' + e.message); } catch (e2) {}
  }
  try { CacheService.getScriptCache().put('erp_gen', g, durable ? 21600 : 60); }
  catch (e) { try { CacheService.getScriptCache().remove('erp_gen'); } catch (e2) {} }
  _genMemo_ = null;   // recompute with the new base and the current bucket
  _ksMemo_  = null;   // toggleKillSwitch_ flips the flag AFTER the gate memoised it
}

function bumpVersion_(sheetName) {
  try {
    const cache = CacheService.getScriptCache();
    const now = String(new Date().getTime());
    if (sheetName === 'ERP_Users') cache.put('version_users', now);
    else if (sheetName === 'ERP_Companies') cache.put('version_companies', now);
    else if (sheetName === 'ERP_Pages_Matrix') cache.put('version_matrix', now);
    else if (sheetName === 'ERP_Information') cache.put('version_killswitch', now);
    else if (sheetName === 'ERP_system_work') cache.put('version_killswitch', now);
  } catch (e) {}
  // ERP_Users (role/company/status), ERP_Pages_Matrix (grants) and
  // ERP_system_work / ERP_Information (kill switch) all feed the authority
  // decision. Any of them changing invalidates every cached authority payload.
  // Additive: the per-sheet version keys above stay, because version_companies
  // still has live consumers.
  if (sheetName === 'ERP_Users' || sheetName === 'ERP_Pages_Matrix' ||
      sheetName === 'ERP_Information' || sheetName === 'ERP_system_work') {
    bumpAuthGeneration_();
  }
}

// ==========================================
// Phase 5 — shared totals lib (single source of truth for all companies)
// No rounding applied here: callers preserve existing raw-float behavior.
// Apply round2_/roundQty_ at the display/write layer only, never in here.
// ==========================================
function sharedNum0_(v) { return Math.max(0, Number(v) || 0); }

/** Global compat alias. Per-file num0_ wrappers delegate to sharedNum0_. */
function num0_(v) { return sharedNum0_(v); }

function calcLineNet_(qty, price) { return sharedNum0_(qty) * sharedNum0_(price); }

/**
 * Shared invoice totals. Accepts generic {qty,price,tax,discount} and also
 * TopLight {product_qty,product_price,product_tax,product_discount} shapes.
 * discountPercent (header-level, e.g. TopLight discount_percent) defaults to 0
 * for Valley-style invoices with no header discount.
 * Returns {net,tax,discount,total} with total = net - discount + tax.
 */
function calcTotals_(lines, discountPercent) {
  var dp = sharedNum0_(discountPercent);
  var net = 0, tax = 0, discount = 0;
  (lines || []).forEach(function (l) {
    var qty = (l && l.qty !== undefined) ? l.qty : (l ? l.product_qty : 0);
    var price = (l && l.price !== undefined) ? l.price : (l ? l.product_price : 0);
    var taxRate = (l && l.tax !== undefined) ? l.tax : (l ? l.product_tax : 0);
    var disc = (l && l.discount !== undefined) ? l.discount : (l ? l.product_discount : 0);
    var nv = calcLineNet_(qty, price);
    net += nv;
    discount += sharedNum0_(disc);
    tax += nv * sharedNum0_(taxRate);
  });
  discount += net * dp;
  return { net: net, tax: tax, discount: discount, total: net - discount + tax };
}

/**
 * Shared manufacture total (JS source of truth). Components carry resolved
 * numbers [{qty, unitCost[, mult]}]; the Sheet-formula builder in
 * Company_TopChemical_Actions.js is display-only. mult covers the T×M / T×N
 * movement-part multipliers.
 */
function calcManufactureTotal_(components) {
  var total = 0;
  (components || []).forEach(function (c) {
    var m = (c && c.mult !== undefined && c.mult !== null && c.mult !== '') ? Number(c.mult) : 1;
    if (!isFinite(m)) m = 1;
    var unitCost = (c && c.unitCost !== undefined) ? c.unitCost : (c ? c.price : 0);
    total += calcLineNet_(c ? c.qty : 0, unitCost) * m;
  });
  return total;
}

// ==========================================
// Audit trail helpers (B5) — multi-device sessions + Odoo-style history
// ==========================================
const AUDIT_COLUMNS = ['record_uid', 'created_by', 'created_at', 'updated_by', 'updated_at', 'approved_by', 'approved_at'];

function safeStr_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}

/**
 * Append one ERP_Record_History row per CHANGED business column.
 * `dbId` is the business sheet's spreadsheet; history is ALWAYS stored in the
 * AUTH spreadsheet's ERP_Record_History tab (created by batch1_createSystemSheets).
 * For 'create' logs every business column's new value; for update/approve/delete
 * logs only columns whose old/new differ.
 */
/**
 * The history rows ONE record change would produce. No write, no lock.
 * Split out of logHistory_ so many changes can share a single write — see
 * logHistoryMany_.
 */
function historyRowsFor_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues) {
  const allHeaders = (typeof isSystemTableBackend_ === 'function' && isSystemTableBackend_(dbId, sheetName))
    ? Object.keys(newValues || oldValues || {})
    : getHeaders_(getSheet_(sheetName, dbId)).map(function (h) { return String(h).trim(); });
  const businessHeaders = allHeaders.filter(function (h) {
    const lc = h.toLowerCase();
    return AUDIT_COLUMNS.indexOf(lc) === -1 && lc !== 'id';
  });
  const rows = [];
  businessHeaders.forEach(function (col) {
    const nVal = newValues ? (newValues[col] !== undefined ? newValues[col] : '') : null;
    const oVal = oldValues ? (oldValues[col] !== undefined ? oldValues[col] : '') : null;
    if (action !== 'create' && safeStr_(nVal) === safeStr_(oVal)) return;
    rows.push({
      sheet_name: sheetName,
      record_uid: recordUid,
      record_id: recordId,
      action: action,
      column_name: col,
      old_value: safeStr_(oVal),
      new_value: safeStr_(nVal),
      changed_by: (user && String(user).trim() !== '') ? user : 'System',
      changed_at: new Date(),
      created_at: new Date()
    });
  });
  return rows;
}

/**
 * Audit MANY record changes in one write.
 *
 * logHistory_ already batches the columns of a single record, but calling it in
 * a loop still costs one script lock, one id allocation and one setValues PER
 * ROW — and the lock is the global one every user shares. Saving a 50-line
 * invoice paid that fifty times, on top of writing the lines themselves.
 *
 * `entries` are {dbId, sheetName, recordUid, recordId, user, action, newValues,
 * oldValues}. Identical cell values to N logHistory_ calls, identical ids, in
 * the same order.
 */
function logHistoryMany_(entries) {
  const rows = [];
  (entries || []).forEach(function (e) {
    if (!e) return;
    historyRowsFor_(e.dbId, e.sheetName, e.recordUid, e.recordId, e.user, e.action,
      e.newValues, e.oldValues).forEach(function (r) { rows.push(r); });
  });
  writeHistoryRows_(rows);
}

function logHistory_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues) {
  writeHistoryRows_(historyRowsFor_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues));
}

/* Phase 5 — afterWrite(docType, change): single audit fan-out for the shared
 * save path (saveRecordWithAudit_ / approveRecordWithAudit_). Writes
 * ERP_Record_History old/new via logHistory_ AND a SystemLog entry with
 * RecordID = record_uid, linking SystemLog.RecordID ↔ record_uid.
 * Never throws: audit failure must not fail the save (RT-1b).
 * Per-handler manual logHistory_ calls remain for direct-write paths that do
 * not go through the shared saver; they are compat, not duplicates of this. */
function afterWrite_(docType, change) {
  var c = change || {};
  var dbId = c.dbId || CONFIG.AUTH_SPREADSHEET_ID;
  var sheetName = c.sheetName || docType;
  var recordUid = c.recordUid || '';
  var recordId = (c.recordId !== undefined) ? c.recordId : null;
  var user = c.user || '';
  var action = c.action || 'update';
  var newValues = (c.newValues !== undefined) ? c.newValues : null;
  var oldValues = (c.oldValues !== undefined) ? c.oldValues : null;
  try { logHistory_(dbId, sheetName, recordUid, recordId, user, action, newValues, oldValues); }
  catch (eHist) { try { Logger.log('AUDIT-SKIPPED afterWrite ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
  try {
    var changed = '';
    try { changed = JSON.stringify({ record_uid: recordUid, action: action }); } catch (eJ) { changed = String(recordUid); }
    writeSystemLogLink_(sheetName, recordUid, user, action, changed);
  } catch (eSys) { try { console.error('afterWrite SystemLog link skipped: ' + (eSys && eSys.message)); } catch (e2) {} }
  return { status: 'success', record_uid: recordUid };
}

/* Phase 5 — SystemLog bridge: RecordID is always record_uid so
 * SystemLog.RecordID ↔ ERP_Record_History.record_uid. Defensive: uses the
 * existing SystemLog infra when present, otherwise skips silently. */
function writeSystemLogLink_(table, recordUid, userEmail, action, changedFields) {
  try {
    var logId = (typeof Utilities !== 'undefined' && Utilities.getUuid) ? Utilities.getUuid() : ('log_' + new Date().getTime());
    var values = {
      logid: logId,
      timestamp: new Date(),
      companyid: '',
      companyname: '',
      action: action,
      sourceaction: 'afterWrite:' + String(table || ''),
      recordid: String(recordUid || ''),
      useremail: String(userEmail || ''),
      changedfields: String(changedFields || ''),
      status: 'success',
      errormessage: '',
      table: String(table || ''),
      page: ''
    };
    if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') {
      if (typeof systemCreateRecord_ === 'function') {
        systemCreateRecord_('SystemLog', values, { operationId: 'system-log:' + values.logid });
        return;
      }
    }
    if (typeof ensureSystemLogSheet_ === 'function' && typeof SYSTEM_LOG_HEADERS !== 'undefined') {
      var entry = SYSTEM_LOG_HEADERS.map(function (h) {
        var v = values[String(h).toLowerCase()];
        return (v === undefined || v === null) ? '' : v;
      });
      if (typeof appendRowWithRetry_ === 'function') appendRowWithRetry_(ensureSystemLogSheet_(), entry);
      else ensureSystemLogSheet_().appendRow(entry);
    }
  } catch (e) { try { console.error('writeSystemLogLink_ skipped: ' + (e && e.message)); } catch (e2) {} }
}

/* ══════════════════════════════════════════════════════════════════════════
 * [RT-11] The audit trail comes off the request path
 *
 * A save does not return when the business row is written. It returns when the
 * history has ALSO been written — synchronously, into the shared AUTH
 * spreadsheet, while holding LockService.getScriptLock(), which is SCRIPT
 * GLOBAL. Every save in every company queues behind every other save in the
 * system for its audit write. On an edit touching ten columns that is ten
 * history rows behind one global lock, and the user waits for all of it.
 *
 * writeHistoryRows_ is already well optimised — one lock, one id allocation,
 * one setValues instead of N appends. The remaining cost is not the write. It
 * is the LOCK, and the lock is the part every other user in every other company
 * is waiting on.
 *
 * So the rows are appended to a queue with appendRowWithRetry_, which takes NO
 * script lock and allocates NO ids, and a one-minute trigger does the locking
 * and the id allocation once for everybody.
 *
 * ── WHY A SHEET AND NOT A CACHE ────────────────────────────────────────────
 * Audit rows are the one thing in this programme that may not be lost.
 * CacheService entries can be evicted before their TTL — the comment above the
 * change stamps in this file says so explicitly, and the whole client-side
 * design is built around it. A queue that silently drops audit rows is worse
 * than a slow save, worse than a stale cache, worse than anything else here,
 * because nobody finds out. Telemetry may use a cache; this may not.
 *
 * ── HOW THE DRAIN CANNOT DUPLICATE OR LOSE A ROW ───────────────────────────
 * The drain MARKS rows before it moves them, in three phases:
 *
 *   1. CLAIM   stamp a unique drain id into the claim column of the rows this
 *              run intends to move, and write that stamp. From this moment no
 *              other drain will touch them.
 *   2. WRITE   copy exactly the claimed rows into ERP_Record_History.
 *   3. DELETE  remove the claimed rows from the queue.
 *
 *   2. DEDUPE  drop any claimed row that is ALREADY in ERP_Record_History,
 *              matched on its natural key — record_uid, column_name, action and
 *              changed_at. Only the TAIL of the history sheet is read, because
 *              a row can only be a duplicate candidate if a drain wrote it and
 *              died within the claim-stale window: minutes ago, not days.
 *   4. MARK    stamp the claim as done, in the queue.
 *   5. DELETE  remove the rows from the queue.
 *
 * Every place a trigger can die is covered, and none of them loses or
 * duplicates a row:
 *
 *   died after CLAIM   rows stay claimed and unwritten. The next drain
 *                      re-claims them once the claim goes stale, dedupe finds
 *                      nothing, and they are written. NOTHING LOST.
 *   died after WRITE   rows are in history AND still on the queue. The next
 *                      drain re-claims them, DEDUPE FINDS THEM, and they are
 *                      deleted without being written again. NOTHING DUPLICATED.
 *   died after MARK    rows carry the done mark. The next drain sees it, skips
 *                      the write entirely, and deletes. NOTHING DUPLICATED.
 *
 * The claim id is deliberately NOT written into ERP_Record_History: that
 * sheet's columns are not this work's to change. The natural key does the same
 * job with the columns already there.
 *
 * ── WHAT DOES NOT CHANGE ───────────────────────────────────────────────────
 * What a history row CONTAINS, one row per changed column, the columns of
 * ERP_Record_History, and everything Record_History_Panel reads. The rows put
 * on the queue are exactly the rows historyRowsFor_ produces today. This phase
 * changes WHEN the row is written and nothing else about it.
 * ══════════════════════════════════════════════════════════════════════════ */

var HISTORY_QUEUE_SHEET_ = 'ERP_History_Queue';

/* ERP_Record_History's own columns, plus the three the queue needs to be a
 * queue. The extra three live HERE, in a new sheet; ERP_Record_History's
 * columns are not touched. */
var HISTORY_QUEUE_HEADERS_ = [
  'sheet_name', 'record_uid', 'record_id', 'action', 'column_name',
  'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at',
  'queued_at', 'claim_id', 'claimed_at'
];

/* A claim older than this is assumed to belong to a drain that died. Ten
 * minutes: far longer than a drain takes, far shorter than anyone would wait
 * to find out a row was stuck. */
var HISTORY_CLAIM_STALE_MS_ = 10 * 60 * 1000;

/* A row still queued after this is REPORTED. Never dropped. */
var HISTORY_STALE_REPORT_MS_ = 30 * 60 * 1000;

/** Whether the queue is in use. Off means writeHistoryRows_ behaves as it did. */
var HISTORY_QUEUE_ENABLED_ = true;

function ensureHistoryQueueSheet_() {
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var sh = ss.getSheetByName(HISTORY_QUEUE_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(HISTORY_QUEUE_SHEET_);
    sh.appendRow(HISTORY_QUEUE_HEADERS_);
    sh.setFrozenRows(1);
    noteMutation_(sh);
  }
  return sh;
}

/**
 * Put history rows on the queue. NO script lock, NO id allocation — that is the
 * whole saving, and both of those move to the drain.
 *
 * Returns true when the rows are queued. On ANY failure it returns false and
 * the caller writes them the old way, synchronously: a slow save is a much
 * better outcome than a lost audit row.
 */
function enqueueHistoryRows_(rows) {
  if (!rows || !rows.length) return true;
  try {
    var sh = ensureHistoryQueueSheet_();
    var queuedAt = new Date();
    var matrix = rows.map(function (hr) {
      return HISTORY_QUEUE_HEADERS_.map(function (h) {
        if (h === 'queued_at') return queuedAt;
        if (h === 'claim_id' || h === 'claimed_at') return '';
        var v = hr[h];
        return (v !== undefined && v !== null) ? v : '';
      });
    });
    /* appendRowWithRetry_ takes no script lock. One setValues for the batch,
     * appended at the end, which is the cheapest thing a sheet can be asked to
     * do and is the only sheet work left inside the user's request. */
    sh.getRange(sh.getLastRow() + 1, 1, matrix.length, HISTORY_QUEUE_HEADERS_.length)
      .setValues(matrix);
    noteMutation_(sh);
    return true;
  } catch (e) {
    try { console.error('enqueueHistoryRows_: ' + e.message); } catch (eL) {}
    return false;
  }
}

function enqueueHistoryRowsFirestore_(rows) {
  rows.forEach(function (hr) {
    var required = ['sheet_name', 'record_uid', 'action', 'column_name'];
    var missing = required.filter(function (k) { return hr[k] === undefined || hr[k] === null || String(hr[k]).trim() === ''; });
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
    var natural = [hr.record_uid, hr.column_name, hr.action, hr.changed_at instanceof Date ? hr.changed_at.toISOString() : String(hr.changed_at || '')].join('|');
    var eventId = firestoreOperationId_('history:' + natural);
    systemCreateRecord_('ERP_History_Queue', Object.assign({ event_id: eventId, state: 'pending', attempts: 0, queued_at: new Date(), claim_id: '', claimed_at: null, last_error: '' }, hr), { operationId: 'history-queue:' + eventId });
  });
}

function drainHistoryQueueFirestore_() {
  var claimId = 'fsd_' + new Date().getTime().toString(36) + '_' + Utilities.getUuid().slice(0, 8), now = new Date(), taken = 0, written = 0, deduped = 0, stale = 0;
  var queued = systemStore_().queryAll('ERP_History_Queue', {}).records;
  queued.forEach(function (record) {
    var d = record.data || {}, meta = record.meta || {}, state = String(d.state || 'pending').toLowerCase(), claimedAt = new Date(d.claimed_at || 0).getTime();
    var reclaim = state === 'claimed' && (!isFinite(claimedAt) || now.getTime() - claimedAt > HISTORY_CLAIM_STALE_MS_);
    if (state === 'done' || (state !== 'pending' && !reclaim)) return;
    if (now.getTime() - new Date(d.queued_at || now).getTime() > HISTORY_STALE_REPORT_MS_) stale++;
    var claimed;
    try {
      claimed = systemPatchRecord_('ERP_History_Queue', meta.documentId, { state: 'claimed', claim_id: claimId, claimed_at: now, attempts: (Number(d.attempts) || 0) + 1 }, { expectedUpdateTime: meta.updateTime });
      taken++;
    } catch (claimError) { return; }
    try {
      var history = {};
      ['sheet_name', 'record_uid', 'record_id', 'action', 'column_name', 'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at', 'event_id'].forEach(function (k) { if (d[k] !== undefined) history[k] = d[k]; });
      systemCreateRecord_('ERP_Record_History', history, { operationId: 'history:' + String(d.event_id || '') });
      var done = systemPatchRecord_('ERP_History_Queue', meta.documentId, { state: 'done', processed_at: new Date(), last_error: '' }, { expectedUpdateTime: claimed.meta && claimed.meta.updateTime });
      try { systemRemoveRecord_('ERP_History_Queue', meta.documentId, { expectedUpdateTime: done.meta && done.meta.updateTime }); } catch (removeError) {}
      written++;
    } catch (writeError) {
      try { systemPatchRecord_('ERP_History_Queue', meta.documentId, { state: 'pending', last_error: String(writeError.message || writeError).slice(0, 1000) }, { expectedUpdateTime: claimed.meta && claimed.meta.updateTime }); } catch (retryError) {}
    }
  });
  if (stale) try { console.error('ERP_History_Queue: ' + stale + ' audit row(s) exceeded the stale-report threshold.'); } catch (e) {}
  return { status: 'success', rows: taken, written: written, deduped: deduped, stale: stale, claim: claimId, backend: 'firestore' };
}

/**
 * The drain. One minute, time-driven.
 *
 * Claims, writes, then deletes — see the header for why that order and not
 * another. Runs under the same global lock writeHistoryRows_ used to take, but
 * takes it ONCE for a minute's worth of saves from every company instead of
 * once per save.
 */
function drainHistoryQueue_() {
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') return drainHistoryQueueFirestore_();
  try {
    var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    var sh = ss.getSheetByName(HISTORY_QUEUE_SHEET_);
    if (!sh || sh.getLastRow() < 2) return { status: 'success', rows: 0 };

    var claimId = 'd' + new Date().getTime().toString(36) + Utilities.getUuid().slice(0, 8);
    var now = new Date().getTime();
    var idx = {};
    HISTORY_QUEUE_HEADERS_.forEach(function (h, i) { idx[h] = i; });

    var all = sh.getRange(2, 1, sh.getLastRow() - 1, HISTORY_QUEUE_HEADERS_.length).getValues();

    /* PHASE 1 — CLAIM. Unclaimed rows; rows already marked done by a drain that
     * died before deleting them; and rows whose claim is old enough that the
     * drain holding it must have died. */
    var take = [], alreadyDone = {};
    for (var i = 0; i < all.length; i++) {
      var existing = String(all[i][idx.claim_id] || '').trim();
      if (!existing) { take.push(i); continue; }
      if (existing.indexOf('|done') !== -1) { take.push(i); alreadyDone[i] = true; continue; }
      var at = new Date(all[i][idx.claimed_at]).getTime();
      if (isNaN(at) || (now - at) > HISTORY_CLAIM_STALE_MS_) take.push(i);
    }
    if (!take.length) {
      /* Nothing this drain may touch, but the queue is not empty — every row is
       * freshly claimed by another drain, or something is stuck. This is the
       * only moment worth checking, and it costs one column read. */
      reportStaleHistoryQueue_();
      return { status: 'success', rows: 0 };
    }

    var claimedAt = new Date();
    take.forEach(function (r) {
      if (alreadyDone[r]) return;      /* keep the done mark: it is the evidence */
      sh.getRange(r + 2, idx.claim_id + 1, 1, 2).setValues([[claimId, claimedAt]]);
    });
    noteMutation_(sh);

    /* PHASE 2 — DEDUPE. A drain that died after writing but before deleting
     * left its rows in BOTH places. They are matched on their natural key
     * against the tail of ERP_Record_History. */
    var candidates = take.filter(function (r) { return !alreadyDone[r]; });
    var written = historyTailKeys_(Math.max(candidates.length * 4, 500));
    var toWrite = candidates.filter(function (r) {
      return !written[historyRowKey_({
        record_uid: all[r][idx.record_uid],
        column_name: all[r][idx.column_name],
        action: all[r][idx.action],
        changed_at: all[r][idx.changed_at]
      })];
    });

    /* PHASE 3 — WRITE the survivors, in ERP_Record_History's own column order,
     * with the ids allocated once for the whole batch. */
    if (toWrite.length) {
      var histRows = toWrite.map(function (r) {
        var row = all[r];
        var o = {};
        HISTORY_QUEUE_HEADERS_.forEach(function (h, c) {
          if (h === 'queued_at' || h === 'claim_id' || h === 'claimed_at') return;
          o[h] = row[c];
        });
        return o;
      });
      writeHistoryRowsDirect_(histRows);

      /* PHASE 4 — MARK done, so a death before the delete below costs a skipped
       * write next time rather than a duplicated one. */
      toWrite.forEach(function (r) {
        sh.getRange(r + 2, idx.claim_id + 1).setValue(claimId + '|done');
      });
      noteMutation_(sh);
    }

    /* PHASE 5 — DELETE, bottom-up so the indices stay valid. */
    take.slice().sort(function (a, b) { return b - a; }).forEach(function (r) {
      sh.deleteRow(r + 2);
    });
    noteMutation_(sh);

    return {
      status: 'success', rows: take.length, written: toWrite.length,
      deduped: take.length - toWrite.length, claim: claimId
    };
  } catch (e) {
    try { console.error('drainHistoryQueue_: ' + e.message); } catch (eL) {}
    return { status: 'error', message: e.message };
  }
}

/**
 * Rows that have been on the queue too long. REPORTED, never dropped — a queue
 * that quietly discards is the failure this whole design exists to avoid.
 */
function reportStaleHistoryQueue_() {
  try {
    var sh = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName(HISTORY_QUEUE_SHEET_);
    if (!sh || sh.getLastRow() < 2) return { status: 'success', stale: 0 };
    var col = HISTORY_QUEUE_HEADERS_.indexOf('queued_at') + 1;
    var stamps = sh.getRange(2, col, sh.getLastRow() - 1, 1).getValues();
    var cutoff = new Date().getTime() - HISTORY_STALE_REPORT_MS_;
    var stale = stamps.filter(function (r) {
      var t = new Date(r[0]).getTime();
      return !isNaN(t) && t < cutoff;
    }).length;
    if (stale) {
      try {
        console.error('ERP_History_Queue: ' + stale + ' audit row(s) still queued after ' +
          Math.round(HISTORY_STALE_REPORT_MS_ / 60000) + ' minutes. The drain trigger may not be installed.');
      } catch (eL) {}
    }
    return { status: 'success', stale: stale };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/** The natural key of a history row: what makes two of them the same row. */
function historyRowKey_(r) {
  return [
    String(r.record_uid || ''),
    String(r.column_name || ''),
    String(r.action || ''),
    (r.changed_at instanceof Date) ? r.changed_at.getTime() : String(r.changed_at || '')
  ].join('');
}

/**
 * The natural keys of the last 
` rows of ERP_Record_History, as a lookup.
 *
 * Only the tail, deliberately: this runs every minute and the history sheet
 * grows without bound, so reading it whole would make the drain the expensive
 * thing this work exists to remove. The tail is sufficient because a row can
 * only be a duplicate candidate if some drain wrote it and died within the
 * claim-stale window — minutes ago, not days.
 *
 * A failure here returns an empty lookup, which means nothing is deduped and
 * nothing is lost: the worst case is the duplicate this is trying to avoid,
 * never a missing audit row.
 */
function historyTailKeys_(n) {
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') {
    var fsOut = {};
    try { systemStore_().query('ERP_Record_History', { orderBy: [{ field: 'changed_at', direction: 'DESCENDING' }], limit: n }).records.map(function (r) { return r.data; }).slice(-n).forEach(function (r) { fsOut[historyRowKey_(r)] = true; }); } catch (e) {}
    return fsOut;
  }
  var out = {};
  try {
    var sh = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName('ERP_Record_History');
    if (!sh) return out;
    var last = sh.getLastRow();
    if (last < 2) return out;
    var headers = getHeaders_(sh).map(function (h) { return String(h).trim().toLowerCase(); });
    var take = Math.min(n, last - 1);
    var rows = sh.getRange(last - take + 1, 1, take, headers.length).getValues();
    var ui = headers.indexOf('record_uid');
    var ci = headers.indexOf('column_name');
    var ai = headers.indexOf('action');
    var ti = headers.indexOf('changed_at');
    if (ui === -1 || ci === -1) return out;
    rows.forEach(function (r) {
      out[historyRowKey_({
        record_uid: r[ui], column_name: r[ci],
        action: ai === -1 ? '' : r[ai],
        changed_at: ti === -1 ? '' : r[ti]
      })] = true;
    });
  } catch (e) { /* see above: no tail means no dedupe, never a lost row */ }
  return out;
}

/**
 * [RT-11] The audit write, as the request sees it.
 *
 * It ENQUEUES. That is the whole change: the rows are appended to
 * ERP_History_Queue with no script lock and no id allocation, and the
 * one-minute drain does the locking and the allocating once for everybody.
 * The saving is the LOCK, and the lock is what every other user in every other
 * company was waiting on.
 *
 * If the queue is unavailable for ANY reason — the sheet cannot be created, the
 * append throws, the feature is switched off — this falls straight through to
 * the old synchronous write. A slow save is a much better outcome than a lost
 * audit row, and it is the only trade this function is allowed to make.
 */
function writeHistoryRows_(rows) {
  if (!rows || !rows.length) return;
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') { writeHistoryRowsFirestore_(rows); return; }
  if (HISTORY_QUEUE_ENABLED_ && enqueueHistoryRows_(rows)) return;
  writeHistoryRowsDirect_(rows);
}

function writeHistoryRowsFirestore_(rows) {
  var items = rows.map(function (hr) {
    var required = ['sheet_name', 'record_uid', 'action', 'column_name'];
    var missing = required.filter(function (k) { return hr[k] === undefined || hr[k] === null || String(hr[k]).trim() === ''; });
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
    var eventId = firestoreOperationId_([
      hr.record_uid, hr.column_name, hr.action,
      hr.changed_at instanceof Date ? hr.changed_at.toISOString() : String(hr.changed_at || '')
    ].join('|'));
    return { record: Object.assign({ event_id: eventId }, hr), operationId: 'history:' + eventId };
  });
  var config = systemStorageTarget_(), collection = systemSchema_('ERP_Record_History').collection;
  firestoreCreateDocuments_(config, collection, items);
}

/** The batched write itself — one lock, one id allocation, one setValues.
 *  Unchanged, and still the fallback and the drain's own writer. */
function writeHistoryRowsDirect_(rows) {
  if (!rows || !rows.length) return;
  if (typeof systemStorageTarget_ === 'function' && systemStorageTarget_().backend === 'firestore') { writeHistoryRowsFirestore_(rows); return; }
  const histSheet = getSheet_('ERP_Record_History', CONFIG.AUTH_SPREADSHEET_ID);
  // FAST PATH (batched): identical cell values to N sequential addRecord_ calls,
  // but ONE lock + ONE counter allocation + ONE setValues instead of N locks +
  // N counter R/W + N appends. This is the dominant save-time cost on edits
  // (one history row per changed column).
  var required = ['sheet_name', 'record_uid', 'action', 'column_name'];
  rows.forEach(function (hr) {
    var missing = required.filter(function (k) { return hr[k] === undefined || hr[k] === null || String(hr[k]).trim() === ''; });
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
  });
  executeWithLock_(function () {
    var histHeaders = getHeaders_(histSheet);
    var lower = histHeaders.map(function (h) { return String(h).trim().toLowerCase(); });
    var startId = null;
    if (lower.indexOf('id') !== -1) {
      // Replicates addRecord_'s per-row id assignment with a single allocation
      // (getNextIdBatch_ is lock-reentrant, so nesting here is safe).
      startId = getNextIdBatch_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Record_History', rows.length);
    }
    var matrix = rows.map(function (hr, i) {
      return histHeaders.map(function (h) {
        var key = String(h).trim().toLowerCase();
        if (key === 'id' && startId !== null) return startId + i;
        var v = hr[key];
        return v !== undefined && v !== null ? v : '';
      });
    });
    histSheet.getRange(histSheet.getLastRow() + 1, 1, matrix.length, histHeaders.length).setValues(matrix);
    noteMutation_();
  });
}

/**
 * Stamps audit fields onto a data map ONLY for columns that already exist in the
 * sheet. This prevents the audit trail from creating new columns in business
 * tables. Supported fields: user, created_by, created_at, updated_by,
 * updated_at, approved_by, approved_at, record_uid.
 */
function _stampExistingAuditCols_(sheet, target, stamps) {
  const headers = getHeaders_(sheet).map(function (h) { return String(h).trim().toLowerCase(); });
  function setIf(col, val) {
    if (val !== undefined && headers.indexOf(col.toLowerCase()) !== -1) target[col] = val;
  }
  setIf('user', stamps.user);
  setIf('created_by', stamps.created_by);
  setIf('created_at', stamps.created_at);
  setIf('updated_by', stamps.updated_by);
  setIf('updated_at', stamps.updated_at);
  setIf('approved_by', stamps.approved_by);
  setIf('approved_at', stamps.approved_at);
  setIf('record_uid', stamps.record_uid);
}

/**
 * Create or update a business row AND write its audit history.
 * existingRowId null => create (id assigned by addRecord_). Otherwise update by pkColumn.
 * oldRowByUid (optional) maps pkColumn value -> full record object, used to recover
 * record_uid and old values without an extra read.
 */
function saveRecordWithAudit_(sheetDbId, sheetName, existingRowId, dataMap, action, currentUser, auditCols, requiredFields, oldRowByUid, pkColumn) {
  const dbId = sheetDbId || CONFIG.AUTH_SPREADSHEET_ID;
  const pk = pkColumn || 'id';
  const sheet = getSheet_(sheetName, dbId);
  if (existingRowId == null) {
    const merged = Object.assign({}, dataMap);
    const uid = 'rec_' + Utilities.getUuid();
    _stampExistingAuditCols_(sheet, merged, {
      user: currentUser || '',
      created_by: currentUser || '',
      created_at: new Date(),
      updated_by: currentUser || '',
      updated_at: new Date(),
      approved_by: '',
      approved_at: '',
      record_uid: uid
    });
    const res = addRecord_(dbId, sheetName, merged, requiredFields);
    if (res.status !== 'success') return res;
    /* Phase 5: shared-path audit fan-out — History old/new + SystemLog link (RecordID=record_uid). */
    try { afterWrite_(sheetName, { dbId: dbId, sheetName: sheetName, recordUid: uid, recordId: null, user: currentUser, action: action || 'create', newValues: merged, oldValues: null }); }
    catch (eHist) { try { Logger.log('AUDIT-SKIPPED create ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
    return res;
  }
  let old = oldRowByUid ? (oldRowByUid[String(existingRowId)] || null) : null;
  if (!old) {
    const rows = getAllRecords_(dbId, sheetName);
    old = rows.find(function (r) { return String(r[pk]) === String(existingRowId); }) || null;
  }
  const oldUid = old ? (old.record_uid || ('upd_' + sheetName + '_' + existingRowId)) : ('upd_' + sheetName + '_' + existingRowId);
  const newValues = Object.assign({}, old || {}, dataMap);
  _stampExistingAuditCols_(sheet, newValues, {
    user: currentUser || '',
    updated_by: currentUser || '',
    updated_at: new Date(),
    record_uid: oldUid
  });
  if (pk !== 'id') newValues[pk] = existingRowId;
  var __curVer = checkRowVersion_(old, dataMap && (dataMap.version !== undefined ? dataMap.version : dataMap.Version));
  newValues.version = __curVer + 1;
  const ok = patchRowByCriteria_(sheet, pk, existingRowId, newValues);
  if (!ok) return { status: 'error', message: 'Row not found for update: ' + existingRowId };
  /* [RT-1b] The create branch above has always wrapped logHistory_ and logged
   * AUDIT-SKIPPED; this branch did not, and the difference was a live bug.
   * patchRowByCriteria_ has ALREADY committed the change on the line above, so
   * a history write that throws here turned a successful save into a reported
   * error for a change that is in the sheet.
   *
   * That was merely confusing while the client waited for a server reply. Once
   * the optimistic write rollout lands it is worse: the client rolls the row
   * back off the screen, so the screen and the spreadsheet actively disagree
   * and nobody is told. Hence this ships before that rollout, not after it.
   *
   * The audit row is not discarded quietly — AUDIT-SKIPPED goes to the log with
   * the sheet and the reason, exactly as create does — and the queue work later
   * in this programme removes the failure mode rather than tolerating it.
   *
   * The delete branch is deliberately NOT wrapped: it writes its history row
   * BEFORE deleting, so a throw there leaves the row in the sheet and the
   * reported failure is the truth. Guarding it would delete a row with no
   * audit trail, which is the one outcome worth more than a clean error. */
  try { afterWrite_(sheetName, { dbId: dbId, sheetName: sheetName, recordUid: oldUid, recordId: existingRowId, user: currentUser, action: action || 'update', newValues: newValues, oldValues: old }); }
  catch (eHist) { try { Logger.log('AUDIT-SKIPPED update ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
  return { status: 'success', data: { record: newValues, rowId: existingRowId } };
}

function approveRecordWithAudit_(sheetDbId, sheetName, rowId, approveMap, currentUser, auditCols, requiredFields, oldRowByUid, pkColumn) {
  const dbId = sheetDbId || CONFIG.AUTH_SPREADSHEET_ID;
  const pk = pkColumn || 'id';
  const sheet = getSheet_(sheetName, dbId);
  let old = oldRowByUid ? (oldRowByUid[String(rowId)] || null) : null;
  if (!old) {
    const rows = getAllRecords_(dbId, sheetName);
    old = rows.find(function (r) { return String(r[pk]) === String(rowId); }) || null;
  }
  const oldUid = old ? (old.record_uid || ('upd_' + sheetName + '_' + rowId)) : ('upd_' + sheetName + '_' + rowId);
  const merged = Object.assign({}, old || {}, approveMap);
  _stampExistingAuditCols_(sheet, merged, {
    approved_by: currentUser || '',
    approved_at: new Date(),
    updated_by: currentUser || '',
    updated_at: new Date(),
    record_uid: oldUid
  });
  if (pk !== 'id') merged[pk] = rowId;
  var __curVerAp = checkRowVersion_(old, approveMap && (approveMap.version !== undefined ? approveMap.version : approveMap.Version));
  merged.version = __curVerAp + 1;
  const ok = patchRowByCriteria_(sheet, pk, rowId, merged);
  if (!ok) return { status: 'error', message: 'Row not found for approve: ' + rowId };
  /* [RT-1b] Same asymmetry, same fix, same reason as the update branch below:
   * patchRowByCriteria_ has already committed the approval by the time this
   * line runs, so an audit failure here must not be reported as a failed
   * approve. */
  try { afterWrite_(sheetName, { dbId: dbId, sheetName: sheetName, recordUid: oldUid, recordId: rowId, user: currentUser, action: 'approve', newValues: merged, oldValues: old }); }
  catch (eHist) { try { Logger.log('AUDIT-SKIPPED approve ' + sheetName + ': ' + (eHist && eHist.message)); } catch (eLg) {} }
  return { status: 'success', data: { record: merged, rowId: rowId } };
}

function deleteRecordWithAudit_(sheetDbId, sheetName, rowId, currentUser, auditCols, oldRowByUid, pkColumn) {
  const dbId = sheetDbId || CONFIG.AUTH_SPREADSHEET_ID;
  const pk = pkColumn || 'id';
  const sheet = getSheet_(sheetName, dbId);
  let old = oldRowByUid ? (oldRowByUid[String(rowId)] || null) : null;
  if (!old) {
    const rows = getAllRecords_(dbId, sheetName);
    old = rows.find(function (r) { return String(r[pk]) === String(rowId); }) || null;
  }
  const oldUid = old ? (old.record_uid || ('del_' + sheetName + '_' + rowId)) : ('del_' + sheetName + '_' + rowId);
  logHistory_(dbId, sheetName, oldUid, rowId, currentUser, 'delete', null, old);
  const removed = deleteRowsByCriteria_(sheet, pk, rowId);
  return { status: 'success', removed: removed };
}

/* ══ Phase 6 — approvals as DATA + Valley-parity idempotency guard ═══
 *
 * (1) APPROVAL_CHAINS. Every approval step in the system is one row here:
 *     { docType, step, role, required } plus the write routing the engine
 *     needs (sheet, keyColumn, kind, versioned). ADDING A STEP = ONE TABLE
 *     ROW — e.g. to add a second TopLight sales approver, append
 *       { docType: 'tl_sales', step: 'second', role: 'tl_manager',
 *         required: true, sheet: 'top_light_sales_invoices',
 *         keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true }
 *     and call approveStep_('tl_sales', id, 'second', user, { dbId: dbId }).
 *     There is deliberately NO if/switch on docType anywhere below:
 *     getApprovalChain_/requestApprove_/approveStep_ FILTER this table, and
 *     the column patch is chosen by a map lookup on the row's `kind` field.
 *     If you are about to write `if (docType === ...)` here, add a row
 *     instead. No sheet, column, or migration is involved — this table lives
 *     in code, so approval routing changes without touching data.
 *
 * (2) requestDedupeExecute_ + REQUEST_DEDUPE_PROBE_COLUMNS_. The Valley pattern
 *     (liveDedupe_ on unique_id) as a reusable guard for the TC/TL large
 *     multi-step saves that still mint a fresh id on every call: callers
 *     accept an incoming request_key/unique_id, probe with this helper, and
 *     return the committed row on replay instead of writing a second
 *     document. Probes are null-safe when a column does not exist
 *     (findRowByColumn_ returns null), so no schema change is required.
 */


function companyPolicies_() {
  try { ensureCompaniesRegistered_(); } catch (e) {}
  return Object.keys(COMPANY_REGISTRY || {}).map(function (k) {
    const c = COMPANY_REGISTRY[k] || {};
    return typeof c.approvalPolicy === 'function' ? c.approvalPolicy() : (c.approvalPolicy || {});
  });
}
function approvalChains_() {
  const out = [];
  companyPolicies_().forEach(function (p) { out.push.apply(out, p.chains || []); });
  return out;
}

/* Patch builders keyed by the row's `kind` — a data lookup, not a branch
 * on docType. `standard` mirrors the TL purchase/sales/offer approvers,
 * `cash` mirrors approveCash_ ({approved,user}), `quality` mirrors the
 * Valley quality approver. */
var APPROVAL_PATCH_KINDS_ = {
  standard: function (email) { return { approval_status: 'Approved', approval: email, approval_time: new Date() }; },
  cash: function (email) { return { approved: true, user: email }; },
  quality: function (email) { return { quality_approval_status: 'Approved', quality_approval: email, quality_approval_time: new Date() }; }
};

/* All steps registered for a docType, in table order. Read-only. */
function getApprovalChain_(docType) {
  return approvalChains_().filter(function (r) { return String(r.docType) === String(docType); });
}

/* What must still approve this document — read-only, no write. Clients use
 * it to render approval buttons; the write itself is approveStep_. */
function requestApprove_(docType, id, user, opts) {
  var steps = getApprovalChain_(docType);
  if (!steps.length) throw new Error('Unknown approval docType: ' + docType);
  return {
    status: 'success',
    docType: String(docType),
    id: (id == null ? '' : id),
    requested_by: (user && user.email) || '',
    steps: steps.map(function (s) { return { step: s.step, role: s.role, required: !!s.required }; })
  };
}

/* Advance one table-driven approval step. Resolves sheet/key/patch from the
 * APPROVAL_CHAINS row and delegates the write to the generic stamper
 * approveRecordWithAudit_ — this function contains no per-document logic. */
function approveStep_(docType, id, step, user, opts) {
  var o = opts || {};
  var key = String(id == null ? '' : id).trim();
  if (!key) throw new Error('Approval id is required');
  var entry = null;
  approvalChains_().some(function (r) {
    if (String(r.docType) === String(docType) && String(r.step) === String(step)) { entry = r; return true; }
    return false;
  });
  if (!entry) throw new Error('Unknown approval step: ' + docType + '/' + step);
  var email = (user && user.email) || '';
  var build = APPROVAL_PATCH_KINDS_[String(entry.kind || 'standard')] || APPROVAL_PATCH_KINDS_.standard;
  var approveMap = build(email);
  if (entry.versioned) {
    approveMap.version = (o.version !== undefined ? o.version : o.Version);
  } else {
    /* Unversioned legacy steps (both Valley steps): these approvers never
     * took a client version, so asserting the CURRENT version keeps the
     * shared stamper's check a no-op while the counter still advances —
     * exactly today's behaviour, enforced optimistic locking not added. */
    var db0 = o.dbId || CONFIG.AUTH_SPREADSHEET_ID;
    var old0 = null;
    try {
      old0 = getAllRecords_(db0, entry.sheet).find(function (r) { return String(r[entry.keyColumn]) === String(key); }) || null;
    } catch (eRead) { old0 = null; }
    approveMap.version = getRowVersion_(old0);
  }
  var out = approveRecordWithAudit_(o.dbId, entry.sheet, key, approveMap, email, null, null, null, entry.keyColumn);
  if (!out || out.status !== 'success') {
    /* Preserve each wrapper's legacy not-found message from the row's own
     * `missingMsg` — still data, still no docType branch. */
    var mOut = String((out && out.message) || '');
    if (mOut.indexOf('Row not found') !== -1) throw new Error(entry.missingMsg || ('Row not found for approve: ' + key));
    throw new Error(mOut || (entry.missingMsg || 'Approve failed'));
  }
  return out;
}

/* Columns probed, in order, by requestDedupeExecute_. Documents intent only:
 * findRowByColumn_ returns null for a column a sheet does not have, so
 * sheets without request_key simply skip that probe — no migration.
 * NOTE: formerly named requestGuardExecute_/REQUEST_RECEIPT_HEADERS_, which
 * collided with the receipt-ledger guard of the same names in Code.js (one
 * global scope: the last definition silently won and the 4-arg probe call
 * sites received the wrong function). Renamed so each guard resolves
 * deterministically. */
var REQUEST_DEDUPE_PROBE_COLUMNS_ = ['request_key', 'unique_id', 'invoice_unique_id', 'created_at', 'user'];

/* Valley-parity exactly-once guard for queueable multi-step saves.
 * Query form requestDedupeExecute_(dbId, sheet, requestKey, uniqueId) returns
 * the already-committed row or null. Wrap form with a trailing fn executes
 * fn() once per key and returns liveDedupeReply_ on replay. */
function requestDedupeExecute_(dbId, sheetName, requestKey, uniqueId, fn) {
  var key = String(requestKey == null ? '' : requestKey).trim() || String(uniqueId == null ? '' : uniqueId).trim();
  var dup = null;
  if (key) {
    try { dup = liveDedupe_(dbId, sheetName, key); } catch (e1) { dup = null; }
    if (!dup) { try { dup = findRowByColumn_(dbId, sheetName, 'request_key', key); } catch (e2) { dup = null; } }
    if (!dup) { try { dup = findRowByColumn_(dbId, sheetName, 'invoice_unique_id', key); } catch (e3) { dup = null; } }
  }
  if (typeof fn === 'function') {
    if (dup) return liveDedupeReply_(dup);
    return fn();
  }
  return dup;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Phase 2 — central document status machine + pre-write validation gate.
 * Static only: no migration, no backfill, no data changes. Existing statuses
 * in sheets are untouched; this only gates FUTURE transitions/validations.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * DOC_STATUS_TRANSITIONS covers (keys lowercased; lookup is case-insensitive):
 *   tl_purchasing / tl_sales / tl_offer : Pending->Approved, Approved terminal
 *   tl_cash (approved bool)             : false->true, true terminal (one-way)
 *   tc_legal_cash (toggle)              : false<->true (both ways)
 *   vf_purchasing (dual legs)           : Pending->Approved each, Approved terminal;
 *                                         edit-blocked if either leg Approved —
 *                                         enforced via pseudo-target 'edit'
 *                                         (Pending->edit allowed, Approved->edit blocked)
 *   vf_mfg_order                        : Draft->In Progress->Locked->In Progress
 *   vf_mfg_agree                        : draft/active/completed + *->cancelled,
 *                                         cancelled terminal
 *   vf_sales_inv                        : Pending<->Approved + Approved delete-block —
 *                                         enforced via pseudo-target 'delete'
 *                                         (Pending->delete allowed, Approved->delete blocked)
 *   att_batch                           : active->reverted, reverted terminal
 *   payroll_month                       : open->closed, closed terminal (via insert)
 *
 * Pseudo-targets 'edit'/'delete' are NOT sheet values; they let edit/delete
 * guards route through the same table instead of keeping inline if(cur...) checks.
 */
function policyStatusTransitions_() {
  const out = {};
  companyPolicies_().forEach(function (p) { Object.keys(p.transitions || {}).forEach(function (k) { out[k] = p.transitions[k]; }); });
  return out;
}

function normDocStatus_(v) {
  if (v === true) return 'true';
  if (v === false) return 'false';
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === 'true' || s === 'false') return s;
  return s;
}

function normDocType_(docType) {
  let dt = String(docType == null ? '' : docType).trim().toLowerCase();
  companyPolicies_().some(function (p) {
    const aliases = p.aliases || {};
    if (aliases[dt]) { dt = aliases[dt]; return true; }
    return false;
  });
  return dt;
}

/* Bool-returning gate. Unknown docType -> false (fail-closed). */
function canTransition(docType, from, to) {
  var dt = normDocType_(docType);
  var table = policyStatusTransitions_()[dt];
  if (!table) return false;
  var f = normDocStatus_(from);
  var t = normDocStatus_(to);
  var allowed = table[f];
  if (!allowed) return false;
  for (var i = 0; i < allowed.length; i++) {
    if (String(allowed[i]).toLowerCase() === t) return true;
  }
  return false;
}

/* Throwing helper. Throws on illegal transition; returns true otherwise.
 * A refused transition is a deterministic pre-mutation check, so the error is
 * marked notApplied: the request-guard ledger records a confirmed failure
 * (safe to correct and retry), never an uncertain outcome. */
function assertTransition_(docType, from, to, message) {
  if (!canTransition(docType, from, to)) {
    var _err = new Error(message || ('Invalid status transition: ' + docType + ' ' + from + ' -> ' + to));
    _err.notApplied = true; _err.code = 'REQUEST_NOT_APPLIED';
    throw _err;
  }
  return true;
}

/* ── validateBeforeWrite wiring ──────────────────────────────────────────
 * DOC_ACTION_TO_DOCTYPE_ maps module_action (lowercased) -> docType for the
 * Phase 2 commit paths. STATUS_ONLY_ACTIONS_ marks approve_/toggle_/cancel_/
 * revert_/close_/delete_ paths as status-only: they explicitly SKIP field
 * validation (documented choice) because their payloads carry only an id/code
 * + version, not header+lines. They remain gated on status via
 * canTransition/assertTransition_ in their handlers. Field validation runs
 * only on add_/edit_/save_ paths via registered validators (no logic duplicated
 * here — DOC_VALIDATORS_ entries call the existing company validators).
 */
function policyActionMap_() {
  const out = {};
  companyPolicies_().forEach(function (p) { Object.keys(p.actionToDocType || {}).forEach(function (k) { out[k] = p.actionToDocType[k]; }); });
  return out;
}

function policyStatusOnly_() {
  const out = {};
  companyPolicies_().forEach(function (p) { Object.keys(p.statusOnly || {}).forEach(function (k) { out[k] = true; }); });
  return out;
}

var DOC_VALIDATORS_ = {};

function registerDocValidator_(docType, fn) {
  DOC_VALIDATORS_[normDocType_(docType)] = fn;
}

function docTypeForAction_(action) {
  return policyActionMap_()[String(action == null ? '' : action).trim().toLowerCase()] || null;
}

function isStatusOnlyAction_(action) {
  return !!policyStatusOnly_()[String(action == null ? '' : action).trim().toLowerCase()];
}

/* Central field-validation gate. docType + payload (full {module_action,data}
 * or raw data) + dbId. Status-only actions skip field validation explicitly;
 * all other known docTypes delegate to registered company validators. Unknown
 * docTypes / reads pass through. Validation errors are marked notApplied (safe
 * to correct and retry — thrown before any mutation). */
function validateBeforeWrite(docType, payload, dbId) {
  var action = null;
  var data = payload;
  if (payload && typeof payload === 'object' && ('module_action' in payload || 'data' in payload)) {
    action = payload.module_action || null;
    data = (payload.data !== undefined ? payload.data : payload);
  }
  if (!docType && action) docType = docTypeForAction_(action);
  if (action && isStatusOnlyAction_(action)) return true;
  var dt = docType ? normDocType_(docType) : (action ? normDocType_(docTypeForAction_(action) || '') : '');
  if (!dt) return true;
  var fn = DOC_VALIDATORS_[dt];
  if (typeof fn !== 'function') return true;
  try {
    fn(data, dbId);
  } catch (e) {
    if (e && e.notApplied === undefined) { try { e.notApplied = true; } catch (e2) {} }
    throw e;
  }
  return true;
}



/* ===================== 4. SECURITY / AUTHORIZATION ===================== */
/**
 * shared Code.js section
 * RESPONSIBILITY: hashPassword_ (salted), generateSalt_, session auth
 * (versioned cache), login lockout, role/permission matrix,
 * checkPageAccess_, checkPageAccessForUI_, getCompanySpreadsheetId_,
 * getCompanyThemeCSS_. No business logic. Loaded fourth.
 */

// ==========================================
// Password hashing (salted SHA-256)
// ==========================================
function generateSalt_() { return Utilities.getUuid(); }

function hashPassword_(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password, Utilities.Charset.UTF_8);
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function generateSecureToken_() { return Utilities.getUuid() + Utilities.getUuid(); }

// The deployed script loads the Firestore repository before this file. These
// compatibility wrappers keep the existing isolated verifier and explicit
// Sheets rollback path usable when the repository layer is not loaded.
function systemRowsCompat_(tableName) {
  if (typeof systemGetAllRecords_ === 'function') return systemGetAllRecords_(tableName);
  try {
    const legacyRows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, tableName);
    // The verifier's legacy stub only implements ERP_Users. For other tables,
    // retain the old direct-sheet behavior when that stub returns an empty set.
    if (legacyRows && (legacyRows.length || tableName === 'ERP_Users')) return legacyRows;
  } catch (e) {}
  try {
    const sheet = getSheet_(tableName, CONFIG.AUTH_SPREADSHEET_ID);
    const headers = getHeaders_(sheet);
    const values = sheet.getDataRange().getValues();
    return values.slice(1).filter(function (row) {
      return row.some(function (value) { return value !== '' && value !== null && value !== undefined; });
    }).map(function (row) {
      const record = {};
      headers.forEach(function (header, index) { record[String(header).trim().toLowerCase()] = row[index]; });
      return record;
    });
  } catch (e2) { return []; }
}
function systemFindCompat_(tableName, fieldName, value) {
  if (typeof systemFindByBusinessKey_ === 'function') return systemFindByBusinessKey_(tableName, fieldName, value);
  const wanted = String(value == null ? '' : value).trim().toLowerCase();
  return systemRowsCompat_(tableName).find(function (row) {
    return String(row[fieldName] == null ? '' : row[fieldName]).trim().toLowerCase() === wanted;
  }) || null;
}
function storagePatchCompat_(tableName, fieldName, value, changes) {
  if (typeof systemPatchByBusinessKey_ === 'function') return systemPatchByBusinessKey_(tableName, fieldName, value, changes);
  return patchRowByCriteria_(getSheet_(tableName, CONFIG.AUTH_SPREADSHEET_ID), fieldName, value, changes);
}
function storagePatchFieldsCompat_(tableName, filters, changes) {
  if (typeof systemPatchByFields_ === 'function') return systemPatchByFields_(tableName, filters, changes);
  if (!filters || !filters.length) return false;
  return patchRowByCriteria_(getSheet_(tableName, CONFIG.AUTH_SPREADSHEET_ID), filters[0].field, filters[0].value, changes);
}

// ==========================================
// Login lockout (5 failures -> 15 minutes)
// ==========================================
function checkLoginLockout_(email) {
  const n = Number(CacheService.getScriptCache().get('fail_' + email) || 0);
  if (n >= CONFIG.LOGIN_LOCKOUT_MAX_ATTEMPTS) {
    throw new Error('Too many attempts. Try again in 15 minutes.');
  }
}

function recordLoginFailure_(email) {
  const cache = CacheService.getScriptCache();
  cache.put('fail_' + email, String(Number(cache.get('fail_' + email) || 0) + 1), CONFIG.LOGIN_LOCKOUT_TTL_SECONDS);
}

function clearLoginFailures_(email) {
  CacheService.getScriptCache().remove('fail_' + email);
}

// ==========================================
// Login / first-time password setup
// ==========================================
function loginUser_(payload, sessionToken, authUser) {
  if (!payload || !payload.email) throw new Error('البريد الإلكتروني مطلوب');
  const email = String(payload.email).trim().toLowerCase();
  checkLoginLockout_(email);

  const rows = systemRowsCompat_('ERP_Users');
  const userRow = rows.find(function (r) { return String(r.email || '').trim().toLowerCase() === email; });
  if (!userRow) throw new Error('البريد الإلكتروني غير مسجل في النظام');
  const currentStatus = String(userRow.status || 'active').trim().toLowerCase();
  if (currentStatus !== 'active') throw new Error('هذا الحساب غير مفعل، يرجى مراجعة الإدارة');

  const assignedCompany = String(userRow.company || '').trim();
  const assignedRole = String(userRow.role || '').trim();
  if (assignedCompany) assertCompanyEnabled_(assignedCompany);
  else if (!/super\s*admin/i.test(assignedRole)) throw new Error('الحساب غير مرتبط بشركة مفعلة، يرجى مراجعة الإدارة');

  const storedHash = String(userRow.passwordhash || '').trim();
  if (storedHash === '') {
    clearLoginFailures_(email);
    return { status: 'setup_required', email: email };
  }

  if (!payload.password) throw new Error('كلمة المرور مطلوبة');
  const salt = String(userRow.salt || '').trim();
  const loginHash = hashPassword_(payload.password, salt);
  if (loginHash !== storedHash) {
    recordLoginFailure_(email);
    throw new Error('بيانات الدخول غير صحيحة');
  }

  clearLoginFailures_(email);
  const token = generateSecureToken_();
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIG.SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  storagePatchCompat_('ERP_Users', 'email', email, { sessiontoken: token, sessionexpiry: expires, updated_at: now });
  bumpVersion_('ERP_Users');

  return {
    status: 'success',
    token: token,
    user: {
      email: email,
      name: userRow.name || '',
      role: userRow.role || '',
      company: userRow.company || ''
    }
  };
}

function setupFirstTimePassword_(payload, sessionToken, authUser) {
  const p = payload || {};
  const email = String(p.email || '').trim().toLowerCase();
  const code = String(p.verificationCode || '').replace(/\s/g, '');
  const password = String(p.password || '');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('البريد الإلكتروني غير صالح');
  if (!/^\d{6}$/.test(code)) throw new Error('أدخل رمز التحقق المكوّن من 6 أرقام');
  if (password.length < 8 || password.length > 256) throw new Error('كلمة المرور يجب أن تكون بين 8 و256 حرفاً');

  const cache = CacheService.getScriptCache();
  const cacheKey = passwordSetupKey_(email);
  const challenge = cache.get('pwsetup_code_' + cacheKey);
  if (!challenge) throw new Error('انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً.');
  const attemptsKey = 'pwsetup_attempts_' + cacheKey;
  const attempts = Number(cache.get(attemptsKey) || 0);
  if (attempts >= 5) {
    cache.remove('pwsetup_code_' + cacheKey);
    throw new Error('تم تجاوز عدد المحاولات. اطلب رمز تحقق جديداً.');
  }
  cache.put(attemptsKey, String(attempts + 1), 600);
  if (!passwordSetupConstantTimeEqual_(challenge, hashPassword_(code, email))) {
    if (attempts + 1 >= 5) cache.remove('pwsetup_code_' + cacheKey);
    throw new Error('رمز التحقق غير صحيح');
  }

  const userRow = findPasswordSetupUser_(email);
  if (!userRow) throw new Error('تعذر التحقق من الحساب. راجع مسؤول النظام.');
  if (String(userRow.status || 'active').trim().toLowerCase() !== 'active') {
    cache.remove('pwsetup_code_' + cacheKey);
    throw new Error('هذا الحساب غير مفعل، يرجى مراجعة الإدارة');
  }
  const company = String(userRow.company || '').trim();
  const role = String(userRow.role || '').trim();
  if (company) assertCompanyEnabled_(company);
  else if (!/super\s*admin/i.test(role)) throw new Error('الحساب غير مرتبط بشركة مفعلة، يرجى مراجعة الإدارة');
  if (String(userRow.passwordhash || '').trim()) {
    cache.remove('pwsetup_code_' + cacheKey);
    throw new Error('تم تعيين كلمة مرور لهذا الحساب بالفعل. سجل الدخول أو تواصل مع مسؤول النظام.');
  }

  const salt = generateSalt_();
  const changes = {
    passwordhash: hashPassword_(password, salt),
    salt: salt,
    sessiontoken: '',
    sessionexpiry: '',
    updated_at: new Date()
  };
  if (userRow._meta && userRow._meta.documentId) {
    systemPatchRecord_('ERP_Users', userRow._meta.documentId, changes,
      { expectedUpdateTime: userRow._meta.updateTime });
  } else {
    storagePatchCompat_('ERP_Users', 'email', email, changes);
  }
  bumpVersion_('ERP_Users');
  cache.remove('pwsetup_code_' + cacheKey);
  cache.remove(attemptsKey);
  cache.remove('pwsetup_cooldown_' + cacheKey);
  return { status: 'success', user: { email: email, name: userRow.name || '', role: role, company: company } };
}

function passwordSetupKey_(email) {
  return requestGuardHash_(String(email || '').trim().toLowerCase()).slice(0, 40);
}

function findPasswordSetupUser_(email) {
  const exact = systemFindByBusinessKey_('ERP_Users', 'email', email);
  if (exact) return exact;
  return systemRowsCompat_('ERP_Users').find(function (row) {
    return String(row.email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase();
  }) || null;
}

function passwordSetupConstantTimeEqual_(left, right) {
  left = String(left || ''); right = String(right || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function requestFirstTimePasswordCode_(payload) {
  const email = String(payload && payload.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 'sent' };
  const cache = CacheService.getScriptCache();
  const key = passwordSetupKey_(email);
  const cooldownKey = 'pwsetup_cooldown_' + key;
  const countKey = 'pwsetup_count_' + key;
  const userRow = findPasswordSetupUser_(email);
  let codeToSend = '';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('تعذر بدء طلب التحقق الآن. حاول بعد قليل.');
  try {
    if (cache.get(cooldownKey)) throw new Error('انتظر دقيقة قبل طلب رمز تحقق آخر');
    const count = Number(cache.get(countKey) || 0);
    if (count >= 5) throw new Error('تم تجاوز عدد طلبات التحقق لهذا الحساب. حاول لاحقاً.');
    cache.put(cooldownKey, '1', 60);
    cache.put(countKey, String(count + 1), 21600);
  } finally {
    lock.releaseLock();
  }

  if (userRow && String(userRow.status || 'active').trim().toLowerCase() === 'active' &&
      !String(userRow.passwordhash || '').trim()) {
    const company = String(userRow.company || '').trim();
    const role = String(userRow.role || '').trim();
    if (!company && !/super\s*admin/i.test(role)) return { status: 'sent' };
    if (company) {
      try { assertCompanyEnabled_(company); } catch (disabledCompany) { return { status: 'sent' }; }
    }
    const digits = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    codeToSend = String((parseInt(digits, 16) % 900000) + 100000);
    cache.put('pwsetup_code_' + key, hashPassword_(codeToSend, email), 600);
    cache.put('pwsetup_attempts_' + key, '0', 600);
  }
  if (codeToSend) {
    try {
      MailApp.sendEmail(email, 'رمز إنشاء كلمة مرور النظام',
        'رمز التحقق الخاص بإنشاء كلمة مرورك هو: ' + codeToSend + '\n\nتنتهي صلاحية الرمز خلال 10 دقائق. إذا لم تطلبه، تجاهل هذه الرسالة.');
    } catch (mailError) {
      cache.remove('pwsetup_code_' + key);
      cache.remove('pwsetup_attempts_' + key);
      throw new Error('تعذر إرسال رمز التحقق الآن. تواصل مع مسؤول النظام.');
    }
  }
  return { status: 'sent' };
}

// ==========================================
// Session authentication + live identity overlay
// SessionManager_.validate answers "is this token a live session" and is
// correctly cached for the session's full lifetime. Authority must NOT inherit
// that lifetime, so the live identity is overlaid on top of it here.
// ==========================================
function authenticateSystemUser_(sessionToken) {
  if (!sessionToken) return { status: 'error', authorized: false };
  const v = SessionManager_.validate(sessionToken);
  if (!v.valid) return { status: 'error', authorized: false };

  // The session row denormalises role/company at login and sess_<hash> holds it
  // for the session's full 12-hour lifetime. Authority must not inherit that: a
  // role change, a company move or a deactivation has to bite on the user's next
  // request. userDirectory_ is generation-keyed, so an admin's save invalidates
  // it for every user at once.
  const email = String(v.email || '').trim().toLowerCase();
  const dir = userDirectory_();
  const dirLoaded = Object.keys(dir).length > 0;
  const live = dir[email] || null;

  // FAIL-OPEN on a read failure, FAIL-CLOSED on a real absence. An empty map is
  // indistinguishable from a transient read error, so it must not log everyone
  // out at once; a POPULATED map that lacks this email means the user was
  // removed. The two directions are not stylistic — do not unify them.
  if (dirLoaded && !live) return { status: 'error', authorized: false, code: 'ACCOUNT_REMOVED' };
  if (live && String(live.status).toLowerCase() !== 'active') {
    return { status: 'error', authorized: false, code: 'ACCOUNT_DISABLED' };
  }

  const role    = (live && live.role)    ? live.role    : v.role;
  const company = (live && live.company) ? live.company : v.company;
  const name    = (live && live.name)    ? live.name    : v.name;

  const isSuperAdmin = /super\s*admin/i.test(String(role || ''));
  if (company) {
    try {
      assertCompanyEnabled_(company);
    } catch (companyErr) {
      return { status: 'error', authorized: false, code: 'COMPANY_DISABLED' };
    }
  } else if (!isSuperAdmin) {
    return { status: 'error', authorized: false, code: 'COMPANY_DISABLED' };
  }
  const userObj = {
    email: v.email,
    name: name,
    role: role,
    company: company,
    companyId: company,
    isSuperAdmin: isSuperAdmin,
    authorizedPages: isSuperAdmin ? ['*'] : getRoleAuthorityMatrix_(role),
    expires: v.expires
  };
  return { status: 'success', authorized: true, user: userObj };
}

// ==========================================
// Multi-device session manager (B4)
// Sessions live in the AUTH spreadsheet's ERP_Sessions tab; tokens are stored
// ONLY as SHA-256 hashes. Caching keyed by hash is script-global.
// ==========================================
var SessionManager_ = (function () {
  function hashToken_(token) {
    if (!token) return '';
    const salt = CONFIG.SESSION_SALT || 'erp-salt-2024';
    const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + token, Utilities.Charset.UTF_8);
    return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  }
  function readRows_(sheetName) { return getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, sheetName); }

  function create(email, name, role, company, deviceId, deviceName, maxConcurrent) {
    return executeWithLock_(function () {
      const max = Number(maxConcurrent) || Number(CONFIG.MAX_CONCURRENT_SESSIONS) || 5;
      const token = generateSecureToken_();
      const hash = hashToken_(token);
      const now = new Date();
      const expires = new Date(now.getTime() + CONFIG.SESSION_EXPIRY_HOURS * 3600 * 1000);
      const devRows = readRows_('ERP_User_Devices');
      const deviceRec = devRows.find(function (d) { return d.email === email && d.device_id === deviceId; });
      if (!deviceRec) {
        addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_User_Devices', {
          email: email, device_id: deviceId, device_name: deviceName, first_seen: now, last_seen: now
        }, ['email', 'device_id']);
      } else {
        storagePatchFieldsCompat_('ERP_User_Devices', [{ field: 'email', value: email }, { field: 'device_id', value: deviceId }], { device_name: deviceName, last_seen: now });
      }
      const sessions = readRows_('ERP_Sessions').filter(function (s) { return s.email === email && !s.revoked; });
      if (sessions.length >= max) {
        sessions.sort(function (a, b) {
          return new Date(a.last_activity || a.created_at || 0) - new Date(b.last_activity || b.created_at || 0);
        });
        const toRevoke = sessions.slice(0, sessions.length - max + 1);
        toRevoke.forEach(function (s) {
          storagePatchCompat_('ERP_Sessions', 'token_hash', s.token_hash, { revoked: true, revoked_at: now });
        });
      }
      addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Sessions', {
        token_hash: hash, email: email, name: name, role: role, company: company,
        device_id: deviceId, device_name: deviceName, created_at: now, last_activity: now,
        expires_at: expires, revoked: false
      }, ['token_hash', 'email']);
      const cache = CacheService.getScriptCache();
      try {
        cache.put('sess_' + hash, JSON.stringify({
          email: email, name: name, role: role, company: company, expires: expires.toISOString()
        }), Math.max(1, Math.floor((expires - now) / 1000)));
      } catch (e) {}
      return { token: token, token_hash: hash, expires_at: expires, device_id: deviceId };
    });
  }

  function validate(token) {
    if (!token) return { valid: false };
    const hash = hashToken_(token);
    const cache = CacheService.getScriptCache();
    try {
      const cached = cache.get('sess_' + hash);
      if (cached) {
        const obj = JSON.parse(cached);
        if (new Date(obj.expires) > new Date()) return Object.assign({ valid: true }, obj);
        cache.remove('sess_' + hash);
      }
    } catch (e) {}
    try {
      const rows = readRows_('ERP_Sessions');
      const s = rows.find(function (r) { return r.token_hash === hash && !r.revoked; });
      if (!s) return { valid: false };
      if (new Date(s.expires_at) < new Date()) {
        storagePatchCompat_('ERP_Sessions', 'token_hash', hash, { revoked: true, revoked_at: new Date() });
        return { valid: false };
      }
      const identity = {
        email: s.email, name: s.name, role: s.role, company: s.company,
        expires: new Date(s.expires_at).toISOString()
      };
      const exp = new Date(s.expires_at);
      try {
        cache.put('sess_' + hash, JSON.stringify(identity), Math.max(1, Math.floor((exp - new Date()) / 1000)));
      } catch (e) {}
      return Object.assign({ valid: true }, identity);
    } catch (e) { return { valid: false }; }
  }

  /**
   * F-07. Writing last_activity costs a full getDataRange().getValues() plus a
   * setValues on ERP_Sessions — on the shared AUTH spreadsheet, once per active
   * user, contending with every other user's session validation. The throttle
   * moved from a hardcoded 30s to CONFIG.SESSION_TOUCH_THROTTLE_SECONDS (300s),
   * cutting those writes roughly 10x.
   *
   * Only the freshness of a "last seen" timestamp changes. Session lifetime,
   * expiry and revocation are unaffected: validate() checks expires_at, which is
   * set at login and never derived from last_activity.
   */
  function touch(token) {
    if (!token) return;
    const hash = hashToken_(token);
    const cache = CacheService.getScriptCache();
    try {
      if (cache.get('touch_' + hash)) return;
      cache.put('touch_' + hash, '1', CONFIG.SESSION_TOUCH_THROTTLE_SECONDS);
    } catch (e) {}
    try {
      storagePatchCompat_('ERP_Sessions', 'token_hash', hash, { last_activity: new Date() });
    } catch (e) {}
  }

  function revoke(tokenHash) {
    return executeWithLock_(function () {
      const ok = storagePatchCompat_('ERP_Sessions', 'token_hash', tokenHash, { revoked: true, revoked_at: new Date() });
      try { CacheService.getScriptCache().remove('sess_' + tokenHash); } catch (e) {}
      return ok;
    });
  }

  function revokeAllForUser(email) {
    return executeWithLock_(function () {
      const rows = readRows_('ERP_Sessions').filter(function (s) { return s.email === email && !s.revoked; });
      rows.forEach(function (s) {
        storagePatchCompat_('ERP_Sessions', 'token_hash', s.token_hash, { revoked: true, revoked_at: new Date() });
        try { CacheService.getScriptCache().remove('sess_' + s.token_hash); } catch (e) {}
      });
      return rows.length;
    });
  }

  function listSessions(email) {
    return readRows_('ERP_Sessions')
      .filter(function (s) { return s.email === email && !s.revoked; })
      .map(function (s) {
        return {
          token_hash: s.token_hash, device_name: s.device_name, device_id: s.device_id,
          created_at: s.created_at, last_activity: s.last_activity
        };
      });
  }

  return {
    hashToken_: hashToken_, create: create, validate: validate, touch: touch,
    revoke: revoke, revokeAllForUser: revokeAllForUser, listSessions: listSessions
  };
})();

function readMaxConcurrent_(email) {
  try {
    const row = systemFindCompat_('ERP_Users', 'email', String(email).trim().toLowerCase());
    if (row && row.max_concurrent_sessions) {
      const n = Number(row.max_concurrent_sessions);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch (e) {}
  return Number(CONFIG.MAX_CONCURRENT_SESSIONS) || 5;
}

function handleLoginWithDevice_(payload) {
  if (!payload || !payload.email) throw new Error('البريد الإلكتروني مطلوب');
  const lr = loginUser_(payload, null, null);
  if (lr.status === 'setup_required') return lr;
  if (lr.status !== 'success') throw new Error(lr.message || 'فشل تسجيل الدخول');
  const email = lr.user.email;
  const maxConcurrent = readMaxConcurrent_(email);
  const deviceId = (payload.deviceId && String(payload.deviceId).trim()) || ('dev_' + Utilities.getUuid());
  const deviceName = (payload.deviceName && String(payload.deviceName).trim()) || 'جهاز غير معروف';
  const session = SessionManager_.create(email, lr.user.name, lr.user.role, lr.user.company, deviceId, deviceName, maxConcurrent);
  return {
    status: 'success',
    token: session.token,
    user: lr.user,
    device_id: session.device_id,
    requires_device_name: !payload.deviceName,
    session_expires_at: session.expires_at
  };
}

function handleRequestPasswordSetupCode_(payload) {
  return requestFirstTimePasswordCode_(payload || {});
}

function handleSetupWithDevice_(payload) {
  const sr = setupFirstTimePassword_(payload, null, null);
  return sr;
}

// ==========================================
// Role / permission matrix (authority-generation cache)
// The key embeds authGeneration_(), so an admin save, a direct sheet edit with
// the onAuthSheetEdit trigger installed, or the staleness ceiling all invalidate
// it. CACHE_MATRIX_SECONDS is now only an occupancy ceiling, not the mechanism.
// The role is normalised into the key, which also collapses the duplicate
// entries the old key produced for roles differing only by case;
// _hasUnifiedAccess_ already lowercases, so no lookup semantics change.
// ==========================================
function getRoleAuthorityMatrix_(userRole) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'mx_g' + authGeneration_() + '_' + String(userRole || '').trim().toLowerCase();
  try {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (cacheErr) {}

  try {
    const rows = systemRowsCompat_('ERP_Pages_Matrix');
    // An empty or structurally incomplete matrix is a read/contract failure:
    // fail closed for authority and do not cache the empty result.
    if (!rows.length || !Object.prototype.hasOwnProperty.call(rows[0], 'role') ||
        !Object.prototype.hasOwnProperty.call(rows[0], 'page_id')) return {};
    const allowedPages = {};
    const lowerUserRole = String(userRole || '').trim().toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (String(r.role).trim().toLowerCase() === lowerUserRole &&
          String(r.status || 'active').trim().toLowerCase() === 'active') {
        const rowPage = String(r.page_id || '').trim();
        let rowAccess = String(r.access_type || 'read').trim().toLowerCase();
        // normalize full-access variants: "full access", "full_access", "fullaccess", "full"
        rowAccess = rowAccess.replace(/[_\s]+/g, ' ').trim();
        if (rowAccess === 'full' || rowAccess === 'full access') rowAccess = 'full';
        // keep read/write/full canonical
        if (['read','write','full'].indexOf(rowAccess) === -1) rowAccess = 'read';
        if (!allowedPages[rowPage]) allowedPages[rowPage] = [];
        if (!allowedPages[rowPage].includes(rowAccess)) allowedPages[rowPage].push(rowAccess);
      }
    }

    try { cache.put(cacheKey, JSON.stringify(allowedPages), CONFIG.CACHE_MATRIX_SECONDS); } catch (putErr) {}
    return allowedPages;
  // Read failure: FAIL CLOSED and, deliberately, DO NOT CACHE. Same reason as
  // the structural bail above.
  } catch (e) { return {}; }
}

// ==========================================
// Unified authority (single source of truth)
// view = see page/nav/data read  -> any grant (read/write/full)
// add  = create new record       -> write or full
// edit/delete family              -> full only (write does NOT imply edit/delete)
// Hierarchy: full ⊇ write ⊇ read  (full satisfies all, write satisfies view+add)
// ==========================================
function _normalizeAccess_(a) {
  let s = String(a || '').trim().toLowerCase().replace(/[_\s]+/g, ' ').trim();
  if (s === 'full' || s === 'full access') return 'full';
  if (s === 'read' || s === 'view') return 'read';
  if (s === 'write' || s === 'add') return 'write';
  if (s === 'delete' || s === 'edit' || s === 'update' || s === 'remove' || s === 'toggle' || s === 'close' || s === 'make') return s;
  return s || 'read';
}
function _hasUnifiedAccess_(grants, required) {
  if (!grants || !grants.length) return false;
  const need = _normalizeAccess_(required);
  const lowerGrants = grants.map(g => _normalizeAccess_(g));
  if (need === 'read' || need === 'view') return lowerGrants.includes('read') || lowerGrants.includes('write') || lowerGrants.includes('full');
  if (need === 'write' || need === 'add') return lowerGrants.includes('write') || lowerGrants.includes('full');
  if (need === 'full') return lowerGrants.includes('full');
  // edit/delete family
  if (['edit','delete','update','remove','toggle','close','make'].indexOf(need) !== -1) return lowerGrants.includes('full');
  // fallback exact
  return lowerGrants.includes(need);
}
function unifiedCheck_(authUser, companyName, pageId, requiredAccess) {
  if (!authUser) return false;
  if (authUser.isSuperAdmin) return true;
  // company isolation except global pages handled by caller
  if (companyName && authUser.company !== companyName) return false;
  if (!pageId) return false;
  const grants = authUser.authorizedPages && authUser.authorizedPages[pageId];
  if (!grants || !grants.length) return false;
  if (!requiredAccess) return true; // view if any grant
  return _hasUnifiedAccess_(grants, requiredAccess);
}

// ==========================================
// System kill switch (ERP_system_work sheet)
// Contract: B1 = header «on_off», B2 = 1 (system works) / 0 (system closed).
// C2/D2 hold updated_at/updated_by audit stamps (informational only).
// Fail-open: if the sheet or B2 is missing/unreadable, the system is ENABLED.
// Recovery when closed is ALWAYS via editing B2 directly in the sheet — the
// app itself cannot flip it once blocked (apiRouter gate precedes auth).
// That direct edit is caught by the INSTALLABLE onAuthSheetEdit trigger, which
// bumps the authority generation and re-enables on the next request. The simple
// onEdit(e) in shared Code.js section has never fired: this is a standalone script and
// simple triggers only run in container-bound projects. With the installable
// trigger missing, recovery is bounded by AUTH_STALENESS_CEILING_SECONDS.
// ==========================================
function ensureSystemWorkSheet_() {
  if (typeof systemFindFlagRecord_ === 'function') return systemFindFlagRecord_();
  const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ERP_system_work');
  if (!sheet) {
    sheet = ss.insertSheet('ERP_system_work');
    noteMutation_();
    sheet.getRange('B1').setValue('on_off');
    sheet.getRange('C1').setValue('updated_at');
    sheet.getRange('D1').setValue('updated_by');
    sheet.getRange('B2').setValue(1);
    noteMutation_();
  }
  return sheet;
}

/** Raw read of the B2 flag. Returns 1/0 as number, or null when unreadable/empty. */
function readSystemWorkFlag_(sheet) {
  const v = sheet && sheet.data ? sheet.data.on_off : (sheet && typeof sheet.getRange === 'function' ? sheet.getRange('B2').getValue() : null);
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!isNaN(n) && String(v).trim() !== '') return n;
  const s = String(v).trim().toLowerCase();
  if (s === 'false') return 0;
  if (s === 'true') return 1;
  return null;
}

/**
 * Cached kill-switch read, keyed by the authority GENERATION ('ks_g<gen>').
 *
 * The old key was versioned by 'version_killswitch', bumped by the simple
 * onEdit trigger — which never fires in a standalone script, so a direct B2
 * edit was rescued only by the 15s TTL. Now toggleKillSwitch_ (via bumpVersion_)
 * and the installable onAuthSheetEdit trigger both bump the generation, and
 * authGeneration_'s time bucket caps staleness at AUTH_STALENESS_CEILING_SECONDS
 * even if the trigger is missing. The TTL is no longer the mechanism.
 */
function isSystemEnabled_() {
  try {
    if (_ksMemo_ !== null) return _ksMemo_;
    const cache = CacheService.getScriptCache();
    const key = 'ks_g' + authGeneration_();
    let cached = null;
    try { cached = cache.get(key); } catch (cacheErr) {}
    if (cached !== null && cached !== undefined) { _ksMemo_ = (cached === 'true'); return _ksMemo_; }

    let enabled = true; // fail-open default
    let readOk = true;
    try {
      const flagRecord = ensureSystemWorkSheet_();
      const flag = readSystemWorkFlag_(flagRecord);
      if (flag === 0) enabled = false;
    } catch (readErr) { enabled = true; readOk = false; }

    // A FAILED read must not earn the long TTL — caching a fail-open default for
    // six hours would hide a real shutdown.
    try {
      cache.put(key, enabled ? 'true' : 'false',
        readOk ? CONFIG.CACHE_KILLSWITCH_SECONDS : CONFIG.CACHE_AUTH_FAILREAD_SECONDS);
    } catch (putErr) {}
    _ksMemo_ = enabled;
    return enabled;
  } catch (e) {
    return true;
  }
}

// ==========================================
// Page access checks — wrappers over unifiedCheck_
// ==========================================
function checkPageAccess_(authUser, companyName, pageId, requiredAccess) {
  if (authUser && authUser.isSuperAdmin) return true;
  function deny_(reason) {
    try { console.warn('[DENY] checkPageAccess_ email=' + (authUser && authUser.email) + ' company=' + companyName + ' page=' + pageId + ' need=' + requiredAccess + ' reason=' + reason + ' grants=' + (authUser && authUser.authorizedPages && authUser.authorizedPages[pageId] ? authUser.authorizedPages[pageId].join(',') : '')); } catch(e){}
    throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  }
  // company isolation
  if (companyName && authUser && authUser.company !== companyName) return deny_('company_mismatch expected=' + (authUser && authUser.company) + ' got=' + companyName);
  if (!pageId) return deny_('no_pageId');
  const need = _normalizeAccess_(requiredAccess || 'read');
  if (!unifiedCheck_(authUser, companyName || (authUser && authUser.company), pageId, need)) {
    // distinguish no-grant vs wrong level for logs
    const grants = authUser && authUser.authorizedPages && authUser.authorizedPages[pageId];
    if (!grants || !grants.length) return deny_('no_page_grant');
    return deny_('missing_access_type need=' + need + ' have=' + grants.join(','));
  }
  return true;
}

function checkPageAccessForUI_(authUser, pageId) {
  // L2 ROUTE + L1 NAV gate — fail-closed, unified (view = any grant)
  if (pageId === 'ERPDashboard') return true;
  if (pageId === 'ERP_Management') {
    return !!(authUser.isSuperAdmin || String(authUser.role || '').toLowerCase() === 'admin');
  }
  if (['user_sessions', 'user_views', 'record_history'].indexOf(pageId) !== -1) return true;
  if (authUser.isSuperAdmin) return true;
  if (!authUser.company || !COMPANY_REGISTRY[authUser.company]) return false;
  const companyPages = COMPANY_REGISTRY[authUser.company].pages || [];
  const companyPageIds = companyPages.map(p => p.action);
  if (!companyPageIds.includes(pageId)) return false;
  // dashboard view requires at least Read (any grant) — unified: assigned => see, write => add, full => edit/delete
  const allowed = unifiedCheck_(authUser, authUser.company, pageId, 'read');
  if (!allowed) { try { console.warn('[DENY-UI] email='+(authUser&&authUser.email)+' page='+pageId); } catch(e){} }
  return allowed;
}

/** Helper for §5.3: returns first authorized page action for user's company, or '' if none. */
function getFirstAuthorizedPageForUser_(authUser) {
  if (!authUser || !authUser.company || !COMPANY_REGISTRY[authUser.company]) return '';
  const pages = COMPANY_REGISTRY[authUser.company].pages;
  for (let i = 0; i < pages.length; i++) {
    // Skip permission tokens — a registry entry with no template is not a
    // navigable page (valley_cost_view). Landing a user on one would send them
    // to an action the router deliberately refuses to render.
    if (!pages[i].template) continue;
    const pid = pages[i].action;
    if (authUser.isSuperAdmin) return pid;
    if (unifiedCheck_(authUser, authUser.company, pid, 'read')) return pid;
  }
  return '';
}

// ==========================================
// Company lookup helpers
// ==========================================
function companyRecord_(companyName) {
  if (!companyName) throw new Error('Company name is required to fetch spreadsheet ID.');
  const wanted = String(companyName).trim().toLowerCase();
  const rows = systemRowsCompat_('ERP_Companies');
  const companyRow = rows.find(function (r) {
    return [r.company_unique_id, r.company_name_ar, r.company_name_en].some(function (v) {
      return String(v || '').trim().toLowerCase() === wanted;
    });
  });
  if (!companyRow) throw new Error('Company "' + companyName + '" not found in ERP_Companies.');

  const enabledRaw = String(companyRow.enabled == null ? '' : companyRow.enabled).trim().toLowerCase();
  /* Legacy company rows predate the enabled toggle and therefore contain an
   * empty cell. Preserve their pre-existing availability; only an explicit
   * false/disabled value blocks a company. The admin UI now writes TRUE/FALSE
   * for all later changes. */
  const enabled = ['false', '0', 'no', 'disabled', 'inactive'].indexOf(enabledRaw) === -1;
  if (companyRow.company_sheet_link === undefined) throw new Error("Database Error: 'company_sheet_link' column missing.");
  const rawLink = String(companyRow.company_sheet_link).trim();
  const spreadsheetId = rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/) ? rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/)[1] : rawLink;
  return { enabled: enabled, spreadsheetId: spreadsheetId, uid: String(companyRow.company_unique_id || companyName).trim() };
}

function assertCompanyEnabled_(companyName) {
  const record = companyRecord_(companyName);
  if (!record.enabled) throw new Error('هذه الشركة غير مفعلة حالياً.');
  return record;
}

function getCompanySpreadsheetId_(companyName) {
  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'company_spreadsheet_v_' + compVersion + '_' + companyName;
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.enabled && parsed.spreadsheetId) return parsed.spreadsheetId;
    }
  } catch (cacheErr) {}

  const record = assertCompanyEnabled_(companyName);
  try { cache.put(cacheKey, JSON.stringify(record), CONFIG.CACHE_GENERAL_SECONDS); } catch (putErr) {}
  return record.spreadsheetId;
}

// ==========================================
// Phase 3: central dbId resolution + tenant assertion
// Single source of truth for which spreadsheet a company request may touch.
// resolveDbId_ derives the tenant from identity (a super-admin may target
// payload.target_system; everyone else is pinned to their own company) and
// asserts the result matches that company's spreadsheet. assertDbIdBelongsToCompany_
// is the Valley-style double-check reused by dispatch_ layers.
// ==========================================
function assertDbIdBelongsToCompany_(dbId, company) {
  if (!company) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  if (!dbId || String(dbId) !== String(getCompanySpreadsheetId_(company))) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  return String(dbId);
}

function resolveDbId_(authUser, payload) {
  if (!authUser) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  if (authUser.isSuperAdmin) {
    const target = payload && payload.target_system;
    if (!target) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    const dbId = getCompanySpreadsheetId_(target);
    return assertDbIdBelongsToCompany_(dbId, target);
  }
  const company = authUser.company;
  if (!company) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  if (payload && payload.target_system && payload.target_system !== company) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  const dbId = getCompanySpreadsheetId_(company);
  return assertDbIdBelongsToCompany_(dbId, company);
}

// ==========================================
// Dashboard data — assigned company only, unassigned sees all (no schema change)
// ==========================================
function getDashboardData_(payload, sessionToken, authUser) {
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
  const hasCompany = String(authUser.company || '').trim() !== '';
  const normCompany = String(authUser.company || '').trim().toLowerCase();
  const companies = rows
    .filter(r => {
      const enabled = String(r.enabled == null ? '' : r.enabled).trim().toLowerCase();
      const isEnabled = ['false', '0', 'no', 'disabled', 'inactive'].indexOf(enabled) === -1;
      return isEnabled &&
        (authUser.isSuperAdmin || !hasCompany || String(r.company_unique_id || '').trim().toLowerCase() === normCompany);
    })
    .map(r => {
      const isReady = !!COMPANY_REGISTRY[r.company_unique_id];
      return {
        unique_id: r.company_unique_id,
        name_ar: r.company_name_ar,
        name_en: r.company_name_en,
        logo_url: r.company_logo ? driveDirectImageUrl_(String(r.company_logo), 300) : '',
        main_page: isReady ? COMPANY_REGISTRY[r.company_unique_id].pages[0].action : null,
        is_ready: isReady
      };
    });
  return { status: 'success', user: authUser, companies: companies };
}

function driveDirectImageUrl_(fileId, width) {
  const w = width || 300;
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + w;
}

// Company logo thumbnail URL (from ERP_Companies.company_logo) for a company page.
// F-08: this was the one ERP_Companies reader with no cache — a full
// getDataRange().getValues() on every page render — while both of its siblings
// (getCompanySpreadsheetId_, getCompanyThemeCSS_) are version-cached. Same
// version_companies pattern applied here, so bumpVersion_('ERP_Companies')
// already invalidates it along with the others.
function getCompanyLogoUrl_(companyName) {
  if (!companyName) return '';
  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'company_logo_v_' + compVersion + '_' + companyName;
  try {
    const cached = cache.get(cacheKey);
    if (cached !== null && cached !== undefined) return cached === '\u0000' ? '' : cached;
  } catch (cacheErr) {}
  const url = getCompanyLogoUrlUncached_(companyName);
  try { cache.put(cacheKey, url === '' ? '\u0000' : url, CONFIG.CACHE_LOGO_SECONDS); } catch (putErr) {}
  return url;
}

function getCompanyLogoUrlUncached_(companyName) {
  try {
    const row = systemFindCompat_('ERP_Companies', 'company_unique_id', String(companyName).trim());
    if (!row) return '';
    const logoId = String(row.company_logo || '').trim();
    return logoId ? driveDirectImageUrl_(logoId, 200) : '';
  } catch (e) { return ''; }
}



/* ===================== 5. ADMINISTRATION / GENERIC THEMES ============== */
/**
 * shared Code.js section
 * RESPONSIBILITY: Super-admin handlers for the control plane:
 *   companies CRUD (with 'enabled' toggle), users CRUD (with password reset),
 *   roles matrix CRUD.
 * No routing here — handlers are wired into Code.js ROUTES. Every handler
 * re-checks isSuperAdmin server-side (never trusts the client).
 */

function requireSuperAdmin_(authUser) {
  if (!authUser || !authUser.isSuperAdmin) throw new Error('Access Denied: Super admin only.');
}

function adminListCompanies_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
  return { status: 'success', companies: rows };
}

function adminSaveCompany_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const p = payload || {};
  let uid = String(p.company_unique_id || '').trim();
  const nameAr = String(p.company_name_ar || '').trim();
  const nameEn = String(p.company_name_en || '').trim();
  const link = String(p.company_sheet_link || '').trim();
  if (!nameAr) throw new Error('الاسم العربي مطلوب');
  if (!uid) uid = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  if (!/^[a-zA-Z0-9_-]+$/.test(uid)) throw new Error('المعرف يجب أن يكون أحرفاً لاتينية وأرقاماً فقط');

  const existingRow = systemFindByBusinessKey_('ERP_Companies', 'company_unique_id', uid);

  const enabled = p.enabled === true || String(p.enabled).trim().toLowerCase() === 'true';
  const fields = {
    company_unique_id: uid,
    company_name_ar: nameAr,
    company_name_en: nameEn,
    company_sheet_link: link,
    company_colors: String(p.company_colors || ''),
    company_logo: String(p.company_logo || ''),
    company_main_page: String(p.company_main_page || ''),
    enabled: enabled ? 'TRUE' : 'FALSE',
    updated_at: new Date()
  };

  if (existingRow) {
    systemPatchRecord_('ERP_Companies', existingRow._meta.documentId, fields, { expectedUpdateTime: existingRow._meta.updateTime });
    bumpVersion_('ERP_Companies');
    return { status: 'success', message: 'تم تحديث الشركة', company: fields };
  }

  systemAddRecordCompat_('ERP_Companies', Object.assign({ id: systemNextNumericId_('ERP_Companies', 'id'), created_at: new Date() }, fields), ['company_unique_id', 'company_name_ar']);
  bumpVersion_('ERP_Companies');
  return { status: 'success', message: 'تمت إضافة الشركة', company: fields };
}

function adminListUsers_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users');
  const roles = [];
  const seen = {};
  rows.forEach(u => {
    const r = String((u.role == null) ? '' : u.role).trim();
    if (r && !seen[r]) { seen[r] = true; roles.push(r); }
  });
  const companies = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({
    value: String(c.company_unique_id || '').trim(),
    label: String(c.company_name_ar || c.company_name_en || c.company_unique_id || '').trim()
  })).filter(c => c.value);
  return { status: 'success', users: rows, role_options: roles, company_options: companies };
}

/**
 * Add a user, or (if password supplied) reset an existing user's password with
 * a fresh salt. New users must receive an administrator-controlled password;
 * public first-time claiming by known email is intentionally disabled.
 */
function adminSaveUser_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const p = payload || {};
  const email = String(p.email || '').trim().toLowerCase();
  const name = String(p.name || '').trim();
  const role = String(p.role || '').trim() || 'User';
  const company = String(p.company || '').trim();
  const status = String(p.status || 'Active').trim();
  const isActive = status.toLowerCase() === 'active' ? 'Active' : 'InActive';
  if (!email || !name) throw new Error('الاسم والبريد الإلكتروني مطلوبان');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('بريد إلكتروني غير صالح');

  const existing = systemFindByBusinessKey_('ERP_Users', 'email', email);

  if (!existing && !(p.resetPassword && String(p.resetPassword).trim())) {
    throw new Error('يجب على مسؤول النظام تعيين كلمة مرور مبدئية للمستخدم الجديد.');
  }

  const base = {
    name: name,
    email: email,
    role: role,
    company: company,
    status: isActive,
    updated_at: new Date()
  };

  if (p.resetPassword && String(p.resetPassword).trim()) {
    const salt = generateSalt_();
    base['passwordhash'] = hashPassword_(String(p.resetPassword), salt);
    base['salt'] = salt;
    base['sessiontoken'] = '';
    base['sessionexpiry'] = '';
  }

  if (existing) {
    systemPatchRecord_('ERP_Users', existing._meta.documentId, base, { expectedUpdateTime: existing._meta.updateTime });
    bumpVersion_('ERP_Users');
    return { status: 'success', message: 'تم تحديث المستخدم', user: { email: email, name: name, role: role, company: company, status: isActive } };
  }

  systemAddRecordCompat_('ERP_Users',
    Object.assign({ id: systemNextNumericId_('ERP_Users', 'id'), created_at: new Date(), sessiontoken: '', sessionexpiry: '', passwordhash: '', salt: '' }, base),
    ['name', 'email', 'role']);
  bumpVersion_('ERP_Users');
  return { status: 'success', message: 'تمت إضافة المستخدم', user: { email: email, name: name, role: role, company: company, status: isActive } };
}

function adminListMatrix_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const matrix = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Pages_Matrix');
  const pages = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_System_Pages');
  const users = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users');
  const companyOptions = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({ value: String(c.company_unique_id || '').trim(), label: String(c.company_name_ar || c.company_name_en || c.company_unique_id || '').trim() })).filter(c => c.value);
  const userRoles = users.map(u => ({
    role: String(u.role == null ? '' : u.role).trim(),
    company: String(u.company == null ? '' : u.company).trim()
  })).filter(u => u.role);
  const roles = [];
  const seen = {};
  userRoles.forEach(u => {
    if (!seen[u.role]) { seen[u.role] = true; roles.push(u.role); }
  });
  return {
    status: 'success',
    matrix: matrix,
    pages: pages,
    roles: roles,
    user_roles: userRoles,
    company_options: companyOptions,
    module_options: ['HR', 'Finance', 'Warehouse', 'Production', 'Quality', 'Sales', 'Supply Chain', 'Tax System', 'General', 'Top Management']
  };
}

/**
 * Bulk save of a role's page assignments. Upserts by (role, page_id): inserts a
 * new row (16-char UUID) when missing, updates only changed columns otherwise.
 */
function adminSaveMatrix_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const p = payload || {};
  const role = String(p.role || '').trim();
  const assignments = Array.isArray(p.assignments) ? p.assignments : [];
  if (!role) throw new Error('الدور مطلوب');
  if (!assignments.length) throw new Error('لا توجد صلاحيات للحفظ');

  if (systemStorageTarget_().backend === 'firestore') {
    var matrixRows = systemGetAllRecords_('ERP_Pages_Matrix'), addedFs = 0, updatedFs = 0, skippedFs = 0;
    assignments.forEach(function (a) {
      var pageIdFs = String(a.page_id || '').trim(); if (!pageIdFs) return;
      var accessFs = String(a.access_type || 'Read').trim();
      var statusFs = String(a.status || 'Active').trim() === 'Active' ? 'Active' : 'InActive';
      var foundFs = systemFindByFields_('ERP_Pages_Matrix', [{ field: 'role', value: role }, { field: 'page_id', value: pageIdFs }]);
      if (!foundFs) {
        systemCreateRecord_('ERP_Pages_Matrix', { erp_pages_matrix_unique_id: Utilities.getUuid().replace(/-/g, '').slice(0, 16), role: role, page_id: pageIdFs, access_type: accessFs, status: statusFs, user: authUser ? authUser.email : '', created_at: new Date() }, { operationId: 'matrix:' + role + ':' + pageIdFs });
        addedFs++;
      } else if (String(foundFs.access_type || '').trim() !== accessFs || String(foundFs.status || '').trim() !== statusFs) {
        systemPatchRecord_('ERP_Pages_Matrix', foundFs._meta.documentId, { access_type: accessFs, status: statusFs, user: authUser ? authUser.email : '' }, { expectedUpdateTime: foundFs._meta.updateTime });
        updatedFs++;
      } else skippedFs++;
    });
    bumpVersion_('ERP_Pages_Matrix');
    return { status: 'success', message: 'تم حفظ الصلاحيات', added: addedFs, updated: updatedFs, skipped: skippedFs };
  }

  const sheet = getSheet_('ERP_Pages_Matrix', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const rowData = data.slice(1);
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const roleIdx = idx('role');
  const pageIdx = idx('page_id');
  const accessIdx = idx('access_type');
  const statusIdx = idx('status');
  const uidIdx = idx('erp_pages_matrix_unique_id');
  const userIdx = idx('user');
  const createdIdx = idx('created_at');
  if (roleIdx === -1 || pageIdx === -1) throw new Error('ERP_Pages_Matrix missing role/page_id columns');

  const existingMap = {};
  rowData.forEach((r, i) => {
    const rl = String(r[roleIdx]).trim().toLowerCase();
    const pg = String(r[pageIdx]).trim().toLowerCase();
    if (rl && pg) existingMap[rl + '|' + pg] = i + 2;
  });

  let added = 0, updated = 0, skipped = 0;
  assignments.forEach(a => {
    const pageId = String(a.page_id || '').trim();
    if (!pageId) return;
    const accessType = String(a.access_type || 'Read').trim();
    const status = String(a.status || 'Active').trim() === 'Active' ? 'Active' : 'InActive';
    const key = role.toLowerCase() + '|' + pageId.toLowerCase();
    const rowNum = existingMap[key];
    if (!rowNum) {
      const rowValues = headers.map(() => '');
      const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };
      set('erp_pages_matrix_unique_id', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
      set('role', role);
      set('page_id', pageId);
      set('access_type', accessType);
      set('status', status);
      set('user', authUser ? authUser.email : '');
      set('created_at', new Date());
      sheet.appendRow(rowValues);
      noteMutation_();
      existingMap[key] = sheet.getLastRow();
      added++;
    } else {
      const existing = data[rowNum - 1];
      const curAccess = accessIdx !== -1 ? String(existing[accessIdx]).trim() : '';
      const curStatus = statusIdx !== -1 ? String(existing[statusIdx]).trim() : '';
      if (curAccess !== accessType || curStatus !== status) {
        const uidVal = uidIdx !== -1 ? existing[uidIdx] : '';
        const updates = {};
        if (accessIdx !== -1) updates['access_type'] = accessType;
        if (statusIdx !== -1) updates['status'] = status;
        if (userIdx !== -1) updates['user'] = authUser ? authUser.email : '';
        if (uidIdx !== -1 && String(uidVal).trim() !== '') {
          patchRowByCriteria_(sheet, 'erp_pages_matrix_unique_id', uidVal, updates);
        }
        updated++;
      } else {
        skipped++;
      }
    }
  });
  bumpVersion_('ERP_Pages_Matrix');
  return { status: 'success', message: 'تم حفظ الصلاحيات', added: added, updated: updated, skipped: skipped };
}

/* =========================================
 * System Pages — list + bulk upsert (dedup by page_id)
 * ========================================= */
function adminListPages_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const systemPages = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_System_Pages');
  const allPages = getAllPages_().map(p => ({ page_id: p.action, title: p.title || p.action, label: p.label || '' }));
  const companyOptions = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({ value: String(c.company_unique_id || '').trim(), label: String(c.company_name_ar || c.company_name_en || c.company_unique_id || '').trim() })).filter(c => c.value);
  return {
    status: 'success',
    system_pages: systemPages,
    all_pages: allPages,
    company_options: companyOptions,
    module_options: ['HR', 'Finance', 'Warehouse', 'Production', 'Quality', 'Sales', 'Supply Chain', 'Tax System', 'General', 'Top Management']
  };
}

function adminSavePages_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const pages = Array.isArray(payload && payload.pages) ? payload.pages : [];
  if (!pages.length) throw new Error('لا توجد صفحات للحفظ');

  if (systemStorageTarget_().backend === 'firestore') {
    var pageRowsFs = systemGetAllRecords_('ERP_System_Pages'), addedPagesFs = 0, updatedPagesFs = 0, skippedPagesFs = 0;
    pages.forEach(function (p) {
      var pageFs = String(p.page_id || '').trim(); if (!pageFs) return;
      var foundPageFs = systemFindByBusinessKey_('ERP_System_Pages', 'page_id', pageFs);
      var changesPageFs = { page_name: String(p.page_name || '').trim(), page_module: String(p.page_module || '').trim(), page_company: String(p.page_company || '').trim() };
      if (!foundPageFs) { systemCreateRecord_('ERP_System_Pages', Object.assign({ page_id: pageFs }, changesPageFs), { operationId: 'page:' + pageFs }); addedPagesFs++; }
      else if (String(foundPageFs.page_name || '') !== changesPageFs.page_name || String(foundPageFs.page_module || '') !== changesPageFs.page_module || String(foundPageFs.page_company || '') !== changesPageFs.page_company) { systemPatchRecord_('ERP_System_Pages', foundPageFs._meta.documentId, changesPageFs, { expectedUpdateTime: foundPageFs._meta.updateTime }); updatedPagesFs++; }
      else skippedPagesFs++;
    });
    bumpVersion_('ERP_Pages_Matrix');
    return { status: 'success', message: 'تم حفظ الصفحات', added: addedPagesFs, updated: updatedPagesFs, skipped: skippedPagesFs };
  }

  const sheet = getSheet_('ERP_System_Pages', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const rowData = data.slice(1);
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const pageIdIdx = idx('page_id');
  const nameIdx = idx('page_name');
  const moduleIdx = idx('page_module');
  const companyIdx = idx('page_company');
  if (pageIdIdx === -1) throw new Error('ERP_System_Pages missing page_id column');

  const existingMap = {};
  rowData.forEach((r, i) => {
    const pid = String(r[pageIdIdx]).trim().toLowerCase();
    if (pid) existingMap[pid] = i + 2;
  });

  let added = 0, updated = 0, skipped = 0;
  pages.forEach(p => {
    const pageId = String(p.page_id || '').trim();
    if (!pageId) return;
    const name = String(p.page_name || '').trim();
    const module = String(p.page_module || '').trim();
    const company = String(p.page_company || '').trim();
    const rowNum = existingMap[pageId.toLowerCase()];
    if (!rowNum) {
      const rowValues = headers.map(() => '');
      const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };
      set('page_id', pageId);
      set('page_name', name);
      set('page_module', module);
      set('page_company', company);
      sheet.appendRow(rowValues);
      noteMutation_();
      existingMap[pageId.toLowerCase()] = sheet.getLastRow();
      added++;
    } else {
      const existing = data[rowNum - 1];
      const curName = nameIdx !== -1 ? String(existing[nameIdx]).trim() : '';
      const curModule = moduleIdx !== -1 ? String(existing[moduleIdx]).trim() : '';
      const curCompany = companyIdx !== -1 ? String(existing[companyIdx]).trim() : '';
      if (curName !== name || curModule !== module || curCompany !== company) {
        const updates = {};
        if (nameIdx !== -1) updates['page_name'] = name;
        if (moduleIdx !== -1) updates['page_module'] = module;
        if (companyIdx !== -1) updates['page_company'] = company;
        patchRowByCriteria_(sheet, 'page_id', pageId, updates);
        updated++;
      } else {
        skipped++;
      }
    }
  });
  bumpVersion_('ERP_Pages_Matrix');
  return { status: 'success', message: 'تم حفظ الصفحات', added: added, updated: updated, skipped: skipped };
}

/* =========================================
 * Currency — list / add / update / delete (GOOGLEFINANCE rate)
 * ========================================= */
function adminListCurrency_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_currency_exchange');
  return { status: 'success', currencies: rows };
}

function setRateFormula_(sheet, headers, rowNum) {
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const currencyIdx = idx('currency');
  const rateIdx = idx('rate');
  if (currencyIdx === -1 || rateIdx === -1) return;
  const colLetter = function (ci) {
    let s = ''; let n = ci + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  const B = colLetter(currencyIdx);
  sheet.getRange(rowNum, rateIdx + 1).setFormula(
    '=IF(' + B + rowNum + '="EGP", 1, GOOGLEFINANCE("CURRENCY:" & ' + B + rowNum + ' & "EGP"))');
  noteMutation_();
}

function adminSaveCurrency_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const currency = String((payload && payload.currency) || '').trim().toUpperCase();
  if (!currency) throw new Error('العملة مطلوبة');

  if (systemStorageTarget_().backend === 'firestore') {
    var existingCurrencyFs = systemFindByBusinessKey_('ERP_currency_exchange', 'currency', currency);
    var suppliedRateFs = payload && payload.rate !== undefined && payload.rate !== '' ? Number(payload.rate) : null;
    if (currency === 'EGP') suppliedRateFs = 1;
    if (suppliedRateFs !== null && (!isFinite(suppliedRateFs) || suppliedRateFs <= 0)) throw new Error('سعر الصرف غير صالح');
    var currencyChangesFs = { currency: currency, user: authUser ? authUser.email : '', updated_at: new Date(), rate_source: suppliedRateFs === null ? (existingCurrencyFs && existingCurrencyFs.rate_source) || 'imported' : 'admin' };
    if (suppliedRateFs !== null) currencyChangesFs.rate = suppliedRateFs;
    if (existingCurrencyFs) systemPatchRecord_('ERP_currency_exchange', existingCurrencyFs._meta.documentId, currencyChangesFs, { expectedUpdateTime: existingCurrencyFs._meta.updateTime });
    else systemCreateRecord_('ERP_currency_exchange', Object.assign({ id: systemNextNumericId_('ERP_currency_exchange', 'id'), created_at: new Date() }, currencyChangesFs), { operationId: 'currency:' + currency });
    return { status: 'success', message: existingCurrencyFs ? 'تم تحديث العملة' : 'تمت إضافة العملة' };
  }

  const sheet = getSheet_('ERP_currency_exchange', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const currencyIdx = idx('currency');
  const idIdx = idx('id');
  if (currencyIdx === -1) throw new Error('ERP_currency_exchange missing currency column');

  let existingRowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][currencyIdx]).trim().toUpperCase() === currency) { existingRowNum = i + 1; break; }
  }

  if (existingRowNum !== -1) {
    sheet.getRange(existingRowNum, currencyIdx + 1).setValue(currency);
    noteMutation_();
    setRateFormula_(sheet, headers, existingRowNum);
    return { status: 'success', message: 'تم تحديث العملة' };
  }

  const nextId = getNextId_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_currency_exchange', 'id');
  const rowValues = headers.map(() => '');
  const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };
  set('id', nextId);
  set('currency', currency);
  set('user', authUser ? authUser.email : '');
  set('created_at', new Date());
  sheet.appendRow(rowValues);
  noteMutation_();
  setRateFormula_(sheet, headers, sheet.getLastRow());
  return { status: 'success', message: 'تمت إضافة العملة' };
}

function adminDeleteCurrency_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const id = Number(payload && payload.id);
  if (!id) throw new Error('معرف العملة مطلوب');
  if (systemStorageTarget_().backend === 'firestore') {
    var currencyFs = systemFindByBusinessKey_('ERP_currency_exchange', 'id', id);
    if (currencyFs) systemRemoveRecord_('ERP_currency_exchange', currencyFs._meta.documentId, { expectedUpdateTime: currencyFs._meta.updateTime });
    return { status: 'success', message: 'تم حذف العملة' };
  }
  const sheet = getSheet_('ERP_currency_exchange', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const idIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'id');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][idIdx]) === id) { sheet.deleteRow(i + 1); noteMutation_(); break; }
  }
  return { status: 'success', message: 'تم حذف العملة' };
}

/* =========================================
 * ERP System Invoices — list / save / delete / print
 * ========================================= */
const ERP_INVOICES_SHEET = 'ERP_system_invoices';
const ERP_INVOICES_HEADERS = [
  'unique_id',
  'id',
  'invoice_number',
  'invoice_date',
  'company',
  'no_of_user',
  'cost_per_user_usd',
  'current_exchange_rate',
  'cost_per_user_egp',
  'maintenance_cost_usd',
  'maintenance_cost_per_user_egp',
  'user',
  'created_at',
  'updated_at'
];

function getOrCreateErpInvoicesSheet_() {
  const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(ERP_INVOICES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ERP_INVOICES_SHEET);
    noteMutation_();
    sheet.appendRow(ERP_INVOICES_HEADERS);
    noteMutation_();
  }
  return sheet;
}

function adminListInvoices_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  if (systemStorageTarget_().backend === 'firestore') return { status: 'success', invoices: systemGetAllRecords_('ERP_system_invoices').sort(function (a, b) { return (Number(b.id) || 0) - (Number(a.id) || 0); }), company_options: systemGetAllRecords_('ERP_Companies').map(function (c) { return { value: String(c.company_unique_id || '').trim(), name_en: String(c.company_name_en || c.company_name_ar || '').trim(), name_ar: String(c.company_name_ar || '').trim() }; }) };
  getOrCreateErpInvoicesSheet_();
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, ERP_INVOICES_SHEET);
  const companies = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies').map(c => ({
    value: String(c.company_unique_id || '').trim(),
    name_en: String(c.company_name_en || c.company_name_ar || '').trim(),
    name_ar: String(c.company_name_ar || '').trim()
  }));

  // Auto-sort descending by id / invoice_date
  rows.sort(function (a, b) {
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  return { status: 'success', invoices: rows, company_options: companies };
}

function adminSaveInvoice_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  if (systemStorageTarget_().backend === 'firestore') return adminSaveInvoiceFirestore_(payload, authUser);
  getOrCreateErpInvoicesSheet_();
  const p = payload || {};

  const invoiceNumber = String(p.invoice_number || '').trim();
  if (!invoiceNumber) throw new Error('رقم الفاتورة مطلوب (invoice_number)');

  const invoiceDate = String(p.invoice_date || '').trim();
  if (!invoiceDate) throw new Error('تاريخ الفاتورة مطلوب (invoice_date)');

  const company = String(p.company || '').trim();
  if (!company) throw new Error('الشركة مطلوبة (company)');

  const noOfUsers = parseInt(p.no_of_user, 10);
  if (isNaN(noOfUsers) || noOfUsers < 0) throw new Error('عدد المستخدمين يجب أن يكون رقماً صحيحاً (no_of_user)');

  const costPerUserUsd = parseFloat(p.cost_per_user_usd);
  if (isNaN(costPerUserUsd) || costPerUserUsd < 0) throw new Error('تكلفة المستخدم بالدولار مطلوبة (cost_per_user_usd)');

  const currentExchangeRate = parseFloat(p.current_exchange_rate);
  if (isNaN(currentExchangeRate) || currentExchangeRate <= 0) throw new Error('سعر الصرف الحالي بالجنيه مطلوب (current_exchange_rate)');

  const maintenanceCostUsd = p.maintenance_cost_usd !== undefined && p.maintenance_cost_usd !== '' ? parseFloat(p.maintenance_cost_usd) : 14;
  if (isNaN(maintenanceCostUsd) || maintenanceCostUsd < 0) throw new Error('تكلفة الصيانة بالدولار غير صالحة');

  // Calculations per specifications:
  // cost_per_user_egp = cost_per_user_usd * current_exchange_rate * 1.04
  // maintenance_cost_per_user_egp = maintenance_cost_usd * current_exchange_rate
  const costPerUserEgp = Math.round(costPerUserUsd * currentExchangeRate * 1.04 * 100) / 100;
  const maintenanceCostPerUserEgp = Math.round(maintenanceCostUsd * currentExchangeRate * 100) / 100;

  const sheet = getSheet_(ERP_INVOICES_SHEET, CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const idx = name => headers.findIndex(h => String(h).trim().toLowerCase() === name);

  let uid = String(p.unique_id || '').trim();

  // If editing an existing invoice
  if (uid) {
    const data = sheet.getDataRange().getValues();
    const uiIdx = idx('unique_id');
    let rowNum = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][uiIdx]).trim() === uid) {
        rowNum = i + 1;
        break;
      }
    }
    if (rowNum === -1) throw new Error('الفاتورة غير موجودة لتعديلها');

    const updates = {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      company: company,
      no_of_user: noOfUsers,
      cost_per_user_usd: costPerUserUsd,
      current_exchange_rate: currentExchangeRate,
      cost_per_user_egp: costPerUserEgp,
      maintenance_cost_usd: maintenanceCostUsd,
      maintenance_cost_per_user_egp: maintenanceCostPerUserEgp,
      user: authUser ? authUser.email : '',
      updated_at: new Date()
    };

    patchRowByCriteria_(sheet, 'unique_id', uid, updates);
    return { status: 'success', message: 'تم تحديث الفاتورة بنجاح', unique_id: uid };
  }

  // Creating a new invoice: unique_id is 8-char UUID, id is auto-increment
  uid = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  const nextId = getNextId_(CONFIG.AUTH_SPREADSHEET_ID, ERP_INVOICES_SHEET, 'id');

  const rowValues = headers.map(() => '');
  const set = (n, v) => { const i = idx(n); if (i !== -1) rowValues[i] = v; };

  set('unique_id', uid);
  set('id', nextId);
  set('invoice_number', invoiceNumber);
  set('invoice_date', invoiceDate);
  set('company', company);
  set('no_of_user', noOfUsers);
  set('cost_per_user_usd', costPerUserUsd);
  set('current_exchange_rate', currentExchangeRate);
  set('cost_per_user_egp', costPerUserEgp);
  set('maintenance_cost_usd', maintenanceCostUsd);
  set('maintenance_cost_per_user_egp', maintenanceCostPerUserEgp);
  set('user', authUser ? authUser.email : '');
  set('created_at', new Date());
  set('updated_at', new Date());

  sheet.appendRow(rowValues);
  noteMutation_();
  return { status: 'success', message: 'تم إصدار الفاتورة بنجاح', unique_id: uid, id: nextId };
}

function adminDeleteInvoice_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const uid = String(payload && payload.unique_id || '').trim();
  if (!uid) throw new Error('معرف الفاتورة مطلوب');
  if (systemStorageTarget_().backend === 'firestore') {
    var invoiceFs = systemFindByBusinessKey_('ERP_system_invoices', 'unique_id', uid);
    if (invoiceFs) systemRemoveRecord_('ERP_system_invoices', invoiceFs._meta.documentId, { expectedUpdateTime: invoiceFs._meta.updateTime });
    return { status: 'success', message: 'تم حذف الفاتورة' };
  }
  const sheet = getSheet_(ERP_INVOICES_SHEET, CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const uiIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'unique_id');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][uiIdx]).trim() === uid) {
      sheet.deleteRow(i + 1);
      noteMutation_();
      break;
    }
  }
  return { status: 'success', message: 'تم حذف الفاتورة' };
}

/* =========================================
 * ERP Management — "حذف" clears the data on the row.
 * Contract: delete blanks every data column of the matched row and keeps the
 * physical row itself (and its numeric id) — it never deleteRow/remove's it.
 * The four admin_delete_* handlers below are the only callers; the page
 * filters rows whose key column was blanked out of every list.
 * ========================================= */
function erpClearUpdates_(headers) {
  const updates = {};
  (headers || []).forEach(function (h) {
    const name = String(h).trim();
    if (!name || name.toLowerCase() === 'id') return;
    updates[name] = '';
  });
  return updates;
}

function erpClearSheetRow_(sheet, headers, rowNumber) {
  const formulas = sheet.getRange(rowNumber, 1, 1, headers.length).getFormulas()[0];
  const cells = [];
  headers.forEach(function (h, colIdx) {
    const name = String(h).trim().toLowerCase();
    if (!name || name === 'id') return;
    if (formulas[colIdx]) return; /* live formula: preserve, never overwrite */
    cells.push(colIdx);
  });
  let run = [];
  const flush = function () {
    if (!run.length) return;
    sheet.getRange(rowNumber, run[0] + 1, 1, run.length).setValues([run.map(function () { return ''; })]);
    run = [];
  };
  cells.forEach(function (colIdx) {
    if (run.length && colIdx !== run[run.length - 1] + 1) flush();
    run.push(colIdx);
  });
  flush();
  noteMutation_();
}

function erpClearRowByKey_(table, keyField, keyValue) {
  if (systemStorageTarget_().backend === 'firestore') {
    const rec = systemFindByBusinessKey_(table, keyField, keyValue);
    if (!rec) return false;
    const changes = {};
    Object.keys(rec).forEach(function (k) {
      if (k === 'id' || k === '_meta') return;
      changes[k] = '';
    });
    systemPatchRecord_(table, rec._meta.documentId, changes, { expectedUpdateTime: rec._meta.updateTime });
    return true;
  }
  const sheet = getSheet_(table, CONFIG.AUTH_SPREADSHEET_ID);
  return patchRowByCriteria_(sheet, keyField, keyValue, erpClearUpdates_(getHeaders_(sheet)));
}

function adminDeleteCompany_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const uid = String((payload && payload.company_unique_id) || '').trim();
  if (!uid) throw new Error('معرف الشركة مطلوب');
  const users = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users');
  if (users.some(function (u) { return String(u.company || '').trim() === uid; })) {
    throw new Error('لا يمكن حذف الشركة: يوجد مستخدمون مرتبطون بها — غيّر شركتهم أولاً');
  }
  const pages = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_System_Pages');
  if (pages.some(function (p) { return String(p.page_company || '').trim() === uid; })) {
    throw new Error('لا يمكن حذف الشركة: توجد صفحات نظام مرتبطة بها — عدّل الشركة في الصفحات أولاً');
  }
  if (!erpClearRowByKey_('ERP_Companies', 'company_unique_id', uid)) throw new Error('الشركة غير موجودة');
  bumpVersion_('ERP_Companies');
  return { status: 'success', message: 'تم حذف بيانات الشركة' };
}

function adminDeleteUser_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const email = String((payload && payload.email) || '').trim().toLowerCase();
  if (!email) throw new Error('البريد الإلكتروني مطلوب');
  if (authUser && String(authUser.email || '').trim().toLowerCase() === email) {
    throw new Error('لا يمكنك حذف حسابك الحالي');
  }
  if (!erpClearRowByKey_('ERP_Users', 'email', email)) throw new Error('المستخدم غير موجود');
  bumpVersion_('ERP_Users');
  return { status: 'success', message: 'تم حذف بيانات المستخدم' };
}

function adminDeleteMatrixRow_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const role = String((payload && payload.role) || '').trim();
  const pageId = String((payload && payload.page_id) || '').trim();
  if (!role || !pageId) throw new Error('الدور والصفحة مطلوبان');
  const rec = systemFindByFields_('ERP_Pages_Matrix', [{ field: 'role', value: role }, { field: 'page_id', value: pageId }]);
  if (!rec || !String(rec.access_type || '').trim()) {
    return { status: 'success', message: 'لا توجد صلاحية مخصصة لهذه الصفحة' };
  }
  if (systemStorageTarget_().backend === 'firestore') {
    const changes = {};
    Object.keys(rec).forEach(function (k) {
      if (k === 'id' || k === '_meta') return;
      changes[k] = '';
    });
    systemPatchRecord_('ERP_Pages_Matrix', rec._meta.documentId, changes, { expectedUpdateTime: rec._meta.updateTime });
  } else {
    const sheet = getSheet_('ERP_Pages_Matrix', CONFIG.AUTH_SPREADSHEET_ID);
    const headers = getHeaders_(sheet);
    const uid = String(rec.erp_pages_matrix_unique_id || '').trim();
    if (!uid || !patchRowByCriteria_(sheet, 'erp_pages_matrix_unique_id', uid, erpClearUpdates_(headers))) {
      const roleIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'role'; });
      const pageIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'page_id'; });
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][roleIdx]).trim().toLowerCase() === role.toLowerCase() &&
            String(data[i][pageIdx]).trim().toLowerCase() === pageId.toLowerCase()) {
          erpClearSheetRow_(sheet, headers, i + 1);
          break;
        }
      }
    }
  }
  bumpVersion_('ERP_Pages_Matrix');
  return { status: 'success', message: 'تم حذف الصلاحية' };
}

function adminDeletePage_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const pageId = String((payload && payload.page_id) || '').trim();
  if (!pageId) throw new Error('معرف الصفحة مطلوب');
  if (!erpClearRowByKey_('ERP_System_Pages', 'page_id', pageId)) throw new Error('الصفحة غير مسجلة');
  bumpVersion_('ERP_System_Pages');
  return { status: 'success', message: 'تم حذف بيانات الصفحة' };
}

function adminSaveInvoiceFirestore_(payload, authUser) {
  var p = payload || {}, invoiceNumber = String(p.invoice_number || '').trim(), invoiceDate = String(p.invoice_date || '').trim(), company = String(p.company || '').trim();
  if (!invoiceNumber || !invoiceDate || !company) throw new Error('رقم الفاتورة والتاريخ والشركة مطلوبة');
  var users = parseInt(p.no_of_user, 10), usd = parseFloat(p.cost_per_user_usd), rate = parseFloat(p.current_exchange_rate), maintenance = p.maintenance_cost_usd !== undefined && p.maintenance_cost_usd !== '' ? parseFloat(p.maintenance_cost_usd) : 14;
  if (isNaN(users) || users < 0 || isNaN(usd) || usd < 0 || isNaN(rate) || rate <= 0 || isNaN(maintenance) || maintenance < 0) throw new Error('بيانات الفاتورة الرقمية غير صالحة');
  var changes = { invoice_number: invoiceNumber, invoice_date: invoiceDate, company: company, no_of_user: users, cost_per_user_usd: usd, current_exchange_rate: rate, cost_per_user_egp: Math.round(usd * rate * 1.04 * 100) / 100, maintenance_cost_usd: maintenance, maintenance_cost_per_user_egp: Math.round(maintenance * rate * 100) / 100, user: authUser ? authUser.email : '', updated_at: new Date() };
  var uid = String(p.unique_id || '').trim();
  if (uid) {
    var existing = systemFindByBusinessKey_('ERP_system_invoices', 'unique_id', uid);
    if (!existing) throw new Error('الفاتورة غير موجودة لتعديلها');
    systemPatchRecord_('ERP_system_invoices', existing._meta.documentId, changes, { expectedUpdateTime: existing._meta.updateTime });
    return { status: 'success', message: 'تم تحديث الفاتورة بنجاح', unique_id: uid };
  }
  uid = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  systemCreateRecord_('ERP_system_invoices', Object.assign({ unique_id: uid, id: systemNextNumericId_('ERP_system_invoices', 'id'), created_at: new Date() }, changes), { operationId: 'invoice:' + uid });
  return { status: 'success', message: 'تم إصدار الفاتورة بنجاح', unique_id: uid };
}

function invoiceHtmlEscape_(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function serveErpInvoiceFirestore_(params) {
  var uid = String(params.unique_id || params.id || '').trim(), inv = systemFindByBusinessKey_('ERP_system_invoices', 'unique_id', uid);
  if (!inv) throw new Error('السند الفريد المطلوب غير مسجل');
  assertCompanyEnabled_(String(inv.company || '').trim());
  var total = (Number(inv.no_of_user) || 0) * (Number(inv.cost_per_user_usd) || 0) + (Number(inv.maintenance_cost_usd) || 0);
  return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="UTF-8"><title>Receipt - ' + invoiceHtmlEscape_(inv.invoice_number) + '</title><style>body{font-family:Arial;padding:32px;color:#111}table{border-collapse:collapse;width:100%;max-width:680px}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}.total{font-weight:bold;font-size:18px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">طباعة</button><h1>Receipt</h1><table><tr><th>Invoice</th><td>' + invoiceHtmlEscape_(inv.invoice_number) + '</td></tr><tr><th>Date</th><td>' + invoiceHtmlEscape_(inv.invoice_date) + '</td></tr><tr><th>Company</th><td>' + invoiceHtmlEscape_(inv.company) + '</td></tr><tr><th>Users</th><td>' + invoiceHtmlEscape_(inv.no_of_user) + '</td></tr><tr class="total"><th>Total USD</th><td>' + total.toFixed(2) + '</td></tr></table></body></html>').setTitle('Receipt - ' + invoiceHtmlEscape_(inv.invoice_number)).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Print module for ERP System Invoices (AppSheet Receipt Layout)
 */
function serveErpInvoice_(params) {
  try {
    authorizeArtifact_(params, { superAdmin: true });
    if (systemStorageTarget_().backend === 'firestore') return serveErpInvoiceFirestore_(params);
    const targetUniqueId = String(params.unique_id || params.id || '').trim();
    if (!targetUniqueId) {
      throw new Error('لم يتم تحديد كود السند الفريد (unique_id) المطلوب عرضه.');
    }

    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    const appsheetInvSheet = ss.getSheetByName(ERP_INVOICES_SHEET);
    if (!appsheetInvSheet) {
      throw new Error('تنبيه: جدول فواتير النظام (' + ERP_INVOICES_SHEET + ') غير موجود.');
    }

    const data = appsheetInvSheet.getDataRange().getValues();
    if (data.length < 2) {
      throw new Error('جدول الفواتير لا يحتوي على أي سجلات حالياً.');
    }

    const headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
    const idxUi = headers.indexOf('unique_id');
    const idxInvNumber = headers.indexOf('invoice_number');
    const idxInvDate = headers.indexOf('invoice_date');
    const idxCompany = headers.indexOf('company');
    const idxNoOfUsers = headers.indexOf('no_of_user');
    const idxCostUser = headers.indexOf('cost_per_user_usd');
    const idxMaintCost = headers.indexOf('maintenance_cost_usd');

    if (idxUi === -1 || idxInvNumber === -1 || idxInvDate === -1 || idxNoOfUsers === -1 || idxCostUser === -1) {
      throw new Error('فشل فحص بنية الجدول: تأكد من مطابقة أسماء الأعمدة في شيت ' + ERP_INVOICES_SHEET + '.');
    }

    let invRow = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxUi]).trim() === targetUniqueId) {
        invRow = data[i];
        break;
      }
    }

    if (!invRow) {
      throw new Error('السند الفريد المطلوب (ID: ' + targetUniqueId + ') غير مسجل بالجدول.');
    }

    const invoiceNumber = String(invRow[idxInvNumber]).trim();
    const companyUid = idxCompany !== -1 ? String(invRow[idxCompany]).trim() : '';
    if (!companyUid) throw new Error('تعذر التحقق من شركة الفاتورة.');
    assertCompanyEnabled_(companyUid);

    let companyName = companyUid;
    let companyLogo = '';
    const compRows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
    const comp = compRows.find(function (c) { return String(c.company_unique_id || '').trim() === companyUid; });
    if (comp) {
      companyName = String(comp.company_name_en || comp.company_name_ar || companyUid).trim();
      companyLogo = String(comp.company_logo || '').trim();
    }
    if (!companyName) companyName = 'Top Chemical Factory';

    const noOfUsers = parseInt(invRow[idxNoOfUsers], 10) || 0;
    const costPerUser = parseFloat(invRow[idxCostUser]) || 0;
    const maintCost = idxMaintCost !== -1 ? (parseFloat(invRow[idxMaintCost]) || 0) : 0;

    const rawDate = invRow[idxInvDate];
    let formattedDate = '---';
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      formattedDate = Utilities.formatDate(rawDate, 'Africa/Cairo', 'MMMM d, yyyy');
    } else if (rawDate) {
      const dt = new Date(rawDate);
      if (!isNaN(dt.getTime())) {
        formattedDate = Utilities.formatDate(dt, 'Africa/Cairo', 'MMMM d, yyyy');
      } else {
        formattedDate = String(rawDate);
      }
    }

    const licenseSubtotal = noOfUsers * costPerUser;
    const totalAmount = licenseSubtotal + maintCost;

    const rightLogoUrl = 'https://lh3.googleusercontent.com/d/1OJN15s3LHY4EL2Vcn90X07NnucIjgfJa';
    const leftLogoUrl = 'https://lh3.googleusercontent.com/d/1Ug1T9j5vQBeBA_5w52ufDO07IsefW6QH';

    const htmlContent = `<!DOCTYPE html>
    <html lang="en" dir="ltr">
    <head>
      <meta charset="UTF-8">
      <title>Receipt from AppSheet - ${invoiceNumber}</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #32325d; background-color: #ffffff; margin: 0; padding: 0; font-size: 13px; -webkit-font-smoothing: antialiased; }
        
        .top-stripe {
          background-color: #4285f4;
          height: 10px;
          width: 100%;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .invoice-wrapper { max-width: 660px; margin: 0 auto; padding: 24px 18px; box-sizing: border-box; }
        
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .header-table td { vertical-align: middle; padding: 0; }
        .logo-left img { max-height: 80px; max-width: 170px; object-fit: contain; }
        .logo-right { text-align: right; }
        .logo-right img { max-height: 60px; max-width: 170px; object-fit: contain; }
        .title-text { font-size: 22px; font-weight: 600; color: #111111; margin-bottom: 18px; }
        
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .meta-table td { vertical-align: top; padding: 0; padding-bottom: 6px; font-size: 13px; }
        .meta-label { color: #4f5b66; width: 130px; font-weight: 400; }
        .meta-value { color: #111111; font-weight: 600; }
        
        .info-row { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 13px; line-height: 1.5; color: #4f5b66; }
        
        .info-left { width: 50%; }
        .info-left strong { color: #111111; font-size: 15px; font-weight: 600; display: inline-block; margin-bottom: 4px; }
        
        .info-right { width: 45%; }
        .bill-to-title { color: #7a8c9e; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .bill-to-company { color: #111111; font-weight: 600; margin-bottom: 2px; }
        
        .amount-paid-text { display: inline-block; margin-top: 10px; color: #111111; font-weight: 600; font-size: 13px; }

        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; margin-top: 8px; }
        .items-table th { text-align: left; color: #7a8c9e; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e3e8ee; padding-bottom: 6px; }
        .items-table td { padding: 12px 0; border-bottom: 1px solid #e3e8ee; color: #111111; font-size: 13px; vertical-align: top; }
        .items-table th.num-col, .items-table td.num-col { text-align: right; }
        
        .description-text { font-weight: 500; margin: 0; color: #111111; }
        .description-sub { color: #4f5b66; font-size: 11.5px; margin: 3px 0 0 0; }

        .totals-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .totals-table td { padding: 5px 0; font-size: 13px; }
        .totals-label { text-align: right; color: #7a8c9e; padding-right: 20px !important; }
        .totals-value { text-align: right; color: #111111; font-weight: 500; width: 100px; }
        
        .divider-row td { border-top: 1px solid #e3e8ee; padding-top: 8px !important; }
        .grand-total td { font-size: 14px; font-weight: 600; color: #111111; }

        .footer-clause { margin-top: 30px; border-top: 1px solid #e3e8ee; padding-top: 12px; color: #7a8c9e; font-size: 11px; line-height: 1.5; text-align: center; }
        
        .print-button-wrapper {
          max-width: 660px;
          margin: 12px auto 0 auto;
          text-align: center;
        }

        .print-btn {
          background-color: #4285f4;
          color: #ffffff;
          border: none;
          padding: 8px 24px;
          font-size: 13px;
          font-weight: 600;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
        }

        .print-btn:hover {
          background-color: #3367d6;
        }

        @media print {
          .invoice-wrapper { padding: 10mm 8mm; }
          .print-button-wrapper { display: none; }
        }
      </style>
    </head>
    <body>

      <div class="top-stripe"></div>

      <div class="print-button-wrapper">
        <button onclick="window.print()" class="print-btn">
          🖨️ طباعة الإيصال
        </button>
      </div>

      <div class="invoice-wrapper">
        
        <table class="header-table">
          <tr>
            <td class="logo-left">
              <img src="${leftLogoUrl}" alt="Company Logo">
            </td>
            <td class="logo-right">
              <img src="${rightLogoUrl}" alt="AppSheet Logo">
            </td>
          </tr>
        </table>

        <div class="title-text">Receipt</div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">Invoice number</td>
            <td class="meta-value">${invoiceNumber}</td>
          </tr>
          <tr>
            <td class="meta-label">Date paid</td>
            <td class="meta-value">${formattedDate}</td>
          </tr>
          <tr>
            <td class="meta-label">Payment method</td>
            <td class="meta-value">USD Balance Account</td>
          </tr>
        </table>

        <div class="info-row">
          <div class="info-left">
            <strong>AppSheet</strong><br>
            AppSheet<br>
            1600 Amphitheatre Pkwy<br>
            Mountain View, California 94043<br>
            United States<br>
            +1 206-486-4185<br>
            sales@appsheet.com<br>
            <div class="amount-paid-text">$${totalAmount.toFixed(2)} paid on ${formattedDate}</div>
          </div>
          <div class="info-right">
            <div class="bill-to-title">Bill to</div>
            <div class="bill-to-company">${companyName}</div>
            <div class="bill-to-email">m.gamal2363@gmail.com</div>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 50%;">Description</th>
              <th class="num-col" style="width: 10%;">Qty</th>
              <th class="num-col" style="width: 20%;">Unit Price</th>
              <th class="num-col" style="width: 20%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <p class="description-text">AppSheet PREMIUM User Licenses</p>
                <p class="description-sub">Monthly active operational application seats subscription</p>
              </td>
              <td class="num-col">${noOfUsers}</td>
              <td class="num-col">$${costPerUser.toFixed(2)}</td>
              <td class="num-col">$${licenseSubtotal.toFixed(2)}</td>
            </tr>
            ${maintCost > 0 ? `
            <tr>
              <td>
                <p class="description-text">AppSheet Server Infrastructure Maintenance Cost</p>
                <p class="description-sub">Technical optimization, data safety & backup routine control</p>
              </td>
              <td class="num-col">1</td>
              <td class="num-col">$${maintCost.toFixed(2)}</td>
              <td class="num-col">$${maintCost.toFixed(2)}</td>
            </tr>
            ` : ''}
          </tbody>
        </table>

        <table class="totals-table">
          <tr>
            <td class="totals-label">Subtotal</td>
            <td class="totals-value">$${totalAmount.toFixed(2)}</td>
          </tr>
          <tr class="divider-row grand-total">
            <td class="totals-label">Total</td>
            <td class="totals-value">$${totalAmount.toFixed(2)}</td>
          </tr>
          <tr class="grand-total">
            <td class="totals-label" style="color:#111111;">Amount paid</td>
            <td class="totals-value" style="color:#111111;">$${totalAmount.toFixed(2)}</td>
          </tr>
        </table>

        <div class="footer-clause">
          <br>
          Generated automatically via ERP System Architecture.
        </div>

      </div>

    </body>
    </html>`;

    return HtmlService.createHtmlOutput(htmlContent)
      .setTitle("Receipt from AppSheet - " + invoiceNumber)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch (err) {
    return HtmlService.createHtmlOutput(
      "<h3 style='direction:rtl; text-align:center; color:#c53030; padding-top:40px;'>❌ خطأ في معالجة إيصال الأب شيت: " + err.message + "</h3>"
    );
  }
}

/* =========================================
 * Multi-device sessions + audit trail endpoints (B6)
 * All require an authenticated user (wired in Code.js ROUTES). No super-admin
 * gate — any logged-in user manages their own sessions/views. Authority for
 * business pages is untouched (ERP_Users.authorizedPages / guard_ unchanged).
 * ========================================= */
function list_user_views_(payload, sessionToken, authUser) {
  const dbId = CONFIG.AUTH_SPREADSHEET_ID;
  const pageAction = payload && payload.page_action ? String(payload.page_action) : '';
  const all = getAllRecords_(dbId, 'ERP_User_Views');
  const mine = all.filter(function (v) {
    return v.email === authUser.email && (!pageAction || v.page_action === pageAction);
  });
  mine.sort(function (a, b) { return (Number(b.is_default) || 0) - (Number(a.is_default) || 0); });
  return { status: 'success', views: mine };
}

function save_user_view_(payload, sessionToken, authUser) {
  const dbId = CONFIG.AUTH_SPREADSHEET_ID;
  const isDelete = !!(payload && payload._delete);
  const viewId = payload && payload.view_id ? String(payload.view_id).trim() : '';
  const viewName = payload && payload.view_name ? String(payload.view_name).trim() :
    (payload && payload.name ? String(payload.name).trim() : '');
  const pageAction = payload && payload.page_action ? String(payload.page_action).trim() :
    (payload && payload.page_key ? String(payload.page_key).trim() : '');
  const layoutJson = payload && (payload.layout_json !== undefined) ? payload.layout_json :
    (payload && payload.definition !== undefined ? payload.definition : '');
  if (systemStorageTarget_().backend === 'firestore') {
    if (isDelete) {
      if (!viewId) throw new Error('معرف العرض مطلوب للحذف');
      var delViewFs = systemFindByFields_('ERP_User_Views', [{ field: 'email', value: authUser.email }, { field: 'view_id', value: viewId }]);
      if (!delViewFs) throw new Error('العرض غير موجود');
      systemRemoveRecord_('ERP_User_Views', delViewFs._meta.documentId, { expectedUpdateTime: delViewFs._meta.updateTime });
      return { status: 'success', message: 'تم حذف العرض' };
    }
    if (!viewName || !pageAction || !layoutJson) throw new Error('اسم العرض والصفحة والتخطيط مطلوبة');
    var defaultFs = !!(payload && (payload.is_default === true || String(payload.is_default).trim().toLowerCase() === 'true'));
    var currentFs = viewId ? systemFindByFields_('ERP_User_Views', [{ field: 'email', value: authUser.email }, { field: 'view_id', value: viewId }]) : systemFindByFields_('ERP_User_Views', [{ field: 'email', value: authUser.email }, { field: 'page_action', value: pageAction }, { field: 'view_name', value: viewName }]);
    if (defaultFs) systemGetAllRecords_('ERP_User_Views').filter(function (v) { return String(v.email).toLowerCase() === String(authUser.email).toLowerCase() && String(v.page_action) === pageAction && String(v.view_id) !== String(currentFs && currentFs.view_id); }).forEach(function (v) { var vm = v._meta; if (vm) systemPatchRecord_('ERP_User_Views', vm.documentId, { is_default: false }, { expectedUpdateTime: vm.updateTime }); });
    var viewChangesFs = { email: authUser.email, page_action: pageAction, view_name: viewName, layout_json: typeof layoutJson === 'string' ? layoutJson : JSON.stringify(layoutJson), is_default: defaultFs, updated_at: new Date() };
    if (currentFs) systemPatchRecord_('ERP_User_Views', currentFs._meta.documentId, viewChangesFs, { expectedUpdateTime: currentFs._meta.updateTime });
    else systemCreateRecord_('ERP_User_Views', Object.assign({ view_id: String(systemNextNumericId_('ERP_User_Views', 'view_id')), created_at: new Date() }, viewChangesFs), { operationId: 'view:' + authUser.email + ':' + pageAction + ':' + viewName });
    return { status: 'success', message: currentFs ? 'تم تحديث العرض' : 'تم حفظ العرض', view_name: viewName };
  }
  const sheet = getSheet_('ERP_User_Views', dbId);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const idx = function (n) { return headers.findIndex(function (h) { return String(h).trim().toLowerCase() === n; }); };
  const emIdx = idx('email'), paIdx = idx('page_action'), vaIdx = idx('view_name'), idIdx = idx('view_id');

  if (isDelete) {
    if (!viewId) throw new Error('معرف العرض مطلوب للحذف');
    let found = -1;
    for (let i = 1; i < data.length; i++) {
      if (idIdx !== -1 && String(data[i][idIdx]).trim() === viewId &&
          String(data[i][emIdx]).trim().toLowerCase() === authUser.email) { found = i + 1; break; }
    }
    if (found === -1) throw new Error('العرض غير موجود');
    sheet.deleteRow(found);
    noteMutation_();
    return { status: 'success', message: 'تم حذف العرض' };
  }

  if (!viewName) throw new Error('اسم العرض مطلوب');
  if (!pageAction) throw new Error('الصفحة غير محددة');
  if (!layoutJson) throw new Error('تخطيط العرض مطلوب');
  const isDefault = !!(payload && (payload.is_default === true || String(payload.is_default).trim().toLowerCase() === 'true'));
  let existingRowNum = -1;
  for (let i = 1; i < data.length; i++) {
    const matchId = idIdx !== -1 && viewId && String(data[i][idIdx]).trim() === viewId;
    const matchName = String(data[i][emIdx]).trim().toLowerCase() === authUser.email &&
      String(data[i][paIdx]).trim() === pageAction && String(data[i][vaIdx]).trim() === viewName;
    if (matchId || matchName) { existingRowNum = i + 1; break; }
  }
  if (isDefault) {
    for (let i = 1; i < data.length; i++) {
      if (i + 1 === existingRowNum) continue;
      if (String(data[i][emIdx]).trim().toLowerCase() === authUser.email &&
          String(data[i][paIdx]).trim() === pageAction) {
        const newRow = data[i].slice();
        newRow[idx('is_default')] = false;
        sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
        noteMutation_();
      }
    }
  }
  const layoutStr = typeof layoutJson === 'string' ? layoutJson : JSON.stringify(layoutJson);
  const now = new Date();
  if (existingRowNum !== -1) {
    const newRow = data[existingRowNum - 1].slice();
    newRow[idx('layout_json')] = layoutStr;
    newRow[idx('is_default')] = isDefault;
    newRow[idx('updated_at')] = now;
    sheet.getRange(existingRowNum, 1, 1, newRow.length).setValues([newRow]);
    noteMutation_();
    return { status: 'success', message: 'تم تحديث العرض', view_name: viewName };
  }
  const rowValues = headers.map(function () { return ''; });
  const set = function (n, v) { const ci = idx(n); if (ci !== -1) rowValues[ci] = v; };
  if (idIdx !== -1) set('view_id', getNextId_(dbId, 'ERP_User_Views', 'view_id'));
  set('email', authUser.email);
  set('page_action', pageAction);
  set('view_name', viewName);
  set('layout_json', layoutStr);
  set('is_default', isDefault);
  set('created_at', now);
  set('updated_at', now);
  sheet.appendRow(rowValues);
  noteMutation_();
  return { status: 'success', message: 'تم حفظ العرض', view_name: viewName };
}

function get_record_history_(payload, sessionToken, authUser) {
  const dbId = CONFIG.AUTH_SPREADSHEET_ID;
  const sheetName = payload && payload.sheet_name ? String(payload.sheet_name) : '';
  const recordId = payload && payload.record_id ? String(payload.record_id) : '';
  const recordUid = payload && payload.record_uid ? String(payload.record_uid) : '';
  if (!sheetName) throw new Error('بيانات غير مكتملة');
  const all = getAllRecords_(dbId, 'ERP_Record_History');
  let rows = all.filter(function (h) { return h.sheet_name === sheetName; });
  if (recordId) rows = rows.filter(function (h) { return h.record_id === recordId; });
  else if (recordUid) rows = rows.filter(function (h) { return h.record_uid === recordUid; });
  // Phase 5 (F-12): rows older than CONFIG.ARCHIVE_RETENTION_MONTHS live in
  // ERP_Record_History_Archive_<year> tabs. The default path reads only the live
  // tab — that is the whole point of archiving — so archived history is fetched
  // only when the caller explicitly asks for it.
  if (payload && payload.include_archive) {
    try { rows = rows.concat(readArchivedHistory_(sheetName, recordId, recordUid)); } catch (e) {
      if (systemStorageTarget_().backend === 'firestore') throw e;
    }
  }
  const specific = recordId || recordUid;
  rows.sort(function (a, b) {
    return specific ? (new Date(a.changed_at) - new Date(b.changed_at)) : (new Date(b.changed_at) - new Date(a.changed_at));
  });
  return { status: 'success', history: rows };
}

function list_my_sessions_(payload, sessionToken, authUser) {
  const tokenHash = SessionManager_.hashToken_(sessionToken);
  const list = SessionManager_.listSessions(authUser.email).map(function (s) {
    return {
      token_hash: s.token_hash, device_name: s.device_name, device_id: s.device_id,
      created_at: s.created_at, last_activity: s.last_activity,
      is_current: s.token_hash === tokenHash
    };
  });
  return { status: 'success', sessions: list };
}

function revoke_session_(payload, sessionToken, authUser) {
  const tokenHash = payload && payload.token_hash ? String(payload.token_hash) : '';
  if (!tokenHash) throw new Error('معرف الجلسة مطلوب');
  const sessions = SessionManager_.listSessions(authUser.email);
  const target = sessions.find(function (s) { return s.token_hash === tokenHash; });
  if (!target) throw new Error('الجلسة غير موجودة أو لا تملك صلاحاً بإلغائها');
  SessionManager_.revoke(tokenHash);
  return { status: 'success', message: 'تم إلغاء الجلسة' };
}

function revoke_all_sessions_(payload, sessionToken, authUser) {
  const n = SessionManager_.revokeAllForUser(authUser.email);
  return { status: 'success', message: 'تم تسجيل الخروج من جميع الأجهزة', revoked: n };
}

function logout_(payload, sessionToken, authUser) {
  SessionManager_.revokeAllForUser(authUser.email);
  return { status: 'success', message: 'تم تسجيل الخروج' };
}

function get_erp_session_meta_(payload, sessionToken, authUser) {
  return {
    status: 'success',
    max_concurrent_sessions: readMaxConcurrent_(authUser.email),
    requires_device_name: false,
    session_expiry_hours: CONFIG.SESSION_EXPIRY_HOURS
  };
}

/**
 * shared Code.js section
 * RESPONSIBILITY: company theme markup and CSS builders extracted from the
 * security/authentication module. Function names and output remain global
 * because Code.js and the preview/runtime callers use those contracts.
 * Dependencies are the existing CONFIG, CacheService, getSheet_ and helpers.
 */
// ==========================================
// Per-company theme CSS (versioned cache)
// ==========================================
function themeSystemRowsCompat_(tableName) {
  if (typeof systemGetAllRecords_ === 'function') return systemGetAllRecords_(tableName);
  if (typeof getAllRecords_ === 'function') return getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, tableName);
  return [];
}
function themeSystemFindCompat_(tableName, fieldName, value) {
  if (typeof systemFindByBusinessKey_ === 'function') return systemFindByBusinessKey_(tableName, fieldName, value);
  const wanted = String(value == null ? '' : value).trim().toLowerCase();
  return themeSystemRowsCompat_(tableName).find(function (row) {
    return String(row[fieldName] == null ? '' : row[fieldName]).trim().toLowerCase() === wanted;
  }) || null;
}
/** Brand gradient for standalone block pages (access-denied etc.). */
function getCompanyBlockTheme_(companyUid) {
  const uid = String(companyUid || '').trim().toLowerCase();
  try {
    ensureCompaniesRegistered_();
    const cfg = COMPANY_REGISTRY[uid];
    if (cfg && typeof cfg.blockTheme === 'function') return cfg.blockTheme();
  } catch (e) {}
  let theme = { from: '#054719', to: '#16a34a' };
  try {
    if (uid) {
      const row = themeSystemFindCompat_('ERP_Companies', 'company_unique_id', uid);
      const gradMap = { red: ['#7f1d1d', '#dc2626'], green: ['#054719', '#16a34a'], yellow: ['#b45309', '#f59e0b'], black: ['#111827', '#374151'] };
      const first = String(row && row.company_colors || '').toLowerCase().split(',').map(c => c.trim())[0];
      if (gradMap[first]) theme = { from: gradMap[first][0], to: gradMap[first][1] };
    }
  } catch (e) {}
  return theme;
}

function getGenericCompanyThemeCSS_(companyName) {

  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'theme_v_' + compVersion + '_' + (companyName || '__default__');
  try {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  } catch (cacheErr) {}

  // ValleyFoods' generic theme has always been the green default. Keep that
  // default available to the offline preview and to an empty company lookup;
  // configured company_colors still overrides it below.
  let primaryColor = 'green'; let bgColor = 'white';
  try {
    if (companyName) {
      const wanted = String(companyName).trim().toLowerCase();
      const companyRow = themeSystemRowsCompat_('ERP_Companies').find(function (r) { return [r.company_unique_id, r.company_name_ar, r.company_name_en].some(function (v) { return String(v || '').trim().toLowerCase() === wanted; }); });
      if (companyRow) {
        const colorsArr = String(companyRow.company_colors || '').toLowerCase().split(',').map(c => c.trim());
        if (colorsArr.length > 0 && ['red', 'green', 'yellow', 'black', 'white'].includes(colorsArr[0])) primaryColor = colorsArr[0];
        if (colorsArr.length > 1 && ['red', 'green', 'yellow', 'black', 'white'].includes(colorsArr[1])) bgColor = colorsArr[1];
      }
    }
  } catch (e) { console.error('Theme Error: ' + e.message); }

  const primaryMap = {
    red: { p: '#D62828', h: '#B91C1C', sb: '#FEF2F2', b: '#FECACA', t: '#FFFFFF' },
    green: { p: '#16A34A', h: '#15803D', sb: '#F0FDF4', b: '#BBF7D0', t: '#FFFFFF' },
    yellow: { p: '#D97706', h: '#B45309', sb: '#FFFBEB', b: '#FDE68A', t: '#111827' },
    black: { p: '#111827', h: '#1F2937', sb: '#F3F4F6', b: '#E5E7EB', t: '#FFFFFF' },
    white: { p: '#FFFFFF', h: '#F9FAFB', sb: '#F9FAFB', b: '#E5E7EB', t: '#111827' }
  };
  const pc = primaryMap[primaryColor];
  let css = "<style>\n:root {\n";
  css += '  --brand-primary: ' + pc.p + ';\n';
  css += '  --brand-primary-hover: ' + pc.h + ';\n';
  css += '  --brand-subtle-bg: ' + pc.sb + ';\n';
  css += '  --brand-border: ' + pc.b + ';\n';
  css += '  --btn-text-color: ' + pc.t + ';\n';
  /* [UI-2.6 / D-1 / D-2 / U-10] The light branch no longer overrides the canvas,
     surfaces, borders or ink. It used to re-state the OLD values of those tokens
     (#F9FAFB / #F3F4F6 / #6B7280 / #E5E7EB), which would have silently undone
     the whole of Phase 2.1 for every company on this generic path — including
     ValleyFoods. They now come from CSS_Tokens.html like everyone else.

     The dark branch is left intact. It is a data-driven option a company can
     select through `company_colors`, it is not the coloured-canvas problem D-2
     is about, and a proper dark mode is Phase 8. Since no data may be read or
     written by this programme there is no way to know whether a company is
     configured this way, so it is not touched. */
  if (bgColor === 'black') {
    css += '  --bg-primary: #0F172A;\n  --bg-canvas: #0F172A;\n  --bg-surface: #1E293B;\n  --bg-subtle: #334155;\n  --text-main: #F8FAFC;\n  --text-muted: #94A3B8;\n  --border-color: #334155;\n';
  }
  css += '}\n';

  /* [UI-2.6] The brand topbar, which this path never had.
     ValleyFoods takes this path, so its topbar rendered in --bg-surface: a
     white bar with grey links, indistinguishable from the page. The two bespoke
     companies each hand-wrote a topbar; this gives every other company the same
     treatment, expressed in TOKENS so it adapts to whichever colour the company
     is configured with rather than hardcoding green. A company on 'white' or
     'yellow' gets dark ink automatically, because --btn-text-color already
     carries the readable ink for its primary colour. */
  if (bgColor !== 'black') {
    css += '.topbar { background: var(--brand-primary); border-bottom: 1px solid var(--brand-primary); }\n';
    css += '.topbar .nav-item, .topbar .nav-dropdown-toggle { color: var(--btn-text-color); }\n';
    css += '.topbar .nav-item:hover, .topbar .nav-item.active,\n';
    css += '.topbar .nav-dropdown-toggle:hover, .topbar .nav-dropdown-toggle.open { color: var(--brand-primary); background: var(--btn-text-color); }\n';
    /* The shared .user-name rule is --text-main, which is near-invisible on a
       saturated topbar. Same reason TopLight and TopChemical carry this. */
    css += '.topbar .user-profile-toggle { border: 1px solid var(--btn-text-color); border-radius: 999px; padding: 4px 12px; }\n';
    css += '.topbar .user-profile-toggle .user-name, .topbar .user-profile-toggle .nav-dropdown-caret { color: var(--btn-text-color); }\n';
    css += '.topbar .user-profile-toggle:hover, .topbar .user-profile-toggle.open { background: var(--btn-text-color); }\n';
    css += '.topbar .user-profile-toggle:hover .user-name, .topbar .user-profile-toggle.open .user-name,\n';
    css += '.topbar .user-profile-toggle:hover .nav-dropdown-caret, .topbar .user-profile-toggle.open .nav-dropdown-caret { color: var(--brand-primary); }\n';
    css += '.topbar .user-avatar { background: var(--btn-text-color); color: var(--brand-primary); }\n';
    /* Hamburger bars default to --text-main and would vanish on the topbar. */
    css += '.topbar-hamburger { border: 1px solid var(--btn-text-color); }\n';
    css += '.topbar-hamburger .hamburger-bar { background: var(--btn-text-color); }\n';
    css += '.invoice { background: #ffffff; border: 1px solid var(--border-color); }\n';
  }
  css += '</style>\n';
  try { cache.put(cacheKey, css, CONFIG.CACHE_THEME_SECONDS); } catch (putErr) {}
  return css;
}



function getCompanyThemeCSS_(companyName) {
  try {
    ensureCompaniesRegistered_();
    const uid = String(companyName || '').trim().toLowerCase();
    const cfg = COMPANY_REGISTRY[uid];
    if (cfg && typeof cfg.themeCss === 'function') return cfg.themeCss();
  } catch (e) {}
  return getGenericCompanyThemeCSS_(companyName);
}


/* ===================== 6. GENERIC DB VIEWER ============================= */
/**
 * shared Code.js section
 * RESPONSIBILITY: MySQL JDBC connector — live CRUD against remote MySQL database.
 * Credentials stored in ScriptProperties (setup via setupMySqlCredentials()).
 * Independent module — not tied to any company or Sheets-based data layer.
 * Loaded after shared Code.js section.
 */

/** Super-admin-only gate for every live MySQL operation. */
function dbGuard_(user) {
  if (!user || !user.isSuperAdmin) throw new Error('غير مصرح — للمسؤول فقط');
}

const DBLIVE_CONFIG = {
  host: '164.92.143.177',
  port: 3306,
  database: 'topchemicalpest',
  maxRows: 500,
  // These are Script Property KEY NAMES, not values. `user` and `pass` used to
  // hold a literal username and a password-shaped string, so every lookup asked
  // for a property named 'appscript_user' / 'YourStrongPassword123!' while every
  // error message said MYSQL_USER / MYSQL_PASSWORD. Corrected to the documented
  // key names; legacyProps below keeps any existing install working.
  props: {
    host: 'MYSQL_HOST',
    port: 'MYSQL_PORT',
    database: 'MYSQL_DATABASE',
    user: 'MYSQL_USER',
    pass: 'MYSQL_PASSWORD'
  },
  legacyProps: {
    user: 'appscript_user',
    pass: 'YourStrongPassword123!'
  }
};

/**
 * Reads a Script Property by its canonical key, falling back to the legacy key
 * the old (incorrect) props map used, so an install that already stored its
 * credentials under the legacy names keeps working.
 */
function dbLiveProp_(props, canonicalKey, legacyKey) {
  var v = props.getProperty(canonicalKey);
  if ((v === null || v === '') && legacyKey) v = props.getProperty(legacyKey);
  return v;
}

/**
 * One-time setup: run from editor to store connection DEFAULTS.
 * Only fills host/port/database when missing — NEVER touches MYSQL_USER /
 * MYSQL_PASSWORD: the real username/password must be entered manually in
 * Project Settings → Script properties so they never land in source code,
 * and re-running this can never clobber working credentials with placeholders.
 */
function setupMySqlCredentials_() {
  var props = PropertiesService.getScriptProperties();
  var current = props.getProperties() || {};
  var toSet = {};
  if (!current[DBLIVE_CONFIG.props.host]) toSet[DBLIVE_CONFIG.props.host] = DBLIVE_CONFIG.host;
  if (!current[DBLIVE_CONFIG.props.port]) toSet[DBLIVE_CONFIG.props.port] = String(DBLIVE_CONFIG.port);
  if (!current[DBLIVE_CONFIG.props.database]) toSet[DBLIVE_CONFIG.props.database] = DBLIVE_CONFIG.database;
  if (Object.keys(toSet).length > 0) props.setProperties(toSet);
  var missing = [];
  if (!dbLiveProp_(props, DBLIVE_CONFIG.props.user, DBLIVE_CONFIG.legacyProps.user)) missing.push('MYSQL_USER');
  if (!dbLiveProp_(props, DBLIVE_CONFIG.props.pass, DBLIVE_CONFIG.legacyProps.pass)) missing.push('MYSQL_PASSWORD');
  if (missing.length > 0) {
    Logger.log('MySQL defaults saved. STILL MISSING — add manually in Project Settings → Script properties: ' + missing.join(', '));
  } else {
    Logger.log('MySQL configuration complete.');
  }
}

/**
 * Returns a JDBC connection. Caller MUST close in finally block.
 * URL shape matches the verified getTableNames snippet exactly (plain
 * jdbc:mysql://host:port/db, no query params). Credentials come ONLY from
 * Script Properties (MYSQL_USER / MYSQL_PASSWORD) — never hardcode them.
 */
function dbGetConnection_() {
  if (typeof _mysqlRequest_ !== 'undefined' && _mysqlRequest_) return mysqlConnection_();
  const props = PropertiesService.getScriptProperties();
  const host = props.getProperty(DBLIVE_CONFIG.props.host) || DBLIVE_CONFIG.host;
  const port = props.getProperty(DBLIVE_CONFIG.props.port) || DBLIVE_CONFIG.port;
  const db = props.getProperty(DBLIVE_CONFIG.props.database) || DBLIVE_CONFIG.database;
  const user = (dbLiveProp_(props, DBLIVE_CONFIG.props.user, DBLIVE_CONFIG.legacyProps.user) || '').trim();
  const pass = dbLiveProp_(props, DBLIVE_CONFIG.props.pass, DBLIVE_CONFIG.legacyProps.pass) || '';
  var missingCreds = [];
  if (!user) missingCreds.push('MYSQL_USER');
  if (!pass) missingCreds.push('MYSQL_PASSWORD');
  if (missingCreds.length > 0) throw new Error('MySQL credentials not configured (' + missingCreds.join(', ') + ' missing). Add them in Project Settings → Script properties of this script project — never put passwords in code.');
  const url = 'jdbc:mysql://' + host + ':' + port + '/' + db;
  return Jdbc.getConnection(url, user, pass);
}

/* Shared MySQL execution. Only server-owned definitions call mysqlRead_; there
 * is deliberately no query-name/SQL browser route. A request owns its JDBC
 * resources, and nested readers borrow the same lazy connection. */
var _mysqlRequest_ = null;
function mysqlCanonical_(value, key) {
  if (Array.isArray(value)) {
    var a = value.map(function (v) { return mysqlCanonical_(v); });
    if (['years', 'months', 'product_ids', 'chart_of_accounts_list', 'ids'].indexOf(key) >= 0) {
      a = a.filter(function (v, i) { return a.indexOf(v) === i; }).sort();
    }
    return a;
  }
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).sort().forEach(function (k) {
      if (k !== 'refresh' && value[k] !== undefined) out[k] = mysqlCanonical_(value[k], k);
    });
    return out;
  }
  return value;
}
function mysqlDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function mysqlDatabase_() {
  var p = PropertiesService.getScriptProperties();
  return mysqlDigest_([p.getProperty(DBLIVE_CONFIG.props.host) || DBLIVE_CONFIG.host,
    p.getProperty(DBLIVE_CONFIG.props.port) || DBLIVE_CONFIG.port,
    p.getProperty(DBLIVE_CONFIG.props.database) || DBLIVE_CONFIG.database]);
}
function mysqlEpoch_() {
  // Durable epochs cannot revert to an old generation after cache eviction.
  try { return PropertiesService.getScriptProperties().getProperty('MYSQL_READ_EPOCH') || '0'; }
  catch (e) { try { return CacheService.getScriptCache().get('MYSQL_READ_EPOCH_FALLBACK') || '0'; } catch (e2) { return '0'; } }
}
function mysqlInvalidate_() {
  var value = Utilities.getUuid(), done = false;
  try { PropertiesService.getScriptProperties().setProperty('MYSQL_READ_EPOCH', value); done = true; } catch (e) {}
  try { CacheService.getScriptCache().put('MYSQL_READ_EPOCH_FALLBACK', value, 21600); done = true; } catch (e2) {}
  if (!done) Logger.log('MySQL cache invalidation unavailable; bounded cache expiry remains active');
}
function mysqlWithRequest_(scope, user, action, run) {
  if (_mysqlRequest_) return run();
  var r = { scope: scope, user: user, action: action, connection: null, resources: [], stack: [], errors: 0,
    connectionMs: 0, sqlMs: 0, readMs: 0, jsonParseMs: 0, rows: 0 };
  _mysqlRequest_ = r;
  try { return run(); }
  finally {
    r.resources.reverse().forEach(function (resource) { try { resource.close(); } catch (e) {} });
    try { if (r.connection) r.connection.close(); } catch (e) {}
    _mysqlRequest_ = null;
  }
}
function mysqlReading_(name) {
  var r = _mysqlRequest_;
  return !!(r && r.stack[r.stack.length - 1] === name);
}
function mysqlParams_(data) {
  var p = Object.assign({}, data || {});
  ['limit', 'offset', 'box_limit'].forEach(function (k) {
    if (p[k] !== undefined && (!Number.isFinite(Number(p[k])) || Number(p[k]) < 0 || !Number.isInteger(Number(p[k])))) {
      throw new Error('Invalid pagination');
    }
  });
  if (p.offset !== undefined && Number(p.offset) > 1000000) throw new Error('Pagination offset exceeds the supported window');
  return p;
}
function mysqlRead_(def, data, run) {
  var r = _mysqlRequest_;
  if (!r || !r.user) throw new Error('Authorized MySQL request required');
  def.authorize(r); // Runs on hits as well as misses.
  var p = def.normalize(data || {}), start = Date.now(), key = null, hit = null;
  var before = [r.connectionMs, r.sqlMs, r.readMs, r.rows, r.errors, r.jsonParseMs || 0], ok = false;
  try {
    try {
      key = 'mysql_' + mysqlDigest_([mysqlDatabase_(), r.scope, r.action,
        // Entire authority object hashed, never logged; isolates changed grants.
        mysqlCanonical_(r.user), def.name, def.version, def.dependencies, mysqlEpoch_(), mysqlCanonical_(p)]);
      if (def.ttl && !p.refresh) hit = getChunkedCache_(key);
    } catch (cacheError) { key = null; }
    if (hit && hit.v === def.version && Date.now() - hit.at >= 0 && Date.now() - hit.at < def.ttl * 1000 && def.valid(hit.value)) {
      ok = true;
      if (hit.value.status === 'ok') hit.value._mysql = {
        read_at: hit.at, expires_at: hit.at + def.ttl * 1000, cache_hit: true,
        elapsed_ms: Date.now() - start,
        connection_ms: r.connectionMs - before[0], sql_ms: r.sqlMs - before[1],
        read_ms: r.readMs - before[2], json_parse_ms: (r.jsonParseMs || 0) - before[5],
        rows_read: r.rows - before[3]
      };
      return hit.value;
    }
    hit = null;
    r.stack.push(def.name);
    var result;
    try { result = run(p); } finally { r.stack.pop(); }
    ok = def.valid(result);
    if (ok && key && def.ttl && r.errors === before[4]) {
      try { putChunkedCache_(key, { v: def.version, at: Date.now(), value: result }, def.ttl); } catch (cacheWriteError) {}
    }
    if (ok && result.status === 'ok') result._mysql = {
      read_at: Date.now(), expires_at: Date.now() + def.ttl * 1000, cache_hit: false,
      elapsed_ms: Date.now() - start,
      connection_ms: r.connectionMs - before[0], sql_ms: r.sqlMs - before[1],
      read_ms: r.readMs - before[2], json_parse_ms: (r.jsonParseMs || 0) - before[5],
      rows_read: r.rows - before[3]
    };
    return result;
  } finally {
    try {
      var totalMs = Date.now() - start, connectionMs = r.connectionMs - before[0];
      var sqlMs = r.sqlMs - before[1], readMs = r.readMs - before[2], rowCount = r.rows - before[3];
      if (typeof perfRecord_ === 'function' && typeof perfDiagnosticsEnabled_ === 'function' &&
          perfDiagnosticsEnabled_() && (!ok || totalMs >= PERF_TELEMETRY_.SLOW_MS || Math.random() < 0.05)) {
        perfRecord_({ action: 'mysql_read', company: String(r.scope || '').split(':')[0], page: 'mysql',
          elapsed_ms: totalMs, status: ok ? 'SUCCESS' : 'FAILED', diagnostic: true, outcome: ok ? 'success' : 'error',
          mysql_query: def.name, mysql_cache: hit ? 'hit' : 'miss', mysql_connection_ms: connectionMs,
          mysql_sql_ms: sqlMs, mysql_result_read_ms: readMs, mysql_rows: rowCount });
      }
    } catch (telemetryError) {}
  }
}
function mysqlResource_(raw, methods, timed) {
  var r = _mysqlRequest_, closed = false, out = {};
  out.close = function () { if (!closed) { closed = true; try { raw.close(); } catch (e) {} } };
  methods.forEach(function (name) {
    out[name] = function () {
      var t = Date.now();
      try {
        var value = raw[name].apply(raw, arguments);
        if (name === 'next' && value) r.rows++;
        return value;
      } finally { if (timed) r.readMs += Date.now() - t; }
    };
  });
  r.resources.push(out);
  return out;
}
function mysqlStatement_(raw) {
  var r = _mysqlRequest_;
  var s = mysqlResource_(raw, ['setObject', 'setString', 'setInt', 'setLong', 'setDouble', 'setBoolean', 'setNull'], false);
  s.executeQuery = function () {
    var t = Date.now(), rs;
    try { rs = raw.executeQuery.apply(raw, arguments); }
    catch (e) { r.errors++; throw new Error('MySQL read failed; query diagnostics contain no filter values.'); }
    finally { r.sqlMs += Date.now() - t; }
    return mysqlResource_(rs, ['next', 'getString', 'getObject', 'getInt', 'getLong', 'getDouble', 'getMetaData'], true);
  };
  s.executeUpdate = function () {
    var value = raw.executeUpdate.apply(raw, arguments);
    // Includes writes whose follow-up mapping fails: a committed mutation must
    // invalidate even if the enclosing action cannot return a success envelope.
    mysqlInvalidate_();
    return value;
  };
  return s;
}
function mysqlConnection_() {
  var r = _mysqlRequest_;
  if (!r.connection) {
    var t = Date.now();
    try { r.connection = dbOpenConnection_(); } finally { r.connectionMs += Date.now() - t; }
  }
  return {
    prepareStatement: function (sql) { return mysqlStatement_(r.connection.prepareStatement(sql)); },
    createStatement: function () { return mysqlStatement_(r.connection.createStatement()); },
    close: function () {} // Borrowed; the execution owner closes in finally.
  };
}
function mysqlViewerRead_(name, data, user, run) {
  dbGuard_(user);
  return mysqlWithRequest_('viewer', user, name, function () {
    return mysqlRead_({ name: name, version: 1, dependencies: ['mysql:*'],
      ttl: /Columns|Tables/.test(name) ? 300 : 0,
      normalize: mysqlParams_, authorize: function () { dbGuard_(user); },
      columns: 'Existing administrator-selected schema', rowLimit: DBLIVE_CONFIG.maxRows,
      valid: function (v) { return !!(v && v.status === 'ok'); }
    }, data, run);
  });
}

function dbOpenConnection_() {
  const props = PropertiesService.getScriptProperties();
  const host = props.getProperty(DBLIVE_CONFIG.props.host) || DBLIVE_CONFIG.host;
  const port = props.getProperty(DBLIVE_CONFIG.props.port) || DBLIVE_CONFIG.port;
  const db = props.getProperty(DBLIVE_CONFIG.props.database) || DBLIVE_CONFIG.database;
  const user = (dbLiveProp_(props, DBLIVE_CONFIG.props.user, DBLIVE_CONFIG.legacyProps.user) || '').trim();
  const pass = dbLiveProp_(props, DBLIVE_CONFIG.props.pass, DBLIVE_CONFIG.legacyProps.pass) || '';
  var missingCreds = [];
  if (!user) missingCreds.push('MYSQL_USER');
  if (!pass) missingCreds.push('MYSQL_PASSWORD');
  if (missingCreds.length > 0) throw new Error('MySQL credentials not configured (' + missingCreds.join(', ') + ' missing). Add them in Project Settings → Script properties of this script project — never put passwords in code.');
  const url = 'jdbc:mysql://' + host + ':' + port + '/' + db;
  return Jdbc.getConnection(url, user, pass);
}

/**
 * Lists all tables in the database.
 */
function dbListTables_(data, user) {
  if (typeof mysqlRead_ === 'function' && !mysqlReading_('dbListTables_')) {
    return mysqlViewerRead_('dbListTables_', data, user, function (p) { return dbListTables_(p, user); });
  }
  
  
  
  dbGuard_(user);
  let conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.createStatement();
    rs = stmt.executeQuery('SHOW TABLES');
    const tables = [];
    while (rs.next()) {
      tables.push(rs.getString(1));
    }
    return { status: 'ok', tables: tables };
  } catch (err) {
    Logger.log('dbListTables_ failed; private database details omitted');
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Returns column info for a table: name, type, key, nullable, default.
 */
function dbGetColumns_(data, user) {
  if (typeof mysqlRead_ === 'function' && !mysqlReading_('dbGetColumns_')) {
    return mysqlViewerRead_('dbGetColumns_', data, user, function (p) { return dbGetColumns_(p, user); });
  }
  
  
  
  dbGuard_(user);
  if (!data.table) throw new Error('table name required');
  const safeTable = dbSanitizeIdentifier_(data.table);
  let conn, stmt, rs;
  try {
    conn = dbGetConnection_();
    stmt = conn.prepareStatement('SHOW COLUMNS FROM ' + safeTable);
    rs = stmt.executeQuery();
    const columns = [];
    while (rs.next()) {
      columns.push({
        name: rs.getString('Field'),
        type: rs.getString('Type'),
        key: rs.getString('Key'),
        nullable: rs.getString('Null'),
        default: rs.getString('Default'),
        extra: rs.getString('Extra')
      });
    }
    return { status: 'ok', columns: columns };
  } catch (err) {
    Logger.log('dbGetColumns_ failed; private database details omitted');
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Executes a SELECT query with optional WHERE, ORDER BY, LIMIT, OFFSET.
 * Returns { columns, rows, total }.
 */
function dbQuery_(data, user) {
  if (typeof mysqlRead_ === 'function' && !mysqlReading_('dbQuery_')) {
    return mysqlViewerRead_('dbQuery_', data, user, function (p) { return dbQuery_(p, user); });
  }
  
  
  
  dbGuard_(user);
  if (!data.table) throw new Error('table name required');
  const safeTable = dbSanitizeIdentifier_(data.table);
  const limit = Math.min(Math.max(Math.floor(Number(data.limit)) || DBLIVE_CONFIG.maxRows, 1), DBLIVE_CONFIG.maxRows);
  const offset = Math.max(Number(data.offset) || 0, 0);

  let conn, stmt, rs, countStmt, countRs;
  try {
    conn = dbGetConnection_();

    // Build WHERE clause
    let whereSql = '';
    const params = [];
    if (data.where && typeof data.where === 'object') {
      const conditions = [];
      for (const col in data.where) {
        if (data.where[col] === null || data.where[col] === undefined) continue;
        conditions.push(dbSanitizeIdentifier_(col) + ' = ?');
        params.push(data.where[col]);
      }
      if (conditions.length > 0) {
        whereSql = ' WHERE ' + conditions.join(' AND ');
      }
    }

    // Get total count
    countStmt = conn.prepareStatement('SELECT COUNT(*) AS cnt FROM ' + safeTable + whereSql);
    dbBindParams_(countStmt, params);
    countRs = countStmt.executeQuery();
    const total = countRs.next() ? countRs.getInt('cnt') : 0;

    // Build main query
    let querySql = 'SELECT * FROM ' + safeTable + whereSql;
    if (data.orderBy) {
      const safeOrder = dbSanitizeOrderBy_(data.orderBy);
      querySql += ' ORDER BY ' + safeOrder;
    }
    querySql += ' LIMIT ' + limit + ' OFFSET ' + offset;

    stmt = conn.prepareStatement(querySql);
    dbBindParams_(stmt, params);
    rs = stmt.executeQuery();

    const meta = rs.getMetaData();
    const colCount = meta.getColumnCount();
    const columns = [];
    for (let i = 1; i <= colCount; i++) {
      columns.push(meta.getColumnName(i));
    }

    const rows = [];
    while (rs.next()) {
      const row = {};
      for (let i = 1; i <= colCount; i++) {
        const val = rs.getObject(i);
        row[columns[i - 1]] = val !== null ? String(val) : null;
      }
      rows.push(row);
    }

    return { status: 'ok', columns: columns, rows: rows, total: total, limit: limit, offset: offset };
  } catch (err) {
    Logger.log('dbQuery_ failed; private database details omitted');
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (countRs) countRs.close();
    if (countStmt) countStmt.close();
    if (conn) conn.close();
  }
}

/**
 * Inserts a new row. data.table, data.values = { col: val, ... }
 */
function dbInsert_(data, user) {
  dbGuard_(user);
  if (!_mysqlRequest_) return mysqlWithRequest_('viewer', user, 'dbInsert_', function () { return dbInsert_(data, user); });
  if (!data.table || !data.values || Object.keys(data.values).length === 0) {
    throw new Error('table and values required');
  }
  const safeTable = dbSanitizeIdentifier_(data.table);
  const cols = Object.keys(data.values);
  const safeCols = cols.map(dbSanitizeIdentifier_);
  const placeholders = cols.map(function () { return '?'; });

  let conn, stmt;
  try {
    conn = dbGetConnection_();
    const sql = 'INSERT INTO ' + safeTable + ' (' + safeCols.join(', ') + ') VALUES (' + placeholders.join(', ') + ')';
    stmt = conn.prepareStatement(sql);
    for (let i = 0; i < cols.length; i++) {
      stmt.setObject(i + 1, data.values[cols[i]]);
    }
    const affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected };
  } catch (err) {
    Logger.log('dbInsert_ failed; private database details omitted');
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Updates rows. data.table, data.where = { pk: val }, data.values = { col: val }
 */
function dbUpdate_(data, user) {
  dbGuard_(user);
  if (!_mysqlRequest_) return mysqlWithRequest_('viewer', user, 'dbUpdate_', function () { return dbUpdate_(data, user); });
  if (!data.table || !data.where || !data.values || Object.keys(data.values).length === 0) {
    throw new Error('table, where, and values required');
  }
  const safeTable = dbSanitizeIdentifier_(data.table);

  // Build SET clause
  const setParts = [];
  const setVals = [];
  for (const col in data.values) {
    setParts.push(dbSanitizeIdentifier_(col) + ' = ?');
    setVals.push(data.values[col]);
  }

  // Build WHERE clause
  const whereParts = [];
  const whereVals = [];
  for (const col in data.where) {
    whereParts.push(dbSanitizeIdentifier_(col) + ' = ?');
    whereVals.push(data.where[col]);
  }

  let conn, stmt;
  try {
    conn = dbGetConnection_();
    const sql = 'UPDATE ' + safeTable + ' SET ' + setParts.join(', ') + ' WHERE ' + whereParts.join(' AND ');
    stmt = conn.prepareStatement(sql);
    const allVals = setVals.concat(whereVals);
    for (let i = 0; i < allVals.length; i++) {
      stmt.setObject(i + 1, allVals[i]);
    }
    const affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected };
  } catch (err) {
    Logger.log('dbUpdate_ failed; private database details omitted');
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Deletes rows. data.table, data.where = { col: val }
 */
function dbDelete_(data, user) {
  dbGuard_(user);
  if (!_mysqlRequest_) return mysqlWithRequest_('viewer', user, 'dbDelete_', function () { return dbDelete_(data, user); });
  if (!data.table || !data.where || Object.keys(data.where).length === 0) {
    throw new Error('table and where required');
  }
  const safeTable = dbSanitizeIdentifier_(data.table);

  const whereParts = [];
  const whereVals = [];
  for (const col in data.where) {
    whereParts.push(dbSanitizeIdentifier_(col) + ' = ?');
    whereVals.push(data.where[col]);
  }

  let conn, stmt;
  try {
    conn = dbGetConnection_();
    const sql = 'DELETE FROM ' + safeTable + ' WHERE ' + whereParts.join(' AND ');
    stmt = conn.prepareStatement(sql);
    for (let i = 0; i < whereVals.length; i++) {
      stmt.setObject(i + 1, whereVals[i]);
    }
    const affected = stmt.executeUpdate();
    return { status: 'ok', affected: affected };
  } catch (err) {
    Logger.log('dbDelete_ failed; private database details omitted');
    throw err;
  } finally {
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

/**
 * Aggregates a column: COUNT, SUM, AVG, MIN, MAX, optionally GROUP BY another column.
 */
function dbAggregate_(data, user) {
  if (typeof mysqlRead_ === 'function' && !mysqlReading_('dbAggregate_')) {
    return mysqlViewerRead_('dbAggregate_', data, user, function (p) { return dbAggregate_(p, user); });
  }
  
  
  
  dbGuard_(user);
  if (!data.table || !data.column) throw new Error('table and column required');
  const safeTable = dbSanitizeIdentifier_(data.table);
  const safeCol = dbSanitizeIdentifier_(data.column);
  const func = (data.func || 'COUNT').toUpperCase();
  const validFuncs = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
  if (validFuncs.indexOf(func) === -1) throw new Error('Invalid aggregate function: ' + func);

  let conn, stmt, rs;
  try {
    conn = dbGetConnection_();

    if (data.groupBy) {
      const safeGroup = dbSanitizeIdentifier_(data.groupBy);
      stmt = conn.prepareStatement('SELECT ' + safeGroup + ', ' + func + '(' + safeCol + ') AS result FROM ' + safeTable + ' WHERE ' + safeCol + ' IS NOT NULL GROUP BY ' + safeGroup + ' ORDER BY result DESC LIMIT 100');
    } else {
      stmt = conn.prepareStatement('SELECT ' + func + '(' + safeCol + ') AS result FROM ' + safeTable + ' WHERE ' + safeCol + ' IS NOT NULL');
    }
    rs = stmt.executeQuery();

    if (data.groupBy) {
      const rows = [];
      while (rs.next()) {
        rows.push({ group: String(rs.getObject(1)), value: rs.getObject(2) });
      }
      return { status: 'ok', func: func, rows: rows };
    } else {
      const result = rs.next() ? rs.getObject(1) : null;
      return { status: 'ok', func: func, result: result };
    }
  } catch (err) {
    Logger.log('dbAggregate_ failed; private database details omitted');
    throw err;
  } finally {
    if (rs) rs.close();
    if (stmt) stmt.close();
    if (conn) conn.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────

function dbSanitizeIdentifier_(name) {
  // Allow only alphanumeric and underscore, wrap in backticks
  const clean = String(name).replace(/[^a-zA-Z0-9_]/g, '');
  if (!clean || /^[0-9]/.test(clean)) throw new Error('Invalid identifier: ' + name);
  return '`' + clean + '`';
}

function dbSanitizeOrderBy_(orderBy) {
  // "col ASC", "col DESC", or just "col" → safe SQL fragment
  const parts = String(orderBy).trim().split(/\s+/);
  const col = dbSanitizeIdentifier_(parts[0]);
  const dir = parts[1] && parts[1].toUpperCase() === 'DESC' ? ' DESC' : ' ASC';
  return col + dir;
}

function dbBindParams_(stmt, params) {
  for (let i = 0; i < params.length; i++) {
    stmt.setObject(i + 1, params[i]);
  }
}

// ─── clients_AR live review (Top Chemical: tc_main_review) ──────────
// Server-side paginated read + single-row revise against the MySQL view
// `clients_AR`. Called via TopChemical company actions (get_main_review /
// revise_main_review) so page-level authority applies; no dbGuard_ here.



/* ===================== 7. ROUTING / RENDERING / ARTIFACT DELIVERY ====== */
/**
 * Code.js
 * RESPONSIBILITY: doGet, doPost, ROUTES map, executeCompanyAction_, json_, include.
 * Routing and dispatch glue ONLY. No business logic. Target: <150 lines.
 */

/* Globals shared with HTML templates via include() (set per request in doGet). */
var SCRIPT_URL = '';
var CURRENT_SESSION_TOKEN = '';
/* [RT-8] ?nominify=1 serves the shared files exactly as they are on disk.
 * The minifier is the change in this programme that can ship silently wrong —
 * a file that still parses and behaves differently — so there is a way to turn
 * it off without a deploy while it is being trusted. */
var NO_MINIFY = false;
var CURRENT_USER = null;

function doGet(e) {
  resetRecordCache_();
  // System kill switch — checked before anything else, including download
  // branches and company registration. A disabled system blocks every action…
  // except: an authenticated SUPER ADMIN gets the recovery screen with a
  // one-click re-open button (the only app-side lever while shut down).
  if (!isSystemEnabled_()) {
    const saToken = String(e.parameter.sessionToken || '').trim();
    let isSuperAdmin = false;
    if (saToken) {
      try {
        const saAuth = authenticateSystemUser_(saToken);
        isSuperAdmin = !!(saAuth && saAuth.authorized && saAuth.user && saAuth.user.isSuperAdmin);
      } catch (err) { isSuperAdmin = false; }
    }
    if (isSuperAdmin) return renderSystemShutdownAdminPage_(ScriptApp.getService().getUrl(), saToken);
    return renderSystemDisabledPage_();
  }
  ensureCompaniesRegistered_();
  const download = String(e.parameter.download || '').trim();
  if (download === 'print_file') return dispatchCompanyArtifact_('printFile', e.parameter);
  if (download === 'print_barcode') return dispatchCompanyArtifact_('printBarcode', e.parameter);
  if (download === 'print_product_barcode') return dispatchCompanyArtifact_('printProductBarcode', e.parameter);
  if (download === 'attachment' || download === 'doc_file') return serveAttachment_(e.parameter);
  if (download === 'payroll_report') return dispatchCompanyArtifact_('payrollReport', e.parameter);
  if (download === 'budget_print') return dispatchCompanyArtifact_('budgetPrint', e.parameter);
  if (download === 'erp_invoice' || download === 'appsheet_invoice') return serveErpInvoice_(e.parameter);
  const action = (e.parameter.action || 'login').trim();
  const scriptUrl = ScriptApp.getService().getUrl();
  SCRIPT_URL = scriptUrl;
  CURRENT_SESSION_TOKEN = String(e.parameter.sessionToken || '').trim();
  NO_MINIFY = String(e.parameter.nominify || '') === '1';

  // Session-expired interstitial: API layer redirects here; the button goes on
  // to the login page. Shown before any auth/page lookup.
  if (action === 'session_expired') return renderSessionExpiredPage_(scriptUrl);
  if ((action === 'login' || action === 'ERPDashboard') && String(e.parameter.expired || '').trim() === '1') {
    return renderSessionExpiredPage_(scriptUrl);
  }

  // A registry entry with no template is a permission token, not a page (see
  // valley_cost_view in Company_ValleyFoods_Registry.js). It must never be
  // rendered — treat it exactly like an unknown action and bounce home, rather
  // than reaching createTemplateFromFile(undefined) below.
  const page = getAllPages_().find(p => p.action === action && p.template);
  if (!page) {
    // Unknown/deleted action — bounce home instead of a dead-end message.
    return _frame(HtmlService.createHtmlOutput(_topNavScript(scriptUrl + '?action=ERPDashboard&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || ''))));
  }

  let authUser = null;
  if (!page.public) {
    const token = (e.parameter.sessionToken || '').trim();
    const auth = token ? authenticateSystemUser_(token) : { authorized: false };
    if (!auth.authorized) {
      if (token) return renderSessionExpiredPage_(scriptUrl);
      return _frame(HtmlService.createHtmlOutput(_topNavScript(scriptUrl + '?action=login')));
    }
    authUser = auth.user;
    try { SessionManager_.touch(e.parameter.sessionToken); } catch (e) {}
    if (!checkPageAccessForUI_(authUser, page.accessPage || action)) {
      // §5.2 L2 + §5.4: unified screen, no reveal of attempted page. backUrl is first authorized page or ERPDashboard with logout.
      let backUrl = scriptUrl + '?action=ERPDashboard&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || '');
      try {
        const first = getFirstAuthorizedPageForUser_(authUser);
        if (first) backUrl = scriptUrl + '?action=' + encodeURIComponent(first) + '&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || '');
      } catch(err){}
      let blockCompany = '';
      for (const key in COMPANY_REGISTRY) {
        const c = COMPANY_REGISTRY[key];
        if (c.pages && c.pages.some(p => p.action === action)) { blockCompany = key; break; }
      }
      // §5.3 zero-authorized: still show unified screen; logout affordance handled inside render.
      return renderAccessDeniedPage_(page.title || action, backUrl, blockCompany);
    }
  }

  /* A registry entry can name a template that is not in the deployment — a page
   * registered by one branch whose HTML landed on another, or a file left out of
   * a push. createTemplateFromFile throws a raw Apps Script exception at that
   * point ("No HTML file named X was found"), which reaches the user as a stack
   * trace on a white page and tells them nothing they can act on.
   *
   * The router already handles the two neighbouring cases — an unknown action,
   * and an entry deliberately registered with no template — so this is the third
   * one, and it fails the same way: a page that says what is wrong, with a way
   * back, and a console line naming the missing file for whoever deploys. */
  let tmpl;
  try {
    tmpl = HtmlService.createTemplateFromFile(page.template);
  } catch (missingTemplate) {
    try {
      console.error('doGet: action "' + action + '" is registered against template "' +
        page.template + '", which is not in this deployment — ' + missingTemplate.message);
    } catch (logErr) {}
    let backUrl = scriptUrl + '?action=ERPDashboard&sessionToken=' +
      encodeURIComponent(e.parameter.sessionToken || '');
    try {
      const firstPage = authUser ? getFirstAuthorizedPageForUser_(authUser) : null;
      if (firstPage) {
        backUrl = scriptUrl + '?action=' + encodeURIComponent(firstPage) +
          '&sessionToken=' + encodeURIComponent(e.parameter.sessionToken || '');
      }
    } catch (backErr) {}
    return renderMissingPagePage_(page.title || action, page.template, backUrl);
  }
  tmpl.user = authUser;
  CURRENT_USER = authUser;
  tmpl.email = (e.parameter.email || '').trim();
  tmpl.purchaseCode = (e.parameter.purchase_code || '').trim();
  tmpl.currentAction = action;
  tmpl.pageParams = JSON.stringify(e.parameter || {});
  tmpl.companyPages = '[]';
  for (const key in COMPANY_REGISTRY) {
    const c = COMPANY_REGISTRY[key];
    if (c.pages && c.pages.some(p => p.action === action)) {
      tmpl.companyPages = JSON.stringify(
        c.pages
          .filter(p => p.nav !== false && (!authUser || checkPageAccessForUI_(authUser, p.action)))
          .map(p => ({ action: p.action, label: p.label || p.title }))
      );
      break;
    }
  }
  var rendered = tmpl.evaluate().getContent();
  rendered = rendered.split('__APP_WEB_URL__').join(scriptUrl)
                   .split('__APP_SESSION_TOKEN__').join(CURRENT_SESSION_TOKEN);
  var userNamesJson = '{}';
  try { userNamesJson = JSON.stringify(userNameMap_()).replace(/</g, '\\u003c'); } catch (eUN) {}
  /* Phase C/D: the headline RUM switch and its uniform journey draw are read
   * once here, next to the existing PERF_LOG injection. Both reads are
   * fail-open: a throwing property service injects safe defaults (off / 0.10)
   * instead of failing the page render, and no page behavior changes. */
  var perfRumFlag = false, perfRumRate = 0.10;
  try { perfRumFlag = perfRumEnabled_(); perfRumRate = perfRumRate_(); } catch (ePerfRum) {}
  var headInjection = '<meta name="app-web-url" content="' + scriptUrl + '">'
    + '<script>try{window.scriptUrl=document.querySelector(\'meta[name="app-web-url"]\').getAttribute(\'content\')||\'\';}catch(e){}</' + 'script>'
    /* The write request guard must not depend on localStorage for identity.
     * Safari / Apps Script iframe origins may expose the valid URL session while
     * the login page's localStorage entry is unavailable. The server has already
     * authenticated this page, so inject only that authoritative email. */
    + '<script>window.AUTH_USER_EMAIL=' + JSON.stringify(String((authUser && authUser.email) || '').trim().toLowerCase()).replace(/</g, '\\u003c') + ';</' + 'script>'
    + '<script>window.USER_NAMES=' + userNamesJson + ';</' + 'script>'
    // Phase 0b: tells the client whether a measurement window is open, so page
    // timings cost nothing at all while it is closed.
    // Phase C/D: PERF_RUM is the independent headline RUM switch (Phase B
    // script property) and PERF_RUM_RATE its journey sample probability.
    + '<script>window.PERF_LOG=' + (perfLogReadsEnabled_() ? 'true' : 'false')
    + ';window.PERF_RUM=' + (perfRumFlag ? 'true' : 'false')
    + ';window.PERF_RUM_RATE=' + (isFinite(perfRumRate) ? Number(perfRumRate) : 0.10) + ';</' + 'script>';
  rendered = rendered.replace('<head>', '<head>' + headInjection);
  // viewport-fit=cover opts the page into the display's safe-area insets. It
  // has no effect at all on Windows or on Android Chrome in a browser tab; on
  // an iPhone it is what makes env(safe-area-inset-*) resolve to anything but
  // zero, which activates the --safe-* tokens CSS_Tokens already defines and
  // the home FAB and drawer already read. Without it the notch and the home
  // indicator sit on top of the content in landscape.
  return _frame(HtmlService.createHtmlOutput(rendered)).setTitle(page.title).addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Friendly access-denied page — unified §5.4. Never reveals attempted page/action (§5.4). Theme tokens only. */
function renderAccessDeniedPage_(pageTitle, backUrl, companyUid) {
  const theme = getCompanyBlockTheme_(companyUid);
  // pageTitle intentionally NOT rendered — unified message only (ERP_MESSAGES.NOT_AUTHORIZED)
  const msg = (typeof ERP_MESSAGES !== 'undefined' && ERP_MESSAGES.NOT_AUTHORIZED) ? ERP_MESSAGES.NOT_AUTHORIZED : 'غير مصرح لك بالوصول';
  const loginUrl = (backUrl && backUrl.indexOf('sessionToken=') !== -1) ? backUrl.split('?')[0] + '?action=login' : backUrl;
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,' + theme.from + ' 0%,' + theme.to + ' 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#128274;</div>' +
        '<h2 style="margin:0;font-size:19px;">' + msg + '</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;line-height:1.7;">ليس لديك صلاحية للوصول إلى هذه الصفحة. إذا كنت تحتاج صلاحية، تواصل مع مدير النظام لإضافتها لدورك من شاشة «صلاحيات الأدوار».</p>' +
         '<a href="' + backUrl + '" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 28px;background:' + theme.to + ';color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin:4px;">' +
        '&#127968;&nbsp; العودة إلى الرئيسية</a>' +
        ' <a href="' + loginUrl + '" onclick="try{localStorage.removeItem(\'erp_session\');}catch(e){}; window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 22px;background:#fff;color:' + theme.to + ';border:1px solid ' + theme.to + ';border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;margin:4px;">تسجيل خروج</a>' +
      '</div>' +
    '</div>' +
    '</body></html>'
  )).setTitle(msg);
}

/**
 * A page is registered but its HTML file is not in this deployment.
 *
 * This is a deployment fault, not a user fault and not a permissions fault, so
 * it says so rather than borrowing the access-denied wording — a user sent to
 * "you are not authorised" for a file that was never pushed will ask for a
 * grant that would change nothing. The template name is shown because the only
 * person who can act on this needs it, and it reveals nothing sensitive: it is
 * a file name already listed in the registry.
 */
function renderMissingPagePage_(pageTitle, templateName, backUrl) {
  const esc = function (v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const title = 'الصفحة غير متوفرة في هذه النسخة';
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:460px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#64748b 0%,#334155 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#128679;</div>' +
        '<h2 style="margin:0;font-size:19px;">' + title + '</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.8;">صفحة «' + esc(pageTitle) +
          '» مُعرَّفة في النظام لكن ملفها غير موجود في النسخة المنشورة حالياً.</p>' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">' +
          'هذه مشكلة في النشر وليست مشكلة صلاحيات — إضافة صلاحية لن تحلّها. ' +
          'أبلغ مدير النظام بالملف الناقص:</p>' +
        '<code style="display:block;margin:0 0 20px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;' +
          'border-radius:8px;font-size:12.5px;direction:ltr;color:#334155;">' + esc(templateName) + '.html</code>' +
        '<a href="' + backUrl + '" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 28px;background:#334155;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin:4px;">' +
        '&#127968;&nbsp; العودة إلى الرئيسية</a>' +
      '</div>' +
    '</div>' +
    '</body></html>'
  )).setTitle(title);
}

/** Session-expired interstitial — button continues to the login page. */
function renderSessionExpiredPage_(scriptUrl) {
  const loginUrl = scriptUrl + '?action=login';
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#92400e 0%,#d97706 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#8987;</div>' +
        '<h2 style="margin:0;font-size:19px;">انتهت صلاحية الجلسة</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 8px;color:#374151;font-size:14px;">انتهت مدة تسجيل الدخول الخاصة بك لأسباب أمنية.</p>' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">اضغط الزر بالأسفل لتسجيل الدخول من جديد ومتابعة العمل.</p>' +
         '<a href="' + loginUrl + '" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
        ' style="display:inline-block;padding:11px 32px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">' +
        '&#128273;&nbsp; تسجيل الدخول</a>' +
      '</div>' +
    '</div>' +
    '</body></html>'
  )).setTitle('انتهت صلاحية الجلسة');
}

/** Kill-switch block page (non-admin view) — same card language as the access-denied page. */
function renderSystemDisabledPage_() {
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#9888;</div>' +
        '<h2 style="margin:0;font-size:19px;">عطل في السيستم</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 8px;color:#374151;font-size:14px;">النظام متوقف مؤقتاً للصيانة.</p>' +
        '<p style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">يرجى المحاولة مرة أخرى لاحقاً. إذا كان الاستمرار مستعجلاً تواصل مع مدير النظام.</p>' +
        (url
          ? '<a href="' + url + '?action=login" onclick="window.top.location.href=this.getAttribute(\'href\');return false;"' +
            ' style="display:inline-block;padding:11px 32px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">' +
            '&#8635;&nbsp; إعادة المحاولة</a>'
          : '') +
      '</div>' +
    '</div>' +
    '</body></html>'
  ).setTitle('عطل في السيستم'));
}

/**
 * Super-admin shutdown recovery page — shown ONLY to authenticated super
 * admins while the kill switch is engaged. Offers a one-click re-open via
 * toggle_kill_switch (the sole action permitted through the router while the
 * system is disabled).
 */
function renderSystemShutdownAdminPage_(scriptUrl, sessionToken) {
  var safeToken = String(sessionToken || '');
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="margin:0;font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;">' +
    '<div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px;width:100%;overflow:hidden;text-align:center;">' +
      '<div style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:28px 20px;color:#fff;">' +
        '<div style="width:64px;height:64px;margin:0 auto 12px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">&#9888;</div>' +
        '<h2 style="margin:0;font-size:19px;">النظام متوقف حالياً</h2>' +
      '</div>' +
      '<div style="padding:24px 20px;">' +
        '<p style="margin:0 0 8px;color:#374151;font-size:14px;">تم إيقاف النظام من لوحة الإدارة.</p>' +
        '<p id="shut-msg" style="margin:0 0 20px;color:#6b7280;font-size:12.5px;line-height:1.7;">بصفتك مدير النظام يمكنك إعادة تشغيله فوراً بالزر بالأسفل، أو بتعديل خلية B2 في جدول ERP_system_work.</p>' +
        '<button id="shut-btn" onclick="reopenSystem()"' +
        ' style="display:inline-block;padding:11px 32px;background:#16a34a;color:#fff;border:0;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;">' +
        '&#8635;&nbsp; إعادة تشغيل النظام</button>' +
      '</div>' +
    '</div>' +
    '<script>' +
    'function reopenSystem(){' +
    '  var b=document.getElementById("shut-btn");var m=document.getElementById("shut-msg");' +
    '  b.disabled=true;b.style.opacity=".6";m.textContent="جاري إعادة التشغيل...";' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){window.top.location.href=' + JSON.stringify(scriptUrl + '?action=ERPDashboard&sessionToken=' + safeToken) + ';})' +
    '    .withFailureHandler(function(e){b.disabled=false;b.style.opacity="";m.textContent=(e&&e.message)?e.message:"فشل التشغيل، حاول مجدداً.";})' +
    '    .apiRouter({action:"toggle_kill_switch",payload:{on:true},sessionToken:' + JSON.stringify(safeToken) + '});' +
    '}' +
    '</script>' +
    '</body></html>'
  ).setTitle('إيقاف النظام'));
}

const ROUTES = {
  'login_user': { handler: handleLoginWithDevice_, requireAuth: false },
  'request_password_setup_code': { handler: handleRequestPasswordSetupCode_, requireAuth: false },
  'setup_password': { handler: handleSetupWithDevice_, requireAuth: false },
  'ping': { handler: handlePing_, requireAuth: true },
  'get_dashboard_data': { handler: getDashboardData_, requireAuth: true },
  'company_action': { handler: executeCompanyAction_, requireAuth: true },
  // T-2 — the ONLY unauthenticated door into a company namespace. A company
  // registers no `publicDispatch` unless it opts in (only AssessmentCenter
  // does, for its candidate-facing pages), so this route is inert for every
  // other company (asserted by ac1_wiring.js).
  'company_public_action': { handler: executeCompanyPublicAction_, requireAuth: false },
  'admin_list_companies': { handler: adminListCompanies_, requireAuth: true },
  'admin_save_company': { handler: adminSaveCompany_, requireAuth: true },
  'admin_list_users': { handler: adminListUsers_, requireAuth: true },
  'admin_save_user': { handler: adminSaveUser_, requireAuth: true },
  'admin_list_matrix': { handler: adminListMatrix_, requireAuth: true },
  'admin_save_matrix': { handler: adminSaveMatrix_, requireAuth: true },
  'admin_list_pages': { handler: adminListPages_, requireAuth: true },
  'admin_save_pages': { handler: adminSavePages_, requireAuth: true },
  'admin_list_currency': { handler: adminListCurrency_, requireAuth: true },
  'admin_save_currency': { handler: adminSaveCurrency_, requireAuth: true },
  'admin_delete_currency': { handler: adminDeleteCurrency_, requireAuth: true },
  'admin_delete_company': { handler: adminDeleteCompany_, requireAuth: true },
  'admin_delete_user': { handler: adminDeleteUser_, requireAuth: true },
  'admin_delete_matrix_row': { handler: adminDeleteMatrixRow_, requireAuth: true },
  'admin_delete_page': { handler: adminDeletePage_, requireAuth: true },
  'admin_list_invoices': { handler: adminListInvoices_, requireAuth: true },
  'admin_save_invoice': { handler: adminSaveInvoice_, requireAuth: true },
  'admin_delete_invoice': { handler: adminDeleteInvoice_, requireAuth: true },
  'toggle_kill_switch': { handler: toggleKillSwitch_, requireAuth: true },
  'list_user_views': { handler: list_user_views_, requireAuth: true },
  'save_user_view': { handler: save_user_view_, requireAuth: true },
  'get_record_history': { handler: get_record_history_, requireAuth: true },
  'list_my_sessions': { handler: list_my_sessions_, requireAuth: true },
  'revoke_session': { handler: revoke_session_, requireAuth: true },
  'revoke_all_sessions': { handler: revoke_all_sessions_, requireAuth: true },
  'logout': { handler: logout_, requireAuth: true },
  'get_erp_session_meta': { handler: get_erp_session_meta_, requireAuth: true },
  'cleanup_sessions': { handler: cleanupOldSessions_, requireAuth: true },
  'backfill_attachment_ids': { handler: backfillAttachmentIds_, requireAuth: true },
  'customs_office_path_repair': { handler: companyArtifactRoute_, requireAuth: true },
  'install_triggers': { handler: installTriggers_, requireAuth: true },
  'install_retention_trigger': { handler: installRetentionTrigger_, requireAuth: true },
  'archive_old_records': { handler: archiveOldRecordsRoute_, requireAuth: true },
  'daily_csv_backup': { handler: dailyCsvBackupRoute_, requireAuth: true },
  'sys_download_backups': { handler: sysDownloadBackupsRoute_, requireAuth: true },
  'install_daily_backup_trigger': { handler: installDailyBackupTriggerRoute_, requireAuth: true },
  'log_client_error': { handler: logClientError_, requireAuth: false },
  /* Phase B: authenticated ingestion only. Identity and authority come from the
     session; payload.user and payload.url are ignored, never stored. */
  'log_client_perf': { handler: logClientPerf_, requireAuth: true },
  /* [RT-9] The soft-navigation body route. requireAuth is true and the handler
     ALSO runs checkPageAccessForUI_ on the page being asked for — being logged
     in is not the same as being allowed to see this page, and this endpoint
     must not be the one place where those two are confused. */
  'get_page_body': { handler: getPageBody_, requireAuth: true },
  /* [RT-10] Super-admin only; the handler checks, not just the route. */
  'get_perf_dashboard': { handler: getPerfDashboard_, requireAuth: true },
  'get_admin_performance': { handler: getAdminPerformance_, requireAuth: true },
  /* Read-only request-status lookup for the client recovery poll. Authenticated;
     the handler resolves the tenant from identity and never trusts a
     client-supplied database ID or email. Never mutates. */
  'request_status': { handler: requestStatusRoute_, requireAuth: true },

  // ─── MySQL Live Module (shared Code.js section) ──────────
  'db_list_tables': { handler: dbListTables_, requireAuth: true },
  'db_get_columns': { handler: dbGetColumns_, requireAuth: true },
  'db_query':       { handler: dbQuery_,       requireAuth: true },
  'db_insert':      { handler: dbInsert_,      requireAuth: true },
  'db_update':      { handler: dbUpdate_,      requireAuth: true },
  'db_delete':      { handler: dbDelete_,      requireAuth: true },
  'db_aggregate':   { handler: dbAggregate_,   requireAuth: true }
};

/* An Apps Script time trigger is the only legitimate caller of the two public
 * maintenance wrappers. A client-side RPC can provide JSON but never the
 * platform trigger object, so both the event UID and registered handler name
 * must match before the wrapper performs work. */
function isVerifiedTimeTrigger_(e, handlerName) {
  const uid = String(e && e.triggerUid || '').trim();
  if (!uid || !handlerName) return false;
  try {
    return ScriptApp.getProjectTriggers().some(function (trigger) {
      return String(trigger.getUniqueId()) === uid && trigger.getHandlerFunction() === handlerName;
    });
  } catch (err) {
    return false;
  }
}

/* All browser download endpoints pass through this single fail-closed gate.
 * The tenant is derived from the authenticated identity or a fixed artifact
 * policy, never trusted from a request parameter. */
function authorizeArtifact_(params, policy) {
  params = params || {};
  policy = policy || {};
  const token = String(params.sessionToken || '').trim();
  const auth = token ? authenticateSystemUser_(token) : { authorized: false };
  if (!auth.authorized || !auth.user) throw new Error('تسجيل الدخول مطلوب لعرض هذا الملف.');
  const user = auth.user;
  if (policy.superAdmin && !user.isSuperAdmin) throw new Error('صلاحية غير كافية لعرض هذا الملف.');

  const requested = String(params.company || params.target_system || '').trim();
  const company = String(policy.company || user.company || '').trim();
  if (policy.company && requested && requested !== policy.company) throw new Error('الشركة المطلوبة غير مطابقة للملف.');
  if (!policy.superAdmin && !user.isSuperAdmin && requested && requested !== user.company) throw new Error('ليس لديك صلاحية هذه الشركة.');
  if (company) {
    assertCompanyEnabled_(company);
    if (policy.page) checkPageAccess_(user, company, policy.page, policy.access || 'read');
  } else if (!policy.superAdmin) {
    throw new Error('تعذر تحديد شركة الملف بشكل آمن.');
  }
  return { user: user, company: company };
}

function apiRouter(request) {
  return apiRouter_(request);
}

function isReadAction_(action) {
  return action === 'ping' || action.indexOf('get_') === 0 || action.indexOf('admin_list_') === 0;
}

/**
 * Phase 9. Whether this request can write anything.
 *
 * The reason F-01's "the memo is disabled for writes" description understated
 * the problem: every company page calls the single route 'company_action', so
 * testing request.action alone classified EVERY company request — reads included
 * — as a write. The real action for those lives in payload.module_action, and
 * that is what is tested here.
 *
 * Used only to arm the memo's shape guard, so a misclassification costs
 * performance, never correctness: a read wrongly called a write just pays the
 * guard, and a write wrongly called a read still has noteMutation_ underneath it.
 */
function requestMayWrite_(request) {
  let a = String((request && request.action) || '');
  if (a === 'company_action') {
    a = String((request.payload && request.payload.module_action) || '');
  }
  return !isReadAction_(a);
}

/* Phase B finalizer boundary. apiRouter_ measures the request and records
 * EXACTLY ONE outcome for every return path — success, handler error, auth
 * failure, kill switch, session expiry — via a wrapper whose returned business
 * value passes through untouched. Telemetry is fully wrapped and fails open:
 * it can neither change nor delay the response. */
function apiRouter_(request) {
  var perfCtx = perfBeginRequest_(request);
  var result;
  /* [live-notice] The request id every write already carries; who/name are
     filled in once the session is authenticated (apiRouterRequest_). */
  var liveData = request && request.payload && request.payload.data;
  _liveReqMeta_ = { rid: String((liveData && typeof liveData === 'object' && liveData.__request_id) || ''), who: '', name: '' };
  try {
    result = apiRouterRequest_(request, perfCtx);
  } catch (err) {
    perfFinishRequest_(perfCtx, request, null, err);
    throw err;
  } finally {
    _liveReqMeta_ = null;
  }
  perfFinishRequest_(perfCtx, request, result, null);
  return result;
}

function apiRouterRequest_(request, perfCtx) {
  var routerStartedMs = new Date().getTime();
  var authStartedMs = 0;
  var authFinishedMs = 0;
  var handlerStartedMs = 0;
  var handlerFinishedMs = 0;
  // Request-scoped memoization for getAllRecords_() — start every invocation
  // with a fresh cache.
  //
  // Phase 9 (F-01): the unconditional disableRecordCache_() for non-read actions
  // is GONE. It was doing far more than its comment claimed. isReadAction_ tests
  // the ROUTER action, and every company page calls the single route
  // 'company_action' — which never starts with 'get_'. So the memo was switched
  // off for every company request in the application, reads included, not just
  // for writes. get_sales_headers, get_valley_purchasing_costing and every other
  // list endpoint have been paying full re-reads for repeated access to the same
  // sheet within one request.
  //
  // The memo now starts enabled and the first mutation disables it for the rest
  // of the request (noteMutation_ in shared Code.js section). A read action never
  // mutates, so it keeps the memo throughout; a write action behaves exactly as
  // today from its first write onward.
  resetRecordCache_();
  setMemoGuard_(requestMayWrite_(request));
  ensureCompaniesRegistered_();
  let startTime = new Date();
  let result;
  let status = 'SUCCESS';
  let errorMessage = '';
  let authUser = null;
  
  try {
    const route = ROUTES[request.action];
    if (!route) throw new Error('Invalid action: ' + request.action);
    authStartedMs = new Date().getTime();
    perfMarkAuthStart_(perfCtx);

    if (route.requireAuth) {
      const auth = authenticateSystemUser_(request.sessionToken);
      if (!auth.authorized) {
        status = 'FAILED';
        errorMessage = 'SESSION_EXPIRED';
        perfMarkAuth_(perfCtx, null);
        return { status: 'error', code: 'SESSION_EXPIRED' };
      }
      authUser = auth.user;
      try { SessionManager_.touch(request.sessionToken); } catch (e) {}
    } else if (request.sessionToken) {
      /* Optional identity lets unauthenticated telemetry attribute a legitimate
       * session without turning login/error reporting into an auth-required
       * route. An invalid token is simply treated as anonymous. */
      const optionalAuth = authenticateSystemUser_(request.sessionToken);
      if (optionalAuth.authorized) authUser = optionalAuth.user;
    }
    perfMarkAuth_(perfCtx, authUser);
    authFinishedMs = new Date().getTime();
    if (_liveReqMeta_ && authUser) {
      _liveReqMeta_.who = String(authUser.email || '').trim().toLowerCase();
      _liveReqMeta_.name = String(authUser.name || '').trim();
    }

    // System kill switch — blocks EVERY action for EVERYONE once engaged,
    // with exactly one exception: an authenticated SUPER ADMIN calling
    // toggle_kill_switch (the recovery lever). Auth therefore runs BEFORE
    // this check so the exception can be identified.
    if (!isSystemEnabled_() &&
        !(request.action === 'toggle_kill_switch' && authUser && authUser.isSuperAdmin)) {
      status = 'FAILED';
      errorMessage = 'SYSTEM_DISABLED';
      return { status: 'error', code: 'SYSTEM_DISABLED', message: 'عطل في السيستم' };
    }

    // Phase 9: re-arm the memo immediately before the handler. The preamble
    // above authenticates and may touch the session row, and that write would
    // otherwise disable the memo for the whole request through noteMutation_ —
    // costing the handler its memo because of a write it does not care about.
    // Safe: the memo is empty here, so nothing in it can predate those writes.
    perfMarkHandlerStart_(perfCtx);
    rearmRecordCache_();
    handlerStartedMs = new Date().getTime();
    result = jsonSafe_(route.handler(request.payload, request.sessionToken, authUser));
    handlerFinishedMs = new Date().getTime();
    
    // Log successful operation
    try { logSystemAction_(request, authUser, result, status, errorMessage, startTime); } catch (loggingError) {}

    // Super-admin-only diagnostic for the explicit MySQL connection probe.
    // It is returned to the caller only; no database or application state changes.
    if (request.action === 'company_action' &&
        request.payload && request.payload.module_action === 'get_mysql_connection_probe' &&
        authUser && authUser.isSuperAdmin && result && result.status === 'ok') {
      var routerFinishedMs = new Date().getTime();
      result.router_timing_ms = {
        server_total_before_return: routerFinishedMs - routerStartedMs,
        setup_before_auth: Math.max(0, authStartedMs - routerStartedMs),
        auth_and_session: Math.max(0, authFinishedMs - authStartedMs),
        after_auth_before_handler: Math.max(0, handlerStartedMs - authFinishedMs),
        handler: Math.max(0, handlerFinishedMs - handlerStartedMs),
        logging_after_handler: Math.max(0, routerFinishedMs - handlerFinishedMs)
      };
    }

    return result;
  } catch (err) {
    status = 'FAILED';
    errorMessage = err.message;
    
    // Log failed operation
    logSystemAction_(request, authUser, null, status, errorMessage, startTime);

    return { status: 'error', message: err.message };
  }
}

/**
 * Phase B — measurement integrity finalizer.
 *
 * Every field comes from something apiRouterRequest_ already had. The headline
 * sample is ONE uniform draw taken at request start (perfBeginRequest_);
 * requests that were not drawn but are slow or failed go to a separate
 * diagnostic stream (diagnostic: true) only while PERF_LOG_READS is on.
 * Diagnostic rows are excluded from headline distributions at read time.
 *
 * Wrapped whole. A telemetry path that can throw is a telemetry path that can
 * fail a save.
 */
var PERF_SKIP_ACTIONS_ = {
  log_client_perf: true,
  get_admin_performance: true,
  get_perf_dashboard: true,
  get_erp_session_meta: true
};

function perfBeginRequest_(request) {
  var ctx = { skip: true, action: '', module_action: '', sampled: false, sample_p: 0,
              diagnostic_ok: false, enabled: false, t0: new Date(), auth_start: 0,
              auth_at: 0, handler_at: 0, auth_user: null };
  try {
    var action = String((request && request.action) || '');
    ctx.action = action;
    if (PERF_SKIP_ACTIONS_[action]) return ctx;
    var rum = !!(PERF_TELEMETRY_.ENABLED && perfRumEnabled_());
    var diagnostics = !!(PERF_TELEMETRY_.ENABLED && perfDiagnosticsEnabled_());
    if (!rum && !diagnostics) return ctx;
    var payload = (request && request.payload) || {};
    ctx.module_action = String(payload.module_action || '');
    ctx.skip = false;
    ctx.enabled = rum;
    ctx.diagnostic_ok = diagnostics;
    ctx.sample_p = perfRumRate_();
    ctx.sampled = rum && Math.random() < ctx.sample_p;
  } catch (e) { ctx.skip = true; }
  return ctx;
}

function perfMarkAuthStart_(ctx) {
  try { if (ctx && !ctx.skip) ctx.auth_start = new Date().getTime(); } catch (e) {}
}

function perfMarkAuth_(ctx, authUser) {
  try {
    if (!ctx || ctx.skip) return;
    ctx.auth_at = new Date().getTime();
    ctx.auth_user = authUser || null;
  } catch (e) {}
}

function perfMarkHandlerStart_(ctx) {
  try { if (ctx && !ctx.skip) ctx.handler_at = new Date().getTime(); } catch (e) {}
}

function perfFinishRequest_(ctx, request, result, err) {
  try {
    if (!ctx || ctx.skip) return;
    var nowMs = new Date().getTime();
    var elapsed = nowMs - ctx.t0.getTime();
    var outcome = perfClassifyOutcome_(result, err);
    var diagnostic = false;
    if (!ctx.sampled) {
      var slowOrError = (outcome !== 'success') || elapsed >= PERF_TELEMETRY_.SLOW_MS;
      if (!(ctx.diagnostic_ok && slowOrError)) return;
      diagnostic = true;
    }
    var payload = (request && request.payload) || {};
    var action = ctx.module_action || ctx.action;
    var companyID = String(payload.target_system || '');
    var user = ctx.auth_user;
    perfRecord_({
      action: action,
      company: companyID,
      page: payload.page_id || resolveLogPage_(companyID, action),
      elapsed_ms: elapsed,
      sheet_reads: (typeof getSheetsReadCount_ === 'function') ? getSheetsReadCount_() : '',
      status: outcome === 'success' ? 'SUCCESS' : 'FAILED',
      user_email: (user && user.email) || '',
      client_ms: payload.client_ms,
      diagnostic: diagnostic,
      sample_p: ctx.sample_p,
      outcome: outcome,
      auth_ms: (ctx.auth_start && ctx.auth_at) ? Math.max(0, ctx.auth_at - ctx.auth_start) : '',
      handler_ms: ctx.handler_at ? Math.max(0, nowMs - ctx.handler_at) : '',
      resp_size: perfSizeBucket_(result)
    });
  } catch (e) {
    /* Telemetry never changes the response and never throws into the request. */
  }
}

/** Outcome taxonomy: success | validation | authorization | error | disabled |
 *  session-expired, classified from the existing envelopes (status/ok/error/
 *  code/message). The envelope itself is never modified. */
function perfClassifyOutcome_(result, err) {
  if (err) return 'error';
  if (!result || typeof result !== 'object') return 'success';
  var code = String(result.code || '').toUpperCase();
  var status = String(result.status || '').toLowerCase();
  var failed = (status === 'error') || (result.ok === false) || (result.success === false) || !!result.error;
  if (!failed) return 'success';
  if (code === 'SESSION_EXPIRED') return 'session-expired';
  if (code === 'SYSTEM_DISABLED') return 'disabled';
  if (/AUTH|PERMISSION|DENIED|FORBIDDEN|EXPIRED|ACCOUNT_|NOT_ALLOWED/.test(code)) return 'authorization';
  if (/INVALID|REQUIRED|VALIDATION|MISMATCH|MISSING|DUPLICATE|CONFLICT/.test(code)) return 'validation';
  var msg = String(result.message || result.error || '');
  if (msg.indexOf('SESSION_EXPIRED') !== -1) return 'session-expired';
  if (msg.indexOf('SYSTEM_DISABLED') !== -1 || msg.indexOf('عطل في السيستم') !== -1) return 'disabled';
  if (/صلاحية|تسجيل الدخول|NOT_AUTHORIZED/i.test(msg)) return 'authorization';
  if (/مطلوب|غير صالح|INVALID|REQUIRED/i.test(msg)) return 'validation';
  return 'error';
}

/** Coarse response-size bucket. The payload itself is never recorded. */
function perfSizeBucket_(value) {
  try {
    if (value === null || value === undefined) return '';
    var size = (typeof value === 'string') ? value.length : JSON.stringify(value).length;
    if (!isFinite(size) || size < 0) return '';
    if (size < 4096) return '<4k';
    if (size < 16384) return '<16k';
    if (size < 65536) return '<64k';
    if (size < 262144) return '<256k';
    return '>=256k';
  } catch (e) { return ''; }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ status: 'error', message: err.message });
  }
  return json_(apiRouter_(body));
}

/** Durable at-most-once execution for authenticated company write requests.
 * A pending/uncertain receipt is NEVER expired into permission to run again.
 * Sheets cannot atomically commit a whole handler plus its receipt: interrupted
 * handlers therefore require review rather than a potentially duplicate replay.
 */
function requestGuardIsWrite_(action) {
  return !/^(get_|list_|prefetch_|preview_|search_|check_|validate_|export_|lookup_|ping$)/.test(String(action || ''));
}
function requestGuardCanonical_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(requestGuardCanonical_).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + requestGuardCanonical_(value[key]); }).join(',') + '}';
}
function requestGuardHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function requestGuardReply_(code, message, uncertain, retryable) {
  return { status: 'error', code: code, message: message, uncertain: !!uncertain, transport: !!retryable };
}
/* Receipt states: done (mutation confirmed, response stored), failed (a proven
 * pre-mutation deterministic error — validation, auth, bad input — safe to
 * correct and retry), uncertain (mutation may have occurred, never replayed),
 * pending (execution inside the active processing window). Handlers opt into
 * 'failed' by throwing or returning an error with notApplied === true; only
 * errors raised before any mutation may carry that marker. */
function requestGuardNotApplied_(err) {
  return !!(err && err.notApplied === true);
}
function requestGuardFailedReply_(err) {
  var message = (err && err.message) || 'تعذر إكمال العملية.';
  var code = (err && err.code) || 'REQUEST_NOT_APPLIED';
  return { status: 'error', code: code, message: message, notApplied: true, uncertain: false, transport: false };
}
/* Throwing helper for deterministic PRE-MUTATION refusals (field validation,
 * duplicate keys, totals reconciliation, permission/state gates evaluated
 * before the handler's first sheet write). The receipt ledger records these
 * as confirmed failures (REQUEST_NOT_APPLIED, safe to correct and retry with
 * a fresh request) instead of uncertain outcomes. ONLY errors raised before
 * any mutation may use this marker — anything thrown after a write must stay
 * a plain error so the guard keeps blocking replay. */
function notAppliedError_(message, code) {
  var err = new Error(message);
  err.notApplied = true; err.code = code || 'REQUEST_NOT_APPLIED';
  throw err;
}
var REQUEST_RECEIPT_HEADERS_ = ['request_key','request_id','user_email','module_action','payload_hash','state','response_json','created_at','updated_at'];
function requestGuardSheet_(dbId) {
  var ss = getSpreadsheet_(dbId), sheet = ss.getSheetByName('ERP_Request_Receipts');
  if (!sheet) {
    sheet = ss.insertSheet('ERP_Request_Receipts');
    sheet.getRange(1, 1, 1, REQUEST_RECEIPT_HEADERS_.length).setValues([REQUEST_RECEIPT_HEADERS_]);
    noteMutation_(dbId, 'ERP_Request_Receipts');
    try { sheet.hideSheet(); } catch (ignore) {}
  }
  var headers = sheet.getRange(1, 1, 1, REQUEST_RECEIPT_HEADERS_.length).getValues()[0];
  if (headers.join('|') !== REQUEST_RECEIPT_HEADERS_.join('|')) throw new Error('Invalid request receipt schema');
  return sheet;
}
function requestGuardFind_(sheet, key) {
  if (sheet.getLastRow() < 2) return null;
  var found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).matchCase(true).findAll();
  if (found.length > 1) throw new Error('Duplicate request receipts');
  if (!found.length) return null;
  var row = found[0].getRow();
  return { row: row, values: sheet.getRange(row, 1, 1, REQUEST_RECEIPT_HEADERS_.length).getValues()[0] };
}
function requestGuardExecute_(payload, user, dbId, invoke, opts) {
  var action = String(payload.module_action || '');
  if (!requestGuardIsWrite_(action)) return invoke(payload);
  var input = payload.data || {}, requestId = String(input.__request_id || '');
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) {
    return requestGuardReply_('REQUEST_ID_REQUIRED', 'حدّث صفحة التطبيق قبل الحفظ لتفعيل الحماية من التكرار. لم تُنفذ العملية.', false, false);
  }
  var clean = JSON.parse(JSON.stringify(input)); delete clean.__request_id; delete clean.__request_owner;
  var safePayload = Object.assign({}, payload, { data: clean });
  var email = String(user.email || '').trim().toLowerCase();
  if (input.__request_owner && input.__request_owner !== email) return requestGuardReply_('REQUEST_OWNER_MISMATCH', 'الطلب المؤجل يخص مستخدمًا آخر. راجعه بالحساب الأصلي.', true, false);
  if (!email) return requestGuardReply_('REQUEST_USER_REQUIRED', 'تعذر تحديد المستخدم لحماية العملية من التكرار.', false, false);
  var key = requestGuardHash_(JSON.stringify([dbId, payload.target_system, email, action, requestId]));
  var hash = requestGuardHash_(requestGuardCanonical_(clean));
  var claim;
  try {
    claim = executeWithLock_(function () {
      var sheet = requestGuardSheet_(dbId), prior = requestGuardFind_(sheet, key);
      if (prior) {
        if (String(prior.values[4]) !== hash) return { reply: requestGuardReply_('REQUEST_ID_CONFLICT', 'رقم الطلب مستخدم لبيانات مختلفة. راجع العملية قبل إعادة الحفظ.', true, false) };
        if (String(prior.values[5]) === 'done') {
          var reply = JSON.parse(String(prior.values[6])); reply.deduped = true;
          return { reply: reply };
        }
        if (String(prior.values[5]) === 'failed') {
          /* Confirmed non-mutation: replay the stored failure so corrections
             can retry instead of hitting a permanent uncertain block. */
          var failedReply = null;
          try { failedReply = JSON.parse(String(prior.values[6])); } catch (ignoreFailed) {}
          if (failedReply && failedReply.status === 'error') { failedReply.deduped = true; return { reply: failedReply }; }
        }
        var age = new Date().getTime() - new Date(prior.values[7]).getTime();
        if (String(prior.values[5]) === 'pending' && age >= 0 && age < 360000) {
          return { reply: requestGuardReply_('REQUEST_IN_PROGRESS', 'الطلب قيد المعالجة. ستتحقق إعادة المحاولة من نفس الطلب دون إنشاء نسخة أخرى.', true, true) };
        }
        /* Request-scoped recovery (opt-in per action via the company module):
           the handler locates its earlier result by request ID without
           creating anything new, so a stale receipt is safe to reconcile.
           Anything else stays blocked to avoid duplicate replay. */
        if (opts && opts.recovery === 'request-id') return { recover: true, priorState: String(prior.values[5]), priorReceipt: prior };
        return { reply: requestGuardReply_('REQUEST_UNCERTAIN', 'نتيجة الطلب غير مؤكدة. راجع السجل مع المسؤول قبل إنشاء طلب جديد؛ تم منع إعادة التنفيذ لتجنب التكرار. رقم الطلب: ' + requestId, true, false) };
      }
      var now = new Date(), row = sheet.getLastRow() + 1;
      if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
      sheet.getRange(row, 1, 1, REQUEST_RECEIPT_HEADERS_.length).setValues([[key,requestId,email,action,hash,'pending','',now,now]]);
      noteMutation_(dbId, 'ERP_Request_Receipts');
      SpreadsheetApp.flush();
      return { claimed: true };
    }, 10000);
  } catch (e) {
    return requestGuardReply_('REQUEST_GUARD_UNAVAILABLE', 'تعذر تثبيت حماية الطلب؛ لم تُنفذ العملية. أعد المحاولة بنفس الطلب.', true, false);
  }
  if (claim.reply) return claim.reply;
  var result, state = 'done';
  try {
    rearmRecordCache_();
    /* Recovery receives an explicit context.  A recovering handler must first
     * reconcile its durable business record and may only resume an operation
     * when the module can prove that doing so is idempotent. */
    var invokeCtx = {
      requestId: requestId,
      payloadHash: hash,
      recovering: !!claim.recover,
      priorState: claim.priorState || '',
      userEmail: email,
      moduleAction: action,
      priorRecovery: null,
      _recovery: null,
      /* Bounded recovery checkpoint: updates ONLY this request's existing
       * receipt row (response_json + updated_at). The caller holds the script
       * lock during the business mutation, so this performs a direct write
       * with no nested lock acquisition. Throws on any validation or write
       * failure — handlers must checkpoint 'validated' BEFORE the first
       * business write so a checkpoint failure yields zero business writes. */
      checkpoint: function (recoveryData) {
        var rec = recoveryData || {};
        if (!rec || typeof rec !== 'object') throw new Error('Invalid recovery checkpoint');
        var envelope = {
          type: String(rec.type || ''),
          request_id: requestId,
          payload_hash: hash,
          /* `mo_uid` is the historic field used by manufacturing.  The
           * additive entity fields let other request-id-recoverable modules
           * bind the same receipt to their own durable record without
           * changing the existing manufacturing envelope. */
          mo_uid: String(rec.mo_uid || rec.entity_uid || rec.base_token || ''),
          entity_type: String(rec.entity_type || ''),
          entity_uid: String(rec.entity_uid || rec.mo_uid || rec.base_token || ''),
          snapshot_hash: String(rec.snapshot_hash || ''),
          base_token: String(rec.base_token || ''),
          scope: Array.isArray(rec.scope) ? rec.scope.slice(0, 8).map(function (s) { return String(s); }) : [],
          stage: String(rec.stage || '')
        };
        if (!envelope.type || envelope.type.length > 64) throw new Error('Invalid recovery checkpoint');
        if (!envelope.mo_uid || envelope.mo_uid.length > 128) throw new Error('Invalid recovery checkpoint');
        if (envelope.entity_type.length > 32 || envelope.entity_uid.length > 128 || envelope.snapshot_hash.length > 128) throw new Error('Invalid recovery checkpoint');
        if (!envelope.stage || envelope.stage.length > 32) throw new Error('Invalid recovery checkpoint');
        var sized = JSON.stringify({ status: 'pending', recovery: envelope });
        if (sized.length > 5000) throw new Error('Recovery checkpoint too large');
        var sheet = requestGuardSheet_(dbId), receipt = requestGuardFind_(sheet, key);
        if (!receipt) throw new Error('Receipt not found');
        if (String(receipt.values[4]) !== hash) throw new Error('Receipt payload mismatch');
        if (String(receipt.values[1]) !== requestId) throw new Error('Receipt request mismatch');
        if (String(receipt.values[2]).toLowerCase() !== email) throw new Error('Receipt owner mismatch');
        if (String(receipt.values[3]) !== action) throw new Error('Receipt action mismatch');
        var st = String(receipt.values[5]);
        if (st !== 'pending' && st !== 'uncertain') throw new Error('Receipt not checkpointable');
        sheet.getRange(receipt.row, 7, 1, 2).setValues([[sized, new Date()]]);
        noteMutation_(dbId, 'ERP_Request_Receipts');
        SpreadsheetApp.flush();
        invokeCtx._recovery = envelope;
        return true;
      },
      /* Read-only scan for another unresolved receipt envelope naming the same
       * MO. Called under the handler's script lock; reads only. Returns the
       * conflicting request ID or ''. Bound to recent rows. */
      findOpenEntity: function (actionName, moUid) {
        var target = String(moUid || '').trim();
        if (!target) return '';
        try {
          var sheet = requestGuardSheet_(dbId);
          var last = sheet.getLastRow();
          if (last < 2) return '';
          var from = Math.max(2, last - 499);
          var rows = sheet.getRange(from, 1, last - from + 1, REQUEST_RECEIPT_HEADERS_.length).getValues();
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (String(r[3]) !== String(actionName)) continue;
            if (String(r[0]) === key) continue;
            var rst = String(r[5]);
            if (rst !== 'pending' && rst !== 'uncertain') continue;
            var body = null;
            try { body = JSON.parse(String(r[6] || '')); } catch (ignore) { body = null; }
            var env = body && (body.recovery || (body.result && body.result.recovery));
            if (env && String(env.mo_uid || '') === target) return String(r[1] || '');
          }
        } catch (ignoreScan) {}
        return '';
      }
    };
    try {
      if (claim.priorReceipt) {
        var priorBody = null;
        try { priorBody = JSON.parse(String(claim.priorReceipt.values[6] || '')); } catch (ignorePrior) { priorBody = null; }
        if (priorBody && priorBody.recovery && typeof priorBody.recovery === 'object') invokeCtx.priorRecovery = priorBody.recovery;
      }
    } catch (ignorePriorOuter) {}
    result = jsonSafe_(invoke(safePayload, invokeCtx));
    if (!result || result.status === 'error') {
      if (requestGuardNotApplied_(result)) {
        state = 'failed';
        result = jsonSafe_(requestGuardFailedReply_(result));
      } else {
        state = 'uncertain';
        var handlerRecovery = (result && result.recovery) || invokeCtx._recovery || null;
        result = requestGuardReply_('REQUEST_UNCERTAIN', ((result && result.message) || 'تعذر إكمال العملية.') + ' راجع السجل قبل إنشاء طلب جديد. رقم الطلب: ' + requestId, true, false);
        if (handlerRecovery) result.recovery = handlerRecovery;
      }
    }
  } catch (err) {
    if (requestGuardNotApplied_(err)) {
      state = 'failed';
      result = jsonSafe_(requestGuardFailedReply_(err));
    } else {
      state = 'uncertain';
      var thrownRecovery = (err && err.recovery) || (typeof invokeCtx !== 'undefined' && invokeCtx._recovery) || null;
      result = requestGuardReply_('REQUEST_UNCERTAIN', (err.message || 'تعذر إكمال العملية.') + ' قد تكون بعض البيانات حُفظت؛ راجع السجل قبل إنشاء طلب جديد. رقم الطلب: ' + requestId, true, false);
      if (thrownRecovery) result.recovery = thrownRecovery;
    }
  }
  try {
    executeWithLock_(function () {
      var sheet = requestGuardSheet_(dbId), receipt = requestGuardFind_(sheet, key);
      if (!receipt || String(receipt.values[4]) !== hash) throw new Error('Receipt not found');
      var encoded = JSON.stringify(result);
      if (encoded.length > 40000) encoded = JSON.stringify({ status: 'success', reloadRequired: true, message: 'تم تسجيل الطلب مسبقًا. حدّث الصفحة لعرض البيانات.' });
      sheet.getRange(receipt.row, 6, 1, 4).setValues([[state,encoded,receipt.values[7],new Date()]]);
      noteMutation_(dbId, 'ERP_Request_Receipts');
      SpreadsheetApp.flush();
    }, 10000);
  } catch (err) {
    // A claim already exists: never execute the business handler again.
    return requestGuardReply_('REQUEST_UNCERTAIN', 'قد تكون العملية حُفظت، لكن تعذر تأكيد النتيجة. لا تنشئ طلبًا بديلًا قبل مراجعة السجل. رقم الطلب: ' + requestId, true, false);
  }
  return result;
}

function executeCompanyAction_(payload, sessionToken, authUser) {
  const company = COMPANY_REGISTRY[payload.target_system];
  if (!company) throw new Error('Unknown company: ' + payload.target_system);
  if (!authUser.isSuperAdmin && authUser.company !== payload.target_system) {
    throw new Error('Access Denied.');
  }
  // Page-level authorization is derived SERVER-SIDE from the company's own
  // action->page map — never from a client-supplied page_id. Unified:
  // view=any grant, add=write/full, edit/delete family=full only.
  const pageId = company.pageForAction ? company.pageForAction(payload.module_action) : null;
  if (pageId) {
    const m = String(payload.module_action || '');
    let required = payload.access_type || 'read';
    // infer from verb if caller didn't specify typed access
    if (!payload.access_type) {
      if (/^add_/.test(m)) required = 'write';
      else if (COMPANY_SA_ONLY_RE.test(m)) required = 'full';
      else required = 'read';
    }
    checkPageAccess_(authUser, payload.target_system, pageId, required);
  }
  if (!canCompanyAction_(authUser, payload.module_action, pageId)) {
    throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  }
  // Phase 3: central tenant resolution — derives dbId from identity and asserts
  // it belongs to the target company before any sheet read.
  const dbId = resolveDbId_(authUser, payload);
  /* Request-scoped recovery is opt-in per action on the company module (the
     handler must locate its earlier result by request ID without mutating).
     Extra dispatch arguments are ignored by modules that do not accept them. */
  var recovery = (company.requestRecovery_ && company.requestRecovery_(payload.module_action)) || '';
  return requestGuardExecute_(payload, authUser, dbId, function (safePayload, guardCtx) {
    /* Phase 2: single choke point for field validation before any company write.
     * Status-only paths (approve_/toggle_/cancel_/revert_/close_/delete_) skip
     * field validation explicitly inside validateBeforeWrite via
     * STATUS_ONLY_ACTIONS_; they remain status-gated in their handlers. */
    if (typeof validateBeforeWrite === 'function' && typeof docTypeForAction_ === 'function') {
      var __dt = docTypeForAction_(safePayload.module_action);
      if (__dt) validateBeforeWrite(__dt, safePayload, dbId);
    }
    return company.dispatch(safePayload, authUser, dbId, guardCtx);
  }, { recovery: recovery });
}

/**
 * Read-only request-status lookup backing the client recovery poll.
 * Authenticated (route-level). Resolves the tenant from identity via
 * resolveDbId_ — a client-supplied database ID or email is never trusted.
 * The receipt key binds (dbId, company, user email, action, request ID), so a
 * caller can only ever observe their own requests; anything else (including a
 * receipt owned by another user) resolves to 'unknown', revealing nothing.
 * Never mutates: no lock, no receipt write, no business dispatch.
 */
function requestStatusRoute_(payload, sessionToken, authUser) {
  var p = payload || {};
  var target = String(p.target_system || '');
  var action = String(p.module_action || '');
  var requestId = String(p.request_id || '');
  if (!target || !requestGuardIsWrite_(action) || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) {
    return { status: 'unknown', retryable: false };
  }
  var company = COMPANY_REGISTRY[target];
  if (!company) return { status: 'unknown', retryable: false };
  var email = String((authUser && authUser.email) || '').trim().toLowerCase();
  if (!email) return { status: 'unknown', retryable: false };
  var dbId;
  try { dbId = resolveDbId_(authUser, { target_system: target }); }
  catch (deny) { return { status: 'unknown', retryable: false }; }
  var key = requestGuardHash_(JSON.stringify([dbId, target, email, action, requestId]));
  var receipt = null;
  try { receipt = requestGuardFind_(requestGuardSheet_(dbId), key); }
  catch (lookupErr) { receipt = null; }
  if (!receipt) return { status: 'unknown', retryable: true, requestId: requestId };
  var state = String(receipt.values[5]);
  if (state === 'done') {
    var result = null;
    try { result = JSON.parse(String(receipt.values[6])); } catch (parseDone) {}
    if (result && result.status === 'success') {
      result.recovered = true;
      return { status: 'done', result: result, requestId: requestId };
    }
    return { status: 'review_required', requestId: requestId };
  }
  if (state === 'failed') {
    var failure = null;
    try { failure = JSON.parse(String(receipt.values[6])); } catch (parseFailed) {}
    if (failure && failure.status === 'error') {
      return { status: 'failed', error: failure, requestId: requestId };
    }
    return { status: 'review_required', requestId: requestId };
  }
  var age = new Date().getTime() - new Date(receipt.values[7]).getTime();
  if (state === 'pending' && age >= 0 && age < 360000) {
    return { status: 'pending', retryAfterMs: 1500, requestId: requestId };
  }
  return { status: 'review_required', requestId: requestId };
}

/**
 * T-2 — the only unauthenticated door into a company namespace. `authUser` is
 * always null here (the route is requireAuth:false, so apiRouter_ never
 * authenticates), which is why SystemLog.UserEmail comes back empty for every
 * candidate-side action — expected, per plan §5.6.
 *
 * No page-access check runs here on purpose: a company opts into this surface
 * by registering `publicDispatch`, and it alone decides what that surface
 * exposes (its own PUBLIC_ACTIONS allowlist, never its authenticated `actions`
 * map). The kill switch still runs first in apiRouter_, so a disabled system
 * blocks candidates too — the same message they would get from any other
 * route (R2/T-2).
 */
function executeCompanyPublicAction_(payload, sessionToken, authUser) {
  const company = COMPANY_REGISTRY[payload && payload.target_system];
  if (!company || typeof company.publicDispatch !== 'function') {
    throw new Error('Unknown company: ' + (payload && payload.target_system));
  }
  return company.publicDispatch(payload, getCompanySpreadsheetId_(payload.target_system));
}

/**
 * Unified company action authorization — merged layer.
 * view/add  -> handled via checkPageAccess_ (write/full hierarchy)
 * edit_/delete_/remove_/update_/toggle_/close_/make_ family -> Full Access only
 * Super Admin bypasses all. Mirrored in UI via IS_SUPER_ADMIN / Full Access check.
 */
var COMPANY_SA_ONLY_RE = /^(edit_|delete_|remove_|update_|toggle_|close_|make_)/;
function canCompanyAction_(authUser, moduleAction, pageId) {
  if (!authUser) return false;
  if (authUser.isSuperAdmin) return true;
  const m = String(moduleAction || '');
  const isEditDelete = COMPANY_SA_ONLY_RE.test(m);
  if (!isEditDelete) return true; // add/read already gated via checkPageAccess_
  // edit/delete family requires Full Access on that page
  if (!pageId) return false;
  return unifiedCheck_(authUser, authUser.company, pageId, 'full');
}

/**
 * System kill-switch toggle. Super-admin only.
 * Storage contract: sheet 'ERP_system_work', B1 header «on_off», B2 = 1/0
 * (1 = system works, 0 = system closed). C2/D2 hold audit stamps.
 * payload.on === undefined → read-only current state.
 * payload.on = true|false  → write B2 (1/0) + C2/D2 and explicitly call
 *                            bumpVersion_('ERP_system_work'), which bumps the
 *                            authority generation — invariant: programmatic
 *                            writes don't fire any edit trigger.
 * NOTE: once B2 = 0 the apiRouter gate blocks EVERY action, including this
 * one. Recovery when closed is always via editing B2 directly in the sheet.
 * That direct edit is caught by the INSTALLABLE onAuthSheetEdit trigger
 * (installTriggers_), which re-enables on the next request. The simple
 * onEdit(e) has never fired — this is a standalone script. If the installable
 * trigger is missing, recovery still happens, bounded by
 * AUTH_STALENESS_CEILING_SECONDS.
 */
function toggleKillSwitch_(payload, sessionToken, authUser) {
  requireSuperAdmin_(authUser);
  const flagRecord = ensureSystemWorkSheet_();

  // Read-only mode
  if (!payload || payload.on === undefined || payload.on === null) {
    const flag = readSystemWorkFlag_(flagRecord);
    return { status: 'success', enabled: flag !== 0 }; // fail-open when unreadable
  }

  const newValue = !!payload.on;
  if (!flagRecord) throw new Error('STORAGE_NOT_FOUND: ERP_system_work flag document');
  systemPatchRecord_('ERP_system_work', flagRecord.meta.documentId, {
    on_off: newValue ? 1 : 0,
    updated_at: new Date(),
    updated_by: (authUser && authUser.email) || ''
  }, { expectedUpdateTime: flagRecord.meta.updateTime });
  // Explicit invalidation — onEdit does NOT fire for script writes.
  bumpVersion_('ERP_system_work');
  return { status: 'success', message: newValue ? 'تم تشغيل النظام' : 'تم إيقاف النظام', enabled: newValue };
}

// DEV-ONLY test route. Removed before deploy (Phase 7).
function handlePing_(payload, sessionToken, authUser) {
  return { status: 'success', user: authUser ? authUser.email : null };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Recursively sanitize a value for google.script.run serialization: Date -> ISO
 * string, undefined -> null. google.script.run does NOT reliably serialize Date
 * objects (returns null to the client), while doPost's JSON.stringify converts
 * them to ISO strings — which is why API tests pass but the UI fails.
 */
function jsonSafe_(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe_);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => { out[k] = jsonSafe_(value[k]); });
    return out;
  }
  return value;
}

/**
 * F-09: every shared include is 100% static — UI_Components, CSS_Tokens,
 * Client_Helpers, both *_Nav files, ERP_Modal and ERP_Flow contain zero
 * <? ?> scriptlets — yet all of it was pushed through the Apps Script
 * templating engine on every single page load.
 *
 * [UI-10.2 / U-35] ERP_DataTable and ERP_DataTable_JS were named here too.
 * They were included by ZERO pages and were deleted in step 10.1, so naming
 * them here was telling the next reader that 42 KB of dead code was live.
 *
 * Now: read the file directly and only fall back to template evaluation if the
 * content actually contains a scriptlet, so an include that later gains one keeps
 * working with no further change here. Placeholder substitution is unchanged.
 */
/* ══════════════════════════════════════════════════════════════════════════
 * [RT-8] minifyInclude_ — comments and whitespace off the wire, nothing else
 *
 * Every navigation is a full document load and HtmlService cannot set
 * Cache-Control, so the shared bundle is downloaded, parsed and executed again
 * on every single navigation: 268 KB of UI_Components, 24 KB of Client_Helpers
 * and 14 KB of CSS_Tokens, 85 times over. UI_Components alone is 37% comments
 * and whitespace by byte. Gzip helps the transfer and does nothing at all for
 * the parse, which is the part that blocks first paint.
 *
 * WHAT THIS MAY DO: remove comments, and collapse whitespace that is not inside
 * a string, a template literal or a regular expression.
 *
 * WHAT THIS MAY NOT DO, ever: rename anything. UIC.*, API.*, FMT.*, UI.*,
 * SESSION.*, ERPFlow.* and ERPModal.* are a cross-file public surface — pages
 * call them by name and tools/ui_check.js C3 verifies them. An identifier
 * mangler here would break every page in the product at once and pass every
 * test that only looks at one file.
 *
 * The comments in this codebase are unusually good and they all stay in source.
 * This removes them from the wire only.
 *
 * WHY A SCANNER AND NOT REGEXES. A regex that eats `//` inside a string
 * literal, or `/* *\/` inside a template literal, produces a file that still
 * parses and behaves differently — the worst possible failure, because nothing
 * reports it. This walks the source one character at a time and knows exactly
 * which of five states it is in. The two genuinely hard cases are handled
 * explicitly:
 *
 *   - `/` is division or the start of a regex depending on what came before it.
 *     Decided on the last significant token, the standard rule.
 *   - A template literal may contain `${ ... }` holding arbitrary code, which
 *     may itself contain another template literal. Depth is tracked.
 *
 * Everything inside a string, a template literal or a regex is copied byte for
 * byte, which is what keeps Arabic literals, CSS in template literals and
 * `https://` URLs intact.
 * ══════════════════════════════════════════════════════════════════════════ */
function minifyInclude_(src) {
  if (!src) return src;
  var out = [];
  var n = src.length;
  var i = 0;

  /* The last significant character emitted, for the regex-vs-division call. */
  var prev = '';
  var prevWord = '';

  /* Template-literal nesting: each entry is the ${} depth inside that level. */
  var tmpl = [];

  function lastNonSpace() {
    for (var k = out.length - 1; k >= 0; k--) {
      var c = out[k];
      if (c !== ' ' && c !== '\n') return c;
    }
    return '';
  }

  /* A `/` begins a regex when the previous significant token cannot end an
   * expression. Everything that CAN end one (an identifier, a number, `)`,
   * `]`, a string) means division instead. */
  function regexAllowed() {
    var c = lastNonSpace();
    if (c === '') return true;
    if ('([{,;:!&|?+-*%^~=<>'.indexOf(c) !== -1) return true;
    if (c === ')' || c === ']' || c === '}') return false;
    /* keyword-then-slash: `return /x/`, `typeof /x/`, `case /x/` */
    return /\b(return|typeof|case|in|of|new|delete|void|instanceof|do|else|yield|await)$/.test(prevWord);
  }

  while (i < n) {
    var c = src[i];
    var d = src[i + 1];

    /* ── inside a template literal ─────────────────────────────────────── */
    if (tmpl.length && tmpl[tmpl.length - 1].raw) {
      if (c === '\\') { out.push(c, src[i + 1]); i += 2; continue; }
      if (c === '`') { tmpl.pop(); out.push(c); i++; prev = c; continue; }
      if (c === '$' && d === '{') {
        tmpl[tmpl.length - 1].raw = false;
        tmpl[tmpl.length - 1].depth = 1;
        out.push('$', '{'); i += 2; continue;
      }
      out.push(c); i++; continue;      /* byte for byte, newlines included */
    }

    /* ── block comment ─────────────────────────────────────────────────── */
    if (c === '/' && d === '*') {
      var end = src.indexOf('*/', i + 2);
      i = (end === -1) ? n : end + 2;
      /* A comment separated two tokens; leave one space so `a/*x*\/b` does not
       * become `ab`. */
      if (out.length && lastNonSpace() !== '') out.push(' ');
      continue;
    }

    /* ── line comment ──────────────────────────────────────────────────── */
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    /* ── HTML comment ──────────────────────────────────────────────────── */
    if (c === '<' && src.substr(i, 4) === '<!--') {
      var he = src.indexOf('-->', i + 4);
      i = (he === -1) ? n : he + 3;
      continue;
    }

    /* ── string ────────────────────────────────────────────────────────── */
    if (c === '"' || c === "'") {
      var q = c;
      out.push(c); i++;
      while (i < n) {
        if (src[i] === '\\') { out.push(src[i], src[i + 1]); i += 2; continue; }
        out.push(src[i]);
        if (src[i] === q) { i++; break; }
        i++;
      }
      prev = q; prevWord = '';
      continue;
    }

    /* ── template literal opens ────────────────────────────────────────── */
    if (c === '`') {
      tmpl.push({ raw: true, depth: 0 });
      out.push(c); i++; prev = c; prevWord = '';
      continue;
    }

    /* ── regex literal ─────────────────────────────────────────────────── */
    if (c === '/' && regexAllowed()) {
      out.push(c); i++;
      var inClass = false;
      while (i < n) {
        var r = src[i];
        if (r === '\\') { out.push(r, src[i + 1]); i += 2; continue; }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) { out.push(r); i++; break; }
        else if (r === '\n') break;       /* not a regex after all; bail safely */
        out.push(r); i++;
      }
      /* flags */
      while (i < n && /[a-z]/.test(src[i])) { out.push(src[i]); i++; }
      prev = '/'; prevWord = '';
      continue;
    }

    /* ── whitespace ────────────────────────────────────────────────────── */
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      var j = i;
      var sawNewline = false;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r' || src[j] === '\n')) {
        if (src[j] === '\n') sawNewline = true;
        j++;
      }
      var before = lastNonSpace();
      var after = src[j] || '';
      /* Keep ONE separator when removing it would join two tokens, or when a
       * newline is doing the job of a semicolon (ASI). Otherwise drop it. */
      var wordish = function (ch) { return /[A-Za-z0-9_$-￿]/.test(ch); };
      if (before && after && (wordish(before) && wordish(after))) out.push(' ');
      else if (sawNewline && before && after && '+-'.indexOf(after) !== -1) out.push('\n');
      else if (sawNewline && before && ')]}'.indexOf(before) === -1 &&
               ';{}(,:[=&|?+-*/%<>!'.indexOf(before) === -1 && after && '.)]},;:'.indexOf(after) === -1) {
        /* A line break that could be terminating a statement. Cheaper to keep
         * it than to reason about automatic semicolon insertion. */
        out.push('\n');
      }
      i = j;
      continue;
    }

    /* ── ordinary code ─────────────────────────────────────────────────── */
    if (tmpl.length && !tmpl[tmpl.length - 1].raw) {
      if (c === '{') tmpl[tmpl.length - 1].depth++;
      else if (c === '}') {
        tmpl[tmpl.length - 1].depth--;
        if (tmpl[tmpl.length - 1].depth === 0) tmpl[tmpl.length - 1].raw = true;
      }
    }
    out.push(c);
    prevWord = /[A-Za-z0-9_$]/.test(c) ? (prevWord + c) : '';
    prev = c;
    i++;
  }

  return out.join('');
}

/* ══════════════════════════════════════════════════════════════════════════
 * [RT-9] get_page_body — the same page, without the 190 KB that is already here
 *
 * doGet renders a page by evaluating its template with include() inlining the
 * shared bundle. On a navigation from one page of the app to another, all of
 * that shared bundle is ALREADY in the document: the browser downloads it,
 * parses it and executes it a second time for no reason at all.
 *
 * This returns the same template, evaluated the same way, with the shared
 * includes suppressed — so a soft navigation transfers a page's own body and
 * script and nothing else.
 *
 * THE AUTHORIZATION GATE IS THE SAME GATE. checkPageAccessForUI_, on the same
 * action, with the same registry lookup and the same public-page rule as doGet.
 * A faster route to a page must never be a route around the check that decides
 * whether you may see it. This is the single highest-risk line in the whole
 * programme and it is deliberately a copy of doGet's, not a variation on it.
 * ══════════════════════════════════════════════════════════════════════════ */

/* Set only for the duration of one getPageBody_ call. include() reads it and
 * returns nothing for the three shared files, which are already in the
 * document the router is swapping content inside. */
var SUPPRESS_SHARED_INCLUDES = false;

function getPageBody_(data, user) {
  const action = String((data && data.action) || '').trim();
  if (!action) throw new Error('الصفحة مطلوبة');

  /* Same registry rule as doGet: an entry with no template is a permission
   * token, not a page, and must never be rendered. */
  const page = getAllPages_().find(p => p.action === action && p.template);
  if (!page) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);

  if (!page.public) {
    if (!user) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    if (!checkPageAccessForUI_(user, page.accessPage || action)) {
      /* Deliberately the same opaque message as an unknown page: a soft
       * navigation must not become an oracle for which pages exist. */
      throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  let tmpl;
  try {
    tmpl = HtmlService.createTemplateFromFile(page.template);
  } catch (missing) {
    throw new Error('الصفحة غير متاحة');
  }

  tmpl.user = user || null;
  tmpl.email = '';
  tmpl.purchaseCode = '';
  tmpl.currentAction = action;
  tmpl.pageParams = JSON.stringify({ action: action });
  tmpl.companyPages = '[]';
  for (const key in COMPANY_REGISTRY) {
    const c = COMPANY_REGISTRY[key];
    if (c.pages && c.pages.some(p => p.action === action)) {
      tmpl.companyPages = JSON.stringify(
        c.pages
          .filter(p => p.nav !== false && (!user || checkPageAccessForUI_(user, p.action)))
          .map(p => ({ action: p.action, label: p.label || p.title }))
      );
      break;
    }
  }

  let rendered;
  SUPPRESS_SHARED_INCLUDES = true;
  try {
    rendered = tmpl.evaluate().getContent();
  } finally {
    /* In a finally, so a template that throws cannot leave every LATER request
     * in this execution rendering pages with no shared bundle at all. */
    SUPPRESS_SHARED_INCLUDES = false;
  }
  rendered = rendered.split('__APP_WEB_URL__').join(SCRIPT_URL)
                     .split('__APP_SESSION_TOKEN__').join(CURRENT_SESSION_TOKEN);

  /* Split the rendered document into the two things the router needs. The
   * scripts are returned SEPARATELY rather than left in the html, because
   * assigning innerHTML does not execute <script> tags — the router has to
   * evaluate them itself, and it needs them in order. */
  const scripts = [];
  const body = extractBody_(rendered).replace(
    /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi,
    function (m, code) { scripts.push(code); return ''; }
  );

  /* Inline <style> blocks survive inside the html and are applied when it is
   * inserted, so they need no special handling. */
  return {
    status: 'success',
    action: action,
    title: page.title || action,
    html: body,
    scripts: scripts
  };
}

/** The contents of <body>, or the whole document when there is no body tag. */
function extractBody_(html) {
  const open = html.search(/<body[^>]*>/i);
  if (open === -1) return html;
  const start = html.indexOf('>', open) + 1;
  const close = html.toLowerCase().lastIndexOf('</body>');
  return (close === -1) ? html.slice(start) : html.slice(start, close);
}

/* Which files are worth minifying. The three shared ones are 87% of every
 * page's payload and are included by 85 pages each; a page's own body is
 * included once and is small. Keeping the list explicit means a new page
 * template cannot accidentally be run through the minifier before anyone has
 * looked at it. */
var MINIFY_FILES_ = { 'UI_Components': 1, 'Client_Helpers': 1, 'CSS_Tokens': 1 };

/* A cheap, stable content hash. Not a checksum — a cache key. */
function contentHash_(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + '_' + s.length.toString(36);
}

/*
 * [RT-8] include() runs for every shared file on every page render — 85 times
 * per navigation — and already did a split().join() over the whole string
 * twice. Minifying on top of that, per request, would cost far more than the
 * bytes it saves.
 *
 * So the result is held in CacheService keyed by a hash of the CONTENT, not by
 * the filename: a filename key would go stale on the next deploy and serve the
 * previous release's JavaScript, which is a much worse bug than a slow render.
 * With a content key, a deploy simply misses once and re-fills.
 */
function include(filename) {
  var rendered;
  try {
    var raw = HtmlService.createHtmlOutputFromFile(filename).getContent();
    rendered = (raw.indexOf('<?') === -1)
      ? raw
      : HtmlService.createTemplateFromFile(filename).evaluate().getContent();
  } catch (e) {
    rendered = HtmlService.createTemplateFromFile(filename).evaluate().getContent();
  }

  /* [RT-9] A soft navigation already has the shared bundle in the document.
   * Returning it again would make the "cheap" route the expensive one. */
  if (SUPPRESS_SHARED_INCLUDES && MINIFY_FILES_[filename]) return '';

  if (MINIFY_FILES_[filename] && !NO_MINIFY) {
    try {
      var key = 'min_' + contentHash_(rendered);
      /* The CHUNKED cache, not CacheService directly: the minified
       * UI_Components is about 195 KB and a single CacheService value is
       * capped at 100 KB. A plain put() would fail silently and this would
       * re-minify a 300 KB file on every one of the 85 include() calls per
       * navigation — far more expensive than the bytes it saves.
       * putChunkedCache_/getChunkedCache_ already solve exactly this, and
       * already treat a partial eviction as a total miss. */
      var hit = getChunkedCache_(key);
      if (hit === null || typeof hit !== 'string') {
        hit = minifyInclude_(rendered);
        /* Six hours, the CacheService maximum. An eviction costs one
         * re-minify, never a wrong answer, because the key IS the content. */
        putChunkedCache_(key, hit, 21600);
      }
      rendered = hit;
    } catch (eMin) {
      /* A minifier that throws must never take a page down with it. The
       * unminified file is always a correct answer. */
    }
  }

  rendered = rendered.split('__APP_WEB_URL__').join(SCRIPT_URL)
                   .split('__APP_SESSION_TOKEN__').join(CURRENT_SESSION_TOKEN);
  return rendered;
}

/* Defense mechanism: append client-side JS errors to ERP_Client_Log so issues
 * surfaced in the browser can be diagnosed later. Called via google.script.run. */
function redactClientErrorText_(value, limit) {
  return String(value == null ? '' : value).slice(0, limit || 2000)
    .replace(/(sessionToken|token|password|authorization)\s*[=:]\s*[^\s&"']+/gi, '$1=[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]');
}

function logClientError_(payload, sessionToken, authUser) {
  try {
    payload = payload || {};
    if (systemStorageTarget_().backend === 'firestore') {
      var actorFs = authUser && authUser.email ? String(authUser.email).toLowerCase() : 'anonymous';
      systemCreateRecord_('ERP_Client_Log', { timestamp: new Date(), page: redactClientErrorText_(payload.page, 300), message: redactClientErrorText_(payload.message, 2000), stack: redactClientErrorText_(payload.stack, 4000), url: redactClientErrorText_(payload.url, 1500), user_email: actorFs === 'anonymous' ? '' : actorFs }, { operationId: 'client-error:' + actorFs + ':' + String(payload.page || '') + ':' + String(payload.message || '').slice(0, 80) });
      return { status: 'success' };
    }
    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    const sh = ss.getSheetByName('ERP_Client_Log');
    /* Creating a new log tab would be a schema change. A missing configured
     * observability sink is a deployment issue, not a reason to mutate schema. */
    if (!sh) return { status: 'error', code: 'CLIENT_LOG_NOT_CONFIGURED' };
    const actor = authUser && authUser.email ? String(authUser.email).toLowerCase() : 'anonymous';
    const rateKey = 'client_error_' + actor.replace(/[^a-z0-9]/g, '_');
    const cache = CacheService.getScriptCache();
    if (cache.get(rateKey)) return { status: 'success', skipped: true };
    cache.put(rateKey, '1', actor === 'anonymous' ? 60 : 10);
    sh.appendRow([
      new Date().toISOString(),
      redactClientErrorText_(payload.page, 300),
      redactClientErrorText_(payload.message, 2000),
      redactClientErrorText_(payload.stack, 4000),
      redactClientErrorText_(payload.url, 1500),
      actor === 'anonymous' ? '' : actor
    ]);
    noteMutation_(sh);
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/**
 * Stream a product's print_file from Drive as a browser download. The server
 * runs as the deployer (owner), so no public sharing is required — mirrors
 * AppSheet pulling the file from the owner's Drive.
 * Params: download=print_file, id=<product id>, company=<uid> (optional),
 * sessionToken=<valid token>.
 */


/* Phase 0b / [RT-2] — client-side timing. Sibling of logClientError_ so page
 * timings do not pollute the error log. Accepted while PERF_RUM (headline) or
 * PERF_LOG_READS (verbose diagnostics) is on; the client is told via
 * window.PERF_LOG (injected in doGet) so a disabled window costs no round trip.
 * Phase B: the route requires auth, identity is derived server-side, and the
 * client-supplied email and URL are ignored.
 *
 * The client now batches a navigation's marks into ONE call — four to six
 * metrics arrive together in payload.marks — so this appends them in one
 * setValues rather than one appendRow each. A navigation therefore costs one
 * request and one write instead of four of each.
 *
 * The single-metric shape (payload.metric / payload.ms) is still accepted: a
 * cached page served before this deploy will keep sending it, and a
 * measurement window that silently drops half its rows is worse than none.
 *
 * ERP_Client_Perf keeps exactly the six columns it has always had. Byte counts
 * (nav_transfer_bytes, nav_decoded_bytes) travel in the `ms` column with the
 * unit in the metric name, because changing this sheet's columns is not what
 * this work is for. */
/* Phase B ingestion allowlist: names logClientPerf_ accepts and stores. The
 * dashboard displays a strict subset of these (PERF_CLIENT_DISPLAY_METRICS_). */
var PERF_CLIENT_METRICS_ = {
  page_ready: true, page_load: true, first_data_render: true,
  nav_server: true, nav_transfer: true, nav_parse: true,
  nav_transfer_bytes: true, nav_decoded_bytes: true,
  page_usable_ms: true, form_editable_ms: true, form_options_ready_ms: true,
  lookup_ready_ms: true, save_feedback_ms: true, save_confirmed_ms: true,
  input_feedback_ms: true
};

/* Phase E §9 — metric-name reconciliation, server side.
 *
 * ERP_Client_Perf has exactly six columns (ts, page, metric, ms, url,
 * user_email) and none are added here. A metric therefore belongs on the
 * dashboard only when it is a millisecond duration — that is what the `ms`
 * column means. This display allowlist is a STRICT SUBSET of the ingestion
 * allowlist above; anything else is dropped by the dashboard and counted in
 * client.info.unmapped_rows, never repurposed into a column.
 *
 * MAPPING (client flush names read from Client_Helpers.html):
 *   stored AND displayed — 13: page_ready, page_load, first_data_render,
 *     nav_server, nav_transfer, nav_parse, page_usable_ms, form_editable_ms,
 *     form_options_ready_ms, lookup_ready_ms, save_feedback_ms,
 *     save_confirmed_ms, input_feedback_ms. All are ms durations.
 *   stored, NOT displayed — 2: nav_transfer_bytes, nav_decoded_bytes. They are
 *     byte counts, not milliseconds. logClientPerf_ keeps the documented legacy
 *     "unit in the metric name" exception, so ingestion stays permissive, but
 *     a byte count does not match the `ms` column's semantics and the
 *     dashboard drops it. Amendment to display them: a byte-valued column (or
 *     a generic value+unit metric table) is required; not done here.
 *   dropped at ingestion/display — 6: list_usable_ms, upload_ready_ms,
 *     print_ready_ms, task_wall_ms, task_active_ms, system_wait_ms. The RUM
 *     client emits them (buildEvent) but filters them out of the marks batch
 *     (SERVER_METRICS), and the server allowlist rejects them. They are
 *     durations, so persisting them only needs both allowlists widened — but
 *     correlating them to a task/journey additionally needs new columns
 *     (journey id, task kind, outcome). Amendment required; not done here.
 *   NOT instrumented — confirmed saves and task completion are COUNTS and
 *     OUTCOMES; the flat metric/ms row cannot express either, so capabilities
 *     reports them as 'not_instrumented' rather than inventing a proxy. */
var PERF_CLIENT_DISPLAY_METRICS_ = {
  page_ready: true, page_load: true, first_data_render: true,
  nav_server: true, nav_transfer: true, nav_parse: true,
  page_usable_ms: true, form_editable_ms: true, form_options_ready_ms: true,
  lookup_ready_ms: true, save_feedback_ms: true, save_confirmed_ms: true,
  input_feedback_ms: true
};

/** Allowlisted canonical route id, or '' — a raw client URL is never stored. */
function perfCanonicalPage_(value) {
  var page = String(value || '');
  return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(page) ? page : '';
}

/** Cheap per-session rate limit. Fails open: telemetry never blocks business. */
function perfClientRateOk_(authUser) {
  try {
    var key = 'perfci_' + perfUserHash_(authUser && authUser.email) + '_' + Math.floor(new Date().getTime() / 60000);
    var cache = CacheService.getScriptCache();
    var n = Number(cache.get(key)) || 0;
    if (n >= PERF_TELEMETRY_.CLIENT_MAX_PER_MINUTE) return false;
    cache.put(key, String(n + 1), 120);
    return true;
  } catch (e) { return true; }
}

function logClientPerf_(payload, sessionToken, authUser) {
  /* Phase B: authenticated ingestion. Identity comes from the session; the
   * client-supplied user/url are ignored and their columns stay blank. A
   * rejection or failure here never changes a business outcome. */
  try {
    if (!PERF_TELEMETRY_.ENABLED || !perfClientIngestEnabled_()) return { status: 'success', skipped: true };
    if (!authUser || !authUser.email) { perfHealthAdd_('rejected_client', 1); return { status: 'success', skipped: true }; }
    if (!perfClientRateOk_(authUser)) { perfHealthAdd_('rate_limited_client', 1); return { status: 'success', skipped: true, rate_limited: true }; }
    payload = payload || {};

    var marks = Array.isArray(payload.marks) ? payload.marks : null;
    if (!marks) {
      if (!payload.metric) return { status: 'success', skipped: true };
      marks = [{ metric: payload.metric, ms: payload.ms }];
    }
    /* A runaway client must not be able to turn one request into a thousand
     * rows; a navigation produces six marks at the most. Oversize batches are
     * rejected whole and counted, never silently trimmed. */
    if (marks.length > PERF_TELEMETRY_.CLIENT_MAX_MARKS) {
      perfHealthAdd_('rejected_client', 1);
      return { status: 'success', skipped: true, rejected: 'batch_too_large' };
    }
    var encoded = '';
    try { encoded = JSON.stringify(payload); } catch (eEnc) { encoded = ''; }
    if (!encoded || encoded.length > PERF_TELEMETRY_.CLIENT_MAX_BATCH_BYTES) {
      perfHealthAdd_('rejected_client', 1);
      return { status: 'success', skipped: true, rejected: 'batch_too_large' };
    }

    var page = perfCanonicalPage_(payload.page);
    var clean = [];
    marks.forEach(function (m) {
      if (!m || !PERF_CLIENT_METRICS_[String(m.metric)]) { perfHealthAdd_('invalid_marks', 1); return; }
      var ms = perfFiniteNumber_(m.ms);
      if (ms === null) { perfHealthAdd_('invalid_marks', 1); return; }
      clean.push({ metric: String(m.metric), ms: ms });
    });
    if (!clean.length) return { status: 'success', rows: 0 };

    if (systemStorageTarget_().backend === 'firestore') {
      clean.forEach(function (m, i) { systemCreateRecord_('ERP_Client_Perf', { ts: new Date(), page: page, metric: m.metric.slice(0, 60), ms: m.ms, url: '', user_email: '' }, { operationId: 'client-perf:' + page + ':' + m.metric + ':' + String(new Date().getTime()) + ':' + i }); });
      return { status: 'success', rows: clean.length };
    }

    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    let sh = ss.getSheetByName('ERP_Client_Perf');
    if (!sh) {
      sh = ss.insertSheet('ERP_Client_Perf');
      noteMutation_(sh);
      sh.appendRow(['ts', 'page', 'metric', 'ms', 'url', 'user_email']);
      noteMutation_(sh);
    }
    const ts = new Date().toISOString();
    const rows = clean.map(function (m) {
      return [ts, page, m.metric.slice(0, 60), m.ms, '', ''];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    noteMutation_(sh);
    return { status: 'success', rows: rows.length };
  } catch (e) {
    /* Fail open: ingestion failure is never a business failure. */
    return { status: 'success', skipped: true };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * [RT-10] Request telemetry — cheap enough to leave on permanently
 *
 * PERF_LOG_READS answers "what is slow today", once, and then has to be turned
 * off again: it appends a SystemLog row per request, so it adds a WRITE TO
 * EVERY READ, and SystemLog already grows without bound and carries
 * JSON.stringify(result.data) on every write row. PERF_BASELINE.md is explicit
 * that it is a measuring instrument, not a monitor.
 *
 * That means it cannot tell you that Thursday's release made المشتريات 400 ms
 * slower. Nothing can, today. So the thing worth building is not a better
 * measurement — it is a telemetry path so cheap that leaving it on is not a
 * decision anybody has to revisit.
 *
 * FOUR DESIGN DECISIONS, each answering a way this could go wrong:
 *
 * 1. A REQUEST PAYS ONE CACHE WRITE, NEVER A SHEET WRITE. apiRouter_ already
 *    measures elapsed and sheet reads; the numbers exist. They go onto a
 *    CacheService buffer keyed by the current minute, and a one-minute trigger
 *    drains the whole minute in one setValues. Losing a telemetry row to a
 *    cache eviction is acceptable — that is exactly why telemetry may use a
 *    cache and the audit queue may not.
 *
 * 2. SAMPLING FROM THE START, not retrofitted. 100% of writes, 100% of
 *    anything over a second, and a configurable fraction of fast reads. Without
 *    it the first busy week produces a sheet nobody can open, and by then it is
 *    too late to add.
 *
 * 3. NUMBERS ONLY. No payload, no record id, no email. The user column is a
 *    salted hash, which gives concurrency without a per-person activity record.
 *    SystemLog keeps the audit story; this sheet is what got slower. A perf log
 *    that quietly becomes a surveillance log is a failure even if every
 *    millisecond in it is correct.
 *
 * 4. IT CAN NEVER FAIL A REQUEST. Every path is wrapped. A full cache, a
 *    throwing cache, a missing sheet — all of them mean "log nothing", never
 *    "fail the thing the user asked for".
 * ══════════════════════════════════════════════════════════════════════════ */

function perfLogReadsEnabled_() {
  if (_perfLogReads_ === null) {
    _perfLogReads_ = false;
    try {
      const v = PropertiesService.getScriptProperties().getProperty('PERF_LOG_READS');
      _perfLogReads_ = (v === '1' || String(v).toLowerCase() === 'true');
    } catch (e) {}
  }
  return _perfLogReads_;
}

/** Phase B: headline RUM sampling, independent of PERF_LOG_READS. Default OFF. */
function perfRumEnabled_() {
  if (_perfRum_ === null) {
    _perfRum_ = false;
    try {
      const v = PropertiesService.getScriptProperties().getProperty('PERF_RUM');
      _perfRum_ = (v === '1' || String(v).toLowerCase() === 'true');
    } catch (e) {}
  }
  return _perfRum_;
}

/** Headline sample rate. Script Property PERF_RUM_RATE overrides (0..1). */
function perfRumRate_() {
  if (_perfRumRate_ === null) {
    _perfRumRate_ = PERF_TELEMETRY_.SAMPLE_RATE;
    try {
      const v = Number(PropertiesService.getScriptProperties().getProperty('PERF_RUM_RATE'));
      if (isFinite(v) && v >= 0 && v <= 1) _perfRumRate_ = v;
    } catch (e) {}
  }
  return _perfRumRate_;
}

/** Verbose diagnostics stay gated by PERF_LOG_READS, unchanged. */
function perfDiagnosticsEnabled_() { return perfLogReadsEnabled_(); }

/** Client batch ingestion is accepted for either collection stream. */
function perfClientIngestEnabled_() { return perfRumEnabled_() || perfLogReadsEnabled_(); }

function ensureSystemLogSheet_() {
  try {
    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('SystemLog');
    if (!sheet) {
      sheet = ss.insertSheet('SystemLog');
      noteMutation_(sheet);
      sheet.appendRow(SYSTEM_LOG_HEADERS);
      noteMutation_(sheet);
      return sheet;
    }
    // Sheet already exists live — migrate in place. Only ADD missing headers
    // at the end; never touch existing columns or historical rows.
    const existing = getHeaders_(sheet).map(function (h) { return String(h).trim(); });
    const missing = SYSTEM_LOG_HEADERS.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) {
      sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
      noteMutation_(sheet);
      delete _headerCache_[sheet.getParent().getId() + '_' + sheet.getSheetId()]; // bust getHeaders_ cache
    }
    return sheet;
  } catch (e) {
    throw new Error('Failed to create/access SystemLog sheet: ' + e.message);
  }
}

/** Looks up the page for a module_action via each company's optional pageForAction(). */
function resolveLogPage_(companyID, moduleAction) {
  const company = COMPANY_REGISTRY[companyID];
  if (company && typeof company.pageForAction === 'function') {
    return company.pageForAction(moduleAction) || '';
  }
  return '';
}

/** Looks up the sheet/table touched by a module_action via each company's optional tableForAction(). */
function resolveLogTable_(companyID, moduleAction) {
  const company = COMPANY_REGISTRY[companyID];
  if (company && typeof company.tableForAction === 'function') {
    return company.tableForAction(moduleAction) || '';
  }
  return '';
}

function logSystemAction_(request, authUser, result, status, errorMessage, startTime) {
  try {
  const payload = (request && request.payload) || {};
  // company_action calls carry the real action in payload.module_action;
  // direct admin_* routes carry it as the top-level request.action.
  const sourceAction = payload.module_action || request.action;
  let classified = classifyAction_(sourceAction);

  if (classified === 'NO_LOG') {
    // Phase 0b: optionally log reads so they can be ranked. Never log the
    // credential-bearing actions, regardless of the flag.
    const src = String(sourceAction).toLowerCase();
    const isCredentialAction = (src === 'login_user' || src === 'request_password_setup_code' || src === 'setup_password');
    if (!perfLogReadsEnabled_() || isCredentialAction) return;
    classified = 'READ';
  }

  const companyID = payload.target_system || '';
  const companyName = getCompanyName_(companyID);
  const recordID = extractRecordId_(sourceAction, result);
  const userEmail = authUser ? authUser.email : '';
  // A read's result.data is the whole list — serialising it would balloon
  // SystemLog by megabytes per measurement window, so reads log a size instead.
  const changedFields = classified === 'READ'
    ? '(read)'
    : (result && result.data ? JSON.stringify(result.data) : '');
  const tableName = resolveLogTable_(companyID, sourceAction);
  // Prefer an explicit page_id from the payload if the client ever sends one;
  // otherwise fall back to the per-company action->page map.
  const pageName = payload.page_id || resolveLogPage_(companyID, sourceAction);

  let finalAction = classified;
  if (finalAction === 'ADMIN_SAVE') {
    finalAction = String(sourceAction).indexOf('save') !== -1 ? 'EDIT' : 'ADD';
  }

  const values = {
    logid: Utilities.getUuid(),
    timestamp: startTime,
    companyid: companyID,
    companyname: companyName,
    action: finalAction,
    sourceaction: sourceAction,
    recordid: recordID,
    useremail: userEmail,
    changedfields: changedFields,
    status: status,
    errormessage: errorMessage,
    table: tableName,
    page: pageName,
    // Phase 0b instrumentation.
    elapsedms: startTime ? (new Date().getTime() - startTime.getTime()) : '',
    sheetreads: (typeof getSheetsReadCount_ === 'function') ? getSheetsReadCount_() : ''
  };

  if (systemStorageTarget_().backend === 'firestore') {
    try {
      systemCreateRecord_('SystemLog', values, { operationId: 'system-log:' + values.logid });
    } catch (e) { try { console.error('Failed to log system action: ' + e.message); } catch (ignore) {} }
    return;
  }

  const logEntry = SYSTEM_LOG_HEADERS.map(function (h) {
    const v = values[String(h).toLowerCase()];
    return v === undefined || v === null ? '' : v;
  });

  try {
    const sheet = ensureSystemLogSheet_();
    appendRowWithRetry_(sheet, logEntry);
  } catch (e) {
    try { console.error('Failed to log system action: ' + e.message); } catch (ignore) {}
  }
  } catch (e) {
    try { console.error('System logging disabled: ' + String(e && e.message || e).slice(0, 180)); } catch (ignore) {}
  }
}

/** Resolve only a stored immutable Drive file ID. Filename lookup is forbidden. */
function resolveDriveFile_(storedFileId) {
  const raw = String(storedFileId || '').trim();
  const matched = raw.match(/\/d\/([A-Za-z0-9_-]+)/);
  const fileId = matched ? matched[1] : raw;
  if (!/^[A-Za-z0-9_-]{20,}$/.test(fileId)) return null;
  try { return DriveApp.getFileById(fileId); } catch (e) { return null; }
}

/* Folder-scoped attachment lookup. Never use a global filename search, and
 * distinguish a unique result from a missing or ambiguous folder/file match. */

function escapeDriveQueryLiteral_(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
function findDriveFolderIdsByName_(folderName) {
  if (!folderName) return { status: 'missing', ids: [] };
  try {
    var it = DriveApp.getFoldersByName(folderName), ids = [];
    while (it && it.hasNext()) {
      var id = it.next().getId();
      if (id && ids.indexOf(id) === -1) ids.push(id);
    }
    if (ids.length) return { status: 'found', ids: ids };
  } catch (e) {}
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
      var q = "name = '" + escapeDriveQueryLiteral_(folderName) + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
      var ids2 = [], pageToken;
      do {
        var options = { q: q, fields: 'files(id),nextPageToken', pageSize: 1000 };
        if (pageToken) options.pageToken = pageToken;
        var res = Drive.Files.list(options);
        (res && res.files || []).forEach(function (file) { if (file && file.id && ids2.indexOf(file.id) === -1) ids2.push(file.id); });
        pageToken = res && res.nextPageToken;
      } while (pageToken);
      return ids2.length ? { status: 'found', ids: ids2 } : { status: 'missing', ids: [] };
    }
  } catch (e2) { return { status: 'unavailable', ids: [] }; }
  return { status: 'missing', ids: [] };
}
function findDriveFolderMatchByName_(folderName) {
  var result = findDriveFolderIdsByName_(folderName);
  if (result.status !== 'found') return { status: result.status };
  if (result.ids.length !== 1) return { status: 'duplicate' };
  return { status: 'found', id: result.ids[0] };
}
function findDriveFolderIdByName_(folderName) {
  var result = findDriveFolderMatchByName_(folderName);
  return result.status === 'found' ? result.id : '';
}
function findDriveFileMatchInFolder_(folderId, fileName) {
  if (!folderId || !fileName) return { status: 'missing' };
  try {
    var folder = DriveApp.getFolderById(folderId), it = folder.getFilesByName(fileName), ids = [];
    while (it && it.hasNext()) {
      ids.push(it.next().getId());
      if (ids.length > 1) return { status: 'duplicate' };
    }
    if (ids.length === 1) return { status: 'found', id: ids[0] };
  } catch (e) {}
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
      var q = "name = '" + escapeDriveQueryLiteral_(fileName) + "' and '" + escapeDriveQueryLiteral_(folderId) + "' in parents and trashed = false";
      var ids2 = [], pageToken;
      do {
        var options = { q: q, fields: 'files(id),nextPageToken', pageSize: 1000 };
        if (pageToken) options.pageToken = pageToken;
        var res = Drive.Files.list(options);
        (res && res.files || []).forEach(function (file) { if (file && file.id) ids2.push(file.id); });
        if (ids2.length > 1) return { status: 'duplicate' };
        pageToken = res && res.nextPageToken;
      } while (pageToken);
      return ids2.length === 1 ? { status: 'found', id: ids2[0] } : { status: 'missing' };
    }
  } catch (e2) { return { status: 'unavailable' }; }
  return { status: 'missing' };
}
function findDriveFileIdInFolder_(folderId, fileName) {
  var result = findDriveFileMatchInFolder_(folderId, fileName);
  return result.status === 'found' ? result.id : '';
}

function findDriveFileByRequestId_(folderId, requestId) {
  var rid = String(requestId || '').trim();
  if (!folderId || !/^[A-Za-z0-9_-]{16,100}$/.test(rid)) return null;
  var q = "appProperties has {key='erpRequestId' and value='" + rid + "'} and '" +
    String(folderId).replace(/'/g, "\\'") + "' in parents and trashed = false";
  function pick(files) {
    if (files && files.length === 1 && files[0] && files[0].id) {
      return { id: String(files[0].id), name: String(files[0].name || '') };
    }
    return null;
  }
  try {
    if (typeof Drive !== 'undefined' && Drive.Files && Drive.Files.list) {
      var res = Drive.Files.list({ q: q, fields: 'files(id,name)', pageSize: 10 });
      if (res && res.files) {
        if (res.files.length === 1) return pick(res.files);
        if (res.files.length > 1) return null;
      }
    }
  } catch (e) {}
  try {
    var token = ScriptApp.getOAuthToken();
    var url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=files(id,name)&pageSize=10';
    var fetched = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (fetched.getResponseCode() === 200) {
      var data = JSON.parse(fetched.getContentText());
      if (data && data.files) {
        if (data.files.length === 1) return pick(data.files);
        if (data.files.length > 1) return null;
      }
    }
  } catch (e2) {}
  return null;
}
/**
 * One-time backfill: folder/filename -> Drive file ID for all attachment sheets.
 * Run manually (superAdmin) or via company_action. Params: {dryRun:true, page:<optional>}.
 * Resolves each stored ref basename inside its expected Drive folder(s) and writes
 * <file>_id columns. Never does global filename search — folder-constrained only.
 */
/** Resolve a stored AppSheet path only within folders allowed for this field. */
/**
 * Generic attachment viewer (image/pdf preview + download). Authorizes the
 * business record, then opens its stored Drive ID or exact AppSheet path
 * within a uniquely resolved, registered table folder. No backfill is required.
 * Params: download=attachment (or legacy doc_file),
 *   page=<page>, id=<record key> (preferred) OR ref=<folder/file> (legacy),
 *   field=<file field> (optional when a record has several), sheet=<sheet>
 *   (optional override for pages with several sheets), sessionToken
 */
function attachmentFileIdField_(fileField) {
  return String(fileField || '').trim() + '_id';
}
function requireAttachmentBinding_(reference, fileId, label) {
  var ref = String(reference || '').trim(), id = extractDriveId_(fileId);
  if (ref && !id) throw new Error('لم يتم تثبيت معرف Drive للمرفق ' + String(label || '') + '؛ أعد رفع الملف ثم احفظ السجل.');
  return id;
}
function attachmentCachedFileId_(reference) {
  try {
    var ref = String(reference || '').trim();
    if (!ref) return '';
    return String(CacheService.getScriptCache().get('attid_' + ref) || '').trim();
  } catch (e) { return ''; }
}
function attachmentPickFileId_(data, fileField) {
  data = data || {};
  var idField = attachmentFileIdField_(fileField);
  var cand = data[idField] != null ? String(data[idField]).trim() : '';
  if (!cand) cand = data[String(idField).toLowerCase()] != null ? String(data[String(idField).toLowerCase()]).trim() : '';
  var ref = data[fileField] != null ? String(data[fileField]).trim() : '';
  if (!ref) ref = data[String(fileField).toLowerCase()] != null ? String(data[String(fileField).toLowerCase()]).trim() : '';
  var suppliedId = extractDriveId_(cand || (data.fileId && fileField ? String(data.fileId).trim() : ''));
  if (suppliedId) {
    /* A client ID is accepted only when it matches the exact upload binding. */
    var bound = attachmentCachedFileId_(ref);
    return bound && bound === suppliedId ? suppliedId : '';
  }
  if (ref) {
    var fromCache = attachmentCachedFileId_(ref);
    if (extractDriveId_(fromCache)) return extractDriveId_(fromCache);
  }
  return extractDriveId_(ref);
}
/** Known AppSheet storage folders for a registered table/field. */
function attachmentFoldersForField_(target, field) {
  var preferred = (target.folderByField && target.folderByField[field]) || target.folder;
  var folders = [preferred].concat(target.legacyFolders || []);
  if (target.sheet) folders = folders.concat([target.sheet + '_Files_', target.sheet + '_Images']);
  return folders.filter(function (folder, i) { return folder && folders.indexOf(folder) === i; });
}
function findAttachmentFileMatch_(target, field, reference) {
  var parts = String(reference || '').trim().split('/');
  var filename = parts[parts.length - 1];
  if (!attachmentReferenceFolder_(target, field, reference)) return { status: 'untrusted_folder' };
  var allowed = attachmentFoldersForField_(target, field), preferred = (target.folderByField && target.folderByField[field]) || target.folder;
  var primary = parts.length === 2 ? parts[0] : preferred, folders = [];
  function addFolderName(name) { if (name && allowed.indexOf(name) !== -1 && folders.indexOf(name) === -1) folders.push(name); }
  addFolderName(primary);
  addFolderName((target.folderAliases && target.folderAliases[primary]) || '');
  addFolderName(preferred);
  allowed.forEach(addFolderName);

  var matches = [], duplicateNames = [], unavailableNames = [];
  function scanFolderName(folderName) {
    var folderSet = findDriveFolderIdsByName_(folderName);
    if (folderSet.status === 'unavailable') { unavailableNames.push(folderName); return; }
    if (folderSet.status !== 'found') return;
    folderSet.ids.forEach(function (folderId) {
      var fileMatch = findDriveFileMatchInFolder_(folderId, filename);
      if (fileMatch.status === 'duplicate') duplicateNames.push(folderName);
      else if (fileMatch.status === 'unavailable') unavailableNames.push(folderName);
      else if (fileMatch.status === 'found' && !matches.some(function (hit) { return hit.id === fileMatch.id; })) {
        matches.push({ folder: folderName, id: fileMatch.id });
      }
    });
  }

  scanFolderName(primary);
  var primaryMatches = matches.filter(function (hit) { return hit.folder === primary; });
  if (duplicateNames.indexOf(primary) !== -1 || primaryMatches.length > 1) return { status: 'duplicate', folder: primary };
  folders.forEach(function (folderName) { if (folderName !== primary) scanFolderName(folderName); });
  if (primaryMatches.length === 1) return { status: 'found', id: primaryMatches[0].id, folder: primary };
  if (unavailableNames.indexOf(primary) !== -1) return { status: 'unavailable', folder: primary };
  if (duplicateNames.length) return { status: 'duplicate', folder: duplicateNames[0] };
  if (unavailableNames.length) return { status: 'unavailable', folder: unavailableNames[0] };
  if (matches.length === 1) return { status: 'found', id: matches[0].id, folder: matches[0].folder };
  if (matches.length > 1) return { status: 'duplicate', folder: matches.map(function (hit) { return hit.folder; }).join(', ') };
  return { status: 'missing', folder: primary };
}
function findAttachmentFileIdAcrossFolders_(target, field, reference) {
  var match = findAttachmentFileMatch_(target, field, reference);
  return match.status === 'found' ? match.id : '';
}
function attachmentTargets_(config) { return [config].concat(config.altSheets || []); }
function attachmentTargetMatchesRef_(target, reference) {
  if (String(reference || '').split('/').length !== 2) return false;
  return target.fileFields.some(function (field) { return !!attachmentReferenceFolder_(target, field, reference); });
}
/** Read only: resolve the authorized record's ID or its exact AppSheet path. */
function attachmentOpenFile_(record, field, target) {
  var isCustomsOffice = !!(target && target.sheet === 'مكتب الجمارك');
  var rawId = isCustomsOffice ? '' : String(record[attachmentFileIdField_(field)] || '').trim();
  var storedId = isCustomsOffice ? '' : recordAttachmentFileId_(record, field);
  if (rawId && !extractDriveId_(rawId)) throw new Error('معرف المرفق المحفوظ غير صالح؛ يلزم مراجعة السجل.');
  if (storedId) {
    var existing = resolveDriveFile_(storedId);
    if (!existing) throw new Error('تعذر الوصول إلى الملف بمعرف Drive المحفوظ. تحقق من وجوده وصلاحية حساب التطبيق.');
    return existing;
  }
  var ref = String(record[field] == null ? record[String(field).toLowerCase()] || '' : record[field]).trim();
  if (!ref) throw new Error('لا يوجد مرفق في الحقل المحدد.');
  var folderName = attachmentReferenceFolder_(target, field, ref);
  if (!folderName) throw new Error('مسار المرفق ليس ضمن مجلدات هذا الجدول المسموح بها.');
  var match = findAttachmentFileMatch_(target, field, ref);
  if (match.status === 'missing') throw new Error('لم يُعثر على الملف بالاسم الكامل في مجلدات المرفقات المسموح بها.');
  if (match.status === 'duplicate') throw new Error('يوجد أكثر من ملف مطابق للاسم داخل مجلدات المرفقات المسموح بها: ' + match.folder);
  if (match.status === 'unavailable') throw new Error('تعذر فحص بعض مجلدات المرفقات لدى حساب التطبيق: ' + match.folder);
  if (match.status !== 'found') throw new Error('مسار المرفق ليس ضمن مجلدات هذا الجدول المسموح بها.');
  var fileId = match.id;
  var file = resolveDriveFile_(fileId);
  if (!file) throw new Error('تعذر قراءة المرفق. تحقق من صلاحيات حساب التطبيق على الملف.');
  return file;
}
function attachmentRegistry_() {
  try { ensureCompaniesRegistered_(); } catch (e) {}
  var out = {};
  var companies = typeof COMPANY_REGISTRY === 'undefined' ? {} : COMPANY_REGISTRY;
  Object.keys(companies || {}).forEach(function (key) {
    var cfg = companies[key] || {}, policy = cfg.attachmentPolicy;
    if (typeof policy === 'function') policy = policy();
    Object.keys(policy || {}).forEach(function (page) { out[page] = policy[page]; });
  });
  return out;
}
function ensureAttachmentColumn_(dbId, sheetName, fileIdField) {
  try {
    var sheet = getSheet_(sheetName, dbId);
    var headers = getHeaders_(sheet);
    var want = String(fileIdField || '').trim().toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === want) return false;
    }
    sheet.getRange(1, headers.length + 1).setValue(fileIdField);
    try { noteMutation_(sheet); } catch (e) {}
    return true;
  } catch (e) { return false; }
}
function extractDriveId_(v) {
  var raw = String(v || '').trim();
  if (!raw) return '';
  var m = raw.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) return raw;
  return '';
}
function recordAttachmentFileId_(record, fileField) {
  if (!record) return '';
  var idField = attachmentFileIdField_(fileField);
  var cand = record[idField] != null ? String(record[idField]).trim() : '';
  if (!cand) cand = record[String(idField).toLowerCase()] != null ? String(record[String(idField).toLowerCase()]).trim() : '';
  var id = extractDriveId_(cand);
  if (id) return id;
  var ref = record[fileField] != null ? String(record[fileField]).trim() : '';
  if (!ref) ref = record[String(fileField).toLowerCase()] != null ? String(record[String(fileField).toLowerCase()]).trim() : '';
  return extractDriveId_(ref);
}
function attachmentAuthorizedStoredId_(dbId, sheetName, source, fileField, candidateId) {
  var ref = source && source[fileField] != null ? String(source[fileField]).trim() : '';
  var candidate = extractDriveId_(candidateId);
  if (!ref || !candidate) return '';
  try {
    var rows = getAllRecords_(dbId, sheetName) || [], matches = [];
    rows.forEach(function (row) {
      var storedRef = row[fileField] != null ? String(row[fileField]).trim() : '';
      if (!storedRef) storedRef = row[String(fileField).toLowerCase()] != null ? String(row[String(fileField).toLowerCase()]).trim() : '';
      if (storedRef === ref && recordAttachmentFileId_(row, fileField) === candidate) matches.push(row);
    });
    return matches.length === 1 ? candidate : '';
  } catch (e) { return ''; }
}
function findAttachmentRecord_(allRows, idField, idValue, fileFields, refValue) {
  var idStr = String(idValue == null ? '' : idValue).trim();
  if (idStr) {
    var idMatches = [];
    for (var i = 0; i < allRows.length; i++) {
      var r = allRows[i];
      var v = r[idField] != null ? r[idField] : r[String(idField).toLowerCase()];
      if (v == null) continue;
      if (String(v).trim() === idStr || (!isNaN(Number(v)) && !isNaN(Number(idStr)) && Number(v) === Number(idStr))) idMatches.push(r);
    }
    if (idMatches.length === 1) return { record: idMatches[0], fileField: '' };
    if (idMatches.length > 1) {
      /* Duplicate keys allowed (e.g. registration_papers reuses document_number
         and only the date changes): disambiguate by the owning document_file path. */
      var refForId = String(refValue == null ? '' : refValue).trim();
      if (refForId) {
        var owned = [];
        for (var oi = 0; oi < idMatches.length; oi++) {
          var orow = idMatches[oi];
          for (var ok = 0; ok < fileFields.length; ok++) {
            var off = fileFields[ok];
            var ofv = orow[off] != null ? String(orow[off]).trim() : '';
            if (!ofv) ofv = orow[String(off).toLowerCase()] != null ? String(orow[String(off).toLowerCase()]).trim() : '';
            if (ofv === refForId) { owned.push({ record: orow, fileField: off }); break; }
          }
        }
        if (owned.length === 1) return owned[0];
        if (owned.length === 0) return null;
        return { ambiguous: true, count: owned.length };
      }
      return { ambiguous: true, count: idMatches.length };
    }
    /* An explicit record key is authoritative; never fall back to another row. */
    return null;
  }
  var ref = String(refValue == null ? '' : refValue).trim();
  if (ref) {
    var matches = [];
    for (var j = 0; j < allRows.length; j++) {
      var row = allRows[j];
      for (var k = 0; k < fileFields.length; k++) {
        var ff = fileFields[k];
        var fv = row[ff] != null ? String(row[ff]).trim() : '';
        if (!fv) fv = row[String(ff).toLowerCase()] != null ? String(row[String(ff).toLowerCase()]).trim() : '';
        if (fv === ref) matches.push({ record: row, fileField: ff });
      }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return { ambiguous: true, count: matches.length };
  }
  return null;
}
function serveAttachment_(params) {
  params = params || {};
  var token = String(params.sessionToken || '').trim();
  var auth = token ? authenticateSystemUser_(token) : { authorized: false };
  if (!auth.authorized) {
    return _frame(HtmlService.createHtmlOutput(
      _topNavScript(ScriptApp.getService().getUrl() + '?action=login')
    )).setTitle('تسجيل الدخول');
  }
  var registry = attachmentRegistry_();
  var page = String(params.page || '').trim();
  var cfg = registry[page] || null;
  var refParam = String(params.ref || params.file || '').trim();
  if (page && !cfg) return ContentService.createTextOutput('Attachment page not found');
  if (!cfg && refParam) {
    var inferred = [];
    Object.keys(registry).forEach(function (key) {
      if (attachmentTargets_(registry[key]).some(function (target) { return attachmentTargetMatchesRef_(target, refParam); })) inferred.push(key);
    });
    if (inferred.length !== 1) return ContentService.createTextOutput('تعذر تحديد صفحة المرفق؛ افتحه من السجل الأصلي.');
    page = inferred[0]; cfg = registry[page];
  }
  if (!cfg) return ContentService.createTextOutput('Not found');
  var artifact;
  try {
    artifact = authorizeArtifact_(params, { company: cfg.company, page: page, access: 'read' });
  } catch (e) {
    return ContentService.createTextOutput(e && e.message ? e.message : 'غير مصرح');
  }
  var company = artifact.company;
  var sheetName = String(params.sheet || '').trim() || cfg.sheet;
  if (!params.sheet && refParam) {
    var matchingTargets = attachmentTargets_(cfg).filter(function (target) { return attachmentTargetMatchesRef_(target, refParam); });
    if (matchingTargets.length > 1) return ContentService.createTextOutput('Attachment table is ambiguous');
    if (matchingTargets.length === 1) sheetName = matchingTargets[0].sheet;
  }
  var selectedTarget = attachmentTargets_(cfg).filter(function (target) { return target.sheet === sheetName; })[0];
  var allowedSheets = [cfg.sheet];
  var fileFields = cfg.fileFields.slice();
  var idField = cfg.idField;
  if (cfg.altSheets) {
    for (var s = 0; s < cfg.altSheets.length; s++) allowedSheets.push(cfg.altSheets[s].sheet);
    for (var a = 0; a < cfg.altSheets.length; a++) {
      if (cfg.altSheets[a].sheet === sheetName) {
        fileFields = cfg.altSheets[a].fileFields.slice();
        idField = cfg.altSheets[a].idField;
        break;
      }
    }
  }
  if (allowedSheets.indexOf(sheetName) === -1) return ContentService.createTextOutput('Not found');
  var fieldParam = String(params.field || '').trim();
  if (fieldParam) {
    var ok = false;
    for (var f = 0; f < fileFields.length; f++) {
      if (fileFields[f] === fieldParam || String(fileFields[f]).toLowerCase() === fieldParam.toLowerCase()) { ok = true; break; }
    }
    if (!ok) return ContentService.createTextOutput('Not found');
    fileFields = [fileFields[f]];
  }
  var dbId;
  try { dbId = getCompanySpreadsheetId_(company); }
  catch (e) { return ContentService.createTextOutput('Not found'); }
  var rows;
  try { rows = getAllRecords_(dbId, sheetName); }
  catch (e) { return ContentService.createTextOutput('Not found'); }
  var idParam = String(params.id || params.document_number || params.unique_id || '').trim();
  var found = findAttachmentRecord_(rows, idField, idParam, fileFields, refParam);
  if (!found) return ContentService.createTextOutput(idParam ? 'Attachment record not found' : 'Attachment reference not found');
  if (found.ambiguous) return ContentService.createTextOutput('Attachment reference is ambiguous; open it from the record that owns it.');
  var rec = found.record;
  var fieldsToTry = found.fileField ? [found.fileField] : fileFields;
  if (idParam && refParam) {
    var refMatches = [];
    fieldsToTry.forEach(function (ff) {
      var raw = rec[ff] != null ? String(rec[ff]).trim() : '';
      if (!raw) raw = rec[String(ff).toLowerCase()] != null ? String(rec[String(ff).toLowerCase()]).trim() : '';
      if (raw === refParam) refMatches.push(ff);
    });
    if (refMatches.length !== 1) return ContentService.createTextOutput('Attachment reference does not belong to this record/field');
    fieldsToTry = [refMatches[0]];
  }
  fieldsToTry = fieldsToTry.filter(function (field) {
    return recordAttachmentFileId_(rec, field) || String(rec[field] || rec[String(field).toLowerCase()] || '').trim();
  });
  if (fieldsToTry.length !== 1) return ContentService.createTextOutput('حدد المرفق المطلوب من السجل.');
  var usedField = fieldsToTry[0], file;
  try { file = attachmentOpenFile_(rec, usedField, selectedTarget); }
  catch (e) { return ContentService.createTextOutput(e.message || 'تعذر فتح المرفق.'); }
  var blob;
  try { blob = file.getBlob(); }
  catch (e) { return ContentService.createTextOutput('File not found by immutable ID'); }
  var fname = '';
  try { fname = file.getName(); } catch (e) { fname = String(usedField || 'attachment'); }
  var ctype = '';
  try { ctype = String(blob.getContentType() || '').toLowerCase(); } catch (e) {}
  if (ctype.indexOf('image/') === 0 || ctype === 'application/pdf' || /\.pdf$/i.test(fname)) {
    return attachmentPreviewHtml_(fname, blob);
  }
  return dataUriDownloadHtml_(fname, blob);
}
function serveDocFile_(params) { return serveAttachment_(params); }


function attachmentReferenceFolder_(target, field, reference) {
  var preferred = (target.folderByField && target.folderByField[field]) || target.folder;
  var parts = String(reference || '').trim().split('/');
  if (parts.length === 1) return parts[0] && parts[0] !== '.' && parts[0] !== '..' ? preferred : '';
  if (parts.length !== 2 || !parts[1] || parts[1] === '.' || parts[1] === '..') return '';
  var allowed = attachmentFoldersForField_(target, field);
  if (allowed.indexOf(parts[0]) === -1) return '';
  // Keep historical aliases valid for route inference. File lookup separately
  // checks the stored prefix first, then its alias and the other allowed folders.
  var aliasedFolder = (target.folderAliases && target.folderAliases[parts[0]]) || parts[0];
  return allowed.indexOf(aliasedFolder) !== -1 ? aliasedFolder : '';
}
function backfillAttachmentIds_(payload, sessionToken, authUser) {
  payload = payload || {};
  var user = authUser || null;
  if (!user && sessionToken) { try { var a = authenticateSystemUser_(String(sessionToken).trim()); if (a && a.authorized) user = a.user; } catch (e) {} }
  if (!(user && user.isSuperAdmin)) throw new Error('صلاحية غير كافية؛ يلزم تشغيل الترحيل من جلسة مدير النظام المصادق عليها.');
  var dryRun = !(payload.dryRun === false || String(payload.dryRun).toLowerCase() === 'false');
  var onlyPage = String(payload.page || '').trim();
  var onlyReference = String(payload.reference || '').trim();
  if (onlyReference && !onlyPage) throw new Error('A page is required for a targeted attachment repair.');
  var offset = Math.max(0, Number(payload.offset) || 0), limit = Math.max(1, Math.min(500, Number(payload.limit) || 500));
  var registry = attachmentRegistry_(), summary = { dryRun: dryRun, reference: onlyReference, offset: offset, limit: limit, pages: {} };
  var pages = Object.keys(registry); if (onlyPage) pages = pages.filter(function (p) { return p === onlyPage; });
  pages.forEach(function (page) {
    var cfg = registry[page], targets = [{ sheet: cfg.sheet, idField: cfg.idField, fileFields: cfg.fileFields, folder: cfg.folder, folderByField: cfg.folderByField || {}, legacyFolders: cfg.legacyFolders || [], folderAliases: cfg.folderAliases || {} }];
    if (cfg.altSheets) cfg.altSheets.forEach(function (alt) { targets.push({ sheet: alt.sheet, idField: alt.idField, fileFields: alt.fileFields, folder: alt.folder, folderByField: alt.folderByField || {}, legacyFolders: alt.legacyFolders || [], folderAliases: alt.folderAliases || {} }); });
    targets.forEach(function (t) {
      var key = page + '/' + t.sheet, stat = { sheet: t.sheet, total: 0, alreadyHaveId: 0, inlineId: 0, wouldUpdate: 0, updated: 0, missing: 0, invalidExistingIds: 0, conflicts: 0, errors: [], unresolved: [], missingIdColumns: [], nextOffset: null };
      try {
        var dbId = getCompanySpreadsheetId_(cfg.company), sheet = getSheet_(t.sheet, dbId), headers = getHeaders_(sheet).map(function (h) { return String(h || '').trim(); });
        var lower = headers.map(function (h) { return h.toLowerCase(); }), colIdx = {}; lower.forEach(function (h, i) { if (h) colIdx[h] = i; });
        t.fileFields.forEach(function (ff) { var idName = attachmentFileIdField_(ff), want = idName.toLowerCase(); if (lower.indexOf(want) === -1) stat.missingIdColumns.push(idName); });
        var values = sheet.getDataRange().getValues(), updates = [], startRow = 1 + offset, endRow = Math.min(values.length, startRow + limit);
        for (var r = startRow; r < endRow; r++) {
          stat.total++;
          for (var f = 0; f < t.fileFields.length; f++) {
            var ff = t.fileFields[f], ffLow = ff.toLowerCase(), idLow = attachmentFileIdField_(ff).toLowerCase();
            if (!(ffLow in colIdx)) { stat.errors.push('row ' + (r + 1) + ' field ' + ff + ': source column missing'); continue; }
            var ref = String(values[r][colIdx[ffLow]] == null ? '' : values[r][colIdx[ffLow]]).trim(); if (!ref || (onlyReference && ref !== onlyReference)) continue;
            var existing = idLow in colIdx ? String(values[r][colIdx[idLow]] == null ? '' : values[r][colIdx[idLow]]).trim() : '';
            if (extractDriveId_(existing)) { stat.alreadyHaveId++; continue; }
            if (existing) stat.invalidExistingIds++;
            if (extractDriveId_(ref)) { stat.inlineId++; continue; }
            var fileMatch = findAttachmentFileMatch_(t, ff, ref), foundId = fileMatch.status === 'found' ? fileMatch.id : '';
            if (!foundId) {
              var reason = fileMatch.status === 'duplicate'
                ? 'multiple files with the exact filename match across allowed attachment folders'
                : fileMatch.status === 'unavailable'
                  ? 'one or more allowed attachment folders could not be checked by the app account'
                  : fileMatch.status === 'untrusted_folder'
                    ? 'stored reference folder does not match a trusted attachment folder'
                    : 'exact filename not found in the allowed attachment folders';
              stat.missing++; stat.unresolved.push({ row: r + 1, field: ff, reference: ref, reason: reason }); continue;
            }
            stat.wouldUpdate++;
            if (idLow in colIdx) updates.push({ row: r + 1, col: colIdx[idLow] + 1, id: foundId, expected: existing, sourceCol: colIdx[ffLow], sourceRef: ref, keyCol: colIdx[String(t.idField || '').toLowerCase()], keyValue: String(values[r][colIdx[String(t.idField || '').toLowerCase()]] == null ? '' : values[r][colIdx[String(t.idField || '').toLowerCase()]]).trim() });
          }
        }
        if (!dryRun && stat.missingIdColumns.length) {
          stat.missingIdColumns.forEach(function (idName) { sheet.getRange(1, headers.length + 1).setValue(idName); headers.push(idName); lower.push(idName.toLowerCase()); colIdx[idName.toLowerCase()] = headers.length - 1; try { noteMutation_(sheet); } catch (e) {} });
          updates = [];
          for (var rr = startRow; rr < endRow; rr++) for (var f2 = 0; f2 < t.fileFields.length; f2++) {
            var field2 = t.fileFields[f2], source2 = String(values[rr][colIdx[field2.toLowerCase()]] == null ? '' : values[rr][colIdx[field2.toLowerCase()]]).trim(), id2 = attachmentFileIdField_(field2).toLowerCase();
            if (!source2 || (onlyReference && source2 !== onlyReference) || extractDriveId_(source2) || extractDriveId_(String(values[rr][colIdx[id2]] || ''))) continue;
            var found2 = '', match2 = findAttachmentFileMatch_(t, field2, source2);
            if (match2.status === 'found') found2 = match2.id;
            if (found2) updates.push({ row: rr + 1, col: colIdx[id2] + 1, id: found2, expected: '', sourceCol: colIdx[field2.toLowerCase()], sourceRef: source2, keyCol: colIdx[String(t.idField || '').toLowerCase()], keyValue: String(values[rr][colIdx[String(t.idField || '').toLowerCase()]] == null ? '' : values[rr][colIdx[String(t.idField || '').toLowerCase()]]).trim() });
          }
        }
        if (!dryRun) updates.forEach(function (u) { try { var rowNow = sheet.getRange(u.row, 1, 1, headers.length).getValues()[0]; var current = String(rowNow[u.col - 1] == null ? '' : rowNow[u.col - 1]).trim(); var sourceNow = String(rowNow[u.sourceCol] == null ? '' : rowNow[u.sourceCol]).trim(); var keyNow = u.keyCol != null ? String(rowNow[u.keyCol] == null ? '' : rowNow[u.keyCol]).trim() : ''; if ((current && current !== u.expected) || sourceNow !== u.sourceRef || (u.keyValue != null && keyNow !== u.keyValue)) { stat.conflicts++; return; } sheet.getRange(u.row, u.col).setValue(u.id); stat.updated++; } catch (e) { stat.errors.push('row ' + u.row + ': ' + String(e && e.message || e)); } });
        if (!dryRun && stat.updated) { try { noteMutation_(sheet); } catch (e) {} }
        stat.nextOffset = endRow < values.length ? endRow - 1 : null;
      } catch (e) { stat.errors.push(String(e && e.message || e)); }
      summary.pages[key] = stat;
    });
  });
  return { status: 'success', summary: summary };
}
/**
 * Customs-office attachment path correction (sheet `مكتب الجمارك` only).
 * Scope: columns `تكليف المطالبة` and `تخليص الشحنة` only. Replaces only the
 * complete leading folder prefix before the slash:
 *   `مكتب الجمارك_Images/` -> `customs_office_Files_/`
 *   `مكتب الجمارك_Files_/`  -> `customs_office_Files_/`
 * Filenames are preserved byte-for-byte (no trimming inside the name, no extra
 * space, never the literal `&#x20;`). Values already starting with
 * `customs_office_Files_/` are left unchanged. URLs, Drive IDs, formulas,
 * blanks, malformed paths and unknown folder prefixes are never rewritten.
 * Params: {dryRun:true|false, offset:0, limit:<=500, backupSheet:<optional>}.
 * Dry-run (default) performs zero sheet writes. Apply path first verifies the
 * physical files exist in `customs_office_Files_`, captures a recoverable
 * backup sheet, then applies a bounded idempotent batch under script lock.
 */


/** Preview page for image/pdf: inline view + download button. */
function attachmentPreviewHtml_(fileName, blob) {
  const b64 = Utilities.base64Encode(blob.getBytes());
  const contentType = blob.getContentType() || 'application/octet-stream';
  const safeName = fileName.replace(/["'<>\\/]/g, '_');
  const esc = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  const isImage = contentType.toLowerCase().indexOf('image/') === 0;
  const viewer = isImage
    ? '<img src="data:' + contentType + ';base64,' + b64 + '" alt="' + esc(fileName) + '" style="max-width:100%;max-height:82vh;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12)">'
    : '<iframe src="data:' + contentType + ';base64,' + b64 + '" style="width:100%;height:82vh;border:1px solid #e5e7eb;border-radius:8px" title="' + esc(fileName) + '"></iframe>';
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(fileName) + '</title></head>' +
    '<body style="margin:0;font-family:sans-serif;background:#f3f4f6;">' +
    '<div style="position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<span style="flex:1;font-weight:700;font-size:14px;word-break:break-all;">' + esc(fileName) + '</span>' +
      '<a id="dl" href="data:' + contentType + ';base64,' + b64 + '" download="' + safeName + '" style="padding:8px 16px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;">⬇ تحميل</a>' +
    '</div>' +
    '<div style="padding:16px;display:flex;justify-content:center;align-items:flex-start;min-height:60vh;">' + viewer + '</div>' +
    '</body></html>'
  )).setTitle(fileName);
}

/** Shared data-URI download page for Drive files. */
function dataUriDownloadHtml_(fileName, blob) {
  const b64 = Utilities.base64Encode(blob.getBytes());
  const contentType = blob.getContentType() || 'application/octet-stream';
  const safeName = fileName.replace(/["'<>\\/]/g, '_');
  return _frame(HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تحميل الملف</title></head>' +
    '<body style="font-family:sans-serif;text-align:center;padding:24px;">' +
    '<h3>جاري تحميل الملف...</h3>' +
    '<p style="color:#555;">إذا لم يبدأ التحميل تلقائياً، <a id="dl" href="#" style="color:#16a34a;font-weight:bold;">اضغط هنا للتحميل</a></p>' +
    '<script>' +
    'var a=document.createElement("a");' +
    'a.href="data:' + contentType + ';base64,' + b64 + '";' +
    'a.download="' + safeName + '";' +
    'document.body.appendChild(a);a.click();' +
    'document.getElementById("dl").href=a.href;' +
    '</script></body></html>'
  )).setTitle(fileName);
}

/* Batch 11 — Phase 6: prune expired sessions from the AUTH ERP_Sessions sheet. */
function cleanupOldSessions_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  var removed = 0;
  if (systemStorageTarget_().backend === 'firestore') {
    try {
      systemGetAllRecords_('ERP_Sessions').forEach(function (s) {
        var exp = s.expires_at ? new Date(s.expires_at) : null;
        if (exp && !isNaN(exp.getTime()) && Date.now() > exp.getTime() && s._meta) {
          if (systemRemoveRecord_('ERP_Sessions', s._meta.documentId, { expectedUpdateTime: s._meta.updateTime })) removed++;
        }
      });
      return { status: 'success', data: { removed: removed } };
    } catch (e) { return { status: 'error', message: e.message }; }
  }
  try {
    // Phase 5 (F-14). This used to call deleteRowsByCriteria_ once PER expired
    // session, and each of those does a full getDataRange().getValues() plus a
    // structural deleteRow — so cleaning N sessions cost N full reads of
    // ERP_Sessions. Now: one read, then delete the matching rows bottom-up in a
    // single pass. deleteRow is kept (rather than a bulk body rewrite) because
    // it is safe against a concurrent login appending a row.
    var sheet = getSheet_('ERP_Sessions', CONFIG.AUTH_SPREADSHEET_ID);
    var headers = getHeaders_(sheet);
    var expIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'expires_at'; });
    if (expIdx === -1) return { status: 'error', message: 'ERP_Sessions is missing expires_at' };
    var now = Date.now();
    executeWithLock_(function () {
      var data = sheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        var raw = data[i][expIdx];
        if (raw === '' || raw === null || raw === undefined) continue;
        var exp = (raw instanceof Date) ? raw : new Date(raw);
        if (!isNaN(exp.getTime()) && now > exp.getTime()) {
          sheet.deleteRow(i + 1);
          noteMutation_(sheet);
          removed++;
        }
      }
    });
  } catch (e) {
    return { status: 'error', message: e.message };
  }
  return { status: 'success', data: { removed: removed } };
}

/* Batch 11 — Phase 6: install a daily time-driven trigger that prunes expired
 * sessions, plus the installable onEdit trigger on the AUTH spreadsheet.
 * Safe to call repeatedly (removes any prior instance of each first). */
function installTriggers_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'cleanupOldSessions_' || h === 'dailyCsvBackup' || h === 'onAuthSheetEdit') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  ScriptApp.newTrigger('cleanupOldSessions_').timeBased().everyDays(1).atHour(3).create();
  try {
    // 01:00 local, deliberately outside working hours: dailyCsvBackup reads every
    // sheet of every company spreadsheet in full and is visible to users if it
    // runs mid-day. (Was 07:00, which is inside the working day in Cairo.)
    ScriptApp.newTrigger('dailyCsvBackup').timeBased().everyDays(1).atHour(1).create();
  } catch (e) {}
  try {
    // The INSTALLABLE onEdit on the AUTH spreadsheet. The simple onEdit(e) in
    // shared Code.js section never fires — this is a standalone script and simple
    // triggers only run in container-bound projects — so without this trigger a
    // change typed directly into ERP_Users / ERP_Pages_Matrix / ERP_system_work
    // is caught only by the AUTH_STALENESS_CEILING_SECONDS bucket.
    // Its own try/catch: this trigger needs a spreadsheet scope the others do
    // not, and a scope failure here must not take down the installs above.
    if (systemStorageTarget_().backend === 'sheets') ScriptApp.newTrigger('onAuthSheetEdit')
      .forSpreadsheet(CONFIG.AUTH_SPREADSHEET_ID).onEdit().create();
  } catch (e) {
    try { console.error('installTriggers_: onAuthSheetEdit not created — ' + e.message); } catch (e2) {}
  }
  /* [RT-10 / RT-11] The two one-minute drains, and the weekly rollup.
   *
   * Until these exist the telemetry buffer and the audit queue both FILL AND
   * NEVER EMPTY. The telemetry buffer expires on its own, so the cost there is
   * a lost measurement. The audit queue is a SHEET and does not expire, so
   * without its drain it grows silently — which is why this is on the owner
   * checklist in plain words rather than as an implementation detail.
   *
   * They share the same shape as the daily triggers above: removed first so a
   * second install cannot double them up, then created. */
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'drainPerfBuffer_' || h === 'drainHistoryQueue_' ||
        h === 'rollupPerfWeekly_' || h === 'prunePerfLog_') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  try { ScriptApp.newTrigger('drainPerfBuffer_').timeBased().everyMinutes(1).create(); } catch (e) {
    try { console.error('installTriggers_: drainPerfBuffer_ not created — ' + e.message); } catch (e2) {}
  }
  try { ScriptApp.newTrigger('drainHistoryQueue_').timeBased().everyMinutes(1).create(); } catch (e) {
    try { console.error('installTriggers_: drainHistoryQueue_ not created — ' + e.message); } catch (e2) {}
  }
  /* Weekly, and the pruning with it: both read the raw log, and running them
   * together keeps that read to one a week. */
  try { ScriptApp.newTrigger('rollupPerfWeekly_').timeBased().everyDays(1).atHour(2).create(); } catch (e) {}
  try { ScriptApp.newTrigger('prunePerfLog_').timeBased().everyDays(1).atHour(2).create(); } catch (e) {}

  return { status: 'success', message: 'تم تثبيت المؤقتات اليومية والدقيقية' };
}

/* Migration batch functions (batch0_preflight, batch1_createSystemSheets, …)
 * live in 06_Migration.js and can be invoked from the Apps Script editor or
 * via clasp. The temporary unauthenticated run_migration web route was removed
 * after migrations completed. */


function _frame(html) {
  return html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Safe top-frame navigation script. Tries window.top.location (so the address
 *  bar reflects ?action=...); falls back to the iframe if the sandbox blocks it. */
function _topNavScript(url) {
  return '<script>try{window.top.location.href=' + JSON.stringify(url) + '}catch(e){window.location.href=' + JSON.stringify(url) + '}</' + 'script>';
}

/* v@496 sync marker — forces clasp to re-upload Code.js after a transient
 * server-side corruption reported a stale SyntaxError. */


function companyArtifactEntries_(kind, requestedCompany) {
  ensureCompaniesRegistered_();
  const requested = String(requestedCompany || '').trim();
  const entries = [];
  Object.keys(COMPANY_REGISTRY || {}).forEach(function (uid) {
    const cfg = COMPANY_REGISTRY[uid] || {};
    const handlerSource = cfg.artifactHandlers;
    const handlers = typeof handlerSource === 'function'
      ? (handlerSource() || {})
      : (handlerSource || {});
    if (typeof handlers[kind] !== 'function') return;
    if (requested && uid !== requested) return;
    entries.push({ uid: uid, handler: handlers[kind] });
  });
  if (entries.length !== 1) throw new Error(entries.length ? 'Ambiguous company artifact' : 'Unsupported company artifact');
  return entries[0];
}
function dispatchCompanyArtifact_(kind, params) {
  const p = params || {};
  const target = p.company || p.target_system || '';
  return companyArtifactEntries_(kind, target).handler(p, p.sessionToken || '', null);
}
function companyArtifactRoute_(payload, sessionToken, authUser) {
  const p = payload || {};
  return companyArtifactEntries_('customsOfficePathRepair', p.target_system || p.company || '').handler(p, sessionToken, authUser);
}


/* ===================== 8. TELEMETRY / LOGGING =========================== */
/**
 * shared Code.js section
 * RESPONSIBILITY: request telemetry buffers, drains and read-only dashboard.
 * The global names are preserved because Code.js routes and triggers call them.
 * The module intentionally depends only on existing Apps Script/data-layer
 * globals; no business schema or request path contract changes here.
 */
var PERF_LOG_SHEET_ = 'ERP_Perf_Log';
var PERF_WEEKLY_SHEET_ = 'ERP_Perf_Weekly';

/* The original nine columns, then the Phase B additive columns appended at the
 * END (never inserted in the middle). ensurePerfSheet_ migrates an existing
 * sheet by adding only the missing headers, so old rows and indexes 0..8 are
 * untouched and readers that ignore the new columns still work. */
var PERF_LOG_HEADERS_ = [
  'ts', 'action', 'company', 'page', 'elapsed_ms', 'sheet_reads', 'status', 'user_hash', 'client_ms',
  'diagnostic', 'sample_p', 'outcome', 'auth_ms', 'handler_ms', 'resp_size',
  'mysql_query', 'mysql_cache', 'mysql_connection_ms', 'mysql_sql_ms', 'mysql_result_read_ms', 'mysql_rows'
];
var PERF_WEEKLY_HEADERS_ = [
  'week', 'action', 'count', 'p50_ms', 'p90_ms', 'p99_ms', 'error_rate', 'mean_sheet_reads'
];

/** Everything tunable, in one place, so none of it is buried in a function. */
var PERF_TELEMETRY_ = {
  ENABLED: true,
  /* Phase B headline policy: ONE uniform draw per request, taken at request
   * start. 0.10 = 10%. Script Property PERF_RUM_RATE overrides it (clamped
   * 0..1) and the probability is stored on every sampled row. */
  SAMPLE_RATE: 0.10,
  /* Legacy name: the dashboard's `fast_read_sample` field still reports it and
   * it is no longer used for selection. Headline selection is the uniform draw
   * above; slow/error rows that were NOT drawn go to the diagnostic stream. */
  READ_SAMPLE: 0.10,
  /* Diagnostic threshold. A request that was not drawn is recorded as
   * diagnostic ONLY while PERF_LOG_READS is on and it is at/over this or
   * failed. Diagnostics are excluded from headline distributions at read time. */
  SLOW_MS: 1000,
  /* Raw rows kept this long; the weekly rollup is kept indefinitely because it
   * is tiny and it is the thing anybody actually reads. */
  RETAIN_DAYS: 90,
  /* Buffer caps. Row count is enforced per shard (4 shards x 125 = 500/min) AND
   * in bytes, because one CacheService value is capped at 100 KB. */
  MAX_PER_MINUTE: 500,
  SHARDS: 4,
  MAX_PER_SHARD: 125,
  MAX_BUFFER_BYTES: 90000,
  BUFFER_TTL_SECONDS: 600,
  /* Short bounded lock around each shard read-modify-write; contention drops
   * the record instead of blocking the business request. */
  LOCK_MS: 25,
  /* Drain takes exclusive ownership with a bounded wait; a skipped run retries
   * on the next minute trigger. */
  DRAIN_LOCK_MS: 1000,
  DRAIN_LOOKBACK_MINUTES: 10,
  /* Client batch ingestion limits (count, serialized bytes, batches/session/min). */
  CLIENT_MAX_MARKS: 20,
  CLIENT_MAX_BATCH_BYTES: 8192,
  CLIENT_MAX_PER_MINUTE: 6
};

/* Legacy single-minute key: drained for one deploy window, never written. */
function perfBufferKey_(minuteStamp) {
  return 'perfbuf_' + minuteStamp;
}

/* Deterministic shard key so the drain can enumerate every writer's buffer. */
function perfShardKey_(minuteStamp, shard) {
  return 'perfbuf_' + minuteStamp + '_' + shard;
}

/** The minute a timestamp falls in, as a stable string. */
function perfMinute_(d) {
  return String(Math.floor((d || new Date()).getTime() / 60000));
}

/**
 * A stable, salted, non-reversible stand-in for an email.
 *
 * The salt is a Script Property so the mapping cannot be recomputed by anyone
 * holding only the sheet. If it is unset, the hash is still stable within a
 * deployment and still not an email — the property makes it harder to attack,
 * it is not what makes it non-identifying.
 */
function perfUserHash_(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  var salt = '';
  try { salt = PropertiesService.getScriptProperties().getProperty('PERF_HASH_SALT') || ''; } catch (err) {}
  var s = salt + '|' + e;
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'u' + (h >>> 0).toString(36);
}

/** Finite non-negative number, or null. Missing data stays missing — never 0. */
function perfFiniteNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var n = Number(value);
  return (isFinite(n) && n >= 0) ? n : null;
}

/** The same rule, rendered as '' for storage instead of null. */
function perfNumberOrBlank_(value) {
  var n = perfFiniteNumber_(value);
  return n === null ? '' : n;
}

/** Is a persisted cell a diagnostic marker? Accepts boolean and 0/1. */
function perfIsDiagnostic_(value) {
  if (value === true) return true;
  if (value === false || value === '' || value === null || value === undefined) return false;
  return Number(value) === 1;
}

/**
 * Legacy selector, kept only for compatibility. Phase B decides headline
 * inclusion with one uniform draw at request start (perfBeginRequest_); a
 * request that was not drawn is a diagnostic candidate when it is slow or it
 * failed, and only while the verbose diagnostics flag is on.
 */
function perfShouldSample_(isWrite, elapsedMs) {
  if (!PERF_TELEMETRY_.ENABLED || !perfDiagnosticsEnabled_()) return false;
  if (isWrite) return true;
  return Number(elapsedMs) >= PERF_TELEMETRY_.SLOW_MS;
}

/* ── Collection health: best-effort counters in a cache key, no new schema ── */
var PERF_HEALTH_KEY_ = 'perfhealth_v1';
var PERF_HEALTH_TTL_ = 21600;

function perfHealthState_() {
  try {
    var raw = CacheService.getScriptCache().get(PERF_HEALTH_KEY_);
    var state = raw ? JSON.parse(raw) : null;
    if (state && typeof state === 'object') return state;
  } catch (e) {}
  return {};
}

function perfHealthAdd_(field, n) {
  try {
    var s = perfHealthState_();
    s[field] = (Number(s[field]) || 0) + (Number(n) || 1);
    s.updated_at = new Date().toISOString();
    CacheService.getScriptCache().put(PERF_HEALTH_KEY_, JSON.stringify(s), PERF_HEALTH_TTL_);
  } catch (e) {}
}

function perfHealthMarkDrain_(stats) {
  try {
    var s = perfHealthState_();
    s.last_drain_at = new Date().toISOString();
    s.last_drain_rows = stats.rows;
    s.last_drain_failed = stats.failed;
    s.buffer_age_ms = stats.age;
    s.drained_rows_total = (Number(s.drained_rows_total) || 0) + stats.rows;
    s.failed_rows_total = (Number(s.failed_rows_total) || 0) + stats.failed;
    if (stats.error) s.last_drain_error = String(stats.error).slice(0, 200);
    else delete s.last_drain_error;
    s.updated_at = s.last_drain_at;
    CacheService.getScriptCache().put(PERF_HEALTH_KEY_, JSON.stringify(s), PERF_HEALTH_TTL_);
  } catch (e) {}
}

/** Aggregation-side view of collection health. Cache-only read of the
 *  perfhealth_v1 counters, TTL unchanged. Coverage is 'unknown' because total
 *  capture loss cannot be established from a sampling transport. `present`
 *  distinguishes "nothing recorded yet" from real zeroes. */
function perfCollectionHealth_() {
  var s = perfHealthState_();
  function n(k) { var v = Number(s[k]); return isFinite(v) ? v : 0; }
  return {
    present: !!s.updated_at,
    headline_enabled: !!(PERF_TELEMETRY_.ENABLED && perfRumEnabled_()),
    diagnostics_enabled: !!(PERF_TELEMETRY_.ENABLED && perfDiagnosticsEnabled_()),
    sample_rate: perfRumRate_(),
    sample_policy: 'uniform_request_start',
    diagnostics_threshold_ms: PERF_TELEMETRY_.SLOW_MS,
    shards: PERF_TELEMETRY_.SHARDS,
    buffer_ttl_seconds: PERF_TELEMETRY_.BUFFER_TTL_SECONDS,
    drained_rows: n('drained_rows_total'),
    failed_rows: n('failed_rows_total'),
    dropped_rows: n('dropped_rows'),
    dropped_lock: n('dropped_lock'),
    dropped_bytes: n('dropped_bytes'),
    invalid_records: n('invalid_records'),
    rejected_client: n('rejected_client'),
    rate_limited_client: n('rate_limited_client'),
    invalid_marks: n('invalid_marks'),
    drain_skipped: n('drain_skipped'),
    last_drain_at: s.last_drain_at || '',
    last_drain_rows: n('last_drain_rows'),
    last_drain_failed: n('last_drain_failed'),
    buffer_age_ms: n('buffer_age_ms'),
    coverage: 'unknown'
  };
}

/**
 * Write one already-validated row into a deterministic minute shard under a
 * short bounded script lock. If the lock is unavailable, the record is DROPPED
 * and counted; telemetry never blocks the business request.
 */
function perfWriteBuffer_(row) {
  var shards = Number(PERF_TELEMETRY_.SHARDS) || 4;
  var key = perfShardKey_(perfMinute_(), Math.floor(Math.random() * shards) % shards);
  var lock = null, locked = false;
  try {
    lock = LockService.getScriptLock();
    locked = lock.tryLock(PERF_TELEMETRY_.LOCK_MS);
  } catch (eLock) { locked = false; }
  if (!locked) { perfHealthAdd_('dropped_lock', 1); return; }
  try {
    var cache = CacheService.getScriptCache();
    var buf = [];
    try {
      var raw = cache.get(key);
      if (raw) buf = JSON.parse(raw) || [];
    } catch (eRead) { buf = []; }
    if (!Array.isArray(buf)) buf = [];
    if (buf.length >= PERF_TELEMETRY_.MAX_PER_SHARD) { perfHealthAdd_('dropped_rows', 1); return; }
    buf.push(row);
    var encoded;
    try { encoded = JSON.stringify(buf); } catch (eEnc) { perfHealthAdd_('invalid_records', 1); return; }
    if (encoded.length > PERF_TELEMETRY_.MAX_BUFFER_BYTES) { perfHealthAdd_('dropped_bytes', 1); return; }
    cache.put(key, encoded, PERF_TELEMETRY_.BUFFER_TTL_SECONDS);
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

/**
 * Record one request. The caller (perfFinishRequest_) has already decided the
 * sample; this only validates and buffers. Malformed durations are rejected and
 * counted, and missing numeric fields stay blank rather than becoming 0.
 */
function perfRecord_(entry) {
  try {
    if (!entry || !PERF_TELEMETRY_.ENABLED) return;
    var elapsed = perfFiniteNumber_(entry.elapsed_ms);
    if (elapsed === null) { perfHealthAdd_('invalid_records', 1); return; }
    var row = [
      new Date().toISOString(),
      String(entry.action || '').slice(0, 80),
      String(entry.company || '').slice(0, 40),
      String(entry.page || '').slice(0, 60),
      elapsed,
      perfNumberOrBlank_(entry.sheet_reads),
      String(entry.status || '').slice(0, 20),
      perfUserHash_(entry.user_email),
      perfNumberOrBlank_(entry.client_ms),
      entry.diagnostic ? 1 : 0,
      perfNumberOrBlank_(entry.sample_p),
      String(entry.outcome || '').slice(0, 20),
      perfNumberOrBlank_(entry.auth_ms),
      perfNumberOrBlank_(entry.handler_ms),
      String(entry.resp_size || '').slice(0, 12),
      String(entry.mysql_query || '').slice(0, 100),
      String(entry.mysql_cache || '').slice(0, 8),
      perfNumberOrBlank_(entry.mysql_connection_ms),
      perfNumberOrBlank_(entry.mysql_sql_ms),
      perfNumberOrBlank_(entry.mysql_result_read_ms),
      perfNumberOrBlank_(entry.mysql_rows)
    ];
    perfWriteBuffer_(row);
  } catch (e) {
    /* Telemetry must never be the reason a request fails. */
  }
}

/** The sheet, created on first use. Additive, outside every business table. */
function ensurePerfSheet_(name, headers) {
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    noteMutation_(sh);
    return sh;
  }
  /* Existing sheet: migrate by APPENDING only missing headers at the end. The
   * column order of what is already there is never touched. */
  try {
    if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
      noteMutation_(sh);
      return sh;
    }
    var width = sh.getLastColumn();
    var existing = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var missing = headers.filter(function (h) { return existing.indexOf(String(h).trim().toLowerCase()) === -1; });
    if (missing.length) {
      sh.getRange(1, width + 1, 1, missing.length).setValues([missing]);
      noteMutation_(sh);
    }
  } catch (eMigrate) { /* A header migration failure must not fail the drain. */ }
  return sh;
}

/**
 * Drain the finished minutes into ERP_Perf_Log. Installed as a one-minute
 * time-driven trigger.
 *
 * Phase B transport: deterministic minute shards, each read-modify-written by
 * writers under a short bounded lock. The drain takes exclusive ownership with
 * a bounded wait, persists FIRST and removes each shard ONLY after the write
 * succeeded; a failed write keeps the rows for the next run. The CURRENT minute
 * is deliberately left alone — draining it would race with requests still
 * writing into it.
 */
function drainPerfBuffer_() {
  var stats = { rows: 0, failed: 0, age: 0, error: '' };
  var lock = null, locked = false;
  try {
    lock = LockService.getScriptLock();
    locked = lock.tryLock(PERF_TELEMETRY_.DRAIN_LOCK_MS);
  } catch (eLock) { locked = false; }
  if (!locked) {
    perfHealthAdd_('drain_skipped', 1);
    return { status: 'skipped', reason: 'locked' };
  }
  try {
    var now = Number(perfMinute_());
    var cache = CacheService.getScriptCache();
    var rows = [], removeKeys = [];
    /* Ten minutes back, so a trigger that missed a few runs catches up rather
     * than silently dropping what it missed. */
    for (var back = 1; back <= PERF_TELEMETRY_.DRAIN_LOOKBACK_MINUTES; back++) {
      var minute = String(now - back);
      var age = new Date().getTime() - (Number(minute) * 60000);
      if (age > stats.age) stats.age = age;
      for (var shard = 0; shard < PERF_TELEMETRY_.SHARDS; shard++) {
        var key = perfShardKey_(minute, shard);
        var parsed = perfReadBufferRows_(cache, key);
        if (!parsed.length) continue;
        stats.rows += parsed.length;
        rows = rows.concat(parsed);
        removeKeys.push(key);
      }
      /* Legacy unsharded key, so a deploy in the middle of a window does not
       * strand the last buffered minute. */
      var legacyKey = perfBufferKey_(minute);
      var legacy = perfReadBufferRows_(cache, legacyKey);
      if (legacy.length) {
        stats.rows += legacy.length;
        rows = rows.concat(legacy);
        removeKeys.push(legacyKey);
      }
    }
    if (!rows.length) { perfHealthMarkDrain_(stats); return { status: 'success', rows: 0 }; }

    /* WRITE FIRST. A row read here is not removed until the whole batch has
     * persisted; a failure leaves it buffered for the next drain. */
    if (systemStorageTarget_().backend === 'firestore') {
      rows.forEach(function (r, i) {
        var record = perfRowToRecord_(r);
        systemCreateRecord_('ERP_Perf_Log', record, { operationId: 'perf:' + String(record.ts) + ':' + String(record.action) + ':' + i });
      });
    } else {
      var sh = ensurePerfSheet_(PERF_LOG_SHEET_, PERF_LOG_HEADERS_);
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, PERF_LOG_HEADERS_.length).setValues(rows);
      noteMutation_(sh);
    }

    /* Persisted. ONLY NOW is the buffer removed. */
    removeKeys.forEach(function (k) { try { cache.remove(k); } catch (eR) {} });
    perfHealthMarkDrain_(stats);
    return { status: 'success', rows: rows.length, failed: 0, oldest_age_ms: stats.age };
  } catch (e) {
    stats.failed = stats.rows;
    stats.error = String(e.message || e);
    perfHealthMarkDrain_(stats);
    try { console.error('drainPerfBuffer_: ' + e.message); } catch (eL) {}
    return { status: 'error', message: e.message, failed: stats.failed };
  } finally {
    try { lock.releaseLock(); } catch (eRel) {}
  }
}

/** Read and validate one buffer key. Malformed rows are counted and dropped. */
function perfReadBufferRows_(cache, key) {
  var raw = null;
  try { raw = cache.get(key); } catch (e) { return []; }
  if (!raw) return [];
  var buf = [];
  try { buf = JSON.parse(raw) || []; } catch (eParse) { perfHealthAdd_('invalid_records', 1); return []; }
  if (!Array.isArray(buf)) return [];
  var out = [];
  buf.forEach(function (r) {
    var normalized = perfNormalizeRow_(r);
    if (normalized) out.push(normalized);
    else perfHealthAdd_('invalid_records', 1);
  });
  return out;
}

/** Pad an old 9-value row (or a new 15-value row) to the current header width,
 *  rejecting non-finite or negative durations. */
function perfNormalizeRow_(r) {
  if (!Array.isArray(r) || r.length < 9) return null;
  var elapsed = perfFiniteNumber_(r[4]);
  if (elapsed === null) return null;
  var out = [];
  for (var i = 0; i < PERF_LOG_HEADERS_.length; i++) out.push(r[i] === undefined ? '' : r[i]);
  out[4] = elapsed;
  return out;
}

/** Buffer row -> ERP_Perf_Log record. Same names as the sheet columns. */
function perfRowToRecord_(row) {
  return {
    ts: row[0], action: row[1], company: row[2], page: row[3], elapsed_ms: row[4],
    sheet_reads: row[5], status: row[6], user_hash: row[7], client_ms: row[8],
    diagnostic: Number(row[9]) === 1, sample_p: row[10], outcome: row[11],
    auth_ms: row[12], handler_ms: row[13], resp_size: row[14],
    mysql_query: row[15], mysql_cache: row[16], mysql_connection_ms: row[17],
    mysql_sql_ms: row[18], mysql_result_read_ms: row[19], mysql_rows: row[20]
  };
}

/** p-th percentile of a sorted numeric array, nearest-rank. */
function perfPercentile_(sorted, p) {
  if (!sorted.length) return 0;
  var rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** ISO-ish week key: the Monday of the week, as YYYY-MM-DD. */
function perfWeekKey_(d) {
  var t = new Date(d.getTime());
  var day = (t.getDay() + 6) % 7;          /* Monday = 0 */
  t.setDate(t.getDate() - day);
  return Utilities.formatDate(t, 'UTC', 'yyyy-MM-dd');
}

/**
 * One row per action per week: p50, p90, p99, count, error rate, mean sheet
 * reads. This is the table anybody actually reads. The raw log is evidence;
 * the rollup is the review.
 */
function rollupPerfWeekly_() {
  if (systemStorageTarget_().backend === 'firestore') return rollupPerfWeeklyFirestore_();
  try {
    var sh = ensurePerfSheet_(PERF_LOG_SHEET_, PERF_LOG_HEADERS_);
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return { status: 'success', rows: 0 };

    var groups = {};
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      /* Phase B: diagnostics never enter the headline rollup. Old rows have no
       * diagnostic cell (r[9] undefined) and stay included. */
      if (perfIsDiagnostic_(r[9])) continue;
      var when = new Date(r[0]);
      if (isNaN(when.getTime())) continue;
      var key = perfWeekKey_(when) + '|' + String(r[1] || '');
      if (!groups[key]) groups[key] = { ms: [], reads: 0, errors: 0, n: 0 };
      var g = groups[key];
      g.ms.push(Number(r[4]) || 0);
      g.reads += Number(r[5]) || 0;
      if (String(r[6] || '').toUpperCase() === 'FAILED') g.errors++;
      g.n++;
    }

    var out = [];
    Object.keys(groups).sort().forEach(function (key) {
      var g = groups[key];
      var parts = key.split('|');
      g.ms.sort(function (a, b) { return a - b; });
      out.push([
        parts[0], parts[1], g.n,
        perfPercentile_(g.ms, 50), perfPercentile_(g.ms, 90), perfPercentile_(g.ms, 99),
        g.n ? Number((g.errors / g.n).toFixed(4)) : 0,
        g.n ? Number((g.reads / g.n).toFixed(2)) : 0
      ]);
    });
    if (!out.length) return { status: 'success', rows: 0 };

    var wk = ensurePerfSheet_(PERF_WEEKLY_SHEET_, PERF_WEEKLY_HEADERS_);
    /* Rewritten whole rather than appended: a week's numbers change as more of
     * it happens, and two rows for the same week and action would be a bug in
     * the only table anybody reads. */
    if (wk.getLastRow() > 1) wk.getRange(2, 1, wk.getLastRow() - 1, PERF_WEEKLY_HEADERS_.length).clearContent();
    wk.getRange(2, 1, out.length, PERF_WEEKLY_HEADERS_.length).setValues(out);
    noteMutation_(wk);
    return { status: 'success', rows: out.length };
  } catch (e) {
    try { console.error('rollupPerfWeekly_: ' + e.message); } catch (eL) {}
    return { status: 'error', message: e.message };
  }
}

function rollupPerfWeeklyFirestore_() {
  try {
    var values = systemGetAllRecords_('ERP_Perf_Log'), groups = {};
    values.forEach(function (r) { if (perfIsDiagnostic_(r.diagnostic)) return; var when = new Date(r.ts); if (isNaN(when.getTime())) return; var key = perfWeekKey_(when) + '|' + String(r.action || ''); if (!groups[key]) groups[key] = { ms: [], reads: 0, errors: 0, n: 0 }; var g = groups[key]; g.ms.push(Number(r.elapsed_ms) || 0); g.reads += Number(r.sheet_reads) || 0; if (String(r.status || '').toUpperCase() === 'FAILED') g.errors++; g.n++; });
    Object.keys(groups).forEach(function (key) { var g = groups[key], parts = key.split('|'); g.ms.sort(function (a, b) { return a - b; }); var data = { week: parts[0], action: parts[1], count: g.n, p50_ms: perfPercentile_(g.ms, 50), p90_ms: perfPercentile_(g.ms, 90), p99_ms: perfPercentile_(g.ms, 99), error_rate: g.n ? Number((g.errors / g.n).toFixed(4)) : 0, mean_sheet_reads: g.n ? Number((g.reads / g.n).toFixed(2)) : 0 }; systemCreateRecord_('ERP_Perf_Weekly', data, { operationId: 'perf-week:' + key }); });
    return { status: 'success', rows: Object.keys(groups).length, backend: 'firestore' };
  } catch (e) { return { status: 'error', message: e.message }; }
}

/**
 * Retention. Raw rows older than RETAIN_DAYS go; the weekly rollup stays,
 * because it is tiny and it is the point. Deliberately deletes from the TOP,
 * where the oldest rows are, in one contiguous block.
 */
function prunePerfLog_() {
  if (systemStorageTarget_().backend === 'firestore') {
    try { var cutoffFs = Date.now() - PERF_TELEMETRY_.RETAIN_DAYS * 86400000, removedFs = 0; systemGetAllRecords_('ERP_Perf_Log').forEach(function (r) { var d = new Date(r.ts); if (r._meta && !isNaN(d.getTime()) && d.getTime() < cutoffFs && systemRemoveRecord_('ERP_Perf_Log', r._meta.documentId, { expectedUpdateTime: r._meta.updateTime })) removedFs++; }); return { status: 'success', removed: removedFs, backend: 'firestore' }; } catch (e) { return { status: 'error', message: e.message }; }
  }
  try {
    var sh = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName(PERF_LOG_SHEET_);
    if (!sh || sh.getLastRow() < 2) return { status: 'success', removed: 0 };
    var cutoff = new Date().getTime() - PERF_TELEMETRY_.RETAIN_DAYS * 86400000;
    var stamps = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    var keepFrom = 0;
    while (keepFrom < stamps.length) {
      var t = new Date(stamps[keepFrom][0]).getTime();
      if (isNaN(t) || t >= cutoff) break;
      keepFrom++;
    }
    if (!keepFrom) return { status: 'success', removed: 0 };
    sh.deleteRows(2, keepFrom);
    noteMutation_(sh);
    return { status: 'success', removed: keepFrom };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/** The ten slowest actions this week and last, for the dashboard page. */
function getPerfDashboard_(data, sessionToken, user) {
  if (!(user && user.isSuperAdmin)) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  var out = { status: 'success', weeks: [], rows: [] };
  if (systemStorageTarget_().backend === 'firestore') {
    try {
      var weekly = systemGetAllRecords_('ERP_Perf_Weekly'), weeksFs = {}; weekly.forEach(function (r) { weeksFs[String(r.week)] = true; }); var sortedFs = Object.keys(weeksFs).sort().reverse(), thisWeekFs = sortedFs[0] || '', lastWeekFs = sortedFs[1] || '', prevFs = {}; weekly.forEach(function (r) { if (String(r.week) === lastWeekFs) prevFs[String(r.action)] = Number(r.p90_ms) || 0; });
      out.weeks = [thisWeekFs, lastWeekFs]; out.rows = weekly.filter(function (r) { return String(r.week) === thisWeekFs; }).map(function (r) { var p = Number(r.p90_ms) || 0; return { action: String(r.action), count: Number(r.count) || 0, p50: Number(r.p50_ms) || 0, p90: p, p99: Number(r.p99_ms) || 0, error_rate: Number(r.error_rate) || 0, mean_sheet_reads: Number(r.mean_sheet_reads) || 0, prev_p90: prevFs[r.action] === undefined ? null : prevFs[r.action], delta: prevFs[r.action] === undefined ? null : p - prevFs[r.action] }; }).sort(function (a, b) { return b.p90 - a.p90; }).slice(0, 10);
      return out;
    } catch (e) { return out; }
  }
  try {
    var wk = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName(PERF_WEEKLY_SHEET_);
    if (!wk || wk.getLastRow() < 2) return out;
    var values = wk.getRange(2, 1, wk.getLastRow() - 1, PERF_WEEKLY_HEADERS_.length).getValues();
    var weeks = {};
    values.forEach(function (r) { weeks[String(r[0])] = true; });
    var sorted = Object.keys(weeks).sort().reverse();
    var thisWeek = sorted[0] || '', lastWeek = sorted[1] || '';
    out.weeks = [thisWeek, lastWeek];

    var prev = {};
    values.forEach(function (r) { if (String(r[0]) === lastWeek) prev[String(r[1])] = Number(r[4]) || 0; });

    out.rows = values
      .filter(function (r) { return String(r[0]) === thisWeek; })
      .map(function (r) {
        var action = String(r[1]);
        var p90 = Number(r[4]) || 0;
        return {
          action: action, count: Number(r[2]) || 0,
          p50: Number(r[3]) || 0, p90: p90, p99: Number(r[5]) || 0,
          error_rate: Number(r[6]) || 0, mean_sheet_reads: Number(r[7]) || 0,
          prev_p90: prev[action] === undefined ? null : prev[action],
          delta: prev[action] === undefined ? null : (p90 - prev[action])
        };
      })
      .sort(function (a, b) { return b.p90 - a.p90; })
      .slice(0, 10);
  } catch (e) { /* an empty dashboard is a valid answer */ }
  return out;
}

/**
 * System audit log helpers
 */
/* ── Phase E §9: bounded, resumable dashboard reads ───────────────────────
 * The dashboard used to read one hard 1000-row newest window per source, so a
 * busy period silently answered from a fraction of its rows. Reads are now
 * chunked newest-first inside a per-open budget, a script-cache cursor resumes
 * the older continuation on the next open, and every response states exactly
 * how far it got (covered_through / truncated / complete / partial). All
 * aggregation is recomputed from the sample each open; nothing is stored
 * incrementally, so re-reading an overlap cannot double count. Existing schema
 * only: ERP_Perf_Log and ERP_Client_Perf are read, never written or altered. */
var PERFDASH_CHUNK_ROWS = 2000;
var PERFDASH_MAX_ROWS_PER_OPEN = 6000;
var PERFDASH_MAX_LOOKBACK_DAYS = 30;
var PERFDASH_CURSOR_KEY_ = 'perfdash_cursor_v1';
/* Short bounded TTL: a cursor only helps repeated opens in one sitting and
 * must not pin a months-old continuation forever. */
var PERFDASH_CURSOR_TTL_SECONDS = 1800;
/* Display gates (heuristics, not SLOs). p95 is the ceiling this dashboard
 * shows, so a summary below 100 observations is labeled insufficient. The
 * 1,000-observation p99 gate applies to the weekly rollup review, which is
 * deliberately left untouched. */
var PERFDASH_MIN_OBS_P95 = 100;
var PERFDASH_MIN_OBS_P99 = 1000;

function perfDashboardFiniteMs_(value) {
  if (value === null || value === undefined || value === '') return null;
  var n = Number(value);
  return (isFinite(n) && n > 0) ? n : null;
}

/** Persisted continuation for one source+backend. Best effort: a lost cursor
 *  only means the next open restarts from the newest rows. */
function perfDashboardCursorGet_(scope) {
  try {
    var raw = CacheService.getScriptCache().get(PERFDASH_CURSOR_KEY_ + ':' + scope);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch (e) { return null; }
}

function perfDashboardCursorSet_(scope, state) {
  try {
    CacheService.getScriptCache().put(PERFDASH_CURSOR_KEY_ + ':' + scope, JSON.stringify(state), PERFDASH_CURSOR_TTL_SECONDS);
  } catch (e) {}
}

/** One coverage verdict for the whole response. `partial` is the single fact a
 *  reader needs; a partial sample is never presented as complete. The oldest
 *  `covered_through` wins because coverage only reaches as far back as the
 *  least-covered source. */
function perfDashboardCoverage_(serverInfo, clientInfo) {
  var infos = [serverInfo || {}, clientInfo || {}];
  var through = infos.map(function (info) { return info.covered_through || null; })
    .filter(function (value) { return !!value; }).sort();
  var complete = infos.every(function (info) { return info.complete === true; });
  return {
    scanned_rows: infos.reduce(function (sum, info) { return sum + (Number(info.scanned) || 0); }, 0),
    covered_through: through.length ? through[0] : null,
    truncated: infos.some(function (info) { return info.truncated === true; }),
    cursor_used: infos.some(function (info) { return info.cursor_used === true; }),
    complete: complete,
    partial: !complete
  };
}

/** Honest capability states derived from what the display allowlist actually
 *  contains. `partial` means the dashboard shows the allowlisted browser
 *  durations but cannot show dropped store/task metrics; `unavailable` means
 *  the allowlist contains none. No capability is claimed that no column can
 *  persist (see the reconciliation block at PERF_CLIENT_METRICS_). */
function perfDashboardCapabilities_() {
  var hasBrowser = Object.keys(PERF_CLIENT_DISPLAY_METRICS_).some(function (name) {
    return /^(nav_|page_ready$|page_load$|first_data_render$)/.test(name);
  });
  return {
    browser_metrics: hasBrowser ? 'partial' : 'unavailable',
    confirmed_saves: 'not_instrumented',
    task_completion: 'not_instrumented'
  };
}


/** Settings dashboard: bounded reads of existing telemetry, never schema creation.
 * Authentication is performed by apiRouter_; this boundary separately requires
 * super-admin authority. Raw URLs, user identities and payloads never leave it.
 * Legacy sampling is intentionally reported as diagnostics, not population SLOs.
 */
function getAdminPerformance_(data, sessionToken, user) {
  if (!(user && user.isSuperAdmin)) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  var input = data || {}, days = Number(input.days || 7);
  if ([1, 7, 30].indexOf(days) === -1) throw new Error('INVALID_PERFORMANCE_RANGE');
  var company = String(input.company || '').trim().slice(0, 80);
  var today = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
  var first = new Date(today + 'T12:00:00Z');
  first.setUTCDate(first.getUTCDate() - days + 1);
  var from = first.toISOString().slice(0, 10), backend = systemStorageTarget_().backend;
  // Short-lived aggregate caching prevents refresh clicks from rereading logs.
  // Authorization above always precedes cache access.
  var cacheKey = 'admin_perf_v1:' + backend + ':' + today + ':' + days + ':' + encodeURIComponent(company);
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      var cachedOut = JSON.parse(cached);
      /* Health counters are live, so they are refreshed even on a cache hit. */
      if (cachedOut && cachedOut.collection) cachedOut.collection.health = perfCollectionHealth_();
      return cachedOut;
    }
  } catch (cacheError) { /* A cache miss is safe. */ }
  /* Phase E §9: one bounded, resumable read per source. `from` is the Cairo
   * day string used for grouping; its UTC midnight is the scan's stop line (a
   * few hours of slack only means a slightly deeper read — grouping remains
   * the authority), and the 30-day floor bounds how far a continuation walks. */
  var maxRows = PERFDASH_MAX_ROWS_PER_OPEN;
  var fromMs = Date.parse(from + 'T00:00:00Z');
  var lookbackFloorMs = new Date().getTime() - PERFDASH_MAX_LOOKBACK_DAYS * 86400000;
  var server = perfDashboardRead_('ERP_Perf_Log', backend, maxRows, { fromMs: fromMs, lookbackFloorMs: lookbackFloorMs, cursorScope: backend + ':ERP_Perf_Log' });
  var client = perfDashboardRead_('ERP_Client_Perf', backend, maxRows, { fromMs: fromMs, lookbackFloorMs: lookbackFloorMs, cursorScope: backend + ':ERP_Client_Perf' });
  server.info.diagnostic_rows = 0;
  client.info.unmapped_rows = 0;
  var out = {
    status: 'success', generated_at: new Date().toISOString(), timezone: 'Africa/Cairo',
    from: from, to: today, days: days, company: company, backend: backend,
    collection: { server_enabled: !!PERF_TELEMETRY_.ENABLED, client_enabled: perfLogReadsEnabled_(),
      fast_read_sample: PERF_TELEMETRY_.READ_SAMPLE, slow_threshold_ms: PERF_TELEMETRY_.SLOW_MS,
      retention_days: PERF_TELEMETRY_.RETAIN_DAYS, coverage: 'unknown', biased_sample: false,
      health: perfCollectionHealth_() },
    coverage: perfDashboardCoverage_(server.info, client.info),
    capabilities: perfDashboardCapabilities_(),
    sources: { server: server.info, client: client.info }, companies: [], daily: [], actions: [], browser: []
  };
  var companies = Object.create(null), daily = Object.create(null), actions = Object.create(null);
  var total = perfDashboardGroup_();
  server.rows.forEach(function (row) {
    var when = perfDashboardDate_(row.ts), ms = perfDashboardNumber_(row.elapsed_ms);
    if (!when || ms === null) { server.info.invalid_rows++; return; }
    /* Phase B: diagnostic rows are counted but never mixed into headline
     * distributions. Old rows have no marker and stay included. */
    if (perfIsDiagnostic_(row.diagnostic)) { server.info.diagnostic_rows++; return; }
    if (!server.info.latest_at || when.toISOString() > server.info.latest_at) server.info.latest_at = when.toISOString();
    var day = Utilities.formatDate(when, 'Africa/Cairo', 'yyyy-MM-dd');
    if (day < from || day > today) return;
    var action = String(row.action || '').slice(0, 80);
    if (['get_admin_performance', 'get_perf_dashboard', 'log_client_perf'].indexOf(action) !== -1) return;
    var co = String(row.company || '').trim().slice(0, 80);
    if (co) companies[co] = true;
    if (company && co !== company) return;
    var page = String(row.page || '').slice(0, 80), key = JSON.stringify([co, page, action]);
    if (!daily[day]) daily[day] = perfDashboardGroup_();
    if (!actions[key]) { actions[key] = perfDashboardGroup_(); actions[key].company = co; actions[key].page = page; actions[key].action = action; }
    [total, daily[day], actions[key]].forEach(function (g) {
      g.ms.push(ms);
      var status = String(row.status || '').toUpperCase();
      if (status === 'FAILED' || status === 'ERROR') g.failures++;
      var reads = perfDashboardNumber_(row.sheet_reads);
      if (reads !== null) { g.reads += reads; g.readCount++; }
    });
  });
  out.companies = Object.keys(companies).sort();
  out.summary = perfDashboardSummary_(total);
  for (var i = 0; i < days; i++) {
    var date = new Date(first.getTime()); date.setUTCDate(date.getUTCDate() + i);
    var dayKey = date.toISOString().slice(0, 10);
    out.daily.push(Object.assign({ day: dayKey, partial: dayKey === today }, perfDashboardSummary_(daily[dayKey] || perfDashboardGroup_())));
  }
  out.actions = Object.keys(actions).map(function (key) {
    var g = actions[key];
    return Object.assign({ company: g.company, page: g.page, action: g.action }, perfDashboardSummary_(g));
  }).sort(function (a, b) { return b.p95_ms - a.p95_ms; }).slice(0, 20);
  // The legacy browser schema has no company dimension. Never infer ownership
  // from the URL/title or show global measurements under a company-only filter.
  var metrics = Object.create(null);
  client.rows.forEach(function (row) {
    var when = perfDashboardDate_(row.ts);
    if (when && (!client.info.latest_at || when.toISOString() > client.info.latest_at)) client.info.latest_at = when.toISOString();
    var ms = perfDashboardNumber_(row.ms), metric = String(row.metric || '');
    if (!when || ms === null) { client.info.invalid_rows++; return; }
    var day = Utilities.formatDate(when, 'Africa/Cairo', 'yyyy-MM-dd');
    if (company || day < from || day > today) return;
    /* Explicit display-side drop: stored names whose semantics do not match the
     * `ms` column (byte counts) or that the display allowlist does not map.
     * Counted, never repurposed — see the reconciliation block at
     * PERF_CLIENT_METRICS_. */
    if (!PERF_CLIENT_DISPLAY_METRICS_[metric]) { client.info.unmapped_rows++; return; }
    // Legacy page can be a user-provided title; only return safe route-shaped IDs.
    var page = String(row.page || '');
    if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(page)) page = '';
    var key = JSON.stringify([page, metric]);
    if (!metrics[key]) { metrics[key] = perfDashboardGroup_(); metrics[key].page = page; metrics[key].metric = metric; }
    metrics[key].ms.push(ms);
  });
  out.browser = Object.keys(metrics).map(function (key) {
    var g = metrics[key]; return Object.assign({ page: g.page, metric: g.metric }, perfDashboardSummary_(g));
  }).sort(function (a, b) { return b.p95_ms - a.p95_ms; }).slice(0, 20);
  out.browser_company_supported = false;
  if (server.info.state === 'ready' && client.info.state === 'ready') {
    try {
      var serialized = JSON.stringify(out);
      if (serialized.length < 20000) CacheService.getScriptCache().put(cacheKey, serialized, 60);
    } catch (cacheError) { /* Cache failure does not hide measurements. */ }
  }
  return out;
}

function perfDashboardNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  var n = Number(value); return isFinite(n) && n >= 0 ? n : null;
}

function perfDashboardDate_(value) {
  if (value === null || value === undefined || value === '') return null;
  var d = new Date(value); return isNaN(d.getTime()) ? null : d;
}

function perfDashboardGroup_() { return { ms: [], failures: 0, reads: 0, readCount: 0 }; }

/** Nearest-rank percentiles over the exact bounded sample; percentiles are
 *  never averaged. p95 is the displayed ceiling, so `insufficient` labels a
 *  sample below the heuristic display gate (100 observations) instead of
 *  letting a handful of rows look like a population. The weekly rollup keeps
 *  its own p50/p90/p99 columns and is deliberately untouched. */
function perfDashboardSummary_(group) {
  var ms = group.ms.slice().sort(function (a, b) { return a - b; });
  var n = ms.length;
  return { count: n,
    p50_ms: n ? perfPercentile_(ms, 50) : null,
    p75_ms: n ? perfPercentile_(ms, 75) : null,
    p95_ms: n ? perfPercentile_(ms, 95) : null,
    failures: group.failures,
    failure_rate: n ? group.failures / n : null,
    mean_sheet_reads: group.readCount ? group.reads / group.readCount : null,
    insufficient: n < PERFDASH_MIN_OBS_P95,
    p95_min_obs: PERFDASH_MIN_OBS_P95 };
}

/**
 * Bounded newest-first read of one telemetry source. Read-only: no writes, no
 * schema changes, no new store.
 *
 * Sheets — scan rows in PERFDASH_CHUNK_ROWS chunks from the newest row upward
 * inside one PERFDASH_MAX_ROWS_PER_OPEN budget. A script-cache cursor records
 * how far back the previous open reached so a repeated open continues with
 * older rows. The newest rows are re-read each open (that is how newly
 * appended rows are seen); because the aggregation is recomputed from this
 * open's sample and never merged with a previous one, overlap cannot double
 * count. Scanning stops at the budget, at the requested period start, or at
 * the PERFDASH_MAX_LOOKBACK_DAYS floor.
 *
 * Firestore — newest-first pages through the existing systemStore_() query
 * cursor. That cursor is inclusive on the boundary document, so the boundary
 * row of the previous page is skipped. It is not persisted across opens: a
 * document inserted after a persisted cursor would sort ABOVE it in the
 * descending order and be missed, so every open must start from the newest
 * document. The budget therefore bounds each open; if the period is not
 * covered the source is marked truncated rather than presented as complete.
 *
 * `complete` means this open covered the requested period (or the lookback
 * floor / the whole sheet); `truncated` means the budget ran out first.
 */
function perfDashboardRead_(table, backend, limit, opts) {
  var options = opts || {};
  var budget = Math.max(1, Number(limit) || PERFDASH_MAX_ROWS_PER_OPEN);
  var fromMs = perfDashboardFiniteMs_(options.fromMs);
  var lookbackFloorMs = perfDashboardFiniteMs_(options.lookbackFloorMs);
  var out = {
    rows: [],
    info: {
      state: 'ready', scanned: 0, capped: false, limit: budget, latest_at: null,
      invalid_rows: 0, covered_through: null, truncated: false, cursor_used: false,
      complete: false
    }
  };
  try {
    if (backend === 'firestore') {
      var cursor = null, lastName = null, scanned = 0, oldestMs = null, complete = false, stalled = false;
      var pageSize = Math.min(PERFDASH_CHUNK_ROWS, budget);
      while (scanned < budget) {
        var take = Math.min(pageSize, budget - scanned);
        var result = systemStore_().query(table, {
          orderBy: [{ field: 'ts', direction: 'DESCENDING' }],
          /* +1 absorbs the inclusive startAt boundary document so each page
           * still yields `take` genuinely new rows. */
          limit: take + (cursor ? 1 : 0),
          cursor: cursor || undefined,
          maxRetries: 0
        });
        var records = result.records || [], added = 0;
        records.forEach(function (record) {
          var name = record.meta && record.meta.name;
          if (lastName && name === lastName) return;   /* inclusive startAt boundary */
          out.rows.push(record.data || {});
          added++;
          var when = perfDashboardDate_((record.data || {}).ts), at = when ? when.getTime() : null;
          if (at !== null && (oldestMs === null || at < oldestMs)) oldestMs = at;
        });
        scanned += added;
        if (records.length) lastName = (records[records.length - 1].meta || {}).name;
        cursor = result.nextCursor;
        if (!cursor) { complete = true; break; }
        /* A page that added nothing cannot advance the position; stop instead
         * of looping forever and report the sample as incomplete. */
        if (!added) { stalled = true; break; }
        if (oldestMs !== null && fromMs !== null && oldestMs <= fromMs) { complete = true; break; }
        if (oldestMs !== null && lookbackFloorMs !== null && oldestMs < lookbackFloorMs) { complete = true; break; }
      }
      out.info.complete = complete;
      out.info.truncated = !complete && (scanned >= budget || stalled);
      out.info.capped = out.info.truncated;
      if (oldestMs !== null) out.info.covered_through = new Date(oldestMs).toISOString();
    } else {
      var sheet = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName(table);
      if (!sheet) { out.info.state = 'missing'; out.info.complete = true; return out; }
      var last = sheet.getLastRow(), width = Math.min(sheet.getLastColumn(), 20);
      if (last < 2 || !width) { out.info.complete = true; return out; }
      var headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
      var required = table === 'ERP_Perf_Log' ? ['ts', 'elapsed_ms', 'action', 'company', 'page', 'status'] : ['ts', 'metric', 'ms', 'page'];
      if (!required.every(function (key) { return headers.indexOf(key) !== -1; })) { out.info.state = 'schema_unavailable'; return out; }

      /* Validate the persisted continuation. Pruning or sheet edits that leave
       * row numbers outside the current sheet invalidate it; a lost cursor
       * only costs a restart from the newest rows. */
      var cursorState = options.cursorScope ? perfDashboardCursorGet_(options.cursorScope) : null;
      if (cursorState && (cursorState.mode !== 'sheets' || !(cursorState.row >= 2) || cursorState.row > last ||
          !(cursorState.latest_row >= 2) || cursorState.latest_row > last)) cursorState = null;
      out.info.cursor_used = !!cursorState;
      var topFloor = cursorState ? cursorState.latest_row + 1 : 2;
      var scanned = 0, readBottom = null, oldestMs = null;
      var tsCol = headers.indexOf('ts');
      function pushChunk(lo, hi) {
        var count = Math.min(PERFDASH_CHUNK_ROWS, hi - lo + 1, budget - scanned);
        if (count <= 0) return 0;
        var values = sheet.getRange(hi - count + 1, 1, count, width).getValues();
        for (var i = 0; i < values.length; i++) {
          var row = {};
          for (var j = 0; j < headers.length; j++) row[headers[j]] = values[i][j];
          out.rows.push(row);
        }
        readBottom = hi - count + 1;
        scanned += count;
        var when = tsCol === -1 ? null : perfDashboardDate_(values[0][tsCol]);
        if (when) { var at = when.getTime(); if (oldestMs === null || at < oldestMs) oldestMs = at; }
        return count;
      }

      /* Phase 1: newest rows down to the top of the previously covered window. */
      var periodCovered = false, lookbackReached = false;
      var pos = last;
      while (pos >= topFloor && scanned < budget) {
        if (!pushChunk(topFloor, pos)) break;
        pos = readBottom - 1;
        if (oldestMs !== null && fromMs !== null && oldestMs <= fromMs) { periodCovered = true; break; }
        if (oldestMs !== null && lookbackFloorMs !== null && oldestMs < lookbackFloorMs) { lookbackReached = true; break; }
      }
      var topDone = pos < topFloor;
      /* Phase 2: the older window below the previous cursor, when one exists. */
      var olderDone = false, olderPos = null;
      if (topDone && !periodCovered && !lookbackReached) {
        var olderHi = cursorState ? cursorState.row - 1 : 1;
        if (olderHi < 2) olderDone = true;
        else if (scanned < budget) {
          olderPos = olderHi;
          while (olderPos >= 2 && scanned < budget) {
            if (!pushChunk(2, olderPos)) break;
            olderPos = readBottom - 1;
          }
          olderDone = olderPos < 2;
        }
      }

      var complete = periodCovered || lookbackReached || (topDone && olderDone);
      var newTop = last, newRow;
      if (lookbackReached) newRow = 2;                        /* never walk past the floor */
      else if (periodCovered) newRow = readBottom === null ? (cursorState ? cursorState.row : 2) : readBottom;
      else if (topDone) newRow = olderDone ? 2 : (olderPos !== null ? readBottom : (cursorState ? cursorState.row : 2));
      else if (cursorState) { newTop = cursorState.latest_row; newRow = cursorState.row; }
      else newRow = readBottom === null ? 2 : readBottom;
      if (options.cursorScope) perfDashboardCursorSet_(options.cursorScope, { mode: 'sheets', row: newRow, latest_row: newTop });
      out.info.complete = complete;
      out.info.truncated = !complete;
      out.info.capped = out.info.truncated;
      if (oldestMs !== null) out.info.covered_through = new Date(oldestMs).toISOString();
    }
    out.info.scanned = out.rows.length;
  } catch (e) {
    // Do not leak backend URLs/project details or misrepresent an error as no activity.
    out.rows = []; out.info.state = 'unavailable'; out.info.complete = false;
  }
  return out;
}

function classifyAction_(action) {
  if (!action) return 'UNKNOWN';
  const actionStr = String(action).toLowerCase();
  
  // No log actions
  if (actionStr.startsWith('get_') || actionStr === 'ping' ||
      actionStr === 'login_user' || actionStr === 'request_password_setup_code' || actionStr === 'setup_password') {
    return 'NO_LOG';
  }
  
  // Admin list actions
  if (actionStr.startsWith('admin_list_')) {
    return 'NO_LOG';
  }
  
  // Action classification
  if (actionStr.startsWith('add_')) return 'ADD';
  if (actionStr.startsWith('edit_') || actionStr.startsWith('update_') || 
      actionStr.startsWith('approve_') || actionStr.startsWith('toggle_')) {
    return 'EDIT';
  }
  if (actionStr.startsWith('delete_') || actionStr.startsWith('remove_')) {
    return 'DELETE';
  }
  if (actionStr.startsWith('admin_delete_')) {
    return 'DELETE';
  }
  if (actionStr.startsWith('admin_save_')) {
    // For admin_save_, check if it's creating new or updating existing
    return 'ADMIN_SAVE'; // We'll handle this specifically in the log function
  }
  
  return 'UNKNOWN';
}

function extractRecordId_(action, result) {
  // Try to extract assigned ID from result
  if (result && result.data && result.data.assignedId) {
    return result.data.assignedId;
  }
  if (result && result.data && result.data.id) {
    return result.data.id;
  }
  return null;
}

/**
 * F-10: logSystemAction_ calls this on every logged write, and because writes run
 * with the request memo disabled (Code.js apiRouter_), it paid a full
 * ERP_Companies read every time. Version-cached on version_companies, the same
 * stamp its siblings in shared Code.js section use, so bumpVersion_('ERP_Companies')
 * invalidates it too.
 */
function getCompanyName_(companyId) {
  if (!companyId) return '';
  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'company_name_v_' + compVersion + '_' + companyId;
  try {
    const cached = cache.get(cacheKey);
    if (cached !== null && cached !== undefined) return cached === ' ' ? '' : cached;
  } catch (cacheErr) {}
  let name = '';
  try {
    const companies = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
    const company = companies.find(c => String(c.company_unique_id) === companyId);
    name = company ? String(company.company_name_ar || '') : '';
  } catch (e) {
    return '';
  }
  try { cache.put(cacheKey, name === '' ? ' ' : name, CONFIG.CACHE_GENERAL_SECONDS); } catch (putErr) {}
  return name;
}

/** Canonical SystemLog header order — add new columns to the END only, never insert in the middle. */
const SYSTEM_LOG_HEADERS = [
  'LogID', 'Timestamp', 'CompanyID', 'CompanyName', 'Action',
  'SourceAction', 'RecordID', 'UserEmail', 'ChangedFields',
  'Status', 'ErrorMessage', 'Table', 'Page',
  // Phase 0b instrumentation — appended at the END, per this list's own
  // documented convention. ensureSystemLogSheet_ migrates a live sheet in place
  // by adding only missing headers, so existing rows and columns are untouched.
  'ElapsedMs', 'SheetReads'
];

/**
 * Phase 0b: read actions (get_*, admin_list_*, ping) are classified NO_LOG, so
 * the slowest requests in the system are the ones we cannot see. Setting Script
 * Property PERF_LOG_READS=1 logs them too, for a measurement window.
 *
 * Deliberately OFF by default and property-gated rather than always-on: logging
 * a read appends a SystemLog row, i.e. adds a WRITE to every read, and SystemLog
 * already grows unbounded (F-13). It is a measuring instrument, not a setting to
 * leave on. Memoised per execution.
 */
let _perfLogReads_ = null;

/* Phase B per-execution flag memos. PERF_RUM gates headline sampling;
 * PERF_RUM_RATE optionally overrides the 10% default (clamped 0..1). */
let _perfRum_ = null;
let _perfRumRate_ = null;



/* ===================== 9. BACKUP / RETENTION / OPERATIONS =============== */
/* shared Code.js section — Daily CSV cloud backup of all configured DB sheets (rolling 15 days). */

/**
 * Backup source catalog. Derived at call time from ERP_Companies so it can never
 * drift from the live company list, plus the AUTH spreadsheet itself (which holds
 * ERP_Users / ERP_Sessions / ERP_Record_History / SystemLog and is not a company).
 *
 * A globally-defined DB_CONFIG, if one ever exists, still wins — this function is
 * the fallback that makes dailyCsvBackup actually run. Before this existed,
 * DB_CONFIG was referenced but defined nowhere, so every invocation returned
 * {ok:false,error:'no DB_CONFIG'} and no backup was ever produced.
 *
 * @return {Object} map of backup name -> { id: spreadsheetId }
 */
function buildDbConfig_() {
  var cfg = { AUTH: { id: CONFIG.AUTH_SPREADSHEET_ID } };
  try {
    var rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
    rows.forEach(function (r) {
      var uid = String(r.company_unique_id || '').trim();
      if (!uid) return;
      var rawLink = String(r.company_sheet_link || '').trim();
      if (!rawLink) return;
      var m = rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
      var ssId = m ? m[1] : rawLink;
      if (!ssId) return;
      var label = String(r.company_name_en || '').trim() || uid;
      cfg[safeFileNamePart_(label)] = { id: ssId };
    });
  } catch (e) {
    // A failure here still leaves the AUTH spreadsheet backed up.
    console.error('buildDbConfig_ could not read ERP_Companies: ' + e.message);
  }
  return cfg;
}

/** Strips characters that are awkward inside a Drive file name. */
function safeFileNamePart_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[\/\\:*?"<>|]/g, '_').trim();
}

/* Public only because existing time-driven triggers bind by function name.
 * A google.script.run caller cannot supply the native trigger object, so fail
 * closed unless this invocation matches an installed trigger for this handler. */
function dailyCsvBackup(e) {
  if (!isVerifiedTimeTrigger_(e, 'dailyCsvBackup')) throw new Error('Time-trigger invocation required.');
  return dailyCsvBackup_();
}

function dailyCsvBackup_(opts) {
  var storage = systemStorageTarget_();
  var cfg = (typeof DB_CONFIG !== 'undefined' && DB_CONFIG) ? DB_CONFIG : buildDbConfig_();
  if (!cfg || !Object.keys(cfg).length) return { ok: false, error: 'no DB_CONFIG' };
  if (storage.backend === 'firestore') {
    var companyCfg = {};
    Object.keys(cfg).forEach(function (name) { if (name !== 'AUTH') companyCfg[name] = cfg[name]; });
    return { ok: false, backend: 'firestore', firestore: firestoreSystemBackupManifest_(), companyCsv: runCsvBackupConfig_(companyCfg) };
  }
  return runCsvBackupConfig_(cfg);
}

function runCsvBackupConfig_(cfg) {
  if (!cfg || !Object.keys(cfg).length) return { ok: true, files: 0, errors: [], skipped: [] };
  var folder = getOrCreateCsvFolder_();
  if (!folder) return { ok: false, error: 'no backup folder (Drive API not enabled in project 45602854301?)' };
  var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyyMMdd');
  var count = 0, errors = [], skipped = [];
  // Apps Script kills a trigger run at 6 minutes. Stop cleanly at 5 and report
  // what was not written, so a truncated backup is visible instead of silent.
  var deadline = new Date().getTime() + (5 * 60 * 1000);
  Object.keys(cfg).forEach(function (dbName) {
    try {
      var ss = SpreadsheetApp.openById(cfg[dbName].id);
      ss.getSheets().forEach(function (sh) {
        var name = sh.getName();
        if (name.charAt(0) === '~') return; // skip temp/system sheets
        if (new Date().getTime() > deadline) { skipped.push(dbName + '/' + name); return; }
        var csv = sheetToCsv_(sh);
        var fname = dbName + '_' + safeFileNamePart_(name) + '_' + stamp + '.csv';
        try { folder.createFile(fname, csv, MimeType.CSV); count++; }
        catch (e2) { errors.push(fname + ': ' + e2.message); }
      });
    } catch (e) { errors.push(dbName + ': ' + e.message); }
  });
  try { pruneOldCsvBackups_(); } catch (e) {}
  return { ok: skipped.length === 0 && errors.length === 0, files: count, errors: errors, skipped: skipped };
}

/* Native Firestore export is an operator/project operation, not a CSV copy.
 * Return an explicit manifest so the old AUTH spreadsheet is never mislabeled
 * as the system database backup. The actual export command is documented in
 * FIRESTORE_READ_WRITE_IMPLEMENTATION_RESULTS.md. */
function firestoreSystemBackupManifest_() {
  var c = systemStorageTarget_();
  return { ok: false, backend: 'firestore', projectId: c.projectId, databaseId: c.databaseId, collections: systemTableNames_(), error: 'FIRESTORE_EXPORT_REQUIRED: configure and run a native Firestore export to an approved bucket', companyCsv: 'not run by this system-backup operation' };
}

/* The routed operator command remains available through Code.js, where the
 * session and super-admin checks are established before this handler runs. */
function dailyCsvBackupRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  return dailyCsvBackup_();
}

/**
 * Resolves the backup folder, in order:
 *   1. Script Property BACKUP_FOLDER_ID  (set this for prod; keeps ids out of source)
 *   2. CONFIG.BACKUP_FOLDER_ID
 *   3. a Drive folder named ERP_Backups_CSV, created on first use
 */
function getOrCreateCsvFolder_() {
  var rootName = 'ERP_Backups_CSV';
  var folderId = '';
  try { folderId = PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID') || ''; } catch (e) {}
  if (!folderId) folderId = String(CONFIG.BACKUP_FOLDER_ID || '').trim();
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); }
    catch (e) { console.error('BACKUP_FOLDER_ID "' + folderId + '" is not reachable: ' + e.message); }
  }
  try {
    var it = DriveApp.getFoldersByName(rootName);
    if (it.hasNext()) return it.next();
    return DriveApp.createFolder(rootName);
  } catch (e) { return null; }
}

function csvCell_(v) {
  if (v === null || v === undefined) v = '';
  var s = String(v);
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function sheetToCsv_(sh) {
  var data = sh.getDataRange().getValues();
  if (!data.length) return '';
  return data.map(function (row) {
    return row.map(csvCell_).join(',');
  }).join('\r\n');
}

function pruneOldCsvBackups_(days) {
  var maxAge = days || 15;
  var folder = getOrCreateCsvFolder_();
  if (!folder) return;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAge);
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    try {
      if (f.getLastUpdated().getTime() < cutoff.getTime()) f.setTrashed(true);
    } catch (e) {}
  }
}

/**
 * Restore-test helper — run manually from the Apps Script editor.
 * Reads one backup CSV out of the backup folder and writes it into a brand-new
 * scratch spreadsheet. It never touches a live sheet. An untested backup is not
 * a backup; this is how you test it.
 *
 * @param {string} csvFileName exact file name, e.g. 'AUTH_ERP_Users_20260905.csv'
 * @return {Object} { ok, url } or { ok:false, error }
 */
function restoreCsvToScratchSpreadsheet_(csvFileName) {
  if (!csvFileName) return { ok: false, error: 'csvFileName is required' };
  var folder = getOrCreateCsvFolder_();
  if (!folder) return { ok: false, error: 'backup folder not reachable' };
  var it = folder.getFilesByName(csvFileName);
  if (!it.hasNext()) return { ok: false, error: 'file not found in backup folder: ' + csvFileName };
  var data = Utilities.parseCsv(it.next().getBlob().getDataAsString());
  if (!data.length) return { ok: false, error: 'csv is empty' };
  var width = data.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
  var padded = data.map(function (r) {
    var out = r.slice();
    while (out.length < width) out.push('');
    return out;
  });
  var ss = SpreadsheetApp.create('RESTORE_TEST_' + csvFileName.replace(/\.csv$/i, ''));
  ss.getSheets()[0].getRange(1, 1, padded.length, width).setValues(padded);
  noteMutation_();
  return { ok: true, rows: padded.length, cols: width, url: ss.getUrl() };
}

/**
 * shared Code.js section — Phase 5. Archiving for the two unbounded log sheets.
 *
 * F-12: ERP_Record_History gets ONE ROW PER CHANGED COLUMN PER EDIT, for all
 *       three companies, into a single sheet — and get_record_history reads all
 *       of it and filters in JS. It grows faster than any business table and the
 *       history panel gets permanently slower.
 * F-13: SystemLog stores JSON.stringify(result.data) — a whole record object —
 *       in ChangedFields, so it grows fast in BYTES, not just rows.
 *
 * What this does: moves rows older than CONFIG.ARCHIVE_RETENTION_MONTHS out of
 * the live tab into a dated archive tab in the SAME spreadsheet, with the SAME
 * columns. Nothing is deleted, no schema changes, no business table touched.
 * Archive tabs are the structural exception pre-authorised in the plan.
 *
 * RETENTION PERIOD IS AN ASSUMPTION — see CONFIG.ARCHIVE_RETENTION_MONTHS.
 *
 * Nothing here runs automatically until you install the trigger. Run
 * archiveOldRecords_({ dryRun: true }) first; it reports exactly what would move
 * and writes nothing.
 */

/** Sheets eligible for archiving: live tab -> the column holding its timestamp. */
var ARCHIVE_TARGETS = [
  { sheet: 'ERP_Record_History', dateColumn: 'changed_at' },
  { sheet: 'SystemLog', dateColumn: 'Timestamp' }
];

/**
 * Archives everything older than the retention period.
 *
 * @param {Object} opts { dryRun: true } to report without writing.
 * @return {Object} per-sheet counts
 */
/* Public only because an installed time trigger binds by handler name. */
function archiveOldRecords(e) {
  if (!isVerifiedTimeTrigger_(e, 'archiveOldRecords')) throw new Error('Time-trigger invocation required.');
  return archiveOldRecords_({});
}

function archiveOldRecords_(opts) {
  opts = opts || {};
  var months = Number(CONFIG.ARCHIVE_RETENTION_MONTHS) || 24;
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  if (systemStorageTarget_().backend === 'firestore') return archiveFirestoreCollections_(cutoff, !!opts.dryRun, months);

  var out = { retentionMonths: months, cutoff: cutoff.toISOString(), dryRun: !!opts.dryRun, sheets: [] };
  ARCHIVE_TARGETS.forEach(function (t) {
    try {
      out.sheets.push(archiveSheetRows_(CONFIG.AUTH_SPREADSHEET_ID, t.sheet, t.dateColumn, cutoff, !!opts.dryRun));
    } catch (e) {
      out.sheets.push({ sheet: t.sheet, error: e.message });
    }
  });
  try { Logger.log(JSON.stringify(out, null, 2)); } catch (e) {}
  return out;
}

function archiveFirestoreCollections_(cutoff, dryRun, months) {
  var result = { retentionMonths: months, cutoff: cutoff.toISOString(), dryRun: dryRun, collections: [] };
  [{ live: 'ERP_Record_History', archive: 'ERP_Record_History_Archive', date: 'changed_at' }, { live: 'SystemLog', archive: 'SystemLog_Archive', date: 'timestamp' }].forEach(function (spec) {
    try {
      var rows = systemStore_().queryAll(spec.live, {}).records, stale = rows.filter(function (r) { var d = new Date(r.data[spec.date] || r.data[String(spec.date).toLowerCase()]); return !isNaN(d.getTime()) && d.getTime() < cutoff.getTime(); });
      if (!dryRun) stale.forEach(function (r) { systemCreateRecord_(spec.archive, Object.assign({}, r.data, { archived_at: new Date(), archive_source_document: r.meta.documentId }), { operationId: 'archive:' + spec.live + ':' + r.meta.documentId }); systemRemoveRecord_(spec.live, r.meta.documentId, { expectedUpdateTime: r.meta.updateTime }); });
      result.collections.push({ collection: spec.live, archived: stale.length });
    } catch (e) { result.collections.push({ collection: spec.live, error: e.message }); }
  });
  return result;
}

/** Convenience: see what would move, write nothing. */
function archiveOldRecordsDryRun_() {
  return archiveOldRecords_({ dryRun: true });
}

/**
 * Moves rows older than `cutoff` from one sheet into <sheet>_Archive_<year> tabs.
 *
 * Order of operations matters and is deliberate: rows are written to the archive
 * FIRST and the write is verified by re-reading the archive tab's last row. Only
 * then is the live tab rewritten. If anything throws in between, the worst case
 * is rows existing in both places — recoverable — never rows existing in neither.
 *
 * Rows whose date is blank or unparseable are KEPT, never archived. Being unable
 * to date a row is not a reason to move it.
 */
function archiveSheetRows_(ssId, sheetName, dateColumn, cutoff, dryRun) {
  var ss = getSpreadsheet_(ssId);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { sheet: sheetName, skipped: 'sheet not found' };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { sheet: sheetName, liveRows: 0, archived: 0 };

  var headers = data[0];
  var colCount = headers.length;
  var dateIdx = -1;
  for (var c = 0; c < colCount; c++) {
    if (String(headers[c]).trim().toLowerCase() === String(dateColumn).trim().toLowerCase()) { dateIdx = c; break; }
  }
  if (dateIdx === -1) return { sheet: sheetName, skipped: 'date column "' + dateColumn + '" not found' };

  var keep = [];
  var byYear = {};
  var undated = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var raw = row[dateIdx];
    var d = (raw instanceof Date) ? raw : (raw === '' || raw === null || raw === undefined ? null : new Date(raw));
    if (!d || isNaN(d.getTime())) { keep.push(row); undated++; continue; }
    if (d.getTime() >= cutoff.getTime()) { keep.push(row); continue; }
    var y = String(d.getFullYear());
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(row);
  }

  var years = Object.keys(byYear).sort();
  var archivedCount = years.reduce(function (n, y) { return n + byYear[y].length; }, 0);
  var result = {
    sheet: sheetName,
    liveRowsBefore: data.length - 1,
    archived: archivedCount,
    liveRowsAfter: keep.length,
    undatedKept: undated,
    archiveTabs: years.map(function (y) { return sheetName + '_Archive_' + y + ' (' + byYear[y].length + ')'; })
  };
  if (!archivedCount || dryRun) return result;

  executeWithLock_(function () {
    years.forEach(function (y) {
      var tabName = sheetName + '_Archive_' + y;
      var target = ss.getSheetByName(tabName);
      if (!target) {
        target = ss.insertSheet(tabName);
        noteMutation_();
        target.getRange(1, 1, 1, colCount).setValues([headers]);
        noteMutation_();
        target.setFrozenRows(1);
      }
      var rows = byYear[y];
      var startRow = target.getLastRow() + 1;
      var needed = startRow + rows.length - 1;
      if (needed > target.getMaxRows()) target.insertRowsAfter(target.getMaxRows(), needed - target.getMaxRows());
      noteMutation_();
      target.getRange(startRow, 1, rows.length, colCount).setValues(rows);
      noteMutation_();
      SpreadsheetApp.flush();
      // Verify before removing anything from the live tab.
      if (target.getLastRow() < needed) {
        throw new Error('archive write to ' + tabName + ' did not land; live sheet left untouched');
      }
    });

    // Rewrite the live body with the survivors, then clear the tail.
    var lastRow = sheet.getLastRow();
    if (keep.length) sheet.getRange(2, 1, keep.length, colCount).setValues(keep);
    noteMutation_();
    var firstStale = 2 + keep.length;
    if (lastRow >= firstStale) sheet.getRange(firstStale, 1, lastRow - firstStale + 1, colCount).clearContent();
    noteMutation_();
    SpreadsheetApp.flush();
  });

  return result;
}

/**
 * Reads history rows for one sheet out of the archive tabs. Used by
 * get_record_history when the caller passes include_archive:true, so archived
 * history is still reachable — just not on the default path.
 */
function readArchivedHistory_(sheetName, recordId, recordUid) {
  if (systemStorageTarget_().backend === 'firestore') {
    return systemGetAllRecords_('ERP_Record_History_Archive').filter(function (rec) {
      return String(rec.sheet_name) === String(sheetName) && (!recordId || String(rec.record_id) === String(recordId)) && (recordId || !recordUid || String(rec.record_uid) === String(recordUid));
    });
  }
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var out = [];
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (name.indexOf('ERP_Record_History_Archive_') !== 0) return;
    var data = sh.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0].map(function (h) { return String(h).trim(); });
    for (var i = 1; i < data.length; i++) {
      var rec = {};
      for (var c = 0; c < headers.length; c++) rec[headers[c]] = data[i][c];
      if (String(rec.sheet_name) !== String(sheetName)) continue;
      if (recordId && String(rec.record_id) !== String(recordId)) continue;
      if (!recordId && recordUid && String(rec.record_uid) !== String(recordUid)) continue;
      out.push(rec);
    }
  });
  return out;
}

/**
 * Route handler for 'archive_old_records'. Super-admin only, and DRY RUN unless
 * the caller explicitly passes confirm:true — this rewrites two log sheets.
 */
function archiveOldRecordsRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  var confirm = !!(payload && payload.confirm === true);
  return { status: 'success', data: archiveOldRecords_({ dryRun: !confirm }) };
}

/**
 * Installs the monthly archive trigger. Safe to run repeatedly — removes any
 * prior instance first. 02:00 on the 1st, outside working hours: the run reads
 * and rewrites two large sheets.
 */
function installRetentionTrigger_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'archiveOldRecords') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  ScriptApp.newTrigger('archiveOldRecords').timeBased().onMonthDay(1).atHour(2).create();
  return { status: 'success', message: 'تم تثبيت مؤقت الأرشفة الشهري' };
}

/**
 * shared Code.js section
 * RESPONSIBILITY: automated daily full-spreadsheet backups (one copy per
 * company database), 10-day trash retention, per-backup logging, and a
 * super-admin one-click zip download. Additive only — no business logic here.
 *
 * Mapping to the prompt: the "ERP Information spreadsheet" is the AUTH
 * spreadsheet (CONFIG.AUTH_SPREADSHEET_ID), which is where ERP_System_Backups
 * already lives by project convention (see batch1_createSystemSheets in
 * Backup/06_Migration.js). The log sheet is created with its header row if
 * it is somehow missing.
 *
 * Ground rules honored:
 *  - Reads/copies sources only. No write/edit/delete call against any source
 *    spreadsheet exists in this file — only DriveApp makeCopy / export reads.
 *  - No spreadsheet IDs are hardcoded: BACKUP_SOURCES lists company registry
 *    keys (stable identifiers, same as target_system values used across the
 *    client), and IDs are resolved at runtime via getCompanySpreadsheetId_().
 *  - One source failing never stops the others (per-source try/catch).
 */

/* ── Config: everything in one place. Adding a source = one line here. ── */
var BACKUP_SOURCES = null;
var BACKUP_FOLDER_NAME = 'ERP_Daily_Backups';
var BACKUP_RETENTION_DAYS = 10;
var BACKUP_LOG_SHEET = 'ERP_System_Backups';
var BACKUP_LOG_HEADERS = ['backup_id', 'source', 'file_id', 'created_at'];
/* google.script.run responses cap at ~50MB. Above this we refuse to build the
 * download and say so, instead of silently truncating the archive. */
var BACKUP_DOWNLOAD_MAX_BYTES = 40 * 1024 * 1024;

/**
 * Find the persistent backup folder by name; create it once if missing.
 * getFoldersByName returns the existing folder on every later run, so this
 * can never create a duplicate.
 */
function getOrCreateBackupFolder_() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

/** Resolve BACKUP_SOURCES to [{ name, spreadsheetId }]. Never throws as a
 *  whole: a company that fails to resolve is reported per-source instead. */
function resolveBackupSources_() {
  ensureCompaniesRegistered_();
  var sources = Object.keys(COMPANY_REGISTRY || {}).map(function (companyKey) {
    var cfg = COMPANY_REGISTRY[companyKey] || {};
    return { companyKey: companyKey, name: cfg.name || cfg.displayName || companyKey };
  });
  return sources.map(function (entry) {
    try {
      var ssId = getCompanySpreadsheetId_(entry.companyKey);
      if (!ssId) throw new Error('empty spreadsheet id');
      return { name: entry.name, spreadsheetId: ssId, error: null };
    } catch (e) {
      return { name: entry.name, spreadsheetId: null, error: e.message };
    }
  });
}

/** Return the log sheet in the AUTH spreadsheet, creating it (with header)
 *  only if it does not exist yet. Never touches any other spreadsheet. */
function ensureBackupLogSheet_() {
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var sheet = ss.getSheetByName(BACKUP_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BACKUP_LOG_SHEET);
    sheet.appendRow(BACKUP_LOG_HEADERS);
    noteMutation_();
  }
  return sheet;
}

/** Append one log row under a single lock acquisition: the backup_id comes
 *  from the canonical getNextIdUnderLock_ pattern (max(backup_id)+1), so no
 *  second ID scheme is introduced. */
function appendBackupLogRow_(source, fileId) {
  return executeWithLock_(function () {
    var sheet = ensureBackupLogSheet_();
    var backupId = getNextIdUnderLock_(CONFIG.AUTH_SPREADSHEET_ID, BACKUP_LOG_SHEET, 'backup_id');
    sheet.appendRow([backupId, source, fileId, new Date()]);
    noteMutation_();
    try { noteTableChange_(CONFIG.AUTH_SPREADSHEET_ID, BACKUP_LOG_SHEET); } catch (e) {}
    return backupId;
  });
}

/**
 * Copy every configured source spreadsheet into the backup folder and log
 * each success. Per-source try/catch: one failure is collected and the run
 * continues with the rest.
 */
function runDailyBackup_() {
  var folder = getOrCreateBackupFolder_();
  var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd_HHmm');
  var sources = resolveBackupSources_();
  var backedUp = [];
  var failures = [];
  sources.forEach(function (src) {
    if (!src.spreadsheetId) {
      failures.push({ source: src.name, step: 'resolve', error: src.error || 'unresolvable' });
      return;
    }
    var fileId = null;
    try {
      var copy = DriveApp.getFileById(src.spreadsheetId)
        .makeCopy(src.name + '_Backup_' + stamp, folder);
      fileId = copy.getId();
    } catch (e) {
      failures.push({ source: src.name, step: 'copy', error: e.message });
      return;
    }
    try {
      var backupId = appendBackupLogRow_(src.name, fileId);
      backedUp.push({ source: src.name, backup_id: backupId, file_id: fileId });
    } catch (e) {
      failures.push({ source: src.name, step: 'log', file_id: fileId, error: e.message });
    }
  });
  return { status: failures.length ? 'partial' : 'success', backedUp: backedUp, failures: failures };
}

/**
 * Trash backup-folder files older than BACKUP_RETENTION_DAYS (recoverable
 * from Drive Trash — not permanent deletion). Scoped strictly to the backup
 * folder: source spreadsheets are never listed, let alone trashed.
 */
function purgeOldBackups_() {
  var folder = getOrCreateBackupFolder_();
  var cutoff = new Date().getTime() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var trashed = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    try {
      if (f.getLastUpdated().getTime() < cutoff) {
        trashed.push(f.getName());
        f.setTrashed(true);
      }
    } catch (e) {}
  }
  return { status: 'success', trashed: trashed };
}

/**
 * Single trigger entry point. Public only because time-driven triggers bind
 * by function name — same fail-closed pattern as dailyCsvBackup in 07_Backup.
 */
function dailyBackupJob_(e) {
  if (!isVerifiedTimeTrigger_(e, 'dailyBackupJob_')) throw new Error('Time-trigger invocation required.');
  var backup = runDailyBackup_();
  var purge = null;
  /* Purge only after a fully successful backup day. */
  if (backup.status === 'success') {
    try {
      purge = purgeOldBackups_();
    } catch (e) {
      purge = { status: 'error', error: e.message };
    }
  } else {
    purge = { status: 'skipped', reason: 'backup day had failures; retention run deferred' };
  }
  return { status: backup.status, backup: backup, purge: purge };
}

/**
 * One-time setup (run manually from the script editor, not on deploy):
 * delete any existing trigger for the daily job, then schedule ~2 AM daily.
 * Safe to re-run — it cannot create a duplicate.
 */
function installDailyBackupTrigger_() {
  /* The ~2 AM schedule is only correct in Africa/Cairo. Fail the setup loudly
   * if the project time zone was ever changed, instead of backing up silently
   * at the wrong hour. (Confirmed: project time zone is Africa/Cairo.) */
  try {
    var tz = Session.getScriptTimeZone();
    if (tz && tz !== 'Africa/Cairo') {
      throw new Error('Project time zone is "' + tz + '" — set it to Africa/Cairo (Project Settings) before installing the 2 AM trigger.');
    }
  } catch (e) {
    if (String(e.message || '').indexOf('Project time zone') === 0) throw e;
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyBackupJob_') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  ScriptApp.newTrigger('dailyBackupJob_').timeBased().atHour(2).everyDays(1).create();
  return { status: 'success', message: 'تم تثبيت مؤقت النسخ الاحتياطي اليومي (~2 صباحاً)' };
}

/** Route form of the one-time setup, super-admin only. */
function installDailyBackupTriggerRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  return installDailyBackupTrigger_();
}

/** Latest logged file_id per source (max created_at wins). Read-only. */
function latestBackupFileIds_() {
  var sheet = ensureBackupLogSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var iSource = headers.indexOf('source');
  var iFile = headers.indexOf('file_id');
  var iCreated = headers.indexOf('created_at');
  var latest = {};
  for (var r = 1; r < values.length; r++) {
    var source = String(values[r][iSource] || '').trim();
    var fileId = String(values[r][iFile] || '').trim();
    if (!source || !fileId) continue;
    var when = values[r][iCreated] instanceof Date
      ? values[r][iCreated].getTime()
      : new Date(values[r][iCreated]).getTime();
    if (!latest[source] || when > latest[source].when) {
      latest[source] = { file_id: fileId, when: when };
    }
  }
  return latest;
}

/** Export one backed-up spreadsheet as .xlsx bytes via the Drive export
 *  endpoint. A native Google Sheet has no usable getBlob() — UrlFetchApp
 *  export is required (same note as the prompt's implementation detail). */
function exportBackupAsXlsx_(fileId, name) {
  var resp = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + fileId + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) {
    throw new Error('xlsx export failed for ' + name + ' (HTTP ' + resp.getResponseCode() + ')');
  }
  return resp.getBlob().setName(name + '.xlsx');
}

/**
 * Super-admin route: bundle each source's latest backup xlsx into ONE zip
 * and return it as base64 for a single browser download. Fail-closed on the
 * role check before any export happens. Oversize archives are reported, not
 * truncated.
 */
function sysDownloadBackupsRoute_(payload, sessionToken, authUser) {
  if (!(authUser && authUser.isSuperAdmin)) throw new Error('صلاحية غير كافية');
  var latest = latestBackupFileIds_();
  var names = Object.keys(latest);
  if (!names.length) throw new Error('لا توجد نسخ احتياطية مسجلة بعد');
  var blobs = [];
  var failures = [];
  names.forEach(function (source) {
    try {
      blobs.push(exportBackupAsXlsx_(latest[source].file_id, source));
    } catch (e) {
      failures.push({ source: source, error: e.message });
    }
  });
  if (!blobs.length) throw new Error('تعذر تصدير أي نسخة احتياطية');
  var totalBytes = blobs.reduce(function (sum, b) { return sum + b.getBytes().length; }, 0);
  if (totalBytes > BACKUP_DOWNLOAD_MAX_BYTES) {
    return {
      status: 'too_large',
      bytes: totalBytes,
      limit: BACKUP_DOWNLOAD_MAX_BYTES,
      sources: names,
      message: 'حجم النسخ يتجاوز حد الاستجابة الواحدة — يلزم تنزيل مجزأ'
    };
  }
  var stamp = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
  var zip = Utilities.zip(blobs, 'ERP_Backups_' + stamp + '.zip');
  return {
    status: 'success',
    filename: 'ERP_Backups_' + stamp + '.zip',
    base64: Utilities.base64Encode(zip.getBytes()),
    sources: names,
    failures: failures
  };
}
