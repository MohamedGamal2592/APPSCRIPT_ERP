# ERP Gap-Closure Implementation Plan — Muse Spark 1.3

**Source:** `ERP_APPSCRIPT_ANALYSIS_18_09_2026.md` (read-only audit, TopChemical / TopLight / ValleyFoods)
**Scope:** Fix the gaps found in that audit, directly in the existing project files. No new system, no parallel architecture, no data migration.

---

## Ground rules — apply to every phase, no exceptions

- **Work only inside the existing files** named in the audit (`Code.js`, `02_DataAccess.js`, `03_Security.js`, `Company_TopChemical_Actions.js`, `Company_TopLight_Actions.js`, `Company_ValleyFoods_Actions.js`, `Code_Telemetry.js`, `01_Registry.js`, and the relevant `.html` UI files). Do not create a parallel module or "v2" file for something that already exists.
- **No migration, no backfill scripts.** Any new column or field (`version`, `updated_at`, `request_key`, etc.) must default safely in code when it's missing on an old row (e.g. "no version column → treat as version 0"). Never write a one-time script to populate historical rows. If a fix genuinely cannot work without touching old data, stop and flag it instead of writing a migration.
- **No unit tests.** Do not write, generate, or run test suites, test files, or test harnesses for this work.
- **No data changes of any kind — no test adds, edits, or deletes, on any row, in any company.** The system is live and in production. This is a code-only enhancement/refactor pass, not a testing exercise. Do not execute a route, call an action, or trigger a save "to see if it works" — this would create, edit, or delete a real record. Every verification step below must be satisfied by **reading and tracing the code** (static review, grep, logical coverage checks) — never by running the app.
- **Deliver every changed file complete and paste-ready** — full file contents, not a diff or patch fragment.
- **Line numbers in this plan are from the audit snapshot and will drift** as soon as you start editing. Always re-locate the target by function name before touching it, never by trusting a stale line number.
- **Fix the pattern once, apply it to all three companies.** Don't leave TopChemical, TopLight, and ValleyFoods on three different implementations of the same concept — where one company (usually ValleyFoods) already has the correct pattern, copy it rather than inventing a new one.
- **Stay inside the current phase's scope.** If you notice an unrelated issue while working, note it at the end of your report for a later phase — do not fix it now.
- **Do not start the next phase until the current phase's Verification checklist passes.** Report per-item status as `Done` / `Partial` / `Blocked`, with file + function evidence, in the same style as the original audit.

---

## Master TODO index

- [ ] Phase 1 — Money-safety: document numbering & concurrency
- [ ] Phase 2 — Correctness: state transitions & validation
- [ ] Phase 3 — Security integrity
- [ ] Phase 4 — Performance: indexing & cache hygiene
- [ ] Phase 5 — Consistency: shared totals & audit trail
- [ ] Phase 6 — Workflow-as-data & UI consistency (defer if time-constrained)

---

## Phase 1 — Money-safety: document numbering & concurrency

**Why first:** duplicate invoice numbers and silent row-loss are live correctness bugs on financial documents, in all three companies, right now.

### Todo
- [ ] Extract one shared `nextDocumentNumber_(dbId, docType, year)`, modeled on ValleyFoods' existing `nextInvoiceSeq_` (persisted `PropertiesService` counter + lock precondition via `executeWithLock_`).
- [ ] Migrate TopLight's `nextInvoiceNumber_` and TopChemical's `nextInvoiceNumber_` — currently unlocked full-scan + regex — onto the shared function. Keep each company's number *format* (prefix, year pattern) exactly as-is; only the generation mechanism changes.
- [ ] Add a `version` (or `updated_at`) check on the edit paths for MO, purchasing, and invoices. On save: compare the row's current version to the version the client last read. Mismatch → reject with a conflict error the UI can surface ("this record changed — reload and retry"), never silently overwrite. Old rows with no version value are treated as version 0 — no backfill.
- [ ] Make `patchRowByCriteria_` the default write path for handlers currently calling `updateRowByCriteria_` (TopLight, TopChemical, ValleyFoods — re-locate all call sites by function name). Reserve `updateRowByCriteria_` only for handlers that must genuinely replace an entire row, and leave a one-line comment on each remaining call explaining why.

### Verification (must pass before Phase 2) — code trace only, no live execution
- [ ] Grep confirms TopChemical's and TopLight's invoice-number generation no longer runs independently of the shared locked function.
- [ ] Grep confirms every remaining `updateRowByCriteria_` call has a justification comment.
- [ ] Code trace confirms the version-check runs on every MO/purchasing/invoice edit handler, before the write, and that a mismatch throws a conflict error rather than proceeding.
- [ ] Code trace confirms every invoice-number call site (all three companies) acquires the lock before reading the counter and releases it after writing, with no path that reads/increments outside the lock.

---

## Phase 2 — Correctness: state transitions & validation

### Todo
- [ ] Define one `DOC_STATUS_TRANSITIONS` table per document type (MO, purchasing, sales, cash) listing every allowed `from → to` move.
- [ ] Add a single `canTransition(docType, from, to)` gate. Call it from every status-changing handler that currently does its own inline guard (`changeValleyMfgStatus_`, `mfgAgreeAffectsBalance_`, `purchasingCheckpointHeader_`, `approvePurchasing_`, and equivalents — re-locate by name), replacing the scattered `if(cur !== ...)` checks.
- [ ] Add one `validateBeforeWrite(docType, payload)` entry point, called from `apiRouter_` / each company's `dispatch_` before any commit. Migrate the rule logic currently duplicated across `validatePurchasingHeader_`, `validateSales_`, `validateCash_`, `validateBudgetMonth_`, `mfgAgreeCheckProduct_` / `mfgAgreeCheckMoney_` into per-docType rule tables that this one entry point reads.

### Verification — code trace only, no live execution
- [ ] Code trace confirms `DOC_STATUS_TRANSITIONS` covers every status field in every doc type, and every status-changing handler calls `canTransition` before writing — no handler still has its own inline guard left over.
- [ ] Code trace confirms `validateBeforeWrite` sits on every commit path reachable from `apiRouter_`/`dispatch_` — no route calls a save function directly without passing through it.
- [ ] Grep confirms no doc-status write bypasses `canTransition`, and no commit path bypasses `validateBeforeWrite`.

---

## Phase 3 — Security integrity

### Todo
- [ ] Flip `guard_` to fail-closed in TopChemical (and re-confirm TopLight and ValleyFoods): an unrecognized/unlisted action must be **denied**, not allowed by default. Specifically close the hole noted around TopChemical's `tc_box_analysis` case.
- [ ] Add `resolveDbId_(authUser, payload)` + `assertDbIdBelongsToCompany_()`, and route every handler's `dbId` through it before it reaches `getAllRecords_` or any sheet read. Extend ValleyFoods' existing `authorize_()` double-check pattern to TopChemical and TopLight.

### Verification — code trace only, no live execution
- [ ] Code trace confirms `guard_` in all three companies denies by default and only allows actions explicitly present in `PAGE_ACCESS`/`ACTIONS` — no fallthrough path returns "allowed" for an unrecognized action.
- [ ] Code trace confirms every handler's `dbId` is resolved through `resolveDbId_`/`assertDbIdBelongsToCompany_` before reaching `getAllRecords_` or any sheet read, for all three companies.

---

## Phase 4 — Performance: indexing & cache hygiene

### Todo
- [ ] Generalize the existing `getRecordsByPk_` / Map-index pattern (currently only wired up for Assessment) into one shared `indexById(rows)` helper.
- [ ] Route the confirmed hot linear scans through it: TopLight `editProduct`, TopChemical `saveClient`, ValleyFoods `saveValleyInvoice_`, and the `getAllRecords_().find()` calls in `Code.js`.
- [ ] Write down the cache-key/version contract for `getRefsCached_` / `vfRefsCached_` / `tlRefs_` / `tcRefs_`, and add an explicit `invalidateRefsCache_` call on every write to a cached lookup table (title_index, parties, products).

### Verification — code trace only, no live execution
- [ ] Grep confirms the listed hot-path handlers no longer scan a freshly re-fetched full range with `.find()`/`.forEach()`.
- [ ] Grep/code trace confirms every write to a cached reference table has a matching `invalidateRefsCache_` call.

---

## Phase 5 — Consistency: shared totals & audit trail

### Todo
- [ ] Extract one shared totals library (line → net/tax/discount/total, plus a single `num0_`) and replace the duplicated logic in `computeSalesTotals_`, `saveValleyInvoice_`, and `buildManufactureTotalCost_`. Any Sheet-formula version becomes display-only; the shared JS function is the source of truth.
- [ ] Add a guaranteed `afterWrite(docType, change)` hook called from the shared save path (not per-handler), and link `SystemLog.RecordID` to `ERP_Record_History.record_uid` so one trail can answer "who changed field X on row Y, and what was the old value."

### Verification — code trace only, no live execution
- [ ] Code trace confirms `computeSalesTotals_`, `saveValleyInvoice_`, and `buildManufactureTotalCost_` all call the one shared totals function for net/tax/discount/total — no company still has its own parallel calculation.
- [ ] Code trace confirms the `afterWrite` hook fires from the shared save path for every save handler (not per-handler manual calls), and that it writes a `SystemLog` entry whose `RecordID` links to a corresponding `ERP_Record_History` entry with old/new values.

---

## Phase 6 — Workflow-as-data & UI consistency (defer if time-constrained)

### Todo
- [ ] Model approvals as a table (`docType, step, role, required`) with a generic `requestApprove_` / `approveStep_()` engine, replacing the hardcoded per-page approval chains (`approvePurchasing_`, `approveSalesOffer_`, ValleyFoods' two-level costing/quality approval).
- [ ] Standardize the `request_key`/receipt + `unique_id` dedupe pattern — already solid in ValleyFoods — across TopChemical's and TopLight's large multi-step saves.
- [ ] *(Optional, low priority)* Promote the existing bulk-action infra (`dt-sel-*`) beyond the single TopChemical page it's used on; generalize `SESSION.saveCurrentView` / `loadActiveView` beyond the Cash pages.

### Verification — code trace only, no live execution
- [ ] Code trace confirms adding a new approval step would require only a data-table change, not a new code path — verify by reading `requestApprove_`/`approveStep_()` and confirming it reads step definitions from data rather than hardcoding them.
- [ ] Code trace confirms the `request_key`/`unique_id` dedupe pattern is present on TopChemical's and TopLight's large multi-step saves, matching ValleyFoods' existing implementation.

---

## Reporting format (after every phase)

For each todo item:
- **Status:** Done / Partial / Blocked
- **Evidence:** file + function name (note if the line number shifted) — a code reference, never a test-run result
- **Deferred items:** anything intentionally postponed, and why
