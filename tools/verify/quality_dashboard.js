'use strict';
/* QUALITY-DASHBOARD — offline proof for the Valley Foods quality dashboard KPIs.

   The REAL "QUALITY MODULE (v2)" block is sliced out of
   Company_ValleyFoods_Actions.js (banner to banner) together with the REAL
   settingsUniqueViolation_ and requireAttachmentBinding_/extractDriveId_, and
   the REAL PAGE_ACCESS/ACTION_TABLES wiring. It runs in a vm over fake Sheets
   with a deterministic uidV7_ and a capturing vfRefsCached_ stub. Nothing
   touches a spreadsheet, a Google service or the network.

   Proves, on fixtures with known counts, EVERY KPI exactly: SOP effective/
   review/in-review rules, ack status counts, compliance rounding and the
   0-denominator rule, open/closed NCR counts by severity (case-insensitive),
   CAPA open/done/overdue, audit status counts and open findings; the sops[]
   rows for effective versions only; ncrs_recent ordering + 10-row limit + the
   120-char truncation; capas_overdue_list days and ordering (with the
   standalone/missing-NCR fallback); audits_recent findings_open; the dashboard
   is built through vfRefsCached_(dbId, 'quality_dashboard', builder) and
   performs ZERO writes; a ref-stamp bump rebuilds it; and every quality write
   registration in Actions.js is wrapped in withRefBust_, whose chain
   (withRefBust_ -> vfBustRefs_ -> bumpVfRefsVersion_ -> the stamped key in
   vfRefsCached_) is asserted at source level.

   Run: node tools/verify/quality_dashboard.js */
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'Company_ValleyFoods_Actions.js'), 'utf8');
const code = fs.readFileSync(path.join(ROOT, 'Code.js'), 'utf8');

const START = '  // ===================== QUALITY MODULE (v2) =====================';
const END = '  // ===================== QUALITY MODULE END =====================';
const blockStart = source.indexOf(START);
const blockEnd = source.indexOf(END);
if (blockStart < 0 || blockEnd < blockStart) {
  console.error('quality_dashboard: QUALITY MODULE block not found in Company_ValleyFoods_Actions.js');
  process.exit(1);
}
const block = source.slice(blockStart, blockEnd + END.length);

const suStart = source.indexOf('  function settingsUniqueViolation_(');
const suEnd = source.indexOf('\n  }', suStart);
if (suStart < 0 || suEnd < suStart) {
  console.error('quality_dashboard: settingsUniqueViolation_ not found');
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
function grabIndentedFunction(src, name) {
  const start = src.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  const end = src.indexOf('\n  }', start);
  assert(end >= 0, name + ' end');
  return src.slice(start, end + 4);
}
const requireAttachmentBindingSrc = grabFunction(code, 'requireAttachmentBinding_');
const extractDriveIdSrc = grabFunction(code, 'extractDriveId_');

let failed = 0;
function check(ok, label) {
  if (ok) console.log('  PASS  ' + label);
  else { failed++; console.log('  FAIL  ' + label); }
}

/* ══ wiring: PAGE_ACCESS / ACTION_TABLES ══════════════════════════════ */
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

/* ══ the write-wrapper chain, asserted at source level ═══════════════ */
const qualityEntries = Object.keys(PAGE_ACCESS).filter(k => String((PAGE_ACCESS[k] || {}).page || '').indexOf('vf_quality') === 0);
const qualityWrites = qualityEntries.filter(k => PAGE_ACCESS[k].access !== 'read');
const qualityReads = qualityEntries.filter(k => PAGE_ACCESS[k].access === 'read');
/* 17 original writes + the three added by the SOP-editor programme:
   save_quality_dept_abbr (abbreviation configuration, full-only) and the
   general-quality write/set-status pair on the new page. Each is asserted to be
   wrapped in withRefBust_ below, so the count cannot grow silently. */
check(qualityWrites.length === 20, 'PAGE_ACCESS declares the 20 quality write actions (' + qualityWrites.length + ' found)');
check(qualityWrites.indexOf('save_quality_dept_abbr') !== -1 &&
  qualityWrites.indexOf('save_quality_general') !== -1 &&
  qualityWrites.indexOf('set_quality_general_status') !== -1,
  'the three write actions added by the SOP-editor programme are present');
['save_quality_audit', 'save_quality_finding', 'escalate_finding_to_ncr'].forEach(function (a) {
  check(qualityWrites.indexOf(a) !== -1, a + ' is declared a quality write');
});
qualityWrites.forEach(function (a) {
  check(new RegExp("ValleyFoods\\.register\\('" + a + "', withRefBust_\\(").test(source),
    a + ' registration is wrapped in withRefBust_');
});
qualityReads.forEach(function (a) {
  const plain = new RegExp("ValleyFoods\\.register\\('" + a + "', ").test(source);
  const wrapped = new RegExp("ValleyFoods\\.register\\('" + a + "', withRefBust_\\(").test(source);
  check(plain && !wrapped, a + ' registration is a plain read with no ref bust');
});
check(grabIndentedFunction(source, 'withRefBust_').indexOf('vfBustRefs_(dbId, kinds)') !== -1,
  'withRefBust_ busts through vfBustRefs_ after the handler runs');
check(grabIndentedFunction(source, 'vfBustRefs_').indexOf('bumpVfRefsVersion_(dbId)') !== -1,
  'vfBustRefs_ bumps the global ref version stamp');
check(grabFunction(source, 'bumpVfRefsVersion_').indexOf("'vf_refs_ver_'") !== -1,
  'the stamp lives in one cache key per db');
check(grabFunction(source, 'vfRefsCached_').indexOf("kind + '_v' + vfRefsVersion_(dbId)") !== -1,
  'vfRefsCached_ derives every key from the stamp');

/* ══ fake Sheets ═════════════════════════════════════════════════════ */
function makeWorld() {
  const sheets = {};
  const writes = { count: 0 };
  const history = [];
  const cachedKinds = [];
  const refStore = {};
  let refVersion = 1;
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
    return { status: 'success', data: { assignedId: id } };
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
    vfBustRefs_: () => { refVersion++; },
    vfRefsCached_: (dbId, kind, builder) => {
      cachedKinds.push({ dbId: dbId, kind: kind, isBuilder: typeof builder === 'function' });
      const key = dbId + '|' + kind + '_v' + refVersion;
      if (!(key in refStore)) refStore[key] = builder();
      return refStore[key];
    },
    executeWithLock_: (fn) => fn(),
    uidV7_: () => 'uid-' + String(++uidSeq).padStart(4, '0'),
    getNextIdUnderLock_: () => ++idSeq,
    ensureSheet_, getSheet_, getHeaders_, getAllRecords_, safeRows_, addRecord_, patchRowByCriteria_, deleteRowsByCriteria_,
    logHistory_, vfNotApplied_
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const exportLine = '\n__out = {' +
    ' getQualityDashboard_: getQualityDashboard_,' +
    ' QUALITY_SOP_HEADERS: QUALITY_SOP_HEADERS, QUALITY_SOP_VERSION_HEADERS: QUALITY_SOP_VERSION_HEADERS,' +
    ' QUALITY_SOP_ACK_HEADERS: QUALITY_SOP_ACK_HEADERS, QUALITY_NCR_HEADERS: QUALITY_NCR_HEADERS,' +
    ' QUALITY_CAPA_HEADERS: QUALITY_CAPA_HEADERS, QUALITY_AUDIT_HEADERS: QUALITY_AUDIT_HEADERS,' +
    ' QUALITY_AUDIT_FINDING_HEADERS: QUALITY_AUDIT_FINDING_HEADERS };';
  vm.runInContext([
    settingsUniqueViolationSrc,
    requireAttachmentBindingSrc,
    extractDriveIdSrc,
    block,
    exportLine
  ].join('\n'), ctx, { filename: 'quality_block.js' });

  function mkRow(headers, obj) { return headers.map(h => obj[h] !== undefined ? obj[h] : ''); }
  function seed(name, headers, rows) {
    sheets[name] = makeSheet(name, headers);
    (rows || []).forEach(r => sheets[name].__grid.push(r.slice()));
  }
  return {
    ctx, sheets, writes, history, cachedKinds, seed, mkRow,
    bump: () => { refVersion++; }
  };
}

/* ══ fixtures with known counts ══════════════════════════════════════ */
const DB = 'db-1';
const READER = { email: 'qa@vf.test', company: '9940659bd83035d7', authorizedPages: { vf_quality_dashboard: ['read'] } };
const YEAR = String(new Date().getFullYear());
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
const NCR_SHEET = 'valley_quality_ncrs';
const CAPA_SHEET = 'valley_quality_capas';

const SOPS = [
  { unique_id: 'sop-1', id: 1, sop_code: 'SOP-QC-001', title_ar: 'إجراء ضبط الجودة', current_effective_version: '2' },
  { unique_id: 'sop-2', id: 2, sop_code: 'SOP-PROD-001', title_ar: 'إجراء الإنتاج', current_effective_version: '1' },
  { unique_id: 'sop-3', id: 3, sop_code: 'SOP-LAB-001', title_ar: 'إجراء المختبر', current_effective_version: '9' },
  { unique_id: 'sop-4', id: 4, sop_code: 'SOP-WH-001', title_ar: 'إجراء المخازن', current_effective_version: '' }
];
const VERSIONS = [
  { unique_id: 'ver-1', id: 1, sop_id: 'sop-1', version: 2, status: 'Effective', next_review_date: day(-5) },
  { unique_id: 'ver-2', id: 2, sop_id: 'sop-1', version: 1, status: 'Obsolete', next_review_date: '' },
  { unique_id: 'ver-3', id: 3, sop_id: 'sop-2', version: 1, status: 'Effective', next_review_date: day(30) },
  { unique_id: 'ver-4', id: 4, sop_id: 'sop-3', version: 1, status: 'Effective', next_review_date: day(0) },
  { unique_id: 'ver-5', id: 5, sop_id: 'sop-4', version: 3, status: 'In Review', next_review_date: '' },
  { unique_id: 'ver-6', id: 6, sop_id: 'sop-4', version: 2, status: 'Effective', next_review_date: day(10) },
  { unique_id: 'ver-7', id: 7, sop_id: 'sop-2', version: 2, status: 'In Review', next_review_date: '' },
  { unique_id: 'ver-8', id: 8, sop_id: 'sop-3', version: 9, status: 'Effective', next_review_date: '' }
];
const ACKS = [
  { unique_id: 'ack-1', id: 1, sop_id: 'sop-1', sop_version: '2', status: 'Pending' },
  { unique_id: 'ack-2', id: 2, sop_id: 'sop-1', sop_version: '2', status: 'Read' },
  { unique_id: 'ack-3', id: 3, sop_id: 'sop-1', sop_version: '2', status: 'Signed' },
  { unique_id: 'ack-4', id: 4, sop_id: 'sop-1', sop_version: '2', status: 'Signed' },
  { unique_id: 'ack-5', id: 5, sop_id: 'sop-2', sop_version: '1', status: 'Signed' },
  { unique_id: 'ack-6', id: 6, sop_id: 'sop-2', sop_version: '1', status: 'Pending' },
  { unique_id: 'ack-7', id: 7, sop_id: 'sop-3', sop_version: '9', status: 'Superseded' },
  { unique_id: 'ack-8', id: 8, sop_id: 'sop-4', sop_version: '2', status: 'Signed' },
  { unique_id: 'ack-9', id: 9, sop_id: 'sop-4', sop_version: '2', status: 'Superseded' },
  { unique_id: 'ack-10', id: 10, sop_id: 'sop-1', sop_version: '1', status: 'Superseded' },
  { unique_id: 'ack-11', id: 11, sop_id: 'sop-2', sop_version: '2', status: 'Signed' }
];
const NCRS = [
  { unique_id: 'ncr-1', id: 1, ncr_code: 'NCR-' + YEAR + '-001', ncr_date: day(-20), severity: 'Minor', status: 'Open', description: 'وصف 1' },
  { unique_id: 'ncr-2', id: 2, ncr_code: 'NCR-' + YEAR + '-002', ncr_date: day(-19), severity: 'major', status: 'In Review', description: 'وصف 2' },
  { unique_id: 'ncr-3', id: 3, ncr_code: 'NCR-' + YEAR + '-003', ncr_date: day(-18), severity: 'MAJOR', status: 'CAPA Assigned', description: 'وصف 3' },
  { unique_id: 'ncr-4', id: 4, ncr_code: 'NCR-' + YEAR + '-004', ncr_date: day(-17), severity: 'Critical', status: 'Implemented', description: 'وصف 4' },
  { unique_id: 'ncr-5', id: 5, ncr_code: 'NCR-' + YEAR + '-005', ncr_date: day(-16), severity: 'critical', status: 'Closed', description: 'وصف 5' },
  { unique_id: 'ncr-6', id: 6, ncr_code: 'NCR-' + YEAR + '-006', ncr_date: day(-15), severity: 'Minor', status: 'Closed', description: 'وصف 6' },
  { unique_id: 'ncr-7', id: 7, ncr_code: 'NCR-' + YEAR + '-007', ncr_date: day(-14), severity: 'Low', status: 'Open', description: 'وصف 7' },
  { unique_id: 'ncr-8', id: 8, ncr_code: 'NCR-' + YEAR + '-008', ncr_date: day(-13), severity: '', status: 'In Review', description: 'وصف 8' },
  { unique_id: 'ncr-9', id: 9, ncr_code: 'NCR-' + YEAR + '-009', ncr_date: day(-12), severity: 'Major', status: 'Cancelled', description: 'وصف 9' },
  { unique_id: 'ncr-10', id: 10, ncr_code: 'NCR-' + YEAR + '-010', ncr_date: day(-11), severity: 'Minor', status: 'Rejected', description: 'وصف 10' },
  { unique_id: 'ncr-11', id: 11, ncr_code: 'NCR-' + YEAR + '-011', ncr_date: day(-10), severity: 'Minor', status: 'Open', description: 'وصف 11' },
  { unique_id: 'ncr-12', id: 12, ncr_code: 'NCR-' + YEAR + '-012', ncr_date: day(-9), severity: 'Major', status: 'Verified', description: 'A'.repeat(150) }
];
const CAPAS = [
  { unique_id: 'capa-1', id: 1, capa_code: 'CAPA-' + YEAR + '-001', ncr_id: 'ncr-1', status: 'Assigned', due_date: day(-3), owner_email: 'owner1@vf.test' },
  { unique_id: 'capa-2', id: 2, capa_code: 'CAPA-' + YEAR + '-002', ncr_id: 'ncr-2', status: 'In Progress', due_date: day(-7), owner_email: 'owner2@vf.test' },
  { unique_id: 'capa-3', id: 3, capa_code: 'CAPA-' + YEAR + '-003', ncr_id: '', status: 'Assigned', due_date: day(-5), owner_email: 'owner3@vf.test' },
  { unique_id: 'capa-4', id: 4, capa_code: 'CAPA-' + YEAR + '-004', ncr_id: 'ncr-5', status: 'Done', due_date: day(-9), owner_email: 'owner4@vf.test' },
  { unique_id: 'capa-5', id: 5, capa_code: 'CAPA-' + YEAR + '-005', ncr_id: '', status: 'Verified', due_date: day(-9), owner_email: 'owner5@vf.test' },
  { unique_id: 'capa-6', id: 6, capa_code: 'CAPA-' + YEAR + '-006', ncr_id: '', status: 'Closed', due_date: day(-9), owner_email: 'owner6@vf.test' },
  { unique_id: 'capa-7', id: 7, capa_code: 'CAPA-' + YEAR + '-007', ncr_id: '', status: 'Assigned', due_date: day(0), owner_email: 'owner7@vf.test' },
  { unique_id: 'capa-8', id: 8, capa_code: 'CAPA-' + YEAR + '-008', ncr_id: '', status: 'In Progress', due_date: day(4), owner_email: 'owner8@vf.test' },
  { unique_id: 'capa-9', id: 9, capa_code: 'CAPA-' + YEAR + '-009', ncr_id: 'ncr-missing', status: 'Assigned', due_date: day(-1), owner_email: 'owner9@vf.test' },
  { unique_id: 'capa-10', id: 10, capa_code: 'CAPA-' + YEAR + '-010', ncr_id: 'ncr-7', status: 'Assigned', due_date: '', owner_email: 'owner10@vf.test' },
  { unique_id: 'capa-11', id: 11, capa_code: 'CAPA-' + YEAR + '-011', ncr_id: '', status: 'Done', due_date: day(-2), owner_email: 'owner11@vf.test' }
];
const AUDITS = [
  { unique_id: 'aud-1', id: 1, audit_code: 'AUD-' + YEAR + '-001', audit_date: day(-6), audit_type: 'Internal', area: 'الإنتاج', status: 'Completed' },
  { unique_id: 'aud-2', id: 2, audit_code: 'AUD-' + YEAR + '-002', audit_date: day(-4), audit_type: 'Supplier', area: 'المخازن', status: 'In Progress' },
  { unique_id: 'aud-3', id: 3, audit_code: 'AUD-' + YEAR + '-003', audit_date: day(-2), audit_type: 'Internal', area: 'الجودة', status: 'Planned' },
  { unique_id: 'aud-4', id: 4, audit_code: 'AUD-' + YEAR + '-004', audit_date: day(-1), audit_type: 'Regulatory', area: 'المختبر', status: 'Closed' },
  { unique_id: 'aud-5', id: 5, audit_code: 'AUD-' + YEAR + '-005', audit_date: day(-3), audit_type: 'Customer', area: 'التوزيع', status: 'Completed' },
  { unique_id: 'aud-6', id: 6, audit_code: 'AUD-' + YEAR + '-006', audit_date: day(-5), audit_type: 'Internal', area: 'الإنتاج', status: 'Planned' }
];
const FINDINGS = [
  { unique_id: 'f-1', id: 1, audit_id: 'aud-1', finding_no: 1, finding_type: 'Major', status: 'Open' },
  { unique_id: 'f-2', id: 2, audit_id: 'aud-1', finding_no: 2, finding_type: 'Minor', status: 'Closed' },
  { unique_id: 'f-3', id: 3, audit_id: 'aud-1', finding_no: 3, finding_type: 'Observation', status: 'Open' },
  { unique_id: 'f-4', id: 4, audit_id: 'aud-5', finding_no: 1, finding_type: 'Minor', status: 'Open' },
  { unique_id: 'f-5', id: 5, audit_id: 'aud-5', finding_no: 2, finding_type: 'Major', status: 'Closed' },
  { unique_id: 'f-6', id: 6, audit_id: 'aud-3', finding_no: 1, finding_type: 'Observation', status: 'Open' },
  { unique_id: 'f-7', id: 7, audit_id: 'aud-2', finding_no: 1, finding_type: 'Major', status: 'Open' }
];

const W = makeWorld();
const H = W.ctx.__out;
W.seed('valley_quality_sops', H.QUALITY_SOP_HEADERS, SOPS.map(s => W.mkRow(H.QUALITY_SOP_HEADERS, s)));
W.seed('valley_quality_sop_versions', H.QUALITY_SOP_VERSION_HEADERS, VERSIONS.map(v => W.mkRow(H.QUALITY_SOP_VERSION_HEADERS, v)));
W.seed('valley_quality_acknowledgements', H.QUALITY_SOP_ACK_HEADERS, ACKS.map(a => W.mkRow(H.QUALITY_SOP_ACK_HEADERS, a)));
W.seed(NCR_SHEET, H.QUALITY_NCR_HEADERS, NCRS.map(n => W.mkRow(H.QUALITY_NCR_HEADERS, n)));
W.seed(CAPA_SHEET, H.QUALITY_CAPA_HEADERS, CAPAS.map(c => W.mkRow(H.QUALITY_CAPA_HEADERS, c)));
W.seed('valley_quality_audits', H.QUALITY_AUDIT_HEADERS, AUDITS.map(a => W.mkRow(H.QUALITY_AUDIT_HEADERS, a)));
W.seed('valley_quality_audit_findings', H.QUALITY_AUDIT_FINDING_HEADERS, FINDINGS.map(f => W.mkRow(H.QUALITY_AUDIT_FINDING_HEADERS, f)));

/* ---- read: zero writes, built through vfRefsCached_ ---- */
const before = W.writes.count;
const r = H.getQualityDashboard_({}, READER, DB);
check(r.status === 'success', 'dashboard returns status success');
check(W.writes.count === before, 'dashboard performs zero writes');
check(W.cachedKinds.length === 1 && W.cachedKinds[0].dbId === DB &&
  W.cachedKinds[0].kind === 'quality_dashboard' && W.cachedKinds[0].isBuilder,
  'dashboard is built through vfRefsCached_(dbId, quality_dashboard, builder)');
check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(String(r.generated_at)), 'generated_at is an ISO timestamp');

/* ---- every KPI exactly ---- */
const KPIS = {
  sops_total: 4, sops_effective: 3, sops_in_review: 2, sops_review_overdue: 1,
  acks_pending: 2, acks_read: 1, acks_signed: 5, acks_superseded: 3, acks_compliance_pct: 63,
  ncrs_open: 7, ncrs_open_minor: 2, ncrs_open_major: 2, ncrs_open_critical: 1, ncrs_open_other: 2,
  ncrs_verified_pending_close: 1, ncrs_closed: 2,
  capas_open: 7, capas_overdue: 4, capas_done: 4,
  audits_planned: 2, audits_in_progress: 1, audits_completed: 2, findings_open: 5
};
Object.keys(KPIS).forEach(function (k) {
  check(r.kpis[k] === KPIS[k], 'KPI ' + k + ' = ' + KPIS[k] + ' (got ' + r.kpis[k] + ')');
});
check(Object.keys(r.kpis).length === Object.keys(KPIS).length, 'kpis carries exactly the declared keys');
check(r.kpis.ncrs_verified_pending_close === 1, 'verified NCRs are counted separately while waiting for closure');
check(r.integrity.total >= 3 && r.integrity.counts.orphan_capa === 1 && r.integrity.counts.capa_effectiveness_record_incomplete >= 2,
  'read-only reconciliation reports orphan CAPAs and incomplete legacy effectiveness records');
check(r.kpis.acks_compliance_pct === 63, 'compliance rounds 62.5 up to 63, not down to 62');

/* ---- sops[]: effective versions only, per-version ack stats ---- */
const SOP_ROWS = [
  { unique_id: 'sop-1', sop_code: 'SOP-QC-001', title_ar: 'إجراء ضبط الجودة', current_effective_version: '2', next_review_date: day(-5), acks_pending: 1, acks_signed: 2, compliance_pct: 50 },
  { unique_id: 'sop-2', sop_code: 'SOP-PROD-001', title_ar: 'إجراء الإنتاج', current_effective_version: '1', next_review_date: day(30), acks_pending: 1, acks_signed: 1, compliance_pct: 50 },
  { unique_id: 'sop-3', sop_code: 'SOP-LAB-001', title_ar: 'إجراء المختبر', current_effective_version: '9', next_review_date: '', acks_pending: 0, acks_signed: 0, compliance_pct: 100 }
];
check(JSON.stringify(r.sops) === JSON.stringify(SOP_ROWS),
  'sops[] lists the effective versions only, with their ack stats and 0-denominator 100%');

/* ---- ncrs_recent: order, limit, truncation ---- */
const RECENT_CODES = [];
for (let i = 12; i >= 3; i--) RECENT_CODES.push('NCR-' + YEAR + '-' + ('00' + i).slice(-3));
check(r.ncrs_recent.length === 10, 'ncrs_recent is limited to 10 rows');
check(r.ncrs_recent.map(x => x.ncr_code).join('|') === RECENT_CODES.join('|'),
  'ncrs_recent is ordered by ncr_date descending (newest first)');
check(r.ncrs_recent[0].description === 'A'.repeat(120) && r.ncrs_recent[0].description.length === 120,
  'a long description is truncated to 120 characters');
check(r.ncrs_recent[1].description === 'وصف 11' && r.ncrs_recent[1].severity === 'Minor' && r.ncrs_recent[1].status === 'Open',
  'short descriptions and the stored severity/status pass through');
check(Object.keys(r.ncrs_recent[0]).length === 5, 'each recent NCR carries exactly the five declared fields');

/* ---- capas_overdue_list: exact rule, days and ordering ---- */
const OVERDUE = [
  { capa_code: 'CAPA-' + YEAR + '-002', ncr_code: 'NCR-' + YEAR + '-002', owner_email: 'owner2@vf.test', due_date: day(-7), days_overdue: 7 },
  { capa_code: 'CAPA-' + YEAR + '-003', ncr_code: 'مستقل', owner_email: 'owner3@vf.test', due_date: day(-5), days_overdue: 5 },
  { capa_code: 'CAPA-' + YEAR + '-001', ncr_code: 'NCR-' + YEAR + '-001', owner_email: 'owner1@vf.test', due_date: day(-3), days_overdue: 3 },
  { capa_code: 'CAPA-' + YEAR + '-009', ncr_code: 'مستقل', owner_email: 'owner9@vf.test', due_date: day(-1), days_overdue: 1 }
];
check(JSON.stringify(r.capas_overdue_list) === JSON.stringify(OVERDUE),
  'capas_overdue_list holds exactly the overdue CAPAs, days exact, ordered by days_overdue desc');
check(r.capas_overdue_list.filter(c => c.ncr_code === 'مستقل').length === 2,
  'standalone CAPAs and CAPAs with a missing NCR both fall back to مستقل');

/* ---- audits_recent: order + findings_open per audit ---- */
const AUDITS_RECENT = [
  { audit_code: 'AUD-' + YEAR + '-004', audit_date: day(-1), audit_type: 'Regulatory', area: 'المختبر', status: 'Closed', findings_open: 0 },
  { audit_code: 'AUD-' + YEAR + '-003', audit_date: day(-2), audit_type: 'Internal', area: 'الجودة', status: 'Planned', findings_open: 1 },
  { audit_code: 'AUD-' + YEAR + '-005', audit_date: day(-3), audit_type: 'Customer', area: 'التوزيع', status: 'Completed', findings_open: 1 },
  { audit_code: 'AUD-' + YEAR + '-002', audit_date: day(-4), audit_type: 'Supplier', area: 'المخازن', status: 'In Progress', findings_open: 1 },
  { audit_code: 'AUD-' + YEAR + '-006', audit_date: day(-5), audit_type: 'Internal', area: 'الإنتاج', status: 'Planned', findings_open: 0 },
  { audit_code: 'AUD-' + YEAR + '-001', audit_date: day(-6), audit_type: 'Internal', area: 'الإنتاج', status: 'Completed', findings_open: 2 }
];
check(JSON.stringify(r.audits_recent) === JSON.stringify(AUDITS_RECENT),
  'audits_recent is date-descending and counts each audit\'s open findings');

/* ---- cache hit + bust behaviour ---- */
W.sheets[NCR_SHEET].__grid.push(W.mkRow(H.QUALITY_NCR_HEADERS, {
  unique_id: 'ncr-13', id: 13, ncr_code: 'NCR-' + YEAR + '-013', ncr_date: day(0),
  severity: 'Critical', status: 'Open', description: 'مضافة بعد التخزين'
}));
const cached = H.getQualityDashboard_({}, READER, DB);
check(cached === r, 'a second read is served from the cache (same object, no rebuild)');
check(cached.kpis.ncrs_open === 7 && cached.kpis.ncrs_open_critical === 1,
  'the cached dashboard does not see the un-busted row');
W.bump();
const fresh = H.getQualityDashboard_({}, READER, DB);
check(fresh !== r && fresh.kpis.ncrs_open === 8 && fresh.kpis.ncrs_open_critical === 2,
  'after a ref-stamp bump (vfBustRefs_) the dashboard rebuilds and sees the new row');
check(W.cachedKinds.length === 3, 'every dashboard read goes through vfRefsCached_');
check(W.writes.count === before, 'no dashboard read ever wrote');

/* ---- 0-denominator rule on an empty world ---- */
const E = makeWorld();
const er = E.ctx.__out.getQualityDashboard_({}, READER, DB);
check(er.status === 'success' && er.kpis.acks_compliance_pct === 100,
  'with no acks at all the compliance is 100 (zero denominator)');
check(Object.keys(er.kpis).every(k => (k === 'acks_compliance_pct' ? er.kpis[k] === 100 : er.kpis[k] === 0)),
  'an empty world yields zero for every other KPI');
check(er.sops.length === 0 && er.ncrs_recent.length === 0 && er.capas_overdue_list.length === 0 && er.audits_recent.length === 0,
  'an empty world yields empty lists');

/* A dashboard read must not migrate a populated legacy quality sheet. */
const LEG = makeWorld();
const LH = LEG.ctx.__out;
LEG.seed(NCR_SHEET, LH.QUALITY_NCR_HEADERS.slice(0, 23), []);
LEG.seed(CAPA_SHEET, LH.QUALITY_CAPA_HEADERS.slice(0, 18), []);
LEG.seed('valley_quality_audits', LH.QUALITY_AUDIT_HEADERS.slice(0, 13), []);
LEG.seed('valley_quality_audit_findings', LH.QUALITY_AUDIT_FINDING_HEADERS.slice(0, 12), []);
const legacyHeaderCounts = [23, 18, 13, 12];
const legacyNames = [NCR_SHEET, CAPA_SHEET, 'valley_quality_audits', 'valley_quality_audit_findings'];
const legacyWritesBefore = LEG.writes.count;
const legacyRead = LH.getQualityDashboard_({}, READER, DB);
check(legacyRead.status === 'success' && LEG.writes.count === legacyWritesBefore,
  'a dashboard read on populated legacy quality sheets performs no migration writes');
legacyNames.forEach(function (name, i) {
  check(LEG.sheets[name].__grid[0].length === legacyHeaderCounts[i],
    name + ' keeps its legacy columns unchanged during a dashboard read');
});

console.log(failed === 0
  ? 'quality_dashboard: PASS (every KPI exact, effective-version rows, recent ordering/limit, overdue list, cached via vfRefsCached_ with zero writes, write-registration ref-bust chain)'
  : 'quality_dashboard: FAIL (' + failed + ' check(s))');
process.exit(failed === 0 ? 0 : 1);
