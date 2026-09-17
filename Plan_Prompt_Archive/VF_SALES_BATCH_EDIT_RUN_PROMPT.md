# تعديل دفعات فاتورة المبيعات — agent prompt

Make it possible to reopen an existing Valley Foods sales invoice — including one saved with **no**
batch allocations at all — and enter or change its batches. When it is saved, the allocation rows
this invoice already owns are **updated in place**; only a batch that is genuinely new gets a new
row, and only a batch that was removed loses its row.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows, and changes no
spreadsheet formula.

**This is a small run.** Three defects, one behaviour change, one test file. If your diff exceeds
~250 changed lines, you have widened the scope past what the owner asked for.

There is **no separate plan file** — this prompt is the specification.

---

## Read these first, in full, before touching anything

1. **`Company_ValleyFoods_Actions.js`** — `saveValleyInvoice_` (~L8135, ends ~L8455) and
   `getValleyInvoiceFull_` (~L8502). Read the whole of both.
2. **`Company_ValleyFoods_Sales.html`** — `openEdit` (~L181), `drawLines` (~L317), `collectLines`
   (~L336), `loadBatches` (~L575), `collectAllocations` (~L633).
3. **[VALLEY_STOCK_AUTHORITY_PLAN.md](VALLEY_STOCK_AUTHORITY_PLAN.md)** — the stock model this run
   sits on top of and must not disturb: `available = current_qty + held(this document)`.
4. **`tools/verify/s25_stock_authority.js`** — the house test style you are copying (static source
   assertions + a dry run of code lifted from the real source).

Verify every `file:line` in this prompt with `grep -n` before you edit it. The line numbers were
taken from a **dirty working tree** and drift constantly.

---

## The three defects — confirm each one yourself before fixing it

### D1 — `saveValleyInvoice_` throws on **every** save, new or edited

`Company_ValleyFoods_Actions.js` ~L8269–L8281:

```js
    /* M2: header total_inventory_cost = Σ consumption value */
    var totalInventoryCost = 0;
    cleanLines.forEach(function (ln) { totalInventoryCost += (ln.line_material_cost || 0); });
    /* M3: output costing — simple average across outputs */
    var totalOutQty = 0;
    outputs.forEach(function (o) { totalOutQty += Number(o.qty || 0); });      // ← ReferenceError
    var avgCostUnit = totalOutQty > 0 ? totalInventoryCost / totalOutQty : 0;
    outputs.forEach(function (o) {
      o.cost_unit = avgCostUnit;
      o.total_cost = Number(o.qty || 0) * avgCostUnit;
    });
```

`outputs` is **never declared** in this function — the block is a copy-paste from the manufacturing
order save, where `outputs` is a real local (`~L5304`). A sales invoice has no outputs. Confirm with
`grep -n "outputs" Company_ValleyFoods_Actions.js` that the only declarations are function-locals in
*other* functions, and that no global `outputs` exists anywhere in the repo. It sits after all
validation and before `executeWithLock_`, so it is reached on every call and nothing is ever
written. The client shows «فشل الحفظ».

Nothing downstream reads `totalInventoryCost` or `avgCostUnit` — grep and prove it. **Delete the
whole block.** Do not repair it, do not persist a sales cost, do not add a column.

### D2 — reopening an invoice throws away the batches it already has

`getValleyInvoiceFull_` **does** return per-line allocations (~L8537–L8550: `alloc_uid`, `batch_uid`,
`lot`, `qty`). But `openEdit` (~L190–L199) maps each line into `DRAFT_LINES` without an
`allocations` field, so `drawLines` calls `loadBatches(i, pid, DRAFT_LINES[i].allocations)` with
`undefined` (~L331) and every allocation strip renders empty. Because the server requires each
line's allocations to equal its quantity (~L8248), the user is then forced to re-enter batches for
**every** line — not just the ones that were missing — or the save is refused.

### D3 — an edit deletes the invoice's allocation rows and re-adds them

`Company_ValleyFoods_Actions.js` ~L8390–L8446 rewrites `valley_sales_product_stock` by deleting
every row belonging to this invoice's lines and appending fresh rows with **new** `unique_id` values
and a new `created_at`. Changing one quantity on one batch replaces every allocation row of the
invoice. The owner wants the rows the invoice already carries to be **updated**, not replaced.

---

## The owner's decision — do not re-ask, do not re-litigate

> «لو الباتشات اتغيرت يتم تحديث الباتشات المحملة على الفاتورة مش اضافة سطور جديدة»
> «طبعا ممكن يضيف سطور جديدة لو عدد الباتشات مثلا زادت»

| Question | Answer |
|---|---|
| Row identity | A `valley_sales_product_stock` row is identified by **(`valley_sales_products_id`, `product_unique_id`)** — the line uid and the batch uid. |
| Quantity changed on a batch the line already had | **Update `product_qty` on that row.** Its `unique_id` and `created_at` do not change. |
| A batch added to a line | One **new** row appended. This is expected and correct. |
| A batch removed from a line | That row is **deleted**. |
| A line deleted while editing | All of that line's allocation rows are deleted (this is what `priorLineUids` at ~L8355 already exists for — keep it). |
| Nothing changed at all | **Zero writes.** Re-saving an untouched invoice must not touch the allocation sheet. |
| An invoice that had no allocations | Every batch is an append. Nothing to update, nothing to delete. |
| `unique_id` of a kept row | Never regenerated. That is the whole point of the change. |
| `id` column | Stays exactly as the current insert leaves it (blank). Numbering is **out of scope** — do not introduce it. |
| `product_transaction_code` (lot) | Written on insert from `batchCurrent[...].lot`, as today. On a kept row, refresh it only if the stored value is empty. |
| Line rows themselves | Still delete-and-reinsert (~L8368–L8388). **Out of scope.** They keep their `unique_id` across the rewrite, which is exactly why allocation rows keyed on the line uid survive it. Say so in the results doc; change nothing. |
| Who may edit | Unchanged: super admin only (~L8140), and an Approved invoice must be reverted to Pending first (~L8318, and the تعديل button is hidden at `Sales.html:138`). |
| Availability while editing | Unchanged: `available = current_qty + held(this invoice)` via `invoice_uid`. Do not touch it. |
| What `current_qty` subtracts for a sale | **The allocation rows in `valley_sales_product_stock`** — not the line quantity in `valley_sales_products`. The owner has confirmed this against the sheet formula. Two consequences you must not fight: an invoice with no allocation rows never reduced stock, so allocating it now is the first and only subtraction (no double count); and removing an invoice's allocation rows returns exactly that quantity to `available`. |
| A line reopened with no saved allocations | Auto-filled FIFO on open — see S2c. |

---

---

## What the owner does *after* this run — and why you must not do it for them

Once this run is merged and deployed **by the owner**, they will walk the historical invoices one by
one: for an invoice whose allocation rows are wrong or stale they delete those rows by hand in the
sheet, then reopen the invoice in the page, let the FIFO fill propose the batches, adjust, and save.
An invoice that simply never had allocations needs no deletion at all — they just open it and save.

That is a **manual, owner-driven** pass. Your job is to make the page capable of it.

* Write **no** backfill, no migration, no "fix all invoices" function, no repair pass, not even one
  guarded behind a flag or a `dryRun` parameter, and not as a script in `tools/`.
* Write **no** integrity report or orphan scan. If you think one would help, say so in the results
  doc and stop there.
* Do not delete, rewrite or "normalise" a single existing allocation row.

The one thing that genuinely helps them is the code in S1–S3 plus the FIFO fill in S2b/S2c. Nothing
else.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema

No column added, renamed, removed, reordered or retyped, in any table, in any spreadsheet. No new
sheet or tab. `valley_sales_product_stock` keeps exactly the eight columns the existing
`settingsEnsureSheet_` call names: `unique_id, id, valley_sales_products_id, product_unique_id,
product_transaction_code, product_qty, user, created_at`.

## 2. NEVER add, edit, or delete data in any business table

No rows written, updated or deleted by you. No backfills, no test invoices, no cleanup of
allocation rows you think are orphaned. Not by hand, not via `clasp run`, not via a one-off function.

## 3. NEVER deploy, never push

Never `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM`), never create or promote a deployment,
never `clasp login/run/open`, never push to `origin`. **The owner pushes when everything is
finished.** No triggers, no Script Properties, no running any server function.

## 4. `valley_current_products.current_qty` is the stock authority — leave it alone

It is a sheet formula, it is correct, and the owner has said so repeatedly. You never subtract from
it, recompute it, reconcile it, audit it, or add a fallback that recomputes stock from source
tables. You never reference `valley_products_movement`. If a number looks wrong, write it up; do not
add code to compensate.

## 5. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `SESSION.*`, every backend function signature, every
existing response shape, every HTML anchor id. Specifically:

* `get_valley_invoice_full` keeps returning `{ status, invoice, lines }` with `lines[].allocations`
  in its current shape. You are fixing a **consumer**, not the payload.
* `save_valley_invoice` keeps accepting the same payload. The client already sends
  `lines[].allocations` as `{batch_uid, lot, qty}` — do **not** add `alloc_uid` to the wire. The
  server matches on (line uid, batch uid); it does not need the client to tell it which row is which.
* `get_valley_product_batches` is not touched at all.

## 6. Stay inside your file set

```
Company_ValleyFoods_Actions.js        (D1 deletion, D3 upsert)
Company_ValleyFoods_Sales.html        (D2, one field in one map)
tools/verify/s28_sales_batch_edit.js  (new)
tools/verify/run_all.js               (one STEPS line)
VF_SALES_BATCH_EDIT_RESULTS.md        (new, at the end)
```

**Do not convert this page to optimistic saving.** A separate, larger programme
([OPTIMISTIC_SAVE_RUN_PROMPT.md](OPTIMISTIC_SAVE_RUN_PROMPT.md) /
[OPTIMISTIC_SAVE_ROLLOUT_PLAN.md](OPTIMISTIC_SAVE_ROLLOUT_PLAN.md)) is rolling `UIC.Live` out across
40 forms. `ValleyFoods/Sales` is classified **Tier C** there — 7 tables, 21 throws — and Tier C
pages keep the blocking overlay **on purpose** and are explicitly not touched. Leave the overlay
alone, do not import `UIC.Live` here, and take the test numbers `s26` / `s27`, which that run
reserves, as taken: yours is `s28`.

Nothing else. **In particular: never touch `src_html/`.** It is a stale tracked copy that nothing
generates and nothing deploys — `.clasp.json` sets `"skipSubdirectories": true`, so only root-level
files reach the script. Editing it would create a second, divergent truth.

---

## Starting state — the tree is dirty, and none of the dirt is yours

```bash
cd d:/Work/Script
git branch --show-current   # feat/vf-stock-authority
git status --porcelain      # ~18 modified + ~20 untracked files from several other efforts
```

Those belong to other programmes (TopChemical, TopLight, attendance, box analysis, iPhone, stock
scan). **Do not stage them, do not revert them, do not clean the tree.** `Company_ValleyFoods_Actions.js`
and `Company_ValleyFoods_Sales.html` are currently *clean* — confirm with `git status --porcelain --
<path>` before you start, and if that has changed, edit only the blocks named here and never
`git checkout --` either file.

```bash
git checkout -b fix/vf-sales-batch-edit
```

**Stage explicit paths only.** Never `git add -A`, never `git add .`, never `git commit -a`.

---

## Your task — four steps, one commit each, in order

### S0 — Recon (no edits, no commit)

Confirm and note:

1. That `outputs` is undeclared in `saveValleyInvoice_` and has no global definition (D1), and that
   `totalInventoryCost` / `avgCostUnit` have no reader.
2. That `getValleyInvoiceFull_` returns `allocations` and `openEdit` drops them (D2).
3. The exact current allocation block (D3), including how `priorLineUids` is collected **before**
   the line rows are deleted and why that ordering matters.
4. The signatures of `getSheet_`, `getHeaders_`, `getAllRecords_`, `settingsEnsureSheet_`,
   `executeWithLock_`, `noteMutation_`, `vfBatchBalance_`, `vfFlush_`, `finBustRefs_`.
5. That `cleanLines[].unique_id` is the client's `unique_id` when editing (~L8195), so line uids are
   stable across an edit — the precondition for keying allocation rows on them.

### S1 — Delete the dead costing block *(one commit)*

Remove D1's block from `saveValleyInvoice_`, whole. Leave `ln.line_material_cost`, `a.cost_unit` and
`a.total_cost` where they are set in the validation loop (~L8262–L8266) — record in the results doc
that they are now unread, and that Valley sales costing was never persisted anywhere, as a decision
for the owner. Do not persist it yourself.

`node --check Company_ValleyFoods_Actions.js` must pass.

### S2 — Carry the allocations into the edit form *(one commit)*

In `Company_ValleyFoods_Sales.html`, `openEdit` (~L190–L199), add the field the mapper drops:

```js
              price: Number(l.product_price || 0),
              allocations: (l.allocations || []).map(function (a) {
                return { batch_uid: String(a.batch_uid || ''), lot: a.lot || '', qty: Number(a.qty || 0) };
              })
```

Nothing else changes: `drawLines` already passes `DRAFT_LINES[i].allocations` to `loadBatches` as
the prefill (~L331), and `loadBatches` already rebuilds `DRAFT_LINES[i].allocations` from it
(~L611–L612). Because the batch list for an edit is fetched with `invoice_uid: EDIT_UID`, the
quantities this invoice holds are added back into `available`, so a prefilled row is never over its
own maximum.

Check `loadBatches`'s build step for a saved batch that is **not** in the offered list, and say in
the results doc what the user sees in that case. Do not redesign it in this run.

### S2b — the FIFO auto-fill must sum **exactly** to the line quantity *(fold into the S2 commit)*

`salesAllocFifo_` (`Company_ValleyFoods_Sales.html` ~L500) rounds each allocation to 3 decimals but
decrements `rem` by the **unrounded** `take`:

```js
        var take = Math.min(rem, avail);
        out.push({ ..., qty: Math.round(take * 1000) / 1000, ... });
        rem = Math.round((rem - take) * 1000) / 1000;
```

When a batch's `available` carries more than three decimals — it comes from a sheet formula, so it
can — the pushed quantity and the consumed quantity differ. Across several batches the residue can
exceed the server's `0.0001` tolerance (~L8248), and the save is refused with «مجموع تخصيص الدفعات
لا يساوي الكمية» on a form the user filled correctly and cannot fix except by hand.

Fix it in the one place: decrement `rem` by the **same rounded number that was pushed**, and let the
final allocation absorb any residue so the allocations sum to the line quantity to the last digit.
Never push more than a batch's `available`. Do not touch `autoAllocFifo_` in
`Company_ValleyFoods_MfgOrderView.html` — same shape, different programme, out of scope; note it in
the results doc.

### S2c — A reopened line with no saved allocations auto-fills FIFO *(fold into the S2 commit)*

The owner is about to walk an entire back catalogue of invoices that carry **no** allocations at
all, one by one, to allocate them. Opening each one to blank strips and having to nudge every
quantity field to trigger the auto-fill is the whole cost of that pass.

So: when an invoice is opened for edit, a line that has a product, a quantity, and **no saved
allocations** is auto-filled FIFO once its batches have loaded — the same advisory fill
`onQtyChange` already performs via `autoAllocSalesFifo_` (~L556), honouring the same per-line
`fifo-auto-<i>` checkbox. Nothing is saved until the user presses حفظ; this fills a form, it does
not write a row.

Two rules:

* A line that **does** have saved allocations is never auto-filled, never re-ordered, and never
  topped up. What the invoice holds is what the form shows. Only genuinely empty lines are filled.
* The fill runs after `loadBatches` has resolved for that line, not before — otherwise `BATCH_CACHE`
  is empty and the fill silently does nothing (see the `if (!batches.length) return;` guard).

Cover both rules in the S4 dry run at the page level if the harness allows it; if it does not, say
so plainly in the results doc and cover them in the owner's checklist instead.

### S3 — The allocation write becomes an upsert *(one commit)*

Replace the delete-all-then-append block (~L8390–L8446) with a differential write. Keep the
`settingsEnsureSheet_` call, keep `priorLineUids`, keep `noteMutation_` after every mutating write,
and keep the whole thing inside the existing `executeWithLock_`.

```js
      /* ---- P2: batch-allocation rows (valley_sales_product_stock) ----
       * An edit UPDATES the rows this invoice already owns rather than deleting
       * and re-adding them. A row is identified by (line uid, batch uid), so a
       * changed quantity is one cell write on the same row, which keeps its
       * unique_id and created_at. A batch the user added gets a new row; a
       * batch removed — or a whole line removed — loses its row; an unchanged
       * invoice writes nothing at all. */
      settingsEnsureSheet_(dbId, 'valley_sales_product_stock',
        ['unique_id','id','valley_sales_products_id','product_unique_id','product_transaction_code','product_qty','user','created_at']);
      var allocSheet = getSheet_('valley_sales_product_stock', dbId);
      var allocHeaders = getHeaders_(allocSheet);
      var aData = allocSheet.getDataRange().getValues();
      var idxOf = function (name) { return allocHeaders.findIndex(function (h) { return String(h).trim() === name; }); };
      var aLineIdx = idxOf('valley_sales_products_id');
      var aBatchIdx = idxOf('product_unique_id');
      var aQtyIdx = idxOf('product_qty');
      var aLotIdx = idxOf('product_transaction_code');
      var aUserIdx = idxOf('user');

      /* the line uids this invoice owns now, plus the ones it owned before the
         rewrite — a line the user deleted must release its batches too */
      var invLineUids = {};
      cleanLines.forEach(function (ln) { invLineUids[ln.unique_id] = true; });
      priorLineUids.forEach(function (lu) { if (lu) invLineUids[lu] = true; });

      /* what the invoice should hold after this save, keyed line|batch */
      var wanted = {};
      allocByLine.forEach(function (entry) {
        entry.allocations.forEach(function (a) {
          wanted[entry.line_uid + '|' + String(a.batch_uid)] =
            { line_uid: entry.line_uid, batch_uid: String(a.batch_uid), qty: Number(a.qty) };
        });
      });

      var dropRows = [];
      for (var ad = 1; ad < aData.length; ad++) {
        var luA = String(aData[ad][aLineIdx] || '').trim();
        if (!luA || !invLineUids[luA]) continue;                 /* another invoice's row */
        var key = luA + '|' + String(aData[ad][aBatchIdx] || '').trim();
        var want = wanted[key];
        if (!want) { dropRows.push(ad + 1); continue; }           /* batch no longer allocated */
        if (Math.abs(Number(aData[ad][aQtyIdx] || 0) - want.qty) > 0.0000001) {
          allocSheet.getRange(ad + 1, aQtyIdx + 1).setValue(want.qty);
          noteMutation_(allocSheet);
          if (aUserIdx !== -1) { allocSheet.getRange(ad + 1, aUserIdx + 1).setValue((user && user.email) || ''); noteMutation_(allocSheet); }
        }
        if (aLotIdx !== -1 && !String(aData[ad][aLotIdx] || '').trim()) {
          var lotFix = (batchCurrent[want.batch_uid] || {}).lot || '';
          if (lotFix) { allocSheet.getRange(ad + 1, aLotIdx + 1).setValue(lotFix); noteMutation_(allocSheet); }
        }
        delete wanted[key];                                      /* row already exists */
      }

      /* descending, so an earlier deletion cannot shift a later row number */
      for (var dr = dropRows.length - 1; dr >= 0; dr--) {
        allocSheet.deleteRow(dropRows[dr]);
        noteMutation_(allocSheet);
      }

      /* only genuinely new (line, batch) pairs are appended */
      var allocRows = [];
      Object.keys(wanted).forEach(function (k) {
        var w = wanted[k];
        var binfo = batchCurrent[w.batch_uid] || {};
        var m3 = {};
        m3['unique_id'] = Utilities.getUuid();
        m3['valley_sales_products_id'] = w.line_uid;
        m3['product_unique_id'] = w.batch_uid;
        m3['product_transaction_code'] = binfo.lot || '';
        m3['product_qty'] = w.qty;
        m3['user'] = (user && user.email) || '';
        m3['created_at'] = new Date();
        allocRows.push(allocHeaders.map(function (h) {
          var k2 = String(h).trim();
          return m3[k2] !== undefined ? m3[k2] : '';
        }));
      });
      if (allocRows.length) {
        var allocStart = allocSheet.getLastRow() + 1;
        allocSheet.getRange(allocStart, 1, allocRows.length, allocHeaders.length).setValues(allocRows);
        noteMutation_(allocSheet);
      }
```

This is a specification, not a transcript to paste blindly: reconcile it against the real
surrounding code (variable names, the header list, whether `batchCurrent` is in scope at that point)
and adapt. If something in it is wrong, fix it and say so in the results doc — but the row identity
rule and the four outcomes in the decision table are not negotiable.

**Do not** rewrite the whole allocation sheet body in one `setValues` "for speed". That is what the
old code did, and it rewrites other invoices' rows.

### S4 — Tests, then the results doc *(one commit)*

**`tools/verify/s28_sales_batch_edit.js`** (new), house style — static assertions lifted from the
real source, plus a dry run under `tools/verify/gasstub.js`:

Static:
1. `saveValleyInvoice_` contains no identifier `outputs`, no `totalInventoryCost`, no `avgCostUnit`.
2. `saveValleyInvoice_` contains no `deleteRowsByCriteria_` and no full-body `setValues` against
   `valley_sales_product_stock` — the delete-all path is gone and stays gone.
3. `openEdit` in `Company_ValleyFoods_Sales.html` maps `allocations` from the server line.
4. `priorLineUids` is still collected before the line rows are deleted.

Dry run — one invoice, one line uid `L1`, batches `B1`/`B2`/`B3`, against a stubbed sheet:

5. Saving `{B1: 5}` onto an invoice with **no** existing rows appends exactly one row.
6. Re-saving `{B1: 5}` unchanged performs **zero** writes to the allocation sheet, and the row keeps
   its original `unique_id` and `created_at`.
7. Saving `{B1: 7}` updates the same row's `product_qty` to 7 — `unique_id` unchanged, row count
   unchanged.
8. Saving `{B1: 7, B2: 3}` keeps `B1`'s row untouched and appends one row for `B2`.
9. Saving `{B2: 3}` deletes `B1`'s row and leaves `B2`'s row with its original `unique_id`.
10. A row belonging to a **different** invoice's line uid is never read, updated or deleted.
11. Removing line `L1` entirely (so it is only in `priorLineUids`) deletes all of its rows.
12. S2b: `salesAllocFifo_`, lifted from the real page source, allocating a line quantity of `10`
    across batches whose `available` values are `3.0004`, `3.0004` and `10` returns allocations
    summing to **exactly 10**, and no allocation exceeds its batch's `available`. Assert the same
    for a plain case (`4`, `6` → `10`).

**The invariant these tests exist to pin:** for every line, `Σ valley_sales_product_stock.product_qty`
over that line's rows equals `valley_sales_products.product_qty` for that line. The server already
enforces it per line on every save (~L8248), for **every** line of the invoice and not just the ones
the user touched, and the line rows and the allocation rows are written inside the same
`executeWithLock_`, so they cannot diverge halfway. Nothing in this run weakens that, and nothing in
this run adds a repair pass for rows that already violate it.

Add one line to `STEPS` in `tools/verify/run_all.js`:

```js
  ['s28_sales_batch_edit.js', 'S28 — فواتير المبيعات: an edit updates its batch rows in place'],
```

Then write **`VF_SALES_BATCH_EDIT_RESULTS.md`**: what changed file by file, the dry-run numbers, what
you skipped and why, the note about unread sales costing, and the owner's checklist below.

---

## Verification — you cannot see a browser and you cannot read the spreadsheet

1. `node --check` on every `.js` you touch, after every step.
2. `node tools/verify/parse_pages.js` — `Company_ValleyFoods_Sales` must parse.
3. `node tools/verify/ui_smoke_pages.js` — that page must still boot.
4. `node tools/verify/run_all.js` — the whole suite green, including your new `s28`. Record the
   check count before and after.
5. Prove D1 directly: a dry run that calls the real `saveValleyInvoice_` body with a valid one-line
   payload **fails before your fix** with `outputs is not defined` and succeeds after. If lifting the
   whole function into the harness is impractical, say so and prove it statically instead — do not
   claim a dry run you did not perform.

**The owner's visual checklist** — specific statements, never "check it looks right":

- A sales invoice — any invoice, new or edited — saves at all. Before this run every save failed
  with «فشل الحفظ».
- Open an existing invoice that has **no** batches (super admin; revert it to قيد الانتظار first if
  it is معتمد). Every line comes up **already filled** FIFO — no field has to be touched to trigger
  it — the strip's total equals the line quantity, and حفظ succeeds.
- On an invoice whose lines already have batches, **nothing** is auto-filled or re-ordered: the
  saved batches and quantities are exactly what the form shows.
- Delete one invoice's rows from `valley_sales_product_stock` by hand, then reopen that invoice. The
  batches it had are offered again at their full quantity — the stock came back — and the FIFO fill
  proposes them.
- Open an invoice that **already has** batches. The strips come up **pre-filled** with the saved
  quantities, not blank.
- Change one batch quantity on one line and save. In `valley_sales_product_stock`, that row's
  `product_qty` is the new number and its `unique_id` is **the same as before**. No duplicate row
  appeared for that batch.
- Add a second batch to a line and save. Exactly **one** new row appears; the first batch's row is
  untouched, `unique_id` and `created_at` included.
- Remove a batch from a line and save. Its row is gone; the others are unchanged.
- Delete a whole line and save. All of that line's allocation rows are gone.
- Save an invoice twice without changing anything. The second save changes **nothing** in
  `valley_sales_product_stock` — same row count, same uids, same `created_at`.
- Another invoice's allocation rows are byte-identical before and after all of the above.

---

## When you would normally stop

1. **This prompt covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why, continue with the rest.
3. **Genuinely blocked** (needs the owner's account, needs a sheet read) → write it up, mark it
   blocked-on-owner, continue with everything else.
4. **A whole step is unworkable** → report it plainly, do not fake it, move on.

A reported skip is always better than a guess.

---

## Traps previous sessions hit in this repo

**The Bash heredoc mangles Arabic and backslashes.** `\\` collapses to `\` and quoting breaks on
mixed RTL content. For any file content with Arabic text, regex escapes or nested quoting, use the
`Write`/`Edit` tools. Do not fight the heredoc.

**Do not "improve" the stock model while you are in there.** This run does not touch
`vfBatchBalance_`, the add-back, or any availability term. If you find yourself writing `-=` against
a batch quantity, stop and re-read constraint 4.

**Do not widen D3 into a general upsert helper** for the other sheets. One function, one call site,
this run.

---

## Commit protocol

```
fix(vf-sales-S<n>): <short summary>

<what changed, file by file>
<what was verified, and how — include the dry-run numbers>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

---

## Before you write a single line of code, confirm you understand

1. `saveValleyInvoice_` currently throws `ReferenceError: outputs is not defined` on **every** save,
   and deleting that block is the highest-priority fix.
2. The server already returns each line's allocations; the client throws them away. You are fixing
   the consumer, not the payload.
3. An allocation row is identified by **(line uid, batch uid)**. Changed quantity → update in place,
   keeping `unique_id` and `created_at`. New batch → new row. Removed batch or removed line → row
   deleted. Nothing changed → **no write at all**.
4. Line rows keep their `unique_id` across the delete-and-reinsert rewrite, which is why keying on
   the line uid is safe — and that rewrite is out of scope.
5. You will **not** change any schema, write any business row, deploy, push, touch `src_html/`, or
   touch the stock-authority model.
6. Other efforts' uncommitted work is in the tree. You stage only your own five paths.
