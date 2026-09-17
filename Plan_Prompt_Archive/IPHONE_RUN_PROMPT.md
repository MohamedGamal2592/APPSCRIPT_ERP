# RUN PROMPT — iPhone compatibility for TopLight print/report pages

Make the TopLight print, report and "opens in a new page" flows work on iPhone Safari, **without
changing a single pixel or behaviour on Android Chrome or Windows desktop, where they already work.**
That second clause is the whole point of this run and is enforced in §Non-regression below.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods) plus an `ERP_Information` auth
spreadsheet. Arabic RTL interface. Repo root `d:\Work\Script`, remote `origin`
(`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`). Branch: `ui/forms-readability`.

This run writes **code only**. It creates no rows, edits no rows, deletes no rows.

---

## 🔁 Autonomy — read this first

**Do not stop between phases. Do not ask "shall I continue?". Do not ask me to approve a phase, a
diff, a commit or a decision.** Work straight through Phase 0 → 5 and report once at the end.

Every open decision is **already answered in §Decisions**. If you want to ask a question:

1. **§Decisions covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the results doc, continue.
3. **Genuinely blocked** (needs a real iPhone, needs my Google account, needs a live sheet) → write it
   on the owner checklist, **continue with everything else**.
4. **A whole phase is unworkable** → say so plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess, and **far** better than a stopped run.

Commit after each phase **without asking**. Do not push.

---

## Read these first, in full, before touching anything

1. **`Company_TopLight_Sales.html`** — `openSalesPage_` (~L447-459). This is the popup fallback
   precedent. Its comment explains why: `window.open` returns `null` when iOS Safari's default
   pop-up blocker (or the Apps Script iframe) refuses the tab.
2. **`Company_TopLight_Sales_Returns.html`** — `closeReturns` (~L181-200). This is the close-button
   precedent. Its comment explains why `window.top.close()` / `window.close()` are dead from inside
   the Apps Script iframe on **every** platform.
3. **`UI_Components.html`** — `UIC.navTo` (~L361), `.table-wrap` (~L3377), the base phone card
   layout for `.table` (~L4200-4250), the tablet-p tier that restores table layout (~L4251), and the
   shared `@media print` block (~L3442-3505) — note how it forces `.table` back to table layout on
   paper. Your `.inv-table` rules must follow the same three-state shape.
4. **`CSS_Tokens.html`** — `html`/`body` both set `overflow-x: hidden` (~L280, ~L301) and body sets
   `touch-action: pan-y` (~L304). You are **not** changing these — see §Decisions D-6.
5. **`Company_TopLight_Sales_Costing_Print.html`** ~L20-79 — the only invoice page that wrapped its
   table in `overflow-x:auto`, and also the page whose `@media (min-width: 600px)` block is a no-op.
6. **`Code.js`** ~L118 — the server-side `addMetaTag('viewport', …)` appended to every page.
7. **`tools/verify/run_all.js`** and one existing `s*` script (e.g. `s11_sales_returns.js`) — the
   offline suite you will extend with `s14_iphone.js`.

**Verify every `file:line` before you edit it.** Line numbers here were taken at `9f77761` with a
dirty tree and drift with every commit — confirm each yourself.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema
No column added, renamed, removed, reordered or retyped, in any company spreadsheet or in
`ERP_Information`. No new sheet, no new tab. This run is CSS, client JS, and one server-side meta tag.

## 2. NEVER add, edit, or delete data in any business table
No writing rows, not by hand, not by script, not via `clasp run`, not via a one-off function.

## 3. NEVER deploy
Never run `clasp push` against the production script id in `.clasp.json`. Never create a deployment.

## 4. NEVER touch the owner's Google account
No OAuth flows, no `clasp login`, no browser automation against Google.

## 5. NEVER break a public contract
`UIC`, `API`, `FMT`, `UI`, `ERPModal`, `ERPFlow`, `SESSION` — you may **add** members (this run adds
two: `UIC.openTab`, `UIC.closeOrBack`). You may not rename, remove, or change the signature of any
existing member. `tools/verify/run_all.js` check C3 will tell you if you did.

## 6. Stay inside your file set
```
UI_Components.html                          (Phase 1 helpers, Phase 2 shared .inv-table rules)
Company_TopLight_Customers.html             (Phase 1)
Company_TopLight_Products.html              (Phase 1)
Company_TopLight_Purchasing.html            (Phase 1)
Company_TopLight_Sales_Offer.html           (Phase 1)
Company_TopLight_Sales_Costing_Analysis.html (Phase 1)
Company_TopLight_Sales_Print.html           (Phase 1 + 2)
Company_TopLight_Purchase_Print.html        (Phase 1 + 2)
Company_TopLight_Sales_Offer_Print.html     (Phase 1 + 2)
Company_TopLight_Customer_Statement.html    (Phase 1 + 2)
Company_TopLight_Sales_Release.html         (Phase 1 + 2)
Company_TopLight_Product_Movement.html      (Phase 1)
Company_TopLight_Purchase_Needs.html        (Phase 1)
Company_TopLight_Sales_Costing_Print.html   (Phase 3)
Code.js                                     (Phase 4 — the ONE viewport line, nothing else)
tools/verify/s14_iphone.js                  (new)
tools/verify/run_all.js                     (register s14)
IPHONE_RESULTS.md                           (new)
NEXT_STEPS_OWNER.md                         (append items only)
```
Nothing in TopChemical or ValleyFoods. Nothing in `CSS_Tokens.html`. Nothing in `Client_Helpers.html`.
Do **not** edit `Company_TopLight_Sales.html` or `Company_TopLight_Sales_Returns.html` beyond Phase 0
— they are the precedents and they already work.

## 7. Do not rebuild the design preview
`design_preview/` is regenerated by `tools/build_preview.js`; do not run it and do not hand-edit it.

---

# ✋ NON-REGRESSION — the rule that shapes every edit in this run

Android Chrome and Windows desktop are **working and liked**. The owner's exact words: these changes
must "not affect the already nice working android and windows ways." So:

**R-1. Every behavioural change is a fallback that only fires when the current path has already
failed.** The popup helper opens a tab exactly as today and only navigates in-place when
`window.open` returned `null`. The close helper tries to close exactly as today and only navigates
when the window is provably still open 200ms later. If the current path succeeds, the code path is
byte-for-byte what runs today.

**R-2. Every CSS change is scoped so that at ≥ 600px the computed style is identical to today.**
Mobile-first: the phone rule is the base, and the `@media (min-width: 600px)` tier restores the
*current* declarations verbatim. Before deleting any page-local `.inv-table` block, copy it — the
tablet-p tier of the shared rule must contain those exact declarations. Prove it in `s14` (see
§Verification) by diffing the declarations against `git show HEAD:<file>`.

**R-3. Print output is unchanged on every platform.** The shared `@media print` block already forces
`.table` back to table layout on paper; do the same for `.inv-table` so a phone printing an invoice
gets a table, not a stack of cards. Desktop print already gets a table and must keep getting the
same one.

**R-4. No global platform sniffing.** No `if (isIOS)` branches. Nothing keyed on the user agent.
The fixes are feature-detected (`window.open` result, `window.closed`) or width-based, so Android and
Windows simply never enter the new branches.

**R-5. If you cannot make a change satisfy R-1…R-4, do not make it.** Write it on the owner
checklist as "needs a device to decide" instead. This is the reason D-6 and D-7 below are *out* of
scope.

---

## Starting state — handle Phase 0 before anything else

At the time this prompt was written the tree at `9f77761` was **dirty**:

```
 M Company_TopLight_Sales.html          ← the popup-fallback precedent (uncommitted!)
 M Company_TopLight_Sales_Returns.html  ← the closeReturns precedent (uncommitted!)
 M design_preview/_sources.js
?? tools/verify/s11_sales_returns.js
?? BOX_ANALYSIS_RUN_PROMPT.md, Box_analysis_prompt.md, VALLEYFOODS_RUN_PROMPT.md,
   VALLEY_WAREHOUSE_MOVEMENT_PLAN.md, WAREHOUSE_MOVEMENT_RUN_PROMPT.md   ← NOT yours, leave them
```

Run `git status` first. If those first four are still uncommitted, **Phase 0 commits them** as
their own commit (`feat(s11): row menu + popup fallback on المبيعات, closeReturns on المرتجعات`)
staging **only** those four explicit paths, so your later diffs are clean and the precedents you
point at are in history. If the tree is already clean, Phase 0 is a no-op — say so and move on.
Never stage the untracked `*.md` files; never `git add -A`.

Git will warn "LF will be replaced by CRLF" on these files. That is expected; ignore it.

---

## Decisions — already made, do not re-ask

**D-1. Two shared helpers, in `UI_Components.html`, next to `UIC.navTo`:**

```js
/* Opens url in a new tab. When the tab is refused (iOS Safari blocks pop-ups
   by default; the Apps Script sandbox can too) window.open returns null and
   the action would otherwise end silently — so fall back to navigating in
   place. The tab path is byte-for-byte what every caller did before. */
UIC.openTab = function (url) { … mirrors openSalesPage_ in Sales.html … };

/* For a page reached either as a tab or in place. Tries to close exactly as
   before; if the window is still here 200ms later, goes to backUrl instead of
   leaving a dead button. Mirrors closeReturns in Sales_Returns.html. */
UIC.closeOrBack = function (backUrl) { … };
```
Behaviour must match the two precedents exactly, including the 200ms and the `window.closed` check.
Leave the precedents themselves alone (constraint 6) — do not refactor them to call the helpers.

**D-2. On desktop, إغلاق changing from "does nothing" to "navigates this tab back to the list" is
not a regression.** The button is dead today on every platform (see the closeReturns comment). A
tab that turns into the list page is strictly better than a dead button. This is the one place R-1's
"current path" is *already failing* everywhere, so the fallback firing on desktop is intended.

**D-3. `backUrl` per page** — the list the page was opened from:

| Page | `?action=` to go back to |
|---|---|
| Sales_Print, Sales_Release | `tl_sales` |
| Purchase_Print | `tl_purchasing` |
| Sales_Offer_Print | `tl_sales_offer` |
| Customer_Statement | `tl_customers` |
| Product_Movement, Purchase_Needs | `tl_products` |

Confirm each action name against `Company_TopLight_Registry.js` before using it.

**D-4. `.inv-table` becomes a shared class in `UI_Components.html`**, defined once, in the same
three-state shape as `.table`: base = phone cards (each `td` shows its `data-label`), tablet-p tier
restores today's table declarations verbatim, print forces table layout. The five pages keep the
class name; their local `.inv-table` / `.inv-table th, td` / `.inv-table th` blocks are deleted **only
after** you have confirmed they are identical across the five files. If any page's block differs
(check `.invoice` border widths too — Sales_Print uses 1px, Offer_Print and Release use 2px), keep
that page's differing declarations as a page-local override so its desktop rendering does not move.
The `.invoice` block itself stays page-local; only `.inv-table*` and `.inv-totals` move.

**D-5. `data-label` on every `<td>` the five pages emit** — the card layout has nothing to show
without it. Take the label text from the matching `<th>`. At ≥ 600px `td[data-label]::before` is
`content: none`, exactly as the shared `.table` tier does, so this attribute is invisible on desktop.

**D-6. `touch-action: pan-y` on `body` stays.** The CSS spec walks touch-action only up to the
nearest scroll container, so a nested `overflow-x:auto` box *should* still pan horizontally — and
changing body would touch Android. Do not change it. Put "swipe the customer statement sideways"
on the owner's device checklist; if it fails there, that is a follow-up run, not this one.

**D-7. Out of scope — write these on the checklist / NEXT_STEPS, do not code them:**
- `window.print()` from inside the Apps Script iframe possibly printing Google's wrapper page on
  iOS. Cannot be fixed in CSS; needs a device test, then a decision about serving invoices outside
  the iframe or as PDF. Owner test #1 in §Checklist.
- Attachment download (`<a download href="data:…">`, `Code.js` ~L1010/L1030) and PDF preview
  (`<iframe src="data:application/pdf…">`, ~L1004) on iOS. Changing these touches the Windows/Android
  flow; follow-up run.
- Row-menu outside-click on iOS (`document` click listener, `UI_Components.html` ~L303). Owner test.

**D-8. `viewport-fit=cover` (Phase 4) is its own commit**, last, so it can be reverted alone. It has
no effect on Windows and no effect on Android Chrome in a browser tab. On iPhone it activates the
`env(safe-area-inset-*)` rules that already exist (`--safe-*` tokens in `CSS_Tokens.html` ~L115, used
at `UI_Components.html` ~L512, ~L3726, ~L3740, ~L3775, ~L4116). Do it at the server only
(`Code.js` ~L118): change the string to `'width=device-width, initial-scale=1, viewport-fit=cover'`.
Do not touch the per-file `<meta name="viewport">` tags.

**D-9. `.inv-totals { width: 320px }` → `width: min(320px, 100%)`** (and `min(300px, 100%)` where
the page used 300). Identical whenever the container is wider than the value, i.e. on every desktop.

**D-10. Costing_Print (Phase 3):** base becomes `.meta-grid { grid-template-columns: 1fr }`,
`.cards-grid { grid-template-columns: 1fr }`, `.acard.span2 { grid-column: auto }`,
`.cost-doc { padding: 16px }`; the existing `@media (min-width: 600px)` block already carries the
current desktop values (3 cols / 2 cols / span 2 / 30px) — leave it exactly as is. Also
`.print-btn { min-height: 44px }` — additive, the button is ~40px today and only grows.

---

## Your task — six phases, in order, one commit each

| Phase | What | Files |
|---|---|---|
| **0** | Commit the pending s11 precedents if still dirty (see §Starting state). | Sales, Sales_Returns, `_sources.js`, `s11` |
| **1** | Add `UIC.openTab` + `UIC.closeOrBack`. Route the 5 bare `window.open` calls through `openTab`. Replace the 7 inline `onclick="try{window.top.close()}…"` buttons with `closeOrBack(<backUrl>)`. | UI_Components + 12 TopLight pages |
| **2** | Shared `.inv-table` (three-state) + `.inv-totals` min(); `data-label` on the tds; delete the 5 local copies after proving equality. | UI_Components + 5 print pages |
| **3** | Costing_Print: real narrow base per D-10; `.print-btn` min-height. | Costing_Print |
| **4** | `viewport-fit=cover` at the server meta tag. One line. | Code.js |
| **5** | `s14_iphone.js`, register in `run_all.js`, write `IPHONE_RESULTS.md`, append owner items to `NEXT_STEPS_OWNER.md`. | tools/verify, docs |

### The phase that carries real risk — Phase 2
It touches markup that prints invoices customers receive. The equality proof in `s14` is not
optional. If for any page you cannot show the ≥ 600px and print declarations are unchanged, keep
that page's local block and note it — a page that still works on desktop and is still clipped on
iPhone is acceptable; a page whose printed invoice moved by a pixel is not.

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

There is no `node_modules`, no `package.json`, no layout engine. Prove what you can statically; put
the rest on the owner's checklist.

**After every phase, all four:**
```bash
node --check Code.js                    # phase 4 only, plus any .js you touched
node tools/verify/parse_pages.js
node tools/verify/ui_smoke_pages.js     # catches a blank page; parse_pages does not
node tools/verify/run_all.js            # full suite, green, including your s14
```
**A red suite is a stop-and-fix, not a stop-and-ask.**

**`s14_iphone.js` must assert, statically:**
1. No `window.open(` remains in any `Company_TopLight_*.html` except inside `openSalesPage_`
   (Sales.html) and `UIC.openTab` itself.
2. No inline `window.close()` / `window.top.close()` remains in any `Company_TopLight_*.html`
   except inside `closeReturns` (Sales_Returns.html) and `UIC.closeOrBack` itself.
3. `.inv-table` is defined in exactly one file (`UI_Components.html`), in three states: a base rule,
   a `(min-width: 600px)` rule, and a rule inside `@media print`.
4. **Equality proof:** for each of the five pages, parse the `.inv-table*` declarations from
   `git show HEAD~N:<file>` (the commit before Phase 2) and assert the shared tablet-p rule contains
   each declaration with the same value. Print the diff if not.
5. Every `<td>` string the five pages emit inside their `.inv-table` carries `data-label=`.
6. In Costing_Print the base `.meta-grid` / `.cards-grid` values differ from the ones inside
   `@media (min-width: 600px)` (i.e. the block is no longer a no-op).
7. `Code.js` emits exactly one `addMetaTag('viewport', …)` and it contains `viewport-fit=cover`.
8. `UIC.openTab` and `UIC.closeOrBack` exist and C3 (public contracts) is still green.
9. Every `backUrl` action used by `closeOrBack` calls exists in `Company_TopLight_Registry.js`.

---

## A trap previous sessions hit repeatedly

The Bash tool mangles backslashes inside heredocs and breaks on Arabic literals. For any file content
with Arabic text, CSS selectors or nested quoting: use the `Write`/`Edit` tools, or write a Python
transform to a file with `Write` and run it. **Do not fight the heredoc.** The `data-label` values in
Phase 2 are Arabic column headers — a mangled one produces a card label that is wrong and looks right.

---

## Commit protocol

```
<type>(iphone-<phase>): <short summary>

<what changed, file by file>
<what was verified, and how — include the s14 equality-proof output for phase 2>
<what was skipped and why>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```
Stage explicit paths only. **Do not push.** The owner pushes.

---

## Report once, at the end

Write `IPHONE_RESULTS.md`, then give me a single summary containing:

1. What shipped, phase by phase, with the commit hash for each.
2. What was skipped or blocked, and why — including D-6/D-7 by design.
3. The Phase 2 equality-proof output, per page.
4. **The owner's iPhone checklist**, as specific pass/fail statements — never "check it looks right":
   - Sales list → row menu → طباعة: does AirPrint preview show the invoice, or Google's page?
   - Same invoice, portrait: are الإجمالي and قيمة المرتجع readable without sideways scrolling?
   - Customer statement, portrait: are له / عليه / الرصيد readable? Swipe sideways — does anything pan?
   - Customers → كشف حساب, Products → حركة المنتج, Purchasing → طباعة: does a page open at all?
   - On any print page, إغلاق: does it return to the list within a second?
   - Costing print, portrait: is the yellow meta block one column?
   - Landscape: is content edge-to-edge (Phase 4) with the home FAB clear of the home indicator?
   - Open a row menu, tap empty page space: does it close?
   - **Android + Windows regression pass:** the same nine actions — every one must look and behave
     exactly as before this run.
5. Anything you found that this prompt got wrong. **Say so plainly; the prompt is not sacred.**

Append to `NEXT_STEPS_OWNER.md` (append only): the D-7 items as three recommended follow-up runs,
each gated on the corresponding device-test result above.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema, add/edit/delete any data, deploy, push, or touch the owner's
   Google account.
2. Every change is a **fallback** (R-1) or **scoped below 600px** (R-2) — Android and Windows never
   enter a new code path and never get a different computed style.
3. Phase 0 commits the two precedents **before** you build on them, staging four explicit paths only.
4. Phase 2 is not done until `s14`'s equality proof is green for all five pages.
5. `touch-action`, iframe printing, attachments and the outside-click listener are **out of scope**
   and go on the checklist, not in the code.
