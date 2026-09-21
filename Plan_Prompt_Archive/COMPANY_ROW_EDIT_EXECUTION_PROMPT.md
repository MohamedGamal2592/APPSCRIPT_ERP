# Execution prompt: staged company row-edit repairs

Implement the company row-edit fixes in the existing project, following this prompt in order. Complete the stages autonomously, maintain a TODO checklist, and finish with a source-level implementation report.

## Project and required reading

Work directly in `D:\Work\Script`.

Read:

- `D:\Work\Script\AGENTS.md`
- `D:\Work\Script\COMPANY_ROW_EDIT_ANALYSIS_PLAN.md`
- `D:\Work\Script\COMPANY_ROW_EDIT_ROUTE_INVENTORY.md`

Before editing, run `git rev-parse --show-toplevel` and confirm the root is `D:/Work/Script`. Inspect the working-tree status and preserve all unrelated user changes. Do not use another checkout, worktree, backup or archived source copy. Treat the current runtime files as authoritative and recheck findings against them because they may have changed since the analysis.

## Mandatory constraints — override conflicting steps in the analysis plan

### No unit tests

- Do not create, edit, delete or run unit tests, test fixtures, test snapshots or test baselines.
- Do not run existing test suites, including `node tools/verify/run_all.js`, `node tools/ui_check.js`, `npm run verify`, or equivalent wrappers.
- Do not replace these with ad hoc behavioral tests, mocked handler execution, VM-based reproductions, integration tests or automated save simulations.
- Use source inspection, call-path tracing, diffs and syntax-only parsing for verification. A syntax check must parse code without executing the application or its top-level initialization.
- Skip the original plan's fixture-writing, behavioral-testing and live-save verification steps. Record them as intentionally not performed under this instruction, not as passed checks.

### No table-data changes

- Do not add, edit, delete, migrate, seed, repair, backfill or recalculate stored table data in any environment, including development or staging.
- This covers Sheets, Firestore, MySQL, AppSheet, business records, reference tables, audit/history tables and system/configuration tables.
- Do not alter table schemas, headers, formula cells, permissions tables or persisted configuration while carrying out this task.
- Do not invoke any save/add/update/delete/approve/revise/toggle/import/generate/recalculate action. Do not upload, replace or delete attachments.
- Do not create temporary records, even if you intend to delete or roll them back afterward. Do not use transactions or dry-run labels as a substitute for verifying that no writes occur.
- Do not deploy, publish, run `clasp push`, synchronize remote data or install triggers. Do not execute migration or maintenance scripts.
- Do not open the live application for verification or call company list/get actions unless their complete call path is proven read-only. Some reads call sheet/header creation helpers or write audit/system records.
- Prefer local source and existing schema documentation. Remote inspection is permitted only through a verified direct read-only operation with no application-side writes; if unavailable, document the missing evidence and continue independent local work.
- Keep secrets and private row contents out of reports.

You ARE authorized to edit application source that implements future update behavior. Writing update-handler code is part of this task; executing that code against stored data is prohibited. Existing intended user workflows should remain functional when the code is deployed later under separate authorization.

## Target behavior

Clicking Edit must open exactly one editor, populated from the selected existing row. A super admin can change only manual inputs. Sheet formulas, application-calculated fields, generated identifiers and audit metadata remain protected in the UI and on the server. Saving must target the same immutable record identity, preserve untouched fields and existing attachment bindings, and update dependent calculations through trusted application logic.

Missing records must fail clearly rather than open Add or report false success. Preserve existing valid create, approval, locked-record and Full Access workflows. Do not introduce generic editing on report-only or intentionally append-only pages. Keep Assessment Center's immutable-assessment/copy workflow.

## TODO tracking and stage discipline

Create and maintain:

- `D:\Work\Script\COMPANY_ROW_EDIT_EXECUTION_TODOS.md`
- `D:\Work\Script\COMPANY_ROW_EDIT_IMPLEMENTATION_RESULTS.md`

Use Markdown checkboxes for every numbered task below. Mark a task complete only after its source change and permitted static review are complete. Record any dependency or missing evidence beside the task. Do not mark unverified runtime behavior as verified.

After each stage:

1. Review the scoped diff and relevant call paths.
2. Perform applicable syntax-only checks without evaluating source.
3. Update TODO status, changed files, findings addressed and remaining limitations.
4. Give a concise progress update and continue to the next stage. Do not request approval between already authorized local stages.

If one task depends on unavailable live metadata, isolate that task, protect unresolved fields conservatively, document the limitation and continue the rest. Do not guess formula ownership or silently broaden edit permissions.

## Stage 0 — Establish scope and baseline

- [ ] 0.1 Verify repository root and read project instructions and both analysis documents.
- [ ] 0.2 Capture the initial working-tree status so unrelated changes remain attributable to the user.
- [ ] 0.3 Create the TODO tracker and results document; record the no-tests/no-data-writes constraints.
- [ ] 0.4 Recheck F1–F10 against current source; note findings already fixed or changed.
- [ ] 0.5 Map each relevant page's row action to its editor, payload, server handler, permission gate, table/key, write helper and refresh path.

Exit: implementation scope and unresolved evidence are explicit; no application or remote operation has been executed.

## Stage 1 — Define edit field ownership

- [ ] 1.1 Establish an explicit server-owned edit specification for each editable entity, reusing existing metadata where suitable.
- [ ] 1.2 Identify immutable record keys, manual inputs, calculated outputs, audit fields, attachment reference/ID pairs and workflow-managed fields.
- [ ] 1.3 Trace calculation ownership from JS formulas, sheet formula builders, existing schemas and documented external rules.
- [ ] 1.4 Account for array/spill outputs and fields computed outside Sheets. Do not classify a field as editable merely because its displayed value is numeric or the individual cell has no formula.
- [ ] 1.5 Record unknown AppSheet/MySQL/live-sheet ownership. Do not invent schemas or modify tables to resolve uncertainty.
- [ ] 1.6 Define UI and server behavior from the same ownership rules; prohibit caller-supplied overrides of protected fields.

Exit: every field exposed by a repaired editor has an ownership decision or a documented conservative restriction.

## Stage 2 — Repair shared click handling and safe updates

- [ ] 2.1 Stop propagation on action-menu item clicks before invoking their callbacks.
- [ ] 2.2 Make row View listeners ignore clicks on interactive descendants and use stable record identity after sorting/filtering.
- [ ] 2.3 Introduce or adapt a patch helper that writes only explicitly permitted input/audit cells and preserves all untouched formulas and values.
- [ ] 2.4 Batch adjacent writable cells without writing across calculated or unknown columns; account for formula/array-output protection.
- [ ] 2.5 Review shared-helper callers before migrating them. Preserve a separate trusted path for application-generated formulas and derived values.
- [ ] 2.6 Validate record identity/existence and merged input before writes; check the patch result and handle no-op, missing and stale records distinctly.
- [ ] 2.7 Preserve original creation metadata, capture audit before-images before mutation, and maintain appropriate locking/concurrency checks in the code.
- [ ] 2.8 Ensure new read paths do not create/repair tables or mutate records as a side effect.

Exit: shared source supports formula-safe updates and isolated row actions. Do not execute any write helper.

## Stage 3 — Complete overtime first

- [ ] 3.1 Replace the Edit-to-Add wiring in `Company_ValleyFoods_Overtime.html` with a keyed edit entry point using `unique_id`.
- [ ] 3.2 Preserve explicit create/edit mode, original identity and full row data across asynchronous loading and saving.
- [ ] 3.3 Populate employee, date, overtime type, applicable times/amount, details and existing attachment information.
- [ ] 3.4 Normalize date/time values for HTML inputs, preserve zero/false/blank correctly, and retain existing inactive reference selections.
- [ ] 3.5 Display employee/type names, hours, vacation days, month/year and other calculated fields read-only.
- [ ] 3.6 Implement a distinct overtime update action with server-side super-admin authorization and manual-field validation.
- [ ] 3.7 Exclude the edited row from duplicate checks; preserve the original attachment pair unless a replacement is explicitly supplied through the existing trusted upload flow.
- [ ] 3.8 Register action, page permissions, table mapping, audit and realtime dependencies.
- [ ] 3.9 Keep Add separate; refresh/replace edited rows by authoritative key without duplicate insertion or lost list context.

Exit: statically traceable Edit -> populated editor -> update handler -> same record. State that save/recalculation behavior remains untested at runtime.

## Stage 4 — Repair the other misleading Edit controls

- [ ] 4.1 Valley Foods deductions: full row prefill, immutable identity, distinct update action, manual/calculated-field protection and retained attachment.
- [ ] 4.2 Valley Foods vacations: complete prefill and update action; exclude the current row from overlap/consumption checks, validate allocation ownership, reconcile old/new duration and both allocations if changed.
- [ ] 4.3 Top Chemical budget manufacturing: replace Add-backed Edit with a keyed update; protect transaction codes and calculated quantity/cost/sales fields and validate dependent stock/document constraints.
- [ ] 4.4 Top Chemical registration papers: replace View-backed Edit with a real editor/update; establish an unambiguous original record selector and retain attachment reference/ID.
- [ ] 4.5 Register all new action permissions, table mappings, audit and refresh dependencies.
- [ ] 4.6 Address dormant contract editing: implement a true update contract before exposing an Edit control. If stable identity/schema cannot be established safely, leave the dormant editor unexposed and record the exact blocker.

Exit: each exposed broken Edit has a real update path; unresolved contract functionality is explicitly documented rather than activated through Add.

## Stage 5 — Fix existing calculations, identity and permissions

- [ ] 5.1 Top Chemical stock revisions: recompute derived literal difference/percentage when manual inputs change, while preserving live formulas and historical snapshot semantics.
- [ ] 5.2 Valley Foods work operations: change only requested inputs, preserve unrelated status/notes, bind work-operation identity to its actual parent order, and calculate hours/costs from trusted inputs.
- [ ] 5.3 Add edit-specific server authorization to work centers, technical assets and work-center assets; align with their existing super-admin-only Edit UI.
- [ ] 5.4 Check patch results in all affected handlers so missing rows cannot produce success or misleading audit records.
- [ ] 5.5 Remove nullable edit-to-add fallbacks across existing editors; reload by key or return a clear missing-record result.
- [ ] 5.6 Preserve existing legitimate Full Access, approval, timing-control and locked/closed-record behavior; avoid a blanket restriction on all `save_` actions.

Exit: existing update paths have explicit identity, authorization, calculation and failure behavior in source.

## Stage 6 — Preserve document bundles and database fields

- [ ] 6.1 Top Light purchasing, sales, offers and cash: preserve creation timestamps, record UID, untouched columns and unknown/custom formulas rather than rebuild existing headers from blank rows.
- [ ] 6.2 Preserve referenced child-row identities and relationships when editing document lines.
- [ ] 6.3 Validate complete header/line changes before destructive mutations. Use the backend's appropriate transaction or staged recovery strategy in the implementation; never execute it during this task.
- [ ] 6.4 Top Chemical budget inputs: capture original audit data before mutation and avoid deleting lines before all replacement inputs are validated.
- [ ] 6.5 Database editors: replace broad column denylists with explicit manual-input allowlists, protect generated/audit columns and distinguish missing records from unchanged updates.
- [ ] 6.6 Do not guess live schema details. Record any unresolved generated-column or external-calculation dependency and keep those fields protected.
- [ ] 6.7 Review Assessment Center's existing expiry/review operations within their established contracts; retain immutable assessments and copy-based revisions.

Exit: document/database editor source preserves record ownership and field protection, with unavailable schema evidence stated explicitly.

## Stage 7 — Static verification and handoff

- [ ] 7.1 Review each touched Edit control end-to-end by reading its handler, payload, authorization, field whitelist, record lookup, patch and refresh code.
- [ ] 7.2 Inspect JavaScript syntax without executing application code. For HTML scripts, parse only valid extracted JavaScript after safe handling of Apps Script template expressions; record anything that could not be parsed.
- [ ] 7.3 Review scoped diffs for accidental unrelated changes, whitespace errors, hard-coded keys, dropped attachments, default-value resets and newly exposed calculated inputs.
- [ ] 7.4 Reconcile the complete route inventory: repaired, reviewed/no change, intentionally not editable, or blocked by named evidence.
- [ ] 7.5 Record source evidence for every addressed finding and remaining limitation.
- [ ] 7.6 Mark runtime acceptance checks as NOT RUN. Do not claim that saves, live formulas, allocations, concurrency or uploads have passed.
- [ ] 7.7 Finish the TODO tracker and results report. Separate completed code work from unverified runtime behavior and any incomplete tasks.

## Required final response

Provide:

1. Completed stages and any specific incomplete items.
2. Main fixes and affected files, with links.
3. Links to the TODO tracker and implementation results.
4. Static checks performed and their outcomes.
5. Outstanding schema/field-ownership evidence or runtime validation needs.
6. Explicit confirmation: no unit tests or behavioral test suites were created, modified or run; no stored table data, schemas or attachments were changed; no deployment occurred.

Proceed through the authorized local implementation stages without stopping merely to request permission for the next stage. Never bypass the no-tests/no-data-writes constraints to complete a checklist item.
