# Real-time kill switch + authority matrix — results

Branch `feat/realtime-authority`, cut from `master` at `c74232f`. **Code only.** No row was created,
edited or deleted; no schema was changed; no trigger was created; no Script Property was set; no
server function was run; nothing was pushed or deployed.

---

## Rollout order — getting this wrong is the one way the change makes things worse

The staleness ceiling ships at **300**, not 3600. That is deliberate: until the trigger is confirmed,
300 is the worst case, which is already better than today's 120s matrix window in the app-side case
and bounded in every case. Raising it before the trigger is confirmed would turn a missing trigger
into an hour of staleness.

1. **Deploy** with `AUTH_STALENESS_CEILING_SECONDS: 300` (the value on this branch).
2. **Run `install_triggers`** once from the admin UI, signed in as super admin, and authorise the new
   spreadsheet scope when Google prompts.
3. **Confirm the trigger is listed** in the Apps Script editor: handler `onAuthSheetEdit`, source
   *From spreadsheet*, event *On edit*, bound to the AUTH spreadsheet.
4. **Run the two-browser test** (§5 below). Step 3 of that table must pass *immediately*, not after
   five minutes.
5. **Only then** raise `AUTH_STALENESS_CEILING_SECONDS` to `3600` and redeploy. That step is what
   converts the work into the full performance win.

---

## 1. What changed, file by file

Line numbers are final, on this branch.

### `00_Config.js`

| Line | Change |
|---|---|
| 18 | `CACHE_MATRIX_SECONDS: 21600` — was `120` |
| 22 | `CACHE_KILLSWITCH_SECONDS: 21600` — was `15` |
| 26 | `CACHE_USER_DIR_SECONDS: 21600` — new |
| 33 | `AUTH_STALENESS_CEILING_SECONDS: 300` — new |
| 37 | `CACHE_AUTH_FAILREAD_SECONDS: 15` — new |

Each carries a comment recording that **the invariant moved**: these TTLs are no longer the
invalidation mechanism, the generation is. Shortening one does not make anything fresher; it only
adds spreadsheet reads.

### `02_DataAccess.js`

| Line | Change |
|---|---|
| 43 | `resetRecordCache_` also clears `_genMemo_` and `_ksMemo_` |
| 768 | `userDirectory_` — new; `email → {name, role, company, status}`, keyed by the generation |
| 796 | `userNameMap_` — now a projection over `userDirectory_`; **contract unchanged** |
| 813 | `onAuthSheetEdit` — new; holds the old `onEdit` body verbatim |
| 827 | `onEdit` — retained as a one-line delegate |
| 832-833 | `_genMemo_`, `_ksMemo_` — new module vars |
| 847 | `authGeneration_` — new |
| 868 | `bumpAuthGeneration_` — new |
| 883 | `bumpVersion_` — gains the generation hook, purely additive |

Three details that a fast reading loses, all present:

- `bumpAuthGeneration_` writes **Properties before cache**, and the mirror TTL is **60** (not 21600)
  when the durable write threw. Both halves are there and both are asserted (s16 §5).
- `authGeneration_` folds in the time bucket, so the trigger is not load-bearing (s16 §6).
- `authGeneration_` **never writes Properties**. A deployment with no property set bootstraps at
  `'0'` (s16 §4).

### `03_Security.js`

| Line | Change |
|---|---|
| 138 | `authenticateSystemUser_` — the live identity overlay |
| 393 | `getRoleAuthorityMatrix_` — key is `mx_g<gen>_<role lowercased>` |
| 540 | `isSystemEnabled_` — key is `ks_g<gen>`, memoised, split TTL on read failure |
| ~496 | the kill-switch header comment corrected |

`SessionManager_.validate` is **not touched**. Its job is "is this token a live session", correctly
cached for the session lifetime; the live identity is overlaid on top of it.

`ensureSystemWorkSheet_` is **byte-for-byte unchanged** — it is the one function in this file that
can create a sheet, and hard constraint 1 puts it out of bounds.

### `Code.js`

| Line | Change |
|---|---|
| 491 | `toggleKillSwitch_` header comment corrected |
| 1112 | `installTriggers_` — `onAuthSheetEdit` added to the delete sweep and to the create block |

The create is in its own `try/catch` with a `console.error`: this trigger needs a spreadsheet scope
the time-based ones do not, and a scope failure must not take down the `dailyCsvBackup` install
beside it.

### `tools/verify/`

`gasstub.js` (new), `s16_realtime_authority.js` (new), `run_all.js` (one line registered).

**No client file was edited.** No `.html`, no `UI_Components`, no `Client_Helpers`, and nothing under
`src_html/`.

---

## 2. R0 evidence — the four facts the design rests on

All four confirmed at `c74232f`. The design depends on all four; none is false.

**1. `.clasp.json` has a bare `scriptId` and no container**, so `onEdit` was a simple trigger that
has never fired.

```
{
  "scriptId": "1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM",
  "rootDir": "",
  ...
}
```

No `parentId`, no container binding. Simple triggers only run in container-bound projects.

**2. `installTriggers_` creates only time-based triggers.** At `c74232f` its entire body was two
`ScriptApp.newTrigger(...).timeBased()` calls — `cleanupOldSessions_` and `dailyCsvBackup` — and a
delete sweep matching only those two handler names. Nothing spreadsheet-bound existed.

**3. `version_users` is written and read by nothing.** Repo-wide grep, verbatim output:

```
$ grep -rn "version_users" --include=*.js --include=*.html .
./02_DataAccess.js:793:    if (sheetName === 'ERP_Users') cache.put('version_users', now);
./src_html/02_DataAccess.js:367:    if (sheetName === 'ERP_Users') cache.put('version_users', now);
```

Two hits, both **writes**, and the second is in `src_html/` — the scratch copy excluded by
`.claspignore`, not deployed and not edited by this run. There is no read anywhere. So
`adminSaveUser_`'s `bumpVersion_('ERP_Users')` invalidated nothing, which is exactly §1.3 of the
plan: a role change had no effect for up to 12 hours.

The key is left in place, per plan §9 — removing it buys nothing and a rollback stays trivial.

**4. `appsscript.json` runs the web app as the deploying user**, so `CacheService.getScriptCache()`
and `PropertiesService.getScriptProperties()` are genuinely shared across every end user:

```
20:    "executeAs": "USER_DEPLOYING",
21:    "access": "ANYONE_ANONYMOUS"
```

An admin's bump is therefore visible to everyone on their next request. Without this the whole
design would be per-user and worthless.

### Line drift from the prompt and the plan

Recorded at `c74232f`, before any edit. Drift was small and every reference resolved:

| Reference | Prompt/plan said | Actual at `c74232f` |
|---|---|---|
| `authenticateSystemUser_` | ~136 / 147 | **135** |
| `getRoleAuthorityMatrix_` | 360 | **360** ✓ |
| `isSystemEnabled_` | 495 | **495** ✓ |
| `ensureSystemWorkSheet_` | ~452 | **452** ✓ |
| `resetRecordCache_` | 43 | **43** ✓ |
| `getRefsCached_` | ~614 | **614** ✓ |
| `bumpVersion_` | 788 / 789 | **789** |
| `onEdit` | 776 | **776** ✓ |
| `userNameMap_` | — | **759** |
| `doGet` | 12 | **12** ✓ |
| `apiRouter_` | 322 | **322** ✓ |
| `installTriggers_` | 1106 | **1106** ✓ |
| `toggleKillSwitch_` | 504 | **486** (comment block starts 475) |
| `userNameMap_()` call site | Code.js:110 | **110** ✓ |

### R5 caller check — both consumers already handle `authorized: false`

Confirmed at `c74232f`, so **no client file needed editing**:

- `doGet` — Code.js:64-67: `if (!auth.authorized) { if (token) return renderSessionExpiredPage_(scriptUrl); ... }`.
  A user whose account was removed or disabled gets the expired interstitial, then login, which shows
  the correct Arabic inactive message from `loginUser_` (03_Security.js:61).
- `apiRouter_` — Code.js:354-358: `if (!auth.authorized) { ... return { status: 'error', code: 'SESSION_EXPIRED' }; }`.

The new `code: 'ACCOUNT_REMOVED'` / `'ACCOUNT_DISABLED'` is **additive on an already-unauthorized
result**. Neither caller reads it, so no response shape changed and no client contract moved. It is
there for the server log and for a future, separate client message.

---

## 3. Verification

`node --check` was run on every touched `.js` file after every phase, and
`node tools/verify/run_all.js` was green after every phase — R1 through R6 did not perturb it, as
expected, since no existing check loads a server file.

### Tail of `node tools/verify/run_all.js`

```
── S16 — authority generation: kill switch, matrix and role are one-refresh
   OK

...

── B7 — rules engine, run against fixtures both ways
   OK

All 41 checks pass.
```

40 before this run, 41 after.

### The technique

Grep assertions alone would not have been worth much here: the whole change is cache *semantics*, and
source text cannot prove that an invalidation actually invalidates. `tools/verify/gasstub.js` is the
`domstub.js`/`pageharness.js` idea pointed at Apps Script — a `vm` sandbox with:

- `CacheService.getScriptCache()` over a `Map`, honouring TTL against a **controllable clock**, with
  `evict(key)` and `failNextPut()` hooks, and a `put` that rejects a TTL over 21600 exactly as the
  real service does;
- `PropertiesService.getScriptProperties()` over a `Map`, with `failNextSet()` and a **write counter**,
  so "never writes Properties" is a testable claim rather than an assertion about source text;
- a settable `NOW`, so a bucket rollover is tested in microseconds instead of five minutes.

It loads the **real** `00_Config.js`, `02_DataAccess.js` and `03_Security.js`, then replaces only the
leaves that would touch a spreadsheet (`getSheet_`, `getSpreadsheet_`, `getAllRecords_`,
`getHeaders_`, `ensureSystemWorkSheet_`, `readSystemWorkFlag_`, `noteMutation_`). Everything above
those leaves is the project's own code, running for real.

`getRefsCached_` is deliberately **not** stubbed: the real one, with the real
`getChunkedCache_`/`putChunkedCache_` chunking, runs against the stub cache. A flat replacement
exists behind `{ stubRefsCache: true }` but is unused.

### Every s16 assertion and its result

**114 assertions, 114 PASS, 0 FAIL.**

Behavioural — these execute the real functions:

| # | Assertion | Result |
|---|---|---|
| 1 | Two users in the same generation compute an identical key; after `bumpAuthGeneration_()` both compute a *different* one, and every derived `mx_g` key moves. **The one-refresh property.** | PASS (6/6) |
| 2 | `bumpVersion_` changes the generation for `ERP_Users`, `ERP_Pages_Matrix`, `ERP_Information`, `ERP_system_work`; not for `ERP_Companies`, `ERP_Sessions`, or an unknown sheet. `version_companies` and `version_matrix` are still written — the hook is additive. | PASS (9/9) |
| 3 | Seeded Properties stamp is the base; it is mirrored to cache at TTL 21600; evicting `erp_gen` falls back to Properties and returns the **same** generation, not `'0'`. | PASS (4/4) |
| 4 | Nothing in Properties and nothing in cache → `'0'` base, no throw, and **zero Properties writes** — including across `isSystemEnabled_`, `getRoleAuthorityMatrix_` and `userDirectory_`. | PASS (4/4) |
| 5 | `failNextSet()` → still bumps, and the cache mirror TTL is **60**, not 21600. On success: TTL 21600 and exactly **one** Properties write. | PASS (5/5) |
| 6 | Advancing `NOW` past a 300s boundary with **no bump at all** changes the key, and it is the bucket that moved, not the durable base. **The ceiling.** | PASS (3/3) |
| 7 | `readSystemWorkFlag_` → `0` gives `false` with one B2 read; flipping to `1` without a bump, inside the TTL, still gives `false` **and performs no second sheet read** (proving it is genuinely cached); after a bump the next request gives `true` with exactly one further read; a successful read is cached at `CACHE_KILLSWITCH_SECONDS`. Includes the memo/toggle collision: the gate memoises "enabled", the handler flips B2 and bumps in the *same* execution, and the next call returns `false`. | PASS (8/8) |
| 8 | `ensureSystemWorkSheet_` throwing → `true` (fail open) **and** the cache entry TTL is `CACHE_AUTH_FAILREAD_SECONDS` (15), explicitly *not* `CACHE_KILLSWITCH_SECONDS`. `readSystemWorkFlag_` throwing takes the same branch. | PASS (5/5) |
| 9 | A matrix sheet missing `role`/`page_id` → `{}` with **nothing cached**; a read failure the same. By contrast the healthy path *is* cached, under `mx_g<gen>_<role>`, at `CACHE_MATRIX_SECONDS`, and a matrix bump moves the key. | PASS (7/7) |
| 10 | A directory role differing from the session's is the one that reaches `getRoleAuthorityMatrix_` (`"Manager"`, not `"Clerk"`), and the returned grants are the Manager's. Live company, live name, `email`/`expires` still from the session. A live promotion to Super Admin is honoured immediately. | PASS (8/8) |
| 11 | Empty directory → **fail open** on the session role and company, still authorized. A *thrown* `ERP_Users` read is the same case. | PASS (4/4) |
| 12 | Populated directory without the email → not authorized, `ACCOUNT_REMOVED`, and no user object leaks. | PASS (3/3) |
| 13 | `InActive` / `inactive` / `Suspended` → not authorized, `ACCOUNT_DISABLED`; an **empty** status defaults to Active; a deactivation plus an `ERP_Users` bump denies on the very next request. | PASS (6/6) |
| 14 | `userNameMap_()` still returns a flat lowercased-email → name object with the same omissions as before (no name, no email); an InActive user still appears (it labels history rows, it is not an authority check); one `ERP_Users` read, second request served from cache; the directory beneath carries role/company/status, is generation-keyed, and went through the chunking path. | PASS (13/13) |

Source — cheap regressions the behaviour cannot catch:

| # | Assertion | Result |
|---|---|---|
| 15 | `CACHE_KILLSWITCH_SECONDS`, `CACHE_MATRIX_SECONDS` and `CACHE_USER_DIR_SECONDS` are all `>= 3600` and `<= 21600`. A future "let's make it fresher" cut would silently reintroduce the sheet-read load this run removes. | PASS (4/4) |
| 16 | `AUTH_STALENESS_CEILING_SECONDS` is present, `<= 3600`, and actually folded into `authGeneration_` as a time bucket; `authGeneration_` contains no Properties write; `CACHE_AUTH_FAILREAD_SECONDS` is short. | PASS (5/5) |
| 17 | No authority read references `version_killswitch` or `version_matrix`; the `matrix_v_` and `killswitch_v_` prefixes are gone; all three new keys are built from `authGeneration_()`. | PASS (7/7) |
| 18 | `installTriggers_` deletes any prior `onAuthSheetEdit` **before** creating it, via `.forSpreadsheet(CONFIG.AUTH_SPREADSHEET_ID).onEdit().create()`, in its own try/catch; the handler exists; `onEdit` is retained as a delegate. | PASS (8/8) |
| 19 | `resetRecordCache_` clears `_genMemo_` and `_ksMemo_`; `bumpAuthGeneration_` clears `_ksMemo_`. Plus the behavioural counterpart: memoised within one execution, refreshed on the next. | PASS (5/5) |

### The suite is not vacuous — mutation results

Four deliberate regressions were introduced one at a time, run, and reverted. Each was caught:

| Mutation | Caught |
|---|---|
| Drop `_ksMemo_ = null` from `bumpAuthGeneration_` | yes — §7's same-execution toggle case fails |
| Give a failed kill-switch read `CACHE_KILLSWITCH_SECONDS` | yes — §8 fails |
| Change `if (dirLoaded && !live)` to `if (!live)` (fail closed on an empty directory) | yes — §11 fails |
| Cache the matrix structural bail | yes — §9 fails |

The working tree was confirmed byte-identical to the committed state afterwards, and the suite green.

---

## 4. What could not be verified here, and what was skipped

**Nothing was skipped.** Every step of R0 through R8 was carried out as specified. No step was found
wrong, unsafe or already done.

Three things are unverifiable from this environment and are **not** reported as verified:

1. **That the trigger actually fires.** Creating it needs the owner's Google account (hard
   constraint 3). The code is written and asserted (s16 §18); it has not been run.
2. **That a deployment works.** No `clasp push`, no deployment created or promoted, nothing pushed to
   `origin` (hard constraint 4).
3. **That a second browser sees the change.** Needs a real deployment and two real accounts.

These are owner steps §5 and §6 below. They were not simulated.

---

## 5. Owner's checklist

Do these in order. Each is a specific statement to confirm, not "check it looks right".

### Before the deploy

1. `AUTH_STALENESS_CEILING_SECONDS` on line 33 of `00_Config.js` reads **`300`**. If it reads `3600`,
   stop — that is step 12, not step 1.
2. `git log --oneline master..feat/realtime-authority` lists **eight** commits, `rta-R1` through
   `rta-R7` plus this results commit.
3. `node tools/verify/run_all.js` prints **`All 41 checks pass.`**

### Deploy

4. `clasp push`, then create or promote the deployment. Nothing in this run did either.
5. Load any page as an ordinary user. It renders normally, and the browser console shows no error.
   This confirms the cutover: new code reads `ks_g*` / `mx_g*` / `user_dir_g*`, old code read
   `killswitch_v_*` / `matrix_v_*` / `user_names`. **No key collides**, so no stale value can survive
   the deploy.

### Install the trigger

6. Sign in as **super admin**, run **`install_triggers`** from the admin UI **once**. Google prompts
   for a new spreadsheet scope — authorise it. This is the only step that touches your account.
7. Open the Apps Script editor → Triggers. A row exists with handler **`onAuthSheetEdit`**, source
   **From spreadsheet**, event type **On edit**, and it is bound to the AUTH spreadsheet
   (`1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM`). If that row is absent, the deploy is still safe
   — staleness is capped at 300s — but do not proceed to step 12.
8. Run `install_triggers` a **second** time and confirm the trigger list still shows exactly **one**
   `onAuthSheetEdit` row, not two. The delete sweep runs first (s16 §18), so this is idempotent.

### The two-browser test

Browser **A** = super admin. Browser **B** = an ordinary user sitting on some page. After each action
in A, refresh B **once**.

| # | Action in A | B must show | What fails if it does not |
|---|---|---|---|
| 9.1 | Kill switch OFF via the admin UI | the shutdown page | the app-side kill switch |
| 9.2 | Kill switch ON via the admin UI | the normal page | the recovery lever |
| 9.3 | Type `0` into `ERP_system_work!B2` **in the sheet** | the shutdown page, **immediately** | the installable trigger — see below |
| 9.4 | Type `1` back into B2 in the sheet | the normal page | the trigger, in the other direction |
| 9.5 | Remove a page grant from B's role in the admin UI | the nav item gone, and the direct URL denied | the matrix, app-side |
| 9.6 | Set that matrix row's `status` to `InActive` **in the sheet** | denied | the matrix, on a direct edit |
| 9.7 | Change B's `role` in the admin UI | the new role's pages | **role is live** — this is the §1.3 bug |
| 9.8 | Set B's `status` to `InActive` | bounced to login with the Arabic inactive message | deactivation is live |
| 9.9 | Leave everything idle 10 minutes, then refresh | no error, no slowdown | bucket rollover is harmless |

10. **Row 9.3 is the trigger test.** If it takes up to five minutes instead of being immediate, the
    trigger did not install. That is the ceiling doing its job, not an outage — go back to step 6.
    Rows 9.1, 9.2, 9.5, 9.7 and 9.8 are app-side and must be immediate whether or not the trigger
    exists.
11. In the Apps Script editor → Project Settings → Script Properties, a property **`erp_gen`** now
    exists with a millisecond timestamp value. It appears the first time any admin save runs; before
    that the system correctly reads `'0'`.

### Only after the two-browser test passes

12. Change `AUTH_STALENESS_CEILING_SECONDS` on line 33 of `00_Config.js` from `300` to **`3600`**,
    `clasp push`, and redeploy. This is the change that converts the work into the full performance
    win: it drops the periodic B2 read from once per 15 seconds to at most once per hour, and the
    per-role matrix read from once per 120 seconds to at most once per hour.
13. Re-run rows 9.1, 9.3 and 9.7. 9.1 and 9.7 must still be immediate. 9.3 must still be immediate —
    if it is now slow, the trigger has stopped firing, and at ceiling 3600 that is an hour of
    staleness. Revert line 33 to `300` and redeploy while you investigate.

### If you need to roll back

14. Reverting the deploy restores the old keys and the old short TTLs, which self-heal within 120s.
    The `erp_gen` property becomes inert — it is never read by the old code and does not need
    removing. Delete the `onAuthSheetEdit` trigger only if you are rolling back permanently; leaving
    it does no harm, because the old code's `bumpVersion_` is exactly what it calls.

---

## 6. Deferred, per plan §9

- Consolidating the remaining per-request cache `get`s into a single `CacheService.getAll([...])`.
  Worth perhaps 30-50ms; do it only if the perf harness shows it matters *after* the sheet reads are
  gone. The sheet reads were the cost.
- Push freshness — reacting *without* a refresh needs client-side polling. The bar was one refresh.
- `version_companies` unification: three live consumers, same weakness, different blast radius.
- Removing the now-unused `version_users` key. Harmless; leave it until the generation has run in
  production for a while, so a rollback stays trivial.
