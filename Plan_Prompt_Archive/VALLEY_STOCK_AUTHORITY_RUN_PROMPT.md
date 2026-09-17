# رصيد الدفعات — one stock authority — agent prompt

Make `valley_current_products.current_qty` the **single** stock authority for Valley Foods, and
delete the four different second subtractions that are currently applied on top of it.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows, and changes no
spreadsheet formula.

**This is mostly a deletion.** If your diff is net-positive by more than ~120 lines, you have
misread the plan.

---

## Read these first, in full, before touching anything

1. **[VALLEY_STOCK_AUTHORITY_PLAN.md](VALLEY_STOCK_AUTHORITY_PLAN.md)** — your specification. It
   carries the one formula, the six call sites, the cache rules and the test changes.
   **This prompt orients you; the plan decides.**
2. **`Company_ValleyFoods_Actions.js`** — `getValleyProductBatches_` (~L8027), the
   `assertFooterBalances_` IIFE inside `saveValleyMfgOrder_` (~L5311), the batch baseline inside
   `saveValleyInvoice_` (~L8145), and `whBatchAvailability_` (~L7560). These four are the disease.
3. **`Company_ValleyFoods_MfgOrderView.html`** — the page the bug was reported on
   (`action=vf_mfg_order`). `outputRowInner_`, `populateFooterItem`, `openBatchModal`, `fifoFill_`.
4. **`tools/verify/s12_warehouse_movement.js`** § 8 — the dry run whose expected value you are
   changing, and **`tools/verify/run_all.js`**.

Verify a `file:line` reference before you edit it. Line numbers here were taken from a **dirty
working tree** and drift constantly — confirm each one yourself with `grep -n`.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. `current_qty` is the authority. Trust it.

`valley_current_products.current_qty` is produced by a complex sheet formula. **That formula is
correct.** The owner has said so directly, twice, and it is not open for re-litigation.

* You **never** subtract from it.
* You **never** recompute, reconcile, cross-check or audit it.
* You **never** add a "verification" report, a drift column, or a fallback that recomputes stock
  from source tables when the number looks surprising.
* You **never** edit, regenerate or extend any formula inside `valley_current_products`, and the
  table is never written by code.
* You **never** read, write or reference `valley_products_movement`.

If a number looks wrong to you, the answer is that your reading of it is wrong. Write it up in the
results doc; do not add code to compensate.

## 2. NEVER change any schema

No column added, renamed, removed, reordered or retyped, in any business table, in any of the three
company spreadsheets or the auth spreadsheet. No new sheet, no new tab. This run adds **no**
`settingsEnsureSheet_` call to any table it did not already have one for.

## 3. NEVER add, edit, or delete data in any business table

No rows written, updated or deleted. No backfills, no test records, no seed data, no cleanup passes.
Not by hand, not by script, not via `clasp run`, not via a one-off function you write and execute.

**Specifically: there is no orphan cleanup in this run.** The owner has stated there is no
deleted-invoice case. Do not write a purge, do not write an integrity report, do not "while I'm here"
delete a row you think is stale.

## 4. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never create or
promote a deployment. Never run `clasp login`, `clasp run`, or `clasp open`. Never push to `origin`.
**The owner pushes when everything is finished.**

## 5. NEVER touch the owner's Google account

No triggers, no Script Properties, no running any server function.

## 6. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend function
signature, every existing response shape, every HTML anchor id.

Two contracts need care because this run touches them:

* **`get_valley_product_batches` keeps returning `available` per batch.** Its *value* changes; its
  *shape* must not. Every consumer reads `b.available`, `b.batch_uid`, `b.lot`, `b.unit_cost`,
  `b.current_qty`, `b.transaction_date`, `b.unit`. Add `held`; remove nothing.
* **`exclude_invoice_unique_id` stays accepted** as an alias for the new `invoice_uid`, so a
  half-deployed client cannot break. Its meaning changes from *exclude* to *add back*.

## 7. Stay inside your file set

Files you may modify or create:

```
Company_ValleyFoods_Actions.js            (the six call sites, the new function, the deletions)
Company_ValleyFoods_MfgOrderView.html     (3 batch calls + the hard-coded متاح literal)
Company_ValleyFoods_MfgOrders.html        (1 batch call)
Company_ValleyFoods_Sales.html            (1 batch call, param rename)
tools/verify/s12_warehouse_movement.js    (fixture + expected value)
tools/verify/s25_stock_authority.js       (new)
tools/verify/run_all.js                   (one STEPS line)
VALLEY_STOCK_AUTHORITY_RESULTS.md         (new, at the end)
```

Nothing else.

---

## Starting state — the tree is dirty, and some of the dirt is yours to remove

```bash
cd d:/Work/Script
git log --oneline -1        # 1671087 feat(att-ui): month navigation shows the blocking loading overlay
git branch --show-current   # feat/realtime-feel
git status --porcelain
```

`git status` shows **~22 modified files and ~20 untracked files belonging to several other
efforts** — TopChemical, TopLight, attendance, box analysis, iPhone, stock scan. **Do not stage
them, do not revert them, do not clean the tree.**

⚠️ **Two files you must edit already carry other people's uncommitted work:**
`Company_ValleyFoods_Actions.js` and `tools/verify/s12_warehouse_movement.js`. **Never
`git checkout --` either file, and never revert them wholesale.** Remove only the named blocks in
S1 below.

**Create your branch from HEAD and stay on it:**

```bash
git checkout -b feat/vf-stock-authority
```

**Stage explicit paths only.** Never `git add -A`, never `git add .`, never `git commit -a`. Do not
push, rebase or merge.

---

## Decisions already made by the owner — do not re-ask

| Decision | Answer |
|---|---|
| What `current_qty` is | The **net** available quantity. Purchases, production, by-products, sales, returns, consumption and warehouse movement are already inside it. |
| How to use it | **Raw.** Never subtracted from, never reconciled, never recomputed. |
| The one formula | `available(batch, document) = current_qty(batch) + held(document, batch)` |
| `held` for a new document | `0`. The add-back applies only when editing an existing document. |
| Why the add-back exists | The document's own quantity is already subtracted inside `current_qty`, and the save **rewrites those very rows**. Without it, re-saving an unchanged order refuses its own stock. This is the reported bug. |
| Offer filter | `available > 0` — **not** `current_qty > 0`. A batch this document consumed entirely must stay on its own form or the document cannot be edited. |
| Sales returns | Already inside `current_qty`. The code stops adding restores. |
| `whBatchAvailability_` | `available = current_qty`. No add-back — حركة المخزن is add-only. |
| Deleted invoices | **No such case.** No cascade, no orphan handling, no integrity report, no purge. |
| Caches on `valley_current_products` | **None.** Live read on every call. |
| Sheet formulas | Not touched, at all. |
| `s12` expected value | **100**, not 80. That assertion pins the old, wrong semantics. |

---

## Your task

Eight steps, in order. Each is one commit. **S1 before S2** — the dead code goes before the new
readers are wired, so you never have two availability models live at once.

### S0 — Recon (no edits)

Confirm and write into your notes:

1. The four current availability computations, line by line, and exactly which terms each subtracts.
   You are deleting all of them.
2. The signatures of `getSheet_`, `getHeaders_`, `getAllRecords_`, `executeWithLock_`,
   `vfCanSeeCost_`, `vfStripCostAll_`, `deleteRowsWhereIn_`, `uid16Hex_`.
3. How `getAllRecords_` memoises in `_recordCache_` (`02_DataAccess.js` ~L587) — you are bypassing
   it for one table only.
4. Every reader of `valley_current_products` (`grep -n "valley_current_products"`). There are
   roughly nine. All of them route through the new live reader.
5. How the MO page's FIFO uses `b.available` (`fifoFill_`, `autoAllocFifo_`, `openBatchModal`) — the
   value changes under it and the allocation must still behave.

No commit.

### S1 — Delete the wrong model *(one commit)*

These were written against a **gross-receipts** model of `current_qty` that is wrong. Remove, by
name, from `Company_ValleyFoods_Actions.js`:

* the `/* ---------- ORPHAN GUARDS ... */` comment block and both helpers,
  `vfLiveSalesLines_` and `vfLiveMfgFooterOwners_` (~L7466–L7545)
* in `getValleyProductBatches_`: the `CacheService` read block at the head, the `liveSales` /
  `liveAlloc` logic, the sales-allocation loop and the returns-restore loop
* in `whBatchAvailability_`: the `liveSales` and `mfgOwners` guards, and the `used` / `restored` /
  `consumed` / `moved` terms
* in `assertFooterBalances_`: the `mfgOwners` lookup and the whole `usedByBatch` term
* in `saveValleyInvoice_`: the `liveSales` map, `existingAllocToBatch` / `existingAllocQty` /
  `existingAllocInv`, the `batchUsage` baseline loop and the returns-restore loop

**Keep** these two, which are not part of the wrong model:

* `deleteRowsByCriteria_(sheetCons, 'valley_manufacture_header_product_id', moUid)` in the MO save —
  it prevents duplicate footer rows, which the sheet formula would sum.
* `priorLineUids` in `saveValleyInvoice_` — allocations for a line **removed while editing** an
  invoice. Not the deleted-invoice case.

After this commit the four readers are temporarily `available = current_qty` with no add-back. That
is expected; S2 adds it. `node --check` must pass.

### S2 — `vfBatchBalance_` and the two held-by helpers *(one commit)*

Per plan §2. One function, one definition, used by all six call sites.

```js
vfBatchBalance_(dbId, opts)            // opts: { product_id?, mo_uid?, invoice_uid? }
vfMfgHeldByBatch_(dbId, moUid)         // batch uid -> qty this MO holds
vfSalesHeldByBatch_(dbId, invoiceUid)  // batch uid -> qty this invoice holds
```

`vfMfgHeldByBatch_` resolves a footer to its MO through the output row
(`valley_manufacture_header_products.valley_manufacture_header_id`) **and** accepts a footer
parented directly on the MO uid — the `outUid || moUid` fallback in the save writes those.
`vfSalesHeldByBatch_` resolves an allocation through its line's `valley_sales_header_id`.

Return shape and rules exactly as plan §2, including `available > 0` as the offer filter, oldest-first
ordering, and unchanged `VF_COST_KEYS.batch` stripping.

### S3 — Rewire the six server call sites *(one commit)*

Plan §3. `getValleyProductBatches_`, `getValleyProductBatchesMulti_`, `getValleyMfgOrderDetail_`,
`assertFooterBalances_`, `saveValleyInvoice_`, `whBatchAvailability_`.

Accept `invoice_uid` as canonical and `exclude_invoice_unique_id` as an alias. Add `mo_uid`.

The MO guard's Arabic message keeps its current shape — «الكمية المطلوبة من الدفعة (X) تتجاوز
المتاح. المطلوب: N، المتاح: M» — where **المتاح is now `current_qty + held`**, so the number the
user is told matches the number the form showed them.

### S4 — Client call sites *(one commit)*

Plan §3. Send `mo_uid: MO_UID` from `MfgOrderView.html` (three calls: ~L442, ~L937, ~L1118 — the
`_multi` one too), `mo_uid` from `MfgOrders.html` (~L407), and rename to `invoice_uid: EDIT_UID` in
`Sales.html` (~L592).

Also in `MfgOrderView.html`: `outputRowInner_` and `populateFooterItem` both emit a **hard-coded**
`(متاح: 0)` for a saved batch missing from the offered list. Print the real figure. A literal zero
that is indistinguishable from a real one is why this bug survived so long.

### S5 — Caches: `valley_current_products` is read live *(one commit)*

Plan §4. Add `vfCurrentProducts_(dbId)` that reads the range directly on every call and never
populates or consults `_recordCache_`. Route **every** reader of that table through it — the ~9 you
listed in S0. Confirm the `CacheService` block died in S1.

### S6 — Lock and flush ordering *(one commit)*

Plan §5.

1. `SpreadsheetApp.flush()` before returning from any save that writes `valley_manufacture_footer`,
   `valley_sales_product_stock`, `valley_warehouse_movement`, `valley_product_purchasing`,
   `valley_manufacture_header` or `valley_manufacture_header_products`.
2. Move the MO balance check **inside** `executeWithLock_`. It currently runs entirely before the
   lock, so two concurrent saves can both pass against the same balance — and `current_qty` is now
   the only guard.

Keep the abort-before-any-write property: the check must still run before the first row is written,
now just inside the lock rather than outside it.

### S7 — Tests *(one commit)*

**`tools/verify/s12_warehouse_movement.js`** — its § 8 dry run expects
`100 − 10 sold + 2 returned − 5 consumed − 7 issued = 80`. The correct answer is now **`100`**.
Update the fixture comment, the expectation, and the two dependent assertions (`qty = available +
0.001 is refused`, and the message naming the available quantity). **Edit only that section** — the
file carries another effort's uncommitted work.

**`tools/verify/s25_stock_authority.js`** (new), house static + dry-run style:

1. No reader subtracts sales, consumption, returns or movement from `current_qty`.
2. The only adjustment anywhere is the add-back.
3. `getValleyProductBatches_` contains no `CacheService` read.
4. `valley_current_products` is reached through `vfCurrentProducts_`, never `getAllRecords_`.
5. `vfLiveSalesLines_` and `vfLiveMfgFooterOwners_` no longer exist.
6. Dry run: `current_qty` 100, this MO already holds 30 → `available` **130**; re-saving 30 passes;
   131 throws the Arabic over-allocation message naming 130.
7. Dry run: the same batch seen from a **different** MO → `available` **100**.
8. Dry run: a batch with `current_qty` 0 that this MO holds 40 of is still **offered**, at 40.

One line in `STEPS` in `tools/verify/run_all.js`. Full suite green.

### S8 — `VALLEY_STOCK_AUTHORITY_RESULTS.md` and handover *(one commit)*

What changed, the line count deleted vs added, what was skipped and why, and the owner's checklist
below. Record the `s12` semantic change prominently — a reviewer seeing an expected value move from
80 to 100 must find the reason without asking.

---

## When you would normally stop

1. **The plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why, continue with the rest.
3. **Genuinely blocked** (needs the owner's account, needs a sheet read) → write it up, mark it
   blocked-on-owner, continue with everything else.
4. **A whole step is unworkable** → report it plainly, do not fake it, move on.

A reported skip is always better than a guess. **Adding code that compensates for a `current_qty`
you think looks wrong is the one outcome that is not acceptable.**

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

1. `node --check` every `.js` file you touch, after every step.
2. `node tools/verify/parse_pages.js` — every template you edited must parse.
3. `node tools/verify/ui_smoke_pages.js` — `Company_ValleyFoods_MfgOrderView` must still **boot**.
4. `node tools/verify/run_all.js` — the full suite, green, including your new `s25`. It was green
   at 69 checks before you started; it must be green after.
5. **Dry-run the MO save guard under `node`** against stubbed sheet access. The scenario that
   reproduces the reported bug, and the one you must prove fixed:

   > MO `4c2aa604a79df81f` already holds 500 of batch `B` on the sheet. `current_qty` for `B` is 0.
   > The user adds a work centre and saves, sending the same 500. **This must pass** — `available`
   > is `0 + 500 = 500`. Before this run it threw «تتجاوز المتاح».

   Assert the same payload at 501 throws, and that a *different* MO asking for 1 of `B` throws.
6. Prove no double subtraction: one batch, `current_qty` 100, with a sales allocation of 10, a
   consumption footer of 5 and a warehouse issue of 7 all present in the fixture. Every reader must
   answer **100** for a new document. Any reader answering 78, 80, 85, 90 or 93 is still subtracting.

**The owner's visual checklist** — specific statements, never "check it looks right":

- Open `action=vf_mfg_order&mo=4c2aa604a79df81f`, add a work centre, press حفظ. **It saves.** No
  «تتجاوز المتاح».
- On that same order, batch `766-2026072902-بطاطس خام عميل دايموند-29/07/2026` shows **23,430**,
  not 0 — matching `valley_current_products` exactly.
- Re-saving that order without changing anything succeeds, every time, repeatedly.
- Adding a **new** raw-material line offers batches whose المتاح equals the sheet's `current_qty`
  for that batch, to the digit.
- A batch fully consumed by this order still appears **on this order's form**, showing the quantity
  this order holds.
- The same batch opened from a **different** MO shows the sheet's `current_qty`, not the inflated
  figure.
- In حركة المخزن, المتاح for any batch equals `current_qty` in the sheet, to the digit.
- A sales invoice being edited still allows the quantity it already holds.
- A user without the cost grant sees no cost values **in the network response**, not merely hidden
  on screen.

---

## Two traps previous sessions hit

**The Bash heredoc mangles Arabic and backslashes.** `\\` collapses to `\`, and quoting breaks on
mixed RTL content — this repo's files are full of Arabic string literals, and writing this very
prompt's plan file with a heredoc failed. For any file content with Arabic text, regex escapes, CSS
selectors or nested quoting: use the `Write`/`Edit` tools, or write a Python transform with `Write`
and run it. Do not fight the heredoc.

**Do not "improve" the availability model while you are in there.** Every previous attempt at this
code added a term. This run removes terms. If you find yourself writing `-=` against a batch
quantity, stop and re-read constraint 1.

---

## Commit protocol

```
refactor(vf-S<n>): <short summary>

<what changed, file by file>
<what was verified, and how — include the dry-run numbers>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

---

## Before you write a single line of code, confirm you understand

1. `current_qty` is the **net** balance, it is **trusted**, and nothing you write subtracts from it,
   reconciles it, or recomputes it.
2. The formula is `available = current_qty + held(this document)`, and `held` is **0** for a new
   document.
3. The add-back is the fix. Without it, re-saving an unchanged order refuses its own stock.
4. You will **not** touch any formula inside `valley_current_products`, and never reference
   `valley_products_movement`.
5. There is **no deleted-invoice case** — no cascade, no orphan handling, no purge, no integrity
   report.
6. `s12`'s expected value moves from **80 to 100** because the old value pinned the bug.
7. You will **not** deploy, push, or touch the owner's Google account, and you will write no row to
   any business table.
8. Other efforts' uncommitted work is in the tree, **including in two files you must edit**. You
   never revert those files; you remove only the blocks named in S1, and you stage only your own
   eight paths.
