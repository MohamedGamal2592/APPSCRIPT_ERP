# Realtime Feel — page loads, form entry, form edit

**Goal, as the owner stated it:** opening a page, entering a form and editing a record
should feel the way YouTube feels — the screen answers immediately, content fills in as it
arrives, and an action you take is *done* the moment you take it.

**Date:** 2026-09-07
**Branch to cut from:** `ui/table-columns` (current)
**Status:** plan only. Nothing in this document has been implemented.

---

## Invariants — true of every phase, without exception

These are not goals to balance against other goals. They are the boundary of the work, and any
step that appears to require crossing one is a step that has been designed wrong.

1. **No schema changes.** No column is added, renamed, reordered or removed in any business
   table, in any company, in the AUTH spreadsheet, or in MySQL.
2. **No data is created, edited or deleted.** This work is code only. No migration, no backfill,
   no seeding, no cleanup.
3. **No calculation changes.** Every total, cost, balance, payroll figure, aggregate and derived
   value comes out **byte-identical** to what it produces today. Nothing here is a maths change,
   and any diff that alters a computed value is a bug in this work, not an improvement.
4. **No form or table header changes.** The fields on a form, their labels, their order, their
   validation, and the column headers of every table stay exactly as they are. This work changes
   *when* things appear and *how long* they take — never *what* they say.
5. **No behaviour changes visible to a user**, beyond the four things this plan exists to change:
   things appear sooner, saves confirm instantly, other people's changes arrive on their own, and
   search stops lying about what it searched.

**Two sanctioned exceptions, both additive and both outside every business table:**

- Phase 9 adds one **queue sheet** for audit rows in transit, and Phase 10 adds one **telemetry
  sheet**, both in the AUTH spreadsheet. Neither touches a business table; neither changes an
  existing sheet's columns; both are new, separate and independently droppable.
- Phase 8's Tier 3, *if it is ever reached*, adds tables to MySQL. That tier is gated on a
  measurement nobody has taken, and Sheets remains the system of record regardless.

---

## 0. What "feels like YouTube" actually is

It is not a faster server. YouTube's server is not fast; it is 200–600 ms away and it
still feels instant. Five mechanisms produce the feeling, and only one of them is speed:

| # | Mechanism | What the user sees |
|---|---|---|
| M1 | The shell never reloads | Header, nav and chrome stay on screen through a navigation. Nothing ever goes white. |
| M2 | Skeletons, not spinners | The page's *shape* appears in <100 ms; real content replaces it in place. |
| M3 | Optimistic writes | The like button flips before the request leaves. Rollback only on a real failure. |
| M4 | Prefetch on intent | Hover or touch a thumbnail and its data is already loading before the click. |
| M5 | Cache-first, revalidate behind | Going back is instant, from memory; freshness arrives a moment later. |

This project currently implements **M3 on two pages of eighty-nine, and nothing else.**
Everything below is the work of getting the other four, in an order that pays out early.

---

## 1. What the project does today — measured, not estimated

All figures were computed from the repository at the head of `ui/table-columns`. They are
reproducible; the commands are in §8.

### 1.1 Page loads

Every in-app navigation is a **full top-frame document load**. `UIC.navTo`
([UI_Components.html:399](UI_Components.html#L399)) sets `window.top.location.href`, which
runs the whole of `doGet` ([Code.js:12](Code.js#L12)): kill-switch read, company
registration, session authentication, page-access check, then
`HtmlService.createTemplateFromFile(...).evaluate()`.

`include()` ([Code.js:554](Code.js#L554)) inlines every shared file into that output.
`HtmlService` cannot set `Cache-Control`, so **none of it is ever cached by the browser** —
the full payload is downloaded, parsed and executed again on every navigation.

| Measure | Value |
|---|---|
| Pages | 95 |
| Median inlined bytes per page | **317,414** |
| Mean | 293,865 |
| Heaviest | 424,734 (`Company_ValleyFoods_Attendance`) |

Of that, the shared bundle is identical on all 85 pages that include it:

| File | Bytes | Included by | Share of bundle |
|---|---|---|---|
| `UI_Components.html` | **268,510** | 85 pages | 87% |
| `Client_Helpers.html` | 23,583 | 85 pages | 8% |
| `CSS_Tokens.html` | 13,636 | 85 pages | 4% |

`UI_Components.html` is **37% comments and whitespace** by byte, and it is growing fast —
213,934 → 266,564 bytes across the commits of 2026-09-06/07 alone.

Then, after all of that has parsed, the page's `load()` fires and makes a **separate**
`google.script.run` round trip for its data. So a navigation is:

```
click → [ doGet: auth + template evaluate ] → [ 317 KB download ] → [ 317 KB parse ]
      → [ google.script.run: full-sheet read ] → first row painted
```

Four serialized stages, a full-screen overlay across all of them, and **one** of them
returns data.

### 1.2 Form entry and edit

| Signal | Count | Notes |
|---|---|---|
| Blocking full-screen overlay call sites | **245** across 86 files | `UI.showSpinner` / `UIC.showPageLoading` / `withPageLoading` |
| Pages using a skeleton | **1** of 89 | `UIC.listSkeleton` exists ([UI_Components.html:1611](UI_Components.html#L1611)) and is essentially unused |
| Pages using optimistic save (`UIC.Live.save`) | **2** of 89 | ValleyFoods Cash, Products |
| Pages registering a live watch (`UIC.Live.watchPage`) | **20** of 89 | all ValleyFoods |
| Save-then-refetch sites | **34** across 25 pages | a save costs two round trips |

The dominant save shape is the one in
[Company_TopLight_Sales.html:397](Company_TopLight_Sales.html#L397): validate → raise a
blocking overlay with *rotating reassurance messages* → wait → patch the list → hide. The
rotating messages are the tell. The UI is explicitly designed around the wait.

### 1.3 The realtime layer that already exists — and where it is not wired

`UIC.Live` ([UI_Components.html:5194](UI_Components.html#L5194)) is good work and is the
right foundation. `save()` does the full optimistic dance including exact rollback;
`watchPage()` polls `get_page_versions` for opaque per-table timestamps, floors the
interval at 10 s, pauses on a hidden tab, stands down after 15 idle minutes, and backs off
exponentially on failure.

Two gaps stop it delivering.

**Gap A — only one company is wired.** `get_page_versions` is registered in
[Company_ValleyFoods_Actions.js:471](Company_ValleyFoods_Actions.js#L471) and nowhere else.

| Company | Pages | Write pages | Optimistic save | Live watch |
|---|---|---|---|---|
| ValleyFoods | 25 | 21 | 2 | **20** |
| TopChemical | 32 | 24 | 0 | **0** |
| TopLight | 20 | ~9 | 0 | **0** |
| Assessment / Platform | 9 | 0 | 0 | 0 |

The good news: `PAGE_TABLES` is *derived*, not configured
([Company_ValleyFoods_Actions.js:332](Company_ValleyFoods_Actions.js#L332)) — it joins
`PAGE_ACCESS` and `ACTION_TABLES`, and **all four companies already have both maps.**
Porting the endpoint is ~15 lines per company with no new configuration to maintain.

**Gap B — the change stamp misses most writes. This is a defect, not a gap in coverage.**

`noteTableChange_` ([02_DataAccess.js:321](02_DataAccess.js#L321)) is called from exactly
three places, all inside the shared data layer: `addRecord_`, `updateRowByCriteria_`, and
the delete helpers.

Company code writes to sheets directly in roughly **124 places**
(`setValues` / `setValue` / `appendRow` / `deleteRow` across the three company action
files). Those sites call `noteMutation_()` — 67 times in ValleyFoods alone — and
`noteMutation_` ([02_DataAccess.js:100](02_DataAccess.js#L100)) **only disables the
per-request memo. It does not stamp anything.**

Consequence, stated plainly: on a watched page, a change written by one of those handlers
produces **no version bump**, so a second device polling `get_page_versions` never learns
about it. `saveValleyReturn_`, `transferValleyCash_` and `addMonthlySalary_` are three
confirmed examples. The live watch on those pages is decorative.

### 1.4 What is already solid — do not re-do this

- **Authority and session caching.** Generation-keyed, invalidated by bump rather than
  expiry, with a documented staleness ceiling ([00_Config.js](00_Config.js),
  [02_DataAccess.js:974](02_DataAccess.js#L974)). This is the right design and needs no work.
- **Chunked `CacheService`** ([02_DataAccess.js:780](02_DataAccess.js#L780)) — correctly
  handles the 100 KB value limit that silently defeated the old refs cache.
- **Per-request memo with a shape guard** ([02_DataAccess.js:544](02_DataAccess.js#L544)).
- **Structural uniformity.** 81 of 82 company pages share the same head/body/include
  shape; 70 of 89 build their chrome from `UIC.appShell`, entirely client-side from
  `COMPANY_PAGES` and the session. This is what makes Phase 6 possible at all.
- **A real verification harness** — `tools/verify/` with a DOM stub, a GAS stub, a page
  harness and 40+ checks, runnable under node with no deployment.

### 1.5 There is no index anywhere, and search is silently incomplete

Every retrieval in the Sheets-backed part of the system is a **full table scan**.

- `getAllRecords_` ([02_DataAccess.js:544](02_DataAccess.js#L544)) is always
  `sheet.getDataRange().getValues()` — the entire grid, every column, every row.
- `getRecordsByPk_` ([02_DataAccess.js:848](02_DataAccess.js#L848)) *looks* like an index
  and is not one: it calls `getAllRecords_` first and then builds a `Map` over the result.
  It removes O(n) scans **after** the read; it does not reduce the read.
- The only endpoint with a `search` parameter,
  `getLegalProductsMovement_` ([Company_TopChemical_Actions.js:3276](Company_TopChemical_Actions.js#L3276)),
  reads the whole sheet and then runs a JavaScript `.filter()` with `indexOf`. That is a
  linear scan over the full table on every keystroke-driven request.

**And a correctness consequence, not just a performance one.** All UI search and filtering
is client-side over rows already in memory — `UIC._dtSearchInput` /
`UIC._applyFilters` ([UI_Components.html:1922](UI_Components.html#L1922)) filter
`st.originalRows` and never call the server. But list endpoints default to the **newest
10 rows** (`rows.slice(0, limit)`, `limit = 10`, at six or more sites in
[Company_ValleyFoods_Actions.js](Company_ValleyFoods_Actions.js) alone — lines 769, 854,
986, 1552, 1699, 1840).

So on المشتريات and every page like it, the search box is rendered with
`searchable: true` over a ten-row list. **A user searching for a supplier that exists gets
"no results", with nothing to indicate the search only looked at ten rows.** The user must
know to press عرض الكل first. This is a live bug, and it is the thing the owner is most
likely feeling as "hard to find anything".

### 1.6 One place already does this properly

The project **already runs a real indexed database in production.**
[DbLive_Connector.js](DbLive_Connector.js) holds a working JDBC connector to MySQL, and
TopChemical's تحليل حركة الخزنة page queries it with proper server-side retrieval —
bound parameters, `WHERE`, `ORDER BY`, `LIMIT`/`OFFSET` and a separate `COUNT(*)` for
paging ([DbLive_Connector.js:677](DbLive_Connector.js#L677)), with identifier sanitisation
([DbLive_Connector.js:386](DbLive_Connector.js#L386)) and one audited write path.

That table (`regular_box_movement`) lives natively in MySQL — it is not mirrored from
Sheets, so no sync path exists yet. But the connector, the credential handling, the
sanitisation, the pagination shape and the page pattern are all proven here, in this
repository, against this deployment. Indexed retrieval is not a hypothetical for this
project.

### 1.7 The audit trail and the system log are both on the request path

A save does not return when the business row is written. It returns when the **audit trail** and
the **system log** have also been written, both into the shared AUTH spreadsheet, both
synchronously, before the user hears anything.

- `saveRecordWithAudit_` ([02_DataAccess.js:1171](02_DataAccess.js#L1171)) calls `logHistory_`
  inline, after the row is already saved. On an edit that changes ten columns that is **ten
  history rows**, because `historyRowsFor_` emits one row per changed column.
- `writeHistoryRows_` ([02_DataAccess.js:1110](02_DataAccess.js#L1110)) is already well
  optimised — one lock, one id allocation, one `setValues` instead of N appends. But that lock is
  `LockService.getScriptLock()` ([02_DataAccess.js:381](02_DataAccess.js#L381)), which is
  **script-global**. Every save in every company queues behind every other save in the system for
  its audit write.
- `logSystemAction_` ([Code.js:813](Code.js#L813)) then appends a `SystemLog` row — also in the
  AUTH spreadsheet, also before the response — carrying `JSON.stringify(result.data)` for writes.

So the user's wait is: business write → global lock → id allocation → audit `setValues` → lock
release → `SystemLog` append → response.

**And there is a defect in it.** The two branches of `saveRecordWithAudit_` treat a failed audit
write differently:

- **create** (L1190) wraps `logHistory_` in `try/catch` and logs `AUDIT-SKIPPED` — the save
  succeeds.
- **update** (L1209) does **not**. A history failure throws *after* `updateRowByCriteria_` has
  already committed the change.

The result is a save that returns an error for a change that is now in the sheet. Today that shows
the user a false failure. **After Phase 2 it becomes worse**: the client rolls the optimistic row
back, so the screen and the spreadsheet actively disagree. Phase 9 fixes the asymmetry, and it
must land before or with Phase 2's rollout — noted as a dependency in §3.

### 1.8 The one thing nobody has measured

Server wall-clock time in production. The instrumentation exists and is committed
(`SystemLog.ElapsedMs`, `SystemLog.SheetReads`, `ERP_Client_Perf`), but `PERF_LOG_READS`
has never been switched on for a real week — see [PERF_BASELINE.md](PERF_BASELINE.md).
**Every server-side number in this plan is a byte count or a code path, not a
millisecond.** Phase 0 fixes that, and it must run first, because Phase 7 cannot be scoped
without it.

---

## 2. The phases

Ordered by *felt improvement per unit of risk*, not by size. Phases 1–3 are where the
"YouTube" impression actually comes from; 4–7 make it hold up under load.

| Phase | Delivers | Risk | Owner step |
|---|---|---|---|
| 0 | An honest baseline | none | yes — one Script Property |
| 1 | Screens stop going blank | low | no |
| 2 | Saves feel instant | low–medium | no |
| 3 | Other people's changes actually arrive | medium | no |
| 4 | Forms open with no wait | low | no |
| 5 | Half the bytes, half the parse | medium | no |
| 6 | The shell never reloads | high | yes — staged deploy |
| 7 | The server stops re-reading whole sheets | medium | gated on Phase 0 |
| 8 | Indexed retrieval and search that finds everything | med–high | yes — run `inventorySpreadsheets()` |
| 9 | The form stops waiting for the audit trail | medium | no |
| 10 | Response times recorded permanently, reviewed weekly | low–med | no |

---

### Phase 0 — Measure, so the rest is not guesswork

**Goal.** Know what a page load actually costs, split into server / transfer / parse /
data, before optimising any of it.

**Why.** §1.5. The repository can tell you it ships 317 KB; only production can tell you
whether the 317 KB or the sheet read is the wall.

**What changes.**

1. Owner sets Script Property `PERF_LOG_READS = 1` and leaves it for **five working
   days**, then sets it to `0`. This is the week [PERF_BASELINE.md](PERF_BASELINE.md)
   asked for and never got.
2. Extend `PERF` ([Client_Helpers.html:483](Client_Helpers.html#L483)) to report a
   four-part navigation timeline instead of two coarse marks, from
   `performance.getEntriesByType('navigation')`:
   - `nav_server` — `responseStart - requestStart` (what `doGet` cost)
   - `nav_transfer` — `responseEnd - responseStart`
   - `nav_parse` — `domContentLoadedEventEnd - responseEnd` (the 317 KB tax)
   - `first_data_render` — already exists; keep it
3. Add `transferSize` and `decodedBodySize` so the gzip ratio is known rather than assumed.
4. Batch the four marks into **one** `google.script.run`, not four. The current
   `PERF.send` fires per metric; at four metrics per navigation on a live system that
   measurement would itself become load.

**Files.** `Client_Helpers.html`, `Code.js` (`logClientPerf_`, [Code.js:631](Code.js#L631)).

**Verify.** `tools/verify/rt0_perf_marks.js` — one call per navigation, all four metrics
present, everything inert when `window.PERF_LOG !== true`.

**Exit criterion.** A table of p50/p90 for the four stages across the ten most-used pages.
**Phase 7 is not scoped until this table exists.**

**Risk.** None. Off by default; one round trip when on.

---

### Phase 1 — Stop blocking. Skeletons instead of overlays

**Goal.** No screen in the application ever goes blank or grey-modal on a *read*.

**Why.** 245 blocking overlay sites across 86 files (§1.2). A full-screen overlay is the
single most anti-YouTube thing in the codebase: it converts "content is arriving" into
"you may not touch anything". It also *hides* the shell, so even the parts already on
screen become unusable. This phase is the largest felt improvement in the plan and carries
the least risk, because it changes only what is drawn during a wait.

**What changes.**

1. **Establish the rule** where it cannot be missed — one comment block at the top of
   `UIC.showPageLoading` ([UI_Components.html:692](UI_Components.html#L692)):

   > A full-screen overlay is for a **write the user must not interrupt** and for nothing
   > else. A read draws a skeleton in place. A background refresh draws nothing.

2. **Promote `UIC.listSkeleton`** ([UI_Components.html:1611](UI_Components.html#L1611))
   from an unused helper to the default. Add:
   - `UIC.tableSkeleton(containerId, headers, rows)` — renders the real `<thead>` with the
     real column widths from `UIC.autoColumns`, and shimmer rows beneath. Because the
     header is real, **the table does not reflow when data lands** — which is what makes a
     skeleton read as "loading" rather than as a jump.
   - `UIC.formSkeleton(containerId, fieldCount)` for modal bodies.
   - `UIC.cardSkeleton` for the dashboards.
3. **Convert the read paths.** Every `renderList` / `load` / `showList` that today opens
   with `UI.showSpinner()` opens with `UIC.tableSkeleton(...)` instead. The `quiet` flag
   rolled out in S20 already marks which refreshes must draw nothing at all; this phase
   extends the same idea to first paint.
4. **Paint the shell before the data call, not after.** Several pages call `UIC.appShell`
   inside the `.then()` of their first fetch. Hoist every one of those above the fetch so
   nav and header are on screen in the first frame.
5. **Keep the overlay for writes** — until Phase 2 replaces it there too.

**Scope.** 86 files, ~180 of the 245 sites (the rest are genuine writes). Mechanical, one
page at a time, independently shippable.

**Files.** `UI_Components.html`, all `Company_*.html`.

**Verify.** `tools/verify/rt1_skeletons.js`:
- no `showPageLoading` / `withPageLoading` remains in a function whose name matches
  `^(load|render|show)(List|Data|Table)?$`
- every list page calls a `*Skeleton` before its first `companyCall`
- `appShell` is not inside a `.then()`

Reuse the comment-stripping and function-scope machinery already written in
[tools/verify/s20_quiet_refresh.js](tools/verify/s20_quiet_refresh.js).

**Budget.** Time to first meaningful paint drops to shell-render time — target
**< 150 ms after parse**, independent of the data call.

**Risk.** Low. Purely presentational. Rollback is per-page.

---

### Phase 2 — Optimistic writes everywhere

**Goal.** Submitting a form closes it *immediately* and the row is on screen *immediately*.
The server is confirmed afterwards, and only a real failure is visible.

**Why.** This is the owner's stated ask — "form entries, form edit … feel like realtime".
`UIC.Live.save` already does the whole job correctly, including exact rollback, and is
used on **two pages of eighty-nine**. This phase is mostly *deletion*: the hand-rolled
save/patch/reload code on 25 pages collapses into a call to a primitive that already
exists and is already verified by `s19`.

**What changes.**

1. **Convert each write page** to `UIC.Live.save`. The transform is mechanical because the
   ingredients are already present on every page — an in-memory list, an identity field, a
   render function. [Company_TopLight_Sales.html:397](Company_TopLight_Sales.html#L397) is
   the canonical example: it already patches `__headers` from `r.record` and already knows
   the key is `invoice_unique_id`. It becomes:

   ```js
   UIC.Live.save({
     call: companyCall, action: isEdit ? 'edit_sales' : 'add_sales',
     data: payload, list: __headers, key: 'invoice_unique_id',
     draft: draftRowFrom(header), render: renderHeadersTable,
     modal: 'sales-form-modal', message: 'تم الحفظ',
     recordOf: function (r) { return r.record; },
     reload: showList
   });
   ```

   The blocking overlay and its three rotating reassurance messages are **deleted**. So is
   the `showList()` fallback on the success path — that is the second round trip this
   phase exists to remove.

2. **Every write handler must return the saved record.** The optimistic patch is only
   correct if the server's version — with its assigned id and computed fields — replaces
   the draft. Audit all `save_*` / `add_*` / `edit_*` handlers across the three company
   action files and add `record:` to any reply that lacks it. Where a handler genuinely
   cannot return one (multi-sheet commits), it declares so and the page passes `reload`,
   which `UIC.Live.save` already honours.

3. **Extend `UIC.Live.save` with two things it needs at this scale:**
   - **A write queue with retry.** Today a failed save rolls back and toasts. On a phone
     on site that is the common case, not the edge case. Queue the payload, retry with
     backoff, and surface a persistent "1 change not saved — retry" chip rather than a
     toast that vanishes in three seconds.
   - **A navigation guard.** `UIC.trackDirty`
     ([UI_Components.html:2930](UI_Components.html#L2930)) already guards unsaved *form*
     state; it must also refuse to leave while `UIC.Live.busy()` is true, or an optimistic
     row is lost with the page that drew it.

4. **Delete `UI.showSpinner` from every converted save path.** After this phase the
   overlay survives only where a write genuinely blocks — a batch commit, an import.

**Scope.** ~54 write pages (21 ValleyFoods, 24 TopChemical, ~9 TopLight) and the write
handlers behind them.

**Files.** `UI_Components.html`, all write-capable `Company_*.html`, all three
`Company_*_Actions.js`.

**Verify.** Extend [tools/verify/s19_live_rollout.js](tools/verify/s19_live_rollout.js)
from ValleyFoods-only to all four companies — it already reports converted vs pending, so
the remaining work stays visible while the migration is staged. Add:
- `rt2_record_replies.js` — every registered write action returns `record`, or is on an
  explicit exemption list with a stated reason
- `rt2_queue.js` — a failed save leaves the list byte-identical to its pre-save state
  (the rollback path, exercised through the existing page harness)

**Budget.** Perceived save latency **0 ms**. Round trips per save: 2 → **1**.

**Risk.** Medium, and worth naming precisely: an optimistic row the server later rejects
was, for a moment, a lie. This is why the rollback path gets its own verifier, why the
retry chip is persistent rather than a toast, and why the phase is staged per page rather
than landed at once.

---

### Phase 3 — Make the live watch tell the truth

**Goal.** A change made by another person appears on your screen without you doing
anything — on every page, in every company.

**Why.** Gap A and Gap B in §1.3. Today the watch runs on 20 pages and, on several of
them, watches a stamp the save path never bumps.

**What changes.**

1. **Fix the stamp gap — this is a bug fix and ships first, alone.**
   Give `noteMutation_` the arguments it should always have had:

   ```js
   function noteMutation_(scopeId, sheetName) {
     if (scopeId && sheetName) noteTableChange_(scopeId, sheetName);
     if (_recordCacheDisabled_) return;
     disableRecordCache_();
   }
   ```

   The signature stays backward-compatible — the ~124 existing no-arg calls keep working
   exactly as today — and then each call site is given its two arguments. Where a site
   holds a `Sheet` rather than ids, `noteSheetChange_`
   ([02_DataAccess.js:330](02_DataAccess.js#L330)) already covers it.

2. **A verifier that keeps it fixed.** `rt3_stamp_coverage.js`: every `setValues(` /
   `appendRow(` / `deleteRow` in company code must be within N lines of a stamping call
   (`noteMutation_` with arguments, `noteSheetChange_`, or a data-layer helper that stamps
   internally). Unstamped sites are listed with file:line and fail the build. Without this
   the gap silently reopens on the next feature.

3. **Port `get_page_versions` to TopChemical, TopLight and Assessment.** ~15 lines each:
   lift the `PAGE_TABLES` derivation from
   [Company_ValleyFoods_Actions.js:332](Company_ValleyFoods_Actions.js#L332), lift
   `getPageVersions_` with its explicit page-level read gate, register the action. No new
   configuration — both source maps already exist in all four files.

4. **Register the watch on every list page** in those companies, mirroring the 20 that
   already have it.

5. **Then, and only then, make the arrival graceful.** Today `onChange` triggers a full
   quiet refetch. Replace with:
   - a non-intrusive chip — "3 new rows · اضغط للتحديث" — when the user is scrolled away
     or has a form open; the list must **never** move under someone reading or typing
   - an in-place merge with a brief highlight when they are at the top and idle
   - and keep the existing rule that the poll stands down while a save is in flight

6. **Interval policy, stated so it is not quietly lowered later.** The 10 s floor,
   hidden-tab pause and 15-minute idle stop in `watchPage` are a **quota budget**, not a
   tuning knob. Twenty users at 30 s cost ~2,400 executions per working day before anyone
   saves anything. Rolling the watch from 20 pages to ~70 multiplies the *page* count, not
   the per-user cost — a user has one page open — but it must be re-stated in the code and
   re-checked after rollout against real execution counts.

**Files.** `02_DataAccess.js`, all `Company_*_Actions.js`, `UI_Components.html`, list pages.

**Verify.** `rt3_stamp_coverage.js` (new, gating), extend `s19` to all companies, extend
`s20`'s page-id check to the new registrations.

**Budget.** Another device's change visible within **one poll interval, 100% of the
time** — measurable as: for every write action, a corresponding stamped table.

**Risk.** Medium. Step 1 is a genuine bug fix and should ship on its own so it can be
judged on its own. Steps 3–4 raise execution volume; they land company by company with
`SystemLog` watched between each.

---

### Phase 4 — Forms that open with nothing to wait for

**Goal.** Clicking "add" or "edit" opens a fully populated form in the same frame as the
click.

**Why.** Two round trips still sit in front of a form. Reference options (`get_*_options`)
are fetched on first form open — good, that was Phase 2.1 of the earlier performance work
— but it is still a wait the first time, on every page, on every navigation, because
nothing survives the page load (§1.2: `localStorage` holds prefs, column widths and the
session, and **no data at all**). And several edit paths re-fetch a record the list
already has — [Company_ValleyFoods_Purchasing.html:337](Company_ValleyFoods_Purchasing.html#L337)
fetches lines the user is about to see, behind a blocking overlay.

**What changes.**

1. **`UIC.Cache` — a stale-while-revalidate store over `localStorage`.**

   ```js
   UIC.Cache.get(key, {maxAge, revalidate})   // returns the cached value NOW, refreshes behind
   UIC.Cache.put(key, value)
   UIC.Cache.bust(tablePrefix)                // called from the Live watch on a version bump
   ```

   Keyed by `company + action + a hash of the payload`, versioned by the same table stamps
   Phase 3 makes reliable, and hard-capped (~4 MB, LRU eviction) because `localStorage`
   quota failures must degrade to a normal fetch, never to a broken page. Every read is
   wrapped in `try/catch` — Safari private mode throws on access.

2. **Options come from cache first.** `ensureOptions()` on every page resolves from
   `UIC.Cache` synchronously when warm and revalidates behind. A form opens with its
   dropdowns already populated.

3. **Edit opens from memory.** Where the list row already holds what the form needs, the
   modal opens from that row with **zero** round trips; line detail (`get_*_lines`) loads
   into the already-open form behind a small inline skeleton — not behind a full-screen
   overlay that hides the form the user is trying to fill.

4. **Prefetch on intent (M4).** Replace the fixed 2-second `schedulePrefetch`
   ([Client_Helpers.html:523](Client_Helpers.html#L523)) with intent signals:
   - `mouseenter` / `touchstart` on a nav link → prefetch that page's options into `UIC.Cache`
   - `mouseenter` on a row's edit button → prefetch its lines
   - `requestIdleCallback` after first paint → prefetch the options for *this* page's form

   Debounced, deduplicated, capped at ~3 in flight, and abandoned when the tab hides.

5. **Persist the last list per page** so a return navigation paints from cache instantly
   and revalidates behind. This is M5, and it is what makes going "back" feel free.

**Files.** `UI_Components.html` (new `UIC.Cache`), `Client_Helpers.html`, all form pages.

**Verify.** `rt4_cache.js` — eviction under quota pressure, a throwing `localStorage`
degrades to a plain fetch, a version bump busts the right keys and only those, and no
cached value is ever rendered without a revalidation being scheduled.

**Budget.** Form open **< 100 ms**, zero round trips on a warm cache.

**Risk.** Low–medium. The failure mode is showing a stale option list. Mitigated by
binding eviction to the Phase 3 stamps — which is why Phase 4 must not ship before Phase 3.

---

### Phase 5 — Halve the bytes and the parse

**Goal.** Cut the fixed cost every navigation pays before any of its own code runs.

**Why.** §1.1 — 306 KB of shared bundle, 87% of it `UI_Components.html`, on every
navigation, never cached, growing ~25 KB/day at the current rate. Gzip helps the transfer
and does nothing for the **parse and execute**, which is the part that blocks first paint.

**What changes.**

1. **Strip comments and whitespace at include time.** `include()`
   ([Code.js:554](Code.js#L554)) gains a minify pass, with the result held in
   `CacheService` keyed by a content hash so it runs once per deploy, not once per request.
   Measured saving: **37% of `UI_Components` and `Client_Helpers`, 48% of `CSS_Tokens`** —
   about **110 KB per page load**, for no behavioural change and no source-file change.
   The comments in this codebase are unusually valuable; this keeps every one of them in
   source and removes them only from the wire.
2. **Split `UI_Components.html`** along lines the file already suggests:
   - `UI_Core` — tokens, shell, nav, toast, modal, loading, formatters (every page)
   - `UI_Table` — the data-table engine, grouping, column prefs, export (list pages)
   - `UI_Charts` — chart defaults and palette (5 pages)
   - `UI_Extras` — print, history side panel, preferences (on demand)

   Pages include what they use. A dashboard stops paying for the table engine.
3. **Set a byte budget and enforce it.** `rt5_budget.js` fails the build when any page's
   resolved inline payload exceeds **180 KB**. The 214 → 267 KB drift over two days
   happened because nothing was watching; this is what watches.
4. **Defer what is not needed for first paint** — the history panel, preferences, print,
   export — behind the same on-demand loader pattern `API.ensureXlsx`
   ([Client_Helpers.html:129](Client_Helpers.html#L129)) already uses successfully.

**Files.** `Code.js`, `UI_Components.html` → four files, all page heads.

**Verify.** `rt5_budget.js` (gating). Plus an equivalence check: the minified bundle must
expose an identical set of `UIC.*` and `window.*` symbols to the unminified one — run both
through the existing `tools/verify/domstub.js` harness and diff the exported surface.

**Budget.** Median page **317 KB → < 180 KB**. Parse time roughly halved.

**Risk.** Medium — a minifier that mangles a template string or an Arabic literal breaks
pages silently. Mitigations: comment/whitespace stripping only (**no identifier
mangling**, because `UIC.*` is a cross-file public surface), the symbol-equivalence check
above, and a `?nominify=1` escape hatch for one deploy cycle.

---

### Phase 6 — Soft navigation: the shell stops reloading

**Goal.** M1. Clicking a nav item swaps the content region. The header, nav, drawer and
scroll position stay. Nothing goes white, ever.

**Why.** This is the largest single difference remaining, and what the whole plan builds
toward. It is also the riskiest, which is why it comes last among the felt-experience
phases — Phases 1–4 must have already made the app feel fast, so this is an improvement
rather than a rescue.

**Feasibility — established, not assumed:**
- 81 of 82 company pages share an identical head/body/include shape (§1.4)
- 70 of 89 build their chrome from `UIC.appShell`, which reads only `COMPANY_PAGES`,
  `CURRENT_ACTION` and the session — **all available client-side, no server input**
- page bodies use only four server scriptlets: `getCompanyThemeCSS_`,
  `getCompanyLogoUrl_`, `currentAction`, `companyPages`
- every page already loads its data through `google.script.run`, never through the template

So a page's server render contributes: the shared bundle (identical every time), four
small values, and the page's own body plus script.

**What changes.**

1. **A body-only render endpoint.** `get_page_body(action)` returns
   `{ html, script, title, themeCss }` for an authorized page — the same
   `createTemplateFromFile(...).evaluate()` path `doGet` uses, with the shared `include()`s
   suppressed (they are already in the document). Runs the **identical**
   `checkPageAccessForUI_` gate as `doGet` ([Code.js:69](Code.js#L69)); a soft navigation
   must never be a way around an authorization check.
2. **A client router.** `UIC.Router.go(action)`:
   - `pushState`, so the address bar, deep links and back/forward keep working
   - swap the content region, run the page script in an isolated scope
   - `popstate` restores from cache instantly (M5)
   - **fall back to a hard navigation on any error** — this is the safety valve, and it
     means the worst case of Phase 6 is exactly today's behaviour
3. **A page lifecycle**, because page scripts currently assume they own the document:
   `mount(container)` / `unmount()`. `unmount` must clear the page's `Live.watchPage`, its
   timers and its listeners, or a long session leaks a poll per page visited.
4. **Convert progressively.** A page opts in with a registration line; anything not
   converted hard-navigates as it does today. Both modes coexist indefinitely — no flag day.

**Files.** `Code.js` (new route), `UI_Components.html` (router, lifecycle), page bodies
(one registration line each).

**Verify.** `rt6_router.js` — every converted page declares `mount`/`unmount`, `unmount`
clears every watch and timer it started, an unauthorized action never returns a body, and
a thrown error falls back to hard navigation. Exercise through
`tools/verify/pageharness.js`.

**Budget.** Navigation **< 300 ms** to first paint of the new screen; **0 bytes** of shared
bundle re-downloaded or re-parsed.

**Risk.** High, concentrated in three places: the authorization gate on the new endpoint,
listener/watch leaks across navigations, and page scripts that assume document-level
ownership. Ship behind a per-page opt-in with the hard-navigation fallback always live,
and enable it on two low-traffic pages for a week before widening.

---

### Phase 7 — Server read cost

**Goal.** Stop reading whole sheets to render ten rows.

**Why.** `getAllRecords_` ([02_DataAccess.js:544](02_DataAccess.js#L544)) is always
`sheet.getDataRange().getValues()`. The per-request memo and the chunked refs cache take
the repeat cost out; neither takes out the *first* read, which is the one the user waits
for. `get_valley_purchasing_costing` reads three full sheets to return ten rows.

**Gated on Phase 0.** Which endpoints are actually slow is exactly what the measurement
week answers, and scoping this from static analysis is how the earlier performance run
ended up unable to size its largest item.

**What changes (subject to what Phase 0 shows).**

1. **Server-side pagination as the default** for list endpoints: newest N with a cursor,
   the pattern ValleyFoods Purchasing already uses, applied consistently.
2. **Column-narrowed reads.** `getAllRecords_` gains an optional projection so a list that
   needs 8 of 46 columns reads 8. `maxIdOf_` ([02_DataAccess.js:363](02_DataAccess.js#L363))
   already proves the technique — it reads one column under the global lock precisely
   because the whole sheet was too expensive there.
3. **A delta endpoint.** With Phase 3's stamps reliable, `get_page_changes(since)` can
   return only rows touched since a timestamp — turning the poll from "something changed,
   refetch everything" into "here are the three rows that changed". This is the endpoint
   that makes the watch cheap enough to run everywhere.
4. **Batch the boot.** Pages making several sequential calls on load (`0_ERP_Management`
   has 16 call sites; Attendance and MfgOrders 17 each) get one `get_page_bootstrap`
   returning list + options + permissions together.

**Files.** `02_DataAccess.js`, all `Company_*_Actions.js`.

**Verify.** `rt7_reads.js` — asserts `SheetReads` per endpoint against a recorded ceiling,
using the counter [02_DataAccess.js:39](02_DataAccess.js#L39) already maintains.

**Budget.** Set from the Phase 0 table. Provisionally: p90 list endpoint **< 800 ms**.

**Risk.** Medium. Pagination changes what users see by default — the owner has already had
to be consulted once on exactly this (decision B in
[NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md)), and every further instance needs the same
consultation.

---

### Phase 8 — Indexed retrieval, and search that finds everything

**Goal.** Finding a record stops being a scan. A search box searches the *table*, not the
ten rows that happen to be loaded.

**Why.** §1.5. There is no index anywhere in the Sheets-backed system, and the visible
symptom is a search box that silently lies. Phases 4 and 7 make scans *smaller* and
*rarer*; neither makes retrieval indexed. This phase is the one that does.

**Feasibility, stated honestly.** Google Sheets itself has no index and cannot be given
one — there is no `CREATE INDEX`, and `getDataRange().getValues()` pulls the whole grid
across the RPC boundary. But *indexed retrieval* is entirely achievable, at three
increasing tiers. The tier you need depends on one number nobody has measured.

---

**Step 1 — Fix the lying search box first. This is a bug and ships immediately.**

Independent of any indexing work, and cheap. Three options in ascending order of effort;
take the first that fits each page:

- Where a table is small, load it fully and drop the `slice(0, 10)`.
- Where it is not, make the search box **server-backed**: typing calls the endpoint with
  `search` + `limit`, debounced ~250 ms, instead of filtering memory.
- Until either lands, `UIC.dataTable` must not render `searchable: true` over a truncated
  list without saying so — show "بحث في آخر ١٠ سجلات · عرض الكل للبحث في الكل" beside
  the box. **A search that quietly misses records is worse than no search box.**

**Step 2 — Measure before choosing a tier.**

Run `inventorySpreadsheets()` ([09_Inventory.js:28](09_Inventory.js#L28)). It is
read-only, already written, already committed, and **has never been run** — it is item 4
in [NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md). It reports rows, columns, cells and formula
cells per sheet. That table decides everything below:

| Largest hot table | What to do |
|---|---|
| < ~5,000 rows | **Stop.** Phase 7's pagination and column narrowing are sufficient. Indexing here is over-engineering. |
| ~5,000–50,000 rows | **Tier 1** — a maintained index over Sheets. |
| > ~50,000 rows, or text search across all of it | **Tier 3** — mirror to the MySQL you already run. |

Sheets' own ceiling (10M cells per spreadsheet) is a separate wall worth knowing the
distance to, and this is the same report that tells you.

---

**Tier 1 — A maintained index, everything stays in Sheets.**

1. **An index structure per hot table**: `key → row number`, plus a small normalised token
   map for the two or three columns people actually search (code, name, supplier).
2. **Stored where it survives**: the chunked `CacheService`
   ([02_DataAccess.js:780](02_DataAccess.js#L780)) already handles the 100 KB value cap,
   giving ~4.5 MB of index; persist a copy to a hidden `_index_<table>` sheet or a Drive
   JSON blob so a cold cache costs one rebuild, not a rebuild per request.
3. **Retrieve by row, not by table.** The advanced Sheets service is already enabled in
   [appsscript.json](appsscript.json). `Sheets.Spreadsheets.Values.batchGet` fetches N
   specific A1 ranges in **one** call — so "give me these 25 matching rows" costs one
   round trip instead of a full-sheet read. This is the whole payoff, and it is the part
   `getRecordsByPk_` was reaching for and did not get.
4. **Keep it current on write** — via the Phase 3 stamp hook, which is exactly the signal
   for "this table moved, patch or drop its index".
5. **Normalise Arabic before indexing.** أ/إ/آ→ا, ة→ه, ى→ي, strip tatweel and diacritics.
   Without this a token index over Arabic silently misses on spelling variants — worse
   than the scan it replaced, because the scan at least used `indexOf`.

Cost: real but contained; no new infrastructure; no second source of truth.
Limit: it is a hash/token index, not a query engine. Ranges, joins and aggregates stay scans.

**Tier 2 — Push the scan to Google (`gviz` / `QUERY`). A stopgap, not an architecture.**

The Visualization Query endpoint accepts `SELECT … WHERE … ORDER BY … LIMIT` over a sheet
and returns only matching rows, which cuts transfer sharply and moves the work off the
Apps Script quota. It is still a scan, it is not a supported API for this purpose, and it
adds an external HTTP dependency and an auth wrinkle for private sheets. Worth knowing
about; not worth building on.

**Tier 3 — Mirror hot tables into the MySQL already running.**

§1.6: the connector, credentials, sanitisation, bound parameters, pagination and an
audited write path all exist and are in production.

1. **Sheets stays the system of record.** People keep editing sheets. MySQL becomes a
   **read and search replica** — this is the decision that keeps the change reversible.
2. **Write-through on save** (the save handler already knows the record — Phase 2 makes it
   return it) plus a **nightly reconciliation** that re-syncs by `updated_at` and reports
   drift. Write-through alone will drift; the reconciler is not optional.
3. **Then the real wins become available**: B-tree indexes on the columns people filter,
   `FULLTEXT` with the `ngram` parser for Arabic text search, `COUNT(*)` for honest
   pagination, joins that replace multi-sheet reads, and aggregates computed in the
   database instead of in Apps Script.
4. **Measure the JDBC connection cost first.** `Jdbc.getConnection`
   ([DbLive_Connector.js:86](DbLive_Connector.js#L86)) opens a fresh connection per
   request and closes it in `finally`. If that handshake costs 300–500 ms it can eat the
   gain on small queries — so the first task in this tier is to time it against the Box
   Analysis page, which is already doing exactly this in production and can be measured
   today with no new code.

**Files.** `02_DataAccess.js` (index layer, `batchGet` retrieval), `UI_Components.html`
(server-backed search in `dataTable`), `Company_*_Actions.js` (search endpoints),
`DbLive_Connector.js` + a new sync module if Tier 3.

**Verify.**
- `rt8_search_scope.js` (gating, ships with Step 1) — no table renders `searchable: true`
  over a server-truncated list without either a server-backed search or the explicit
  notice
- `rt8_index.js` — index and sheet agree after a write, a cold cache rebuilds correctly, a
  partial cache eviction is treated as a total miss (the rule `getChunkedCache_` already
  follows), and Arabic normalisation is symmetric between index and query
- Tier 3 only: `rt8_sync.js` — the reconciler detects an injected drift and reports it
  rather than silently repairing it

**Budget.** Search returns results from the **whole table**, 100% of the time. Retrieval of
a known record: **1 `batchGet`**, not a full-sheet read. Search p90 **< 500 ms**.

**Risk.** Medium at Tier 1 — a stale index serves wrong results with confidence, which is
why it binds to the Phase 3 stamps and why the verifier checks agreement after a write.
High at Tier 3 — a second copy of the data is a second thing that can be wrong; mitigated
by Sheets remaining authoritative, by read-only replication, and by a reconciler that
reports rather than repairs.

**Dependency.** Step 1 depends on nothing. Everything after it needs Phase 3 (the stamps
are the invalidation signal) and the Phase 0 / inventory numbers.

---

### Phase 9 — Get the audit trail off the request path

**Goal.** The form closes and the row appears the moment the business row is written. The history
lands a few seconds later, on its own, and the user never waits for it.

**Why.** §1.7. Today the audit write is between the user and their confirmation, and it holds the
script-global lock while it is there. This is the server-side half of the same idea Phase 2
implements on the client: the work that *must* be right and the work that must be *immediate* are
not the same work, and only one of them belongs in the request.

**What changes.**

1. **Fix the create/update asymmetry first — this is a bug and ships alone.**
   Wrap the `update` branch's `logHistory_` in the same `try/catch` the `create` branch already
   has, logging `AUDIT-SKIPPED` identically. A committed change must never be reported as a
   failure. **This lands before Phase 2's rollout**, because Phase 2 turns a false failure into a
   screen that disagrees with the sheet.

2. **A durable queue, not a cache.** Audit rows are the one thing in this plan that may not be
   lost, so the queue is a **sheet**, not `CacheService`. `ERP_History_Queue` in the AUTH
   spreadsheet, same columns as `ERP_Record_History` plus `queued_at`. New sheet, additive, no
   existing schema touched — the sanctioned exception in §Invariants.

3. **The request path gets cheaper, not just shorter.** `writeHistoryRows_` appends the batch to
   the queue with `appendRowWithRetry_` ([02_DataAccess.js:397](02_DataAccess.js#L397)), which
   takes **no script lock and allocates no ids**. Both of those move to the drain. The saving is
   the lock, and the lock is the part every other user in every other company was waiting on.

4. **A one-minute time-driven trigger drains it** into `ERP_Record_History` — take the lock once,
   allocate ids once, `setValues` once, delete the drained rows. Exactly the batching
   `writeHistoryRows_` already does well, moved out of the user's request.

5. **Draining must be idempotent and self-healing.** The drain marks rows before it moves them so
   a trigger that dies mid-drain cannot duplicate or lose them; a row older than N minutes still
   in the queue is reported, not silently dropped. `installTriggers_`
   ([Code.js:1112](Code.js#L1112)) already exists and is where the new trigger is registered.

6. **`SystemLog` moves the same way**, into the Phase 10 buffer — it is the same problem with a
   lower durability bar, so it can use the cheaper mechanism Phase 10 builds.

**Explicitly unchanged:** what a history row contains, one row per changed column, the columns of
`ERP_Record_History`, and everything `Record_History_Panel.html` reads. This phase changes *when*
the row is written and *nothing else about it*.

**Files.** `02_DataAccess.js`, `Code.js` (trigger registration).

**Verify.** `rt9_history_queue.js` — a save enqueues exactly the rows `historyRowsFor_` produces
today (compare against the current function, row for row); the drain is idempotent under a
simulated mid-drain failure; the queue never loses a row; a failed audit write cannot fail a save
on **either** branch.

**Budget.** Audit work inside the request: **one lockless append**. Global-lock acquisitions per
save: **2 → 1**.

**Risk.** Medium, and it is an audit risk rather than a performance one — a queue that drops rows
is worse than a slow save. Hence a sheet rather than a cache, idempotent draining, and a stale-row
report. The Step 1 bug fix carries no risk at all and should ship immediately regardless of the
rest.

---

### Phase 10 — Request telemetry and the weekly review

**Goal.** Every request records what it was and how long it took, cheaply enough to leave on
permanently, in a form that answers "what got slower this week?" in one look.

**Why.** Phase 0 opens a five-day measurement window and closes it. That answers "what is slow
today" once. It does not tell you that Thursday's release made المشتريات 400 ms slower, and it
cannot, because the mechanism it uses — `PERF_LOG_READS` appending a `SystemLog` row per request —
is explicitly documented as a measuring instrument that must be switched off again
([PERF_BASELINE.md](PERF_BASELINE.md)): it adds a **write to every read**, and `SystemLog` already
grows without bound and carries `JSON.stringify(result.data)` per write row.

So the thing that must be built is a telemetry path cheap enough that leaving it on is not a
decision anyone has to revisit.

**What changes.**

1. **Buffer in `CacheService`, flush in batches.** `apiRouter_` already measures `elapsedms` and
   `sheetreads` ([Code.js:855](Code.js#L855)) — the numbers exist. Instead of appending a row,
   push a compact record onto a cache buffer keyed by the current minute. A request pays one cache
   write, not a sheet append, so **reads can be logged permanently** — which is the whole point,
   since reads are what page loads are made of.

2. **One narrow sheet, `ERP_Perf_Log`,** in the AUTH spreadsheet — additive, separate from
   `SystemLog`, and droppable without consequence. Columns, and deliberately no more:

   | Column | Why |
   |---|---|
   | `ts` | when |
   | `action` | `module_action` where present, else the route — the thing you rank |
   | `company` | which tenant |
   | `page` | from the existing `resolveLogPage_` |
   | `elapsed_ms` | already measured |
   | `sheet_reads` | already measured; a high count with low elapsed means the cache is working |
   | `status` | so failures can be separated from slowness |
   | `user_hash` | a salted hash, **not** an email — concurrency without a per-person record |
   | `client_ms` | the Phase 0 navigation timeline, when the client sent one |

   **No payloads, no record ids, no field values.** `SystemLog` keeps the audit story; this sheet
   is numbers only, which is what makes it small enough to keep.

3. **A one-minute trigger drains the buffer** — one `setValues`, same mechanism as Phase 9's
   drain, sharing its code. Losing a telemetry row to a cache eviction is acceptable and is the
   reason this may use a cache where Phase 9 may not.

4. **Sampling, from the start rather than retrofitted.** 100% of writes and of anything over
   1,000 ms; a configurable fraction of fast reads (default 10%). One `CONFIG` constant. Without
   this, a busy week produces a sheet nobody can open.

5. **A weekly rollup** — a time-driven trigger that writes one row per `action` per week to
   `ERP_Perf_Weekly`: p50, p90, p99, count, error rate, mean `sheet_reads`. This is the table that
   is actually read. The raw log is evidence; the rollup is the review.

6. **Retention that already has a home.** `10_Retention.js` and `ARCHIVE_RETENTION_MONTHS`
   ([00_Config.js](00_Config.js)) already implement dated archive tabs for exactly this problem.
   `ERP_Perf_Log` joins that rotation — raw rows kept 90 days, the weekly rollup kept
   indefinitely because it is tiny.

7. **A one-screen view.** `ERP_Perf_Dashboard` reads `ERP_Perf_Weekly` and shows the ten slowest
   actions, week over week, with an arrow. Super-admin only, registered like any other page. This
   is what makes it a habit instead of a sheet nobody opens.

**Files.** `Code.js` (`apiRouter_`, `logClientPerf_`, trigger registration), `00_Config.js`
(sampling rate, retention), `10_Retention.js` (rotation), one new page template.

**Verify.** `rt10_telemetry.js` — a logged request costs **zero** sheet writes on the request path;
no payload, record id or email can reach `ERP_Perf_Log` (assert on the column list *and* on the
values written); sampling honours its configured rate; the weekly rollup's percentiles are correct
against a fixture; a full or throwing cache degrades to logging nothing rather than to failing the
request.

**Budget.** Telemetry cost per request: **one cache write**, no sheet write. Coverage: **100% of
writes, 100% of slow requests, a sampled fraction of fast reads — permanently on.**

**Risk.** Low–medium. Two failure modes, both designed out above: telemetry that costs more than
what it measures (hence the buffer and the sampling), and a log that quietly becomes a per-user
activity record (hence `user_hash`, no payloads, and a verifier that asserts on the values, not
just the headers).

---

## 3. Sequencing and dependencies

```
INDEPENDENT — start any of these today, in any order
  Phase 1   skeletons                     (biggest felt win, lowest risk)
  Phase 8.1 fix the lying search box      (correctness bug)
  Phase 9.1 fix the audit asymmetry       (correctness bug, one try/catch)
  Phase 10  request telemetry             (what you keep after Phase 0 closes)
  Phase 5   payload / minify
  Phase 0   measurement window            (owner sets one property, then waits 5 days)
           + inventorySpreadsheets()      (owner runs once)

CHAINED
  Phase 9.1 ──► Phase 2 (optimistic writes) ──► Phase 9 rest (audit off the request path)
  Phase 3 (stamps + watch) ──► Phase 4 (cache + prefetch on intent)
  Phase 5 ──┐
  Phase 4 ──┴─► Phase 6 (soft nav, two pilot pages)
  Phase 0 ──► Phase 7 (server read cost)
  Phase 3 ──┐
  inventory ┴─► Phase 8 tiers 1 / 3 (indexed retrieval)
```

Hard dependencies, and only these:

- **Phase 4 needs Phase 3.** Cache eviction rides on the version stamps. Caching against
  stamps that miss writes serves stale data with confidence — worse than no cache.
- **Phase 6 wants Phase 5.** Soft navigation with an unsplit 268 KB bundle still works, but
  the payload is what makes the first load expensive enough to notice.
- **Phase 7 needs Phase 0.** Do not scope it before the table exists.
- **Phase 2 needs Phase 9 step 1.** Until a committed change stops being reported as a failure,
  the optimistic rollback makes the screen disagree with the sheet (§1.7). One `try/catch`.
- **Phase 10 supersedes Phase 0's measurement window.** Phase 0 answers "what is slow now" once;
  Phase 10 answers "what got slower this week" forever. Do Phase 0 anyway — it is five days of
  waiting and it starts today — but Phase 10 is what you keep.
- **Phase 8's index tiers need Phase 3** (the stamps are the invalidation signal) **and the
  inventory numbers** (they decide whether any index is warranted at all). **Phase 8
  step 1 needs neither** — it is a bug fix.

Phases 1, 2 and Phase 8 step 1 depend on nothing and deliver most of the felt improvement.
**If only one phase is ever done, do Phase 1. If two, add Phase 2 (with Phase 9 step 1 in front
of it). If a user has ever said "I can't find the record", do Phase 8 step 1 before either.**

---

## 4. Budgets — how "done" is judged

| Measure | Today | Target | Phase |
|---|---|---|---|
| Median inlined bytes per page | 317 KB | < 180 KB | 5 |
| Blank/overlay time on navigation | full duration | 0 ms | 1, 6 |
| Time to first meaningful paint | after data | < 150 ms | 1 |
| Perceived save latency | server round trip | 0 ms | 2 |
| Round trips per save | 2 | 1 | 2 |
| Form open (warm) | 1–2 round trips | 0 | 4 |
| Another device's change appears | never, for unstamped writes | ≤ 1 poll interval, always | 3 |
| Navigation to a new screen | full document load | < 300 ms | 6 |
| Pages with a blocking read overlay | 86 | 0 | 1 |
| Pages with optimistic save | 2 of 89 | all write pages | 2 |
| Pages with a live watch | 20 of 89 | all list pages | 3 |
| Search scope | the ~10 rows loaded | the whole table | 8 |
| Retrieval of a known record | full-sheet read | 1 `batchGet` | 8 |
| Search p90 | full scan in JS | < 500 ms | 8 |
| Audit work inside a save | global lock + ids + `setValues` | one lockless append | 9 |
| Global-lock acquisitions per save | 2 | 1 | 9 |
| Telemetry cost per request | a `SystemLog` append, or nothing | one cache write | 10 |
| Requests with a recorded response time | writes only, when switched on | all writes + all slow + sampled reads, always | 10 |

---

## 5. What could go wrong, and what is done about it

| Risk | Where | Mitigation |
|---|---|---|
| An optimistic row the server rejects | Phase 2 | Exact rollback (already implemented), a **persistent** retry chip rather than a toast, a dedicated rollback verifier |
| Poll volume exhausts the execution quota | Phase 3 | The 10 s floor / hidden-tab pause / idle stop stay non-negotiable; `SystemLog` execution counts checked between each company's rollout; Phase 7's delta endpoint reduces cost per poll |
| Stale cache shown as fresh | Phase 4 | Eviction bound to Phase 3 stamps; every cached render schedules a revalidation; hard age cap |
| Minifier breaks a template literal or an Arabic string | Phase 5 | Comments/whitespace only, **no identifier mangling**; symbol-equivalence diff; `?nominify=1` escape hatch |
| Soft nav bypasses an authorization check | Phase 6 | The body endpoint runs the same `checkPageAccessForUI_` as `doGet`; verifier asserts an unauthorized action returns no body |
| Listener/watch leaks across soft navigations | Phase 6 | Mandatory `unmount`; verifier asserts every registered watch and timer is cleared |
| Pagination hides records users expect | Phase 7 | Owner decision per page — precedent already set in `NEXT_STEPS_OWNER.md` |
| The bundle grows back | Phase 5 | `rt5_budget.js` fails the build above 180 KB |
| A stale index serves wrong results | Phase 8 T1 | Invalidation bound to the Phase 3 stamps; verifier checks index/sheet agreement after a write; a partial cache eviction is a total miss |
| Arabic spelling variants silently miss | Phase 8 T1 | Normalise (أ/إ/آ→ا, ة→ه, ى→ي, tatweel, diacritics) symmetrically on both index and query; verified by `rt8_index.js` |
| A MySQL mirror drifts from Sheets | Phase 8 T3 | Sheets stays authoritative and the mirror is read-only; nightly reconciler by `updated_at` that **reports** drift rather than silently repairing it |
| JDBC handshake eats the gain | Phase 8 T3 | Time `Jdbc.getConnection` against the live Box Analysis page **before** building anything |
| A queued audit row is lost | Phase 9 | The queue is a **sheet**, not a cache; the drain is idempotent; a stale row is reported, never dropped |
| A committed change reported as a failure | Phase 9 step 1 | The bug fix ships alone and **before** Phase 2's rollout, or the optimistic rollback desyncs screen from sheet |
| Telemetry costs more than it measures | Phase 10 | Cache buffer + batched drain + sampling; verifier asserts zero sheet writes on the request path |
| The perf log becomes a per-user activity record | Phase 10 | `user_hash` not email, no payloads, no record ids; verifier asserts on the written **values**, not just the headers |

---

## 6. What this plan deliberately does not do

- **It does not touch the authority, session or kill-switch caching.** That work is sound
  (§1.4) and re-opening it risks a security regression for no felt improvement.
- **It does not move off Apps Script or off Sheets.** Every phase works within
  `HtmlService`, `google.script.run` and `CacheService`.
- **It does not try to give Google Sheets an index.** Sheets has none and cannot be given
  one. Phase 8 builds indexed *retrieval* around it, or moves the searchable copy to the
  database this project already runs.
- **It does not add a websocket.** Apps Script has none. Polling with cheap stamps is the
  correct mechanism here, and `UIC.Live.watchPage` already implements it well.
- **It does not remove any comment from source.** Phase 5 strips them from the wire only.
- **It does not change what an audit row contains**, nor how many are written, nor what
  `Record_History_Panel.html` reads. Phase 9 changes *when* the row is written and nothing else.
- **It does not log payloads, record ids or emails into the telemetry sheet.** Phase 10 records
  numbers; `SystemLog` keeps the audit story.
- **It does not change what any screen does or what any user may see** — except where
  Phase 7 proposes pagination, which is flagged as an owner decision.

---

## 7. Owner steps

| # | Step | Blocks | When |
|---|---|---|---|
| 1 | Set Script Property `PERF_LOG_READS = 1` | Phase 0, and therefore Phase 7 | before anything |
| 2 | Leave it five working days, then set it back to `0` | same | week 1 |
| 3 | Confirm staging exists for Phases 5 and 6 | Phases 5, 6 | before Phase 5 |
| 4 | Decide the poll-interval budget once volumes are known | Phase 3 rollout | after Phase 3 lands on one company |
| 5 | Decide per-page pagination defaults | Phase 7 | when Phase 7 is scoped |
| 6 | Run `inventorySpreadsheets()` — read-only, already written, never run | Phase 8 tiers 1/3 | with step 1 |
| 7 | Decide whether Sheets stays the system of record if Tier 3 is reached | Phase 8 T3 | only if the inventory says > ~50k rows |
| 8 | Install the two one-minute drain triggers (`installTriggers_`) | Phases 9, 10 | when 9 and 10 ship |
| 9 | Confirm the read sampling rate (default 10%) and 90-day raw retention | Phase 10 | when 10 ships |
| 10 | Read `ERP_Perf_Weekly` once a week — that is the whole habit | Phase 10 | ongoing |

Steps 1 and 2 are the only ones needed to begin. **Phases 1, 2 and Phase 8 step 1 need
nothing at all.** Step 6 costs one editor run and is what decides whether Phase 8 is a
week of work or is not needed at all.

---

## 8. Reproducing the measurements in §1

```bash
# Blocking overlay sites
grep -c "UI.showSpinner\|showPageLoading\|withPageLoading" *.html | grep -v ":0"

# Optimistic-save and watch adoption
grep -l "UIC.Live.save" *.html
grep -l "UIC.Live.watchPage" *.html

# Change-stamp coverage — the Gap B evidence
grep -rn "noteTableChange_\|noteSheetChange_" *.js
grep -c "noteMutation_()" Company_*_Actions.js

# The existing rollout state
node tools/verify/s19_live_rollout.js
node tools/verify/s20_quiet_refresh.js
```

Per-page inlined payload (resolves `include()` recursively):

```js
// node -e "…"
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== 'appsheet_old_project.html');
function size(f, seen) {
  seen = seen || new Set();
  if (seen.has(f)) return 0;
  seen.add(f);
  let s = 0;
  try { s = fs.statSync(f + '.html').size; } catch (e) { return 0; }
  const src = fs.readFileSync(f + '.html', 'utf8');
  const re = /include\('([^']+)'\)/g;
  let m;
  while ((m = re.exec(src))) s += size(m[1], seen);
  return s;
}
const rows = files.map(f => ({ p: f.replace(/\.html$/, ''), b: size(f.replace(/\.html$/, '')) }))
                  .sort((a, b) => b.b - a.b);
console.log('median', rows[Math.floor(rows.length / 2)].b);
rows.slice(0, 12).forEach(r => console.log(String(r.b).padStart(8), r.p));
```
