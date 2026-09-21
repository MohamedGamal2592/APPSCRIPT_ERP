# Company row-edit analysis and fix plan

Date: 2026-09-15

## Summary

The reported `action=vf_hr_overtime` behavior is confirmed in the source: Edit opens the Add flow, loses the selected row, and saves through a create-only handler. The click can also reach the row's View handler, explaining the second popup.

The wider audit found similar broken Edit controls, shared writes that remove sheet formulas, stale calculated values, and inconsistent update authorization. This document proposes fixes; no application code or live records were changed.

Repository root was verified as `D:/Work/Script`. Analysis uses the current working tree, including its extensive existing user changes. Archived copies and worktrees were excluded.

Coverage: four company action modules and registries, 100 registered page routes (Valley Foods 37, Top Chemical 35, Top Light 21, Assessment Center 7), their runtime templates, and shared UI, authorization and persistence paths. See [route inventory](COMPANY_ROW_EDIT_ROUTE_INVENTORY.md). This is source coverage, not 100 live browser tests.

Live spreadsheets, AppSheet formula configuration and MySQL schema metadata were not inspected. Actual field ownership must therefore be checked before implementation claims complete formula protection.

## Required edit contract

1. Resolve the selected existing record by an immutable key and open one populated editor.
2. Keep edit mode explicit. A missing/deleted record must never fall back to Add.
3. Allow changes only to manual inputs. Display sheet formulas, application-calculated values, generated identifiers and audit fields read-only.
4. Enforce the same field restrictions on the server, including for super admins and forged API payloads.
5. Update the same record, preserving its identity, creation metadata, existing attachments, unrelated fields and applicable workflow state.
6. Recalculate dependent values and return truthful, authoritative results.

## Confirmed findings

### F1 — P1: Overtime Edit runs Add and can open two dialogs

- `Company_ValleyFoods_Overtime.html:121`: Edit invokes `OT_PAGE.openAddModal({emp_id: ...})`, without the complete row or its `unique_id`.
- `Company_ValleyFoods_Overtime.html:439`: that exported wrapper ignores all arguments and calls `openModal()`.
- `Company_ValleyFoods_Overtime.html:318`: modal title/save callback always describe adding overtime.
- `Company_ValleyFoods_Overtime.html:373`: saving always calls `add_overtime`.
- `Company_ValleyFoods_Actions.js:2166`: `addOvertime_` generates a UID and appends a new row. No overtime update action is registered.
- `Company_ValleyFoods_Overtime.html:143`: each row has an unconditional View click listener. `UI_Components.html:267` renders action-item buttons without stopping propagation; only opening the action menu stops it.

Result: an empty/default Add form and potentially a View popup; saving can create another record or fail duplicate validation rather than update the original. Prefill loss and the missing propagation stop were reproduced offline.

### F2 — P1: Four other visible Edit controls do not update their rows

| Route | Source | Current result |
| --- | --- | --- |
| `vf_hr_deductions` | `Company_ValleyFoods_Deductions.html:130`, `:161`, `:278` | Prefills only type/date in Add; no row identity; saves `add_deduction`. |
| `vf_hr_vacations` | `Company_ValleyFoods_Vacations.html:125`, `:202` | Calls empty `openAddModal()` and saves `add_vacation`. |
| `tc_budget_manufacture` | `Company_TopChemical_BudgetManufacture.html:116`, `:216`, `:368` | Passes a code to an argument-free Add form; saves `add_legal_manufacture`. |
| `tc_registration_papers` | `Company_TopChemical_RegistrationPapers.html:149`, `:107` | Calls `viewPaper()` and opens a display-only modal. |

Each needs a real update handler and full prefill, not merely a changed modal title.

### F3 — P1: Shared updates overwrite untouched formulas

`02_DataAccess.js:841`, `updateRowByCriteria_`, reads `getValues()`, merges inputs and writes the entire row with `setValues()`. It writes evaluated results back into untouched formula cells, replacing the formulas.

Offline reproduction: changing an input from 10 to 12 in a row whose total formula was `=B2*2` wrote `[row-a, 12, 20]`. The formula was lost.

Callers span all three operational companies: products/parties, settings, purchasing, attachment/status updates, cash approvals and work operations. `saveRecordWithAudit_` at `02_DataAccess.js:1768` also merges full stored records into this path.

Some handlers reinstall selected formulas afterward, including Valley Foods cash edits. This protects only the formulas they know; other update/approval paths do not necessarily restore them. The Sheets fallback in `02_SystemStore.js:31` has a similar whole-row pattern, but its system-table callers should be reviewed separately from company storage.

### F4 — P1: Stock edits leave calculated snapshots stale

`Company_TopChemical_Actions.js:1708` computes `difference` and `percentage` on creation and stores literal snapshot values. `updateStockRevision_` at `:1757` changes count/system quantity without recalculating these outputs; reads return the stored results.

Offline reproduction confirmed that count 8 changed to 9 against system quantity 10 while difference/percentage remained unchanged. Cover both newer literal snapshots and older formula-bearing rows. Preserve historical product-name/category/unit snapshots and the intended system-quantity baseline.

### F5 — P1: Work-operation corrections clear data and accept calculated hours

`Company_ValleyFoods_MfgOrders.html:780` sends edited times with hard-coded `operation_status: 'In Progress'`, `actual_hours: ''` and `notes: ''`.

`Company_ValleyFoods_Actions.js:6976` writes these fields through the unsafe shared helper, accepts `actual_hours` directly, and does not recompute derived costs in that path. Other code explicitly calculates hours/costs (`mfgWorkCenterFormulaMap_` at `:5950` and timing-control logic).

The handler checks editability using supplied `mo_uid` but finds the work operation only by `workop_uid`; it does not verify that the operation belongs to that order. Bind the keys before updating and preserve omitted fields.

### F6 — P1: Edit authorization differs between UI and server

`save_valley_work_center`, `save_valley_asset_technical` and `save_valley_work_center_asset` have page access `write`. Their update branches at `Company_ValleyFoods_Actions.js:7144`, `:7204`, `:7261` lack an explicit super-admin check, while their pages show Edit only to super admins.

The outer gate at `Code.js:783` classifies `edit_`/`update_` prefixes but does not classify a `save_` payload by whether it updates an existing row. Consequently, the outer layer does not close this gap.

Add edit-specific guards to these dual-purpose handlers. Do not classify all `save_` actions as admin-only: many legitimately create records or perform permitted workflow actions. Preserve explicitly authorized Full Access workflows elsewhere and align UI/server checks.

### F7 — P1: Missing-row updates can succeed; stale editors can become Add

The three handlers in F6 and `saveValleyMfgWorkOp_` ignore the Boolean result of `updateRowByCriteria_`. They can return success despite no matching row.

`Company_ValleyFoods_WorkCenters.html:99` and `Company_ValleyFoods_WorkCenterAssets.html:112` pass a failed lookup to a modal that treats null as Add. Similar nullable lookups exist in other editors, including Top Light sales/offers. By contrast, `Company_ValleyFoods_Products.html:317` stops explicitly when its row is missing.

Offline execution of `saveValleyWorkCenter_` with a missing UID and a non-super-admin caller returned success even when the patch primitive returned false.

### F8 — P1: Existing document edits rebuild headers and replace child lines

Top Light purchasing, sales, cash and sales-offer edits rebuild whole header rows and reinstall only known formulas. Additional formulas/fields can be lost.

`Company_TopLight_Actions.js:2037`, `buildSalesHeaderValues_`, starts columns blank and sets a fresh `created_at`; sales and offer edits reuse it. Offline execution confirmed a new creation timestamp and blank `record_uid`/custom columns. Purchasing/cash builders also need preservation checks.

Top Light document edits delete/recreate child lines. Top Chemical `editLegalCostingBundle_` at `Company_TopChemical_Actions.js:3747` writes the header and deletes lines before validating every replacement line. A later validation error can leave a partial edit. It also uses a fixed formula denylist and reads its purported old header after mutation.

Use validated patches, preserve creation metadata/unknown columns, validate the full document before writing, and preserve line identities where downstream references rely on them.

### F9 — P2: Database editors need explicit field ownership

`DbLive_Connector.js:607`, `:749`, `:786` strip a few IDs/timestamps and accept other syntactically valid column names. Client-balance and manufacturing editors similarly expose most returned columns.

Confirmed: protection is a short denylist. Unverified: which actual MySQL fields are generated or calculated by another application. Inspect metadata/rules, then define allowed manual columns on both sides. Distinguish a missing row from an unchanged-value update; `affected: 0` alone may not do so with the configured driver.

### F10 — P2: Dormant contract editing still calls Add

`Company_ValleyFoods_Contracts.html:146` defines an edit modal, but the rendered table has no row Edit action. Save at `:180` calls `add_contract` with an ID; `Company_ValleyFoods_Actions.js:1723` ignores it and appends.

Treat this as incomplete functionality. Finish a true update contract before exposing it. Also normalize mixed-case contract keys against the lowercased keys returned by shared record readers.

## Field-protection design

Use a small server-owned edit specification per entity: company/page, storage table, immutable key, manual fields, calculated fields, attachment pairs, workflow permissions and validation rules. Reuse existing metadata/helpers where practical.

Determine field ownership from:

- Application calculations, generated fields and existing formula maps.
- Actual sheet formulas, including array/spill output ranges. A displayed value or a single cell's formula check is insufficient.
- AppSheet app/virtual formulas and MySQL generated/application-derived fields that cannot be inferred from current list APIs.

Render manual fields as inputs and protected fields read-only. Reject prohibited submitted changes before writing; disabled/hidden controls are not server authorization. Actual formulas take precedence over a field's default manual classification until any discrepancy is resolved.

### Overtime field contract

| Class | Fields / behavior |
| --- | --- |
| Selector | Immutable `unique_id`; never employee/date or visual row index. |
| Manual | `emp_id`, `date`, `overtime_type`, `details`, applicable start/end times. |
| Conditional manual | `amount` for money-related types, only if the live field is not formula-owned. |
| Attachment | Preserve `overtime_attachement` + `overtime_attachement_id`; replace together after successful upload/binding. Existing attachment satisfies the requirement. |
| Calculated | `name_ar`, `overtime_name`, `overtime_hours`, `overtime_vacation_days`, `month`, `year`, and any additional formula-owned fields. |
| System | Generated IDs, creator/creation time, record UID and server-managed update audit fields. |

Normalize dates in the configured business timezone and Sheets time fractions/date objects to `HH:mm`. Distinguish zero, false, null and empty string. Include the currently stored employee/type in edit options even if inactive, while retaining validation for newly selected values.

## Prioritized implementation phases

### 1. Inventory field ownership and establish regression fixtures

- Read actual headers/formulas and external calculation metadata without modifying records. Check positional HR formulas against attachment-ID columns added over time.
- Complete entity edit specifications for every exposed editor and the five broken controls in F1/F2.
- Add behavioral fixtures with two distinct records, formulas, derived literals, inactive options, attachments and creation metadata. Model evaluated values separately from formula expressions.
- Record report/add-only/workflow pages explicitly; do not automatically turn them into general editors.

### 2. Fix shared click handling and persistence

- Stop action-item propagation before the callback in `UIC.actionDropdown`.
- Make row View listeners ignore interactive descendants; bind records by key rather than displayed row position, including after sorting/filtering.
- Introduce a formula-safe patch that writes only allowed input/audit cells, batching adjacent writable cells without crossing protected gaps.
- Audit/migrate shared-helper callers. Keep an explicit trusted path for legitimate formula creation/recalculation.
- Resolve identity and check existence inside the write lock. Add record revisions/preconditions where concurrent edits are possible; use appropriate SQL transactions/concurrency checks.
- Capture original data before mutation, stamp updates on the server, and return/reload authoritative records with correct version invalidation.

### 3. Implement missing update actions and populated editors

Proposed actions: `update_overtime`, `update_deduction`, `update_vacation`, `update_legal_manufacture`, `update_registration_paper`. Match final naming to the project's conventions.

For each action:

1. Register handler, page-access mapping, action-table mapping, audit and realtime dependencies; explicitly authorize the new correction operation for super admins.
2. Fetch the complete record by stable key, retain explicit edit state, populate manual inputs and show calculated fields read-only.
3. Share validators with Add where semantics match; exclude the edited row from duplicate/overlap checks.
4. Validate the merged record before writing and retain existing attachment pairs unless intentionally replaced.
5. Update in place without generating another UID; replace the displayed row by its key using the server response while keeping list context.

Special cases:

- Vacations: exclude the old row from consumed-balance checks; reconcile previous/new duration and both allocations when allocation changes; validate employee/type ownership and overlaps under one lock.
- Budget manufacturing: protect generated transaction codes and costs/quantities; validate downstream stock/document constraints before changing inputs.
- Registration papers: establish a unique stable selector because current controls often identify rows by `document_number`. Preserve original identity during any permitted business-number change.
- Contracts: complete a real update action before exposing the dormant editor; otherwise retain the current add-only UI with the limitation documented.

### 4. Repair existing update paths

- Recalculate literal stock differences/percentages while preserving existing live formulas and historical snapshots.
- Correct work-operation times without resetting status/notes; verify parent ownership and compute hours/costs from authoritative inputs.
- Add edit-specific authorization and checked row matches to work-center/asset handlers.
- Replace nullable edit-to-add fallbacks with keyed reloads or clear missing-record errors across the inventory.
- Preserve Top Light creation metadata, unknown columns, formula cells and referenced child identities.
- Validate all bundle lines before destructive changes; handle partial-write recovery where the storage system lacks a transaction.
- Replace broad database denylists with validated field allowlists.
- Align Full Access versus super-admin checks without changing unrelated create/approval/timing/revision workflows.

### 5. Verify and roll out

After implementation, run targeted behavioral checks, then `node tools/verify/run_all.js` and `node tools/ui_check.js`. Distinguish pre-existing baseline failures from regressions in this modified working tree.

Run a deployed non-production browser pass for each editable entity and representative formula-bearing rows. Offline mocks cannot prove actual spreadsheet recalculation, array spill behavior, attachment binding or live database schema behavior. This analysis does not deploy or modify live data.

## Acceptance criteria

| Scenario | Expected result |
| --- | --- |
| Overtime Edit | Exactly one editor with the selected row's fields and existing attachment. |
| Sorted/filtered rows | Edit/View targets the clicked record by stable identity. |
| Save edit | Same primary key and row count; unrelated row unchanged. |
| Deleted/stale record | Clear not-found/conflict; no Add fallback or false success. |
| Formula fields | Formula expressions/array outputs preserved; dependent results refresh. |
| Forged payload | Calculated values, keys, creation metadata and unauthorized workflow fields cannot be directly overwritten. |
| Derived literals | Stock differences/percentages and operation hours/costs reflect corrected inputs. |
| Attachments | No upload retains reference+ID; replacement updates the pair only after successful binding. |
| Old options and values | Inactive references, zero, false, blank, Arabic text and time/date values round-trip correctly. |
| Vacation correction | No self-overlap refusal; old/new allocation balances correct. |
| Permissions | UI/server agree; new correction actions enforce super-admin authority. |
| Bundle validation | Invalid replacement leaves header/lines unchanged; successful edit preserves intended identity and history. |
| Workflow states | Closed payroll, locked/approved records and stock-linked documents retain applicable correction restrictions. |
| Add regression | Add remains separate and creates exactly one new record. |
| Realtime | Authoritative values appear without duplicate rows or lost list context. |

## Boundaries and verification gaps

- Live sheet/AppSheet field ownership still needs inspection. Names such as `depreciation_per_hour` are not proof that a field is calculated.
- Do not assume company business records use Firestore because system/auth storage changed. Verify each entity's actual storage target; some Top Chemical workflows explicitly use live MySQL.
- Formula loss was reproduced in code, not established as historical damage in live data. Any historical repair needs a separate comparison against authoritative formulas.
- Assessment Center intentionally keeps existing assessments immutable and uses copies for revisions (`Company_Assessment_Actions.js:472`). Preserve that behavior; check batch-expiry/review fields within their existing workflow.
- Inventory includes report/add-only pages but does not propose unrestricted editing for them. Immediate scope is exposed Edit controls and existing update functions, with dormant contract editing called out.

## Validation performed

Actual source functions were executed with in-memory fixtures to reproduce: overtime prefill loss; missing action-item propagation stop; formula loss in shared row updates; successful response for missing work-center row; Top Light header metadata/column loss; stale stock-derived values. A global-gate check confirmed `save_` action names do not supply edit-specific super-admin restrictions.

One initial test assertion used cross-VM `instanceof Object` and failed because the date belonged to another VM context. Correcting the assertion to inspect date behavior made the metadata reproduction pass. No live browser or spreadsheet tests were performed; no runtime tests were added or application source changed during this analysis.
