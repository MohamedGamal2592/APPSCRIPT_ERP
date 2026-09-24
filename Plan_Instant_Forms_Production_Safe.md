# Plan: Responsive Forms and Batched Saves in the Production ERP

Date: 2026-09-24  
Status: **Design and local preparation only. No implementation or deployment authorized by this document.**  
Production condition: **The application is live and users are actively working.**

## 1. Objective and controlling constraints

Keep the current storage initially, standardize form state and save commands, eliminate repeated reads and numeric-ID scans, and introduce document-level batching. Begin with one simple form and ValleyFoods manufacturing; expand only after their contracts are understood.

The owner's constraints override conflicting instructions in earlier project plans:

1. **No unit tests.** Do not create, modify, or run unit tests. This also excludes existing verification suites, VM harnesses, mocked behavioral suites, integration tests, automated browser scenarios, load tests, synthetic saves, and shadow execution. Do not rename a test a benchmark or diagnostic to bypass this restriction.
2. **No application-data changes by this work.** No adding, editing, deleting, importing, migrating, repairing, backfilling, renumbering, deduplicating, or restoring records. No temporary records, including records intended to be rolled back. This covers production, staging, and copied databases.
3. **No schema changes.** Do not create or change tables, sheets, columns, headers, formulas, indexes, named ranges, protections, or database constraints as setup or maintenance work.
4. **No production activation.** No `clasp push`, deployments, version switches, live feature-flag changes, script-property changes, trigger installation/removal, service-account changes, cache flushing, or user/session resets.
5. **No interference with active users.** Do not acquire live application locks, stop workflows, open editors for verification, submit forms, retry user requests, or run database scans for measurement.
6. **Preserve the working tree.** Existing modified and untracked files belong to the user's current work. Do not reset, overwrite, stash, delete, or commit them incidentally.

The current deliverable is this Markdown file. If implementation is subsequently requested, permitted activity remains local source preparation under these constraints until the owner explicitly changes the scope. A later production release is a separate decision; creating this plan does not authorize it.

The application's normal users continue their existing operations. The restriction concerns actions performed by the implementation, analysis, or verification work. Future optimized save code would persist normal user submissions only after a separately authorized release.

## 2. Evidence and limits

The preceding analysis inspected the current local working tree, which includes uncommitted work. Local source is not proof of what the active deployment contains. Do not assume the two match.

| Observed source | Design implication |
|---|---|
| `Core_FastSave.js`, `Core_FastRead.js`, and `Core_ViewEngine.js` exist; their master switches are false. | Reuse suitable primitives. Do not blindly enable engines or recreate them. |
| ValleyFoods manufacturing's batch-write/read switches are false. | Treat current and candidate paths as separate until their contracts are reviewed. |
| `patchRowByCriteria_` reads the complete table for each invocation. | Locate all affected rows once and batch their patches. |
| Manufacturing calls the numeric-ID allocator for individual new children. | Reserve the required numeric-ID range once per affected table while holding the existing save lock. |
| Manufacturing saves use a script-wide lock and multiple durable checkpoints. | Reduce work under the lock without weakening stock checks or recovery. |
| Record-cache reuse is disabled after mutations, including receipt writes. | Use an explicit document context rather than depending on the general mutable cache. |
| Manufacturing replies mainly identify the saved order, and the editor reloads afterward. | Return a compact reconciliation response and retain the existing form. |
| `UIC.Live.save` and `API._requestGuard` already implement useful client behavior. | Unify and extend them instead of adding a second retry system. |
| Company Sheets, system Firestore, and TopChemical MySQL coexist. | Preserve storage routing; adapters must declare their different capabilities. |
| A deployment-boundary verifier expects nine root JS files, while three core-engine files also exist. | Resolve the source/deployment design on paper before changing packaging. |

Earlier analysis also identified a manufacturing test-loader omission. No tests are to be rerun or repaired under this plan. Historical test results are neither a new validation requirement nor proof that a future change is ready for production.

No production latency, production record counts, concurrent-user envelope, or active deployment fingerprint has been verified for this plan. Do not invent those values or collect them by invoking the application.

## 3. Performance objectives

These are design objectives, not measured results or release claims.

| User experience | Proposed objective |
|---|---|
| Typing, selecting, adding a line | Visible response within 100 ms on the agreed supported devices |
| Opening a new form with required references already available | Interactive within 200 ms |
| Pressing Save | Pending state visible within 100 ms; retain the submission |
| Single-record confirmed save | Initial p95 objective: 2–3 seconds |
| Large manufacturing-order confirmed save | p95 objective: at most 10 seconds within an agreed size and concurrency envelope |
| Failed or lost response | Preserve intent and show rejection or uncertain outcome accurately |

Measure confirmed-save time, when future observation is authorized, from the user's click to reconciliation of an authoritative committed reply. Do not stop the timer when a spinner disappears, a pending row is painted, or a request is queued.

Record p99, failures, and uncertain outcomes separately; do not exclude slow successes to make the target pass. An absolute ten-second ceiling across service outages and network failures cannot be promised.

Inputs to settle before any performance claim: child rows per section, underlying table sizes, concurrent saves, target devices/network, warm versus cold state, formula dependencies, and external writers such as spreadsheet editors or imports. These do not block preparation of local code.

## 4. Compatibility rules

The candidate must preserve:

- Existing record IDs, numeric IDs, foreign keys, creation stamps, document numbers, and attachment references.
- Existing field types, precision, date/time-zone behavior, validation, status transitions, and permissions.
- Server ownership of stock availability, authoritative costs, approvals, and derived fields.
- Existing sheet layout, formula-owned cells, unknown trailing columns, and explicit deletion semantics.
- Current API action names and response fields consumed by existing pages.
- Recovery of submissions created by older clients and older request envelopes.
- The existing source of truth for each table; no new dual-write arrangement.

A schema mismatch must be reported without attempting to repair it. New metadata should be local code metadata or use an existing compatible envelope; it must not require adding persistent columns.

UUIDv7 adoption is outside this initial implementation. Retain existing identifiers and manufacturing's deterministic retry identities. Optimizing numeric allocation is independent of changing `unique_id` format.

## 5. Reusable module architecture

Use one application with clear module boundaries. Begin inside the existing deployment structure; introduce a bundler only as a later, separately reviewed packaging task.

| Component | Owns | Must not own |
|---|---|---|
| Table specification | Keys, relationships, field types, writable fields, formula-owned fields, existing storage route | Live schema creation or business authorization |
| Repository | Key/parent lookups, bounded projections, bulk-operation preparation | UI behavior or business decisions |
| Domain service | Manufacturing, sales, purchasing, or reference-data rules | Direct cell-by-cell persistence |
| Command planner | Normalized changes, ownership validation, insert/patch/delete plan, response material | Service writes while planning |
| Commit executor | Existing locks, request receipts, batch persistence, recovery boundary | Table-specific business policy |
| Response projector | Permission-filtered saved values and reconciliation metadata | Shared caching of user-sensitive responses |
| Form controller | State, dirty tracking, local validation, pending submissions, response reconciliation | Authoritative stock/cost decisions |

Use the current TopLight `ACTION_DEFINITIONS` approach as a model for centralized action metadata. Each action declaration should identify its handler, access requirement, storage capability, request-recovery behavior, and response contract.

Provide a reusable CRUD implementation for simple tables. Keep manufacturing rules explicit through domain hooks; do not hide allocations, approvals, or accounting rules inside a universal table helper.

Potential development modules are `table-spec`, `repository`, `form-state`, `command-planner`, `commit-executor`, and company/domain modules. These names describe responsibilities, not a requirement to add deployed root files. Apps Script's shared global scope and deployment loading order must be accounted for.

## 6. Form-state and command design

### 6.1 One state model

Represent a form as:

- The last server-confirmed snapshot and its existing edit token.
- Current editable values and child rows keyed by stable identity.
- Dirty fields and rows, plus explicit deleted-UID lists.
- An immutable pending submission with its request ID and local edit generation.
- An explicit UI state: editing, pending, saved, rejected, or checking outcome.

Separate local temporary row keys from persistent row identities. Existing manufacturing code treats supplied child UIDs as existing-record claims; do not begin sending client-generated persistent child IDs without changing and reviewing that contract. New rows can retain local keys and receive a server mapping in the response.

Capture a submission once. Its request ID and payload must remain unchanged through uncertainty and retries. A distinct later edit is a separate command after the first command's outcome is known.

### 6.2 Responsive entry

- Render the active tab first and inactive sections when opened.
- Extend existing row-level updates; avoid rebuilding the entire document for a quantity edit.
- Use stable keys so removal or sorting does not reassign identities to different rows.
- Compute validation messages and preview totals locally, retaining server validation.
- Reuse reference options with existing authorization and invalidation rules.
- Load batch options on demand and share in-flight requests for the same relevant scope.
- Consider virtualization only where actual row volume warrants its complexity; preserve focus, keyboard navigation, and unsaved values.

Do not expand browser persistence of sensitive data incidentally. Use the existing storage policy initially; storage failure must leave the form visible and must not claim that a submission is durable.

### 6.3 Save behavior

Simple forms may use the existing pending-row interaction. Manufacturing remains editable as a retained document, with an immutable submitted snapshot; dependent stock/approval actions cannot proceed on an unconfirmed submission.

If edits are permitted while saving, track them separately. Reconcile only the submitted generation, preserve newer edits, and require a new authoritative token before the next command. Otherwise, briefly disable the affected editor controls while keeping the document visible. Use this simpler option initially if concurrent-edit reconciliation cannot be established by source review.

A transport failure means the outcome is unknown. Reuse the existing request-status protocol; never mint a replacement request automatically. A confirmed rejection restores editability and field errors without discarding entered values.

### 6.4 Protocol compatibility

Keep current action names. Introduce internal command normalization behind existing handlers before changing wire payloads. An eventual versioned command can express header changes, child additions/patches, explicit deletions, scope, base token, and request identity.

Omitted section means untouched. An empty section does not authorize deleting its existing rows. Existing ownership checks and explicit deletion lists remain mandatory.

## 7. Save-path optimization

### 7.1 One document context

Load each required table/key projection once into a request-scoped document context. Reuse it for ownership, conflict detection, calculations, write planning, and response construction.

This context is a snapshot with explicit timing and purpose, not a cross-request stock cache. Pure normalization may precede lock acquisition. Current stock, ownership, row locations, and revision must be read or revalidated inside the existing protected boundary before commitment.

Keep the current state-hash/edit-token method initially, computing it from the already loaded authoritative state. Do not add a revision column. Do not use cache timestamps as concurrency tokens.

Document all external writers. The script lock does not protect changes made directly in Sheets or by unrelated scripts. Do not describe a lock as providing protection beyond participating writers.

### 7.2 Numeric IDs

Count genuine additions after normalization and recovery reconciliation. Reserve the required numeric-ID range once per table using the existing batch-allocation semantics, inside the same outer lock as the corresponding writes.

For a table receiving 100 new children, the design objective is one existing-ID-column scan rather than 100. This is an operation-count objective, not a production timing claim.

Do not introduce persistent counters, renumber records, or change document numbering. Preserve recovery identities and avoid assigning fresh IDs to rows already written by an uncertain earlier attempt.

### 7.3 Change detection and bulk persistence

Compare only the normalized writable business fields against the authoritative snapshot. Skip unchanged child rows. Treat audit stamps and formula installation according to existing policy rather than accidentally changing them through a generic comparison.

For each affected table, build one reusable row-location map, bounded formula-protection reads, grouped patches, an append block, and explicit deletion operations. Preserve unknown formulas; do not disable formula probes merely to meet a call-count target.

`fastSaveSections_` currently checks operation budgets after writing. Refactor the candidate so shape, keys, formulas, row coordinates, request size, and operation budget are checked before the first business write. Patch and delete operations should reuse the same location map where their ordering permits it.

A narrow full-column scan remains a table scan. Do not claim indexed or constant-time lookup without an actual index. No persisted index or schema addition is included here.

### 7.4 Document-level commit

Prepare a Sheets-specific candidate that combines compatible changes across the manufacturing tables in one `spreadsheets.batchUpdate` request for the existing company workbook.

The plan must explicitly cover typed values and dates, formulas, existing sheet IDs, grid capacity, append locations, and row-shifting effects of deletion. Preserve formula behavior when compiling operation order; do not assume that combining calls preserves their semantics automatically.

Google's atomicity guarantee covers updates within one batch request to one spreadsheet. It does not cover prior reads, different workbooks, MySQL, Firestore, or independent editors.

If a document cannot fit a safe bounded batch, do not silently split it and describe it as atomic. Keep it on the existing recovery path and record why the target is unmet. Never execute the legacy save after a potentially applied candidate write; resolve the existing request first.

### 7.5 Checkpoint and formula compatibility

Retain the existing checkpoint protocol in the first optimization stage. Read reuse, numeric allocation, and per-table batching can be prepared before changing recovery.

A later local candidate may reduce checkpoints only after documenting how the existing receipt records distinguish not-started, committed, and uncertain outcomes. Consider placing the completion marker with business changes only if the existing receipt shape and old-client behavior support it. Keep old checkpoint envelopes recoverable.

Preserve the existing formula-based stock authority. Do not defer balance validity or assume a batch response proves every derived formula is current. Retain required flush behavior until the complete read/write ordering has been reviewed. If formula recalculation prevents the target, record the limitation instead of bypassing stock validation.

### 7.6 Reconciliation reply

Return existing response fields plus a versioned, bounded reconciliation section containing:

- The authoritative parent identity and mappings for newly created children.
- Saved editable values that differ from the submitted values.
- The next edit token, derived from committed authoritative state.
- Explicitly removed identities and any necessary existing reference invalidation markers.
- Permission-filtered computed values whose freshness is established.

Build the reply from the commit manifest and document context wherever possible. Read back only values that genuinely require authoritative recalculation. Never manufacture a next token from incomplete or unconfirmed state.

Update the existing form and list row directly. Do not clear every batch cache and reload the entire document after a routine successful save. Older clients may continue using the original response and reload behavior.

## 8. Local implementation sequence, if subsequently authorized

Every stage produces local source or design changes only. No stage permits connected execution or application-data writes. Candidate switches remain false; do not change production configuration.

| Stage | Work | Exit evidence allowed under this plan |
|---|---|---|
| A — Contract inventory | Trace one simple form, both manufacturing editors, dispatch, receipts, reads, formulas, audit/logging, and storage routing. Distinguish observed code from assumptions about deployment. | Source references; call-flow and compatibility notes; unresolved dependencies |
| B — Shared contracts | Define table/action metadata, command normalization, document context, and response shape. Reuse existing engines and helpers. | Reviewed contracts; legacy compatibility mapping; no schema requirement |
| C — Simple-form candidate | Select a low-complexity existing reference-data form after tracing its dependencies. Connect shared state, retained submission, and response reconciliation. | Local diff; static control-flow review; syntax parsing only |
| D — Manufacturing read/ID candidate | Load current state once, reuse key maps and existing edit tokens, allocate numeric IDs per table, avoid unchanged-row writes. | Before/after call graph and symbolic operation counts; lock/stock review |
| E — Manufacturing commit candidate | Prepare complete write plan before mutation; batch compatible operations; retain recovery first and isolate any checkpoint redesign. | Written commit/failure-boundary review; formula and identity mapping |
| F — Manufacturing UI candidate | Apply shared state to list-modal and detail-page editors, lazy tabs, targeted updates, and response reconciliation. | Review of dirty-state, focus, old-client, permission, and uncertainty behavior |
| G — Consolidation | Remove candidate duplication locally, document adapter differences, and produce a release proposal. Resolve packaging design without changing existing test files. | Human-readable diff, rollback procedure, explicit unverified items |

Do not expand to all companies or rewrite the build system while the first form contracts remain unresolved. The pilot form should not be a cash, payroll, inventory-posting, or approval workflow merely because its UI is small.

## 9. Allowed review and prohibited verification

Allowed activities are local source reads, search, diff review, static call-path analysis, and syntax parsing that does not execute application code. If implementation is later requested, `node --check` may check server JavaScript syntax. HTML scriptlets require static extraction/normalization for parsing; no DOM boot, VM evaluation, or browser execution is allowed.

Do not run `npm run verify`, `tools/verify/*`, existing behavioral benchmarks, preview builds that evaluate application code, or test harnesses. Do not modify tests to make a deployment-boundary assertion pass.

Do not call an application endpoint merely because its name begins with `get_`, `list_`, or `request_status`. Authentication, session touch, logging, cache publication, or schema assurance can mutate state indirectly. Do not use live read calls for comparison or add production telemetry under this scope.

Existing, already available local logs or owner-provided summaries can inform the design. Do not fetch logs through application code or create logging tables, telemetry records, request receipts, audit events, or triggers for measurement.

The review ledger must distinguish:

- **Inspected:** supported by source references.
- **Syntax parsed:** code parsed without being executed.
- **Expected:** derived from the proposed control flow.
- **Not verified:** runtime behavior, performance, contention, formula recalculation, and release compatibility.

Static review cannot establish that a changed transaction pipeline is production-ready. Do not report functional parity, zero regressions, or achieved latency from these activities.

## 10. Future release boundary for an actively used application

This section describes a later release proposal only. None of its production actions is authorized now.

1. Identify the currently deployed version and its dependency set through an explicitly authorized method. Reconcile differences from the local working tree without overwriting current work.
2. Present the exact candidate diff, affected actions, compatibility limits, verification limitations, rollback artifact, and owner decisions. A written plan is not deployment consent.
3. Preserve old endpoints, payloads, response fields, and receipt formats. Active browser tabs may retain older HTML/JavaScript after the server changes; support them without a forced mid-entry refresh.
4. Keep pending submissions attached to the handler/recovery format that can interpret them. Do not send an uncertain request to a different implementation as a fallback.
5. Any later deployment, activation, passive observation, or production configuration change requires separate explicit scope. No synthetic production save is included in that scope by default.
6. A code rollback must not roll back business data or restore an old spreadsheet snapshot. It must leave previously committed records and pending receipts interpretable. Reconcile in-flight candidate requests before routing them to legacy handling.
7. If no runtime verification or authorized observation is permitted, finish as **locally prepared for review, production behavior unverified**. Do not convert that limitation into automatic release approval.

The existing application remains active throughout planning and local preparation. No maintenance window or user interruption is required for those activities.

## 11. Explicitly deferred work

- UUIDv7 rollout, ID conversion, or foreign-key migration.
- New database backends or changing the source of truth.
- New schema, persistent row indexes, revision columns, or sequence tables.
- New durable outbox infrastructure, audit migrations, or background-worker triggers.
- Deferring stock validation, weakening permissions, or trusting client costs.
- Moving formula-based stock authority into code.
- Broad replacement of all company action files or the deployment toolchain.
- Any unit, integration, load, browser, VM, or synthetic-data test work.

A durable outbox remains a possible future way to reduce secondary logging latency. It is deferred because introducing its storage and processing lifecycle would exceed the present no-data/no-schema/no-trigger scope. Audit and logging costs must remain visible in the performance assessment.

## 12. Completion criteria

For this planning request:

- This document exists and reflects the owner's constraints.
- No source code, application data, schema, configuration, or deployment is changed.
- No unit tests or other executable verification suites are run.

For a later authorized local implementation under the same constraints:

- Reusable contracts and candidate code are prepared in isolation from production.
- Existing IDs, storage routing, permissions, formulas, and old-client contracts are preserved by design.
- No live feature is enabled and no connected application call is made.
- Static review and syntax results are recorded honestly, with runtime acceptance marked **NOT RUN**.
- The owner receives a concrete diff and release proposal rather than an unsupported performance claim.

## 13. Reference points

Primary project sources: `Code.js`, `Core_FastSave.js`, `Core_FastRead.js`, `Core_ViewEngine.js`, `Client_Helpers.html`, `UI_Components.html`, `Company_ValleyFoods_Actions.js`, `Company_ValleyFoods_MfgOrders.html`, `Company_ValleyFoods_MfgOrderView.html`, and `Company_TopLight_Actions.js`.

Earlier plans provide history only. In particular, their requirements for VM verification, staging exercises, or activation do not override Section 1 of this document.

Platform references consulted in the preceding analysis:

- [Apps Script performance guidance](https://developers.google.com/apps-script/guides/support/best-practices)
- [Sheets batch-update atomicity and collaboration limitations](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
- [Apps Script lock scope](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Apps Script V8 runtime and module limitations](https://developers.google.com/apps-script/guides/v8-runtime)
