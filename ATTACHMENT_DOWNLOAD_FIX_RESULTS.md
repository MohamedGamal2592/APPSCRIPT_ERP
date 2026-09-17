# Attachment download repair results

Implemented locally in `D:\Work\Script` on 13 September 2026. No deployment, production migration, company-data read, or company-data write was performed.

## Root cause

The exact user message is returned unconditionally by the archived handler in `.codex/live_429_fix/Code.js`; the current root `Code.js` already has a newer handler. The live `/exec` version was not verified, so the old deployment/response URL remains a material possibility. The current handler also had three local defects: basename fallback could choose the wrong record, an unrelated request `ref` could resolve a cached file after a valid record was found, and migration dry-run proposals were not counted when the ID column was absent.

## Changed files

- `Code.js`: exact record-key authority; exact full-reference matching only; explicit mismatch/ambiguity errors; no request-reference or record-reference cache fallback during download; removed unstable customs row-index fallback; duplicate folder/file lookups now reject non-unique results; print-file downloads require a durable product file ID; authenticated bounded migration accepts `offset`/`limit`, reports missing ID columns and unresolved rows, counts `wouldUpdate` independently of schema presence, skips verified IDs, detects invalid existing IDs and concurrent edits, and writes only on explicit `dryRun:false`.
- `Company_TopChemical_Actions.js`: client file IDs must match the exact upload-reference cache binding; attachment-bearing saves require a resolvable ID and verify ID-column preparation; replacement/removal paths write the corresponding `_id` value, including blank on removal; uploads fail if Drive does not return an ID; duplicate upload folders are rejected.
- `Company_ValleyFoods_Actions.js`: deduction, vacation, overtime saves require durable attachment IDs when a reference is supplied; uploads fail without an ID; duplicate upload folders are rejected.
- `tools/verify/attachment_download.js`: fake Sheets/Drive behavioral harness.
- `ATTACHMENT_DOWNLOAD_FIX_PROMPT_LUNA.md`: this execution prompt.
- `ATTACHMENT_DOWNLOAD_FIX_RESULTS.md`: this result record.

## Verification performed

`node --check Code.js`, `node --check Company_TopChemical_Actions.js`, and `node --check Company_ValleyFoods_Actions.js` passed. The focused harness passed:

`attachment_download: PASS (exact refs, explicit-id authority, ambiguity, migration dry-run, mismatched/cache-safe downloads)`

The harness uses fake records, fake Sheets, fake Drive iterators, and a fake cache. It verifies exact path selection, no basename fallback, missing explicit records do not fall through, duplicate references/folders/files fail, dry-run reports one proposal with missing `document_file_id` and performs zero writes, mismatched refs are rejected, and an unrelated cached ref cannot supply a download ID. No project test suite, deployment, or live route was exercised.

## Scope and limitations

The current root source still contains the pre-existing authenticated router behavior: session touch may patch `ERP_Sessions`, and `logSystemAction_`/performance logging may persist audit/telemetry depending on configuration. The attachment handler itself performs no business-data writes. Existing legacy attachment rows without durable IDs still need an authenticated admin preview, review of unresolved/ambiguous rows, and an explicit `dryRun:false` migration after deployment approval. The migration is not a substitute for verifying the correct deployed version.

To restore live downloads: deploy a new Apps Script version from the root project, update the web-app deployment to that version, open the app through the deployed `/exec` URL, authenticate, run the migration route with a super-admin session in dry-run mode for each page, review unresolved/ambiguous rows and missing ID columns, then apply in bounded batches with `dryRun:false`. Reopen representative image/PDF/other attachments from each registered page and confirm wrong-company/page/field and stale/mismatched references fail. Do not reuse the old `script.googleusercontent.com/macros/echo` response as a permanent link.

No credentials, session tokens, Drive IDs, or token-bearing URLs are included in this record.
## Final save-path audit

The final pass also removed attachment helper catch blocks that could have allowed a save to continue after a missing binding. Product create/edit and Top Chemical attachment update flows now propagate the binding error; Valley Foods already propagates it. The harness additionally rejects an arbitrary client-supplied `document_id` without an exact upload-reference cache binding.

## Follow-up compatibility fixes

A second audit against `D:\Work\Script - Copy (2)` and `D:\Work\Script - Copy` fixed the remaining live-path gaps: purchasing-line buttons now identify `legal_product_purchasing` and the transaction-code/field; customs uploads persist two attachment IDs plus a server-owned `customs_uid`; exact `id+ref` requests select the requested field before resolving its ID; unchanged stored IDs remain usable after cache expiry only when the server finds the same stored reference and ID; product print files are included in backfill; migration uses the trusted per-field folder and checks record identity/source reference before writing; and validated IDs are merged into costing, purchasing-line, bundle, and manufacture writes.

The focused harness now covers these exact-field, cache-expiry, migration-apply, migration-conflict, purchasing-link, and customs-payload contracts. The live deployment version and existing company rows remain unverified.

The follow-up also updates `Company_TopChemical_BudgetInputs.html` and `Company_TopChemical_CustomsOffice.html`, so current rendered buttons and upload saves carry the same table, field, durable ID, and server-owned record context as the backend. The harness includes behavioral reproductions for child-line selection, exact multi-field selection, cache-expired stored IDs, migration apply/conflict behavior, and static frontend/backend contracts for purchasing and customs.
