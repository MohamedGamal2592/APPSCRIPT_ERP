# الحضور والانصراف — `vf_hr_attendance` — calendar-first layout

**Goal, as the owner stated it:** the calendar is the page. Everything else — the report, the
two work queues, the import, the filters — sits in **one row above it**, side by side, and opens
on demand. The page must become *very simple*.

**Date:** 2026-09-08
**Branch to cut from:** `feat/realtime-feel` (current)
**Status:** plan only. Nothing in this document has been implemented.
**Scope:** `Company_ValleyFoods_Attendance.html` only, plus its verify suite. **No server change.**

---

## Invariants

1. **No schema change, no data change, no server change.** `Company_ValleyFoods_Actions.js` is
   not opened. Every action the page calls today is called with the same payload tomorrow.
2. **No calculation or wording change.** Every table, header, pill, count and message the page
   renders today is rendered byte-identically tomorrow — only *where* and *when* it appears moves.
   The forget-form print output stays byte-for-byte what `s16` asserts against its fixture.
3. **Every existing element id survives** unless this plan renames it explicitly (§4.2, four ids
   collapse into two). The chunked import wizard, the live poll and `s15`/`s16` all find things
   by id.
4. **Every entry in `window.ATT_PAGE` survives** with the same name and signature.
5. **Mobile-first, five-tier scale** (`CSS_Tokens.html` L163–L185). One new `min-width` query at
   most, and only at `600px` or `900px`. No `max-width` query — the project has none.
6. **The `src_html/` copy is not touched.** It is stale and `.claspignore`d.

---

## 1. The page today

`renderContent()` (L146–L157) stacks **eight cards** in this order, all open at once:

| # | Card | Render fn | Lines | Gated |
|---|---|---|---|---|
| 1 | رفع كشف البصمة (import wizard, in-page) | `renderUploadSection` | L409–L423 | `CAN_WRITE` |
| 2 | تسجيل بصمة يدوية (a one-line card holding one button) | `renderManualSection` | L935–L940 | `CAN_WRITE` |
| 3 | صفوف تحتاج مراجعة (review queue, table) | `renderReviewSection` | L1021–L1025 | — |
| 4 | غياب وبصمات ناقصة (range + table) | `renderExceptionsSection` | L1163–L1171 | — |
| 5 | نموذج نسيان البصمة (a paragraph holding one button) | `renderForgetSection` | L1348–L1352 | — |
| 6 | تقرير الحضور والغياب (range + table + drilldown) | `renderReportSection` | L1250–L1259 | — |
| 7 | **أيام الحضور — the calendar** | `renderSessionsSection` | L164–L179 | — |
| 8 | سجل عمليات الرفع (batches table) | `renderBatchesSection` | L883–L887 | `CAN_WRITE` |

The calendar is card **seven of eight**. A user who opens the page to look at the month scrolls
past six cards to reach it. Two of those cards (2 and 5) exist only to hold a single button. Two
others (4 and 6) each carry their own من/إلى date pair for what is, to the user, the same period.

What already works and is kept as-is: the month bar (L169–L176), `renderCalendar` (L220–L256),
the table alternative (L258–L282), `openSessionDetail` (L302–L316) and every modal the page
already opens (new day L377, manual entry L953, review fix L1094).

---

## 2. The page tomorrow

```
┌ app shell / breadcrumb ────────────────────────────────────────────────────────────────┐
│                                                                                        │
│ [‹ السابق] [ سبتمبر 2026 ] [التالي ›] [اليوم]  │  من [2026-09-01] إلى [2026-09-08]  │  │
│ [📊 التقرير] [⚠️ الناقص ③] [🚩 المراجعة ②] [⬆️ رفع كشف] [المزيد ▾]  ← one row, wraps │
│                                                                                        │
│  السبت   الأحد   الاثنين  الثلاثاء  الأربعاء  الخميس   الجمعة                          │
│ ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐                                     │
│ │      │      │  1   │  2   │  3   │  4   │  5   │                                     │
│ │      │      │ 84 ب │ 86 ب │ 85 ب │ 12 ب │  —   │   ← the calendar IS the body        │
│ │      │      │ 42 م │ 43 م │ 43 م │  6 م │      │      full width, taller cells        │
│ ├──────┼──────┼──────┼──────┼──────┼──────┼──────┤                                     │
│ │  6   │  7   │  8   │  9   │ 10   │ 11   │ 12   │                                     │
│ …                                                                                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**One toolbar, three clusters, one row that wraps.** Right to left (RTL):

| Cluster | Contents | Behaviour |
|---|---|---|
| **Month** | `‹ السابق` · month label · `التالي ›` · `اليوم` | exactly today's L169–L174, moved |
| **Range** | `من` date · `إلى` date | **one** pair, shared by the report and the exceptions queue (§4.2) |
| **Actions** | `📊 التقرير` · `⚠️ الناقص` + badge · `🚩 المراجعة` + badge · `⬆️ رفع كشف` (write) · `المزيد ▾` | each opens a modal; nothing renders in-page except the calendar |

**`المزيد ▾`** is the existing `nav-dropdown` pattern (`UIC.toggleDropdown`, `UI_Components.html`
L4072; markup shape at L1561–L1567). It holds the low-frequency items so the row stays short:

- `+ بصمة يدوية` (write) → `showManualEntryModal()` — unchanged modal
- `+ يوم جديد` (write) → `showNewSessionModal()` — unchanged modal
- `سجل عمليات الرفع` (write) → new modal, §4.4
- `🖨️ نموذج نسيان البصمة` → `printForgetForm()` — unchanged
- `عرض كجدول / عرض كتقويم` → `toggleView()` — unchanged

**Below the toolbar: the calendar, and nothing else.** No card frame, no `أيام الحضور` heading
— the toolbar is its header. The grid gets the room the eight cards used to take (§4.1).

---

## 3. What moves where

| Today | Tomorrow | How |
|---|---|---|
| Import wizard card (1) | `⬆️ رفع كشف` → **`lg` modal** `vf-import-modal` | the card body (L410–L422) becomes the modal body, ids unchanged; `footer: false` |
| Manual entry card (2) | `المزيد ▾` item | card deleted; the button's handler is reused |
| Review queue card (3) | `🚩 المراجعة` → **`xl` modal** `vf-review-modal` | body = `#vf-review-body`; `عرض المعالج أيضاً` becomes the modal's footer button |
| Exceptions card (4) | `⚠️ الناقص` → **`xl` modal** `vf-exc-modal` | body = `#vf-exc-body`; the range is read from the toolbar |
| Forget form card (5) | `المزيد ▾` item | card deleted |
| Report card (6) | `📊 التقرير` → **`xl` modal** `vf-report-modal` | body = `#vf-report-table` + `#vf-report-drill`; range from the toolbar |
| Calendar card (7) | **the page body** | card frame removed; month bar lifted into the toolbar |
| Batches card (8) | `المزيد ▾` item → **`lg` modal** `vf-batches-modal` | body = `#vf-batches-table`; `عرض الكل` becomes the footer button |

Modal widths exist already: `UIC.MODAL_SIZES` (`UI_Components.html` L2999), `modal-lg` 880px,
`modal-xl` 1100px (L5446–L5447). On the phone tier every modal is already a bottom sheet.

---

## 4. Phases

Four commits. Each leaves `node tools/verify/run_all.js` green and the page bootable under
`ui_smoke_pages.js`.

### 4.1 `feat(att-ui-1)` — the toolbar and the calendar body

1. **New `renderToolbar()`** returns one `<div class="vf-att-toolbar">` with the three clusters
   of §2. The month cluster is the existing L169–L174 markup verbatim (same ids:
   `vf-month-prev`, `vf-month-label`, `vf-month-next`, `vf-month-today`). The range cluster is
   two `<input type="date">` with ids `vf-range-start` / `vf-range-end`, defaults
   `monthStartStr()` / `todayStr()` exactly as the two old pairs had. The actions cluster is the
   five buttons of §2 with ids `vf-open-report`, `vf-open-exc`, `vf-open-review`,
   `vf-open-import`, `vf-more-toggle`, and the dropdown menu `vf-more-menu`.
2. **New `renderCalendarSection()`** returns `<div id="vf-days-body">` only — the same id the
   calendar and the table already render into, now without `card()` around it.
3. **`renderContent()`** becomes:
   ```js
   return '<div class="vf-att-page">' + renderToolbar() + renderCalendarSection() + '</div>';
   ```
   `renderSessionsSection` is deleted; the seven other `render*Section` functions are deleted
   in 4.2–4.4 as their modals replace them. Nothing else in the file references them.
4. **CSS**, in the page's `<style>` block, replacing `.vf-att-dashboard` and `.vf-month-bar`:
   ```css
   .vf-att-page    { display: grid; gap: 12px; }
   .vf-att-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
                     padding: 10px 12px; background: var(--bg-surface, #fff);
                     border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; }
   .vf-att-toolbar .vf-tb-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
   .vf-att-toolbar .vf-tb-sep   { display: none; width: 1px; align-self: stretch;
                                  background: var(--border-color, #e5e7eb); }
   .vf-att-toolbar input[type=date] { width: 140px; }
   .vf-cal-cell    { min-height: 64px; }
   @media (min-width: 600px) { .vf-att-toolbar .vf-tb-sep { display: block; } }
   @media (min-width: 900px) {
     .vf-cal-cell  { min-height: 96px; padding: 8px; }
     .vf-cal-day   { font-size: 15px; }
     .vf-cal-stat  { font-size: 12px; }
   }
   ```
   The existing `@media (min-width: 600px)` block at L88–L91 stays (the separator rule can join
   it). Separators are hidden at the base tier because a wrapped row on a phone has nothing
   meaningful to separate. Tap targets are already 44px via the shared `.btn`.
5. **Badges** on `⚠️ الناقص` and `🚩 المراجعة`: reuse the existing `.vf-badge.warn` (L56–L58)
   with ids `vf-exc-badge` and `vf-review-badge`. The review badge already exists at L1022 and
   `loadReview` already fills it (L1033–L1038) — it just moves to the toolbar button. The
   exceptions badge is new (4.3).
6. **`bindEvents()`** binds the five new buttons; the month and view-toggle bindings are
   unchanged. Every `getElementById` stays null-guarded, as it is today, so the smoke boot with
   `CAN_WRITE=false` (no import button, no `المزيد` write items) still passes.
7. **`renderApp()`** boot calls stay `loadSessions(); loadReview(); if (CAN_WRITE) loadBatches();`
   plus one addition from 4.3. `renderBatchesTable` already returns on a missing container
   (L903), so the boot-time batches load is harmless while its modal is closed.

### 4.2 `feat(att-ui-2)` — the report and the exceptions queue share one range

1. `loadReport()` (L1261–L1263) reads `vf-range-start` / `vf-range-end` instead of
   `vf-report-start` / `vf-report-end`. `loadExceptions()` (L1176–L1177) reads the same two
   instead of `vf-exc-start` / `vf-exc-end`. **These are the only id renames in the plan.**
   The old four ids appear nowhere else (checked: L1166, L1167, L1176, L1177, L1253, L1254, L1262,
   L1263 only).
2. **The range follows the month until the user touches it.** A module flag `RANGE_TOUCHED`
   (default `false`) is set by an `input` listener on either date field. `shiftMonth()` and the
   `اليوم` handler call `syncRangeToMonth()` which, when the flag is false, sets the range to
   `monthBounds(VIEW_YEAR, VIEW_MONTH).from` and to the earlier of `monthBounds().to` and
   `todayStr()`. The report and the queue therefore describe the month the calendar shows —
   which is what the user expects a filter above a calendar to do — without a second control.
3. **New `openReportModal()`**: opens `vf-report-modal` (`size: 'xl'`, `footer: false`) with body
   `<div id="vf-report-table"></div><div id="vf-report-drill"></div>`, then calls `loadReport()`.
   The modal title carries the range: `تقرير الحضور والغياب · من … إلى …`. `renderReportTable`
   and `openReportDrill` are untouched; they already render into those two ids.
4. **New `openExceptionsModal()`**: opens `vf-exc-modal` (`size: 'xl'`, `footer: false`) with body
   `<div id="vf-exc-body"></div>`, then `loadExceptions()`. `renderExceptionsTable`,
   `addPunchFromException`, `printForgetFor` are untouched.
5. Re-opening either modal after changing the range simply re-runs the load; the old
   `عرض التقرير` / `عرض` buttons are gone because opening *is* the request.
6. `renderReportSection` and `renderExceptionsSection` are deleted.

### 4.3 `feat(att-ui-3)` — the review queue, the badge, the live poll

1. **New `openReviewModal()`**: `vf-review-modal` (`size: 'xl'`), body `<div id="vf-review-body">`,
   footer = the existing `عرض المعالج أيضاً` toggle button (`vf-review-all-btn`, same handler
   as L1547–L1552, bound after the modal opens). Opening calls `renderReviewTable()` from the
   already-loaded `REVIEW` and then `loadReview()` for freshness — the user sees rows at once.
2. **The exceptions badge.** `loadExceptions(quiet)` gains one line after `EXCEPTIONS = …`:
   `setExcBadge(EXCEPTIONS.length)`, which writes the count into `vf-exc-badge` and hides it at
   zero, exactly the way `loadReview` treats `vf-review-badge` (L1033–L1038).
3. **Boot.** `renderApp()` adds `try { loadExceptions(true); } catch (e) {}` after `loadReview()`
   so the badge is filled on arrival. This is one additional `get_attendance_exceptions` read per
   page open, for the current month. The live poll already fires this exact call on every
   change (L1566), so the cost is not new in kind — only the boot call is new. **Decision D-1**
   below records it as flippable.
4. **The live poll** (L1558–L1570) is unchanged in shape. `loadSessions()` re-renders the
   calendar; `loadExceptions(true)` now also refreshes the badge, and refreshes the table only
   if the exceptions modal happens to be open (the container check at L1192 already does that).
5. `renderReviewSection` is deleted.

### 4.4 `feat(att-ui-4)` — import wizard and import history as modals

1. **New `openImportModal()`**: `vf-import-modal` (`size: 'lg'`, `footer: false`), body = the
   markup of L410–L422 verbatim (`vf-csv-input`, `vf-parse-status`, `vf-analysis-panel`,
   `vf-upload-result` — all four ids unchanged). After opening, bind `change` on `vf-csv-input`
   to `handleFileSelect` (moved out of `bindEvents`, L1529–L1530) and call `resetUploadFlow()`.
2. **The wizard body is untouched.** Every write it makes goes through `getElementById` with a
   null guard (L431–L433, L437–L438, L512, L615, L689, L794, L806, L811, L845 — verified). The
   only behaviour to note: `startCommit()` (L729) already runs under `UI.showSpinner()` (L740),
   which overlays the modal, so the dialog cannot be closed mid-commit. On success the wizard
   already calls `loadSessions()` and `loadBatches()` — the calendar behind the modal updates.
3. **New `openBatchesModal()`**: `vf-batches-modal` (`size: 'lg'`), body `<div id="vf-batches-table">`,
   footer = `عرض الكل` (`vf-batches-all-btn`, same handler as L1532–L1533). Opening renders from
   `BATCHES` immediately, then `loadBatches()`.
4. `undoBatch` (L845–L877) already refreshes both the wizard result panel and the batches table
   through guarded ids; both may now be inside a modal or absent. No change.
5. `renderUploadSection`, `renderManualSection`, `renderForgetSection`, `renderBatchesSection`
   are deleted. `card()` (L139–L143) has no callers left and is deleted too.
6. Export the five `open*Modal` functions on `window.ATT_PAGE` (additive; §Invariant 4).

---

## 5. Verify — `tools/verify/s16_attendance.js`, new section §L (layout)

Static assertions against the page source, in the style the suite already uses (`PAGE.indexOf`):

| # | Assertion |
|---|---|
| L-1 | `renderContent` returns `renderToolbar()` **before** `renderCalendarSection()` and nothing else |
| L-2 | none of the eight deleted `render*Section` names occur in the page; `card(` has zero callers |
| L-3 | the page contains `id="vf-days-body"` exactly once, and it is not inside a `vf-card` |
| L-4 | ids present: `vf-month-prev`, `vf-month-label`, `vf-month-next`, `vf-month-today`, `vf-view-toggle`, `vf-range-start`, `vf-range-end`, `vf-open-report`, `vf-open-exc`, `vf-open-review`, `vf-exc-badge`, `vf-review-badge`, `vf-more-menu` |
| L-5 | ids absent: `vf-report-start`, `vf-report-end`, `vf-exc-start`, `vf-exc-end`, `vf-show-report-btn`, `vf-exc-btn` |
| L-6 | every modal id (`vf-import-modal`, `vf-review-modal`, `vf-exc-modal`, `vf-report-modal`, `vf-batches-modal`) is opened with an explicit `size:` of `lg` or `xl` |
| L-7 | `loadReport` and `loadExceptions` both read `vf-range-start` and `vf-range-end` |
| L-8 | every `min-width` literal in the page's `<style>` is `600px` or `900px`; no `max-width` |
| L-9 | `window.ATT_PAGE` still exports all 16 names of L1574–L1591 (list them) plus the five `open*Modal` |
| L-10 | `buildForgetFormHtml()` with no argument still equals the committed fixture (already exists — re-run, must stay green) |
| L-11 | `printForgetForm` still passes `features: 'width=800,height=600'` (s15 L216 — must stay green) |

Plus the two boots that already run: `node tools/verify/ui_smoke_pages.js` (the page boots
with `CAN_WRITE` true and false without throwing) and `node tools/verify/parse_pages.js`.

**Manual check after deploy (owner):** open the page on a phone width; the toolbar wraps to
2–3 rows, the calendar fills the rest; every modal opens as a bottom sheet; `المزيد ▾` closes on
Escape and on tap-outside (the shared dropdown already does both).

---

## 6. Decisions taken here, so the run does not ask

| # | Decision | Why |
|---|---|---|
| D-1 | Load the exceptions count at boot (one extra read) | a `الناقص ③` badge is the reason the queue no longer needs a card; if page-open time regresses in the telemetry sheet, drop the boot call and fill the badge on first open — a one-line revert |
| D-2 | One range for report + exceptions, following the month until touched | the two pairs were always set to the same values; a filter above a calendar that disagrees with the calendar is a bug the user has to notice |
| D-3 | Report, exceptions, review → `xl`; import, batches → `lg` | the three tables have 6–8 columns plus actions; the import panel is narrow text and cards |
| D-4 | `عرض كجدول` lives in `المزيد ▾`, not on the row | it is a preference, not a task; the row is for tasks |
| D-5 | No new shared component in `UI_Components.html` | one page uses this toolbar; promote it only when a second page wants it |
| D-6 | The calendar cell content is unchanged (day, ⚠ count, بصمة, موظف) | the owner liked the calendar as it is; the change is its size and its position |
| D-7 | Icons on the action buttons are emoji, like every other button on this page | `UIC.icon` exists, but the page is consistently emoji and mixing the two reads worse than either |

---

## 7. Non-goals

- No change to any server handler, payload, or response shape.
- No change to the calendar's data (what a cell shows) or to the day-detail modal.
- No change to the import wizard's logic, its consequence cards, or its chunked commit.
- No week view, no drag-to-select range on the calendar, no per-employee calendar. Each is a
  reasonable next step; none is part of *make the page very simple*.
- No touch to `src_html/`, `ERP_Pages_Matrix`, `Company_ValleyFoods_Registry.js` or the nav.

---

## 8. Line references

Taken at HEAD `a31a6e3` on `feat/realtime-feel`; `Company_ValleyFoods_Attendance.html` is clean
in the working tree at the time of writing. **Verify each one before editing** — the file is
1,597 lines and every phase shortens it.
