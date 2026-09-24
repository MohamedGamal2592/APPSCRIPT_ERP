'use strict';
/* QUALITY-E2E — the definition-of-done journey for the Valley Foods quality module.

   One shared fake-sheet state and ONE sliced instance of the REAL
   "QUALITY MODULE (v2)" block (banner to banner) drive the whole journey with
   the REAL handlers, in order:

     saveQualitySop_ (QC -> SOP-QC-001 + Draft v1)
     -> saveQualitySopVersion_ (v1 content_html)
     -> submitQualitySopVersion_ (freeze failure writes nothing, then the real
        PDF freeze -> In Review, 64-hex sha, pdf_ref /d/<pdf_id>)
     -> author self-approval refused (zero writes)
     -> approveQualitySopVersion_ by another full user -> Approved
     -> makeEffectiveQualitySopVersion_ -> Effective + current_effective_version
     -> launchQualityAcks_ (empty applicability = every employee) -> Pending
     -> signQualityAck_ as the employee's own session -> Signed
     -> saveQualityNcr_ (NCR-<YYYY>-001, Open)
     -> changeQualityNcrStatus_ (In Review with root_cause + disposition)
     -> saveQualityCapa_ (linked CAPA: Assigned -> In Progress -> Done)
     -> changeQualityNcrStatus_ (CAPA Assigned -> Implemented)
     -> saveQualityCapa_ (Done -> Verified -> Closed as a FULL user)
     -> changeQualityNcrStatus_ (Implemented -> Verified)
     -> closeQualityNcr_ (Closed with closed_by/closed_at)
     -> getQualityDashboard_ through vfRefsCached_ over the SAME state.

   Proves the end state exactly: the write counter holds only the intended
   sheet writes (no illegal transition leaked), and the dashboard reflects the
   journey (1 SOP effective, 1/1 acks signed = 100%, 0 open NCRs, 1 closed NCR,
   1 CAPA done, no overdue CAPA, no open finding).

   The REAL settingsUniqueViolation_ is sliced out of
   Company_ValleyFoods_Actions.js and the REAL
   requireAttachmentBinding_/extractDriveId_/_normalizeAccess_/
   _hasUnifiedAccess_/unifiedCheck_ out of Code.js. Nothing touches a
   spreadsheet, a Google service or the network.

   Run: node tools/verify/quality_e2e.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const code = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');

const START = '  // ===================== QUALITY MODULE (v2) =====================';
const END = '  // ===================== QUALITY MODULE END =====================';
const blockStart = source.indexOf(START);
const blockEnd = source.indexOf(END);
if (blockStart < 0 || blockEnd < blockStart) {
  console.error('quality_e2e: QUALITY MODULE block not found in Company_ValleyFoods_Actions.js');
  process.exit(1);
}
const block = source.slice(blockStart, blockEnd + END.length);

const suStart = source.indexOf('  function settingsUniqueViolation_(');
const suEnd = source.indexOf('\n  }', suStart);
if (suStart < 0 || suEnd < suStart) {
  console.error('quality_e2e: settingsUniqueViolation_ not found');
  process.exit(1);
}
const settingsUniqueViolationSrc = source.slice(suStart, suEnd + 4);

function grabFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  const end = src.indexOf('\n}', start);
  assert(end >= 0, name + ' end');
  return src.slice(start, end + 2);
}
const requireAttachmentBindingSrc = grabFunction(code, 'requireAttachmentBinding_');
const extractDriveIdSrc = grabFunction(code, 'extractDriveId_');
const normalizeSrc = grabFunction(code, '_normalizeAccess_');
const hasUnifiedSrc = grabFunction(code, '_hasUnifiedAccess_');
const unifiedCheckSrc = grabFunction(code, 'unifiedCheck_');

let failed = 0;
function check(ok, label) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}

/* ══ fake Sheets ═════════════════════════════════════════════════════ */
function makeWorld() {
  const sheets = {};
  const writes = { count: 0 };
  const history = [];
  const capture = { attach: [], attachCachePresent: null };
  const cachedKinds = [];
  const drive = { created: [], exported: [], trashed: [], failDoc: false, failExport: false, failPdf: false };
  let uidSeq = 0, idSeq = 0, fileSeq = 0;

  function makeSheet(name, headers) {
    const grid = [(headers || []).slice()];
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
        const row = (r || []).slice();
        while (row.length < grid[0].length) row.push('');
        grid.push(row);
        writes.count++;
      },
      getRange: (row, col, nRows, nCols) => {
        const nr = nRows || 1, nc = nCols == null ? 1 : nCols;
        return {
          getValues: () => {
            const out = [];
            for (let r = 0; r < nr; r++) {
              const line = [];
              for (let c = 0; c < nc; c++) {
                const v = (grid[row - 1 + r] || [])[col - 1 + c];
                line.push(v === undefined ? '' : v);
              }
              out.push(line);
            }
            return out;
          },
          getFormulas: () => [new Array(nc).fill('')],
          setValue: (v) => {
            while (grid.length < row) grid.push(new Array(grid[0].length).fill(''));
            grid[row - 1][col - 1] = v;
            writes.count++;
          },
          setValues: (v) => {
            (v || []).forEach((r, i) => {
              const at = row - 1 + i;
              while (grid.length <= at) grid.push(new Array(grid[0].length).fill(''));
              for (let j = 0; j < r.length; j++) grid[at][col - 1 + j] = r[j];
            });
            writes.count++;
          }
        };
      }
    };
  }

  function ensureSheet_(dbId, name, headers) {
    if (!sheets[name]) sheets[name] = makeSheet(name, headers || []);
    return sheets[name];
  }
  function getSheet_(name) {
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
  function addRecord_(dbId, sheetName, dataMap, requiredFields) {
    const missing = (requiredFields || []).filter(f => dataMap[f] === undefined || dataMap[f] === null || String(dataMap[f]).trim() === '');
    if (missing.length) throw new Error('Missing required fields: ' + missing.join(', '));
    const sh = getSheet_(sheetName, dbId);
    const headers = getHeaders_(sh);
    const id = ++idSeq;
    const row = headers.map((h) => {
      const name = String(h).trim();
      if (name.toLowerCase() === 'id') return id;
      if (dataMap[name] !== undefined) return dataMap[name];
      const low = name.toLowerCase();
      return dataMap[low] !== undefined ? dataMap[low] : '';
    });
    sh.appendRow(row);
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
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
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
    _headerCache_: { 'ss_valley_employee_info': ['stale'], 'ss_other': ['keep'] },
    COMPANY_UID: COMPANY,
    noteMutation_() {},
    vfBustRefs_() {},
    vfRefsCached_: (dbId, kind, builder) => {
      cachedKinds.push({ dbId: dbId, kind: kind, isBuilder: typeof builder === 'function' });
      return builder();
    },
    ensureDriveFolderId_: () => 'folder-1',
    ensureAttachmentColumn_: (dbId, sheetName, field) => {
      capture.attach.push([dbId, sheetName, field]);
      capture.attachCachePresent = Object.prototype.hasOwnProperty.call(ctx._headerCache_, 'ss_valley_employee_info');
      return true;
    },
    executeWithLock_: (fn) => fn(),
    uidV7_: () => 'uid-' + String(++uidSeq).padStart(4, '0'),
    getNextIdUnderLock_: () => ++idSeq,
    getNextIdBatch_: (dbId, table, count) => { const start = idSeq + 1; idSeq += count; return start; },
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
    ' launchQualityAcks_: launchQualityAcks_, getQualityMyAcks_: getQualityMyAcks_, signQualityAck_: signQualityAck_,' +
    ' recordQualityAck_: recordQualityAck_,' +
    ' getQualityNcr_: getQualityNcr_, saveQualityNcr_: saveQualityNcr_, saveQualityCapa_: saveQualityCapa_,' +
    ' changeQualityNcrStatus_: changeQualityNcrStatus_, closeQualityNcr_: closeQualityNcr_,' +
    ' getQualityDashboard_: getQualityDashboard_, getQualityAudits_: getQualityAudits_, saveQualityAudit_: saveQualityAudit_,' +
    ' saveQualityFinding_: saveQualityFinding_, escalateFindingToNcr_: escalateFindingToNcr_,' +
    ' QUALITY_SOP_SHEET: QUALITY_SOP_SHEET, QUALITY_SOP_VERSIONS_SHEET: QUALITY_SOP_VERSIONS_SHEET,' +
    ' QUALITY_SOP_EVENTS_SHEET: QUALITY_SOP_EVENTS_SHEET, QUALITY_SOP_ACKS_SHEET: QUALITY_SOP_ACKS_SHEET,' +
    ' QUALITY_EMP_INFO_SHEET: QUALITY_EMP_INFO_SHEET, QUALITY_NCR_SHEET: QUALITY_NCR_SHEET,' +
    ' QUALITY_CAPA_SHEET: QUALITY_CAPA_SHEET, QUALITY_AUDIT_SHEET: QUALITY_AUDIT_SHEET,' +
    ' QUALITY_AUDIT_FINDING_SHEET: QUALITY_AUDIT_FINDING_SHEET,' +
    ' QUALITY_SOP_HEADERS: QUALITY_SOP_HEADERS, QUALITY_SOP_VERSION_HEADERS: QUALITY_SOP_VERSION_HEADERS,' +
    ' QUALITY_SOP_ACK_HEADERS: QUALITY_SOP_ACK_HEADERS };';
  vm.runInContext([
    settingsUniqueViolationSrc,
    requireAttachmentBindingSrc,
    extractDriveIdSrc,
    normalizeSrc,
    hasUnifiedSrc,
    unifiedCheckSrc,
    block,
    exportLine
  ].join('\n'), ctx, { filename: 'quality_block.js' });

  function seed(name, headers, dataRows) {
    const sh = ensureSheet_(null, name, headers);
    (dataRows || []).forEach((r) => {
      const row = headers.map((h) => {
        if (r[h] !== undefined) return r[h];
        const low = String(h).toLowerCase();
        return r[low] !== undefined ? r[low] : '';
      });
      sh.__grid.push(row);
    });
    return sh;
  }
  return {
    ctx, sheets, writes, history, capture, cachedKinds, drive, seed,
    rows: (name) => getAllRecords_(null, name)
  };
}

/* ══ fixtures ════════════════════════════════════════════════════════ */
const DB = 'db-1';
const COMPANY = '9940659bd83035d7';
const YEAR = String(new Date().getFullYear());
/* The SOP author (write-only on the NCR page so the CAPA full-grant rule can be
   probed), the different full-grant manager, and the signing employee's session. */
const AUTHOR = { email: 'author@vf.test', company: COMPANY, authorizedPages: { vf_quality_ncr: ['write'] } };
const MANAGER = { email: 'qc.manager@vf.test', company: COMPANY, authorizedPages: { vf_quality_sops: ['full'], vf_quality_ncr: ['full'], vf_quality_my_acks: ['write'], vf_quality_audits: ['write'], vf_quality_dashboard: ['read'] } };
const SIGNER = { email: 'ahmed@vf.test', company: COMPANY };
const MONA = { email: 'mona@vf.test', company: COMPANY };
const HR_HEADERS = ['emp_id', 'employee_type', 'name_ar', 'national_id', 'hiring_date', 'title', 'section',
  'category', 'insurance', 'gender', 'schedule_id', 'الحالة الوظيفية', 'emp_id_1', 'البطاقة صادرة من',
  'العنوان بالبطاقة', 'user', 'created_at', 'email'];

const W = makeWorld();
const H = W.ctx.__out;

/* One employee at launch time: every employee is targeted by the empty
   applicability, and the single row is the one the signing employee owns (so
   the dashboard compliance is exact: 1/1 signed = 100). A second employee is
   added after the launch, to probe the own-row check with a real identity. */
W.seed(H.QUALITY_EMP_INFO_SHEET, HR_HEADERS, [
  { emp_id: 101, name_ar: 'أحمد علي', title: 'فني جودة', section: 'الجودة', email: 'Ahmed@VF.test' }
]);

function rows(sheet) { return W.ctx.getAllRecords_(DB, sheet); }
function sopRow(uid) { return rows(H.QUALITY_SOP_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function versionRow(uid) { return rows(H.QUALITY_SOP_VERSIONS_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function ackRow(uid) { return rows(H.QUALITY_SOP_ACKS_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function ncrRow(uid) { return rows(H.QUALITY_NCR_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function capaRow(uid) { return rows(H.QUALITY_CAPA_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }

function expectRefusal(label, fn) {
  const before = W.writes.count;
  let err = null;
  try { fn(); } catch (e) { err = e; }
  check(!!err && err.notApplied === true, label + ' — refused as notApplied');
  check(W.writes.count === before, label + ' — zero writes before the refusal');
  return err;
}

/* Runs one journey step and pins its exact sheet-write delta so an illegal
   transition that somehow slipped through cannot hide in the total. */
function step(label, expectedWrites, fn) {
  const before = W.writes.count;
  let out = null, err = null;
  try { out = fn(); } catch (e) { err = e; }
  check(!err, label + ' — completed without error' + (err ? ' (' + err.message + ')' : ''));
  check(W.writes.count - before === expectedWrites,
    label + ' — exactly ' + expectedWrites + ' sheet write(s), none leaked (got ' + (W.writes.count - before) + ')');
  return out || {};
}

/* ══ the journey ═════════════════════════════════════════════════════ */
const employeeCount = rows(H.QUALITY_EMP_INFO_SHEET).length;

/* ---- 1) create the SOP (category QC) ---- */
const created = step('1. saveQualitySop_ creates the QC SOP', 3, () =>
  H.saveQualitySop_({
    title_ar: 'إجراء ضبط الجودة', title_en: 'Quality Control SOP', category: 'QC',
    applicability_dept: '', applicability_role: '', owner_email: AUTHOR.email
  }, AUTHOR, DB));
const sopUid = created.unique_id;
check(created.status === 'success' && created.sop_code === 'SOP-QC-001', '1. sop_code is SOP-QC-001');
const v1rows = rows(H.QUALITY_SOP_VERSIONS_SHEET);
check(v1rows.length === 1 && String(v1rows[0].sop_id) === String(sopUid) && Number(v1rows[0].version) === 1 && v1rows[0].status === 'Draft',
  '1. a Draft v1 row exists and is linked to the SOP');
check(!!sopRow(sopUid) && sopRow(sopUid).draft_version === '1' && sopRow(sopUid).current_effective_version === '',
  '1. header: draft_version 1, no effective version yet');
const versionUid = v1rows[0] && v1rows[0].unique_id;

/* ---- 2) write the v1 content ---- */
const edited = step('2. saveQualitySopVersion_ writes the v1 content_html', 2, () =>
  H.saveQualitySopVersion_({
    unique_id: versionUid, change_type: 'Major',
    content_html: '<h1>خطوات ضبط الجودة</h1><p>فحص العينات</p>', change_summary: 'المسودة الأولى'
  }, AUTHOR, DB));
check(edited.row_status === 'Draft' && versionRow(versionUid).content_html === '<h1>خطوات ضبط الجودة</h1><p>فحص العينات</p>',
  '2. content_html is stored while the version stays Draft');

/* ---- 3) freeze failure writes nothing, then submit freezes the PDF ---- */
W.drive.failPdf = true;
const freezeErr = expectRefusal('3. a PDF freeze failure is refused', () => H.submitQualitySopVersion_({ unique_id: versionUid }, AUTHOR, DB));
W.drive.failPdf = false;
check(!!freezeErr && /PDF/.test(freezeErr.message), '3. the freeze refusal names the PDF step');
check(versionRow(versionUid).status === 'Draft' && versionRow(versionUid).pdf_id === '' && versionRow(versionUid).pdf_sha256 === '',
  '3. the failed freeze wrote no sheet row: the version stays Draft with empty PDF fields');
check(W.drive.trashed.length === 1, '3. the failed freeze best-effort trashed its temporary Google Doc');

const submitted = step('3. submitQualitySopVersion_ freezes and submits', 2, () =>
  H.submitQualitySopVersion_({ unique_id: versionUid }, AUTHOR, DB));
check(submitted.status === 'success' && versionRow(versionUid).status === 'In Review', '3. submit moves the version to In Review');
check(/^[0-9a-f]{64}$/.test(String(submitted.pdf_sha256)), '3. pdf_sha256 is 64 hex characters');
check(String(submitted.pdf_id).length > 0 && String(submitted.pdf_ref).indexOf('/d/' + submitted.pdf_id + '/') !== -1,
  '3. pdf_ref contains /d/<pdf_id>');
check(versionRow(versionUid).pdf_ref === submitted.pdf_ref && versionRow(versionUid).pdf_id === submitted.pdf_id &&
  versionRow(versionUid).pdf_sha256 === submitted.pdf_sha256 && String(versionRow(versionUid).submitted_at).trim() !== '',
  '3. the frozen PDF fields and submitted_at are stored on the version row');

/* ---- 4) author self-approval refused, then a different full user approves ---- */
const selfErr = expectRefusal('4. the author cannot approve their own version', () =>
  H.approveQualitySopVersion_({ unique_id: versionUid }, AUTHOR, DB));
check(!!selfErr && /للمؤلف/.test(selfErr.message), '4. the self-approval refusal names the author rule');
check(versionRow(versionUid).status === 'In Review' && versionRow(versionUid).approved_by === '',
  '4. the refused self-approval left the version untouched');
const approved = step('4. a different full user approves', 2, () =>
  H.approveQualitySopVersion_({ unique_id: versionUid }, MANAGER, DB));
check(approved.row_status === 'Approved' && versionRow(versionUid).status === 'Approved', '4. the version is Approved');
check(versionRow(versionUid).approved_by === MANAGER.email && String(versionRow(versionUid).approved_at).trim() !== '',
  '4. approved_by/approved_at are stamped');

/* ---- 5) make the version effective ---- */
const effective = step('5. makeEffectiveQualitySopVersion_', 3, () =>
  H.makeEffectiveQualitySopVersion_({ unique_id: versionUid, effective_date: '2026-01-01', next_review_date: '2027-01-01' }, MANAGER, DB));
check(effective.status === 'success' && versionRow(versionUid).status === 'Effective', '5. the version is Effective');
check(sopRow(sopUid).current_effective_version === '1' && sopRow(sopUid).draft_version === '',
  '5. sops.current_effective_version is updated to 1 and the draft is cleared');

/* ---- 6) launch acks: empty applicability targets every employee ---- */
const launched = step('6. launchQualityAcks_ with empty applicability', 2, () =>
  H.launchQualityAcks_({ sop_id: sopUid }, MANAGER, DB));
check(launched.status === 'success' && launched.created === employeeCount && launched.skipped === 0,
  '6. every employee (' + employeeCount + ') got a Pending row, none skipped');
const ackRows = rows(H.QUALITY_SOP_ACKS_SHEET);
check(ackRows.length === 1 && String(ackRows[0].emp_id) === '101' && ackRows[0].status === 'Pending' &&
  String(ackRows[0].sop_id) === String(sopUid) && String(ackRows[0].sop_version) === '1' && ackRows[0].employee_name === 'أحمد علي',
  '6. the Pending row targets the signing employee on the effective version');
check(W.capture.attach.length >= 1 && W.capture.attach[0][1] === H.QUALITY_EMP_INFO_SHEET && W.capture.attach[0][2] === 'email',
  '6. ensureAttachmentColumn_ ensured valley_employee_info.email');
check(W.capture.attachCachePresent === true && !Object.prototype.hasOwnProperty.call(W.ctx._headerCache_, 'ss_valley_employee_info'),
  '6. the employee header cache key is busted after the launch');
const ackUid = ackRows[0] && ackRows[0].unique_id;

/* ---- 7) the employee signs their own row ---- */
/* a second employee exists now, so the cross-user probe hits the ownership
   branch (session emp_id 102 vs the row's emp_id 101), not the unknown-email one */
W.seed(H.QUALITY_EMP_INFO_SHEET, HR_HEADERS, [
  { emp_id: 102, name_ar: 'منى حسن', title: 'مشرفة جودة', section: 'الإنتاج', email: 'mona@vf.test' }
]);
const crossErr = expectRefusal('7. another employee cannot sign this row', () =>
  H.signQualityAck_({ unique_id: ackUid, typed_name: 'منى حسن' }, MONA, DB));
check(!!crossErr && /غيرك/.test(crossErr.message), '7. the cross-user refusal names the ownership rule');
const signed = step('7. signQualityAck_ as the employee session', 1, () =>
  H.signQualityAck_({ unique_id: ackUid, typed_name: 'أحمد علي' }, SIGNER, DB));
check(signed.row_status === 'Signed' && ackRow(ackUid).status === 'Signed', '7. the employee signs their own row');
check(String(ackRow(ackUid).signed_at).trim() !== '' && ackRow(ackUid).recorded_by === SIGNER.email,
  '7. signed_at and recorded_by are stamped');

/* ---- 8) create the NCR ---- */
const ncr = step('8. saveQualityNcr_ creates the NCR', 1, () =>
  H.saveQualityNcr_({ source: 'Internal', severity: 'Major', description: 'جسم غريب في خط التعبئة', department: 'الإنتاج' }, AUTHOR, DB));
check(ncr.status === 'success' && ncr.row_status === 'Open' && ncr.ncr_code === 'NCR-' + YEAR + '-001',
  '8. NCR-' + YEAR + '-001 is created Open');
check(ncrRow(ncr.unique_id).source === 'Internal' && ncrRow(ncr.unique_id).severity === 'Major' && ncrRow(ncr.unique_id).detected_by === AUTHOR.email,
  '8. source/severity/detected_by are stored');
const ncrUid = ncr.unique_id;

/* ---- 9) review the NCR ---- */
expectRefusal('9. review without a disposition is refused', () =>
  H.changeQualityNcrStatus_({ unique_id: ncrUid, to_status: 'In Review', root_cause: 'تسرب زيت من الضاغط' }, AUTHOR, DB));
const reviewed = step('9. changeQualityNcrStatus_ -> In Review', 1, () =>
  H.changeQualityNcrStatus_({ unique_id: ncrUid, to_status: 'In Review', root_cause: 'تسرب زيت من الضاغط', disposition: 'عزل الدفعة وإيقاف الخط' }, AUTHOR, DB));
check(reviewed.row_status === 'In Review' && ncrRow(ncrUid).root_cause === 'تسرب زيت من الضاغط' &&
  ncrRow(ncrUid).disposition === 'عزل الدفعة وإيقاف الخط',
  '9. root_cause and disposition are stored with In Review');
expectRefusal('9. CAPA Assigned is refused while no CAPA is linked', () =>
  H.changeQualityNcrStatus_({ unique_id: ncrUid, to_status: 'CAPA Assigned', capa_required: true }, AUTHOR, DB));

/* ---- 10) the linked CAPA: Assigned -> In Progress -> Done ---- */
const capa = step('10. saveQualityCapa_ creates the linked CAPA', 1, () =>
  H.saveQualityCapa_({
    ncr_id: ncrUid, action_type: 'Corrective', description: 'استبدال مانع التسرب',
    owner_email: 'maint@vf.test', due_date: '2026-12-31'
  }, AUTHOR, DB));
check(capa.status === 'success' && capa.row_status === 'Assigned' && capa.capa_code === 'CAPA-' + YEAR + '-001',
  '10. CAPA-' + YEAR + '-001 starts Assigned');
check(capaRow(capa.unique_id).ncr_id === ncrUid && capaRow(capa.unique_id).implemented_at === '',
  '10. the CAPA is linked to the NCR with no implemented_at yet');
const capaUid = capa.unique_id;
const capaProgress = step('10. CAPA Assigned -> In Progress', 1, () =>
  H.saveQualityCapa_({ unique_id: capaUid, status: 'In Progress' }, AUTHOR, DB));
check(capaProgress.row_status === 'In Progress' && capaRow(capaUid).status === 'In Progress', '10. the CAPA moves to In Progress');
const capaDone = step('10. CAPA In Progress -> Done', 1, () =>
  H.saveQualityCapa_({ unique_id: capaUid, status: 'Done' }, AUTHOR, DB));
check(capaDone.row_status === 'Done' && String(capaRow(capaUid).implemented_at).trim() !== '',
  '10. Done stamps implemented_at');

/* ---- 11) NCR: CAPA Assigned -> Implemented ---- */
const assigned = step('11. NCR In Review -> CAPA Assigned (capa_required)', 1, () =>
  H.changeQualityNcrStatus_({ unique_id: ncrUid, to_status: 'CAPA Assigned', capa_required: true }, AUTHOR, DB));
check(assigned.row_status === 'CAPA Assigned' && ncrRow(ncrUid).capa_required === 'TRUE',
  '11. CAPA Assigned stores capa_required TRUE with a linked CAPA present');
expectRefusal('11. NCR CAPA Assigned -> Verified is refused (must implement first)', () =>
  H.changeQualityNcrStatus_({ unique_id: ncrUid, to_status: 'Verified' }, AUTHOR, DB));
const implemented = step('11. NCR CAPA Assigned -> Implemented (all CAPAs Done)', 1, () =>
  H.changeQualityNcrStatus_({ unique_id: ncrUid, to_status: 'Implemented' }, AUTHOR, DB));
check(implemented.row_status === 'Implemented' && ncrRow(ncrUid).status === 'Implemented',
  '11. the NCR moves to Implemented once the linked CAPA is Done');

/* ---- 12) CAPA: Done -> Verified -> Closed (full grant) ---- */
expectRefusal('12. CAPA Done -> Verified is refused for a write-only user', () =>
  H.saveQualityCapa_({ unique_id: capaUid, status: 'Verified', effectiveness_check_date: '2026-09-01', effectiveness_notes: 'فعال' }, AUTHOR, DB));
const capaVerified = step('12. CAPA Done -> Verified by a FULL user', 1, () =>
  H.saveQualityCapa_({ unique_id: capaUid, status: 'Verified', effectiveness_check_date: '2026-09-01', effectiveness_notes: 'لا تكرار خلال أسبوعين' }, MANAGER, DB));
check(capaVerified.row_status === 'Verified' && capaRow(capaUid).verified_by === MANAGER.email &&
  String(capaRow(capaUid).verified_at).trim() !== '' && capaRow(capaUid).effectiveness_check_date === '2026-09-01' &&
  capaRow(capaUid).effectiveness_notes === 'لا تكرار خلال أسبوعين',
  '12. verified_by/verified_at and the effectiveness evidence are stamped');
const capaClosed = step('12. CAPA Verified -> Closed by the FULL user', 1, () =>
  H.saveQualityCapa_({ unique_id: capaUid, status: 'Closed' }, MANAGER, DB));
check(capaClosed.row_status === 'Closed' && capaRow(capaUid).status === 'Closed', '12. the CAPA is Closed');

/* ---- 13) NCR: Implemented -> Verified ---- */
const ncrVerified = step('13. NCR Implemented -> Verified', 1, () =>
  H.changeQualityNcrStatus_({ unique_id: ncrUid, to_status: 'Verified' }, MANAGER, DB));
check(ncrVerified.row_status === 'Verified' && ncrRow(ncrUid).status === 'Verified', '13. the NCR moves to Verified');

/* ---- 14) close the NCR as a full user ---- */
const closed = step('14. closeQualityNcr_ as a full user', 1, () =>
  H.closeQualityNcr_({ unique_id: ncrUid }, MANAGER, DB));
check(closed.row_status === 'Closed' && ncrRow(ncrUid).status === 'Closed', '14. the NCR is Closed');
check(ncrRow(ncrUid).closed_by === MANAGER.email && String(ncrRow(ncrUid).closed_at).trim() !== '',
  '14. closed_by/closed_at are stamped');

/* ---- 15) dashboard over the SAME state ---- */
const dashBefore = W.writes.count;
const dash = H.getQualityDashboard_({}, MANAGER, DB);
check(dash.status === 'success', '15. the dashboard returns success');
check(W.writes.count === dashBefore, '15. the dashboard performs zero writes');
check(W.cachedKinds.length === 1 && W.cachedKinds[0].dbId === DB && W.cachedKinds[0].kind === 'quality_dashboard' && W.cachedKinds[0].isBuilder,
  '15. the dashboard is built through vfRefsCached_(dbId, quality_dashboard, builder)');
const K = dash.kpis || {};
const JOURNEY_KPIS = {
  sops_total: 1, sops_effective: 1, acks_signed: 1, acks_pending: 0, acks_compliance_pct: 100,
  ncrs_open: 0, ncrs_closed: 1, capas_done: 1, capas_overdue: 0, findings_open: 0
};
Object.keys(JOURNEY_KPIS).forEach(function (k) {
  check(K[k] === JOURNEY_KPIS[k], '15. KPI ' + k + ' = ' + JOURNEY_KPIS[k] + ' (got ' + K[k] + ')');
});
check(Array.isArray(dash.sops) && dash.sops.length === 1 && dash.sops[0].sop_code === 'SOP-QC-001' &&
  String(dash.sops[0].current_effective_version) === '1' && dash.sops[0].acks_signed === 1 &&
  dash.sops[0].acks_pending === 0 && dash.sops[0].compliance_pct === 100,
  '15. sops[0] reflects the journey: effective v1, 1/1 signed, compliance_pct 100');
check(dash.ncrs_recent.length === 1 && dash.ncrs_recent[0].ncr_code === 'NCR-' + YEAR + '-001' && dash.ncrs_recent[0].status === 'Closed',
  '15. ncrs_recent shows the single closed NCR');
check(dash.capas_overdue_list.length === 0, '15. capas_overdue_list is empty');

/* ---- no illegal-transition leakage: only the intended writes happened ---- */
check(W.writes.count === 26, 'the write counter holds exactly the 26 intended writes, none leaked (got ' + W.writes.count + ')');
check(rows(H.QUALITY_SOP_SHEET).length === 1 && rows(H.QUALITY_SOP_VERSIONS_SHEET).length === 1 && rows(H.QUALITY_SOP_EVENTS_SHEET).length === 6,
  'exactly one SOP, one version and the six journey events exist');
check(rows(H.QUALITY_SOP_ACKS_SHEET).length === 1 && rows(H.QUALITY_NCR_SHEET).length === 1 && rows(H.QUALITY_CAPA_SHEET).length === 1,
  'exactly one acknowledgement, one NCR and one CAPA exist');
check(rows(H.QUALITY_AUDIT_SHEET).length === 0 && rows(H.QUALITY_AUDIT_FINDING_SHEET).length === 0,
  'no audit or finding row leaked into the journey state');

console.log(failed === 0
  ? 'quality_e2e: PASS (SOP -> Ack -> NCR -> CAPA -> close -> dashboard over the real block on one shared state)'
  : 'quality_e2e: FAIL (' + failed + ' check(s))');
process.exit(failed === 0 ? 0 : 1);
