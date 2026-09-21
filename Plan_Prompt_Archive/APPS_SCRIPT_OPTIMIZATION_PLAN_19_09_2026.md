# Apps Script Optimization & Unification Plan

**Date:** 19/09/2026  
**Revision:** Compatibility review incorporated  
**Status:** Revised implementation proposal. No implementation, deployment, live schema verification, or performance improvement is claimed by this document.

## Scope and source of truth

Optimize the current root project while preserving business behavior. Company data uses Google Sheets; system storage defaults to Firestore in `00_Config.js`, with a Sheets fallback; MySQL is accessed through `DbLive_Connector.js`. Confirm the deployed Script Properties before attributing performance to either system backend.

The review was static. MySQL schema details, deployed configuration, table sizes, timestamp guarantees, and live performance remain unverified. Repository comments and previous estimates of table/action/helper counts are discovery aids, not evidence of the live schema or equivalent behavior. Locate functions by name; line numbers from earlier drafts have already drifted.

**This revised plan supersedes conflicting instructions in `APPS_SCRIPT_OPTIMIZATION_RUN_PROMPT_19_09_2026.md`. That companion file has not been updated as part of this plan revision. Reconcile it with this document before using it to direct implementation.** In particular, discard its blanket helper/index replacements, filtered-array row offsets, automatic cache-TTL increases, timestamp-only invalidation guarantees, and unconditional batch-route task.

### Boundaries

- Preserve action names, permissions, validation, response keys/types/order, errors, financial calculations, attachment identity, audit history, optimistic-version checks, and request-id recovery.
- Preserve prepared statements, identifier sanitization, authorization gates, locks, and storage preconditions.
- Keep Assessment storage (`acRows_`, `acInsert_`, `acUpdate_`, etc.) isolated. Preserve its separate public-action surface.
- Do not change schemas, add routes, change client behavior, move/delete archives, or deploy as part of the initial behavior-preserving work.
- Keep `src_html/`, `Backup/`, and `Code.js.bak` in place. Confirm their exclusion using `.claspignore` and `.clasp.json`; analyze and edit active root sources.
- Do not copy credentials into plans or reports. Address the legacy MySQL credential fallback as a separate operational task with connection verification and recovery arrangements.
- Schema changes require a concrete migration proposal and the owner's explicit go-ahead. They are not a prerequisite for the initial code-only phases.

## Execution order

| Phase | Purpose | Entry condition |
|---|---|---|
| 0 | Establish backend, behavioral, and performance baselines | Read current implementation and callers |
| 1 | Correct cache/index lifecycle and define lookup semantics | Baseline captured |
| 2 | Optimize measured repeated reads and active spreadsheet writes | Relevant Phase 1 regression checks pass |
| 3 | Consolidate proven-equivalent helpers | Behavior contracts demonstrated |
| 4 | Optimize measured JDBC paths and eligible result caches | Actual request graph and dependency/invalidation design established |
| 5 | Evaluate optional MySQL schema/index changes | Live introspection, verified MySQL backup, migration review, explicit go-ahead |

Complete one focused change at a time. Do not continue into a dependent task when its prerequisite failed or was reverted. Record deferred work and its dependencies explicitly.

## Phase 0: Baselines and acceptance contracts

### 0.1 Establish what actually runs

- Record the working-tree baseline without discarding existing user changes. Identify the deployment source set and test harness loading order.
- Confirm the deployed system-storage backend and inventory company Sheets, system-store calls, and MySQL endpoints separately.
- Trace the actual request graph for selected slow actions: browser RPCs, router/dispatcher, helper calls, storage reads/writes, JDBC acquisitions, and cache invalidations.
- Confirm that a proposed optimization reaches an active caller. The three TopLight setters `setHeaderFormulas_`, `setSalesHeaderFormulas_`, and `setCashFormulas_` are compatibility definitions with no call sites found in that file during review; active writers already merge values and formulas.
- Mark admin matrix/pages/user-view spreadsheet loops and `drainHistoryQueue_` spreadsheet processing as **Sheets fallback paths**. Their Firestore branches return before those loops.

### 0.2 Capture correctness and performance before editing

Run `node tools/verify/run_all.js` and record existing failures separately from regressions. Review generated reports: the suite includes a verifier that writes a report, so it is not a strictly read-only operation. Do not weaken assertions to conceal behavior changes.

Create focused before/after fixtures for changed behavior, including:

- ID case, whitespace, blank/null values, numeric versus string IDs, duplicate IDs, and missing records.
- Invalid dates, date-only inputs, time strings, currency rates, employee-status ties, and payroll calculations where affected.
- Physical sheet rows separated by blank rows; formulas mixed with values; non-contiguous updates; inserts/deletes that shift row positions.
- Permission failures, document validation, optimistic conflicts, request retries, lost responses, upload recovery, and history old/new values.
- Firestore document identity/update-time preconditions and Assessment public/authenticated route separation where affected.

Measure representative read **and write** flows. Initial candidates include TC budget references and stock revision, TL product movement and invoice save, VF sales bootstrap and invoice/manufacturing approval, and affected admin/history/authentication paths.

Record backend, row counts, cache state, median/p95 latency, RPC count, JDBC connections/queries, storage reads/writes, and errors. Use comparable fixtures and at least 30 samples per selected benchmark where practical; report smaller samples as preliminary. Prefer staging for repeated writes.

**Acceptance:** zero behavior regressions; demonstrate a reduction in the targeted repeated I/O or computation; target at least 10% median improvement on a measured bottleneck, with no unexplained p95 regression above 10%. Investigate noisy or inconclusive results rather than claiming a gain. Helper deduplication may be accepted for maintainability without claiming speed improvements.

`_sheetsReadCount_` counts only instrumented data-layer reads, not every direct company `getValues()` call or Firestore/JDBC operation. Treat it as a partial metric, not proof of total I/O reduction.

## Phase 1: Cache and index correctness prerequisites

### 1.1 Fix primary-key cache invalidation before expanding its use

In `02_DataAccess.js`, `getRecordsByPk_` currently reads/populates `_pkIndexCache_` even when `_recordCacheDisabled_` is true. The first `noteMutation_` clears caches; subsequent mutations return early once caching is disabled.

This permits a stale sequence: write -> rebuild PK index -> write again -> reuse stale index.

Choose and verify one coherent policy:

- Conservative option: bypass PK memo reads and writes while record caching is disabled.
- Alternative: invalidate affected indexes on **every** mutation, with proven coverage for all relevant writers.

Preserve request reset/rearm behavior. Cover read -> write -> read -> write -> read, insert/delete row shifts, and direct writes. Audit any new customer-movement, page, or lookup memo against the same lifecycle; resetting only at request start is insufficient for derived data read again after a write.

### 1.2 Define matching and ownership contracts

Do not replace every `.find()` with the current `indexById` or `getRecordsByPk_`.

The existing index helper trims IDs, adds lowercase aliases, skips blank IDs, and can collapse case-distinct keys. These semantics differ from exact string equality and strict typed equality.

For each candidate, record:

- Actual header/key selection and exact normalization rules.
- Duplicate handling (first match, last match, all matches, or integrity error).
- Missing-value and missing-record behavior.
- Whether the caller mutates returned records.
- Expected reuse count and index memory cost.

Use an exact-match index where required; use the existing normalized helper only after equivalence is demonstrated. A one-use Map still requires an O(N) build and may offer no benefit over one `.find()`. Composite keys must avoid delimiter collisions.

### 1.3 Preserve physical rows and historical snapshots

`buildRecordsFromRaw_` removes blank rows. Never infer a physical row as filtered-record index + 2. Capture row numbers from the original two-dimensional sheet read and preserve the sheet's actual header offset.

A positional index must be refreshed or adjusted after inserts/deletes. Cached row hints must verify the target row's ID before a write; external/manual sheet edits may not bump application version stamps.

`getReadOnlyRecords_` shares the memo's invalidation lifecycle; its internal cache does **not** survive mutation. A caller may retain a pre-mutation local reference solely as a historical snapshot. Do not mutate that shared snapshot or treat it as current data after a write. Copy records when the caller needs mutable ownership. Preserve backend routing; this helper must not bypass the system-store adapter for Firestore tables.

### 1.4 Migrate cache readers, writers, and invalidators together

`tlRefs_` already delegates to chunked `getRefsCached_`. The unchunked TopLight path is `cachedMap_`; do not replace working wrappers merely to rename them.

- Inventory each cache key's payload shape, TTL, backend/company scope, dependencies, readers, and invalidators.
- Migrate `cachedMap_` with chunk-aware invalidation. `bustTopLightCaches_` currently removes plain keys; it must also remove the manifest/chunks or invalidate their versioned namespace.
- Preserve separate raw/projected reference shapes. A shared key must never carry incompatible payloads.
- Keep existing company version namespaces initially. A namespace rename requires an explicit producer/consumer/invalidation migration.
- Cache TC `employeeRefs_` only after employee and status dependencies and their mutation paths are covered.
- Migrate VF `vfFindRowByUid_` cache storage if useful, but retain its 60-second TTL initially. Do not raise it to 600 seconds without a justified freshness budget, complete mutation coverage, and target-row verification.
- Treat cache misses, eviction, incomplete chunks, oversized values, and cache errors as rebuilds, not successful empty results.
- Audit shared chunk helpers before expanding their use: payload byte size for Arabic/non-ASCII data, key collisions after sanitization/truncation, and concurrent writers publishing the same key. Existing character slicing is not proof of a byte-safe chunk limit.

Do not describe CacheService as durable storage or expiry as a guarantee. Preserve existing freshness limits unless a deliberate behavior change is separately agreed.

## Phase 2: Measured reads and safe spreadsheet batching

### 2.1 Prioritized read candidates

These are candidates, not unconditional search-and-replace instructions:

| Area | Candidate | Conditions |
|---|---|---|
| TopLight edit/delete/approve flows | Repeated purchasing/sales/cash UID lookups and raw-read plus record-read pairs | Exact ID semantics, physical row mapping, and Phase 1 lifecycle |
| VF warehouse movement | Product lookup inside the movement-row loop | Build once outside the loop; preserve original typed comparison |
| VF purchasing/costing | Repeated Code lookups and history snapshots | Preserve case/spacing/duplicate rules and snapshot ownership |
| VF manufacturing | Workcenter membership and UID-to-row nested scans | Set/Map semantics must match each original comparison |
| VF invoice approval | Header `findIndex` inside the row loop | Hoist once; preserve missing-header handling |
| TC costing/payroll/printing | Certificate, employee-month-year, and document lookups | Collision-safe keys; identical first-match behavior |
| TC card rendering | `cards.indexOf` inside iteration | Use iteration index only if repeated references do not change intended numbering |
| Admin | Repeated header lookup | Precompute only in the backend path actually used |
| Page registry | Repeated action lookup | Preserve duplicate precedence and any registry initialization/reset behavior |

For `vfFindRowByUid_`, reuse the initial raw array for fallback only if it was actually loaded on that execution path. On a persistent-cache hit, load fresh data when verification or fallback requires it.

### 2.2 Customer movements and system authentication

For TopLight `customerRawMovements_`, inspect every consumer before changing its return shape. Prefer preserving its existing array interface and adding an internal per-customer index, unless all callers are updated and checked together. Preserve movement ordering, date filters, and balances. Invalidate derived results after all contributing writes; do not reuse a pre-write aggregate as current state.

For sessions/users/devices/company data, avoid reading an entire Firestore collection just to build a one-use Map. Assess a targeted query through the existing system-store API, preserving revocation, expiry, duplicate handling, session cache behavior, and storage errors. Keep the Sheets fallback behavior intact.

### 2.3 Batch only the intended cells

- Group genuinely contiguous changed ranges. Do not fill gaps by rewriting unrelated cells from an old snapshot.
- Do not use whole-row `setFormulas()` with empty entries for value columns: these are writes, not preserve-existing-value markers.
- Do not replace formulas with calculated values obtained from `getValues()`.
- Preserve append-allocation locks, optimistic checks, mutation/version stamps, audit ordering, and failure semantics.
- Do not assume all selected rows are contiguous. Row deletion invalidates later positional references.
- Optional pre-read data parameters on shared patch/find helpers must identify their table/layout and have a defined freshness/ownership contract. Preserve the existing default behavior and system-backend routing.

| Candidate | Safe scope |
|---|---|
| VF `approveValleyInvoice_` / `approveValleyMfgOrder_` | Reuse verified row location and pre-write history; batch adjacent approval fields only |
| VF `saveValleyInvoice_` allocations | Batch actual contiguous changed allocation ranges |
| VF `saveValleyMfgOrder_` append helper | Accumulate append rows while preserving locked row allocation and IDs |
| TC `updateStockRevision_`, `updateImportFollowStatus_`, `editLegalCostingBundle_` | Group changed cells without overwriting formulas, untouched rows, or concurrent edits |
| VF employee-status/vacation allocations | Batch only selected adjacent cells; retain history and version behavior |
| Admin matrix/pages/user views | Optimize Sheets fallback separately; evaluate actual Firestore calls independently |
| History queue | Backend-specific claim/dedupe/write/done/delete protocol; preserve claims belonging to other workers and recovery after partial failure |
| TopLight compatibility formula setters | Defer unless an active call path is found; active writers already batch values/formulas |
| VAT export formatting | Batch backgrounds while preserving appearance; do not silently drop striping |
| Attachment repair tools | Lower priority; preserve preview, scope restrictions, recovery data, and formula safety |

## Phase 3: Consolidation based on proven equivalence

### 3.1 Utility and local helper inventory

Create `04_Shared.js` only for helpers whose sharing is justified. Confirm Apps Script push order and test harness loading before relying on new globals. No npm imports in server code.

Known differences that must be preserved:

| Family | Verified difference |
|---|---|
| `currencyOptions_` | TopLight includes `rate` and returns [] on failure; TC/VF return value/label and fall back to EGP |
| `parseDate_` | VF HR returns null for invalid/empty inputs; other copies have different date-only and invalid-date behavior |
| `timeFrac_` | VF copies differ in validation and malformed-input fallback |
| `pad2_` | Implementations differ outside ordinary two-digit inputs |
| `getLatestStatusMap_` | Employee-code conversion, date handling, and equal-date precedence differ |
| Local VF helpers | Same names occur in separate IIFEs or local scopes; constants and captured variables may differ |

UID and column-letter helpers are promising candidates after edge-case comparison. Preserve per-company wrappers where they carry cache, fallback, or business semantics. Hoist nothing solely because its name repeats.

Use `buildRecordsFromRaw_` or a shared record-to-row mapper only when header trimming/case, duplicate headers, blank-row filtering, null/undefined handling, ordering, and row identity match. Keep Assessment storage mappings isolated.

### 3.2 Defer broad business/module unification

A company factory cannot be configured solely by `ACTION_TABLES`. A reviewed factory contract must preserve:

- Action handlers, page/access metadata, table mapping, authorization, and validation order.
- TopChemical's extra request context and upload request-recovery hooks.
- TopLight's existing `ACTION_DEFINITIONS` and its compatibility projections.
- Assessment's separate public dispatcher, token checks, rate limiting, and authenticated surface.
- Company-specific response shapes, errors, bootstrap/reference behavior, and initialization order.

Dashboard/KPI/income-statement functions are not interchangeable: TopLight uses `kpis`; VF dashboard includes `kpi`, chart arrays, and placeholder behavior. Preserve payload contracts and financial calculations. Completing placeholder features is outside optimization scope.

Products, invoices, employee creation, and payroll remain company-specific unless side-by-side behavioral fixtures justify extraction. Sheet names and formulas alone are not a sufficient configuration contract.

For Drive helpers, retain attachment authorization, folder resolution, request-id propagation, recovery tags/searches, and uncertain-upload handling. Sharing the upload transport alone does not provide end-to-end idempotency. Do not merge `addUploadFile_` merely because its name matches.

## Phase 4: JDBC and MySQL cache optimization

### 4.1 Prove connection and query savings

`dbManufactureUpdateHeader_` already opens one connection and does not call `dbProductCodeUnit_`. The latter already accepts an existing connection. The earlier draft's example call chain was incorrect.

- Measure connections per actual server request. A shared wrapper does not combine separate browser RPCs.
- Extract connection ownership only where useful: one owner closes the connection; helpers close their result sets/statements without closing a borrowed connection.
- Preserve SQL, bound parameter order, null coercion, read-only fields, column labels/order, return types, and errors when consolidating row mapping/update/soft-delete helpers.
- Move `systemQtyMap_` SQL into the connector if justified, preserving its existing cache freshness and returned shape.
- Cache successful candidate probes by database/configuration and query context. Retry the discovery loop when a cached candidate fails; TTL caching does not mean discovery runs only once forever.
- Make `dbQuery_` counts optional only with a backward-compatible default that retains totals for existing callers. Remove counts from a caller only after proving it does not need them.
- Preserve each endpoint's existing limits; the generic maxRows setting is not the limit of every specialized endpoint.

### 4.2 Design result-cache dependencies before adding caches

Initial candidates remain `dbClientsArList_`, `dbClientBalanceSheetsList_`, `dbManufactureList_`, `dbProductsLiveList_`, `dbBoxList_`, and `dbChartAccountLabels_`. Eligibility must be assessed individually.

**Do not use MAX(updated_at) + COUNT(*) as a universal correctness guarantee.** It may miss updates when timestamps do not advance or share limited precision. MAX(id) + COUNT(*) does not detect ordinary edits. Neither strategy automatically tracks joined/view dependencies.

For each endpoint, document:

- Every contributing table/view and external writer.
- Timestamp maintenance guarantees, deletion behavior, and acceptable staleness.
- Cache key scope: database/environment, endpoint/source, filters, bound parameters, sort, limit, offset, loadAll, response version, and authorization scope where results vary.
- Explicit invalidation after relevant application writes, plus a justified strategy for external changes.
- Failure/miss fallback and concurrent publication behavior.
- Actual query plan and stamp cost; adding a primary key does not automatically index updated_at or make COUNT cheap.

`dbProductsLiveList_` joins `products` with `product_current_quantity`. A product-master stamp alone cannot validate cached `live_quantity`. Keep live stock uncached, or preserve a documented existing freshness budget, until all quantity dependencies have a valid strategy. Identify the base-table dependencies of clients_AR/vendors_AP before caching them.

A 600-second TTL is a candidate ceiling, not an automatic setting. Do not lengthen the existing 120-second quantity-cache freshness budget without explicit justification. Chunk storage solves payload sizing, not invalidation.

### 4.3 Optional batch routes: separate feature proposal

New `db_insert_many` / `db_update_many` routes and Viewer changes are deferred from the initial behavior-preserving work. Establish a real bulk workflow and measured benefit first.

Before implementation, specify atomic versus partial success, transaction begin/commit/rollback, batch size and execution limits, affected-row/conflict reporting, heterogeneous column grouping, generated IDs, retries/idempotency, audit behavior, authorization, and version checks. Reuse the existing security gates and bind all values.

Verify Apps Script JDBC driver support and behavior before adopting `rewriteBatchedStatements=true`; do not append it blindly. Test mid-batch failure and lost responses. Review server routes and client adoption together; do not expose unused routes as a claimed performance improvement.

## Phase 5: Optional MySQL schema and index review

### 5.1 Read-only discovery first

Use `dbGetColumns_`/DbLive Viewer for the metadata they actually expose. Obtain full schema inspection through an appropriate authorized MySQL administration path; the current Viewer is not an arbitrary SQL console.

Collect server version/engine, SHOW CREATE TABLE/VIEW equivalents, full index definitions and column order, primary/composite keys, foreign keys, nullability, defaults, AUTO_INCREMENT behavior, triggers, table sizes, duplicates, and query plans for measured slow queries. information_schema.COLUMNS alone is insufficient.

No repository evidence proves that all MySQL tables lack UUID keys or that every named id column should become the primary key. An application call to LAST_INSERT_ID indicates an expectation, not a verified live definition.

### 5.2 Candidate decisions, not automatic ALTER statements

| Object | Required decision |
|---|---|
| manufacture_footers | Verify actual key/auto-increment definition, duplicate/null IDs, relationships, and existing indexes |
| manufacture_headers / products | Check existing keys and measured access paths before proposing any new key |
| warehouses | Inspect actual shape; presence of id alone does not justify changing the PK |
| chart_of_accounts_main | Inspect all keys and id_5 duplicates; retain the label-map approach unless join uniqueness is established and maintained |
| client_balance_sheets / regular_box_movement | Verify comments against live definitions; no change assumed |
| clients_AR / vendors_AP / product_current_quantity | Confirm object types, view definitions, dependencies, and updateability |

An ordinary index on id_5 does **not** enforce uniqueness or prevent JOIN fan-out. A surrogate id PK also does not make id_5 unique. Keep the existing non-JOIN account-label logic unless a separate, validated data-model decision changes that contract.

Do not retarget view UPDATEs solely because the code warns about non-updatable views. Verify actual updateability and affected-row semantics first; if retargeting is necessary, preserve filters, ownership, and the exact field/base-row mapping.

Firestore `keys: []` denotes no configured business-key mapping in that schema entry; it does not mean documents lack identity. Do not add logical IDs or change Firestore schemas as part of MySQL PK work.

### 5.3 Recovery and execution gate

`07_Backup.js` and `11_DailyBackup.js` do **not** back up MySQL. Company spreadsheet backups cannot recover a MySQL schema change. The Firestore backup entry point separately reports that a native export is required.

Before any DDL:

- Obtain a consistent MySQL backup/snapshot covering data and definitions, and verify restoration in an isolated target.
- Prepare exact migration steps from live definitions, including key/foreign-key dependencies, duplicate/null remediation if separately authorized, locking/rebuild implications, disk requirements, and execution window.
- Document recovery procedures; do not assume a transaction rollback can undo DDL.
- Obtain the owner's explicit go-ahead for the concrete migration.
- Verify row counts, constraints, query plans, application writes, and relevant pages afterward.

Credential rotation/removal of the fallback is a separate operational change. Configure the replacement securely and verify access before removing the fallback; never reproduce secret values in the report.

## Completion checklist and rollout

- [ ] Baseline records backend, active callers, existing test status, and representative read/write metrics.
- [ ] Companion execution prompt reconciled with this revision before use.
- [ ] PK-cache repeated-mutation behavior fixed before lookup expansion.
- [ ] Every new index preserves matching, duplicates, physical rows, ownership, and invalidation.
- [ ] Chunk-cache migrations cover every reader, writer, invalidator, and failure path.
- [ ] Spreadsheet batches preserve formulas, untouched cells, locks, optimistic checks, and audit history.
- [ ] Consolidation is supported by behavioral equivalence; unsupported merges are deferred.
- [ ] JDBC savings are measured per request; cached results have complete dependency/freshness contracts.
- [ ] Assessment isolation, system-backend routing, permissions, and request recovery remain intact.
- [ ] Targeted regression checks and the full verification suite pass for implementation changes; no unexplained baseline failures are reported as green.
- [ ] Staging checks cover cold/warm/evicted caches, concurrent writes, partial failure, retry/lost response, affected permissions, and backend-specific paths.
- [ ] Before/after performance results meet the stated gates or are reported as inconclusive/no gain.
- [ ] Deployment and rollback are documented separately; no automatic clasp push from this plan.
- [ ] Optional batch routes/schema changes remain deferred unless their separate prerequisites and scope are satisfied.

For each change, report functions/files changed, preserved contracts, test results, backend coverage, performance evidence, remaining risks, and deferred dependencies. Code rollback may require expiring changed cache namespaces; schema recovery requires its own verified procedure. Roll out in focused increments and stop when correctness or freshness checks fail.

## Reference documentation

- [Apps Script Cache limits and expiration behavior](https://developers.google.com/apps-script/reference/cache/cache)
- [Apps Script Range formula writes](https://developers.google.com/apps-script/reference/spreadsheet/range#setformulasformulas)
- [MySQL ordinary versus UNIQUE indexes](https://dev.mysql.com/doc/refman/8.0/en/create-index.html)
- [MySQL index optimization](https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html)

