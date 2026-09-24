'use strict';
/* QUALITY-SOP-WORKFLOW — offline proof for the Valley Foods SOP server block.

   The REAL "QUALITY MODULE (v2)" block is sliced out of
   Company_ValleyFoods_Actions.js (banner to banner) together with the REAL
   settingsUniqueViolation_, and run in a vm over fake Sheets with captured
   writes, a deterministic uidV7_ and a scripted Drive. Nothing touches a
   spreadsheet, a Google service or the network.

   Proves: every illegal transition is refused BEFORE any mutation (submit from
   In Review, approve from Draft, reject without comment, make-effective from In
   Review, edit while In Review, edit header after submit, new version while a
   Draft exists, author self-approval); the legal path Draft -> In Review (PDF
   frozen, sha256 64-hex) -> Approved -> Effective; a freeze failure throws
   vfNotApplied_ with ZERO row/event writes; the prior Effective version becomes
   Obsolete only when the next version becomes Effective; pending
   acknowledgements are superseded.

   Run: node tools/verify/quality_sop_workflow.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

const START = '  // ===================== QUALITY MODULE (v2) =====================';
const END = '  // ===================== QUALITY MODULE END =====================';
const blockStart = source.indexOf(START);
const blockEnd = source.indexOf(END);
if (blockStart < 0 || blockEnd < blockStart) {
  console.error('quality_sop_workflow: QUALITY MODULE block not found in Company_ValleyFoods_Actions.js');
  process.exit(1);
}
const block = source.slice(blockStart, blockEnd + END.length);

const suStart = source.indexOf('  function settingsUniqueViolation_(');
const suEnd = source.indexOf('\n  }', suStart);
if (suStart < 0 || suEnd < suStart) {
  console.error('quality_sop_workflow: settingsUniqueViolation_ not found');
  process.exit(1);
}
const settingsUniqueViolationSrc = source.slice(suStart, suEnd + 4);

let failed = 0;
function check(ok, label) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}

/* ══ fake Sheets ═════════════════════════════════════════════════════ */
function makeSheet(name, headers) {
  const grid = [headers.slice()];
  return {
    __name: name,
    __grid: grid,
    getName: () => name,
    getParent: () => ({ getId: () => 'ss' }),
    getSheetId: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => grid.map(r => r.slice()) }),
    appendRow: (r) => {
      const row = r.slice();
      while (row.length < grid[0].length) row.push('');
      grid.push(row);
    },
    getRange: (row, col, nRows, nCols) => {
      const nr = nRows || 1, nc = nCols == null ? 1 : nCols;
      return {
        getValues: () => {
          const out = [];
          for (let r = 0; r < nr; r++) {
            const line = [];
            for (let c = 0; c < nc; c++) line.push((grid[row - 1 + r] || [])[col - 1 + c] === undefined ? '' : grid[row - 1 + r][col - 1 + c]);
            out.push(line);
          }
          return out;
        },
        getFormulas: () => [new Array(nc).fill('')],
        setValues: (v) => {
          (v || []).forEach((r, i) => {
            const at = row - 1 + i;
            while (grid.length <= at) grid.push(new Array(grid[0].length).fill(''));
            for (let j = 0; j < r.length; j++) grid[at][col - 1 + j] = r[j];
          });
        }
      };
    }
  };
}

function makeWorld() {
  const sheets = {};
  const writes = { count: 0 };
  const history = [];
  const drive = { created: [], exported: [], trashed: [], failDoc: false, failExport: false, failPdf: false };
  let uidSeq = 0, idSeq = 0, fileSeq = 0;

  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet(n, []); return sheets[n]; }
  };
  function ensureSheet_(dbId, name, headers) {
    if (!sheets[name]) sheets[name] = makeSheet(name, headers || []);
    return sheets[name];
  }
  function getSheet_(name, dbId) {
    const sh = sheets[name];
    if (!sh) throw new Error('Database Error: Missing tab "' + name + '"');
    return sh;
  }
  function getHeaders_(sheet) { return sheet.__grid[0]; }
  function getAllRecords_(dbId, name) {
    const sh = sheets[name];
    if (!sh) throw new Error('Database Error: Missing tab "' + name + '"');
    const grid = sh.__grid, headers = grid[0];
    const out = [];
    for (let i = 1; i < grid.length; i++) {
      const hasValue = headers.some((h, c) => { const v = grid[i][c]; return v !== undefined && v !== ''; });
      if (!hasValue) continue;
      const rec = {};
      headers.forEach((h, c) => { rec[String(h).trim()] = grid[i][c] === undefined ? '' : grid[i][c]; });
      out.push(rec);
    }
    return out;
  }
  function safeRows_(dbId, name) { try { return getAllRecords_(dbId, name); } catch (e) { return []; } }
  function nextId_(table) { return ++idSeq; }
  function addRecord_(dbId, sheetName, dataMap, requiredFields) {
    const missing = (requiredFields || []).filter(f => dataMap[f] === undefined || dataMap[f] === null || String(dataMap[f]).trim() === '');
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
    const sh = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sh);
    const id = nextId_(sheetName);
    const row = headers.map((h) => {
      const name = String(h).trim();
      if (name.toLowerCase() === 'id') return id;
      if (dataMap[name] !== undefined) return dataMap[name];
      const lower = name.toLowerCase();
      return dataMap[lower] !== undefined ? dataMap[lower] : '';
    });
    sh.appendRow(row);
    writes.count++;
    const rec = {};
    headers.forEach((h, c) => { rec[String(h).trim()] = row[c]; });
    return { status: 'success', data: { assignedId: id, record: rec } };
  }
  function patchRowByCriteria_(sheet, criteriaHeader, criteriaValue, updates) {
    const grid = sheet.__grid, headers = grid[0];
    const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
    if (critIdx === -1) throw new Error('Criteria header "' + criteriaHeader + '" not found.');
    for (let i = 1; i < grid.length; i++) {
      if (String(grid[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) {
        Object.keys(updates || {}).forEach((k) => {
          const idx = headers.findIndex(h => String(h).trim().toLowerCase() === String(k).trim().toLowerCase());
          if (idx !== -1) grid[i][idx] = updates[k];
        });
        writes.count++;
        return true;
      }
    }
    return false;
  }
  function deleteRowsByCriteria_(sheet, criteriaHeader, criteriaValue) {
    const grid = sheet.__grid, headers = grid[0];
    const critIdx = headers.findIndex(h => String(h).trim().toLowerCase() === String(criteriaHeader).trim().toLowerCase());
    if (critIdx === -1) throw new Error('Criteria header "' + criteriaHeader + '" not found.');
    let removed = 0;
    for (let i = grid.length - 1; i >= 1; i--) {
      if (String(grid[i][critIdx]).trim().toLowerCase() === String(criteriaValue).trim().toLowerCase()) { grid.splice(i, 1); removed++; }
    }
    if (removed) writes.count++;
    return removed;
  }
  function logHistory_() { history.push(Array.prototype.slice.call(arguments)); }
  function vfNotApplied_(message) { const e = new Error(message); e.notApplied = true; e.code = 'REQUEST_NOT_APPLIED'; throw e; }

  const ctx = {
    console,
    JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      newBlob: (data, contentType, name) => ({
        getBytes: () => Buffer.from(String(data), 'utf8'),
        getContentType: () => contentType,
        getName: () => name
      }),
      computeDigest: (alg, bytes) => Array.from(crypto.createHash('sha256').update(Buffer.from(bytes)).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    },
    Drive: {
      Files: {
        create: (resource, blob) => {
          const isDoc = resource && resource.mimeType === 'application/vnd.google-apps.document';
          if (isDoc && drive.failDoc) throw new Error('injected Google Doc create failure');
          if (!isDoc && drive.failPdf) throw new Error('injected PDF create failure');
          const id = (isDoc ? 'doc-' : 'pdf-') + (++fileSeq);
          drive.created.push({ id, name: resource && resource.name, parents: resource && resource.parents, hasBlob: !!blob });
          return { id };
        },
        export: (docId, mimeType) => {
          if (drive.failExport) throw new Error('injected export failure');
          drive.exported.push({ docId, mimeType });
          return { getBytes: () => Buffer.from('PDF:' + docId) };
        }
      }
    },
    DriveApp: { getFileById: (id) => ({ setTrashed: (v) => { drive.trashed.push({ id, v }); } }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    Logger: { log: () => {} },
    noteMutation_() {},
    vfBustRefs_() {},
    ensureDriveFolderId_: () => 'folder-1',
    executeWithLock_: (fn) => fn(),
    uidV7_: () => 'uid-' + String(++uidSeq).padStart(4, '0'),
    getNextIdUnderLock_: nextId_,
    ensureSheet_, getSheet_, getHeaders_, getAllRecords_, safeRows_, addRecord_, patchRowByCriteria_, deleteRowsByCriteria_,
    logHistory_, vfNotApplied_
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const exportLine = '\n__out = {' +
    ' getQualitySops_: getQualitySops_, saveQualitySop_: saveQualitySop_, saveQualitySopVersion_: saveQualitySopVersion_,' +
    ' submitQualitySopVersion_: submitQualitySopVersion_, approveQualitySopVersion_: approveQualitySopVersion_,' +
    ' rejectQualitySopVersion_: rejectQualitySopVersion_, makeEffectiveQualitySopVersion_: makeEffectiveQualitySopVersion_,' +
    ' saveQualitySopForms_: saveQualitySopForms_, freezeSopVersionPdf_: freezeSopVersionPdf_,' +
    ' QUALITY_SOP_CATEGORIES: QUALITY_SOP_CATEGORIES, QUALITY_SOP_STATUSES: QUALITY_SOP_STATUSES,' +
    ' QUALITY_SOP_EVENT_TYPES: QUALITY_SOP_EVENT_TYPES,' +
    ' QUALITY_SOP_SHEET: QUALITY_SOP_SHEET, QUALITY_SOP_VERSIONS_SHEET: QUALITY_SOP_VERSIONS_SHEET,' +
    ' QUALITY_SOP_EVENTS_SHEET: QUALITY_SOP_EVENTS_SHEET, QUALITY_SOP_FORMS_SHEET: QUALITY_SOP_FORMS_SHEET,' +
    ' QUALITY_SOP_ACKS_SHEET: QUALITY_SOP_ACKS_SHEET };';
  vm.runInContext(settingsUniqueViolationSrc + '\n' + block + exportLine, ctx, { filename: 'quality_block.js' });
  return { ctx, sheets, writes, history, drive };
}

/* ══ scenarios ══════════════════════════════════════════════════════ */
const DB = 'db-1';
const AUTHOR = { email: 'author@vf.test', company: '9940659bd83035d7' };
const APPROVER = { email: 'approver@vf.test', company: '9940659bd83035d7' };

const W = makeWorld();
const H = W.ctx.__out;
function rows(sheet) { return W.ctx.getAllRecords_(DB, sheet); }
function sopRow(uid) { return rows(H.QUALITY_SOP_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function versionRow(uid) { return rows(H.QUALITY_SOP_VERSIONS_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function eventsOf(sopId) { return rows(H.QUALITY_SOP_EVENTS_SHEET).filter(r => String(r.sop_id) === sopId); }
function expectRefusal(label, fn) {
  const before = W.writes.count;
  let err = null;
  try { fn(); } catch (e) { err = e; }
  check(!!err && err.notApplied === true, label + ' — refused as notApplied');
  check(W.writes.count === before, label + ' — zero writes before the refusal');
  return err;
}
function createSop(title, category) {
  return H.saveQualitySop_({ title_ar: title || 'إجراء اختبار', title_en: 'Test SOP', category: category || 'QC', applicability_dept: 'الجودة', applicability_role: '', owner_email: 'owner@vf.test' }, AUTHOR, DB);
}
function saveDraftContent(uid, html) {
  return H.saveQualitySopVersion_({ unique_id: uid, change_type: 'Major', content_html: html || '<h1>محتوى</h1><p>خطوة</p>', change_summary: 'مسودة أولى' }, AUTHOR, DB);
}
function submit(uid, user) { return H.submitQualitySopVersion_({ unique_id: uid }, user || AUTHOR, DB); }
function approve(uid, user) { return H.approveQualitySopVersion_({ unique_id: uid }, user || APPROVER, DB); }
function makeEffective(uid, user) {
  return H.makeEffectiveQualitySopVersion_({ unique_id: uid, effective_date: '2026-01-01', next_review_date: '2027-01-01' }, user || APPROVER, DB);
}

/* ---- constants and lazy table creation ---- */
check(H.QUALITY_SOP_CATEGORIES.length === 10 && H.QUALITY_SOP_CATEGORIES[1].code === 'QC' && H.QUALITY_SOP_CATEGORIES[1].label === 'الجودة',
  'categories constant: 10 entries with QC = الجودة');
check(H.QUALITY_SOP_STATUSES.join('|') === 'Draft|In Review|Approved|Rejected|Effective|Obsolete', 'statuses constant matches the lifecycle');
check(H.QUALITY_SOP_EVENT_TYPES.length === 11 && H.QUALITY_SOP_EVENT_TYPES.indexOf('Made Effective') !== -1, 'event types constant complete');

const read = H.getQualitySops_({}, AUTHOR, DB);
check(read.status === 'success' && Array.isArray(read.sops) && Array.isArray(read.versions) && Array.isArray(read.forms) && Array.isArray(read.events) && Array.isArray(read.acks) && read.categories === H.QUALITY_SOP_CATEGORIES,
  'get_quality_sops returns all five collections and the categories constant');
check([H.QUALITY_SOP_SHEET, H.QUALITY_SOP_VERSIONS_SHEET, H.QUALITY_SOP_FORMS_SHEET, H.QUALITY_SOP_EVENTS_SHEET, H.QUALITY_SOP_ACKS_SHEET].every(n => !!W.sheets[n]),
  'get_quality_sops lazily creates all five sheets with headers');

/* ---- create: SOP-<CAT>-NNN, version 1 Draft, Created event ---- */
const created = createSop('إجراء الجودة الأول', 'qc');
check(created.status === 'success' && created.sop_code === 'SOP-QC-001', 'create allocates SOP-QC-001 (uppercased category, zero-padded NNN)');
check(!!created.unique_id, 'create returns the SOP unique_id');
const sop1 = created.unique_id;
check(sopRow(sop1).draft_version === '1' && sopRow(sop1).current_effective_version === '', 'header row: draft_version 1, no effective version');
check(!!sopRow(sop1).created_at && sopRow(sop1).user === AUTHOR.email, 'header row carries user and created_at');
const v1rows = rows(H.QUALITY_SOP_VERSIONS_SHEET);
check(v1rows.length === 1 && Number(v1rows[0].version) === 1 && v1rows[0].status === 'Draft' && String(v1rows[0].sop_id) === sop1,
  'version 1 Draft row linked to the SOP');
check(v1rows[0].unique_id && v1rows[0].id !== '', 'version row has uidV7_-style unique_id and an integer id');
check(eventsOf(sop1).length === 1 && eventsOf(sop1)[0].event_type === 'Created', 'Created event written for the new SOP');

const second = createSop('إجراء ثان', 'QC');
check(second.sop_code === 'SOP-QC-002', 'second SOP in the same category is SOP-QC-002');
const otherCat = createSop('إجراء المخازن', 'WH');
check(otherCat.sop_code === 'SOP-WH-001', 'first SOP in another category restarts the sequence');

/* ---- illegal transitions: refused BEFORE any mutation ---- */
const sopR = createSop('إجراء الرفض', 'LAB');
const rVersion = rows(H.QUALITY_SOP_VERSIONS_SHEET).filter(r => String(r.sop_id) === sopR.unique_id)[0].unique_id;

expectRefusal('approve from Draft', () => approve(rVersion, APPROVER));
expectRefusal('reject without comment', () => H.rejectQualitySopVersion_({ unique_id: rVersion, comment: '   ' }, APPROVER, DB));
expectRefusal('make-effective from Draft', () => makeEffective(rVersion));

saveDraftContent(rVersion, '<p>نسخة سليمة</p>');
submit(rVersion);
check(versionRow(rVersion).status === 'In Review', 'submit moves Draft to In Review');

expectRefusal('submit again from In Review', () => submit(rVersion));
expectRefusal('edit version while In Review', () => saveDraftContent(rVersion, '<p>تعديل متأخر</p>'));
expectRefusal('edit SOP header after submit', () => H.saveQualitySop_({ unique_id: sopR.unique_id, title_ar: 'عنوان جديد', category: 'LAB' }, AUTHOR, DB));
expectRefusal('make-effective from In Review', () => makeEffective(rVersion));
expectRefusal('author self-approval', () => approve(rVersion, AUTHOR));
check(versionRow(rVersion).status === 'In Review', 'author self-approval left the row untouched');
approve(rVersion, APPROVER);
check(versionRow(rVersion).status === 'Approved', 'approver other than the author can approve');
expectRefusal('reject from Approved', () => H.rejectQualitySopVersion_({ unique_id: rVersion, comment: 'متأخر' }, APPROVER, DB));

/* a Rejected draft returns to Draft on the next edit, then blocks a new version */
const sopRej = createSop('إجراء مرفوض', 'MNT');
const rejV = rows(H.QUALITY_SOP_VERSIONS_SHEET).filter(r => String(r.sop_id) === sopRej.unique_id)[0].unique_id;
saveDraftContent(rejV);
submit(rejV);
H.rejectQualitySopVersion_({ unique_id: rejV, comment: 'ينقصه خطوة تحقق' }, APPROVER, DB);
check(versionRow(rejV).status === 'Rejected' && versionRow(rejV).reject_comment === 'ينقصه خطوة تحقق', 'reject records the comment');
check(versionRow(rejV).submitted_at !== '', 'submitted_at is preserved on rejection');
const reopened = saveDraftContent(rejV, '<p>أُصلح المحتوى</p>');
check(reopened.status === 'success' && reopened.unique_id === rejV && reopened.row_status === 'Draft',
  'editing a Rejected version returns success and the reopened Draft status');
check(reopened.status === 'success' && versionRow(rejV).status === 'Draft' && versionRow(rejV).reject_comment === '', 'Rejected edit reopens as Draft with the old comment cleared');
expectRefusal('new version while a Draft exists', () => H.saveQualitySopVersion_({ sop_id: sopRej.unique_id, change_type: 'Minor', content_html: '<p>x</p>' }, AUTHOR, DB));

/* ---- freeze failure: vfNotApplied_ and zero writes ---- */
function freezeFailureCase(label, setFault) {
  const sopF = createSop('إجراء التجميد', 'SAF');
  const fv = rows(H.QUALITY_SOP_VERSIONS_SHEET).filter(r => String(r.sop_id) === sopF.unique_id)[0].unique_id;
  saveDraftContent(fv, '<p>محتوى للتجميد</p>');
  const eventsBefore = rows(H.QUALITY_SOP_EVENTS_SHEET).length;
  setFault(true);
  const err = expectRefusal(label, () => submit(fv));
  setFault(false);
  check(!!err && /PDF/.test(err.message), label + ' — Arabic PDF failure message');
  check(versionRow(fv).status === 'Draft' && versionRow(fv).pdf_id === '', label + ' — version row untouched');
  check(rows(H.QUALITY_SOP_EVENTS_SHEET).length === eventsBefore, label + ' — no Submitted event');
  return fv;
}
W.drive.created.length = 0;
W.drive.trashed.length = 0;
freezeFailureCase('freeze: Google Doc create throws', v => { W.drive.failDoc = v; });
check(W.drive.created.length === 0, 'freeze: doc-create failure leaves no orphan file');
freezeFailureCase('freeze: export throws', v => { W.drive.failExport = v; });
check(W.drive.trashed.length === 1, 'freeze: doc is best-effort trashed after an export failure');
freezeFailureCase('freeze: PDF create throws', v => { W.drive.failPdf = v; });
check(W.drive.trashed.length === 2, 'freeze: doc is best-effort trashed after a PDF-create failure');

/* ---- the legal path: Draft -> In Review -> Approved -> Effective ---- */
const main = createSop('إجراء رئيسي', 'GEN');
const mainV1 = rows(H.QUALITY_SOP_VERSIONS_SHEET).filter(r => String(r.sop_id) === main.unique_id)[0].unique_id;
expectRefusal('submit without content', () => submit(mainV1));
saveDraftContent(mainV1);
const frozen = submit(mainV1);
check(frozen.status === 'success' && /^https:\/\/drive\.google\.com\/file\/d\/pdf-\d+\/view$/.test(frozen.pdf_ref), 'submit returns the Drive view ref required by the attachment path');
check(/^[0-9a-f]{64}$/.test(frozen.pdf_sha256), 'submit returns a 64-hex sha256 of the frozen PDF');
const vRow = versionRow(mainV1);
check(vRow.status === 'In Review' && vRow.pdf_ref === frozen.pdf_ref && vRow.pdf_id === frozen.pdf_id && vRow.pdf_sha256 === frozen.pdf_sha256 && vRow.submitted_at !== '',
  'locked update stores status, submitted_at and all three PDF fields');
const subEvent = eventsOf(main.unique_id).filter(e => e.event_type === 'Submitted')[0];
check(!!subEvent && subEvent.file_id === frozen.pdf_id && subEvent.file_hash === frozen.pdf_sha256, 'Submitted event carries the frozen file id and hash');

W.drive.created.length = 0;
const approved = approve(mainV1, APPROVER);
check(approved.status === 'success' && versionRow(mainV1).status === 'Approved' && versionRow(mainV1).approved_by === APPROVER.email && versionRow(mainV1).approved_at !== '',
  'approve stores approved_by/approved_at');
check(W.drive.created.length === 0, 'approve freezes nothing');

const eff1 = makeEffective(mainV1);
const hMain = sopRow(main.unique_id);
check(eff1.status === 'success' && versionRow(mainV1).status === 'Effective' && versionRow(mainV1).effective_date === '2026-01-01' && versionRow(mainV1).next_review_date === '2027-01-01',
  'make-effective sets Effective and the review dates');
check(hMain.current_effective_version === '1' && hMain.draft_version === '', 'make-effective updates the header: current_effective_version 1, draft cleared');
const maintEvents = eventsOf(main.unique_id).map(e => e.event_type);
check(maintEvents.indexOf('Made Effective') !== -1, 'Made Effective event written');

/* seed a pending acknowledgement before version 2 takes effect */
W.sheets[H.QUALITY_SOP_ACKS_SHEET].__grid.push([
  'ack-1', 1, main.unique_id, 1, '100', 'موظف', 'Pending', '', '', '', '', 'hr@vf.test', new Date().toISOString()
]);

/* ---- version 2: prior Effective becomes Obsolete ONLY at the same moment ---- */
const newV = H.saveQualitySopVersion_({ sop_id: main.unique_id, change_type: 'Minor', content_html: '<p>الإصدار الثاني</p>', change_summary: 'تحديث' }, AUTHOR, DB);
check(newV.status === 'success' && newV.version === 2 && newV.row_status === 'Draft', 'new version returns version 2 in Draft');
check(versionRow(newV.unique_id).unique_id === newV.unique_id && versionRow(newV.unique_id).author_email === AUTHOR.email, 'new version row is authored by the caller');
check(sopRow(main.unique_id).draft_version === '2', 'new version updates the header draft_version');
check(eventsOf(main.unique_id).some(e => e.event_type === 'New Version'), 'New Version event written');
check(versionRow(mainV1).status === 'Effective', 'v1 stays Effective while v2 is still Draft');
expectRefusal('make-effective from Draft (v2)', () => makeEffective(newV.unique_id));
saveDraftContent(newV.unique_id, '<p>الإصدار الثاني — محتوى</p>');
submit(newV.unique_id);
approve(newV.unique_id, APPROVER);
check(versionRow(mainV1).status === 'Effective', 'v1 stays Effective while v2 is Approved');
makeEffective(newV.unique_id);
check(versionRow(mainV1).status === 'Obsolete', 'v1 becomes Obsolete exactly when v2 becomes Effective');
check(versionRow(newV.unique_id).status === 'Effective', 'v2 is Effective');
check(sopRow(main.unique_id).current_effective_version === '2', 'header points at the new effective version');
check(eventsOf(main.unique_id).some(e => e.event_type === 'Obsolete' && Number(e.version) === 1), 'Obsolete event written for the superseded version');
const ack = rows(H.QUALITY_SOP_ACKS_SHEET)[0];
check(ack.status === 'Superseded', 'pending acknowledgements of the SOP are superseded');

/* ---- forms ---- */
const formAdd = H.saveQualitySopForms_({ sop_id: main.unique_id, form_code: 'F-QC-01', title: 'سجل قياس', form_type: 'Sheet', link_or_id: 'sheet-1', revision: '1', is_required: true }, AUTHOR, DB);
check(formAdd.status === 'success' && rows(H.QUALITY_SOP_FORMS_SHEET).length === 1, 'form insert writes one row');
const formRow = rows(H.QUALITY_SOP_FORMS_SHEET)[0];
check(formRow.is_required === true && String(formRow.sop_id) === main.unique_id, 'form row keeps is_required and the SOP link');
check(eventsOf(main.unique_id).some(e => e.event_type === 'Form Added'), 'Form Added event written');
const upd = H.saveQualitySopForms_({ sop_id: main.unique_id, unique_id: formRow.unique_id, form_code: 'F-QC-01', title: 'سجل قياس محدّث', form_type: 'PDF', link_or_id: 'file-9', revision: '2', is_required: false }, AUTHOR, DB);
check(upd.status === 'success' && rows(H.QUALITY_SOP_FORMS_SHEET)[0].title === 'سجل قياس محدّث' && rows(H.QUALITY_SOP_FORMS_SHEET)[0].form_type === 'PDF', 'form update patches the existing row');
expectRefusal('form with an invalid type', () => H.saveQualitySopForms_({ sop_id: main.unique_id, form_code: 'F-QC-02', title: 'x', form_type: 'Weird' }, AUTHOR, DB));
expectRefusal('remove without unique_id', () => H.saveQualitySopForms_({ sop_id: main.unique_id, remove: true }, AUTHOR, DB));
const rem = H.saveQualitySopForms_({ sop_id: main.unique_id, unique_id: formRow.unique_id, remove: true }, AUTHOR, DB);
check(rem.status === 'success' && rem.removed === true && rows(H.QUALITY_SOP_FORMS_SHEET).length === 0, 'form remove deletes the row');
check(eventsOf(main.unique_id).some(e => e.event_type === 'Form Removed'), 'Form Removed event written');

/* ---- category validation ---- */
expectRefusal('unknown category', () => createSop('تصنيف خاطئ', 'ZZZ'));
expectRefusal('missing Arabic title', () => H.saveQualitySop_({ title_ar: '   ', category: 'QC' }, AUTHOR, DB));

console.log(failed === 0
  ? 'quality_sop_workflow: PASS (transitions, PDF freeze, obsoletion, acks, forms over the real block)'
  : 'quality_sop_workflow: FAIL (' + failed + ' check(s))');
process.exit(failed === 0 ? 0 : 1);
