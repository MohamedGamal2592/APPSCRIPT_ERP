'use strict';
/* QUALITY-AUDITS — offline proof for the Valley Foods audit/finding server block.

   The REAL "QUALITY MODULE (v2)" block is sliced out of
   Company_ValleyFoods_Actions.js (banner to banner) together with the REAL
   settingsUniqueViolation_ from the same file and the REAL
   requireAttachmentBinding_/extractDriveId_ from Code.js, and the REAL
   PAGE_ACCESS/ACTION_TABLES wiring. It runs in a vm over fake Sheets with
   captured writes and a deterministic uidV7_. Nothing touches a spreadsheet, a
   Google service or the network.

   Proves: AUD-<YYYY>-NNN allocation with a uniqueness scan; the one legal audit
   path (Planned -> In Progress -> Completed -> Closed) and every other
   transition refused BEFORE any mutation (the write counter stays 0); a Closed
   audit is untouchable; findings numbering (max+1), field edits, the Open ->
   Closed rule, and removal refused once a finding is linked to an NCR;
   escalation creates an NCR through the same annual allocator as
   save_quality_ncr, with source 'Audit', the Major/Minor/Observation severity
   mapping, department from the audit area, the composed description and the
   ncr_id back-link on the finding; a second escalation and escalation on a
   Closed audit are refused; PAGE_ACCESS marks the getters read and the writers
   write, and every ACTION_TABLES entry is an array.

   Run: node tools/verify/quality_audits.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const code = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');

const START = '  // ===================== QUALITY MODULE (v2) =====================';
const END = '  // ===================== QUALITY MODULE END =====================';
const blockStart = source.indexOf(START);
const blockEnd = source.indexOf(END);
if (blockStart < 0 || blockEnd < blockStart) {
  console.error('quality_audits: QUALITY MODULE block not found in Company_ValleyFoods_Actions.js');
  process.exit(1);
}
const block = source.slice(blockStart, blockEnd + END.length);

const suStart = source.indexOf('  function settingsUniqueViolation_(');
const suEnd = source.indexOf('\n  }', suStart);
if (suStart < 0 || suEnd < suStart) {
  console.error('quality_audits: settingsUniqueViolation_ not found');
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

const AUDIT_SHEET = 'valley_quality_audits';
const FINDING_SHEET = 'valley_quality_audit_findings';
const NCR_SHEET = 'valley_quality_ncrs';
const AUDIT_TABLES = [AUDIT_SHEET, FINDING_SHEET, NCR_SHEET];
const EXPECTED_ACCESS = {
  get_quality_dashboard: { page: 'vf_quality_dashboard', access: 'read' },
  get_quality_audits: { page: 'vf_quality_audits', access: 'read' },
  save_quality_audit: { page: 'vf_quality_audits', access: 'write' },
  save_quality_finding: { page: 'vf_quality_audits', access: 'write' },
  escalate_finding_to_ncr: { page: 'vf_quality_audits', access: 'write' }
};
const EXPECTED_TABLES = {
  get_quality_dashboard: ['valley_quality_sops', 'valley_quality_sop_versions', 'valley_quality_acknowledgements', 'valley_quality_ncrs', 'valley_quality_capas', AUDIT_SHEET, FINDING_SHEET],
  get_quality_audits: AUDIT_TABLES,
  save_quality_audit: [AUDIT_SHEET],
  save_quality_finding: AUDIT_TABLES,
  escalate_finding_to_ncr: AUDIT_TABLES
};
Object.keys(EXPECTED_ACCESS).forEach(function (action) {
  const e = PAGE_ACCESS[action] || {};
  check(e.page === EXPECTED_ACCESS[action].page && e.access === EXPECTED_ACCESS[action].access,
    'PAGE_ACCESS ' + action + ' -> ' + EXPECTED_ACCESS[action].page + '/' + EXPECTED_ACCESS[action].access);
  check(Array.isArray(ACTION_TABLES[action]) && JSON.stringify(ACTION_TABLES[action]) === JSON.stringify(EXPECTED_TABLES[action]),
    'ACTION_TABLES ' + action + ' is an array declaring its full table set');
});
Object.keys(PAGE_ACCESS).filter(k => String(PAGE_ACCESS[k].page || '').indexOf('vf_quality') === 0).forEach(function (action) {
  check(Array.isArray(ACTION_TABLES[action]), 'every quality action declares tables as an array (' + action + ')');
});
check(source.indexOf("ValleyFoods.register('get_quality_audits', getQualityAudits_)") !== -1,
  'get_quality_audits is registered without a ref bust (read)');
check(source.indexOf("ValleyFoods.register('get_quality_dashboard', getQualityDashboard_)") !== -1,
  'get_quality_dashboard is registered without a ref bust (read)');
['save_quality_audit', 'save_quality_finding', 'escalate_finding_to_ncr'].forEach(function (action) {
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
    ' getQualityAudits_: getQualityAudits_, saveQualityAudit_: saveQualityAudit_, saveQualityFinding_: saveQualityFinding_,' +
    ' escalateFindingToNcr_: escalateFindingToNcr_, saveQualityNcr_: saveQualityNcr_,' +
    ' QUALITY_AUDIT_HEADERS: QUALITY_AUDIT_HEADERS, QUALITY_AUDIT_FINDING_HEADERS: QUALITY_AUDIT_FINDING_HEADERS,' +
    ' QUALITY_AUDIT_TYPES: QUALITY_AUDIT_TYPES, QUALITY_AUDIT_STATUSES: QUALITY_AUDIT_STATUSES,' +
    ' QUALITY_FINDING_TYPES: QUALITY_FINDING_TYPES, QUALITY_FINDING_STATUSES: QUALITY_FINDING_STATUSES,' +
    ' QUALITY_AUDIT_SHEET: QUALITY_AUDIT_SHEET, QUALITY_AUDIT_FINDING_SHEET: QUALITY_AUDIT_FINDING_SHEET,' +
    ' QUALITY_NCR_SHEET: QUALITY_NCR_SHEET };';
  vm.runInContext([
    settingsUniqueViolationSrc,
    requireAttachmentBindingSrc,
    extractDriveIdSrc,
    block,
    exportLine
  ].join('\n'), ctx, { filename: 'quality_block.js' });
  return { ctx, sheets, writes, history };
}

/* ══ scenarios ══════════════════════════════════════════════════════ */
const DB = 'db-1';
const COMPANY = '9940659bd83035d7';
const WRITER = { email: 'qa@vf.test', company: COMPANY, authorizedPages: { vf_quality_audits: ['write'] } };
const YEAR = String(new Date().getFullYear());
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

const W = makeWorld();
const H = W.ctx.__out;

function rows(sheet) { return W.ctx.getAllRecords_(DB, sheet); }
function auditRow(uid) { return rows(H.QUALITY_AUDIT_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function findingRow(uid) { return rows(H.QUALITY_AUDIT_FINDING_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
function ncrRow(uid) { return rows(H.QUALITY_NCR_SHEET).filter(r => String(r.unique_id) === uid)[0] || null; }
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
function createAudit(extra) {
  return H.saveQualityAudit_(Object.assign({ audit_type: 'Internal' }, extra || {}), WRITER, DB);
}
function createFinding(extra) {
  return H.saveQualityFinding_(Object.assign({ audit_id: '', finding_type: 'Observation', description: 'وصف ملاحظة' }, extra || {}), WRITER, DB);
}
function moveAudit(uid, to) { return H.saveQualityAudit_({ unique_id: uid, status: to }, WRITER, DB); }

/* ---- constants ---- */
check(H.QUALITY_AUDIT_TYPES.map(t => t.code + ':' + t.label).join('|') ===
  'Internal:تدقيق داخلي|Supplier:تدقيق موردين|Customer:شكوى عميل|Regulatory:جهة رقابية',
  'audit types constant carries the four codes and Arabic labels');
check(H.QUALITY_AUDIT_STATUSES.join('|') === 'Planned|In Progress|Completed|Closed',
  'audit statuses constant matches the lifecycle');
check(H.QUALITY_FINDING_TYPES.map(t => t.code).join('|') === 'Major|Minor|Observation',
  'finding types constant matches the three severities');
check(H.QUALITY_FINDING_STATUSES.join('|') === 'Open|Closed', 'finding statuses are Open|Closed');

/* ---- lazy tables and the empty read ---- */
const read0 = H.getQualityAudits_({}, WRITER, DB);
check(read0.status === 'success' && read0.audits.length === 0 && read0.findings.length === 0 && read0.ncrs.length === 0,
  'get_quality_audits returns empty audits/findings/ncrs before anything exists');
check(!!W.sheets[AUDIT_SHEET] && !!W.sheets[FINDING_SHEET] && !!W.sheets[NCR_SHEET],
  'get_quality_audits lazily creates the three tables');
check(JSON.stringify(read0.audit_types) === JSON.stringify(H.QUALITY_AUDIT_TYPES) &&
  JSON.stringify(read0.finding_types) === JSON.stringify(H.QUALITY_FINDING_TYPES),
  'the read returns both option lists');
const auditHeaders = W.sheets[AUDIT_SHEET].__grid[0];
const findingHeaders = W.sheets[FINDING_SHEET].__grid[0];
check(auditHeaders[0] === 'unique_id' && auditHeaders[1] === 'id' &&
  auditHeaders[auditHeaders.length - 1] === 'created_at' && auditHeaders[auditHeaders.length - 2] === 'user',
  'audit headers keep the base-column convention (unique_id,id first; user,created_at last)');
check(['audit_code', 'audit_date', 'audit_type', 'area', 'auditor_email', 'status', 'summary', 'attachment', 'attachment_id'].every(h => auditHeaders.indexOf(h) !== -1),
  'audit headers carry every planned column');
check(findingHeaders[0] === 'unique_id' && findingHeaders[1] === 'id' &&
  findingHeaders[findingHeaders.length - 1] === 'created_at' && findingHeaders[findingHeaders.length - 2] === 'user',
  'finding headers keep the base-column convention');
check(['audit_id', 'finding_no', 'finding_type', 'description', 'clause_ref', 'ncr_id', 'capa_required', 'status'].every(h => findingHeaders.indexOf(h) !== -1),
  'finding headers carry every planned column');

/* ---- audit create: refusals first ---- */
expectRefusal('audit without a type', () => H.saveQualityAudit_({ area: 'الجودة' }, WRITER, DB));
expectRefusal('audit with an invalid type', () => H.saveQualityAudit_({ audit_type: 'External' }, WRITER, DB));
expectRefusal('audit created with a non-initial status', () => H.saveQualityAudit_({ audit_type: 'Internal', status: 'In Progress' }, WRITER, DB));
expectThrow('audit attachment reference without a Drive id is refused',
  () => createAudit({ attachment: 'valley_quality_audits_Files_/report.pdf' }), /تثبيت معرف Drive/);

/* ---- audit create: code, defaults, attachment ---- */
const au1 = createAudit({ area: 'الإنتاج', summary: 'تدقيق خط التعبئة' });
check(au1.status === 'success' && au1.audit_code === 'AUD-' + YEAR + '-001' && au1.row_status === 'Planned',
  'create allocates AUD-<YYYY>-001 and starts Planned');
check(auditRow(au1.unique_id).audit_date === day(0) && auditRow(au1.unique_id).auditor_email === WRITER.email,
  'create defaults audit_date to today and auditor_email to the caller');
const au2 = createAudit({ audit_type: 'Supplier', audit_date: '2026-02-03', area: 'المخازن' });
check(au2.audit_code === 'AUD-' + YEAR + '-002' && auditRow(au2.unique_id).audit_date === '2026-02-03',
  'second audit in the year is -002 and keeps an explicit audit_date');
const ATT_ID = 'AAAABBBBCCCCDDDDEEEEFFFF';
const ATT_URL = 'https://drive.google.com/file/d/' + ATT_ID + '/view';
const auAtt = createAudit({ audit_type: 'Regulatory', attachment: 'valley_quality_audits_Files_/report.pdf', attachment_id: ATT_URL });
check(auAtt.status === 'success' && auditRow(auAtt.unique_id).attachment_id === ATT_ID &&
  auditRow(auAtt.unique_id).attachment === 'valley_quality_audits_Files_/report.pdf',
  'audit stores the bound attachment reference and Drive id');
const auditCodes = rows(AUDIT_SHEET).map(r => r.audit_code);
check(new Set(auditCodes).size === auditCodes.length && auditCodes.every(c => /^AUD-\d{4}-\d{3}$/.test(c)),
  'every audit_code matches AUD-<YYYY>-NNN and stays unique');

/* ---- header edit while not Closed ---- */
const edited = H.saveQualityAudit_({ unique_id: au1.unique_id, area: 'التعبئة', summary: 'ملخص محدث', auditor_email: 'auditor@vf.test' }, WRITER, DB);
check(edited.status === 'success' && edited.row_status === 'Planned',
  'header fields are editable while Planned');
check(auditRow(au1.unique_id).area === 'التعبئة' && auditRow(au1.unique_id).summary === 'ملخص محدث' &&
  auditRow(au1.unique_id).auditor_email === 'auditor@vf.test',
  'the header patch reached the row');

/* ---- the one legal path on au1 ---- */
check(moveAudit(au1.unique_id, 'In Progress').row_status === 'In Progress' && auditRow(au1.unique_id).status === 'In Progress',
  'Planned -> In Progress is allowed');
check(moveAudit(au1.unique_id, 'Completed').row_status === 'Completed' && auditRow(au1.unique_id).status === 'Completed',
  'In Progress -> Completed is allowed');
const closed = moveAudit(au1.unique_id, 'Closed');
check(closed.row_status === 'Closed' && auditRow(au1.unique_id).status === 'Closed',
  'Completed -> Closed is allowed');

/* ---- a Closed audit is untouchable ---- */
const closedErr = expectRefusal('edit a Closed audit', () => H.saveQualityAudit_({ unique_id: au1.unique_id, area: 'أخرى' }, WRITER, DB));
check(/مغلق/.test(closedErr.message), 'the Closed refusal names the closed state');
expectRefusal('re-close a Closed audit', () => moveAudit(au1.unique_id, 'Closed'));
check(auditRow(au1.unique_id).area === 'التعبئة', 'the refused edits left the Closed audit untouched');

/* ---- illegal transitions on au2, zero writes ---- */
const transErr = expectRefusal('Planned -> Completed', () => moveAudit(au2.unique_id, 'Completed'));
check(/انتقال حالة التدقيق غير مسموح/.test(transErr.message), 'the transition refusal carries its Arabic message');
expectRefusal('Planned -> Closed', () => moveAudit(au2.unique_id, 'Closed'));
expectRefusal('an invalid audit status', () => moveAudit(au2.unique_id, 'Cancelled'));
check(auditRow(au2.unique_id).status === 'Planned', 'every refused Planned transition left the row untouched');
check(moveAudit(au2.unique_id, 'In Progress').row_status === 'In Progress', 'au2 -> In Progress');
expectRefusal('In Progress -> Planned', () => moveAudit(au2.unique_id, 'Planned'));
expectRefusal('In Progress -> Closed', () => moveAudit(au2.unique_id, 'Closed'));
check(moveAudit(au2.unique_id, 'Completed').row_status === 'Completed', 'au2 -> Completed');
expectRefusal('Completed -> Planned', () => moveAudit(au2.unique_id, 'Planned'));
expectRefusal('Completed -> In Progress', () => moveAudit(au2.unique_id, 'In Progress'));
check(auditRow(au2.unique_id).status === 'Completed', 'au2 stays Completed for the finding scenarios');

/* ---- findings: create refusals ---- */
expectRefusal('finding without an audit', () => H.saveQualityFinding_({ finding_type: 'Major', description: 'بلا تدقيق' }, WRITER, DB));
expectRefusal('finding with an unknown audit', () => createFinding({ audit_id: 'no-such-audit' }));
expectRefusal('finding without a description', () => createFinding({ audit_id: au2.unique_id, description: '   ' }));
expectRefusal('finding with an invalid type', () => createFinding({ audit_id: au2.unique_id, finding_type: 'Blocker' }));

/* ---- findings CRUD on au2 ---- */
const f1 = createFinding({ audit_id: au2.unique_id, finding_type: 'Major', description: 'عدم مطابقة جوهرية', clause_ref: '4.2.1', capa_required: true });
check(f1.status === 'success' && f1.finding_no === 1, 'first finding on an audit is number 1');
check(findingRow(f1.unique_id).status === 'Open' && findingRow(f1.unique_id).capa_required === 'TRUE' &&
  findingRow(f1.unique_id).clause_ref === '4.2.1' && findingRow(f1.unique_id).ncr_id === '',
  'create stores Open, the TRUE flag, the clause and an empty ncr_id');
const f2 = createFinding({ audit_id: au2.unique_id, finding_type: 'Observation', description: 'ملاحظة ثانية' });
const f3 = createFinding({ audit_id: au2.unique_id, finding_type: 'Minor', description: 'عدم مطابقة ثانوية' });
check(f2.finding_no === 2 && f3.finding_no === 3, 'finding_no increments 1, 2, 3 per audit');
const editedF1 = H.saveQualityFinding_({ unique_id: f1.unique_id, description: 'وصف محدث', finding_type: 'Minor', clause_ref: '', capa_required: false }, WRITER, DB);
check(editedF1.status === 'success' && editedF1.finding_no === 1, 'update keeps the finding number');
check(findingRow(f1.unique_id).description === 'وصف محدث' && findingRow(f1.unique_id).finding_type === 'Minor' &&
  findingRow(f1.unique_id).clause_ref === '' && findingRow(f1.unique_id).capa_required === 'FALSE',
  'update patches every editable field (and an empty clause clears)');
check(H.saveQualityFinding_({ unique_id: f1.unique_id, status: 'Closed' }, WRITER, DB).status === 'success' &&
  findingRow(f1.unique_id).status === 'Closed',
  'Open -> Closed is allowed');
const backErr = expectRefusal('Closed -> Open', () => H.saveQualityFinding_({ unique_id: f1.unique_id, status: 'Open' }, WRITER, DB));
check(/انتقال حالة الملاحظة غير مسموح/.test(backErr.message), 'the finding transition refusal carries its Arabic message');
const statusErr = expectRefusal('an invalid finding status', () => H.saveQualityFinding_({ unique_id: f1.unique_id, status: 'Rejected' }, WRITER, DB));
check(/حالة الملاحظة غير صالحة/.test(statusErr.message), 'the invalid finding status refusal carries its Arabic message');
check(findingRow(f1.unique_id).status === 'Closed', 'the refused status changes left the row untouched');
check(H.saveQualityFinding_({ unique_id: f2.unique_id, status: 'Open' }, WRITER, DB).status === 'success',
  'staying Open is admitted (a no-op status)');
check(findingRow(f2.unique_id).status === 'Open', 'the no-op left the row Open');
check(H.saveQualityFinding_({ unique_id: f2.unique_id, remove: true }, WRITER, DB).removed === true &&
  !findingRow(f2.unique_id),
  'an unlinked finding is removable');
const f4 = createFinding({ audit_id: au2.unique_id, finding_type: 'Observation', description: 'وصف ملاحظة رابعة', clause_ref: '7.5.2' });
check(f4.finding_no === 4, 'after a removal the number is max existing + 1 (4)');
check(H.saveQualityFinding_({ unique_id: f1.unique_id, remove: true }, WRITER, DB).removed === true && !findingRow(f1.unique_id),
  'a Closed but unlinked finding is removable too');
check(H.saveQualityFinding_({ unique_id: f3.unique_id, remove: true }, WRITER, DB).removed === true && !findingRow(f3.unique_id),
  'removing the last unlinked finding leaves only the escalated candidate');

/* ---- a Closed audit blocks finding work ---- */
const au3 = createAudit({ audit_type: 'Customer', area: 'التوزيع' });
const fA = createFinding({ audit_id: au3.unique_id, finding_type: 'Major', description: 'ملاحظة تدقيق مغلق' });
check(fA.finding_no === 1, 'numbering is per audit (a fresh audit starts at 1)');
moveAudit(au3.unique_id, 'In Progress');
moveAudit(au3.unique_id, 'Completed');
moveAudit(au3.unique_id, 'Closed');
const auditClosedErr = expectRefusal('create a finding on a Closed audit', () => createFinding({ audit_id: au3.unique_id }));
check(/مغلق/.test(auditClosedErr.message), 'the Closed-audit finding refusal names the closed state');
expectRefusal('update a finding of a Closed audit', () => H.saveQualityFinding_({ unique_id: fA.unique_id, description: 'x' }, WRITER, DB));
expectRefusal('remove a finding of a Closed audit', () => H.saveQualityFinding_({ unique_id: fA.unique_id, remove: true }, WRITER, DB));
expectRefusal('escalate a finding of a Closed audit', () => H.escalateFindingToNcr_({ unique_id: fA.unique_id }, WRITER, DB));

/* ---- escalation ---- */
expectRefusal('escalate an unknown finding', () => H.escalateFindingToNcr_({ unique_id: 'no-such-finding' }, WRITER, DB));
const esc1 = H.escalateFindingToNcr_({ unique_id: f4.unique_id }, WRITER, DB);
check(esc1.status === 'success' && esc1.ncr_code === 'NCR-' + YEAR + '-001',
  'escalation allocates the first NCR of the year through the shared allocator');
const ncr1 = ncrRow(esc1.ncr_unique_id);
check(ncr1.source === 'Audit' && ncr1.severity === 'Minor' && ncr1.status === 'Open' && ncr1.capa_required === 'FALSE',
  'the escalated NCR is source Audit, Observation -> Minor, Open, capa_required FALSE');
check(ncr1.department === 'المخازن' && ncr1.detected_by === WRITER.email && ncr1.ncr_date === day(0),
  'department comes from the audit area, detected_by from the caller, ncr_date is today');
check(ncr1.description === 'تدقيق AUD-' + YEAR + '-002 — بند 7.5.2: وصف ملاحظة رابعة',
  'the NCR description carries the audit code, the clause and the finding text');
check(findingRow(f4.unique_id).ncr_id === esc1.ncr_unique_id, 'the finding stores the NCR back-link');
check(W.history.some(h => h[1] === H.QUALITY_NCR_SHEET && h[5] === 'create' && h[0] === DB),
  'escalation logs the NCR create');
check(W.history.some(h => h[1] === H.QUALITY_AUDIT_FINDING_SHEET && h[5] === 'update' &&
  h[6] && h[6].ncr_id === esc1.ncr_unique_id),
  'escalation logs the finding back-link update');
const againErr = expectRefusal('escalate the same finding twice', () => H.escalateFindingToNcr_({ unique_id: f4.unique_id }, WRITER, DB));
check(/تم تصعيد هذه الملاحظة مسبقاً/.test(againErr.message), 'the double-escalation refusal carries its Arabic message');
const removeErr = expectRefusal('remove a linked finding', () => H.saveQualityFinding_({ unique_id: f4.unique_id, remove: true }, WRITER, DB));
check(/لا يمكن حذف ملاحظة مرتبطة بعدم مطابقة/.test(removeErr.message), 'the linked-removal refusal carries its Arabic message');

/* ---- severity mapping: Major and Minor; description without a clause ---- */
const f5 = createFinding({ audit_id: au2.unique_id, finding_type: 'Major', description: 'جوهرية بلا بند' });
const esc2 = H.escalateFindingToNcr_({ unique_id: f5.unique_id }, WRITER, DB);
check(esc2.ncr_code === 'NCR-' + YEAR + '-002' && ncrRow(esc2.ncr_unique_id).severity === 'Major',
  'Major findings escalate as Major, next code -002');
check(ncrRow(esc2.ncr_unique_id).description === 'تدقيق AUD-' + YEAR + '-002: جوهرية بلا بند',
  'without a clause the description omits the clause segment');
const f6 = createFinding({ audit_id: au2.unique_id, finding_type: 'Minor', description: 'ثانوية' });
const esc3 = H.escalateFindingToNcr_({ unique_id: f6.unique_id }, WRITER, DB);
check(esc3.ncr_code === 'NCR-' + YEAR + '-003' && ncrRow(esc3.ncr_unique_id).severity === 'Minor',
  'Minor findings escalate as Minor, next code -003');

/* ---- the same annual sequence backs save_quality_ncr ---- */
const manual = H.saveQualityNcr_({ description: 'عدم مطابقة يدوية' }, WRITER, DB);
check(manual.ncr_code === 'NCR-' + YEAR + '-004',
  'a manual NCR continues the same annual sequence the escalations consumed');

/* ---- the populated read ---- */
const read1 = H.getQualityAudits_({}, WRITER, DB);
check(read1.audits.length === 4 && read1.findings.length === 4 && read1.ncrs.length === 4,
  'the populated read returns every audit, finding and NCR');
check(read1.ncrs.every(n => Object.keys(n).length === 3 && 'unique_id' in n && 'ncr_code' in n && 'status' in n),
  'the NCR list is the minimal {unique_id,ncr_code,status} projection');
check(read1.audits.every(a => a.audit_code && a.audit_type && a.status) &&
  read1.findings.every(f => f.audit_id && f.finding_no && f.finding_type && f.status),
  'audit and finding rows keep their business fields');

console.log(failed === 0
  ? 'quality_audits: PASS (codes, one legal audit path with zero-write refusals, Closed lockdown, finding numbering/removal rules, escalation back-link and shared NCR allocator)'
  : 'quality_audits: FAIL (' + failed + ' check(s))');
process.exit(failed === 0 ? 0 : 1);
