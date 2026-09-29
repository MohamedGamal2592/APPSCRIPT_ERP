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
