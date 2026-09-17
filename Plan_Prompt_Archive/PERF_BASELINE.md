# Phase 0b — baseline actually captured

**Date:** 2026-09-05
**Status:** partial. Read this section before using any number below.

## What could not be measured, and why

The execution plan's Phase 0b assumes **~1 week of production use** with the new instrumentation
running, then ranking the real top-20 slowest actions. **That sample was not collected.** This run
executed all phases back to back; there was no week to wait.

The **spreadsheet & formula inventory** (`inventorySpreadsheets()` in
[09_Inventory.js](09_Inventory.js)) — described in the plan as the thing without which *"Phase 4
cannot be scoped"* — **was also not run.** Executing it requires the function to exist in the
deployed Apps Script project, which requires `clasp push` against the production script id. That is
hard stop #1. The script is written, committed and read-only; running it is an owner step.

**Consequence, stated plainly:** Phase 4 was executed against *static code analysis only*, restricted
to formulas the code itself writes and can regenerate. No hand-authored formula was touched. See the
Phase 4 section of `PERFORMANCE_RESULTS.md`.

Everything below is a **static** measurement of the repository. It is real and reproducible, but it
measures bytes and code paths, not wall-clock time in production.

---

## 1. Client payload per page (static, exact)

Every page is server-rendered by `HtmlService`, which cannot set `Cache-Control`, so the whole
payload is re-downloaded on **every navigation**. Bytes below = the page file plus every file it
pulls in via `include()`, resolved recursively.

| Pages | Median inlined bytes | Mean |
|---|---|---|
| 93 | **126,973** | 273,738 |

Heaviest pages:

| Bytes | Page |
|---|---|
| 176,986 | `Company_ValleyFoods_MfgOrderView` |
| 175,574 | `Company_TopLight_Products` |
| 165,859 | `Company_TopChemical_BudgetInputs` |
| 163,839 | `Company_ValleyFoods_MfgOrders` |
| 159,370 | `0_ERP_Management` |
| 158,215 | `Company_ValleyFoods_Attendance` |
| 151,331 | `Company_ValleyFoods_Purchasing` |
| 150,127 | `Company_ValleyFoods_Sales` |

Shared include sizes (paid on nearly every page):

| File | Bytes | Included by |
|---|---|---|
| `UI_Components.html` | 95,353 | 82 pages |
| `Client_Helpers.html` | 15,529 | 82 pages |
| `CSS_Tokens.html` | 15,594 | 82 pages |

## 2. External CDN dependencies (static, exact — corrects F-19)

| Script | Pages |
|---|---|
| `cdnjs.cloudflare.com/.../xlsx/0.18.5/xlsx.full.min.js` (~900 KB) | **83** |
| `cdn.jsdelivr.net/npm/chart.js@4.4.1/...` | 3 |
| `cdn.jsdelivr.net/npm/chart.js@4.4.3/...` | 2 |

**Two corrections to `PERFORMANCE_INVESTIGATION.md`, both verified by grep:**

1. **Bootstrap is not loaded anywhere.** F-19 reports `bootstrap@5.3.0 × 10`. There is no Bootstrap
   `<script>` or `<link>` in any file. The only matches for the string "bootstrap" in the repository
   are two references to the *action name* `get_valley_sales_bootstrap` in
   `Company_ValleyFoods_Sales.html` and `Company_ValleyFoods_SalesReturns.html`. The "audit whether
   Bootstrap is still needed on those 10 pages" work item does not exist.
2. **`jspdf`, `jspdf-autotable` and `sortablejs` are not loaded either** — zero occurrences.

So the entire external surface is **two origins**: `cdnjs.cloudflare.com` and `cdn.jsdelivr.net`.
That is what the F-22 `preconnect` hints target, and it is the whole of the F-19 work.

Page counts also differ from the investigation's "118 pages": there are **93** `.html` files in the
project root, 82 of which include the shared bundle. The 118 figure appears to include `src_html/`
and other excluded directories.

## 3. Deployment weight (static, exact — confirms F-23)

| File | Bytes |
|---|---|
| `appsheet_old_project.html` | **14,450,230** |

`.clasp.json` sets `rootDir: ""` with `htmlExtensions: [".html"]` and there was no `.claspignore`,
so this file was in the push set. It is ~50× the size of the entire rest of the project.

## 4. Server-side round trips (static, by code path)

Counted by reading the code, not by timing. These are the Phase 2 targets, and the numbers are the
before side of that phase's comparison; see `PERFORMANCE_RESULTS.md` for after.

| Endpoint | Full-sheet reads on a cold cache |
|---|---|
| `get_sales_headers` (TopLight) | 7 |
| `get_purchasing_headers` (TopLight) | 5+ |
| `get_valley_purchasing_costing` (ValleyFoods) | 3, unpaginated |
| `get_purchase_items` (TopChemical) | 3 |

## 5. Instrumentation now available (needs an owner step to switch on)

| Signal | Where it lands | How to enable |
|---|---|---|
| Server elapsed ms per action | `SystemLog.ElapsedMs` | always on |
| Data-layer Sheets reads per action | `SystemLog.SheetReads` | always on |
| Read actions (`get_*`, `admin_list_*`, `ping`) | `SystemLog` rows with `Action = READ` | Script Property `PERF_LOG_READS=1` |
| Client `page_ready` / `page_load` / `first_data_render` | `ERP_Client_Perf` tab | same property |

`ElapsedMs` and `SheetReads` are appended to the **end** of `SYSTEM_LOG_HEADERS`, which is that
list's own documented convention; `ensureSystemLogSheet_` adds only missing headers to a live sheet
and never touches existing columns or rows.

**Read logging is deliberately off by default.** Logging a read appends a `SystemLog` row — it adds a
*write* to every *read*, and `SystemLog` already grows unbounded (F-13). It is a measuring
instrument, not a setting to leave on. `login_user` and `setup_password` are never logged regardless
of the flag.

### How to collect the week the plan asked for

1. Set Script Property `PERF_LOG_READS` = `1`.
2. Leave it for a normal working week.
3. **Set it back to `0`** (or delete it).
4. Sort `SystemLog` by `ElapsedMs` descending and read off the real top 20. Cross-check `SheetReads`:
   a high count with low elapsed means cache hits, a high count with high elapsed is a genuine target.

`SheetReads` counts reads at the shared data layer only. Company code that calls
`getDataRange().getValues()` directly is not counted, so the number is a **floor**, not a total.
