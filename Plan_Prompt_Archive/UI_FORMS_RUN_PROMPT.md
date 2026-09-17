# RUN PROMPT — Forms Readability + Products/Parties Filters

Execute **[UI_FORMS_AND_FILTERS_PLAN.md](UI_FORMS_AND_FILTERS_PLAN.md)** end to end, **in one
session, without stopping to ask for approval between phases.**

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods) plus an `ERP_Information` auth
spreadsheet. Arabic RTL interface. Repo root `d:\Work\Script`, remote `origin`
(`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows.

---

## 🔁 Autonomy — read this first, it is the point of this prompt

**Do not stop between phases. Do not ask "shall I continue?". Do not ask me to approve a phase, a
diff, a commit or a decision.** Work straight through A → Z and report once at the end.

Every decision the plan left open is **already answered below in §Decisions**. If you find yourself
wanting to ask a question:

1. **The plan or §Decisions covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the results doc, continue
   with the rest.
3. **Genuinely blocked** (needs my Google account, needs a live sheet read, needs a browser) → write
   it up, mark it blocked-on-owner, **continue with everything else**.
4. **A whole phase is unworkable** → report it plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess, and **far** better than a stopped run. The only
outcome that is not acceptable is a phase reported as done that quietly writes to a production
sheet.

Commit after each phase **without asking**. Do not push.

---

## Read these first, in full, before touching anything

1. **[UI_FORMS_AND_FILTERS_PLAN.md](UI_FORMS_AND_FILTERS_PLAN.md)** — your specification. It carries
   the verified findings `R-1…R-14`, the per-phase file lists, the exact balance semantics and the
   owner checklist. **This prompt orients you; the plan decides.**
2. **`UI_Components.html`** — `.input` (~L3640), `.table` (~L3391), `.modal` sizes (~L4248),
   `UIC.combo` (~L1826), `UIC.dataTable` (~L585), `UIC._applyFilters` (~L3395).
3. **`0_ERP_Management.html`** — `openPagesMatrix` (~L431) and `renderMatrixGrid` (~L308), the two
   admin forms in phase A1.
4. **`Company_ValleyFoods_Parties.html`** — `applyFilter` (~L235) for the balance semantics you must
   reproduce exactly, and `getValleyPartyStatement_` in `Company_ValleyFoods_Actions.js` (~L3696).
5. **`tools/verify/run_all.js`** — the offline suite you will extend.

**Verify every `file:line` before you edit it.** Line numbers in the plan and this prompt were taken
at `5ec4f5a` and drift with every commit — confirm each one yourself.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema

No column added, renamed, removed, reordered or retyped in any business table, in any of the three
company spreadsheets or the `ERP_Information` auth spreadsheet. No new sheet, no new tab.

**This run does not add a single column anywhere.** Every value it displays already exists:
`category` and `current_stock_qty` are already in the `vf_products` response; the party balance is
computed from four sheets that are already read by the statement handler.

## 2. NEVER add, edit, or delete data in any business table

No writing rows. No updating cells. No deleting rows. No backfills. No test records. No seed data.
Not by hand, not by script, not via `clasp run`, not via a one-off function you write and execute.

**This includes `ERP_Pages_Matrix`.** Phase A1 changes the *form* that edits that sheet. It changes
**widths only**. It must not write a row, and this run needs no new matrix rows at all — see
plan §0.4: authorization is keyed on `pageId`, so P2's new action inherits the existing `vf_parties`
grants.

## 3. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never create or
promote a deployment. Never run `clasp login`, `clasp run`, or `clasp open`. Never push to `origin`.
**The owner edits locally and pushes when everything is finished.**

## 4. NEVER touch the owner's Google account

No triggers, no Script Properties, no running `dailyCsvBackup`, `inventorySpreadsheets()`,
`archiveOldRecords()` or any other server function.

## 5. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend function
signature, every existing response shape, every HTML anchor id.

This run is **purely additive**. Phase P2 adds one handler; it does not change
`getValleyParties_`'s response shape. If a step seems to require changing an existing response or
signature, **stop that step and write it up** — do not do it.

## 6. Stay inside your file set

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
```

Nothing else. **The working tree carries other efforts' uncommitted work — leave it alone.**

## 7. Do not touch `Company_TopLight_Sales.html`

It is **already modified** by another effort, and it is **already correct** for F1 (it declares
`min-width:900px`). It is deliberately not in your file set. Same for
`Company_TopLight_Sales_Returns.html` and `design_preview/_sources.js`.

## 8. Do not rebuild the design preview

`design_preview/_sources.js` is dirty in the working tree. Running `tools/build_preview.js` would
collide with another effort's work. **Skip it**, and say so in the results doc.

---

## Starting state

```bash
cd d:/Work/Script
git branch --show-current      # feat/tc-box-analysis at time of writing
git log --oneline -1           # 5ec4f5a feat(tc-box-B2): the item matcher …
git status --porcelain
```

`git status` will show modified `Company_TopLight_Sales.html`,
`Company_TopLight_Sales_Returns.html`, `design_preview/_sources.js`, and untracked
`BOX_ANALYSIS_*.md`, `Box_analysis_prompt.md`, `VALLEYFOODS_RUN_PROMPT.md`,
`VALLEY_WAREHOUSE_MOVEMENT_PLAN.md`, `WAREHOUSE_MOVEMENT_RUN_PROMPT.md`,
`UI_FORMS_AND_FILTERS_PLAN.md`, `tools/verify/s11_sales_returns.js`.

**All of that belongs to other work except the plan itself. Do not stage it, do not revert it, do
not "clean up" the tree.**

**Create your branch from HEAD and stay on it:**

```bash
git checkout -b ui/forms-readability
```

Commit `UI_FORMS_AND_FILTERS_PLAN.md` as your **first commit** (it is your spec, and it is currently
untracked), then proceed.

**For every commit: stage explicit paths only.** Never `git add -A`, never `git add .`, never
`git commit -a`. Do not push. Do not rebase. Do not merge.

---

## Decisions — already made, do not re-ask

These resolve every open question in plan §11 plus the ones the phases raise. **Treat them as
settled.**

| # | Question | Answer |
|---|---|---|
| **D-A** | Replace the hand-patched modal widths (Sales 1200px, Parties 1150px) with `size:'xl'`? | **No.** Leave both hand-patches exactly as they are. A working width is not worth a regression for 100px of tidiness. |
| **D-B** | Gate the **الرصيد الحالي** column behind a permission? | **No.** The identical number is already one click away via كشف حساب at the same access level. Add no `VF_COST_KEYS` entry. |
| **D-C** | Run F4b (migrate the 83 inline grids)? | **No — F4b is OUT OF SCOPE for this run.** It touches 43 files and is severable. Do F4a (define the class) only. Note F4b as the recommended follow-up run in the results doc. |
| **D-D** | P1 filtering resets the table's sort and page position — acceptable? | **Yes.** Inherent to the chosen approach; a filtered list's page 3 is meaningless. State it in the results doc. |
| **D-E** | Is `xl` (1100px) enough for صفحات النظام? | **Yes, use `xl`.** Do not build a full-screen editor. |
| **D-F** | Run A1.3 with A1, or fold into F4a? | **Fold A1.3 into the F4a commit** — it needs `.form-grid` to exist. A1.1 + A1.2 ship first. |
| **D-G** | P1 — page-level filtering or a generic `UIC` column filter? | **Page-level (plan Option A).** Do not touch `UIC._applyFilters`; it is shared by ~40 tables and this page passes array rows of pre-rendered HTML. |
| **D-H** | P2 — fold balances into `getValleyParties_` or a separate handler? | **Separate handler**, called after the table paints. Do not change `getValleyParties_`'s response shape. |
| **D-I** | P2 — cache the balances map? | **No cache.** Caching would need busting from four existing save handlers, which constraint 5 forbids. Note the uncached cost in the results doc. |
| **D-J** | `.combo-option` — wrap to two lines instead of truncating? | **No.** Add `title` only. Wrapping makes list height unpredictable. |
| **D-K** | An existing verify assertion fails because F2 adds a `title` attribute. | **Expected.** Update the assertion deliberately and record why in the file, following the precedent comment already in `tools/verify/s0_modal_size.js` (~L31). Do not weaken the assertion to make it pass. |

---

## Your task — eight phases, in order, one commit each

Do not pause between them.

| # | Phase | Plan § | Essence |
|---|---|---|---|
| **0** | Recon + branch + commit the plan | §0, §1 | Confirm `R-1…R-14` line numbers still hold. **No code edits.** |
| **1** | **F1** — line-item width floor | §F1 | `min-width` on 5 ValleyFoods editor tables; add the missing `overflow-x` wrapper on SalesReturns. |
| **2** | **A1.1 + A1.2** — admin forms | §A1 | `size:'xl'` on `pages-matrix-modal` + raise its table to 820px; `min-width:820px` on the صلاحيات الأدوار table. **The owner's headline complaint — get this right.** |
| **3** | **F2** — combo readability | §F2 | `title` on the combo display input (and keep it in sync in `comboPick`) and on every `.combo-option`. |
| **4** | **F3** — modal sizing | §F3 | `size:'lg'` on the two cash modals and the products modal. Per D-A, leave Sales and Parties alone. |
| **5** | **F4a + A1.3** — `.form-grid` | §F4a, §A1.3 | Define `.form-grid` / `-wide` / `-narrow`; apply to the invoice modal's three `1fr 1fr` grids and the products form. **Migrate nothing else** (D-C). |
| **6** | **P1** — `vf_products` filters | §P1 | Category combo + qty min/max, client-side over `ROWS`. No server change. |
| **7** | **P2** — `vf_parties` balance | §P2 | `getValleyPartyBalances_` + registration in all three places; lazy client call; column with `data-num`. |
| **8** | **V** — verify + results doc | §V | `tools/verify/s13_forms_filters.js`, one `STEPS` line, `UI_FORMS_AND_FILTERS_RESULTS.md`. |

### The two phases that carry real risk

**Phase 2 (A1)** is the owner's actual complaint. The bug is that `openPagesMatrix` builds a table
declaring `min-width:700px` and then opens it in the **560px default modal**. Fix both halves: pass
`size:'xl'` *and* raise the table floor. Do not "fix" it by shrinking the table.

**Phase 7 (P2)** is the only server change, and it has a specific trap: the statement joins each of
the four source sheets on a **different field**. Reproduce them exactly —

| Sheet | Join field | Value | Sign |
|---|---|---|---|
| `valley_sales_invoices` | `اسم العميل` | `إجمالي` | **−1** |
| `valley_product_purchasing` | `vendor` | `qty × unit_price` | **+1** |
| `valley_cash_bank_movement` | `name` | `abs(total)` | **+1** if `transaction_type` is `debit`, else **−1** |
| `valley_sales_returns` | `valley_sales_invoices_client` | `abs(valley_return_value)` | **+1** |

Get one field wrong and you produce a plausible number that silently disagrees with the كشف حساب.
**Use the ledger balance, not the stock-adjusted figure** — the adjusted one depends on user-editable
price inputs and has no stable server value.

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

There is no `node_modules`, no `package.json` and **no layout engine**. You cannot measure a width.
Prove what you can statically; put the rest on the owner's checklist.

**After every phase, all four:**

```bash
node --check <each .js you touched>
node tools/verify/parse_pages.js
node tools/verify/ui_smoke_pages.js     # catches a blank page; parse_pages does not
node tools/verify/run_all.js            # full suite, green, including your new s13
```

**A red suite is a stop-and-fix, not a stop-and-ask.** Fix it and continue.

**Additionally for P2 — dry-run the aggregate under `node` against stubbed fixtures.** Stub
`safeRows_` with a small fake dataset covering all five transaction types; assert the sign of each,
and that a fixture party's total equals what the statement's `running` would compute for the same
rows. Nothing may reach a real spreadsheet. **Record the captured balances map in the results doc.**

**For P1 — assert the filter semantics in `s13`:** category is exact-match on the raw id (not the
mapped label), qty bounds are inclusive at both ends, a blank bound is unbounded, and null/blank
`current_stock_qty` is treated as `0`.

**Add to `s13` the generic invariant that would have caught R-12:** no modal may open content whose
declared `min-width` exceeds its modal size, checked against `UIC.MODAL_SIZES`.

---

## A trap previous sessions hit repeatedly

The Bash tool mangles backslashes inside heredocs (`\\` collapses to `\`) and breaks on awkward
quoting — **and this run is full of Arabic string literals, which break it reliably.** For any file
content with Arabic text, regex escapes, CSS selectors or nested quoting: use the `Write`/`Edit`
tools, or write a Python transform script to a file with `Write` and run it. **Do not fight the
heredoc.** A mangled `الرصيد الحالي` or `اسم العميل` produces a column header or a sheet join that is
wrong and looks right in review.

---

## Commit protocol

```
<type>(<phase>): <short summary>

<what changed, file by file>
<what was verified, and how — include the P2 dry-run balances map>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

---

## Report once, at the end

Write `UI_FORMS_AND_FILTERS_RESULTS.md` and then give me a single summary containing:

1. What shipped, phase by phase, with the commit hash for each.
2. What was skipped or blocked, and why — including F4b (D-C) and the preview rebuild (constraint 8).
3. The captured P2 balances map from the dry-run.
4. The owner's visual checklist from plan §9, as specific statements — never "check it looks right".
5. Anything you found that the plan got wrong. **Say so plainly; the plan is not sacred.**

Add one item to `NEXT_STEPS_OWNER.md` — *the F4b grid migration is a recommended follow-up run* — as
the only edit you make to that file.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema — this run adds no column anywhere.
2. You will **not** add, edit, or delete data in any business table, **including `ERP_Pages_Matrix`**.
   Phase A1 changes that form's widths only. No matrix rows are needed by this run at all.
3. You will **not** deploy, push, or touch the owner's Google account.
4. You will **not** stop between phases to ask for approval. Every open decision is answered in
   §Decisions. Blocked → record it and keep going.
5. `Company_TopLight_Sales.html`, `Company_TopLight_Sales_Returns.html` and
   `design_preview/_sources.js` belong to another effort. You do not touch them, and you do not
   rebuild the preview.
6. F4b — the 83-grid migration — is **out of scope**. F4a defines the class; nothing else migrates
   except the two spots named in A1.3 and F3.
7. The party balance is the **ledger** figure, joined on four different fields, and it must match the
   كشف حساب exactly.
8. Other agents' uncommitted work is in the tree. You stage only your own files.
