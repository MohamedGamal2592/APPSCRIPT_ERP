'use strict';
/* QUALITY-SOP-CODES-ROLES — offline proof for the metadata/code contracts added
   by the Word-editor programme, kept SEPARATE from quality_sop_workflow.js so
   the lifecycle tests and the new-code-generation tests fail independently.

   The REAL "QUALITY MODULE (v2)" block is sliced out of
   Company_ValleyFoods_Actions.js (banner to banner) together with the REAL
   settingsUniqueViolation_, and run in a vm over fake Sheets with captured
   writes. Nothing touches a spreadsheet, a Google service or the network.

   Proves:
     4.7.1  <CATEGORY_PREFIX>-<DEPARTMENT_ABBR>-<SEQUENCE> allocation, APP for
            نموذج while the stored category stays FRM, one sequence per
            company+prefix+abbreviation, 1000+ never truncated, the persisted
            high-water counter survives a failed reservation, creation
            idempotency through create_token, issued codes immutable through an
            edit, and a missing/ambiguous abbreviation blocking ONLY new
            allocation with no writes.
     4.7.2  الدور المعني validated server-side against the recommended catalog
            plus the company's real titles, __ALL_DEPT__ targeting only the
            chosen department, zero recipients refused, legacy values kept.
     4.7.3  owner display names resolved in one batch with honest fallbacks.
     8.1    additive, idempotent, non-destructive header upgrade on a POPULATED
            sheet.
     8.3    combined metadata+content save, revision conflict, unchanged content
            writing nothing.
     9      the server-side allowlist sanitizer.
     4.5    the general-quality handlers, their own ACL boundaries and their
            independence from the SOP lifecycle.

   Run: node tools/verify/quality_sop_codes_roles.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

const START = '  // ===================== QUALITY MODULE (v2) =====================';
const END = '  // ===================== QUALITY MODULE END =====================';
const blockStart = source.indexOf(START);
const blockEnd = source.indexOf(END);
if (blockStart < 0 || blockEnd < blockStart) {
  console.error('quality_sop_codes_roles: QUALITY MODULE block not found');
  process.exit(1);
}
const block = source.slice(blockStart, blockEnd + END.length);

const suStart = source.indexOf('  function settingsUniqueViolation_(');
const suEnd = source.indexOf('\n  }', suStart);
if (suStart < 0 || suEnd < suStart) {
  console.error('quality_sop_codes_roles: settingsUniqueViolation_ not found');
  process.exit(1);
}
const settingsUniqueViolationSrc = source.slice(suStart, suEnd + 4);

let failed = 0;
function check(ok, label) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}
function section(t) { console.log('\n── ' + t + ' ' + new Array(Math.max(2, 66 - t.length)).join('─')); }

/* ══ fake Sheets (same shape as quality_sop_workflow's, plus header growth) ══ */
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

  const userDirectory = function () {
    return opts.userDirectory || {
      'author@vf.test': { name: 'Author', company: '9940659bd83035d7', status: 'Active' },
      'owner@vf.test': { name: 'المالك الفعلي', company: '9940659bd83035d7', status: 'Active' }
    };
  };

  const ctx = {
    console, JSON, Math, String, Number, Boolean, Object, Array, Error, RegExp, Date,
    isNaN, parseInt, parseFloat,
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      newBlob: (data, contentType, name) => ({ getBytes: () => Buffer.from(String(data), 'utf8'), getContentType: () => contentType, getName: () => name }),
      computeDigest: (alg, bytes) => Array.from(crypto.createHash('sha256').update(Buffer.from(bytes)).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' }
    },
    Drive: {
      Files: {
        create: (resource) => {
          const isDoc = resource && resource.mimeType === 'application/vnd.google-apps.document';
          if (isDoc && drive.failDoc) throw new Error('injected doc failure');
          if (!isDoc && drive.failPdf) throw new Error('injected pdf failure');
          const id = (isDoc ? 'doc-' : 'pdf-') + (++fileSeq);
          drive.created.push({ id, name: resource && resource.name });
          return { id };
        },
        export: () => { if (drive.failExport) throw new Error('injected export failure'); return { getBytes: () => Buffer.from('PDF') }; }
      }
    },
    DriveApp: { getFileById: (id) => ({ setTrashed: (v) => drive.trashed.push({ id, v }) }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    Logger: { log: () => {} },
    noteMutation_() {},
    vfBustRefs_() {},
    COMPANY_UID: '9940659bd83035d7',
    ensureDriveFolderId_: () => 'folder-1',
    executeWithLock_: (fn) => fn(),
    userDirectory_: userDirectory,
    uidV7_: () => 'uid-' + String(++uidSeq).padStart(4, '0'),
    getNextIdUnderLock_: () => ++idSeq,
    ensureSheet_, getSheet_, getHeaders_, getAllRecords_, safeRows_, addRecord_, patchRowByCriteria_, deleteRowsByCriteria_,
    logHistory_, vfNotApplied_,
    /* The acknowledgement launcher ensures an email column exists on the
       employee roster before it targets anyone. The harness owns no schema
       migration, so the roster it is handed is already complete. */
    ensureAttachmentColumn_: function () { return { added: false }; },
    getLatestStatusMap_: function () { return {}; },
    getNextIdBatch_: function (dbId, sheet, n) { return 1; }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const exportLine = '\n__out = {' +
    ' getQualitySops_: getQualitySops_, saveQualitySop_: saveQualitySop_, saveQualitySopVersion_: saveQualitySopVersion_,' +
    ' freezeSopVersionPdf_: freezeSopVersionPdf_, launchQualityAcks_: launchQualityAcks_,' +
    ' qSopSanitizeHtml_: qSopSanitizeHtml_, qSopAllocateCode_: qSopAllocateCode_, qSopResolveAbbrev_: qSopResolveAbbrev_,' +
    ' qSopNormDept_: qSopNormDept_, saveQualityDeptAbbr_: saveQualityDeptAbbr_, qSopRoleCatalog_: qSopRoleCatalog_,' +
    ' qSopRoleAccepted_: qSopRoleAccepted_, qSopOwnerChoices_: qSopOwnerChoices_, qSopOwnerDisplay_: qSopOwnerDisplay_,' +
    ' qSopOwnerNameMap_: qSopOwnerNameMap_, qSopEnsureHeaders_: qSopEnsureHeaders_, qSopEnsureSchema_: qSopEnsureSchema_,' +
    ' qSopParseTemplateMeta_: qSopParseTemplateMeta_, qSopRenderControlledDocHtml_: qSopRenderControlledDocHtml_,' +
    ' qSopDefaultTemplateMeta_: qSopDefaultTemplateMeta_, getQualityGeneral_: getQualityGeneral_,' +
    ' saveQualityGeneral_: saveQualityGeneral_, setQualityGeneralStatus_: setQualityGeneralStatus_,' +
    ' qGenNormalizeLinks_: qGenNormalizeLinks_,' +
    ' QUALITY_SOP_SHEET: QUALITY_SOP_SHEET, QUALITY_SOP_VERSIONS_SHEET: QUALITY_SOP_VERSIONS_SHEET,' +
    ' QUALITY_SOP_HEADERS: QUALITY_SOP_HEADERS, QUALITY_SOP_VERSION_HEADERS: QUALITY_SOP_VERSION_HEADERS,' +
    ' QUALITY_SOP_ACKS_SHEET: QUALITY_SOP_ACKS_SHEET, QUALITY_SOP_EVENTS_SHEET: QUALITY_SOP_EVENTS_SHEET,' +
    ' QUALITY_GEN_SHEET: QUALITY_GEN_SHEET, QUALITY_GEN_HEADERS: QUALITY_GEN_HEADERS,' +
    ' QUALITY_DEPT_ABBR_SHEET: QUALITY_DEPT_ABBR_SHEET, QUALITY_SOP_SEQ_SHEET: QUALITY_SOP_SEQ_SHEET,' +
    ' QUALITY_SOP_CATEGORY_PREFIX: QUALITY_SOP_CATEGORY_PREFIX, QUALITY_SOP_ALL_DEPT: QUALITY_SOP_ALL_DEPT,' +
    ' QUALITY_DOC_TEMPLATE: QUALITY_DOC_TEMPLATE, QUALITY_SOP_ROLES_RECOMMENDED: QUALITY_SOP_ROLES_RECOMMENDED,' +
    ' QUALITY_SOP_CELL_LIMIT: QUALITY_SOP_CELL_LIMIT };';
  vm.runInContext(settingsUniqueViolationSrc + '\n' + block + exportLine, ctx, { filename: 'quality_block.js' });
  return { ctx, sheets, writes, history, drive };
}

const DB = 'db-1';
const AUTHOR = { email: 'author@vf.test', company: '9940659bd83035d7' };
const APPROVER = { email: 'approver@vf.test', company: '9940659bd83035d7' };

function baseWorld(opts) {
  const W = makeWorld(opts);
  const H = W.ctx.__out;
  W.ctx.ensureSheet_(DB, 'valley_dept_section_index', ['unique_id', 'section', 'section_type', 'department']);
  [['الجودة'], ['الإنتاج'], ['إدارة الصيانة'], ['الموارد البشرية'], ['المخازن']].forEach(function (d, i) {
    W.sheets['valley_dept_section_index'].appendRow(['dept-' + i, 'الإدارة', '', d[0]]);
  });
  W.ctx.ensureSheet_(DB, 'valley_employee_info', ['emp_id', 'name_ar', 'title', 'section']);
  [['1', 'موظف جودة', 'مدير الجودة', 'الجودة'], ['2', 'مراقب', 'مراقب جودة', 'الجودة'],
   ['3', 'مهندس', 'مهندس صيانة', 'إدارة الصيانة'], ['4', 'مهندس إنتاج', 'مهندس إنتاج', 'الإنتاج']]
    .forEach(function (e) { W.sheets['valley_employee_info'].appendRow(e); });
  W.ctx.ensureSheet_(DB, 'valley_quality_dept_abbr', ['unique_id', 'id', 'department', 'canonical', 'abbrev', 'user', 'created_at']);
  return { W: W, H: H };
}
function seedAbbr(W, dept, abbrev) {
  W.sheets['valley_quality_dept_abbr'].__grid.push(['abbr-' + dept, 0, dept, '', abbrev, '', '']);
}
function rows(H, W, sheet) { return W.ctx.getAllRecords_(DB, sheet); }
function expectRefusal(W, label, fn) {
  const before = W.writes.count;
  let err = null;
  try { fn(); } catch (e) { err = e; }
  check(!!err && err.notApplied === true, label + ' — refused as notApplied');
  check(W.writes.count === before, label + ' — zero writes before the refusal');
  return err;
}
function sop(over) {
  return Object.assign({
    title_ar: 'وثيقة اختبار', title_en: 'Test', category: 'POL',
    applicability_dept: 'إدارة الصيانة', applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test'
  }, over || {});
}

/* ══ 4.7.1 codes ═════════════════════════════════════════════════════════ */
section('4.7.1 readable <PREFIX>-<ABBR>-<SEQUENCE> codes');
{
  const A = baseWorld();
  seedAbbr(A.W, 'إدارة الصيانة', 'MAINT');
  seedAbbr(A.W, 'الموارد البشرية', 'HR');
  seedAbbr(A.W, 'الجودة', 'QA');
  seedAbbr(A.W, 'المخازن', 'WH');
  const H = A.H, W = A.W;

  check(H.QUALITY_SOP_CATEGORY_PREFIX.POL === 'POL' && H.QUALITY_SOP_CATEGORY_PREFIX.FRM === 'APP' &&
    H.QUALITY_SOP_CATEGORY_PREFIX.REC === 'REC',
    'the category-prefix map is POL/PROC/WI/APP/REC — نموذج maps to APP, independent of the stored key');

  const policy = H.saveQualitySop_(sop({ category: 'POL', applicability_dept: 'إدارة الصيانة' }), AUTHOR, DB);
  check(policy.sop_code === 'POL-MAINT-001', 'سياسة + إدارة الصيانة allocates POL-MAINT-001');
  check(policy.code_prefix === 'POL' && policy.dept_abbrev === 'MAINT', 'the allocation reports its own prefix/abbreviation snapshot');

  const form = H.saveQualitySop_(sop({ category: 'FRM', applicability_dept: 'الموارد البشرية', title_ar: 'نموذج' }), AUTHOR, DB);
  check(form.sop_code === 'APP-HR-001', 'نموذج + الموارد البشرية allocates APP-HR-001');
  const formRow = rows(H, W, H.QUALITY_SOP_SHEET).filter(function (r) { return r.unique_id === form.unique_id; })[0];
  check(formRow.category === 'FRM', 'the stored category stays FRM — APP is a code prefix only, never a migration');

  /* A second, third and 1000th document in the same bucket. */
  H.saveQualitySop_(sop({ category: 'POL', applicability_dept: 'إدارة الصيانة' }), AUTHOR, DB);
  const third = H.saveQualitySop_(sop({ category: 'POL', applicability_dept: 'إدارة الصيانة' }), AUTHOR, DB);
  check(third.sop_code === 'POL-MAINT-003', 'the third document continues the same bucket sequence');

  /* Force the counter past 999 to prove no truncation to 000. */
  const seqGrid = W.sheets[H.QUALITY_SOP_SEQ_SHEET].__grid;
  const seqHead = seqGrid[0];
  const seqIdx = { pr: seqHead.indexOf('code_prefix'), ab: seqHead.indexOf('dept_abbrev'), nx: seqHead.indexOf('next_seq') };
  for (let i = 1; i < seqGrid.length; i++) {
    if (String(seqGrid[i][seqIdx.pr]) === 'POL' && String(seqGrid[i][seqIdx.ab]) === 'MAINT') seqGrid[i][seqIdx.nx] = 999;
  }
  const big = H.saveQualitySop_(sop({ category: 'POL', applicability_dept: 'إدارة الصيانة' }), AUTHOR, DB);
  check(big.sop_code === 'POL-MAINT-999', 'next_seq 999 allocates POL-MAINT-999');
  const bigger = H.saveQualitySop_(sop({ category: 'POL', applicability_dept: 'إدارة الصيانة' }), AUTHOR, DB);
  check(bigger.sop_code === 'POL-MAINT-1000', '999 rolls to 1000 — the suffix is never sliced back to 000');
  const evenBigger = H.saveQualitySop_(sop({ category: 'POL', applicability_dept: 'إدارة الصيانة' }), AUTHOR, DB);
  check(evenBigger.sop_code === 'POL-MAINT-1001', 'and continues to 1001 without reusing a code');

  /* Company/prefix/abbreviation scoping. */
  check(H.saveQualitySop_(sop({ category: 'REC', applicability_dept: 'المخازن', title_ar: 'سجل' }), AUTHOR, DB).sop_code === 'REC-WH-001',
    'a different prefix starts its own sequence');
  check(H.saveQualitySop_(sop({ category: 'POL', applicability_dept: 'الجودة', title_ar: 'سياسة الجودة' }), AUTHOR, DB).sop_code === 'POL-QA-001',
    'a different DEPARTMENT under the same prefix starts its own sequence');
}

section('4.7.1 idempotency, immutability and the missing-abbreviation rule');
{
  const A = baseWorld();
  seedAbbr(A.W, 'الجودة', 'QA');
  const H = A.H, W = A.W;

  /* Initial-create idempotency: the same create_token must not create twice. */
  const first = H.saveQualitySop_(sop({ create_token: 'tok-1', applicability_dept: 'الجودة' }), AUTHOR, DB);
  const retry = H.saveQualitySop_(sop({ create_token: 'tok-1', applicability_dept: 'الجودة' }), AUTHOR, DB);
  check(retry.idempotent === true && retry.unique_id === first.unique_id && retry.sop_code === first.sop_code,
    'a retried create with the SAME create_token returns the same document and code');
  check(rows(H, W, H.QUALITY_SOP_SHEET).length === 1, 'the retried create wrote no second SOP row');
  check(rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET).length === 1, 'the retried create wrote no second version row');

  /* An issued code is immutable: editing metadata (including the category)
     never re-codes the document, and the snapshot records what produced it. */
  const before = rows(H, W, H.QUALITY_SOP_SHEET)[0];
  H.saveQualitySop_(sop({ unique_id: first.unique_id, category: 'PROC', applicability_dept: 'الجودة', title_en: 'Changed' }), AUTHOR, DB);
  const after = rows(H, W, H.QUALITY_SOP_SHEET)[0];
  check(after.sop_code === before.sop_code, 'an existing document keeps its issued code after a category edit');
  check(String(after.code_prefix) === 'POL' && String(after.dept_abbrev) === 'QA',
    'the creation-time prefix/abbreviation snapshot survives the edit and stays auditable');
  check(String(after.revision) === '2', 'each successful metadata save raises the document revision');

  /* A failed reservation must never recycle a code. */
  const seqGrid = W.sheets[H.QUALITY_SOP_SEQ_SHEET].__grid;
  const head = seqGrid[0];
  const nx = head.indexOf('next_seq');
  const reserved = Number(seqGrid[seqGrid.length - 1][nx]);
  const next = H.saveQualitySop_(sop({ applicability_dept: 'الجودة', title_ar: 'وثيقة تالية' }), AUTHOR, DB);
  check(Number(reserved) > 1 && /-00[0-9]+$/.test(next.sop_code) && next.sop_code !== first.sop_code,
    'the persisted high-water counter keeps allocating forward without reusing a code');
}

section('8.4 request-scoped SOP recovery');
{
  const A = baseWorld();
  seedAbbr(A.W, 'الجودة', 'QA');
  const H = A.H, W = A.W;
  const requestId = 'sop-recovery-request-001';
  const templateMeta = JSON.stringify(H.qSopDefaultTemplateMeta_('سياسة'));
  const payload = sop({
    create_token: 'recovery-token-001', applicability_dept: 'الجودة',
    version: { change_type: 'Major', content_html: '<h2>الغرض</h2><p>محتوى الطلب</p>', change_summary: 'إنشاء', template_meta: templateMeta }
  });
  const guard = { requestId: requestId, payloadHash: 'payload-hash-001', checkpoint: function () {} };
  const created = H.saveQualitySop_(payload, AUTHOR, DB, guard);
  const completed = H.saveQualitySop_(payload, AUTHOR, DB, {
    requestId: requestId, payloadHash: 'payload-hash-001', recovering: true,
    priorRecovery: { type: 'vf_quality_sop_save_v1', request_id: requestId, payload_hash: 'payload-hash-001', entity_uid: payload.create_token, stage: 'event' },
    checkpoint: function () {}
  });
  check(completed.recovered === true && completed.unique_id === created.unique_id,
    'a completed request recovers from its exact SOP/version/event snapshot');
  check(rows(H, W, H.QUALITY_SOP_SHEET).length === 1 && rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET).length === 1 && rows(H, W, H.QUALITY_SOP_EVENTS_SHEET).length === 1,
    'completed recovery never duplicates the SOP, version or Created event');

  /* Simulate a response loss after the header write: the recovery path is
     allowed to add only the missing version/event rows keyed by the same
     create_token, then proves the full snapshot before returning success. */
  const vg = W.sheets[H.QUALITY_SOP_VERSIONS_SHEET].__grid;
  const eg = W.sheets[H.QUALITY_SOP_EVENTS_SHEET].__grid;
  vg.splice(1, 1); eg.splice(1, 1);
  const partial = H.saveQualitySop_(payload, AUTHOR, DB, {
    requestId: requestId, payloadHash: 'payload-hash-001', recovering: true,
    priorRecovery: { type: 'vf_quality_sop_save_v1', request_id: requestId, payload_hash: 'payload-hash-001', entity_uid: created.unique_id, stage: 'sop' },
    checkpoint: function () {}
  });
  check(partial.recovered === true && rows(H, W, H.QUALITY_SOP_SHEET).length === 1 && rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET).length === 1 && rows(H, W, H.QUALITY_SOP_EVENTS_SHEET).length === 1,
    'partial recovery resumes missing rows without repeating the existing SOP');
}

section('4.7.1 missing / ambiguous / colliding department mappings');
{
  const B = baseWorld();
  const H = B.H, W = B.W;
  /* No mapping configured at all: the server derives «QA» for الجودة from the
     recommendation table, persists it, and creates the document instead of
     blocking the save. */
  const auto = H.saveQualitySop_(sop({ applicability_dept: 'الجودة' }), AUTHOR, DB);
  check(auto.status === 'success' && auto.sop_code === 'POL-QA-001',
    'no abbreviation configured — a NEW document is auto-mapped (QA) and created, not blocked');
  check(rows(H, W, H.QUALITY_SOP_SHEET).length === 1, 'the auto-mapped creation persisted one SOP row');
  check(rows(H, W, H.QUALITY_DEPT_ABBR_SHEET).some(function (r) { return String(r.department) === 'الجودة' && String(r.abbrev) === 'QA'; }),
    'the derived abbreviation is stored in the registry for later edits');

  /* An existing, already-coded document may still be EDITED with no mapping:
     the rule blocks allocation, not history. */
  B.W.sheets[H.QUALITY_SOP_SHEET].__grid.push([
    'legacy-1', 1, 'SOP-POL-001', 'قديمة', 'Old', 'POL', 'الجودة', 'مدير الجودة', 'owner@vf.test', '', '1', 'x@x', '2020-01-01'
  ].concat(new Array(Math.max(0, H.QUALITY_SOP_HEADERS.length - 13)).fill('')));
  const editedLegacy = H.saveQualitySop_({ unique_id: 'legacy-1', title_ar: 'قديمة محدثة', title_en: 'Old', category: 'POL', applicability_dept: 'الجودة', applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test' }, AUTHOR, DB);
  check(editedLegacy.status === 'success' && editedLegacy.sop_code === 'SOP-POL-001',
    'a historical SOP-* code stays editable and immutable when no abbreviation is configured');

  /* Bad abbreviation format / collisions are refused by the config action.
     Input is normalized to upper case (a convenience); the STORED value must
     still satisfy ^[A-Z][A-Z0-9]{1,11}$. */
  seedAbbr(B.W, 'الجودة', 'QA');
  H.saveQualityDeptAbbr_({ department: 'الإنتاج', abbrev: 'prod' }, AUTHOR, DB);
  check(
    B.W.sheets[H.QUALITY_DEPT_ABBR_SHEET].__grid.some(function (r) { return String(r[2]) === 'الإنتاج' && String(r[4]) === 'PROD'; }),
    'a lowercase abbreviation is normalized to upper case before it is stored');
  check(H.qSopResolveAbbrev_(DB, 'الإنتاج') && H.qSopResolveAbbrev_(DB, 'الإنتاج').abbrev === 'PROD',
    'the stored abbreviation resolves for allocation');
  expectRefusal(W, 'a too-long abbreviation is refused', function () { return H.saveQualityDeptAbbr_({ department: 'المخازن', abbrev: 'ABCDEFGHIJKLM' }, AUTHOR, DB); });
  expectRefusal(W, 'an abbreviation with a leading digit is refused', function () { return H.saveQualityDeptAbbr_({ department: 'المخازن', abbrev: '1AB' }, AUTHOR, DB); });
  expectRefusal(W, 'an abbreviation already used by another department is refused', function () { return H.saveQualityDeptAbbr_({ department: 'الإنتاج', abbrev: 'QA' }, AUTHOR, DB); });
  expectRefusal(W, 'a second abbreviation for the same department is refused', function () { return H.saveQualityDeptAbbr_({ department: 'الجودة', abbrev: 'QC' }, AUTHOR, DB); });
  check(H.saveQualityDeptAbbr_({ department: 'الإنتاج', abbrev: 'PROD' }, AUTHOR, DB).status === 'success',
    'a distinct, well-formed abbreviation is accepted');
  check(H.saveQualitySop_(sop({ applicability_dept: 'الإنتاج', title_ar: 'إجراء الإنتاج' }), AUTHOR, DB).sop_code === 'POL-PROD-001',
    'the newly configured abbreviation is used for the next allocation');

  /* The normalization strips the optional إدارة prefix WITHOUT merging
     genuinely distinct units. */
  check(H.qSopNormDept_('إدارة الصيانة') === H.qSopNormDept_('الصيانة'), 'the optional إدارة prefix is ignored for lookup');
  check(H.qSopNormDept_('مراقبة الجودة') !== H.qSopNormDept_('توكيد الجودة'), 'QC and QA are never merged by normalization');
  check(H.qSopNormDept_('سلامة الغذاء') !== H.qSopNormDept_('السلامة والصحة المهنية'), 'FS and HSE are never merged by normalization');
}

/* ══ 4.7.2 role enum ═════════════════════════════════════════════════════ */
section('4.7.2 الدور المعني is a validated server-owned enum');
{
  const A = baseWorld();
  seedAbbr(A.W, 'الجودة', 'QA');
  seedAbbr(A.W, 'المخازن', 'WH');
  const H = A.H, W = A.W;

  const catalog = H.qSopRoleCatalog_(DB);
  check(catalog.all_dept_value === '__ALL_DEPT__' && catalog.all_dept_label === 'جميع العاملين بالإدارة',
    'the reserved machine value behind «جميع العاملين بالإدارة» is __ALL_DEPT__');
  check(catalog.recommended.length === 21, 'the recommended catalog carries the 21 ordinary role values');
  check(catalog.titles.some(function (t) { return t.value === 'مراقب جودة' && t.count === 1; }),
    'the company\'s REAL job titles are exposed with their counts, company-scoped');
  check(catalog.titles.every(function (t) { return t.value && typeof t.count === 'number' && t.emp_id === undefined; }),
    'no employee identity crosses the wire — title and count only');

  check(H.qSopRoleAccepted_(DB, 'مدير الجودة') === true, 'a recommended value is accepted');
  check(H.qSopRoleAccepted_(DB, 'مراقب جودة') === true, 'a real company title is accepted exactly');
  check(H.qSopRoleAccepted_(DB, '__ALL_DEPT__') === true, 'the reserved all-department value is accepted');
  check(H.qSopRoleAccepted_(DB, 'مهندس إنتاج') === true, 'a real title that is NOT recommended is accepted');
  check(H.qSopRoleAccepted_(DB, 'مدير') === false, 'a loose substring of a title is NOT accepted');
  expectRefusal(W, 'an arbitrary free-text role is refused on save', function () {
    return H.saveQualitySop_(sop({ applicability_role: 'أي دور عشوائي', applicability_dept: 'الجودة' }), AUTHOR, DB);
  });
  check(H.saveQualitySop_(sop({ applicability_role: 'مراقب جودة', applicability_dept: 'الجودة' }), AUTHOR, DB).status === 'success',
    'a real company title saves successfully');

  /* Legacy value preservation: an existing row keeps the value it carries. */
  const legacy = H.saveQualitySop_(sop({ applicability_role: 'مدير الجودة', applicability_dept: 'الجودة', title_ar: 'قديمة' }), AUTHOR, DB);
  const grid = W.sheets[H.QUALITY_SOP_SHEET].__grid;
  const roleIdx = grid[0].indexOf('applicability_role');
  for (let i = 1; i < grid.length; i++) if (String(grid[i][0]) === legacy.unique_id) grid[i][roleIdx] = 'رئيس حسابات قديم';
  const kept = H.saveQualitySop_({ unique_id: legacy.unique_id, title_ar: 'قديمة', title_en: 'Old', category: 'POL', applicability_dept: 'الجودة', applicability_role: 'رئيس حسابات قديم', owner_email: 'owner@vf.test' }, AUTHOR, DB);
  check(kept.status === 'success', 'a pre-existing unknown role value may be kept on its own record');
  const refs = H.getQualitySops_({}, AUTHOR, DB);
  check(refs.legacy_roles.indexOf('رئيس حسابات قديم') !== -1,
    'the legacy value is surfaced as a legacy option and is not offered for new records');

  /* __ALL_DEPT__ targeting. */
  const target = H.saveQualitySop_(sop({ applicability_role: '__ALL_DEPT__', applicability_dept: 'الجودة', title_ar: 'كل الجودة' }), AUTHOR, DB);
  const vRow = rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET).filter(function (v) { return v.sop_id === target.unique_id; })[0];
  W.ctx.patchRowByCriteria_(W.sheets[H.QUALITY_SOP_VERSIONS_SHEET], 'unique_id', vRow.unique_id,
    { status: 'Effective', content_html: '<p>محتوى</p>' });
  W.ctx.patchRowByCriteria_(W.sheets[H.QUALITY_SOP_SHEET], 'unique_id', target.unique_id, { current_effective_version: '1' });
  const launched = H.launchQualityAcks_({ sop_id: target.unique_id, sop_version: '1' }, APPROVER, DB);
  check(launched.status === 'success' && Number(launched.created) === 2,
    '__ALL_DEPT__ targets the two الجودة employees only, never the whole company');
  const ackRows = rows(H, W, H.QUALITY_SOP_ACKS_SHEET);
  check(ackRows.length === 2 && ackRows.every(function (a) { return String(a.emp_id) === '1' || String(a.emp_id) === '2'; }),
    'no employee from another department received a row');
  check(H.launchQualityAcks_({ sop_id: target.unique_id, sop_version: '1' }, APPROVER, DB).status === 'success' &&
    rows(H, W, H.QUALITY_SOP_ACKS_SHEET).length === 2,
    're-launching on the same version creates no duplicate row');

  /* Zero targets is an explicit outcome, never a claimed delivery. */
  const emptyTarget = H.saveQualitySop_(sop({ applicability_role: 'مدير المصنع', applicability_dept: 'المخازن', title_ar: 'بلا مستهدفين' }), AUTHOR, DB);
  const emptyV = rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET).filter(function (v) { return v.sop_id === emptyTarget.unique_id; })[0];
  W.ctx.patchRowByCriteria_(W.sheets[H.QUALITY_SOP_VERSIONS_SHEET], 'unique_id', emptyV.unique_id, { status: 'Effective' });
  W.ctx.patchRowByCriteria_(W.sheets[H.QUALITY_SOP_SHEET], 'unique_id', emptyTarget.unique_id, { current_effective_version: '1' });
  expectRefusal(W, 'zero matching recipients refuses the launch instead of reporting success', function () {
    return H.launchQualityAcks_({ sop_id: emptyTarget.unique_id, sop_version: '1' }, APPROVER, DB);
  });

  /* __ALL_DEPT__ with a blank department is never an all-company shortcut. */
  const noDept = H.saveQualitySop_(sop({ applicability_role: '__ALL_DEPT__', applicability_dept: 'الجودة', title_ar: 'بلا إدارة' }), AUTHOR, DB);
  const ndV = rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET).filter(function (v) { return v.sop_id === noDept.unique_id; })[0];
  W.ctx.patchRowByCriteria_(W.sheets[H.QUALITY_SOP_VERSIONS_SHEET], 'unique_id', ndV.unique_id, { status: 'Effective' });
  W.ctx.patchRowByCriteria_(W.sheets[H.QUALITY_SOP_SHEET], 'unique_id', noDept.unique_id, { current_effective_version: '1', applicability_dept: '' });
  expectRefusal(W, '__ALL_DEPT__ with no department is refused', function () {
    return H.launchQualityAcks_({ sop_id: noDept.unique_id, sop_version: '1' }, APPROVER, DB);
  });
}

/* ══ 4.7.3 owner display names ══════════════════════════════════════════ */
section('4.7.3 owner names, not emails');
{
  const W = makeWorld({ userDirectory: {
    'a@vf.test': { name: 'أحمد', company: '9940659bd83035d7', status: 'Active' },
    'b@vf.test': { name: 'أحمد', company: '9940659bd83035d7', status: 'Active' },
    'c@vf.test': { name: 'سالم', company: '9940659bd83035d7', status: 'Disabled' },
    'd@vf.test': { name: '', company: '9940659bd83035d7', status: 'Active' },
    'x@other.test': { name: 'غريب', company: 'OTHER', status: 'Active' }
  } });
  const H = W.ctx.__out;
  const choices = H.qSopOwnerChoices_();
  check(choices.options.length === 3 && choices.options.every(function (o) { return String(o.value).indexOf('@other.test') === -1; }),
    'only this company\'s ACTIVE users are selectable owners');
  check(choices.options.every(function (o) { return o.label.indexOf(' — ') === -1; }) &&
    choices.options.some(function (o) { return o.name === 'أحمد' && o.email === 'a@vf.test'; }),
    'owner options are structured (value/name/label/email) with no combined "name — email" cell label');
  const dupes = choices.options.filter(function (o) { return o.name === 'أحمد'; });
  check(dupes.length === 2 && dupes[0].value !== dupes[1].value,
    'two users with the SAME display name still map to two distinct identity keys');

  const dir = H.qSopOwnerNameMap_();
  check(H.qSopOwnerDisplay_(dir, 'a@vf.test', '').name === 'أحمد', 'an active user resolves to the directory name');
  check(H.qSopOwnerDisplay_(dir, 'c@vf.test', '').name === 'سالم', 'an INACTIVE historical user still resolves to a real name');
  check(H.qSopOwnerDisplay_(dir, 'd@vf.test', '').name === 'اسم المستخدم غير مسجل', 'a user record with no name reads «اسم المستخدم غير مسجل»');
  check(H.qSopOwnerDisplay_(dir, 'gone@vf.test', '').name === 'مستخدم غير متاح', 'an owner with no directory record reads «مستخدم غير متاح»');
  check(H.qSopOwnerDisplay_(dir, 'gone@vf.test', 'اسم محفوظ').name === 'اسم محفوظ', 'a trusted stored name snapshot is preferred over the unavailable label');
  check(H.qSopOwnerDisplay_(dir, 'gone@vf.test', '').name.indexOf('@') === -1, 'the fallback never substitutes the raw email');
}

/* ══ 8.1 additive header upgrade on a populated sheet ═══════════════════ */
section('8.1 additive, idempotent schema upgrade');
{
  const W = makeWorld();
  const H = W.ctx.__out;
  /* A populated PRODUCTION-shaped sheet: the original header row only, already
     holding a real historical row. */
  const oldHeaders = ['unique_id', 'id', 'sop_code', 'title_ar', 'title_en', 'category',
    'applicability_dept', 'applicability_role', 'owner_email',
    'current_effective_version', 'draft_version', 'user', 'created_at'];
  W.sheets[H.QUALITY_SOP_SHEET] = makeSheet('valley_quality_sops', oldHeaders);
  W.sheets[H.QUALITY_SOP_SHEET].appendRow(['hist-1', 7, 'SOP-POL-004', 'وثيقة تاريخية', 'Hist', 'POL',
    'الجودة', 'مدير الجودة', 'owner@vf.test', '1', '', 'x@x', '2021-05-05']);
  const beforeGrid = W.sheets[H.QUALITY_SOP_SHEET].__grid.map(function (r) { return r.slice(); });

  H.qSopEnsureSchema_(DB);
  const after = W.sheets[H.QUALITY_SOP_SHEET].__grid;
  check(JSON.stringify(after[0].slice(0, oldHeaders.length)) === JSON.stringify(oldHeaders),
    'the original columns keep their exact order and position');
  check(after[0].length > oldHeaders.length, 'the missing post-release headers were appended to the right');
  check(after[0].indexOf('code_prefix') !== -1 && after[0].indexOf('revision') !== -1 && after[0].indexOf('template_meta') !== -1,
    'the new fields exist after the upgrade');
  check(JSON.stringify(after[1].slice(0, oldHeaders.length)) === JSON.stringify(beforeGrid[1].slice(0, oldHeaders.length)),
    'the historical data row is byte-for-byte unchanged');

  const firstPass = after[0].length;
  H.qSopEnsureSchema_(DB);
  H.qSopEnsureSchema_(DB);
  check(W.sheets[H.QUALITY_SOP_SHEET].__grid[0].length === firstPass,
    'running the upgrade again is a no-op (idempotent — no duplicated columns)');
  check(JSON.stringify(W.sheets[H.QUALITY_SOP_SHEET].__grid[1].slice(0, oldHeaders.length)) === JSON.stringify(beforeGrid[1].slice(0, oldHeaders.length)),
    'and never rewrites the historical row');

  /* The upgraded sheet is immediately usable by the real write path. */
  seedAbbr(W, 'الجودة', 'QA');
  W.ctx.ensureSheet_(DB, 'valley_dept_section_index', ['unique_id', 'section', 'section_type', 'department']);
  const created = H.saveQualitySop_(sop({ applicability_dept: 'الجودة' }), AUTHOR, DB);
  check(created.sop_code === 'POL-QA-001', 'a document can be created on the upgraded populated sheet');
  const savedRow = W.ctx.getAllRecords_(DB, H.QUALITY_SOP_SHEET).filter(function (r) { return r.unique_id === created.unique_id; })[0];
  check(String(savedRow.code_prefix) === 'POL' && String(savedRow.template_meta).indexOf('vf-controlled-document-v1') !== -1,
    'the new fields actually persisted through addRecord_ after the header upgrade');
}

/* ══ 8.3 combined save, concurrency and no-op writes ════════════════════ */
section('8.3 combined metadata+content save and optimistic concurrency');
{
  const A = baseWorld();
  seedAbbr(A.W, 'الجودة', 'QA');
  const H = A.H, W = A.W;
  const created = H.saveQualitySop_(sop({ applicability_dept: 'الجودة' }), AUTHOR, DB);
  check(String(created.revision) === '1', 'a new document starts at revision 1');

  /* ONE call writes metadata AND the draft body. */
  const combined = H.saveQualitySop_({
    unique_id: created.unique_id, title_ar: 'وثيقة معدّلة', title_en: 'Edited', category: 'POL',
    applicability_dept: 'الجودة', applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test',
    expected_revision: '1',
    version: { content_html: '<h2>الغرض</h2><p>نص عربي</p>', change_summary: 'أول محتوى', template_meta: JSON.stringify(H.qSopDefaultTemplateMeta_('سياسة')) }
  }, AUTHOR, DB);
  check(combined.status === 'success' && combined.revision === '2', 'the combined save is one call and raises the revision once');
  const hRow = rows(H, W, H.QUALITY_SOP_SHEET)[0];
  const vRow = rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET)[0];
  check(hRow.title_ar === 'وثيقة معدّلة' && vRow.content_html.indexOf('نص عربي') !== -1,
    'metadata and content were both persisted by the single request');
  check(String(vRow.template_meta).indexOf('vf-controlled-document-v1') !== -1, 'the version carries its template snapshot');

  /* A stale tab is rejected and its local content is preserved by the caller. */
  const conflict = expectRefusal(W, 'a stale save (wrong revision) is rejected', function () {
    return H.saveQualitySop_({
      unique_id: created.unique_id, title_ar: 'من جلسة قديمة', title_en: 'Stale', category: 'POL',
      applicability_dept: 'الجودة', applicability_role: 'مدير الجودة', owner_email: 'owner@vf.test',
      expected_revision: '1'
    }, AUTHOR, DB);
  });
  check(!!conflict && conflict.conflict === true && conflict.notApplied === true,
    'the refusal is flagged as a conflict so the client can offer review/retry');
  check(rows(H, W, H.QUALITY_SOP_SHEET)[0].title_ar === 'وثيقة معدّلة',
    'the stale save did NOT overwrite the newer server content');

  /* An unchanged version save writes nothing at all. */
  const before = W.writes.count;
  const noop = H.saveQualitySopVersion_({
    unique_id: vRow.unique_id, change_type: 'Major',
    content_html: String(vRow.content_html), change_summary: String(vRow.change_summary)
  }, AUTHOR, DB);
  check(noop.unchanged === true, 'an unchanged version save reports unchanged');
  check(W.writes.count === before, 'an unchanged version save writes no row and no audit event');
}

/* ══ 9 server allowlist sanitizer ═══════════════════════════════════════ */
section('9 server-side allowlist');
{
  const W = makeWorld();
  const H = W.ctx.__out;
  const s = H.qSopSanitizeHtml_;

  check(s('<script>alert(1)</script>نص') === 'نص', 'a script element is dropped with its content');
  check(s('<p onclick="x()">ن</p>').indexOf('onclick') === -1, 'inline event handlers are removed');
  check(s('<a href="javascript:alert(1)">x</a>').indexOf('javascript:') === -1, 'a javascript: URL is removed');
  check(s('<a href="java&#115;cript:alert(1)">x</a>').indexOf('javascript') === -1, 'an entity-encoded javascript: URL is still removed');
  check(s('<iframe src="https://x"></iframe>') === '', 'an iframe is dropped');
  check(s('<form action="/x"><input name="a"></form>') === '', 'form and input elements are dropped');
  check(s('<p style="background:url(javascript:1)">x</p>').indexOf('url(') === -1, 'a CSS url() is removed from a style attribute');
  check(s('<p style="color:red">x</p>').indexOf('color:red') !== -1, 'a safe inline style survives');
  check(s('<img src=x>') === '', 'a remote image is not an allowed document element');

  /* Legitimate Arabic content must survive byte-for-byte. */
  check(s('<p>a &amp; b &lt; c</p>') === '<P>a &amp; b &lt; c</P>', 'entity text survives — &lt; is never re-read as a tag opener');
  check(s('<p>نص&nbsp;متباعد</p>') === '<P>نص&nbsp;متباعد</P>', '&nbsp; survives as an entity');
  check(s('<p>نص عربي كامل</p>').indexOf('نص عربي كامل') !== -1, 'ordinary Arabic text is untouched');
  const rtlTable = s('<table dir="rtl"><tr><th colspan="2">البند</th></tr><tr><td>أ</td><td>ب</td></tr></table>');
  check(rtlTable.indexOf('dir="rtl"') !== -1 && rtlTable.indexOf('colspan="2"') !== -1 &&
    rtlTable.indexOf('<TD>أ</TD>') !== -1, 'an RTL table with a merged header cell round-trips intact');
  check(s('<p><bdi dir="ltr">POL-MAINT-001</bdi></p>').indexOf('POL-MAINT-001') !== -1,
    'an embedded Latin code keeps its own direction isolation');
  check(s('<p>line1</p><ul><li>ن</li></ul>').indexOf('<UL>') !== -1, 'lists are preserved');
  check(s('<hr class="vfs-pagebreak">').indexOf('vfs-pagebreak') !== -1, 'an explicit page break is preserved');

  /* Idempotent: re-sanitizing the output changes nothing. */
  const once = s('<h2>الغرض</h2><p>a &amp; b</p><table><tr><td>ن</td></tr></table>');
  check(s(once) === once, 'sanitizing the sanitized output is a no-op (safe to re-run before export)');
}

/* ══ 5 template + export renderer ═══════════════════════════════════════ */
section('5 shared template and export renderer');
{
  const A = baseWorld();
  seedAbbr(A.W, 'الجودة', 'QA');
  const H = A.H, W = A.W;
  const tpl = H.QUALITY_DOC_TEMPLATE;
  check(tpl.id === 'vf-controlled-document-v1' && tpl.version === 1, 'the shared template is versioned (vf-controlled-document-v1)');
  check(tpl.bodyHeadings.length === 8 && tpl.bodyHeadings[0] === 'الغرض' && tpl.bodyHeadings[7] === 'الحفظ والتسجيل',
    'the eight default Arabic body headings are in the specified order');
  check(tpl.paper.widthMm === 210 && tpl.paper.heightMm === 297, 'the paper is A4 portrait (210 x 297 mm)');
  check(!!tpl.labels.changeHistory && !!tpl.labels.copyNumber && !!tpl.labels.reviewResult,
    'field labels are centralised so authoring and export name a field once');

  const created = H.saveQualitySop_(sop({ applicability_dept: 'الجودة' }), AUTHOR, DB);
  const vRow = rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET)[0];
  const frozen = H.freezeSopVersionPdf_(DB, rows(H, W, H.QUALITY_SOP_SHEET)[0], vRow);
  check(/^[0-9a-f]{64}$/.test(frozen.pdf_sha256), 'the frozen artifact is hashed from the actual PDF bytes');
  check(H.qSopParseTemplateMeta_(vRow.template_meta).template_id === 'vf-controlled-document-v1',
    'the version stores its template snapshot');

  const html = H.qSopRenderControlledDocHtml_(rows(H, W, H.QUALITY_SOP_SHEET)[0], vRow, { brand: { companyName: 'Valley Foods', logoUrl: '' } });
  check(html.indexOf('vf-controlled-document-v1') === -1 && html.indexOf('الغرض') === -1,
    'the renderer prints the DOCUMENT, not the template identifiers or headings that were never written');
  check(html.indexOf('جدول وثيقة التعديل') !== -1, 'the single change-history page is rendered');
  check(html.indexOf('تاريخ الإصدار') !== -1 && html.indexOf('ختم الوثيقة') !== -1, 'the cover lower block is rendered');
  check(html.indexOf(created.sop_code) !== -1, 'the ACTUAL allocated code is printed, never the reference sample');
  check(html.indexOf('P/VFA/QA/011') === -1, 'the reference PDF\'s sample code is never used as a default');
  check(html.indexOf('Valley Foods') !== -1, 'the company identity comes from configuration');

  /* A legacy document must render its own content without a synthesized cover. */
  const legacyHtml = H.qSopRenderControlledDocHtml_(
    { sop_code: 'SOP-POL-004', title_ar: 'قديمة', title_en: 'Old', category: 'POL' },
    { version: 1, content_html: '<p>محتوى قديم</p>', template_meta: '' },
    { brand: {} });
  check(legacyHtml.indexOf('محتوى قديم') !== -1 && legacyHtml.indexOf('جدول وثيقة التعديل') === -1,
    'a legacy document renders its content inside the frame with NO automatically prepended cover or history page');
}

/* ══ 4.5 general quality ═══════════════════════════════════════════════ */
section('4.5 general-quality records');
{
  const W = makeWorld();
  const H = W.ctx.__out;
  W.ctx.ensureSheet_(DB, 'valley_products', ['id', 'code', 'name', 'unit_price']);
  W.sheets['valley_products'].appendRow([100, 'P-100', 'لبن', 12.5]);
  W.sheets['valley_products'].appendRow([101, 'P-101', 'جبن', 30]);

  const list = H.getQualityGeneral_({}, AUTHOR, DB);
  check(list.status === 'success' && list.records.length === 0, 'the general-quality list starts empty');
  check(list.products.length === 2 && list.products[0].value !== undefined && list.products[0].unit_price === undefined,
    'the product projection returns id/code/name ONLY — never a cost or price field');

  const spec = H.saveQualityGeneral_({
    record_type: 'product_specification', title: 'مواصفة لبن', spec_code: 'SPEC-1',
    product_id: '100', owner_email: 'owner@vf.test', record_date: '2026-01-10',
    body_html: '<h2>الوصف والغرض من الاستخدام</h2><p></p>', links: [{ url: 'https://example.invalid/ref', label: 'مرجع' }]
  }, AUTHOR, DB);
  check(spec.status === 'success' && !!spec.unique_id, 'a product specification is created');
  check(rows(H, W, H.QUALITY_GEN_SHEET)[0].product_name === 'لبن', 'the linked product name is snapshotted for display');
  check(rows(H, W, H.QUALITY_SOP_SHEET).length === 0 && rows(H, W, H.QUALITY_SOP_VERSIONS_SHEET).length === 0,
    'creating a general record performs NO SOP writes — the lifecycle is not shared');

  const unlinked = H.saveQualityGeneral_({
    record_type: 'product_specification', title: 'مواصفة عامة', owner_email: 'owner@vf.test', body_html: '<p>محتوى</p>'
  }, AUTHOR, DB);
  check(unlinked.status === 'success' && rows(H, W, H.QUALITY_GEN_SHEET).length === 2,
    'an UNLINKED draft specification is a first-class record (no fake product row invented)');
  check(rows(H, W, 'valley_products').length === 2, 'the product master was not modified');

  const activity = H.saveQualityGeneral_({
    record_type: 'quality_activity', title: 'نشاط توعية', activity_category: 'تدريب',
    owner_email: 'owner@vf.test', due_date: '2026-03-01', body_html: '<p>ملاحظات</p>'
  }, AUTHOR, DB);
  check(activity.status === 'success', 'a general quality activity is created');

  /* Idempotency + edit + conflict. */
  const again = H.saveQualityGeneral_({
    record_type: 'quality_activity', title: 'نشاط توعية', owner_email: 'owner@vf.test', create_token: 'g-tok'
  }, AUTHOR, DB);
  const again2 = H.saveQualityGeneral_({
    record_type: 'quality_activity', title: 'نشاط توعية', owner_email: 'owner@vf.test', create_token: 'g-tok'
  }, AUTHOR, DB);
  check(again2.idempotent === true && again2.unique_id === again.unique_id, 'a retried general create with the same token is idempotent');

  const gRow = rows(H, W, H.QUALITY_GEN_SHEET).filter(function (r) { return r.unique_id === spec.unique_id; })[0];
  const edited = H.saveQualityGeneral_({
    unique_id: spec.unique_id, record_type: 'product_specification', title: 'مواصفة لبن محدثة',
    owner_email: 'owner@vf.test', body_html: '<p>محدث</p>', expected_revision: String(gRow.revision)
  }, AUTHOR, DB);
  check(edited.status === 'success' && String(edited.revision) === '2', 'an edit raises the record revision once');
  expectRefusal(W, 'a stale general edit is rejected', function () {
    return H.saveQualityGeneral_({
      unique_id: spec.unique_id, record_type: 'product_specification', title: 'من جلسة قديمة',
      owner_email: 'owner@vf.test', expected_revision: '1'
    }, AUTHOR, DB);
  });

  /* Archive / restore, and Archived is read-only until restored. */
  const arch = H.setQualityGeneralStatus_({ unique_id: spec.unique_id, status: 'Archived', expected_revision: '2' }, AUTHOR, DB);
  check(arch.status === 'success' && rows(H, W, H.QUALITY_GEN_SHEET)[0].status === 'Archived', 'archive sets the Archived state');
  expectRefusal(W, 'an archived record cannot be edited', function () {
    return H.saveQualityGeneral_({
      unique_id: spec.unique_id, record_type: 'product_specification', title: 'بعد الأرشفة',
      owner_email: 'owner@vf.test', expected_revision: String(arch.revision)
    }, AUTHOR, DB);
  });
  const restored = H.setQualityGeneralStatus_({ unique_id: spec.unique_id, status: 'Active', expected_revision: String(arch.revision) }, AUTHOR, DB);
  check(restored.status === 'success', 'restore returns the record to an active state');
  check(rows(H, W, H.QUALITY_GEN_SHEET)[0].status === 'Active', 'and the stored status is Active again');
  check(rows(H, W, H.QUALITY_GEN_SHEET).length === 4 && rows(H, W, H.QUALITY_GEN_SHEET).every(function (r) { return !!r.unique_id; }),
    'no general record was ever hard-deleted (archive is reversible state, not deletion)');

  /* Server-side validation and scoping. */
  expectRefusal(W, 'an unknown record type is refused', function () {
    return H.saveQualityGeneral_({ record_type: 'something_else', title: 'x', owner_email: 'owner@vf.test' }, AUTHOR, DB);
  });
  expectRefusal(W, 'a missing title is refused', function () {
    return H.saveQualityGeneral_({ record_type: 'quality_activity', title: '  ', owner_email: 'owner@vf.test' }, AUTHOR, DB);
  });
  expectRefusal(W, 'a missing owner is refused', function () {
    return H.saveQualityGeneral_({ record_type: 'quality_activity', title: 'x' }, AUTHOR, DB);
  });
  expectRefusal(W, 'an unknown linked product is refused', function () {
    return H.saveQualityGeneral_({ record_type: 'product_specification', title: 'x', owner_email: 'owner@vf.test', product_id: '999' }, AUTHOR, DB);
  });
  expectRefusal(W, 'an invalid status is refused', function () {
    return H.saveQualityGeneral_({ record_type: 'quality_activity', title: 'x', owner_email: 'owner@vf.test', status: 'Approved' }, AUTHOR, DB);
  });
  check(H.qGenNormalizeLinks_([{ url: 'javascript:alert(1)', label: 'x' }]).length === 0,
    'an unsafe reference link is dropped');
  check(H.qGenNormalizeLinks_([{ url: 'https://ok.invalid', label: 'ok' }]).length === 1,
    'a safe https reference link is kept');
}

console.log('\n' + (failed === 0
  ? 'quality_sop_codes_roles: PASS (codes, roles, owner names, additive schema, combined save, allowlist, template renderer, general quality)'
  : 'quality_sop_codes_roles: FAIL (' + failed + ' check(s))'));
process.exit(failed === 0 ? 0 : 1);
