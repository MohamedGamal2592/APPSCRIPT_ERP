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

  const usersSheet = getSheet_('ERP_Users', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(usersSheet);
  const data = usersSheet.getDataRange().getValues();
  const rows = data.slice(1);
  const idx = (name) => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const emailIdx = idx('email'), passIdx = idx('passwordhash'), saltIdx = idx('salt');
  const nameIdx = idx('name'), roleIdx = idx('role'), companyIdx = idx('company'), statusIdx = idx('status');

  if (emailIdx === -1) throw new Error('إعداد المستخدمين غير صحيح في قاعدة البيانات');
  const userRow = rows.find(r => String(r[emailIdx]).trim().toLowerCase() === email);
  if (!userRow) throw new Error('البريد الإلكتروني غير مسجل في النظام');

  const currentStatus = statusIdx !== -1 ? String(userRow[statusIdx]).trim().toLowerCase() : 'active';
  if (currentStatus !== 'active') throw new Error('هذا الحساب غير مفعل، يرجى مراجعة الإدارة');

  const storedHash = passIdx !== -1 ? String(userRow[passIdx]).trim() : '';
  if (storedHash === '') return { status: 'setup_required', message: 'مرحباً! يرجى تعيين كلمة مرور جديدة للمتابعة.', email: email };

  if (!payload.password) throw new Error('كلمة المرور مطلوبة');
  const salt = saltIdx !== -1 ? String(userRow[saltIdx]).trim() : '';
  const loginHash = hashPassword_(payload.password, salt);
  if (loginHash !== storedHash) {
    recordLoginFailure_(email);
    throw new Error('بيانات الدخول غير صحيحة');
  }

  clearLoginFailures_(email);
  const token = generateSecureToken_();
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIG.SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  updateRowByCriteria_(usersSheet, 'email', email, { 'sessiontoken': token, 'sessionexpiry': expires, 'updated_at': now });
  bumpVersion_('ERP_Users');

  return {
    status: 'success',
    token: token,
    user: {
      email: email,
      name: nameIdx !== -1 ? userRow[nameIdx] : '',
      role: roleIdx !== -1 ? userRow[roleIdx] : '',
      company: companyIdx !== -1 ? userRow[companyIdx] : ''
    }
  };
}

function setupFirstTimePassword_(payload, sessionToken, authUser) {
  if (!payload || !payload.email || !payload.password) throw new Error('البريد الإلكتروني وكلمة المرور مطلوبان');
  const email = String(payload.email).trim().toLowerCase();

  const usersSheet = getSheet_('ERP_Users', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(usersSheet);
  const data = usersSheet.getDataRange().getValues();
  const rows = data.slice(1);
  const idx = (name) => headers.findIndex(h => String(h).trim().toLowerCase() === name);
  const emailIdx = idx('email'), passIdx = idx('passwordhash'), nameIdx = idx('name');
  const roleIdx = idx('role'), companyIdx = idx('company');

  const userRow = rows.find(r => String(r[emailIdx]).trim().toLowerCase() === email);
  if (!userRow) throw new Error('المستخدم غير موجود');
  const passHeader = passIdx !== -1 ? String(headers[passIdx]).trim() : 'passwordhash';
  if (passIdx !== -1 && String(userRow[passIdx]).trim() !== '') throw new Error('كلمة المرور تم تعيينها مسبقاً. يرجى استخدام صفحة تسجيل الدخول.');

  const salt = generateSalt_();
  const hashed = hashPassword_(payload.password, salt);
  const token = generateSecureToken_();
  const now = new Date();
  const expires = new Date(now.getTime() + CONFIG.SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
  updateRowByCriteria_(usersSheet, 'email', email, {
    [passHeader]: hashed, 'salt': salt, 'sessiontoken': token, 'sessionexpiry': expires, 'updated_at': now
  });
  bumpVersion_('ERP_Users');

  return {
    status: 'success',
    token: token,
    user: {
      email: email,
      name: nameIdx !== -1 ? userRow[nameIdx] : '',
      role: roleIdx !== -1 ? userRow[roleIdx] : '',
      company: companyIdx !== -1 ? userRow[companyIdx] : ''
    }
  };
}

// ==========================================
// Session authentication (versioned cache)
// ==========================================
function authenticateSystemUser_(sessionToken) {
  if (!sessionToken) return { status: 'error', authorized: false };
  const v = SessionManager_.validate(sessionToken);
  if (!v.valid) return { status: 'error', authorized: false };
  const isSuperAdmin = /super\s*admin/i.test(String(v.role || ''));
  const userObj = {
    email: v.email,
    name: v.name,
    role: v.role,
    company: v.company,
    companyId: v.company,
    isSuperAdmin: isSuperAdmin,
    authorizedPages: isSuperAdmin ? ['*'] : getRoleAuthorityMatrix_(v.role),
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
  function getSessionsSheet_() { return getSheet_('ERP_Sessions', CONFIG.AUTH_SPREADSHEET_ID); }
  function getDevicesSheet_() { return getSheet_('ERP_User_Devices', CONFIG.AUTH_SPREADSHEET_ID); }
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
        updateRowByCriteria_(getDevicesSheet_(), 'device_id', deviceId, { device_name: deviceName, last_seen: now });
      }
      const sessions = readRows_('ERP_Sessions').filter(function (s) { return s.email === email && !s.revoked; });
      if (sessions.length >= max) {
        sessions.sort(function (a, b) {
          return new Date(a.last_activity || a.created_at || 0) - new Date(b.last_activity || b.created_at || 0);
        });
        const toRevoke = sessions.slice(0, sessions.length - max + 1);
        toRevoke.forEach(function (s) {
          updateRowByCriteria_(getSessionsSheet_(), 'token_hash', s.token_hash, { revoked: true, revoked_at: now });
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
        updateRowByCriteria_(getSessionsSheet_(), 'token_hash', hash, { revoked: true, revoked_at: new Date() });
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

  function touch(token) {
    if (!token) return;
    const hash = hashToken_(token);
    const cache = CacheService.getScriptCache();
    try {
      if (cache.get('touch_' + hash)) return;
      cache.put('touch_' + hash, '1', 30);
    } catch (e) {}
    try {
      updateRowByCriteria_(getSessionsSheet_(), 'token_hash', hash, { last_activity: new Date() });
    } catch (e) {}
  }

  function revoke(tokenHash) {
    return executeWithLock_(function () {
      const ok = updateRowByCriteria_(getSessionsSheet_(), 'token_hash', tokenHash, { revoked: true, revoked_at: new Date() });
      try { CacheService.getScriptCache().remove('sess_' + tokenHash); } catch (e) {}
      return ok;
    });
  }

  function revokeAllForUser(email) {
    return executeWithLock_(function () {
      const rows = readRows_('ERP_Sessions').filter(function (s) { return s.email === email && !s.revoked; });
      rows.forEach(function (s) {
        updateRowByCriteria_(getSessionsSheet_(), 'token_hash', s.token_hash, { revoked: true, revoked_at: new Date() });
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
    const usersSheet = getSheet_('ERP_Users', CONFIG.AUTH_SPREADSHEET_ID);
    const headers = getHeaders_(usersSheet);
    const data = usersSheet.getDataRange().getValues();
    const rows = data.slice(1);
    const eIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'email'; });
    const mIdx = headers.findIndex(function (h) { return String(h).trim().toLowerCase() === 'max_concurrent_sessions'; });
    const row = rows.find(function (r) { return String(r[eIdx]).trim().toLowerCase() === String(email).trim().toLowerCase(); });
    if (row && mIdx !== -1 && row[mIdx]) {
      const n = Number(row[mIdx]);
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
// Role / permission matrix (versioned cache)
// ==========================================
function getRoleAuthorityMatrix_(userRole) {
  const cache = CacheService.getScriptCache();
  const matrixVersion = cache.get('version_matrix') || '0';
  const cacheKey = 'matrix_v_' + matrixVersion + '_' + userRole;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (cacheErr) {}

  try {
    const matrixSheet = getSheet_('ERP_Pages_Matrix', CONFIG.AUTH_SPREADSHEET_ID);
    const headers = getHeaders_(matrixSheet);
    const data = matrixSheet.getDataRange().getValues();
    const rows = data.slice(1);

    const roleIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'role');
    const pageIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'page_id');
    const accessIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'access_type');
    const statusIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'status');
    if (roleIdx === -1 || pageIdx === -1) return {};

    const allowedPages = {};
    const lowerUserRole = String(userRole || '').trim().toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (String(r[roleIdx]).trim().toLowerCase() === lowerUserRole &&
          (statusIdx === -1 || String(r[statusIdx]).trim().toLowerCase() === 'active')) {
        const rowPage = String(r[pageIdx]).trim();
        let rowAccess = accessIdx !== -1 ? String(r[accessIdx]).trim().toLowerCase() : 'read';
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
// ==========================================
function ensureSystemWorkSheet_() {
  try {
    const ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
    let sheet = ss.getSheetByName('ERP_system_work');
    if (!sheet) {
      sheet = ss.insertSheet('ERP_system_work');
      // Row 1: labels; B2 holds the flag, seeded to 1 (system working).
      sheet.getRange('B1').setValue('on_off');
      sheet.getRange('C1').setValue('updated_at');
      sheet.getRange('D1').setValue('updated_by');
      sheet.getRange('B2').setValue(1);
      sheet.getRange('A1').activate();
      return sheet;
    }
    return sheet;
  } catch (e) {
    throw new Error('Failed to create/access ERP_system_work sheet: ' + e.message);
  }
}

/** Raw read of the B2 flag. Returns 1/0 as number, or null when unreadable/empty. */
function readSystemWorkFlag_(sheet) {
  const v = sheet.getRange('B2').getValue();
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!isNaN(n) && String(v).trim() !== '') return n;
  const s = String(v).trim().toLowerCase();
  if (s === 'false') return 0;
  if (s === 'true') return 1;
  return null;
}

/**
 * Cached kill-switch read. Cache key is versioned by 'version_killswitch'
 * (bumped by onEdit on manual B2 edits and explicitly by toggleKillSwitch_
 * on programmatic writes). Short fallback TTL covers the programmatic-write
 * case where onEdit never fires.
 */
function isSystemEnabled_() {
  try {
    const cache = CacheService.getScriptCache();
    const version = cache.get('version_killswitch') || '0';
    const cacheKey = 'killswitch_v_' + version;
    let cached = null;
    try { cached = cache.get(cacheKey); } catch (cacheErr) {}
    if (cached !== null && cached !== undefined) return cached === 'true';

    let enabled = true; // fail-open default
    try {
      const sheet = ensureSystemWorkSheet_();
      const flag = readSystemWorkFlag_(sheet);
      if (flag === 0) enabled = false;
    } catch (readErr) { enabled = true; }

    try { cache.put(cacheKey, enabled ? 'true' : 'false', CONFIG.CACHE_KILLSWITCH_SECONDS); } catch (putErr) {}
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
    const pid = pages[i].action;
    if (authUser.isSuperAdmin) return pid;
    if (unifiedCheck_(authUser, authUser.company, pid, 'read')) return pid;
  }
  return '';
}

// ==========================================
// Company lookup helpers
// ==========================================
function getCompanySpreadsheetId_(companyName) {
  if (!companyName) throw new Error('Company name is required to fetch spreadsheet ID.');

  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'company_spreadsheet_v_' + compVersion + '_' + companyName;
  try {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  } catch (cacheErr) {}

  const sheet = getSheet_('ERP_Companies', CONFIG.AUTH_SPREADSHEET_ID);
  const headers = getHeaders_(sheet);
  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1);
  const uidIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_unique_id');
  const nameArIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_name_ar');
  const nameEnIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_name_en');
  const linkIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_sheet_link');
  if (linkIdx === -1) throw new Error("Database Error: 'company_sheet_link' column missing.");

  const companyRow = rows.find(r => {
    const uidMatch = uidIdx !== -1 && String(r[uidIdx]).trim().toLowerCase() === String(companyName).trim().toLowerCase();
    const arMatch = nameArIdx !== -1 && String(r[nameArIdx]).trim().toLowerCase() === String(companyName).trim().toLowerCase();
    const enMatch = nameEnIdx !== -1 && String(r[nameEnIdx]).trim().toLowerCase() === String(companyName).trim().toLowerCase();
    return uidMatch || arMatch || enMatch;
  });
  if (!companyRow) throw new Error('Company "' + companyName + '" not found in ERP_Companies.');

  const rawLink = String(companyRow[linkIdx]).trim();
  const spreadsheetId = rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/) ? rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/)[1] : rawLink;
  try { cache.put(cacheKey, spreadsheetId, CONFIG.CACHE_GENERAL_SECONDS); } catch (putErr) {}
  return spreadsheetId;
}

// ==========================================
// Dashboard data — assigned company only, unassigned sees all (no schema change)
// ==========================================
function getDashboardData_(payload, sessionToken, authUser) {
  const rows = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
  const hasCompany = String(authUser.company || '').trim() !== '';
  const normCompany = String(authUser.company || '').trim().toLowerCase();
  const companies = rows
    .filter(r => authUser.isSuperAdmin || !hasCompany || String(r.company_unique_id || '').trim().toLowerCase() === normCompany)
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
function getCompanyLogoUrl_(companyName) {
  if (!companyName) return '';
  try {
    const sheet = getSheet_('ERP_Companies', CONFIG.AUTH_SPREADSHEET_ID);
    const headers = getHeaders_(sheet);
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    const uidIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_unique_id');
    const logoIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_logo');
    if (logoIdx === -1) return '';
    const row = rows.find(r => uidIdx !== -1 && String(r[uidIdx]).trim().toLowerCase() === String(companyName).trim().toLowerCase());
    if (!row) return '';
    const logoId = String(row[logoIdx]).trim();
    return logoId ? driveDirectImageUrl_(logoId, 200) : '';
  } catch (e) { return ''; }
}

// ==========================================
// Per-company theme CSS (versioned cache)
// ==========================================
/** Brand gradient for standalone block pages (access-denied etc.). */
function getCompanyBlockTheme_(companyUid) {
  const uid = String(companyUid || '').trim().toLowerCase();
  if (uid === '8df5c89a117fe9a5') return { from: '#b45309', to: '#f59e0b' };   // Top Light amber
  if (uid === '3fe1b5cb67b7223e') return { from: '#15803d', to: '#22c55e' };   // Top Chemical green
  let theme = { from: '#054719', to: '#16a34a' };                              // Valley Foods / default green
  try {
    if (uid) {
      const sheet = getSheet_('ERP_Companies', CONFIG.AUTH_SPREADSHEET_ID);
      const headers = getHeaders_(sheet);
      const data = sheet.getDataRange().getValues();
      const uidIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_unique_id');
      const colorsIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_colors');
      if (colorsIdx !== -1) {
        for (let i = 1; i < data.length; i++) {
          if (uidIdx !== -1 && String(data[i][uidIdx]).trim() === uid) {
            const gradMap = {
              red: ['#7f1d1d', '#dc2626'],
              green: ['#054719', '#16a34a'],
              yellow: ['#b45309', '#f59e0b'],
              black: ['#111827', '#374151']
            };
            const first = String(data[i][colorsIdx]).toLowerCase().split(',').map(c => c.trim())[0];
            if (gradMap[first]) theme = { from: gradMap[first][0], to: gradMap[first][1] };
            break;
          }
        }
      }
    }
  } catch (e) { /* keep default */ }
  return theme;
}

function getCompanyThemeCSS_(companyName) {
  if (String(companyName || '').trim().toLowerCase() === '8df5c89a117fe9a5') {
    return topLightThemeCss_();
  }
  if (String(companyName || '').trim().toLowerCase() === '3fe1b5cb67b7223e') {
    return topChemicalThemeCss_();
  }

  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'theme_v_' + compVersion + '_' + (companyName || '__default__');
  try {
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  } catch (cacheErr) {}

  let primaryColor = 'red'; let bgColor = 'white';
  try {
    if (companyName) {
      const sheet = getSheet_('ERP_Companies', CONFIG.AUTH_SPREADSHEET_ID);
      const headers = getHeaders_(sheet);
      const data = sheet.getDataRange().getValues();
      const rows = data.slice(1);
      const uidIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_unique_id');
      const nameArIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_name_ar');
      const nameEnIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_name_en');
      const colorsIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'company_colors');
      if (colorsIdx !== -1) {
        const companyRow = rows.find(r => {
          const uidMatch = uidIdx !== -1 && String(r[uidIdx]).trim() === String(companyName).trim();
          const arMatch = nameArIdx !== -1 && String(r[nameArIdx]).trim().toLowerCase() === String(companyName).trim().toLowerCase();
          const enMatch = nameEnIdx !== -1 && String(r[nameEnIdx]).trim().toLowerCase() === String(companyName).trim().toLowerCase();
          return uidMatch || arMatch || enMatch;
        });
        if (companyRow) {
          const colorsArr = String(companyRow[colorsIdx]).toLowerCase().split(',').map(c => c.trim());
          if (colorsArr.length > 0 && ['red', 'green', 'yellow', 'black', 'white'].includes(colorsArr[0])) primaryColor = colorsArr[0];
          if (colorsArr.length > 1 && ['red', 'green', 'yellow', 'black', 'white'].includes(colorsArr[1])) bgColor = colorsArr[1];
        }
      }
    }
  } catch (e) { console.error('Theme Error: ' + e.message); }

  const primaryMap = {
    red: { p: '#D62828', h: '#B91C1C', sb: '#FEF2F2', b: '#FECACA', t: '#FFFFFF' },
    green: { p: '#16A34A', h: '#15803D', sb: '#F0FDF4', b: '#BBF7D0', t: '#FFFFFF' },
    yellow: { p: '#D97706', h: '#B45309', sb: '#FFFBEB', b: '#FDE68A', t: '#111827' },
    black: { p: '#111827', h: '#1F2937', sb: '#F3F4F6', b: '#E5E7EB', t: '#FFFFFF' },
    white: { p: '#FFFFFF', h: '#F9FAFB', sb: '#F9FAFB', b: '#E5E7EB', t: '#111827' }
  };
  const pc = primaryMap[primaryColor];
  let css = "<style>\n:root {\n";
  css += '  --brand-primary: ' + pc.p + ';\n';
  css += '  --brand-primary-hover: ' + pc.h + ';\n';
  css += '  --brand-subtle-bg: ' + pc.sb + ';\n';
  css += '  --brand-border: ' + pc.b + ';\n';
  css += '  --btn-text-color: ' + pc.t + ';\n';
  if (bgColor === 'black') {
    css += '  --bg-primary: #0F172A;\n  --bg-surface: #1E293B;\n  --bg-subtle: #334155;\n  --text-main: #F8FAFC;\n  --text-muted: #94A3B8;\n  --border-color: #334155;\n';
  } else {
    css += '  --bg-primary: #F9FAFB;\n  --bg-surface: #FFFFFF;\n  --bg-subtle: #F3F4F6;\n  --text-main: #111827;\n  --text-muted: #6B7280;\n  --border-color: #E5E7EB;\n';
  }
  css += '}\n</style>\n';
  try { cache.put(cacheKey, css, CONFIG.CACHE_THEME_SECONDS); } catch (putErr) {}
  return css;
}

// Bespoke Top Light theme (company uid 8df5c89a117fe9a5). Uncached so edits apply
// immediately. Overrides tokens + adds structural + print rules.
function topLightThemeCss_() {
  return '' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap">' +
    '<style>\n' +
    ':root {\n' +
    '  --bg-primary: #fbbf24;\n' +
    '  --bg-surface: #ffffff;\n' +
    '  --bg-subtle: #fef08a;\n' +
    '  --text-main: #111111;\n' +
    '  --text-muted: #374151;\n' +
    '  --text-disabled: #4b5563;\n' +
    '  --border-color: #111111;\n' +
    '  --font-sans: \'Cairo\', sans-serif;\n' +
    '  --font-mono: \'Consolas\', \'Courier New\', monospace;\n' +
    '  --success: #16a34a;\n' +
    '  --success-bg: #f0fdf4;\n' +
    '  --success-text: #16a34a;\n' +
    '  --success-border: #bbf7d0;\n' +
    '  --warning: #c2410c;\n' +
    '  --warning-bg: #fff7ed;\n' +
    '  --warning-text: #c2410c;\n' +
    '  --warning-border: #fed7aa;\n' +
    '  --danger: #b91c1c;\n' +
    '  --danger-bg: #fef2f2;\n' +
    '  --danger-text: #b91c1c;\n' +
    '  --danger-border: #fecaca;\n' +
    '  --info: #0369a1;\n' +
    '  --amber: #b45309;\n' +
    '  --brand-primary: #111111;\n' +
    '  --brand-primary-hover: #000000;\n' +
    '  --brand-subtle-bg: #fef08a;\n' +
    '  --brand-border: #111111;\n' +
    '  --btn-text-color: #fbbf24;\n' +
    '  --shadow-brand: 0 4px 14px rgba(17, 17, 17, 0.25);\n' +
    '}\n' +
    'body { background-color: #fbbf24; }\n' +
    '.table thead th { background: #111111; color: #fbbf24; border-bottom: 2px solid #111111; }\n' +
    '.table tbody td { background: #ffffff; color: #111111; }\n' +
    '.table-wrap, .empty-state, .stat-card, .modal, .company-tile, .module-tile, .invoice {\n' +
    '  border: 2px solid #111111;\n' +
    '}\n' +
    '.topbar { background: #111111; border-bottom: 2px solid #111111; }\n' +
    '.topbar .nav-item { color: #fbbf24; }\n' +
    '.topbar .nav-item:hover, .topbar .nav-item.active { color: #111111; background: #fbbf24; }\n' +
    '.num { font-family: var(--font-mono); direction: ltr; text-align: left; font-variant-numeric: tabular-nums; }\n' +
    '.invoice { background: #ffffff; }\n' +
    '@media print {\n' +
    '  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }\n' +
    '}\n' +
    '</style>\n';
}

// Bespoke Top Chemical theme (company uid 3fe1b5cb67b7223e) — green/white.
// Uncached so edits apply immediately. Overrides tokens + adds structural +
// print rules.
function topChemicalThemeCss_() {
  return '' +
    '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap">' +
    '<style>\n' +
    ':root {\n' +
    '  --bg-primary: #16a34a;\n' +
    '  --bg-surface: #ffffff;\n' +
    '  --bg-subtle: #dcfce7;\n' +
    '  --text-main: #111827;\n' +
    '  --text-muted: #374151;\n' +
    '  --text-disabled: #4b5563;\n' +
    '  --border-color: #16a34a;\n' +
    '  --font-sans: \'Cairo\', sans-serif;\n' +
    '  --font-mono: \'Consolas\', \'Courier New\', monospace;\n' +
    '  --success: #16a34a;\n' +
    '  --success-bg: #f0fdf4;\n' +
    '  --success-text: #16a34a;\n' +
    '  --success-border: #bbf7d0;\n' +
    '  --warning: #b45309;\n' +
    '  --warning-bg: #fffbeb;\n' +
    '  --warning-text: #b45309;\n' +
    '  --warning-border: #fde68a;\n' +
    '  --danger: #b91c1c;\n' +
    '  --danger-bg: #fef2f2;\n' +
    '  --danger-text: #b91c1c;\n' +
    '  --danger-border: #fecaca;\n' +
    '  --info: #0369a1;\n' +
    '  --amber: #b45309;\n' +
    '  --brand-primary: #16a34a;\n' +
    '  --brand-primary-hover: #15803d;\n' +
    '  --brand-subtle-bg: #dcfce7;\n' +
    '  --brand-border: #16a34a;\n' +
    '  --btn-text-color: #ffffff;\n' +
    '  --shadow-brand: 0 4px 14px rgba(22, 163, 74, 0.25);\n' +
    '}\n' +
    'body { background-color: #16a34a; }\n' +
    '.table thead th { background: #15803d; color: #ffffff; border-bottom: 2px solid #14532d; }\n' +
    '.table tbody td { background: #ffffff; color: #111827; }\n' +
    '.table-wrap, .empty-state, .stat-card, .modal, .company-tile, .module-tile, .invoice {\n' +
    '  border: 2px solid #16a34a;\n' +
    '}\n' +
    '.topbar { background: #15803d; border-bottom: 2px solid #14532d; }\n' +
    '.topbar .nav-item { color: #ffffff; }\n' +
    '.topbar .nav-item:hover, .topbar .nav-item.active { color: #15803d; background: #ffffff; }\n' +
    '.topbar .nav-dropdown-toggle { color: #ffffff; }\n' +
    '.topbar .nav-dropdown-toggle:hover, .topbar .nav-dropdown-toggle.open { color: #15803d; background: #ffffff; }\n' +
    '.topbar .nav-dropdown-menu { background: #ffffff; border: 2px solid #16a34a; }\n' +
    '.topbar .nav-dropdown-item:hover { background: #dcfce7; color: #15803d; }\n' +
    '.num { font-family: var(--font-mono); direction: ltr; text-align: left; font-variant-numeric: tabular-nums; }\n' +
    '.invoice { background: #ffffff; }\n' +
    '.btn-primary { background: #15803d; box-shadow: 0 4px 14px rgba(20, 83, 45, 0.3); }\n' +
    '.btn-primary:hover { background: #14532d; box-shadow: 0 6px 16px rgba(20, 83, 45, 0.35); }\n' +
    '.btn-outline { border-color: #15803d; }\n' +
    '.btn-outline:hover { background: #dcfce7; border-color: #14532d; color: #14532d; }\n' +
    '.user-block { background: #ffffff; border: 2px solid #16a34a; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18); }\n' +
    '.user-name { font-size: 15px; font-weight: 800; color: #14532d; }\n' +
    '.user-logout { background: #b91c1c; color: #ffffff; border: 1px solid #b91c1c; }\n' +
    '.user-logout:hover { background: #991b1b; border-color: #991b1b; color: #ffffff; }\n' +
    '@media print {\n' +
    '  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }\n' +
    '}\n' +
    '</style>\n';
}