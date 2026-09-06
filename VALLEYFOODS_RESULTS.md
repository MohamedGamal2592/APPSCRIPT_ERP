# ValleyFoods manufacturing & cost visibility — results

**Branch:** `feat/valleyfoods-mfg-cost` (13 commits, branched from `perf/optimization-run` at `001d077`)
**Nothing has been pushed, deployed, or written to any spreadsheet.** No schema was changed, no
business-table row was added, edited or deleted, and no Google service was invoked.

Findings **U-43 … U-47** from [UI_UX_INVESTIGATION.md](UI_UX_INVESTIGATION.md) § Group I, specified in
[UI_UX_EXECUTION_PLAN.md](UI_UX_EXECUTION_PLAN.md) § Phase 2B. One new finding, **U-48**, was found
during the work and is reported below, not fixed.

---

## 0. The one thing to read if you read nothing else

**Nothing changes for anyone until you add the `ERP_Pages_Matrix` rows.** The permission ships
inert on purpose. Until a first role holds `valley_cost_view`, the fail-open guard treats every user
as authorised and the app behaves exactly as it does today. See §6 and
[NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md) item 6.

Two things do change immediately on deploy, and both are fixes:

| | |
|---|---|
| Printed manufacturing orders stop showing `0.000` for work-centre costs and start showing the real figures. | S2 |
| The manufacturing save stops taking the cost figure from the browser and reads it from `valley_current_products` instead. | S1 |

---

## 1. What changed, per step

| Step | Commit | What |
|---|---|---|
| **S0** | `4ed800e` | `UIC.openModal` gained a `size` option (`sm` 420 / `md` 560 default / `lg` 880 / `xl` 1100). Purely additive. |
| **S1** | `9deb108` | **U-47.** The manufacturing save resolves `cost_unit` server-side and ignores the client's `unit_cost`. |
| **S2** | `2804a3a` | **U-45.** `getValleyMfgWorkOps_` now returns `work_center_cost` and `total_cost`. Fixes the `0.000` in print. |
| **S3** | `39b74ab` | **U-45.** The on-screen work-ops table shows the same two columns. |
| **S4** | `52a6562` | **U-46.** `valley_cost_view` registered as a permission token: grantable, never navigable. |
| **S5a** | `84eb0ae` | **U-46.** The cost gate + fail-open guard, applied to every manufacturing read. |
| **S5b** | `2e8d711` | **U-46.** Purchasing reads stripped, **plus the save guard that makes stripping safe there**. |
| **S5c** | `2501b07` | **U-46.** Sales audited endpoint by endpoint: it exposes no cost of its own. No production change. |
| **S6a** | `e6201d5` | **U-46.** Client gating on the manufacturing view, print included. |
| **S6b** | `427a08e` | **U-46.** Client gating on the purchasing and manufacturing-orders pages. |
| **S7** | `77f2362` | **U-44.** The FIFO batch modal, on `UIC.openModal`, and the quantity-change drift closed. |
| **S8** | `0b61c44` | **U-43.** Compact material rows, per-row re-render, no empty batch table. |
| — | `a0d11ce` | The offline design preview and a single-command check runner. |

Every step is one commit except S5 (three: manufacturing / purchasing / sales) and S6 (two).

### S0 — modal `size`

`UIC.MODAL_SIZES` maps `sm`/`md`/`lg`/`xl` to a class suffix, and **`md` maps to the empty string**.
A caller that passes no `size` — or `size:'md'`, or an unrecognised size — produces byte-identical
markup to before: the class attribute stays the literal `"modal"`. The CSS additions live inside the
existing `@media (min-width: 640px)` block, so the 560px default and the full-width mobile bottom
sheet are untouched. There are **78 call sites across 49 pages** and none passes `size` today.

### S1 — the save resolves cost server-side ⚠️ *the sequencing guard*

`saveValleyMfgOrder_` used to write `cost_unit` straight from the request payload. It now builds
`footerBatchCost`, a batch-uid → `unit_cost` map read from `valley_current_products` — the same source
and the same lookup shape the read path already uses — and writes `footerBatchCost[item] || 0`.

**This had to land before S5.** Once the cost columns are stripped from the read, a user without the
grant would have sent no `unit_cost` at all, and the old line would have written `''` into
`cost_unit` for every consumption row they touched. That would have cascaded: `total_cost` is a sheet
formula `=G*F` over `cost_unit`, the output's `cost_unit`/`total_cost` are `SUMIFS` over the footer
columns, and the order's `total_batch_cost` follows those. One save by one user without the
permission would have zeroed the costing of an entire manufacturing order, silently.

The lookup always resolves: `assertFooterBalances_`, which runs before any write, already throws for
any footer batch uid it cannot find a balance for in `valley_current_products`.

### S2 / S3 — work-centre costs

Both columns exist in `valley_manufacture_work_center` and are populated by sheet formulas
(`work_center_cost` by an `INDEX/MATCH` on `valley_work_centers`, `total_cost` by `=K*J`). The read
projection simply omitted them, so `fmt3(undefined)` printed `0.000` on **every manufacturing order
ever printed**. Two fields added to the projection, two read-only columns added on screen.

They are coerced with `Number(x) || 0` rather than passed through raw, so a formula that errors
(`#N/A` after a work centre is deleted) reads `0` instead of reaching the formatter as a string and
printing `NaN`. Unsaved work-op rows show a dash, not `0.000`, because the formulas do not exist
until the row is written.

### S4 — the permission token

`valley_cost_view` is registered in `Company_ValleyFoods_Registry.js` with `nav: false`,
`permissionOnly: true`, an Arabic label, and **deliberately no template**. Two guards keep a
template-less entry from ever being navigated to:

- `Code.js` — the router's page lookup now requires a template. Without this,
  `?action=valley_cost_view` would have reached `createTemplateFromFile(undefined)` and thrown a raw
  error page. It now bounces home exactly like an unknown action.
- `03_Security.js` — `getFirstAuthorizedPageForUser_` skips template-less entries. It picks the
  post-login landing page and the access-denied back link, and a user granted little else would
  otherwise have been sent to an action the router refuses to render.

Every existing page has a template, so nothing else is affected.

### S5 — server-enforced cost stripping

The gate lives in one place and all three modules share it:

- `vfCanSeeCost_(user)` — true for a super admin, for `write`/`full` on `valley_cost_view`, **or** when
  the fail-open guard applies.
- `vfCostGrantUnused_()` — **the fail-open guard.** True when no role anywhere in `ERP_Pages_Matrix`
  holds an *active* grant on `valley_cost_view`. Cached under the same `version_matrix` stamp
  `getRoleAuthorityMatrix_` uses, so your first grant (which bumps it) takes effect at once rather
  than after the TTL. Logged on the computed path only, so it appears once per cache window rather
  than on every request. A matrix that cannot be read also fails open — the safe direction, since the
  alternative is blanking every figure in the company on a transient read error.
- `vfStripCost_` / `vfStripCostAll_` — **delete** the keys. Never zero them.

**Omit, never zero.** A zero is indistinguishable from a genuine zero cost and renders as a figure.
An absent key lets the client tell "not permitted" from "costs nothing", and that is what the client
gating in S6 keys on.

**Nothing the workflow needs is stripped.** Quantities, `batch_uid`, `lot`, availability, dates and
statuses all stay, so a user without the grant can still allocate batches and save a manufacturing
order — which is exactly why S1 came first.

Converted, with the fields removed:

| Endpoint | Removed |
|---|---|
| `get_valley_mfg_order_full` / `_detail` | order: `total_inventory_cost`, `total_other_cost`, `total_batch_cost`, `by_product_nrv_value`; outputs: `cost_unit`, `total_cost`; footers: `unit_cost`, `total_cost` |
| `get_valley_mfg_workops` | `work_center_cost`, `total_cost` |
| `get_valley_mfg_byproducts`, `add_valley_mfg_byproduct` | `total_cost` |
| `get_valley_product_batches`, `..._multi` | `unit_cost` |
| `get_valley_purchasing_costing` | the 21 landed-cost columns (`Value`, `Total costs`, `Sales Value`, every expense and tax column, `Minimum differences`, …) |
| `get_valley_purchasing_lines` | `unit_price`, `other_cost`, `total_cost`, `unit_cost`, `purchase_unit_cost`, `cost_currency`, `sales_value`, `sales_value_amount` |

Audited and deliberately **not** stripped: `getValleyMfgOrders_` (its list projection carries no
cost), `controlValleyMfgWorkOp_` and `saveValleyMfgWorkOp_` (their responses carry none), and every
sales endpoint (§4).

`get_valley_product_batches` caches by product, not by user, so it is stripped **after** the cache
read, never before. (Nothing writes that cache key today — the `put` was already missing — but the
gate holds if one is ever added.)

### S5b — the purchasing save guard, and why it refuses rather than preserves

**This is the one behaviour change you should weigh.**

`saveValleyPurchasingCosting_` writes every header column straight from the payload
(`record[col] = hdr[col]`, blank when absent) and rewrites the whole line set. Once the read strips
the cost columns, a caller without the grant holds none of them — so an ordinary save would blank the
entire landed-cost document. That is U-47's silent wipe, at document scale. A test demonstrates it
rather than asserting it: feeding the stripped payload through this handler's own header builder
blanks all 21 cost columns (`Total costs` 12480 → `''`).

Two alternatives were considered and rejected:

- *Resolve cost server-side, as S1 did for manufacturing.* Impossible here — there is no authority. A
  person types these figures.
- *Preserve the stored values on save.* Not reliably possible — the lines are deleted and re-created
  with fresh `unique_id`s on every save, so there is no stable identity to preserve against, and
  matching positionally or by product+lot would be a guess about costing data.

So the handler **refuses the write** when the caller cannot see costs, with a clear Arabic message,
before it touches anything. The client follows suit: without the grant the add and edit affordances
are not offered, since offering a form that cannot be saved would be worse.

**Consequence:** once you grant `valley_cost_view` to a first role, users in roles *without* it can
view, print and approve purchasing documents but can no longer edit them. Approval is deliberately
**not** gated — it writes only `approval_status`/`approval`/`approval_time` and cannot wipe a figure.

If you would rather cost-blind users kept editing purchasing, say so — the alternative is to leave
purchasing costs un-stripped, which means they keep reaching the browser.

### S6 — client-side gating

The server sends `can_see_cost` on the seven responses the four pages read. **The browser does not
re-derive this from `USER_PAGES`**, because it cannot see the fail-open guard and would hide figures
the server deliberately sent. `CAN_SEE_COST` defaults to `true`, so a response without the flag
behaves exactly as today.

Hidden without the grant: the two work-ops cost columns, the four cost KPI tiles, the consumed-batch
`إجمالي التكلفة` column, the per-material cost total, the by-product `التكلفة` column and form field,
the purchasing list's `إجمالي التكاليف`, and the purchasing view/print cost rows and line columns.
Quantities are never hidden.

Two smaller fixes came with it: `refreshFooterRow_` wrote the line-total cell by index (`cells[4]`),
which without the cost column is the delete button, so it is now guarded; and the save payload no
longer sends `unit_cost` at all, since S1 made the server ignore it.

### **The print inherits this for free — this is intended, not a bug**

The manufacturing print is generated client-side from data the page already holds. A user **with**
the grant prints an order with costs; a user **without** it prints the same order with quantities
only. Nothing separate was built for it and nothing needs to be. Please do not report it as a defect
later — it is the correct behaviour and it is why the boundary is server-side.

### S7 — the FIFO batch modal

**+ دفعة** used to push a blank row into the table. It now opens a modal built on `UIC.openModal`
with `size: 'lg'` — no bespoke dialog, no page-local overlay, no hardcoded width.

**There is still only one FIFO.** `autoAllocFifo_` and the modal both go through `fifoFill_`, so
oldest-first allocation cannot drift between them. `fifoFill_` takes an optional map of allocations
the user already made by hand: those are honoured in batch order and count against the requirement,
and only the **shortfall** is filled — your "if there already chosen batches it continue".

- Rows: lot / `transaction_code`, available, allocated (editable), remaining, oldest-first. Unit cost
  and line total only with the cost grant. A batch that is allocated but no longer offered still gets
  a row, so a saved allocation cannot vanish silently.
- Running total: `مجموع الدفعات: X من Y`, green tick when matched, red naming the shortfall or excess.
- **Tolerance mirrors the server exactly** — both round to 3 decimals and compare
  `Math.abs(sum − qty) > 0.01`. A looser client tolerance would accept allocations the save rejects.
- Over-allocation is flagged on the row, and the message says the shown availability is indicative
  and the server checks it against real batch balances on save.
- Confirm is disabled until matched (and refuses even if called directly). Cancel leaves the existing
  allocation untouched.
- Typing does not re-render the table: only the row's remaining, its line total, the running total and
  the confirm button update, so the input keeps focus and caret.

**The silent drift is closed.** `setOutputQty` used to skip re-allocation entirely once any batch had
been allocated by hand, so quantity and batches drifted apart until the save threw. Now: nothing
allocated → full FIFO as before; allocated short → keep every hand-made allocation and fill the
shortfall oldest-first; allocated **over** → say so, because silently discarding somebody's own
allocation would be worse than telling them.

### S8 — material entry

`drawOutputs()` was one map producing a full card per material and one `innerHTML` assignment over the
lot, which is what destroyed the combo being typed into. It is now split into a per-row builder, a
per-row re-render and an append path, and **every keystroke path re-renders only the row that
changed** — the same in-place discipline `Company_TopLight_Sales.html:318-330` already applies.
Adding a material appends a row and touches nothing else.

The batch sub-table, its heading and **+ دفعة** appear only once a product *and* a quantity exist. The
`لا توجد دفعات مسجلة` table that rendered before anything had been entered is gone; with a product and
quantity but no batches yet, the row prompts towards **+ دفعة**.

Every row carries a summary: material, quantity, batches allocated (count and sum), an
allocated / short / over indicator, and — only with the cost grant — the total cost. The indicator
uses the same 0.01 tolerance as the modal and the server, so what the row says and what the save will
accept cannot disagree.

---

## 2. Verification — what was actually checked, and how

There is no browser and no staging environment, so everything below is offline, over the **real**
source. One command runs it all:

```bash
cd d:/Work/Script
node tools/verify/run_all.js      # 11 checks
```

All 11 pass. `tools/**` and `design_preview/**` are in `.claspignore` and can never be deployed.

| Check | What it proves |
|---|---|
| `parse_pages.js` | The inline `<script>` of all five templates plus the preview parses. |
| `s0_modal_size.js` | **9/9 markup cases byte-identical** before vs after — bare, title-only, title+body, `onSave`, `footer:false`, embedded quotes, explicit `md`, unknown size, `size:undefined`. The pre-change template is regenerated in the test, not hardcoded. |
| `s1_save_cost.js` | The footer-row builder lifted from the real source, run twice over one payload with deliberately wrong costs (999.99, blank, 4242). **Exactly one field differs across all rows, and it is `cost_unit`**: 999.99 → 12.5, `''` → 7.25, genuine 0 stays 0. `unique_id`, `item`, `item_code`, `qty`, `user`, `created_at` byte-identical. |
| `s2_workops_cost.js` | The real projection over fixture rows: both keys present and carried. Degenerate sheet values never print `NaN` — `#N/A` → `0.000`, `''` → `0.000`, `'12.5'` → `12.500`. Before/after through the print formatter: omitted → `0.000` (the bug), present → `37.500` (the fix). |
| `s4_cost_page.js` | The registry evaluated for real: registered once, `nav:false`, no template, last in the array, and the **only** template-less entry among 30. Both router guards present. Nav list is `[vf_dashboard, vf_kpi]` — the token is not in it. |
| `s5_cost_strip.js` | The gate: super admin ✓, `write` ✓, `full` ✓, **`read` ✗**, no grant ✗. Fail-open: unused → everyone still sees costs, logged once per cache window; one active grant flips it live; an `inactive` row does not count; an unreadable matrix fails open. **The differential test**: every converted projection run twice over identical fixtures — the responses differ **only** in cost keys, no shared key changed value, and no key appears only in the no-grant response. FIFO over the stripped batches allocates identically. |
| `s5c_sales_audit.js` | All seven sales read endpoints project no cost key; all three sales sheets have no cost column. Also establishes **U-48** (§5). |
| `s6_client_gate.js` | **Real rendered markup.** The same order loaded twice: work ops 8 headers = 8 cells with the grant, 6 = 6 without; the batch table and by-products each lose exactly one column; all four cost tiles disappear and the quantity tile stays. Eight specific figures (37.5, 150.000, 12.500, 7.250, 1975, 88.25, 290, 19.75) appear **nowhere** in the no-grant markup, with no `0.000` standing in. |
| `s6b_list_gate.js` | Purchasing 8→7 columns, by-products 4→3. `12,480` and `88.25` gone; `PC-003`, `Acme`, `2026-03-01`, `بذور` still there. Add/edit offered with the grant, absent without; view, print and approve present in both. |
| `s7_batch_modal.js` | **One FIFO**: `fifoFill_(b,q,null)` compared against the original `autoAllocFifo_` body over **400 deterministic randomised cases** — identical allocations, order and rounding. **Tolerance** asserted against the server's source and probed at the boundary: ±0.01 match, ±0.011 do not. Opening with nothing allocated proposes 100/50/0; opening with 40 hand-picked from the *newest* batch keeps that 40 and fills the 110 shortfall from the two oldest. Cancel leaves `OUTPUT_FOOTERS` byte-identical. Mismatched confirm changes nothing. Without the grant, FIFO still proposes a matching allocation. |
| `s8_material_rows.js` | `setOutputQty`, `addFooterRow`, `removeFooterRow` and the modal's confirm all leave `#outputs-body` **byte-identical** while changing the row. `addOutput` leaves `#outputs-body` *and* row 0 byte-identical and appends `#out-row-1` — that is the combo-destruction bug, closed. No table before a product and quantity exist. Indicator: matched / `ينقص 30.000` / `يزيد 40.000`, with the same ±0.01 boundary. |

**How the page tests work.** `tools/verify/pageharness.js` boots the real template and the real
`UI_Components.html` in one sandbox over a small DOM stub, substitutes the Apps Script scriptlets and
routes `companyCall` to fixtures, so the page's own draw functions run and the test reads the HTML
they produce. The stub makes ids written into `innerHTML` addressable, which is what makes "only the
changed row re-rendered" a *behavioural* assertion rather than a source-grep. Where a function is
closure-private, the harness appends an export line to the **loaded copy** of the template — the file
on disk is never modified.

**What the tests cannot tell you.** They are not a browser: no layout, no CSS, no real events. They
cannot tell you the modal is centred, that Arabic RTL reads correctly, or that a column is too narrow
on a phone. That is what §7 is for.

---

## 3. Assumptions made

1. **`getAllRecords_` returns freshly built objects per call.** Verified in `buildRecordsFromRaw_` —
   it constructs a new array of new objects every time, so `delete`-ing keys affects only that
   response and cannot poison the request memo.
2. **`user.authorizedPages` is `{ page_id: ['read'|'write'|'full'] }`.** Read from
   `getRoleAuthorityMatrix_`, which normalises `full access`/`full_access`/`fullaccess` to `full` and
   anything unrecognised to `read`.
3. **A `read` grant on `valley_cost_view` does not show costs.** The decision says `write` or `full`;
   `read` is treated as not permitted, and the test asserts it.
4. **`version_matrix` is bumped when the matrix is saved.** `adminSaveMatrix_` calls
   `bumpVersion_('ERP_Pages_Matrix')`, which sets it. This is what makes the fail-open flip promptly.
5. **Logging "once" means once per cache window (300s)**, not once per process. Logging on every call
   would flood the log; the fail-open branch only logs when it actually recomputes.
6. **Sales invoice values are not costs.** `product_price`, `المبلغ الصافي`, `قيمة الضريبة`, `إجمالي`
   and `valley_return_value` are what the customer is billed. Hiding them would make the sales module
   unusable and answers a question you did not ask. If you *do* want them hidden, that is a new
   decision, not a bug in this one.
7. **`abnormal_amount` on the manufacturing header was left visible.** It is not in the specified
   field list and it is not obviously a cost. Flagging rather than guessing.
8. **The by-product `total_cost` input can be hidden safely** because that column is a sheet formula,
   so whatever the client sends is overwritten. Verified in `byproductFormulaMap_`.
9. **Purchasing's landed-cost column list** was taken from `PURCHASING_COSTING_HEADERS` and split by
   reading each column name. `Currency`, `Exchange rate`, `month`, `Year`, `Supplier Name`,
   `Associated bank`, `Type`, `Shipping Type`, `Items` and the approval columns were judged
   identity/workflow, not cost, and are kept. Tell me if you would draw that line differently.

---

## 4. What was skipped, and why

| Item | Why |
|---|---|
| **The `ERP_Pages_Matrix` and `ERP_System_Pages` rows** | Business data. Yours, via the admin UI. The fail-open guard exists precisely so the code is safe before they exist. |
| **Any deploy, push, or Google service** | Hard constraint. `clasp` was never run; no trigger, Script Property or server function was touched. |
| **Sales cost stripping** | Audited and found unnecessary — sales exposes no cost of its own (§5c). No production code changed there. |
| **The legacy recipe-driven consumption branch in the save** | It never set `cost_unit` and never read `f.unit_cost`, so it carries no wipe risk. Left exactly as it was. |
| **U-48** (below) | A real, pre-existing defect, outside S0–S9, and the fix is a decision rather than a patch. |
| **A double-clickable design preview** | Not achievable while loading the real shared files — see §7. |

---

## 5. U-48 — a defect found on the way, reported and **not** fixed ⭐

**`saveValleyInvoice_` cannot complete. The ValleyFoods sales invoice save throws before it writes
anything.**

The handler reads an identifier `outputs` that is declared **nowhere**: not in the function, not at
IIFE level, not at file level, and no implicit-global assignment creates it anywhere in the project.
Reading an undeclared identifier throws `ReferenceError` under V8, and the reference sits **before**
the handler takes its write lock.

```js
/* M3: output costing — simple average across outputs */
var totalOutQty = 0;
outputs.forEach(function (o) { totalOutQty += Number(o.qty || 0); });   // <- outputs is not defined
```

The block is dead costing computation (M2/M3, apparently copied from the manufacturing handler):
`avgCostUnit` is assigned onto `outputs` and never read again, and no sales sheet has a column to hold
it — `valley_sales_product_stock` is `unique_id, id, valley_sales_products_id, product_unique_id,
product_transaction_code, product_qty, user, created_at`.

`git log -L` on those lines dates them to the **initial commit**. This is not from the performance
programme and not from this run.

**Not fixed here** because it is outside S0–S9 and the choice is yours: delete the dead block (the
save starts working, and nothing is lost because nothing consumed those values), or implement
invoice-level costing properly (which needs columns, and columns are a schema change). The six
assertions that establish it are in `tools/verify/s5c_sales_audit.js`.

**Worth knowing:** if sales invoices *are* being saved successfully in production today, then one of
my premises is wrong and I would want to know which — that is the one place in this report where a
live check would settle it faster than any amount of reading.

---

## 6. Blocked on you

> **Add `ERP_Pages_Matrix` rows granting `write` on `valley_cost_view`** to every role that should see
> costs, via `ERP_Management` → صلاحيات الأدوار. Until then the fail-open guard leaves costs visible to
> everyone, which is today's behaviour, so nothing breaks — but the permission is not yet doing
> anything.

It is a **two-part** step, because the role screen lists pages from the `ERP_System_Pages` sheet, not
from the registry:

1. `ERP_Management` → **صفحات النظام**. `valley_cost_view` now appears in that screen's list (it comes
   from `getAllPages_()`); save it so the `ERP_System_Pages` row exists.
2. `ERP_Management` → **صلاحيات الأدوار**. Grant `write` on `valley_cost_view` to each role that should
   see costs.

**Verify it:** grant it to one role, then sign in as a user in a role *without* it and confirm the
cost columns are gone **and absent from the network response** — open devtools → Network → the
`company_action` call, and check the JSON has no `unit_cost` / `total_cost` / `work_center_cost` keys
at all. Screen-only checking is not enough; the point of this work is that the values never reach the
browser.

Also note §5b: after that first grant, roles without it lose the ability to *edit* purchasing
documents (they keep view, print and approve).

---

## 7. Your visual checklist, after you push

The tests cannot see a browser. These are the things only you can confirm, stated as specific
outcomes rather than "check it looks right".

**Manufacturing — costs**
1. Print a manufacturing order that has work centres. The **تكلفة المركز** and **الإجمالي** columns show
   real figures, **not `0.000`**.
2. Open the same order on screen, الورديات/التشغيل tab: the same two columns are there, read-only, and
   match the printed ones.
3. A work op you have just added but not yet saved shows **—** in those two columns, not `0.000`.

**Manufacturing — the batch modal**
4. On a material with a product and a quantity, press **+ دفعة**. A wide modal opens with batches
   **already proposed, oldest first**, and the running total reads `مجموع الدفعات: X من Y` with a green
   tick.
5. Change one allocated number so the total no longer matches. The line turns red and names the
   shortfall or excess, and **تأكيد becomes unclickable**. Restore it and تأكيد comes back.
6. Allocate more than a batch's available quantity: that row's remaining goes red and a warning says
   the server checks real balances on save.
7. Press **إلغاء**. The batch table underneath is exactly as it was.
8. Allocate by hand, then change the material's quantity **upward**: your hand-made allocation is kept
   and the shortfall fills itself. Change it **downward** below what is allocated: you get a warning
   instead of silence.

**Manufacturing — material entry**
9. With two or more materials on the order, start typing in the second material's product combo, then
   press **+ خامة داخلة**. The combo you were typing in **keeps its text and focus**.
10. A brand-new material row shows only product, quantity and delete — **no empty batch table**, and no
    "لا توجد دفعات مسجلة".
11. Each material row shows its quantity, how many batches are allocated, and a green
    **الدفعات مطابقة** or a red **ينقص / يزيد** — *before* you press save, not at it.

**The permission** *(only after the matrix rows exist — §6)*
12. As a user **with** the grant: costs appear everywhere they do today.
13. As a user in a role **without** it: cost columns, cost tiles and cost totals are gone; quantities,
    batches, dates and statuses are all still there.
14. Same user, devtools → Network → the `company_action` response: **no cost values anywhere in the
    JSON.** Not zeros — the keys are absent.
15. Same user: printing a manufacturing order gives quantities only. **This is intended** (§S6).
16. Same user on المشتريات: the list has no إجمالي التكاليف column, and **+ إضافة عملية شراء** and تعديل
    are not offered — but عرض, طباعة and اعتماد still are.
17. Same user: allocating batches and **saving** a manufacturing order still works, and afterwards the
    `cost_unit` values in `valley_manufacture_footer` are **unchanged and non-empty**. This is the one
    that would have been catastrophic without S1 — worth checking on a real order.

**The offline preview** (no push needed, and it writes nothing)
```bash
cd d:/Work/Script && python -m http.server 8000
# then open http://localhost:8000/design_preview/vf_mfg_batch.html
```
It loads the **real** `UI_Components.html`, `CSS_Tokens.html` and the real manufacturing page with
fixture data, and has a toggle for the cost grant and four material scenarios. Double-clicking the
file shows a red banner with these commands instead of a broken page: it deliberately keeps no copies
of the shared files, and browsers refuse `file://` reads from a `file://` page. Embedding copies would
have made the double-click work and made the preview a lie the first time either shared file changed.

---

## 8. Rollback

Everything is on `feat/valleyfoods-mfg-cost` and nothing else depends on it.

```bash
# the whole run
git checkout perf/optimization-run

# one step, keeping the rest (works in any order — the commits are independent)
git revert 0b61c44        # S8  material entry
git revert 77f2362        # S7  batch modal
git revert 427a08e e6201d5   # S6  client gating
git revert 2501b07 2e8d711 84eb0ae   # S5  cost stripping
git revert 52a6562        # S4  the permission token
git revert 39b74ab        # S3  on-screen work-op costs
git revert 2804a3a        # S2  work-op costs in the response
git revert 9deb108        # S1  server-resolved cost_unit
git revert 4ed800e        # S0  modal size
```

**If you revert only part of it, keep this order in mind:** reverting **S1** while keeping **S5** or
**S6** re-creates the silent wipe — a user without the grant would save `''` into `cost_unit`. Revert
S5 and S6 first, or keep S1.

**S1 and S2 are worth keeping even if you revert everything else.** S2 fixes `0.000` on every printed
order; S1 closes a hole where anything calling the endpoint could set costs freely.

---

## 9. Files touched

| File | Steps |
|---|---|
| `UI_Components.html` | S0, S7 (`size`, and `footer` as markup — both additive) |
| `Company_ValleyFoods_Actions.js` | S1, S2, S5a, S5b, S6 (`can_see_cost`) |
| `Company_ValleyFoods_Registry.js` | S4 |
| `Code.js` | S4 (router guard) |
| `03_Security.js` | S4 (landing-page guard) |
| `Company_ValleyFoods_MfgOrderView.html` | S3, S6a, S7, S8 |
| `Company_ValleyFoods_MfgOrders.html` | S6b |
| `Company_ValleyFoods_Purchasing.html` | S6b |
| `Company_ValleyFoods_Sales.html` | **untouched** — audited, nothing to hide |
| `.claspignore` | `tools/**`, `design_preview/**` |
| `tools/verify/**`, `design_preview/**` | new, never deployed |

No schema, no data, no deployment.
