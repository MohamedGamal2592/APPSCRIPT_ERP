# الحضور والانصراف — rebuild results

Seven commits, `feat(att-1)` … `test(att-7)`, against **VALLEY_ATTENDANCE_PLAN.md**.

**Nothing was deployed, pushed, or run against your Google account.** No row was added, edited or
deleted in any business table, including `ERP_Pages_Matrix`. No column was added, renamed,
reordered or retyped in any sheet. Every write path in this document was exercised against
recording stubs under `node`; the stubs throw if a spreadsheet, `Range.sort`, `insertSheet` or
`CacheService` is ever reached.

| Phase | Commit | What |
|---|---|---|
| 0 | — | state check, baseline recorded |
| 1 | `ecd4f5f` | `feat(att-1)` survivability: lock, `resolveSession_`, dedup, batch id, revert |
| 2 | `b6c0f85` | `feat(att-2)` the client parser: decoder, column mapping, inference |
| 3 | `19cdf30` | `feat(att-3)` the import wizard: chunked commit, preview, consequence cards |
| 4 | `0b059ba` | `feat(att-4)` calendar, day detail, manual entry without a session dropdown |
| 5 | `800ade5` | `feat(att-5)` review queue, exception queue, prefilled forget form |
| 6 | `c86a6f2` | `feat(att-6)` the report rewrite |
| 7 | this one | `test(att-7)` `s16_attendance.js`, fixtures, the runner step, this document |

---

## 0. Phase 0 baseline

HEAD at the start was **`1a41859`**, not the `d88a2f7` the plan and the run prompt were written
against, so every `file:line` in both was re-derived rather than trusted. Line numbers had drifted
by roughly +20 in `Company_ValleyFoods_Actions.js`.

| Check | At Phase 0 | At every commit since |
|---|---|---|
| `node --check Company_ValleyFoods_Actions.js` | pass | pass |
| `node tools/verify/parse_pages.js` on both templates | pass | pass |
| `node tools/verify/ui_smoke_pages.js` | 85/88 boot, 3 known failures | identical |
| `node tools/verify/run_all.js` | **41/41 pass** | **42/42 pass** (s16 added) |

The three pre-existing smoke failures, unchanged throughout and none of them mine:
`0_ERP_Management.html`, `Company_TopChemical_MainReview.html`, `DbLive_Viewer.html`.

**Another session's uncommitted work was in the tree the whole time**, including ~25 lines in
`Company_ValleyFoods_Actions.js` (a `vfDateBound_` helper and a purchasing-costing bound). Since
git stages whole files, each of my seven commits was staged by building a patch of *only my own
hunks* — `git diff --no-index` against a snapshot taken at the previous commit, then
`git apply --cached` — and every commit was checked afterwards for zero occurrences of that
session's markers. **None of their work is in any of my commits, and none of it was disturbed.**

---

## 1. The defect register

| # | Defect | Status | Commit |
|---|---|---|---|
| D-01 | Manual entry does no duplicate check | **fixed** | `feat(att-1)` |
| D-02 | Manual entry never checks the punch date against its session | **fixed, by construction** | `feat(att-1)` + `feat(att-4)` |
| D-03 | I-1 enforced by read-then-write with no lock | **fixed** | `feat(att-1)` |
| D-04 | No undo | **fixed** | `feat(att-1)` |
| D-05 | Session detail loads 10 punches, prints `rows.length` as the total | **fixed** | `feat(att-1)` |
| D-06 | Only the last 10 sessions reach the UI | **fixed** | `feat(att-4)` |
| D-07 | Sessions ordered by sheet insertion | **fixed** | `feat(att-4)` |
| D-08 | `endDate.setHours(...)` before the null guard → TypeError | **fixed** | `feat(att-6)` |
| D-09 | Range filter clips the last hours of the final day | **fixed** | `feat(att-6)` |
| D-10 | Employee code keeps Arabic letters, never flagged | **fixed** | `feat(att-2)` client + `feat(att-3)` server |
| D-11 | No column mapping; the first date in the row wins | **fixed** | `feat(att-2)` |
| D-12 | `readAsText` is UTF-8 only | **fixed** | `feat(att-2)` |
| D-13 | Format decided by a raw DD/MM vs MM/DD radio | **fixed** | `feat(att-2)` + `feat(att-3)` |
| D-14 | The CSV crosses the wire twice | **fixed** | `feat(att-3)` |
| D-15 | Real counts shown only after the write | **fixed** | `feat(att-3)` |
| D-16 | `valley_attendance_needs_review` has no UI | **fixed** | `feat(att-5)` |
| D-17 | Report counts columns nothing writes → always 0 | **fixed** | `feat(att-6)` |
| D-18 | A zero-punch employee never appears | **fixed** | `feat(att-6)` |
| D-19 | الحضور counts punches, not days | **fixed** | `feat(att-6)` |
| D-20 | Every upload re-sorts the entire sheet | **fixed** | `feat(att-1)` |
| D-21 | Manual insert re-formats the whole column | **fixed** | `feat(att-1)` |
| D-22 | `get_attendance_data` reads everything to fill a dropdown | **fixed** | `feat(att-4)` |
| D-23 | `session_status` never transitions; the pill is noise | **fixed (display only)** | `feat(att-4)` |
| D-24 | `selected_employees` is a dead column | **fixed (display only)** | `feat(att-4)` |
| D-25 | `time_in` / `time_out` never derived | **fixed** | `feat(att-4)` + `feat(att-6)` |
| D-26 | The نسيان البصمة form always prints blank | **fixed** | `feat(att-5)` |

D-23 and D-24 are display-only by decision: both columns keep their place in the sheet and keep
being written exactly the values they were written before. Nothing about the schema or the write
path changed; they simply stopped being shown.

### Two defects found during the read that are NOT in the plan's register

Both were live in production, both silent, and both mattered enough that the rebuild would have
been wrong without fixing them.

**D-27 — `flexToSerial_` had its arguments in the wrong order for a Date.**
The Date branch called `dateTimePartsToSerial_(getFullYear(), getMonth()+1, getDate(), …)` against a
signature of `(day, month, year, hours, minutes)`. `getValues()` returns a **Date** for the
date-formatted `attendance_date_time` column, so this branch runs constantly:

```
7 Sep 2026 08:30  ->  serial 4826.354  ->  18 Mar 1913
```

It was wrong *consistently*, so Date rows still deduped against each other and nothing ever looked
broken — but a freshly parsed CSV serial could never match a stored Date row, which is one of the
two ways I-2 leaked. **`addManualAttendance_` built its serial the same wrong way**, so every
manually added punch in the live table carries a 1913 date. Both sites corrected in `feat(att-1)`;
`s16` §11 asserts the two now produce the same dedup key.

**D-28 — the CSV upload read the day and called it the date.**
`var datePart = match[1]` takes the *first capture group* of
`/(\d{1,2})\/(\d{1,2})\/(\d{4})…/` — the day alone. So `datePieces` was `['07']`, `month` and
`year` came out `NaN`, the `day < 1 || day > 31 || month < 1 || month > 12` guard passed (every
comparison against `NaN` is false), and `toSerialInt_` turned the `NaN` serial into `null`. **Every
uploaded punch stored a blank `attendance_date_time`, and every auto-created session a `NaN`
`session_date`.** The same value is what the employee code was cut on, so `'107 07/09/2026…'.split('07')[0]`
gave `'1'` — code 107 silently became 1. Rebuilt from the three capture groups in `feat(att-1)`.
The whole parser was replaced in `feat(att-2)`/`feat(att-3)` regardless, but Phase A had to ship
alone and correct.

---

## 2. Stubbed dry-run row maps

Every one of these was produced by extracting the real handler out of
`Company_ValleyFoods_Actions.js` and running it against stubs that record. Nothing reached a sheet.

### `addManualAttendance_`

Input `{ emp_id: '1', attendance_date_time: '2026-09-07T08:30', session_id: 'A-WRONG-SESSION' }`:

```json
{"unique_id":"uuid-2","id":"uuid-1","emp_id":1,
 "attendance_date_time":46272.354166666664,
 "time_in":"","time_out":"","excuse_in":"","excuse_out":"","abscence":"",
 "user":"hr@valley.test","created_at":"…",
 "import_batch_id":"","entry_source":"manual","parsed_format":"MANUAL","source_raw":""}
```

`id` is `uuid-1`, the session **resolved from the datetime** — the `A-WRONG-SESSION` the client sent
was ignored entirely. `attendance_date_time` is a pure `Number` that round-trips to 2026-09-07
08:30. One `setNumberFormat`, on one cell. A second identical call throws
`هذه البصمة مسجلة بالفعل لهذا الموظف في نفس التاريخ والوقت` and appends nothing.

The session row it caused:

```json
{"session_id":"uuid-1","session_date":46272,"session_status":"pending",
 "selected_employees":"","user":"hr@valley.test","created_at":"…","import_batch_id":""}
```

### `commit_attendance_import`

Driven by the 48 rows the **real client parser** produced from `all_le_12_sorted.csv`:

```json
{"unique_id":"uuid-2","id":"uuid-1","emp_id":101,
 "attendance_date_time":46256.333333333336,
 "time_in":"","time_out":"","excuse_in":"","excuse_out":"","abscence":"",
 "user":"hr@valley.test","created_at":"…",
 "import_batch_id":"B-1","entry_source":"upload","parsed_format":"DMY",
 "source_raw":"101 أحمد 01/09/2026 08:00"}
```

The batch row:

```json
{"batch_id":"B-1","file_name":"all_le_12_sorted.csv","file_rows":48,
 "uploaded_by":"hr@valley.test","uploaded_at":"…","chosen_format":"DMY",
 "detected_format":"DMY","confidence":"high",
 "rows_imported":48,"rows_duplicate":0,"rows_flagged":0,"sessions_created":12,
 "date_min":46256,"date_max":46267,
 "batch_status":"active","reverted_by":"","reverted_at":""}
```

A review row, when a row is flagged:

```json
{"raw_row_text":"a non-numeric code the client should have caught",
 "reason":"كود الموظف غير رقمي","chosen_format":"DMY","uploaded_by":"hr@valley.test",
 "uploaded_at":"…","review_id":"uuid-3","import_batch_id":"B-V","review_status":"open",
 "emp_id_guess":"1أحمد","datetime_guess":"","resolved_by":"","resolved_at":""}
```

Counters observed: **48 imported / 0 duplicate / 12 days opened** on the first run; the *same file
again* gives **0 imported / 48 duplicate** and the table does not grow. Split 20 + 31 where the
second chunk repeats three of the first chunk's rows: the three are caught **across the chunk
boundary**, totals accumulate to 48, exactly 48 rows land, one batch row, one history entry.
**Zero per-punch history entries** in every case.

### `revert_attendance_import`

Against a batch of 3 punches over 2 auto-created days, one of which also holds a manually added
punch, plus an untouched hand-made day and one review row:

| | before | after |
|---|---|---|
| punches | P1 P2 P3 (batch) + P4 P5 (manual) | **P4 P5** |
| sessions | S-AUTO S-MIXED S-HAND | **S-MIXED S-HAND** |
| review rows for the batch | 1 | 0 |
| batch row | `active` | `reverted`, `reverted_by: hr@valley.test`, `reverted_at` set |
| history entries | — | **1**, for the whole revert |

`S-AUTO` was emptied and removed; `S-MIXED` still holds a manual punch and **kept its session**;
`S-HAND` was never this batch's to touch. A second revert throws
`تم التراجع عن عملية الرفع هذه من قبل`.

Also verified: after a **partial** import (chunk 0 only, 20 rows), the batch stays `active`,
reports `rows_imported: 20`, and undo removes exactly those 20.

---

## 3. The inference engine on the seven fixtures

Driven from a **fixed reference date of 2027-01-15**, so the `[today − 3y, today + 2d]`
plausibility window cannot make the corpus age out and start failing on its own.

| file | decided format | confidence | candidates offered |
|---|---|---|---|
| `iso.csv` | `ISO` | `certain` | 0 |
| `dmy_over12.csv` | `DMY` | `certain` | 1 |
| `mdy_over12.csv` | `MDY` | `certain` | 1 |
| `all_le_12_sorted.csv` | **`DMY`** | **`high`** | 2 |
| `all_le_12_shuffled.csv` | — | `ambiguous` | 2 |
| `impossible.csv` | — | `ambiguous` | 0 |
| `mixed_formats.csv` | — | `ambiguous` | 0 |

**`all_le_12_sorted.csv` is the one that matters.** Every number in it is ≤ 12, which is exactly
where the old analyzer returned `ambiguous` and gave up:

```
DMY   score 0.800   monotonic 1.000   compact 1.000   12 days   1 سبتمبر 2026 → 12 سبتمبر 2026
MDY   score 0.511   monotonic 1.000   compact 0.036   12 days   9 يناير 2026 → 9 ديسمبر 2026
```

Twelve contiguous days against the ninth of twelve different months. The gap is 0.289, over the
0.25 threshold, and the top is 0.800, over 0.60 — so it is **decided, no question is asked**, and
the range it reports is the range in the file.

Elimination always says why:

```
impossible.csv     DMY  التاريخ 31/02/2026 غير موجود في التقويم بهذه القراءة
                   MDY  التاريخ 31/02/2026 غير موجود في التقويم بهذه القراءة
mixed_formats.csv  DMY  التاريخ 03/25/2026 غير موجود في التقويم بهذه القراءة
                   MDY  التاريخ 25/03/2026 غير موجود في التقويم بهذه القراءة
```

`all_le_12_shuffled.csv` is genuinely undecidable — both readings are scattered across the year and
neither monotonicity nor compactness breaks the tie — so it offers exactly two consequence cards,
each carrying its span, day count and punch count. Seeding it with existing sessions on the DMY
days raises that candidate's `dbMatch` from 0 to 1 and its score with it, which is how the
corroboration term is proven wired rather than decorative.

Also from the corpus: `code_then_name.csv` yields `emp_id === 1` (a **Number**), not
`"1أحمدمحمد"`, with `codeCol=0` and `dateCol=2` found separately. `name_only.csv` stores nothing
and sends both rows to review with `كود الموظف غير رقمي`. `cp1256.csv` is detected as
`windows-1256`, decodes to correct Arabic, and its `ص` / `م` tokens resolve to 08:00, **17:30**,
08:15.

---

## 4. The owner's checklist

Do these **after** adding the §1 columns (see `NEXT_STEPS_OWNER.md`) and deploying.

1. The four new columns are on `valley_employee_attendance`, one on
   `valley_attendance_session`, seven on `valley_attendance_needs_review` — **at the end, in the
   stated order**, nothing else moved.
2. Upload a file. Upload **the same file again**: the result reports every row as **مكرر** and the
   punch table gains **zero** rows.
3. Upload an **`.xlsx`** export: **no format question is asked at all**, and the preview says
   "ملف Excel — التاريخ مقروء من الرقم مباشرة".
4. Upload a file where **every date number is ≤ 12 and the rows are chronological**: no question is
   asked, and the date range shown in the preview equals the range in the file.
5. Upload a file whose dates are genuinely ambiguous: **two cards** appear describing periods.
   Confirm the words **"يوم/شهر"**, **"شهر/يوم"**, **DD/MM** and **MM/DD** appear **nowhere** in
   that choice.
6. Press **↩️ تراجع** on a batch. Exactly that batch's punches disappear; a punch you added by hand
   on one of those days **and that day** both survive; the batch row reads **تم التراجع**.
7. Add a manual punch for a date that has **no** day yet: exactly **one** day is created for that
   date, and the toast says so.
8. Add **the same** manual punch twice: the second is refused with
   `هذه البصمة مسجلة بالفعل لهذا الموظف في نفس التاريخ والوقت`.
9. Open a day that holds **120** punches: the modal reports **120**, not 10.
10. Run the report over a range where an employee has **no punches at all**: they appear, with
    **أيام غياب** equal to **أيام العمل**.
11. Add a punch at **23:30 on the last day** of a report range and re-run it: that punch is
    **included** (before this rebuild it was silently dropped).
12. Run the report with the **end date left blank**: an Arabic message appears, not a crash.
13. Open **صفوف تحتاج مراجعة**, press ✔️ تسجيل on a row, correct the employee, save: the punch is
    written and the row reads **تم التسجيل** — and it is still in the sheet, not deleted.
14. Open **غياب وبصمات ناقصة** over a past week, press **🖨️ نموذج نسيان** on a row: the printed
    form comes out **with the employee's name and that day already filled in**.
15. Press the old **🖨️ طباعة النموذج** button: the form prints **blank**, exactly as it always did.
16. After the first import, confirm the three sheets still have **exactly** the columns from §1 —
    nothing appended, nothing reordered.
17. Two people import at the same moment: the second sees
    `النظام مشغول بعملية حضور أخرى، برجاء المحاولة بعد قليل` rather than corrupting the day headers.

---

## 5. What I skipped, and why

**A short honest list.**

1. **The §1 columns were not added.** They are yours by hard constraint. Everything ships and works
   without them, degraded exactly as specified and asserted in `s16` §16.
2. **Nothing was deployed, pushed or `clasp run`.** Seven local commits, that is all.
3. **No browser was involved.** There is no `node_modules` and no layout engine here, so nothing in
   this rebuild has been *seen*. `parse_pages.js` proves the page parses, `ui_smoke_pages.js` proves
   it boots and its top-level code runs, and the handler assertions run the real functions — but
   **no assertion in this document proves that the calendar grid looks right, that the consequence
   cards line up, or that the modal fits on a phone.** Checklist items 3, 5, 9 and 14 are the ones
   that need your eyes.
4. **`deleteRowsByCriteria_` deletes one row at a time.** The plan specifies it and I used it, but
   reverting a 40 000-row import means 40 000 `deleteRow` calls and **will** exceed the six-minute
   Apps Script limit. I made that survivable rather than fast: a revert that times out leaves the
   batch `active`, so **running undo again simply continues** where it stopped. Worth revisiting
   with a read-filter-rewrite implementation once the batch path has seen real use — but that is a
   riskier operation than the plan authorised, so I did not write it.
5. **The dry-run preview cannot count duplicates against rows already in the table.**
   `get_attendance_index` returns session dates and employee codes, not punch keys — by design, it
   is meant to be one small read. So the preview counts duplicates *within the file* and says
   plainly that existing duplicates are detected at commit. The post-commit panel then shows the
   real counters for comparison. I chose to name the limit in the UI rather than show a number the
   client cannot actually know.
6. **`get_attendance_exceptions` is O(roster × days in range).** Fine for a month; a year-long
   range over a large roster will be slow. It is bounded by days that have a session, so it cannot
   run away, but it is not paged server-side.
7. **`cp1256.csv` is a non-UTF-8 fixture in a repo with `core.autocrlf` on.** Its Arabic bytes are
   in the 0x80–0xFF range that git will not touch, and I re-ran the decode assertion after
   committing it to confirm — but if it is ever checked out on a machine that mangles it, `s16` §10
   fails loudly rather than silently, which is the behaviour I wanted.
8. **The suite label is `S16b`, not `S16`.** `tools/verify/s16_realtime_authority.js` already exists
   and already prints `S16`. The file name the plan specified is unchanged; only the runner label
   is disambiguated.
9. **XLSX parsing was written but never executed against a real workbook.** `parseWorkbook` has no
   fixture: building a genuine `.xlsx` needs the SheetJS library, which is a CDN script the browser
   loads and which this offline environment does not have. The code path is short and the logic is
   "take the raw numeric cell", but **checklist item 3 is the only thing that will prove it**.

---

## 6. Verification, in full

```
node --check Company_ValleyFoods_Actions.js                                    pass
node tools/verify/parse_pages.js Company_ValleyFoods_Attendance.html \
                                 Client_AttendanceParser.html                  pass
node tools/verify/ui_smoke_pages.js      85/88 boot; the same 3 known failures
node tools/verify/s16_attendance.js      147 assertions, all pass
node tools/verify/run_all.js             42/42 checks pass
```

`s16_attendance.js` implements all 17 assertions of plan §9. Its behavioural half extracts the real
handler block and the real parser partial out of the real files and runs them; its stubs throw on
`Range.sort`, `insertSheet`, `getSpreadsheet_` and `CacheService`, so a regression into any of those
fails the suite rather than passing it quietly.
