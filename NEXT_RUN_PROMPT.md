# Continuation run — Phases 11–14

You are continuing a performance optimisation of a production multi-tenant ERP built on Google Apps
Script + Google Sheets, serving three companies (TopChemical, TopLight, ValleyFoods). Arabic RTL UI.
Repo root `d:\Work\Script`, remote `origin` (https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git).

**Two previous sessions have executed Phases 0–6 and 7–10.** You are picking up where the second one
stopped. Do not redo their work and do not re-derive their analysis.

## Read these first, in full, before touching anything

1. `PERFORMANCE_RESULTS.md` — **one document, two runs.** §0–§8 are the first run; the
   **"Continuation run (Phases 7–10)"** section at the end is the second. Read the second one first:
   **C0** (what matters most, including two live bugs found), **C2** (what was verified and how —
   copy this discipline), **C3** (what was skipped and why — parts of it are your work list), **C4**
   (assumptions), **C5** (loose ends).
2. `NEXT_STEPS_OWNER.md` — everything blocked on the owner. **Phase 13 below is gated on item 4 of
   this file.** Ask the user whether it has been done before you plan around it.
3. `PERFORMANCE_INVESTIGATION.md` — the 25 findings (F-01 … F-25) with file:line evidence.
4. `PERFORMANCE_EXECUTION_PLAN.md` and `PERF_BASELINE.md` — the original plan, and what was and was
   not measured.

These are your specification. Verify a file:line reference before you edit it, then move on — do not
re-investigate findings that are already evidenced.

## Starting state

- Branch `perf/optimization-run`, 23 commits, `master` untouched and still the rollback point.
- **Nothing has been deployed.** `clasp push` has never been run by an agent. No staging exists.
- `node --check` passes on all 19 `.js` files and the inline `<script>` of all 92 pages.
- One **untracked** file: `UI_UX_INVESTIGATION.md`. It is not the optimisation runs' work — it
  appeared in the tree during the last one and was deliberately left untracked. **Do not commit it,
  do not edit it, do not delete it.** If `git status` is otherwise clean, that is the expected state.

Confirm before starting:
```bash
git branch --show-current        # perf/optimization-run
git log --oneline -11
git status --porcelain           # exactly one line: ?? UI_UX_INVESTIGATION.md
```
Stay on `perf/optimization-run`. Do not branch again, do not rebase, do not push.

---

## Your task

Execute **Phases 11, 12, 13 and 14 below, in that order, back to back**, committing after each phase
(or each module where the phase says so), until all are complete or blocked. **Approval gates between
phases are waived — do not stop to ask.** Stop only for the hard stops, and for the one question in
Phase 13.

---

## Hard stops — do NOT do these autonomously

1. **Never run `clasp push` against the production script id**
   (`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`), and never create or
   promote a deployment. Deploying is the owner's manual step.
2. **Never write to a business table.** No altering, deleting or adding **data** in any business
   table — not by hand, not by script, not as a "migration" or "backfill". This still forecloses
   retroactively rewriting formulas already sitting in existing rows. If a backfill is genuinely the
   only fix for something, write it up as a proposal and move on.
3. **No schema changes.** No column added, renamed, removed or reordered in any business table.
4. **Phase 4.4** (formulas → script-computed static values) stays unexecuted. It is a proposal in
   `PERFORMANCE_RESULTS.md` §7 and is the owner's decision.
5. **Anything needing the owner's Google account** — running `dailyCsvBackup`, building staging,
   `clasp login`, installing triggers, setting Script Properties, running `inventorySpreadsheets()`,
   running `archiveOldRecords()`. Produce scripts and instructions, mark it blocked-on-owner, commit,
   continue.
6. **Do not build the five missing delete handlers** (`delete_deduction`, `delete_overtime`,
   `delete_vacation`, `delete_registration_paper`, `delete_legal_manufacture`). They are real broken
   buttons, they are recorded in `NEXT_STEPS_OWNER.md`, and writing five new business-table delete
   paths is not a performance change. Leave them.

---

## Rules for each phase

- **Verify every file:line reference before editing.** Line numbers in the docs and in this prompt
  have shifted across three runs. Confirm rather than trust; grep for the symbol, not the line.
- Preserve all public contracts: backend function signatures, `UIC.*` / `API.*` / `FMT.*` / `UI.*`,
  and existing HTML anchor IDs (`tab-body`, `admin-root`, `dash-shell`, `mx-grid`, …).
- Match the surrounding style: ES5-flavoured V8, `function` declarations, IIFE namespaces per company.
  No build step, no npm packages, no new CDN dependencies.
- Where a change is per-page or per-module, do them one at a time with a clear commit each.
- **If a step turns out to be wrong, unsafe, or already done, skip it and record why.** A reported
  skip is fine. A silently broken save path is not. The two previous runs skipped items on these
  grounds and were right to.
- **Prove equivalence where you can, and prove it against the code rather than against your memory of
  it.** The pattern that worked: slice both the old and the new version out of their own source (old
  from `git show HEAD:file`, new from the working tree), run both under `node` over randomised or
  enumerated inputs, and compare. Never retype a formula string — generate it from the original's
  source text so drift is impossible by construction.
- **Do not trust a check that has not been shown to fail on a real defect.** The last run tried a
  whole-file "the multiset of formula literals is unchanged" invariant; a single apostrophe re-phased
  the tokeniser and it reported dozens of false differences. It was abandoned and recorded. Prefer
  narrow, site-scoped differentials you can sanity-check by printing what they captured.
- `node --check` every `.js` file after each phase, and parse the inline `<script>` of every page you
  touch.

### Rebuild the syntax checker first — it does not survive between sessions

There is no committed test harness. Recreate this in your scratchpad before Phase 11; every phase
below assumes it:

> A Python script that walks the repo root, runs `node --check` on all 19 `.js` files, and for each
> of the 92 root `.html` pages (skip `appsheet_old_project.html`) extracts every inline `<script>`
> block without a `src` attribute, replaces Apps Script scriptlets (`<?= ?>`, `<?!= ?>`, `<? ?>`)
> with `(0)` — a scriptlet always stands where a JS *expression* is expected — and `node --check`s
> the result. It should report `19 .js files, 92 .html pages, 110 inline <script> blocks`.

### Two traps that have now bitten three sessions

1. **The Bash tool mangles backslashes inside heredocs** (`\\` collapses to `\`) and breaks on
   awkward quoting. It silently produced a broken regex (`[\s\S]` became `[sS]`) and separately
   killed a heredoc containing apostrophes. **For any file content with regex escapes, apostrophes or
   Arabic text, use the `Write`/`Edit` tools, or write a Python transform to a file with `Write` and
   run it.** Do not fight the heredoc.
2. **Do not `git add -A`.** The last run swept an unrelated file into a phase commit that way and had
   to amend it. Stage explicit paths.

---

## Phase 11 — Finish F-15 on TopLight, the module Phase 2.6 only half-converted

This is the largest evidenced item left that is not blocked on the owner, and it is the same work
Phase 7.2 did for the other two companies.

**The state, verified:**

| Company | Direct `getRefsCached_` calls left | Behind the version stamp? |
|---|---|---|
| TopChemical | 1 (inside `tcRefs_` itself) | yes, all 29 sites |
| ValleyFoods | 1 (inside `vfRefsCached_` itself) | yes, all 23 sites |
| **TopLight** | **52** | **no** |

Phase 2.6 built `tlRefs_` / `tlCachedMap_` and a `tl_refs_ver_<dbId>` stamp, then applied it **only to
the Sales & Purchase form option builders**. The other **52** call sites still call `getRefsCached_`
directly at a 120s TTL, outside the stamp. So `bustTopLightCaches_` bumps a stamp those 52 entries
are not keyed on, and a product or party edit does **not** invalidate them — they linger for up to
120s regardless. That is the same gap 7.2 closed elsewhere.

**11.1 — Audit first, exactly as 7.2 did, and put the result in the commit message.**
For every reference sheet reached through `getRefsCached_` in `Company_TopLight_Actions.js`, list
every mutation site and confirm each one busts. The known mutators are `add_product`, `edit_product`,
`add_party`, `edit_party`, and the `bustTopLightCaches_` calls around cash/sales/purchasing — verify
that list rather than assuming it, and check for delete actions and for writes from other `.js`
files. **If coverage is incomplete, add the missing bust calls or leave that sheet's TTL alone — and
say which.**

Also check bust **placement**, which is what caught ValleyFoods out: 13 of its 15 busts fired *before*
their own write, leaving a race window equal to the TTL. Script the position of each mutation
relative to each bust rather than reading it by eye.

**11.2 — Check for the key-collision class before raising anything.**
`getRefsCached_` keys on `refs_<dbId>_<kind>`, and reusing one `kind` for two value *shapes* is what
produced the two live bugs in the last run. TopLight's counts are `parties` 23, `products` 15,
`categories` 5, `chart_of_accounts` 4, `boxes` 4.

One is already known and is **benign today, but is a latent hazard**: `'categories'` is a projected
`[{id, name_ar}]` at one site and a raw record array at four others. It works only because the four
raw consumers happen to read nothing but `.id` and `.name_ar`. Give it its own kind anyway. Check the
other four kinds the same way — do not assume they are clean because this one nearly was.

**11.3 — Convert.** One kind per `(sheet, shape)`, each reached through exactly one named accessor so
the collision cannot come back; route every site through `tlRefs_`; TTL **600s**, matching the other
two companies. Do not go to hours: a stamp cannot cover somebody editing a sheet by hand.

Note `tlCachedMap_` already exists and is stamped — leave it alone.

---

## Phase 12 — The 7.1 transformation on the endpoints that still slice after mapping

Phase 7.1 fixed one endpoint: `get_purchase_items` mapped every row ever into a derived object,
`.reverse()`d, and only then sliced to 10. **The same shape is still present at roughly fifteen more
endpoints**, mostly in `Company_TopChemical_Actions.js` and `Company_ValleyFoods_Actions.js`.

Find them yourself rather than working from a stale list — the reliable signal is a
`getAllRecords_(…).map(…)` (or `.slice(-300)`) followed later by
`if (!data || !data.loadAll) rows = rows.slice(0, limit)`. Grep for that `slice(0, limit)` line and
walk back.

**The transformation is already proven.** Reuse it verbatim:

```js
// order is computed on an index array first, so reverse().slice(0, limit) keeps
// its exact semantics while only the visible rows are mapped
var order = [];
for (var i = raw.length - 1; i >= 0; i--) order.push(i);
if (!data || !data.loadAll) order = order.slice(0, limit);
var rows = order.map(function (idx) { return mapRow(raw[idx]); });
```

**Keeping the `slice` on an index array is the point** — it is what makes a negative, fractional,
string or `NaN` `limit` behave identically. A counted loop does not. Phase 7.1 proved this over
40,000 randomised cases including every one of those `limit` values; rebuild that test and run it
against each endpoint's own map function.

**Per endpoint, before converting:**
- Reproduce the resulting order exactly — some sites `.slice(-300)` *before* reversing, some sort
  first, some do neither. Read each one; they are not uniform.
- Check whether the endpoint also builds **form option lists** the list view never renders. Where it
  does, split them into a separate `get_*_options` action, memoise it client-side on first form open
  with the `ensureOptions()` pattern, and keep the old combined response behind `withOptions:true`.
  **Check what the page actually renders before moving anything** — ValleyFoods purchasing had to keep
  `supplier_options` for exactly this reason, and TopChemical purchasing did not.
- `get_import_follow` in `Company_TopChemical_Actions.js` is the one the last run explicitly named as
  a one-line follow-up. Start there; it is the same file and the same shape as 7.1.

One commit per module. If an endpoint's ordering cannot be reproduced with confidence, **skip it and
record why** rather than guessing.

---

## Phase 13 — Gated: ask the user one question first

**Ask the user: "Has `inventorySpreadsheets()` been run yet, and can you paste the
`ERP_Perf_Inventory` output?"** Then take one of two branches. Do not ask anything else.

### 13a — If YES, and you have the row counts: Phase 4.1/4.2, at last

This is the largest single win left in the whole investigation and has been blocked since the first
run. ~150 whole-column formula references (`valley_products!$A:$I` → `$A$2:$I$<bound>`).

- Derive the bound **from the actual row counts**, per sheet, with generous headroom. Never guess.
- Put every bound in **one constant** so it can be raised in one place.
- A bound set too low does not fail loudly — `VLOOKUP` silently misses rows and `SUMIFS` silently
  undercounts, on costing and payroll data. Prefer far too high over slightly too low.
- Only touch formulas the **code writes**. Do not rewrite formulas already sitting in sheets — that
  is hard stop 2.
- Same verification discipline as Phase 8: slice old and new formula-producers from their own source,
  evaluate both under `node`, compare the strings.

### 13b — If NO: the two remaining code items, then stop

1. **ValleyFoods work-centre append loop.** `sheetWC.appendRow(vals)` inside a `forEach` in
   `saveValleyMfgOrder_` (near line 4290 — verify). It is a genuine N-appends-in-a-loop F-04 site
   that Phase 8 skipped, because it is a *mixed* update/append loop with a per-row
   `getNextIdUnderLock_` between iterations, and converting it changes the interleaving of appends
   and updates. Convert it only if you can show the resulting row contents and order are identical —
   the appended rows must land in the same order at the same row numbers, and the counter must still
   yield the same ids. **If you cannot show that, skip it again and say so; two skips with a reason
   is a better outcome than one silent corruption.**
2. **The NUL bytes in `03_Security.js`.** `getCompanyLogoUrl_` uses a raw NUL byte as a
   "cached empty string" sentinel (lines ~649 and ~652). It works, it makes `grep` treat the file as
   binary, and any editor or transfer that strips NULs breaks the logo cache silently. Replace the
   two raw bytes with `'\u0000'` escapes — same value, same behaviour, no NUL in the source. Verify
   the file contains zero NUL bytes afterwards and that `node --check` still passes.

---

## Phase 14 — Report

Append a **"Continuation run (Phases 11–14)"** section to `PERFORMANCE_RESULTS.md`. Do not start a
new results file — the owner should have one document, and it already carries two runs.

It must contain:
- what changed per phase, with commit hashes;
- what was skipped and why;
- every assumption made;
- **the TopLight F-15 gap explicitly acknowledged** — Phase 2.6 stamped only the form option
  builders and left 52 sites outside the stamp, and neither of the two previous reports says so. That
  omission should be visible in the record, exactly as the last run made the `get_purchase_items` gap
  visible;
- a **verification table** in the style of the existing §C2: each change, the test, the actual
  numbers;
- per-phase verification steps folded into the existing **§5 step 3** table;
- rollback commands for the new commits folded into the existing **§6**, including any ordering
  constraints between them.

Then update `NEXT_STEPS_OWNER.md` for anything that has become blocked-on-owner, or that has been
unblocked and done.

Be honest in it. If a phase went badly, or you were unsure about a conversion, say so plainly. The
value of that document is that it states its own failures at the top — keep that property.

---

## Still out of scope in this run (record, do not start)

- **Phase 4.4** — formulas → static values. Hard stop; proposal in §7.
- **Phase 3.4 / F-05** — bulk-rewrite deletes. Concluded unsafe as specified, with a concrete reason
  (the line sheets carry per-row formulas referencing their own row). Do not attempt it.
- **The five unregistered delete actions.** Hard stop 6.
- **F-03** (`Sheets.Values.batchGet`), **F-20** (shared bundle strategy), **F-11** (kill-switch
  cache), `SystemLog.ChangedFields` truncation, and `src_html/`. Leave all of them alone; `src_html/`
  in particular is not to be touched or deleted, only reported.
- **`saveValleyMfgOrder_`'s missing outer lock.** Pre-existing; Phase 8 gave each of its block writes
  its own lock, which fixes the overwrite race. A full transaction across its four sheets is a
  redesign, not an optimisation.
- **`UI_UX_INVESTIGATION.md`.** Not this workstream. Leave it untracked.

---

## Commit protocol

One commit per phase, or per module where the phase says so:

```
perf(phase-N): <short summary>

<what changed, file by file>
<what was verified, and how — with the actual numbers>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Do not push. The owner pushes.

---

## One thing to keep in mind throughout

**Nothing from any of these three runs has been executed against a real spreadsheet.** There is still
no staging, and 23 commits of unverified change are now stacked on the branch. Every phase you add
increases what has to be validated in one go when the owner finally deploys.

So: prefer finishing and proving what is already started over starting something new, keep each
commit independently revertable, and make the §5 verification steps you write genuinely usable by
someone clicking through the UI — they are the only testing this work will get before it meets
production data.
