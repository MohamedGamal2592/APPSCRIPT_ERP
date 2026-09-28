# MySQL Read Performance Journey: Products Table, Dropdown, and Financial Report

**Purpose:** preserve the reasoning, measurements, current implementation, and reusable lessons from optimizing MySQL-backed data views in `action=tc_products_live`, `action=tc_stock_scan`, and `action=tc_financial_ratios`.

**Audience:** developers adding MySQL-backed reports, tables, searchable pickers, or bounded catalogs to other ERP pages.

**Status:** implementation notes reviewed against the current workspace source on 2026-09-27. Timing reports in this file were supplied by the user from test deployments. The product table's combined-count optimization still needs a timing measurement from a build that includes it; the financial report's EXPLAIN diagnostic still needs its plan output. The agent has not deployed Apps Script online.

This file records the journey and the concrete page implementations. The broader reusable design and rollout checklist are in [MySQL_Dropdown_Module_Guide.md](MySQL_Dropdown_Module_Guide.md).

---

## 1. The problem we were solving

The initial user-facing problem was that loading a product into a dropdown could take around a minute. That made the normal MySQL-backed `tc_stock_scan` page feel broken even though the database connector and SQL timings looked relatively short in some reports.

The investigation uncovered several separate costs that had been hidden under one “loading products” experience:

1. **JDBC result traversal:** older reads fetched lots of individual cell values from Apps Script. A small number of SQL statements did not mean a small amount of JDBC work.
2. **Response work outside SQL:** Apps Script action routing, permission checks, request coordination, JSON construction, response serialization, and the return through the browser RPC can all add time after the SQL engine has done its work.
3. **Cold versus repeat use:** fetching MySQL on every visit made repeat navigation pay the full cost again even when the same user's product list had just been loaded.
4. **Different screen needs:** a dropdown needs only a few fields; a full table needs many columns. Sending one full row shape to both controls wastes work and bytes.
5. **Waiting for data before showing anything:** a cold request could leave an otherwise usable page blank. A browser-side saved copy can make the interface appear immediately while a refresh runs in the background.

The fix was not one SQL trick. We measured the layers, changed the response shapes, stopped making one JDBC read per cell, limited what each page loads, cached successful results at the appropriate layers, and moved interactive filtering into the browser for these bounded data sets.

---

## 2. The two page contracts

These pages read the same MySQL `products` table but serve different jobs. Keep the response shapes separate when replicating the approach.

| Page | User need | Server response | Browser work |
|---|---|---|---|
| `action=tc_products_live` | Browse and search products as a table; open details; add, edit, or soft-delete with the page's existing permissions | Bounded active product rows, all columns required by this page's detail/edit behavior, plus live quantity; current cap 1,000 rows | Shared ERP table searches/sorts the loaded set and shows 50 rows per display page. No MySQL request for each query or page turn. |
| `action=tc_stock_scan` | Pick a product while filling a stock count form | Complete bounded catalog with only `id`, `name_ar`, `code`, and `number_of_cartons_bags` for eligible products | Search the in-memory catalog inside the dropdown; display at most 100 matching options; selection reuses the included code and per-unit value. |

Both values use exact product IDs represented as strings. The full table is intentionally broader and larger. The dropdown catalog is a purpose-built projection and is the right model for most reference pickers.

---

## 3. Journey and measurement history

The following measurements were reported during the experiments and later page work. These are observations from different code versions and test runs, not a controlled benchmark series. Use the data shape and cache state beside each number when comparing runs.

### Stage 1: the original JDBC row-read path

The first measured 769-item product-list run reported:

```text
769 / 769 items
Time until list appeared: 50,372 ms
MySQL connection:         1,426 ms
SQL execution:               227 ms
JDBC row reading:         42,278 ms
Server total:             43,978 ms
```

The important result was the phase breakdown: the SQL engine's reported execution was only 227 ms, while the result-reading phase took over 42 seconds. The bottleneck was not explained by the SQL duration alone. The old mapping path performed excessive JDBC interaction while transferring the result into Apps Script.

### Stage 2: aggregate the picker data in MySQL

The dropdown experiment was changed to have MySQL build the bounded product catalog into one JSON aggregate result rather than making a large number of row/cell-level JDBC reads. For the same 769 items, a run reported:

```text
Items:                    769
Until list appeared:     7,383 ms
Connection:              1,259 ms
SQL:                       293 ms
JDBC row read:               6 ms
Server total:            1,575 ms
```

This removed the dominant 42-second JDBC traversal from that experiment. It did not make the complete browser-visible request equal to the SQL time: several seconds remained between the server handler and the browser showing the response.

### Stage 3: bound the visible dropdown and make searching local

The dropdown retained the full accepted 769-product catalog in memory but initially rendered at most 100 options. Search narrowed the full loaded catalog locally, while the UI reported how many items matched and how many were visible. A run reported approximately 6.1 seconds until the update appeared, with about 1.6 seconds in the server handler and roughly 1 ms preparing the browser options.

A later ID-ascending/search run varied to about 9.2 seconds of RPC time while the measured database phases remained around 1.5 seconds in total. This showed that changing local sort behavior does not fix time spent outside local filtering/rendering. Further runs reported approximately 6.9–7.1 seconds for a MySQL update, with search and option rendering taking only a few milliseconds.

The practical improvement for repeat use came from keeping a browser copy. The dropdown could display that copy in 3–9 ms while a refresh was not needed. A separate “search inside the dropdown” field removed the need for a second search box or an RPC on each keystroke.

### Stage 4: test a complete table view

The isolated table experiment returned 784 rows and 17 columns, including rows that the ordinary product dropdown excluded as soft-deleted. The report was:

```text
Table rows:                              784
Columns:                                  17
Row JSON payload:                   322,093 bytes
Browser cache table paint:                37 ms
Until updated MySQL table was visible:  9,473 ms
Browser RPC:                            9,447 ms
Client preparation/render:                 4 ms
MySQL connection:                       1,540 ms
SQL:                                      788 ms
JDBC result reading:                      189 ms
Server JSON parse/map:                      3 ms
Server handler total:                    3,681 ms
```

That experiment established that a bounded table can be searched and paged locally. It was not the normal `tc_products_live` route and its row count, inclusion of deleted rows, field count, and cache key must not be confused with the current page.

### Stage 5: timeouts showed the need to separate client and server clocks

Some requests displayed `RPC_TIMEOUT` after roughly 30,010–30,012 ms, with no MySQL phase measurements. That status means the browser did not receive a successful action response before its coordinator timeout. It does **not** establish that MySQL ran for 30 seconds. A server request that finishes after the client timeout may have no metrics rendered by that attempt, and a client timeout cannot cancel a JDBC request already running in Apps Script.

The pages now keep a previously loaded catalog/table visible during a refresh when a usable browser copy exists. On a cold request, the UI can show the request waiting and coordinator active/pending counts. These help identify a stalled RPC or queue but do not replace server-side phase timings.

### Stage 6: measurements from the two real pages

After applying the aggregate response concepts to the production page actions, the user supplied these measurements.

#### Products Live table

```text
Rows returned:                    769 / 769
Columns returned:                      18
Row JSON payload:                 202,306 bytes
Browser RPC:                         10,367 ms
Client row preparation:                   2 ms
Table render:                              7 ms
Until visible:                        10,378 ms
MySQL connection:                     1,443 ms
SQL execution:                        1,447 ms
JDBC result reading:                    132 ms
Server JSON parse:                         3 ms
mysqlRead elapsed:                    4,840 ms
JDBC ResultSet next() calls:                2
```

The RPC duration minus `mysqlRead` elapsed is about **5,527 ms**. That difference is time outside the named MySQL read wrapper, such as action dispatch/coordination, response serialization and return/decoding. It is not a direct network-only measurement.

#### Stock Scan product dropdown

```text
Catalog products:                    769
Matches in that search:                12
Visible options:                       12
Catalog JSON payload:              63,167 bytes
Browser RPC:                          7,639 ms
Client catalog validation:                2 ms
Local search:                              0 ms
Result render:                            1 ms
Until visible:                        7,646 ms
MySQL connection:                    1,241 ms
SQL execution:                         297 ms
JDBC result reading:                    10 ms
Server JSON parse:                        2 ms
mysqlRead elapsed:                   2,056 ms
JDBC ResultSet next() calls:               1
```

The RPC duration minus `mysqlRead` elapsed is about **5,583 ms**. As with the table, that is work and waiting outside the named MySQL wrapper, not proven network latency. The dropdown returned four fields per eligible product; it was about 63 KB versus about 202 KB for the 18-column table response.

The user judged these response times acceptable from a normal-use perspective. Repeat use should be much faster when the browser cache is fresh. Forced refresh timing remains useful for diagnosing cold-path changes.

### Stage 7: a query round-trip reduction still needs measurement

After the measurements above, the current local source was adjusted so the `loadAll` Products Live aggregate query returns both the total eligible count and the bounded row JSON in one aggregate SQL result. The server still runs a `LIMIT 0` metadata query to learn the selected column names safely, then runs the count-plus-rows aggregate query. Thus there is one metadata query and one combined data query, instead of a separate count data query plus row data query.

The source expects this to reduce JDBC result-set work for the normal full-load request; the previous user-provided measurement (two JDBC `next()` calls) predates this change. **Do not claim the combined count optimization improved end-to-end time until it has a fresh measurement from the corresponding test version.**

### Stage 8: the Financial Ratios report exposed row-reading and all-or-nothing rendering costs

The Financial Ratios page initially waited for eight independent RPCs before drawing any report section. Its first measured report took 46,050 ms to appear, even though drawing all sections took 8 ms. The production and used-materials snapshots also traversed grouped MySQL rows one JDBC value at a time. The detailed baseline, JSON aggregate change, later timings, and progressive rendering results are recorded in Section 4 below.

---

## 4. Financial Ratios: optimize data transfer and show completed sections early

This is a separate case study from the products table and picker. It shows that the same general rule—measure SQL, JDBC, RPC, parsing, and rendering independently—also applies to a multi-section report. The page action is `tc_financial_ratios`; normal report data remains permission-checked, while performance measurements and the SQL plan control are available only to the super admin.

### 4.1 The original report waited for all eight requests

On each report load, the browser requested current and comparison periods for sales, other income, and expenses, plus current-period production and used materials: eight RPCs total. `fetchReport()` held a counter at eight and called `renderReport()` only after the last request settled. That made the slowest request determine when *any* part of the report appeared.

The first super-admin timing report showed:

```text
Report until visible: 46,050 ms
Render all report sections:      8 ms
```

Rendering was not the problem. Most amount and account requests returned in roughly 7–8 seconds of RPC time, but production took 19,005 ms and materials took 46,040 ms. The report therefore hid useful results while waiting for two slower aggregates.

### 4.2 Baseline: many JDBC reads dominated the two snapshots

The slow production and material calls broke down as follows:

| Snapshot | RPC | MySQL read wrapper | Connection | SQL | JDBC reading | JDBC rows |
|---|---:|---:|---:|---:|---:|---:|
| Production | 19,005 ms | 14,010 ms | 1,299 ms | 266 ms | 11,535 ms | 98 |
| Used materials | 46,040 ms | 39,986 ms | 1,259 ms | 7,201 ms | 30,613 ms | 200 |

Other report calls were much smaller in SQL and JDBC work. For example, sales, income, and expense SQL phases were mostly around 288–442 ms, while each had between 8 and 33 JDBC result rows. This pointed to the two snapshot row mappers as the first safe optimization target. The browser's 8 ms section-render timer independently ruled out DOM painting as the cause of the 46-second wait.

Full baseline request sample (the RPCs ran in parallel; the report's completion time is governed by the slowest required response, not the sum of these rows):

| Request | RPC | MySQL | Connection | SQL | JDBC read | JDBC rows | Result rows / bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sales — current | 8,050 ms | 3,027 ms | 1,420 ms | 395 ms | 786 ms | 10 | — / 1,214 B |
| Sales — comparison | 8,150 ms | 3,183 ms | 1,379 ms | 442 ms | 934 ms | 10 | — / 1,201 B |
| Other income — current | 7,033 ms | 2,122 ms | 1,348 ms | 304 ms | 244 ms | 9 | 1 / 729 B |
| Other income — comparison | 7,845 ms | 2,887 ms | 1,507 ms | 393 ms | 635 ms | 8 | 1 / 683 B |
| Expenses — current | 7,845 ms | 3,139 ms | 1,267 ms | 290 ms | 1,327 ms | 33 | 24 / 3,565 B |
| Expenses — comparison | 7,433 ms | 2,935 ms | 1,313 ms | 288 ms | 1,053 ms | 31 | 22 / 3,318 B |
| Production — current | 19,005 ms | 14,010 ms | 1,299 ms | 266 ms | 11,535 ms | 98 | 30 / 3,696 B |
| Used materials — current | 46,040 ms | 39,986 ms | 1,259 ms | 7,201 ms | 30,613 ms | 200 | 30 / 5,582 B |

`MySQL` in this and the following tables means the named `_mysql.elapsed_ms` wrapper. Result rows/bytes describe the action response; `JDBC rows` describes ResultSet reads and can be one even when the page receives 30 grouped products inside a JSON value.

### 4.3 Change: return each bounded snapshot as one JSON row

Both snapshots now ask MySQL to construct the ordered bounded result as `JSON_ARRAYAGG(JSON_OBJECT(...))`. Apps Script reads one JDBC result row, parses the JSON once, and maps the fields. The aggregate carries a row rank because MySQL does not promise that `JSON_ARRAYAGG` preserves the input order; Apps Script sorts by that rank before paging.

The production snapshot now derives the exact number of grouped products with `COUNT(*) OVER()` in the same grouped query. This removes its former separate `COUNT(DISTINCT ...)` query. The used-materials snapshot retains its total count window and the same bounded 2,001-row fetch used to keep the 2,000-row cache snapshot's `truncated` flag accurate. Both continue to return 30 rows per report page and cache a successful snapshot for 120 seconds.

The aggregate optimization preserves the report's business rules:

- Production includes active (`deleted_at IS NULL`), delivered headers in the selected creation-date range, groups by product ID, takes the same maximum Arabic name, sums expected and delivered quantities, and orders by delivered quantity descending then ID ascending.
- Used materials continue reading `manufacture_report_view` ingredient rows (`sort_order = 3`) joined to delivered, active headers in the selected creation-date range and to `products` for names and category exclusions.
- Used-material rows still group by the numeric ingredient product ID. The assumed quantity still uses the validated delivery ratio when positive, otherwise the validated delivery quantity, and rounds away from zero to an integer. Actual used quantity still comes from numeric `col7_manuf_num` values. Difference, percentage (null for a zero assumed amount), stable sorting, the 2,000-row snapshot cap, and 30-row pages are unchanged.
- IDs are cast to text in JSON so JavaScript does not round a large integer identifier. Decimal quantities become JavaScript numbers at the same point they did in the earlier JDBC mapping.

Definition versions for both MySQL snapshot cache entries were bumped when the result implementation changed. This prevents a cache entry written by the older mapping from being treated as current.

### 4.4 Snapshot results after JSON aggregation

The first user test after the aggregate change reported:

| Measure | Before | After JSON aggregate |
|---|---:|---:|
| Report until complete/visible | 46,050 ms | 15,919 ms |
| Production RPC | 19,005 ms | 7,548 ms |
| Production JDBC reading | 11,535 ms across 98 rows | 51 ms across 1 row |
| Materials RPC | 46,040 ms | 15,908 ms |
| Materials MySQL read wrapper | 39,986 ms | 10,510 ms |
| Materials SQL | 7,201 ms | 7,546 ms |
| Materials JDBC reading | 30,613 ms across 200 rows | 186 ms across 1 row |

The report completion time fell by about 65%. Used-material JDBC reading fell by more than 99%, and the MySQL wrapper time fell by about 74%. SQL rose by 345 ms (about 5%) as MySQL also built the JSON result. This is a good trade in this measurement: the total MySQL work fell by about 29.5 seconds even after JSON construction.

Full request sample after JSON aggregation, before progressive rendering was measured:

| Request | RPC | MySQL | Connection | SQL | JDBC read | JSON | JDBC rows | Result rows / bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Expenses — current | 7,547 ms | 2,655 ms | 1,348 ms | 298 ms | 776 ms | 0 ms | 33 | 24 / 3,564 B |
| Production — current | 7,548 ms | 2,328 ms | 1,315 ms | 152 ms | 51 ms | 0 ms | 1 | 30 / 3,691 B |
| Expenses — comparison | 7,647 ms | 3,963 ms | 1,375 ms | 350 ms | 1,855 ms | 0 ms | 31 | 22 / 3,318 B |
| Sales — comparison | 8,011 ms | 2,887 ms | 1,382 ms | 333 ms | 716 ms | 0 ms | 10 | — / 1,201 B |
| Other income — current | 8,162 ms | 2,348 ms | 1,390 ms | 377 ms | 389 ms | 0 ms | 9 | 1 / 729 B |
| Other income — comparison | 8,207 ms | 3,042 ms | 1,453 ms | 416 ms | 727 ms | 0 ms | 8 | 1 / 683 B |
| Sales — current | 11,414 ms | 2,375 ms | 1,362 ms | 385 ms | 318 ms | 0 ms | 10 | — / 1,214 B |
| Used materials — current | 15,908 ms | 10,510 ms | 1,519 ms | 7,546 ms | 186 ms | 1 ms | 1 | 30 / 5,578 B |

The next test was similar: the materials RPC took 14,768 ms, the MySQL wrapper 9,175 ms, SQL 7,139 ms, and JDBC reading 39 ms for one JDBC row. Production used one JDBC row and took 7,454 ms of RPC. One comparison-expense request was an outlier at 13,373 ms RPC and 3,976 ms JDBC reading across 31 rows; this reminds us that the other sections can still vary and that the report is made of independent requests.

### 4.5 Change: render each section as its dependencies arrive

The page now invokes the report renderer as each request settles. It leaves unresolved sections in their loading state, paints a section once its required data is ready, and shows an error only when the whole request set finishes without the data that section needs. This allows production, sales, income, or expenses to appear while the used-material query is still running.

The super-admin timing panel now distinguishes the time to first report data from full report completion. The latest user-supplied run was:

```text
First appearance:                 6,709 ms
Report complete:                 14,773 ms
Total report-section render work:    11 ms
```

The user-visible first-data time is now less than half of the full completion wait in that run. This does not make the last materials section finish sooner; it stops that section from holding the rest of the report behind a blank/unfinished page. The small render duration again confirms that data arrival, not browser rendering, controls the wait.

Full request sample from the latest run (the order below is response order, not start order):

| Request | RPC | MySQL | Connection | SQL | JDBC read | JDBC rows | Result rows / bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Expenses — current | 6,707 ms | 1,901 ms | 1,311 ms | 310 ms | 187 ms | 33 | 24 / 3,564 B |
| Other income — comparison | 6,980 ms | 2,185 ms | 1,294 ms | 274 ms | 333 ms | 8 | 1 / 683 B |
| Production — current | 7,454 ms | 2,017 ms | 1,237 ms | 136 ms | 10 ms | 1 | 30 / 3,691 B |
| Sales — current | 7,743 ms | 2,447 ms | 1,337 ms | 497 ms | 338 ms | 10 | — / 1,214 B |
| Other income — current | 7,834 ms | 2,309 ms | 1,316 ms | 480 ms | 256 ms | 9 | 1 / 729 B |
| Sales — comparison | 8,457 ms | 3,584 ms | 1,480 ms | 462 ms | 1,080 ms | 10 | — / 1,202 B |
| Expenses — comparison | 13,373 ms | 6,597 ms | 1,509 ms | 431 ms | 3,976 ms | 31 | 22 / 3,318 B |
| Used materials — current | 14,768 ms | 9,175 ms | 1,251 ms | 7,139 ms | 39 ms | 1 | 30 / 5,576 B |

Do not compare “first appearance” with the old all-or-nothing “until visible” timer as though they measured the same event. Record both first appearance and full completion on future runs.

### 4.6 Current bottleneck and how to investigate it safely

After JDBC traversal was removed, used-material SQL still took 7,139 ms in the latest run. Connection time was 1,251 ms, JDBC reading 39 ms, and browser section drawing remained only milliseconds. The SQL stage is therefore the next database target. The query's use of `manufacture_report_view`, a cast on the header ID join, a cast on ingredient product IDs, and regular-expression/decimal validation are candidate costs, but the timing report alone does not tell us which one dominates.

The current workspace adds a button visible only to the super admin: **تحليل خطة SQL للمواد المستخدمة**. It requests `EXPLAIN FORMAT=JSON` for the same server-built, parameterized snapshot SQL without running the full report query a second time. The action also checks `user.isSuperAdmin` on the server. Use that plan to inspect access paths, estimated rows, view materialization, and where predicates are applied before changing the join, removing validation, or adding database indexes.

No EXPLAIN plan was included in the latest timing report. Until that plan and the view/index definitions are reviewed, do not claim the MySQL connector is faulty or make a schema/index change based solely on the 7.1-second SQL timer. If the plan shows a large scan/materialized view, optimize the source path or indexes; if it shows a good narrow access path, inspect type conversions and aggregation cost while preserving the report's exact numeric rules.

### 4.7 Reading page-two snapshot timings

The latest report also included:

```text
Production page 2: RPC 4,267 ms; MySQL wrapper 448 ms; connection/SQL/JDBC: 0 ms; JDBC rows: 0
Materials page 2:  RPC 4,441 ms; MySQL wrapper 412 ms; connection/SQL/JDBC: 0 ms; JDBC rows: 0
```

This is consistent with the page handlers slicing a previously cached 120-second snapshot: no connection or SQL was needed, and the 30 rows were already present in memory. The displayed cache field currently describes the outer, zero-TTL page read (`cache: no`) and does not expose the nested snapshot read's cache-hit flag. Thus `cache: no` beside zero connection, SQL, and JDBC work does **not** prove the 120-second snapshot missed. If these measurements are used to compare nested cache hits, carry the snapshot-level `_mysql` result through the page response in an admin-only field or label the two cache layers separately.

The 4.3–4.4 second page-two RPC with under half a second in the MySQL wrapper also illustrates the existing timing caveat: RPC minus the named MySQL wrapper is outside that measurement boundary, but it is not proven network-only time.

### 4.8 Source and release notes

| Concern | Current source |
|---|---|
| Financial report SQL, snapshot JSON, row-rank restoration, and admin-only SQL plan action | `Company_TopChemical_Actions.js`: `dbTcFinancialProductionSnapshot_`, `dbTcFinancialUsedMaterialsSnapshotSql_`, `dbTcFinancialUsedMaterialsSnapshot_`, `dbTcFinancialUsedMaterialsPlan_` |
| Progressive report rendering and first-appearance/completion measurements | `Company_TopChemical_FinancialRatios.html`: `fetchReport`, `renderReport`, and `frRenderMeasurement_` |
| MySQL JDBC and cache phase timing | `Code.js`: `mysqlWithRequest_`, `mysqlRead_`, `mysqlConnection_`, and JDBC resource wrappers |

The user supplied the timings from test deployments. The agent has not deployed or pushed these Apps Script changes. The EXPLAIN plan needs to be captured from the current build before the next SQL change is chosen.

---

## 5. Current request path shared by the product pages

The route follows the existing authenticated company-action infrastructure. The database connector does not accept SQL from the browser.

1. The page calls `companyCall(...)`, which invokes the company action through `API.call('company_action', ...)` for the Top Chemical company.
2. The action name is checked against `PAGE_ACCESS`. `get_products_live` is a `tc_products_live/read` action; `get_stock_scan_catalog` is a `tc_stock_scan/read` action. They have separate grants even though both read `mysql:products`.
3. The same action is mapped to `mysql:products` in the data-source registry and is registered with the Top Chemical dispatcher.
4. The handler calls `mysqlRead_` with a server-owned definition. It normalizes parameters, repeats the page permission check before cache access, constructs a cache key scoped to the database, company/action, user authority, definition version/dependencies, invalidation epoch, and normalized parameters, and validates cached or newly returned data.
5. On a cache miss/forced refresh, the page-specific server function uses the shared connector. `mysqlConnection_` lazily opens one JDBC connection for the MySQL request; wrapper-managed JDBC operations collect connection, SQL, result-read, JSON-parse, and row-call timing. Resources are closed by their owner in `finally`.
6. The response returns to the page. The browser records the RPC wall time, validates/maps the response, updates its local cache, and renders the table or dropdown.

Current server-side cache definitions in `mysqlTcDefinition_`:

| Read | Definition | Server TTL | Version in current source |
|---|---|---:|---:|
| Products Live list | `tc.dbProductsLiveList_` | 90 sec | 5 |
| Stock Scan catalog | `tc.dbStockScanCatalog_` | 30 sec | 1 |

The `refresh: true` input bypasses the server MySQL cache. Successful application SQL writes bump the shared MySQL invalidation epoch. External writes that do not pass through the application become visible after cache expiry or a deliberate refresh.

### Source map

| Concern | Current source |
|---|---|
| MySQL request timing, cache, connection reuse, JDBC wrappers | `Code.js`: `mysqlWithRequest_`, `mysqlRead_`, `mysqlStatement_`, and `mysqlConnection_` |
| Named Top Chemical cache contracts and input normalization | `Company_TopChemical_Actions.js`: `mysqlTcDefinition_` |
| Product table SQL and JSON row aggregate | `Company_TopChemical_Actions.js`: `dbProductsLiveList_` and `getProductsLive_` |
| Stock Scan compact catalog SQL/JSON aggregate | `Company_TopChemical_Actions.js`: `dbStockScanCatalog_` and `getStockScanCatalog_` |
| Products Live browser cache, load, measurements, and table mapping | `Company_TopChemical_ProductsLive.html`: `load`, `plReadCache_`, `fetchData`, `renderPlMeasurement`, `mapProductRow`, `renderPlTable` |
| Stock Scan browser cache, local filter, picker, and measurements | `Company_TopChemical_StockScan.html`: `ensureScanCatalog`, `acceptScanCatalog`, `filterScanCatalog`, `applyCatalogQuery`, `renderProductResults`, `renderScanCatalogMetrics_` |
| Shared table 50-row display pager and search/sort pipeline | `UI_Components.html`: `UIC.dataTable` and pager helpers |
| Reusable module recipe and future shared picker design | `MySQL_Dropdown_Module_Guide.md` |

The metrics currently label one duration **“MySQL إجمالاً”**. In code, this is `mysqlRead_` elapsed time, not a database-only duration. It includes the named read adapter and its measured phases. Use the separate `SQL`, `connection`, `JDBC read`, and `JSON parse` numbers when diagnosing the connector or query.

---

## 6. How `action=tc_products_live` displays its table

### 6.1 Page and action

- Page: `Company_TopChemical_ProductsLive.html`.
- Read action: `get_products_live`.
- Read permission: `tc_products_live/read`.
- Write actions remain page-specific: add, save/edit, and soft-delete all check their existing write grant. A shared table widget does not grant any data or mutation permission.
- Data source: MySQL `products` joined to `product_current_quantity` for the live quantity projection.

### 6.2 Server query and result contract

The first-load client request sends `{ loadAll: true }`. The server keeps the existing caps:

- Full-load maximum: **1,000 rows**.
- Ordinary page request maximum: **200 rows**.
- Soft-deleted products are excluded with `products.deleted_at IS NULL`.
- Product IDs are ordered descending for the full table response.
- The joined view contributes `live_quantity` without replacing the stored product fields.
- `has_more` reports whether a full-load result was capped; a capped table must not be described as containing every product.

For the full-load path, the server first obtains the selected-column metadata using a fixed `products` query with `LIMIT 0`; this returns no product records. It validates each column label against a restricted identifier pattern before placing the label in the generated JSON projection. It then constructs server-owned `JSON_OBJECT` pairs for the selected product columns and wraps them in `JSON_ARRAYAGG`. Non-null values are cast to character strings, and SQL null remains JSON null, so large integer keys and decimal text are not rounded by JavaScript number conversion.

The aggregate query selects only the bounded rows in a subquery, joins the current quantity view, and produces the row count and JSON array. The array is parsed and checked on Apps Script: it must be an array, its length must agree with the aggregate row count, and it cannot exceed the configured limit. Apps Script maps each property to string/null and sorts IDs descending because JSON aggregation order is not guaranteed. It returns `{ status, columns, rows, total, limit, offset, loadedAll, search, search_mode, has_more, next_cursor }` as applicable.

Filtered and cursor-paged requests continue through the regular JDBC row mapper. The JSON aggregate is used only for the initial unfiltered `loadAll` path, not as a reason to weaken bounds on arbitrary client queries.

### 6.3 Browser warm start and freshness

The browser stores the last successful list as JSON in `localStorage`. Its key is scoped to the Top Chemical company, `tc_products_live`, cache schema `v1`, and the authenticated user's normalized email. The saved shape contains `savedAt`, returned columns, rows, total, and `has_more`.

On page load:

1. The page builds the normal ERP app shell and table placeholder.
2. If a structurally valid saved result exists, it maps/sorts and displays that result immediately.
3. A result younger than **60 seconds** is considered fresh; page load returns without issuing another products RPC.
4. An older valid result remains visible while `get_products_live` reloads from MySQL in the background.
5. If refresh fails, the already visible rows are kept. A waiting/error measurement is shown rather than replacing usable cached data with a blank table.

There is no maximum age check for the current Products Live cache reader: a valid older saved copy may be shown while the refresh is attempted. This is an availability strategy, so a long outage can leave stale data visible. Mutations on this page force a refreshed list after success. The cache is an acceleration layer, never authorization; every fresh server request still goes through current grants.

For one-time migration, the page can read the earlier direct table experiment cache if it has a `deleted_at` column, then filters soft-deleted rows before adopting it. This migration path should not be copied as a general cross-page cache dependency.

### 6.4 Shared table rendering and local interaction

The page passes mapped rows to `UIC.dataTable('pl-table', ...)`, the shared ERP table component. Its 13 visible columns are:

1. Product ID (`#`)
2. Category ID
3. Client ID
4. Arabic name
5. English name
6. Code
7. Price
8. Unit
9. Current quantity
10. Number of cartons/bags
11. Number of small boxes
12. Product unit metric
13. Actions

Although the data response carries 18 columns in the user's measured deployment, the table view is curated; operational/internal fields such as `active`, manufacturing ID, timestamps, and `deleted_at` are omitted from table rows. They can still be shown in the page's read-only details flow where applicable. Database text is escaped before becoming any formatted HTML cell content.

The shared table performs global text search and sorting over the loaded rows. Its display pagination shows 50 rows at a time. Searching, sorting, and changing display pages do not send a MySQL request. The table `onRendered` callback completes the paint measurement after the shared component has finished rendering.

The user-visible “قياس تحديث MySQL” button forces a fresh read so the cold/refresh path can be measured separately from a warm browser-cache paint. Add/edit/soft-delete remain normal business actions and trigger a fresh read on success. The full table is not a generic CRUD layer: column editability, ID immutability, live quantity, and soft-delete behavior stay in this page's existing forms and action handlers.

---

## 7. How `action=tc_stock_scan` loads and searches the dropdown

### 7.1 Page and action

- Page: `Company_TopChemical_StockScan.html`.
- Catalog action: `get_stock_scan_catalog`.
- Read permission: `tc_stock_scan/read`.
- Data source: MySQL `products`.
- Local-catalog mode is enabled by `SCAN_LOCAL_CATALOG_ENABLED`.

The page starts the warehouse load and product catalog load independently. It paints the count form and dropdown states without waiting for unrelated stock-history data; the history read is scheduled after the initial controls get a browser paint.

### 7.2 Compact server catalog

The fixed SQL projection contains only:

| Returned key | MySQL field | Reason |
|---|---|---|
| `id` | `products.id` | Stable selected value, kept as a string |
| `name_ar` | `products.name_ar` | Product label and local Arabic search |
| `code` | `products.code` | Shown beside the result and kept with selection |
| `per_unit` | `products.number_of_cartons_bags` | Count form needs the quantity-per-unit value after selection |

Rows with `deleted_at IS NOT NULL` are excluded. SQL orders eligible products by Arabic name and ID before aggregation; the browser then normalizes the accepted list into numeric ID ascending order using string-safe comparison. The complete catalog is selected into one JSON aggregate result, so the JDBC result set contains one aggregate row rather than one JDBC result row per product.

The catalog has an explicit completeness contract:

- Hard maximum: **2,000 eligible rows**. SQL reads a bounded 2,001-row candidate set to detect row overflow.
- Maximum JSON catalog payload: **262,144 bytes (256 KiB)**.
- Malformed IDs, an invalid JSON array/count, row overflow, or byte overflow do not masquerade as a complete list. The endpoint returns an overflow/failure shape and the client can enter its bounded server-search fallback.
- The response carries `schema_version`, `products`, `count`, `complete`, `overflow`, `reason`, and `payload_bytes`; the catalog action also adds `served_at` and `catalog_ttl_ms` metadata.

IDs and per-unit values are strings. The browser validates the schema and count before it considers the catalog ready, then builds `byId` for direct selection lookups.

### 7.3 Search inside the dropdown

The normal path makes one catalog call, not one request for every typed character. `filterScanCatalog` scans the complete accepted in-memory set and retains the true total match count, while only the first **100** options are rendered.

The default name search normalizes Arabic text by removing harakat/tatweel and normalizing common alef/yaa variants before matching substrings; it also lets typed text match a substring of the ID. The filtering helper supports a separate exact-ID mode, which is used by the server-search fallback when the query is a valid numeric ID. Duplicate names are retained as separate products because their IDs differ. The selected result holds ID, label, code, and per-unit quantity, avoiding a second product lookup after selection.

The visible control is a button labelled “اختيار صنف”. Opening it reveals a search input inside the dropdown (“ابحث باسم الصنف أو رقمه...”) and a scrollable list capped at 260 px high. Each option shows the Arabic name, `#id`, and code when present. The result-count hint says when fewer than all matches are rendered. Escape closes the list; Arrow Down from the search field moves focus to the first option; clicking outside closes it. The committed button label becomes the selected ID and product name. The browser escapes database-sourced labels/codes before placing them into option markup.

Search typing, opening the dropdown, sorting the complete in-memory catalog, and displaying up to 100 options do not make a MySQL RPC while a valid catalog is loaded. If the complete catalog cannot be accepted, the page uses its existing bounded server-search path; that is a deliberate fallback, not the normal path.

### 7.4 Browser and server cache behavior

The Stock Scan browser key includes company, page, products schema version, and the authenticated user's email. It uses:

- **60 seconds fresh:** if the in-memory/localStorage catalog is fresh, use it without a catalog RPC.
- **Up to 10 minutes stale:** install and display the saved catalog immediately, while starting a background MySQL refresh.
- **Older than 10 minutes or invalid:** do not treat it as an acceptable saved catalog; start the normal load/fallback path.
- **Storage failure:** ignore the cache write/read problem and keep the network-backed picker available.

The server `mysqlRead_` cache TTL is 30 seconds. Forced refresh bypasses the browser shortcut and named MySQL read cache for a measurement. If a background refresh fails while a usable catalog is already displayed, the page keeps that catalog available and shows that refresh failed.

During the transition from the isolated experiment, Stock Scan also knows how to project an eligible compact catalog out of the old direct-test browser cache. This one-time compatibility path filters deleted rows and enforces its own age and schema checks. New pages should own their cache contract or use a shared catalog service; they should not depend on another page's private localStorage key.

---

## 8. What each timing field actually means

The page metrics are intentionally split. Reading them as if every number were a MySQL query duration leads to the wrong optimization.

| Field | Clock boundary | How to interpret it |
|---|---|---|
| Browser cache paint / read-and-display cache | Browser localStorage read through painting the saved result | Perceived warm-start speed. It says nothing about MySQL speed. |
| `RPC` | Just before `companyCall`/`API.call` through fulfillment/rejection in the page | End-to-end action request wall time as observed in the browser. It includes dispatch/coordination, server work, response construction/serialization, and return/decoding. It is not network-only. |
| Product page until visible | Start of request to the table's rendered callback or product catalog paint | User-facing cold/refresh completion for `tc_products_live` or `tc_stock_scan`, including browser preparation and paint. |
| Financial report first appearance | Start of the eight-request report load through the first successful section's synchronous render | Time until any report data becomes available. It is shorter than full completion after progressive rendering was added. |
| Financial report completion | Start of the eight-request report load through the last required response and final section render | Time until every requested section has either rendered or reached its final error state. Record this alongside first appearance. |
| Financial report section-render total | Sum of synchronous browser render durations as report responses settle | Cumulative section painting work. It can include several short incremental renders; it is not elapsed report time. |
| Client preparation / catalog acceptance | Response arrived to mapped/validated client data | Cost of local response mapping and schema acceptance. |
| Local search | Filtering the full catalog for the current query | Should remain small; if it grows materially, reconsider catalog size and matching strategy. |
| Table/result render | DOM construction and shared table rendering, measured around the render callback | Client rendering cost; does not include the RPC. |
| MySQL connection | Time for the shared wrapper to obtain its JDBC connection | Connector startup/acquisition phase; distinct from executing SQL. |
| SQL | Time spent in wrapped JDBC `executeQuery()` calls | Statement execution time as seen by JDBC, including the fixed metadata read and aggregate statement for the table. It is not necessarily the database server's internal execution-plan time. |
| JDBC read | Time spent in wrapped result-set operations such as `next()` and getters | Apps Script/JDBC result consumption. Aggregation reduces the product set to one result row to read. |
| `rows JDBC` | Number of successful `ResultSet.next()` calls through the wrapper | This is not the number of products loaded. Products can all be inside one JSON value. |
| Server JSON parse | Apps Script parsing/mapping the SQL-generated JSON aggregate | CPU and object-construction cost after the aggregate string is read. |
| “MySQL إجمالاً” / `_mysql.elapsed_ms` | Named `mysqlRead_` wrapper duration | Server-side named read duration including setup, adapter execution, parse/map, validation/cache work. It is not pure SQL time. |
| `RPC - _mysql.elapsed_ms` | Difference between browser RPC and the named MySQL wrapper | Time outside the named read wrapper. It can include action/router/coordinator work and response serialization/return. It should not be called network delay without a separate trace. |
| Payload bytes | UTF-8 size of the rows/catalog JSON content measured by the page | Helps compare different data shapes. It does not necessarily equal the complete RPC wire envelope. |
| Active/pending coordinator requests | Browser coordinator snapshot during a wait | Helps reveal client request congestion. A zero count after timeout is not evidence that a server request was cancelled. |

For a fair comparison, record the exact page version, deployment/environment, cache state, whether the refresh was forced, row/option count, columns/fields, payload bytes, and all phase times. A single sample is not a latency distribution.

---

## 9. Product table and picker timings: what the successful numbers mean

From the user's perspective, the two product pages now have a fast repeat path and a measurable cold/refresh path. A warm local copy paints in a few milliseconds; this was the reason to use stale-while-refresh for the picker and fresh-browser short-circuiting for the table. The Financial Ratios page is a different pattern: its measurements now separate first section appearance from full report completion, and its 120-second server snapshot cache supports later page turns.

On a forced refresh, the 202 KB table response took about 10.4 seconds end-to-end, and the 63 KB dropdown catalog took about 7.6 seconds. Their local preparation and rendering were only 0–9 ms. Therefore, additional browser DOM tuning is unlikely to remove several seconds from these measured refreshes.

The reported named MySQL read elapsed was about 4.8 seconds for the table and 2.1 seconds for the dropdown. About 5.5 seconds of each RPC was outside that wrapper. Connection and SQL were also visible costs inside the wrapper. This leaves multiple future investigation points:

1. Compare cold requests after the current combined count/list SQL change, with a forced refresh and no overlapping requests.
2. Capture server action entry/exit around dispatcher and response serialization if the RPC-minus-wrapper gap remains large.
3. Separate true first connection from warmed connector/request behavior, and inspect connector timing logs without exposing credentials or search data.
4. Check query plans and schema indexes only after observing a stable SQL phase that points to query execution. Do not add an index based solely on a long RPC timer.
5. Track repeated observations (median and tail percentiles) across the actual user network/browser/deployment. Do not compare the 784-row, 17-column historical test directly with the 769-row, 18-column current table.

The connector may still be part of cold-load latency because connection acquisition is measurable. The supplied timing reports do not show that the connector is misconfigured or that MySQL query execution is the sole cause. Diagnose from the phase that is actually high.

---

## 10. Replication pattern for another MySQL table

Use the following process as a page-specific implementation recipe. The table name, fields, authorization, and completeness promise must be decided for each destination page.

### Step 1: write down the data contract

Record:

- Page/action and independent `read` permission.
- Fixed table or view and stable primary key.
- User-visible purpose: picker, small browse table, or large searchable dataset.
- Eligible-row predicate (for example, whether deleted/inactive rows are excluded).
- Exact output fields and why the client needs each field.
- Expected/maximum row count and maximum UTF-8 bytes.
- Whether a complete set is required for local search.
- Whether any fields are sensitive or should not be cached in the browser.
- Selected value that the eventual save action must receive.

Do not copy `products.*` into a picker. Start with the smallest projection that satisfies the form.

### Step 2: select preload or server-side search

Preload a complete catalog when its authorized eligible set is small, bounded, and useful to search instantly. Return an explicit overflow response when the set exceeds its row or byte ceiling. For a larger or context-specific table, keep search and pagination on the server with indexed predicates, prepared values, and bounded result pages.

Do not fetch the first N rows and silently label the result complete. Local global search is global only within the complete accepted set.

### Step 3: implement the named server read

Follow the existing company action flow:

1. Add a dedicated `PAGE_ACCESS` grant for the destination page/action.
2. Add the fixed MySQL source mapping and register the company action.
3. Define a named `mysqlRead_` contract with normalization, definition version, dependencies, TTL, row/byte validation, and authorization on cache hit as well as miss.
4. Keep table names, columns, sort order, predicates, and SQL expressions on the server. Never accept client-supplied SQL, table names, or arbitrary identifiers.
5. Use prepared statement parameters for query values.
6. Keep IDs/precise decimals as strings across JDBC, JSON, and browser code.
7. Consider `JSON_ARRAYAGG(JSON_OBJECT(...))` when instrumentation proves JDBC per-row/per-cell reading is the expensive phase and the actual database supports the JSON functions used.
8. Validate JSON type, count consistency, identifier/value shape, and bounds. Return an explicit complete/overflow state.
9. Close result set and statement in `finally`, and follow the shared connector wrapper's ownership for a borrowed connection.
10. Invalidate/expire cached data after relevant writes. Account for external writes that bypass the application's invalidation epoch.

### Step 4: use the right browser behavior

For a picker:

- Load one compact catalog and search it locally while fresh.
- Keep the committed ID separate from typed query text.
- Preserve duplicate labels with distinct IDs.
- Render a bounded number of results and report the total match count.
- Carry values needed by the form through the selected catalog row to avoid an extra lookup.
- Keep a server-search fallback for overflow, invalid payload, or unavailable catalog.

For a table:

- Use the shared ERP data table when the complete set is intentionally small and bounded.
- Keep the full accepted row array in memory; render only the current display page.
- Search before slicing to a display page so search covers all loaded rows.
- Mark whether the server returned the entire eligible set or hit a cap.
- Curate visible columns separately from detail/edit data. Authorization to read a row does not imply every column should be visible/exportable.
- Keep business writes, validation, and permission checks in the page's existing action path.

### Step 5: add warm-start caching deliberately

Browser caching changes repeat-use perception; it does not accelerate a cache miss. If persistent browser storage is appropriate for the data:

- Scope the key by company, page/action, schema version, and current user identity.
- Validate the saved shape and age before use.
- State the fresh and maximum stale ages explicitly. Decide whether stale data may remain visible after refresh fails.
- Keep forced refresh available for support and measurement.
- Tolerate storage read/write/quota failure.
- Do not treat a browser cache as server authorization.
- Reconcile cache invalidation with add/edit/delete and logout/account changes.

The current Products Live stale cache may be shown without an age ceiling; the current Stock Scan stale catalog has a 10-minute ceiling. Select an explicit policy for each new page instead of copying either value automatically.

### Step 6: measure before changing more layers

Capture at least:

| Case | How to measure |
|---|---|
| Cold browser + forced server refresh | Clear/use a browser with no page cache, call the page action with refresh, record all server phases and RPC. |
| Warm browser result | Reopen within the fresh interval and record cache read/paint. Confirm whether an RPC was skipped. |
| Stale browser result | Reopen after the fresh interval but before stale expiry; record immediate stale paint and background refresh separately. |
| Server cache hit | Make a normal repeat read inside its named server TTL without forcing refresh and check `cache_hit`. |
| Search interaction | Type several queries; confirm zero picker RPCs on the local complete-catalog path and record local filter/render time. |

Always capture payload bytes and the exact row/column shape. If client preparation is milliseconds while RPC is seconds, focus next on connector/server/RPC boundaries. If connection is high, investigate connection acquisition. If SQL is high, investigate the query and plan. If JDBC read is high, reduce round trips or aggregate. If JSON parse is high, reduce fields/bytes or reconsider preload. If rendering is high, narrow the visible set and profile DOM work.

For a multi-section report, also record which requests gate first appearance and which gate final completion. Render independent completed sections as they arrive when that preserves the page's calculations and error handling. If the report includes cached snapshots, expose the snapshot-level cache result separately from the outer page-slicing action; a page action can miss its own cache while reusing a nested snapshot.

---

## 11. Current limits and release boundary

- `tc_products_live` full-load search sees at most 1,000 returned rows. If the eligible product table grows past this, switch to a server search/pagination design or make the cap state unmistakable.
- `tc_products_live` currently requests every product column plus the live quantity projection because details/edit support needs broader data. The view shows only a curated subset. Reconsider whether every returned column is needed before copying this shape to a larger table.
- `tc_stock_scan` is bounded to 2,000 products and 256 KiB. Overflow switches away from complete local-catalog assumptions.
- The dropdown's first paint on a new browser still depends on the server/RPC unless a valid local catalog exists.
- The latest reported timings predate the combined count/list SQL query in the current workspace source. No number for that change is available yet.
- Financial Ratios first appearance was 6,709 ms and full report completion 14,773 ms in the latest supplied run. Used-material SQL still took 7,139 ms, so the first-data improvement does not mean the slowest database query is fixed.
- Page-two production/materials metrics show zero JDBC rows and zero connection/SQL time, consistent with reusing a 120-second snapshot. The current top-level cache flag does not expose the nested snapshot's hit/miss state; interpret it as the page wrapper's cache only.
- A super-admin-only `EXPLAIN FORMAT=JSON` action/button is present in the Financial Ratios workspace source. No plan output has been added to the measurements yet, so no further used-material SQL/index change is documented as proven.
- No fresh production Apps Script deployment is implied by this document. The project instruction is that the most we can do is push; do not deploy the Apps Script online.

## 12. Short lessons to carry forward

1. A quick SQL duration can hide very slow JDBC result traversal.
2. Return one bounded aggregate result when it measurably removes repetitive JDBC reads and the payload remains safe to handle.
3. A dropdown catalog and a full table are different contracts even when they share one source table.
4. Load only authorized, needed fields; keep the database identifiers and SQL server-owned.
5. Search locally only after accepting a complete, bounded result. Keep a truthful overflow/server-search path.
6. Use a same-user browser cache to show useful data immediately, and report warm paint separately from MySQL refresh.
7. A 30-second RPC timeout is not a 30-second MySQL measurement.
8. Read each timer by its actual clock boundary. In particular, RPC minus `mysqlRead_` elapsed is not proven network latency.
9. Product IDs and exact numeric text stay strings end-to-end.
10. Measure the current version after every performance change; historical timing does not prove a later code change is faster.
11. For multi-request reports, measure first appearance and full completion separately; a slow final section should not keep already-ready report sections hidden.
12. One JSON JDBC row removes repeated JDBC traversal, but it does not guarantee a faster SQL plan. Re-measure SQL after aggregation and inspect `EXPLAIN` before changing joins or indexes.
