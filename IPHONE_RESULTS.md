# iPhone compatibility — TopLight print, report and "opens in a new page" flows

Branch `ui/forms-readability`. Five commits, nothing pushed, nothing deployed. No schema was
touched, no row was created, edited or deleted, and no Google account was used.

The whole run was shaped by one constraint: **Android Chrome and Windows desktop must not move.**
Every behavioural change is a fallback that fires only after the current path has already failed,
and every CSS change is scoped below 600px. Neither platform enters a new code path, and neither
gets a different computed style. The offline check `tools/verify/s14_iphone.js` asserts exactly
that, and its section 5 is a declaration-level diff of every `.inv-table` rule against the revision
before Phase 2.

---

## 1. What shipped

| Phase | Commit | What |
|---|---|---|
| 0 | `6b69f57` | The two precedents committed as their own commit: the row menu and popup fallback on المبيعات, `closeReturns` on المرتجعات, and `s11_sales_returns.js`. |
| 1 | `88d63b0` | `UIC.openTab` + `UIC.closeOrBack`. Six `window.open` calls and seven inline إغلاق buttons routed through them. |
| 2 | `91aca4d` | Shared three-state `.inv-table`; `data-label` on every emitted cell; `.inv-totals` width `min()`. |
| 3 | `03c412b` | Costing print: a real narrow base, and a 44px tap target on the print button. |
| 4 | `5ff03e4` | `viewport-fit=cover` on the server viewport tag. One line, its own commit, revertable alone. |
| 5 | this commit | `s14_iphone.js`, registered in `run_all.js`; this document; the owner follow-ups. |

### Phase 0 — the precedents
The tree was dirty exactly as the prompt predicted. Four explicit paths were committed:
`Company_TopLight_Sales.html`, `Company_TopLight_Sales_Returns.html`, `design_preview/_sources.js`,
`tools/verify/s11_sales_returns.js`. The untracked `*.md` files were left alone.

### Phase 1 — the two fallbacks
Both live in `UI_Components.html` next to `UIC.navTo`, and both mirror a precedent that already
shipped. Neither looks at the user agent.

`UIC.openTab(url)` calls `window.open(url, '_blank')` — byte for byte what every caller did — and
returns as soon as it gets a window back. Only a `null` return, which is what iOS Safari's default
pop-up blocker and the Apps Script sandbox produce, reaches the `UIC.navTo` fallback. On Android and
Windows the tab opens, so the new branch is unreachable.

`UIC.closeOrBack(backUrl)` tries `window.top.close()` then `window.close()`, exactly as the inline
handlers did, and checks `window.closed` after the same 200ms the المرتجعات precedent waits.

**Six call sites, not five.** The prompt counted five `window.open` calls; there are six, because
`Company_TopLight_Products.html` has two (`openMovement` and `openPurchaseNeeds`). All six are
converted.

Seven إغلاق buttons now carry a real destination, each confirmed against
`Company_TopLight_Registry.js`:

| Page | goes back to |
|---|---|
| Sales_Print, Sales_Release | `tl_sales` |
| Purchase_Print | `tl_purchasing` |
| Sales_Offer_Print | `tl_sales_offer` |
| Customer_Statement | `tl_customers` |
| Product_Movement, Purchase_Needs | `tl_products` |

Per D-2, إغلاق changing from "does nothing" to "returns to the list" is an improvement on every
platform, not a regression: the button was dead everywhere, because `window.top.close()` is a
cross-origin call from inside the Apps Script iframe and throws.

### Phase 2 — the line-item table
`html` and `body` both set `overflow-x: hidden`, so on a phone the right-hand columns of an invoice
— الإجمالي, قيمة المرتجع, الرصيد — were not merely awkward to reach, they were unreachable.

`.inv-table` now has the same three states `.table` has had since UI-4.8:

- **base, below 600px** — each row is a card, `thead` is hidden, each cell prints its `data-label`.
- **tablet-p, 600px and up** — `display`, `width`, `align-items`, `justify-content` and `gap` return
  to their initial values. Layout only. No visual property is touched.
- **`@media print`** — the same restore, so a phone printing an invoice gets a table, exactly as a
  desktop does.

Two details make the tier and print restores exact rather than approximate. The card cell rules are
wrapped in `:where()`, so they carry no specificity and a page's own `.inv-table td` always wins.
And the print rules are written `table.inv-table`, because the shared print block sits *above* the
card rules in the file and would otherwise lose on source order at equal specificity.

The five pages keep their own declarations, moved verbatim into `@media print, (min-width: 600px)`.
They were **not** identical across the five files, so they were not merged: border widths differ
(1px on the two that use `--border-color`, 1px `#111111` on the other three), padding differs
(`8px 10px`, `8px 12px`, `5px 8px`), font size differs (13px vs 12px), and two pages set a `td`
background the others do not. Merging them would have moved a printed invoice.

`.inv-totals` went from a fixed `320px` / `300px` to `min(320px, 100%)` / `min(300px, 100%)` —
identical wherever the container has room, which is every desktop.

### Phase 3 — the costing print page
Its `@media (min-width: 600px)` block restated its own base values, so it was a no-op and the page
had no phone layout at all: a 390px screen got three columns of Arabic labels in the yellow meta
block. The base is now genuinely narrow and the tier block is untouched, so from 600px up every
computed value is what it was.

| | base was | base is | tier (unchanged) |
|---|---|---|---|
| `.meta-grid` columns | `repeat(3, 1fr)` | `1fr` | `repeat(3, 1fr)` |
| `.cards-grid` columns | `1fr 1fr` | `1fr` | `1fr 1fr` |
| `.acard.span2` | `span 2` | `auto` | `span 2` |
| `.cost-doc` padding | `30px` | `16px` | `30px` |

`.print-btn` gains `min-height: 44px`. It computes to roughly 40px today, so this only grows it.

### Phase 4 — the viewport
`viewport-fit=cover` has no effect on Windows and none on Android Chrome in a browser tab. On an
iPhone it is what makes `env(safe-area-inset-*)` resolve to anything but zero, which activates the
`--safe-*` tokens `CSS_Tokens.html` already defines and the home FAB, drawer and modal sheet already
read. It is its own commit so it can be reverted alone.

---

## 2. The Phase 2 equality proof

`s14_iphone.js` section 5 recovers each page's pre-Phase-2 revision by walking `git log` for that
file and taking the newest one whose stylesheet still declared `.inv-table` outside any media query.
It then parses every `.inv-table…` rule on both sides and compares property by property. Resolving
the baseline from history rather than hardcoding `HEAD~N` is what keeps this check working as later
commits land.

| Page | declarations compared | unchanged | baseline |
|---|---|---|---|
| `Company_TopLight_Sales_Print.html` | 9 | 9 | `88d63b0` |
| `Company_TopLight_Purchase_Print.html` | 9 | 9 | `88d63b0` |
| `Company_TopLight_Sales_Offer_Print.html` | 10 | 10 | `88d63b0` |
| `Company_TopLight_Customer_Statement.html` | 12 | 12 | `88d63b0` |
| `Company_TopLight_Sales_Release.html` | 12 | 12 | `88d63b0` |

All 52 survive verbatim, and every one of them now sits inside a query covering both the desktop and
paper. Nothing about the printed invoice moves.

---

## 3. Verification

Everything below is offline and reads the real source. None of it touches a spreadsheet, a Google
service or the network.

| Check | Result |
|---|---|
| `node tools/verify/parse_pages.js` | every touched template parses |
| `node tools/verify/ui_smoke_pages.js` | every page boots except the 3 that already failed at Phase 0 |
| `node tools/verify/run_all.js` | **38 / 38**, including the new S14 |
| `node tools/ui_check.js` | 11 / 11, C3 resolves 3671 namespaced references with 0 undefined |
| `node --check Code.js` | passes |

`s14_iphone.js` makes 93 assertions in ten sections: no bare `window.open` or inline
`window.close()` left, no user-agent branch anywhere, `.inv-table` defined once in three states, the
equality proof above, `data-label` on every emitted cell, the costing base values, exactly one
`addMetaTag('viewport', …)` carrying `viewport-fit=cover`, and `UIC` having gained two members
without losing any.

**What none of this proves** is that a card layout *looks* right on a 390px screen. There is no
layout engine here and no iPhone. That is what section 5 below is for.

---

## 4. The owner's iPhone checklist

Each is a pass/fail statement, not "check it looks right". Do the first nine on the iPhone, then the
same nine on Android and on Windows, where every one must behave exactly as it did before this run.

**On the iPhone**

1. **المبيعات → row menu → طباعة.** The AirPrint preview shows *the invoice*, not Google's wrapper
   page. — *If it shows the wrapper, that is the known out-of-scope item; see follow-up run A.*
2. **The same invoice, portrait.** الإجمالي and قيمة المرتجع are readable without scrolling
   sideways: each line item is a card, one label/value line per column.
3. **كشف حساب, portrait.** له, عليه and الرصيد are readable the same way. Then swipe the statement
   sideways: **nothing pans**, because there is nothing left to pan to.
4. **العملاء → كشف حساب.** A page opens. Then **المنتجات → حركة المنتج**: a page opens. Then
   **المشتريات → طباعة**: a page opens. (Before this run a blocked pop-up meant nothing happened.)
5. **On any print page, tap إغلاق.** Within about a second you are back on the list that page was
   opened from — المبيعات, المشتريات, عروض الأسعار, العملاء or المنتجات as appropriate.
6. **Costing print, portrait.** The yellow meta block is **one column**, and the four summary cards
   are one per row.
7. **Landscape.** Content reaches the edges, and the home button (bottom-left) sits clear of the
   home indicator rather than under it.
8. **Open a row menu, then tap empty page space.** The menu closes. — *If it stays open, that is a
   known out-of-scope item; see follow-up run C.*
9. **Any invoice, tap طباعة on the page itself.** Same question as item 1.

**Then, on Android Chrome and on Windows — the regression pass**

Repeat all nine. Every one must look and behave exactly as it did before this run. Specifically:

- Every "opens in a new page" action still opens **a new tab**, not this one.
- Every print page still shows a **table**, not cards, at every window size above 600px.
- A printed invoice is **byte-identical** on paper to one printed before this run. Print one of each
  page from Windows and compare against a copy printed earlier if you have one.
- The one deliberate change: **إغلاق now works.** It used to do nothing on every platform; it now
  returns you to the list. That is D-2, and it is intended.

---

## 5. What was skipped, and why

**By decision, not by omission.**

- **D-6 — `touch-action: pan-y` on `body` stays.** The CSS spec walks `touch-action` only as far as
  the nearest scroll container, so a nested `overflow-x: auto` box should still pan. Changing `body`
  would touch Android, which is exactly what this run is not allowed to do. Checklist item 3 is the
  test; if it fails, that is a follow-up run.
- **D-7a — printing from inside the Apps Script iframe.** `window.print()` may print Google's
  wrapper page rather than the invoice on iOS. This cannot be fixed in CSS. Checklist items 1 and 9.
- **D-7b — attachment download and PDF preview on iOS.** `<a download href="data:…">` and
  `<iframe src="data:application/pdf…">` in `Code.js`. Changing either touches the working
  Windows/Android flow.
- **D-7c — the row-menu outside-click listener on iOS.** A `document` click listener in
  `UI_Components.html`; iOS does not always deliver a click for a tap on a non-interactive element.
  Checklist item 8.

All four are written up in `NEXT_STEPS_OWNER.md` as follow-up runs, each gated on the corresponding
device test above.

---

## 6. What this prompt got wrong

The prompt is not sacred, and four things in it did not survive contact with the source.

1. **"the 5 bare `window.open` calls" — there are six.** `Company_TopLight_Products.html` has two
   (`openMovement` and `openPurchaseNeeds`). All six are converted; the count in the phase table was
   one short.

2. **"delete the 5 local copies after proving equality" — the copies must NOT be deleted.** The
   prompt anticipated this in D-4's second half, and that is the branch that applies: the five
   blocks are *not* identical, so none was deleted. Border width, padding, font size and `td`
   background all differ between pages. What moved into `UI_Components.html` is the layout, which is
   genuinely shared; what stayed is the look, which is not. The shared rule therefore does **not**
   contain the pages' declarations, and s14 proves the pages still do.

3. **A backtick in a CSS comment breaks `UI_Components.html`.** Its stylesheet lives inside a
   JavaScript template literal, so the first draft of the `.inv-table` comment — which quoted
   ``` `@media print, (min-width: 600px)` ``` in the ordinary way — was a syntax error that blanked
   every page. `parse_pages.js` caught it immediately, and `ui_check` C11 exists for exactly this.
   Worth adding to the prompt's "trap previous sessions hit" section.

4. **`tools/ui_check.js` rewrites `design_preview/_sources.js` as a side effect.** Its C9 check
   calls `require('./build_preview')`, which regenerates the bundle. So merely *running the checker*
   dirties a tracked file that constraint 7 says not to rebuild. It was restored to HEAD after each
   run and is not in any commit of this run. Harmless, but surprising, and worth knowing before
   someone commits it by accident.

---

## 7. One thing that went wrong, and is worth knowing

**Another agent session was working in this same repository, on this same branch, throughout this
run.** It committed an unrelated merge (`859f68f`) and then a series of assessment-center commits
interleaved with mine.

The consequence: **commit `91aca4d` (Phase 2) contains three files that are not mine** — `Code.js`
(26 lines of assessment-center routing), `Company_Assessment_Dashboard.html` and
`Company_Assessment_Nav.html`. They were already staged in the index by the other session when I
committed. `git add` with explicit paths adds to the index; `git commit` then commits *the whole
index*, so staging explicitly is not by itself enough protection when something else is staging
concurrently.

Nothing was lost and nothing is broken — that work belongs on this branch and was going to be
committed anyway. But the Phase 2 commit is not the clean, revert-in-isolation change it was meant
to be. **History was deliberately not rewritten**, because another session was actively committing
to the same branch and a rebase would have clobbered its work.

If you want Phase 2 isolated, the safe move is to do it later, when nothing else is running, with
`git rebase -i 88d63b0`. The other four commits (`6b69f57`, `88d63b0`, `03c412b`, `5ff03e4`) are
clean and each contains only its own files.

For future runs in this repo: `git commit -- <paths>` commits only those paths regardless of what
else is staged, and is the form to use whenever concurrent work is possible.
