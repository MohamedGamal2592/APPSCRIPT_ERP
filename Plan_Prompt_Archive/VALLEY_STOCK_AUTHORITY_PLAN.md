# Valley Foods — stock authority plan

**Status:** plan only, nothing implemented.

**Decision (owner, binding):** `valley_current_products.current_qty` **is** the net available
quantity. It is produced by a complex sheet formula, that formula is correct, and it is
**trusted**. The code uses the value raw: it never subtracts from it, never reconciles it, never
recomputes it, and never touches the formulas inside `valley_current_products`.

---

## 0. The rule

There is exactly one availability formula in the system, and it is this:

```
available(batch, document) = current_qty(batch) + held(document, batch)
```

* `current_qty` — the sheet's net balance, taken as authoritative. Purchases, production output,
  by-products, sales, sales returns, manufacturing consumption and warehouse movement are
  **already in it**.
* `held(document, batch)` — the quantity **currently recorded on the sheet** for the document
  being edited, against that batch. **Zero for a new document.**

The add-back is not an optimisation, it is the correctness condition. A document being edited
already had its own committed quantity subtracted inside `current_qty`, and the save is about to
**rewrite those very rows**. That quantity is therefore still the document's to spend. Without the
add-back, re-saving an order without changing anything refuses the order's own stock — which is
the bug reported on `action=vf_mfg_order` when adding products or work centres.

Everything below follows from that one line.

---

## 1. Why this is a deletion, not an addition

Four call sites each re-subtract commitments on top of an already-net base, each a different
subset. Every one of them double-counts:

| Reader | subtracts today | double-counts |
|---|---|---|
| `getValleyProductBatches_` — MO form **and** sales | sales, returns | sales twice |
| `assertFooterBalances_` — MO save | other MOs' consumption | consumption twice |
| `saveValleyInvoice_` — sales save | sales, returns | sales twice |
| `whBatchAvailability_` — حركة المخزن | sales, returns, consumption, movements | everything twice |

This matches the legacy app exactly: `appsheet_current_qty` («الكمية المتاحة حاليا») was a complete
net balance, and the legacy rules used it **raw** — `[qty] <= [item].[appsheet_current_qty]` with the
message «الكمية لابد ان تكون اكبر من الصفر واقل من الرصيد المتاح», and batch pickers filtered on
`[current_qty] <> 0`, with no further arithmetic anywhere.

**The net effect of this plan is less code than exists today.**

Consequence worth stating plainly: the batch `766-2026072902` reading 0 against a `current_qty` of
23,430 is explained by the double-subtraction alone. Removing it fixes that batch with **no data
cleanup and no sheet change**.

---

## 2. The one function

```js
/**
 * The ONE availability figure in the system.
 *
 * valley_current_products.current_qty is the net balance and it is TRUSTED.
 * The sheet already nets purchases, production, by-products, sales, returns,
 * consumption and warehouse movement, so NOTHING here subtracts from it — a
 * second subtraction is a double count, and four different second subtractions
 * is what this function replaces.
 *
 * The only adjustment is the add-back. A document being edited already has its
 * own committed quantity subtracted inside current_qty, and the save is about
 * to rewrite those very rows, so that quantity is still the document's to
 * spend. Without it, re-saving an unchanged order refuses its own stock.
 */
function vfBatchBalance_(dbId, opts)   // opts: { product_id?, mo_uid?, invoice_uid? }
```

Returns, per batch:

```
{ batch_uid, lot, product_id, product_name, unit, transaction_date, unit_cost,
  current_qty,      /* the sheet's net balance, verbatim */
  held,             /* what THIS document already holds, 0 when new */
  available }       /* current_qty + held */
```

Rules:

* Offer filter is **`available > 0`**, not `current_qty > 0`. A batch this document has fully
  consumed must stay visible on its own form, or it cannot be edited.
* Order stays oldest-first by `transaction_date` — the FIFO allocator depends on it.
* Cost stripping unchanged (`VF_COST_KEYS.batch`, the S5 gate).

Two small helpers replace the two orphan guards added earlier in this session, which were built for
the wrong model:

```js
vfMfgHeldByBatch_(dbId, moUid)         // batch uid -> qty this MO holds
vfSalesHeldByBatch_(dbId, invoiceUid)  // batch uid -> qty this invoice holds
```

`vfMfgHeldByBatch_` resolves a footer to this MO through its output row
(`valley_manufacture_header_products`), and also accepts a footer parented directly on the MO uid
(the `outUid || moUid` fallback in the save). `vfSalesHeldByBatch_` resolves an allocation through
its line's `valley_sales_header_id`.

`vfLiveSalesLines_` and `vfLiveMfgFooterOwners_` are **deleted** together with the subtractions they
guarded.

---

## 3. Call-site changes

### Server

| # | Site | Today | After |
|---|---|---|---|
| 1 | `getValleyProductBatches_` | `current − sales + returns` | delegates to `vfBatchBalance_` |
| 2 | `getValleyProductBatchesMulti_` | loops #1 | passes the new opts through |
| 3 | `getValleyMfgOrderDetail_` | calls #1 with product only | passes `mo_uid` |
| 4 | `assertFooterBalances_` (MO save) | `current − other MOs` | `need ≤ current_qty + held(this MO)` |
| 5 | `saveValleyInvoice_` (baseline) | `current − sales + returns` | `need ≤ current_qty + held(this invoice)` |
| 6 | `whBatchAvailability_` | all five terms | `available = current_qty` |

Code deleted outright: the sales-allocation loop and the returns-restore loop in #1, the
`lineToInv` map, the `usedByBatch` term in #4, the `batchUsage` baseline and returns loop in #5, and
the sales/returns/consumption/movement terms in #6.

`whBatchAvailability_` (#6) needs no add-back: حركة المخزن is add-only, so there is no document
being edited.

### Parameters

`exclude_invoice_unique_id` changes meaning from *exclude* to *add back*, so the name would lie.
Accept `invoice_uid` as canonical, keep `exclude_invoice_unique_id` as an accepted alias so nothing
breaks mid-deploy, and add `mo_uid`.

### Client

| File | Line | Change |
|---|---|---|
| `Company_ValleyFoods_MfgOrderView.html` | 442 | send `mo_uid: MO_UID` |
| `Company_ValleyFoods_MfgOrderView.html` | 937 | send `mo_uid: MO_UID` |
| `Company_ValleyFoods_MfgOrderView.html` | 1118 | `get_valley_product_batches_multi` → send `mo_uid` |
| `Company_ValleyFoods_MfgOrders.html` | 407 | send `mo_uid` (or `''`) |
| `Company_ValleyFoods_Sales.html` | 592 | rename to `invoice_uid: EDIT_UID` |

One client-side detail to fix while there: `outputRowInner_` renders `(متاح: 0)` as a **hard-coded
literal** for a saved batch that is not in the offered list. With `available > 0` as the filter and
the add-back applied, that fallback should be unreachable for a live batch — but it must print the
real figure rather than a literal zero, because a hard-coded 0 is indistinguishable from a genuine
one, and it is what made this bug so hard to see.

---

## 4. Caches — `valley_current_products` is read live, never cached

Owner requirement: no cache on this table. Trusting the value means reading the **current** one.

1. **Delete** the `CacheService` read at the head of `getValleyProductBatches_` (key
   `vfbatch_<db>_<pid>_<excl>`). Nothing writes it today, so it is dead — but it is keyed by product
   and **not by user**, so the day someone adds the `put`, one user gets another user's batch list,
   cost columns included.
2. **Bypass the per-request memo.** `getAllRecords_` memoises whole sheets in `_recordCache_`. Add
   `vfCurrentProducts_(dbId)` that reads the range directly on every call and never populates or
   consults that memo, and route **every** reader of `valley_current_products` through it. There are
   roughly nine today; they get re-grepped at implementation time rather than trusted from a stale
   line list.
3. **Client cache — nothing to remove, and it must stay that way.** `UIC.Cache.swr` is defined but
   has **no call sites**, so batch lists are not client-cached today. (This corrects an
   overstatement in the preceding analysis.) A verify assertion pins it: no ValleyFoods page may
   route a batch or MO-detail call through `swr`.

---

## 5. Reading the current value

`current_qty` is trusted; this section is only about making sure we read the **current** one rather
than a stale one. Two ordering problems, neither handled today — there is no
`SpreadsheetApp.flush()` anywhere in the ValleyFoods module.

1. **Flush after writing a feeding table.** Any save touching `valley_manufacture_footer`,
   `valley_sales_product_stock`, `valley_warehouse_movement`, `valley_product_purchasing`,
   `valley_manufacture_header` or `valley_manufacture_header_products` calls `SpreadsheetApp.flush()`
   before it returns, so the read-back the client performs next sees a recalculated balance.
2. **Check inside the lock.** `assertFooterBalances_` currently runs entirely **before**
   `executeWithLock_`, so two concurrent saves can both pass against the same balance. Now that
   `current_qty` is the only guard, the check moves **inside** the lock and reads the balance there.

---

## 6. Tests

**Changed — `tools/verify/s12_warehouse_movement.js`.** Its §8 dry run asserts
`100 − 10 sold + 2 returned − 5 consumed − 7 issued = 80`. Under this rule the answer is **`100`** —
every one of those terms is already inside `current_qty`. The fixture and the three assertions that
depend on it change. Flagging this loudly: that test currently **pins the wrong semantics**, and it
is the check that will fail first.

**New — `tools/verify/s25_stock_authority.js`,** in the house static + dry-run style:

* no reader subtracts sales, consumption, returns or movement from `current_qty`
* the only adjustment applied anywhere is the add-back
* `getValleyProductBatches_` contains no `CacheService` read
* `valley_current_products` is reached through the live reader, never `getAllRecords_`
* dry run: `current_qty` 100, this MO already holds 30 → available **130**; re-saving 30 passes; 131
  fails with the Arabic over-allocation message
* dry run: same batch seen from a **different** MO → available **100**

`s1_save_cost.js` is unaffected — `footerBatchCost` still reads `unit_cost` from the same table.

---

## 7. Explicitly not touched, and not second-guessed

* **The formulas inside `valley_current_products`.** Not edited, not regenerated, and the table is
  never written by code.
* **No reconciliation, no integrity report, no purge.** The balance is trusted as produced. The code
  does not audit the tables that feed it.
* **`valley_products_movement`.** Not read, not written, not referenced.
* **The `mo_status = "Locked"` receipt rule.** Whether an MO's output counts as stock is the sheet's
  business, not ours.
* The S5 cost gate and every `VF_COST_KEYS` stripping rule.

---

## 8. Order of work

1. `vfBatchBalance_` + the two held-by helpers; rewire the six server call sites; delete the dead
   subtraction code and the two orphan guards. **This is what fixes the reported bugs.**
2. Cache removal and the live reader (§4).
3. Lock and flush ordering (§5).
4. `s12` update and the new `s25` (§6).

One reviewable change.

---

## 9. Open question

**Zero-balance batches on their own form.** A batch whose `current_qty` is 0 because this document
consumed all of it must still be offered on that document's own form — otherwise the order cannot be
edited. The plan does this via `available = current_qty + held > 0`. Default unless told otherwise.
