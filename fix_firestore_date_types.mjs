import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const flags = new Set(process.argv.slice(2));
const writeEnabled = flags.has('--write');
const startIndexArg = process.argv.find((arg) => arg.startsWith('--start-index='));
const startIndex = startIndexArg ? Math.max(0, Number(startIndexArg.split('=')[1]) || 0) : 0;
const batchSizeArg = process.argv.find((arg) => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? Math.max(1, Number(batchSizeArg.split('=')[1]) || 25) : 100;
const keyPath = 'D:/Work/Script/Fire base json key/erp-project-3cae0-dda88ffaea33.json';
const spreadsheetId = '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM';
const projectId = 'erp-project-3cae0';

const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
const b64url = (value) => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/datastore',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
}))}`;
const signer = crypto.createSign('RSA-SHA256');
signer.update(unsigned);
const assertion = `${unsigned}.${signer.sign(key.private_key, 'base64url')}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
});
if (!tokenResponse.ok) throw new Error(`Token request failed: ${await tokenResponse.text()}`);
const token = (await tokenResponse.json()).access_token;

async function api(url, options = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let response;
    try {
      response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) } });
    } catch (error) {
      if (attempt === 7) throw error;
      const waitMs = Math.min(60000, 5000 * (2 ** attempt));
      console.log(`Transient network error; retrying in ${waitMs} ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    const body = await response.text();
    if (response.ok) return body ? JSON.parse(body) : {};
    if (response.status === 429 || response.status === 500 || response.status === 503) {
      const waitMs = Math.min(60000, 5000 * (2 ** attempt));
      console.log(`Transient API status ${response.status}; retrying in ${waitMs} ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    throw new Error(`API request failed (${response.status}) ${url}: ${body}`);
  }
  throw new Error(`API request repeatedly failed after retries: ${url}`);
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

function firestoreValue(value) {
  return { timestampValue: value };
}

function fieldName(header, index) {
  const clean = String(header ?? '').trim();
  return clean || `column_${index + 1}`;
}

function uniqueHeaders(row) {
  const used = new Map();
  return row.map((value, index) => {
    const base = fieldName(value, index);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base}_${count + 1}` : base;
  });
}

function collectionName(title, index) {
  const clean = String(title).trim().replace(/[^A-Za-z0-9_\-]/g, '_').replace(/^_+|_+$/g, '');
  return clean || `sheet_${index + 1}`;
}

function quoteFieldPath(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `\`${name.replaceAll('`', '``')}\``;
}

// Google Sheets stores dates as serial days from 1899-12-30. This produces a UTC
// timestamp for the displayed wall-clock time in the spreadsheet timezone.
function serialToTimestamp(serial, timeZone) {
  const wholeDays = Math.floor(serial);
  const fraction = serial - wholeDays;
  const base = Date.UTC(1899, 11, 30) + wholeDays * 86400000 + Math.round(fraction * 86400000);
  const provisional = new Date(base);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(provisional);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offset = wallClockAsUtc - base;
  return new Date(base - offset).toISOString();
}

const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
const metadata = await api(`${base}?includeGridData=true&fields=properties(timeZone),sheets(properties(title,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat(type,pattern))))))`);
const timeZone = metadata.properties?.timeZone || 'Etc/UTC';
const sheets = metadata.sheets || [];
console.log(`Spreadsheet timezone: ${timeZone}`);

const fixes = [];
for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
  const sheet = sheets[sheetIndex];
  const props = sheet.properties;
  const rows = sheet.data?.[0]?.rowData || [];
  const headers = uniqueHeaders((rows[0]?.values || []).map((cell) => cell.formattedValue ?? cell.effectiveValue?.stringValue ?? cell.effectiveValue?.numberValue ?? ''));
  const dateCells = new Map();
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]?.values || [];
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      const type = cell.effectiveFormat?.numberFormat?.type;
      const serial = cell.effectiveValue?.numberValue;
      if ((type === 'DATE' || type === 'DATE_TIME') && typeof serial === 'number') {
        const timestamp = serialToTimestamp(type === 'DATE' ? Math.floor(serial) : serial, timeZone);
        if (!dateCells.has(c)) dateCells.set(c, { field: headers[c] || `column_${c + 1}`, type, count: 0, samples: [] });
        const info = dateCells.get(c);
        info.count++;
        if (info.samples.length < 2) info.samples.push({ row: r + 1, displayed: cell.formattedValue, timestamp });
        const rowNumber = r + 1;
        const collection = collectionName(props.title, sheetIndex);
        const docKey = `${collection}/${`row_${String(rowNumber + 1).padStart(6, '0')}`}`;
        let fix = fixes.find((item) => item.docKey === docKey);
        if (!fix) { fix = { docKey, fields: {}, fieldPaths: new Set() }; fixes.push(fix); }
        fix.fields[info.field] = firestoreValue(timestamp);
        fix.fieldPaths.add(quoteFieldPath(info.field));
      }
    }
  }
  if (dateCells.size) {
    console.log(`${props.title}: ${[...dateCells.values()].map((x) => `${x.field} (${x.type}, ${x.count})`).join(', ')}`);
    for (const info of dateCells.values()) console.log(`  ${info.field} samples: ${JSON.stringify(info.samples)}`);
  }
}

console.log(`Date/time documents needing conversion: ${fixes.length}`);
if (!writeEnabled) {
  console.log('Dry run only. No Firestore data was changed.');
  process.exit(0);
}

const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
let written = startIndex;
for (let start = startIndex; start < fixes.length; start += batchSize) {
  const writes = fixes.slice(start, start + batchSize).map((fix) => ({
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${fix.docKey}`,
      fields: fix.fields,
    },
    updateMask: { fieldPaths: [...fix.fieldPaths] },
  }));
  await api(commitUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes }) });
  written += writes.length;
  console.log(`Updated ${written} documents...`);
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
console.log(`Date/time conversion complete: ${written} documents updated.`);
