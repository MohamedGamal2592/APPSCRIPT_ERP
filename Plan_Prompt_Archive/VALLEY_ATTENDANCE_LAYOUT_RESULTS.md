# الحضور والانصراف — calendar-first layout — results

**Plan:** [VALLEY_ATTENDANCE_LAYOUT_PLAN.md](VALLEY_ATTENDANCE_LAYOUT_PLAN.md)
**Run prompt:** [VALLEY_ATTENDANCE_LAYOUT_RUN_PROMPT.md](VALLEY_ATTENDANCE_LAYOUT_RUN_PROMPT.md)
**Date:** 2026-09-08
**Branch:** `feat/realtime-feel`, cut from `a31a6e3`
**Files touched:** `Company_ValleyFoods_Attendance.html`, `tools/verify/s16_attendance.js`, this file.
No server file was opened, no spreadsheet touched, nothing pushed or deployed.

## 0. The commits

| Phase | Commit | Summary |
|---|---|---|
| 1 | `c6882c0` | `feat(att-ui-1)` — one toolbar over the calendar; the cards stay below for now |
| 2 | `f4e55fe` | `feat(att-ui-2)` — one range for the report and the exceptions queue; both open as modals |
| 3 | `d0084f8` | `feat(att-ui-3)` — the review queue opens as a modal; the الناقص badge fills at boot |
| 4 | `e186189` | `feat(att-ui-4)` — the import wizard and the import history open as modals; المزيد ▾ is complete |
| 5 | (this commit) | `test(att-ui-5)` — s16 §L, this document |

Each commit was staged by explicit path. The dozen modified and untracked files belonging to
other sessions were not staged at any point.

## 1. The plan's §3 move table, with status

| Today (at a31a6e3) | Tomorrow | Status | Commit |
|---|---|---|---|
| Import wizard card (1) | `⬆️ رفع كشف` → `lg` modal `vf-import-modal`, `footer: false` | **moved** — body markup verbatim, four ids unchanged; `change` on `vf-csv-input` bound after open; `resetUploadFlow()` on open | `e186189` |
| Manual entry card (2) | `المزيد ▾` item `+ بصمة يدوية` → `showManualEntryModal()` | **moved** — card deleted, handler reused, `vf-manual-add-btn` id kept | `e186189` |
| Review queue card (3) | `🚩 المراجعة` → `xl` modal `vf-review-modal`; `عرض المعالج أيضاً` is the footer | **moved** — renders from `REVIEW` at once, then `loadReview()` | `d0084f8` |
| Exceptions card (4) | `⚠️ الناقص` → `xl` modal `vf-exc-modal`, `footer: false`; range from the toolbar | **moved** | `f4e55fe` |
| Forget form card (5) | `المزيد ▾` item `🖨️ نموذج نسيان البصمة` → `printForgetForm()` | **moved** — card deleted, `vf-print-forget-btn` id kept | `e186189` |
| Report card (6) | `📊 التقرير` → `xl` modal `vf-report-modal`, `footer: false`; range from the toolbar | **moved** | `f4e55fe` |
| Calendar card (7) | the page body; month bar lifted into the toolbar | **moved** — no card frame, no heading; `#vf-days-body` is the only thing under the toolbar | `c6882c0` |
| Batches card (8) | `المزيد ▾` item `سجل عمليات الرفع` → `lg` modal `vf-batches-modal`; `عرض الكل` is the footer | **moved** — renders from `BATCHES` at once, then `loadBatches()` | `e186189` |
| `+ يوم جديد` (was the calendar card's header button) | `المزيد ▾` item | **moved** in Phase 1, because its card left in Phase 1 | `c6882c0` |
| `عرض كجدول / عرض كتقويم` (was on the month bar) | `المزيد ▾` item, id `vf-view-toggle`, relabelled by `renderDays()` as before | **moved** | `c6882c0` |

**How `المزيد ▾` filled up.** The menu never held an item whose card was still on the page, so no
id was ever duplicated in any commit. Phase 1 gave it `+ يوم جديد` and the view toggle (their
card left in Phase 1); Phase 4 added `+ بصمة يدوية`, `سجل عمليات الرفع` and `🖨️ نموذج نسيان
البصمة` in the order R-3 asks for. A read-only user sees only the last two.

**Phase 1 bridge.** Until a card had its modal, its toolbar button scrolled the page to the card
(a temporary `jumpTo()`), so the row was usable from the first commit. `jumpTo()` was deleted in
Phase 4 with the last card.

## 2. The plan's §5 assertions at the final commit

All run by `node tools/verify/s16_attendance.js`, section **L** (73 checks). All pass.

| # | Assertion | Result |
|---|---|---|
| L-1 | `renderContent` returns `renderToolbar()` before `renderCalendarSection()` and nothing else | PASS (the return expression is compared literally) |
| L-2 | none of the eight deleted `render*Section` names occur; `card(` has zero callers | PASS (comments stripped first) |
| L-3 | `id="vf-days-body"` exactly once, and not inside a `vf-card` | PASS (and no `vf-card` / `vf-att-card` anywhere) |
| L-4 | the 13 toolbar ids present | PASS, each exactly once |
| L-5 | the 6 old ids absent | PASS |
| L-6 | each of the 5 modal ids opened with an explicit `size:` of `lg` or `xl` | PASS, plus an explicit `footer:` on each |
| L-7 | `loadReport` and `loadExceptions` read `vf-range-start` and `vf-range-end` | PASS |
| L-8 | every width query in `<style>` is `min-width` 600px or 900px; no `max-width` | PASS (`tools/ui_check.js` C7 agrees: 24 on-scale, 0 off-scale) |
| L-9 | `window.ATT_PAGE` exports the 16 original names plus the 5 `open*Modal` | PASS, exactly 21 |
| L-10 | `buildForgetFormHtml()` with no argument equals the fixture | PASS (also §7, unchanged) |
| L-11 | `printForgetForm` still passes `features: 'width=800,height=600'` | PASS (also `s15_iphone_rest.js`) |
| L-12 (added) | `vf-csv-input`, `vf-review-all-btn`, `vf-batches-all-btn` are bound inside their `open*Modal`, not in `bindEvents()` | PASS |

L-12 is one more than the plan's eleven. It pins the trap the prompt named (a binding in
`bindEvents()` for an id that only exists inside a modal binds to nothing, silently).

**Deliberate-break proof (Phase 5).** With `vf-range-start` renamed to `vf-range-begin` throughout
the working file, s16 reported `3 attendance check(s) FAILED`: L-4 (`vf-range-start` present
exactly once), L-7 for `loadReport`, L-7 for `loadExceptions`. The file was then restored with
`git checkout -- Company_ValleyFoods_Attendance.html`; `git diff --stat HEAD` on it is empty and
s16 passes again.

## 3. The five verify commands, at Phase 0 and at every commit

| Command | Phase 0 (`a31a6e3`) | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|---|
| `parse_pages.js` | all parse | all parse | all parse | all parse | all parse | all parse |
| `ui_smoke_pages.js` | 98 templates, 95 booted, 3 known | 95 / 3 | 95 / 3 | 95 / 3 | 95 / 3 | 95 / 3 |
| `s16_attendance.js` | 147 PASS, 0 FAIL | 147 / 0 | 147 / 0 | 147 / 0 | 147 / 0 | **220 / 0** |
| `s15_iphone_rest.js` | OK | OK | OK | OK | OK | OK |
| `run_all.js` | 69 checks pass | 69 | 69 | 69 | 69 | 69 |

The three known smoke failures (`0_ERP_Management.html`, `Company_TopChemical_MainReview.html`,
`DbLive_Viewer.html`) are unchanged and were not touched. `run_all.js` counts s16 as one step, so
its total is unchanged by the 73 new checks.

**One check the harness does not run, run by hand.** `ui_smoke_pages.js` executes each page's
top-level script but never dispatches `DOMContentLoaded`, so `renderApp()` is not exercised by
it. A scratch script (not committed; it lives in the session scratchpad) loaded the real shared
layer and the page under `tools/verify/domstub.js`, recorded the `DOMContentLoaded` listeners,
created `#vf-root`, and fired them with `UIC.canAdd_` forced to `true` and then `false`:

- both boots ran `renderApp()` without throwing;
- with `CAN_WRITE` true, all 15 toolbar / menu ids were present; with it false, exactly
  `vf-open-import`, `vf-manual-add-btn`, `vf-new-session-btn`, `vf-open-batches` were absent;
- `window.ATT_PAGE` had 21 names both ways;
- each of the five `open*Modal` created its modal element with the expected size class and
  footer presence: report xl / no footer, exceptions xl / no footer, review xl / footer,
  import lg / no footer, batches lg / footer.

## 4. Guards added inside the import wizard in Phase 4

**None.** Every `getElementById('vf-…')` between `renderUploadSection` (now `openImportModal`)
and `undoBatch` was listed with its following line: nine sites, each checked before use
(`if (input)`, `if (!el) return`, `if (!panel || !PARSED) return`, `if (panel) {…}`,
`if (!container) return`). The two loop-form lookups (`getElementById(id)` inside `forEach` in
`resetUploadFlow` and `handleFileSelect`) are guarded with `if (el)`. The region from
`function resetUploadFlow()` to `function undoBatch(` was diffed against `a31a6e3` after Phase 4:
426 lines, **identical**.

`startCommit()` runs under `UI.showSpinner()`, which is `UIC.showPageLoading()`: `#page-loading`
is `position: fixed; inset: 0; z-index: 1500`, above `.modal-overlay` at 1000. The dialog is
covered for the whole chunked commit, as it is today for the review-fix modal.

## 5. `window.ATT_PAGE` at the final commit (21 names)

```
openSessionDetail, saveNewSession, loadAllDays, addPunchForDay, showReviewFix,
saveReviewFix, discardReview, addPunchFromException, printForgetFor, openReportDrill,
resetUpload, chooseFormat, showAlternatives, startCommit, undoBatch, saveManualEntry,
openReportModal, openExceptionsModal, openReviewModal, openImportModal, openBatchesModal
```

The first 16 are the original 16 with the same signatures; the last 5 are new.

## 6. Line counts

| File | Before (`a31a6e3`) | After | Δ |
|---|---|---|---|
| `Company_ValleyFoods_Attendance.html` | 1,597 | 1,728 | +131 |
| `tools/verify/s16_attendance.js` | 796 | 913 | +117 |

The page grew, not shrank. Eight small card builders and `card()` (about 75 lines) left; the
toolbar builder, `moreItem()`, `syncRangeToMonth()`, `setExcBadge()`, five `open*Modal` functions,
two CSS blocks and the comments that explain each decision came in. The wizard, the calendar, the
tables and the forget form are byte-identical.

## 7. Owner checklist — what to look at in a browser after deploy

1. **Phone width (< 600px).** The toolbar wraps to two or three rows; the hairline separators
   are hidden; the calendar fills the rest with 64px cells. Nothing scrolls horizontally.
2. **Tablet-p (≥ 600px).** The separators appear; cells go to 74px. **Tablet-l (≥ 900px):** cells
   go to 96px with 15px day numbers and 12px stats.
3. **The five modals**, each once: `📊 التقرير`, `⚠️ الناقص`, `🚩 المراجعة`, `⬆️ رفع كشف`
   (write user), and `سجل عمليات الرفع` under `المزيد ▾`. On a phone each is a bottom sheet;
   above 600px, a centred box at 1100px (xl) or 880px (lg). Each has a `×`, no `حفظ`; review and
   batches have their toggle button as the footer.
4. **`المزيد ▾`** closes on Escape, on tap-outside, and after picking any item. The toggle uses
   the shared `nav-dropdown` classes, so it looks like the nav's dropdowns; if you want it to
   look like a plain `btn-outline`, that is one CSS rule on `#vf-more-toggle`.
5. **The badges against the sheet.** `🚩 المراجعة` shows `open_count` from `get_attendance_review`
   (unchanged logic, moved element). `⚠️ الناقص` shows the row count of
   `get_attendance_exceptions` for the toolbar range — at boot, that is the 1st of this month to
   today. Check both numbers against the queue tables that open.
6. **The range follows the month.** Press `‹ الشهر السابق`: من/إلى become that month's first and
   last day. Press `اليوم`: back to the 1st–today. Edit either date by hand, then change the month:
   the range must **stay** as you set it (it is yours from the first edit until reload).
7. **A future month** (D-2, as specified): the end date is clamped to today, so من is after إلى.
   Opening the report then shows whatever the server returns for an inverted range (today: an
   Arabic error toast from `get_attendance_report`'s own validation, or an empty table). If that
   reads badly, the one-line change is in `syncRangeToMonth()`: use `b.to` unclamped for a month
   after the current one.
8. **Empty range.** Clear a date field and open `📊 التقرير`: the modal opens, the toast
   `اختر التاريخ` fires, the body stays empty (R-6, no second check added).
9. **Import end to end** on a write account: pick a file inside the modal, confirm, watch the
   spinner cover the dialog during the chunked commit, see the result panel inside the modal and
   the calendar behind it refresh. Then `↩️ تراجع` from the result panel and from
   `سجل عمليات الرفع`.
10. **Table view.** `المزيد ▾ → عرض كجدول`: the month controls dim to 55% (that hook survived:
    the month group still carries the `vf-month-bar` class name, with no CSS of its own), the
    item relabels to `عرض كتقويم`, `عرض الكل (n)` still works.
11. **Page-open time in the telemetry sheet.** D-1 added one `get_attendance_exceptions` read at
    boot. If it regresses the page's open time, delete the `try { loadExceptions(true); } …` line
    in `renderApp()`; the badge then fills on the queue's first open.

## 8. What was skipped, and why

- **Nothing in the plan was skipped.** All four implementation phases and the verify phase were
  done as specified, in order, one commit each.
- **Not verified in a browser**, because there is none here: the wrap at phone width, the modal
  sheet vs box rendering, the dropdown's Escape / tap-outside, the actual badge numbers. All are
  on the checklist above. The DOM-stub boot in §3 is the closest offline stand-in and it passed.
- **`ui_smoke_pages.js` was not changed** (R-14): it still boots 95 of 98 with the same three
  known failures. The `renderApp()`-level boot described in §3 would be a genuine strengthening
  of that harness (it fires `DOMContentLoaded`, which the harness records but never dispatches);
  it was kept out of the file set on purpose and is offered as a follow-up.
- **The month group keeps the class name `vf-month-bar`** although R-10 deletes the `.vf-month-bar`
  CSS rule. The rule is gone; the name stays only because `renderDays()` still uses
  `querySelector('.vf-month-bar')` to dim the month controls in table mode, and dropping the
  behaviour would have been a wording-level change the plan forbids. Noted, not hidden.
- **Two Git messages on every commit** that are not this run's: `warning: … LF will be replaced
  by CRLF` (the repo has `core.autocrlf=true` and the file is LF in the working tree; the commits
  contain only the intended hunks, checked with `git show --stat`) and `error: failed to delete
  '.git/worktrees/clean': Permission denied` (a stale worktree entry from another session that
  Git tries to prune on commit; harmless, not touched).
- **The forget-form card's explanatory sentence** (`نموذج ثنائي اللغة …`) had no home once the
  card was gone; the plan deletes the card. Its meaning survives as an English source comment
  above `buildForgetFormHtml`.
