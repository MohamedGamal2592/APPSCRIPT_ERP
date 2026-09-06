# Next steps — everything now waiting on you

**Branches:** `perf/optimization-run` (28 commits, three runs) and `feat/valleyfoods-mfg-cost`
(14 commits, branched from it) · **Nothing has been deployed.** `clasp push` has never been run by an
agent, and no deployment has been created or promoted. **42 commits** of unverified change now sit
across the two branches — that is the main reason items 1 and 2 below come first.

The ValleyFoods functional work is on its own branch so it can be reverted independently of the
performance programme. Its report is [VALLEYFOODS_RESULTS.md](VALLEYFOODS_RESULTS.md); the two items
it adds for you are **6** and **7** below.

This is the register of what is blocked on your Google account or your decision, in priority order.
It does not duplicate the runbooks — each item links to the document that has the detail.
Full context: [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md) §3 and §5.

---

## Do these in order

### 1. Prove the backups work — before anything else 🔴

**Why first:** `dailyCsvBackup` referenced `DB_CONFIG`, which was defined nowhere in the project, so
it returned `{ok:false}` on its second line every time it ran. **No CSV backup has ever been
produced.** That is fixed, but the fix has never been executed. The CSV restore is the rollback path
for Phases 3, 4, 8 and 9, so it has to work before any of those are deployed.

```bash
git checkout perf/optimization-run
clasp status      # read the file list carefully — see the warning in PERFORMANCE_RESULTS.md §5
clasp push
```

Then in the Apps Script editor:

| Step | Run | Expect |
|---|---|---|
| 1a | `dailyCsvBackup()` | `{ ok: true, files: <n>, errors: [], skipped: [] }` and `<n>` CSVs in Drive folder `ERP_Backups_CSV` |
| 1b | `restoreCsvToScratchSpreadsheet('AUTH_ERP_Users_<yyyyMMdd>.csv')` | a URL; open it, confirm the rows match, then delete it |

A non-empty `skipped` means the run hit its 5-minute deadline — say so and it can be sharded by
company. **Do not deploy Phase 3, 4, 8 or 9 until step 1b has actually been done.**

Detail: [BACKUP_SETUP.md](BACKUP_SETUP.md).

### 2. Build staging 🔴

Six steps, ending in a deliberate isolation test: save a record in staging, confirm the production
sheet is untouched. Everything below is far safer with it, and Phases 8 and 9 in particular have
never been executed anywhere.

Detail: [STAGING_SETUP.md](STAGING_SETUP.md).

### 3. Install the triggers

Apps Script editor → Triggers. Confirm, or run `installTriggers_` from the admin UI as super admin:

| Trigger | When | Why |
|---|---|---|
| `dailyCsvBackup` | 01:00–02:00 | it reads every sheet of every company spreadsheet in full — it must not run inside the Cairo working day |
| `cleanupOldSessions_` | 03:00 | — |

`installTriggers_` deletes any prior instance of each first, so it is safe to re-run.

### 4. Run `inventorySpreadsheets()` — this unblocks the largest remaining win

Read-only. It writes its report to an `ERP_Perf_Inventory` tab and touches no business data.

**It is the gate on Phase 4.1/4.2**, the last big item still untouched: ~150 whole-column formula
ranges (`valley_products!$A:$I` → `$A$2:$I$<bound>`). The edit is ten minutes' work; *choosing the
bound* is the problem, and its row counts give the bound directly. A bound guessed too low does not
fail loudly — `VLOOKUP` silently misses rows and `SUMIFS` silently undercounts, on costing and
payroll data — which is why nobody has guessed one.

Send me the output and I will do 4.1/4.2 against it.

> **Asked and still open.** The third run asked directly whether this had been run; the answer was
> *"don't know yet"*, so Phase 4.1/4.2 was **not** attempted — no bound was guessed. Everything else
> that was not blocked on you has now been done, which makes this the single largest item left in the
> entire investigation and the only one that needs nothing from me but these numbers.
>
> If you are not sure whether it ran: open each company spreadsheet and look for a tab called
> `ERP_Perf_Inventory`. If it is there, paste it. If it is not, the function has not run — and it
> cannot, until `clasp push` has happened (item 1).

### 5. Archive old records — dry run first

```
archiveOldRecordsDryRun()   // read the report
archiveOldRecords()         // only then
```

Moves rows older than `CONFIG.ARCHIVE_RETENTION_MONTHS` out of `ERP_Record_History` and `SystemLog`
into `<sheet>_Archive_<year>` tabs in the same spreadsheet. **Nothing is deleted** — rows are written
to the archive first, flushed and verified, and only then removed from the live tab, so the worst
case is a row in both places, never a row in neither.

Afterwards, open the record-history panel and confirm recent history still shows.

### 6. Turn on the cost permission — `valley_cost_view` 🟡

**New, from the ValleyFoods run** (branch `feat/valleyfoods-mfg-cost`, 14 commits, not pushed).
Full detail: [VALLEYFOODS_RESULTS.md](VALLEYFOODS_RESULTS.md) §6.

Add `ERP_Pages_Matrix` rows granting `write` on `valley_cost_view` to every role that should see
costs, via `ERP_Management` → صلاحيات الأدوار. Until then the fail-open guard leaves costs visible to
everyone — which is today's behaviour, so **nothing breaks** — but the permission is not yet doing
anything.

It is two steps, because the role screen lists pages from the `ERP_System_Pages` sheet rather than
from the registry:

| Step | Where | What |
|---|---|---|
| 6a | `ERP_Management` → صفحات النظام | `valley_cost_view` now appears in that list. Save it, so the `ERP_System_Pages` row exists. |
| 6b | `ERP_Management` → صلاحيات الأدوار | Grant `write` on it to each role that should see costs. |

**Verify by granting it to one role**, then signing in as a user in a role *without* it and confirming
the cost columns are gone **and absent from the network response** — devtools → Network → the
`company_action` call: the JSON should have no `unit_cost` / `total_cost` / `work_center_cost` keys at
all, not zeros. Checking the screen alone is not enough; the whole point is that the values never
reach the browser.

> ⚠️ **One behaviour change to weigh before you grant it.** After the first grant, roles *without*
> the permission can still view, print and approve purchasing documents but can no longer **edit**
> them. `saveValleyPurchasingCosting_` writes every column from the payload, so a cost-blind client
> saving would have blanked the whole landed-cost document; the save refuses instead. There is no
> authority to resolve those figures from — a person types them — and the lines are re-created with
> fresh ids on every save, so preserving them was not possible either. Reasoning in
> VALLEYFOODS_RESULTS.md §S5b. Say the word if you would rather purchasing costs stayed un-stripped.

### 7. Decide what to do about U-48 — the ValleyFoods sales invoice save 🔴

**Found while auditing sales for the cost permission. Pre-existing since the initial commit — not from
the performance programme and not from this run.**

`saveValleyInvoice_` reads an identifier `outputs` that is declared nowhere in the project. Reading an
undeclared identifier throws `ReferenceError`, and the reference sits **before** the handler takes its
write lock — so the sales invoice save throws before writing anything. The block it sits in is dead
costing computation copied from the manufacturing handler: the values it computes are never read, and
no sales sheet has a column to hold them.

It was **reported, not fixed**: it is outside the steps you asked for, and the choice is yours —

- **delete the dead block** (the save starts working; nothing is lost, because nothing consumed those
  values), or
- **implement invoice-level costing properly**, which needs new columns, and columns are a schema
  change.

Evidence: `node tools/verify/s5c_sales_audit.js`. Detail: VALLEYFOODS_RESULTS.md §5.

> **If sales invoices are in fact saving fine in production today, tell me** — that would mean one of
> my premises is wrong, and it is the one thing here that a two-minute live check settles faster than
> any amount of reading.

### 8. Grant the new حركة المخزن page — `vf_warehouse_movement` 🟡

**New, from the warehouse-movement run** (branch `feat/vf-warehouse-movement`, 4 commits, not
pushed). Full detail: [WAREHOUSE_MOVEMENT_RESULTS.md](WAREHOUSE_MOVEMENT_RESULTS.md) §5a.

The page is registered, so it appears in «صفحات النظام» and a **super-admin can open it the moment
you deploy**. Everyone else sees nothing until you grant it. That grant means adding rows to
`ERP_Pages_Matrix`, which is a live business table, so the run did not do it — same reasoning, and
the same two steps, as `valley_cost_view` in §6 above:

| Step | Where | What |
|---|---|---|
| 8a | `ERP_Management` → صفحات النظام | `vf_warehouse_movement` now appears in that list. Save it, so the `ERP_System_Pages` row exists. |
| 8b | `ERP_Management` → صلاحيات الأدوار | Grant `read` to roles that should see the ledger, `write` to roles that should add to it. |

The page is **add + list only** — no edit path and no delete path, deliberately, because a stock
ledger should stay append-only. `full` grants nothing extra.

> ⚠️ **One thing to check on the first save, before you grant it widely.** The availability
> figure adds `Σ movmenent_sign` on top of `current_qty`, and I could not verify offline whether
> the `valley_products_movement` tab that feeds `current_qty` already includes warehouse-movement
> rows — that tab is spreadsheet-only and has no schema in the legacy dump. If it does, **المتاح is
> understated**, which refuses a legitimate issue but can never permit an over-issue. Pick a batch
> that already has a movement row and compare المتاح against the sheet. Reasoning and the fix are in
> WAREHOUSE_MOVEMENT_RESULTS.md §7.

---

---

## Two decisions I need from you

### A. Retention period — currently assumed **24 months**

Question Q2 was never answered. It is one number: `CONFIG.ARCHIVE_RETENTION_MONTHS` in
[00_Config.js](00_Config.js). Nothing else to edit. Tell me if it should be something else, or leave
it and it stays at 24.

### B. ValleyFoods purchasing now shows **10 rows by default** ⚠️

This is the one user-visible behaviour change in the whole run. That screen used to return every
costing row ever; it now returns the 10 most recent, matching the equivalent TopLight screens. A
**"عرض الكل"** button next to "إضافة عملية شراء" reaches the rest, and `renderList()` preserves
whichever view the user is in, so a save does not silently drop them back to 10.

If you would rather it keep showing everything, say so — it is one line, having the page pass
`{ loadAll: true }`.

---

## Things I found that are yours to decide, not performance work

| | |
|---|---|
| **Five delete buttons call actions that do not exist.** `delete_deduction`, `delete_overtime`, `delete_vacation`, `delete_registration_paper`, `delete_legal_manufacture` are not registered anywhere in the project — each throws "Unknown action" and shows an error toast. Writing five business-table delete handlers is not a performance change, so this run did not do it. | Tell me if you want them built. |
| **`YourStrongPassword123!` was sitting in source** as a value in `DBLIVE_CONFIG.props`. If it was ever a real password on `164.92.143.177/topchemicalpest`, **rotate it.** Also, because of the key-name bug fixed in Phase 0, if MySQL currently works its credentials are stored under Script Properties literally named `appscript_user` and `YourStrongPassword123!` — migrate them to `MYSQL_USER` / `MYSQL_PASSWORD` at your convenience; the legacy names still work. | Security, not performance. |
| **Phase 4.4** — replacing in-sheet formulas with script-computed static values. The largest single win available and a genuine change to how your business data behaves. Written up as a proposal in [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md) §7. It needs a conversation, not a commit. | Your call. |
| **`src_html/`** — a stale partial duplicate of the project: 45 files, 41 of which already differed from their root counterparts before this run started. Not pushed, and now also in `.claspignore`. It is a real hazard: an optimisation edited into the wrong copy would silently never deploy. | Delete it once you have confirmed nothing you need lives only there. |
| **`appsheet_old_project.html`** — 14.4 MB, unreferenced by any include, route or template. Excluded from the push set but **not deleted**, pending your confirmation. | Safe to delete. |

---

## Done since this file was last written (third run, Phases 11–14)

Nothing here needs anything from you — it is listed so the register stays honest about what has and
has not moved. Full detail in [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md), section **D**.

| | |
|---|---|
| **TopLight reference caching finished.** Phase 2.6 stamped only four call sites and left **51** reading an unstamped 120s cache, so a product or party edit did not invalidate them at all. Measured on a model of the real code: 43 of 47 eligible sites still served stale data 5s after an edit; now 0. | Commit `6e1d85f`. Test it with two browsers — §5 step 3, row 11. |
| **A live dropdown defect fixed on the way.** `prefetch_refs` was warming the TopLight `categories` cache with the wrong value shape, which dropped a filter and let a blank category into the التصنيف list on the Products page. | Same commit. |
| **Nine more list endpoints stopped building a derived object for every row before throwing 99% of them away.** Five in TopChemical, two in ValleyFoods, two in TopLight. | Commits `25d3052`, `fdca7ff`, `3192ee7`. §5 step 3, row 12. |
| **The ValleyFoods work-centre append loop is batched.** Phase 8 skipped this twice for a good reason; the reason turned out to be provably not a problem, and the proof is in D1. Several new work centres in one save now cost one write instead of one each. | Commit `30261ca`. §5 step 3, row 13 — **check the ids are consecutive**. |
| **`03_Security.js` no longer contains NUL bytes.** It was being treated as a binary file by every text tool, and any transfer that stripped them would have broken the company-logo cache silently. | Same commit. Just confirm a logo still renders. |

**Still not done, and still yours:** everything in the numbered list above, plus every decision below
it. Nothing in the register has been removed.

---

## Deploy order, once 1 and 2 are done

Deploy **one phase at a time** and verify before continuing — do not deploy all of it at once. The
per-phase verification table is [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md) §5 step 3, and the
per-phase `git revert` commands are in §6.

The three to watch hardest, because they touch how data is written and read:

- **Phase 3 and Phase 8** — after saving a multi-line document, open the sheet and confirm the
  computed columns are **still formulas, not values**. Click a `total_cost` / `unit_cost` /
  `movement_code` cell and check the formula bar.
- **Phase 9** — save a multi-sheet document (ValleyFoods sales invoice is the densest) and confirm
  the numbers it wrote are right. This is the change with the least margin for error.
- **Phase 13b** — save a manufacturing order that adds **two or more new work centres at once**, then
  check `valley_manufacture_work_center`: the new rows contiguous and in form order, their `id`s
  consecutive with no gap and no repeat, and `work_center_cost` / `total_cost` still formulas.

**Fastest rollback, any phase:** Manage deployments → point the deployment back at the previous
version. Seconds, no code changes. Note the current version number before you deploy anything.
