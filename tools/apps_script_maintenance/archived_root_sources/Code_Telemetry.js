/**
 * Code_Telemetry.js
 * RESPONSIBILITY: request telemetry buffers, drains and read-only dashboard.
 * The global names are preserved because Code.js routes and triggers call them.
 * The module intentionally depends only on existing Apps Script/data-layer
 * globals; no business schema or request path contract changes here.
 */
var PERF_LOG_SHEET_ = 'ERP_Perf_Log';
var PERF_WEEKLY_SHEET_ = 'ERP_Perf_Weekly';

/* The nine columns from the plan, and deliberately not a tenth. */
var PERF_LOG_HEADERS_ = [
  'ts', 'action', 'company', 'page', 'elapsed_ms', 'sheet_reads', 'status', 'user_hash', 'client_ms'
];
var PERF_WEEKLY_HEADERS_ = [
  'week', 'action', 'count', 'p50_ms', 'p90_ms', 'p99_ms', 'error_rate', 'mean_sheet_reads'
];

/** Everything tunable, in one place, so none of it is buried in a function. */
var PERF_TELEMETRY_ = {
  ENABLED: true,
  /* Fraction of FAST reads that are recorded. Writes and slow requests are
   * always recorded regardless of this. */
  READ_SAMPLE: 0.10,
  /* Above this, a request is recorded whatever it is. */
  SLOW_MS: 1000,
  /* Raw rows kept this long; the weekly rollup is kept indefinitely because it
   * is tiny and it is the thing anybody actually reads. */
  RETAIN_DAYS: 90,
  /* Guard against one runaway minute filling the buffer. */
  MAX_PER_MINUTE: 500
};

function perfBufferKey_(minuteStamp) {
  return 'perfbuf_' + minuteStamp;
}

/** The minute a timestamp falls in, as a stable string. */
function perfMinute_(d) {
  return String(Math.floor((d || new Date()).getTime() / 60000));
}

/**
 * A stable, salted, non-reversible stand-in for an email.
 *
 * The salt is a Script Property so the mapping cannot be recomputed by anyone
 * holding only the sheet. If it is unset, the hash is still stable within a
 * deployment and still not an email — the property makes it harder to attack,
 * it is not what makes it non-identifying.
 */
function perfUserHash_(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  var salt = '';
  try { salt = PropertiesService.getScriptProperties().getProperty('PERF_HASH_SALT') || ''; } catch (err) {}
  var s = salt + '|' + e;
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'u' + (h >>> 0).toString(36);
}

/** Should this request be recorded at all? */
function perfShouldSample_(isWrite, elapsedMs) {
  if (!PERF_TELEMETRY_.ENABLED) return false;
  if (isWrite) return true;
  if (Number(elapsedMs) >= PERF_TELEMETRY_.SLOW_MS) return true;
  return Math.random() < PERF_TELEMETRY_.READ_SAMPLE;
}

/**
 * Record one request. Called from apiRouter_, on the way out, and costs one
 * CacheService read plus one write — no sheet, no lock, no id allocation.
 */
function perfRecord_(entry) {
  try {
    if (!entry || !perfShouldSample_(!!entry.isWrite, entry.elapsed_ms)) return;
    var key = perfBufferKey_(perfMinute_());
    var cache = CacheService.getScriptCache();
    var buf = [];
    try {
      var raw = cache.get(key);
      if (raw) buf = JSON.parse(raw) || [];
    } catch (eRead) { buf = []; }
    if (!Array.isArray(buf)) buf = [];
    if (buf.length >= PERF_TELEMETRY_.MAX_PER_MINUTE) return;

    /* Exactly the nine values, in order. Nothing here is a payload, a record
     * id or an email, and there is no branch that could make it one. */
    buf.push([
      new Date().toISOString(),
      String(entry.action || '').slice(0, 80),
      String(entry.company || '').slice(0, 40),
      String(entry.page || '').slice(0, 60),
      Number(entry.elapsed_ms) || 0,
      Number(entry.sheet_reads) || 0,
      String(entry.status || '').slice(0, 20),
      perfUserHash_(entry.user_email),
      Number(entry.client_ms) || 0
    ]);
    /* Ten minutes: long enough for a one-minute drain to be late four times
     * over, short enough that an undrained buffer is not a slow leak. */
    cache.put(key, JSON.stringify(buf), 600);
  } catch (e) {
    /* Telemetry must never be the reason a request fails. */
  }
}

/** The sheet, created on first use. Additive, outside every business table. */
function ensurePerfSheet_(name, headers) {
  var ss = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID);
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    noteMutation_(sh);
  }
  return sh;
}

/**
 * Drain the finished minutes into ERP_Perf_Log. Installed as a one-minute
 * time-driven trigger.
 *
 * The CURRENT minute is deliberately left alone — draining it would race with
 * requests still writing into it, and losing the tail of every minute is a
 * worse answer than being sixty seconds behind.
 */
function drainPerfBuffer_() {
  try {
    var now = Number(perfMinute_());
    var cache = CacheService.getScriptCache();
    var rows = [];
    /* Ten minutes back, so a trigger that missed a few runs catches up rather
     * than silently dropping what it missed. */
    for (var back = 1; back <= 10; back++) {
      var key = perfBufferKey_(String(now - back));
      var raw = null;
      try { raw = cache.get(key); } catch (e) { raw = null; }
      if (!raw) continue;
      var buf = [];
      try { buf = JSON.parse(raw) || []; } catch (e) { buf = []; }
      if (buf.length) rows = rows.concat(buf);
      /* Removed BEFORE the write. A duplicated telemetry row is worse than a
       * lost one: it silently skews the percentiles this whole thing exists to
       * produce, and nothing downstream could tell. The audit queue makes the
       * opposite trade, on purpose. */
      try { cache.remove(key); } catch (e) {}
    }
    if (!rows.length) return { status: 'success', rows: 0 };

    if (systemStorageTarget_().backend === 'firestore') {
      rows.forEach(function (r, i) { systemCreateRecord_('ERP_Perf_Log', { ts: r[0], action: r[1], company: r[2], page: r[3], elapsed_ms: r[4], sheet_reads: r[5], status: r[6], user_hash: r[7], client_ms: r[8] }, { operationId: 'perf:' + String(r[0]) + ':' + String(r[1]) + ':' + i }); });
      return { status: 'success', rows: rows.length, backend: 'firestore' };
    }

    var sh = ensurePerfSheet_(PERF_LOG_SHEET_, PERF_LOG_HEADERS_);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, PERF_LOG_HEADERS_.length).setValues(rows);
    noteMutation_(sh);
    return { status: 'success', rows: rows.length };
  } catch (e) {
    try { console.error('drainPerfBuffer_: ' + e.message); } catch (eL) {}
    return { status: 'error', message: e.message };
  }
}

/** p-th percentile of a sorted numeric array, nearest-rank. */
function perfPercentile_(sorted, p) {
  if (!sorted.length) return 0;
  var rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** ISO-ish week key: the Monday of the week, as YYYY-MM-DD. */
function perfWeekKey_(d) {
  var t = new Date(d.getTime());
  var day = (t.getDay() + 6) % 7;          /* Monday = 0 */
  t.setDate(t.getDate() - day);
  return Utilities.formatDate(t, 'UTC', 'yyyy-MM-dd');
}

/**
 * One row per action per week: p50, p90, p99, count, error rate, mean sheet
 * reads. This is the table anybody actually reads. The raw log is evidence;
 * the rollup is the review.
 */
function rollupPerfWeekly_() {
  if (systemStorageTarget_().backend === 'firestore') return rollupPerfWeeklyFirestore_();
  try {
    var sh = ensurePerfSheet_(PERF_LOG_SHEET_, PERF_LOG_HEADERS_);
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return { status: 'success', rows: 0 };

    var groups = {};
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      var when = new Date(r[0]);
      if (isNaN(when.getTime())) continue;
      var key = perfWeekKey_(when) + '|' + String(r[1] || '');
      if (!groups[key]) groups[key] = { ms: [], reads: 0, errors: 0, n: 0 };
      var g = groups[key];
      g.ms.push(Number(r[4]) || 0);
      g.reads += Number(r[5]) || 0;
      if (String(r[6] || '').toUpperCase() === 'FAILED') g.errors++;
      g.n++;
    }

    var out = [];
    Object.keys(groups).sort().forEach(function (key) {
      var g = groups[key];
      var parts = key.split('|');
      g.ms.sort(function (a, b) { return a - b; });
      out.push([
        parts[0], parts[1], g.n,
        perfPercentile_(g.ms, 50), perfPercentile_(g.ms, 90), perfPercentile_(g.ms, 99),
        g.n ? Number((g.errors / g.n).toFixed(4)) : 0,
        g.n ? Number((g.reads / g.n).toFixed(2)) : 0
      ]);
    });
    if (!out.length) return { status: 'success', rows: 0 };

    var wk = ensurePerfSheet_(PERF_WEEKLY_SHEET_, PERF_WEEKLY_HEADERS_);
    /* Rewritten whole rather than appended: a week's numbers change as more of
     * it happens, and two rows for the same week and action would be a bug in
     * the only table anybody reads. */
    if (wk.getLastRow() > 1) wk.getRange(2, 1, wk.getLastRow() - 1, PERF_WEEKLY_HEADERS_.length).clearContent();
    wk.getRange(2, 1, out.length, PERF_WEEKLY_HEADERS_.length).setValues(out);
    noteMutation_(wk);
    return { status: 'success', rows: out.length };
  } catch (e) {
    try { console.error('rollupPerfWeekly_: ' + e.message); } catch (eL) {}
    return { status: 'error', message: e.message };
  }
}

function rollupPerfWeeklyFirestore_() {
  try {
    var values = systemGetAllRecords_('ERP_Perf_Log'), groups = {};
    values.forEach(function (r) { var when = new Date(r.ts); if (isNaN(when.getTime())) return; var key = perfWeekKey_(when) + '|' + String(r.action || ''); if (!groups[key]) groups[key] = { ms: [], reads: 0, errors: 0, n: 0 }; var g = groups[key]; g.ms.push(Number(r.elapsed_ms) || 0); g.reads += Number(r.sheet_reads) || 0; if (String(r.status || '').toUpperCase() === 'FAILED') g.errors++; g.n++; });
    Object.keys(groups).forEach(function (key) { var g = groups[key], parts = key.split('|'); g.ms.sort(function (a, b) { return a - b; }); var data = { week: parts[0], action: parts[1], count: g.n, p50_ms: perfPercentile_(g.ms, 50), p90_ms: perfPercentile_(g.ms, 90), p99_ms: perfPercentile_(g.ms, 99), error_rate: g.n ? Number((g.errors / g.n).toFixed(4)) : 0, mean_sheet_reads: g.n ? Number((g.reads / g.n).toFixed(2)) : 0 }; systemCreateRecord_('ERP_Perf_Weekly', data, { operationId: 'perf-week:' + key }); });
    return { status: 'success', rows: Object.keys(groups).length, backend: 'firestore' };
  } catch (e) { return { status: 'error', message: e.message }; }
}

/**
 * Retention. Raw rows older than RETAIN_DAYS go; the weekly rollup stays,
 * because it is tiny and it is the point. Deliberately deletes from the TOP,
 * where the oldest rows are, in one contiguous block.
 */
function prunePerfLog_() {
  if (systemStorageTarget_().backend === 'firestore') {
    try { var cutoffFs = Date.now() - PERF_TELEMETRY_.RETAIN_DAYS * 86400000, removedFs = 0; systemGetAllRecords_('ERP_Perf_Log').forEach(function (r) { var d = new Date(r.ts); if (r._meta && !isNaN(d.getTime()) && d.getTime() < cutoffFs && systemRemoveRecord_('ERP_Perf_Log', r._meta.documentId, { expectedUpdateTime: r._meta.updateTime })) removedFs++; }); return { status: 'success', removed: removedFs, backend: 'firestore' }; } catch (e) { return { status: 'error', message: e.message }; }
  }
  try {
    var sh = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName(PERF_LOG_SHEET_);
    if (!sh || sh.getLastRow() < 2) return { status: 'success', removed: 0 };
    var cutoff = new Date().getTime() - PERF_TELEMETRY_.RETAIN_DAYS * 86400000;
    var stamps = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    var keepFrom = 0;
    while (keepFrom < stamps.length) {
      var t = new Date(stamps[keepFrom][0]).getTime();
      if (isNaN(t) || t >= cutoff) break;
      keepFrom++;
    }
    if (!keepFrom) return { status: 'success', removed: 0 };
    sh.deleteRows(2, keepFrom);
    noteMutation_(sh);
    return { status: 'success', removed: keepFrom };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

/** The ten slowest actions this week and last, for the dashboard page. */
function getPerfDashboard_(data, user) {
  if (!(user && user.isSuperAdmin)) throw new Error(ERP_MESSAGES.NOT_AUTHORIZED);
  var out = { status: 'success', weeks: [], rows: [] };
  if (systemStorageTarget_().backend === 'firestore') {
    try {
      var weekly = systemGetAllRecords_('ERP_Perf_Weekly'), weeksFs = {}; weekly.forEach(function (r) { weeksFs[String(r.week)] = true; }); var sortedFs = Object.keys(weeksFs).sort().reverse(), thisWeekFs = sortedFs[0] || '', lastWeekFs = sortedFs[1] || '', prevFs = {}; weekly.forEach(function (r) { if (String(r.week) === lastWeekFs) prevFs[String(r.action)] = Number(r.p90_ms) || 0; });
      out.weeks = [thisWeekFs, lastWeekFs]; out.rows = weekly.filter(function (r) { return String(r.week) === thisWeekFs; }).map(function (r) { var p = Number(r.p90_ms) || 0; return { action: String(r.action), count: Number(r.count) || 0, p50: Number(r.p50_ms) || 0, p90: p, p99: Number(r.p99_ms) || 0, error_rate: Number(r.error_rate) || 0, mean_sheet_reads: Number(r.mean_sheet_reads) || 0, prev_p90: prevFs[r.action] === undefined ? null : prevFs[r.action], delta: prevFs[r.action] === undefined ? null : p - prevFs[r.action] }; }).sort(function (a, b) { return b.p90 - a.p90; }).slice(0, 10);
      return out;
    } catch (e) { return out; }
  }
  try {
    var wk = getSpreadsheet_(CONFIG.AUTH_SPREADSHEET_ID).getSheetByName(PERF_WEEKLY_SHEET_);
    if (!wk || wk.getLastRow() < 2) return out;
    var values = wk.getRange(2, 1, wk.getLastRow() - 1, PERF_WEEKLY_HEADERS_.length).getValues();
    var weeks = {};
    values.forEach(function (r) { weeks[String(r[0])] = true; });
    var sorted = Object.keys(weeks).sort().reverse();
    var thisWeek = sorted[0] || '', lastWeek = sorted[1] || '';
    out.weeks = [thisWeek, lastWeek];

    var prev = {};
    values.forEach(function (r) { if (String(r[0]) === lastWeek) prev[String(r[1])] = Number(r[4]) || 0; });

    out.rows = values
      .filter(function (r) { return String(r[0]) === thisWeek; })
      .map(function (r) {
        var action = String(r[1]);
        var p90 = Number(r[4]) || 0;
        return {
          action: action, count: Number(r[2]) || 0,
          p50: Number(r[3]) || 0, p90: p90, p99: Number(r[5]) || 0,
          error_rate: Number(r[6]) || 0, mean_sheet_reads: Number(r[7]) || 0,
          prev_p90: prev[action] === undefined ? null : prev[action],
          delta: prev[action] === undefined ? null : (p90 - prev[action])
        };
      })
      .sort(function (a, b) { return b.p90 - a.p90; })
      .slice(0, 10);
  } catch (e) { /* an empty dashboard is a valid answer */ }
  return out;
}

/**
 * System audit log helpers
 */
function classifyAction_(action) {
  if (!action) return 'UNKNOWN';
  const actionStr = String(action).toLowerCase();
  
  // No log actions
  if (actionStr.startsWith('get_') || actionStr === 'ping' || 
      actionStr === 'login_user' || actionStr === 'setup_password') {
    return 'NO_LOG';
  }
  
  // Admin list actions
  if (actionStr.startsWith('admin_list_')) {
    return 'NO_LOG';
  }
  
  // Action classification
  if (actionStr.startsWith('add_')) return 'ADD';
  if (actionStr.startsWith('edit_') || actionStr.startsWith('update_') || 
      actionStr.startsWith('approve_') || actionStr.startsWith('toggle_')) {
    return 'EDIT';
  }
  if (actionStr.startsWith('delete_') || actionStr.startsWith('remove_')) {
    return 'DELETE';
  }
  if (actionStr.startsWith('admin_delete_')) {
    return 'DELETE';
  }
  if (actionStr.startsWith('admin_save_')) {
    // For admin_save_, check if it's creating new or updating existing
    return 'ADMIN_SAVE'; // We'll handle this specifically in the log function
  }
  
  return 'UNKNOWN';
}

function extractRecordId_(action, result) {
  // Try to extract assigned ID from result
  if (result && result.data && result.data.assignedId) {
    return result.data.assignedId;
  }
  if (result && result.data && result.data.id) {
    return result.data.id;
  }
  return null;
}

/**
 * F-10: logSystemAction_ calls this on every logged write, and because writes run
 * with the request memo disabled (Code.js apiRouter_), it paid a full
 * ERP_Companies read every time. Version-cached on version_companies, the same
 * stamp its siblings in 03_Security.js use, so bumpVersion_('ERP_Companies')
 * invalidates it too.
 */
function getCompanyName_(companyId) {
  if (!companyId) return '';
  const cache = CacheService.getScriptCache();
  const compVersion = cache.get('version_companies') || '0';
  const cacheKey = 'company_name_v_' + compVersion + '_' + companyId;
  try {
    const cached = cache.get(cacheKey);
    if (cached !== null && cached !== undefined) return cached === ' ' ? '' : cached;
  } catch (cacheErr) {}
  let name = '';
  try {
    const companies = getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Companies');
    const company = companies.find(c => String(c.company_unique_id) === companyId);
    name = company ? String(company.company_name_ar || '') : '';
  } catch (e) {
    return '';
  }
  try { cache.put(cacheKey, name === '' ? ' ' : name, CONFIG.CACHE_GENERAL_SECONDS); } catch (putErr) {}
  return name;
}

/** Canonical SystemLog header order — add new columns to the END only, never insert in the middle. */
const SYSTEM_LOG_HEADERS = [
  'LogID', 'Timestamp', 'CompanyID', 'CompanyName', 'Action',
  'SourceAction', 'RecordID', 'UserEmail', 'ChangedFields',
  'Status', 'ErrorMessage', 'Table', 'Page',
  // Phase 0b instrumentation — appended at the END, per this list's own
  // documented convention. ensureSystemLogSheet_ migrates a live sheet in place
  // by adding only missing headers, so existing rows and columns are untouched.
  'ElapsedMs', 'SheetReads'
];

/**
 * Phase 0b: read actions (get_*, admin_list_*, ping) are classified NO_LOG, so
 * the slowest requests in the system are the ones we cannot see. Setting Script
 * Property PERF_LOG_READS=1 logs them too, for a measurement window.
 *
 * Deliberately OFF by default and property-gated rather than always-on: logging
 * a read appends a SystemLog row, i.e. adds a WRITE to every read, and SystemLog
 * already grows unbounded (F-13). It is a measuring instrument, not a setting to
 * leave on. Memoised per execution.
 */
let _perfLogReads_ = null;

