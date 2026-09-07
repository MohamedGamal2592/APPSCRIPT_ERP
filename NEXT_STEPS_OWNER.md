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

---

# تحليل حركة الخزنة العادية — blocked on you

Branch `feat/tc-box-analysis`, **not pushed**. Full write-up in
[BOX_ANALYSIS_RESULTS.md](BOX_ANALYSIS_RESULTS.md); the verification checklist is at the bottom of
that file.

Everything below needs either database access or a decision that is not mine to make. Nothing here
is optional housekeeping — items 1 and 2 in particular decide whether the page is usable and whether
its numbers are right.

## 1. Grant the page — **the page is invisible until you do this**

`ERP_Management` → صلاحيات الأدوار → grant `tc_box_analysis` to the roles that should have it.
`read` to view, `write` to edit rows and to record item merge/split corrections.

**The page fails closed on purpose.** Until a role is granted, nobody but a super admin sees it —
not the nav item, not the URL. This is deliberately the opposite of the ValleyFoods
`valley_cost_view` guard, which fails open by hiding costs on a page everyone can still reach. This
page exposes fraud analysis about named employees *and* an edit form over financial rows, so the
absence of a grant has to mean the absence of the page.

## 2. Four measurements nobody could take without the database

Run these and tell me the answers. The fourth one is the one that can make the page lie.

```sql
-- a. How big is the table?
SELECT COUNT(*) FROM regular_box_movement;

-- b. How much of it is in the item-analysis range?
SELECT COUNT(*) FROM regular_box_movement
 WHERE chart_of_accounts REGEXP '^[0-9]+$'
   AND CAST(chart_of_accounts AS UNSIGNED) BETWEEN 300000 AND 400000;

-- c. Are those codes uniformly 6 digits?
SELECT CHAR_LENGTH(TRIM(chart_of_accounts)) AS width, COUNT(*) AS n
  FROM regular_box_movement
 WHERE chart_of_accounts REGEXP '^[0-9]+$'
   AND CAST(chart_of_accounts AS UNSIGNED) BETWEEN 300000 AND 400000
 GROUP BY width ORDER BY n DESC;

-- d. THE ONE THAT MATTERS MOST. Is id_5 unique?
SELECT id_5, COUNT(*) AS n FROM chart_of_accounts_main
 GROUP BY id_5 HAVING n > 1 ORDER BY n DESC LIMIT 20;
```

**Why (d) matters most.** A duplicated `id_5` in a SQL join would fan out the aggregate rows and
**double every account total on the page** — a wrong number that looks entirely plausible and that
nobody would catch by eye. Because I could not confirm uniqueness, the page does **not** join:
account labels are looked up from a JavaScript map instead, which cannot fan anything out. A
duplicate can only make a *label* ambiguous, and the page prints a banner naming the affected codes.
So the page is safe either way — but if (d) returns rows, the chart of accounts itself has a problem
worth fixing.

**Why (a) and (b) matter.** Under roughly 20,000 rows in the range, the current design (all matching
in Apps Script, plan Option A) is comfortable inside the six-minute limit. Materially above that and
the item index needs to move into a derived table.

**Why (c) matters.** The range predicate uses `CAST(...)`, which is **not sargable** — it cannot use
an index. If the codes are uniformly 6 digits, the plain string range `>= '300000' AND < '400000'`
is exactly equivalent and *can* use a prefix index. I did not assume it.

## 3. Report the real parser coverage — **the number I could not produce**

Open the page → **تحليل البنود** tab → set the period to one month → **تحليل البنود**. The banner
reports:

- how many movements were read,
- how many had items extracted (**parse coverage**),
- how many segments could not be parsed,
- how many rows whose item prices do not sum to `transaction_amount` (**sum-mismatch rate**).

**Write both percentages down and send them to me.**

This matters because of what the verification suite can and cannot say. Exactly **one** production
`transaction_details` string exists in this repo — the sample in the plan. Every other test fixture
is invented. The suite reports 89.7% coverage over that invented corpus, and that figure measures
the corpus, not your data. A parser tuned to strings somebody imagined proves nothing about what
your staff actually type.

Both numbers are findings in their own right, not just calibration:

- **Low parse coverage** means the parser needs another pass, and the item price rules are running on
  a subset without saying so.
- **A high sum-mismatch rate** is either a parser problem or a real bookkeeping one — and telling
  those two apart needs you to open a handful of the flagged rows and look.

Do the same for one month in each of the last three quarters if you can; phrasing drifts over time
and a single month can flatter or defame the parser.

## 4. Two decisions about the audit trail

**(a) Should it move to a real table?** There is no DDL available, so today the trail is
append-only NDJSON — one file per month in the Drive folder `Box_Analysis_Audit/`, written under a
script lock. It works and it is honest, but a Drive file has no transactions, no constraints and no
query engine, and appending is a read-modify-write that gets slower as the file grows (it rolls to a
new part past 5 MB). The item merge/split overrides live in the same folder as a single JSON file,
for the same reason.

If DDL becomes available, promoting both to tables is a mechanical change and I would recommend it.

**(b) Should editing a money column require a reason note?** Recommended for `transaction_amount`,
`chart_of_accounts` and `transaction_date` — those are exactly the edits somebody will later want
explained, and the audit entry currently records *what* changed and *who* changed it but not *why*.
It is a small change: one required field in the form and one more key in the audit entry.

## 5. May an already-reviewed row be edited at all?

Right now: **yes**. The form allows it, and the `EDITED_AFTER_REVIEW` rule reports it at low
severity naming who made the edit, because the audit log explains it. An edit to a reviewed row that
the log *cannot* explain is reported at high severity.

The alternative is to refuse the edit until the row is un-reviewed first, which makes the review flag
mean something stronger. I have not chosen for you — this is a control decision about how your
review process works, not a technical one. Tell me which you want.

## Also worth knowing

- **No trigger was installed.** The nightly precompute is written
  (`rebuildBoxAnalysisIndex`, a global with no trailing underscore so the trigger dialog will list
  it) and the install steps sit in a comment right above it: Apps Script editor → Triggers → Add
  Trigger → Day timer → 2am–3am. Until you install it, the page computes on demand for the window it
  is showing; every such path is bounded and gives up with a clear Arabic message rather than being
  killed at six minutes.
- **Nothing was pushed and no data was read.** Every SQL statement in this branch ships unrun — I had
  no MySQL client and the credentials are only in Script Properties. They were verified by reading
  them against the schema and by a static check that asserts the invariants (no DDL, no `DELETE`,
  every `UPDATE` carrying `WHERE id = ?`, every connection closed).
- **Three real bugs were found by running the rules** rather than inspecting them — a duplicate rule
  that could never fire, a sequence rule that turned one anomaly into twelve accusations, and a
  seasonality rule that went silent on exactly the account that needed it most. All three are fixed
  and described in BOX_ANALYSIS_RESULTS.md. Expect the thresholds to need another pass once they
  meet real data.

---

# Recommended follow-up run — the F4b grid migration

`.form-grid` / `-wide` / `-narrow` now exist in `UI_Components.html` and are proven on two forms
(the subscription-invoice modal and the ValleyFoods products form). **The remaining 81 inline
`grid-template-columns` across 43 pages are deliberately NOT migrated** — that is F4b, and it wants
its own run. See `UI_FORMS_AND_FILTERS_RESULTS.md` §F4b for why, and the classification rule: form
grids migrate, computed-value strips go to `-narrow`, and KPI/tile rows must be **left alone**, since
a 240px floor would make the dashboards worse rather than better.

---

# iPhone run — four follow-ups, each gated on a device test

The iPhone run (branch `ui/forms-readability`, commits `6b69f57` → Phase 5) deliberately left four
things alone, because fixing any of them would have touched the Android and Windows flows that are
working and liked. Each is written here as its own run, and each is **gated**: do the test first,
and only start the run if the test fails. Full context in `IPHONE_RESULTS.md`.

## A. Printing from inside the Apps Script iframe

**Gate — checklist items 1 and 9.** On the iPhone, open an invoice and tap طباعة. If the AirPrint
preview shows the invoice, there is nothing to do and this run is cancelled.

If it shows Google's wrapper page instead, `window.print()` is printing the iframe's parent. This
cannot be fixed in CSS. The run would have to choose between serving invoices outside the iframe
and generating a PDF server-side, and that is a real architectural decision about how documents are
delivered — worth making deliberately rather than as a bug fix. Affects all sixteen print pages, so
it wants its own run either way.

## B. Attachment download and PDF preview on iOS

**Gate.** On the iPhone, download a document attachment, and open a PDF preview. If both work, cancel
this run.

If they do not: attachments are served as `<a download href="data:…">` and previews as
`<iframe src="data:application/pdf…">` (`Code.js`, the `serveAttachment_` path). iOS Safari treats
both differently from Chrome. Any change here alters the working Windows and Android path, which is
why it was not attempted. The likely answer is a `blob:` URL or a redirect to a Drive URL, and both
need testing on all three platforms before shipping.

## C. The row menu's outside-click on iOS — ✅ RESOLVED by the second iPhone run

**Fixed in commit `fd7dc8b`**, not deferred. `@media (hover: none) { body { cursor: pointer; } }`
in `UI_Components.html` — the first of the two options this section named. No JavaScript moved, so
no listener can double-fire; `s15` section 11 compares the outside-click listener against the
revision before that run and asserts it is character-for-character identical. Gated on
`(hover: none)`, so a desktop mouse never sees a changed cursor.

**Still verify it on the device** (item 10 of the new checklist in `IPHONE_PHASE2_RESULTS.md`): open
a row menu, tap empty page space, the menu closes. If it still does not, the remaining option is a
`touchend` listener alongside the click one, and that would want its own run.

The original gate, kept for reference:

**Gate — checklist item 8.** Open a row menu on any list, then tap empty page space. If it closes,
cancel this run.

If it stays open, the cause is known: the menu closes via a `document` click listener
(`UI_Components.html`), and iOS Safari does not reliably deliver a click event for a tap on a
non-interactive element. The standard fix is `cursor: pointer` on `body`, or a `touchend` listener
alongside the click one. Small, but it touches the shared row menu that every list on all three
companies uses, so it deserves its own run and its own regression pass.

## D. Sideways panning on the customer statement

**Gate — checklist item 3.** On the iPhone, open a customer statement in portrait and try to swipe
it sideways. After the iPhone run there should be nothing to pan to, because the statement is a
stack of cards. If it reads correctly, cancel this run.

If some other wide element still needs panning and will not respond to a swipe, the suspect is
`touch-action: pan-y` on `body` (`CSS_Tokens.html`). Per the CSS spec a nested `overflow-x: auto`
box should still pan horizontally, which is why it was left alone — and changing `body` affects
Android, so it must not be changed on a hunch. This run would need a device in hand to confirm the
diagnosis before touching the token.

## Also worth knowing

- **`node tools/ui_check.js` rewrites `design_preview/_sources.js`.** Its C9 check requires
  `build_preview`, which regenerates the bundle as a side effect. Running the checker dirties a
  tracked file. Restore it with `git checkout -- design_preview/_sources.js` unless you actually
  meant to rebuild the preview.
- **A backtick inside `UI_Components.html` breaks every page.** Its CSS lives inside a JavaScript
  template literal. This is what `ui_check` C11 guards, and `parse_pages.js` catches it immediately.

---

# Second iPhone run — what changed, and what is now waiting on you

Branch `feat/assessment-center` (**not** `ui/forms-readability` — see `IPHONE_PHASE2_RESULTS.md` §0).
Five commits `d88a2f7` → `fd7dc8b` plus the docs commit. Nothing pushed, nothing deployed, no schema
touched, no row created, edited or deleted.

The first run fixed TopLight. This one finished the job on TopChemical and ValleyFoods, and fixed
the print button — which was broken on iPhone on **every** company, TopLight included.

## E. The ten-item iPhone checklist is the only thing left

`IPHONE_PHASE2_RESULTS.md` §5 has it in full, as pass/fail statements. In short, on the iPhone:

1. أوامر التصنيع → open a row: a page opens.
2. Any list → طباعة: the document appears, in a tab **or** as a full-screen overlay.
3. From the overlay, طباعة: does the preview show the document, or Google's wrapper page?
   **This answer is the gate for follow-up A above — please record it.**
4. From the overlay, إغلاق: it disappears cleanly, twice in a row, leaving the page as it was.
5. Parties كشف حساب, Purchasing print: same as 2.
6. Attendance نسيان البصمة, TopChemical جرد المخزون: same as 2.
7. Any attachment or تقرير link: the file opens, or a dialog with a **tappable link** appears —
   and tapping it delivers the file. **This is the gate for follow-up B above.**
8. Box analysis and Budget income in portrait: each row is a labelled card.
9. Manufacturing order view in portrait, including the + دفعة dialog: the same.
10. Row menu → tap empty space: it closes. **This is the gate for follow-up C above.**

Then repeat all ten on **Android Chrome and Windows**, where every one must behave exactly as it did
before. In particular: every print and every download still opens a **new tab** (never the overlay
or the link dialog — those are only reachable when the browser refuses a tab), every table above
600px is still a table, a printed page is unchanged on paper, and the Windows mouse cursor is still
an arrow over empty page space.

## Also worth knowing, after this run

- **Never write a literal `<style>` tag inside a comment in `UI_Components.html`.**
  `tools/lib/sources.js` pairs the first opening tag it sees with the next closing one — which is
  inside the `printTable` document string 1200 lines below — so every CSS check reads 58 kB of raw
  JavaScript as the stylesheet. Two checks failed with nine assertions that pointed nowhere near the
  cause. Sibling of the backtick trap above.
- **`UIC.alert` escapes its message**, because it is built on `UIC.confirm` and that escaping is
  what stops a record name injecting markup. Anything that needs real markup in a dialog — a link,
  for instance — has to use `UIC.openModal` directly.

---

# Real-time kill switch + authority matrix (branch `feat/realtime-authority`)

Full detail in [REALTIME_AUTHORITY_RESULTS.md](REALTIME_AUTHORITY_RESULTS.md). Nothing in this
branch has been deployed, no trigger was created and no Script Property was set — all of that is
below and all of it is yours to run.

**What it fixes.** Changing a user's role or company, or setting them InActive, used to have no
effect for up to **12 hours** no matter how many times they refreshed: the role was frozen into the
session cache at login, and `bumpVersion_('ERP_Users')` wrote a key that nothing read. A change typed
directly into `ERP_Pages_Matrix` or `ERP_system_work!B2` bumped nothing at all — the `onEdit` in the
code has never fired, because simple triggers only run in container-bound projects and this is a
standalone script. It was rescued only by a 15s / 120s cache expiry, which is also what forced the
constant re-reads of the shared AUTH spreadsheet.

Now a single durable **authority generation** in Script Properties keys the kill switch, the matrix
and the user directory. Any admin save bumps it and every user sees the change on their next refresh,
and the cache TTLs go to six hours, which removes the periodic sheet reads instead of adding to them.

## Order matters — getting it wrong is the one way this makes things worse

1. `AUTH_STALENESS_CEILING_SECONDS` on line 33 of `00_Config.js` reads **`300`**. If it reads `3600`,
   stop — that is step 9, not step 1.
2. `node tools/verify/run_all.js` prints **`All 41 checks pass.`**
3. `clasp push`, then create or promote the deployment. Load any page as an ordinary user: it renders
   normally and the console shows no error. The old and new cache keys cannot collide, so no stale
   value survives the deploy.
4. Signed in as **super admin**, run **`install_triggers`** from the admin UI **once**. Google will
   prompt for a new spreadsheet scope — authorise it. This is the only step that touches your account.
5. Apps Script editor → Triggers. A row exists with handler **`onAuthSheetEdit`**, source **From
   spreadsheet**, event **On edit**, bound to the AUTH spreadsheet
   (`1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM`). Run `install_triggers` a second time and confirm
   there is still exactly **one** such row, not two.
6. **The two-browser test.** A = super admin, B = an ordinary user sitting on a page. After each
   action in A, refresh B **once**:
   1. Kill switch OFF in the admin UI → B shows the shutdown page.
   2. Kill switch ON in the admin UI → B shows the normal page.
   3. Type `0` into `ERP_system_work!B2` **in the sheet** → B shows the shutdown page, **immediately**.
   4. Type `1` back into B2 in the sheet → B is normal again.
   5. Remove a page grant from B's role in the admin UI → the nav item is gone and the direct URL is denied.
   6. Set that matrix row's `status` to `InActive` **in the sheet** → B is denied.
   7. Change B's `role` in the admin UI → B gets the new role's pages. **This is the bug that used to
      take 12 hours.**
   8. Set B's `status` to `InActive` → B is bounced to login with the Arabic inactive message.
   9. Leave everything idle 10 minutes, refresh → no error, no slowdown.
7. **Row 6.3 is the trigger test.** If it takes up to five minutes instead of being immediate, the
   trigger did not install — that is the safety ceiling doing its job, not an outage. Go back to
   step 4. Rows 6.1, 6.2, 6.5, 6.7 and 6.8 are app-side and must be immediate either way.
8. Project Settings → Script Properties now shows **`erp_gen`** with a millisecond timestamp. It
   appears the first time any admin save runs; before that the system correctly reads `0`.
9. **Only after step 6 passes in full**, change `AUTH_STALENESS_CEILING_SECONDS` on line 33 of
   `00_Config.js` from `300` to **`3600`**, push and redeploy. This is the step that converts the
   work into the full performance win: the B2 read drops from once per 15 seconds to at most once
   per hour, and the per-role matrix read from once per 120 seconds to at most once per hour.
10. Re-run rows 6.1, 6.3 and 6.7. If 6.3 is now slow, the trigger has stopped firing — at ceiling
    3600 that is an hour of staleness. Put line 33 back to `300` and redeploy while you investigate.

**Rolling back** is clean: reverting the deploy restores the old keys and the old short TTLs, which
self-heal within 120s. Leave the `erp_gen` property — the old code never reads it. Leave the
`onAuthSheetEdit` trigger too; it only calls `bumpVersion_`, which the old code also uses.
