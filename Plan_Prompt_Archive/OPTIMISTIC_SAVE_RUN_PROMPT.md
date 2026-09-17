# AppSheet-style saves + the ID_Counter fix — agent prompt

Two pieces of work, in one run, in this order:

**Phase A** — auto-increment ids stop trusting the `ID_Counter` sheet and are always computed from
the **target data table**.
**Phases B–D** — the optimistic-save rollout: integrity first, then 40 forms across four companies.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving four companies (TopChemical, TopLight, ValleyFoods, Assessment), Arabic RTL interface.
Repo root `d:\Work\Script`, remote `origin`
(`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows, and changes no
spreadsheet formula.

**Phase A goes first and it is not optional.** Every id-allocating save in Phases C–D calls the
function Phase A changes. Converting 40 forms first and then changing id allocation underneath them
means re-verifying all 40.

---

## Read these first, in full, before touching anything

1. **[OPTIMISTIC_SAVE_ROLLOUT_PLAN.md](OPTIMISTIC_SAVE_ROLLOUT_PLAN.md)** — your specification for
   Phases B–D. It carries the nine invariants, the three tiers, the census of all 52 pages, the
   order of work and the verification plan. **This prompt orients you; the plan decides.**
2. **`02_DataAccess.js`** — `getNextIdUnderLock_` (~L460), `getNextId_`, `peekNextId_` (~L512),
   `getNextIdBatch_` (~L531), `maxIdOf_`, `executeWithLock_`. Phase A lives here.
3. **`UI_Components.html`** — `UIC.Live` (~L6100): `save` (~L6362), the `[RT-4]` queue (~L6254),
   `drainQueue` / `persistQueue` / `loadQueue`, `userIsBusy`, `arrive`, the init block (~L6657).
   Also `UIC.PagedTable` (~L2484) and its `patchRow` / `removeRow` handle.
4. **`02_DataAccess.js` ~L1185–L1460** — the audit-queue drain. **CLAIM → DEDUPE → MARK → DELETE**,
   with a written crash matrix, deduping on a natural key from existing columns to avoid a schema
   change. Phase B §I1 copies this discipline rather than inventing one.
5. **`tools/verify/s19_live_rollout.js`** and **`tools/verify/run_all.js`**.

Verify a `file:line` reference before you edit it. Line numbers here were taken from a **dirty
working tree** and drift constantly — confirm each one yourself with `grep -n`.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER use the `ID_Counter` sheet for an id

The owner has stated it is unreliable, and the code proves how: `getNextIdUnderLock_` **trusts the
counter whenever it is ahead of the table** (`current > tableMax`) and hands that value out as a
real id, without the table ever being consulted.

* The next id is **always** `max(id in the target table) + 1`.
* You **never** read `ID_Counter` to decide an id.
* You **never** "repair" or reseed `ID_Counter`. It is not written by this run at all.
* You do **not delete the sheet** — other tooling and the migration scripts name it, and deleting a
  tab is a schema change (constraint 3).

## 2. NEVER let two rows get the same id

This is the trap Phase A introduces if applied naively, and it is silent.

Several handlers allocate ids **in a loop** and write the rows **afterwards** in one batched
`setValues` — the work-centre loop in `saveValleyMfgOrder_`
(`Company_ValleyFoods_Actions.js` ~L5685) and the by-product loop just below it. Today the counter
increments even though no row has landed, so each iteration gets a distinct id. With a naive
`max(id) + 1`, **every iteration reads the same unchanged table and returns the same id.**

There is a comment at ~L5650 that reasons explicitly about why today's behaviour is safe. That
reasoning is exactly what you are invalidating — read it, then replace it with one that is true.

The fix keeps constraint 1 intact: seed a high-water mark from `max(id)` once inside the lock and
count up from it for the remainder of that lock, or allocate the whole run up front with
`getNextIdBatch_`. Still derived from the target table; simply not re-reading a table that has not
changed.

## 3. NEVER change any schema

No column added, renamed, removed, reordered or retyped, in any business table, in any of the four
company spreadsheets or the auth spreadsheet. No new sheet, no new tab. **The I1 dedupe uses a
natural key from columns that already exist** — that constraint dictates the design, not the other
way round. If you find yourself wanting a `request_uid` column, re-read plan §4.1.

## 4. NEVER add, edit, or delete data in any business table

No rows written, updated or deleted. No backfills, no test records, no seed data, no cleanup passes.
Not by hand, not by script, not via `clasp run`, not via a one-off function you write and execute.

**Specifically: no duplicate-hunting sweeper.** I1 prevents duplicates at the source. A job that
deletes rows it believes are duplicates is a data-loss engine.

## 5. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never create or
promote a deployment. Never run `clasp login`, `clasp run`, or `clasp open`. Never push to `origin`.
**The owner pushes when everything is finished.**

## 6. NEVER touch the owner's Google account

No triggers, no Script Properties, no running any server function.

## 7. NEVER weaken a validation

Plan §I5. No server handler's checks are relaxed to make an optimistic path feel better. If a Tier B
save refuses too often, that is a finding for the owner, not a licence to loosen a guard.

## 8. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend function
signature, every existing response shape, every HTML anchor id.

Two need care because this run touches them:

* **`UIC.Live.save`'s option shape is additive only.** Seven pages depend on it today.
* **`getNextId_` / `getNextIdBatch_` / `addRecord_` keep their signatures and return types.** Only
  where the number comes from changes.

## 9. Tier C saves are not touched

Fifteen pages keep the blocking overlay, on purpose. If you find yourself converting
`ValleyFoods/MfgOrders`, `Sales` or `SalesReturns`, stop and re-read plan §5.

---

## Starting state

```bash
cd d:/Work/Script
git log --oneline -1        # a69a4d2 docs: data integrity is a first-class constraint of the save rollout
git branch --show-current   # feat/vf-stock-authority
node tools/verify/run_all.js   # All 71 checks pass
git status --porcelain      # ~38 entries, ~18 modified
```

The suite is green at **71 checks**. It must be green at every step and at the end.

`git status` shows **~38 modified and untracked files belonging to several other efforts**.
**Do not stage them, do not revert them, do not clean the tree.**

⚠️ **`UI_Components.html` already carries another effort's uncommitted work**
(`applyDateFilter`, `exportExcel`, `printTable`). You will edit this file heavily. **Never
`git checkout --` it.** Stage **only your own hunks** — commit `b55202b` on this branch shows
exactly how (generate the diff, keep your hunks, `git apply --cached --recount`), and verify the
staged blob parses on its own before committing.

**Create your branch from HEAD and stay on it:**

```bash
git checkout -b feat/optimistic-saves
```

**Stage explicit paths only.** Never `git add -A`, never `git add .`, never `git commit -a`. Do not
push, rebase or merge.

---

## Decisions already made by the owner — do not re-ask

| Decision | Answer |
|---|---|
| Where an id comes from | **`max(id)` in the target table, + 1.** Always. |
| `ID_Counter` | Never read for an id, never written, never repaired, never deleted. |
| "The page cannot be closed until saved" | **Replaced** by "closing the page is safe" — plan §1. It cannot be enforced and is the weaker guarantee. |
| The `beforeunload` prompt | Stays, as a courtesy nudge. Never described as the mechanism. |
| Data integrity vs speed | **Integrity wins.** A form that cannot be fast *and* correct stays slow. |
| Tier C | 15 pages keep the overlay. Not a compromise to fix later. |
| Duplicate prevention | At the source (I1). No reconciliation job, no integrity report, no purge. |
| Assessment company | **In scope.** |
| `ValleyFoods/TestData` | Not converted. A dev fixture page. |
| Schema | Not touched, at all. |

---

## Your task

### Phase A — ids come from the table *(3 commits)*

**A1 — `getNextIdUnderLock_` stops trusting the counter.**
Delete the branch that returns `current` when the counter is ahead of the table. The function
returns `maxIdOf_(targetTable, idColumn) + 1`, and reads nothing from `ID_Counter`. Keep the
signature and the "must already hold the lock" contract. `getNextIdBatch_` already derives
`startId` from `tableMax + 1` — remove only its counter bookkeeping.

**A2 — the in-lock high-water mark.**
Constraint 2. Repeated allocation within one lock must keep counting up without re-reading a table
that has not changed. Seed from `max(id)` on first use per `(dbId, table, idColumn)`, discard when
the lock releases. Then fix the stale reasoning in the comment at
`Company_ValleyFoods_Actions.js` ~L5650.

**A3 — `peekNextId_`.**
It reads `ID_Counter` directly for the UI's "next id" display. Derive it from the table too. It is
read-only and must stay read-only.

**Tests — `tools/verify/s27_id_allocation.js` (new):**
* no id path reads `ID_Counter`; `getNextIdUnderLock_` contains no counter branch
* an empty table yields 1; a table with a gap (1, 2, 7) yields 8, not 3
* a counter **ahead** of the table is ignored — the case that produced wrong ids
* **the loop case**: three allocations inside one lock, with no rows written between them, yield
  three **distinct** consecutive ids. **Mutation-test this**: remove the high-water mark and this
  check must fail. A check that cannot fail is not evidence.
* ids are unique across a simulated batched write of N rows

### Phase B — integrity *(5 commits)*

Plan §4 and §7 steps S1–S5, in that order. Nothing in Phase C starts until Phase B is green.

| | Work | Invariant |
|---|---|---|
| **B1** | Repair the cross-session queue: carry `target_system` on the entry, rebuild `_call` from `API.call` at init, `scheduleRetry()` on load, report undrainable legacy entries. Plan §3. | I2, I6 |
| **B2** | `request_uid` on every queued entry, **stable across retries**; server-side dedupe on a natural key, following the `02_DataAccess.js` CLAIM/DEDUPE precedent. No schema change. | **I1** |
| **B3** | Leader claim + `storage` listener so exactly one tab drains. | I4, I9 |
| **B4** | Pending rows marked and **inert** (follow the `.rt-stale` precedent); `userIsBusy()` counts pending saves; a refresh re-applies pending rows. | I7, I8 |
| **B5** | Failed / undrainable replays become a persistent acknowledged record, not a toast. | I6 |

**Tests — `tools/verify/s26_offline_queue.js` (new)**, one section per invariant, exactly as plan
§8.2 lists them. **Mutation-test I1–I4**: each must be shown to FAIL when its fix is reverted, and
the result recorded in the results doc.

The I1 test must assert the case that actually happens: a **committed-but-unacknowledged** first
attempt, replayed, writes **once**.

### Phase C — the rollout *(7 commits)*

Plan §7 steps S6–S11, and the census in §6.

**C1 (no code)** — confirm the tiering page by page **and decide I3 queueability per action**.
The census is triage, not a verdict: its table count includes tables a handler *reads*
(`ValleyFoods/WorkCenterAssets`, 3 tables but 2 throws, is the obvious suspect). Resolve the five
unmatched actions — `delete_legal_manufacture`, `delete_registration_paper`, `delete_deduction`,
`delete_overtime`, `delete_vacation`. Write the agreed table into the results doc.

**C2** — Tier A, the 3 ValleyFoods watch-only pages (AssetTechnical, Parties, WorkCenters).
**C3–C5** — Tier A, TopChemical, 15 pages, three commits of five.
**C6** — Tier A, TopLight, 4 pages.
**C7** — Tier B, all 14, patch-from-reply via `UIC.PagedTable.patchRow`.
**C8** — Assessment: 3 Tier B pages and the Tier A action on `ResultView`. First company on the
pattern; expect its form shapes to differ, and say so in the results doc if they do.

Tier A rows **never invent a value**: a server-assigned id, a code, or a sheet-formula column
renders as «—» until the reply fills it. Plan §5.

### Phase D — report *(2 commits)*

**D1** — extend `s19_live_rollout.js` to report the real bar (optimistic / watch-only / neither)
plus tier and queueability, so it can never again call a blocking save "converted".

**D2** — `OPTIMISTIC_SAVE_RESULTS.md`: what changed, per phase; the mutation-test results for
A2 and I1–I4; every page re-tiered in C1 and why; what was skipped and why; the owner's checklist.

---

## Phase boundaries are stop points

Each phase is independently shippable and leaves the suite green. **If you run short of room, stop
at a phase boundary and say so** — a finished Phase A + B is worth far more than a half-converted
Phase C. Never leave the tree with some pages converted and the integrity work incomplete.

---

## When you would normally stop

1. **The plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why, continue with the rest.
3. **Genuinely blocked** (needs the owner's account, needs a sheet read) → write it up, mark it
   blocked-on-owner, continue with everything else.
4. **A whole step is unworkable** → report it plainly, do not fake it, move on.

A reported skip is always better than a guess.

**Three things are never acceptable outcomes:** an id path that can hand out a duplicate; a queued
write that can be committed twice; a form marked converted whose save still blocks.

---

## Blocked on the owner — do not guess, and do not let these stall the run

Plan §11. Ask once in the results doc, implement the stated default, and flag it:

1. **«تجاهل» on the chip** — keep it available to any user, or require an admin? *Default: keep,
   and record it as an open question.*
2. **`RETRY_MAX = 5`** — raise it, or retry indefinitely while the chip shows? *Default: leave at 5
   until answered; B5 makes exhaustion visible either way.*
3. **Money forms queued offline** — `TopLight/Cash`, `TopChemical/BudgetCash`, `Debts`, `Trust`.
   *Default: with I1 proven, allow queueing. If I1 is not yet proven for a given handler, that
   handler is **not queueable** (plan §4.3) and rolls back loudly instead.*

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

1. `node --check` every `.js` file you touch, after every step.
2. `node tools/verify/parse_pages.js` — every template you edited must parse.
3. `node tools/verify/ui_smoke_pages.js` — every page must still **boot**. Three fail today and
   failed before this programme began; that number must not become four.
4. `node tools/verify/run_all.js` — the full suite, green, including your new `s26` and `s27`. It
   was green at **71 checks** before you started.
5. **Mutation-test the integrity checks.** A2, I1, I2, I3 and I4 must each be shown to FAIL when
   their fix is reverted. Restore immediately and record the result. `tools/verify/ui4_rowpatch.js`
   on this branch shows the technique.
6. When you stage a hunk of `UI_Components.html`, extract the staged blob
   (`git show :UI_Components.html`) and confirm **it parses on its own** — you are committing a file
   that also contains another effort's work.

**The owner's visual checklist** — specific statements, never "check it looks right":

- Add a row on a Tier A form. It appears **immediately**, marked pending, and its action buttons are
  **disabled** until the server's record replaces it.
- That pending row shows «—» in the id/code column, never a guessed number.
- Kill the network, add a row, close the tab, reopen the page. The chip is there **and the row
  saves by itself** — no click needed.
- Do that same thing but let the request commit before the connection drops. **Exactly one row** is
  written, not two.
- Open the same page in two tabs with a queued change. **One** row is written.
- A Tier B save (حركة المخزن) that the server refuses shows the refusal and **never** paints a row.
- A Tier C form (أمر التصنيع) still shows the blocking overlay, unchanged.
- Add two rows in quick succession on any id-allocating form. Their ids are **consecutive and
  different**.
- On a table where rows were deleted long ago, a new row's id is `max + 1` — it does not reuse a
  gap and does not jump to a stale counter value.

---

## Two traps previous sessions hit

**The Bash heredoc mangles Arabic and backslashes.** `\\` collapses to `\`, and quoting breaks on
mixed RTL content — this repo's files are full of Arabic string literals, and writing a plan file
with a heredoc failed. For any file content with Arabic text, regex escapes, CSS selectors or nested
quoting: use the `Write`/`Edit` tools, or write a Python transform with `Write` and run it. Do not
fight the heredoc.

**Do not rebuild `UIC.Live`.** It already does optimistic rows, rollback, a persisted retry queue
and the navigation guard. This run repairs and extends it. If you find yourself writing a second
save mechanism, stop and re-read plan §2.

---

## Commit protocol

```
<type>(<phase>): <short summary>

<what changed, file by file>
<what was verified, and how — include the mutation-test results>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only; for `UI_Components.html`, stage only your own hunks. **Do not push.**
The owner pushes.

---

## Before you write a single line of code, confirm you understand

1. An id is **`max(id)` in the target table + 1**. `ID_Counter` is never read for an id, never
   written, never repaired, never deleted.
2. Allocating in a loop before the rows land returns the **same id every time** unless you keep an
   in-lock high-water mark. This is the one silent way Phase A breaks production.
3. A transport failure is **ambiguous** — the write may already have committed. Without I1, a retry
   duplicates it. That is why Phase B precedes Phase C.
4. **Tier and queueability are different axes.** A save may be optimistic and not queueable. A save
   that cannot be made idempotent is never queued; it rolls back loudly instead.
5. **Fifteen Tier C pages keep the blocking overlay**, on purpose, and their saves are not touched.
6. No schema change, no row written, no validation weakened, no deploy, no push.
7. Other efforts' uncommitted work is in the tree, **including in `UI_Components.html` which you
   will edit heavily**. You never revert it; you stage only your own hunks.
