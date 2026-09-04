/**
 * 99_AuditTools.js
 * Developer-only diagnostics. NEVER called by the runtime request path.
 * Run manually from the Apps Script editor:
 *   takeSchemaSnapshot()     — BEFORE the refactor (captures ground truth)
 *   verifySchemaUnchanged()  — after each phase + at the end (must PASS)
 *   auditAccessGates()       — permission-gate diagnostic (Part 2)
 *   dumpRoleMatrix(role)     — inspect matrix for a role
 *   createAuditTestUser() / deactivateAuditTestUser() — browser protocol helper
 * Numeric prefix 99 = loads last; file only declares functions, so order is safe.
 */

// ============ SCHEMA SNAPSHOT ============
const SNAP_META_KEY = 'SCHEMASNAP_META';
const SNAP_CHUNK_KEY = 'SCHEMASNAP_';
const SNAP_CHUNK_CHARS = 3000; // safe under the 9KB-per-property byte limit (Arabic headers are multi-byte in UTF-8 — do not raise this).

function _snapshotSpreadsheet_(ssId, label) {
  const ss = getSpreadsheet_(ssId);
  const sheets = ss.getSheets();
  const out = { label: label, spreadsheetId: ssId, sheets: {} };
  sheets.forEach(function (sheet) {
    const lastCol = sheet.getLastColumn();
    let headers = [];
    let formats = [];
    if (lastCol > 0) {
      headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
        .map(function (h) { return safeStr_(h); });
      try {
        if (sheet.getLastRow() >= 2) {
          // Sample of row-2 number formats: catches a refactor silently changing a column's data format
          formats = sheet.getRange(2, 1, 1, lastCol).getNumberFormats()[0];
        }
      } catch (e) { /* optional field */ }
    }
    out.sheets[sheet.getName()] = { headers: headers, formats: formats };
  });
  return out;
}

function _collectFullSchemaSnapshot_() {
  ensureCompaniesRegistered_(); // REQUIRED — COMPANY_REGISTRY is empty otherwise
  const snapshot = { taken_at: new Date().toISOString(), databases: {} };
  snapshot.databases['AUTH'] = _snapshotSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID, 'AUTH');
  Object.keys(COMPANY_REGISTRY).forEach(function (key) {
    try {
      const dbId = getCompanySpreadsheetId_(key);
      snapshot.databases[key] = _snapshotSpreadsheet_(dbId, key);
    } catch (e) {
      throw new Error('Could not snapshot company "' + key + '": ' + e.message);
    }
  });
  return snapshot;
}

function _sha256Hex_(str) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function _clearStoredSnapshot_() {
  const props = PropertiesService.getScriptProperties();
  const meta = props.getProperty(SNAP_META_KEY);
  if (meta) {
    try {
      const n = JSON.parse(meta).chunks || 0;
      for (let i = 0; i < n; i++) props.deleteProperty(SNAP_CHUNK_KEY + i);
    } catch (e) {}
  }
  props.deleteProperty(SNAP_META_KEY);
}

function takeSchemaSnapshot() {
  const snapshot = _collectFullSchemaSnapshot_();
  const json = JSON.stringify(snapshot);
  const props = PropertiesService.getScriptProperties();
  _clearStoredSnapshot_(); // removes ONLY our keys — never deleteAll()
  const n = Math.ceil(json.length / SNAP_CHUNK_CHARS);
  for (let i = 0; i < n; i++) {
    props.setProperty(SNAP_CHUNK_KEY + i, json.substring(i * SNAP_CHUNK_CHARS, (i + 1) * SNAP_CHUNK_CHARS));
  }
  props.setProperty(SNAP_META_KEY, JSON.stringify({
    taken_at: snapshot.taken_at, chunks: n, sha256: _sha256Hex_(json), length: json.length
  }));
  const summary = Object.keys(snapshot.databases).map(function (k) {
    return k + ' (' + Object.keys(snapshot.databases[k].sheets).length + ' tabs)';
  }).join(', ');
  console.log('SNAPSHOT TAKEN ' + snapshot.taken_at + ' — ' + json.length + ' chars, ' + n + ' chunks. DBs: ' + summary);
  return 'SNAPSHOT OK — DBs: ' + summary;
}

function _loadStoredSnapshot_() {
  const props = PropertiesService.getScriptProperties();
  const metaRaw = props.getProperty(SNAP_META_KEY);
  if (!metaRaw) throw new Error('No schema snapshot stored. Run takeSchemaSnapshot() BEFORE refactoring.');
  const meta = JSON.parse(metaRaw);
  let json = '';
  for (let i = 0; i < meta.chunks; i++) {
    const part = props.getProperty(SNAP_CHUNK_KEY + i);
    if (part === null) throw new Error('Snapshot chunk ' + i + ' missing — retake the snapshot.');
    json += part;
  }
  if (_sha256Hex_(json) !== meta.sha256) throw new Error('Snapshot integrity check FAILED — retake the snapshot.');
  return { meta: meta, snapshot: JSON.parse(json) };
}

function verifySchemaUnchanged() {
  const stored = _loadStoredSnapshot_();
  const current = _collectFullSchemaSnapshot_();
  const problems = [];
  const oldDbs = Object.keys(stored.snapshot.databases);
  oldDbs.forEach(function (dbKey) {
    const oldDb = stored.snapshot.databases[dbKey];
    const newDb = current.databases[dbKey];
    if (!newDb) { problems.push('DATABASE MISSING: ' + dbKey); return; }
    const oldTabs = Object.keys(oldDb.sheets);
    const newTabs = Object.keys(newDb.sheets);
    oldTabs.forEach(function (t) { if (newTabs.indexOf(t) === -1) problems.push('TAB REMOVED: ' + dbKey + '::' + t); });
    newTabs.forEach(function (t) { if (oldTabs.indexOf(t) === -1) problems.push('TAB ADDED: ' + dbKey + '::' + t); });
    oldTabs.forEach(function (t) {
      if (newTabs.indexOf(t) === -1) return;
      const oh = oldDb.sheets[t].headers, nh = newDb.sheets[t].headers;
      if (oh.length !== nh.length) {
        problems.push('COLUMN COUNT CHANGED: ' + dbKey + '::' + t + ' (' + oh.length + ' -> ' + nh.length + ')');
      }
      for (let c = 0; c < Math.min(oh.length, nh.length); c++) {
        if (String(oh[c]) !== String(nh[c])) {
          problems.push('HEADER CHANGED: ' + dbKey + '::' + t + ' col ' + (c + 1) + ' ["' + oh[c] + '" -> "' + nh[c] + '"]');
        }
      }
      const of_ = oldDb.sheets[t].formats, nf = newDb.sheets[t].formats;
      if (of_ && nf && of_.length === nf.length) {
        for (let c = 0; c < of_.length; c++) {
          if (String(of_[c]) !== String(nf[c])) {
            problems.push('FORMAT CHANGED: ' + dbKey + '::' + t + ' col ' + (c + 1));
          }
        }
      }
    });
  });
  Object.keys(current.databases).forEach(function (dbKey) {
    if (oldDbs.indexOf(dbKey) === -1) problems.push('DATABASE ADDED: ' + dbKey);
  });
  if (problems.length) {
    console.error('SCHEMA VERIFICATION FAILED (' + problems.length + '):');
    problems.forEach(function (p) { console.error('  ' + p); });
    return 'FAIL — ' + problems.length + ' schema change(s). See execution log.';
  }
  console.log('SCHEMA VERIFICATION PASSED — identical to snapshot from ' + stored.meta.taken_at);
  return 'PASS — all tabs, headers, and formats identical (' + oldDbs.length + ' databases).';
}

// Notes: compares exact header strings in exact column order + tab lists + row-2 number formats. Stored in Script
// Properties with a SHA-256 integrity hash. If any business flow auto-creates a tab during your test window, you'll get a
// TAB ADDED finding — review it, don't auto-assume failure. If a chunk ever corrupts, retake the snapshot (safe: it's read
// only against the sheets).

// ============ ACCESS GATE AUDIT ============
function dumpRoleMatrix(role) {
  const matrix = getRoleAuthorityMatrix_(role);
  console.log('MATRIX for role "' + role + '": ' + JSON.stringify(matrix, null, 2));
  return matrix;
}

function _fabricateUser_(role, company, isSuperAdmin) {
  // Shaped EXACTLY like authenticateSystemUser_() returns it.
  return {
    email: 'audit@local.test', name: 'AUDIT', role: role, company: company,
    companyId: company, isSuperAdmin: !!isSuperAdmin,
    authorizedPages: isSuperAdmin ? ['*'] : getRoleAuthorityMatrix_(role),
    expires: new Date().toISOString()
  };
}

function auditAccessGates() {
  ensureCompaniesRegistered_();
  // ── CONFIGURE before running ──────────────────────────────────────────
  const TEST_ROLE = 'TEST_ROLE_NO_ACCESS'; // must have ZERO rows in ERP_Pages_Matrix
  const TEST_COMPANY = '8df5c89a117fe9a5';  // TopLight registry key (use registry key, not display name)
  // Also set REAL_ROLE to the role of the actual user who saw the dashboard.
  const REAL_ROLE = '';
  // ─────────────────────────────────────────────────────────────────────
  const exemptUI = ['ERPDashboard', 'user_sessions', 'user_views', 'record_history'];
  const companiesToAudit = Object.keys(COMPANY_REGISTRY);
  const problems = [];
  const notes = [];
  // Map every page -> its owning company (base pages = null)
  const pageOwners = {};
  getAllPages_().forEach(function (p) { pageOwners[p.action] = null; });
  companiesToAudit.forEach(function (ck) {
    COMPANY_REGISTRY[ck].pages.forEach(function (p) { pageOwners[p.action] = ck; });
  });
  const roles = [TEST_ROLE];
  if (REAL_ROLE) roles.push(REAL_ROLE);
  roles.forEach(function (role) {
    const granted = Object.keys(getRoleAuthorityMatrix_(role));
    console.log('=== ROLE "' + role + '" — matrix grants ' + granted.length + ' page(s): ' + (granted.join(', ') || '(none)') + ' ===');
    if (role === TEST_ROLE && granted.length > 0) {
      problems.push('TEST ROLE "' + role + '" unexpectedly has ' + granted.length + ' matrix row(s) — clean them first');
    }
    if (role === TEST_ROLE && granted.length > 0) return; // test role must be truly empty
    const user = _fabricateUser_(role, TEST_COMPANY, false);
    const grantedLookup = getRoleAuthorityMatrix_(role);
    Object.keys(pageOwners).forEach(function (action) {
      if (action === 'login' || action === 'setup') return; // public by design
      const owner = pageOwners[action];
      const isOwnCompany = (owner === TEST_COMPANY);
      const isGlobalBase = (owner === null);
      // L1/L2 gate: checkPageAccessForUI_
      let uiAllowed;
      try { uiAllowed = checkPageAccessForUI_(user, action); }
      catch (e) { uiAllowed = 'THREW: ' + e.message; }
      if (role === TEST_ROLE) {
        const expectedUI = (isGlobalBase && exemptUI.indexOf(action) !== -1);
        if (isOwnCompany && uiAllowed === true && !grantedLookup[action]) {
          problems.push('[UI GATE OPEN] ' + action + ' — allowed for zero-access role "' + role + '"');
        } else if (isGlobalBase && uiAllowed !== expectedUI && action !== 'ERP_Management' && action !== 'db_live_viewer') {
          problems.push('[UI GATE UNEXPECTED] ' + action + ' — returned ' + uiAllowed + ', expected ' + expectedUI);
        }
        if (action === 'ERP_Management' && uiAllowed === true) {
          problems.push('[UI GATE OPEN] ERP_Management visible to non-admin role "' + role + '"');
        }
      }
      // L3 gate: checkPageAccess_ — only meaningful for the user's own company's pages
      if (isOwnCompany) {
        let threw = null;
        try { checkPageAccess_(user, TEST_COMPANY, action, 'read'); }
        catch (e) { threw = e.message; }
        const shouldDeny = !grantedLookup[action];
        if (shouldDeny && threw === null) {
          problems.push('[API GATE OPEN] checkPageAccess_ did NOT deny "' + action + '" for role "' + role + '"');
        }
        if (!shouldDeny && threw !== null) {
          problems.push('[API GATE OVER-DENIES] "' + action + '" granted in matrix but threw: ' + threw);
        }
      }
      // Cross-company isolation: a TopLight user must never pass another company's page
      if (owner !== null && owner !== TEST_COMPANY) {
        let crossThrew = null;
        try { checkPageAccess_(user, owner, action, 'read'); }
        catch (e) { crossThrew = e.message; }
        if (crossThrew === null) {
          problems.push('[CROSS-COMPANY LEAK] user of "' + TEST_COMPANY + '" passed gate for ' + owner + '::' + action);
        }
      }
    });
  });
  if (pageOwners['db_live_viewer'] !== undefined) {
    notes.push('REVIEW: "db_live_viewer" is a base page with NO case in checkPageAccessForUI_ — non-super-admin access depends on explicit matrix row or hardening needed.');
  }
  console.log('───── VERDICT ─────');
  notes.forEach(function (n) { console.log('NOTE: ' + n); });
  if (problems.length === 0) {
    console.log('GATE FUNCTIONS SOUND — they deny correctly for every page incl. ' + TEST_COMPANY + ' dashboard. The leak is in a CALL SITE (nav / router / post-login redirect / dispatch). Run the browser protocol + code hunt.');
    return 'GATES SOUND — leak is in a call site. See log.';
  }
  problems.forEach(function (p) { console.error(p); });
  return 'GATE FUNCTIONS COMPROMISED — ' + problems.length + ' finding(s). Fix 03_Security.js first. See log.';
}

// ============ TEST USER (browser protocol) ============
const AUDIT_TEST_EMAIL = 'access.audit@test.local';
function createAuditTestUser() {
  // passwordhash left EMPTY on purpose → first login routes through the REAL 0_ERPsetup flow, so the browser test also exercises path (c) naturally.
  return addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users', {
    email: AUDIT_TEST_EMAIL, name: 'اختبار الصلاحيات', role: 'TEST_ROLE_NO_ACCESS',
    company: '8df5c89a117fe9a5', status: 'active', passwordhash: '', salt: ''
  }, ['email', 'role', 'company', 'status']);
}
function deactivateAuditTestUser() {
  updateRowByCriteria_(getSheet_('ERP_Users', CONFIG.AUTH_SPREADSHEET_ID),
    'email', AUDIT_TEST_EMAIL, { status: 'inactive' });
}
