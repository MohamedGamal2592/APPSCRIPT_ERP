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

  // D-8 — the five category values; other values still list (raw value shown).
  const CATEGORY_LABELS_AR = { Technical: 'فني', Psychometric: 'نفسي', Situational: 'مواقف', Language: 'لغة', Competency: 'كفاءة' };
  function acCategoryLabel_(v) { return CATEGORY_LABELS_AR[v] || String(v === undefined || v === null ? '' : v); }

  const QUESTION_TYPES = ['MCQ', 'Likert', 'MostLeast', 'OpenText'];

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
    'add_ac_candidate_grade': { page: 'ac_results', access: 'write' },
    // Phase 8/B-2 — gated at runtime on the columns actually existing
    // (acHasColumns_); the access LEVEL is fixed regardless.
    'add_ac_review_decision': { page: 'ac_results', access: 'write' }
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
    'add_ac_review_decision': ASSIGNMENTS_SHEET,

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

  /* ── [RT-6] The change watch, ported from ValleyFoods ───────────────────
   *
   * page -> the tables its actions touch, DERIVED by joining the two maps this
   * file already has. There is no new configuration to keep in step: a page's
   * watch set is exactly the set of tables its own actions declare, so a new
   * action that names a table joins the watch automatically and one that does
   * not is visibly absent.
   */
  const PAGE_TABLES = (function () {
    const byPage = {};
    Object.keys(PAGE_ACCESS).forEach(function (action) {
      const page = PAGE_ACCESS[action].page;
      const table = ACTION_TABLES[action];
      if (!page || !table) return;
      if (!byPage[page]) byPage[page] = {};
      byPage[page][table] = true;
    });
    const out = {};
    Object.keys(byPage).forEach(function (p) { out[p] = Object.keys(byPage[p]); });
    return out;
  })();

  /**
   * "Has anything this page cares about changed since I last looked?"
   *
   * This is the ONLY thing a client is allowed to poll, because it is the only
   * thing cheap enough to poll: ONE CacheService.getAll over the page's tables.
   * It reads no spreadsheet, takes no lock and returns no business data — only
   * opaque timestamps — so a device that is merely watching costs a fraction of
   * a device that is loading.
   *
   * Gated EXPLICITLY rather than through PAGE_ACCESS, and this is the important
   * part: one action serves every page, so guard_ would only ever check the
   * grant for get_page_versions itself. The page being ASKED ABOUT is what has
   * to be checked, and it is checked here against the caller's real read grant.
   * An optimisation that is also a way around an access check is not an
   * optimisation.
   */
  function getPageVersions_(data, user, dbId) {
    const page = String((data && data.page) || '').trim();
    if (!page) throw new Error('الصفحة مطلوبة');
    if (!(user && user.isSuperAdmin)) {
      if (!unifiedCheck_(user, COMPANY_UID, page, 'read')) {
        throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
      }
    }
    const tables = PAGE_TABLES[page] || [];
    return {
      status: 'success',
      page: page,
      tables: tables,
      versions: readTableVersions_(dbId, tables),
      /* The server's own clock, so a client can tell a stalled poll from a
         quiet system without trusting the device clock. */
      now: String(new Date().getTime())
    };
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

  /**
   * Phase 8/D-2 — detect Tier B columns at runtime, NEVER by assumption.
   * Returns { ColumnName: true|false } for each name asked about.
   */
  function acHasColumns_(dbId, sheet, columnNames) {
    const headers = getHeaders_(getSheet_(sheet, dbId)).map(function (h) { return String(h).trim().toLowerCase(); });
    const present = {};
    columnNames.forEach(function (c) { present[c] = headers.indexOf(String(c).toLowerCase()) !== -1; });
    return present;
  }
  function acAllColumnsPresent_(presence) {
    return Object.keys(presence).every(function (k) { return presence[k]; });
  }

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

  // ── §5.1/D-18 — OptionsJSON parser ─────────────────────────────────────────
  // Accepts a JSON array of plain strings (legacy/MCQ) OR of {text, trait}
  // objects (MostLeast / Likert-with-trait, D-18) and always normalises to
  // {text, trait} so every reader (candidate projection, scoring, authoring
  // form) has one shape to work with. A string option gets trait: ''.
  function acParseOptions_(rawOptionsJson) {
    const arr = acJson_(rawOptionsJson, []);
    if (!Array.isArray(arr)) return [];
    return arr.map(function (o) {
      if (o && typeof o === 'object') {
        return { text: String(o.text === undefined || o.text === null ? '' : o.text), trait: String(o.trait === undefined || o.trait === null ? '' : o.trait) };
      }
      return { text: String(o === undefined || o === null ? '' : o), trait: '' };
    });
  }

  // ── §5.6/G-09 — the candidate projection ───────────────────────────────────
  // Strips CorrectAnswer, Weight, Trait, UserID, CreatedAt from every question,
  // and the per-statement `trait` from every option — the candidate must never
  // see the answer key, the scoring weights or any trait label.
  function acPublicAssessment_(assessment, questions) {
    const safeAssessment = {
      AssessmentID: assessment.AssessmentID,
      Title: assessment.Title,
      Category: assessment.Category,
      Description: assessment.Description,
      TimeLimitMinutes: assessment.TimeLimitMinutes
    };
    const safeQuestions = (questions || []).slice().sort(function (a, b) {
      return (parseInt(a.OrderIndex, 10) || 0) - (parseInt(b.OrderIndex, 10) || 0);
    }).map(function (q) {
      const opts = acParseOptions_(q.OptionsJSON).map(function (o) { return { text: o.text }; });
      return {
        QuestionID: q.QuestionID,
        OrderIndex: q.OrderIndex,
        QuestionText: q.QuestionText,
        QuestionType: q.QuestionType,
        Options: opts
      };
    });
    return { assessment: safeAssessment, questions: safeQuestions };
  }

  /**
   * §5.4 — the scoring engine. A PURE function: no sheet I/O, no lock, no
   * Date.now(). Given the same four arguments it always returns the same
   * result, which is what lets the submission handler, the results list and
   * the result view (Phase 6) all call the very same code, and what makes it
   * testable under node with fixtures alone (ac2_scoring.js).
   *
   * `events` (from the sheet's AuditLog rows for this assignment, or the raw
   * candidate-submitted event batch) is summarised but never affects the
   * score — only الأحداث-tab / late-flag display reads it.
   */
  function acScore_(assessment, questions, responses, events) {
    const respByQ = {};
    (responses || []).forEach(function (r) { respByQ[r.QuestionID] = r; });

    const traits = {}; // trait -> { raw, max }
    function bumpTrait(trait, raw, tmax) {
      if (!trait) return;
      if (!traits[trait]) traits[trait] = { raw: 0, max: 0 };
      traits[trait].raw += raw;
      traits[trait].max += tmax;
    }

    let score = 0, max = 0, anyGradable = false, anyPending = false;
    const items = [];

    (questions || []).forEach(function (q) {
      const resp = respByQ[q.QuestionID] || null;
      const weight = Number(q.Weight) || 0;
      const type = q.QuestionType;
      const answer = resp ? resp.Answer : '';
      let itemScore = null, itemMax = null, counts = false, pending = false;

      if (type === 'MCQ') {
        counts = true; anyGradable = true;
        const norm = function (v) { return String(v === undefined || v === null ? '' : v).trim().toLowerCase(); };
        const hasScore = resp && resp.Score !== undefined && resp.Score !== null && String(resp.Score).trim() !== '';
        // Legacy blank Score (standalone never wrote one) is re-derived here,
        // on read, and never written back.
        const s = hasScore ? (Number(resp.Score) || 0)
          : ((q.CorrectAnswer && norm(answer) === norm(q.CorrectAnswer)) ? weight : 0);
        itemScore = s; itemMax = weight;
        score += s; max += weight;
      } else if (type === 'Likert') {
        const v = Number(answer) || 0;
        bumpTrait(q.Trait, v * weight, weight * 5);
      } else if (type === 'MostLeast') {
        const parsed = acJson_(answer, null);
        const opts = acParseOptions_(q.OptionsJSON);
        const traitFor = function (text) {
          const hit = opts.filter(function (o) { return o.text === text; })[0];
          return (hit && hit.trait) || q.Trait || '';
        };
        if (parsed && parsed.most) bumpTrait(traitFor(parsed.most), weight, weight);
        if (parsed && parsed.least) bumpTrait(traitFor(parsed.least), -weight, weight);
      } else if (type === 'OpenText') {
        counts = true; anyGradable = true;
        const hasScore = resp && resp.Score !== undefined && resp.Score !== null && String(resp.Score).trim() !== '';
        if (hasScore) {
          const s = Math.max(0, Math.min(weight, Number(resp.Score) || 0));
          itemScore = s; itemMax = weight;
          score += s; max += weight;
        } else {
          pending = true; anyPending = true;
        }
      }

      items.push({
        QuestionID: q.QuestionID, QuestionType: type, Answer: answer,
        Score: itemScore, Max: itemMax, Counts: counts, Pending: pending
      });
    });

    const traitProfile = {};
    Object.keys(traits).forEach(function (t) {
      const raw = traits[t].raw, tmax = traits[t].max;
      traitProfile[t] = { raw: raw, max: tmax, pct: tmax ? Math.round((raw / tmax) * 1000) / 10 : 0 };
    });

    let verdict;
    if (!anyGradable) verdict = 'N/A';
    else if (anyPending) verdict = 'Pending';
    else {
      const passScore = Number(assessment.PassScore) || 0;
      // Cross-multiplied rather than (score/max)*100 >= passScore, so a
      // candidate landing on EXACTLY PassScore is never lost to a rounding
      // artifact from floating-point division (weights may be halves, D-11).
      verdict = (max > 0 && (score * 100 + 1e-9) >= (passScore * max)) ? 'Pass' : 'Fail';
    }

    const ev = events || [];
    const lateEvent = ev.filter(function (e) { return e && e.type === 'LATE_SUBMISSION'; })[0];
    const tabSwitchCount = ev.filter(function (e) { return e && e.type === 'TAB_SWITCH'; }).length;

    return {
      score: score, max: max, verdict: verdict,
      traits: traitProfile, items: items,
      events: { lateSubmission: !!lateEvent, tabSwitches: tabSwitchCount }
    };
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
  /* One action for every page in this company. It does NOT go through
     PAGE_ACCESS, because one entry could only describe one page; it gates
     itself on the page it is asked about (see getPageVersions_). */
  register('get_page_versions', getPageVersions_);

  // ── §5.1/Phase 3 — authoring ────────────────────────────────────────────────
  // R-9/G-05: the standalone never let an assessment be edited after creation.
  // The action catalog (§6.2) keeps that — there is no update_ac_assessment /
  // edit_ac_assessment verb anywhere, by design (D-13 forbids inventing one).
  // "نسخة جديدة" (add_ac_assessment_copy) is the ONLY path to a changed
  // assessment, and it always creates a new row — this is what keeps a past
  // candidate's score meaningful forever, not a conditional on attempt count.
  // (The plan's Phase 3.1 line reads as though editing were allowed until the
  // first attempt; no such verb exists to call, so ac_assessment_form always
  // opens an existing assessment read-only — recorded as a plan correction.)

  function getAcAssessments_(data, user, dbId) {
    const assessments = acRows_(dbId, ASSESSMENTS_SHEET);
    const qCount = {};
    acRows_(dbId, QUESTIONS_SHEET).forEach(function (q) { qCount[q.AssessmentID] = (qCount[q.AssessmentID] || 0) + 1; });
    const attemptCount = {};
    acRows_(dbId, ASSIGNMENTS_SHEET).forEach(function (a) { attemptCount[a.AssessmentID] = (attemptCount[a.AssessmentID] || 0) + 1; });
    const rows = assessments.map(function (a) {
      return {
        AssessmentID: a.AssessmentID, Title: a.Title, Category: a.Category,
        CategoryLabel: acCategoryLabel_(a.Category),
        TimeLimitMinutes: a.TimeLimitMinutes, PassScore: a.PassScore, IsActive: acBool_(a.IsActive),
        QuestionCount: qCount[a.AssessmentID] || 0, AttemptCount: attemptCount[a.AssessmentID] || 0,
        CreatedAt: a.CreatedAt
      };
    });
    return { status: 'success', rows: rows };
  }
  register('get_ac_assessments', getAcAssessments_);

  function getAcAssessment_(data, user, dbId) {
    const id = String((data && data.id) || '').trim();
    if (!id) throw new Error('AssessmentID مطلوب.');
    const assessment = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === id; })[0];
    if (!assessment) throw new Error('التقييم غير موجود.');
    const questions = acRows_(dbId, QUESTIONS_SHEET)
      .filter(function (q) { return q.AssessmentID === id; })
      .sort(function (x, y) { return (parseInt(x.OrderIndex, 10) || 0) - (parseInt(y.OrderIndex, 10) || 0); })
      .map(function (q) { return Object.assign({}, q, { Options: acParseOptions_(q.OptionsJSON) }); });
    const attempts = acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) { return a.AssessmentID === id; }).length;
    return {
      status: 'success',
      assessment: Object.assign({}, assessment, { IsActive: acBool_(assessment.IsActive) }),
      questions: questions,
      attempts: attempts
    };
  }
  register('get_ac_assessment', getAcAssessment_);

  // D-18 — the AUTHORING form tracks every question's options as {text,trait}
  // client-side (one editor UI for all types), but only MostLeast genuinely
  // uses the per-option trait (MCQ/Likert's "trait" is a question-level field,
  // never per-option — see acScore_). Normalising here, server-side, means
  // the wire/sheet shape is right regardless of what the client happens to
  // send: plain strings for MCQ/Likert, {text,trait} objects for MostLeast.
  function acOptionsForWire_(questionType, options) {
    const list = Array.isArray(options) ? options : [];
    if (questionType === 'MostLeast') {
      return list.map(function (o) {
        return { text: String((o && o.text !== undefined) ? o.text : (o || '')), trait: String((o && o.trait) || '') };
      });
    }
    return list.map(function (o) { return String((o && typeof o === 'object' && o.text !== undefined) ? o.text : (o === undefined || o === null ? '' : o)); });
  }

  function acValidateQuestions_(questionsIn) {
    questionsIn.forEach(function (q, i) {
      if (!String(q.QuestionText || '').trim()) throw new Error('نص السؤال رقم ' + (i + 1) + ' مطلوب.');
      if (QUESTION_TYPES.indexOf(q.QuestionType) === -1) throw new Error('نوع السؤال رقم ' + (i + 1) + ' غير صالح.');
    });
  }

  function addAcAssessment_(data, user, dbId) {
    const d = data || {};
    const title = String(d.Title || '').trim();
    const category = String(d.Category || '').trim();
    const timeLimit = Number(d.TimeLimitMinutes);
    if (!title) throw new Error('العنوان مطلوب.');
    if (!category) throw new Error('الفئة مطلوبة.');
    if (!timeLimit || timeLimit <= 0) throw new Error('مدة التقييم يجب أن تكون أكبر من صفر.');
    const passScore = Math.max(0, Math.min(100, Number(d.PassScore) || 0));
    const questionsIn = Array.isArray(d.questions) ? d.questions : [];
    acValidateQuestions_(questionsIn);

    const userEmail = (user && user.email) || '';
    const id = acUid_();
    const now = acStamp_();
    const header = {
      AssessmentID: id, Title: title, Category: category,
      Description: String(d.Description || ''), TimeLimitMinutes: timeLimit,
      PassScore: passScore, IsActive: acBool_(d.IsActive), UserID: userEmail,
      CreatedAt: now, UpdatedAt: now
    };

    return executeWithLock_(function () {
      acInsert_(dbId, ASSESSMENTS_SHEET, header, userEmail, 'AssessmentID');
      const qRows = questionsIn.map(function (q, i) {
        return {
          QuestionID: acUid_(), AssessmentID: id, OrderIndex: i + 1,
          QuestionText: String(q.QuestionText || ''), QuestionType: q.QuestionType,
          OptionsJSON: JSON.stringify(acOptionsForWire_(q.QuestionType, q.Options)),
          CorrectAnswer: String(q.CorrectAnswer || ''), Weight: Number(q.Weight) || 1,
          Trait: String(q.Trait || ''), UserID: userEmail, CreatedAt: now
        };
      });
      if (qRows.length) acInsertMany_(dbId, QUESTIONS_SHEET, qRows, userEmail, 'QuestionID');
      return { status: 'success', data: { assignedId: id }, message: 'تم إنشاء التقييم بنجاح.' };
    });
  }
  register('add_ac_assessment', addAcAssessment_);

  function addAcAssessmentCopy_(data, user, dbId) {
    const srcId = String((data && data.id) || '').trim();
    if (!srcId) throw new Error('AssessmentID مطلوب.');
    const src = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === srcId; })[0];
    if (!src) throw new Error('التقييم غير موجود.');
    const srcQuestions = acRows_(dbId, QUESTIONS_SHEET).filter(function (q) { return q.AssessmentID === srcId; });

    const userEmail = (user && user.email) || '';
    const id = acUid_();
    const now = acStamp_();
    const header = {
      AssessmentID: id, Title: String(src.Title || '') + ' (v2)', Category: src.Category,
      Description: src.Description, TimeLimitMinutes: src.TimeLimitMinutes, PassScore: src.PassScore,
      // A duplicate starts INACTIVE: the owner reviews/activates it deliberately
      // rather than a "نسخة جديدة" click immediately going live for candidates.
      IsActive: false, UserID: userEmail, CreatedAt: now, UpdatedAt: now
    };

    return executeWithLock_(function () {
      acInsert_(dbId, ASSESSMENTS_SHEET, header, userEmail, 'AssessmentID');
      const qRows = srcQuestions.map(function (q) {
        return {
          QuestionID: acUid_(), AssessmentID: id, OrderIndex: q.OrderIndex, QuestionText: q.QuestionText,
          QuestionType: q.QuestionType, OptionsJSON: q.OptionsJSON, CorrectAnswer: q.CorrectAnswer,
          Weight: q.Weight, Trait: q.Trait, UserID: userEmail, CreatedAt: now
        };
      });
      if (qRows.length) acInsertMany_(dbId, QUESTIONS_SHEET, qRows, userEmail, 'QuestionID');
      return { status: 'success', data: { assignedId: id }, message: 'تم إنشاء نسخة جديدة.' };
    });
  }
  register('add_ac_assessment_copy', addAcAssessmentCopy_);

  function toggleAcAssessmentActive_(data, user, dbId) {
    const id = String((data && data.id) || '').trim();
    if (!id) throw new Error('AssessmentID مطلوب.');
    const current = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === id; })[0];
    if (!current) throw new Error('التقييم غير موجود.');
    const next = !acBool_(current.IsActive);
    const res = acUpdate_(dbId, ASSESSMENTS_SHEET, 'AssessmentID', id, { IsActive: next, UpdatedAt: acStamp_() }, (user && user.email) || '');
    return { status: 'success', data: res.data, message: next ? 'تم تفعيل التقييم.' : 'تم إيقاف التقييم.' };
  }
  register('toggle_ac_assessment_active', toggleAcAssessmentActive_);

  // ── §5.2/Phase 4 — distribution (batches) ──────────────────────────────────
  const BATCH_EXPIRY_DEFAULT_DAYS = 10;
  const BATCH_EXPIRY_MAX_DAYS = 90; // D-9
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Computed on read (never stored) so the list always shows the ERP link,
  // even for a batch the standalone created (§5.2).
  function acCandidateLink_(token) {
    return ScriptApp.getService().getUrl() + '?action=ac_take&token=' + token;
  }

  function getAcBatches_(data, user, dbId) {
    const assessMap = {};
    acRows_(dbId, ASSESSMENTS_SHEET).forEach(function (a) { assessMap[a.AssessmentID] = a; });
    const assignments = acRows_(dbId, ASSIGNMENTS_SHEET);
        const invitedBatchIds = ERPReadAlgorithms_.invitedBatchMembership(assignments);
    const rows = acRows_(dbId, BATCHES_SHEET).map(function (b) {
      const assessment = assessMap[b.AssessmentID];
      // Denormalised AssessmentTitle back-filled on read for a blank/'N/A'
      // value (G-13) — kept, exactly as the standalone already did.
      const title = (b.AssessmentTitle && b.AssessmentTitle !== 'N/A') ? b.AssessmentTitle : ((assessment && assessment.Title) || 'N/A');
      const hasInvites = invitedBatchIds.has(b.BatchID);
      return {
        BatchID: b.BatchID, Token: b.Token, CompanyName: b.CompanyName,
        AssessmentID: b.AssessmentID, AssessmentTitle: title,
        MaxCandidates: Number(b.MaxCandidates) || 0, UsedSlots: Number(b.UsedSlots) || 0,
        IsActive: acBool_(b.IsActive), CreatedAt: b.CreatedAt, ExpiresAt: b.ExpiresAt,
        Link: acCandidateLink_(b.Token), HasInvites: hasInvites
      };
    });
    return { status: 'success', rows: rows };
  }
  register('get_ac_batches', getAcBatches_);

  function getAcBatch_(data, user, dbId) {
    const id = String((data && data.id) || '').trim();
    if (!id) throw new Error('BatchID مطلوب.');
    const batch = acRows_(dbId, BATCHES_SHEET).filter(function (b) { return b.BatchID === id; })[0];
    if (!batch) throw new Error('الدفعة غير موجودة.');
    const assignments = acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) { return a.BatchID === id; });
    return {
      status: 'success',
      batch: Object.assign({}, batch, { IsActive: acBool_(batch.IsActive), Link: acCandidateLink_(batch.Token) }),
      assignments: assignments
    };
  }
  register('get_ac_batch', getAcBatch_);

  function addAcBatch_(data, user, dbId) {
    const d = data || {};
    const companyName = String(d.CompanyName || '').trim();
    const assessmentId = String(d.AssessmentID || '').trim();
    const maxCandidates = parseInt(d.MaxCandidates, 10);
    if (!companyName) throw new Error('اسم الجهة مطلوب.');
    if (!assessmentId) throw new Error('التقييم مطلوب.');
    if (!maxCandidates || maxCandidates <= 0) throw new Error('عدد المقاعد يجب أن يكون أكبر من صفر.');
    const assessment = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === assessmentId; })[0];
    if (!assessment) throw new Error('التقييم غير موجود.');
    if (!acBool_(assessment.IsActive)) throw new Error('لا يمكن إنشاء دفعة على تقييم غير نشط.');

    // Default 10, min 1, max 90 — enforced server-side regardless of what the
    // client sends (D-9).
    let expiryDays = parseInt(d.ExpiryDays, 10);
    if (!expiryDays || expiryDays < 1) expiryDays = BATCH_EXPIRY_DEFAULT_DAYS;
    if (expiryDays > BATCH_EXPIRY_MAX_DAYS) expiryDays = BATCH_EXPIRY_MAX_DAYS;

    const userEmail = (user && user.email) || '';
    const id = acUid_();
    const token = acToken_();
    const now = new Date();
    const expires = new Date(now.getTime() + expiryDays * 86400000);
    const header = {
      BatchID: id, Token: token, CompanyName: companyName, AssessmentID: assessmentId,
      AssessmentTitle: assessment.Title, MaxCandidates: maxCandidates, UsedSlots: 0,
      AssignedBy: userEmail, CreatedAt: acStamp_(),
      ExpiresAt: Utilities.formatDate(expires, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      IsActive: true
    };
    const res = acInsert_(dbId, BATCHES_SHEET, header, userEmail, 'BatchID');
    return { status: 'success', data: res.data, message: 'تم إنشاء الدفعة بنجاح.', link: acCandidateLink_(token) };
  }
  register('add_ac_batch', addAcBatch_);

  // Invited rows are plain Assignments rows with Status='Invited' — no column
  // added, a new value in an existing one (§5.2). The rule this enables (only
  // an invited email may start) lives in Phase 5's add_ac_candidate_attempt_.
  function addAcBatchInvites_(data, user, dbId) {
    const d = data || {};
    const batchId = String(d.id || d.BatchID || '').trim();
    if (!batchId) throw new Error('BatchID مطلوب.');
    const batch = acRows_(dbId, BATCHES_SHEET).filter(function (b) { return b.BatchID === batchId; })[0];
    if (!batch) throw new Error('الدفعة غير موجودة.');

    const rawEmails = Array.isArray(d.emails) ? d.emails : String(d.emails || '').split(/[\n,]/);
    const seen = {}; const clean = []; const invalid = [];
    rawEmails.forEach(function (e) {
      const v = String(e || '').trim().toLowerCase();
      if (!v) return;
      if (!EMAIL_RE.test(v)) { invalid.push(v); return; }
      if (seen[v]) return; // dedupe within the submitted list
      seen[v] = true; clean.push(v);
    });
    if (invalid.length) throw new Error('بريد إلكتروني غير صالح: ' + invalid.join(', '));
    if (!clean.length) throw new Error('لا توجد عناوين بريد صالحة.');

    // Dedupe against emails already invited/assigned in this batch.
    const existingEmails = {};
    acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) { return a.BatchID === batchId; })
      .forEach(function (a) { existingEmails[String(a.CandidateEmail || '').trim().toLowerCase()] = true; });
    const toInsert = clean.filter(function (e) { return !existingEmails[e]; });

    const userEmail = (user && user.email) || '';
    const now = acStamp_();
    const rows = toInsert.map(function (email) {
      return {
        AssignmentID: acUid_(), BatchID: batchId, Token: batch.Token, CandidateEmail: email,
        AssessmentID: batch.AssessmentID, Status: 'Invited', StartedAt: '', CompletedAt: '', CreatedAt: now
      };
    });
    if (rows.length) acInsertMany_(dbId, ASSIGNMENTS_SHEET, rows, userEmail, 'AssignmentID');
    return { status: 'success', data: { count: rows.length, skipped: clean.length - rows.length }, message: 'تمت إضافة ' + rows.length + ' دعوة.' };
  }
  register('add_ac_batch_invites', addAcBatchInvites_);

  // Full access, per T-6 — and it NEVER touches UsedSlots: that column is
  // maintained only by the candidate admission path (Phase 5).
  function toggleAcBatchActive_(data, user, dbId) {
    const id = String((data && data.id) || '').trim();
    if (!id) throw new Error('BatchID مطلوب.');
    const batch = acRows_(dbId, BATCHES_SHEET).filter(function (b) { return b.BatchID === id; })[0];
    if (!batch) throw new Error('الدفعة غير موجودة.');
    const next = !acBool_(batch.IsActive);
    const res = acUpdate_(dbId, BATCHES_SHEET, 'BatchID', id, { IsActive: next }, (user && user.email) || '');
    return { status: 'success', data: res.data, message: next ? 'تم تفعيل الدفعة.' : 'تم إيقاف الدفعة.' };
  }
  register('toggle_ac_batch_active', toggleAcBatchActive_);

  function updateAcBatchExpiry_(data, user, dbId) {
    const d = data || {};
    const id = String(d.id || '').trim();
    if (!id) throw new Error('BatchID مطلوب.');
    const batch = acRows_(dbId, BATCHES_SHEET).filter(function (b) { return b.BatchID === id; })[0];
    if (!batch) throw new Error('الدفعة غير موجودة.');

    const requested = acDate_(d.ExpiresAt);
    if (!requested) throw new Error('تاريخ الانتهاء غير صالح.');
    // Extension caps at 90 days from TODAY (D-9), not from the batch's
    // original creation date.
    const cap = new Date(); cap.setDate(cap.getDate() + BATCH_EXPIRY_MAX_DAYS);
    const finalDate = requested > cap ? cap : requested;
    const stamped = Utilities.formatDate(finalDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const res = acUpdate_(dbId, BATCHES_SHEET, 'BatchID', id, { ExpiresAt: stamped }, (user && user.email) || '');
    return { status: 'success', data: res.data, message: 'تم تحديث تاريخ الانتهاء.', capped: finalDate.getTime() !== requested.getTime() };
  }
  register('update_ac_batch_expiry', updateAcBatchExpiry_);

  // ── §5.3/Phase 5 — the candidate experience (PUBLIC) ────────────────────────
  const LATE_GRACE_SECONDS = 60; // D-10

  function acAssessmentByBatch_(dbId, batch) {
    const assessment = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === batch.AssessmentID; })[0];
    if (!assessment) throw new Error('التقييم غير موجود.');
    return assessment;
  }

  function acLoadBatchByToken_(dbId, token) {
    const batch = acRows_(dbId, BATCHES_SHEET).filter(function (b) { return b.Token === token; })[0];
    if (!batch) throw new Error('رابط التقييم غير صالح.');
    if (!acBool_(batch.IsActive)) throw new Error('هذا التقييم غير نشط حالياً.');
    const expires = acDate_(batch.ExpiresAt);
    if (expires && expires < new Date()) throw new Error('انتهت صلاحية رابط التقييم.');
    return batch;
  }

  function getAcCandidateAssessment_(data, dbId) {
    const token = String((data && data.token) || '').trim();
    const batch = acLoadBatchByToken_(dbId, token);
    const assessment = acAssessmentByBatch_(dbId, batch);
    const questions = acRows_(dbId, QUESTIONS_SHEET).filter(function (q) { return q.AssessmentID === batch.AssessmentID; });
    const projection = acPublicAssessment_(assessment, questions);

    const email = String((data && data.email) || '').trim().toLowerCase();
    let remainingSeconds = null, assignmentId = null, existingStatus = null;
    if (email) {
      const existing = acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) {
        return a.Token === token && String(a.CandidateEmail || '').trim().toLowerCase() === email;
      })[0];
      if (existing) {
        existingStatus = existing.Status;
        if (existing.Status === 'In Progress') {
          const started = acDate_(existing.StartedAt);
          const limitSec = (Number(assessment.TimeLimitMinutes) || 0) * 60;
          const elapsed = started ? Math.floor((new Date() - started) / 1000) : 0;
          remainingSeconds = Math.max(0, limitSec - elapsed);
          assignmentId = existing.AssignmentID;
        }
      }
    }

    // Phase 8/B-1 — tell the client whether the welcome screen may ask for a
    // name/phone/applied-position (the columns to hold them may not exist
    // yet; detected here, never assumed).
    const b1 = acHasColumns_(dbId, ASSIGNMENTS_SHEET, ['CandidateName', 'CandidatePhone', 'AppliedPosition']);

    return {
      status: 'success', assessment: projection.assessment, questions: projection.questions,
      remaining_seconds: remainingSeconds, assignmentId: assignmentId, existingStatus: existingStatus,
      capabilities: { candidateProfile: acAllColumnsPresent_(b1) }
    };
  }
  publicRegister('get_ac_candidate_assessment', getAcCandidateAssessment_);

  function bumpUsedSlots_(dbId, batch) {
    const current = Number(batch.UsedSlots) || 0;
    acUpdate_(dbId, BATCHES_SHEET, 'BatchID', batch.BatchID, { UsedSlots: current + 1 }, 'system');
  }

  /**
   * §5.3/G-03/T-8 — admission. Locked at 15s (candidate writes cluster at a
   * batch deadline). The slot check re-reads UsedSlots fresh EVERY call, and
   * the read-check-write all happen inside the one lock acquisition, which is
   * what makes two near-simultaneous admissions against one remaining slot
   * admit exactly one rather than both racing past the same stale count.
   */
  function addAcCandidateAttempt_(data, dbId) {
    const token = String((data && data.token) || '').trim();
    const email = String((data && data.email) || '').trim().toLowerCase();
    if (!email) throw new Error('البريد الإلكتروني مطلوب.');

    return executeWithLock_(function () {
      const batch = acLoadBatchByToken_(dbId, token);
      const assessment = acAssessmentByBatch_(dbId, batch);
      const batchAssignments = acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) { return a.BatchID === batch.BatchID; });
      const hasInvites = batchAssignments.some(function (a) { return a.Status === 'Invited'; });
      const mine = batchAssignments.filter(function (a) { return String(a.CandidateEmail || '').trim().toLowerCase() === email; })[0];

      if (hasInvites && !mine) throw new Error('هذه الدفعة مغلقة بدعوات محددة، وبريدك الإلكتروني غير مدرج ضمنها.');
      if (mine && mine.Status === 'Completed') throw new Error('لقد أكملت هذا التقييم بالفعل.');

      // Phase 8/B-1 — captured only at first start, never on a resume, and
      // only when the columns actually exist; a handler must never attempt
      // to write a column that is not there.
      const b1 = acHasColumns_(dbId, ASSIGNMENTS_SHEET, ['CandidateName', 'CandidatePhone', 'AppliedPosition']);
      const b1Available = acAllColumnsPresent_(b1);
      const b1Fields = b1Available ? {
        CandidateName: String((data && data.name) || ''),
        CandidatePhone: String((data && data.phone) || ''),
        AppliedPosition: String((data && data.appliedPosition) || '')
      } : null;

      let assignmentId, startedAt;
      if (mine && mine.Status === 'In Progress') {
        assignmentId = mine.AssignmentID;
        startedAt = acDate_(mine.StartedAt) || new Date();
      } else if (mine && mine.Status === 'Invited') {
        // Consume the invite -> In Progress, starts the clock now. Already
        // has a slot reserved conceptually, but UsedSlots only ever counts
        // ACTUAL admissions, so it is bumped here too, on first start.
        assignmentId = mine.AssignmentID;
        startedAt = new Date();
        acUpdate_(dbId, ASSIGNMENTS_SHEET, 'AssignmentID', assignmentId,
          Object.assign({ Status: 'In Progress', StartedAt: acStamp_() }, b1Fields || {}), 'candidate:' + email);
        bumpUsedSlots_(dbId, batch);
      } else {
        const used = Number(batch.UsedSlots) || 0;
        const max = Number(batch.MaxCandidates) || 0;
        if (used >= max) throw new Error('اكتمل عدد المقاعد المتاحة لهذا التقييم.');
        assignmentId = acUid_();
        startedAt = new Date();
        const row = Object.assign({
          AssignmentID: assignmentId, BatchID: batch.BatchID, Token: token, CandidateEmail: email,
          AssessmentID: batch.AssessmentID, Status: 'In Progress', StartedAt: acStamp_(), CompletedAt: '', CreatedAt: acStamp_()
        }, b1Fields || {});
        acInsert_(dbId, ASSIGNMENTS_SHEET, row, 'candidate:' + email, 'AssignmentID');
        bumpUsedSlots_(dbId, batch);
      }

      const limitSec = (Number(assessment.TimeLimitMinutes) || 0) * 60;
      const elapsed = Math.floor((new Date() - startedAt) / 1000);
      const remainingSeconds = Math.max(0, limitSec - elapsed);
      const questions = acRows_(dbId, QUESTIONS_SHEET).filter(function (q) { return q.AssessmentID === batch.AssessmentID; });
      const projection = acPublicAssessment_(assessment, questions);

      return {
        status: 'success', data: { assignedId: assignmentId },
        assignmentId: assignmentId, remaining_seconds: remainingSeconds,
        assessment: projection.assessment, questions: projection.questions
      };
    }, 15000);
  }
  publicRegister('add_ac_candidate_attempt', addAcCandidateAttempt_);

  /**
   * §5.3/D-10 — submission. Ownership re-checked (assignment+token+email),
   * single-submit, a 60s grace past TimeLimitMinutes is ACCEPTED and flagged
   * (never refused), auto-grades filled into Responses.Score, and every
   * candidate-side event lands in the sheet's own AuditLog tab in the SAME
   * request — not a second round trip.
   */
  function addAcCandidateSubmission_(data, dbId) {
    const token = String((data && data.token) || '').trim();
    const email = String((data && data.email) || '').trim().toLowerCase();
    const assignmentId = String((data && data.assignmentId) || '').trim();
    const answers = Array.isArray(data && data.answers) ? data.answers : [];
    const events = Array.isArray(data && data.events) ? data.events : [];
    if (!email || !assignmentId) throw new Error('بيانات التسليم غير مكتملة.');

    return executeWithLock_(function () {
      const assignment = acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) {
        return a.AssignmentID === assignmentId && a.Token === token && String(a.CandidateEmail || '').trim().toLowerCase() === email;
      })[0];
      if (!assignment) throw new Error('محاولة غير صالحة — تحقق من الرابط والبريد الإلكتروني.');
      if (assignment.Status === 'Completed') throw new Error('تم إرسال هذا التقييم بالفعل.');

      const assessment = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === assignment.AssessmentID; })[0];
      const questions = acRows_(dbId, QUESTIONS_SHEET).filter(function (q) { return q.AssessmentID === assignment.AssessmentID; });
      const qById = {};
      questions.forEach(function (q) { qById[q.QuestionID] = q; });

      const started = acDate_(assignment.StartedAt);
      const now = new Date();
      const limitSec = (Number(assessment && assessment.TimeLimitMinutes) || 0) * 60;
      const elapsedSec = started ? Math.floor((now - started) / 1000) : 0;
      const lateSeconds = elapsedSec - limitSec;
      const isLate = lateSeconds > LATE_GRACE_SECONDS;

      const stamp = acStamp_();
      const respRows = answers.map(function (a) {
        const q = qById[a.questionId];
        let score = '';
        if (q && q.QuestionType === 'MCQ') {
          const norm = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
          score = (q.CorrectAnswer && norm(a.answer) === norm(q.CorrectAnswer)) ? (Number(q.Weight) || 0) : 0;
        }
        return {
          ResponseID: acUid_(), AssignmentID: assignmentId, QuestionID: a.questionId,
          Answer: (a.answer === undefined || a.answer === null) ? '' : a.answer,
          Score: score, AnsweredAt: stamp, EmailCandidate: email, CreatedAt: stamp
        };
      });
      if (respRows.length) acInsertMany_(dbId, RESPONSES_SHEET, respRows, 'candidate:' + email, 'ResponseID');

      acUpdate_(dbId, ASSIGNMENTS_SHEET, 'AssignmentID', assignmentId, { Status: 'Completed', CompletedAt: stamp }, 'candidate:' + email);

      // Candidate-side events -> the sheet's OWN AuditLog tab (§5.6) — no
      // ERP_Record_History entry for these (acAppendRows_, not acInsertMany_):
      // this is a free-form event log, not a business record with a PK.
      const auditRows = [];
      const eventsByType = {};
      events.forEach(function (e) {
        if (!e || !e.type) return;
        const t = String(e.type);
        if (!eventsByType[t]) eventsByType[t] = { count: 0, first: e.at, last: e.at };
        eventsByType[t].count++;
        eventsByType[t].last = e.at;
      });
      Object.keys(eventsByType).forEach(function (t) {
        const info = eventsByType[t];
        auditRows.push({
          Timestamp: new Date(), ActorEmail: email, Action: t,
          Details: 'AssignmentID=' + assignmentId + '; count=' + info.count + '; first=' + info.first + '; last=' + info.last
        });
      });
      if (isLate) {
        auditRows.push({
          Timestamp: new Date(), ActorEmail: email, Action: 'LATE_SUBMISSION',
          Details: 'AssignmentID=' + assignmentId + '; late_seconds=' + lateSeconds
        });
      }
      if (auditRows.length) acAppendRows_(dbId, AUDIT_SHEET, auditRows);

      return { status: 'success', data: { assignedId: assignmentId }, late: isLate };
    }, 15000);
  }
  publicRegister('add_ac_candidate_submission', addAcCandidateSubmission_);

  // ── §5.5/Phase 6 — review ────────────────────────────────────────────────────
  function getAcResults_(data, user, dbId) {
    const batchByPk = acByPk_(dbId, BATCHES_SHEET, 'BatchID').byPk;
    const assessByPk = acByPk_(dbId, ASSESSMENTS_SHEET, 'AssessmentID').byPk;
    const questionsByAssessment = {};
    acRows_(dbId, QUESTIONS_SHEET).forEach(function (q) {
      (questionsByAssessment[q.AssessmentID] = questionsByAssessment[q.AssessmentID] || []).push(q);
    });
    const responsesByAssignment = {};
    acRows_(dbId, RESPONSES_SHEET).forEach(function (r) {
      (responsesByAssignment[r.AssignmentID] = responsesByAssignment[r.AssignmentID] || []).push(r);
    });

    const rows = acRows_(dbId, ASSIGNMENTS_SHEET)
      // An un-started Invited row is not a result yet — nothing to review.
      .filter(function (a) { return a.Status !== 'Invited'; })
      .map(function (a) {
        const batch = batchByPk.get(a.BatchID) || {};
        const assessment = assessByPk.get(a.AssessmentID) || {};
        const questions = questionsByAssessment[a.AssessmentID] || [];
        const responses = responsesByAssignment[a.AssignmentID] || [];
        const scored = acScore_(assessment, questions, responses, []);
        return {
          AssignmentID: a.AssignmentID, CompanyName: batch.CompanyName || 'N/A',
          AssessmentTitle: assessment.Title || 'N/A', CandidateEmail: a.CandidateEmail,
          StartedAt: a.StartedAt, Status: a.Status,
          Score: scored.score, Max: scored.max, Verdict: scored.verdict
        };
      });
    return { status: 'success', rows: rows };
  }
  register('get_ac_results', getAcResults_);

  function getAcResult_(data, user, dbId) {
    const id = String((data && data.id) || '').trim();
    if (!id) throw new Error('AssignmentID مطلوب.');
    const assignment = acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) { return a.AssignmentID === id; })[0];
    if (!assignment) throw new Error('المحاولة غير موجودة.');
    const batch = acRows_(dbId, BATCHES_SHEET).filter(function (b) { return b.BatchID === assignment.BatchID; })[0] || {};
    const assessment = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === assignment.AssessmentID; })[0] || {};
    const questions = acRows_(dbId, QUESTIONS_SHEET)
      .filter(function (q) { return q.AssessmentID === assignment.AssessmentID; })
      .sort(function (x, y) { return (parseInt(x.OrderIndex, 10) || 0) - (parseInt(y.OrderIndex, 10) || 0); });
    const responses = acRows_(dbId, RESPONSES_SHEET).filter(function (r) { return r.AssignmentID === id; });
    const events = acRows_(dbId, AUDIT_SHEET)
      .filter(function (r) { return String(r.Details || '').indexOf('AssignmentID=' + id) === 0 || String(r.Details || '').indexOf('AssignmentID=' + id + ';') !== -1; })
      .map(function (r) { return { Action: r.Action, Timestamp: r.Timestamp, Details: r.Details }; });

    const scored = acScore_(assessment, questions, responses, []);
    const respByQ = {};
    responses.forEach(function (r) { respByQ[r.QuestionID] = r; });
        const scoreByQuestion = ERPReadAlgorithms_.firstScoreIndex(scored.items);
    const answers = questions.map(function (q) {
      const r = respByQ[q.QuestionID];
      const item = scoreByQuestion.get(q.QuestionID) || {};
      return {
        QuestionID: q.QuestionID, QuestionText: q.QuestionText, QuestionType: q.QuestionType,
        Options: acParseOptions_(q.OptionsJSON), CorrectAnswer: q.CorrectAnswer, Weight: q.Weight,
        Answer: r ? r.Answer : '', ResponseID: r ? r.ResponseID : null,
        Score: item.Score, Max: item.Max, Pending: !!item.Pending
      };
    });

    // Phase 8/B-2 — the decision block only when the four columns exist;
    // acRows_ already omits properties for columns that are not there, so
    // this is read straight off `assignment`, never assumed present.
    const b2 = acHasColumns_(dbId, ASSIGNMENTS_SHEET, ['ReviewDecision', 'ReviewNotes', 'ReviewedBy', 'ReviewedAt']);
    const b2Available = acAllColumnsPresent_(b2);

    return {
      status: 'success', assignment: assignment, batch: batch, assessment: assessment,
      answers: answers, traits: scored.traits, verdict: scored.verdict,
      score: scored.score, max: scored.max, events: events,
      capabilities: { review: b2Available },
      review: b2Available ? {
        decision: assignment.ReviewDecision || '', notes: assignment.ReviewNotes || '',
        reviewedBy: assignment.ReviewedBy || '', reviewedAt: assignment.ReviewedAt || ''
      } : null
    };
  }
  register('get_ac_result', getAcResult_);

  /**
   * Phase 8/B-2 — {assignment_id, decision, notes}. Throws a clear, actionable
   * error when the columns are absent rather than silently discarding a
   * reviewer's decision (unlike B-1's welcome-screen fields, a "hire" the
   * reviewer believes was saved but was not is a real problem, not a
   * cosmetic one).
   */
  function addAcReviewDecision_(data, user, dbId) {
    const d = data || {};
    const assignmentId = String(d.assignment_id || '').trim();
    if (!assignmentId) throw new Error('AssignmentID مطلوب.');
    const cols = acHasColumns_(dbId, ASSIGNMENTS_SHEET, ['ReviewDecision', 'ReviewNotes', 'ReviewedBy', 'ReviewedAt']);
    if (!acAllColumnsPresent_(cols)) {
      throw new Error('أعمدة قرار المراجعة غير مضافة بعد لهذا الشيت. راجع مدير النظام لإضافتها.');
    }
    const decision = String(d.decision || '').trim();
    if (!decision) throw new Error('القرار مطلوب.');
    const userEmail = (user && user.email) || '';
    const res = acUpdate_(dbId, ASSIGNMENTS_SHEET, 'AssignmentID', assignmentId, {
      ReviewDecision: decision, ReviewNotes: String(d.notes || ''), ReviewedBy: userEmail, ReviewedAt: acStamp_()
    }, userEmail);
    return { status: 'success', data: res.data, message: 'تم حفظ القرار.' };
  }
  register('add_ac_review_decision', addAcReviewDecision_);

  /** {assignment_id, grades:[{response_id, score}]} — clamped [0,Weight]. */
  function addAcCandidateGrade_(data, user, dbId) {
    const d = data || {};
    const assignmentId = String(d.assignment_id || '').trim();
    const grades = Array.isArray(d.grades) ? d.grades : [];
    if (!assignmentId) throw new Error('AssignmentID مطلوب.');
    if (!grades.length) throw new Error('لا توجد درجات لحفظها.');

    const assignment = acRows_(dbId, ASSIGNMENTS_SHEET).filter(function (a) { return a.AssignmentID === assignmentId; })[0];
    if (!assignment) throw new Error('المحاولة غير موجودة.');
    const questions = acRows_(dbId, QUESTIONS_SHEET).filter(function (q) { return q.AssessmentID === assignment.AssessmentID; });
    const qById = {}; questions.forEach(function (q) { qById[q.QuestionID] = q; });
    const respById = {};
    acRows_(dbId, RESPONSES_SHEET).filter(function (r) { return r.AssignmentID === assignmentId; })
      .forEach(function (r) { respById[r.ResponseID] = r; });

    const userEmail = (user && user.email) || '';
    grades.forEach(function (g) {
      const resp = respById[g.response_id];
      if (!resp) throw new Error('إجابة غير موجودة: ' + g.response_id);
      const q = qById[resp.QuestionID];
      const weight = Number(q && q.Weight) || 0;
      const score = Math.max(0, Math.min(weight, Number(g.score) || 0));
      acUpdate_(dbId, RESPONSES_SHEET, 'ResponseID', g.response_id, { Score: score }, userEmail);
    });

    // Status -> Reviewed once nothing is left ungraded — recomputed fresh,
    // never assumed, in case another OpenText item is still pending.
    const freshResponses = acRows_(dbId, RESPONSES_SHEET).filter(function (r) { return r.AssignmentID === assignmentId; });
    const assessment = acRows_(dbId, ASSESSMENTS_SHEET).filter(function (a) { return a.AssessmentID === assignment.AssessmentID; })[0];
    const scored = acScore_(assessment, questions, freshResponses, []);
    if (scored.verdict !== 'Pending' && assignment.Status !== 'Reviewed') {
      acUpdate_(dbId, ASSIGNMENTS_SHEET, 'AssignmentID', assignmentId, { Status: 'Reviewed' }, userEmail);
    }

    return { status: 'success', data: { assignedId: assignmentId }, verdict: scored.verdict, message: 'تم حفظ الدرجات بنجاح.' };
  }
  register('add_ac_candidate_grade', addAcCandidateGrade_);

  // ── §6.4/T-3/T-4 — the write path ──────────────────────────────────────────
  // Never addRecord_ / getNextId_ / saveRecordWithAudit_ against this
  // spreadsheet (R-16/R-17): a lower-case dataMap key would be silently
  // shadowed by the old value on update, and the first save would create an
  // ID_Counter tab in the owner's assessment spreadsheet. ac4_write_contract.js
  // greps this file for all three names and fails the suite if any appears.

  /**
   * Header-mapped single insert. `obj`'s keys are matched to the sheet's real
   * headers case-INsensitively (so a handler may pass PascalCase keys matching
   * the plan's §2.2 column names, or any other case, and every value still
   * lands in the right column) — unlike addRecord_, which only ever looks keys
   * up lower-cased.
   */
  function acInsert_(dbId, sheet, obj, user, pkName, lockMs) {
    return executeWithLock_(function () {
      const sh = getSheet_(sheet, dbId);
      const headers = getHeaders_(sh);
      const lut = {};
      Object.keys(obj).forEach(function (k) { lut[String(k).trim().toLowerCase()] = obj[k]; });
      const rowValues = headers.map(function (h) {
        const v = lut[String(h).trim().toLowerCase()];
        return v === undefined ? '' : v;
      });
      appendRowWithRetry_(sh, rowValues);
      // logHistory_ looks new/old values up BY THE SHEET'S REAL HEADER SPELLING
      // (02_DataAccess.js). Handing it the caller's possibly differently-cased
      // `obj` directly would silently blank every column whose key case
      // doesn't match — the very same R-16 shadowing trap, one layer further
      // in. A header-case object built from the row just written sidesteps it.
      const headerCaseObj = {};
      headers.forEach(function (h, i) { headerCaseObj[h] = rowValues[i]; });
      const pk = obj[pkName];
      try { logHistory_(dbId, sheet, 'rec_' + pk, pk, user, 'create', headerCaseObj, null); } catch (e) {}
      return { status: 'success', data: { record: headerCaseObj, assignedId: pk } };
    }, lockMs);
  }

  /**
   * Bulk variant — ONE setValues for N rows (the standalone's uiSubmitTest
   * already does this for Responses; Questions on save follows the same
   * shape). One executeWithLock_ acquisition for the whole batch, one
   * logHistory_ call per created row (matching house precedent elsewhere in
   * this codebase for bulk creates).
   */
  function acInsertMany_(dbId, sheet, objs, user, pkName, lockMs) {
    if (!objs || !objs.length) return { status: 'success', data: { count: 0 } };
    return executeWithLock_(function () {
      const sh = getSheet_(sheet, dbId);
      const headers = getHeaders_(sh);
      const matrix = objs.map(function (obj) {
        const lut = {};
        Object.keys(obj).forEach(function (k) { lut[String(k).trim().toLowerCase()] = obj[k]; });
        return headers.map(function (h) {
          const v = lut[String(h).trim().toLowerCase()];
          return v === undefined ? '' : v;
        });
      });
      const startRow = sh.getLastRow() + 1;
      sh.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
      noteMutation_(sh);
      objs.forEach(function (obj, i) {
        const pk = obj[pkName];
        // Same header-case rule as acInsert_ — logHistory_ reads by real
        // header spelling, so it gets the row actually written, not `obj`.
        const headerCaseObj = {};
        headers.forEach(function (h, c) { headerCaseObj[h] = matrix[i][c]; });
        try { logHistory_(dbId, sheet, 'rec_' + pk, pk, user, 'create', headerCaseObj, null); } catch (e) {}
      });
      return { status: 'success', data: { count: objs.length } };
    }, lockMs);
  }

  /**
   * Header-mapped bulk append with NO history logging — for AuditLog only
   * (§5.6): a free-form candidate-event log with no primary key, not a
   * business record ERP_Record_History should carry a "create" entry for.
   * Same case-insensitive header mapping as acInsertMany_, minus logHistory_.
   */
  function acAppendRows_(dbId, sheet, objs, lockMs) {
    if (!objs || !objs.length) return;
    return executeWithLock_(function () {
      const sh = getSheet_(sheet, dbId);
      const headers = getHeaders_(sh);
      const matrix = objs.map(function (obj) {
        const lut = {};
        Object.keys(obj).forEach(function (k) { lut[String(k).trim().toLowerCase()] = obj[k]; });
        return headers.map(function (h) {
          const v = lut[String(h).trim().toLowerCase()];
          return v === undefined ? '' : v;
        });
      });
      const startRow = sh.getLastRow() + 1;
      sh.getRange(startRow, 1, matrix.length, headers.length).setValues(matrix);
      noteMutation_(sh);
    }, lockMs);
  }

  /**
   * Header-case-safe update. `patch` is handed to updateRowByCriteria_ ALONE —
   * never merged with the old record first — because updateRowByCriteria_
   * matches each of the CALLER's keys against the sheet's real headers
   * case-insensitively on every cell independently; merging `old` (header-case
   * keys, from acRows_) with a differently-cased patch first is exactly the
   * R-16 shadowing trap (a lower-case patch key would sit next to the
   * untouched header-case old key, and the update silently no-ops). Passing
   * the patch alone sidesteps the trap entirely — T-3.
   */
  function acUpdate_(dbId, sheet, pkName, pkValue, patch, user, lockMs) {
    return executeWithLock_(function () {
      const idx = acByPk_(dbId, sheet, pkName);
      const old = idx.byPk.get(String(pkValue)) || null;
      const sh = getSheet_(sheet, dbId);
      const ok = updateRowByCriteria_(sh, pkName, pkValue, patch);
      if (!ok) throw new Error('Record not found: ' + pkValue);
      // Same header-case rule as acInsert_, now on the READ side: build the
      // "new values" object for logHistory_ by resolving each of the sheet's
      // real headers against `patch` case-insensitively, rather than
      // Object.assign(old, patch) — which would leave the header-case `old`
      // key untouched next to patch's differently-cased one and report the
      // column as unchanged in ERP_Record_History even though the cell
      // itself (via updateRowByCriteria_'s own case-insensitive match) was
      // correctly written.
      const headers = getHeaders_(sh);
      const patchLut = {};
      Object.keys(patch).forEach(function (k) { patchLut[String(k).trim().toLowerCase()] = patch[k]; });
      const merged = Object.assign({}, old);
      headers.forEach(function (h) {
        const v = patchLut[String(h).trim().toLowerCase()];
        if (v !== undefined) merged[h] = v;
      });
      try { logHistory_(dbId, sheet, (old && old.record_uid) || ('update_' + sheet + '_' + pkValue), pkValue, user, 'update', merged, old); } catch (e) {}
      return { status: 'success', data: { record: merged } };
    }, lockMs);
  }

  return {
    dispatch_: dispatch_,
    publicDispatch_: publicDispatch_,
    pageForAction_: pageForAction_,
    tableForAction_: tableForAction_,
    register: register,
    publicRegister: publicRegister,
    // Exposed for the offline verify suite (ac2_scoring.js / ac4_write_contract.js
    // / ac5_candidate.js) to call directly and for fixture-driven testing —
    // these are the same functions every handler above uses internally.
    acScore_: acScore_,
    acPublicAssessment_: acPublicAssessment_,
    acParseOptions_: acParseOptions_,
    acDate_: acDate_,
    acStamp_: acStamp_,
    acBool_: acBool_,
    acJson_: acJson_,
    acUid_: acUid_,
    acToken_: acToken_,
    acValidToken_: acValidToken_,
    acRows_: acRows_,
    acByPk_: acByPk_,
    acInsert_: acInsert_,
    acInsertMany_: acInsertMany_,
    acUpdate_: acUpdate_,
    acOptionsForWire_: acOptionsForWire_,
    acCategoryLabel_: acCategoryLabel_,
    acCandidateLink_: acCandidateLink_
  };
})();


