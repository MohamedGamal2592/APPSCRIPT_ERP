/**
 * 08_Staging.js — one-off helpers for building and verifying a staging copy.
 *
 * NOTHING in this file runs automatically. Every function here is invoked by
 * hand from the Apps Script editor, and none of them writes to a production
 * sheet: they create copies and then edit only the copies.
 *
 * See STAGING_SETUP.md for the full runbook. Short version:
 *   1. run stagingCreateEnvironment()  (from the PRODUCTION project, once)
 *   2. create a new Apps Script project, push the same source to it
 *   3. in the STAGING project set Script Property AUTH_SPREADSHEET_ID to the id
 *      that step 1 printed, and leave MYSQL_USER / MYSQL_PASSWORD unset
 *   4. run stagingVerifyIsolation() in the STAGING project
 */

/** Drive folder that holds the staging copies. Created on first use. */
var STAGING_FOLDER_NAME = 'ERP_STAGING';

/**
 * Copies the AUTH spreadsheet and every company spreadsheet listed in
 * ERP_Companies into a staging folder, then re-points the staging AUTH copy's
 * company_sheet_link column at the staging company copies and clears its
 * sessions. Production is only ever READ.
 *
 * Run this from the PRODUCTION project (it needs read access to production).
 *
 * @return {Object} { ok, stagingAuthId, copies, url }
 */
function stagingCreateEnvironment() {
  var folder = stagingGetFolder_();

  // 1. Copy AUTH.
  var prodAuthId = CONFIG.AUTH_SPREADSHEET_ID;
  var stagingAuth = DriveApp.getFileById(prodAuthId).makeCopy('STAGING_AUTH', folder);
  var stagingAuthId = stagingAuth.getId();

  // 2. Copy each company spreadsheet, remembering prod id -> staging id.
  var idMap = {};
  var copies = [];
  var companies = getAllRecords_(prodAuthId, 'ERP_Companies');
  companies.forEach(function (r) {
    var rawLink = String(r.company_sheet_link || '').trim();
    if (!rawLink) return;
    var m = rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
    var prodId = m ? m[1] : rawLink;
    if (!prodId || idMap[prodId]) return;
    var label = String(r.company_name_en || r.company_unique_id || 'COMPANY').trim();
    var copy = DriveApp.getFileById(prodId).makeCopy('STAGING_' + safeFileNamePart_(label), folder);
    idMap[prodId] = copy.getId();
    copies.push({ company: label, prodId: prodId, stagingId: copy.getId() });
  });

  // 3. Re-point the STAGING AUTH copy at the staging company copies.
  //    This edits the copy only — the production ERP_Companies is untouched.
  var stagingSs = SpreadsheetApp.openById(stagingAuthId);
  var compSheet = stagingSs.getSheetByName('ERP_Companies');
  if (compSheet) {
    var values = compSheet.getDataRange().getValues();
    var headers = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var linkIdx = headers.indexOf('company_sheet_link');
    if (linkIdx !== -1) {
      var changed = false;
      for (var i = 1; i < values.length; i++) {
        var link = String(values[i][linkIdx] || '').trim();
        if (!link) continue;
        var lm = link.match(/\/d\/([a-zA-Z0-9-_]+)/);
        var pid = lm ? lm[1] : link;
        if (idMap[pid]) {
          values[i][linkIdx] = 'https://docs.google.com/spreadsheets/d/' + idMap[pid] + '/edit';
          changed = true;
        }
      }
      if (changed) compSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }
  }

  // 4. Clear staging sessions so nobody is logged in against copied tokens.
  var sessSheet = stagingSs.getSheetByName('ERP_Sessions');
  if (sessSheet && sessSheet.getLastRow() > 1) {
    sessSheet.getRange(2, 1, sessSheet.getLastRow() - 1, sessSheet.getLastColumn()).clearContent();
  }

  return {
    ok: true,
    stagingAuthId: stagingAuthId,
    url: stagingSs.getUrl(),
    copies: copies,
    next: 'Set Script Property AUTH_SPREADSHEET_ID = ' + stagingAuthId + ' in the STAGING project only.'
  };
}

/** Returns (creating if needed) the Drive folder that holds staging copies. */
function stagingGetFolder_() {
  var it = DriveApp.getFoldersByName(STAGING_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(STAGING_FOLDER_NAME);
}

/**
 * Read-only sanity check. Run this in the STAGING project BEFORE trusting it.
 * It reports which spreadsheet ids the running project would actually touch, so
 * a staging project still pointed at production is obvious rather than silent.
 *
 * @return {Object} the resolved ids plus a pass/fail flag
 */
function stagingVerifyIsolation() {
  var PROD_AUTH_ID = '1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM';
  var authId = CONFIG.AUTH_SPREADSHEET_ID;
  var out = {
    resolvedAuthSpreadsheetId: authId,
    isProductionAuth: authId === PROD_AUTH_ID,
    companyTargets: [],
    mysqlConfigured: false
  };
  try {
    getAllRecords_(authId, 'ERP_Companies').forEach(function (r) {
      var rawLink = String(r.company_sheet_link || '').trim();
      var m = rawLink.match(/\/d\/([a-zA-Z0-9-_]+)/);
      out.companyTargets.push({
        company: String(r.company_name_en || r.company_unique_id || ''),
        spreadsheetId: m ? m[1] : rawLink
      });
    });
  } catch (e) { out.companyReadError = e.message; }
  try {
    var props = PropertiesService.getScriptProperties();
    // Checks the legacy key names too — before F-25 was fixed, credentials were
    // looked up under 'appscript_user' / 'YourStrongPassword123!', so testing
    // only MYSQL_USER would report an isolated project that is not isolated.
    out.mysqlConfigured = !!(props.getProperty('MYSQL_USER') || props.getProperty('MYSQL_PASSWORD') ||
                             props.getProperty('appscript_user') || props.getProperty('YourStrongPassword123!'));
  } catch (e) {}
  out.safeForStaging = !out.isProductionAuth && !out.mysqlConfigured;
  out.note = out.safeForStaging
    ? 'OK: this project is pointed at a non-production AUTH spreadsheet and has no MySQL credentials.'
    : 'STOP: this project would write to production data and/or has MySQL credentials set.';
  return out;
}
