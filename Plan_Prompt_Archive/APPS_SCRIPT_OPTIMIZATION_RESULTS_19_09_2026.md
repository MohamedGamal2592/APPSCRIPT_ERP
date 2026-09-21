# Apps Script Optimization Results — 19/09/2026

**Run prompt:** `APPS_SCRIPT_OPTIMIZATION_RUN_PROMPT_19_09_2026.md`  
**Plan:** `APPS_SCRIPT_OPTIMIZATION_PLAN_19_09_2026.md`  
**Scope:** implement the latest optimization-review fixes, verify them offline, classify remaining failures, and update this report.  
**Deployment:** none. `clasp push` was not run; no staging or production writes were performed.

## Executive result

The requested optimization fixes are implemented and the focused optimization checks pass. The full offline suite improved from **76/87 passing (11 failed)** before this turn to **82/87 passing (5 failed)** after it.

The five remaining failures are outside the optimization changes: two customs attachment-identity contract mismatches, one stale responsive-CSS structural rule, one separate RegistrationPapers boot defect, and one shared-bundle size ceiling. They are recorded below with ownership classifications; none was hidden or weakened.

## What changed

### 1. Primary-key memo and lookup contract — complete

`02_DataAccess.js` now preserves the pre-optimization lookup contract explicitly:

- `indexById` returns a plain `Map`; the removed `_PkIndexMap_` facade no longer normalizes queries.
- Stored keys are trimmed and both the trimmed key and lowercase alias are indexed; blank IDs are skipped.
- Duplicate rows are last-write-wins for each key written. A case-distinct exact key remains distinct, while the lowercase alias follows the last row that wrote it.
- Queries are not trimmed or lowercased by the map itself. Callers that need the compatibility probe explicitly try the exact key and its lowercase alias.
- `getRecordsByPk_` still bypasses the record cache while `_recordCacheDisabled_` is active, preserving fresh reads during mutation windows.

`tools/verify/optimization_record_cache.js` covers read → write → read → write → read, inserts, deletes, row shifts, blanks, duplicate headers, numeric/string IDs, exact-vs-alias behavior, whitespace-query misses, and snapshot ownership. It passes.

### 2. Chunked-cache generation publication — complete

`02_DataAccess.js` now publishes chunked values as immutable generations:

1. Serialize JSON and split by UTF-8 byte size, not JavaScript character count.
2. Write all generation-specific chunks first.
3. Under `LockService`, re-read the invalidation epoch; abort if invalidation occurred during the build.
4. Publish one manifest pointer containing generation, chunk count, byte count, digest, and timestamp.
5. Remove only the previous published generation and legacy fixed-namespace entries; unrelated generations remain untouched.

Reads require a complete referenced generation and validate chunk count, UTF-8 byte count, SHA-256 digest, and JSON parsing. Missing, partially evicted, corrupt, or legacy fixed-layout values are cold misses. The stable logical key uses a bounded hashed namespace, so prefixes such as `tenant/a` and `tenant?a` cannot collide.

TTL behavior was not lengthened. Invalidation increments the epoch and removes only the currently published generation. An older reader can therefore see a complete old publication or a miss, never a mixed old/new value. A late writer cannot republish after a newer invalidation.

`tools/verify/optimization_chunk_cache.js` passes coverage for Arabic and supplementary Unicode payloads, byte limits, partial eviction, corruption, interleaved reader/writer publication, invalidation during build, legacy collision, long keys, TopLight cache stamps/invalidation/TTL, and repeated execution.

### 3. Fresh employee references — complete

`Company_TopChemical_Actions.js` restores `employeeRefs_` to a fresh `getAllRecords_` read on every request, preserving the existing `{ map, options }` shape, sorting, and error behavior. The unapproved 600-second cache and obsolete invalidation path were removed. The focused verifier confirms an external employee mutation is visible on the next request.

### 4. Repeated-read and lookup fixes — complete

- `Company_TopLight_Actions.js`: `editPurchasing_` builds the old history snapshot from the already-read raw grid and headers; it no longer performs a second full `getAllRecords_` read.
- `Company_ValleyFoods_Actions.js`: `whBatchUnit_` retains the original exact, trimmed stored-ID predicate with case-sensitive and typed query behavior. `saveValleyWarehouseMovement_` lazily builds one first-wins product-unit map only when a current batch has no unit and a product ID is present. Existing-unit batches perform zero product-table reads; fallback rows share one read per request.
- Customer movement analysis was measured in a request-local fixture: one raw rebuild per statement, with opening/running balance and date filtering verified. A global per-customer index was not introduced because the current path provides no demonstrated same-request reuse or freshness budget.

`tools/verify/optimization_reads.js` and `tools/verify/s12_warehouse_movement.js` pass these behavioral checks.

### 5. Validation and stale verifier repairs — complete

The following focused assertions now test behavior rather than obsolete source shapes:

- `tools/verify/box_wiring.js`: exercises fail-closed denial for an unlisted action, denial without a listed page grant, approval with the grant, and explicit super-admin bypass.
- `tools/verify/rt6_router.js`: accepts the resolved `page.accessPage || action` gate used by `getPageBody_` and still checks the route, fallback, teardown, and leak behavior.
- `tools/verify/s4_cost_page.js`: checks routeable-page/template consistency instead of a stale hard-coded page count.
- `tools/verify/s15_iphone_rest.js`: retains the shared CSS differential and checks the moved listener behaviorally.
- `tools/verify/s26_party_agreements.js`: accepts the actual `patchRowByCriteria_` helper contract and verifies unique-ID behavior.
- `tools/verify/optimization_reads.js`, `optimization_chunk_cache.js`, `optimization_record_cache.js`, and `s12_warehouse_movement.js` were strengthened with full-handler fixtures and mutation/caching regressions.

The ten affected page bootstraps now include the existing server-rendered `IS_SUPER_ADMIN` and `USER_PAGES` values, so S24's navigation-visibility regression guard passes without client-side authorization derivation.

## Focused verification

All of these pass:

- `node tools/verify/optimization_record_cache.js`
- `node tools/verify/optimization_chunk_cache.js`
- `node tools/verify/optimization_reads.js`
- `node tools/verify/s12_warehouse_movement.js`
- `node tools/verify/s4_cost_page.js`
- `node tools/verify/s15_iphone_rest.js`
- `node tools/verify/s24_stock_scan.js`
- `node tools/verify/s25_stock_authority.js`
- `node tools/verify/s26_party_agreements.js`
- `node tools/verify/box_wiring.js`
- `node tools/verify/rt6_router.js`

The complete command `node tools/verify/run_all.js` finishes at **82/87 passing**.

## Remaining failures and classification

### C — separate owner/workstream decision: customs attachment identity (2 checks)

- `tools/verify/attachment_download.js:105`: expects the older customs identity fields and server identity shape.
- `tools/verify/appsheet_attachments.js`: expects the corresponding older AppSheet customs `fileLink` identity contract.

The current customs rework uses a different field identity contract. No optimization source was changed to guess or silently bridge these IDs. The owner must choose the canonical customs identity and then update the implementation and both verifiers together.

### B — verifier policy drift: four off-scale responsive queries

`UI-2.9b` reports `max-width` queries in:

- `Company_TopChemical_BudgetInvoices.html`
- `Company_TopLight_Financial_Position.html`
- `Company_TopLight_Income_Statement.html`
- `Company_ValleyFoods_IncomeStatement.html`

The remaining UI checks pass; this is the verifier's all-queries-must-be-min-width rule, not an optimization regression. It should be handled as a separate responsive-CSS policy decision, with visual review before changing either the CSS or the assertion.

### C — separate implementation defect: RegistrationPapers boot

Deployment smoke reports a newly throwing `Company_TopChemical_RegistrationPapers.html` block: `Cannot set properties of null (setting 'innerHTML')`. This is a real page defect that should be repaired before release, but it is outside the optimization changes in this run and was not altered speculatively.

### C — separate bundle-size workstream

`RT5` still exceeds the 340 KB page ceiling: `Company_ValleyFoods_Attendance` is 374 KB. The verifier confirms minification equivalence and the shared bundle's reduction, but shared-bundle splitting is a separate run requiring its own dependency and rollout review.

No A-class optimization implementation defect remains in the focused checks.

## Evidence limits and deferred work

Only static inspection and deterministic offline fixtures were available. No live Sheets/CacheService/JDBC timings, median/p95 latency, staging validation, or production validation were performed. Therefore this report makes no claim about wall-clock improvement in deployed Apps Script.

Deferred items remain deferred: helper consolidation, JDBC connection changes, per-endpoint result caches, broad global indexes, four-way shared-bundle splitting, and unrelated page/attachment fixes. A fresh-read path was retained where an external writer or missing freshness budget made caching unsafe.

The existing dirty working tree contained many unrelated user changes before this turn. Those changes were preserved. No schema, credential, route, deployment, or production state was changed.
