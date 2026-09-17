# حركة المخزن — what was built, and what is still yours

One new Valley Foods page: manual warehouse stock movement (issue / internal receipt-return), on top
of `valley_warehouse_movement`, a table that already existed in production.

Branch `feat/vf-warehouse-movement`, four commits, **not pushed**. Spec:
[VALLEY_WAREHOUSE_MOVEMENT_PLAN.md](VALLEY_WAREHOUSE_MOVEMENT_PLAN.md).

**This run wrote no data.** It created no rows, edited no rows, deleted no rows, added no
`ERP_Pages_Matrix` grant, and never called a Google service. The only writes it can ever cause are
the ones the new save handler performs when a real user clicks حفظ, after you deploy.

---

## 1. The four commits

| Commit | Step | What |
|---|---|---|
| `120df44` | W1 | Server — constants, header assertion, three handlers, registration |
| `b611d50` | W2 | Registry entry + nav item |
| `4c41672` | W3/W4 | The page, and the cost gate proven against a stripped payload |
| `bec4b1a` | W5 | `tools/verify/s12_warehouse_movement.js`, wired into `run_all.js` |

Seven files, 1,311 insertions, 2 deletions:

```
Company_ValleyFoods_Actions.js               +389   additive only, 0 deletions
Company_ValleyFoods_WarehouseMovement.html   +302   new
Company_ValleyFoods_Registry.js                +1
Company_ValleyFoods_Nav.html                 +3 -1
tools/verify/s12_warehouse_movement.js       +612   new
tools/verify/run_all.js                        +1
tools/verify/s4_cost_page.js                 +5 -1   ← outside the planned file set, see §6
```

No existing handler changed behaviour. No public contract moved: `UIC.*`, `API.*`, `FMT.*`, `UI.*`,
`ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend signature and every existing response shape are
untouched.

---

## 2. The schema was not changed, and here is why it could not have been

`valley_warehouse_movement` has exactly 17 physical columns. The trap in this table is
`settingsEnsureSheet_()`: it **appends any header it believes is missing**. Called on this sheet with
one typo — `movement_sign` for the production misspelling `movmenent_sign` — it would have silently
added an 18th column to a live table, and the `item_code` / `movmenent_sign` formulas are
**positional**, so every subsequent row would have written a formula into the wrong column.

It is never called on this sheet. Instead `whAssertHeaders_(sheet)` reads the header row, compares it
name by name against `WH_MOVE_HEADERS`, and throws an Arabic error naming the offending column
number. It contains no `appendRow`, no `setValues`, no `insertSheet` — s12 asserts that too, over its
function body.

The 17 columns, confirmed against `appsheet_old_project.html`
§ `table_valley_warehouse_movement_Schema`:

| # | Col | Column | Written by |
|---|-----|--------|------------|
| 1 | A | `unique_id` | server, `uid16Hex_()` |
| 2 | B | `id` | `addRecord_`, under the script lock |
| 3 | C | `warehouse` | constant `مخزن مصنع فالي فودز` — never rendered, never editable |
| 4 | D | `vendor` | user, optional, ref → `valley_legal_customer_vendor.id` |
| 5 | E | `item` | user, ref → `valley_current_products.unique_id` (a **batch**) |
| 6 | F | `item_code` | **sheet formula** |
| 7 | G | `unit` | from the batch, falling back to `valley_products.unit` |
| 8 | H | `qty` | user |
| 9 | I | `amount` | server, `unit_cost × qty` rounded to 2 |
| 10 | J | `movement_type` | user, enum |
| 11 | K | `movmenent_sign` | **sheet formula** |
| 12 | L | `movement_date` | user |
| 13 | M | `asset_target` | always `''` — never rendered |
| 14 | N | `responsible_person` | user, ref → `valley_employee_info.emp_id` |
| 15 | O | `notes` | user, optional |
| 16 | P | `user` | server, session email |
| 17 | Q | `created_at` | server |

`user_name` and `product_current` are **virtual** columns in the legacy app. They are not on the
sheet, and nothing here creates them.

The two formulas, exactly as written:

```
F{r} = IFERROR(VLOOKUP(E{r},valley_product_purchasing!A:C,3,0),IFERROR(VLOOKUP(E{r},valley_manufacture_header!A:C,3,0),IFERROR(VLOOKUP(E{r},valley_manufacture_by_product!A:F,6,0),"")))
K{r} = IF(J{r}="وارد داخلي / مرتجع للمخزن",H{r},H{r}*-1)
```

The sign formula compares the **full** enum string. The legacy R1C1 was `RC[-1]="وارد داخلي / مرتجع
للمخزن"` with `RC[-1]` = J and `RC[-3]` = H; a version comparing just `"وارد"` makes every row
negative and looks correct in review. s12 asserts both strings byte for byte, and asserts the
truncated form is **absent**.

---

## 3. What it does

**List** — `get_valley_warehouse_movements`. `vfPage_` on `movement_date`, newest first with `id` as
the tie-break, resolved labels for vendor / batch / responsible person. The sign is carried by colour
and a ± on the quantity — `منصرف` red, `وارد داخلي / مرتجع للمخزن` green — rather than by a column of
its own.

**Form bootstrap** — `get_valley_warehouse_move_options`. Vendors, employees and available batches in
one round trip. Only batches with `available > 0` are offered.

**Save** — `save_valley_warehouse_movement`. Six validations in order, Arabic messages: date parses,
type is one of the two enum values, the batch exists, qty > 0, the responsible person exists, and —
for `منصرف` only — qty ≤ available. Then `saveRecordWithAudit_(…, 'create', …, 'id')` and one
`writeRowFormulas_` for the two formula columns.

**Add + list only.** No edit path, no delete path, no approve toggle, no row kebab offering either.
A stock ledger stays append-only; a `منصرف` is cancelled by a matching
`وارد داخلي / مرتجع للمخزن`, not by an edit. If you want a correction path later it gets designed
then.

Availability, recomputed server-side on every save:

```
available = current_qty − Σ sales allocations + Σ sales-return restores
                        − Σ manufacturing consumption + Σ movmenent_sign
```

`movmenent_sign` is already signed, so it is added — exactly as the legacy virtual
`appsheet_current_qty` did it.

---

## 4. Verification — what was actually run

Nothing here touched a spreadsheet or the network.

| Check | Result |
|---|---|
| `node --check` on all three `.js` files | pass |
| `node tools/verify/parse_pages.js Company_ValleyFoods_WarehouseMovement.html` | 2 script blocks parse |
| `node tools/verify/ui_smoke_pages.js` | 85 templates, 82 boot clean; the 3 that throw are the same 3 that threw at Phase 0. The new page boots. |
| `node tools/verify/run_all.js` | **all 29 checks pass** |

### The dry run — the part that matters

s12 section 8 does not read the source and hope. It **lifts the real handler block out of
`Company_ValleyFoods_Actions.js` and runs it**, against stubs whose write paths (`appendRow`,
`getRange`, `insertSheet`) throw if reached. The row it would have written, in header order:

```
 1 unique_id          "ffffffff00000001"     10 movement_type      "منصرف"
 2 id                 99  (addRecord_)       11 movmenent_sign     ""   (formula)
 3 warehouse          "مخزن مصنع فالي فودز"   12 movement_date      2026-09-06 (Date)
 4 vendor             "18"                   13 asset_target       ""
 5 item               "BATCH-A"              14 responsible_person "E-1"
 6 item_code          ""  (formula)          15 notes              "صرف للإنتاج"
 7 unit               "كجم"                  16 user               session email
 8 qty                4                      17 created_at         (Date)
 9 amount             50   ← unit_cost 12.5 × qty 4
```

The payload deliberately claimed `available: 999999`, `amount: 1`, `unit_cost: 1`. All three were
ignored: `amount` came out 50, and the guard used its own recomputed figure.

The two formulas it would have written to row 42:

```
item_code      = =IFERROR(VLOOKUP(E42,valley_product_purchasing!A:C,3,0),IFERROR(VLOOKUP(E42,valley_manufacture_header!A:C,3,0),IFERROR(VLOOKUP(E42,valley_manufacture_by_product!A:F,6,0),"")))
movmenent_sign = =IF(J42="وارد داخلي / مرتجع للمخزن",H42,H42*-1)
```

Also proven by running it:

- Availability over the fixture: `100 − 10 sold + 2 returned − 5 consumed − 7 issued = 80`.
- `qty = 80.001` **throws**, the message names 80, and nothing was written.
- `qty = 80` exactly is allowed. `وارد داخلي / مرتجع للمخزن` at qty 5000 is **not** capped.
- Each of the other five validations rejects its own bad input.
- A batch with no unit falls back to `valley_products.unit` via `product_id`.
- A sheet whose column K reads `movement_sign`, one with `qty`/`amount` transposed, and a truncated
  16-column header row are each **refused, not repaired** — and the save refuses to run at all.

### Cost gating, proven both ends

Server (s12 §5, §8f): with the grant `amount` is present; without it the key is **deleted**, and
`JSON.stringify` of the whole ungranted response contains no cost value at any depth.

Page (s12 §10): the real page booted twice on the DOM stub over the same rows, once with `amount`
present and once with it deleted, asserting on the headers and cells its own `mapRow` produced:

```
ungranted: 2 | 2026-09-05 | PO-1001 — زيت نخيل | IT-77 | مورد افتراضي | كجم | − 4 |         | منصرف | أحمد | صرف للإنتاج
granted  : 2 | 2026-09-05 | PO-1001 — زيت نخيل | IT-77 | مورد افتراضي | كجم | − 4 | 50.00   | منصرف | أحمد | صرف للإنتاج
```

Exactly one column differs, every row emits as many cells as there are headers in both shapes, and
the ungranted markup contains no `NaN`, no `undefined`, and no cost figure.

---

## 5. What I could not do, and it is yours

### 5a. The `ERP_Pages_Matrix` grant — **blocked on you** 🟡

Granting `vf_warehouse_movement` to a role means **adding rows to a live business table**, so this
run did not do it. Registering the page is enough for it to appear in «صفحات النظام»; a super-admin
can open it the moment you deploy, and everyone else waits for the grant. Two steps, same shape as
`valley_cost_view` (NEXT_STEPS_OWNER.md §6):

| Step | Where | What |
|---|---|---|
| a | `ERP_Management` → صفحات النظام | `vf_warehouse_movement` now appears. Save it, so the `ERP_System_Pages` row exists. |
| b | `ERP_Management` → صلاحيات الأدوار | Grant `read` to roles that should see the ledger, `write` to roles that should add to it. |

Added as item 8 in [NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md) — the only edit made to that file.

### 5b. Deploy — not done, by instruction

No `clasp push`, no deployment created or promoted, no `clasp login` / `run` / `open`, no push to
`origin`, no trigger, no Script Property, no server function executed. You edit locally and push.

---

## 6. Two things to know before you merge

### 6a. One file outside the planned set — `tools/verify/s4_cost_page.js`

S4 asserts a **hard-coded total page count**. Registering `vf_warehouse_movement` made it 30 → 31, so
S4 went red for a counter that has nothing to do with what it guards. One literal changed, with a
comment saying why. The assertion that actually matters — that `valley_cost_view` is the only
template-less entry — is the line above it and still passes untouched. Flagged here rather than
slipped in.

### 6b. Another effort's commit is sitting on this branch ⚠️

`e478db2 feat(tc-box-B0): recon + the parser fixture corpus` (one file,
`tools/verify/fixtures/box_details.json`, +390) was committed by the concurrent **box-analysis**
effort while this branch was the checked-out one, so it landed here instead of on
`feat/tc-box-analysis` — which is still at `43ec072`.

**It exists only on this branch.** I did not rebase it away: dropping it would destroy that effort's
work, and this run was told not to rebase. Two consequences for you:

- Merging `feat/vf-warehouse-movement` also brings in that fixture file. It is additive and inert —
  nothing in this run reads it.
- If the box-analysis effort expects its commit on its own branch, it needs recovering:
  `git checkout feat/tc-box-analysis && git cherry-pick e478db2`.

The uncommitted work of the other efforts (`Company_TopLight_Sales.html`,
`Company_TopLight_Sales_Returns.html`, `design_preview/_sources.js`, the `BOX_ANALYSIS_*` files,
`tools/verify/s11_sales_returns.js`, `tools/verify/box_parser.js`) was **not staged, not reverted and
not cleaned up**.

---

## 7. The two open questions from plan §6

### Q1 — Does `current_qty` already net these movements? **Partly answered; one check is yours** 🔴

What I established offline:

- `valley_current_products.current_qty` is column H, and its sheet formula is
  `SUMIFS(valley_products_movement!W:W, valley_products_movement!I:I, A{r})`.
- **`valley_products_movement` is a spreadsheet-only tab.** It has no AppSheet schema section in
  `appsheet_old_project.html`, and it is referenced nowhere in this repo — only twice in the legacy
  dump, both times as a formula range. So I cannot tell offline whether warehouse-movement rows feed
  it, and I cannot read the sheet.
- The legacy virtual `appsheet_current_qty` gives **no evidence either way**: it recomputes from the
  source tables directly and never references `current_qty` at all.

This run follows the plan and adds `Σ movmenent_sign`. **The direction of the risk is the safe one:**
if the tab already includes these rows, availability is *understated*, which refuses a legitimate
issue. It can never *permit* an over-issue. An understated figure is a complaint; an overstated one
is a negative stock balance.

**Your check, once deployed:** find a batch that already has a `valley_warehouse_movement` row, open
حركة المخزن, start an add, pick that batch, and compare **المتاح** against what the sheet says the
batch really has. If المتاح is low by exactly that row's `movmenent_sign`, the term is
double-counting and should come out of `whBatchAvailability_`.

### Q2 — The `amount` basis. **Follows your spec; the divergence is recorded**

You specified `unit_cost × qty`; the legacy app used `(total_cost_sign / current_qty) × qty`. They
agree only when `unit_cost` is exactly that ratio. This follows your spec, and there is a consistency
argument for it: `unit_cost` is the same column the sales FIFO picker and the manufacturing
consumption footer already read (`batchCost` / `footerBatchCost` in
`Company_ValleyFoods_Actions.js`), so حركة المخزن now values stock the same way the rest of the app
does. If you would rather it matched the legacy ratio, it is one line.

### A third divergence I found, which the plan did not raise

**`responsible_person` refs a different table than it used to.** In the legacy app it was a ref to
`valley_dept_section_index.section` — a *department section*, not a person. Your decision table
specified `valley_employee_info.emp_id`, and that is what the page writes.

Existing rows therefore hold section names where new rows hold employee ids. The list handler
tolerates this: an unresolvable `responsible_person` falls back to displaying the **stored value**
rather than an empty cell, so old rows still read correctly. New rows are validated against
`valley_employee_info` and will not save with an unknown id. Nothing was migrated, and nothing needs
to be.

**One more, deliberate:** this page's availability subtracts manufacturing consumption, which the
sales batch picker (`getValleyProductBatches_`) does not. That follows the plan and matches the
legacy formula, but it means المتاح here can be **lower** than the figure the sales batch modal shows
for the same batch. If you want the two to agree, the fix belongs in the sales picker, not here —
that one is arguably under-counting.

---

## 8. Your checklist — open the app and confirm each of these

Specific statements, each either true or false. Not "check it looks right".

1. The page opens from **الادارة المالية ← حركة المخزن**, and lists existing movements **newest
   first**.
2. After choosing a batch in the add form, **الوحدة fills itself** and **المتاح appears beside it**
   with a number.
3. Adding a `منصرف` for **more than** the batch's available quantity is **refused**, and the error
   message **contains the available number**.
4. A saved row shows **`item_code` filled in by the sheet formula** — click the cell and confirm the
   formula bar shows `=IFERROR(VLOOKUP(E…`, not a pasted value.
5. `movmenent_sign` is **negative** for a `منصرف` row and **positive** for a
   `وارد داخلي / مرتجع للمخزن` row. Click the cell: the formula bar shows `=IF(J…`.
6. The saved **`amount` equals unit cost × quantity to two decimals**, and it is a **static number,
   not a formula**.
7. `warehouse` on every new row reads exactly **`مخزن مصنع فالي فودز`**, and `asset_target` is
   **blank**.
8. A user **without** `valley_cost_view` sees **no القيمة column**, and — devtools → Network → the
   `company_action` response — the JSON has **no `amount` and no `unit_cost` key at all**, not zeros.
   Checking the screen alone is not enough.
9. **The sheet still has exactly 17 columns after the first save.** Column R is empty and has no
   header.
10. There is **no edit button and no delete button** anywhere on the page or on any row.
