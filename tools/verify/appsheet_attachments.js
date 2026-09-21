'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const root = path.resolve(__dirname, '../..');
const source = [
  fs.readFileSync(path.join(root, 'Code.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_Assessment_Actions.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_Assessment_Registry.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_TopChemical_Actions.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_TopChemical_Registry.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_TopLight_Actions.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_TopLight_Registry.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_ValleyFoods_Actions.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'Company_ValleyFoods_Registry.js'), 'utf8')
].join('\n');
function grab(name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, 'missing ' + name);
  const next = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, next < 0 ? source.length : next);
}
const names = ['attachmentFileIdField_', 'extractDriveId_', 'recordAttachmentFileId_',
  'attachmentRegistry_', 'attachmentFoldersForField_', 'attachmentTargets_',
  'attachmentTargetMatchesRef_', 'attachmentReferenceFolder_', 'attachmentOpenFile_',
  'findAttachmentRecord_', 'resolveDriveFile_', 'findDriveFolderIdByName_',
  'findDriveFileIdInFolder_', 'findAttachmentFileIdAcrossFolders_',
  'authorizeArtifact_', 'serveAttachment_', 'serveDocFile_', 'servePrintFile_'];
let currentUser, rowsBySheet, folders, files, driveReads, recordReads, accesses;
let mime = 'application/pdf';
const ctx = {
  console,
  ContentService: { createTextOutput: text => ({ error: text }) },
  HtmlService: { createHtmlOutput: text => ({ html: text, setTitle() { return this; } }) },
  _frame: x => x, _topNavScript: () => '', ScriptApp: { getService: () => ({ getUrl: () => '/exec' }) },
  Utilities: { base64Encode: value => Buffer.from(String(value)).toString('base64'), computeDigest: () => [0], DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' } },
  authenticateSystemUser_: () => ({ authorized: !!currentUser, user: currentUser }),
  assertCompanyEnabled_: () => {},
  checkPageAccess_: (user, company, page) => {
    accesses.push({ company, page });
    if (!user || user.denied || user.company !== company) throw Error('Denied');
  },
  getCompanySpreadsheetId_: company => company,
  getAllRecords_: (_, sheet) => { recordReads++; return rowsBySheet[sheet] || []; },
  /* Faithful port of Code.js indexById (Task 1B contract): trimmed
     original + lowercase keys, first match wins, blanks skipped; get/has trim
     the query and fall back to its lowercase form. servePrintFile_ was
     converted to this index (gap-closure Phase 4) so the sandbox must provide it. */
  indexById: (rows, idField) => {
    const want = String(idField == null || idField === '' ? 'id' : idField).trim().toLowerCase() || 'id';
    const raw = new Map();
    if (rows && rows.length) {
      let actual = null;
      for (const k in rows[0]) { if (String(k).trim().toLowerCase() === want) { actual = k; break; } }
      rows.forEach(r => {
        const rv = actual !== null ? r[actual] : (r[want] !== undefined ? r[want] : r[idField]);
        const pk = String(rv == null ? '' : rv).trim();
        if (!pk) return;
        const lc = pk.toLowerCase();
        if (raw.has(pk) || raw.has(lc)) return;
        raw.set(pk, r);
        if (lc !== pk) raw.set(lc, r);
      });
    }
    const norm = q => String(q == null ? '' : q).trim();
    return {
      get: q => { const k = norm(q); return raw.has(k) ? raw.get(k) : raw.get(k.toLowerCase()); },
      has: q => { const k = norm(q); return raw.has(k) || raw.has(k.toLowerCase()); }
    };
  },
  getSheet_: () => { throw Error('Opening attachments must not write/read migration sheets'); },
  CacheService: { getScriptCache: () => { throw Error('Download must not trust the upload cache'); } },
  attachmentPreviewHtml_: name => ({ kind: 'preview', name }),
  dataUriDownloadHtml_: name => ({ kind: 'download', name })
};
function iterator(values) { const copy = values.slice(); return { hasNext: () => copy.length > 0, next: () => copy.shift() }; }
ctx.DriveApp = {
  getFoldersByName: name => { driveReads++; return iterator((folders[name] || []).map(id => ({ getId: () => id }))); },
  getFolderById: folder => ({ getFilesByName: name => { driveReads++; return iterator((files[folder + '/' + name] || []).map(id => ({ getId: () => id }))); } }),
  getFileById: id => { driveReads++; if (id === 'X'.repeat(25)) throw Error('Unavailable'); return { getId: () => id, getName: () => id, getBlob: () => ({ getContentType: () => mime, getBytes: () => [80, 75, 3, 4] }) }; }
};
vm.createContext(ctx); vm.runInContext(source, ctx, { filename: 'canonical-attachment-runtime.js' });
Object.assign(ctx, {
  authenticateSystemUser_: () => ({ authorized: !!currentUser, user: currentUser }),
  assertCompanyEnabled_: () => {},
  checkPageAccess_: (user, company, page) => { accesses.push({ company, page }); if (!user || user.denied || user.company !== company) throw Error('Denied'); },
  getCompanySpreadsheetId_: company => company,
  getAllRecords_: (_, sheet) => { recordReads++; return rowsBySheet[sheet] || []; },
  getSheet_: () => { throw Error('Opening attachments must not write/read migration sheets'); },
  CacheService: { getScriptCache: () => { throw Error('Download must not trust the upload cache'); } },
  HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }, createHtmlOutput: text => ({ html: text, setXFrameOptionsMode() { return this; }, setTitle() { return this; } }) },
  attachmentPreviewHtml_: name => ({ kind: 'preview', name }),
  dataUriDownloadHtml_: name => ({ kind: 'download', name })
});
ctx.__attFrame = ctx._frame;
ctx.__attPreview = ctx.attachmentPreviewHtml_;
ctx.__attDownload = ctx.dataUriDownloadHtml_;
vm.runInContext('_frame = globalThis.__attFrame; attachmentPreviewHtml_ = globalThis.__attPreview; dataUriDownloadHtml_ = globalThis.__attDownload;', ctx);
vm.runInContext('COMPANY_REGISTRY = {}; _companiesInitialized_ = false; ensureCompaniesRegistered_();', ctx);
function setup(cfg, target, field, folder) {
  currentUser = { company: cfg.company }; accesses = []; driveReads = 0; recordReads = 0;
  const ref = folder + '/تسجيل Top One.' + field + '.103330.pdf';
  const record = { [target.idField]: '1', [field]: ref };
  rowsBySheet = { [target.sheet]: [record] };
  const physicalFolder = folder === 'registration_papers_Files_' ? 'registration_papers 2_Files_' : folder;
  folders = { [physicalFolder]: ['folder-id'] };
  files = { ['folder-id/' + ref.split('/').pop()]: ['F'.repeat(25)] };
  return { record, ref, params: { sessionToken: 'fake', id: '1', sheet: target.sheet, field } };
}
let tables = 0, fieldCases = 0, aliasCases = 0;
const registry = ctx.attachmentRegistry_();
for (const [page, cfg] of Object.entries(registry)) {
  for (const target of ctx.attachmentTargets_(cfg)) {
    tables++;
    for (const field of target.fileFields) {
      fieldCases++;
      for (const folder of ctx.attachmentFoldersForField_(target, field)) {
        aliasCases++;
        const fixture = setup(cfg, target, field, folder);
        fixture.params.page = page; fixture.params.ref = fixture.ref;
        mime = aliasCases % 3 === 0 ? 'application/zip' : aliasCases % 3 === 1 ? 'image/png' : 'application/pdf';
        const result = ctx.serveAttachment_(fixture.params);
        assert.strictEqual(result.name, 'F'.repeat(25), page + '/' + field + '/' + folder);
        assert.strictEqual(result.kind, mime === 'application/zip' ? 'download' : 'preview');
        assert.strictEqual(accesses[0].page, page);
        // Older AppSheet links identify the page/table from the full stored path.
        const legacy = ctx.serveDocFile_({ sessionToken: 'fake', ref: fixture.ref });
        assert.strictEqual(legacy.name, 'F'.repeat(25), 'legacy ref-only link ' + folder);
      }
    }
  }
}
const cfg = registry.tc_registration_papers, field = 'document_file';
let fixture = setup(cfg, cfg, field, 'registration_papers_Files_');
fixture.params.page = 'tc_registration_papers';
// The current user reported this exact path; no migration or ID column is needed to open it.
fixture.record.document_file = 'registration_papers_Files_/تسجيل توب وانTop One.document_file.103330.pdf';
files = { 'folder-id/تسجيل توب وانTop One.document_file.103330.pdf': ['F'.repeat(25)] };
assert.strictEqual(ctx.serveAttachment_(fixture.params).name, 'F'.repeat(25), 'legacy registration path opens from renamed Drive folder when old folder does not exist');
assert.strictEqual(fixture.record.document_file, 'registration_papers_Files_/تسجيل توب وانTop One.document_file.103330.pdf', 'stored AppSheet reference is unchanged');
folders.registration_papers_Files_ = ['wrong-old-folder'];
files['wrong-old-folder/تسجيل توب وانTop One.document_file.103330.pdf'] = ['W'.repeat(25)];
assert.strictEqual(ctx.serveAttachment_(fixture.params).name, 'F'.repeat(25), 'an old-name decoy cannot override the explicit physical folder mapping');
fixture.record.document_file_id = 'S'.repeat(25); folders = {};
assert.strictEqual(ctx.serveAttachment_(fixture.params).name, 'S'.repeat(25), 'durable ID takes precedence');
fixture.record.document_file_id = 'X'.repeat(25);
assert(ctx.serveAttachment_(fixture.params).error, 'inaccessible ID must not switch to a different same-named file');
fixture.record.document_file_id = 'invalid-id';
assert(ctx.serveAttachment_(fixture.params).error, 'invalid saved ID must fail');
fixture = setup(cfg, cfg, field, 'registration_papers_Files_'); fixture.params.page = 'tc_registration_papers';
folders['registration_papers 2_Files_'] = ['folder-1', 'folder-2'];
assert(ctx.serveAttachment_(fixture.params).error, 'ambiguous folders fail');
fixture = setup(cfg, cfg, field, 'registration_papers_Files_'); fixture.params.page = 'tc_registration_papers';
files['folder-id/' + fixture.ref.split('/').pop()] = ['F'.repeat(25), 'G'.repeat(25)];
assert(ctx.serveAttachment_(fixture.params).error, 'ambiguous filenames fail');
fixture = setup(cfg, cfg, field, 'registration_papers_Files_'); fixture.params.page = 'tc_registration_papers';
fixture.params.ref = 'registration_papers_Files_/unrelated.pdf';
assert(ctx.serveAttachment_(fixture.params).error); assert.strictEqual(driveReads, 0, 'mismatched ref must fail before Drive access');
delete fixture.params.ref;
fixture.params.company = registry.vf_hr_overtime.company;
assert(ctx.serveAttachment_(fixture.params).error); assert.strictEqual(driveReads, 0);
delete fixture.params.company;
currentUser.denied = true;
assert(ctx.serveAttachment_(fixture.params).error); assert.strictEqual(driveReads, 0);
currentUser = null;
assert(ctx.serveAttachment_(fixture.params).html !== undefined); assert.strictEqual(driveReads, 0);
fixture = setup(cfg, cfg, field, 'registration_papers_Files_'); fixture.params.page = 'tc_registration_papers';
fixture.params.field = 'private_field'; assert(ctx.serveAttachment_(fixture.params).error); assert.strictEqual(driveReads, 0);
fixture.params.field = field; fixture.record.document_file = '../secret.pdf';
assert(ctx.serveAttachment_(fixture.params).error); assert.strictEqual(driveReads, 0);
fixture.record.document_file = 'registration_papers_Files_/nested/secret.pdf';
assert(ctx.serveAttachment_(fixture.params).error); assert.strictEqual(driveReads, 0);
fixture = setup(registry.tc_products, registry.tc_products, 'print_file', 'products_Files_');
assert.strictEqual(ctx.servePrintFile_({ sessionToken:'fake', id:'1' }).name, 'F'.repeat(25), 'print files use the same legacy resolver');
// A field must be explicit when a record has several attachments and no ref.
const importCfg = registry.tc_import_follow;
fixture = setup(importCfg, importCfg, 'porforma_file', 'legal_importation_follow_Files_');
fixture.record.swift_file = 'legal_importation_follow_Files_/swift.pdf';
assert(ctx.serveAttachment_({sessionToken:'fake',page:'tc_import_follow',id:'1'}).error);
assert.strictEqual(driveReads, 0);
// Execute real page URL builders: both stable identity and the exact path must survive.
function pageFunction(html, name) {
  const start = html.indexOf('function ' + name + '('); assert(start >= 0, name);
  for (let end = html.indexOf('}', start); end >= 0; end = html.indexOf('}', end + 1)) {
    const candidate = html.slice(start, end + 1);
    try { new vm.Script('(' + candidate + ')'); return candidate; } catch (_) {}
  }
  throw Error('Cannot extract ' + name);
}
const builders = [
  ['Company_TopChemical_RegistrationPapers.html', 'viewAttachment'],
  ['Company_TopChemical_BudgetInputs.html', 'viewAttachment', 'legal_product_purchasing', 'صورة التسجيل'],
  ['Company_TopChemical_BudgetManufacture.html', 'viewAttachment', null, 'registration'],
  ['Company_TopChemical_CartonSizes.html', 'downloadRef'],
  ['Company_TopChemical_CustomsOffice.html', 'fileLink', null, 'تكليف المطالبة'],
  ['Company_TopChemical_ImportFollow.html', 'downloadRef', null, 'swift_file'],
  ['Company_ValleyFoods_Deductions.html', 'viewAttachment'],
  ['Company_ValleyFoods_Overtime.html', 'viewAttachment'],
  ['Company_ValleyFoods_Vacations.html', 'viewAttachment']
];
for (const [file, name, sheet, fieldName] of builders) {
  let opened = '';
  const browser = {scriptUrl:'https://example.invalid/exec',SESSION_TOKEN:'fake',UIC:{openDownload:u=>{opened=u;}},esc:x=>x};
  const fn = vm.runInNewContext('(' + pageFunction(fs.readFileSync(path.join(root,file),'utf8'),name) + ')',browser);
  const ref = 'folder/تسجيل Top One.pdf';
  const result = sheet ? fn(ref,'key/1',sheet,fieldName) : fn(ref,'key/1',fieldName);
  if (name === 'fileLink') opened = result.match(/href="([^"]+)"/)[1];
  const parsed = new URL(opened);
  assert.strictEqual(parsed.searchParams.get('ref'),ref,file+' must send exact reference even with id');
  assert.strictEqual(parsed.searchParams.get('id'),'key/1',file+' must preserve record identity');
  if (sheet) assert.strictEqual(parsed.searchParams.get('sheet'),sheet);
  if (fieldName) assert.strictEqual(parsed.searchParams.get('field'),fieldName);
}
assert.strictEqual(tables, 11);
console.log('appsheet_attachments: PASS (' + tables + ' tables, ' + fieldCases + ' fields, ' + aliasCases + ' folder cases; auth, exact paths, previews, downloads, no migration writes)');
