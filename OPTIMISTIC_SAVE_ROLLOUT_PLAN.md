# AppSheet-style saves, unified across all four companies — plan

**Status:** plan only, nothing implemented.

**Goal (owner):** a form save shows the user their row immediately, writes it in the background,
and the row is never lost.

**One correction to the brief, agreed before planning:** the requirement
*"the page cannot be closed until the data is inserted"* is replaced by
**"closing the page is safe."** Reasons in §1. Everything else stands.

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

So the scope is **52 pages**, not the 33 the rollout report implies. The 19 watch-only pages are
the cheapest wins in the whole programme: they already import the machinery and already refresh
quietly; only the save call itself is still blocking.

---

## 1. Why "cannot be closed" becomes "closing is safe"

**It cannot be enforced.** Browsers permit only a *generic* confirmation on `beforeunload`; Chrome
and Firefox have ignored custom text since ~2016, so the Arabic message in `guardMessage()` is
never shown to anyone. The user clicks "Leave" and leaves. Nothing intercepts a tab crash, an OS
kill, a flat battery or a tunnel. `e.returnValue` is a request, not a lock.

**It is also the weaker guarantee.** AppSheet does not hold the app open. It is offline-first: it
writes to a local queue and syncs later, *precisely so that closing is safe*. The brief asks for the
opposite guarantee and would ship a worse one.

**And Apps Script cannot do a real background write.** The web app runs in a sandboxed iframe:
no Service Worker, no Background Sync API, and `navigator.sendBeacon` cannot carry a
`google.script.run` call. An in-flight call dies with the tab. Durability therefore has to live in a
**persisted queue that drains on the next page load** — which is what `[RT-4]` already is, and what
§3 fixes.

The `beforeunload` prompt stays, as a courtesy nudge. It is not the mechanism and must never be
described as one.

---

## 2. What already exists — do not rebuild any of it

`UIC.Live` in `UI_Components.html` is the machinery this brief describes. It is shipped and pinned
by `s18_live_saves.js` and `s19_live_rollout.js`.

* **`UIC.Live.save(o)`** (~L6362) inserts the draft row with a `__pending` flag, closes the modal,
  shows a quiet corner indicator instead of the blocking overlay, and returns. When the reply lands
  the **server's record replaces the draft** — it carries the assigned id and every computed field.
  A genuine rejection rolls the list back exactly.
* **The retry queue `[RT-4]`** (~L6254) persists to `localStorage` under `erp_live_queue`, retries
  on 5s→10s→20s→40s→80s backoff, and shows a permanent chip with «إعادة المحاولة» / «تجاهل».
  Only **transport** failures are retried; a handler that refused the payload is never retried.
* **The navigation guard** (~L6668) already wires `beforeunload` to `guardMessage()`.
* **`UIC.Live.watchPage`** polls `get_page_versions` so a row another user changed arrives quietly.
  **All four companies implement that endpoint**, so nothing is blocked on the server.

The work is a rollout and one repair, not a new mechanism.

---

## 3. The blocker: the queue cannot drain in a new session

**This must be fixed before any page is converted, or the rollout ships a promise it does not keep.**

The init block at ~L6657 says *"a change made just before the tab was closed … is retried the moment
the page comes back."* It is not. Three facts, each verified in the source:

1. `persistQueue()` does `JSON.stringify(queue)`. `queue._call` — the function that actually sends
   the request — is a **property on the array**, and `JSON.stringify` serialises only indexed
   elements. It is silently dropped.
2. `loadQueue()` does `queue = JSON.parse(raw)`, producing a brand-new array with no `_call`.
3. `drainQueue()` opens with `if (!queue.length || !queue._call) { renderChip(); return; }`.

So after any reload the queue **renders its chip and can never drain**. Pressing «إعادة المحاولة»
does nothing. `queue._call` is only ever set at ~L6420, inside the same session whose save failed.
The write sits in `localStorage` until the user gives up and presses «تجاهل».

There is a second gap behind it: the init block never calls `scheduleRetry()` at all, so even with a
`_call` in hand nothing would start.

**Fix.** The queue entry must carry everything needed to rebuild the call. It stores
`{action, data, message, tries, at}` today; `companyCall` is
`API.call('company_action', { target_system, module_action, data }, SESSION_TOKEN)`, so the missing
piece is **`target_system`**. Add it to the entry, rebuild the call from `API.call` at init, and
`scheduleRetry()` once on load if the queue is non-empty. Old entries without `target_system` are
undrainable and must be reported to the user, not silently dropped.

---

## 4. The three tiers

The mechanism is unified — one `UIC.Live` API, one queue, one guard, one chip, all four companies.
The **treatment** is tiered, because not every save can honestly show a row before the server has
seen it.

### Tier A — optimistic row

*One table; everything that can refuse the save is visible in the form (required, format, range).*

Full `UIC.Live.save` with a draft row. This is the AppSheet behaviour in the brief.

**Rule for Tier A rows: never invent a value.** A cell the server assigns — an id from
`getNextIdUnderLock_`, a code, a sheet-formula column such as `work_center_cost` or `total_cost` —
renders as a placeholder («—») in the pending row and is filled from the reply. A temp row that
guesses a code the sheet will assign differently is worse than a spinner, because the user writes
it down.

### Tier B — patch from the reply

*Two tables, or a handler that can refuse for reasons the user cannot see in the form* — a stock
balance, a duplicate across rows, a period already closed.

Non-blocking save, quiet indicator, and the row is patched **from the response**. No optimistic
insert, so there is nothing to roll back. Still one round trip and no reload; it simply does not
paint a row it might have to take away. This is the treatment applied to `changeStatus` on
`vf_mfg_orders` (commit `b55202b`), and `UIC.PagedTable.patchRow` already exists for it.

A Tier B save that rolls back often is worse than a spinner. That is the whole reason this tier
exists.

### Tier C — keep the blocking overlay

*Three or more tables, or a multi-document transaction.*

There is no single row to draw, the save genuinely takes seconds, and an overlay is the honest UI.
These pages still get `watchPage` and quiet refresh, but their save is left alone.

### Tier is a property of the ACTION, not the page

`Assessment/ResultView` proves it: `add_ac_review_decision` touches one table (Tier A) while
`add_ac_candidate_grade` touches four (Tier C). Pages are listed below by their *heaviest* action;
each page is converted action by action.

---

## 5. The census

Produced mechanically from the real handlers: tables named in the handler body, count of
`throw new Error`, and whether it allocates an id or writes sheet formulas.

> **This is triage, not a verdict.** The table count includes tables the handler *reads*, so some
> Tier C entries are Tier B once looked at (`ValleyFoods/WorkCenterAssets` — 3 tables but only 2
> throws — is the obvious suspect). Every page gets a five-minute confirmation before conversion,
> and any re-tier is recorded in the results doc.

### Tier A — 23 pages

| Page | notes |
|---|---|
| ValleyFoods/AssetTechnical, Parties, WorkCenters | watch-only today; the cheapest three in the programme |
| TopChemical/BoxAnalysis, BudgetHR, BudgetInputs, BudgetParties, CustomsOffice, EmpDeductions, EmpOvertime, EmpPermits, EmployeeStatus, RegistrationPapers | |
| TopChemical/BudgetCash, BudgetManufacture | sheet formulas → placeholder cells |
| TopChemical/Debts, EmployeeSalary, Employees, Trust | server-assigned id → placeholder cell |
| TopLight/Cash | server-assigned id |
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
| ValleyFoods/TestData | 7 tables — a dev fixture page; convert last or never |
| TopLight/Sales_Returns | 3 tables, id-alloc |
| Assessment/ResultView | `add_ac_candidate_grade` writes 4 |

**Split: 23 A / 14 B / 15 C.** Tier C is the largest single group and none of it changes. That is
the plan's most important line: **roughly a third of the forms will keep the overlay, on purpose.**

Four actions could not be resolved to a handler from the `register()` table and need a manual look:
`delete_legal_manufacture`, `delete_registration_paper`, `delete_deduction`, `delete_overtime`,
`delete_vacation`.

---

## 6. Order of work

Each step is one commit. **S1 before everything** — without it the durability claim is false.

| Step | Work |
|---|---|
| **S1** | Fix the cross-session queue (§3): carry `target_system` on the entry, rebuild `_call` from `API.call` at init, `scheduleRetry()` on load, report undrainable legacy entries. Tests first — this is a bug fix with a reproduction. |
| **S2** | Confirm the tiering page by page (§5) and write the agreed table into the results doc. No code. |
| **S3** | Tier A, the 3 ValleyFoods watch-only pages. Smallest diff, proves the pattern on a company already fully on `UIC.Live`. |
| **S4** | Tier A, TopChemical — 15 pages, the bulk of the programme. Split into 3 commits of 5. |
| **S5** | Tier A, TopLight — 4 pages. |
| **S6** | Tier B, all 14. Patch-from-reply via `UIC.PagedTable.patchRow` / `UIC.Live.save` without a draft. |
| **S7** | Assessment: 3 Tier B pages, and the Tier A action on ResultView. First company on the pattern — expect its form shapes to differ. |
| **S8** | Placeholder-cell rule for id-alloc / sheet-formula pages, applied and pinned. |
| **S9** | Extend `s19_live_rollout.js` to report the real bar (optimistic / watch-only / neither) instead of one "converted" flag, and add the tier to the census. |
| **S10** | Results doc + owner checklist. |

---

## 7. Verification

Offline only — no browser, no spreadsheet, as with every other programme here.

1. `node tools/verify/run_all.js` green at every step (71 checks today).
2. **New `tools/verify/s26_offline_queue.js`** — the S1 fix, dry-run under `domstub`:
   a save fails with a transport error → the entry is queued **with `target_system`**; a simulated
   reload (`loadQueue` from a fresh array) → the queue **drains**, which is the exact case that is
   broken today; a handler rejection is *not* queued; ordering is preserved across a reload; an
   entry with no `target_system` is reported, not silently dropped.
   **Mutation-test it**: reverting the `_call` rebuild must fail the drain check.
3. `s19_live_rollout.js` extended per S9, so the report cannot again say "converted" for a page
   whose save still blocks.
4. Per-tier assertions: no Tier A page renders a fabricated id/code cell; no Tier B page passes
   `draft` to `UIC.Live.save`; no Tier C page's save was touched.
5. `parse_pages.js` and `ui_smoke_pages.js` after every page batch.

---

## 8. Hard constraints

* **No schema change.** No column, sheet or tab added, renamed, removed, reordered or retyped, in
  any of the four company spreadsheets or the auth spreadsheet.
* **No data written.** No rows created, edited or deleted; no backfills, no seed data.
* **No deploy.** No `clasp push`, no deployment, no `clasp run`/`login`/`open`, no push to
  `origin`. The owner pushes.
* **No public contract broken.** `UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`,
  `SESSION.*`, every backend signature, every response shape, every HTML anchor id.
  `UIC.Live.save`'s option shape is **additive only** — 7 pages depend on it.
* **The tree is dirty with other efforts' work.** Several files carry uncommitted changes belonging
  to other programmes, `UI_Components.html` among them. Never revert them; stage explicit paths,
  and where a shared file is mixed, stage only your own hunks (as commit `b55202b` did).

---

## 9. Explicitly not doing

* **Not making the page unclosable.** §1.
* **Not touching Tier C saves.** 15 pages keep the overlay by design.
* **No Service Worker, no Background Sync, no offline read cache.** Not available in the Apps
  Script iframe, and out of scope regardless.
* **Not converting `ValleyFoods/TestData`** — a dev fixture page, not a user form.
* **Not changing any server handler's validation.** If a Tier B save refuses too often, that is a
  finding for the owner, not a licence to weaken the guard.

---

## 10. Open questions for the owner

1. **The chip's «تجاهل».** It currently discards an unsaved change on confirmation. With a working
   cross-session queue, should discard stay available at all, or should a stuck entry require an
   explicit admin action? Discarding a real write silently is the one way this system can still lose
   data.
2. **`RETRY_MAX = 5`, then the entry is dropped with a toast.** Five failures over ~2.5 minutes is
   short for a phone in a warehouse. Raise it, or keep retrying indefinitely while the chip shows?
3. **Assessment forms** are unseen by this programme so far. If their form shapes differ materially
   from the other three companies, S7 may need its own small plan.
