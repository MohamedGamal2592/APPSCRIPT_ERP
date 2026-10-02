'use strict';

/**
 * ERP_Users / ERP_Companies — the users tab and company colours.
 *
 *   1 company_colors parsing: AppSheet EnumList ("navy , light"), plain lists,
 *     the older "yellow, black" form, unknown values
 *   2 the theme follows the column: a built-in theme gets the colour layer
 *     after it; blank keeps the built-in look; the generic path and the block
 *     gradient read the same column
 *   3 admin_list_users: status is always a real value (blank → Active, as at login)
 *   4 admin_save_company: colours validated and stored in EnumList form
 *   5 the users tab: company shown by its Arabic name, blank status shows «نشط»,
 *     role offers «➕ إضافة جديد» for a value not in the list
 *   6 the company form: two choices that save as "<colour> , <light|dark>"
 *
 * Run: node tools/verify/erp_users_companies.js
 */

const fs = require('fs');
const path = require('path');
const gasstub = require('./gasstub');
const { bootPage } = require('./pageharness');

let failed = 0;
function ok(v, msg, extra) {
  console.log((v ? '  PASS  ' : '  FAIL  ') + msg);
  if (!v) { failed++; if (extra !== undefined) console.log('        ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))); }
}

// every company registry, as deployed (ensureCompaniesRegistered_ refuses a partial set)
const ORDER = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.clasp.json'), 'utf8')).filePushOrder.filter(function (f) { return f !== 'Code.js'; });
const H = gasstub.createHarness({ sources: ORDER });
const C = H.ctx;
const ET = H.eval('ErpTest');
const COMPANIES = [
  { company_unique_id: '37fc50edf1424abd', company_name_ar: 'النظام التجريبي', company_colors: '' },
  { company_unique_id: '9940659bd83035d7', company_name_ar: 'وادي الغذاء', company_colors: 'purple , dark' },
  { company_unique_id: '3fe1b5cb67b7223e', company_name_ar: 'توب كيميكال', company_colors: 'yellow, black' }
];
H.override('themeSystemRowsCompat_', function () { return COMPANIES; });

console.log('\n1 — parsing company_colors\n');
const P = function (v) { return JSON.stringify(C.parseCompanyColors_(v)); };
ok(P('navy , light') === '{"primary":"navy","dark":false}', 'AppSheet EnumList "navy , light"');
ok(P('Navy,Dark') === '{"primary":"navy","dark":true}', 'case and spacing do not matter');
ok(P('dark , teal') === '{"primary":"teal","dark":true}', 'order does not matter for the mode');
ok(P('yellow, black') === '{"primary":"yellow","dark":true}', 'the older "yellow, black" keeps its meaning: yellow on dark');
ok(P('black') === '{"primary":"black","dark":false}', 'a lone "black" is a black brand on light');
ok(P('pink') === 'null' && P('') === 'null' && P(null) === 'null', 'an unknown or blank value names no colour');
ok(C.normalizeCompanyColors_('Blue,dark') === 'blue , dark' && C.normalizeCompanyColors_('green') === 'green , light' && C.normalizeCompanyColors_('pink') === '',
  'normalized to AppSheet EnumList form');

console.log('\n2 — the theme follows the column\n');
const builtIn = ET.themeCss_();
const etBlank = C.getCompanyThemeCSS_('37fc50edf1424abd');
ok(etBlank === builtIn, 'blank column: ErpTest keeps exactly its built-in theme');
COMPANIES[0].company_colors = 'teal , light';
H.cacheStore.clear();
const etTeal = C.getCompanyThemeCSS_('37fc50edf1424abd');
ok(etTeal.indexOf(builtIn) === 0 && etTeal.indexOf('--brand-primary: #0F766E') > builtIn.length, 'teal: the built-in theme, then the colour layer after it (later rules win)');
ok(/\.topbar \{ background: var\(--brand-primary\)/.test(etTeal.slice(builtIn.length)), 'the layer restates the topbar in tokens, replacing the built-in hard-coded navy');
ok(etTeal.slice(builtIn.length).indexOf('--bg-canvas') === -1, 'light mode leaves the canvas alone');
COMPANIES[0].company_colors = 'teal , dark';
H.cacheStore.clear();
ok(C.getCompanyThemeCSS_('37fc50edf1424abd').indexOf('--bg-canvas: #0F172A') !== -1, 'dark mode sets the dark canvas');
// cached on version_companies: a new value shows after the version moves
COMPANIES[0].company_colors = 'red , light';
ok(C.getCompanyThemeCSS_('37fc50edf1424abd').indexOf('#0F766E') !== -1, 'the layer is cached until ERP_Companies changes…');
C.bumpVersion_('ERP_Companies');
ok(C.getCompanyThemeCSS_('37fc50edf1424abd').indexOf('--brand-primary: #D62828') !== -1, '…and a company save (version bump) picks up the new colour');
const vf = C.getCompanyThemeCSS_('9940659bd83035d7');
ok(vf.indexOf('--brand-primary: #7C3AED') !== -1 && vf.indexOf('--bg-canvas: #0F172A') !== -1, 'generic path (ValleyFoods): purple on dark from the column');
ok(JSON.stringify(C.getCompanyBlockTheme_('9940659bd83035d7')) === '{"from":"#4c1d95","to":"#7c3aed"}', 'block page gradient from the column');
COMPANIES[0].company_colors = '';
ok(JSON.stringify(C.getCompanyBlockTheme_('37fc50edf1424abd')) === JSON.stringify(ET.blockTheme_()), 'blank column: the built-in block gradient');

console.log('\n3 — admin_list_users: status is a real value\n');
H.override('requireSuperAdmin_', function () {});
H.override('getAllRecords_', function (db, table) {
  if (table === 'ERP_Users') return [
    { name: 'A', email: 'a@x', role: 'Valley HR Personnel', company: '9940659bd83035d7' },
    { name: 'B', email: 'b@x', role: 'Top Chemical Warehouse', company: '3fe1b5cb67b7223e', status: 'InActive' },
    { name: 'C', email: 'c@x', role: 'X', company: '37fc50edf1424abd', status: 'active' }
  ];
  if (table === 'ERP_Companies') return COMPANIES;
  return [];
});
const lu = C.adminListUsers_({}, '', { isSuperAdmin: true });
ok(lu.users.map(function (u) { return u.status; }).join(',') === 'Active,InActive,Active', 'blank → Active, InActive kept, "active" → Active', lu.users.map(function (u) { return u.status; }));
ok(lu.company_options.some(function (c) { return c.value === '9940659bd83035d7' && c.label === 'وادي الغذاء'; }), 'company options carry company_name_ar');

console.log('\n4 — admin_save_company: colours validated, stored as an EnumList\n');
let saved = null;
H.override('systemFindByBusinessKey_', function () { return { _meta: { documentId: 'd1', updateTime: 't' } }; });
H.override('systemPatchRecord_', function (t, id, fields) { saved = fields; return {}; });
C.adminSaveCompany_({ company_unique_id: 'abc', company_name_ar: 'ش', company_colors: 'Navy,dark' }, '', { isSuperAdmin: true });
ok(saved && saved.company_colors === 'navy , dark', 'saved as "navy , dark"', saved && saved.company_colors);
C.adminSaveCompany_({ company_unique_id: 'abc', company_name_ar: 'ش', company_colors: '' }, '', { isSuperAdmin: true });
ok(saved.company_colors === '', 'blank stays blank (built-in theme)');
let err = '';
try { C.adminSaveCompany_({ company_unique_id: 'abc', company_name_ar: 'ش', company_colors: 'pink' }, '', { isSuperAdmin: true }); } catch (e) { err = String(e.message); }
ok(err.indexOf('ألوان الشركة غير معروفة') !== -1, 'an unknown colour is refused');
const lc = (function () { H.override('getAllRecords_', function () { return COMPANIES; }); return C.adminListCompanies_({}, '', { isSuperAdmin: true }); })();
ok(lc.color_options.colors.length === 10 && lc.color_options.modes.map(function (m) { return m.value; }).join() === 'light,dark', 'admin_list_companies sends the 10 colours and the 2 modes');

console.log('\n5 — the users tab\n');
let sb = null, bootErr = '';
try {
  sb = bootPage({ page: '0_ERP_Management.html', isSuperAdmin: true, containers: ['tab-body', 'admin-root'],
    call: function (action) {
      if (action === 'admin_list_users') return lu;
      if (action === 'admin_list_companies') return lc;
      return { status: 'success' };
    } });
} catch (e) { bootErr = String(e && e.stack || e); }
ok(!!sb, 'the management page loads under the harness', bootErr.split('\n')[0]);
if (sb) {
  sb.__companyOptions = lu.company_options;
  sb.__roleOptions = lu.role_options;
  sb.renderUsers(lu.users);
  const t = sb.__tables[sb.__tables.length - 1];
  const row = function (email) { return t.opts.rows.find(function (r) { return r.email === email; }); };
  ok(row('a@x').company === 'وادي الغذاء' && row('b@x').company === 'توب كيميكال', 'company column shows company_name_ar, not the id');
  ok(row('a@x').status.indexOf('نشط') !== -1 && row('b@x').status.indexOf('معطّل') !== -1, 'blank status shows «نشط»; InActive shows «معطّل»');
  sb.openUserModal('a@x');
  const modalHtml = String((sb.document.getElementById('user-modal') || {}).innerHTML || '');
  ok(modalHtml.indexOf('value="Active" selected') !== -1, 'the edit form preselects «نشط» for a blank status');
  ok(modalHtml.indexOf('اكتب دوراً جديداً') !== -1 && modalHtml.indexOf('data-allownew="1"') !== -1, 'role accepts a new value and says so');
  // the shared combo: typing a role not in the list offers «إضافة جديد»
  const list = sb.document.getElementById('role_list');
  const appended = [];
  list.querySelector = function (sel) { return sel === '[data-new]' ? (appended[0] || null) : null; };
  list.appendChild = function (c) { appended.push(c); return c; };
  sb.UIC.comboFilter('role', 'Valley Storekeeper');
  ok(appended.length === 1 && appended[0].style.display === '' && /إضافة جديد: «Valley Storekeeper»/.test(appended[0].textContent), 'typing an unknown role shows «➕ إضافة جديد: …»');
  sb.UIC.comboFilter('role', 'Valley HR Personnel');
  ok(appended[0].style.display === 'none', 'an existing role hides the add row');

  console.log('\n6 — the company form\n');
  sb.__colorOptions = lc.color_options;
  sb.openCompanyModal({ company_unique_id: 'x1', company_name_ar: 'ش', company_colors: 'yellow, black', enabled: 'TRUE' });
  const cm = String((sb.document.getElementById('company-modal') || {}).innerHTML || '');
  ok(cm.indexOf('<option value="yellow" selected>') !== -1 && cm.indexOf('<option value="dark" selected>') !== -1, 'the older "yellow, black" opens as yellow + dark');
  let sent = null;
  sb.API.call = function (a, d) { sent = d; return Promise.resolve({ status: 'success' }); };
  sb.UIC.collectForm = function () { return { company_name_ar: 'ش', company_color_primary: 'navy', company_color_mode: 'light' }; };
  sb.UIC.validateForm = function () { return true; };
  sb.document.getElementById('company_color_primary').value = 'navy';
  sb.document.getElementById('company_color_mode').value = 'light';
  sb.document.getElementById('enabled').value = 'TRUE';
  sb.saveCompany();
  ok(sent && sent.company_colors === 'navy , light' && sent.company_color_primary === undefined, 'saves company_colors = "navy , light"', sent);
  sb.document.getElementById('company_color_primary').value = '';
  sb.saveCompany();
  ok(sent.company_colors === '', 'choosing «الافتراضي» clears the column');
}

console.log('\n7 — backfillUserStatus(): status becomes a physical column / field\n');
{
  const workbookStub = require('./vf_workbook_stub');
  const wb = workbookStub.createWorkbookStub();
  const H2 = gasstub.createHarness({ workbook: wb, sources: ORDER });
  const AUTH = H2.eval('CONFIG').AUTH_SPREADSHEET_ID;
  wb.createSpreadsheet(AUTH, []);
  wb.openById(AUTH).addSheet('ERP_Users').__setRows([
    ['id', 'name', 'email', 'role', 'company'],
    [1, 'A', 'a@x', 'R', 'c1'],
    [2, 'B', 'b@x', 'R', 'c1'],
    [3, '', '', '', '']            // a cleared row stays empty
  ]);
  const docs = [
    { data: { email: 'a@x' }, meta: { documentId: 'u1', updateTime: 't1' } },
    { data: { email: 'b@x', status: 'InActive' }, meta: { documentId: 'u2', updateTime: 't2' } }
  ];
  const patched = [];
  H2.override('systemStorageTarget_', function () { return { backend: 'firestore' }; });
  H2.override('systemStore_', function () { return { queryAll: function () { return { records: docs }; } }; });
  H2.override('systemPatchRecord_', function (t, id, ch) { patched.push([t, id, ch.status]); return {}; });
  const r = H2.ctx.backfillUserStatus();
  const v = wb.openById(AUTH).getSheetByName('ERP_Users').getDataRange().getValues();
  ok(r.columnAdded === true && v[0][5] === 'status', 'the ERP_Users sheet gets a status column', v[0]);
  ok(v[1][5] === 'Active' && v[2][5] === 'Active' && v[3][5] === '' && r.sheetFilled === 2, 'blank cells of real users become Active; the empty row is left alone', v.map(function (x) { return x[5]; }));
  ok(patched.length === 1 && patched[0][1] === 'u1' && patched[0][2] === 'Active', 'Firestore: only the user document with no status is patched (InActive untouched)', patched);
  const again = H2.ctx.backfillUserStatus();
  ok(again.columnAdded === false && again.sheetFilled === 0, 'running it again changes nothing');
}

console.log('\n' + (failed ? failed + ' users/companies check(s) FAILED.' : 'users / company colours pass.') + '\n');
process.exit(failed ? 1 : 0);
