# RUN PROMPT — rebuild الحضور والانصراف (`vf_hr_attendance`, Valley Foods)

Rebuild the Valley Foods attendance page and its backend over the two existing production tables
`valley_attendance_session` and `valley_employee_attendance`, per
**[VALLEY_ATTENDANCE_PLAN.md](VALLEY_ATTENDANCE_PLAN.md)**.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **code only**. It creates no rows, edits no rows, deletes no rows in any business
table, and adds no column to any existing sheet.

---

## 🔁 Autonomy — read this first

**Do not stop between phases. Do not ask "shall I continue?". Do not ask me to approve a phase, a
diff, a commit or a decision.** Work straight through Phase 0 → 7 and report **once**, at the end.

Every open decision is **already answered in §Decisions**. If you want to ask a question:

1. **§Decisions or the plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the results doc, continue.
3. **Genuinely blocked** (needs my Google account, needs a live sheet read, needs the §1 columns
   that only I can add) → write it on the owner checklist and **continue with everything else**.
4. **A whole phase is unworkable** → say so plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess, and **far** better than a stopped run.

Commit after each phase **without asking**. Do not push. Do not deploy.

---

## Read these first, in full, before touching anything

1. **`VALLEY_ATTENDANCE_PLAN.md`** — your specification. It carries the defect register (§2, D-01
   through D-26), the phase contents, and the 17 verify assertions. **This prompt orients you; the
   plan decides.** Where they disagree, the plan wins — except in §Decisions below, which is newer.
2. **`Company_ValleyFoods_Actions.js` L950–L2330** — the whole `ValleyFoodsHRModules` attendance
   block. Read the date helpers at L1049–L1160 especially closely: `dateTimePartsToSerial_`,
   `flexToSerial_`, `toSerialInt_`, `normalizeDateTimeKey_`, `sessionDateKey_`. **These are correct
   and you are not rewriting them** — every new code path calls them.
3. **`Company_ValleyFoods_Attendance.html`** — all 673 lines. The `buildForgetFormHtml()` block
   (L512–L648) is a print artefact you extend without changing its blank output.
4. **`02_DataAccess.js`** — `getAllRecords_` (L475) and its memo cache, `deleteRowsByCriteria_`
   (L579), `noteMutation_`. The memo/mutation contract is load-bearing for every write you add.
5. **`Company_ValleyFoods_WarehouseMovement.html`** + `tools/verify/s12_warehouse_movement.js` —
   the shape a new VF page and its check suite are expected to have, including s12's §8 pattern:
   extract a handler out of the source and **run it against stubbed sheet access**. Your `s16` is
   its sibling.
6. **`Company_ValleyFoods_Purchasing.html` L107, L189** — the `عرض الكل` / `loadAll` pagination
   pattern you reuse in Phase D.
7. **`tools/lib/sources.js` L40–L49** and **`tools/verify/ui_smoke_pages.js`** — how a shared
   partial is distinguished from a page. Phase B adds a partial; get this wrong and the smoke test
   tries to boot it as a page.
8. **`tools/verify/run_all.js`** — the suite. Green now, green at every one of your commits.

**Verify every `file:line` before you edit it.** Line numbers in the plan and in this prompt were
taken at HEAD `d88a2f7` and drift with every commit — confirm each one yourself.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change a schema

No column may be **added, renamed, removed, reordered or retyped** in any business table, in any of
the three company spreadsheets or the auth spreadsheet.

The plan's §1 lists new columns. **You do not add them. I do, by hand.** Your code detects each one
by header name (`hasCol_`) and works correctly without it. That degradation is a deliverable, not a
nicety — it is what lets you ship Phase A before I have touched the spreadsheet.

The one exception: `valley_attendance_import_batch` is a **new sheet**, created by the existing
`ensureSheet_` (L1035) on first use. A new sheet is allowed. A new column on an existing sheet is
not. **Never call `settingsEnsureSheet_` on any attendance table** — it appends any header it
thinks is missing (~L2432), and one typo there is a silent schema change on a live table.

## 2. NEVER add, edit or delete data in a business table

No rows. No cell updates. No deletes. No backfills. No test records. No seed data. Not by hand, not
by script, not via `clasp run`, not via a one-off function you write and execute.

**This includes `ERP_Pages_Matrix`.** You do not need it — every action you add maps to the existing
page id `vf_hr_attendance`, which is already granted.

The only writes your code may ever cause are the ones a real user triggers after I deploy. You do
not invoke them yourself.

## 3. NEVER deploy, push, or touch my Google account

No `clasp push`, no `clasp deploy`, no `clasp run`, no `git push`. Commit locally, that is all.

## 4. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `getAllRecords_`, `deleteRowsByCriteria_`, `vfPage_` are shared by three
companies. Extend them additively or not at all. If Phase E needs
`buildForgetFormHtml()` to take an argument, the **no-argument call must still produce
byte-identical output** — that is verify assertion #7, and it is how you prove you did not break the
existing print button.

## 5. NEVER rewrite history

No `rebase`, no `amend`, no `reset --hard`, no force anything. Other sessions' uncommitted work is
in this tree — `git status` at HEAD shows seven untracked `.md` files that are not yours. **Stage
explicit paths only, never `git add -A`.**

## 6. Stay inside your file set

```
Company_ValleyFoods_Actions.js
Company_ValleyFoods_Attendance.html
Client_AttendanceParser.html            (new)
tools/lib/sources.js                    (one line: SHARED_PARTIALS)
tools/verify/s16_attendance.js          (new)
tools/verify/fixtures/attendance/*      (new)
tools/verify/run_all.js                 (one line: the s16 step)
VALLEY_ATTENDANCE_RESULTS.md            (new, Phase 7)
NEXT_STEPS_OWNER.md                     (append only)
```

**Never `src_html/Company_ValleyFoods_Attendance.html`.** It is stale, `.claspignore` L26 excludes
it from every deploy, and it is not the truth about anything.

---

## Decisions — already made, do not re-ask

**Storage**

1. `attendance_date_time` and `session_date` stay **pure numeric minute-precision serials**. Never
   a string, never a `Date` object, in any new write path.
2. All range comparison happens **in serial space**. No `new Date()`, no `setHours`, no
   `Session.getScriptTimeZone()` anywhere in the report or the import. That is how D-09 disappears
   instead of being compensated for.
3. Plausibility window for any parsed date: `[today − 3 years, today + 2 days]`. Outside it, the row
   goes to review.

**Inference (Phase B)**

4. Weights `0.50` monotonic / `0.30` compact / `0.20` dbMatch. Decide when exactly one hypothesis
   survives elimination, **or** `top − runnerUp ≥ 0.25 && top ≥ 0.60`. Otherwise `ambiguous`.
5. A non-numeric employee code is **never stored**. It goes to review with reason
   `'كود الموظف غير رقمي'`. Enforce this on the client *and* again in `commit_attendance_import` —
   the server never trusts the client's parse.
6. `.xlsx` / `.xls` are read with the already-wired `API.ensureXlsx()` (`UI_Components.html` L1720),
   `cellDates:false`, taking the **raw cell serial**. `parsed_format='XLSX'`, no inference, no
   question. Say so in the upload card's helper text — it is the path I want users on.
7. Encoding: decode UTF-8, count U+FFFD; if the ratio exceeds `0.005`, also decode `windows-1256`
   and keep whichever yields more Arabic letters and fewer replacement chars.

**Import protocol (Phase C)**

8. Chunk size **5000** rows. The client sends `date_min` / `date_max` (whole-file serials) on
   **every** chunk.
9. **Do not use `CacheService` for the dedup key set.** One cache value is capped at 100 KB and a
   real key set exceeds it silently. Each chunk rebuilds `buildPunchKeySet_(dbId, [min, max])`
   filtered to the batch's date window. Correct by construction, and small.
10. **One `logHistory_` entry per batch**, not per row. The existing per-row loop at L2267 is fine
    for 40 rows and fatal for 40 000. Manual adds keep their per-row logging.
11. `analyze_attendance_csv` and `upload_attendance_csv` are **deleted** — from `ACTION_PAGE_MAP`
    (L106–L112), `ACTION_TABLE_MAP` (L229–L232), the `register` block (L7673–L7679) and the module
    export block (L7793–L7799). All four, or the check fails.
12. A partially-committed batch is an acceptable failure mode. The client shows the error with the
    undo button already pointed at that `batch_id`.

**UI**

13. The manual-entry card has **no session dropdown**. Employee + `datetime-local` only; the server
    resolves the session from the datetime. This is what closes D-02 by construction.
14. The calendar grid's week starts on **Saturday** (Egypt).
15. `session_status` and `selected_employees` keep their columns and keep being written exactly as
    today. They simply stop being displayed. No schema change, no behaviour change on write.
16. The ambiguity UI shows **consequence cards**, never radio buttons. The strings "يوم/شهر",
    "شهر/يوم", `DD/MM` and `MM/DD` must not appear in the primary choice UI. `s16` asserts their
    absence.
17. Arabic first, everywhere. Every new user-facing string, error and toast is Arabic.

**Process**

18. New actions get `access`: `read` for `get_*`, `write` for `commit_*` / `resolve_*` / `add_*`,
    and **`full`** for `revert_attendance_import`. Nothing else is `full`.
19. `Client_AttendanceParser.html` **must** be added to `SHARED_PARTIALS` in `tools/lib/sources.js`
    (L40–L49). Otherwise `pageFiles()` treats it as a page and `ui_smoke_pages.js` fails trying to
    boot a file with no shell.

---

## Your task — eight phases, in order, one commit each

| Phase | Commit | What | Plan § |
|---|---|---|---|
| **0** | *(none)* | State check. Confirm HEAD, confirm the seven untracked `.md` files are not yours, re-read the six attendance handlers, verify the plan's line numbers still point where it says. Run the suite and record the **baseline** — including `ui_smoke_pages.js`'s three known pre-existing failures. No commit. | — |
| **1** | `feat(att-1)` | Survivability: `withAttLock_`, `hasCol_`, `resolveSession_`, `buildPunchKeySet_`/`punchExists_`, manual dedup, batch id, `revert_attendance_import`, `get_attendance_batches`, plus D-05, D-20, D-21. | §3 |
| **2** | `feat(att-2)` | `Client_AttendanceParser.html`: decoder, delimiter sniff, column mapping, shape classifier, `inferDateFormat_`. Server: `get_attendance_index`. No UI change beyond wiring the include. | §4 |
| **3** | `feat(att-3)` | The wizard: `commit_attendance_import` (chunked), dry-run preview, consequence cards, import-history card. Delete the two old actions. | §5 |
| **4** | `feat(att-4)` | Calendar month view, day detail, manual entry without a session dropdown, `get_attendance_employees`. | §6 |
| **5** | `feat(att-5)` | Review queue + missing-punch queue + prefilled نموذج نسيان البصمة. | §7 |
| **6** | `feat(att-6)` | Report rewrite: serial-space filtering, derived pairing, roster-driven output. | §8 |
| **7** | `test(att-7)` | `s16_attendance.js` + fixtures + the `run_all.js` step + `VALLEY_ATTENDANCE_RESULTS.md` + owner checklist. | §9 |

Write each phase's checks **inside that phase's commit** wherever they can be written against it.
Commit 7 carries only the cross-phase suite and the docs.

### The phase that carries real risk — Phase 1

`resolveSession_` becomes the **sole writer of session rows**, replacing both the manual path
(L1884–L1922) and the inline branch in the upload loop (L2196–L2205). If it is wrong, I-1 breaks
silently and duplicate day-headers appear in production with no error anywhere.

Prove it under stubs before you move on: two calls for the same date return the same `session_id`
and append **exactly one** row; a call for a date that already has a legacy session finds it via
`sessionDateKey_` regardless of whether that row holds a serial, a `Date` or `dd/mm/yyyy` text.
That last case is the one the old code got right by accident and a rewrite loses.

Phase 1 also deletes the whole-sheet `Range.sort` at L2254–L2258. Confirm `getAttendanceData_`
really does sort in memory (L1951) before you remove it — that is the only thing keeping the day
detail ordered afterwards.

---

## Verification — you cannot see a browser and cannot read the spreadsheet

There is no `node_modules` and no layout engine. Prove what you can statically and under stubs; put
the rest on the owner's checklist.

**After every phase, all four:**

```bash
node --check Company_ValleyFoods_Actions.js
node tools/verify/parse_pages.js Company_ValleyFoods_Attendance.html Client_AttendanceParser.html
node tools/verify/ui_smoke_pages.js     # catches a blank page; parse_pages does not
node tools/verify/run_all.js            # full suite, green, including your s16 once it exists
```

`ui_smoke_pages.js` has **three known failures that predate all of this** —
`0_ERP_Management.html`, `Company_TopChemical_MainReview.html`, `DbLive_Viewer.html`. Record them in
Phase 0 as your baseline. **A fourth one is yours.**

**A red suite is a stop-and-fix, not a stop-and-ask.**

**Dry-run every write handler under `node` against stubbed sheet access** — stub `getSheet_`,
`getHeaders_`, `getAllRecords_`, `LockService`, `Utilities.getUuid`, `logHistory_` and
`noteMutation_`; the stubs **record** instead of writing. Assert on the row map each handler *would*
have written, in header order. Nothing may reach a real spreadsheet. Put the captured row maps in
the results doc.

`s16_attendance.js` must implement all 17 assertions in plan §9. The fixture corpus under
`tools/verify/fixtures/attendance/` is the interesting half — write the seven date files first, in
Phase 2, and let the inference engine be driven by them rather than the other way round.
`all_le_12_sorted.csv` is the one that matters: it must resolve, **not** come back `ambiguous`. That
single fixture is the difference between this rebuild and what is there today.

**The owner's checklist** — write it as specific statements, never "check it looks right":

- The §1 columns are added to all three sheets, in the stated order, at the end.
- Uploading the same file twice reports every row as duplicate and adds no rows.
- Uploading an `.xlsx` export asks no format question at all.
- Uploading a file where every date number is ≤ 12 and the rows are chronological asks no question,
  and the range it reports matches the range in the file.
- `↩️ تراجع` on a batch removes exactly that batch's punches, leaves a manually added punch and its
  day intact, and flips the batch row to `reverted`.
- Adding a manual punch for a date with no session creates exactly one session for that date.
- Adding the same manual punch twice is refused with an Arabic message.
- A day with 120 punches shows 120 in the day detail, not 10.
- An employee with zero punches in the range appears in the report with `أيام غياب` equal to the
  working days.
- A punch at 23:30 on the last day of a report range is included.
- The sheets still have exactly the columns from §1 after the first import — nothing else appended.

---

## Traps this repo has actually sprung

1. **The Bash heredoc mangles Arabic and backslashes.** `\\` collapses to `\`, and awkward quoting
   breaks the whole command — and this run is almost entirely Arabic string literals and regexes.
   Use `Write`/`Edit`, or write a Python transform to a file with `Write` and run it. Do not fight
   the heredoc. A mangled Arabic literal looks right in review and is wrong for every user.
2. **`getAllRecords_` is memoised per request** (`02_DataAccess.js` L475–L505) and the memo is
   invalidated by `noteMutation_()`. **Every** write you add — `appendRow`, `setValues`,
   `deleteRow`, `setNumberFormat` on a data range — must call `noteMutation_()`. A missed one is a
   stale read *inside* a save handler: silent, and expensive to find.
3. **`vfPage_` (L4911) treats `limit: null` as unlimited but `limit: undefined` as unlimited too,
   while `Number(data.limit) || 10` upstream turns `0` into `10`.** Read the two together before you
   change any paging call, or you will "fix" a cap and reintroduce it one line up.
4. **`ensureSheet_` caches in `_ensuredSheets_` by `dbId|name`.** A sheet created in one request is
   memoised for that request only. Do not assume it means the headers are right.
5. **`normalizeEmpIdVF_` (L1160) deliberately keeps Arabic letters** — that is exactly what makes
   D-10 possible. Do not "fix" it in place; other callers depend on it. Add the numeric guard at the
   call site instead.
6. **The `Õ` / `ã` AM/PM branch at L2168** is cp1256 mojibake for `ص` / `م`. Keep it as an alias
   after the real decoder lands; do not delete it, and do not rely on it.
7. **Concurrent sessions contaminate commits.** Check `git status` before every commit and stage
   only the paths in §6 of the constraints.

---

## Commit protocol

```
feat(att-<n>): <short summary>

<what changed, file by file>
<what was verified, and how — include the stubbed row maps and the fixture results>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** I push.

---

## Report once, at the end

`VALLEY_ATTENDANCE_RESULTS.md`, covering:

1. Every defect D-01…D-26: fixed / skipped / not-reachable-offline, with the commit that did it.
   The plan's §2 table is the checklist — reproduce it with a status column.
2. The stubbed dry-run row maps for `addManualAttendance_`, `commit_attendance_import` and
   `revert_attendance_import`.
3. The inference engine's result on all seven fixtures, as a table: file → decided format →
   confidence → candidates offered.
4. The owner checklist above, as specific statements.
5. Anything you skipped, and why. A short honest list beats a long confident one.

Append to `NEXT_STEPS_OWNER.md`: **the §1 columns are blocked on the owner** — that is the only edit
you make to that file.

---

## Before you write a single line of code, confirm you understand

1. You will **not** add, rename, reorder or retype any column. The §1 columns are mine to add; your
   code detects them by name and degrades without them.
2. You will **not** add, edit or delete data in any business table, **including `ERP_Pages_Matrix`**.
3. You will **not** push, deploy, `clasp run`, or touch my Google account.
4. You will **not** stop between phases to ask anything. Phase 0 → 7, then one report.
5. The serial storage layer is correct and stays. Every new path calls the existing helpers.
6. `resolveSession_` is the only writer of session rows, and it must find a legacy session whether
   that row holds a serial, a `Date` or `dd/mm/yyyy` text.
7. The dedup key set is rebuilt per chunk, filtered to the batch's date window. Not `CacheService`.
8. `buildForgetFormHtml()` called with no argument still produces byte-identical output.
9. `Client_AttendanceParser.html` goes in `SHARED_PARTIALS`, or the smoke test tries to boot it.
10. Other agents' uncommitted work is in this tree. You stage only your own paths.
