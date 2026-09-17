# ERP Performance — execution results

**Branch:** `perf/optimization-run` (off `master`, which is untouched and is your rollback point)
**Date:** 2026-09-05 → 2026-09-06
**Companions:** [PERFORMANCE_INVESTIGATION.md](PERFORMANCE_INVESTIGATION.md) ·
[PERFORMANCE_EXECUTION_PLAN.md](PERFORMANCE_EXECUTION_PLAN.md) · [PERF_BASELINE.md](PERF_BASELINE.md) ·
[BACKUP_SETUP.md](BACKUP_SETUP.md) · [STAGING_SETUP.md](STAGING_SETUP.md)

> **Nothing has been deployed.** Every change is local and committed. `clasp push` was never run and
> no deployment was created or promoted. Deploying is your manual step — instructions in §5.

---

## 0. Read this part first

> **This document now covers three runs.** §0–§8 are the first run (Phases 0–6);
> **[Continuation run (Phases 7–10)](#continuation-run-phases-710)** is the second;
> **[Continuation run (Phases 11–14)](#continuation-run-phases-1114)** is the third and newest.
> **Read the third one first**, then the second. Each reports a gap the run before it left
> unmentioned: the second found that Phase 2 silently skipped `get_purchase_items`, and the third
> found that Phase 2.6 stamped only the TopLight form option builders and left 51 reference reads
> outside the stamp. **F-01 was done in the second run.** Item 2 below is left exactly as it was
> written, because it was true at the time and the record should show what was and was not known.

Three things matter more than the rest of this document.

**1. Nothing here has been executed or tested against a real spreadsheet.** There is no staging
environment yet, and running anything against production needs `clasp push`, which is a hard stop.
Every claim below is from reading and static analysis. `node --check` passes on all 19 `.js` files
and the inline `<script>` of all 92 pages, and one change (F-02.1) was verified by a differential
test — but *nothing has been run against Google Sheets.*

**2. The two highest-value items were deliberately not done.** F-01 (per-sheet memo invalidation) and
F-06a/4.1 (bounding whole-column formula ranges) are the two biggest wins in the investigation. Both
were skipped, for reasons given in §3. Both fail *silently and expensively* if done wrong — wrong
numbers in invoices, or a VLOOKUP quietly missing rows — and I could not verify either. A skipped
step that is reported is fine; a broken save path that is not, is not.

**3. Your backups have never worked.** `dailyCsvBackup` referenced `DB_CONFIG`, which was defined
nowhere in the project, so it returned `{ok:false}` on its second line every time it ran. That is
fixed, but the fix is untested until you run it. Do §5 step 1 before anything else.

---

## 1. What changed, per phase

| Phase | Commit | Summary |
|---|---|---|
| baseline | `f47847d` | Snapshot of the working tree before any change |
| 0 | `ca0b73c` | Working CSV backups; staging switch; F-25 credential-key fix |
| 0b | `e79c68a` | Server + client instrumentation; read-only inventory script; static baseline |
| 1 | `d4569c0` | Tier-1 safe wins: F-18, F-09, F-08, F-10, F-02.1, F-19, F-22, F-23 |
| 2 | `6f39b7c` | Sales & Purchase: options split out, slice before mapping, caching, limits |
| 3 | `9172ccc` | Batched row+formula writes (F-04); session touch throttle (F-07) |
| 4 | `454ae31` | 36 whole-column VLOOKUPs → INDEX/MATCH |
| 5 | `2eb1716` | Archiving for `ERP_Record_History` and `SystemLog` |
| 6 | `c53d99a` | Harvested TableEngine caching into the data layer, then deleted the dead engine |

### Phase 0 — safety net
- `07_Backup.js`: added `buildDbConfig_()`, derived at call time from `ERP_Companies` (plus the AUTH
  spreadsheet, which is not a company and was therefore never in scope at all — it holds `ERP_Users`,
  `ERP_Sessions`, `ERP_Record_History`, `SystemLog`). Backup folder resolves Script Property →
  `CONFIG.BACKUP_FOLDER_ID` → an auto-created `ERP_Backups_CSV`, so it works with nothing configured.
  Added a 5-minute deadline that reports unwritten sheets in `skipped`, so a truncated backup is
  visible rather than silent. Added `restoreCsvToScratchSpreadsheet()`, which restores into a **new**
  spreadsheet and never touches a live one.
- `00_Config.js`: `CONFIG.AUTH_SPREADSHEET_ID` now resolves from a Script Property with the current
  literal as fallback, via a memoised getter. Production needs no property set; staging sets one.
- `Code.js`: the backup trigger installs at 01:00 instead of 07:00 (it reads every sheet of every
  company spreadsheet in full; 07:00 is inside the Cairo working day).
- `DbLive_Connector.js` (F-25, pulled forward): `DBLIVE_CONFIG.props` held *values* where Script
  Property *key names* belong, so every lookup asked for properties literally named `appscript_user`
  and `YourStrongPassword123!` while every error message said `MYSQL_USER`/`MYSQL_PASSWORD`. Fixed,
  with a fallback to the legacy names. **Pulled into Phase 0 because staging isolation depends on
  it** — "leave `MYSQL_USER` unset in staging" would not have cut anything.
- New: `08_Staging.js` (`stagingCreateEnvironment`, `stagingVerifyIsolation`), `STAGING_SETUP.md`,
  `BACKUP_SETUP.md`.

### Phase 0b — instrumentation
- `SystemLog` gains `ElapsedMs` and `SheetReads`, appended at the **end** of `SYSTEM_LOG_HEADERS` —
  that list's own documented convention. `ensureSystemLogSheet_` already migrates a live sheet by
  adding only missing headers, so existing columns and rows are untouched.
- `SheetReads` counts real value-reads at the ten data-layer read sites. Company code that calls
  `getDataRange().getValues()` directly is not counted, so **it is a floor, not a total.**
- Read actions can be logged (`Action = READ`) by setting Script Property `PERF_LOG_READS=1`.
  **Off by default and property-gated on purpose:** logging a read appends a `SystemLog` row, i.e.
  adds a *write* to every *read*, and `SystemLog` already grows unbounded. It is a measuring
  instrument, not a setting to leave on. `login_user`/`setup_password` are never logged.
- Client timings (`page_ready`, `page_load`, and `PERF.mark('first_data_render')`) go to a new
  `ERP_Client_Perf` tab via a `log_client_perf` route, sibling to the existing error log. Inert
  unless the same property is on; `doGet` injects `window.PERF_LOG` so a closed window costs the
  client nothing.
- New `09_Inventory.js`: read-only `inventorySpreadsheets()` and `inventoryFindImportranges()`.

### Phase 1 — safe wins
| Finding | What changed | Measured / expected |
|---|---|---|
| F-18 | `xlsx.full.min.js` (~900 KB) lazy-loaded on first Excel click instead of a top-level `<script>` | removed from **83** pages |
| F-09 | `include()` reads static files directly, falling back to template evaluation only if the content contains `<?` | all 9 shared includes verified scriptlet-free (95 KB `UI_Components` included) |
| F-08 | `getCompanyLogoUrl_` version-cached, matching its two siblings | one full `ERP_Companies` read off every page render |
| F-10 | `getCompanyName_` version-cached | one full `ERP_Companies` read off every logged write |
| F-02.1 | cheap empty-row test in `buildRecordsFromRaw_` | **measured 4.2× faster, ~22 ms saved per call** on 11,500×20 |
| F-19 | Chart.js 4.4.1 → 4.4.3 on 3 pages | all 5 chart pages share one cached file |
| F-22 | `preconnect`/`dns-prefetch` for the two CDN origins | in `CSS_Tokens`, so all 82 pages |
| F-23 | `.claspignore` | push set **16,851,453 → 2,401,223 bytes** |

F-02.1 was the one that needed care, and got it. The original test ran over `Object.values(record)`,
so two behaviours had to be preserved exactly: headers that trim to the same name (including several
blank ones) collapse onto one key with the **last** column winning, so only those columns were ever
tested; and `String(null)` is `'null'`, so a `null` cell counted as **non-empty** while `undefined`
was substituted with `''` and counted as empty. My first version got the `null` case wrong. It was
caught by a differential test against the original over 40,000 randomised cases — duplicate headers,
blank headers, ragged rows, `null`/`undefined`/`0`/`false`/`Date`/whitespace — which now reports
**0 mismatches**.

### Phase 2 — Sales & Purchase (your named pain)
- **2.1** Options split out of the list endpoints. `get_sales_headers` no longer calls
  `salesOptions_()`, which pulled three further full sheet reads —
  `top_light_current_products`, `top_light_product_purchasing`, `top_light_products` — to populate a
  form the user may never open. **Cold-cache reads on the common list path: 7 → 4.** New actions
  `get_sales_options`, `get_purchasing_options`, `get_valley_purchasing_options`, fetched when the
  form first opens and memoised client-side. Both endpoints still return the old combined shape if
  called with `withOptions:true`, so a version mismatch in either direction degrades rather than
  breaks.
- **2.2 / 2.3** Slice before mapping. Previously every invoice ever was expanded into a derived
  object and ~99% were discarded. `get_purchasing_headers` needed care: it sorted on the *picked*
  value `rec['reciept date']`, which does not exist on the raw row, so a naive sort-before-map would
  have reordered the list. Done as decorate/sort/slice, with `parseDate_` now called O(n) times
  instead of O(n log n) inside the comparator.
- **2.4** ValleyFoods purchasing: option lists now go through `getRefsCached_`, and rows are sorted
  by id descending and limited. **See §4 — this one changes what users see.**
- **2.5** `makeAliasPicker_` resolves the normalised-name → actual-key map once instead of rebuilding
  a closure per row that walked every key per alias (O(rows × fields × columns) to read 8 fields).
- **2.6** Version-stamped reference cache (`tlRefs_`, `tlCachedMap_`) for the Sales & Purchase **form**
  builders only, TTL 600s. A stamp rather than a bare longer TTL because one bump orphans every
  derived key at once and none can be individually forgotten. Coverage was audited before changing
  anything: exactly four mutation sites exist for the two reference sheets — `add_product` (:409),
  `edit_product` (:448), `add_party` (:529), `edit_party` (:568) — and all four already call
  `bustTopLightCaches_`; there are no delete actions for either sheet.
- **2.7** Post-save reload, decided per action — see §4.

### Phase 3 — write path
Batched row + formula writes across eleven sites in `Company_TopLight_Actions.js`. The formula
**strings** now go into the same value row and are written with one `setValues`. `setValues` treats a
leading `=` as a formula, exactly as `appendRow` and `setFormula` already do here, so the cells end
up as formulas with identical text; the formula text was moved verbatim into `*FormulaMap_` helpers
and the original `set*Formulas_` functions were kept as thin wrappers over those maps.

The biggest: `writeLines_` was `appendRow` + up to 6 `setFormula` **per line**, so a 10-line
purchasing document cost ~70 Sheets round trips. It is now **one**.

**One deliberate behavioural change:** `appendRow` is safe against a concurrent append; a precomputed
target range is not. Without protection, two simultaneous saves could compute the same start row and
one would silently overwrite the other. Every converted **append** therefore runs inside
`executeWithLock_` — the same reentrant script lock `addRecord_` and `getNextId_` already use — and
grows the grid with `insertRowsAfter` if the block would run past `getMaxRows()`. The converted
**update** paths take no lock; they write to a row that already exists and was located by its
business key.

Also F-07: `SessionManager_.touch` throttle 30s → `CONFIG.SESSION_TOUCH_THROTTLE_SECONDS` (300s),
cutting a full read+write of the shared `ERP_Sessions` sheet per active user by ~10×. Only the
freshness of a "last seen" timestamp changes; `expires_at` is set at login and never derived from it.

### Phase 4 — formulas
36 script-written whole-column exact-match `VLOOKUP`s rewritten as `INDEX`/`MATCH`, so a lookup into
a 25-column block now references 2 columns. Value-identical: both return the first matching row's
value in the target column, and both give `#N/A` on no match. `$`-anchoring and key expressions
preserved. Applied only where the original span was ≥ 4 columns; the 30 remaining span 2–3, where
`INDEX/MATCH` would reference 2 columns anyway.

**Honest limit on the benefit:** this changes what the script writes *from now on*. It does not
rewrite formulas already in the sheets, so existing rows keep their `VLOOKUP` form and the
recalculation cost they already carry. Old and new rows compute identical values, so a mixed
population is correct — just not uniformly fast.

### Phase 5 — retention
`10_Retention.js`: `archiveOldRecords()` moves rows older than
`CONFIG.ARCHIVE_RETENTION_MONTHS` out of `ERP_Record_History` and `SystemLog` into
`<sheet>_Archive_<year>` tabs in the same spreadsheet, same columns. Nothing is deleted.

Rows are written to the archive **first**, flushed, and the write is verified by re-reading the
archive tab's last row; only then is the live tab rewritten. If anything throws in between, the worst
case is a row present in **both** places, never a row present in neither. Rows whose date is blank or
unparseable are kept, never archived. Dry run is the default everywhere.

Also fixed a real inefficiency in `cleanupOldSessions_` (F-14): it called `deleteRowsByCriteria_`
once **per** expired session, and each of those does a full `getDataRange().getValues()` — so
cleaning N sessions cost N full reads of `ERP_Sessions`. Now one read and a single bottom-up pass.

### Phase 6 — hygiene
Harvested from `04_TableEngine.js` **before** deleting it:
- **Chunked CacheService.** `CacheService` rejects any single value over ~100 KB. `getRefsCached_`
  did a plain `cache.put` inside a `try/catch`, so for a large products or parties list the put threw,
  was swallowed, and **the cache silently never worked** — every call rebuilt from a full sheet read,
  with nothing in the logs to say so. The bigger the company, the less the cache helped. Reference
  data now stores through a manifest + chunk layout, so it actually caches.
- **`getRecordsByPk_`** — Map-based O(1) primary-key lookup, replacing `rows.find(...)` inside a loop.
  Built on `getAllRecords_`, so unlike the original it shares the request memo and is counted by the
  Phase 0b instrumentation.

Then `04_TableEngine.js` was deleted, after independently re-verifying all four of F-17's proofs
(evaluation order vs `const ROUTES`; the page that includes the engine never instantiates it; the
only `tbl_*` callers are inside the engine's own client file; and every symbol it defines appears
**only** in that file). A `tbl_*` call could only ever have thrown, so nothing that worked stops
working. Also dropped the ~42 KB of `ERP_DataTable*` includes from `Company_TopLight_Products.html`.

---

## 2. Measured results

Static and reproducible. **No production timings — none could be collected.**

| Metric | Before | After |
|---|---|---|
| Pages loading the ~900 KB xlsx library | 83 | **0** (loaded on first export) |
| Bytes pushed to the Apps Script project | 16,851,453 | **2,401,223** |
| `Company_TopLight_Products` inlined payload | 175,574 | **135,333** |
| `buildRecordsFromRaw_` on 11,500×20 | 29.1 ms | **6.9 ms** (4.2×) |
| Cold-cache sheet reads, `get_sales_headers` | 7 | **4** |
| Sheets round trips, 10-line purchasing save (lines only) | ~70 | **1** |
| Chart.js versions in use | 2 | **1** |
| `.setFormula` calls on any write path | 30+ | **0** |

Two corrections to the investigation, both verified by grep and recorded in `PERF_BASELINE.md`:

1. **F-19 is wrong about Bootstrap** — it is not loaded anywhere. The only matches for "bootstrap"
   in the repository are the *action name* `get_valley_sales_bootstrap` in two ValleyFoods pages.
   `jspdf`, `jspdf-autotable` and `sortablejs` are absent too. The "audit whether Bootstrap is still
   needed on those 10 pages" work item does not exist.
2. **F-16 is already done.** The investigation says `prefetch_refs` "exists at
   `Company_TopChemical_Actions.js:4267` and nowhere else". All three companies register it today,
   each with its `PAGE_ACCESS` and `ACTION_TABLES` entry. No change was needed and none was made.

There are 93 `.html` files in the project root (82 including the shared bundle), not 118.

---

## 3. What was skipped, and why

### F-01 — per-sheet memo invalidation (Phase 3.1). **The biggest single win in the investigation.**
Correctness depends on the invalidation being exhaustive. A count of direct write calls
(`.appendRow` / `.setValues` / `.setValue` / `.deleteRow` / `.setFormula` / `.clearContent`) that
bypass the data-layer helpers gives **~144 sites**: TopLight 24, TopChemical 29, ValleyFoods 61,
`05_Admin` 14, `Code.js` 11, `03_Security` 5. Every one would have to invalidate correctly. The
failure mode is silent: a save reads a stale memo and writes wrong numbers into invoices or costing.
There is no staging environment and I cannot execute anything, so I could not verify a single
conversion by running it. The plan rates it Medium-High and asks for per-module sign-off.

Phase 1 and Phase 2 already removed several of the reads it was meant to save.

**How to do it properly, against staging:**
1. `grep -nE "\.appendRow\(|\.setValues\(|\.setValue\(|\.deleteRow\(|\.setFormula\(|\.clearContent\(" *.js`
2. Add `invalidateRecordCache_(dbId, sheetName)` to `02_DataAccess.js`, dropping the single
   `dbId|sheetName` key, and call it from `addRecord_`, `updateRowByCriteria_`,
   `deleteRowsByCriteria_` and every site from step 1.
3. Change `Code.js` `apiRouter_` to stop calling `disableRecordCache_()` for writes.
4. The conservative variant, if the audit is not exhaustive: keep the memo enabled but have the
   **first** mutation disable it for the rest of the request. That captures the duplicate reads that
   happen *before* any write — which is most of them in the save handlers — while behaving exactly as
   today afterwards.

### F-06a / Phase 4.1–4.2 — bounding whole-column ranges
The edit is easy: ~150 whole-column references, e.g. `valley_products!$A:$I` → `$A$2:$I$5000`.
**Choosing the bound is the problem, and I have no basis for choosing it.** Q3 (sheet sizes) was never
answered and the inventory could not run, so I do not know how many rows `valley_attendance`,
`emp_deductions` or `top_light_sales_invoices` hold. A bound set too low does not fail loudly —
`VLOOKUP` silently misses rows past it and `SUMIFS` silently undercounts, on costing and payroll
data. Guessing 5000 to make a phase look complete is the wrong trade. Deriving the bound per row at
write time would be worse: correct on the day it was written, silently wrong as the sheet grew.

This becomes a ten-minute change once `inventorySpreadsheets()` has run — its row counts give the
bound directly. Put it in a single constant so it can be raised in one place.

### Phase 3.4 / F-05 — bulk-rewrite deletes. **I believe this is unsafe as specified.**
Beyond being gated on the inventory: the line sheets that `deleteLines_`, `deleteSalesLines_` and
`deleteOfferLines_` operate on carry per-row formulas referencing their own row (`total_cost`,
`unit_cost`, `movement_code`, `product_net_value`, …). `deleteRow()` makes Sheets re-point the
surviving formulas automatically. The proposed read-filter-`clearContent`-`setValues` rewrite would
write the **original** formula strings back at new row positions, so every formula below a deleted
row would point at the wrong row — silent corruption of costing data. It could be done by
regenerating formulas for the new positions, but `deleteRowsByCriteria_` is generic and cannot know
how.

### Others
| Item | Status |
|---|---|
| Phase 4.4 (formulas → static values) | Hard stop. Proposal in §7. |
| Phase 0 staging build, backup run, trigger install, Script Properties | Need your Google account. Runbooks written. |
| `inventorySpreadsheets()` | Needs `clasp push` to production to be runnable. Script committed. |
| The ~1 week instrumented sample | This run executed all phases back to back. |
| F-16 (`prefetch_refs`) | Already done in all three companies. |
| F-20(c) logout dedup | Already done — one implementation, in `Client_Helpers.html`. |
| F-20(c) CSS dedup | Measured: 39,076 bytes of inline CSS across 33 pages, but only **260 bytes** duplicated across ≥5 pages. No win. |
| F-04 on ValleyFoods / TopChemical | Only TopLight converted, as the plan's module-by-module rule requires. ~90 similar sites remain. |
| F-03 (`Sheets.Values.batchGet`) | Not in the plan's step list for any phase. Untouched. |
| F-11 (kill-switch cache) | Tier 4, explicitly not recommended. Untouched. |
| `SystemLog.ChangedFields` truncation | Discards audit content — your call, not mine. |
| `src_html/` | Left entirely alone. See §6. |

---

## 4. Every assumption I made

1. **Retention = 24 months.** Q2 was never answered. It is
   `CONFIG.ARCHIVE_RETENTION_MONTHS` in `00_Config.js` — one number, nothing else to edit.
2. **No time-driven triggers are currently installed.** Nothing in the codebase can tell me. Check
   Triggers in the editor. `installTriggers_` deletes any prior instance first, so it is safe to run.
3. **Peak concurrency 10–20 users.** This is why the Phase 3 appends take the script lock and why
   F-07 mattered enough to change.
4. **`appsheet_old_project.html` is a dead reference artifact.** It is unreferenced by any include,
   route or template (verified). It is excluded from the push set but **not deleted** — F-23 asks for
   your confirmation before that.
5. **ValleyFoods purchasing may show 10 rows by default.** ⚠️ **This is the one user-visible change
   in the run.** That screen used to return every costing row ever; it now returns the 10 most recent,
   matching the equivalent TopLight screens. To keep the data reachable I added a **"عرض الكل"**
   button next to "إضافة عملية شراء", and `renderList()` called with no argument preserves whichever
   view the user is in, so a save does not silently drop them back to 10. **If you would rather it
   keep showing everything, say so** — it is one line: have the page pass `{ loadAll: true }`.
6. **2.7 decisions.** Converted to a row patch: ValleyFoods `approve_valley_purchasing_costing` and
   `quality_approve_valley_purchasing_costing` — each writes exactly three approval fields on one row
   via `updateRowByCriteria_` and cascades to nothing (verified in the handler). Kept full reload:
   `save_valley_purchasing_costing` (writes a header *and* its lines, and with the new limit a new row
   changes which 10 are shown) and `delete_valley_purchasing_costing` (cascades to the lines sheet,
   and deleting one of 10 rows must reveal the 11th, which a local splice cannot do). TopLight Sales
   and Purchasing already patched locally on save, approve and delete; not touched.
7. **2.6 TTL = 600s, not the 1–6h floated.** A version stamp cannot cover somebody editing
   `top_light_products` or `top_light_customer_vendor` by hand in the spreadsheet. That used to
   surface within 120s and now surfaces within 600s. Hours of staleness on a dropdown is not a trade
   worth making.
8. **`setValues` treats a leading `=` as a formula.** The whole of Phase 3 rests on this. It is
   standard Apps Script behaviour and is what `appendRow` already did in this code, but it has not
   been verified on your sheets. **This is the first thing to check after deploying Phase 3.**

---

## 5. Deployment — exact steps, in order

Deploy **one phase at a time**, verify, then continue. Do not deploy all seven at once.

### Before anything
```bash
git checkout perf/optimization-run
git log --oneline -9          # confirm the 9 commits listed in §1
clasp status                  # LIST WHAT WOULD BE PUSHED — see the warning below
```

> ⚠️ **Check `clasp status` output carefully.** This run added a `.claspignore`. Confirm the file
> list still contains every `.js` and every `Company_*.html`, and that
> `appsheet_old_project.html` is gone. If any source file is missing, delete `.claspignore` and
> re-check before pushing — a `.claspignore` that excludes too much would push a broken project.

### Step 1 — backups (do this first, on its own)
```bash
git checkout perf/optimization-run
clasp push
```
Then in the Apps Script editor:
1. Run `dailyCsvBackup()`. Expect `{ ok: true, files: <n>, errors: [], skipped: [] }` and `<n>` CSVs
   in the Drive folder `ERP_Backups_CSV`. Non-empty `skipped` means the run hit the 5-minute deadline
   — tell me and I will shard it by company.
2. Run `restoreCsvToScratchSpreadsheet('AUTH_ERP_Users_<yyyyMMdd>.csv')` with a real filename from
   step 1. Open the returned `url`, confirm the rows match, delete it. **Do not deploy Phase 3 or
   Phase 4 until this restore has been tested** — the CSV restore is their rollback path.
3. Triggers → confirm `dailyCsvBackup` is installed at 01:00–02:00 and `cleanupOldSessions_` at
   03:00, or run `installTriggers_` from the admin UI as super admin.

Full detail: [BACKUP_SETUP.md](BACKUP_SETUP.md).

### Step 2 — staging (strongly recommended before Phases 2–4)
Follow [STAGING_SETUP.md](STAGING_SETUP.md). It is six steps and ends with a deliberate isolation
test: save a record in staging, confirm the production sheet is untouched.

### Step 3 — verify after each phase
| Phase | What to check |
|---|---|
| 0 | Backup ran, restore tested, triggers listed. MySQL module still connects (F-25 changed which property keys it reads — the legacy fallback should cover it, but check). |
| 0b | Open any page, do a write, then check `SystemLog` has `ElapsedMs` and `SheetReads` populated at the **end** of the header row and that no existing column shifted. |
| 1 | On any page: the Excel export button still produces a file (first click is ~300 ms slower — that is the lazy load). A company logo still renders. Dashboard/KPI charts still draw. |
| 2 | **TopLight Sales:** list loads, the 10 rows are the right 10 in the right order, the add/edit form's customer and product dropdowns are populated (they now load when the form opens). **TopLight Purchasing:** same, and check the supplier column and receipt-date ordering. **ValleyFoods Purchasing:** confirm the 10-row default and the "عرض الكل" button — see §4 item 5. |
| 3 | **The critical one.** Save a multi-line purchasing document and a multi-line sales invoice in staging. Then open the sheet and check the computed columns **are still formulas, not values** — click a `total_cost` / `unit_cost` / `movement_code` / `product_net_value` cell and confirm the formula bar shows a formula referencing its own row. Do the same for a cash movement. Then edit an existing document and re-check. |
| 4 | Open a `total_cost` cell on a newly created byproduct row: it should read `INDEX(...MATCH(...))` and produce the same number as an older `VLOOKUP` row for equivalent inputs. |
| 5 | Run `archiveOldRecordsDryRun()` **first** and read the report. Only then `archiveOldRecords()`. Then open the record-history panel and confirm recent history still shows. |
| 6 | Open `Company_TopLight_Products` — it should look and behave identically (the removed includes were never instantiated). Confirm dropdowns across pages still populate (reference caching changed shape). |
| 7.1 | **TopChemical → توريدات ومشتريات.** The list shows the 10 most recent, newest first — same 10, same order as before. Click "+ إضافة توريد": there is now a brief spinner ("جاري استرجاع خيارات الموردين والأصناف…") the **first** time only, then the المورد and الصنف dropdowns must be populated. Open it a second time — no spinner, options still there. Save a supply and confirm the new row appears at the top. |
| 7.2 | **The one to test with two browsers.** TopChemical: edit a product's category, then immediately open the products page in another session — the change must be visible, not up to 10 minutes stale. Same for a client/vendor. Then check the two dropdowns that were silently broken before: the products page's التصنيف list must show real categories (not `[object Object]`), and adding a product with a valid category must **not** be rejected with "الفئة غير موجودة في جدول الفئات". ValleyFoods: save a party, then open the sales form and confirm the party's tax_id, address and phone still autofill; check the asset-code dropdown on the products form still offers only the 114100–115100 range. |
| 7.3 | **TopChemical → متابعة الاستيراد.** Advance a record's status. The badge and the row's action buttons must change immediately, with no list re-fetch, and must match what a page refresh shows. |
| 8 | **The critical one, with Phase 3.** In staging, save a ValleyFoods manufacturing order with several outputs, several consumption lines and at least one by-product. Then open the sheets and confirm the computed columns are **still formulas, not values**: `valley_manufacture_by_product.total_cost` and `.transaction_code`, `valley_manufacture_header_products.cost_unit`/`.total_cost`, `valley_manufacture_work_center.total_cost`, and the MO header's `total_batch_cost`. Each formula must reference **its own row number**. Then edit the order and re-check — the row numbers must still be right. Do the same for TopChemical: add an AR/AP movement (`name_ar` must be a VLOOKUP), a stock revision (five formula columns), and an import-follow record (`approval_expiry_date`). |
| 9 | **The change with the least margin for error.** Save a ValleyFoods sales invoice (the densest handler: 6 `getAllRecords_` before its first write) and check every number it wrote — totals, tax, stock. Then save a second one immediately and check again. Then do a read-modify-write on the same screen twice in a row. If anything is wrong, revert `15f9c80` first, before anything else. Also confirm list pages are *faster*, not just unchanged — this phase turns the request memo on for the entire company read path, which never had it. |
| 11 | **TopLight, and best tested with two browsers.** Edit a product's name or category, then immediately open TopLight Products in another session — the change must be visible, not up to 10 minutes stale. Same for a customer/vendor name on the Sales and Purchasing lists. Then the one that was already subtly wrong: on the Products page, add a product and pick التصنيف from the dropdown — the list must show real category names with **no blank entry at the top**, and the save must succeed. Add a *new* category inline (the "add new" box) and confirm it appears in the dropdown immediately on the next page load, not after 10 minutes. Finally check the cash screens: the box (الخزنة) and account-code dropdowns must still populate. |
| 12 | **Every converted list must show the same rows in the same order as before.** TopChemical: متابعة الاستيراد, أوراق التسجيل, مقاسات الكرتون, مكتب الجمارك, الباركود. On مكتب الجمارك the two totals at the top are computed from **all** rows, not the visible ten — check that they did not change. On مقاسات الكرتون the النوع filter dropdown must still offer every type in the sheet, not just the types on the visible ten. On الباركود confirm the newest record is first. ValleyFoods: الخصومات and الأعمال الإضافية — same ten, same order, and the `total` count still reflects the whole sheet. TopLight: عروض الأسعار and الحركة النقدية — same ten, same order; on الحركة النقدية the debit/credit/balance summary at the top must be unchanged, and the box filter must still work. |
| 13 | **Save a ValleyFoods manufacturing order that adds two or more NEW work centres in one go** (this is the change — several appends in one save). Then open `valley_manufacture_work_center` and confirm: the new rows are contiguous at the bottom, in the order they appear on the form; their `id` values are consecutive with no gap and no repeat; and `work_center_cost` / `total_cost` are still **formulas** referencing their own row. Then edit the same order, remove one work centre and add another, and re-check. Separately: open any page and confirm the **company logo still renders** — that is the `\u0000` sentinel change in `03_Security.js`. If a logo goes missing, revert `30261ca`. |

### Step 4 — create the version
Only after the above. Apps Script editor → Deploy → Manage deployments → edit the live deployment →
New version → Deploy. **Note the previous version number before you do** — that is your fastest
rollback.

---

## 6. Rollback

**Fastest, any phase:** in Manage deployments, point the deployment back at the previous version.
Seconds, no code changes. This is the primary path.

**Per phase, in code** — each phase is one commit and they are independent in reverse order:
```bash
git revert 30261ca   # Phase 13b — work-centre batched append + the NUL-escape fix
git revert 3192ee7   # Phase 12c — TopLight sales-offer / cash: slice before mapping
git revert fdca7ff   # Phase 12b — ValleyFoods deductions / overtime: slice before mapping
git revert 25d3052   # Phase 12a — TopChemical, 5 endpoints: slice before mapping
git revert 6e1d85f   # Phase 11  — TopLight reference cache behind the version stamp
git revert 14ca5ab   # Phase 10 — docs only, nothing deployable
git revert 15f9c80   # Phase 9  — request memo (revert this FIRST if numbers look wrong)
git revert 6bf0e1b   # Phase 8b — TopChemical batched formula writes
git revert 71fbc0d   # Phase 8a — ValleyFoods batched formula writes
git revert 7ef4636   # Phase 7.3 — import-follow local row patch
git revert d0cb2ad   # Phase 7.2b — ValleyFoods reference cache
git revert 9053cb5   # Phase 7.2a — TopChemical reference cache
git revert a8c239f   # Phase 7.1 — TopChemical get_purchase_items
git revert c53d99a   # Phase 6 — hygiene
git revert 2eb1716   # Phase 5 — retention
git revert 454ae31   # Phase 4 — formulas
git revert 9172ccc   # Phase 3 — write path
git revert 6f39b7c   # Phase 2 — sales & purchase
git revert d4569c0   # Phase 1 — safe wins
git revert e79c68a   # Phase 0b — instrumentation
git revert ca0b73c   # Phase 0 — backups (you almost certainly do not want to revert this)
clasp push
```
Phase 1's items are independent of each other, so a single item can be reverted by hand rather than
the whole commit.

**Three ordering constraints in the list above.** Phase 13b's work-centre batch calls
`ensureGridRows_`, which Phase 8a added to `02_DataAccess.js`, so 13b must be reverted before 8a.
Phase 12's five TopChemical / two ValleyFoods / two TopLight endpoint rewrites are independent of
each other and of everything else — any one of the three can be reverted alone. Phase 11 is
independent too, but reverting it puts TopLight's 51 reference reads back on the unstamped 120s
key, which is the pre-existing behaviour, not a broken one. And:
Phase 8a added `applyRowFormulas_`,
`writeRowFormulas_` and `ensureGridRows_` to `02_DataAccess.js` and Phase 8b **calls** them, so 8b
must be reverted before 8a or the TopChemical write paths will throw. Everything else is independent
in reverse order. Phase 9 can be reverted on its own at any time — it only adds `noteMutation_()`
calls and changes two lines in `apiRouter_`; nothing else depends on it.

**Total abandonment:** `master` is untouched. `git checkout master && clasp push`.

**Data rollback** (only Phases 3, 4 and 5 can affect data):
- Phase 5 deletes nothing — archived rows are in `<sheet>_Archive_<year>` tabs and can be pasted back.
- Phases 3 and 4 affect only rows written *after* deployment. To repair: restore the affected sheet
  from the Phase 0 CSV backup with `restoreCsvToScratchSpreadsheet()` into a scratch spreadsheet,
  then copy the correct rows back by hand.

**Cache note:** Phase 2 changed cache key shapes and Phase 6 changed how reference data is stored in
`CacheService`. After a revert, some entries linger until TTL (≤ 10 minutes). If you need them gone
immediately, `bumpVersion_('ERP_Companies')` and edit any product/party row to bump the TopLight
stamp — or just wait.

---

## 7. Phase 4.4 — proposal for a separate decision (NOT executed)

**The idea.** Where a column is a formula that Apps Script could compute, write the computed **value**
instead of the formula. This is the largest single win available: it removes the cell from the
recalculation graph entirely, and because `getDataRange().getValues()` blocks until the spreadsheet
finishes recalculating, it speeds up *every read in the whole application* on that spreadsheet, not
just the page that owns the column.

**What it would change, concretely.** Taking the worst example, `writeByproductFormulas_` in
`Company_ValleyFoods_Actions.js` — `total_cost` on `valley_manufacture_by_product`. Today (after
Phase 4.3) it writes a formula containing three `INDEX/MATCH` lookups into `valley_products`, three
into `valley_manufacture_header`, and two whole-column `SUMIFS` over
`valley_manufacture_header!I:I` and `J:J`. Written into **every** byproduct row, the `SUMIFS` alone
make recalculation O(rows²).

Under 4.4 the script would read the three inputs it already has access to, compute
`total_cost` in JavaScript, and write a number. Same value on the day it is written.

Good candidates, in order:
| Sheet · column | Why it qualifies |
|---|---|
| `valley_manufacture_by_product` · `total_cost` | Worst offender. Two whole-column `SUMIFS` per row. |
| `top_light_product_purchasing` · `movement_code` | A `CONCATENATE` of a lookup and a date — a label, not a live number. |
| `top_light_cash_bank_movement` · `box_balance` | `SUMIFS($B$2:B<row>, …)` — a **running total**, so row *n* depends on all rows above it: this is O(rows²) by construction. |
| `*` · `month` / `year` | `=MONTH(x)` / `=YEAR(x)` where `x` never changes after write. Near-zero risk. |
| `*` · `name_vendor`, `chart_name`, `chart_account_main` | Display-only lookups. |

**Expected value diff: zero on the day of writing.** That is the whole point — and also the whole
risk. The diffs appear *later*:
- If someone corrects a product's cost in `valley_products`, every existing byproduct `total_cost`
  **stops** re-deriving. Today they all silently update. That is a genuine change to how the business
  data behaves, not just how it is stored.
- If someone edits a cell by hand expecting the formula to recompute, it will not.
- `box_balance` is the sharpest case: if a cash movement is edited or deleted, every running balance
  below it is currently corrected automatically. As static values they would all be wrong, with
  nothing to indicate it.

**My recommendation, in order:**
1. **Do `month` / `year` first, or not at all** — inputs never change after write, and the risk is
   about as close to zero as this gets.
2. **Do not convert `box_balance`.** A running balance is exactly the kind of value that must
   re-derive. Bounding its range (4.1) is the right fix there.
3. For `total_cost`, decide the business question first: *should correcting a product cost
   retroactively change the cost of already-manufactured batches?* If the answer is no — which for an
   accounting record it usually is — then 4.4 is not merely a performance change, it is the **more
   correct** data model, and worth doing deliberately. If the answer is yes, do not do it.
4. Whatever is converted, **keep the formula text in a comment in the code** so the column can be
   regenerated, and convert one column at a time with a full-sheet value diff before and after.

This needs a conversation, not a commit.

---

## 8. Other things you should know

1. **`getRefsCached_` has probably never worked for your larger sheets.** `CacheService` rejects any
   single value over ~100 KB, and the `cache.put` was inside a swallowing `try/catch`. For a big
   products or parties list, the write threw, was ignored, and every call rebuilt from a full sheet
   read — with nothing in the logs. Fixed in Phase 6 by chunking. **This may be a bigger real-world
   win than anything else in this run, and it is invisible in a small dataset** — which is exactly why
   it survived so long.
2. **`YourStrongPassword123!` was sitting in source** as a value in `DBLIVE_CONFIG.props`. It looks
   like a placeholder, but if it was ever a real password on `164.92.143.177/topchemicalpest`,
   rotate it. Also: because of the key-name bug, if MySQL currently works, its credentials are stored
   under Script Properties literally named `appscript_user` and `YourStrongPassword123!`. Migrate them
   to `MYSQL_USER` / `MYSQL_PASSWORD` at your convenience — the legacy names still work.
3. **`src_html/` is a stale partial duplicate.** Left entirely alone as instructed. For the record:
   45 files, of which **41 already differed** from their root counterparts at the pre-optimization
   baseline commit `f47847d` — so it was stale before this run started. It is not pushed
   (`skipSubdirectories`) and is now also in `.claspignore`. It is a real hazard: an optimisation
   edited into the wrong copy would silently never deploy. My recommendation is to delete it once you
   have confirmed nothing you need lives only there, but that is your call.
4. **`ERP_DataTable_JS.html` (39 KB) and `ERP_DataTable.html` are now unreferenced.** Kept on disk as
   the plan specifies, but nothing includes them any more.
5. **`04_TableEngine.js` was never in `filePushOrder`.** That is what made it dead. If any file is
   ever added that reassigns a global captured by `const ROUTES` in `Code.js`, it will hit exactly
   the same trap. Worth remembering.
6. **The `tables:` catalogs in the three registry files are now inert.** They were only ever read by
   the deleted engine. Harmless; removing them was out of scope.
7. **`getNextIdBatch_` throws if a document has zero lines** (`Count must be a positive integer`).
   Pre-existing, unchanged, and not reachable through the UI as far as I can tell — but it is there.
8. **Phase 3 only converted TopLight.** ValleyFoods has ~61 direct write sites and TopChemical ~29,
   including `writeByproductFormulas_`, which issues four `writeFormula_` calls per row and each of
   those does its own `getSheet_` + `getHeaders_` + `setFormula`. That is the same F-04 pattern and
   the same fix, and it is the largest remaining performance work in the codebase.

---

# Continuation run (Phases 7–10)

**Date:** 2026-09-06 · **Branch:** same `perf/optimization-run`, eight further commits
**Still nothing deployed.** `clasp push` has still never been run, no deployment created or promoted.

## C0. Read this part first

**1. One thing the previous run got wrong by omission, and should have said.** Phase 2 was scoped
around the four endpoints named in investigation §15.2. It converted three and never mentioned the
fourth. **TopChemical `get_purchase_items` was silently missed** — its only commit was the baseline,
and the Phase 2 report reads as though the phase was complete. It is done now (7.1), but the gap
existed and this document should show it.

**2. F-01 was bigger than the investigation described, and that is now fixed.** `apiRouter_` tested
`isReadAction_(request.action)`, and **every company page in the application calls the single route
`company_action`**, which never starts with `get_`. So the request memo was switched off for every
company request — reads included — not only for writes. Every list endpoint in the app has been
paying full re-reads for repeated access to the same sheet within one request, for the life of the
app. F-01 called this a write-path problem. It was an every-path problem.

**3. Two live bugs were found and fixed while doing the caching work, and neither was a performance
bug.** Both TopChemical and ValleyFoods reused one `getRefsCached_` cache key for several different
value *shapes*. In TopChemical, `prefetch_refs` warmed those keys with raw record arrays on an idle
timer, after which `add_product` rejected a valid category with **"الفئة غير موجودة في جدول
الفئات"** — a save blocked outright — and every client/vendor name rendered blank. In ValleyFoods the
sales form silently lost a party's tax_id, address and phone, and the asset-code dropdown silently
lost its 114100–115100 filter. Details in C1. **These had to be fixed before any TTL could be
raised**, which is the only reason they were found.

**4. Still nothing has been run against a real spreadsheet.** Same limitation as the first run. The
verification below is differential testing and static analysis under `node` — real and reproducible,
and not a substitute for executing against Google Sheets. Phase 9 in particular deserves the scrutiny
in §5 step 3.

---

## C1. What changed, per phase

| Phase | Commit | Summary |
|---|---|---|
| 7.1 | `a8c239f` | TopChemical `get_purchase_items` — slice before mapping, options split out |
| 7.2a | `9053cb5` | TopChemical reference cache → version-stamped, 600s, after fixing a key collision |
| 7.2b | `d0cb2ad` | ValleyFoods reference cache → version-stamped, 600s, after closing two invalidation gaps |
| 7.3 | `7ef4636` | F-21 — one provable conversion, and the reasoned decision for the other 37 |
| 8a | `71fbc0d` | F-04 on ValleyFoods — 19 of 22 `writeFormula_` calls merged into the row writes |
| 8b | `6bf0e1b` | F-04 on TopChemical — all 3 `setFormula` calls merged into their row writes |
| 9 | `15f9c80` | F-01 conservative variant — the memo survives until the first write |
| 10 | `14ca5ab` | Spent prompts retired to `Backup/`; `NEXT_STEPS_OWNER.md` |

### Phase 7.1 — the endpoint the previous run missed

`getPurchaseItems_` mapped **every** purchase row ever into a 15-field derived object, `.reverse()`d
the whole array, and only then sliced to 10. The order is now computed on an index array first, so
`reverse().slice(0, limit)` keeps its exact semantics while only the visible rows are mapped.

`vendorNameMap_` / `itemNameMap_` were extracted as the *map* half of `vendorRefs_` / `itemRefs_`.
The list needs the id → name map; it does not need the Arabic-collated `localeCompare` sort over
every vendor and every item, which is the expensive half and was being paid on every list render for
a form that may never open. `addPurchaseItem_` only ever read `.map`, so the sorts came off the save
path too.

New action `get_purchase_options`; the old combined response survives behind `withOptions:true`. The
page memoises it on first form open. **Checked first that the list view renders neither option list**
— it uses the server-resolved `vendor_name` / `item_name` — so unlike ValleyFoods purchasing, where
`supplier_options` had to stay, nothing had to be kept on the list path.

### Phase 7.2 — F-15 on the other two companies, and the bug that was in the way

Both companies now use the TopLight pattern: a version stamp folded into every derived cache key,
bumped by the buster, TTL 600s. **600s and not the 1–6 h F-15 floated, for the same reason as
TopLight:** a stamp cannot cover somebody editing a reference sheet by hand in the spreadsheet.

**The audits, which are the part that mattered.**

*TopChemical* — every mutation site for every cached sheet:

| Sheet | Mutation actions | Busts? |
|---|---|---|
| `clients_vendors` | `add_client_vendor`, `edit_client_vendor` | both |
| `products` | `add_product`, `edit_product` | both |
| `legal_customer_vendor` | `add_legal_party` | yes |
| `product_categories` | **none exist** | n/a — hand-edited only |
| `legal_products` | **none exist** | n/a |
| `chart_of_accounts` | **none exist** | n/a |

No delete action exists for any of them, and no other `.js` file writes to any of these sheets
(checked by literal sheet-name grep across all 19). Coverage complete.

*ValleyFoods* — nominally complete, but **two gaps made it not actually complete**, and both had to
be closed before 60s could become 600s:

1. **Every bust fired BEFORE its own write.** Scripted the position of each mutation relative to each
   bust: **13 of the 15 bust sites had all their mutations after the bust.** So: bust at t0, write at
   t0+300 ms, and any concurrent request landing in between re-caches *pre-write* data for the whole
   TTL. At 60s that was survivable; at 600s a product or party edit could stay invisible for ten
   minutes. Fixed additively — `withRefBust_` wraps the 14 registrations so the bust also runs after
   the handler returns, on every return path, without touching a single handler body. The original
   pre-busts are kept.
2. **`purchasing_supplier_options` and `purchasing_product_options` were never busted at all.** They
   called `getRefsCached_` directly and are not in `finBustRefs_`'s kind list, so only the TTL ever
   expired them. They now go through the stamp — bust coverage they never had.

**The key collision, in both companies.** `getRefsCached_` keys on `refs_<dbId>_<kind>`, and the same
`kind` string was reused across different sheets *and* different value shapes. TopChemical's
`'parties'` alone meant four different things sharing one key; `'products'` three; `'categories'`
three. ValleyFoods' `'parties'` meant four, `'products'` three. Whichever ran first inside the TTL
won and every other reader silently got the wrong shape. `prefetch_refs` — an idle-timer call made
from pages across the app — warmed all of them as raw record arrays, so this was routine, not rare.
Every `(sheet, shape)` pair now has its own kind, reached through exactly one named accessor so it
cannot come back, and both `prefetch_refs` implementations warm only shapes a reader actually
consumes. ValleyFoods' prefetch dropped from five sheet reads to two for the same reason: the other
three could no longer be warmed correctly, and warming a shape nothing consumes is a full sheet read
for nothing.

### Phase 7.3 — F-21, and why only one conversion

Scanned every page: **70 sites** issue a write then a list reload. **32 already patch locally** and
only fall back to a reload. Of the remaining 38, exactly **one** passed the rule
(*convert only saves that provably touch one row with no cascade*): TopChemical
`update_import_follow_status`, which writes one cell on one row, cascades to nothing, and is an
update rather than an add or delete so the 10-row limit is unaffected.

The other 37 are listed with their reasons in commit `7ef4636`. The three groupings that matter:

- **Cash, and anything touching stock or balances,** kept its full reload, as the rule requires.
- **Genuine cascades** — write counts taken from the handlers: `save_valley_mfg_order` writes 10 rows
  across 4 sheets, `save_valley_invoice` 8 including `valley_sales_product_stock`, and so on.
- **Handlers that return no record.** `save_valley_product`, `save_valley_party`,
  `save_valley_work_center`, `save_valley_work_center_asset` and `save_valley_asset_technical` all
  return `{status, message}` only. A local patch is impossible without widening the server contract —
  and widening it would be *wrong* here, because those list endpoints decorate every row with
  sheet-side aggregates the handler does not have (`getValleyProducts_` aggregates stock totals and
  batches onto each product row). A patched row would show a correct name and a missing number, which
  is exactly the failure the rule exists to prevent.

The most interesting near-miss: `addEmployee_` (TopChemical) looks like a clean single-row add, but
the row it appends contains **formulas** (`main_salary`, `allow`, `section`, `basic_salary`,
`الحالة الوظيفية`) and the handler returns placeholder zeros for them. A local patch would show `0`
for salary and allowance until the next real load. Kept the reload.

### Phase 8 — F-04 on the remaining two modules

The technique is Phase 3's, copied faithfully: formula strings extracted **verbatim** into
`*FormulaMap_` helpers, merged into the value row, one `setValues`.

**ValleyFoods (19 of 22 `writeFormula_` calls).** Merged into the block write, so the formulas now
cost *zero* extra round trips: outputs (2 per row), consumption (2 per row), by-products (4 per row —
the site §8 named as the largest remaining work in the codebase; a 4-by-product order goes from 17
round trips to 1), and `addValleyMfgByproduct_`. Batched where the row was already written and could
not be merged into: the MO header (8 calls → 1 helper call issuing 5 range writes and *zero*
`getSheet_`/`getHeaders_`), and work centres (3 → 1, because those three columns are adjacent).

**TopChemical (all 3 `setFormula` calls).** The file now contains zero `setFormula` calls.

**Three new shared helpers** live in `02_DataAccess.js` beside `writeFormula_`:
`applyRowFormulas_`, `writeRowFormulas_`, `ensureGridRows_`.

**Concurrency, deliberately changed.** The ValleyFoods outputs, consumption and by-product blocks
already wrote to a **precomputed** `getLastRow()+1` range with no lock, so two concurrent saves could
compute the same start row and one would silently overwrite the other. Each now recomputes its start
row inside `executeWithLock_` and grows the grid with `ensureGridRows_`. Same for TopChemical's
`addStockRevision_`, which held no lock. Row numbers are unchanged. `saveValleyMfgOrder_` as a whole
still has no outer lock — pre-existing, out of scope, and the reason each block takes its own.

One deviation from the brief, stated plainly: it asks for the original `set*Formulas_` function to be
kept as a thin wrapper over the extracted map. That was done for `writeByproductFormulas_`, which is
such a function. The three TopChemical sites have no such function — their formulas are decided
inline inside the handler from `headers.forEach` — so there was nothing to keep as a wrapper, and the
loops were left in place with only their destination changed.

### Phase 9 — F-01, the conservative variant

The memo starts **enabled**; the **first** mutation of the request turns it off — clearing it — for
the remainder of that request. A read action never mutates, so it keeps the memo throughout. A write
action reuses the reads taken before its first write, then behaves exactly as today.

`apiRouter_` also re-arms the memo immediately before the handler, because the auth preamble may
touch the session row and that write would otherwise cost the handler its memo over something it does
not care about.

**Coverage.** 183 direct Sheets write sites across the 11 server files. **All 183** call
`noteMutation_` immediately after the write — 168 placed by script, 14 by hand (multi-line
statements, chained calls, six `if (…) { deleteRow; break; }` one-liners where the call belongs
*inside* the braces, and one `Range.sort()` that reorders rows and the write pattern does not match).
Verified by a **separate** script from the one that did the insertion, which also asserts no memoised
read sits between any write and its invalidation.

**Defence in depth, and its limit.** On a request that *can* write, a memo hit is reused only if the
sheet still has the same shape (`getLastRow`/`getLastColumn` — metadata calls, not a values read).
That independently catches an append or delete that reached the sheet without going through
`noteMutation_`. It does **not** catch an in-place update; that rests on coverage alone. The guard is
armed by `setMemoGuard_(requestMayWrite_(request))`, and `requestMayWrite_` finally looks at
`payload.module_action` for `company_action`, so a pure read request does not arm it and the read
path pays nothing.

---

## C2. What was verified, and how

Nothing in this run was accepted on inspection alone where a test was possible.

| Change | Verification | Result |
|---|---|---|
| 7.1 reordering rewrite | differential test vs the original `map`/`reverse`/`slice`, random row counts 0–300, duplicate and blank ids, every awkward `limit` `slice` accepts (negative, fractional, string, NaN, Infinity, absent), plus `loadAll` | 40,000 cases, **0 mismatches** |
| 7.1 `vendorNameMap_` | differential test vs `vendorRefs_().map` over duplicate, blank, whitespace, numeric and null ids | 40,000 cases, **0 mismatches** |
| 7.2a extracted builders | each compared character-for-character against the inline original it replaced, by script, against `git HEAD` | 4/4 **identical** |
| 7.2b bust placement | scripted position of every mutation relative to every bust | 13 of 15 sites found broken, all fixed |
| 8a formula text | both sides sliced from their own source, evaluated under `node` at 7 different row numbers, strings compared | 19 formulas × 7 rows = **133 comparisons, 0 mismatches** |
| 8b formula text | old and new formula-producing code both run under `node` with the same headers and row number, `{column: formula}` maps compared, captured output inspected to prove the test is not vacuous | 3 sites × 4 rows = **12 comparisons, 0 mismatches** |
| `writeRowFormulas_` / `applyRowFormulas_` | tested against the semantics of the `writeFormula_` calls they replace, over random header layouts including 95,847 duplicate-header instances | 30,000 layouts, **0 mismatches** |
| 9 memo design | the real `disableRecordCache_`/`rearmRecordCache_`/`noteMutation_` eval'd out of the file, run against a fake spreadsheet over randomised read/write interleavings, asserting every read equals an uncached read | 180,389 reads, **0 stale** |
| 9 coverage | independent script over all 183 write sites | **0 problems** |
| every phase | `node --check` on all 19 `.js` files and the inline `<script>` of all 92 pages | pass |

The Phase 9 model was also run with the invariant deliberately broken, to *measure* what the design
rests on rather than assert it:

| Scenario | Reads | Stale |
|---|---|---|
| full coverage (what ships) | 180,389 | **0** |
| a missed site, appends/deletes | 179,700 | 3,499 |
| a missed site, in-place updates | 179,739 | 36,793 |

Read that as: the design is correct **given coverage**; the shape guard turns most of a missed
append/delete into a correct-but-slower read; and a missed in-place update is protected by nothing
except coverage. That is the residual risk of Phase 9, stated plainly. It is why the coverage check
is a different script from the one that did the insertion.

One check was **tried and abandoned as unsound**: a whole-file "the multiset of formula string
literals is unchanged" invariant. A single apostrophe anywhere re-phases a naive quote tokeniser, so
it reported dozens of false differences in code neither commit touched. The site-scoped differential
tests above replaced it. Recorded because a check that looks rigorous and is not is worse than no
check at all.

---

## C3. What was skipped, and why

| Item | Status |
|---|---|
| **Phase 4.1/4.2** — bounding whole-column ranges | Untouched, as instructed. Still blocked on `inventorySpreadsheets()`. This is now the largest remaining win. |
| **Phase 3.4 / F-05** — bulk-rewrite deletes | Not attempted. The previous run's reasoning still holds and was not re-litigated. |
| **F-03, F-20, F-11, `SystemLog.ChangedFields`, `src_html/`** | Left alone, as instructed. `src_html/` not touched or deleted, only reported. |
| **Phase 4.4** | Still a proposal in §7. Hard stop. |
| **3 of 22 ValleyFoods `writeFormula_` calls** (`:666`, `:730`, `:880`) | Each is a **single** formula written after `saveRecordWithAudit_` has already appended the row. Batching one formula saves nothing — the helper would issue the same single range write and still need the sheet and headers. Left as `writeFormula_`. |
| **The remaining 18 ValleyFoods `appendRow` calls** | Not F-04 sites. They are single-row appends that already carry their formula strings in the same `appendRow` — the optimal pattern already. The "19 appendRow" figure in the brief counts them all; only one was convertible, and it was converted. |
| **ValleyFoods work-centre append loop** | `sheetWC.appendRow(vals)` inside a `forEach` is a genuine N-appends-in-a-loop site, but it is a *mixed* update/append loop with a per-row `getNextIdUnderLock_` between iterations. Converting it would change the interleaving of appends and updates, and I could not verify the result identical by reading. Skipped and recorded rather than guessed. |
| **37 of 38 F-21 candidates** | Kept their full reload. Reasons per site in `7ef4636` and summarised above. |
| **Five unregistered delete actions** | Found, not fixed — writing five business-table delete handlers is not a performance change. Listed in `NEXT_STEPS_OWNER.md`. |
| **`get_import_follow`** | Has the *identical* map-everything-then-reverse-then-slice shape 7.1 fixed, in the same file. Not converted: Phase 7.1 was scoped to the four endpoints in investigation §15.2 and this is not one of them. It is a one-line follow-up using a transformation already proved here. |

---

## C4. Every assumption this run made

1. **`setValues` treats a leading `=` as a formula.** Inherited from Phase 3 and load-bearing for all
   of Phase 8. It is now better supported than an assumption: `writeBudgetRow_`
   (`Company_TopChemical_Actions.js`), which **predates this whole effort**, already writes values and
   formula strings together through one `setValues`, with a comment saying so. So this is not merely
   standard Apps Script behaviour — it is already load-bearing in production code you wrote. Still
   worth confirming on the first Phase 8 save.
2. **600s is the right reference-cache TTL for TopChemical and ValleyFoods.** Same reasoning and same
   number TopLight got in Phase 2.6. A hand edit to a reference sheet now surfaces within 600s
   instead of 120s (TopChemical) or 60s (ValleyFoods).
3. **Over-calling `noteMutation_` is free.** It only ever drops a cache. This is why the Phase 9
   sweep errs towards inserting, and why imprecise placement is safe.
4. **`getLastRow()`/`getLastColumn()` are much cheaper than `getDataRange().getValues()`.** The Phase
   9 shape guard rests on this. It is scoped to write-capable requests so the read path pays nothing,
   but if measurement shows it hurts, it is one line to remove in `getAllRecords_`.
5. **`executeWithLock_` is reentrant-safe,** so the locks added in Phase 8 can nest under
   `getNextIdUnderLock_`. Verified by reading it — that is what `_scriptLockHeld_` is for.
6. **Cache-key changes are free.** Every kind renamed in Phase 7.2 starts cold after deployment. The
   old entries linger until their TTL and are never read again.
7. **`ValleyFoodsHRModules`'s export object is unused outside the file.** Verified by grep. The
   `withRefBust_` wrappers are applied at registration, so anything calling those functions through
   the export would bypass the post-write bust — as `generateTestData_` does, which is a seeder and
   still gets the pre-bust.
8. **`prefetch_refs` is best-effort.** Warming fewer sheets (ValleyFoods, 5 → 2) is acceptable
   because the three dropped could no longer be warmed in a shape any reader consumes.

---

## C5. Other things you should know

1. **`03_Security.js` contains two literal NUL bytes**, at lines 649 and 652. They are deliberate —
   `getCompanyLogoUrl_` uses a NUL character as a "cached empty string"`\u0000` sentinel, written as a raw
   byte rather than an escape sequence. It works, and it makes `grep` treat the file as binary. It is
   fragile: any editor or transfer that strips NULs would break the logo cache silently. Worth
   converting to an escape sequence one day; not changed here.
2. **`isReadAction_` finally does something correct.** It was only ever used to decide the memo, on
   the router action, which made it wrong for every company request. It now backs `requestMayWrite_`,
   which looks at `payload.module_action`.
3. **TopLight Purchasing, Sales and Sales_Offer patch their delete locally while their list is capped
   at 10**, so a delete leaves 9 rows and the 11th does not appear until the next navigation.
   Pre-existing — the limit predates Phase 2 — and cosmetic rather than wrong numbers, so it was left
   alone. But it is the exact case the F-21 rule warns about, and it is your call whether those three
   should go back to a full reload.
4. **`UI_UX_INVESTIGATION.md` appeared in the working tree during this run** and is not this run's
   work. It was briefly swept into the Phase 7.3 commit by an over-broad `git add`; that commit was
   amended and the file left **untracked** so you decide what to do with it.
5. **`saveValleyMfgOrder_` still has no outer lock.** It writes 10 rows across 4 sheets with no
   transaction of any kind. Phase 8 gave each of its block writes its own lock, which fixes the
   overwrite race, but two concurrent saves of the *same* manufacturing order can still interleave.
   Pre-existing and out of scope; worth knowing.


---

# Continuation run (Phases 11–14)

**Date:** 2026-09-06 · **Branch:** same `perf/optimization-run`, five further commits
**Still nothing deployed.** `clasp push` has still never been run, no deployment created or promoted.

## D0. Read this part first

**1. The gap this run found, which neither previous report mentions.** Phase 2.6 built `tlRefs_`,
`tlCachedMap_` and the `tl_refs_ver_<dbId>` stamp for TopLight — and then applied them to **four call
sites**, the Sales & Purchase form option builders. The other **51** reference reads in
`Company_TopLight_Actions.js` went on calling `getRefsCached_` directly at a 120s TTL, outside the
stamp. So `bustTopLightCaches_` was bumping a version those 51 entries were not keyed on, and a
product or party edit did not invalidate them at all — they simply aged out. The first run's Phase 2.6
write-up reads as though the module was done. It was not. Measured on a model of the real code: of
the 47 sites whose sheets have an app-driven mutator, **43 still served stale data five seconds after
an edit**. The four that did not are exactly the four Phase 2.6 converted. That is fixed in Phase 11,
and this paragraph exists because the same omission happened twice now — first run to second, second
run to third — and the pattern is worth naming: *a phase that converts "the sites that matter" and
does not count the ones it left behind will read as complete.*

**2. A second, smaller live defect, found by checking the shapes rather than assuming.**
TopLight's `'categories'` cache key carried two different value shapes: `categoryOptions_` stored a
projected **and filtered** `[{id, name_ar}]`, four other sites stored raw records. The previous run
flagged this as a latent hazard. It was slightly worse than latent: `prefetch_refs` — an idle-timer
call made from pages across the app — warmed the key with the **raw** shape, and the raw shape has no
filter, so whenever prefetch won the race a blank-`id` category was already reaching the
التصنيف dropdown on the Products page as an empty option. Split into `categories_opts` and
`categories_raw`.

**3. Phase 4.1/4.2 is still blocked, and was not guessed at.** The one question this run was allowed
to ask — has `inventorySpreadsheets()` been run — was answered *"don't know yet"*. Without the real row
counts there is no basis for choosing a bound, and a bound set too low does not fail loudly: `VLOOKUP`
silently misses rows and `SUMIFS` silently undercounts, on costing and payroll data. It stays
blocked. It is still the largest single win left in the whole investigation, and it is still ten
minutes' work once the inventory has run. See `NEXT_STEPS_OWNER.md` item 4.

**4. Still nothing has been run against a real spreadsheet.** Same limitation as both previous runs.
Everything below is differential testing and static analysis under `node` — real and reproducible, and
not a substitute for executing against Google Sheets. There are now **28 commits** on this branch,
not one of which has been executed against a spreadsheet.

---

## D1. What changed, per phase

| Phase | Commit | Summary |
|---|---|---|
| 11 | `6e1d85f` | F-15 on TopLight — the 51 reference reads Phase 2.6 left outside the version stamp |
| 12a | `25d3052` | TopChemical — slice before mapping at 5 more endpoints |
| 12b | `fdca7ff` | ValleyFoods — slice before mapping at `getDeductionsData_`, `getOvertimeData_` |
| 12c | `3192ee7` | TopLight — slice before mapping at `get_sales_offer_headers`, `get_cash_headers` |
| 13b | `30261ca` | ValleyFoods work-centre batched append; the two NUL bytes in `03_Security.js` |
| 14 | this commit | This section, the §5 and §6 updates, `NEXT_STEPS_OWNER.md` |

### Phase 11 — finishing F-15 on TopLight

**The audit came first**, and it is the part that mattered. Every mutation site for every sheet
reached through `getRefsCached_`, found by literal sheet-name grep across all 19 `.js` files:

| Sheet | Mutating actions | Busts? |
|---|---|---|
| `top_light_products` | `add_product`, `edit_product` | both, **after** the write |
| `top_light_customer_vendor` | `add_party`, `edit_party` | both, **after** the write |
| `top_light_categories` | `createCategory_` (inline add, reached from `add_product`/`edit_product` via `resolveCategoryId_`) | `invalidateRefsCache_` only — **see below** |
| `top_light_chart_of_accounts` | **none exist** | n/a — hand-edited only |
| `top_light_box_account_codes` | **none exist** | n/a — hand-edited only |

No delete action exists for any of the five. No other `.js` file writes to them — the only references
outside `Company_TopLight_Actions.js` are two rows in the `tables:` catalog of
`Company_TopLight_Registry.js`, inert since `04_TableEngine.js` was deleted in Phase 6. `05_Admin.js`'s
one `sheet_name`-driven route is `get_record_history`, read-only. The IIFE exports only
`dispatch_`/`pageForAction_`/`tableForAction_`, so there is no bypass of the kind
`ValleyFoodsHRModules` had.

**`createCategory_` is a mutation site the brief did not name**, and it was the one outside
`bustTopLightCaches_`. It called `invalidateRefsCache_(dbId, 'categories')`, which drops the
*unstamped* key. Once both category shapes moved behind the stamp that call would have invalidated
nothing. It is now `bumpTlRefsVersion_(dbId)`. **Without that, this phase would have introduced a real
invalidation gap** — which is the argument for auditing the mutators before touching the readers, not
after.

**Bust placement, scripted rather than read by eye.** This is what caught ValleyFoods out in 7.2b,
where 13 of 15 busts fired *before* their own write. TopLight is clean: all 18 functions in the file
that both write and bust have every write before every bust — writes-after-bust = 0 at every site.
Nothing had to be added. Worth recording as a difference between the two modules rather than an
assumption carried across.

**The shape audit**, run on all five kinds rather than only the one the brief flagged:
`parties` (23 sites), `products` (15), `chart_of_accounts` (4) and `boxes` (4) each carry exactly one
shape. `categories` carried two — D0 item 2.

**The conversion.** Five named accessors beside `tlRefs_` — `partyRefs_`, `productRefs_`,
`categoryRefs_`, `chartRefs_`, `boxRefs_` — one per `(sheet, shape)`, plus `categoryOptions_` keeping
the projected shape under its own kind. All 51 sites route through them, so the collision cannot come
back. TTL 600s, matching TopChemical and ValleyFoods. **Zero direct `getRefsCached_` calls remain in
the file.** The four sites Phase 2.6 converted fold into the same accessors, since their builders were
already the canonical raw ones. `tlCachedMap_` untouched, as instructed.

`prefetch_refs` now warms through the accessors — the stamped keys readers actually read, rather than
the unstamped 120s keys nothing reads any more — and warms **both** category shapes instead of
clobbering one with the other. The second `getAllRecords_` on `top_light_categories` costs no sheet
read, because the Phase 9 request memo serves it.

**One thing deliberately left alone, stated so it does not mislead:** the four
`invalidateRefsCache_(dbId, 'products'/'parties')` calls in `addProduct_`, `editProduct_`, `addParty_`
and `editParty_` are now **no-ops** — they drop a key nothing writes. They sit one line after the
`bustTopLightCaches_` that does the real work. Left in place to keep the diff to the caching change
itself. Also noted, not changed: `bustTopLightCaches_` removes `tl_cat_opts_<dbId>`, a key nothing has
ever written.

### Phase 12 — the 7.1 transformation, everywhere it actually applies

Found by grepping `slice(0, limit)` — **34 sites across the three company files** — and walking back
from each one, rather than working from the brief's estimate of "roughly fifteen". The real count of
sites with the map-everything-then-slice shape is **nine**. The brief's number was too high; most of
the 34 already slice raw records and enrich afterwards, which is the right shape already.

**Converted, nine endpoints:**

| File | Endpoints | Shape |
|---|---|---|
| TopChemical | `getImportFollow_`, `getRegistrationPapers_` | pure map → reverse → slice |
| TopChemical | `getCartonSizes_` | map → reverse → slice, with a `typeSet` accumulated **inside** the map that `type_options` is built from |
| TopChemical | `getCustomsOffice_` | map → reverse → slice, with **two running totals** accumulated inside the map and reported from the full set, and an `id` taken from the map index |
| TopChemical | `getBarcode_` | map → sort by raw `id` → slice |
| ValleyFoods | `getDeductionsData_`, `getOvertimeData_` | pure map → reverse → slice |
| TopLight | `getSalesOfferHeaders_`, `getCashHeaders_` | `Object.assign({}, r)` for every row → sort on raw keys → slice |

Every conversion **keeps the slice on the index array**. That is the point of the transformation, not
an incidental detail: it is what makes a negative, fractional, string or `NaN` `limit` behave
identically. A counted loop does not, and the mutation tests below show exactly that.

The accumulators are the interesting part. Where a total or a key-set was being built *inside* the
map over every row, it moves to its own pass in the same `0..n-1` order — same additions in the same
sequence, so the same floating-point result; same object-key insertion order, so the same
`Object.keys` order, and `Array.prototype.sort` is stable, so the same option list. Where a sort key
was copied straight off the raw row, the same comparator applied to an index array yields the same
permutation, for the same stability reason.

**Options were not split out anywhere in this phase, and that is a decision, not an omission.** The
spec asks to check whether each endpoint also builds form option lists the list view never renders.
The check says no, for two reasons. First, every option list on the converted endpoints comes from
`productRefs_` / `clientVendorRefs_` / `customerVendorOptions_` / `salesOptions_` / the
`getActiveEmployeeOptions_` family — all of which have been behind a version-stamped 600s cache since
Phase 7.2, and now Phase 11. The list path pays a cache lookup, not the three uncached full sheet
reads that made the 2.1 and 7.1 splits worth their risk. Second, the one endpoint where it looked
worthwhile — `get_sales_offer_headers`, which returns `salesOptions_` unconditionally where
`get_sales_headers` gates the same payload behind `withOptions:true` — turns out to read
`__options.customer_options` on the **save** path, at `Company_TopLight_Sales_Offer.html:336`, to
resolve `customer_name` for the local row patch. That is exactly the ValleyFoods `supplier_options`
situation the spec warns about, and moving it would have changed a save path for no read saved.

**Skipped, with reasons** — the full list is in `D3`.

### Phase 13 — branch b, because 13a is still gated

`inventorySpreadsheets()` has not been confirmed run, so 4.1/4.2 stays untouched. Branch b was two
items.

**The ValleyFoods work-centre append loop.** Phase 8 skipped this and said why: it is a *mixed*
update/append loop with a per-row `getNextIdUnderLock_` between iterations, so deferring the appends
changes what that function reads. It does. **It does not change what it returns**, and that is
provable rather than hopeful:

> `getNextIdUnderLock_` returns `current` (the `ID_Counter` value for the table) when
> `current > tableMax`, and `tableMax + 1` otherwise, then sets the counter to `returned + 1`. Every
> return is therefore `>= tableMax + 1`. So at call *k* ≥ 2 the counter holds `r(k-1) + 1`, and:
> deferred, `tableMax` is still `M0` and `r(k-1) + 1 >= M0 + 2 > M0`; immediate, `tableMax` is
> `r(k-1)` and `r(k-1) + 1 > r(k-1)`. Both take the healthy branch and both return `r(k-1) + 1`.
> Call 1 is identical because the state is. The update branch never writes the `id` column, so an
> interleaved update cannot move `tableMax`; and the appended rows carry fresh `uid16Hex_`
> `unique_id`s that can never match an `editingUid`, so an interleaved update never targets one.

Row numbers hold for the same reason the Phase 8 blocks do: only appends change the row count during
this loop — the deletes run after it — so the batch starts at the same `getLastRow() + 1` and lands in
the same order. Locked and grid-grown, because a precomputed start row, unlike `appendRow`, is not
safe against a concurrent append. The post-loop `writeRowFormulas_` pass is untouched.

**The NUL bytes in `03_Security.js`.** `getCompanyLogoUrl_` used a raw NUL byte as its "cached empty
string" sentinel. It worked, and it made `grep` treat the whole file as binary; any editor or transfer
that strips NULs would have broken the logo cache silently. Both are now the escape sequence for the
same character. Byte-level edit that first asserted there were exactly two and that each was a lone
character inside a single-quoted literal. **The file now contains zero NUL bytes** and `grep` reads it
as text. The diff is two lines, two characters.

---

## D2. What was verified, and how

Nothing in this run was accepted on inspection where a test was possible. In every case the old code
was sliced out of `git show HEAD:<file>` and the new code out of the working tree, and both were run
under `node` against identical inputs. **No formula, expression or comparator was ever retyped** —
each side is compiled from its own source text, so drift is impossible by construction.

| Change | Verification | Result |
|---|---|---|
| 11 — accessor value equivalence | each of the 5 accessors vs the exact inline `getRefsCached_` expression it replaced; 6 row counts (0, 1, 2, 7, 40, 300) × 40 rounds of randomised records with blank, null, whitespace, numeric and Arabic cells | 55 sites × 40 rounds = **2,200 cases, 0 mismatches** |
| 11 — one shape per cache key | run against **both** versions, so the check is shown to fail on the real defect | OLD: **1 collision** (`refs_<db>_categories` carries `id\|name_ar` *and* `id\|name_ar\|name_eng`). NEW: **0 collisions** across all 6 keys |
| 11 — invalidation reach | warm the cache, write to the sheet, bump the stamp, read 5s later; 47 stamp-eligible sites | OLD **43 of 47 still STALE**; NEW **0 of 47** |
| 12a — TopChemical, 5 endpoints | whole response object compared: 9 row counts × 4 randomisations × 22 `limit` values × 5 `loadAll` values × 5 endpoints. `limit` includes `-1, -3, -100, 2.7, -2.7, '5', '  7 ', 'abc', NaN, ±Infinity, null, true, false, 1e9`; ids include blank, null, numeric-string, duplicate and non-numeric | **20,700 cases, 0 mismatches** |
| 12b — ValleyFoods, 2 endpoints | same design, 23 `limit` values | **8,280 cases, 0 mismatches** |
| 12c — TopLight, 2 endpoints | same design, 25 `limit` values incl. 2000/2001 for the cash cap, plus the `data === undefined` path; the real `parseDate_` sliced from the file and asserted byte-identical to HEAD | **9,002 cases, 0 mismatches** |
| 13b — work-centre loop | both loop bodies sliced from their own source and run against an identical fake spreadsheet, with the **real** `getNextIdUnderLock_` and `ensureGridRows_` from `02_DataAccess.js`. 0–5 existing rows × 0–7 `work_ops` × **4 `ID_Counter` states** × 6 randomisations. Compared: the full sheet cell-for-cell, the id sequence, the `ID_Counter` contents after the run, and the returned `keepWcUids` | **1,152 cases, 0 mismatches** |
| 13b — NUL removal | byte count before and after; the escape's `charCodeAt(0)` checked to be 0 | 2 → **0 NUL bytes**, same character |
| every phase | `node --check` on all 19 `.js` files and the inline `<script>` of all 92 pages | 110 blocks, **pass** |

The four `ID_Counter` states in the 13b test are the ones that decide the branch: counter ahead of the
table max (healthy), counter exactly at max + 1, counter **behind** the table max (stale), and **no
counter row for the table at all**.

### Every test was shown to fail on a real defect

The previous run recorded a check that looked rigorous and was not. So each of these was mutated and
re-run, and the mutants are the mistakes a careless version of the change would actually make:

| Test | Mutation | Caught? |
|---|---|---|
| 11 key-shape | none needed — the check reports the collision that exists in `HEAD` today | yes, by construction |
| 12a | replace the index slice in `getBarcode_` with a counted loop | **300 mismatches**, first at `limit -1` |
| 12a | build `getCartonSizes_`'s `typeSet` from only the visible rows | **2,300 mismatches** |
| 12c | `Math.max(0, limit)` on the cash cap — a plausible-looking tidy-up | **380 mismatches**, first at `limit -1` |
| 13b | start row `getLastRow()` instead of `getLastRow() + 1` | **882 mismatches** |
| 13b | appended rows written in reverse order | **608 mismatches** |
| 13b | one id taken and reused for every new row | **881 mismatches** |

And the captured output was printed and inspected at least once per test, so none of them is passing
vacuously on empty data:

- `getCustomsOffice_`, 6 rows, `limit -2` → ids `[6,5,4,3]` with the summary computed from all six,
  identical both sides.
- `getBarcode_` over raw ids `[4,7,"abc",17,"3",2]` → `[17,7,4,"abc"]` both sides — the stable-sort
  permutation with a `NaN`-producing comparator.
- `getCashHeaders_` over `transaction_id`s `[null,7,14,"","",0,"zz"]` → `[14,7,null,"","",0,"zz"]` both
  sides, with `box_name` `["بنك","خزنة","خزنة"]` and `customer_name` `["عميل ١","عميل ٢","عميل ١"]` non-empty,
  proving the enrichment the map exists for is exercised.
- 13b, stale counter, 2 existing rows (ids 19, 20), 4 `work_ops` of which 3 are edits → both versions
  produce ids `[19,20,21]`, counter `22`, uids `[OLDUID0, OLDUID1, NEWUID0001]`, and the op sequence
  goes `[update, update, update, appendRow]` → `[update, update, update, setValues(1)]`.

### Two test artifacts that were mistaken for defects, and what they cost

Both are recorded because in each case the first reading of the numbers was wrong, and the honest
version of "0 mismatches" includes how the earlier non-zero ones were resolved.

1. **The Phase 11 invalidation test initially reported 30 of 55 sites stale under the new code.** The
   cause was the test, not the code: `bumpTlRefsVersion_` stamps with `new Date().getTime()`, and the
   model's virtual clock was not driving `Date`, so two bumps inside the same millisecond produced the
   same stamp. Once `Date` was frozen to the virtual clock the figure went to 0. *The underlying
   sub-millisecond stamp collision is real in production too* — an entry written and the stamp bumped
   inside one millisecond, with a full sheet read in between — and is not reachable in Apps Script.
2. **The Phase 13b test initially reported 13 of 1,152 mismatches.** Every one was a `created_at` /
   `start_time` / `end_time` a millisecond apart between the two runs. `new Date()` again. Freezing it
   inside the compiled block — which needed `Date` passed in as a parameter, because `new Function`
   compiles in global scope and does not see a module-level shadow — took it to 0.

---

## D3. What was skipped, and why

| Item | Status |
|---|---|
| **Phase 4.1/4.2** — bounding whole-column ranges | Still blocked. The gating question was answered *"don't know yet"*. Not guessed. Still the largest remaining win. |
| **`getStockRevision_`** (TopChemical) | The "map" **is** the record build, including the `Object.values(record)` empty-row test with its duplicate-header collapse — the F-02.1 semantics. Which rows survive cannot be known without building them, so there is nothing to defer. |
| **`getEmployeeSalary_`, `getEmpDeductions_`, `getEmpPermits_`, `getEmpOvertime_`** (TopChemical) | `.slice(-300)` runs **before** the map, so at most 300 derived objects are built. The sheet read is unchanged; the win is ~290 small allocations. Not worth more unverified change on a branch with nothing deployed. |
| **`getEmployeeStatus_`** (TopChemical) | The `.filter()` predicate reads `employee_code`/`status_type`, which the map produces. The map cannot be deferred behind its own filter. |
| **`getArAp_`, `getArApClient_`, `getEmpSalaries_`** (TopChemical) | The map runs over aggregated groups or a `.slice(-300)` — already bounded. |
| **`getTrustMovements_`** (TopChemical) | Filtered to one account before the map, and the sort key is `String(r.date).localeCompare(...)` — a pre-existing oddity on `Date` objects that I did not want to reproduce blind for a marginal win. |
| **`getLegalManufacture_`** (TopChemical) | No per-row map at all. |
| **`getEmpStatusData_`, `getShiftAssignmentData_`, `getSalaryData_`, `getVacationAllocData_`, `getMonthlySalariesData_`, `getValleyPurchasingCosting_`** (ValleyFoods) | No per-row derived map — they slice raw records and enrich afterwards, which is already the right shape. |
| **`getVacationsData_`** (ValleyFoods) | Its "map" assigns `vacation_type_name` onto the raw record **in place** and returns the same object. There is no derived object to defer, only one property write per row. |
| **`getValleyMfgByproducts_`** (ValleyFoods) | Rows are already filtered to a single manufacturing order before the slice. |
| **Splitting form options into `get_*_options` actions** | Checked at every converted endpoint and declined at all of them, for the two reasons in D1 Phase 12. |
| **Phase 3.4 / F-05, Phase 4.4, F-03, F-20, F-11, `SystemLog.ChangedFields`, `src_html/`** | Untouched, as instructed. `src_html/` not touched or deleted. |
| **The five unregistered delete actions** | Hard stop. Still listed in `NEXT_STEPS_OWNER.md`. |
| **`saveValleyMfgOrder_`'s missing outer lock** | Still absent. Pre-existing; Phase 13b's work-centre batch takes its own lock, as the Phase 8 blocks do, but the four-sheet transaction is a redesign, not an optimisation. |

---

## D4. Every assumption this run made

1. **600s is the right reference-cache TTL for TopLight's other 51 sites.** Same number and same
   reasoning the other two companies got in 7.2. Note what it means for the two sheets with **no
   app-driven mutator at all** — `top_light_chart_of_accounts` and `top_light_box_account_codes`, which
   are hand-edited only: a hand edit to either now surfaces within 600s instead of 120s. That is the
   same trade Phase 7.2a accepted for TopChemical's `product_categories`, `legal_products` and
   `chart_of_accounts`, and it is the reason the TTL is 600s and not the 1–6 h F-15 floated.
2. **Cache-key changes are free.** Every kind renamed in Phase 11 starts cold after deployment; the
   old unstamped entries linger until their TTL and are never read again. Inherited from 7.2.
3. **`Array.prototype.sort` is stable**, which the ES2019 spec requires and V8 implements. Phase 12's
   index-array sorts rest on it. It is also exercised directly by the differential tests, including on
   comparators that return `NaN`.
4. **Floating-point addition in the same order gives the same result.** Phase 12's accumulator moves
   (`getCustomsOffice_`'s two totals, `getCartonSizes_`'s `typeSet`) rest on the pass running over the
   same rows in the same `0..n-1` sequence. Verified by whole-object comparison rather than argued.
5. **`getNextIdUnderLock_`'s algorithm is as read.** The Phase 13b proof depends on its exact branch
   structure. It was sliced into the test from `02_DataAccess.js` rather than modelled, so the test
   exercises the real function — but if that function is ever changed, the proof needs redoing.
6. **`executeWithLock_` is reentrant-safe**, so the lock added around the work-centre batch can nest.
   Inherited from Phase 8 and unchanged.
7. **The Phase 9 request memo serves the second `getAllRecords_` on the same sheet within a request.**
   This is why warming both category shapes in `prefetch_refs` costs one sheet read, not two.
8. **Over-calling `noteMutation_` is free, under-calling is not.** The work-centre batch calls it once
   after the single `setValues` where the old code called it once per `appendRow`. One call after the
   write is correct; the count does not matter.

---

## D5. Other things you should know

1. **Three untracked `UI_UX_*.md` files are now in the working tree**: `UI_UX_INVESTIGATION.md` (which
   appeared during the second run), plus `UI_UX_EXECUTION_PLAN.md` and `UI_UX_RUN_PROMPT.md`, which
   appeared **during this run**. None of them is this workstream's work and none has been committed,
   edited or deleted. Something else is writing into this repository — worth knowing before you assume
   a clean `git status` means nothing happened.
2. **The brief's "52 direct `getRefsCached_` calls" was 51.** Its own per-kind counts (23 + 15 + 5 + 4
   + 4) sum to 51; the 52nd occurrence is the call inside `tlRefs_` itself. Its "roughly fifteen more
   endpoints" for Phase 12 was nine. Both figures are corrected above; neither changed what was done.
3. **The brief said the branch had 23 commits.** It had 22 when this run started. Cosmetic.
4. **`03_Security.js` can now be grepped.** It was being treated as a binary file by every text tool,
   which is worth remembering if you have ever searched this repository and quietly got no results
   from that file.
5. **TopLight Purchasing, Sales and Sales_Offer still patch their delete locally while their list is
   capped at 10**, so a delete leaves 9 rows. Pre-existing, reported by the previous run, unchanged —
   and Phase 12c touched `get_sales_offer_headers`'s ordering without changing that behaviour.
6. **The 28 unverified commits are the real risk now, not any single change.** Each phase is
   independently revertable and §6 lists the order, but nothing on this branch has met a real
   spreadsheet. The §5 step-3 table is written to be usable by someone clicking through the UI; it is
   the only testing this work will get before it meets production data.
