# تعديل دفعات فاتورة المبيعات — results

Branch `fix/vf-sales-batch-edit`, four commits off `a2af5f1`. **Nothing was deployed, nothing was
pushed, and not one row was added, edited or deleted in any spreadsheet.** Every number below comes
from a command that was actually run; where something could not be proven offline it is marked
blocked-on-owner rather than asserted.

| | |
|---|---|
| Files changed | `Company_ValleyFoods_Actions.js`, `Company_ValleyFoods_Sales.html` — **only these two** |
| Diff | 118 insertions, 63 deletions |
| `tools/verify/` | **untouched** — appears nowhere in `git diff --name-only a2af5f1..HEAD` |
| Schema | unchanged; `valley_sales_product_stock` keeps its eight columns |

---

## ⚠️ Read this first — the suite is not green, and it must not be made green by this run

`node tools/verify/run_all.js` reports **71 checks run, 1 FAILED**, at `S5c — sales audit (and U-48)`.
This is expected, it is not a regression, and **it is the direct consequence of the highest-priority
fix in this run.**

`tools/verify/s5c_sales_audit.js:104-148` is a *bug-presence* block. It was written to record U-48 —
the `outputs` ReferenceError — as "Reported, deliberately NOT fixed". Its assertions are therefore
that the defect **still exists**. S1 fixed the defect, so exactly two of them can no longer pass:

```
  FAIL  saveValleyInvoice_ uses `outputs` (0 reference(s))
  FAIL  the reference is reached BEFORE the handler takes its write lock
```

The source lines are `s5c_sales_audit.js:110` and `s5c_sales_audit.js:132-133`:

```js
  check(uses > 0, 'saveValleyInvoice_ uses `outputs` (' + uses + ' reference(s))');
...
  check(useAt !== -1 && lockAt !== -1 && useAt < lockAt,
    'the reference is reached BEFORE the handler takes its write lock');
```

This run was forbidden to create, edit or delete anything under `tools/verify/`, so those two
assertions are left inverted **on purpose**. Flipping them is the one code change the owner must
make themselves — see the checklist at the end.

**The gate this run actually held itself to, at every one of the four commits:** 71 checks run, S5c
the only failing check, exactly those two assertions failing and no others. Verified before each
commit. Any third failing assertion, or any other failing check, would have been a real regression.

---

## What changed, file by file

### `Company_ValleyFoods_Actions.js`

**S1 — the dead costing block is gone** (was L8270-8280).

```js
    outputs.forEach(function (o) { totalOutQty += Number(o.qty || 0); });   // ← ReferenceError
```

`outputs` is never declared in `saveValleyInvoice_`. The whole M2/M3 block was copy-pasted from the
manufacturing-order save, where `outputs` is a real local. It sat after all validation and before
`executeWithLock_`, so **every** sales save — new or edited — died with
`ReferenceError: outputs is not defined` and wrote nothing. The client showed «فشل الحفظ».

Confirmed before deleting: the only `outputs` declarations in the repo are function-locals in
`getValleyMfgOrderFull_` (L5075), `saveValleyMfgOrder_` (L5304) and `getValleyMfgOrderDetail_`
(L6071), plus test fixtures. No IIFE-level, file-level or implicit global exists. `totalInventoryCost`
and `avgCostUnit` had no reader outside the block.

**S3 — the allocation write is now differential** (L8378-8480, inside the same `executeWithLock_`).

A `valley_sales_product_stock` row is identified by **(`valley_sales_products_id`,
`product_unique_id`)** — line uid and batch uid:

| Change | Result |
|---|---|
| Quantity changed on a batch the line already had | one `setValue` on `product_qty` (plus `user`). `unique_id` and `created_at` untouched |
| Batch added | exactly one row appended |
| Batch removed | that row deleted — per-row, descending |
| Line deleted | `priorLineUids` releases all of its rows |
| Nothing changed | **zero writes, zero `noteMutation_` calls** |
| Another invoice's row | skipped before it is even read |

The previous code did something worse than delete-and-re-add: to avoid N `deleteRow` round trips it
collected the survivors and rewrote **the whole sheet body** in one `setValues()` from row 2. That
rewrote every other invoice's allocation rows on every sales save. That is gone.

### `Company_ValleyFoods_Sales.html`

**S2 — `openEdit` carries the allocations** (L192-207). The server has always returned
`lines[].allocations`; the mapper dropped the field. Two consequences, and the second is the serious
one:

1. Every strip reopened blank, and since the server requires each line's allocations to equal its
   quantity, the user had to re-enter batches for **every** line or the save was refused.
2. With `prefill` undefined, `loadBatches`' `hasPrefill` was false for **every** line, so the
   advisory FIFO fill ran over all of them. A reopened invoice therefore displayed a FIFO
   **proposal** in place of the batches it actually held — and saving accepted it.

`alloc_uid` is deliberately not carried. `save_valley_invoice` keeps taking `{batch_uid, lot, qty}`;
the server matches on (line uid, batch uid) and never needs the client to say which row is which.

**S2b — `salesAllocFifo_` sums exactly** (L500-524). It pushed `Math.round(take*1000)/1000` but
decremented `rem` by the **unrounded** `take`, and half-up rounding could push an allocation
fractionally **above** its batch. With `available` 3.0006 it offered 3.001, which the server refuses
with «الكمية المتاحة من الدفعة (…) غير كافية» on a form the user filled correctly. Now `rem` is
decremented by exactly what was pushed, a partial take is never rounded up past `available`, and the
batch that closes the line absorbs the residue. The initial `Math.round(qty*1000)/1000` is gone too:
it could shift a 4-decimal line quantity by 0.0005, outside the server's 0.0001 tolerance.

**S2c — no code was needed.** `loadBatches`' `build` closure already implements both required rules:
it computes `hasPrefill`, and fires `autoAllocSalesFifo_` only when there is no prefill, only after
the batches have resolved, and only through the per-line `fifo-auto-<i>` checkbox. Adding a second
fill would have double-filled. Both rules are **proven** below instead of re-implemented.

---

## S4 — the twelve assertions, and what was checked instead of a test

**The test file `tools/verify/s28_sales_batch_edit.js` was cancelled by the run owner, and
`tools/verify/run_all.js` was not given a `STEPS` line.** `tools/verify/` is read-only for this run.
Every assertion below was instead checked by reading the diff and by throwaway scripts written
**outside the repo** (in the session scratchpad) and never committed. They lift the real function
text out of the real source files and execute it — they are dry runs, not source-text greps, except
where stated. **No spreadsheet was touched by any of them.**

| # | Assertion | How it was checked instead | Result |
|---|---|---|---|
| 1 | `saveValleyInvoice_` contains no `outputs`, `totalInventoryCost`, `avgCostUnit` | static scan of the extracted function body + `node --check` | **held** — 0 hits each |
| 2 | no `deleteRowsByCriteria_`, no full-body `setValues` against the allocation sheet | static scan scoped to the allocation block | **held** — also no bulk `deleteRows`; the LINE rows still use `deleteRowsByCriteria_`, which is correct and out of scope |
| 3 | `openEdit` maps `allocations` from the server line | static scan + the page-level dry run below | **held** |
| 4 | `priorLineUids` collected before the line rows are deleted | source offsets compared: collect < `deleteRowsByCriteria_(sheetLines` < `priorLineUids.forEach` | **held** |
| 5 | `{B1:5}` onto an invoice with no rows appends exactly one row | dry run of the real `saveValleyInvoice_` over in-memory sheets | **held** — 1 append, 0 deletes, 0 updates |
| 6 | re-saving `{B1:5}` unchanged performs zero writes; row keeps `unique_id` and `created_at` | same harness, saved twice | **held** — 0 writes, 0 `noteMutation_` naming that sheet, uid and `created_at` identical |
| 7 | `{B1:7}` updates the same row's `product_qty`; uid unchanged, row count unchanged | same harness | **held** — single-cell write, no append, no delete |
| 8 | `{B1:7, B2:3}` leaves B1 untouched and appends one row for B2 | same harness | **held** — B2 also carries its lot from `batchCurrent` |
| 9 | `{B2:3}` deletes B1's row, B2 keeps its original `unique_id` | same harness | **held** — exactly one `deleteRow`; `created_at` also preserved |
| 10 | a different invoice's row is never read, updated or deleted | a foreign row seeded in the sheet, compared after all five saves | **held** — byte-identical, `created_at` still 2020 |
| 11 | removing line `L1` (present only in `priorLineUids`) deletes all of its rows | same harness, L1 dropped from the payload | **held** — L2 and the foreign row untouched |
| 12 | `salesAllocFifo_` over `(3.0004, 3.0004, 10)` sums to exactly 10, and no allocation exceeds its batch; likewise `(4, 6)` | the real `salesAllocFifo_`, reached through the project's own `pageharness` `expose` hook | **held** — and over four more cases: `(3.0006, 3.0006, 10)`, qty `10.0005`, float-hostile `(2.9, 1.1, 10)`, and a genuine shortage `(2, 3)` for 10 which still reports `remaining = 5` |

Totals actually observed: **44 dry-run assertions and 26 static assertions, 0 failures.** In addition,
the page-level dry run booted the **real** `Company_ValleyFoods_Sales.html` on
`tools/verify/pageharness.js` with the real `UI_Components` and `Client_Helpers` — 25 assertions,
0 failures — covering S2, both S2c rules, and S2b.

**D1 was proven by dry run, not statically.** The same one-line payload was run against the
pre-fix and post-fix source of the same function:

```
  before S1 (HEAD a2af5f1): THREW  -> outputs is not defined
  after  S1 (working tree): OK  -> {"status":"success","message":"تم إنشاء الفاتورة"}
```

### Two harness limitations, worked around outside the repo — neither is a page defect

* `tools/verify/domstub.js`'s `querySelector` always returns `null`, so
  `openInvoiceModal`'s `modal.querySelector('.modal').appendChild(foot)` throws and `drawLines` is
  never reached under test.
* `domstub` reflects only `disabled` out of markup, never `checked`, so the page's
  `<input type="checkbox" id="fifo-auto-N" checked>` reads as unchecked and `autoAllocSalesFifo_`
  bails at `if (autoCb && !autoCb.checked) return;`.

Both were accommodated in the throwaway script (the second by **deriving** the flag from the strip
markup the page actually produced, not by assuming it). Fixing them properly means editing
`tools/verify/domstub.js`, which this run may not do. Worth doing in a later run — until then, any
page-level test of a checkbox-gated path silently tests nothing.

---

## Verification, step by step

| After | `run_all.js` | Failing set | `parse_pages.js` | `ui_smoke_pages.js` |
|---|---|---|---|---|
| baseline (`a2af5f1`) | **All 71 checks pass** | — | all parse | 3 known failures |
| S1 `86289cb` | 71 run, **1 FAILED** | S5c only, the 2 U-48 assertions | all parse | same 3 |
| S2 `3440f7a` | 71 run, **1 FAILED** | S5c only, the same 2 | all parse | same 3 |
| S3 `13149a1` | 71 run, **1 FAILED** | S5c only, the same 2 | all parse | same 3 |
| S4 (this doc) | 71 run, **1 FAILED** | S5c only, the same 2 | all parse | same 3 |

`node --check Company_ValleyFoods_Actions.js` passed after every edit to it.

---

## Decisions, skips and open questions

**Sales costing is computed and never read.** `ln.line_material_cost`, `a.cost_unit` and
`a.total_cost` are still set in the validation loop and now have no reader at all. Valley sales
costing was **never persisted to any column** — the allocation sheet has no cost column, and S1
removed the only thing that consumed the totals. Left exactly as found: persisting it would be a
schema change. **Owner's decision, not taken here.**

**Line rows are still delete-and-reinsert** (L8358-8376) — out of scope and unchanged. They keep
their `unique_id` across the rewrite, which is precisely why allocation rows keyed on the line uid
survive it. The `priorLineUids` read happens before the deletion, and that ordering is what makes a
removed line release its batches.

**Duplicate `(line, batch)` rows are collapsed to one.** If the sheet holds two rows for the same
line and batch — which hand editing can produce — the first satisfies the want and the second is
deleted, because otherwise that line would hold the batch's quantity twice and break the per-line
invariant. This is a consequence of the row-identity rule, **not** a repair pass. There is no
integrity scan, no orphan report, no tamper check, no checksum, no protected range and no backfill
anywhere in this run.

**A saved batch that is not in the offered list — what the user sees.** Verified by dry run:
`renderAllocStrip` iterates the *offered* batches and looks up the prefill by uid, so a saved
allocation whose batch is absent from the offered list is **silently not rendered**. No row, no
message, no warning. `DRAFT_LINES[i].allocations` still holds it, but `collectAllocations` reads the
DOM, so the quantity is dropped on save and the server refuses the line with
«مجموع تخصيص الدفعات (…) لا يساوي الكمية (…)» — a message that does not explain why. With
`available = current_qty + held(this invoice)` this should be unreachable for a live batch, since the
invoice's own holdings are added back. **Not redesigned in this run, as instructed.** Recorded as an
open question: it deserves an explicit «الدفعة لم تعد متاحة» row rather than silence.

**`autoAllocFifo_` in `Company_ValleyFoods_MfgOrderView.html` has the same rounding shape** as the
pre-S2b `salesAllocFifo_`. Different programme, out of scope, **not touched**. Flagged for a future
run.

**Defects seen in other runs' files and deliberately not fixed** (they belong to the parallel run):
the two `domstub.js` limitations above. Nothing else in `UI_Components.html` or `02_DataAccess.js`
was found to be wrong in the course of this work.

**Line endings.** `Company_ValleyFoods_Actions.js` is stored LF in the repository and checked out
CRLF (`core.autocrlf`). An early `sed -i` normalised the working copy to LF; git normalises to LF on
staging, so **the committed diffs are content-only** — S1 is exactly 12 deletions, S3 exactly 86/44.
The next checkout restores CRLF. No action needed.

**Not done, deliberately:** no deployment, no push, no `clasp` anything, no trigger, no Script
Property, no server function run, no schema change, no new sheet or column, no row written anywhere,
no numbering introduced on `valley_sales_product_stock.id` (it stays blank as before), no reference
to `valley_products_movement`, nothing subtracted from `current_qty`, no `src_html/` edit, and no
conversion of this page to optimistic saving — `ValleyFoods/Sales` stays Tier C with its blocking
overlay and does not import `UIC.Live`.

---

## The owner's checklist

**Do this first — it is code, and this run was forbidden to touch it.**

- [ ] In `tools/verify/s5c_sales_audit.js`, flip the two U-48 assertions from *the bug is present* to
      *the bug is fixed*. Line 110 asserts `uses > 0`; lines 132-133 assert `useAt < lockAt`. Both now
      describe a defect that no longer exists. Update the U-48 note in `VALLEYFOODS_RESULTS.md` at the
      same time. The suite returns to **All 71 checks pass** once they are inverted.

**Then, in the app — specific statements, each either true or false:**

- [ ] A sales invoice — any invoice, new or edited — **saves at all**. Before this run every save
      failed with «فشل الحفظ».
- [ ] Open an existing invoice that has **no** batches (super admin; revert it to قيد الانتظار first
      if it is معتمد). Every line comes up **already filled** FIFO — no field has to be touched — the
      strip's total equals the line quantity, and حفظ succeeds.
- [ ] Open an invoice that **already has** batches. The strips come up **pre-filled with the saved
      quantities**, not blank and not FIFO-reordered. What the invoice holds is what the form shows.
- [ ] Change one batch quantity on one line and save. In `valley_sales_product_stock` that row's
      `product_qty` is the new number and its `unique_id` is **the same as before**. No duplicate row
      appeared.
- [ ] Add a second batch to a line and save. Exactly **one** new row appears; the first batch's row is
      untouched, `unique_id` and `created_at` included.
- [ ] Remove a batch from a line and save. Its row is gone; the others are unchanged.
- [ ] Delete a whole line and save. All of that line's allocation rows are gone.
- [ ] Save an invoice twice without changing anything. The second save changes **nothing** — same row
      count, same uids, same `created_at`.
- [ ] Another invoice's allocation rows are byte-identical before and after all of the above.
- [ ] Delete one invoice's rows from `valley_sales_product_stock` by hand, then reopen that invoice.
      The batches it had are offered again at their full quantity — the stock came back — and the FIFO
      fill proposes them.
- [ ] A line whose product has **no** available batches shows «لا توجد دفعات متاحة لهذا المنتج» and
      cannot be saved. If instead a line silently loses a batch it used to hold, that is the
      open question above — please report the invoice number rather than editing around it.
