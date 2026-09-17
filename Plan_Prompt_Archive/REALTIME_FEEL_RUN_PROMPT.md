# RUN PROMPT — make it feel realtime

Make page loads, form entry and form editing feel instant, per
**[REALTIME_FEEL_PLAN.md](REALTIME_FEEL_PLAN.md)**. Today every navigation is a full document
reload of ~317 KB that is never cached, every read raises a full-screen overlay, a save costs two
round trips, the live-change watch is wired on one company of four and misses most writes anyway,
and the search box on a ten-row list silently pretends it searched the table.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods) plus an Assessment Centre, Arabic RTL
interface. Repo root `d:\Work\Script`, remote `origin`
(`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows in any business
table, adds no column to any sheet, and touches no Google account.

---

## 🔁 Autonomy — read this first

**Do not stop between phases. Do not ask "shall I continue?". Do not ask me to approve a phase, a
diff, a commit or a decision.** Work straight through R0 → R12 and report **once**, at the end.

Every open decision is **already answered in §Decisions**. If you want to ask a question:

1. **§Decisions or the plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the results doc, continue.
3. **Genuinely blocked** (needs my Google account, needs a live sheet, needs a browser, needs a
   measurement only production can give) → write it on the owner checklist and **continue with
   everything else**.
4. **A whole phase is unworkable** → say so plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess, and **far** better than a stopped run.

Commit after each phase **without asking**. Do not push. Do not deploy.

**If you run low on context**, do not abandon the run: finish the phase you are in, commit it,
write what remains into `REALTIME_FEEL_RESULTS.md` under "not reached", and stop cleanly there.
A half-finished phase left uncommitted is the one outcome worse than stopping early.

---

## Read these first, in full, before touching anything

1. **`REALTIME_FEEL_PLAN.md`** — your specification. §0 is what "realtime" means mechanically;
   §1 is the measured starting state with file:line evidence; §2 holds the phases; §5 is the risk
   register. **This prompt orients you; the plan decides.** Where they disagree the plan wins —
   except §Decisions below, which is newer than both.
2. **`UI_Components.html` L5194–L5413** — `UIC.Live`. `save()` is the optimistic-write primitive
   you are rolling out in R4; `watchPage()` is the poll you are rolling out in R6. **Read the
   quota comment above `watchPage` before you touch any interval.**
3. **`UI_Components.html` L1133–L1330** — `UIC.dataTable`, the `__dtStore` shape, `_dtRenderBody`,
   `_renderChunked`. R3 draws skeletons into this and R1 fixes its search scope.
4. **`UI_Components.html` L1908–L1990** — `_dtSearchInput` and `_applyFilters`. This is the
   client-side filter that never calls the server. R1 is about this function and the ten rows it
   is given.
5. **`UI_Components.html` L644–L720** — the one loading service (`ensurePageLoading`,
   `showPageLoading`, `hidePageLoading`, `withPageLoading`). R3 changes when it is allowed to run,
   not how it works.
6. **`02_DataAccess.js` L291–L362** — `executeWithLock_`, `noteTableChange_`, `noteSheetChange_`,
   `readTableVersions_`. R5 is a four-line change at L100 plus its call sites; read this block
   first so you understand what a stamp is for.
7. **`02_DataAccess.js` L43–L131** — `resetRecordCache_`, `disableRecordCache_`,
   `rearmRecordCache_`, **`noteMutation_`**, `setMemoGuard_`. The function you are changing in R5
   is L100. Understand the memo before you widen its signature.
8. **`Company_ValleyFoods_Actions.js` L300–L400** — `ACTION_TABLES`, the derived `PAGE_TABLES`,
   and `getPageVersions_`. This is the exact code you are porting to the other three companies in
   R6. Note that it is **derived**, not configured.
9. **`Company_TopLight_Sales.html` L397–L445** — `saveSales`. The canonical un-converted save:
   blocking overlay, rotating messages, hand-rolled list patch, `showList()` fallback. R4 turns
   this shape into a `UIC.Live.save` call. Read it until you can do the transform from memory.
10. **`Client_Helpers.html` L94–L128 and L478–L545** — `API.call`, `PERF`, `schedulePrefetch`.
    R2 rewrites `PERF`; R7 replaces `schedulePrefetch`.
11. **`tools/verify/run_all.js`** and **`tools/verify/s19_live_rollout.js`** — the suite, the
    `STEPS` array you append to, and the shape a check file takes. `s19` already reports converted
    vs pending pages; you are extending it, not replacing it.
12. **`tools/ui_check.js`** C9 (the design-preview fingerprint) and C12. Any edit to
    `UI_Components.html` or `CSS_Tokens.html` makes C9 **FAIL** until you run
    `node tools/build_preview.js`.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change a schema
No new column, no renamed column, no reordered column, no removed column — in any business table,
in any company, in the AUTH spreadsheet, or in MySQL. If a phase seems to need one, it does not —
re-read the plan and use the existing columns.

**The only exceptions, all explicitly sanctioned in the plan's §Invariants**: R11 creates
`ERP_History_Queue` and R10 creates `ERP_Perf_Log` / `ERP_Perf_Weekly`, all in the AUTH
spreadsheet. Each is a **brand-new sheet**, additive, outside every business table, and droppable
without consequence. Creating those three is allowed. Touching the columns of any sheet that
already exists is not — including `ERP_Record_History` and `SystemLog`.

## 2. NEVER add, edit or delete data in a business table
This run is code only. No migration, no backfill, no "just seeding a test row".

## 2b. NEVER change a calculation or a form
Every total, cost, balance, payroll figure, aggregate and derived value must come out
**byte-identical** to what it produces today. Every form field, label, order and validation rule,
and every table column header, stays exactly as it is. This run changes **when** things appear and
**how long** they take — never **what** they say. A diff that alters a computed value or a header
is a bug in this run, not an improvement. Plan §Invariants 3 and 4.

## 3. NEVER deploy, push, or touch my Google account
No `clasp push`, no `clasp deploy`, no `git push`, no Script Property changes, no trigger
installation, no MySQL connection attempt. Every one of those is on the owner checklist.

## 4. NEVER weaken the authority model
`checkPageAccess_`, `checkPageAccessForUI_`, `canCompanyAction_`, `authenticateSystemUser_`,
`userDirectory_`, `authGeneration_`, the kill switch and every cache keyed by the generation are
**out of scope**. Plan §6 says so and means it. In R9 the new body endpoint runs the **same**
`checkPageAccessForUI_` gate as `doGet` — an optimisation that also happens to be a way around an
access check is not an optimisation.

## 5. NEVER lower a poll interval or remove a stand-down
The 10 s floor, the 30 s default, the hidden-tab pause, the 15-minute idle stop and the
exponential backoff in `watchPage` are a **quota budget**, not tuning knobs. You may raise them.
You may not lower them, and you may not remove one to make a demo feel better.

## 6. NEVER show an optimistic row you cannot take back
Every `UIC.Live.save` call site must have a working rollback path. If a page cannot supply a
`list` + `key` + `render` trio, it passes `reload` instead and keeps its overlay. A row that is
on screen and not in the sheet, with no way back, is worse than a two-second wait.

## 7. NEVER mangle identifiers when minifying
`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `SESSION.*`, `ERPFlow.*` and `ERPModal.*` are a cross-file
public surface that `ui_check.js` C3 verifies. R8 strips comments and whitespace **only**.

## 8. NEVER rewrite history
No `rebase -i`, no `commit --amend` on anything already committed, no force anything, no
`git checkout --` over someone else's uncommitted work.

## 9. Stay out of these files entirely
`appsheet_old_project.html`, `appsheet_old_project_files/`, `Code.js.bak`, `Backup/`,
`assessment center/`, `src_html/`, `Box_Analysis_Engine.js`, `DbLive_Connector.js`,
`03_Security.js`, `05_Admin.js`, `07_Backup.js`, `09_Inventory.js`, `10_Retention.js`.

---

## Starting state

```bash
cd d:/Work/Script
git branch --show-current      # ui/table-columns
git log --oneline -1           # eb1b0c1 feat(vf_warehouse_movement): enter a whole delivery note…
git status --porcelain
node tools/verify/run_all.js   # All 48 checks pass
node tools/ui_check.js         # 1 of 12 FAILED — C5
```

**The tree is dirty with 27 files of other people's uncommitted work** — `Company_ValleyFoods_*`,
`Company_TopChemical_*`, `UI_Components.html`, `design_preview/_sources.js`, several
`tools/verify/*`, plus a dozen untracked `.md` files.

**Do not stage it, do not revert it, do not "clean up" the tree.** Many of the files you must edit
are already dirty, so your diff sits on top of someone else's uncommitted work: **read before you
write, and stage by explicit path — never `git add -A`, never `git add .`**

**`ui_check.js` C5 already fails before you start**: 39 used-but-undefined classes against a
baseline of 37 (`.vf-card` alone is used in 15 files and defined nowhere). **This is not yours.
Do not fix it, do not re-baseline it, and do not let it grow past 39.** If your work would add an
orphan class, define the class.

`run_all.js` passes all 48 checks at HEAD. **It must still pass all of them, plus yours, at the
end of every phase.**

**Create your branch from HEAD and stay on it:**

```bash
git checkout -b feat/realtime-feel
```

Commit `REALTIME_FEEL_PLAN.md` and this prompt as your **first commit** (both are currently
untracked), then proceed.

---

## Decisions — already made, do not re-ask

| # | Question | Answer |
|---|---|---|
| **D-A** | Which plan phases are in this run? | Plan Phases **0 (code half), 1, 2, 3, 4, 5, 6 (pilot only) and 8 step 1**. Plan Phase 7 and Phase 8's index tiers are **OUT** — both are gated on production measurements only the owner can take. Put them on the owner checklist with what they need. |
| **D-B** | Plan Phase 0 needs a Script Property I cannot set. | Write the **client-side instrumentation code** anyway (R2). It is inert until `PERF_LOG` is true, so it costs nothing while the property is unset. The property goes on the owner checklist. |
| **D-C** | Split `UI_Components.html` into four files, as plan Phase 5 step 2 says? | **No — OUT OF SCOPE.** It touches 85 page heads and the include graph, and it doubles an already large run for maybe a fifth of what minification gives for near-zero risk. Do the minify (step 1), land the byte budget (step 3) and the lazy-loading (step 4), and record the split as the recommended follow-up run. |
| **D-D** | Soft navigation on all 89 pages? | **No.** Exactly **two pilot pages**, as plan Phase 6 step 4 requires: **`Company_TopLight_Dashboard`** and **`Company_TopLight_KPI`**. Both are read-only, both use `appShell`, both are small, and they are in the same company so navigating between them is a real journey. Every other page hard-navigates exactly as today. |
| **D-E** | The search fix (R1) — which of the plan's three options per page? | In this order, first that fits: **(a)** if the endpoint has no `slice(0, limit)`, the list is already whole — nothing to do; **(b)** if the endpoint already accepts filter parameters, add server-backed search (debounce 250 ms, `search` + `limit` in the payload); **(c)** otherwise render the notice beside the box. **Never leave `searchable: true` over a truncated list with no notice.** Option (c) is an acceptable final answer for a page — it tells the truth, which is the whole point. |
| **D-F** | R3 — replace all 245 overlay sites with skeletons? | **No. Read paths only** (~180 of them). Writes keep their overlay until R4 replaces it. Do not do both in one commit; if R4 has to be rolled back you must not lose R3. |
| **D-G** | A write handler cannot return the saved record (multi-sheet commit). | It passes `reload` to `UIC.Live.save` and keeps its overlay. Add it to an **explicit exemption list with a stated reason** in `rt2_record_replies.js`. An exemption with a reason is fine; a silent one is not. |
| **D-H** | R5 — change all ~124 `noteMutation_()` call sites, or just the data layer? | **All of them, in the three `Company_*_Actions.js` files.** The signature change is backward-compatible (both args optional), so the commit is safe even if you miss some — and `rt3_stamp_coverage.js` lists whatever you missed with file:line. Ship the signature change and the verifier in the same commit; ship the call-site sweep in that commit too, and let the verifier report the tail. |
| **D-I** | R5 and R6 in one commit? | **No.** R5 is a bug fix and must be reviewable on its own — it is the reason the watch has been lying. R6 is a rollout. Two commits, R5 first. |
| **D-J** | `UIC.Cache` (R7) — where does it store? | `localStorage`, ~4 MB cap, LRU eviction, **every read and write wrapped in try/catch** (Safari private mode throws on access, not on quota). A throwing or full store degrades to a normal fetch and never to a broken page. Keys: `company + action + hash(payload)`. Eviction is driven by the R5/R6 table stamps. |
| **D-K** | Cache the *list* as well as the options? | **Yes**, but only the list a page last rendered, and only for a return navigation (plan Phase 4 step 5). Always render from cache **and** schedule a revalidation — never render from cache alone. |
| **D-L** | R8 — where does the minify happen? | Inside `include()` ([Code.js:554](Code.js#L554)), with the result held in `CacheService` keyed by a **content hash** so it runs once per deploy, not once per request. Add `?nominify=1` as an escape hatch. Comments and whitespace only — constraint 7. |
| **D-M** | What byte budget does `rt5_budget.js` enforce? | **180 KB** per page, resolved inline. Record every page's current and post-minify bytes in the results doc so the owner can see the gap. If a page cannot reach 180 KB without the split (D-C), **report it — do not lower the budget.** |
| **D-N** | Rebuild the design preview? | **Yes — required.** C9 fingerprints the bytes of `UI_Components.html` and `CSS_Tokens.html`. Run `node tools/build_preview.js` at the end of **every** phase that touched either. Never hand-edit `design_preview/_sources.js`. |
| **D-O** | An existing verify assertion fails because markup changed. | **Expected in R3 and R4.** Update the assertion deliberately and record why in the file, following the precedent comment in `tools/verify/s0_modal_size.js` (~L31). **Do not weaken an assertion to make it pass.** |
| **D-P** | Arabic normalisation for search (أ/إ/آ→ا, ة→ه, ى→ي)? | **Out of scope** — it belongs to Phase 8 Tier 1, which this run does not do. R1 matches exactly as the code matches today; it only fixes *what* is searched, not *how*. Note it as a follow-up. |
| **D-Q** | Results document name? | `REALTIME_FEEL_RESULTS.md`, at the repo root, following the shape of `TABLE_COLUMN_WIDTHS_RESULTS.md`. |
| **D-R** | Push, deploy, or open a PR? | **No.** Constraint 3. Commit locally and stop. |
| **D-S** | R10/R11 create new sheets — doesn't that break constraint 1? | **No.** Three brand-new sheets in the AUTH spreadsheet (`ERP_History_Queue`, `ERP_Perf_Log`, `ERP_Perf_Weekly`), sanctioned by plan §Invariants. **Write the `ensureSheet_`-style creation code; do not run it.** You cannot reach the spreadsheet anyway — the sheets are created on first use in production. Never alter the columns of `ERP_Record_History` or `SystemLog`. |
| **D-T** | R10 — buffer telemetry in `CacheService` or append per request? | **Cache buffer + one-minute batched drain.** A request must cost **zero sheet writes** for telemetry; `rt10_telemetry.js` asserts it. Losing a telemetry row to an eviction is acceptable — that is exactly why telemetry may use a cache and R11's audit queue may not. |
| **D-U** | R10 — what goes in `ERP_Perf_Log`? | Exactly the nine columns in plan Phase 10 step 2 and **nothing more**. **No payloads, no record ids, no emails** — the user column is a salted hash. `SystemLog` keeps the audit story; this sheet is numbers. Assert on the written **values**, not just the headers. |
| **D-V** | R10 — sampling rate? | 100% of writes, 100% of anything over 1,000 ms, **10% of fast reads**, as one `CONFIG` constant. Build sampling in from the start; retrofitting it means a first busy week nobody can open. |
| **D-W** | R11 — queue in a sheet or a cache? | **A sheet.** `ERP_History_Queue`. Audit rows are the one thing in this plan that may not be lost, and `CacheService` entries can be evicted before their TTL (the comment at [02_DataAccess.js:291](02_DataAccess.js#L291) says so explicitly). |
| **D-X** | R11 — may the drain change what a history row contains? | **No.** Same columns, same one-row-per-changed-column rule, same values. `rt9_history_queue.js` compares the enqueued rows against what `historyRowsFor_` produces today, row for row. This phase changes **when** the row is written and nothing else. |

---

## Your task — eleven phases, in order, one commit each

Do not pause between them.

| # | Phase | Plan § | Essence |
|---|---|---|---|
| **R0** | Recon + branch + commit the spec | §1 | Re-run the census yourself and confirm the numbers (317,414 median bytes; 268,510 for `UI_Components`; 245 overlay sites; 2 optimistic-save pages; 20 watch pages; 1 skeleton page; 34 save→refetch sites). **No code edits.** Record today's values in `tools/ui_baseline.json` under new keys. Any number the plan states that you cannot reproduce goes in the results doc as a correction — the plan is evidence, not scripture. |
| **R1** | **The lying search box** | Ph 8 step 1 | Per D-E. The correctness bug ships first because it is the only thing here that makes the system *wrong* rather than slow. Ship `rt8_search_scope.js` in the same commit. |
| **R1b** | **The audit asymmetry bug** | Ph 9 step 1 | One `try/catch` on the `update` branch of `saveRecordWithAudit_` (L1209), matching the `create` branch (L1190). **This must ship before R4**, or the optimistic rollback makes the screen disagree with the sheet. Tiny commit, on its own. |
| **R2** | **Perf instrumentation** | Ph 0 | The four-part navigation timeline, batched into **one** `google.script.run`, inert unless `window.PERF_LOG`. `rt0_perf_marks.js`. |
| **R3** | **Skeletons replace read overlays** | Ph 1 | The rule comment on `showPageLoading`; `tableSkeleton` / `formSkeleton` / `cardSkeleton`; convert the ~180 read sites; hoist every `appShell` out of a `.then()`. `rt1_skeletons.js`. |
| **R4** | **Optimistic writes** | Ph 2 | Convert ~54 write pages to `UIC.Live.save`; add `record:` to write handler replies; add the retry queue and the `Live.busy()` navigation guard. Extend `s19` to all four companies. `rt2_record_replies.js`, `rt2_queue.js`. |
| **R5** | **The stamp bug fix — alone** | Ph 3 step 1–2 | Widen `noteMutation_`, sweep the call sites, ship `rt3_stamp_coverage.js` as a gating check. Per D-H and D-I. |
| **R6** | **Watch rollout** | Ph 3 step 3–6 | Port `get_page_versions` to TopChemical, TopLight, Assessment; register the watch on their list pages; replace the blunt refetch with the chip / in-place merge. |
| **R7** | **`UIC.Cache` + prefetch on intent** | Ph 4 | The store (D-J), options-from-cache, edit-opens-from-memory, intent prefetch replacing `schedulePrefetch`, last-list persistence (D-K). `rt4_cache.js`. |
| **R8** | **Payload** | Ph 5 (1,3,4) | Minify in `include()` (D-L), the 180 KB budget (D-M), lazy-load history/preferences/print/export. **Not the split** (D-C). `rt5_budget.js` + the symbol-equivalence check. |
| **R9** | **Soft-nav pilot** | Ph 6 | `get_page_body`, `UIC.Router`, `mount`/`unmount`, on **two pages only** (D-D), with hard-navigation fallback always live. `rt6_router.js`. |
| **R10** | **Telemetry** | Ph 10 | `ERP_Perf_Log` + `ERP_Perf_Weekly` + the rollup + the dashboard page. Cache buffer, batched drain, sampling, `user_hash`, retention. `rt10_telemetry.js`. |
| **R11** | **Audit off the request path** | Ph 9 (2–6) | `ERP_History_Queue`, the lockless enqueue, the one-minute idempotent drain. `rt9_history_queue.js`. |
| **R12** | **Results + owner checklist** | — | `REALTIME_FEEL_RESULTS.md`. No code. |

### The four phases that carry real risk

**R4 — an optimistic row is a promise.** The rollback path is not a nice-to-have; it is the thing
that makes the promise honest. Write `rt2_queue.js` **before** you convert the twentieth page, not
after, and make it assert that a failed save leaves the list byte-identical to its pre-save state.
Convert in small batches and run the suite between them. Constraint 6.

**R5 — the sweep is where a silent miss hides.** The signature change is trivial; giving 124 call
sites the *right* `scopeId` and `sheetName` is not. A site that stamps the **wrong** table is worse
than one that stamps nothing — it makes other pages refetch for no reason and still misses its own.
Where the site holds a `Sheet` object rather than ids, use `noteSheetChange_(sheet)` and let it
derive both. Where you cannot tell which table a write hits, **stamp nothing and let the verifier
report it** rather than guessing.

**R8 — the minifier is the one that ships silently.** A regex that eats a `//` inside a string
literal, or a `/* */` inside a template literal, produces a file that still parses and behaves
differently. `ui_check.js` C11 already checks template-literal CSS hazards for exactly this family
of bug — read it before you write the stripper. The symbol-equivalence check (run both bundles
through `tools/verify/domstub.js`, diff the exported `UIC.*`/`window.*` surface) is **required**,
not optional, and Arabic string literals must survive byte-identical.

**R11 — a dropped audit row is the worst outcome in this run.** It is worse than a slow save,
worse than a stale cache, worse than anything else here, because nobody finds out. The drain marks
rows before it moves them so a trigger dying mid-drain can neither duplicate nor lose them, and a
row still queued after N minutes is **reported, never silently dropped**. If you cannot make the
drain provably idempotent under a simulated mid-drain failure, **ship R11's step 1 only** (the
bug fix, already done in R1b) and leave the rest on the owner checklist.

**R9 — `unmount` is the whole phase.** A router that mounts correctly and unmounts sloppily leaks a
`watchPage` poll per page visited, and the user's tab quietly turns into a quota problem over an
afternoon. `rt6_router.js` must assert that every watch and every timer a page starts is cleared on
unmount. If you cannot prove that for a page, **do not convert that page.**

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

There is no `node_modules`, no `package.json` and **no layout engine**. `tools/verify/domstub.js`
does not lay anything out and does not run a real event loop, so **no assertion in this repo can
prove that a skeleton appeared in 150 ms, that a save felt instant, or that a navigation was
smooth.** Do not pretend otherwise in the results doc. Prove what is provable — call graphs,
markup, presence and absence, contracts — and put the perceptions on the owner's checklist.

You also cannot reach the spreadsheet, the MySQL host, or the deployed web app. Every number in
the plan's budget table that ends in `ms` is an owner measurement, not yours.

**After every phase, all four:**

```bash
node tools/verify/run_all.js     # all 48 + yours must pass
node tools/ui_check.js           # C5 may still fail at 39; nothing else may fail
node tools/build_preview.js      # if UI_Components.html or CSS_Tokens.html changed
node --check <every .js you touched>
```

Append each new check to `STEPS` in `tools/verify/run_all.js` **in the same commit that adds it**,
with a one-line label in the existing style.

---

## Traps this repo has actually sprung

1. **`noteMutation_` does not stamp.** It only disables the per-request memo. That single fact is
   why 20 pages have been polling for changes they could never see. Do not assume any other helper
   "probably stamps too" — check it.
2. **`include()` is called for every shared file on every page render**, and it does a
   `split().join()` over the whole string twice. Whatever you add to it in R8 runs 85 times per
   navigation. Cache by content hash, not by filename alone.
3. **`getAllRecords_` is memoised per request but the memo is disarmed by the first write**
   (`noteMutation_` → `disableRecordCache_`). A handler that reads, writes, then reads again pays
   a full sheet read for the second read. Do not "optimise" by re-arming it — `rearmRecordCache_`
   exists and is called in exactly one safe place, for a documented reason.
4. **The design preview fingerprints bytes, not behaviour.** C9 fails on any edit to the two
   shared files, including a comment. Run `build_preview.js` or every later phase reports a
   failure it did not cause.
5. **`UIC.dataTable` re-derives `st.filtered` on every search, sort, page and column toggle** —
   but classification and column prefs are computed once. Draw your skeleton from `st.headers`,
   never from `st.filtered`.
6. **Pages are `<?!= include(...) ?>` templates, not plain HTML.** `tools/verify/parse_pages.js`
   exists because a scriptlet inside an inline `<script>` breaks naive parsing. Use the existing
   `pageharness` and `stripScriptlets` helpers; do not write a new parser.
7. **CRLF.** Git reports `LF will be replaced by CRLF` on nearly every file here. That is normal
   for this repo. Do not "fix" line endings; a whitespace-only diff across 85 files will bury your
   real change.
8. **`Company_ValleyFoods_Actions.js` is 457 KB and `Company_TopChemical_Actions.js` is 307 KB.**
   Do not read them whole. Grep to the function, read the region.

---

## Commit protocol

One commit per phase, staged **by explicit path**. Conventional-commit style, matching the log:

```
fix(vf_purchasing): the read-only line list shows the movement type's name
perf(core): deleteRowsByCriteria_ in a loop …
```

Subject in the imperative, lower case, scoped. Body explains **why**, not what — the diff already
says what. Every commit message ends with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Never `git add -A`. Never `git add .`. Never push.

---

## Report once, at the end

Write **`REALTIME_FEEL_RESULTS.md`** and commit it as R12. It must contain:

1. **What shipped, per phase**, with the commit hash and the files touched.
2. **The before/after census** — the R0 numbers against the R9 numbers, in the shape of the plan's
   §4 budget table. Mark every row you could not measure as **"owner measurement"** rather than
   estimating it.
3. **Every correction to the plan.** If a number in §1 was wrong, say so with the evidence. The
   plan was written from static analysis; you have read the code more closely than it did.
4. **Every skip and every exemption**, with its reason. The `rt2_record_replies.js` exemption list
   and the `rt3_stamp_coverage.js` unstamped list go here in full, not summarised.
5. **The owner checklist** — everything blocked on the owner, each with what it unblocks:
   - `PERF_LOG_READS = 1` for five working days, then `0` (unblocks plan Phase 7)
   - `inventorySpreadsheets()` — read-only, already written, never run (unblocks plan Phase 8
     tiers; decides whether they are needed at all)
   - the visual checks no assertion can make — skeletons, save feel, the two soft-nav pages
   - the poll-interval budget, once `SystemLog` shows real execution counts
   - install the two one-minute drain triggers (`installTriggers_`) — until then R10 buffers and
     R11 queues, and **neither drains**; say so plainly, because a queue nobody drains is a
     silently growing sheet
   - confirm the read sampling rate (default 10%) and the 90-day raw retention for `ERP_Perf_Log`
   - read `ERP_Perf_Weekly` once a week — that is the entire habit this run is building toward
6. **The recommended follow-up runs**, in priority order — at minimum the `UI_Components` split
   (D-C), soft-nav beyond the two pilot pages (D-D), Arabic search normalisation (D-P), and plan
   Phases 7 and 8.

---

## Before you write a single line of code, confirm you understand

State these back in one short paragraph, then start R0 without waiting for a reply:

- which plan phases are in and which are out, and why (D-A)
- why R5 ships alone and before R6 (D-I)
- what `noteMutation_` does today and what it will do after R5
- what happens on a page where a save fails after the row is already on screen
- why the minifier may not mangle identifiers (constraint 7)
- which two pages get soft navigation, and what every other page does (D-D)
- which three sheets you may create, and which sheets' columns you may never touch (D-S)
- why telemetry may buffer in `CacheService` and the audit queue may not (D-T, D-W)
- what "no calculation changes and no form or header changes" rules out (constraint 2b)
