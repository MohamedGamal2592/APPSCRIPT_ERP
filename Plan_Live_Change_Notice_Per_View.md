# Plan: a per-page, per-view "new changes" notice

**Date:** 2026-09-30
**Status:** Plan only. Nothing here has been executed. Phases P0–P7; the agent runs them all without stopping.
**Scope:** every page that calls `UIC.Live.watchPage`: 76 pages (Valley Foods 34, Top Chemical 25, Testing System 7, Top Light 6, Assessment 4).

---

## PART A — The goal in one paragraph

Today, any save to any table a page's actions touch raises the same notice for everyone: «هناك تغييرات جديدة · اضغط للتحديث». That includes the user's own saves, and changes to data the user is not looking at.

After this plan:
- A notice appears only when **another user or tab** saved to a table that is **shown in the part of the page the user has open right now** (its *view*).
- The notice names what changed, who changed it and when, for example «تم تحديث المبيعات بواسطة أحمد منذ دقيقة · اضغط للتحديث».
- Changes to tables that are not on screen do not interrupt. They are remembered, and the view that shows them refreshes when the user opens it.
- **Pages open fast from JSON kept on the device** (P6). Each view's last server reply is stored locally and painted at once. It becomes usable the moment the cheap stamp check confirms that none of its tables changed. The same stamps drive the notice, so with many people working at once nobody works on data another user has already changed without being told.

---

## PART B — How it works today (verified in the code)

| Piece | Where | What it does |
|---|---|---|
| Change stamp | `Code.js` `noteTableChange_(scopeId, sheetName)` (line ~841) | On every write, puts `Date.now()` in CacheService under `tv_<dbId>_<sheet>` (6h TTL). No writer, no request id. |
| Page → tables | each `Company_*_Actions.js` → `PAGE_TABLES` | Derived as "the tables this page's actions declare" (`ACTION_TABLES` / `primaryLogTable`, **one table per action**). It is not "what the page shows": for example the sales list shows customer names and returned quantities, but the customers and returns tables are not in `et_sales`'s set. |
| Poll | `get_page_versions` in each company (`getPageVersions_`) | Returns `{versions: readTableVersions_(dbId, PAGE_TABLES[page])}`. One `CacheService.getAll`, no sheet read. |
| Client watch | `UI_Components.html` `UIC.Live.watchPage` (line ~8153) | Polls every 30s (10s floor, paused when hidden, stops after 15 idle min). A stamp that changed → `UIC.Cache.bust()` + `onChange(moved)`. |
| Arrival | `UIC.Live.arrive(refresh)` (line ~8113) | If `userIsBusy()` (pending save, modal, typing, scrolled >120px, batch selection) → shows `#uic-live-fresh` with the fixed text; else refreshes in place and flashes `.table-wrap`. |
| Pages | 76 pages | `onChange: function () { UIC.Live.arrive(function () { <page's quiet reload> }); }`. The `moved` list is ignored by every page. |

Gaps this plan closes:
1. **Own saves raise the notice.** Nothing marks a stamp as "mine", so ~30s after my own save I am told there are new changes.
2. **Not view-aware.** A change to a table shown only in a closed form, a hidden tab or another section still interrupts the list.
3. **Missing tables.** Tables that a view displays but no action of the page declares are never watched.
4. **Vague text.** The notice does not say what changed or who changed it.

---

## PART C — Fixed names (use exactly these)

| Name | Kind | Meaning |
|---|---|---|
| `_liveReqMeta_` | Code.js global | `{rid, who, name}` of the request being served; set and cleared by `apiRouter_`. |
| `noteTableChange_` | Code.js (changed) | Stamp value becomes JSON (see D1). Signature unchanged. |
| `noteRecordChange_(scopeId, sheetName, key)` | Code.js (new, Phase 5) | Adds a record key to the current request's stamp for that table. |
| `parseTableStamp_(value)` | Code.js (new) | Old numeric stamps and new JSON stamps → `{t, w:[{r,u,n,t,k}]}`. |
| `pageVersionsReply_(dbId, page, pageTables, pageViews, tableLabels)` | Code.js (new) | Shared body of every company's `getPageVersions_`. |
| `PAGE_VIEWS` | const in each `Company_*_Actions.js` | `{ <page>: { <view>: [<sheet>, …] } }` |
| `TABLE_LABELS` | const in each `Company_*_Actions.js` | `{ <sheet>: '<Arabic label>' }` |
| `UIC.Live.setView(name, opts)` | client (new) | Page says which view is on screen. `opts.refresh` = that view's quiet reload; `opts.key` = record open in a form (Phase 5). |
| `UIC.Live.markOwnRequest(rid)` | client (new, internal) | Remembers a write's request id so its stamp is recognised as "mine". |
| View names | fixed words | `list`, `form`, `detail`, `print`, `report`, or `tab:<tab-id>` for pages with tabs. |

---

## PART D — Design

### D1. The stamp carries who and which request

`noteTableChange_` stores a JSON string instead of a bare time:

```json
{"t":1759219200123,"w":[{"t":1759219200123,"r":"<request id>","u":"ahmed@x","n":"أحمد","k":["INV-12"]}, …up to 5]}
```

- `t` is the newest time. Change detection still means "`t` differs from the last one seen".
- `w` holds the last **5** writes, newest first. With only the last writer, "my save plus someone else's save in the same 30s" would look like mine only, and the other change would be lost.
- `r` comes from `_liveReqMeta_`, which `apiRouter_` sets from the request's `__request_id` (every write already carries it; see Code.js ~6808). `u` is the email and `n` the display name. A trigger or other background job has no meta: `r:''` and `u:'system'`.
- `k` (record keys) stays empty until Phase 5.
- This is a read-modify-write of one cache entry. It runs inside the write path, which already holds the script lock for id allocation, so concurrent writers are serialised. If the entry is evicted, start a fresh list. Keep the "never throws" rule.
- **Backward compatible:** an old client compares the raw strings, and any new write changes the string, so it keeps working. `parseTableStamp_` reads an old bare number as `{t: n, w: []}`.

### D2. The page declares its views (server side, one source)

Each company's Actions file gets two constants next to `ACTION_DEFINITIONS`:

```js
const TABLE_LABELS = { erp_test_sales_invoices: 'المبيعات', erp_test_sales_returns: 'مرتجعات المبيعات', … };
const PAGE_VIEWS = {
  et_sales: {
    list: [SALES_SHEET, SALES_RETURNS_SHEET, CUSTOMERS_SHEET],
    form: [SALES_SHEET, SALES_LINES_SHEET, PRODUCTS_SHEET, CUSTOMERS_SHEET,
           PURCHASING_LINES_SHEET, SALES_RETURNS_SHEET, MFG_SHEET, MFG_LINES_SHEET] // form shows live stock
  },
  …
};
```

**Rule for building a view's list:** every table whose data is visible in that view, including tables that only supply a looked-up name, a total or an available quantity. Do not stop at the tables the page's actions write to.

`getPageVersions_` in every company becomes one call:

```js
return pageVersionsReply_(dbId, page, PAGE_TABLES[page] || [], PAGE_VIEWS[page] || null, TABLE_LABELS);
```

`pageVersionsReply_` returns:

```js
{ status:'success', page, now,
  tables:   [...union of PAGE_TABLES[page] and every table in PAGE_VIEWS[page]],
  versions: { <sheet>: <raw stamp> },            // unchanged shape: old clients keep working
  meta:     { <sheet>: {t, w:[{t,r,u,n}]} },     // parsed; keys dropped unless Phase 5
  views:    PAGE_VIEWS[page] or null,
  labels:   { <sheet>: label } for the tables above }
```

The access check stays exactly as today: the caller must have read access to the page. The tables are fixed by the page's own declaration on the server, and the client cannot ask for other tables. **Quota:** still one `CacheService.getAll` per poll, no sheet read, and the same 30s cadence. The reply is a few hundred bytes larger.

### D3. The client knows the view, its own saves, and what is stale

In `UI_Components.html` (`UIC.Live`):

1. **Own requests.**
   - `API.call` already stamps `__request_id` on writes.
   - `UIC.Live.save` and the page's `companyCall` go through `API.call`. Record the id of every non-`get_` call in `myRequests` (a Map of rid → time, keep 10 minutes, at most 200).
   - When a table moves, look at the stamp's `w` entries newer than the baseline. **If every one of them has `r` in `myRequests`, the change is mine:** update the baseline silently, with no notice and no refresh.

2. **Current view.** `UIC.Live.setView(name, {refresh, key})` sets `currentView`.
   - Default is `list`, so a page that never calls `setView` behaves as today.
   - The view's tables are `views[currentView]`. If the page has no declared views, or no entry for this view, use all tables, which is today's behaviour.

3. **On each poll,** when tables moved and were not all mine:
   - `inView` = moved ∩ tables of the current view
   - `offView` = moved − inView
   - If `inView` is not empty, keep today's rule: if `userIsBusy()`, show the notice (D4); otherwise refresh in place and flash.
   - If `offView` is not empty, add those tables to `staleTables` and show nothing.
   - `UIC.Cache.bust()` stays as today, so nothing stale is served from the client cache.

4. **Switching view.** `setView(newView)` checks `staleTables` against the new view's tables. If they overlap, it runs `opts.refresh` for that view at once, which is quiet because the user just asked for the view, then clears those tables from `staleTables`.

### D4. The notice text

| Case | Text |
|---|---|
| One table, one other writer | «تم تحديث **المبيعات** بواسطة **أحمد** منذ **دقيقتين** · اضغط للتحديث» |
| One table, several writers | «تم تحديث **المبيعات** (3 تعديلات) · اضغط للتحديث» |
| Several tables | «تم تحديث: **المبيعات**، **مرتجعات المبيعات** · اضغط للتحديث» |
| Writer is the system (trigger or job) | «تم تحديث **المبيعات** تلقائياً · اضغط للتحديث» |
| Label or writer unknown (old stamp) | today's text: «هناك تغييرات جديدة · اضغط للتحديث» |

Rules for the notice:
- "منذ …" is computed from the server's `now` minus the stamp `t`, both server clocks. The device clock is never used.
- When more changes arrive while the notice is showing, they are merged into it.
- A small **×** button hides the notice but keeps `freshRefresh` and the stale flags. The next change shows it again.
- Keep `role="status"`. Escape every name with `FMT.escape`.

### D5. Phase 5 (optional): record level for an open form

- A page opening a form calls `setView('form', {key: <record key>, table: <sheet>})`.
- The write layers call `noteRecordChange_(dbId, sheet, key)`. The stamp's `w[i].k` then lists the keys a request touched: up to 5 per write, and `…` if there were more.
- If the form's table moved and its key is in some other writer's `k`, show the **conflict** notice «قام **أحمد** بتعديل هذا السجل أثناء فتحه — أعد التحميل قبل الحفظ». Show it even when the user is typing: it is a warning, and the row-version check will refuse a stale save anyway.
- If the form's table moved but only other keys changed, do not interrupt the form. Mark the list stale; it refreshes when the user returns to it.
- Adoption is per company:
  - **Top Light and Testing System:** easy. Every write already passes through `tlDbCreate_`, `tlDbPatch_`, `tlDbSoftDelete_`, `tlDbSoftDeleteWhere_` and `tlDbAppendValues*_`.
  - **Valley Foods and Top Chemical:** needs a per-saver inventory first (Phase 0 lists the savers).

### D6. Fast views from JSON, kept honest by the same stamps (P6)

The pieces already exist:
- `UIC.Cache` (UI_Components ~6984): localStorage JSON store with an LRU cap, a key per company + user + action + payload, `version` tags, and `swr()`.
- The inert "last paint" (`saveLastPaint` / `.rt-stale`).

No page uses `UIC.Cache.swr` for its list, and every load still does a full server fetch. P6 makes each **view** a cached JSON reply that is trusted exactly as far as the stamps allow.

1. **Cache entry per view.** Key: company + user + page + view + action + payload (the existing `keyFor` scope). Value: the server reply.
   - Tag: `stampsOf(viewTables)`, a stable string of each view table's stamp time `t`.
   - The cache index also records the entry's table list, so a bust can be exact (below).

2. **Load.** `UIC.Live.loadView({view, action, payload, call, render})`:
   - If a cached reply exists, paint it at once but **inert** (`.rt-stale`, buttons disabled). Rows could have been deleted or renumbered, so nothing on it may be clicked yet.
   - In parallel, run one `get_page_versions` (the cheap poll, no sheet read). It also sets the watch baseline, so the watch's first tick no longer spends a poll only to learn the baseline.
   - The cached reply is **trusted** when the view's stamps equal its tag, it is younger than `maxAge` (default 10 min), and no stamp is missing (a cache eviction means unknown). Then make it live and skip the list call.
   - Otherwise call the list action, render, and store the reply with the new tag.
   - If no reply is cached, do today's full fetch.

3. **While the page is open,** the notice machinery (D3) decides:
   - **In-view change:** refetch that view, or show the notice when the user is busy; the refetch stores the new reply.
   - **Off-view change:** drop only the cache entries whose table list contains the moved tables. This replaces today's `UIC.Cache.bust()` of everything on any change.
   - **My own save:** drop the current view's entry. The stamp is recognised as mine (D3.1), so there is no notice, and the next load fetches fresh.

4. **Concurrency guarantee.**
   - On load, cached data is never usable before the stamps confirm it.
   - While a page is open, a change by someone else reaches it within one poll (30s) as a refresh or a notice.
   - Every save still passes the server's row-version check (`checkRowVersion_`), so a stale screen cannot overwrite a newer row.
   - The only gap is edits typed directly into the Google Sheet (no stamp); `maxAge` (10 min) bounds it (see OD6).

5. **Limits.**
   - Replies over 400 KB are not cached (`loadAll` lists usually are).
   - Pages on the opt-out list (OD7) are never cached.
   - When the Testing System's own browser packs are on (`window.ET_PACKS && ET_PACKS.enabled()`), those pages keep that path and skip this one.
   - Logout: keys are already per user (`principalId`). Also clear `erp_c_*` in the logout hook, as `Company_ErpTest_Packs.html` does for its database.

---

## PART E — Phases

Rules:
- Phases run in order: P0 → P6, then P7.
- Each phase ends with its DONE-CHECK and one commit `live-notice Pn: <title>`.
- **The agent does not stop between phases.** When a phase's DONE-CHECK passes, it commits, pushes the branch and starts the next phase. Owner reviews and owner checks are collected in `tools/liveviews/OWNER_RUNBOOK.md` for the end.
- The agent never runs `clasp push` or `clasp deploy`, and never writes to a Google Sheet or to Firestore.
- Keep every existing test green. The affected ones are `tools/verify/rt3_stamp_coverage.js`, `s13_forms_filters.js`, `s18_live_saves.js`, `s19_live_rollout.js`, `s20_quiet_refresh.js`, `erptest_clone_static.js`, plus `npm run verify` overall: no new failures against the base commit.

### P0 — Inventory (read-only)

0.1 Write `tools/liveviews/inventory.js` (node, reads local files only). For each of the 76 watched pages:
- the page id passed to `watchPage`;
- the refresh function passed to `arrive`;
- every `companyCall('<action>'…)` in the page, grouped by the function that calls it, which gives the view hint (for example `renderList`/`fetchProducts` → list, `openForm`/`renderForm` → form, a tab switcher → `tab:<id>`);
- for each action, the tables it reads, from the company's `ACTION_TABLES` / `ACTION_DEFINITIONS` and from `tlDbList_(dbId, X)` / `getAllRecords_(dbId, X)` calls inside its handler (static scan);
- whether the page has tabs, forms (modals) and a print view;
- for Phase 5, the write functions per company.

0.2 Output `tools/liveviews/inventory.json` and `tools/liveviews/inventory.md`: one section per page with proposed views → tables and the reason for each table.

0.3 Output `tools/liveviews/labels.md`: every table name with a proposed Arabic label. Reuse `labelAr` from the Registry `tables` catalogs (20 exist) and page titles.

**DONE-CHECK P0:** `inventory.json`, `inventory.md` and `labels.md` exist for all 76 pages. The agent decides each view's tables itself, applying the rule in D2 ("every table whose data is visible in that view"), and writes its reason next to every table. The owner reviews them at the end (runbook item). The agent does not wait for that review.

### P1 — Server: stamps with writer and request, views and labels

1.1 In `Code.js`:
- add `_liveReqMeta_`, set at the top of `apiRouter_`'s dispatch from the request's `__request_id` plus the authenticated user's email and name, and cleared in a `finally`;
- change `noteTableChange_` per D1;
- add `parseTableStamp_` and `pageVersionsReply_` per D2.

1.2 In each `Company_*_Actions.js`:
- add `TABLE_LABELS` and `PAGE_VIEWS` from the approved P0 output;
- make `getPageVersions_` return `pageVersionsReply_(...)`.

For the Testing System, make the change in `tools/erptest/gen_actions.js` (or the Top Light source it copies) so the generated file keeps matching. Then run `node tools/erptest/gen_actions.js`.

1.3 Tests (new `tools/verify/live_notice_server.js`, vm + `gasstub`):
- A stamp after a write has `w[0].r` equal to the request id and `w[0].u` equal to the email.
- Five writes keep five entries, and a sixth drops the oldest.
- An old numeric stamp still parses.
- `get_page_versions` returns `views`, `labels` and the union of tables, and refuses a user without read access exactly as before.
- A write outside `apiRouter_` (a trigger) records `u:'system'`.
- `versions` keeps its old shape, and `rt3_stamp_coverage.js` still passes.

**DONE-CHECK P1:** new test green, `npm run verify` shows no new failures.

### P2 — Client core (`UI_Components.html`)

2.1 `myRequests` + `markOwnRequest`, fed from `API.call` for non-`get_` actions (Client_Helpers is shared; add one line where `__request_id` is set, ~line 324).

2.2 `setView`, `currentView`, `staleTables`, the in-view/off-view split and the own-write filter, per D3. Pages that never call `setView` keep today's behaviour, minus notices for their own saves.

2.3 Notice text and merge per D4, plus the dismiss **×** (CSS next to `.uic-live-fresh`, ~line 5732).

2.4 Tests (new `tools/verify/live_notice_client.js`, using `domstub.js` / `pageharness.js`), scenario matrix:

| # | Situation | Expected |
|---|---|---|
| 1 | My own save moves `sales_invoices`; I am on the list | no notice, no refresh |
| 2 | Another user saves `sales_invoices`; list open; not busy | refresh in place + flash, no notice |
| 3 | Same, but I am typing in the search box | notice «تم تحديث المبيعات بواسطة …» |
| 4 | Another user saves `products`; list view (products not in list) | nothing; `products` stale |
| 5 | After 4, I open the form (products in form) | form's refresh runs once; stale cleared |
| 6 | My save and another user's save in the same poll window | notice (not treated as mine) |
| 7 | Two tables moved while busy | one notice naming both |
| 8 | Notice dismissed with × then another change | notice shows again with the new change |
| 9 | Page without `PAGE_VIEWS` | today's behaviour (all tables in view), generic text if no labels |
| 10 | Old server (no `meta`/`views` in reply) | today's behaviour exactly |

**DONE-CHECK P2:** new test green, existing live tests green. (Owner check at the end, in the runbook: after `clasp push`, their own save no longer shows the notice.)

### P3 — Page adoption, one company at a time

Order: Testing System (7) → Top Light (6) → Top Chemical (25) → Valley Foods (34) → Assessment (4).

For each page:

3.1 Add `UIC.Live.setView(...)` at each view switch the inventory found:
- **list:** in the list render function, with `refresh` = the page's current quiet reload;
- **form:** where the form or modal opens, with `refresh` = the form's own reload of options, lines and stock, or re-opening the same record; and `setView('list')` again when it closes;
- **tabs:** in the tab switch, `tab:<id>`, with the tab's loader;
- **print and report pages:** a single `report` view.

3.2 Keep the existing `watchPage` / `arrive` call. `arrive` still receives the list refresh; the view refreshes come from `setView`.

3.3 For the Testing System pages, apply the edits through `tools/erptest/gen_pages.js` (Top Light copies) and directly in `Company_ErpTest_Manufacture.html`, then regenerate.

3.4 For each company, extend `live_notice_client.js` with one real page from that company (load the page through `pageharness.js`, drive list → form → list, and assert the view switches and the stale refresh).

**DONE-CHECK P3 (per company):** tests green. (Owner check at the end, in the runbook: the two-browser check on two pages per company, user A on the list, user B saves.)

### P4 — Pages that are not watched yet (skipped by default, OD4)

Dashboards, KPI, reports and print pages have no `watchPage` today. For each one the owner wants:
- add `watchPage` with `view: 'report'`;
- with `PAGE_VIEWS[page].report` = the tables the report reads.

Reports never auto-refresh (they can be long); they always show the notice. Keep the 30s poll cost in mind: every open tab is one Apps Script execution per poll.

### P5 — Record level for open forms (Top Light and Testing System by default, OD5)

- Per D5: `noteRecordChange_` in the write layers, the stamp's `k`, `setView('form', {key, table})`, and the conflict notice.
- Top Light and Testing System first, then Valley Foods and Top Chemical per the P0 saver list.
- Test: another user edits the invoice I have open → conflict notice while I am typing; another user edits a different invoice → my form is not interrupted, and the list refreshes when I close the form.

### P6 — Fast views from JSON (D6)

6.1 In `UI_Components.html`:
- `UIC.Live.loadView(...)` per D6.2;
- inert paint, then live after stamp confirmation;
- a `get_page_versions` confirmation that also seeds the watch baseline;
- cache entries tagged with their table list;
- an exact per-table bust in place of the global `UIC.Cache.bust()` when tables move;
- drop the current view's entry after the user's own save;
- the 400 KB cap and the OD7 opt-out list;
- the logout clearing hook.

Keep `UIC.Cache`'s guarded storage access and its LRU cap exactly as they are.

6.2 Page adoption, same order as P3: every page's **list** view loads through `UIC.Live.loadView`.
- Form option lists that already come from a `get_*_options` action use `UIC.Cache.swr` with the form view's stamp tag.
- For Testing System pages, apply the change through `tools/erptest/gen_pages.js`, then regenerate.

6.3 Tests: new `tools/verify/live_views_cache.js`, localStorage + fake poll, one real page per company through `pageharness.js`:

| # | Situation | Expected |
|---|---|---|
| 1 | First visit | full fetch; reply stored with tag |
| 2 | Second visit, stamps unchanged | inert paint at once → live after the poll; **no list call** |
| 3 | Second visit, a view table's stamp moved | inert paint → list call → live new reply |
| 4 | Stamp missing (evicted) | list call |
| 5 | Entry older than `maxAge` | list call even with matching stamps |
| 6 | While open, another user changes an off-view table | only entries containing that table dropped; nothing on screen moves |
| 7 | While open, my own save | no notice; this view's entry dropped; next visit fetches |
| 8 | Different user on the same browser | never reads the first user's entry |
| 9 | Logout | `erp_c_*` cleared |
| 10 | Reply > 400 KB, or page on the opt-out list | never stored |
| 11 | Clicking a row while the inert paint shows | ignored |

**DONE-CHECK P6:** new test green, all live tests green, `npm run verify` shows no new failures against the base commit.

### P7 — Wrap-up

7.1 `npm run verify`: compare with the base commit; no new failures (list any pre-existing ones).

7.2 Write `tools/liveviews/OWNER_RUNBOOK.md`:
- review `inventory.md` / `labels.md`;
- `clasp push`;
- the two-browser check per company (A on the list, B saves → A sees the named notice or an in-place refresh; A's own save → no notice);
- the fast-load check (open a list, navigate away and back → instant paint, no list request in the network tab when nothing changed);
- how to switch the view cache off (OD7 list, or `UIC.Live.VIEW_CACHE = false`).

7.3 Final commit and push; report what was done, what was verified, and what is left for the owner.

---

## PART F — Owner decisions (defaults apply unless you say otherwise)

| # | Question | Default |
|---|---|---|
| OD1 | Show the writer's name in the notice? | **Yes**: display name, or the part of the email before `@` if there is no name. |
| OD2 | Changes to tables not on screen: silent, or a small secondary dot on the nav? | **Silent**; refresh when that view opens. |
| OD3 | Dismiss button on the notice? | **Yes.** |
| OD4 | Include Phase 4 (reports, dashboards)? | **No** until asked (quota). |
| OD5 | Include Phase 5 (record-level conflict)? | **Yes for Top Light and Testing System**; the others after P3. |
| OD6 | Manual edits typed straight into a Google Sheet | **Out of scope.** They create no stamp today (only the Testing System's P10 edit trigger does, and it is off). Say if you want an `onEdit` trigger per company that stamps the edited tab. |
| OD7 | Pages whose data is never cached on the device (P6) | **Salaries, HR, deductions, overtime, attendance, cash and bank pages**. The agent lists the exact page ids in `inventory.md`. |
| OD8 | How long a cached view may be trusted without a server list call (P6 `maxAge`) | **10 minutes**, even when the stamps match (this bounds manual sheet edits, OD6). |

---

## PART G — Risks and how they are handled

| Risk | Handling |
|---|---|
| Stamp JSON makes each write slower | One extra `cache.get` per touched table per write, inside a path that already writes the sheet; negligible. |
| Cache eviction loses the writer list | Detection still works (a new `t`); the text falls back to the generic wording. |
| A view list misses a table | The view shows stale data until the next manual refresh, which is today's behaviour. P0 review and the P3 two-browser check are the guard. |
| Old clients during rollout | `versions` keeps its shape; new fields are additive. |
| Cached view shown with stale rows | Painted inert until the stamps confirm it; any stamp difference, missing stamp or age over `maxAge` forces a list call; saves are still version-checked on the server. |
| localStorage full or blocked (private mode) | `UIC.Cache`'s guarded access degrades to a normal fetch; the page never breaks. |
| Privacy of writer names | Only names of people who wrote to tables the viewer already has read access to (same page gate). OD1 lets the owner turn names off. |
