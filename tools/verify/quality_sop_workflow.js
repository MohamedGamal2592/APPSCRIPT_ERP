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

function makeWorld(opts) {
  opts = opts || {};
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

  /* Reference-field fixtures. `emptyRefs` builds the world a missing index /
     unavailable directory produces: no department sheet, no userDirectory_, so
     the fail-open rule is exercised rather than assumed. */
  if (!opts.emptyRefs) {
    ensureSheet_('db-1', 'valley_dept_section_index', ['unique_id', 'section', 'section_type', 'department']);
    const deptRows = opts.deptRows || [
      { section: 'الإدارة', department: 'الجودة' },
      { section: 'الإدارة', department: 'الإنتاج' },
      { section: 'الإدارة', department: 'المخازن' }
    ];
    deptRows.forEach(function (d, i) {
      sheets['valley_dept_section_index'].appendRow(['dept-' + i, d.section || '', d.section_type || '', d.department || '']);
    });
  }
  /* The department-abbreviation registry is company-owned configuration, seeded
     here exactly as an administrator would seed it. `noAbbr` builds the world
     where nothing has been configured yet, which must block NEW allocation
     without touching existing records. */
  if (!opts.noAbbr) {
    const abbrRows = opts.abbrRows || (opts.emptyRefs ? [] : [
      { department: 'الجودة', abbrev: 'QA' },
      { department: 'الإنتاج', abbrev: 'PROD' },
      { department: 'المخازن', abbrev: 'WH' }
    ]);
    if (abbrRows.length) {
      ensureSheet_('db-1', 'valley_quality_dept_abbr', ['unique_id', 'id', 'department', 'canonical', 'abbrev', 'user', 'created_at']);
      abbrRows.forEach(function (a, i) {
        sheets['valley_quality_dept_abbr'].appendRow(['abbr-' + i, i + 1, a.department || '', a.canonical || '', a.abbrev || '', '', '']);
      });
    }
  }
  const userDirectory = opts.emptyRefs ? undefined : function () {
    return opts.userDirectory || {
      'author@vf.test': { name: 'Author', company: '9940659bd83035d7', status: 'Active' },
      'approver@vf.test': { name: 'Approver', company: '9940659bd83035d7', status: 'Active' },
      'owner@vf.test': { name: 'Owner', company: '9940659bd83035d7', status: 'Active' },
      'other@corp.test': { name: 'Other', company: 'OTHER-CO', status: 'Active' },
      'gone@vf.test': { name: 'Gone', company: '9940659bd83035d7', status: 'Disabled' }
    };
  };

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
    COMPANY_UID: '9940659bd83035d7',
    ensureDriveFolderId_: () => 'folder-1',
    executeWithLock_: (fn) => fn(),
    userDirectory_: userDirectory,
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
const TEST_CREATE_ROLES = ['مدير الجودة', 'مدير المصنع', 'مدير الإدارة', 'رئيس القسم', 'مشرف الوردية', 'مشرف الإنتاج', 'مهندس إنتاج', 'مراقب جودة', 'فني معمل', 'مسؤول سلامة الغذاء'];
let nextTestCreateRole = 0;
function createSop(title, category, over) {
  var role = over && over.applicability_role;
  if (!role) role = TEST_CREATE_ROLES[nextTestCreateRole++ % TEST_CREATE_ROLES.length];
  return H.saveQualitySop_(Object.assign({
    title_ar: title || 'إجراء اختبار', title_en: 'Test SOP', category: category || 'PROC',
    applicability_dept: 'الجودة', applicability_role: role, owner_email: 'owner@vf.test'
  }, over || {}), AUTHOR, DB);
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
check(H.QUALITY_SOP_CATEGORIES.length === 5 && H.QUALITY_SOP_CATEGORIES[1].code === 'PROC' && H.QUALITY_SOP_CATEGORIES[1].label === 'إجراء',
  'categories constant: 5 document-level entries with PROC = إجراء');
check(H.QUALITY_SOP_STATUSES.join('|') === 'Draft|In Review|Approved|Rejected|Effective|Obsolete', 'statuses constant matches the lifecycle');
check(H.QUALITY_SOP_EVENT_TYPES.length === 11 && H.QUALITY_SOP_EVENT_TYPES.indexOf('Made Effective') !== -1, 'event types constant complete');

const read = H.getQualitySops_({}, AUTHOR, DB);
check(read.status === 'success' && Array.isArray(read.sops) && Array.isArray(read.versions) && Array.isArray(read.forms) && Array.isArray(read.events) && Array.isArray(read.acks) && read.categories === H.QUALITY_SOP_CATEGORIES,
  'get_quality_sops returns all five collections and the categories constant');
check([H.QUALITY_SOP_SHEET, H.QUALITY_SOP_VERSIONS_SHEET, H.QUALITY_SOP_FORMS_SHEET, H.QUALITY_SOP_EVENTS_SHEET, H.QUALITY_SOP_ACKS_SHEET].every(n => !!W.sheets[n]),
  'get_quality_sops lazily creates all five sheets with headers');

/* ---- create: <CATEGORY_PREFIX>-<DEPT_ABBR>-<SEQUENCE> (4.7.1) ---- */
const created = createSop('إجراء الجودة الأول', 'proc');
check(created.status === 'success' && created.sop_code === 'PROC-QA-001',
  'create allocates PROC-QA-001 (uppercased category prefix + department abbreviation + 3-digit sequence)');
check(created.code_prefix === 'PROC' && created.dept_abbrev === 'QA', 'create returns the prefix/abbreviation snapshot it allocated from');
check(!!created.unique_id, 'create returns the SOP unique_id');
const sop1 = created.unique_id;
check(sopRow(sop1).draft_version === '1' && sopRow(sop1).current_effective_version === '', 'header row: draft_version 1, no effective version');
check(!!sopRow(sop1).created_at && sopRow(sop1).user === AUTHOR.email, 'header row carries user and created_at');
const v1rows = rows(H.QUALITY_SOP_VERSIONS_SHEET);
check(v1rows.length === 1 && Number(v1rows[0].version) === 1 && v1rows[0].status === 'Draft' && String(v1rows[0].sop_id) === sop1,
  'version 1 Draft row linked to the SOP');
check(v1rows[0].unique_id && v1rows[0].id !== '', 'version row has uidV7_-style unique_id and an integer id');
check(eventsOf(sop1).length === 1 && eventsOf(sop1)[0].event_type === 'Created', 'Created event written for the new SOP');

/* The canonical department catalog says «الجودة». Resolve the old equivalent
   label «إدارة الجودة» to it before comparing assignment keys. */
const deptCol = W.sheets[H.QUALITY_SOP_SHEET].__grid[0].indexOf('applicability_dept');
W.sheets[H.QUALITY_SOP_SHEET].__grid[1][deptCol] = 'إدارة الجودة';
const writesBeforeDuplicate = W.writes.count;
const dupTitle = H.saveQualitySop_(sopHeader({ title_ar: 'عنوان مختلف', title_en: 'Different title', category: 'PROC', applicability_dept: 'الجودة', applicability_role: 'مدير الجودة' }), AUTHOR, DB);
check(dupTitle.status === 'duplicate' && dupTitle.duplicate.unique_id === sop1 && dupTitle.duplicate.sop_code === created.sop_code && dupTitle.duplicate.lifecycle_state === 'Draft',
  'an exact assignment with a different title returns the existing SOP identity and lifecycle state');
check(W.writes.count === writesBeforeDuplicate, 'an exact assignment refusal performs zero writes and does not allocate a code');
const dupOwner = H.saveQualitySop_(sopHeader({ title_ar: 'عنوان آخر', owner_email: 'author@vf.test', category: 'PROC', applicability_dept: 'الجودة', applicability_role: 'مدير الجودة' }), AUTHOR, DB);
check(dupOwner.status === 'duplicate' && dupOwner.duplicate.unique_id === sop1 && W.writes.count === writesBeforeDuplicate,
  'an exact assignment with a different owner is rejected without writes');

const second = createSop('إجراء ثان', 'PROC', { applicability_role: 'مدير المصنع' });
check(second.status === 'success' && second.sop_code === 'PROC-QA-002', 'a different applicable role is allowed and receives the next code');
const otherCat = createSop('إجراء المخازن', 'WI', { applicability_role: 'مدير الجودة' });
check(otherCat.sop_code === 'WI-QA-001', 'another CATEGORY restarts its own sequence (WI-QA-001)');
/* نموذج is stored as FRM but its visible code prefix is APP (4.7.1). */
const formCat = createSop('نموذج الجودة', 'FRM');
check(formCat.sop_code === 'APP-QA-001', 'نموذج (stored FRM) allocates an APP- code');
check(sopRow(formCat.unique_id).category === 'FRM', 'the stored category stays FRM — no silent migration to APP');
/* A different DEPARTMENT gets its own sequence, not a continuation. */
const prodDoc = H.saveQualitySop_({
  title_ar: 'إجراء الإنتاج', title_en: 'Prod SOP', category: 'PROC',
  applicability_dept: 'الإنتاج', applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test'
}, AUTHOR, DB);
check(prodDoc.sop_code === 'PROC-PROD-001', 'a different department starts its own sequence (PROC-PROD-001)');

const editMatched = H.saveQualitySop_(sopHeader({
  unique_id: sop1, title_ar: 'إجراء الجودة المعدّل', expected_revision: '1',
  category: 'PROC', applicability_dept: 'الجودة', applicability_role: 'مدير الجودة'
}), AUTHOR, DB);
check(editMatched.status === 'success' && editMatched.unique_id === sop1 && sopRow(sop1).sop_code === created.sop_code,
  'editing the matched SOP is allowed and keeps its issued code');
const matchedV1 = rows(H.QUALITY_SOP_VERSIONS_SHEET).filter(r => String(r.sop_id) === sop1)[0];
saveDraftContent(matchedV1.unique_id, '<p>محتوى الإجراء الحالي</p>');
submit(matchedV1.unique_id);
approve(matchedV1.unique_id, APPROVER);
makeEffective(matchedV1.unique_id, APPROVER);
const matchedV2 = H.saveQualitySopVersion_({ sop_id: sop1, change_type: 'Minor', content_html: '<p>الإصدار التالي</p>', change_summary: 'تحديث' }, AUTHOR, DB);
check(matchedV2.status === 'success' && matchedV2.version === 2 && matchedV2.row_status === 'Draft',
  'the matched SOP can create its next version through the existing lifecycle');

/* Two same-key contenders serialized by executeWithLock_ produce one parent,
   one initial version and one creation event; the losing request cannot orphan
   a row or consume another document code. */
const contenderWorld = makeWorld();
const HC = contenderWorld.ctx.__out;
const contender1 = HC.saveQualitySop_({
  title_ar: 'إجراء متزامن أول', title_en: 'Concurrent One', category: 'PROC',
  applicability_dept: 'الجودة', applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test', create_token: 'concurrent-a'
}, AUTHOR, DB);
const writesBeforeContender2 = contenderWorld.writes.count;
const contender2 = HC.saveQualitySop_({
  title_ar: 'إجراء متزامن ثان', title_en: 'Concurrent Two', category: 'PROC',
  applicability_dept: 'الجودة', applicability_role: 'مدير الجودة', owner_email: 'author@vf.test', create_token: 'concurrent-b'
}, AUTHOR, DB);
check(contender1.status === 'success' && contender2.status === 'duplicate', 'serialized same-key creation attempts return one success and one duplicate refusal');
const contenderRows = function (sheet) { return contenderWorld.ctx.getAllRecords_(DB, sheet); };
check(contenderWorld.writes.count === writesBeforeContender2 && contenderRows(HC.QUALITY_SOP_SHEET).length === 1 && contenderRows(HC.QUALITY_SOP_VERSIONS_SHEET).length === 1 && contenderRows(HC.QUALITY_SOP_EVENTS_SHEET).length === 1,
  'the losing creation adds no header, version, event or code allocation');

/* ---- reference fields: department index + company users ---- */
const readRefs = H.getQualitySops_({}, AUTHOR, DB);
check(Array.isArray(readRefs.dept_options) && readRefs.dept_options.some(function (o) { return o.value === 'الجودة'; }),
  'get_quality_sops returns the department options from valley_dept_section_index');
check(Array.isArray(readRefs.owner_options) && readRefs.owner_options.some(function (o) { return o.value === 'owner@vf.test'; }) &&
  readRefs.owner_options.every(function (o) { return o.value !== 'other@corp.test' && o.value !== 'gone@vf.test'; }),
  'owner options are this company\'s active users only');
/* 4.7.3 — owner NAMES are resolved in one batch, with honest fallbacks. */
check(readRefs.owner_names['owner@vf.test'] && readRefs.owner_names['owner@vf.test'].name === 'Owner',
  'owner_names resolves the company directory display name (not the email local part)');
/* Historical owners are resolved INCLUDING inactive users, and the honest
   fallbacks are asserted on rows injected straight into the sheet — a NEW
   selection of an inactive owner is still refused by saveQualitySop_. */
const histWorld = makeWorld({ userDirectory: {
  'author@vf.test': { name: 'Author', company: '9940659bd83035d7', status: 'Active' },
  'owner@vf.test': { name: '', company: '9940659bd83035d7', status: 'Active' },
  'gone2@vf.test': { name: 'موظف سابق', company: '9940659bd83035d7', status: 'Disabled' }
} });
const HH = histWorld.ctx.__out;
const histA = HH.saveQualitySop_(sopHeader({ owner_email: 'owner@vf.test' }), AUTHOR, DB);
const histB = HH.saveQualitySop_(sopHeader({ title_ar: 'إجراء ثانٍ', owner_email: 'owner@vf.test', applicability_role: 'مدير المصنع' }), AUTHOR, DB);
const histGrid = histWorld.sheets[HH.QUALITY_SOP_SHEET].__grid;
const ownerIdx = histGrid[0].indexOf('owner_email');
histGrid.forEach(function (row, i) {
  if (i === 0) return;
  if (String(row[0]) === histA.unique_id) row[ownerIdx] = 'gone2@vf.test';
  if (String(row[0]) === histB.unique_id) row[ownerIdx] = 'vanished@vf.test';
});
const hNames = HH.getQualitySops_({}, AUTHOR, DB).owner_names;
check(hNames['gone2@vf.test'] && hNames['gone2@vf.test'].name === 'موظف سابق',
  'a historical (inactive) owner still resolves to the real directory name');
check(hNames['vanished@vf.test'] && hNames['vanished@vf.test'].name === 'مستخدم غير متاح',
  'an owner with no directory record reads «مستخدم غير متاح» and never the raw email');

const noNameWorld = makeWorld({ userDirectory: {
  'author@vf.test': { name: 'Author', company: '9940659bd83035d7', status: 'Active' },
  'owner@vf.test': { name: '', company: '9940659bd83035d7', status: 'Active' }
} });
const HNN = noNameWorld.ctx.__out;
HNN.saveQualitySop_(sopHeader({ owner_email: 'owner@vf.test' }), AUTHOR, DB);
const nnNames = HNN.getQualitySops_({}, AUTHOR, DB).owner_names;
check(nnNames['owner@vf.test'].name === 'اسم المستخدم غير مسجل', 'a user record with no name reads «اسم المستخدم غير مسجل»');
check(readRefs.owner_choices.every(function (o) { return o.label.indexOf(' — ') === -1; }) &&
  readRefs.owner_choices.some(function (o) { return o.value === 'owner@vf.test' && o.name === 'Owner'; }),
  'owner_choices return a structured name (no combined "name — email" label)');
/* 4.7.2 — الدور المعني is a server-owned validated catalog. */
check(readRefs.roles && readRefs.roles.all_dept_value === '__ALL_DEPT__' && readRefs.roles.all_dept_label === 'جميع العاملين بالإدارة',
  'the role catalog reserves __ALL_DEPT__ for «جميع العاملين بالإدارة»');
check(readRefs.roles.recommended.length === 21 && readRefs.roles.recommended.some(function (r) { return r.value === 'مدير الجودة'; }),
  'the role catalog exposes the 21 recommended values');
/* 4.7.1 — the abbreviation registry is exposed as configuration, not code. */
check(Array.isArray(readRefs.dept_abbr) && readRefs.dept_abbr.some(function (r) { return r.department === 'الجودة' && r.abbrev === 'QA'; }),
  'get_quality_sops returns the configured department abbreviations');
check(readRefs.template && readRefs.template.id === 'vf-controlled-document-v1' && readRefs.template.bodyHeadings.length === 11 && readRefs.template.bodyHeadings[5] === 'خطوات الإجراء',
  'get_quality_sops serves the shared versioned template definition with its procedure sections');
function sopHeader(over) {
  return Object.assign({
    title_ar: 'إجراء مرجعي', title_en: 'Ref SOP', category: 'PROC',
    applicability_dept: 'الجودة', applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test'
  }, over || {});
}
expectRefusal('unknown department', function () { return H.saveQualitySop_(sopHeader({ applicability_dept: 'إدارة غير موجودة' }), AUTHOR, DB); });
expectRefusal('owner outside the company', function () { return H.saveQualitySop_(sopHeader({ owner_email: 'other@corp.test' }), AUTHOR, DB); });
expectRefusal('inactive owner', function () { return H.saveQualitySop_(sopHeader({ owner_email: 'gone@vf.test' }), AUTHOR, DB); });
expectRefusal('missing English title', function () { return H.saveQualitySop_(sopHeader({ title_en: '   ' }), AUTHOR, DB); });
expectRefusal('missing department', function () { return H.saveQualitySop_(sopHeader({ applicability_dept: '' }), AUTHOR, DB); });
expectRefusal('missing role', function () { return H.saveQualitySop_(sopHeader({ applicability_role: '' }), AUTHOR, DB); });
expectRefusal('missing owner', function () { return H.saveQualitySop_(sopHeader({ owner_email: '' }), AUTHOR, DB); });

/* Fail-open applies to REFERENCE VALUES, not to code allocation (4.7.1): with
   no department index and no user directory the free-text department and any
   owner are accepted, and a missing abbreviation is DERIVED and persisted
   automatically instead of blocking the save (the row stays editable by full
   users through the same registry the config action writes). */
const W2 = makeWorld({ emptyRefs: true, noAbbr: true });
const H2 = W2.ctx.__out;
const beforeLoose = W2.writes.count;
const looseAuto = H2.saveQualitySop_({ title_ar: 'إجراء بلا مراجع', title_en: 'Loose', category: 'PROC', applicability_dept: 'أي إدارة', applicability_role: 'مدير الجودة', owner_email: 'anyone@else.test' }, AUTHOR, DB);
check(looseAuto.status === 'success' && looseAuto.sop_code === 'PROC-AA-001',
  'no abbreviation configured — a NEW document is created with an auto-derived abbreviation (PROC-AA-001)');
check(H2.getQualitySops_({}, AUTHOR, DB).dept_abbr.some(function (r) { return r.department === 'أي إدارة' && r.abbrev === 'AA'; }),
  'the derived abbreviation is persisted in the registry so it stays editable');
check(W2.writes.count > beforeLoose && H2.getQualitySops_({}, AUTHOR, DB).sops.length === 1,
  'the auto-abbreviation path persists exactly one document');

/* Long bodies are chunked across the content columns and re-joined on read:
   the old single-cell 45k refusal is gone. */
const WLong = makeWorld();
const HLong = WLong.ctx.__out;
const longBody = '<p>' + new Array(60001).join('ا') + '</p>';
const longDoc = HLong.saveQualitySop_({
  title_ar: 'وثيقة طويلة', title_en: 'Long', category: 'PROC', applicability_dept: 'الجودة',
  applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test',
  version: { content_html: longBody, change_summary: 'محتوى طويل' }
}, AUTHOR, DB);
const longGrid = WLong.sheets[HLong.QUALITY_SOP_VERSIONS_SHEET].__grid;
const longHead = longGrid[0];
const longRead = HLong.getQualitySops_({}, AUTHOR, DB).versions.filter(function (v) { return v.sop_id === longDoc.unique_id; })[0];
const longStored = String(longGrid[1][longHead.indexOf('content_html')]) + String(longGrid[1][longHead.indexOf('content_html_2')]);
check(longRead && longRead.content_html === longStored && longRead.content_html.length > 45000,
  'a >45k body round-trips through the chunk columns');
check(longRead && longRead.content_html_2 === undefined, 'the client never receives the raw chunk columns');
check(String(longGrid[1][longHead.indexOf('content_html')]).length === 45000 && String(longGrid[1][longHead.indexOf('content_html_2')]).length > 0,
  'the body is stored as ordered chunks (first cell full, overflow in the second)');

const W3 = makeWorld({ emptyRefs: true, abbrRows: [{ department: 'أي إدارة', abbrev: 'ANY' }] });
const H3 = W3.ctx.__out;
const loose = H3.saveQualitySop_({ title_ar: 'إجراء بلا مراجع', title_en: 'Loose', category: 'PROC', applicability_dept: 'أي إدارة', applicability_role: 'مدير الجودة', owner_email: 'anyone@else.test' }, AUTHOR, DB);
check(loose.status === 'success' && loose.sop_code === 'PROC-ANY-001',
  'an unavailable department index still creates once an abbreviation is configured (fail-open values, mapped code)');
check(H3.getQualitySops_({}, AUTHOR, DB).sops.length === 1, 'the configured-abbreviation path persists exactly one document');
let looseRoleErr = null;
try {
  H3.saveQualitySop_({ title_ar: 'إجراء بدور حر', title_en: 'Free role', category: 'PROC', applicability_dept: 'أي إدارة', applicability_role: 'أي دور', owner_email: 'anyone@else.test' }, AUTHOR, DB);
} catch (e) { looseRoleErr = e; }
check(!!looseRoleErr && looseRoleErr.notApplied === true,
  'a role outside the catalog is refused even when the reference sources are unavailable');

/* Legacy category: an existing row may keep its unchanged code, a new row may not. */
const legacyWorld = makeWorld();
const HL = legacyWorld.ctx.__out;
const legacyCreated = HL.saveQualitySop_(sopHeader({ title_ar: 'إجراء قديم' }), AUTHOR, DB);
const legacyGrid = legacyWorld.sheets[HL.QUALITY_SOP_SHEET].__grid;
const legacyCatIdx = legacyGrid[0].indexOf('category');
for (let li = 1; li < legacyGrid.length; li++) {
  if (String(legacyGrid[li][0]) === legacyCreated.unique_id) legacyGrid[li][legacyCatIdx] = 'QC';
}
const legacyResaved = HL.saveQualitySop_(sopHeader({ unique_id: legacyCreated.unique_id, title_ar: 'إجراء قديم', category: 'QC' }), AUTHOR, DB);
check(legacyResaved.status === 'success', 'an existing legacy category may be kept when the row is edited');
let legacyNewErr = null;
try { HL.saveQualitySop_(sopHeader({ title_ar: 'إجراء جديد بفئة قديمة', category: 'QC' }), AUTHOR, DB); } catch (e) { legacyNewErr = e; }
check(!!legacyNewErr && legacyNewErr.notApplied === true, 'a NEW SOP may not use a legacy category');

/* ---- illegal transitions: refused BEFORE any mutation ---- */
const sopR = createSop('إجراء الرفض', 'FRM');
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
const sopRej = createSop('إجراء مرفوض', 'REC');
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
  const sopF = createSop('إجراء التجميد', 'POL');
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
const main = createSop('إجراء رئيسي', 'PROC');
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
