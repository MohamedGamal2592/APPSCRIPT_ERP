# حركة المخزن — `valley_warehouse_movement` (Valley Foods)

Plan for one new page: manual warehouse stock movement (issue / internal receipt-return),
written against the existing table. **No schema change, no data writes outside the save handler.**

---

## 1. What the table actually is

The sheet already exists (legacy AppSheet app). Its **physical** columns, in order — verified
against `appsheet_old_project.html` § `table_valley_warehouse_movement_Schema`:

| # | Col | Column | Source of the value |
|---|-----|--------|---------------------|
| 1 | A | `unique_id` | server: 16-hex, `uid16Hex_()` pattern |
| 2 | B | `id` | server: next int, lock-protected |
| 3 | C | `warehouse` | constant `مخزن مصنع فالي فودز` |
| 4 | D | `vendor` | ref → `valley_legal_customer_vendor.id` (legacy default = `18`) |
| 5 | E | `item` | ref → `valley_current_products.unique_id` (a **batch**, not a product) |
| 6 | F | `item_code` | sheet formula (below) |
| 7 | G | `unit` | from the chosen batch |
| 8 | H | `qty` | user, decimal, mandatory |
| 9 | I | `amount` | server-computed snapshot = batch unit cost × qty |
| 10 | J | `movement_type` | enum, mandatory |
| 11 | K | `movmenent_sign` | sheet formula (below) |
| 12 | L | `movement_date` | user, date, default today |
| 13 | M | `asset_target` | always blank, hidden |
| 14 | N | `responsible_person` | ref → `valley_employee_info.emp_id` |
| 15 | O | `notes` | free text, optional |
| 16 | P | `user` | server: `user.email` |
| 17 | Q | `created_at` | server: `new Date()` |

`user_name` and `product_current` exist in the legacy app as **virtual** columns only —
they are not in the sheet and must not be created. We compute both for display.

**Enum (exact strings, do not paraphrase):**
`منصرف` · `وارد داخلي / مرتجع للمخزن`

**Sign formula — the legacy one compares the FULL enum string, not `"وارد"`:**

```
K{r} = IF(J{r}="وارد داخلي / مرتجع للمخزن", H{r}, H{r}*-1)
```

So `منصرف` → −qty, `وارد داخلي / مرتجع للمخزن` → +qty.

**item_code formula (A1 form of the legacy R1C1):**

```
F{r} = IFERROR(VLOOKUP(E{r},valley_product_purchasing!A:C,3,0),
        IFERROR(VLOOKUP(E{r},valley_manufacture_header!A:C,3,0),
         IFERROR(VLOOKUP(E{r},valley_manufacture_by_product!A:F,6,0),"")))
```

Identical in shape to `mfgConsumptionFormulaMap_()` — reuse that style.

---

## 2. Server — `Company_ValleyFoods_Actions.js`

One constant block + three handlers, placed next to the finance block (near `FIN_CASH_SHEET`, ~L5676).

```js
const WH_MOVE_SHEET   = 'valley_warehouse_movement';
const WH_MOVE_HEADERS = ['unique_id','id','warehouse','vendor','item','item_code','unit','qty',
                         'amount','movement_type','movmenent_sign','movement_date','asset_target',
                         'responsible_person','notes','user','created_at'];
const WH_WAREHOUSE    = 'مخزن مصنع فالي فودز';
const WH_MOVE_TYPES   = ['منصرف', 'وارد داخلي / مرتجع للمخزن'];
const WH_IN_TYPE      = 'وارد داخلي / مرتجع للمخزن';
```

**Do NOT call `settingsEnsureSheet_` on this sheet.** It appends any header it thinks is missing
(L2432–2447) — one typo in the canonical list is a schema change on a production table.
Instead: `getSheet_` + `getHeaders_`, assert the 17 names sit at their expected indexes, and
throw a clear Arabic error if not. The F/K formulas are positional, so this check is load-bearing.

### 2.1 `get_valley_warehouse_movements` — read

- `vfPage_(rows, data, 'movement_date')` for the list (same paging contract as cash/sales).
- Join labels: vendor → `valley_legal_customer_vendor.name`, batch → `transaction_code` +
  product name, responsible → `valley_employee_info.name`.
- Strip costs when the user lacks `valley_cost_view`: add
  `warehouse_move: ['amount','unit_cost']` to `VF_COST_KEYS` and run `vfStripCostAll_`
  behind `vfCanSeeCost_(user)` — the same gate every other Valley page uses.

### 2.2 `get_valley_warehouse_move_options` — read (form bootstrap)

Returns, in one round trip: vendors, employees, and the batch list.
Batches reuse the availability shape of `getValleyProductBatches_` (L6155) but **unfiltered by
product** — this page picks a batch directly:

```
available = current_qty − Σ sales allocations + Σ sales-return restores
                        − Σ manufacturing consumption + Σ movmenent_sign (this table)
```

Only batches with `available > 0` are offered. Label: `transaction_code — product — available unit`.

### 2.3 `save_valley_warehouse_movement` — write

Validation, in order, all messages Arabic:

1. `movement_date` present and parseable (date-only).
2. `movement_type` ∈ `WH_MOVE_TYPES`.
3. `item` (batch uid) exists in `valley_current_products`.
4. `qty` numeric > 0.
5. `responsible_person` exists in `valley_employee_info`.
6. For `منصرف` only: `qty ≤ available`, recomputed server-side and never trusted from the client.

Then build the row map: `warehouse` = constant, `asset_target` = `''`,
`unit` = the batch's unit (fallback `valley_products.unit` by `product_id`),
`amount` = `unit_cost × qty` rounded to 2, plus `user` and `created_at`.
Write via `saveRecordWithAudit_(dbId, WH_MOVE_SHEET, null, map, 'create', email, null, null, null, 'id')`,
then one `writeRowFormulas_` call for `{item_code, movmenent_sign}` — they are not adjacent
(F and K), so that costs two `setValues`, still cheaper than separate `writeFormula_` round trips.

Registration — three small edits, same as every other action:

- `ACTION_PAGES`: `{ page: 'vf_warehouse_movement', access: 'read' | 'write' }`
- `ACTION_TABLES`: → `'valley_warehouse_movement'`
- `ValleyFoods.register(...)` in the tail block (~L7283).

Edit / delete are **out of scope for v1** — this matches the cash page, where editing an existing
movement is super-admin-only and deletion is `full`. Add later if the owner asks.

---

## 3. Registry and nav

`Company_ValleyFoods_Registry.js` → `pages[]`:

```js
{ action: 'vf_warehouse_movement', template: 'Company_ValleyFoods_WarehouseMovement',
  title: 'حركة المخزن', label: 'حركة المخزن', nav: false }
```

`Company_ValleyFoods_Nav.html` → add to `الادارة المالية` after `المشتريات`.

Registering makes the page appear in «صفحات النظام». **Granting it to a role is the owner's step
in the admin UI** — we add no `ERP_Pages_Matrix` rows. Super-admin can test immediately.

---

## 4. Page — `Company_ValleyFoods_WarehouseMovement.html`

Model it on `Company_ValleyFoods_Cash.html` (same shape: list + add modal, no header/lines).

- Head: the five standard includes + `getCompanyThemeCSS_('9940659bd83035d7')`.
- `UIC.appShell` → breadcrumb `Valley Foods / الادارة المالية / حركة المخزن`.
- List: `UIC.PagedTable`, columns — رقم، التاريخ، الدفعة/الصنف، الكود، المورد، الوحدة، الكمية،
  القيمة (hidden without `valley_cost_view`)، نوع الحركة، المسؤول، ملاحظات.
  Show the sign by colouring qty: `منصرف` red, `وارد` green.
- Add modal (`UIC.openModal` + `UIC.validateForm`):
  `UIC.combo` for vendor, batch, movement type and responsible person; `UIC.field` for qty, date, notes.
  - Picking a batch fills **الوحدة** (read-only) and shows **المتاح** beside it.
  - qty + batch drive a live **القيمة** preview (hidden without cost permission).
  - `منصرف` blocks qty > available client-side; the server re-checks anyway.
  - `warehouse` and `asset_target` are never rendered.

---

## 5. Verify

- `node tools/verify/parse_pages.js` and `node tools/verify/ui_smoke_pages.js` — the new template
  must boot; the smoke test walks every page.
- New `tools/verify/s12_warehouse_movement.js`, added to `run_all.js`, asserting offline over the
  real source: the two formula strings byte-for-byte, the enum strings, the 17-header list and its
  order, cost stripping of `amount`, and that the over-issue guard exists in the save path.
- `design_preview/_sources.js` needs no regeneration — it watches only the four shared files.

---

## 6. Two things to confirm before coding

1. **Does `current_qty` already net these movements?** In the sheet,
   `valley_current_products.current_qty` is `SUMIFS(valley_products_movement!…)`, and the legacy
   availability figure was the *virtual* `appsheet_current_qty`, which explicitly adds
   `Σ movmenent_sign` on top of it. If the `valley_products_movement` tab already includes
   warehouse-movement rows, doing it again in §2.2 double-counts. Check one batch that has a
   movement row against the sheet before shipping.
2. **`amount` basis.** You specified `unit_cost × qty`; the legacy app used
   `(total_cost_sign / current_qty) × qty`. They agree only when `unit_cost` is exactly that ratio.
   This plan follows your spec — `unit_cost`, the same column sales and manufacturing already read.
