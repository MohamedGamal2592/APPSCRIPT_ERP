# Valley Foods existing-table income statement — local implementation results

Implemented 13 September 2026 directly in `D:\Work\Script` under the replacement execution prompt and plan.

## Files changed in this execution

- `Company_ValleyFoods_Actions.js`: replaced only the consolidated financial-reporting IIFE; removed this feature's obsolete action/access/table entries; added a small export of the existing scoped cost-authority helper. Other business IIFEs and operational writers remain in place.
- `Company_ValleyFoods_IncomeStatement.html`: replaced the independent RTL report page with date/comparison filters, signed summary amounts, actual chart hierarchy, source drill-through for either period, detail pagination, refresh, and print. Printing refreshes the authenticated report before rendering.
- `VALLEYFOODS_EXISTING_TABLES_INCOME_STATEMENT_RESULTS.md`: this implementation record.

Existing `vf_income_statement` registration in `Company_ValleyFoods_Registry.js` and its finance-menu entry in `Company_ValleyFoods_Nav.html` were inspected and retained without edits in this execution. The page remains independent. Backend business functions remain in `Company_ValleyFoods_Actions.js`; no separate reporting backend was introduced.

## Removed dependencies and actions

The report no longer references or requires `valley_accounting_policies`, `valley_finance_account_map`, `valley_accounting_source_events`, `valley_inventory_cost_events`, `valley_accounting_journals`, `valley_accounting_journal_lines`, `valley_finance_close_schedules`, or `valley_finance_periods`.

Removed the report's policy/map saves, journal posting, migration preview, period close, associated diagnostics/setup gates, dispatch bridges, and access/table metadata. Only `get_valley_income_statement` and `get_valley_income_statement_detail` remain. Both use `valley_chart_of_accounts` as their action-table metadata, and derived page-table metadata therefore contains no companion tables. This was source cleanup; no tables were created or dropped.

## Source evidence actually inspected

Read the full execution prompt and replacement plan, existing report/UI/Registry/Nav, the router and company/page authorization paths, scoped cost permission, storage configuration, and record readers. Inspected the local AppSheet export's chart schema and original purchase/current-stock cost formulas, plus sales, invoice, return, return-stock, allocation, manufactured-output, by-product and warehouse field definitions in the source/export.

The runtime reader discovers existing tabs with spreadsheet metadata, validates physical header names and duplicate headers, and calls `getReadOnlyRecords_` once for each usable selected source. Current and comparison periods share the same request-local snapshot and account/batch indexes. Missing tabs are not created. Missing sources or invalid keys appear as coverage/completeness gaps, not setup instructions.

Sources selected when authorized: chart, products, sales invoices/lines, returns, sale/return allocations, current products, purchase lines/headers, manufacturing headers/by-products, manufacturing consumption (links only), cash movements, and warehouse movements. Cost-restricted callers do not read cost-bearing sources. No consolidated movement table, transfer-helper feed, payroll, technical-asset, or proposed accounting table is required. Manufacturing consumption is used to avoid duplicate expense recognition, never added as another expense stream.

## Calculation decisions

- Chart joins use `المستوى الخامس`, never the display-label field. The actual five-level code/name path is aggregated once per included leaf event. Identical duplicate account definitions collapse with a visible count; conflicting definitions remain unresolved. Meaningful leading zeros are preserved. Natural debit/credit display is separate from signed P&L contribution. Class labels supply classification; only the source-established top-level expense code 3 is recognized numerically. No leaf codes or ranges were invented.
- Sales use line `product_net_value`, with an explicitly attributed quantity-times-price fallback, and reconcile to invoice `المبلغ الصافي`. Header totals are never added to lines. All recorded invoice statuses, including false/unapproved and legacy blanks, are included and disclosed. Invalid dates/keys and unmatched lines remain visible.
- Returns are selected independently by `valley_return_date`, including returns of older invoices. Stored `valley_return_value` is reversed once and reconciled to original line quantity/price. Unclassified sales/returns retain their amounts and source account references.
- COGS follows sale allocation to batch. Original purchased `unit_cost` takes precedence, with valid `total_cost / qty` fallback; manufacturing uses `total_batch_cost / actual_qty`; by-products use `total_cost / qty`. A positive current-products cost can be a disclosed fallback; its legacy formula ends in zero on lookup failure, so a bare current-view zero is not evidence. Original zero costs require underlying zero-total/quantity evidence. Cost-source discrepancies remain in drill-through. Remaining stock quantity is never a denominator.
- Return cost follows return row → return-stock row → original sale-allocation UID → batch. Quantity reconciliation includes cumulative restoration against the original allocation, product/link checks, duplicate identifiers, and orphan allocations. Missing costs remain unavailable. Calculated COGS has no fabricated expense-account code.
- Account-coded purchases exclude balance-sheet purchases and batches linked to manufacturing consumption or sale allocations. Direct expense inclusion is conservative: a resolved expense account, existing service-purpose header, usable allocation/consumption coverage, and no identified production overlap. Unproven purpose is unresolved. Stored purchase cost includes the existing exchange-rate calculation; tax allocation/recoverability gaps are disclosed.
- Ordinary cash Debit/Credit produces positive/negative counterpart P&L contribution using net components. Note types are unresolved. Balance-sheet settlements and structured transfers are excluded. Confirmed settlements use identifier, party, direction, amount and account evidence; incomplete links, product-income accounts, party overlap and production/payroll expense risk remain unresolved instead of being counted twice. Refund signs are preserved. Taxes are separated without inventing recoverability.
- Warehouse amount is never multiplied by its signed quantity or automatically treated as COGS. Unproven warehouse expense purposes are unresolved. Net payroll, manufacturing inputs, overhead and depreciation are not separately expensed above batch COGS.
- Available component totals survive missing sources. Completely unavailable amounts are not shown as zero. Gross result and total result have no numeric value when their components are incomplete. Comparisons cannot overwrite the current period's availability. Hierarchy numbers are clearly labeled included-activity totals, not posted trial-balance balances.

## Authority and persistence boundary

Summary and detail enforce the fixed company, authenticated page grant, matching configured company database and the existing scoped cost policy. Print re-fetches the same authorized summary. Denied cost access suppresses COGS, other cost-bearing activity, gross/total results, cost hierarchy and cost details. No payroll records or personnel fields are returned. The existing write/full cost grant and legacy unused-grant behavior are preserved, not replaced with a weaker read grant.

Business reads use `getSpreadsheet_`/metadata, `getHeaders_`, and `getReadOnlyRecords_`; these paths were inspected. The replacement contains no ensure/create, record mutation, formula mutation, journal, snapshot/cache persistence, or migration calls.

**End-to-end zero persisted writes is not claimed.** `apiRouter_` authenticates, calls `SessionManager_.touch` (which may patch `ERP_Sessions.last_activity`), invokes `logSystemAction_` (which may persist a read log depending on existing configuration), and records performance. Existing authority/company-resolution helpers also cache metadata. These controls were left intact. The report route was not exercised live during this implementation.

## Verification actually performed

- Source inspection of joins, signed calculations, missing-value propagation, permission projections, registrations and the full relevant read-helper/router paths.
- `node --check Company_ValleyFoods_Actions.js`: passed after final backend edits.
- Syntax-only extraction/parsing of the independent page's two inline scripts after replacing Apps Script template expressions with inert parsing placeholders: passed. No report functions were executed by this check, and temporary extraction files were removed.
- Source search of active application JS/HTML found no remaining eight-table dependencies or removed finance action references. Registry/Nav still point to the independent page.
- **No unit tests, fixtures, dummy business data, benchmarks, automated suites, `tools/verify`, `run_all.js`, or `ui_check.js` were created, changed or run by this execution.** Existing unrelated local changes were retained.

## Pending limitations

No live chart rows, balances or company records were read in this execution. The earlier handoff's Google content-access denial (`403 appNotAuthorizedToFile`) was not retried or bypassed; it is prior evidence, not a new live verification. Real account classes, chart parent/leaf reconciliation, a sale/header, return-allocation chain, expense/refund, purchase/settlement pair, empty periods, UI behavior and print layout still require an authorized manual review after the local code is available in the runtime. No live profits or deployment are claimed.

Existing mutable costs cannot establish immutable historical valuation. Recorded invoice dates do not prove delivery cut-off; return condition, accrual completeness, tax recoverability and functional-currency compatibility remain unverified. Ambiguous amounts are explicitly limited rather than estimated. This is an existing-record activity statement, not a claim of full IFRS compliance or finalized net profit.

No company data, physical schema, spreadsheet formulas, credentials, service configuration, target project settings or permission records were changed. No reset/stash/worktree, production push, deployment or migration was performed.
