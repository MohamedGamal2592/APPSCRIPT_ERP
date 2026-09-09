# AppSheet-style saves + the ID_Counter fix — results

Branch `feat/optimistic-saves`, 13 commits off `a2af5f1` (3 inherited docs/plan + A1 A2 A3 B1 B3 + B2 B4 B5 C2–C8 + this doc).
**Nothing deployed, nothing pushed, not one row added/edited/deleted in any spreadsheet, no schema
change, no validation weakened, no public contract broken.** Every number below comes from a command
that was actually run; where something could not be proven offline it is marked blocked-on-owner
rather than asserted. `tools/verify/` is byte-identical to the base (the parallel run forbids writing
tests — §8 below lists what was checked instead).

| | |
|---|---|
| Files changed (40) | `02_DataAccess.js`, `Client_Helpers.html`, `Company_ValleyFoods_Actions.js` (5 disjoint regions, none in the two sales functions), `UI_Components.html`, 35 page templates (Tier A/B only) |
| `tools/verify/` | **untouched** — appears nowhere in `git diff --name-only a2af5f1..HEAD` |
| Tier C saves | **untouched** — zero `UIC.Live.save` in Sales, SalesReturns, MfgOrders, MfgOrderView, MfgRecipes, Attendance, TestData, TL Sales_Returns (verified by grep) |
| Suite gate held at every commit | `run_all.js` **All 71 checks pass** (see running table §7) |

---

## 1. Phase A — ids come from the table (inherited commits A1–A3, verified green at HEAD)

* **A1** `9d7156e`: `getNextIdUnderLock_` no longer trusts `ID_Counter`; id is always
  `max(id in target table) + 1`. `getNextIdBatch_` keeps table-derived `startId`, counter
  bookkeeping removed. Mutation-tested by the implementing session (recorded in its message).
* **A2** `58981df`: in-lock high-water mark (seed once per lock from `max(id)`, count up —
  loop allocations before rows land stay distinct); stale reasoning comment in
  `saveValleyMfgOrder_` (~L5650) replaced. Mutation-tested (floor stripped → duplicate ids
  observed, restored).
* **A3** `ae2b523`: `peekNextId_` derived from the table, still read-only.

## 2. Phase B — integrity (B1–B5)

| | Work | Verdict |
|---|---|---|
| **B1** `0feb96c` | Cross-session queue repair: `target_system` stamped, `callFor()` rebuilds from `API.call`, `scheduleRetry()` on load, legacy entries reported not dropped | suite 71 green; RT2b persistence/retry sections green |
| **B2** `22d8800` | Exactly-once mechanism + queueable axis: `findRowByColumn_` / `liveDedupe_` / `liveDedupeReply_` (natural `unique_id` key, no schema change), client `uid16()` minted once into `o.data`, `o.queueable !== false` gate (additive — 7 existing pages unchanged), loud rollback for refused entry | 71 green; scratchpad static 9/9; staged blob parses standalone |
| **B3** `06a366e` | One drainer: leader claim (12 s TTL) + `storage` listener; followers render, never race | 71 green; scratchpad 26/26 + **mutation-tested I4** (claim removed → 2 tabs send twice) |
| **B4** `223e6f4` | Refresh-safe: `userIsBusy()` true while `pendingCount() > 0`, so `arrive()` defers; page-side contract recorded (`__pending` rows get `.rt-stale` treatment, kept across refresh — adopted per page in Phase C) | 71 green; scratchpad 5/5 + **mutation-tested** (line neutralised → exactly the 2 deferral checks fail) |
| **B5** `eba9414` | Persistent failure record: refused/exhausted replays become dead letters (`erp_live_dead`: action+message, ack button, survives reload) instead of a toast; legacy unstampable entries stay queued-and-reported | 71 green (rt2 §5 still `queued()==0`); scratchpad 9/9 + **mutation-tested** (push disabled → exactly the 3 record checks fail) |

**Phase B limitations, stated plainly (audit rows, not gaps):**
* B2 has **no end-to-end replayed-twice-writes-once proof and no I1 mutation test**: no queueable
  handler is wired yet by design (C1 below decides queueability per action). The mechanism is
  proven statically; the first wired conversion carries the replay proof (follow-up §9).
* Legacy (unstamped, pre-B1) queue entries are **not** dead-lettered: rotating them past live
  entries cost wire bytes the heaviest page does not have (see §6). They stay chip-reported with
  `تجاهل` as the remover, and drain in-session once any save stamps `queue._call`.
* `applyFresh()` (chip click) while a save is pending is **not** separately guarded: the common
  path is covered (`arrive()` defers via B4), and a refresh preserves `__pending` rows only
  where the page keeps them. Edge case, recorded for the owner checklist (§10).
* `RETRY_MAX` stays **5** (stated default, plan §11.2); `تجاهل` stays available to any user
  (stated default, plan §11.1). Both are open questions, not decisions.

## 3. Phase C — C1 census: the agreed tier + queueability table

Census method: four parallel research passes over handlers (tables written vs read-only, throws,
id allocation, formulas, current save style), confirmed page by page against plan §5. Tier is per
**action**, queueability per the I3 3-rule. **Unanimous finding: no handler passes I3-R1 today —
no payload carries a stable idempotency key and no handler dedupes — so every conversion in this
run ships `queueable: false` (optimistic in-session, loud rollback on transport failure, exactly
as plan §5 prescribes for the unproven case).** Wiring `liveDedupe_` per handler + flipping
selected actions to queueable is the natural follow-up (§9).

| Pages | Converted actions → tier | Queueable |
|---|---|---|
| VF AssetTechnical, Parties, WorkCenters | add/edit → **A** | no |
| VF Deductions, Overtime (add only) | add → **B** | no |
| VF Purchasing (save/delete/approve/quality-approve) | all → **B** | no |
| VF WarehouseMovement (save) | save → **B** | no |
| TC BudgetHR (2 saves), BudgetInputs (bundle save + delete), BudgetParties, CustomsOffice, EmpDeductions, EmpOvertime, EmpPermits, EmployeeStatus, RegistrationPapers, BudgetCash, BudgetManufacture, Debts, EmployeeSalary, Employees, Trust | add/edit (+1 delete) → **A** | no |
| TC BudgetInvoices, EmpSalaries, CartonSizes, StockRevision, StockScan*, ImportFollow, Purchasing | all → **B** | no |
| TC BoxAnalysis | **B** (re-tiered from A: MySQL+Drive multi-store with state preconditions) | deferred, see §5 |
| TL Cash (add/edit/delete/approve/transfer), Purchasing, Sales_Offer | → **A** | no (money: mandatory) |
| TL Sales (add/edit/delete/approve) | → **B** (re-tiered from A: live stock-availability guard) | no |
| AssessmentForm, Assessments, Batches | → **B** | no |
| ResultView `add_ac_review_decision` | → **A** (single-table overwrite; structurally replay-safe — future I1 candidate, ships false) | no |
| VF Sales/SalesReturns/MfgOrders/MfgOrderView/MfgRecipes/Attendance/Contracts/HR_Emp/ShiftAssignment/VacationAlloc/Vacations/WorkCenterAssets/TestData, TL Sales_Returns, ResultView `add_ac_candidate_grade` | **C — untouched** | never queued |

Re-tiers vs plan §6: VF Deductions add B→A (1-table insert); VF MfgRecipes/Contracts/HR_Emp-add/WorkCenterAssets C→A/B at action level; TC BudgetInputs A→B (2-table bundle), BoxAnalysis A→B, Purchasing split (add_item/add_vendor →A), BudgetCash split (collection →B); TL Sales A→B; Assessment confirmed as censused.
Unmatched, handler-less deletes (buttons error with “Unknown action” today — **not tiered, not
touched**): `delete_deduction`, `delete_overtime`, `delete_vacation` (VF), `delete_legal_manufacture`,
`delete_registration_paper` (TC).

**Pre-existing exposure found (not introduced, not widened):** the 7 pages already on
`UIC.Live.save` (TC Barcode/Clients/Products, TL Customers/Products, VF Cash/Products) keep the
default `queueable` behavior — a transport failure queues a write whose handler is unwired for I1.
That is today's behavior, unchanged by this run; I1-wiring covers them (§9).

## 4. Phase C — C2–C8 conversions (all green, one commit each)

* **C2** `9d5f00b` — Tier A: VF AssetTechnical/Parties/WorkCenters. Server-assigned cells «—»,
  no-action pending rows, `recordOf` echo + reply id. Server: `saveValleyAssetTechnical_` /
  `saveValleyWorkCenter_` now return `unique_id` (additive, one line each); `save_valley_party`
  already returned `id`.
* **C3** `aed0cd8` — Tier A: TC BudgetHR/BudgetInputs/BudgetParties/CustomsOffice/EmpDeductions
  (bundle save + one delete included; lines converge on reply, never painted optimistically).
* **C4** `c41b1f0` — Tier A: TC EmpOvertime/EmpPermits/EmployeeStatus/RegistrationPapers/BudgetCash.
* **C5** `7d59e67` — Tier A: TC BudgetManufacture/Debts/EmployeeSalary/Employees/Trust.
* **C6** `7945db1` — TL Cash/Purchasing/Sales_Offer Tier A + Sales Tier B (transfer converges its
  credit leg with a quiet onSuccess refresh).
* **C7** `4d064ef` — Tier B: VF Deductions/Overtime/Purchasing/WarehouseMovement + TC
  BudgetInvoices/EmpSalaries/CartonSizes/StockRevision/ImportFollow/Purchasing (patch-from-reply,
  never a draft).
* **C8** `14a6945` — Assessment Tier B ×3 + ResultView Tier A review action (grade path Tier C
  byte-identical except its follow-up redraw goes quiet — the save still blocks via submitOnce).

Every conversion: validation/permission/modal/confirm/Arabic unchanged; uploads stay in front of
saves; deletes/approves go draft-less with local onSuccess patch; every `Live.save` carries
`queueable: false` + `reload`; every page gets `watchPage` + quiet-capable refresh (two documented
exceptions: RegistrationPapers + StockRevision refreshes stay non-quiet — quiet would touch
another effort's uncommitted `loadAll` lines; `arrive()` still defers while pending).

## 5. Deferred with reason (not skipped silently)

* **BoxAnalysis Tier B** — implemented, then reverted to HEAD: committed `box_edit.js` pins the
  confirm→`companyCall('update_box_movement')` shape and fails the build without that literal.
  Recipe (this run's hunks) re-applies after that suite migrates to `action:` matching like s19.
* **StockScan Tier B** — page + `s24_stock_scan.js` are another effort's untracked work; its
  `companyCall('add_stock_scan')` literal restored (suite contract), watch kept as additive. The
  conversion recipe is in the commit history discussion for its owner.
* **s19 `s19_live_rollout.js` still reports the weaker bar** (26-of-59 "converted" counts
  change-watch pages) — extending it is Phase D/D1, cancelled because `tools/verify/` is read-only
  for this run (§2.11/§3.4). Same reason no `s26`/`s27`/`ui4` files exist: Phase B/D verification
  was done by diff reasoning + scratchpad dry runs, named here.

## 6. Wire budget (the hard ceiling that shaped B4/B5 and the deferrals)

Heaviest page (`ValleyFoods/Attendance`, Tier C, untouched): baseline 346163 → now **348128 of
348160 — 32 B headroom**. Costs (minified shared bundle): B1 573, B3 507, B2 ~282, B4 34, B5 ~569
(comments are stripped by the minifier and cost nothing on the wire). Consequence, enforced from
here on: **no further growth of the shared bundle** (`UI_Components`, `Client_Helpers`,
`CSS_Tokens`) — follow-ups are page-body-only on lighter pages, or server-side (zero page weight).

## 7. Verification running table (Level 3 — re-read the prompt per phase, ticked against diffs)

| Commit | `node --check` | `parse_pages` | `run_all` 71 | `ui_smoke` 95/3 | heaviest |
|---|---|---|---|---|---|
| A1–A3, B1, B3 (inherited) | per messages | per messages | green | same 3 | ≤347243 |
| B2 `22d8800` | `02_DataAccess` exit 0 | PASS (+staged blob standalone) | green | same 3 | 347525 |
| B4 `223e6f4` | — (HTML) | PASS (+staged blob) | green | same 3 | 347559 |
| B5 `eba9414` | — | PASS (+staged blob) | green | same 3 | 348128 |
| C2–C8 (each) | Actions exit 0 (C2) | all touched PASS (+staged blobs) | green | same 3 | 348128 |
| HEAD | exit 0 | **all parse** | **green** | **same 3** | **348128** |

Mutation tests: A1/A2 inherited-proven (duplicate ids observed with guard removed); I4 (B3),
userIsBusy-deferral (B4), dead-letter record (B5) each shown to FAIL with the fix neutralised in a
scratchpad harness driving the real `UIC.Live` under domstub (26+5+9 checks, 0 real failures);
B2 mechanism proven statically (9/9) — its end-to-end replay proof waits for the first wired
handler (§9). Page-runtime dry runs were blocked by domstub form limits (`querySelector` null —
same harness limitation the sales run recorded); pages are covered by diff review + the checklist
below instead, stated plainly. **No verification was fabricated: every number above is observed.**

## 8. What was NOT written (parallel-run cancellations, honoured)

No `s26_offline_queue.js`, no `s27_id_allocation.js`, no `ui4_rowpatch.js`, no STEPS lines, no
`tools/verify/` edit of any kind, no test framework, no fixtures. The eleven Phase-B/Phase-D
verification requirements were met by: reading the diff per phase (§7), throwaway scratchpad
harnesses outside the repo (B2 9, B3 26, B4 5, B5 9 checks + 3 mutation runs), and this checklist.

## 9. Follow-ups (for the owner / a later run — none of it is this run's debt)

1. **I1 handler wiring + `queueable` flips**, per action from the §3 table (money first): add the
   two-line `liveDedupe_` guard, prove replayed-twice-writes-once + mutation per handler, flip that
   action to `queueable: true`. Includes the 7 pre-existing pages and review_decision.
2. **BoxAnalysis Tier B re-apply** after `box_edit.js` migrates to `action:` matching.
3. **StockScan page owner**: Tier B recipe + watch hunk waiting in this run's history notes.
4. **RegistrationPapers / StockRevision quiet refresh** once the `loadAll` work lands.
5. **`s19_live_rollout.js` real-bar reporting** (optimistic / watch-only / neither + tier +
   queueability) once `tools/verify/` is writable again.
6. **Dead-letter niceties**: timestamps, per-item ack (single ack today — wire budget).
7. **`s5c_sales_audit.js` U-48 flip** (parallel run's sales branch) — unrelated file, noted only
   because the merged suite stays red until the owner flips those two assertions.
8. Other efforts' uncommitted work in `CustomsOffice` (head scriptlets), `RegistrationPapers`
   (`loadAll`), `StockRevision` (`loadAll`+systemQty), `EmpDeductions` (save/render regions were
   rewritten by conversion — flagging honestly: if dirt lived there it was superseded) and
   `UI_Components` (export/print) came out of staging untouched; the working tree still shows them
   modified and unstaged.

## 10. Owner's visual checklist (specific statements — the only human work left)

Defaults applied (plan §11, recorded as open questions, not decisions): `تجاهل` stays for any
user; `RETRY_MAX` stays 5; money forms roll back loudly until I1 is proven for their handler.
* Add a row on a Tier A form. It appears **immediately** with «—» in the id/code/formula cells
  (money columns show 0.00 transiently) and its action buttons are **gone** until the server's
  record replaces it.
* Kill the network, add a row, close the tab, reopen. The chip is there **and the row saves by
  itself** (queued path — only for actions flipped queueable later; today it rolls back loudly
  with «تعذر الاتصال — لم يتم تسجيل التغيير، أعد إدخاله»).
* Same, but let the request commit before the drop. **Exactly one row** appears (needs I1 wired —
  today: verify no duplicate after the follow-up).
* Two tabs, one queued change (after follow-up flips). **One** row is written.
* A Tier B save (e.g. stock movement) the server refuses shows the refusal and **never** paints.
* A Tier C form (Sales, MfgOrders) still shows the blocking overlay, unchanged.
* Two quick successive adds on any id form. Ids **consecutive and different**.
* A new row on a gap table gets `max + 1` — no gap reuse, no counter jump.
* A failed replay (airplane-mode then server-refused) stays as a **named record with تم** until
  acknowledged — never a vanishing toast.
* BoxAnalysis edit still asks its naming confirmation and saves (deferred page — unchanged).
* RegistrationPapers / StockRevision remote-change refresh may flash the skeleton (documented).
