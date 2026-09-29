/**
 * 00_Config.js
 * RESPONSIBILITY: CONFIG constants and the empty mutable COMPANY_REGISTRY = {}.
 * No business logic. Loaded first (numeric prefix + filePushOrder).
 */

const CONFIG = {
  SESSION_EXPIRY_HOURS: 12,
  AUTH_SPREADSHEET_ID: '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM',
  // System data is Firestore-backed in the release build. The project/database
  // and environment are Script Properties, never client configuration.
  SYSTEM_STORAGE_BACKEND: 'firestore',
  // Bootstrap only the linked production script. A copied or staging script
  // has a different ID and must configure FIRESTORE_PROJECT_ID explicitly.
  FIRESTORE_PROJECT_IDS_BY_SCRIPT: {
    '1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM': 'erp-project-3cae0'
  },
  FIRESTORE_DATABASE_ID: '(default)',
  ERP_ENVIRONMENT: 'production',
  SESSION_SALT: 'erp-salt-2024',
  MAX_CONCURRENT_SESSIONS: 5,
  BACKUP_FOLDER_ID: '',   // <-- SET to a Drive folder ID before running migration batches (batch0_preflight warns if empty)
  CACHE_SESSION_SECONDS: 360,
  // Authority caches are invalidated by the authority GENERATION (see
  // authGeneration_ in 02_DataAccess.js), not by expiry. These TTLs are now only
  // an upper bound on how long a generation's payload may occupy the cache.
  // Shortening them does NOT make the system fresher — it only adds sheet reads.
  CACHE_MATRIX_SECONDS: 21600,       // was 120
  CACHE_THEME_SECONDS: 21600,
  CACHE_LOGO_SECONDS: 21600,
  CACHE_GENERAL_SECONDS: 600,
  CACHE_KILLSWITCH_SECONDS: 21600,   // was 15
  // The user directory (email -> name/role/company/status) is keyed by the
  // generation too; an admin saving a user bumps it, so this TTL is a ceiling
  // on cache occupancy, not the freshness mechanism.
  CACHE_USER_DIR_SECONDS: 21600,

  // Worst-case staleness when NOTHING bumps the generation — i.e. a direct edit
  // in the AUTH spreadsheet made while the installable onEdit trigger is missing
  // or broken. Folded into the generation as a time bucket, so it is a hard
  // ceiling and not a hope. START AT 300. Raise to 3600 only after the owner has
  // confirmed the onAuthSheetEdit trigger is installed and firing.
  AUTH_STALENESS_CEILING_SECONDS: 300,

  // A kill-switch read that FAILED must never earn the long TTL — caching a
  // fail-open default for six hours would hide a real shutdown.
  CACHE_AUTH_FAILREAD_SECONDS: 15,
  // F-07: how often a session's last_activity is written back to ERP_Sessions.
  // Each write is a full read + full-row write of the shared AUTH spreadsheet,
  // per active user, so at 30s it was a hot spot under concurrent load.
  // last_activity is a soft "last seen" field; 5-minute staleness is harmless.
  SESSION_TOUCH_THROTTLE_SECONDS: 300,
  LOGIN_LOCKOUT_MAX_ATTEMPTS: 5,
  LOGIN_LOCKOUT_TTL_SECONDS: 900,
  // ── Retention (Phase 5, F-12 / F-13) ──────────────────────────────────────
  // How many months of ERP_Record_History and SystemLog stay in the LIVE tab.
  // Older rows move to dated archive tabs in the same spreadsheet — same columns,
  // nothing is deleted. THIS IS THE ONLY PLACE THE PERIOD IS DEFINED.
  //
  // *** 24 IS AN ASSUMPTION, NOT A DECISION. *** The retention period is an
  // audit/business question (Q2 in the investigation) that was never answered.
  // Change this one number if 24 months is wrong; nothing else needs editing.
  ARCHIVE_RETENTION_MONTHS: 24,
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
