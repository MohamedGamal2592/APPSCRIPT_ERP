/**
 * =====================================================================================
 *  ASSESSMENT PLATFORM - MAIN ROUTER & SECURITY (code.gs)
 *  Version: 6.2-SECURE (Access-Control Hardened + Fully Documented)
 * =====================================================================================
 *  ARCHITECTURE OVERVIEW:
 *  1. CONFIG: Central place for settings (Sheet names, timeouts, security policies).
 *  2. PAGES: Single source of truth for frontend routing.
 *  3. DEFENSIVE HELPERS: Safely read/write to Sheets without crashing on missing columns.
 *  4. SECURITY: Hash passwords, verify session tokens, verify candidate tokens, enforce permissions.
 *  5. FRONTEND FUNCTIONS (ui...): Functions exposed to the HTML via google.script.run.
 *  6. ROUTER (doGet/doPost): Directs web traffic to the correct HTML or backend function.
 * =====================================================================================
 */

// #####################################################################################
// # 1. CONFIG                                                                          #
// #####################################################################################

const CONFIG = {
  SESSION_EXPIRY_HOURS: 12,
  IGNORE_UNKNOWN_FIELDS: true,
  MAX_LOGIN_ATTEMPTS: 5,          // SECURITY PATCH P4
  LOGIN_LOCKOUT_MINUTES: 15,      // SECURITY PATCH P4
  MIN_PASSWORD_LENGTH: 10,        // SECURITY PATCH P3: basic password policy
  ALLOWED_POSITIONS: ['Super Admin', 'Admin', 'Reviewer', 'Staff'] // SECURITY PATCH P10
};

const SHEET = {
  USERS: 'Users',
  ASSESSMENTS: 'Assessments',
  QUESTIONS: 'Questions',
  ASSIGNMENTS: 'Assignments',
  RESPONSES: 'Responses',
  RESULTS: 'Results',
  CONFIG: 'Config',
  AUDIT: 'AuditLog',
  USERS_PERMISSION: 'UsersPermission',
  ASSESSMENT_BATCHES: 'AssessmentBatches'
};

// #####################################################################################
// # 2. PAGES                                                                           #
// #####################################################################################

const PAGES = [
  { action: 'login',       name: 'Login / تسجيل الدخول',                 template: 'Login',                title: 'Assessment Platform - Login', public: true },
  { action: 'dashboard',   name: 'Dashboard / لوحة التحكم',                template: 'MainPage',              title: 'Dashboard' },
  { action: 'adding_users',       name: 'User Management / إدارة المستخدمين',     template: 'Admin',                 title: 'Admin Panel - Add User' },
  { action: 'permissions', name: 'Permissions Assignment / تعيين الصلاحيات', template: 'PermissionAssignment', title: 'Permissions Assignment' },
  { action: 'create_assessment',      name: 'Create Assessment / إنشاء تقييم',        template: 'CreateAssessment',                    title: 'Create Assessment' },
  { action: 'assignments_building',      name: 'Assignments /التقييمات المرسلة ',                template: null,                    title: 'Assignments' },
  { action: 'review_results',     name: 'Review Results / مراجعة النتائج',        template: 'ReviewResults',                    title: 'Review Results' },
  { action: 'view_assessments', name: 'View Assessments / عرض التقييمات', template: 'ViewAssessments', title: 'View Assessments' },
  { action: 'create_batch', name: 'Create Batch / إنشاء دفعة', template: 'CreateBatch', title: 'Create Batch Assignment' },
  { action: 'view_batches', name: 'View Batches / عرض الدفعات', template: 'ViewBatches', title: 'View Batches' },
];

// #####################################################################################
// # 3. DEFENSIVE DATABASE HELPERS                                                       #
// #####################################################################################

function getSheet_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    Logger.log('Database Error: missing tab ' + sheetName);
    throw new Error('Database Error: The tab \'' + sheetName + '\' does not exist. خطأ: الشيت غير موجود.');
  }
  return sheet;
}

const _headerCache_ = {};
function getHeaders_(sheet) {
  const key = sheet.getSheetId();
  if (!_headerCache_[key]) {
    const lastCol = sheet.getLastColumn();
    _headerCache_[key] = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  }
  return _headerCache_[key];
}

function getColIndex_(sheet, headerName) {
  const headers = getHeaders_(sheet);
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === String(headerName).trim().toLowerCase()) {
      return i + 1;
    }
  }
  throw new Error('Database Error: Column \'' + headerName + '\' is missing in tab \'' + sheet.getName() + '\'.');
}

function tryGetColIndex_(sheet, headerName) {
  try { return getColIndex_(sheet, headerName); } catch (e) { return null; }
}

function mapRowToObject_(row, sheetName) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  let obj = {};
  headers.forEach((header, index) => {
    let val = row[index];
    if (val instanceof Date) val = val.toISOString();
    else if (val === undefined || val === '') val = null;
    obj[header] = val;
  });
  return obj;
}

function writeRowByHeaders_(sheet, dataObject) {
  const headers = getHeaders_(sheet);
  if (headers.length === 0) throw new Error('Database Error: Tab \'' + sheet.getName() + '\' has no header row.');

  const rowValues = headers.map(header => {
    const matchingKey = Object.keys(dataObject).find(k => k.trim().toLowerCase() === String(header).trim().toLowerCase());
    return matchingKey !== undefined ? dataObject[matchingKey] : '';
  });

  if (!CONFIG.IGNORE_UNKNOWN_FIELDS) {
    const headerSet = headers.map(h => String(h).trim().toLowerCase());
    Object.keys(dataObject).forEach(key => {
      if (headerSet.indexOf(key.trim().toLowerCase()) === -1) throw new Error('Database Error: Field \'' + key + '\' does not match any column.');
    });
  }

  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, rowValues.length).setValues([rowValues]);
  return newRow;
}

function updateRowByHeaders_(sheet, matchColumn, matchValue, dataObject) {
  const data = sheet.getDataRange().getValues();
  const matchColIdx = getColIndex_(sheet, matchColumn) - 1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][matchColIdx] === matchValue) {
      const rowNum = i + 1;
      Object.keys(dataObject).forEach(key => {
        const colIdx = tryGetColIndex_(sheet, key);
        if (colIdx) sheet.getRange(rowNum, colIdx).setValue(dataObject[key]);
        else if (!CONFIG.IGNORE_UNKNOWN_FIELDS) throw new Error('Database Error: Field \'' + key + '\' does not match any column.');
      });
      return true;
    }
  }
  return false;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) {
    throw new Error('The system is busy processing another request, please try again. النظام مشغول حاليًا.');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

function validateRequired_(dataObject, requiredFields) {
  const missing = requiredFields.filter(f => {
    const v = dataObject ? dataObject[f] : undefined;
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missing.length > 0) throw new Error('Missing required field(s): ' + missing.join(', ') + '. برجاء إدخال الحقول المطلوبة.');
}

// #####################################################################################
// # 4. SECURITY & MIDDLEWARE                                                          #
// #####################################################################################

function hashPassword_(password) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/**
 * SECURITY PATCH P2: Cryptographically strong ID generator.
 */
function generateShortId_(length) {
  length = length || 16;
  let raw = Utilities.getUuid().replace(/-/g, '');
  while (raw.length < length) raw += Utilities.getUuid().replace(/-/g, '');
  return raw.substring(0, length);
}

/**
 * SECURITY PATCH P2: Session/candidate tokens get FULL UUID entropy (72 chars).
 */
function generateSecureToken_() {
  return Utilities.getUuid() + Utilities.getUuid();
}

/**
 * SECURITY PATCH P4: simple login throttle using CacheService.
 */
function checkLoginThrottle_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail_' + email;
  const attempts = parseInt(cache.get(key)) || 0;
  if (attempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
    throw new Error('Too many failed login attempts. Please try again later. تم حظر الدخول مؤقتًا، حاول لاحقًا.');
  }
}
function recordLoginFailure_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'loginfail_' + email;
  const attempts = (parseInt(cache.get(key)) || 0) + 1;
  cache.put(key, String(attempts), CONFIG.LOGIN_LOCKOUT_MINUTES * 60);
}
function clearLoginFailures_(email) {
  CacheService.getScriptCache().remove('loginfail_' + email);
}

/**
 * SECURITY PATCH P7: Session expiry is now REQUIRED.
 */
function authenticateSystemUser_(sessionToken, requiredPosition) {
  if (!sessionToken) throw new Error('Unauthorized: No session token provided. برجاء تسجيل الدخول أولاً.');
  const sheet = getSheet_(SHEET.USERS);
  const data = sheet.getDataRange().getValues();
  const tokenCol = getColIndex_(sheet, 'SessionToken') - 1;
  const expiryCol = getColIndex_(sheet, 'SessionExpiry') - 1; // mandatory

  for (let i = 1; i < data.length; i++) {
    if (data[i][tokenCol] && data[i][tokenCol] === sessionToken) {
      const expiry = data[i][expiryCol];
      if (!expiry || new Date(expiry) < new Date()) {
        throw new Error('Unauthorized: Session expired. انتهت صلاحية الجلسة.');
      }
      const userData = mapRowToObject_(data[i], SHEET.USERS);
      const userPosition = userData.Position;
      if (requiredPosition === 'Super Admin' && userPosition !== 'Super Admin') {
        throw new Error('Forbidden: Super Admin access required. هذا الإجراء متاح لمدير النظام فقط.');
      }
      return userData;
    }
  }
  throw new Error('Unauthorized: Invalid or expired session. الجلسة غير صالحة.');
}

/**
 * SECURITY PATCH P11: Enforces the USERS_PERMISSION matrix.
 */
function requirePageAccess_(userData, action) {
  const page = PAGES.find(p => p.action === action);
  if (!page || page.public) return true;
  const sheet = getSheet_(SHEET.USERS_PERMISSION);
  const data = sheet.getDataRange().getValues();
  const posCol = getColIndex_(sheet, 'Position') - 1;
  const pageCol = getColIndex_(sheet, 'PageName') - 1;
  const accessCol = getColIndex_(sheet, 'AccessType') - 1;

  if (userData.Position === 'Super Admin') return true; // Super Admin bypasses

  for (let i = 1; i < data.length; i++) {
    if (data[i][posCol] === userData.Position && data[i][pageCol] === action) {
      const access = data[i][accessCol];
      if (access && access !== 'None' && access !== 'none') return true;
    }
  }
  throw new Error('Forbidden: You do not have access to this page. غير مصرح لك بالوصول لهذه الصفحة.');
}

function authenticateCandidateToken_(token) {
  if (!token) throw new Error('Invalid assessment link: no token provided. رابط التقييم غير صالح.');
  const sheet = getSheet_(SHEET.ASSIGNMENTS);
  const data = sheet.getDataRange().getValues();
  const tokenCol = getColIndex_(sheet, 'Token') - 1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][tokenCol] === token) {
      const assignment = mapRowToObject_(data[i], SHEET.ASSIGNMENTS);
      if (assignment.Status === 'Completed') throw new Error('This assessment has already been completed. تم إنهاء هذا التقييم بالفعل.');
      if (assignment.ExpiresAt && new Date(assignment.ExpiresAt) < new Date()) throw new Error('This assessment link has expired. انتهت صلاحية رابط التقييم.');
      return assignment;
    }
  }
  throw new Error('Invalid or expired assessment token. رابط التقييم غير صحيح أو منتهي.');
}

// #####################################################################################
// # 5. SUPER ADMIN SETUP                                                              #
// #####################################################################################

/**
 * SECURITY PATCH P3: No hardcoded password. Reads a one-time bootstrap
 * password from Script Properties (Project Settings > Script Properties).
 */
function initializeSuperAdmin_() {
  const bootstrapPassword = PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_PASSWORD');
  if (!bootstrapPassword) {
    throw new Error('Set a BOOTSTRAP_ADMIN_PASSWORD script property before running this function.');
  }
  if (bootstrapPassword.length < CONFIG.MIN_PASSWORD_LENGTH) {
    throw new Error('Bootstrap password does not meet minimum length policy.');
  }
  const sheet = getSheet_(SHEET.USERS);
  const data = sheet.getDataRange().getValues();
  const posCol = getColIndex_(sheet, 'Position') - 1;
  const emailCol = getColIndex_(sheet, 'Email') - 1;
  const passCol = getColIndex_(sheet, 'PasswordHash') - 1;
  let adminSet = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][posCol] === 'Super Admin' && !data[i][passCol]) {
      sheet.getRange(i + 1, passCol + 1).setValue(hashPassword_(bootstrapPassword));
      Logger.log('Super Admin password set for ' + data[i][emailCol]);
      adminSet = true;
    }
  }
  PropertiesService.getScriptProperties().deleteProperty('BOOTSTRAP_ADMIN_PASSWORD');
  if (!adminSet) Logger.log('Super Admin already has a password or was not found.');
}

// #####################################################################################
// # 6. NATIVE FRONTEND FUNCTIONS                                                       #
// #####################################################################################

function uiLogin(email, password, newPassword) {
  try {
    validateRequired_({ email: email }, ['email']);
    email = String(email).trim().toLowerCase(); // SECURITY PATCH P8

    checkLoginThrottle_(email); // SECURITY PATCH P4

    const sheet = getSheet_(SHEET.USERS);
    const data = sheet.getDataRange().getValues();
    const emailCol = getColIndex_(sheet, 'Email') - 1;
    const passCol = getColIndex_(sheet, 'PasswordHash') - 1;
    const tokenCol = getColIndex_(sheet, 'SessionToken') - 1;
    const nameCol = getColIndex_(sheet, 'Name') - 1;
    const posCol = getColIndex_(sheet, 'Position') - 1;
    const expiryColIdx = getColIndex_(sheet, 'SessionExpiry');

    let userData = null;
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][emailCol]).trim().toLowerCase() === email) { userData = data[i]; rowIndex = i + 1; break; }
    }

    const genericAuthError = 'Invalid email or password. البريد الإلكتروني أو كلمة المرور غير صحيحة.'; // P5

    if (!userData) {
      recordLoginFailure_(email);
      throw new Error(genericAuthError);
    }
    const storedHash = userData[passCol];

    if (!storedHash) {
      if (!newPassword) return { status: 'setup_required', message: 'Please set a new password to continue. برجاء تعيين كلمة مرور جديدة.' };
      if (String(newPassword).length < CONFIG.MIN_PASSWORD_LENGTH) {
        throw new Error('Password must be at least ' + CONFIG.MIN_PASSWORD_LENGTH + ' characters. كلمة المرور قصيرة جدًا.');
      }
      sheet.getRange(rowIndex, passCol + 1).setValue(hashPassword_(newPassword));
    } else if (storedHash !== hashPassword_(password)) {
      recordLoginFailure_(email);
      throw new Error(genericAuthError);
    }

    clearLoginFailures_(email);

    const sessionToken = generateSecureToken_();
    sheet.getRange(rowIndex, tokenCol + 1).setValue(sessionToken);

    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + CONFIG.SESSION_EXPIRY_HOURS);
    sheet.getRange(rowIndex, expiryColIdx).setValue(expiryDate);

    return { status: 'success', token: sessionToken, user: { name: userData[nameCol], position: userData[posCol] } };
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiAddUser(sessionToken, userData) {
  try {
    const admin = authenticateSystemUser_(sessionToken, 'Super Admin');
    validateRequired_(userData, ['Name', 'Email', 'Position']);

    if (CONFIG.ALLOWED_POSITIONS.indexOf(userData.Position) === -1) {
      throw new Error('Invalid position specified. الوظيفة غير صالحة.');
    }

    const cleanEmail = String(userData.Email).trim().toLowerCase();

    return withLock_(() => {
      const sheet = getSheet_(SHEET.USERS);
      const existingData = sheet.getDataRange().getValues();
      const emailCol = getColIndex_(sheet, 'Email') - 1;
      const emailExists = existingData.some((row, idx) => idx > 0 && String(row[emailCol]).trim().toLowerCase() === cleanEmail);
      if (emailExists) throw new Error('A user with this email already exists. يوجد مستخدم بنفس البريد الإلكتروني بالفعل.');

      writeRowByHeaders_(sheet, {
        UserID: generateShortId_(),
        Name: userData.Name,
        Email: cleanEmail,
        Position: userData.Position,
        Department: userData.Department || '',
        Type: userData.Type || '',
        PasswordHash: '',
        SessionToken: '',
        Phone: userData.Phone || '',
        CreatedAt: new Date()
      });
      logAudit_(admin.Email, 'Add User', 'Added user: ' + cleanEmail);
      return { status: 'success', message: 'User added! They will be asked to set a password on first login. تم إضافة المستخدم بنجاح.' };
    });
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiSaveAssessment(sessionToken, assessmentData, questionsData) {
  try {
    const admin = authenticateSystemUser_(sessionToken);
    requirePageAccess_(admin, 'create_assessment');
    validateRequired_(assessmentData, ['Title', 'Category']);
    return withLock_(() => {
      const assessSheet = getSheet_(SHEET.ASSESSMENTS);
      const questSheet = getSheet_(SHEET.QUESTIONS);
      const newAssessmentId = generateShortId_();
      const now = nowDateTime_();

      writeRowByHeaders_(assessSheet, {
        AssessmentID: newAssessmentId, Title: assessmentData.Title, Category: assessmentData.Category,
        Description: assessmentData.Description || '', TimeLimitMinutes: assessmentData.TimeLimitMinutes || 0,
        PassScore: assessmentData.PassScore || 0, IsActive: assessmentData.IsActive === true ? true : false,
        UserID: admin.UserID, CreatedAt: now, UpdatedAt: now
      });

      questionsData.forEach((q, index) => {
        writeRowByHeaders_(questSheet, {
          QuestionID: generateShortId_(),
          AssessmentID: newAssessmentId,
          OrderIndex: index + 1,
          QuestionText: q.QuestionText,
          QuestionType: q.QuestionType,
          OptionsJSON: JSON.stringify(q.Options || []),
          CorrectAnswer: q.CorrectAnswer || '',
          Weight: q.Weight || 1,
          Trait: q.Trait || '',
          UserID: admin.UserID,
          CreatedAt: now
        });
      });
      logAudit_(admin.Email, 'Create Assessment', 'Created: ' + assessmentData.Title);
      return { status: 'success', message: 'Assessment created successfully! تم إنشاء التقييم بنجاح.' };
    });
  } catch (e) { return { status: 'error', message: e.message }; }
}

function sanitizeForClient_(obj) {
  const out = {};
  for (const key in obj) {
    const val = obj[key];
    if (val instanceof Date) out[key] = val.toISOString();
    else if (val === undefined) out[key] = null;
    else out[key] = val;
  }
  return out;
}

function uiGetAssessments(sessionToken) {
  try {
    const admin = authenticateSystemUser_(sessionToken);
    requirePageAccess_(admin, 'view_assessments');
    const sheet = getSheet_(SHEET.ASSESSMENTS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'success', data: [] };
    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    const headers = getHeaders_(sheet);
    const assessments = [];
    for (let i = 0; i < data.length; i++) {
      let obj = {};
      headers.forEach((header, index) => {
        let val = data[i][index];
        if (val instanceof Date) val = val.toISOString();
        else if (val === undefined || val === '') val = null;
        obj[header] = val;
      });
      assessments.push(obj);
    }
    return { status: 'success', data: assessments };
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiGetAssessmentDetailsForAdmin(sessionToken, assessmentId) {
  try {
    const admin = authenticateSystemUser_(sessionToken);
    requirePageAccess_(admin, 'view_assessments');
    if (!assessmentId) return { status: 'error', message: 'No assessmentId provided.' };
    const assessSheet = getSheet_(SHEET.ASSESSMENTS);
    const questSheet = getSheet_(SHEET.QUESTIONS);
    const aData = assessSheet.getDataRange().getValues();
    const aHeaders = getHeaders_(assessSheet);
    const aIdCol = getColIndex_(assessSheet, 'AssessmentID') - 1;
    let assessment = null;
    for (let i = 1; i < aData.length; i++) {
      if (String(aData[i][aIdCol]).trim() === String(assessmentId).trim()) {
        let obj = {}; aHeaders.forEach((h, idx) => obj[h] = aData[i][idx]);
        assessment = sanitizeForClient_(obj); break;
      }
    }
    if (!assessment) return { status: 'error', message: 'Assessment not found.' };

    const qData = questSheet.getDataRange().getValues();
    const qHeaders = getHeaders_(questSheet);
    const qAssessIdCol = getColIndex_(questSheet, 'AssessmentID') - 1;
    let questions = [];
    for (let i = 1; i < qData.length; i++) {
      if (String(qData[i][qAssessIdCol]).trim() === String(assessmentId).trim()) {
        let q = {}; qHeaders.forEach((h, idx) => q[h] = qData[i][idx]);
        questions.push(sanitizeForClient_(q));
      }
    }
    questions.sort((a, b) => (parseInt(a.OrderIndex) || 0) - (parseInt(b.OrderIndex) || 0));
    questions.forEach(q => {
      try { q.OptionsArray = JSON.parse(q.OptionsJSON || '[]'); } catch (e) { q.OptionsArray = []; }
    });
    return { status: 'success', assessment: assessment, questions: questions };
  } catch (e) { return { status: 'error', message: e.message }; }
}

// ==========================================
// BATCH ASSIGNMENT LOGIC
// ==========================================

function uiGetActiveAssessments(sessionToken) {
  try {
    authenticateSystemUser_(sessionToken);
    const sheet = getSheet_(SHEET.ASSESSMENTS);
    const data = sheet.getDataRange().getValues();
    const idCol = getColIndex_(sheet, 'AssessmentID') - 1;
    const titleCol = getColIndex_(sheet, 'Title') - 1;
    const activeCol = getColIndex_(sheet, 'IsActive') - 1;
    let assessments = [];
    for (let i = 1; i < data.length; i++) {
      const isActive = data[i][activeCol] === true || data[i][activeCol] === 'true';
      if (isActive) assessments.push({ id: data[i][idCol], title: data[i][titleCol] });
    }
    return { status: 'success', data: assessments };
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiCreateBatch(sessionToken, companyName, assessmentId, assessmentTitle, maxCandidates) {
  try {
    const admin = authenticateSystemUser_(sessionToken);
    requirePageAccess_(admin, 'create_batch');
    validateRequired_({ companyName, assessmentId, maxCandidates }, ['companyName', 'assessmentId', 'maxCandidates']);

    return withLock_(() => {
      const sheet = getSheet_(SHEET.ASSESSMENT_BATCHES);
      const newToken = generateSecureToken_();
      const newBatchId = generateShortId_();

      const now = new Date();
      const expires = new Date(now);
      expires.setDate(expires.getDate() + 10);
      const nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      const expiresStr = Utilities.formatDate(expires, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

      writeRowByHeaders_(sheet, {
        BatchID: newBatchId,
        Token: newToken,
        CompanyName: companyName,
        AssessmentID: assessmentId,
        AssessmentTitle: assessmentTitle,
        MaxCandidates: parseInt(maxCandidates) || 1,
        UsedSlots: 0,
        AssignedBy: admin.UserID,
        CreatedAt: nowStr,
        ExpiresAt: expiresStr,
        IsActive: true
      });
      logAudit_(admin.Email, 'Create Batch', 'Created batch for Company: ' + companyName + ' | Assessment: ' + assessmentTitle);

      const candidateLink = ScriptApp.getService().getUrl() + '?action=takeTest&token=' + newToken;
      return { status: 'success', message: 'Batch created successfully! Link expires in 10 days.', link: candidateLink };
    });
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiGetExistingCompanies(sessionToken) {
  try {
    authenticateSystemUser_(sessionToken);
    const sheet = getSheet_(SHEET.ASSESSMENT_BATCHES);
    const data = sheet.getDataRange().getValues();
    const compCol = getColIndex_(sheet, 'CompanyName') - 1;
    let companies = [];
    for (let i = 1; i < data.length; i++) {
      const val = data[i][compCol];
      if (val && companies.indexOf(val) === -1) companies.push(val);
    }
    return { status: 'success', data: companies };
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiGetBatches(sessionToken) {
  try {
    const admin = authenticateSystemUser_(sessionToken);
    requirePageAccess_(admin, 'view_batches');

    const bSheet = getSheet_(SHEET.ASSESSMENT_BATCHES);
    const aSheet = getSheet_(SHEET.ASSESSMENTS);

    const lastRow = bSheet.getLastRow();
    if (lastRow < 2) return { status: 'success', data: [] };

    const assessMap = {};
    const aData = aSheet.getDataRange().getValues();
    const aIdCol = getColIndex_(aSheet, 'AssessmentID') - 1;
    const aTitleCol = getColIndex_(aSheet, 'Title') - 1;
    for (let i = 1; i < aData.length; i++) {
      assessMap[aData[i][aIdCol]] = aData[i][aTitleCol];
    }

    const bData = bSheet.getDataRange().getValues();
    const bHeaders = getHeaders_(bSheet);
    const batches = [];

    for (let i = 1; i < bData.length; i++) {
      let obj = {};
      bHeaders.forEach((header, index) => {
        let val = bData[i][index];
        if (val instanceof Date) val = val.toISOString();
        else if (val === undefined || val === '') val = null;
        obj[header] = val;
      });
      if ((!obj.AssessmentTitle || obj.AssessmentTitle === 'N/A') && obj.AssessmentID) {
        obj.AssessmentTitle = assessMap[obj.AssessmentID] || 'N/A';
      }
      batches.push(obj);
    }

    return { status: 'success', data: batches };
  } catch (e) { return { status: 'error', message: e.message }; }
}

// ==========================================
// CANDIDATE TEST LOGIC
// ==========================================

function uiStartTest(token, candidateEmail) {
  try {
    validateRequired_({ token, candidateEmail }, ['token', 'candidateEmail']);
    candidateEmail = String(candidateEmail).trim().toLowerCase();

    const batchSheet = getSheet_(SHEET.ASSESSMENT_BATCHES);
    const bData = batchSheet.getDataRange().getValues();
    const tokenCol = getColIndex_(batchSheet, 'Token') - 1;

    let batch = null;
    let batchRowNum = -1;
    for (let i = 1; i < bData.length; i++) {
      if (bData[i][tokenCol] === token) {
        batch = mapRowToObject_(bData[i], SHEET.ASSESSMENT_BATCHES);
        batchRowNum = i + 1; break;
      }
    }
    if (!batch) throw new Error('Invalid token.');
    if (batch.IsActive === false || batch.IsActive === 'false') throw new Error('This assessment is inactive.');
    if (batch.ExpiresAt && new Date(batch.ExpiresAt) < new Date()) throw new Error('This link has expired.');

    const assignSheet = getSheet_(SHEET.ASSIGNMENTS);
    const aData = assignSheet.getDataRange().getValues();
    const aTokenCol = getColIndex_(assignSheet, 'Token') - 1;
    const aEmailCol = getColIndex_(assignSheet, 'CandidateEmail') - 1;

    let assignmentId = null;
    let existingStatus = null;

    for (let i = 1; i < aData.length; i++) {
      if (aData[i][aTokenCol] === token && String(aData[i][aEmailCol]).trim().toLowerCase() === candidateEmail) {
        assignmentId = aData[i][getColIndex_(assignSheet, 'AssignmentID') - 1];
        existingStatus = aData[i][getColIndex_(assignSheet, 'Status') - 1];
        break;
      }
    }
    if (existingStatus === 'Completed') throw new Error('You have already completed this assessment.');

    if (!assignmentId) {
      if (parseInt(batch.UsedSlots) >= parseInt(batch.MaxCandidates)) throw new Error('This assessment batch is full.');

      assignmentId = generateShortId_();
      const now = nowDateTime_();

      writeRowByHeaders_(assignSheet, {
        AssignmentID: assignmentId,
        BatchID: batch.BatchID,
        Token: token,
        CandidateEmail: candidateEmail,
        AssessmentID: batch.AssessmentID,
        Status: 'In Progress',
        StartedAt: now,
        CompletedAt: '',
        CreatedAt: now
      });

      const usedSlotsCol = getColIndex_(batchSheet, 'UsedSlots');
      const currentUsed = parseInt(batch.UsedSlots) || 0;
      batchSheet.getRange(batchRowNum, usedSlotsCol).setValue(currentUsed + 1);
    }

    const assessSheet = getSheet_(SHEET.ASSESSMENTS);
    const assessData = assessSheet.getDataRange().getValues();
    const assessIdCol = getColIndex_(assessSheet, 'AssessmentID') - 1;
    let assessment = null;
    for (let i = 1; i < assessData.length; i++) {
      if (assessData[i][assessIdCol] === batch.AssessmentID) { assessment = mapRowToObject_(assessData[i], SHEET.ASSESSMENTS); break; }
    }

    const qSheet = getSheet_(SHEET.QUESTIONS);
    const qData = qSheet.getDataRange().getValues();
    const qAssessIdCol = getColIndex_(qSheet, 'AssessmentID') - 1;
    let questions = [];
    for (let i = 1; i < qData.length; i++) {
      if (qData[i][qAssessIdCol] === batch.AssessmentID) {
        let q = mapRowToObject_(qData[i], SHEET.QUESTIONS);
        try { q.OptionsArray = JSON.parse(q.OptionsJSON || '[]'); } catch (e) { q.OptionsArray = []; }
        delete q.CorrectAnswer;
        delete q.Weight;
        questions.push(q);
      }
    }
    questions.sort((a, b) => (parseInt(a.OrderIndex) || 0) - (parseInt(b.OrderIndex) || 0));
    return { status: 'success', assignmentId: assignmentId, assessment: assessment, questions: questions };
  } catch (e) { return { status: 'error', message: e.message }; }
}

/**
 * SECURITY PATCH P9: Verifies assignment ownership (token+email) and blocks resubmission.
 */
function uiSubmitTest(payload) {
  try {
    const { token, assignmentId, candidateEmail, answers } = payload;
    validateRequired_({ token, assignmentId, candidateEmail }, ['token', 'assignmentId', 'candidateEmail']);
    const cleanEmail = String(candidateEmail).trim().toLowerCase();

    return withLock_(() => {
      const assignSheet = getSheet_(SHEET.ASSIGNMENTS);
      const aData = assignSheet.getDataRange().getValues();
      const aIdCol = getColIndex_(assignSheet, 'AssignmentID') - 1;
      const aTokenCol = getColIndex_(assignSheet, 'Token') - 1;
      const aEmailCol = getColIndex_(assignSheet, 'CandidateEmail') - 1;
      const aStatusCol = getColIndex_(assignSheet, 'Status') - 1;

      let matchedRow = -1;
      for (let i = 1; i < aData.length; i++) {
        if (aData[i][aIdCol] === assignmentId
            && aData[i][aTokenCol] === token
            && String(aData[i][aEmailCol]).trim().toLowerCase() === cleanEmail) {
          matchedRow = i;
          break;
        }
      }
      if (matchedRow === -1) throw new Error('Invalid submission: assignment does not match token/email.');
      if (aData[matchedRow][aStatusCol] === 'Completed') throw new Error('This assessment has already been submitted.');

      const respSheet = getSheet_(SHEET.RESPONSES);
      const now = nowDateTime_();
      const headers = getHeaders_(respSheet);

      const rowsToInsert = (answers || []).map(ans => {
        return headers.map(header => {
          switch (header) {
            case 'ResponseID': return generateShortId_();
            case 'AssignmentID': return assignmentId;
            case 'QuestionID': return ans.questionId;
            case 'Answer': return ans.answer;
            case 'Score': return '';
            case 'AnsweredAt': return now;
            case 'EmailCandidate': return cleanEmail;
            case 'CreatedAt': return now;
            default: return '';
          }
        });
      });

      if (rowsToInsert.length > 0) {
        const startRow = respSheet.getLastRow() + 1;
        respSheet.getRange(startRow, 1, rowsToInsert.length, headers.length).setValues(rowsToInsert);
      }

      const row = matchedRow + 1;
      assignSheet.getRange(row, aStatusCol + 1).setValue('Completed');
      assignSheet.getRange(row, getColIndex_(assignSheet, 'CompletedAt')).setValue(now);

      return { status: 'success', message: 'Test submitted successfully!' };
    });
  } catch (e) { return { status: 'error', message: e.message }; }
}

// ==========================================
// REPORTING LOGIC
// ==========================================

function uiGetCandidateSummary(sessionToken) {
  try {
    const admin = authenticateSystemUser_(sessionToken);
    requirePageAccess_(admin, 'review_results');

    const aSheet = getSheet_(SHEET.ASSIGNMENTS);
    const bSheet = getSheet_(SHEET.ASSESSMENT_BATCHES);
    const asSheet = getSheet_(SHEET.ASSESSMENTS);
    const qSheet = getSheet_(SHEET.QUESTIONS);
    const rSheet = getSheet_(SHEET.RESPONSES);

    const batchMap = {};
    bSheet.getDataRange().getValues().slice(1).forEach(r => { let o = mapRowToObject_(r, SHEET.ASSESSMENT_BATCHES); batchMap[o.BatchID] = o; });

    const assessMap = {};
    asSheet.getDataRange().getValues().slice(1).forEach(r => { let o = mapRowToObject_(r, SHEET.ASSESSMENTS); assessMap[o.AssessmentID] = o; });

    const questMap = {};
    qSheet.getDataRange().getValues().slice(1).forEach(r => { let o = mapRowToObject_(r, SHEET.QUESTIONS); questMap[o.QuestionID] = o; });

    const respMap = {};
    rSheet.getDataRange().getValues().slice(1).forEach(r => {
      let o = mapRowToObject_(r, SHEET.RESPONSES);
      if (!respMap[o.AssignmentID]) respMap[o.AssignmentID] = [];
      respMap[o.AssignmentID].push(o);
    });

    const aData = aSheet.getDataRange().getValues();
    const report = [];

    for (let i = 1; i < aData.length; i++) {
      let assign = mapRowToObject_(aData[i], SHEET.ASSIGNMENTS);
      let batch = batchMap[assign.BatchID] || {};
      let assess = assessMap[assign.AssessmentID] || {};
      let responses = respMap[assign.AssignmentID] || [];

      let totalQuestions = responses.length;
      let correctAnswers = 0;

      responses.forEach(resp => {
        let quest = questMap[resp.QuestionID];
        if (quest && quest.CorrectAnswer && resp.Answer === quest.CorrectAnswer) {
          correctAnswers++;
        }
      });

      let percentage = totalQuestions > 0 ? ((correctAnswers / totalQuestions) * 100).toFixed(0) : 0;
      let passScore = parseInt(assess.PassScore) || 0;
      let verdict = percentage >= passScore ? 'Pass' : 'Fail';
      if (assign.Status !== 'Completed') verdict = 'N/A';

      report.push({
        AssignmentID: assign.AssignmentID,
        CompanyName: batch.CompanyName || 'N/A',
        AssessmentTitle: assess.Title || 'N/A',
        CandidateEmail: assign.CandidateEmail || 'N/A',
        Status: assign.Status || 'N/A',
        TotalQuestions: totalQuestions,
        CorrectAnswers: correctAnswers,
        Percentage: percentage + '%',
        Verdict: verdict
      });
    }

    return { status: 'success', data: report };
  } catch (e) { return { status: 'error', message: e.message }; }
}

/**
 * FIXED: Accepts sessionToken as first argument, then assignmentId.
 */
function uiGetAssignmentDetails(sessionToken, assignmentId) {
  try {
    const admin = authenticateSystemUser_(sessionToken);
    requirePageAccess_(admin, 'review_results');
    
    if (!assignmentId) throw new Error('No Assignment ID provided.');

    const aSheet = getSheet_(SHEET.ASSIGNMENTS);
    const bSheet = getSheet_(SHEET.ASSESSMENT_BATCHES);
    const asSheet = getSheet_(SHEET.ASSESSMENTS);
    const qSheet = getSheet_(SHEET.QUESTIONS);
    const rSheet = getSheet_(SHEET.RESPONSES);

    const aData = aSheet.getDataRange().getValues();
    let assignment = null;
    for (let i = 1; i < aData.length; i++) {
      if (aData[i][getColIndex_(aSheet, 'AssignmentID') - 1] === assignmentId) {
        assignment = mapRowToObject_(aData[i], SHEET.ASSIGNMENTS); break;
      }
    }
    if (!assignment) throw new Error('Assignment not found.');

    const bData = bSheet.getDataRange().getValues();
    let batch = null;
    for (let i = 1; i < bData.length; i++) {
      if (bData[i][getColIndex_(bSheet, 'BatchID') - 1] === assignment.BatchID) {
        batch = mapRowToObject_(bData[i], SHEET.ASSESSMENT_BATCHES); break;
      }
    }

    const asData = asSheet.getDataRange().getValues();
    let assessment = null;
    for (let i = 1; i < asData.length; i++) {
      if (asData[i][getColIndex_(asSheet, 'AssessmentID') - 1] === assignment.AssessmentID) {
        assessment = mapRowToObject_(asData[i], SHEET.ASSESSMENTS); break;
      }
    }

    const qData = qSheet.getDataRange().getValues();
    let questions = [];
    for (let i = 1; i < qData.length; i++) {
      if (qData[i][getColIndex_(qSheet, 'AssessmentID') - 1] === assignment.AssessmentID) {
        let q = mapRowToObject_(qData[i], SHEET.QUESTIONS);
        try { q.OptionsArray = JSON.parse(q.OptionsJSON || '[]'); } catch(e) { q.OptionsArray = []; }
        questions.push(q);
      }
    }

    const rData = rSheet.getDataRange().getValues();
    let responses = [];
    for (let i = 1; i < rData.length; i++) {
      if (rData[i][getColIndex_(rSheet, 'AssignmentID') - 1] === assignmentId) {
        responses.push(mapRowToObject_(rData[i], SHEET.RESPONSES));
      }
    }

    let detailedAnswers = questions.map(q => {
      let resp = responses.find(r => r.QuestionID === q.QuestionID) || {};
      let hasCorrectAnswer = q.CorrectAnswer && String(q.CorrectAnswer).trim() !== '';
      return {
        QuestionText: q.QuestionText,
        QuestionType: q.QuestionType,
        OptionsArray: q.OptionsArray,
        CandidateAnswer: resp.Answer || 'No Answer',
        CorrectAnswer: hasCorrectAnswer ? q.CorrectAnswer : null,
        IsCorrect: hasCorrectAnswer ? (resp.Answer === q.CorrectAnswer) : null 
      };
    });

    return { 
      status: 'success', 
      details: {
        assignment: assignment,
        batch: batch,
        assessment: assessment,
        answers: detailedAnswers
      }
    };
  } catch (e) { return { status: 'error', message: e.message }; }
}


// #####################################################################################
// # 7. PERMISSIONS LOGIC                                                              #
// #####################################################################################

function uiGetSystemPages(sessionToken) {
  try {
    authenticateSystemUser_(sessionToken, 'Super Admin');
    return PAGES.filter(p => !p.public).map(p => ({ action: p.action, name: p.name }));
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiGetPermissions(sessionToken, position) {
  try {
    authenticateSystemUser_(sessionToken, 'Super Admin');
    const sheet = getSheet_(SHEET.USERS_PERMISSION);
    const data = sheet.getDataRange().getValues();
    const posCol = getColIndex_(sheet, 'Position') - 1;
    const pageCol = getColIndex_(sheet, 'PageName') - 1;
    const accessCol = getColIndex_(sheet, 'AccessType') - 1;
    let permissions = {};
    for (let i = 1; i < data.length; i++) { if (data[i][posCol] === position) permissions[data[i][pageCol]] = data[i][accessCol]; }
    return { status: 'success', data: permissions };
  } catch (e) { return { status: 'error', message: e.message }; }
}

function uiSavePermissions(sessionToken, position, permissionsObj) {
  try {
    const admin = authenticateSystemUser_(sessionToken, 'Super Admin');
    validateRequired_({ position: position }, ['position']);
    return withLock_(() => {
      const sheet = getSheet_(SHEET.USERS_PERMISSION);
      const data = sheet.getDataRange().getValues();
      const posIdx = getColIndex_(sheet, 'Position') - 1;
      for (let i = data.length - 1; i >= 1; i--) { if (data[i][posIdx] === position) sheet.deleteRow(i + 1); }
      Object.keys(permissionsObj).forEach(pageName => {
        writeRowByHeaders_(sheet, {
          PermissionID: generateShortId_(),
          Position: position, 
          PageName: pageName,
          AccessType: permissionsObj[pageName], 
          UserID: admin.UserID, 
          CreatedAt: nowDateTime_()
        });
      });
      logAudit_(admin.Email, 'Update Permissions', 'Updated permissions for position: ' + position);
      return { status: 'success', message: 'Permissions saved successfully! تم حفظ الصلاحيات بنجاح.' };
    });
  } catch (e) { return { status: 'error', message: e.message }; }
}

// #####################################################################################
// # 8. ROUTER (doGet / doPost)                                                        #
// #####################################################################################

function doGet(e) {
  try {
    const action = (e.parameter.action || 'login').trim();
    const scriptUrl = ScriptApp.getService().getUrl();

    if (action === 'takeTest') {
      const token = e.parameter.token;
      if (!token) return HtmlService.createHtmlOutput('Missing assessment token. الرابط غير مكتمل.');
      const tpl = HtmlService.createTemplateFromFile('CandidateTest');
      tpl.scriptUrl = scriptUrl;
      tpl.token = token;
      return tpl.evaluate().setTitle('Assessment Test').addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
    }

    const page = PAGES.find(p => p.action === action);
    if (!page) return HtmlService.createHtmlOutput('Invalid page. <a href="' + scriptUrl + '?action=dashboard">Back</a>');

    if (!page.template) {
      const tpl = HtmlService.createTemplateFromFile('ComingSoon');
      tpl.scriptUrl = scriptUrl; tpl.pageTitle = page.title;
      return tpl.evaluate().setTitle(page.title).addMetaTag('viewport', 'width=device-width, initial-scale=1')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
    }

    const tpl = HtmlService.createTemplateFromFile(page.template);
    tpl.scriptUrl = scriptUrl;
    return tpl.evaluate().setTitle(page.title).addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return HtmlService.createHtmlOutput('Page failed to load.');
  }
}

const ACTIONS = {
  addUser: (payload, sessionToken) => uiAddUser(sessionToken, payload),
  savePermissions: (payload, sessionToken) => uiSavePermissions(sessionToken, payload.position, payload.permissions),
  saveAssessment: (payload, sessionToken) => uiSaveAssessment(sessionToken, payload.assessment, payload.questions),
  submitTest: (payload) => uiSubmitTest(payload)
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload;
    const sessionToken = body.sessionToken;
    const handler = ACTIONS[action];
    if (!handler) throw new Error('Invalid action.');
    const result = handler(payload, sessionToken);
    return jsonResponse_(result);
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse_({ status: 'error', message: 'Request failed.' });
  }
}

// #####################################################################################
// # 9. UTILITY FUNCTIONS                                                              #
// #####################################################################################

function nowDateTime_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function jsonResponse_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

function logAudit_(actorEmail, action, details) {
  try {
    const sheet = getSheet_(SHEET.AUDIT);
    writeRowByHeaders_(sheet, { Timestamp: new Date(), ActorEmail: actorEmail, Action: action, Details: details });
  } catch (e) { Logger.log('Failed to log audit: ' + e.message); }
}

function include(filename) { return HtmlService.createHtmlOutputFromFile(filename).getContent(); }