# Prompt: execute the live change notice plan (paste everything below the line into a new session)

---

You are implementing a fixed plan in this repository: a Google Apps Script ERP, pushed with clasp. The plan is `Plan_Live_Change_Notice_Per_View.md` in the repository root. Execute it **from P0 to P7 without stopping between phases**. Do not stop to ask for approval, for a phase gate, or for an owner review: those are collected in a runbook at the end.

**The goal, in one sentence.** Pages open fast from JSON cached on the device. The change notice «هناك تغييرات جديدة · اضغط للتحديث» becomes specific: it appears only when **someone else** saved to a table **shown in the view the user has open**, and says what changed, who changed it and when. The same stamps that drive the notice decide when cached JSON can be trusted, so many people can work at the same time without anyone acting on data that has already changed.

## Branch

Work on branch `claude/eloquent-edison-vute9i`. Create it locally if it does not exist; if it exists on the remote, check it out and pull it. Commit and push to that branch only. If a push fails because of the network, retry up to 4 times, waiting 2s, 4s, 8s and 16s between tries.

## Before you start

1. Read `Plan_Live_Change_Notice_Per_View.md` **in full**, from the first line to the last. Do not start work until you have read all of it.
2. Read `tools/liveviews/PROGRESS.md` if it exists: it records where a previous session stopped. Continue from the first step that is not DONE. If it does not exist, create it with this content:
   ```
   # live notice execution progress
   | When | Phase.Step | Result | Notes |
   |---|---|---|---|
   ```
3. Read the code the plan points to, before you change it:
   - `UI_Components.html`:
     - `UIC.Live`: `watchPage` ~8153, `arrive` ~8113, `userIsBusy`, `showFreshChip` ~8082
     - `UIC.Cache` ~6984
     - the last-paint / `.rt-stale` code
     - the `.uic-live-fresh` CSS ~5732
   - `Code.js`: `noteTableChange_` ~841, `readTableVersions_` ~856, `apiRouter_` ~6475 and the request-guard code around `__request_id` ~6808
   - `Client_Helpers.html` ~311–324, where `__request_id` is set
   - the `PAGE_TABLES` / `getPageVersions_` code in every `Company_*_Actions.js`
   - `tools/verify/gasstub.js`, `vf_workbook_stub.js`, `domstub.js`, `pageharness.js`
   - the existing live tests: `rt3_stamp_coverage.js`, `s13_forms_filters.js`, `s18_live_saves.js`, `s19_live_rollout.js`, `s20_quiet_refresh.js`
4. Run `npm run verify` once **before any change**, and save its output to `tools/liveviews/baseline_verify.txt`. It already has failures on the base commit (about 33 of 123). Your bar is **no new failures**, compared check by check with this baseline.
5. Tell me in 3–5 lines what you are about to do, then start at once. Do not wait for a reply.

## Rules

- **Phases in order, steps in order, no stops.** After each phase's DONE-CHECK passes:
  1. Commit `live-notice Pn: <title>`.
  2. Push the branch.
  3. Write `Pn DONE-CHECK: PASS` in chat.
  4. Start the next phase.
- **One PROGRESS row per step.** After each numbered step, append a row to `tools/liveviews/PROGRESS.md`, and say in one line in chat what you did and what the check showed.
- **Checks are real.** Run every test the plan names and show the relevant output lines. Never write "should pass".
- **You never run** `clasp push` or `clasp deploy`, and never write to a Google Sheet or to Firestore. The owner does those from the runbook (P7).
- **Owner reviews do not block you.** In P0, decide each view's tables yourself using the plan's rule, D2 ("every table whose data is visible in that view"), and write the reason beside each table.
- **Owner decisions:** use the defaults in PART F (OD1–OD8) unless this chat says otherwise.
- **If reality differs from the plan** (a function has another name, a line number moved, a page is built differently), do not stop. Choose the smallest change that keeps the plan's intent. Record it in `PROGRESS.md` with `file:line` and one sentence of why, and list it in the final report. Stop only if a change would lose data or break a company's existing behaviour, and then explain exactly why.
- **Backward compatibility is required:**
  - `get_page_versions` keeps its `versions` field;
  - a page that never calls `UIC.Live.setView` / `loadView` behaves as today (except that its own saves no longer raise the notice);
  - an old server reply (no `meta` or `views`) gives exactly today's behaviour.
- **Shared files** (`Code.js`, `UI_Components.html`, `Client_Helpers.html`, `CSS_Tokens.html`, every `Company_*` file) may be edited **only** where a plan step names them. Keep edits minimal and match the surrounding style: comment density, `var` versus `const`, Arabic user-facing text.
- **Testing System files are generated.** Change `Company_ErpTest_*` files only through their generators (`tools/erptest/gen_actions.js`, `gen_pages.js`, `gen_registry_nav.js`), plus direct edits to `Company_ErpTest_Manufacture*.html` and `Company_ErpTest_Packs.html`, which have no generator. Then regenerate, and keep `node tools/verify/erptest_clone_static.js` and the other `erptest_*` tests green.
- **Ids** always come from `max(id)+1` of the target table's own id column. Never create or use a counter sheet.
- **Tests you add** go in `tools/verify/` and are registered in `tools/verify/run_all.js`. They may read only local files.
- **Long session:** if the conversation gets long, finish the current step and update `PROGRESS.md` first. Then write the exact next step, so a new session can resume from `PROGRESS.md` without losing work.

## Final report (after P7)

Write it in chat, and put the same content at the top of `tools/liveviews/OWNER_RUNBOOK.md`:

1. What was built, per phase, with file names.
2. What was verified: each test name and its result. For `npm run verify`, the head versus baseline failure counts and any new failures (there must be none).
3. Every place you deviated from the plan, and why.
4. The owner's steps, in order: review `inventory.md` and `labels.md`; `clasp push`; the two-browser check per company; the fast-load check; how to switch the view cache off.
5. The pull command for the owner's PC:
   `git fetch origin && git checkout claude/eloquent-edison-vute9i && git pull origin claude/eloquent-edison-vute9i`

Start now.
