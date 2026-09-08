# رصيد الدفعات — one stock authority: results

**Branch:** `feat/vf-stock-authority`, cut from `1671087` on `feat/realtime-feel`.
**Commits:** eight (S0 was recon, no commit; S1–S8 below).
**Not pushed. Not deployed. No row written to any business table. No formula touched.**

---

## ⚠️ Read this first: `s12`'s expected value moved from 80 to 100

`tools/verify/s12_warehouse_movement.js` § 8 asserted

```
100 − 10 (sold) + 2 (returned) − 5 (consumed) − 7 (issued) = 80
```

**That assertion pinned the bug.** Every one of those four terms is already
inside `valley_current_products.current_qty`, which is a sheet formula over
exactly those tables. Subtracting them a second time is the double count this
run deletes. The correct answer is **100**, and the fixture rows are now
documented as being there precisely so that a reader which starts subtracting
them again fails loudly: **90, 85, 93, 80 and 78 are each the signature of one
more double count.**

A reviewer seeing an expected value relax from 80 to 100 should stop here, not
ask.

---

## The rule, now enforced in exactly one place

```
available(batch, document) = current_qty(batch) + held(document, batch)
```

* `current_qty` — the sheet's net balance, **trusted**, used raw. Purchases,
  production output, by-products, sales, sales returns, manufacturing
  consumption and warehouse movement are already in it.
* `held` — what the document being edited already has on the sheet against that
  batch. **Zero for a new document.**

The add-back is the correctness condition, not an optimisation: a document being
edited already had its own committed quantity subtracted inside `current_qty`,
and the save is about to **rewrite those very rows**. Without it, re-saving an
unchanged order refuses its own stock — the reported bug.

---

## What changed, file by file

### `Company_ValleyFoods_Actions.js`

**Deleted (S1)** — four different second subtractions on top of an already-net
base, each a different subset:

| Reader | subtracted | double-counted |
|---|---|---|
| `getValleyProductBatches_` | sales, returns | sales twice |
| `assertFooterBalances_` | other MOs' consumption | consumption twice |
| `saveValleyInvoice_` | sales, returns | sales twice |
| `whBatchAvailability_` | sales, returns, consumption, movements | everything twice |

Also deleted: the `ORPHAN GUARDS` comment block with `vfLiveSalesLines_` and
`vfLiveMfgFooterOwners_` (71 lines — they guarded subtractions that no longer
exist), and the `CacheService` read at the head of `getValleyProductBatches_`.
That cache was keyed by **product and not by user**: nothing wrote it today, but
the day someone added the matching `put`, one user would have been handed
another user's batch list with the cost columns in it.

**Added (S2)** — one function, used by all six call sites:

```js
vfBatchBalance_(dbId, opts)            // { product_id?, mo_uid?, invoice_uid?, include_empty? }
vfMfgHeldByBatch_(dbId, moUid)         // batch uid -> qty this MO holds
vfSalesHeldByBatch_(dbId, invoiceUid)  // batch uid -> qty this invoice holds
```

Returns `{ batch_uid, lot, product_id, product_name, unit, transaction_date,
unit_cost, current_qty, held, available }`, oldest-first by `transaction_date`
(the FIFO allocator depends on that order), filtered to `available > 0`.

`vfMfgHeldByBatch_` resolves a footer to its MO through the output row and also
accepts a footer parented directly on the MO uid — the `outUid || moUid`
fallback in the save writes those. `vfSalesHeldByBatch_` resolves an allocation
through its line's `valley_sales_header_id`.

**Rewired (S3)** — the six server call sites. `getValleyProductBatches_`,
`getValleyProductBatchesMulti_`, `getValleyMfgOrderDetail_`,
`assertFooterBalances_`, `saveValleyInvoice_`; `whBatchAvailability_` needs no
add-back (حركة المخزن is add-only) and was already reduced to
`available = current_qty` in S1.

**Live reads (S5)** — `vfCurrentProducts_(dbId)` reads the range directly on
every call and neither populates nor consults `getAllRecords_`'s
`_recordCache_` memo. All seven readers of `valley_current_products` route
through it. That memo is right for a table code writes and wrong for one a sheet
formula recalculates underneath us.

**Ordering (S6)** — `vfFlush_()` (never throws) is called before returning from
the nine handlers that write a feeding table. There was **no**
`SpreadsheetApp.flush()` anywhere in the ValleyFoods module before this run, so
a save could return, the client re-read the balance, and the formula still
answer from before that save. The MO balance guard also moved **inside**
`executeWithLock_` — it ran entirely before the lock, so two concurrent saves
could both pass against the same balance, and `current_qty` is now the only
guard. It is still the first thing in the lock body, so a violation still aborts
with no orphan header.

### Client

* `Company_ValleyFoods_MfgOrderView.html` — `mo_uid: MO_UID` on the three batch
  calls (including `_multi`); both hard-coded `(متاح: 0)` literals now print the
  real figure — what this order already holds of that batch. **A literal zero
  indistinguishable from a genuine one is why this bug survived so long.**
* `Company_ValleyFoods_MfgOrders.html` — sends `mo_uid: EDIT_MO_UID()`.
* `Company_ValleyFoods_Sales.html` — sends `invoice_uid: EDIT_UID`.

### Contracts

* `get_valley_product_batches` still returns `available` per batch. The *value*
  changed; the *shape* did not. `held`, `product_id` and `product_name` were
  added; nothing was removed.
* `exclude_invoice_unique_id` is still accepted, as an alias for the new
  canonical `invoice_uid`, so a half-deployed client cannot break. Its meaning
  changed from *exclude* to *add back*, which is why the name had to change.
* The Arabic MO guard message keeps its shape —
  «الكمية المطلوبة من الدفعة (X) تتجاوز المتاح. المطلوب: N، المتاح: M» — but
  **المتاح is now `current_qty + held`**, so the number the user is told is the
  number the form showed them.

---

## Line count

Production code across the four shipped files:

| | added | deleted | net |
|---|---|---|---|
| `Company_ValleyFoods_Actions.js` | 342 | 257 | +85 |
| the three page templates | 16 | 7 | +9 |
| **total** | **358** | **264** | **+94** |

58 of those added lines are the balance guard **moved** into the lock, matched
by 58 deleted — the same code, re-indented. Excluding the move and counting only
comment-free logic, the module lost more code than it gained; what inflates the
figure is that `vfBatchBalance_` carries a 33-line doc comment explaining why
nothing subtracts. That comment is the point.

---

## Verification

Everything below is offline. Nothing read the spreadsheet, called a Google
service or hit the network.

| Check | Result |
|---|---|
| `node --check` on all seven `.js` files touched | pass |
| `node tools/verify/parse_pages.js` | all inline scripts parse |
| `node tools/verify/ui_smoke_pages.js` | `Company_ValleyFoods_MfgOrderView` boots; the only 3 failures are the 3 that already failed at Phase 0 |
| `node tools/verify/run_all.js` | **All 70 checks pass** (69 before this run, plus the new `s25`) |

### The reported bug, dry-run to the uid — `s25` § 5h

> MO `4c2aa604a79df81f` already holds **500** of batch `B` on the sheet.
> `current_qty` for `B` is **0**. The user adds a work centre and saves, sending
> the same 500.

**It passes** — `available = 0 + 500 = 500`. Before this run it threw
«تتجاوز المتاح». `501` from the same MO is refused. A **different** MO asking
for `1` of `B` is refused, because it holds none of it (`0 + 0`).

### No double subtraction — `s25` § 5c

One batch, `current_qty` 100, with a sales allocation of 10, a consumption
footer of 5 and a warehouse issue of 7 all present in the fixture. For a **new**
document, `vfBatchBalance_`, the `get_valley_product_batches` endpoint and
`whBatchAvailability_` each answer **100**. Any reader answering 78, 80, 85, 90
or 93 would be subtracting.

### The add-back — `s25` § 5a/5b/5d

* `current_qty` 100, this MO holds 30 → **130**; `current_qty` and `held` are
  reported separately so the arithmetic is visible.
* Re-saving 30 passes; 130 passes; **131 throws the Arabic message naming 130**.
* The same batch from a **different** MO → **100**.
* A batch with `current_qty` 0 that this MO holds 40 of is **still offered, at
  40** — and is offered to nobody else. Without this the order could never be
  edited again.
* An invoice being edited is offered the 10 it already holds back → 110.

---

## Deviations from the run prompt, and why

**Three assertions in verify suites outside the declared file set pinned code
this run deletes.** They are stale in exactly the way `s12`'s 80 was. Leaving
them red would have meant reporting a red suite; gaming them would have meant
writing dead code to satisfy a test. Both were rejected; the assertions were
corrected, minimally, and are listed here so nobody finds them by surprise:

1. **`tools/verify/s5_cost_strip.js`** required the literal
   `vfStripCostAll_(_cached.batches, VF_COST_KEYS.batch)` — the cost strip
   guarding the `CacheService` hit that S1 deletes. Replaced with the opposite
   assertion: the product-keyed batch cache, and the second strip it needed,
   must stay gone.
2. **`tools/verify/s1_save_cost.js`** required `footerBatchCost` to be built
   from `getAllRecords_(dbId, 'valley_current_products')`. It now reads through
   `vfCurrentProducts_`; the regex was updated and the reason recorded beside
   it. The assertion it makes — that the save and the read path use the same
   source — is unchanged.
3. **`tools/verify/s17_purchasing_save.js`** slices the purchasing block into a
   `vm` sandbox, so it needs a `vfFlush_` stub now that
   `saveValleyPurchasingCosting_` flushes. One line in its `env`.

`s12` § 6 also carried a static assertion, *"availability folds in this table's
own `movmenent_sign`"*, outside the § 8 the prompt scoped. It pinned the deleted
model directly, so it now asserts the opposite. `s12` is in the declared file
set; the rest of that file, which carries another effort's uncommitted work, was
not touched.

**Nothing else deviates.** No other file outside the declared set was modified.

---

## Explicitly not done

* **No reconciliation, no integrity report, no drift column, no purge.**
  `current_qty` is trusted as produced. Nothing in this run audits the tables
  that feed it.
* **No orphan cleanup.** The owner has stated there is no deleted-invoice case,
  so there is no cascade, no orphan handling, no integrity report. The two
  orphan guards added earlier in the session were **deleted**, not extended:
  they were built for a gross-receipts model of `current_qty` that is wrong.
* **No formula inside `valley_current_products` was edited, regenerated or
  extended,** and the table is still never written by code.
* **`valley_products_movement` is never read, written or referenced.** `s25`
  asserts this.
* **No schema change.** No column added, renamed, removed, reordered or
  retyped; no new sheet or tab; no new `settingsEnsureSheet_` call.
* **No deploy, no push, no `clasp` anything, no trigger, no Script Property, no
  server function run.**
* `deleteRowsByCriteria_(sheetCons, 'valley_manufacture_header_product_id',
  moUid)` in the MO save was **kept** — it prevents duplicate footer rows, which
  the sheet formula would sum. `priorLineUids` in `saveValleyInvoice_` was
  **kept** — that is a line removed while editing an invoice, not the
  deleted-invoice case.

---

## Two things worth the owner's attention

1. **`saveValleyInvoice_` still throws before it writes anything.** It reads an
   undeclared `outputs` in a block of dead M2/M3 costing computation copied from
   the manufacturing handler. This is **U-48**, a pre-existing defect present
   since the initial commit, documented in `VALLEYFOODS_RESULTS.md` and pinned
   by `tools/verify/s5c_sales_audit.js`. It was **not** fixed here — out of
   scope for this run. The invoice-side add-back this run adds is correct but
   currently unreachable in production because of it. Say the word and it is a
   ten-line fix.
2. **`batchCurrent[buid].unit_cost` in the sales save was always `undefined`.**
   The map it read never carried a `unit_cost` key. It now does, because
   `vfBatchBalance_` returns one. No behaviour depended on the old value (see
   point 1), but the line is now correct rather than accidentally inert.

---

## The owner's visual checklist

Run these against the deployed build after you push. Each is a specific
statement, not "check it looks right".

- [ ] Open `action=vf_mfg_order&mo=4c2aa604a79df81f`, add a work centre, press
      حفظ. **It saves.** No «تتجاوز المتاح».
- [ ] On that same order, batch
      `766-2026072902-بطاطس خام عميل دايموند-29/07/2026` shows **23,430**, not
      0 — matching `valley_current_products` exactly.
- [ ] Re-saving that order without changing anything succeeds, every time,
      repeatedly.
- [ ] Adding a **new** raw-material line offers batches whose المتاح equals the
      sheet's `current_qty` for that batch, to the digit.
- [ ] A batch fully consumed by this order still appears **on this order's
      form**, showing the quantity this order holds.
- [ ] The same batch opened from a **different** MO shows the sheet's
      `current_qty`, not the inflated figure.
- [ ] In حركة المخزن, المتاح for any batch equals `current_qty` in the sheet, to
      the digit.
- [ ] A sales invoice being edited still allows the quantity it already holds.
- [ ] A user without the cost grant sees no cost values **in the network
      response**, not merely hidden on screen.

---

## Handover

```bash
git log --oneline 1671087..HEAD    # the eight commits, S1 through S8
node tools/verify/run_all.js       # All 70 checks pass
```

The working tree still carries ~22 modified and ~20 untracked files belonging to
several other efforts (TopChemical, TopLight, attendance, box analysis, iPhone,
stock scan). **None of them were staged, reverted or cleaned.** Only the ten
paths this run owns were committed.

Nothing here has been pushed. The owner pushes.
