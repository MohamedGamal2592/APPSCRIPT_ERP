# Realtime feel — what shipped

**Branch:** `feat/realtime-feel`, cut from `05956a6` on `ui/table-columns`
**Date:** 2026-09-07 → 2026-09-08
**Spec:** [REALTIME_FEEL_PLAN.md](REALTIME_FEEL_PLAN.md) · [REALTIME_FEEL_RUN_PROMPT.md](REALTIME_FEEL_RUN_PROMPT.md)
**Status:** 13 commits, local only. Nothing pushed, nothing deployed, no Script Property
set, no trigger installed, no row created, edited or deleted.

`node tools/verify/run_all.js` — **68 checks pass** (57 at the start, 11 added here).
`node tools/ui_check.js` — 1 of 12 fails: **C5, at 39 used-but-undefined classes, exactly
where it was before this branch started.** It is not this run's, and this run did not let it
grow: every class introduced here is defined in `UI_Components.html`.

---

## 1. What shipped, per phase

| # | Commit | What | Files |
|---|---|---|---|
| R0 | `8be5241` | The spec, and a census measured rather than copied | `REALTIME_FEEL_PLAN.md`, `REALTIME_FEEL_RUN_PROMPT.md`, `tools/ui_baseline.json`, `tools/ui_check.js` |
| R1 | `50b3ff3` | The search box says which records it actually searched | `UI_Components.html`, 22 pages, `rt8_search_scope.js` |
| R1b | `202c790` | A committed change is never reported as a failed save | `02_DataAccess.js` |
| R2 | `53052a6` | One batched perf round trip per navigation, inert when off | `Client_Helpers.html`, `Code.js`, `UI_Components.html`, `rt0_perf_marks.js` |
| R3 | `2b0ce4d` | 103 read sites draw a skeleton; the overlay is for writes | `UI_Components.html`, `Client_Helpers.html`, 76 pages, `rt1_skeletons.js` |
| R4 | `b389441` | Optimistic saves: exact rollback, retry queue, nav guard | `UI_Components.html`, `Client_Helpers.html`, 5 pages, `rt2_record_replies.js`, `rt2_queue.js` |
| R5 | `78b8ca4` | **The stamp bug fix, alone** | `02_DataAccess.js`, 4 action files, `Code.js`, `rt3_stamp_coverage.js` |
| R6 | `6fe08f1` | The watch reaches three more companies, and arrives politely | 3 action files, `UI_Components.html`, 27 pages |
| R7 | `f5de626` | `UIC.Cache`, prefetch on intent, the last paint | `UI_Components.html`, `Client_Helpers.html`, `rt4_cache.js` |
| R8 | `b7c8ed4` | Comments and whitespace off the wire | `Code.js`, `rt5_budget.js` |
| R9 | `3254776` | Soft navigation on two pages | `Code.js`, `UI_Components.html`, 2 pages, `rt6_router.js` |
| R10 | `5fe9766` | Telemetry: one cache write per request | `Code.js`, `01_Registry.js`, `ERP_Perf_Dashboard.html`, `rt10_telemetry.js` |
| R11 | `ada1460` | The audit trail comes off the request path | `02_DataAccess.js`, `rt9_history_queue.js` |
| R12 | this | This document | — |

Eleven new checks, all in `run_all.js`: `rt0_perf_marks`, `rt1_skeletons`, `rt2_record_replies`,
`rt2_queue`, `rt3_stamp_coverage`, `rt4_cache`, `rt5_budget`, `rt6_router`, `rt8_search_scope`,
`rt9_history_queue`, `rt10_telemetry`.

---

## 2. Before and after

Shaped like the plan's §4 budget table. **Every row that ends in `ms` is an owner
measurement** — there is no layout engine, no event loop and no deployment in this
harness, and no assertion in this repository can prove that a skeleton appeared in 150 ms
or that a save felt instant.

| Measure | R0 (measured) | Now | Phase |
|---|---|---|---|
| Median inlined bytes per page | 317,880 | **~228 KB** on the wire | 5 |
| `UI_Components` on the wire | 268,510 | **195 KB** (36% off) | 5 |
| `Client_Helpers` on the wire | 23,583 | **17 KB** (47% off) | 5 |
| `CSS_Tokens` on the wire | 13,636 | **5 KB** (59% off) | 5 |
| Heaviest page | 425,106 | **327 KB** | 5 |
| Blocking overlay call sites | 263 | **158**, all writes | 1 |
| Read sites drawing a skeleton | 0 | **106** | 1 |
| Pages with optimistic save | 2 | **8** | 2 |
| Pages with a live watch | 22 | **28** | 3 |
| Companies with `get_page_versions` | 1 of 4 | **4 of 4** | 3 |
| Direct sheet writes that stamp their table | **0 of 133** | **132 of 133** | 3 |
| Write actions returning their record | 54 | **60** (40 exempt, 26 pending) | 2 |
| Perf round trips per navigation | 1 per metric | **1 per navigation** | 0 |
| Pages that can be searched over a truncated list in silence | 22 | **0** | 8.1 |
| Global-lock acquisitions per save | 2 | **1** | 9 |
| Telemetry cost per request | a `SystemLog` append, or nothing | **one cache write** | 10 |
| Soft-navigating pages | 0 | **2** | 6 |
| Time to first meaningful paint | — | **owner measurement** | 1 |
| Perceived save latency | — | **owner measurement** | 2 |
| Navigation to a new screen | — | **owner measurement** | 6 |
| Form open (warm) | — | **owner measurement** | 4 |
| Another device's change appears | never, for unstamped writes | ≤ 1 poll interval — **owner measurement** | 3 |

---

## 3. Corrections to the plan

The plan was written from static analysis at a different commit. Where it and the code
disagreed, the code won. All of these are small and none changed the work.

1. **HEAD was `05956a6`, not `eb1b0c1`.** The prompt's starting-state block names a commit
   that is not the head of `ui/table-columns`.
2. **The suite had 57 checks, not 48.**
3. **263 overlay sites across 93 files, not 245 across 86.**
4. **22 watched pages, not 20.** All ValleyFoods, as stated.
5. **Median page 317,880 bytes across 103 pages, not 317,414.** `UI_Components` was 268,852
   bytes on disk, not 268,510. The file kept growing while the plan was being written.
6. **127 no-argument `noteMutation_()` calls and 133 direct sheet writes, not ~124.**
7. **No page calls `UIC.appShell` inside a `.then()`.** Plan Phase 1 step 4 says several do.
   Checked properly — parenthesis-balanced, over masked source — and the answer is zero.
   `rt1_skeletons.js` asserts it stays zero.
8. **`first_data_render` had never been produced.** The plan calls it "already exists; keep
   it". `PERF.mark` existed and **no page had ever called it with that metric**, so the
   number has never once been recorded. It is now marked where the last chunk of a table
   body lands.
9. **The "press عرض الكل first" workaround does not exist on 19 of the 22 affected pages.**
   §1.5 says "the user must know to press عرض الكل first". Only TopLight Sales, ValleyFoods
   Purchasing and ValleyFoods ShiftAssignment have that button. On the other nineteen there
   is **no way to reach the rest of the table at all.** That is a bigger bug than the notice
   fixes — see the follow-ups.
10. **`saveRecordWithAudit_`'s asymmetry is in three branches, not one.** `update` (L1209)
    and `approve` both commit before logging and both threw. Both are fixed. `delete` logs
    **before** deleting, so a throw there aborts with the sheet untouched and the reported
    failure is true — it is deliberately left alone, and wrapping it would delete a row with
    no audit trail.
11. **The minified bundle does not fit in `CacheService`.** Plan Phase 5 step 1 says to hold
    the result in `CacheService`; a single value is capped at 100 KB and the minified
    `UI_Components` is 195 KB. It uses the chunked cache the repo already has.
12. **Phase 5 step 4 is mostly already done.** The 900 KB xlsx library and the chart library
    are both fetched on first use. The rest of what it names — history panel, preferences,
    print — are functions *inside* `UI_Components.html`, and deferring those needs the split.

---

## 4. Skips, exemptions and everything left partial

### 4.1 Deliberately out of scope, per §Decisions

- **Plan Phase 7** (server read cost) — gated on the Phase 0 measurement week. D-A.
- **Plan Phase 8 tiers 1–3** (indexed retrieval) — gated on `inventorySpreadsheets()`. D-A.
- **The `UI_Components.html` four-way split** — D-C. It is the single largest remaining item
  and it is what the 180 KB budget is waiting for.
- **Arabic search normalisation** (أ/إ/آ→ا, ة→ه, ى→ي) — D-P. R1 fixed *what* is searched, not
  *how* it is matched.

### 4.2 R1 — the search notice

22 pages render a searchable table over a truncated list; all 22 now declare their scope.
Three link the notice to their existing عرض الكل button and the notice disappears once the
full list is loaded. **Nineteen have no such button**, so their notice states the scope and
stops there rather than pointing at an affordance the page has never had.

Option (b) from D-E — server-backed search — applies to **no page**: only
`getLegalProductsMovement_` accepts a `search` parameter, and it is not one of these.

### 4.3 R3 — sites that kept their overlay

103 read sites converted; **107 write sites kept the overlay deliberately** (D-F). Two
specific reversals:

- **`Company_ValleyFoods_MfgOrders.html`** and **`Company_ValleyFoods_MfgOrderView.html`**
  share a page-local `showLoading()` between their reads *and* their writes. Converting it
  would have taken the overlay off that page's writes. `s7_batch_modal.js` caught this,
  which is what it is for.

Assertions updated deliberately, with the reason recorded in the file (D-O):
`s19_live_rollout.js` (the quiet-refresh assertion now names all three first-paint helpers;
an unguarded draw of any still fails) and `s20_quiet_refresh.js` (page ids checked against
all four registries, not just ValleyFoods').

### 4.4 R4 — the record-reply exemption list, in full

The gate is **not** "every handler returns a record". It is the pairing that actually
matters: *a page may not use the optimistic path against a handler that returns nothing
unless it passes `reload`.* The full list is regenerated into
`tools/verify/rt2_exemptions.txt` on every run.

**60 write actions return their saved record.**

**40 are exempt, in four declared classes:**

- **delete (12)** — There is no record to return: the row is gone. The optimistic operation
  is a removal and the rollback is putting the row back, which the page already holds.
  `TopChemical`: delete_emp_salary, delete_legal_costing.
  `TopLight`: delete_purchasing, delete_sales, delete_sales_return, delete_cash,
  delete_sales_offer.
  `ValleyFoods`: delete_valley_purchasing_costing, delete_valley_cash,
  delete_valley_mfg_order, delete_valley_invoice, remove_test_data.
- **approve (15)** — A state flip the page already knows the result of, because it flipped
  it. No assigned id, no computed field to carry back.
  `TopChemical`: toggle_legal_cash_approved.
  `TopLight`: approve_purchasing, approve_sales, approve_cash, approve_sales_offer.
  `ValleyFoods`: approve_valley_purchasing_costing, toggle_overtime_role,
  toggle_deduction_role, toggle_vacation_index, toggle_shift_schedule,
  approve_valley_cash, approve_valley_mfg_order, approve_valley_invoice.
  `Assessment`: toggle_ac_assessment_active, toggle_ac_batch_active.
- **batch (7)** — A batch writes N rows, so there is no single record. These pages reload,
  and reloading is correct: the user is not waiting on one row appearing.
  add_upload_file (×2), add_import_follow_files, add_carton_size_files,
  add_ac_batch_invites, add_ac_assessment_copy, generate_monthly_salaries,
  generate_test_data, close_payroll_month.
- **multisheet (6)** — Header and lines land in two or more sheets, so "the record" is not
  one row (D-G). save_valley_purchasing_costing, save_valley_invoice, save_valley_return,
  save_valley_mfg_recipe, save_valley_warehouse_movement, add_sales/edit_sales,
  add_purchasing/edit_purchasing.

**26 could return a record and do not yet.** Not exempt, not a failure — the tail of a
staged migration, and each one blocks its page from the optimistic path until it is fixed,
which `rt2_record_replies.js` enforces:

```
TopChemical  add_upload_file, update_stock_revision, update_import_follow_status,
             add_emp_salaries, edit_emp_salary, update_emp_salary_receipt,
             revise_main_review, update_box_movement, revise_box_movement,
             save_box_item_alias
ValleyFoods  add_upload_file, save_overtime_role, save_deduction_role,
             save_vacation_index, save_shift_schedule, save_valley_product,
             save_valley_party, transfer_valley_cash, save_valley_work_center,
             save_valley_asset_technical, save_valley_work_center_asset
Assessment   add_ac_assessment, add_ac_batch, update_ac_batch_expiry,
             add_ac_review_decision, add_ac_candidate_grade
```

### 4.5 R4 — pages converted, and two that were not

Converted: `Company_TopChemical_Products`, `Company_TopChemical_Clients`,
`Company_TopChemical_Barcode`, `Company_TopLight_Customers`, `Company_TopLight_Products`
(on top of the two that already were).

**Not converted, on purpose:** `Company_TopChemical_Debts` and `Company_TopChemical_Trust`.
Their post-save code accumulates aggregates in place — `found.debit += rec.amount`,
`acc.in_total += r.record.value` — and `UIC.Live.save`'s rollback restores a list slot, not
an accumulated sum. A failed save there would leave the totals wrong with no way back.
Constraint 6.

`Company_TopChemical_Barcode` applies its ten-row cap in `onSuccess`, not in the draft:
trimming at draft time drops the tenth row and the rollback cannot bring it back, which
would leave nine rows where there were ten.

The rollout stands at: **ValleyFoods 21/22, TopChemical 3/25, TopLight 2/7, Assessment 0/4.**
`s19` reports this every run, so the remaining work stays visible.

### 4.6 R5 — the unstamped list, in full

**132 of 133 direct sheet writes stamp the table they wrote.** One does not:

```
Company_TopChemical_Actions.js:4337   sheet1.getRange(...)  in exportVatPurchasingXlsx_
```

It is left unstamped **deliberately and must stay that way**: `sheet1` lives in a throwaway
spreadsheet the export creates for the user to download. It is not a business table and
nothing watches it. A stamp there would put a version on a file that is deleted minutes
later. The bare `noteMutation_()` is kept for the per-request memo, with a comment saying so.

The sweep only rewrote a site where **exactly one** candidate sheet variable was written
within about twenty lines *and* that variable was provably a `Sheet`. A stamp on the wrong
table is worse than none — it makes every other page watching that table refetch for nothing
and still misses its own change — so `rt3_stamp_coverage.js` **fails** on a write that stamps
nothing and merely **reports** one that stamps without naming a table.

### 4.7 R6 — where the watch was *not* registered

The five newly-converted pages register their watch. The remaining TopChemical, TopLight and
Assessment list pages **do not**, and that is the plan's own rollout discipline (Phase 3
step 6, and the risk register): the interval is a quota budget, twenty users at the 30 s
default already cost roughly 2,400 executions a working day before anyone saves anything,
and the rollout lands company by company with `SystemLog` watched between each. Widening it
is on the owner checklist with the number to look at first.

### 4.8 R8 — the 180 KB budget is reported, not enforced

`UI_Components` is **195 KB minified on its own**, so no page can reach 180 KB until the
four-way split, which D-C put out of scope. Failing the build on a target nothing in this
branch could meet would mean either lowering the budget to hide the gap or leaving the suite
red. Both are worse than saying the number out loud, so `rt5_budget.js` prints the gap and
enforces a **340 KB regression ceiling** instead — against a heaviest page of 327 KB. That
ceiling is not the target; raising it again is the wrong answer and the split is the right
one.

### 4.9 R9 — two pages, and only two

`Company_TopLight_Dashboard` and `Company_TopLight_KPI` (D-D). `rt6_router.js` asserts that
**exactly** those two are registered, so widening the pilot is a deliberate act rather than
a drift. Neither declares an `unmount`, because neither starts anything that outlives it —
the router tears down timers, listeners and the change watch generically, and `rt6` fails a
registered page that starts something it does not declare.

---

## 5. Owner checklist

Everything below is blocked on you. Each line says what it unblocks.

| # | Do this | Unblocks | Notes |
|---|---|---|---|
| 1 | Set Script Property **`PERF_LOG_READS = 1`**, leave it five working days, then set it to `0` | Plan Phase 0, and therefore Phase 7 | The client instrumentation is written and shipped; it is **completely inert** until this is set — no request, no timestamp, no listener. This is the week [PERF_BASELINE.md](PERF_BASELINE.md) asked for and never got. |
| 2 | Set Script Property **`PERF_HASH_SALT`** to any random string | Nothing — it hardens R10 | Without it the `user_hash` is still stable and still not an email; the salt only stops the mapping being recomputed by someone holding the sheet. |
| 3 | **Install the two one-minute drain triggers** — run `installTriggers_` as super admin | R10 and R11 both | **Say this plainly: until you do, neither drains.** The telemetry buffer fills and expires on its own, which costs a lost measurement. **The audit queue is a sheet and does not expire — it will grow, silently.** `writeHistoryRows_` still falls back to the old synchronous write whenever the queue is unavailable, so nothing is lost either way, but a queue nobody drains is a sheet that only gets bigger. |
| 4 | Run **`inventorySpreadsheets()`** ([09_Inventory.js:28](09_Inventory.js#L28)) once from the editor | Plan Phase 8 tiers | Read-only, already written, **never run**. It decides whether any index work is warranted at all — under ~5,000 rows the answer is "stop, pagination is enough". |
| 5 | Look at `SystemLog` execution counts after the watch has run for a few days | Widening the watch to the rest of TopChemical / TopLight / Assessment | The 10 s floor, 30 s default, hidden-tab pause and 15-minute idle stop are a quota budget, not tuning knobs. They may be raised. They may not be lowered. |
| 6 | Confirm the read sampling rate (default **10%**) and the **90-day** raw retention for `ERP_Perf_Log` | R10 | One `CONFIG` block, `PERF_TELEMETRY_` in `Code.js`. |
| 7 | **Read `ERP_Perf_Weekly` once a week** | — | This is the entire habit the telemetry exists to build. `?action=perf_dashboard` shows the ten slowest actions against last week with the direction of travel. Super-admin only. |
| 8 | Confirm a staging deployment exists before R8 and R9 reach production | R8, R9 | The minifier and the router are the two changes here that can fail in ways no assertion in this repo can catch. |

### The visual checks no assertion can make

There is no layout engine, no event loop and no deployment in this harness. These need eyes:

- **Skeletons.** Does the table's shape appear immediately, and does it *not* jump when the
  rows land? The header is drawn from the real `_dtHeadRow` with the real width classes
  precisely so it does not, but only a browser can confirm it.
- **The stale paint.** Returning to a list should show the previous rows instantly, dimmed
  and un-clickable, replaced a moment later. Confirm it reads as "loading" and not as
  "broken".
- **Save feel.** On the five converted pages: does the modal close and the row appear at the
  instant you click save?
- **The retry chip.** Turn the network off, save, and confirm the chip appears, stays, and
  clears when the network returns.
- **The two soft-nav pages.** Navigate `tl_dashboard` ⇄ `tl_kpi` repeatedly. Nothing should
  go white; the address bar should track; back and forward should work. Then navigate away
  to any third page and confirm it hard-navigates exactly as before.
- **`?nominify=1`.** Load one page with it and one without, and confirm they behave
  identically. This is the escape hatch for the minifier and it is worth exercising once.

---

## 6. Recommended follow-up runs, in priority order

1. **Split `UI_Components.html` four ways** — `UI_Core` / `UI_Table` / `UI_Charts` /
   `UI_Extras` (plan Phase 5 step 2, deferred by D-C). It is the only thing standing between
   the current 228 KB median and the 180 KB budget, it lets a dashboard stop paying for the
   table engine, and it is what makes the deferred loading of history / preferences / print
   possible at all. Touches 85 page heads and the include graph, so it wants its own run.
2. **Give the nineteen pages a way to reach the whole table.** Correction 9: on nineteen of
   the twenty-two pages with a truncated list there is *no* عرض الكل button, so a record
   outside the newest ten is unreachable, not merely unsearchable. The notice this run added
   tells the truth about that; it does not fix it.
3. **Finish the optimistic-save rollout** — 47 write pages remain (`s19` lists them every
   run), and 26 handlers need `record:` first. Small, mechanical, and each one is
   independently shippable.
4. **Plan Phase 7 — server read cost**, once the Phase 0 table exists. `getAllRecords_` is
   always `getDataRange().getValues()`, and `get_valley_purchasing_costing` reads three full
   sheets to return ten rows.
5. **Plan Phase 8 — indexed retrieval**, once `inventorySpreadsheets()` has run. Includes
   Arabic normalisation (D-P), which a token index cannot do without.
6. **Widen soft navigation** beyond the two pilot pages (D-D), after a week of watching them.
7. **Widen the change watch** to the remaining list pages, after checking execution counts.

---

## 7. A note on the tree

This branch was cut from a tree carrying 27 files of another programme's uncommitted work.
Staging was by explicit path throughout — never `git add -A`, never `git add .` — but
`git add <path>` stages a whole file, so where this run and that one touched the same file
the commits here carry that work along. Specifically: `tools/ui_check.js` carries one line
(`const gap = all ? 0 : …`) that is not this run's, and several `Company_ValleyFoods_*.html`
and `Company_TopChemical_*.html` files carry edits that were already in the working tree
when this branch started. Nothing was reverted and nothing was cleaned up.
