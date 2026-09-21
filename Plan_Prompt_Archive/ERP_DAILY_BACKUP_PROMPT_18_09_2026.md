# Daily Google Sheets Backup — Apps Script Implementation Prompt

## Objective
Add an automated daily backup job to the ERP Apps Script project. Every day it must:
1. Copy each source spreadsheet into a dedicated Drive folder, with a timestamped filename.
2. Delete backups older than 10 days.
3. Log every successful backup as one row in `ERP_System_Backups` (`backup_id | source | file_id | created_at`) inside the `ERP Information` spreadsheet.
4. Run automatically at ~2 AM every day, with no manual step after the one-time setup.
5. Give the super admin a one-click way to download the backed-up sheets from the ادارة النظام (System Management) page.

This is a new, additive feature. Do not touch the gap-closure work from the other prompt, or any unrelated business logic.

## Assumptions — confirm or correct these before/while building
- **Sources to back up:** one entry per company database (TopChemical, TopLight, ValleyFoods — add Assessment if you want it included too). Config-driven, not hardcoded, so adding a fourth source later is a one-line change.
- **Destination:** one persistent Drive folder (e.g. `ERP_Daily_Backups`), created once if missing and reused every day — *not* a fresh dated sub-folder per day.
- **"Removed after 10 days" = trashed**, not permanently deleted (`file.setTrashed(true)`) — recoverable from Drive Trash. Say so if you want permanent, irreversible deletion instead.
- **`ERP Information` spreadsheet and its `ERP_System_Backups` sheet already exist**, or should be created with the header row `backup_id | source | file_id | created_at` if missing.
- **2 AM = the project's local time zone**; Apps Script time-driven triggers fire in a ~1 hour window, not an exact second. Confirm the script's time zone is set to Africa/Cairo, not left at a UTC/default zone.
- **"Download the sheets" = the latest backup copy of each source**, bundled into one `.zip` so a single click produces a single file — not one browser download per company (multiple simultaneous downloads are often blocked by the browser). Say so if you actually want the *live* source sheets downloaded instead of the backups.

## Ground rules
- **No unit tests.**
- **The backup and download features must never alter, add to, or delete anything in the source spreadsheets or their tables.** They only ever read/copy the source files — no write, edit, or delete against source sheet data, under any circumstance.
- **No add/edit/delete operations of any kind while implementing or verifying this feature** — this includes not manually invoking `dailyBackupJob_()`, `runDailyBackup_()`, or `purgeOldBackups_()` from the script editor "to see if it works," and not manually adding a row to `ERP_System_Backups` to test. Verify everything by reading the code (see Verification below). The job's first real execution happens on its own schedule once the trigger is installed — that is not something to trigger manually as part of this task.
- Additive only — new file(s)/functions for this feature.
- No hardcoded spreadsheet IDs in the backup/purge/download logic — always read from `BACKUP_SOURCES`.
- No duplicate triggers — `installDailyBackupTrigger_()` must remove any existing one for the same function before creating a new one.
- Deliver complete, paste-ready files.
- A failure in one source's copy, or in the log-append, must not silently kill the whole run — catch it, continue, and surface it.

## What to build

1. **Config block** — `BACKUP_SOURCES` = list of `{ name, spreadsheetId }`; `BACKUP_FOLDER_NAME` and `BACKUP_RETENTION_DAYS = 10` as named constants.

2. **`getOrCreateBackupFolder_()`** — find the folder by name; create it once if missing; return it. Must never create a duplicate on a later run.

3. **`runDailyBackup_()`** — for each entry in `BACKUP_SOURCES`:
   - Copy the source spreadsheet into the backup folder: `DriveApp.getFileById(id).makeCopy(name, folder)`, filename pattern `${source}_Backup_${yyyy-MM-dd_HHmm}`.
   - Wrap each source's copy in its own try/catch — one source failing must not stop the others. Collect failures to report.
   - On success, append one row to `ERP_System_Backups`: `backup_id` (reuse the project's existing `getNextIdUnderLock_`/`getNextId_` pattern rather than a second ID scheme), `source`, `file_id` (`copiedFile.getId()`), `created_at`.

4. **`purgeOldBackups_()`** — iterate the backup folder's files; trash anything older than `BACKUP_RETENTION_DAYS`. Run only after the day's backups succeed.

5. **`installDailyBackupTrigger_()`** — one-time setup: delete any existing trigger already bound to the daily job function, then `ScriptApp.newTrigger('dailyBackupJob_').timeBased().atHour(2).everyDays(1).create()`. Run once manually from the script editor — not on every deployment.

6. **`dailyBackupJob_()`** — single entry function calling `runDailyBackup_()` then `purgeOldBackups_()`. This is the trigger's one target function.

7. **Super-admin download button (ادارة النظام page):**
   - Add a button, visible only to the super admin role, on the existing System Management page — follow that page's existing button/permission conventions.
   - Register it as its own action (e.g. `sys_download_backups`) in the same `PAGE_ACCESS`/`ACTIONS` map used elsewhere, gated **server-side** as super-admin-only, fail-closed — never rely on the button simply being hidden in the UI for users who aren't super admin.
   - Server function: for each `BACKUP_SOURCES` entry, look up its most recent `file_id` from `ERP_System_Backups` (latest `created_at` per `source`). Export each as `.xlsx`. **Important implementation detail:** a native Google Sheet cannot be exported with `DriveApp.getFileById(id).getBlob()` — that does not return usable spreadsheet bytes. Use either the Drive export endpoint via `UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } })`, or the Advanced Drive Service's `Drive.Files.export(...)` — confirm the Drive scope/advanced service is enabled if you use the latter.
   - Bundle the resulting blobs into a single archive with `Utilities.zip(blobs, 'ERP_Backups_<date>.zip')`.
   - Return the zip to the client as base64; client-side JS turns it back into a Blob and triggers exactly one browser download (a temporary `<a download>` element is the standard pattern) — one click, one file.
   - If the combined zip risks being too large for a single `google.script.run` response, note that as a blocker rather than silently truncating anything, and flag it back instead of guessing at a fallback.

## Verification — code trace only, no live execution
- Code trace confirms all config (sources, folder name, retention days) lives in one place, not repeated per source.
- Code trace confirms `getOrCreateBackupFolder_` cannot create a duplicate folder across repeated runs.
- Code trace confirms `purgeOldBackups_` only ever trashes files older than the configured window, scoped to the backup folder — never the source spreadsheets.
- Code trace confirms `runDailyBackup_`, `purgeOldBackups_`, and the download feature contain no write/edit/delete call against any source spreadsheet — only `makeCopy`/export/read calls.
- Code trace confirms `sys_download_backups` is checked server-side against the super-admin role before any export happens, using the same fail-closed pattern as other admin-only actions on that page.
- Code trace confirms the export step uses `UrlFetchApp`/Advanced Drive export (not `DriveApp.getBlob()` on a native Sheet), and that the zip bundling produces one file per click, not one download per source.
- Confirm via the Apps Script Triggers page (after running `installDailyBackupTrigger_()` once, which is setup, not a test) that exactly one trigger exists for the daily job, set to ~2 AM.
