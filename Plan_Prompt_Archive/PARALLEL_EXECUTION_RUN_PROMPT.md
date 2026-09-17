# Run both programmes to completion, in parallel, unattended — orchestration prompt

Execute **two** existing run prompts to their end, at the same time, without pausing for approval
between phases or between runs, and prove both finished correctly before reporting done:

* **Run B — [VF_SALES_BATCH_EDIT_RUN_PROMPT.md](VF_SALES_BATCH_EDIT_RUN_PROMPT.md)**
  فواتير المبيعات: the save crash, the lost allocations, the in-place batch upsert. 4 steps.
* **Run A — [OPTIMISTIC_SAVE_RUN_PROMPT.md](OPTIMISTIC_SAVE_RUN_PROMPT.md)**
  ids from the table + the AppSheet-style save rollout. Phases A→D, ~17 commits.

Those two files are the **specifications**. This file only says how to run them together, what may
never be done, and what proof is required before either is called finished. **Where this file and a
source prompt disagree, the source prompt wins — except for the overrides in §3, which are
deliberate.**

You are working on a **production** multi-tenant ERP on Google Apps Script + Google Sheets, four
companies, Arabic RTL. Repo root `d:\Work\Script`, remote `origin`. Both runs write **code only**.

---

## 0. How the human launches this (read once, then ignore)

Unattended means no permission prompts. This prompt cannot grant that — the CLI does:

```bash
cd d:/Work/Script
claude --dangerously-skip-permissions      # zero prompts; or use an allowlist instead
```

An allowlist is the safer alternative: run `/fewer-permission-prompts` once, approve `node`, `git`
and file edits, then launch normally. Either way the run stays bounded by §2 — **no push, no clasp,
no deploy, no business-table write** — which is what makes an unattended run acceptable at all.

Then paste: *"Follow PARALLEL_EXECUTION_RUN_PROMPT.md."*

---

## 1. The isolation model — this is not optional, and it is not symmetric

`git status` currently shows ~38 entries from several other efforts. Two of them decide the layout:

| File | State | Consequence |
|---|---|---|
| `UI_Components.html` | **dirty** — another effort's `applyDateFilter` / `exportExcel` / `printTable` | Run A edits this file heavily and must stage **only its own hunks** around that work (its prompt §Starting state shows the `git apply --cached --recount` technique). It therefore **must run in the main working tree**, where that uncommitted work actually exists. |
| `Code.js` | dirty | Neither run touches it. Leave it. |
| `Company_ValleyFoods_Actions.js`, `Company_ValleyFoods_Sales.html`, `tools/verify/run_all.js`, `02_DataAccess.js` | **clean** | Run B's whole file set is clean, so B loses nothing by working from a committed checkout. |

So:

* **Run A stays in the main tree** `d:\Work\Script`, on a new branch `feat/optimistic-saves` created
  from HEAD (`git checkout -b` keeps the uncommitted work in place — that is the point).
* **Run B works in its own git worktree**, created from the same HEAD:

```bash
git worktree add -b fix/vf-sales-batch-edit ../Script-sales HEAD
```

  Its checkout is **clean**, which overrides Run B's "the tree is dirty" section — there is nothing
  of anyone else's to protect there, and its `git checkout -b` instruction is replaced by the
  worktree command above. Everything else in its prompt applies unchanged.

Launch both as background agents from one session — Run B **first**, so that if anything goes wrong
the outage fix is the work that survives. Run A is not isolated (main tree); Run B is
(`isolation: "worktree"`). Each agent is given its source prompt path, this file's §2 and §3, and
nothing else to decide.

If subagents are unavailable, the human runs the two prompts in two terminals — same branches, same
directories, same rules.

### File ownership — neither run edits the other's files, ever

| Run A owns | Run B owns |
|---|---|
| `02_DataAccess.js` | `Company_ValleyFoods_Sales.html` |
| `UI_Components.html` | `saveValleyInvoice_` + `getValleyInvoiceFull_` **only**, inside `Company_ValleyFoods_Actions.js` |
| every page HTML in its Tier A/B census | its results doc `VF_SALES_BATCH_EDIT_RESULTS.md` |
| `Company_ValleyFoods_Actions.js` **except** the two sales functions above | |
| its own results doc | |

**`tools/verify/` belongs to neither run** — it is read-only for both (§2.11). Nothing under it is
created, edited or deleted, `run_all.js` included.

Shared, by necessity:

* **`Company_ValleyFoods_Actions.js`** — A works around `saveValleyMfgOrder_` (~L5650–5685) and the
  Tier A/B handlers; B works inside `saveValleyInvoice_` (~L8135–8455). Disjoint regions in separate
  worktrees. Neither agent "tidies" the other's region, and neither fixes a defect it notices in the
  other's region — it writes it in its results doc instead.

`ValleyFoods/Sales` is **Tier C** in Run A's census — Run A does not convert it, does not import
`UIC.Live` into it, and does not touch its overlay. That is what makes the parallelism safe.

---

## 2. Inherited hard constraints — the union of both prompts, none negotiable

### Who they bind, and for how long

**Every constraint below binds *you*, for the duration of this run. None of them binds the owner.**

The owner edits the spreadsheets by hand, and will do so immediately after this run — deleting
allocation rows invoice by invoice, adjusting quantities, adding and removing whatever they judge
necessary. They may equally edit or delete any code, document or test this run produces. That is
normal and expected, and it is not your business to prevent, detect or compensate for it.

So, concretely:

* **Write no guard against manual editing.** No tamper detection, no checksum, no protected range,
  no "this row was not created by the app" validation, no reconciliation pass that flags rows a
  human changed, no lock on a sheet or a column.
* **Assume the data moves under you.** Rows can appear, change and vanish between two reads by
  means outside the code. Read what is there at the time you read it; do not cache a business
  quantity across a save and do not treat a surprising value as corruption to repair.
* **Leaving work for the owner's hands is a valid outcome**, not a failure to engineer around. When
  something can only be done by a human with the sheet open, put it in the checklist and move on.

Read both prompts' constraint sections in full. In summary, and binding on both runs:

1. **NEVER deploy or push.** No `clasp push` against `1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM`,
   no deployment, no `clasp login/run/open`, no `git push`, no rebase onto `origin`. **The owner
   pushes.**
2. **NEVER add a row, edit a row, or delete a row — in any table, in any spreadsheet, by any means.**
   No backfill, no migration, no repair pass, no integrity scan, no seed or fixture data, no "fix
   all invoices" helper, flagged or not, guarded or not, `dryRun` parameter or not. Not by hand, not
   via `clasp run`, not via a one-off function you write and execute. If a defect can only be proven
   by writing a row, it stays unproven and goes in the owner's checklist.

   **The distinction that matters:** this binds **you, during this run**. It does not change what
   the application does when the owner uses it. Run B's whole purpose is that saving an invoice
   *adds* an allocation row for a new batch, *updates* one whose quantity changed, and *deletes* one
   whose batch was removed — that is the feature being built, and it is required. Writing that code
   is allowed; **running it against a real sheet is not.**
3. **NEVER change any schema.** No column or sheet added, renamed, removed, reordered or retyped, in
   any business table, in any of the four company spreadsheets or the auth spreadsheet. No new tab.
   Neither run adds a `settingsEnsureSheet_` call to a table that did not already have one, and
   neither widens an existing one's header list.
4. **NEVER touch the owner's Google account** — no triggers, no Script Properties, no running a
   server function.
5. **NEVER weaken a validation** to make a path succeed, and never relax a server check to make an
   optimistic save feel better.
6. **NEVER break a public contract** — `UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `SESSION.*`,
   every handler signature, every response shape, every anchor id.
7. **`valley_current_products.current_qty` is the stock authority.** Never subtracted from,
   recomputed, reconciled or audited. Never reference `valley_products_movement`.
8. **NEVER use `ID_Counter` for an id** (Run A §1) and never let two rows get the same id.
9. **NEVER touch `src_html/`** — a stale tracked copy that nothing deploys.
10. **Stage explicit paths only.** Never `git add -A`, never `git add .`, never `git commit -a`, and
    never `git checkout --` a file that carries someone else's uncommitted work.
11. **NEVER write a test.** No new file under `tools/verify/`, no new `STEPS` entry in
    `tools/verify/run_all.js`, no edit to any existing verify script, no test framework, no fixture
    file. This cancels the test steps in both source prompts — see §3.4. The existing suite is still
    **run**, constantly, and must stay green; it is simply never **added to**.

Three outcomes are never acceptable: an id path that can hand out a duplicate; a queued write that
can be committed twice; a form marked converted whose save still blocks.

---

## 3. Overrides — the only places this file beats the source prompts

1. **Phase boundaries are no longer stop points.** Run A's «Phase boundaries are stop points»
   section is overridden: A→B→C→D run continuously, and Run B's four steps run continuously. Do not
   pause, do not summarise-and-wait, do not ask whether to continue. Nobody is watching.
2. **Never ask the user anything.** Every question — including Run A's three «Blocked on the owner»
   items — is answered by implementing the **stated default**, recording it as an open question in
   that run's results doc, and continuing.
3. **Neither run waits for the other.** No handoff, no coordination commit, no shared branch.
4. **Every test step in both source prompts is cancelled** (constraint §2.11). Specifically:
   * Run B: **S4's test file is not written** — no `tools/verify/s28_sales_batch_edit.js`, no
     `STEPS` line. S4 becomes the results doc alone. The eleven numbered assertions in that section
     stop being a file to commit and become the **checklist the reviewer verifies by reading the
     diff** in §4 Level 4, plus scenarios you may exercise as throwaway scripts under the scratchpad
     directory — never inside the repo, never committed.
   * Run A: **no `s26_offline_queue.js`, no `s27_id_allocation.js`, no `ui4_rowpatch.js`**, and no
     `STEPS` lines. Its Phase B and Phase D verification requirements are met the same way — by
     reasoning over the diff, by throwaway dry runs in the scratchpad, and by the owner's checklist.
   * **`tools/verify/run_all.js` is not edited by either run.** It is no longer a shared file, and a
     diff touching it is a violation to report, not a merge conflict to resolve.
   * The **existing** suite still gates every commit, unchanged, at its current size.

   This trades committed proof for speed at the owner's explicit instruction. Say so in the results
   docs: name every assertion that would have been a test, and what you checked instead.

What the overrides do **not** touch — these are correctness gates, not approval gates, and they
still hold exactly as written:

* Run A: **Phase A completes before Phase C starts** (ids change underneath every converted form),
  and **Phase B is green before Phase C starts**. Never leave Phase C half-converted: a page is
  either converted with its integrity work done, or untouched.
* Run B: **S1 before S3** — the crash goes before the write path is rewritten.
* Both: the suite is green at **every** commit, not merely at the end.

---

## 4. Verification cadence — repeated, at four levels

The baseline, measured now on `feat/vf-stock-authority`: **`node tools/verify/run_all.js` → "All 71
checks pass."** Every gate below compares against that.

**Level 1 — after every edit.** `node --check` on each `.js` touched; `node tools/verify/parse_pages.js`
if a template was touched.

**Level 2 — before every commit.** `run_all.js` green at **exactly 71 checks**. Not 70 — a lower
count means a test was deleted or a file went missing, and both are forbidden. Not 72 — a higher
count means a test was added, which §2.11 forbids. The number is a constant for this whole run, on
both branches, from the first commit to the last.

**Level 3 — after every phase/step.** `run_all.js` + `parse_pages.js` + `ui_smoke_pages.js`, all
green, count recorded in the results doc as a running table. Then re-read the source prompt's
section for the phase just finished and tick each numbered requirement against the actual diff
(`git show --stat` and `git diff <base>..HEAD -- <path>`), not against memory.

**Level 4 — the audit loop, per run, when the run believes it is done.** Not optional, and not
performed by the agent that did the work:

1. Spawn a **fresh reviewer** with no history of the implementation. Give it the source prompt, the
   branch name, and one instruction: *"Audit this branch against every numbered requirement,
   decision-table row, test item and owner-checklist line in that prompt. For each, cite the commit,
   file and line that satisfies it, or mark it UNPROVEN. Verify by reading the diff and running the
   tests yourself; the implementer's report is not evidence."*
2. The reviewer produces an **evidence matrix** — one row per requirement: `satisfied | skipped
   with a recorded reason | UNPROVEN`.
3. Every `UNPROVEN` goes back to the implementing agent, which fixes it and commits. Re-audit.
4. Repeat until zero `UNPROVEN`, or **three rounds**. After three rounds, stop and report what is
   still unproven, plainly. **A run is never declared finished on the strength of its own summary.**

Anything you could not verify because you cannot see a browser or read the spreadsheet is written
into the owner's checklist as an explicit visual check — never silently counted as passing.

---

## 5. Integration, after both runs pass their audits

Do not merge either branch into `master` and do not push. Instead:

1. From the main tree, create `feat/sales-and-saves` from HEAD, merge `feat/optimistic-saves`, then
   merge `fix/vf-sales-batch-edit`. Run A first — it is the larger diff.
2. The only file both runs can plausibly touch is `Company_ValleyFoods_Actions.js`, and their hunks
   are disjoint — keep **both** sides. If a real overlap appears, stop and report it; do not pick a
   side. `tools/verify/run_all.js` must appear in **neither** diff (§3.4); if it does, that is a
   violation to report before merging, not a conflict to resolve.
3. On the merged branch: `node --check` every changed `.js`, `parse_pages.js`, `ui_smoke_pages.js`,
   and `run_all.js` — still **71 checks**, all green.
4. If the merge is not clean and cannot be resolved by the two rules above, leave the two branches
   intact and unmerged, and say so. An unmerged pair of green branches is a good outcome; a merged
   branch nobody verified is not.

---

## 6. When you would normally stop

1. **A source prompt covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why, continue with the rest.
3. **Genuinely blocked** (needs the owner's account, needs a sheet read, needs a browser) → write it
   up, mark it blocked-on-owner, implement the stated default where one exists, continue with
   everything else.
4. **A whole step is unworkable** → report it plainly, do not fake it, move on to the next.
5. **Out of room** → finish the commit you are inside, leave the suite green, and write exactly where
   you stopped and what remains. Never leave a half-converted Phase C.

A reported skip is always better than a guess. **A fabricated verification is the one outcome worse
than an unfinished run** — never write "tests pass" without the command output in front of you, and
never claim a dry run you did not execute.

---

## 7. Commit protocol

Each source prompt's own protocol applies, unchanged:

```
fix(vf-sales-S<n>): <summary>          # Run B
refactor(save-<phase><n>): <summary>   # Run A

<what changed, file by file>
<what was verified, and how — include the numbers>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Explicit paths only. No push.

---

## 8. Definition of done — report against exactly this list

Report only when every line is true, or say which are not and why:

- [ ] `fix/vf-sales-batch-edit` carries Run B's 4 steps, each its own commit.
- [ ] `feat/optimistic-saves` carries Run A's phases A→D, each phase's commits present.
- [ ] Both runs' results docs written: `VF_SALES_BATCH_EDIT_RESULTS.md` and Run A's report, each
      with its verification numbers, its skips and its open questions.
- [ ] Both audit loops closed: zero `UNPROVEN`, or a named list of what remains after three rounds.
- [ ] `run_all.js` green at **71 checks** on each branch and on the merged branch (or a stated
      reason the merge was left undone).
- [ ] `git status` in the main tree still shows the other efforts' work — modified, unstaged,
      **unharmed**.
- [ ] Nothing pushed, nothing deployed. **No row added, edited or deleted** in any sheet. No schema
      changed. **No test written** — `tools/verify/` is byte-identical to how it started, and
      `git diff --stat` on both branches proves it.
- [ ] The owner's two visual checklists reproduced in one place, as the only work left for a human.

Then write **`PARALLEL_EXECUTION_RESULTS.md`**: what both runs did, the evidence matrices, the merge
outcome, every open question, and the combined owner checklist. That file is the handover.

---

## 9. Before you start, confirm you understand

1. Two runs, two branches, two directories: **A in the main tree** (because `UI_Components.html`
   carries uncommitted work it must stage around), **B in a worktree** (because its files are clean).
2. Neither run edits the other's files; `ValleyFoods/Sales` is **Tier C** and Run A leaves it alone.
3. You do not stop at phase boundaries, and you do not ask the user anything — defaults get
   implemented and recorded.
4. Correctness gates still hold: A before C, B green before C, S1 before S3, suite green at every
   commit.
5. A run is finished only when a **fresh reviewer** has audited it against its source prompt and
   nothing is `UNPROVEN` — the implementer's own summary proves nothing.
6. No push, no deploy, no schema change, and **no row added, edited or deleted in any sheet by you**
   — while the code you write is still expected to add, update and delete allocation rows when the
   owner saves an invoice. The constraints bind you during this run only: the owner edits the sheets
   and the code by hand afterwards, and you build nothing to prevent, detect or repair that.
7. **No test is written and `tools/verify/` is not modified.** The suite is run constantly and stays
   green at **71 checks**; it is never added to. Assertions that would have been tests are verified
   by reading the diff and by throwaway scripts in the scratchpad, and every one of them is named in
   the results docs.
8. The other efforts' uncommitted work comes out of this untouched.
