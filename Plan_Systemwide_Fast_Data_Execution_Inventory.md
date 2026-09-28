# Systemwide fast data execution inventory

Generated from the checked-in company registries on 2026-09-28. This is a source inventory, not proof of runtime deployment or backend performance. Unknown RPC projections, stable sort guarantees, export scope, and save effects remain explicitly unresolved.

The [registered action access map](Plan_Systemwide_Fast_Data_Endpoint_Map.md) records 357 declared company action grants. It is a starting point for tracing handlers and write effects, not a complete call graph. Phase 0 remains open until browser RPCs, public dispatch, central routes, all storage reads/writes, exports, and identity/order contracts are reconciled.

A literal `companyCall(...)` scan across company HTML found 219 distinct action names. Six do not appear in the declarative page/access map: `add_upload_file`, `delete_deduction`, `delete_legal_manufacture`, `delete_overtime`, `delete_registration_paper`, and `get_budget_refs`. Some are specially guarded or registered outside the declaration table; each needs an explicit handler/permission trace before reuse. This is an inventory gap, not a claim that the routes are publicly accessible.

## Route inventory

| Company | Page action | Template | Access/visibility |
|---|---|---|---|
| TopChemical | `tc_dashboard` | `Company_TopChemical_Dashboard` | Authenticated |
| TopChemical | `tc_kpi` | `Company_TopChemical_KPI` | Authenticated |
| TopChemical | `tc_main_review` | `Company_TopChemical_MainReview` | Authenticated; hidden from primary nav |
| TopChemical | `tc_client_balance_sheets` | `Company_TopChemical_ClientBalanceSheets` | Authenticated; hidden from primary nav |
| TopChemical | `tc_box_analysis` | `Company_TopChemical_BoxAnalysis` | Authenticated; hidden from primary nav |
| TopChemical | `tc_clients_vendors` | `Company_TopChemical_Clients` | Authenticated; hidden from primary nav |
| TopChemical | `tc_debts` | `Company_TopChemical_Debts` | Authenticated; hidden from primary nav |
| TopChemical | `tc_products` | `Company_TopChemical_Products` | Authenticated; hidden from primary nav |
| TopChemical | `tc_barcode` | `Company_TopChemical_Barcode` | Authenticated; hidden from primary nav |
| TopChemical | `tc_registration_papers` | `Company_TopChemical_RegistrationPapers` | Authenticated; hidden from primary nav |
| TopChemical | `tc_trust` | `Company_TopChemical_Trust` | Authenticated; hidden from primary nav |
| TopChemical | `tc_stock_revision` | `Company_TopChemical_StockRevision` | Authenticated; hidden from primary nav |
| TopChemical | `tc_stock_scan` | `Company_TopChemical_StockScan` | Authenticated; hidden from primary nav |
| TopChemical | `tc_customs_office` | `Company_TopChemical_CustomsOffice` | Authenticated; hidden from primary nav |
| TopChemical | `tc_purchasing` | `Company_TopChemical_Purchasing` | Authenticated; hidden from primary nav |
| TopChemical | `tc_import_follow` | `Company_TopChemical_ImportFollow` | Authenticated; hidden from primary nav |
| TopChemical | `tc_carton_sizes` | `Company_TopChemical_CartonSizes` | Authenticated; hidden from primary nav |
| TopChemical | `tc_employee_reg` | `Company_TopChemical_Employees` | Authenticated; hidden from primary nav |
| TopChemical | `tc_employee_status` | `Company_TopChemical_EmployeeStatus` | Authenticated; hidden from primary nav |
| TopChemical | `tc_employee_salary` | `Company_TopChemical_EmployeeSalary` | Authenticated; hidden from primary nav |
| TopChemical | `tc_emp_deductions` | `Company_TopChemical_EmpDeductions` | Authenticated; hidden from primary nav |
| TopChemical | `tc_emp_permits` | `Company_TopChemical_EmpPermits` | Authenticated; hidden from primary nav |
| TopChemical | `tc_emp_overtime` | `Company_TopChemical_EmpOvertime` | Authenticated; hidden from primary nav |
| TopChemical | `tc_emp_salaries` | `Company_TopChemical_EmpSalaries` | Authenticated; hidden from primary nav |
| TopChemical | `tc_emp_salaries_close` | `Company_TopChemical_EmpSalariesClose` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_parties` | `Company_TopChemical_BudgetParties` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_stock_balance` | `Company_TopChemical_BudgetStockBalance` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_inputs` | `Company_TopChemical_BudgetInputs` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_manufacture` | `Company_TopChemical_BudgetManufacture` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_invoices` | `Company_TopChemical_BudgetInvoices` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_cash` | `Company_TopChemical_BudgetCash` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_hr` | `Company_TopChemical_BudgetHR` | Authenticated; hidden from primary nav |
| TopChemical | `tc_budget_income` | `Company_TopChemical_BudgetIncome` | Authenticated; hidden from primary nav |
| TopChemical | `tc_manufacture_orders` | `Company_TopChemical_ManufactureOrders` | Authenticated; hidden from primary nav |
| TopChemical | `tc_production_capability` | `Company_TopChemical_ProductionCapability` | Authenticated; hidden from primary nav |
| TopChemical | `tc_sales_capacity` | `Company_TopChemical_SalesCapacity` | Authenticated; hidden from primary nav |
| TopChemical | `tc_products_live` | `Company_TopChemical_ProductsLive` | Authenticated; hidden from primary nav |
| TopChemical | `tc_financial_ratios` | `Company_TopChemical_FinancialRatios` | Authenticated; hidden from primary nav |
| TopLight | `tl_dashboard` | `Company_TopLight_Dashboard` | Authenticated |
| TopLight | `tl_kpi` | `Company_TopLight_KPI` | Authenticated |
| TopLight | `tl_analysis_review` | `Company_TopLight_Dashboard` | Authenticated; hidden from primary nav |
| TopLight | `tl_products` | `Company_TopLight_Products` | Authenticated |
| TopLight | `tl_customers` | `Company_TopLight_Customers` | Authenticated |
| TopLight | `tl_purchasing` | `Company_TopLight_Purchasing` | Authenticated |
| TopLight | `tl_purchase_print` | `Company_TopLight_Purchase_Print` | Authenticated; hidden from primary nav |
| TopLight | `tl_sales` | `Company_TopLight_Sales` | Authenticated |
| TopLight | `tl_sales_offer` | `Company_TopLight_Sales_Offer` | Authenticated |
| TopLight | `tl_sales_print` | `Company_TopLight_Sales_Print` | Authenticated; hidden from primary nav |
| TopLight | `tl_sales_costing_print` | `Company_TopLight_Sales_Costing_Print` | Authenticated; hidden from primary nav |
| TopLight | `tl_sales_release` | `Company_TopLight_Sales_Release` | Authenticated; hidden from primary nav |
| TopLight | `tl_sales_returns` | `Company_TopLight_Sales_Returns` | Authenticated; hidden from primary nav |
| TopLight | `tl_sales_offer_print` | `Company_TopLight_Sales_Offer_Print` | Authenticated; hidden from primary nav |
| TopLight | `tl_sales_analysis` | `Company_TopLight_Sales_Analysis` | Authenticated; hidden from primary nav |
| TopLight | `tl_sales_costing_analysis` | `Company_TopLight_Sales_Costing_Analysis` | Authenticated; hidden from primary nav |
| TopLight | `tl_income_statement` | `Company_TopLight_Income_Statement` | Authenticated; hidden from primary nav |
| TopLight | `tl_financial_position` | `Company_TopLight_Financial_Position` | Authenticated; hidden from primary nav |
| TopLight | `tl_cash` | `Company_TopLight_Cash` | Authenticated |
| TopLight | `tl_cash_report` | `Company_TopLight_Cash_Report` | Authenticated; hidden from primary nav |
| TopLight | `tl_customer_statement` | `Company_TopLight_Customer_Statement` | Authenticated; hidden from primary nav |
| TopLight | `tl_purchase_needs` | `Company_TopLight_Purchase_Needs` | Authenticated; hidden from primary nav |
| TopLight | `tl_product_movement` | `Company_TopLight_Product_Movement` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_dashboard` | `Company_ValleyFoods_Dashboard` | Authenticated |
| Valley Foods | `vf_kpi` | `Company_ValleyFoods_KPI` | Authenticated |
| Valley Foods | `vf_hr_employees` | `Company_ValleyFoods_HR_Emp` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_status` | `Company_ValleyFoods_HR_Emp` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_shifts` | `Company_ValleyFoods_ShiftAssignment` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_salary` | `Company_ValleyFoods_Salary` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_deductions` | `Company_ValleyFoods_Deductions` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_contracts` | `Company_ValleyFoods_Contracts` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_vacation_alloc` | `Company_ValleyFoods_VacationAlloc` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_vacations` | `Company_ValleyFoods_Vacations` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_overtime` | `Company_ValleyFoods_Overtime` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_monthly_salaries` | `Company_ValleyFoods_MonthlySalaries` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_attendance` | `Company_ValleyFoods_Attendance` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_settings_overtime` | `Company_ValleyFoods_HR_Settings` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_settings_deduction` | `Company_ValleyFoods_HR_Settings` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_settings_vacations` | `Company_ValleyFoods_HR_Settings` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_hr_settings_shifts` | `Company_ValleyFoods_HR_Settings` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_products` | `Company_ValleyFoods_Products` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_parties` | `Company_ValleyFoods_Parties` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_cash` | `Company_ValleyFoods_Cash` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_income_statement` | `Company_ValleyFoods_IncomeStatement` | Authenticated |
| Valley Foods | `vf_cash_expenses` | `Company_ValleyFoods_CashExpenses` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_cash_incomes` | `Company_ValleyFoods_CashIncomes` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_cash_box_balances` | `Company_ValleyFoods_CashBoxBalances` | Authenticated; grant via vf_cash |
| Valley Foods | `vf_sales` | `Company_ValleyFoods_Sales` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_sales_returns` | `Company_ValleyFoods_SalesReturns` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_sales_print` | `Company_ValleyFoods_SalesPrint` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_sales_report` | `Company_ValleyFoods_SalesReport` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_purchasing` | `Company_ValleyFoods_Purchasing` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_purchasing_report` | `Company_ValleyFoods_PurchasingReport` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_warehouse_movement` | `Company_ValleyFoods_WarehouseMovement` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_mfg_recipes` | `Company_ValleyFoods_MfgRecipes` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_mfg_orders` | `Company_ValleyFoods_MfgOrders` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_mfg_order` | `Company_ValleyFoods_MfgOrderView` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_mfg_client_report` | `Company_ValleyFoods_MfgClientReport` | Authenticated; grant via vf_mfg_orders |
| Valley Foods | `vf_workcenters` | `Company_ValleyFoods_WorkCenters` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_asset_technical` | `Company_ValleyFoods_AssetTechnical` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_work_center_assets` | `Company_ValleyFoods_WorkCenterAssets` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_quality_dashboard` | `Company_ValleyFoods_QualityDashboard` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_quality_general` | `Company_ValleyFoods_QualityGeneral` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_quality_sops` | `Company_ValleyFoods_QualitySops` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_quality_my_acks` | `Company_ValleyFoods_QualityMyAcks` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_quality_ncr` | `Company_ValleyFoods_QualityNcr` | Authenticated; hidden from primary nav |
| Valley Foods | `vf_quality_audits` | `Company_ValleyFoods_QualityAudits` | Authenticated; hidden from primary nav |
| Valley Foods | `valley_cost_view` | — | Permission entry only |
| Assessment Center | `ac_dashboard` | `Company_Assessment_Dashboard` | Authenticated |
| Assessment Center | `ac_assessments` | `Company_Assessment_Assessments` | Authenticated; hidden from primary nav |
| Assessment Center | `ac_assessment_form` | `Company_Assessment_AssessmentForm` | Authenticated; hidden from primary nav |
| Assessment Center | `ac_batches` | `Company_Assessment_Batches` | Authenticated; hidden from primary nav |
| Assessment Center | `ac_results` | `Company_Assessment_Results` | Authenticated; hidden from primary nav |
| Assessment Center | `ac_result_view` | `Company_Assessment_ResultView` | Authenticated; hidden from primary nav |
| Assessment Center | `ac_take` | `Company_Assessment_Take` | Public |

Registry entries: TopChemical: 38; TopLight: 23; Valley Foods: 45; Assessment Center: 7. The list includes permission-only entries and public routes; navigation visibility is not authorization.

## Central route and settings boundary

`Code.js` dispatches company RPCs through `company_action` and the Assessment public RPCs through `company_public_action`; these are distinct authorization paths. The ERP Management tabs currently call the following central reads:

| Tab | Read action | Related write/control actions to keep separate |
|---|---|---|
| Companies | `admin_list_companies` | `admin_save_company`, `admin_delete_company` |
| Users | `admin_list_users` | `admin_save_user`, `admin_delete_user` |
| Role matrix | `admin_list_matrix` | `admin_save_matrix`, `admin_delete_matrix_row` |
| System pages | `admin_list_pages` | `admin_save_pages`, `admin_delete_page` |
| Currency | `admin_list_currency` | `admin_save_currency`, `admin_delete_currency` |
| Subscription invoices | `admin_list_invoices` | `admin_save_invoice`, `admin_delete_invoice` |
| Performance | `get_admin_performance` | No business write from this tab |
| Kill switch | `toggle_kill_switch` with no `on` value reads status through an overloaded control route | `toggle_kill_switch` with `on` value changes state |
| Backups | Initial tab view does not fetch a list | `sys_download_backups` on explicit click |

The central `ROUTES` map requires authentication for these actions; handler-level authorization and field projections still need individual audit. The kill-switch handler checks super-admin status, but its status branch first calls `ensureSystemWorkSheet_`, whose Sheet fallback creates the tab if missing. Do not invoke that route as a read-only performance probe. No central settings response is eligible for the generic warm browser cache without a separate freshness and permission contract.

## Current execution decisions

| Route or area | Verified current behavior | Next safe step |
|---|---|---|
| `tc_stock_scan` product dropdown | MySQL product catalog uses compact JSON aggregation and warm browser display; read permission is enforced by its action. | Preserve and measure as reference for bounded catalogs. |
| `tc_products_live` table | Legacy MySQL table response is active. An opt-in keyset/JSON page candidate exists behind `PL_PROGRESSIVE_READ_ = false`. | Compare all stable IDs and fields, search, sort, export, add/edit/soft-delete, and cache invalidation in isolation before enabling. |
| `tc_financial_ratios` | Independent report sections load and render as they arrive; measured slow sections use compact aggregation. | Keep independent loading; inspect per-section timings and query plans before SQL changes. |
| `tl_sales` list | The server reads full Sheets header and related tables, sorts the complete result, then slices a display page. The browser now ignores an older list response when a newer list request has begun. | Prove source order or design a safe index separately before claiming true source paging; measure scan cost. |
| `vf_mfg_orders` | Candidate narrow read exists behind disabled master/module flags; current form uses several reference sources. | Map header, child, and reference contracts; isolated parity before enablement. |
| `ac_take` | Public assessment route. | Keep candidate answers and results out of browser persistence; review submission separately. |
| ERP Management tabs | Tab data is selected lazily. Responses for companies, users, matrix, pages, currency, invoices, and kill switch are now ignored when their tab/request generation is stale. | Verify tab list endpoint projections and admin-only performance visibility; no authority from browser cache. |

## Backend boundaries and active switches

- TopChemical mixes MySQL-backed products, stock, and reports with Sheets-backed operational and reference pages. Resolve each action through `Company_TopChemical_Actions.js` and its action/table mappings.
- TopLight's `tlDbList_` calls the shared full-record Sheets reader. An output JSON wrapper alone will not reduce scan cost.
- Valley Foods uses Sheets-oriented action modules and has several candidate fast-read/save paths behind disabled flags. Multi-table writes remain on legacy paths.
- The shared `Code.js` adapter has Firestore native query cursors. Its Sheets query adapter reads a full tab before filtering. Call sites must be classified rather than assuming either adapter is universal.
- `FAST_READ_CORE_`, `FAST_SAVE_CORE_`, `FORM_CONTRACTS_CORE_`, `MFG_FAST_READ_`, `MFG_PLANNED_SAVE_`, and `PL_PROGRESSIVE_READ_` remain false.

## Priority queue and unresolved contracts

1. Collect comparable cold/warm timings, RPC count, source rows/cells scanned, response bytes, first useful render, and p50/p95 for the proven product paths and each proposed pilot. Internal timing stays server-gated for super admins.
2. For every listed route, trace its browser RPC calls to action registrations, storage helpers, ID/sort keys, permission checks, export/print scope, and related writes. The registry alone does not establish those contracts.
3. Prioritize read-only and bounded reference catalogs, then independent reports. Transaction lists require stable global search and cursor evidence. Form saves require isolated data and parity/recovery evidence.
4. Do not enable a candidate or remove a show-all control while source paging, complete search scope, and write/cache invalidation remain unverified.

## This execution tranche

- Tightened the opt-in shared `UIC.ProgressiveRows` envelope reader to accept declared array rows, reject mismatched row width and duplicate page IDs, and bound/validate warm seeds. Existing object-row consumers keep the same output shape.
- Protected central admin tabs against stale asynchronous list responses after navigation. No settings writes or authority checks changed.
- Protected TopLight sales list refresh/show-all/latest requests against out-of-order responses. This does not reduce the underlying Sheet scan.
- No live database/sheet/document operations, deployment, push, stage, or commit were performed.
