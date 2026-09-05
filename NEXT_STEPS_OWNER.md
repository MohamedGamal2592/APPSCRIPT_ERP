# Next steps — everything now waiting on you

**Branch:** `perf/optimization-run` · **Nothing has been deployed.** `clasp push` has never been run
by an agent, and no deployment has been created or promoted.

This is the register of what is blocked on your Google account or your decision, in priority order.
It does not duplicate the runbooks — each item links to the document that has the detail.
Full context: [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md) §3 and §5.

---

## Do these in order

### 1. Prove the backups work — before anything else 🔴

**Why first:** `dailyCsvBackup` referenced `DB_CONFIG`, which was defined nowhere in the project, so
it returned `{ok:false}` on its second line every time it ran. **No CSV backup has ever been
produced.** That is fixed, but the fix has never been executed. The CSV restore is the rollback path
for Phases 3, 4, 8 and 9, so it has to work before any of those are deployed.

```bash
git checkout perf/optimization-run
clasp status      # read the file list carefully — see the warning in PERFORMANCE_RESULTS.md §5
clasp push
```

Then in the Apps Script editor:

| Step | Run | Expect |
|---|---|---|
| 1a | `dailyCsvBackup()` | `{ ok: true, files: <n>, errors: [], skipped: [] }` and `<n>` CSVs in Drive folder `ERP_Backups_CSV` |
| 1b | `restoreCsvToScratchSpreadsheet('AUTH_ERP_Users_<yyyyMMdd>.csv')` | a URL; open it, confirm the rows match, then delete it |

A non-empty `skipped` means the run hit its 5-minute deadline — say so and it can be sharded by
company. **Do not deploy Phase 3, 4, 8 or 9 until step 1b has actually been done.**

Detail: [BACKUP_SETUP.md](BACKUP_SETUP.md).

### 2. Build staging 🔴

Six steps, ending in a deliberate isolation test: save a record in staging, confirm the production
sheet is untouched. Everything below is far safer with it, and Phases 8 and 9 in particular have
never been executed anywhere.

Detail: [STAGING_SETUP.md](STAGING_SETUP.md).

### 3. Install the triggers

Apps Script editor → Triggers. Confirm, or run `installTriggers_` from the admin UI as super admin:

| Trigger | When | Why |
|---|---|---|
| `dailyCsvBackup` | 01:00–02:00 | it reads every sheet of every company spreadsheet in full — it must not run inside the Cairo working day |
| `cleanupOldSessions_` | 03:00 | — |

`installTriggers_` deletes any prior instance of each first, so it is safe to re-run.

### 4. Run `inventorySpreadsheets()` — this unblocks the largest remaining win

Read-only. It writes its report to an `ERP_Perf_Inventory` tab and touches no business data.

**It is the gate on Phase 4.1/4.2**, the last big item still untouched: ~150 whole-column formula
ranges (`valley_products!$A:$I` → `$A$2:$I$<bound>`). The edit is ten minutes' work; *choosing the
bound* is the problem, and its row counts give the bound directly. A bound guessed too low does not
fail loudly — `VLOOKUP` silently misses rows and `SUMIFS` silently undercounts, on costing and
payroll data — which is why nobody has guessed one.

Send me the output and I will do 4.1/4.2 against it.

### 5. Archive old records — dry run first

```
archiveOldRecordsDryRun()   // read the report
archiveOldRecords()         // only then
```

Moves rows older than `CONFIG.ARCHIVE_RETENTION_MONTHS` out of `ERP_Record_History` and `SystemLog`
into `<sheet>_Archive_<year>` tabs in the same spreadsheet. **Nothing is deleted** — rows are written
to the archive first, flushed and verified, and only then removed from the live tab, so the worst
case is a row in both places, never a row in neither.

Afterwards, open the record-history panel and confirm recent history still shows.

---

## Two decisions I need from you

### A. Retention period — currently assumed **24 months**

Question Q2 was never answered. It is one number: `CONFIG.ARCHIVE_RETENTION_MONTHS` in
[00_Config.js](00_Config.js). Nothing else to edit. Tell me if it should be something else, or leave
it and it stays at 24.

### B. ValleyFoods purchasing now shows **10 rows by default** ⚠️

This is the one user-visible behaviour change in the whole run. That screen used to return every
costing row ever; it now returns the 10 most recent, matching the equivalent TopLight screens. A
**"عرض الكل"** button next to "إضافة عملية شراء" reaches the rest, and `renderList()` preserves
whichever view the user is in, so a save does not silently drop them back to 10.

If you would rather it keep showing everything, say so — it is one line, having the page pass
`{ loadAll: true }`.

---

## Things I found that are yours to decide, not performance work

| | |
|---|---|
| **Five delete buttons call actions that do not exist.** `delete_deduction`, `delete_overtime`, `delete_vacation`, `delete_registration_paper`, `delete_legal_manufacture` are not registered anywhere in the project — each throws "Unknown action" and shows an error toast. Writing five business-table delete handlers is not a performance change, so this run did not do it. | Tell me if you want them built. |
| **`YourStrongPassword123!` was sitting in source** as a value in `DBLIVE_CONFIG.props`. If it was ever a real password on `164.92.143.177/topchemicalpest`, **rotate it.** Also, because of the key-name bug fixed in Phase 0, if MySQL currently works its credentials are stored under Script Properties literally named `appscript_user` and `YourStrongPassword123!` — migrate them to `MYSQL_USER` / `MYSQL_PASSWORD` at your convenience; the legacy names still work. | Security, not performance. |
| **Phase 4.4** — replacing in-sheet formulas with script-computed static values. The largest single win available and a genuine change to how your business data behaves. Written up as a proposal in [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md) §7. It needs a conversation, not a commit. | Your call. |
| **`src_html/`** — a stale partial duplicate of the project: 45 files, 41 of which already differed from their root counterparts before this run started. Not pushed, and now also in `.claspignore`. It is a real hazard: an optimisation edited into the wrong copy would silently never deploy. | Delete it once you have confirmed nothing you need lives only there. |
| **`appsheet_old_project.html`** — 14.4 MB, unreferenced by any include, route or template. Excluded from the push set but **not deleted**, pending your confirmation. | Safe to delete. |

---

## Deploy order, once 1 and 2 are done

Deploy **one phase at a time** and verify before continuing — do not deploy all of it at once. The
per-phase verification table is [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md) §5 step 3, and the
per-phase `git revert` commands are in §6.

The three to watch hardest, because they touch how data is written and read:

- **Phase 3 and Phase 8** — after saving a multi-line document, open the sheet and confirm the
  computed columns are **still formulas, not values**. Click a `total_cost` / `unit_cost` /
  `movement_code` cell and check the formula bar.
- **Phase 9** — save a multi-sheet document (ValleyFoods sales invoice is the densest) and confirm
  the numbers it wrote are right. This is the change with the least margin for error.

**Fastest rollback, any phase:** Manage deployments → point the deployment back at the previous
version. Seconds, no code changes. Note the current version number before you deploy anything.
