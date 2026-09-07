# iPhone, part two — the print windows, TopChemical and ValleyFoods

Five commits, nothing pushed, nothing deployed. No schema was touched, no row was created, edited or
deleted, and no Google account was used. This run wrote code only.

The first iPhone run fixed TopLight. The same three bugs were still live everywhere else, and one of
them — the print button that opens a blank tab and writes a document into it — was broken on iPhone
on **every** company, TopLight included. This run finishes that.

Same constraint as before, and it shaped every line: **Android Chrome and Windows desktop must not
move.** Every behavioural change is a fallback that fires only after the current path has already
returned `null`, and every CSS change is scoped so that at ≥ 600px and on paper the declarations are
the ones that were there before. `tools/verify/s15_iphone_rest.js` makes 151 assertions to that
effect, including two declaration-level equality proofs against revisions resolved from git history.

---

## 0. One thing to know before reading further: the branch

The prompt says this work lives on `ui/forms-readability`. It does not. That branch is still at
`6b69f57`; every commit of the first iPhone run (`88d63b0`, `91aca4d`, `03c412b`, `5ff03e4`,
`9da22c6`) is on **`feat/assessment-center`**, interleaved with the assessment-center work described
in `IPHONE_RESULTS.md` §7. This run continued on `feat/assessment-center`, where the code it was
extending actually is. Nothing was rebased, amended or force-pushed, exactly as constraint 6 says.

The working tree was clean at Phase 0 apart from seven untracked `*.md` run prompts, which were left
alone. No merge was in progress. Every commit below used `git commit -F <msgfile> -- <explicit
paths>`.

---

## 1. What shipped

| Phase | Commit | What |
|---|---|---|
| 0 | — | State check. All six first-run commits present, tree clean, no concurrent staging. Nothing to commit. |
| 1 | `d88a2f7` | `UIC.printDoc` + the six built-document print sites through it. |
| 2 | `450022f` | The last two `?action=` tabs and `SESSION.openHistory` through `UIC.openTab`. |
| 3 | `6ba1c86` | `UIC.openDownload` + the 17 `?download=` links. |
| 4 | `8933e0a` | Shared `.card-table`; three pages adopt it, scope their CSS, add `data-label`. |
| 5 | `fd7dc8b` | `@media (hover: none) { body { cursor: pointer; } }` — one rule, its own commit. |
| 6 | this commit | `s15_iphone_rest.js`, registered in `run_all.js`; this document; the owner items. |

### Phase 1 — the print windows, and the one that carried real risk

Six places build a whole HTML document as a string and write it into a blank tab. All six
null-checked and raised a toast, so this was never a *silent* failure — it was a permanent one. On
iOS the tab is refused every time, so six print features did not exist on the platform.

`UIC.printDoc(html, title, opts)` sits next to `UIC.openTab`. Step 1 is the same
`window.open('', '_blank')` and the same `document.open()` / `write()` / `close()`, and it returns
there. Android and Windows stop at that return and nothing about them changes; `s15` section 2
proves the overlay is written *after* it and cannot be reached with a window in hand.

Two details are not in the prompt and matter:

- **The six callers do different things after writing.** `printTable` and `printFiltered` call
  `w.print()` immediately; `printMo` focuses and prints after 350 ms; `printStatement` waits 500 ms
  then focuses and prints; `openPrint` does not auto-print at all (its document carries its own
  طباعة button); `printForgetForm` does not either. Merging those into one policy would have
  changed five print behaviours at once, so `opts.then(w)` carries each caller's own code verbatim.
- **Attendance passes window features** (`'width=800,height=600'`). `opts.features` carries them,
  and the helper branches so that a caller *without* features gets the literal two-argument call —
  `window.open('', '_blank', '')` is not the same thing to every browser.

The fallback builds a full-screen overlay in the current document from the html's `<body>`, with a
طباعة button and an إغلاق button, and a print stylesheet that hides every other direct child of
body. `UIC._printDocClose` removes the overlay **and** the style element, and runs again before any
new overlay is built, so printing twice leaves nothing behind.

**What the overlay does not buy.** It is not a fix for printing on iOS. `window.print()` from inside
the Apps Script iframe may still hand AirPrint Google's wrapper page — that is follow-up A, still
device-gated. What the overlay guarantees is that the document becomes **readable on the phone at
all**, which today it is not. The code comment says exactly that.

### Phase 2 — the last two app-page tabs

`openDetail` and `openNewPage` on ValleyFoods أوامر التصنيع, and the `window.open` fallback beneath
`SESSION.openHistory`'s `UIC.HistorySide` branch. All three open an app page, so all three go
through the existing `UIC.openTab` rather than growing a new helper. The `HistorySide` branch is
untouched and still preferred. `record_history` is routed at `01_Registry.js:38` — confirmed, and
`s15` asserts it.

`Client_Helpers.html` loads ahead of `UI_Components.html` on some pages, so the call is guarded as
`window.UIC && UIC.openTab` and falls back to the original `window.open` if the helper is not there
yet.

### Phase 3 — the 17 file links

These are not app pages. `?download=…` returns a file or a viewer page, so `UIC.openTab` is the
wrong helper: its fallback navigates this frame, and navigating the app away to a download is worse
than the bug. `UIC.openDownload(url, label)` makes the same `window.open(url, '_blank')` and returns
on success; on `null` it opens the styled modal with a real
`<a href="…" target="_blank" rel="noopener">` for the same URL at a 44px tap target. A link the user
taps carries its own activation and is not subject to the automatic pop-up block, so the file costs
one extra tap instead of being unreachable.

It uses `UIC.openModal` and **not** `UIC.alert`. `UIC.alert` is built on `UIC.confirm`, which escapes
its message by design — the whole point of that escaping is that a record name cannot inject markup
— so an anchor cannot survive it. The prompt suggested either; only one of them works.

No URL expression changed. `s15` section 6 asserts the download type per site
(`attachment`, `budget_print`, `doc_file`, `print_file`, `print_barcode`, `payroll_report`,
`erp_invoice`) and that the count is exactly 17.

### Phase 4 — `.card-table`

Three on-screen tables had a page-local class and no phone tier at all, so they clipped on a phone
exactly as `.inv-table` used to — `html` and `body` both hide horizontal overflow, so the right-hand
columns were unreachable rather than merely awkward.

`.card-table` is the opt-in twin of `.inv-table`: the same three rule blocks (base card layout, the
≥ 600px restore, the `@media print` restore) now carry both selectors. No page-local class name
entered the shared stylesheet. Each page moved its own declarations verbatim into
`@media print, (min-width: 600px)` — the look is the page's, the layout is shared — and every `<td>`
it emits carries `data-label`, built from the same list its `<th>` row is built from.

`.card-table` is written **first** in each selector list. A selector list has no order-dependent
meaning in CSS, but `s14_iphone.js` asserts on the literal text of the `.inv-table` rules and s14 is
not in this run's file set, so it had to keep passing unchanged. Leading with `.card-table` leaves
the `.inv-table` half of every list reading exactly as it did. This is worth saying plainly rather
than leaving for someone to discover.

### Phase 5 — the row menu

One rule: `@media (hover: none) { body { cursor: pointer; } }`. No JavaScript moved, so no listener
can double-fire and no touch handler competes with the existing click one. `s15` section 11 compares
the outside-click listener against the revision before this run and asserts it is
character-for-character identical. Gated on `(hover: none)`, so a desktop mouse never sees a changed
cursor and a touch device has no visible cursor to change — which covers Android Chrome on a phone
too. This resolves follow-up C.

---

## 2. The Phase 4 equality proofs

`s15` section 8 recovers the revision of `UI_Components.html` before `.card-table` existed, and
section 9 recovers each page's revision before its table was scoped — in both cases by walking
`git log` for that file and taking the newest revision still in the old shape, the way s14 does.
Resolving the baseline from history rather than hardcoding `HEAD~N` is what keeps these checks
working as later commits land.

| What | declarations compared | unchanged | baseline |
|---|---|---|---|
| `UI_Components.html` shared `.inv-table` | 53 | 53 | `6ba1c86` |
| `Company_TopChemical_BoxAnalysis.html` `.items-table` | 11 | 11 | `38fc539` |
| `Company_TopChemical_BudgetIncome.html` `.inc-table` | 9 | 9 | `497c7fb` |
| `Company_ValleyFoods_MfgOrderView.html` `.odoo-table` | 12 | 12 | `d88a2f7` |

All 85 survive verbatim, and each page's are now inside a query covering both the desktop and paper.
`s14` is still green at 93/93 and was not edited — `s15` section 13 runs it and also asserts
`git status` reports it unmodified.

Both proofs were negative-tested. Changing one `.inv-table` declaration
(`border-bottom: 0` → `3px`) produced:

```
FAIL  all 53 shared .inv-table declarations survive verbatim (baseline 6ba1c86)
        .inv-table :where(td:last-child) { border-bottom: 0 }  ->  3px
```

and making the overlay reachable on the success path produced:

```
FAIL  the overlay is written AFTER that return — unreachable when a window comes back
FAIL  and the success branch itself never mentions the overlay
```

Both mutations were reverted.

---

## 3. Verification

Everything below is offline and reads the real source. None of it touches a spreadsheet, a Google
service or the network. Run after every phase.

| Check | Result |
|---|---|
| `node tools/verify/parse_pages.js` | every touched template parses |
| `node tools/verify/ui_smoke_pages.js` | 85 / 88 — the same 3 that already failed at Phase 0 |
| `node tools/verify/run_all.js` | **39 / 39**, including s14 and the new S15 |
| `node tools/ui_check.js` | 11 / 11, `design_preview/_sources.js` restored to HEAD before each commit |

`s15_iphone_rest.js` makes 151 assertions in fourteen sections: no blank-tab `window.open` outside
`UIC.printDoc`, the success path's call order and its return before any overlay, the overlay's print
stylesheet and that إغلاق removes both the overlay and its style element, all six print sites and
each one's preserved post-write behaviour, no `?action=` `window.open` left outside `UIC.openTab` and
`openSalesPage_`, all 17 download sites with their download type asserted per site, the fallback
anchor rather than a toast, `.card-table` in all three shared blocks with the `.inv-table` equality
proof, the three pages' own equality proofs and that no unscoped table rule is left, `data-label` on
every emitted `<td>`, the `(hover: none)` rule with the listener proven unchanged, no new user-agent
branch, and s14 green and unedited.

**What none of this proves** is that a card layout *looks* right on a 390px screen, or that a print
started from the overlay reaches the document rather than Google's wrapper page. There is no layout
engine here and no iPhone. That is what section 5 is for.

---

## 4. What was skipped, and why

**By decision, not by omission.**

- **D-7a — `window.print()` from inside the Apps Script iframe.** Follow-up A. `UIC.printDoc`
  improves *reachability*, not printing. Still device-gated.
- **D-7b — the `serveAttachment_` PDF preview and the `data:` download path** (`Code.js` ~L1036).
  Follow-up B. `UIC.openDownload` makes the *link* reachable; what the server sends is unchanged and
  still untested on iOS. `Code.js` was out of the file set.
- **D-7c — `touch-action: pan-y` on `body`.** Follow-up D, unchanged, for the same reason as last
  time: it would touch Android.
- **D-8 — `Record_History_Panel.html` L32 `goBack()`** calls `window.close()` then `history.back()`.
  It is a shared partial and the double-call is deliberate belt-and-braces. **Left exactly as it
  is**, so the next reader does not re-flag it.
- **The three `border-collapse` hits inside the print-document strings** (`StockRevision` 305,
  `Attendance` 562, `MfgOrderView` 307). Those are separate documents that never see the app's
  stylesheet and are meant to be tables on paper. Left alone, and `s15` section 10 explicitly
  excludes `printMo`'s document string when it checks for unlabelled cells.

---

## 5. The owner's iPhone checklist

Each is a pass/fail statement, not "check it looks right". Do all ten on the iPhone, then the
regression pass on Android and on Windows.

**On the iPhone**

1. **ValleyFoods → أوامر التصنيع → open a row.** A page opens — the order detail, in this tab or a
   new one. (Before this run: nothing happened at all.) Then **+ أمر جديد**: a page opens.
2. **Any list page → طباعة** (the toolbar table print). Either a new tab appears with the document,
   **or** a full-screen overlay covers the app showing the same document with طباعة and إغلاق at
   the top. One of the two must happen. Nothing happening is a fail.
3. **From that overlay, tap طباعة.** The AirPrint preview shows **the document**. — *If it shows
   Google's wrapper page instead, that is the known out-of-scope item; see follow-up A. Record which
   one you saw, because that answer is the gate for follow-up A.*
4. **From that overlay, tap إغلاق.** The overlay disappears and the list underneath is exactly as
   you left it. Then print again and close again: **still exactly one overlay**, and the page's own
   styling is unchanged after closing.
5. **ValleyFoods → الأطراف → كشف حساب → طباعة**, and **ValleyFoods → المشتريات → طباعة** on a
   purchase: same question as item 2 — document in a tab, or document in an overlay.
6. **ValleyFoods → الحضور → نموذج نسيان البصمة**, and **TopChemical → جرد المخزون → طباعة**: same
   question again.
7. **TopChemical → any attachment or تقرير link** (registration papers, budget inputs, carton
   sizes, an import document, a payroll report). Either the file opens in a new tab, **or** a dialog
   appears with a blue tappable link. **Tap that link: the file opens.** A dialog with a link that
   does nothing is a fail, and so is nothing appearing.
8. **Box analysis and Budget income, portrait.** Each table row is a **card**, and every value has
   its Arabic column label beside it — not a column of bare numbers, and nothing cut off at the left
   edge.
9. **Manufacturing order view, portrait.** Same: the work-operations, by-products and batch tables
   are labelled cards. Open **+ دفعة** — the batch dialog's table is labelled cards too.
10. **Open a row menu on any list, then tap empty page space.** The menu closes. (This is the item
    that failed before this run.)

**Then, on Android Chrome and on Windows — the regression pass**

Repeat all ten. Every one must look and behave exactly as it did before this run. Specifically:

- **Every print still opens a new tab.** Not an overlay. If you ever see the overlay on Android or
  Windows, something is wrong — it is only reachable when the browser refuses the tab.
- **Every download still opens a new tab.** No dialog with a link should ever appear.
- **Every table is still a table above 600px** — box analysis, budget income, the manufacturing
  order view and its batch dialog included. No cards, no visible labels.
- **A printed page is unchanged on paper.** Print the table print, a purchase document and a
  manufacturing order from Windows and compare against copies printed earlier if you have them.
- **The mouse cursor is unchanged** everywhere on Windows — it is still an arrow over empty page
  space, not a hand.
- The row menu still closes on a click on empty space, as it always did.

---

## 6. What this prompt got wrong

The prompt is not sacred, and six things in it did not survive contact with the source.

1. **The branch is wrong.** The prompt says `ui/forms-readability`. That branch is at `6b69f57` and
   has none of the first iPhone run on it; the work is on `feat/assessment-center`. §0 above.

2. **`UIC.alert` cannot render the link D-4 asks for.** D-4 says "use `UIC.alert` or the styled
   modal". `UIC.alert` delegates to `UIC.confirm`, which runs its message through `UIC.escHtml` —
   deliberately, so a record name cannot inject markup. An `<a href>` passed to it renders as
   literal text. Only the styled modal (`UIC.openModal`) works, and that is what shipped.

3. **`esc` is not available where D-2 and D-4 needed it.** `UI_Components.html` does have an `esc`,
   but it is a private function *inside* the `UIC.HistorySide` IIFE, not a module-level helper. The
   public one is `UIC.escHtml`.

4. **A literal `<style>` tag written in a COMMENT in `UI_Components.html` breaks every CSS check.**
   `tools/lib/sources.js` pairs the first opening tag it sees with the next closing one — which
   lives inside the `printTable` document string about 1200 lines below — so every check that reads
   the stylesheet got 58 kB of raw JavaScript instead. `ui2_breakpoints` and `ui4_listview` failed
   with 9 assertions between them, none of which pointed anywhere near the actual cause. This is a
   sibling of the known backtick trap and belongs beside it. The comment now carries a warning.

5. **`MfgOrderView` has four `.odoo-table` tables, not one.** D-5 lists it as a single table at
   line 31 (which is the CSS). The class is used at four render sites: the batch modal, the
   per-output batch footer, work operations and by-products. All four adopted `.card-table`.

6. **D-5's `<td>` counts do not describe the work.** It gives BoxAnalysis 35 `<td>` lines and
   implies they are the `.items-table`'s. Most of them belong to three *other* tables on that page
   that use the **shared `.table`** class — which has had a card-per-row phone tier since UI-4.8 but
   emitted no `data-label`, so those cards were a column of unlabelled values. Verification item 10
   says "every `<td>` those three pages emit", so they were labelled too (`MOVE_COLS`, `ALERT_COLS`,
   `CLUSTER_COLS`). No CSS changed for them. This was a real pre-existing defect on a phone that the
   prompt found by accident.

One smaller note: the file set calls Phase 3 "UI_Components + 16 pages". It is 14 pages carrying 17
call sites.
