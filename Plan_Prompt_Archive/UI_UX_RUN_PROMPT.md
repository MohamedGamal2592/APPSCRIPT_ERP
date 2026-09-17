# UI/UX Execution Run — agent prompt

You are executing a UI/UX redesign programme on a **production** multi-tenant ERP built on Google
Apps Script + Google Sheets, serving three companies (TopChemical, TopLight, ValleyFoods), with an
Arabic RTL interface. Repo root `d:\Work\Script`, remote `origin`
(`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

A previous session completed the investigation and the plan. **You are executing the plan, not
re-deriving it.**

---

## Read these first, in full, before touching anything

1. **[UI_UX_EXECUTION_PLAN.md](UI_UX_EXECUTION_PLAN.md)** — your specification. Phases 0–10, each with
   steps, files, verification, rollback and gates. §0 (ground rules), §2.1 (the token palette) and the
   risk register are the parts you must not skim.
2. **[UI_UX_INVESTIGATION.md](UI_UX_INVESTIGATION.md)** — the 47 findings (`U-01`…`U-47`) with
   `file:line` evidence, the Odoo 17 parity matrix, and the measured baseline in Appendix A.
3. **[PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md)** — a *separate, concurrent* programme on the
   same repo. Read §3 and §5 so you know what it changed and what it is still doing. **You must not
   regress it.**
4. **[NEXT_RUN_PROMPT.md](NEXT_RUN_PROMPT.md)** — the performance programme's current work order
   (Phases 11–14). Read it only to know which files another agent may be editing.

These are your specification. **Verify a `file:line` reference before you edit it, then move on** —
do not re-investigate findings that are already evidenced.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema

No column may be **added, renamed, removed, reordered, or retyped** in any business table, in any of
the three company spreadsheets or the auth spreadsheet. Not as a migration, not as a "small addition",
not behind a flag, not "temporarily". No new sheet/tab in a business spreadsheet.

If a feature appears to need a new column, **it does not get built**. Write it up as a proposal in the
results document and move on. The plan is already designed around this: saved views ride on the
**existing** `ERP_User_Views.layout_json` column, user preferences ride on `localStorage`, and menu
grouping rides on the registry `.js` files (which are code, not tables).

## 2. NEVER add, edit, or delete data in any business table

No writing rows. No updating cells. No deleting rows. No backfills. No "just fixing this one bad
value". No test records. No seed data. Not by hand, not by script, not via `clasp run`, not via a
one-off function you write and execute.

This is a UI programme. **It has no legitimate reason to write a single cell of business data.**
If you find yourself designing something that writes to a sheet, you have misread the plan — stop and
re-read it.

The only writes this programme may cause are the ones the **existing, unmodified** save handlers
already perform when a real user clicks Save in the running app. You are not to invoke those either.

## 3. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never create or
promote a deployment. Never run `clasp login`, `clasp run`, or `clasp open`.

**The owner has explicitly said: edit local files only; they will push when the programme is
finished.** There is no staging environment and none will be built.

## 4. NEVER touch the owner's Google account

No installing triggers, no setting Script Properties, no running `dailyCsvBackup`,
`inventorySpreadsheets()`, `archiveOldRecords()`, or any other server function. Anything needing the
owner's account is written up as blocked-on-owner and you continue.

## 5. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend function
signature, every response shape, and every HTML anchor id the pages depend on (`tl-root`, `vf-root`,
`tc-root`, `admin-root`, `dash-shell`, `tab-body`, `app-content`, `invoice-root`, `mx-grid`, …).

Components are **added to**, never renamed or removed. When a component's markup changes, its call
signature must not. Every one of the 85 page templates must keep working unchanged unless you
deliberately and explicitly convert it in a named step.

---

## Starting state — verify before you begin

The branch has recent activity from a **concurrent performance programme**, and the working tree may
be dirty because another agent is mid-phase.

```bash
cd d:/Work/Script
git branch --show-current      # expect: perf/optimization-run
git status --porcelain         # MAY BE NON-EMPTY — see below
git log --oneline -12
```

**If `git status` is not clean:** the uncommitted changes belong to the performance programme (most
likely in `Company_TopLight_Actions.js` or another `Company_*_Actions.js`). **Do not commit them, do
not revert them, do not stash them.** Note what you saw in your first phase report, then carry on —
this is not a reason to stop.

Either way, create your branch and stay on it for the whole programme:

```bash
git checkout -b ui/odoo-parity
```

**Then, for every commit in this run: stage explicit paths only.** Never `git add -A`, never
`git add .`, never `git commit -a`. Another agent's work in progress must never end up inside one of
your commits. Before each commit, run `git status --porcelain` and stage only files you yourself
changed.

Do not rebase. Do not merge. Do not push. Do not switch back to `perf/optimization-run`.

### File-level separation from the performance programme

The two programmes barely overlap. Keep it that way.

| Files | Owner |
|---|---|
| `Company_TopChemical_Actions.js`, `Company_TopLight_Actions.js` | **Performance — do not touch** |
| `Company_ValleyFoods_Actions.js` | **You** — handed over by the owner on 2026-09-06 for Phase 2B. 364 KB, and the performance programme edited it during its Phases 7–10. Check `git log` and `git status` on the path before your first edit, re-verify every line number, and keep Phase 2B's changes additive and narrow. |
| `02_DataAccess.js`, `05_Admin.js`, `07_Backup.js`–`10_Retention.js` | **Performance — do not touch** |
| `CSS_Tokens.html`, `UI_Components.html`, `Client_Helpers.html`, `ERP_*.html` | **You** |
| All `Company_*.html` page templates, `0_*.html`, `User_*.html` | **You** |
| `03_Security.js` (theme functions only, lines ~700–930) | **You** |
| `Company_*_Registry.js` (Phase 4.2 only) | **You** |
| `Code.js` | **Shared — coordinate.** You need only one comment fix (step 10.2). Leave it for last and re-check the file before editing. |

---

## Decisions already made by the owner — do not re-ask

| # | Decision | Answer |
|---|---|---|
| **D-1 / D-2** | Visual direction | **Odoo-like.** Retire the coloured page canvas in **all three** companies. Brand colour is used for the **topbar and printing** only. |
| **D-3** | Arabic typeface | **Unify across all three companies.** Plan specifies Cairo; confirm at the Phase 2 gate. |
| **D-9** | Deployment | **None.** Local file edits only. The owner pushes at the end. |
| **⭐ new** | Persistent home button | **The system logo floats above the page on EVERY page, one click back to the main dashboard.** Finding **U-42**, built as step **3.8**. This is an explicit owner requirement — do not drop it, do not defer it, do not "simplify" it away. Implement the Phase 3 spec exactly. |
| **⭐ new** | ValleyFoods manufacturing (`vf_mfg_order`) | Easier material entry, a FIFO **+ دفعة** modal, and work-centre costs in print. Findings **U-43 … U-45**. New **Phase 2B**, runs after Phase 2 and **before Phase 3**. |
| **⭐ new** | `valley_cost_view` cost permission | **Server-enforced access control, not a UI hide.** Cost fields are stripped from the response for users without the grant, across purchasing, sales and manufacturing. Findings **U-46, U-47**. Also Phase 2B. |

### The remaining decisions have standing answers — apply them, do not ask

The owner has asked for the whole programme to run start to finish without approval stops. Every
decision the plan left open therefore has a **standing answer below**. Apply it, record that you
applied it in the results document, and keep going.

- **D-4 — number/currency formatting.** Do **not** change any displayed value. In step 2.8, consolidate
  a page's local `esc()` / `num0` / `fmt3` / `fmtDate` helper onto `FMT.*` **only where the output is
  provably identical** for every input the page can produce — prove it with a differential test under
  `node`. Where the output would differ (3-decimal quantities vs `FMT.currency`'s 2; `DD/MM/YYYY` vs
  `toLocaleDateString('en-GB')`), **leave the local helper in place and list it** in the results
  document as a proposal for the owner. Digits stay Western, currency stays unsuffixed — today's
  behaviour, unchanged.
- **D-5 — batch actions.** Read-only only: export a selection, print a selection. **No batch writes.**
  No approve-many, no delete-many. Build the selection mechanics so a future write action can be
  added, but ship none.
- **D-6 — inline list editing.** **Out of scope.** Do not build it.
- **D-7 — SPA navigation.** **Out of scope.** Do not build it. Do not rewrite the router.
- **D-8 — dead code.** Harvest the useful patterns from `ERP_DataTable_JS.html` first (they are needed
  by steps 1.3, 1.5 and 3.3), then delete both dead files in Phase 10. **Leave `src_html/` alone** —
  report it, do not touch or delete it.
- **Phase 2 palette (plan §2.1).** Use the values as written in the plan. They are the specification.
- **D-3 font.** **Cairo.** Confirmed — do not deliberate.
- **Phase 2.7 colour sweep.** Where a literal's intent is ambiguous — chart palettes, legend status
  colours, anything whose meaning is the specific colour rather than a role — **leave it alone and
  list it**. Never guess a token for a colour that may be carrying meaning.
- **Phase 5.5 smart buttons.** Implement only the ones whose counts come from data the page has
  **already loaded**. Any that would need a new server endpoint: write up as a proposal, do not build.
- **Phase 9.1 ValleyFoods dashboard.** Build it from KPIs the ValleyFoods backend **already exposes**
  — mirror the shape of the TopLight dashboard. Invent no new metric and add no new endpoint. If the
  backend exposes nothing usable, build the layout with an honest empty state and record it as
  blocked-on-owner.
- **Device support is an acceptance condition on every phase, not a phase.** Phones, tablets and
  Windows desktops are all first-class targets — the owner said so explicitly. Plan §0.4 defines
  five breakpoint tiers (`phone` ≤599, `tablet-p` 600–899, `tablet-l` 900–1279, `desktop`
  1280–1919, `wide` ≥1920). Use **only** those, author **mobile-first with `min-width`**, and do
  not let a commit land until the component works at 390 / 768 / 1024 / 1440 / 2560 in both
  orientations. Today there are only two tiers, so a 768px iPad gets the identical layout to a
  2560px monitor — that is finding **U-48**, and fixing it is step **2.9b**.
- **Never use screen width as a proxy for input type.** Windows machines have touchscreens and
  tablets have keyboards. Use `(hover: hover)` / `(pointer: fine)` for pointer affordances, keep
  44/48px tap targets at every width, and give every hover-only action a non-hover path.
- **Step 2.9 must land before Phase 2B.** `UIC.openModal` takes only `title`/`body`/`footer`/`onSave`
  and `.modal` is pinned to `max-width: 560px` on desktop. Phase 2B's batch modal is a six-column
  table and will not fit. Add an additive `size` option first (default `md` = 560px, so no existing
  caller changes), then build the batch modal with `size: 'lg'`.
- **Phase 2B.7 — build on `UIC.openModal` and nothing else.** No bespoke dialog, no page-local
  overlay, no hardcoded width. The manufacturing page already carries one bespoke overlay with a
  hardcoded `#875A7B` spinner; do not add a second. If the shared modal cannot do something you need,
  extend `UIC.openModal` additively rather than working around it on the page — that is what makes
  the later phases (3.6 drag handle, 6.1 focus trap and Escape) arrive for free instead of as rework.
- **Phase 2B ordering — non-negotiable.** **U-47 lands before U-46.** Fix the save so it resolves
  `cost_unit` server-side *first*; only then strip cost from the reads. The other order silently
  wipes costing data the first time a user without the grant saves a manufacturing order.
- **Phase 2B fail-open guard.** When no role in `ERP_Pages_Matrix` holds any grant on
  `valley_cost_view`, treat **every** user as cost-authorised and log it once. You cannot add
  those rows — they are data in a system table and hard constraint 2 forbids it. Without the guard
  your change hides costs from everyone including the owner the moment it ships. Record the
  matrix rows the owner must add in the blocked-on-owner register.
- **Phase 2B cost stripping.** **Omit the key, never send zero.** A zero is indistinguishable from
  a genuine zero cost and will render as a figure. Quantities, batch identity, availability,
  dates and statuses are never stripped — a user without the grant must still be able to allocate
  batches and save an order correctly.
- **Phase 2B modal tolerance.** Mirror the server rule exactly: `Math.abs(sum - qty) > 0.01` after
  rounding to 3 decimals, as at
  [Company_ValleyFoods_Actions.js:3972](Company_ValleyFoods_Actions.js#L3972). A looser client
  tolerance accepts allocations the save then rejects.
- **Step 3.8 home-button position.** **Bottom, inline-end** (bottom-left in RTL), `z-index: 1100`,
  hidden while a dialog or the drawer is open. **Not** top-right: the app is RTL, so `.topbar-left`
  — hamburger plus both logos — renders on the *right*, and the button would land on top of it on
  all 82 shell pages. Do not change this on your own judgement; the plan explains the trade-off and
  the owner can flip it later with one rule.

---

## Your task

Execute **Phases 0, 1, 2, 2B, 3, 4, 5, 6, 7, 8, 9, 10 — in that order, back to back, until all are
complete or blocked**, committing
as the plan specifies, then write the final results document.

**All approval gates in the plan are waived.** Do not stop to ask. Do not pause between phases. Do not
present a palette, a mapping table, or a checklist and wait for a reply — apply the standing answers
above, record what you did, and continue to the next step.

The only things that stop you are the five hard constraints at the top of this document. Nothing else
is a reason to halt.

### When you would normally stop

You will hit steps that are ambiguous, or that turn out to be wrong, unsafe, or already done. Handle
them like this, and keep moving:

1. **A standing answer covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the phase report and in the
   results document, continue with the rest of the phase.
3. **A step is genuinely blocked** (needs the owner's Google account, needs a new schema column, needs
   a decision no standing answer covers) → write it up as a proposal, mark it blocked-on-owner,
   continue with everything else in the phase.
4. **A whole phase turns out to be unworkable** → report it plainly, do not fake it, and move to the
   next phase. A phase reported as not-done is a fine outcome. A phase reported as done that quietly
   broke pages is not.

A reported skip is always better than a guess. Partial delivery is always better than a stall.

---

## The verification problem — this is the heart of the run

**You cannot see a browser. Neither can the owner, until they push.** A static check cannot tell you
that a modal is mirrored or a button is the wrong colour. This is the single largest risk in the
programme, and Phase 0 exists entirely to mitigate it.

You must therefore:

1. **Build the preview harness properly — and make it multi-width.** It must render each component
   at all five tiers at once (a width switcher, or stacked fixed-width iframes), because a tablet
   regression is otherwise invisible to both you and the owner until after the push.
   The harness `design_preview/index.html` must read the **real**
   `CSS_Tokens.html` and `UI_Components.html` — not copies. If it drifts from the live files it
   becomes a lie and is worse than nothing. It strips the `<?!= … ?>` scriptlets and stubs the three
   theme functions from `03_Security.js` so all three company themes can be toggled in one page.
2. **Build `tools/ui_check.js` properly.** It must actually catch things: `node --check` on all 19
   `.js` files, a parse of the inline `<script>` of all 92 `.html` files (85 page templates + 7 shared partials), used-vs-defined CSS classes,
   surviving anchor ids, surviving `UIC.*`/`API.*`/`FMT.*`/`UI.*` symbols, and the token-to-literal
   ratio.
3. **Run `ui_check.js` after every phase**, and paste its output into the phase report.
4. **Write the visual checklist for every phase** — specific, checkable statements, e.g.
   *"TopLight topbar is black with amber text; page background is light grey, not amber."*
   Never "check it looks right". **Every checklist must name the widths it was checked at** —
   minimum 390 / 768 / 1024 / 1440 / 2560, both orientations for the tablet widths.
5. **Add `design_preview/**` and `tools/**` to `.claspignore`.** `.clasp.json` already sets
   `skipSubdirectories: true`, so they are excluded today — list them anyway, exactly as the existing
   file lists `src_html/**` and `Backup/**`, "so the intent survives if that setting is ever changed".

---

## Rules for each phase

- **Verify every `file:line` reference before editing.** The docs were accurate when written; confirm
  rather than trust. The performance programme has been editing the repo concurrently, so line
  numbers in the shared files may have shifted.
- **Match the surrounding style.** ES5-flavoured V8, `function` declarations, IIFE namespaces per
  company, no build step, no npm, no new CDN origin. The icon set is an **inline SVG sprite**, not a
  fetch.
- **Author every new component with logical CSS properties** (`margin-inline-start`,
  `inset-inline-end`, `padding-block`) rather than the physical `left`/`right` used in places today.
  Arabic RTL is the primary direction, not an afterthought.
- **Where a change is per-page or per-company, do them one at a time with a clear commit each.**
  A bad sweep must revert one company, not all three.
- **If a step turns out to be wrong, unsafe, or already done, skip it and record why.** A reported
  skip is fine. A silently broken page is not.
- **Prove equivalence where you can.** If you rewrite a pure function (a formatter, the sort
  comparator, the filter pipeline), write a differential test against the original and run it over
  randomised inputs under `node`. The previous programme caught a real bug in its own change this way.
- **Do not add per-row DOM or per-page payload without measuring it.** The performance programme spent
  ten phases on this. `ui_check.js` should report DOM-node counts per rendered table so a regression
  is visible.
- **`node --check` every `.js` file and parse the inline `<script>` of every page you touch, after
  every phase.**

### A trap previous sessions hit repeatedly

The Bash tool mangles backslashes inside heredocs (`\\` collapses to `\`) and breaks on awkward
quoting. **For any file content containing regex escapes, CSS selectors with quotes, or nested
quoting — use the `Write`/`Edit` tools, or write a Python transform script to a file with `Write` and
then run it.** Do not fight the heredoc. Most of this programme is CSS and HTML strings, so this will
bite you if you ignore it.

---

## Phase summaries — the plan is authoritative, this is orientation only

### Phase 0 — Guardrails
`design_preview/index.html`, `design_preview/README.md`, `tools/ui_check.js`, a committed baseline
`UI_BASELINE.md`, and the `.claspignore` additions. **No user-visible change.** Commit, then go
straight into Phase 1 — the owner will open the harness in their own time.

### Phase 1 — Shared-layer defects (U-01…U-05)
Five verifiable bugs, five independent commits:

- **1.1 / U-02** — one line setting `document.documentElement.dir = 'rtl'`, fixing LTR-rendered
  modals, toasts and spinners on **56 of 81** pages. Expect it to *reveal* small layout bugs that the
  wrong direction was hiding — **list them, do not silently fix them**; they are budgeted as step 3.7.
- **1.2 / U-01** — portal row-action menus and combo lists to the body so `.table-wrap`'s clip box
  stops cutting them off.
- **1.3 / U-03** — `originalRows` + tri-state sort + chevron + `aria-sort`. Keep the existing O(n)
  decorate-sort-undecorate shape; do not change its complexity.
- **1.4 / U-04** — move `.num` into the shared stylesheet; remove the two duplicates from the bespoke
  themes.
- **1.5 / U-05** — sticky table header, z-index below the topbar.

### Phase 2 — Neutral canvas, unified font, token discipline
The §2.1 palette is the specification — implement it as written. 11 commits per plan §2.3: new token
block, Cairo moved into `CSS_Tokens.html`, the three theme paths rewritten in `03_Security.js`, then
the hardcoded-colour sweep **one company per commit**.

For the sweep, produce the mapping table **in the phase report** rather than as a question. Roughly 30
of the 550 literals are deliberately non-themeable (chart palettes, legend status colours) — leave
those alone and list them.

**Step 2.8 follows the D-4 standing answer:** consolidate only where the output is provably identical
under a differential test; leave and list the rest. **No displayed value may change.**

### Phase 2B — ValleyFoods manufacturing and cost visibility
> **Check first: this phase may already be done.** The owner runs
> [VALLEYFOODS_RUN_PROMPT.md](VALLEYFOODS_RUN_PROMPT.md) as a separate session *before* this
> programme. If `VALLEYFOODS_RESULTS.md` exists and the plan's Phase 2B is marked done, **skip
> Phase 2B and step 2.9 entirely** — verify they landed, note it in your report, and go straight
> from Phase 2 to Phase 3. Do not redo the work. If it is not done, execute it here as written.
Eleven commits, and the **order matters**: 2B.1 (U-47, save resolves cost server-side) → 2B.2/2B.3
(U-45, the two missing fields that make work-centre costs print as `0.000` today) → 2B.4–2B.6
(U-46, `valley_cost_view` registered and enforced) → 2B.7 (the FIFO modal) → 2B.8 (material entry).
The plan's Phase 2B section carries the full spec for each. Two things to internalise before you
start:

- **The FIFO logic and the sum rule already exist.** `autoAllocFifo_` at
  [Company_ValleyFoods_MfgOrderView.html:387](Company_ValleyFoods_MfgOrderView.html#L387) already
  allocates oldest-first, and the server already rejects a mismatched total at
  [Company_ValleyFoods_Actions.js:3972](Company_ValleyFoods_Actions.js#L3972). You are surfacing
  existing behaviour in a modal, not inventing inventory logic. Do not write a second FIFO.
- **This phase edits a file the performance programme was recently in.** Re-verify every line
  reference in `Company_ValleyFoods_Actions.js` against the current file before editing it.

### Phases 3–10
The plan is authoritative and detailed enough to execute directly. Work through them in order:
**3** icons, component polish and the **owner-requested persistent home button (step 3.8, U-42)** → **4** control panel and list view (the largest phase; convert pages
one company per commit, opt-in per page so unconverted pages render exactly as today) → **5** form
view (dirty guard and styled confirms first — they are the safety items) → **6** accessibility →
**7** documents and print → **8** dark mode, density, preferences → **9** dashboards → **10** dead
code, hygiene, and `UI_UX_RESULTS.md`.

**Step 3.8 is an explicit owner requirement, not an optional polish item.** The component already
exists — `UIC.ensureHomeLogo` at [UI_Components.html:129](UI_Components.html#L129) — but is gated at
line 134 to `ERPDashboard` / `login` / `setup` only. Remove the gate so it renders everywhere, and
fix the two things that would otherwise ship it broken: the RTL collision with `.topbar-left`, and
the `z-index: 9998` that puts it above open modals. The Phase 3 spec table in the plan is exact —
follow it, including the `aria-label`, the print rule, and taking its colours from the Phase 2 tokens
instead of the hardcoded `#fff` it uses today.

Phase 5 carries the run's sharpest risk: **a save payload must never change shape.** Walk every save
path in the harness with a stubbed `API.call` that records its payload, and diff before against after.
If you cannot prove a save is unchanged, do not ship that conversion — skip it and record why.

---

## Commit protocol

One commit per phase, or per step/module where the plan says so:

```
ui(phase-N.M): <short summary>

<what changed, file by file>
<what was verified, and how — include the ui_check.js result>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**Do not push.** The owner pushes.

---

## Final deliverable

Create **`UI_UX_RESULTS.md`** — one document, honest, in the style of `PERFORMANCE_RESULTS.md` (whose
value is that it states its own failures at the top). It must contain:

- what changed per phase, with commit hashes;
- what was skipped and why;
- every assumption made;
- **the exact visual-verification checklist the owner should walk after their first push** — this is
  the most important section, because it is the only real verification this programme will ever get;
- the `ui_check.js` baseline-vs-final comparison;
- rollback commands for every commit;
- **every standing answer you applied** (D-4 … D-8 and the rest), with what you did under each and
  anything the owner may want to revisit;
- **the blocked-on-owner register** — everything you wrote up as a proposal instead of building, and
  what each one needs from the owner to unblock.

Be honest in it. If a phase went badly, or you were unsure whether a conversion was faithful, say so
plainly.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema.
2. You will **not** add, edit, or delete any data in any business table.
3. You will **not** deploy, push, or touch the owner's Google account.
4. You will **not** touch `Company_TopChemical_Actions.js`, `Company_TopLight_Actions.js` or the
   data-layer files — another programme owns them and may be editing them right now.
   `Company_ValleyFoods_Actions.js` **is** yours, for Phase 2B only.
5. You will **not** stop for approval. You run Phases 0–10 back to back, apply the standing answers,
   record every skip and every assumption, and finish with `UI_UX_RESULTS.md`.
