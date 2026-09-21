# Firestore configuration fix results

Date: 2026-09-11

## Root cause

The deployed application selected Firestore by default but only read `FIRESTORE_PROJECT_ID` from Apps Script Script Properties. Missing properties therefore surfaced as a generic configuration error, while `readScriptProperty_()` hid property-access failures as if a property were absent. System logging resolved storage outside its protection, so a logging/configuration failure could mask the original router result.

## Changes

- `02_StorageConfig.js`: distinguishes property access, backend, and configuration errors; trims and validates project/database/environment values; does not cache invalid configuration; adds private read-only `firestoreConfigurationPreflight_()` with bounded request and redacted categorized failures.
- `Code.js`: wraps storage resolution, value formatting, backend selection, and Sheets/Firestore writes in non-fatal system logging protection. The original handler error/result remains authoritative.
- `tools/verify/firestore_configuration_contract.js`: covers missing/blank/trimmed IDs, backend and database/environment validation, property failures, no request on configuration failure, preflight behavior, and router/telemetry safety guards.
- `tools/verify/run_all.js`: registers the focused test.
- `FIRESTORE_READ_WRITE_IMPLEMENTATION_RESULTS.md`: documents per-project Script Properties and the staged verification sequence.

## Before / after

Before, inaccessible Script Properties looked like missing configuration and a failure while resolving `systemStorageTarget_()` could escape `apiRouter_()`. After, failures have stable codes (`STORAGE_CONFIGURATION_ERROR`, `STORAGE_PROPERTY_ACCESS_ERROR`, `STORAGE_BACKEND_ERROR`), preflight is read-only/private, and secondary logging/reporting cannot replace the original controlled response. Company routing remains spreadsheet-backed.

## Verification

- `node tools/verify/firestore_configuration_contract.js`: pass.
- `node tools/verify/fs_storage_contract.js`: pass.
- `node tools/verify/run_all.js`: 2 of 76 checks failed in pre-existing UI preview checks (`ui1_num.js`, `ui2_themes.js`) because their build tries to write protected `design_preview/_sources.js`; all other checks, including both Firestore checks, passed.
- Root JavaScript syntax check: pass for all root `.js` files.
- No live Firestore reads or writes were performed by this change; live access, IAM, database path, indexes, and deployment identity remain unverified.

## Required test properties

```text
SYSTEM_STORAGE_BACKEND=firestore
FIRESTORE_PROJECT_ID=erp-project-3cae0
FIRESTORE_DATABASE_ID=(default)
ERP_ENVIRONMENT=staging
```

Each Apps Script project must set these independently because `clasp push` does not upload Script Properties. Verify the project ID before production.

## Remaining operator steps

Push source, set test properties, retain datastore scope, verify deploying-identity IAM, run the private preflight, update/create a test deployment, and test login, dashboard, permissions, system flag, sessions, and company dispatch. Only address indexes when Firestore reports a missing index. Do not enable production until staging verification succeeds.
