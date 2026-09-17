# حركة المخزن — `valley_warehouse_movement` — agent prompt

Build **one new page** for Valley Foods: manual warehouse stock movement (issue / internal
receipt-return), on top of a table that **already exists** in production.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows, and ships no
edit or delete path on the new page.

---

## Read these first, in full, before touching anything

1. **[VALLEY_WAREHOUSE_MOVEMENT_PLAN.md](VALLEY_WAREHOUSE_MOVEMENT_PLAN.md)** — your specification.
   It carries the verified column list, the two sheet formulas, the enum strings, the availability
   formula and the two open questions. **This prompt orients you; the plan decides.**
2. **`Company_ValleyFoods_Cash.html`** — the page you are copying the shape of: list + add modal,
   single table, no header/lines split.
3. **`Company_ValleyFoods_Actions.js`**, the finance block around `FIN_CASH_SHEET` (~L5676) and
   `getValleyProductBatches_` (~L6155) — the two handlers yours are modelled on.
4. **`tools/verify/run_all.js`** — the offline check suite you will extend.

Verify a `file:line` reference before you edit it. Line numbers in this prompt were taken at
HEAD `43ec072` and drift with every commit — confirm each one yourself.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema

No column may be **added, renamed, removed, reordered, or retyped** in any business table, in any of
the three company spreadsheets or the auth spreadsheet. No new sheet, no new tab.

`valley_warehouse_movement` already exists with **exactly 17 physical columns** — the plan lists them
in order. Every column this page needs is already there.

**This constraint has one specific trap.** `settingsEnsureSheet_()`
(`Company_ValleyFoods_Actions.js` ~L2432) *appends any header it thinks is missing*. Called on this
sheet with one typo — `movement_sign` for `movmenent_sign`, say, which is misspelled in production —
it silently adds an 18th column to a live table. **Do not call it on this sheet.** Read the headers,
assert them, and throw an Arabic error if they do not match. That assertion is a deliverable, not a
nicety: the `item_code` and `movmenent_sign` formulas are positional.

## 2. NEVER add, edit, or delete data in any business table

No writing rows. No updating cells. No deleting rows. No backfills. No test records. No seed data.
Not by hand, not by script, not via `clasp run`, not via a one-off function you write and execute.

**This includes `ERP_Pages_Matrix`.** Granting `vf_warehouse_movement` to a role means adding rows to
that sheet. **You must not do it** — it is the owner's step, through the admin UI. Registering the
page in `Company_ValleyFoods_Registry.js` is enough to make it appear in «صفحات النظام»; a
super-admin can open it immediately, and everyone else waits for the owner's grant.

The only writes this run may ever cause are the ones your **new save handler** performs when a real
user clicks Save in the running app, after the owner deploys. You are not to invoke it yourself.

## 3. The page is add-only

Ship **add + list**. No edit path, no delete path, no approve toggle, no bulk import. Do not write
`save_..._update`, `delete_valley_warehouse_movement`, or a row kebab that offers either.

This mirrors the cash page, where editing an existing movement is super-admin-only and deletion is
`full` — and it keeps a stock ledger append-only, which is what a stock ledger should be. If the
owner wants correction later, it gets designed then; a `منصرف` cancelled by a matching
`وارد داخلي / مرتجع للمخزن` is already the correct answer in this model.

## 4. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never create or
promote a deployment. Never run `clasp login`, `clasp run`, or `clasp open`. Never push to `origin`.
**The owner edits locally and pushes when everything is finished.**

## 5. NEVER touch the owner's Google account

No triggers, no Script Properties, no running `dailyCsvBackup`, `inventorySpreadsheets()`,
`archiveOldRecords()` or any other server function.

## 6. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend function
signature, every existing response shape, every HTML anchor id.

This run is **purely additive**. You add a template, three handlers, three registration lines, one
registry entry, one nav entry and one verify script. You change **no existing behaviour**. If a step
seems to require editing an existing handler, stop and write it up instead.

## 7. Stay inside your file set

Files you may create or modify:

```
Company_ValleyFoods_WarehouseMovement.html   (new)
Company_ValleyFoods_Actions.js               (additive only)
Company_ValleyFoods_Registry.js              (one pages[] entry)
Company_ValleyFoods_Nav.html                 (one menu item)
tools/verify/s12_warehouse_movement.js       (new)
tools/verify/run_all.js                      (one STEPS line)
WAREHOUSE_MOVEMENT_RESULTS.md                (new, at the end)
```

Nothing else. The working tree carries **another effort's uncommitted work** — see below. Leave it
alone.

---

## Starting state

```bash
cd d:/Work/Script
git branch --show-current      # feat/tc-box-analysis at time of writing
git log --oneline -3           # 43ec072 build(ui): deployment smoke test …
git status --porcelain
```

`git status` will show modified `Company_TopLight_Sales.html`,
`Company_TopLight_Sales_Returns.html`, `design_preview/_sources.js`, and untracked
`BOX_ANALYSIS_*.md`, `Box_analysis_prompt.md`, `VALLEYFOODS_RUN_PROMPT.md`,
`tools/verify/fixtures/`, `tools/verify/s11_sales_returns.js`. **All of that belongs to other
work. Do not stage it, do not revert it, do not "clean up" the tree.**

**Create your branch from HEAD and stay on it:**

```bash
git checkout -b feat/vf-warehouse-movement
```

**For every commit: stage explicit paths only.** Never `git add -A`, never `git add .`, never
`git commit -a`. Do not push. Do not rebase. Do not merge.

---

## Decisions already made by the owner — do not re-ask

| Decision | Answer |
|---|---|
| Enum values | Exactly `منصرف` and `وارد داخلي / مرتجع للمخزن`. Two values, no third, no "other". |
| Sign formula | `=IF(J{r}="وارد داخلي / مرتجع للمخزن", H{r}, H{r}*-1)` — compares the **full** enum string. A version comparing `"وارد"` makes every row negative and is wrong. |
| `warehouse` | Constant `مخزن مصنع فالي فودز`. Never rendered, never editable. |
| `asset_target` | Always written as `''`. Never rendered. |
| `item` | A **batch** — `valley_current_products.unique_id` — not a product id. One searchable combo over batches, like the sales batch picker. |
| `amount` | `batch.unit_cost × qty`, computed **server-side** and stored as a static value. Not a formula, not a client-supplied number. |
| `unit` | Taken from the chosen batch (`valley_current_products.unit`), falling back to `valley_products.unit` via the batch's `product_id`. |
| `responsible_person` | Ref to `valley_employee_info`: `emp_id` stored, `name` shown. |
| Page id / template | `vf_warehouse_movement` / `Company_ValleyFoods_WarehouseMovement`. |
| Nav placement | Group `الادارة المالية`, after `المشتريات`. |
| Cost visibility | `amount` and `unit_cost` are cost figures. They go behind the existing `valley_cost_view` gate, **server-enforced** — stripped from the response, not hidden with CSS. |
| Scope | Add + list only. See hard constraint 3. |

---

## Your task

Six steps, in order. Each is one commit. **W1 before W2 before W3** — the server contract exists
before the page that calls it, so the page is never written against a guess.

### W0 — Recon (no edits)

Confirm, and write the answers into your notes:

1. The current physical header row of `valley_warehouse_movement` **as the plan states it** — you
   cannot read the sheet, so confirm against `appsheet_old_project.html`
   § `table_valley_warehouse_movement_Schema` and the plan's table. Note that `user_name` and
   `product_current` are **virtual** in the legacy app and are not sheet columns.
2. The exact signatures of `getSheet_`, `getHeaders_`, `getAllRecords_`, `saveRecordWithAudit_`,
   `writeRowFormulas_`, `getNextIdUnderLock_`, `parseDate_`, `vfPage_`, `vfCanSeeCost_`,
   `vfStripCostAll_`, `vfRefsCached_` (`02_DataAccess.js`, `Company_ValleyFoods_Actions.js`).
3. How `getValleyProductBatches_` computes availability, line by line — you are generalising it.
4. How `UIC.combo` returns its value (hidden input at `#<key>`, display input at `#<key>_display`).

No commit.

### W1 — Server: the three handlers *(one commit)*

Additive block in `Company_ValleyFoods_Actions.js`, next to the finance handlers.

Constants exactly as the plan §2 lists them: `WH_MOVE_SHEET`, `WH_MOVE_HEADERS` (17, in order),
`WH_WAREHOUSE`, `WH_MOVE_TYPES`, `WH_IN_TYPE`.

A header assertion helper — **not `settingsEnsureSheet_`**:

```js
/* Positional: F=item_code and K=movmenent_sign are written as formulas, so a
   reordered sheet must fail loudly rather than write a formula into the wrong
   column. Never appends — this is a production table. */
function whAssertHeaders_(sheet) { /* compare getHeaders_(sheet) to WH_MOVE_HEADERS, throw Arabic on mismatch */ }
```

Then:

- **`getValleyWarehouseMovements_`** — list. `vfPage_(rows, data, 'movement_date')`, resolved labels
  for vendor / batch / responsible person, cost keys stripped unless `vfCanSeeCost_(user)`.
  Add `warehouse_move: ['amount', 'unit_cost']` to `VF_COST_KEYS`.
- **`getValleyWarehouseMoveOptions_`** — one round trip returning vendors, employees and available
  batches. Availability exactly as plan §2.2. Only `available > 0` is offered.
- **`saveValleyWarehouseMovement_`** — the six validations of plan §2.3, in that order, Arabic
  messages. The over-issue check for `منصرف` is **recomputed server-side**; a client-sent
  `available` or `amount` is ignored entirely. Write with `saveRecordWithAudit_(…, 'create', …,
  'id')`, then one `writeRowFormulas_` for `{item_code, movmenent_sign}`.

Register in all three places: `ACTION_PAGES`, `ACTION_TABLES`, and the `ValleyFoods.register(...)`
tail block.

Verify: `node --check Company_ValleyFoods_Actions.js`, plus the W5 test file if you have it by then.

### W2 — Registry and nav *(one commit)*

One `pages[]` entry in `Company_ValleyFoods_Registry.js`, one item in `Company_ValleyFoods_Nav.html`.
Both exactly as plan §3. `nav: false`, like every other Valley page — the nav file is the menu.

No `ERP_Pages_Matrix` row. Say so in the commit message.

### W3 — The page *(one commit)*

`Company_ValleyFoods_WarehouseMovement.html`, per plan §4. Copy the head, the `companyCall`
wrapper, `esc`, `todayStr` and the app-shell call from `Company_ValleyFoods_SalesReturns.html` —
they are the house boilerplate, and diverging from them is how pages break.

The form: `UIC.combo` for vendor / batch / movement type / responsible person, `UIC.field` for qty,
date and notes, `UIC.openModal` + `UIC.validateForm`. Selecting a batch fills a read-only unit and
shows **المتاح**; qty × unit cost drives a live **القيمة** preview. `منصرف` blocks qty above
available in the browser too — as an ergonomic, never as the enforcement.

**No `warehouse` field. No `asset_target` field. No edit button. No delete button.**

### W4 — Cost gating, proven *(fold into W3 if it is small)*

Without `valley_cost_view`, `amount` and `unit_cost` must be **absent from the JSON**, not merely
unrendered. The page must render correctly with those keys missing — no `NaN`, no `undefined`, no
empty column header hanging over nothing.

### W5 — `tools/verify/s12_warehouse_movement.js` *(one commit)*

Offline, over the real source, no network, no spreadsheet. Assert:

1. `WH_MOVE_HEADERS` is the 17 names, in order, including the misspelling `movmenent_sign`.
2. The two formula strings, byte for byte, including the full Arabic enum in the sign formula.
3. `WH_MOVE_TYPES` is exactly the two strings.
4. `settingsEnsureSheet_` is **not** called with `WH_MOVE_SHEET` anywhere.
5. `amount` and `unit_cost` are stripped when `vfCanSeeCost_` is false.
6. The save path contains the over-issue guard, and the guard reads availability from the sheet
   rather than from the payload.
7. The page template contains no `warehouse` or `asset_target` input, and no delete/edit action.

Add one line to `STEPS` in `tools/verify/run_all.js`. Run the whole suite; it must stay green.

### W6 — `WAREHOUSE_MOVEMENT_RESULTS.md` and handover *(one commit)*

What was built, what was skipped and why, the owner's checklist (below), and the two open questions
from plan §6 with whatever you could determine offline. Add one item to
`NEXT_STEPS_OWNER.md` — **the `ERP_Pages_Matrix` grant is blocked on the owner** — as the only edit
you make to that file.

---

## When you would normally stop

1. **The plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why, continue with the rest.
3. **Genuinely blocked** (needs the owner's account, needs a sheet read, needs matrix rows) → write
   it up, mark it blocked-on-owner, continue with everything else.
4. **A whole step is unworkable** → report it plainly, do not fake it, move to the next.

A reported skip is always better than a guess. **A step reported as done that quietly writes to a
production sheet is the one outcome that is not acceptable.**

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

1. `node --check` every `.js` file you touch, after every step.
2. `node tools/verify/parse_pages.js` — the new template's inline `<script>` must parse.
3. `node tools/verify/ui_smoke_pages.js` — the new template must **boot** on the DOM stub. This is
   the check that catches a blank page; C2-style parsing does not.
4. `node tools/verify/run_all.js` — the full suite, green, including your new `s12`.
5. **Dry-run the save handler under `node`** against a fake sheet: stub `getSheet_`,
   `getAllRecords_`, `saveRecordWithAudit_` and `writeRowFormulas_`, feed it a payload, and assert
   on the **row map and formulas it would have written** — 17 values in header order, `warehouse`
   constant, `asset_target` empty, `amount` = unit_cost × qty, and the two formulas addressing F and
   K. Nothing may reach a real spreadsheet. Record the captured row in the results doc.
6. Prove the over-issue guard by feeding it `qty = available + 0.001` and asserting it throws.

**The owner's visual checklist** — write it as specific statements, never "check it looks right":

- The page opens from `الادارة المالية ← حركة المخزن` and lists existing movements newest first.
- Adding a `منصرف` for more than the batch's available quantity is refused, with the available
  number in the message.
- After choosing a batch, the unit fills itself and **المتاح** appears beside it.
- A saved row shows `item_code` filled in by the sheet formula, and `movmenent_sign` negative for
  `منصرف`, positive for `وارد داخلي / مرتجع للمخزن`.
- The saved `amount` equals unit cost × quantity to two decimals.
- A user **without** the cost grant sees no القيمة column and **no cost values in the network
  response** (check devtools, not just the screen).
- The sheet still has exactly 17 columns after the first save.

---

## A trap previous sessions hit repeatedly

The Bash tool mangles backslashes inside heredocs (`\\` collapses to `\`) and breaks on awkward
quoting — **and this run is almost entirely Arabic string literals, which break it reliably.** For
any file content with Arabic text, regex escapes, CSS selectors or nested quoting: use the
`Write`/`Edit` tools, or write a Python transform script to a file with `Write` and run it. Do not
fight the heredoc. A mangled `وارد داخلي / مرتجع للمخزن` produces a sign formula that is wrong for
every row and looks right in review.

---

## Commit protocol

```
feat(vf-W<n>): <short summary>

<what changed, file by file>
<what was verified, and how — include the dry-run row map>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema — all 17 columns already exist, and
   `settingsEnsureSheet_` is never called on this sheet.
2. You will **not** add, edit, or delete data in any business table, **including the
   `ERP_Pages_Matrix` rows that grant the page**. That is the owner's step.
3. The page ships **add-only** — no edit path, no delete path.
4. You will **not** deploy, push, or touch the owner's Google account.
5. The sign formula compares the **full** enum string `وارد داخلي / مرتجع للمخزن`.
6. `movmenent_sign` is misspelled in production and stays misspelled everywhere you write it.
7. `item` is a **batch** uid, not a product id; `amount` is computed server-side and never trusted
   from the client; the over-issue guard is server-side and authoritative.
8. Other agents' uncommitted work is in the tree. You stage only your own seven files.
