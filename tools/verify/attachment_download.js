'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = [
  fs.readFileSync('D:/Work/Script/Code.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_Assessment_Actions.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_Assessment_Registry.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_TopChemical_Actions.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_TopChemical_Registry.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_TopLight_Actions.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_TopLight_Registry.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_ValleyFoods_Actions.js', 'utf8'),
  fs.readFileSync('D:/Work/Script/Company_ValleyFoods_Registry.js', 'utf8')
].join('\n');
function grab(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  const next = source.indexOf('\nfunction ', start + 10);
  return source.slice(start, next < 0 ? source.length : next);
}const names = ['attachmentFileIdField_','attachmentCachedFileId_','attachmentPickFileId_','attachmentRegistry_','ensureAttachmentColumn_','extractDriveId_','recordAttachmentFileId_','attachmentAuthorizedStoredId_','findAttachmentRecord_','resolveDriveFile_','serveAttachment_','findDriveFolderIdByName_','findDriveFileIdInFolder_','attachmentReferenceFolder_','attachmentFoldersForField_','attachmentTargets_','attachmentTargetMatchesRef_','attachmentOpenFile_','backfillAttachmentIds_'];
const ctx = { console, Math, Number, String, Object, Array, Date, JSON, isNaN, isFinite };
ctx.CacheService = { getScriptCache: () => ({ get: key => key === 'attid_folder-B/unrelated.pdf' ? 'Z'.repeat(25) : '' }) };
ctx.ContentService = { createTextOutput: value => String(value) };
ctx.authenticateSystemUser_ = () => ({ authorized: true, user: { isSuperAdmin: true, company: '3fe1b5cb67b7223e' } });
ctx.authorizeArtifact_ = () => ({ company: '3fe1b5cb67b7223e' });
ctx.getCompanySpreadsheetId_ = () => 'db';
ctx.noteMutation_ = () => {};
ctx.getHeaders_ = sheet => sheet.headers;
ctx.getAllRecords_ = () => [{ document_number: 1, document_file: 'folder-A/same.pdf' }];
ctx.getSheet_ = () => ctx.fakeSheet;
ctx.DriveApp = {
  getFoldersByName: () => ({ hasNext: () => true, next: () => ({ getId: () => 'folder-1' }) }),
  getFolderById: () => ({ getFilesByName: () => ({ hasNext: () => true, next: () => ({ getId: () => 'file-1' }) }) }),
  getFileById: id => ({ getBlob: () => ({ getContentType: () => 'text/plain' }), getName: () => id })
};
ctx.Drive = { Files: { list: () => ({ files: [] }) } };
ctx._frame = x => x;
ctx.HtmlService = { createHtmlOutput: x => x };
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'canonical-attachment-runtime.js' });
Object.assign(ctx, {
  authenticateSystemUser_: () => ({ authorized: true, user: { isSuperAdmin: true, company: '3fe1b5cb67b7223e' } }),
  authorizeArtifact_: () => ({ company: '3fe1b5cb67b7223e' }),
  getCompanySpreadsheetId_: () => 'db',
  noteMutation_: () => {},
  getHeaders_: sheet => sheet.headers,
  getAllRecords_: () => [{ document_number: 1, document_file: 'folder-A/same.pdf' }],
  getSheet_: () => ctx.fakeSheet,
  _frame: x => x,
  HtmlService: { createHtmlOutput: x => x }
});
vm.runInContext('COMPANY_REGISTRY = {}; _companiesInitialized_ = false; ensureCompaniesRegistered_();', ctx);

const rows = [{ id: 1, document: 'folder-A/same.pdf' }, { id: 2, document: 'folder-B/same.pdf' }];
assert.strictEqual(ctx.findAttachmentRecord_(rows, 'id', '', ['document'], 'folder-B/same.pdf').record.id, 2, 'exact path must select the owning record');
assert.strictEqual(ctx.attachmentPickFileId_({ document: 'folder-A/upload.pdf', document_id: 'Q'.repeat(25) }, 'document'), '', 'arbitrary client IDs must not be accepted without exact upload binding');
assert.strictEqual(ctx.findAttachmentRecord_(rows, 'id', '', ['document'], 'same.pdf'), null, 'basename-only fallback must be disabled');
assert.strictEqual(ctx.findAttachmentRecord_(rows, 'id', '999', ['document'], 'folder-B/same.pdf'), null, 'missing explicit record must not fall through to another record');
assert.strictEqual(ctx.findAttachmentRecord_([{ id: 1, document: 'same.pdf' }, { id: 2, document: 'same.pdf' }], 'id', '', ['document'], 'same.pdf').ambiguous, true, 'duplicate exact refs must be rejected');
ctx.DriveApp.getFoldersByName = () => ({ values: ['folder-1', 'folder-2'], hasNext() { return this.values.length > 0; }, next() { return { getId: () => this.values.shift() }; } });
assert.strictEqual(ctx.findDriveFolderIdByName_('duplicate'), '', 'duplicate folder names must not resolve');
ctx.DriveApp.getFoldersByName = () => ({ values: ['folder-1'], hasNext() { return this.values.length > 0; }, next() { return { getId: () => this.values.shift() }; } });
ctx.DriveApp.getFolderById = () => ({ getFilesByName: () => ({ values: ['file-1', 'file-2'], hasNext() { return this.values.length > 0; }, next() { return { getId: () => this.values.shift() }; } }) });
assert.strictEqual(ctx.findDriveFileIdInFolder_('folder-1', 'duplicate.pdf'), '', 'duplicate file names must not resolve');

let dryWrites = 0;
ctx.fakeSheet = { headers: ['document_number', 'document_file'], getDataRange: () => ({ getValues: () => [['document_number', 'document_file'], [1, 'registration_papers 2_Files_/legacy.pdf']] }), getRange: () => ({ getValue: () => '', setValue: () => { dryWrites++; } }), getLastRow: () => 2 };
ctx.DriveApp.getFolderById = () => ({ getFilesByName: () => ({ values: ['F'.repeat(25)], hasNext() { return this.values.length > 0; }, next() { return { getId: () => this.values.shift() }; } }) });
const dry = ctx.backfillAttachmentIds_({ dryRun: true, page: 'tc_registration_papers' }, null, { isSuperAdmin: true });
const stat = dry.summary.pages['tc_registration_papers/registration_papers'];
assert.strictEqual(stat.wouldUpdate, 1, 'dry-run must count a proposed association without an ID column');
assert.strictEqual(JSON.stringify(stat.missingIdColumns), JSON.stringify(['document_file_id']), 'dry-run must report the required missing ID column');
assert.strictEqual(stat.updated, 0, 'dry-run must not write');
assert.strictEqual(dryWrites, 0, 'dry-run must perform no cell writes');

ctx.getAllRecords_ = () => [{ document_number: 1, document_file: 'folder-A/same.pdf' }];
ctx.DriveApp.getFolderById = () => ({ getFilesByName: () => ({ hasNext: () => false }) });
const wrongRef = ctx.serveAttachment_({ sessionToken: 't', page: 'tc_registration_papers', id: '1', ref: 'folder-B/unrelated.pdf' });
assert.match(wrongRef, /does not belong/);
const unrelatedCache = ctx.serveAttachment_({ sessionToken: 't', page: 'tc_registration_papers', id: '1' });
assert.match(unrelatedCache, /مسار المرفق/);

// Additional live-contract regressions: exact field must select its own durable ID.
ctx.attachmentPreviewHtml_ = name => name;
ctx.dataUriDownloadHtml_ = name => name;
ctx.getAllRecords_ = () => [{ id: 1, porforma_file: 'folder/first.pdf', porforma_file_id: 'A'.repeat(25), swift_file: 'folder/second.pdf', swift_file_id: 'B'.repeat(25) }];
ctx.DriveApp.getFileById = id => ({ getBlob: () => ({ getContentType: () => 'text/plain' }), getName: () => id });
assert.strictEqual(ctx.serveAttachment_({ sessionToken: 't', page: 'tc_import_follow', id: '1', ref: 'folder/second.pdf', field: 'swift_file' }), 'B'.repeat(25), 'id+ref must resolve the exact field ID');

// Cache-expired existing edits may reuse only the ID already stored on the authorized record.
const existingId = 'C'.repeat(25);
ctx.getAllRecords_ = () => [{ document_number: 1, document_file: 'folder-existing/existing.pdf', document_file_id: existingId }];
assert.strictEqual(ctx.attachmentPickFileId_({ document_file: 'folder-existing/existing.pdf', document_file_id: existingId }, 'document_file'), '', 'expired cache must not make the generic picker trust a client ID');
assert.strictEqual(ctx.attachmentAuthorizedStoredId_('db', 'registration_papers', { document_file: 'folder-existing/existing.pdf', document_file_id: existingId }, 'document_file', existingId), existingId, 'server stored-record validation must preserve an unchanged attachment');



// Apply-path regression: bounded migration adds a missing ID column and writes once.
let applyWrites = 0;
let applyHeaders = ['document_number', 'document_file'];
let applyRow = [1, 'registration_papers 2_Files_/legacy.pdf'];
ctx.getHeaders_ = sheet => sheet.headers;
ctx.fakeSheet = {
  get headers() { return applyHeaders; },
  getDataRange: () => ({ getValues: () => [applyHeaders.slice(), applyRow.slice()] }),
  getRange: (row, col, numRows, numCols) => ({
    getValue: () => applyRow[col - 1] || '',
    getValues: () => [applyRow.concat(['']).slice(0, numCols)],
    setValue: value => { applyWrites++; if (row === 1) { applyHeaders.push(String(value)); } else { applyRow[col - 1] = value; } }
  }),
  getLastRow: () => 2
};
ctx.DriveApp.getFolderById = () => ({ getFilesByName: () => ({ values: ['F'.repeat(25)], hasNext() { return this.values.length > 0; }, next() { return { getId: () => this.values.shift() }; } }) });
const applied = ctx.backfillAttachmentIds_({ dryRun: false, page: 'tc_registration_papers', limit: 1 }, null, { isSuperAdmin: true });
const applyStat = applied.summary.pages['tc_registration_papers/registration_papers'];
assert.strictEqual(applyStat.updated, 1, 'apply migration must write the proposed association');
assert.strictEqual(applyRow[2], 'F'.repeat(25), 'apply migration must persist the resolved ID');
assert.ok(applyWrites >= 2, 'apply migration must record header and ID writes');

// Frontend/backend contract checks for the previously broken pages.
const topSource = fs.readFileSync('D:/Work/Script/Company_TopChemical_Actions.js', 'utf8');
const budgetHtml = fs.readFileSync('D:/Work/Script/Company_TopChemical_BudgetInputs.html', 'utf8');
const customsHtml = fs.readFileSync('D:/Work/Script/Company_TopChemical_CustomsOffice.html', 'utf8');
assert.match(budgetHtml, /viewAttachment\([^\n]+legal_product_purchasing/,'purchasing-line buttons must carry the child sheet');
assert.match(customsHtml, /data\.claim_assignment_id[\s\S]*data\.shipment_clearance_id/,'customs upload IDs must reach the save payload');
assert.match(topSource, /claimAssignmentId[\s\S]*shipmentClearanceId[\s\S]*customsUid/,'customs save must persist both IDs and server identity');



// Concurrency regression: a source-reference edit between preview and apply is skipped.
let conflictWrites = 0;
let conflictHeaders = ['document_number', 'document_file'];
let conflictRow = [1, 'registration_papers 2_Files_/legacy.pdf'];
ctx.fakeSheet = {
  get headers() { return conflictHeaders; },
  getDataRange: () => ({ getValues: () => [conflictHeaders.slice(), conflictRow.slice()] }),
  getRange: (row, col, numRows, numCols) => ({
    getValues: () => row === 2 ? [[1, 'registration_papers 2_Files_/changed.pdf', '']].slice(0, 1) : [conflictRow.slice()],
    getValue: () => conflictRow[col - 1] || '',
    setValue: value => { conflictWrites++; if (row === 1) conflictHeaders.push(String(value)); else conflictRow[col - 1] = value; }
  })
};
ctx.DriveApp.getFolderById = () => ({ getFilesByName: () => ({ values: ['G'.repeat(25)], hasNext() { return this.values.length > 0; }, next() { return { getId: () => this.values.shift() }; } }) });
const conflicted = ctx.backfillAttachmentIds_({ dryRun: false, page: 'tc_registration_papers', limit: 1 }, null, { isSuperAdmin: true });
const conflictStat = conflicted.summary.pages['tc_registration_papers/registration_papers'];
assert.strictEqual(conflictStat.updated, 0, 'source edits must prevent stale migration writes');
assert.strictEqual(conflictStat.conflicts, 1, 'source edits must be reported as conflicts');

// Child purchasing-line reproduction: the page and stable transaction code select the line table.
ctx.getAllRecords_ = () => [{ 'كود المعاملة': 'CERT-1', 'شهادة_تحليل_ان_وجد': 'legal_product_purchasing_Files_/analysis.pdf', 'شهادة_تحليل_ان_وجد_id': 'L'.repeat(25) }];
ctx.DriveApp.getFileById = id => ({ getBlob: () => ({ getContentType: () => 'text/plain' }), getName: () => id });
assert.strictEqual(ctx.serveAttachment_({ sessionToken: 't', page: 'tc_budget_inputs', sheet: 'legal_product_purchasing', id: 'CERT-1', ref: 'legal_product_purchasing_Files_/analysis.pdf', field: 'شهادة_تحليل_ان_وجد' }), 'L'.repeat(25), 'child purchasing links must resolve the legal_product_purchasing row');


// User-reported AppSheet path: old and new folders must never be interchanged.
const legacyRef = 'registration_papers_Files_/تسجيل توب وانTop One.document_file.103330.pdf';
const unrelatedRef = 'registration_papers 2_Files_/other.pdf';
let legacyHeaders = ['document_number', 'document_file'];
let legacyRows = [[103330, legacyRef], [103331, unrelatedRef]];
let legacyWrites = 0, searchedFolders = [];
ctx.fakeSheet = {
  get headers() { return legacyHeaders; },
  getDataRange: () => ({ getValues: () => [legacyHeaders.slice()].concat(legacyRows.map(r => r.slice())) }),
  getRange: (row, col, count, cols) => ({
    getValues: () => [legacyRows[row - 2].slice()],
    setValue: value => { legacyWrites++; if (row === 1) legacyHeaders[col - 1] = value; else legacyRows[row - 2][col - 1] = value; }
  })
};
ctx.DriveApp.getFoldersByName = name => ({ values: [name], hasNext() { return this.values.length > 0; }, next() { const id=this.values.shift(); return { getId: () => id }; } });
ctx.DriveApp.getFolderById = folder => ({ getFilesByName: name => {
  searchedFolders.push(folder);
  return { values: ['R'.repeat(25)], hasNext() { return this.values.length > 0; }, next() { const id=this.values.shift(); return { getId: () => id }; } };
} });
const target = { page: 'tc_registration_papers', reference: legacyRef, dryRun: true };
const legacyPreview = ctx.backfillAttachmentIds_(target, null, { isSuperAdmin:true });
assert.strictEqual(legacyPreview.summary.reference, legacyRef);
assert.strictEqual(legacyPreview.summary.pages['tc_registration_papers/registration_papers'].wouldUpdate, 1);
assert.strictEqual(legacyWrites, 0);
assert.ok(searchedFolders.every(f => f === 'registration_papers 2_Files_'), 'migration must use the mapped physical Drive folder');
const legacyApply = ctx.backfillAttachmentIds_(Object.assign({}, target, {dryRun:false}), null, {isSuperAdmin:true});
assert.strictEqual(legacyApply.summary.pages['tc_registration_papers/registration_papers'].updated, 1);
assert.strictEqual(legacyRows[0][2], 'R'.repeat(25));
assert.strictEqual(legacyRows[1][2], undefined, 'targeted repair must not migrate another record');
const writesAfterApply = legacyWrites;
ctx.backfillAttachmentIds_(Object.assign({}, target, {dryRun:false}), null, {isSuperAdmin:true});
assert.strictEqual(legacyWrites, writesAfterApply, 'repair must be idempotent');
const registrationTarget = ctx.attachmentRegistry_().tc_registration_papers;
assert.strictEqual(ctx.attachmentReferenceFolder_(registrationTarget,'document_file',legacyRef),'registration_papers 2_Files_');
assert.strictEqual(ctx.attachmentReferenceFolder_(registrationTarget,'document_file',unrelatedRef),'registration_papers 2_Files_');
assert.strictEqual(ctx.attachmentReferenceFolder_(registrationTarget,'document_file','untrusted/file.pdf'),'');
assert.strictEqual(ctx.attachmentReferenceFolder_(registrationTarget,'document_file','registration_papers_Files_/../file.pdf'),'');
ctx.getAllRecords_ = () => [{document_number:103330,document_file:legacyRef,document_file_id:legacyRows[0][2]}];
assert.strictEqual(ctx.serveAttachment_({sessionToken:'t',page:'tc_registration_papers',id:'103330'}),'R'.repeat(25),'migrated legacy file must download by its durable ID');

console.log('attachment_download: PASS (exact refs, explicit-id authority, ambiguity, migration dry-run, mismatched/cache-safe downloads)');
