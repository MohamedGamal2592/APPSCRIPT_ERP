/**
 * 00_Config.js
 * RESPONSIBILITY: CONFIG constants and the empty mutable COMPANY_REGISTRY = {}.
 * No business logic. Loaded first (numeric prefix + filePushOrder).
 */

const CONFIG = {
  SESSION_EXPIRY_HOURS: 12,
  AUTH_SPREADSHEET_ID: '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM',
  SESSION_SALT: 'erp-salt-2024',
  MAX_CONCURRENT_SESSIONS: 5,
  BACKUP_FOLDER_ID: '',   // <-- SET to a Drive folder ID before running migration batches (batch0_preflight warns if empty)
  CACHE_SESSION_SECONDS: 360,
  CACHE_MATRIX_SECONDS: 120,
  CACHE_THEME_SECONDS: 21600,
  CACHE_LOGO_SECONDS: 21600,
  CACHE_GENERAL_SECONDS: 600,
  CACHE_KILLSWITCH_SECONDS: 15,
  LOGIN_LOCKOUT_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_TTL_SECONDS: 900,
  // TableEngine cache (spec §2.2 Tier B)
  TABLE_CACHE_TTL_SECONDS: 600,
  TABLE_CACHE_MAX_CHUNKS: 50,
  TABLE_CACHE_CHUNK_SIZE: 90000
};

/**
 * Staging switch (Phase 0, Step 2). AUTH_SPREADSHEET_ID is the ONLY hardcoded
 * spreadsheet id in the project — every company database is resolved at runtime
 * from ERP_Companies.company_sheet_link — so redirecting this one value points
 * the whole system at a copied dataset.
 *
 * Resolution order: Script Property 'AUTH_SPREADSHEET_ID', else the literal
 * above. Production therefore needs NO property set: the fallback is the live
 * id, and staging sets the property. That way identical source can be pushed to
 * both projects and a staging id can never be committed into production code.
 *
 * The lookup is memoised per execution, so it costs at most one PropertiesService
 * call per request and only when the id is first used.
 */
(function () {
  var literalAuthId = CONFIG.AUTH_SPREADSHEET_ID;
  var resolved = null;
  Object.defineProperty(CONFIG, 'AUTH_SPREADSHEET_ID', {
    enumerable: true,
    configurable: true,
    get: function () {
      if (resolved === null) {
        resolved = literalAuthId;
        try {
          var override = PropertiesService.getScriptProperties().getProperty('AUTH_SPREADSHEET_ID');
          if (override && String(override).trim()) resolved = String(override).trim();
        } catch (e) { /* properties unavailable — keep the literal */ }
      }
      return resolved;
    }
  });
})();

let COMPANY_REGISTRY = {};

/**
 * Unified system messages — single source of truth (§5.4).
 * Constants only, lives in 00_Config.js. Injected to client via include helper.
 * SYSTEM_OFF must stay byte-identical to the kill-switch message ('عطل في السيستم' used live;
 * spec requires 'عطل في النظام' — we expose both and alias SYSTEM_OFF to the canonical spec string
 * while preserving the live check via check via isSystemEnabled_ string-agnostic flag).
 */
const ERP_MESSAGES = {
  SYSTEM_OFF: 'عطل في النظام',
  SYSTEM_OFF_LEGACY: 'عطل في السيستم',
  NOT_AUTHORIZED: 'غير مصرح لك بالوصول',
  SESSION_EXPIRED: 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى'
};

// Tunable for ERPFlow (§3.8) — minimum overlay lifetime in ms. 300-1000 allowed, default 600.
const ERP_FLOW_MIN_MS = 600;