import fs from 'node:fs/promises';
import crypto from 'node:crypto';

/**
 * Create-only reconciliation from the legacy ERP Information spreadsheet to
 * Firestore. The default mode is a dry run. Pass --write only after reviewing
 * the audit output.
 *
 * This script never patches or deletes a Firestore document. An existing
 * business key with different field values is reported as a conflict and left
 * untouched. Output contains counts only, not record values or key values.
 */

const args = new Set(process.argv.slice(2));
const writeEnabled = args.has('--write');
const keyPath = 'D:/Work/Script/Fire base json key/erp-project-3cae0-dda88ffaea33.json';
const spreadsheetId = '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM';
const projectId = 'erp-project-3cae0';
const databaseId = '(default)';

// Ordered alternatives. The first complete, nonblank business key is used.
const KEY_ALTERNATIVES = {
  ERP_Users: [['email']],
  ERP_History_Queue: [['event_id']],
  ERP_Sessions: [['token_hash']],
  ERP_User_Devices: [['email', 'device_id']],
  ERP_User_Views: [['view_id'], ['email', 'page_action', 'view_name']],
  ERP_Record_History: [['id'], ['event_id']],
  SystemLog: [['logid'], ['id']],
  ERP_Companies: [['company_unique_id']],
  ERP_Pages_Matrix: [['erp_pages_matrix_unique_id'], ['role', 'page_id']],
  ERP_System_Pages: [['page_id']],
  ERP_currency_exchange: [['id'], ['currency']],
  ERP_system_work: [['id']],
  ERP_system_invoices: [['unique_id'], ['id']],
};

// These sheet tabs are intentionally not used by the Firestore runtime schema.
const NON_RUNTIME_TABS = new Set(['ERP_System_Backups', 'ID_Counter']);

const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
if (key.project_id !== projectId) throw new Error(`Key project ${key.project_id} does not match ${projectId}`);

const b64url = (value) => Buffer.from(value).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(key.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Token request failed (${response.status}): ${await response.text()}`);
  return (await response.json()).access_token;
}

const token = await accessToken();

async function api(url, options = {}, allowedStatuses = []) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) },
      });
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 500 * (2 ** attempt))));
      continue;
    }
    const body = await response.text();
    if (response.ok || allowedStatuses.includes(response.status)) {
      return { status: response.status, body: body ? JSON.parse(body) : {} };
    }
    if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt < 5) {
      const delay = response.status === 429
        ? Math.min(60000, 5000 * (2 ** attempt))
        : Math.min(8000, 500 * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(`API request failed (${response.status}) ${url}: ${body.slice(0, 1000)}`);
  }
  throw new Error(`API request retries exhausted: ${url}`);
}

function collectionName(title, index) {
  const clean = String(title).trim().replace(/[^A-Za-z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');
  return clean || `sheet_${index + 1}`;
}

function uniqueHeaders(cells) {
  const used = new Map();
  return cells.map((cell, index) => {
    const raw = cell?.formattedValue ?? cell?.effectiveValue?.stringValue ?? cell?.effectiveValue?.numberValue ?? '';
    const base = String(raw).trim() || `column_${index + 1}`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base}_${count + 1}` : base;
  });
}

// Convert a Sheets serial into the absolute timestamp represented by the
// displayed wall-clock value in the spreadsheet timezone.
function serialToTimestamp(serial, timeZone, dateOnly) {
  const adjusted = dateOnly ? Math.floor(serial) : serial;
  const base = Date.UTC(1899, 11, 30) + Math.round(adjusted * 86400000);
  const provisional = new Date(base);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(provisional);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(base - (wallClockAsUtc - base)).toISOString();
}

function sheetCellValue(cell, timeZone, header) {
  const effective = cell?.effectiveValue;
  if (!effective) return null;
  const numberType = cell?.effectiveFormat?.numberFormat?.type;
  if ((numberType === 'DATE' || numberType === 'DATE_TIME') && typeof effective.numberValue === 'number') {
    const dateOnly = String(header || '').trim().toLowerCase() === 'invoice_date';
    return { __timestamp: serialToTimestamp(effective.numberValue, timeZone, dateOnly) };
  }
  if ('stringValue' in effective) return effective.stringValue;
  if ('numberValue' in effective) return effective.numberValue;
  if ('boolValue' in effective) return effective.boolValue;
  if ('errorValue' in effective) return cell.formattedValue || String(effective.errorValue?.type || 'SHEET_ERROR');
  return cell?.formattedValue ?? null;
}

function decodeFirestoreValue(value) {
  if (!value || 'nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return !!value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return { __timestamp: new Date(value.timestampValue).toISOString() };
  if ('bytesValue' in value) return value.bytesValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) {
    const out = {};
    for (const [name, item] of Object.entries(value.mapValue.fields || {})) out[name] = decodeFirestoreValue(item);
    return out;
  }
  return null;
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value && typeof value === 'object' && Object.keys(value).length === 1 && value.__timestamp) {
    return { timestampValue: value.__timestamp };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite sheet number');
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') {
    const fields = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, encodeFirestoreValue(item)]));
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function lowerRecord(record) {
  const out = {};
  for (const [name, value] of Object.entries(record || {})) out[String(name).trim().toLowerCase()] = value;
  return out;
}

function canonicalValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value && typeof value === 'object' && value.__timestamp) return `t:${new Date(value.__timestamp).toISOString()}`;
  if (typeof value === 'number') return `n:${Number(value.toPrecision(15))}`;
  if (typeof value === 'boolean') return `b:${value ? 1 : 0}`;
  if (Array.isArray(value)) return `a:${JSON.stringify(value.map(canonicalValue))}`;
  if (typeof value === 'object') {
    return `o:${JSON.stringify(Object.keys(value).sort().map((name) => [name.toLowerCase(), canonicalValue(value[name])]))}`;
  }
  return `s:${String(value)}`;
}

function fullSignature(record) {
  const lowered = lowerRecord(record);
  return JSON.stringify(Object.keys(lowered).sort().flatMap((name) => {
    const value = canonicalValue(lowered[name]);
    return value === null ? [] : [[name, value]];
  }));
}

function recordSignature(tableName, record) {
  if (tableName !== 'ERP_History_Queue' && tableName !== 'ERP_Record_History') return fullSignature(record);
  const lowered = lowerRecord(record);
  const auditFields = ['sheet_name', 'record_uid', 'record_id', 'action', 'column_name', 'old_value', 'new_value', 'changed_by'];
  const core = {};
  for (const field of auditFields) core[field] = lowered[field];
  return fullSignature(core);
}

function keySignature(tableName, record) {
  const lowered = lowerRecord(record);
  for (const alternative of KEY_ALTERNATIVES[tableName] || []) {
    const values = alternative.map((field) => lowered[field.toLowerCase()]);
    if (values.every((value) => value !== null && value !== undefined && String(value).trim() !== '')) {
      const normalized = values.map((value) => String(value?.__timestamp || value).trim().toLowerCase());
      return `${alternative.join('+').toLowerCase()}:${normalized.join('|')}`;
    }
  }
  return '';
}

async function readSheet(title, timeZone) {
  const range = `'${title.replaceAll("'", "''")}'`;
  const fields = 'sheets(data(rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat(type))))))';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?includeGridData=true&ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent(fields)}`;
  const payload = (await api(url)).body;
  const rows = payload.sheets?.[0]?.data?.[0]?.rowData || [];
  const headers = uniqueHeaders(rows[0]?.values || []);
  const records = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const cells = rows[rowIndex]?.values || [];
    const values = headers.map((header, columnIndex) => sheetCellValue(cells[columnIndex], timeZone, header));
    if (!values.some((value) => value !== null && value !== '')) continue;
    records.push({
      sourceRow: rowIndex + 1,
      data: Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]])),
    });
  }
  return { headers, records };
}

async function readFirestoreCollection(collection) {
  const documents = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/${encodeURIComponent(collection)}?${query}`;
    const response = await api(url, {}, [404]);
    if (response.status === 404) return [];
    for (const document of response.body.documents || []) {
      const data = {};
      for (const [name, value] of Object.entries(document.fields || {})) data[name] = decodeFirestoreValue(value);
      documents.push({ name: document.name, documentId: String(document.name || '').split('/').pop(), data });
    }
    pageToken = response.body.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function deterministicDocumentId(collection, identity) {
  const digest = crypto.createHash('sha256').update(`${collection}\0${identity}`).digest('hex').slice(0, 48);
  return `sheet_reconcile_${digest}`;
}

function operationId(value) {
  return `op_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40)}`;
}

function completedHistoryRecord(record) {
  const lowered = lowerRecord(record.data);
  const fields = ['sheet_name', 'record_uid', 'record_id', 'action', 'column_name', 'old_value', 'new_value', 'changed_by', 'changed_at', 'created_at'];
  const data = {};
  for (const field of fields) if (lowered[field] !== undefined) data[field] = lowered[field];
  const changedAt = lowered.changed_at?.__timestamp || lowered.changed_at || '';
  const natural = [lowered.record_uid || '', lowered.column_name || '', lowered.action || '', changedAt].join('|');
  data.event_id = operationId(`history:${natural}`);
  return data;
}

async function writeCreateOnlyBatch(collection, missing) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:batchWrite`;
  let created = 0;
  let alreadyExists = 0;
  for (let start = 0; start < missing.length; start += 200) {
    const batch = missing.slice(start, start + 200);
    const writes = batch.map((item) => ({
      update: {
        name: `projects/${projectId}/databases/${databaseId}/documents/${collection}/${item.documentId}`,
        fields: Object.fromEntries(Object.entries(item.data).map(([name, value]) => [name, encodeFirestoreValue(value)])),
      },
      currentDocument: { exists: false },
    }));
    const response = (await api(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ writes }),
    })).body;
    const statuses = response.status || [];
    for (let index = 0; index < batch.length; index++) {
      const code = Number(statuses[index]?.code || 0);
      if (code === 0) created++;
      else if (code === 6) alreadyExists++;
      else throw new Error(`batchWrite failed for ${collection} item ${start + index + 1}: code ${code}, ${statuses[index]?.message || 'unknown error'}`);
    }
    console.log(`${collection}: processed ${Math.min(start + batch.length, missing.length)}/${missing.length} create-only writes`);
  }
  return { created, alreadyExists };
}

const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent('properties(timeZone),sheets(properties(title))')}`;
const metadata = (await api(metadataUrl)).body;
const timeZone = metadata.properties?.timeZone || 'Etc/UTC';
const sheetTitles = (metadata.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean);

console.log(`Mode: ${writeEnabled ? 'CREATE-ONLY WRITE' : 'DRY RUN'}`);
console.log(`Spreadsheet tabs: ${sheetTitles.length}; timezone: ${timeZone}`);

const audit = [];
const pendingByCollection = new Map();

for (let sheetIndex = 0; sheetIndex < sheetTitles.length; sheetIndex++) {
  const title = sheetTitles[sheetIndex];
  const collection = collectionName(title, sheetIndex);
  const sheet = await readSheet(title, timeZone);
  const sheetRecords = sheet.records;
  const firestore = await readFirestoreCollection(collection);
  const comparisonDocuments = title === 'ERP_History_Queue'
    ? firestore.concat(await readFirestoreCollection('ERP_Record_History'))
    : firestore;
  const firestoreFields = [...new Set(firestore.flatMap((document) => Object.keys(document.data || {})))].sort();
  console.log(`${title} fields: sheet=[${sheet.headers.join(',')}], firestore=[${firestoreFields.join(',')}]`);

  const firestoreByKey = new Map();
  const firestoreSignatureCounts = new Map();
  for (const document of comparisonDocuments) {
    const keySig = keySignature(title, document.data);
    if (keySig) {
      const list = firestoreByKey.get(keySig) || [];
      list.push(document);
      firestoreByKey.set(keySig, list);
    }
    const signature = recordSignature(title, document.data);
    firestoreSignatureCounts.set(signature, (firestoreSignatureCounts.get(signature) || 0) + 1);
  }
  if (title === 'ERP_History_Queue') {
    const queueCounts = new Map();
    const historyCounts = new Map();
    for (const document of firestore) {
      const signature = recordSignature(title, document.data);
      queueCounts.set(signature, (queueCounts.get(signature) || 0) + 1);
    }
    for (const document of comparisonDocuments.slice(firestore.length)) {
      const signature = recordSignature(title, document.data);
      historyCounts.set(signature, (historyCounts.get(signature) || 0) + 1);
    }
    firestoreSignatureCounts.clear();
    for (const signature of new Set([...queueCounts.keys(), ...historyCounts.keys()])) {
      firestoreSignatureCounts.set(signature, Math.max(queueCounts.get(signature) || 0, historyCounts.get(signature) || 0));
    }
  }

  const legacyRowIds = new Set(firestore.map((document) => document.documentId));

  const sheetOccurrence = new Map();
  const missing = [];
  let present = 0;
  let conflicts = 0;
  let duplicateKeys = 0;

  for (const record of sheetRecords) {
    if (title === 'ERP_Record_History' && legacyRowIds.has(`row_${String(record.sourceRow).padStart(6, '0')}`)) {
      present++;
      continue;
    }
    const signature = recordSignature(title, record.data);
    const keySig = keySignature(title, record.data);
    if (keySig) {
      const matches = firestoreByKey.get(keySig) || [];
      if (matches.length) {
        if (matches.length > 1) duplicateKeys++;
        if (matches.some((document) => recordSignature(title, document.data) === signature)) present++;
        else conflicts++;
        continue;
      }
      missing.push({ ...record, documentId: deterministicDocumentId(collection, `key:${keySig}`) });
      continue;
    }

    const occurrence = (sheetOccurrence.get(signature) || 0) + 1;
    sheetOccurrence.set(signature, occurrence);
    const existingCount = firestoreSignatureCounts.get(signature) || 0;
    if (occurrence <= existingCount) {
      present++;
      continue;
    }
    missing.push({ ...record, documentId: deterministicDocumentId(collection, `record:${signature}#${occurrence}`) });
  }

  const status = {
    table: title,
    collection,
    sheet: sheetRecords.length,
    firestore: firestore.length,
    present,
    missing: missing.length,
    conflicts,
    duplicateKeys,
    runtime: !NON_RUNTIME_TABS.has(title),
  };
  audit.push(status);
  if (missing.length && status.runtime) {
    const targetCollection = title === 'ERP_History_Queue' ? 'ERP_Record_History' : collection;
    const targetItems = title === 'ERP_History_Queue'
      ? missing.map((item) => ({
          ...item,
          data: completedHistoryRecord(item),
          documentId: deterministicDocumentId(targetCollection, `legacy-queue:${item.documentId}`),
        }))
      : missing;
    pendingByCollection.set(targetCollection, (pendingByCollection.get(targetCollection) || []).concat(targetItems));
  }
  console.log(`${title}: sheet=${status.sheet}, firestore=${status.firestore}, present=${present}, missing=${missing.length}, conflicts=${conflicts}, duplicateKeys=${duplicateKeys}${status.runtime ? '' : ', non-runtime=skip-write'}`);
}

const totalMissing = audit.filter((row) => row.runtime).reduce((sum, row) => sum + row.missing, 0);
const totalConflicts = audit.reduce((sum, row) => sum + row.conflicts, 0);
console.log(`Summary: runtime missing=${totalMissing}, conflicts skipped=${totalConflicts}`);

if (!writeEnabled) {
  console.log('Dry run only. No Firestore documents were created, changed, or deleted.');
  process.exit(0);
}

let totalCreated = 0;
let totalAlreadyExists = 0;
for (const [collection, missing] of pendingByCollection) {
  const result = await writeCreateOnlyBatch(collection, missing);
  totalCreated += result.created;
  totalAlreadyExists += result.alreadyExists;
}

console.log(`Write complete: created=${totalCreated}, already-existed=${totalAlreadyExists}, overwritten=0, deleted=0, conflicts-skipped=${totalConflicts}`);
