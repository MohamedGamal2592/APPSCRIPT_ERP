# AppSheet-style saves, unified across all four companies — plan

**Status:** plan only, nothing implemented.

**Goal (owner):** a form save shows the user their row immediately, writes it in the background,
and the row is never lost.

**Binding constraint (owner):** **data integrity is not traded for speed.** Every tier in §5
preserves the invariants in §4 in full. Where a form cannot be made fast *and* correct, it stays
slow — §4.3 names the rule that decides it, and §5 applies it.

**One correction to the brief, agreed before planning:** *"the page cannot be closed until the data
is inserted"* is replaced by **"closing the page is safe."** Reasons in §1.

---

## 0. The headline number

`tools/verify/s19_live_rollout.js` reports **26 of 59 write pages "converted"**. That label is a
weaker bar than this brief: it counts a page that merely registers a **change watch**. Measured
against *"the save shows a row immediately"*, the real position is:

| | pages |
|---|---|
| Save is optimistic today (`UIC.Live.save`) | **7** |
| Change-watch only — save still blocks | **19** |
| Neither | **26** |
| **Total write pages** | **52** *(+7 done = 59)* |

So the scope is **52 pages**, not the 33 the rollout report implies. The 19 watch-only pages are the
cheapest wins: they already import the machinery and refresh quietly; only the save is still
blocking.

---

## 1. Why "cannot be closed" becomes "closing is safe"

**It cannot be enforced.** Browsers permit only a *generic* confirmation on `beforeunload`; Chrome
and Firefox have ignored custom text since ~2016, so the Arabic message in `guardMessage()` is never
shown to anyone. The user clicks "Leave" and leaves. Nothing intercepts a tab crash, an OS kill, a
flat battery or a tunnel. `e.returnValue` is a request, not a lock.

**It is also the weaker guarantee.** AppSheet does not hold the app open. It is offline-first: it
writes to a local queue and syncs later, *precisely so that closing is safe*.

**And Apps Script cannot do a real background write.** The web app runs in a sandboxed iframe: no
Service Worker, no Background Sync API, and `navigator.sendBeacon` cannot carry a
`google.script.run` call. An in-flight call dies with the tab. Durability therefore lives in a
**persisted queue that drains on the next page load** — which is what `[RT-4]` already is, and what
§3 repairs.

The `beforeunload` prompt stays as a courtesy nudge. It is not the mechanism and must never be
described as one.

---

## 2. What already exists — do not rebuild any of it

`UIC.Live` in `UI_Components.html` is the machinery this brief describes, shipped and pinned by
`s18_live_saves.js` and `s19_live_rollout.js`.

* **`UIC.Live.save(o)`** (~L6362) inserts the draft with a `__pending` flag, closes the modal, shows
  a quiet corner indicator, and returns. On reply the **server's record replaces the draft**. A
  genuine rejection rolls the list back exactly.
* **The retry queue `[RT-4]`** (~L6254) persists to `localStorage` (`erp_live_queue`), retries on
  5s→80s backoff, and shows a permanent chip. Only **transport** failures are retried; a handler
  that refused the payload is never retried.
* **The navigation guard** (~L6668) wires `beforeunload` to `guardMessage()`.
* **`UIC.Live.watchPage`** polls `get_page_versions`. **All four companies implement it.**

There is also an exactly-once precedent to copy rather than reinvent: the audit-queue drain in
`02_DataAccess.js` (~L1185) — **CLAIM → DEDUPE → MARK → DELETE**, with a written crash matrix
("died after WRITE → dedupe finds them → NOTHING DUPLICATED") that dedupes on a **natural key built
from columns that already exist**, specifically to avoid a schema change. §4.1 reuses that
discipline.

---

## 3. The blocker: the queue cannot drain in a new session

**Fix this before any page is converted, or the rollout ships a promise it does not keep.**

The init block (~L6657) claims a change made just before the tab closed *"is retried the moment the
page comes back."* It is not. Three facts, each verified in the source:

1. `persistQueue()` does `JSON.stringify(queue)`. `queue._call` — the function that sends the
   request — is a **property on the array**, and `JSON.stringify` serialises only indexed elements.
   It is silently dropped.
2. `loadQueue()` does `queue = JSON.parse(raw)`, producing a new array with no `_call`.
3. `drainQueue()` opens with `if (!queue.length || !queue._call) { renderChip(); return; }`.

After any reload the queue **renders its chip and can never drain**. «إعادة المحاولة» does nothing.
The write sits in `localStorage` until the user gives up and presses «تجاهل». The init block never
calls `scheduleRetry()` either.

**Fix.** `companyCall` is `API.call('company_action', { target_system, module_action, data },
SESSION_TOKEN)`, so the entry needs **`target_system`**; rebuild the call from `API.call` at init and
`scheduleRetry()` once on load. Legacy entries without `target_system` are undrainable and must be
**reported to the user, never silently dropped** (§4.6).

---

## 4. Data integrity — the invariants, and what each costs

These hold in **every** tier. A tier decides how fast a save *looks*, never whether it is correct.
Each invariant states the risk the optimistic path introduces, the requirement, and the check that
proves it.

### 4.1 · I1 — Exactly once. A retry must never create a second row.

**The risk, and it is the largest one in this design.** A transport failure is *ambiguous*: the
request may have reached the server and **committed** before the connection dropped. The queue
retries it. Nothing in the current path is idempotent — every `add_*` handler appends — so the
retry writes the row **again**. On `add_legal_cash`, `add_stock_scan` or an invoice, that is
duplicated money or duplicated stock.

**Requirement.**
* Every queued write carries a client-generated **`request_uid`**, minted once when the save is
  first attempted and **kept across retries** (a fresh uid per attempt defeats the whole thing).
* The server recognises a `request_uid` it has already committed and answers **success without
  writing again** — the same CLAIM/DEDUPE shape as `02_DataAccess.js`.
* Dedupe uses a **natural key from columns that already exist** (`unique_id`, or
  `record_uid`/`action`/`changed_at` as the audit drain does). **No schema change** — §7.
* Where the client already supplies the row's `unique_id`, that *is* the natural key: re-sending it
  must be recognised, not appended.

**Not negotiable:** a handler that cannot be made idempotent is **not queueable** (§4.3).

### 4.2 · I2 — Never lost.

The persisted queue is the durability mechanism, and §3 currently breaks it. S1 restores it: an
entry survives a tab close, a crash and a reload, and drains on the next load.

### 4.3 · I3 — Queueability is a SEPARATE axis from tier

This is the rule that keeps §5 honest, and the most important sentence in the plan:

> **Tier** decides whether the row is drawn before the server answers.
> **Queueable** decides whether the write may be replayed later.
> They are independent. A save may be optimistic and *not* queueable.

A save is **queueable** only if all three hold:

1. It is idempotent under I1 (a replay cannot duplicate).
2. It does not depend on a value the server assigns to an **earlier** queued write — no queued save
   may consume another queued save's generated id.
3. Replaying it minutes or hours later is still *meaningful* — not a scan tied to a session, not a
   status transition whose precondition has since changed.

**A save that fails any of these is never queued.** On a transport failure it **rolls back and says
so**, loudly, immediately. Losing a write the user is told about beats duplicating a cash row they
are not.

### 4.4 · I4 — One drainer. The multi-tab race.

`erp_live_queue` is a single `localStorage` key shared by every tab on the origin, and there is
**no coordination at all** — no `BroadcastChannel`, no `storage` listener (verified: neither appears
in `UI_Components.html`). Two open tabs both load the queue, both drain it, and each
`persistQueue()` overwrites the other's state: **duplicate sends and lost entries, together.**

**Requirement.** A leader claim in `localStorage` with a short TTL, re-claimed when stale — the same
shape as the audit drain's claim — so exactly one tab drains. Add a `storage` listener so the other
tabs update their chip rather than compete.

### 4.5 · I5 — The server stays the only validator.

No client-side check is relaxed to make an optimistic path feel better, and **no save handler's
validation is weakened anywhere in this programme**. A queued write is validated on the server at
replay time, exactly as if typed then. If it is then refused, that is a correct refusal — not a bug
to design around.

### 4.6 · I6 — A refusal must reach a human.

The integrity this design most easily breaks is not the sheet's, it is **the user's belief**. They
were told "تم الحفظ". Today a replay rejection is a **transient toast**; when the tab is closed, or
the user has moved on, nobody ever learns. The sheet is correct and the user is wrong, which is
worse than an error they saw.

**Requirement.** A failed replay — and an entry too old or undrainable (§3) — goes to a
**persistent, acknowledged** record: the chip stays, naming the record, until a human dismisses it.
Never a toast that can scroll away. `RETRY_MAX` exhaustion must surface the same way.

### 4.7 · I7 — A pending row is marked, and inert.

`draft.__pending` is set (~L6370) but **no page renders it**, and nothing stops a user acting on a
row whose key is still `__tmp_…` — an id the server has never seen. Its action buttons name that id,
so a click acts on nothing, or on the wrong record once ids shift.

The codebase already made this exact call for stale paints: `.rt-stale` rows are drawn **inert**,
with the reasoning written out — *"these rows carry action buttons whose onclick names a record id,
and a click on a row that has since been deleted or renumbered would act on the wrong record."* The
same reasoning applies, and the same treatment: **a pending row is visibly pending and its actions
are disabled until the server's record replaces it.**

### 4.8 · I8 — A quiet refresh must not eat a pending row.

`userIsBusy()` weighs modals, typing, scroll and selection — but **not pending saves**. So
`arrive()` can fire the page's quiet refresh while a write is queued; the refresh redraws from the
server, which does not have the row, and the optimistic row **disappears** while the chip insists it
is pending.

**Requirement.** `userIsBusy()` returns true while `pendingCount() > 0`, *and* a refresh re-applies
pending rows afterwards. Belt and braces: the first defers the collision, the second survives it.

### 4.9 · I9 — Ordering.

The queue drains head-first, one at a time, and must stay that way — a queue that reorders writes
corrupts a sequence of edits. Ordering must survive a reload, not just a session.

---

## 5. The three tiers

The **mechanism** is unified — one `UIC.Live` API, one queue, one guard, one chip, four companies.
The **treatment** is tiered, because not every save can honestly show a row before the server has
seen it.

### Tier A — optimistic row

*One table; everything that can refuse the save is visible in the form (required, format, range).*

Full `UIC.Live.save` with a draft row — the AppSheet behaviour in the brief.

**Never invent a value.** A cell the server assigns — an id from `getNextIdUnderLock_`, a code, a
sheet-formula column such as `work_center_cost` — renders as «—» in the pending row and is filled
from the reply. A temp row that guesses a code the sheet will assign differently is worse than a
spinner, because the user writes it down.

Tier A rows obey I7 (marked, inert) and I8 (survive a quiet refresh). Tier A is queueable **only
if** it passes I3; otherwise it is optimistic in-session and rolls back on a transport failure.

### Tier B — patch from the reply

*Two tables, or a handler that can refuse for reasons invisible in the form* — a stock balance, a
cross-row duplicate, a closed period.

Non-blocking save, quiet indicator, row patched **from the response**. No optimistic insert, so
there is nothing to roll back and I7 does not arise. Still one round trip and no reload; it simply
does not paint a row it may have to take away. This is what `changeStatus` on `vf_mfg_orders` does
(commit `b55202b`), and `UIC.PagedTable.patchRow` already exists for it.

A Tier B save that rolls back often is worse than a spinner. That is the entire reason this tier
exists.

### Tier C — keep the blocking overlay

*Three or more tables, or a multi-document transaction.*

No single row to draw, the save genuinely takes seconds, and an overlay is the honest UI. These
pages still get `watchPage` and quiet refresh; **their save is not touched**, so their integrity is
unchanged by construction.

### Tier is a property of the ACTION, not the page

`Assessment/ResultView` proves it: `add_ac_review_decision` touches one table (Tier A) while
`add_ac_candidate_grade` touches four (Tier C). Pages below are listed by their *heaviest* action;
each page is converted action by action.

### Invariant coverage by tier

| | Tier A | Tier B | Tier C |
|---|---|---|---|
| I1 exactly once | required (if queued) | required (if queued) | n/a — not queued |
| I2 never lost | queue | queue | blocking save, user waits |
| I3 queueable | tested per action | tested per action | never queued |
| I4 one drainer | shared fix | shared fix | n/a |
| I5 server validates | unchanged | unchanged | unchanged |
| I6 refusal reaches a human | required | required | on screen already |
| I7 pending row inert | **required** | n/a — no draft | n/a |
| I8 refresh-safe | **required** | required | n/a |
| I9 ordering | shared fix | shared fix | n/a |

---

## 6. The census

Produced mechanically from the real handlers: tables named in the handler body, count of
`throw new Error`, id allocation, sheet formulas.

> **Triage, not a verdict.** The table count includes tables a handler *reads*, so some Tier C
> entries drop to B once looked at (`ValleyFoods/WorkCenterAssets` — 3 tables but only 2 throws — is
> the obvious suspect). Every page gets a confirmation pass (S2) before conversion, **including its
> I3 queueability**, and any re-tier is recorded in the results doc.

### Tier A — 23 pages

| Page | notes |
|---|---|
| ValleyFoods/AssetTechnical, Parties, WorkCenters | watch-only today; the cheapest three |
| TopChemical/BoxAnalysis, BudgetHR, BudgetInputs, BudgetParties, CustomsOffice, EmpDeductions, EmpOvertime, EmpPermits, EmployeeStatus, RegistrationPapers | |
| TopChemical/BudgetCash, BudgetManufacture | sheet formulas → placeholder cells |
| TopChemical/Debts, EmployeeSalary, Employees, Trust | server-assigned id → placeholder cell |
| TopLight/Cash | server-assigned id; **money — I1 before queueing** |
| TopLight/Purchasing, Sales, Sales_Offer | |

### Tier B — 14 pages

| Page | why |
|---|---|
| ValleyFoods/Deductions, Overtime | 2 tables |
| ValleyFoods/Purchasing | 2 tables, id-alloc, 9 throws |
| ValleyFoods/WarehouseMovement | 11 throws — the batch-availability guard refuses |
| TopChemical/BudgetInvoices, EmpSalaries | 2 tables |
| TopChemical/CartonSizes, StockRevision, StockScan | 8 throws |
| TopChemical/ImportFollow, Purchasing | 10 throws, id-alloc |
| Assessment/AssessmentForm, Assessments, Batches | 2 tables |

### Tier C — 15 pages

| Page | why |
|---|---|
| ValleyFoods/MfgOrderView, MfgOrders | 11 tables, 13 throws — the MO save |
| ValleyFoods/Sales | 7 tables, 21 throws |
| ValleyFoods/SalesReturns | 12 tables |
| ValleyFoods/Attendance, MfgRecipes | 4 tables |
| ValleyFoods/Contracts, HR_Emp, ShiftAssignment, VacationAlloc, Vacations, WorkCenterAssets | 3 tables |
| ValleyFoods/TestData | dev fixture page — convert last or never |
| TopLight/Sales_Returns | 3 tables, id-alloc |
| Assessment/ResultView | `add_ac_candidate_grade` writes 4 |

**Split: 23 A / 14 B / 15 C.** Tier C is the largest single group and none of it changes. That is
the plan's most important line: **roughly a third of the forms keep the overlay, on purpose.**

Five actions could not be resolved to a handler from the `register()` table and need a manual look:
`delete_legal_manufacture`, `delete_registration_paper`, `delete_deduction`, `delete_overtime`,
`delete_vacation`.

---

## 7. Order of work

Each step is one commit. **The integrity steps come first.** Nothing is converted until a queued
write is provably exactly-once, because a fast form that duplicates a cash row is a worse product
than the slow one it replaced.

| Step | Work | Invariant |
|---|---|---|
| **S1** | Repair the cross-session queue (§3): carry `target_system`, rebuild `_call` at init, `scheduleRetry()` on load, report undrainable legacy entries. | I2, I6 |
| **S2** | `request_uid` on every queued entry, stable across retries; server-side dedupe on a natural key, following the `02_DataAccess.js` CLAIM/DEDUPE precedent. **No schema change.** | **I1** |
| **S3** | Leader claim + `storage` listener so exactly one tab drains. | I4, I9 |
| **S4** | Pending rows marked and inert (`.rt-stale` precedent); `userIsBusy()` counts pending saves; a refresh re-applies pending rows. | I7, I8 |
| **S5** | Failed / undrainable replays become a persistent acknowledged record, not a toast. | I6 |
| **S6** | Confirm the tiering page by page **and decide I3 queueability per action**; write the agreed table into the results doc. No code. | I3 |
| **S7** | Tier A — the 3 ValleyFoods watch-only pages. Proves the pattern on a company already fully on `UIC.Live`. | |
| **S8** | Tier A — TopChemical, 15 pages, in 3 commits of 5. | |
| **S9** | Tier A — TopLight, 4 pages. | |
| **S10** | Tier B — all 14, patch-from-reply. | |
| **S11** | Assessment — 3 Tier B pages and the Tier A action on ResultView. First company on the pattern; expect different form shapes. | |
| **S12** | Extend `s19_live_rollout.js` to report the real bar (optimistic / watch-only / neither) plus tier and queueability, so it can never again call a blocking save "converted". | |
| **S13** | Results doc + owner checklist. | |

---

## 8. Verification

Offline only — no browser, no spreadsheet, as with every other programme here.

1. `node tools/verify/run_all.js` green at every step (71 checks today).
2. **New `tools/verify/s26_offline_queue.js`**, one section per invariant, dry-run under `domstub`:
   * **I1** the same entry replayed twice writes **once** — and the dedupe is asserted against a
     *committed-but-unacknowledged* first attempt, which is the case that actually happens;
     `request_uid` is stable across retries.
   * **I2** a queued entry survives a simulated reload (`loadQueue` from a fresh array) and
     **drains** — the exact case broken today.
   * **I3** a non-idempotent action is **refused entry to the queue** and rolls back instead.
   * **I4** two simulated tabs produce **one** send, not two.
   * **I5** a handler rejection is never queued.
   * **I6** an exhausted or undrainable entry leaves a persistent record, not a toast.
   * **I9** order is preserved across a reload.
3. **Mutation-test the integrity checks.** Each of I1–I4 must be shown to FAIL when its fix is
   reverted; a check that cannot fail is not evidence. Record the results in the doc, as
   `ui4_rowpatch.js` did.
4. Per-tier assertions: no Tier A page renders a fabricated id/code; no Tier A pending row keeps its
   action buttons enabled; no Tier B page passes `draft`; **no Tier C save was touched**.
5. `parse_pages.js` and `ui_smoke_pages.js` after every page batch.

---

## 9. Hard constraints

* **No schema change.** No column, sheet or tab added, renamed, removed, reordered or retyped, in
  any of the four company spreadsheets or the auth spreadsheet. The I1 dedupe uses a natural key
  from existing columns — that constraint is what dictates the design, not the other way round.
* **No data written by this programme.** No rows created, edited or deleted; no backfills, no seed
  data, no cleanup passes.
* **No deploy.** No `clasp push`, no deployment, no `clasp run`/`login`/`open`, no push to `origin`.
  The owner pushes.
* **No public contract broken.** `UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`,
  `SESSION.*`, every backend signature, every response shape, every HTML anchor id.
  `UIC.Live.save`'s option shape is **additive only** — 7 pages depend on it.
* **No validation weakened.** I5. If a Tier B save refuses too often, that is a finding for the
  owner, not a licence to loosen a guard.
* **The tree is dirty with other efforts' work,** `UI_Components.html` included. Never revert those
  files; stage explicit paths, and where a shared file is mixed, stage only your own hunks (as
  commit `b55202b` did).

---

## 10. Explicitly not doing

* **Not making the page unclosable.** §1.
* **Not touching Tier C saves.** 15 pages keep the overlay by design.
* **No Service Worker, no Background Sync, no offline read cache.** Unavailable in the Apps Script
  iframe, and out of scope regardless.
* **Not converting `ValleyFoods/TestData`** — a dev fixture page, not a user form.
* **No reconciliation job, no duplicate-hunting report.** I1 prevents duplicates at the source. A
  sweeper that deletes rows it believes are duplicates is a data-loss engine, and this programme
  writes no rows.

---

## 11. Open questions for the owner

1. **«تجاهل» on the chip.** It discards an unsaved change on confirmation. With I6 in place, should
   discard remain available to any user, or require an explicit admin action? Discarding a real
   write is the one remaining way this system can lose data on purpose.
2. **`RETRY_MAX = 5`** — five failures over ~2.5 minutes, then the entry is dropped with a toast.
   Short for a phone in a warehouse. Raise it, or retry indefinitely while the chip shows (I6 makes
   the second option safe)?
3. **Which Tier A forms may be queued at all.** I3 is a mechanical test, but the judgement on
   *money* forms — `TopLight/Cash`, `TopChemical/BudgetCash`, `Debts`, `Trust` — is yours: is an
   offline-queued cash row acceptable once I1 guarantees exactly-once, or should those always fail
   loudly instead of queueing?
4. **Assessment forms** are unseen by this programme. If their shapes differ materially, S11 may
   need its own small plan.
