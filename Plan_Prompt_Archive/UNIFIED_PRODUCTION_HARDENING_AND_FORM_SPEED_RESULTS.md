# Unified production hardening and form-speed execution results

Status: **code-complete only for the items below; not production-verified.**

Execution date: 2026-09-11. Branch: `feat/sales-and-saves`.

## Phase 0 — baseline and constraints

| Requirement | Status | Static evidence / residual risk |
|---|---|---|
| Dirty-tree boundary | SATISFIED BY STATIC EVIDENCE | Started with pre-existing modifications/deletions across core, ValleyFoods, TopChemical, UI, preview, and `tools/verify` files. This execution preserved them; no reset, checkout, clean, deploy, push, or commit was performed. |
| Deployment/login design | SATISFIED BY STATIC EVIDENCE | `appsscript.json` retains `USER_DEPLOYING` and `ANYONE_ANONYMOUS`; this remains owner-approved login reachability, not a defect. |
| Local draft privacy decision | BLOCKED BY NO-SCHEMA CONSTRAINT / OWNER DECISION REQUIRED | The plan requires explicit acceptance before purchasing cost fields enter `localStorage`. No acceptance is present, so no browser-local purchasing/MO draft controller or local cost persistence was added. |
| Baseline deployment, properties, triggers, IDs and live timings | UNPROVEN — OWNER RUNTIME CHECK REQUIRED | `clasp status` was inspected only. No live configuration/data read, save, backup, or trigger action was performed. |

## Phase 1 — callable-surface containment

| Requirement | Status | Static evidence / residual risk |
|---|---|---|
| Operational helpers are not directly callable | SATISFIED BY STATIC EVIDENCE | Staging, inventory, audit/schema, MySQL setup, restore, rebuild, and administrative route handlers now use underscore-private names in `08_Staging.js`, `09_Inventory.js`, `99_AuditTools.js`, `DbLive_Connector.js`, `Company_TopChemical_Actions.js`, and `05_Admin.js`. `Code.js` routes only private handlers. |
| Existing time-trigger compatibility without RPC exposure | SATISFIED BY STATIC EVIDENCE | `Code.js:380` verifies a native trigger UID/handler pair; `07_Backup.js:45` and `10_Retention.js:36` retain the configured public trigger names but reject non-trigger calls. Owner must verify existing installed triggers still invoke these wrappers. |
| Backup routed command | SATISFIED BY STATIC EVIDENCE | `07_Backup.js:80` requires the authenticated super-admin dispatcher; `Code.js:355` points the route to that private handler. |
| Runtime reachability denial | UNPROVEN — OWNER RUNTIME CHECK REQUIRED | Owner must attempt direct RPC calls to former maintenance names and run the approved trigger checklist. |

## Phase 2 — authorization hardening

| Requirement | Status | Static evidence / residual risk |
|---|---|---|
| Disabled company gate | SATISFIED BY STATIC EVIDENCE | `03_Security.js:65` checks at login, `03_Security.js:144` checks during session authentication, and `03_Security.js:613-663` resolves/caches only enabled company records. Explicit `FALSE`/disabled values deny access while blank legacy cells retain their prior enabled behavior. `Code.js:395-413` applies the same gate before artifacts. Owner must prove existing-session denial at runtime. |
| Blank-password self-claim | SATISFIED BY STATIC EVIDENCE | `03_Security.js:68-70` refuses blank password hashes; `03_Security.js:100-104` disables first-time self-claim. New accounts require an administrator-supplied reset password in `05_Admin.js:101-105`, using the existing hash/salt fields. |
| Central artifact authorization | SATISFIED BY STATIC EVIDENCE | `Code.js:395-413` derives tenant from server identity/fixed policy, checks enabled company and page access. It is called by product/production barcode and print-file paths (`Code.js:1133`, `1767`, `1850`), payroll (`Company_TopChemical_Actions.js:5596`), budget print (`Company_TopChemical_Actions.js:5871`), and ERP invoices (`05_Admin.js:566`). Runtime cross-tenant/role denial remains owner-only. |
| Ambiguous Drive attachment/file lookup | SATISFIED BY STATIC EVIDENCE | `Code.js:1737` resolves only a syntactically valid immutable Drive ID; filename search was removed. `Code.js:1882-1894` disables the generic attachment route because existing callers provide unbound paths/names rather than a record-bound immutable association. Restoring it is **BLOCKED BY NO-SCHEMA CONSTRAINT** unless the owner identifies an existing immutable record association. |
| `valley_cost_view` semantics | SATISFIED BY STATIC EVIDENCE | No change was made to its resolver/bootstrap. Purchasing still rejects cost-blind writes at `Company_ValleyFoods_Actions.js:4500-4502` (current line region after additions). Owner must exercise cost-bearing paths. |

## Phase 3 — observability, release and recovery

| Requirement | Status | Static evidence / residual risk |
|---|---|---|
| Browser error route | SATISFIED BY STATIC EVIDENCE | `UI_Components.html:857-874` uses `API.call('log_client_error', ...)`, not a private server function. `Code.js:1097-1125` sanitizes token/password/email-like text, attributes a valid optional session, rate-limits, and refuses to create a missing log table. Wiring/runtime delivery is owner-only. |
| Stale `s5c_sales_audit` assertion | SATISFIED BY STATIC EVIDENCE | Documented verification debt; no `tools/verify/*` file was modified or executed. |
| Backup/restore design | UNPROVEN — OWNER RUNTIME CHECK REQUIRED | Existing CSV backup is values-only and cannot establish RPO/RTO, formula/format/validation, Drive, or MySQL recovery. Owner must supply RPO/RTO and execute an isolated restore runbook; this executor made no backup/restore call. |

## Phase 5 — purchasing

| Requirement | Status | Static evidence / residual risk |
|---|---|---|
| Purchasing page table watch coverage | SATISFIED BY STATIC EVIDENCE | `Company_ValleyFoods_Actions.js:283-294` maps all purchasing actions to the existing header/line tables, allowing the existing derived `PAGE_TABLES` mechanism to watch both. |
| Approved record lock | SATISFIED BY STATIC EVIDENCE | `Company_ValleyFoods_Actions.js:4510-4521` refuses ordinary saves when either financial or quality approval is already `Approved`; no reopen transition was invented without an existing audited state. |
| Bulk final-save path | SATISFIED BY STATIC EVIDENCE | Existing final save remains routed and uses batch ID allocation/matrix `setValues` at `Company_ValleyFoods_Actions.js:4635-4688`; no endpoint was invoked. It still rewrites child lines because the current schema lacks a stable persisted line key, so retry/partial-commit safety is **UNPROVEN — OWNER RUNTIME CHECK REQUIRED** and a durable commit journal remains **BLOCKED BY NO-SCHEMA CONSTRAINT**. |
| Browser-local purchasing drafts | BLOCKED BY OWNER DECISION REQUIRED | No cost-bearing `localStorage` persistence was added without explicit privacy/XSS acceptance. |

## Phase 6 — manufacturing orders

| Requirement | Status | Static evidence / residual risk |
|---|---|---|
| Shared browser-local MO controller and canonical payload | BLOCKED BY OWNER DECISION REQUIRED | The same owner decision gates the shared local draft infrastructure. No server draft endpoint or business-table checkpoint was added. |
| Stable final numbering / child retry durability | BLOCKED BY NO-SCHEMA CONSTRAINT | No backfill or new durable commit/state field is permitted. Owner runtime validation is required for current final-save behavior. |

## Phase 7–8 — performance and handover

Final purchasing save static service-call map: validation reads the header/line data once, builds line maps in memory, reserves a batch of line IDs once, and issues one line-matrix `setValues`; header update/create and existing line replacement remain separate existing business writes. This is a static rationale only—no timing, p95, concurrency, retry, or performance claim is made.

Owner-only checklist: verify direct maintenance denial and trigger execution; disabled-company existing sessions; artifact permissions by role/company; blank-password refusal and admin reset; error reporting; attachment remediation once an immutable existing association is identified; purchasing approval lock, duplicate/total/cost checks, retries and partial failure; both MO surfaces; local draft behavior only after the privacy decision; backup restore in isolation; staged canary and rollback.

## Commands and change record

Static commands run: `Get-Content` for both controlling documents and affected flows; `git status --short --branch --untracked-files=no`; `git diff --name-status`; `git diff --check`; `npx clasp status`; targeted `rg`; and `node --check` for every touched standalone JavaScript file. All `node --check` commands and `git diff --check` completed successfully (Git emitted only existing CRLF warnings).

Files changed by this execution:

- `03_Security.js`
- `05_Admin.js`
- `07_Backup.js`
- `08_Staging.js`
- `09_Inventory.js`
- `10_Retention.js`
- `99_AuditTools.js`
- `Code.js`
- `Company_TopChemical_Actions.js`
- `Company_ValleyFoods_Actions.js`
- `DbLive_Connector.js`
- `UI_Components.html`
- `UNIFIED_PRODUCTION_HARDENING_AND_FORM_SPEED_RESULTS.md`

Explicit confirmations: no unit tests, fixtures, mocks, test harnesses, or `tools/verify/*` scripts were created, modified, or run; no schema was changed; no table data was added, edited, deleted, read live, restored, seeded, or migrated by the executor; and nothing was deployed, pushed, committed, or staged. Pre-existing unrelated dirty-tree changes were preserved.
