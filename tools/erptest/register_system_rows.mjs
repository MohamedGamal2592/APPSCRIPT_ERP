// P1 — register the Testing System company in the Firestore system tables.
// Dry run by default (reads only, prints what it WOULD create). Pass --write to commit.
// Auth: same service-account key + JWT pattern as copy_sheet_to_firestore.mjs, scope datastore.
//
//   node tools/erptest/register_system_rows.mjs           # dry run
//   node tools/erptest/register_system_rows.mjs --write    # OWNER RUNS
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const WRITE = process.argv.includes('--write');
const keyPath = 'D:/Work/Script/Fire base json key/erp-project-3cae0-dda88ffaea33.json';
const projectId = 'erp-project-3cae0';
const COMPANY_UID = '37fc50edf1424abd';
const B1 = {
  company_unique_id: COMPANY_UID,
  company_name_ar: 'النظام التجريبي',
  company_name_en: 'Testing System',
  company_sheet_link: '1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE',
  company_colors: 'blue, white',
};
// B5 — the 23 copied pages (et id). The 2 manufacture pages are handled separately.
const COPIED_PAGES = [
  'et_dashboard', 'et_kpi', 'et_analysis_review', 'et_products', 'et_customers',
  'et_purchasing', 'et_purchase_print', 'et_sales', 'et_sales_offer', 'et_sales_print',
  'et_sales_costing_print', 'et_sales_release', 'et_sales_returns', 'et_sales_offer_print',
  'et_sales_analysis', 'et_sales_costing_analysis', 'et_income_statement', 'et_financial_position',
  'et_cash', 'et_cash_report', 'et_customer_statement', 'et_purchase_needs', 'et_product_movement',
];

const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
if (key.project_id !== projectId) throw new Error(`Key project ${key.project_id} != ${projectId}`);
const b64url = (v) => Buffer.from(v).toString('base64url');
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${signer.sign(key.private_key, 'base64url')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}
const token = await accessToken();
const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`API ${r.status} ${url}: ${t}`);
  return t ? JSON.parse(t) : {};
}

function fsToJs(v) {
  if (v == null) return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsToJs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fsToJs(x)]));
  return null;
}
function jsToFs(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(jsToFs) } };
  if (typeof val === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, x]) => [k, jsToFs(x)])) } };
  return { stringValue: String(val) };
}
async function listAll(col) {
  const out = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ pageSize: '300' });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await api(`${BASE}/${encodeURIComponent(col)}?${q}`);
    for (const d of j.documents || []) {
      const id = d.name.split('/').pop();
      out.push({ id, fields: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fsToJs(v)])) });
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
function nextFreeRow(existingIds, start) {
  const nums = existingIds.map((id) => /^row_(\d+)$/.exec(id)).filter(Boolean).map((m) => Number(m[1]));
  let n = start != null ? start : (nums.length ? Math.max(...nums) + 1 : 1);
  const taken = new Set(existingIds);
  while (taken.has('row_' + String(n).padStart(6, '0'))) n++;
  return 'row_' + String(n).padStart(6, '0');
}
const hex16 = () => crypto.randomBytes(8).toString('hex');
const repl = (s) => String(s == null ? '' : s).split('Top Light').join('Testing System');

// ---------- gather ----------
const [companies, sysPages, matrix] = await Promise.all([listAll('ERP_Companies'), listAll('ERP_System_Pages'), listAll('ERP_Pages_Matrix')]);
const planned = []; // {collection, id, fields}

// 1) ERP_Companies
if (!companies.some((d) => d.fields.company_unique_id === COMPANY_UID)) {
  const id = companies.some((d) => d.id === 'row_000006') ? nextFreeRow(companies.map((d) => d.id)) : 'row_000006';
  planned.push({ collection: 'ERP_Companies', id, fields: { ...B1, company_logo: null, company_main_page: null, enabled: true, user: 'm.gamal2363@gmail.com' } });
}

// 2) ERP_System_Pages
const existingPageIds = new Set(sysPages.map((d) => d.fields.page_id));
const usedSysIds = new Set(sysPages.map((d) => d.id));
function reserveSysId() { const id = nextFreeRow([...usedSysIds]); usedSysIds.add(id); return id; }
for (const etId of COPIED_PAGES) {
  if (existingPageIds.has(etId)) continue;
  const tlId = etId.replace(/^et_/, 'tl_');
  const src = sysPages.find((d) => d.fields.page_id === tlId);
  if (!src) { console.error(`WARN: no ERP_System_Pages source for ${tlId} (page ${etId}) — skipped`); continue; }
  const f = { ...src.fields, page_id: etId, page_company: COMPANY_UID };
  if ('page_name' in f) f.page_name = repl(f.page_name);
  planned.push({ collection: 'ERP_System_Pages', id: reserveSysId(), fields: f });
}
if (!existingPageIds.has('et_manufacture'))
  planned.push({ collection: 'ERP_System_Pages', id: reserveSysId(), fields: { page_id: 'et_manufacture', page_name: 'Testing System — التصنيع', page_module: 'Finance', page_company: COMPANY_UID, page_thumbnail: null } });
if (!existingPageIds.has('et_manufacture_print'))
  planned.push({ collection: 'ERP_System_Pages', id: reserveSysId(), fields: { page_id: 'et_manufacture_print', page_name: 'أمر تصنيع', page_module: 'Finance', page_company: COMPANY_UID, page_thumbnail: null } });

// 3) ERP_Pages_Matrix
const pairExists = new Set(matrix.map((d) => d.fields.role + '\u0000' + d.fields.page_id));
const usedMatrixIds = new Set(matrix.map((d) => d.id));
function reserveMatrixId() { const id = nextFreeRow([...usedMatrixIds]); usedMatrixIds.add(id); return id; }
const addMatrix = (role, pageId, access_type, status) => {
  const k = role + '\u0000' + pageId;
  if (pairExists.has(k)) return;
  pairExists.add(k);
  planned.push({ collection: 'ERP_Pages_Matrix', id: reserveMatrixId(), fields: { ERP_Pages_Matrix_unique_id: hex16(), page_id: pageId, role, access_type, status } });
};
for (const d of matrix) {
  const pid = d.fields.page_id;
  if (typeof pid !== 'string' || !pid.startsWith('tl_')) continue;
  const etPid = pid.replace(/^tl_/, 'et_');
  const role = repl(d.fields.role);
  addMatrix(role, etPid, d.fields.access_type, d.fields.status);
  if (etPid === 'et_purchasing') {
    addMatrix(role, 'et_manufacture', d.fields.access_type, d.fields.status);
    addMatrix(role, 'et_manufacture_print', d.fields.access_type, d.fields.status);
  }
}

// ---------- output ----------
const byCol = planned.reduce((m, p) => ((m[p.collection] = (m[p.collection] || 0) + 1), m), {});
console.log('=== PLAN ===');
for (const p of planned) console.log(`${p.collection}/${p.id}:`, JSON.stringify(p.fields));
console.log('=== SUMMARY ===', JSON.stringify(byCol), 'total', planned.length);

if (!WRITE) { console.log(`\nDry run only. ${planned.length} documents to create. Re-run with --write to commit.`); process.exit(0); }

let done = 0;
for (let i = 0; i < planned.length; i += 400) {
  const writes = planned.slice(i, i + 400).map((p) => ({ update: { name: `${BASE}/${p.collection}/${p.id}`, fields: Object.fromEntries(Object.entries(p.fields).map(([k, v]) => [k, jsToFs(v)])) }, currentDocument: { exists: false } }));
  await api(`${BASE}:commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes }) });
  done += writes.length;
  console.log(`committed ${done}/${planned.length}`);
}
console.log(`WROTE ${done} documents.`);
