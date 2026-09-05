# Prompt — ERP performance run, continuation (Phases 7–10)

You are continuing a performance optimisation of a production multi-tenant ERP built on Google Apps
Script + Google Sheets, serving three companies (TopChemical, TopLight, ValleyFoods). Arabic RTL UI.
Repo root `d:\Work\Script`, remote `origin` (https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git).

**A previous session already executed Phases 0–6.** You are picking up where it stopped. Do not redo
its work and do not re-derive its analysis.

## Read these first, in full, before touching anything

1. `PERFORMANCE_RESULTS.md` — what the previous run actually did, what it skipped **and why**, every
   assumption it made, and the deployment/rollback procedure. **§3 "What was skipped, and why" is
   your work list.** Read §8 too — it lists real problems found along the way.
2. `PERFORMANCE_INVESTIGATION.md` — the 25 findings (F-01 … F-25) with file:line evidence. §15 is the
   Sales & Purchase deep-dive.
3. `PERFORMANCE_EXECUTION_PLAN.md` — the original 7-phase plan, now completed as far as it goes.
4. `PERF_BASELINE.md` — what was and was not measured, and two verified corrections to the
   investigation.

These are your specification. Verify a file:line reference before you edit it, then move on — do not
re-investigate findings that are already evidenced.

## Starting state

- Branch `perf/optimization-run`, 10 commits, working tree clean. `master` is untouched and is the
  rollback point.
- **Nothing has been deployed.** `clasp push` has never been run by an agent. No staging exists.
- `node --check` passes on all 19 `.js` files and the inline `<script>` of all 92 pages.

Confirm this before starting:
```bash
git branch --show-current      # perf/optimization-run
git status --porcelain | wc -l # 0
git log --oneline -11
```
Stay on `perf/optimization-run`. Do not branch again, do not rebase, do not push.

---

## Your task

Execute **Phases 7, 8, 9 and 10 below, in that order, back to back**, committing after each phase,
until all are complete or blocked. **Approval gates between phases are waived — do not stop to ask.**
Stop only for the hard stops.

---

## Hard stops — do NOT do these autonomously

1. **Never run `clasp push` against the production script id**
   (`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`), and never create or
   promote a deployment. Deploying is the owner's manual step.
2. **Never write to a business table.** No altering, deleting or adding **data** in any business
   table — not by hand, not by script, not as a "migration" or "backfill". This forecloses one
   tempting idea: retroactively rewriting the `VLOOKUP` formulas already sitting in existing rows so
   they match Phase 4.3's `INDEX/MATCH` form. **Do not do it.** If a backfill is genuinely the only
   fix for something, write it up as a proposal and move on.
3. **No schema changes.** No column added, renamed, removed or reordered in any business table. The
   two structural exceptions already taken (timing columns appended to the end of
   `SYSTEM_LOG_HEADERS`, and archive tabs) are done; take no new ones.
4. **Phase 4.4** (formulas → script-computed static values) stays unexecuted. It is written up as a
   proposal in `PERFORMANCE_RESULTS.md` §7 and is the owner's decision.
5. **Anything needing the owner's Google account** — running `dailyCsvBackup`, building staging,
   `clasp login`, installing triggers, setting Script Properties, running `inventorySpreadsheets()`,
   running `archiveOldRecords()`. Produce scripts and instructions, mark it blocked-on-owner, commit,
   continue.

---

## Rules for each phase

- **Verify every file:line reference before editing.** The docs were accurate when written; confirm
  rather than trust.
- Preserve all public contracts: backend function signatures, `UIC.*` / `API.*` / `FMT.*` / `UI.*`,
  and existing HTML anchor IDs (`tab-body`, `admin-root`, `dash-shell`, `mx-grid`, …).
- Match the surrounding style: ES5-flavoured V8, `function` declarations, IIFE namespaces per company.
  No build step, no npm packages, no new CDN dependencies.
- Where a change is per-page or per-module, do them one at a time with a clear commit each.
- **If a step turns out to be wrong, unsafe, or already done, skip it and record why.** A reported
  skip is fine. A silently broken save path is not. The previous run skipped three items on these
  grounds and was right to.
- **Prove equivalence where you can.** The previous run caught a real bug in its own change to
  `buildRecordsFromRaw_` by writing a differential test against the original implementation and
  running it over 40,000 randomised inputs under `node`. Do that whenever you rewrite a pure function.
- `node --check` every `.js` file after each phase, and parse the inline `<script>` of every page you
  touch.

### A trap the last session hit twice
The Bash tool mangles backslashes inside heredocs (`\\` collapses to `\`) and can break on quoting.
For any file content containing regex escapes or awkward quoting, use the `Write`/`Edit` tools, or
write a Python transform script to a file with `Write` and then run it. Do not fight the heredoc.

---

## Phase 7 — Finish Phase 2 (Sales & Purchase) across all three companies

The previous run did TopLight sales, TopLight purchasing and ValleyFoods purchasing. **It missed one
of the four endpoints named in investigation §15.2 and never said so.**

**7.1 — TopChemical `get_purchase_items` (never touched; only commit is `Initial commit`).**
At `Company_TopChemical_Actions.js:1600`. It maps **every** row into a derived object, `.reverse()`s,
*then* slices to 10. Apply the same treatment Phase 2 applied to TopLight:
- slice before mapping (watch the `.reverse()` — reproduce the resulting order exactly);
- split the form's options out into a separate cached action, fetched when the form opens, keeping
  any option list the **list view itself** renders (ValleyFoods purchasing kept `supplier_options`
  for exactly this reason — check what the page actually uses before moving anything);
- keep the old combined response available behind `withOptions:true`.
Update the calling page the same way (`ensureOptions()` memoised on first form open).

**7.2 — F-15 for the other two companies.** Phase 2.6 built `tlRefs_` / `tlCachedMap_` in
`Company_TopLight_Actions.js` — a version stamp bumped by `bustTopLightCaches_`, TTL 600s. Port the
same pattern to TopChemical (29 `getRefsCached_` sites at 120s) and ValleyFoods (`FIN_REF_TTL_G = 60`,
with an existing `vfBustRefs_`/`finBustRefs_` to hook).

**Do the audit first, exactly as Phase 2.6 did, and put its result in the commit message.** For each
reference sheet you plan to cache longer, list every mutation site and confirm each one busts the
cache. TopLight qualified because it had exactly four (`add_product`, `edit_product`, `add_party`,
`edit_party`) and all four already called the buster. **If a company does not have complete coverage,
either add the missing bust calls or leave that company's TTL alone — and say which.**
Keep 600s. Do not go to hours: a stamp cannot cover somebody editing the sheet by hand.

**7.3 — F-21 on the remaining pages.** The `.then(function(r){ toast; load(); })` pattern. Candidates
are listed in F-21; verify each still exists. **Apply the previous run's rule, unchanged:**
> Convert only saves that provably touch one row with no cascade. Any save that can affect stock,
> balances, or other rows keeps its full reload.

Also keep the full reload where a **list limit** makes a local patch wrong — after a delete, the 11th
row must become visible, and a local splice cannot do that. **List every page and every action you
considered, with the decision and the reason, in the phase report.** Getting this wrong shows stale
numbers in an ERP, which is worse than being slow.

---

## Phase 8 — Finish Phase 3 (F-04) on ValleyFoods and TopChemical

Phase 3 converted TopLight only, per the plan's module-by-module rule. Remaining:
- `Company_ValleyFoods_Actions.js`: **22** `writeFormula_` calls and 19 `appendRow`. Note
  `writeFormula_` is itself expensive — each call does `getSheet_` + `getHeaders_` + `setFormula`.
  `writeByproductFormulas_` issues four per row.
- `Company_TopChemical_Actions.js`: **3** `setFormula` and 11 `appendRow`.

Use the technique Phase 3 established and copy it faithfully:
1. Extract the formula strings **verbatim** into a `*FormulaMap_(headers, rowNum)` returning
   `{ columnIndex: formulaString }`.
2. Keep the original `set*Formulas_` / `writeFormula_` call path working as a thin wrapper over that
   map, so nothing else that calls it changes behaviour.
3. Merge the formulas into the value row and issue **one** `setValues`.
4. **Appends must run inside `executeWithLock_`**, and must grow the grid with `insertRowsAfter` if
   the block would exceed `getMaxRows()`. This is not optional: `appendRow` is safe against a
   concurrent append, a precomputed target range is not, and without the lock two simultaneous saves
   can compute the same start row and one silently overwrites the other. Updates to a row already
   located by its business key need no lock.
5. Row numbers must be identical to the old loop: `appendRow` placed line *i* at
   `getLastRow()+1+i`, which is `startRow + i`.

**The output must be byte-identical — formulas must remain formulas.** `setValues` treats a leading
`=` as a formula, which is what makes this work. Where you cannot verify a conversion is identical by
reading the code, **skip it and record it** rather than guessing.

One module at a time, one commit each.

---

## Phase 9 — F-01, the conservative variant

F-01 (request memoisation is disabled for every write, `Code.js` `apiRouter_`) is the highest-value
single item in the investigation. The previous run skipped it: correctness requires exhaustive
invalidation across ~144 direct write sites that bypass the data-layer helpers
(`Company_ValleyFoods_Actions.js` 58, `Company_TopChemical_Actions.js` 28,
`Company_TopLight_Actions.js` 24, `02_DataAccess.js` 14, `05_Admin.js` 13, `Code.js` 10, others),
and the failure mode is silent — a save reads a stale memo and writes wrong numbers into invoices.

**Do the conservative variant, which is safe by construction and needs no audit:**

> Keep the request memo **enabled** at the start of a write request. The **first** mutation of the
> request disables it — clearing the memo — for the remainder of that request.

That captures every duplicate read that happens *before* any write (which is most of them in the save
handlers: `saveValleyInvoice_` alone does 6 `getAllRecords_` calls), while behaving exactly as today
once any write has occurred. No read can ever be served from a memo taken before a write it did not
see.

Implementation notes:
- Add `noteMutation_()` to `02_DataAccess.js` that sets `_recordCacheDisabled_ = true` and clears the
  memo — this is what `disableRecordCache_` already does, so reuse it.
- Call it from every data-layer write helper: `addRecord_`, `updateRowByCriteria_`,
  `deleteRowsByCriteria_`, `logHistory_`, `getNextIdUnderLock_`, `getNextIdBatch_`.
- **Also call it from the direct write sites in the company Actions files** — those are the ones that
  bypass the helpers. Use the grep in `PERFORMANCE_RESULTS.md` §3 to enumerate them. This is the part
  that must be thorough; the conservative design means a *missed* site only costs you the safety
  margin on that one handler, not correctness across the app — but be thorough anyway and say how
  thorough you were.
- Change `apiRouter_` to stop calling `disableRecordCache_()` unconditionally for writes.
- **`getRecordsByPk_`'s index must be cleared alongside the memo** — it already is, in both
  `resetRecordCache_` and `disableRecordCache_`. Keep it that way.

Write a differential/behavioural argument in the commit message for why no read can be served stale.
If you conclude mid-way that the variant is not safe, **stop and revert it** rather than shipping it.

---

## Phase 10 — Docs housekeeping and the blocked-on-owner register

**10.1 — Move superseded `.md` files into `Backup/`.** Use `git mv` so history follows. `Backup/`
already exists and already holds superseded strategy docs
(`PERFORMANCE_OPTIMIZATION_STRATEGY.md`, `PROJECT_STRATEGY_OVERVIEW.md`, …), so it is the right home.

Judgement, not a blind sweep — decide per file and say why in the commit:
- Spent prompt files that have served their purpose: `Erp performance agent prompt.md`,
  `PERF_RUN_PROMPT.md`, and this file once you are done with it.
- Keep at root anything still actionable or still linked: `PERFORMANCE_RESULTS.md`,
  `BACKUP_SETUP.md`, `STAGING_SETUP.md`, `PERF_BASELINE.md`.
- `PERFORMANCE_INVESTIGATION.md` and `PERFORMANCE_EXECUTION_PLAN.md` are the standing specification
  and are cross-linked from `PERFORMANCE_RESULTS.md` — keep them at root unless you supersede them,
  and if you move anything, **fix the relative links that point at it**.

Note `.claspignore` already excludes `*.md` from the push set, so this is repo tidiness only, not
deploy weight. Confirm that is still true rather than assuming it.

**10.2 — Write `NEXT_STEPS_OWNER.md`**: a single short register of everything now blocked on the
owner, in priority order, each with the exact command or click-path and what to verify. Pull the
items from `PERFORMANCE_RESULTS.md` §3 and §5 rather than inventing them: run and restore-test the
backups, build staging, run `inventorySpreadsheets()`, install triggers, dry-run then run
`archiveOldRecords()`, and the two decisions still open (retention period; ValleyFoods purchasing's
10-row default). Do not duplicate the runbooks — link to them.

---

## Still out of scope in this run (record, do not start)

- **Phase 4.1/4.2** — bounding whole-column ranges. Genuinely blocked: choosing a bound needs real
  sheet row counts, and a bound set too low makes `VLOOKUP` silently miss rows and `SUMIFS` silently
  undercount on costing and payroll data. Blocked until `inventorySpreadsheets()` has been run by the
  owner. Do not guess a bound.
- **Phase 3.4 / F-05** — bulk-rewrite deletes. The previous run concluded this is unsafe as specified,
  with a concrete reason (the line sheets carry per-row formulas referencing their own row; `deleteRow`
  re-points them automatically, a `setValues` rewrite would not). Do not attempt it.
- **F-03** (`Sheets.Values.batchGet`), **F-20** (shared bundle strategy), **F-11** (kill-switch cache),
  `SystemLog.ChangedFields` truncation, and `src_html/`. Leave all of them alone; `src_html/` in
  particular is not to be touched or deleted, only reported.

---

## Commit protocol

One commit per phase (or per module where the phase says so):

```
perf(phase-N): <short summary>

<what changed, file by file>
<what was verified, and how>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Do not push. The owner pushes.

## Final deliverable

Append a **"Continuation run (Phases 7–10)"** section to `PERFORMANCE_RESULTS.md` — do not start a new
results file, the owner should have one document. It must contain:
- what changed per phase, with commit hashes;
- what was skipped and why;
- every assumption made;
- **the TopChemical `get_purchase_items` gap explicitly acknowledged** — the previous run silently
  missed one of the four endpoints its own phase was scoped around, and that omission should be
  visible in the record;
- updated deployment steps and per-phase verification for the new phases, folded into the existing §5;
- updated rollback commands for the new commits, folded into the existing §6.

Be honest in it. If a phase went badly, or you were unsure about a conversion, say so plainly. The
previous document's value is that it states its own failures at the top; keep that property.
