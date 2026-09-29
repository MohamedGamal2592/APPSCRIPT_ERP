/**
 * S16 verification — the authority generation: kill switch, matrix and role are
 * one-refresh real-time.
 *
 *   node tools/verify/s16_realtime_authority.js
 *
 * Offline, over the real source. No network, no spreadsheet, no Google service,
 * no trigger, no Script Property on anyone's account.
 *
 * The change this file guards is about cache SEMANTICS, so grep assertions
 * alone would not be worth much: source text cannot prove that an invalidation
 * actually invalidates. Assertions 1-14 therefore EXECUTE the real
 * authGeneration_, bumpAuthGeneration_, bumpVersion_, userDirectory_,
 * userNameMap_, isSystemEnabled_, getRoleAuthorityMatrix_ and
 * authenticateSystemUser_ inside tools/verify/gasstub.js, against a CacheService
 * and a PropertiesService whose clock, evictions and failures are controllable.
 *
 * Assertions 15-19 are source checks for the cheap regressions behaviour cannot
 * catch — a future TTL cut, a dropped memo reset, a missing trigger install.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createHarness } = require('./gasstub.js');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let failed = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg);
  if (!cond) failed++;
}
function section(t) { console.log('\n' + t); }

const T0 = 1700000000000;          // an arbitrary fixed clock
const MATRIX_HEADERS = ['role', 'page_id', 'access_type', 'status'];
const MATRIX_ROWS = [
  ['Manager', 'vf_sales', 'full', 'Active'],
  ['Clerk', 'vf_cash', 'read', 'Active']
];

/* A fresh harness per group, so one group's clock or cache cannot leak into
 * the next and quietly satisfy an assertion. */
function harness(extra) {
  const H = createHarness({ now: T0 });
  H.matrix = { headers: MATRIX_HEADERS.slice(), rows: MATRIX_ROWS.map(r => r.slice()) };
  if (extra) extra(H);
  return H;
}

/* ────────────────────────────────────────────────────────────────────────────
 * BEHAVIOURAL — these actually run the project's code
 * ──────────────────────────────────────────────────────────────────────── */

section('1. The one-refresh property — a bump changes the key for everyone at once');
{
  const H = harness();

  /* Two independent "users" = two executions against the same script-global
   * cache and properties, which is exactly what executeAs USER_DEPLOYING gives. */
  H.newExecution(); const userA1 = H.call('authGeneration_');
  H.newExecution(); const userB1 = H.call('authGeneration_');
  ok(userA1 === userB1, 'two users in the same generation compute an IDENTICAL key (' + userA1 + ')');

  const mxA1 = 'mx_g' + userA1 + '_manager';
  H.advance(1000);
  H.newExecution();
  H.call('bumpAuthGeneration_');

  H.newExecution(); const userA2 = H.call('authGeneration_');
  H.newExecution(); const userB2 = H.call('authGeneration_');
  ok(userA2 === userB2, 'after the bump both users still agree with each other');
  ok(userA2 !== userA1, 'after the bump the generation CHANGED for user A');
  ok(userB2 !== userB1, 'after the bump the generation CHANGED for user B');
  ok(('mx_g' + userA2 + '_manager') !== mxA1, 'so every derived authority cache key changes — one refresh, no logout');
}

section('2. bumpVersion_ bumps the generation for authority sheets and for nothing else');
{
  const AUTHORITY = ['ERP_Users', 'ERP_Pages_Matrix', 'ERP_Information', 'ERP_system_work'];
  AUTHORITY.forEach(function (sheet) {
    const H = harness();
    H.newExecution(); const before = H.call('authGeneration_');
    H.advance(1000);
    H.newExecution(); H.call('bumpVersion_', sheet);
    H.newExecution(); const after = H.call('authGeneration_');
    ok(after !== before, "bumpVersion_('" + sheet + "') changes the authority key");
  });

  ['ERP_Companies', 'ERP_Sessions', 'ERP_Something_Else'].forEach(function (sheet) {
    const H = harness();
    H.newExecution(); const before = H.call('authGeneration_');
    H.advance(1000);
    H.newExecution(); H.call('bumpVersion_', sheet);
    H.newExecution(); const after = H.call('authGeneration_');
    ok(after === before, "bumpVersion_('" + sheet + "') does NOT change it");
  });

  /* The hook is additive: the per-sheet version keys still exist, because
   * version_companies has three live consumers outside this run's scope. */
  const H2 = harness();
  H2.newExecution(); H2.call('bumpVersion_', 'ERP_Companies');
  ok(H2.rawGet('version_companies') !== null, 'version_companies is still written — the hook is additive, not a replacement');
  H2.newExecution(); H2.call('bumpVersion_', 'ERP_Pages_Matrix');
  ok(H2.rawGet('version_matrix') !== null, 'version_matrix is still written too');
}

section('3. The stamp is DURABLE — a cache eviction does not reset the generation');
{
  const H = harness();
  H.setProp('erp_gen', '12345');            // seeded, not written by the code
  H.newExecution();
  const g1 = H.call('authGeneration_');
  ok(g1.indexOf('12345.') === 0, 'the durable Properties stamp is the base of the generation (' + g1 + ')');
  ok(H.rawGet('erp_gen') === '12345', 'and it is mirrored into the cache for the steady-state path');
  ok(H.ttlOf('erp_gen') === 21600, 'the mirror is written at the 21600s maximum');

  H.evict('erp_gen');                        // simulate a CacheService eviction
  H.newExecution();
  const g2 = H.call('authGeneration_');
  ok(g2 === g1, 'after eviction it falls back to Properties and returns the SAME generation, not 0');
}

section("4. A deployment with nothing set bootstraps at '0' and never writes Properties");
{
  const H = harness();                       // no property, no cache entry
  let threw = null;
  let g = null;
  try { H.newExecution(); g = H.call('authGeneration_'); } catch (e) { threw = e; }
  ok(threw === null, 'authGeneration_ does not throw when nothing is set');
  ok(g !== null && g.indexOf('0.') === 0, "it returns the '0' base (" + g + ')');
  ok(H.propWrites === 0, 'and it performed ZERO Properties writes — hard constraint 3');

  H.newExecution(); H.call('isSystemEnabled_');
  H.newExecution(); H.call('getRoleAuthorityMatrix_', 'Manager');
  H.newExecution(); H.call('userDirectory_');
  ok(H.propWrites === 0, 'no authority READ path writes Properties either');
}

section('5. A failed durable write degrades to a 60s mirror, not a 6h one');
{
  const H = harness();
  H.newExecution(); const before = H.call('authGeneration_');
  H.advance(1000);
  H.failNextSet();
  H.newExecution();
  H.call('bumpAuthGeneration_');
  ok(H.propWrites === 0, 'the Properties write really did fail');
  H.newExecution(); const after = H.call('authGeneration_');
  ok(after !== before, 'bumpAuthGeneration_ still bumps — the cache mirror carries it');
  ok(H.ttlOf('erp_gen') === 60, 'and the mirror TTL is 60, NOT 21600, so an eviction cannot strand readers for six hours');

  const H2 = harness();
  H2.newExecution(); H2.call('bumpAuthGeneration_');
  ok(H2.ttlOf('erp_gen') === 21600, 'when the durable write succeeds the mirror gets the full 21600');
  ok(H2.propWrites === 1, 'and Properties was written exactly once — before the cache');
}

section('6. The staleness ceiling — the key rolls over with NO bump at all');
{
  const H = harness();
  const ceil = H.config().AUTH_STALENESS_CEILING_SECONDS;
  H.newExecution(); const g1 = H.call('authGeneration_');
  H.advance(1000);
  H.newExecution(); const gSame = H.call('authGeneration_');
  ok(gSame === g1, 'a second inside the bucket, nothing changes');

  H.advance(ceil * 1000);                    // cross the boundary
  H.newExecution(); const g2 = H.call('authGeneration_');
  ok(g2 !== g1, 'past a ' + ceil + 's boundary the generation changes with no bump — the trigger is NOT load-bearing');
  ok(g2.split('.')[0] === g1.split('.')[0], 'and it is the time bucket that moved, not the durable base');
}

section('7. The kill switch reads the sheet once per generation, and a bump refreshes it');
{
  const H = harness();
  H.killFlag = 0;
  H.newExecution();
  ok(H.call('isSystemEnabled_') === false, 'B2 = 0 -> the system is DISABLED');
  ok(H.reads.b2 === 1, 'one B2 read');

  H.killFlag = 1;                            // flipped in the sheet, no bump
  H.advance(1000);
  H.newExecution();
  ok(H.call('isSystemEnabled_') === false, 'no bump, inside the TTL -> still false, proving the value is genuinely CACHED');
  ok(H.reads.b2 === 1, 'and no second sheet read happened');

  H.advance(1000);
  H.newExecution(); H.call('bumpVersion_', 'ERP_system_work');
  H.newExecution();
  ok(H.call('isSystemEnabled_') === true, 'after the bump the very next request sees the new flag — one refresh');
  ok(H.reads.b2 === 2, 'exactly one further sheet read, at the new generation');

  H.newExecution();
  const g = H.call('authGeneration_');
  ok(H.ttlOf('ks_g' + g) === H.config().CACHE_KILLSWITCH_SECONDS,
    'a SUCCESSFUL read is cached for CACHE_KILLSWITCH_SECONDS (' + H.config().CACHE_KILLSWITCH_SECONDS + ')');

  /* The memo-and-toggle collision: apiRouter_ calls isSystemEnabled_ before the
   * handler, so _ksMemo_ is already set when toggleKillSwitch_ flips the flag
   * inside that SAME execution. bumpAuthGeneration_ must clear it. */
  const H2 = harness();
  H2.killFlag = 1;
  H2.newExecution();
  ok(H2.call('isSystemEnabled_') === true, 'gate runs first and memoises "enabled"');
  H2.killFlag = 0;                           // the handler writes B2 = 0 ...
  H2.advance(1000);
  H2.call('bumpVersion_', 'ERP_system_work');   // ... and bumps, same execution
  ok(H2.call('isSystemEnabled_') === false, 'the bump cleared _ksMemo_ inside the same execution');
}

section('8. A kill-switch read that FAILED never earns the long TTL');
{
  const H = harness();
  H.ensureThrows = true;
  H.newExecution();
  ok(H.call('isSystemEnabled_') === true, 'an unreadable sheet fails OPEN — the system stays up');
  const g = H.call('authGeneration_');
  ok(H.ttlOf('ks_g' + g) === H.config().CACHE_AUTH_FAILREAD_SECONDS,
    'and the fail-open default is cached for CACHE_AUTH_FAILREAD_SECONDS (' + H.config().CACHE_AUTH_FAILREAD_SECONDS + '), not ' + H.config().CACHE_KILLSWITCH_SECONDS);
  ok(H.ttlOf('ks_g' + g) !== H.config().CACHE_KILLSWITCH_SECONDS,
    'caching a fail-open default for six hours would hide a real shutdown');

  /* readSystemWorkFlag_ throwing must take the same branch. */
  const H2 = harness();
  H2.killFlag = 'throw';
  H2.newExecution();
  ok(H2.call('isSystemEnabled_') === true, 'a throwing B2 read also fails open');
  ok(H2.ttlOf('ks_g' + H2.call('authGeneration_')) === H2.config().CACHE_AUTH_FAILREAD_SECONDS,
    'and also gets the short TTL');
}

section('9. The matrix fails CLOSED and the failure is never cached');
{
  const H = harness();
  H.matrix = { headers: ['page_id', 'access_type'], rows: [['vf_sales', 'full']] };   // no `role` column
  H.newExecution();
  const m = H.call('getRoleAuthorityMatrix_', 'Manager');
  ok(JSON.stringify(m) === '{}', 'a sheet missing role/page_id returns {} — fail CLOSED');
  ok(H.cacheKeys().filter(k => k.indexOf('mx_g') === 0).length === 0,
    'and NOTHING was cached: an empty grant set must never earn the 6h TTL');

  const H2 = harness();
  H2.ctx.getSheet_ = function () { throw new Error('stub: matrix read failed'); };
  H2.newExecution();
  ok(JSON.stringify(H2.call('getRoleAuthorityMatrix_', 'Manager')) === '{}', 'a read failure also returns {}');
  ok(H2.cacheKeys().filter(k => k.indexOf('mx_g') === 0).length === 0, 'and is also left uncached');

  /* The healthy path, by contrast, IS cached and IS generation-keyed. */
  const H3 = harness();
  H3.newExecution();
  const grants = H3.call('getRoleAuthorityMatrix_', 'Manager');
  ok(grants && grants.vf_sales && grants.vf_sales.indexOf('full') !== -1, 'a healthy matrix still yields the role grants');
  const key = 'mx_g' + H3.call('authGeneration_') + '_manager';
  ok(H3.rawGet(key) !== null, 'the healthy result is cached under ' + key);
  ok(H3.ttlOf(key) === H3.config().CACHE_MATRIX_SECONDS, 'at CACHE_MATRIX_SECONDS (' + H3.config().CACHE_MATRIX_SECONDS + ')');
  H3.advance(1000);
  H3.newExecution(); H3.call('bumpVersion_', 'ERP_Pages_Matrix');
  H3.newExecution();
  ok(('mx_g' + H3.call('authGeneration_') + '_manager') !== key, 'and a matrix bump moves the key, so the next request rebuilds');
}

section('10-13. The live identity overlay — role, company and status are real-time');
function sessionFixture() {
  return { valid: true, email: 'a@x.com', name: 'Session Name', role: 'Clerk', company: 'OldCo', expires: T0 + 3600000 };
}

/* 10 — the DIRECTORY role, not the session role, decides authority. */
{
  const H = harness();
  H.companies = [{ company_unique_id: 'NewCo', company_name_ar: 'NewCo', company_name_en: 'NewCo', company_sheet_link: 'new-db', enabled: true }];
  H.users = [{ email: 'a@x.com', name: 'Real Name', role: 'Manager', company: 'NewCo', status: 'Active' }];
  H.setSession(sessionFixture());
  const seen = [];
  const realMatrix = H.ctx.getRoleAuthorityMatrix_;
  H.override('getRoleAuthorityMatrix_', function (r) { seen.push(r); return realMatrix(r); });

  H.newExecution();
  const auth = H.call('authenticateSystemUser_', 'tok');
  ok(auth.authorized === true, 'an Active user in the directory is authorized');
  ok(seen.length === 1 && seen[0] === 'Manager',
    "the DIRECTORY role reached getRoleAuthorityMatrix_ (got " + JSON.stringify(seen[0]) + '), not the session role "Clerk"');
  ok(auth.user.role === 'Manager', 'the returned user carries the live role');
  ok(auth.user.company === 'NewCo' && auth.user.companyId === 'NewCo', 'and the live company, on both fields');
  ok(auth.user.name === 'Real Name', 'and the live name');
  ok(auth.user.authorizedPages.vf_sales && !auth.user.authorizedPages.vf_cash,
    "so the grants are the Manager's, not the Clerk's — a role change bites on the next request");
  ok(auth.user.email === 'a@x.com' && auth.user.expires === T0 + 3600000,
    'email and expires still come from the session — the response shape is unchanged');
}

/* 10b — a live role of Super Admin is honoured immediately. */
{
  const H = harness();
  H.companies = [{ company_unique_id: 'VF', company_name_ar: 'VF', company_name_en: 'VF', company_sheet_link: 'vf-db', enabled: true }];
  H.users = [{ email: 'a@x.com', name: 'N', role: 'Super Admin', company: 'VF', status: 'Active' }];
  H.setSession(sessionFixture());
  H.newExecution();
  const auth = H.call('authenticateSystemUser_', 'tok');
  ok(auth.user.isSuperAdmin === true && JSON.stringify(auth.user.authorizedPages) === '["*"]',
    'a promotion to Super Admin is live too — isSuperAdmin is computed from the directory role');
}

/* 11 — an EMPTY directory fails OPEN. */
{
  const H = harness();
  H.companies = [{ company_unique_id: 'OldCo', company_name_ar: 'OldCo', company_name_en: 'OldCo', company_sheet_link: 'old-db', enabled: true }];
  H.users = [];                              // indistinguishable from a read failure
  H.setSession(sessionFixture());
  const seen = [];
  const realMatrix = H.ctx.getRoleAuthorityMatrix_;
  H.override('getRoleAuthorityMatrix_', function (r) { seen.push(r); return realMatrix(r); });

  H.newExecution();
  const auth = H.call('authenticateSystemUser_', 'tok');
  ok(auth.authorized === true, 'an empty directory FAILS OPEN — it must not log every user out at once');
  ok(seen[0] === 'Clerk' && auth.user.role === 'Clerk', 'and falls back to the session role');
  ok(auth.user.company === 'OldCo', 'and the session company');
}

/* 11b — a directory read that THREW is the same case as an empty one. */
{
  const H = harness();
  H.companies = [{ company_unique_id: 'OldCo', company_name_ar: 'OldCo', company_name_en: 'OldCo', company_sheet_link: 'old-db', enabled: true }];
  H.override('getAllRecords_', function () { throw new Error('stub: ERP_Users read failed'); });
  H.setSession(sessionFixture());
  H.newExecution();
  const auth = H.call('authenticateSystemUser_', 'tok');
  ok(auth.authorized === true && auth.user.role === 'Clerk', 'a THROWN directory read also fails open on the session role');
}

/* 12 — a POPULATED directory that lacks the email fails CLOSED. */
{
  const H = harness();
  H.companies = [{ company_unique_id: 'NewCo', company_name_ar: 'NewCo', company_name_en: 'NewCo', company_sheet_link: 'new-db', enabled: true }];
  H.users = [{ email: 'someone.else@x.com', name: 'Other', role: 'Manager', company: 'NewCo', status: 'Active' }];
  H.setSession(sessionFixture());
  H.newExecution();
  const auth = H.call('authenticateSystemUser_', 'tok');
  ok(auth.authorized === false, 'a populated directory without this email FAILS CLOSED');
  ok(auth.code === 'ACCOUNT_REMOVED', "and reports ACCOUNT_REMOVED (got " + JSON.stringify(auth.code) + ')');
  ok(auth.status === 'error' && auth.user === undefined, 'the shape is the existing unauthorized shape — no user object leaks');
}

/* 13 — present but not Active fails CLOSED. */
{
  ['InActive', 'inactive', 'Suspended', ''].forEach(function (st) {
    const H = harness();
    H.users = [{ email: 'a@x.com', name: 'N', role: 'Manager', company: 'NewCo', status: st }];
    H.setSession(sessionFixture());
    H.newExecution();
    const auth = H.call('authenticateSystemUser_', 'tok');
    if (st === '') {
      /* An empty status column defaults to Active — the directory builder's
       * documented behaviour, and what an unfilled sheet cell means today. */
      ok(auth.authorized === true, 'an EMPTY status defaults to Active and stays authorized');
    } else {
      ok(auth.authorized === false && auth.code === 'ACCOUNT_DISABLED',
        'status ' + JSON.stringify(st) + ' -> not authorized, ACCOUNT_DISABLED');
    }
  });

  /* And a deactivation is one-refresh: authorized now, bump, denied next. */
  const H = harness();
  H.users = [{ email: 'a@x.com', name: 'N', role: 'Manager', company: 'NewCo', status: 'Active' }];
  H.setSession(sessionFixture());
  H.newExecution();
  ok(H.call('authenticateSystemUser_', 'tok').authorized === true, 'active user authorized');
  H.users = [{ email: 'a@x.com', name: 'N', role: 'Manager', company: 'NewCo', status: 'InActive' }];
  H.advance(1000);
  H.newExecution(); H.call('bumpVersion_', 'ERP_Users');
  H.newExecution();
  const after = H.call('authenticateSystemUser_', 'tok');
  ok(after.authorized === false && after.code === 'ACCOUNT_DISABLED',
    'after the ERP_Users bump the very NEXT request is denied — no 12-hour wait');
}

section('14. userNameMap_ keeps its exact public contract (consumed at Code.js:110)');
{
  const H = harness();
  H.users = [
    { email: 'A@X.com', name: 'Ann', role: 'Manager', company: 'VF', status: 'Active' },
    { email: 'b@x.com', name: '', role: 'Clerk', company: 'VF', status: 'Active' },
    { email: '', name: 'Nobody', role: 'Clerk', company: 'VF', status: 'Active' },
    { email: 'c@x.com', name: 'Carl', role: 'Clerk', company: 'VF', status: 'InActive' }
  ];
  H.newExecution();
  const names = H.call('userNameMap_');
  ok(typeof names === 'object' && names !== null && !Array.isArray(names), 'it still returns a flat object');
  ok(names['a@x.com'] === 'Ann', 'keyed by the LOWERCASED email, valued by the display name');
  ok(names['b@x.com'] === undefined, 'a user with no name is omitted, exactly as before');
  ok(names[''] === undefined, 'a row with no email is omitted, exactly as before');
  ok(names['c@x.com'] === 'Carl', 'an InActive user still appears — this map labels history rows, it is not an authority check');
  ok(Object.keys(names).every(k => typeof names[k] === 'string'), 'every value is a string, not the directory record');

  ok(H.reads.users === 1, 'and it read ERP_Users once');
  H.newExecution();
  H.call('userNameMap_');
  ok(H.reads.users === 1, 'a second request in the same generation reads the cache, not the sheet');

  const dir = H.call('userDirectory_');
  ok(dir['a@x.com'].role === 'Manager' && dir['a@x.com'].company === 'VF' && dir['a@x.com'].status === 'Active',
    'the directory underneath carries role, company and status');
  ok(dir['b@x.com'] !== undefined, 'a nameless user is still IN the directory — only the name projection drops them');

  const dirKeys = H.cacheKeys().filter(k => k.indexOf('user_dir_g') !== -1);
  ok(dirKeys.length > 0, 'the directory cache key embeds the generation: ' + dirKeys[0]);
  ok(dirKeys.some(k => /__m$/.test(k)), 'and it went through getRefsCached_ chunking, so a large ERP_Users cannot blow the ~100KB cap');
}

/* ────────────────────────────────────────────────────────────────────────────
 * SOURCE — cheap regressions the behaviour above cannot catch
 * ──────────────────────────────────────────────────────────────────────── */

const CONFIG_SRC = read('Code.js');
const DA_SRC = read('Code.js');
const SEC_SRC = read('Code.js');
const CODE_SRC = read('Code.js');

function configNumber(name) {
  const m = new RegExp(name + '\\s*:\\s*(\\d+)').exec(CONFIG_SRC);
  return m ? Number(m[1]) : null;
}

section('15. The long TTLs stay long — a "let us make it fresher" cut would only add sheet reads');
{
  const ks = configNumber('CACHE_KILLSWITCH_SECONDS');
  const mx = configNumber('CACHE_MATRIX_SECONDS');
  const ud = configNumber('CACHE_USER_DIR_SECONDS');
  ok(ks !== null && ks >= 3600, 'CACHE_KILLSWITCH_SECONDS is ' + ks + ' (>= 3600)');
  ok(mx !== null && mx >= 3600, 'CACHE_MATRIX_SECONDS is ' + mx + ' (>= 3600)');
  ok(ud !== null && ud >= 3600, 'CACHE_USER_DIR_SECONDS is ' + ud + ' (>= 3600)');
  ok(ks <= 21600 && mx <= 21600 && ud <= 21600, 'and none exceeds the 21600s CacheService maximum, which the service would reject');
}

section('16. The staleness ceiling is present, sane, and actually folded into the generation');
{
  const ceil = configNumber('AUTH_STALENESS_CEILING_SECONDS');
  ok(ceil !== null, 'AUTH_STALENESS_CEILING_SECONDS is defined');
  ok(ceil <= 3600, 'it is ' + ceil + ' (<= 3600)');
  ok(/AUTH_STALENESS_CEILING_SECONDS/.test(DA_SRC) && /Math\.floor\(new Date\(\)\.getTime\(\) \/ \(ceilSec \* 1000\)\)/.test(DA_SRC),
    'and authGeneration_ folds it in as a time bucket');
  ok(!/function authGeneration_[\s\S]*?setProperty/.test(DA_SRC.slice(DA_SRC.indexOf('function authGeneration_'), DA_SRC.indexOf('function bumpAuthGeneration_'))),
    'authGeneration_ contains no Properties WRITE — an anonymous page load must never write Properties');
  const fr = configNumber('CACHE_AUTH_FAILREAD_SECONDS');
  ok(fr !== null && fr <= 60, 'CACHE_AUTH_FAILREAD_SECONDS is ' + fr + ' — short, as a fail-open default must be');
}

section('17. No authority READ still references the old version stamps');
{
  ok(!/get\(\s*['"]version_(matrix|killswitch)['"]/.test(SEC_SRC),
    "Code.js no longer reads 'version_matrix' or 'version_killswitch' from the cache");
  ok(!/matrix_v_/.test(SEC_SRC), "the old 'matrix_v_' key prefix is gone");
  ok(!/killswitch_v_/.test(SEC_SRC), "the old 'killswitch_v_' key prefix is gone");
  ok(/'mx_g' \+ authGeneration_\(\)/.test(SEC_SRC), 'the matrix key is built from authGeneration_()');
  ok(/'ks_g' \+ authGeneration_\(\)/.test(SEC_SRC), 'the kill-switch key is built from authGeneration_()');
  ok(/user_dir_g' \+ authGeneration_\(\)/.test(DA_SRC), 'the user-directory key is built from authGeneration_()');
  /* The writes stay — version_companies has live consumers out of this scope. */
  ok(/cache\.put\('version_companies'/.test(DA_SRC), 'bumpVersion_ still WRITES version_companies, which is out of scope');
}

section('18. installTriggers_ creates onAuthSheetEdit, idempotently');
{
  const at = CODE_SRC.indexOf('function installTriggers_');
  ok(at !== -1, 'installTriggers_ is still present');
  const body = CODE_SRC.slice(at, CODE_SRC.indexOf('\n}', at));
  const delAt = body.indexOf("'onAuthSheetEdit'");
  const newAt = body.indexOf("newTrigger('onAuthSheetEdit')");
  ok(delAt !== -1, 'onAuthSheetEdit is in the delete sweep');
  ok(newAt !== -1, 'and it is created');
  ok(delAt < newAt, 'the delete comes FIRST, so calling install_triggers twice does not stack two triggers');
  ok(/newTrigger\('onAuthSheetEdit'\)\s*\n?\s*\.forSpreadsheet\(CONFIG\.AUTH_SPREADSHEET_ID\)\s*\n?\s*\.onEdit\(\)\s*\n?\s*\.create\(\)/.test(body),
    'it is .forSpreadsheet(CONFIG.AUTH_SPREADSHEET_ID).onEdit().create() — an INSTALLABLE trigger on the AUTH spreadsheet');
  ok(/catch \(e\) \{\s*\n?\s*try \{ console\.error\('installTriggers_: onAuthSheetEdit not created/.test(body),
    'wrapped in its own try/catch, so a trigger-scope failure cannot take down the daily-backup install beside it');
  ok(/function onAuthSheetEdit\(e\)/.test(DA_SRC), 'the handler onAuthSheetEdit exists in Code.js');
  ok(/function onEdit\(e\) \{ onAuthSheetEdit\(e\); \}/.test(DA_SRC), 'and onEdit is retained as a one-line delegate, so nothing referencing it breaks');
}

section('19. The per-execution memos are reset at the top of every request');
{
  const at = DA_SRC.indexOf('function resetRecordCache_');
  const body = DA_SRC.slice(at, DA_SRC.indexOf('\n}', at));
  ok(/_genMemo_ = null/.test(body), 'resetRecordCache_ clears _genMemo_');
  ok(/_ksMemo_ = null/.test(body), 'resetRecordCache_ clears _ksMemo_');
  ok(/_ksMemo_\s*=\s*null;\s*\/\/ toggleKillSwitch_/.test(DA_SRC), 'bumpAuthGeneration_ also clears _ksMemo_ — the gate memoises before the handler flips the flag');

  /* Behavioural counterpart: without the reset, a stale memo would survive. */
  const H = harness();
  H.newExecution(); const g1 = H.call('authGeneration_');
  H.advance(1000);
  H.eval("PropertiesService.getScriptProperties().setProperty('erp_gen', '999');");
  H.evict('erp_gen');
  ok(H.call('authGeneration_') === g1, 'inside ONE execution the generation is memoised — one cache get per request');
  H.newExecution();
  ok(H.call('authGeneration_') !== g1, 'and the next execution picks up the new generation');
}

/* ── Result ──────────────────────────────────────────────────────────────── */
console.log('');
if (failed === 0) {
  console.log('S16 OK — the authority generation verified by EXECUTING the real Code.js,');
  console.log('canonical Code.js against a controllable CacheService and');
  console.log('PropertiesService. No spreadsheet, no trigger, no deployment was touched.');
  process.exit(0);
}
console.log('S16: ' + failed + ' assertion(s) FAILED');
process.exit(1);

