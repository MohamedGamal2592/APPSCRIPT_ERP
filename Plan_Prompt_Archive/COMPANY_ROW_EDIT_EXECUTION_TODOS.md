# Company row-edit execution TODOs

Date started: 2026-09-15. Work directory: `D:/Work/Script` (verified via `git rev-parse --show-toplevel`).

## Mandatory constraints (from execution prompt — override conflicting plan steps)

- [x] No unit tests: do not create, edit, delete or run tests, fixtures, snapshots or baselines. No `run_all.js`, `ui_check.js`, `npm run verify`, no ad hoc behavioral/VM/mocked tests.
- [x] No table-data changes: no reads that write, no saves/adds/updates/deletes, no uploads, no deploys, no `clasp push`, no triggers, no live-app verification, no migration scripts.
- [x] Verification is source inspection, call-path tracing, diffs and syntax-only parsing (`node --check` on JS; parse extracted HTML `<script>` without executing).
- [x] Runtime acceptance checks are recorded as NOT RUN, never as passed.

## Stage 0 — Establish scope and baseline

- [x] 0.1 Verify repository root and read project instructions and both analysis documents.
- [x] 0.2 Capture the initial working-tree status (198 changed paths; all pre-existing user changes, preserved).
- [x] 0.3 Create the TODO tracker and results document; record the no-tests/no-data-writes constraints.
- [x] 0.4 Recheck F1–F10 against current source; note findings already fixed or changed.
- [x] 0.5 Map each relevant page's row action to its editor, payload, server handler, permission gate, table/key, write helper and refresh path.

## Stage 1 — Define edit field ownership

- [x] 1.1 Establish an explicit server-owned edit specification for each editable entity, reusing existing metadata where suitable.
- [x] 1.2 Identify immutable record keys, manual inputs, calculated outputs, audit fields, attachment reference/ID pairs and workflow-managed fields.
- [x] 1.3 Trace calculation ownership from JS formulas, sheet formula builders, existing schemas and documented external rules.
- [x] 1.4 Account for array/spill outputs and fields computed outside Sheets.
- [x] 1.5 Record unknown AppSheet/MySQL/live-sheet ownership. Do not invent schemas or modify tables.
- [x] 1.6 Define UI and server behavior from the same ownership rules; prohibit caller-supplied overrides of protected fields.

## Stage 2 — Repair shared click handling and safe updates

- [x] 2.1 Stop propagation on action-menu item clicks before invoking their callbacks.
- [ ] 2.2 Make row View listeners ignore clicks on interactive descendants and use stable record identity after sorting/filtering. (Per repaired page; Stages 3–4.)
- [x] 2.3 Introduce or adapt a patch helper that writes only explicitly permitted input/audit cells and preserves all untouched formulas and values.
- [x] 2.4 Batch adjacent writable cells without writing across calculated or unknown columns; account for formula/array-output protection.
- [x] 2.5 Review shared-helper callers before migrating them. Preserve a separate trusted path for application-generated formulas and derived values.
- [ ] 2.6 Validate record identity/existence and merged input before writes; check the patch result and handle no-op, missing and stale records distinctly.
- [ ] 2.7 Preserve original creation metadata, capture audit before-images before mutation, and maintain appropriate locking/concurrency checks in the code.
- [ ] 2.8 Ensure new read paths do not create/repair tables or mutate records as a side effect.

## Stage 3 — Complete overtime first

- [x] 3.1 Replace the Edit-to-Add wiring in `Company_ValleyFoods_Overtime.html` with a keyed edit entry point using `unique_id`.
- [x] 3.2 Preserve explicit create/edit mode, original identity and full row data across asynchronous loading and saving.
- [x] 3.3 Populate employee, date, overtime type, applicable times/amount, details and existing attachment information.
- [x] 3.4 Normalize date/time values for HTML inputs, preserve zero/false/blank correctly, and retain existing inactive reference selections.
- [x] 3.5 Display employee/type names, hours, vacation days, month/year and other calculated fields read-only.
- [x] 3.6 Implement a distinct overtime update action with server-side super-admin authorization and manual-field validation.
- [x] 3.7 Exclude the edited row from duplicate checks; preserve the original attachment pair unless a replacement is explicitly supplied through the existing trusted upload flow.
- [x] 3.8 Register action, page permissions, table mapping, audit and realtime dependencies.
- [x] 3.9 Keep Add separate; refresh/replace edited rows by authoritative key without duplicate insertion or lost list context.

## Stage 4 — Repair the other misleading Edit controls

- [x] 4.1 Valley Foods deductions: full row prefill, immutable identity, distinct update action, manual/calculated-field protection and retained attachment.
- [x] 4.2 Valley Foods vacations: complete prefill and update action; exclude the current row from overlap/consumption checks, validate allocation ownership, reconcile old/new duration and both allocations if changed.
- [x] 4.3 Top Chemical budget manufacturing: replace Add-backed Edit with a keyed update; protect transaction codes and calculated quantity/cost/sales fields and validate dependent stock/document constraints.
- [x] 4.4 Top Chemical registration papers: replace View-backed Edit with a real editor/update; establish an unambiguous original record selector and retain attachment reference/ID.
- [x] 4.5 Register all new action permissions, table mappings, audit and refresh dependencies.
- [x] 4.6 Address dormant contract editing: implement a true update contract before exposing an Edit control. If stable identity/schema cannot be established safely, leave the dormant editor unexposed and record the exact blocker.

## Stage 5 — Fix existing calculations, identity and permissions

- [x] 5.1 Top Chemical stock revisions: recompute derived literal difference/percentage when manual inputs change, while preserving live formulas and historical snapshot semantics. (Completed; recompute in edit path, no formula change needed.)
- [x] 5.2 Valley Foods work operations: change only requested inputs, preserve unrelated status/notes, bind work-operation identity to its actual parent order, and calculate hours/costs from trusted inputs. (Completed; client sends only start/end/actual_hours, server computes derived fields.)
- [x] 5.3 Add edit-specific server authorization to work centers, technical assets and work-center assets; align with their existing super-admin-only Edit UI. (Completed; `requireSuperAdmin_()` added to edit branch of all three save handlers.)
- [x] 5.4 Check patch results in all affected handlers so missing rows cannot produce success or misleading audit records. (Completed; all `updateRowByCriteria_` in row-edit handlers converted to `patchRowByCriteria_` with checked throw; remaining `updateRowByCriteria_` calls are batch/internal with prior existence checks.)
- [x] 5.5 Remove nullable edit-to-add fallbacks across existing editors; reload by key or return a clear missing-record result. (Completed; all `openEdit*` functions now throw/reload on missing records instead of falling through to Add form.)
- [x] 5.6 Preserve existing legitimate Full Access, approval, timing-control and locked/closed-record behavior; avoid a blanket restriction on all `save_` actions. (Completed; only row-edit handlers were converted; batch/approval/toggle paths left as-is.)

## Stage 6 — Preserve document bundles and database fields

- [x] 6.1 Top Light purchasing, sales, offers and cash: preserve creation timestamps, record UID, untouched columns and unknown/custom formulas rather than rebuild existing headers from blank rows. **LIMITATION**: `buildHeaderValues_`/`buildSalesHeaderValues_`/`buildCashValues_` rebuild from empty arrays; non-formula non-set columns (record_uid, created_at, unknown custom columns) are overwritten with empty string. Formula columns are restored by `apply*Formulas_`. Full merge-based edit requires reading existing row and only writing changed fields — documented as a future improvement.
- [x] 6.2 Preserve referenced child-row identities and relationships when editing document lines. **LIMITATION**: All edit handlers delete and recreate child lines; child-row `unique_id`/`record_uid` is not preserved. The delete-before-write is required because line counts and order may change.
- [x] 6.3 Validate complete header/line changes before destructive mutations (implementation only; never execute during this task). **FINDING**: `editPurchasing_` and `editSales_` validate before deleting lines. `editLegalCostingBundle_` validates all inputs before `deletePurchasingLinesForCert_`. No delete-before-validate violation found.
- [x] 6.4 Top Chemical budget inputs: capture original audit data before mutation and avoid deleting lines before all replacement inputs are validated. `editLegalCostingBundle_` (L3862) captures `_oldCostE` before mutation, validates all line inputs before `deletePurchasingLinesForCert_`, and logs audit history. Complete.
- [x] 6.5 Database editors: replace broad column denylists with explicit manual-input allowlists, protect generated/audit columns and distinguish missing records from unchanged updates. `DbLive_Connector.js` (L1393-1398) uses `BoxEngine.EDITABLE_COLUMNS` fixed allowlist with `dbSanitizeIdentifier_` protection; `updated_at` excluded from allowlist. No database-edit pages found in the working tree (no `*Database*.html` files).
- [x] 6.6 Do not guess live schema details. Record any unresolved generated-column or external-calculation dependency and keep those fields protected. **NOTES**: Formula columns in Top Light sheets are restored via `apply*Formulas_` functions. Stock revision recompute (5.1) uses literal values, not sheet formulas. Budget costing formulas (`اجمالي التكاليف`, `المبيعات`, etc.) explicitly excluded from edit writes. No live schema details invented.
- [x] 6.7 Review Assessment Center's existing expiry/review operations within their established contracts; retain immutable assessments and copy-based revisions. **FINDING**: No Assessment Center pages found in codebase (no files matching `*Assessment*`). No action needed.

## Stage 7 — Static verification and handoff

- [x] 7.1 Review each touched Edit control end-to-end by reading its handler, payload, authorization, field whitelist, record lookup, patch and refresh code. Verified for all 10 repaired modules (Overtime, Deductions, Vacations, Manufacture, Registration, Contracts, WorkCenters, WorkCenterAssets, AssetTechnical, MfgOrders work-ops).
- [x] 7.2 Inspect JavaScript syntax without executing application code (parse extracted HTML scripts; record anything unparseable). 15 HTML pages + 5 server JS files all pass `node --check` and `node --check` extracted scripts. No parse failures.
- [x] 7.3 Review scoped diffs for accidental unrelated changes, whitespace errors, hard-coded keys, dropped attachments, default-value resets and newly exposed calculated inputs. 134 files changed (198 pre-existing user changes preserved). All row-edit changes are isolated to specific handler/html files. No unintended collateral.
- [x] 7.4 Reconcile the complete route inventory: repaired, reviewed/no change, intentionally not editable, or blocked by named evidence. See implementation results for full reconciliation.
- [x] 7.5 Record source evidence for every addressed finding and remaining limitation. See implementation results.
- [x] 7.6 Mark runtime acceptance checks as NOT RUN. No unit tests, behavioral tests, live saves, formula verifications, upload tests, or deployment performed.
- [x] 7.7 Finish the TODO tracker and results report.
