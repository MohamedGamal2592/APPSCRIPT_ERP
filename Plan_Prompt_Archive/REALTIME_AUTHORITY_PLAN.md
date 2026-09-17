# Real-time kill switch + authority matrix — execution plan

**Goal.** A change to the system on/off switch, to the authority matrix, or to a user's role /
company / status must be visible to every affected user on their **next page load or next action** —
one refresh, no logout. And the system must get **faster**, not slower, in the process.

**Branch.** `feat/realtime-authority` off `master`.

**Status.** Plan only. Nothing in this document has been implemented.

---

## 0. Why this is not just "shorten the cache TTL"

Freshness and speed are not in tension here — they are both being lost to the same weakness.

The version stamp lives in `CacheService`, which is evictable and defaults to a 600s TTL, so it
cannot be trusted as the invalidation mechanism. That forces short payload TTLs (15s / 120s). Short
payload TTLs force constant re-reads of the shared AUTH spreadsheet — the exact contention the
performance programme was fighting.

Make the stamp **durable** and the payload TTL can go **long**. The result is simultaneously fresher
(event-driven invalidation instead of expiry) and cheaper (no periodic sheet reads).

---

## 1. Evidence — what is broken today

### 1.1 The kill switch and the matrix are half-wired

| Mechanism | Where | Cache key | TTL |
|---|---|---|---|
| Kill switch | `isSystemEnabled_()` — 03_Security.js:495 | `killswitch_v_<version>` | 15s (`CACHE_KILLSWITCH_SECONDS`) |
| Authority matrix | `getRoleAuthorityMatrix_()` — 03_Security.js:360 | `matrix_v_<version>_<role>` | 120s (`CACHE_MATRIX_SECONDS`) |

Version stamps are bumped by `bumpVersion_()` — 02_DataAccess.js:789.

Changes made **through the admin UI** are already one-refresh-correct: `toggleKillSwitch_`
(Code.js:504) and `adminSaveMatrix_` (05_Admin.js:222, 05_Admin.js:301) bump explicitly.

### 1.2 `onEdit` is dead code — direct sheet edits invalidate nothing

`onEdit(e)` at 02_DataAccess.js:776 is a **simple** trigger. Simple triggers only fire in
container-bound projects. This is a **standalone** script: `.clasp.json` carries a bare `scriptId`
and `installTriggers_` (Code.js:1106) creates only *time-based* triggers.

So a change typed directly into `ERP_Pages_Matrix` or into `ERP_system_work!B2` **never bumps a
version**. It is rescued only by TTL expiry: 15s for the kill switch, **120s for the matrix**.

The comment at Code.js:484 — *"onEdit then re-enables within seconds"* — describes behaviour that
does not exist. So does the one at 03_Security.js:491.

### 1.3 The role half of the authority decision never refreshes at all

Authority = **role** × **matrix**. The matrix is fresh. The role is not.

- The role is denormalised into `ERP_Sessions` at login — `SessionManager_.create`, 03_Security.js:196.
- And into the `sess_<hash>` cache **for the entire remaining session** — 03_Security.js:202 and
  03_Security.js:236, TTL = time until expiry, i.e. up to **12 hours** (`SESSION_EXPIRY_HOURS: 12`).
- `authenticateSystemUser_` (03_Security.js:147) then feeds that frozen role straight into
  `getRoleAuthorityMatrix_(v.role)`.
- `adminSaveUser_` calls `bumpVersion_('ERP_Users')` (05_Admin.js:121, 05_Admin.js:129), which writes
  `version_users` — **and nothing in the codebase reads that key.** Verified: the only occurrence is
  the write at 02_DataAccess.js:793.

**Consequence:** changing a user's role or company, or setting them InActive, has **no effect for up
to 12 hours**, no matter how many times they refresh. `handleLogin_` rejects an InActive user
(03_Security.js:61) but nothing re-checks it for an *already-logged-in* user.

### 1.4 The freshness is paid for in sheet reads

Because the TTLs are the invalidation mechanism, the system performs:

- `getRange('B2').getValue()` on the AUTH spreadsheet **at least every 15 seconds**, and
- a full `ERP_Pages_Matrix.getDataRange().getValues()` **every 120 seconds, per role**,

on the single spreadsheet every user's session validation also contends for.

---

## 2. Design — one durable generation stamp

### 2.1 The stamp

A single monotonic **authority generation**, bumped by any mutation that can change an authority
decision (`ERP_Users`, `ERP_Pages_Matrix`, `ERP_system_work`, `ERP_Information`).

- **Durable** in `ScriptProperties` (`erp_gen`) — never evicted, no TTL.
- **Mirrored** in `CacheService` at max TTL (6h), read cache-first with Properties as the fallback on
  eviction. Steady-state cost: one cache `get`, memoised per execution.
- The web app runs `executeAs: USER_DEPLOYING` (appsscript.json), so both stores are genuinely
  **global across all users** — a bump by an admin is visible to everyone on their next request.

### 2.2 The staleness ceiling — why the trigger is not load-bearing

Raising payload TTLs to 6h makes the installable `onEdit` trigger the only thing catching direct
sheet edits. If that install fails or is skipped, staleness would become **6 hours** — far worse than
today's 120s. That ordering risk is unacceptable for a rollout.

So the generation folds in a **coarse time bucket**:

```
generation = <durable stamp> + "." + floor(now / (AUTH_STALENESS_CEILING_SECONDS * 1000))
```

- Any app-side change → the durable stamp changes → **instant**, one refresh.
- Any direct sheet edit, trigger installed → **instant**, one refresh.
- Any direct sheet edit, trigger missing or broken → cleared within the **ceiling**, worst case.

The ceiling is one tunable number with no correctness cliff. Roll out at **300s** (already better
than today's 120s matrix window in the app-side case, and bounded in every case), confirm the
trigger, then raise to **3600s** for the full performance win.

Cost of the bucket: a synchronised cache miss at each boundary. At 3600s that is one B2 read and one
matrix read per role per hour. Negligible.

### 2.3 What the generation keys

| Payload | New key | Replaces |
|---|---|---|
| Kill switch flag | `ks_g<gen>` | `killswitch_v_<version>` |
| Matrix, per role | `mx_g<gen>_<role>` | `matrix_v_<version>_<role>` |
| User directory | `refs_<authId>_user_dir_g<gen>` | `refs_<authId>_user_names` (300s TTL) |

`sess_<hash>` is deliberately **left alone**. Its job is "is this token a live session", which is
correctly cached for the session lifetime. The live identity is overlaid on top of it (§3.6), so
session validation stays fast and authority stays fresh.

### 2.4 Honest cost accounting

| Path | Loses | Gains |
|---|---|---|
| `doGet` (page load) | B2 sheet read every 15s; matrix sheet read every 120s; 2 version-stamp cache gets | nothing — `userNameMap_()` already read `ERP_Users` on every page load (Code.js:110) |
| `apiRouter_` (action) | B2 sheet read every 15s; matrix sheet read every 120s; 2 version-stamp cache gets | one chunked cache read of the user directory |

The win is **eliminating spreadsheet reads**, not shaving cache round trips. Net effect is strongly
positive on both paths. Further consolidation of cache gets into a single `getAll` is deliberately
deferred to Phase 5 as a *measured, optional* change — it is the lowest-value and highest-risk item
here, and the sheet reads are what actually cost.

---

## 3. Implementation

### 3.1 `00_Config.js` — the tunables

Change two values and add three. Every one of them gets a comment saying **the invariant changed**:
these TTLs are no longer the invalidation mechanism, the generation is.

```js
  // Authority caches are invalidated by the authority GENERATION (see
  // authGeneration_ in 02_DataAccess.js), not by expiry. These TTLs are now only
  // an upper bound on how long a generation's payload may occupy the cache.
  // Shortening them does NOT make the system fresher — it only adds sheet reads.
  CACHE_KILLSWITCH_SECONDS: 21600,   // was 15
  CACHE_MATRIX_SECONDS: 21600,       // was 120
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
```

### 3.2 `02_DataAccess.js` — the generation helpers

New, immediately above `bumpVersion_` (~line 788).

```js
var _genMemo_ = null;   // per-execution memo, cleared by resetRecordCache_
var _ksMemo_  = null;

/**
 * The authority generation. Durable in ScriptProperties, mirrored in
 * CacheService at max TTL, so the steady-state cost is one cache get.
 *
 * NEVER writes to ScriptProperties — only bumpAuthGeneration_ does, and only in
 * response to a real mutation. A fresh deployment with no property set reads '0'
 * and works correctly; the first admin save bootstraps the real stamp.
 */
function authGeneration_() {
  if (_genMemo_ !== null) return _genMemo_;
  var base = null;
  try { base = CacheService.getScriptCache().get('erp_gen'); } catch (e) {}
  if (!base) {
    try { base = PropertiesService.getScriptProperties().getProperty('erp_gen'); } catch (e) {}
    if (!base) base = '0';
    try { CacheService.getScriptCache().put('erp_gen', base, 21600); } catch (e) {}
  }
  var ceilSec = Number(CONFIG.AUTH_STALENESS_CEILING_SECONDS) || 300;
  _genMemo_ = base + '.' + Math.floor(new Date().getTime() / (ceilSec * 1000));
  return _genMemo_;
}

/**
 * Invalidate every cached authority payload for every user, everywhere, at once.
 *
 * Order matters: the DURABLE write is the source of truth and goes first. If it
 * fails, the cache mirror gets a 60s TTL instead of 6h, so a later eviction
 * cannot strand readers on a stale Properties generation for six hours.
 */
function bumpAuthGeneration_() {
  var g = String(new Date().getTime());
  var durable = false;
  try {
    PropertiesService.getScriptProperties().setProperty('erp_gen', g);
    durable = true;
  } catch (e) {
    try { console.error('bumpAuthGeneration_: durable write failed — ' + e.message); } catch (e2) {}
  }
  try { CacheService.getScriptCache().put('erp_gen', g, durable ? 21600 : 60); }
  catch (e) { try { CacheService.getScriptCache().remove('erp_gen'); } catch (e2) {} }
  _genMemo_ = null;   // recompute with the new base and the current bucket
  _ksMemo_  = null;   // toggleKillSwitch_ flips the flag AFTER the gate memoised it
}
```

### 3.3 `02_DataAccess.js` — `bumpVersion_` also bumps the generation

Purely additive. The existing per-sheet version keys stay — `version_companies` has three live
consumers (03_Security.js:581, 649, 721 and Code.js:712) and is out of scope.

```js
function bumpVersion_(sheetName) {
  try { /* ...existing body, unchanged... */ } catch (e) {}
  // ERP_Users (role/company/status), ERP_Pages_Matrix (grants) and
  // ERP_system_work / ERP_Information (kill switch) all feed the authority
  // decision. Any of them changing invalidates every cached authority payload.
  if (sheetName === 'ERP_Users' || sheetName === 'ERP_Pages_Matrix' ||
      sheetName === 'ERP_Information' || sheetName === 'ERP_system_work') {
    bumpAuthGeneration_();
  }
}
```

This one hook covers every existing call site — 03_Security.js:79, 03_Security.js:118, 05_Admin.js:121,
05_Admin.js:129, 05_Admin.js:222, 05_Admin.js:301, Code.js:504 — with no edit to any of them.

### 3.4 `02_DataAccess.js` — the installable edit handler

`onEdit` is retained verbatim so nothing that references it breaks; the body moves to a function an
**installable** trigger can target.

```js
/**
 * Installable onEdit target. THE SIMPLE TRIGGER onEdit(e) BELOW NEVER FIRES:
 * this is a standalone script and simple triggers only run in container-bound
 * projects. Until installTriggers_ creates this trigger, a change typed directly
 * into the AUTH spreadsheet reaches no invalidation at all.
 */
function onAuthSheetEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getParent().getId() !== CONFIG.AUTH_SPREADSHEET_ID) return;
    const sheetName = sheet.getName();
    if (sheetName === 'ERP_Users') bumpVersion_('ERP_Users');
    else if (sheetName === 'ERP_Companies') bumpVersion_('ERP_Companies');
    else if (sheetName === 'ERP_Pages_Matrix') bumpVersion_('ERP_Pages_Matrix');
    else if (sheetName === 'ERP_Information') bumpVersion_('ERP_Information');
    else if (sheetName === 'ERP_system_work') bumpVersion_('ERP_system_work');
  } catch (err) { console.error('onAuthSheetEdit failed: ' + err.message); }
}

/** Retained for compatibility. Never fires — see onAuthSheetEdit. */
function onEdit(e) { onAuthSheetEdit(e); }
```

Also add `_genMemo_ = null; _ksMemo_ = null;` to `resetRecordCache_` (02_DataAccess.js:43) — the
existing per-execution reset hook, already called at the top of both `doGet` (Code.js:13) and
`apiRouter_` (Code.js:341).

### 3.5 `02_DataAccess.js` — the user directory

Replaces the 300s-TTL `userNameMap_` cache with a generation-keyed one. **`userNameMap_` keeps its
exact name, signature and return shape** — it is a public contract consumed at Code.js:110.

```js
/**
 * email(lowercased) -> { name, role, company, status } from ERP_Users.
 * Keyed by the authority generation, NOT a TTL: an admin saving a user bumps the
 * generation, so the next request anywhere in the system rebuilds this map.
 */
function userDirectory_() {
  try {
    return getRefsCached_(CONFIG.AUTH_SPREADSHEET_ID, 'user_dir_g' + authGeneration_(),
      CONFIG.CACHE_USER_DIR_SECONDS, function () {
        var map = {};
        getAllRecords_(CONFIG.AUTH_SPREADSHEET_ID, 'ERP_Users').forEach(function (u) {
          var em = String(u.email || '').trim().toLowerCase();
          if (!em) return;
          map[em] = {
            name:    String(u.name || '').trim(),
            role:    String(u.role || '').trim(),
            company: String(u.company || '').trim(),
            status:  String(u.status == null ? 'Active' : u.status).trim() || 'Active'
          };
        });
        return map;
      }) || {};
  } catch (e) { return {}; }
}

/** Unchanged contract: email(lowercased) -> display name. Now a projection. */
function userNameMap_() {
  var dir = userDirectory_(), out = {};
  for (var em in dir) if (dir[em].name) out[em] = dir[em].name;
  return out;
}
```

`getRefsCached_` (02_DataAccess.js:614) already chunks, so a large `ERP_Users` is handled.

### 3.6 `03_Security.js` — overlay the live identity

The single surgical change that makes role, company and status real-time.
`SessionManager_.validate` is **not** touched.

```js
function authenticateSystemUser_(sessionToken) {
  if (!sessionToken) return { status: 'error', authorized: false };
  const v = SessionManager_.validate(sessionToken);
  if (!v.valid) return { status: 'error', authorized: false };

  // The session row denormalises role/company at login and sess_<hash> holds it
  // for the session's full 12-hour lifetime. Authority must not inherit that: a
  // role change, a company move or a deactivation has to bite on the user's next
  // request. userDirectory_ is generation-keyed, so an admin's save invalidates
  // it for every user at once.
  const email = String(v.email || '').trim().toLowerCase();
  const dir = userDirectory_();
  const dirLoaded = Object.keys(dir).length > 0;
  const live = dir[email] || null;

  // FAIL-OPEN on a read failure, FAIL-CLOSED on a real absence. An empty map is
  // indistinguishable from a transient read error, so it must not log everyone
  // out; a populated map that lacks this email means the user was removed.
  if (dirLoaded && !live) return { status: 'error', authorized: false, code: 'ACCOUNT_REMOVED' };
  if (live && String(live.status).toLowerCase() !== 'active') {
    return { status: 'error', authorized: false, code: 'ACCOUNT_DISABLED' };
  }

  const role    = (live && live.role)    ? live.role    : v.role;
  const company = (live && live.company) ? live.company : v.company;
  const name    = (live && live.name)    ? live.name    : v.name;

  const isSuperAdmin = /super\s*admin/i.test(String(role || ''));
  const userObj = {
    email: v.email, name: name, role: role, company: company, companyId: company,
    isSuperAdmin: isSuperAdmin,
    authorizedPages: isSuperAdmin ? ['*'] : getRoleAuthorityMatrix_(role),
    expires: v.expires
  };
  return { status: 'success', authorized: true, user: userObj };
}
```

**Callers already handle this.** Both consumers treat `authorized: false` as session-expired —
`doGet` renders the expired interstitial (Code.js:65) and `apiRouter_` returns `SESSION_EXPIRED`
(Code.js:359). A deactivated user is bounced to login, which then shows the correct Arabic message
from `handleLogin_` (03_Security.js:61). No client change required.

### 3.7 `03_Security.js` — kill switch on the generation

```js
function isSystemEnabled_() {
  try {
    if (_ksMemo_ !== null) return _ksMemo_;
    const cache = CacheService.getScriptCache();
    const key = 'ks_g' + authGeneration_();
    let cached = null;
    try { cached = cache.get(key); } catch (cacheErr) {}
    if (cached !== null && cached !== undefined) { _ksMemo_ = (cached === 'true'); return _ksMemo_; }

    let enabled = true;      // fail-open default
    let readOk = true;
    try {
      const flag = readSystemWorkFlag_(ensureSystemWorkSheet_());
      if (flag === 0) enabled = false;
    } catch (readErr) { enabled = true; readOk = false; }

    // A FAILED read must not earn the long TTL — caching a fail-open default for
    // six hours would hide a real shutdown.
    try {
      cache.put(key, enabled ? 'true' : 'false',
        readOk ? CONFIG.CACHE_KILLSWITCH_SECONDS : CONFIG.CACHE_AUTH_FAILREAD_SECONDS);
    } catch (putErr) {}
    _ksMemo_ = enabled;
    return enabled;
  } catch (e) { return true; }
}
```

### 3.8 `03_Security.js` — matrix on the generation

Only the cache key and the TTL source change; the build logic is untouched.

```js
function getRoleAuthorityMatrix_(userRole) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'mx_g' + authGeneration_() + '_' + String(userRole || '').trim().toLowerCase();
  // ...body unchanged...
  try { cache.put(cacheKey, JSON.stringify(allowedPages), CONFIG.CACHE_MATRIX_SECONDS); } catch (putErr) {}
```

Two existing behaviours must be **preserved deliberately**: the structural bail
(`if (roleIdx === -1 || pageIdx === -1) return {}`) and the outer `catch` both return `{}` *without
caching*. They fail closed and must not be given a 6h TTL.

Normalising the role in the key also collapses today's duplicate entries for roles differing only by
case. `_hasUnifiedAccess_` already lowercases, so no lookup semantics change.

### 3.9 `Code.js` — install the trigger

In `installTriggers_` (Code.js:1106), add `'onAuthSheetEdit'` to the delete sweep so the function
stays idempotent, then:

```js
  try {
    ScriptApp.newTrigger('onAuthSheetEdit')
      .forSpreadsheet(CONFIG.AUTH_SPREADSHEET_ID)
      .onEdit()
      .create();
  } catch (e) {
    try { console.error('installTriggers_: onAuthSheetEdit not created — ' + e.message); } catch (e2) {}
  }
```

Also correct the two comments that document behaviour which never existed: Code.js:484 and
03_Security.js:491.

---

## 4. Verification — `tools/verify/s16_realtime_authority.js`

Offline, over the real source, in the established harness style (see `tools/verify/s13_forms_filters.js`).
Register in `tools/verify/run_all.js` as
`['s16_realtime_authority.js', 'S16 — authority generation: kill switch, matrix and role are one-refresh']`.

What it asserts:

1. **The stamp is durable.** `bumpAuthGeneration_` writes `PropertiesService` **before** `CacheService`,
   and the cache mirror TTL is conditional on the durable write succeeding.
2. **The generation gates every authority payload.** `ks_g`, `mx_g` and `user_dir_g` keys all embed
   `authGeneration_()`; no authority read uses `version_killswitch` or `version_matrix` any more.
3. **`bumpVersion_` bumps the generation** for all four authority sheets and for none of the others.
4. **The ceiling exists and is sane.** `AUTH_STALENESS_CEILING_SECONDS` is present, is folded into
   `authGeneration_` as a time bucket, and is <= 3600.
5. **TTLs are no longer the mechanism.** `CACHE_KILLSWITCH_SECONDS` and `CACHE_MATRIX_SECONDS` are
   >= 3600 — a regression to a short TTL would silently reintroduce the sheet-read load.
6. **Fail-open is not cached long.** The kill-switch failed-read branch uses
   `CACHE_AUTH_FAILREAD_SECONDS`, not `CACHE_KILLSWITCH_SECONDS`.
7. **Fail-closed paths stay uncached.** `getRoleAuthorityMatrix_`'s structural bail and outer catch
   return `{}` with no `cache.put` between them.
8. **Role is live.** `authenticateSystemUser_` calls `userDirectory_()` and does not pass `v.role`
   unconditionally into `getRoleAuthorityMatrix_`.
9. **Directory failure fails open, absence fails closed.** Both branches present and distinct.
10. **Public contract intact.** `userNameMap_` still exists and still returns email -> name.
11. **Memos are reset per execution.** `resetRecordCache_` clears `_genMemo_` and `_ksMemo_`.
12. **The trigger is installable.** `installTriggers_` creates `onAuthSheetEdit` via
    `.forSpreadsheet(...).onEdit()` and deletes any prior instance first.

Run: `node tools/verify/run_all.js` — must be green before handoff.

---

## 5. Manual test script (owner, after deploy)

Two browsers: **A** = super admin, **B** = an ordinary user on some page.

| # | Action in A | Expected in B | Proves |
|---|---|---|---|
| 1 | Kill switch OFF via admin UI | B refreshes once -> shutdown page | app-side kill switch |
| 2 | Kill switch ON via admin UI | B refreshes once -> normal page | recovery lever |
| 3 | Edit `ERP_system_work!B2` to `0` **in the sheet** | B refreshes once -> shutdown page | installable trigger |
| 4 | Set B2 back to `1` in the sheet | B refreshes once -> normal | trigger, both directions |
| 5 | Remove a page grant from B's role in the admin UI | B refreshes once -> nav item gone, direct URL denied | matrix, app-side |
| 6 | Set that row's `status` to `InActive` **in the sheet** | B refreshes once -> denied | matrix, direct edit |
| 7 | Change B's `role` in the admin UI | B refreshes once -> new role's pages | **role is live (§1.3)** |
| 8 | Set B's `status` to `InActive` | B refreshes once -> bounced to login with the Arabic inactive message | deactivation is live |
| 9 | Leave everything idle 10 minutes | no errors, no slowdown | bucket rollover is harmless |

Step 3 is the one that fails if the trigger did not install. If it does fail, steps 3/4/6 will still
pass **within `AUTH_STALENESS_CEILING_SECONDS`** — that is the ceiling doing its job, and it is the
signal to fix the trigger rather than an outage.

---

## 6. Rollout order

Sequencing matters, because §2.2's ceiling is what makes it safe.

1. **Deploy** with `AUTH_STALENESS_CEILING_SECONDS: 300`. Worst case is now 5 minutes even if
   everything else about the trigger goes wrong.
2. **Owner runs `install_triggers`** once from the admin UI as super admin, and authorises the new
   trigger scope when prompted.
3. **Owner confirms** the trigger is listed in the Apps Script editor, bound to the AUTH spreadsheet,
   handler `onAuthSheetEdit`, event `On edit`.
4. **Run the §5 script.** Step 3 must pass *immediately*, not after 5 minutes.
5. **Only then** raise `AUTH_STALENESS_CEILING_SECONDS` to `3600` and redeploy. This is the change
   that converts the work into the full performance win.

**Cutover is clean.** New code reads `ks_g*` / `mx_g*`; old code read `killswitch_v_*` / `matrix_v_*`.
No key collision, so no stale value can survive the deploy.

**Rollback is clean.** Reverting the deploy restores the old keys and the old short TTLs, which
self-heal within 120s. The `erp_gen` property becomes inert; it is never read by the old code and
does not need removing.

---

## 7. Constraints this plan respects

1. **No schema change.** No column added, renamed, removed, reordered or retyped. No new sheet, no
   new tab. `ScriptProperties` is not a spreadsheet.
2. **No data written to any business table.** No matrix rows granted — that stays the owner's step
   through the admin UI.
3. **No deploy.** Never `clasp push` to the production script id, never create or promote a
   deployment, never push to `origin`. The owner does all of it.
4. **The owner's Google account is not touched.** The agent creates **no** trigger and sets **no**
   Script Property. `installTriggers_` is *code*; the owner runs it. `authGeneration_` deliberately
   never writes to Properties — only `bumpAuthGeneration_` does, and only in response to a real admin
   action inside the running app.
5. **No public contract broken.** `userNameMap_` keeps its name, signature and shape.
   `isSystemEnabled_`, `getRoleAuthorityMatrix_`, `authenticateSystemUser_`, `bumpVersion_` and
   `SessionManager_.*` all keep theirs. No response shape changes; no client file is edited.
6. **`src_html/` is not edited** — `.claspignore` excludes it; it is a scratch copy.

---

## 8. Blocked on owner

| # | Step | Why the agent cannot do it |
|---|---|---|
| 1 | `clasp push` and promote the deployment | Hard constraint 3 |
| 2 | Run `install_triggers` from the admin UI, authorise the trigger scope | Hard constraint 4 — creates a trigger on the owner's account |
| 3 | Confirm `onAuthSheetEdit` appears in the trigger list bound to the AUTH spreadsheet | Same |
| 4 | Run the §5 manual script across two browsers | Needs a real deployment and two real accounts |
| 5 | After step 4 passes, raise `AUTH_STALENESS_CEILING_SECONDS` to 3600 and redeploy | Hard constraint 3 |

---

## 9. Deferred — not in this run

- **Phase 5 (optional, measured).** Consolidate the remaining per-request cache `get`s into a single
  `CacheService.getAll([...])`. Worth perhaps 30-50ms; do it only if the perf harness shows it
  matters *after* the sheet reads are gone. The sheet reads are the cost, not the cache gets.
- **Push freshness.** Making an already-open page react *without* a refresh needs client-side
  polling. The stated bar is one refresh; this is a separate, more expensive change.
- **`version_companies` unification.** Three live consumers (03_Security.js:581, 649, 721 and
  Code.js:712). Same weakness, different blast radius. Out of scope.
- **Removing the now-unused `version_users` key.** Harmless; leave it until the generation has run in
  production for a while, so a rollback stays trivial.
