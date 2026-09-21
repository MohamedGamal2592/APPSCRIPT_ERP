/**
 * 03_Security.js
 * RESPONSIBILITY: hashPassword_ (salted), generateSalt_, session auth
 * (versioned cache), login lockout, role/permission matrix,
 * checkPageAccess_, checkPageAccessForUI_, getCompanySpreadsheetId_,
 * getCompanyThemeCSS_. No business logic. Loaded fourth.
 */

// ==========================================
// Password hashing (salted SHA-256)
// ==========================================
function generateSalt_() { return Utilities.getUuid(); }

function hashPassword_(password, salt) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password, Utilities.Charset.UTF_8);
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function generateSecureToken_() { return Utilities.getUuid() + Utilities.getUuid(); }

// The deployed script loads the Firestore repository before this file. These
// compatibility wrappers keep the existing isolated verifier and explicit
// Sheets rollback path usable when the repository layer is not loaded.
function systemRowsCompat_(tableName) {
  if (typeof systemGetAllRecords_ === 'function') return systemGetAllRecords_(tableName);
  try {
    const legacyRows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, tableName);
    // The verifier's legacy stub only implements ERP_Users. For other tables,
    // retain the old direct-sheet behavior when that stub returns an empty set.
    if (legacyRows && (legacyRows.length || tableName === 'ERP_Users')) return legacyRows;
  } catch (e) {}
  try {
    const sheet = getSheet_(tableName, CONFIG.AUTH_SPREADSHEET_ID);
    const headers = getHeaders_(sheet);
    const values = sheet.getDataRange().getValues();
    return values.slice(1).filter(function (row) {
      return row.some(function (value) { return value !== '' && value !== null && value !== undefined; });
    }).map(function (row) {
      const record = {};
      headers.forEach(function (header, index) { record[String(header).trim().toLowerCase()] = row[index]; });
      return record;
    });
  } catch (e2) { return []; }
}
function systemFindCompat_(tableName, fieldName, value) {
  if (typeof systemFindByBusinessKey_ === 'function') return systemFindByBusinessKey_(tableName, fieldName, value);
  const wanted = String(value == null ? '' : value).trim().toLowerCase();
  return systemRowsCompat_(tableName).find(function (row) {
    return String(row[fieldName] == null ? '' : row[fieldName]).trim().toLowerCase() === wanted;
  }) || null;
}
function storagePatchCompat_(tableName, fieldName, value, changes) {
  if (typeof systemPatchByBusinessKey_ === 'function') return systemPatchByBusinessKey_(tableName, fieldName, value, changes);
  return patchRowByCriteria_(getSheet_(tableName, CONFIG.AUTH_SPREADSHEET_ID), fieldName, value, changes);
}
function storagePatchFieldsCompat_(tableName, filters, changes) {
  if (typeof systemPatchByFields_ === 'function') return systemPatchByFields_(tableName, filters, changes);
  if (!filters || !filters.length) return false;
  return patchRowByCriteria_(getSheet_(tableName, CONFIG.AUTH_SPREADSHEET_ID), filters[0].field, filters[0].value, changes);
}

// ==========================================
// Login lockout (5 failures -> 15 minutes)
// ==========================================
function checkLoginLockout_(email) {
  const n = Number(CacheService.getScriptCache().get('fail_' + email) || 0);
  if (n >= CONFIG.LOGIN_LOCKOUT_MAX_ATTEMPTS) {
    throw new Error('Too many attempts. Try again in 15 minutes.');
  }
}

function recordLoginFailure_(email) {
  const cache = CacheService.getScriptCache();
  cache.put('fail_' + email, String(Number(cache.get('fail_' + email) || 0) + 1), CONFIG.LOGIN_LOCKOUT_TTL_SECONDS);
}

function clearLoginFailures_(email) {
  CacheService.getScriptCache().remove('fail_' + email);
}

// ==========================================
// Login / first-time password setup
// ==========================================
function loginUser_(payload, sessionToken, authUser) {
  if (!payload || !payload.email) throw new Error('البريد الإلكتروني مطلوب');
  const email = String(payload.email).trim().toLowerCase();
  checkLoginLockout_(email);

  const rows = systemRowsCompat_('ERP_Users');
  const userRow = rows.find(function (r) { return String(r.email || '').trim().toLowerCase() === email; });
  if (!userRow) throw new Error('البريد الإلكتروني غير مسجل في النظام');
  const currentStatus = String(userRow.status || 'active').trim().toLowerCase();
  if (currentStatus !== 'active') throw new Error('هذا الحساب غير مفعل، يرجى مراجعة الإدارة');

  const assignedCompany = String(userRow.company || '').trim();
  const assignedRole = String(userRow.role || '').trim();
  if (assignedCompany) assertCompanyEnabled_(assignedCompany);
  else if (!/super\s*admin/i.test(assignedRole)) throw new Error('الحساب غير مرتبط بشركة مفعلة، يرجى مراجعة الإدارة');

  const storedHash = String(userRow.passwordhash || '').trim();
  if (storedHash === '') {
    throw new Error('لم يتم تعيين كلمة مرور لهذا الحساب. يرجى طلب إعادة تعيين من مسؤول النظام.');
  }

  if (!payload.password) throw new Error('كلمة المرور مطلوبة');
  const salt = String(userRow.salt || '').trim();
  const loginHash = hashPassword_(payload.password, salt);
  if (loginHash !== storedHash) {
    recordLoginFailure_(email);
    throw new Error('بيانات الدخول غير صحيحة');
  }

  clearLoginFailures_(email);
  const token = generateSecureToken_();
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIG.SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  storagePatchCompat_('ERP_Users', 'email', email, { sessiontoken: token, sessionexpiry: expires, updated_at: now });
  bumpVersion_('ERP_Users');

  return {
    status: 'success',
    token: token,
    user: {
      email: email,
      name: userRow.name || '',
      role: userRow.role || '',
      company: userRow.company || ''
    }
  };
}

function setupFirstTimePassword_(payload, sessionToken, authUser) {
  /* A known email address must never be enough to claim a pre-created account.
   * Existing passwordhash/salt fields already support the super-admin reset flow
   * in adminSaveUser_; a token workflow would require prohibited schema. */
  throw new Error('تعيين كلمة المرور لأول مرة متوقف. اطلب من مسؤول النظام إعادة تعيين كلمة المرور.');
}

// ==========================================
// Session authentication + live identity overlay
// SessionManager_.validate answers "is this token a live session" and is
// correctly cached for the session's full lifetime. Authority must NOT inherit
// that lifetime, so the live identity is overlaid on top of it here.
// ==========================================
function authenticateSystemUser_(sessionToken) {
  if (!sessionToken) return { status: 'error', authorized: false };
  const v = SessionManager_.validate(sessionToken);
  if (!v.valid) return { status: 'error', authorized: false };

  // The session row denormalises role/company at login and sess_<hash> holds it
  // for the session's full 12-hour lifetime. Authority must not inherit that: a
  // role change, a company move or a deactivation has to bite on the user's next
  // request. userDirectory_ is generation-keyed, so an admin's save invalidates
  // it for every user at once.
  const email = String(v.email || '').trim().toLowerCase();
  const dir = userDirectory_();
  const dirLoaded = Object.keys(dir).length > 0;
  const live = dir[email] || null;

  // FAIL-OPEN on a read failure, FAIL-CLOSED on a real absence. An empty map is
  // indistinguishable from a transient read error, so it must not log everyone
  // out at once; a POPULATED map that lacks this email means the user was
  // removed. The two directions are not stylistic — do not unify them.
  if (dirLoaded && !live) return { status: 'error', authorized: false, code: 'ACCOUNT_REMOVED' };
  if (live && String(live.status).toLowerCase() !== 'active') {
    return { status: 'error', authorized: false, code: 'ACCOUNT_DISABLED' };
  }

  const role    = (live && live.role)    ? live.role    : v.role;
  const company = (live && live.company) ? live.company : v.company;
  const name    = (live && live.name)    ? live.name    : v.name;

  const isSuperAdmin = /super\s*admin/i.test(String(role || ''));
  if (company) {
    try {
      assertCompanyEnabled_(company);
    } catch (companyErr) {
      return { status: 'error', authorized: false, code: 'COMPANY_DISABLED' };
    }
  } else if (!isSuperAdmin) {
    return { status: 'error', authorized: false, code: 'COMPANY_DISABLED' };
  }
  const userObj = {
    email: v.email,
    name: name,
    role: role,
    company: company,
    companyId: company,
    isSuperAdmin: isSuperAdmin,
    authorizedPages: isSuperAdmin ? ['*'] : getRoleAuthorityMatrix_(role),
    expires: v.expires
  };
  return { status: 'success', authorized: true, user: userObj };
}

// ==========================================
// Multi-device session manager (B4)
// Sessions live in the AUTH spreadsheet's ERP_Sessions tab; tokens are stored
// ONLY as SHA-256 hashes. Caching keyed by hash is script-global.
// ==========================================
var SessionManager_ = (function () {
  function hashToken_(token) {
    if (!token) return '';
    const salt = CONFIG.SESSION_SALT || 'erp-salt-2024';
    const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + token, Utilities.Charset.UTF_8);
    return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  }
  function readRows_(sheetName) { return getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, sheetName); }

  function create(email, name, role, company, deviceId, deviceName, maxConcurrent) {
    return executeWithLock_(function () {
      const max = Number(maxConcurrent) || Number(CONFIG.MAX_CONCURRENT_SESSIONS) || 5;
      const token = generateSecureToken_();
      const hash = hashToken_(token);
      const now = new Date();
      const expires = new Date(now.getTime() + CONFIG.SESSION_EXPIRY_HOURS * 3600 * 1000);
      const devRows = readRows_('ERP_User_Devices');
      const deviceRec = devRows.find(function (d) { return d.email === email && d.device_id === deviceId; });
      if (!deviceRec) {
        addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_User_Devices', {
          email: email, device_id: deviceId, device_name: deviceName, first_seen: now, last_seen: now
        }, ['email', 'device_id']);
      } else {
        storagePatchFieldsCompat_('ERP_User_Devices', [{ field: 'email', value: email }, { field: 'device_id', value: deviceId }], { device_name: deviceName, last_seen: now });
      }
      const sessions = readRows_('ERP_Sessions').filter(function (s) { return s.email === email && !s.revoked; });
      if (sessions.length >= max) {
        sessions.sort(function (a, b) {
          return new Date(a.last_activity || a.created_at || 0) - new Date(b.last_activity || b.created_at || 0);
        });
        const toRevoke = sessions.slice(0, sessions.length - max + 1);
        toRevoke.forEach(function (s) {
          storagePatchCompat_('ERP_Sessions', 'token_hash', s.token_hash, { revoked: true, revoked_at: now });
        });
      }
      addRecord_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Sessions', {
        token_hash: hash, email: email, name: name, role: role, company: company,
        device_id: deviceId, device_name: deviceName, created_at: now, last_activity: now,
        expires_at: expires, revoked: false
      }, ['token_hash', 'email']);
      const cache = CacheService.getScriptCache();
      try {
        cache.put('sess_' + hash, JSON.stringify({
          email: email, name: name, role: role, company: company, expires: expires.toISOString()
        }), Math.max(1, Math.floor((expires - now) / 1000)));
      } catch (e) {}
      return { token: token, token_hash: hash, expires_at: expires, device_id: deviceId };
    });
  }

  function validate(token) {
    if (!token) return { valid: false };
    const hash = hashToken_(token);
    const cache = CacheService.getScriptCache();
    try {
      const cached = cache.get('sess_' + hash);
      if (cached) {
        const obj = JSON.parse(cached);
        if (new Date(obj.expires) > new Date()) return Object.assign({ valid: true }, obj);
        cache.remove('sess_' + hash);
      }
    } catch (e) {}
    try {
      const rows = readRows_('ERP_Sessions');
      const s = rows.find(function (r) { return r.token_hash === hash && !r.revoked; });
      if (!s) return { valid: false };
      if (new Date(s.expires_at) < new Date()) {
        storagePatchCompat_('ERP_Sessions', 'token_hash', hash, { revoked: true, revoked_at: new Date() });
        return { valid: false };
      }
      const identity = {
        email: s.email, name: s.name, role: s.role, company: s.company,
        expires: new Date(s.expires_at).toISOString()
      };
      const exp = new Date(s.expires_at);
      try {
        cache.put('sess_' + hash, JSON.stringify(identity), Math.max(1, Math.floor((exp - new Date()) / 1000)));
      } catch (e) {}
      return Object.assign({ valid: true }, identity);
    } catch (e) { return { valid: false }; }
  }

  /**
   * F-07. Writing last_activity costs a full getDataRange().getValues() plus a
   * setValues on ERP_Sessions — on the shared AUTH spreadsheet, once per active
   * user, contending with every other user's session validation. The throttle
   * moved from a hardcoded 30s to CONFIG.SESSION_TOUCH_THROTTLE_SECONDS (300s),
   * cutting those writes roughly 10x.
   *
   * Only the freshness of a "last seen" timestamp changes. Session lifetime,
   * expiry and revocation are unaffected: validate() checks expires_at, which is
   * set at login and never derived from last_activity.
   */
  function touch(token) {
    if (!token) return;
    const hash = hashToken_(token);
    const cache = CacheService.getScriptCache();
    try {
      if (cache.get('touch_' + hash)) return;
      cache.put('touch_' + hash, '1', CONFIG.SESSION_TOUCH_THROTTLE_SECONDS);
    } catch (e) {}
    try {
      storagePatchCompat_('ERP_Sessions', 'token_hash', hash, { last_activity: new Date() });
    } catch (e) {}
  }

  function revoke(tokenHash) {
    return executeWithLock_(function () {
      const ok = storagePatchCompat_('ERP_Sessions', 'token_hash', tokenHash, { revoked: true, revoked_at: new Date() });
      try { CacheService.getScriptCache().remove('sess_' + tokenHash); } catch (e) {}
      return ok;
    });
  }

  function revokeAllForUser(email) {
    return executeWithLock_(function () {
      const rows = readRows_('ERP_Sessions').filter(function (s) { return s.email === email && !s.revoked; });
      rows.forEach(function (s) {
        storagePatchCompat_('ERP_Sessions', 'token_hash', s.token_hash, { revoked: true, revoked_at: new Date() });
        try { CacheService.getScriptCache().remove('sess_' + s.token_hash); } catch (e) {}
      });
      return rows.length;
    });
  }

  function listSessions(email) {
    return readRows_('ERP_Sessions')
      .filter(function (s) { return s.email === email && !s.revoked; })
      .map(function (s) {
        return {
          token_hash: s.token_hash, device_name: s.device_name, device_id: s.device_id,
          created_at: s.created_at, last_activity: s.last_activity
        };
      });
  }

  return {
    hashToken_: hashToken_, create: create, validate: validate, touch: touch,
    revoke: revoke, revokeAllForUser: revokeAllForUser, listSessions: listSessions
  };
})();

function readMaxConcurrent_(email) {
  try {
    const row = systemFindCompat_('ERP_Users', 'email', String(email).trim().toLowerCase());
    if (row && row.max_concurrent_sessions) {
      const n = Number(row.max_concurrent_sessions);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch (e) {}
  return Number(CONFIG.MAX_CONCURRENT_SESSIONS) || 5;
}

function handleLoginWithDevice_(payload) {
  if (!payload || !payload.email) throw new Error('البريد الإلكتروني مطلوب');
  const lr = loginUser_(payload, null, null);
  if (lr.status === 'setup_required') return lr;
  if (lr.status !== 'success') throw new Error(lr.message || 'فشل تسجيل الدخول');
  const email = lr.user.email;
  const maxConcurrent = readMaxConcurrent_(email);
  const deviceId = (payload.deviceId && String(payload.deviceId).trim()) || ('dev_' + Utilities.getUuid());
  const deviceName = (payload.deviceName && String(payload.deviceName).trim()) || 'جهاز غير معروف';
  const session = SessionManager_.create(email, lr.user.name, lr.user.role, lr.user.company, deviceId, deviceName, maxConcurrent);
  return {
    status: 'success',
    token: session.token,
    user: lr.user,
    device_id: session.device_id,
    requires_device_name: !payload.deviceName,
    session_expires_at: session.expires_at
  };
}

function handleSetupWithDevice_(payload) {
  const sr = setupFirstTimePassword_(payload, null, null);
  if (sr.status !== 'success') return sr;
  const email = sr.user.email;
  const maxConcurrent = readMaxConcurrent_(email);
  const deviceId = (payload.deviceId && String(payload.deviceId).trim()) || ('dev_' + Utilities.getUuid());
  const deviceName = (payload.deviceName && String(payload.deviceName).trim()) || 'جهاز غير معروف';
  const session = SessionManager_.create(email, sr.user.name, sr.user.role, sr.user.company, deviceId, deviceName, maxConcurrent);
  return {
    status: 'success',
    token: session.token,
    user: sr.user,
    device_id: session.device_id,
    requires_device_name: !payload.deviceName,
    session_expires_at: session.expires_at
  };
}

// ==========================================
// Role / permission matrix (authority-generation cache)
// The key embeds authGeneration_(), so an admin save, a direct sheet edit with
// the onAuthSheetEdit trigger installed, or the staleness ceiling all invalidate
// it. CACHE_MATRIX_SECONDS is now only an occupancy ceiling, not the mechanism.
// The role is normalised into the key, which also collapses the duplicate
// entries the old key produced for roles differing only by case;
// _hasUnifiedAccess_ already lowercases, so no lookup semantics change.
// ==========================================
function getRoleAuthorityMatrix_(userRole) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'mx_g' + authGeneration_() + '_' + String(userRole || '').trim().toLowerCase();
  try {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (cacheErr) {}

  try {
    const rows = systemRowsCompat_('ERP_Pages_Matrix');
    // An empty or structurally incomplete matrix is a read/contract failure:
    // fail closed for authority and do not cache the empty result.
    if (!rows.length || !Object.prototype.hasOwnProperty.call(rows[0], 'role') ||
        !Object.prototype.hasOwnProperty.call(rows[0], 'page_id')) return {};
    const allowedPages = {};
    const lowerUserRole = String(userRole || '').trim().toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (String(r.role).trim().toLowerCase() === lowerUserRole &&
          String(r.status || 'active').trim().toLowerCase() === 'active') {
        const rowPage = String(r.page_id || '').trim();
        let rowAccess = String(r.access_type || 'read').trim().toLowerCase();
        // normalize full-access variants: "full access", "full_access", "fullaccess", "full"
        rowAccess = rowAccess.replace(/[_\s]+/g, ' ').trim();
        if (rowAccess === 'full' || rowAccess === 'full access') rowAccess = 'full';
        // keep read/write/full canonical
        if (['read','write','full'].indexOf(rowAccess) === -1) rowAccess = 'read';
        if (!allowedPages[rowPage]) allowedPages[rowPage] = [];
        if (!allowedPages[rowPage].includes(rowAccess)) allowedPages[rowPage].push(rowAccess);
      }
    }

    try { cache.put(cacheKey, JSON.stringify(allowedPages), CONFIG.CACHE_MATRIX_SECONDS); } catch (putErr) {}
    return allowedPages;
  // Read failure: FAIL CLOSED and, deliberately, DO NOT CACHE. Same reason as
  // the structural bail above.
  } catch (e) { return {}; }
}

// ==========================================
// Unified authority (single source of truth)
// view = see page/nav/data read  -> any grant (read/write/full)
// add  = create new record       -> write or full
// edit/delete family              -> full only (write does NOT imply edit/delete)
// Hierarchy: full ⊇ write ⊇ read  (full satisfies all, write satisfies view+add)
// ==========================================
function _normalizeAccess_(a) {
  let s = String(a || '').trim().toLowerCase().replace(/[_\s]+/g, ' ').trim();
  if (s === 'full' || s === 'full access') return 'full';
  if (s === 'read' || s === 'view') return 'read';
  if (s === 'write' || s === 'add') return 'write';
  if (s === 'delete' || s === 'edit' || s === 'update' || s === 'remove' || s === 'toggle' || s === 'close' || s === 'make') return s;
  return s || 'read';
}
function _hasUnifiedAccess_(grants, required) {
  if (!grants || !grants.length) return false;
  const need = _normalizeAccess_(required);
  const lowerGrants = grants.map(g => _normalizeAccess_(g));
  if (need === 'read' || need === 'view') return lowerGrants.includes('read') || lowerGrants.includes('write') || lowerGrants.includes('full');
  if (need === 'write' || need === 'add') return lowerGrants.includes('write') || lowerGrants.includes('full');
  if (need === 'full') return lowerGrants.includes('full');
  // edit/delete family
  if (['edit','delete','update','remove','toggle','close','make'].indexOf(need) !== -1) return lowerGrants.includes('full');
  // fallback exact
  return lowerGrants.includes(need);
}
function unifiedCheck_(authUser, companyName, pageId, requiredAccess) {
  if (!authUser) return false;
  if (authUser.isSuperAdmin) return true;
  // company isolation except global pages handled by caller
  if (companyName && authUser.company !== companyName) return false;
  if (!pageId) return false;
  const grants = authUser.authorizedPages && authUser.authorizedPages[pageId];
  if (!grants || !grants.length) return false;
  if (!requiredAccess) return true; // view if any grant
  return _hasUnifiedAccess_(grants, requiredAccess);
}

// ==========================================
// System kill switch (ERP_system_work sheet)
// Contract: B1 = header «on_off», B2 = 1 (system works) / 0 (system closed).
// C2/D2 hold updated_at/updated_by audit stamps (informational only).
// Fail-open: if the sheet or B2 is missing/unreadable, the system is ENABLED.
// Recovery when closed is ALWAYS via editing B2 directly in the sheet — the
// app itself cannot flip it once blocked (apiRouter gate precedes auth).
// That direct edit is caught by the INSTALLABLE onAuthSheetEdit trigger, which
// bumps the authority generation and re-enables on the next request. The simple
// onEdit(e) in 02_DataAccess.js has never fired: this is a standalone script and
// simple triggers only run in container-bound projects. With the installable
// trigger missing, recovery is bounded by AUTH_STALENESS_CEILING_SECONDS.
// ==========================================
function ensureSystemWorkSheet_() {
  if (typeof systemFindFlagRecord_ === 'function') return systemFindFlagRecord_();
  const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  let sheet = ss.getSheetByName('ERP_system_work');
  if (!sheet) {
    sheet = ss.insertSheet('ERP_system_work');
    noteMutation_();
    sheet.getRange('B1').setValue('on_off');
    sheet.getRange('C1').setValue('updated_at');
    sheet.getRange('D1').setValue('updated_by');
    sheet.getRange('B2').setValue(1);
    noteMutation_();
  }
  return sheet;
}

/** Raw read of the B2 flag. Returns 1/0 as number, or null when unreadable/empty. */
function readSystemWorkFlag_(sheet) {
  const v = sheet && sheet.data ? sheet.data.on_off : (sheet && typeof sheet.getRange === 'function' ? sheet.getRange('B2').getValue() : null);
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!isNaN(n) && String(v).trim() !== '') return n;
  const s = String(v).trim().toLowerCase();
  if (s === 'false') return 0;
  if (s === 'true') return 1;
  return null;
}

/**
 * Cached kill-switch read, keyed by the authority GENERATION ('ks_g<gen>').
 *
 * The old key was versioned by 'version_killswitch', bumped by the simple
 * onEdit trigger — which never fires in a standalone script, so a direct B2
 * edit was rescued only by the 15s TTL. Now toggleKillSwitch_ (via bumpVersion_)
 * and the installable onAuthSheetEdit trigger both bump the generation, and
 * authGeneration_'s time bucket caps staleness at AUTH_STALENESS_CEILING_SECONDS
 * even if the trigger is missing. The TTL is no longer the mechanism.
 */
function isSystemEnabled_() {
  try {
    if (_ksMemo_ !== null) return _ksMemo_;
    const cache = CacheService.getScriptCache();
    const key = 'ks_g' + authGeneration_();
    let cached = null;
    try { cached = cache.get(key); } catch (cacheErr) {}
    if (cached !== null && cached !== undefined) { _ksMemo_ = (cached === 'true'); return _ksMemo_; }

    let enabled = true; // fail-open default
    let readOk = true;
    try {
      const flagRecord = ensureSystemWorkSheet_();
      const flag = readSystemWorkFlag_(flagRecord);
      if (flag === 0) enabled = false;
    } catch (readErr) { enabled = true; readOk = false; }

    // A FAILED read must not earn the long TTL — caching a fail-open default for
    // six hours would hide a real shutdown.
    try {
      cache.put(key, enabled ? 'true' : 'false',
        readOk ? CONFIG.CACHE_KILLSWITCH_SECONDS : CONFIG.CACHE_AUTH_FAILREAD_SECONDS);
    } catch (putErr) {}
    _ksMemo_ = enabled;
    return enabled;
  } catch (e) {
    return true;
  }
}

// ==========================================
// Page access checks — wrappers over unifiedCheck_
// ==========================================
function checkPageAccess_(authUser, companyName, pageId, requiredAccess) {
  if (authUser && authUser.isSuperAdmin) return true;
  function deny_(reason) {
    try { console.warn('[DENY] checkPageAccess_ email=' + (authUser && authUser.email) + ' company=' + companyName + ' page=' + pageId + ' need=' + requiredAccess + ' reason=' + reason + ' grants=' + (authUser && authUser.authorizedPages && authUser.authorizedPages[pageId] ? authUser.authorizedPages[pageId].join(',') : '')); } catch(e){}
    throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  }
  // company isolation
  if (companyName && authUser && authUser.company !== companyName) return deny_('company_mismatch expected=' + (authUser && authUser.company) + ' got=' + companyName);
  if (!pageId) return deny_('no_pageId');
  const need = _normalizeAccess_(requiredAccess || 'read');
  if (!unifiedCheck_(authUser, companyName || (authUser && authUser.company), pageId, need)) {
    // distinguish no-grant vs wrong level for logs
    const grants = authUser && authUser.authorizedPages && authUser.authorizedPages[pageId];
    if (!grants || !grants.length) return deny_('no_page_grant');
    return deny_('missing_access_type need=' + need + ' have=' + grants.join(','));
  }
  return true;
}

function checkPageAccessForUI_(authUser, pageId) {
  // L2 ROUTE + L1 NAV gate — fail-closed, unified (view = any grant)
  if (pageId === 'ERPDashboard') return true;
  if (pageId === 'ERP_Management') {
    return !!(authUser.isSuperAdmin || String(authUser.role || '').toLowerCase() === 'admin');
  }
  if (['user_sessions', 'user_views', 'record_history'].indexOf(pageId) !== -1) return true;
  if (authUser.isSuperAdmin) return true;
  if (!authUser.company || !COMPANY_REGISTRY[authUser.company]) return false;
  const companyPages = COMPANY_REGISTRY[authUser.company].pages || [];
  const companyPageIds = companyPages.map(p => p.action);
  if (!companyPageIds.includes(pageId)) return false;
  // dashboard view requires at least Read (any grant) — unified: assigned => see, write => add, full => edit/delete
  const allowed = unifiedCheck_(authUser, authUser.company, pageId, 'read');
  if (!allowed) { try { console.warn('[DENY-UI] email='+(authUser&&authUser.email)+' page='+pageId); } catch(e){} }
  return allowed;
}

/** Helper for §5.3: returns first authorized page action for user's company, or '' if none. */
function getFirstAuthorizedPageForUser_(authUser) {
  if (!authUser || !authUser.company || !COMPANY_REGISTRY[authUser.company]) return '';
  const pages = COMPANY_REGISTRY[authUser.company].pages;
  for (let i = 0; i < pages.length; i++) {
    // Skip permission tokens — a registry entry with no template is not a
    // navigable page (valley_cost_view). Landing a user on one would send them
    // to an action the router deliberately refuses to render.
    if (!pages[i].template) continue;
    const pid = pages[i].action;
    if (authUser.isSuperAdmin) return pid;
    if (unifiedCheck_(authUser, authUser.company, pid, 'read')) return pid;
  }
  return '';
}

// ==========================================
// Company lookup helpers
// ==========================================
function companyRecord_(companyName) {
  if (!companyName) throw new Error('Company name is required to fetch spreadsheet ID.');
  const wanted = String(companyName).trim().toLowerCase();
  const rows = systemRowsCompat_('ERP_Companies');
  const companyRow = rows.find(function (r) {
    return [r.company_unique_id, r.company_name_ar, r.company_name_en].some(function (v) {
      return String(v || '').trim().toLowerCase() === wanted;
    });
  });
  if (!companyRow) throw new Error('Company "' + companyName + '" not found in ERP_Companies.');

  const enabledRaw = String(companyRow.enabled == null ? '' : companyRow.enabled).trim().toLowerCase();
  /* Legacy company rows predate the enabled toggle and therefore contain an
   * empty cell. Preserve their pre-existing availability; only an explicit
   * false/disabled value blocks a company. The admin UI now writes TRUE/FALSE
   * for all later changes. */
  const enabled = ['false', '0', 'no', 'disabled', 'inactive'].indexOf(enabledRaw) === -1;
  if (companyRow.company_sheet_link === undefined) throw new Error("Database Error: 'company_sheet_link' column missing.");
  const rawLink = String(companyRow.company_sheet_link).trim();
  const spreadsheetId = rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/) ? rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/)[1] : rawLink;
  return { enabled: enabled, spreadsheetId: spreadsheetId, uid: String(companyRow.company_unique_id || companyName).trim() };
}

function assertCompanyEnabled_(companyName) {
  const record = companyRecord_(companyName);
  if (!record.enabled) throw new Error('هذه الشركة غير مفعلة حالياً.');
  return record;
}

function getCompanySpreadsheetId_(companyName) {
  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'company_spreadsheet_v_' + compVersion + '_' + companyName;
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.enabled && parsed.spreadsheetId) return parsed.spreadsheetId;
    }
  } catch (cacheErr) {}

  const record = assertCompanyEnabled_(companyName);
  try { cache.put(cacheKey, JSON.stringify(record), CONFIG.CACHE_GENERAL_SECONDS); } catch (putErr) {}
  return record.spreadsheetId;
}

// ==========================================
// Phase 3: central dbId resolution + tenant assertion
// Single source of truth for which spreadsheet a company request may touch.
// resolveDbId_ derives the tenant from identity (a super-admin may target
// payload.target_system; everyone else is pinned to their own company) and
// asserts the result matches that company's spreadsheet. assertDbIdBelongsToCompany_
// is the Valley-style double-check reused by dispatch_ layers.
// ==========================================
function assertDbIdBelongsToCompany_(dbId, company) {
  if (!company) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  if (!dbId || String(dbId) !== String(getCompanySpreadsheetId_(company))) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  return String(dbId);
}

function resolveDbId_(authUser, payload) {
  if (!authUser) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  if (authUser.isSuperAdmin) {
    const target = payload && payload.target_system;
    if (!target) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    const dbId = getCompanySpreadsheetId_(target);
    return assertDbIdBelongsToCompany_(dbId, target);
  }
  const company = authUser.company;
  if (!company) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  if (payload && payload.target_system && payload.target_system !== company) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  const dbId = getCompanySpreadsheetId_(company);
  return assertDbIdBelongsToCompany_(dbId, company);
}

// ==========================================
// Dashboard data — assigned company only, unassigned sees all (no schema change)
// ==========================================
function getDashboardData_(payload, sessionToken, authUser) {
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
  const hasCompany = String(authUser.company || '').trim() !== '';
  const normCompany = String(authUser.company || '').trim().toLowerCase();
  const companies = rows
    .filter(r => {
      const enabled = String(r.enabled == null ? '' : r.enabled).trim().toLowerCase();
      const isEnabled = ['false', '0', 'no', 'disabled', 'inactive'].indexOf(enabled) === -1;
      return isEnabled &&
        (authUser.isSuperAdmin || !hasCompany || String(r.company_unique_id || '').trim().toLowerCase() === normCompany);
    })
    .map(r => {
      const isReady = !!COMPANY_REGISTRY[r.company_unique_id];
      return {
        unique_id: r.company_unique_id,
        name_ar: r.company_name_ar,
        name_en: r.company_name_en,
        logo_url: r.company_logo ? driveDirectImageUrl_(String(r.company_logo), 300) : '',
        main_page: isReady ? COMPANY_REGISTRY[r.company_unique_id].pages[0].action : null,
        is_ready: isReady
      };
    });
  return { status: 'success', user: authUser, companies: companies };
}

function driveDirectImageUrl_(fileId, width) {
  const w = width || 300;
  return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w' + w;
}

// Company logo thumbnail URL (from ERP_Companies.company_logo) for a company page.
// F-08: this was the one ERP_Companies reader with no cache — a full
// getDataRange().getValues() on every page render — while both of its siblings
// (getCompanySpreadsheetId_, getCompanyThemeCSS_) are version-cached. Same
// version_companies pattern applied here, so bumpVersion_('ERP_Companies')
// already invalidates it along with the others.
function getCompanyLogoUrl_(companyName) {
  if (!companyName) return '';
  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'company_logo_v_' + compVersion + '_' + companyName;
  try {
    const cached = cache.get(cacheKey);
    if (cached !== null && cached !== undefined) return cached === '\u0000' ? '' : cached;
  } catch (cacheErr) {}
  const url = getCompanyLogoUrlUncached_(companyName);
  try { cache.put(cacheKey, url === '' ? '\u0000' : url, CONFIG.CACHE_LOGO_SECONDS); } catch (putErr) {}
  return url;
}

function getCompanyLogoUrlUncached_(companyName) {
  try {
    const row = systemFindCompat_('ERP_Companies', 'company_unique_id', String(companyName).trim());
    if (!row) return '';
    const logoId = String(row.company_logo || '').trim();
    return logoId ? driveDirectImageUrl_(logoId, 200) : '';
  } catch (e) { return ''; }
}

