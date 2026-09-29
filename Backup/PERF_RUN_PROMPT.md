# Initial prompt — paste into a new conversation

---

You are working on a production multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods). Arabic RTL UI. Repo root is
`d:\Work\Script`, git branch `master`, remote `origin`
(https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git).

## Read these two files first, in full, before doing anything else

1. `PERFORMANCE_INVESTIGATION.md` — 25 findings (F-01 … F-25), each with file:line evidence.
   §0.1 has the owner's answers. §15 is the Sales & Purchase deep-dive.
2. `PERFORMANCE_EXECUTION_PLAN.md` — the 7 phases you are executing.

These are your specification. Do not re-derive the analysis; it is done. Do not re-investigate
findings that are already evidenced — verify a line reference before you edit it, and move on.

## Your task

Execute **every phase of `PERFORMANCE_EXECUTION_PLAN.md` in order, back to back**, committing after
each phase, until all phases are complete. The owner has explicitly waived the per-phase approval
gates described in the plan — do not stop to ask for approval between phases. Stop only for the
hard stops listed below.

## Step 0 — before any other work

1. Create a working branch off `master`: `perf/optimization-run`. All work happens there.
   `master` stays untouched as the rollback point.
2. Commit the entire current working tree as a single baseline commit — 39 modified files and
   6 untracked files, including the two performance `.md` docs. Message:
   `chore: baseline commit before performance optimization run`
   This is a safety snapshot, not curated work. Do not try to split or tidy it.
3. Confirm the tree is clean before starting Phase 0.

## Hard stops — do NOT do these autonomously

1. **Never run `clasp push` against the production script id**
   (`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`), and never create
   or promote a deployment. `clasp push` publishes straight to the live system. All your work stays
   local and committed; **deploying is the owner's manual step.** At the end, give exact deploy
   instructions.
2. **Phase 4.4** (converting sheet formulas into script-computed static values) — do **not** execute.
   It is hard to reverse and changes data-model behaviour. Do Phases 4.1–4.3, then write up 4.4 as a
   concrete proposal with the specific formulas and expected value diffs, and stop there.
3. **Anything needing the owner's Google account** — copying spreadsheets, creating the staging
   Apps Script project, `clasp login`, installing triggers, setting Script Properties. Produce the
   scripts and step-by-step instructions, mark the phase as blocked-on-owner, commit what you have,
   and continue with phases that don't depend on it.
4. **No schema changes.** No column added, renamed, removed or reordered in any business table.
   The two structural exceptions are pre-authorised in the plan: appending timing columns to the
   end of `SYSTEM_LOG_HEADERS`, and archive tabs (same columns) in Phase 5.

## Rules for each phase

- Work strictly from the plan's step list for that phase. Do not add scope. Do not "improve" code
  the plan does not name.
- **Verify every file:line reference before editing.** The docs were written against the current
  tree, but confirm rather than trust.
- Preserve all public contracts: backend function signatures, `UIC.*` / `API.*` / `FMT.*` / `UI.*`,
  and existing HTML anchor IDs (`tab-body`, `admin-root`, `dash-shell`, `mx-grid`, …).
- Match the surrounding code style — the codebase is ES5-flavoured V8 with `function` declarations
  and IIFE namespaces per company. Do not introduce a build step, npm packages, or new CDN
  dependencies.
- Where a change is per-page or per-module (F-04, F-21, F-05), do them one at a time with a clear
  commit each, not as one sweeping change.
- If a step turns out to be wrong, unsafe, or already done, **skip it and record why** in the phase
  report. Do not force it.

## Commit protocol

After each phase, one commit:

```
perf(phase-N): <short summary>

<what changed, file by file>
<what was verified>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Do not push. The owner pushes.

## Phase-specific guidance

**Phase 0 — Safety net.**
Step 1 (backups) is the priority: `dailyCsvBackup` in `07_Backup.js` references `DB_CONFIG`, which
is defined nowhere, so it has never produced a backup. Define it (derive from `ERP_Companies` so it
cannot drift), and set `CONFIG.BACKUP_FOLDER_ID`. Trigger installation is owner-manual (hard stop 3).
Step 2 (staging) is mostly owner-manual — write the setup script and a `STAGING_SETUP.md` runbook,
then continue. Note the useful fact: there is exactly one hardcoded spreadsheet id in the codebase
(`00_Config.js:9`), so a single switch redirects everything. Recommend reading it from a Script
Property with the current value as fallback.

**Phase 0b — Instrumentation.**
The plan assumes ~1 week of production data. **You cannot wait.** Instead: implement the
instrumentation, run the read-only spreadsheet/formula inventory script if credentials allow,
capture whatever immediate baseline you can, document that the week-long sample was not collected,
and proceed. Do not block.

**Phase 1 — Safe wins.** Nine independent items. One commit per item is fine, or one for the phase;
just keep each item separately revertible.

**Phase 2 — Sales & Purchase.** The owner's actual pain. See investigation §15. Steps 2.6 and 2.7
are the medium-risk ones — the plan says to bring a list to the owner first. Since gates are waived:
implement them, but be conservative. For 2.7, **any save that can affect stock, balances, or other
rows must keep its full reload** — only convert saves that provably touch one row. List every
decision in the phase report.

**Phase 3 — Write path.** Highest risk. For every converted write site, the output must be
byte-identical — formulas must remain formulas. Where you cannot verify a conversion is identical
by reading the code, skip it and record it rather than guessing.

**Phase 4 — Formulas.** Gated on the Phase 0b inventory. If the inventory could not run, restrict
yourself to formulas the code itself writes (grep-able, regenerable) and do not touch anything
hand-authored. 4.4 is a hard stop.

**Phase 5 — Retention.** Blocked on an unanswered question (retention period). Assume **24 months**,
state the assumption prominently, implement archiving so the period is a single config constant, and
proceed.

**Phase 6 — Hygiene.** Harvest the TableEngine chunked cache and PK index into the data layer
*before* deleting the dead dispatch. `src_html/` is unresolved — **do not delete it**; just report it.

## Unanswered questions — assume and document, don't block

- Retention period → assume 24 months, make it a config constant.
- Installed triggers → assume none are installed; write what's needed into the runbook.
- Peak concurrency → assume 10–20 concurrent users.
- `src_html/` → leave it alone entirely.
- Deploy/rollback → document `git revert` per phase commit plus CSV restore as the path.

## Final deliverable

When all phases are done (or blocked), write `PERFORMANCE_RESULTS.md` containing:
- What changed per phase, with commit hashes
- What was skipped, and why
- Every assumption you made
- **Exact deployment instructions** for the owner, in order, including what to verify after each
- The rollback procedure for each phase
- Phase 4.4 written up as a proposal for a separate decision
- Anything you found along the way that the owner should know about

Be honest in that document. If a phase went badly or you were unsure about a conversion, say so
plainly. A skipped step that is reported is fine; a broken save path that is not is not.
