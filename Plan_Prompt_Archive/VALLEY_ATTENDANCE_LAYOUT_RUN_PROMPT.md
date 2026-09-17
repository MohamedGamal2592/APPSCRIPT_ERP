# RUN PROMPT — calendar-first layout for الحضور والانصراف (`vf_hr_attendance`, Valley Foods)

Rebuild the **layout** of the Valley Foods attendance page so the calendar is the body of the page
and everything else sits in one toolbar row above it, per
**[VALLEY_ATTENDANCE_LAYOUT_PLAN.md](VALLEY_ATTENDANCE_LAYOUT_PLAN.md)**.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This run writes **client code only**, in **one page file** and **one verify file**. It opens no
server file, touches no spreadsheet, creates no rows, edits no rows, deletes no rows, adds no
column, and changes no calculation, header, label or message.

---

## 🔁 Autonomy — read this first

**Do not stop between phases. Do not ask "shall I continue?". Do not ask me to approve a phase, a
diff, a commit or a decision.** Work straight through Phase 0 → 5 and report **once**, at the end.

Every open decision is **already answered** in the plan's §6 and in §Decisions below. If you want
to ask a question:

1. **The plan or §Decisions covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the results doc, continue.
3. **Genuinely blocked** (needs a browser, needs a live sheet, needs my Google account) → write it
   on the owner checklist and **continue with everything else**.
4. **A whole phase is unworkable** → say so plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess, and **far** better than a stopped run.

Commit after each phase **without asking**. Do not push. Do not deploy.

---

## Read these first, in full, before touching anything

1. **`VALLEY_ATTENDANCE_LAYOUT_PLAN.md`** — your specification. §2 is the target layout, §3 the
   move table, §4 the four phases, §5 the eleven verify assertions, §6 the decisions. **This
   prompt orients you; the plan decides.** Where they disagree, the plan wins — except in
   §Decisions below, which is newer.
2. **`Company_ValleyFoods_Attendance.html`** — all 1,597 lines. It is the only file you reshape.
   Read `renderContent()` (L146–L157), every `render*Section` (plan §1 table), `bindEvents()`
   (L1514–L1553), the live poll (L1558–L1570) and the `window.ATT_PAGE` export (L1574–L1591)
   with particular care.
3. **`UI_Components.html`** — `UIC.openModal` (L3001–L3060) and `UIC.MODAL_SIZES` (L2999):
   `size: 'lg'` and `size: 'xl'` exist, `footer: false` and `footer: '<html>'` exist. The
   `nav-dropdown` markup shape (L1561–L1567) and `UIC.toggleDropdown` (L4072) are the dropdown
   you reuse for `المزيد ▾`. `UIC.readSkeleton` (L1762) is what the loads already use.
4. **`tools/verify/s16_attendance.js`** — the page's existing suite. You add a section; you do not
   weaken one. Note how `PAGE` is read (L31) and how the forget-form fixture is compared
   (L194–L206) — that comparison must stay green.
5. **`tools/verify/s15_iphone_rest.js` L51 and L216** — pins `printForgetForm` and its
   `features: 'width=800,height=600'`. Must stay green.
6. **`tools/verify/ui_smoke_pages.js`** — boots every page under a DOM stub. Your page must boot
   with `CAN_WRITE` true and false. Read its header comment (L80–L100) for what the stub does
   and does not provide.
7. **`CSS_Tokens.html` L163–L185** — the five-tier breakpoint scale. Your only width queries are
   `min-width: 600px` and `min-width: 900px`.
8. **`VALLEY_ATTENDANCE_RESULTS.md`** — what the previous run built and why. Skim §0 and §1 so you
   know which behaviours are load-bearing (dedup, chunked commit, undo, live poll).

**Verify every `file:line` before you edit it.** Line numbers in the plan and in this prompt were
taken at HEAD `a31a6e3` and drift with every commit — confirm each one yourself.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER open a server file

`Company_ValleyFoods_Actions.js` is not read for editing and not edited. No handler, payload or
response shape changes. If the layout seems to need a server change, it does not — the plan was
written against the existing responses, and every load function keeps its call byte-identical.

## 2. NEVER change a schema, NEVER add, edit or delete data

No column, no row, no cell, in any business table, in any spreadsheet, **including
`ERP_Pages_Matrix`**. You do not need it — no new action is introduced.

## 3. NEVER deploy, push, or touch my Google account

No `clasp push`, no `clasp run`, no `clasp deploy`, no `git push`. I push and I deploy.

## 4. NEVER break a public contract

- Every element id in the page survives except the four the plan renames in §4.2
  (`vf-report-start`, `vf-report-end`, `vf-exc-start`, `vf-exc-end` → `vf-range-start`,
  `vf-range-end`). The chunked import wizard and the live poll find things by id.
- Every one of the 16 names on `window.ATT_PAGE` survives with the same signature. You add
  five `open*Modal` names; you remove none.
- `buildForgetFormHtml()` and `printForgetForm()` are **not touched**. The no-argument print
  output stays byte-identical to the fixture.
- `UIC.*`, `API.*`, `FMT.*` are shared by three companies. You call them; you do not edit
  `UI_Components.html`. Plan §6 D-5: no new shared component.

## 5. NEVER change what the page says

Every table header, status pill, count, toast, empty-state message and Arabic label is rendered
tomorrow exactly as today. The only new strings are the toolbar button labels and the modal
titles listed in the plan §2, and the `المزيد ▾` menu items, which reuse the old card titles.
No calculation moves. No column order moves.

## 6. NEVER rewrite history

No `rebase`, no `amend`, no `reset --hard`, no force anything. Other sessions' uncommitted work
is in this tree — `git status` at HEAD shows a dozen modified and untracked files that are not
yours. **Stage explicit paths only, never `git add -A`.**

## 7. Stay inside your file set

```
Company_ValleyFoods_Attendance.html            (the page)
tools/verify/s16_attendance.js                 (one new section, §L)
VALLEY_ATTENDANCE_LAYOUT_RESULTS.md            (new, Phase 5)
```

**Never `src_html/Company_ValleyFoods_Attendance.html`.** It is stale, `.claspignore`d, and not
the truth about anything. Never `tools/verify/run_all.js` — s16 is already registered.

---

## Decisions — already made, do not re-ask

The plan's §6 (D-1 … D-7) stands. These are additional or more specific:

| # | Decision |
|---|---|
| R-1 | **Toolbar order in the DOM** (which is RTL visual right-to-left): month cluster, separator, range cluster, separator, actions cluster. The actions cluster order: `📊 التقرير`, `⚠️ الناقص`, `🚩 المراجعة`, `⬆️ رفع كشف` (write only), `المزيد ▾`. |
| R-2 | **Button classes.** `⬆️ رفع كشف` is `btn btn-primary`; every other toolbar button is `btn btn-outline`; the month buttons keep exactly their current classes. |
| R-3 | **`المزيد ▾` item order:** `+ بصمة يدوية` (write), `+ يوم جديد` (write), `سجل عمليات الرفع` (write), `🖨️ نموذج نسيان البصمة`, then the view toggle (`عرض كجدول` / `عرض كتقويم`, id `vf-view-toggle`, relabelled by `renderDays()` exactly as today). A read-only user sees only the last two items. |
| R-4 | **Badges** render as `<span class="vf-badge warn" id="…" style="display:none;"></span>` inside the button, after the label, and are shown only for a count above zero. Same markup and same show/hide logic as the existing review badge (L1022, L1033–L1038). |
| R-5 | **Modal titles:** `تقرير الحضور والغياب · من {start} إلى {end}`, `غياب وبصمات ناقصة · من {start} إلى {end}`, `صفوف تحتاج مراجعة`, `رفع كشف البصمة`, `سجل عمليات الرفع`. Dates in the title are the raw `YYYY-MM-DD` input values, escaped with `esc()`. |
| R-6 | **Range validation** stays where it is: `loadReport` and `loadExceptions` already toast `اختر التاريخ` / `اختر الفترة` on an empty field. Opening the modal with an empty range opens it, then the load toasts and the body stays empty. Do not add a second check. |
| R-7 | **`syncRangeToMonth()`** runs on `shiftMonth()`, on `اليوم`, and once at boot after the toolbar renders. It never runs when `RANGE_TOUCHED` is true. The `input` listener that sets the flag is bound in `bindEvents()`. |
| R-8 | **Opening a modal that is already open** (double-click) is handled by `UIC.openModal` itself — it removes an existing element with the same id. Do not add guards. |
| R-9 | **Boot order in `renderApp()`:** `loadSessions()`, `loadReview()`, `loadExceptions(true)` inside `try/catch`, then `if (CAN_WRITE) loadBatches()`. No other order. |
| R-10 | **Delete, do not comment out.** `card()`, the eight `render*Section` functions, `.vf-att-dashboard` and `.vf-month-bar` CSS are removed. A commented-out function is a lie about what the file does. |
| R-11 | **Keep the comments that explain a decision** (the D-xx references, the "week starts on Saturday" note, the "never capped" note). Move them with the code they describe. Drop only comments whose subject no longer exists. |
| R-12 | **The old section comments** (`/* ================= IMPORT WIZARD ================= */` etc.) stay as the file's map; add `/* ================= TOOLBAR ================= */` above `renderToolbar`. |
| R-13 | **No `UIC.icon` calls** on the new buttons (plan D-7). Emoji only, as the rest of the page. |
| R-14 | **`ui_smoke_pages.js` must stay at exactly its current count** of booting pages. The three known failures (`0_ERP_Management.html`, `Company_TopChemical_MainReview.html`, `DbLive_Viewer.html`) are not yours; do not touch them. |

---

## Your task — six phases, in order, one commit each

| Phase | Commit | What | Plan |
|---|---|---|---|
| **0** | — | State check. `git status`, `git log -1`, `node tools/verify/run_all.js`, `node tools/verify/ui_smoke_pages.js`. Record the counts. Re-derive every line number you will use. No edit. | §8 |
| **1** | `feat(att-ui-1)` | `renderToolbar()`, `renderCalendarSection()`, the new `renderContent()`, the CSS, the five new bindings, both badges' markup. The old cards are **still rendered** in this commit — below the calendar — so the page is never half-built. | §4.1 |
| **2** | `feat(att-ui-2)` | One shared range; `RANGE_TOUCHED` + `syncRangeToMonth()`; `openReportModal()`, `openExceptionsModal()`; delete the report and exceptions cards. | §4.2 |
| **3** | `feat(att-ui-3)` | `openReviewModal()`; the exceptions badge; the boot-time quiet exceptions load; delete the review card. | §4.3 |
| **4** | `feat(att-ui-4)` | `openImportModal()`, `openBatchesModal()`; `المزيد ▾` wired; delete the upload, manual, forget and batches cards and `card()`; export the five `open*Modal` names. | §4.4 |
| **5** | `test(att-ui-5)` | s16 §L (eleven assertions), `VALLEY_ATTENDANCE_LAYOUT_RESULTS.md`. | §5 |

**Phase 1 keeps the old cards on purpose.** Commit 1 must leave a page that works end-to-end
even though it is temporarily redundant (toolbar above, cards still below). That is what makes
each later phase a pure move — one card out, one modal in — and it is what lets me bisect if a
modal misbehaves. Do not "save a step" by deleting cards in Phase 1.

### The phase that carries real risk — Phase 4

The import wizard writes into four ids across ~450 lines (L409–L877) through many separate
`getElementById` calls. Inside a modal those elements exist only while the modal is open. The
plan verified every write is null-guarded; **verify it again yourself** — grep every
`getElementById('vf-` between `renderUploadSection` and `undoBatch` and confirm each result is
checked before use. `startCommit()` runs under `UI.showSpinner()`, which is what stops the user
closing the modal mid-commit; confirm that overlay still covers a `.modal-overlay` (it does
today for the review-fix modal — same mechanism). If you find an unguarded write, add the guard
in the same style as its neighbours (`if (!el) return;`) — that is the only edit allowed inside
the wizard body.

---

## Verification — you cannot see a browser and cannot read the spreadsheet

After **every** phase, all of these, all green, before you commit:

```
node --check is not applicable to an HTML page; instead:
node tools/verify/parse_pages.js            # both templates still parse
node tools/verify/ui_smoke_pages.js         # same boot count as Phase 0
node tools/verify/s16_attendance.js         # the page's own suite
node tools/verify/s15_iphone_rest.js        # printForgetForm pin
node tools/verify/run_all.js                # the whole suite, same pass count as Phase 0 (+0; s16 is one step)
```

Plus, per phase, by reading the source (write the result into the results doc):

- **Phase 1:** `renderContent()` output order; the toolbar contains all 13 ids of plan §5 L-4;
  every `bindEvents()` lookup is null-guarded.
- **Phase 2:** the four old range ids are gone from the file; both loads read the two new ids;
  `syncRangeToMonth` is called from exactly three places (boot, `shiftMonth`, `اليوم`).
- **Phase 3:** the live poll's `onChange` body is byte-identical to L1562–L1568 today.
- **Phase 4:** the wizard body between `resetUploadFlow` and `undoBatch` is byte-identical
  except for any guard you had to add (diff it and list the hunks); `window.ATT_PAGE` has 21
  names.
- **Phase 5:** s16 §L fails when you temporarily break any one of its assertions (prove one:
  rename `vf-range-start` in a scratch copy, run, see the failure, revert).

**The forget-form fixture comparison in s16 must pass at every commit.** If it fails, you edited
`buildForgetFormHtml` or its string neighbours; back that out.

---

## Traps this repo has actually sprung

1. **The Bash heredoc mangles Arabic and backslashes.** This run is almost entirely Arabic string
   literals. Use `Write`/`Edit` for every edit to the page. A mangled Arabic literal looks right
   in review and is wrong for every user.
2. **Ids inside modals are created late.** `bindEvents()` runs once at boot; anything you bind
   by id inside a modal body (`vf-csv-input`, `vf-review-all-btn`, `vf-batches-all-btn`) must be
   bound **after** `UIC.openModal` returns, inside the `open*Modal` function. The old bindings in
   `bindEvents()` for those three ids must be removed, or they silently bind to nothing.
3. **`UIC.openModal` default footer is إلغاء + حفظ.** Every modal in this plan is read-or-act,
   not a form: pass `footer: false` or an explicit footer string. A stray default `حفظ` button
   with an empty `onSave` is a button that does nothing and looks broken.
4. **`renderDays()` relabels `vf-view-toggle`** (L213–L214) by id. Moving the toggle into the
   dropdown is fine as long as the id survives and the element is a button.
5. **`UIC.readSkeleton('vf-exc-body')`** (L1180) targets an id that now exists only inside a
   modal. The quiet path (`loadExceptions(true)`) skips it; the loud path is only ever called
   from `openExceptionsModal` after the modal exists. Keep that order.
6. **Concurrent sessions contaminate commits.** Check `git status` before every commit and stage
   only the paths in §7 of the constraints.
7. **The `min-width: 600px` block already exists** (L88–L91). Add your separator rule *to it*
   rather than writing a second `600px` query; `tools/ui_check.js` C7 counts queries and the
   plan promised at most one new one.

---

## Commit protocol

```
feat(att-ui-<n>): <short summary>

<what changed, function by function>
<what was verified, and how — the five commands and their counts>
<what was skipped and why>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** I push.

---

## Report once, at the end

`VALLEY_ATTENDANCE_LAYOUT_RESULTS.md`, covering:

1. The plan's §3 move table with a status column: moved / skipped, and the commit that did it.
2. The plan's §5 assertion table (L-1 … L-11) with pass/fail at the final commit, plus the
   deliberate-break proof for Phase 5.
3. The five verify command counts at Phase 0 and at every commit, as one table.
4. The exact list of guards you added inside the import wizard in Phase 4 (expected: none).
5. The final `window.ATT_PAGE` export list.
6. Line count of the page before and after.
7. An owner checklist: what I must look at in a browser after deploy (phone-width wrap, the five
   modals, the dropdown's Escape/tap-outside, the badge counts against the sheet).
8. Anything you skipped, and why. A short honest list beats a long confident one.

---

## Before you write a single line of code, confirm you understand

1. You will edit **two files** and create **one**. Nothing else.
2. You will **not** open `Company_ValleyFoods_Actions.js`, any spreadsheet, or `src_html/`.
3. You will **not** push, deploy, `clasp run`, or touch my Google account.
4. You will **not** stop between phases to ask anything. Phase 0 → 5, then one report.
5. Phase 1 keeps every old card rendered below the toolbar. Cards leave one phase at a time.
6. Four ids are renamed; every other id survives; every `ATT_PAGE` name survives.
7. `buildForgetFormHtml` and `printForgetForm` are not touched, and the fixture stays green.
8. Every modal passes an explicit `size` and an explicit `footer`.
9. Bindings for ids that live inside a modal are made after the modal opens, not in `bindEvents()`.
10. The only new width query is `min-width: 900px`; the separator rule joins the existing `600px` block.
