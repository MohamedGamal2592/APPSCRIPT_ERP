# ERP Performance Investigation

**Project:** Multi-tenant Apps Script ERP (TopChemical · TopLight · ValleyFoods)
**Date:** 2026-09-05
**Status:** INVESTIGATION — no code changed. Execution plan follows separately, after approval.
**Constraints honoured throughout:** no database/sheet schema changes · production code · every primary decision routed to the owner.

---

## 0. How to read this document

Every finding below is written as:

| Field | Meaning |
|---|---|
| **Evidence** | Exact file/line so you can verify the claim yourself |
| **Cost** | Where the time actually goes |
| **Est. win** | Expected improvement, labelled as *measured* or *estimated* |
| **Risk** | Blast radius if the fix is wrong |
| **Decision** | Whether I can do it on standing instructions, or need your explicit call |

Findings are grouped by layer, then ranked in §11 by *value ÷ risk*. Nothing here is a
recommendation to execute yet — §12 lists the questions I need answered first.

> **Note on numbers.** I have not run the production app or opened the spreadsheets, so I
> cannot report real timings. Every figure marked *estimated* is derived from the code path
> (count of Sheets round-trips × the documented ~150–500 ms cost of a Sheets API call from
> Apps Script) — not from a profiler. **Phase 0 of any execution plan must be instrumentation**
> (§10), so we optimise against real data and can prove each change worked.

### 0.1 Owner answers received (2026-09-05) — this section overrides §12 where they conflict

| Q | Answer | Effect on the plan |
|---|---|---|
| **Q1** TableEngine | *"I don't know, I mostly vibe-coded this."* → **I resolved it myself: it is dead code.** See F-17 below for the proof. | Plan optimises the ~100 bespoke endpoints. TableEngine's *caching machinery* gets harvested into the data layer; its dead dispatch gets removed. |
| **Q4** Hand-written formulas | **Yes — they exist.** | F-06 moves from "suspected" to **confirmed top-tier**, and its risk goes **up**: script-written formulas can be regenerated, hand-written ones cannot. A formula inventory is now a hard prerequisite, not a nice-to-have. |
| **Q7** Real pain | **Sales and Purchase pages.** | These get their own dedicated phase, ahead of general cleanup. Analysis in §15. |
| **Q10** Staging | **None exists** — build one, "consider it part of the plan." | **Staging becomes Phase 0.** Nothing touches production until it exists. |

Still open: Q2 (retention), Q3 (sheet sizes — Phase 0 measures it), Q5 (triggers), Q6 (concurrency),
Q8 (`src_html/`), Q9 (deploy/rollback). None of them block the early phases.

---

## 1. Scope of what was examined

| Area | Files | Read |
|---|---|---|
| Control plane | [00_Config.js](00_Config.js), [01_Registry.js](01_Registry.js), [Code.js](Code.js) | full |
| Data layer | [02_DataAccess.js](02_DataAccess.js) | full |
| Auth / RBAC / session | [03_Security.js](03_Security.js) | full |
| Generic table engine | [04_TableEngine.js](04_TableEngine.js) | full |
| Admin + system routes | [05_Admin.js](05_Admin.js), [07_Backup.js](07_Backup.js), [99_AuditTools.js](99_AuditTools.js) | full/partial |
| Company logic | [Company_TopLight_Actions.js](Company_TopLight_Actions.js) (3.2k lines), [Company_TopChemical_Actions.js](Company_TopChemical_Actions.js) (5.1k), [Company_ValleyFoods_Actions.js](Company_ValleyFoods_Actions.js) (6.8k) | structural + hot paths |
| Shared client | [UI_Components.html](UI_Components.html) (93 KB), [Client_Helpers.html](Client_Helpers.html), [ERP_DataTable_JS.html](ERP_DataTable_JS.html), [CSS_Tokens.html](CSS_Tokens.html) | full/partial |
| Pages | 100+ `Company_*.html` | sampled + pattern-scanned |
| Deployment | [.clasp.json](.clasp.json), [appsscript.json](appsscript.json) | full |
| Prior work | [Backup/PERFORMANCE_OPTIMIZATION_STRATEGY.md](Backup/PERFORMANCE_OPTIMIZATION_STRATEGY.md), [Backup/Erp performance agent prompt.md](Backup/Erp%20performance%20agent%20prompt.md) | full |

**Already done in a previous pass** (so *not* re-proposed here): client-side 50-row
pagination, chunked `requestAnimationFrame` tbody rendering, `getRefsCached_` reference cache,
request-scoped `_recordCache_`, batched `logHistory_`, `UI.submitOnce` double-submit guard,
idle prefetch (TopChemical only). The remaining wins are almost entirely **server-side and
architectural**.

---

## 2. Where the time actually goes — request lifecycle map

### 2.1 Full page load (`doGet`) — what a user pays on every navigation

```
  ┌─ doGet ──────────────────────────────────────────────────────────────┐
  │ 1. resetRecordCache_()                                    ~0 ms      │
  │ 2. isSystemEnabled_()          cached 15 s → sheet read   0–400 ms   │
  │ 3. ensureCompaniesRegistered_()                           ~0 ms      │
  │ 4. authenticateSystemUser_()                                         │
  │      └ SessionManager_.validate  cache hit ~10 ms / miss = full      │
  │        ERP_Sessions read                                  10–500 ms  │
  │      └ getRoleAuthorityMatrix_   cached 120 s → full                 │
  │        ERP_Pages_Matrix read                              0–400 ms   │
  │ 5. SessionManager_.touch()     every 30 s: full read +               │
  │      write of ERP_Sessions                                0–700 ms   │
  │ 6. getCompanyLogoUrl_()        UNCACHED full ERP_Companies read      │
  │                                                           300–500 ms │
  │ 7. getCompanyThemeCSS_()       cached / hardcoded         ~0 ms      │
  │ 8. userNameMap_()              cached 300 s               0–400 ms   │
  │ 9. Template eval + 3–4 include() — each one re-parses a              │
  │      STATIC file as an Apps Script template               150–400 ms │
  │10. ~120 KB HTML emitted; browser then loads xlsx CDN (≈900 KB)       │
  └──────────────────────────────────────────────────────────────────────┘
        THEN the page fires its first API.call → a second full round trip
```

**The critical structural fact:** the app is a *multi-page* application. Every nav click is a
full `doGet` — new HTML document, ~120 KB of shared JS/CSS re-downloaded and re-parsed, all
server middleware re-run, then a *separate* `google.script.run` round trip for the data. Two
sequential cold round trips per navigation is the single biggest architectural cost.

### 2.2 Data call (`apiRouter_` → company dispatch)

```
  resetRecordCache_()  →  disableRecordCache_() if the action is a WRITE  ← see F-01
  authenticateSystemUser_()      (cached)
  SessionManager_.touch()        (30 s throttle, else read+write ERP_Sessions)
  isSystemEnabled_()             (15 s cache)
  route.handler(...)             ← the actual business work
  logSystemAction_()             ← for writes: full ERP_Companies read + appendRow
```

---

## 3. Layer A — Sheets I/O (the dominant cost)

### F-01 · Request memoisation is switched **off** for every write — the highest-value single fix
- **Evidence:** [Code.js:285](Code.js#L285) — `if (!isReadAction_(request.action)) disableRecordCache_();` and [02_DataAccess.js:39](02_DataAccess.js#L39).
- **Cost:** A save handler that legitimately reads several sheets pays a *full* `getDataRange().getValues()` for **each** read, with zero reuse. By static count: `saveValleyInvoice_` = 6 `getAllRecords_` calls, `saveValleyReturn_` = 5, `addVacationAlloc_` = 4, `saveValleyProduct_` = 4. Add `logHistory_` (reads the target sheet's headers), `getCompanyName_` (full `ERP_Companies` read, [Code.js:564](Code.js#L564)), and the read-back after the write.
- **Why it's like this:** deliberately — the concern is that a memo taken *before* a write would serve stale data *after* it. That concern is real, but the cure is too broad.
- **Fix sketch:** keep the memo enabled for writes, but **invalidate per sheet at the moment of mutation** (`addRecord_`, `updateRowByCriteria_`, `deleteRowsByCriteria_` each drop their own `dbId|sheetName` key). Reads before the write reuse; reads after the write re-fetch. Same correctness, a fraction of the I/O.
- **Est. win:** *estimated* 3–6 fewer full-sheet reads per save → **1.5–3 s off a typical save**.
- **Risk:** Medium — touches the write path for all three companies. The invalidation hook must be exhaustive: any direct `sheet.appendRow` / `setValues` in company code that bypasses the helpers must also invalidate.
- **Decision:** **Needs your approval.** Best return in the document, and it sits on the save path of production financial data.

### F-02 · `getAllRecords_` always reads the **entire** sheet, all columns, no projection
- **Evidence:** [02_DataAccess.js:274](02_DataAccess.js#L274) → `sheet.getDataRange().getValues()`, then [02_DataAccess.js:44](02_DataAccess.js#L44) `buildRecordsFromRaw_` builds one JS object per row with a key per column.
- **Cost:** Two costs stack. (a) The Sheets round trip transfers every cell. (b) `buildRecordsFromRaw_` then allocates `rows × columns` object properties *and* runs `Object.values(record).some(...)` on every row to test emptiness — a second full pass over every cell in JS. On a 20-column × 10,000-row sheet that is ~200,000 property writes plus ~200,000 string coercions **per call**.
- **Fix sketch (ordered by risk):**
  1. Replace the `Object.values(...).some(...)` empty-row test with a cheap check on the PK / first non-blank column — same result, roughly 10× less work. *Low risk.*
  2. Add an optional `columns` projection so callers needing 3 of 25 columns say so (`getRange` on specific columns instead of `getDataRange`). *Low risk, opt-in per call site.*
  3. Add a `getAllRecordsRaw_` returning the 2D array + header index for hot aggregation loops, avoiding object materialisation entirely. *Low risk, opt-in.*
- **Est. win:** *estimated* 30–60 % of server CPU on list-heavy pages.
- **Risk:** Low for 1–3 provided they are opt-in and the existing signature is untouched.
- **Decision:** Item 1 is safe enough to do under standing instructions; items 2–3 need you to nominate which call sites convert first.

### F-03 · The batch Sheets API is enabled but never used
- **Evidence:** [appsscript.json](appsscript.json) declares the `Sheets v4` advanced service; a search for `Sheets.Spreadsheets` across all `.js` returns **0 hits**.
- **Cost:** Every multi-sheet read is N sequential round trips. `Sheets.Spreadsheets.Values.batchGet` fetches many ranges across a spreadsheet in **one** HTTP call.
- **Opportunity:** Pages that legitimately need 4–6 sheets (MfgOrderView, Attendance, Sales, Purchasing) could go from ~6 × 400 ms serial to ~1 × 600 ms.
- **Est. win:** *estimated* **1.5–2.5 s** on the heaviest pages.
- **Risk:** Medium — `batchGet` returns raw values with different empty-cell and date semantics than `getValues()`. Requires a compatibility shim plus per-page verification.
- **Decision:** **Needs your approval**, and I'd want to pilot it on exactly one page first.

### F-04 · Per-cell and per-row writes inside loops
- **Evidence:** [Company_TopLight_Actions.js:1033-1053](Company_TopLight_Actions.js#L1033-L1053) — for each purchasing line: `sheet.appendRow(...)` followed by up to **7** separate `sheet.getRange(r, c).setFormula(...)` calls. Same shape at [Company_TopLight_Actions.js:1853-1866](Company_TopLight_Actions.js#L1853-L1866), [Company_TopLight_Actions.js:2724-2734](Company_TopLight_Actions.js#L2724-L2734), [Company_TopLight_Actions.js:2228-2253](Company_TopLight_Actions.js#L2228-L2253). ValleyFoods' `writeByproductFormulas_` at [Company_ValleyFoods_Actions.js:3717](Company_ValleyFoods_Actions.js#L3717) issues 4 × (`getSheet_` + `getHeaders_` + `setFormula`) per row.
- **Cost:** A 10-line invoice becomes **~80 Sheets write round trips** where 2 would do.
- **Fix sketch:** build the full 2D block (values *and* formula strings — `setValues` accepts formula strings) and issue **one** `getRange(startRow, 1, n, cols).setValues(matrix)`. Identical cell contents, identical formulas.
- **Est. win:** *estimated* **3–8 s** off multi-line document saves.
- **Risk:** Medium-low. Output is byte-identical if done correctly — but this is invoice and costing data, so every converted site needs a before/after cell-by-cell diff on a copy.
- **Decision:** **Needs your approval per module.** I would not batch-convert all ~40 sites at once.

### F-05 · `deleteRow()` in descending loops
- **Evidence:** [02_DataAccess.js:351](02_DataAccess.js#L351) `deleteRowsByCriteria_`; [Company_TopLight_Actions.js:1068](Company_TopLight_Actions.js#L1068) `deleteLines_`; and several more.
- **Cost:** One round trip *and* a full sheet reflow per deleted row. Deleting a 30-line invoice = 30 structural mutations.
- **Fix sketch:** read once, filter out the doomed rows in memory, `clearContent()` the body and write the survivors back with a single `setValues`. ValleyFoods already does exactly this in two places ([Company_ValleyFoods_Actions.js:6049](Company_ValleyFoods_Actions.js#L6049), [Company_ValleyFoods_Actions.js:6654](Company_ValleyFoods_Actions.js#L6654)) — the pattern is proven in this codebase, just not applied uniformly.
- **Caveat:** the rewrite approach destroys per-row formatting and any formulas below the rewritten block. It is only safe on pure-data child tables. **Must be assessed per sheet.**
- **Est. win:** *estimated* 2–5 s on deletes of multi-line documents.
- **Risk:** Medium — it rewrites a sheet body.
- **Decision:** **Needs your approval per sheet**, with the formatting caveat understood.

---

## 4. Layer B — Spreadsheet-side computation (the hidden multiplier)

### F-06 · Heavy in-sheet formulas as computed columns — including whole-column `VLOOKUP`/`SUMIFS`
- **Evidence:** ~195 formula-write sites (`Company_TopChemical_Actions.js` 96, `Company_ValleyFoods_Actions.js` 69, `Company_TopLight_Actions.js` 30). The worst single example, [Company_ValleyFoods_Actions.js:3720](Company_ValleyFoods_Actions.js#L3720), writes **per byproduct row** a formula containing 4 whole-column `VLOOKUP`s into `valley_products!$A:$I` and `valley_manufacture_header!$A:$Y`, plus 2 whole-column `SUMIFS` over `valley_manufacture_header!I:I` and `J:J`. Others: `movement_code` at [Company_TopLight_Actions.js:1044](Company_TopLight_Actions.js#L1044) with `VLOOKUP(...,top_light_products!$A:$D,...)`, and `SUMIFS(...C:C,"غياب")`-style attendance formulas.
- **Cost — this is the compounding one:** whole-column `SUMIFS`/`VLOOKUP` written into *every* row makes recalculation **O(rows²)**. Worse, `getDataRange().getValues()` from Apps Script **blocks until the spreadsheet finishes recalculating**. So every formula added to these sheets makes *every read in the entire application* slower, permanently. This is a plausible explanation for the system feeling like it degrades over time rather than being uniformly slow.
- **Fix options:**
  - **(a)** Narrow the ranges: `$A:$I` → `$A$2:$I$5000`. Cheapest possible change, no schema change, no value change, potentially large win. **Lowest risk of anything in this document.**
  - **(b)** Replace `VLOOKUP` with `INDEX/MATCH` on bounded ranges — same result, materially cheaper.
  - **(c)** Compute the value in Apps Script and write a **static value** instead of a formula. Biggest win — kills recalculation entirely — but converts a live-computed cell into a stored one. **The column stays; the schema does not change.** It does, however, change behaviour if anyone edits the sheet by hand expecting the formula to re-derive.
- **Est. win:** *estimated* — plausibly the largest single win in the system, perhaps **30–50 % off every read** on affected spreadsheets. Not verifiable without opening the sheets.
- **Risk:** (a) low · (b) low-medium · (c) **high** — it changes the semantics of the data model even though it does not change the schema.
- **Decision:** **This is the single most important decision I need from you.** Option (a) alone may recover most of the win at almost no risk. My recommendation is to scope Phase 1 to (a) only, measure, and *then* decide whether (c) is worth it.

> **Something I could not verify from source:** whether these sheets contain additional
> hand-written `ARRAYFORMULA` / volatile functions (`NOW`, `TODAY`, `RAND`, `INDIRECT`, `OFFSET`)
> that no script writes. Volatile functions recalculate on *every* edit anywhere in the file. If
> present, that is a top-tier finding invisible from the codebase. **See Q4 in §12.**

---

## 5. Layer C — Request middleware overhead (paid on *every* call)

### F-07 · `SessionManager_.touch()` reads and rewrites the whole `ERP_Sessions` sheet
- **Evidence:** [03_Security.js:242](03_Security.js#L242) → `updateRowByCriteria_` → [02_DataAccess.js:327](02_DataAccess.js#L327), which does a full `getDataRange().getValues()` **plus** a `setValues` write.
- **Cost:** Throttled to once per 30 s per token — but that is once per 30 s **per active user**, on the shared AUTH spreadsheet, contending with every other user's session validation. Under concurrent load this is a hot spot on a shared resource.
- **Fix sketch:** write `last_activity` to `CacheService`/`PropertiesService` and flush to the sheet on a time-driven trigger (e.g. every 5 min), or simply lengthen the throttle to 5 min. `last_activity` is a soft field — five-minute staleness is harmless.
- **Est. win:** *estimated* 200–700 ms off roughly 1 in every N calls, and materially less lock contention with concurrent users.
- **Risk:** Low. Only affects the accuracy of a "last seen" timestamp.
- **Decision:** I'd do this under standing instructions; flagging it because it touches session data.

### F-08 · `getCompanyLogoUrl_()` is uncached
- **Evidence:** [03_Security.js:621](03_Security.js#L621) — full `getDataRange().getValues()` on `ERP_Companies` on **every page render**. Every other `ERP_Companies` reader — `getCompanySpreadsheetId_` at [03_Security.js:557](03_Security.js#L557), `getCompanyThemeCSS_` at [03_Security.js:674](03_Security.js#L674) — is version-cached. This one was missed.
- **Fix sketch:** wrap in the existing `version_companies` cache pattern, identical to its neighbours.
- **Est. win:** one full sheet read removed from every page load, ~300–500 ms.
- **Risk:** **Very low.** A copy of an established pattern in the same file.
- **Decision:** Safe. Recommended as a Phase 1 quick win.

### F-09 · `include()` re-evaluates static files as Apps Script templates on every request
- **Evidence:** [Code.js:450](Code.js#L450) uses `createTemplateFromFile().evaluate()`. But all shared includes are **100 % static**: `CSS_Tokens.html`, `UI_Components.html` (93 KB), `ERP_DataTable_JS.html` and both `*_Nav.html` contain **zero** `<? ?>` scriptlets; `Client_Helpers.html` contains zero scriptlets and one plain string placeholder already handled by the existing `.split().join()` substitution.
- **Cost:** ~115 KB of JS/CSS pushed through the templating engine per page load for no reason.
- **Fix sketch:** use `createHtmlOutputFromFile(f).getContent()` when the file has no scriptlets, or cache the rendered string in `CacheService` keyed by filename plus a deploy version. Placeholder substitution stays exactly as it is.
- **Est. win:** *estimated* **150–400 ms off every page load**, all three companies, all 100+ pages.
- **Risk:** Low — but the template path must remain available for any include that later gains a scriptlet.
- **Decision:** Safe. Strong Phase 1 candidate.

### F-10 · `logSystemAction_` does a full `ERP_Companies` read per logged action
- **Evidence:** [Code.js:623](Code.js#L623) → [Code.js:564](Code.js#L564) `getCompanyName_`, which calls `getAllRecords_` — and because of **F-01** that memo is *disabled* on exactly the write actions this function logs. Then `appendRowWithRetry_` appends one row.
- **Fix sketch:** cache the `companyId → name` map (versioned, same as its siblings); optionally buffer log rows and flush on a trigger.
- **Est. win:** *estimated* 300–500 ms off every write.
- **Risk:** Low for the cache. Buffering is higher risk — a log row could be lost on a hard failure.
- **Decision:** Cache = safe. Buffering = **needs your approval**, since it trades audit completeness for speed.

### F-11 · `isSystemEnabled_()` has a 15-second cache
- **Evidence:** [03_Security.js:479](03_Security.js#L479); `CONFIG.CACHE_KILLSWITCH_SECONDS: 15` at [00_Config.js:18](00_Config.js#L18).
- **Cost:** One `ERP_system_work` sheet open every 15 s per script instance, at the front of *every* request.
- **Trade-off:** this is deliberate — it is the emergency shutdown lever and must react fast. Raising it to 60 s cuts the reads 4× but delays a kill-switch flip by up to a minute.
- **Decision:** **Your call — a safety/performance trade, not a technical one.** My recommendation: leave it at 15 s. The win is small and the lever matters.

---

## 6. Layer D — Unbounded-growth data (performance that decays over time)

These are fine today and get worse every day. They are why a system that was fast at launch
feels slow a year in.

### F-12 · `ERP_Record_History` is read in full on every history request
- **Evidence:** [05_Admin.js:926](05_Admin.js#L926) `get_record_history` → `getAllRecords_(dbId, 'ERP_Record_History')`, then `.filter()` in JS.
- **Growth rate:** `logHistory_` at [02_DataAccess.js:470](02_DataAccess.js#L470) writes **one row per changed column per edit**, for all three companies, into one sheet in the AUTH spreadsheet. A 12-field edit produces 12 rows. This sheet grows faster than any business table in the system.
- **Consequence:** the history panel gets linearly slower forever, and will eventually hit the 6-minute execution limit or the cell cap.
- **Fix options:** archive rows older than N months to a dated sheet (**not a schema change** — same columns, additional tabs); or read only the tail; or maintain a `sheet_name + record_id → row range` index.
- **Decision:** **Needs your approval** — retention is a business/audit decision, not a technical one. **See Q2 in §12.**

### F-13 · `SystemLog` grows unbounded, appended on every write
- **Evidence:** [Code.js:582](Code.js#L582) `ensureSystemLogSheet_`, appended from `logSystemAction_`. `ChangedFields` stores `JSON.stringify(result.data)` — a **whole record object per row** — so this sheet grows in *bytes* very fast, not just rows.
- **Same treatment as F-12**, plus: consider truncating `ChangedFields`.
- **Decision:** **Needs your approval** (retention policy, and whether truncating the audit payload is acceptable).

### F-14 · `ERP_Sessions` read in full on every cache-missed validation
- **Evidence:** [03_Security.js:210](03_Security.js#L210) `validate` → `readRows_('ERP_Sessions')`. Revoked and expired rows are never removed by the normal path — `cleanup_sessions` exists at [Code.js:871](Code.js#L871) but only runs when invoked.
- **Fix sketch:** confirm the cleanup trigger is actually installed and running; consider archiving revoked rows.
- **Decision:** Low risk. The first step is simply to **confirm the trigger is installed** — see Q5.

---

## 7. Layer E — Caching strategy

### F-15 · Reference-cache TTLs are short and uniformly guessed
- **Evidence:** `getRefsCached_(dbId, 'products', **120**, ...)` at ~55 sites in TopLight and 29 in TopChemical; `CACHE_MATRIX_SECONDS: 120` at [00_Config.js:14](00_Config.js#L14).
- **Cost:** Products, parties and categories change a few times a *week*. A 120-second TTL means a user browsing for 10 minutes pays the full rebuild about five times.
- **Fix sketch:** the codebase already has the right mechanism — **version-keyed caches** (`bumpVersion_` + `version_*`, used correctly for companies/matrix/killswitch). Extend it: give reference data a long TTL (1–6 h) keyed on a version stamp that mutating actions bump. TopLight already has `bustTopLightCaches_` at [Company_TopLight_Actions.js:1633](Company_TopLight_Actions.js#L1633) — the discipline exists, it just isn't universal.
- **Est. win:** *estimated* — removes most repeat reference reads for an active session.
- **Risk:** Medium — a missed invalidation shows users stale dropdown options. Needs an exhaustive audit of every mutating action per sheet.
- **Decision:** **Needs your approval.** Correctness depends on completeness; I'd want to do it one company at a time.

### F-16 · Idle prefetch is implemented for TopChemical only
- **Evidence:** `register('prefetch_refs', ...)` exists at [Company_TopChemical_Actions.js:4267](Company_TopChemical_Actions.js#L4267) and nowhere else, yet `schedulePrefetch()` at [Client_Helpers.html:391](Client_Helpers.html#L391) is called from pages across all three companies. On TopLight and ValleyFoods pages that call fails and is silently swallowed.
- **Fix sketch:** add the equivalent `prefetch_refs` to TopLight and ValleyFoods.
- **Risk:** Low — it is a warm-up call; the worst case is that it warms nothing.
- **Decision:** Safe, small, good Phase 1 filler.

### F-17 · `04_TableEngine.js` is built, cached, indexed — and effectively unused
- **Evidence:** All three registries declare `tables:` catalogs (e.g. [Company_TopLight_Registry.js:15](Company_TopLight_Registry.js#L15)). But `tbl_list`/`tbl_save` are referenced by exactly **one** client file, `ERP_DataTable_JS.html`, which is itself included by only **2** of 118 pages. Meanwhile the engine has the two-tier cache, `Map`-based O(1) PK lookup, chunked cross-request caching and stamp-based invalidation that the rest of the app lacks.
- **A latent ordering bug worth checking:** `04_TableEngine.js` reassigns the global `executeCompanyAction_` in an IIFE at [04_TableEngine.js:335](04_TableEngine.js#L335), but `ROUTES` in `Code.js` captured the function **by value** at [Code.js:233](Code.js#L233). `04_TableEngine.js` is **not listed in `filePushOrder`** in [.clasp.json](.clasp.json), so whether the wrapper takes effect depends on file-evaluation order. If `Code.js` evaluates last, the wrapper is silently bypassed. This is a correctness question that also determines whether the engine is reachable at all.
- **RESOLVED — it is dead code.** Three independent proofs, all verified:
  1. **The dispatch wrapper never takes effect.** [.clasp.json](.clasp.json) `filePushOrder` places `Code.js` **6th**, and `04_TableEngine.js` is not in the list, so it evaluates *after*. By then `const ROUTES` at [Code.js:228](Code.js#L228) has already captured `executeCompanyAction_` **by value** at [Code.js:233](Code.js#L233). The IIFE reassigns the global binding, but `ROUTES.company_action.handler` still points at the original. (By contrast the sibling IIFE at [04_TableEngine.js:172](04_TableEngine.js#L172) *does* work, because `resetRecordCache_` is called by name at runtime, not captured.)
  2. **So a `tbl_*` call would throw.** `ERP_DataTable_JS.html` sends `tbl_list` through `API.call('company_action', ...)` ([ERP_DataTable_JS.html:267](ERP_DataTable_JS.html#L267)) → the *unwrapped* `executeCompanyAction_` → `TopLight.dispatch_`, which at [Company_TopLight_Actions.js:41](Company_TopLight_Actions.js#L41) does `if (!actions[action]) throw new Error('Unknown Top Light action: ' + action);`. `tbl_list` is not registered in any company.
  3. **Nothing calls it anyway.** Only [Company_TopLight_Products.html](Company_TopLight_Products.html) includes the engine (lines 11–12) and it never instantiates it — so those ~41 KB are dead weight downloaded on that page for nothing.
- **Revised plan impact:** do **not** migrate pages onto it. Instead **harvest** the good parts — the chunked cross-request cache (`putTableCache_`/`getTableCache_`) and the `Map`-based PK index (`getIndexedRecords_`) are genuinely better than what the rest of the app has — into the shared data layer, then delete the dead dispatch wrapper and drop the include from `Company_TopLight_Products.html`.
- **Decision:** Answered. No longer blocking.

---

## 8. Layer F — Page delivery & client-side

### F-18 · `xlsx.full.min.js` (~900 KB) loads on all 118 pages
- **Evidence:** [Client_Helpers.html:1](Client_Helpers.html#L1) — a top-level `<script src=...xlsx...>`; `Client_Helpers` is included by **118 of 118** pages. Excel export is used on a fraction of them.
- **Fix sketch:** lazy-load the library on first click of the Excel button (inject the `<script>`, then run the export). Zero behaviour change; the first export gets ~300 ms slower, every page load gets ~900 KB lighter.
- **Est. win:** *measured file size* — the largest single client-side win available, especially on mobile and slow connections.
- **Risk:** Low.
- **Decision:** Safe. Strong Phase 1 candidate.

### F-19 · Bootstrap loaded on 10 pages, Chart.js on 5 — at two different versions
- **Evidence:** `bootstrap@5.3.0` × 10, `chart.js@4.4.1` × 3 **and** `chart.js@4.4.3` × 2, plus `jspdf`, `jspdf-autotable`, `sortablejs`.
- **Cost:** Two Chart.js versions defeat browser cache reuse across pages. Bootstrap on 10 pages is likely used for a handful of components already covered by `UI_Components` / `CSS_Tokens`.
- **Fix sketch:** unify Chart.js on one version (free); audit whether Bootstrap is still needed on those 10 pages.
- **Risk:** Version unification = very low. Removing Bootstrap = medium (visual regressions), needing per-page verification.
- **Decision:** Version unification is safe. Bootstrap removal **needs your approval per page**.

### F-20 · `UI_Components.html` is 93 KB inlined into every page, uncacheable
- **Cost:** Apps Script `HtmlService` output cannot carry `Cache-Control`, so this is re-downloaded on every navigation. Combined with `Client_Helpers` and `CSS_Tokens`, that is ~115 KB per page view.
- **Fix options:** (a) split into a core (always needed) plus lazy modules loaded per page; (b) host the static bundle as a Drive/CDN file the browser *can* cache; (c) reduce it — the prior strategy doc identified ~24 duplicated `logout()` implementations and duplicated CSS across page files.
- **Risk:** (a) and (c) medium — they touch shared code every page depends on. (b) introduces an external dependency.
- **Decision:** **Needs your approval on the approach.** My preference: (c) first — pure deduplication, measurable and reversible — and defer (a)/(b).

### F-21 · Post-save full list re-fetch
- **Evidence:** the `.then(function (r) { ...toast...; load(); })` pattern, present across many pages — [Company_ValleyFoods_Cash.html:361](Company_ValleyFoods_Cash.html#L361) and [:370](Company_ValleyFoods_Cash.html#L370), [Company_ValleyFoods_MfgOrders.html:513](Company_ValleyFoods_MfgOrders.html#L513) and [:522](Company_ValleyFoods_MfgOrders.html#L522), [Company_ValleyFoods_Sales.html:427](Company_ValleyFoods_Sales.html#L427) and [:436](Company_ValleyFoods_Sales.html#L436), [Company_TopLight_Sales_Returns.html:180](Company_TopLight_Sales_Returns.html#L180), [Company_ValleyFoods_WorkCenters.html:138](Company_ValleyFoods_WorkCenters.html#L138), and more.
- **Cost:** After a one-row edit, the entire list is re-fetched and re-rendered — a full extra server round trip on every single save.
- **Fix sketch:** the save handlers already return the saved record. Patch the single row in `window.__dtStore[id]` and re-render. Keep the full reload for explicit refresh and for saves that can affect other rows (anything that shifts stock or balances must still reload).
- **Est. win:** *estimated* **2–3 s → ~200 ms** on every save.
- **Risk:** Medium — it needs a per-page judgement about whether a save has side effects on other rows. Getting this wrong shows the user stale numbers, which in an ERP is worse than being slow.
- **Decision:** **Needs your approval per page.** This was Tier-1 item #1 in the previous strategy doc and was not completed — I suspect for exactly this reason.

### F-22 · No `<link rel="preconnect">` / resource hints for CDN origins
- **Fix:** one `preconnect` line per CDN origin. Saves DNS + TLS setup on first fetch. Trivial, safe.

---

## 9. Layer G — Project & deployment hygiene

### F-23 · A 14.4 MB HTML file is being pushed to the Apps Script project
- **Evidence:** `appsheet_old_project.html` = **14,450,230 bytes** in the project root. [.clasp.json](.clasp.json) sets `rootDir: ""` and `htmlExtensions: [".html"]`, and there is **no `.claspignore`**. `skipSubdirectories: true` correctly excludes `src_html/`, `Backup/`, `assessment center/` and `appsheet_old_project_files/` — but root-level `.html` files are in scope.
- **Cost:** bloats the deployed project, slows every `clasp push`, and consumes Apps Script project quota. `Code.js.bak` (39 KB) is spared only because `.bak` isn't in `scriptExtensions`.
- **Fix:** add a `.claspignore`; move the archive out of the project root.
- **Risk:** Very low — but I want to **confirm with you** that it is genuinely a dead reference artifact before touching it.

### F-24 · `src_html/` is a stale partial duplicate of the project
- **Evidence:** 47 files. Some are byte-current with their root counterparts (`Company_TopLight_Cash.html`, `Company_ValleyFoods_MfgOrders.html` share mtimes with the root copies); others are weeks stale. Git shows three of them as modified alongside the root files.
- **Not a runtime cost** (the directory is not pushed), but a real risk of editing the wrong copy — which becomes a performance problem when an optimisation lands in the file that isn't deployed.
- **Decision:** **Needs your call** on what `src_html/` is for.

### F-25 · Two non-performance issues found while profiling
Flagged because I found them, not because they are in scope:
1. **[DbLive_Connector.js:14-20](DbLive_Connector.js#L14-L20)** — `DBLIVE_CONFIG.props` is documented as a map of *property key names*, but `user: 'appscript_user'` and `pass: 'YourStrongPassword123!'` are **values**, so `props.getProperty('appscript_user')` looks up a property literally named `appscript_user`. Either the connector is misconfigured, or a real credential is committed in source. Either way it warrants a look.
2. **[04_TableEngine.js:335](04_TableEngine.js#L335)** — the function-reassignment ordering issue described in F-17.

---

## 10. Phase 0 — Instrumentation (proposed prerequisite for everything)

I do not want to change production code based on the estimates in this document. Before any
optimisation I propose a **measure-only** phase:

1. **Server timing.** `apiRouter_` already captures `startTime` and `logSystemAction_` already
   writes a row. Add an elapsed-ms column to `SystemLog` — **append-only, at the end of the header
   list, which is the file's own documented convention at [Code.js:576](Code.js#L576), and not a
   schema change to any business table** — plus a Sheets-read counter per request. The
   `_tblSheetsReadCount_` counter at [04_TableEngine.js:11](04_TableEngine.js#L11) shows the
   intended pattern.
2. **Client timing.** Record `performance.now()` deltas for page-ready and first-data-render,
   reported through the existing `logClientError_` channel at [Code.js:460](Code.js#L460) or a
   sibling route.
3. **Spreadsheet inventory.** Row/column counts and formula counts per sheet. This is the single
   biggest gap in this investigation (see Q3/Q4). One read-only script, run once.
4. **Run for about a week of normal use**, then rank the real top-20 slowest actions.

Only then does the execution plan get written against facts. Everything above becomes a
hypothesis list to confirm or discard.

---

## 11. Findings ranked by value ÷ risk

### Tier 1 — high value, low risk (recommended for the first execution phase)
| # | Finding | Est. win | Risk |
|---|---|---|---|
| F-18 | Lazy-load `xlsx` (~900 KB off 118 pages) | Large, client-side | Low |
| F-09 | Stop template-evaluating static includes | 150–400 ms / page load | Low |
| F-08 | Cache `getCompanyLogoUrl_` | 300–500 ms / page load | Very low |
| F-06a | Bound whole-column formula ranges (`$A:$I` → `$A$2:$I$5000`) | Potentially very large | Low |
| F-02.1 | Cheap empty-row test in `buildRecordsFromRaw_` | 30–60 % server CPU on lists | Low |
| F-10 | Cache `getCompanyName_` in the logger | 300–500 ms / write | Low |
| F-16 | Add `prefetch_refs` to TopLight + ValleyFoods | Moderate | Low |
| F-19 | Unify Chart.js versions | Small | Very low |
| F-22 | `preconnect` hints | Small | Very low |
| F-23 | `.claspignore` — stop pushing 14 MB | Deployment speed | Very low |

### Tier 2 — high value, needs your decision
| # | Finding | Est. win | Why it needs you |
|---|---|---|---|
| F-01 | Per-sheet memo invalidation instead of blanket disable | 1.5–3 s / save | Touches the write path on financial data |
| F-04 | Batch row + formula writes | 3–8 s / multi-line save | Per-module verification required |
| F-21 | Stop full re-fetch after save | 2–3 s → 200 ms / save | Per-page side-effect judgement |
| F-15 | Version-keyed reference caches with long TTL | Large | Stale-data risk if invalidation is incomplete |
| F-03 | Adopt `Sheets.Values.batchGet` | 1.5–2.5 s on heavy pages | New API semantics; pilot one page first |
| F-07 | Defer `last_activity` writes | 200–700 ms on 1-in-N calls | Session data |

### Tier 3 — structural, needs a strategy decision
| # | Finding | Why it needs you |
|---|---|---|
| F-17 | TableEngine: adopt or delete? | Determines the whole plan's shape |
| F-06c | Formulas → script-computed static values | Largest possible win; changes data-model behaviour |
| F-12 / F-13 | History & SystemLog retention | Audit/business policy, not technical |
| F-20 | Shared bundle strategy | Architecture choice |
| F-05 | Bulk-rewrite deletes | Destroys formatting on rewritten ranges |

### Tier 4 — deliberately NOT recommended
| # | Item | Why not |
|---|---|---|
| F-11 | Lengthen kill-switch cache | Small win, weakens an emergency lever |
| — | Full SPA rewrite | Would fix the double round trip in §2.1, but it is a rewrite of 118 pages of production code. Not proportionate. |
| — | Migrating Sheets → the existing MySQL | Out of scope: it *is* a database change. Noted only because `DbLive_Connector.js` shows the capability exists. |

---

## 12. Questions I need answered before writing the execution plan

**Q1 — TableEngine (F-17).** Is `04_TableEngine.js` the intended future data path, or abandoned?
If it is the future, the plan should migrate list pages onto it and get caching for all of them at
once. If it is dead, we optimise the ~100 bespoke endpoints individually and delete it. *This
changes the entire plan's shape and is the first thing I need.*

**Q2 — Retention (F-12 / F-13).** How long must `ERP_Record_History` and `SystemLog` stay
instantly queryable in-sheet? Is archiving older rows to dated tabs in the same spreadsheet
acceptable? (Same columns — not a schema change.)

**Q3 — Sheet sizes.** Roughly how many rows do the largest sheets hold today
(`valley_attendance`, `top_light_sales_invoices`, `ERP_Record_History`, `SystemLog`)? Everything in
§3 scales with this and I cannot see it from source. If you'd rather not count, Phase 0 item 3 does
it automatically.

**Q4 — Hand-written formulas (F-06).** Do the business spreadsheets contain formulas that *no
script writes* — hand-added `ARRAYFORMULA`, `QUERY`, `IMPORTRANGE`, or volatile functions (`NOW`,
`TODAY`, `RAND`, `INDIRECT`, `OFFSET`)? These are invisible to me and could dominate everything
else in this document.

**Q5 — Triggers.** Which time-driven triggers are actually installed right now? `dailyCsvBackup`
at [07_Backup.js:3](07_Backup.js#L3) reads **every sheet of every company spreadsheet in full** — if
it runs during working hours it will visibly slow the app for everyone.

**Q6 — Users & peak load.** How many concurrent users at peak? Several findings (F-07, lock
contention on the AUTH spreadsheet) matter far more at 20 concurrent users than at 3.

**Q7 — The pain you actually feel.** Which specific screens do users complain about? I have ranked
by code analysis; your users' ranking is the one that matters and should override mine.

**Q8 — `src_html/` (F-24).** What is it? Safe to delete, or an active workspace?

**Q9 — Deployment & rollback.** How do you deploy (clasp push plus a new version?), and what is the
rollback procedure if a change misbehaves in production? Every phase needs a defined revert path
before it starts.

**Q10 — Verification.** Is there a staging copy of the spreadsheets and a test deployment I can
verify against? If not, **that is the first thing I recommend building** — F-01, F-04 and F-05 all
write to production financial data and I would not want to validate them live.

---

## 13. What I am NOT proposing

To be explicit about the boundaries you set:

- **No schema changes.** No column added, renamed, removed or reordered in any business table.
  The two places this document touches sheet *structure* are called out explicitly: an appended
  `SystemLog` timing column (Phase 0, following the file's own documented convention) and archive
  tabs for history/logs (F-12 / F-13). Both need your explicit yes.
- **No changes to backend function signatures**, to the `UIC.*` / `API.*` / `FMT.*` / `UI.*` public
  contracts, or to existing HTML anchor IDs.
- **No RBAC or session-security changes.** F-07 defers a timestamp write; it does not alter
  authentication, authorisation, or session lifetime.
- **No new npm packages or build step.**
- **No autonomous production edits.** Every Tier 2 and Tier 3 item stops for your approval, per
  module.

---

## 14. Recommended next step

1. You answer §12 — Q1, Q4, Q7 and Q10 are the ones that most change the plan.
2. I write **Phase 0 (instrumentation only)** for your approval — measure-only, no optimisation.
3. We run it for about a week and rank the *real* top-20 slow actions.
4. I write the phased execution plan against measured data, Tier 1 first, each phase with an
   explicit rollback path and a before/after measurement.

---

## 15. Deep-dive: the Sales & Purchase pages (added after Q7)

You named these as the real pain, so I traced them end to end. **The same anti-pattern appears in
all three companies**, and it explains the symptom directly.

### 15.1 The pattern: *read everything, then throw almost all of it away*

`get_sales_headers` ([Company_TopLight_Actions.js:1075](Company_TopLight_Actions.js#L1075)) defaults
to `limit = 10`. To return **10 rows** it performs, on a cold cache:

| # | Sheet read | Why | Cacheable? |
|---|---|---|---|
| 1 | `top_light_sales_invoices` (**full**) | the list itself | — |
| 2 | `top_light_customer_vendor` | customer names | 120 s |
| 3 | `top_light_sales_products` (**full**) | `soldMap` for the `fully_returned` flag | 90 s |
| 4 | `top_light_sales_returns` (**full**) | `returnedMap` for the same flag | 90 s |
| 5 | `top_light_current_products` | `currentQtyMap_` — **for the form's dropdown** | 90 s |
| 6 | `top_light_product_purchasing` (**full**) | `latestSalesPriceMap_` — **for the form's dropdown** | 90 s |
| 7 | `top_light_products` | product option labels | 120 s |

**Seven full sheet reads — four of them the large transaction tables — to render ten rows.**

Three separate wastes stack here:

1. **Options are built on every list render.** Reads 5, 6 and 7 exist only to populate the
   *add/edit form's* dropdowns via `salesOptions_` → `salesProductOptions_`
   ([Company_TopLight_Actions.js:1677](Company_TopLight_Actions.js#L1677)). The user is looking at a
   list. The form may never open. **Splitting options out of the list call removes 3 of 7 reads
   from the common path** and is a pure win with no staleness risk.
2. **`fully_returned` is computed over every invoice ever**, then 10 survive the `.slice()`. It only
   needs computing for the rows actually returned.
3. **The 90/120-second TTLs guarantee repeated payment.** A user working the sales screen for ten
   minutes re-pays this roughly five to seven times. `latestSalesPriceMap_`
   ([Company_TopLight_Actions.js:1659](Company_TopLight_Actions.js#L1659)) scans the *entire*
   purchasing-lines table to derive one price per product — every 90 seconds.

### 15.2 The same shape on the other pages

| Endpoint | Reads | Pagination | Options cached? |
|---|---|---|---|
| `get_sales_headers` (TopLight) [:1075](Company_TopLight_Actions.js#L1075) | 7 | slices to 10 **after** mapping all rows | 90–120 s |
| `get_purchasing_headers` (TopLight) [:592](Company_TopLight_Actions.js#L592) | 5+ | slices to 10 **after** mapping all rows, and runs a nested key-scan `pick()` **per row per field** — O(rows × fields × columns) | 90–120 s |
| `get_valley_purchasing_costing` (ValleyFoods) [:3075](Company_ValleyFoods_Actions.js#L3075) | 3 | **none — returns every row** | **none — rebuilt from raw reads every call** |
| `get_purchase_items` (TopChemical) [:1600](Company_TopChemical_Actions.js#L1600) | 3 | maps **all** rows, `.reverse()`, *then* slices to 10 | via `vendorRefs_`/`itemRefs_` |

**ValleyFoods purchasing is the worst of the four:** no limit, no caching on either option list, and
it calls `settingsEnsureSheet_` twice before doing any work.

### 15.3 What this means for the plan

These pages need **no new infrastructure** — the fixes are local, and the biggest ones carry no
staleness risk at all:

- **Split `options` out of every list endpoint** into its own cached action, fetched when the form
  first opens. *Removes 3 of 7 reads on TopLight sales; 2 of 3 on ValleyFoods purchasing.*
- **Slice before mapping**, not after. Currently every row in the table is transformed into an
  object with ~15 derived fields, and then 99 % are discarded.
- **Compute derived flags (`fully_returned`) only for the returned slice.**
- **Add a limit + caching to ValleyFoods purchasing**, matching what the other two already do.
- **Raise the reference TTLs** behind version-keyed invalidation (F-15).

This is why Sales & Purchase get their own dedicated phase, ahead of the general cleanup.
