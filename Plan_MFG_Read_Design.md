# Plan — MFG Read Design (`Plan_MFG_Read_Design.md`)

Sub-plan required by `Plan_Read_View_Modularization.md` §7 step 7 (DEC-4): the MFG list and view
are **not** a plain step. This document is written and committed **before** any MFG read code,
and it is the review artifact for that code.

Revision 1 — 2026-09-21. Author: the assistant. Evidence for the numbers below:
`READ_VIEW_MODULARIZATION_RESULTS.md` RV-2.1/TR-16, RV-4.1/TR-20, RV-5.1/TR-22.

---

## 1. Scope

**In scope**: the two MFG read endpoints behind `MFG_FAST_READ_` (default `false`):

| Endpoint | Handler | Page |
|---|---|---|
| `get_valley_mfg_orders` | `getValleyMfgOrders_` (`Company_ValleyFoods_Actions.js:7391`) | `vf_mfg_orders` |
| `get_valley_mfg_order_detail` | `getValleyMfgOrderDetail_` (`:7083`) composing `getValleyMfgOrderFull_` (`:9312`), `getValleyMfgWorkOps_`, `getValleyMfgByproducts_` | `vf_mfg_order_view` |

**Out of scope and untouched**: the save path (`save_valley_mfg_order`), the edit-token
*comparison* on save, `Core_FastSave`, `MFG_BATCH_WRITES_`, every other MFG action, and the
schema. No sheet, header or column is added, renamed or reordered.

## 2. Read inventory (from source, not from a pattern)

### 2.1 `get_valley_mfg_orders` (list)

| Read | Table | Columns used | Called |
|---|---|---|---|
| `getAllRecords_` | `valley_manufacture_header` | 13 projected + 1 filter-only (`product_category`) | every request |
| `getAllRecords_` | `valley_categories` | `id`, `name`, `name_ar` | every request |
| `getAllRecords_` | `valley_product_recipe` | `unique_id`, `recipe_code`, `id`, `recipe_name`, `is_active` | every request |
| `getAllRecords_` | `valley_products` | `id`, `name_ar` | twice: `filter_product_options` and `product_options` (the latter behind `finRefsCached_`) |
| `mfgWorkCenterOptions_` | work-centre table | option labels | every request |
| `mfgAssertMfgSchema_` | header sheet metadata | schema check | every request |

Whole-set knowledge is **required by the endpoint's own contract**, not by convenience:
`filter_options.categories`, `filter_options.batches` and `filter_product_options` are computed
from the **unfiltered** row set (so narrowing one filter must not shrink the others), the
response's `total` counts the filtered set **before** offset/limit, and paging is by offset. A
narrowed read cannot produce any of the three (plan §4.4).

### 2.2 `get_valley_mfg_order_detail` (view)

Composition (each part is a whole-table read in the legacy path):

| Section | Table | Strategy-relevant fact |
|---|---|---|
| header | `valley_manufacture_header` | located by `unique_id` via `vfFindRowByUid_` (cached index), then the **whole row** is read and returned losslessly as `order` |
| outputs | `valley_manufacture_header_products` | filtered by `valley_manufacture_header_id === mo_uid`; **every column is returned** in the response |
| consumption (footers) | `valley_manufacture_footer` | filtered by output uid (and one `refId === mo_uid` legacy branch); 6 columns are used to build `footers[]` |
| work ops | `valley_manufacture_work_center` | filtered by header id; returned as records |
| by-products | `valley_manufacture_by_product` | filtered by header id; returned as records |
| options | recipes / products / work centres | `getValleyOptionSets_`, with `finRefsCached_` on the products bundle |
| edit token | header + outputs + consumption (+ work ops, by-products per scope) | `mfgEditToken_` → `mfgCurrentMfgState_` → `mfgHash_(mfgCanonical_(...))` |

## 3. Declared strategies (plan §5.2 / §5.3)

| Endpoint / section | Strategy | Honest cost |
|---|---|---|
| list: header rows | `NARROW_SCAN_PAGE`, `filterColumns` = the 13 projected + `product_category`, `columns` = the same | 1 metadata + 1 rectangle read; `rowsScanned` = table rows; `cellsRead` = rows × span(14) |
| list: filter/option bundles | **not migrated** — `FULL_SCAN` over narrow columns stays, and the products bundle keeps its existing stamp-versioned cache (`finRefsCached_`) | see §4 |
| view: header | `PARENT_FK_INDEX_THEN_FETCH`, all header columns | 2 header calls + index read + 1 batched fetch; `rowsScanned` = table rows |
| view: outputs | `PARENT_FK_INDEX_THEN_FETCH`, all output columns (the response is lossless over them) | index read + batched fetch; `rowsScanned` = table rows |
| view: consumption | `PARENT_FK_INDEX_THEN_FETCH` over the 6 used columns + FK | same shape |
| view: work ops / by-products | `PARENT_SCAN` over the used columns | 1 metadata + 1 read each; `rowsScanned` = table rows |
| view: edit token | **unchanged legacy computation in this revision** | see §5/§6 |

Rules honoured: no strategy claims matched-row-only scanning; every section reports
`rowsScanned` = its table rows; a query the declared strategy cannot satisfy is refused rather
than answered partially; the list declares its whole-set need instead of pretending otherwise.

## 4. Filter/option-bundle decision (priced from step 5's measurements)

Options considered:

1. **`FULL_SCAN` over narrow columns** (status quo, declared): read the filter/sort columns for
   every row and compute the distinct sets in memory.
2. **Narrowed read** (read only the pages the user has selected): **impossible** for the three
   unfiltered dropdowns and for `total` before paging — it would change what the page shows.
3. **Cache the bundles** in the `fr1_` namespace with identity + stamp: measured in step 5 as
   `0` sheet value reads on a hit versus 17 service calls / 101 cells on a cold build (TR-22).

**Decision**: (1) + (3) for the *header-derived* bundles, and keep the existing
`finRefsCached_` for the products bundle (it is already stamp-versioned and chunked; a second
cache over it would add an entry without removing a read). The list therefore declares:
- `filter_options.categories` / `.batches` → computed from the header scan the page already pays
  for (no additional read);
- `filter_product_options` / `recipe_options` → one narrow read each per request, unchanged;
- `product_options` → the existing cached bundle, unchanged.

Measured back-of-envelope for the steady state: a list request pays 1 rectangle read of the
header (the migration's win) plus the unchanged bundle reads, against the legacy path's
whole-row header read **plus** the same bundle reads. No new cache entry is introduced for the
list — its key would be the paging payload, whose cardinality is unbounded (the same reason the
Sales list was refused a cache in RV-5.1).

## 5. Frozen input list for `mfgCurrentMfgState_` (write-path contract)

`mfgCurrentMfgState_` (`Company_ValleyFoods_Actions.js:7817-7887`) produces the state that
`mfgEditToken_` hashes. The token is compared by the **save** path, so this list is frozen and
**any change to it is a write-path risk that requires the owner**.

Enumerated from source, verbatim, in hash order:

1. `header` — present only if a row with `unique_id === moUid` exists (scanned whole-table,
   last match wins); if absent the function returns `null` and the token is `''`. Fields:
   - `manufacture_date` → `mfgNormDateKey_(…)` (`YYYY-MM-DD` or `''`)
   - `operation_type` → trimmed string
   - `shift` → trimmed string
   - `produced_product` → `mfgNormPid_(…)` (numeric when numeric, else trimmed string)
   - `manufactured_qty` → `mfgNormQty_(…)` (`''` when blank/unparseable, else rounded to 3 dp)
   - `actual_qty` → `0` when `''`/`null`, else `mfgNormQty_(…)`
   - `recipe_id` → trimmed string
   - `manufacture_batch` → `String(… ?? '')`, trimmed
   - `mo_status` → trimmed string, default `'Draft'`
2. `outputs` — **only when the scope contains `outputs` or `consumption`**. One entry per row of
   `valley_manufacture_header_products` whose `valley_manufacture_header_id === moUid`, each:
   `{ uid: trimmed unique_id, product_id: String(product_id ?? '').trim(), qty: mfgNormQty_(product_qty), footers: [...] }`
   where `footers` are the `valley_manufacture_footer` rows whose
   `valley_manufacture_header_product_id === uid`, mapped to `{ uid, item, qty: mfgNormQty_(qty) }`
   and **sorted by `uid`**; the `outputs` array is then sorted by `uid`.
3. `work_ops` — **only when the scope contains `work_ops`**: `{ uid, wc: recipe_id, st: operation_status (default 'Pending'), notes, hrs: '' when blank else mfgNormQty_(actual_hours) }` for rows whose `valley_manufacture_header_id === moUid`, **sorted by `uid`**.
4. `byproducts` — **only when the scope contains `byproducts`**: `{ uid, item, qty: mfgNormQty_(qty) }`, **sorted by `uid`**.

Hash: `mfgHash_(mfgCanonical_({ scope: scope.slice().sort(), state: st }))` — the **sorted scope
list is part of the hashed input**.

Scopes in use: `MFG_LIST_SCOPE_ = ['header','outputs','consumption']`,
`MFG_DETAIL_SCOPE_ = ['header','outputs','consumption','work_ops','byproducts']`, and
`mfgScopeFor_(payload)` on the save path (payload-derived, bounded by
`MFG_SAVE_SCOPE_ALLOW_`).

**Consequences recorded for the implementation**:
- the fast detail reader may serve the document from fast reads, but the **edit token keeps the
  legacy computation in this revision** (rev 1). Reason: the token is compared by the save path;
  a token produced from a different read path is a write-path change until byte-equality is
  proven on representative data. That proof is the follow-up named in §6.
- If a later revision moves the token onto fast reads, it must (a) reproduce the list above
  exactly, including the sorted scope, the blank/id rules and the one-place rounding, and
  (b) ship a record with a byte-equality assertion over representative documents and scopes.

## 6. Equivalence plan (what makes the flag "ready to flip")

1. **Shadow compare** (`fr_shadow_compare`, admin-only) for `vf_mfg_orders` and
   `vf_mfg_order_detail`, canonical DTO basis, zero diffs on representative orders: a Draft with
   no children, a Locked order with outputs+footers+work ops+by-products, an order whose ids are
   not in sheet order, and an unknown uid (the error path). VM evidence ships with the code;
   staging evidence is the owner's.
2. **Edit-token byte-equality**: with the token still legacy-computed, the VM test asserts the
   fast reader's response carries the *same* token as the legacy reader for every fixture and
   for both scopes. This is the assertion that protects the save path.
3. **Metrics**: no DoD row may be claimed that the metrics do not show. The list's expected
   shape is `serviceCalls ≤ 3`, `rowsScanned` = table rows, `cellsRead` = rows × 14; the view's
   is per §3. Measured values are recorded in the Change Record, including any that fall short.
4. **Fail-open**: any engine error falls back to the legacy body for that request, logged with a
   code and no values (the Sales pattern, already proven by TR-19/TR-20).

## 7. Risks and rollback

| Risk | Mitigation |
|---|---|
| The response shape drifts (the detail's `order`/`outputs` are lossless) | sections fetch ALL that sheet's columns; the shadow compare diffs the whole canonical response |
| The edit token changes and saves begin to refuse | the token stays legacy-computed in rev 1; byte-equality is asserted for the served response |
| The client sees fewer dropdown values | the option bundles are **not** migrated; the distinct-value computation is the legacy code, applied to the migrated rows |
| A filter/date edge case | the filter/paging code path is the legacy one, fed by the new read |

Rollback: `MFG_FAST_READ_ = false` (one line + deploy) restores the legacy reads; `git revert`
removes the code. No data, no schema, no cache namespace of its own (the detail may use the
`fr1_` cache under the same identity+stamp rules; dropping one key is `frCacheDrop_`).
