# Duplicate request safeguard

Implemented locally in Code.js, Client_Helpers.html, UI_Components.html and 02_DataAccess.js. Nothing has been deployed and no live records have been changed.

## Behavior

Authenticated company_action writes receive a stable request ID before sending. The browser stores unresolved request fingerprints and IDs in sessionStorage. Identical in-flight calls share one request; retries and reloads with the same payload reuse its ID. Shared forms also preserve an intent ID across repeated collection before success, including when page code subsequently generates a different record ID.

After authorization, the server claims the request under the script lock in a hidden ERP_Request_Receipts sheet in the company spreadsheet. A completed retry returns the original result without running the business handler again. A changed payload under the same ID is rejected. Recently pending requests may be checked again; stale or uncertain requests cannot automatically re-execute. The append helper no longer blindly repeats an append after an ambiguous exception. Secondary audit logging failure does not turn a confirmed save into an error response.

## Deployment

Push the changed project source and update the Apps Script web-app deployment to the new version. All users must refresh; old clients without request IDs are refused before writing. The first protected write creates ERP_Request_Receipts automatically, using the existing company spreadsheet access. Browser sessionStorage must work. Old queued requests without IDs require record review rather than automatic replay.

Keep the receipt sheet intact, including during retention or maintenance. Deleting receipts removes retry protection. No new external service or scheduled trigger is required.

## Practical limits

- This protects retries of the same request, not all records with matching values. After confirmed success, a new identical request is allowed.
- A new tab, cleared session storage, a rebuilt payload with newly generated IDs after reload, or manually entering a replacement can be a new request. Review the record first when a prior result is uncertain. Existing queued payloads retain their original IDs.
- Public assessment and system-administration routes are outside this company-action guard.
- Sheets does not provide a transaction across multiple business writes. A handler may partially succeed before throwing. Such requests remain blocked for manual reconciliation; the guard does not roll them back. Even validation failures after dispatch are conservatively marked uncertain.
- To investigate, an administrator should inspect the receipt by request ID, user and action, then compare the business records and audit history. Do not delete a receipt or automatically reset a stale claim to force another attempt. No automatic reconciliation or receipt cleanup is implemented.
- Existing duplicate records are unchanged. Protection depends on this deployment using its shared script lock; separate Apps Script projects writing the same tables are not coordinated.

## Verification

`node tools/verify/request_guard.js` passes against real extracted client/server source with mocked Google services: lost responses, reload recovery, overlapping requests, same-form repeated saves, changed payload rejection, authorization, owner mismatch, storage failure, stale claims, partial-write exceptions, receipt-write failures, old queue blocking, and one-attempt append behavior. These are offline checks, not a live network outage test.

Syntax checks for Code.js and 02_DataAccess.js pass. The full offline runner reports 72 of 80 groups passing, including the new guard, page parsing/boot smoke, shared forms, retry queue, and mutation coverage. Eight remaining failures concern the registration attachment folder mapping (two groups), old attachment URL expectations, attendance cache usage, a missing login test fixture, a missing financial module marker, a breakpoint, and the existing bundle-size ceiling. Full output: tools/verify/results/request_guard_full_suite.txt.

The current registration mapping in Code.js points to registration_papers_Files_ with registration_papers 2_Files_ as an alias; attachment tests expect the reverse. That unrelated workspace configuration was preserved during this safeguard work. The shared client guard also adds code to the already over-budget shared bundle.
