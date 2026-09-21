# JavaScript simplification and performance optimization plan

Date: 2026-09-11  
Status: Draft for implementation; this review changes documentation only.

Revision: Includes a required, measured optimization track for runtime memory, algorithms, mappings and indexes. “Memory” here means application memory and cache lifecycle. No implementation or performance improvement is claimed by this document.

## Assessment

**Yes, there is avoidable engineering complexity, but the project is not primarily over-structured.** It has a small, understandable Apps Script control layer surrounded by very large company modules, repeated metadata, mixed responsibilities, and verification scripts accumulated across previous projects. The strongest opportunity is to reduce the number of places that must agree when a workflow changes.

Keep the current platform and company boundaries. Simplify incrementally. A framework rewrite, universal CRUD engine, deeper directory hierarchy, or database migration would add risk and would not address the main maintenance problems demonstrated here. Splitting a file can improve navigation, but does not by itself reduce complexity.

Use current, evidence-based techniques appropriate to Apps Script: bounded request-local data, lazy indexes, hash joins, single-pass aggregation, selective projection and batched I/O. These are the optimization priorities. More elaborate structures are justified only when a measured hotspot needs them and the replacement remains understandable.

### Scope and evidence

This assessment covers the **current working tree**, including existing uncommitted changes. It is based on local code inspection and offline execution, not the deployed application or live databases. Root `.js` files are the configured Apps Script source; `.mjs` scripts and `tools/` are local utilities. HTML was inspected where it defines callers, shared browser behavior, and verification dependencies.

Line counts include comments and blank lines; they indicate concentration, not code quality by themselves.

| Current source | Lines | Assessment |
| --- | ---: | --- |
| All 22 root `.js` files | 32,627 | Moderate total size for several business domains |
| `Company_ValleyFoods_Actions.js` | 9,585 | Highest-priority maintenance hotspot |
| `Company_TopChemical_Actions.js` | 6,372 | Many unrelated domains and connector-facing actions |
| `Company_TopLight_Actions.js` | 3,673 | Repeated document workflows and company infrastructure |
| `Box_Analysis_Engine.js` | 2,811 | Large but cohesive domain engine; retain its boundary |
| `Code.js` | 2,075 | Routing, rendering, minification, telemetry, logging, files and triggers |
| `02_DataAccess.js` | 1,742 | Persistence, caching, IDs, authorization invalidation and audit queue |
| `DbLive_Connector.js` | 1,583 | Generic SQL operations plus several domain query families |
| `Company_Assessment_Actions.js` | 1,311 | Distinct scoring, public access and write contracts |
| `03_Security.js` / `05_Admin.js` | 1,024 / 1,020 | Theme generation and invoice rendering dilute their main roles |
| Local JavaScript under `tools/` | 79 files | Includes runners, harnesses and checks; not 79 runtime modules |

The three largest company action files contain **60.2% of root JavaScript lines**. The shared registry is only 46 lines. There is no evidence that removing the registry or merging companies would simplify the system safely.

## Findings and recommendations

References use paths and line numbers from the reviewed working tree; function names remain useful if lines shift.

### 1. Repeated action metadata is a stronger problem than the number of files

All four company modules maintain an action-handler registry, `PAGE_ACCESS`, `ACTION_TABLES`, dispatcher code and page-version behavior. For example, Top Light defines `PAGE_ACCESS` at line 92, `ACTION_TABLES` at 157 and derives `PAGE_TABLES` at 207. Valley Foods has the corresponding maps at lines 57, 230 and 354.

Adding an action requires coordinating its handler registration, permission mapping and logging table, sometimes far apart in the file. The separate page registry also contains presentation and navigation information. That information has a different purpose and should remain separate.

**Recommendation:** pilot one plain action definition per action in Top Light, with handler, page, access and primary log table stored together. Derive the current lookup maps from it initially, preserving dispatcher behavior. Keep explicit exceptions for exports, polling, public actions and handlers with their own gates. Do not build a plugin system or routing DSL.

`PAGE_TABLES` is already derived; it is not another manually maintained map to remove. Its entries also do not necessarily describe every table a workflow reads or writes. Preserve current watch behavior and document additional dependencies explicitly where required. Do not treat a primary audit-table label as a complete database dependency graph.

### 2. Authorization is checked through several paths; simplification must preserve their combined effect

`Code.js:572` (`executeCompanyAction_`) checks company identity, derives page access, infers access from action names and calls `canCompanyAction_`. Company `dispatch_` functions also call `guard_` using declared access. Examples are Top Light at lines 65–80 and Valley Foods at 412–426.

These checks are not interchangeable duplicates. Actions such as `save_*`, `approve_*`, `generate_*`, `commit_*` and `revert_*` need declared semantics beyond a verb heuristic. Polling and Assessment Center's public dispatcher have separate rules.

**Recommendation:** first consolidate metadata while leaving enforcement in place. Then, only with an exhaustive permission matrix, reuse a small access-resolution helper. Remove repeated checks only where equivalent entry-point protection is proven. Never remove a company guard merely because the outer router appears to check access.

### 3. Company files and shared files mix responsibilities

Valley Foods combines attendance import/review/undo, HR settings, purchasing, sales, stock allocation, manufacturing, cash and reporting. `Code.js` includes a handwritten minifier (`minifyInclude_`, line 757), telemetry (around 1246 onward), print/download endpoints and trigger installation. `03_Security.js:742` onward contains theme builders; `05_Admin.js:564` begins invoice HTML rendering. `DbLive_Connector.js` combines generic SQL functions with receivables, manufacturing and box-analysis queries.

**Recommendation:** use a few substantial domain boundaries where they remove unrelated material from daily work. Start with theme generation and telemetry, whose entry points are relatively clear. Consider attendance and manufacturing/stock extractions only after their private dependencies are mapped. Leave the coherent box engine and the four company registries intact.

Do not introduce one file per function, a generic service/repository/controller stack, or an arbitrary line-count target. Do not extract all modules in one change.

### 4. There are small, demonstrable cleanup opportunities

- Valley Foods declares `safeRows_` twice in the same IIFE, at lines 4880 and 8127. Both call `getAllRecords_` and return `[]` on an exception; the later declaration merely renames the second parameter. Keep one equivalent implementation, without changing its current error behavior in the same patch.
- `DbLive_Routes.js` has only `dbGuard_` (line 8); actual route registration is in `Code.js`. Moving that guard beside the connector's generic operations can remove a misleading file boundary without removing the super-admin gate.
- Historical comments contradict current behavior. The kill-switch comment near `Code.js:656` says recovery is only through the sheet, while `apiRouter_` explicitly permits an authenticated super-admin recovery action. Top Chemical still documents the old box-precompute trigger name around lines 5568–5578.
- `src_html/` contains seven `.js` copies; six differ from the corresponding root source. It is excluded from deployment. `Backup/` and `assessment center/` are also excluded. These are navigation/maintenance clutter, not evidence of multiple deployed implementations.

**Recommendation:** remove proven duplicates, correct current contract comments and label inactive copies clearly. Preserve archived material until references and any separate deployment ownership have been checked. Do not delete an old copy just because a root counterpart exists.

### 5. Similar data helpers sometimes protect different storage contracts

`02_DataAccess.js:722` (`addRecord_`) allocates a numeric ID, maps headers with exact-name precedence and a lowercase fallback, and returns lowercase record keys. Assessment Center's `acInsert_` at line 1159 uses caller-provided IDs and returns an object keyed by actual sheet headers. Its write helpers deliberately avoid creating an `ID_Counter` tab. Its update path also avoids merging the old row into a patch.

These differences rule out a safe blanket replacement with one CRUD function. Header case, audit keys and ID allocation are part of the persistence contract, not cosmetic inconsistency.

**Recommendation:** retain company-specific writers. Extract a small pure helper only when two callers demonstrably share the same mapping rules. Preserve exact-name precedence, case collisions, blank values, zero, false, date objects and formulas through fixtures. Do not normalize existing sheet headers or return shapes to make helper reuse easier.

### 6. Some performance complexity is justified; one area deserves later review

Request memoization, mutation invalidation, table-version polling, authorization generations, batched writes, stock flushes and audit queue recovery address concrete correctness or latency concerns. `vfBatchBalance_` (`Company_ValleyFoods_Actions.js:8198`) is already the central stock calculation to preserve. The audit queue in `02_DataAccess.js:1310` onward carries durable history and recovery state.

The handwritten minifier in `Code.js` is a higher-maintenance optimization: it interprets strings, regular expressions and nested template literals. The existing `rt5_budget.js` check passed, so removal is not justified by current evidence alone.

**Recommendation:** leave caching, queueing and live-save behavior intact during structural work. Evaluate minifier removal separately using bundle size, representative page behavior and navigation timing with `NO_MINIFY`. Keep it if removal materially harms the existing workflow. Consider build-time minification only if its operational benefit outweighs adding a required build step.

### 7. Verification has accumulated historical assumptions

The existing harnesses provide valuable behavioral tests; their file count alone is not overengineering. However, some checks inspect source text, assume old function locations, or require historical Git revisions. `run_all.js` also skips missing listed files without failing, and `rt2_record_replies.js:226` rewrites a report inside the source tree during verification.

**Recommendation:** keep the existing suite, then improve it where refactoring exposes fragility. Use stable behavioral fixtures for business rules and reserve source checks for useful structural invariants. Make missing required checks fail. Give report generation an explicit command/output path. Add convenient package scripts for verification and preview generation; the current `package.json` has no scripts and only declares `opencode-model-router`. Determine whether that dependency serves external developer tooling before considering its removal.

The three root `.mjs` utilities belong to operational tooling. The copy and date-conversion scripts use Google APIs and already require `--write` to perform their document writes. Keep their dry-run behavior, identity mapping, date rules, update masks and restart options. Move them together under a clearly named tools directory only after checking how they are invoked. Share authentication/configuration code only if continued use warrants it; do not introduce a migration framework for two scripts. This simplification does not change the application's storage backend.

## Required optimization design

### A. Optimize service calls, allocation and algorithms in that order

Google recommends reducing service calls and batching spreadsheet operations. Apply that guidance to measured endpoints rather than replacing every loop or adding caches indiscriminately. [Apps Script performance guidance](https://developers.google.com/apps-script/guides/support/best-practices)

Record three costs separately: external calls/bytes, JavaScript work, and retained memory. A fast lookup over a full spreadsheet is still a full spreadsheet read. An index can reduce CPU while increasing memory; it must earn that tradeoff.

The runtime matters: Apps Script lacks Node's `process` and browser `performance` APIs, does not support native ES modules, and performs blocking I/O. Wrapping Sheets calls in `Promise.all` will not make them parallel. Keep Node-specific profiling and chunked file processing in local tooling. [Apps Script V8 runtime](https://developers.google.com/apps-script/guides/v8-runtime)

### B. Use one bounded snapshot per read phase, with explicit ownership

**Observed:** `getAllRecords_` (`02_DataAccess.js:576`) caches raw matrices but rebuilds record objects on each hit. This protects callers that mutate returned objects, but repeated consumers pay repeated allocation. `getRecordsByPk_` at line 982 already supplies a request-local `Map`; extend/reuse existing infrastructure where its semantics fit.

**Proposed design:** add an opt-in internal read path to the existing data layer, not a parallel repository framework:

- Own one table snapshot during an unchanged read phase. Build header offsets once. Materialize row objects only if that consumer needs them; aggregate directly over columns otherwise.
- Build PK or parent-child indexes lazily. Store references or offsets into the owned snapshot instead of copies of entire rows in every index.
- Keep the existing `getAllRecords_` contract for callers that mutate results. Migrate only audited read-only consumers; project fresh response objects at the boundary. Do not expose mutable snapshot dates or nested values to code that can change them.
- Use the existing reset/rearm/mutation lifecycle. Clear all new snapshots and indexes on mutation at first. Keep post-write memoization disabled as today. Unknown/direct writes still invalidate conservatively.
- Enforce a measured per-request retention budget in estimated bytes and indexed rows. When exceeded, skip optional index retention and use a correct scan or bounded processing path. Never truncate business results to stay within a memory budget.
- Do not build an LRU cache for a short request unless measurements demonstrate a need. Do not use JSON round trips as generic cloning: they alter dates and other values.

Selective invalidation is a later option only after complete read/write/formula dependencies are mapped. Retain conservative invalidation when coverage is uncertain. For stock, obtain authoritative current balances at the existing correctness boundary; a request-local snapshot from before a write or concurrent change is not sufficient for a save decision.

### C. Build the right index, with exact key semantics

| Access pattern | Structure | Appropriate use |
| --- | --- | --- |
| Repeated lookup by ID | Lazy `Map<key, row reference>` | Products, parties, assessment IDs; preserve existing first/last-match behavior |
| Parent to many children | `Map<parent, array of references>` | Invoice lines, assessment questions/responses, manufacturing outputs |
| Membership only | `Set<key>` | Invited batches, selected IDs, relevant child IDs |
| Totals by group | `Map<key, accumulator>` | Counts and totals without retaining child arrays |
| Repeated date-window queries over unchanged rows | Sorted date/reference array + binary-search bounds | Only when repeated queries amortize sorting; keep original output ordering |
| Fuzzy item matching | Existing exact/stem/token candidate indexes | Improve measured candidate generation while retaining matching rules |

`Map`/`Set` offer average sublinear access by specification; expected constant-time hash lookup is a useful cost model, not a worst-case guarantee. The complexity targets below assume that model. [ECMAScript keyed collections](https://tc39.es/ecma262/multipage/keyed-collections.html#sec-map-objects)

Every index must specify: database/tenant, table, key columns, normalizer, duplicate policy, ordering, ownership, lifetime, invalidation and fallback. Keep this as a small developer inventory alongside existing helpers, not a new runtime catalog to maintain.

Key correctness is mandatory:

- Preserve case sensitivity, trimming, numeric-versus-string distinctions, missing values and existing aliases. The current `getRecordsByPk_` adds lowercase aliases and overwrites duplicates; it is not automatically equivalent to a case-sensitive `.find()` or `.filter()[0]`.
- Preserve **first match**, **last match**, or **all matches** explicitly. A naïve `new Map(rows.map(...))` silently changes first-match behavior to last-match behavior.
- Use nested maps or unambiguous tuple encoding for compound keys. Concatenating fields with `|` is unsafe if a field can contain it. Include the key column and key policy in index identity; `vfFindRowByUid_` currently keys its cross-request index only by database and sheet despite accepting `uidHeader`.
- Treat cached physical row numbers as hints. Recheck the business key against the current sheet under the existing write lock, rebuild/fall back on mismatch, and never accept a client row number as write authority.
- Do not replace exact duplicate-save checks with approximate membership structures. A false positive or false negative is unacceptable for money, inventory and audit writes.

### D. Concrete algorithm changes to pilot

These are source-based opportunities, not measured speedup claims. `B` = batches, `A` = assignments, `Q` = questions, `S` = scored items, `N` = source rows, `P` = returned page rows.

| Priority / location | Current work | Proposed replacement | Expected cost / preservation rule |
| --- | --- | --- | --- |
| P1: `getAcBatches_`, Assessment actions around 636 | Each batch calls `assignments.some(...)` | Build a set of batch IDs having an invited assignment once | Worst-case O(B×A) scan work to expected O(A+B); O(distinct invited batches) extra memory; preserve exact status and ID comparisons |
| P1: `getAcResult_`, Assessment actions around 1051 | Each question filters `scored.items` then takes the first | Build a first-match score index once | O(Q×S) to expected O(Q+S); preserve duplicate IDs, defaults and question order |
| P1: `getValleySalesList_`, Valley actions around 8713 | Full projection, a no-op sort, temporary sequence fields, another sort, then pagination | Remove redundant sorts; scan/filter/count in the existing order and project only retained page rows where `vfPage_` semantics allow | O(N) traversal and O(P) projected objects, excluding the source snapshot; preserve global serials assigned before filtering, totals, dates and all pagination modes |
| P2: `getAllRecords_` / audited repeated reads | Multiple materializations of the same cached matrix | One owned internal snapshot with lazy projections/indexes | Avoid repeated O(N×columns) allocations in the same read phase; preserve legacy mutable results for unmigrated callers |
| P2: report/document joins | Inspect nested `.find`, `.filter`, `.some` against the same rows | Index the smaller lookup side, or aggregate once by parent | Expected linear scans plus emitted matches; keep genuinely one-off scans instead of paying an unused index build |
| P2: `vfFindRowByUid_`, Valley actions around 6028 | Cache validation, index rebuild, then potentially another full scan | Reuse already-read rebuild data; remove a reread only when its concurrent-change/freshness role is proven unnecessary | Preserve UID validation, not-found behavior and write-lock boundary |
| P2: local `.mjs` copy/conversion utilities | Copy utility retains documents for all sheets before writing | Two-pass preflight then bounded sheet/range batches, retaining compact summaries | Peak transformed-document memory proportional to batch size; freeze/verify source between passes and preserve document IDs and dry-run behavior |

The copy script constructs `row_...` IDs **after filtering blank rows**. A chunked implementation must carry the same non-empty-row counter across chunks; switching to physical source row numbers would change document identity. Headers, duplicate-header suffixes, sheet indexes, collection naming and date serialization must also remain identical.

Keep floating-point accumulation order and rounding points unchanged when optimizing totals. A mathematically equivalent regrouping may produce different financial output. Preserve stable tie order, invalid-date handling and FIFO behavior; do not add a new tie-breaker to stock allocation as a performance change.

`Box_Analysis_Engine.js` already uses two-row Levenshtein dynamic programming and candidate blocking. Do not replace it with a generic fuzzy-search package. If profiling identifies repeated normalization, memoize only within the operation. Threshold-aware edit-distance pruning is optional and requires proof that rejected candidates cannot pass the existing scoring rule; exact scores/rankings must remain unchanged where exposed. Approximate nearest-neighbor search and embeddings are outside this behavior-preserving plan.

### E. Keep cross-request caches small and disposable

Use cross-request caching primarily for existing reference/projection use cases. Cache keys must include tenant/database, relevant filters and version information; permission-dependent projections also need their authorization scope. Never share a privileged projection with a lower-privilege caller. Prefer applying permission projection after a correctly scoped internal read.

Apps Script Cache currently documents 250-character keys, 100 KB per value, a 1,000-item cap and maximum TTL of 21,600 seconds. Entries may disappear before expiry. Use measured UTF-8 payload sizes, not JavaScript string length; Arabic text makes this distinction significant. Keep every cache miss/eviction/corruption recoverable from authoritative data. [Cache API limits and eviction behavior](https://developers.google.com/apps-script/reference/cache/cache)

Do not use cache versions as durable proof that business data is unchanged: stamps can disappear and external sheet edits/formula recalculation may bypass programmatic mutation hooks. Preserve authorization's existing generation/staleness rules; use fresh authoritative reads for stock, ID allocation and duplicate-save decisions. No new durable cache tables, persistent index sheets, Redis service or materialized business dataset are required.

### F. Map dependencies without creating another framework

Extend Phase 2's action definitions only with dependencies needed by a concrete consumer. Distinguish `primaryLogTable` from actual read/write sets and formula-fed tables. Use a small offline report to expose missing action mappings, duplicate registrations, unresolved handlers, public exceptions and direct writes that bypass mutation hooks. Dynamic dependencies must be marked unknown and keep the conservative path.

For example, a sales save affects header/line/allocation data and formula-derived current stock; invalidating only the primary log table is insufficient. Keep the existing call order and flush behavior. This mapping is useful for review and targeted validation before it is safe to drive selective invalidation automatically.

### G. Optimize SQL through existing access paths; preserve schema and pagination

`dbBoxList_` already uses explicit columns, bound filters, a total count, stable date/ID ordering and bounded `LIMIT/OFFSET`. Preserve those contracts. Check actual server version, existing indexes and query plans before claiming an index problem. MySQL's `EXPLAIN` describes query execution plans; use its version-appropriate form, and reserve execution-bearing analysis for isolated data. [MySQL query-plan documentation](https://dev.mysql.com/doc/refman/8.4/en/using-explain.html)

Prefer equivalent predicates/joins that use existing indexes and reduce transferred rows. SQL index DDL changes database structure and is outside this no-schema-change implementation. Record any unavoidable physical-index proposal separately. Do not silently replace offset pagination with cursors, remove totals, or narrow result coverage; those change the main workflow/API. In-memory indexing remains available without database DDL.

### H. Benchmark gates and memory accounting

Add one small offline benchmark entry point alongside the existing verification tools, using real extracted/pure functions and deterministic fixtures. It is planned work, not a benchmark already run. Cover empty/small inputs, representative sizes, 10× growth, skewed groups, duplicate IDs, blank rows, Arabic text, mixed dates and wide rows. Sweep 1k/10k/100k rows only where the domain supports them; do not manufacture meaningless giant assessment cases.

Measure each variant in a separate local process after warmup. Record median/p95 across at least 30 measured repetitions, operation/comparison counts, projected-object counts, retained index entries and payload bytes. Sample heap/RSS at phase boundaries and label these samples, not exact peaks. Node exposes memory statistics through `process.memoryUsage()`; these local measurements do not establish Apps Script heap usage. [Node memory measurement](https://nodejs.org/api/process.html#processmemoryusage)

In staging, measure endpoint time, external call counts, rows/cells transferred, serialized response bytes, cold/warm cache behavior and lock/retry effects. The existing `SheetReads` counter misses some direct calls, so instrument affected paths before treating it as a total. Keep diagnostics out of business schemas and exclude personal/business payloads from telemetry.

**Proposed acceptance targets, to calibrate against Phase 0 baselines:**

| Dimension | Gate |
| --- | --- |
| Correctness | Identical schemas, responses, record changes, permissions, ordering, totals and retry behavior on the acceptance fixtures |
| Algorithm growth | Selected nested scans become expected linear work; operation counts at 10× input confirm scaling independently of noisy wall time |
| Local hotspot CPU | Target at least 30% lower median for a targeted hotspot at representative size; no material small-input regression |
| Allocation | For snapshot/projection pilots, target at least 25% fewer materialized record objects; measure retained index overhead separately |
| Memory budget | Explicit per-request retained-row/estimated-byte limit; large inputs take a correct fallback without missing records; no mandatory full-dataset index |
| Staging latency | Target at least 20% lower p95 for affected slow endpoints; investigate repeated >5% regressions elsewhere under comparable conditions |
| I/O | No increase in service calls or transferred cells on targeted workflows unless measured end-to-end benefit justifies the tradeoff |
| Simplicity | Fewer repeated scans/definitions and no duplicate data-access stack; every new helper replaces concrete repeated work |

These are engineering targets, not guarantees or measured outcomes. A small clarity improvement need not achieve a large speedup; a performance claim must be supported by measurements. Do not sacrifice readable code, storage semantics or audit durability to meet a percentage.

## Baseline actually verified

Executed locally with Node v24.19.0:

| Check | Result | Interpretation |
| --- | --- | --- |
| `node tools/verify/run_all.js` | 68 of 71 passed; 3 failed; no skipped checks | Useful but not a clean release baseline |
| `node tools/ui_check.js` | C5 failed; remaining checks passed or reported information | C5 reports 40 undefined CSS classes versus baseline 37; requires classification, not automatic suppression |
| Root JavaScript syntax, through `ui_check` | All 22 files parse | Does not prove Apps Script execution behavior |
| Template syntax, through `ui_check` | 112 templates / 139 script blocks parse | Includes client-side contracts relevant to server refactoring |
| `node --check` on the three root `.mjs` utilities | All pass | Utilities were not executed against external services |

The three runner failures are:

1. **`s5c_sales_audit.js`: stale bug-presence assertion.** It expects `saveValleyInvoice_` to reference undeclared `outputs`, but finds zero references. Its printed conclusion that the save throws is not supported by this current result. Replace the historical assertion with a behavioral regression that the intended save completes without that error and preserves stock/cost rules.
2. **`s16_realtime_authority.js`: incomplete company fixture.** `authenticateSystemUser_` now checks company availability through `assertCompanyEnabled_`. `gasstub.js:202` only provides `ERP_Pages_Matrix` through `getSheet_`; the company lookup throws. A direct reproduction returned `COMPANY_DISABLED`, explaining the later undefined `auth.user`. Add real enabled/disabled/missing-company fixtures and rerun the complete authority suite; do not bypass the production gate to make the old test pass.
3. **`box_wiring.js`: trigger-name mismatch.** The check expects global `rebuildBoxAnalysisIndex()`, while the source exposes `rebuildBoxAnalysisIndex_()` at line 5578. Confirm intended RPC privacy and any installed trigger bindings before updating tests or code. Local inspection does not establish the installed trigger state.

The suite-generated `rt2_exemptions.txt` was restored byte-for-byte to its pre-run contents. No application-source edit, deployment, migration, live schema inspection or database write was performed for this review.

## Contracts that must remain unchanged

1. **Storage:** spreadsheet targets, sheet/table names, exact headers and order, PK/UID formats, reference relationships, formulas, number formats, date/time interpretation and serialized field types. No new schema or counter tables merely to support an abstraction.
2. **Wire contracts:** page IDs and template names, company IDs, action names, request fields, success/error shapes, returned record casing, print/export parameters and client calls.
3. **Access:** tenant isolation, company availability, session revocation, role hierarchy, kill-switch recovery, cost visibility, public candidate allowlists and artifact/download gates. Preserve the current failure behavior of each gate explicitly.
4. **Writes:** lock boundaries, ID allocation, duplicate-save handling, child-row replacement/deletion, audit events, formula writes, mutation/version stamps and required flushes. Never change lock placement while merely moving code.
5. **Operations:** trigger handler names and bindings, durable history-queue recovery, backups, retention and recovery tooling. No untracked queued work may be discarded during rollback.

### Data validation beyond the existing schema snapshot

Use `takeSchemaSnapshot_` and `verifySchemaUnchanged_` in `99_AuditTools.js`, but understand their limits: they compare tab lists, header strings/order and sampled row-2 number formats. They do **not** establish whole-dataset equality, formula equality, SQL schema equality or Firestore type equality. Collection also catches company lookup failures; confirm all expected databases were actually included before trusting a snapshot.

Before implementation, prepare isolated, equivalent baseline and candidate datasets. Compare row counts and keyed records, formulas, IDs, child relationships, totals and audit records for each workflow. Expected writes should match between baseline and candidate; untouched records should remain equal. Compare normalized volatile fields only through a documented allowlist, such as generated timestamps, rather than ignoring whole columns. Static frozen copies are needed for meaningful whole-data comparisons; live concurrent business activity would otherwise obscure the result.

The existing `stagingVerifyIsolation_` is useful but insufficient alone: its `safeForStaging` flag checks AUTH identity and MySQL credential presence, not whether every company target is a non-production copy. Verify all resolved company targets, copied formulas/external links, storage destinations and applicable trigger destinations. SQL workflows require an isolated SQL fixture/test database separately. Do not point those tests at production credentials.

## Implementation sequence

Required execution order: **Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6**. Algorithm and memory work are required parts of this revised plan; only Phase 7 is optional. File extraction now follows the optimization pilots so moving code does not distract from reducing actual work.

### Phase 0 — Establish a trustworthy baseline

- Preserve the current working state in a reviewed checkpoint without sweeping unrelated or credential files into a commit.
- Resolve/classify the four failing checks above. Replace obsolete expectations; fix real issues in separately identified changes. Do not reset baselines simply to turn checks green.
- Capture the action/page/permission/response inventory and exported Apps Script entry points. Record installed trigger bindings separately.
- Capture complete schema/data/formula fixtures and verify staging isolation as described above.
- Establish the CPU, allocation, service-call and endpoint baselines in optimization section H. Inventory existing indexes and their key/lifetime semantics before adding any.

**Exit:** required tests pass with no silent skips; every expected data target is represented; before/after comparisons are reproducible. Structural refactoring starts only after this baseline is trustworthy.

### Phase 1 — Remove low-risk maintenance clutter

- Keep one `safeRows_` implementation and preserve its behavior.
- Put `dbGuard_` beside generic SQL operations and remove the empty routing shell after reference checks.
- Correct contradictory comments; move long historical narratives to the archive while retaining short explanations of non-obvious invariants.
- Add a concise root project map: deployable source, local verification, operational scripts and archives.
- Add package commands for the existing checks and preview builder. Separate report generation from checks and fail on missing required checks.

**Exit:** no action, schema, response, permission or deployment entry point changes; all baseline checks pass. This phase should deliver useful simplification even if later phases are deferred.

### Phase 2 — Consolidate action metadata in one company

- Pilot Top Light's authenticated actions with a plain definition object and derived compatibility maps.
- Compare every registered action's handler, page, required access, log table and page-watch behavior before/after, including unmapped and special actions.
- Retain the existing dispatcher and guards during this conversion. Keep Assessment Center's public registry distinct.
- Apply the pattern to the other companies only if the pilot reduces manual coordination without introducing more machinery.

**Exit:** a routine action has one declaration for handler/access/table metadata; the permission matrix and all client contracts are unchanged. Any enforcement consolidation is a later, separately verified change.

### Phase 3 — Deliver the first algorithm improvements

- Implement and differentially verify `getAcBatches_` membership indexing and `getAcResult_` first-match score indexing.
- Remove the sales list's redundant sorting and pilot projection after filtering/paging, preserving `vfPage_` behavior, full-result modes and global serial numbers.
- Add only the fixtures/benchmark cases needed to prove these replacements; report both performance and semantic comparisons.

**Exit:** selected nested scans are eliminated, outputs remain equivalent, and measured results justify extending the pattern. No database/schema, stock, authorization or cache lifecycle changes in this phase.

### Phase 4 — Introduce bounded memory and lazy indexes

- Pilot the opt-in internal snapshot/index path in one repeatedly read, read-only workflow using `02_DataAccess.js`'s existing lifecycle.
- Measure allocation savings and index overhead; retain the old mutable-record path for other callers.
- Test mutation invalidation, cache failure, compound/duplicate keys, memory-budget fallback and concurrent-change-sensitive lookup paths.
- Refactor one high-volume report/document join only after the pilot succeeds. Keep stock authority reads and financial accumulation rules explicit.

**Exit:** lower repeated allocation with a bounded retention policy, correct fallback, no stale post-write reads and no global conversion of caller ownership semantics.

### Phase 5 — Separate only the largest unrelated responsibilities

- First move theme builders out of `03_Security.js`, preserving their function names and generated CSS. Update the preview builder, which currently loads the security source explicitly.
- Move telemetry functions out of `Code.js` as one coherent group. Preserve routes, triggers, buffer keys, sheet names and logging failure behavior.
- Pilot one Valley Foods domain extraction, preferably attendance, with its helpers/constants mapped first. Keep public actions and company dispatch stable. Manufacturing and stock stay together until their shared invariants are covered.
- Reassess before splitting other files. Smaller file size is not sufficient justification.

**Apps Script constraint:** the current `.clasp.json` has `rootDir: ""`, `skipSubdirectories: true` and an explicit partial `filePushOrder`. Keep extracted deployable files at the root initially. Moving runtime source into folders without changing the deployment configuration would omit it. Avoid new bundling infrastructure for this phase.

Company IIFEs have private state; functions cannot simply be moved outside them. Use a small explicit initializer or domain namespace that retains private helpers, exposes only needed handlers and is initialized deterministically after its dependencies exist. Do not spread mutable global initialization across files or assume alphabetical names settle dependency order. Update explicit source lists in tests/tools as part of each move; keep behavioral assertions intact.

**Exit:** unchanged action inventory and deployed source set except intended file additions/removals; no global-name collisions or initialization-order regressions; workflows below pass.

### Phase 6 — Reduce repeated implementation and bound operational scripts

- Extract only proven-equivalent pure helpers, beginning with straightforward mappings or formatting used by multiple callers.
- Keep company-specific ID, header, formula, audit and stock policies explicit.
- Review duplicated SQL setup/cleanup only when resource handling and parameter-binding tests cover all affected handlers.
- Move local operational scripts and adjust documented invocation/configuration together; preserve dry-run defaults and all existing document identity/type rules.
- Apply section D's bounded-batch design to large local operations, keeping preflight validation before writes and detecting source drift between passes.
- Review existing SQL access paths as in section G; leave database DDL and pagination-contract changes outside this plan.

**Exit:** less duplicated executable behavior, no growing universal helper with many policy flags, and equivalent persistence/wire outputs for affected cases.

### Phase 7 — Optional advanced optimization cleanup

Evaluate the handwritten minifier and any proposed cache simplification against measured size, service-call counts, latency and failure behavior. Compare representative pages with the current optimization and its simpler alternative under the same conditions. Agree acceptable bounds before removing an optimization. If the evidence does not support removal, keep it.

Consider sorted date indexes, threshold-aware fuzzy-match pruning and selective invalidation only for remaining measured hotspots. No custom memory allocator, object pool, mandatory typed-array conversion, probabilistic business-key index or additional cache service is justified by the current evidence.

## Workflow acceptance checklist

Run baseline and candidate against equivalent isolated fixtures; compare resulting state and responses.

| Area | Essential comparisons |
| --- | --- |
| Login/access | Login/setup, revoked session, changed role/company, disabled company, denied tenant, kill-switch recovery, cost-hidden user |
| Top Light | Purchase create/edit/approve/delete, sales and returns, offers, cash transfer, statement and print/export |
| Valley Foods purchasing | Header/line save, replacement/deletion, mixed-case headers, costing formulas and cost visibility |
| Valley Foods manufacturing/stock | Create/edit/approve/delete, consumption/output rows, insufficient stock, `available = current_qty + held(this document)`, flush and refreshed balances |
| Valley Foods sales/warehouse | Invoice create/edit, batch allocations, returns, repeated request, warehouse add-only movement and formulas |
| Valley Foods HR | Attendance import/review/resolve/undo, duplicate imports, overnight shifts, deductions/overtime and payroll totals |
| Top Chemical | Stock scan/revision, purchasing/import/customs, payroll, budget documents, SQL manufacturing/receivables and box edit/review |
| Assessment Center | Authoring, invites/token/expiry rules, attempt/submission retries, scoring/grading, protected answer projection and optional-column cases |
| Shared client behavior | Page routing, pagination/filtering, optimistic save/rejection/retry, quiet refresh, permission refresh and authorized downloads |
| Operations | Audit queue interrupted-drain recovery, trigger bindings, backup/retention behavior and restore rehearsal |

Reuse the existing `s12`, `s16_attendance`, `s17`, `s18_live_saves`, `s25`, `ac*`, `box*` and `rt*` checks where applicable. Add behavioral cases only for gaps relevant to each change. Offline stubs do not replace staging checks for Apps Script locks, formula recalculation, triggers or JDBC behavior.

## Rollback and completion

Make each phase a separately reviewable change. Preserve a tested deployment version and matching source checkpoint. For a behavior regression, restore the prior code and trigger bindings; keep existing business data and queued history intact. Inspect any partially completed writes before further processing. Do not automatically restore an entire database and overwrite legitimate intervening work.

The revised plan is complete when required phases 0–6 produce verified reductions in repeated definitions, scans and allocations; required checks pass without silent skips; schemas and workflow results match the baseline; and deployment/recovery remain straightforward. Report measured before/after results and any optimization rejected on evidence. There is no target percentage of deleted code or target number of folders. Phase 7 remains optional.
