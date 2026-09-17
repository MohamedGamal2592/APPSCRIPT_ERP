# Valley Foods integration/consolidation results

Updated: 12 September 2026

## Authoritative target and baseline

- Target: `D:\Work\Script` (the user's Apps Script push/test folder).
- Starting branch: `feat/sales-and-saves`.
- Existing main-folder changes were preserved; no reset, stash, clean, production push, live migration, or live database write was performed.
- Scoped backup and SHA-256 manifest: `D:\Work\Script\.codex\valleyfoods_income_statement_integration_backup_20260912\MANIFEST.tsv`.
- Source feature reference: `C:\Users\Mohamed Gamal\.codex\worktrees\bb2e\Script`, commit `b10661c`. The feature source was imported as a delta only.

## Imported and consolidated files

- Added `Company_ValleyFoods_IncomeStatement.html` as an independent page.
- Added the financial acceptance verifier at `tools\verify\vf_financial_reporting.js`; it reads the production financial IIFE from the consolidated Actions file.
- Merged the complete Valley Foods HR IIFE and financial-reporting IIFE into `Company_ValleyFoods_Actions.js`, preserving their separate scopes.
- Added the income-statement route to `Company_ValleyFoods_Registry.js`, the Valley Foods menu in `Company_ValleyFoods_Nav.html`, PAGE_ACCESS/ACTION_TABLES, and the explicit action registrations.
- Removed `Company_ValleyFoods_HR_Modules.js` and the temporary root `Company_ValleyFoods_FinancialReporting.js` after verification. Recovery copies remain only in the scoped `.codex` backup.
- Updated `.clasp.json`: `Company_ValleyFoods_Actions.js` is the single Valley Foods backend entry; the retired HR module is no longer in `filePushOrder`.
- Updated affected verifier source loading and added the financial verifier to `tools\verify\run_all.js`.
- Refreshed the ignored/generated `design_preview\_sources.js`; UI C9 confirms it matches the shared source.

## Authority and accounting controls implemented

- Server-side account-map validation is authoritative for journal posting; client-supplied maps are not trusted.
- Company and period validation, effective account-map ranges, source-manifest requirement, idempotency, script-lock protection, immutable posted journals, persisted line count/hash verification, and draft invisibility are enforced.
- Closed periods require approved controller reconciliation evidence and retain a frozen report JSON for reproducible closed-period reads.
- Reports and detail views exclude draft/partial journal/source evidence from visible posted results.
- No production table is created or changed by the dry-run action; controller grants and live migration remain explicit follow-up work.

## Verification

- `node tools/verify/run_all.js` from `D:\Work\Script`: 76 of 77 checks passed. The only remaining failure is the existing RT5 shared-bundle budget ceiling: the shared UI bundle remains 199 KB after minification and the heaviest page remains 340 KB. This is unrelated to the income-statement integration.
- `node tools/ui_check.js`: 11 of 12 checks passed. C1/C2/C3/C4/C7/C8/C9/C10/C11/C12 passed; C5 reports existing orphan/legacy CSS classes, and the new income-statement classes are defined in its own page stylesheet.
- `node tools/verify/ui_smoke_pages.js`: passed; 103 pages boot, with only the three known pre-existing failures.
- `node tools/verify/vf_financial_reporting.js`: passed; 10 acceptance groups.
- `node --check Company_ValleyFoods_Actions.js` and `node --check Company_ValleyFoods_Registry.js`: passed.
- Targeted affected verifiers, including RT2/RT3/RT8, S12, S16b, S25 and S5c: passed.

## Push/deployment boundary

The files are now physically in `D:\Work\Script`, but they are intentionally not committed or pushed by this work. The folder already contains unrelated user changes, so only the scoped files should be reviewed/staged before the user's normal commit and `clasp push` workflow. A live/test deployment still requires the controller's `vf_income_statement` page grant and the approved additive migration/account-map setup; without those, the page is correctly blocked by diagnostics and will not appear for a user without authorization.