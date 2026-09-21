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
