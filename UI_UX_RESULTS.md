# UI/UX Programme — Results

**Branch:** `ui/odoo-parity`, cut from `0f71e3d` on `feat/vf-purchasing-ux`.
**Commits:** 36, `e324cfc` … `88deb97`. **Nothing is pushed.** You push.
**Date:** 2026-09-06.

---

## Read this part first

### 1. Nobody has seen any of this rendered

This programme changed the visual design of a production ERP without a browser.
Every check in it is static: files parse, symbols resolve, markup contains what
it should, arithmetic is correct. **Not one pixel has been looked at.**

`design_preview/index.html` exists so that you can look at it before you push.
It is the single most valuable thing in this branch. Open it first, not last.

### 2. The largest visual change is not in Phase 2

Step **1.1** is one line — `document.documentElement.setAttribute('dir','rtl')`
— and it flips **TopChemical 31 of 32 pages** and **TopLight 19 of 20** from
left-to-right to right-to-left. That includes **table column order**: the first
column moves from the left edge to the right edge.

That is correct for Arabic and it is what finding U-02 asks for. It is also a
bigger change than the colour work, and on the eight print/document pages
(`Sales_Print`, `Purchase_Print`, `Sales_Offer_Print`, `Sales_Costing_Print`,
`Customer_Statement`, `Sales_Offer`, `Sales_Release`, `Barcode`) it re-orders
layouts that were tuned while they rendered LTR.

It is commit `8770fad`, alone, so `git revert 8770fad` undoes exactly that and
nothing else.

### 3. What I would check hardest

- **TopChemical, any list page.** It changed direction, canvas, borders, table
  header colour and font all at once.
- **Any two-page printed invoice.** Print was substantially rewritten (Phase 7)
  and print is where a mistake is least recoverable.
- **Dark mode.** Phase 8 is the one thing in this branch whose output nobody has
  seen in any form, not even indirectly.

### 4. Two defects were found that were not in the investigation

Both by `ui_check` check C3 during the Phase 0 baseline, before any code changed:

- **N-01 — `UI.toast` was defined nowhere.**
  `Company_ValleyFoods_MfgOrderView.html` called it **40 times**, every call
  guarded as `UI.toast && UI.toast(…)`. Nothing ever threw, and **every success
  and error message on the manufacturing order page was silently discarded.**
  A user saving a manufacturing order got no confirmation and no error text.
- **N-02 — `UI.alert` was defined nowhere.**
  `DbLive_Viewer.html` called it **9 times, unguarded**, all on error paths — so
  the page threw `TypeError: UI.alert is not a function` at exactly the moment
  it was trying to report a problem.

Both are fixed additively in `035850a` and `d5c9c80`.

### 5. Where I made a mistake

In commit `f1c4a5d` I staged `tools/verify/run_all.js` wholesale and swept in a
line the **concurrent performance programme** had added, referencing
`s11_sales_returns.js` — a file still untracked in their working tree. The
committed runner therefore pointed at a file git does not have.

Rewriting history mid-run would have been worse than the problem and deleting
their line would fight them when they commit, so `8e7d765` makes the runner skip
a step whose file is absent, with a message. From that point on `run_all.js` was
staged only after reading its diff. It is recorded here because it is the kind
of thing that is invisible until someone clones the branch.

---

## Phase 2B was not redone

`VALLEYFOODS_RESULTS.md` was present at the start of this run, so Phase 2B and
step 2.9 were **verified, not repeated**, exactly as instructed.

All 13 of its commits are in this branch's ancestry (`4ed800e`, `9deb108`,
`2804a3a`, `39b74ab`, `52a6562`, `84eb0ae`, `2e8d711`, `2501b07`, `e6201d5`,
`427a08e`, `77f2362`, `0b61c44`, `a0d11ce`) and all 12 of its checks pass — and
still pass now, after this programme touched 16 of its ValleyFoods pages.

---

## What changed, by phase

| Phase | Commit(s) | What landed |
|---|---|---|
| **0** Guardrails | `e324cfc` | `design_preview/` (6 tiers × 3 themes × RTL/LTR), `tools/ui_check.js` (11 checks), `tools/build_preview.js`, `UI_BASELINE.md`. No live file touched. |
| **1.1** U-02 | `8770fad` | `dir="rtl"` guaranteed on every page. See the warning above. |
| **1.2** U-01 | `4a10e62` | Row menus and combo lists escape `.table-wrap`'s clip box. |
| **1.3** U-03 | `f2ee543` | Tri-state sort, preserved load order, chevron, `aria-sort`, `sortable:false`. |
| **1.4** U-04 | `5c9ca9f` | `.num` moved to the shared stylesheet; ValleyFoods numbers finally align. |
| **1.5** U-05 | `0e80080` | Sticky table header **and the scroll range without which it is a no-op**. |
| **2.1** | `28a92a4` | The neutral token layer. `--text-disabled` was a WCAG failure at 2.5:1. |
| **2.2** D-3 | `49ded8d` | Cairo unified; ValleyFoods stops falling back to Tahoma. |
| **2.3** U-06 | `32fc638` | 53 declarations onto the type and spacing scales. |
| **2.4–2.6** D-1/D-2 | `ba07511`, `d10b63d`, `6aa8876` | The coloured canvas retired in all three companies; ValleyFoods gets the brand topbar it never had. |
| **2.9b** U-48 | `bdc5bde` | Five breakpoint tiers, mobile-first. Off-scale width queries 11 → 0. |
| **2.7** U-07 | `af71396`, `497c7fb`, `57c2e37`, `f2215ae` | 196 colour literals tokenised, one company per commit. |
| — | `d0eb034` | Fixed a misleading metric (see "honest numbers" below). |
| **2.8** U-36/D-4 | `f1c4a5d` | Consolidated the ONE helper that is provably identical; left and listed the rest. |
| **3.1/3.2** U-09 | `34d8c0b` | 47-icon inline set; 11 emoji/entity call sites converted. |
| **3.3** U-20 | `8e7d765` | Row actions become a quiet kebab. Payload per 50-row page 101 KB → 54 KB. |
| **3.4** U-24 | `035850a` | Four loading overlays become one. **N-01 and N-02 fixed.** |
| **3.5/3.6/3.7** | `2e44cc6` | Empty states, bottom-sheet swipe, the RTL follow-ups. |
| **3.8** U-42 ⭐ | `90adbc8` | **The persistent home button, on every page.** |
| **4.1** U-13 | `9ede7e7` | The control panel — opt-in, proven not to alter unconverted pages. |
| **4.5/4.6/4.8** | `6a69597` | Optional columns, multi-select (read-only), phone card view. |
| **4.4/4.7** | `e216769` | Group-by with subtotals, column footer, skeleton loads. |
| **4.9** U-16 | `98dfef3` | Saved views surfaced as a Favourites menu. |
| **4.3** U-13 | `48234ea` | Field-targeted search, with a guard proven not to change plain search. |
| **5.1/5.2/5.3** | `d5c9c80` | Dirty guard, styled confirm, validation. The safety items. |
| **5.4/5.5/5.6** | `5b86806` | Statusbar, smart buttons, notebook tabs. |
| **6** U-31/U-33 | `1e611ff` | Focus trap, combobox ARIA, `scope="col"`, skip link, Alt+S / Alt+N. |
| **7.1/7.2** U-34 | `9b55101` | Real print rules; the toner-burning blanket print rule removed. |
| **8** U-12/U-41 | `741b418` | Dark mode, density, preferences. |
| **9.1/9.2/9.3** U-37 | `80f91ec` | A real ValleyFoods dashboard; theme-aware, lazily-loaded charts. |
| **10.1/10.2** U-35 | `88deb97` | 42 KB of dead code harvested then deleted; the stale `Code.js` comment fixed. |

---

## The visual checklist — walk this after your first push

This is the only real verification this programme will ever get.

**Check every item at 390, 768, 1024, 1440 and 2560 px**, and the two tablet
widths in **both orientations**. In Chrome: F12 → the device-toolbar icon → set
the width. Or open `design_preview/index.html`, which shows all six at once.

### A. Before you push — in the preview harness

Open `design_preview/index.html` by double-clicking it.

1. The header shows a `sources …` fingerprint. If it says **missing**, run
   `node tools/build_preview.js`.
2. Switch **الشركة** through TopLight → TopChemical → ValleyFoods:
   - [ ] The page background is the **same light grey-white** in all three. No
         amber. No green.
   - [ ] TopLight's topbar is **black with amber text**. Buttons stay black with
         amber text.
   - [ ] TopChemical's topbar is **green with white text**.
   - [ ] ValleyFoods **has a green topbar at all** — it had none before.
   - [ ] Card, table and modal borders are **thin grey hairlines**. No 2px black
         or green frames anywhere.
   - [ ] Arabic text is Cairo in all three, ValleyFoods included.
   - [ ] Table header text is noticeably **darker and easier to read**.
3. Switch **الاتجاه** to LTR and back. Nothing should be visually broken in
   either, but RTL is the one that matters.
4. In the **390** frame:
   - [ ] The data table is a **stack of cards**, each line labelled — not a
         sideways scroll box.
   - [ ] The hamburger is visible; the topbar nav is not.
   - [ ] Open a modal: it is a **bottom sheet with a grab handle**.
5. In the **768** frame (tablet portrait) — this is the tier that did not exist:
   - [ ] The **hamburger is still there**. The topbar has NOT crammed five
         dropdown groups into 768px.
   - [ ] Dialogs are centred boxes, not bottom sheets.
6. In the **2560** frame:
   - [ ] Content uses more of the screen than at 1440 — it is no longer clamped
         to 1200px with the table scrolling inside it.
7. At **every** width:
   - [ ] **No horizontal scrollbar on the page itself.** Wide tables scroll
         inside their own box.

### B. After you push — in the real app

**The home button (your explicit request — check this first)**

- [ ] It is on **every** page, not just the dashboard.
- [ ] It floats at the **bottom, on the left** (RTL) — it does **not** sit on
      the hamburger or the two topbar logos.
- [ ] One click returns you to the main dashboard.
- [ ] Open any dialog: **the home button disappears** while it is open.
- [ ] Open the mobile drawer: it disappears there too.
- [ ] Print preview: it does not print.

**TopChemical — the direction flip (the highest-risk change)**

- [ ] Open several TopChemical list pages. Columns now read **right to left**.
      Confirm this is what you want.
- [ ] Open the TopLight **Sales Print**, **Purchase Print**,
      **Sales Costing Print**, **Sales Offer Print** and **Customer Statement**
      pages. These are documents; check the column order and the totals block.
- [ ] If any of these is wrong: `git revert 8770fad` reverts only this.

**Lists**

- [ ] Row actions are a quiet **⋮** on the right of each row, revealed on hover
      — not 50 coloured "إجراءات / Actions" pills.
- [ ] Open the ⋮ on the **last row of a long table**. The menu is fully visible
      and is not cut off at the table's edge.
- [ ] Click a column header three times: ascending → descending → **back to the
      original order**. A chevron shows which and which way.
- [ ] Scroll a long list: **the column headers stay visible**, and the pager
      stays pinned at the bottom.
- [ ] Open a combo inside a table cell. Its list is not clipped.
- [ ] ValleyFoods numeric columns are right-aligned and **line up**.

**Printing**

- [ ] Print a **two-page** invoice or list. Column headers **repeat on page 2**.
- [ ] The totals block is not split across the break.
- [ ] It is **not** a wall of toner — the header row prints white with a
      coloured rule under it, not as a solid black or green bar.
- [ ] Print from a **narrow window**: you get a table, not a column of cards.

**Manufacturing (ValleyFoods) — confirm Phase 2B still works**

- [ ] Saving a manufacturing order now shows a **confirmation message**. It
      showed nothing before (N-01) — 40 messages were being discarded.
- [ ] **+ دفعة** still opens the FIFO batch modal and still refuses a total that
      does not match.
- [ ] Work-centre costs still print as real figures, not `0.000`.

**Preferences**

- [ ] User menu → **التفضيلات**. Switch to **داكن**.
- [ ] The whole app goes dark. Check a list, a form and a dialog. Nothing is
      black-on-black and no status pill glows.
- [ ] Switch density to **مضغوط**: rows tighten, but everything is still
      tappable.
- [ ] Both survive a navigation.

**Keyboard**

- [ ] Press Tab on any page: the first thing focused is **"تخطي إلى المحتوى"**.
- [ ] Open a dialog and press Tab repeatedly: focus **stays inside it**.
- [ ] Press **Escape**: the dialog closes and focus returns to the control you
      opened it from.

---

## The honest numbers

`node tools/ui_check.js` — 11 checks, **0 failures**.
`node tools/verify/run_all.js` — **27 checks pass** (12 from the ValleyFoods run,
15 added here), **452 individual assertions**.

| Metric | Phase 0 (`e324cfc`) | Final | |
|---|---|---|---|
| `.html` files | 92 | 90 | 42 KB of dead code deleted |
| Colour literals, raw | 794 | 849 | **rises — see below** |
| **Bare literals** (not inside a `var()` fallback) | **723** | **597** | the real number |
| `var(--token)` uses | 708 | 1151 | |
| Token share | 49.5% | **65.8%** | |
| Width queries | 11 | 13 | |
| …on the five-tier scale | **0** | **13** | U-48 resolved |
| DOM elements per table row | 7 | **7** | unchanged |
| DOM elements per action cell | 6 | **6** | unchanged |
| Undefined namespaced symbols | 2 | **0** | N-01 and N-02 |
| Orphan CSS classes | 38 | 37 | barely moved — see skips |

**Why the raw colour count rises.** Every tokenised value keeps its literal as a
fallback: `var(--border-color, #e5e7eb)`. That is not decoration — several pages
build a **print window** with `document.write` and their own `<style>`, and that
window never loads `CSS_Tokens.html`, so a bare `var()` there resolves to
nothing and the element loses its colour entirely. The fallback also made the
whole sweep exactly invertible, which mattered when two files turned out to
carry the other programme's uncommitted work.

The first version of that metric reported `794 → 801` and made the sweep look
like it had done nothing. That was a misleading instrument, and a misleading
instrument is worse than none; `d0eb034` fixed it.

**Payload.** Step 3.3 removed a per-item inline style block from the row action
cell: **101 KB → 54 KB per 50-row page**. Step 4.8 added `data-label` attributes
for the phone card view: **+4 KB per page**. Net strongly positive, and the
element count — the number the performance programme owns — did not move.

---

## Standing answers, as applied

| | Answer | What I did |
|---|---|---|
| **D-1 / D-2** | Odoo-like; retire the coloured canvas in all three; brand for topbar and printing only | Done, one commit per company. ValleyFoods gained a brand topbar it never had. Brand now appears on: topbar, primary buttons, active nav, focus ring, row-hover tint, and the print header rule and totals rule. Nothing else. |
| **D-3** | Cairo, unified | Done. Moved into `CSS_Tokens.html`, loaded once for all 85 pages. |
| **D-4** | Change no displayed value; consolidate only where provably identical; list the rest | Applied literally. **Exactly one** helper qualified — the `esc()` in 23 pages that already delegated to `FMT.escape` behind a dead guard. Every date, money and number helper genuinely differs; each is listed below **with a witness input**. |
| **D-5** | Read-only batch actions; no batch writes | Export selection, print selection, clear selection. The test asserts no batch-write function **exists**, that the batch bar makes no server call, and that it has exactly three buttons. |
| **D-6** | Inline list editing out of scope | Not built. |
| **D-7** | SPA navigation out of scope | Not built. The router is untouched. |
| **D-8** | Harvest the dead engine, then delete; leave `src_html/` alone | Harvested sticky header (1.5), sort arrows (1.3), kebab (3.3) and pending-row state (10.1), then deleted both files. `src_html/` untouched — it is a stale 45-file snapshot, already excluded from deploy. |
| **Phase 2 palette** | Use §2.1 as written | Used verbatim. |
| **2.7 ambiguity** | Leave and list anything whose meaning is the colour | 45 chart/palette values and 316 hex/property pairs left alone, listed below. |
| **5.5 smart buttons** | Only counts from already-loaded data | `count` is a required number; the component has **no fetching path at all**, so one needing a new endpoint cannot be built by accident. |
| **9.1 VF dashboard** | Build from what the backend already exposes; invent nothing | Built from four existing list endpoints, each verified present in `Company_ValleyFoods_Actions.js`. No new endpoint, no new metric. The cost is stated below. |
| **Device support** | Acceptance condition on every phase | Five tiers, mobile-first, `min-width` only. Off-scale queries 11 → 0. |
| **Input type** | Never use width as a proxy | The kebab reveal is gated on `(hover: hover) and (pointer: fine)`; tap targets stay 44/48px at every width, asserted per tier. |
| **3.8 position** | Bottom, inline-end; z-index 1100; hidden with dialogs | Exactly as specified. |

---

## What was skipped, and why

Each of these is a deliberate decision, not an oversight.

### Skipped whole steps

**4.2 — derive the menus from the registry, delete the two Nav files (U-14).**
`Company_TopChemical_Nav.html` and `Company_ValleyFoods_Nav.html` define
`window.*_MENU` globals and are included by **55 pages**. Deleting them means
adding `group:` to three registries, exposing that to the client, and converting
all 55 pages in one sweep — and a page missed loses its **entire navigation
menu**, which is a blank topbar rather than a visibly broken one. The payoff is
one source of truth for menus: real, but invisible to you and purely a
maintainability gain. Wrong trade for a 55-page sweep late in a programme with
no browser.

**6.4 — the 74 `<label>` elements with no `for=`.**
A per-page sweep across ~30 templates with no shared component to fix it in.
Getting one wrong points a label at the **wrong field**, which is worse for a
screen-reader user than no label. `UIC.field`, which generates most of the app's
forms, has always emitted a correct `for=`.

**7.3 / 7.4 — `UIC.document` and converting the 16 print pages.**
Would retire 22 copies of `.inv-table`. Each print page has its own document
shape and totals logic, and the value was in the shared print **rules**, which
every page now gets for free.

**9.4 / 9.5 — drill-down and the main dashboard.**
9.5 needs data nothing exposes — there is no "records I touched" endpoint — so
it would mean a new server function or a new column. Both are out of bounds.

**Converting the 40 native `confirm()` call sites across 28 pages.**
`UIC.confirm` is built and tested. A styled dialog cannot block the way
`confirm()` does, so **every conversion is a restructure of the calling
function**, not a swap: `if (!confirm(x)) return;` becomes a promise chain, and
several of those functions continue into a save. With no browser, converting 40
of them in one sweep is exactly the change that looks done and quietly breaks a
page.

**Converting the 5 dashboard pages onto `API.ensureChart`.**
The loader is built. Each page needs its `<script>` tag removed and its render
wrapped — per-page work, better done one at a time.

**The four hand-rolled tab strips, the sales approval pill, the 37
`window.open()` jumps.** `UIC.notebook`, `UIC.statusbar` and `UIC.smartButtons`
are built and tested; the conversions are per-page.

### Left alone deliberately within steps

- **45 chart and palette colours** — the colour *is* the meaning.
- **316 hex/property pairs** where no token role matched, including
  `border: #111111` (25×, TopLight brand black on documents), `color: #fff`
  (17×, could be `--btn-text-color` or literal white), the status greens
  `#166534` / `#14532d` / `#0e623b`, and muted-ink shades `#374151` / `#94a3b8`
  / `#9ca3af` / `#475569` that are **not** the token value — mapping them would
  visibly change the shade.
- **Off-scale spacing** (2, 3, 5, 6, 10, 14, 48px) and mixed pairs like
  `padding: 10px 12px`. Rounding them onto the 4/8/12/16/24/32 scale would make
  every button in the app grow.
- **`.input { font-size: max(16px, 1rem) }`** — the 16px minimum is what stops
  Android Chrome zooming when a field takes focus. It is a behaviour, not a size.
- **The per-company semantic colours** (`--success`, `--warning`, `--danger`,
  `--info`). They differ slightly between companies; a status colour can carry
  meaning and the plan did not ask to unify them.
- **`UIC.HistorySide` slides in from the physical right.** Correcting it to the
  inline-end is a visible behaviour change and Phase 5.7 was to rebuild that
  panel as a chatter anyway.
- **24 page-local 10–11px rules** remain (U-32). Step 2.3 raised the component
  library's; these are per-page.
- **37 orphan CSS classes** remain (U-08). Most belong to page-local styles;
  `ui_check` C5 lists them by name and fails if the count grows.

---

## Every helper D-4 left in place, with the input that proves why

`node tools/verify/ui2_formatters.js` prints these live.

| Helper | Files | Witness | Local | `FMT.*` |
|---|---|---|---|---|
| `fmtDate` YYYY-MM-DD | 21 | `"2026-01-05"` | `2026-01-05` | `05/01/2026` |
| `fmtDate` en-GB, `-` if empty | 4 | `""` | `-` | `` (empty) |
| `fmtDate` DD/MM/YYYY, `-` | 3 | `""` | `-` | `` (empty) |
| `fmtDate` ISO slice | 2 | `""` | `-` | `` (empty) |
| `fmt3` | 2 | `0` | `0.000` | `0.00` |
| `fmtMoney` ar-EG + `ج.م` | 4 variants | `0` | `٠ ج.م` | `0.00` |
| `fmtNum` max 2 dp | 3 variants | `12.345` | `12.35` | `12.345` |
| `num0` | 9 | — | returns a **Number** | no counterpart |
| `esc` variant B | 13 | `"it's"` | `it's` | `it&#39;s` |

---

## Blocked on you

1. **`ERP_Pages_Matrix` rows for `valley_cost_view`** *(carried from the
   ValleyFoods run — still outstanding).* Until they exist the fail-open guard
   keeps costs visible to everyone, so the permission is registered but not yet
   doing anything. Grant `write` on `valley_cost_view` to every role that should
   see costs, via `ERP_Management` → صلاحيات الأدوار. **I cannot add these — they
   are data in a system table.**

2. **Four pages render money in ARABIC-INDIC digits.**
   `toLocaleString('ar-EG')` turns `1234.5` into `١٬٢٣٤٫٥`. The rest of the app
   uses Western digits. Affected: `Company_TopChemical_CustomsOffice`,
   `_Dashboard`, `_KPI`, `Company_ValleyFoods_MonthlySalaries`. D-4 says digits
   stay Western and no displayed value may change, so this is a **decision for
   you**, not a defect I should have silently fixed.

3. **13 pages do not escape the apostrophe** in their local `esc()`. They render
   identically as HTML *text*, but do not neutralise a quote inside a
   single-quoted attribute. Switching them to `FMT.escape` closes that and
   changes the emitted string, which D-4 forbids. **Worth deciding on** — it is
   the only security-shaped item in this list.

4. **A ValleyFoods KPI endpoint.** The new dashboard counts records by loading
   four full lists, because no summary endpoint exists. It works and it fails
   gracefully, but a proper endpoint would be far cheaper. Needs a new server
   function, which is out of bounds for this programme.

5. **`.modal-overlay` and `.topbar` share `z-index: 1000`.** Which one wins rests
   on DOM order, not stacking. It works today because the overlay is appended
   last. It is fragile; changing a dialog's z-index is not something to do in
   passing.

6. **U-48 from the ValleyFoods run** (sales invoice save throws on an undeclared
   `outputs`) is still unfixed — it was your decision, and this programme did not
   touch it.

7. **Decide whether you want two home affordances.** The topbar system logo
   already links home, and now the floating button does too. Both are cheap.
   Look at them together and tell me which to drop, if either.

---

## Assumptions I made

1. **Every page loads `Client_Helpers.html` before its own script.** Step 1.1's
   `dir` fix and step 2.8's `esc` consolidation both depend on this. Verified: 82
   of 85 templates include it, in `<head>`. The three that do not are
   `Company_ValleyFoods_TestData.html` and the two files deleted in Phase 10.
2. **No page is deliberately LTR.** Verified: no template declares `dir="ltr"`.
3. **`--font-mono` means the same thing in both bespoke themes.** It did —
   identical stacks — so `.num` could be shared without changing either.
4. **A company on `company_colors` = `…,black` may exist.** I could not check
   (no data access), so the generic theme's dark branch is left intact.
5. **`localStorage` may be unavailable.** Every read and write is wrapped, and
   the code renders correctly with no stored value.
6. **The concurrent programme owns `Company_TopLight_Sales.html` and
   `Company_TopLight_Sales_Returns.html`.** Their uncommitted changes appeared
   mid-run; I left both untouched and unstaged. My colour sweep found nothing to
   change in either, so nothing of mine is missing.

---

## Rollback

Every commit reverts independently. Most useful first:

```bash
git revert 8770fad   # 1.1  the RTL flip — the biggest visual change
git revert 90adbc8   # 3.8  the persistent home button
git revert 741b418   # 8    dark mode, density, preferences
git revert 9b55101   # 7    print
git revert 8e7d765   # 3.3  the row action kebab
git revert 34d8c0b   # 3.1/3.2  the icon set
```

Retire the whole visual change but keep the Phase 1 bug fixes:

```bash
git revert f2215ae 57c2e37 497c7fb af71396   # 2.7  the colour sweep
git revert 6aa8876 d10b63d ba07511           # 2.4-2.6  the theme rewrites
git revert 32fc638 49ded8d 28a92a4           # 2.1-2.3  tokens and font
```

Abandon everything:

```bash
git checkout feat/vf-purchasing-ux
git branch -D ui/odoo-parity
```

Phases 4, 5, 6 and 9 are almost entirely **new, opt-in components**. Reverting
them is possible but rarely necessary: a page that does not call them is not
affected by them.

---

## Running the checks

```bash
node tools/ui_check.js          # 11 static checks
node tools/ui_check.js --json   # machine-readable, for diffing
node tools/verify/run_all.js    # 27 checks, 452 assertions
node tools/build_preview.js     # regenerate the preview after editing sources
```

`ui_check` check **C9 fails while the preview is out of date**, so the harness
can never quietly show something the source no longer says.

Check **C11** exists because a backtick inside a CSS comment silently ends the
template literal that holds ~500 lines of the design system, and the rest is then
parsed as JavaScript. It bit **five times** during this run. C2 always caught it,
but reported `Unexpected identifier` at line 1; C11 names the line and says what
to write instead.

---

*Companion documents: `UI_UX_EXECUTION_PLAN.md` (the specification),
`UI_UX_INVESTIGATION.md` (the 48 findings), `UI_BASELINE.md` (the untouched
tree), `VALLEYFOODS_RESULTS.md` (Phase 2B), `design_preview/README.md` (how to
use the harness).*
