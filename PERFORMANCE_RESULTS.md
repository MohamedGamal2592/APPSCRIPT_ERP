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
