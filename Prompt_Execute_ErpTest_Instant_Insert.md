# Prompt: execute `Plan_ErpTest_Instant_Insert.md`

*(paste everything below the line into a new session)*

---

You are implementing a fixed plan in this repository: a Google Apps Script ERP, pushed with clasp. The plan is `Plan_ErpTest_Instant_Insert.md` in the repository root.

**Read the plan in full before you touch anything.** Its PART A rules (A1–A8) govern you, and this prompt does not relax any of them. Where this prompt and the plan appear to differ, the plan wins — except for the four PRE-FLIGHT FACTS below, which were verified in this exact checkout and exist so you do not waste a phase discovering them.

**Your executable scope is P1, P2, P3, P4 — and nothing else.**

- **P0 is OWNER RUNS.** You do not open the perf dashboard, you do not measure, you do not write baseline numbers.
- **P5 is OWNER RUNS.** You never run `clasp push`, never set `ET_FAST_INSERT_ = true`, never call `etReseedInsertIds_`.
- **P6 is forbidden.** The plan says it is not authorised. Do not design it, do not mention it in code, do not start it even if P4 makes it look easy.

**You stop after every phase.** Per rule A1, after a phase's DONE-CHECK passes you print the DONE-CHECK evidence, print the commit hash, and then **stop and wait for the owner to write `PASS Pn` in chat.** Do not begin the next phase without that. This is the opposite of a run-to-completion task: four phases, four stops.

---

## PRE-FLIGHT FACTS (verified in this checkout — do not re-litigate, do not "fix")

### F1. Every file, and every string the plan quotes, is **CRLF**

`Code.js`, `Company_ErpTest_Actions.js`, `Company_TopLight_Actions.js`, `tools/erptest/gen_actions.js` and `tools/verify/run_all.js` are **pure CRLF** (`\r\n`), with zero bare LF lines, and the repo has **no `.gitattributes`**.

Consequences you must respect:

- Every multi-line find/replace must match and emit **CRLF**. A multi-line needle written with `\n` newlines matches **nothing** in these files. If a replacement reports "not found", check this before anything else.
- **Do not convert any file's line endings.** A file that comes back LF is a corrupt diff even if the code is right.
- This matters most in P3 — see F3.

### F2. Every anchor the plan quotes exists, exactly as quoted, and is unique

Verified by byte comparison. You should **not** hit rule A5 on any of these:

| Plan step | Anchor | Where it is now | Occurrences |
|---|---|---|---|
| P1.1 | end of `idHighWaterKey_` | `Code.js:1165–1168` | 1 |
| P1.2 | `function getNextIdUnderLock_(dbId, tableName, idColumnName = 'id') {` | `Code.js:1185` | 1 |
| P1.3 | `const ss = getSpreadsheet_(dbId);` + its 2-line comment | `Code.js:1194–1196` | 1 |
| P2A | the whole `return executeWithLock_(function () { … });` block | `Company_ErpTest_Actions.js:519–526` | 1 |
| P3 | the same block in the generator's input | `Company_TopLight_Actions.js:398–405` | 1 |

Supporting facts, also verified: `_idHighWater_` is `Code.js:1163`; `maxIdOf_` is `Code.js:1040`; `executeWithLock_` is `Code.js:1058`; `getSpreadsheet_` is `Code.js:688`; `tlDbCreate_` is `Company_ErpTest_Actions.js:508`; `tlSchema_` `:412`; `tlDbAppendRow_` `:499`; `tlDbRowRecord_` `:436`; `tlDbDeriveRow_` `:666`; `tlChartPositionalLookup_` `:777` (and it does return early on a blank code — `if (!wanted) return { name: '', main: '' };` — so the plan's `'__warm__'` sentinel note in 2B.1 is correct); `tlDeriveCash_` `:825`; `partyRefs_` `:2508`.

### F3. `tools/erptest/gen_actions.js` is **already broken on this checkout, before you change anything**

Running it right now fails with **12** codemod problems and exits 1. It reports `CODEMOD FAILED` and **bails before writing**, so `Company_ErpTest_Actions.js` is untouched by a failed run. The 12 are:

```
expected 1 of "        const sheet = getSheet_(CHART_SHEET, dbId);\n        ", found 0
expected 1 of "  function tlDbList_(dbId, table) {\n    const rows = etRecor", found 0
expected 1 of "    schemas[CASH_SHEET] = { key: 'transaction_id', required:", found 0
expected 1 of "    movements.sort(function (a, b) {\n      const ta = a.date", found 0
expected 1 of "    // Sales out dated by joined invoice date.\n", found 0
expected 1 of "        purchVal: purchVal,\n", found 0
expected 18 getSheet_( sites before P9/P10, found 19
expected 1 of "const ErpTest = (function () {\n", found 0
expected 1 of "    if (table === CURRENT_PRODUCTS_SHEET) return etStockRows", found 0
expected 1 of "  function bustTopLightCaches_(dbId, type) {\n    bumpTlRefsV", found 0
expected 1 of "    return actions[action](payload.data, user, dbId);\n  }", found 0
expected 1 of "    if (ET_SJS_READ) return etRows_(dbId, table);", found 0
```

Eleven of them are multi-line needles written as JS template literals. A template literal **normalises `\r\n` to `\n`**, so against a CRLF source they match zero times — that is F1 biting. The twelfth (`expected 18 … found 19`) is genuine source drift: `Company_TopLight_Actions.js` has gained a `getSheet_(` call site since the generator was written.

**This means P3's DONE-CHECK as written cannot pass, for reasons that have nothing to do with your work.** Handle it exactly as specified in P3 below. **Repairing those 12 problems is NOT your task.** It touches a dozen unrelated codemods across four plan areas, it is not in this plan, and attempting it is the single easiest way to turn this job into a regression.

Before you start P3, run the generator once and save its output to `tools/erptest/gen_baseline.txt`, so the report you hand the owner distinguishes pre-existing failures from anything you caused.

### F4. Test baseline — do not chase these

- `npm run verify` on this checkout: **36 of 128 checks FAILED.** Your bar is **no new failures**, compared check by check. Capture your own baseline first (step 4 below) — never compare against zero.
- `node tools/verify/erptest_clone_static.js` **already fails** on a clean tree. It is one of the 36.
- These pass on a clean tree and must still pass: `erptest_write_vm.js`, `erptest_parity_vm.js`, `erptest_mfg_vm.js`, `live_notice_server.js`, `s20_quiet_refresh.js`.

---

## Branch and setup

1. Work on a new branch `perf/et-instant-insert`, created from `master`. One commit per phase, message `et_instant Pn: <phase title>` (rule A8). **Do not push.**
2. Read `Plan_ErpTest_Instant_Insert.md` from the first line to the last.
3. Read, before editing: `Code.js` lines 1030–1210 (`maxIdOf_`, `executeWithLock_`, `_idHighWater_`, `idHighWaterKey_`, `getNextIdUnderLock_`); `Company_ErpTest_Actions.js` lines 499–560 and 660–700 and 777–860; `tools/erptest/gen_actions.js` in full (it is 492 lines).
4. Run `npm run verify` and save the whole output to `tools/verify/results/et_instant_baseline.txt`. Run the six tests named in F4 individually and save those too.
5. Say in 3–5 lines what you are about to do, then start P1. Do not wait for a reply before starting P1 — the waiting starts at the end of P1.

---

## P1 — the O(1) id counter

Do plan steps **1.1, 1.2, 1.3, 1.4** exactly as written. The code blocks in the plan are the code; copy them verbatim, including comments.

Three things the plan does not spell out and you must get right:

- **1.1 insertion point.** The new block goes **after** the closing `}` of `idHighWaterKey_` (`Code.js:1168`) and **before** the `/**` JSDoc comment that documents `getNextIdUnderLock_` (starts `Code.js:1170`). Do not insert it between that JSDoc and its function.
- **Do not delete or reword the existing JSDoc above `getNextIdUnderLock_`.** It contains the paragraph beginning *"Why the counter is gone:"* which records that a drifting counter previously handed out ids the data did not justify. That comment is load-bearing history and it is the reason `etReseedInsertIds_` and the DRIFT paragraph exist. Your new block sits beside it, not instead of it.
- **No identifier collisions.** The plan's fast branch deliberately uses `fastKey`, `fastNext`, `fastSeen`, `fastOut` because `key`, `next` and `seen` are already declared later in the same function body. Keep those names.

**DONE-CHECK P1** — run all four of the plan's checks and paste the output:

```
node -e "new (require('vm').Script)(require('fs').readFileSync('Code.js','utf8'))"
grep -c "fastCounter" Code.js                       # must print 1
grep -n "ET_FAST_INSERT_ = false" Code.js           # must print exactly one line
grep -n "getNextIdUnderLock_(" Code.js Company_*.js  # every call has 2 or 3 args, none has 4
```

Plus, because P1 must be provably inert (rule A6): confirm `git diff` touches **only** `Code.js`, and confirm the five tests from F4 that pass still pass.

Commit, print the hash, **stop, and wait for `PASS P1`.**

---

## P2 — narrow the lock

Do **P2A** then **P2B.1**. Both edit `Company_ErpTest_Actions.js` only.

- **P2A**: the find block is `Company_ErpTest_Actions.js:519–526`, verified unique (F2). Replace it with the plan's 2A text verbatim. Remember F1: the file is CRLF.
- **P2B.1**: insert the plan's warm-up block immediately **before** the `const lockedRowNumber = executeWithLock_(` line that 2A just created.
- **P2B.2**: do not touch `tlDbAppendValues_` (`:529`) or `tlDbAppendValuesBatch_` (`:543`).

**Two things you must not "improve":**

1. The plan's 2B.1 block opens with `const warmSchema = tlSchema_(table);` even though `const schema = tlSchema_(table);` is already in scope at `tlDbCreate_:514`. That redundancy is in the plan. **Write it as the plan wrote it.** Rule A7 is exact-string replacement; collapsing it to `schema.derived` would also break the P3 codemod, whose find/replace text must match this file byte-for-byte.
2. `tlDbDeriveRow_` stays **inside** the `executeWithLock_` callback. 2B.0 explains why: `tlDeriveCash_` sets `box_balance` from `tlCashBoxBalanceBefore_(...)`, a running balance over prior rows, which is only correct under the lock. Moving it out is the one change in this whole plan that can silently corrupt money. The P4 script asserts against it.

**DONE-CHECK P2** — the plan's four checks, plus the inertness proof:

```
node -e "new (require('vm').Script)(require('fs').readFileSync('Company_ErpTest_Actions.js','utf8'))"
grep -c "et_instant P2" Company_ErpTest_Actions.js   # must print 2
```

Then paste the new `tlDbCreate_` in full so the owner can see by eye that `tlDbDeriveRow_` and `tlDbAppendRow_` are inside the callback and `noteRecordChange_` and `tlDbRowRecord_` are outside it. Confirm `ET_FAST_INSERT_` is still `false`, so the warm-up block is skipped and `{ fastCounter: false }` takes the original branch. Re-run the five F4 tests.

Commit, print the hash, **stop, and wait for `PASS P2`.**

---

## P3 — teach the generator the P2 edit

The plan's 3.2 asks for **one** `replaceOnce` codemod, alongside the existing ones, performing the exact P2A + P2B transformation on the generated text. Do that and no more. 3.3 forbids editing `Company_TopLight_Actions.js` — that file is also on rule A3's never-edit list.

**3.a — where the codemod goes.** Immediately **after** the existing line

```js
replaceOnce('getNextIdUnderLock_(dbId, table)', "getNextIdUnderLock_(dbId, table, etCol_(table, 'id'))");
```

which is `tools/erptest/gen_actions.js:141`, under the `// ---------- 3.5.3 id-column arguments ----------` heading. Placing it **after** line 141 means your find text must contain the already-rewritten call, `getNextIdUnderLock_(dbId, table, etCol_(table, 'id'))`. Placing it before line 141 would require the bare `getNextIdUnderLock_(dbId, table)` form and would then break line 141's own `replaceOnce` count. Put it after.

**3.b — CRLF (this is where F1 will bite you).** The generator reads a CRLF file into a string. **Do not write your find or replace text as a template literal** — a template literal normalises `\r\n` to `\n` and your codemod will match zero times, exactly like the eleven broken ones in F3. Build both strings from an array of lines joined with an explicit `'\r\n'`, using a local constant declared next to your codemod, for example:

```js
// ---------- [et_instant P3] P2A + P2B, applied on the way into erp_test ----------
// CRLF is explicit: the source file is CRLF and a template literal would
// normalise it to LF, which is why the multi-line codemods above match nothing.
const ET_NL = '\r\n';
replaceOnce(
  [ /* the exact 8 lines of the block as it stands AFTER line 141 */ ].join(ET_NL),
  [ /* the exact lines P2 wrote into Company_ErpTest_Actions.js */ ].join(ET_NL)
);
```

The find text, as a JSON string so there is no ambiguity about whitespace — this is what the block looks like after line 141 has run:

```json
"    return executeWithLock_(function () {\r\n      if (idIdx !== -1 && String(row[idIdx]).trim() === '') row[idIdx] = getNextIdUnderLock_(dbId, table, etCol_(table, 'id'));\r\n      tlDbDeriveRow_(dbId, table, row, headers, {});\r\n      const rowNumber = tlDbAppendRow_(sheet, row);\r\n      noteRecordChange_(dbId, table, row[keyIdx]);   // [live-notice D5]\r\n      const record = tlDbRowRecord_(headers, row);\r\n      return { status: 'success', rowNumber: rowNumber, record: record, assignedId: row[keyIdx] };\r\n    });"
```

The replace text is **exactly** what P2 wrote into `Company_ErpTest_Actions.js` — read it back out of the file you just edited rather than retyping it, so the two can never disagree.

**3.c — do not change the number of `getSheet_(` occurrences.** `gen_actions.js:377` asserts a count of them (`expected 18 getSheet_( sites before P9/P10`) and it is already off by one (F3). Your replacement text contains no `getSheet_(`, so the count is unaffected. Keep it that way.

**3.d — verify your codemod in isolation, because the generator cannot run (F3).** Do not write any file. Run one throwaway node command that reads `Company_TopLight_Actions.js`, applies **only** line 141's replacement and then **only** yours, and prints the two match counts. Both must be `1`. Paste that output. If your find count is 0, it is F1/3.b — fix the newlines, not the plan.

**DONE-CHECK P3 — read this carefully, it does not end in a PASS.**

The plan's DONE-CHECK requires the generator to run with zero problems and reproduce the file byte-for-byte. **Per F3 that is impossible on this checkout and was impossible before you started.** So:

1. Run `node tools/erptest/gen_actions.js`. Confirm it still reports **the same 12 problems** as `tools/erptest/gen_baseline.txt` and **not 13** — if your codemod added a thirteenth, it is wrong and you fix it.
2. Confirm it still exits 1 and still leaves `Company_ErpTest_Actions.js` untouched: `git status --short Company_ErpTest_Actions.js` shows only the P2 modification, and the file's bytes are unchanged by the generator run.
3. Paste your isolation check from 3.d.
4. Then **STOP and invoke rule A5**: report to the owner, in plain terms, that P3's DONE-CHECK cannot pass because `gen_actions.js` has 12 pre-existing failures — 11 from CRLF-vs-template-literal normalisation, 1 from genuine `getSheet_` drift in `Company_TopLight_Actions.js` — and that repairing them is outside this plan. Say clearly that the P2 protection B4 asks for **is** in place (the codemod is written and proven to match), but that it cannot be end-to-end verified until the generator itself is repaired, which is a separate job the owner must authorise.

Commit the codemod (`et_instant P3: gen_actions reproduces the P2 lock narrowing`), print the hash, and wait. Do not proceed to P4 until the owner tells you to.

---

## P4 — the static verify script

Create `tools/verify/erptest_instant_insert.js` and register it in `tools/verify/run_all.js`.

Copy the shape of a sibling that reads source text only — `tools/verify/erptest_clone_static.js` or `tools/verify/request_guard.js`. It must: be `'use strict'`, read local files only, print one `PASS`/`FAIL` line per assertion, and `process.exit(1)` if any failed. No network, no Google services, no spreadsheet.

Implement the plan's seven assertions. For the two positional ones (5 and 6), do not eyeball it — slice the function and compare indices:

- take `tlDbCreate_`'s text: from `'  function tlDbCreate_('` to the next `'\r\n  }\r\n'`;
- inside that slice, find the index of `'executeWithLock_(function () {'` and the index of the callback's closing `'    });'`;
- assertion 6: the indices of `tlDbDeriveRow_` and `tlDbAppendRow_` both fall **between** those two;
- assertion 5: the indices of `noteRecordChange_` and `tlDbRowRecord_` both fall **after** the closing marker.

Remember F1 when you write those markers.

**DONE-CHECK P4:**

1. `node tools/verify/erptest_instant_insert.js` — all assertions PASS, exit 0.
2. **Prove it can fail.** Temporarily move `tlDbDeriveRow_` out of the lock in a scratch copy of the file (or patch the source string in memory), confirm assertion 6 FAILs, then revert. Paste both outputs. An assertion that cannot fail is not protecting anything, and assertion 6 is the `box_balance` guard.
3. `npm run verify` — compare check by check with `tools/verify/results/et_instant_baseline.txt`. **36 failing before, 36 after**, same checks by name, and `erptest_instant_insert` appears and passes. Report the count both ways and name any check whose status changed in either direction.

Commit, print the hash, **stop.** P5 is the owner's.

---

## Final report

After P4, post, in this order:

1. `git diff --stat master` and the four commit hashes.
2. The P4 script's output, plus the deliberate-failure proof from P4 step 2.
3. Baseline vs now for `npm run verify`: failure count before, after, and any check that changed status in either direction.
4. The P3 A5 report from its DONE-CHECK step 4, repeated verbatim, because it is the one thing in this job the owner has to decide about.
5. Anything else where reality differed from the plan, with `file:line` and one sentence each.
6. The exact next actions that belong to the owner, quoted from the plan: P0 (measure and record the six baseline numbers), then P5.1 `clasp push`, P5.2 `etReseedInsertIds_` with the sheet list — including the plan's own warning that tables keyed on `unique_id` / `invoice_unique_id` / `transaction_id` / `offer_unique_id` need their id column confirmed against `Company_ErpTest_Schema.js` first — then P5.3 flip `ET_FAST_INSERT_`, P5.4 the four inserts with the gapless-id and `box_balance` checks.

## Do not

- Do not run `clasp push`, `clasp deploy`, or anything that writes to a Google Sheet, Firestore or the network (A4).
- Do not set `ET_FAST_INSERT_` to `true`. It ships `false`; only the owner flips it, in P5.3.
- Do not call `etReseedInsertIds_`. It is owner-run from the Apps Script editor.
- Do not edit any file outside `Code.js`, `Company_ErpTest_Actions.js`, `tools/erptest/gen_actions.js`, plus the new `tools/verify/erptest_instant_insert.js` and the one line you add to `tools/verify/run_all.js`. Rule A3's never-edit list includes every other company's files, all four `Core_*.js`, `UI_Components.html`, `Client_Helpers.html` and `CSS_Tokens.html`.
- Do not edit `Company_TopLight_Actions.js` — not even to fix the `getSheet_` count drift (A3, and plan 3.3).
- Do not repair the 12 pre-existing `gen_actions.js` codemod failures (F3).
- Do not move `tlDbDeriveRow_` or `box_balance` out of the lock (2B.0).
- Do not touch `tlDbAppendValues_` or `tlDbAppendValuesBatch_` (2B.2).
- Do not add a session, authority or kill-switch cache, and do not extend any TTL. Plan B3 rejects it with an explicit design invariant, and PART D repeats it.
- Do not use `LockService.getDocumentLock()`. It returns `null` in a standalone web app and would throw on every insert (B2).
- Do not start P6, or leave a hook, comment or TODO pointing at it.
- Do not convert any file's line endings, and do not reformat, reorder or tidy a single line this prompt does not name.
