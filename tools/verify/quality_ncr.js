'use strict';
/* QUALITY-NCR — offline proof for the Valley Foods NCR/CAPA server block.

   The REAL "QUALITY MODULE (v2)" block is sliced out of
   Company_ValleyFoods_Actions.js (banner to banner) together with the REAL
   settingsUniqueViolation_ from the same file, and the REAL
   requireAttachmentBinding_/extractDriveId_ plus the REAL
   _normalizeAccess_/_hasUnifiedAccess_/unifiedCheck_ gate from Code.js. It runs
   in a vm over fake Sheets with captured writes and a deterministic uidV7_.
   Nothing touches a spreadsheet, a Google service or the network.

   Proves: every illegal NCR/CAPA transition is refused BEFORE any mutation
   (the write counter stays 0); the full legal path with a linked CAPA
   (Open -> In Review -> CAPA Assigned -> Implemented -> Verified -> Closed)
   and the no-CAPA completion path; the overdue rule (due_date < today AND
   status not in {Done, Verified, Closed}) computed server-side; CAPA
   effectiveness approval (Done->Verified, Verified->Closed) demands the real
   full grant; codes are NCR-/CAPA-<YYYY>-NNN and unique; standalone CAPAs are
   allowed; attachments use requireAttachmentBinding_.

   Run: node tools/verify/quality_ncr.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const code = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');

const START = '  // ===================== QUALITY MODULE (v2) =====================';
const END = '  // ===================== QUALITY MODULE END =====================';
const blockStart = source.indexOf(START);
const blockEnd = source.indexOf(END);
if (blockStart < 0 || blockEnd < blockStart) {
  console.error('quality_ncr: QUALITY MODULE block not found in Company_ValleyFoods_Actions.js');
  process.exit(1);
}
const block = source.slice(blockStart, blockEnd + END.length);

const suStart = source.indexOf('  function settingsUniqueViolation_(');
const suEnd = source.indexOf('\n  }', suStart);
if (suStart < 0 || suEnd < suStart) {
  console.error('quality_ncr: settingsUniqueViolation_ not found');
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

/* ══ wiring: PAGE_ACCESS / ACTION_TABLES / registration ═══════════════ */
function grabBlock(header) {
  const start = source.indexOf(header); assert(start >= 0, header);
  const end = source.indexOf('\n  };', start); assert(end >= 0, header + ' end');
  return source.slice(start, end + 5);
}
const wiringCtx = { HR_EMPLOYEES_SHEET: 'vf_hr_employees', console: console };
vm.createContext(wiringCtx);
vm.runInContext(grabBlock('const PAGE_ACCESS = {') + '\n' + grabBlock('const ACTION_TABLES = {') +
  '\n__out = { PAGE_ACCESS: PAGE_ACCESS, ACTION_TABLES: ACTION_TABLES };', wiringCtx);
const PAGE_ACCESS = wiringCtx.__out.PAGE_ACCESS;
const ACTION_TABLES = wiringCtx.__out.ACTION_TABLES;

const NCR_SHEET = 'valley_quality_ncrs';
const CAPA_SHEET = 'valley_quality_capas';
const EXPECTED_ACCESS = {
  get_quality_ncr: { page: 'vf_quality_ncr', access: 'read' },
  save_quality_ncr: { page: 'vf_quality_ncr', access: 'write' },
  save_quality_capa: { page: 'vf_quality_ncr', access: 'write' },
  change_quality_ncr_status: { page: 'vf_quality_ncr', access: 'write' },
  close_quality_ncr: { page: 'vf_quality_ncr', access: 'full' }
};
const EXPECTED_TABLES = {
  get_quality_ncr: [NCR_SHEET, CAPA_SHEET, 'valley_legal_customer_vendor'],
  save_quality_ncr: [NCR_SHEET, 'valley_legal_customer_vendor'],
  save_quality_capa: [CAPA_SHEET, NCR_SHEET],
  change_quality_ncr_status: [NCR_SHEET, CAPA_SHEET],
  close_quality_ncr: [NCR_SHEET, CAPA_SHEET]
};
Object.keys(EXPECTED_ACCESS).forEach(function (action) {
  const e = PAGE_ACCESS[action] || {};
  check(e.page === EXPECTED_ACCESS[action].page && e.access === EXPECTED_ACCESS[action].access,
    'PAGE_ACCESS ' + action + ' -> ' + EXPECTED_ACCESS[action].page + '/' + EXPECTED_ACCESS[action].access);
  check(Array.isArray(ACTION_TABLES[action]) && JSON.stringify(ACTION_TABLES[action]) === JSON.stringify(EXPECTED_TABLES[action]),
    'ACTION_TABLES ' + action + ' declares its full table array');
});
check(source.indexOf("ValleyFoods.register('get_quality_ncr', getQualityNcr_)") !== -1,
  'get_quality_ncr is registered without a ref bust (read)');
['save_quality_ncr', 'save_quality_capa', 'change_quality_ncr_status', 'close_quality_ncr'].forEach(function (action) {
  check(source.indexOf("ValleyFoods.register('" + action + "', withRefBust_(") !== -1,
    action + ' is registered wrapped in withRefBust_');
});

/* ══ fake Sheets ═════════════════════════════════════════════════════ */
function makeWorld() {
  const sheets = {};
  const writes = { count: 0 };
  const history = [];
  let uidSeq = 0, idSeq = 0;

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
    Utilities: { getUuid: () => crypto.randomUUID() },
    COMPANY_UID: '9940659bd83035d7',
    noteMutation_() {},
    vfBustRefs_() {},
    executeWithLock_: (fn) => fn(),
    uidV7_: () => 'uid-' + String(++uidSeq).padStart(4, '0'),
    getNextIdUnderLock_: () => ++idSeq,
    ensureSheet_, getSheet_, getHeaders_, getAllRecords_, safeRows_, addRecord_, patchRowByCriteria_, deleteRowsByCriteria_,
    logHistory_, vfNotApplied_
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const exportLine = '\n__out = {' +
    ' getQualityNcr_: getQualityNcr_, saveQualityNcr_: saveQualityNcr_, saveQualityCapa_: saveQualityCapa_,' +
    ' changeQualityNcrStatus_: changeQualityNcrStatus_, closeQualityNcr_: closeQualityNcr_,' +
    ' QUALITY_NCR_HEADERS: QUALITY_NCR_HEADERS, QUALITY_CAPA_HEADERS: QUALITY_CAPA_HEADERS,' +
    ' QUALITY_NCR_STATUSES: QUALITY_NCR_STATUSES, QUALITY_CAPA_STATUSES: QUALITY_CAPA_STATUSES,' +
    ' QUALITY_CAPA_ACTION_TYPES: QUALITY_CAPA_ACTION_TYPES,' +
    ' QUALITY_NCR_SHEET: QUALITY_NCR_SHEET, QUALITY_CAPA_SHEET: QUALITY_CAPA_SHEET };';
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
  return { ctx, sheets, writes, history };
}

/* ══ scenarios ══════════════════════════════════════════════════════ */
const DB = 'db-1';
const COMPANY = '9940659bd83035d7';
const WRITER = { email: 'qa@vf.test', company: COMPANY, authorizedPages: { vf_quality_ncr: ['write'] } };
const FULLER = { email: 'qc.manager@vf.test', company: COMPANY, authorizedPages: { vf_quality_ncr: ['full'] } };

const W = makeWorld();
const H = W.ctx.__out;

function rows(sheet) { return W.ctx.getAllRecords_(DB, sheet); }
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
function expectThrow(label, fn, msgRe) {
  const before = W.writes.count;
  let err = null;
  try { fn(); } catch (e) { err = e; }
  check(!!err && (!msgRe || msgRe.test(err.message)), label);
  check(W.writes.count === before, label + ' — zero writes before the refusal');
  return err;
}
function createNcr(extra) {
  return H.saveQualityNcr_(Object.assign({ description: 'وصف عدم مطابقة' }, extra || {}), WRITER, DB);
}
function createCapa(extra) {
  return H.saveQualityCapa_(Object.assign({ action_type: 'Corrective', description: 'وصف إجراء تصحيحي', owner_email: 'qa@vf.test' }, extra || {}), WRITER, DB);
}
function ncrMove(uid, to, extra, user) {
  return H.changeQualityNcrStatus_(Object.assign({ unique_id: uid, to_status: to }, extra || {}), user || WRITER, DB);
}
function capaMove(uid, to, extra, user) {
  return H.saveQualityCapa_(Object.assign({ unique_id: uid, status: to }, extra || {}), user || WRITER, DB);
}
function todayIso_(offset) {
  const d = new Date();
  const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) + (offset || 0) * 86400000;
  const x = new Date(t);
  return x.getUTCFullYear() + '-' + ('0' + (x.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + x.getUTCDate()).slice(-2);
}
const YEAR = String(new Date().getFullYear());
function effectiveness(extra) {
  return Object.assign({ effectiveness_check_date: todayIso_(0), effectiveness_criteria: 'مقارنة السجل المستهدف بالنتيجة',
    monitoring_period: 'فترة الرصد المعتمدة من مالك العملية', effectiveness_outcome: 'Effective',
    recurrence_result: 'No recurrence', effectiveness_evidence: 'نتائج الفحص موثقة' }, extra || {});
}

/* ---- constants and lazy table creation ---- */
check(H.QUALITY_NCR_STATUSES.join('|') === 'Open|In Review|CAPA Assigned|Implemented|Verified|Closed|Cancelled|Rejected',
  'NCR statuses constant matches the lifecycle');
check(H.QUALITY_CAPA_STATUSES.join('|') === 'Assigned|In Progress|Done|Verified|Closed',
  'CAPA statuses constant matches the lifecycle');
check(H.QUALITY_CAPA_ACTION_TYPES.join('|') === 'Corrective|Preventive', 'action types are Corrective|Preventive');

const read0 = H.getQualityNcr_({}, WRITER, DB);
check(read0.status === 'success' && Array.isArray(read0.ncrs) && read0.ncrs.length === 0 && Array.isArray(read0.capas) && read0.capas.length === 0,
  'get_quality_ncr returns empty ncrs and capas before anything exists');
check(!!W.sheets[NCR_SHEET] && !!W.sheets[CAPA_SHEET], 'get_quality_ncr lazily creates both tables');
const ncrHeaders = W.sheets[NCR_SHEET].__grid[0];
const capaHeaders = W.sheets[CAPA_SHEET].__grid[0];
check(ncrHeaders[0] === 'unique_id' && ncrHeaders[1] === 'id' && ncrHeaders.indexOf('user') === 21 && ncrHeaders.indexOf('created_at') === 22,
  'NCR additive fields remain after the original base columns');
check(capaHeaders[0] === 'unique_id' && capaHeaders[1] === 'id' && capaHeaders.indexOf('user') === 16 && capaHeaders.indexOf('created_at') === 17,
  'CAPA additive fields remain after the original base columns');
check(['ncr_code', 'ncr_date', 'description', 'status', 'root_cause', 'disposition', 'capa_required', 'capa_justification', 'closed_by', 'closed_at', 'attachment', 'attachment_id'].every(h => ncrHeaders.indexOf(h) !== -1),
  'NCR headers carry every planned column');
check(['capa_code', 'ncr_id', 'action_type', 'description', 'owner_email', 'due_date', 'effectiveness_check_date', 'status', 'implemented_at', 'verified_by', 'verified_at', 'effectiveness_notes', 'attachment', 'attachment_id'].every(h => capaHeaders.indexOf(h) !== -1),
  'CAPA headers carry every planned column');
check(['affected_quantity', 'affected_unit', 'order_scope', 'inventory_affected', 'wip_affected', 'shipped_affected', 'hold_status', 'containment_action', 'final_disposition'].every(h => ncrHeaders.indexOf(h) !== -1),
  'NCR has additive food traceability and separate containment/disposition fields');
check(['implementation_evidence', 'effectiveness_criteria', 'monitoring_period', 'effectiveness_outcome', 'recurrence_result', 'effectiveness_evidence', 'reopen_rationale'].every(h => capaHeaders.indexOf(h) !== -1),
  'CAPA separates implementation evidence from effectiveness verification data');

/* ---- create: NCR-<YYYY>-NNN, Open defaults ---- */
const ncr1 = createNcr({ severity: 'Major', source: 'داخلي', department: 'الجودة', product_id: 'P-1', batch_code: 'B-1' });
check(ncr1.status === 'success' && ncr1.ncr_code === 'NCR-' + YEAR + '-001' && ncr1.row_status === 'Open',
  'create allocates NCR-<YYYY>-001 and starts Open');
check(ncrRow(ncr1.unique_id).ncr_date === todayIso_(0) && ncrRow(ncr1.unique_id).detected_by === WRITER.email,
  'create defaults ncr_date to today and detected_by to the caller');
check(ncrRow(ncr1.unique_id).capa_required === 'FALSE' && ncrRow(ncr1.unique_id).capa_justification === '',
  'create stores explicit FALSE flag and empty justification');
const ncr2 = createNcr({ description: 'عدم مطابقة ثانية' });
check(ncr2.ncr_code === 'NCR-' + YEAR + '-002', 'second NCR in the year is -002');
expectRefusal('invalid NCR date', () => createNcr({ ncr_date: '2026-02-30' }));
expectRefusal('negative affected quantity', () => createNcr({ affected_quantity: -1, affected_unit: 'كجم' }));
expectRefusal('affected quantity without a unit', () => createNcr({ affected_quantity: 2 }));
const ncrCodes = rows(H.QUALITY_NCR_SHEET).map(r => r.ncr_code);
check(new Set(ncrCodes).size === ncrCodes.length && ncrCodes.every(c => /^NCR-\d{4}-\d{3}$/.test(c)),
  'every ncr_code matches NCR-<YYYY>-NNN and stays unique');

/* ---- update while Open / In Review, refusal afterwards ---- */
const ncrEdit = createNcr({ description: 'قبل التعديل' });
const edited = H.saveQualityNcr_({ unique_id: ncrEdit.unique_id, description: 'بعد التعديل', severity: 'Critical', ncr_date: '2026-01-02' }, WRITER, DB);
check(edited.status === 'success' && edited.row_status === 'Open' && edited.ncr_code === ncrEdit.ncr_code,
  'update while Open returns the same code and the current status');
check(ncrRow(ncrEdit.unique_id).description === 'بعد التعديل' && ncrRow(ncrEdit.unique_id).severity === 'Critical' && ncrRow(ncrEdit.unique_id).ncr_date === '2026-01-02',
  'update patches the header fields');
check(ncrRow(ncrEdit.unique_id).detected_by === WRITER.email, 'update keeps detected_by when it is omitted');

/* ---- full legal path with a linked CAPA ---- */
const ncrMain = createNcr({ description: 'جسم غريب في خط التعبئة' });
expectRefusal('review without root_cause', () => ncrMove(ncrMain.unique_id, 'In Review', { disposition: 'عزل الدفعة' }));
expectRefusal('review without disposition', () => ncrMove(ncrMain.unique_id, 'In Review', { root_cause: 'تسرب زيت' }));
const reviewed = ncrMove(ncrMain.unique_id, 'In Review', { root_cause: 'تسرب زيت من الضاغط', disposition: 'عزل الدفعة وإيقاف الخط' });
check(reviewed.row_status === 'In Review' && ncrRow(ncrMain.unique_id).status === 'In Review',
  'Open -> In Review is allowed');
check(ncrRow(ncrMain.unique_id).root_cause === 'تسرب زيت من الضاغط' && ncrRow(ncrMain.unique_id).disposition === 'عزل الدفعة وإيقاف الخط' && ncrRow(ncrMain.unique_id).containment_action === 'عزل الدفعة وإيقاف الخط',
  'review stores the root cause and explicit containment action while retaining the legacy field');
expectRefusal('CAPA Assigned with capa_required false', () => ncrMove(ncrMain.unique_id, 'CAPA Assigned', { capa_required: false }));
expectRefusal('CAPA Assigned with no linked CAPA', () => ncrMove(ncrMain.unique_id, 'CAPA Assigned', { capa_required: true }));
const capa1 = createCapa({ ncr_id: ncrMain.unique_id, description: 'استبدال مانع التسرب', owner_email: 'maint@vf.test', due_date: todayIso_(3) });
check(capa1.status === 'success' && capa1.capa_code === 'CAPA-' + YEAR + '-001' && capa1.row_status === 'Assigned',
  'linked CAPA is created Assigned with CAPA-<YYYY>-001');
check(capaRow(capa1.unique_id).ncr_id === ncrMain.unique_id && capaRow(capa1.unique_id).implemented_at === '',
  'CAPA stores its NCR link and an empty implemented_at');
const assigned = ncrMove(ncrMain.unique_id, 'CAPA Assigned', { capa_required: true });
check(assigned.row_status === 'CAPA Assigned' && ncrRow(ncrMain.unique_id).capa_required === 'TRUE',
  'In Review -> CAPA Assigned stores capa_required TRUE');
expectRefusal('edit NCR after implementation started', () => H.saveQualityNcr_({ unique_id: ncrMain.unique_id, description: 'تعديل متأخر' }, WRITER, DB));
expectRefusal('Implement before all CAPAs are Done', () => ncrMove(ncrMain.unique_id, 'Implemented'));
expectRefusal('NCR CAPA Assigned -> Verified', () => ncrMove(ncrMain.unique_id, 'Verified'));
expectRefusal('NCR CAPA Assigned -> Closed', () => ncrMove(ncrMain.unique_id, 'Closed'));
expectRefusal('NCR CAPA Assigned -> Rejected', () => ncrMove(ncrMain.unique_id, 'Rejected'));
expectRefusal('NCR CAPA Assigned -> Open', () => ncrMove(ncrMain.unique_id, 'Open'));

expectRefusal('CAPA Assigned -> Done', () => capaMove(capa1.unique_id, 'Done'));
expectRefusal('CAPA Assigned -> Verified', () => capaMove(capa1.unique_id, 'Verified'));
expectRefusal('CAPA Assigned -> Closed', () => capaMove(capa1.unique_id, 'Closed'));
const inProgress = capaMove(capa1.unique_id, 'In Progress');
check(inProgress.row_status === 'In Progress' && capaRow(capa1.unique_id).status === 'In Progress',
  'CAPA Assigned -> In Progress is allowed');
expectRefusal('CAPA In Progress -> Verified (write-only user)', () => capaMove(capa1.unique_id, 'Verified'));
expectRefusal('CAPA In Progress -> Done without implementation evidence', () => capaMove(capa1.unique_id, 'Done'));
const done = capaMove(capa1.unique_id, 'Done', { implementation_evidence: 'أمر صيانة موثق ونتيجة فحص' });
check(done.row_status === 'Done' && String(capaRow(capa1.unique_id).implemented_at).trim() !== '',
  'CAPA In Progress -> Done requires implementation evidence and sets implemented_at');
expectRefusal('CAPA Done -> Closed', () => capaMove(capa1.unique_id, 'Closed'));
expectRefusal('edit CAPA header after Done', () => H.saveQualityCapa_({ unique_id: capa1.unique_id, description: 'تعديل متأخر' }, WRITER, DB));
expectRefusal('CAPA verify without effectiveness fields', () => capaMove(capa1.unique_id, 'Verified', {}, FULLER));
expectRefusal('CAPA Done -> Verified (write-only user)', () => capaMove(capa1.unique_id, 'Verified', effectiveness(), WRITER));
const verified = capaMove(capa1.unique_id, 'Verified', effectiveness(), FULLER);
check(verified.row_status === 'Verified' && capaRow(capa1.unique_id).verified_by === FULLER.email && String(capaRow(capa1.unique_id).verified_at).trim() !== '',
  'CAPA Done -> Verified (full grant) stores criteria, monitoring, outcome, evidence and verifier');
expectRefusal('CAPA Verified -> Closed (write-only user)', () => capaMove(capa1.unique_id, 'Closed', {}, WRITER));

const implemented = ncrMove(ncrMain.unique_id, 'Implemented');
check(implemented.row_status === 'Implemented' && ncrRow(ncrMain.unique_id).status === 'Implemented',
  'CAPA Assigned -> Implemented once every linked CAPA is Done/Verified/Closed');
expectRefusal('NCR Implemented -> Closed (must use close_quality_ncr)', () => ncrMove(ncrMain.unique_id, 'Closed'));
expectRefusal('NCR Implemented -> CAPA Assigned', () => ncrMove(ncrMain.unique_id, 'CAPA Assigned', { capa_required: true }));
const ncrVerified = ncrMove(ncrMain.unique_id, 'Verified');
check(ncrVerified.row_status === 'Verified', 'Implemented -> Verified is allowed');
expectRefusal('NCR Verified -> Implemented (backwards)', () => ncrMove(ncrMain.unique_id, 'Implemented'));
expectRefusal('NCR Verified -> In Review (backwards)', () => ncrMove(ncrMain.unique_id, 'In Review', { root_cause: 'r', disposition: 'd' }));
expectRefusal('close an NCR that is not Verified', () => H.closeQualityNcr_({ unique_id: ncr2.unique_id }, FULLER, DB));
expectRefusal('close a required NCR while its CAPA is not closed', () => H.closeQualityNcr_({ unique_id: ncrMain.unique_id }, FULLER, DB));
const capaClosed = capaMove(capa1.unique_id, 'Closed', {}, FULLER);
check(capaClosed.row_status === 'Closed' && capaRow(capa1.unique_id).status === 'Closed',
  'CAPA Verified -> Closed (full grant) is allowed before NCR closure');
const closed = H.closeQualityNcr_({ unique_id: ncrMain.unique_id }, FULLER, DB);
check(closed.status === 'success' && closed.row_status === 'Closed' && ncrRow(ncrMain.unique_id).status === 'Closed',
  'close_quality_ncr moves Verified -> Closed');
check(ncrRow(ncrMain.unique_id).closed_by === FULLER.email && String(ncrRow(ncrMain.unique_id).closed_at).trim() !== '',
  'close stores closed_by and closed_at');
const failedCapa = createCapa({ description: 'إجراء فشل اختبار الفعالية' });
capaMove(failedCapa.unique_id, 'In Progress');
capaMove(failedCapa.unique_id, 'Done', { implementation_evidence: 'تنفيذ مسجل' });
const failedEffectiveness = capaMove(failedCapa.unique_id, 'Verified', effectiveness({
  effectiveness_outcome: 'Ineffective', recurrence_result: 'Recurrence observed', effectiveness_evidence: 'تكرر العيب في العينة التالية',
  reopen_rationale: 'يلزم تعديل الإجراء ومعالجة السبب الجذري'
}), FULLER);
check(failedEffectiveness.row_status === 'In Progress' && failedEffectiveness.effectiveness_failed === true &&
  capaRow(failedCapa.unique_id).effectiveness_evidence === 'تكرر العيب في العينة التالية' &&
  capaRow(failedCapa.unique_id).reopen_rationale === 'يلزم تعديل الإجراء ومعالجة السبب الجذري',
  'failed effectiveness is retained with its evidence and rationale and returns the CAPA to In Progress');
expectRefusal('NCR Closed -> Implemented', () => ncrMove(ncrMain.unique_id, 'Implemented'));
expectRefusal('NCR Closed -> Cancelled', () => ncrMove(ncrMain.unique_id, 'Cancelled'));
expectRefusal('NCR Closed -> Rejected', () => ncrMove(ncrMain.unique_id, 'Rejected'));
expectRefusal('close a Closed NCR again', () => H.closeQualityNcr_({ unique_id: ncrMain.unique_id }, FULLER, DB));

/* ---- no-CAPA completion path ---- */
const ncrNoCapa = createNcr({ description: 'انحراف بسيط' });
ncrMove(ncrNoCapa.unique_id, 'In Review', { root_cause: 'خطأ إدخال', disposition: 'تصحيح فوري' });
expectRefusal('Implement without justification', () => ncrMove(ncrNoCapa.unique_id, 'Implemented', { capa_required: false }));
const noCapa = ncrMove(ncrNoCapa.unique_id, 'Implemented', { capa_required: false, capa_justification: 'لا يستلزم إجراءً تصحيحياً' });
check(noCapa.row_status === 'Implemented' && ncrRow(ncrNoCapa.unique_id).capa_required === 'FALSE' && ncrRow(ncrNoCapa.unique_id).capa_justification === 'لا يستلزم إجراءً تصحيحياً',
  'In Review -> Implemented with a justification is the no-CAPA completion path');
expectRefusal('Implement with capa_required true and no linked CAPA', () => ncrMove(ncrNoCapa.unique_id, 'Implemented', { capa_required: true, capa_justification: 'مبرر' }));

/* ---- illegal transitions from Open, zero writes ---- */
const ncrOpen = createNcr({ description: 'مفتوحة' });
expectRefusal('Open -> CAPA Assigned', () => ncrMove(ncrOpen.unique_id, 'CAPA Assigned', { capa_required: true }));
expectRefusal('Open -> Implemented', () => ncrMove(ncrOpen.unique_id, 'Implemented', { capa_justification: 'مبرر' }));
expectRefusal('Open -> Verified', () => ncrMove(ncrOpen.unique_id, 'Verified'));
expectRefusal('Open -> Open', () => ncrMove(ncrOpen.unique_id, 'Open'));
expectRefusal('Open -> Closed', () => ncrMove(ncrOpen.unique_id, 'Closed'));
check(ncrRow(ncrOpen.unique_id).status === 'Open', 'every refused Open transition left the row untouched');

/* ---- Cancelled / Rejected terminals ---- */
const ncrCancel = createNcr({ description: 'ملغاة' });
check(ncrMove(ncrCancel.unique_id, 'Cancelled').row_status === 'Cancelled', 'Open -> Cancelled is allowed');
expectRefusal('Cancelled -> In Review', () => ncrMove(ncrCancel.unique_id, 'In Review', { root_cause: 'r', disposition: 'd' }));
expectRefusal('Cancelled -> Implemented', () => ncrMove(ncrCancel.unique_id, 'Implemented'));
expectRefusal('Cancelled -> Rejected', () => ncrMove(ncrCancel.unique_id, 'Rejected'));
const ncrRej = createNcr({ description: 'مرفوضة' });
check(ncrMove(ncrRej.unique_id, 'Rejected').row_status === 'Rejected', 'Open -> Rejected is allowed');
expectRefusal('Rejected -> In Review', () => ncrMove(ncrRej.unique_id, 'In Review', { root_cause: 'r', disposition: 'd' }));
expectRefusal('Rejected -> Cancelled', () => ncrMove(ncrRej.unique_id, 'Cancelled'));
const ncrRej2 = createNcr({ description: 'مرفوضة بعد المراجعة' });
ncrMove(ncrRej2.unique_id, 'In Review', { root_cause: 'r', disposition: 'd' });
check(ncrMove(ncrRej2.unique_id, 'Rejected').row_status === 'Rejected', 'In Review -> Rejected is allowed');
const ncrCancel2 = createNcr({ description: 'ملغاة أثناء المراجعة' });
ncrMove(ncrCancel2.unique_id, 'In Review', { root_cause: 'r', disposition: 'd' });
check(ncrMove(ncrCancel2.unique_id, 'Cancelled').row_status === 'Cancelled', 'In Review -> Cancelled is allowed');

/* ---- unknown NCR on CAPA create, standalone CAPA ---- */
expectRefusal('CAPA with an unknown ncr_id', () => createCapa({ ncr_id: 'no-such-ncr', description: 'يتيم' }));
expectRefusal('CAPA with an invalid action_type', () => createCapa({ action_type: 'Reactive' }));
expectRefusal('CAPA without a description', () => createCapa({ description: '   ' }));
const standalone = createCapa({ action_type: 'Preventive', description: 'تدريب دوري على السلامة' });
check(standalone.status === 'success' && capaRow(standalone.unique_id).ncr_id === '' && capaRow(standalone.unique_id).action_type === 'Preventive',
  'standalone CAPA (empty ncr_id) is allowed');
const capaCodes = rows(H.QUALITY_CAPA_SHEET).map(r => r.capa_code);
check(new Set(capaCodes).size === capaCodes.length && capaCodes.every(c => /^CAPA-\d{4}-\d{3}$/.test(c)),
  'every capa_code matches CAPA-<YYYY>-NNN and stays unique');

/* ---- overdue: computed server-side, exact rule ---- */
const capaOver = createCapa({ description: 'متأخر قيد التنفيذ', due_date: todayIso_(-2) });
capaMove(capaOver.unique_id, 'In Progress');
const capaDoneOver = createCapa({ description: 'متأخر منجز', due_date: todayIso_(-2) });
capaMove(capaDoneOver.unique_id, 'In Progress');
capaMove(capaDoneOver.unique_id, 'Done', { implementation_evidence: 'دليل تنفيذ موثق' });
const capaVerifiedOver = createCapa({ description: 'متأخر تم التحقق', due_date: todayIso_(-1) });
capaMove(capaVerifiedOver.unique_id, 'In Progress');
capaMove(capaVerifiedOver.unique_id, 'Done', { implementation_evidence: 'دليل تنفيذ موثق' });
capaMove(capaVerifiedOver.unique_id, 'Verified', effectiveness(), FULLER);
const capaClosedOver = createCapa({ description: 'متأخر مغلق', due_date: todayIso_(-1) });
capaMove(capaClosedOver.unique_id, 'In Progress');
capaMove(capaClosedOver.unique_id, 'Done', { implementation_evidence: 'دليل تنفيذ موثق' });
capaMove(capaClosedOver.unique_id, 'Verified', effectiveness(), FULLER);
capaMove(capaClosedOver.unique_id, 'Closed', {}, FULLER);
const capaToday = createCapa({ description: 'مستحق اليوم', due_date: todayIso_(0) });
capaMove(capaToday.unique_id, 'In Progress');
const capaFuture = createCapa({ description: 'مستحق لاحقاً', due_date: todayIso_(2) });
capaMove(capaFuture.unique_id, 'In Progress');

const read1 = H.getQualityNcr_({}, WRITER, DB);
function capaRead(code) { return read1.capas.filter(c => c.capa_code === code)[0] || null; }
check(capaRead(capaOver.capa_code).overdue === true && capaRead(capaOver.capa_code).days_overdue === 2,
  'due_date < today + In Progress -> overdue true with days_overdue 2');
check(capaRead(capaDoneOver.capa_code).overdue === false && capaRead(capaDoneOver.capa_code).days_overdue === 0,
  'due_date < today + Done -> not overdue');
check(capaRead(capaVerifiedOver.capa_code).overdue === false && capaRead(capaVerifiedOver.capa_code).days_overdue === 0,
  'due_date < today + Verified -> not overdue');
check(capaRead(capaClosedOver.capa_code).overdue === false && capaRead(capaClosedOver.capa_code).days_overdue === 0,
  'due_date < today + Closed -> not overdue');
check(capaRead(capaToday.capa_code).overdue === false && capaRead(capaToday.capa_code).days_overdue === 0,
  'due_date == today -> not overdue');
check(capaRead(capaFuture.capa_code).overdue === false && capaRead(capaFuture.capa_code).days_overdue === 0,
  'due_date in the future -> not overdue');
check(capaRow(capaOver.unique_id).overdue === undefined && capaRow(capaOver.unique_id).days_overdue === undefined,
  'overdue/days_overdue are computed on read, never stored on the sheet');

/* ---- attachments: requireAttachmentBinding_ before any write ---- */
const ATT_ID = 'AAAABBBBCCCCDDDDEEEEFFFF';
const ATT_URL = 'https://drive.google.com/file/d/' + ATT_ID + '/view';
const attNcr = H.saveQualityNcr_({ description: 'بمرفق', attachment: 'valley_quality_ncrs_Files_/report.pdf', attachment_id: ATT_URL }, WRITER, DB);
check(attNcr.status === 'success' && ncrRow(attNcr.unique_id).attachment_id === ATT_ID && ncrRow(attNcr.unique_id).attachment === 'valley_quality_ncrs_Files_/report.pdf',
  'NCR stores the bound attachment reference and Drive id');
expectThrow('NCR attachment reference without a Drive id is refused', () => H.saveQualityNcr_({ description: 'مرفق ناقص', attachment: 'valley_quality_ncrs_Files_/report.pdf' }, WRITER, DB), /تثبيت معرف Drive/);
expectThrow('NCR attachment with an invalid Drive id is refused', () => H.saveQualityNcr_({ description: 'مرفق خاطئ', attachment: 'valley_quality_ncrs_Files_/report.pdf', attachment_id: 'abc' }, WRITER, DB), /تثبيت معرف Drive/);
const attCapa = createCapa({ description: 'بمرفق', attachment: 'valley_quality_capas_Files_/proof.pdf', attachment_id: ATT_URL });
check(attCapa.status === 'success' && capaRow(attCapa.unique_id).attachment_id === ATT_ID,
  'CAPA stores the bound attachment pair');
expectThrow('CAPA attachment reference without a Drive id is refused', () => createCapa({ description: 'مرفق ناقص', attachment: 'valley_quality_capas_Files_/proof.pdf' }), /تثبيت معرف Drive/);

/* ---- history is written, never a second events table ---- */
check(W.history.length > 0 && W.history.some(h => h[1] === H.QUALITY_NCR_SHEET && h[5] === 'create') && W.history.some(h => h[1] === H.QUALITY_CAPA_SHEET && h[5] === 'update'),
  'logHistory_ records NCR/CAPA creates and updates (event-free)');
check(!W.sheets['valley_quality_ncr_events'] && !W.sheets['valley_quality_ncr_history'],
  'no extra events/history sheet is created for NCR/CAPA');

/* ---- the real unifiedCheck_ gate backs the CAPA full requirement ---- */
check(W.ctx.unifiedCheck_(WRITER, COMPANY, 'vf_quality_ncr', 'full') === false && W.ctx.unifiedCheck_(FULLER, COMPANY, 'vf_quality_ncr', 'full') === true,
  'the sliced gate: write-only fails full, full passes');
check(W.ctx.unifiedCheck_(WRITER, COMPANY, 'vf_quality_ncr', 'write') === true,
  'the sliced gate: write-only passes write');

console.log(failed === 0
  ? 'quality_ncr: PASS (transitions, zero-write refusals, overdue rule, codes, full-gated CAPA verification, attachments over the real block)'
  : 'quality_ncr: FAIL (' + failed + ' check(s))');
process.exit(failed === 0 ? 0 : 1);
