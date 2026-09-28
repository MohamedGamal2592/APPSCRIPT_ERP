# Registered company action access map

Static extraction of action access declarations on 2026-09-28. The table token is the declared primary logging table, not the complete handler read/write set or a verified backend. Trace the handler and its helpers before migration.

| Company | Action | Declared page | Access | Primary table token |
|---|---|---|---|---|
| TopChemical | `get_dashboard_data` | `tc_dashboard` | read | `''` |
| TopChemical | `get_clients_vendors` | `tc_clients_vendors` | read | `CLIENTS_SHEET` |
| TopChemical | `add_client_vendor` | `tc_clients_vendors` | write | `CLIENTS_SHEET` |
| TopChemical | `get_ar_ap` | `tc_debts` | read | `ARAP_SHEET` |
| TopChemical | `get_ar_ap_client` | `tc_debts` | read | `ARAP_SHEET` |
| TopChemical | `add_ar_ap` | `tc_debts` | write | `ARAP_SHEET` |
| TopChemical | `get_products` | `tc_products` | read | `PRODUCTS_SHEET` |
| TopChemical | `add_product` | `tc_products` | write | `PRODUCTS_SHEET` |
| TopChemical | `get_barcode` | `tc_barcode` | read | `BARCODE_SHEET` |
| TopChemical | `add_barcode` | `tc_barcode` | write | `BARCODE_SHEET` |
| TopChemical | `get_registration_papers` | `tc_registration_papers` | read | `REGISTRATION_SHEET` |
| TopChemical | `add_registration_paper` | `tc_registration_papers` | write | `REGISTRATION_SHEET` |
| TopChemical | `update_registration_paper` | `tc_registration_papers` | write | `REGISTRATION_SHEET` |
| TopChemical | `get_trust_accounts` | `tc_trust` | read | `TRUST_SHEET` |
| TopChemical | `get_trust_movements` | `tc_trust` | read | `TRUST_SHEET` |
| TopChemical | `add_trust_movement` | `tc_trust` | write | `TRUST_SHEET` |
| TopChemical | `get_stock_revision` | `tc_stock_revision` | read | `STOCK_SHEET` |
| TopChemical | `add_stock_revision` | `tc_stock_revision` | write | `STOCK_SHEET` |
| TopChemical | `update_stock_revision` | `tc_stock_revision` | full | Unmapped |
| TopChemical | `get_system_qty` | `tc_stock_revision` | read | Unmapped |
| TopChemical | `get_stock_scan_options` | `tc_stock_scan` | read | `PRODUCTS_SHEET` |
| TopChemical | `get_stock_scan_sheet_catalog` | `tc_stock_scan` | read | `PRODUCTS_SHEET` |
| TopChemical | `get_stock_scan_history` | `tc_stock_scan` | read | `STOCK_SHEET` |
| TopChemical | `get_stock_scan_qty` | `tc_stock_scan` | read | Unmapped |
| TopChemical | `get_stock_scan_warehouses` | `tc_stock_scan` | read | `'mysql:warehouse_locations'` |
| TopChemical | `get_stock_scan_balance` | `tc_stock_scan` | read | `'mysql:product_current_qty_warehouses'` |
| TopChemical | `get_stock_scan_catalog` | `tc_stock_scan` | read | `'mysql:products'` |
| TopChemical | `get_stock_scan_balances` | `tc_stock_scan` | read | `'mysql:product_current_qty_warehouses'` |
| TopChemical | `add_stock_scan` | `tc_stock_scan` | write | `STOCK_SHEET` |
| TopChemical | `get_customs_office` | `tc_customs_office` | read | `CUSTOMS_OFFICE_SHEET` |
| TopChemical | `add_customs_office` | `tc_customs_office` | write | `CUSTOMS_OFFICE_SHEET` |
| TopChemical | `get_purchase_items` | `tc_purchasing` | read | `PURCHASE_SHEET` |
| TopChemical | `get_purchase_options` | `tc_purchasing` | read | `PURCHASE_SHEET` |
| TopChemical | `add_purchase_item` | `tc_purchasing` | write | `PURCHASE_SHEET` |
| TopChemical | `add_vendor` | `tc_purchasing` | write | `VENDORS_SHEET` |
| TopChemical | `add_item` | `tc_purchasing` | write | `ITEMS_SHEET` |
| TopChemical | `get_import_follow` | `tc_import_follow` | read | `IMPORT_FOLLOW_SHEET` |
| TopChemical | `add_import_follow` | `tc_import_follow` | write | `IMPORT_FOLLOW_SHEET` |
| TopChemical | `add_import_follow_files` | `tc_import_follow` | write | `IMPORT_FOLLOW_SHEET` |
| TopChemical | `update_import_follow_status` | `tc_import_follow` | full | `IMPORT_FOLLOW_SHEET` |
| TopChemical | `get_carton_sizes` | `tc_carton_sizes` | read | `CARTON_SIZES_SHEET` |
| TopChemical | `add_carton_size` | `tc_carton_sizes` | write | `CARTON_SIZES_SHEET` |
| TopChemical | `add_carton_size_files` | `tc_carton_sizes` | write | `CARTON_SIZES_SHEET` |
| TopChemical | `get_employees` | `tc_employee_reg` | read | `EMPLOYEE_SHEET` |
| TopChemical | `add_employee` | `tc_employee_reg` | write | `EMPLOYEE_SHEET` |
| TopChemical | `get_employee_status` | `tc_employee_status` | read | `EMP_STATUS_SHEET` |
| TopChemical | `add_employee_status` | `tc_employee_status` | write | `EMP_STATUS_SHEET` |
| TopChemical | `get_employee_salary` | `tc_employee_salary` | read | `EMP_SALARY_SHEET` |
| TopChemical | `add_employee_salary` | `tc_employee_salary` | write | `EMP_SALARY_SHEET` |
| TopChemical | `get_emp_deductions` | `tc_emp_deductions` | read | `EMP_DEDUCTIONS_SHEET` |
| TopChemical | `add_emp_deduction` | `tc_emp_deductions` | write | `EMP_DEDUCTIONS_SHEET` |
| TopChemical | `get_emp_permits` | `tc_emp_permits` | read | `EMP_PERMITS_SHEET` |
| TopChemical | `add_emp_permit` | `tc_emp_permits` | write | `EMP_PERMITS_SHEET` |
| TopChemical | `get_emp_overtime` | `tc_emp_overtime` | read | `EMP_OVERTIME_SHEET` |
| TopChemical | `add_emp_overtime` | `tc_emp_overtime` | write | `EMP_OVERTIME_SHEET` |
| TopChemical | `get_emp_salaries` | `tc_emp_salaries` | read | `EMP_SALARIES_SHEET` |
| TopChemical | `add_emp_salaries` | `tc_emp_salaries` | write | `EMP_SALARIES_SHEET` |
| TopChemical | `edit_emp_salary` | `tc_emp_salaries` | full | `EMP_SALARIES_SHEET` |
| TopChemical | `delete_emp_salary` | `tc_emp_salaries` | full | `EMP_SALARIES_SHEET` |
| TopChemical | `update_emp_salary_receipt` | `tc_emp_salaries` | full | `EMP_SALARIES_SHEET` |
| TopChemical | `get_payroll_months` | `tc_emp_salaries_close` | read | `EMP_SALARIES_CLOSE_SHEET` |
| TopChemical | `close_payroll_month` | `tc_emp_salaries_close` | full | `EMP_SALARIES_CLOSE_SHEET` |
| TopChemical | `get_legal_parties` | `tc_budget_parties` | read | `LEGAL_PARTIES_SHEET` |
| TopChemical | `add_legal_party` | `tc_budget_parties` | write | `LEGAL_PARTIES_SHEET` |
| TopChemical | `get_legal_products` | `tc_budget_stock_balance` | read | `LEGAL_PRODUCTS_SHEET` |
| TopChemical | `get_legal_current_products` | `tc_budget_stock_balance` | read | `LEGAL_CURRENT_SHEET` |
| TopChemical | `get_legal_stock_balance` | `tc_budget_stock_balance` | read | `LEGAL_PRODUCTS_SHEET + '/' + LEGAL_CURRENT_SHEET` |
| TopChemical | `get_system_product_options` | `tc_budget_stock_balance` | read | `'mysql:products'` |
| TopChemical | `update_legal_product` | `tc_budget_stock_balance` | write | `LEGAL_PRODUCTS_SHEET` |
| TopChemical | `get_legal_products_movement` | `tc_budget_stock_balance` | read | `LEGAL_MOVEMENT_SHEET` |
| TopChemical | `get_legal_inputs` | `tc_budget_inputs` | read | `LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET` |
| TopChemical | `export_vat_purchasing_xlsx` | `tc_budget_inputs` | write | `LEGAL_PURCHASING_SHEET` |
| TopChemical | `add_legal_costing` | `tc_budget_inputs` | write | `LEGAL_COSTING_SHEET` |
| TopChemical | `add_legal_purchasing_line` | `tc_budget_inputs` | write | `LEGAL_PURCHASING_SHEET` |
| TopChemical | `add_legal_costing_bundle` | `tc_budget_inputs` | write | `LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET` |
| TopChemical | `edit_legal_costing_bundle` | `tc_budget_inputs` | full | `LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET` |
| TopChemical | `delete_legal_costing` | `tc_budget_inputs` | full | `LEGAL_COSTING_SHEET + '/' + LEGAL_PURCHASING_SHEET` |
| TopChemical | `get_legal_manufacture` | `tc_budget_manufacture` | read | `LEGAL_MANUFACTURE_SHEET` |
| TopChemical | `add_legal_manufacture` | `tc_budget_manufacture` | write | `LEGAL_MANUFACTURE_SHEET` |
| TopChemical | `update_legal_manufacture` | `tc_budget_manufacture` | write | `LEGAL_MANUFACTURE_SHEET` |
| TopChemical | `get_legal_invoices` | `tc_budget_invoices` | read | `LEGAL_INVOICES_SHEET` |
| TopChemical | `add_legal_invoice` | `tc_budget_invoices` | write | `LEGAL_INVOICES_SHEET` |
| TopChemical | `make_collection_from_invoice` | `tc_budget_invoices` | full | `LEGAL_CASH_SHEET` |
| TopChemical | `make_collections_from_invoices` | `tc_budget_invoices` | full | `LEGAL_CASH_SHEET` |
| TopChemical | `get_legal_cash` | `tc_budget_cash` | read | `LEGAL_CASH_SHEET` |
| TopChemical | `add_legal_cash` | `tc_budget_cash` | write | `LEGAL_CASH_SHEET` |
| TopChemical | `toggle_legal_cash_approved` | `tc_budget_cash` | full | `LEGAL_CASH_SHEET` |
| TopChemical | `get_legal_hr` | `tc_budget_hr` | read | `LEGAL_EMPLOYEES_SHEET` |
| TopChemical | `add_legal_employee` | `tc_budget_hr` | write | `LEGAL_EMPLOYEES_SHEET` |
| TopChemical | `get_legal_salaries` | `tc_budget_hr` | read | `LEGAL_SALARIES_SHEET` |
| TopChemical | `add_legal_salary` | `tc_budget_hr` | write | `LEGAL_SALARIES_SHEET` |
| TopChemical | `get_income_statement` | `tc_budget_income` | read | `LEGAL_INCOME_SHEET` |
| TopChemical | `get_kpi_data` | `tc_kpi` | read | Unmapped |
| TopChemical | `prefetch_refs` | `tc_dashboard` | read | `PRODUCTS_SHEET` |
| TopChemical | `get_main_review` | `tc_main_review` | read | `'mysql:clients_AR'` |
| TopChemical | `revise_main_review` | `tc_main_review` | write | `'mysql:clients_AR'` |
| TopChemical | `get_client_balance_sheets` | `tc_client_balance_sheets` | read | `'mysql:client_balance_sheets'` |
| TopChemical | `save_client_balance_sheet` | `tc_client_balance_sheets` | write | `'mysql:client_balance_sheets'` |
| TopChemical | `delete_client_balance_sheet` | `tc_client_balance_sheets` | write | `'mysql:client_balance_sheets'` |
| TopChemical | `get_box_analysis` | `tc_box_analysis` | read | `'mysql:regular_box_movement'` |
| TopChemical | `get_box_item_history` | `tc_box_analysis` | read | `'mysql:regular_box_movement'` |
| TopChemical | `update_box_movement` | `tc_box_analysis` | write | `'mysql:regular_box_movement'` |
| TopChemical | `revise_box_movement` | `tc_box_analysis` | write | `'mysql:regular_box_movement'` |
| TopChemical | `get_box_alerts` | `tc_box_analysis` | read | `'mysql:regular_box_movement'` |
| TopChemical | `save_box_item_alias` | `tc_box_analysis` | write | `'drive:Box_Analysis_Audit/box_item_aliases.json'` |
| TopChemical | `get_manufacture_headers` | `tc_manufacture_orders` | read | `'mysql:manufacture_headers'` |
| TopChemical | `get_manufacture_footers` | `tc_manufacture_orders` | read | `'mysql:manufacture_footers'` |
| TopChemical | `save_manufacture_header` | `tc_manufacture_orders` | write | `'mysql:manufacture_headers'` |
| TopChemical | `save_manufacture_footer` | `tc_manufacture_orders` | write | `'mysql:manufacture_footers'` |
| TopChemical | `add_manufacture_footer` | `tc_manufacture_orders` | write | `'mysql:manufacture_footers'` |
| TopChemical | `delete_manufacture_header` | `tc_manufacture_orders` | write | `'mysql:manufacture_headers'` |
| TopChemical | `delete_manufacture_footer` | `tc_manufacture_orders` | write | `'mysql:manufacture_footers'` |
| TopChemical | `get_manufacture_refs` | `tc_manufacture_orders` | read | `'mysql:manufacture_headers'` |
| TopChemical | `get_products_live` | `tc_products_live` | read | `'mysql:products'` |
| TopChemical | `get_products_live_direct_test` | `tc_products_live` | read | `'mysql:products'` |
| TopChemical | `add_product_live` | `tc_products_live` | write | `'mysql:products'` |
| TopChemical | `get_production_capability_products` | `tc_production_capability` | read | `'mysql:manuf_product_support_capability'` |
| TopChemical | `get_production_capability_rows` | `tc_production_capability` | read | `'mysql:manuf_product_support_capability'` |
| TopChemical | `get_production_capability_catalog` | `tc_production_capability` | read | `'mysql:manuf_product_support_capability'` |
| TopChemical | `get_sales_capacity_catalog` | `tc_sales_capacity` | read | `'mysql:manuf_product_support_capability'` |
| TopChemical | `get_sales_capacity_products` | `tc_sales_capacity` | read | `'mysql:manuf_product_support_capability'` |
| TopChemical | `get_sales_capacity_rows` | `tc_sales_capacity` | read | `'mysql:manuf_product_support_capability'` |
| TopChemical | `save_product_live` | `tc_products_live` | write | `'mysql:products'` |
| TopChemical | `delete_product_live` | `tc_products_live` | write | `'mysql:products'` |
| TopChemical | `get_financial_sales_totals` | `tc_financial_ratios` | read | `'mysql:invoice_headers` |
| TopChemical | `get_financial_other_income` | `tc_financial_ratios` | read | `'mysql:expenses_income_report'` |
| TopChemical | `get_financial_expenses` | `tc_financial_ratios` | read | `'mysql:expenses_income_report'` |
| TopChemical | `get_financial_production` | `tc_financial_ratios` | read | `'mysql:manufacture_headers` |
| TopChemical | `get_financial_used_materials` | `tc_financial_ratios` | read | `'mysql:manufacture_report_view` |
| TopChemical | `get_financial_used_materials_plan` | `tc_financial_ratios` | read | `'mysql:manufacture_report_view` |
| TopLight | `get_dashboard_data` | Unmapped | Unmapped | Unmapped |
| TopLight | `get_kpi_data` | `tl_kpi` | read | Unmapped |
| TopLight | `get_products` | `tl_products` | read | Unmapped |
| TopLight | `add_product` | `tl_products` | write | Unmapped |
| TopLight | `edit_product` | `tl_products` | full | Unmapped |
| TopLight | `get_parties` | `tl_customers` | read | Unmapped |
| TopLight | `add_party` | `tl_customers` | write | Unmapped |
| TopLight | `edit_party` | `tl_customers` | full | Unmapped |
| TopLight | `get_purchasing_headers` | `tl_purchasing` | read | Unmapped |
| TopLight | `get_purchasing_options` | `tl_purchasing` | read | Unmapped |
| TopLight | `get_purchasing_lines` | `tl_purchasing` | read | Unmapped |
| TopLight | `get_purchase_print` | `tl_purchase_print` | read | Unmapped |
| TopLight | `add_purchasing` | `tl_purchasing` | write | Unmapped |
| TopLight | `edit_purchasing` | `tl_purchasing` | full | Unmapped |
| TopLight | `delete_purchasing` | `tl_purchasing` | full | Unmapped |
| TopLight | `approve_purchasing` | `tl_purchasing` | write | Unmapped |
| TopLight | `get_sales_headers` | `tl_sales` | read | Unmapped |
| TopLight | `get_sales_options` | `tl_sales` | read | Unmapped |
| TopLight | `get_sales_lines` | `tl_sales` | read | Unmapped |
| TopLight | `get_sales_print` | `tl_sales_print` | read | Unmapped |
| TopLight | `get_sales_costing` | `tl_sales_costing_print` | read | Unmapped |
| TopLight | `add_sales` | `tl_sales` | write | Unmapped |
| TopLight | `edit_sales` | `tl_sales` | full | Unmapped |
| TopLight | `delete_sales` | `tl_sales` | full | Unmapped |
| TopLight | `approve_sales` | `tl_sales` | write | Unmapped |
| TopLight | `get_sales_returns` | `tl_sales_returns` | read | Unmapped |
| TopLight | `add_sales_return` | `tl_sales_returns` | write | Unmapped |
| TopLight | `delete_sales_return` | `tl_sales_returns` | full | Unmapped |
| TopLight | `get_cash_headers` | `tl_cash` | read | Unmapped |
| TopLight | `add_cash` | `tl_cash` | write | Unmapped |
| TopLight | `edit_cash` | `tl_cash` | full | Unmapped |
| TopLight | `delete_cash` | `tl_cash` | full | Unmapped |
| TopLight | `approve_cash` | `tl_cash` | write | Unmapped |
| TopLight | `add_transfer` | `tl_cash` | write | Unmapped |
| TopLight | `get_customer_statement` | `tl_customer_statement` | read | Unmapped |
| TopLight | `get_sales_offer_headers` | `tl_sales_offer` | read | Unmapped |
| TopLight | `get_sales_offer_lines` | `tl_sales_offer` | read | Unmapped |
| TopLight | `get_sales_offer_print` | `tl_sales_offer_print` | read | Unmapped |
| TopLight | `add_sales_offer` | `tl_sales_offer` | write | Unmapped |
| TopLight | `edit_sales_offer` | `tl_sales_offer` | full | Unmapped |
| TopLight | `delete_sales_offer` | `tl_sales_offer` | full | Unmapped |
| TopLight | `approve_sales_offer` | `tl_sales_offer` | write | Unmapped |
| TopLight | `get_sales_analysis` | `tl_sales_analysis` | read | Unmapped |
| TopLight | `get_sales_costing_analysis` | `tl_sales_costing_analysis` | read | Unmapped |
| TopLight | `get_income_statement` | `tl_income_statement` | read | Unmapped |
| TopLight | `get_financial_position` | `tl_financial_position` | read | Unmapped |
| TopLight | `get_cash_report` | `tl_cash_report` | read | Unmapped |
| TopLight | `get_xlsx_export` | Unmapped | Unmapped | Unmapped |
| TopLight | `get_purchase_needs` | `tl_purchase_needs` | read | Unmapped |
| TopLight | `get_product_movement` | `tl_product_movement` | read | Unmapped |
| TopLight | `prefetch_refs` | `tl_dashboard` | read | Unmapped |
| TopLight | `get_page_versions` | Unmapped | Unmapped | Unmapped |
| Valley Foods | `get_dashboard_data` | `vf_dashboard` | read | Unmapped |
| Valley Foods | `get_kpi_data` | `vf_kpi` | read | Unmapped |
| Valley Foods | `get_employees_data` | `vf_hr_employees` | read | Unmapped |
| Valley Foods | `add_employee` | `vf_hr_employees` | write | Unmapped |
| Valley Foods | `get_hr_employees` | `vf_hr_employees` | read | `HR_EMPLOYEES_SHEET` |
| Valley Foods | `add_hr_employees` | `vf_hr_employees` | write | Unmapped |
| Valley Foods | `get_valley_hr_page` | `vf_hr_employees` | read | Unmapped |
| Valley Foods | `get_emp_status_data` | `vf_hr_status` | read | `HR_EMPLOYEES_SHEET` |
| Valley Foods | `add_emp_status` | `vf_hr_status` | write | Unmapped |
| Valley Foods | `get_shift_assignment_data` | `vf_hr_shifts` | read | `'valley_employee_shift_assignment'` |
| Valley Foods | `add_shift_assignment` | `vf_hr_shifts` | write | Unmapped |
| Valley Foods | `get_salary_data` | `vf_hr_salary` | read | `'valley_employee_salary'` |
| Valley Foods | `add_employee_salary` | `vf_hr_salary` | write | Unmapped |
| Valley Foods | `get_deductions_data` | `vf_hr_deductions` | read | `'valley_emp_deductions'` |
| Valley Foods | `add_deduction` | `vf_hr_deductions` | write | Unmapped |
| Valley Foods | `update_deduction` | `vf_hr_deductions` | write | `'valley_emp_deductions'` |
| Valley Foods | `get_contracts_data` | `vf_hr_contracts` | read | `'valley_employee_contracts'` |
| Valley Foods | `add_contract` | `vf_hr_contracts` | write | Unmapped |
| Valley Foods | `update_contract` | `vf_hr_contracts` | write | `'valley_employee_contracts'` |
| Valley Foods | `get_vacation_alloc_data` | `vf_hr_vacation_alloc` | read | `'valley_employee_vacation_allocation'` |
| Valley Foods | `add_vacation_alloc` | `vf_hr_vacation_alloc` | write | Unmapped |
| Valley Foods | `get_vacations_data` | `vf_hr_vacations` | read | `'valley_employee_vacations'` |
| Valley Foods | `add_vacation` | `vf_hr_vacations` | write | Unmapped |
| Valley Foods | `update_vacation` | `vf_hr_vacations` | write | `'valley_employee_vacations'` |
| Valley Foods | `delete_vacation` | `vf_hr_vacations` | full | Unmapped |
| Valley Foods | `get_overtime_data` | `vf_hr_overtime` | read | `'valley_emp_overtime'` |
| Valley Foods | `add_overtime` | `vf_hr_overtime` | write | Unmapped |
| Valley Foods | `update_overtime` | `vf_hr_overtime` | write | `'valley_emp_overtime'` |
| Valley Foods | `get_monthly_salaries_data` | `vf_hr_monthly_salaries` | read | `'valley_emp_salaries'` |
| Valley Foods | `add_monthly_salary` | `vf_hr_monthly_salaries` | write | Unmapped |
| Valley Foods | `generate_monthly_salaries` | `vf_hr_monthly_salaries` | write | `'valley_emp_salaries'` |
| Valley Foods | `get_attendance_sessions` | `vf_hr_attendance` | read | `'valley_attendance_session'` |
| Valley Foods | `add_attendance_session` | `vf_hr_attendance` | write | Unmapped |
| Valley Foods | `get_attendance_data` | `vf_hr_attendance` | read | `'valley_employee_attendance'` |
| Valley Foods | `get_attendance_employees` | `vf_hr_attendance` | read | `'valley_employee_info'` |
| Valley Foods | `add_manual_attendance` | `vf_hr_attendance` | write | Unmapped |
| Valley Foods | `commit_attendance_import` | `vf_hr_attendance` | write | `'valley_employee_attendance'` |
| Valley Foods | `get_attendance_report` | `vf_hr_attendance` | read | `'valley_employee_attendance'` |
| Valley Foods | `get_attendance_index` | `vf_hr_attendance` | read | `'valley_attendance_session'` |
| Valley Foods | `get_attendance_review` | `vf_hr_attendance` | read | `'valley_attendance_needs_review'` |
| Valley Foods | `resolve_attendance_review` | `vf_hr_attendance` | write | `'valley_attendance_needs_review'` |
| Valley Foods | `get_attendance_exceptions` | `vf_hr_attendance` | read | `'valley_employee_attendance'` |
| Valley Foods | `get_attendance_batches` | `vf_hr_attendance` | read | `'valley_attendance_import_batch'` |
| Valley Foods | `revert_attendance_import` | `vf_hr_attendance` | full | `'valley_attendance_import_batch'` |
| Valley Foods | `get_overtime_roles_settings` | `vf_hr_settings_overtime` | read | `'valley_employee_overtime_roles'` |
| Valley Foods | `save_overtime_role` | `vf_hr_settings_overtime` | write | `'valley_employee_overtime_roles'` |
| Valley Foods | `toggle_overtime_role` | `vf_hr_settings_overtime` | full | Unmapped |
| Valley Foods | `get_deduction_roles_settings` | `vf_hr_settings_deduction` | read | `'valley_employee_deduction_roles'` |
| Valley Foods | `save_deduction_role` | `vf_hr_settings_deduction` | write | `'valley_employee_deduction_roles'` |
| Valley Foods | `toggle_deduction_role` | `vf_hr_settings_deduction` | full | Unmapped |
| Valley Foods | `get_vacations_index_settings` | `vf_hr_settings_vacations` | read | `'valley_employee_vacations_index'` |
| Valley Foods | `save_vacation_index` | `vf_hr_settings_vacations` | write | `'valley_employee_vacations_index'` |
| Valley Foods | `toggle_vacation_index` | `vf_hr_settings_vacations` | full | Unmapped |
| Valley Foods | `get_shift_schedule_settings` | `vf_hr_settings_shifts` | read | `'valley_employee_shift_schedule'` |
| Valley Foods | `save_shift_schedule` | `vf_hr_settings_shifts` | write | `'valley_employee_shift_schedule'` |
| Valley Foods | `toggle_shift_schedule` | `vf_hr_settings_shifts` | full | Unmapped |
| Valley Foods | `get_valley_products` | `vf_products` | read | `'valley_products'` |
| Valley Foods | `save_valley_product` | `vf_products` | write | `'valley_products'` |
| Valley Foods | `get_valley_parties` | `vf_parties` | read | `'valley_legal_customer_vendor'` |
| Valley Foods | `save_valley_party` | `vf_parties` | write | `'valley_legal_customer_vendor'` |
| Valley Foods | `get_valley_party_statement` | `vf_parties` | read | `'valley_legal_customer_vendor'` |
| Valley Foods | `get_valley_party_balances` | `vf_parties` | read | `'valley_legal_customer_vendor'` |
| Valley Foods | `save_valley_mfg_agreement` | `vf_parties` | write | `'valley_manufacturing_agreements'` |
| Valley Foods | `cancel_valley_mfg_agreement` | `vf_parties` | write | `'valley_manufacturing_agreements'` |
| Valley Foods | `get_valley_cash` | `vf_cash` | read | `'valley_cash_bank_movement'` |
| Valley Foods | `get_valley_cash_expense_report` | `vf_cash` | read | `'valley_cash_bank_movement'` |
| Valley Foods | `get_valley_cash_income_report` | `vf_cash` | read | `'valley_cash_bank_movement'` |
| Valley Foods | `get_valley_cash_box_balance_report` | `vf_cash` | read | `'valley_cash_bank_movement'` |
| Valley Foods | `save_valley_cash` | `vf_cash` | write | `'valley_cash_bank_movement'` |
| Valley Foods | `approve_valley_cash` | `vf_cash` | write | Unmapped |
| Valley Foods | `delete_valley_cash` | `vf_cash` | full | Unmapped |
| Valley Foods | `transfer_valley_cash` | `vf_cash` | write | `'valley_cash_bank_movement'` |
| Valley Foods | `get_valley_warehouse_movements` | `vf_warehouse_movement` | read | `'valley_warehouse_movement'` |
| Valley Foods | `get_valley_warehouse_move_options` | `vf_warehouse_movement` | read | `'valley_warehouse_movement'` |
| Valley Foods | `save_valley_warehouse_movement` | `vf_warehouse_movement` | write | `'valley_warehouse_movement'` |
| Valley Foods | `get_valley_purchasing_costing` | `vf_purchasing` | read | `'valley_purchasing_costing'` |
| Valley Foods | `get_valley_purchasing_report` | `vf_purchasing` | read | `'valley_purchasing_costing'` |
| Valley Foods | `get_valley_purchasing_options` | `vf_purchasing` | read | `'valley_product_purchasing'` |
| Valley Foods | `get_valley_purchasing_lines` | `vf_purchasing` | read | `'valley_product_purchasing'` |
| Valley Foods | `save_valley_purchasing_costing` | `vf_purchasing` | write | `'valley_purchasing_costing'` |
| Valley Foods | `save_valley_purchasing_header_checkpoint` | `vf_purchasing` | write | `'valley_purchasing_costing'` |
| Valley Foods | `save_valley_purchasing_lines_checkpoint` | `vf_purchasing` | write | `'valley_product_purchasing'` |
| Valley Foods | `delete_valley_purchasing_costing` | `vf_purchasing` | full | `'valley_purchasing_costing'` |
| Valley Foods | `approve_valley_purchasing_costing` | `vf_purchasing` | write | `'valley_purchasing_costing'` |
| Valley Foods | `quality_approve_valley_purchasing_costing` | `vf_purchasing` | write | `'valley_purchasing_costing'` |
| Valley Foods | `reconcile_valley_purchasing_receipts` | `vf_purchasing` | full | Unmapped |
| Valley Foods | `get_valley_sales_bootstrap` | `vf_sales` | read | `'valley_sales_invoices'` |
| Valley Foods | `get_valley_sales_page` | `vf_sales` | read | Unmapped |
| Valley Foods | `get_valley_product_batches` | `vf_sales` | read | `'valley_current_products'` |
| Valley Foods | `get_valley_sales_report` | `vf_sales` | read | `'valley_sales_invoices'` |
| Valley Foods | `get_valley_income_statement` | `vf_income_statement` | read | `'valley_chart_of_accounts'` |
| Valley Foods | `get_valley_mfg_recipes` | `vf_mfg_recipes` | read | `'valley_product_recipe'` |
| Valley Foods | `save_valley_mfg_recipe` | `vf_mfg_recipes` | write | `'valley_product_recipe'` |
| Valley Foods | `get_valley_mfg_orders` | `vf_mfg_orders` | read | `'valley_manufacture_header'` |
| Valley Foods | `get_valley_recipe_consumption` | `vf_mfg_orders` | read | `'valley_product_recipe_footer'` |
| Valley Foods | `save_valley_mfg_order` | `vf_mfg_orders` | write | `'valley_manufacture_header'` |
| Valley Foods | `approve_valley_mfg_order` | `vf_mfg_orders` | write | `'valley_manufacture_header'` |
| Valley Foods | `delete_valley_mfg_order` | `vf_mfg_orders` | full | `'valley_manufacture_header'` |
| Valley Foods | `get_valley_mfg_order_full` | `vf_mfg_orders` | read | `'valley_manufacture_header'` |
| Valley Foods | `get_valley_mfg_byproducts` | `vf_mfg_orders` | read | `'valley_manufacture_by_product'` |
| Valley Foods | `add_valley_mfg_byproduct` | `vf_mfg_orders` | write | `'valley_manufacture_by_product'` |
| Valley Foods | `get_valley_mfg_workops` | `vf_mfg_orders` | read | `'valley_manufacture_work_center'` |
| Valley Foods | `save_valley_mfg_workop` | `vf_mfg_orders` | write | `'valley_manufacture_work_center'` |
| Valley Foods | `control_valley_mfg_workop` | `vf_mfg_orders` | write | `'valley_manufacture_work_center'` |
| Valley Foods | `change_valley_mfg_status` | `vf_mfg_orders` | write | `'valley_manufacture_header'` |
| Valley Foods | `get_valley_recipe_plan` | `vf_mfg_orders` | read | `'valley_product_recipe'` |
| Valley Foods | `get_valley_mfg_order_detail` | `vf_mfg_orders` | read | `'valley_manufacture_header'` |
| Valley Foods | `get_valley_mfg_request_diagnosis` | `vf_mfg_orders` | read | Unmapped |
| Valley Foods | `get_valley_mfg_client_report` | `vf_mfg_orders` | read | `'valley_manufacture_header'` |
| Valley Foods | `get_valley_product_batches_multi` | `vf_sales` | read | `'valley_current_products'` |
| Valley Foods | `vf_mfg_order` | `vf_mfg_order` | read | `'valley_manufacture_header'` |
| Valley Foods | `get_valley_mfg_order_view` | `vf_mfg_order` | read | `'valley_manufacture_header'` |
| Valley Foods | `approve_valley_invoice` | `vf_sales` | write | `'valley_sales_invoices'` |
| Valley Foods | `delete_valley_invoice` | `vf_sales` | full | `'valley_sales_invoices'` |
| Valley Foods | `get_valley_invoice_lines` | `vf_sales` | read | `'valley_sales_products'` |
| Valley Foods | `save_valley_invoice` | `vf_sales` | write | `'valley_sales_invoices'` |
| Valley Foods | `get_valley_sales_list` | `vf_sales` | read | `'valley_sales_invoices'` |
| Valley Foods | `fr_shadow_compare` | `vf_sales` | write | Unmapped |
| Valley Foods | `get_valley_invoice_full` | `vf_sales` | read | `'valley_sales_invoices'` |
| Valley Foods | `get_valley_returns_list` | `vf_sales_returns` | read | `'valley_sales_returns'` |
| Valley Foods | `get_valley_invoice_for_return` | `vf_sales_returns` | read | `'valley_sales_returns'` |
| Valley Foods | `save_valley_return` | `vf_sales_returns` | write | `'valley_sales_returns'` |
| Valley Foods | `get_test_data` | `vf_test_data` | write | `'valley_test_data_log'` |
| Valley Foods | `generate_test_data` | `vf_test_data` | write | `'valley_test_data_log'` |
| Valley Foods | `remove_test_data` | `vf_test_data` | full | `'valley_test_data_log'` |
| Valley Foods | `get_valley_work_centers` | `vf_workcenters` | read | `'valley_work_centers'` |
| Valley Foods | `save_valley_work_center` | `vf_workcenters` | write | `'valley_work_centers'` |
| Valley Foods | `get_valley_asset_technicals` | `vf_asset_technical` | read | `'valley_product_technical'` |
| Valley Foods | `save_valley_asset_technical` | `vf_asset_technical` | write | `'valley_product_technical'` |
| Valley Foods | `get_valley_work_center_assets` | `vf_work_center_assets` | read | `'valley_work_center_assets'` |
| Valley Foods | `save_valley_work_center_asset` | `vf_work_center_assets` | write | `'valley_work_center_assets'` |
| Valley Foods | `get_quality_sops` | `vf_quality_sops` | read | `['valley_quality_sops'` |
| Valley Foods | `save_quality_sop` | `vf_quality_sops` | write | `['valley_quality_sops'` |
| Valley Foods | `save_quality_sop_version` | `vf_quality_sops` | write | `['valley_quality_sop_versions'` |
| Valley Foods | `submit_quality_sop_version` | `vf_quality_sops` | write | `['valley_quality_sop_versions'` |
| Valley Foods | `approve_quality_sop_version` | `vf_quality_sops` | full | `['valley_quality_sop_versions'` |
| Valley Foods | `reject_quality_sop_version` | `vf_quality_sops` | full | `['valley_quality_sop_versions'` |
| Valley Foods | `make_effective_quality_sop_version` | `vf_quality_sops` | full | `['valley_quality_sops'` |
| Valley Foods | `save_quality_sop_forms` | `vf_quality_sops` | write | `['valley_quality_sop_forms'` |
| Valley Foods | `launch_quality_acks` | `vf_quality_sops` | full | `['valley_quality_acknowledgements'` |
| Valley Foods | `get_quality_my_acks` | `vf_quality_my_acks` | read | `['valley_quality_acknowledgements'` |
| Valley Foods | `sign_quality_ack` | `vf_quality_my_acks` | write | `['valley_quality_acknowledgements']` |
| Valley Foods | `record_quality_ack` | `vf_quality_my_acks` | write | `['valley_quality_acknowledgements'` |
| Valley Foods | `get_quality_ncr` | `vf_quality_ncr` | read | `['valley_quality_ncrs'` |
| Valley Foods | `save_quality_ncr` | `vf_quality_ncr` | write | `['valley_quality_ncrs']` |
| Valley Foods | `save_quality_capa` | `vf_quality_ncr` | write | `['valley_quality_capas'` |
| Valley Foods | `change_quality_ncr_status` | `vf_quality_ncr` | write | `['valley_quality_ncrs'` |
| Valley Foods | `close_quality_ncr` | `vf_quality_ncr` | full | `['valley_quality_ncrs']` |
| Valley Foods | `get_quality_dashboard` | `vf_quality_dashboard` | read | `['valley_quality_sops'` |
| Valley Foods | `get_quality_audits` | `vf_quality_audits` | read | `['valley_quality_audits'` |
| Valley Foods | `save_quality_audit` | `vf_quality_audits` | write | `['valley_quality_audits']` |
| Valley Foods | `save_quality_finding` | `vf_quality_audits` | write | `['valley_quality_audits'` |
| Valley Foods | `escalate_finding_to_ncr` | `vf_quality_audits` | write | `['valley_quality_audits'` |
| Valley Foods | `get_quality_general` | `vf_quality_general` | read | `['valley_quality_general']` |
| Valley Foods | `save_quality_general` | `vf_quality_general` | write | `['valley_quality_general']` |
| Valley Foods | `set_quality_general_status` | `vf_quality_general` | full | `['valley_quality_general']` |
| Valley Foods | `save_quality_dept_abbr` | `vf_quality_sops` | full | `['valley_quality_dept_abbr']` |
| Valley Foods | `prefetch_refs` | `vf_dashboard` | read | `'valley_products'` |
| Assessment Center | `get_ac_dashboard` | `ac_dashboard` | read | Unmapped |
| Assessment Center | `prefetch_refs` | `ac_dashboard` | read | `ASSESSMENTS_SHEET` |
| Assessment Center | `get_ac_assessments` | `ac_assessments` | read | `ASSESSMENTS_SHEET` |
| Assessment Center | `get_ac_assessment` | `ac_assessments` | read | `ASSESSMENTS_SHEET` |
| Assessment Center | `add_ac_assessment` | `ac_assessments` | write | `ASSESSMENTS_SHEET` |
| Assessment Center | `add_ac_assessment_copy` | `ac_assessments` | write | `ASSESSMENTS_SHEET` |
| Assessment Center | `toggle_ac_assessment_active` | `ac_assessments` | full | `ASSESSMENTS_SHEET` |
| Assessment Center | `get_ac_batches` | `ac_batches` | read | `BATCHES_SHEET` |
| Assessment Center | `get_ac_batch` | `ac_batches` | read | `BATCHES_SHEET` |
| Assessment Center | `add_ac_batch` | `ac_batches` | write | `BATCHES_SHEET` |
| Assessment Center | `add_ac_batch_invites` | `ac_batches` | write | `ASSIGNMENTS_SHEET` |
| Assessment Center | `toggle_ac_batch_active` | `ac_batches` | full | `BATCHES_SHEET` |
| Assessment Center | `update_ac_batch_expiry` | `ac_batches` | full | `BATCHES_SHEET` |
| Assessment Center | `get_ac_results` | `ac_results` | read | `ASSIGNMENTS_SHEET` |
| Assessment Center | `get_ac_result` | `ac_results` | read | `ASSIGNMENTS_SHEET` |
| Assessment Center | `add_ac_candidate_grade` | `ac_results` | write | `RESPONSES_SHEET` |
| Assessment Center | `add_ac_review_decision` | `ac_results` | write | `ASSIGNMENTS_SHEET` |

Extracted declarations: TopChemical: 130; TopLight: 52; Valley Foods: 158; Assessment Center: 17.

These declarations do not include all dynamically registered or public dispatch actions. A static literal `companyCall(...)` scan found 219 names, including six absent here; see the execution inventory. Reconcile them against `register(...)`, public registrations, dynamic browser calls, and central `Code.js` routes. Do not treat this as a complete storage or write-effect map.
