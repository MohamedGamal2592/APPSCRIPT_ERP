/**
 * Company_Assessment_Actions.js
 * RESPONSIBILITY: مركز التقييم (Assessment Center) business logic, IIFE-namespaced
 * to AssessmentCenter. Mirrors the Top Light / Top Chemical / Valley Foods
 * structure for the AUTHENTICATED surface (an internal `actions` map driven by
 * register(), a PAGE_ACCESS table feeding guard_(), pageForAction_/tableForAction_
 * for SystemLog enrichment) and adds a SEPARATE, smaller surface for the
 * UNAUTHENTICATED candidate surface (PUBLIC_ACTIONS + publicDispatch_), reached
 * only through Code.js's `company_public_action` route (T-2).
 *
 * T-3/T-4: every write goes through the company-local acInsert_ / acInsertMany_ /
 * acUpdate_ helpers (Phase 2.2) — never addRecord_, getNextId_ or
 * saveRecordWithAudit_ against this spreadsheet. ac4_write_contract.js greps this
 * file for those three names and fails the suite if any appears.
 */

const AssessmentCenter = (function () {
  const actions = {};
  function register(name, fn) { actions[name] = fn; }

  // A separate object, deliberately never merged with `actions` (D-14/T-2).
  // publicDispatch_ looks up only this map.
  const PUBLIC_ACTIONS = {};
  function publicRegister(name, fn) { PUBLIC_ACTIONS[name] = fn; }

  const COMPANY_UID = '32fafd256ccb7a1c';

  // §2.2 — the eight live tabs of the assessment spreadsheet (standalone schema).
  const ASSESSMENTS_SHEET = 'Assessments';
  const QUESTIONS_SHEET = 'Questions';
  const BATCHES_SHEET = 'AssessmentBatches';
  const ASSIGNMENTS_SHEET = 'Assignments';
  const RESPONSES_SHEET = 'Responses';
  const AUDIT_SHEET = 'AuditLog';
  // Users / UsersPermission are dormant after the merge (§4) — not referenced here.

  // §6.2 — authenticated action catalog. Verb chosen so the router's inference
  // (R-20/T-6) and this guard agree: get_* read, add_* write (incl. grading),
  // toggle_*/update_* full. Never save_*/edit_*/delete_*/remove_* (D-13).
  const PAGE_ACCESS = {
    'get_ac_dashboard': { page: 'ac_dashboard', access: 'read' },
    'prefetch_refs': { page: 'ac_dashboard', access: 'read' },

    'get_ac_assessments': { page: 'ac_assessments', access: 'read' },
    'get_ac_assessment': { page: 'ac_assessments', access: 'read' },
    'add_ac_assessment': { page: 'ac_assessments', access: 'write' },
    'add_ac_assessment_copy': { page: 'ac_assessments', access: 'write' },
    'toggle_ac_assessment_active': { page: 'ac_assessments', access: 'full' },

    'get_ac_batches': { page: 'ac_batches', access: 'read' },
    'get_ac_batch': { page: 'ac_batches', access: 'read' },
    'add_ac_batch': { page: 'ac_batches', access: 'write' },
    'add_ac_batch_invites': { page: 'ac_batches', access: 'write' },
    'toggle_ac_batch_active': { page: 'ac_batches', access: 'full' },
    'update_ac_batch_expiry': { page: 'ac_batches', access: 'full' },

    'get_ac_results': { page: 'ac_results', access: 'read' },
    'get_ac_result': { page: 'ac_results', access: 'read' },
    'add_ac_candidate_grade': { page: 'ac_results', access: 'write' }
  };

  // Sheet/table touched by a module_action, for SystemLog.Table — also carries
  // the three PUBLIC action names (§5.6: staff writes AND candidate writes both
  // want a Table column in SystemLog), even though they have no PAGE_ACCESS
  // entry (they are not page-gated; see pageForAction_ below).
  const ACTION_TABLES = {
    'get_ac_assessments': ASSESSMENTS_SHEET,
    'get_ac_assessment': ASSESSMENTS_SHEET,
    'add_ac_assessment': ASSESSMENTS_SHEET,
    'add_ac_assessment_copy': ASSESSMENTS_SHEET,
    'toggle_ac_assessment_active': ASSESSMENTS_SHEET,

    'get_ac_batches': BATCHES_SHEET,
    'get_ac_batch': BATCHES_SHEET,
    'add_ac_batch': BATCHES_SHEET,
    'add_ac_batch_invites': ASSIGNMENTS_SHEET,
    'toggle_ac_batch_active': BATCHES_SHEET,
    'update_ac_batch_expiry': BATCHES_SHEET,

    'get_ac_results': ASSIGNMENTS_SHEET,
    'get_ac_result': ASSIGNMENTS_SHEET,
    'add_ac_candidate_grade': RESPONSES_SHEET,

    'prefetch_refs': ASSESSMENTS_SHEET,

    // Public actions — logged (ADD-classified writes), never page-gated.
    'get_ac_candidate_assessment': ASSESSMENTS_SHEET,
    'add_ac_candidate_attempt': ASSIGNMENTS_SHEET,
    'add_ac_candidate_submission': RESPONSES_SHEET
  };

  /** page for a module_action, reused for both access-control and logging. */
  function pageForAction_(action) {
    const req = PAGE_ACCESS[action];
    return req ? req.page : '';
  }

  /** Sheet/table touched by a module_action, for SystemLog Table column. */
  function tableForAction_(action) {
    return ACTION_TABLES[action] || '';
  }

  function guard_(user, action) {
    if (!user || user.isSuperAdmin) return;
    const req = PAGE_ACCESS[action];
    if (!req) return;
    if (!unifiedCheck_(user, COMPANY_UID, req.page, req.access)) {
      throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
    }
  }

  function dispatch_(payload, user, dbId) {
    const action = payload.module_action;
    if (!actions[action]) throw new Error('Unknown Assessment Center action: ' + action);
    guard_(user, action);
    return actions[action](payload.data, user, dbId);
  }

  // ── T-2/T-9 — the public surface ──────────────────────────────────────────
  // A batch token is two UUIDs (72 hex+dash chars) — acToken_() below. Anything
  // else is rejected before a single sheet is touched (§5.6).
  function acValidToken_(token) {
    return typeof token === 'string' && /^[0-9a-fA-F-]{72}$/.test(token);
  }

  // D-7 — 300 requests/min per token+action, after checkLoginThrottle_'s
  // CacheService-counter shape in the standalone / 03_Security.js. Fails OPEN on
  // a CacheService hiccup: a candidate must never be blocked by an infra fault,
  // only by actually exceeding the limit.
  function acRateLimit_(token, action) {
    try {
      const cache = CacheService.getScriptCache();
      const key = 'ac_rl_' + action + '_' + token;
      const count = parseInt(cache.get(key), 10) || 0;
      if (count >= 300) throw new Error('عدد الطلبات كبير، حاول بعد قليل');
      cache.put(key, String(count + 1), 60);
    } catch (e) {
      if (e && /عدد الطلبات/.test(e.message)) throw e;
    }
  }

  /**
   * The public dispatcher (D-14). Looks up ONLY PUBLIC_ACTIONS — never `actions`
   * — so an authenticated-surface action can never be reached without a session,
   * and vice versa (asserted by ac1_wiring.js: the two maps share no key).
   */
  function publicDispatch_(payload, dbId) {
    const action = payload && payload.module_action;
    const fn = PUBLIC_ACTIONS[action];
    if (typeof fn !== 'function') throw new Error('Unknown public action: ' + action);
    const data = (payload && payload.data) || {};
    const token = String(data.token || '');
    if (!acValidToken_(token)) throw new Error('رابط التقييم غير صالح.');
    acRateLimit_(token, action);
    return fn(data, dbId);
  }

  // ── §6.4 generic data helpers ──────────────────────────────────────────────
  function acRows_(dbId, sheet) { return getAllRecords_(dbId, sheet); }
  function acByPk_(dbId, sheet, pk) { return getRecordsByPk_(dbId, sheet, pk); }

  function acUid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
  function acToken_() { return Utilities.getUuid() + Utilities.getUuid(); }

  function acJson_(v, fallback) {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }

  // §5.6/T-7 — Date and boolean shapes: readers must accept both the standalone's
  // plain 'yyyy-MM-dd HH:mm:ss' strings (script-timezone local) AND real Date
  // cells Sheets may hand back, plus a stray ISO string.
  function acDate_(v) {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    }
    const d2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (d2) return new Date(Number(d2[1]), Number(d2[2]) - 1, Number(d2[3]));
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Writes in the standalone's own string shape so a row written by either app
  // looks alike to a human reading the sheet (§5.6).
  function acStamp_() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  }

  function acBool_(v) {
    if (v === true) return true;
    if (v === false || v === undefined || v === null || v === '') return false;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1';
  }

  // ── Dashboard (Phase 1.2 — the only two handlers this step ships) ─────────
  function getAcDashboard_(data, user, dbId) {
    const assessments = acRows_(dbId, ASSESSMENTS_SHEET);
    const batches = acRows_(dbId, BATCHES_SHEET);
    const assignments = acRows_(dbId, ASSIGNMENTS_SHEET);
    const now = new Date();

    const activeAssessments = assessments.filter(function (a) { return acBool_(a.IsActive); }).length;
    const openBatches = batches.filter(function (b) {
      if (!acBool_(b.IsActive)) return false;
      const exp = acDate_(b.ExpiresAt);
      return !exp || exp >= now;
    }).length;
    const inProgress = assignments.filter(function (a) { return a.Status === 'In Progress'; }).length;
    // "Pending review" = submitted but not yet marked Reviewed by a grader
    // (Phase 6 sets Status -> 'Reviewed' once nothing is left ungraded).
    const pendingReview = assignments.filter(function (a) { return a.Status === 'Completed'; }).length;

    return {
      status: 'success',
      kpi: {
        activeAssessments: activeAssessments,
        openBatches: openBatches,
        inProgress: inProgress,
        pendingReview: pendingReview
      }
    };
  }
  register('get_ac_dashboard', getAcDashboard_);

  // No sheet-backed reference data of our own worth warming cross-request (the
  // category/question-type vocabularies are static string lists, not sheet
  // rows) — a good-citizen no-op so schedulePrefetch()'s companyCall never
  // surfaces a console error on this company's pages.
  function prefetchRefs_(data, user, dbId) {
    return { status: 'success' };
  }
  register('prefetch_refs', prefetchRefs_);

  return {
    dispatch_: dispatch_,
    publicDispatch_: publicDispatch_,
    pageForAction_: pageForAction_,
    tableForAction_: tableForAction_,
    register: register,
    publicRegister: publicRegister
  };
})();
