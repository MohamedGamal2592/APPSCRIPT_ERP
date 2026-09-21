# Read & View Modularization — Change Ledger & Test-Run Records

Companion to `Plan_Read_View_Modularization.md` (currently **Rev 4**). This file is the
**only** place change records and test-run records for this programme live.

**Append-only scope, precisely:** *completed* Change Records (§4, and future RV-1.x records)
and *completed* Test Records (§5, TR-n) are immutable — a correction is a new record that
references the old one. The header, the programme-status table (§1), the templates (§2) and
the retraction recipes (§3) **are updateable**, because the status table would otherwise never
be able to advance and a wrong recipe could never be fixed. An update to those sections is
itself recorded when it changes a documented contract.

Owner: the reviewer/owner named in the plan. Assistant records every modification it makes
here in the same commit as the modification (guardrail G9, plan §3.3).

**Privacy rule (G7 applies here too): no record in this file may contain raw business values.**
Field names, hashes, types, counts, line numbers and bounded summaries only.

---

## 1. Programme status

| Step | Deliverable | Flag | Status |
|---|---|---|---|
| 0 | Audit (read-only) | — | **DONE** — records in §4 |
| 1 | Freeze canonical response contracts; resolve/document anomalies | — | **IN PROGRESS** — `RV-1.1` applied (`815c6c7`); VM/staging evidence outstanding; DTO contracts not started |
| 2 | `Core_FastRead.js` primitives + metrics + parity guard | `FAST_READ_CORE_` (false) | NOT STARTED |
| 3 | Sales list (`NARROW_SCAN_PAGE` / `KEYSET`, no caching) | `SALES_FAST_READ_` | NOT STARTED |
| 4 | Sales document reads | `SALES_FAST_READ_` | NOT STARTED |
| 5 | Small-payload cache (stable key, stamp in manifest, pre/post validation) | `FAST_READ_CORE_` | NOT STARTED |
| 6 | DTO projection + permission tests | `FAST_VIEW_CORE_` | NOT STARTED |
| 7 | MFG list + view (separate query design) | `MFG_FAST_READ_` | NOT STARTED |
| 8 | Client phase | separate approval | OUT OF SCOPE |

Flag states as of the last commit:

- **Read/view flags: not yet defined.** They do not exist in the source yet (they are introduced
  in step 2/3), so they are *absent*, not `false`. When introduced, each must default to
  `false`, and this table must be updated in the same commit that introduces it.
- Write-side flags (`FAST_SAVE_CORE_`, `MFG_BATCH_WRITES_`, `SALES_BATCH_WRITES_`,
  `RETURNS_BATCH_WRITES_`, `PURCHASE_BATCH_WRITES_`): **all `false`**.

---

## 2. Templates (copy for every new record)

### 2.1 Change Record

```markdown
### RV-<step>.<n> — <short title>
- Date / Commit:
- Step:
- Files (with line anchors):
- What changed (behaviour terms):
- Why (finding / plan section):
- Flag state before → after:
- Behaviour if reverted:
- Retraction recipe: L1 … / L2 … / L3 …
- Metrics observed (with baseline):
- Residual risk (what this does NOT prove):
- Test runs: see §5 records <ids>
```

### 2.2 Test-run record

```markdown
### TR-<n> — <short title>
- When:
- Environment: VM harness (no data) | staging copy | production, read-only | production
- Command:
- Purpose (claim under test):
- Result: PASS | FAIL | NOT RUN (+ one-line reason)
- Evidence (path / commit / Stackdriver timestamp):
- Not covered:
```

---

## 3. Retraction recipes (programme-wide)

| Level | Recipe | Applies to |
|---|---|---|
| L1 — runtime | Set the module flag back to `false` (and `FAST_READ_CORE_`/`FAST_VIEW_CORE_` if the module was the only consumer). No deploy of source needed if the flag is read from script, but flags live in source in this project, so L1 is a one-line change plus deploy. | any module |
| L2 — source | `git revert <sha>` for one record, or `git revert <first>^..<last>` for a step range | any commit |
| L3 — cache | Nothing is required: entries are namespaced `fr1_…` and expire on their own TTL. A specific key can be dropped with `frCacheDrop_(logicalKey)` when the key is known. | cache entries only |

**There is no data-side retraction.** This programme performs no schema change, no migration,
no backfill and no row rewrite. If a future record cannot state that, the change does not
belong in this programme.

---

## 4. Audit-phase records (Step 0 — read-only, pre-G9, summarised here)

These runs were made during the audit and the review round. They are recorded now, before G9
was agreed, and are labelled accordingly. None of them wrote anything.

### RV-0.1 — Audit programme opened
- Date / Commit: 2026-09-21 / `104e192` (plan Rev 1), revised `9abd764` (Rev 2)
- Files: `Plan_Read_View_Modularization.md`
- What changed: plan document created; Rev 2 closed 6 blocking and 8 major review findings.
- Why: owner request for a read/view modularization plan.
- Flag state: n/a (documentation)
- Behaviour if reverted: `git revert 9abd764 104e192` removes the plan; no runtime effect.
- Retraction recipe: L2 only.
- Metrics observed: n/a
- Residual risk: the audit is pattern-based across all files plus deep reads of the
  transport/cache layer and representative handlers — it is not a line-by-line review of
  every file.
- Test runs: TR-1 … TR-8

### RV-0.2 — Documentation & retraction protocol adopted (this section's origin)
- Date / Commit: 2026-09-21 / `50fdee8` (SHA resolved by RV-0.3)
- Files: `Plan_Read_View_Modularization.md` (§3.2 G9, §3.3, §7 step table),
  `READ_VIEW_MODULARIZATION_RESULTS.md` (new)
- What changed: every modification in this programme must now ship with a Change Record and
  recorded test runs; a step without a record is `IN PROGRESS` regardless of code state.
- Why: owner instruction — steps must be retractable and test runs documented.
- Flag state: n/a (documentation)
- Behaviour if reverted: `git revert 50fdee8` removes the requirement document; the code is
  unaffected.
- Retraction recipe: L2 only: `git revert 50fdee8`.
- Residual risk: compliance depends on discipline; the protocol cannot enforce itself.

### RV-0.3 — Resolve RV-0.2's commit reference (first append-only correction)
- Date: 2026-09-21
- Commit: identified by **message**, not SHA — this record's own commit is the one whose
  message begins `docs(read-view): resolve RV-0.2 commit reference`. A record cannot contain
  its own SHA before it is committed, and guessing one would be worse than describing it.
  `git log --oneline --grep="resolve RV-0.2 commit reference"` resolves it.
- Files: `READ_VIEW_MODULARIZATION_RESULTS.md`
- What changed: RV-0.2's placeholder `<this commit>` replaced with `50fdee8`; no other change.
- Why: the placeholder cannot be resolved within its own commit. The pattern for any future
  record with the same problem: leave the placeholder, resolve it in a follow-up record, and
  identify that follow-up by its commit message rather than chaining further SHAs.
- Flag state: n/a (documentation)
- Behaviour if reverted: no runtime effect.
- Retraction recipe: L2 only (`git revert <sha of the RV-0.3 commit, resolved by the grep above>`).
- Residual risk: none beyond the grep being the lookup mechanism.

### RV-0.4 — Plan finalised as Rev 3 (owner decisions recorded)
- Date: 2026-09-21
- Commit: identified by message — `docs(read-view): finalise plan as Rev 3 with owner
  decisions` (`git log --oneline --grep="finalise plan as Rev 3"`); this is the same
  message-identified pattern RV-0.3 established, used because a record cannot contain its own
  SHA.
- Files: `Plan_Read_View_Modularization.md` (status line, review order, §1.1 new, §3.2 G1/G2,
  §7 steps 1 and 7, §9 rewritten), `READ_VIEW_MODULARIZATION_RESULTS.md` (this record + TR-9)
- What changed: the owner's four decisions (DEC-1 … DEC-4) are recorded with their
  consequences; no open decision remains; the review order for implementation is stated at the
  top of the plan; step 7 is reclassified from a step to a reviewed sub-plan
  (`Plan_MFG_Read_Design.md`) scheduled after step 5's measurements; production sampling for
  shadow compare is deleted from the plan entirely; the G1 deadline is fixed at 120 s checked
  per service call.
- Why: owner answers to the four open items; review requirement that decisions be explicit
  before implementation.
- Flag state: unchanged — every read/view and write-side flag remains `false`. No code touched.
- Behaviour if reverted: `git revert <sha>` (resolved by the grep above) returns the plan to
  Rev 2 (four open decisions) with no runtime effect.
- Retraction recipe: L2 only.
- Retraction caveat: reverting the plan does **not** revert any decision the owner has already
  acted on outside this repository (e.g. a clasp deployment). Nothing has been deployed.
- Metrics observed: n/a (documentation)
- Residual risk: this record documents intent; it cannot prove the implementation will honour
  it. Enforcement is by review at each step's Change Record (G9).
- Test runs: TR-9

### RV-0.5 — Superseded by RV-1.1
- The queued first implementation action was written as RV-1.1 below. This record is kept so
  the queue item does not silently disappear.

### RV-0.6 — Session kickoff prompt written; step-1 harness recon recorded
- Date: 2026-09-21
- Commit: identified by message — `docs(read-view): add session kickoff prompt and record
  step-1 harness recon (RV-0.6)`.
- Files: `CORE_READ_VIEW_EXECUTION_PROMPT.md` (new), `READ_VIEW_MODULARIZATION_RESULTS.md`
- What changed: the execution prompt for a fresh session was written to
  `CORE_READ_VIEW_EXECUTION_PROMPT.md`, with **MFG implementation inside the same uninterrupted
  run** (sub-plan 7a committed before MFG code 7b). The recon below was recorded so a new
  session does not have to rediscover the dispatch path.
- Why: owner instruction to open a new session and start the plan without per-phase approval.
- Flag state: unchanged (no flags exist yet for read/view; write-side flags all `false`).
- Behaviour if reverted: `git revert <sha>` removes the prompt file; no runtime effect.
- Retraction recipe: L2 only.
- Residual risk: the prompt cannot be executed by the assistant that wrote it — the tooling in
  this session could not dispatch a subagent (model resolution fails) and the assistant cannot
  open a session. It is a handoff artifact for the owner to paste.

**Sub-task carried forward (this is where step 1 stands).** The remaining step-1 action is
building the VM harness for VF server actions. Recon completed this session:

- The module's dispatch surface is `ValleyFoods.dispatch_(payload, user, dbId, guardCtx)` at
  `Company_ValleyFoods_Actions.js:504`, exported with `pageForAction_`, `tableForAction_`,
  `requestRecovery_`, `register` at `:612`. It resolves `actions[payload.module_action]` and
  calls the handler as `(payload.data, user, dbId, guardCtx || {})`.
- `executeCompanyAction_` (`Code.js:6337`) is the production entry; a harness should bypass it
  and call `dispatch_` directly with an explicit `dbId`, because the auth/tenant layers need
  live state a VM cannot provide.
- Loading gotchas found: `Company_ValleyFoods_Actions.js` declares `const ValleyFoods = (…)()`
  at top level, which in a `vm` context lives in the global **lexical** scope — a later
  `vm.runInContext('ValleyFoods', ctx)` reaches it, but it is not a property of `globalThis`.
  `gasstub.js` already stubs CacheService/PropertiesService/Utilities/LockService/Session, but
  its fake sheet (built for the chunk-cache tests) does not obviously implement `getLastColumn`,
  `getSheetId` or `getParent`, all of which `getHeaders_`/`getSheet_` use.
- Therefore the harness needs either an extended `gasstub` sheet or its own fake workbook;
  `tools/verify/gasstub.js` is test-only and may be extended (report the diff if so).
- No harness code has been written. **This is the first action of the next session.**

---

## 4.1 Implementation records (step 1 onward)

### RV-1.1 — Fix the unresolved `uid` reference in `getValleyInvoiceForReturn_`
- Date / Commit: 2026-09-21 / **`815c6c7`** — one file, 6 insertions, 1 deletion. **No engine
  file, no flag, and no other handler was touched in that commit** (approval condition).
- Step: 1 (first action; DEC-1 option A).
- Files: `Company_ValleyFoods_Actions.js` — `invInfo` construction inside
  `getValleyInvoiceForReturn_` (was `:12591`, now `:12590-12596` plus the explanatory comment).
- What changed: `invInfo = { uid: uid, … }` → `invInfo = { uid: invUid, … }`, with a comment
  naming the defect and pointing at this ledger. `invUid` is the handler's own inbound invoice
  identity and the value the row was located by, so the field now carries the intended value.
- Why: the identifier `uid` is declared nowhere in that function; the statement threw a
  `ReferenceError`, the surrounding `try { … } catch (e) {}` swallowed it, `invInfo` stayed
  `null`, and the handler fell through to its existing fallback
  `invoice: invInfo || { uid: invUid, number: '-' }`. The returns banner therefore rendered
  three dashes for number, client and date on **every** invoice, always.
- **Intentional defect correction — NOT legacy equivalence** (owner-approved, DEC-1). This
  record deliberately does not claim a zero-diff result: producing the previously-missing data
  *is* the change.
- Expected contract after the fix — found-invoice case:
  | field | value |
  |---|---|
  | `uid` | the inbound `invUid` (the `invoice_unique_id` the row was found by) |
  | `number` | the invoice header `رقم الفاتورة`, as a trimmed string (`''` when blank) |
  | `client_name` | the invoice header `اسم العميل`, as a trimmed string (`''` when blank) |
  | `date_display` | `dd/MM/yyyy` from the header `تاريخ الفاتورة`, or `'-'` when blank/unparseable |
- Expected contract — missing-invoice case: unchanged. `invInfo` stays `null` and the handler
  returns `invoice: { uid: invUid, number: '-' }`; the banner shows `-` for number, client and
  date, exactly as it does today for every invoice. The fix does not alter this path.
- Client consumption confirmed: `Company_ValleyFoods_SalesReturns.html:176-196` reads
  `res.invoice.number`, `res.invoice.client_name` and `res.invoice.date_display` in the green
  invoice banner; it also reads `res.invoice` nowhere else.
- Scope audit: the same defect exists **nowhere else**. A repo-wide search for the pattern
  returns one real instance (the one fixed) plus two `batch_uid: uid` field assignments whose
  `uid` is a genuine local, and one `uid: uid` in `getValleyMfgClientReport_` where
  `var uid = String(r.unique_id …)` is declared immediately above it.
- Flag state before → after: none involved. **No flag exists for this change and none was
  added** (approval condition: no engine or flag changes in the same commit).
- Behaviour if reverted: `git revert 815c6c7` restores the silent failure — three dashes in
  the returns banner. Nothing else changes; no data or schema is affected.
- Retraction recipe: L2 only: `git revert 815c6c7`. L1 does not apply (no flag). L3 does not
  apply (this path reads no cache of its own beyond the existing `vfFindRowByUid_` index,
  which is unaffected).
- Metrics observed: n/a — the handler is not on a measured hot path; the change is a
  correctness fix, not a performance change.
- **Approval condition — evidence**: a VM harness is **NOT RUN**. No VM scaffolding exists for
  VF server actions (`tools/verify/gasstub.js` loads `Code.js` only; `s11_sales_returns.js` is
  a page harness), and building it is a separate deliverable. Partial evidence is the
  executable contract guard in §5 (TR-10, TR-11). **Because the required VM/staging evidence is
  outstanding, RV-1.1 is applied but this record is not closed and step 1 remains IN PROGRESS
  (G9).**
- Residual risk (what this does NOT prove): that the handler executes without error at
  runtime — the guard proves the source no longer contains the unresolved reference and that
  the field contract matches the client, not that the Apps Script runtime agrees. It also does
  not prove the invoice header columns hold the expected values on live data. Both are the
  remaining VM/staging evidence.
- Test runs: TR-10 (guard passes on the fixed source), TR-11 (guard fails on the pre-fix
  source, i.e. the guard catches the defect it exists for).

---

## 5. Test-run records

### TR-1 — Read-pattern census across all JS files
- When: 2026-09-21
- Environment: production source, read-only
- Command: `rg -c "<pattern>" <file>` for `getDataRange(`, `getAllRecords_(`,
  `getReadOnlyRecords_(`, `getRecordsByPk_(`, `indexById(`, `CacheService.getScriptCache()`,
  `.getRange(`, `noteTableChange_(`, `readTableVersions_(` across the six JS files
- Purpose: quantify the read mechanism mix (plan §4.1)
- Result: PASS — 475 `getAllRecords_` sites, 74 `getDataRange()`, 17 index uses, 69 cache uses
- Evidence: plan §4.1 table; command output captured in session
- Not covered: per-call cost; whether any given site is on a hot path

### TR-2 — Per-function attribution of full-table reads
- When: 2026-09-21
- Environment: production source, read-only
- Command: PowerShell scan walking backwards from each match to the enclosing `function`
- Purpose: identify the top read handlers (plan §4.3)
- Result: PASS — ranked list produced (`getValleyInvoiceForReturn_` 6 … )
- Evidence: plan §4.3 table
- Not covered: call frequency; a handler can be heavy but rarely used

### TR-3 — Client RPC fan-out census
- When: 2026-09-21
- Environment: production source, read-only
- Command: `rg -o "companyCall\('[a-z0-9_]+'" <page>.html` over the 14 largest root pages
- Purpose: count distinct actions and total calls per page (plan §4.2)
- Result: PASS — Attendance 13/15, MfgOrders 12/15, MfgOrderView 8/10, Sales 7/9 …
- Evidence: plan §4.2 table
- Not covered: dynamic action names built at runtime; conditional calls

### TR-4 — Anchor verification for every citation in the plan
- When: 2026-09-21
- Environment: production source, read-only
- Command: `Select-String -Pattern "<function>" Code.js, Company_ValleyFoods_Actions.js`
- Purpose: ensure the plan cites current line numbers after prior edits shifted them
- Result: PASS — `maxIdOf_` Code.js:881, `readTableVersions_` :854, `putChunkedCache_` :1702,
  `getChunkedCache_` :1736, `getReadOnlyRecords_` :1159, `jsonSafe_` :6528,
  `perfRecordRequest_` :6060, `vfFindRowByUid_` :9126, `vfRefsCached_` :44 …
- Evidence: plan §4, §5 citations
- Not covered: anchors drift again with the next edit; re-verify per record

### TR-5 — Cache/stamp language verification
- When: 2026-09-21
- Environment: production source, read-only
- Command: read `Code.js:806-826`; list `tools/verify/optimization_chunk_cache.js`,
  `optimization_reads.js`, `rt3_stamp_coverage.js`
- Purpose: confirm the review's finding that stamps are best-effort and that executable
  harnesses already exist (plan §4.6, §7.5)
- Result: PASS — code states stamps can be evicted before TTL and are "a hint to refetch";
  the three harnesses exist (9 591 / 24 061 / 7 941 bytes)
- Evidence: plan §4.6, §7.5
- Not covered: whether those harnesses still pass; they were not executed

### TR-6 — `uid: uid` anomaly verification
- When: 2026-09-21
- Environment: production source, read-only
- Command: `rg -n "uid: uid" Company_ValleyFoods_Actions.js` then a scoped scan of
  `getValleyInvoiceForReturn_` (lines 12542-12662) for any `uid` declaration/assignment
- Purpose: verify the review's claim that the Sales return baseline is broken
- Result: PASS (claim confirmed) — four sites; inside the function the assignment at
  `:12591` is inside `try { … } catch (e) {}` with **no** `uid` declaration anywhere in the
  function body, so the reference throws and `invInfo` remains `null`
- Evidence: plan §4.6 and §9 item 1
- Not covered: whether `invInfo === null` is actually harmful downstream; that needs a
  call-path review of the return page (Step 1 work)

### TR-7 — Plan self-check for withdrawn claims
- When: 2026-09-21
- Environment: local document, read-only
- Command: `rg -n -i "~100 rows|guaranteed identical|4\.5 MB|50 chunks|1-in-50|eviction observed|deferred section" Plan_Read_View_Modularization.md`
- Purpose: ensure no Rev 1 claim survives as an assertion
- Result: PASS — every hit is either the Rev 1 closure table (§0), an explicit prohibition,
  or a "removed from this phase" statement
- Evidence: `9abd764`
- Not covered: prose claims that paraphrase a withdrawn idea without those exact phrases

### TR-8 — Repository inventory for traceability
- When: 2026-09-21
- Environment: local git, read-only
- Command: `git log --oneline -10`; `git show --name-only --format="" <sha>`
- Purpose: record the commit inventory used in §6
- Result: PASS — 10 commits listed with their touched files
- Evidence: §6 table
- Not covered: n/a

### TR-9 — Rev 3 consistency check
- When: 2026-09-21
- Environment: local document, read-only
- Command: `rg -n "DEC-1|DEC-2|DEC-3|DEC-4|FR_DEADLINE_MS_|Plan_MFG_Read_Design|1-in-50|production sampling|Open decisions" Plan_Read_View_Modularization.md`
- Purpose: confirm every decision is present where it must be, and that no withdrawn clause
  survives as an instruction
- Result: PASS — the four DEC rows exist in §1.1 and are referenced from §3.2 (G1, G2), §7
  (steps 1 and 7) and §9; `FR_DEADLINE_MS_ = 120000` appears in §1.1 and G1; the MFG sub-plan
  name appears in §1.1, §7 and §9; the only surviving mentions of `1-in-50` / production
  sampling are in the §0 closure table (quoting the rejected Rev 1 text) and in §1.1/§3.2 G2
  as explicit deletions
- Evidence: this commit; `node --check` is not applicable (Markdown)
- Not covered: it cannot prove the implementation will honour the decisions — that is the
  per-step Change Record's job (G9)

### TR-10 — RV-1.1 contract regression guard (fixed source)
- When: 2026-09-21
- Environment: local source, **executable** node script (no data, no VM, no writes)
- Command: `node tools/verify/rv11_invoice_return_contract.js`
- Purpose: prove the fix is present and the server/client field contract holds
- Result: **PASS** — 63-line server region; fields asserted `uid, number, client_name,
  date_display`; client fields asserted `number, client_name, date_display`
- Evidence: commit `815c6c7` + the guard file (added in the same commit as this record)
- Not covered: it does not execute the handler. It is a static contract guard, explicitly not
  a VM harness — the VM/staging condition of RV-1.1 remains NOT RUN

### TR-11 — RV-1.1 guard proven to catch the defect ("test the test")
- When: 2026-09-21
- Environment: local source, executable; the pre-fix source was exported to a temp path — **no
  repository file was modified to run this**
- Command:
  `git show "815c6c7^:Company_ValleyFoods_Actions.js" > <temp>/rv11_old_vf.js` then
  `RV11_SERVER=<temp>/rv11_old_vf.js node tools/verify/rv11_invoice_return_contract.js`
- Purpose: prove the guard fails on the defective source, so TR-10's PASS means something
- Result: **PASS (guard behaved correctly)** — assertion
  `RV-1.1 regression: 'uid: uid,' (an unresolved reference) is present again`, exit code 1
- Evidence: this record; exit code 1 observed against the pre-fix file
- Not covered: it proves the guard detects this specific defect, not that it detects other
  future server/client contract drifts (the other assertions in the guard cover those
  individually)

---

## 6. Cross-reference — write-side programme (pre-G9, summarised)

Recorded here so the whole read+write programme is traceable from one file. These commits
predate G9 and therefore have no Change Records; the runbook and status for them live in
`FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` §7.1-7.2.

| Commit | Files | Flag state | Retraction |
|---|---|---|---|
| `a5f51db` | pre-migration backup (193 files) | n/a | **historical comparison point only** — inspect with `git diff a5f51db -- <path>` or `git show a5f51db:<path>`. It is *not* a recommended `git reset --hard` target: a hard reset would discard every later commit, including the read/view work |
| `2014df1` | `Core_FastSave.js` | `FAST_SAVE_CORE_` false | L2 revert |
| `f439f58` | `Core_FastSave.js`, `Company_ValleyFoods_Actions.js` | all false | L1/L2 |
| `869443b` | `Company_ValleyFoods_Actions.js`, `Core_FastSave.js` | all false | L1/L2 |
| `4e4877e` | `Company_ValleyFoods_Actions.js`, `Core_FastSave.js` | all false | L1/L2 |
| `e4a2f0f` | `Company_ValleyFoods_Actions.js` | all false | L1/L2 |
| `2dd89a1`, `567dd19` | `FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` | n/a | L2 |

**Reverting the write-side engine code** (newest first, so each revert applies cleanly and no
documentation commit is touched):

```
git revert e4a2f0f 4e4877e 869443b f439f58 2014df1
```

This restores the pre-engine source state. The flags being `false` already means the legacy
path is what runs today, so the revert is almost never necessary — it exists so the option is
unambiguous. The two documentation commits (`2dd89a1`, `567dd19`) are deliberately **not** in
the list.

**Verification already performed on the write side** (recorded here for completeness, from the
session that delivered it): `node --check` PASS on `Core_FastSave.js`, `Code.js` and
`Company_ValleyFoods_Actions.js`; decoupling gate PASS (0 hits for every module token,
`getDataRange`, `appendRow(`, `deleteRow(`); no staging or production execution of any save
was performed. Runtime acceptance for the write side remains **NOT RUN** pending the owner
runbook.
