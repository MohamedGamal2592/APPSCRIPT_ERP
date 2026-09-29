# Fast Read Execution Inventory

**Status:** Local source inventory and rollout record. No production table was read or changed to create this file. The current checkout contains pre-existing edits; this inventory describes the current working files.

## Priority endpoints

| Page / action | Source and identity | Current list behavior | Safe local implementation / remaining gate |
|---|---|---|---|
| `tc_stock_scan` / `get_stock_scan_catalog` | MySQL `products`; string `id` | Bounded JSON aggregate catalog (2,000 row and 256 KiB caps), browser cache, local search over the complete accepted catalog, up to 100 visible options; server search fallback for overflow | Product mutations now remove this user's browser catalog key, and an open Stock Scan tab reacts to that invalidation. Measuring new behavior still requires an authorized non-production run. |
| `tc_products_live` / `get_products_live` | MySQL `products` with quantity view; string `id` descending | Warm browser copy; full response capped at 1,000; shared table search covers loaded rows; add/edit/soft-delete use separate protected actions | The live table now labels its search scope when capped. An opt-in `cursor_json` route and progressive UI candidate are present with the page flag off. The candidate needs isolated response, UI, cache, mutation, and performance validation before activation. |
| `tc_financial_ratios` / report section actions | MySQL financial tables/views; period and section keys | Independent report sections render as their RPCs finish; production and used-material snapshots use bounded JSON aggregation | Preserve this behavior. The used-material SQL phase still needs an EXPLAIN plan before query/index changes. Admin-only diagnostics stay server gated. |
| `VF_MOs` / `get_valley_mfg_orders` | Google Sheets manufacturing header; `id` and `unique_id` | UI requests 100-row pages, while the server reads, maps, sorts, filters, and derives options from the whole header set before paging | `MFG_FAST_READ_` remains off. Its narrow strategy still scans every header row. A genuinely bounded path needs verified row order or an index, plus separate freshness rules for filter options. |
| `VF_MOs` / `save_valley_mfg_order` | Multiple Google Sheets tabs; header and child UUIDs | One browser save request; edits submit only changed sections and reconcile without a full detail reload | Planned-save, form-contract, and fast-save gates are enabled for this page after isolated synthetic checks of create, scoped edits, related-table inserts/deletes, formulas, stock, conflict refusal, retry recovery, and identity mapping. Production latency measurements and a staging comparison remain outstanding; never use production saves as tests. |
| Generic system `query` | Firestore or Sheets repository adapter | Firestore supports cursor queries; Sheets `query` reads and filters the entire tab and returns no cursor | Do not expose Sheets `query` as paged until table-specific order, filter, and row movement rules are defined. No schema or index tabs may be added under the current production restriction. |
| Generic `patchRowByCriteria_` | Google Sheets tab, criteria column | Reads the full tab to locate one row, then preserves formula cells during the patch | Batch by key with one narrow lookup per section when an isolated form parity path is available. The existing fast-save engine remains disabled. |

## Shared UI findings

- `UIC.dataTable` searches the rows already delivered to it. Its DOM renderer processes rows in chunks, but that happens after the source request returns.
- `UIC.PagedTable` issues browser offset/limit requests. It cannot prevent a backend from scanning all rows before returning the requested window.
- The new opt-in `UIC.ProgressiveRows` accepts a versioned cursor response, keeps a complete browser copy visible during refresh, fetches bounded pages sequentially, pauses in hidden tabs, deduplicates by a declared key, and uses server search while hydration is incomplete.
- The loader validates column names, row shape, row identity, cursor continuity, source version, page size, and a caller-set byte budget. The Products Live candidate uses pages of at most 200, a 1,000-row hydration cap, a 512 KiB payload budget, and a 45-second automatic loading budget. Reaching a row or time cap leaves the view explicitly partial; global search still runs on the server for the query. A user can manually resume after the automatic time budget.
- `UIC.ProgressiveRows` has no effect on existing pages until a page opts into it. The Products Live opt-in flag is currently `false`.
- The progressive table explicitly states that Excel and print include only the rows currently loaded into that view.

## Products Live candidate contract

- The active `loadAll` action remains available and unchanged in shape. Its 1,000-row cap is now labeled in the shared table whenever it truncates the result.
- The opt-in `pagination: 'cursor_json'` path reads `products` ordered by numeric `id DESC`, with `deleted_at IS NULL`. The detailed projection includes `products.*` and `product_current_quantity.current_qty AS live_quantity`. This is separate from the small Stock Scan picker projection.
- Search is server-side over Arabic name, English name, code, and textual ID using the existing bound filter; `search_mode` controls exact ID/code or prefix matching. The same filter is applied to the count and page subquery. The server returns up to `limit + 1` rows to establish `has_more`, trims the lookahead row, and validates unique string IDs.
- The versioned page response has `columns`, object `rows`, an exact count for that query, `data_version`, `request_id`, and `page.{limit,has_more,next_cursor,snapshot}`. The continuation token is a web-safe base64 encoding of the last ID, high-water ID, query, and search mode. It is a paging token, **not** a permission token; every action and cache read remains server authorized. The high-water ID excludes later inserts with larger IDs, but it is **not** a transaction snapshot of edits or deletes across separate RPCs. Isolated concurrent-change validation remains required.
- The candidate paints only a complete, user-scoped browser copy that passes shape and age checks, then fetches sequential MySQL pages. While fresh hydration is incomplete, typing issues a bounded server search; once complete, local search covers the full hydrated set. The shared table continues to own sorting and pagination of currently visible rows. A visible label states the loaded count and Excel/print scope.
- Successful add, edit, and soft-delete actions clear the current table cache, the older experimental product cache, and the Stock Scan catalog cache for that user. A Stock Scan tab with the catalog open sees the storage invalidation and refreshes in the background. These are browser-cache invalidations only; no table records were touched during this task.

## Backends that still need separate designs

- `tc_financial_ratios` already makes independent report-section RPCs and renders each as it arrives. Current sections include sales, other income, expenses, production, and used materials. Its JSON snapshots keep expensive row traversal out of the browser path. Preserve section-specific period filters and server-verified admin metrics; do not combine sections behind one completion barrier.
- `VF_MOs` uses Google Sheets headers and child sections with `id`/`unique_id`, status and reference options, ownership/edit-token checks, formula-sensitive fields, and recovery behavior. The current list slices after a whole-header read. It also reads category labels, shift labels/options, recipes, and products to build unfiltered filter options; `product_options` has its own reference cache, but `filter_product_options` still reads the products tab. Its save path touches coupled sheets. The planned-save pilot is enabled only for saves; the fast-read flag stays off. Synthetic checks cover the candidate write/recovery behavior, but production latency and staging comparisons are still outstanding.
- The generic system-table Sheets adapter still reads a full tab before filtering. Firestore has native cursor support. Each Sheets table needs its own stable order, high-water/row-movement rule, search behavior, and export scope before `showAllBar` can be removed.

## Pages using the existing show-all bar

A static source search found **23 page templates** calling `UIC.showAllBar` (plus `UI_Components.html`, where the component is defined). They require an endpoint-by-endpoint read strategy before the control can be retired:

**TopChemical (13):** `Company_TopChemical_Barcode.html`, `Company_TopChemical_BudgetManufacture.html`, `Company_TopChemical_CustomsOffice.html`, `Company_TopChemical_CartonSizes.html`, `Company_TopChemical_ImportFollow.html`, `Company_TopChemical_EmpPermits.html`, `Company_TopChemical_StockRevision.html`, `Company_TopChemical_Purchasing.html`, `Company_TopChemical_EmpOvertime.html`, `Company_TopChemical_StockScan.html`, `Company_TopChemical_Trust.html`, `Company_TopChemical_EmployeeStatus.html`, `Company_TopChemical_EmployeeSalary.html`.

**TopLight (3):** `Company_TopLight_Sales_Offer.html`, `Company_TopLight_Sales.html`, `Company_TopLight_Purchasing.html`.

**Valley Foods (7):** `Company_ValleyFoods_Deductions.html`, `Company_ValleyFoods_Purchasing.html`, `Company_ValleyFoods_Attendance.html`, `Company_ValleyFoods_MonthlySalaries.html`, `Company_ValleyFoods_ShiftAssignment.html`, `Company_ValleyFoods_Salary.html`, `Company_ValleyFoods_VacationAlloc.html`.

This corrects the earlier provisional count of 26. The count above is for actual page templates in the current working tree, not distinct backend endpoints or tables. Mapping every one of these pages to its underlying table, filter, ordering key, and write path remains an explicit Phase 0 task before migration.

## Rollout gates that remain closed

1. Validate the Products Live `cursor_json` response with empty, under-limit, exactly-limit, over-limit, filtered, malformed-token, and high-water continuation cases in a fully isolated environment. Confirm aggregate row count, sort order, IDs, bounds, and cache permissions. Include concurrent edit/delete cases because the high-water ID is not an MVCC snapshot. No production RPC is authorized for this validation.
2. Validate the progressive table's cache painting, global search, background hydration, paging under concurrent changes, Excel/print scope, and product add/edit/soft-delete invalidation in isolation. The page flag remains off until that evidence exists.
3. Capture cold/warm page timings from an authorized test environment before claiming a speed improvement. Source inspection and syntax parsing cannot establish end-to-end latency.
4. For each Sheets page, prove whether a stable bounded cursor is possible. A narrow full scan is not constant-time paging. If an index or schema change is needed, propose it separately without changing live tables.
5. Validate VF_MOs save parity and recovery before enabling any planned save or fast-save flags. Cross-tab Google Sheets writes have no SQL transaction guarantee.

No source push, commit, staging, Apps Script deployment, schema change, or production data mutation is part of this local implementation pass.
