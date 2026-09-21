# Execution prompt for gpt-5.6-luna

You are working in `D:\Work\Script`.

Your task is to fully implement the plan in:

`D:\Work\Script\COMPANY_TWO_FILE_JS_CONSOLIDATION_PLAN.md`

Read that plan completely before changing any file. Treat it as the authoritative specification. This is an implementation task, not another planning or analysis task. Continue through all locally executable phases until the repository satisfies the target or you encounter a blocker that cannot safely be resolved from the workspace.

## Required final structure

The root must finish with exactly nine deployed `.js` files:

1. `Code.js`
2. `Company_Assessment_Actions.js`
3. `Company_Assessment_Registry.js`
4. `Company_TopChemical_Actions.js`
5. `Company_TopChemical_Registry.js`
6. `Company_TopLight_Actions.js`
7. `Company_TopLight_Registry.js`
8. `Company_ValleyFoods_Actions.js`
9. `Company_ValleyFoods_Registry.js`

All code shared by multiple companies belongs in clearly labeled sections of `Code.js`. All executable company-specific code belongs in that company's Actions file. Each Registry file must remain declarative, side-effect free, and limited to company registration metadata and references to Actions hooks.

Do not satisfy the count by deleting behavior, duplicating shared code into company files, weakening tests, or leaving a second implementation in an excluded folder.

## Safety and workspace rules

- The working tree is already heavily modified. Treat every existing change as user-owned.
- Begin with `git status --short` and a file inventory. Never use `git reset --hard`, `git checkout --`, `git clean`, a broad restore, or any command that discards unrelated work.
- Do not create a new branch, commit, push, deploy, run `clasp push`, install triggers, call live Apps Script functions, or write to live Sheets, Drive, Firestore, or MySQL.
- Do not access or copy credential material, including `Fire base json key/`.
- Use `apply_patch` for deliberate source edits. Formatting or generated-preview commands may update their documented generated outputs.
- Do not alter schemas, spreadsheet headers, table names, SQL schemas, company IDs, page IDs, action names, request/response shapes, Drive paths, cache/property keys, trigger names, or authorization behavior.
- Do not change business behavior merely to make consolidation easier.
- Preserve Apps Script V8 compatibility. Do not introduce ES modules, imports, a bundler, or a required build step.
- Avoid global-name collisions and fragile top-level initialization. Company registration must remain lazy through `ensureCompaniesRegistered_()`.
- Never keep two production implementations of the same function during a completed phase.

## Baseline and recovery

Before implementation:

1. Read `.clasp.json`, `.claspignore`, `package.json`, the current root `.js` files, and all verification runners that explicitly load source filenames.
2. Record the initial root `.js` inventory, sizes, SHA-256 hashes, top-level globals, API routes, registered company actions, public Assessment actions, page/access/table mappings, artifact routes, and declared trigger handlers.
3. Save a scoped baseline manifest under `.codex/company_two_file_baseline/`. If exact source copies are needed for differential tests, copy only explicitly scoped source files; never copy credentials or unrelated directories.
4. Run and record:
   - `npm run verify`
   - `npm run ui_check`
   - `npm run preview`
5. If the starting baseline fails, diagnose and record each failure. Do not reset snapshots or weaken assertions merely to make the baseline green. Distinguish pre-existing failures from regressions introduced by this task.

Implement one plan phase at a time. After each phase, run its targeted checks and the aggregate verification. If a phase regresses behavior, repair that phase before continuing. Restore only files changed by the failed phase if rollback is necessary.

## Implementation requirements

### 1. Add the structural boundary verification first

Create `tools/verify/company_two_file_boundary.js` and register it as a required check in `tools/verify/run_all.js`.

It must fail when:

- the root contains a deployed `.js` file outside the nine-file allowlist;
- a company lacks exactly one Actions and one Registry file;
- an obsolete standalone source filename is still referenced by runtime code, tests, preview tooling, or `.clasp.json`;
- a Registry contains I/O calls, action implementations, or executable business logic;
- non-allowlisted company business identifiers remain in shared `Code.js`.

Use a small, documented allowlist for unavoidable bootstrap references, company registry calls, and fixtures. Do not make the allowlist so broad that it hides company logic in `Code.js`.

### 2. Move company-owned standalone modules

Follow Phases 1-7 of the plan in order:

- Move the Assessment-only read algorithms into `Company_Assessment_Actions.js`, update real tests to load the canonical Actions implementation, then remove `JS_Simplification_Helpers.js`.
- Move company theme generators into the appropriate Actions files. Keep only generic theme selection/fallback in `Code.js`. Add registry hooks and prove CSS equivalence before removing `Theme_Builders.js`.
- Move the complete box-analysis engine into `Company_TopChemical_Actions.js`. Keep one canonical implementation and update tests to execute it from the Actions file before removing `Box_Analysis_Engine.js`.
- Split `DbLive_Connector.js` by ownership. Move all Top Chemical SQL/report/cache families into `Company_TopChemical_Actions.js`; move only generic DB Viewer connection/CRUD/sanitization infrastructure into `Code.js`. Preserve parameter binding, cleanup, pagination, caches, error shapes, and authorization. Remove `DbLive_Connector.js` only after all callers and tests are updated.
- Move company approval definitions, action/document maps, aliases, and transition policies out of the shared data layer and into the relevant Actions files. Keep the generic engine in `Code.js` and read immutable policy through registered hooks. Add a differential policy test.
- Move company attachment policy and company artifact/report handlers out of shared routing and into the relevant Actions files. Keep generic authorization, Drive delivery, and routing in `Code.js`. Preserve every existing URL, MIME type, filename, fallback order, and access check.
- Move remaining Top Chemical global report helpers inside `TopChemical`. Reduce other company globals where safe without changing initialization semantics. Derive shared backup company data from the company registry.

Do not expose private internals merely for production convenience. A guarded test hook is acceptable when necessary, but tests must exercise the same implementation production uses.

### 3. Consolidate shared runtime source into `Code.js`

Only after company-specific logic has been extracted, merge the shared modules into `Code.js` in the dependency order specified by the plan:

1. Configuration and registry bootstrap.
2. Storage configuration, schema, Firestore, and system store.
3. Generic data access.
4. Security and authorization.
5. Administration and generic themes.
6. Generic DB Viewer infrastructure.
7. Routing, rendering, and artifact delivery.
8. Telemetry and logging.
9. Runtime backups and retention.

Preserve function names and semantics. Add a concise table of contents and consistent searchable banners in `Code.js`. Do not mechanically concatenate files without checking duplicate declarations, top-level initialization, lexical declarations, source-order assumptions, and test harness extraction logic.

After each shared module is successfully merged and verified, remove its standalone root file and update all hard-coded source lists.

### 4. Handle non-runtime/manual files correctly

- `08_Staging.js` and `99_AuditTools.js` are needed for consolidation verification. Keep them until their checks are complete.
- `09_Inventory.js` is a manual analysis utility.
- At the final cleanup, move these three files to an excluded directory such as `tools/apps_script_maintenance/` and add a README explaining that they are editor-run Apps Script utilities, why they are excluded from production deployment, and how an operator can temporarily load them into a maintenance/staging Apps Script project.
- Ensure `.claspignore` excludes that location and the root no longer contains those files.
- `TEMP_FirestoreAuthorization.js` is a one-time function with no repository caller. Do not claim that live authorization succeeded unless reliable evidence exists. If completion cannot be proven locally, preserve it in the excluded maintenance directory with a clear pending-confirmation note; do not merge it into production `Code.js`. If reliable existing evidence proves completion, remove it.

### 5. Update deployment and tooling references

- Reduce `.clasp.json` `filePushOrder` to the nine canonical files and preserve a safe logical order.
- Update every test, preview builder, source reader, comment, fixture description, and documentation reference that names a removed source file.
- Regenerate `design_preview/_sources.js` only through `npm run preview`.
- Do not copy excluded `src_html/`, `Backup/`, or `assessment center/` implementations back into runtime source. Compare only when needed to confirm ownership; label/archive stale copies as described in the plan.

## Mandatory behavioral invariants

Preserve all of the following exactly unless an existing test proves a documented correction is required:

- Company IDs, route names, action strings, public Assessment allowlists, pages, templates, and access levels.
- Tenant isolation, session checks, role hierarchy, kill switch, cost visibility, super-admin gates, and artifact authorization.
- Sheet/table/header names, ID generation, date interpretation, formulas, SQL identifiers, Drive folders, and storage selection.
- Write locks, duplicate/idempotency behavior, approval transitions, audit/history queues, mutation stamps, cache invalidation, and table versions.
- Download parameters, response shapes, filenames, MIME types, print/export output, and client-facing error behavior.
- Trigger entry-point names and backup/retention behavior.
- Box parser/matcher/risk behavior, Assessment scoring and public candidate behavior, Top Chemical live SQL results, and all Valley/Top Light financial and inventory rules.

## Verification requirements

Run targeted tests after every phase and, at minimum, complete all of these before declaring local completion:

- Syntax parsing for all nine root `.js` files.
- `npm run verify` with zero missing or skipped required checks.
- `npm run ui_check`.
- `npm run preview`.
- The new two-file boundary check.
- Before/after equality for global entry points, API routes, company action inventories, public actions, page/access/table mappings, and trigger handler names.
- Box, Assessment, DB-live, attachment, request-guard, backup, retention, telemetry, and simplification checks against the canonical new file locations.
- A final `rg` scan proving removed filenames and obsolete implementations have no active references.
- A final root inventory proving exactly the nine required `.js` files remain.

Do not fabricate live staging, trigger, schema, Firestore, SQL, or deployment evidence. Local completion may be reported with those live checks explicitly pending. Do not deploy to obtain them.

## Required deliverables

1. The implemented source and updated verification/tooling files.
2. Exactly nine root `.js` files.
3. Excluded maintenance utilities and their README.
4. `D:\Work\Script\COMPANY_TWO_FILE_JS_CONSOLIDATION_RESULTS.md` containing:
   - scope and safety statement;
   - initial and final root file inventories/counts;
   - phase-by-phase changes;
   - moved symbols and deleted/archived files;
   - `Code.js` section map;
   - updated hooks and ownership boundaries;
   - every command run and its result;
   - baseline failures versus introduced regressions;
   - unresolved risks and live checks still pending;
   - rollback guidance.

## Completion behavior

Work autonomously through the complete local implementation. Do not stop after describing what should be done. Ask the user only when a missing decision would materially change behavior or when safe progress is impossible.

At the end, provide a concise outcome-first summary with:

- the final `.js` count and exact file list;
- tests and results;
- files archived or deleted;
- any live/staging/deployment checks still pending;
- links to the plan and results report.

Do not say the task is complete if required local tests fail, if more than nine root `.js` files remain, or if company-specific behavior is still implemented in shared `Code.js` outside the documented allowlist.
