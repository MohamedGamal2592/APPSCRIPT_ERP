# Real-time kill switch + authority matrix — agent prompt

Make three things **one-refresh real-time** across the whole ERP — the system on/off switch, the
authority matrix, and the user's own role / company / status — while **removing** the periodic
spreadsheet reads that pay for today's much weaker freshness.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows, creates no
trigger, sets no Script Property, and deploys nothing.

**Branch.** Create `feat/realtime-authority` off `master` before your first commit.

---

## Read these first, in full, before touching anything

1. **[REALTIME_AUTHORITY_PLAN.md](REALTIME_AUTHORITY_PLAN.md)** — your specification. It carries the
   verified evidence, the design rationale, the exact code for every change, and the rollout order.
   **This prompt orients you and sequences you; the plan decides.**
2. **`00_Config.js`**, **`02_DataAccess.js`** (the versioned-cache block ~L770-800, `getRefsCached_`
   ~L614, `resetRecordCache_` ~L43), **`03_Security.js`** (`authenticateSystemUser_` ~L136,
   `getRoleAuthorityMatrix_` ~L360, `isSystemEnabled_` ~L495) and **`Code.js`** (`doGet` ~L12,
   `apiRouter_` ~L322, `installTriggers_` ~L1106).
3. **`tools/verify/run_all.js`**, **`tools/verify/domstub.js`** and **`tools/verify/pageharness.js`**
   — the offline suite you will extend and the `vm`-sandbox technique you will reuse.

Verify a `file:line` reference before you edit it. Line numbers in this prompt and in the plan were
taken at HEAD `c74232f` and drift with every commit — **confirm each one yourself in R0.**

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema

No column may be added, renamed, removed, reordered or retyped, in any company spreadsheet or the
auth spreadsheet. No new sheet, no new tab.

This run needs none. `ScriptProperties` is not a spreadsheet — that is the whole point of the design.
`ensureSystemWorkSheet_` (03_Security.js ~L452) *can* create a sheet; you are modifying the function
that calls it, not that function. **Leave `ensureSystemWorkSheet_` exactly as it is.**

## 2. NEVER add, edit, or delete data in any business table

No rows, no cells, no backfills, no test records, no seed data. Not by hand, not by script, not via
`clasp run`, not via a one-off function you write and execute.

**This includes `ERP_Pages_Matrix` and `ERP_system_work!B2`.** You are changing how those two are
*read*. You never write to either.

## 3. NEVER touch the owner's Google account

**No triggers. No Script Properties. No running any server function.**

This constraint has one specific trap in this run. You are writing code that creates a trigger
(`installTriggers_`) and code that writes a Script Property (`bumpAuthGeneration_`). **Writing that
code is your job. Executing it is not.** Do not run `install_triggers`, do not open the Apps Script
editor, do not call `PropertiesService` from any script you run locally.

`authGeneration_` is deliberately written to **read** Properties and never write them, so that a
deployment with no property set bootstraps correctly at `'0'`. Do not "helpfully" add a write there
— it would turn every anonymous page load into a Properties write.

## 4. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never create or
promote a deployment. Never run `clasp login`, `clasp run` or `clasp open`. Never push to `origin`.
**The owner pushes and deploys.**

## 5. NEVER break a public contract

`userNameMap_` keeps its name, signature and exact return shape — it is consumed at Code.js:110.
`isSystemEnabled_`, `getRoleAuthorityMatrix_`, `authenticateSystemUser_`, `bumpVersion_`, `onEdit`
and every `SessionManager_.*` member keep theirs. No response shape changes. **No client file is
edited in this run** — no `.html`, no `UI_Components`, no `Client_Helpers`.

## 6. Stay inside your file set

You may edit exactly these:

```
00_Config.js
02_DataAccess.js
03_Security.js
Code.js
tools/verify/run_all.js
```

You may create exactly these:

```
tools/verify/gasstub.js
tools/verify/s16_realtime_authority.js
REALTIME_AUTHORITY_RESULTS.md
```

Plus one appended section in `NEXT_STEPS_OWNER.md`.

**`src_html/**` is a scratch copy excluded by `.claspignore` — do not edit it, do not sync it.**
Anything else is out of bounds; if a change seems to require it, stop and write it up instead.

---

## Autonomy — run all nine phases without stopping

**You do not need approval between phases. Do not ask for it.** Work R0 → R8 in order, commit at the
end of each, and continue straight into the next. Do not summarise-and-wait, do not ask "shall I
continue", do not stop to confirm a decision the plan already made. The only thing that ends this run
early is a hard constraint you cannot satisfy without violating it.

### When you would normally stop

1. **The plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe or already done** → skip it, record why in the results doc, continue.
3. **Genuinely blocked** (needs the owner's Google account, needs a real deployment, needs a
   spreadsheet read) → write it up, mark it blocked-on-owner, continue with everything else.
4. **A whole phase is unworkable** → report it plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess. **A phase reported as done that quietly weakens the
authority gate is the one outcome that is not acceptable.**

---

## Your task

### R0 — Recon *(no edits, no commit)*

1. `git checkout -b feat/realtime-authority`.
2. Confirm every `file:line` in plan §1 and §3 against the current HEAD. Record the drift.
3. Confirm the four facts the design rests on, and **say so explicitly in the results doc**:
   - `.clasp.json` has a bare `scriptId` and no container → `onEdit` at 02_DataAccess.js:776 is a
     simple trigger that has never fired.
   - `installTriggers_` (Code.js ~L1106) creates only time-based triggers.
   - `version_users` is written (02_DataAccess.js ~L793) and read by **nothing**. Prove it with a
     repo-wide grep and paste the output.
   - `appsscript.json` has `"executeAs": "USER_DEPLOYING"`, so `CacheService.getScriptCache()` and
     `PropertiesService.getScriptProperties()` are shared across all end users.
4. If any of the four is false, **stop and report** — the design depends on all four.

### R1 — `00_Config.js`: the tunables *(one commit)*

Plan §3.1. Two values changed, three added, every one carrying the comment that says the invariant
moved from expiry to the generation.

`AUTH_STALENESS_CEILING_SECONDS` ships at **300**, not 3600. That is the rollout value (plan §6);
raising it is the owner's step 5.

### R2 — `02_DataAccess.js`: the generation *(one commit)*

Plan §3.2, §3.3, §3.4.

- `authGeneration_` and `bumpAuthGeneration_`, with the `_genMemo_` / `_ksMemo_` module vars.
- `bumpVersion_` gains the generation hook — **additive**, the existing per-sheet version keys stay.
  `version_companies` has three live consumers and is out of scope.
- `onAuthSheetEdit` holds the body; `onEdit` is retained as a one-line delegate.
- `resetRecordCache_` clears both memos.

Three details the plan is explicit about and a fast reading loses:

- `bumpAuthGeneration_` writes **Properties before cache**, and the mirror TTL is `60` (not `21600`)
  when the durable write threw. Both halves matter.
- `authGeneration_` folds in the time bucket. Without it the trigger becomes load-bearing and a
  failed install turns 120s of staleness into 6 hours.
- `authGeneration_` never writes Properties. See hard constraint 3.

### R3 — `02_DataAccess.js`: the user directory *(one commit)*

Plan §3.5. `userDirectory_` keyed by the generation; `userNameMap_` becomes a projection over it and
**keeps its exact contract**.

This costs nothing: `userNameMap_()` already read `ERP_Users` on every page load (Code.js:110). You
are replacing a 300s TTL with a generation key on a read that already happens.

### R4 — `03_Security.js`: kill switch and matrix on the generation *(one commit)*

Plan §3.7 and §3.8. Only the cache keys, the TTL sources and the memo change. The flag-reading and
matrix-building logic is untouched.

Two fail-safes you must preserve deliberately, and assert in R7:

- A kill-switch read that **threw** gets `CACHE_AUTH_FAILREAD_SECONDS`, never
  `CACHE_KILLSWITCH_SECONDS`. Caching a fail-open default for six hours would hide a real shutdown.
- `getRoleAuthorityMatrix_`'s structural bail (`roleIdx === -1 || pageIdx === -1`) and its outer
  `catch` both return `{}` **without caching**. They fail closed and must stay uncached.

### R5 — `03_Security.js`: the live identity overlay *(one commit)*

Plan §3.6. The change that makes role, company and status real-time. **`SessionManager_.validate` is
not touched** — its job is session validity, correctly cached for the session lifetime.

The asymmetry is the whole point and must survive review:

- **Empty directory → fail OPEN** (fall back to the session's role). An empty map is
  indistinguishable from a transient read failure, and must not log every user out at once.
- **Populated directory missing this email → fail CLOSED** (`ACCOUNT_REMOVED`).
- **Present but not Active → fail CLOSED** (`ACCOUNT_DISABLED`).

Confirm, and record in the results doc, that both callers already handle `authorized: false`:
`doGet` renders the expired interstitial (Code.js ~L65) and `apiRouter_` returns `SESSION_EXPIRED`
(Code.js ~L359). **If either does not, stop and write it up rather than editing a client file.**

### R6 — `Code.js`: the installable trigger *(one commit)*

Plan §3.9. `installTriggers_` gains `onAuthSheetEdit` in both the delete sweep (so it stays
idempotent) and the create block, wrapped in its own try/catch so a trigger-scope failure cannot take
down the daily-backup install beside it.

Also correct the two comments that document behaviour which never existed: Code.js:484 and
03_Security.js:491. Say plainly that the simple trigger never fires and what replaces it.

**You write this code. You do not run it.** Hard constraint 3.

### R7 — `tools/verify/gasstub.js` + `s16_realtime_authority.js` *(one commit)*

This is the phase that decides whether the run is trustworthy, so it gets the most attention.

**Grep assertions alone are not acceptable here.** The whole change is cache *semantics*; source text
matching cannot prove an invalidation actually invalidates. The repo already has the technique —
`tools/verify/domstub.js` builds a `vm` context and `pageharness.js` runs real source inside it.

**`tools/verify/gasstub.js`** — the same idea for Apps Script services. A `vm` sandbox exposing:

- `CacheService.getScriptCache()` over a `Map`, honouring TTL against a **controllable clock**, with
  an `evict(key)` hook and a `failNextPut()` hook.
- `PropertiesService.getScriptProperties()` over a `Map`, with a `failNextSet()` hook.
- A settable `NOW` so bucket rollover can be tested without waiting.
- `CONFIG`, `console`, and stubs for `getSheet_` / `getAllRecords_` / `readSystemWorkFlag_` /
  `ensureSystemWorkSheet_` / `getRefsCached_` so the real functions can be loaded and executed.

Load the **real** `00_Config.js`, `02_DataAccess.js` and `03_Security.js` source into it. They are
plain `.js` with no `<? ?>` scriptlets, so they need no substitution pass.

**`s16_realtime_authority.js`** — behavioural assertions first, source assertions second.

Behavioural (these must actually execute):

1. Two "users" read the same generation → identical key. `bumpAuthGeneration_()` → both now compute a
   **different** key. *This is the one-refresh property.*
2. `bumpVersion_('ERP_Pages_Matrix')` changes the matrix cache key; `bumpVersion_('ERP_Companies')`
   does **not**.
3. Evict `erp_gen` from cache → `authGeneration_` falls back to Properties and returns the **same**
   base, not `'0'`.
4. Nothing in Properties and nothing in cache → `'0'`, no throw, and **no Properties write**.
5. `failNextSet()` on Properties → `bumpAuthGeneration_` still bumps, and the cache mirror TTL is
   **60**, not 21600.
6. Advance `NOW` past a `AUTH_STALENESS_CEILING_SECONDS` boundary with no bump at all → the key
   changes. *This is the ceiling.*
7. `isSystemEnabled_` with `readSystemWorkFlag_` returning `0` → `false`; flip to `1` and bump →
   `true` on the next call. Without a bump and within TTL → still `false` (proves it is cached).
8. `isSystemEnabled_` with `ensureSystemWorkSheet_` throwing → returns `true` (fail-open) **and** the
   cache entry TTL is `CACHE_AUTH_FAILREAD_SECONDS`.
9. `getRoleAuthorityMatrix_` with a sheet missing `role`/`page_id` → `{}` and **nothing cached**.
10. `authenticateSystemUser_` with a directory whose role differs from the session's role → the
    **directory** role reaches `getRoleAuthorityMatrix_`.
11. Directory empty → session role used, still authorized (fail open).
12. Directory populated without the email → not authorized, `ACCOUNT_REMOVED`.
13. Directory has the email with `status: 'InActive'` → not authorized, `ACCOUNT_DISABLED`.
14. `userNameMap_()` still returns a flat email → name object.

Source assertions (cheap regressions the behaviour cannot catch):

15. `CACHE_KILLSWITCH_SECONDS` and `CACHE_MATRIX_SECONDS` are both `>= 3600` — a future "let's make
    it fresher" TTL cut would silently reintroduce the sheet-read load this run removes.
16. `AUTH_STALENESS_CEILING_SECONDS` is present and `<= 3600`.
17. No authority read references `version_killswitch` or `version_matrix` any more.
18. `installTriggers_` creates `onAuthSheetEdit` via `.forSpreadsheet(...).onEdit()` and deletes any
    prior instance first.
19. `resetRecordCache_` clears `_genMemo_` and `_ksMemo_`.

Register in `run_all.js` as
`['s16_realtime_authority.js', 'S16 — authority generation: kill switch, matrix and role are one-refresh']`.

### R8 — `REALTIME_AUTHORITY_RESULTS.md` and handover *(one commit)*

- What changed, file by file, with final line numbers.
- The R0 evidence, including the `version_users` grep output.
- Every s16 assertion and its result. Paste the `run_all.js` tail.
- Anything skipped, and why.
- The **owner's checklist**, copied from plan §5 and §8 and written as specific statements — never
  "check it looks right". Append the same to `NEXT_STEPS_OWNER.md`.

State the rollout order plainly at the top, because getting it wrong is the one way this change makes
things worse: **deploy at ceiling 300 → owner runs `install_triggers` → owner confirms the trigger is
listed against the AUTH spreadsheet → owner runs the two-browser test → only then raise the ceiling
to 3600 and redeploy.**

---

## Verification — you cannot see a browser, a spreadsheet, or a deployment

After **every** phase:

1. `node --check` each `.js` file you touched.
2. `node tools/verify/run_all.js` — the whole suite, green.

The suite must be green at the end of every phase, not only at the end of the run. R1 through R6
change server files that no existing check loads, so they should not perturb it; **if the suite goes
red after a phase, fix it in that phase.**

You cannot prove the trigger fires, the deployment works, or that a second browser sees the change.
Those are owner steps — plan §8. Do not simulate them and do not report them as verified.

---

## Traps this run will hit

**The Bash heredoc mangles content.** Writing this plan's own document broke a `<<'EOF'` heredoc.
For any file with regex escapes, nested quoting, `**`, or Arabic text — **use `Write`/`Edit`. Do not
fight the heredoc.**

**`CacheService.put` defaults to 600s, and the max is 21600.** Any TTL you pass above 21600 is
rejected. `21600` is the ceiling, not an arbitrary large number.

**A generation-keyed cache leaves old entries behind.** Superseded `mx_g*` / `ks_g*` / `user_dir_g*`
entries linger until their own TTL and are reclaimed by LRU. That is expected and harmless — do not
"fix" it by adding a sweep, which would cost more than it saves.

**`getRefsCached_` chunks.** `userDirectory_` may exceed the ~100KB single-value cap on a large
`ERP_Users`; `getRefsCached_` (02_DataAccess.js ~L614) already handles that. Use it. Do not call
`cache.put` directly for the directory.

**The memo and the toggle collide.** `apiRouter_` calls `isSystemEnabled_` *before* the handler, so
`_ksMemo_` is already set when `toggleKillSwitch_` flips the flag inside that same execution. That is
why `bumpAuthGeneration_` clears `_ksMemo_` as well as `_genMemo_`. Do not drop that line.

**Fail-open and fail-closed are not stylistic.** Plan §3.6 and §3.7 each specify a direction for each
failure mode, and they are not the same direction. Getting one backwards either locks every user out
of a working system or lets a disabled account keep working. Re-read them before you write them.

---

## Commit protocol

```
feat(rta-R<n>): <short summary>

<what changed, file by file>
<what was verified, and how — name the s16 assertions that cover it>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. One commit per phase. **Do not push.** The owner pushes.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema, and you will **not** touch `ensureSystemWorkSheet_`.
2. You will **not** write to any business table, **including `ERP_Pages_Matrix` and
   `ERP_system_work!B2`** — you are changing how they are read.
3. You will **not** create a trigger, set a Script Property, deploy, push, or run any server
   function. You write that code; the owner runs it.
4. You will **not** edit any `.html` file, and **not** `src_html/`.
5. `userNameMap_` keeps its exact contract; `SessionManager_.validate` is not touched.
6. `AUTH_STALENESS_CEILING_SECONDS` ships at **300**. Raising it to 3600 is the owner's step, after
   the trigger is confirmed.
7. The generation is what makes the system fresh; the TTLs no longer are. Shortening a TTL does not
   make anything fresher — it only adds spreadsheet reads.
8. R7 proves behaviour by **executing** the real functions against stubbed Apps Script services. A
   grep-only s16 does not satisfy this phase.
9. You run R0 → R8 without pausing for approval.
