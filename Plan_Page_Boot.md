# Execution Plan: page boot — every Google Sheets page shows its data without a second round trip

**Plan version:** 1
**Date:** 2026-09-30
**Status:** Plan only. Nothing in this plan has been executed. Runs in one go, P0 → P7, and ends with a git tag and one `clasp push` (no deploy). Every tool it runs has been run end to end on a copy of this checkout (all six waves, all checks PASS).
**Scope:** every page of the system. 126 pages are switched on, in six waves; the other 24 are left exactly as they are, each with a written reason (PART F).
**Executor:** any model that can run shell commands and read their output. No code is written by the executor: every change is made by a tool in `tools/pageboot/`, and every step says what to run and what the output must say.

---

## PART A — Rules for the executor (read before anything else)

- **A1. The executor runs P0 → P7 in one go, in numerical order, without waiting for approval between phases** (owner decision, 2026-09-30). Each phase starts only after the previous phase's DONE-CHECK passed. The only thing that pauses the run is a STOP condition (A4).
- **A2. Only run the commands this plan lists, exactly as written, from the repository root.** Do not edit any file by hand. Do not "fix" a tool, a patch, a test or the inventory.
- **A3. `clasp push` is run exactly once, in P7, after every wave has passed.** Never run `clasp deploy` or `clasp push --force`, never create or change a deployment, never write to a Google Sheet, Firestore or Script Properties.
- **A4. STOP conditions.** Stop immediately — do not run the next command — and report the command plus every `FAIL` line verbatim when:
  - any command exits with a non-zero code;
  - any output line starts with `FAIL`;
  - `git status --short` shows a changed file the step did not name;
  - a command asks a question (for example `clasp push` asking to overwrite the manifest): answer nothing, stop.
  Do not retry with changes, do not guess a fix. `apply.js` never changes anything when it fails, so stopping is always safe.
- **A5. Git:** work on branch `perf/page-boot`; one commit per phase with exactly the message the phase gives; one tag, `page-boot-v1`, in P7. **Never `git push`**, never rebase, amend, reset, stash or delete.
- **A6. Do not touch** `tools/pageboot/inventory.json`, `inventory.md`, `overrides.json`, `waves.json`, `manifest.json`, anything under `tools/pageboot/patches/` or `tools/pageboot/files/`, or `Page_Boot_Reads.js`. They are data the tools read; `Page_Boot_Reads.js` is generated.

---

## PART B — Fixed facts (verified in this checkout on 2026-09-30)

### B1. What is slow, and what this plan removes

Every `google.script.run` round trip costs about **6 seconds before the first line of this project runs** (measured: an empty function takes 5.5–6.6 s; the project's own code is under 1 s of any request). A page today pays it twice after it loads: once for `get_page_versions` (the device cache asks for stamps first) and once for its list.

This plan runs a page's first reads **while the page is being rendered** and puts the replies inside the HTML. Measured on the two pilot pages (median, click → rows on screen):

| page | before | embedded | saved |
|---|---|---|---|
| et_customers (8 samples / 5) | 25.6 s | **9.8 s** | 15.8 s (62%) |
| et_products (9 / 5) | 25.0 s | **14.4 s** | 10.7 s (43%) |

### B2. How it works (no page changes)

| piece | where | what it does |
|---|---|---|
| the reads | `Page_Boot_Reads.js` (generated) | page action → `{ company, reads: [{ action, data }] }`, from the inventory |
| the injection | `Code.js` `pageBootInject_` + one line in `doGet` | runs the reads (read-only, same authorization as a normal read), puts `window.__PAGE_BOOT__ = {…}` and the runtime first in `<head>` |
| the runtime | `Page_Boot.html` | delivered by the injection, never included by a page; answers a matching first call once; times the page; the super-admin «⏱ السرعة» panel |
| the hook | `Client_Helpers.html` `API.call` | asks `PageBoot.answer` first; everything else goes on exactly as before through `API._callInner` |

Guarantees (each is tested by `check.js`):
- A read that is not a `get_` action is refused before it runs. A page never writes anything by being rendered.
- A read that fails, or whose reply is larger than 300 KB (Script Property `PAGE_BOOT_MAX_BYTES`), is simply not embedded: the page fetches it as it does today.
- A page not listed in `Page_Boot_Reads.js` gets nothing injected. Its behaviour is unchanged.
- **Off switch:** Script Property `PAGE_BOOT_OFF` = `1` stops every injection on the next page load, with no deploy. `?embed=0` on a URL turns it off for that one load.
- Data values the server fills in per request: `$param:<name>` (a URL parameter), `$sessionToken`, `$scriptUrl`, `$date:today`, `$date:monthStart`, `$date:monthEnd`, `$date:year` (Africa/Cairo). If the browser would send something different (e.g. a different day around midnight), nothing breaks: the page fetches as today.

### B3. The inventory

`node tools/pageboot/inventory.js` runs every page's own script in a sandbox and records what it asks the server for when it opens. The result (`tools/pageboot/inventory.json`, human copy `inventory.md`) gives every one of the **150 pages** exactly one decision:

| decision | pages | meaning |
|---|---|---|
| BOOT | 126 | switched on by this plan |
| SKIP_MYSQL | 10 | a first read reaches MySQL — out of scope by owner decision |
| SKIP_SYSTEM | 5 | system pages whose first reads are Firestore / admin routes, not company sheets |
| SKIP_NO_READ | 4 | the page asks for nothing until the user acts |
| SKIP_PUBLIC | 3 | public pages: no signed-in user to authorize a read |
| SKIP_DIRECT | 1 | calls `google.script.run` directly (the measurement page `et_customers_perf`) |
| SKIP_PARAM | 1 | reshapes a URL parameter before sending it (`vf_mfg_client_report`) |

PART F lists every page, its decision and its reads or reason.

### B4. Known limits (not failures)

- **Partial pages** — after the first reply they ask for something that depends on it, which cannot be embedded: `vf_sales`, `vf_sales_report`, `vf_parties`, `vf_purchasing`. They still save the first round trip.
- **Later parts, by design** — `et_customers` (balances) and `et_products` (stock) fetch their heavy part in the background after the table shows.
- **In-app router pages** (`et_dashboard`, `et_kpi`, `et_analysis_review`, `tl_dashboard`, `tl_kpi`, `tl_analysis_review`) get the boot on a full page load; a soft navigation between router pages loads as today.

---

## PART C — Phases

### P0 — Start state and baseline

1. **Branch.** `git branch --show-current` — note the name.
   - If it is already `perf/page-boot`: nothing to do, go to step 2.
   - Otherwise: `git branch --list perf/page-boot` must print nothing (if it prints the name, STOP: the branch exists from an earlier attempt). Then `git checkout -b perf/page-boot` — this carries every uncommitted change of the folder onto the new branch.
2. **Starting state.** `git status --short` — note the full output for the report.
   - If it prints nothing: nothing to do, go to step 3.
   - Otherwise: `git add -A`, then `git commit -m "page_boot: starting state (the folder as it was before the plan)"`. By owner decision this commits **everything** in the folder as it is, including the owner's own unrelated work in progress.
3. `git status --short` — must print **nothing** now. Anything else: STOP.
4. `node tools/pageboot/inventory.js` — prints one line of counts. It must be exactly:
   `{"SKIP_PUBLIC":3,"SKIP_SYSTEM":5,"SKIP_NO_READ":4,"BOOT":126,"SKIP_DIRECT":1,"SKIP_MYSQL":10,"SKIP_PARAM":1}`
5. `git diff --exit-code tools/pageboot/inventory.json` — must exit 0 (the pages still send what the plan was written against). If not, STOP: a page changed since the plan was written.
6. `node tools/pageboot/check.js --baseline` — must print `PASS  baseline recorded: …`. It records which `npm run verify` checks pass today, so later phases can prove nothing got worse. (A few minutes.)

**DONE-CHECK P0:** steps 3–6 printed what they must. Commit: `page_boot P0: baseline` (adds `tools/pageboot/verify_baseline.json`). Continue with P1.

### P1 — Wave 1: the framework + the two pilot pages

1. `node tools/pageboot/apply.js --wave 1 --dry-run` — every step must say `will apply` / `will replace` / `will run`, and the last line must be `wave 1: dry run — every step is ready; nothing was written.` Anything else: STOP.
2. `node tools/pageboot/apply.js --wave 1` — the last line must be `wave 1: applied. …`. It changes `Code.js`, `Client_Helpers.html`, `Page_Boot.html`, `Company_ErpTest_Customers.html`, `Company_ErpTest_Products.html`, writes `Page_Boot_Reads.js` (2 pages) and regenerates `design_preview/_sources.js` — seven files.
3. `node tools/pageboot/check.js --wave 1` — every line PASS, last line `wave 1: all checks PASS`.
4. `git status --short` — the changed files must be exactly the seven named in step 2. Anything else: STOP.

**DONE-CHECK P1:** steps 1–4. Commit: `page_boot P1: framework + pilot (et_customers, et_products)`. Continue with P2.

### P2 … P6 — The remaining waves

Each wave is the same four steps, with its number `N`, one wave per phase:

1. `node tools/pageboot/apply.js --wave N --dry-run` — last line `wave N: dry run — every step is ready; nothing was written.`
2. `node tools/pageboot/apply.js --wave N` — last line `wave N: applied. …`
3. `node tools/pageboot/check.js --wave N` — last line `wave N: all checks PASS`
4. `git status --short` — the only changed file is `Page_Boot_Reads.js`. Anything else: STOP.

Commit: `page_boot PN: wave N — <title>`, then continue with the next wave.

| phase | N | title | pages added |
|---|---|---|---|
| P2 | 2 | ErpTest | 24 |
| P3 | 3 | TopLight | 23 |
| P4 | 4 | ValleyFoods | 43 |
| P5 | 5 | TopChemical (Sheets pages) | 28 |
| P6 | 6 | Assessment | 6 |

### P7 — Tag, push to Apps Script, report

1. `git status --short` — must print nothing. Anything else: STOP.
2. `git tag --list page-boot-v1` — must print nothing (if it prints the name, STOP). Then `git tag -a page-boot-v1 -m "page boot: 126 pages embed their first reads (Plan_Page_Boot.md)"`.
3. `clasp push` — must finish without a question and report the files pushed (e.g. `Pushed 180 files.`). If it asks anything, or prints an error: STOP and report — the git side is complete and tagged either way. **Never `clasp deploy`, never `--force`.**
4. Report, in this order:
   1. `git log --oneline` from the starting-state commit (or P0's commit) to the tag, and `git show --stat --oneline page-boot-v1 | head -5`;
   2. the full output of `node tools/pageboot/check.js --wave 6` from P6;
   3. the last lines of `clasp push`;
   4. the pages in PART F whose decision is not BOOT, unchanged;
   5. anything that differed from the plan, one sentence each with the file and the command that showed it;
   6. PART C «P8» below, copied as it is, for the owner.

### P8 — Owner checks after the run (OWNER, not the executor)

`clasp push` updates the project's code (HEAD) only; this plan never creates or updates a deployment. Test on the URL that runs HEAD (the `/dev` test URL, or your deployment if it serves HEAD). A versioned `/exec` deployment keeps the old code until the owner deploys.

1. Open **العملاء والموردون** as super admin → «⏱ السرعة» (bottom-left) → «مسح» → «قياس ٣ مرات لكل طريقة». Press «التالي» / «كمّل» when shown, until «القياس خلص». Expect «جوه الصفحة» clearly faster than «من غير» (earlier measurement: ≈10 s against ≈24 s on this page, ≈14 s against ≈23 s on المنتجات). Same on **المنتجات**.
2. Check those two pages work as before: search, sort, add/edit a record, balances/stock fill in.
3. Spot-check one page per company — each must open with correct data and the panel must show «طلبات اتجاوبت من جوه الصفحة» ≥ 1:

   | company | pages |
   |---|---|
   | ErpTest | et_sales, et_purchasing, et_cash, et_sales_print (open from a sales row), et_manufacture |
   | TopLight | tl_sales, tl_customers, tl_cash, tl_sales_print, tl_dashboard |
   | ValleyFoods | vf_sales, vf_products, vf_hr_employees, vf_hr_attendance, vf_income_statement, vf_mfg_orders |
   | TopChemical | tc_products, tc_stock_revision, tc_dashboard, tc_emp_salaries, tc_budget_inputs |
   | Assessment | ac_dashboard, ac_assessments, ac_results |

4. Off switch drill: Project Settings → Script Properties → add `PAGE_BOOT_OFF` = `1`; reload any of those pages: the panel button is gone and the page loads as before. Delete the property; reload: the panel is back.
5. If a page misbehaves: set `PAGE_BOOT_OFF` = `1` at once (every page back to the old behaviour, no deploy), then see PART D.

---

## PART D — Rollback

- **Instantly, no deploy (OWNER):** Script Property `PAGE_BOOT_OFF` = `1`. Every page loads as before on its next load.
- **One wave back (executor + owner push):** `node tools/pageboot/gen_reads.js --wave N-1`, then `node tools/pageboot/check.js --wave N-1`, commit `page_boot: back to wave N-1`, owner `clasp push`.
- **Everything (executor):** `git revert` the phase commits from newest to oldest; owner `clasp push`.

---

## PART E — What this plan deliberately does not do

- It does not touch any MySQL page, system page, public page, or `vf_mfg_client_report` (PART F says why for each).
- It does not split any other page's heavy part (like the balances on `et_customers`). The panel shows where that would pay; each is a separate, measured change.
- It does not remove the diagnostic leftovers from the measurement work: the `et_customers_perf` page, `diagPing` and the `diag_timing` breakdown in `Code.js`. Removing them is the owner's call.
- It does not change the soft-navigation router (`getPageBody_`).

---

## PART F — Every page

Generated from `tools/pageboot/inventory.json`. «wave» is the phase that switches the page on.

| # | company | page | decision | wave | reads (BOOT) / reason |
|---|---|---|---|---|---|
| 1 | System | `login` | SKIP_PUBLIC | — | public page: no signed-in user to authorize an embedded read |
| 2 | System | `setup` | SKIP_PUBLIC | — | public page: no signed-in user to authorize an embedded read |
| 3 | System | `ERPDashboard` | SKIP_SYSTEM | — | first reads are router routes: get_dashboard_data |
| 4 | System | `ERP_Management` | SKIP_NO_READ | — | no read when the page opens (data loads only after a user action) |
| 5 | System | `user_sessions` | SKIP_SYSTEM | — | first reads are router routes: list_my_sessions |
| 6 | System | `user_views` | SKIP_SYSTEM | — | first reads are router routes: list_user_views |
| 7 | System | `record_history` | SKIP_NO_READ | — | no read when the page opens (data loads only after a user action) |
| 8 | System | `db_live_viewer` | SKIP_SYSTEM | — | first reads are router routes: db_list_tables |
| 9 | System | `perf_dashboard` | SKIP_SYSTEM | — | first reads are router routes: get_perf_dashboard |
| 10 | Assessment | `ac_dashboard` | BOOT | 6 | `get_ac_dashboard {}` |
| 11 | Assessment | `ac_assessments` | BOOT | 6 | `get_page_versions {"page":"ac_assessments"}`<br>`get_ac_assessments {}` |
| 12 | Assessment | `ac_assessment_form` | BOOT | 6 | `get_ac_assessment {"id":"$param:id"}` |
| 13 | Assessment | `ac_batches` | BOOT | 6 | `get_page_versions {"page":"ac_batches"}`<br>`get_ac_batches {}`<br>`get_ac_assessments {}` |
| 14 | Assessment | `ac_results` | BOOT | 6 | `get_ac_results {}` |
| 15 | Assessment | `ac_result_view` | BOOT | 6 | `get_page_versions {"page":"ac_results"}`<br>`get_ac_result {"id":"$param:assignment"}` |
| 16 | Assessment | `ac_take` | SKIP_PUBLIC | — | public page: no signed-in user to authorize an embedded read |
| 17 | ErpTest | `et_dashboard` | BOOT | 2 | `get_et_dashboard_data {}` |
| 18 | ErpTest | `et_kpi` | BOOT | 2 | `get_et_kpi_data {}` |
| 19 | ErpTest | `et_analysis_review` | BOOT | 2 | `get_et_dashboard_data {}` |
| 20 | ErpTest | `et_products` | BOOT | 1 | `get_page_versions {"page":"et_products"}`<br>`get_et_products {"skipStock":true}`<br>_partial: then get_et_products_ |
| 21 | ErpTest | `et_categories` | BOOT | 2 | `get_page_versions {"page":"et_categories"}`<br>`get_et_categories {}` |
| 22 | ErpTest | `et_customers` | BOOT | 1 | `get_page_versions {"page":"et_customers"}`<br>`get_et_parties {"direction":"","skipBalances":true}`<br>_partial: then get_et_parties_ |
| 23 | ErpTest | `et_customers_perf` | SKIP_DIRECT | — | calls google.script.run directly (diagPing), not through API.call |
| 24 | ErpTest | `et_purchasing` | BOOT | 2 | `get_page_versions {"page":"et_purchasing"}`<br>`get_et_purchasing_headers {}` |
| 25 | ErpTest | `et_purchase_print` | BOOT | 2 | `get_et_purchase_print {"purchase_code":"$param:purchase_code"}` |
| 26 | ErpTest | `et_sales` | BOOT | 2 | `get_page_versions {"page":"et_sales"}`<br>`get_et_sales_headers {}` |
| 27 | ErpTest | `et_sales_offer` | BOOT | 2 | `get_page_versions {"page":"et_sales_offer"}`<br>`get_et_sales_offer_headers {}` |
| 28 | ErpTest | `et_sales_print` | BOOT | 2 | `get_et_sales_print {"sales_code":"$param:purchase_code"}` |
| 29 | ErpTest | `et_sales_costing_print` | BOOT | 2 | `get_et_sales_costing {"sales_code":"$param:purchase_code"}` |
| 30 | ErpTest | `et_sales_release` | BOOT | 2 | `get_et_sales_print {"sales_code":"$param:purchase_code"}` |
| 31 | ErpTest | `et_sales_returns` | BOOT | 2 | `get_et_sales_returns {"invoice_id":"$param:purchase_code"}` |
| 32 | ErpTest | `et_sales_offer_print` | BOOT | 2 | `get_et_sales_offer_print {"offer_code":"$param:purchase_code"}` |
| 33 | ErpTest | `et_sales_analysis` | BOOT | 2 | `get_et_sales_analysis {"date_from":"","date_to":"","customer_id":"","product_id":""}` |
| 34 | ErpTest | `et_sales_costing_analysis` | BOOT | 2 | `get_et_sales_costing_analysis {"date_from":"","date_to":""}` |
| 35 | ErpTest | `et_income_statement` | BOOT | 2 | `get_et_income_statement {"date_from":"","date_to":""}` |
| 36 | ErpTest | `et_financial_position` | BOOT | 2 | `get_et_financial_position {"date_from":"","date_to":"","recalc_running":false}` |
| 37 | ErpTest | `et_cash` | BOOT | 2 | `get_et_cash_headers {"loadAll":true}` |
| 38 | ErpTest | `et_cash_report` | BOOT | 2 | `get_et_cash_report {"date_from":"","date_to":"","box":"","type":""}` |
| 39 | ErpTest | `et_customer_statement` | BOOT | 2 | `get_et_customer_statement {"customer_id":"$param:purchase_code","date_from":"","date_to":""}` |
| 40 | ErpTest | `et_purchase_needs` | BOOT | 2 | `get_et_purchase_needs {}` |
| 41 | ErpTest | `et_product_movement` | BOOT | 2 | `get_et_product_movement {"product_id":"$param:purchase_code","date_from":"","date_to":""}` |
| 42 | ErpTest | `et_manufacture` | BOOT | 2 | `get_page_versions {"page":"et_manufacture"}`<br>`get_et_manufacture_headers {}` |
| 43 | ErpTest | `et_manufacture_print` | BOOT | 2 | `get_et_manufacture_print {"mo_code":"$param:mo_code"}` |
| 44 | TopChemical | `tc_dashboard` | BOOT | 5 | `get_dashboard_data {"year":"$date:year"}` |
| 45 | TopChemical | `tc_executive_followup` | SKIP_MYSQL | — | get_executive_followup_summary (getExecutiveFollowupSummary_ → dbExecutiveSummary_) |
| 46 | TopChemical | `tc_kpi` | BOOT | 5 | `get_kpi_data {"year":"$date:year"}` |
| 47 | TopChemical | `tc_main_review` | SKIP_MYSQL | — | get_main_review (getMainReview_ → dbClientsArList_) |
| 48 | TopChemical | `tc_client_balance_sheets` | SKIP_MYSQL | — | get_client_balance_sheets (getClientBalanceSheets_ → dbClientBalanceSheetsList_) |
| 49 | TopChemical | `tc_box_analysis` | SKIP_MYSQL | — | get_box_analysis (getBoxAnalysis_ → dbBoxList_) |
| 50 | TopChemical | `tc_clients_vendors` | BOOT | 5 | `get_page_versions {"page":"tc_clients_vendors"}`<br>`get_clients_vendors {}` |
| 51 | TopChemical | `tc_debts` | BOOT | 5 | `get_page_versions {"page":"tc_debts"}`<br>`get_ar_ap {}` |
| 52 | TopChemical | `tc_products` | BOOT | 5 | `get_page_versions {"page":"tc_products"}`<br>`get_products {}` |
| 53 | TopChemical | `tc_barcode` | BOOT | 5 | `get_page_versions {"page":"tc_barcode"}`<br>`get_barcode {}` |
| 54 | TopChemical | `tc_registration_papers` | BOOT | 5 | `get_page_versions {"page":"tc_registration_papers"}`<br>`get_registration_papers {"loadAll":true}` |
| 55 | TopChemical | `tc_trust` | BOOT | 5 | `get_page_versions {"page":"tc_trust"}`<br>`get_trust_accounts {}` |
| 56 | TopChemical | `tc_stock_revision` | BOOT | 5 | `get_page_versions {"page":"tc_stock_revision"}`<br>`get_stock_revision {"loadAll":true}` |
| 57 | TopChemical | `tc_stock_scan` | SKIP_MYSQL | — | get_stock_scan_warehouses (get_stock_scan_warehouses → getStockScanWarehouses_ → dbStockScanWarehouses_); get_stock_scan_catalog (get_stock_scan_catalog → getStockScanCatalog_) |
| 58 | TopChemical | `tc_customs_office` | BOOT | 5 | `get_page_versions {"page":"tc_customs_office"}`<br>`get_customs_office {"scriptUrl":"$scriptUrl","sessionToken":"$sessionToken"}` |
| 59 | TopChemical | `tc_purchasing` | BOOT | 5 | `get_page_versions {"page":"tc_purchasing"}`<br>`get_purchase_items {}` |
| 60 | TopChemical | `tc_import_follow` | BOOT | 5 | `get_page_versions {"page":"tc_import_follow"}`<br>`get_import_follow {}` |
| 61 | TopChemical | `tc_carton_sizes` | BOOT | 5 | `get_page_versions {"page":"tc_carton_sizes"}`<br>`get_carton_sizes {}` |
| 62 | TopChemical | `tc_employee_reg` | BOOT | 5 | `get_employees {}` |
| 63 | TopChemical | `tc_employee_status` | BOOT | 5 | `get_employee_status {"loadAll":true}` |
| 64 | TopChemical | `tc_employee_salary` | BOOT | 5 | `get_employee_salary {}` |
| 65 | TopChemical | `tc_emp_deductions` | BOOT | 5 | `get_emp_deductions {"loadAll":true}` |
| 66 | TopChemical | `tc_emp_permits` | BOOT | 5 | `get_emp_permits {"loadAll":true}` |
| 67 | TopChemical | `tc_emp_overtime` | BOOT | 5 | `get_emp_overtime {"loadAll":true}` |
| 68 | TopChemical | `tc_emp_salaries` | BOOT | 5 | `get_emp_salaries {"loadAll":true}` |
| 69 | TopChemical | `tc_emp_salaries_close` | BOOT | 5 | `get_payroll_months {}` |
| 70 | TopChemical | `tc_budget_parties` | BOOT | 5 | `get_page_versions {"page":"tc_budget_parties"}`<br>`get_legal_parties {}` |
| 71 | TopChemical | `tc_budget_stock_balance` | SKIP_MYSQL | — | get_legal_stock_balance (getLegalStockBalance_ → systemQtyMap_) |
| 72 | TopChemical | `tc_budget_inputs` | BOOT | 5 | `get_page_versions {"page":"tc_budget_inputs"}`<br>`get_legal_inputs {}`<br>`get_budget_refs {}`<br>`get_legal_parties {}` |
| 73 | TopChemical | `tc_budget_manufacture` | BOOT | 5 | `get_page_versions {"page":"tc_budget_manufacture"}`<br>`get_legal_manufacture {}`<br>`get_budget_refs {}` |
| 74 | TopChemical | `tc_budget_invoices` | BOOT | 5 | `get_page_versions {"page":"tc_budget_invoices"}`<br>`get_budget_refs {}`<br>`get_legal_invoices {"month":"","year":"","from_date":"","to_date":"","search":"","offset":0,"limit":200}`<br>`get_legal_cash {"offset":0,"limit":10000}` |
| 75 | TopChemical | `tc_budget_cash` | BOOT | 5 | `get_budget_refs {}`<br>`get_legal_cash {"transaction_type":"","transaction_method":"","related_box":"","offset":0,"limit":200}` |
| 76 | TopChemical | `tc_budget_hr` | BOOT | 5 | `get_legal_hr {}` |
| 77 | TopChemical | `tc_budget_income` | BOOT | 5 | `get_budget_refs {}`<br>`get_income_statement {}` |
| 78 | TopChemical | `tc_manufacture_orders` | SKIP_MYSQL | — | get_manufacture_headers (getManufactureHeaders_ → dbManufactureList_) |
| 79 | TopChemical | `tc_production_capability` | SKIP_MYSQL (manual) | — | the product picker (UIC.TcCapabilityPicker) loads get_production_capability_catalog on open; ACTION_TABLES maps it to mysql:manuf_product_support_capability (manual — see overrides.json) |
| 80 | TopChemical | `tc_sales_capacity` | SKIP_MYSQL (manual) | — | the product picker (UIC.TcCapabilityPicker) loads get_sales_capacity_catalog on open; ACTION_TABLES maps it to mysql:manuf_product_support_capability (manual — see overrides.json) |
| 81 | TopChemical | `tc_products_live` | SKIP_MYSQL | — | get_products_live (getProductsLive_ → dbProductsLiveList_) |
| 82 | TopChemical | `tc_financial_ratios` | SKIP_NO_READ | — | no read when the page opens (data loads only after a user action) |
| 83 | TopLight | `tl_dashboard` | BOOT | 3 | `get_dashboard_data {}` |
| 84 | TopLight | `tl_kpi` | BOOT | 3 | `get_kpi_data {}` |
| 85 | TopLight | `tl_analysis_review` | BOOT | 3 | `get_dashboard_data {}` |
| 86 | TopLight | `tl_products` | BOOT | 3 | `get_page_versions {"page":"tl_products"}`<br>`get_products {}` |
| 87 | TopLight | `tl_customers` | BOOT | 3 | `get_page_versions {"page":"tl_customers"}`<br>`get_parties {"direction":""}` |
| 88 | TopLight | `tl_purchasing` | BOOT | 3 | `get_page_versions {"page":"tl_purchasing"}`<br>`get_purchasing_headers {}` |
| 89 | TopLight | `tl_purchase_print` | BOOT | 3 | `get_purchase_print {"purchase_code":"$param:purchase_code"}` |
| 90 | TopLight | `tl_sales` | BOOT | 3 | `get_page_versions {"page":"tl_sales"}`<br>`get_sales_headers {}` |
| 91 | TopLight | `tl_sales_offer` | BOOT | 3 | `get_page_versions {"page":"tl_sales_offer"}`<br>`get_sales_offer_headers {}` |
| 92 | TopLight | `tl_sales_print` | BOOT | 3 | `get_sales_print {"sales_code":"$param:purchase_code"}` |
| 93 | TopLight | `tl_sales_costing_print` | BOOT | 3 | `get_sales_costing {"sales_code":"$param:purchase_code"}` |
| 94 | TopLight | `tl_sales_release` | BOOT | 3 | `get_sales_print {"sales_code":"$param:purchase_code"}` |
| 95 | TopLight | `tl_sales_returns` | BOOT | 3 | `get_sales_returns {"invoice_id":"$param:purchase_code"}` |
| 96 | TopLight | `tl_sales_offer_print` | BOOT | 3 | `get_sales_offer_print {"offer_code":"$param:purchase_code"}` |
| 97 | TopLight | `tl_sales_analysis` | BOOT | 3 | `get_sales_analysis {"date_from":"","date_to":"","customer_id":"","product_id":""}` |
| 98 | TopLight | `tl_sales_costing_analysis` | BOOT | 3 | `get_sales_costing_analysis {"date_from":"","date_to":""}` |
| 99 | TopLight | `tl_income_statement` | BOOT | 3 | `get_income_statement {"date_from":"","date_to":""}` |
| 100 | TopLight | `tl_financial_position` | BOOT | 3 | `get_financial_position {"date_from":"","date_to":"","recalc_running":false}` |
| 101 | TopLight | `tl_cash` | BOOT | 3 | `get_cash_headers {"loadAll":true}` |
| 102 | TopLight | `tl_cash_report` | BOOT | 3 | `get_cash_report {"date_from":"","date_to":"","box":"","type":""}` |
| 103 | TopLight | `tl_customer_statement` | BOOT | 3 | `get_customer_statement {"customer_id":"$param:purchase_code","date_from":"","date_to":""}` |
| 104 | TopLight | `tl_purchase_needs` | BOOT | 3 | `get_purchase_needs {}` |
| 105 | TopLight | `tl_product_movement` | BOOT | 3 | `get_product_movement {"product_id":"$param:purchase_code","date_from":"","date_to":""}` |
| 106 | ValleyFoods | `vf_dashboard` | BOOT | 4 | `get_valley_mfg_orders {}`<br>`get_valley_sales_list {}`<br>`get_valley_products {}`<br>`get_valley_parties {}` |
| 107 | ValleyFoods | `vf_kpi` | BOOT | 4 | `get_kpi_data {}` |
| 108 | ValleyFoods | `vf_hr_employees` | BOOT | 4 | `get_valley_hr_page {}` |
| 109 | ValleyFoods | `vf_hr_status` | BOOT | 4 | `get_valley_hr_page {}` |
| 110 | ValleyFoods | `vf_hr_shifts` | BOOT | 4 | `get_shift_assignment_data {}` |
| 111 | ValleyFoods | `vf_hr_salary` | BOOT | 4 | `get_salary_data {}` |
| 112 | ValleyFoods | `vf_hr_deductions` | BOOT | 4 | `get_deductions_data {}` |
| 113 | ValleyFoods | `vf_hr_contracts` | BOOT | 4 | `get_contracts_data {}` |
| 114 | ValleyFoods | `vf_hr_vacation_alloc` | BOOT | 4 | `get_vacation_alloc_data {}` |
| 115 | ValleyFoods | `vf_hr_vacations` | BOOT | 4 | `get_vacations_data {"limit":20}` |
| 116 | ValleyFoods | `vf_hr_overtime` | BOOT | 4 | `get_overtime_data {"limit":20}` |
| 117 | ValleyFoods | `vf_hr_monthly_salaries` | BOOT | 4 | `get_monthly_salaries_data {"month":"","year":""}` |
| 118 | ValleyFoods | `vf_hr_attendance` | BOOT | 4 | `get_attendance_sessions {"from":"$date:monthStart","to":"$date:monthEnd"}`<br>`get_attendance_review {"status":"open","loadAll":true}`<br>`get_attendance_exceptions {"from":"$date:monthStart","to":"$date:today","loadAll":true}`<br>`get_attendance_batches {"limit":20}` |
| 119 | ValleyFoods | `vf_hr_settings_overtime` | BOOT | 4 | `get_overtime_roles_settings {}` |
| 120 | ValleyFoods | `vf_hr_settings_deduction` | BOOT | 4 | `get_overtime_roles_settings {}` |
| 121 | ValleyFoods | `vf_hr_settings_vacations` | BOOT | 4 | `get_overtime_roles_settings {}` |
| 122 | ValleyFoods | `vf_hr_settings_shifts` | BOOT | 4 | `get_overtime_roles_settings {}` |
| 123 | ValleyFoods | `vf_products` | BOOT | 4 | `get_page_versions {"page":"vf_products"}`<br>`get_valley_products {}` |
| 124 | ValleyFoods | `vf_parties` | BOOT | 4 | `get_page_versions {"page":"vf_parties"}`<br>`get_valley_parties {}`<br>_partial: then get_valley_party_balances_ |
| 125 | ValleyFoods | `vf_cash` | BOOT | 4 | `get_valley_cash {"from":"","to":""}` |
| 126 | ValleyFoods | `vf_income_statement` | BOOT | 4 | `get_valley_income_statement {"start":"$date:monthStart","end":"$date:today"}` |
| 127 | ValleyFoods | `vf_cash_expenses` | BOOT | 4 | `get_valley_cash_expense_report {}` |
| 128 | ValleyFoods | `vf_cash_incomes` | BOOT | 4 | `get_valley_cash_income_report {}` |
| 129 | ValleyFoods | `vf_cash_box_balances` | BOOT | 4 | `get_valley_cash_box_balance_report {"from":"","to":"","related_box":""}` |
| 130 | ValleyFoods | `vf_sales` | BOOT | 4 | `get_page_versions {"page":"vf_sales"}`<br>`get_valley_sales_page {"offset":0,"limit":1,"from":"","to":""}`<br>_partial: then get_valley_sales_page_ |
| 131 | ValleyFoods | `vf_sales_returns` | BOOT | 4 | `get_page_versions {"page":"vf_sales_returns"}`<br>`get_valley_sales_bootstrap {}` |
| 132 | ValleyFoods | `vf_sales_print` | BOOT | 4 | `get_valley_invoice_full {"invoice_unique_id":"$param:invoice_unique_id"}`<br>`get_valley_sales_bootstrap {}` |
| 133 | ValleyFoods | `vf_sales_report` | BOOT | 4 | `get_page_versions {"page":"vf_sales"}`<br>`get_valley_sales_bootstrap {}`<br>_partial: then get_valley_sales_report_ |
| 134 | ValleyFoods | `vf_purchasing` | BOOT | 4 | `get_page_versions {"page":"vf_purchasing"}`<br>`get_valley_purchasing_costing {"from":"","to":""}`<br>_partial: then get_valley_purchasing_options_ |
| 135 | ValleyFoods | `vf_purchasing_report` | BOOT | 4 | `get_page_versions {"page":"vf_purchasing"}`<br>`get_valley_purchasing_options {}`<br>`get_valley_purchasing_report {"from":"$param:from","to":"$param:to","vendor":"","product":""}` |
| 136 | ValleyFoods | `vf_warehouse_movement` | BOOT | 4 | `get_page_versions {"page":"vf_warehouse_movement"}`<br>`get_valley_warehouse_movements {"offset":0,"limit":100}`<br>`get_valley_warehouse_move_options {}` |
| 137 | ValleyFoods | `vf_mfg_recipes` | BOOT | 4 | `get_page_versions {"page":"vf_mfg_recipes"}`<br>`get_valley_mfg_recipes {}` |
| 138 | ValleyFoods | `vf_mfg_orders` | BOOT | 4 | `get_page_versions {"page":"vf_mfg_orders"}`<br>`get_valley_mfg_orders_headers_json {}` |
| 139 | ValleyFoods | `vf_mfg_order` | BOOT | 4 | `get_page_versions {"page":"vf_mfg_orders"}`<br>`get_valley_mfg_order_detail {"mo_uid":"$param:mo"}` |
| 140 | ValleyFoods | `vf_mfg_client_report` | SKIP_PARAM | — | the page reshapes a URL parameter before sending it (NESTED_PARAM:get_valley_mfg_client_report) |
| 141 | ValleyFoods | `vf_workcenters` | BOOT | 4 | `get_page_versions {"page":"vf_workcenters"}`<br>`get_valley_work_centers {}` |
| 142 | ValleyFoods | `vf_asset_technical` | BOOT | 4 | `get_page_versions {"page":"vf_asset_technical"}`<br>`get_valley_asset_technicals {}` |
| 143 | ValleyFoods | `vf_work_center_assets` | BOOT | 4 | `get_page_versions {"page":"vf_work_center_assets"}`<br>`get_valley_work_center_assets {}`<br>`get_valley_asset_technicals {}` |
| 144 | ValleyFoods | `vf_quality_dashboard` | BOOT | 4 | `get_page_versions {"page":"vf_quality_dashboard"}`<br>`get_quality_dashboard {}` |
| 145 | ValleyFoods | `vf_quality_general` | BOOT | 4 | `get_page_versions {"page":"vf_quality_general"}`<br>`get_quality_general {}` |
| 146 | ValleyFoods | `vf_quality_sops` | BOOT | 4 | `get_page_versions {"page":"vf_quality_sops"}`<br>`get_quality_sops {}` |
| 147 | ValleyFoods | `vf_quality_my_acks` | BOOT | 4 | `get_page_versions {"page":"vf_quality_my_acks"}`<br>`get_quality_my_acks {}` |
| 148 | ValleyFoods | `vf_quality_ncr` | BOOT | 4 | `get_page_versions {"page":"vf_quality_ncr"}`<br>`get_quality_ncr {}` |
| 149 | ValleyFoods | `vf_quality_audits` | BOOT | 4 | `get_page_versions {"page":"vf_quality_audits"}`<br>`get_quality_audits {}` |
| 150 | ValleyFoods | `valley_cost_view` | SKIP_NO_READ | — | registered without a template (a permission token, not a page) |
