# الحضور والانصراف — `vf_hr_attendance` (Valley Foods) — execution plan

Rebuild of the attendance page over the two existing production tables
`valley_attendance_session` (one row per day) and `valley_employee_attendance` (the punches).

Two invariants drive everything:

- **I-1** — one session row per `session_date`. No two sessions share a calendar date.
- **I-2** — no `(emp_id, attendance_date_time)` duplicate, from any entry path.

Canonical storage stays exactly as it is today: `attendance_date_time` and `session_date` are
**pure numeric Sheets serials** at minute precision (`dateTimePartsToSerial_` / `toSerialInt_`,
`Company_ValleyFoods_Actions.js` L1058–L1145), with the cell number format applied separately.
That layer is correct — do not touch it. Everything below is about *deciding* the parts before
they reach `dateTimePartsToSerial_`, and about making a wrong decision reversible.

Files in play:

| File | Role |
|---|---|
| `Company_ValleyFoods_Actions.js` | all handlers, `ValleyFoodsHRModules` IIFE, attendance block L1857–L2320 |
| `Company_ValleyFoods_Attendance.html` | the page (**the only authoritative copy**) |
| `src_html/Company_ValleyFoods_Attendance.html` | stale, `.claspignore` L26 excludes it — **never edit, never read as truth** |
| `Client_AttendanceParser.html` | **new** shared partial: decoder, column mapper, inference engine (Phase B) |
| `tools/lib/sources.js` | add the new partial to `SHARED_PARTIALS` (L40–L49) — otherwise `pageFiles()` treats it as a page and `ui_smoke_pages.js` fails trying to boot it |
| `tools/verify/s16_attendance.js` | new offline check suite |
| `tools/verify/run_all.js` | register the new step |

---

## 0. Hard constraints

1. **No schema change from code.** Every new column in §1 is an **owner step**, applied by hand in
   the spreadsheet. All code must detect a column by header name and degrade cleanly when it is
   absent (`hasCol_(headers, name)`), never append a header itself. `ensureSheet_` (L1035) only
   creates a *missing sheet*; it must not be relied on to add a column to an existing one.
2. **No data writes outside a user-initiated save/commit/revert handler.** No backfills, no seeds,
   no one-off `clasp run` migrations against production.
3. **No `ERP_Pages_Matrix` edits.** Every new action maps to the existing page id `vf_hr_attendance`,
   so no new grant is needed. `revert_attendance_import` is `access: 'full'` and is therefore already
   gated by the owner's existing role grants.
4. Verify every `file:line` in this plan before editing — they were taken at HEAD `d88a2f7`.

---

## 1. Owner step — additive columns (do this before Phase A ships)

Append at the **end** of each sheet, in this order. Nothing is reordered, renamed or retyped.

**`valley_employee_attendance`** — after `created_at`:

| Column | Values |
|---|---|
| `import_batch_id` | batch uuid, `''` for manual entries |
| `entry_source` | `upload` \| `manual` |
| `parsed_format` | `ISO` \| `DMY` \| `MDY` \| `XLSX` \| `MANUAL` |
| `source_raw` | the original file row text (upload only) |

**`valley_attendance_session`** — after `created_at`:

| Column | Values |
|---|---|
| `import_batch_id` | batch uuid of the upload that auto-created it, `''` if created by hand |

**`valley_attendance_needs_review`** — after `uploaded_at` (current headers are
`raw_row_text, reason, chosen_format, uploaded_by, uploaded_at`, L2080):

| Column | Values |
|---|---|
| `review_id` | uuid |
| `import_batch_id` | batch uuid |
| `review_status` | `open` \| `fixed` \| `discarded` |
| `emp_id_guess` | best-effort code, may be blank |
| `datetime_guess` | serial, may be blank |
| `resolved_by` / `resolved_at` | audit |

**New sheet `valley_attendance_import_batch`** — created by `ensureSheet_` on first use (a new
sheet is allowed; a new *column on an existing sheet* is not):

```
batch_id, file_name, file_rows, uploaded_by, uploaded_at, chosen_format, detected_format,
confidence, rows_imported, rows_duplicate, rows_flagged, sessions_created,
date_min, date_max, batch_status, reverted_by, reverted_at
```

`date_min` / `date_max` are serials. `batch_status` ∈ `active | reverted`.

**Degradation contract:** if `import_batch_id` is missing from `valley_employee_attendance`, the
import still works, but the client must not render the undo button and `revert_attendance_import`
must throw a clear Arabic error naming the missing column.

---

## 2. Defect register

Every item is fixed by exactly one phase. This table is the acceptance checklist.

| # | Defect | Where | Phase |
|---|---|---|---|
| D-01 | Manual entry does **no** duplicate check — violates I-2 directly | `Actions.js` L1965 `addManualAttendance_` | A |
| D-02 | Manual entry never checks the punch date against its session's date | `Actions.js` L1969–L1975 | A |
| D-03 | I-1 enforced by read-then-write with no lock; upload auto-creates sessions concurrently | `Actions.js` L1889–L1896, L2196–L2205 | A |
| D-04 | No undo. A wrong format choice writes thousands of rows permanently; page has no delete path | whole module | A |
| D-05 | Session detail loads 10 punches and prints `rows.length` as the total | `Attendance.html` L161 + `Actions.js` L1953 | A |
| D-06 | Only the last 10 sessions reach the UI; the manual dropdown is fed from the same list, so older days are unreachable | `Attendance.html` L134–L152 | D |
| D-07 | Sessions ordered by sheet insertion, not by `session_date` | `Actions.js` L1861 | D |
| D-08 | `endDate.setHours(...)` runs before the `!endDate` null guard → TypeError | `Actions.js` L2284–L2286 | F |
| D-09 | Range filter mixes UTC-derived serial Dates with `setHours` local time; clips the last 2–3h of the final day | `Actions.js` L2285, L2298 | F |
| D-10 | Employee code = "everything before the first date-looking token", Arabic letters kept; `1,أحمد,…` imports as `"1أحمد"` and is never flagged | `Actions.js` L2143, L2212 | B |
| D-11 | No column mapping at all — the row is `join(' ')`-ed and regexed; the first date in the row wins | `Actions.js` L2136–L2141 | B |
| D-12 | `readAsText` is UTF-8 only; cp1256 exports arrive as mojibake (the `Õ`/`ã` AM/PM matcher at L2168 is the tell) | `Attendance.html` L253–L255 | B |
| D-13 | Format decided by a raw `DD/MM` vs `MM/DD` radio; `ambiguous` gives up whenever every number is ≤ 12 | `Actions.js` L2044–L2060, `Attendance.html` L302–L304 | B/C |
| D-14 | The CSV crosses the wire twice (analyze, then upload), 5 MB cap each | `Attendance.html` L263, L343 | C |
| D-15 | Real counts (new/duplicate/flagged, per day) are shown only **after** the write | `Attendance.html` L330–L360 | C |
| D-16 | `valley_attendance_needs_review` has no UI; the result panel tells the user to open a raw sheet by name | `Attendance.html` L342 | E |
| D-17 | Report counts punch rows: `abscence`/`excuse_in`/`excuse_out` are never written by any path, so الغياب and التأخير are structurally always 0 | `Actions.js` L2296–L2312 | F |
| D-18 | An employee with **zero** punches never appears in a report titled "تقرير الغياب" | `Actions.js` L2288–L2310 | F |
| D-19 | الحضور counts punches, not days — in + out reads as 2 | `Actions.js` L2305 | F |
| D-20 | Every upload re-sorts the **entire** attendance sheet | `Actions.js` L2254–L2258 | A |
| D-21 | Manual insert re-applies the number format to the whole column on every single row | `Actions.js` L1976–L1979 | A |
| D-22 | `get_attendance_data` with no `session_id` reads the whole punch table + employees + statuses just to fill a dropdown | `Attendance.html` L400 | D |
| D-23 | `session_status` never transitions (`pending` manual / `synced` upload); the pill is noise | `Actions.js` L1900, L2205 | D |
| D-24 | `selected_employees` is always written `''` — dead column | `Actions.js` L1901 | D (keep the column, stop surfacing it) |
| D-25 | `time_in` / `time_out` are never derived from the punches | `Actions.js` L2214 | F |
| D-26 | The نسيان البصمة form always prints blank; nothing links it to a detected missing punch | `Attendance.html` L512–L648 | E |

---

## 3. Phase A — make it survivable (`feat(att-1)`)

Ship this **first and alone**. It de-risks every later phase and closes the two I-2 holes.

### A.1 Shared guard helpers

In the HR modules IIFE, next to `ensureSheet_`:

```js
function withAttLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('النظام مشغول بعملية حضور أخرى، برجاء المحاولة بعد قليل');
  try { return fn(); } finally { lock.releaseLock(); }
}

function hasCol_(headers, name) {
  return headers.some(function (h) { return String(h).trim().toLowerCase() === name; });
}

/** Resolve or create THE session for a date serial. Sole writer of session rows.
 *  Caller must already hold the lock. Enforces I-1. */
function resolveSession_(dbId, dateSerial, user, batchId) { /* … */ }
```

Every session row — manual, upload, or exception fix — goes through `resolveSession_`. Delete the
inline session-creation branch in the upload loop (L2196–L2205) and the ad-hoc dedup scan in
`addAttendanceSession_` (L1889–L1896); both call `resolveSession_` instead.

### A.2 Punch dedup, one implementation (I-2)

```js
/** emp|minutes key set for the whole table. Reused by manual add and by commit. */
function buildPunchKeySet_(dbId) { /* normalizeEmpIdVF_ + normalizeDateTimeKey_ */ }
function punchExists_(keySet, empId, serial) { /* … */ }
```

`addManualAttendance_` gains, inside `withAttLock_`:

- `punchExists_` → throw `'هذه البصمة مسجلة بالفعل لهذا الموظف في نفس التاريخ والوقت'`
- the session is **resolved from the punch datetime**, not taken from the client — this kills D-02
  by construction (see D.3: the session dropdown disappears from the UI)
- writes `entry_source='manual'`, `parsed_format='MANUAL'`, `import_batch_id=''` when those
  columns exist.

### A.3 Batch id + revert

New actions:

| Action | Access | Purpose |
|---|---|---|
| `get_attendance_batches` | read | list `valley_attendance_import_batch`, newest first |
| `revert_attendance_import` | **full** | undo one batch |

`revertAttendanceImport_({ batch_id })`, inside `withAttLock_`:

1. the batch row must exist and be `active`, else throw.
2. `deleteRowsByCriteria_(attSheet, 'import_batch_id', batchId)` (`02_DataAccess.js` L579).
3. for each session carrying that `import_batch_id`: delete it **only if it now has zero punches**
   (a manual entry may have landed in an auto-created session).
4. `deleteRowsByCriteria_(reviewSheet, 'import_batch_id', batchId)`.
5. mark the batch `reverted` + `reverted_by` / `reverted_at`.

**History logging is per batch, not per row.** The existing loop at L2267 calls `logHistory_` once
per imported row — fine for 40 rows, fatal for 40 000. Commit and revert each write **one**
`logHistory_` entry against `valley_attendance_import_batch` carrying the counters and the date
range; the batch row plus `import_batch_id` on every punch is the audit trail. Manual adds keep
their existing per-row logging.

### A.4 Cheap wins in the same commit

- **D-05** — `openSessionDetail` sends `{ session_id: id, loadAll: true }`; `getAttendanceData_`
  never caps when `session_id` is present (a single day is bounded by definition). The modal shows
  the real count.
- **D-20** — delete the whole-sheet `Range.sort` at L2254–L2258. Ordering is a display concern and
  `getAttendanceData_` already sorts in memory. Writes become append-only.
- **D-21** — apply the number format **once**, to the newly appended range only, exactly as the
  upload path already does at L2240.

### A.5 Client

The result panel gains **`↩️ تراجع عن هذا الرفع`**, guarded by `CAN_FULL` and by the presence of
`batch_id` in the response. Uses `UIC.confirm` (`UI_Components.html` L2522) with the file name and
row count in the message — never a bare "are you sure".

---

## 4. Phase B — parse correctly (`feat(att-2)`)

All of this is **pure string work and moves to the client**. The server stops receiving raw files.

### B.1 Read the file properly (D-12)

`readAsArrayBuffer`, then:

```
utf8 = new TextDecoder('utf-8').decode(buf)          // count U+FFFD
if replacementRatio(utf8) > 0.005
    cp1256 = new TextDecoder('windows-1256').decode(buf)
    pick whichever yields more Arabic letters and fewer U+FFFD
strip BOM
```

`accept=".csv,.txt,.dat,.tsv,.xls,.xlsx"`. For `.xls`/`.xlsx`, `API.ensureXlsx()` is already wired
(`UI_Components.html` L1720) — read the workbook with `cellDates:false` and take the **raw numeric
serial straight out of the cell**. An Excel export is unambiguous by construction: no inference, no
question, `parsed_format='XLSX'`. This is the best path and the upload card's helper text should say
so.

### B.2 Real column mapping (D-10, D-11)

`sniffDelimiter_(text)` → `,` `\t` `;` `|`, chosen by consistency of field count across the first 50
non-empty rows; a fixed-width fallback splits on runs of ≥2 spaces.

Then, per column index, score across all rows:

- `dateScore` — matches a date shape (`ISO`, `a/b/yyyy`, `a/b/yy`, `a-b-yyyy`, `a.b.yyyy`)
- `timeScore` — matches `HH:mm(:ss)?` with an optional AM/PM token
- `codeScore` — short, digit-dominant, low cardinality relative to row count

Pick the best column for each role; date and time may be the **same** column. If a header row is
present (first row has zero date matches and contains any of
`code|id|emp|no|رقم|كود|اسم|date|time|تاريخ|وقت`), map by name and skip it.

The employee code is read **from its column**, trimmed, `normalizeEmpIdVF_`-ed, and then **must be
numeric** — a non-numeric code goes to the review queue with reason `'كود الموظف غير رقمي'` instead
of being stored as a string. The same guard runs server-side in `commit` so a bad client cannot
bypass it.

If no date column can be identified, fall back to the current whole-row regex **and mark every row
of that file `low_confidence`**, which forces the confirmation card in Phase C regardless of score.

### B.3 Format inference — eliminate, then corroborate (D-13)

```
shapes = classify each row -> ISO | SLASH4 | SLASH2 | DASH | DOT
if every row is ISO or an XLSX serial:  decided, confidence='certain', no question asked.

hypotheses = [DMY, MDY]  (+ YMD when the shape allows)

// hard elimination
for H in hypotheses:
    for every row:
        drop H if (day, month, year) is not a real calendar date
                 (round-trip: build the UTC date, assert getUTCDate/Month/FullYear match)
        drop H if the date falls outside [today - 3 years, today + 2 days]

// corroboration, only when more than one survives
monotonic = 1 - outOfOrderAdjacentPairs / (n - 1)   // device exports are chronological; the wrong
                                                    // reading shatters a sorted file. THIS is the
                                                    // signal that resolves the case where every
                                                    // number is <= 12.
compact   = distinctDays / spanInDays               // 1.0 = a contiguous export
dbMatch   = distinctDays already having a session / distinctDays

score = 0.50*monotonic + 0.30*compact + 0.20*dbMatch

decided when: exactly one survives                    -> 'certain'
           or top - runnerUp >= 0.25 and top >= 0.60  -> 'high'
otherwise                                             -> 'ambiguous'
```

`dbMatch` needs existing session dates → new lightweight read action **`get_attendance_index`**
returning `{ session_dates: ['yyyy-MM-dd', …], emp_ids: [...] }`. One call, no punch rows.

The engine returns, for **every** surviving hypothesis:
`{ format, spanMin, spanMax, distinctDays, punches, sessionsMatching, score, eliminated, reason }`.
Phase C renders those objects directly.

### B.4 AM/PM

Keep the existing token table and **add** the mojibake aliases rather than depending on them:
`ص|AM|A` → AM, `م|PM|P` → PM, plus the legacy `Õ` / `ã` from L2168. 12 AM → 0, 12 PM stays 12.
A time with no AM/PM token and an hour ≤ 23 is treated as 24-hour.

---

## 5. Phase C — the import wizard (`feat(att-3)`)

### C.1 Wire protocol (D-14)

Delete `analyze_attendance_csv`. Replace `upload_attendance_csv` with a chunked commit. Remove both
old names from `ACTION_PAGE_MAP` (L106–L112), `ACTION_TABLE_MAP` (L229–L232), the `register` block
(L7673–L7679) and the module export block (L7793–L7799).

| Action | Access | Payload |
|---|---|---|
| `get_attendance_index` | read | `{}` → session dates + emp ids |
| `commit_attendance_import` | write | `{ batch_id, chunk_index, is_last, file_name, format, confidence, rows: [[empId, serial, raw], …], flagged: [[raw, reason, empGuess, serialGuess], …] }` |
| `revert_attendance_import` | full | `{ batch_id }` |
| `get_attendance_batches` | read | `{ limit, loadAll }` |

The client generates `batch_id` (uuid) and posts chunks of **5000 rows**, sending `date_min` and
`date_max` (serials for the whole file) on **every** chunk. Chunk 0 writes the batch row as `active`
with the file metadata; the last chunk finalises the counters.

Server-side per chunk, inside `withAttLock_`: re-validate the serial window, re-validate the numeric
code, `punchExists_` dedup, `resolveSession_`, then one `setValues` append.

**Do not cache the key set in `CacheService`** — one value is capped at 100 KB and a real key set
blows past it silently. Instead, `buildPunchKeySet_` takes an optional `[minSerial, maxSerial]`
window and each chunk rebuilds the set **filtered to the batch's own date window**. That is correct
by construction (a punch can only collide with another punch at the same instant, which is inside
the window by definition) and it keeps the set to a few thousand keys for a month-sized file. Rows
appended by chunk N are on the sheet before chunk N+1 rebuilds, so cross-chunk duplicates inside one
batch are caught with no extra bookkeeping.

A chunk failure leaves the batch `active` and partially written. That is acceptable, because the
client surfaces the failure with the undo button already pointed at that `batch_id`.

### C.2 Dry-run preview (D-15)

The full diff is computed **client-side before any commit**, from the parsed rows plus
`get_attendance_index`, and rendered as the exact per-date table the page renders today
(`renderUploadResult`, L330–L360) — same columns, same colours, just shown *before* the write with a
`تأكيد الاستيراد` button. After commit the same table is re-rendered from the server's real
counters, so the two can be compared at a glance.

### C.3 Never ask a format question (D-13)

`confidence === 'certain'` → no panel at all; straight to the dry-run preview with a one-line note
(`تم التعرف على التاريخ تلقائياً`).

`high` → the preview leads, with a collapsed `تغيير طريقة القراءة` link.

`ambiguous` → **consequence cards, not radio buttons.** The words "day", "month", "DD/MM" and
"MM/DD" must not appear in the primary choice UI:

```
┌ القراءة (أ) — موصى بها ───────────┐  ┌ القراءة (ب) ───────────────────┐
│ الفترة: 1 – 12 سبتمبر 2026        │  │ الفترة: 9 يناير – 9 ديسمبر 2026 │
│ 12 يوم متصل · 340 بصمة            │  │ 12 يوم متفرق عبر 12 شهر · 340  │
│ 10 من 12 يوم لها جلسة قائمة       │  │ 0 من 12 يوم لها جلسة قائمة     │
│            [ اعتماد هذه القراءة ] │  │         [ اعتماد هذه القراءة ] │
└───────────────────────────────────┘  └────────────────────────────────┘
```

Each card is one entry from `inferDateFormat_().candidates`. Eliminated hypotheses render greyed
out with their `reason`. Below the cards, a sample of 8 raw rows next to how each reading would
store them (`vf-sample-list`, L57, already exists).

### C.4 Import history

New card `سجل عمليات الرفع` — `get_attendance_batches` in a `UIC.dataTable`: file name, date range,
counts, who, when, status, and `↩️ تراجع` per active batch (`CAN_FULL` only). This is where undo
lives permanently, not only in the post-upload panel.

---

## 6. Phase D — list, detail, navigation (`feat(att-4)`)

### D.1 Day-centric view (D-06, D-07, D-23, D-24)

Replace the sessions card with a **month navigator + calendar grid**. `get_attendance_sessions`
takes `{ from, to }` (month bounds) and returns per-day aggregates:

```
{ session_id, session_date, session_date_display, punches, employees, exceptions,
  import_batch_id, user, created_at }
```

Punch counts come from one grouped pass over the attendance table keyed by `id`. Each tile shows the
day number, punch count, employee count and an exception badge; clicking it opens the day detail.
A `عرض كجدول` toggle falls back to `UIC.dataTable` with `عرض الكل` (the pattern already used at
`Company_ValleyFoods_Purchasing.html` L189).

`session_status` stops being displayed. `selected_employees` keeps its column and keeps being
written `''` — no schema change, just no longer surfaced.

### D.2 Day detail

One modal per day: the punch list (**never capped**), the derived `time_in`/`time_out` per employee
(§8.2), the day's exceptions, and `+ إضافة بصمة` prefilled with that date.

### D.3 Manual entry loses the session dropdown (D-02, D-22)

The card becomes: **employee combo + `datetime-local` → حفظ.** The server resolves or creates the
session for that datetime via `resolveSession_`. Consequences: no stale 10-session dropdown, no
mismatch between a punch and its session, no whole-table read to populate a select.

Employee options move to their own read action `get_attendance_employees` (roster only — reuse
`getActiveEmployeeOptions_` L997 + `buildEmpNameMap_` L1928), cached client-side for the page's
lifetime.

---

## 7. Phase E — the work queues (`feat(att-5)`)

### E.1 Review queue (D-16)

New actions `get_attendance_review` (read, `{ status }`) and `resolve_attendance_review` (write,
`{ review_id, action: 'import' | 'discard', emp_id, attendance_date_time }`).

`import` runs the same validated path as a manual add (lock, dedup, `resolveSession_`) and flips the
row to `fixed`; `discard` flips it to `discarded`. Nothing is deleted, so the audit trail survives.
The card `صفوف تحتاج مراجعة` shows the open count as a badge — the raw sheet name never appears in
the UI again.

### E.2 Missing-punch queue (D-26)

`get_attendance_exceptions { from, to }` — the cross product of the **active roster** and every day
in range that has a session, classified per (employee, day):

| status | rule |
|---|---|
| `absent` | 0 punches |
| `incomplete` | odd punch count, or a single punch |
| `present` | ≥ 2 punches, even count |

Two row actions:

- `+ إضافة بصمة` → the manual modal, prefilled with employee and date.
- `🖨️ نموذج نسيان` → `buildForgetFormHtml()` gains an optional argument
  `{ empName, empId, dept, jobTitle, rows: [{ date, direction, expectedIn, expectedOut }] }` and
  prefills the header fields and the day table. Called with no argument it prints the current blank
  form byte-for-byte — that is a verify assertion, not a hope.

---

## 8. Phase F — the report (`feat(att-6)`)

Rewrite `getAttendanceReport_` (L2282). It currently answers "how many punch rows", which is not a
question anyone asked.

### F.1 Range filtering in serial space (D-08, D-09)

Null-check **before** any method call on the parsed dates, then never build a `Date` at all:

```js
var startSerial = dateOnlyToSerial_(d, m, y);        // from the yyyy-MM-dd input
var endSerial   = dateOnlyToSerial_(d2, m2, y2) + 1; // exclusive upper bound
// keep row when: s = flexToSerial_(r.attendance_date_time); s >= startSerial && s < endSerial
```

No `setHours`, no local/UTC mixing, no boundary clipping. The timezone bug disappears rather than
being compensated for.

### F.2 Derived pairing (D-25)

Per (employee, day), punches sorted ascending:

```
first = min, last = max, punch_count = n
worked_minutes = round((last - first) * 1440)
status = 0 punches -> absent | odd or 1 -> incomplete | else present
```

Written to nothing — computed on read. `time_in`/`time_out` stay as manual-override columns, used
when present and derived otherwise.

### F.3 Output (D-17, D-18, D-19)

Roster-driven, so a fully absent employee **appears with zeros**:

| column | meaning |
|---|---|
| الكود / الاسم | from the active roster, not from the punches |
| أيام العمل | days in range that have a session |
| أيام حضور | days with `present` |
| أيام غياب | days with `absent` |
| أيام ناقصة | days with `incomplete` |
| إجمالي الساعات | `sum(worked_minutes) / 60` |

Plus a per-employee drilldown (day, in, out, punches, status) and `UIC.exportExcel` on both. The
card is renamed `تقرير الحضور والغياب`. `abscence` / `excuse_in` / `excuse_out` are no longer read
for aggregation — they become free-text annotations only.

---

## 9. Verify suite — `tools/verify/s16_attendance.js`

Offline, over the real source, same shape as `s12_warehouse_movement.js` (including its §8 pattern:
extract the handler text and **run it against stubbed sheet access**). Register in `run_all.js` as
`['s16_attendance.js', 'S16 — الحضور: invariants, date inference, batch undo']`.

**Static:**

1. `Company_ValleyFoods_Attendance.html` parses as valid JS (via `parse_pages.js`) and boots under
   `pageharness.js`.
2. No reference anywhere to `analyze_attendance_csv` or `upload_attendance_csv`.
3. Every new action appears in **all four** places: `ACTION_PAGE_MAP`, `ACTION_TABLE_MAP`,
   `ValleyFoods.register`, and the module export block.
4. `revert_attendance_import` is `access: 'full'`; every other new action is `read` or `write`.
5. No `insertColumn`, no header append, and no `settingsEnsureSheet_` call against either
   attendance table.
6. The whole-sheet `Range.sort` at the old L2254 is gone.
7. `buildForgetFormHtml()` with no argument produces output identical to the currently committed
   version (fixture-compared, modulo the generated timestamp and form id).

**Behavioural, against stubs:**

8. `inferDateFormat_` over a fixture corpus in `tools/verify/fixtures/attendance/`:
   - `iso.csv` → `certain`, `ISO`, no candidates offered
   - `dmy_over12.csv` (contains 25/03) → `certain`, `DMY`
   - `mdy_over12.csv` (contains 03/25) → `certain`, `MDY`
   - `all_le_12_sorted.csv` (every number ≤ 12, chronological) → decided by monotonicity, **not**
     `ambiguous` — this is the case today's analyzer gives up on
   - `all_le_12_shuffled.csv` → `ambiguous`, exactly 2 candidates, each carrying span and day count
   - `impossible.csv` (31/02) → that hypothesis eliminated, with a reason
   - `mixed_formats.csv` → `ambiguous`, no hypothesis survives elimination cleanly
9. Column mapping: `code_then_name.csv` (`1,أحمد محمد,01/09/2026 08:00`) yields `emp_id === 1`,
   **not** `"1أحمدمحمد"`; `name_only.csv` sends the row to review with the non-numeric-code reason.
10. Encoding: a cp1256 fixture decodes to correct Arabic and its AM/PM token resolves.
11. I-2: `addManualAttendance_` called twice with the same `(emp_id, datetime)` throws the second
    time; `commit_attendance_import` skips it and counts it as `duplicate`.
12. I-1: two `resolveSession_` calls for the same date return the same `session_id` and append
    exactly one session row.
13. A manual add with a datetime on day X attaches to the session for day X even when the client
    sends a different `session_id`.
14. `revert_attendance_import` deletes exactly the batch's punches, deletes only the auto-created
    sessions left empty, keeps a session that still holds a manual punch, and flips the batch to
    `reverted`.
15. Every write handler acquires the lock: `withAttLock_` textually wraps the body of
    `addManualAttendance_`, `commit_attendance_import`, `revert_attendance_import` and
    `resolve_attendance_review`.
16. Degradation: with `import_batch_id` absent from the stubbed headers, commit still succeeds and
    `revert` throws a message naming the column.
17. Report: a zero-punch employee is present with `absent = working days`; an in+out day counts as
    **1** present day, not 2; a punch at 23:30 on the last day of the range is **included**;
    `get_attendance_report` with a blank `end_date` throws an Arabic error instead of a TypeError.

---

## 10. Commit sequence

| # | Commit | Contents | Ships without |
|---|---|---|---|
| 0 | — | **owner** applies the §1 columns | — |
| 1 | `feat(att-1)` | §3 — lock, `resolveSession_`, dedup, batch id, revert, D-05/D-20/D-21 | any parser change |
| 2 | `feat(att-2)` | §4 — client decoder, delimiter/column mapping, inference engine, `get_attendance_index` | any UI change beyond wiring |
| 3 | `feat(att-3)` | §5 — chunked commit, dry-run preview, consequence cards, import history | — |
| 4 | `feat(att-4)` | §6 — calendar view, day detail, manual entry without a session dropdown | — |
| 5 | `feat(att-5)` | §7 — review queue, exception queue, prefilled forget form | — |
| 6 | `feat(att-6)` | §8 — report rewrite | — |
| 7 | `test(att-7)` | §9 — `s16_attendance.js` + fixtures + the `run_all.js` step | — |

Checks for a phase land **in that phase's commit** wherever they can be written against it; commit 7
carries only the cross-phase suite. `node tools/verify/run_all.js` must be green at every commit,
not just the last.

---

## 11. Non-goals

- No change to the serial storage format, `dateTimePartsToSerial_`, `toSerialInt_`,
  `normalizeDateTimeKey_` or `sessionDateKey_`.
- No editing or deleting of an individual punch row. Undo is **per batch**; a wrong single punch is
  corrected by the owner in the sheet. Revisit only once the batch path has been in real use.
- No shift/schedule model, no lateness rules, no automatic deduction or overtime generation. The
  exception queue is the seam where that would later attach to `valley_employee_overtime_roles` /
  `valley_employee_deduction_roles`.
- No touching `src_html/`.
