# Execution prompt — Luna 5.6, existing-data Valley Foods income statement

Paste the prompt below into a new GPT-5.6 Luna session opened directly on D:\Work\Script. Do not select an isolated worktree.

---

Implement the replacement Valley Foods income statement directly in the existing main project at D:\Work\Script. Read this complete plan first:

D:\Work\Script\VALLEYFOODS_EXISTING_TABLES_INCOME_STATEMENT_PLAN_LUNA.md

This is an implementation request, not a request for another plan. This prompt and the user's restrictions supersede previous income-statement plans, test requirements and proposed accounting tables. Finish the authorized local source changes and report actual results.

## Absolute constraints

1. Edit the actual project files in D:\Work\Script. Do not create another worktree or leave the solution in a different folder. If your session starts elsewhere, explicitly target the main directory for every command/edit.
2. Use existing business tables and existing physical schemas only. NO adding, editing or deleting spreadsheet/database data. NO new tables, columns, formulas, mapping records, policies, journals, cost-history events, adjustments, close periods, grants, seeds, migrations or writeback. Do not modify stored credentials or service configuration.
3. NO UNIT TESTING. Do not create, modify or run unit tests, fixtures, tests under tools/verify, run_all.js, ui_check.js, benchmarks or automated test suites. Do not generate dummy business data. Source inspection, optional syntax-only parsing and manual read-only checking of existing records are allowed.
4. Keep Company_ValleyFoods_IncomeStatement.html as a NEW INDEPENDENT PAGE, with its own vf_income_statement route and finance-menu entry. Do not embed it into another report or dashboard.
5. Keep all Valley Foods server business functions in Company_ValleyFoods_Actions.js, preserving existing scoped IIFEs and initialization. Keep the small Registry.js/navigation files in the established company structure. Do not reintroduce a separate financial-reporting or HR backend file.
6. Preserve existing uncommitted work, unrelated workflows, company routing, authentication, page permissions, cost restrictions and current data-source configuration. No reset/clean/stash/broad overwrite, production push, deployment or live migration. Local code edits and local implementation notes are allowed; company-data edits are not.

## What has actually been studied

The current source and detailed AppSheet schema export were inspected, especially table_valley_chart_of_accounts_Schema in appsheet_old_project.html. The chart has a five-level hierarchy, a level-five key, natural debit/credit classification, display-label formulas and existing transaction references. This is enough to design the correct runtime reader; it is not evidence of actual live account balances or individual leaf-account codes.

Live content access remains unverified. With the user's explicitly authorized existing Google sign-in, Drive metadata identifies valley_foods_erp, but content export returned HTTP 403 appNotAuthorizedToFile: the OAuth app has not been granted read access to this particular file. Sheets and scoped CSV reads did not return content. No live chart rows were read and no company data was changed. Do not claim otherwise, repeat speculative credential attempts or spend the implementation session trying to bypass access. Use the existing ERP's properly authorized server-side readers when available; build against runtime chart rows and disclose any manual live verification still pending. The user has authorized reading needed data, never writing it.

## Chart rules — use the real structure

- Account key: المستوى الخامس. Never join using كود المستوى, which is a display label.
- Account names/classes: اسم المستوى الخامس, اسم الحساب, المستوى الاساسي, and the second/third/fourth level codes/names.
- نوع الاحتساب has مدين / دائن natural-balance semantics. It does not alone decide income versus expense or replace transaction direction.
- اسم الحساب الرئيسي and اسم المستوى الثاني_1 are formula copies, not extra independent groups. Related-record lists and appscript_income_statement are virtual fields, not required physical columns.
- Existing expense code recognizes top-level code 3. Verify other classes from actual runtime chart labels/rows; do not invent revenue/expense leaf codes or numeric ranges.
- Cash chart_code, purchasing movement_type, product asset_code/income_code and current-stock transaction_chart_code reference the level-five key. Purchasing movement_type can contain a legacy text fallback: unresolved text is not automatically an expense.
- Build only in-memory account maps and hierarchy totals. Do not create a mapping sheet. Roll leaf transactions into parents once, keep contra balances/signs, and separate unresolved classifications instead of guessing.

## Replace the failed reporting implementation

The current ValleyFoodsFinancialReporting section requires eight proposed companion tables that the user does not have. Remove those dependencies and their setup/finalization gates from the report. Remove this feature's save-policy, save-map, journal-posting, migration and close-period actions/UI. Remove their references from PAGE_ACCESS, ACTION_TABLES, applicable page-table metadata and registration bridges. This is source cleanup only: do not create or drop any database tables or remove other operational writers.

Use an existing source such as valley_chart_of_accounts for report action table metadata. Keep read-only report/detail actions and, if useful, a read-only source-coverage action. No request may automatically create missing sheets. The inspected getSheet_ throws on a missing tab; getReadOnlyRecords_ and getAllRecords_ provide read access. Audit full call paths before using helpers; existing page-level get handlers sometimes call ensureSheet_/settingsEnsureSheet_ and therefore must not be reused blindly.

Read the chart and necessary existing source rows once per request; aggregate before pagination. Determine optional sheet availability by reading metadata, not by calling creation helpers. Never require valley_products_movement merely because the legacy stock formula references it: its live existence/schema was not verified. If an existing consolidated movement table is proven usable, do not add its feeder rows again.

## Required financial calculation

- Revenue: sales lines join valley_sales_invoices.invoice_unique_id through valley_sales_header_id. Use product_net_value or supported existing qty × price, excluding VAT. Reconcile to invoice المبلغ الصافي. Never use إجمالي as net revenue or add headers and lines together. Product income_code supplies the chart reference.
- Returns: use valley_return_date independently of invoice dates. Include returns of older invoices. Use existing stored return value with source reconciliation; do not invent provisions or re-deduct discounts already included in net amounts.
- Status/date basis: preserve actual data semantics and show included status scope. Do not invent a posted state or silently omit all legacy records. Invoice date is recorded-date evidence, not proof of IFRS delivery cut-off.
- COGS: use existing sale allocations and supported existing batch costs. Purchased unit cost comes from unit_cost or valid total_cost / qty; manufactured cost from total_batch_cost / actual_qty; by-product cost from total_cost / qty. Existing current-products unit_cost may be used with source provenance and discrepancy reporting. Do not divide by remaining current_qty or require new historical-cost records.
- Return-stock product_unique_id references ORIGINAL SALES ALLOCATION unique_id, then that allocation points to the batch. Recover cost through this chain and date it by the parent return. Missing costs/allocations must not become zero.
- Cash/purchases: resolve actual chart counterpart classes and signed movements; exclude balance-sheet settlements from P&L. Avoid treating customer collections, supplier payments, transfers, loan principal, inventory or capital-asset purchases as new expenses/revenue. Distinguish net/tax components from VAT-inclusive totals. Recognize direct expense/income only where the source supports it.
- Do not count the same economic event through both purchasing/sales and its cash settlement. Use real source links; matching amounts alone is not enough. Show ambiguity explicitly instead of silently guessing.
- Do not expense production materials, labor, utilities, depreciation and overhead again when already included in sold batch costs. Do not use net_salary as gross payroll cost. Unclassified warehouse issues are not automatically COGS.
- Do not invent a COGS account when the chart only supplies an inventory asset account. A clearly labeled calculated COGS subtotal without a fabricated account code is acceptable.

Read-only arithmetic from existing values is allowed. Altering spreadsheet formulas/records is not. Existing mutable batch values cannot establish immutable historical valuation: label the basis honestly. Full IFRS compliance cannot be claimed when required accrual/cut-off/valuation evidence is absent.

## UI, authority and no-write behavior

Build a usable RTL income statement with date/comparison filters, actual chart hierarchy, source drill-through, refresh and print. Remove setup/migration/post/close controls and blanket errors for the nonexistent tables. Show available results, identify precisely which amounts are unavailable/unclassified, and preserve negative income and expense refunds. Never display missing values as zero or hide losses with absolute values.

Enforce company/page/cost permissions on every summary/detail/export path. Do not leak cost through gross-profit arithmetic or payroll details through drill-through. Keep the current project/Apps Script target unchanged.

Check read-side effects: the common router calls logSystemAction_ even for reads. Do not claim end-to-end zero persisted writes until the full path is known. Do not globally disable security auditing or weaken authentication. Use an existing genuinely non-mutating read path; if normal framework persistence cannot be avoided safely within this scope, report it and do not exercise that route live. No persistent report cache, snapshots, evidence tables or runtime self-setup.

## Finish without unit tests

Inspect source and registration references; use node --check only if helpful. Where live access is available, manually reconcile actual chart parent/leaf totals, a sale, a return allocation, a cash expense/refund, and a purchase/settlement pair without changing any record. If unavailable, finish all independent local code and clearly state manual live reconciliation is pending. Do not substitute unit tests or fabricated sample balances.

Maintain D:\Work\Script\VALLEYFOODS_EXISTING_TABLES_INCOME_STATEMENT_RESULTS.md with concise source decisions, changed files, actual read evidence and pending limitations. Final response must identify the independent HTML page, consolidated backend, removed nonexistent-table dependencies, preservation of data/schema, no unit tests performed, and remaining live-access or accounting limitations. Do not claim deployment or actual company profits without evidence.

Start by reading the full plan and current source, then implement directly in D:\Work\Script.
