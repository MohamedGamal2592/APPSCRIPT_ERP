# Execution Prompt: System-wide Fast Reads and a Seamless Data Experience

Use the following prompt when implementing [Plan_System_Fast_Read_Seamless_Experience.md](Plan_System_Fast_Read_Seamless_Experience.md).

---

## Prompt

You are working in the production source repository for an ERP application. Implement the plan in `Plan_System_Fast_Read_Seamless_Experience.md` in small, reviewable stages, preserving the behavior and data of the live system.

### Production safety rules — mandatory

The application is in production. Follow these rules for the entire task:

1. **Do not add, update, delete, import, seed, reset, or otherwise mutate any row or document in any production table or tab.** This applies to Google Sheets, MySQL, Firestore, and any other connected data store. Do not make test records in the live application.
2. Do not change production table schemas, columns, formulas, table contents, sheet names, Firestore collections/documents, MySQL records, production script properties, or live permissions.
3. **Do not push or deploy anything.** Do not run `clasp push`, Apps Script deployments, production publishing, a remote code push, CI/CD release, or any command that synchronizes code to the live application. Do not commit or stage changes unless the user separately asks.
4. You may make targeted changes to source files in the local working tree for review. Do not modify application data. Keep feature flags and rollout switches disabled unless an isolated, non-production validation path proves the change safe and the user has authorized enabling it.
5. Before editing, inspect `git status` and the relevant diffs. The workspace may already contain unrelated user changes, additions, and deletions. Preserve them. Do not use `git reset`, `git checkout`, `git clean`, bulk restore commands, or overwrite whole files to remove or normalize those changes. Make the smallest targeted edits possible.
6. Before running any verifier, test, script, or app action, inspect its implementation and prove it cannot write to connected production data. Do not add or run tests unless the user has explicitly asked. Static inspection and read-only checks are preferred. If a needed validation can only be performed by writing to a table or deploying online, leave that gate closed and report the exact validation that remains.
7. Do not use production RPCs as a test harness for save, add, edit, delete, import, or migration behavior. Do not call endpoints that may have side effects.
8. Keep performance diagnostics restricted to server-verified super admins. Never trust a browser-provided admin flag and never expose row contents, credentials, SQL secrets, or connector settings in measurements.

If repository state, environment configuration, or a command makes it unclear whether a data source is production or whether an operation writes data, do not execute it. Continue with independent source analysis and local implementation that does not depend on that operation, then report the blocked validation precisely.

### Objective

Deliver the safest useful local implementation of the plan so ERP pages provide a fast first view, warm cached data when available, background page loading, truthful global search, and fewer repeated reads/writes. Work backend by backend; do not assume JSON serialization alone makes a Google Sheet read fast.

The immediate page priorities are:

1. `action=tc_stock_scan`: keep the product dropdown searchable within the dropdown, search the full accepted product catalog locally, show a validated cached catalog immediately, and refresh in the background using the compact MySQL JSON path.
2. `action=tc_products_live`: keep the detailed product table projection separate from the dropdown projection; show cached/first-page data quickly; page and search with stable product identity; preserve add, edit, soft-delete, permissions, and export semantics.
3. `action=tc_financial_ratios`: preserve progressive section rendering and the JSON aggregation lessons already recorded.
4. `VF_MOs`: remove repeated whole-table work from the list and multi-section save only after tracing its current contracts and identifying a validation path that cannot mutate production data.
5. The shared UI and storage adapters: introduce reusable cursor/background-loading behavior, then migrate additional tables only when their storage strategy and search scope are clear.

### Required repository review

Read these documents and source areas before editing:

- `Plan_System_Fast_Read_Seamless_Experience.md`
- `MySQL_Products_Table_Dropdown_Performance_Journey.md`
- `UI_Components.html`
- `Core_FastRead.js`
- `Core_FastSave.js`
- `Core_FormContracts.js`
- `Code.js`
- `Company_TopChemical_Actions.js`
- `Company_ValleyFoods_Actions.js`
- `Company_ValleyFoods_MfgOrders.html`

Also inspect relevant page actions, registries, local verification scripts, and table helpers as needed. Treat the current source as authoritative; confirm line numbers, flags, and behavior before relying on older notes.

### Work method

#### Step 0 — Protect the existing workspace

- Record the initial working-tree status and identify which changes predate this task.
- Do not revert unrelated user changes. If a target file already has edits, inspect its diff and make a narrow patch that preserves those edits.
- Confirm the current repository is not connected to an operation that will push source or mutate a live data store.
- Do not stage, commit, push, deploy, or publish.

#### Step 1 — Build the endpoint inventory

For interactive list and save endpoints, record:

- page/action and owner module;
- source backend and table/tab names;
- unique identity (`id`, `unique_id`, document ID, or composite key);
- default order and stable tie-breaker;
- filters, search fields, export/print requirements, and permission checks;
- rows and projected fields read/returned;
- whether the server scans all rows before returning a page;
- cache source, invalidation path, and freshness contract;
- formula-owned fields and coupled save sections;
- super-admin-only timing availability.

Do not invent exact totals, index capabilities, or database guarantees. Mark unknowns and continue with read-only source inspection.

#### Step 2 — Define and implement the read contract

Implement a backward-compatible response contract with a schema version, explicit projected columns, JSON-safe rows, bounded page size, `has_more`, opaque cursor, data version/snapshot where available, optional exact total, and a request correlation ID. Keep diagnostic timing fields super-admin-only.

For arrays of arrays, return `columns` once and validate the mapping strictly. Preserve numeric IDs safely as strings when precision requires it. Normalize dates and nullable values deliberately. Include a unique sort tie-breaker and never depend on JSON aggregate element order.

Keep old callers working during the migration. Add adapters or opt-in module paths instead of changing every page contract at once.

#### Step 3 — Implement shared cached-first/background loading

Add or extend a shared list loader that:

- paints only validated, correctly scoped cached data immediately;
- starts a background server refresh without blocking the page;
- fetches bounded pages sequentially and deduplicates by the declared row key;
- uses request generations/cancellation so stale searches cannot overwrite newer results;
- pauses background work when appropriate and enforces per-table row/byte/time limits;
- preserves sorting, filters, scroll, selection, and row actions as pages arrive;
- reports loaded count and whether the set is partial or complete;
- distinguishes client search over loaded rows from a global server search;
- keeps export and printing scope explicit.

Do not remove a show-all control until the replacement path has correct global search, completeness state, and export behavior. Never show “no results” for a global query while unloaded rows may still match.

Use one in-flight request per endpoint/query unless source measurements demonstrate that safe bounded concurrency improves the result without overloading Apps Script or the action coordinator.

#### Step 4 — Apply source-specific strategies

**MySQL/JDBC**

- Keep SQL filtering, projection, ordering, and paging in MySQL.
- Use bounded `JSON_ARRAYAGG(JSON_OBJECT(...))` results where they reduce JDBC row traversal.
- Measure connection, SQL, result traversal, Apps Script processing, response bytes, browser RPC, JSON parsing, and render separately.
- Verify SQL plans and stable cursor order. Bound response size and validate aggregate row count.
- Keep picker and table projections separate. The picker returns only fields required for selection and calculation.

**Google Sheets**

- Read rectangular ranges in batches and project only declared columns.
- Use append-window reads for recent unfiltered lists and narrow scans only when their full-row scan cost is understood.
- Do not claim `NARROW_SCAN_PAGE` is matched-row-only; it still scans the table.
- For background scans, bind row windows to a high-water mark, deduplicate by business key, and handle row movement/restarts explicitly.
- Do not add index tabs, summary tabs, columns, formulas, or schemas without a separate user-approved design, because those change production data/schema.

**Firestore**

- Use native filters and cursor paging; preserve document identity and update-time checks.
- Avoid `queryAll` on interactive page loads.

**System tables backed by Sheets**

- Do not claim the generic adapter is paged until its Sheets implementation returns bounded pages and a real continuation cursor.
- Keep per-table ordering, metadata IDs, and write addressing correct.

#### Step 5 — Migrate priority pages

**Stock Scan dropdown:** preserve the accepted compact catalog behavior, full local search over the loaded bounded catalog, at-most-100 visible options, cached-first paint, and stale-while-refresh. Invalidate by the correct product/company/schema version after a successful product mutation. Never use a user cache as save authority.

**Products Live:** keep a distinct detailed table projection. Prefer stable keyset paging for the MySQL list if the SQL plan supports it. Patch the locally visible row after successful mutations when the server returns an authoritative result. Preserve soft-delete behavior and define current-page versus all-matching export.

**Financial Ratios:** keep independent report sections rendering as each completes. Do not reintroduce an all-sections barrier. Preserve the existing user-facing period results and the super-admin-only measurement boundary.

**VF_MOs list:** trace every helper and option source. Make page work bounded where the backend can support it. Separate or cache reference options only with a sound freshness key. If exact filters/options still require a full scan, label and measure that cost instead of disguising it as page-only work.

#### Step 6 — Improve save and field-update paths carefully

Inspect the legacy VF_MOs save and planned candidate. Preserve request IDs, edit tokens, permission and ownership validation, stock checks, formula protection, audit behavior, recovery, and uncertain-response handling.

The intended optimization is one request-scoped snapshot per involved table, reusable key maps, a complete diff before mutation, unchanged-row skipping, and bounded batch patches/appends/deletes. Return a compact reconciliation response so the browser can update its visible row without refetching the full list.

Do not enable `MFG_PLANNED_SAVE_`, `FAST_SAVE_CORE_`, `FORM_CONTRACTS_CORE_`, `MFG_BATCH_WRITES_`, or read-engine flags globally as part of unverified local changes. Keep them disabled unless the relevant path has safe isolated parity evidence and enabling is explicitly authorized. Do not test saves against production tables.

For individual Sheet field updates, avoid repeated `patchRowByCriteria_` full-sheet scans within a batch. Locate all keys once, preserve formula fields, and batch only the allowed writable cells. Use direct keyed updates for MySQL and Firestore when implemented safely.

#### Step 7 — Metrics, failures, and security

Measure cached paint, first useful server result, page RPCs, complete hydration, search, rows/cells scanned, rows returned, response bytes, queue time, database phases, parse, render, cache age, retries, and failures. For saves, also measure lock wait/hold, per-table reads, formula probes, planned/written operations, and reconciliation.

Keep timeout distinct from database failure. Keep exact total distinct from loaded count. Do not report time outside a named database wrapper as pure network latency. Verify super-admin status on the server before returning internal metrics.

### Validation rules

- Do not add or run tests unless the user explicitly asked. Do not run unknown verification scripts without inspecting them for data writes first.
- Use static inspection and safe, read-only checks to validate response shapes, role gating, and source call structure.
- A test that needs records, mutates a sheet/table, changes a schema, or uses production RPCs is prohibited under this task. Leave that validation as a clearly documented rollout gate.
- Where a test harness is demonstrably isolated and has no production connector, explain that isolation before using it and do not seed production data.
- Compare code-level behavior and source contracts against the prior journey measurements. Do not claim a speed gain without new end-to-end measurements from a safely authorized environment.
- Do not enable global or module flags to create a performance result in production.

### Rollout and completion requirements

- Implement in small phases with a clear diff for each logical area.
- Keep candidate code paths behind existing opt-in flags during local implementation.
- Do not deploy online, push code, commit, stage, or change connected production data.
- Do not remove old paths until their compatibility and fallback behavior are understood. If rollback is needed, use a narrow source change; never restore the whole repository or discard unrelated workspace work.
- If implementation needs a schema/index/data migration, stop before that operation and provide a concrete proposal. Do not perform the migration.
- Finish with a concise report: files changed, page behavior changed, static/read-only verification performed, validations deliberately not run due to production data safety, remaining rollout gates, and confirmation that nothing was pushed, deployed, or written to application tables.

Start by inspecting the current workspace and plan. Then proceed with the portions that can be safely implemented locally without touching application data or remote deployments. Do not stop for approval on routine local source edits; stop only before a data/schema mutation, online deployment, remote push, or validation whose side effects cannot be ruled out.

---
