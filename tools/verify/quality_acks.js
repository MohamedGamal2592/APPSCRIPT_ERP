'use strict';
/* QUALITY-ACKS — offline proof for the Valley Foods acknowledgement server block.

   The REAL "QUALITY MODULE (v2)" block is sliced out of
   Company_ValleyFoods_Actions.js (banner to banner) and run in a vm over fake
   Sheets with captured writes, a deterministic uidV7_, a scripted employee
   roster and a stubbed ensureAttachmentColumn_/_headerCache_. The REAL
   PAGE_ACCESS/ACTION_TABLES blocks are sliced too, for the wiring checks.
   Nothing touches a spreadsheet, a Google service or the network.

   Proves: launch applicability (section/title, empty = all, inactive skipped),
   launch idempotency (a second launch creates zero duplicates) and supersede
   (Pending rows of an older version become Superseded while Signed rows are
   untouched); get_quality_my_acks returns only the session owner's rows
   (server-side case-insensitive email match) and linked:false for an unknown
   email, with the supervisor lists gated on unifiedCheck_ write; sign_quality_ack
   refuses a cross-user row and a wrong typed name BEFORE any write, and stamps
   signed_at/recorded_by/signature_note/read_at on success; record_quality_ack
   creates a Signed row for a no-login employee under the supervisor's email and
   refuses an unknown emp_id; ensureAttachmentColumn_ runs for the employee sheet
   and the header cache key is busted afterwards.

   Run: node tools/verify/quality_acks.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');

const START = '  // ===================== QUALITY MODULE (v2) =====================';
const END = '  // ===================== QUALITY MODULE END =====================';
const blockStart = source.indexOf(START);
const blockEnd = source.indexOf(END);
if (blockStart < 0 || blockEnd < blockStart) {
  console.error('quality_acks: QUALITY MODULE block not found in Company_ValleyFoods_Actions.js');
  process.exit(1);
}
const block = source.slice(blockStart, blockEnd + END.length);

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

const ACK_SHEET = 'valley_quality_acknowledgements';
const EXPECTED_ACCESS = {
  launch_quality_acks: { page: 'vf_quality_sops', access: 'full' },
  get_quality_my_acks: { page: 'vf_quality_my_acks', access: 'read' },
  sign_quality_ack: { page: 'vf_quality_my_acks', access: 'write' },
  record_quality_ack: { page: 'vf_quality_my_acks', access: 'write' }
};
const EXPECTED_TABLES = {
  launch_quality_acks: [ACK_SHEET, 'valley_quality_sops', 'valley_quality_sop_versions', 'valley_quality_sop_events', 'valley_employee_info'],
  get_quality_my_acks: [ACK_SHEET, 'valley_quality_sop_versions', 'valley_quality_sops', 'valley_employee_info'],
  sign_quality_ack: [ACK_SHEET],
  record_quality_ack: [ACK_SHEET, 'valley_quality_sop_versions', 'valley_employee_info']
};
Object.keys(EXPECTED_ACCESS).forEach(function (action) {
  const e = PAGE_ACCESS[action] || {};
  check(e.page === EXPECTED_ACCESS[action].page && e.access === EXPECTED_ACCESS[action].access,
    'PAGE_ACCESS ' + action + ' -> ' + EXPECTED_ACCESS[action].page + '/' + EXPECTED_ACCESS[action].access);
  check(JSON.stringify(ACTION_TABLES[action]) === JSON.stringify(EXPECTED_TABLES[action]),
    'ACTION_TABLES ' + action + ' declares its full table array');
  check(source.indexOf("ValleyFoods.register('" + action + "'") !== -1, 'registration bridge contains ' + action);
});

/* ══ fake Sheets ═════════════════════════════════════════════════════ */
function makeWorld() {
  const sheets = {};
  const writes = { count: 0 };
  const history = [];
  const capture = { attach: [], unified: [], attachCachePresent: null };
  let uidSeq = 0, idSeq = 0;
  let statusMap = {};
  let unified = false;

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
    Utilities: { getUuid: () => crypto.randomUUID() },
    _headerCache_: { 'ss_valley_employee_info': ['stale'], 'ss_other': ['keep'] },
    COMPANY_UID: '9940659bd83035d7',
    noteMutation_() {},
    vfBustRefs_() {},
    ensureAttachmentColumn_: (dbId, sheetName, field) => {
      capture.attach.push([dbId, sheetName, field]);
      capture.attachCachePresent = Object.prototype.hasOwnProperty.call(ctx._headerCache_, 'ss_valley_employee_info');
      return true;
    },
    unifiedCheck_: (user, company, page, access) => {
      capture.unified.push([company, page, access]);
      return unified === true;
    },
    getLatestStatusMap_: () => statusMap,
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
    ' launchQualityAcks_: launchQualityAcks_, getQualityMyAcks_: getQualityMyAcks_,' +
    ' signQualityAck_: signQualityAck_, recordQualityAck_: recordQualityAck_,' +
    ' QUALITY_SOP_HEADERS: QUALITY_SOP_HEADERS, QUALITY_SOP_VERSION_HEADERS: QUALITY_SOP_VERSION_HEADERS,' +
    ' QUALITY_SOP_EVENT_HEADERS: QUALITY_SOP_EVENT_HEADERS, QUALITY_SOP_ACK_HEADERS: QUALITY_SOP_ACK_HEADERS,' +
    ' QUALITY_SOP_SHEET: QUALITY_SOP_SHEET, QUALITY_SOP_VERSIONS_SHEET: QUALITY_SOP_VERSIONS_SHEET,' +
    ' QUALITY_SOP_EVENTS_SHEET: QUALITY_SOP_EVENTS_SHEET, QUALITY_SOP_ACKS_SHEET: QUALITY_SOP_ACKS_SHEET,' +
    ' QUALITY_EMP_INFO_SHEET: QUALITY_EMP_INFO_SHEET };';
  vm.runInContext(block + exportLine, ctx, { filename: 'quality_block.js' });

  function seed(name, headers, rows) {
    const sh = ensureSheet_(null, name, headers);
    rows.forEach((r) => {
      const row = headers.map((h) => {
        if (r[h] !== undefined) return r[h];
        const low = String(h).toLowerCase();
        return r[low] !== undefined ? r[low] : '';
      });
      sh.__grid.push(row);
    });
    return sh;
  }
  function update(sheetName, critHeader, critValue, patch) {
    const sh = sheets[sheetName];
    const grid = sh.__grid, headers = grid[0];
    const ci = headers.findIndex(h => String(h).trim().toLowerCase() === critHeader.toLowerCase());
    for (let i = 1; i < grid.length; i++) {
      if (String(grid[i][ci]).trim().toLowerCase() === String(critValue).trim().toLowerCase()) {
        Object.keys(patch).forEach((k) => {
          const idx = headers.findIndex(h => String(h).trim().toLowerCase() === k.toLowerCase());
          if (idx !== -1) grid[i][idx] = patch[k];
        });
        return true;
      }
    }
    return false;
  }
  return {
    ctx, sheets, writes, history, capture,
    rows: (name) => getAllRecords_(null, name),
    seed, update,
    setStatusMap: (m) => { statusMap = m; },
    setUnified: (v) => { unified = v === true; },
    resetWrites: () => { writes.count = 0; }
  };
}

/* ══ fixtures ════════════════════════════════════════════════════════ */
const DB = 'db-1';
const SUPERVISOR = { email: 'sup@vf.test', company: '9940659bd83035d7' };
const AHMED = { email: 'ahmed@vf.test', company: '9940659bd83035d7' };
const SAMI = { email: 'sami@vf.test', company: '9940659bd83035d7' };
const HR_HEADERS = ['emp_id', 'employee_type', 'name_ar', 'national_id', 'hiring_date', 'title', 'section',
  'category', 'insurance', 'gender', 'schedule_id', 'الحالة الوظيفية', 'emp_id_1', 'البطاقة صادرة من',
  'العنوان بالبطاقة', 'user', 'created_at', 'email'];

const W = makeWorld();
const H = W.ctx.__out;
function rows(sheet) { return W.rows(sheet); }
function acksFor(sopId, version) {
  return rows(H.QUALITY_SOP_ACKS_SHEET).filter(r =>
    String(r.sop_id) === sopId && (version === undefined || String(r.sop_version) === String(version)));
}
function ackOf(empId, version) {
  return rows(H.QUALITY_SOP_ACKS_SHEET).filter(r =>
    String(r.emp_id) === String(empId) && String(r.sop_version) === String(version))[0] || null;
}
function expectRefusal(label, fn) {
  const before = W.writes.count;
  let err = null;
  try { fn(); } catch (e) { err = e; }
  check(!!err && err.notApplied === true, label + ' — refused as notApplied');
  check(W.writes.count === before, label + ' — zero writes before the refusal');
  return err;
}

W.seed(H.QUALITY_EMP_INFO_SHEET, HR_HEADERS, [
  { emp_id: 101, name_ar: 'أحمد علي', title: 'فني جودة', section: 'الجودة', email: 'Ahmed@VF.test' },
  { emp_id: 102, name_ar: 'منى حسن', title: 'مشرفة جودة', section: 'الإنتاج', email: 'mona@vf.test' },
  { emp_id: 103, name_ar: 'سمير فؤاد', title: 'عامل إنتاج', section: 'الإنتاج', email: '' },
  { emp_id: 104, name_ar: 'ليلى كمال', title: 'مشرفة جودة', section: 'الجودة', email: 'laila@vf.test' },
  { emp_id: 105, name_ar: 'Sami Nabil', title: 'فني جودة', section: 'الجودة', email: 'sami@vf.test' }
]);
W.setStatusMap({
  '101': { status_type: 'يعمل بالشركة' },
  '102': { status_type: 'يعمل بالشركة' },
  '103': { status_type: 'يعمل بالشركة' },
  '104': { status_type: 'استقالة' },
  '105': { status_type: 'يعمل بالشركة' }
});
W.seed(H.QUALITY_SOP_SHEET, H.QUALITY_SOP_HEADERS, [
  { unique_id: 'sop-qc', id: 1, sop_code: 'SOP-QC-001', title_ar: 'إجراء الجودة', applicability_dept: 'الجودة', applicability_role: '', current_effective_version: '1' },
  { unique_id: 'sop-pr', id: 2, sop_code: 'SOP-PR-001', title_ar: 'إجراء الإنتاج', applicability_dept: '', applicability_role: 'مشرفة جودة', current_effective_version: '1' },
  { unique_id: 'sop-all', id: 3, sop_code: 'SOP-GEN-001', title_ar: 'إجراء عام', applicability_dept: '', applicability_role: '', current_effective_version: '1' },
  { unique_id: 'sop-gen', id: 4, sop_code: 'SOP-GEN-002', title_ar: 'إجراء بلا إقرارات', applicability_dept: '', applicability_role: '', current_effective_version: '1' },
  { unique_id: 'sop-noeff', id: 5, sop_code: 'SOP-GEN-003', title_ar: 'إجراء بلا إصدار ساري', applicability_dept: '', applicability_role: '', current_effective_version: '' }
]);
W.seed(H.QUALITY_SOP_VERSIONS_SHEET, H.QUALITY_SOP_VERSION_HEADERS, [
  { unique_id: 'v-qc-1', id: 11, sop_id: 'sop-qc', version: 1, status: 'Effective', pdf_ref: 'https://drive.google.com/file/d/PDF-QC-1/view' },
  { unique_id: 'v-pr-1', id: 12, sop_id: 'sop-pr', version: 1, status: 'Effective', pdf_ref: 'https://drive.google.com/file/d/PDF-PR-1/view' },
  { unique_id: 'v-all-1', id: 13, sop_id: 'sop-all', version: 1, status: 'Effective', pdf_ref: '' },
  { unique_id: 'v-gen-1', id: 14, sop_id: 'sop-gen', version: 1, status: 'Effective', pdf_ref: '' },
  { unique_id: 'v-noeff-1', id: 15, sop_id: 'sop-noeff', version: 1, status: 'Draft', pdf_ref: '' },
  { unique_id: 'v-qc-2', id: 16, sop_id: 'sop-qc', version: 2, status: 'Draft', pdf_ref: '' }
]);

/* ══ launch: applicability, attachment column, event ═════════════════ */
const l1 = H.launchQualityAcks_({ sop_id: 'sop-qc' }, SUPERVISOR, DB);
check(l1.status === 'success' && l1.created === 2 && l1.skipped === 0 && l1.superseded === 0,
  'launch department filter: two targets created, none skipped');
check(acksFor('sop-qc', 1).map(r => String(r.emp_id)).sort().join(',') === '101,105',
  'launch department filter: only matching active employees (101,105) got rows');
check(!rows(H.QUALITY_SOP_ACKS_SHEET).some(r => String(r.emp_id) === '104'),
  'launch skips the inactive employee (104)');
check(acksFor('sop-qc', 1).every(r => r.status === 'Pending' && String(r.user) === SUPERVISOR.email &&
  String(r.unique_id).indexOf('uid-') === 0 && String(r.created_at) !== ''),
  'launch rows: Pending, stamped with the caller email, a uidV7_ id and created_at');
const launchEvent = rows(H.QUALITY_SOP_EVENTS_SHEET).filter(e => e.event_type === 'Acks Launched' && String(e.sop_id) === 'sop-qc')[0];
check(!!launchEvent && Number(launchEvent.version) === 1 && String(launchEvent.actor_email) === SUPERVISOR.email &&
  /أُنشئ: 2/.test(String(launchEvent.comment)),
  'Acks Launched event carries version, actor and counts');
check(W.history.some(a => a[1] === H.QUALITY_SOP_SHEET && String(a[2]) === 'sop-qc' && a[5] === 'update'),
  'logHistory_ recorded on the SOP');

check(W.capture.attach.length >= 1 && W.capture.attach[0][1] === 'valley_employee_info' && W.capture.attach[0][2] === 'email',
  'ensureAttachmentColumn_ invoked for valley_employee_info.email');
check(W.capture.attachCachePresent === true, 'the header cache key was still present when ensureAttachmentColumn_ ran');
check(!Object.prototype.hasOwnProperty.call(W.ctx._headerCache_, 'ss_valley_employee_info'),
  'the employee sheet header cache key is busted after the launch');
check(Object.prototype.hasOwnProperty.call(W.ctx._headerCache_, 'ss_other'),
  'unrelated header cache keys are untouched');

/* ══ launch: idempotency ═════════════════════════════════════════════ */
const l1b = H.launchQualityAcks_({ sop_id: 'sop-qc' }, SUPERVISOR, DB);
check(l1b.created === 0 && l1b.skipped === 2, 're-launch is idempotent: zero created, both targets skipped');
check(acksFor('sop-qc', 1).length === 2, 're-launch created no duplicate rows');

/* ══ launch: role filter and empty applicability = all ═══════════════ */
const l2 = H.launchQualityAcks_({ sop_id: 'sop-pr' }, SUPERVISOR, DB);
check(l2.created === 1 && acksFor('sop-pr', 1).length === 1 && String(acksFor('sop-pr', 1)[0].emp_id) === '102',
  'launch role filter: only the matching active employee (102)');
const l3 = H.launchQualityAcks_({ sop_id: 'sop-all' }, SUPERVISOR, DB);
check(l3.created === 4, 'empty applicability = all active employees (4)');

/* ══ launch: refusals write nothing ══════════════════════════════════ */
expectRefusal('launch without any effective version', () => H.launchQualityAcks_({ sop_id: 'sop-noeff' }, SUPERVISOR, DB));
expectRefusal('launch with an explicit non-effective version', () => H.launchQualityAcks_({ sop_id: 'sop-qc', sop_version: '2' }, SUPERVISOR, DB));
expectRefusal('launch on an unknown SOP', () => H.launchQualityAcks_({ sop_id: 'sop-missing' }, SUPERVISOR, DB));

/* ══ launch: supersede older Pending rows, leave Signed untouched ════ */
const ack101v1 = ackOf(101, 1);
W.update(H.QUALITY_SOP_ACKS_SHEET, 'unique_id', ack101v1.unique_id, { status: 'Signed', signed_at: '2026-01-02T00:00:00.000Z', recorded_by: AHMED.email });
W.update(H.QUALITY_SOP_VERSIONS_SHEET, 'unique_id', 'v-qc-2', { status: 'Effective' });
W.update(H.QUALITY_SOP_SHEET, 'unique_id', 'sop-qc', { current_effective_version: '2' });
const l4 = H.launchQualityAcks_({ sop_id: 'sop-qc' }, SUPERVISOR, DB);
check(l4.created === 2 && l4.skipped === 0 && l4.superseded === 1,
  'launch v2: two rows created and one older Pending row superseded');
check(String(ackOf(101, 1).status) === 'Signed', 'a Signed row of the older version is untouched');
check(String(ackOf(105, 1).status) === 'Superseded', 'a Pending row of the older version becomes Superseded');
check(ackOf(101, 2) && ackOf(105, 2) && String(ackOf(101, 2).status) === 'Pending' && String(ackOf(105, 2).status) === 'Pending',
  'fresh Pending rows exist for the new effective version');

/* ══ get_quality_my_acks: server-side scoping ════════════════════════ */
W.seed(H.QUALITY_SOP_ACKS_SHEET, H.QUALITY_SOP_ACK_HEADERS, [
  { unique_id: 'ack-mona', id: 90, sop_id: 'sop-qc', sop_version: 2, emp_id: 102, employee_name: 'منى حسن', status: 'Pending', user: SUPERVISOR.email, created_at: '2026-01-03T00:00:00.000Z' }
]);
W.setUnified(false);
const my = H.getQualityMyAcks_({}, AHMED, DB);
check(my.status === 'success' && my.linked === true, 'get_quality_my_acks links the caller by case-insensitive email');
check(my.my.length === 3 && my.my.every(r => String(r.ack.emp_id) === '101'),
  'my acks contain ONLY the caller rows (three rows: sop-qc v1/v2 and sop-all v1)');
check(JSON.stringify(my.my).indexOf('ack-mona') === -1, 'the other employee ack is absent from the response');
check(my.my.some(r => r.version && r.version.pdf_ref === 'https://drive.google.com/file/d/PDF-QC-1/view' &&
  r.sop && r.sop.sop_code === 'SOP-QC-001' && r.sop.title_ar === 'إجراء الجودة') &&
  my.my.every(r => r.sop && r.sop.sop_code),
  'each row is joined with its version ({unique_id,version,status,pdf_ref}) and the SOP');
check(!('employees' in my) && !('sops' in my), 'supervisor lists are omitted without a write grant');
W.setUnified(true);
const mySup = H.getQualityMyAcks_({}, AHMED, DB);
check(Array.isArray(mySup.employees) && mySup.employees.length === 5 &&
  mySup.employees[0].emp_id !== undefined && mySup.employees[0].name_ar !== undefined &&
  mySup.employees[0].section !== undefined && mySup.employees[0].title !== undefined,
  'supervisor lists: employees [{emp_id,name_ar,section,title}] returned with a write grant');
check(Array.isArray(mySup.sops) && mySup.sops.some(s => s.sop_code === 'SOP-QC-001' && String(s.current_effective_version) === '2'),
  'supervisor lists: sops carry the current effective version');
check(W.capture.unified.some(c => c[1] === 'vf_quality_my_acks' && c[2] === 'write'),
  'the supervisor gate asks unifiedCheck_ for write on vf_quality_my_acks');
const ghost = H.getQualityMyAcks_({}, { email: 'ghost@vf.test' }, DB);
check(ghost.linked === false && Array.isArray(ghost.my) && ghost.my.length === 0,
  'unknown email: linked:false and an empty my list');

/* ══ sign_quality_ack: refusals first, then the stamps ═══════════════ */
expectRefusal('sign another employee row', () => H.signQualityAck_({ unique_id: 'ack-mona', typed_name: 'منى حسن' }, AHMED, DB));
const ack101v2 = ackOf(101, 2);
expectRefusal('sign with a wrong typed name', () => H.signQualityAck_({ unique_id: ack101v2.unique_id, typed_name: 'أحمد' }, AHMED, DB));
const signed = H.signQualityAck_({ unique_id: ack101v2.unique_id, typed_name: '  أحمد   علي  ' }, AHMED, DB);
check(signed.status === 'success' && signed.row_status === 'Signed', 'the correct typed name signs the own row');
check(String(ack101v2.unique_id) === String(ackOf(101, 2).unique_id) &&
  String(ackOf(101, 2).status) === 'Signed' &&
  String(ackOf(101, 2).signed_at) !== '' &&
  String(ackOf(101, 2).recorded_by) === AHMED.email &&
  String(ackOf(101, 2).signature_note) === 'أحمد علي',
  'sign stamps status/signed_at/recorded_by and the collapsed typed name');
check(String(ackOf(101, 2).read_at) !== '', 'sign sets read_at when it was empty');

const samiRow = ackOf(105, 2);
W.update(H.QUALITY_SOP_ACKS_SHEET, 'unique_id', samiRow.unique_id, { status: 'Read', read_at: '2026-01-05T00:00:00.000Z' });
const samiSign = H.signQualityAck_({ unique_id: samiRow.unique_id, typed_name: 'sami nabil' }, SAMI, DB);
check(samiSign.status === 'success' && String(ackOf(105, 2).signature_note) === 'sami nabil',
  'Latin names match case-insensitively');
check(String(ackOf(105, 2).read_at) === '2026-01-05T00:00:00.000Z', 'sign preserves an existing read_at');

/* ══ record_quality_ack: supervisor fallback ═════════════════════════ */
const rec = H.recordQualityAck_({ emp_id: '103', sop_id: 'sop-gen' }, SUPERVISOR, DB);
check(rec.status === 'success' && rec.created === true, 'supervisor record creates a row without employee login');
const rrow = rows(H.QUALITY_SOP_ACKS_SHEET).filter(r => String(r.unique_id) === String(rec.unique_id))[0];
check(!!rrow && String(rrow.status) === 'Signed' && String(rrow.sop_version) === '1' &&
  String(rrow.recorded_by) === SUPERVISOR.email && String(rrow.signature_note) === 'تسجيل بواسطة المشرف' &&
  String(rrow.employee_name) === 'سمير فؤاد',
  'recorded row: Signed, current effective version, supervisor email and the default note');
expectRefusal('record for an unknown emp_id', () => H.recordQualityAck_({ emp_id: '999', sop_id: 'sop-gen' }, SUPERVISOR, DB));
expectRefusal('record against a non-effective version', () => H.recordQualityAck_({ emp_id: '103', sop_id: 'sop-noeff', sop_version: '1' }, SUPERVISOR, DB));
const rec2 = H.recordQualityAck_({ unique_id: 'ack-mona', note: 'نيابةً عن الموظفة' }, SUPERVISOR, DB);
check(rec2.status === 'success' && rec2.created === false, 'record on an existing Pending row updates it');
const mrow = rows(H.QUALITY_SOP_ACKS_SHEET).filter(r => String(r.unique_id) === 'ack-mona')[0];
check(String(mrow.status) === 'Signed' && String(mrow.recorded_by) === SUPERVISOR.email &&
  String(mrow.signature_note) === 'نيابةً عن الموظفة',
  'record stamps the supervisor email and the supplied note');
expectRefusal('record on an already-Signed row by unique_id', () => H.recordQualityAck_({ unique_id: 'ack-mona' }, SUPERVISOR, DB));
const beforeCount = rows(H.QUALITY_SOP_ACKS_SHEET).length;
const rec3 = H.recordQualityAck_({ emp_id: '103', sop_id: 'sop-gen' }, SUPERVISOR, DB);
check(rec3.status === 'success' && rec3.created === false && rows(H.QUALITY_SOP_ACKS_SHEET).length === beforeCount,
  're-recording the same tuple writes no duplicate row');

console.log(failed === 0
  ? 'quality_acks: PASS (launch applicability/idempotency/supersede, server-side scoping, own-row signing, supervisor record)'
  : 'quality_acks: FAIL (' + failed + ' check(s))');
process.exit(failed === 0 ? 0 : 1);
