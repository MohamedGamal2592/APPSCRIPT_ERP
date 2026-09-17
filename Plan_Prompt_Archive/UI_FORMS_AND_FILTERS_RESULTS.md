# Forms Readability + Products/Parties Filters — Results

**Branch:** `ui/forms-readability`, created from `feat/tc-box-analysis` at `b02a69c`.
**Spec:** [UI_FORMS_AND_FILTERS_PLAN.md](UI_FORMS_AND_FILTERS_PLAN.md) · run prompt
[UI_FORMS_RUN_PROMPT.md](UI_FORMS_RUN_PROMPT.md).
**Date:** 2026-09-06.
**Nothing was pushed. Nothing was deployed. No spreadsheet was read or written.**

This run wrote **code only**. It created no rows, edited no rows and deleted no rows, in any business
table or in `ERP_Pages_Matrix`. It added **no column anywhere** — every value it displays already
existed in a response or in a sheet the statement handler already reads.

---

## 1. What shipped, phase by phase

| # | Phase | Commit | What landed |
|---|---|---|---|
| 0 | Recon + branch + spec | `a8dbe25` | Plan and run prompt committed. All of `R-1…R-14` re-verified on this branch — **every file:line still held**. Baseline suite green at 35. |
| 1 | **F1** — line-item width floor | `fbdd87a` | `min-width` on five ValleyFoods editor tables, plus the `overflow-x:auto` wrapper SalesReturns was missing entirely. |
| 2 | **A1.1 + A1.2** — admin forms | `834e50c` | `size:'xl'` on `pages-matrix-modal` + table floor 700→820px; `min-width:820px` on the صلاحيات الأدوار table. **The owner's headline complaint.** |
| 3 | **F2** — combo readability | `d4d4c4a` | `title` on the combo display input and every `.combo-option`, kept in sync in `comboPick` **and** `comboBlur`. |
| 4 | **F3** — modal sizing | `6b5a998` | `size:'lg'` on both cash modals and the products modal. |
| 5 | **F4a + A1.3** — `.form-grid` | `46ca61d` | `.form-grid` / `-wide` / `-narrow` defined; applied to the invoice modal's three grids and the products form. |
| 6 | **P1** — `vf_products` filters | `10c2087` | Category combo + qty min/max, client-side over `ROWS`. Zero server change. |
| 7 | **P2** — `vf_parties` balance | `e5d0058` | `getValleyPartyBalances_` + registration in all three places; lazy client call; numeric-sortable column. |
| 8 | **V** — verify + docs | *this commit* | `tools/verify/s13_forms_filters.js`, one `STEPS` line, this document, one `NEXT_STEPS_OWNER.md` item. |

**Final gate: `node tools/verify/run_all.js` → all 36 checks pass**, including the new `s13`.
`parse_pages.js`, `ui_smoke_pages.js` and `node --check` were run after every phase.

### F1 — the five tables

| File | Table | Cols | Wrapper | Floor |
|---|---|---|---|---|
| `Company_ValleyFoods_Sales.html:216` | `lines-table` | 7 | existed | `900px` |
| `Company_ValleyFoods_SalesReturns.html:182` | returns lines | 6 | **added** | `820px` |
| `Company_ValleyFoods_MfgOrders.html:639` | work ops | 8 | existed | `900px` |
| `Company_ValleyFoods_MfgOrders.html:546` | outputs | 3–4 | existed | `560px` |
| `Company_ValleyFoods_MfgRecipes.html:141` | recipe lines | var | existed | `760px` |

Below 600px the mobile card mode turns `.table` into stacked blocks, so a table `min-width` is inert
there. **F1 is a deliberate no-op on phones** and affects tablet-landscape and desktop only.

### A1 — why it was broken

`openPagesMatrix` declared `min-width:700px` on its table and then opened it in the **560px default
modal**, whose body is 512px. The content was **188px wider than its own container, permanently** —
so every row scrolled sideways and all three editable controls were squeezed. Both halves are fixed:
the modal is now `xl` (1100px → ~1052px of body) *and* the table floor is 820px so اسم الصفحة and
the two selects each get a usable share. **The table was not shrunk to fit.**

---

## 2. What was skipped, and why

| Item | Status | Why |
|---|---|---|
| **F4b — the remaining 81 inline grids** | **Not run** (D-C) | Touches 43 files and is severable. Recorded as the recommended follow-up in `NEXT_STEPS_OWNER.md`. F1–F3 + P1 + P2 stand alone and deliver both features. |
| **Design-preview rebuild** | **Not run deliberately** — but see §5.2 | Run-prompt constraint 8. `design_preview/_sources.js` was dirty from another effort. |
| `Company_TopLight_Sales.html`, `Company_TopLight_Sales_Returns.html`, `design_preview/_sources.js` | **Untouched by any commit** | Another effort's uncommitted work. Not staged, not reverted, not cleaned up. |
| **Replacing the two hand-patched modal widths** | **Skipped** (D-A) | Sales 1200px and Parties 1150px are both already *wider* than `xl`'s 1100px. Replacing them would be a regression for the sake of tidiness. |
| **A permission gate on الرصيد الحالي** | **Not implemented** (D-B) | The identical number is already one click away via كشف حساب at the same access level. No `VF_COST_KEYS` entry. Flagged, not implemented — see §6. |
| **Caching the balances map** | **Not implemented** (D-I) | Busting it would need edits to four existing save handlers, which the no-contract-breakage rule forbids. The uncached cost is stated in §6. |
| **Wrapping `.combo-option` to two lines** | **Skipped** (D-J) | `title` only. Wrapping makes list height unpredictable against `max-height:240px`. |
| `company-modal`, `user-modal`, `currency-modal` | **Left at 560px** | Single-column `UIC.field` stacks; full-width fields at 512px are fine. Per plan A1.3. |
| **`ERP_Pages_Matrix` rows** | **None created** | Not needed at all: `checkPageAccess_` authorizes on `pageId`, so P2's new action inherits the existing `vf_parties` grants. |

**Nothing was blocked on the owner.** No step required a Google account, a live sheet read or a
browser to *complete* — only the visual confirmations in §7, which are inherently the owner's.

---

## 3. The P2 dry-run — captured balances map

The real `getValleyPartyBalances_` was extracted from source and executed under `node` against a
stubbed `safeRows_`. **Nothing reached a spreadsheet.**

```
CAPTURED BALANCES MAP:  {"P1":-850,"P2":0,"P3":0}
```

Fixture and arithmetic:

| Party | Sales (−1) | Purchases (+1) | Collections (+1) | Payments (−1) | Returns (+1) | Total |
|---|---|---|---|---|---|---|
| **P1** | −1000, −500 | +300 (10 × 30) | +400 | −200 (`abs(−200)`) | +150 (`abs(−150)`) | **−850** |
| **P2** | −250 | — | +250 (`Debit`, mixed case) | — | — | **0** |
| **P3** | −100 (join key `"  P3  "`, trimmed) | +100 (2 × 50) | — | — | — | **0** |

A row with a blank join key (`''`) was included and correctly **not** accumulated as a party.

All 14 assertions passed, including the one that matters: **for all three parties the aggregate
equals what the statement's `running` computes over the same rows**, recomputed independently in the
test using the client's own sign map from `Company_ValleyFoods_Parties.html` `applyFilter()`.

The four joins are reproduced exactly, each on its own field:

| Sheet | Join field | Value | Sign |
|---|---|---|---|
| `valley_sales_invoices` | `اسم العميل` | `إجمالي` | **−1** |
| `valley_product_purchasing` | `vendor` | `qty × unit_price` | **+1** |
| `valley_cash_bank_movement` | `name` | `abs(total)` | **+1** if `transaction_type` is `debit`, else **−1** |
| `valley_sales_returns` | `valley_sales_invoices_client` | `abs(valley_return_value)` | **+1** |

> Despite its name, **`اسم العميل` holds the party *ID*, not the party name** — that is what
> `getValleyPartyStatement_` compares against, and so does the aggregate.

This is the **ledger** balance. The statement's adjusted figure subtracts a stock valuation computed
from user-editable price inputs on the client and has no stable server-side value, so it cannot back
a list column. `s13` asserts the aggregate never reads `valley_current_products`.

---

## 4. The new verify script

`tools/verify/s13_forms_filters.js`, offline, over the real source — added to `run_all.js` `STEPS`.
It does not merely pattern-match: it **executes** the real `passesFilters` predicate extracted from
the products page (which is why that function takes its filters as a parameter).

The generic invariant the plan asked for — **no modal may open content whose declared `min-width`
exceeds its modal size**, checked against `UIC.MODAL_SIZES` read from source — was verified to be
non-vacuous: temporarily removing `size:'xl'` makes it fail with

```
FAIL  pages-matrix-modal — content min-width 820px fits size:md (512px usable)
```

and restoring it makes it pass. **It would have caught R-12.**

P1 semantics are pinned by execution, all eight cases:

| Filter | Rows returned |
|---|---|
| none | `1,2,3,4,5,6` |
| `category = CAT_A` | `1,2,6` — exact match on the **raw id**, not the mapped label |
| `category = CAT_Z` | *(empty)* |
| `qty 5…10` | `2,3` — **inclusive at both ends** |
| `qty min 5`, blank max | `2,3` — a blank bound is unbounded |
| blank min, `qty max 5` | `1,2,4,5,6` |
| `qty 0…0` | `1,4,5,6` — null, blank **and absent** `current_stock_qty` all count as `0` |
| `CAT_A` + `qty 0…0` | `1,6` |

---

## 5. Things the plan got wrong, or did not anticipate

The plan is not sacred. Five findings, stated plainly.

### 5.1 `UI_Components.html` CSS lives inside a JS template literal — a backtick in a comment breaks every page

The file is **one `<script>` from line 1 to 4422**, and the stylesheet is a template literal inside
it. My first draft of the `.form-grid` comment contained `` `1fr 1fr` `` in prose, which **terminated
the literal and broke every inline script in the file.** `parse_pages.js` caught it immediately; the
existing `ui_check` C11 check exists for exactly this reason.

**The plan says "add to the Form Controls block" without mentioning this.** Anyone doing F4b needs
to know it before they write a comment.

### 5.2 `node tools/ui_check.js` rewrites `design_preview/_sources.js` as a side effect

The plan (§F4a) instructs *"run `tools/ui_check.js`, it asserts every class used is defined"*, and
separately (§0.2, and run-prompt constraint 8) forbids rebuilding the preview. **These two
instructions conflict**: `ui_check.js` `require`s `./build_preview` at
[tools/ui_check.js:430](tools/ui_check.js#L430) and regenerates the bundle when C9 finds it stale.
Running it as instructed rebuilt the file.

**No work was lost, and I checked before concluding that.** The bundle watches only
`CSS_Tokens.html`, `UI_Components.html`, `Client_Helpers.html` and `03_Security.js` — **none of which
the other effort modified** (theirs are `Company_TopLight_Sales*.html`). So the rebuild is a
regeneration from the same sources plus mine, not a clobbering of anyone's edits.

The file was **left dirty and unstaged, exactly as it was found**, and `ui_check.js` was not run
again. It is not part of `run_all.js`. **The constraint's premise — that a rebuild collides with the
other effort — turns out not to hold for these particular files.**

### 5.3 A second `@media (min-width: 600px)` block silently breaks two existing checks

The plan's F4a text implies defining the responsive rules next to `.input`. Doing that opens a
**second** `@media (min-width: 600px)` block, and both `ui2_breakpoints.js` and `ui4_listview.js`
locate the tablet-p tier and the mobile-first base by slicing the stylesheet on the **first**
occurrence of that string. A second block hijacks the slice and fails **7 assertions**.

**The assertions were right and the CSS was wrong.** The rules were moved into the single canonical
tier at `UI_Components.html:4251`. **Nothing in the suite was edited or weakened.** `s13` now asserts
`exactly one canonical @media (min-width: 600px) tier block` so the next person finds out here.

### 5.4 F3 on the products modal is inert — it was already hand-widened

Plan §F3 lists the products modal as a `size:'lg'` candidate. Confirming it page by page, as the plan
asks, shows [Company_ValleyFoods_Products.html:13](Company_ValleyFoods_Products.html#L13) already
declares `#product-modal .modal { width: min(94vw,920px); max-width:920px }`. That selector is
`(1,1,0)` against `modal-lg`'s `(0,2,0)`, so **the id rule wins and the effective width stays 920px —
wider than `lg`'s 880px.**

The declaration was added anyway as instructed: it is harmless, nothing narrows, and the modal now
degrades to 880px rather than 560px if that page CSS is ever removed. **The products form's real fix
was the `1fr 1fr` → `.form-grid` migration**, which required *deleting* the page's `#pf-form` id rule
— adding the class alone would have done nothing, for the same specificity reason.

### 5.5 D-K's predicted assertion failure did not happen

The run prompt expected F2's new `title` attribute to trip a byte-comparison assertion, and told me
to update it deliberately. **None did** — no existing check compares combo markup byte for byte.
Nothing was weakened to make the suite pass; `s13` adds the positive assertion instead.

### 5.6 Two small things the plan under-specified

- **`comboBlur` also needs the title sync.** The plan names only `comboPick`. But `comboBlur` clears
  or rewrites `disp.value` in three of its four branches, so syncing only `comboPick` would leave the
  previous selection's tooltip hovering over an emptied field — a new inconsistency created by the
  fix itself. Both are synced.
- **P2's column needed a repaint hook.** The plan's "fill each `[data-bal]` after the table paints"
  is not sufficient on its own: `UIC.dataTable` rebuilds the tbody from stored row HTML on every
  sort, search and page change, which restores the `…` placeholder. The component's existing
  `onRendered` hook ([UI_Components.html:811](UI_Components.html#L811)) is passed a repaint callback.
  **`UIC` itself was not modified for this.**

---

## 6. Costs and behaviours accepted deliberately, not discovered later

- **P1 resets sort and page position on every filter change** (D-D). Re-rendering rebuilds
  `window.__dtStore[id]`. This is the price of page-level filtering, and arguably correct — a
  filtered list's page 3 is meaningless. `UIC._applyFilters` was **not** touched (D-G): it is shared
  by ~40 tables and this page passes array rows of pre-rendered HTML.
- **P2 is uncached** (D-I). Every visit to the parties page reads four sheets once each — not once
  per party. First paint is unaffected, because the call is lazy and `getValleyParties_` still reads
  exactly one sheet (asserted in `s13`). If this proves too slow against real data, the revisit is
  `vfRefsCached_` **plus** busting from the four save handlers, as its own scoped change.
- **The balance column is ungated** (D-B). If you disagree, the change is small — a `parties_balance`
  key in `VF_COST_KEYS` and strip server-side — but it would then be inconsistent with the كشف حساب
  button sitting next to it, which exposes the identical number at the same access level.

---

## 7. Your visual checklist

Specific statements, to confirm in the running app after you deploy. Nothing here says "check it
looks right".

**Forms**
- [ ] In a ValleyFoods sales invoice, the **تفاصيل** field on a line shows a full short phrase, not
      four characters; the line table scrolls sideways rather than crushing its columns.
- [ ] The same is true in **مرتجعات المبيعات**, manufacturing **work-ops** and **recipes**.
- [ ] On a phone (<600px) the line editors still stack as cards — the min-width changed nothing there.
- [ ] Hovering a combo with a long selected value shows the full text as a tooltip.
- [ ] A long product name in an **open** combo dropdown can be read in full on hover.

**ERP Information admin (`0_ERP_Management.html`)**
- [ ] الإدارة ← **صفحات النظام** ← **عرض جميع الصفحات** opens a **wide** dialog; the four columns fit
      without dragging the table sideways.
- [ ] In that dialog, **اسم الصفحة** shows a full page name, and both **الوحدة** and **الشركة**
      dropdowns show their selected text rather than a clipped fragment.
- [ ] Editing a name there and saving still writes correctly — the values land as before.
- [ ] الإدارة ← **صلاحيات الأدوار**: after picking a role, **نوع الوصول** and **الحالة** are readable
      on a tablet-width window, not collapsed to slivers.
- [ ] **Granting a page to a role from that screen still works end to end.** *(This is the screen you
      use to grant `vf_warehouse_movement` — confirm it before relying on it.)*
- [ ] **فواتير الاشتراكات**: on a phone the cost fields stack in one column instead of two narrow ones.
- [ ] **الشركات**, **المستخدمون** and **العملات** dialogs are unchanged.

**vf_products**
- [ ] The products page shows a filter bar with **التصنيف**, **الرصيد من**, **الرصيد إلى**.
- [ ] Choosing a category narrows the list to only that category; the row count changes.
- [ ] Setting **الرصيد من** = 0 and **الرصيد إلى** = 0 shows exactly the products with no stock.
- [ ] A filter matching nothing shows an empty state saying no products **match the filter**.
- [ ] **مسح الفلاتر** restores the full list.
- [ ] Clicking a filtered row still opens that product's batches.
- [ ] Expect the sort and page position to reset when a filter changes — that is intended (§6).

**vf_parties**
- [ ] The parties table has a **الرصيد الحالي** column that fills in shortly after the list appears.
- [ ] For **at least three parties**, that number **equals** the **صافي رصيد الحساب الموحد** shown by
      that party's كشف حساب with **no date filter** and **نوع الحركة = عرض كل المعاملات**.
- [ ] A party with only sales shows a **negative** balance; one with only collections, **positive**.
- [ ] Sorting by **الرصيد الحالي** orders numerically, not as text.
- [ ] Paging to page 2 and sorting both keep the numbers — they do not revert to `…`.
- [ ] The parties list still loads and is usable if the balance call fails (cells show `—`).

---

## 8. Files changed

```
UI_Components.html                        F2 (combo titles), F4a (.form-grid)
Company_ValleyFoods_Sales.html            F1
Company_ValleyFoods_SalesReturns.html     F1 (+ the missing wrapper)
Company_ValleyFoods_MfgOrders.html        F1 (two tables)
Company_ValleyFoods_MfgRecipes.html       F1
0_ERP_Management.html                     A1.1, A1.2, A1.3
Company_ValleyFoods_Cash.html             F3
Company_TopLight_Cash.html                F3
Company_ValleyFoods_Products.html         F3, F4a, P1
Company_ValleyFoods_Parties.html          P2 (client)
Company_ValleyFoods_Actions.js            P2 (server, additive only)
tools/verify/s13_forms_filters.js         new
tools/verify/run_all.js                   one STEPS line
NEXT_STEPS_OWNER.md                       one item — the F4b follow-up
UI_FORMS_AND_FILTERS_RESULTS.md           this file
```

Nothing else was staged. Every commit staged explicit paths only — no `git add -A`, no `git add .`,
no `git commit -a`. **Nothing was pushed; the branch is yours to push.**
