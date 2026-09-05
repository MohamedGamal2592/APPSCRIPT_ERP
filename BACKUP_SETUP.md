# Backups — what was broken, what was fixed, what you must do

**Do this first.** It is independent of every performance change and needed whether or not any
optimisation ever ships.

---

## What was broken

`dailyCsvBackup` ([07_Backup.js](07_Backup.js)) began:

```js
var cfg = (typeof DB_CONFIG !== 'undefined') ? DB_CONFIG : null;
if (!cfg) return { ok: false, error: 'no DB_CONFIG' };
```

`DB_CONFIG` was **defined nowhere in the project** — the only two references to that name in the
entire codebase were these two lines. So every invocation returned `{ok:false}` on line 2 and
**no CSV backup has ever been produced.** `CONFIG.BACKUP_FOLDER_ID` was also still `''`.

## What was fixed in code (already committed)

| Change | Effect |
|---|---|
| Added `buildDbConfig_()` | Builds the backup catalog at call time from `ERP_Companies`, so it cannot drift from the live company list. Includes the AUTH spreadsheet itself (`ERP_Users`, `ERP_Sessions`, `ERP_Record_History`, `SystemLog`), which is not a company and would otherwise never be backed up. |
| `dailyCsvBackup` uses it | A globally-defined `DB_CONFIG` still wins if one ever appears. |
| `getOrCreateCsvFolder_` resolves a real folder | Script Property `BACKUP_FOLDER_ID` → `CONFIG.BACKUP_FOLDER_ID` → a folder named `ERP_Backups_CSV`, created on first use. **It works with nothing set.** |
| 5-minute deadline in the backup loop | Apps Script kills a trigger at 6 minutes. The run now stops cleanly at 5 and returns `skipped: [...]`, so a truncated backup is visible instead of silently partial. |
| Added `restoreCsvToScratchSpreadsheet(name)` | Restores one backup CSV into a **brand-new** spreadsheet. Never touches a live sheet. |
| Backup trigger hour 07:00 → 01:00 | `sheetToCsv_` reads every sheet of every company spreadsheet in full. At 07:00 that is inside the Cairo working day and visible to users. |

## What you must do (needs your Google account)

### 1. Push and run it once by hand

After deploying (see `PERFORMANCE_RESULTS.md`), in the Apps Script editor run:

```
dailyCsvBackup()
```

Expected: `{ ok: true, files: <n>, errors: [], skipped: [] }` and `<n>` CSV files in the Drive
folder `ERP_Backups_CSV`, named `<DB>_<SheetName>_<yyyyMMdd>.csv`.

- `errors` non-empty → read them; usually a permissions or missing-tab problem.
- `skipped` non-empty → the run hit the 5-minute deadline. Your sheets are large enough that the
  backup needs splitting across several triggers. Tell me and I will shard it by company.

### 2. Test the restore — an untested backup is not a backup

```
restoreCsvToScratchSpreadsheet('AUTH_ERP_Users_20260905.csv')   // use a real filename from step 1
```

Returns a `url` to a new scratch spreadsheet. Open it, confirm the rows match, then delete it.
**Do this before Phase 3 or Phase 4 is deployed** — those change write paths and formulas, and the
CSV restore is their rollback path.

### 3. Install the trigger

Either run `installTriggers_` via the admin UI (super-admin only), or in the editor:
Triggers → Add trigger → `dailyCsvBackup` → Time-driven → Day timer → **1am–2am**.

`installTriggers_` also installs `cleanupOldSessions_` daily at 03:00, and deletes any prior
instance of either trigger first, so it is safe to run repeatedly.

> **Assumption made during this run:** no time-driven triggers are currently installed. Nothing in
> the codebase can tell me otherwise. Check Triggers in the editor and confirm.

### 4. Optional — pin the backup folder

If you want the CSVs in a specific Drive folder rather than an auto-created `ERP_Backups_CSV`:
Project Settings → Script properties → `BACKUP_FOLDER_ID` = the folder id.

## Retention

`pruneOldCsvBackups_` trashes CSVs older than **15 days** (unchanged). That is the rolling window.
Note this is shorter than the 24-month sheet-archive retention assumed in Phase 5 — the CSVs are a
disaster-recovery snapshot, not an archive.
