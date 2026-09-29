# Plan: System-wide Fast Reads and a Seamless Data Experience

**Status:** Proposed implementation plan. The repository and production data have not been changed by this planning work.

**Purpose:** define a staged, reusable approach for making ERP lists and forms feel fast while preserving complete search, correct results, existing permissions, formula behavior, and save safety.

**Primary outcome:** pages show useful data as early as possible, continue loading bounded chunks in the background, and keep search honest about whether it covers the full table. Multi-table forms send one logical save request and the server plans and batches the required mutations instead of repeating wide table scans and row-level calls.

**Deployment constraint:** implementation work may be prepared and reviewed in the repository. Do not deploy Apps Script online as part of this plan. Any test or production deployment must follow the user's separate direction; never infer permission to deploy from this document.

---

## 1. Evidence and current state

The repository has several data sources and they have different performance limits:

1. **TopChemical MySQL pages.** `tc_products_live`, `tc_stock_scan`, financial ratios, and production capability use the MySQL/JDBC connector. The product and financial work showed that SQL JSON aggregation can avoid many JDBC calls and that browser-side cached results can paint before a MySQL refresh completes. See [MySQL_Products_Table_Dropdown_Performance_Journey.md](MySQL_Products_Table_Dropdown_Performance_Journey.md).
2. **Company Google Sheets.** Many ERP company pages read tabs through Apps Script helpers. JavaScript JSON serialization can reduce payload size and provide a consistent contract, but it does not make a full Sheet scan faster. A source range still has to be read and filtered.
3. **System tables.** The storage adapter can use Google Sheets or Firestore. Firestore has cursor paging. The Sheets adapter currently loads all records and filters them in Apps Script, so it does not yet honor the same bounded-query behavior.

Several reusable engines already exist, but their opt-in flags default off:

- `Core_FastRead.js` offers `APPEND_WINDOW`, `NARROW_SCAN_PAGE`, `FULL_SCAN`, and experimental `KEYSET` strategies. `NARROW_SCAN_PAGE` reads fewer cells but still scans all rows. `KEYSET` has strict preconditions and must not be enabled without evidence that its key is monotonic and stable.
- `Core_FastSave.js` provides keyed formula-safe patches, block appends, and batched deletes. `Core_FormContracts.js` provides a request-scoped document context, reusable key maps, write planning, and budget checks. Their master flags default off.
- `UI_Components.html` has chunked DOM rendering, a client-side-search `dataTable`, `showAllBar`, and `PagedTable`. `PagedTable` fetches offset/limit pages, but it cannot make an unbounded server read bounded by itself.

User-reported measurements establish the current reference points. They are useful observations, not a controlled benchmark:

| Page / path | User-provided reference measurement | Lesson |
|---|---:|---|
| `tc_products_live` table | 769 rows, 18 columns, 202,306 bytes; RPC 10,367 ms; first visible 10,378 ms; warm table paint 37 ms | Table serialization/rendering was small compared with the cold request. A warm copy improves repeat navigation substantially. |
| `tc_stock_scan` picker | 769 products, 63,167 bytes; RPC 7,639 ms; local search and render about 1 ms each; warm display 3–9 ms | Keep a narrow full catalog in the browser and search it locally while refreshing separately. |
| `tc_financial_ratios` | First visible 6,709 ms; report complete 14,773 ms after progressive section rendering | Independent sections should render as they finish instead of waiting for the slowest query. |
| Earlier JDBC product read | 42,278 ms reading rows while SQL was 227 ms | SQL duration alone did not explain the user wait; JDBC traversal and the surrounding RPC path mattered. |

### Current bottlenecks found in the code

- The shared table search filters rows already held by the browser. When a route returns a capped result, its local search does not cover unloaded rows.
- “Show all” is a separate full-list request path. It is not background paging.
- `UIC.PagedTable` requests pages from the browser, but some backends first scan, map, sort, and filter the entire table before returning the requested page.
- `vfMfgOrdersCore_` reads and transforms all manufacturing headers, derives filter options, and only then returns a page. Its fast-read candidate narrows columns, not rows, and its module flag is off by default.
- Generic Sheet helpers such as `getAllRecords_` materialize a complete tab. `patchRowByCriteria_` also reads the full tab to locate a single row, though it protects formula cells on the matched row.
- The main VF_MOs form already sends one logical browser RPC with nested output and consumption data, but the server legacy path performs several scans. On success the browser reloads the list, creating another read request.
- The planned VF_MOs save candidate and shared fast-read/fast-save engines are not proven production outcomes. They require staged parity and timing evidence before opt-in.

---

## 2. Product goals and invariants

### Goals

1. Show a useful cached or first-page result promptly, then refresh and hydrate more rows without blocking the page.
2. Remove the dependency on a user clicking “show all” to make a complete table available.
3. Make global-search behavior explicit. A search must not silently miss records that have not loaded.
4. Use one well-defined JSON contract across MySQL, Google Sheets, and Firestore while allowing each source to page and filter using its own strengths.
5. Minimize repeated reads, per-cell JDBC traversal, per-row Sheet lookups, duplicate RPCs, and unnecessary full-page redraws.
6. Preserve IDs, formulas, edit permissions, soft-delete rules, audit behavior, conflict detection, stock checks, idempotent retries, and recovery semantics.
7. Measure the whole user-visible path and keep internal diagnostic timings visible only to super admins.

### Invariants

- A page response must identify its source freshness and whether its rows are complete or partial.
- An identifier is data, not a physical row number. `id` and `unique_id` remain intact through JSON, caches, forms, joins, and writes.
- Every list declares its projected fields, ordering, cursor semantics, filters, and maximum page size.
- Cache data may be stale while refreshing, but the page must label/handle it as stale and replace it only with a validated response.
- Mutating operations remain server-authoritative. Browser caching never authorizes a save or a soft delete.
- Measurements must not expose row values, credentials, connector configuration, or user-sensitive data to ordinary users.
- Do not change schema, production data, live Apps Script deployments, or feature flags as part of writing or reviewing this plan.

---

## 3. Shared list response and query contract

Adopt a versioned response shape for new or migrated list endpoints. The contract should be implemented at the source adapter boundary, then mapped to the existing page UI:

```json
{
  "schema_version": 1,
  "status": "ok",
  "columns": ["id", "unique_id", "name_ar"],
  "rows": [["785", "opaque-uuid", "اسم الصنف"]],
  "page": {
    "limit": 100,
    "has_more": true,
    "next_cursor": "opaque-source-cursor",
    "snapshot": "source-version-or-high-water-mark"
  },
  "total": null,
  "total_is_exact": false,
  "data_version": "version-token",
  "request_id": "request-correlation-id"
}
```

The exact schema may use row objects where readability is more valuable than response size. The array form is useful for wide tables because the field names are transmitted once. Each endpoint must choose a stable projection; it must not infer writable columns from a table response.

### Contract requirements

- `schema_version` permits safe evolution without interpreting an old cache using a new row layout.
- `columns` states the array order. Unknown or duplicate columns are rejected by the client mapper.
- `rows` contains JSON-safe primitives. Return large numeric IDs as strings if JavaScript precision might be lost. Normalize date values to a documented format and avoid ambiguous locale-formatted numbers.
- `page.has_more` and `page.next_cursor` are authoritative. `total` is optional because exact counts can require a full scan; do not fabricate one from the current page.
- `page.snapshot` or `data_version` binds cache and continuation state to a known source version/high-water mark where the backend supports it.
- The query request carries declared filters, search text, sort, page size, and either an opaque cursor or a bounded Sheet scan position. The server validates all fields and caps page size.
- Performance timings are attached only for super-admin diagnostics. Regular responses should omit them or return only non-sensitive UX state.

### Identifier, sort, and cursor policy

- **Numeric auto-increment ID:** can be used for keyset paging only after proving it is nonblank, unique where required, and monotonic in the requested order. A cursor can use `(last_id, snapshot_max_id)`.
- **UUID / `unique_id`:** use as the stable record key. It is not inherently a “newest” order. For time-ordered pages, use `(created_at, unique_id)` with both values in the cursor.
- **Google Sheets physical row window:** can be an efficient bounded scan for append-oriented tabs. Bind the scan to a starting and ending row/high-water mark, deduplicate by business identity, and expect a restart/reconciliation if rows are inserted, removed, or sorted during the scan. Prefer a business-key cursor where the table supports one.
- **Offset paging:** retain only where deterministic ordering and the table's mutation behavior make it acceptable. New inserts can shift offsets and cause duplicates or omissions during background hydration.
- **MySQL:** use indexed predicates, deterministic `ORDER BY` including a unique tie-breaker, and keyset cursors for deep pages. Use SQL count only where exact total is needed and affordable.

---

## 4. Page behavior: quick first view and background hydration

Implement this behavior in the shared list component in small, compatible stages. Keep existing page-specific renderers and row actions while changing how data arrives.

### Initial and repeat load

1. Determine the tenant/company, user scope, table, schema version, and query signature. Never share a cache across companies or permission scopes.
2. Read a bounded browser cache entry if it passes schema, age, identity, and shape checks. Paint it immediately and label it as cached while refresh is pending. Use an appropriate per-table TTL, not a universal expiry.
3. Start one background refresh request for the first page. Keep the previous valid list visible while the request runs. Use an inline refresh state instead of a blocking overlay for reads.
4. Validate response version, projection, IDs, cursor, and query signature. Replace or reconcile the cached first page, then persist the updated cache.
5. Start sequential prefetch according to the table policy. Permit one in-flight page per table/query to avoid flooding Apps Script or the action coordinator. Pause when the document is hidden, resume when visible, and stop at a configured row/byte/time budget.

### Background loading and display

- Use bounded pages (initial default 50 or 100, to be tuned by table and payload bytes).
- Append and deduplicate by `unique_id` or the declared primary key, not by array position.
- Render newly available rows in small DOM batches. Avoid rebuilding the entire table on every page; append only new rows or update the row store and render the current viewport.
- Keep scroll, current sort, filters, selection, and row action state through hydration.
- Track loaded count, known total if exact, and whether hydration is still running. Do not show “all results” until the source confirms completion.
- Persist a bounded cache. Do not grow browser storage without a row/byte cap; evict least-recently-used table entries and invalidate on sign-out or company change.

### Search behavior

- Debounce search input (initial target 250 ms) and cancel/supersede stale responses with a request generation ID.
- Search loaded rows locally for instant feedback.
- When the query is intended to cover the full table and hydration is incomplete, call the server search endpoint. Return matching rows, a cursor, and exactness state. Never state “no results” while unloaded rows may contain a match.
- For bounded catalogs, load the complete compact catalog and search locally, as in `tc_stock_scan`.
- Preserve current locale-aware matching rules where they are part of page behavior. Define normalization for Arabic and codes; do not normalize away meaningful characters without verification.
- Clearing search restores the current list/cursor state without an unnecessary full reload.

### Sort, pagination, print, and export

- Keep stable server ordering and use the unique key as a tie-breaker. Client sorting applies only to the loaded set unless the server confirms the complete set is loaded.
- Printing/exporting the “current page” may use loaded rows. An “all matching results” export must intentionally drain the matching cursor or use a server export endpoint, and show progress.
- A table that has not finished hydration must say if print/export includes only loaded rows.
- Remove the show-all button only after that table has a truthful background load or server-search path and the export behavior is defined.

---

## 5. Source-specific read design

### 5.1 MySQL/JDBC

Use MySQL to do selection, projection, filtering, sorting, paging, and aggregation before data reaches Apps Script.

- Use `JSON_ARRAYAGG(JSON_OBJECT(...))` for bounded result pages where its payload is smaller and faster than walking every column in JDBC.
- For scalar lists such as the product picker, return only the fields the control needs. Keep the catalog row cap and “render at most 100 options” behavior separate: the former bounds source data; the latter bounds DOM options.
- For full table pages, return only the columns the view and its actions require. A detail/edit panel can fetch its own bounded detail record if the list projection is not enough.
- Include an explicit unique ordering field in every JSON object. Do not rely on aggregate element order; sort the parsed result when the SQL dialect does not promise order.
- Cast IDs and precision-sensitive values deliberately. Validate aggregate row count and payload size, with a typed error or another bounded query path if a cap is exceeded.
- Count plus page data should be combined only when the query remains plan-efficient. Measure its query plan and end-to-end RPC before keeping the change.
- Prefer SQL cursor predicates to large `OFFSET` values. Use indexes that match common filters and order; record the EXPLAIN plan for slow queries.
- Cache bounded reference catalog results in the browser and/or a short server cache using tenant, eligibility filters, schema version, and data version in the key. Invalidate after successful product edits or soft deletes.

### 5.2 Google Sheets company tables

For Sheets, the goal is fewer service calls and fewer cells per request, not SQL-like pushdown.

- Declare the minimal set of columns used to filter/sort and the projected columns returned to the page.
- Use `APPEND_WINDOW` for the newest records when the page has no filters requiring old rows.
- Use `NARROW_SCAN_PAGE` only where global filtering/counting is genuinely required and the measured full-table scan is acceptable. Report its full row-scan cost honestly.
- For large append-oriented tables, implement a true bounded row/cursor scan so each background request reads one fixed range and returns immediately. Bind it to a snapshot/high-water mark and deduplicate returned records by primary key.
- For highly filtered or mutable tables, do not repeatedly scan the full tab per page. Options to evaluate are a maintained lookup/index tab, a compact materialized projection, more selective date windows, or moving that workload to MySQL/Firestore. Each adds consistency and repair responsibilities and must be justified by a measured endpoint.
- Read a range into a matrix once; avoid one `getRange`/JDBC-style call per cell. Project objects or arrays in memory. JSON formatting is the transport step after the source read.
- Cache small reference tables with the existing tenant-aware reference cache contract. Use a version stamp and mutation invalidation; never treat a cache as authoritative for writes.

### 5.3 Firestore-backed system tables

- Use native filters, order, `limit`, and `startAt` cursors in `firestoreQueryDocuments_`.
- Return a source document ID/cursor and update-time/version for cache validation.
- Add or verify indexes for each combined filter and order; expose a clear typed error when Firestore requires an index.
- Use document patch update masks for partial changes and a conditional update time for optimistic concurrency.
- Avoid `queryAll` on interactive list endpoints. Reserve full collection reads for bounded maintenance or explicit export work.

### 5.4 System tables currently backed by Sheets

The current Sheets `query` adapter loads all records, filters them, and returns no cursor. Implement the shared query contract for this backend before expecting generic repository callers to page correctly.

- Define a safe page cursor and consistent ordering per system table.
- For small system reference tables, allow complete bounded reads with an explicit cap.
- For append-oriented system tables, use a high-water-mark row scan with identity deduplication.
- For mutable/filter-heavy system tables, provide a key index or keep them on the Firestore query path where native filtering and paging are required.
- Preserve `_meta.documentId` behavior for writes while avoiding exposure of storage metadata as ordinary business columns.

---

## 6. Per-page application plan

### 6.1 `action=tc_stock_scan` product dropdown

Keep its successful bounded catalog pattern:

1. Request only eligible product IDs and dropdown fields (`id`, Arabic display name, code, and any field required by the stock entry calculation).
2. Return one aggregate JSON catalog result with values normalized as strings where appropriate.
3. Paint the user’s valid cached catalog immediately. Refresh from MySQL in the background and preserve the usable list on refresh timeout.
4. Search the entire loaded catalog inside the dropdown. Limit rendered options (currently 100) without limiting what local search can match.
5. Cache by company, permission/eligibility scope, field schema version, and products data version. A product add/edit/soft-delete invalidates the catalog after a successful save.
6. Measure cold RPC, MySQL connection, SQL, JDBC traversal, aggregate parse, cache age/hit, local search, render, payload bytes, and time to visible options. Display these diagnostics only to super admins.

### 6.2 `action=tc_products_live` product table

1. Keep the detailed table projection distinct from the dropdown projection. Include only list fields, row identity, and values needed for inline actions.
2. Paint the last validated per-user/company table result immediately, then request the latest bounded server page.
3. Search/sort loaded records locally while the table hydrates. If the user requests a global search before hydration ends, run a debounced MySQL search query.
4. Use keyset paging by stable `id` plus a snapshot bound; include `unique_id` where it is the actual update/delete identity. Do not use an unbounded full-table query simply to enable local search if the product count grows past the agreed catalog budget.
5. Keep row edits, add, and soft-delete permission checks in their existing server handlers. Update/replace the affected cached row only after a successful server reply; bump the products data version.
6. Define export/print behavior as current page or all matching rows. Do not make “loaded so far” look like the complete catalogue.
7. Compare first cache paint, cold first-page time, full-hydration time, search latency, bytes, SQL plan, and DB/JDBC/RPC phases with the existing journey measurements.

### 6.3 `action=tc_financial_ratios`

Retain progressive section rendering: display each report section as soon as its own response arrives. Keep comparison-period sections, production, and used-material snapshots independent so one slow query cannot hide completed sections.

- Keep JSON aggregation for the MySQL snapshots where it reduced JDBC traversal.
- Add bounded section caching only where report period, company, user visibility, and source version are represented in the key.
- Add a lightweight first-visible state for each section and a separate all-sections-complete state.
- Track per-request server and client phases. Metrics and EXPLAIN controls remain super-admin-only.
- For each expensive section, tune the SQL plan and indexes before increasing caches or reducing visible fields.

### 6.4 `VF_MOs` list

Refactor list work so requesting page N does not rebuild every derived value from every row.

1. Identify actual list filters, display fields, default order, product/category label joins, and filter-option semantics.
2. Return an initial bounded page ordered by `id`/stable unique tie-breaker. Put the last key and snapshot in the continuation cursor.
3. Apply filters before paging in a source path that can use them. A narrow Sheet scan may be a first measured step, but it must not be described as constant-time paging.
4. Load static or slowly changing dropdown options separately or from tenant-aware caches. Avoid recomputing recipe, product, shift, category, and batch options on every page request when their freshness can be tracked independently.
5. If exact distinct options depend on the entire table, calculate them through a bounded/versioned summary or retain the full scan and report that cost; do not silently return page-only options.
6. Replace offset paging only after verifying the list’s insert/update/delete behavior and the cursor stability. Avoid duplicate/missing rows while background pages load.
7. Keep the first page and existing row action behavior during rollout. The page search must disclose whether it covers loaded rows or invokes a global server search.

---

## 7. Save-path plan for multi-table forms and individual field updates

This work follows the read contract, but it is a parallel performance objective. Faster reads must not weaken save correctness.

### 7.1 Multi-section form command

Use one logical request with the document header, child arrays, explicit deleted child keys, `save_scope`, edit token, and a unique `request_id`. Keep these fields explicit so omitted, empty, and deleted sections have different meanings.

For VF_MOs, declare the involved sections separately: header, outputs, consumption, work operations, and byproducts. The edit form’s current scope may cover fewer sections; only read and mutate sections included by the submitted scope.

### 7.2 Server-side save plan

Under the existing lock/recovery contract:

1. Normalize the request once and validate identity/scope.
2. Read each affected table once into a request-scoped document context. Build maps by `unique_id`, parent key, and numeric ID as required.
3. Reuse those maps for edit-token validation, ownership checks, existing-row reconciliation, stock validation, and mutation planning. Avoid invoking a full-table helper separately for each child.
4. Calculate an immutable diff: header patch, child patches, inserts, deletes, formula-owned values, and unchanged rows. Skip unchanged writes.
5. Validate permissions, ownership, stock availability, formula rules, request replay, and operation budgets before the first business mutation.
6. Reserve numeric IDs in one bounded operation per table. Keep UUID assignment deterministic for retries when a request ID is present.
7. Batch formula-safe patches, appends, and deletes by section. Preserve ordering required by formulas that depend on physical row position.
8. Return a compact reconciliation response: saved document key, changed child keys, new edit token/version, and any safe display values needed by the page.
9. Patch the visible row or refresh only the loaded table window. Avoid a full list RPC after every save when the response already identifies the changed row.

Google Sheets does not guarantee a transaction across tabs. Keep the existing recovery/checkpoint behavior and document the possible partial-commit states. For MySQL, use a transaction around related table writes where the connector path supports it. For Firestore, use conditional updates and bounded commits with update-time checks.

### 7.3 Slow single-row/column updates

- On MySQL, use a keyed `UPDATE` with the minimal changed columns and an optimistic version condition.
- On Firestore, patch the document by document ID with update mask and expected update time.
- On Sheets, locate all target keys once per request, read formulas only for matched target rows, and batch adjacent writable cells. Do not call `patchRowByCriteria_` repeatedly for a batch of rows because each invocation scans the full sheet.
- Preserve formula cells, audit fields, mutation/cache invalidation, and a clear missing-key/conflict outcome.
- Do not replace a partial patch with a whole-row overwrite unless that sheet is proven to have no formulas and no concurrent field owners.

### 7.4 VF_MOs planned-save candidate

The candidate behind `MFG_PLANNED_SAVE_` uses a document context and batched mutation plan. It is enabled as a local, flag-gated pilot after synthetic action-level checks; those checks do not replace a staging comparison or production latency measurements. Keep the remaining gates explicit:

- capture legacy baselines for new order, header-only edit, output edit, consumption edit, child deletion, and retry after a simulated uncertain response;
- verify the expected reads, writes, formulas, ID assignment, request replay, edit-token conflict, ownership, stock, audit, and recovery behavior;
- compare persisted rows and user-visible results for each case;
- measure handler, Sheet API, formula probe, write batch, and total browser RPC phases;
- keep it under the existing per-module and master flags; do not promote beyond the local pilot until the remaining comparisons and timing work are complete.

Execution note — 2026-09-28: isolated synthetic Sheets fixtures now cover candidate create, one-context-read header-only edits with two changed cells (the edited field and user stamp), single-column child patches, work-op/by-product inserts, paired output/footer writes and deletes, stale-token refusal, mapped identities, date-serial token parity, and same-request replay. The VF_MOs planned-save switch and its two master dependencies are enabled for this local pilot. Production timing and staging comparison remain outstanding; no production workbook was used.

---

## 8. Measurement and privacy design

Every migrated endpoint should collect a consistent diagnostic set:

### Read timings

- cache lookup/hit/miss and cache age;
- queue wait and browser RPC duration;
- server handler duration;
- source connection, query/read, and result traversal duration where available;
- rows and cells scanned versus returned;
- bytes returned and JSON parse/mapping duration;
- first paint, each chunk render, full hydration completion, and search duration;
- cursor pages requested, retries, timeouts, and deduplicated rows.

### Save timings

- request normalization and validation;
- per-table reads/key-index builds/formula probes;
- planned versus written patch/insert/delete counts;
- Sheets/Firestore/MySQL calls and bytes;
- lock wait/hold duration;
- reconciliation/recovery outcome;
- browser RPC duration and visible confirmation time.

### Privacy and interpretation

- Show internal timing details only to a verified super admin. Do not trust a browser-supplied role flag.
- Do not include row content, product names, customer values, database credentials, or SQL credentials in telemetry.
- Correlate phases using a request ID, and distinguish browser timeout from a server-side database timeout.
- Label `rowsScanned`, `rowsReturned`, and `totalIsExact` separately. Do not describe elapsed time outside the named MySQL or Sheets wrapper as network time unless it was measured directly.
- Compare cold and warm runs separately. Report p50/p95 from repeated runs, not one best-case sample.

---

## 9. Implementation phases and exit criteria

Each phase has a reviewable deliverable and a stop condition. Do not enable a broader phase when the prior phase’s result or data parity is unclear.

### Phase 0 — Endpoint and table inventory

**Deliverable:** a checked-in inventory of interactive list and save endpoints with source backend, table/tab names, typical and maximum rows, projected columns, filter/sort fields, unique keys, current read calls, response bytes, cache behavior, formula presence, and save coupling.

**Exit criteria:** every “show all” page and every multi-table form has an owner, data class, and proposed read strategy. The inventory distinguishes page count from distinct endpoints and lists any exceptions.

### Phase 1 — Measurement contract and baseline

**Deliverable:** common super-admin-only metrics for cache, RPC, source phases, JSON, render, row/byte counts, and errors; baseline measurements for one MySQL list, one Sheets list, one Firestore/system list, one slow report, and VF_MOs.

**Exit criteria:** repeated cold/warm samples can identify whether delay is cache, source, Apps Script, result serialization, browser, or rendering. Timeout is distinct from database failure.

### Phase 2 — Shared response and client loading primitives

**Deliverable:** versioned result/cursor model plus a shared loader that supports cached first paint, refresh-in-background, sequential pages, deduplication, cancellation, safe cache bounds, and partial/full search scope.

**Exit criteria:** a sandbox/demo endpoint proves the loader can append pages without losing sort, selection, scroll, or row identity; it accurately distinguishes loaded-only from global search. Existing pages can continue using the current component until opted in.

### Phase 3 — Low-risk MySQL catalog/table pilots

**Deliverable:** apply the common loader contract to `tc_stock_scan` and `tc_products_live` while keeping their existing JSON-aggregate source path and permissions.

**Exit criteria:** warm picker/table paint is under 100 ms at p50 for the measured 769-row payload on the agreed browser class; cold first useful state appears before complete background refresh; no missing/duplicate product after create/edit/soft-delete; full search finds all eligible products; page metrics remain super-admin-only. Cold response phases do not regress materially from the recorded baseline.

### Phase 4 — MySQL reports and heavy sections

**Deliverable:** retain progressive `tc_financial_ratios` section rendering, verify JSON snapshot plans, and use bounded section caching only where versioning is correct.

**Exit criteria:** first-visible and complete-report times are separately reported; no section waits on unrelated slower sections; each expensive SQL query has a reviewed plan; aggregate caps and failure paths are explicit.

### Phase 5 — Sheets read pilot and shared table adoption

**Deliverable:** migrate one append-oriented table to a bounded Sheet window/cursor and one filter-heavy table to an honestly measured scan or maintained index. Remove that pilot’s show-all button after background hydration/global search/export behavior is correct.

**Exit criteria:** each page request reads a bounded range for the window strategy; background completion does not duplicate or omit keys for the tested mutation conditions; global search has a server route or waits for confirmed full hydration; exported row scope is explicit.

### Phase 6 — System storage adapter paging

**Deliverable:** implement true `queryPage` behavior for Sheets-backed system tables and align response metadata with Firestore cursors.

**Exit criteria:** interactive callers do not invoke `queryAll`; filters and deterministic ordering match across Sheets/Firestore; create/patch/delete still address the same business record; system IDs and document metadata remain correct.

### Phase 7 — VF_MOs list and reference option separation

**Deliverable:** bounded first page and cursor path, measured search behavior, cached/independent reference options, correct distinct filter values, and stable count/completeness indicators.

**Exit criteria:** first-page backend work no longer constructs all display rows merely to return a page, or a remaining whole-scan cost is measured and documented; no duplicate/missing rows during hydration under new inserts; filters return the same results as the legacy route.

### Phase 8 — VF_MOs and generic batched save adoption

**Deliverable:** verified baseline-versus-candidate save matrix, then a small flag-controlled rollout of the planned save, followed by reusable keyed patch batching for other slow field updates.

**Exit criteria:** persisted results and safety checks match legacy behavior; retries are idempotent; conflicts are detected; formulas are preserved; recovery is demonstrated for partial Sheet commits; measured table scans/API calls decrease; the UI reflects successful changes without a redundant full-list reload.

### Phase 9 — Page-by-page rollout and show-all retirement

**Deliverable:** migration of the remaining table/list pages according to the Phase 0 inventory, grouped by catalog, append-only transaction, filter-heavy table, and multi-table document.

**Exit criteria per page:** correct first page, truthful global search, stable paging, bounded caching, explicit export scope, no permission regression, super-admin-only diagnostics, and acceptable cold/warm p50/p95 results. Retire old show-all paths only after the replacement meets these criteria.

---

## 10. Verification matrix

For each endpoint, record results for the following cases before and after migration:

| Case | Required verification |
|---|---|
| Cold load | Time to skeleton, first useful data, RPC phases, payload bytes, and initial page size |
| Warm cache | Cache age, paint time, refresh result, and stale-data label |
| Background completion | Correct count/completeness, no duplicate or missing keys, bounded number of calls |
| Global search | Match outside first page, Arabic/name/code normalization, zero-result correctness, and cancellation of old queries |
| Concurrent insert/update/delete | Snapshot/cursor behavior, cache invalidation, stable row identity, and no misleading total |
| Sort/filter changes | Stable order, correct cursor reset, server/client scope displayed correctly |
| Export/print | Current page versus all matching rows, with accurate progress and count |
| Permission | Normal user gets business response only; super admin gets diagnostic fields; unauthorized mutation remains rejected |
| Failure/timeout | Cached list remains usable, retry is safe, request queue clears, and timeout is not reported as a database phase result |
| Save parity | Header and children persist correctly, formulas survive, IDs/UUIDs remain stable, audit and recovery work, and edit conflicts are reported |

For paged responses, compare the union of all page keys to a legacy full-read snapshot under controlled data. Compare every projected field that affects display, filtering, joins, and saves. Compare total and distinct filter options separately; page one equality alone is insufficient.

---

## 11. Main risks and mitigations

| Risk | Mitigation |
|---|---|
| A local search appears global but has only loaded rows | Scope label, server search while incomplete, and a completeness signal |
| Offset paging repeats or skips records during concurrent inserts | Cursor plus high-water mark and identity deduplication |
| UUID is mistaken for chronological order | Keep identity separate from sort key; use timestamp plus UUID tie-breaker |
| Sheet “paging” still scans every row | Measure rows scanned; use bounded ranges, an index/projection, or a backend suited to filtering |
| JSON aggregation produces a large response or unstable ordering | Bound page size/bytes, include sort keys, validate row count, sort explicitly, and preserve fallback error behavior |
| Browser cache shows stale or cross-company data | Namespace by company/user scope/schema; version and TTL; clear on sign-out/company switch; refresh in background |
| A background loader overwhelms Apps Script RPC capacity | Sequential requests, cancellation, hidden-tab pause, byte/time budgets, and per-endpoint page caps |
| Table renderer redraws all accumulated rows for each chunk | Add/patch only affected rows or virtualize large tables; measure client rendering independently |
| Planned multi-sheet save partially commits | Preserve request ID, checkpoints, recovery, audit, formula protection, and explicit reconciliation states |
| Fast engine fallback hides a poor path | Measure both candidate and fallback; log strategy and typed fallback reason for super admins |
| Diagnostic timing leaks sensitive information | Server-side role verification; exclude row values, credentials, and SQL secrets |

---

## 12. Decisions to make during implementation

These are table-level decisions, not blockers for this plan:

1. Which tables qualify for full browser warming based on measured row count and bytes?
2. Which mutable Sheets tables justify a maintained index/projection versus a MySQL/Firestore query path?
3. What per-table cache TTL and source version can be trusted after each mutation route?
4. Which pages need exact total counts immediately, and which can show “more available” until hydration finishes?
5. What browser row/byte cap and export limits provide a good experience without excessive memory use?
6. Which existing flags and shadow-comparison tools should guard each initial rollout?

Resolve these from Phase 0 inventory and Phase 1 measurements. Avoid choosing one universal row cap, cache lifetime, or paging strategy for every table.

---

## 13. Files and implementation areas to inspect during the work

- [MySQL_Products_Table_Dropdown_Performance_Journey.md](MySQL_Products_Table_Dropdown_Performance_Journey.md) — empirical MySQL table, picker, and report lessons.
- [UI_Components.html](UI_Components.html) — shared table search, show-all bar, chunk rendering, and `PagedTable` behavior.
- [Core_FastRead.js](Core_FastRead.js) — declared Sheet read strategies, cache and read metrics.
- [Core_FastSave.js](Core_FastSave.js) — formula-safe keyed writes and batched mutations.
- [Core_FormContracts.js](Core_FormContracts.js) — request-scoped form context, diff planning, budgets, and commit contract.
- [Code.js](Code.js) — system storage adapters, generic whole-table helpers, ID allocation, and criteria-based patches.
- [Company_TopChemical_Actions.js](Company_TopChemical_Actions.js) — MySQL JSON aggregation and product/table/report endpoints.
- [Company_ValleyFoods_Actions.js](Company_ValleyFoods_Actions.js) — VF_MOs list/save paths, fast-read and planned-save candidates.
- [Company_ValleyFoods_MfgOrders.html](Company_ValleyFoods_MfgOrders.html) — client-side paged list and logical save payload.

---

## Completion definition

This plan is complete when each interactive list has a deliberate source strategy and a truthful search scope; a user can start working from a fast first view while the rest loads safely; all matching data remains searchable through local hydration or a server query; multi-table saves avoid repeated lookups and writes while preserving recovery and formula behavior; super admins can diagnose each phase; and the rollout has been verified page by page without deploying Apps Script online as part of this work.
