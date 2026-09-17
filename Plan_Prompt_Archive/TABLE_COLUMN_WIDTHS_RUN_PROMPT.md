# RUN PROMPT — the table column-width contract

Give every table in the tree a column-width contract, per
**[TABLE_COLUMN_WIDTHS_PLAN.md](TABLE_COLUMN_WIDTHS_PLAN.md)**. Today a column that holds a
sentence is squeezed to its longest word while a column holding `2679` keeps the width its header
label demands. Six phases fix that once, in the shared layer, for all ~130 tables and for every
page that does not exist yet.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows in any business
table, and adds no column to any existing sheet.

---

## 🔁 Autonomy — read this first

**Do not stop between phases. Do not ask "shall I continue?". Do not ask me to approve a phase, a
diff, a commit or a decision.** Work straight through Phase 0 → 6 and report **once**, at the end.

Every open decision is **already answered in §Decisions**. If you want to ask a question:

1. **§Decisions or the plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the results doc, continue.
3. **Genuinely blocked** (needs my Google account, needs a live sheet, needs a browser) → write it
   on the owner checklist and **continue with everything else**.
4. **A whole phase is unworkable** → say so plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess, and **far** better than a stopped run.

Commit after each phase **without asking**. Do not push. Do not deploy.

---

## Read these first, in full, before touching anything

1. **`TABLE_COLUMN_WIDTHS_PLAN.md`** — your specification. §4 is the mechanism, §5 is the
   classifier, §4.2 is the two tiers where the contract must stand down. **This prompt orients
   you; the plan decides.** Where they disagree, the plan wins — except §Decisions below, newer.
2. **`UI_Components.html` L840–L1010** — `UIC.dataTable`, `theadFor`, the `__dtStore` shape, and
   `_dtRowHtml`. **You are not editing `_dtRowHtml`.** Read it to be sure you understand why.
3. **`UI_Components.html` L1334–L1440** — the optional-columns block: `_dtVisibleHeaders`,
   `dtToggleColumn`, **`_dtRebuildHead`**. This is where the run's worst trap lives — see §Traps.
4. **`UI_Components.html` L3648–L3680** — `.table-wrap`, `.table`, `.table thead th`. The sticky
   header comment at L3676 explains why `.table-wrap` must have a `max-height`; you will be adding
   that wrapper to 23 tables, and the comment tells you what you are switching on.
5. **`UI_Components.html` L3715–L3760** — the shared `@media print` block. §4.2 of the plan says
   print must relax the floors. Read the block before you add to it.
6. **`UI_Components.html` L4500–L4535** — the phone card tier, including
   `.table thead { display: none; }`. This is why the contract is inert below 600px.
7. **`UI_Components.html` L4550** — the `.card-table` comment. It is the precedent for how an
   opt-in class is introduced in this repo without touching a page's existing declarations.
8. **`CSS_Tokens.html` L240–L255** — the density block. Your two new floors are tokens, and they
   live with the other tokens, not hard-coded in a selector.
9. **`tools/ui_check.js`** — C5 (`classes_orphan`, baseline **37**), C8 (`dom_nodes_per_row`,
   baseline **7**), **C9** (the preview fingerprint — see §Traps).
10. **`tools/verify/run_all.js`** and **`tools/verify/vf_daterange.js`** — the suite, and the shape
    a check file has: boot the real page through `pageharness`, assert on markup the page actually
    produced. Your `s18` is its sibling.

**Verify every `file:line` before you edit it.** Line numbers here were taken at HEAD `2de4ee2` and
drift with every commit — confirm each one yourself.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change a schema

No column may be **added, renamed, removed, reordered or retyped** in any business table, in any of
the three company spreadsheets or the auth spreadsheet. This run has no reason to go near a sheet
at all. If you find yourself writing `settingsEnsureSheet_`, you have lost the plot.

## 2. NEVER add, edit or delete data in a business table

No rows. No cell updates. No deletes. No test records. Not by hand, not by script, not via
`clasp run`. **This includes `ERP_Pages_Matrix`** — this run adds no action and needs no grant.

## 3. NEVER deploy, push, or touch my Google account

No `clasp push`, no `clasp deploy`, no `clasp run`, no `git push`. Commit locally, that is all.

## 4. NEVER add a DOM node to a table row

`dom_nodes_per_row` is **7** and it is the performance programme's number. The entire design of
this change (plan §4.1) exists to avoid spending it.

- **Classes go on `<th>` only.** Never on a `<td>`. Never on a `<tr>`.
- **You do not edit `UIC._dtRowHtml`** (L966). Not one character.
- C8 must still report 7 at every commit. If it reports 8, you have done this wrong; revert the
  cause rather than updating the baseline.

## 5. NEVER break a public contract

`UIC.dataTable`, `UIC._dtRowHtml`, `UIC._dtVisibleHeaders`, `UIC.exportExcel`, `UIC.printTable`,
`.table`, `.table-wrap`, `.num` are shared by three companies and ~130 tables. Extend additively or
not at all.

- A header passed as a **plain string** must keep working — 69 call sites rely on it and most pass
  strings. The normalisation at L850 already handles it; your classifier runs *after* it.
- A header object with **no** `col:` must keep working, classified automatically.
- Anything that styles `.num` today must render byte-identically tomorrow.

## 6. NEVER set `table-layout: fixed`

Not on `.table`, not on any page table, not "just for the wide ones". The plan rejects it in §6
with a reason. Auto layout plus floors is the whole mechanism.

## 7. NEVER rewrite history

No `rebase`, no `amend`, no `reset --hard`, no force anything. Other sessions' uncommitted work is
in this tree — `git status` at HEAD shows nine modified files and eleven untracked `.md` files that
are **not yours**. **Stage explicit paths only, never `git add -A`.**

## 8. Stay inside your file set

```
UI_Components.html                       (the contract, the classifier, both thead builders)
CSS_Tokens.html                          (two tokens)
design_preview/_sources.js               (REGENERATED, never hand-edited)
design_preview/gallery.html              (one new artboard)
tools/build_preview.js                   (only if the artboard needs a source entry)
tools/ui_check.js                        (two new metrics)
tools/ui_baseline.json                   (the two new metrics recorded)
tools/verify/s18_table_columns.js        (new)
tools/verify/run_all.js                  (one line: the s18 step)
TABLE_COLUMN_WIDTHS_RESULTS.md           (new, Phase 6)
NEXT_STEPS_OWNER.md                      (append only)

plus, in Phase 3 only, the 31 pages that write a raw <table class="table">
plus, in Phase 4 only, these five and no others:
  Company_ValleyFoods_Parties.html
  Company_ValleyFoods_Cash.html
  Company_ValleyFoods_Purchasing.html
  Company_ValleyFoods_Sales.html
  Company_ValleyFoods_MfgOrderView.html
```

Do **not** touch `Company_TopLight_Sales.html`'s or `Company_ValleyFoods_Parties.html`'s
hand-patched modal widths (1200px / 1150px). They are deliberate.

---

## Starting state

```bash
cd d:/Work/Script
git branch --show-current      # feat/realtime-authority at time of writing
git log --oneline -1           # 2de4ee2 perf(core): deleteRowsByCriteria_ in a loop …
git status --porcelain
```

`git status` will show modified `Company_ValleyFoods_Actions.js`, `Company_ValleyFoods_Cash.html`,
`Company_ValleyFoods_MfgOrderView.html`, `Company_ValleyFoods_Products.html`,
`Company_ValleyFoods_Purchasing.html`, `Company_ValleyFoods_Sales.html`, `UI_Components.html`,
`design_preview/_sources.js`, `tools/verify/s13_forms_filters.js`, plus eleven untracked `.md`
files and `tools/verify/vf_daterange.js`.

**All of that belongs to other work except `TABLE_COLUMN_WIDTHS_PLAN.md`. Do not stage it, do not
revert it, do not "clean up" the tree.** Note that four of the files you must edit in Phase 4 are
already dirty — your diff sits on top of someone else's uncommitted work, so read before you write
and stage by explicit path.

**Create your branch from HEAD and stay on it:**

```bash
git checkout -b ui/table-columns
```

Commit `TABLE_COLUMN_WIDTHS_PLAN.md` as your **first commit** (it is your spec, and it is currently
untracked), then proceed.

---

## Decisions — already made, do not re-ask

| # | Question | Answer |
|---|---|---|
| **D-A** | `table-layout: fixed`? | **No.** Constraint 6. Auto layout + `min-width` floors, as plan §4. |
| **D-B** | Classes on `<td>` as well, so body cells can nowrap? | **No.** `<th>` only — constraint 4. A `<th>` is a cell in its column, so its `min-width` raises the whole column's floor. If a real case appears where a body cell must not wrap, record it in the results doc as a follow-up; do not solve it here. |
| **D-C** | Run W5 (the ~30 page-local table classes: `grid`, `inv-table`, `info`, `odoo-table`, …)? | **No — W5 is OUT OF SCOPE.** It is severable and it doubles the diff. Note it as the recommended follow-up run. |
| **D-D** | Run W6 (line-clamp on prose)? | **No — OUT OF SCOPE.** It is the one phase that costs a DOM node per prose cell, and constraint 4 forbids spending that on a nice-to-have. |
| **D-E** | Where does the classifier live? | `UIC.classifyColumns(headers, rows)` in `UI_Components.html`, **public and additive**. A page may call it directly; `dataTable` calls it for you. |
| **D-F** | Floor units — `px`, `rem` or `ch`? | **`ch`**, expressed as two tokens in `CSS_Tokens.html`: `--col-text-min: 14ch;` and `--col-prose-min: 26ch;`. `ch` tracks the font, so the floor stays right in Arabic, at every density, and when someone changes `--text-sm`. Tokens because C6 measures token discipline and a magic number in a selector is exactly what it counts against. |
| **D-G** | Sample size for classification? | **200 rows**, from `originalRows`, **once**, at `dataTable()` time. Store the verdict on `st.cols`. Never re-classify on sort, search, page or column-toggle. |
| **D-H** | Classification differs between two loads of the same page (different data). Acceptable? | **Yes.** It is stable within a render, which is what matters. Say so in the results doc. |
| **D-I** | Change `exportExcel` / `printTable`? | **No.** Both build their own markup from `st.headers` and never read the DOM (L1751, L1778). They are unaffected. Confirm this in `s18` rather than assuming it. |
| **D-J** | `theadFor` (L884) and `_dtRebuildHead` (L1386) build the same `<th>` markup twice. Patch both, or unify? | **Unify.** Extract `UIC._dtHeadRow(st)` and have both call it. Two copies of this markup is precisely how the column-toggle path would silently lose the contract. This is required, not optional. |
| **D-K** | The 23 tables gaining a `.table-wrap` also gain `max-height: 70dvh` and a sticky header. Inside a modal that already scrolls, that is two scrollbars. | Add **one shared rule**: `.modal-body .table-wrap { max-height: none; }`. One rule in the shared sheet, correct everywhere, no per-page judgement calls. (`.modal-body` is the scroll container — `UIC.openModal`, L2395.) |
| **D-L** | Call `autoColumns` on print-only tables (`inv-table`, the templates inside `*_Actions.js`)? | **No.** Print tables are page-sized layouts on paper with deliberate inline widths. Leave all 35 inline `<th style="width:…">` alone. |
| **D-M** | Wide tables will now scroll horizontally where they previously fit. Lower the floors to avoid it? | **No.** That is the intended outcome (plan §9). A scrollbar is an honest signal; a crushed column is not. Put it on the owner's visual checklist. |
| **D-N** | Rebuild the design preview? | **Yes — required.** C9 fingerprints the bytes of `UI_Components.html` and `CSS_Tokens.html`. Any edit to either makes C9 **FAIL** until you run `node tools/build_preview.js`. Run it at the end of each phase that touched them. Never hand-edit `design_preview/_sources.js`. |
| **D-O** | An existing verify assertion fails because a `<th>` now carries an extra class. | **Expected.** Update the assertion deliberately and record why in the file, following the precedent comment in `tools/verify/s0_modal_size.js` (~L31). **Do not weaken an assertion to make it pass.** |

---

## Your task — seven phases, in order, one commit each

Do not pause between them.

| # | Phase | Plan § | Essence |
|---|---|---|---|
| **0** | Recon + branch + commit the plan | §1, §2 | Re-run the census yourself and confirm the numbers (69 / 31 / 8 / 23 / 703). **No code edits.** Add `tables_untyped` and `tables_unwrapped` to `ui_check.js`, record today's values in `ui_baseline.json`. |
| **1** | **W1** — the contract, in the shared layer | §3, §4, §4.2 | The two tokens, the five `col-*` rules on `thead th`, `.table td { overflow-wrap: break-word; }`, the `.modal-body .table-wrap` rule (D-K), and the **print relaxation**. No page changes. Rebuild the preview. |
| **2** | **W2** — the classifier and the wiring | §5 | `UIC.classifyColumns`, `st.cols`, `UIC._dtHeadRow` (D-J), and both callers. **All 69 `dataTable` sites get correct widths in this commit, with zero page edits.** |
| **3** | **W3** — the raw tables | §2, §7 | `UIC.autoColumns(idOrEl)`; one call per raw `.table`; and the `.table-wrap` for the 23 that lack one. |
| **4** | **W4** — the five declarations | §7 | `col:` / `min:` overrides where the data lies about itself. Five files, listed in constraint 8. |
| **5** | **W7a** — verification | §8 | `tools/verify/s18_table_columns.js`, one `STEPS` line. |
| **6** | **W7b** — the visual harness + results | §8 | The wide-table artboard in `design_preview`, the regenerated bundle, `TABLE_COLUMN_WIDTHS_RESULTS.md`. |

### The three phases that carry real risk

**Phase 1 — the print relaxation is the one that ships silently.** The print block restores
`display: table`, brings `thead` back as a `table-header-group`, and sets
`.table-wrap { overflow: visible }`. So on paper the floors apply again with **no scroll to escape
into**, and A4 minus margins is ~718px. A 13-column table is then *clipped*, not scrolled, and
nobody finds out until a user prints an invoice. Add the `@media print` relaxation from plan §4.2
**in the same commit as the floors** — never in a later one.

**Phase 2 — classify once, from `originalRows`.** `st.filtered` is re-derived on every search, sort
and page (the pipeline comment at ~L906 explains why). Classifying from anything but
`originalRows`, or classifying more than once, gives a table whose columns change width when the
user sorts it. Store on `st.cols` at `dataTable()` time and read from there.

**Phase 3 — the 23 wrappers change more than width.** `.table-wrap` also switches on `max-height:
70dvh`, `overflow-y: auto` and the sticky header. That is desirable on a page and wrong inside a
modal that already scrolls — hence D-K. Apply the shared `.modal-body` rule in Phase 1 so it is
already in place before you add a single wrapper.

---

## The classifier — what `s18` must be able to prove

Order of precedence, per plan §5. Implement it exactly, because §8 asserts on each branch:

1. Declared `col:` on the header object. Always wins. Valid values: `atom`, `num`, `text`,
   `prose`, `actions`. An unrecognised value falls through to inference — never throws.
2. `money: true` or `numeric: true` → `num`.
3. Derived from up to 200 sampled values of that column:
   - every sampled value ≤ 12 chars **and** contains no space → `atom`
   - p90 length ≥ 24 **or** median word count ≥ 4 → `prose`
   - otherwise → `text`
4. Every sampled cell empty or `-` → fall back to the header label; the label is then the only
   evidence there is.
5. Empty label, or cells containing `<button` / `erp-kebab` → `actions`.

`min:` on a header overrides the token floor for that column only.

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

There is no `node_modules`, no `package.json` and **no layout engine**. `tools/verify/domstub.js`
does not lay anything out, so **no assertion in this repo can prove a column is 26 characters
wide.** Do not pretend otherwise in the results doc. Prove what is provable; put the pixels on the
owner's checklist.

**After every phase, all four:**

```bash
node --check <each .js you touched>
node tools/verify/parse_pages.js
node tools/verify/ui_smoke_pages.js     # catches a blank page; parse_pages does not
node tools/verify/run_all.js            # full suite, green, including your new s18
node tools/ui_check.js                  # C5 orphans ≤ 37, C8 row = 7, C9 fingerprint fresh
```

**A red suite is a stop-and-fix, not a stop-and-ask.** Fix it and continue.

**`s18_table_columns.js` must assert, at minimum:**

1. **The classifier, run** — not grepped — against fixtures: `27/10/2025`, `٢٧/١٠/٢٠٢٥`,
   `13,950.00`, `(13,950.00)`, `2679`, `A-1`, `-`, an empty string, a 60-character Arabic
   sentence, and a column that mixes short and long values.
2. The classifier against the **real payloads** of `vf_cash` and `vf_parties`: `البيان` → `prose`,
   `التاريخ` → `atom`, `المبلغ` → `num`, the empty-label last column → `actions`.
3. The **emitted thead** of a real page boot through `pageharness` carries the classes — assert on
   markup the page produced, not on the shape of its source text.
4. **Stability:** boot, capture every `<th>`'s class, then search / sort / page / toggle a column
   off and on, and assert the classes are byte-identical. This is the assertion that catches D-J.
5. **Both builders agree:** `theadFor` and `_dtRebuildHead` produce the same `<th>` for the same
   store. If you unified them via `_dtHeadRow` this is trivially true — assert it anyway, so it
   stays true.
6. **No `.table` without a `.table-wrap`** anywhere in the tree — the Phase 3 invariant, made
   permanent.
7. The phone tier still sets `.table thead { display: none; }`, so the contract is inert < 600px.
8. The `@media print` block relaxes `col-text` / `col-prose` floors — the Phase 1 failure mode.
9. `.modal-body .table-wrap { max-height: none; }` exists (D-K).
10. `exportExcel` and `printTable` output is byte-identical before and after (D-I).
11. Every class the classifier can emit is **defined in the shared stylesheet** — so C5's
    `classes_orphan` cannot rise above 37.

---

## Traps this repo has actually sprung

**Two thead builders.** `theadFor` (L884) runs on first render; `_dtRebuildHead` (L1386) runs when
the user hides or shows a column. They are near-identical copies. Patch only the first and the
contract survives until someone opens the الأعمدة menu, then vanishes — on one table, for one user,
with no error. D-J says unify them. Do that first, in Phase 2, before you add a single class.

**C9 fails the moment you save `UI_Components.html`.** The preview bundle is fingerprinted against
the source bytes. Run `node tools/build_preview.js` before you commit any phase that touched
`UI_Components.html` or `CSS_Tokens.html`, and stage the regenerated `design_preview/_sources.js`
with it. Never hand-edit that file.

**The Bash tool mangles backslashes inside heredocs** (`\\` collapses to `\`) and breaks on awkward
quoting — **and this run is full of CSS selectors, regexes and Arabic string literals, which break
it reliably.** This was hit three times while drafting this prompt. For any file content with
Arabic text, regex escapes, CSS selectors or nested quoting: use the `Write`/`Edit` tools, or write
a transform script to a file with `Write` and run it. **Do not fight the heredoc.** A mangled
`البيان` produces a classifier branch that is wrong and looks right in review.

**`.table` is also matched by a page's own `class="table something"`.** When you count or edit raw
tables in Phase 3, split the class attribute on whitespace — do not substring-match `table`, or
you will catch `card-table`, `inv-table`, `items-table` and `pt-sk-table` and edit thirty files you
were told not to.

---

## Commit protocol

```
<type>(<phase>): <short summary>

<what changed, file by file>
<what was verified, and how — include the s18 assertion count and the C5/C8/C9 readings>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

---

## Report once, at the end

Write `TABLE_COLUMN_WIDTHS_RESULTS.md` and then give me a single summary containing:

1. What shipped, phase by phase, with the commit hash for each.
2. What was skipped or blocked, and why — including W5 (D-C) and W6 (D-D).
3. **The classification table**: for `vf_cash`'s thirteen columns and `vf_parties`' six, the role
   the classifier assigned to each, and whether it needed an override. This is the number I will
   actually read.
4. `classes_orphan`, `dom_nodes_per_row` and the C9 fingerprint, before and after.
5. The owner's visual checklist for `design_preview/index.html`, as specific statements —
   never "check it looks right". For example: *at 1024px the vf_cash artboard scrolls
   horizontally and البيان is at least four words wide on one line*.
6. Anything you found that the plan got wrong. **Say so plainly; the plan is not sacred.** In
   particular, if `min-width` on a `<th>` turns out not to raise the column floor as §4 claims,
   that is the load-bearing assumption of the whole design — report it loudly rather than working
   around it quietly.

Add one item to `NEXT_STEPS_OWNER.md` — *W5, the ~30 page-local table classes, is a recommended
follow-up run* — as the only edit you make to that file.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema, and **not** add, edit or delete data in any business table.
2. You will **not** deploy, push, or touch the owner's Google account.
3. You will **not** add a DOM node to a table row, **not** edit `UIC._dtRowHtml`, and **not** put a
   `col-*` class on a `<td>`.
4. You will **not** set `table-layout: fixed` anywhere.
5. You will unify `theadFor` and `_dtRebuildHead` **before** adding classes to either.
6. You will add the `@media print` relaxation **in the same commit** as the floors.
7. You will run `node tools/build_preview.js` after every phase that touches the shared layer.
