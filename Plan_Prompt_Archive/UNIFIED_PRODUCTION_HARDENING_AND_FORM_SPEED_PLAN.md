# Unified Production Hardening and Complex-Form Speed Plan

Status: constrained execution plan; no runtime change or deployment is authorized by this file.  
Constraint revision: no unit testing, no schema changes, and no executor-performed table-data mutations.  
Repository: `D:\Work\Script`  
Production platform: Google Apps Script web app backed primarily by Google Sheets, with Drive and selected MySQL integration.  
Baseline branch observed during planning: `feat/sales-and-saves`, with a large pre-existing dirty working tree.

This plan consolidates and supersedes the execution guidance in:

- `MO_DRAFT_AUTOSAVE_PLAN.md`
- `VF_PURCHASING_SPEED_PLAN.md`
- the production architecture, security, recovery, and maintainability gap analysis

The two source plans remain useful design history. Where they conflict with this plan, this plan controls. This revision restores three owner-mandated execution constraints: no unit testing, no schema changes, and no executor-performed add/edit/delete operation against any data table. Those constraints narrow what can be proven and prevent the safest server-draft architecture from being implemented in this run; the limitations are stated explicitly rather than worked around silently.

---

## 1. Executive outcome

The project is a multi-company Arabic ERP already serving users. It has substantial production foundations: centralized sessions and role/page permissions, company-specific modules, batched data helpers, locks, audit history, change polling, staging utilities, backups, and retention utilities.

The work should proceed as four gated programs, in this order:

1. **Contain unintended callable-function exposure.** Keep the owner-approved anonymous web-app/login architecture, while reducing unguarded Apps Script functions, fixing download/attachment authorization, enforcing disabled-company status, and hardening account activation.
2. **Make releases and recovery trustworthy.** Establish a clean release baseline, repair verification drift, strengthen backups/restores, and make client errors observable.
3. **Introduce a no-schema form-recovery framework.** Use browser-local drafts and optimize the existing final-save paths without checkpointing partial data into business tables.
4. **Migrate purchasing and manufacturing forms onto that constrained framework.** Start with purchasing, then unify both manufacturing entry surfaces. The owner performs any runtime/table verification and production rollout outside the executor's run.

Callable-surface containment is first because adding endpoints before reviewing the callable surface would expand the boundary. Anonymous access itself is an accepted design: application authority comes from the ERP main-sheet registration, session, company, role, and page-access checks. Draft isolation is a prerequisite for form acceleration because partially persisted business rows must not affect stock, costs, reports, or approvals.

---

## 2. Non-negotiable production invariants

Every implementation phase must preserve these rules:

1. **No unit testing — of any kind.** The executor must not create, modify, delete, or run unit tests, fixtures, mocks, stubs, harnesses, or test-framework configuration. The executor must not run the existing verification suite or individual `tools/verify/*` scripts. Only non-behavioral static checks such as `node --check` and read-through audits are allowed.
2. **No table-data mutations by the executor.** The executor must not add, edit, delete, seed, migrate, backfill, restore, clean up, or otherwise mutate rows/cells in production, staging, test, or copied tables. It must not invoke any server/UI/CLI path that performs such a mutation. Feature code may contain the normal user-triggered save logic being implemented, but the executor may not execute it against a table.
3. **Server authority is mandatory.** Hidden buttons and client-side gates are usability features, never authorization controls.
4. **Tenant identity is server-derived.** A normal user cannot select a company in a download, attachment, print, draft, or save request. Super-admin cross-company access must be deliberate and audited.
5. **A draft has no business effect.** Until final commit, it cannot change available stock, cost valuation, accounting totals, reports, approval queues, visible document sequences, or another user's work.
6. **Acknowledged means durable.** The UI may label a section Saved only after the server confirms persistence. It must visibly distinguish Dirty, Saving, Saved, and Failed.
7. **Retries do not create avoidable duplication.** Local persistence is overwrite-by-local-draft-key. Final-save code uses existing document keys and locks as far as the current schema permits; any remaining idempotency gap is reported, not hidden.
8. **Finalized records reject ordinary writes.** Existing approval/status fields must gate final-save handlers where available. There is no server checkpoint traffic in the constrained design.
9. **Sheet I/O is batched.** No per-cell or per-row network calls in loops on form save paths. Read and write counts are measured, not inferred.
10. **No schema changes.** Do not add, remove, rename, reorder, or retype a sheet, table, column, validation, formula column, index, database object, or data-source mapping. Do not create a draft/buffer table or run a migration. If a safe requirement needs schema, stop that requirement and record it as blocked.
11. **Existing user changes are preserved.** Stage explicit paths only; never use broad destructive cleanup, history rewrites, `git add -A`, or checkout/reset of unrelated files.
12. **Evidence is limited honestly.** Static review is the executor's only proof. Concurrency, authorization behavior, recovery, table writes, and performance remain `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`; the executor must never claim them as passed.

### 2.1 Binding interpretation of the three constraints

- “No unit testing” includes existing and newly written unit-style or harness-based verification. Reading test files for context is allowed; changing or executing them is not.
- “No schema changes” applies to both Google Sheets and MySQL, including new draft sheets/columns and apparently harmless header additions.
- “No add/edit/delete data” applies to every table/environment touched by the executor, including staging copies. Read-only inspection of code/configuration is allowed. Read-only inspection of live data still requires explicit owner authorization and is not assumed by this plan.
- These constraints do not authorize production deployment. The owner remains the only person who may deploy and perform the manual runtime checklist.
- No substitute storage may be introduced merely to evade the schema constraint. Script/User Properties, Drive files, Firebase, browser databases synchronized to a server, hidden sheets, and MySQL draft tables are not silently treated as equivalent replacements.

---

## 3. Consolidated findings and gaps

### 3.1 Production security and control-plane gaps

| Priority | Finding | Current evidence | Required outcome |
|---|---|---|---|
| Accepted design | The web app runs as the deploying user and allows anonymous visitors to reach the application login. | `appsscript.json`; owner confirmation that authority is handled by the ERP main-sheet user registration, session, company, role, and page-access model. | Retain this deployment/login design. Anonymous reachability is not itself tracked as a defect in this plan. |
| P0 | Non-private top-level Apps Script functions may be invoked independently of the routed login/action flow unless the function performs its own authority checks. | Public maintenance entry points such as `stagingCreateEnvironment` (`08_Staging.js:29`), `dailyCsvBackup` (`07_Backup.js:42`), `archiveOldRecords` (`10_Retention.js:35`), `createAuditTestUser` (`99_AuditTools.js:263`), `setupMySqlCredentials` (`DbLive_Connector.js:50`), and `rebuildBoxAnalysisIndex` (`Company_TopChemical_Actions.js:5578`). | Review each function separately. Intended remotely callable functions must enforce the same internal session/role authority; maintenance/migration helpers without such checks must be private or outside the deployed web project. This finding does not challenge anonymous access to the login page. |
| P0 | Several print/download paths do not consistently enforce login, tenant, page, and access-level checks. | `serveErpInvoice_` (`05_Admin.js:561`); `servePrintFile_` (`Code.js:1072`); payroll and budget routes (`Company_TopChemical_Actions.js:5595,5873`). | One fail-closed download authorizer maps every artifact type to tenant, page, minimum access, and record ownership/scope. |
| P0 | Attachment authorization can fail open and file resolution searches the deployer's Drive by filename. | `resolveDriveFile_` (`Code.js:1702`), `serveAttachment_` (`Code.js:1879`). | Resolve attachments from a stored immutable Drive file ID tied to an authorized business record. Authorization errors deny access; no global filename fallback. |
| P1 | A pre-created user with a blank password can set a password using only the known email address. | first-time setup path in `03_Security.js:93+`; blank-password creation is intentional in `05_Admin.js:79-82`. | Disable self-claim and use an admin-controlled reset through existing password-hash/salt fields. A stronger token workflow is blocked if it requires schema. The executor does not migrate account rows. |
| P1 | Company `enabled` is stored and displayed but is not consistently enforced at session/dispatch/data resolution boundaries. | `05_Admin.js:37,46`; no equivalent mandatory gate in each company request path. | A disabled company cannot open its dashboard, call module actions, download files, or resolve its data source. Super-admin override, if retained, is explicit and audited. |
| Accepted design | `valley_cost_view` uses the current grant/bootstrap behavior by design. | `vfCanSeeCost_` (`Company_ValleyFoods_Actions.js:4192-4199`) and owner confirmation. | Make no semantic change. Preserve the existing resolver and statically confirm all cost-bearing reads/writes use it consistently so narrower save paths cannot bypass or erase protected cost fields. |
| P2 | Browser error reporting calls a private server function directly and therefore cannot work as intended. | `google.script.run...logClientError_` (`UI_Components.html:868`); routed `log_client_error` exists in `Code.js`. | Send sanitized client errors through the central API route, authenticate where possible, rate-limit unauthenticated login errors, and strip secrets/tokens/PII. |

### 3.2 Recovery, release, and verification gaps

| Priority | Finding | Consequence | Required outcome |
|---|---|---|---|
| P1 | CSV backup retains values only and restore covers a narrow path. | Formulas, formatting, validation, Drive attachments, MySQL state, and cross-sheet consistency may not be recoverable. | Define RPO/RTO; design native spreadsheet/file, Drive, and MySQL coverage plus checksum manifests. Restoration is owner-only because the executor may not mutate tables. |
| P1 | The working tree is very dirty and contains many untracked deployable files. | A broad deploy or commit can mix unrelated work or omit production files. | Create a release inventory, reconcile `clasp status`, isolate this program in explicit commits/paths, and tag the last known production deployment. |
| P2 | Existing local verification is strong but one assertion is stale. The observed run was 70/71 passing. | A red suite can hide real regressions or train maintainers to ignore failures. | Repair `tools/verify/s5c_sales_audit.js` to assert current intended behavior, then require a fully green suite before feature rollout. |
| P2 | Backup, retention, staging, and maintenance utilities share the production codebase. | They enlarge the callable and change surface of the public web app. | Separate operational tooling or make it provably private, with least-privilege credentials and an operator runbook. |

### 3.3 Gaps in both earlier checkpoint plans

The earlier plans correctly emphasized non-blocking UI, FIFO ordering, idempotency, stable identity, bulk I/O, owner isolation for MO, and final validation. The following gaps must be resolved before implementation:

1. **Direct live-table drafts are not proven safe.** Manufacturing consumption/output rows and purchasing lines may feed stock, cost, formulas, reports, and approvals immediately. A `Draft` label on a header does not automatically quarantine child rows.
2. **Browser FIFO is not a concurrency protocol.** It does not prevent an older request from a second tab, offline queue, delayed retry, or device from overwriting a newer checkpoint.
3. **The original purchasing model exposed incomplete records to other users.** It had no real draft state or ownership and treated blank approval status as enough. That permits partial documents to enter shared operational views.
4. **Purchasing line rewrite is destructive and inefficient.** Delete-all/reinsert-all changes UIDs, expands audit noise, risks partial state if the write fails after deletion, and weakens retry/rename behavior.
5. **`Code` is not a safe draft identity.** It is user-editable. Rename and retries require an immutable `draft_uid` independent of the eventual document key.
6. **Header acknowledgement is not the only dependency.** MO consumption rows depend on output UIDs. Parent identity acknowledgements must gate dependent child checkpoints.
7. **The MO clients do not consistently preserve child UIDs.** Both manufacturing UIs must carry stable output, consumption, work-operation, and by-product identities through load/edit/save.
8. **There are two MO editing surfaces.** `Company_ValleyFoods_MfgOrders.html` and `Company_ValleyFoods_MfgOrderView.html` can diverge unless they share one controller/contract or one becomes canonical.
9. **Late checkpoints can mutate finalized work.** The server needs a state machine and monotonic revisions, not only UI queue discipline.
10. **The no-unit-test constraint creates an accepted proof gap.** Static reading cannot prove cross-tenant denial, retry idempotency, multi-tab ordering, crash recovery, quota behavior, or performance. All such claims must remain unproven until the owner performs the manual checks.
11. **The no-schema constraint blocks isolated durable server drafts.** A new protected draft store would be safer than inserting partial rows into financial and inventory tables, but it is prohibited in this run. The constrained design therefore uses browser-local recovery and retains the existing final business commit.
12. **Draft lifecycle was incomplete.** Resume, explicit discard, expiry/retention, cleanup, audit policy, and recoverability need definitions.
13. **Per-checkpoint audit logging can overwhelm business history.** Draft telemetry and material business audit events need separate policies.
14. **Final-save speed was assumed rather than budgeted.** Isolated autosave improves recovery and perceived progress but does not automatically make the final multi-sheet commit instant. Final commit performance must be measured and optimized honestly.
15. **Purchasing change polling is incomplete.** `PAGE_ACCESS` contains purchasing actions, but current `ACTION_TABLES` lacks them, leaving the derived `PAGE_TABLES['vf_purchasing']` watch set empty.
16. **Approval does not reliably close the write window.** Purchasing approval and save paths need server-side state preconditions so an approved record cannot be changed by a stale edit.
17. **MO numbering conflicts with the old draft rule.** The current `code` formula is row-derived (`Company_ValleyFoods_Actions.js:5279`), so writing a live draft header can expose or destabilize a visible number before final commit.

---

## 4. Target architecture under the constraints

### 4.1 Feasibility boundary

A private, cross-device, server-durable checkpoint system cannot be implemented safely with all three constraints in force. Purchasing has no existing draft owner/state/revision fields, and introducing an isolated draft table is a schema change. Writing partial purchasing or MO sections into live business tables could affect stock, cost, reports, formulas, approvals, and visible numbering.

Therefore this run must **not** add server checkpoint endpoints that persist partial forms. It must not describe live business-table writes as safe autosave. The permitted implementation is:

1. browser-local form recovery;
2. shared client-side form-state code;
3. optimization/refactoring of the existing final save without changing its data contract or schema;
4. read-only dependency and security audits; and
5. owner-executed runtime verification after handover.

This constrained result cannot provide cross-device resume, server-confirmed section saves, or a recoverable cross-sheet commit journal. Those remain documented limitations.

### 4.2 Browser-local draft contract

Create one reusable controller used by purchasing and both MO surfaces. It may persist the current form in browser `localStorage` only after the owner accepts the local-device privacy trade-off.

- Namespace keys by company, authenticated user, form type, and immutable local draft UID.
- Store a format version, source record UID/Code, section payloads, stable client row UIDs, dirty timestamps, and last successful final-save result.
- Debounce local persistence; do not block typing or section navigation.
- Label the state **Saved on this device**, never **Saved** or **Saved to server**.
- Restore only after the same authenticated user and company are confirmed.
- Detect a changed source record/version when the existing API exposes enough information; otherwise warn that conflict detection is unavailable.
- Clear local content only after a successful final-save acknowledgement or an explicit local discard.
- Apply a bounded retention period and clear drafts on logout when the owner selects that privacy policy.
- Do not store session tokens, passwords, attachment bytes, or unrelated API responses.
- Do not synchronize local drafts through Script/User Properties, Drive, Firebase, a hidden sheet, MySQL, or another new store.

Because browser storage is readable by scripts on the same origin, persisting sensitive purchasing cost data increases the impact of an XSS defect. If the owner does not accept that risk, local autosave for cost-bearing forms is blocked and only in-memory recovery plus final-save optimization may be implemented.

### 4.3 Final-save contract

Keep the existing routed API/module-action boundary and existing tables/columns. Do not expose new top-level public functions.

The final save must:

1. resolve session and company on the server;
2. enforce company enabled, page access, write access, and cost permission;
3. run all current required-field, totals, movement, batch, balance, and duplicate validation;
4. use stable existing document identity (`mo_uid` for MO and the guarded Code/originalCode path for purchasing);
5. batch reads, ID allocation, line matrix construction, and writes without per-row service calls;
6. preserve all existing formulas, headers, and response shapes;
7. refuse ordinary edits after approval/finalization when the existing columns can express that rule; and
8. return success only after the existing business writes finish.

The executor may implement/refactor this code but must not invoke it against any table. Idempotency and partial-failure safety can be improved using existing keys and locks, but cannot be claimed fully solved without a durable request/commit state. Any remaining cross-sheet partial-write risk must be recorded as `UNPROVEN/UNRESOLVED — SCHEMA CHANGE REQUIRED`.

### 4.4 Deferred architecture, explicitly outside this run

An isolated server draft store with owner, state, revision, checksum, and commit-journal fields remains the recommended future architecture. It is not an action item while the no-schema constraint applies. It may be reconsidered only if the owner explicitly revises that constraint in a later plan.

---

## 5. Ordered execution plan

### Phase 0 — Freeze the baseline and answer owner decisions

- [ ] Inventory the exact deployed Apps Script version, deployment ID, manifest, script properties (names only), triggers, spreadsheet IDs, Drive folders, and MySQL dependency.
- [ ] Tag or record the exact last-known production commit/version.
- [ ] Reconcile `clasp status` against the many modified/untracked deployable files; define an explicit include list for each release.
- [ ] Collect any already-existing p50/p95 timings, row counts, lock failures, and Sheets read/write counts from repository artifacts or owner-supplied reports only; do not invoke a save or mutate a table to create a baseline.
- [ ] Map all downstream consumers of purchasing and MO headers/children: formulas, Apps Script reads, reports, prints, AppSheet, exports, MySQL jobs, and approvals.
- [ ] Resolve the decisions in section 8. No local-draft implementation begins until device-storage privacy, retention, and approval locking are decided.

Exit gate: baseline artifact approved; no production edits; every unknown is either answered or explicitly blocks a later phase.

### Phase 1 — P0 callable-surface containment

- [ ] Enumerate every top-level server function not ending in `_`; classify as intended public entry, trigger callback, menu/operator command, test helper, migration, or accidental exposure.
- [ ] Make maintenance/test/migration helpers private or move them to a separate non-web-deployed admin project. Recreate/install triggers safely if renaming affects trigger bindings.
- [ ] Produce a read-only callable-surface inventory whose allowlist contains only intended public entries such as `doGet`/`doPost` and any proven-required trigger/menu wrappers. Do not create a test or harness.
- [ ] Confirm routed action registries accept fixed known actions only and never dynamic function/table names.
- [ ] Record anonymous access to the login page as owner-approved and retain it. Do not treat successful rendering of the login page as authorization for any directly callable server function.

Exit gate: a line-cited static audit shows all maintenance, audit, credential, staging, retention, backup, and rebuild functions are private or outside the deployed web project. Runtime reachability remains `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`.

### Phase 2 — P0/P1 authorization hardening

- [ ] Build one `authorizeArtifact_`-style policy for invoice, payroll, budget, generic print, attachment, and future exports.
- [ ] Derive tenant and record scope on the server; validate page and minimum access for every artifact.
- [ ] Replace Drive filename search using an already-existing immutable file ID/business-record association. If the present schema cannot provide one, disable the ambiguous download path and record restoration as blocked by the no-schema rule. Remove fail-open catches.
- [ ] Enforce company `enabled` at login/session refresh, company dispatch, spreadsheet resolution, module action, download, and draft boundaries.
- [ ] Disable blank-password self-claim. Use the existing password-hash/salt fields for an admin-controlled temporary-password/reset flow. A token table/column is prohibited; if a secure flow cannot be built from existing fields, block self-service activation rather than add schema.
- [ ] Preserve `valley_cost_view` semantics exactly as designed. Trace all cost-bearing read and write paths to the same resolver and close only accidental bypasses; do not change the resolver's bootstrap behavior or edit grants.
- [ ] Build a line-cited negative-path review matrix for anonymous, cross-user, cross-role, cross-company, disabled-company, guessed filename/file ID, and stale-session cases. Do not execute those paths.

Exit gate: the static authorization matrix has no unexplained fail-open branch. Runtime denial remains `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`.

### Phase 3 — Release, observability, and disaster recovery

- [ ] Route browser errors through `log_client_error`; sanitize, authenticate when possible, and rate-limit. Verify wiring by code reading only.
- [ ] Record the stale `s5c_sales_audit` assertion as verification debt. Do not modify or execute it under the no-unit-test constraint.
- [ ] Manually audit public callable functions, artifact authorization coverage, company-enabled enforcement, action registry/table-watch coverage, and unintended fail-open catches; record file/line evidence rather than adding tests. The accepted `valley_cost_view` behavior is not an unintended fail-open finding.
- [ ] Define RPO/RTO and produce a backup matrix for Sheets values/formulas/format/validation, Apps Script versions/properties, Drive attachments, and MySQL.
- [ ] Design checksummed backup manifests, retention, alerting, and a restore runbook. Code may be prepared without execution, but the executor must not run backup/restore jobs or mutate a destination table.
- [ ] Separate or privatize operational tools and document who can run them.

Exit gate: static evidence report and reproducible release/restore runbooks are complete. Backup execution and restore correctness remain `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`.

### Phase 4 — Shared no-schema local-draft infrastructure

- [ ] Implement the shared browser-local controller described in section 4.2; add no server draft action, sheet, column, database object, or migration.
- [ ] Keep stable row identities inside the local payload so deleting/reordering form rows does not corrupt the current browser draft.
- [ ] Add Arabic states for Unsaved changes, Saved on this device, Local save failed, Restored, and Discarded. Do not imply server durability.
- [ ] Add bounded local retention and explicit local discard/clear behavior without touching any table.
- [ ] Reuse existing feature-flag/config mechanisms only if they require no schema or table-data edit by the executor; otherwise keep the code path disabled until owner deployment configuration.
- [ ] Audit cross-tab handling by reading: use a browser storage/version signal to warn rather than silently merge. Do not claim conflict safety from static review.

Exit gate: code and line-cited audit show that draft operations are browser-local and no new server/table write path exists. Browser behavior remains for the owner checklist.

### Phase 5 — ValleyFoods purchasing migration

- [ ] Add the existing purchasing actions and both header/line tables to `ACTION_TABLES`, so page change watching is correctly configured; verify by reading the derived mapping.
- [ ] Refactor `saveValleyPurchasingCosting_` into: normalization/validation, deterministic commit preparation, and business-write stages without weakening current validation.
- [ ] Use a local draft UID as browser editing identity. Keep user-entered `Code` as payload and preserve today's guarded `originalCode` behavior for final save.
- [ ] Give every line a stable client-only UID in the local draft and preserve it through local edits/reloads; do not add a column.
- [ ] Save header and lines locally only. Do not call the server or delete/reinsert live purchasing lines during a checkpoint.
- [ ] Final commit rechecks required fields, movement type, cost access, duplicate Code, header/line total equality, and approval/edit state.
- [ ] Prevent saves after approval unless a separately authorized reopen transition occurs.
- [ ] Align client delete controls with the server's actual super-admin delete policy.
- [ ] Preserve cost values server-side and reject any cost-blind partial overwrite.

Exit gate: static audit shows local drafts cannot enter normal lists/reports or alter stock/cost. Final-save behavior, idempotency, and page refresh remain `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`.

### Phase 6 — ValleyFoods manufacturing migration

- [ ] Choose one canonical MO edit workflow or extract a shared controller used by both `Company_ValleyFoods_MfgOrders.html` and `Company_ValleyFoods_MfgOrderView.html`.
- [ ] Preserve stable client-local UIDs for outputs, nested consumption rows, work operations, and by-products in both clients without adding columns.
- [ ] Save all MO sections to one local payload. No header/output/consumption checkpoint may call a business-table write.
- [ ] Namespace local resume data to `(company, authenticated user)` and never expose it through shared server lists.
- [ ] Ensure the new local-draft code does not create live MO `Draft` rows. Existing server-created Draft behavior, if any, is audited separately and not cleaned up by the executor.
- [ ] Refactor the existing giant save into reusable full validation plus deterministic commit stages. Preserve balance/tolerance/batch-release behavior.
- [ ] Replace the row-derived visible MO formula with a stable value derived at final save using existing columns, or explicitly classify it as internal. The executor changes code only and performs no table update/backfill.
- [ ] Reconcile existing standalone work-operation/by-product UI flows so a new local draft does not call them before final save; do not add new persistence endpoints.
- [ ] Confirm by data-flow reading that local draft data cannot affect current-products calculations or manufacturing valuation before final save.

Exit gate: both MO surfaces use the same canonical local payload by inspection; runtime retry/crash/numbering behavior remains `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`.

### Phase 7 — Performance optimization and truthful targets

- [ ] Produce a static service-call map for final save and identify calls that scale with row count. Use existing performance artifacts only; the executor does not generate runtime timings.
- [ ] Propose owner measurement targets: responsive local persistence, meaningful p95 final-save improvement, zero per-row service calls, and no regression in concurrent-user failure rate.
- [ ] Optimize hot paths with bulk reads/writes, per-request memoization, batch ID allocation, and minimal `flush()` calls.
- [ ] Keep locks around the smallest correct critical section while maintaining existing document-key and ID safety.
- [ ] Do not use pre-commit business rows to meet a speed target. If final save remains too slow after safe batching, record the server-draft/schema requirement as blocked.

Exit gate: static performance hypothesis and owner measurement worksheet are complete. No measured improvement is claimed by the executor.

### Phase 8 — Owner-only runtime validation, rollout, and rollback

Everything in this phase is outside the executor's permitted run.

- [ ] Owner creates or selects any staging environment and controls all test/table data.
- [ ] Owner performs the manual matrix in section 7; no unit-test execution is requested by this plan.
- [ ] Owner enables a small named canary cohort and monitors client errors, save failures, lock retries, and latency.
- [ ] Owner rolls out purchasing first, then MO, one company/role cohort at a time.
- [ ] Keep the old final-save UI available behind a short-lived rollback flag until the observation window closes.
- [ ] Roll back by configuration or prior deployment/`git revert`; local browser drafts may be exported manually before removal, but the executor performs no table cleanup.
- [ ] After the observation window, owner approves removal of the old client path; both paths must continue to call the same existing server save endpoint until then.

Exit gate: owner supplies the runtime sign-off. Without it, the plan ends at code-complete/static-audit-complete, not production-verified.

---

## 6. Verification strategy under the constraints

### 6.1 Executor-permitted static gates

- Run `node --check` only on touched standalone JavaScript files where parsing is valid.
- Read every touched HTML inline script carefully; do not execute it through a harness.
- Produce a public-function inventory and compare it manually with the approved allowlist.
- Read-join every routed action with its page/access metadata and expected watch table.
- Trace company-disabled branches to a fail-closed outcome. Trace cost-bearing paths to the existing owner-approved `valley_cost_view` resolver without changing its semantics.
- Trace local-draft storage keys, user/company namespace, cleanup, and final-save boundary by file/line evidence.
- Inspect loops on final-save paths and identify every Apps Script service call; no dynamic performance claim follows.
- Review payload allowlists and reject paths for arbitrary function/table access.
- Do not create, edit, delete, or run unit tests or verification harnesses, including `tools/verify/run_all.js` and `tools/verify/*`.

### 6.2 Owner-only runtime checklist

The following items are not performed by the executor because they invoke application behavior and may add/edit/delete table data:

- Anonymous and logged-in direct calls to former maintenance entry points.
- Cross-company and cross-role access to every print/download/attachment type.
- Disabled-company user with an existing session.
- Admin-controlled temporary password: initial login, forced change if implemented with existing fields, stale/incorrect credentials, and blank-password refusal.
- Two users and two tabs use independent local drafts; same-user local overwrite warning is observed.
- Network loss before and during final save, including the response-loss case.
- Browser close/reload after local persistence and during final commit.
- Local discard clears only the selected user's/company's browser draft.
- Purchasing Code rename, duplicate Code, total mismatch, cost-blind user, approval during edit, and retry after partial commit.
- MO output deletion/re-add, output-to-consumption UID linkage, batch release, validation failure, number allocation, and retry after partial commit.
- Confirm local drafts do not change stock, valuation, reports, dashboards, approval queues, exports, or AppSheet views.
- Restore a backup into isolation and verify row counts, formulas, validations, attachments, permissions, and sampled business totals.

The executor's evidence matrix uses `SATISFIED BY STATIC EVIDENCE`, `UNPROVEN — OWNER RUNTIME CHECK REQUIRED`, `BLOCKED BY NO-SCHEMA CONSTRAINT`, or `BLOCKED BY NO-DATA-MUTATION CONSTRAINT`. It must never turn a read-through into a runtime `PASS` claim.

---

## 7. User acceptance checklist

- [ ] Typing and moving between sections remains responsive while the local draft is persisted.
- [ ] The UI distinguishes Unsaved changes, Saving on this device, Saved on this device, and Local save failed.
- [ ] Closing and reopening the same browser/device restores the most recent local draft without claiming server persistence.
- [ ] Local drafts are namespaced to the authenticated user and company on that device.
- [ ] Another tab warns before overwriting newer local work; cross-device resume is explicitly unsupported.
- [ ] Final commit serializes the latest in-memory/local payload and blocks on client validation errors.
- [ ] Double-click and retry create exactly one business document and one intended child set.
- [ ] A local draft never appears as a real purchase/MO and never changes stock, cost, or reports.
- [ ] Approved/finalized records reject stale final saves according to existing status fields.
- [ ] Local discard is confirmed and removes only the selected local draft; there is no server recovery promise.
- [ ] Existing committed purchasing and MO editing behavior remains correct.
- [ ] Arabic RTL layout, accessibility, mobile use, and both MO entry surfaces are verified.

---

## 8. Owner decisions required before implementation

| Decision | Recommended default | Why it matters |
|---|---|---|
| Draft persistence | Browser-local only for this run | Respects no schema and prevents partial business-table effects, but cannot provide cross-device recovery. |
| Local cost-data privacy | Require explicit acceptance before persisting purchasing cost fields in `localStorage` | Persistent browser data increases the impact of device sharing or XSS. Without acceptance, keep cost-bearing drafts in memory only. |
| Draft visibility | Same authenticated user/company on the same browser profile | Server-private draft lists are impossible without durable server metadata. |
| Retention | A bounded local duration selected by the owner, cleared after successful commit/discard | Balances same-device recovery and privacy without table cleanup. |
| Purchasing approval | Financial and quality approvals require explicit roles; either approval locks ordinary edits | Current shared `write` access and unlocked saves are ambiguous. |
| Reopen policy | Dedicated authorized transition with reason and audit | Avoids editing approved records through normal save routes. |
| Purchasing Code | Keep user-entered for now; immutable draft UID is separate | Avoids making Code a concurrency key or silently inventing a sequence. |
| MO visible numbering | Allocate/store a stable value only during the existing final save, using existing columns | Current row-derived formula is unstable; no draft row or schema change is allowed. |
| Cost permission behavior | Retain current `valley_cost_view` design | Owner confirmed this behavior is intentional; the plan checks consistency only. |
| Web-app access | Retain anonymous access to the internally authenticated login flow | Owner confirmed ERP main-sheet registration/session authority is the intended boundary. |
| RPO/RTO | Owner specifies acceptable data loss and recovery time | Backup design cannot be validated without business recovery targets. |
| Canary cohort/window | Owner-run only: named purchasing users first, then MO users | Limits production blast radius while keeping runtime/table operations outside the executor's run. |

---

## 9. Deliverables

1. Baseline/release inventory and dependency map.
2. Security-hardening changes with an authorization matrix and callable-surface report.
3. Backup/restore design and owner-executable runbook; no executor-run restore drill.
4. Shared browser-local draft controller with no schema/server-draft additions.
5. Purchasing local recovery, final-save optimization, and approval locking using existing columns.
6. MO local recovery shared by both entry surfaces, with stable client-local nested identities.
7. Static audit evidence matrix; no unit-test additions or execution.
8. Static performance/service-call analysis and an owner measurement worksheet.
9. Owner-executable staging, canary, production, and rollback checklist.

---

## 10. Definition of done

This program is complete only when:

- the public Apps Script surface is explicitly inventoried and supported by line-cited static evidence;
- every artifact/download path is fail-closed for login, tenant, page, and record scope;
- blank-password account claiming and disabled-company bypasses are closed;
- backup/restore design covers all authoritative data, while actual restore proof is marked owner-only/unproven;
- purchasing and MO local drafts are namespaced to user/company/device and have zero pre-commit business-table effect by construction;
- purchasing and both MO entry surfaces use the shared local-draft contract;
- final commits preserve current validation and are optimized using existing keys/locks, with schema-dependent partial-failure limitations recorded;
- no unit test has been created, modified, deleted, or run, and the static evidence matrix is complete;
- no schema has been changed and no executor action has added, edited, or deleted table data;
- performance and canary results are explicitly owner-only and not claimed by the executor;
- the owner receives a reproducible release package and rollback procedure.

Anything less is a partial phase result, not a production-ready completion claim.
