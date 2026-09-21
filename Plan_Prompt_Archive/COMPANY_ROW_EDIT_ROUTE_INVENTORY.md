# Company row-edit route inventory

Date: 2026-09-15

Companion to [analysis and fix plan](COMPANY_ROW_EDIT_ANALYSIS_PLAN.md). Generated from the four current root-level registries; classifications were assigned from source inspection. This covers all registered page routes, including aliases, reports and workflow pages. It is not a live browser verification report or proof that every field is safe. Shared formula/persistence risks can apply even when an editor already has the correct keyed update route.

## Assessment — 7 routes

| Page action | Runtime template | Classification and follow-up |
| --- | --- | --- |
| `ac_dashboard` | `Company_Assessment_Dashboard.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `ac_assessments` | `Company_Assessment_Assessments.html` | **Immutable authoring / copy**. Existing assessments intentionally read-only; revisions create copies. Preserve this contract. |
| `ac_assessment_form` | `Company_Assessment_AssessmentForm.html` | **Immutable authoring / copy**. Existing assessments intentionally read-only; revisions create copies. Preserve this contract. |
| `ac_batches` | `Company_Assessment_Batches.html` | **Specialized workflow**. Batch expiry/invites, candidate review/grading or candidate answers; retain action-specific field permissions. |
| `ac_results` | `Company_Assessment_Results.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `ac_result_view` | `Company_Assessment_ResultView.html` | **Specialized workflow**. Batch expiry/invites, candidate review/grading or candidate answers; retain action-specific field permissions. |
| `ac_take` | `Company_Assessment_Take.html` | **Specialized workflow**. Batch expiry/invites, candidate review/grading or candidate answers; retain action-specific field permissions. |

## TopChemical — 35 routes

| Page action | Runtime template | Classification and follow-up |
| --- | --- | --- |
| `tc_dashboard` | `Company_TopChemical_Dashboard.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tc_kpi` | `Company_TopChemical_KPI.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tc_main_review` | `Company_TopChemical_MainReview.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tc_client_balance_sheets` | `Company_TopChemical_ClientBalanceSheets.html` | **Existing database editor**. Stable database ID; narrow denylist needs explicit allowed fields and live-schema checks (F9). |
| `tc_box_analysis` | `Company_TopChemical_BoxAnalysis.html` | **Existing database editor**. Existing ID-based update and field-specific form; retain SQL validation/concurrency and derived-field rules. |
| `tc_clients_vendors` | `Company_TopChemical_Clients.html` | **Existing editor**. Keyed edit/save flow exists; formula-safe patch and missing-record/UI-grant consistency (F3/F7). |
| `tc_debts` | `Company_TopChemical_Debts.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_products` | `Company_TopChemical_Products.html` | **Existing editor**. Keyed edit/save flow exists; formula-safe patch and missing-record/UI-grant consistency (F3/F7). |
| `tc_barcode` | `Company_TopChemical_Barcode.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_registration_papers` | `Company_TopChemical_RegistrationPapers.html` | **Broken Edit**. Edit calls Add or View; implement complete keyed update (F1/F2). |
| `tc_trust` | `Company_TopChemical_Trust.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_stock_revision` | `Company_TopChemical_StockRevision.html` | **Existing editor**. Row-position/product precondition; derived snapshots not recalculated (F4). |
| `tc_stock_scan` | `Company_TopChemical_StockScan.html` | **Specialized workflow**. Scan/count submission and back-to-correction UI; not an existing-record row Edit. |
| `tc_customs_office` | `Company_TopChemical_CustomsOffice.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_purchasing` | `Company_TopChemical_Purchasing.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_import_follow` | `Company_TopChemical_ImportFollow.html` | **Specialized workflow**. Existing file/status actions, not a full row editor; shared update helper may affect untouched formulas (F3). |
| `tc_carton_sizes` | `Company_TopChemical_CartonSizes.html` | **Specialized workflow**. Existing file/status actions, not a full row editor; shared update helper may affect untouched formulas (F3). |
| `tc_employee_reg` | `Company_TopChemical_Employees.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_employee_status` | `Company_TopChemical_EmployeeStatus.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_employee_salary` | `Company_TopChemical_EmployeeSalary.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_emp_deductions` | `Company_TopChemical_EmpDeductions.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_emp_permits` | `Company_TopChemical_EmpPermits.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_emp_overtime` | `Company_TopChemical_EmpOvertime.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_emp_salaries` | `Company_TopChemical_EmpSalaries.html` | **Existing editor**. Edits working days/month/year only; targeted cell writes preserve other formulas; closed-month checks exist. |
| `tc_emp_salaries_close` | `Company_TopChemical_EmpSalariesClose.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `tc_budget_parties` | `Company_TopChemical_BudgetParties.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_budget_stock_balance` | `Company_TopChemical_BudgetStockBalance.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tc_budget_stock_movement` | `Company_TopChemical_BudgetStockMovement.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tc_budget_inputs` | `Company_TopChemical_BudgetInputs.html` | **Existing document editor**. Existing edit_legal_costing_bundle; validate before mutation, preserve field ownership and history (F8). |
| `tc_budget_manufacture` | `Company_TopChemical_BudgetManufacture.html` | **Broken Edit**. Edit calls Add or View; implement complete keyed update (F1/F2). |
| `tc_budget_invoices` | `Company_TopChemical_BudgetInvoices.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `tc_budget_cash` | `Company_TopChemical_BudgetCash.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `tc_budget_hr` | `Company_TopChemical_BudgetHR.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `tc_budget_income` | `Company_TopChemical_BudgetIncome.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tc_manufacture_orders` | `Company_TopChemical_ManufactureOrders.html` | **Existing database editor**. Stable database ID; narrow denylist needs explicit allowed fields and live-schema checks (F9). |

## TopLight — 21 routes

| Page action | Runtime template | Classification and follow-up |
| --- | --- | --- |
| `tl_dashboard` | `Company_TopLight_Dashboard.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_kpi` | `Company_TopLight_KPI.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_analysis_review` | `Company_TopLight_Dashboard.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_products` | `Company_TopLight_Products.html` | **Existing editor**. Keyed edit handler exists; shared formula-write and nullable lookup review (F3/F7). |
| `tl_customers` | `Company_TopLight_Customers.html` | **Existing editor**. Keyed edit handler exists; shared formula-write and nullable lookup review (F3/F7). |
| `tl_purchasing` | `Company_TopLight_Purchasing.html` | **Existing document editor**. Existing keyed update; full-row rebuild, metadata/formula preservation, document-line review (F8). |
| `tl_purchase_print` | `Company_TopLight_Purchase_Print.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_sales` | `Company_TopLight_Sales.html` | **Existing document editor**. Existing keyed update; full-row rebuild, metadata/formula preservation, document-line review (F8). |
| `tl_sales_offer` | `Company_TopLight_Sales_Offer.html` | **Existing document editor**. Existing keyed update; full-row rebuild, metadata/formula preservation, document-line review (F8). |
| `tl_sales_print` | `Company_TopLight_Sales_Print.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_sales_costing_print` | `Company_TopLight_Sales_Costing_Print.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_sales_release` | `Company_TopLight_Sales_Release.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_sales_returns` | `Company_TopLight_Sales_Returns.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `tl_sales_offer_print` | `Company_TopLight_Sales_Offer_Print.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_sales_analysis` | `Company_TopLight_Sales_Analysis.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_sales_costing_analysis` | `Company_TopLight_Sales_Costing_Analysis.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_cash` | `Company_TopLight_Cash.html` | **Existing document editor**. Existing keyed update; full-row rebuild, metadata/formula preservation, document-line review (F8). |
| `tl_cash_report` | `Company_TopLight_Cash_Report.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_customer_statement` | `Company_TopLight_Customer_Statement.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_purchase_needs` | `Company_TopLight_Purchase_Needs.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `tl_product_movement` | `Company_TopLight_Product_Movement.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |

## ValleyFoods — 37 routes

| Page action | Runtime template | Classification and follow-up |
| --- | --- | --- |
| `vf_dashboard` | `Company_ValleyFoods_Dashboard.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_kpi` | `Company_ValleyFoods_KPI.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_hr_employees` | `Company_ValleyFoods_HR_Emp.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `vf_hr_status` | `Company_ValleyFoods_HR_Emp.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `vf_hr_shifts` | `Company_ValleyFoods_ShiftAssignment.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `vf_hr_salary` | `Company_ValleyFoods_Salary.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `vf_hr_deductions` | `Company_ValleyFoods_Deductions.html` | **Broken Edit**. Edit calls Add or View; implement complete keyed update (F1/F2). |
| `vf_hr_contracts` | `Company_ValleyFoods_Contracts.html` | **Dormant editor**. No rendered row Edit; dormant edit saves Add (F10). |
| `vf_hr_vacation_alloc` | `Company_ValleyFoods_VacationAlloc.html` | **Append-only / add and view**. No general row Edit found in active template; do not add one implicitly. Audit existing writes only where they update rows. |
| `vf_hr_vacations` | `Company_ValleyFoods_Vacations.html` | **Broken Edit**. Edit calls Add or View; implement complete keyed update (F1/F2). |
| `vf_hr_overtime` | `Company_ValleyFoods_Overtime.html` | **Broken Edit**. Edit calls Add or View; implement complete keyed update (F1/F2). |
| `vf_hr_monthly_salaries` | `Company_ValleyFoods_MonthlySalaries.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `vf_hr_attendance` | `Company_ValleyFoods_Attendance.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `vf_hr_settings_overtime` | `Company_ValleyFoods_HR_Settings.html` | **Existing editor**. Dual-purpose save with update-specific super-admin guards; shared formula preservation still applies (F3). |
| `vf_hr_settings_deduction` | `Company_ValleyFoods_HR_Settings.html` | **Existing editor**. Dual-purpose save with update-specific super-admin guards; shared formula preservation still applies (F3). |
| `vf_hr_settings_vacations` | `Company_ValleyFoods_HR_Settings.html` | **Existing editor**. Dual-purpose save with update-specific super-admin guards; shared formula preservation still applies (F3). |
| `vf_hr_settings_shifts` | `Company_ValleyFoods_HR_Settings.html` | **Existing editor**. Dual-purpose save with update-specific super-admin guards; shared formula preservation still applies (F3). |
| `vf_products` | `Company_ValleyFoods_Products.html` | **Existing editor**. Existing keyed update; inspect formula ownership, full-record loading, attachments and related-record preservation (F3/F8). |
| `vf_parties` | `Company_ValleyFoods_Parties.html` | **Existing editor**. Existing keyed update; inspect formula ownership, full-record loading, attachments and related-record preservation (F3/F8). |
| `vf_cash` | `Company_ValleyFoods_Cash.html` | **Existing editor**. Existing keyed update; inspect formula ownership, full-record loading, attachments and related-record preservation (F3/F8). |
| `vf_income_statement` | `Company_ValleyFoods_IncomeStatement.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_cash_expenses` | `Company_ValleyFoods_CashExpenses.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_cash_incomes` | `Company_ValleyFoods_CashIncomes.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_cash_box_balances` | `Company_ValleyFoods_CashBoxBalances.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_sales` | `Company_ValleyFoods_Sales.html` | **Existing editor**. Existing keyed update; inspect formula ownership, full-record loading, attachments and related-record preservation (F3/F8). |
| `vf_sales_returns` | `Company_ValleyFoods_SalesReturns.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `vf_sales_print` | `Company_ValleyFoods_SalesPrint.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_sales_report` | `Company_ValleyFoods_SalesReport.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_purchasing` | `Company_ValleyFoods_Purchasing.html` | **Existing editor**. Existing keyed update; inspect formula ownership, full-record loading, attachments and related-record preservation (F3/F8). |
| `vf_purchasing_report` | `Company_ValleyFoods_PurchasingReport.html` | **Report / dashboard / print**. No general row Edit found; retain read/report behavior. |
| `vf_warehouse_movement` | `Company_ValleyFoods_WarehouseMovement.html` | **Specialized workflow**. Generation/approval/closure/attendance/return/create workflow; preserve dedicated rules rather than add generic Edit. |
| `vf_mfg_recipes` | `Company_ValleyFoods_MfgRecipes.html` | **Existing editor**. Existing keyed update; inspect formula ownership, full-record loading, attachments and related-record preservation (F3/F8). |
| `vf_mfg_orders` | `Company_ValleyFoods_MfgOrders.html` | **Existing document/workflow editor**. Existing header/line saves and operation corrections; derived hours/costs and parent linkage require repair (F5). |
| `vf_mfg_order` | `Company_ValleyFoods_MfgOrderView.html` | **Existing document/workflow editor**. Existing header/line saves and operation corrections; derived hours/costs and parent linkage require repair (F5). |
| `vf_workcenters` | `Company_ValleyFoods_WorkCenters.html` | **Existing editor**. Update-specific authorization, checked row match and missing-record behavior need repair (F6/F7); verify field ownership. |
| `vf_asset_technical` | `Company_ValleyFoods_AssetTechnical.html` | **Existing editor**. Update-specific authorization, checked row match and missing-record behavior need repair (F6/F7); verify field ownership. |
| `vf_work_center_assets` | `Company_ValleyFoods_WorkCenterAssets.html` | **Existing editor**. Update-specific authorization, checked row match and missing-record behavior need repair (F6/F7); verify field ownership. |

## Scope notes

- `valley_cost_view` is a permission-only registry entry, not a page, so it is excluded from the 100 page count.
- Runtime templates with no active registry route, archived copies and generated preview bundles are not independent deployed pages.
- `vf_hr_contracts` is explicitly classified as dormant editing even though its source contains an edit function.
- `tc_stock_scan` includes a back-to-correction button; this is not an existing-row Edit.
- `tl_sales` builds its Edit menu through a helper; it is included despite not matching a simple literal-label search.
- Existing editor classifications mean an update flow exists, not that all permissions, formulas or edge cases passed.
