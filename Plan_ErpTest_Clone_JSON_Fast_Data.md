# Execution Plan: Clone Top Light into "Testing System" (`erp_test_*`), add Manufacturing, then move it onto the JSON fast-data layer

**Plan version:** 2 (replaces version 1)
**Date:** 2026-09-29
**Status:** Plan only. Nothing in this plan has been executed.

---

## PART A — Rules for the implementing agent (read before anything else)

You are an implementing agent. Follow this plan **literally**. Do not redesign or improve anything, and do not do extra work.

- **A1. Phases run in numerical order.** Do not start a phase until the previous phase's **DONE-CHECK** has passed and the owner has written "PASS Pn" in chat.
- **A2. Inside a phase, do the steps in numerical order.** Each step says exactly which file to create or edit and what to put in it.
- **A3. Never edit these files:**
  - every `Company_TopLight_*` file
  - every `Company_TopChemical_*`, `Company_ValleyFoods_*` and `Company_Assessment_*` file
  - `UI_Components.html`, `Client_Helpers.html`, `CSS_Tokens.html`
  - `Core_FastRead.js`, `Core_FastSave.js`, `Core_FormContracts.js`, `Core_ViewEngine.js`

  Only two shared files may be edited, and only where a step names them: **`Code.js`** (the 2 insertions in P3 step 3.9) and **`.clasp.json`** (P3 step 3.10).
- **A4. You never run `clasp push`, `clasp deploy`, or anything that writes to a Google Sheet or to Firestore.**
  - When a step says **OWNER RUNS**, stop and tell the owner exactly what to run. Then wait for the owner to paste the output.
  - You may create files and run local `node` scripts that only read local files.
- **A5. STOP conditions.** If any step says **STOP**, or a DONE-CHECK fails, or reality differs from this plan (a file, function or column is missing or named differently), stop immediately. Report exactly what differs. Do not guess a fix.
- **A6. Naming is fixed.** Use exactly the names in PART B. Never invent another name.
- **A7. Text replacements are exact-string replacements** unless a step says "regex". Apply them in the order listed.
- **A8. Commit messages.** After each phase's DONE-CHECK passes, create one git commit on the current branch with the message `erp_test Pn: <phase title>`. Do not push.

---

## PART B — Fixed facts and names

### B1. The new company (already present in the legacy `ERP_Companies` sheet of the auth spreadsheet)

| Field | Value |
|---|---|
| company_unique_id | `37fc50edf1424abd` |
| company_name_ar | `النظام التجريبي` |
| company_name_en | `Testing System` |
| company_sheet_link (spreadsheet id) | `1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE` |
| company_colors | `blue, white` |
| company_logo | empty |
| enabled | `TRUE` |

**Known problem:** the app reads companies from **Firestore** `ERP_Companies` (project `erp-project-3cae0`), not from the sheet. On 2026-09-29, Firestore contained only 4 companies: Valley Foods, Top Chemical, Top Light and Ain Metric. `37fc50edf1424abd` is **missing there**, so every request for this company fails with "Company not found". Phase P1 fixes this.

Reference: the Top Light spreadsheet id is `1xIGriBRv61Mvchv5xezQkxi7pnS64yH5ITwZrk3DjJ4`. The Top Light company UID is `8df5c89a117fe9a5`.

### B2. Name map (Top Light → Testing System)

| Kind | Top Light | Testing System |
|---|---|---|
| JS namespace | `TopLight` | `ErpTest` |
| File prefix | `Company_TopLight_` | `Company_ErpTest_` |
| Registry function | `registerTopLight_` | `registerErpTest_` |
| Nav global | `TOPLIGHT_MENU` | `ERPTEST_MENU` |
| Nav include | `include('Company_TopLight_Nav')` | `include('Company_ErpTest_Nav')` |
| Company UID | `8df5c89a117fe9a5` | `37fc50edf1424abd` |
| Sheet prefix | `top_light_` | `erp_test_` |
| Every string literal starting with `tl_` (page ids, docTypes, cache keys, role, table-catalog ids) | `tl_…` | `et_…` |
| Approver role | `tl_approver` | `et_approver` |
| Arabic company name in pages | `القمة لايت` | `النظام التجريبي` |
| English company name in pages | `Top Light` | `Testing System` |
| Company-name fallback in `companyArabicName_` | `شركة القمة لايت` | `النظام التجريبي` |

### B3. Sheet (tab) map. Every business tab keeps its suffix.

| Logical table | Top Light tab | Testing System tab |
|---|---|---|
| products | `top_light_products` | `erp_test_products` |
| categories | `top_light_categories` | `erp_test_categories` |
| parties | `top_light_customer_vendor` | `erp_test_customer_vendor` |
| chart | `top_light_chart_of_accounts` | `erp_test_chart_of_accounts` |
| stock | `top_light_current_products` | `erp_test_current_products` |
| purchase_headers | `top_light_purchasing_costing` | `erp_test_purchasing_costing` |
| purchase_lines | `top_light_product_purchasing` | `erp_test_product_purchasing` |
| sales_headers | `top_light_sales_invoices` | `erp_test_sales_invoices` |
| sales_lines | `top_light_sales_products` | `erp_test_sales_products` |
| sales_returns | `top_light_sales_returns` | `erp_test_sales_returns` |
| offer_headers | `top_light_sales_offer` | `erp_test_sales_offer` |
| offer_lines | `top_light_sales_offer_products` | `erp_test_sales_offer_products` |
| cash | `top_light_cash_bank_movement` | `erp_test_cash_bank_movement` |
| boxes | `top_light_box_account_codes` | `erp_test_box_account_codes` |
| **manufacture_orders (NEW)** | — | `erp_test_manufacture_orders` |
| **manufacture_lines (NEW)** | — | `erp_test_manufacture_lines` |
| currency (system, unchanged) | `ERP_currency_exchange` | `ERP_currency_exchange` |

If P0 finds that any existing `erp_test_*` tab above has a different name, **STOP**.

### B4. Module-action rename table (exact, complete)

Rule: a verb-first name is required, because the router infers permissions from the verb prefix. The names in the KEEP rows must **not** change, because shared client code calls them by name.

| Top Light action | Testing System action |
|---|---|
| `get_dashboard_data` | `get_et_dashboard_data` |
| `get_kpi_data` | `get_et_kpi_data` |
| `get_products` | `get_et_products` |
| `add_product` | `add_et_product` |
| `edit_product` | `edit_et_product` |
| `get_parties` | `get_et_parties` |
| `add_party` | `add_et_party` |
| `edit_party` | `edit_et_party` |
| `get_purchasing_headers` | `get_et_purchasing_headers` |
| `get_purchasing_options` | `get_et_purchasing_options` |
| `get_purchasing_lines` | `get_et_purchasing_lines` |
| `get_purchase_print` | `get_et_purchase_print` |
| `add_purchasing` | `add_et_purchasing` |
| `edit_purchasing` | `edit_et_purchasing` |
| `delete_purchasing` | `delete_et_purchasing` |
| `approve_purchasing` | `approve_et_purchasing` |
| `get_sales_headers` | `get_et_sales_headers` |
| `get_sales_options` | `get_et_sales_options` |
| `get_sales_lines` | `get_et_sales_lines` |
| `get_sales_print` | `get_et_sales_print` |
| `get_sales_costing` | `get_et_sales_costing` |
| `add_sales` | `add_et_sales` |
| `edit_sales` | `edit_et_sales` |
| `delete_sales` | `delete_et_sales` |
| `approve_sales` | `approve_et_sales` |
| `get_sales_returns` | `get_et_sales_returns` |
| `add_sales_return` | `add_et_sales_return` |
| `delete_sales_return` | `delete_et_sales_return` |
| `get_cash_headers` | `get_et_cash_headers` |
| `add_cash` | `add_et_cash` |
| `edit_cash` | `edit_et_cash` |
| `delete_cash` | `delete_et_cash` |
| `approve_cash` | `approve_et_cash` |
| `add_transfer` | `add_et_transfer` |
| `get_customer_statement` | `get_et_customer_statement` |
| `get_sales_offer_headers` | `get_et_sales_offer_headers` |
| `get_sales_offer_lines` | `get_et_sales_offer_lines` |
| `get_sales_offer_print` | `get_et_sales_offer_print` |
| `add_sales_offer` | `add_et_sales_offer` |
| `edit_sales_offer` | `edit_et_sales_offer` |
| `delete_sales_offer` | `delete_et_sales_offer` |
| `approve_sales_offer` | `approve_et_sales_offer` |
| `get_sales_analysis` | `get_et_sales_analysis` |
| `get_sales_costing_analysis` | `get_et_sales_costing_analysis` |
| `get_income_statement` | `get_et_income_statement` |
| `get_financial_position` | `get_et_financial_position` |
| `get_cash_report` | `get_et_cash_report` |
| `get_purchase_needs` | `get_et_purchase_needs` |
| `get_product_movement` | `get_et_product_movement` |
| `get_xlsx_export` | **KEEP** `get_xlsx_export` |
| `prefetch_refs` | **KEEP** `prefetch_refs` (called by name in `Client_Helpers.html`) |
| `get_page_versions` | **KEEP** `get_page_versions` (called by name in `UI_Components.html`) |

New manufacturing actions (P5): `get_et_manufacture_headers`, `get_et_manufacture_options`, `get_et_manufacture_lines`, `get_et_manufacture_print`, `get_et_manufacture_template`, `add_et_manufacture`, `edit_et_manufacture`, `delete_et_manufacture`, `approve_et_manufacture`, `complete_et_manufacture`, `cancel_et_manufacture`.

### B5. Page map (25 pages)

| Top Light page id | Testing System page id | Template |
|---|---|---|
| tl_dashboard | et_dashboard | Company_ErpTest_Dashboard |
| tl_kpi | et_kpi | Company_ErpTest_KPI |
| tl_analysis_review | et_analysis_review | Company_ErpTest_Dashboard |
| tl_products | et_products | Company_ErpTest_Products |
| tl_customers | et_customers | Company_ErpTest_Customers |
| tl_purchasing | et_purchasing | Company_ErpTest_Purchasing |
| tl_purchase_print | et_purchase_print | Company_ErpTest_Purchase_Print |
| tl_sales | et_sales | Company_ErpTest_Sales |
| tl_sales_offer | et_sales_offer | Company_ErpTest_Sales_Offer |
| tl_sales_print | et_sales_print | Company_ErpTest_Sales_Print |
| tl_sales_costing_print | et_sales_costing_print | Company_ErpTest_Sales_Costing_Print |
| tl_sales_release | et_sales_release | Company_ErpTest_Sales_Release |
| tl_sales_returns | et_sales_returns | Company_ErpTest_Sales_Returns |
| tl_sales_offer_print | et_sales_offer_print | Company_ErpTest_Sales_Offer_Print |
| tl_sales_analysis | et_sales_analysis | Company_ErpTest_Sales_Analysis |
| tl_sales_costing_analysis | et_sales_costing_analysis | Company_ErpTest_Sales_Costing_Analysis |
| tl_income_statement | et_income_statement | Company_ErpTest_Income_Statement |
| tl_financial_position | et_financial_position | Company_ErpTest_Financial_Position |
| tl_cash | et_cash | Company_ErpTest_Cash |
| tl_cash_report | et_cash_report | Company_ErpTest_Cash_Report |
| tl_customer_statement | et_customer_statement | Company_ErpTest_Customer_Statement |
| tl_purchase_needs | et_purchase_needs | Company_ErpTest_Purchase_Needs |
| tl_product_movement | et_product_movement | Company_ErpTest_Product_Movement |
| **NEW** | et_manufacture (label `التصنيع`, in nav) | Company_ErpTest_Manufacture |
| **NEW** | et_manufacture_print (nav:false) | Company_ErpTest_Manufacture_Print |

### B6. Owner decisions. These defaults apply unless the owner overrides them in chat before P3.

| # | Question | DEFAULT (use this) |
|---|---|---|
| OD1 | Keep Top Light calculation quirks (negative numbers clamped to 0 by `num0_`; returns matched by product id; unit cost from the *first* purchase line)? | **Keep all.** The copy must be byte-for-byte in business math. |
| OD2 | Business constants (box codes 111101/111102/111103/111104, chart ranges, excluded party `19`, capital `13904527.63`, discount/tax/method option lists, sales-header constants 5/2/3/14) | **Keep the Top Light values.** P0 verifies that the box codes exist in `erp_test_box_account_codes`. |
| OD3 | `erp_test_current_products` | **Becomes a values-only sheet written by code** (P7). This is required so that manufacturing moves stock. |
| OD4 | Will people edit `erp_test_*` sheets by hand? | **Assume yes.** Build the edit trigger and the reconcile job in P10. |
| OD5 | Manufacturing extra cost (labour/overhead) | Added to the finished product's cost **and** added to COGS as the separate line `mfgExtra` (P7). Cash payments for these costs should be booked to a chart code whose main account is **not** `التكاليف`, so they are not counted twice. The owner must tell accountants this. |

### B7. Field inventory: the header names the functions and pages actually use

**Why this exists.** The server builds rows with `set(name, value)`, which **silently skips any header it cannot find**. It returns records to the pages keyed by header name. So a column that is misnamed in the sheet means data is silently not saved, or a page shows blanks. Nothing crashes. This inventory lists, per table, every **logical** name (the Top Light header name the code uses) and its class:

- **R (required):** read by server logic or a page, or written from user input. It **must** resolve to a real column in the erp_test tab. If it does not → **STOP**.
- **W (write-only):** metadata or a derived value that the code writes but nothing reads. If it does not resolve → **WARN** (the value is simply not stored); continue.
- **Audit:** `deleted_at, deleted_by, version` on every business tab except chart, boxes and stock. P2 creates them if they are missing.

The agent copies this section **exactly** into `tools/erptest/field_inventory.json`, in the form `{ "<erp_test tab>": { "R": [...], "W": [...] } }`.

| erp_test tab | R (must exist) | W (warn if missing) |
|---|---|---|
| erp_test_products | id, name_ar, name_en, category, unit, carton, concentration, sales_tax, asset_code | user, created_at |
| erp_test_categories | id, name_ar, name_eng | user, created_at |
| erp_test_customer_vendor | id, name, customer_direction, type, country, region, registration_number, tax_id, name_en, telephone, address | user, created_at |
| erp_test_chart_of_accounts | المستوى الخامس, كود المستوى, *CHART_KEY_H*, *CHART_NAME_H*, *CHART_MAIN_H* (the three names recorded in P0 check 6.4) | — |
| erp_test_box_account_codes | المستوى الخامس, اسم المستوى الخامس, اسم المستوى الرابع | — |
| erp_test_current_products | unique_id, product, unit, current_qty, unit_cost, total_cost_sign | — |
| erp_test_purchasing_costing | unique_id, code, tax_system, reciept date, items, type, shipping type, if shipping via cif, enter the insurance value., value, currency, exchange rate, importation re-price, tax declared value, administrative expenses, customs expenses, unloading expenses, bank commission, customs clearance and port receipts, additional fees, clearance expenses, other expenses, purchase tax, income tax, internal cost adjustment, minimum differences, supplier name, approved this month, associated bank, total costs, approval_status, approval, approval_time | user, value based on invoice, month, year, cif insurance rate, tax type, sales value, sales tax amount |
| erp_test_product_purchasing | unique_id, id, top_light_purchasing_costing_id, product, qty, unit_price, other_cost, sales_value, movement_type, vendor, receipt_date, exchange_rate, total_cost, unit_cost, movement_code | invoice_date, currency, movement_place, product_category, user, sales_value_amount, sales_qty, cost_currency |
| erp_test_sales_invoices | invoice_unique_id, رقم الفاتورة, اسم العميل, رقم التسجيل الضريبي للعميل, العنوان, رقم الموبيل, تاريخ الفاتورة, المبلغ الصافي, نسبة الخصم, قيمة الخصم, قيمة الضريبة, إجمالي, tax_system, approval_status, approval, approval_time | ميزان حسابي, نوع الضريبة, نوع البيان, نوع السلعة, نوع سلع الجدول, الشهر, العام, user, created_at |
| erp_test_sales_products | unique_id, id, top_lightsales_header_id, product_id, product_tax, product_qty, product_price, product_discount, product_net_value, product_tax_value, product_total_value | top_lightsales_invoices_client, user, created_at |
| erp_test_sales_returns | unique_id, id, top_lightsales_invoices_id, top_lightsales_invoices_client, top_lightreturn_date, top_lightsales_products_id, top_lightreturn_qty, top_lightreturn_discount, top_lightreturn_price, top_lightreturn_value | user, created_at |
| erp_test_sales_offer | invoice_unique_id, رقم الفاتورة, اسم العميل, رقم التسجيل الضريبي للعميل, العنوان, رقم الموبيل, تاريخ الفاتورة, المبلغ الصافي, نسبة الخصم, قيمة الخصم, قيمة الضريبة, إجمالي, tax_system, approval_status, approval, approval_time | نوع سلع الجدول, الشهر, العام, user, created_at |
| erp_test_sales_offer_products | unique_id, id, top_lightsales_offer_id, product_id, product_tax, product_qty, product_price, product_discount, product_net_value, product_tax_value, product_total_value | user, created_at |
| erp_test_cash_bank_movement | transaction_id, name, transaction_details, transaction_date, transaction_amount, total_discount, taxes, transaction_type, related_box, chart_code, transaction_method, tax_system, approved, currency, exchange_rate, total, balance_amount, box_balance, name_vendor, chart_name, chart_account_main, user | invoice_id, transaction_purchasing_items, net_amount, temp_target_box, created_at |
| erp_test_manufacture_orders | all 26 headers of P2 step 2.1.3 | — |
| erp_test_manufacture_lines | all 15 headers of P2 step 2.1.4 | — |

Notes for the matcher:
- The names in italics (*CHART_KEY_H*, etc.) are placeholders. Replace them with the three header names recorded in P0 check 6.4 before checking.
- The code also *reads* a few alias spellings as fallbacks: `receipt date`, `reciept_date`, `receipt_date`, `supplier_name`, `total_costs`, `Total Costs`, `Code`, `Items`, `item`, `Type`, `Currency`, `Value`, `exchange_rate`. These are **not** required and are never checked.
- A Top Light sheet header that is **not** in this inventory is irrelevant to the code. If it is unmatched in erp_test → **IGNORE** (list it in the report only).

---

## PART C — Background (why the plan looks like this)

A summary of the study in plan version 1. The agent does not act on this part.

1. **How Top Light works.** The server is one IIFE in `Company_TopLight_Actions.js` (4,357 lines). It holds:
   - 51 actions in `ACTION_DEFINITIONS`
   - a repository layer (`tlDbList_`, `tlDbCreate_`, `tlDbPatch_`, `tlDbSoftDelete_`, …) over `getAllRecords_` / `getHeaders_` from `Code.js`
   - row-derivation functions, workflows, reports, the theme, and `approvalPolicy_`

   The pages call `API.call('company_action', {target_system, module_action, data})`.
2. **Why the actions and docTypes are renamed.** The router merges every company's `approvalPolicy_.actionToDocType`, `statusOnly`, docType validators and approval chains into **global maps keyed by action name and docType**. A clone that reused `add_sales` / `tl_sales` would silently replace Top Light's rules.
3. **Why the verb comes first in new action names.** The router infers the required access from the verb prefix (`^add_` means write; `^(edit_|delete_|remove_|update_|toggle_|close_|make_)` means full).
4. **Why headers are translated instead of rewritten.** Top Light code reads columns by header name, including:
   - Arabic headers in sales and offers
   - a typo (`reciept date`)
   - the table prefix inside FK names (`top_lightsales_header_id`, `top_lightreturn_qty`, …)
   - a **positional** chart lookup (columns 9, 14 and 15)

   Plan choice: the cloned code keeps using **Top Light header names as logical names**. One translation layer (`etHeaders_`, `etRecords_`, `etCol_`) converts between logical names and the real `erp_test` headers. This keeps the business code unchanged, so parity is testable.
5. **Why this is slow and what the JSON layer fixes.**
   - Slow today: every list or report reads whole sheets (`getDataRange`) on every request, and saves make 8–20 separate sheet calls.
   - The JSON layer (P9–P11) serves reads from cached JSON snapshots and aggregates.
   - It saves with one narrow read plus one atomic `Sheets.Spreadsheets.batchUpdate`.
   - Browsers keep local copies in IndexedDB and sync deltas.
6. **Where the data lives.** The Google Sheets stay the source of truth. All JSON can be rebuilt from them.

---

## PHASE P0 — Discovery (read-only)

**Goal:** get the real headers and formulas of the Testing System spreadsheet and the Top Light spreadsheet, and turn them into a header map.

### Steps
0.1 Create the file `tools/erptest/discover.gs.txt`. It is **not** pushed, because `tools/**` is in `.claspignore`. Its content is this Apps Script function. Copy it exactly:

```javascript
function etDiscover_() {
  var ids = { erp_test: '1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE', top_light: '1xIGriBRv61Mvchv5xezQkxi7pnS64yH5ITwZrk3DjJ4' };
  var out = {};
  Object.keys(ids).forEach(function (k) {
    var ss = SpreadsheetApp.openById(ids[k]);
    out[k] = { title: ss.getName(), tz: ss.getSpreadsheetTimeZone(), sheets: [] };
    ss.getSheets().forEach(function (sh) {
      var lr = sh.getLastRow(), lc = sh.getLastColumn();
      var headers = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
      var probeRows = Math.min(Math.max(lr - 1, 0), 200);
      var formulaCols = {};
      if (probeRows && lc) {
        var f = sh.getRange(2, 1, probeRows, lc).getFormulas();
        for (var c = 0; c < lc; c++) {
          var n = 0, first = '';
          for (var r = 0; r < probeRows; r++) if (f[r][c]) { n++; if (!first) first = f[r][c]; }
          if (n) formulaCols[headers[c] || ('#' + (c + 1))] = { count: n, first: first };
        }
      }
      out[k].sheets.push({ name: sh.getName(), hidden: sh.isSheetHidden(), lastRow: lr, lastCol: lc, headers: headers, formulaCols: formulaCols,
        sample: lr > 1 ? sh.getRange(2, 1, Math.min(2, lr - 1), lc).getDisplayValues() : [] });
    });
  });
  var boxes = SpreadsheetApp.openById(ids.erp_test).getSheetByName('erp_test_box_account_codes');
  out.erp_test_box_values = boxes ? boxes.getDataRange().getDisplayValues().slice(0, 50) : 'MISSING';
  console.log(JSON.stringify(out));
  return out;
}
```

0.2 **OWNER RUNS:** open the Apps Script editor of script `1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM`, paste the function into a scratch file, run `etDiscover_`, and copy the logged JSON into the local file `tools/erptest/discovery.json`. Then delete the scratch file from the editor.
   - Alternative: the owner shares both spreadsheets as **Viewer** with `firebase-adminsdk-fbsvc@erp-project-3cae0.iam.gserviceaccount.com`, and the agent produces the same JSON with a local node script using the key in `Fire base json key/`.

0.3 Create `tools/erptest/build_header_map.js` (node, reads local files only). Algorithm, followed exactly:
   1. Load `discovery.json`.
   2. For each row of B3 that has both a Top Light tab and a Testing System tab (the 14 business tabs), take `TL = headers of the top_light tab` and `ET = headers of the erp_test tab`. Trim every header.
   3. For each header `h` in TL:
      - `candidate` = `h`, with `top_light_` replaced by `erp_test_` and then `top_light` replaced by `erp_test`.
      - If `candidate` is in ET, it is an EXACT match. Record `h → candidate`.
      - Else, if some `e` in ET satisfies `norm(e) === norm(candidate)` with `norm(x) = x.toLowerCase().replace(/[\s_]+/g,' ').trim()`, it is a NORMALIZED match. Record `h → e`.
      - Else the header is UNMATCHED. Record `h → null`.
   4. Every ET header not used by any match is EXTRA.
   5. Write `tools/erptest/header_map.json`:
      ```json
      { "<erp_test tab>": { "map": { "<TL header>": "<ET header or null>" }, "extra": ["…"], "tlFormulaCols": {…}, "etFormulaCols": {…} } }
      ```
   6. Write `tools/erptest/header_map_report.md`, containing one table per tab (TL header | ET header | match type) and, at the end, the lists of UNMATCHED and EXTRA headers.
   7. **Field-alignment check against B7.** Load `tools/erptest/field_inventory.json`. For each erp_test tab and each logical name `n` in its R and W lists:
      - `physical = header_map[tab].map[n]`
      - If `n` is not a TL header, try `physical = n`, then any ET header `e` with `norm(e) === norm(n)`.
      - `physical` found in ET headers → **ALIGNED**
      - an R name not found → **MISSING-REQUIRED**
      - a W name not found → **MISSING-OPTIONAL**
      - Audit names are checked by P2 and are skipped here.

      Add a section "Field alignment" to the report, with one table per tab (logical name | class | erp_test header | status). Then list every MISSING-REQUIRED, then every MISSING-OPTIONAL, then every TL header that is UNMATCHED but not in B7 (status IGNORED).
   8. **Formula-column guard.** For every R or W name whose resolved erp_test column appears in `etFormulaCols` of that tab, mark it **FORMULA-CONFLICT**, because the code would overwrite a formula. Exception: tab `erp_test_current_products`, which P7 converts to values.

0.4 Run `node tools/erptest/build_header_map.js`.

0.5 **Required-exact check** (append the results to the report). These columns are used by shared `Code.js` helpers under their **physical** names, so in the erp_test tab they must exist with **exactly** this spelling:

| erp_test tab | Columns that must exist with exact names |
|---|---|
| every business tab (except chart, boxes, stock) | `deleted_at`, `deleted_by`, `version` (if missing: **not** a STOP; P2 adds them) |
| erp_test_purchasing_costing | `unique_id`, `approval_status`, `approval`, `approval_time` |
| erp_test_sales_invoices, erp_test_sales_offer | `invoice_unique_id`, `approval_status`, `approval`, `approval_time` |
| erp_test_cash_bank_movement | `transaction_id`, `approved`, `user` |
| erp_test_product_purchasing, erp_test_sales_products, erp_test_sales_returns, erp_test_sales_offer_products | `unique_id`, `id` |
| erp_test_products, erp_test_categories, erp_test_customer_vendor | `id` |

0.6 **Structure checks.** Record each result in the report as PASS or FAIL.
   1. All 14 business tabs of B3 exist in erp_test.
   2. `tlFormulaCols` of `top_light_current_products` lists which columns hold formulas. Write the exact `first` formula of `current_qty` and of `unit_cost` into the report.
   3. In `top_light_product_purchasing`, the headers at column H (index 7), K (index 10) and N (index 13) are `product`, `qty` and `total_cost`. Top Light's `unit_cost` formula depends on this.
   4. In `top_light_chart_of_accounts`, record the header names at index 8, 13 and 14. The positional lookup uses them; call them `CHART_KEY_H`, `CHART_NAME_H` and `CHART_MAIN_H`.
   5. `erp_test_box_values` contains the codes `111101`, `111102`, `111103` and `111104` in the `المستوى الخامس` column (or the column it maps to).
   6. No erp_test tab has two headers that map to the same TL header.

### DONE-CHECK P0
- **Zero MISSING-REQUIRED** (step 0.3.7), **and** zero FORMULA-CONFLICT (step 0.3.8), **and** every required-exact column exists (except audit columns, which P2 adds), **and** checks 1–6 all PASS.
- MISSING-OPTIONAL and IGNORED entries do **not** block. List them for the owner.
- Otherwise **STOP**. Send the owner the report and wait. The owner either renames or adds the columns in the sheet, or writes the missing mapping by hand into `header_map.json`, then P0 is re-run from step 0.4.
- The owner confirms the defaults in B6 or overrides them.

---

## PHASE P1 — Register the company in the system tables (writes to production system data, so the owner must approve)

### Steps
1.1 Create `tools/erptest/register_system_rows.mjs` (node). Base it on `copy_sheet_to_firestore.mjs` for authentication (same key file, scope `https://www.googleapis.com/auth/datastore`). It has two modes: **dry run** by default, and `--write`.
   1. **ERP_Companies:** if no document has `company_unique_id == "37fc50edf1424abd"`, create document id `row_000006`. If that id exists, use the next free `row_NNNNNN`. Fields:
      - `company_unique_id`, `company_name_ar`, `company_name_en`, `company_sheet_link`, `company_colors` as in B1
      - `company_logo:null`, `company_main_page:null`, `enabled:true`, `user:"m.gamal2363@gmail.com"`
   2. **ERP_System_Pages:** for each of the 25 pages in B5, if no document has that `page_id`:
      - For the 23 copied pages: copy the matching `tl_` document's fields, set `page_id` = the et id, `page_company = "37fc50edf1424abd"`, and in `page_name` replace `Top Light` with `Testing System`.
      - For `et_manufacture`: `{page_id:"et_manufacture", page_name:"Testing System — التصنيع", page_module:"Finance", page_company:"37fc50edf1424abd", page_thumbnail:null}`
      - For `et_manufacture_print`: `{page_id:"et_manufacture_print", page_name:"أمر تصنيع", page_module:"Finance", page_company:"37fc50edf1424abd", page_thumbnail:null}`
      - New documents get the next free `row_NNNNNN` ids.
   3. **ERP_Pages_Matrix:** for every document whose `page_id` starts with `tl_`, create a copy with:
      - `page_id` with `tl_` replaced by `et_`
      - `role` with `Top Light` replaced by `Testing System`
      - a new 16-hex `ERP_Pages_Matrix_unique_id`
      - the same `access_type` and `status`

      Also, for every copied row whose page is `et_purchasing`, add two more rows with the same role and access: one for `et_manufacture` and one for `et_manufacture_print`. Skip any row whose `(role, page_id)` pair already exists.
   4. The dry run prints every document it would create. `--write` creates them and prints the ids.

1.2 Run the dry run: `node tools/erptest/register_system_rows.mjs`. Give the output to the owner.

1.3 **OWNER RUNS:** review the dry run, then run `node tools/erptest/register_system_rows.mjs --write`.

1.4 **OWNER RUNS** in the Apps Script editor (scratch function, then delete it): `bumpVersion_('ERP_Companies'); bumpVersion_('ERP_Pages_Matrix'); bumpAuthGeneration_();`

1.5 **OWNER DOES:** in ERP Management, assign the test users to company `37fc50edf1424abd` with a `Testing System …` role. Super admins need nothing.

### DONE-CHECK P1
- Running the dry run again prints "0 documents to create".

---

## PHASE P2 — Sheet setup in the Testing System spreadsheet (the owner runs it; idempotent)

### Steps
2.1 Create `tools/erptest/setup_sheets.gs.txt` containing function `etSetupSheets_()`. It does exactly this, and every step only acts if needed:
   1. Open the spreadsheet `1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE`.
   2. For each business tab of B3 except `erp_test_chart_of_accounts`, `erp_test_box_account_codes` and `erp_test_current_products`: for each of `deleted_at`, `deleted_by`, `version` that is missing from row 1, append it as a new header at the end of row 1.
   3. If the tab `erp_test_manufacture_orders` is missing, create it with this row 1, **in this order**:
      `unique_id, id, mo_number, mo_date, product_id, planned_qty, produced_qty, materials_cost, extra_cost, total_cost, unit_cost, production_status, completion_date, completed_by, cancelled_at, cancelled_by, notes, approval_status, approval, approval_time, user, created_at, updated_at, deleted_at, deleted_by, version`
   4. If the tab `erp_test_manufacture_lines` is missing, create it with this row 1:
      `unique_id, id, mo_unique_id, product_id, planned_qty, consumed_qty, unit_cost, total_cost, notes, user, created_at, updated_at, deleted_at, deleted_by, version`
   5. On both new tabs, freeze row 1 and set number format `@` (plain text) on columns `unique_id`, `mo_unique_id` and `mo_number`, so ids are never coerced to numbers.
   6. Log the list of changes made.

2.2 **OWNER RUNS** `etSetupSheets_` (scratch file in the editor, then delete it). Then **OWNER RUNS** `etDiscover_` again and saves the output over `tools/erptest/discovery.json`.

2.3 The agent runs `node tools/erptest/build_header_map.js` again.

### DONE-CHECK P2
- The new discovery shows both manufacture tabs with exactly the headers above.
- Every audit column now exists.
- The header map still has zero UNMATCHED entries.

---

## PHASE P3 — Clone the server code (legacy data path, header translation)

### Steps
3.1 **Create `Company_ErpTest_Schema.js`** with exactly:
   - A comment header saying it is generated from `tools/erptest/header_map.json` and must not be hand-edited.
   - `var ET_HEADER_MAP = { … };`. This is the content of `header_map.json` reduced to `{ "<erp_test tab>": { "<TL header>": "<ET header>" } }`, keeping **only** pairs where the TL header ≠ the ET header.
   - `var ET_CHART_COLS = { key: '<CHART_KEY_H>', name: '<CHART_NAME_H>', main: '<CHART_MAIN_H>' };`, using the values recorded in P0 check 6.4.

   - `var ET_FIELD_INVENTORY = { … };`: the content of `tools/erptest/field_inventory.json` (B7), with the chart placeholders replaced by the real names.

   Also create the generator `tools/erptest/gen_schema.js`, which writes this file from `header_map.json` and `field_inventory.json`, and run it. Do not type the file by hand.

3.2 **Copy** `Company_TopLight_Actions.js` to `Company_ErpTest_Actions.js`.

3.3 **Apply these exact replacements to `Company_ErpTest_Actions.js`, in this order:**
   1. `const TopLight = (function` → `const ErpTest = (function`
   2. `TopLight.approvalPolicy_` → `ErpTest.approvalPolicy_`
   3. `TopLight.attachmentPolicy_` → `ErpTest.attachmentPolicy_`
   4. `TopLight.artifactHandlers_` → `ErpTest.artifactHandlers_`
   5. `8df5c89a117fe9a5` → `37fc50edf1424abd` (all occurrences)
   6. For each action row of B4 that is not KEEP: `'<old>'` → `'<new>'`, including the quotes, all occurrences. Do the longest names first, so for example `'get_sales_costing_analysis'` is replaced before `'get_sales_costing'`.
   7. For each tab row of B3: `'<Top Light tab>'` → `'<Testing System tab>'`, including the quotes. Because the quotes are part of the match, FK column names like `'top_light_purchasing_costing_id'` are **not** touched. That is intended: they are logical names.
   8. `'create_top_light_` → `'create_erp_test_`; `'update_top_light_` → `'update_erp_test_`; `'delete_top_light_` → `'delete_erp_test_`
   9. Regex: replace `(['"])tl_` with `$1et_`. This covers page ids, docTypes, cache keys, `tl_approver`, and the `tl_sales` counter name.
   10. `'شركة القمة لايت'` → `'النظام التجريبي'`
   11. In `topLightThemeCss_`, the blue/white theme:
       - `#111111` → `#1e3a8a`
       - `#000000` → `#172554`
       - `#fbbf24` → `#ffffff`
       - `#fde68a` → `#dbeafe`
       - `#fef08a` → `#dbeafe`
       - `rgba(17, 17, 17,` → `rgba(30, 58, 138,`
       - `#b45309` → `#1d4ed8`
       - `#f59e0b` → `#3b82f6`

       Rename the function `topLightThemeCss_` → `erpTestThemeCss_`, including the one reference in the returned object.
   12. Replace the whole `ErpTest.approvalPolicy_ = { … };` block with the exact block in **Appendix 1**.

3.4 **Add the translation layer.** Put these functions inside the IIFE, directly after the line `const COMPANY_UID = '37fc50edf1424abd';`. Specification:
   - `function etMapFor_(sheetName)`: returns `ET_HEADER_MAP[sheetName] || {}`.
   - `function etToPhysical_(sheetName, logical)`: returns `etMapFor_(sheetName)[logical] || logical`.
   - `function etToLogical_(sheetName, physical)`: builds the reverse of `etMapFor_(sheetName)` once per sheet (memo object inside the IIFE) and returns `reverse[physical] || physical`. Trim the input first.
   - `function etHeaders_(sheet)`: returns `getHeaders_(sheet).map(function (h) { return etToLogical_(sheet.getName(), String(h).trim()); })`. It returns a **new** array, so the cached original is never mutated.
   - `function etRecords_(dbId, sheetName)`:
     - `var rows = getAllRecords_(dbId, sheetName); var m = etMapFor_(sheetName);`
     - If `m` has no keys, return `rows`.
     - Otherwise return `rows.map(r => { var o = {}; Object.keys(r).forEach(k => { o[etToLogical_(sheetName, k)] = r[k]; }); return o; })`.
   - `function etCol_(sheetName, logical)`: an alias of `etToPhysical_`.

3.5 **Point the repository at the translation layer.** In `Company_ErpTest_Actions.js`:
   1. Replace **every** `getHeaders_(` with `etHeaders_(`. The Top Light file has **16** occurrences; confirm the count is 16. The only exception is the line **inside** `etHeaders_` itself.
   2. Replace **both** `getAllRecords_(` with `etRecords_(`. Top Light has 2 occurrences: `tlDbList_` and `currencyOptions_`. The currency table has no map entry, so it passes through unchanged. The only exception is the line inside `etRecords_`.
   3. Id-column arguments:
      - In `tlDbCreate_`, `getNextIdUnderLock_(dbId, table)` → `getNextIdUnderLock_(dbId, table, etCol_(table, 'id'))`.
      - `getNextIdBatch_(dbId, PURCHASING_LINES_SHEET, lines.length, 'id')` → `…, etCol_(PURCHASING_LINES_SHEET, 'id'))`. Do the same for `SALES_LINES_SHEET` and `OFFER_LINES_SHEET`.
      - `getNextId_(dbId, CASH_SHEET, 'transaction_id')` → `getNextId_(dbId, CASH_SHEET, etCol_(CASH_SHEET, 'transaction_id'))`.
      - `getNextIdBatch_(dbId, CASH_SHEET, 2, 'transaction_id')` → `getNextIdBatch_(dbId, CASH_SHEET, 2, etCol_(CASH_SHEET, 'transaction_id'))`.

      These keep ids as `max(id)+1` of the target table (project rule; never a counter sheet).
   4. Replace the body of `tlChartPositionalLookup_` so it reads by name instead of by position. New body:
      - Build the map through `tlRefs_(dbId, 'chart_positional', builder)`.
      - The builder iterates `etRecords_(dbId, CHART_SHEET)` and for each record `r`: `key = String(r[ET_CHART_COLS.key] ?? '').trim()`. Skip it if the key is empty or already present. Otherwise set `out[key] = { name: r[ET_CHART_COLS.name] ?? '', main: r[ET_CHART_COLS.main] ?? '' }`.
      - Everything else (the wanted-key trim, the empty return, the try/catch) stays the same.

3.6 **Create `Company_ErpTest_Registry.js`:**
   1. Copy `Company_TopLight_Registry.js`.
   2. Apply 3.3 replacements 5, 7 and 9, and in addition:
      - `registerTopLight_` → `registerErpTest_`
      - `TopLight.` → `ErpTest.`
      - `Top Light` → `Testing System`
   3. At the end of the `pages` array, add:
      - `{ action: 'et_manufacture', template: 'Company_ErpTest_Manufacture', title: 'Testing System — التصنيع', label: 'التصنيع' }`
      - `{ action: 'et_manufacture_print', template: 'Company_ErpTest_Manufacture_Print', title: 'أمر تصنيع', nav: false }`
   4. At the end of `tables`, add:
      - `{ id: 'et_manufacture_tbl', sheetName: 'erp_test_manufacture_orders', pkColumn: 'unique_id', labelAr: 'التصنيع', pageId: 'et_manufacture' }`

3.7 **Create `Company_ErpTest_Nav.html`:**
   1. Copy `Company_TopLight_Nav.html`.
   2. Replace `TOPLIGHT_MENU` → `ERPTEST_MENU`, `tl_` → `et_`, and `Top Light` → `Testing System`.

3.8 (Manufacturing handlers come in P5. Nothing to do in this step.)

3.9 **Edit `Code.js`** in `ensureCompaniesRegistered_`. These are the only two edits to `Code.js` in the whole plan.
   1. After the line `['Assessment Center', typeof registerAssessmentCenter_ === 'function' ? registerAssessmentCenter_ : null]`, add a comma and the new line `['Testing System', typeof registerErpTest_ === 'function' ? registerErpTest_ : null]`.
   2. After the line `registerAssessmentCenter_();`, add `registerErpTest_();`.

3.10 **Edit `.clasp.json`:** in `filePushOrder`, directly after `"Company_TopLight_Registry.js"`, add in this order: `"Company_ErpTest_Schema.js"`, `"Company_ErpTest_Actions.js"`, `"Company_ErpTest_Registry.js"`. The Schema file must load before Actions.

3.11 **Create the static checker `tools/verify/erptest_clone_static.js`** (node). It exits with code 1 and a list of `file:line` hits if any check fails:
   1. In every `Company_ErpTest_*` file, zero matches of: `8df5c89a117fe9a5`, `TOPLIGHT_MENU`, `TopLight_Nav`, `القمة لايت`, `Top Light`, the regex `['"]tl_`, and `action=tl_`.
   2. In every `Company_ErpTest_*` file, zero word-boundary matches (`\b<name>\b`) of any **old** action name from B4 except the three KEEP names.
   3. In `Company_ErpTest_Actions.js`, `getHeaders_(` and `getAllRecords_(` each appear exactly once (inside `etHeaders_` / `etRecords_`).
   4. Every key of `ACTION_DEFINITIONS` in the new file is either a B4 new name, a KEEP name, or one of the manufacturing names in B4.
   5. The `Company_TopLight_*` files are byte-identical to `git show HEAD:<file>`.
   6. Loading `Company_TopLight_Actions.js` and `Company_ErpTest_Actions.js` into one Node `vm` context with stubs for the `Code.js` globals (use the pattern of the existing `tools/verify/company_registry_bootstrap.js`) produces two policies. The union of their `actionToDocType` keys has no duplicates, and the union of their chains' docTypes has no duplicates.

3.12 **Live field-alignment check.** This confirms at runtime, against the real sheet, that every field the functions use is present.
   1. Inside the IIFE, add `function etSchemaCheck_(dbId)`. For each tab in `ET_FIELD_INVENTORY`:
      - `physical = getHeaders_(getSheet_(tab, dbId)).map(h => String(h).trim())`
      - For each R and W name, `p = etToPhysical_(tab, name)`; the name is OK iff `physical.indexOf(p) !== -1`.
      - Collect `{tab, name, class, physical: p, ok}`.
   2. Return `{ ok: <no R entry failed>, missingRequired: [...], missingOptional: [...] }`.
   3. Export it in the IIFE's return object as `schemaCheck_: etSchemaCheck_`.
   4. At file bottom, outside the IIFE, add the global function `function etSchemaCheckRun_(){ var r = ErpTest.schemaCheck_('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE'); console.log(JSON.stringify(r)); return r; }`.
   5. Extend the static checker: every string literal used as the first argument of `set(`, `put(`, `pick(` or `pickP(`, and every property read in the form `r['…']` / `rec['…']` / `inv['…']` / `row['…']`, in `Company_ErpTest_Actions.js`, must be either:
      - in `ET_FIELD_INVENTORY` (any tab), or
      - one of the alias spellings listed in the B7 notes, or
      - a key of a response object that the code builds itself (not a sheet read).

      For the third case, keep an explicit allow-list array `RESPONSE_ONLY_KEYS` in the checker. The agent fills it from the checker's first-run output, adding **only** names that the code builds itself in response objects and never reads from a sheet. For example: `customer_name`, `product_name`, `box_name`, `supplier_name`, `fully_returned`, `category_name`, `balance`.

      A literal that fits none of the three → exit 1. This catches any code field that B7 missed.

### DONE-CHECK P3
- `node tools/verify/erptest_clone_static.js` exits 0.
- `node tools/verify/company_registry_bootstrap.js` still exits 0.
- **OWNER RUNS** (after `clasp push`) `etSchemaCheckRun_` from the editor. The log shows `"ok":true`. Anything else is a **STOP**: report `missingRequired` to the owner.

---

## PHASE P4 — Clone the 22 page templates

### Steps
4.1 For each file `Company_TopLight_<X>.html` in this list, copy it to `Company_ErpTest_<X>.html`:
   Cash, Cash_Report, Customer_Statement, Customers, Dashboard, Financial_Position, Income_Statement, KPI, Product_Movement, Products, Purchase_Needs, Purchase_Print, Purchasing, Sales, Sales_Analysis, Sales_Costing_Analysis, Sales_Costing_Print, Sales_Offer, Sales_Offer_Print, Sales_Print, Sales_Release, Sales_Returns.

4.2 In every copied file, apply in order:
   1. `8df5c89a117fe9a5` → `37fc50edf1424abd`
   2. `include('Company_TopLight_Nav')` → `include('Company_ErpTest_Nav')`
   3. `TOPLIGHT_MENU` → `ERPTEST_MENU`
   4. The B4 action replacements (quoted, longest first). Apply them for both quote styles, `'…'` and `"…"`.
   5. Regex `\btl_` → `et_`. This changes page ids in strings and in `action=tl_…` URLs.
   6. `القمة لايت` → `النظام التجريبي`
   7. `Top Light` → `Testing System`

4.3 Run `node tools/verify/erptest_clone_static.js`.

### DONE-CHECK P4
- The static checker exits 0.
- **OWNER RUNS** `clasp push` and opens `?action=et_dashboard` as super admin. All 23 cloned pages open.
- Products, customers, purchasing, sales, offers and cash each list without error. With an empty sheet, the lists are empty.
- Adding one product and one customer succeeds, and the rows appear in `erp_test_products` / `erp_test_customer_vendor` under the correct erp_test headers.

---

## PHASE P5 — Manufacturing: server

### 5.1 Data model (tabs created in P2)

**`erp_test_manufacture_orders`** (one row per manufacturing order)

| Column | Type | Set by | Rule |
|---|---|---|---|
| unique_id | text (16 hex) | add | Client `request_key` if sent, else `uid16_()`. Row key. |
| id | int | add | `getNextIdUnderLock_(dbId, MFG_SHEET, 'id')` (max+1). |
| mo_number | text `MO-<seq>-<yyyy>` | add | seq = 1 + the largest `<seq>` among all rows (deleted rows included) whose `mo_number` matches `^MO-(\d+)-<current yyyy>$`. Computed inside `executeWithLock_`. |
| mo_date | date | add/edit | Required. |
| product_id | product id | add/edit | Required. The finished product. Must exist in products. |
| planned_qty | number | add/edit | Required, > 0. |
| produced_qty | number | complete | Blank until Completed. Must be > 0 at completion. |
| materials_cost | number | add/edit (estimate), complete (final) | Σ lines.total_cost |
| extra_cost | number | add/edit | ≥ 0. Default 0. Labour/overhead. |
| total_cost | number | derived | materials_cost + extra_cost |
| unit_cost | number | derived | total_cost / planned_qty before completion; total_cost / produced_qty after completion. |
| production_status | text | system | `Open` \| `Completed` \| `Cancelled`. `Open` on add. |
| completion_date | date | complete | Required at completion. |
| completed_by | email | complete | |
| cancelled_at / cancelled_by | date / email | cancel | |
| notes | text | add/edit | Optional. |
| approval_status / approval / approval_time | | approve | `Pending` on add. `approveStep_` sets `Approved`, the email and the time. |
| user, created_at, updated_at, deleted_at, deleted_by, version | | as other tables | Soft delete. `version` starts at 0. |

**`erp_test_manufacture_lines`** (materials consumed by the order)

| Column | Type | Rule |
|---|---|---|
| unique_id | text | `uid16_()` for new lines. Kept on edit if the client sends it. |
| id | int | `getNextIdBatch_(dbId, MFG_LINES_SHEET, n, 'id')` |
| mo_unique_id | text | FK to the order's `unique_id`. |
| product_id | product id | Required. Must **not** equal the order's `product_id`. No product may appear twice in one order. |
| planned_qty | number | Required, > 0. |
| consumed_qty | number | Blank until completion. At completion ≥ 0; the default in the form is planned_qty. |
| unit_cost | number | Estimate on add/edit. At completion it is **snapshotted** as `unitCostOf_(product_id)` (5.3). |
| total_cost | number | qty × unit_cost, where qty = consumed_qty if completed, else planned_qty. |
| notes, user, created_at, updated_at, deleted_at, deleted_by, version | | |

### 5.2 State machine (exact)

```
add ──► [approval=Pending, production=Open]
          │ edit / delete (Full access only; only in this state)
          │ approve (Write) ──► [approval=Approved, production=Open]
          │                         │ complete (Write) ──► [Approved, Completed]   (terminal; stock moves)
          │                         │ cancel (Full)    ──► [Approved, Cancelled]   (terminal; no stock move)
          │ cancel (Full) ──► [Pending, Cancelled]                                  (terminal)
```

- Stock and costs are affected **only** by orders with `production_status = Completed` and an empty `deleted_at`.
- A Completed order can never be edited, deleted or cancelled.

### 5.3 Server steps (all in `Company_ErpTest_Actions.js`, inside the IIFE)

5.3.1 Add constants next to the other sheet constants:
`const MFG_SHEET = 'erp_test_manufacture_orders';` and `const MFG_LINES_SHEET = 'erp_test_manufacture_lines';`

5.3.2 Add `TL_SCHEMAS` entries:
- `schemas[MFG_SHEET] = { key: 'unique_id', required: [], derived: null };`
- `schemas[MFG_LINES_SHEET] = { key: 'unique_id', required: [], derived: null };`

5.3.3 Add the helper `function unitCostOf_(dbId, productId)`. It returns the same unit cost the costing page uses:
- `q = num0_(row.current_qty)` and `c = num0_(row.total_cost_sign)` of the `CURRENT_PRODUCTS_SHEET` row whose `unique_id == productId`.
- Result: `q > 0 ? c / q : 0`.
- Read the rows through `tlDbList_`.

5.3.4 Add `ACTION_DEFINITIONS` entries and `register(...)` calls:

| Action | Handler | page | access | primaryLogTable |
|---|---|---|---|---|
| get_et_manufacture_headers | getManufactureHeaders_ | et_manufacture | read | MFG_SHEET |
| get_et_manufacture_options | getManufactureOptions_ | et_manufacture | read | MFG_SHEET |
| get_et_manufacture_lines | getManufactureLines_ | et_manufacture | read | MFG_LINES_SHEET |
| get_et_manufacture_template | getManufactureTemplate_ | et_manufacture | read | MFG_LINES_SHEET |
| get_et_manufacture_print | getManufacturePrint_ | et_manufacture_print | read | MFG_SHEET |
| add_et_manufacture | addManufacture_ | et_manufacture | write | MFG_SHEET |
| edit_et_manufacture | editManufacture_ | et_manufacture | full | MFG_SHEET |
| delete_et_manufacture | deleteManufacture_ | et_manufacture | full | MFG_SHEET |
| approve_et_manufacture | approveManufacture_ | et_manufacture | write | MFG_SHEET |
| complete_et_manufacture | completeManufacture_ | et_manufacture | write | MFG_SHEET |
| cancel_et_manufacture | cancelManufacture_ | et_manufacture | full | MFG_SHEET |

5.3.5 Handlers. Every error message is in Arabic, exactly as written here.
- **getManufactureHeaders_(data)**
  - Rows = `tlDbList_(MFG_SHEET)`, sorted by `mo_date` descending, then `id` descending.
  - Slice to `data.limit || 20` unless `data.loadAll`.
  - Each row gains `product_name` from `productRefs_`.
  - Return `{status:'success', headers}`.
- **getManufactureOptions_**
  - Returns `{status:'success', options:{ product_options: salesProductOptions_(dbId) }}`. These options include `current_qty` and `default_price`.
- **getManufactureLines_(data.parent_id)**
  - Returns the live lines whose `mo_unique_id == parent_id`, each with `product_name`.
- **getManufactureTemplate_(data.product_id)**
  - Finds the live order with the greatest `id` whose `product_id` matches and whose `production_status != 'Cancelled'`.
  - Returns its lines as `[{product_id, product_name, planned_qty}]`, or `[]`.
- **getManufacturePrint_(data.mo_code)**
  - Returns the header (plus `product_name`) and the lines (plus `product_name`).
  - Throws `'أمر التصنيع غير موجود'` if it is missing.
- **validateManufacture_(header, lines)**, in this order. The first failure throws:
  1. `mo_date` blank → `'تاريخ الأمر مطلوب'`
  2. `product_id` blank → `'المنتج التام مطلوب'`
  3. `num0_(planned_qty) <= 0` → `'الكمية المخططة يجب أن تكون أكبر من صفر'`
  4. `lines.length === 0` → `'يجب إضافة خامة واحدة على الأقل'`
  5. Any line with blank `product_id` → `'الخامة مطلوبة لكل سطر'`
  6. Any line with `product_id == header.product_id` → `'لا يمكن استخدام المنتج التام كخامة'`
  7. Any `product_id` repeated → `'الخامة مكررة في نفس الأمر'`
  8. Any `num0_(line.planned_qty) <= 0` → `'كمية الخامة يجب أن تكون أكبر من صفر'`
  9. `extra_cost` present and `Number(extra_cost) < 0` → `'التكاليف الإضافية لا يمكن أن تكون سالبة'`
- **addManufacture_(data)**
  - Everything runs inside `executeWithLock_`:
    1. `validateManufacture_`.
    2. Dedupe: if the request key is non-empty, run `requestDedupeExecute_(dbId, MFG_SHEET, key, key)`. On a hit, return `liveDedupeReply_(hit, 'تمت إضافة أمر التصنيع')`.
    3. `uid = key || uid16_()`. Compute `mo_number`.
    4. For each line: `unit_cost = unitCostOf_`, `total_cost = planned_qty × unit_cost`.
    5. `materials_cost = Σ`, `total_cost = materials + num0_(extra_cost)`, `unit_cost = total / planned_qty`.
    6. Write the header with `tlDbAppendValues_`, building the row the same way as `buildHeaderValues_` (index by `etHeaders_`). Set `production_status 'Open'`, `approval_status 'Pending'`, `version 0`, `created_at` now, `user` email.
    7. Write the lines with `tlDbAppendValuesBatch_`.
  - After that: `logHistory_(… 'create' …)` and `bustTopLightCaches_(dbId, 'manufacture')`.
  - Return `{status:'success', message:'تمت إضافة أمر التصنيع', unique_id, assignedId: uid, record}`.
- **editManufacture_**
  - Load the order. Throw `'أمر التصنيع غير موجود'` if missing.
  - Require `approval_status Pending` and `production_status Open`, else throw `'لا يمكن تعديل أمر معتمد أو مغلق'`.
  - `validateManufacture_`. Recompute the estimates as in add.
  - `tlDbPatch_` the header with `version: header.version`.
  - Soft-delete the lines with `tlDbSoftDeleteWhere_(MFG_LINES_SHEET, 'mo_unique_id', uid)`, then append the new lines. This is the same pattern Top Light uses; P10 replaces it with a diff.
  - Then log and bust caches.
- **deleteManufacture_**: same state requirement as edit; soft-delete the header and the lines.
- **approveManufacture_**: `assertTransition_('et_manufacture', current.approval_status || 'Pending', 'Approved', 'لا يمكن اعتماد أمر التصنيع من هذه الحالة')`, then `approveStep_('et_manufacture', uid, 'approve', user, {dbId, version})`.
- **completeManufacture_(data = {unique_id, version, produced_qty, completion_date, lines:[{unique_id, consumed_qty}]})**
  - Everything runs inside `executeWithLock_`:
    1. Load the order. It must satisfy `approval_status == 'Approved'` and `production_status == 'Open'`, else throw `'يجب اعتماد الأمر قبل الإكمال'` or `'الأمر مغلق'`.
    2. `num0_(produced_qty) > 0`, else throw `'الكمية المنتجة مطلوبة'`. `completion_date` must be present, else throw `'تاريخ الإكمال مطلوب'`.
    3. Bust the stock cache (`bustTopLightCaches_(dbId,'products')`), then read `currentQtyMap_` fresh.
    4. For each live line: take `consumed_qty` from the payload (default: the line's `planned_qty`). It must be ≥ 0 and ≤ available, else throw `'الكمية المستهلكة من <product_name> تتجاوز الرصيد المتاح (المتاح: <n>)'`.
    5. Per line: snapshot `unit_cost = unitCostOf_`, `total_cost = consumed × unit_cost`, and patch it with `tlDbPatch_`.
    6. Header patch: `materials_cost = Σ line totals`; `total_cost = materials + extra_cost`; `unit_cost = total_cost / produced_qty`; `produced_qty`; `completion_date`; `completed_by`; `production_status 'Completed'`; `version` check.
  - After that: `etRefreshStockSheet_(dbId)` (P7), log, bust caches (`'manufacture'` and `'products'`).
- **cancelManufacture_(data = {unique_id, version})**
  - `production_status` must be `Open`, else throw `'الأمر مغلق'`.
  - Patch `production_status 'Cancelled'`, `cancelled_at`, `cancelled_by`.

5.3.6 In `bustTopLightCaches_`, add: `if (!type || type === 'manufacture') { keys.push('et_qty_map_' + dbId, 'et_price_map_' + dbId); }`. After the P3 regex, the existing key names start with `et_`.

5.3.7 Register the validator next to the other `registerDocValidator_` calls:
`registerDocValidator_('et_manufacture', function(p, dbId){ var h=(p&&p.header)||{}; var l=(p&&p.lines)||[]; return validateManufacture_(h, l); });`

The approval chain, transitions, `actionToDocType` and `statusOnly` entries for `et_manufacture` are already in Appendix 1.

### DONE-CHECK P5
- The static checker exits 0. Extend it: all 11 manufacturing actions are present in `ACTION_DEFINITIONS`.
- `etSchemaCheckRun_` still shows `"ok":true`. The two manufacture tabs are in `ET_FIELD_INVENTORY` from P3 onward.
- **OWNER RUNS** the Appendix 2 test script T-MFG. It prints `PASS` for every case.

---

## PHASE P6 — Manufacturing: pages

6.1 Create `Company_ErpTest_Manufacture.html`.
   - Structure: copy `Company_ErpTest_Purchasing.html`, then replace its body logic with the following. Keep the head includes, `companyCall`, `load()`/`UIC.appShell`, `showError`, `UIC.Live.watchPage` (page `et_manufacture`) and the `openSalesPage_`-style opener.
   - **List:** `get_et_manufacture_headers`. The "show all" bar is the same as sales.
     - Columns: رقم الأمر (`mo_number`), التاريخ (`mo_date` yyyy-mm-dd), المنتج التام (`product_name`), الكمية المخططة, الكمية المنتجة, إجمالي التكلفة, تكلفة الوحدة, الاعتماد (`approval_status`), حالة الإنتاج (`production_status`), and actions.
   - **Row actions** (`UIC.actionBtns`):
     - طباعة: always.
     - اعتماد: if Pending and Open.
     - تعديل: if Pending, Open and `UIC.canFull_()`. Otherwise عرض.
     - حذف: if Pending, Open and `UIC.canFull_()`.
     - إكمال الإنتاج: if Approved and Open.
     - إلغاء: if Open and `UIC.canFull_()`.
   - **Form** (add/edit): the options come from `get_et_manufacture_options` (loaded once).
     - Fields: تاريخ الأمر (date, default today), المنتج التام (select of `product_options`), الكمية المخططة (number), تكاليف إضافية (number, default 0), ملاحظات.
     - Lines grid columns: الخامة (select), الرصيد المتاح (read-only `current_qty`), الكمية المخططة, and a remove button. "إضافة خامة" adds a row.
     - The button "تحميل خامات آخر أمر" calls `get_et_manufacture_template` with the chosen product and replaces the grid.
     - The live footer shows the estimated materials count only (the costs are computed by the server).
     - Save calls `UIC.Live.save({ call: companyCall, action: isEdit ? 'edit_et_manufacture' : 'add_et_manufacture', data: {header, lines, request_key}, queueable: false, reload: …, onSuccess: … })`, the same pattern as `saveSales()`.
   - **Complete dialog:** shows الكمية المنتجة (default = planned_qty), تاريخ الإكمال (default today), and each line with its planned qty, available stock, and a الكمية المستهلكة input (default planned).
     - Submit calls `complete_et_manufacture`.
     - On success, reload the list.
   - Approve, cancel and delete work like `approveSales` / `deleteSales`, using the new action names. A confirm dialog appears before cancel and delete.
6.2 Create `Company_ErpTest_Manufacture_Print.html` by copying `Company_ErpTest_Purchase_Print.html` and replacing:
   - the data call with `get_et_manufacture_print`, using the URL param `mo_code`
   - the header fields: mo_number, dates, finished product, planned/produced qty, statuses
   - the lines table: الخامة, مخطط, مستهلك, تكلفة الوحدة, الإجمالي
   - the totals: materials, extra, total, unit cost
6.3 Extend the static checker so it also scans the 2 new files.

### DONE-CHECK P6
- **OWNER RUNS** `clasp push` and completes the manual script in Appendix 2 T-UI. Each step shows the expected result.

---

## PHASE P7 — Manufacturing integrated into stock and reports

7.1 **Stock becomes code-owned (OD3).** Add `function etComputeStock_(dbId)`, which returns `{ [productId]: {qty, unit_cost, total_cost} }`.
   - `qty(p)` =
     - Σ `purchase_lines.qty` (live, `product == p`)
     - − Σ `sales_lines.product_qty` (live, `product_id == p`)
     - \+ Σ `sales_returns.top_lightreturn_qty` (live, `top_lightsales_products_id == p`)
     - \+ Σ `manufacture_orders.produced_qty` (live, Completed, `product_id == p`)
     - − Σ `manufacture_lines.consumed_qty` (live, whose parent is live and Completed, `product_id == p`)
   - `unit_cost(p)`:
     - If p has ≥ 1 live Completed order, use the `unit_cost` of the one with the greatest `completion_date` (ties: greatest `id`).
     - Else, use `total_cost / qty` of the **first** live purchase line (sheet order) with `product == p` and `qty > 0`. This is the Top Light formula rule verified in P0 check 6.3.
     - Else 0.
   - `total_cost(p) = qty × unit_cost`.
   - **STOP gate:** if the `current_qty` formula recorded in P0 check 6.2 is not the purchase − sales + returns sum, STOP and show the formula to the owner before implementing.
7.2 Add `function etRefreshStockSheet_(dbId)`.
   - Rows: one per live product, ordered by product `id`. Columns (logical): `unique_id` = product id, `product` = name_ar, `unit`, `current_qty`, `unit_cost`, `total_cost_sign`.
   - Write the 6 columns with **one** `Sheets.Spreadsheets.Values.batchUpdate` call: one range per column, starting at row 2, `valueInputOption: 'RAW'`, numbers as numbers.
   - Then clear those 6 columns below the last written row.
   - Resolve column letters from `etHeaders_` + `etCol_`.
   - Call it at the end of: `addPurchasing_`, `editPurchasing_`, `deletePurchasing_`, `addSales_`, `editSales_`, `deleteSales_`, `addSalesReturn_`, `deleteSalesReturn_`, `completeManufacture_`, `addProduct_`, `editProduct_`. Each call is outside the lock, wrapped in `try{}catch(e){}`.
7.3 **OWNER RUNS** once, before the first use: in `erp_test_current_products`, delete all formulas from row 2 down, keeping the headers. Then run `etRefreshStockSheet_('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE')` from a scratch function.
7.4 **Time trigger.** Add `function etStockRefreshJob_()`, which calls `etRefreshStockSheet_` for the company spreadsheet. **OWNER RUNS** once: `ScriptApp.newTrigger('etStockRefreshJob_').timeBased().everyMinutes(15).create()`. `etStockRefreshJob_` must be a global function; define it at file bottom, outside the IIFE, as `function etStockRefreshJob_(){ ErpTest.refreshStock_(getCompanySpreadsheetId_('37fc50edf1424abd')); }`, and export `refreshStock_: etRefreshStockSheet_` in the IIFE's return object.
7.5 **Product movement** (`getProductMovement_`). After the returns block, add:
   - For each live Completed order with `product_id == productId`: movement `{date: completion_date, type:'manufacture_in', reference: mo_number, customer:'', qty_in: produced_qty, qty_out: 0}`.
   - For each live line with `product_id == productId` whose parent is live and Completed: movement `{date: parent.completion_date, type:'manufacture_out', reference: parent.mo_number, customer:'', qty_in:0, qty_out: consumed_qty}`.
   - In `Company_ErpTest_Product_Movement.html`, where types are labelled, add `manufacture_in` → `وارد تصنيع` and `manufacture_out` → `منصرف تصنيع`.
7.6 **Income statement** (`incomeStatementCore_`). In the stock block:
   - After the purchases loop, add a loop over Completed orders:
     - `t = timeOf_(completion_date)`.
     - If before the period: `startQty[product] += produced_qty`, and for each of its lines `startQty[line.product] -= consumed_qty`.
     - If in the period: `mfgQtyIn[product] += produced_qty` and `mfgQtyOut[line.product] += consumed_qty`, and `mfgExtra += num0_(extra_cost)`.
   - Declare `mfgQtyIn = {}`, `mfgQtyOut = {}`, `mfgExtra = 0` next to `purchQtyIn`.
   - End qty: `eq = sq + purch + mfgIn − sales − mfgOut + ret`.
   - Add `mfgQtyIn` and `mfgQtyOut` to the `allPids` sources.
   - `cogs = startVal + purchVal + mfgExtra − endVal`.
   - Add `mfgExtra` to `summary`.
   - In `Company_ErpTest_Income_Statement.html`, add one row `تكاليف تصنيع إضافية` showing `summary.mfgExtra`, directly after the purchases row.
7.7 **Financial position** needs no change: it uses `incomeStatementCore_`.
7.8 **Sales validation** needs no change: it reads `current_products`, which is now code-owned and includes manufacturing.

### DONE-CHECK P7
- **OWNER RUNS** Appendix 2 T-STOCK. It prints PASS.

---

## PHASE P8 — Parity proof (clone == Top Light)

8.1 Create `tools/erptest/parity.gs.txt` with function `etParity_()`:
   1. `var copy = DriveApp.getFileById('1xIGriBRv61Mvchv5xezQkxi7pnS64yH5ITwZrk3DjJ4').makeCopy('ET_PARITY_' + Date.now());`
   2. In the copy:
      - Rename every `top_light_*` tab using B3.
      - In each tab, rename the row-1 headers using `ET_HEADER_MAP` (TL header → ET header).
      - Create the two manufacture tabs empty (headers only, as in P2).
   3. `var su = {email:'parity@local', isSuperAdmin:true, company:'37fc50edf1424abd'};`
   4. For each Top Light read action with fixed test inputs (**Appendix 3**):
      - `a = TopLight.dispatch_({module_action: old, data: input}, su, TL_ID)`
      - `b = ErpTest.dispatch_({module_action: new, data: input}, su, copy.getId())`
      - Diff `jsonSafe_(a)` against `jsonSafe_(b)`.
      - Collect the diffs, ignoring the keys `now`, `created_at` and `asof`.
   5. Log `{pass: diffs.length === 0, diffs: diffs.slice(0, 50)}`.
   6. Trash the copy (`DriveApp.getFileById(copy.getId()).setTrashed(true)`).

   `etParity_` never writes to the Top Light spreadsheet.
8.2 **OWNER RUNS** `etParity_`.

### DONE-CHECK P8
- `pass: true`.
- Any diff means **STOP**. Report the first 10 diffs.
- One exception: `get_et_product_movement` and `get_et_income_statement` may differ only by the manufacturing keys (`mfgExtra: 0`), because the parity copy has no manufacturing rows.

---

## PHASE P9 — JSON read layer (packs)

Flag: at the top of `Company_ErpTest_Actions.js` (inside the IIFE), add `var ET_SJS_READ = false;`. Everything in this phase runs only when it is `true`.

9.1 **Storage.** Extend `etSetupSheets_` (P2) so it also creates the hidden tabs, then **OWNER RUNS** it again:
   - `erp_test__packs`, headers `pack_id, seq, built_at, row_count, bytes, hash, schema_hash, parts, part_1 … part_60`
   - `erp_test__journal`, headers `seq, ts, user, table, op, key, request_key, data_json`
   - `erp_test__meta`, headers `key, value`
9.2 **Pack format** (exact):
   ```json
   {"t":"<erp_test tab>","seq":<int>,"schemaHash":"<sha1 of physical header row>","builtAt":<ms>,"cols":["<logical>",…],"rows":[[…],…]}
   ```
   - It contains live rows only (empty `deleted_at`).
   - Dates are stored as `"yyyy-mm-dd"` when the time part is 00:00. Otherwise they are ISO strings.
   - Ids and keys are strings. Numbers stay numbers.
9.3 **Functions** (inside the IIFE):
   - `etPackBuild_(dbId, tables[])`: builds a pack for each table from the source.
     - One `Sheets.Spreadsheets.Values.batchGet(dbId, {ranges:[<tab>!A1:<lastCol><lastRow> for each], valueRenderOption:'UNFORMATTED_VALUE', dateTimeRenderOption:'SERIAL_NUMBER'})`.
     - Convert date columns with the same epoch rule as `frSerialToDate_`. Date columns are logical names ending in `date` or `_at`, plus `تاريخ الفاتورة` and `reciept date`.
     - Translate headers with `etToLogical_`. Drop soft-deleted rows.
   - `etPackSaveSnapshot_(dbId, pack)`: splits the JSON into ≤ 45,000-character parts and writes one row of `erp_test__packs` (upsert by `pack_id`).
   - `etPackGet_(dbId, table)` resolves in this order:
     1. The request memo.
     2. `getChunkedCache_('etpack_'+dbId+'_'+table)`, if `seq` equals the cached head (`CacheService` key `ethead_`+dbId).
     3. The snapshot row, plus journal rows with `seq > snapshot.seq` (one `batchGet`), applied.
     4. `etPackBuild_`.

     Every level puts the result back into the cache levels above it.
   - `etRows_(dbId, table)`: returns records (objects keyed by logical names) built from the pack.
9.4 **Switch reads.** When `ET_SJS_READ` is true, `tlDbList_(dbId, table)` returns `etRows_(dbId, table)` instead of `etRecords_`-based rows. This is the only change: every handler already reads through `tlDbList_` or the ref accessors built on it.
9.5 **Invalidation while writes are still on the legacy path.** In `bustTopLightCaches_`, also delete `etpack_` for the touched tables (map: `products → PRODUCTS_SHEET, CURRENT_PRODUCTS_SHEET`; `sales → SALES, SALES_LINES, SALES_RETURNS`; `purchasing → PURCHASING, PURCHASING_LINES`; `cash → CASH`; `parties → CUSTOMERS`; `manufacture → MFG, MFG_LINES`), and write `ethead_` = `Date.now()`.
9.6 **Aggregates.** Wrap `customerBalanceMap_`, `currentQtyMap_`, `latestSalesPriceMap_`, `boxBalanceSummary_` and `dashboardKpis_` so each result is cached under `etagg_<name>_<ethead>`, and memoise `incomeStatementCore_` per request by `(dateFrom, dateTo)`.

### DONE-CHECK P9
- `etParity_` is extended to run every read action twice: once with `ET_SJS_READ=false` and once with `ET_SJS_READ=true` on the same copy. Zero diffs.
- **OWNER** records the perf-log timings (`ERP_Perf_Log`) of `get_et_sales_headers`, `get_et_parties` and `get_et_income_statement` before and after. The after value must be lower.

---

## PHASE P10 — JSON write layer (one read, one atomic write)

Flag: `var ET_SJS_WRITE = false;`

10.1 **`etCommit_(dbId, command)`** (inside `executeWithLock_`):
   - Input: `{ ops: [{table, op:'insert'|'patch'|'softDelete', key?, values?}], needIds:{table:count}, needNumber?:{table, column, pattern}, dedupe?:{table, column, value} }`
   - **Read:** one `Sheets.Spreadsheets.Values.batchGet` of:
     - the key column of every table in `ops`
     - the id column of every table in `needIds`
     - the number column in `needNumber`
     - the dedupe column
     - `erp_test__journal!A:A`
   - From that read, compute:
     - the last used row of each table (the last non-empty key cell)
     - `max(id)+1` for each table
     - the next document number
     - dedupe hit → return the committed record
     - next journal `seq` = max + 1
   - **Write:** one `Sheets.Spreadsheets.batchUpdate` whose `requests` are:
     - `appendDimension` (ROWS) for each sheet whose grid is too small
     - `updateCells` for each insert (`start: {sheetId, rowIndex: lastRow, columnIndex: 0}`, full row, `fields:'userEnteredValue'`)
     - `updateCells` for each patch (only the changed columns, one request per contiguous run)
     - `updateCells` soft-delete stamps
     - `updateCells` journal rows (`data_json` = logical record)
   - Values: numbers go to `numberValue`, booleans to `boolValue`, dates to `numberValue` using the `fsStoredValue_` rule (`Core_FastSave.js`), everything else to `stringValue`.
   - Never write a column that P0 listed in `etFormulaCols`.
   - **After the write:** apply the ops to the cached packs, set `ethead_`, and call `noteTableChange_` for each table.
   - Return `{ids, number, journal:[…]}`.
10.2 **Port the writes** so each calls `etCommit_` when `ET_SJS_WRITE` is true. Order, one family per step. After each family, **OWNER RUNS** T-WRITE-<family> from Appendix 2, and the next family starts only after PASS:
   1. products, categories, parties
   2. cash, transfer (`box_balance` = aggregate balance before + signed amount; **no** whole-box rewrite)
   3. purchasing (lines diffed by `unique_id`: update existing, insert new, soft-delete removed)
   4. sales and returns (same line diff; invoice number from `needNumber` pattern `^(\d+)-<yyyy>$`)
   5. offers (number now inside the lock)
   6. manufacturing (add/edit/complete/cancel/delete)
   - Approvals: `etCommit_` patches `{approval_status:'Approved', approval: email, approval_time: now, version: v+1}` after the same `assertTransition_` and version check.
10.3 **Compaction job `etCompactJob_`** (global wrapper like 7.4). Every 15 minutes, for each table with journal rows:
   1. Rebuild the pack from the cached pack.
   2. `etPackSaveSnapshot_`.
   3. Then, under the lock, delete journal rows with `seq ≤ min(snapshot seqs)`.
10.4 **Manual-edit trigger `etOnSheetEdit_(e)`** (installable `onEdit` and `onChange` on the erp_test spreadsheet):
   - Takes the sheet name from `e.range` (onEdit), or marks every table (onChange).
   - Deletes `etpack_` for those tables and sets `ethead_`.
   - **OWNER RUNS** once: `ScriptApp.newTrigger('etOnSheetEdit_').forSpreadsheet('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE').onEdit().create()` and the same with `.onChange()`.
10.5 **Nightly reconcile `etReconcileJob_`** (02:00):
   - For each table, `etPackBuild_` from the source, then compare its row count and key set with the cached pack.
   - Recompute the aggregates from the source packs and compare them with the cached aggregates.
   - Write the result into `erp_test__meta` (`key = 'reconcile_'+date`).
   - On any difference, replace the cache with the source build.

### DONE-CHECK P10
- All T-WRITE-* tests PASS.
- T-ATOMIC PASS: a forced invalid request in the batch leaves no rows written.
- Seven days of reconcile show zero differences.

---

## PHASE P11 — Browser local packs

Flag: `var ET_CLIENT_PACKS = false;`, returned to pages as `r.client_packs`.

11.1 **Server action `get_et_sync`**: page `et_dashboard`, access `read`. Add it to `ACTION_DEFINITIONS` and `register`.
   - Input: `{tables:{<logical table>: <seq>}}`.
   - For each table the user may read (it belongs to `PAGE_TABLES` of a page the user has a read grant on; super admin sees all):
     - `{mode:'same'}` if seq == head
     - else `{mode:'delta', ops:[journal rows with seq > client seq]}` if the client seq ≥ the compaction floor
     - else `{mode:'full', pack}`
   - Tables not allowed are omitted.
11.2 **Client module:** create `Company_ErpTest_Packs.html` (included by each ErpTest page after `Client_Helpers`). It defines `window.ET_PACKS` with:
   - `open()`: IndexedDB database `erp_packs_37fc50edf1424abd_<email>`, store `packs`
   - `get(table)`, `put(table, pack)`, `apply(table, ops)`, `sync(tables[])` (calls `get_et_sync`, then applies the results)
   - `clearAll()`, called from the page on logout (`logout` in `Client_Helpers` is not editable, so each page calls `ET_PACKS.clearAll()` in its logout menu handler) and whenever the stored email differs from the session email
   - Entries older than 7 days are discarded.
   - `erp_test_cash_bank_movement` is never stored. It is always fetched.
11.3 **Page conversion** (in this order: Products, Customers, Sales, Purchasing, Sales_Offer, Manufacture):
   1. On load, render immediately from `ET_PACKS.get` if present.
   2. Then call `ET_PACKS.sync`, and re-render only if something changed.
   3. On save success, apply the returned `journal` ops locally and skip the reload.
   4. `watchPage.onChange` calls `ET_PACKS.sync` instead of a full reload.

### DONE-CHECK P11
- Manual T-CLIENT (Appendix 2) PASS: a warm reload renders before the network reply, logout clears the database, and another user on the same browser does not see the first user's data.

---

## PHASE P12 — Turn on

12.1 Set `ET_SJS_READ = true`. The owner pushes. Watch the perf log and the reconcile for 3 days.
12.2 Set `ET_SJS_WRITE = true`. Push. Watch for 7 days.
12.3 Set `ET_CLIENT_PACKS = true`. Push.
12.4 **Rollback:** set the flag back to `false` and push. Nothing else is needed: the sheets remain the source of truth, and the journal and pack tabs can be left in place.

---

## Appendix 1 — Exact approval policy block for `Company_ErpTest_Actions.js`

```javascript
ErpTest.approvalPolicy_ = {
  aliases: { et_sales_offer: 'et_offer' },
  chains: [
    { docType: 'et_purchasing', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_purchasing_costing', keyColumn: 'unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
    { docType: 'et_sales', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_sales_invoices', keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true, missingMsg: 'الفاتورة غير موجودة' },
    { docType: 'et_cash', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_cash_bank_movement', keyColumn: 'transaction_id', kind: 'cash', versioned: true, missingMsg: 'الحركة غير موجودة' },
    { docType: 'et_sales_offer', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_sales_offer', keyColumn: 'invoice_unique_id', kind: 'standard', versioned: true, missingMsg: 'العرض غير موجود' },
    { docType: 'et_manufacture', step: 'approve', role: 'et_approver', required: true, sheet: 'erp_test_manufacture_orders', keyColumn: 'unique_id', kind: 'standard', versioned: true, missingMsg: 'أمر التصنيع غير موجود' }
  ],
  transitions: {
    et_purchasing: { pending: ['approved'], approved: [] },
    et_sales: { pending: ['approved'], approved: [] },
    et_offer: { pending: ['approved'], approved: [] },
    et_sales_offer: { pending: ['approved'], approved: [] },
    et_cash: { false: ['true'], true: [] },
    et_manufacture: { pending: ['approved'], approved: [] }
  },
  actionToDocType: {
    add_et_purchasing: 'et_purchasing', edit_et_purchasing: 'et_purchasing', delete_et_purchasing: 'et_purchasing', approve_et_purchasing: 'et_purchasing',
    add_et_sales: 'et_sales', edit_et_sales: 'et_sales', delete_et_sales: 'et_sales', approve_et_sales: 'et_sales',
    add_et_sales_offer: 'et_offer', edit_et_sales_offer: 'et_offer', delete_et_sales_offer: 'et_offer', approve_et_sales_offer: 'et_offer',
    add_et_cash: 'et_cash', edit_et_cash: 'et_cash', delete_et_cash: 'et_cash', approve_et_cash: 'et_cash', add_et_transfer: 'et_cash',
    add_et_manufacture: 'et_manufacture', edit_et_manufacture: 'et_manufacture', delete_et_manufacture: 'et_manufacture',
    approve_et_manufacture: 'et_manufacture', complete_et_manufacture: 'et_manufacture', cancel_et_manufacture: 'et_manufacture'
  },
  statusOnly: {
    approve_et_purchasing: true, approve_et_sales: true, approve_et_sales_offer: true, approve_et_cash: true,
    delete_et_purchasing: true, delete_et_sales: true, delete_et_sales_offer: true, delete_et_cash: true,
    approve_et_manufacture: true, delete_et_manufacture: true, complete_et_manufacture: true, cancel_et_manufacture: true
  }
};
```

After the P3 regex, `approveSalesOffer_` calls `assertTransition_('et_offer', …)` and `approveStep_('et_sales_offer', …)`. Both are covered above.

## Appendix 2 — Acceptance tests

The owner runs these on the Testing System spreadsheet. The agent writes each scripted test as a scratch Apps Script function in `tools/erptest/tests.gs.txt`. The function calls `ErpTest.dispatch_` with a super-admin stub and logs PASS/FAIL per case.

**T-MFG** (P5). Seed: products A (component), B (component) and F (finished), and one purchase giving A = 10 and B = 10 in stock.
1. Add an order F×5 with lines A×4 and B×2. Expect: `mo_number` `MO-1-<yyyy>`, Pending/Open, `materials_cost` = 4·uc(A) + 2·uc(B).
2. Add an order with a line whose product = F. Expect the error `لا يمكن استخدام المنتج التام كخامة`.
3. Add an order with A twice. Expect the error `الخامة مكررة في نفس الأمر`.
4. Complete the first order before approving it. Expect `يجب اعتماد الأمر قبل الإكمال`.
5. Approve it, then complete it with produced 5, A consumed 4, B consumed 2. Expect: Completed, `unit_cost` = total/5.
6. Edit the completed order. Expect `لا يمكن تعديل أمر معتمد أو مغلق`.
7. Add a second order F×1 with A×7, approve it, and complete it with A consumed 7. Expect the error `الكمية المستهلكة من A تتجاوز الرصيد المتاح (المتاح: 6)`.
8. Cancel that order. Expect Cancelled. Completing it afterwards → `الأمر مغلق`.
9. Replay step 1 with the same `request_key`. Expect the same `unique_id` and no new row.

**T-STOCK** (P7), after T-MFG:
- `erp_test_current_products` shows A = 6, B = 8 and F = 5.
- F `unit_cost` = the order's `unit_cost`.
- Product movement for F shows one `manufacture_in` of 5.
- The income statement for the current year includes `mfgExtra` = that order's `extra_cost`.
- Selling F×5 is allowed. Selling F×6 fails with the stock error.

**T-UI** (P6, manual):
1. Open `et_manufacture` and create an order with 2 lines. It appears in the list.
2. Use "تحميل خامات آخر أمر" on a new form. The lines load.
3. Approve, then complete from the dialog. The status changes.
4. Print. All fields show.
5. A user with Write but not Full access sees no تعديل, حذف or إلغاء buttons.

**T-WRITE-<family>** (P10): run each family's add/edit/delete/approve twice, with `ET_SJS_WRITE` false and then true, on two fresh parity copies. The resulting sheet rows must be identical, apart from `created_at`/`updated_at`/`approval_time`, row order, and removed dead line rows.

**T-ATOMIC** (P10): call `etCommit_` with one valid insert plus one `updateCells` targeting a non-existent `sheetId`. Expect an exception, and no new rows in either table.

**T-CLIENT** (P11, manual): open Sales, reload with the network throttled (DevTools "Slow 3G"). The list paints before the sync finishes. Log out: IndexedDB `erp_packs_…` is gone.

## Appendix 3 — Parity inputs for `etParity_`

For each item: the action followed by the `data` object. Use the Top Light name and the matching B4 new name.

| Action | Inputs |
|---|---|
| get_products | `{}` |
| get_parties | `{}` and `{direction:'customer'}` |
| get_purchasing_headers | `{loadAll:true}` |
| get_purchasing_options | `{}` |
| get_purchasing_lines | `{parent_id:<first header unique_id>}` |
| get_purchase_print | `{purchase_code:<same>}` |
| get_sales_headers | `{loadAll:true}` |
| get_sales_options | `{}` |
| get_sales_lines, get_sales_print, get_sales_costing, get_sales_returns | the first invoice's `invoice_unique_id` in the matching field (`parent_id` / `sales_code` / `sales_code` / `invoice_id`) |
| get_cash_headers | `{loadAll:true}` |
| get_customer_statement | `{customer_id:<first party id>}` |
| get_sales_offer_headers | `{loadAll:true}` |
| get_sales_analysis, get_sales_costing_analysis, get_income_statement | `{date_from:'2025-01-01', date_to:'2025-12-31'}` |
| get_financial_position | `{date_from:'2025-01-01', date_to:'2025-12-31'}` |
| get_cash_report | `{}` |
| get_purchase_needs | `{}` |
| get_product_movement | `{product_id:<first product id>}` |
| get_kpi_data | `{}` |

The "first" ids are read from the Top Light spreadsheet at the start of the run, and the same values are passed to both sides.
