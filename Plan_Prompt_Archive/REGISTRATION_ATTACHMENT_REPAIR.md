> Folder correction: the actual Drive folder is `registration_papers 2_Files_`. The legacy `registration_papers_Files_` prefix now maps to it automatically; do not rename files or change stored paths. This supersedes the original physical-folder assumptions below.

> Updated: AppSheet-style opening is now implemented across all registered attachment tables. After deploying the current Code.js and attachment pages, supported legacy paths open without backfill. The migration procedure below is optional for saving durable IDs. See APPSHEET_ATTACHMENT_OPENING_RESULTS.md.

# Registration paper: historical AppSheet folder repair

The supplied reference is:

`registration_papers_Files_/تسجيل توب وانTop One.document_file.103330.pdf`

The current upload destination is `registration_papers 2_Files_`, but existing AppSheet files can use `registration_papers_Files_`. The old migration rejected that historical prefix. The fix accepts both explicitly trusted registration folders and searches the exact folder named by the stored reference. It does not rename files, change the stored reference, search Drive globally, or make files public.

## What changed

- Code.js adds the historical registration folder to migration configuration.
- Both migration passes use one validated folder resolver, rejecting unrelated folders and nested/traversal paths.
- Optional `reference` limits migration to an exact stored reference within a specified page.
- Existing file IDs are preserved. No live migration or deployment has been performed.

## Restore this attachment

1. Update Apps Script with the corrected root Code.js and update the existing web-app deployment to a new version containing it. If deploying via clasp, pushing source alone does not update a versioned deployment.
2. Open the ERP through its normal /exec URL and sign in as a system super-admin.
3. Open the browser developer Console. Select the ERP application iframe context where `API` and `SESSION` exist, not the attachment error response or the outer Google frame.
4. Paste the contents of `tools/registration_attachment_repair_console.js`. Loading it does nothing to live data.
5. Run `await RegistrationAttachmentRepair.preview()` and inspect the report. For one matching row, expect proposed: 1, missing: 0, conflicts: 0. Preview scans in batches of 25; it makes no business-data writes. Existing authentication/audit logging may still run.
6. Run `await RegistrationAttachmentRepair.apply()` to save the verified Drive ID in document_file_id. The original document_file AppSheet path stays unchanged. The server rechecks references before writes.
7. Refresh registration papers and open the attachment again.

If missing is nonzero, inspect lastBatches/unresolved. The deployed Apps Script identity must be able to see exactly one folder with the stored folder name and exactly one file with the complete filename inside it. If duplicate folders exist, identify the actual AppSheet storage folder; do not rename the stored path or select an arbitrary duplicate.

## Validation

`node --check Code.js` and `node tools/verify/attachment_download.js` pass. Fake-service tests use the exact supplied Arabic path and verify preview without writes, repair, unchanged unrelated records, idempotency, rejecting untrusted folders, and downloading the repaired record by stored ID. Live Drive location, access, and deployment are not verified.
