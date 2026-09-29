// Local, read-only reproduction of etDiscover_ (plan step 0.2 alternative).
// Reads the Testing System and Top Light spreadsheets via the Sheets REST API
// using the service-account key in `Fire base json key/`, scope
// spreadsheets.readonly. It writes NOTHING to any sheet. Output shape matches
// the etDiscover_ Apps Script function so tools/erptest/build_header_map.js can
// consume it. Result is written to tools/erptest/discovery.json.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const keyPath = 'D:/Work/Script/Fire base json key/erp-project-3cae0-dda88ffaea33.json';
const ids = { erp_test: '1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE', top_light: '1xIGriBRv61Mvchv5xezQkxi7pnS64yH5ITwZrk3DjJ4' };
const BOX_TAB = 'erp_test_box_account_codes';
const PROBE_ROWS = 200;   // rows below the header scanned for formulas
const FETCH_ROWS = 300;   // header + probe + sample, capped

const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));

const b64url = (value) => Buffer.from(value).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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

async function api(url) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.text();
  if (!response.ok) throw new Error(`API request failed (${response.status}) ${url}: ${body}`);
  return body ? JSON.parse(body) : {};
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

async function batchValues(spreadsheetId, ranges, renderOption) {
  // Chunk ranges to keep URLs sane.
  const out = [];
  for (let i = 0; i < ranges.length; i += 20) {
    const chunk = ranges.slice(i, i + 20);
    const qs = new URLSearchParams();
    chunk.forEach((r) => qs.append('ranges', r));
    qs.set('majorDimension', 'ROWS');
    qs.set('valueRenderOption', renderOption);
    qs.set('dateTimeRenderOption', 'FORMATTED_STRING');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${qs}`;
    const res = await api(url);
    (res.valueRanges || []).forEach((vr) => out.push(vr.values || []));
  }
  return out;
}

async function discoverSpreadsheet(spreadsheetId) {
  const meta = await api(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent('properties(title,timeZone),sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))')}`);
  const sheetProps = (meta.sheets || []).map((s) => s.properties);
  const ranges = sheetProps.map((p) => {
    const cols = p.gridProperties?.columnCount || 26;
    const rows = Math.min(p.gridProperties?.rowCount || 1000, FETCH_ROWS);
    const q = `'${String(p.title).replaceAll("'", "''")}'`;
    return `${q}!A1:${columnLetters(cols)}${rows}`;
  });
  const formatted = await batchValues(spreadsheetId, ranges, 'FORMATTED_VALUE');
  const formulas = await batchValues(spreadsheetId, ranges, 'FORMULA');

  const sheets = sheetProps.map((p, i) => {
    const fmt = formatted[i] || [];
    const fml = formulas[i] || [];
    const headers = (fmt[0] || []).map((v) => String(v ?? ''));
    const lc = headers.length;
    const lr = fmt.length;
    const probe = Math.min(Math.max(lr - 1, 0), PROBE_ROWS);
    const formulaCols = {};
    for (let c = 0; c < lc; c++) {
      let n = 0, first = '';
      for (let r = 1; r <= probe; r++) {
        const cell = fml[r] ? fml[r][c] : undefined;
        if (typeof cell === 'string' && cell.charAt(0) === '=') { n++; if (!first) first = cell; }
      }
      if (n) formulaCols[headers[c] || ('#' + (c + 1))] = { count: n, first };
    }
    const sample = fmt.slice(1, 3).map((row) => {
      const r = [];
      for (let c = 0; c < lc; c++) r.push(String(row[c] ?? ''));
      return r;
    });
    return { name: p.title, hidden: !!p.hidden, lastRow: lr, lastCol: lc, headers, formulaCols, sample };
  });
  return { title: meta.properties?.title || '', tz: meta.properties?.timeZone || '', sheets };
}

const out = {};
for (const k of Object.keys(ids)) {
  out[k] = await discoverSpreadsheet(ids[k]);
}
// Box codes for P0 check 6.5.
try {
  const box = await batchValues(ids.erp_test, [`'${BOX_TAB}'!A1:Z50`], 'FORMATTED_VALUE');
  out.erp_test_box_values = (box[0] && box[0].length) ? box[0].map((row) => row.map((v) => String(v ?? ''))) : 'MISSING';
} catch (e) {
  out.erp_test_box_values = 'MISSING';
}

await fs.writeFile('D:/Work/Script/tools/erptest/discovery.json', JSON.stringify(out, null, 2), 'utf8');
const counts = Object.keys(ids).map((k) => `${k}: ${out[k].sheets.length} tabs`).join(', ');
console.log(`discovery.json written. ${counts}. box_values: ${out.erp_test_box_values === 'MISSING' ? 'MISSING' : out.erp_test_box_values.length + ' rows'}`);
