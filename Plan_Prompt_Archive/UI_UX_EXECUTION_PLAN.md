# ERP UI/UX — Phased Execution Plan

**Companion to:** [UI_UX_INVESTIGATION.md](UI_UX_INVESTIGATION.md) — findings `U-01`…`U-47`.
**Branch:** `perf/optimization-run` (or a new `ui/odoo-parity` branch — see §0.3).
**Target:** Odoo 17-level design and interaction, within Apps Script constraints.
**Date:** 2026-09-06

---

## Your decisions, as given

| # | Question | Your answer | Effect on this plan |
|---|---|---|---|
| **D-1** | Scope of visual change | **Odoo-like** — retire the coloured canvas | Phase 2 rewrites all three theme paths |
| **D-2** | Company canvas colours | **Retire in all three.** Brand colour used for **topbar and printing** | Phase 2 + Phase 7 |
| **D-3** | Arabic typeface | **Unify across all companies** | Phase 2.2 |
| **D-9** | Staging / deployment | **None. Local file edits only.** You push when we finish | See §0.1 — changes how we verify |
| **⭐ new** | Persistent home button | **Floating system logo on every page, one click back to the main dashboard** | New finding **U-42**, built as step **3.8** — full spec in Phase 3 |
| **⭐ new** | ValleyFoods manufacturing: material entry, FIFO batch modal, work-centre cost in print | **Build them** — findings **U-43 … U-45** | New **Phase 2B**, run before Phase 3 |
| **⭐ new** | `valley_cost_view` cost permission | **Server-enforced**, not just a UI hide. Applies to purchasing, sales and manufacturing | New **Phase 2B**; needs **U-47** fixed first, and matrix rows from you |
| **⭐ new** | Device support | **Phones, tablets and Windows desktops are all first-class.** Five breakpoint tiers, cross-cutting acceptance condition on every phase | Finding **U-48**, new §0.4 |
| **⭐ new** | `Company_ValleyFoods_Actions.js` ownership | **Handed to the UI run** (was the performance programme's) | See the amended §0.5 table |

Still open, each gated inside the phase that needs it: **D-4** (number/currency format),
**D-5** (batch writes), **D-6** (inline editing), **D-7** (navigation speed), **D-8** (dead code).
My recommendation for each is stated at the gate. Nothing waits on them to start.

---

## 0. Ground rules for this run

### 0.1 The verification problem, and how we solve it

You have said: no deploy, no staging, local edits only. That means **neither of us can look at a
browser until you push.** For a UI programme that is the central risk — the failure mode here is
visual, and a static check cannot see "the button is the wrong colour" or "the modal is mirrored".

Three mitigations, all in Phase 0:

1. **A local design preview harness** — `design_preview/index.html`, a plain file you open by
   double-clicking. It renders the entire component library (buttons, tables, modals, toasts, combos,
   forms, tiles, topbar, drawer, control panel, print sheet) against the real `CSS_Tokens.html` and
   `UI_Components.html`, under each of the three company themes, in one scrollable page. **You can see
   every visual change locally, before anything is pushed.** It is excluded from the deploy set and
   never becomes a route.
2. **Static invariant checks** — a Node script (`tools/ui_check.js`) run after every phase:
   - `node --check` on all 19 `.js` files;
   - parse the inline `<script>` of all 85 page templates;
   - every CSS class *used* in a page is *defined* somewhere (catches U-08-style orphans);
   - every HTML anchor id the pages depend on (`tl-root`, `vf-root`, `tc-root`, `admin-root`,
     `dash-shell`, `tab-body`, `app-content`, …) still exists;
   - every `UIC.*` / `API.*` / `FMT.*` / `UI.*` symbol referenced by a page still exists;
   - the token→literal ratio, so we can see Phase 2 actually landing.
3. **A per-phase visual checklist** — each phase below ends with a short, concrete list of what to
   look at in the preview harness (and later, after you push, in the app). Not "check it looks good"
   — specific things, e.g. *"TopLight topbar is black with amber text; page background is grey-white,
   not amber."*

### 0.2 Non-negotiables (carried from the performance run)

1. **Never `clasp push`.** Never create or promote a deployment. You push.
2. **Never write to a business table.** No data, no migration, no backfill.
3. **No schema changes.** Saved views ride on the existing `ERP_User_Views.layout_json`.
   Preferences ride on `localStorage`. Menu grouping rides on the registry files (code, not tables).
4. **Public contracts stay.** `UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, every
   backend function signature, and every HTML anchor id. Components are **added to**, never renamed
   or removed. Where a component's *markup* changes, its *call signature* does not.
5. **No build step, no npm, no new CDN origin.** ES5-flavoured V8, `function` declarations, IIFE
   namespaces. The icon set is an inline SVG sprite, not a fetch. The one font is Google Fonts, which
   two of the three companies already use.
6. **Do not regress the performance work.** `PERFORMANCE_RESULTS.md` documents in-flight
   optimisation on this same branch. Anything adding per-row DOM or per-page payload is measured
   against it — in particular the chunked renderer ([UI_Components.html:277](UI_Components.html#L277))
   and the 50-row pager.
7. **One commit per phase, or per module where a phase says so.** Every commit independently
   revertible with a single `git revert`.

### 0.3 Branch

Phase 0 opens **`ui/odoo-parity`** off the current `perf/optimization-run` HEAD. Reason: the
performance branch has its own unfinished continuation (Phases 7–10 of `NEXT_RUN_PROMPT.md`) and
mixing two programmes in one branch makes both harder to revert. Say the word if you'd rather stay on
one branch.

### 0.4 Device support — a cross-cutting requirement, not a phase ⭐

**The owner's requirement: the design must work properly on phones, tablets and Windows desktops.**
All three are first-class targets, not one target with two fallbacks.

This is **not** a phase. It is an acceptance condition that **every** phase must satisfy before its
commit lands. A component that works at 1440px and breaks at 820px is not finished.

#### The breakpoint scale (finding U-48)

Today there are effectively two tiers: `max-width: 767px` and `min-width: 768px` — so a 768px iPad
and a 2560px monitor get identical layout, and `.app-content { max-width: 1200px }` leaves half a
wide Windows screen empty while the tables inside it scroll sideways.

Define five tiers as tokens in `CSS_Tokens.html`, and use **only** these:

| Tier | Range | Representative devices | Layout intent |
|---|---|---|---|
| `phone` | ≤ 599px | 360–430px Android / iPhone | Single column. Drawer nav. Tables become cards (U-39). Modals are bottom sheets. Actions collapse into one primary + overflow. |
| `tablet-p` | 600–899px | iPad portrait 768/834px | Drawer nav **stays** — the topbar cannot hold 5 dropdown groups at this width. Tables scroll with 3–4 priority columns pinned. Modals centre. Two-column forms. |
| `tablet-l` | 900–1279px | iPad landscape 1024/1194px, small laptops | Topbar nav appears. Full tables. Control panel in one row. |
| `desktop` | 1280–1919px | Windows 1366 / 1920 | The primary working target. Everything visible, no compromises. |
| `wide` | ≥ 1920px | 2560px monitors | Content **unclamps** — raise or drop the 1200px cap for data views so wide tables use the screen instead of scrolling inside a narrow column. Optional side-by-side list + form. |

Author with **`min-width` queries, mobile-first**, so a tier inherits the one below and each rule is
additive. Never use `max-width` for the main flow.

#### Rules that bind every phase

1. **No new breakpoint values.** Use the five tokens. Part of Phase 2's sweep is retiring the ad-hoc
   `900px` / `720px` / `640px` / `600px` / `1300px` queries scattered through the page templates.
2. **Touch and pointer both work everywhere.** Windows machines have touchscreens and tablets have
   keyboards — never gate behaviour on screen width as a proxy for input type. Use
   `@media (hover: hover)` / `(pointer: fine)` for pointer affordances, and keep the 44/48px tap
   targets at **all** widths. A hover-only action must have a non-hover path.
3. **Fix the 768px overlap.** The shell switches at 767/768 while the home-logo FAB uses
   `max-width: 768px` ([UI_Components.html:149](UI_Components.html#L149)) — at exactly 768px they
   disagree.
4. **The drawer must survive into `tablet-p`.** `.topbar-hamburger { display: none !important }` at
   `min-width: 768px` ([UI_Components.html:1756](UI_Components.html#L1756)) currently forces the full
   topbar onto an iPad in portrait. Move that switch to `tablet-l`.
5. **Both orientations.** Every tier is checked in portrait and landscape. The existing
   landscape-phone rule stays.
6. **No horizontal page scroll at any width**, from 320px up. Wide content scrolls **inside its own
   container**, never the body.
7. **Every phase's visual checklist names the widths it was checked at.** Minimum: 390, 768, 1024,
   1440, 2560 — in both orientations for the two tablet widths.

#### How this is verified without a browser

The preview harness (Phase 0) must render each component **at all five tiers simultaneously** — a
width switcher, or stacked iframes at fixed widths, so a single scroll shows a component at 390 /
768 / 1024 / 1440 / 2560 side by side. That is the only way either of us sees a tablet regression
before the owner pushes.

`ui_check.js` additionally fails the build on: any `@media` value in a page template that is not one
of the five tokens, and any `max-width`-based main-flow query introduced after Phase 2.

### 0.5 File ownership, alongside the concurrent performance programme

The performance programme is still running on this repo (`NEXT_RUN_PROMPT.md`, Phases 11-14). The two
programmes must not edit the same files at the same time.

| Files | Owner |
|---|---|
| `Company_TopChemical_Actions.js`, `Company_TopLight_Actions.js` | **Performance - do not touch** |
| `02_DataAccess.js`, `05_Admin.js`, `07_Backup.js`-`10_Retention.js` | **Performance - do not touch** |
| `Company_ValleyFoods_Actions.js` | **UI run** - handed over by the owner on 2026-09-06 for Phase 2B |
| `CSS_Tokens.html`, `UI_Components.html`, `Client_Helpers.html`, `ERP_*.html` | **UI run** |
| All page templates (`Company_*.html`, `0_*.html`, `User_*.html`) | **UI run** |
| `03_Security.js` (theme functions, ~lines 700-930) | **UI run** |
| `Company_*_Registry.js` | **UI run** |
| `Code.js` | **Shared** - one comment fix in step 10.2, left until last |

The ValleyFoods handover is the risky one: that file is 364 KB, the performance programme landed
changes in it during Phases 7-10, and Phases 11-14 may touch it again. Check `git log` and
`git status` on the path before editing, re-verify every line reference, and keep Phase 2B's edits
narrow and additive.

---

## Phase map

| Phase | Name | Findings | Effort | Risk | Gated on |
|---|---|---|---|---|---|
| **0** | Guardrails: preview harness + static checks | — | S | None | — |
| **1** | Shared-layer defects | U-01…U-05 | S | Low | Phase 0 |
| **2** | **Neutral canvas, unified font, token discipline** | U-06, U-07, U-10, U-11, U-32, U-36 | L | Low–Med | Phase 1 |
| **2B** ✅ | ⭐ **ValleyFoods manufacturing + cost visibility** | U-43…U-47 | L | **Med–High** | Phase 2 |
| **3** | Icon system + component polish | U-09, U-20, U-22, U-24, U-40, **U-42** | M | Low | Phase 2B |
| **4** | **Control panel + list view** | U-13, U-14, U-17, U-18, U-19, U-23, U-39 | XL | Med | Phase 3 |
| **5** | Form view | U-25, U-26, U-27, U-28, U-29 | L | Med | Phase 4 |
| **6** | Accessibility pass | U-31, U-33 | M | Low | Phase 5 |
| **7** | Documents & print | U-34 | M | Low | Phase 2 (any time after) |
| **8** | Dark mode, density, preferences | U-12, U-41 | M | Low | Phase 2 |
| **9** | Dashboards & analytics | U-37, U-38 | M | Low | Phase 4 |
| **10** | Dead code, hygiene, final docs | U-35, U-16 | S | Low | after Phase 4 |

Phases 1–3 are the visual transformation. Phase 4 is where the *productivity* jump lives and is the
largest single piece of work in the programme. Phases 6–10 are consolidation.

**Where the felt improvement comes from:** Phase 1 fixes the things people bump into daily. Phase 2
is the moment it stops looking like a Google Sheets front-end. Phase 4 is the moment it starts
working like an ERP.

---

## Phase 0 — Guardrails

**Objective:** make it possible to see and check the work without deploying. No user-visible change.

| # | Step | Files |
|---|---|---|
| 0.1 | `design_preview/index.html` — component gallery, all three themes, **and a width switcher rendering every component at 390 / 768 / 1024 / 1440 / 2560** (§0.4) | new |
| 0.2 | `design_preview/README.md` — how to open it, what to look for | new |
| 0.3 | `tools/ui_check.js` — the static invariant suite in §0.1 | new |
| 0.4 | Baseline run of `ui_check.js`, output committed as `UI_BASELINE.md` | new |
| 0.5 | `.claspignore` — add `design_preview/**` and `tools/**` | edit |

**On the preview harness:** it must read the *real* `CSS_Tokens.html` and `UI_Components.html`, not a
copy — otherwise it drifts and becomes a lie. It will strip the Apps Script `<?!= … ?>` scriptlets and
stub the three theme functions from `03_Security.js` so all three themes can be toggled in one page.

**Verification:** the harness opens in a browser and renders every component; `ui_check.js` passes on
the untouched tree (it must, by definition — that is the baseline).
**Rollback:** nothing in this phase touches a live file except `.claspignore`.
**Gate:** you open the harness once and confirm it shows you what you need to see.

---

## Phase 1 — Shared-layer defects

**Objective:** the five verifiable bugs from investigation Group A. Each is independent, small, and
separately revertible. No design decisions involved — these are wrong, not merely dated.

| # | Finding | Change | Files |
|---|---|---|---|
| 1.1 | **U-02** | Set `document.documentElement.dir = 'rtl'` once, at the top of the shared helper, so modals/toasts/spinners stop laying out LTR on the 56 affected pages | [Client_Helpers.html](Client_Helpers.html) |
| 1.2 | **U-01** | Render row-action menus and combo lists in a body-level portal with fixed positioning, so `.table-wrap`'s clip box stops cutting them off | [UI_Components.html:22](UI_Components.html#L22), [:760](UI_Components.html#L760), [:1358](UI_Components.html#L1358) |
| 1.3 | **U-03** | Keep an untouched `originalRows`; tri-state sort (asc → desc → none) with a chevron indicator, `aria-sort`, and non-sortable columns opted out via `sortable:false` | [UI_Components.html:641](UI_Components.html#L641) |
| 1.4 | **U-04** | Move `.num` into the shared stylesheet: `direction:ltr; text-align:left; font-variant-numeric:tabular-nums` | [UI_Components.html](UI_Components.html), remove the duplicates from [03_Security.js:809](03_Security.js#L809), [:896](03_Security.js#L896) |
| 1.5 | **U-05** | `.table thead th { position: sticky; top: 0 }`, z-index below the topbar | [UI_Components.html:1368](UI_Components.html#L1368) |

**Notes on 1.1.** This is one line and fixes 56 pages. The 23 pages that already set `dir` on `<html>`
are unaffected (idempotent). It is also the change most likely to *reveal* small layout bugs that
were hidden by the wrong direction — expect a handful of follow-ups in Phase 3, and I will list them
rather than fix them silently.

**Notes on 1.3.** The current sort mutates `st.filtered` / `st.rows` in place. Introducing
`originalRows` means the filter pipeline (`search → filter → sort → slice`) must re-derive from the
original each time. That pipeline is performance-sensitive; I'll keep the O(n) decorate-sort-undecorate
shape the previous run built and add the third state without changing complexity.

**Verification:** `ui_check.js`; preview harness — open a table with 60 rows, sort each column three
times, open a row menu on the last row, open a combo inside a table cell, open a modal.
**Visual checklist for you:**
- Modal title sits on the **right**, Cancel/Save on the **left**.
- Row action menu on the last table row is fully visible, not cut off.
- Sorted column shows a chevron; a third click returns to the original order.
- Numbers in a ValleyFoods table are right-aligned and line up column-wise.
- Column headers stay visible while scrolling a long table.

**Rollback:** five independent commits, `git revert` any one.
**Gate:** your sign-off in the preview harness before Phase 2 starts.

---

## Phase 2 — Neutral canvas, unified font, token discipline

**Objective:** the visual transformation you approved in D-1/D-2/D-3. This is the phase where the app
stops looking like three different products.

### 2.1 — The new token layer

Proposed values. **React to these before I write them** — this is the palette everything else
inherits.

```css
/* Canvas & surfaces — neutral, shared by all three companies */
--bg-canvas:      #f5f6f8;   /* page background (was: amber / green / #f4f5f7) */
--bg-surface:     #ffffff;   /* cards, tables, modals, sheets */
--bg-subtle:      #f7f8fa;   /* table headers, inset panels */
--bg-sunken:      #eef0f3;   /* wells, disabled fields */

/* Borders — hairline, neutral (was: 2px solid black / 2px solid green) */
--border-color:   #e2e5ea;   /* default hairline */
--border-strong:  #cfd4db;   /* emphasis, table outer edge */

/* Ink — raised for AA at the 11–12px sizes we actually use */
--text-main:      #111827;   /* unchanged */
--text-muted:     #5b6572;   /* was #6b7280 — 4.8:1 → 6.4:1 on white */
--text-disabled:  #7c8694;   /* was #9ca3af — 2.5:1 (FAIL) → 4.6:1 */
```

Brand colour is then applied **only** to: the topbar, primary buttons, active nav state, the focus
ring, the row-hover tint, and print accents (Phase 7). Nothing else.

**Per company, brand tokens are mostly already right** — the problem was never the brand colours, it
was the canvas and the 2px borders:

| Company | Topbar | Primary button | Accent / active | Canvas |
|---|---|---|---|---|
| **TopLight** | `#111111` black, amber `#fbbf24` ink | `#111111` bg, `#fbbf24` text (unchanged) | `#fbbf24` | **neutral** (was `#fbbf24`) |
| **TopChemical** | `#15803d` green, white ink | `#15803d` bg, white text (unchanged) | `#dcfce7` | **neutral** (was `#16a34a`) |
| **ValleyFoods** | `#16a34a` green, white ink **(new — it has no brand topbar today)** | `#16a34a` bg, white text | `#f0fdf4` | neutral (already) |

### 2.2 — Unified Arabic typeface

**Cairo**, for all three companies. Rationale: two of the three already load it
([03_Security.js:772](03_Security.js#L772), [:859](03_Security.js#L859)), it is a well-hinted Arabic
UI face with a real 400–800 range, and unifying on it is the lowest-risk answer to D-3. If you'd
rather have IBM Plex Sans Arabic (more neutral, slightly better for dense numeric tables) or Noto
Sans Arabic, say so now — it is a one-line change in Phase 2 and a large one after.

Mechanically: move the font `<link>` + `preconnect` **out** of the two bespoke themes and **into**
[CSS_Tokens.html](CSS_Tokens.html), so it loads once on all 82 pages with `display=swap`, and
ValleyFoods stops falling back to Tahoma. Net effect on payload: neutral (two pages stop loading it
twice, one page starts).

### 2.3 — Steps

| # | Step | Files | Commit |
|---|---|---|---|
| 2.1 | New token block; add `--bg-canvas`, `--border-strong`, `--bg-sunken`; raise muted/disabled ink | [CSS_Tokens.html](CSS_Tokens.html) | 1 |
| 2.2 | Cairo `<link>` + preconnect moved into the shared token file | [CSS_Tokens.html](CSS_Tokens.html) | 1 |
| 2.3 | Adopt `--text-*` and `--space-*` scales inside `UI_Components.html` — replace its own 47 hardcoded px sizes | [UI_Components.html](UI_Components.html) | 1 |
| 2.4 | Rewrite `topLightThemeCss_` — neutral canvas, hairline borders, brand topbar, keep black/amber buttons | [03_Security.js:772](03_Security.js#L772) | 1 |
| 2.5 | Rewrite `topChemicalThemeCss_` — same treatment | [03_Security.js:859](03_Security.js#L859) | 1 |
| 2.6 | Rewrite the generic `getCompanyThemeCSS_` path — neutral canvas + **new brand topbar rule** so ValleyFoods matches | [03_Security.js:703](03_Security.js#L703) | 1 |
| 2.7 | Hardcoded-colour sweep, **one company at a time** — replace the 550 literals with tokens | 85 page templates | 3 (one per company) |
| 2.8 | Retire the local `esc()` / `num0` / `fmt3` / `fmtDate` duplicates in favour of `FMT.*` | 36 + 32 pages | 3 (one per company) |
| 2.9b | **Breakpoint tokens** — the five tiers from §0.4 as CSS custom properties, plus the tablet fixes: drawer survives into `tablet-p`, the 768px FAB overlap, and the `wide` unclamp of `.app-content` | [CSS_Tokens.html](CSS_Tokens.html), [UI_Components.html:1657](UI_Components.html#L1657), [:1741-1762](UI_Components.html#L1741-L1762) | 1 |
| 2.9 | ✅ **DONE in the ValleyFoods run** — commit `4ed800e`. **Modal `size` option** on `UIC.openModal` (`sm` 420 / `md` 560 default / `lg` 880 / `xl` 1100), replacing the hardcoded desktop `max-width: 560px`. Pulled forward out of Phase 3.6 because Phase 2B needs it. | [UI_Components.html:998](UI_Components.html#L998), [:1466](UI_Components.html#L1466) | 1 |

**2.7 is the long one** — 550 literals across 85 files. It is mechanical but must not be blind: some
literals are *deliberately* not themeable (chart palettes, status colours in a legend). I will produce
a mapping table first, get your eye on the ambiguous ~30, then apply. One commit per company so a bad
sweep reverts one company, not all three.

**On 2.9. ✅ Done — `4ed800e` (ValleyFoods run, 2026-09-06).** It also gained a `footer` option in
`77f2362`, so a caller can supply its own footer markup; both are additive and every one of the 78
existing call sites across 49 pages renders byte-identically (proved in `tools/verify/s0_modal_size.js`).
The original note follows.

Small, but it must land before Phase 2B. `UIC.openModal` today takes only `title`, `body`, `footer` and `onSave`, and `.modal` is pinned to `max-width: 560px` on desktop. Phase 2B's batch-allocation modal is a six-column table (lot, available, allocated, remaining, unit cost, line total) and does not fit. Without the option the only way to build it is a hardcoded width override on the page — exactly the page-local-CSS habit this phase exists to remove. Default stays `md` at 560px, so **every existing caller is unaffected**; the parameter is purely additive.

**2.8 carries a real risk and a gate — D-4.** The local formatters differ from `FMT.*`: e.g.
[Company_ValleyFoods_MfgOrders.html:42](Company_ValleyFoods_MfgOrders.html#L42) renders `DD/MM/YYYY`
while `FMT.date` uses `toLocaleDateString('en-GB')`, and several pages round to 3 decimals where
`FMT.currency` uses 2. **Consolidating will change displayed values on some pages.** I will not do
that blind.

> **GATE D-4 — needed before step 2.8.** Three questions:
> 1. **Digits:** Western (`1,234.56`) as today, or Arabic-Indic (`١٬٢٣٤٫٥٦`)?
> 2. **Currency:** bare number as today, or show `EGP` / `ج.م`?
> 3. **Decimals:** 2 everywhere, or keep 3 for quantities and 2 for money?
>
> *My recommendation:* Western digits (standard in Egyptian business software), `ج.م` shown on money
> columns and totals only (not on every cell), 2 decimals for money and 3 for quantities.
> **If you don't answer, step 2.8 is deferred to Phase 10 and everything else in Phase 2 proceeds.**

**Verification:** `ui_check.js` (token/literal ratio must move sharply); preview harness with the
theme toggle exercised for all three companies.
**Visual checklist for you:**
- All three companies: page background is the same light grey-white. No amber, no green canvas.
- TopLight topbar is black with amber text; TopChemical and ValleyFoods topbars are green with white.
- Card, table and modal borders are thin grey hairlines — no 2px black or green frames.
- Arabic text is Cairo everywhere, including ValleyFoods.
- Muted text (table headers, metadata) is noticeably darker and easier to read.

**Rollback:** 11 commits. Theme rewrites (2.4–2.6) revert independently of the sweep (2.7).
**Gate:** your sign-off on the palette in §2.1 **before** I write it, and on the harness after.

---

## Phase 2B — ValleyFoods manufacturing and cost visibility ⭐ owner-requested

> ## ✅ DONE — executed 2026-09-06 on branch `feat/valleyfoods-mfg-cost`
>
> **This phase is complete. The UI/UX run must not redo it.** Report:
> [VALLEYFOODS_RESULTS.md](VALLEYFOODS_RESULTS.md).
>
> | Item | Commit |
> |---|---|
> | 2.9 modal `size` (pulled forward) | `4ed800e` |
> | 2B.1 — U-47, save resolves `cost_unit` server-side | `9deb108` |
> | 2B.2 — U-45, work-centre costs in the response | `2804a3a` |
> | 2B.3 — U-45, the two columns on screen | `39b74ab` |
> | 2B.4 — U-46, `valley_cost_view` registered | `52a6562` |
> | 2B.5 — U-46, cost stripping (mfg / purchasing / sales) | `84eb0ae`, `2e8d711`, `2501b07` |
> | 2B.6 — U-46, client gating | `e6201d5`, `427a08e` |
> | 2B.7 — U-44, the FIFO batch modal | `77f2362` |
> | 2B.8 — U-43, material entry ergonomics | `0b61c44` |
> | design preview + check runner | `a0d11ce` |
>
> **Carried forward into the UI/UX run:**
> - **Phase 3.6 no longer needs to touch modal width** — 2.9 did it. Only the drag handle and
>   swipe-to-dismiss remain there.
> - `UIC.openModal` now also takes `footer` as markup (`77f2362`), which the batch modal needed for
>   a disableable confirm button. Additive.
> - `tools/verify/` now holds a DOM stub, a page harness that boots a real template with the real
>   `UI_Components.html`, and 11 checks (`node tools/verify/run_all.js`). **Phase 0's guardrails
>   should build on this rather than start again**, and `design_preview/` has been seeded with
>   `vf_mfg_batch.html`.
> - **Blocked on the owner:** the `ERP_Pages_Matrix` rows. Until they exist the fail-open guard
>   keeps costs visible to everyone, so the UI/UX run will see today's behaviour, not the gated one.
> - **New finding U-48** (sales invoice save throws on an undeclared `outputs`) is reported in
>   VALLEYFOODS_RESULTS.md §5 and NEXT_STEPS_OWNER.md item 7. Not fixed — owner's decision.


**Objective:** the four requests raised on 2026-09-06 — easier material entry, a FIFO batch modal,
work-centre costs in print, and a `valley_cost_view` permission gating cost columns across
purchasing, sales and manufacturing. Findings **U-43 … U-47**.

**Position:** after Phase 2, before Phase 3, per the owner's instruction.

**Cost of running it early — reassessed 2026-09-06, and it is lower than first stated.** The batch
modal must be built on `UIC.openModal` and on nothing else. Do that and the later phases *give* it
things rather than rewriting it: the drag handle and swipe-dismiss (3.6), the focus trap and Escape
close (6.1), the icon set (3.1) and the Phase 2 tokens all arrive without anyone reopening the
manufacturing page. The single real dependency — `UIC.openModal` cannot make a dialog wide enough
for a six-column allocation table — is met by **step 2.9**, which runs immediately before this
phase. Net expected rework: none.

**Therefore, a hard rule for 2B.7:** no bespoke dialog, no page-local overlay, no hardcoded width.
The page already carries one bespoke overlay ([Company_ValleyFoods_MfgOrderView.html:104-120](Company_ValleyFoods_MfgOrderView.html#L104-L120))
with a hardcoded `#875A7B` spinner; do not add a second. If `UIC.openModal` cannot do something the
batch modal needs, extend `UIC.openModal` — additively, default behaviour unchanged — rather than
working around it on the page.

### Decisions taken (owner, 2026-09-06)

| Question | Answer |
|---|---|
| Is cost hiding a security boundary? | **Yes — server-enforced.** Cost fields are stripped from the response for users without the grant; they never reach the browser. |
| `Company_ValleyFoods_Actions.js` ownership | **Handed to the UI run.** The file-ownership table is amended: this file is now the UI programme's. |
| Sequencing | **Early — before Phase 3.** |

> ⚠️ **The file handover is the biggest risk in this plan.** `Company_ValleyFoods_Actions.js` is
> 364 KB and the performance programme has been editing it (Phases 7–10 landed changes there, and
> Phases 11–14 are specced). Before touching it, check `git log` and `git status` on that path, and
> re-verify every line reference. Keep every edit in this phase **additive and narrow** — the four
> changes below touch six specific places, nothing else.

### 2B.0 — Sequencing guard (do this first, it protects everyone)

**U-47 must land before U-46.** If cost stripping ships first, any user without the grant who saves a
manufacturing order writes `''` into `cost_unit` for every consumption row they touch, wiping costing
data silently. The order below is not negotiable.

Second guard: once `valley_cost_view` is registered and the UI gates on it, **nobody has the grant
until the owner adds the `ERP_Pages_Matrix` rows** — so costs would vanish for everyone, including
the owner. Therefore **the gate must fail open until the permission exists**: if no role in the matrix
holds any grant on `valley_cost_view`, treat every user as authorised and log it once. The gate
becomes real the moment the owner grants it to the first role. Document this loudly in the results
file and in the owner register.

### 2B.1 — Steps

| # | Finding | Change | Files | Commit |
|---|---|---|---|---|
| 2B.1 | **U-47** | Save resolves `cost_unit` server-side from `valley_current_products` keyed by batch uid — the same lookup the read already does at [:4689](Company_ValleyFoods_Actions.js#L4689) — and **ignores the client's `unit_cost` entirely**. Replaces the trust-the-client write at [:4211](Company_ValleyFoods_Actions.js#L4211). | `Company_ValleyFoods_Actions.js` | 1 |
| 2B.2 | **U-45** | Add `work_center_cost` and `total_cost` to the `getValleyMfgWorkOps_` row projection at [:4840](Company_ValleyFoods_Actions.js#L4835). Two fields. Fixes the `0.000` in print. | `Company_ValleyFoods_Actions.js` | 1 |
| 2B.3 | **U-45** | Show the same two columns in the on-screen work-ops table, which shows no cost today | `Company_ValleyFoods_MfgOrderView.html` | 1 |
| 2B.4 | **U-46** | Register `valley_cost_view` as a page entry with `nav: false` and a clear label | `Company_ValleyFoods_Registry.js` | 1 |
| 2B.5 | **U-46** | Server-side cost stripping helper + apply to the ValleyFoods read endpoints for manufacturing, purchasing and sales | `Company_ValleyFoods_Actions.js` | 3 (one per module) |
| 2B.6 | **U-46** | Client-side: hide cost columns, totals and KPI cost tiles when the grant is absent; quantities always visible | `Company_ValleyFoods_MfgOrderView.html`, `_MfgOrders.html`, `_Purchasing.html`, `_Sales.html` | 2 |
| 2B.7 | **U-44** | The FIFO batch modal — full spec below | `Company_ValleyFoods_MfgOrderView.html` | 1 |
| 2B.8 | **U-43** | Material entry ergonomics — full spec below | `Company_ValleyFoods_MfgOrderView.html` | 1 |

### 2B.2 — Spec: server-enforced cost stripping (U-46)

**The rule.** A single server-side helper, e.g. `vfCanSeeCost_(user)`, returns true when the user is a
super admin, **or** when `user.authorizedPages['valley_cost_view']` contains `write` or `full`, **or**
when no role in the matrix holds any grant on `valley_cost_view` (the fail-open guard in 2B.0).

**Where it applies.** Every ValleyFoods read endpoint that returns a cost-bearing field, in the three
modules named by the owner. Fields to strip include (verify the full list against the code before
editing — this is the starting set, not the finished one):

- Manufacturing: `unit_cost` and `total_cost` on consumption footers, `cost_unit`, `work_center_cost`,
  `total_cost` on work ops, `total_inventory_cost`, `total_other_cost`, `total_batch_cost`,
  `by_product_nrv_value`, and `unit_cost` on the batch options from `get_valley_product_batches` /
  `get_valley_product_batches_multi`.
- Purchasing and sales: the equivalent unit-cost, line-cost, total-cost and margin fields.

**How to strip.** Omit the key, do not send zero. A zero is indistinguishable from a real zero cost
and will be rendered as a figure. The client must be able to tell "not permitted" from "costs
nothing".

**What must NOT change.** Quantities, batch identity (`batch_uid`, `lot`), availability, dates,
statuses and every field the FIFO allocation needs. **A user without the cost grant must still be
able to allocate batches and save a manufacturing order correctly** — which is exactly why 2B.1 comes
first: with the save resolving cost server-side, a payload carrying no cost is no longer a problem.

**Print.** The manufacturing print is generated client-side from data the page already holds, so it
inherits the gating for free: a user with the grant prints costs, a user without prints quantities
only. That is the intended behaviour and needs no separate work — but state it in the results file so
nobody later reports it as a bug.

**Verification.** Add a test to the harness that runs each converted endpoint's projection twice —
once as a user with the grant, once without — and asserts that the two responses differ **only** in
the cost keys, and that the no-grant response has those keys **absent** rather than zeroed.

### 2B.3 — Spec: the FIFO batch modal (U-44)

Triggered by **+ دفعة**. Everything here is client-side; it mirrors a rule the server already
enforces at [Company_ValleyFoods_Actions.js:3972](Company_ValleyFoods_Actions.js#L3972).

| Aspect | Specification |
|---|---|
| **On open** | If no batches are allocated for this material, run `autoAllocFifo_` and present the result as the proposed allocation. If batches are already allocated, **keep them** and run FIFO only over the shortfall — the owner's "if there already chosen batches it continue". |
| **Contents** | One row per batch: lot / `transaction_code`, available, allocated (editable), remaining. Oldest first. Unit cost and line total **only when the user holds the cost grant** (2B.2). |
| **Running total** | Live: `مجموع الدفعات: X من Y`. Green tick when `|Σ − qty| ≤ 0.01`; red with the shortfall or excess named otherwise. The 0.01 tolerance **must match the server's** exactly — same comparison, same rounding to 3 decimals — or the modal will accept an allocation the save then rejects. |
| **Over-allocation** | A row allocated beyond its availability is flagged on that row. The server also checks this against `valley_current_products` including quantities consumed by other orders, so the modal is an early warning, not the authority. Say so in the error text. |
| **Confirm** | Disabled until the sum matches. Writes back into `OUTPUT_FOOTERS[i]` and re-renders. |
| **Cancel** | Leaves the existing allocation untouched. |
| **Also fix** | The quantity-change path at [:382](Company_ValleyFoods_MfgOrderView.html#L382) currently skips re-allocation once any batch is allocated by hand, so quantity and batches drift apart silently. Re-run FIFO over the shortfall instead, or mark the line as needing re-allocation. Do not leave it silent. |

### 2B.4 — Spec: material entry ergonomics (U-43)

| Aspect | Specification |
|---|---|
| **Adding** | One compact row — product combo, quantity, delete — not a full card. The batch sub-table appears only once a product and quantity exist; drop the "لا توجد دفعات مسجلة" empty table that renders before the user has entered anything. |
| **Re-render** | `drawOutputs()` currently rebuilds every material card on every keystroke path, destroying the combo being typed into. Re-render **only the row that changed**. This is the same in-place-update discipline the TopLight sales page already applies for exactly this reason ([Company_TopLight_Sales.html:318-330](Company_TopLight_Sales.html#L318-L330)) — follow that precedent. |
| **Summary** | Each collapsed row shows: material, quantity, batches allocated, and — cost grant permitting — total cost. |
| **Batch state** | A clear per-row indicator: allocated / short / over. This is what makes the sum rule visible before save rather than at it. |

### 2B.5 — Verification, rollback, and the owner's step

**Verification:** `ui_check.js`; the cost-stripping differential test in 2B.2; a save-payload diff for
`saveValleyMfgOrder_` proving 2B.1 changed only the source of `cost_unit` and nothing else about the
written row.

**Visual checklist:**
- A printed manufacturing order shows real work-centre costs, not `0.000`.
- The on-screen work-ops table shows the same two columns.
- **+ دفعة** opens a modal with batches already proposed oldest-first, and the confirm button stays
  disabled until the total matches the line quantity.
- Changing a material's quantity after hand-editing batches no longer leaves the two out of step.
- Adding a material no longer destroys the combo you are typing into.
- With the cost grant: costs visible everywhere as today. Without it: quantities only, and no cost
  values anywhere in the network response.

**Rollback:** 11 commits. 2B.1 and 2B.2 are independent of everything else and worth keeping even if
the rest is reverted.

**Blocked on owner — must be recorded in `NEXT_STEPS_OWNER.md` and the results file:**
> Add `ERP_Pages_Matrix` rows granting `write` on `valley_cost_view` to every role that should see
> costs, via `ERP_Management` → صلاحيات الأدوار. Until you do, the fail-open guard leaves costs
> visible to everyone — which is today's behaviour, so nothing breaks, but the permission is not yet
> doing anything. Verify by granting it to one role, then logging in as a user in a role without it
> and confirming the cost columns are gone **and** absent from the network response.

---

## Phase 3 — Icon system and component polish

**Objective:** replace emoji with a real icon set and clean up the components the eye lands on most.

| # | Finding | Change | Files |
|---|---|---|---|
| 3.1 | **U-09** | Inline SVG sprite (~40 icons, ~4 KB) in the shared layer + `UIC.icon(name, opts)`; icons inherit `currentColor` so they theme automatically | [UI_Components.html](UI_Components.html) |
| 3.2 | **U-09** | Replace emoji and `&#nnnnn;` entities at call sites — toolbar, module tiles, dashboards, row actions | ~20 pages |
| 3.3 | **U-20** | Row actions become a subtle `⋮` kebab revealed on row hover (touch: always visible), replacing the per-row primary-coloured pill; drop the bilingual "إجراءات / Actions" label | [UI_Components.html:17](UI_Components.html#L17) |
| 3.4 | **U-24** | One loading service. `UI.showSpinner` stays the public name (80 pages call it) and becomes a thin wrapper; `UIC.showPageLoading`, `ERPFlow` and the two page-local overlays delegate to it | [Client_Helpers.html:160](Client_Helpers.html#L160), [UI_Components.html:112](UI_Components.html#L112), [ERP_Flow.html](ERP_Flow.html), 2 VF pages |
| 3.5 | **U-22** | `UIC.emptyState({icon, title, body, action})` — illustration, explanation, primary CTA; `emptyText` string keeps working | [UI_Components.html:1379](UI_Components.html#L1379) |
| 3.6 | **U-40** | Bottom-sheet drag handle + swipe-to-dismiss. *(The `max-width` half of this item moved to step 2.9, which is ✅ **done** — `4ed800e`. Nothing about modal width remains here.)* | [UI_Components.html:1463](UI_Components.html#L1463) |
| 3.7 | — | Fix whatever Phase 1.1 revealed once the 56 pages render RTL correctly | as found |
| 3.8 | **U-42** | ⭐ **Owner-requested.** Persistent floating home button on **every** page — see spec below | [UI_Components.html:129](UI_Components.html#L129) |

**On 3.3.** The row-action kebab already exists, fully styled, in the dead
[ERP_DataTable.html](ERP_DataTable.html) (`.erp-kebab`). I will harvest it rather than write a new
one — which is the argument for answering D-8 as *harvest, then delete*.

### Spec for 3.8 — the persistent home button (U-42)

The owner's requirement: **the main system logo, floating above the page, on every page, one click
back to the main dashboard.** The component already exists and is gated off; this step removes the
gate and fixes the two things that would otherwise ship broken.

| Aspect | Specification |
|---|---|
| **Where it shows** | Every page. Remove the action gate at [UI_Components.html:134](UI_Components.html#L134). |
| **What it is** | `UIC.SYSTEM_LOGO_URL` in a circular button, 44px desktop / 38px mobile — unchanged from today. |
| **What it does** | Navigates to `?action=ERPDashboard&sessionToken=…` via `UIC.navTo`, which already handles top-frame navigation and the loading overlay. Unchanged. |
| **Position** | **Bottom, inline-end** (bottom-left in RTL), offset by `max(16px, var(--safe-bottom))`. **Not** top-right — that is where `.topbar-left` renders in RTL, so it would sit on the hamburger and the two topbar logos on all 82 shell pages. |
| **Stacking** | `z-index: 1100` — above page content, the sticky topbar (1000) and the breadcrumb; **below** toasts (2000), the modal overlay, the drawer and the loading overlays. |
| **Yields to dialogs** | Hidden whenever a dialog or the drawer is open: `body.modal-open #home-logo-fab { display: none }`. `.modal-open` is already set by both `UIC.openModal` and `ERPModal.open`. A home button sitting over an open Save dialog is a bug, not a feature — one stray tap would discard a half-finished form. |
| **Accessibility** | Real `<a>` with `aria-label="الرئيسية"`, 44×44px minimum, visible focus ring, reachable by keyboard. It currently has `title` and `alt` but no `aria-label`. |
| **Print** | `@media print { #home-logo-fab { display: none } }`. |
| **Tokens** | Background, shadow and radius from the Phase 2 token layer — not the hardcoded `#fff` and `rgba(0,0,0,.2)` it uses today. |

**If the owner prefers it top-right after seeing it**, that is a one-line change in the same rule —
but it then needs an offset clearing the 56px topbar, and it will overlap the company logo on the
23 pages whose topbar is densest.

**Redundancy to review, not to fix here.** The topbar system logo
([UI_Components.html:1106](UI_Components.html#L1106)) already links home, so after 3.8 there are two
home affordances on every page. Both are cheap; keep both for now and let the owner decide once they
can see them together. Note it in the results document.

**On 3.4.** `ERPFlow` currently auto-wires itself to every `a[href*="?action="]` click, so on the 3
pages that include it, two overlays fire on navigation. Consolidation removes that.

**Verification:** `ui_check.js`; harness renders the sprite, every icon at 16/20/24px in both themes.
**Visual checklist:** icons are single-colour line glyphs matching the text colour, identical on
Windows and Android; row actions are a quiet kebab, not 50 coloured pills; one loading overlay style
everywhere; an empty list shows an explanation and a Create button; **the home button floats in the
bottom corner of every page, does not touch the topbar, disappears while a dialog is open, and
returns you to the main dashboard in one click.**
**Rollback:** 7 commits.
**Gate:** none — proceeds on Phase 2 sign-off.

---

## Phase 4 — Control panel and list view

**Objective:** the productivity jump. This is the largest piece of work in the programme and the one
that most changes how the app is used.

### 4.1 — `UIC.controlPanel(containerId, opts)` — new shared component

Rendered by `UIC.appShell` between the topbar and `<main>`, so **all 53 list pages get it in one
change**:

- **Clickable breadcrumb** — derived from the registry, replacing the hand-typed string on every page
  ([Company_TopLight_Products.html:41](Company_TopLight_Products.html#L41)).
- **Record pager** `◀ 4 / 137 ▶` when a record is open.
- **Search with facets** — typed text becomes a removable chip; chips combine with AND; field-targeted
  search (`العميل: أحمد`).
- **Filters / Group By / Favourites** dropdowns.
- **Primary action slot** — replaces each page's ad-hoc right-aligned button div, so placement stops
  varying page to page.

### 4.2 — Steps

| # | Finding | Change | Files |
|---|---|---|---|
| 4.1 | **U-13** | `UIC.controlPanel` + integration into `UIC.appShell`; page `breadcrumb:` string keeps working | [UI_Components.html:1117](UI_Components.html#L1117) |
| 4.2 | **U-14** | Add optional `group:` to registry page entries; derive menus from the registry; delete the two hand-written Nav files | 3 registries, 2 Nav files |
| 4.3 | **U-13** | Search facets over `st.filtered` — client-side, no server change | [UI_Components.html:417](UI_Components.html#L417) |
| 4.4 | **U-18** | Group-by rows (collapsible) with subtotals + a column footer with aggregates | [UI_Components.html:189](UI_Components.html#L189) |
| 4.5 | **U-19** | Optional-columns dropdown; column widths and visibility remembered in `localStorage` per page | [UI_Components.html:189](UI_Components.html#L189) |
| 4.6 | **U-17** | Checkbox column, select-all, and a batch-action bar — **read-only actions only in this pass** (export selection, print selection) | [UI_Components.html:189](UI_Components.html#L189) |
| 4.7 | **U-23** | Skeleton rows on list load; inline progress bar on refresh; the blocking overlay is reserved for saves | [UI_Components.html:566](UI_Components.html#L566) |
| 4.8 | **U-39** | Mobile card fallback below 768px — priority columns become a stacked card, the rest fold behind "المزيد" | [UI_Components.html:1358](UI_Components.html#L1358) |
| 4.9 | **U-16** | Wire the existing `SESSION.saveCurrentView` into the Favourites dropdown (uses `ERP_User_Views.layout_json` — **no schema change**) | [Client_Helpers.html](Client_Helpers.html) |

**Rollout:** the control panel is **opt-in per page** via `UIC.appShell({controlPanel: {...}})`. Pages
that don't pass it render exactly as today. That is what makes this phase safe: I convert pages in
batches (one commit per company, list pages first), and any page can be left behind if it turns out
to be awkward.

> **GATE D-5 — before step 4.6.** Batch **writes** (approve many, delete many) are out of scope in
> this pass; only export and print operate on a selection. *My recommendation:* keep it that way for
> now — batch writes touch the save paths the performance run identified as the sharpest edge, and
> they deserve their own phase with their own testing. Tell me if you want them in.

**Performance note.** Group-by, aggregates and facets all operate on rows already loaded client-side
(`st.rows` / `st.filtered`), so they add **zero** server calls. The chunked renderer and the 50-row
pager are preserved. `ui_check.js` will report DOM-node counts per rendered table before and after so
we can prove no regression.

**Verification:** `ui_check.js` + harness with a synthetic 500-row dataset; every list page still
renders, exports, prints and saves.
**Visual checklist:** breadcrumb segments are clickable; typing in search produces removable chips;
Group By produces collapsible subtotal rows; selecting rows raises an action bar; loading shows ghost
rows, not a grey scrim; on a narrow window the table becomes cards.
**Rollback:** ~9 commits plus per-company conversion commits. Reverting the `appShell` commit turns
the control panel off everywhere at once.
**Gate:** your sign-off after the first company is converted, before the other two.

---

## Phase 5 — Form view

**Objective:** make record editing feel like Odoo's form view. Higher risk than Phase 4 because it
touches save paths.

| # | Finding | Change | Files |
|---|---|---|---|
| 5.1 | **U-26** | Dirty tracking + `beforeunload` guard + a styled "discard changes?" dialog on in-app navigation. **Highest-value item in this phase** — today a half-finished multi-line invoice is lost silently | [UI_Components.html](UI_Components.html) |
| 5.2 | **U-28** | `UIC.confirm(...)` promise-returning styled dialog, red destructive variant naming the record; replace the 34 `confirm()` + 10 `alert()` call sites | [UI_Components.html:998](UI_Components.html#L998) + ~30 pages |
| 5.3 | **U-27** | Validation engine: type/range/pattern/cross-field rules, `blur`-time feedback, errors anchored to the field (and to the *line* in line-item tables) instead of a 3-second toast | [UI_Components.html:960](UI_Components.html#L960) |
| 5.4 | **U-29** | `UIC.statusbar(stages, current)` — the clickable workflow bar, wired first to `approval_status` on sales | [UI_Components.html:46](UI_Components.html#L46) + sales pages |
| 5.5 | **U-29** | `UIC.smartButtons([...])` — related-record counts, replacing 37 `window.open()` new-tab jumps | [UI_Components.html](UI_Components.html) + ~15 pages |
| 5.6 | **U-29** | `UIC.notebook(tabs)` — one tab component with `role="tablist"` and keyboard support; retire the 4 hand-rolled versions | [UI_Components.html](UI_Components.html) + 4 pages |
| 5.7 | **U-29** | Promote `UIC.HistorySide` into a proper chatter and wire it into every record form (data already in `ERP_Record_History`) | [UI_Components.html:1773](UI_Components.html#L1773) |
| 5.8 | **U-25** | Document the rule — *modal for simple records, full-page form for documents with line items* — and convert the pages on the wrong side of it | ~8 pages |

**On 5.5.** Smart buttons need per-record counts. Some are derivable from data already loaded; some
would need a new read endpoint. I will implement only the ones that need **no new server call** in
this phase, and list the rest as a proposal — consistent with the "no unnecessary server work" line
the performance run drew.

> **GATE D-6 — inline list editing.** Not in this plan. *My recommendation: leave it out.* It is the
> highest-risk item in the investigation, every save is a server round-trip, and the modal form
> already works. Say so if you disagree and I'll cost it as a separate phase.

**Verification:** `ui_check.js`; harness form gallery; **every save path manually walked** in the
harness with a stubbed `API.call` that records the payload — I will diff the payloads before and
after to prove no save changed shape.
**Visual checklist:** editing a form then navigating warns you; delete asks in an app-styled dialog
naming the record; an invalid invoice line highlights *that line*; sales invoices show a stage bar;
the record's history panel opens beside the form.
**Rollback:** ~8 commits; 5.1 and 5.2 are independent of the rest.
**Gate:** your sign-off after 5.1–5.3 (the safety items) before the structural ones.

---

## Phase 6 — Accessibility

| # | Finding | Change |
|---|---|---|
| 6.1 | **U-31** | Focus trap + focus restore + Escape close on `UIC.openModal` |
| 6.2 | **U-31** | Full ARIA on the combo (`role="combobox"`, `aria-expanded`, `aria-activedescendant`) |
| 6.3 | **U-31** | `scope="col"` on table headers; `aria-expanded` / `aria-haspopup` on all dropdowns |
| 6.4 | **U-31** | Fix the 74 `<label>` elements without `for=` in hand-written forms |
| 6.5 | **U-33** | Focusable, keyboard-activatable table rows; skip-link; `Alt+S` save / `Alt+N` new / `Esc` cancel |
| 6.6 | **U-32** | Raise the remaining 10–11px text; contrast audit report against the Phase 2 palette |

**Verification:** `ui_check.js` extended with an ARIA-coverage check; keyboard-only walkthrough of
list → open record → edit → save → close, in the harness.
**Gate:** none.

---

## Phase 7 — Documents and print

**Objective:** deliver the second half of D-2 — brand colour **in printing** — and make printed output
actually correct. Can start any time after Phase 2.

| # | Finding | Change |
|---|---|---|
| 7.1 | **U-34** | `ERP_Print.html` shared partial: `@page` size + margins, `thead { display: table-header-group }` so headers repeat across pages, `break-inside: avoid` on totals and signature blocks |
| 7.2 | **U-34** | A print palette: brand colour on the document header rule, title and totals row; white backgrounds, grey borders elsewhere. Replaces the current blanket `print-color-adjust: exact` that prints solid black/green header bars ([03_Security.js:851](03_Security.js#L851), [:920](03_Security.js#L920)) |
| 7.3 | **U-34** | `UIC.document({header, meta, lines, totals, footer})` — one component for the 16 print pages, retiring 22 copies of `.inv-table` |
| 7.4 | — | Convert the print pages, one company at a time |

**Visual checklist:** print-preview a two-page invoice — column headers repeat on page 2, the totals
block doesn't split, the brand colour appears on the header rule and totals only, and the page isn't
a wall of toner.
**Gate:** none.

---

## Phase 8 — Dark mode, density, preferences

**Depends on Phase 2** — doing this before the hardcoded-colour sweep would give a half-dark UI with
137 light-mode colours punched through it.

| # | Finding | Change |
|---|---|---|
| 8.1 | **U-12** | Dark token block under `@media (prefers-color-scheme: dark)` + an explicit `[data-theme]` override so the user's choice wins |
| 8.2 | **U-41** | Density toggle (compact / comfortable) driving the spacing scale |
| 8.3 | **U-41** | A preferences panel in the user menu: theme, density, default page size, remembered sort — all `localStorage`, **no schema change** |

---

## Phase 9 — Dashboards and analytics

| # | Finding | Change |
|---|---|---|
| 9.1 | **U-37** | Build a real ValleyFoods dashboard — today it is a welcome card with no KPIs ([Company_ValleyFoods_Dashboard.html](Company_ValleyFoods_Dashboard.html)) |
| 9.2 | **U-37** | Shared chart defaults reading the theme tokens, replacing the hardcoded `#111111` and 9-colour palette |
| 9.3 | **U-37** | Lazy-load Chart.js the way `API.ensureXlsx` lazy-loads the Excel library |
| 9.4 | **U-37** | Drill-down: stat cards and chart segments link into a pre-filtered list view (needs Phase 4) |
| 9.5 | **U-38** | Main dashboard: pending approvals, recent records, "continue where you left off" |

**Gate:** 9.1 needs your input on *which* KPIs matter to ValleyFoods. I will not invent them.

---

## Phase 10 — Dead code, hygiene, final docs

| # | Finding | Change |
|---|---|---|
| 10.1 | **U-35** | Harvest the useful patterns from `ERP_DataTable_JS.html` (sticky header, sort arrows, kebab, pending-row state), then delete both dead files — 42 KB, included by zero pages |
| 10.2 | **U-35** | Correct the stale comment at [Code.js:458](Code.js#L458) that still names them as live |
| 10.3 | **U-08** | Final sweep of page-local `<style>` blocks now that shared components cover their cases |
| 10.4 | — | Step 2.8 if D-4 was not answered in time |
| 10.5 | — | `UI_UX_RESULTS.md` — what changed per phase with commit hashes, what was skipped and why, every assumption, and the visual-verification checklist for your first push |

> **GATE D-8.** *My recommendation: harvest, then delete.* Phases 1.3, 1.5 and 3.3 all take patterns
> from the dead engine, so deletion should come after them, not before. `src_html/` (a stale 45-file
> snapshot, already excluded from deploy) I would **leave alone** and merely report.

---

## Consolidated risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **No browser verification until you push** | Certain | High | Phase 0 preview harness + static checks + per-phase visual checklists |
| R2 | Phase 2's colour sweep changes something that was deliberately non-themed | Med | Med | Mapping table reviewed before applying; one commit per company |
| R3 | Phase 1.1 (RTL fix) reveals layout bugs hidden by the wrong direction | High | Low | Expected and budgeted as step 3.7; I list them rather than fix silently |
| R4 | Phase 4 regresses the performance work | Low | High | Client-side only, zero new server calls; DOM-node counts reported before/after |
| R5 | Phase 5 changes a save payload | Low | **Critical** | Stubbed-`API.call` payload diffing before and after, every save path |
| R6 | Step 2.8 changes displayed numbers | Med | High | Gated on D-4; deferred to Phase 10 if unanswered |
| R7 | Two programmes on one branch make revert hard | Med | Med | Phase 0 opens `ui/odoo-parity` (§0.3) |
| R8 | A phase grows past its estimate | Med | Low | Per-company, per-module commits mean partial delivery is always shippable |
| R9 | **Cost stripping wipes costing data** - a user without the grant saves and writes empty `cost_unit` | **High if ordered wrong** | **Critical** | Step 2B.1 (U-47) lands *before* 2B.5. Save resolves cost server-side and ignores the client entirely |
| R10 | Registering `valley_cost_view` hides costs from everyone, including the owner, until the matrix rows exist | Certain | High | Fail-open guard in 2B.0: no grants anywhere on that page id means everyone is authorised. Recorded in the owner register |
| R11 | Phase 2B edits collide with the performance programme in `Company_ValleyFoods_Actions.js` | Med | High | Ownership handed over explicitly (0.4). Check `git log`/`git status` on the path first; keep edits additive and narrow |
| R12 | The modal's sum tolerance drifts from the server's, so it accepts what the save rejects | Med | Med | Mirror the server comparison exactly - same 0.01 tolerance, same 3-decimal rounding - and reference [Company_ValleyFoods_Actions.js:3972](Company_ValleyFoods_Actions.js#L3972) in a comment |
| R14 | A component is built and checked at desktop width only, and breaks on tablet | **High without a guard** | Med | §0.4 is an acceptance condition on every phase; the Phase 0 harness renders all five tiers at once; every phase checklist names the widths checked |
| R13 | Running Phase 2B early strands the batch modal on an unfinished modal component | Low | Low | **Corrected 2026-09-06.** Most of Phases 3/5/6 is *inherited*, not rework: build the batch modal on `UIC.openModal` and it picks up the drag handle (3.6), focus trap and Escape (6.1) for free. The one genuine dependency — dialog width — is pulled forward as step **2.9**. Rework is then approximately nil |

---

## What I need from you to start

**To begin Phase 0 — nothing.** I can start now.

**Before Phase 2 writes code (the big visual change):**
1. Sign off the palette in §2.1, or tell me what to change.
2. Confirm **Cairo** as the unified font, or name another.
3. Confirm the branch decision in §0.3.

**Before their gates, whenever you're ready:** D-4 (numbers/currency — blocks step 2.8),
D-5 (batch writes — blocks step 4.6), D-6 (inline editing — my recommendation is *out*),
D-8 (dead code — my recommendation is *harvest then delete*).

**D-7 (navigation speed)** I've left out of the plan entirely. Full-reload navigation is a platform
constraint; a true SPA router inside `HtmlService` would be an XL rewrite of `Code.js` routing for a
benefit the Phase 4 skeleton loading largely delivers anyway. Say the word if you want it costed.

---

*Companion documents: [UI_UX_INVESTIGATION.md](UI_UX_INVESTIGATION.md) (findings and evidence),
[PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md) (the in-flight performance programme this must not
regress).*
