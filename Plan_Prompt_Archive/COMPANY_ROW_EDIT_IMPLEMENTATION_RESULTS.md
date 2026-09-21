# Company row-edit implementation results

Date started: 2026-09-15. Work directory: `D:/Work/Script`.

## Constraints in force

- No unit tests were created, modified or run (no `run_all.js`, `ui_check.js`, `npm run verify`, no ad hoc/VM/mocked behavioral tests). Fixture-writing, behavioral-testing and live-save verification steps from the analysis plan were intentionally not performed.
- No stored table data, schemas, attachments or deployments were changed. No save/add/update/delete action was invoked. No live application verification was performed.
- Verification is source inspection, call-path tracing, scoped diffs and syntax-only parsing.

## Baseline

- Repository root verified: `D:/Work/Script` (`git rev-parse --show-toplevel`).
- Initial working-tree status: 198 changed paths (modified, deleted-doc, untracked), all pre-existing user changes; preserved throughout. Runtime files under `Backup/`, `.codex/`, `src_html/`, `Plan_Prompt_Archive/`, `design_preview/` were not used as edit sources.

## Stage 0 — Scope and baseline

- 0.1/0.2/0.3 done: root verified, 198 pre-existing changed paths captured, tracker + results docs created, constraints recorded.
- 0.4 recheck (current source; analysis line numbers drifted, substance holds with noted deltas):
  - F1 confirmed: `Company_ValleyFoods_Overtime.html:121` Edit → `openAddModal({emp_id})`; `:439` wrapper ignores args; `:318/:373` Add-only modal/save (`add_overtime`); no `update_overtime` registered (`Company_ValleyFoods_Actions.js:2166` add-only, register `:10229`). `:143` unconditional row-click View; `UI_Components.html:267-279` items close the menu but do not stop propagation (second popup). Extra: `:143` uses positional `rows[i]`, stale after `initTableSort`.
  - F2 confirmed: deductions `:130/:161/:278` (`add_deduction`); vacations `:125/:202` + `:338` (`add_vacation`); manufacture `:116` → `openManufactureModal(code)`, `:368` (`add_legal_manufacture`); registration `:149` Edit → `viewPaper()` display-only (`:107/:146`).
  - F3 confirmed: `02_DataAccess.js:841-862` merges `getValues()` and whole-row `setValues()` — formula loss. Same-contract callers across companies; `saveRecordWithAudit_:1768` merges into this path.
  - F4 confirmed with delta: `updateStockRevision_` (`Company_TopChemical_Actions.js:1757-1807`) writes manual cells individually (no formula clobber) but never recomputes `difference`/`percentage` literals; has `_sheetRow` + `_expectedProduct` stale-row guard.
  - F5 confirmed with delta: `saveValleyMfgWorkOp_` (`:6976-7036`) finds `_oldWO` by `unique_id` but does not bind it to `mo_uid`; accepts caller `actual_hours` (`:7012`) though `actual_hours`/`work_center_cost`/`total_cost` are sheet formulas (`mfgWorkCenterFormulaMap_:5950`); ignores patch result. Client `MfgOrders.html:789` hard-codes `operation_status:'In Progress'`, `actual_hours:''`, `notes:''`.
  - F6/F7 confirmed: `saveValleyWorkCenter_:7144`, `saveValleyAssetTechnical_:7204`, `saveValleyWorkCenterAsset_:7261` — no super-admin check on update branches; `updateRowByCriteria_` result unchecked; gate `Code.js:782` covers `edit_|update_` prefixes only, not `save_` updates.
  - F8 confirmed: `buildSalesHeaderValues_` (`Company_TopLight_Actions.js:2037`) rebuilds from blanks (fresh `created_at`, known-formula reinstall only via `salesHeaderFormulaMap_:2067`); `editLegalCostingBundle_` (`Company_TopChemical_Actions.js:3747-3807`) deletes lines (`:3777`) before validating replacements (`:3782+`) and reads the audit before-image after mutation (`:3804`).
  - F9 confirmed: `DbLive_Connector.js:607-653` denylist is 3 columns (`id`,`created_at`,`updated_at`) + `_` prefix; all other columns accepted; `affected` returned unchecked by callers.
  - F10 confirmed: `Company_ValleyFoods_Contracts.html:146` dormant `openEditModal`, table has no Edit action; `:180` area saves via `add_contract`; handler `:1723` appends ignoring ID.
- 0.5 row-action map (repair targets; editor → payload → handler → gate → table/key → writer → refresh):
  - Overtime Edit → (to build) keyed editor → `update_overtime` (new) → super-admin → `valley_emp_overtime`/`unique_id` → formula-safe patch → keyed row replace + `loadData(true)` fallback.
  - Deductions/vacations/manufacture/registration Edits → same pattern with entity handlers (new).
  - Work-centers/assets/technical saves → existing dual handlers + edit-specific super-admin guard + checked patch.
  - Work-op manual edit → `save_valley_mfg_workop` (existing action) with parent binding, trusted hours/cost recompute, checked patch.
  - Stock revision → `updateStockRevision_` + literal recompute.
  - TL purchasing/sales/offer/cash edits → merge-over-existing builders preserving metadata/unknown/formula cells.
  - TC budget bundle → validate-all-lines-first + before-image capture.
  - DB editors → explicit allowlists + missing-vs-unchanged distinction.

## Stage 1 — Edit field ownership (source-derived)

Conventions: key = immutable selector; manual = user-editable inputs; calculated = sheet formulas / app-derived (read-only UI, rejected server-side); system = IDs/audit (preserved); attachment pair = reference + ID replaced together only after successful upload/binding. New correction actions enforce super-admin on UI and server.

- Overtime (`valley_emp_overtime`, key `unique_id`; add `Company_ValleyFoods_Actions.js:2166`, headers `:2138`): manual `emp_id,date,overtime_type,start/end_time|amount,details`, attachment pair; calculated `name_ar,overtime_hours,overtime_vacation_days,month,year` (VLOOKUP/role/COUNTIFS/MONTH/YEAR formulas); system `unique_id,user,created_at`. Duplicate check excludes own uid on update.
- Deductions (key `unique_id`; add `:1647`): manual `emp_id,deduction_type,date,number_of_days,penalty_value,details`, attachment pair; calculated `name_ar,penalty_type_days,abscence_type_days,delay_type_minutes,month,year`; system `unique_id,user,created_at`.
- Vacations (key `unique_id`, `id` literal preserved; add `:1980`): manual `emp_id,vacation_half_day,vacation_type,allocation_id,start/end_date,duration_days_other,amount_other,vacation_reason`, attachment pair; `duration_days` server-recomputed (working days excl. Fridays, 0.5 half-day); overlap check excludes own uid; cap check against remaining + own old duration; rollups recomputed for old and new allocations (`allocBalance_`, `writeAllocUsedDays_`, cf. delete `:2112`).
- Manufacture (`legal_manufacture`; add `Company_TopChemical_Actions.js:3834`): selector = original `transaction_code` (must match exactly one row; formula CONCATENATE, recomputed after edit); manual product/qty/batch/date/items 1–8/qtys/profit/attachments; calculated `transaction_code,code,dep_qty,net_qty,total_cost,sales_amount,sales_price` (formulaMap `:3848`); system `user` preserved as creator. No UID column exists; no schema change permitted, so row-count ambiguity refuses the edit.
- Registration (`registration_papers`; add `:1377`, list `:1341`): selector = original `document_number` (exactly one row or refuse); all stored fields manual literals; no formulas observed in the add path; attachment pair retained unless replaced. Adjacent finding (not in scope): `delete_registration_paper` has no server handler — the page button calls a nonexistent action.
- Work centers/assets/center-assets (keys `unique_id`; `:7144/:7204/:7261`): manual = current map fields; system `unique_id,id,code,created_at` preserved (absent from maps); `user` remains last-editor stamp (existing behavior kept). `depreciation_per_hour` accepted as manual Number — name suggests derivation but no derivation exists in source; kept editable, flagged unknown.
- Work ops (`MFG_WORKOPS_SHEET`, key `workop_uid` bound to parent `mo_uid`): manual `start_time,end_time,notes`; caller `operation_status/actual_hours/costs` ignored (status via `control_valley_mfg_workop_` only); derived cells reinstalled through the trusted `mfgWorkCenterFormulaMap_:5950`/`writeRowFormulas_` path.
- Stock revisions: manual `date,amount,warehouse,notes,available_amount`; literals `difference,percentage` recomputed via `stockRevisionDifference_/Percentage_`; identity `_sheetRow` + `_expectedProduct` precondition kept.
- TL documents: manual = header business fields + line business fields with preserved line identities; protected = `created_at,record_uid`, unknown/custom columns, formula cells (reinstall known maps only).
- TC budget bundle: manual = non-formula header fields (`formulaKeys` list) + validated lines; lines validated before any delete; before-images captured first.
- DB editors: allowlists derived from the driving UI forms (live-schema check still required — recorded, not guessed).
- Unknown ownership (conservative = protected/read-only): AppSheet virtual formulas, MySQL generated columns, `manufacture` downstream stock/document references pending source confirmation, array/spill ranges beyond single-cell formulas (patch helper skips any formula cell regardless of position).

## Stage 2 — Shared click handling and safe updates

- 2.1 done: `UI_Components.html` `actionDropdown` item onclick now leads with `try{event.stopPropagation();}catch(e){};` — covers `actionBtns` (delegates) and every page's row menus. Menu callbacks never relied on row bubbling.
- 2.2 pending per repaired page (Stages 3–4): each row-click listener gains an interactive-descendant guard (`button,a,input,select,textarea,.action-dropdown,.combo-list`) and key-based lookup (`data-uid` + find by `unique_id`) instead of positional `rows[i]`.
- 2.3/2.4 done: new `patchRowByCriteria_` in `02_DataAccess.js` (same match contract + Boolean result as `updateRowByCriteria_`): writes only update-named non-formula cells; formula cells preserved even when named; unmatched keys ignored; adjacent writables batched, gaps break runs; extra single-row `getFormulas()` read only on match. Trusted formula installs stay on the explicit `writeFormula_`/`writeRowFormulas_` path.
- 2.5 done (decision): 53 `updateRowByCriteria_` call sites across 5 action modules + `saveRecordWithAudit_` callers (Assessment, ValleyFoods) reviewed; central behavior change would alter out-of-scope editors, so no migration — opt-in per repaired path only.
- 2.6/2.7/2.8 applied per handler in Stages 3–5: pre-lock existence lookup, in-lock patch with Boolean check (missing → error, never success), creation-metadata exclusion from maps, audit before-images captured before mutation, `executeWithLock_` retained, update paths use throwing `getSheet_` (never `ensure*`).

## Stage 3 — Overtime repair (source evidence)

- Server `Company_ValleyFoods_Actions.js`: new `updateOvertime_` (after `addOvertime_`): `requireSuperAdmin_`, `unique_id` required, add-parity manual validation (role-gated amount/times), existence lookup by `unique_id` (missing → error), self-excluding normalized duplicate check (fraction-normalized times, day-normalized dates), attachment resolve-or-preserve via trusted binding, `patchRowByCriteria_` write with Boolean check, before-image audit (`update_…`), keyed response record. Registered in `PAGE_ACCESS` (`update_overtime` write), `ACTION_TABLES`, `ValleyFoods.register`, module export list.
- Client `Company_ValleyFoods_Overtime.html`: Edit menu → `openEditModal(uid)` (super-admin menu gate kept + in-function `canFull_` check; missing row → toast + quiet reload, never Add); explicit `_editingUid`/`_editingAtt` mode state; prefill via existing `buildModalFields` with `fmtDate` dates, fraction→`HH:mm` times, retained inactive employee/type options (money-ness inferred from stored amount when the type is gone); existing attachment shown with keep-hint, file input optional; `saveOvertime` branches to `update_overtime` with retained pair when no replacement; keyed row replace on success. Row clicks: interactive-descendant guard + `data-idx`→`pageRows`→`__uid`→`unique_id` lookup with build-order fallback.
- Adjacent finding (out of scope, not changed): `delete_overtime` has no server handler — the Delete button calls a nonexistent action.
- Static checks: `node --check` clean on `Company_ValleyFoods_Actions.js`, `02_DataAccess.js`, and extracted overtime scripts (template tags neutralized, parse-only).

## Stage 4 — Other misleading Edit controls (source evidence)

- 4.1 deductions: `updateDeduction_` (`Company_ValleyFoods_Actions.js`, after `addDeduction_`): super-admin, `unique_id` key, add-parity validation/column mapping, attachment resolve-or-preserve, `patchRowByCriteria_` + Boolean check, before-image audit, keyed record. Registered (PAGE_ACCESS/ACTION_TABLES/register/export). Client: Edit menu now `openEditModal(uid)` gated `IS_SUPER_ADMIN` (was `CAN_WRITE` opening Add prefill); full prefill incl. retained inactive employee/type; attachment keep-note; save branches to `update_deduction`; shared keyed `afterDedSave`. Missing group-date `+` button gains the `stopPropagation` its sibling already had. Adjacent Add finding (unchanged): the `penalty_value` form input is not read by `add_deduction_` (it stores `deduction_value_other` into the `penalty_value` column); update mirrors Add exactly.
- 4.2 vacations: `updateVacation_` (before `deleteVacation_`): super-admin, `unique_id` key, add-parity validation, server-side duration recompute, self-excluding overlap check, cap check crediting returned old days, dual-allocation rollup reconcile, attachment resolve-or-preserve, patch + check, audit, keyed record. Registered ×4. Client: `openEditModal(uid)` (`IS_SUPER_ADMIN`; missing → toast + reload), full prefill incl. checkbox/reason/allocation applied post-widget, retained inactive options, edit-aware client cap guard, save branches to `update_vacation`, existing keyed replace reused.
- 4.3 manufacture: `updateLegalManufacture_` (after `addLegalManufacture_`): super-admin, original-`transaction_code` selector with missing/ambiguous refusal, add-parity validation, explicit manual allowlist (7 calculated + identity/audit keys protected), retained-attachment merge + `attachmentIdsForFields_` binding, `patchRowByCriteria_` + check, audit, response carries recomputed code. Registered ×3. No downstream readers of `legal_manufacture` rows exist in source besides list/print/delete-by-code, so no additional stock/document gate was invented; client availability hints (`manfItemQtyCheck`) still run on save. Client: Edit → `openEditManufacture(code)` (`IS_SUPER_ADMIN`, was `CAN_WRITE` → broken Add); full prefill incl. 8 slots/profit/registration/retained options/attachment note; save merges retained pairs, sends `original_transaction_code`, replaces by original code (derived code may change). Adjacent (unchanged): `delete_legal_manufacture` has no server handler.
- 4.4 registration: `updateRegistrationPaper_` (after `addRegistrationPaper_`): super-admin, original-`document_number` selector with missing/ambiguous refusal + new-number collision check, add-parity validation/product check, retained-attachment merge + binding, literal patch + check, audit, keyed record. Registered ×3. Client: Edit → `openEditPaper(number)` (`IS_SUPER_ADMIN`, was `CAN_WRITE` → display-only `viewPaper`); full prefill incl. retained product/type options and ISO dates; save merges retained pair, sends `original_document_number`, replaces by original number. Adjacent (unchanged): `delete_registration_paper` has no server handler.
- 4.5 done: every new action registered in PAGE_ACCESS (`write`), ACTION_TABLES, module register, and module exports where such a list exists (VF); TC exposes dispatch only. All use existing `noteMutation_` (via patch helper) + page `Live.watchPage`, so realtime dependencies are unchanged.
- 4.6 contracts completed (no blocker): `updateContract_` — stable `unique_id` exists on rows and the schema is fixed by `ensureSheet_`; dormant modal finished (unique_id selector, `fmtDate` prefill, retained options) and an `IS_SUPER_ADMIN` Edit action column added to the previously action-less table; save branches `update_contract`/`add_contract` with existing keyed replace. Registered ×4.
- Static checks: `node --check` clean on both action modules and all six extracted page scripts (template tags neutralized, parse-only).

## Stage 5 — Calculations, identity and permissions (source evidence)

- 5.1 Stock revisions: `updateStockRevision_` (`Company_TopChemical_Actions.js:1757-1807`) recomputes `difference`/`percentage` literal values via `stockRevisionDifference_`/`stockRevisionPercentage_` when `amount` or `available_amount` changes during edit. No formula cells touched. Verified in source.
- 5.2 Work operations: `saveValleyMfgWorkOp_` edit path (client `Company_ValleyFoods_MfgOrders.html:793`) sends only `start_time`/`end_time`/`notes`; server computes `actual_hours` from times, reinstalls formulas via `writeRowFormulas_` (`mfgWorkCenterFormulaMap_:5950`). Parent `mo_uid` binding verified. Status changes only through `control_valley_mfg_workop_`.
- 5.3 Work centers/assets/center-assets: `saveValleyWorkCenter_` (`Company_ValleyFoods_Actions.js:7144`), `saveValleyAssetTechnical_` (`:7204`), `saveValleyWorkCenterAsset_` (`:7261`): edit branches now call `requireSuperAdmin_(user)` before write. Aligns with existing `IS_SUPER_ADMIN` UI gating.
- 5.4 Patch results checked in all row-edit handlers:
  - `updateOvertime_`, `updateDeduction_`, `updateVacation_`, `updateShift_`: `if (!patchRowByCriteria_(...)) throw`
  - `saveValleyWorkCenter_`, `saveValleyAssetTechnical_`, `saveValleyWorkCenterAsset_`: `if (!patchRowByCriteria_(...)) throw`
  - `saveValleyMfgWorkOp_` stop path: `if (!patchRowByCriteria_(...)) throw`
  - `saveValleyPlan_`: `if (!patchRowByCriteria_(...)) throw`
  - `editLegalCostingBundle_`: cell-by-cell write (not patch-based) — existence pre-checked
  - `editPurchasing_`/`editSales_`/`editCash_`: row-existence verified before write; formulas restored via `apply*Formulas_`
- 5.5 Nullable edit-to-add fallbacks removed:
  - `Company_ValleyFoods_Overtime.html`: `openEditModal` — missing row → toast + `loadData(true)`, never Add
  - `Company_ValleyFoods_Deductions.html`: `openEditModal` — same pattern
  - `Company_ValleyFoods_Vacations.html`: `openEditModal` — same pattern
  - `Company_ValleyFoods_Contracts.html`: `openEditModal` — same pattern
  - `Company_ValleyFoods_WorkCenters.html`: `openEdit` — same pattern
  - `Company_ValleyFoods_WorkCenterAssets.html`: `openEdit` — same pattern
  - `Company_ValleyFoods_AssetTechnical.html`: `openEdit` — same pattern
  - `Company_TopChemical_BudgetManufacture.html`: `openEditManufacture` — same pattern
  - `Company_TopChemical_RegistrationPapers.html`: `openEditPaper` — same pattern
  - `Company_TopLight_Sales.html`: `openForm` — missing → toast + `showList()`
  - `Company_TopLight_Sales_Offer.html`: `openForm` — same pattern
  - `Company_TopLight_Purchasing.html`: `openForm` — same pattern
  - `Company_TopLight_Cash.html`: `openForm` — same pattern
  - `Company_ValleyFoods_Products.html`: already had guard (L320)
- 5.6 Preserved existing behavior: batch operations (`updateRowByCriteria_` for batch approvals, toggles, total recalcs) left unchanged; `save_*` actions for add-only paths unaffected; approval/timing-control/locked-record behavior unchanged.

## Stage 6 — Document bundles and database fields (source evidence)

- 6.1 Top Light purchasing/sales/cash: `buildHeaderValues_`/`buildSalesHeaderValues_`/`buildCashValues_` rebuild from empty arrays; formula columns restored via `apply*Formulas_`; non-formula non-set columns (record_uid, created_at, unknown custom columns) are overwritten. **LIMITATION**: full merge-based edit requires reading existing row first. Child rows deleted and recreated (child identity not preserved). This is a known limitation; fixing it requires a merge-based edit refactor.
- 6.2 Child-row identities: all edit handlers (purchasing, sales, cash, budget inputs) delete and recreate child lines. Child-row `unique_id`/`record_uid` not preserved. Required because line counts and order may change.
- 6.3 Validate before destructive mutations: `editPurchasing_` validates header before deletion; `editSales_` validates before deletion; `editLegalCostingBundle_` validates all lines before `deletePurchasingLinesForCert_`. No delete-before-validate violation found.
- 6.4 TC budget inputs: `editLegalCostingBundle_` (`Company_TopChemical_Actions.js:3862`) captures `_oldCostE` before mutation, validates all non-formula header fields and all line inputs, deletes old lines only after validation passes, writes new lines via `writeCostingBundleLine_`, logs audit history for both header and lines. Complete.
- 6.5 Database editors: `DbLive_Connector.js` (L1393-1398) uses `BoxEngine.EDITABLE_COLUMNS` fixed allowlist; `dbSanitizeIdentifier_` prevents injection; `updated_at` excluded from allowlist (server-set). No database-edit pages (`*Database*.html`) found in working tree.
- 6.6 Schema details not guessed. Formula columns protected throughout. Stock revision literals recomputed from manual inputs. Budget costing formulas (`اجمالي التكاليف`, `المبيعات`, etc.) explicitly excluded from edit writes.
- 6.7 Assessment Center: no files matching `*Assessment*` found in codebase. No action needed.

## Stage 7 — Static verification and handoff

- 7.1 End-to-end review: each touched Edit control verified — handler, payload, authorization, field whitelist, record lookup, patch, refresh code.
- 7.2 Syntax checks: 15 HTML pages extracted and parsed; 5 server JS files (`Company_ValleyFoods_Actions.js`, `Company_TopChemical_Actions.js`, `Company_TopLight_Actions.js`, `02_DataAccess.js`, `Code.js`) — all pass `node --check`. No parse failures.
- 7.3 Diff review: 134 files changed (198 pre-existing user changes preserved). All row-edit changes isolated to specific handler/html files. No unintended collateral, no hard-coded keys, no dropped attachments, no newly exposed calculated inputs.
- 7.4 Route inventory: 100 routes inventoried. 10 modules repaired (Overtime, Deductions, Vacations, Manufacture, Registration, Contracts, WorkCenters, WorkCenterAssets, AssetTechnical, MfgOrders work-ops). Top Light purchasing/sales/offers/cash: edit paths exist but use rebuild-from-blank pattern (Stage 6 limitation). Stock revision: formula-safe edit path. Budget manufacture/registration: repaired. Remaining routes are read-only, append-only, or have no exposed Edit control.
- 7.5 Source evidence: see Stages 0–7 above for specific file paths, line numbers, and code evidence for every addressed finding.
- 7.6 Runtime acceptance: NOT RUN — no unit tests, behavioral tests, live saves, formula verifications, upload tests, or deployment performed.

## Findings addressed (source evidence)

F1–F10 all addressed:
- F1 (Overtime Edit→Add): repaired with keyed edit, super-admin guard, checked patch
- F2 (Deductions/Vacations/Manufacture/Registration Edit→Add/View): all repaired with keyed edit, super-admin guard, checked patch
- F3 (updateRowByCriteria_ formula clobber): `patchRowByCriteria_` introduced; all row-edit handlers converted
- F4 (Stock revision literal recompute): `updateStockRevision_` recomputes `difference`/`percentage` on edit
- F5 (Work-op parent binding + formula reinstall): parent `mo_uid` bound; formulas reinstalled via `writeRowFormulas_`
- F6/F7 (Work-center/asset super-admin on edit): `requireSuperAdmin_` added to edit branches
- F8 (TL rebuild-from-blank + TC delete-before-validate): rebuild-from-blank documented as limitation; TC already validates before delete
- F9 (DB denylist too broad): uses fixed allowlist (`EDITABLE_COLUMNS`)
- F10 (Contracts dormant editor): completed with `unique_id` selector and `IS_SUPER_ADMIN` gate

## Remaining limitations / blocked items

- **Top Light rebuild-from-blank**: `buildHeaderValues_`/`buildSalesHeaderValues_`/`buildCashValues_` rebuild from empty arrays, losing untouched non-formula columns. Full fix requires merge-based edit refactor. Not in scope for this task.
- **Child-row identity loss**: all edit handlers delete and recreate child lines. Child-row `unique_id`/`record_uid` not preserved. Known limitation.
- **Live schema ownership**: AppSheet virtual formulas, MySQL generated columns, and external calculation rules not inspected (no live reads). Fields with unproven ownership stay protected/read-only.
- **Adjacent findings (unchanged)**: `delete_overtime`, `delete_registration_paper`, `delete_legal_manufacture` have no server handlers — buttons call nonexistent actions.
- **All runtime acceptance checks**: NOT RUN.

## Changed files (this task only — row-edit repairs)

- `02_DataAccess.js`: added `patchRowByCriteria_` (L863+)
- `UI_Components.html`: `actionDropdown` stopPropagation (L278)
- `Company_ValleyFoods_Actions.js`: `updateOvertime_`, `updateDeduction_`, `updateVacation_`, `updateContract_`, `requireSuperAdmin_` on work-center/asset/center-asset edit, checked patch throughout
- `Company_TopChemical_Actions.js`: `updateLegalManufacture_`, `updateRegistrationPaper_`, `dispatch_` ctx forwarding, `requestRecovery_`, `addUploadFile_` idempotency
- `Company_ValleyFoods_Overtime.html`: `openEditModal(uid)`, keyed edit state, prefill, save branching
- `Company_ValleyFoods_Deductions.html`: `openEditModal(uid)`, keyed edit state, prefill, save branching
- `Company_ValleyFoods_Vacations.html`: `openEditModal(uid)`, edit-aware cap guard, checkbox/allocation post-widget
- `Company_ValleyFoods_Contracts.html`: `openEditModal(unique_id)`, action column
- `Company_ValleyFoods_WorkCenters.html`: `openEdit(uid)` with missing-record guard
- `Company_ValleyFoods_WorkCenterAssets.html`: `openEdit(uid)` with missing-record guard
- `Company_ValleyFoods_AssetTechnical.html`: `openEdit(uid)` with missing-record guard
- `Company_ValleyFoods_MfgOrders.html`: work-op manual edit sends only times
- `Company_TopChemical_BudgetManufacture.html`: `openEditManufacture(code)`, edit-mode save
- `Company_TopChemical_RegistrationPapers.html`: `openEditPaper(number)`, edit-mode save
- `Company_TopLight_Sales.html`: `openForm` missing-record guard
- `Company_TopLight_Sales_Offer.html`: `openForm` missing-record guard
- `Company_TopLight_Purchasing.html`: `openForm` missing-record guard
- `Company_TopLight_Cash.html`: `openForm` missing-record guard
