# Table column widths — results

Branch `ui/table-columns`, off `feat/realtime-authority` at `e188124`. Seven commits, code only:
no schema touched, no row created, edited or deleted, nothing pushed or deployed.

**Reach.** 69 `UIC.dataTable` call sites and 30 raw page tables — 99 tables in all — plus every
page that does not exist yet. Zero DOM nodes added per row.

---

## 1. What shipped

| Phase | Commit | What |
|---|---|---|
| 0 | `489ceab` | `TABLE_COLUMN_WIDTHS_PLAN.md`, committed unmodified as the spec |
| 0 | `e21308f` | `ui_check.js` C12: `tables_unwrapped` (23) and `tables_untyped` (30) recorded |
| 1 | `475f1ee` | The contract: two tokens, five `col-*` rules, `.modal-body .table-wrap`, **and the print relaxation in the same commit** |
| 2 | `710695c` | `UIC.classifyColumns`, `st.cols`, `UIC._dtHeadRow` — both builders unified |
| 3 | `9626ed1` **+ `2a041eb`** | `UIC.autoColumns` / `autoColumnsAll`; all 30 raw tables wrapped and typed — **see §8, the w3 commit was overwritten by a concurrent session and re-landed** |
| 4 | `c181c61` | The declarations on four pages (the fifth is a recorded skip) |
| 5 | `a5cd5bd` | `s18_table_columns.js` — 82 assertions, wired into `run_all.js` |
| 6 | this | The wide-table artboard, the regenerated bundle, this document |

### The census, re-derived rather than trusted

Every number in plan §2 reconciles. 69 dataTable sites — matches. 30 raw page tables plus the one
`dataTable` emits itself = the plan's 31; 7 of those wrapped in pages plus that one = 8, leaving
**23 unwrapped**, in exactly the 18 files §2 lists. The one number that differs is cosmetic: 625
distinct `label:` literals against the plan's "703 distinct column labels", which also counted
plain-string headers. Not load-bearing.

---

## 2. What was skipped or blocked, and why

| | Why |
|---|---|
| **W5** — the ~30 page-local table classes (`grid`, `inv-table`, `info`, `odoo-table`, 9 singletons) | Out of scope by **D-C**. Severable, and it doubles the diff. Recorded in `NEXT_STEPS_OWNER.md` as the recommended follow-up. |
| **W6** — line-clamp on prose | Out of scope by **D-D**. It is the one phase that costs a DOM node per prose cell, and hard constraint 4 forbids spending the row budget on a nice-to-have. |
| **`Company_ValleyFoods_MfgOrderView.html`** — the fifth W4 page | It has no `UIC.dataTable` call and no raw `<table class="table">` **at all**. Every table on it is `odoo-table card-table`, a page-local class, which is W5. Declaring anything there would have meant either doing W5 work or writing a declaration nothing reads. The other four W4 pages were done in full. |
| The 35 inline `<th style="width:…">` in print templates | **D-L**. Page-sized layouts on paper, deliberately left alone. |
| Making a classified `actions` column non-sortable | Plan §3 lists "never sortable" as part of the actions role. Not done: removing `data-sortable` from a `<th>` that carries it today is a change to emitted markup beyond the width contract, and hard constraint 5 says extend additively or not at all. The existing opt-out (`key === 'actions'`) is untouched and still covers the common case. **Follow-up candidate.** |
| A body cell that must not wrap | **D-B**. No case appeared; recorded here as the follow-up it asks for. |

---

## 3. The classification table

This is the section to read. Roles as the classifier actually assigns them, verified by `s18`
§2 against the real payload shapes.

### `vf_cash` — thirteen columns, the worst case in the tree

| # | Column | Role | Override? |
|---|---|---|---|
| 0 | رقم | `atom` | inferred |
| 1 | التاريخ | `atom` | inferred |
| 2 | الطرف | `text` | **declared** `col:'text'` — inference agrees; declared so a month of long company names cannot promote it to prose |
| 3 | البيان | `prose` | **declared** `col:'prose', min:'30ch'` — inference agrees *from the data alone* (asserted); declared so it can never flap, and 30ch because it shares the row with twelve other columns |
| 4 | النوع | `text` | inferred |
| 5 | طريقة الدفع | `atom` | inferred |
| 6 | المبلغ | `num` | inferred from the existing `numeric: true` |
| 7 | الصندوق | `text` | inferred |
| 8 | كود الحساب | `atom` | inferred |
| 9 | المستخدم | `atom` | inferred |
| 10 | الرصيد | `num` | inferred from the existing `numeric: true` |
| 11 | الاعتماد | `atom` | **declared** — inference calls it `text`, because `غير معتمد` contains a space. That reserves 14ch on the widest table in the tree for a status pill that needs five. This is the one column where inference was actually *wrong*. |
| 12 | *(empty label)* | `actions` | inferred |

### `vf_parties` — the account statement of plan §0, six columns

| # | Column | Role | Override? |
|---|---|---|---|
| 0 | التاريخ | `atom` | inferred |
| 1 | رقم المستند | `atom` | inferred |
| 2 | البيان | `prose` | **declared** `data-col="prose" data-min="30ch"` — raw markup, so the declaration is an attribute |
| 3 | مدين | `atom` | inferred — every cell is `-`, so the label decided (§5 rule 5) |
| 4 | دائن | `atom` | inferred |
| 5 | الرصيد التراكمي | `atom` | inferred |

Three of nineteen columns needed an override, and only **one** of those (`الاعتماد`) because
inference was wrong. The rest are declared to pin a verdict that is already correct — which is the
answer to **D-H**: classification can differ between two loads, and for the columns that matter
most, a declaration removes that variance entirely.

---

## 4. The numbers, before and after

| Metric | Before | After |
|---|---|---|
| `dom_nodes_per_row` (C8) | **7** | **7** — unchanged, `_dtRowHtml` untouched, not one character |
| `dom_nodes_per_action_cell` | 6 | 6 |
| `classes_orphan` (C5) | 37 clean / 38 in this working tree | **38** — unchanged by this run; see below |
| `tables_unwrapped` (C12) | 23 | **0** |
| `tables_untyped` (C12) | 30 | **0** |
| C9 fingerprint | `07d70c53d1db5c38` | `427567dd9539c07b` |
| `run_all` | 44 checks | **47 checks, all pass** (s18 added; two more came from other sessions) |
| `s18` assertions | — | **82, all pass** |

**About `classes_orphan` 38.** It was 37 at HEAD and is 38 in this working tree, and that is
**not this run's doing**. The extra class is `.date-range-bar`, from another session's uncommitted
`UIC.dateRangeBar` work in `UI_Components.html`. Measured against a clean worktree of HEAD, which
reports 37. `s18` §11 asserts that all five classes this contract can emit are defined in the
shared stylesheet, so the contract cannot push this number up.

`--save` was deliberately **not** run on the baseline: it rewrites every metric from the current
working tree and would have laundered that 38 into the branch's baseline. Only the two keys this
run introduced were added, by hand.

---

## 5. The owner's visual checklist

Open `design_preview/index.html` and go to the new **"The wide table — 13 columns, vf_cash
shaped"** artboard. Nothing in this repo can measure a pixel, so these are the statements only you
can confirm.

**At 1280px (desktop) and 1920px (wide):**

1. `البيان` shows at least four words on one line, and is visibly the widest column on the row.
2. `التاريخ` is about as wide as `27/10/2025` and no wider — it does not grow to fill space.
3. `رقم`, `كود الحساب` and `المستخدم` are each as narrow as their contents.
4. No row is more than two lines tall.

**At 1024px and 900px (tablet-l):**

5. The table scrolls **sideways inside its own box** — the page itself does not scroll
   horizontally. *A horizontal scrollbar here is the intended outcome, not a regression.*
6. `البيان` is still at least four words wide on one line; it is not crushed to one word per line.
7. The header row stays visible while you scroll the table down.

**At 600px (tablet-p):**

8. Still a table, not cards. Still scrolls sideways.

**At 390px (phone):**

9. Every row is a **card**, the header row is gone entirely, and none of the width behaviour above
   applies. This is by construction — the phone tier hides `thead`, so the elements carrying the
   contract are not rendered.

**Print (Ctrl+P from the artboard, or from any real list page):**

10. All thirteen columns appear on the paper. **None is cut off at the right edge.** Text wraps
    instead. This is the one that would have shipped silently — see §6.

**On real pages, once pushed:**

11. `vf_parties` → كشف حساب مالي تفصيلي: the description column now reads as a sentence rather
    than a nine-line column of single words. This is the screenshot in plan §0.
12. `vf_cash`: same, and the الأعمدة column-hide menu still works — hide `البيان`, show it again,
    and every other column keeps its width.
13. Open any table inside a dialog (e.g. الباتشات on `vf_products`): there is **one** scrollbar,
    not two nested ones.

---

## 6. What the plan got wrong, or did not say

**The load-bearing assumption is unverified, and cannot be verified here.** Plan §4 rests entirely
on `min-width` on a `<th>` raising the whole column's floor in `table-layout: auto`. That is how
browsers implement auto table layout — a column's used minimum is the maximum of its cells'
minimum contributions, and the `<th>` is one of those cells — and it is a standard idiom. But
`domstub.js` has no layout engine, so **no assertion in this repo proves it**, and none pretends
to. If checklist items 1 and 6 above fail, this assumption is the thing that is wrong, and the
entire design rests on it. Reporting it loudly, as asked.

**§1.3 identifies a problem that §4 does not fix.** The plan correctly observes that
`.table thead th { white-space: nowrap }` turns every header label into a permanent column floor,
and gives `الرصيد التراكمي` reserving ~15 characters over a column of dashes as the example. The
§4 fix never removes that `nowrap`. So an all-dash column is now classified `atom` and gets
`width: 1%`, which stops it *growing* — but it still cannot shrink below its own label, because
the label still will not wrap. The sparse-column-with-a-wide-label case is **improved, not
solved**. Solving it would mean letting header labels wrap, which is a visual change well beyond a
width contract and should be its own decision.

**C11 does not catch the hazard it was written for.** While writing the Phase 1 CSS I put a
backtick pair around a dash *inside a CSS comment* in the stylesheet template literal. That closed
the literal early and silently truncated the entire design system from 73,077 characters to 8,813
— every page unstyled. `C11 template-literal CSS hazards` exists specifically to catch this and
reported **PASS**; its "did the literal end early?" heuristic only fires when the text right after
the stray backtick still looks like CSS, and here it was English prose. What actually caught it was
C5, as a jump from 37 orphan classes to 152. **C11's heuristic should be widened** — a follow-up.

**Two smaller things worth knowing.**

- `UIC.classifyColumns` is documented as public and callable directly (D-E), but a header passed as
  a plain **string** has no `.label`, and rule 5 reads an empty label as `actions`. Called directly
  with the string headers that most of the 69 sites pass, every column came back `actions`.
  `dataTable` normalises before calling, so no page was ever affected — but the public entry point
  had to normalise again itself. Fixed in `710695c`.
- Check **C3 resolves any `UIC.x` mention, including one inside a comment.** Naming
  `UIC._dtHeadRow` in a Phase 1 comment failed the check one commit before the symbol existed.
  Harmless, but worth knowing before writing forward-looking comments.

---

## 7. Working alongside other sessions

This tree had uncommitted work from other sessions throughout, in files this run also had to edit
(`UI_Components.html`, `Company_ValleyFoods_Sales.html`, `Company_ValleyFoods_Products.html`,
`tools/verify/s13_forms_filters.js`, and the four W4 pages). Nothing of theirs was staged,
reverted or cleaned up.

Every commit was staged by **filtered patch**, selecting hunks whose added lines carry this run's
own signature. In `Purchasing` and `Sales` this run's edits sit within three lines of theirs, so a
normal 3-line-context hunk contained both; those were staged at **zero context**, where each hunk
holds only the changed lines. The index was checked for foreign markers before each commit.

The one unavoidable exception is `design_preview/_sources.js`: it is a generated bundle of the
whole shared layer, so it necessarily embeds their uncommitted `UIC.dateRangeBar`. The committed
bundle and the committed source therefore reconcile only once that session commits; in the working
tree, which is what C9 reads, the pair is fresh.

Two pre-existing failures were measured against a clean worktree of HEAD and confirmed as **not
this run's**: `C5 classes_orphan 38 vs 37` (`.date-range-bar`), and — at the start of the run —
one `run_all` failure that belonged to whichever session was mid-edit at the time. `run_all` is
**47 of 47 green** as of this commit.


---

## 8. The w3 commit was overwritten by a concurrent session

Worth recording, because it is invisible from the log alone.

**Git's index is shared by every session working in one tree.** Between this run's `git add` for
phase 3 and its `git commit`, a concurrent session staged its own quiet-refresh work. The commit
recorded *that* — so **`9626ed1` carries this run's message and another session's content**: 17
files of `s20_quiet_refresh.js` and ValleyFoods reload changes, none of it this run's. Phase 3's
actual work was never committed and survived only in the working tree.

It was caught by auditing each commit's file list against the staged stat that had been printed
before it: every other phase matched (2, 3, 3, 4, 2, 4 files); phase 3 did not (17, expected 25).

**Fix.** History was not rewritten — hard constraint 7. `9626ed1` stands as it is, and `2a041eb`
lands the w3 work that belongs under its message, staged by the same zero-context signature patch
and checked for the other session's markers first. **Read the two together.** Phases 0, 1, 2, 4, 5
and 6 were verified present in `HEAD` and were unaffected.

After re-landing, all 30 files this run touched were audited: `HEAD` matches the working tree for
every marker of this run's work.

**For the owner:** if the concurrent session later reverts or rebases what it believes to be its
own commit, `9626ed1` is the one to look at — its *content* is theirs. And the general lesson: two
agents committing in one working tree cannot both trust `git add`. A concurrent session may also
have had its own work committed under one of this run's messages, or vice versa, at any commit
boundary; only phase 3 showed a mismatch here.
