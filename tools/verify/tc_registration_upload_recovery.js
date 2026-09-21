'use strict';
/* Focused offline tests: tc_registration_papers attachment upload idempotency.
 * Real Code.js guard + real TopChemical upload/row handlers, stubbed services.
 * Covers: one file + one row on success, lost-response retry recovery with no
 * duplicate, receipt-finalization recovery, confirmed validation failures,
 * ambiguous infra failures staying blocked, concurrent identical uploads,
 * request-ID conflicts, request-ID Drive lookup isolation, and the physical
 * registration folder. Nothing touches a spreadsheet, Drive or the network. */
const fs = require('fs'), vm = require('vm'), assert = require('assert'), crypto = require('crypto'), path = require('path');
const root = path.resolve(__dirname, '../..');
const codeSource = fs.readFileSync(path.join(root, 'Code.js'), 'utf8');
const tcSource = fs.readFileSync(path.join(root, 'Company_TopChemical_Actions.js'), 'utf8');
function grab(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing ' + name);
  const end = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}
function grabNested(source, name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'missing nested ' + name);
  const end = source.indexOf('\n  function ', start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}
function grabConst(source, name) {
  const start = source.indexOf('const ' + name + ' =');
  assert(start >= 0, 'missing const ' + name);
  if (name === 'UPLOAD_META') {
    const end = source.indexOf('\n  };', start);
    assert(end > 0, 'UPLOAD_META end');
    return source.slice(start, end + 4);
  }
  const end = source.indexOf(';\n', start);
  return source.slice(start, end + 1);
}
const CODE_NAMES = ['requestGuardIsWrite_', 'requestGuardCanonical_', 'requestGuardHash_',
  'requestGuardReply_', 'requestGuardNotApplied_', 'requestGuardFailedReply_',
  'requestGuardSheet_', 'requestGuardFind_', 'requestGuardExecute_',
  'findDriveFileByRequestId_', 'attachmentPickFileId_', 'attachmentCachedFileId_',
  'requireAttachmentBinding_', 'ensureAttachmentColumn_', 'extractDriveId_',
  'executeCompanyAction_'];
const TC_NAMES = ['hhmmss_', 'buildUploadName_', 'uniqueDriveName_', 'mimeForExt_',
  'ensureDriveFolderId_', 'uploadDriveFileRest_', 'addUploadFile_',
  'parseDate_', 'productRefs_', 'appendRow_', 'addRegistrationPaper_'];
const TC_CONSTS = ['UPLOAD_META', 'REGISTRATION_SHEET'];
const tinyB64 = Buffer.from('hello-paper').toString('base64');
const bigB64 = Buffer.alloc(11 * 1024 * 1024, 7).toString('base64');
const USER = { email: 'clerk@example.test', company: 'tc', isSuperAdmin: true };

function world() {
  const driveFiles = [];
  const driveFolders = {};
  let fileSeq = 0, uuidN = 0;
  const behavior = { failCreate: '', failList: false, urlFetch: 'throw' };
  const urlCalls = [];
  const cacheMap = new Map();
  const appended = [];
  const shared = { sheets: {}, fail: '' };
  function makeSheet() {
    const rows = [];
    let max = 100;
    return {
      rows, hideSheet() {}, getLastRow: () => rows.length, getMaxRows: () => max,
      insertRowsAfter: (at, n) => { max += n; },
      getRange: (r, c, n = 1, w = 1) => ({
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] === undefined ? '' : rows[r - 1 + i][c - 1 + j])),
        setValues: values => {
          if (shared.fail === 'finish-before' && c === 6) throw Error('receipt completion failure');
          values.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; }); });
        },
        createTextFinder: key => ({ matchEntireCell() { return this; }, matchCase() { return this; }, findAll: () => rows.map((row, i) => ({ row, i })).filter(x => x.i >= r - 1 && x.i < r - 1 + n && x.row[c - 1] === key).map(x => ({ getRow: () => x.i + 1 })) })
      })
    };
  }
  function driveList(q) {
    if (behavior.failList) throw Error('Drive list down');
    if (q.indexOf('application/vnd.google-apps.folder') !== -1) {
      const m = q.match(/name = '((?:[^'\\]|\\.)*)'/);
      const nm = m && m[1].replace(/\\'/g, "'");
      return { files: (nm && driveFolders[nm]) ? [{ id: driveFolders[nm] }] : [] };
    }
    const nm = q.match(/name = '((?:[^'\\]|\\.)*)'/);
    const pm = q.match(/'([^']+)' in parents/);
    const am = q.match(/appProperties has \{key='([^']+)' and value='([^']+)'\}/);
    const hits = driveFiles.filter(f =>
      (!nm || f.name === nm[1].replace(/\\'/g, "'")) &&
      (!pm || (f.parents || []).indexOf(pm[1]) !== -1) &&
      (!am || ((f.appProperties || {})[am[1]] === am[2])) &&
      !f.trashed);
    return { files: hits.map(f => ({ id: f.id, name: f.name })) };
  }
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, isNaN, isFinite,
    noteMutation_() {},
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()),
      base64Decode: s => Array.from(Buffer.from(String(s), 'base64')),
      base64Encode: b => Buffer.from(b).toString('base64'),
      newBlob: (bytes, ct, name) => ({ getBytes: () => bytes, getContentType: () => ct || 'application/octet-stream', getName: () => name }),
      getUuid: () => 'uuid' + (++uuidN)
    },
    CacheService: { getScriptCache: () => ({ get: k => (cacheMap.has(k) ? cacheMap.get(k) : null), put: (k, v) => cacheMap.set(k, v), remove: k => cacheMap.delete(k) }) },
    ScriptApp: { getOAuthToken: () => 'tok' },
    SpreadsheetApp: { flush() {} },
    executeWithLock_: fn => fn(),
    rearmRecordCache_() {},
    jsonSafe_: x => JSON.parse(JSON.stringify(x)),
    getSpreadsheet_: db => ({ getSheetByName: name => shared.sheets[db + '/' + name], insertSheet: name => (shared.sheets[db + '/' + name] = makeSheet()) }),
    getSheet_: () => ({ appendRow: r => appended.push(r), getLastRow: () => appended.length }),
    getHeaders_: () => ['document_name_ar', 'document_name_en', 'product', 'document_number', 'document_type', 'document_start_date', 'document_end_date', 'document_file', 'document_file_id'],
    getAllRecords_: () => [],
    tcRefs_: (dbId, key, fn) => fn(),
    logHistory_: () => {},
    PRODUCTS_SHEET: 'products',
    COMPANY_UID: '3fe1b5cb67b7223e',
    COMPANY_SA_ONLY_RE: /^(edit_|delete_|remove_|update_|toggle_|close_|make_)/,
    ERP_MESSAGES: { NOT_AUTHORIZED: 'denied' },
    canCompanyAction_: () => true,
    checkPageAccess_: () => {},
    getCompanySpreadsheetId_: id => id,
    /* Ported from Code.js (gap-closure Phase 3): executeCompanyAction_
       now resolves the tenant centrally. Self-contained (vm sandboxes cannot
       see sibling stubs by bare name): super-admins target the payload system,
       everyone else is pinned to their own company; getCompanySpreadsheetId_
       is the identity stub here so dbId is the company key the sheet stubs use. */
    resolveDbId_: (authUser, payload) => { if (!authUser) throw Error('denied'); if (authUser.isSuperAdmin) { const t = payload && payload.target_system; if (!t) throw Error('denied'); return String(t); } const c = authUser.company; if (!c) throw Error('denied'); if (payload && payload.target_system && payload.target_system !== c) throw Error('denied'); return String(c); },
    Drive: {
      Files: {
        list: args => driveList(args.q),
        create: (resource, blob) => {
          if (resource.mimeType === 'application/vnd.google-apps.folder') {
            const id = 'fld-' + resource.name;
            driveFolders[resource.name] = id;
            return { id };
          }
          if (behavior.failCreate) throw Error(behavior.failCreate);
          const id = 'F' + String(++fileSeq).padStart(4, '0') + 'X'.repeat(20);
          driveFiles.push({ id, name: resource.name, parents: resource.parents || [], appProperties: resource.appProperties || {} });
          return { id };
        }
      }
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        urlCalls.push({ url, opts });
        if (behavior.urlFetch === 'throw') throw Error('network down');
        if (String(url).indexOf('upload/drive') === -1) {
          /* Read-only Drive query fallback: emulate files.list over the store. */
          const m = String(url).match(/[?&]q=([^&]*)/);
          const listed = driveList(m ? decodeURIComponent(m[1]) : '');
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ files: listed.files }) };
        }
        const body = String((opts && opts.payload) || '');
        const nm = body.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const pm = body.match(/"parents"\s*:\s*\[([^\]]*)\]/);
        const am = body.match(/"appProperties"\s*:\s*(\{[^}]*\})/);
        let props = {};
        try { props = am ? JSON.parse(am[1]) : {}; } catch (e) {}
        const parents = pm ? pm[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean) : [];
        const id = 'U' + String(++fileSeq).padStart(4, '0') + 'X'.repeat(20);
        driveFiles.push({ id, name: nm ? nm[1] : 'u.bin', parents, appProperties: props });
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id }) };
      }
    }
  };
  vm.createContext(ctx);
  const headerVar = codeSource.slice(codeSource.indexOf('var REQUEST_RECEIPT_HEADERS_'), codeSource.indexOf(';\n', codeSource.indexOf('var REQUEST_RECEIPT_HEADERS_')) + 1);
  vm.runInContext(headerVar + '\n' + CODE_NAMES.map(n => grab(codeSource, n)).join('\n'), ctx);
  vm.runInContext(TC_CONSTS.map(n => grabConst(tcSource, n)).join('\n') + '\n' + TC_NAMES.map(n => grabNested(tcSource, n)).join('\n'), ctx);
  ctx.COMPANY_REGISTRY = {
    tc: {
      pageForAction: () => 'tc_registration_papers',
      dispatch: (p, u, d, c) => ctx.addUploadFile_(p.data, u, d, c),
      requestRecovery_: a => (a === 'add_upload_file' ? 'request-id' : '')
    }
  };
  function upReq(id, data) {
    return { target_system: 'tc', module_action: 'add_upload_file', data: Object.assign({ sheet: 'registration_papers', filename: 'paper.pdf', base64: tinyB64, __request_id: id, __request_owner: USER.email }, data) };
  }
  function guard(payload, invoke) {
    return ctx.requestGuardExecute_(payload, USER, 'db', invoke || ((sp, gctx) => ctx.addUploadFile_(sp.data, USER, 'db', gctx)), { recovery: 'request-id' });
  }
  function receipt() {
    const rows = shared.sheets['db/ERP_Request_Receipts'].rows;
    return rows[rows.length - 1];
  }
  return { ctx, shared, driveFiles, driveFolders, urlCalls, cacheMap, appended, behavior, upReq, guard, receipt };
}

/* 1. normal save: one file in the physical folder, tagged, then one row. */
{
  const w = world();
  const id = 'n'.repeat(24);
  const res = w.guard(w.upReq(id));
  assert.strictEqual(res.status, 'success');
  assert(!res.recovered, 'fresh upload is not a recovery');
  assert.ok(res.reference.indexOf('registration_papers 2_Files_/') === 0, 'physical folder, got ' + res.reference);
  assert.ok(/^[A-Za-z0-9_-]{20,}$/.test(res.fileId), 'durable Drive ID');
  assert.strictEqual(w.driveFiles.length, 1, 'exactly one Drive file');
  assert.strictEqual(w.driveFiles[0].appProperties.erpRequestId, id, 'file tagged with the request ID');
  const stored = JSON.stringify(w.receipt()[6] || '');
  assert.ok(stored.length < 1000 && stored.indexOf('base64') === -1, 'receipt stores the small result, never file content');
  const row = w.ctx.addRegistrationPaper_({ document_name_ar: 'ترخيص', document_number: '101', document_type: 'سجل', product: '', document_file: res.reference, document_file_id: res.fileId }, USER, 'db');
  assert.strictEqual(w.appended.length, 1, 'exactly one row');
  assert.strictEqual(w.appended[0][7], res.reference, 'document_file persisted');
  assert.strictEqual(w.appended[0][8], res.fileId, 'document_file_id persisted');
  assert.strictEqual(row.record.document_file_id, res.fileId);
}

/* 2. lost response after Drive creation + same-ID retry: original file, no duplicate. */
{
  const w = world();
  const id = 'l'.repeat(24);
  let calls = 0;
  const flaky = (sp, gctx) => { calls++; const r = w.ctx.addUploadFile_(sp.data, USER, 'db', gctx); if (calls === 1) throw Error('response interrupted after write'); return r; };
  assert.strictEqual(w.guard(w.upReq(id), flaky).code, 'REQUEST_UNCERTAIN');
  assert.strictEqual(w.driveFiles.length, 1);
  const retry = w.guard(w.upReq(id), flaky);
  assert.strictEqual(retry.status, 'success');
  assert.strictEqual(retry.recovered, true, 'retry returns the original upload');
  assert.strictEqual(w.driveFiles.length, 1, 'no duplicate file');
  const first = w.driveFiles[0];
  assert.strictEqual(retry.fileId, first.id);
  assert.strictEqual(retry.reference, 'registration_papers 2_Files_/' + first.name);
  assert.strictEqual(w.guard(w.upReq(id), flaky).deduped, true, 'settled receipt replays');
  assert.strictEqual(calls, 2, 'handler ran for attempt 1 and recovery only');
}

/* 3. receipt-finalization failure after upload is recovered on retry. */
{
  const w = world();
  const id = 'c'.repeat(24);
  w.shared.fail = 'finish-before';
  assert.strictEqual(w.guard(w.upReq(id)).code, 'REQUEST_UNCERTAIN');
  assert.strictEqual(w.driveFiles.length, 1, 'file was created before finalization failed');
  w.shared.fail = '';
  const rows = w.shared.sheets['db/ERP_Request_Receipts'].rows;
  rows[rows.length - 1][7] = new Date(0);
  const retry = w.guard(w.upReq(id));
  assert.strictEqual(retry.status, 'success');
  assert.strictEqual(retry.recovered, true);
  assert.strictEqual(w.driveFiles.length, 1, 'recovery creates no second file');
}

/* 4. invalid extension and oversize files: confirmed non-applied, replayable, nothing created. */
{
  const w = world();
  let runs = 0;
  const counting = (sp, gctx) => { runs++; return w.ctx.addUploadFile_(sp.data, USER, 'db', gctx); };
  const bad = w.guard(w.upReq('e'.repeat(24), { filename: 'evil.exe' }), counting);
  assert.strictEqual(bad.code, 'REQUEST_NOT_APPLIED');
  assert.strictEqual(bad.notApplied, true);
  assert(!bad.uncertain, 'deterministic validation failure is not uncertain');
  assert.strictEqual(w.guard(w.upReq('e'.repeat(24), { filename: 'evil.exe' }), counting).code, 'REQUEST_NOT_APPLIED');
  assert.strictEqual(runs, 1, 'failed receipt never re-executes');
  const big = w.guard(w.upReq('b'.repeat(24), { base64: bigB64 }), counting);
  assert.strictEqual(big.code, 'REQUEST_NOT_APPLIED');
  assert.strictEqual(w.driveFiles.length, 0, 'no file for rejected uploads');
}

/* 5. genuine infra failure stays uncertain and blocked, creating nothing. */
{
  const w = world();
  w.behavior.failCreate = 'Drive down';
  let runs = 0;
  const counting = (sp, gctx) => { runs++; return w.ctx.addUploadFile_(sp.data, USER, 'db', gctx); };
  assert.strictEqual(w.guard(w.upReq('x'.repeat(24)), counting).code, 'REQUEST_UNCERTAIN');
  assert.strictEqual(w.guard(w.upReq('x'.repeat(24)), counting).code, 'REQUEST_UNCERTAIN', 'ambiguous mutation stays blocked');
  assert.strictEqual(w.driveFiles.length, 0);
  assert.strictEqual(runs, 2, 'recovery re-ran but created nothing');
}

/* 6. concurrent identical uploads: one flight, one file. */
{
  const w = world();
  const id = 'k'.repeat(24);
  let runs = 0, nestedCode = '';
  const conc = (sp, gctx) => {
    runs++;
    if (runs === 1) nestedCode = w.guard(w.upReq(id), conc).code;
    return w.ctx.addUploadFile_(sp.data, USER, 'db', gctx);
  };
  const res = w.guard(w.upReq(id), conc);
  assert.strictEqual(nestedCode, 'REQUEST_IN_PROGRESS');
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(runs, 1, 'overlapping duplicate never invokes the handler');
  assert.strictEqual(w.driveFiles.length, 1, 'exactly one file');
}

/* 7. same request ID with different payload: conflict, no second file. */
{
  const w = world();
  const id = 'j'.repeat(24);
  assert.strictEqual(w.guard(w.upReq(id)).status, 'success');
  assert.strictEqual(w.guard(w.upReq(id, { filename: 'other.pdf' })).code, 'REQUEST_ID_CONFLICT');
  assert.strictEqual(w.driveFiles.length, 1);
}

/* 8. request-ID lookup is folder-scoped: same tag elsewhere does not leak across. */
{
  const w = world();
  const tag = 'q'.repeat(24);
  w.driveFolders.B = 'fld-B';
  w.driveFiles.push({ id: 'B' + 'Y'.repeat(24), name: 'paper.pdf', parents: ['fld-B'], appProperties: { erpRequestId: tag } });
  assert.strictEqual(w.ctx.findDriveFileByRequestId_('fld-A', tag), null, 'no global match');
  assert.strictEqual(w.ctx.findDriveFileByRequestId_('fld-B', tag).id, 'B' + 'Y'.repeat(24));
  assert.strictEqual(w.ctx.findDriveFileByRequestId_('fld-B', 'short'), null, 'malformed IDs rejected');
  assert.strictEqual(w.ctx.findDriveFileByRequestId_('', tag), null, 'missing folder rejected');
  w.driveFiles.push({ id: 'B' + 'Z'.repeat(24), name: 'paper2.pdf', parents: ['fld-B'], appProperties: { erpRequestId: tag } });
  assert.strictEqual(w.ctx.findDriveFileByRequestId_('fld-B', tag), null, 'ambiguous tags fail closed');
  const untagged = w.ctx.findDriveFileByRequestId_('fld-B', 'z'.repeat(24));
  assert.strictEqual(untagged, null, 'no filename fallback without a tag');
}

/* 9. REST fallback still tags the file, and recovery finds it. */
{
  const w = world();
  w.behavior.failCreate = 'primary down';
  w.behavior.urlFetch = 'ok';
  const id = 'w'.repeat(24);
  let calls = 0;
  const flaky = (sp, gctx) => { calls++; const r = w.ctx.addUploadFile_(sp.data, USER, 'db', gctx); if (calls === 1) throw Error('response interrupted after write'); return r; };
  assert.strictEqual(w.guard(w.upReq(id), flaky).code, 'REQUEST_UNCERTAIN');
  const uploadCall = w.urlCalls.find(c => c.url.indexOf('upload/drive') !== -1);
  assert.ok(uploadCall, 'fallback was used');
  assert.ok(String(uploadCall.opts.payload).indexOf('erpRequestId') !== -1, 'fallback tags the request');
  assert.strictEqual(w.driveFiles.length, 1);
  const retry = w.guard(w.upReq(id), flaky);
  assert.strictEqual(retry.recovered, true, 'fallback-created file is recoverable');
  assert.strictEqual(w.driveFiles.length, 1);
}

/* 10. end-to-end through executeCompanyAction_: company hook + ctx threading. */
{
  const w = world();
  const id = 't'.repeat(24);
  let blast = 0;
  const realDispatch = w.ctx.COMPANY_REGISTRY.tc.dispatch;
  w.ctx.COMPANY_REGISTRY.tc.dispatch = (p, u, d, c) => {
    assert.ok(c && c.requestId === id, 'handler receives the request ID out-of-band, not in business data');
    blast++;
    const r = realDispatch(p, u, d, c);
    if (blast === 1) throw Error('response interrupted after write');
    return r;
  };
  const first = w.ctx.executeCompanyAction_(w.upReq(id), '', USER);
  assert.strictEqual(first.code, 'REQUEST_UNCERTAIN');
  const rows = w.shared.sheets['tc/ERP_Request_Receipts'].rows;
  rows[rows.length - 1][7] = new Date(0);
  const retry = w.ctx.executeCompanyAction_(w.upReq(id), '', USER);
  assert.strictEqual(retry.status, 'success');
  assert.strictEqual(retry.recovered, true);
  assert.strictEqual(w.driveFiles.length, 1, 'exactly one file across the lost response');
}

/* 11. Every current Top Chemical attachment destination is authorized from
 * its submitted sheet. This exercises the real full-module dispatcher rather
 * than the extracted upload handler used above. */
{
  const auth = {
    console,
    ERP_MESSAGES: { NOT_AUTHORIZED: 'DENIED' },
    getCompanySpreadsheetId_: () => 'tc-db',
    unifiedCheck_: (user, company, page, need) => {
      if (!user || user.company !== company) return false;
      const grants = (user.authorizedPages && user.authorizedPages[page]) || [];
      return need === 'write' ? grants.includes('write') || grants.includes('full') : grants.length > 0;
    }
  };
  vm.createContext(auth);
  vm.runInContext(tcSource, auth, { filename: 'Company_TopChemical_Actions.js' });
  const destinations = {
    products: 'tc_products',
    registration_papers: 'tc_registration_papers',
    purchasing_support_data: 'tc_carton_sizes',
    legal_importation_follow: 'tc_import_follow',
    legal_purchasing_costing: 'tc_budget_inputs',
    legal_product_purchasing: 'tc_budget_inputs',
    legal_manufacture: 'tc_budget_manufacture',
    customs_office_transactions: 'tc_customs_office'
  };
  function direct(user, sheet) {
    auth.__user = user;
    auth.__payload = { module_action: 'add_upload_file', data: { sheet, filename: '' } };
    try { vm.runInContext("TopChemical.dispatch_(__payload, __user, 'tc-db', {})", auth); }
    catch (error) { return error; }
    return null;
  }
  Object.keys(destinations).forEach(sheet => {
    const page = destinations[sheet];
    const error = direct({ company: '3fe1b5cb67b7223e', authorizedPages: { [page]: ['write'] } }, sheet);
    assert(error && error.message === 'اسم الملف مطلوب', sheet + ' reaches its authorized upload handler');
  });
  const fullError = direct({ company: '3fe1b5cb67b7223e', authorizedPages: { tc_products: ['full'] } }, 'products');
  assert(fullError && fullError.message === 'اسم الملف مطلوب', 'full grant includes Top Chemical upload/write');
  const crossed = direct({ company: '3fe1b5cb67b7223e', authorizedPages: { tc_products: ['write'] } }, 'registration_papers');
  assert(crossed && crossed.message === 'DENIED', 'a grant for one Top Chemical attachment page cannot upload to another');
}

console.log('tc_registration_upload_recovery: PASS (all TC attachment destinations, one file + one row, lost-response recovery, finalize recovery, confirmed validation failures, blocked ambiguity, single-flight concurrency, ID conflicts, folder-scoped lookup, REST fallback tagging, end-to-end threading)');
