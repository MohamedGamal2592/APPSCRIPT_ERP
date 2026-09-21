# Company JavaScript two-file consolidation plan

Date: 2026-09-20  
Status: Planning only; no runtime source is changed by this document.

## 1. Objective

Reduce every company to exactly two deployed JavaScript files:

1. `Company_<Company>_Registry.js` — declarative registration only.
2. `Company_<Company>_Actions.js` — all executable code and private helpers owned by that company.

The four required pairs are:

| Company | Registry | Actions |
| --- | --- | --- |
| Top Light | `Company_TopLight_Registry.js` | `Company_TopLight_Actions.js` |
| Top Chemical | `Company_TopChemical_Registry.js` | `Company_TopChemical_Actions.js` |
| Valley Foods | `Company_ValleyFoods_Registry.js` | `Company_ValleyFoods_Actions.js` |
| Assessment Center | `Company_Assessment_Registry.js` | `Company_Assessment_Actions.js` |

All JavaScript used by more than one company will be unified physically in `Code.js`. The final deployed JavaScript set will therefore contain **nine files total**: `Code.js` plus the eight company files above. Shared authentication, routing, persistence, backup, telemetry, and audit code must be organized as internal sections of `Code.js`, never copied into every company Actions file.

## 2. Current state

- The root currently contains 30 `.js` files that can be part of the Apps Script project.
- The four companies already have the correct eight `Company_*.js` filenames.
- The remaining issues are ownership and physical fragmentation: some company business logic, policies, SQL functions, attachment definitions, and themes still live in shared or standalone files, while cross-company infrastructure is spread across many shared files.
- `src_html/`, `Backup/`, `assessment center/`, `tools/`, and `design_preview/` are excluded or local-only. Their `.js` files do not count toward the deployed two-file rule, but stale copies must be clearly archived or removed from developer workflows after comparison.
- The working tree already contains unrelated changes. Implementation must preserve them and must not use a broad reset, checkout, clean, or generated overwrite.

### File-use audit

A repository-level caller/route/trigger scan identified these special cases:

| File | Observed use | Decision |
| --- | --- | --- |
| `TEMP_FirestoreAuthorization.js` | `authorizeFirestoreAccess()` is referenced only by its own definition. It has no router entry, trigger installer, UI caller, or verification caller. Its header explicitly says to run it once and then delete it. | Strong deletion candidate. Confirm the Firestore scope/preflight has already succeeded, then delete it instead of merging it. |
| `08_Staging.js` | Its three functions are referenced only inside the file. They are documented editor-run, one-off staging helpers. | Not production runtime code. Keep through staging verification, then archive under an excluded maintenance-tools location rather than merge into `Code.js`. |
| `09_Inventory.js` | Its inventory/report functions are referenced only inside the file. They are documented manual analysis commands. | Not production runtime code. Archive under an excluded maintenance-tools location after the consolidation baseline is captured. |
| `99_AuditTools.js` | Its snapshot/access-audit/test-user functions are referenced only inside the file. They are manual release/audit commands. | Use during consolidation verification, then archive under an excluded maintenance-tools location instead of merge into `Code.js`. |

This is static repository evidence. An editor-run function can be useful without a source caller, and installed Apps Script triggers cannot be proven from the local tree alone. Before deletion or archival, inspect installed triggers and confirm the owner does not rely on direct editor execution.

The remaining root `.js` files have a production route, company registration/action caller, shared dependency caller, declared trigger path, or a clear operational runtime role. The two backup files are not duplicates: `07_Backup.js` provides scheduled CSV backup, while `11_DailyBackup.js` provides native spreadsheet-copy backup and downloadable XLSX/ZIP recovery artifacts.

Approximate current sizes of the company pairs:

| Company | Actions lines | Registry lines |
| --- | ---: | ---: |
| Assessment Center | 1,211 | 41 |
| Top Chemical | 7,038 | 58 |
| Top Light | 3,872 | 47 |
| Valley Foods | 11,550 | 87 |

Large action files and a large `Code.js` are accepted by this goal. The purpose is a clear ownership boundary and exactly nine deployed JavaScript modules, not an arbitrary line-count limit.

## 3. Final ownership rules

### Registry file may contain

- Company unique ID and display metadata.
- Page and template catalog.
- Table catalog.
- References to the company's dispatcher and optional hooks exposed by its Actions namespace.
- Declarative registration data required by shared infrastructure.

The registry must not perform spreadsheet, Drive, SQL, Firestore, cache, or network I/O. It must not contain report calculations, validators, formatters, or action handlers.

### Actions file must contain

- The company namespace/IIFE.
- Authenticated and public action handlers owned by the company.
- Company-specific validation and authorization policy.
- Company-specific sheet/table constants and workflow transitions.
- Company-specific SQL queries/adapters.
- Company-specific attachment definitions.
- Company-specific theme generation.
- Company-specific report, print, export, cache, matching, and parsing helpers.
- Private submodules inside the same file when useful. Valley Foods may retain several internal IIFEs, but they remain physically inside its one Actions file.

### `Code.js` must contain all shared JavaScript

- Generic routing, authentication, authorization engine, storage adapters, audit logging, caching primitives, backups, telemetry, and admin operations.
- Generic algorithms only when at least two companies genuinely use the same behavior and contract.
- Generic engines that accept company policy/configuration from the registry or Actions hook.
- Configuration, shared registry bootstrap, data access, Firestore, storage configuration, system schema/store, security, administration, runtime backup/retention, telemetry, generic theme resolution, and generic database viewer functions.

No other shared root `.js` file may remain at completion. `Code.js` must not hard-code a company's page IDs, sheet names, workflow states, attachment folders, SQL report queries, or business validation rules. A small documented allowlist is permitted for the four registry bootstrap calls and test fixtures.

Use clear section banners and a table of contents inside `Code.js` so physical unification does not make navigation ambiguous. Suggested section order:

1. Configuration and system constants.
2. Shared registry/bootstrap.
3. Storage configuration, system schema, and system store.
4. Firestore and data-access engines.
5. Security and authorization.
6. Administration and generic themes.
7. Generic database viewer/SQL infrastructure.
8. Routing, page rendering, and artifact delivery.
9. Telemetry and logging.
10. Backup, retention, and runtime operational functions.

## 4. Source-to-destination migration matrix

| Current location | Current ownership issue | Destination | Planned result |
| --- | --- | --- | --- |
| `JS_Simplification_Helpers.js` | Its two algorithms are used only by Assessment Center | `Company_Assessment_Actions.js` | Move the functions inside `AssessmentCenter`; delete the standalone helper after tests use the Actions file |
| `Box_Analysis_Engine.js` | Dedicated to `tc_box_analysis` and called by Top Chemical | `Company_TopChemical_Actions.js` | Move `BoxEngine` inside the Top Chemical namespace; preserve a test-only export/hook; delete the standalone file |
| `DbLive_Connector.js` | Mixes generic DB Viewer CRUD with Top Chemical-specific queries | Top Chemical blocks to `Company_TopChemical_Actions.js`; generic DB Viewer block to shared router/admin code | Delete `DbLive_Connector.js` only after every generic and company caller has a new owner |
| `Theme_Builders.js` | Mixes the shared resolver with Top Light, Top Chemical, Valley/default theme rules | Company theme builders to each Actions file; small generic resolver to `Code.js` | Register a `themeCss_` hook per company; delete the standalone theme file |
| `02_DataAccess.js` | Contains company-specific approval rows, action-to-document maps, and state transitions | Company policies to relevant Actions files; generic engines to `Code.js` | Obtain workflow policy through registered company hooks; delete the standalone file |
| `Code.js` attachment registry | Hard-codes Top Chemical and Valley page/sheet/folder contracts | Relevant company Actions files | Keep generic file authorization/download implementation shared; resolve company attachment policy from registry/hooks |
| `Code.js` Top Chemical download/report routes | Global routes directly know Top Chemical sheets and pages | `Company_TopChemical_Actions.js` behind a generic company artifact route | Preserve URLs and response types while removing business logic from `Code.js` |
| `11_DailyBackup.js` company list | Repeats all four company IDs and names | Derive from `COMPANY_REGISTRY` | Keep backup implementation shared; remove the duplicated company catalog |
| `TEMP_FirestoreAuthorization.js` | One-time authorization utility with no source caller | Delete after confirming authorization/preflight was completed | Do not merge completed temporary code into `Code.js` or a company Actions file |
| `00_Config.js`, `01_Registry.js`, `02_StorageConfig.js`, `02_SystemSchema.js`, `02_Firestore.js`, `02_SystemStore.js` | Shared bootstrap/storage infrastructure | Matching ordered sections in `Code.js` | Delete all six standalone files after merge and initialization tests |
| `03_Security.js`, `05_Admin.js` | Shared security/admin infrastructure | Matching sections in `Code.js` | Preserve all global function names and generated output; delete standalone files |
| `07_Backup.js`, `10_Retention.js`, `11_DailyBackup.js` | Shared runtime operational infrastructure | Operational sections in `Code.js` | Derive company data from the registry and delete all three standalone files |
| `08_Staging.js`, `09_Inventory.js`, `99_AuditTools.js` | Manual editor-run maintenance/verification with no runtime callers | Excluded maintenance-tools archive after their consolidation checks are complete | Do not increase production `Code.js` with non-runtime utilities |
| `Code_Telemetry.js` | Shared telemetry | Telemetry section in `Code.js` | Preserve routes, keys, triggers, buffering, and failure behavior; delete standalone file |

## 5. Target interfaces

Each Actions file should expose one stable object. The exact names can stay compatible with the current code:

```js
const TopChemical = (function () {
  // All Top Chemical implementation, including private submodules.
  return {
    dispatch_: dispatch_,
    pageForAction_: pageForAction_,
    tableForAction_: tableForAction_,
    themeCss_: themeCss_,
    attachmentPolicy_: attachmentPolicy_,
    approvalPolicy_: approvalPolicy_,
    artifactHandlers_: artifactHandlers_
  };
})();
```

The registry connects those hooks to shared infrastructure:

```js
registerCompany_(COMPANY_UID, {
  dispatch: TopChemical.dispatch_,
  pageForAction: TopChemical.pageForAction_,
  tableForAction: TopChemical.tableForAction_,
  themeCss: TopChemical.themeCss_,
  attachmentPolicy: TopChemical.attachmentPolicy_,
  approvalPolicy: TopChemical.approvalPolicy_,
  artifactHandlers: TopChemical.artifactHandlers_,
  tables: [/* existing entries unchanged */],
  pages: [/* existing entries unchanged */]
});
```

Shared engines inside `Code.js` read these hooks through `COMPANY_REGISTRY`. They must fail closed when required policy is absent. Avoid top-level registration side effects because Apps Script file evaluation order is easy to make fragile; registration should remain lazy through `ensureCompaniesRegistered_()`.

## 6. Implementation phases

### Phase 0 — Freeze contracts and create the boundary check

1. Record all root `.js` files, top-level global names, action names, public actions, page mappings, table mappings, routes, download parameters, and installed trigger handler names.
2. Capture SHA-256 hashes of files in scope without copying credentials or unrelated working-tree changes.
3. Run and record the current offline baseline:
   - `npm run verify`
   - `npm run ui_check`
   - `npm run preview`
4. Add `tools/verify/company_two_file_boundary.js` and include it in `tools/verify/run_all.js`.
5. The boundary check should assert:
   - Exactly eight deployed root files match `Company_*.js`.
   - Every company has one Registry and one Actions file.
   - The only other deployed root JavaScript file is `Code.js`.
   - No obsolete company-owned standalone file remains.
   - Shared files contain no non-allowlisted company page IDs, sheet names, workflow maps, or business functions.
   - Registry files contain no I/O calls or action implementations.

Exit gate: the inventory is reproducible and current behavior has a recorded baseline. Do not start by concatenating files blindly.

### Phase 1 — Assessment Center low-risk pilot

1. Move `ERPReadAlgorithms_.invitedBatchMembership` and `firstScoreIndex` into `Company_Assessment_Actions.js` as private helpers.
2. Update Assessment verification and benchmark scripts to load the Actions file rather than `JS_Simplification_Helpers.js`.
3. Delete `JS_Simplification_Helpers.js` and remove it from `.clasp.json` push order and every explicit source list.
4. Verify identical handling of duplicate, missing, `undefined`, and empty IDs.

Exit gate: Assessment action/public-action inventories and scoring outputs are byte-for-byte equivalent where serialization is deterministic.

### Phase 2 — Move company themes into their Actions files

1. Separate the generic theme resolver from each company theme generator.
2. Move Top Light, Top Chemical, Valley Foods/default, and Assessment-specific theme code to their Actions files.
3. Add `themeCss` hooks to all four registry entries.
4. Move only the small generic selection/fallback code into the security/admin section of `Code.js`.
5. Update `tools/build_preview.js`, UI theme tests, `.clasp.json`, and design-preview source metadata.
6. Delete `Theme_Builders.js` only after CSS output snapshots match.

Exit gate: generated CSS, company colors, fallback behavior, and preview fingerprint are intentionally identical or have a reviewed documented difference.

### Phase 3 — Merge the Top Chemical box engine

1. Move `BoxEngine` into `Company_TopChemical_Actions.js` before the handlers that use it.
2. Keep it private in production. Expose a guarded test hook or update tests to evaluate the real Actions namespace; do not leave a second production implementation for Node tests.
3. Preserve parser normalization, item clustering, editable-column allowlist, risk tiers, date windows, and result ordering.
4. Update all `box_*` verification scripts and comments that name `Box_Analysis_Engine.js`.
5. Delete `Box_Analysis_Engine.js` and remove every source-list reference.

Exit gate: all box parser, matcher, edit, SQL, window, rules, and wiring tests pass against the code inside Top Chemical Actions.

### Phase 4 — Split and absorb the live database connector

1. Inventory every function in `DbLive_Connector.js` by caller and ownership before moving code.
2. Move Top Chemical-specific families into `Company_TopChemical_Actions.js`:
   - client AR review;
   - client balance sheets;
   - manufacture headers/footers;
   - products-live and stock-scan queries;
   - box analysis SQL;
   - executive sales queries and caches.
3. Keep generic connection, parameter binding, identifier validation, DB Viewer CRUD, and super-admin guards shared by folding that remaining block into the generic database section of `Code.js`.
4. Route company SQL actions through `TopChemical.dispatch_` or a documented private adapter. Do not leave Top Chemical handlers in the generic `apiRouter_` map.
5. Preserve JDBC cleanup, parameter binding, SQL identifiers, pagination, cache keys, and response shapes.
6. Update DB live and box test harnesses to load the new owners.
7. Delete `DbLive_Connector.js` only when `rg` finds no runtime or test dependency on it.

Exit gate: generic DB Viewer routes and every Top Chemical live-data workflow pass independently; no SQL string or authorization gate changes merely because code moved.

### Phase 5 — Remove company policy from shared data access

1. Move approval definitions, action/document mappings, status-transition maps, and company aliases from `02_DataAccess.js` to the owning Actions files.
2. Keep only generic approval, dedupe, validation, lock, and transition engines, then place those engines in the data-access section of `Code.js`.
3. Have the generic engine obtain immutable policy from the registered company hook. Validate duplicate document types/actions during initialization.
4. Preserve special rules for Top Light approval, Valley purchasing quality approval, Valley manufacturing, Valley sales, attendance rollback, and Top Chemical payroll/legal cash.
5. Add a differential policy test that compares every old action, document type, initial state, allowed transition, terminal state, and required role.

Exit gate: permission results, state transitions, lock boundaries, idempotency keys, mutation stamps, and audit writes are unchanged.

### Phase 6 — Move attachments and direct company routes

1. Move each attachment page/sheet/ID/folder definition from `Code.js` into its owning Actions file.
2. Replace hard-coded registry entries with a generic lookup through `COMPANY_REGISTRY`.
3. Convert Top Chemical-specific download/print endpoints in `Code.js` to generic wrappers that resolve a company handler from the registry.
4. Keep public URL parameters, MIME types, filenames, authorization checks, and Drive folder fallback order unchanged.
5. Verify Top Chemical product/registration/carton/import/manufacture/customs attachments and Valley HR deduction/overtime/vacation attachments.

Exit gate: attachment repair, authorization, download, barcode, label, payroll, and budget-print tests pass with no direct company storage contract left in `Code.js`.

### Phase 7 — Normalize remaining company globals and metadata

1. Move Top Chemical's current global payroll/budget print helpers inside the `TopChemical` namespace and expose only the handlers required by generic routing.
2. Keep Valley Foods internal submodules in the same Actions file, but reduce production globals to `ValleyFoods` where practical. Do not combine internal modules when doing so would change initialization or private state.
3. Derive the daily-backup company list from registered companies rather than repeating IDs.
4. Review the security, admin, routing, and data-access sections of `Code.js` with the boundary scanner and resolve every non-allowlisted company reference.
5. Confirm each Registry remains metadata-only after adding hooks.

Exit gate: every company-specific executable path is physically in that company's Actions file; company metadata is physically in its Registry file.

### Phase 8 — Merge every shared module into `Code.js`

Perform this only after company-owned logic has been extracted in Phases 1-7. Merge one logical section at a time in dependency order; do not concatenate all files in one unreviewable change.

1. Merge `00_Config.js` and `01_Registry.js` into the start of `Code.js`.
2. Merge `02_StorageConfig.js`, `02_SystemSchema.js`, `02_Firestore.js`, and `02_SystemStore.js` into their ordered storage sections.
3. Merge the generic remainder of `02_DataAccess.js` after all company policy has been removed from it.
4. Merge `03_Security.js` and `05_Admin.js`, preserving all public/global names and generated CSS/HTML.
5. Confirm the generic DB Viewer remainder and generic theme resolver are already in their designated `Code.js` sections.
6. Merge `Code_Telemetry.js` without changing telemetry route names, caches, sheet names, triggers, or failure handling.
7. Merge `07_Backup.js`, `10_Retention.js`, and `11_DailyBackup.js` into the final operational sections.
8. Use `08_Staging.js` and `99_AuditTools.js` for the required isolation/schema checks, then move them with `09_Inventory.js` to an excluded maintenance-tools archive. Preserve instructions for temporarily loading them into an Apps Script maintenance project when needed.
9. Confirm the Firestore authorization/preflight is complete, then delete `TEMP_FirestoreAuthorization.js`. If it is not complete, run and verify it before deletion; do not retain a completed one-time command in production.
10. After each individual section merge, run syntax and targeted verification before deleting that source file.
11. Add and maintain a top-of-file table of contents and consistent searchable section banners in `Code.js`.

Exit gate: the only shared deployed JavaScript file is `Code.js`, its top-level API matches the pre-merge manifest, and all shared-module tests load it successfully.

### Phase 9 — Remove stale copies and finalize deployment inputs

1. Reduce `.clasp.json` `filePushOrder` to `Code.js` plus the eight company files. Keep Actions before Registry only if a verified tool/deployment behavior requires it; runtime registration must still be lazy and order-safe.
2. Update all explicit source arrays in local tools and tests.
3. Regenerate `design_preview/_sources.js` only through the preview command.
4. Move the completed manual utilities `08_Staging.js`, `09_Inventory.js`, and `99_AuditTools.js` to an excluded maintenance-tools archive with a README describing when and how to use each one.
5. Compare excluded copies under `src_html/`, `Backup/`, and `assessment center/` with the canonical root source. Archive or label them as non-runtime; do not silently merge them back.
6. Remove obsolete files only after references, tests, installed triggers, direct editor-run usage, and deployment inclusion checks are clean.
7. Update `PROJECT_MAP.md` in the archive or create a new current project map describing the two-file rule.

Exit gate: a fresh source inventory has no ambiguous duplicate implementation and the Apps Script push set contains the intended files.

## 7. Verification gates for every phase

Every phase must pass all applicable checks before the next phase starts:

1. Syntax check for every root JavaScript file.
2. `npm run verify` with zero missing or skipped required checks.
3. `npm run ui_check`.
4. `npm run preview` when security/theme/client source lists change.
5. Before/after action manifest equality:
   - action names;
   - public action names;
   - access page and level;
   - table/audit label;
   - request and response fields.
6. Before/after global entry-point equality for `doGet`, `doPost`, triggers, scheduled backup functions, and editor-run maintenance functions.
7. Schema snapshot and isolated staging checks for spreadsheet headers/order, formulas, IDs, dates, audit records, and row counts.
8. A supervised staging deployment that exercises at least one read and one write per company plus all public Assessment actions and Top Chemical live SQL pages.

No production deployment should combine multiple unverified phases.

## 8. Non-negotiable contracts

- Do not rename action strings, page IDs, template names, company IDs, sheet/table names, headers, Drive folders, SQL tables/columns, cache keys, property keys, or response fields during a move.
- Do not change access levels, tenant checks, public-action allowlists, super-admin gates, or artifact authorization.
- Do not change write locks, ID allocation, duplicate prevention, audit logging, history queues, mutation/version stamps, or cache invalidation.
- Do not change trigger function names until installed trigger bindings have been inventoried and a migration is explicitly approved.
- Do not add build tooling or ES modules; the target remains Apps Script V8 with root-level deployed source.
- Do not duplicate shared code into all four Actions files merely to satisfy the filename rule.
- Do not delete excluded historical copies until their ownership and any external deployment use are confirmed.

## 9. Expected file-count effect

The final root JavaScript count is exactly nine deployed files:

- `Code.js`
- Four `Company_*_Actions.js` files.
- Four `Company_*_Registry.js` files.

The consolidation is expected to remove these 21 standalone root files after their contents are moved or retired:

- `00_Config.js`
- `01_Registry.js`
- `02_DataAccess.js`
- `02_Firestore.js`
- `02_StorageConfig.js`
- `02_SystemSchema.js`
- `02_SystemStore.js`
- `03_Security.js`
- `05_Admin.js`
- `07_Backup.js`
- `08_Staging.js`
- `09_Inventory.js`
- `10_Retention.js`
- `11_DailyBackup.js`
- `99_AuditTools.js`
- `JS_Simplification_Helpers.js`
- `Theme_Builders.js`
- `Box_Analysis_Engine.js`
- `DbLive_Connector.js`
- `Code_Telemetry.js`
- `TEMP_FirestoreAuthorization.js`

This reduces the current root `.js` count from 30 to 9 while keeping company code out of the shared file and keeping cross-company code out of the company files.

## 10. Rollback and delivery strategy

- Implement one phase per reviewed commit or checkpoint.
- Preserve a manifest and exact pre-phase copies only for files changed by that phase.
- On failure, restore only the failed phase; never reset the whole dirty working tree.
- Keep old standalone files until the new owner passes tests, then delete them in the same reviewed phase so two implementations cannot drift.
- Deliver a final result report listing moved symbols, deleted files, updated tests, before/after file counts, verification results, staging evidence, and any intentionally retained shared company references.

## 11. Definition of done

The consolidation is complete only when all of the following are true:

- Exactly one Registry and one Actions `.js` file exist for each of the four companies.
- `Code.js` is the only non-company deployed `.js` file.
- No shared implementation remains in another root `.js` file.
- `Code.js` contains no non-allowlisted company-specific business logic.
- Registries are declarative and side-effect free.
- Shared infrastructure obtains company policy through registry/Actions hooks rather than hard-coded company maps.
- Obsolete standalone modules and all references to them are removed.
- Offline verification, UI checks, preview generation, schema comparison, and isolated staging checks pass.
- Action names, routes, access decisions, data writes, reports, downloads, SQL results, triggers, and response contracts remain compatible.
