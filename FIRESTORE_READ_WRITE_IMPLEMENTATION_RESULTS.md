# Firestore read/write implementation results

Date: 2026-09-11

## Outcome

The local implementation for the first release is in place. ERP Information system data is routed through a typed Firestore REST repository when `SYSTEM_STORAGE_BACKEND=firestore`; Top Light, Top Chemical, Valley Foods, and Assessment Center business tables remain on their existing company spreadsheets. No import, copy, re-key, deployment, trigger installation, IAM change, or production data mutation was performed.

## Phase status

| Phase | Result |
| --- | --- |
| F0 contract inventory | Completed from the source and existing migration utilities. Existing collection names and business keys are mapped in `02_SystemSchema.js`. Live collection/type/index/IAM discovery remains unverified. |
| F1 storage foundation | Completed locally: configuration, typed REST adapter, exact document metadata, quoted field paths, pagination cursors, retries, metrics, update-time preconditions, explicit Sheets adapter, and deployment exclusions. |
| F2 reads/authentication | Completed in source: users, companies, role matrix, pages, kill switch, sessions/devices, shared branding, and shared currency reads use the system repository. Company dispatch still resolves spreadsheet IDs. |
| F3 writes/administration | Completed in source: system CRUD, views, invoices/print, currency controls, counters, legacy login writes, and cache invalidation use repository operations. Existing response shapes are retained. |
| F4 operations | Completed locally: history queue enqueue/claim/retry, logs, telemetry, session cleanup, retention/archive mappings, staging guard, system inventory descriptor, and backup separation. Firestore native export/restore still requires operator setup and rehearsal. |
| F5 integration release | Pending operator verification. The source is not deployed and production activation was intentionally not attempted. |
| F6 future-company seam | Completed as a supported Sheets company descriptor and shared repository boundary; no company business conversion was performed. |

## Main files added or changed

- `02_StorageConfig.js`, `02_SystemSchema.js`, `02_Firestore.js`, `02_SystemStore.js`: configuration, schema mappings, REST adapter, and repositories.
- `02_DataAccess.js`, `03_Security.js`, `05_Admin.js`, `Code.js`, `Code_Telemetry.js`, `Theme_Builders.js`, `99_AuditTools.js`: system reads/writes and background paths.
- `07_Backup.js`, `08_Staging.js`, `09_Inventory.js`, `10_Retention.js`: backend-aware operations.
- `Company_TopLight_Actions.js`, `Company_TopChemical_Actions.js`, `Company_ValleyFoods_Actions.js`, and Valley HR modules: shared system dependencies only; company business storage remains Sheets.
- `.clasp.json`, `.claspignore`, `00_Config.js`, `appsscript.json`: load order, key exclusion, configuration defaults, and datastore OAuth scope.
- `tools/firestore/indexes.json`: candidate composite indexes; these are not confirmed or deployed.
- `tools/verify/fs_storage_contract.js`: offline adapter contract coverage, registered in `tools/verify/run_all.js`.

## Verification

- `node tools/verify/run_all.js`: **All 75 checks pass.**
- Root JavaScript syntax parse: **pass**.
- New offline Firestore contract: typed blank/zero/false/null/date/map/array round trips, exact field-path quoting, transient retry, ordered cursor pagination, and update-time patch preconditions: **pass**.
- No Firestore emulator or staging project was available/configured during this run, so live REST query execution, transaction behavior, indexes, OAuth/IAM, collection field types, and restore usability are not claimed as verified.

## Required operator configuration

Every Apps Script project has its own Script Properties. `clasp push` uploads source only; it does not upload these properties. Configure the test deployment with:

```text
SYSTEM_STORAGE_BACKEND=firestore
FIRESTORE_PROJECT_ID=erp-project-3cae0
FIRESTORE_DATABASE_ID=(default)
ERP_ENVIRONMENT=staging
```

Verify that project ID before any production use. The safe sequence is: push source; set the test Script Properties; retain the datastore OAuth scope; verify deploying-identity IAM; run the private read-only configuration preflight; update or create the test deployment; test login, dashboard, permissions, system flag, sessions, and company dispatch; and address indexes only when Firestore reports a missing index.

Set Script Properties in the target deployment before enabling the release:

```text
SYSTEM_STORAGE_BACKEND=firestore
FIRESTORE_PROJECT_ID=<verified Firestore project id>
FIRESTORE_DATABASE_ID=(default)
ERP_ENVIRONMENT=staging   # use production only after staging sign-off
```

The deploying identity must have the required Firestore IAM permissions, and the Apps Script deployment must retain `https://www.googleapis.com/auth/datastore`. Confirm the candidate indexes in staging against actual query errors and field types; do not blindly apply the manifest.

Configure native Firestore export/import to an approved bucket and perform an isolated restore drill. CSV backups remain for company spreadsheets; they are not a typed Firestore backup.

## Release and rollback notes

1. Verify existing collections and document identities read-only in staging.
2. Configure a separate staging Firestore target and explicit company staging links.
3. Deploy the tested source and install only the required staging triggers.
4. Exercise login, role/status changes, admin CRUD, sessions, views, invoices/print, currency, history queue, logs, telemetry, retention, backup reporting, and company dispatch.
5. Activate production only after those checks and index/IAM/export sign-off.

Application rollback after Firestore writes must use a previous Firestore-capable release or disable affected writes while repairing the integration; switching to the old system spreadsheet would expose stale data.

## Limitations

- Live Firestore discovery and staging integration were deliberately not run, so the configured project, existing field casing/types, indexes, IAM, and native restore are unverified.
- Company-sheet writes and Firestore system audit writes cannot be one atomic cross-database transaction. The durable Firestore history queue makes failures observable and retryable; it does not claim cross-backend exactly-once atomicity.
- The index file is a candidate manifest, not a deployment instruction. Missing-index errors remain visible from the adapter.
- Existing unrelated dirty-worktree changes were preserved; this implementation did not clean, reset, or delete them.
