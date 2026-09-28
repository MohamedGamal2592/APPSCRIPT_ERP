# MySQL Dropdown and Table View Bible

Updated: 2026-09-27

## 1. Why this guide exists

This is the working reference for adding MySQL-backed dropdowns and bounded, searchable table views to Apps Script pages in this project. It records the lessons from the direct experiment and the later implementations in the real `tc_products_live` and `tc_stock_scan` pages. Treat measured values as observations for the environment and deployment where they were captured, not promises for another page, table, user, or deployment.

The guiding idea is simple: **load a small, complete, authorized lookup set once; search and render it in the browser; keep business actions and authority on the server.** When the data set is too large or sensitive to preload, use bounded server-side search and pagination instead.

The two real pages now use different read shapes suited to their jobs: Products Live loads a bounded row set for the shared ERP table, while Stock Scan loads a compact product catalog for its picker. There is still no extracted shared `UIC.mysqlDropdown` component; Stock Scan's picker is page-specific. These implementations establish reusable patterns, not a drop-in module that can be attached to any table without page-specific authorization, bounds, and UX decisions.

## 2. Historical project reference experiment

The direct experiment page is `Company_TopChemical_ProductsLive_DirectTest.html`; it is not the normal `tc_products_live` page. The normal route uses `Company_TopChemical_ProductsLive.html` and the `get_products_live` action. The direct test action is `get_products_live_direct_test`, granted `tc_products_live/read`, and mapped to `mysql:products`. Keep this experiment as a reference for the raw full-table response and its historical measurements.

The historical experiment page exercised two related interfaces from a **single full-table response**:

#### Product dropdown

- Uses `products.id` as the committed value and `products.name_ar` as the label.
- Filters by ID or Arabic name in the browser, without an RPC for every keystroke.
- Sorts numeric IDs as strings, so IDs are not rounded by JavaScript number conversion.
- Renders at most 100 open options and reports the total matches.
- Preserves the original eligibility rule: rows with a non-empty `deleted_at` are omitted from the dropdown.
- Selection writes only the stable product ID to the hidden form field. This test page has no business save behavior.

#### Full products table

- Reads every column discovered from the fixed `products` table and every row, including soft-deleted rows.
- Searches all loaded rows and every returned column in the browser.
- Filters the complete in-memory set first, then shows 50 matching rows per page. Page navigation does not make another database request.
- Uses `textContent` for headers and cell values; database text is never interpreted as HTML.
- Sorts rows by numeric ID ascending in the browser.
- Is read-only. It is intended to observe a small, bounded table, not to replace the regular Products Live page.

The experimental action gets the table's column names using result-set metadata from `SELECT * FROM products LIMIT 0`. It validates each name before using it in SQL, then constructs one `JSON_OBJECT` per row and aggregates those objects in MySQL. Values are returned as strings (or JSON null) to preserve large integer and decimal text; this table is for display/search, not typed editing or calculations.

Safety bounds for this historical test action:

- At most **5,000 rows** are returned. The SQL reads at most 5,001 rows to detect overflow.
- The aggregated row JSON must be at most **5 MiB**.
- A table exceeding a bound returns an error; it is never presented as a complete table when it was truncated.
- The action is fixed to `products`; the browser cannot provide a table or column name.

## 3. Lessons from the two real pages

### A. Products Live: bounded data view

The normal `action=tc_products_live` page now uses the existing MySQL-backed `get_products_live` action and the shared ERP `UIC.dataTable` presentation:

- The page requests `loadAll: true` once and keeps the returned rows in page memory. The server caps this path at 1,000 rows; it reports `has_more` when the cap is exceeded, and the page tells the user that search covers only the returned set.
- The full-load path gets the total count and bounded row set in one SQL round trip, using MySQL `JSON_ARRAYAGG(JSON_OBJECT(...))` for the rows. It reads product column names from schema metadata, includes the live quantity projection, casts values to strings to preserve large IDs/decimals, and sorts IDs in Apps Script because aggregate array order is not guaranteed. Filtered and cursor-paged reads keep the existing row mapping.
- The browser stores the last successful table result under a key scoped by company, page, cache version, and authenticated email. It paints that result immediately on the next visit; a copy younger than 60 seconds is used without a new RPC, while an older copy stays visible as MySQL refreshes in the background. If refresh fails, the saved table remains visible. A one-time migration can seed this cache from the earlier `tc_products_live_direct_test` result after filtering soft-deleted rows.
- Search and sorting run through the shared table UI over the loaded rows. Pagination is the shared table's 50-row display pagination. Typing, sorting, and paging do not issue a new MySQL request.
- The read action uses the normal named `mysqlRead_` cache/validation path and includes `products.*` plus the live quantity projection. Its returned columns support the detail view, while the table displays a curated set of columns. Do not interpret this as permission to expose every database column in every page.
- Add, edit, and soft-delete remain separate page business actions. They do not run through a generic table component. After a successful write the page forces a fresh list read so the table reflects the change.
- The page search is global over rows returned by this load, not a paged server search. At more than 1,000 matching/eligible rows, it cannot search beyond the server cap; the cap status must stay visible and the strategy should change before the table grows beyond that boundary.

**Lesson:** for a table that is small enough to load and authorized as a whole, one bounded read followed by shared client-side search/sort/page gives a simpler interaction than an RPC for each search or page change. JSON aggregation reduces per-cell JDBC calls, while the browser copy improves repeat and timeout behavior. The first-ever uncached view still depends on the MySQL and Apps Script request completing.

### B. Stock Scan: compact product dropdown

The normal `action=tc_stock_scan` page now loads products through `get_stock_scan_catalog`, an action authorized for `tc_stock_scan/read` and mapped to `mysql:products`:

- The SQL is fixed on the server and selects only `id`, `name_ar`, `code`, and `number_of_cartons_bags` for rows with `deleted_at IS NULL`. It orders by name and ID, then aggregates the bounded result into one `JSON_ARRAYAGG(JSON_OBJECT(...))` value. IDs and decimal quantities are cast to strings before JSON parsing; the browser never supplies SQL identifiers.
- The response is a compact complete catalog, limited to 2,000 rows and 256 KiB. The action rejects overflow rather than presenting a partial catalog as complete. IDs remain strings; the selection value is the stable product ID.
- The page sorts IDs numerically without converting long IDs to JavaScript numbers. The dropdown opens from the “اختيار صنف” control, and its search field is inside the dropdown. In the normal catalog path, typing filters locally by normalized Arabic name substring; exact ID lookup remains supported. Up to 100 matching options are rendered, while the match count is retained.
- The response includes code and per-unit quantity because the selected product needs those values in the count form. This avoids a follow-up product lookup on selection. The code is displayed with each result, while the standard local catalog filter is by name or ID.
- The server uses the named `mysqlRead_` cache definition with a 30-second TTL. The browser also stores the compact catalog under a key scoped by page/action, catalog schema version, and authenticated email: it treats entries as fresh for 60 seconds and may show a same-user stale entry up to 10 minutes while refreshing. Cache-storage errors do not prevent the picker from working.
- The diagnostic line now separates MySQL JSON parsing from JDBC row reads. The “قياس تحديث MySQL” control deliberately bypasses browser and server caches to measure a fresh read; normal navigation should use the saved catalog when it is fresh.
- During the transition from the direct dropdown experiment, Stock Scan can read the prior experiment's browser cache and project it down to the fields it needs. This is a migration aid; future page modules should use a cache contract owned by the page or a shared catalog layer rather than depend on another page's private storage key.
- When the catalog is missing, too large, invalid, or unavailable, the page has a server-search fallback. The fallback is not the normal keystroke path when a complete catalog is available.

**Lesson:** the stock form needs a lookup, not a full product record. Selecting four fields once and carrying the fields needed by the form avoids both the old slow, per-query route and extra reads after choosing an item. The cold catalog read can still take seconds in Apps Script; a warm browser cache changes perceived repeat-use time, not MySQL or cold RPC latency.

### C. What is reusable and what is page-specific

Both pages keep SQL, table choice, eligibility, and authorization on the server, preserve IDs as strings, bound result size, and use local interaction after a complete accepted response. Their data shapes differ by purpose: Products Live loads broad row objects for its table/detail/edit workflow; Stock Scan loads a narrow lookup projection for selection. Reuse the boundaries and measurement method, not one response shape for both jobs. The current `tc_stock_scan` dropdown controller is not yet an extracted universal component.

Neither the earlier test measurements below nor the code shape proves the latest local source has a particular cold-load time in a deployed web app. Do not claim a speed improvement for the real-page changes until timing is captured from the exact deployed version and deployment context.

## 4. What the experiment measurements taught us

### A. Dropdown-only result (earlier experiment)

An earlier run loaded 769 `(id, name_ar)` pairs:

```text
browser cache paint: 3 ms
until MySQL update visible: 7,108 ms
RPC: 7,104 ms
client option preparation: 1 ms
MySQL connection: 1,201 ms
SQL: 203 ms
JDBC row read: 6 ms
server total: 1,415 ms
```

That response was only the compact dropdown catalog. Do not compare its SQL or server time directly with the later full-table response.

### B. Dropdown plus full-table result (latest user-provided test run)

The user-provided test deployment reported:

```text
Dropdown matches: 769
Dropdown options initially rendered: 100
Dropdown rows loaded: 769
Table rows: 784
Table columns: 17
Aggregated table-row JSON: 322,093 bytes
Cached table display: 37 ms
Until refreshed MySQL table is visible: 9,473 ms
Browser RPC round trip: 9,447 ms
Client table/dropdown preparation and render: 4 ms
MySQL connection: 1,540 ms
SQL: 788 ms
JDBC result read: 189 ms
Server JSON parse/map: 3 ms
Server handler total: 3,681 ms
```

The exact displayed report in Arabic was:

```text
المطابق: 769 | المعروض في القائمة: 100 | الإجمالي المحمّل: 769 — اكتب لتضييق النتائج
ظهور الجدول من الكاش: 37 ms سجلات الجدول: 784 | الأعمدة: 17 | حجم بيانات الصفوف: 322093 bytes | حتى ظهور تحديث MySQL: 9473 ms | RPC: 9447 ms | تجهيز ورسم الجدول والقائمة: 4 ms | اتصال: 1540 ms | SQL: 788 ms | قراءة الصفوف: 189 ms | تحليل JSON على الخادم: 3 ms | الخادم إجمالاً: 3681 ms
```

### C. Interpretation

1. **Warm display is fast.** The local browser copy painted in 37 ms. When the copy is within its 60-second freshness window, the page uses it without automatically making a MySQL request. This is the relevant perceived speed for repeated use during that window.
2. **The forced/stale refresh is still slow.** The end-to-end MySQL update took 9.47 seconds. The RPC timer was 9.447 seconds, while the server handler reported 3.681 seconds. The difference is about **5.77 seconds outside the measured handler**. That interval can include Apps Script coordination/dispatch, server response serialization, and the RPC return path; these numbers alone do not identify one specific cause.
3. **The browser is not the bottleneck.** Preparation and initial render were 4 ms. The 322 KB JSON rows payload did not make rendering slow in this run.
4. **The full-row query costs more than the dropdown query.** SQL rose from about 203 ms in the smaller earlier test to 788 ms in the full-table test; result reading rose from 6 ms to 189 ms. The request also returns 17 fields per row rather than two.
5. **Connection time remains material.** The 1.54-second connection estimate is larger than the SQL time. Avoid repeated independent reads/connections when one response can safely serve several controls on the same page.
6. **The row-count difference is expected.** The full table showed 784 rows while the dropdown exposed 769. The test table intentionally includes soft-deleted rows, but the dropdown filters them. The difference is consistent with 15 deleted products.
7. **A small SQL time does not guarantee a fast browser-visible refresh.** Measure cache paint, browser RPC, server connection, SQL, JDBC result reading, server parse/map, client preparation/render, payload size, row count, and column count separately.

The later real-page reports ended at about 30 seconds with `RPC_TIMEOUT` and had no MySQL phase fields. That means the browser coordinator received no completed response before its timeout; it does **not** show that MySQL itself took 30 seconds. The warm browser copy keeps the page usable while that happens, and JSON aggregation reduces JDBC calls when the server read runs, but a continued timeout still requires server-side Apps Script execution/connector diagnostics to isolate the cold-request failure.

The report's `payload_bytes` measures the JSON array of row objects, not the small response envelope or Apps Script transport encoding. `RPC` measures from the browser's call to its fulfilled response. `server_total` measures inside the action handler. Their difference is useful to locate time outside the handler, but it is not a direct measurement of network-only latency.

## 5. Reusable architecture

Build the eventual shared feature from two independently scoped pieces:

1. **Server-owned catalog/read action.** A dedicated action chooses the fixed table, columns, eligibility, ordering, limits, serialization, and authorization. It returns strings with stable IDs and labels. The browser never sends SQL or database identifiers.
2. **Shared browser picker/view controller.** It receives already-authorized data and owns generic search, render bounds, keyboard/pointer behavior, status, and refresh lifecycle. The host page retains its form state, selected ID contract, calculations, validation, and save behavior.

A future page adapter could look like this:

```js
var picker = UIC.mysqlDropdown({
  input: document.getElementById('supplier-picker'),
  list: document.getElementById('supplier-options'),
  hiddenId: document.getElementById('supplier-id'),
  load: function () {
    return companyCall('get_supplier_dropdown_catalog', {});
  },
  idField: 'id',
  labelField: 'supplier_name',
  searchFields: ['id', 'supplier_name'],
  maxOptions: 100,
  onSelect: function (id, label) {
    // The containing page owns form state and business actions.
  }
});
```

This snippet is a **design contract only**. `UIC.mysqlDropdown` does not exist today. Extract it into `UI_Components.html` only after behavior tests cover it. Keep data-loading configuration as an action callback; do not let the generic UI component construct SQL.

For a generic table view, use the same data principle but a distinct view controller/configuration: explicit visible columns, safe cell rendering, all-row local search only for bounded responses, page size (50 in the experiment), and clear completeness/overflow status. Do not make the picker responsible for table paging or make a generic table guess which columns are safe to expose.

## 6. Server integration recipe

For each lookup/page, record the page ID, table/view, stable key, display label, filtering fields, eligible-row predicate, expected row count, maximum response bytes, and whether all eligible rows may be shown to that page's users.

Add a dedicated server action in `Company_TopChemical_Actions.js`:

1. Add an exact `PAGE_ACCESS` entry using the destination page and `read` permission. A shared UI component does not grant authority.
2. Map the action to its real MySQL source in `ACTION_TABLES` for auditing/logging.
3. Register it in the existing company-action dispatcher.
4. Use the existing authenticated/company-scoped request flow and MySQL connector. Reuse `mysqlRead_` with a named definition for normal production features, including input normalization, version, TTL, payload validation, and authorization on cache hits and misses. The direct test intentionally bypasses that wrapper to isolate its query/serialization experiment; do not copy that bypass into production by default.
5. Keep the table/view and selected SQL identifiers server-owned constants or strictly validated metadata from a fixed server-selected table. Never accept table/column names from the client.
6. Bind all values with prepared statements. Search strings, IDs, dates, and page tokens are values, not SQL fragments.
7. Select only fields approved for the page. Exclude soft-deleted/ineligible rows unless the explicit purpose is an audit/test view that is authorized to show them.
8. Preserve IDs as strings (`CAST(id AS CHAR)` or string conversion). Do not convert BIGINT keys to JavaScript numbers.
9. Use a compact SQL JSON aggregate when measured JDBC per-cell reading is the slow phase and the deployed MySQL version supports the JSON functions. Verify the result shape and preserve SQL nulls. Keep explicit row and UTF-8 byte ceilings.
10. Close JDBC result sets/statements/connections in `finally`. If the shared wrapper owns a borrowed connection, follow its resource lifecycle rather than closing it twice.
11. Return explicit metadata, e.g. `status`, `schema_version`, `columns` or `items`, `rows` or `count`, `complete`, `payload_bytes`, and `timing_ms`. Validate array/object shape, types, count consistency, and completeness on both server and client.
12. Add the action to the `Client_Helpers.html` MySQL read deduplicator when it should share in-flight calls/coordinator behavior. Do not combine page actions in a way that weakens independent page grants.

For a dropdown response, keep the contract small:

```json
{
  "status": "ok",
  "schema_version": 1,
  "items": [{"id": "123", "label": "Example"}],
  "count": 1,
  "complete": true
}
```

For an exploratory full-table response, make the larger shape explicit:

```json
{
  "status": "ok",
  "columns": ["id", "name_ar"],
  "rows": [{"id": "123", "name_ar": "Example"}],
  "count": 1,
  "payload_bytes": 42,
  "complete": true
}
```

Never silently return the first N rows and call that complete. Either return a complete bounded catalog/table or clearly signal overflow and use a server-search/paged path.

## 7. Browser dropdown behavior

The reusable picker should own only lookup UX:

- Start one catalog load per page instance/generation; share overlapping requests.
- Show cached/current data while refreshing if policy permits, with a visible refresh/error status.
- Filter the entire accepted in-memory catalog on each input change; do not send an RPC per keystroke while the catalog is fresh.
- Match only explicit fields (often ID and label). Keep Arabic normalization rules documented and conservative; do not add fuzzy matching by accident.
- Render a bounded option window (100 was used by this test). Report the true total match count and tell users to narrow the search if more matches exist than are rendered.
- Keep selected ID independent from the current typed query. Typing/clearing is not selection and cannot submit a record.
- Use `textContent`, not HTML interpolation for any database value.
- Support arrows, Enter, Escape, pointer/touch, focus, outside click, IME composition where relevant, and combobox/listbox ARIA state.
- Expose lifecycle methods such as `refresh()` and `destroy()`. Ignore stale asynchronous responses after a newer query, forced refresh, page teardown, or session/account change.
- Make loading, empty result, error, overflow, and stale cache distinct states. A failed fetch is not an empty successful catalog.

## 8. Browser table-view behavior

Use client-side search and paging over the whole response only when the full set is intentionally loaded and bounded:

- Keep all rows in memory, but render only the current 50-row page.
- Search every column on every loaded row before slicing the current page. Reset to page 1 when the query changes.
- Show the filtered match count, total loaded row count, range currently displayed, column count, and current page/number of pages.
- Use safe text rendering, horizontal/vertical overflow handling, and useful full-cell title text for clipped wide values.
- Keep column order in a server-returned `columns` array; do not infer it from object key enumeration.
- Keep values as strings/null for display and preserve large numeric IDs exactly. Convert values to typed numbers/dates only in a page-specific calculation with explicit validation.
- Keep test/audit columns distinct from ordinary business-page columns. “All columns” is an explicit data-access decision, not a default for every table.

This experiment's pagination is **display pagination**, not MySQL pagination. It downloads all 784 rows before the user can search them. That gives global instant search for this small set; it does not scale indefinitely.

## 9. Preload, local search, or server search?

### Preload a full lookup catalog when

- Its eligible row count and expected UTF-8 payload are bounded and measured.
- The page's users may see every returned option.
- Searching while typing must not wait for an RPC.
- The complete catalog is small enough to validate, transfer, hold in memory, and optionally cache.

### Preload a whole table for a test/inspection view when

- “All columns/all rows” is intentional for that page's authorization.
- The result remains below explicit row and payload bounds.
- The table is for reading/searching and not doing typed calculations or editing from untrusted cached values.
- You have measured the complete response, not just a dropdown pair response.

### Use server-side search and/or pagination when

- Row count or payload is unbounded or growing toward the configured cap.
- Eligibility depends on the current page/form/user or query context.
- The values are personal, financial, permission-sensitive, or not all visible to every page user.
- Full preload has unacceptable cold latency or payload size.
- Search should use indexed exact/prefix fields over a large source.

In server mode, debounce bounded query input, use prepared values, return a strict maximum page size, preserve exact selected IDs, and report `has_more`/totals honestly. Choose cursor/keyset pagination where appropriate. Check query plans and schema ownership before proposing indexes; do not alter production schema as part of a picker experiment.

## 10. Caching and freshness lessons

The historical test page cached its full rows for 60 seconds under its test namespace and authenticated email. Stock Scan now has its own compact catalog cache: 60 seconds fresh, up to 10 minutes usable as stale-while-refreshing, scoped by action/schema and authenticated email. These are page-specific choices, not universal safe defaults.

For reuse:

- Prefer page-instance memory caching by default. Use persistent storage only after considering data sensitivity and browser account-sharing behavior.
- If persistent cache is approved, include company, page/action, user, and schema version in the key; set a short explicit TTL; clear data on logout/account change; handle quota/storage failures; and provide a forced refresh.
- A browser cache improves perceived repeat-use latency; it does not make the database query or cold RPC faster.
- A cache must never replace server authorization. Authorize each server request and scope server caches by company, user/grants, action, normalized inputs, data version/epoch, and database as the existing shared MySQL cache contract requires.
- Invalidate or expire caches after relevant writes. External writes can only be observed after expiry or a deliberate refresh unless there is an explicit invalidation channel.
- If the cached full table is too large for localStorage, fail closed to in-memory/current-page data and fetch again; storage write failure must not break the interface.

## 11. Measurement contract

For each rollout, capture a cold/fresh-server read, a stale-cache refresh, and a warm browser-cache open separately. Include:

| Measurement | What it tells us |
|---|---|
| Cache paint | Time to show a saved browser copy. |
| Browser RPC | Time inside the client call from dispatch until response is fulfilled. Includes app coordination and response return/decoding. |
| Until visible | End-to-end request-to-rendered-update time, including client work and a browser paint. |
| Client preparation/render | Mapping, sorting/filter preparation, and initial DOM render duration. |
| Connection | Time to obtain the MySQL JDBC connection inside the server request. |
| SQL | Database statement execution duration, including metadata/read statements when instrumented. |
| Result read | Time spent advancing/reading JDBC results. |
| Server parse | JSON parse and server-side object mapping duration for aggregate responses. |
| Server total | Time spent inside the read action from handler start to response-ready. |
| Payload bytes | UTF-8 bytes of the row/catalog JSON, separately from any transport envelope. |
| Row/option count and columns | Makes comparisons meaningful; dropdown eligibility may differ from an all-row table. |

Always report the data shape with the timing. A 769-row two-column catalog is not comparable with a 784-row, 17-column table. Record whether soft-deleted rows are included. Report the environment, whether the browser used a warm/stale/empty cache, and whether the refresh was forced. A single run is an observation, not p50/p95/p99 evidence.

## 12. Adding another page/table: checklist

1. **Define purpose and scope.** Identify the page action ID, MySQL table/view, fields, eligibility, whether deleted rows are included, authorized audience, row/payload bound, and selected-value contract.
2. **Inspect current behavior.** Read the page's existing picker, save path, action grants, connector, cache definitions, and coordinator registration. Keep unrelated calculations and writes untouched.
3. **Select the data strategy.** Estimate row count/payload. Choose bounded preload/local search or indexed bounded server search/pagination. Do not begin with an unbounded `SELECT *` for production.
4. **Add server action and authorization.** Add `PAGE_ACCESS`, `ACTION_TABLES`, handler registration, fixed SQL, prepared values, explicit eligibility, count/completeness/bounds, resource cleanup, and named `mysqlRead_` validation/cache definition for production.
5. **Implement the client adapter.** Reuse the shared picker/table controller only after it exists and is tested. Keep page business state and save logic in the page.
6. **Test correctness.** Include zero/one/many rows; duplicates; NULLs; Arabic; long and large IDs; markup-like strings; deleted/ineligible records; permissions; cache hit/miss; expiry/refresh; overflow; storage failure; keyboard/IME/pointer; search across later pages; and stale-response ordering.
7. **Test data integrity.** Verify the committed ID exactly matches the selected row and downstream save action. Confirm no filtered or hidden row becomes selectable incorrectly.
8. **Measure real shapes.** Capture row count, column count, payload bytes, cache paint, RPC, server phases, client render, and until-visible time in the intended test environment. Compare cold and warm paths separately.
9. **Roll out one page at a time.** Keep a page-level rollback switch to the prior picker/search mode. Observe authorization, completeness, and timing before the next migration.
10. **Promote only after review.** Confirm the code tested is the code intended for release, and keep local implementation, push, and Apps Script deployment as separate explicit steps.

## 13. Known boundaries of the current implementations

- The normal `tc_products_live` route uses `get_products_live` and the shared ERP table UI. It loads at most 1,000 rows for the current all-rows view; it is not the historical 5,000-row direct-test reader.
- The historical direct test remains fixed to `get_products_live_direct_test` and `products`. Its reported 784 rows, 17 columns, and 322,093 JSON bytes came from the user's test deployment; it is not the current Products Live response shape.
- Stock Scan's catalog is a separate, compact four-field projection, capped at 2,000 rows/256 KiB, and excludes soft-deleted products. It is not the same full-row payload as Products Live.
- The old measurement of 769 catalog items and 784 full-table rows reflects the historical test data/eligibility at that time. Do not treat those counts as current database totals.
- The historical full-table/dropdown timing is a user-reported test-deployment measurement, not a benchmark of the latest real-page code. The latest real-page source has not been timed here in its deployed environment.
- `UIC.mysqlDropdown` in this guide is a future extraction contract, not existing code.
- The page-specific Stock Scan dropdown is implemented, but a reusable universal picker still needs extraction and a deliberate shared API.
- The project owner explicitly prohibited deploying Apps Script online. This guide records implementation lessons and does not authorize deployment.

## 14. Short operational rules

1. Keep SQL authority server-side; the client selects only from approved actions.
2. Keep IDs exact strings; never round keys through JavaScript numbers.
3. Preload only complete data that is bounded, authorized, and useful to search locally.
4. If partial, say partial; if too large, switch to server search/page mode.
5. Search the full accepted catalog before limiting visible choices or display rows.
6. Cache for speed, but measure cache paint separately from MySQL refresh.
7. When the client render is a few milliseconds and RPC takes seconds, don't spend the whole optimization budget on DOM or SQL alone.
8. Preserve page-owned form/save behavior and validate the exact selected ID.
9. Test authorization and data completeness as carefully as speed.
10. Treat push and Apps Script deployment as separate release steps; do not deploy Apps Script online under the current project instruction.
