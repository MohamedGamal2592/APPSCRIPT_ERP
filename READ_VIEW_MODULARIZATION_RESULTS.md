# Read & View Modularization — Change Ledger & Test-Run Records

Companion to `Plan_Read_View_Modularization.md` (Rev 2). This file is the **only** place
change records and test-run records for this programme live. It is append-only: a correction
is a new record that references the old one, never an edit in place.

Owner: the reviewer/owner named in the plan. Assistant records every modification it makes
here in the same commit as the modification (guardrail G9, plan §3.3).

**Privacy rule (G7 applies here too): no record in this file may contain raw business values.**
Field names, hashes, types, counts, line numbers and bounded summaries only.

---

## 1. Programme status

| Step | Deliverable | Flag | Status |
|---|---|---|---|
| 0 | Audit (read-only) | — | **DONE** — records in §4 |
| 1 | Freeze canonical response contracts; resolve/document anomalies | — | NOT STARTED |
| 2 | `Core_FastRead.js` primitives + metrics + parity guard | `FAST_READ_CORE_` (false) | NOT STARTED |
| 3 | Sales list (`NARROW_SCAN_PAGE` / `KEYSET`, no caching) | `SALES_FAST_READ_` | NOT STARTED |
| 4 | Sales document reads | `SALES_FAST_READ_` | NOT STARTED |
| 5 | Small-payload cache (stable key, stamp in manifest, pre/post validation) | `FAST_READ_CORE_` | NOT STARTED |
| 6 | DTO projection + permission tests | `FAST_VIEW_CORE_` | NOT STARTED |
| 7 | MFG list + view (separate query design) | `MFG_FAST_READ_` | NOT STARTED |
| 8 | Client phase | separate approval | OUT OF SCOPE |

Flag states as of the last commit: **all read/view flags are `false`.**
Write-side flags (`FAST_SAVE_CORE_`, `MFG_BATCH_WRITES_`, `SALES_BATCH_WRITES_`,
`RETURNS_BATCH_WRITES_`, `PURCHASE_BATCH_WRITES_`) are also **all `false`**.

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

---

## 6. Cross-reference — write-side programme (pre-G9, summarised)

Recorded here so the whole read+write programme is traceable from one file. These commits
predate G9 and therefore have no Change Records; the runbook and status for them live in
`FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` §7.1-7.2.

| Commit | Files | Flag state | Retraction |
|---|---|---|---|
| `a5f51db` | pre-migration backup (193 files) | n/a | reference point: `git reset --hard a5f51db` (destructive, owner only) |
| `2014df1` | `Core_FastSave.js` | `FAST_SAVE_CORE_` false | L2 revert |
| `f439f58` | `Core_FastSave.js`, `Company_ValleyFoods_Actions.js` | all false | L1/L2 |
| `869443b` | `Company_ValleyFoods_Actions.js`, `Core_FastSave.js` | all false | L1/L2 |
| `4e4877e` | `Company_ValleyFoods_Actions.js`, `Core_FastSave.js` | all false | L1/L2 |
| `e4a2f0f` | `Company_ValleyFoods_Actions.js` | all false | L1/L2 |
| `2dd89a1`, `567dd19` | `FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` | n/a | L2 |

**Reverting the write-side code as a whole:** `git revert 2014df1^..e4a2f0f` (excluding the
doc commits) restores the pre-engine state; the flags being `false` already means the legacy
path is what runs today.

**Verification already performed on the write side** (recorded here for completeness, from the
session that delivered it): `node --check` PASS on `Core_FastSave.js`, `Code.js` and
`Company_ValleyFoods_Actions.js`; decoupling gate PASS (0 hits for every module token,
`getDataRange`, `appendRow(`, `deleteRow(`); no staging or production execution of any save
was performed. Runtime acceptance for the write side remains **NOT RUN** pending the owner
runbook.
