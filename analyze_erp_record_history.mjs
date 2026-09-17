import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const keyPath = 'D:/Work/Script/Fire base json key/erp-project-3cae0-dda88ffaea33.json';
const spreadsheetId = '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM';
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
const b64url = (value) => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
}))}`;
const signer = crypto.createSign('RSA-SHA256');
signer.update(unsigned);
const assertion = `${unsigned}.${signer.sign(key.private_key, 'base64url')}`;
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
if (!tokenResponse.ok) throw new Error(await tokenResponse.text());
const token = (await tokenResponse.json()).access_token;
async function api(url) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.text();
  if (!response.ok) throw new Error(`API ${response.status}: ${body}`);
  return JSON.parse(body);
}
const range = encodeURIComponent("'ERP_Record_History'!A1:Z10000");
const data = await api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
const rows = data.values || [];
const headers = rows[0] || [];
const createdIndex = headers.indexOf('created_at');
const changedIndex = headers.indexOf('changed_at');
const dateIndex = createdIndex >= 0 ? createdIndex : changedIndex;
if (dateIndex < 0) throw new Error(`No created_at/changed_at column. Headers: ${headers.join(', ')}`);
const dates = rows.slice(1).map((row) => row[dateIndex]).filter((value) => typeof value === 'number').map((serial) => new Date(Date.UTC(1899, 11, 30) + serial * 86400000));
if (!dates.length) throw new Error('No numeric timestamps found');
const dayKey = (date) => date.toISOString().slice(0, 10);
const byDay = new Map();
for (const date of dates) byDay.set(dayKey(date), (byDay.get(dayKey(date)) || 0) + 1);
const sortedDays = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const min = dates.reduce((a, b) => a < b ? a : b);
const max = dates.reduce((a, b) => a > b ? a : b);
const spanDays = Math.max(1, Math.ceil((max - min) / 86400000) + 1);
const average = dates.length / spanDays;
const lastDay = new Date(max);
const since = (days) => dates.filter((date) => (lastDay - date) < days * 86400000).length;
console.log(JSON.stringify({
  rows: dates.length,
  timestampColumn: headers[dateIndex],
  firstDate: dayKey(min),
  lastDate: dayKey(max),
  spanDays,
  averageRowsPerDay: Number(average.toFixed(2)),
  last7DaysRows: since(7),
  last30DaysRows: since(30),
  peakDay: sortedDays.reduce((best, item) => item[1] > best[1] ? item : best, sortedDays[0]),
  dailyCounts: sortedDays,
}, null, 2));
