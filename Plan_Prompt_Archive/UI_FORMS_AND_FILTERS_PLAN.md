# Forms Readability + Products/Parties Filters — Execution Plan

**Companion to:** the narrow-field analysis in this conversation.
**Branch:** new branch off current HEAD — `ui/forms-readability` (see §0.3).
**Date:** 2026-09-06
**Scope:** four readability fixes + two feature asks (`vf_products` filters, `vf_parties` balance column).

---

## 0. Ground rules

### 0.1 Inherited non-negotiables

These carry over from the performance and UI/UX runs and are not re-litigated here:

1. **No schema change.** No column added, renamed, removed, reordered or retyped in any business
   table, in any of the three company spreadsheets. No new sheet, no new tab.
2. **No data writes.** No rows created, edited or deleted in any business table — including
   `ERP_Pages_Matrix`. See §0.4: this plan needs **no matrix rows at all**.
3. **No deploy.** No `clasp push`, no `clasp run`, no push to `origin`. The owner pushes.
4. **No public-contract breakage.** `UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `SESSION.*`,
   every backend signature, every existing response shape, every HTML anchor id.
5. **Arabic string literals go through `Write`/`Edit`, never a Bash heredoc.** The heredoc collapses
   `\\` and mangles Arabic reliably. Every phase below writes Arabic.

### 0.2 The verification problem

There is no `node_modules`, no `package.json` and no browser in this repo. **No layout engine is
available**, so none of the widths in this plan were measured — they are derived from the CSS and
markup. That has a direct consequence for how each phase is verified:

- Static checks (`node --check`, `tools/verify/parse_pages.js`, `ui_smoke_pages.js`,
  `tools/verify/run_all.js`) prove a page still parses and boots. **They cannot prove a field got
  wider.**
- `design_preview/index.html` renders the component library at six widths against the real
  `CSS_Tokens.html` and `UI_Components.html`. That is where F1–F4 are actually *seen*.
- Anything that only shows up in the running app goes on the owner's checklist (§9), written as
  specific statements, never "check it looks right".

⚠️ **`design_preview/_sources.js` is currently modified in the working tree by another effort.** A
preview rebuild (`tools/build_preview.js`) will collide with it. Coordinate before rebuilding, or
verify against the existing bundle.

### 0.3 Branch and file discipline

The working tree carries **other efforts' uncommitted work**: modified `Company_TopLight_Sales.html`,
`Company_TopLight_Sales_Returns.html`, `design_preview/_sources.js`, and untracked `BOX_ANALYSIS_*`,
`Box_Analysis_Engine.js`, `VALLEY_WAREHOUSE_MOVEMENT_PLAN.md`, `tools/verify/box_parser.js`,
`tools/verify/s11_sales_returns.js`. **Do not stage it, do not revert it, do not clean it up.**

⚠️ **F1 touches `Company_TopLight_Sales.html`, which is already modified by another effort.** That
one file must either be deferred until the other work lands, or coordinated explicitly. It is called
out again in F1.

Every commit stages **explicit paths only** — never `git add -A`, never `git add .`, never
`git commit -a`.

**Files this plan may create or modify — nothing else:**

```
UI_Components.html                          (F2, F4a — additive only)
Company_ValleyFoods_Sales.html              (F1)
Company_ValleyFoods_SalesReturns.html       (F1)
Company_ValleyFoods_MfgOrders.html          (F1)
Company_ValleyFoods_MfgRecipes.html         (F1)
0_ERP_Management.html                       (A1)
Company_ValleyFoods_Cash.html               (F3)
Company_TopLight_Cash.html                  (F3)
Company_ValleyFoods_Products.html           (F3, P1)
Company_ValleyFoods_Parties.html            (P2)
Company_ValleyFoods_Actions.js              (P2 — additive only)
tools/verify/s13_forms_filters.js           (new)
tools/verify/run_all.js                     (one STEPS line)
UI_FORMS_AND_FILTERS_RESULTS.md             (new, at the end)
+ per-page files in F4b, one per commit, only if F4b is run
```

### 0.4 What this plan does *not* need from the owner

`checkPageAccess_(authUser, company, pageId, requiredAccess)` in
[03_Security.js:521](03_Security.js#L521) authorizes on **`pageId`**, and
[Company_ValleyFoods_Actions.js:313](Company_ValleyFoods_Actions.js#L313) resolves
`PAGE_ACCESS[action] -> {page, access}`.

**Therefore a new action mapped to an existing page inherits that page's existing grants.** P2 adds
`get_valley_party_balances` mapped to the already-granted `vf_parties` page. **No `ERP_Pages_Matrix`
rows are required and there is no blocked-on-owner step in this plan.**

---

## 1. What was verified before planning

Every line reference below was read, not assumed. They drift with each commit — re-confirm before
editing.

| # | Finding | Evidence |
|---|---|---|
| **R-1** | `.input` is `width:100%`, 16px font, 44px min-height. **Nothing is narrow by declaration.** | [UI_Components.html:3640-3648](UI_Components.html#L3640-L3648) |
| **R-2** | `.table` is `width:100%` with no `min-width`; `td` padding `10px 12px` stacks on `.input` padding `10px 12px` → ~50px of chrome per cell before a character renders. | [UI_Components.html:3391](UI_Components.html#L3391), [:3526](UI_Components.html#L3526) |
| **R-3** | **A house pattern for this already exists and works.** Four pages wrap the editor in `overflow-x:auto` *and* set `min-width` on the table. Five ValleyFoods tables do not. | [0_ERP_Management.html:452](0_ERP_Management.html#L452) `min-width:700px`; [Company_TopLight_Purchasing.html:272](Company_TopLight_Purchasing.html#L272), [Company_TopLight_Sales.html:232](Company_TopLight_Sales.html#L232), [Company_TopLight_Sales_Offer.html:162](Company_TopLight_Sales_Offer.html#L162) all `min-width:900px` |
| **R-4** | 9 pages carry inline table editors. 4 are correct (R-3). **5 ValleyFoods tables lack the floor**, so `overflow-x:auto` has nothing to scroll and columns compress instead. | §F1 table |
| **R-5** | **No shared form-grid class exists** — `grep -c form-grid UI_Components.html` → `0`. Instead: **83 inline `grid-template-columns` across 43 pages**, minimums ranging 110px→320px, plus 16 hard `1fr 1fr` splits with no minimum at all. | repo-wide grep |
| **R-6** | Default modal is 560px; `.modal-body` adds 24px padding each side → **512px of usable width**. `lg`=880, `xl`=1100 exist but are rarely used. Sales already hand-patches `box.style.maxWidth='1200px'` after opening. | [UI_Components.html:4248-4251](UI_Components.html#L4248-L4251), [:3736](UI_Components.html#L3736), [Company_ValleyFoods_Sales.html:233](Company_ValleyFoods_Sales.html#L233) |
| **R-7** | `.combo-option` truncates with `text-overflow:ellipsis`, and the combo display input is rendered with **no `title`** — a clipped value has no tooltip and no way to be read. | [UI_Components.html:3688-3691](UI_Components.html#L3688-L3691), [:1854](UI_Components.html#L1854) |
| **R-8** | `vf_products`: `CATEGORY_OPTIONS` already arrives from the server as `res.category_options`, and `current_stock_qty` is already on every row. **Both filters are pure client-side — zero server change.** | [Company_ValleyFoods_Products.html:99](Company_ValleyFoods_Products.html#L99), [:129](Company_ValleyFoods_Products.html#L129) |
| **R-9** | `vf_parties` balance = `Σ(value × sign)`, sign `+1` for `collections`/`purchases`/`returns`, `−1` for `sales`/`payments`. This is the **صافي رصيد الحساب الموحد** figure with no date filter and type `all`. | [Company_ValleyFoods_Parties.html:239](Company_ValleyFoods_Parties.html#L239), [:283](Company_ValleyFoods_Parties.html#L283), [:306](Company_ValleyFoods_Parties.html#L306) |
| **R-10** | The statement joins each source sheet on a **different field**. Any aggregate must use the identical fields or it will silently disagree with the كشف حساب. | §P2.1 |
| **R-11** | `getValleyPartyStatement_` reads 5 sheets per call and filters each by one client id. An all-parties aggregate reads **4 of those 5 once** (`valley_sales_products` is only needed for sub-rows and names, not for the balance). | [Company_ValleyFoods_Actions.js:3707](Company_ValleyFoods_Actions.js#L3707) |
| **R-12** | **The صفحات النظام editor is the worst case in the app.** Its table correctly declares `min-width:700px` — but it is opened in the **560px default modal** (512px body). The content is 188px wider than its container, so the اسم الصفحة text input and both selects are permanently squeezed and horizontally scrolled. | [0_ERP_Management.html:451-456](0_ERP_Management.html#L451-L456) |
| **R-13** | The **صلاحيات الأدوار** grid has the F1 disease: `.table-wrap` supplies `overflow-x:auto` ([UI_Components.html:3377](UI_Components.html#L3377)) but the table sets **no `min-width`**, so 5 columns — two of them `<select>` — compress instead of scrolling. Long `page_id`s and Arabic page names take the space; the selects lose it. | [0_ERP_Management.html:334-348](0_ERP_Management.html#L334-L348) |
| **R-14** | **None of the 5 admin modals passes a `size`** — all render at 560px. The subscription-invoice form additionally stacks **three hard `1fr 1fr` grids**, which have no minimum at all, so on a phone they stay two columns at ~156px each. | [0_ERP_Management.html:150](0_ERP_Management.html#L150), [:237](0_ERP_Management.html#L237), [:456](0_ERP_Management.html#L456), [:524](0_ERP_Management.html#L524), [:701](0_ERP_Management.html#L701); grids at [:648](0_ERP_Management.html#L648), [:667](0_ERP_Management.html#L667), [:678](0_ERP_Management.html#L678) |

---

## 2. Phase order, and why

```
F1  line-item min-width        ← smallest fix, largest readability win, copies an existing pattern
A1  ERP Information admin      ← the acute case: صفحات النظام + صلاحيات الأدوار
F2  combo tooltips             ← 2 lines, removes "cannot read it at all" entirely
F3  modal sizing               ← per-page, no shared-CSS risk
F4a .form-grid definition      ← additive class only, ZERO migration, zero risk
P1  vf_products filters        ← client-only; consumes .form-grid from F4a
P2  vf_parties balance column  ← the only phase with a server change
F4b migrate the 83 grids       ← biggest blast radius, deliberately LAST
V   verify script + results doc
```

**F4 is deliberately split.** Defining `.form-grid` (F4a) is a pure addition nothing yet uses, so P1
can build its filter bar on the house class instead of inventing an 84th inline grid. Migrating the
existing 83 (F4b) touches 43 files and goes last, so feature work never rebases across it.

One commit per phase. Commit message format per §10.

---

## F1 — Give the line-item tables a width floor

**The single highest-value change in this plan.** This is what makes a field show four characters of
an Arabic string.

### The fix

Adopt the pattern that already works on the TopLight pages (R-3): wrap in `overflow-x:auto` and set
`min-width` on the `<table>` so the wrapper has something to scroll. **No new CSS, no shared-component
change** — five inline edits.

| File | Line | Table | Cols | Has wrapper? | Proposed |
|---|---|---|---|---|---|
| [Company_ValleyFoods_Sales.html](Company_ValleyFoods_Sales.html#L216) | 216 | `lines-table` | 7 | yes | `min-width:900px` |
| [Company_ValleyFoods_SalesReturns.html](Company_ValleyFoods_SalesReturns.html#L182) | 182 | returns lines | 6 | **no — add one** | `min-width:820px` |
| [Company_ValleyFoods_MfgOrders.html](Company_ValleyFoods_MfgOrders.html#L639) | 639 | work ops | 8 | yes | `min-width:900px` |
| [Company_ValleyFoods_MfgOrders.html](Company_ValleyFoods_MfgOrders.html#L546) | 546 | outputs | 3–4 | yes | `min-width:560px` |
| [Company_ValleyFoods_MfgRecipes.html](Company_ValleyFoods_MfgRecipes.html#L141) | 141 | recipe lines | var | yes | `min-width:760px` |

Widths follow the house precedent (700/900) sized to column count, not invented per table.

### Deliberately excluded

- [Company_ValleyFoods_Parties.html:270](Company_ValleyFoods_Parties.html#L270) (statement ledger)
  and [:340](Company_ValleyFoods_Parties.html#L340) (stock valuation) — these live in a modal already
  hand-widened to 1150px and are read-mostly. Revisit only if the owner reports clipping.
- [Company_ValleyFoods_Sales.html:566](Company_ValleyFoods_Sales.html#L566) and
  [MfgOrders.html:409](Company_ValleyFoods_MfgOrders.html#L409) — 3-column batch strips that already
  set explicit per-column widths.

### Interaction with the mobile card mode

Below 600px, [UI_Components.html:4199](UI_Components.html#L4199) turns `.table` into stacked blocks
(`display:block`). A `min-width` on the table is inert in that mode, so **this change is a no-op on
phones** and affects tablet-landscape and desktop only. Confirm in the preview at 599px and 900px.

### ⚠️ Conflict

`Company_TopLight_Sales.html` is **not** in the F1 table precisely because it is already correct
*and* already modified by another effort. F1 touches five ValleyFoods files only, none of which is
currently dirty. Verify with `git status --porcelain` before staging.

**Verify:** `parse_pages.js`, `ui_smoke_pages.js`, `run_all.js`. Preview at 599/900/1280px.
**Risk:** very low. Five inline style attributes; no shared code path.

---

## A1 — `ERP_Information` admin forms (`0_ERP_Management.html`)

**Raised by the owner, and the recon confirms it is the sharpest instance of the problem in the
app.** This is the admin UI over the `ERP_Information` auth spreadsheet — `ERP_Companies`,
`ERP_Users`, `ERP_Pages`, `ERP_Pages_Matrix`, `ERP_currency_exchange` — across 7 tabs
([:49-58](0_ERP_Management.html#L49-L58)).

Reminder, §0.1 rule 2: **this phase changes the form that edits `ERP_Pages_Matrix`. It does not
write a single row.** Only the widths of the controls change.

### A1.1 صفحات النظام — the pages editor (R-12) — **the priority fix**

`openPagesMatrix` ([:441-456](0_ERP_Management.html#L441-L456)) builds a 4-column editor —
`معرف الصفحة` (text), `اسم الصفحة` (`<input class="input">`), `الوحدة` (select), `الشركة` (select) —
and correctly declares `min-width:700px` on the table. It then opens it with:

```js
UIC.openModal('pages-matrix-modal', { title: 'جميع صفحات النظام', body: body, onSave: '…' });
```

No `size`. **The modal is 560px, its body 512px, and the content is 700px** — 188px wider than its
own container, permanently. Every row is horizontally scrolled and all three editable controls are
squeezed. This is exactly the reported symptom, and it is a one-option fix:

- Pass **`size: 'xl'`** (1100px, [UI_Components.html:4251](UI_Components.html#L4251)). The body then
  offers ~1052px against a 700px requirement — the table gets its natural width and the horizontal
  scroll disappears on desktop.
- Raise the table's `min-width` from 700px to **~820px** so the name input and the two selects each
  get a usable share rather than the minimum that merely avoids overlap.

### A1.2 صلاحيات الأدوار — the authority matrix (R-13)

`renderMatrixGrid` ([:334-348](0_ERP_Management.html#L334-L348)) renders 5 columns —
`الصفحة`, `الاسم`, `الوحدة`, `نوع الوصول` (select), `الحالة` (select) — inside `.table-wrap`.
`.table-wrap` already provides `overflow-x:auto`, so this is precisely the F1 fix in a different
file: **add `min-width:820px` to the table**. Long `page_id` values (`vf_warehouse_movement`) and
Arabic page names currently win the space contest and the two selects lose it.

This is a full-page table inside `#admin-root`, which is capped at 1200px
([:13](0_ERP_Management.html#L13)) — so on desktop the floor is inert and nothing changes; it earns
its keep at tablet widths and below, where today the selects collapse.

### A1.3 The remaining admin modals (R-14)

None of the five passes a `size`. Treat individually rather than widening all:

| Modal | Line | Shape | Action |
|---|---|---|---|
| `pages-matrix-modal` | [456](0_ERP_Management.html#L456) | 4-col editor, 700px content | **`size:'xl'`** — A1.1 |
| `erp-invoice-modal` | [701](0_ERP_Management.html#L701) | three hard `1fr 1fr` grids | **`size:'lg'`** + replace the three grids with `.form-grid` (F4a) so they collapse to one column on a phone instead of holding two ~156px columns |
| `company-modal` | [150](0_ERP_Management.html#L150) | single-column `UIC.field` stack | **leave** — full-width fields at 512px are fine |
| `user-modal` | [237](0_ERP_Management.html#L237) | single-column stack | **leave** |
| `currency-modal` | [524](0_ERP_Management.html#L524) | one select | **leave** |

The invoice grids are one of the two in-scope instances of the hard-`1fr 1fr` pattern (R-5) — the
other is the products form at
[Company_ValleyFoods_Products.html:17-18](Company_ValleyFoods_Products.html#L17-L18), handled in F3.
Between them they make A1.3 the pilot for F4b: if `.form-grid` works cleanly on these two, the
migration pattern is proven before it is applied to 43 files.

### Ordering note

A1.3's invoice change **depends on F4a** (`.form-grid` must exist). Either run A1.1 + A1.2 here and
defer A1.3 until after F4a, or move F4a ahead of A1. **Recommended: run A1.1 + A1.2 now** — they are
the owner's actual complaint and need no new CSS — and fold A1.3 into F4a's commit.

**Verify:** `parse_pages.js`, `ui_smoke_pages.js`, `run_all.js`. In the preview, check the admin
tables at 599/900/1280px. `0_ERP_Management.html` is **not** currently dirty in the working tree —
confirm with `git status --porcelain` before staging.
**Risk:** low. `size` is an existing tested option; the `min-width` additions follow R-3's house
pattern. No handler, no payload and no matrix row is touched.

---

## F2 — Make a truncated value readable

Two changes in [UI_Components.html](UI_Components.html), both additive.

1. **`title` on the combo display input** ([:1854](UI_Components.html#L1854)) — set to the resolved
   `curLabel`, so a clipped selection can be read on hover. Must be kept in sync when
   `UIC.comboPick` writes a new value ([:1947](UI_Components.html#L1947),
   [:1963](UI_Components.html#L1963)).
2. **`title` on each `.combo-option`** ([:1845](UI_Components.html#L1845)) — the dropdown truncates
   long product names *while you are choosing*, which is worse than truncating after.

Both use the existing local `esc()`; neither changes the value written to the hidden input, the
`_display` id contract, or any markup structure a page depends on.

**Consider and decide:** whether `.combo-option` should wrap to two lines instead of truncating
(`white-space:normal` + `line-height`). Recommended **no** — it makes list height unpredictable and
`max-height:240px` scrolling jumpier. The `title` covers the need.

**Verify:** `s0_modal_size.js` and `ui5_forms.js` both load the real `UIC` under the DOM stub —
run them, since they assert on generated markup and a new attribute could trip a byte-comparison.
This is the phase most likely to break an existing assertion; that is by design, it means the
assertion is doing its job. Update it deliberately and record why, following the precedent already
written into [tools/verify/s0_modal_size.js](tools/verify/s0_modal_size.js#L31).
**Risk:** low, but touches a component used by every page — hence the full suite.

---

## F3 — Size the dense modals

Not a shared-CSS change: `.modal` stays 560px as the default, because most forms are genuinely small
and widening all of them wastes screen. Instead, pass `size:'lg'` on the forms that are demonstrably
cramped.

The `0_ERP_Management.html` modals are **not** listed here — they are handled in A1.3, where they sit
with the rest of the admin work.

Candidates, to be confirmed page by page against their field count:

- `Company_ValleyFoods_Cash.html` — the modal holds a 4-across computed-values strip at
  `minmax(130px,1fr)` ([:205](Company_ValleyFoods_Cash.html#L205)) inside 512px, so it already wraps
  to 3.
- `Company_TopLight_Cash.html` — same shape at `minmax(140px,1fr)`
  ([:253](Company_TopLight_Cash.html#L253)).
- `Company_ValleyFoods_Products.html` — 13 fields in a hard `1fr 1fr`
  ([:17-18](Company_ValleyFoods_Products.html#L17-L18)).

**Also fold in:** replace the two hand-patched `box.style.maxWidth` assignments
([Sales.html:233](Company_ValleyFoods_Sales.html#L233),
[Parties.html:229](Company_ValleyFoods_Parties.html#L229)) with `size:'xl'` **only if** 1100px is
accepted in place of the current 1200/1150px. Otherwise leave them — a working hand-patch is not
worth a regression. **Decision needed from the owner.**

**Risk:** low. `UIC.MODAL_SIZES` ([:2116](UI_Components.html#L2116)) is an existing, tested option.

---

## F4a — Define `.form-grid` (definition only, no migration)

Add to the Form Controls block of [UI_Components.html](UI_Components.html#L3640), next to `.input`:

- `.form-grid` — `display:grid; gap: 0 var(--space-4); grid-template-columns: 1fr;` and from 600px
  up, `repeat(auto-fit, minmax(240px, 1fr))`.
- `.form-grid-wide` — same, `minmax(320px, 1fr)`, for forms whose fields hold long Arabic names.
- `.form-grid-narrow` — `minmax(150px, 1fr)`, honest home for the read-only computed-total strips
  that legitimately want to be dense.

240px is chosen over the current most-common 220px because at 220px inside a 512px modal the two
resulting columns leave ~226px of text after `.input` padding — the exact margin where long Arabic
party names start clipping (R-6).

**Nothing is migrated in this phase.** Zero pages change. The class exists so P1 can use it and F4b
has a target.

**Verify:** `tools/ui_check.js` asserts every class *used* is *defined*; this adds defined-but-unused
classes, which is the safe direction. Confirm the check does not also flag the reverse.

---

## P1 — `vf_products`: category filter + current-qty min/max

**No server change.** R-8 established that `category_options` and `current_stock_qty` are already in
the response.

### P1.1 The filter bar

A new bar above the table, inside `renderTable`'s container in
[Company_ValleyFoods_Products.html](Company_ValleyFoods_Products.html#L110), built on `.form-grid`
from F4a:

- **التصنيف** — `UIC.combo` over `CATEGORY_OPTIONS` prefixed with `{value:'', label:'كل التصنيفات'}`.
  A combo, not a select, to match every other reference picker on the page.
- **الرصيد من / إلى** — two `UIC.field` number inputs (`min:'0'`, `step:'0.01'`).
- **مسح الفلاتر** — a `btn-outline` that clears all three and re-renders.

### P1.2 Mechanism — filter the source rows, re-render

```
FILTERS = { category: '', qtyMin: null, qtyMax: null }
applyFilters()  ->  filtered = ROWS.filter(...)  ->  renderTable(filtered)
```

**Decision — recommended: page-level filtering (Option A), not a generic `UIC` column filter
(Option B).**

`UIC._applyFilters` ([UI_Components.html:3395](UI_Components.html#L3395)) is shared by every table in
the app, and this page passes **array rows of pre-rendered HTML**, not objects — the existing
field-targeted search already skips arrays for exactly that reason
(`(r && !Array.isArray(r)) ? r[field] : null`). Extending it to address columns positionally through
rendered HTML would be fragile and would put risk on ~40 other tables to serve one page. Filtering
`ROWS` — where `r.category` and `r.current_stock_qty` are live values — is simpler and strictly
contained.

### P1.3 Behaviour to get right

- **Semantics:** category is exact match on the raw `r.category` id (not the mapped label); qty
  bounds are **inclusive**; a blank bound is unbounded; blank/null `current_stock_qty` is treated as
  `0`, matching how the column already renders.
- **Empty result:** `UIC.dataTable` returns `UIC.emptyState` when `rows.length === 0`
  ([:601](UI_Components.html#L601)) — so an over-narrow filter shows the house empty state for free.
  Pass an `emptyState` whose text says *no products match the filter*, not *no products exist*.
- **Known cost, accept explicitly:** re-rendering rebuilds `window.__dtStore[id]`, so **the active
  sort and page position reset on every filter change.** This is the price of Option A. It is
  acceptable — and arguably correct, since a filtered list's page 3 is meaningless — but it must be
  stated in the results doc rather than discovered by the owner.
- Keep the existing `rowClick` → `openBatches` wiring intact through the re-render.

**Verify:** `parse_pages.js`, `ui_smoke_pages.js`. Add filter assertions to the new verify script
(§V): filtering by a category id yields only rows with that id; `qtyMin`/`qtyMax` are inclusive at
both ends; a blank bound is unbounded.
**Risk:** low, and contained to one page.

---

## P2 — `vf_parties`: a **الرصيد الحالي** column

The only phase with a server change.

### P2.1 The definition — must match كشف حساب exactly

```
balance(party) = (purchases + collections + returns) − (sales + payments)
```

Per R-9. The join fields differ per sheet, and **using the wrong one produces a number that looks
plausible and disagrees with the statement** (R-10):

| Source sheet | Join field | Value | Sign |
|---|---|---|---|
| `valley_sales_invoices` | `اسم العميل` | `إجمالي` | **−1** |
| `valley_product_purchasing` | `vendor` | `qty × unit_price` | **+1** |
| `valley_cash_bank_movement` | `name` | `abs(total)` | **+1** if `transaction_type` is `debit` (collections), else **−1** (payments) |
| `valley_sales_returns` | `valley_sales_invoices_client` | `abs(valley_return_value)` | **+1** |

**This is the ledger balance, not the stock-adjusted figure.** The adjusted number in the statement's
`adjusted-box` subtracts a stock valuation computed from **user-editable price inputs**
([Parties.html:314-322](Company_ValleyFoods_Parties.html#L314-L322)) and therefore has no stable
server-side value. It must not be used for a list column.

### P2.2 Server — a new, separate handler

`getValleyPartyBalances_(data, user, dbId)` in
[Company_ValleyFoods_Actions.js](Company_ValleyFoods_Actions.js#L3707), placed next to the statement
handler it mirrors. Reads the four sheets **once each** via `safeRows_` (same
error-swallowing contract as the statement, for consistency), accumulates into `{ [partyId]: number }`,
returns `{ status:'success', balances: {...} }`.

Register in all three places, following the house pattern:
- `PAGE_ACCESS`: `'get_valley_party_balances': { page: 'vf_parties', access: 'read' }`
- `ACTION_TABLES`: `'valley_legal_customer_vendor'`
- the `ValleyFoods.register(...)` tail block ([:7639](Company_ValleyFoods_Actions.js#L7639))

**Decision — recommended: a separate lazy handler, not folded into `getValleyParties_`.**
`getValleyParties_` ([:3588](Company_ValleyFoods_Actions.js#L3588)) currently reads **one** sheet.
Folding four more into it would make every parties page load ~5× the I/O before first paint, and
would change an existing response shape (§0.1 rule 4). A separate call keeps first paint exactly as
fast as today and is purely additive.

**No caching.** A cached balances map would need busting from every sales, purchasing, cash and
returns save handler — four edits to existing handlers, which §0.1 rule 4 rules out. If the
uncached cost proves too high in the running app, revisit with `vfRefsCached_`
([:3690](Company_ValleyFoods_Actions.js#L3690)) *and* the busting edits, as its own scoped change.

### P2.3 Client — load after the table, patch in place

Mirrors the existing deferred-load precedent (`schedulePrefetch`,
[Client_Helpers.html:518](Client_Helpers.html#L518)):

1. `renderTable` adds a **الرصيد الحالي** header before the trailing actions column
   ([Parties.html:97](Company_ValleyFoods_Parties.html#L97)) and renders each cell as a placeholder
   `<span class="num" data-bal="<id>" data-num="0">…</span>`.
2. After the table paints, call `get_valley_party_balances`.
3. On resolve, fill each `[data-bal]` with `finFmt(v)` and set `data-num` to the raw number so the
   existing numeric sort works.
4. On reject, leave a `—` and toast once. **The list must remain fully usable if the balance call
   fails.**

Reuse the page's existing `finFmt` ([:175](Company_ValleyFoods_Parties.html#L175)) so the column
formats identically to the statement — including its `(1,234.00)` parenthesised negatives.

### P2.4 Cost gating — none needed, stated deliberately

`amount`/`unit_cost` sit behind `valley_cost_view` because they are **cost** figures. A party balance
is a receivable/payable, and `get_valley_party_statement` already exposes the identical number to
anyone with `read` on `vf_parties` — one click, same page. **The column therefore discloses nothing
new and needs no gate.** Recorded here so it is a decision, not an omission.

If the owner disagrees, the change is small — add a `parties_balance` key to `VF_COST_KEYS`
([:3239](Company_ValleyFoods_Actions.js#L3239)) and strip server-side — but it would then be
inconsistent with the statement button sitting next to it. **Flag for the owner; do not implement
unless asked.**

**Verify:** `node --check Company_ValleyFoods_Actions.js`; new assertions in §V; a `node` dry-run of
the aggregate against stubbed `safeRows_` fixtures asserting the sign of each of the five
transaction types and that the total for a fixture party equals the statement's `running`.
**Risk:** medium — the only server change. Mitigated by the dry-run and by being purely additive.

---

## F4b — Migrate the 83 inline grids

Deliberately last. Replace inline `style="display:grid;grid-template-columns:…"` with `.form-grid`
(or `-wide`/`-narrow`) across 43 pages.

**Do not do this mechanically.** The 83 sites are not all forms — a large share are **KPI/stat tile
rows** (`Company_TopChemical_KPI.html:15`, `Company_ValleyFoods_KPI.html:16`,
`Company_TopLight_Dashboard.html:67`, and others), where `minmax(180px,1fr)` is correct and a 240px
floor would make dashboards worse. Classify first:

1. **Form field grids** → migrate to `.form-grid`.
2. **Computed-value strips** (the 110–140px ones) → `.form-grid-narrow`.
3. **Tile/KPI rows** → **leave alone**, or give them a separate `.tile-grid`. Out of scope here.

Migrate **one page per commit**, verifying after each. The 16 hard `1fr 1fr` splits are the highest
value — they have no minimum at all — and the `minmax(220px)` ones the lowest.

**This phase is optional and severable.** F1–F3 + P1 + P2 stand alone and deliver the readability win
and both features. If time runs short, **stop after V and leave F4b for its own run** — that is a
better outcome than a half-migrated stylesheet.

---

## V — Verification and handover

### V.1 New verify script

`tools/verify/s13_forms_filters.js`, offline, over the real source, no network, no spreadsheet.
Add one line to `STEPS` in [tools/verify/run_all.js](tools/verify/run_all.js). Assert:

1. Each of the five F1 tables has both an `overflow-x` wrapper **and** a `min-width`.
1b. **A1:** `pages-matrix-modal` is opened with `size:'xl'`, and **no modal in
    `0_ERP_Management.html` opens content whose declared `min-width` exceeds its modal size** — the
    invariant that R-12 violated. Assert it generically against `UIC.MODAL_SIZES` so the next such
    mismatch fails the suite instead of shipping.
1c. **A1:** the صلاحيات الأدوار table declares a `min-width`.
2. `.form-grid` is defined in `UI_Components.html` and its floor is ≥ 240px.
3. The combo display input and every `.combo-option` carry a `title`.
4. `WH`-style header discipline for P2: the four join field names appear verbatim in
   `getValleyPartyBalances_`, and its sign map matches the statement's, byte for byte.
5. `getValleyPartyBalances_` is registered in all three places.
6. The balance aggregate reads from the sheets, never from the payload.
7. P1: category filter is exact-match on the raw id; qty bounds inclusive; blank bound unbounded.
8. The products page contains no server call for filtering (the filters are client-side by design).

### V.2 Full gate, after every phase

```
node --check <each .js touched>
node tools/verify/parse_pages.js
node tools/verify/ui_smoke_pages.js      # catches a blank page; parse_pages does not
node tools/verify/run_all.js             # must stay green, including s13
```

### V.3 Results doc

`UI_FORMS_AND_FILTERS_RESULTS.md` at the end: what changed, what was skipped and why, the two
decisions left open (F3 modal replacement, P2.4 gating), the captured dry-run balance map from P2,
and the owner checklist below.

---

## 9. Owner's visual checklist

Specific statements, verified in the running app after the owner deploys:

**Forms**
- [ ] In a ValleyFoods sales invoice, the **تفاصيل** field on a line shows a full short phrase, not
      four characters; the line table scrolls sideways rather than crushing its columns.
- [ ] The same is true in sales returns, manufacturing work-ops and recipes.
- [ ] On a phone (<600px) the line editors still stack as cards — the min-width changed nothing.
- [ ] Hovering a combo with a long selected value shows the full text as a tooltip.
- [ ] A long product name in an open combo dropdown can be read in full on hover.

**ERP Information admin (`0_ERP_Management.html`)**
- [ ] الإدارة ← **صفحات النظام** ← **عرض جميع الصفحات** opens a **wide** dialog; the four columns fit
      without dragging the table sideways.
- [ ] In that dialog, **اسم الصفحة** shows a full page name, and both **الوحدة** and **الشركة**
      dropdowns show their selected text rather than a clipped fragment.
- [ ] Editing a name there and saving still writes correctly — the values land as before.
- [ ] الإدارة ← **صلاحيات الأدوار**: after picking a role, **نوع الوصول** and **الحالة** are readable
      on a tablet-width window, not collapsed to slivers.
- [ ] Granting a page to a role from that screen still works end to end. *(This is the screen the
      owner uses to grant `vf_warehouse_movement` — confirm it before relying on it.)*
- [ ] **فواتير الاشتراكات**: on a phone the cost fields stack in one column instead of two narrow ones.
- [ ] الشركات, المستخدمون and العملات dialogs are unchanged.

**vf_products**
- [ ] The products page shows a filter bar with **التصنيف**, **الرصيد من**, **الرصيد إلى**.
- [ ] Choosing a category narrows the list to only that category; the row count changes.
- [ ] Setting **الرصيد من** = 0 and **إلى** = 0 shows exactly the products with no stock.
- [ ] A filter matching nothing shows an empty state saying no products *match the filter*.
- [ ] **مسح الفلاتر** restores the full list.
- [ ] Clicking a filtered row still opens that product's batches.

**vf_parties**
- [ ] The parties table has a **الرصيد الحالي** column that fills in shortly after the list appears.
- [ ] For at least three parties, that number **equals** the **صافي رصيد الحساب الموحد** shown by
      that party's كشف حساب with no date filter and نوع الحركة = عرض كل المعاملات.
- [ ] A party with only sales shows a negative balance; one with only collections, positive.
- [ ] Sorting by **الرصيد الحالي** orders numerically, not as text.
- [ ] The parties list still loads and is usable if the balance call fails.

---

## 10. Commit protocol

```
<type>(<phase>): <short summary>

<what changed, file by file>
<what was verified, and how>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

---

## 11. Decisions needed before starting

| # | Question | Recommendation |
|---|---|---|
| **D-A** | F3 — replace the two hand-patched modal widths (1200px/1150px) with `size:'xl'` (1100px)? | **No** — leave the hand-patches. A working width is not worth a regression for 100px of tidiness. |
| **D-B** | P2.4 — should **الرصيد الحالي** sit behind a permission gate? | **No** — the identical number is already one click away via كشف حساب at the same access level. |
| **D-C** | F4b — run the 83-grid migration now, or as its own run? | **Its own run.** F1–F3 + P1 + P2 deliver the readability win and both features; F4b is severable and touches 43 files. |
| **D-D** | P1 — accept that filtering resets the table's sort and page position? | **Yes** — inherent to Option A, and a filtered list's page 3 is meaningless anyway. |
| **D-E** | A1 — is `xl` (1100px) wide enough for صفحات النظام, or should it be a full-screen editor? | **`xl` first.** It clears the 700px content requirement with room to spare and is a one-option change; a full-screen editor is a redesign, not a width fix. Revisit only if the owner still finds it cramped. |
| **D-F** | A1.3 — run it with A1, or fold into F4a? | **Fold into F4a** — it needs `.form-grid` to exist. A1.1 + A1.2, the owner's actual complaint, ship first and depend on nothing. |
