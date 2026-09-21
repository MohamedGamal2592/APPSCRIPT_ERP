'use strict';
/* Valley Foods HR attachment uploads must be recoverable by request ID.
 * This runs the real ValleyFoods dispatcher, real upload handler, and real
 * request guard against in-memory Sheets/Drive stubs. No external I/O. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const code = fs.readFileSync(path.join(root, 'Code.js'), 'utf8');
const valley = fs.readFileSync(path.join(root, 'Company_ValleyFoods_Actions.js'), 'utf8');

function grab(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing ' + name);
  const end = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

function makeSheet() {
  const rows = [];
  let maxRows = 100;
  return {
    rows,
    hideSheet() {},
    getLastRow: () => rows.length,
    getMaxRows: () => maxRows,
    insertRowsAfter: (at, count) => { maxRows += count; },
    getRange: (r, c, n = 1, w = 1) => ({
      getValues: () => Array.from({ length: n }, (_, i) =>
        Array.from({ length: w }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] === undefined ? '' : rows[r - 1 + i][c - 1 + j])),
      setValues: values => values.forEach((row, i) => {
        rows[r - 1 + i] = rows[r - 1 + i] || [];
        row.forEach((value, j) => { rows[r - 1 + i][c - 1 + j] = value; });
      }),
      createTextFinder: key => ({
        matchEntireCell() { return this; },
        matchCase() { return this; },
        findAll: () => rows.map((row, i) => ({ row, i }))
          .filter(x => x.i >= r - 1 && x.i < r - 1 + n && x.row[c - 1] === key)
          .map(x => ({ getRow: () => x.i + 1 }))
      })
    })
  };
}

const sheets = {};
const folders = {};
const files = [];
const cache = new Map();
let sequence = 0;

function driveList(query) {
  if (query.indexOf('application/vnd.google-apps.folder') !== -1) {
    const match = query.match(/name = '((?:[^'\\]|\\.)*)'/);
    const name = match && match[1].replace(/\\'/g, "'");
    return { files: name && folders[name] ? [{ id: folders[name] }] : [] };
  }
  const parent = query.match(/'([^']+)' in parents/);
  const prop = query.match(/appProperties has \{key='([^']+)' and value='([^']+)'\}/);
  return { files: files.filter(file =>
    (!parent || file.parents.indexOf(parent[1]) !== -1) &&
    (!prop || file.appProperties[prop[1]] === prop[2])
  ).map(file => ({ id: file.id, name: file.name })) };
}

const ctx = {
  console, JSON, Math, Date, Object, Array, String, Number, isNaN, isFinite,
  ERP_MESSAGES: { NOT_AUTHORIZED: 'DENIED' },
  noteMutation_() {},
  rearmRecordCache_() {},
  jsonSafe_: value => JSON.parse(JSON.stringify(value)),
  executeWithLock_: fn => fn(),
  SpreadsheetApp: { flush() {} },
  getSpreadsheet_: dbId => ({
    getSheetByName: name => sheets[dbId + '/' + name] || null,
    insertSheet: name => (sheets[dbId + '/' + name] = makeSheet())
  }),
  getCompanySpreadsheetId_: () => 'vf-db',
  unifiedCheck_: (user, company, page, need) => {
    if (!user || user.company !== company) return false;
    const grants = (user.authorizedPages && user.authorizedPages[page]) || [];
    return need === 'write' ? grants.includes('write') || grants.includes('full') : grants.length > 0;
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()),
    base64Decode: text => Array.from(Buffer.from(String(text), 'base64')),
    base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    newBlob: (bytes, type, name) => ({ getBytes: () => bytes, getContentType: () => type, getName: () => name }),
    getUuid: () => 'uuid' + (++sequence)
  },
  CacheService: { getScriptCache: () => ({
    get: key => cache.has(key) ? cache.get(key) : null,
    put: (key, value) => cache.set(key, value)
  }) },
  ScriptApp: { getOAuthToken: () => 'token' },
  Drive: { Files: {
    list: args => driveList(args.q),
    create: resource => {
      if (resource.mimeType === 'application/vnd.google-apps.folder') {
        const id = 'folder-' + resource.name;
        folders[resource.name] = id;
        return { id };
      }
      const id = 'file-' + (++sequence) + '-abcdefghijklmnop';
      files.push({ id, name: resource.name, parents: resource.parents || [], appProperties: resource.appProperties || {} });
      return { id };
    }
  } },
  UrlFetchApp: { fetch: () => { throw new Error('REST fallback not expected'); } }
};

vm.createContext(ctx);
const headerStart = code.indexOf('var REQUEST_RECEIPT_HEADERS_');
const headerEnd = code.indexOf(';\n', headerStart) + 1;
const guardNames = ['requestGuardIsWrite_', 'requestGuardCanonical_', 'requestGuardHash_',
  'requestGuardReply_', 'requestGuardNotApplied_', 'requestGuardFailedReply_',
  'requestGuardSheet_', 'requestGuardFind_', 'requestGuardExecute_', 'findDriveFileByRequestId_'];
vm.runInContext(code.slice(headerStart, headerEnd) + '\n' + guardNames.map(name => grab(code, name)).join('\n'), ctx);
vm.runInContext(valley, ctx, { filename: 'Company_ValleyFoods_Actions.js' });
vm.runInContext(`
  var __failAfterUpload = false;
  function __invokeUpload(safePayload, guardCtx) {
    var result = ValleyFoods.dispatch_(safePayload, __user, 'vf-db', guardCtx);
    if (__failAfterUpload) { __failAfterUpload = false; throw new Error('response interrupted after Drive write'); }
    return result;
  }
  function __guardUpload(payload) {
    return requestGuardExecute_(payload, __user, 'vf-db', __invokeUpload,
      { recovery: ValleyFoods.requestRecovery_(payload.module_action) });
  }
`, ctx);

const user = {
  email: 'hr@example.test', company: '9940659bd83035d7',
  authorizedPages: { vf_hr_overtime: ['write'] }
};
ctx.__user = user;
const tiny = Buffer.from('overtime-proof').toString('base64');
function request(id, changes) {
  return {
    target_system: '9940659bd83035d7', module_action: 'add_upload_file',
    data: Object.assign({
      sheet: 'valley_emp_overtime', field: 'overtime_attachement',
      filename: 'proof.jpeg', base64: tiny,
      __request_id: id, __request_owner: user.email
    }, changes || {})
  };
}
function guard(payload) {
  ctx.__payload = payload;
  return vm.runInContext('__guardUpload(__payload)', ctx);
}

assert.strictEqual(vm.runInContext("ValleyFoods.requestRecovery_('add_upload_file')", ctx), 'request-id');

const normalId = 'n'.repeat(24);
const normal = guard(request(normalId));
assert.strictEqual(normal.status, 'success');
assert.strictEqual(files.length, 1);
assert.strictEqual(files[0].appProperties.erpRequestId, normalId);

const lostId = 'l'.repeat(24);
ctx.__failAfterUpload = true;
const lost = guard(request(lostId));
assert.strictEqual(lost.code, 'REQUEST_UNCERTAIN');
assert.strictEqual(files.length, 2);
const recovered = guard(request(lostId));
assert.strictEqual(recovered.status, 'success');
assert.strictEqual(recovered.recovered, true);
assert.strictEqual(files.length, 2, 'same request ID must not create a duplicate Drive file');

const invalid = guard(request('e'.repeat(24), { filename: 'proof.exe' }));
assert.strictEqual(invalid.code, 'REQUEST_NOT_APPLIED');
assert.strictEqual(invalid.notApplied, true);
assert.strictEqual(files.length, 2);

ctx.__user = {
  email: 'full@example.test', company: '9940659bd83035d7',
  authorizedPages: { vf_hr_overtime: ['full'] }
};
const full = guard(request('f'.repeat(24), { __request_owner: ctx.__user.email }));
assert.strictEqual(full.status, 'success', 'full permission includes upload/write');

/* Every current Valley Foods attachment destination resolves through the same
 * dynamic dispatcher gate. Reaching the handler's filename validation proves
 * the upload was authorized for its owning page; a wrong-page grant must not. */
const vfDestinations = {
  valley_emp_deductions: 'vf_hr_deductions',
  valley_emp_overtime: 'vf_hr_overtime',
  valley_employee_vacations: 'vf_hr_vacations'
};
function directDispatch(userValue, sheet) {
  ctx.__user = userValue;
  ctx.__directPayload = { module_action: 'add_upload_file', data: { sheet, filename: '' } };
  try { vm.runInContext("ValleyFoods.dispatch_(__directPayload, __user, 'vf-db', {})", ctx); }
  catch (error) { return error; }
  return null;
}
Object.keys(vfDestinations).forEach(sheet => {
  const page = vfDestinations[sheet];
  const error = directDispatch({ company: user.company, authorizedPages: { [page]: ['write'] } }, sheet);
  assert(error && error.message === 'اسم الملف مطلوب', sheet + ' reaches its authorized upload handler');
});
const crossed = directDispatch({ company: user.company, authorizedPages: { vf_hr_deductions: ['write'] } }, 'valley_emp_overtime');
assert(crossed && crossed.message === 'DENIED', 'a grant for one Valley attachment page cannot upload to another');

console.log('vf_hr_upload_recovery: PASS (real module scopes, all VF attachment destinations, request recovery, Drive tagging, no duplicate, confirmed validation, full grant)');
