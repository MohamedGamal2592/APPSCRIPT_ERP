# Luna 5.6 plan: integrate Valley Foods into the main project and consolidate functions

Prepared 12 September 2026.

## Required result

Make the implementation physically present and locally tested in **D:\Work\Script**, which is the user's authoritative Apps Script push/test folder. The existing worktree is an import source only. Then place all Valley Foods server-side business functions in **Company_ValleyFoods_Actions.js**, while retaining the independent **Company_ValleyFoods_IncomeStatement.html** page, its `vf_income_statement` route and finance-menu link.

This supersedes the earlier requirement for a separate financial-reporting JavaScript file and the earlier instruction treating D:\Work\Script as read-only. Page independence remains mandatory. Shared ERP infrastructure and browser scripts remain in their appropriate shared/HTML files. Keep Company_ValleyFoods_Registry.js as the small company registration/page metadata file, consistent with Top Light and Top Chemical; do not flatten UI templates or shared services into the action file.

## Verified starting evidence

- Source worktree: `C:\Users\Mohamed Gamal\.codex\worktrees\bb2e\Script`.
- Source feature commit observed: `b10661c feat(valley-foods): add independent IFRS income statement`, based on `c8ee729`. Recheck these values and newer changes before import.
- Worktree feature changes: `.clasp.json`, Company_ValleyFoods_Actions.js, Company_ValleyFoods_Registry.js, Company_ValleyFoods_Nav.html, new Company_ValleyFoods_FinancialReporting.js, new Company_ValleyFoods_IncomeStatement.html, `tools/verify/vf_financial_reporting.js`, and three income-statement handoff/result documents.
- The main folder has current Actions.js and HR_Modules.js plus extensive pre-existing uncommitted ERP changes. Its new income-statement HTML/backend are absent at planning time. The worktree was built from an older baseline; replacing whole main-project files with worktree versions risks losing existing work.
- Main Actions.js contains global reference-cache helpers, the ValleyFoods dispatch IIFE and ValleyFoodsHREmp IIFE. HR_Modules.js contains ValleyFoodsHRModules with HR, attendance and most finance/production logic. The new worktree module contains ValleyFoodsFinancialReporting and a registration bridge.
- Numerous main-project tests concatenate Actions.js and HR_Modules.js or enumerate both. `js_simplification_operational.js` asserts their prior loading order. These must be updated for the new physical layout while preserving their behavior checks.
- The source results record reports ten financial acceptance groups passing but says run_all.js and ui_check.js were absent in that worktree. Those are not integration passes. The main project has the full tools; run them there.

## Phase 0 — establish the authoritative baseline

1. Set every command's working directory explicitly to D:\Work\Script. If the task itself still has a worktree cwd, that must not determine the edit/output location. Do not create another worktree or switch the user to an old checkout.
2. Read applicable AGENTS.md, PROJECT_MAP.md, deployment configuration, main-project Git status/diffs and the income-statement plan. Inspect all affected files in both locations.
3. Create a small recoverable backup/manifest of only affected main-project files and hashes in a local excluded maintenance folder. Include untracked files being touched. Never copy secrets, credentials, node_modules, broad archives or unrelated modifications.
4. Run the main-folder baseline `node tools/verify/run_all.js` and `node tools/ui_check.js`; inspect generated-file side effects first. Record actual failures, exit codes and current source hashes in `D:\Work\Script\VALLEYFOODS_INTEGRATION_CONSOLIDATION_RESULTS.md`.
5. Extract the intended feature delta from the source commit plus any later in-scope changes. Do not wholesale cherry-pick, replace the working tree, reset, clean, stash, broadly stage or commit unrelated work.

## Phase 1 — integrate the feature into D:\Work\Script

1. Import the independent income-statement HTML, new financial logic and financial test as necessary new files. If a destination now exists, compare and merge rather than overwrite it.
2. Merge only new income-statement PAGE_ACCESS entries, table mappings, route/template definition and menu item into the current main files. Preserve current purchasing/sales report filters, HR, stock, performance, security and other company work.
3. Keep the main `.clasp.json` project ID and target settings. Inspect the source `.clasp.json` delta only for a demonstrably needed file-loading change; never replace configuration wholesale. No live push is authorized by this implementation plan.
4. Retain the original worktree results as historical evidence, distinguishing them from new main-folder verification. Do not replace current controller documents with older copies.
5. Verify the new route resolves to the independent HTML page and is not embedded in an existing report/dashboard. Confirm it uses current ERP authority, layout, loading/error, date, print and navigation conventions.

## Phase 2 — consolidate server-side Valley Foods code

Target one physical business implementation file: `D:\Work\Script\Company_ValleyFoods_Actions.js`.

Move in this dependency order:

1. Existing global reference-cache helpers.
2. Existing ValleyFoods dispatch/actions/permission/table-map IIFE.
3. Existing ValleyFoodsHREmp implementation.
4. Existing ValleyFoodsHRModules implementation from HR_Modules.js.
5. ValleyFoodsFinancialReporting implementation and financial registration bridge.

Preserve separate internal IIFE scopes and externally referenced namespace names. One physical file does not require one lexical scope. Do not concatenate private constants/functions into the same scope and create duplicate declarations. Preserve registration timing, action names, public exports and helper visibility; all implementations must register after ValleyFoods exists, exactly once. Avoid opportunistic formula/logic cleanup during the move.

Inventory any additional Valley-Foods-only backend functions outside these files. Move business-specific functions if required, retaining necessary globally routed wrapper names, but leave shared infrastructure with multiple-company callers in place. Record the exact scope of the single-file result.

After caller/loader updates and successful checks, remove the now-redundant root HR_Modules.js and FinancialReporting.js runtime files. Do not leave a second copy executing the same definitions, and do not keep dummy implementations solely to satisfy old tests. Preserve recovery copies outside the deployment set. Verify final deployable sources contain one definition of each Valley Foods namespace and registration bridge.

## Phase 3 — update loader, test and deployment wiring

Search references across current deployable files, `.clasp.json`, preview/build tools, gasstub/source loaders and tests. Update all source enumerations/concatenations to load the consolidated Actions.js once. In particular inspect:

- tools/build_preview.js and tools/ui_check.js;
- tools/verify/js_simplification_operational.js;
- tools/verify/rt2_record_replies.js, rt3_stamp_coverage.js, rt8_search_scope.js;
- s1_save_cost, s2_workops_cost, s5_cost_strip, s5c_sales_audit, s7_batch_modal, s12_warehouse_movement, s13_forms_filters, s16_attendance, s17_purchasing_save, s20_quiet_refresh, s21_shifts_and_expenses, s24_stock_scan, s25_stock_authority and vf_daterange;
- the imported vf_financial_reporting.js and run_all.js integration.

The list is evidence, not an exhaustive substitute for search. Replace obsolete split-file structure assertions with equivalent single-file loading/registration checks; preserve meaningful accounting and authorization assertions. Update PROJECT_MAP.md and stale module descriptions to show the final layout. Exclude recovery artifacts from deployment.

## Phase 4 — verify imported functionality, not just relocation

The source report is not proof that the feature meets every planned control. Inspect actual handler behavior and integration dependencies. Resolve concrete defects needed for a safe working feature; do not label helpers or stubs as finished workflows.

The observed postJournalAction_ validates against a caller-supplied account map, checks idempotency before sequential writes and flips state after appending lines. Verify and repair server-side authoritative mapping, tenant/period checks, lock placement, retry recovery, persisted count/hash verification, source-version checks and immutable-posted behavior. An interrupted draft must not be mistaken for successfully completed posting.

The observed closePeriodAction_ can persist state `closed` with `reconciliation_status: controller_pending`. Ensure final close cannot occur while required controller evidence remains pending, and that closed-period enforcement and reproducible snapshot retrieval actually exist. Report reads must not silently mutate accounting tables. Server authority must cover route, read/detail, write/post/close, cost masking and caches; verify grants against current ERP conventions.

Preserve the controller plan's VAT-exclusive revenue, independently dated returns, return-allocation FK, historical COGS, missing-value diagnostics, manufacturing/payroll double-count controls and no fabricated company figures. If required live data is unavailable, finish configurable local functionality and explicitly identify pending live evidence.

## Phase 5 — main-folder verification and handoff

Run from D:\Work\Script:

- node --check Company_ValleyFoods_Actions.js
- node --check Company_ValleyFoods_Registry.js
- node tools/verify/vf_financial_reporting.js
- node tools/verify/run_all.js
- node tools/ui_check.js
- the existing preview build command after source-list updates, checking actual exit status and generated-file effects.

Add focused differential/behavior tests for preserved HR, attendance, purchasing, sales/returns, manufacturing, cash/warehouse and financial dispatch contracts. Prove consolidated initialization without duplicate registrations, consistent cost permissions and the independent page's registered template/UI integration. Reuse existing coverage rather than duplicating implementation inside tests. Record baseline versus introduced failures; never suppress failures or reset UI baselines merely to pass.

Inspect `clasp status` if the installed CLI supports a read-only inventory. Otherwise verify the deployment configuration and exact local source list without invoking push. Confirm the independent HTML and consolidated Actions.js are included once, obsolete module files absent, and the existing Apps Script target preserved. Keep `.clasp.json` secrets/identifiers out of reports unless necessary.

Acceptance requires actual files in D:\Work\Script, not just worktree changes or a commit. Final report must state:

1. Exact output directory and consolidated file/new HTML path.
2. Imported feature changes and main-project work preserved.
3. Retired runtime files and updated loaders/tests.
4. Actual checks passed/failed, baseline failures and pending live/controller evidence.
5. Push/test readiness and exact remaining blockers; no claim of deployment.
6. Recovery instructions using only affected-file backups, without overwriting later user edits.

Execute locally without production push, live migrations or live database writes. The user's request authorizes applying the changes in the main folder and retiring redundant local module files after safe consolidation. Do not ask for repeated approval for these steps. Continue until local integration/consolidation and required verification are handled, or a specific dependency prevents progress.
