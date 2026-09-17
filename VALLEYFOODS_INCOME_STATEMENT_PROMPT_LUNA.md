# Valley Foods income statement — execution prompt for Luna 5.6

Use this in a later implementation run with GPT-5.6 Luna selected. This document does not start a task or change the current model.

---

Act as the ERP engineer implementing a financial controller's specification. Build the Valley Foods income statement locally in `D:\Work\Script` using the complete plan at `D:\Work\Script\VALLEYFOODS_IFRS_INCOME_STATEMENT_PLAN.md`.

Read the entire plan, execute phases 0–6 sequentially, implement the local feature and meaningful financial tests, and maintain `D:\Work\Script\VALLEYFOODS_IFRS_INCOME_STATEMENT_RESULTS.md`. Do not stop after writing another plan. Do not spawn subagents.

Read applicable AGENTS.md, PROJECT_MAP.md, Git status and relevant diffs first. Preserve all existing tracked/untracked work. Finance logic currently resides mainly in Company_ValleyFoods_HR_Modules.js, action guards/table dispatch in Company_ValleyFoods_Actions.js, page definitions in Company_ValleyFoods_Registry.js and navigation in Company_ValleyFoods_Nav.html. Resolve current symbols rather than relying on historical line numbers.

Build a dedicated accrual-based reporting module and Arabic-compatible income statement page. Determine whether finance has an authoritative external ledger; if available, support controlled trial-balance import and reconciliation. Otherwise implement the balanced accounting subledger proposed in the plan. Distinguish operational records, recognized events and posted journals. Add validated policies, account maps, cost history, typed close schedules and period controls, with dry-run migrations and explicit missing-configuration diagnostics.

Verify and preserve these critical facts:

- Existing sales-report net totals include VAT and group returns by invoice date. Use net consideration and independently dated recognition events, with provision handling that prevents double reversal.
- Sales lines join invoice_unique_id; purchase lines join header Code through code. Do not substitute generic IDs.
- valley_sales_returns_stock.product_unique_id references the original sales allocation UID; resolve allocation to batch.
- valley_current_products is a live derived balance. Never write it, use it as every historical opening balance or subtract already-included movements again.
- Sales allocations lack persisted historical cost in the canonical schema. Establish justified opening layers and cost history. Missing cost must not become zero or today's cost without an explicit provisional limitation.
- Cash direction is not P&L classification. Collections, supplier payments, loans, transfers, capex and VAT must not become duplicated income/expense. Use earned/incurred periods.
- Manufacturing percentages, fallback formulas and summed input unit costs are not automatically IFRS valuation evidence. Support normal-capacity absorption, abnormal loss, WIP, NRV, by-products and reconciliation of payroll/utilities/depreciation to absorption.

Implement idempotent balanced journals with complete-batch validation, posting visibility, source versions, reversals and interrupted-write recovery. Posted lines are immutable. Closed reports retain policy/map/input versions and cannot silently change with operational edits. Material missing evidence prevents finalization, while a clearly incomplete diagnostic preview remains possible.

Preserve legacy schemas/header order/spelling, IDs, operational report contracts, stock authority, permissions, locks/audits/mutation/flush conventions and backend boundaries. Use additive companion tables; retain movmenent_sign, Code and Reciept Date. Company data currently routes to Sheets independently of control-plane Firestore; inspect adapters instead of assuming one backend.

Enforce company, report and cost authority server-side for totals/detail/downloads/caches. Avoid exposing employee salary detail through accounting drill-through. Register new root runtime files, route, actions and finance navigation through existing contracts, including explicit source-loading lists. Prepare necessary page-matrix grants without broad defaults.

Implement the statement layout and ten financial acceptance cases from the plan. Tests must execute actual production calculation/posting functions using offline fixtures: VAT, cross-period/provisioned returns, exact return FK, historical costs, normal capacity, payroll loans, accruals, NRV, retry/source drift, incomplete reads and permissions. Never fabricate company financial results. Retain precision and distinguish missing from zero.

Run node tools/verify/run_all.js and node tools/ui_check.js at baseline and final integration, checking generated-file effects first. Run targeted tests during implementation. Record failures accurately and never weaken checks to obtain a pass; pre-existing working-tree failures are not automatically feature regressions.

Proceed with authorized local source, fixtures, documentation and dry-run migration tooling. Live data writes, actual migration execution, production deployment and remote pushes are outside this local run. Accounting policies need controller evidence before finalization. Complete all independent local work when live data is unavailable, keep material policies configurable/unapproved, and identify precise remaining dependencies.

Finish with implemented behavior, phase status, actual verification outcomes, changed files, unresolved accounting/data limitations and the concrete migration/reconciliation/rollback package. Distinguish local readiness, live validation and finalized accounts.
