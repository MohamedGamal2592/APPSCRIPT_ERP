import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const writeEnabled = process.argv.includes('--write');
const verifyOnly = process.argv.includes('--verify-only');
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const keyPath = positional[0] || 'D:/Work/Script/Fire base json key/erp-project-3cae0-dda88ffaea33.json';
const spreadsheetId = positional[1] || '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM';
const projectId = positional[2] || 'erp-project-3cae0';

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
  const jwt = `${header}.${claim}.${signer.sign(key.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!response.ok) throw new Error(`Token request failed (${response.status}): ${await response.text()}`);
  return (await response.json()).access_token;
}

const token = await accessToken();
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const body = await response.text();
  if (!response.ok) throw new Error(`API request failed (${response.status}) ${url}: ${body}`);
  return body ? JSON.parse(body) : {};
}

const database = await api(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)`);
console.log(`Firestore database: ${database.name || '(default)'}`);
console.log(`Firestore location: ${database.locationId || 'unknown'}`);

const sheetsBase = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
const metadata = await api(`${sheetsBase}?fields=sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`);
const sheets = metadata.sheets || [];
console.log(`Source spreadsheet: ${spreadsheetId}`);
console.log(`Sheets found: ${sheets.length}`);

function firestoreValue(value) {
  if (value === null || value === undefined || value === '') return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}

function fieldName(header, index) {
  const clean = String(header ?? '').trim();
  return clean || `column_${index + 1}`;
}

function columnLetters(number) {
  let n = Math.max(1, number);
  let result = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function collectionName(title, index) {
  const clean = String(title).trim().replace(/[^A-Za-z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');
  return clean || `sheet_${index + 1}`;
}

const imported = [];
for (let i = 0; i < sheets.length; i++) {
  const props = sheets[i].properties;
  const quotedTitle = `'${props.title.replaceAll("'", "''")}'`;
  const columnCount = props.gridProperties?.columnCount || 26;
  const rowCount = props.gridProperties?.rowCount || 1000;
  const range = `${quotedTitle}!A1:${columnLetters(columnCount)}${rowCount}`;
  const data = await api(`${sheetsBase}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  const rows = data.values || [];
  if (!rows.length) {
    imported.push({ title: props.title, collection: collectionName(props.title, i), rows: 0 });
    continue;
  }
  const usedHeaders = new Map();
  const headers = rows[0].map((v, n) => {
    const base = fieldName(v, n);
    const count = usedHeaders.get(base) || 0;
    usedHeaders.set(base, count + 1);
    return count ? `${base}_${count + 1}` : base;
  });
  const documents = rows.slice(1).filter((row) => row.some((v) => v !== '' && v !== null && v !== undefined)).map((row, rowIndex) => ({
    name: `projects/${projectId}/databases/(default)/documents/${collectionName(props.title, i)}/row_${String(rowIndex + 2).padStart(6, '0')}`,
    fields: Object.fromEntries(headers.map((header, n) => [header, firestoreValue(row[n])])),
  }));
  imported.push({ title: props.title, collection: collectionName(props.title, i), rows: documents.length, documents });
}

console.log(imported.map(({ title, collection, rows }) => `- ${title} -> ${collection}: ${rows} data rows`).join('\n'));
if (!writeEnabled && !verifyOnly) {
  console.log('Dry run only. No Firestore data was written.');
  process.exit(0);
}

const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
let writeCount = 0;
for (const sheet of writeEnabled ? imported : []) {
  for (let start = 0; start < sheet.documents.length; start += 500) {
    const writes = sheet.documents.slice(start, start + 500).map((doc) => ({ update: doc }));
    await api(commitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes }) });
    writeCount += writes.length;
    console.log(`Uploaded ${writeCount} documents...`);
  }
}
console.log(`Upload complete: ${writeCount} Firestore documents written.`);

let verifiedCount = 0;
for (const sheet of imported.filter((item) => item.rows > 0)) {
  let pageToken = '';
  let count = 0;
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const listed = await api(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeURIComponent(sheet.collection)}?${query}`);
    count += (listed.documents || []).length;
    pageToken = listed.nextPageToken || '';
  } while (pageToken);
  verifiedCount += count;
  console.log(`Verified ${sheet.collection}: ${count} documents (source rows: ${sheet.rows})`);
}
console.log(`Verification complete: ${verifiedCount} documents present in Firestore.`);
