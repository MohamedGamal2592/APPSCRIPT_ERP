# Prompt — execute Plan_Page_Boot.md

Copy everything below the line into a new session opened in the project folder.

---

You are executing a fixed plan in this repository — a Google Apps Script ERP, pushed with clasp — **in the current project folder, as it is right now**. The plan is **`Plan_Page_Boot.md`** in the repository root.

**Read the plan in full before you run anything.** Its PART A rules govern you and this prompt does not relax any of them. Where this prompt and the plan seem to differ, the plan wins.

## What kind of job this is

You do **not** write code. Every change is made by a tool that already exists in `tools/pageboot/`. Your job is to:

1. run the commands the plan lists, exactly as written, from the repository root;
2. compare each output with what the plan says it must be;
3. commit after each phase's DONE-CHECK passes;
4. at the end: tag the result `page-boot-v1` and run `clasp push` once;
5. report.

**Run the whole plan in one go — P0, P1, P2, P3, P4, P5, P6, P7 — without asking for approval between phases.** The owner is not watching between phases. The only thing that stops you is a STOP condition (below); then you stop and report, and wait.

If an output differs from what the plan says in any way, you stop. You never fix, retry with changes, edit a file by hand, or "work around" anything. Stopping is always safe: `apply.js` never changes a file when it fails.

## Pre-flight facts (verified — do not re-check or "fix" them)

- **F1. The folder is not clean, on purpose.** It holds the plan's files plus the owner's own uncommitted work. P0 creates branch `perf/page-boot` from wherever the folder is and commits **everything** in it as the starting state (`git add -A`). That is the owner's decision; do not ask about it, do not leave anything out.
- **F2. Some `npm run verify` checks already fail today.** That is expected. Never run `npm run verify` on its own and never judge its count yourself: `check.js --baseline` (P0) records today's state, and every `check.js --wave N` proves that nothing that passed before fails now. Its line `npm run verify: no check that passed before fails now` is the only thing that matters.
- **F3. Slow commands.** `check.js --baseline` and every `check.js --wave N` run the full test suite; each takes a few minutes. Wait for them. Do not interrupt, do not run them in the background, do not run two at once.
- **F4. `check.js` briefly rewrites `Page_Boot_Reads.js` and puts it back byte-for-byte.** By design; the file is unchanged when it finishes.
- **F5. Wave 1 also regenerates `design_preview/_sources.js`.** It is one of the seven files P1 expects to change.
- **F6. Line endings.** The tools keep every file's own line endings (most files are CRLF). Never convert line endings. Git may print `LF will be replaced by CRLF` warnings — they are not errors.
- **F7. `clasp push` does not upload the plan or the tools** (`.claspignore` excludes `*.md`, `tools/**`, `design_preview/**`). It uploads the project's code only. It does not deploy.
- **F8. Out of scope, leave alone:** the measurement page `et_customers_perf`, `diagPing` and the `diag_timing` breakdown in `Code.js`, every MySQL page, every system page. The plan lists them on purpose (PART E, PART F).

## The commands, in order

These are the plan's steps, collected so you can check you missed none. The plan's text is authoritative for what each output must say.

**P0 — Start state and baseline**
```
git branch --show-current
# if not perf/page-boot:
git branch --list perf/page-boot                # must print nothing
git checkout -b perf/page-boot
git status --short                              # note it; if not empty:
git add -A
git commit -m "page_boot: starting state (the folder as it was before the plan)"
git status --short                              # must print nothing
node tools/pageboot/inventory.js                # must print exactly the counts line in the plan
git diff --exit-code tools/pageboot/inventory.json   # must exit 0
node tools/pageboot/check.js --baseline         # must print "PASS  baseline recorded: …"
```
Commit `page_boot P0: baseline`.

**P1 — Wave 1 (framework + et_customers, et_products)**
```
node tools/pageboot/apply.js --wave 1 --dry-run # last line: "wave 1: dry run — every step is ready; nothing was written."
node tools/pageboot/apply.js --wave 1           # last line: "wave 1: applied. …"
node tools/pageboot/check.js --wave 1           # last line: "wave 1: all checks PASS"
git status --short                              # exactly the seven files the plan names
```
Commit `page_boot P1: framework + pilot (et_customers, et_products)`.

**P2 … P6 — Waves 2 to 6** (N = 2, 3, 4, 5, 6 — one wave per phase, in order)
```
node tools/pageboot/apply.js --wave N --dry-run # last line: "wave N: dry run — every step is ready; nothing was written."
node tools/pageboot/apply.js --wave N           # last line: "wave N: applied. …"
node tools/pageboot/check.js --wave N           # last line: "wave N: all checks PASS"
git status --short                              # only Page_Boot_Reads.js changed
```
Commit `page_boot PN: wave N — <title from the plan's table>`:
`page_boot P2: wave 2 — ErpTest`, `page_boot P3: wave 3 — TopLight`, `page_boot P4: wave 4 — ValleyFoods`, `page_boot P5: wave 5 — TopChemical (Sheets pages)`, `page_boot P6: wave 6 — Assessment`.

**P7 — Tag, push to Apps Script, report**
```
git status --short                              # must print nothing
git tag --list page-boot-v1                     # must print nothing
git tag -a page-boot-v1 -m "page boot: 126 pages embed their first reads (Plan_Page_Boot.md)"
clasp push                                      # must finish without a question and report the files pushed
```
Then the report (below).

## STOP conditions — the only reasons to stop before the end

Stop at the first one of these, do not run the next command:
- a command exits with a non-zero code;
- any output line starts with `FAIL`;
- `git status --short` shows a file the step did not name;
- a command asks a question (for example `clasp push` asking to overwrite the manifest) — answer nothing;
- `clasp` is not installed or not logged in.

Then report:
- the phase and the command;
- every line that starts with `FAIL` (or the error), verbatim, plus the lines indented under it;
- `git status --short` and `git log --oneline -5`.

And wait. Do not re-run the failed command with different arguments, do not open or edit a file to investigate unless the owner asks.

## The final report (after `clasp push`)

In this order:
1. `git log --oneline` from the starting-state commit (or P0's commit) to the tag, and `git show --stat --oneline page-boot-v1 | head -5`.
2. The full output of the last `node tools/pageboot/check.js --wave 6` (from P6).
3. The last lines of `clasp push`.
4. The pages in the plan's PART F whose decision is not BOOT, unchanged.
5. Anything that differed from the plan, one sentence each with the file and the command that showed it.
6. The plan's **P8 — Owner checks after the run**, copied as it is, so the owner knows what to check next.

## Do not

- Do not write, edit, reformat or delete any file by hand. That includes `Code.js`, `Client_Helpers.html`, any page, `Page_Boot.html`, `Page_Boot_Reads.js`, and everything under `tools/pageboot/`.
- Do not edit `inventory.json`, `inventory.md`, `overrides.json`, `waves.json`, `manifest.json`, or anything in `tools/pageboot/patches/` or `tools/pageboot/files/`.
- Do not run `clasp deploy`, `clasp push --force`, or anything that creates or changes a deployment. Do not touch Google Sheets, Script Properties or Firestore.
- Do not `git push`, rebase, amend, reset, stash, revert or delete a branch or tag — unless the owner asks in chat for the plan's PART D rollback; then do exactly what PART D says.
- Do not skip `--dry-run`, and do not run two waves in one phase.
- Do not run `clasp push` before every wave has passed, and do not run it more than once.
