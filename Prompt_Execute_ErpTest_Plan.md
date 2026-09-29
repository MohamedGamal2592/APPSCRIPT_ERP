# Prompt: execute the erp_test plan (paste everything below the line into a new session)

---

You are implementing a fixed, pre-approved plan in the repository `D:\Work\Script`. It is a Google Apps Script ERP, pushed with clasp; you are on Windows with Git Bash and PowerShell available. The plan is `Plan_ErpTest_Clone_JSON_Fast_Data.md` in the repository root. Your job is to execute it **exactly as written**. You are not asked to review it, improve it, or design anything.

## Before you do anything

1. Read `Plan_ErpTest_Clone_JSON_Fast_Data.md` **in full**, from the first line to the last. Use several reads if needed. Do not start work until you have read all of it.
2. Read `tools/erptest/PROGRESS.md` if it exists. It records where the previous session stopped. If it does not exist, create it with this content:
   ```
   # erp_test execution progress
   | When | Phase.Step | Result | Notes |
   |---|---|---|---|
   ```
3. Tell me in 3–5 lines which phase and step you will do next and what you need from me for it (if anything). Then start.

## How to work

- **Follow PART A of the plan as hard rules.** In particular:
  - phases in order, steps in order
  - never edit the files A3 forbids
  - never run `clasp push`, `clasp deploy`, or anything that writes to a Google Sheet or to Firestore
  - exact-string replacements in the listed order
  - fixed names from PART B only
- **One step at a time.** After each numbered step:
  1. Append one row to `tools/erptest/PROGRESS.md`.
  2. In chat, say in one line what you did and what the check showed.
- **Checks are mandatory.** When a step or DONE-CHECK says to run a command, run it and show me the relevant output lines. Never write "should pass" without having run it.
- **OWNER RUNS steps.** When a step is marked OWNER RUNS or OWNER DOES:
  1. Stop.
  2. Give me the exact thing to run (function name, command, or file to paste) and exactly what output to send back.
  3. Wait for my reply. Do not continue past it on your own.
- **Phase gates.** When a phase's DONE-CHECK passes, create the git commit named in rule A8, and write `P<n> DONE-CHECK: PASS` in chat. Then wait until I reply `PASS P<n>` before starting the next phase.
- **STOP means stop.** If a step says STOP, a check fails, or anything in the repository differs from what the plan says (a missing file, a function with another name, a different occurrence count, an unexpected header), then:
  1. Stop immediately.
  2. Report what the plan expected, what you found, and the `file:line`.
  3. Do not work around it, do not guess, and do not "fix" the plan. Wait for my instructions.
- **No extra work.** Do not refactor, rename, reformat, add comments, "tidy" code, or touch anything the current step does not name. If you notice a problem outside the step, mention it in one line and move on.
- **Ids.** New ids always come from `max(id)+1` read from the target table's own id column, through the existing `getNextId*` helpers as the plan specifies. Never create or use a counter sheet.
- **Local scripts.** The `tools/erptest/*.js` and `tools/verify/*.js` scripts you write may only read local files. Apps Script functions for me to run go in `tools/erptest/*.gs.txt` files, which are not pushed.
- **When unsure:** if a step can be read two ways, pick neither. Quote the step and ask me.

## Session boundaries

If the conversation gets long, first finish the current step and update `PROGRESS.md`. Then tell me the exact next step, so a new session can resume from `PROGRESS.md` without losing work.

Start now with the three "Before you do anything" actions.
