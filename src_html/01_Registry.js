/**
 * 01_Registry.js
 * RESPONSIBILITY: registerCompany_(key, config) — the ONE function that populates
 * COMPANY_REGISTRY, plus getAllPages_() used by the router.
 * No business logic. Loaded second.
 */

let _companiesInitialized_ = false;

function ensureCompaniesRegistered_() {
  if (_companiesInitialized_) return;
  _companiesInitialized_ = true;
  // MANUAL STEP: every new company (Company_*_Registry.js) MUST be added here.
  // registerValleyFoods_(), etc. as they are built —
  // forgetting this is the classic "registered company missing" bug.
  registerTopLight_();
  registerTopChemical_();
  registerValleyFoods_();
}

function registerCompany_(key, config) {
  if (COMPANY_REGISTRY[key]) throw new Error('Duplicate company registration: ' + key);
  if (!config.dispatch || typeof config.dispatch !== 'function') {
    throw new Error('Company "' + key + '" must provide a dispatch function');
  }
  COMPANY_REGISTRY[key] = config;
}

function getAllPages_() {
  const base = [
    { action: 'login', template: '0_ERPlogin', title: 'Login', public: true },
    { action: 'setup', template: '0_ERPsetup', title: 'Setup Password', public: true },
    { action: 'ERPDashboard', template: '0_ERPDashboard', title: 'Dashboard' },
    { action: 'ERP_Management', template: '0_ERP_Management', title: 'System Admin' },
    { action: 'user_sessions', template: 'User_Sessions', title: 'جلساتي' },
    { action: 'user_views', template: 'User_Views', title: 'العروض المحفوظة' },
    { action: 'record_history', template: 'Record_History_Panel', title: 'السجل' },
    { action: 'db_live_viewer', template: 'DbLive_Viewer', title: 'MySQL Database' }
  ];
  return base.concat(Object.values(COMPANY_REGISTRY).flatMap(c => c.pages));
}