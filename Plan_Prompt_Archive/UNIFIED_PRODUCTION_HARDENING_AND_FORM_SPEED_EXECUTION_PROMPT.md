# New-Session Execution Prompt

Work in `D:\Work\Script` and execute the plan in:

`D:\Work\Script\UNIFIED_PRODUCTION_HARDENING_AND_FORM_SPEED_PLAN.md`

This is a production Google Apps Script ERP already used by real users. Treat correctness, compatibility, authorization, and preservation of the existing dirty working tree as higher priority than speed of implementation.

## Mandatory first actions

1. Read `UNIFIED_PRODUCTION_HARDENING_AND_FORM_SPEED_PLAN.md` completely before editing anything. It is the controlling specification.
2. Read any repository `AGENTS.md`/local instructions that apply.
3. Inspect `git status`, the current branch, relevant diffs, `appsscript.json`, and `clasp status` using read-only commands.
4. Do not assume the line numbers in the plan are still exact. Locate current functions and call sites with `rg`.
5. Read the affected server and HTML flows end-to-end before changing them. Trace server dispatch, authentication, authorization, data access, UI calls, and error handling.
6. Create/update `UNIFIED_PRODUCTION_HARDENING_AND_FORM_SPEED_RESULTS.md` as the evidence log for this execution. Record phase status, exact files/lines, deviations, blockers, and owner-only runtime checks.

## Binding constraints — never violate these

### 1. No unit testing

- Do not create, edit, delete, or run unit tests, test fixtures, mocks, stubs, test harnesses, or test-framework configuration.
- Do not run `node tools/verify/run_all.js` or any individual `tools/verify/*` script.
- Do not repair or modify the known stale `tools/verify/s5c_sales_audit.js` assertion in this run.
- Permitted verification is limited to code reading, line-cited static audits, `rg`, diff inspection, and `node --check` on touched standalone JavaScript files where that parser is appropriate.
- Do not execute inline HTML scripts through a harness; verify them by careful read-through.

### 2. No schema changes

- Do not add, remove, rename, reorder, or retype a Google Sheet, table, column, formula column, validation, index, MySQL object, or data-source mapping.
- Do not add a draft sheet, buffer table, hidden table, migration, or schema-version change.
- Do not use Script/User Properties, Drive, Firebase, MySQL, or another server store as a workaround for the schema prohibition.
- If a safe fix requires schema, stop that item and record `BLOCKED BY NO-SCHEMA CONSTRAINT`; do not invent an unsafe substitute.

### 3. No table-data mutations by the executor

- Do not add, edit, delete, seed, migrate, backfill, restore, clean, or otherwise mutate rows/cells in any production, staging, test, or copied table.
- Do not invoke application/server/UI/CLI functions that perform table writes, including save handlers, setup helpers, cleanup jobs, backup/restore jobs, triggers, or `clasp run` write paths.
- Code may contain the normal user-triggered write logic being implemented, but you must not execute that logic against a table.
- Do not read live table data unless the owner explicitly authorizes that specific read. Code/configuration inspection is allowed.

### 4. No deployment or unrelated repository changes

- Do not deploy, push, promote with `clasp`, alter live Script Properties, create triggers, or change external services.
- Do not commit unless the user explicitly asks. If asked, stage explicit files only—never `git add -A`.
- Preserve all pre-existing modified, deleted, and untracked files. Never reset, checkout, clean, overwrite, or reformat unrelated work.
- Use `apply_patch` for file edits.

## Owner-confirmed design decisions

Treat these as settled unless the owner explicitly changes them:

1. The web app intentionally runs as the deploying user and allows anonymous visitors to reach the login page.
2. Application authority is handled internally through ERP main-sheet registration, sessions, companies, roles, pages, and access levels.
3. Anonymous reachability of the login page is not a defect and must not be “fixed” by changing deployment access.
4. `valley_cost_view` and its current bootstrap/grant behavior are intentional. Do not change its semantics or edit grants. Only ensure all cost-bearing paths use it consistently and cannot erase protected cost fields.
5. The narrower callable-surface finding remains valid: a non-private top-level Apps Script function that lacks its own session/role checks can bypass the routed login/action authority. Audit each such function individually and privatize/guard only unintended callable functions.

## Required architecture for this run

Because schema changes and table mutations by the executor are prohibited, do not implement server-persisted section checkpoints or write partial drafts into live business tables.

Implement only the constrained architecture in the unified plan:

- Browser-local draft recovery for purchasing and manufacturing.
- One shared local-draft controller for purchasing and both MO entry surfaces.
- Namespace local data by authenticated user, company, form type, and local draft UID.
- Preserve stable client-local UIDs for complex/nested rows without adding columns.
- Clearly label persistence as “Saved on this device,” never as server-saved.
- Do not store session tokens, passwords, attachment bytes, or unrelated responses.
- Clear the correct local draft only after confirmed final-save success or explicit local discard.
- Warn on same-browser multi-tab conflicts; never promise cross-device recovery.
- Keep the existing routed final-save endpoints and schemas.
- Optimize/refactor final saves using bulk I/O, existing keys, and existing locks without weakening validation or changing response contracts.
- Do not add server draft actions, draft cleanup jobs, commit-journal storage, or new status/revision fields.

Before persisting purchasing cost fields in `localStorage`, verify that the owner has explicitly accepted the local-device privacy/XSS trade-off. If that decision is not present, continue safe earlier phases and then ask the owner; do not assume consent. In-memory-only preservation is the fallback until answered.

## Execution order

Follow the plan phases in order. Do not skip security containment to begin UI work.

### Phase 0 — Baseline and recon

- Inventory the current deployable/code surface without mutating anything.
- Map the current server/UI/data flows and downstream purchasing/MO dependencies by reading code.
- Record the dirty-tree boundary and files this execution expects to touch.
- Record unresolved owner decisions before their dependent phases.

### Phase 1 — Callable-surface containment

- Inventory every non-underscore top-level function.
- Classify each as intended web entry, trigger/menu entry, routed handler, operator/maintenance tool, migration, or test helper.
- Make unintended callable maintenance/test/migration helpers private or isolate them in code without changing deployment configuration.
- Preserve required trigger/menu behavior by static reasoning; runtime proof is owner-only.
- Do not treat the anonymous login page as a defect.

### Phase 2 — Authorization hardening

- Centralize/fix authorization for invoice, payroll, budget, print, and attachment/download routes using existing metadata and columns.
- Derive tenant/company and user scope on the server.
- Remove fail-open authorization catches.
- Use an already-existing immutable attachment/file association; if none exists, disable the ambiguous path and record the schema blocker.
- Enforce the existing company `enabled` field at relevant request boundaries.
- Disable blank-password self-claim and use only a secure admin-controlled flow possible with existing password hash/salt fields. Do not create token columns/tables.
- Preserve `valley_cost_view` behavior exactly.

### Phase 3 — Release/recovery/observability hardening

- Correct the browser error-reporting route by code change only and verify wiring statically.
- Document—but do not modify—the stale unit-test assertion.
- Prepare backup/restore and release runbooks; do not run them.
- Privatize/separate operational helpers in code where safe and schema-free.

### Phase 4 — Shared local-draft controller

- Implement local browser persistence and Arabic user-visible state labels.
- Ensure no draft operation calls a server/table write.
- Implement bounded local retention, correct user/company namespacing, explicit local discard, and multi-tab warnings.
- Use existing feature/config mechanisms only if no schema/data edit is required by you.

### Phase 5 — Purchasing

- Fill the current `ACTION_TABLES` purchasing mapping gap through code configuration only.
- Refactor the existing final save into clearer validation/preparation/batched-write stages without changing schema or validation behavior.
- Persist header/lines locally only before final submit.
- Keep `Code`/`originalCode` semantics and stable client-only line UIDs.
- Prevent ordinary saves after approval using existing fields.
- Align delete UI with the existing server policy.
- Preserve cost data and current `valley_cost_view` semantics.

### Phase 6 — Manufacturing orders

- Use one shared controller/contract for `Company_ValleyFoods_MfgOrders.html` and `Company_ValleyFoods_MfgOrderView.html`, or make one surface canonical without breaking links.
- Preserve local UIDs for outputs, consumption, work operations, and by-products.
- Do not create live draft rows or call standalone child-write endpoints before final save.
- Refactor the existing final save while preserving validation, balance, batch-release, formulas, and response behavior.
- Address row-derived visible MO numbering using existing columns/code only; perform no backfill.

### Phases 7–8 — Static performance analysis and handover

- Produce a static Apps Script service-call map and optimization rationale. Do not claim measured improvements.
- Prepare an owner-only manual runtime, staging, canary, rollout, and rollback checklist.
- Do not perform the checklist, deploy, or mutate any table yourself.

## Static evidence requirements

For every changed requirement, record in the results document:

- requirement/plan item;
- status: `SATISFIED BY STATIC EVIDENCE`, `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`, `BLOCKED BY NO-SCHEMA CONSTRAINT`, or `BLOCKED BY NO-DATA-MUTATION CONSTRAINT`;
- exact file and current line(s);
- concise reasoning;
- residual risk and owner action, if any.

Also record:

- all files changed by this execution;
- confirmation that pre-existing unrelated changes were preserved;
- every static command run and its result;
- explicit confirmation that no unit tests were created/modified/run;
- explicit confirmation that no schema was changed;
- explicit confirmation that no table data was added/edited/deleted;
- explicit confirmation that nothing was deployed or pushed.

Do not report runtime behavior, security denial, concurrency safety, restore success, or performance as passed based only on code reading.

## Working style

- Give concise progress updates while working.
- Work phase by phase and inspect diffs after each phase.
- Prefer small, reviewable edits and reuse existing helpers/contracts.
- Do not weaken validation, authorization, Arabic RTL behavior, or public response shapes for convenience.
- When a constraint makes a requirement impossible, stop only that requirement, document it precisely, and continue independent safe work.
- If existing dirty changes overlap a required edit and ownership cannot be distinguished safely, stop and ask before overwriting.

## Final response

At the end, lead with the actual outcome. Link the unified plan and results document using absolute paths. Summarize:

1. phases completed;
2. files changed;
3. security and form-speed changes implemented;
4. items blocked by the constraints;
5. owner-only runtime checks still required;
6. confirmation of no unit tests, no schema changes, no table-data mutations, no deployment, and no push.

Do not call the work production-verified until the owner completes and reports the runtime checklist.
