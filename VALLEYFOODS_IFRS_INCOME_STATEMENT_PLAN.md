# Valley Foods: IFRS income statement assessment and build plan

Prepared 12 September 2026. Workspace: `D:\Work\Script`.

## 1. Controller conclusion

Valley Foods has useful sales, purchasing, inventory, manufacturing and cash tables. Combining its current reports would not produce a reliable IFRS income statement: revenue cut-off, historical inventory costing, accruals, account classification and close controls need additional support.

This study examines current working-tree source definitions, formulas, handlers and selected legacy schema references. It does not validate production rows, live formulas, balances or live role assignments. No period or transaction export was supplied. The statement below is a report specification, not actual company financial results. A schedule absent from the reviewed code may exist elsewhere.

Use an authoritative finance trial balance if available, with operational subledger reconciliations. Otherwise build a small balanced accounting subledger. Missing amounts must be shown as unavailable, never silently zero.

Planning assumptions: one manufacturing entity; monthly/YTD reporting and same-period prior-year comparison; EGP provisionally. Finance must confirm functional/presentation currency, fiscal calendar, framework, costing policy and materiality before finalization.

Use IAS 1 for annual periods beginning before 1 January 2027 unless IFRS 18 is adopted early. Prepare versioned mappings and comparative transition support for IFRS 18, effective for annual periods beginning on or after that date. An income statement alone is not a complete set of IFRS financial statements. [IAS 1](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/), [IFRS 18 effective date](https://www.ifrs.org/news-and-events/news/2024/04/new-ifrs-accounting-standard-will-aid-investor-analysis-of-companies-financial-performance/).

## 2. Actual table map

The current menu groups warehouse movement with finance; production is separate. Owners below are proposed responsibilities, not verified permission assignments. Most finance implementation is in `Company_ValleyFoods_HR_Modules.js`, despite its filename.

| Existing table | Fields and joins observed | Accounting use / owner |
| --- | --- | --- |
| `valley_sales_invoices` | Key `invoice_unique_id`; `تاريخ الفاتورة`, `المبلغ الصافي`, `قيمة الضريبة`, `إجمالي`, `approval_status`, `tax_system`; also contains `unique_id` | Finance: revenue control total, VAT and cut-off evidence. Distinguish the two UIDs. |
| `valley_sales_products` | `unique_id`; `valley_sales_header_id` → invoice `invoice_unique_id`; `product_id`, `product_qty`, `product_price`, `product_net_value`, `product_tax_value`, `product_total_value` | Revenue detail. Sum once and reconcile to header; never add both. |
| `valley_sales_product_stock` | `unique_id`; `valley_sales_products_id` → line UID; `product_unique_id` → batch; `product_qty` | Warehouse: allocation evidence. Finance: COGS valuation. Canonical stored fields lack sale-date cost snapshots. |
| `valley_sales_returns` | Invoice/line FKs; `unique_id`, `valley_return_date`, `valley_return_qty`, `valley_return_value` | Return recognition by its own date. Writer uses quantity × original price; tax/provision treatment needs support. |
| `valley_sales_returns_stock` | `valley_sales_returns_id` → return UID; **`product_unique_id` → original sales allocation UID**, not batch directly | Follow allocation → batch for original cost recovery; warehouse verifies condition. Identical field names have different FK semantics. |
| `valley_purchasing_costing` | `Code`, `Reciept Date`, `Currency`, `Exchange rate`, invoice/import values, cost/tax fields, approvals | Finance: landed-cost classification and invoice control. |
| `valley_product_purchasing` | `unique_id`; `code` → header **`Code`**; `product`, `receipt_date`, `invoice_date`, `qty`, `unit_price`, `other_cost`, `total_cost`, `unit_cost`, `purchase_unit_cost`, `currency`, `exchange_rate`, `cost_currency`, expiry/production dates | Warehouse verifies receipt; finance validates inventory/asset cost and unbilled receipts. Do not expense all purchases or duplicate allocated header charges. |
| `valley_current_products` | `unique_id`, `product_id`, `transaction_date`, `current_qty`, `unit_cost`, `transaction_code` read by runtime | Formula-derived current balance, already reflecting feeding movements. Reconciliation target, not historical opening valuation. Never write it. |
| `valley_warehouse_movement` | Exactly 17 canonical fields; `item` → batch; `qty`, `amount`, `movement_type`, **`movmenent_sign`**, `movement_date`, `asset_target`, `notes` | Warehouse supplies purpose; finance determines production, expense, asset, transfer or loss. Positive stored amount needs direction from type/sign. |
| `valley_manufacture_header` | `unique_id`, `manufacture_date`, `produced_product`, quantities, `mo_status`, approvals, `total_inventory_cost`, `total_other_cost`, `by_product_nrv_value`, `total_batch_cost`, `abnormal_amount` | Production/finance: WIP and finished-goods valuation. Completing production is not automatically COGS. |
| `valley_manufacture_header_products` | `unique_id`; `valley_manufacture_header_id` → order; product, quantity, `cost_unit`, `total_cost` | Verify semantics before treating every row as a separate finished-goods receipt: comments call these outputs, but their consumption costs aggregate to the header. |
| `valley_manufacture_footer` | `valley_manufacture_header_product_id` → output UID; runtime also supports legacy order-UID references; `item` → batch, `qty`, `cost_unit`, `total_cost` | Material consumption; resolve both FK paths without duplicate valuation or ambiguity. |
| `valley_manufacture_work_center` | Order FK; `recipe_id` used as work-center reference; `actual_hours`, `work_center_cost`, `total_cost` | Conversion costs; validate rates, normal capacity and payroll/utilities/depreciation overlaps. |
| `valley_manufacture_by_product` | Order FK; `item`, `qty`, `total_cost`, date | By-product allocation; a field named NRV does not establish valid valuation evidence. |
| `valley_product_recipe`, `valley_product_recipe_footer`, `valley_work_centers` | Planned materials/losses, sequence, hourly cost and capacity | Planning/allocation inputs; not independently posted expenses. |
| `valley_cash_bank_movement` | `transaction_id`, `invoice_id`, `transaction_date`, `transaction_amount`, `total_discount`, `net_amount`, `taxes`, `total`, `transaction_type`, `balance_amount`, `related_box`, `chart_code`, `approved` | Finance: settlements and candidate direct expenses/other income; determine recognition period and classification. |
| `valley_chart_of_accounts`, `valley_box_account_codes` | `chart_code` → `المستوى الخامس`; chart uses `المستوى الاساسي`, `كود المستوى`, `اسم الحساب الرئيسي` | Explicit account mapping. Profile actual rows; numeric ranges alone do not establish accounting class. |
| `valley_products`, `valley_categories`, `valley_legal_customer_vendor` | Product ID/type/category, `asset_code`, `income_code`, unit; party ID | Dimensions and validated account defaults. Product types include services and capital assets. |
| `valley_emp_salaries` | Employee, section/type, month/year, earnings components, `loans_value_deductions`, `net_salary` | HR prepares; finance recognizes earned payroll and allocates it. Net pay is not employment cost; loan deductions settle an asset. |
| `valley_product_technical`, `valley_work_center_assets` | Purchase/value, depreciation method, residual value, useful life/hours, asset/work-center links | Depreciation inputs; need in-service date, period charges and accumulated-depreciation reconciliation. |

Source anchors in [Company_ValleyFoods_HR_Modules.js](D:/Work/Script/Company_ValleyFoods_HR_Modules.js): finance 2684; purchasing 3161; manufacturing 4181; cash 6336; warehouse 6730; sales 7120; allocation 7664; return writer 8193. Resolve function names if line numbers move.

## 3. Findings affecting profit

| Priority | Observed behavior | New-report requirement |
| --- | --- | --- |
| Critical | `getValleySalesReport_` uses VAT-inclusive `إجمالي`, calculates `net = sales - returns`, groups all returns under invoices before filtering invoice dates, and does not restrict totals by approval. | Dedicated net-revenue calculation with recognition evidence and independently dated returns. October returns must not silently rewrite September. |
| Critical | `getValleyCashExpenseReport_` sums `total` or amount − discount + taxes for main-level-3 accounts without direction/approval filters. Other-income report selects `Debit` and numeric range 411102–421201. | Explicit signed event/account mapping, tax and accrual treatment. Preserve operational report contracts; do not use their totals as accounting facts. |
| Critical | Stock is dynamic and sale allocations lack immutable cost. | Verified opening layers and historical cost events; today's cost cannot silently replace historical COGS. |
| High | Warehouse has direction but no reliable accounting-purpose field; writer blanks `asset_target`. | Companion classification keyed to movement UID, separating maintenance, production, samples, spoilage, transfers and capex. |
| High | Manufacturing by-product formula applies a percentage with a 25% threshold/halving branch; negative batch cost has a fallback. Output unit cost sums input unit costs. Header formula does not explicitly deduct `abnormal_amount`. | Validate rational allocation and actual NRV. Summed input prices are not automatically output cost/unit. Establish meaning/unit of abnormal amount; flag unsupported results. |
| High | Production hourly rates may overlap cash-paid labor, utilities and depreciation. | Reconcile actual pools to absorption, period expenses and variance; recognize every economic cost once. |
| High | Reviewed paths do not establish a full journal, close lock, opening valuation, accrual, ECL or income-tax process. | Check for an external ledger, otherwise add minimum controlled schedules/subledger. |

Evidence: [sales report](D:/Work/Script/Company_ValleyFoods_HR_Modules.js:7823), [cash expenses](D:/Work/Script/Company_ValleyFoods_HR_Modules.js:6107), [manufacturing formulas](D:/Work/Script/Company_ValleyFoods_HR_Modules.js:4369), [current stock](D:/Work/Script/Company_ValleyFoods_HR_Modules.js:7223), [warehouse writer](D:/Work/Script/Company_ValleyFoods_HR_Modules.js:7053).

## 4. IFRS policies to support

**Revenue:** recognize contractual performance obligations when control transfers; approval or cash receipt is insufficient. Capture delivery/acceptance, partial deliveries, advances, rebates and expected returns. For already-provisioned returns, use the refund liability/recovery asset before changes in estimates, avoiding double reduction of revenue/COGS. Exclude tax collected on behalf of authorities. [IFRS 15](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/).

**Inventory:** lower of cost and NRV; specific identification where appropriate or consistent FIFO/weighted average for interchangeable stock. Eligible acquisition/conversion costs flow into inventory, then expense with related sales or other recognition events. Losses/write-downs arise in the period they occur. Expiry dates support, but do not replace, NRV assessment. [IAS 2 overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/).

**Manufacturing:** absorb fixed production overhead using normal capacity; unallocated overhead/abnormal waste are period expenses. Exclude selling costs and non-contributing administration/storage costs. Allocate joint costs rationally and consistently; immaterial by-products may use NRV deducted from main-product cost. Percentage-based values need supporting evidence. [IAS 2 paragraphs 12–16](https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ias-2-inventories.pdf).

**Payroll/assets:** recognize benefits as earned, with eligible production amounts assigned to inventory. Loan recoveries are separate settlements. Capitalize qualifying machinery and depreciate from availability for use over useful life. Reconcile production depreciation already included in absorption. [IAS 19](https://www.ifrs.org/issued-standards/list-of-standards/ias-19-employee-benefits/), [IAS 16](https://www.ifrs.org/issued-standards/list-of-standards/ias-16-property-plant-and-equipment/).

**Other close items:** assess receivable expected credit losses, leases, foreign-currency measurement and income tax. Confirm functional currency from the economic environment. Purchasing `Income Tax` may be a prepayment/withholding; current/deferred-tax assessment is needed. Do not hardcode local tax rates. [IFRS 9](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/), [IFRS 16](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-16-leases/), [IAS 21](https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/), [IAS 12](https://www.ifrs.org/issued-standards/list-of-standards/ias-12-income-taxes/).

**Agriculture scope:** purchased harvested crops used in processing generally enter inventory accounting. If Valley Foods manages biological transformation or harvests its own crops, assess IAS 41 and measurement at harvest before subsequent IAS 2 processing. Do not infer biological assets from the company name. [IAS 41](https://www.ifrs.org/issued-standards/list-of-standards/ias-41-agriculture/).

## 5. Income statement to build

Title: **Valley Foods — Statement of profit or loss / قائمة الدخل**. Show entity, basis, currency, period/comparison dates, generation time and draft/final status. Amounts are unavailable in this source-only assessment.

Use expenses by function and retain nature dimensions for supporting disclosures. Display expenses in parentheses; journal debit/credit signs are separate from display signs.

| Line | Calculation/source | Current period | Prior-year same period |
| --- | --- | --- | --- |
| Recognized sales before separately recorded reductions | Posted VAT-exclusive sales; no repeat deduction of discounts already in net amounts | Pending data | Pending data |
| Returns/rebates/revenue adjustments | Recognition events/provision changes, without double reversal | Pending data | Pending data |
| **Net revenue** | Sum of revenue lines | Pending data | Pending data |
| COGS | Issued carrying cost less supported original-cost return recovery | Pending data | Pending data |
| Production/inventory charges | Unabsorbed overhead, abnormal production loss, NRV charges/reversals; exclude amounts already in COGS | Pending data | Pending data |
| **Gross profit** | Net revenue less total cost of sales | Pending data | Pending data |
| Other operating income | Mapped recognized income excluding settlements | Pending data | Pending data |
| Selling/distribution expenses | Accrued expenses by function | Pending data | Pending data |
| Administrative expenses | Accrued expenses by function | Pending data | Pending data |
| Receivable impairment/other operating charges | Approved schedules, disaggregating material items | Pending data | Pending data |
| **Operating profit** | Operating income less operating expenses | Pending data | Pending data |
| Investing income/(expenses) | Applicable mapped items | Pending data | Pending data |
| **Profit before financing and income taxes** | Operating plus investing result; IFRS 18 subtotal when applicable | Pending data | Pending data |
| Financing income/(expenses) | Applicable financing items | Pending data | Pending data |
| **Profit before income tax** | Pre-financing subtotal plus financing result | Pending data | Pending data |
| Income tax expense/(credit) | Current/deferred tax attributable to P&L | Pending data | Pending data |
| **Profit from continuing operations** | Profit before tax less tax | Pending data | Pending data |
| Discontinued operations, net of tax | If applicable, otherwise reviewed/not applicable | Pending data | Pending data |
| **Profit for the period** | Continuing plus discontinued operations | Pending data | Pending data |

Placing production/inventory charges in cost of sales is a proposed consistent policy. IFRS 18 categories include operating, investing, financing, income tax and discontinued operations. Interest/FX classification depends on underlying items and main business activity; finance-related labels do not automatically belong below operating profit. [IFRS 18 key terms](https://www.ifrs.org/supporting-implementation/supporting-materials-by-ifrs-standards/ifrs-18/key-terms/).

Use comparable dates for monthly/YTD views. Product/customer filters produce contribution information unless documented allocation supports a complete segment P&L; shared costs must not vanish. OCI is outside profit or loss and requires separate comprehensive-income presentation where applicable. Assess EPS/attribution requirements if relevant to the entity.

## 6. Accounting design

### Authoritative ledger and additive tables

First establish whether finance has an authoritative general ledger/trial balance. If yes, use it for final totals and operational data for reconciliation. Do not repost transactions already covered by that ledger. Otherwise build balanced postings from validated events and approved schedules. Include ledger basis in report metadata.

These are **proposed companion tables**, not existing tables. Prepare local definitions and dry-run migrations; this study creates no live tables. Preserve existing headers, including `movmenent_sign`, `Code` and `Reciept Date`.

| Proposed table | Minimum contract |
| --- | --- |
| `valley_accounting_policies` | Company, version/effective dates, framework, fiscal year, currencies, costing, rounding, tolerances/materiality and approval. |
| `valley_finance_account_map` | Company/account/effective period; BS/P&L class, statement line, nature/function, IFRS 18 category, tax/capitalization treatment; reject overlapping maps. |
| `valley_accounting_source_events` | Company + source table + UID + event type + source version/hash; recognition date, amount/currency/rate, delivery/expense-period evidence, economic-event link, classification/approval/posting status. Enrich warehouse purpose/cut-off here. |
| `valley_inventory_cost_events` | Event/company/source/line/allocation/batch IDs, product/UOM, date, signed quantity/value, precise unit cost, method/components, original-event link, version/evidence. Include opening layers and zero-quantity cost adjustments. |
| `valley_accounting_journals` | Journal/company/period/event-idempotency key; draft/validated/posted/reversed state; expected line count/hash, preparer/approver/times, reversal link. |
| `valley_accounting_journal_lines` | Journal/line IDs, account, functional-currency debit or credit, original currency/rate, nature/function/cost center/product, source links; include BS counterparts. |
| `valley_finance_close_schedules` | Period and typed accrual/prepayment/payroll/depreciation/NRV/ECL/FX/tax/lease/return-provision/overhead schedule; opening/movement/closing amounts and journal evidence. Validate typed detail payloads. |
| `valley_finance_periods` | Boundaries, open/closing/closed state, policy/map versions, input manifest/hash, reconciliations, reviewer, frozen report version, reopening history. |

Qualify IDs by company and table; preserve leading zeros and distinct UID fields. Resolve polymorphic batch references explicitly. Missing tables, unknown IDs, formula errors, invalid dates/numbers and absent costs must produce diagnostics, never empty successful totals.

### Posting and duplication controls

| Event | Illustrative debit | Illustrative credit |
| --- | --- | --- |
| Delivered sale | Receivable including VAT | Net revenue and VAT payable separately |
| Sold stock | COGS | Inventory carrying value |
| Return without prior provision | Revenue reduction and relevant VAT reversal | Receivable/refund payable; separately debit recoverable inventory and credit COGS |
| Customer collection | Cash/bank | Receivable; no new revenue |
| Receipt/supplier invoice | Inventory/qualifying asset/expense and recoverable tax, as appropriate | Payable/GRNI; resolve timing differences |
| Supplier payment | Payable | Cash/bank; no second expense |
| Production | WIP then finished goods/by-products | Materials/conversion clearing then WIP |
| Expense accrual | Expense or eligible production pool | Accrued payable; payment clears it |
| Bank transfer/staff loan recovery | Destination bank / bank or payroll payable | Source bank / staff loan receivable; normally no P&L |

Provisioned returns use existing refund liabilities/recovery assets before estimate changes. These are account roles, not invented live codes.

The cash writer makes `Credit`/`Credit Note` negative in `balance_amount` and other types positive. This is cash direction, not a universal P&L sign. Verify classifications/reversals against actual samples.

Use idempotent event/version keys. Repeat events are no-ops; changed posted evidence requires reversal/replacement or explicit adjustment. Posted lines are immutable. Sheets lacks multi-table ACID transactions: write complete draft batches, validate balance/count/hash, then mark posted as the visibility boundary. Readers include only complete posted batches. Test interrupted writes, retries, locks, audits, mutation/cache invalidation and source drift.

### Valuation and close

Build history from verified opening layers and dated events. Current stock is a reconciliation target; preserve operational stock authority and never subtract feeding movements twice.

Inventory bridge: opening inventory + acquisitions + eligible conversion + return recoveries − sales issues − other disposals − write-downs + permitted reversals = closing inventory. Eliminate internal raw-material/WIP/finished-goods transfers from company totals; reconcile classes and quantities/UOM separately.

Actual payroll/overhead pools must reconcile to capitalization, COGS release, idle expense, variances and remaining inventory. Late landed-cost changes need supported allocation between remaining/issued stock. Distinguish estimate changes from prior-period errors before changing comparatives; never silently replace closed costs.

Finalization requires balanced journals/trial balance, full account coverage, revenue/line/header/VAT agreement, original-cost return traceability, inventory/COGS/WIP bridges, cash/AR/AP reconciliation, applicable schedules and reviewed cut-off exceptions. Drafts are not automatically recognized, but delivered uninvoiced sales and incurred unpaid expenses require supported accruals.

## 7. Sequential implementation plan for Luna 5.6

This request delivers assessment/planning. The companion prompt is for a later implementation run; no application or production posting changes have been made here.

| Phase | Local deliverable | Acceptance gate |
| --- | --- | --- |
| 0. Evidence/baseline | Instructions/Git/source review, schemas/joins/formula dependencies, ledger choice, sanitized fixtures, read-only profiling contracts | Distinguish code-verified, data-verified, missing and not-applicable evidence; preserve existing edits. |
| 1. Foundation | Additive policies/maps/events/journals/period definitions, validators, dry-run migrations | Invalid/duplicate mappings/IDs and unbalanced journals rejected; missing configuration blocks finalization; legacy schemas intact. |
| 2. Source adapters | Pure sales, independently dated returns, receipts, cash and warehouse adapters; authoritative-ledger import path where available | Correct VAT, recognition states, cash signs, exact FKs, header/line controls and no duplicated economic events. |
| 3. Costing/production | Opening layers, original-cost returns, history, normal-capacity pools, WIP, by-products, NRV, late-cost adjustments | Quantity/value bridges balance; missing costs prevent complete gross profit; history gaps explicit; stock formulas unchanged. |
| 4. Close/posting | Journals, typed schedules/imports, retry recovery, approvals/locks, snapshots, source drift checks | No duplicate posting; incomplete batches invisible; closed reports reproducible despite source edits/deletions. |
| 5. Report | Root `Company_ValleyFoods_FinancialReporting.js` and `Company_ValleyFoods_IncomeStatement.html`; actions/routes/navigation | Current/comparative/YTD, variances, detail, adjustments, diagnostics, existing print/download patterns; missing values distinct from zero. |
| 6. Verification/cutover pack | Targeted/full checks, profile checklist, migration dry run, reconciliations and rollback instructions | Local readiness distinct from live/controller validation; no live migration/deployment in local implementation. |

Suggested actions: `get_valley_income_statement`, `get_valley_income_statement_detail`, `get_valley_finance_diagnostics`; separately authorized mapping/adjustment/post/close actions. Suggested page `vf_income_statement`. Register through existing ValleyFoods dispatch, page-access/table maps and registry; add to finance navigation. Separate close authority can use the current permission-only pattern.

Enforce server-side company, report and cost authority across totals/detail/cache/downloads. Inspect `vfCanViewCost_` and its legacy fallback before defining the new finance gate. Denied cost must not leak through profit arithmetic. Aggregated payroll allocation must not expose employee salary detail. Prepare required `ERP_Pages_Matrix` grants without broad default role access.

Current `02_StorageConfig.js` routes company data to Sheets, independently of system/control-plane storage. Inspect it, `02_DataAccess.js` and `02_SystemStore.js`; Firestore files do not prove Valley Foods finance is hosted there. Keep deployable files at root under actual `.clasp.json` rules and update explicit preview/test source lists.

Read required tables once per stable snapshot, use bounded lookup indexes, and aggregate complete data before paginating detail. Dates must use confirmed timezone, strict bounded business dates (`YYYY-MM-DD`), inclusive end dates and comparable fiscal periods. Reject invalid ranges instead of treating them as unbounded. Preserve precise quantities/unit costs and one documented currency rounding rule at posting boundaries. Distinguish zero, unavailable, excluded and not applicable.

## 8. Financial acceptance fixtures

Synthetic examples only, not company results. Tests must call actual implementation functions with stubbed services.

1. VAT/matching: buy 100 units at 10; sell 30 at 20 plus 14% VAT; return 5 saleable units in the same period with no prior return provision. Revenue 500, sales/return VAT payable 70, COGS 250, gross profit 250, closing inventory 75 units / 750. Original invoice total 684 is not revenue. Collection has no profit effect.
2. Cross-period return: September sale and October return, without a prior provision in this fixture. September revenue 600 / COGS 300; October revenue adjustment −100 / COGS adjustment −50. Find October returns even when invoices are outside the period. Separately test provisioned returns to prevent double deduction.
3. Inventory/cash: purchase inventory 1,000 and pay supplier 1,000 with no sale: zero P&L. Recoverable VAT stays outside cost; qualifying machinery is classified separately.
4. Payroll: gross earned 100, staff-loan recovery 10, net payment 90 gives employment cost 100 and loan-asset reduction 10. Allocate 100 by valid function; payment adds no expense.
5. Capacity/by-product: materials 1,000 + labor 200 + variable overhead 100 + actual fixed overhead 300. Normal capacity 100 hours; actual production 50 hours: fixed absorption 150, idle expense 150. Supported immaterial by-product NRV 50; 100 main units: main cost 1,400 / 14 each, by-product inventory 50. Total 1,600 = inventory 1,450 + idle expense 150 before sales. By-product recognition creates no automatic revenue.
6. NRV: 10 units at cost 12 and NRV 9 give write-down 30. Later NRV 11 supports reversal 20, never exceeding the original write-down.
7. Accrual/prepayment: unpaid period electricity 80 creates expense/accrual 80 (or eligible production pool); prepaid 120 for three equal months releases 40/month. Settlement adds no second expense.
8. Evidence/retries: orphan allocation, unknown account, missing cost, formula error, partial read, duplicate UID, invalid date or unsupported currency prevents finalization. Drift aborts/retries safely; unchanged posting cannot duplicate; closed reports remain reproducible.
9. Access/scale: wrong company/missing report or cost grants deny totals/detail/export. Full totals survive pagination; Arabic keys and leading-zero IDs survive joins. Payroll detail cannot leak through audit/drill-through.
10. Return FK/cost history: return-stock `product_unique_id` resolves through original allocation to batch. Today's cost change does not alter frozen original-cost recovery. Damaged returns are tested separately from saleable recovery.

Relevant existing tests under `tools/verify/`: `s1_save_cost.js`, `s5_cost_strip.js`, `s12_warehouse_movement.js`, `s21_shifts_and_expenses.js`, `s25_stock_authority.js`, `vf_daterange.js`. Add financial coverage without weakening operational report expectations. Run `node tools/verify/run_all.js` and `node tools/ui_check.js` at implementation baseline and final integration; record actual failures.

## 9. Inputs for actual results and close

Finance: period/fiscal calendar, framework/currency, authoritative trial balance if available, actual chart rows/mappings, opening inventory/WIP layers/balances, delivery cut-off and expected-return evidence, accrual/prepayment/payroll/asset/tax schedules and cost policy.

Warehouse: count reconciliations, UOM conversions, movement purposes, goods-in-transit/consignment ownership and return-condition evidence. Production: completion/WIP status, materials/hours, normal capacity, normal/abnormal losses and by-product valuation.

Complete configurable local logic and fixtures while data remains pending. Material unresolved policies/evidence prevent a finalized statement. Maintain `VALLEYFOODS_IFRS_INCOME_STATEMENT_RESULTS.md` during implementation with phase status, decisions, actual test outcomes and pending live reconciliation.

