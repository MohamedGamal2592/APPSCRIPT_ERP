# UI / UX Investigation — Multi-Company ERP on Google Apps Script

**Date:** 2026-09-06
**Branch inspected:** `perf/optimization-run` (working tree clean, nothing deployed)
**Scope:** design, interaction and experience layer only. No database schema, no business logic.
**Status:** investigation for approval. **No code has been changed.** The execution plan comes after
you approve this document.

---

## 0. How to read this

Every finding has an ID (`U-nn`), a **verified** evidence pointer (`file:line`), an impact rating, an
effort estimate and a risk rating. Findings are grouped A–M. Section 8 is the Odoo 17 parity matrix.
Section 10 is the list of decisions I need from you before any plan is written.

- **Impact** — how much the user's day improves: `High` / `Med` / `Low`.
- **Effort** — `S` (< half a day), `M` (1–2 days), `L` (3+ days), `XL` (multi-week).
- **Risk** — chance of breaking production behaviour: `Low` / `Med` / `High`.

Everything below was measured against the actual files in `d:\Work\Script`, not inferred. Counts are
in Appendix A so you can re-run them.

### Ground rules I worked under

1. **No schema changes.** Nothing here adds, renames, reorders or removes a column in any business
   table. Where a feature would normally want a new column (saved views, user density preference), I
   propose `localStorage` or an existing system sheet instead, and flag it.
2. **This is production.** Every proposal is phrased so it can ship behind a per-page or per-company
   switch, and every phase is independently revertible.
3. **You decide.** Section 10 lists the choices that are yours, not mine. I have made no design
   decisions unilaterally.

---

## 1. Executive summary

The system is a **multi-page application** (MPA): every navigation is a full `doGet` round-trip that
re-renders a complete HTML document inside the `HtmlService` sandbox iframe
([Code.js:12](Code.js#L12), [Code.js:83-114](Code.js#L83-L114)). There are 89 routes across three
companies and 85 page templates. Three shared files —
[CSS_Tokens.html](CSS_Tokens.html), [UI_Components.html](UI_Components.html),
[Client_Helpers.html](Client_Helpers.html) — are included by 82 of them and constitute the entire
design system.

**What is genuinely good already:**

- A real component library exists (`UIC.*`) with buttons, tables, modals, toasts, combos, tiles, an
  app shell and a mobile drawer. It is used consistently: 53 pages render lists through
  `UIC.dataTable`, 49 use `UIC.openModal` for record forms.
- Mobile is taken seriously in the *shell*: 48px tap targets, safe-area insets, a `--vh` polyfill,
  keyboard-height detection, swipe-to-close drawer, swipe-to-dismiss toasts, `inputmode`/
  `enterkeyhint` on inputs.
- A colour/radius/shadow token layer exists and per-company theming already overrides it centrally
  ([03_Security.js:703](03_Security.js#L703)).
- Loading states, empty states, error banners and a client-side error reporter all exist.

**Where it is far from Odoo 17:**

The gap is not "it looks dated". The gap is **structural**. Odoo 17's productivity comes from a small
number of interaction patterns that this app does not have at all:

| Missing pattern | Present here? |
|---|---|
| Control panel (breadcrumb + view switcher + search facets + filter/group-by/favourites) | No |
| Multi-record selection with a batch-action bar | No (11 pages have checkboxes, 0 have batch actions) |
| Group-by rows with subtotals, and column footer aggregates | No |
| Form statusbar (workflow stages) and smart buttons | No |
| Chatter / activity log / attachments on a record | Partially — `UIC.HistorySide` exists but is wired into 2 pages |
| Unsaved-changes protection | No (0 `beforeunload` guards) |
| Keyboard shortcuts / command palette | No (0 handlers) |
| Dark mode | No (0 `prefers-color-scheme` rules) |
| Inline (in-list) editing | No |
| Column show/hide, reorder, resize | No |
| Optimistic/skeleton loading instead of a blocking overlay | 1 page of 85 |

And there are **five defects in the shared layer that affect nearly every page** (U-01 … U-05 below).
Those are cheap to fix and I would want them fixed before any cosmetic work, because they are the
things a user actually bumps into.

**My recommendation in one line:** fix the five shared-layer defects first (a day's work, very low
risk), then rebuild the *control panel* and *list view* as the single highest-leverage change, then
the form view. Cosmetics last, not first.

---

## 2. The Odoo 17 yardstick — what we are actually benchmarking

To avoid "make it look like Odoo" being a vague target, here is the specific set of things Odoo 17
does that we are measuring against. I have marked each with whether it is achievable on Apps Script.

**Visual language**
- Neutral near-white canvas (`#F9F9F9`), white sheets, one restrained accent colour used only for
  primary actions and active state. Chrome is almost invisible; data is the only thing with contrast.
- 1px hairline borders, generous whitespace, minimal shadows.
- A single icon set (Font Awesome), never emoji.
- A tuned type scale — 13px body, 12px meta, tabular numerals for money.
- Light and dark themes.

**Layout**
- Persistent top bar: apps menu, breadcrumb, systray (activities, messages, user).
- **Control panel** under it: breadcrumb + record pager (`◀ 4 / 137 ▶`), view switcher, a search
  input that turns typed text into removable *facets*, and Filters / Group By / Favourites dropdowns.
- Content area = the current view.

**List view**
- Sticky header, sortable columns with a visible indicator, optional-column dropdown, resizable
  columns, checkbox column, select-all-across-pages, batch-action bar, group-by rows that collapse
  and carry subtotals, a column footer with aggregates, inline edit, drag-to-reorder, record count
  and pager.

**Form view**
- Statusbar of workflow stages top-right, "smart buttons" with live counts, a sheet with a big title
  field, a notebook of tabs at the bottom, and the chatter (messages, internal notes, followers,
  activities, attachments) on the side.
- Dirty-state indicator with explicit save/discard; navigation is blocked while dirty.

**Feedback**
- Non-blocking toasts, skeleton "ghost" rows while loading, inline field errors, confirmation
  dialogs styled like the app (never `window.confirm`).

**Achievability on Apps Script / HtmlService**

| Odoo capability | Achievable here | Note |
|---|---|---|
| Visual language (colour, type, spacing, icons, dark mode) | **Yes, fully** | Pure CSS in the shared layer |
| Control panel, search facets, filters, group-by, favourites | **Yes, fully** | Client-side over already-loaded rows |
| List view features (sticky, batch, aggregates, optional cols) | **Yes, fully** | Client-side |
| Form statusbar, smart buttons, notebook tabs, dirty guard | **Yes, fully** | Client-side |
| Chatter | **Yes** — the data already exists in `ERP_Record_History` | `UIC.HistorySide` is the seed |
| Kanban / calendar / pivot views | **Yes**, but each is real work | Client-side over loaded rows |
| Inline list editing | **Yes**, but risky | Every save path is a server round-trip; needs care |
| SPA-speed navigation (no white flash between pages) | **Partially** | See U-30; the iframe reload is a platform constraint |
| Command palette (Ctrl+K) | **Partially** | Keyboard events work; but it can only navigate, not search records across modules, without new endpoints |

Nothing in the visual and interaction layer is blocked by the platform. Only *navigation speed* is.

---

## 3. Group A — Shared-layer defects (fix these first)

These five are not opinions. They are verifiable defects in code that 82 pages include.

---

### U-01 — Row action menus and in-cell dropdowns are clipped by the table wrapper
**Impact: High · Effort: S · Risk: Low**

`.table-wrap` sets `overflow-x: auto` ([UI_Components.html:1358](UI_Components.html#L1358)). Per CSS
spec, when one axis is not `visible`, the other computes to `auto` — so the wrapper becomes a
clipping box on **both** axes.

Every row's action menu is `position: absolute; top: 100%` inside a `<td>` inside that wrapper
([UI_Components.html:22-33](UI_Components.html#L22-L33)), and so is the searchable-combo dropdown
([UI_Components.html:1411](UI_Components.html#L1411)). For rows in the lower part of any table the
menu is cut off at the table's bottom edge.

This affects every list in the app — `UIC.actionBtns` delegates to `UIC.actionDropdown`
([UI_Components.html:17-20](UI_Components.html#L17-L20)), so *all* row actions go through it.

**Fix:** render the menu in a portal at `document.body` with fixed positioning, or switch the wrapper
to a modern `overflow-clip-margin` / popover approach. ~40 lines in one file.

---

### U-02 — Modals, toasts and spinners render left-to-right on 56 of 81 pages
**Impact: High · Effort: S · Risk: Low**

`CSS_Tokens.html` aligns text with `[dir="rtl"] body { text-align: right; }`
([CSS_Tokens.html:153](CSS_Tokens.html#L153)) — a selector that only matches when `<html>` carries
`dir="rtl"`.

Only **23 of 81** page templates put `dir="rtl"` on `<html>` (all ValleyFoods pages plus
`Company_TopLight_Cash.html`). The other **56** set it on an inner `<div>` only, e.g.
[Company_TopLight_Products.html:15](Company_TopLight_Products.html#L15).

`UIC.openModal` ([UI_Components.html:998](UI_Components.html#L998)), `UIC.toast`
([UI_Components.html:1024](UI_Components.html#L1024)) and `UI.showSpinner`
([Client_Helpers.html:160](Client_Helpers.html#L160)) all append to `document.body` — **outside**
that inner div. On those 56 pages the modal is laid out LTR: the header title sits on the left with
the close button on the right, and the footer's `justify-content: flex-end` puts Cancel/Save on the
right instead of the left. Arabic text still shapes correctly (bidi handles that), but the *layout*
is mirrored relative to the 23 pages that are correct.

Since `UIC.openModal` is the primary form surface for 49 pages, this is the single most-seen
inconsistency in the product.

**Fix:** add `dir="rtl"` to `<html>` in the 56 templates (mechanical), or set
`document.documentElement.dir = 'rtl'` once in `Client_Helpers.html`. The second is one line and
fixes all 56 at once. **Recommended.**

---

### U-03 — Sorting has no visual indicator, and it destroys the original row order
**Impact: High · Effort: S · Risk: Low**

`UIC.initTableSort` ([UI_Components.html:641](UI_Components.html#L641)) sets `data-asc` on the clicked
`<th>` (line 692) — but there is **no CSS rule anywhere for `th[data-asc]`**. The user gets no arrow,
no highlight, nothing. Combined with `th { cursor: pointer }` being applied to *every* header
(including the "إجراءات" actions column, which is meaningless to sort), the affordance is misleading
in both directions.

Worse, the sort writes back in place: `for (let i = 0; i < decorated.length; i++) list[i] = decorated[i].r;`
mutates `st.filtered` / `st.rows`. The original order is destroyed on first click and cannot be
restored without a reload. There is also no `aria-sort` anywhere in the codebase.

**Fix:** keep an untouched `originalRows` array, add asc/desc/none tri-state with a chevron and
`aria-sort`, and skip non-sortable columns.

---

### U-04 — The `.num` class is emitted but only styled for two of the three companies
**Impact: Med · Effort: S · Risk: Low**

`UIC._dtRowHtml` writes `class="num"` on every numeric and money cell
([UI_Components.html:272](UI_Components.html#L272)). There is **no `.num` rule** in `CSS_Tokens.html`,
`UI_Components.html` or `Client_Helpers.html`.

`.num` is defined only inside the two bespoke company themes —
[03_Security.js:809](03_Security.js#L809) (TopLight) and
[03_Security.js:896](03_Security.js#L896) (TopChemical) — as
`font-family: mono; direction: ltr; text-align: left; font-variant-numeric: tabular-nums`.

**Consequence:** every ValleyFoods table, plus every company that uses the generic
`getCompanyThemeCSS_` path, renders money and quantities in the proportional UI font, not right-
aligned, not tabular. Columns of figures do not line up. In an ERP that is a legibility problem, not
a cosmetic one.

**Fix:** move `.num` into the shared stylesheet. One rule.

---

### U-05 — No sticky table header
**Impact: Med · Effort: S · Risk: Low**

Pages are paginated at 50 rows ([UI_Components.html:187](UI_Components.html#L187)). Scrolling a
50-row table loses the column headers entirely — the only `position: sticky` rules in the shared
layer are the topbar and the modal header ([UI_Components.html:1453, 1536](UI_Components.html#L1453)).

Ironically the *dead* table engine already had it: `.erp-table thead th { position: sticky; top: 0 }`
in [ERP_DataTable.html](ERP_DataTable.html) — a file included by **zero** pages (see U-35).

**Fix:** one rule, offset by `--topbar-h`.

---

## 4. Group B — Design system and visual language

### U-06 — The typography and spacing scales are defined and then never used
**Impact: High · Effort: M · Risk: Low**

`CSS_Tokens.html` defines a full fluid type scale (`--text-xs` … `--text-2xl`,
[CSS_Tokens.html:90](CSS_Tokens.html#L90)) and a fluid spacing scale (`--space-xs` … `--space-lg`,
[CSS_Tokens.html:98](CSS_Tokens.html#L98)).

Measured usage:

| Token group | Uses in the 85 page templates | Uses in `UI_Components.html` |
|---|---|---|
| `--text-xs` … `--text-2xl` | **0** | **0** |
| `--space-xs` … `--space-lg` | **1** | **0** |

Against that: **339** hardcoded `font-size: NNpx` declarations and **320** hardcoded px
`padding`/`margin` declarations in the page templates, plus 47 more hardcoded font sizes inside
`UI_Components.html` itself.

The most common sizes are 13px (74), 11px (55), 12px (49), 14px (39), **10px (12)**. 10–11px Arabic
text is below a comfortable reading threshold; Arabic script needs more x-height than Latin at the
same nominal size.

**Consequence:** there is no type scale. There is a habit. Changing text size app-wide is impossible;
a density preference is impossible; the responsive scale does nothing.

---

### U-07 — 137 distinct hardcoded hex colours bypass the token layer
**Impact: High · Effort: M · Risk: Low**

Across the page templates: **550 hardcoded hex colour literals, 137 distinct values**, against 379
total `var(--token)` references.

Some are simply duplicates of tokens (`#dc2626` = `--danger`, 44 uses; `#6b7280` = `--text-muted`, 28
uses). Others are *foreign palettes leaked in by copy-paste*:

- `#0d6efd` and `#dc3545` — Bootstrap 5 — in
  [Company_ValleyFoods_TestData.html:13-18](Company_ValleyFoods_TestData.html#L13-L18) and
  [Company_ValleyFoods_MonthlySalaries.html:112](Company_ValleyFoods_MonthlySalaries.html#L112).
- `#875A7B` — **Odoo's own purple** — hardcoded into a page-local spinner at
  [Company_ValleyFoods_MfgOrders.html:61](Company_ValleyFoods_MfgOrders.html#L61).

**Consequence:** the per-company theme switch (`getCompanyThemeCSS_`) only recolours the parts of the
UI that use tokens. Everything hardcoded stays the same colour regardless of which company you are
in. This is why the app does not feel like one product with three skins.

---

### U-08 — Page-local `<style>` blocks are a shadow design system
**Impact: Med · Effort: M · Risk: Low**

**36 of 85** pages carry their own `<style>` block, **681 lines** in total. The classes they define
overlap heavily and inconsistently:

| Locally redefined class | Pages defining it |
|---|---|
| `.inv-table` | 22 |
| `.acard` | 15 |
| `.table` (re-styling the shared class!) | 15 |
| `.cost-table` | 10 |
| `.chart-card` | 9 |
| `.kpi-card` / `.kpi-value` / `.kpi-label` | 6 / 7 / 4 |

Fifteen pages re-style `.table`, the shared table class — so the same component looks different
depending on which page you are on.

Button variants used but **not defined** in the shared layer: `btn-ghost` (5 uses; defined locally in
[Client_Helpers.html:492](Client_Helpers.html#L492) *and* redefined differently in
[Company_ValleyFoods_MfgOrderView.html:39](Company_ValleyFoods_MfgOrderView.html#L39)), plus
`btn-green`, `btn-red`, `btn-success`, `btn-group` — all local one-offs. A parallel `vf-btn` namespace
exists too.

---

### U-09 — There is no icon system; icons are emoji, HTML entities and text, mixed
**Impact: Med · Effort: M · Risk: Low**

Three incompatible conventions coexist:

1. **Raw emoji** — `📥 Excel`, `🖨️ طباعة` in the table toolbar
   ([UI_Components.html:238-243](UI_Components.html#L238-L243)); 📎 (15), ⚠ (15), 🖨 (14), ✏ (11),
   🗑 (10), 💾 (10), 🧪 (8), 👁 (7) across pages.
2. **HTML numeric entities** — `&#128200;` (chart), `&#127970;` (office), `&#128272;` (key) in
   [0_ERP_Management.html:34-41](0_ERP_Management.html#L34-L41) and the dashboards.
3. **Plain text** — "إجراءات / Actions ▾", "دخول ←", "← عودة".

Emoji render as full-colour glyphs whose exact appearance is decided by the user's OS. They cannot be
recoloured with the theme, cannot be sized reliably, sit on a different baseline from the text, and
look conspicuously unlike Odoo's monochrome line icons. Rendering also differs between Windows,
Android and iOS — the same button is a different picture on different devices.

**Fix options:** an inline SVG sprite in the shared layer (no CDN, ~4 KB for 40 icons, full theme
control) — this is what I would recommend — or a self-hosted icon font. Both are compatible with the
"no new CDN dependency" constraint.

---

### U-10 — Company theming paints the entire page canvas in a saturated brand colour
**Impact: High · Effort: S–M · Risk: Med (visual identity — your call)**

- TopLight: `body { background-color: #fbbf24; }` — saturated amber
  ([03_Security.js:809](03_Security.js#L809)), plus `--border-color: #111111` and
  `border: 2px solid #111111` on every card, table, modal and tile.
- TopChemical: `body { background-color: #16a34a; }` — saturated green
  ([03_Security.js:896](03_Security.js#L896)), with 2px green borders throughout.

Odoo 17 does the opposite: a near-neutral canvas, white sheets, hairline borders, and the brand
colour reserved for primary buttons and active state. Saturated full-canvas colour behind dense
numeric tables is fatiguing over an 8-hour shift, and the 2px black/green borders add a second heavy
grid on top of the table's own.

The generic path is different again: `getCompanyThemeCSS_` maps a company to one of five palettes
([03_Security.js:703](03_Security.js#L703)) and produces a *neutral* `--bg-primary: #F9FAFB`. So
ValleyFoods already looks like Odoo's canvas while the other two do not. **The three companies do not
share a visual system.**

**This is a brand decision, not a technical one — see D-2 in section 10.**

---

### U-11 — Arabic typography: two different fonts depending on company, and the fallback is poor
**Impact: Med · Effort: S · Risk: Low**

- Default: `--font-sans: 'Segoe UI', Tahoma, sans-serif`
  ([CSS_Tokens.html:40](CSS_Tokens.html#L40)). On Windows, Arabic falls through to Segoe UI's Arabic
  coverage; on Android and iOS it lands on Tahoma or a system default. Tahoma's Arabic is a 1999
  screen face with tight, unbalanced letterforms.
- TopLight and TopChemical load **Cairo** from Google Fonts
  ([03_Security.js:772, 859](03_Security.js#L772)) and set `--font-sans: 'Cairo'`.
- ValleyFoods gets neither.

So the same product uses two different Arabic typefaces depending on which company you are logged
into, and one of the three has no webfont at all. There is also no `font-display` guidance and no
preloading of the Arabic subset, so the two companies that *do* load Cairo get a flash of Tahoma
first.

**Fix:** one Arabic webfont for all three, subset to Arabic + Latin, `display: swap`, preloaded.
Cairo is a reasonable choice and is already in use; IBM Plex Sans Arabic and Noto Sans Arabic are the
other strong candidates.

---

### U-12 — No dark mode
**Impact: Med · Effort: M · Risk: Low**

Zero `prefers-color-scheme` rules in the entire codebase. Odoo 17 ships a dark theme. Because the
colour layer is already tokenised in `:root`, a dark theme is mostly a second token block — *provided*
U-07 (hardcoded colours) is fixed first. Doing it before U-07 would produce a half-dark UI with 137
light-mode colours punched through it.

**Dependency: U-07 must land first.**

---

## 5. Group C — Navigation and the application shell

### U-13 — There is no control panel
**Impact: High · Effort: L · Risk: Low**

`UIC.appShell` ([UI_Components.html:1117](UI_Components.html#L1117)) produces: topbar → optional
breadcrumb → `<main>`. That is the whole chrome.

Everything Odoo puts in the control panel is either missing or scattered into each page's own markup:

- The **breadcrumb is a plain string** — `breadcrumb: 'القمة لايت / المبيعات'`
  ([Company_TopLight_Products.html:41](Company_TopLight_Products.html#L41)). Not links. You cannot
  click back up a level. It is also hand-typed per page, so it drifts from the real hierarchy.
- **No record pager.** Opening a record gives no `◀ 4 / 137 ▶`; you must go back to the list.
- **No view switcher.** Each page has exactly one presentation.
- **Search is a bare input inside the table toolbar**
  ([UI_Components.html:231](UI_Components.html#L231)) with no facets, no field targeting, no history.
- **No Filters / Group By / Favourites.** Only 1 page in 85 uses the built-in `dateFilter` option.
- **Primary actions are ad-hoc.** Each page emits its own `<div style="display:flex;justify-content:flex-end;...">`
  with buttons — see [Company_TopLight_Products.html:94-97](Company_TopLight_Products.html#L94-L97).
  Position, spacing and order therefore vary page to page.

**This is the single highest-leverage change in the whole document.** A shared control panel would
give every one of the 53 list pages the same header, the same search, the same filters, and the same
action placement, in one change.

---

### U-14 — Two sources of truth for navigation
**Impact: Med · Effort: S · Risk: Low**

Menus are defined **twice**:

1. Server-side, in the registries — `Company_TopChemical_Registry.js` (31 pages),
   `Company_ValleyFoods_Registry.js` (29), `Company_TopLight_Registry.js` (21) — which produce
   `COMPANY_PAGES` and the flat topbar links via `buildCompanyNav_`
   ([UI_Components.html:1090](UI_Components.html#L1090)).
2. Client-side, in hand-written files — [Company_TopChemical_Nav.html](Company_TopChemical_Nav.html)
   (29 items in 5 groups) and [Company_ValleyFoods_Nav.html](Company_ValleyFoods_Nav.html) (23 items
   in 3 groups) — which produce the dropdown groups.

I cross-checked them: **no dead links today** (every menu action exists in its registry). But six
ValleyFoods routes are in the registry and unreachable from the menu (`vf_hr_salary`, `vf_hr_shifts`,
`vf_hr_status`, `vf_mfg_order`, `vf_kpi`, `vf_dashboard` — the last two are in the flat nav, the first
four appear to be orphans or detail pages).

TopLight has no `*_Nav.html` at all and uses 8 flat topbar links. So **the three companies navigate
differently**: TopLight = flat links, TopChemical/ValleyFoods = dropdown groups.

**Fix:** derive the groups from the registry (add an optional `group` field to the page entries —
this is *registry* metadata, not a business table, so it breaks no rule), and delete the two Nav
files.

---

### U-42 — The persistent home button exists but is switched off on every working page
**Impact: Med · Effort: S · Risk: Low · ⭐ Owner-requested**

`UIC.ensureHomeLogo` ([UI_Components.html:129](UI_Components.html#L129)) already builds a floating
home button — `#home-logo-fab`, a 44px circle carrying `UIC.SYSTEM_LOGO_URL`, fixed at
`top:10px; right:10px; z-index:9998`, linking to `?action=ERPDashboard` with the session token.

It is then **gated off** at line 134: it renders only on `ERPDashboard`, `login` and `setup`. The
comment gives the reasoning — company pages already carry a home-linking system logo inside the
topbar via `UIC.buildLogoMarkup` ([UI_Components.html:1106](UI_Components.html#L1106)).

**The owner wants it on every page.** Turning the gate off is one line, but two things must be
resolved first or it ships broken:

1. **It collides with the topbar.** The app is RTL, so `.topbar-left` — which holds the hamburger and
   both logos — renders on the **right**. A button fixed at `top:10px; right:10px` lands directly on
   top of it, on all 82 pages that use `UIC.appShell`.
2. **It floats over modals.** `z-index: 9998` is above the modal overlay (1000), the drawer (900) and
   the topbar (1000). With a dialog open the home button would sit over its header and close button
   — and one stray tap would navigate away from a half-finished form.

There is also a redundancy question: the topbar system logo already links home, so the two
affordances overlap. Not a problem, but worth a decision once both are visible together.

---

### U-15 — No global search, no command palette, no recents, no favourites
**Impact: Med · Effort: M–L · Risk: Low**

Zero `ctrlKey` / `altKey` / `metaKey` handlers exist in any page. To reach a page you open a dropdown
and read a list of up to 29 Arabic labels. Odoo 16+ gives you `Ctrl+K`.

A navigation-only command palette (fuzzy-match over the registry's page labels) is cheap and needs no
new server endpoint. Record-level search across modules would need new endpoints and is out of scope
for a first pass.

---

### U-16 — `SESSION.saveCurrentView` exists and is wired into 2 pages
**Impact: Low–Med · Effort: M · Risk: Low**

There is a saved-views feature — `SESSION.saveCurrentView`
([Client_Helpers.html](Client_Helpers.html)), a `user_views` route
([01_Registry.js:36](01_Registry.js#L36)), and an `ERP_User_Views` sheet already carrying
`layout_json` ([05_Admin.js:844](05_Admin.js#L844)). It is used by exactly **two** pages
(`Company_TopLight_Cash.html`, `Company_ValleyFoods_Cash.html`).

This is Odoo's "Favourites" already 80% built and 2% adopted. Once the control panel (U-13) exists,
wiring favourites into it is small — and it needs **no schema change**, because `ERP_User_Views`
already has a free-form `layout_json` column.

---

## 6. Group D — The list view

### U-17 — No multi-select, no batch actions
**Impact: High · Effort: M · Risk: Med**

11 pages contain checkboxes; **0** have any bulk action. Deleting or approving 20 invoices means 20
separate open→confirm→save cycles, each a full server round-trip.

Risk is Med because batch operations touch write paths. I would scope the first pass to **read-only**
batch actions (export selection, print selection) and treat batch *writes* as a separate decision.

---

### U-18 — No group-by and no aggregates
**Impact: High · Effort: M · Risk: Low**

An ERP list without subtotals is a spreadsheet you cannot pivot. There is no group-by anywhere, and
no column footer totals — so "what did we sell to this customer this month" requires exporting to
Excel. The `📥 Excel` button on every table
([UI_Components.html:239](UI_Components.html#L239)) is, in effect, the workaround for this missing
feature.

All rows are already loaded client-side (`st.filtered`, `st.rows`), so grouping and aggregation are
pure client work with no server change.

---

### U-19 — No optional columns, no resize, no reorder, no saved column layout
**Impact: Med · Effort: M · Risk: Low**

Columns are fixed per page in the `headers` array. Wide tables scroll horizontally
(`.table-wrap { overflow-x: auto }`) with `white-space: nowrap` on headers
([UI_Components.html:1368-1375](UI_Components.html#L1368-L1375)). On a phone that is a lot of
sideways scrolling with no way to hide the columns you do not need.

---

### U-20 — Every row carries a full primary-coloured action button
**Impact: Med · Effort: S · Risk: Low**

`UIC.actionBtns` → `UIC.actionDropdown` renders, per row, a `btn btn-primary` pill labelled
**"إجراءات / Actions ▾"** ([UI_Components.html:31](UI_Components.html#L31)).

Three problems:

1. **Visual noise.** 50 rows = 50 saturated brand-coloured pills, all with `--shadow-brand`. The
   accent colour, which should mark *the* primary action on the screen, marks 50 things.
2. **Bilingual label.** "إجراءات / Actions" is the only place in an otherwise fully-Arabic UI where
   English is mixed into a label.
3. **Inline handlers.** Each item carries inline `onmouseover` / `onmouseout` style mutations
   (line 29) and a random DOM id per row.

Odoo uses a subtle `⋮` kebab that reveals on row hover. The dead `ERP_DataTable.html` already has
exactly that (`.erp-kebab`), unused.

---

### U-21 — No inline editing
**Impact: Med · Effort: L · Risk: High**

Changing one field means opening a modal, editing, saving, and a full list reload. Odoo lets you
click a cell and tab across the row.

I rate the risk **High**: every write here is a server round-trip through `apiRouter_`, and the
previous performance run documented that save paths are the sharpest edge in this codebase. I would
not attempt inline editing until the control panel and form view are settled, and then only on
low-risk reference tables (products, parties) — never on invoices or stock.

---

### U-22 — Empty states are a grey box with one sentence
**Impact: Low–Med · Effort: S · Risk: Low**

`.empty-state` ([UI_Components.html:1379](UI_Components.html#L1379)) is 48px of padding, muted text,
and the string `'لا توجد بيانات'` (or a per-page override — 55 pages pass `emptyText`). No
illustration, no explanation of *why* it is empty, no call to action.

Odoo's empty states carry an illustration, a one-line explanation, and the primary "Create" button —
which matters most for a new user on a page they have never seen.

---

### U-23 — Loading is a full-screen blocking overlay, on 80 of 85 pages
**Impact: Med · Effort: M · Risk: Low**

`UI.showSpinner` ([Client_Helpers.html:160](Client_Helpers.html#L160)) puts a
`rgba(17,24,39,.4)` scrim over the whole viewport and rotates through a list of reassuring Arabic
messages every 2.5 s ("جاري التحميل…", "جاري حساب مؤشرات الأداء…", "لحظة…"). 80 of 85 pages call it.

The messages are a nice touch and I would keep them — but a full-screen scrim on **every** data fetch
means the UI is unusable for the whole duration of every operation, including ones that only refresh
part of the page.

A skeleton exists — `UIC.tableSkeleton` ([UI_Components.html:566](UI_Components.html#L566)) with a
proper shimmer — and is used by **1 page**.

**Fix:** skeleton rows for list loads, an inline progress bar under the control panel for refreshes,
and reserve the blocking overlay for genuine save operations where blocking is correct.

---

### U-24 — Four different loading-overlay implementations coexist
**Impact: Low · Effort: S · Risk: Low**

1. `UI.showSpinner` — [Client_Helpers.html:160](Client_Helpers.html#L160) — 80 pages.
2. `UIC.showPageLoading` — [UI_Components.html:112](UI_Components.html#L112) — used by `UIC.navTo`.
3. `ERPFlow.start` — [ERP_Flow.html](ERP_Flow.html) — **3 pages** include it; it also auto-wires
   itself to every `a[href*="?action="]` click, so on those 3 pages *two* overlays fire on navigation.
4. Page-local `showLoading` — [Company_ValleyFoods_MfgOrders.html:56](Company_ValleyFoods_MfgOrders.html#L56)
   and `MfgOrderView` — with its own hardcoded `#875A7B` spinner.

Each has different visuals, timing and z-index.

---

## 7. Group E — The form view

### U-25 — Two incompatible record-form patterns
**Impact: Med · Effort: M · Risk: Low**

- **Modal form** — 49 pages. `UIC.openModal` with a `<form>` built from `UIC.field` calls, e.g.
  [Company_TopLight_Products.html:120-148](Company_TopLight_Products.html#L120-L148).
- **Full-page form** — 6 pages. The list is replaced in place by a form and a `← عودة` button, e.g.
  [Company_TopLight_Sales.html:165-214](Company_TopLight_Sales.html#L165-L214).

Two pages do both. The split is not by complexity — some very simple records use the full-page form,
some multi-line documents use a modal.

The full-page form is the closer analogue to Odoo's form view (and is the right pattern for documents
with line items), but it has no breadcrumb integration, no record pager, no statusbar, and no dirty
guard.

---

### U-26 — No unsaved-changes protection anywhere
**Impact: High · Effort: S–M · Risk: Low**

**Zero** `beforeunload` handlers in the codebase. On the full-page sales form
([Company_TopLight_Sales.html](Company_TopLight_Sales.html)), clicking `← عودة` or any nav link
discards an in-progress multi-line invoice with no warning. On modal forms, clicking the overlay does
nothing (there is no outside-click handler on `UIC.openModal` at all), but the topbar is still live
behind it.

This is the finding most likely to have already cost someone real work.

---

### U-27 — Form validation is required-fields-only, and errors are announced by toast
**Impact: Med · Effort: M · Risk: Low**

`UIC._readForm` ([UI_Components.html:960](UI_Components.html#L960)) is the entire validation engine:
it walks `.form-field`s, checks `required` and emptiness, and writes `'هذا الحقل مطلوب'` into the
field's `.field-error` div. There is no type validation, no range, no cross-field rule, no format
check, and no async/server validation.

Pages therefore hand-roll their own rules and report them through **toasts** — see
`validateSalesForm` at
[Company_TopLight_Sales.html:348-369](Company_TopLight_Sales.html#L348-L369), which fires
`UIC.toast('الكمية تتجاوز الرصيد المتاح…', 'error')` and returns. The toast appears top-centre, auto-
dismisses after 3 s, and is **not anchored to the offending field**. On a 12-line invoice the user is
told a quantity is wrong but not which line.

Validation also only runs on submit — no `blur`-time feedback.

---

### U-28 — 34 native `confirm()` and 10 native `alert()` calls
**Impact: Med · Effort: S · Risk: Low**

Destructive actions use the browser's own dialog: **34** `confirm()` and **10** `alert()` across the
page templates. Inside the `HtmlService` sandbox these render as the browser's chrome-level dialog —
unstyled, LTR, in the browser's language, with generic "OK / Cancel" buttons that say nothing about
what is about to happen.

`ERPModal.open` ([ERP_Modal.html](ERP_Modal.html)) is a perfectly good styled dialog and is included
by 3 pages.

**Fix:** an `ERP.confirm(...)` promise-returning styled dialog in the shared layer, with a red
destructive variant naming the record; mechanical replacement of the 44 call sites.

---

### U-29 — No workflow statusbar, no smart buttons, no notebook tabs, no chatter
**Impact: High · Effort: L · Risk: Low**

**Statusbar.** Records have workflow state — `approval_status` on sales invoices, for instance
([Company_TopLight_Sales.html:88-94](Company_TopLight_Sales.html#L88-L94)). It is rendered as a plain
text cell in the list and nowhere at all on the form. `UIC.statusPill` exists
([UI_Components.html:46](UI_Components.html#L46)) and is used on 11 pages. Odoo's clickable stage bar
at the top-right of the form is the single clearest "where is this record in its life" affordance and
it is entirely absent.

**Smart buttons.** No form shows related-record counts (invoices for this customer, movements for
this product). Related data is reached by opening a *new browser tab* — `window.open(...)` appears
**37 times**, e.g. [Company_TopLight_Products.html:106-117](Company_TopLight_Products.html#L106-L117).
Odoo's smart buttons replace exactly this pattern.

**Notebook tabs.** 4 pages hand-roll tabs (`Company_ValleyFoods_MfgOrders`, `MfgOrderView`,
`HR_Emp`, `TopChemical_BudgetHR`) using `btn btn-primary` / `btn btn-outline` pairs and
`style.display` toggling ([Company_ValleyFoods_MfgOrders.html:72-81](Company_ValleyFoods_MfgOrders.html#L72-L81)).
No shared tab component, no `role="tablist"`, no keyboard support.

**Chatter.** `UIC.HistorySide` ([UI_Components.html:1773](UI_Components.html#L1773)) is a slide-in
audit panel reading `ERP_Record_History` — genuinely the seed of a chatter. It is wired into **2**
pages. The data already exists for every record.

---

### U-30 — Every navigation is a full page reload with a white flash
**Impact: High · Effort: L · Risk: Med**

`doGet` re-renders a complete HTML document per action ([Code.js:83-114](Code.js#L83-L114)); the
client navigates by setting `window.top.location.href`
([UI_Components.html:88-95](UI_Components.html#L88-L95)). Every module switch therefore re-downloads
and re-parses `CSS_Tokens` + `UI_Components` + `Client_Helpers` (~140 KB of shared HTML/JS before the
page's own code), re-runs `appShell`, and re-fetches the page's data.

`UIC.showPageLoading` covers the gap with an overlay, and `schedulePrefetch`
([Client_Helpers.html:454](Client_Helpers.html#L454)) warms server-side reference caches 2 s after
each page settles — both good mitigations already in place.

**What is realistically achievable:** the *shell* (topbar, drawer, control panel) can be rendered
from a cached client-side descriptor before the data arrives, so the user sees a stable frame
immediately instead of a white flash. True SPA routing inside `HtmlService` is possible but is an XL
change and would rewrite the router; **I do not recommend it in this programme.**

---

## 8. Group F — Accessibility

### U-31 — Zero ARIA and zero `role` attributes in all 81 page templates
**Impact: Med · Effort: M · Risk: Low**

Measured: **0** `aria-*` attributes and **0** `role=` attributes across the page templates. All 23
ARIA attributes in the project live in the shared components.

Even in the shared layer, coverage is thin:

- **Modal** — has `role="dialog" aria-modal="true"`
  ([UI_Components.html:1007](UI_Components.html#L1007)), but **no focus trap, no focus restore on
  close, and no Escape handler**. The only Escape listener closes the mobile drawer
  ([UI_Components.html:1317](UI_Components.html#L1317)). Keyboard users can tab straight out of an
  open modal into the page behind it.
- **Combo** — a fully custom listbox
  ([UI_Components.html:760](UI_Components.html#L760)) with arrow-key handling, but no
  `role="combobox"`, `aria-expanded`, `aria-controls` or `aria-activedescendant`. Invisible to a
  screen reader.
- **Table** — has `<caption class="sr-only">` (good) but no `scope="col"` on headers and no
  `aria-sort`.
- **Dropdowns** — `nav-dropdown-toggle` has no `aria-expanded`; the row action button has neither
  `aria-haspopup` nor `aria-expanded`.
- **Labels** — of 130 `<label>` elements in page templates only **56** carry `for=`. The 74 without
  are in hand-written forms that bypass `UIC.field` (which does emit `for` correctly).

### U-32 — Contrast and text-size floors
**Impact: Med · Effort: S · Risk: Low**

- `--text-disabled: #9ca3af` on `--bg-surface: #ffffff` ≈ **2.5:1** — fails WCAG AA (4.5:1) for text.
- `--text-muted: #6b7280` on white ≈ **4.8:1** — passes, but it is used at 11–12px for table headers
  and all metadata, where the margin is uncomfortably thin.
- 12 declarations of `font-size: 10px` and 55 of `11px` in page templates.
- `.table thead th` is `--text-muted` at **11px / weight 600** — the least legible text in the app,
  on every list.

### U-33 — No visible keyboard path through the core workflows
**Impact: Med · Effort: M · Risk: Low**

`:focus-visible` is styled globally ([CSS_Tokens.html:157](CSS_Tokens.html#L157)) — good. But rows are made
clickable via a container-level `onclick` on the wrapper div
([UI_Components.html:254](UI_Components.html#L254)), so `<tr>` is not focusable and cannot be
activated by keyboard. There is no skip-link, and no shortcuts (`0` handlers).

---

## 9. Group G — Documents, printing and analytics

### U-34 — 22 pages each reimplement invoice/print CSS; print output is uncontrolled
**Impact: Med · Effort: M · Risk: Low**

`.inv-table` is defined independently in **22** pages. Print pages
(`Company_TopLight_Sales_Print`, `Purchase_Print`, `Sales_Offer_Print`, `Sales_Costing_Print`, …) each
carry their own 17–64 line `<style>` block.

Measured across page templates:

| Print facility | Pages |
|---|---|
| `@media print` block | 16 of 85 |
| `@page` (paper size / margins) | **3** |
| `break-inside` / `page-break` control | **2** |
| `thead { display: table-header-group }` (repeat headers across pages) | **0** |

So a two-page invoice loses its column headers on page two, totals blocks can split across a page
break, and paper size and margins are whatever the browser defaults to.

Worse: both bespoke themes end with
`@media print { * { print-color-adjust: exact !important; } }`
([03_Security.js:851, 920](03_Security.js#L851)). Combined with `.table thead th { background: #111111 }`
that forces **solid black header bars** and 2px black or green borders onto every printed page — a
lot of toner, and poor contrast for the header text.

**Fix:** one shared `ERP_Print.html` partial — `@page` with sensible margins, repeating table headers,
`break-inside: avoid` on totals and signature blocks, a monochrome print palette, and a document
component (header / meta grid / lines / totals / footer) the 16 print pages consume.

### U-35 — 42 KB of dead UI code, and two more partials included by 3 pages
**Impact: Low · Effort: S · Risk: Low**

- [ERP_DataTable.html](ERP_DataTable.html) (2.7 KB) and
  [ERP_DataTable_JS.html](ERP_DataTable_JS.html) (39 KB) — a second, more capable table engine with
  sticky headers, sort indicators, a kebab menu and pending-row states — are included by **zero**
  pages. Confirmed: no `include('ERP_DataTable')` anywhere, and `ERPTable` is referenced only inside
  its own file. `Code.js:458` still names them in a comment as if live.
- [ERP_Flow.html](ERP_Flow.html) and [ERP_Modal.html](ERP_Modal.html) are included by 3 pages each
  (login, setup, TopLight Products) — enough to cause the double-overlay in U-24, not enough to be a
  system.
- `Record_History_Panel`, `User_Sessions`, `User_Views` are standalone routes
  ([01_Registry.js:35-37](01_Registry.js#L35-L37)), never included as partials.

`.claspignore` already excludes `src_html/`, `Backup/` and `*.md` from the push set, so this is repo
and payload tidiness for the *live* files only. **Note:** the dead engine contains several patterns we
want (U-01, U-03, U-05, U-20). I would **harvest before deleting**.

### U-36 — 36 pages redefine `esc()`, 32 redefine number/date formatters
**Impact: Low–Med · Effort: M · Risk: Low**

`FMT.escape`, `FMT.number`, `FMT.currency`, `FMT.date` all exist in
[Client_Helpers.html:228-270](Client_Helpers.html#L228-L270). Despite that, **36** page templates
define a local `esc()` and **32** define local `num0` / `fmt3` / `fmtDate` / `todayStr` helpers, each
with slightly different rounding and date formats — e.g.
[Company_ValleyFoods_MfgOrders.html:33-48](Company_ValleyFoods_MfgOrders.html#L33-L48) formats dates
as `DD/MM/YYYY` while `FMT.date` uses `toLocaleDateString('en-GB')`.

**Consequence:** the same value can be displayed differently on two pages. In an ERP that reads as a
data discrepancy, not a formatting one.

Also worth deciding: `FMT.currency` produces a bare number with **no currency symbol**, and
`FMT.number` uses `en-US` grouping in an Arabic UI. That may be exactly right for Egypt — it is a
decision, not a defect. See D-4.

### U-37 — Dashboards are thin, and one is empty
**Impact: Med · Effort: M · Risk: Low**

- **ValleyFoods** ([Company_ValleyFoods_Dashboard.html](Company_ValleyFoods_Dashboard.html)) renders
  a single centred welcome card: *"لوحة التحكم — الهيكل الأساسي"*. No KPIs, no charts, no shortcuts.
  A user landing here after login sees nothing actionable.
- **TopLight** ([Company_TopLight_Dashboard.html](Company_TopLight_Dashboard.html)) has 4 stat cards
  and 2 Chart.js charts — with `Chart.defaults.color = '#111111'` and a 9-colour hardcoded palette
  that ignores the theme entirely.
- Only **4** pages in the whole app render a chart.
- Chart.js is loaded from `cdn.jsdelivr.net` as a blocking top-level `<script>`
  ([Company_TopLight_Dashboard.html:11](Company_TopLight_Dashboard.html#L11)) rather than lazily, the
  way `API.ensureXlsx` handles the Excel library.

There is no drill-down: no chart segment or stat card links anywhere.

### U-38 — The main dashboard is a company picker and nothing else
**Impact: Med · Effort: M · Risk: Low**

[0_ERPDashboard.html](0_ERPDashboard.html) renders a welcome line and a grid of company tiles. No
cross-company figures, no recent records, no pending approvals, no "continue where you left off".
Compare Odoo's Apps home, which at least shows what needs your attention.

---

## 10. Group H — Mobile and responsive

### U-39 — Tables have no mobile presentation
**Impact: High · Effort: M · Risk: Low**

The mobile strategy for a 9-column table is `overflow-x: auto` plus `white-space: nowrap` on headers
([UI_Components.html:1358-1375](UI_Components.html#L1358-L1375)). On a phone that is a wide sideways
scroll with the row actions off-screen. There is no card/stacked fallback, no priority-column system,
and no column hiding (U-19).

The shell is well built for mobile; **the data is not.**

### U-40 — Modals become bottom sheets, but only above 640px do they centre
**Impact: Low · Effort: S · Risk: Low**

`.modal-overlay { align-items: flex-end }` with a `@media (min-width: 640px)` override
([UI_Components.html:1463-1467](UI_Components.html#L1463-L1467)) — this is good, modern, and correct.
Two gaps: no drag handle and no swipe-to-dismiss on the sheet (the *toast* has swipe-dismiss but the
sheet does not), and `max-width: 560px` on desktop is narrow for the multi-column forms that some
pages put inside it.

### U-41 — No density control and no user preferences at all
**Impact: Low–Med · Effort: M · Risk: Low**

Zero `localStorage` preference reads in page templates (`localStorage` is used only for the session
blob, [Client_Helpers.html:144](Client_Helpers.html#L144)). No compact/comfortable toggle, no
remembered page size, no remembered sort, no remembered theme. Odoo 17 offers density and dark mode
per user.

All of this fits in `localStorage` — **no schema change required.**

---

## 10b. Group I — ValleyFoods manufacturing and cost visibility (owner-requested)

Added 2026-09-06 at the owner's request, after the original 42 findings. All five were verified
against the code. Two of them (**U-45**, **U-47**) are real defects that exist today, independent of
any redesign.

---

### U-43 — Adding a raw material takes four steps and a full re-render each time
**Impact: Med · Effort: M · Risk: Low · ⭐ Owner-requested**

On `vf_mfg_order`, the "📦 الخامات الداخلة" tab renders each material as a full card
([Company_ValleyFoods_MfgOrderView.html:479-495](Company_ValleyFoods_MfgOrderView.html#L479-L495)):
a `UIC.combo` for the product, a number input for quantity, a delete button, and a nested
consumed-batches table that renders **even when empty** — showing
*"لا توجد دفعات مسجلة"* before the user has entered anything.

Adding one material is: click **+ خامة داخلة** → blank card appears → pick the product (fires a
server call for its batches) → type the quantity. Every one of those steps calls `drawOutputs()`,
which re-renders **all** material cards and re-runs `populateFooterItem` for every batch row on the
order. On an order with several materials the combo you are typing into is destroyed and rebuilt
under you.

The owner's ask: make choosing the item and entering the quantity easier.

---

### U-44 — FIFO allocation already exists but is invisible, and its validation only fires on save
**Impact: High · Effort: M · Risk: Low · ⭐ Owner-requested**

Two capabilities already exist and are simply not surfaced:

1. **FIFO auto-allocation.** `autoAllocFifo_`
   ([Company_ValleyFoods_MfgOrderView.html:387](Company_ValleyFoods_MfgOrderView.html#L387)) walks
   the batches oldest-first and fills the required quantity. It runs when the product is chosen
   ([:377](Company_ValleyFoods_MfgOrderView.html#L377)) and when the quantity changes — but the
   latter **only if no batches are allocated yet**
   ([:382](Company_ValleyFoods_MfgOrderView.html#L382)). So once a user touches the batch table by
   hand, changing the quantity silently stops re-allocating and the two fall out of step.
2. **The sum validation.** The server already enforces that batch quantities total the line quantity,
   at [Company_ValleyFoods_Actions.js:3972](Company_ValleyFoods_Actions.js#L3972):
   *"مجموع الدفعات للصنف … يجب أن يساوي كمية البند"*. It also checks each batch against the
   balance in `valley_current_products`. But it is a **thrown error on save** — the user discovers the
   mismatch after filling in the whole order.

Meanwhile **+ دفعة** ([:481](Company_ValleyFoods_MfgOrderView.html#L481)) does the least useful thing
available: `addFooterRow` pushes an empty row into the table and the user picks a batch from a
`<select>` listing every batch with its availability.

The owner's ask — a modal that runs FIFO on open, continues from batches already chosen, and shows
accept-or-error against the line quantity — is therefore **a re-presentation of logic that already
exists**, client-side, mirroring a rule the server already enforces. No new server behaviour.

---

### U-45 — Work-centre costs print as `0.000` on every manufacturing order ⭐ **real bug**
**Impact: High · Effort: S · Risk: Low · ⭐ Owner-requested**

The print template renders a work-centre table with **تكلفة المركز** and **الإجمالي** columns
([Company_ValleyFoods_MfgOrderView.html:316](Company_ValleyFoods_MfgOrderView.html#L316)), reading
`wop.work_center_cost` and `wop.total_cost`.

Neither field is ever sent to the client. `getValleyMfgWorkOps_`
([Company_ValleyFoods_Actions.js:4835-4849](Company_ValleyFoods_Actions.js#L4835-L4849)) builds each
row field by field — `unique_id`, `work_center_sequence`, `work_center_id`, `operation_status`,
`start_time`, `end_time`, `actual_hours`, `last_pause_time`, `total_pause_duration`, `notes` — and
**omits `work_center_cost` and `total_cost`**.

Both columns exist in the sheet and are populated: `work_center_cost` is written as a formula
`=INDEX(valley_work_centers!$H:$H, MATCH(E{row}, valley_work_centers!$A:$A, 0))`
([Company_ValleyFoods_Actions.js:3913](Company_ValleyFoods_Actions.js#L3913)) and both are listed in
`WC_HEADERS` ([:4257](Company_ValleyFoods_Actions.js#L4257)).

So `fmt3(undefined)` → `Number(undefined || 0).toFixed(3)` → **`0.000`**, on every printed order.
The same two fields are also absent from the on-screen work-ops table, which shows no cost at all
([:594-600](Company_ValleyFoods_MfgOrderView.html#L594-L600)).

**Fix:** add the two fields to the read projection. Two lines.

---

### U-46 — There is no cost-visibility permission; every authorised user sees every cost
**Impact: High · Effort: M · Risk: Med · ⭐ Owner-requested**

Access control is per **page**, three levels, from the `ERP_Pages_Matrix` sheet
(`role`, `page_id`, `access_type`, `status`) read by `getRoleAuthorityMatrix_`
([03_Security.js:360](03_Security.js#L360)) into `user.authorizedPages`, then enforced by
`checkPageAccessForUI_` ([03_Security.js:540](03_Security.js#L540)) server-side and
`UIC.canAdd_` / `UIC.canFull_` ([UI_Components.html:56](UI_Components.html#L56)) client-side.

There is **no dimension below page level**. A user who can open `vf_purchasing`, `vf_sales` or
`vf_mfg_orders` sees unit costs, batch costs, work-centre costs and margins in full.

The owner's design — a `valley_cost_view` page id, `write` grant means costs are visible, otherwise
quantities only — fits the existing model without extending it, because a page id in the matrix does
not have to correspond to a routable page.

**Two parts, and only one of them is code:**

| Part | Who | What |
|---|---|---|
| Register `valley_cost_view` in `Company_ValleyFoods_Registry.js` with `nav: false`, and gate the cost columns on it in the UI and on the server | **Agent** | Code |
| Add the `ERP_Pages_Matrix` rows granting `write` on `valley_cost_view` to the roles that should see costs | **Owner** | **Data — the agent must not write it.** Use `ERP_Management` → صلاحيات الأدوار |

Until those rows exist, **nobody has the grant**, so costs would be hidden from everyone including
the owner. Sequencing matters — see the plan.

---

### U-47 — The manufacturing save writes client-supplied costs ⭐ **pre-existing hole, and the blocker for U-46**
**Impact: High · Effort: S · Risk: Low to fix · ⭐ Found while specifying U-46**

`saveValleyMfgOrder_` writes the consumption row's cost straight from the request payload:

```js
m7['cost_unit'] = (f.unit_cost != null && String(f.unit_cost).trim() !== '') ? Number(f.unit_cost) : '';
```
— [Company_ValleyFoods_Actions.js:4211](Company_ValleyFoods_Actions.js#L4211)

The client is trusted for a costing figure. Two consequences:

1. **It blocks U-46 outright.** If the server strips `unit_cost` from the read for a user without the
   cost grant, that user's next save sends `f.unit_cost === undefined` and writes `''` into
   `cost_unit` — **silently wiping the cost of every consumption row they touch.** Shipping U-46
   without fixing this would destroy costing data.
2. **It is a hole today**, independent of any of this. Anything that can call the endpoint can set
   costs to whatever it likes.

**The server already has the authoritative value.** The read path looks it up itself, from
`valley_current_products`, keyed by batch uid:

```js
var _uc = batchCost[String(cm.item || '').trim()] || 0;
```
— [Company_ValleyFoods_Actions.js:4689, 4708](Company_ValleyFoods_Actions.js#L4689)

**Fix:** have the save resolve `cost_unit` from that same source and ignore the client's value
entirely. This closes the hole, makes U-46 safe, and removes a field from the payload the client had
no business setting.

---

### U-48 — There is no tablet tier and no wide-desktop tier; the layout is binary ⭐ Owner-requested
**Impact: High · Effort: M · Risk: Low · ⭐ Owner-requested**

The owner's requirement: the design must work properly on **phones, tablets and Windows desktops** —
all three, as first-class targets.

Measured, the shared layer has **two** tiers, not three:

| Query | Where | Covers |
|---|---|---|
| `@media (max-width: 767px)` | [UI_Components.html:1741](UI_Components.html#L1741) | phone |
| `@media (min-width: 768px)` | [UI_Components.html:1755](UI_Components.html#L1755) | **everything else — 768px iPad and 2560px monitor identically** |
| `@media (min-width: 640px)` | [UI_Components.html:1464](UI_Components.html#L1464) | modal centring only |
| `@media (orientation: landscape) and (max-height: 500px)` | [UI_Components.html:1762](UI_Components.html#L1762) | phone in landscape |
| `@media (hover: none)` | ×4 | touch active-states |

Three concrete consequences:

1. **No tablet treatment.** An iPad in portrait (768px) crosses straight into the desktop branch: the
   full topbar renders with every nav item and dropdown group inline. For TopChemical that is 2 flat
   links plus 5 dropdown groups in a 768px bar. The hamburger and drawer — which would serve that
   width well — are hard-disabled above 767px by
   `.topbar-hamburger { display: none !important }` ([UI_Components.html:1756](UI_Components.html#L1756)).
2. **No wide-desktop treatment.** `.app-content { max-width: 1200px }`
   ([UI_Components.html:1657](UI_Components.html#L1657)) caps content on every screen. On a 2560px
   Windows monitor that leaves ~1360px of empty margin **while the tables inside scroll horizontally**
   (U-39). The one screen with room to show every column is the one that shows fewest.
3. **Pages invent their own breakpoints.** Across the page templates: `900px` (×2), `640px` (×2),
   `720px`, `600px`, `1300px` — five values, none of which match the shared 767/768 pair. The same
   fragmentation as U-08, in the responsive layer.

There is also a **1px overlap**: the home-logo FAB uses `@media(max-width:768px)`
([UI_Components.html:149](UI_Components.html#L149)) while the shell switches at 767/768. At exactly
768px the shell is in desktop mode and the FAB is in mobile mode.

**No breakpoint tokens exist**, so there is nothing for a page to reuse even if it wanted to.

---

## 11. Odoo 17 parity matrix

`●` = present and good · `◐` = partial / present but unused · `○` = absent

| Area | Capability | Now | Target | Finding |
|---|---|:--:|:--:|---|
| **Shell** | Topbar with brand, nav, user menu | ● | ● | — |
| | Mobile drawer, swipe close | ● | ● | — |
| | Control panel (breadcrumb + views + search + filters) | ○ | ● | U-13 |
| | Clickable breadcrumb | ○ | ● | U-13 |
| | Record pager (`◀ n/N ▶`) | ○ | ● | U-13 |
| | Single source of truth for menus | ◐ | ● | U-14 |
| | Command palette | ○ | ◐ | U-15 |
| **List** | Pagination | ● | ● | — |
| | Search | ◐ | ● | U-13 |
| | Search facets | ○ | ● | U-13 |
| | Sort with indicator | ◐ | ● | U-03 |
| | Sticky header | ○ | ● | U-05 |
| | Multi-select + batch bar | ○ | ● | U-17 |
| | Group-by with subtotals | ○ | ● | U-18 |
| | Footer aggregates | ○ | ● | U-18 |
| | Optional / resizable columns | ○ | ● | U-19 |
| | Inline editing | ○ | ◐ | U-21 |
| | Mobile card fallback | ○ | ● | U-39 |
| | Row actions (subtle kebab) | ◐ | ● | U-20, U-01 |
| | Skeleton loading | ◐ | ● | U-23 |
| | Empty state with CTA | ◐ | ● | U-22 |
| | Excel / print export | ● | ● | — |
| **Form** | Consistent modal-vs-page rule | ◐ | ● | U-25 |
| | Statusbar (stages) | ○ | ● | U-29 |
| | Smart buttons | ○ | ● | U-29 |
| | Notebook tabs (shared component) | ◐ | ● | U-29 |
| | Chatter / audit / attachments | ◐ | ● | U-29 |
| | Dirty guard | ○ | ● | U-26 |
| | Field-anchored validation | ◐ | ● | U-27 |
| | Styled confirm dialogs | ◐ | ● | U-28 |
| **Visual** | Colour tokens | ◐ | ● | U-07 |
| | Type scale in use | ○ | ● | U-06 |
| | Spacing scale in use | ○ | ● | U-06 |
| | Icon system | ○ | ● | U-09 |
| | Neutral canvas | ◐ | ● | U-10 |
| | Arabic webfont, all companies | ◐ | ● | U-11 |
| | Dark mode | ○ | ● | U-12 |
| | Density control | ○ | ● | U-41 |
| **A11y** | Focus-visible | ● | ● | — |
| | ARIA on components | ◐ | ● | U-31 |
| | Focus trap in modals | ○ | ● | U-31 |
| | Contrast AA | ◐ | ● | U-32 |
| | Keyboard operability | ◐ | ● | U-33 |
| **Docs** | Shared print/document system | ○ | ● | U-34 |
| | Page-break and repeated headers | ○ | ● | U-34 |
| **Analytics** | Company dashboards | ◐ | ● | U-37 |
| | Drill-down from charts | ○ | ● | U-37 |
| | Cross-company home | ○ | ◐ | U-38 |

---

## 12. Suggested phasing (outline only — the real plan comes after you approve)

I am **not** proposing this as the plan. It is the shape I would argue for, so you can react to it.

| Phase | Theme | Findings | Effort | Risk | Why here |
|---|---|---|---|---|---|
| **1** | Shared-layer defects | U-01…U-05 | ~1 day | Low | Cheap, high-visibility, no design decisions needed |
| **2** | Token discipline | U-06, U-07, U-11, U-32, U-36 | M–L | Low | Everything after this depends on it |
| **3** | Icon system + component polish | U-09, U-20, U-22, U-24, U-40 | M | Low | First point the app *looks* different |
| **4** | Control panel + list view | U-13, U-14, U-17, U-18, U-19, U-23, U-39 | L | Low–Med | The biggest single productivity jump |
| **5** | Form view | U-25, U-26, U-27, U-28, U-29 | L | Med | Statusbar, chatter, dirty guard, styled confirms |
| **6** | Accessibility pass | U-31, U-33 | M | Low | Best done once components are stable |
| **7** | Documents & print | U-34 | M | Low | Self-contained |
| **8** | Dark mode + density + preferences | U-12, U-41 | M | Low | Only viable after Phase 2 |
| **9** | Dashboards & analytics | U-37, U-38 | M | Low | Needs your input on which KPIs matter |
| **—** | Deferred / needs a separate decision | U-15, U-21, U-30, U-35 | — | — | Command palette, inline edit, SPA shell, dead-code removal |

Each phase would be one commit per module, `node --check` on every `.js` and a parse of every page's
inline `<script>` after each phase, exactly as the performance run did.

---

## 13. Decisions I need from you

> **Status — 2026-09-06.** D-1, D-2, D-3 and D-9 are **answered**; the answers are recorded and acted
> on in [UI_UX_EXECUTION_PLAN.md](UI_UX_EXECUTION_PLAN.md). Summary:
> **D-1/D-2** — retire the coloured canvas in all three companies; brand colour is used for the
> **topbar and printing** only. **D-3** — unify the typeface across all companies.
> **D-9** — no staging and no deployment; local file edits only, pushed by the owner at the end
> (which is why the plan carries its own local preview harness and static checks).
> D-4 … D-8 and D-10 remain open and are gated inside the phases that need them.

These are the choices I will not make on my own.

**D-1 — Scope of the visual change.**
Do you want (a) *Odoo-like*: neutral canvas, hairline borders, restrained accent, monochrome icons —
a visible break from today's look; or (b) *evolutionary*: keep the current amber/green brand identity
and improve consistency, density and typography within it? This decides Phases 2, 3 and 10 (U-10).

**D-2 — The company canvas colours (U-10).**
TopLight's amber and TopChemical's green full-page backgrounds are the strongest visual signature the
product has. Odoo-parity means retiring them and moving brand colour to the topbar and primary
buttons only. Is that acceptable, or is the coloured canvas a requirement from the companies
themselves?

**D-3 — Arabic typeface (U-11).**
Standardise all three companies on one webfont? Cairo is already loaded for two of them and is the
low-friction answer. Alternatives: IBM Plex Sans Arabic (more neutral, better for dense numerics),
Noto Sans Arabic. Or keep the system stack and accept the Tahoma fallback.

**D-4 — Number and currency formatting (U-36).**
Today: `en-US` grouping, no currency symbol, and 32 pages with their own formatters. Should I
standardise on Western digits with `EGP` / `ج.م` shown, Western digits with no symbol (today's
behaviour), or Arabic-Indic digits? This affects every figure in the product.

**D-5 — Batch operations (U-17).**
First pass read-only (export/print a selection) or should batch *writes* (approve many, delete many)
be in scope? The latter touches save paths.

**D-6 — Inline list editing (U-21).**
In or out? I would argue **out** for this programme — highest risk, and the modal form already works.

**D-7 — Navigation speed (U-30).**
Accept the full-reload model and just make it feel better (cached shell, skeleton, prefetch), or is a
true SPA router something you want costed? I recommend the former.

**D-8 — Dead code (U-35).**
`ERP_DataTable_JS.html` (39 KB, unused) contains patterns worth harvesting for U-01/U-03/U-05/U-20.
Harvest then delete, or leave in place? Same question for `src_html/` (a stale 45-file snapshot,
already excluded from deploy).

**D-9 — Rollout and verification.**
Nothing is deployed and no staging environment exists (per `PERFORMANCE_RESULTS.md` §3). A UI change
programme is much riskier without a staging copy than a backend one, because the failure mode is
visual and only shows up in a browser. Do you want staging built first
([STAGING_SETUP.md](STAGING_SETUP.md) has the runbook), or will you accept per-phase review on
production?

**D-10 — Order.**
Do you agree with defects-first (Phase 1), or would you rather see a visual proof-of-concept on one
page before committing to the token work?

---

## 14. Risks and constraints I am holding

1. **Production, no rollback environment.** Every phase must be a self-contained commit revertible
   with one `git revert`, and must not change any backend function signature or response shape.
2. **Public contracts stay.** `UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*` and the
   HTML anchor ids (`tab-body`, `admin-root`, `dash-shell`, `tl-root`, `vf-root`, `tc-root`, …) are
   consumed by 85 templates. Components get *added to*, never renamed.
3. **No schema changes.** Saved views ride on `ERP_User_Views.layout_json`, which already exists.
   Preferences ride on `localStorage`. Menu grouping rides on the registry files, which are code, not
   business tables.
4. **No build step, no npm, no new CDN dependency.** ES5-flavoured V8, `function` declarations, IIFE
   namespaces — matching the existing style. An SVG sprite is inline, not fetched.
5. **The performance work must not regress.** `PERFORMANCE_RESULTS.md` documents an in-flight
   optimisation programme on this same branch. Anything that adds per-row DOM or per-page payload
   needs to be weighed against it — in particular the chunked table renderer
   ([UI_Components.html:277](UI_Components.html#L277)) and the 50-row pager.
6. **Arabic RTL is the primary direction, not an afterthought.** Every new component must be authored
   with logical properties (`margin-inline-start`, `inset-inline-end`) rather than the physical
   `left`/`right` used in places today.

---

## Appendix A — Measured metrics

All figures measured on `perf/optimization-run` at commit `a8c239f`, over the 85 page templates
(excluding the seven shared partials and `appsheet_old_project.html`).

| Metric | Value |
|---|---|
| Routes registered | 89 (8 base + 21 TopLight + 31 TopChemical + 29 ValleyFoods) |
| Page templates | 85 |
| Pages including the shared design system | 82 |
| Pages using `UIC.dataTable` | 53 |
| Pages with a raw `<table class="table">` | 22 |
| Pages using `UIC.openModal` | 49 |
| Pages using a full-page form | 6 |
| Inline `style="` attributes in page templates | 898 |
| Hardcoded hex colour literals (distinct / total) | **137 / 550** |
| `var(--token)` references in page templates | 379 |
| `--text-*` scale uses (pages / `UI_Components`) | **0 / 0** |
| `--space-xs…lg` uses (pages / `UI_Components`) | **1 / 0** |
| Hardcoded `font-size: NNpx` in pages | 339 |
| Hardcoded px `padding`/`margin` in pages | 320 |
| Pages with their own `<style>` block | 36 |
| Lines of page-local CSS | 681 |
| Pages redefining `esc()` | 36 |
| Pages redefining number/date formatters | 32 |
| Native `confirm()` calls | 34 |
| Native `alert()` calls | 10 |
| `aria-*` attributes in page templates | **0** |
| `role=` attributes in page templates | **0** |
| `<label>` elements / with `for=` | 130 / 56 |
| `prefers-color-scheme` rules | **0** |
| `beforeunload` guards | **0** |
| Keyboard-shortcut handlers | **0** |
| Pages with `@media print` | 16 |
| Pages with `@page` | 3 |
| Pages with page-break control | 2 |
| Pages with repeating print table headers | **0** |
| Pages using `UIC.tableSkeleton` | 1 |
| Pages using `UIC.PagedTable` | 3 |
| Pages with checkboxes / with batch actions | 11 / **0** |
| Pages using `UIC.HistorySide` | 2 |
| Pages using saved views | 2 |
| Pages rendering a chart | 4 |
| `window.open()` calls (new-tab navigation) | 37 |
| Distinct loading-overlay implementations | 4 |
| Pages including `ERP_DataTable` / `ERP_DataTable_JS` | **0 / 0** (42 KB dead) |
| Pages setting `dir="rtl"` on `<html>` | 23 of 81 |

### Reproducing the counts

```bash
cd d:/Work/Script
P=$(ls Company_*.html 0_*.html)
grep -o 'style="' $P | wc -l                      # inline styles
grep -oh '#[0-9a-fA-F]\{6\}\b' $P | sort -u | wc -l   # distinct hex
grep -o 'var(--text-\(xs\|sm\|base\|lg\|xl\|2xl\))' $P | wc -l   # type scale uses
grep -o 'font-size: *[0-9]*px' $P | wc -l         # hardcoded sizes
grep -oh 'aria-[a-z]*' $P | wc -l                 # aria coverage
grep -o 'confirm(' $P | wc -l                     # native dialogs
grep -l '<html[^>]*dir="rtl"' $P | wc -l          # correct RTL root
grep -rl "include('ERP_DataTable')" *.html        # dead-code check (empty)
```

---

## Appendix B — Files that constitute the UI layer

| File | Size | Role | Included by |
|---|---|---|---|
| [CSS_Tokens.html](CSS_Tokens.html) | 4 KB | Design tokens, reset, safe areas | 82 pages |
| [UI_Components.html](UI_Components.html) | 93 KB | `UIC.*` component library + all shared CSS | 82 pages |
| [Client_Helpers.html](Client_Helpers.html) | 20 KB | `API.*`, `FMT.*`, `UI.*`, `SESSION.*`, spinner CSS | 82 pages |
| [ERP_Modal.html](ERP_Modal.html) | 5 KB | Second modal/toast service | 3 pages |
| [ERP_Flow.html](ERP_Flow.html) | 4 KB | Third loading overlay | 3 pages |
| [ERP_DataTable.html](ERP_DataTable.html) | 3 KB | Dead table CSS (sticky, kebab, sort arrows) | **0** |
| [ERP_DataTable_JS.html](ERP_DataTable_JS.html) | 39 KB | Dead table engine | **0** |
| [03_Security.js:703-926](03_Security.js#L703) | — | `getCompanyThemeCSS_` + two bespoke themes | server-side |
| [Company_TopChemical_Nav.html](Company_TopChemical_Nav.html) | 3 KB | Hand-written menu (29 items) | TC pages |
| [Company_ValleyFoods_Nav.html](Company_ValleyFoods_Nav.html) | 2 KB | Hand-written menu (23 items) | VF pages |
| [Record_History_Panel.html](Record_History_Panel.html) | 5 KB | Standalone audit route | route only |
| [User_Sessions.html](User_Sessions.html) / [User_Views.html](User_Views.html) | 10 KB | Standalone routes | route only |

---

*Prepared for review. No files have been modified. On approval, the next deliverable is
`UI_UX_EXECUTION_PLAN.md` — phased, per-module, one commit per step, with the decisions from
section 13 baked in.*
