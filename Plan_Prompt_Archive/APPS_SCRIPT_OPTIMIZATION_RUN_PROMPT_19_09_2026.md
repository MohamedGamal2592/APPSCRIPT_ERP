# RUN PROMPT — Apps Script Optimization with Compatibility Gates

**Date:** 19/09/2026  
**Revision:** Reconciled with the revised optimization plan  
**Companion plan:** [APPS_SCRIPT_OPTIMIZATION_PLAN_19_09_2026.md](APPS_SCRIPT_OPTIMIZATION_PLAN_19_09_2026.md)

This revision fulfills the plan's companion-prompt reconciliation requirement. The plan's statement that the prompt had not yet been updated describes the state before this revision. Its technical requirements remain authoritative. Neither document claims that implementation, live verification, or deployment has occurred.

> Use the instructions below when the owner requests implementation. Editing or reviewing this prompt is not an instruction to execute it.

---

## Role and objective

You are working on the ERP project at `D:\Work\Script`. Improve measured performance while preserving business behavior and existing production safeguards.

Read the current companion plan and applicable repository instructions first. Work on the current working files, not archived copies or an assumed historical snapshot. Locate functions by name and read their callers and surrounding scope; old line numbers and helper counts are not execution instructions.

Company records use Google Sheets. System storage defaults to Firestore in `00_Config.js` and supports a Sheets fallback. MySQL uses `DbLive_Connector.js`. Confirm deployed settings where access exists; do not infer runtime configuration or live schema from defaults and comments.

## Scope and hard rules

1. **Initial scope is local, behavior-preserving implementation and verification.** No DDL, schema/column-order changes, new routes, UI changes, live data repair, credential rotation, deployment, or automatic `clasp push`. The plan's Phase 5 and JDBC batch routes are separate deferred work.
2. Preserve action names, permission and validation order, payload keys/types/order, errors, financial calculations, formulas, ID matching, missing-record behavior, attachment identity, audit history, and retry/recovery behavior. Compare deterministic fixtures; do not require timestamps or generated UUIDs to be literally identical between real executions.
3. Keep Assessment storage internals (`acRows_`, `acInsert_`, `acUpdate_`, and related adapters) isolated. Preserve its public/authenticated action separation, token checks, and rate limiting.
4. Preserve prepared SQL and bound values, identifier sanitization, authorization gates, request-id protection, locks, optimistic checks, and Firestore update-time preconditions. Do not bypass storage adapters for system data.
5. Do not move/delete stale files. Leave `src_html/`, `Backup/`, and `Code.js.bak` in place and confirm deployment exclusions. Target active root server files. Focused offline tests/fixtures under `tools/verify/`, the results report, and a necessary explicit load-order configuration change are allowed; document any such configuration change. No npm imports in Apps Script server files.
6. Preserve pre-existing user changes. Record the working-tree baseline. Undo only your own isolated changes when recovery is necessary; never reset the repository or restore entire files over unrelated edits.
7. Use one focused change set at a time. Run meaningful targeted checks, then `node tools/verify/run_all.js` after each completed task. Record baseline failures honestly. Do not weaken assertions to obtain a green result. If a source-structure assertion becomes obsolete, retain its behavioral contract, explain the replacement, and review the test change separately.
8. Do not batch-edit same-named functions, replace every `.find()`, increase TTLs, or add shared infrastructure solely to satisfy a checklist. Each change must have an active caller, an equivalence contract, and a measured or defensible benefit.
9. Match local coding style. Add concise comments when needed to explain invalidation, ownership, or behavior contracts. Do not introduce dependencies or broad rewrites unnecessarily.
10. Use existing authorized environments for live measurements. Do not create production writes to obtain samples. If staging or live metadata is unavailable, complete independent local work and report the corresponding validation as pending. Never invent performance results or label unverified work production-ready.

## Execution map

Follow this order. Within each task, prefer measured hot paths. A failed prerequisite blocks dependent changes, not unrelated safe work.

| Task | Revised plan | Outcome |
|---|---|---|
| 0 | Phase 0 | Working-tree/backend/call-path baseline and acceptance fixtures |
| 1 | Phase 1.1–1.3 | Correct PK memo lifecycle and lookup/row/snapshot contracts |
| 2 | Phase 1.4 | Correct chunked-cache migration and invalidation |
| 3 | Phase 2.1–2.2 | Reused reads/indexes on measured active paths |
| 4 | Phase 2.3 | Formula-safe, concurrency-safe spreadsheet batching |
| 5 | Phase 3 | Only proven-equivalent helper consolidation |
| 6 | Phase 4.1 | Verified JDBC connection/query improvements |
| 7 | Phase 4.2 | Per-endpoint cache eligibility; implement only eligible caches |
| 8 | Completion gates | Integrated evidence, outstanding gates, and rollback/report |

Broad company factories/business-module merges, new JDBC batch routes, Viewer changes, and schema work are not mandatory completion items. Follow the deferred-work section.

## Task 0 — Establish the baseline

Read `.clasp.json`, `.claspignore`, relevant root files, and `tools/verify/run_all.js`. Confirm whether root `AGENTS.md` or other applicable instructions exist; archived instructions do not automatically apply outside their directory.

Record:

- Existing user modifications, active deployment source set, and test loading order.
- Configured backend versus verified deployed backend; mark unknowns.
- Actual request paths, including separate browser RPCs, storage adapters, JDBC acquisitions, reads/writes, and cache invalidations.
- Baseline verification results. The suite includes a report-writing verifier, so account for generated output in the working-tree review.
- Selected read/write bottlenecks and their fixture sizes.

Initial benchmark candidates: TC budget references and stock revision; TL product movement and invoice save; VF sales bootstrap and invoice/manufacturing approval; affected authentication/admin/history paths.

Use comparable cold/warm cache conditions, row counts, and backends. Where practical collect at least 30 samples for median/p95 latency, RPCs, JDBC connections/queries, storage reads/writes, and errors. Smaller samples are preliminary. Prefer staging for repeated writes.

The acceptance target is zero behavior regressions, a demonstrated reduction in targeted repeated work, at least 10% median improvement on a measured bottleneck, and no unexplained p95 regression above 10%. Report noise and inconclusive results. Maintainability-only deduplication does not require a speed claim.

`_sheetsReadCount_` is a partial counter: direct company reads, Firestore operations, and JDBC operations require separate evidence.

**Gate:** establish relevant before/after fixtures and baseline outcomes before modifying a behavior. Baseline failures affecting the proposed path must be resolved or that path deferred; never report a failing suite as green.

## Task 1 — Correct PK memo lifecycle and lookup contracts

Primary file: `02_DataAccess.js`.

### 1A. Correct the repeated-mutation cache gap

Inspect `getRecordsByPk_`, `noteMutation_`, `disableRecordCache_`, `resetRecordCache_`, and `rearmRecordCache_`.

The reviewed implementation can rebuild `_pkIndexCache_` after caching is disabled, then retain that index across a later mutation because `noteMutation_` returns early.

Prefer the conservative policy: while record caching is disabled, bypass PK memo reads and writes. A different policy is acceptable only if every relevant mutation invalidates the affected indexes and coverage is demonstrated. Preserve existing table/version stamps and request reset/rearm behavior.

**Required regression sequence:** read -> write -> read -> write -> read. Verify updated values, inserts, deletes, and row shifts through actual mutation helpers. Establish the failing regression before the fix where possible.

### 1B. Define index semantics before each conversion

`indexById` trims IDs, creates lowercase aliases, skips blanks, and can collapse case-distinct keys. It is not interchangeable with exact string comparison or strict typed comparison.

Document header resolution, normalization, duplicate precedence, null/blank handling, miss behavior, record ownership, and expected reuse for each candidate. Use an exact-match index when required. Preserve first-match semantics where the original uses `.find()`; a naive last-write-wins Map is different.

Test mixed-case IDs, whitespace, blank/null values, numeric/string distinctions, duplicate keys, and misses. Use collision-safe composite keys. Leave one-use lookups alone when building an index adds cost without reuse.

### 1C. Keep physical rows and historical snapshots distinct

`buildRecordsFromRaw_` filters blank rows. Never derive physical rows from its result index + 2. Build positional information from the original raw sheet array and actual header offset.

Verify cached row hints against the current target ID before writing; invalidate/adjust after insert/delete. Application stamps may not detect manual edits.

`getReadOnlyRecords_` has the same invalidation lifecycle as the memo. Only a retained local pre-write reference can serve as an old-history snapshot. Never mutate shared snapshots or reuse them as current state after a write. Clone when mutable ownership is required. Do not use this helper to bypass Firestore system-store routing.

**Gate:** targeted lifecycle, matching, blank-row, and snapshot checks plus the full suite pass before expanding index use in Task 3.

## Task 2 — Migrate cache storage with complete invalidation

Primary files: `02_DataAccess.js` and affected company action files.

Inventory each affected key's payload shape, TTL, company/backend scope, dependencies, producers, consumers, and invalidators.

- `tlRefs_` already uses chunked `getRefsCached_`. Preserve it unless a demonstrated issue requires change.
- Migrate TopLight `cachedMap_` only together with `bustTopLightCaches_` and every affected invalidator. Plain `cache.removeAll(keys)` does not remove chunk manifests/data.
- Preserve existing key semantics and TTLs. If key layout must change, define namespace/version migration, legacy-entry handling, and rollback behavior.
- Keep separate raw/projected cache shapes and company namespaces.
- Cache TC `employeeRefs_` only after all employee/status dependencies and mutation paths are covered.
- For VF `vfFindRowByUid_`, retain the initial 60-second TTL. Chunking does not authorize increasing it to 600 seconds. Preserve fresh target-row verification and scan fallback.
- Treat cache errors, partial eviction, invalid data, missing chunks, and oversized values as misses followed by rebuild.
- Audit chunk byte size for Arabic/non-ASCII payloads, sanitized/truncated key collisions, and concurrent writers. Character counts alone do not establish byte limits. Make any needed helper correction before expanding its use.

Do not ban all plain `cache.put`: bounded scalar version stamps are different from growing datasets. Use chunked or appropriately bounded storage for growing payloads.

**Gate:** verify mutation -> invalidation -> refreshed read for each migrated family, payloads exceeding a single entry, partial/malformed chunks, cache failures, concurrent publication, and unchanged TTLs. Run the full suite.

## Task 3 — Optimize repeated reads on active paths

Prerequisites: Tasks 1–2 for the caches/indexes used.

| Area | Candidate | Required preservation |
|---|---|---|
| TopLight | UID lookups in purchasing/sales/cash edit/delete/approve paths; duplicate raw/record reads | Exact comparisons, physical rows, history and mutation lifecycle |
| VF warehouse movement | Product lookup inside movement-row loop | Original typed equality, duplicate precedence, one reused read/index |
| VF purchasing/costing | Repeated Code lookups | Case, whitespace, duplicates, miss behavior |
| VF manufacturing | Workcenter membership and nested row scans | Each original comparison and row-shift behavior |
| VF invoice approval | Repeated header lookup inside row loop | Missing-header behavior |
| TC | Certificate, payroll composite-key, print-document lookups | Exact matching and collision-safe composite keys |
| TC cards | `cards.indexOf` inside iteration | Repeated object references must not change numbering |
| Admin/pages | Repeated header/action lookups | Actual backend, registry initialization/invalidation and duplicate precedence |

For `vfFindRowByUid_`, reuse the raw array only when that execution path loaded it. A persistent-cache hit does not supply a fresh raw array; load one when fallback/verification needs it.

For TopLight `customerRawMovements_`, inspect every consumer. Prefer preserving its array interface and adding an internal customer index. If an internal return shape changes, update all callers atomically and preserve public response shapes. Preserve movement order, filters, balances, and invalidation after every contributing write.

For sessions/users/devices/company data, investigate targeted system-store queries on Firestore instead of a full-collection read followed by a one-use Map. Preserve revocation, expiry, session-cache behavior, duplicate handling, errors, and the Sheets fallback. Do not assume an existing targeted-query helper has the same duplicate semantics as `.find()`.

**Gate:** compare fixture outputs and actual read/build counts before/after. Include write-then-read sequences and affected auth/financial contracts. Run the full suite.

## Task 4 — Batch active spreadsheet writes safely

Prerequisite: verified physical-row and snapshot handling.

Batch genuinely contiguous changed cells, not entire rows/columns padded with unrelated values. Empty entries in `setFormulas()` are writes, not preserve-existing-value instructions. Do not write calculated values back over formulas.

Preserve locking around append allocation, optimistic checks, IDs, history ordering, mutation/version stamps, and partial-failure behavior. An old pre-read array cannot safely overwrite unrelated cells changed by another request.

Prioritize measured active paths:

- VF `approveValleyInvoice_`, `approveValleyMfgOrder_`, `saveValleyInvoice_` allocation writes, and `saveValleyMfgOrder_` append work.
- TC `updateStockRevision_`, `updateImportFollowStatus_`, and `editLegalCostingBundle_`.
- VF employee status and vacation allocation changes.
- Admin matrix/pages/user views only in the relevant backend. Their Sheets loops are bypassed when Firestore branches return.
- History queue only with backend-specific claim/dedupe/write/done/delete recovery intact. Selected rows may be non-contiguous or claimed by another worker; never overwrite the whole visible batch indiscriminately. Inspect actual lock/claim ownership rather than assuming a guard exists.
- VAT export backgrounds without changing appearance; repair tools remain lower priority and must preserve preview/recovery contracts.

Defer TopLight `setHeaderFormulas_`, `setSalesHeaderFormulas_`, and `setCashFormulas_` unless an active caller is found; reviewed active writers already batch values/formulas.

If adding pre-read parameters to patch/find helpers, keep existing defaults and backend routing. Define table/layout, physical-row offset, freshness, and mutation ownership; reject or refresh stale positional data after row shifts.

**Gate:** verify mixed formulas/values, non-contiguous changes, concurrent appends/edits, optimistic conflicts, preserved history, and failure/retry recovery. Run relevant existing save/history verifiers and the full suite.

## Task 5 — Consolidate only proven-equivalent helpers

Perform this after correctness and hot-path work. Create `04_Shared.js` only when justified, and verify push order and test-harness loading.

UID and column-letter helpers are candidates; compare edge cases before delegation. Preserve wrappers carrying business, fallback, or cache semantics.

Do not treat these as identical:

- TopLight currency options include `rate` and return [] on failure; TC/VF return value/label and fall back to EGP.
- VF HR date parsing differs in invalid/empty/date-only behavior.
- VF time parsers differ in validation and malformed-input fallback.
- Padding helpers differ outside ordinary two-digit inputs.
- Employee-status maps differ in code conversion, date handling, and equal-date precedence.
- Repeated local helper names can belong to different IIFEs or capture different constants.

Do not hoist local helpers without checking lexical dependencies. Reuse row mappers only when header case/trimming, duplicate headers, blank rows, null/undefined values, ordering, and row identity match. Keep Assessment storage separate.

Broad factory/business consolidation is deferred unless separately justified under the plan's Phase 3 contracts. Preserve TopChemical request context/recovery hooks, TopLight action metadata, validation/authorization order, Assessment public dispatch, and company-specific response shapes. Do not complete VF dashboard placeholders as an optimization.

Share Drive transport only when authorization, folder selection, attachment identity, request tags, recovery search, and uncertain-upload behavior are all retained. Transport reuse alone is not idempotency.

**Gate:** differential edge-case fixtures and all relevant upload/Assessment/metadata/financial checks pass. Report maintainability gains separately from speed. Run the full suite.

## Task 6 — Optimize demonstrated JDBC costs

Primary file: `DbLive_Connector.js`; preserve company callers.

Trace real requests before adding a connection wrapper. `dbManufactureUpdateHeader_` already acquires one connection and does not call `dbProductCodeUnit_`; the latter already borrows a connection. Do not fabricate a savings estimate from these separate functions.

- Reuse a connection within proven multi-operation server requests. A wrapper cannot combine separate browser RPCs.
- One owner closes the connection; helpers close their own statements/result sets, including error paths.
- Consolidate mapping/update/soft-delete plumbing only with identical SQL/binds, null conversions, read-only restrictions, labels/order, types, affected-row handling, and errors.
- Move `systemQtyMap_` SQL into the connector if useful, preserving its shape and existing 120-second cache budget.
- Cache successful candidate probes with database/configuration/context scope, expiry or invalidation, and full rediscovery on cached-probe failure.
- Make `dbQuery_` totals optional only with a default retaining current totals. Change a consumer's count behavior only after proving totals are unused and without altering its response contract.
- Preserve endpoint-specific limits and authorization.

Do not add batch routes, alter Viewer behavior, or append `rewriteBatchedStatements=true` in this task.

**Gate:** inspect SQL/binds and use meaningful JDBC mocks for success/failure/resource ownership; measure real connection/query savings where available. Run the full suite. Label unverified driver/live behavior as pending.

## Task 7 — Evaluate MySQL result caching endpoint by endpoint

Candidates: `dbClientsArList_`, `dbClientBalanceSheetsList_`, `dbManufactureList_`, `dbProductsLiveList_`, `dbBoxList_`, and `dbChartAccountLabels_`.

For each, produce a dependency/freshness contract before changing code:

- All source tables/views, joins, external writers, timestamp guarantees, and deletion behavior.
- Explicit invalidation after every relevant application write and a valid strategy for external changes.
- Key scope covering database/environment, endpoint/source, filters/parameters, sort, limit/offset, loadAll, response version, and permission-dependent results.
- Authorized freshness budget, failure/miss behavior, concurrent publication, and measured stamp-query cost.
- Chunk storage and invalidation behavior verified under Task 2.

MAX(updated_at) + COUNT(*) is not a universal invalidation guarantee. MAX(id) + COUNT(*) misses ordinary edits. Adding a primary key does not automatically make either probe cheap.

`dbProductsLiveList_` joins `product_current_quantity`; a products-only stamp cannot validate `live_quantity`. Keep previously uncached live stock uncached unless all dependencies and an acceptable freshness policy are established. Preserve existing quantity-cache freshness where already present. Discover clients_AR/vendors_AP base dependencies before caching those results.

Do not apply a blanket 600-second TTL. If metadata, external-writer behavior, or freshness requirements cannot be established, defer that endpoint and document why. Eligibility analysis is a valid deliverable; adding all six caches is not mandatory.

**Gate:** test edits that leave counts/max IDs unchanged, joined-source-only changes, same-timestamp updates, deletions, key isolation, write invalidation, and cache failure. A claimed cache strategy must handle each relevant case. Run the full suite for implemented changes.

## Deferred work — not authorized by this implementation prompt

- New `db_insert_many` / `db_update_many` routes and Viewer adoption require a separate proposal covering real usage, transactions/rollback, partial results, batch limits, heterogeneous columns, generated IDs, conflicts, retry/idempotency, audit, and authorization. Verify driver support before considering connection flags.
- Broad company factory, product/invoice/payroll/dashboard rewrites require explicit equivalence contracts and separate justification; they are not checklist obligations.
- MySQL schema/index changes remain plan Phase 5. Require live definitions, existing keys/indexes/foreign keys/triggers, duplicate/null analysis, measured query plans, a verified MySQL backup/restore, a concrete migration/recovery plan, and owner go-ahead.
- `07_Backup.js` / `11_DailyBackup.js` do not back up MySQL. Ordinary id_5 indexes and surrogate IDs do not prevent JOIN duplication. Preserve existing label-map behavior.
- Do not retarget view writes based only on a warning comment, treat the Viewer as an arbitrary SQL console, or infer missing Firestore document identity from `keys: []`.
- Credential rotation, TTL/freshness policy changes, schema remediation, live production writes for testing, and deployment remain outside this initial scope.

Prepare concrete evidence before requesting any necessary decision. Do not ask repeatedly for permission already granted in the active implementation session; distinguish missing facts from a genuinely separate action.

## Task 8 — Verification, recovery, and reporting

Run the integrated verification suite after the last implementation change. Review the final diff for unrelated edits and generated reports. Confirm no client/routes/schema/archive/deployment changes slipped in.

For affected paths, record coverage of cold/warm/evicted caches, non-ASCII payloads, repeated mutations, physical row shifts, formulas, concurrent writes, permission denials, partial failure, retries/lost responses, and backend-specific behavior. Do not claim staging or production checks ran when only mocks were used.

If a task fails:

- Diagnose the regression rather than moving directly to dependent work.
- Repair or undo only your isolated change.
- Mark it and its dependent tasks blocked/deferred with the reason.
- Continue independent safe work where useful.
- Never replace a failed prerequisite with an unverified assumption or call the whole run complete while required validation remains pending.

Report progress as `TASK <n>: implemented / validated / deferred / blocked`, with changed functions, checks, and remaining gates. Do not use DONE for an implemented change that still needs required validation.

Save `APPS_SCRIPT_OPTIMIZATION_RESULTS_19_09_2026.md` with:

- Baseline and final working-tree scope; files/functions changed.
- Task outcomes and dependencies, including candidates left unchanged with reasons.
- Preserved contracts and targeted/full-suite results, including baseline failures.
- Backend coverage and local/mock/staging/live distinctions.
- Before/after timing and I/O evidence, sample sizes, cache state, and limitations.
- Cache key/namespace/TTL/dependency/invalidation changes and rollback implications.
- Remaining metadata, verification, or owner decisions needed.
- Code/cache rollback approach and confirmation that deployment/schema changes were not performed.

**Completion criteria:** every in-scope candidate has a documented outcome; implemented changes satisfy their correctness gates; verification and performance claims match evidence; deferred scope is explicit. Distinguish locally implemented work, fully validated work, and pending deployment gates. Do not deploy automatically.

