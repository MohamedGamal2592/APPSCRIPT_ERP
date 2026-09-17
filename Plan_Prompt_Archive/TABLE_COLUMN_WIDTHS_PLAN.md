# Table column widths — analysis and execution plan

**Goal.** A column that holds words gets the room words need; a column that holds a date, a
document number or a figure gets exactly the room that atom needs and no more. One contract,
declared once in the shared layer, that every existing page inherits without being edited and
every future page inherits without being told.

**Branch.** `ui/table-columns`, off `master`.

**Status.** Plan only. Nothing in this document has been implemented.

---

## 0. The symptom

`vf_parties` → كشف حساب مالي تفصيلي. Six columns. Five of them hold atoms — `27/10/2025`,
`2679`, `13,950.00`, `-`, `(13,950.00)`. One holds the sentence that says what the row *is*:

> إيصال صرف نقدي (مدفوعات له) - حساب عين سولار ٧٦٠ لتر ٦٥٠ توصيل

That column renders roughly seven characters wide, one word per line, nine lines tall. The
other five sit comfortably. The only column carrying information a human has to *read* is the
only one that was squeezed.

This is not a `vf_parties` bug. It is the default behaviour of every table in the tree, and it
shows up wherever a prose column shares a table with atoms — which is nearly everywhere.

---

## 1. Evidence — the mechanism, exactly

### 1.1 There is no column-width contract. At all.

| Fact | Count | How counted |
|---|---|---|
| `<colgroup>` in the whole tree | **0** | `grep -c '<colgroup'` |
| `table-layout` declarations on a `.table` | **0** | the three hits are print-only: [Code.js:946](Code.js#L946), [Company_TopChemical_Actions.js:5519](Company_TopChemical_Actions.js#L5519), [Company_ValleyFoods_Products.html:30](Company_ValleyFoods_Products.html#L30) — and the last one sets `auto`, i.e. the default |
| `min-width`/`max-width` on any `<td>`/`<th>` | **0** / **1** | one hand-written `min-width:240px` |
| Ad-hoc inline `width` on a `<th>` | **35** | mixed `%` and `px`, page-local, almost all in print templates |
| Column-type hints in `UIC.dataTable` headers | `money` 42, `numeric` 88, **anything about width: 0** | — |

So every table falls through to `table-layout: auto`, and the browser decides column widths
purely from content — which is where it goes wrong.

### 1.2 The auto algorithm gives the space to whoever cannot give it up

[UI_Components.html:3666](UI_Components.html#L3666) — `.table { width: 100%; }` with no
`table-layout`, so: auto.

Auto layout gives each column at least its **min-content** width, then shares the surplus by
max-content. When the container is narrower than Σ max-content, it takes the difference out of
the columns that *can* shrink.

- A date, a document number, a formatted figure and a `-` have **no break opportunity**.
  Their min-content equals their max-content. They cannot give up a pixel.
- A sentence has spaces. Its min-content is its **longest single word**.

So the sentence column absorbs the entire shortfall on its own and lands at its longest word —
about seven characters here. Exactly what the screenshot shows.

### 1.3 The header rule turns every label into a permanent floor

[UI_Components.html:3672](UI_Components.html#L3672) — `.table thead th { white-space: nowrap; }`

This is right for the header and wrong as a side effect. A `<th>` is a cell in its column, so
its min-content contributes to the column's floor. `الرصيد التراكمي` therefore reserves ~15
characters of width **forever**, and `مدين` reserves 4 — in a column where every visible cell
says `-`. The sparsest columns on the screen hold width the prose column is being starved of.

### 1.4 Row height pays for it twice

A nine-line description makes the row nine lines tall. Five transactions fill the viewport. The
table became *less* information-dense as a direct result of spending its width on atoms — the
opposite of what the width was spent for.

### 1.5 The horizontal-scroll affordance exists and never fires

[UI_Components.html:3648-3651](UI_Components.html#L3648) — `.table-wrap { overflow-x: auto; }`

It has never done anything on a `.table`. With `width: 100%` and every column able to reach its
min-content, the table always shrink-fits its container. It never overflows, so it never
scrolls. The escape hatch is already built; nothing has ever been wide enough to use it.

---

## 2. The census — how far this reaches

Run over every root `.html`/`.js` except the 14 MB archive and `Code.js.bak`.

| | Count |
|---|---|
| `UIC.dataTable` call sites | **69** |
| Raw `<table class="table">` written as markup | **31** |
| …of those, inside a `.table-wrap` | **8** — the other **23** have no horizontal scroll and no sticky header either |
| Tables under a page-local class (`grid` 7, `inv-table` 5, `info` 5, `odoo-table` 4, plus 9 singletons) | **~30** |
| Distinct column labels in the tree | **703** |
| Labels that name prose (اسم / البيان / ملاحظات / التفاصيل / العنوان / الوصف / المنتج / الصنف / العميل / المورد / الموظف …) | **259** |
| Labels that name an atom (تاريخ / رقم / كود / مبلغ / كمية / سعر / إجمالي / رصيد / الوحدة / الحالة …) | **624** |

Every table in the tree mixes the two. The 23 unwrapped raw tables are:

```
4  Company_ValleyFoods_MfgOrders.html      1  Company_TopLight_Purchasing.html
2  Company_ValleyFoods_Parties.html        1  Company_TopLight_Sales.html
2  Company_ValleyFoods_Sales.html          1  Company_TopLight_Sales_Analysis.html
1  0_ERP_Management.html                   1  Company_TopLight_Sales_Offer.html
1  Company_TopChemical_BudgetInputs.html   1  Company_ValleyFoods_Attendance.html
1  Company_TopChemical_Debts.html          1  Company_ValleyFoods_Deductions.html
1  Company_TopChemical_EmpDeductions.html  1  Company_ValleyFoods_MfgRecipes.html
1  Company_TopChemical_EmpSalaries.html    1  Company_ValleyFoods_Products.html
1  Company_ValleyFoods_SalesReturns.html   1  DbLive_Viewer.html
```

### 2.1 The worst case in the tree

[Company_ValleyFoods_Cash.html:183](Company_ValleyFoods_Cash.html#L183) — **thirteen** columns:

```
رقم · التاريخ · الطرف · البيان · النوع · طريقة الدفع · المبلغ · الصندوق ·
كود الحساب · المستخدم · الرصيد · الاعتماد · (actions)
```

Two of those hold prose (`الطرف`, `البيان`). Eleven hold atoms or headers wider than their data.
On a 1024px tablet the two prose columns are sharing whatever eleven atoms left behind.

---

## 3. The contract

Five column roles. A role is a statement about **what the cell holds**, not about pixels — so it
survives a font change, a translation and a new page.

| Role | Class | Holds | Width behaviour |
|---|---|---|---|
| atom | `col-atom` | date, code, doc no., unit, month, ID | shrink to content, never wraps, never grows |
| number | `col-num` | money, quantity, percentage | as atom, plus the existing `.num` tabular/LTR treatment |
| text | `col-text` | a name, a party, a status phrase | floor **14ch**, shares the surplus |
| prose | `col-prose` | البيان, ملاحظات, التفاصيل, العنوان, الوصف | floor **26ch**, **absorbs** the surplus |
| actions | `col-actions` | buttons, the row kebab | shrink to content, never wraps, never sortable |

`.num` already exists at [UI_Components.html:3820](UI_Components.html#L3820) and already carries
`direction: ltr`, `tabular-nums` and the mono stack. `col-num` adds only the width half; the
class name stays so nothing that styles `.num` today changes.

---

## 4. The mechanism — and why all of it rides on `<thead>`

The entire contract is **one class on each `<th>`**. Nothing is added to a single body cell.

```css
/* the width contract — thead only */
.table thead th.col-atom,
.table thead th.col-num,
.table thead th.col-actions { width: 1%; }          /* nowrap is already global */
.table thead th.col-text    { min-width: 14ch; }
.table thead th.col-prose   { min-width: 26ch; width: 100%; }

/* a single 40-character token must not force overflow on its own */
.table td { overflow-wrap: break-word; }
```

**Why the header alone governs the column.** In `table-layout: auto` a column's used minimum is
the maximum of the minimums of *all* cells in that column — and the `<th>` is one of those cells.
`min-width: 26ch` on the header therefore raises the floor of the whole column, for every row.
Its `width` feeds the same column's preferred width. One attribute; five hundred rows.

**Why `width: 1%`.** A specified width far below min-content means the column receives its
min-content and *none of the surplus*. The surplus goes where a `width: 100%` asks for it — the
prose column. This is the standard idiom, and it fails safe: if a browser distributes differently,
the `min-width` floors still hold and the prose column is still the widest thing on the row.

**Why the scroll finally fires.** Once the floors exist, Σ floors can exceed the container.
`width: 100%` on `.table` is a *preferred* width, not a cap — min-content wins, the table grows
past `.table-wrap`, and the `overflow-x: auto` from §1.5 does the job it was written for. A
13-column table scrolling sideways on a tablet is the correct outcome. A one-word-per-line
column is not.

### 4.1 What this costs

| | |
|---|---|
| New DOM nodes | **0** — a class attribute on cells that already exist |
| Change to `UIC._dtRowHtml` ([:966](UI_Components.html#L966)) | **none** |
| `dom_nodes_per_row` (the performance programme's number, baseline **7**) | **unchanged** |
| Added bytes | one class per **column**, not per cell — 13 for `vf_cash`, not 650 |

### 4.2 Two tiers where the contract must stand down

**Phone (< 600px).** [UI_Components.html:4504](UI_Components.html#L4504) sets
`.table thead { display: none; }` and turns every row into a card. The elements carrying the
contract are not rendered, so the contract is inert on a phone **by construction** — no reset
needed, no second layout path to drift. Asserted anyway, so it stays true.

**Print.** [UI_Components.html:3719](UI_Components.html#L3719) onward restores `display: table`,
brings `thead` back as a `table-header-group`, and sets `.table-wrap { overflow: visible; }`. So
on paper the floors apply again — with **no scroll to offer**, and A4 minus margins is ~718px.
A 13-column table would be clipped, not scrolled. Print must therefore explicitly relax them:

```css
@media print {
  .table thead th.col-text,
  .table thead th.col-prose { min-width: 0; }
  .table thead th.col-atom,
  .table thead th.col-num   { width: auto; }
}
```

On paper, wrapping is the right answer, because there is nowhere to scroll to. This is the one
place the fix must be switched off, and it is easy to miss.

---

## 5. Classification — how a column learns its role without being told

Checked in this order. The first that answers, wins.

1. **Declared.** `{ label: 'البيان', col: 'prose' }`, optionally `min: '30ch'`. Always wins.
2. **Already declared, indirectly.** `money: true` (42 uses) or `numeric: true` (88 uses) → `num`.
3. **Derived from the data.** Sample up to 200 rows of that column's own values:
   - every sampled value ≤ 12 chars **and** contains no space → `atom`
   - p90 length ≥ 24 **or** median word count ≥ 4 → `prose`
   - otherwise → `text`
4. **Derived from the header**, only when every sampled cell is empty or `-` — the label is then
   the only evidence there is.
5. Empty label, or cells containing `<button` / `erp-kebab` → `actions`.

**Why data and not a dictionary.** 703 distinct labels is a dictionary nobody will maintain, and
it would be wrong the first time someone adds an English page or a new module. Measuring the
values that are actually in the column is language-independent, needs no configuration, and is
right on a page that does not exist yet. The label check survives only as the tiebreak for a
column with nothing in it.

**Stability is the trap.** Classify **once**, at `UIC.dataTable()` time, from `originalRows`
([UI_Components.html:909](UI_Components.html#L909)), and store the verdict in `st.cols`.
`theadFor` ([:884](UI_Components.html#L884)) reads the store. Search, sort, paging and the
column-hide menu all re-render the thead — from the same store. A column must never change width
because the user sorted it or turned to page 2.

Across *loads* the verdict can differ (September's descriptions are longer than August's). That
is accepted and stated: it is better than a fixed wrong guess, and it is stable within a render.

---

## 6. Rejected alternatives

| Approach | Why not |
|---|---|
| `table-layout: fixed` + explicit widths | Requires a width for every column of all ~130 tables, and a *new* width every time a page adds a column. It replaces a bad automatic answer with a stale manual one. |
| `<colgroup>` carrying the widths | `min-width` and `white-space` **do not apply** to `<col>` — only `width`, `border`, `background`, `visibility` do. The floor is the whole point, so a colgroup cannot carry it. |
| A class on every `<td>` | Works, but costs 650 attributes on a 13-column, 50-row page and forces a change to `_dtRowHtml`, which the performance programme owns. §4 gets the same result from 13 attributes. |
| `max-width` + ellipsis on atoms | Truncating a document number or a figure destroys the value. Atoms are already minimal; the fix is to stop them *growing*, not to cut them. |
| A `MutationObserver` that types every table automatically | A per-table observer on a tree that chunk-renders 75 rows a frame is a performance regression bought to save one line per raw table. §7 W3 asks for that line instead. |

---

## 7. Phases

**W0 — baseline, no live file touched.**
Add `tables_untyped` and `tables_unwrapped` to `tools/ui_check.js` and record today's values
(**31** and **23**) in `tools/ui_baseline.json`, so the numbers move only in one direction and a
regression announces itself. Record the census of §2 in `UI_BASELINE.md`.

**W1 — the contract, in the shared sheet.**
The CSS of §4 plus the print relaxation of §4.2, into `UI_Components.html`. No page changes. It
is inert until a class appears, so W1 ships alone and changes nothing visible.

**W2 — `UIC.classifyColumns(headers, rows)` and the wiring.**
The §5 classifier, plus `st.cols` and the class emission in `theadFor`
([:884](UI_Components.html#L884)). **All 69 `dataTable` sites get correct widths here, with zero
page edits.** This is the phase that does most of the work.

**W3 — the raw tables.**
`UIC.autoColumns(idOrEl)`: the same classifier run over already-rendered DOM — read the thead
labels and the tbody text, stamp the classes on the `<th>`s. One line per raw table, 31 of them.
In the same pass, wrap the 23 tables of §2 in a `.table-wrap`, which also gives them the sticky
header and horizontal scroll they have never had.

**W4 — the declarations that inference cannot get right.**
Add `col:` / `min:` where the data lies about itself, starting with the five pages that hurt most:
`vf_parties` statement ([:316](Company_ValleyFoods_Parties.html#L316), the screenshot),
`vf_cash` (13 columns, [:183](Company_ValleyFoods_Cash.html#L183)), `vf_purchasing`, `vf_sales`,
`vf_mfg_order_view`.

**W5 — the page-local table classes.**
`grid` (7), `inv-table` (5), `info` (5), `odoo-table` (4) and the 9 singletons adopt the contract
the same way `.card-table` was introduced: an **opt-in class added beside** the page's own class,
with not one existing declaration changed. The precedent and its reasoning are at
[UI_Components.html:4550](UI_Components.html#L4550).

**W6 — optional: clamp long prose.**
`{ col: 'prose', clamp: 2 }` → two lines, ellipsis, full text in `title`. This one **does** cost a
DOM node per prose cell (line-clamp needs an inner element; `display: -webkit-box` on a `<td>`
breaks table layout). Therefore opt-in per column, never a default, and the row-node budget is
spent only where a page asks for it.

**W7 — verification.** §8.

---

## 8. Verification

`tools/verify/s18_table_columns.js`, offline, over the real source, wired into `run_all.js`.

**What is provable offline:**

1. The classifier, **run** against fixtures — Gregorian and Arabic-Indic dates, `13,950.00`,
   `(13,950.00)`, doc numbers, single-word codes, Arabic sentences, empty columns, mixed columns.
2. The classifier run against the **real header/row payloads** of `vf_cash`, `vf_parties` and
   `vf_purchasing`: `البيان` → `prose`, `التاريخ` → `atom`, `المبلغ` → `num`.
3. The **emitted thead** of a real page boot through `tools/verify/pageharness.js` carries the
   classes — asserted on markup the page actually produced, not on the shape of its source text.
4. **Stability:** boot, classify, then sort / search / page / hide a column, and assert the class
   on every remaining `<th>` is byte-identical.
5. **No `.table` without a `.table-wrap`** anywhere in the tree — the W3 invariant, permanently.
6. The phone tier still sets `thead { display: none }`, so the contract is still inert < 600px.
7. The print block relaxes the floors (§4.2) — the failure mode that ships silently otherwise.
8. `dom_nodes_per_row` is still **7**.

**What is not provable offline, stated plainly:** pixels. `tools/verify/domstub.js` has no layout
engine, so no assertion in this repo can prove a column is 26 characters wide. That check is by
eye, in `design_preview/index.html`, at the six real device widths that harness exists for
(`design_preview/README.md`). W7 therefore also adds a **wide-table artboard** — a 13-column
`vf_cash`-shaped table with real Arabic prose — to the preview gallery, and regenerates
`_sources.js` so check C9's fingerprint stays honest.

---

## 9. What this plan does not do

- It does not make a 13-column table fit a 1024px tablet. Nothing can. It makes the table
  **admit** it does not fit, by scrolling, instead of hiding the problem inside a crushed
  column. The real answer to thirteen columns is the column-hide menu that already exists
  (`UIC.columnsMenu`, [UI_Components.html:1408](UI_Components.html#L1408)); this change is what
  makes the need for it visible.
- It does not touch any print template's own column widths (the 35 inline `<th style="width:…">`).
  Those are deliberate, page-sized layouts on paper; W5 leaves them alone.
- It does not change a single body cell, a single row, or `_dtRowHtml`. If it did, it would be
  spending the performance programme's budget, and §4.1 is the whole reason to prefer the
  `<thead>` route.
