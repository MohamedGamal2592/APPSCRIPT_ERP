# Luna 5.6 replacement plan — existing-table Valley Foods income statement

Prepared 12 September 2026. Implementation target: D:\Work\Script.

## 1. Scope overrides all earlier income-statement plans

Replace the current report with an existing-data-only, read-only income statement. Preserve the independent Company_ValleyFoods_IncomeStatement.html page, vf_income_statement route, finance navigation, and consolidated Company_ValleyFoods_Actions.js business code. Keep Registry.js as company registration metadata.

No new tables, columns, formulas, accounting policies, account-map records, journal entries, adjustments or close-period records. No adding/editing/deleting business or configuration data. No migrations, seeds, writeback, approval changes, live permission grants or deployment. In a later implementation run, local source changes are in scope; changing company data is not.

No unit testing: do not add, edit or run unit tests or automated test suites, including run_all.js and ui_check.js. Verification is source inspection, optional syntax-only parsing, and manual read-only reconciliation of real records. No synthetic test-data creation.

The earlier eight proposed companion tables must no longer be prerequisites. Their absence is a design problem to remove, not a setup task for the user.

## 2. Evidence and limitation

Verified: current consolidated source and detailed local AppSheet schema/formula export, especially table_valley_chart_of_accounts_Schema in appsheet_old_project.html. Existing ERP_Companies data was read to resolve the Valley Foods spreadsheet.

Unverified: actual live chart account rows and balances. The user subsequently explicitly authorized their Google sign-in and an in-memory workbook read. Drive metadata confirmed valley_foods_erp, but the content export returned HTTP 403 appNotAuthorizedToFile: this OAuth app has not been granted read access to the file. Sheets/scoped CSV reads returned no content. No live chart rows were read and no spreadsheet data or credential files were changed. Do not invent leaf account codes/names or claim live verification. The execution handoff is VALLEYFOODS_EXISTING_DATA_EXECUTION_PROMPT_LUNA.md.

Implement classification using actual chart rows available through the existing authorized ERP read path. Before selecting any optional source, confirm its sheet and headers exist. A legacy reference is not proof of current live existence. If live verification remains unavailable, label that part of readiness honestly without introducing replacement tables.

## 3. Close study of valley_chart_of_accounts

The exported chart contains 16 physical business columns. AppSheet _RowNumber is a system field, not an additional physical header to create. Read by header names rather than fixed positions.

| Legacy position | Existing field | Report meaning |
| --- | --- | --- |
| A | المستوى الاساسي | Top-level class code. Existing expense code uses 3 for costs; other numeric meanings require actual-row verification. |
| B | اسم الحساب | Top-level class name. Legacy options: الاصول، الالتزامات، التكاليف، الايرادات, with additional values allowed. |
| C / D | المستوى الثاني / اسم المستوى الثاني | Second-level group code/name. |
| E / F | المستوى الثالث / اسم المستوى الثالث | Third-level group code/name. |
| G / H | المستوى الرابع / اسم المستوى الرابع | Fourth-level parent group code/name. |
| I / J | المستوى الخامس / اسم المستوى الخامس | Account reference key and account name. المستوى الخامس is the chart key. |
| K | التاكيد | Existing Yes/No flag; its business meaning is unverified. Do not silently exclude balances because it is false/blank. |
| L | ملاحظات | Descriptive notes; not executable rules. |
| M | نوع الاحتساب | مدين / دائن: natural balance classification. Transaction direction must still come from the source event. |
| N | كود المستوى | Display label, not a join key. Legacy formula concatenates level-four name, level-five code and level-five name. |
| O | اسم الحساب الرئيسي | Formula copy of اسم الحساب; not another independent classification. |
| P | اسم المستوى الثاني_1 | Formula copy of اسم المستوى الثاني; do not aggregate again. |

Related-record lists and appscript_income_statement are virtual AppSheet fields. Do not require them as physical columns. The chart has no verified posting date, debit amount, credit amount or period balance; transaction amounts must come from the existing business tables.

### Established references

| Existing source field | Chart relationship |
| --- | --- |
| valley_cash_bank_movement.chart_code | المستوى الخامس: counterpart account for cash movement |
| valley_product_purchasing.movement_type | المستوى الخامس: account reference, not just a stock-direction label |
| valley_products.asset_code | المستوى الخامس: asset/inventory classification |
| valley_products.income_code | المستوى الخامس: revenue classification |
| valley_current_products.transaction_chart_code | المستوى الخامس: batch/stock account; not automatically COGS |
| valley_Transfer_Helper.chart_code | Legacy chart reference; verify current existence and avoid duplicating generated cash movements |

Current purchasing options can fall back to legacy text movement types. Resolve actual chart keys exactly; unresolved words are not automatically expense accounts.

### In-memory classification only

Build one in-memory index by المستوى الخامس. Keep original labels and values for detail. Normalize equivalent numeric/text representations carefully; preserve meaningful leading zeros. Ignore fully empty trailing rows. Identical duplicate account definitions may resolve once with a visible count; conflicting definitions remain unresolved.

Build hierarchy paths from actual level codes/names and aggregate leaf values upward once. Never add parent subtotals to the postings already inside them. Balance-sheet accounts stay outside profit or loss. Use actual subgroup names for display rather than inventing code ranges or mapping records. If an expense subgroup cannot be classified into selling, administration or finance from evidence, retain its actual chart group under unallocated recorded expenses.

For debit-normal accounts, natural-balance display is debits minus credits; for credit-normal accounts, credits minus debits. P&L contribution is credits minus debits for a resolved P&L account. Natural type alone does not establish income versus expense. Preserve contra accounts and negative values; never apply abs() indiscriminately.

## 4. Existing sources and safe selection

Mandatory chart source: valley_chart_of_accounts. Use valley_products for income_code/asset_code and product identity; sales headers/lines and returns for revenue; sales/return allocations plus existing batch-cost sources for COGS; account-coded cash and purchase records for other recognized amounts.

| Existing table evidenced in source/schema | Intended use |
| --- | --- |
| valley_sales_invoices, valley_sales_products | Dated VAT-exclusive sales and header/line reconciliation |
| valley_sales_returns | Return-date revenue reductions |
| valley_sales_product_stock, valley_sales_returns_stock | Sale/return quantities and batch links |
| valley_current_products | Existing unit_cost and batch/account lookup, not historical closing inventory |
| valley_product_purchasing, valley_purchasing_costing | Original receipt values, expense-account purchase evidence, cost reconciliation |
| valley_manufacture_header, valley_manufacture_by_product | Existing output/by-product batch cost values |
| valley_cash_bank_movement | Account-coded expenses/income and settlement evidence |
| valley_warehouse_movement | Existing positive amount and signed quantity; non-sales issue classification where evidence supports it |
| valley_manufacture_footer, valley_manufacture_header_products, valley_manufacture_work_center | Manufacturing-cost explanation, not automatic additional P&L totals |
| valley_emp_salaries, valley_product_technical, valley_work_centers, valley_work_center_assets | Supplemental reconciliation only unless a nonduplicated expense can be established |

Only query the sources actually needed and confirmed present. Never invoke an ensure/create helper on read. Legacy current_qty references valley_products_movement, but its live existence and schema are unverified: it is only a discovery candidate, never a required table or a new table to create. If verified, inspect its formulas/provenance and use it instead of its feeders, never alongside them. Transfer-helper records likewise must not duplicate cash rows.

Remove dependencies on valley_accounting_policies, valley_finance_account_map, valley_accounting_source_events, valley_inventory_cost_events, valley_accounting_journals, valley_accounting_journal_lines, valley_finance_close_schedules and valley_finance_periods. Do not create or delete any of these tables even if some happen to exist now.

## 5. Calculation rules using only existing columns

### A. Sales and returns

1. Join sales line `valley_sales_header_id` to invoice `invoice_unique_id`, not an assumed generic UID. Join line `product_id` to product `id`, then product `income_code` to chart `المستوى الخامس`.
2. Use `product_net_value` as VAT-exclusive line revenue. If absent but existing qty/price are valid, compute qty × price in memory and identify that derivation. Reconcile line totals to invoice `المبلغ الصافي`; never add header and line totals together. Do not use VAT-inclusive `إجمالي` as revenue.
3. Filter sales by existing `تاريخ الفاتورة`. This is recorded invoice-date reporting, not independently verified delivery-date recognition. Do not require a new delivery/event table or claim that invoice date proves IFRS recognition.
4. Process `valley_sales_returns` independently by `valley_return_date`, including returns of invoices outside the current period. Use the existing stored `valley_return_value`, reconcile it to the original line quantity/price, and retain the original product's chart classification. Do not deduct all lifetime returns from each filtered invoice period.
5. Keep VAT separate. Do not invent discounts, return provisions or tax adjustments absent from existing data. Deduct an existing discount once only after establishing whether product_net_value already includes it.
6. Preserve existing recorded statuses, with a visible status filter/record count when useful. Do not invent a posted state or silently exclude all legacy rows because new approval fields are missing. Explain whether results include pending/unapproved records. Distinguish recorded transactions from a finalized accrual statement.

If a valid sale has no income_code, show its net value under clearly named unclassified sales with source detail rather than dropping it. Do not assign it a fabricated chart code. If the referenced account is a balance-sheet or inconsistent class, expose the mismatch and avoid silently relabeling it as revenue.

### B. COGS from the existing batch model

Sales allocation `valley_sales_product_stock.valley_sales_products_id` joins sales-line `unique_id`. Its `product_unique_id` is the stock-batch UID. Use allocation `product_qty` multiplied by a supported existing batch unit cost; date the expense consistently with the associated included sale.

The legacy current-products unit-cost logic gives a concrete existing-data basis:

- Purchased batch: `valley_product_purchasing.unit_cost`, or existing `total_cost / qty` if needed and valid.
- Manufactured batch: `valley_manufacture_header.total_batch_cost / actual_qty`.
- By-product batch: `valley_manufacture_by_product.total_cost / qty`.

Read the existing `valley_current_products.unit_cost` where valid and consistent; explain/provide the original batch-source calculation in detail. If the batch is absent from that derived view, resolve it from the original existing source UID. Never divide current inventory value by current_qty to recover cost of a depleted batch. Never require a new historical cost table.

Do not silently convert blank/formula-error/missing cost to zero. Zero is valid only when evidenced by the underlying existing cost inputs. Flag inconsistencies between stored unit cost and source-derived cost; use a documented consistent existing source and display the discrepancy. Use actual_qty, not expected_qty, for finished-output unit cost. Do not sum input unit prices as output unit cost or add the manufacturing header/outputs/materials again on top of batch cost.

Return-stock `valley_sales_returns_stock.product_unique_id` refers to ORIGINAL SALES ALLOCATION `unique_id`, not the batch. Follow return → return allocation → original sales allocation → batch. Recover COGS using that batch's supported cost and returned quantity. Date by the parent return. Missing allocations or damaged-return valuation evidence affect the associated amount, not all unrelated rows.

The existing costs may be mutable. Label the result 'cost calculated from existing batch values' and retain source attribution; do not claim immutable historical COGS or closed-period reproducibility. This limitation does not justify new tables or fabricated cost snapshots.

Existing `asset_code` / `transaction_chart_code` normally identify inventory assets and cannot be used as expense-account codes automatically. If the chart has a verified matching COGS group, show the computed COGS there with provenance. Otherwise display a separate calculated COGS statement line without pretending that it is an actual posted chart account.

### C. Cash and account-coded purchase activity

Read full account-coded cash data for the requested period, not the existing pre-summed cash report. Existing cash formulas are:

- net_amount = transaction_amount − total_discount;
- total = net_amount + taxes;
- balance_amount is negative for Credit / Credit Note and positive for the other currently supported types.

These are cash directions. For a verified ordinary counterpart transaction, cash outflow means a debit to the counterpart; cash inflow means a credit. Use `نوع الاحتساب` to present the account's normal balance, not to reverse every cash sign a second time. Verify the actual meaning of debit/credit notes before applying ordinary-cash logic to them. Preserve refunds/reversals rather than adding absolute totals.

Resolve cash chart_code against the real chart. Assets/liabilities, cash transfers, customer receivable collections, supplier settlements and loan principal do not independently become P&L. For direct income/expense, use the existing net/tax components correctly: recoverable VAT is not expense; unrecoverable taxes may be cost. If the current records do not identify tax recoverability, disclose that limitation for affected values rather than automatically including all taxes or assuming all are recoverable.

Purchasing `movement_type` is also an account reference. A purchase coded to an inventory/asset account is not immediate expense. An actual cost-account purchase may be expense, subject to signed amount, expense period and duplicate-settlement review. Do not add the purchasing header Total costs again after it has been allocated into line total_cost. Do not use sales_value or sales_value_amount as extra revenue solely because those fields exist.

Deduplicate ECONOMIC RECOGNITION, not distinct records that happen to share amount/date. Use existing invoice_id, purchase code, party, exact amount and source links where they establish that cash settles an already-recognized sale/purchase. A populated invoice_id alone is not sufficient proof that an additional charge is a duplicate. When linkage is insufficient, show unresolved candidate activity separately and its effect on completeness. Never silently include both or silently discard unrelated rows.

### D. Manufacturing, warehouse and payroll

Production cost already inside purchased/manufactured batch COGS must not be expensed again from manufacturing footers, hourly-rate calculations, payroll or cash payments. Use these tables for breakdown/reconciliation, not a second automatic P&L stream.

Warehouse amount is a positive stored cost snapshot; movmenent_sign is signed quantity, not signed value. Movement_type distinguishes issue/return but not accounting purpose. Do not treat all warehouse issues as COGS or operating expense. Include a non-sales issue only when existing structured references establish its expense purpose and nonduplication; otherwise show an unresolved inventory movement. Do not infer an expense account solely from free-text notes.

Do not sum net_salary as employment expense: it includes loan/other settlement deductions. Without reliable existing recognition/allocation links, show payroll as supplemental explanation and avoid adding it on top of recorded costs. Likewise no newly calculated depreciation, tax provision, NRV adjustment, return provision or accrual is written or assumed. Existing recorded amounts can be shown under their actual chart groups when supported.

## 6. Statement presentation

Produce a usable read-only page, not setup/migration/close controls. Keep date filters, comparison period, refresh, account grouping, source drill-through and print. Use current ERP styling/authority conventions. No save, post, approve, seed, migrate, close or configuration buttons.

Recommended structure:

1. Sales grouped by actual revenue account hierarchy, with unclassified recorded sales clearly separate.
2. Returns/reductions by return date; net revenue subtotal.
3. Calculated COGS and return-cost recovery; gross profit when the needed costs are available.
4. Other recorded revenue and expenses grouped by the existing chart's second/third/fourth/fifth levels.
5. Financing/tax groups only where real accounts and source amounts support them.
6. Result from included recorded activity, with identified unresolved amounts and basis. Do not call an incomplete result final IFRS net profit.

Every amount should link to existing source rows: table, record ID, date, account key/name, original amount, included signed amount, batch quantity/cost if relevant, and explanation of any exclusion. No persistent evidence table. Distinguish zero, not applicable, unavailable and unclassified. Do not turn a missing optional component into a blanket eight-table setup error; preserve available results and identify which subtotal cannot be calculated honestly.

Revenue recognition under IFRS depends on transfer of control, and IAS 2 expenses inventory carrying cost with related revenue. Use these principles to explain the report's limitations; do not promise full IFRS compliance where existing records lack accrual/cut-off/valuation evidence. [IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/), [IAS 2](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/).

## 7. Luna implementation sequence — no unit tests

A. Read this replacement plan and current main-folder code. Preserve current user changes and unrelated company functionality. Inventory actual available source tables/headers and obtain read-only chart rows through an authorized connection. Do not access rejected credentials without explicit user approval. Record live-unverified assumptions plainly.

B. Replace only the financial-reporting section inside Company_ValleyFoods_Actions.js. Use read-only record access and in-memory joins/aggregations. Audit helper implementations; names containing 'get' do not guarantee no writes. Do not call settingsEnsureSheet_, ensureSheet_, insertSheet, setValue(s), setFormula, addRecord_, update/delete helpers, queues or migration code from this report.

C. Remove the new finance write/migration/close actions from the financial report's dispatch/access/table maps and frontend calls. This removes local source code, not database records. Preserve other Valley Foods operational writers outside this page. Point read-action metadata to a real existing source such as valley_chart_of_accounts; remove old nonexistent-table dependencies and diagnostics.

D. Keep existing company/session/page/cost authority server-side on summary, detail, print/export and errors. Unauthorized users must not recover costs through totals or detail. Use request-local memory instead of adding persistent caches/report snapshots. Do not create permission rows or new configuration records. The common router currently calls logSystemAction_ even for reads: inspect this side effect and do not claim end-to-end zero writes without addressing it. Do not globally disable security auditing or weaken authentication. If a normal route cannot avoid persistence within scope, use a narrowly reviewed read-only handling for these authenticated report actions, or report that remaining limitation before exercising it live. Read-only reconciliation can use direct Sheets GET without invoking mutation/logging endpoints.

E. Simplify the existing independent HTML page. Remove migration/readiness gates tied to nonexistent tables. Display existing chart group names and signed amounts correctly; do not use Math.abs to hide losses or expense refunds. For comparisons, unavailable prior values must not overwrite available current values.

F. Verify by reading the modified source and optional node --check syntax parsing only. Manually reconcile a real sale/header/line, a real return and allocation chain, a real expense/refund, an inventory purchase and its cash settlement, and actual parent/leaf chart totals where read access permits. Read empty periods and missing optional sources without creating data. Do not run unit tests, test fixtures or repository test suites. If UI inspection is performed, exercise only read controls and preserve data.

G. Keep a short local results document stating actual tables/headers inspected, confirmed account groups, formulas/source precedence, files changed, read-only reconciliation performed and remaining gaps. Do not report unperformed checks as passed. Keep output in D:\Work\Script. No production push or live writes.

## 8. Completion conditions

- Independent page computes from real current tables instead of requesting nonexistent setup tables.
- Account key, hierarchy and natural balance come from valley_chart_of_accounts; no invented leaf codes or mapping data.
- Sales, returns, existing-batch COGS and account-coded activity have source drill-through and correct sign/date handling.
- Duplicate recognition and source gaps are visible and affect only relevant totals.
- No data/schema writes, no migration/close workflow, no new tables, no unit tests.
- Backend remains consolidated, and output lives in D:\Work\Script.
- Distinguish implemented code from live-data verification; do not call the chart closely verified against actual account rows until those rows have been read.

## 9. Copyable execution prompt for Luna 5.6

Implement D:\Work\Script\VALLEYFOODS_EXISTING_TABLES_INCOME_STATEMENT_PLAN_LUNA.md in D:\Work\Script. It supersedes every earlier income-statement plan. Build a read-only existing-table report using the real valley_chart_of_accounts hierarchy, key and debit/credit type. Keep Company_ValleyFoods_IncomeStatement.html independent and backend functions in Company_ValleyFoods_Actions.js. Remove dependencies on the eight invented companion tables and remove finance migration/post/close UI/actions from this feature. No data/schema writes, no new tables, no unit tests or automated test suites, no deployment. Preserve unrelated code and operational writers. Use source inspection, syntax-only parsing and manual read-only reconciliation. Do not fabricate live account codes or claim inaccessible rows were verified. Read the complete plan before editing and finish with files, actual evidence and precise remaining limitations.

