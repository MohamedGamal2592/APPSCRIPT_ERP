# ERP Performance — Phased Execution Plan

**Companion to:** [PERFORMANCE_INVESTIGATION.md](PERFORMANCE_INVESTIGATION.md) (findings F-01 … F-25)
**Date:** 2026-09-05
**Status:** DRAFT FOR APPROVAL — no code has been changed.

**Ground rules carried through every phase:**
- No database/sheet **schema** changes. No column added, renamed, removed or reordered.
- Production code. Nothing lands in production that has not run in staging first (from Phase 1 onward).
- **Every phase ends at an approval gate.** I stop and report; you decide whether the next one starts.
- Each phase has a **named rollback** that can be executed in minutes.

---

## Two things I found while designing this plan — read these first

### ⚠️ 1. There is no working backup

`dailyCsvBackup` ([07_Backup.js:3](07_Backup.js#L3)) begins:

```js
var cfg = (typeof DB_CONFIG !== 'undefined') ? DB_CONFIG : null;
if (!cfg) return { ok: false, error: 'no DB_CONFIG' };
```

`DB_CONFIG` **is not defined anywhere in the project** — I searched every `.js` and `.html`. So
every invocation returns `{ok:false}` immediately and **no CSV backup has ever been produced**.
`CONFIG.BACKUP_FOLDER_ID` at [00_Config.js:12](00_Config.js#L12) is also still `''`.

This is not a performance issue, but it changes the plan's shape: I am not willing to optimise
write paths that touch invoices and costing data on a system with no restore point. **Fixing this
is Phase 0, Step 1** — ahead of everything else, including staging. It is also cheap.

### ✅ 2. Staging will be unusually clean to build

I checked how the app resolves spreadsheets, and the news is good: there is **exactly one hardcoded
spreadsheet ID in the whole codebase** — `CONFIG.AUTH_SPREADSHEET_ID` at
[00_Config.js:9](00_Config.js#L9). Every company database is resolved at runtime from
`ERP_Companies.company_sheet_link` via `getCompanySpreadsheetId_`
([03_Security.js:557](03_Security.js#L557)).

That means **one config line plus the staging `ERP_Companies` rows** fully redirects the system.
No code changes scattered across company files. I also verified no company action writes to Drive
(only the dead backup does), so staging cannot corrupt production Drive files.

The one real isolation risk is **MySQL**: `DbLive_Connector.js` points at production
`164.92.143.177/topchemicalpest`. Handled explicitly in Phase 0.

---

## Phase map

| Phase | Name | Touches production? | Gated on |
|---|---|---|---|
| **0** | Safety net: backups + staging environment | Backup only | — |
| **0b** | Instrumentation & inventory (measure-only) | Yes (additive) | Phase 0 |
| **1** | Safe wins (Tier 1) | Yes | Phase 0b baseline |
| **2** | **Sales & Purchase pages** — your named pain | Yes | Phase 1 |
| **3** | Write path (saves & deletes) | Yes | Phase 2 |
| **4** | Formulas — the big one | Yes | Phase 0b inventory + explicit go |
| **5** | Retention & growth | Yes | Your answer to Q2 |
| **6** | Dead code & hygiene | Yes | anytime after Phase 1 |

Phases 1–3 are where most of the felt improvement comes from. Phase 4 is where the largest
*theoretical* win sits, and also the largest risk — it is deliberately last among the technical
phases and fully gated.

---

## Phase 0 — Safety net

**Objective:** make it possible to break something and recover. Nothing optimises in this phase.

### Step 1 — Working backups (do this first, regardless of everything else)
- Define the missing `DB_CONFIG` (map of company name → spreadsheet id, built from `ERP_Companies`
  so it cannot drift) so `dailyCsvBackup` actually runs.
- Set `CONFIG.BACKUP_FOLDER_ID`.
- Install the time-driven trigger — **outside working hours**, because `sheetToCsv_`
  ([07_Backup.js:44](07_Backup.js#L44)) reads every sheet of every company spreadsheet in full and
  will visibly slow the app for everyone if it runs mid-day.
- Verify: confirm CSVs land in Drive, and **restore one sheet from a CSV into a scratch spreadsheet**
  — an untested backup is not a backup.

### Step 2 — Staging environment
1. **Copy the spreadsheets.** Drive-copy the AUTH spreadsheet and all three company spreadsheets.
   In-file formulas survive a copy; cross-file `IMPORTRANGE` (if any — Phase 0b will tell us) needs
   re-authorising and re-pointing.
2. **Copy the script project.** New Apps Script project, `clasp push` the same source, with a
   `.clasp.staging.json` holding the staging `scriptId`. Same code, different target.
3. **Flip the one switch.** Staging `00_Config.js` gets the staging `AUTH_SPREADSHEET_ID`.
   *Recommendation:* read it from a Script Property with the current value as fallback, so prod and
   staging can share identical source and we never risk pushing a staging ID to production.
4. **Re-point staging `ERP_Companies`.** Update `company_sheet_link` in the staging AUTH copy to the
   staging company spreadsheets. This is data, not schema.
5. **Cut the MySQL path.** Leave `MYSQL_USER`/`MYSQL_PASSWORD` script properties **unset** in
   staging. `dbGetConnection_` ([DbLive_Connector.js:54](DbLive_Connector.js#L54)) then throws a
   clear configuration error instead of touching production MySQL. *(While there: the `props` map at
   [DbLive_Connector.js:14-20](DbLive_Connector.js#L14-L20) has values where key names belong — see
   F-25. Worth fixing, and it looks like a real password is in source.)*
6. **Clear staging sessions** and create a couple of test users per company covering each role level.
7. **Verify isolation deliberately:** save a record in staging, then confirm the production sheet is
   untouched. Do this before trusting staging for anything.

**Deliverable:** a staging URL you can click, backed entirely by copied data.
**Rollback:** n/a — nothing in production changes except the backup config.
**Gate:** you confirm staging works and is genuinely isolated.

---

## Phase 0b — Instrumentation & inventory (measure-only)

**Objective:** replace my estimates with your real numbers. No optimisation.

1. **Server timing.** Add elapsed-ms and a Sheets-read counter to the `SystemLog` row that
   `logSystemAction_` already writes. **Appended at the end of `SYSTEM_LOG_HEADERS`
   ([Code.js:576](Code.js#L576)) — the file's own documented convention, and not a business-table
   schema change.** Also extend logging to read actions, which are currently `NO_LOG`
   ([Code.js:518](Code.js#L518)) — the slow ones are reads, so today they are invisible.
2. **Client timing.** `performance.now()` deltas for page-ready and first-data-render, reported
   through the existing `logClientError_` channel ([Code.js:460](Code.js#L460)).
3. **Spreadsheet & formula inventory** — *the critical one, now that you've confirmed hand-written
   formulas exist (Q4)*. A read-only script that reports, per sheet: row count, column count,
   formula-cell count, and every distinct formula pattern — flagging whole-column ranges
   (`A:A`, `$A:$I`), volatile functions (`NOW`, `TODAY`, `RAND`, `INDIRECT`, `OFFSET`),
   `ARRAYFORMULA`, `QUERY` and `IMPORTRANGE`, and marking which patterns the code writes versus which
   are hand-authored. **Phase 4 cannot be scoped without this.**

**Duration:** ~1 week of normal use, then rank the real top-20 slowest actions.
**Rollback:** revert the logging columns; they are additive and inert.
**Gate:** we review the real numbers together. **Findings may reorder every later phase — that is the point.**

---

## Phase 1 — Safe wins

**Objective:** meaningful improvement with minimal risk, to build confidence in the pipeline.
All Tier-1 items from investigation §11. Each is independent and separately revertible.

| # | Change | Files |
|---|---|---|
| F-18 | Lazy-load `xlsx` on first Excel click (~900 KB off all 118 pages) | [Client_Helpers.html](Client_Helpers.html) |
| F-09 | Serve static includes via `createHtmlOutputFromFile` instead of template evaluation | [Code.js:450](Code.js#L450) |
| F-08 | Version-cache `getCompanyLogoUrl_`, matching its siblings | [03_Security.js:621](03_Security.js#L621) |
| F-10 | Version-cache `getCompanyName_` in the logger | [Code.js:564](Code.js#L564) |
| F-02.1 | Cheap empty-row test in `buildRecordsFromRaw_` | [02_DataAccess.js:44](02_DataAccess.js#L44) |
| F-16 | Add `prefetch_refs` to TopLight and ValleyFoods | both Actions files |
| F-19 | Unify the two Chart.js versions | 5 pages |
| F-22 | `preconnect` hints for CDN origins | [CSS_Tokens.html](CSS_Tokens.html) |
| F-23 | `.claspignore` — stop pushing the 14.4 MB archive | new file |

**Deliberately NOT in this phase:** F-06a (formula range narrowing). Although I originally rated it
Tier 1, your Q4 answer means formulas may be hand-written — so it moves behind the Phase 0b
inventory. **This is a change from the investigation document.**

**Verification:** staging first; each page loads, exports, and saves correctly. Compare Phase 0b
timings before and after.
**Rollback:** per-item git revert; every item is independent.
**Gate:** measured improvement reported before Phase 2 begins.

---

## Phase 2 — Sales & Purchase pages (your named pain)

**Objective:** fix the screens you actually feel. Detailed analysis in investigation §15.
The core problem: **7 full sheet reads to display 10 rows**, and 3 of those reads exist only to
populate a form that may never open.

| Step | Change | Risk |
|---|---|---|
| 2.1 | **Split `options` out of list endpoints** into a separately cached action, fetched when the form opens. Removes 3 of 7 reads on TopLight sales; 2 of 3 on ValleyFoods purchasing. | Low — no staleness change; same data, fetched later |
| 2.2 | **Slice before mapping.** Today every row is transformed then 99 % discarded. | Very low |
| 2.3 | **Compute `fully_returned` for the returned slice only** instead of every invoice ever | Low |
| 2.4 | **Add limit + caching to ValleyFoods purchasing** ([:3075](Company_ValleyFoods_Actions.js#L3075)) — currently no pagination and no option caching at all | Low |
| 2.5 | **Hoist the per-row `pick()` key-scan** in TopLight purchasing ([:592](Company_TopLight_Actions.js#L592)) — currently O(rows × fields × columns); resolve the alias map once | Low |
| 2.6 | **F-15 on these sheets only:** long TTL + version-keyed invalidation, following the existing `bustTopLightCaches_` pattern ([:1633](Company_TopLight_Actions.js#L1633)) | **Medium** — needs every mutating action on these sheets to bump the version |
| 2.7 | **F-21 on these pages only:** stop the full list re-fetch after save | **Medium** — needs a per-page judgement on side effects |

**On 2.6 and 2.7 I will come to you with a specific list before touching anything.** 2.7 in
particular: any save that shifts stock or balances must keep reloading, because showing a stale
number in an ERP is worse than being slow. I will propose which saves are safe and you confirm.

**Verification:** side-by-side staging vs production on the same copied data — same rows, same
totals, same ordering. Timing before/after from Phase 0b.
**Rollback:** per-endpoint revert.
**Gate:** you use the staging sales & purchase pages and confirm they feel right.

---

## Phase 3 — Write path

**Objective:** cut save and delete times. Higher risk — this writes financial data.

| Step | Change | Risk |
|---|---|---|
| 3.1 | **F-01** — per-sheet memo invalidation instead of the blanket `disableRecordCache_` ([Code.js:285](Code.js#L285)). Requires an audit of every direct `appendRow`/`setValues` that bypasses the helpers. | **Medium-high** |
| 3.2 | **F-04** — batch row + formula writes ([Company_TopLight_Actions.js:1033-1053](Company_TopLight_Actions.js#L1033-L1053) and ~40 similar sites). **One module at a time**, each with a cell-by-cell before/after diff on a staging copy. | **Medium** |
| 3.3 | **F-07** — defer `last_activity` writes ([03_Security.js:242](03_Security.js#L242)) | Low |
| 3.4 | **F-05** — bulk-rewrite deletes, **only on sheets confirmed to carry no per-row formatting or trailing formulas**. The Phase 0b inventory determines which qualify. | **Medium-high** |

**Approval model for this phase:** module by module, not phase-wide. I will not convert all ~40
write sites in one change.

**Verification:** for every converted write — save in staging, export both the old and new sheet,
diff every cell. Formulas must match as formulas, not just as displayed values.
**Rollback:** per-module revert plus, if needed, CSV restore from Phase 0 backups.
**Gate:** explicit sign-off per module.

---

## Phase 4 — Formulas (the largest win, the largest risk)

**Objective:** address F-06 — whole-column `VLOOKUP`/`SUMIFS` written into every row, which makes
recalculation O(rows²) and blocks *every* `getValues()` in the application until it completes.

**Fully gated on the Phase 0b inventory.** Your Q4 answer (hand-written formulas exist) means we
must separate the two populations before touching anything:

- **Script-written formulas** — regenerable from code, so comparatively safe to change.
- **Hand-written formulas** — no source of truth but the sheet itself. A mistake here is
  unrecoverable except from backup, which is exactly why Phase 0 Step 1 comes first.

Escalating ladder, each step gated separately:

| Step | Change | Reversible? |
|---|---|---|
| 4.1 | **Bound whole-column ranges** on *script-written* formulas: `$A:$I` → `$A$2:$I$5000`. Same values, dramatically cheaper recalc. | Yes — regenerate |
| 4.2 | Same, on **hand-written** formulas, sheet by sheet, after backup verification | Backup only |
| 4.3 | `VLOOKUP` → `INDEX/MATCH` on bounded ranges | Yes |
| 4.4 | **Formula → script-computed static value.** The biggest win — eliminates recalculation entirely. **Changes data-model behaviour:** the cell stops re-deriving if someone edits the sheet by hand. Column unchanged, so not a schema change, but a genuine behavioural change. | **Hard to reverse** |

**My recommendation:** do 4.1 and measure. If the inventory shows what I expect, 4.1 alone may
recover most of the win at a fraction of the risk, and 4.4 may prove unnecessary. **I would not
proceed to 4.4 without a specific conversation about it.**

**Verification:** recalc timing per sheet before/after; full-sheet value diff (values must be
identical, only the formula changes).
**Rollback:** restore the sheet from the Phase 0 CSV backup.
**Gate:** step-by-step. Each of 4.1–4.4 is its own decision.

---

## Phase 5 — Retention & growth *(blocked on Q2)*

**Objective:** stop the slow, permanent decay (F-12, F-13, F-14).

- `ERP_Record_History` grows by **one row per changed column per edit**, across all three companies,
  into one sheet — and `get_record_history` reads all of it ([05_Admin.js:926](05_Admin.js#L926)).
- `SystemLog` stores a whole serialised record per row in `ChangedFields`, so it grows fast in bytes.
- `ERP_Sessions` accumulates revoked rows; `cleanup_sessions` exists but I have not confirmed the
  trigger is installed (Q5).

**Proposed:** archive rows older than N months into dated tabs in the same spreadsheet — same
columns, so not a schema change — and read only the live tab by default.

**I need your answer to Q2 (retention period) before this can be scoped.**

---

## Phase 6 — Dead code & hygiene

Low risk, do whenever convenient after Phase 1.

- **Remove the dead TableEngine dispatch** (F-17) — but first **harvest** its chunked cross-request
  cache and `Map`-based PK index into the shared data layer; they are better than what the rest of
  the app has.
- **Drop the `ERP_DataTable` / `ERP_DataTable_JS` includes** from
  [Company_TopLight_Products.html](Company_TopLight_Products.html) — ~41 KB of JS downloaded and
  parsed on that page, never instantiated.
- **F-20 (c):** deduplicate the ~24 copy-pasted `logout()` implementations and repeated CSS.
- **Resolve `src_html/`** (F-24) — blocked on Q8.
- **F-25:** the `DbLive_Connector.js` credential/key-name confusion.

---

## Consolidated risk register

| Risk | Mitigation |
|---|---|
| A write optimisation corrupts financial data | Phase 0 backups **first**; staging **before** production; per-module cell-level diffs; module-by-module approval |
| A cache change shows stale data | Version-keyed invalidation, not TTL guessing; audit every mutating action per sheet; roll out one company at a time |
| A formula change alters computed values | Value-level diff (values identical, only formulas change); script-written before hand-written; CSV restore path |
| Staging accidentally writes to production | Single-switch `AUTH_SPREADSHEET_ID`; MySQL credentials unset in staging; **deliberate isolation test before trusting it** |
| Optimising something that was never slow | Phase 0b measures first; your Q7 answer already redirected priority to Sales & Purchase |
| Losing track of which copy is deployed | Resolve `src_html/` (Q8) before large edits |

---

## What I need from you to start

**To begin Phase 0 right now**, nothing — Step 1 (backups) is unambiguously needed and Step 2
(staging) you already asked for.

**Useful soon:**
- **Q9** — how you deploy and how you'd roll back. Phase 1 needs a defined revert path.
- **Q2** — retention period, to scope Phase 5.
- **Q8** — what `src_html/` is, before Phase 2 edits company pages.
- **Q5/Q6** — installed triggers and peak concurrency.

**One correction to the investigation:** F-06a (narrowing formula ranges) was listed there as a
Tier-1 safe win. Your Q4 answer moves it out of Phase 1 and behind the Phase 0b inventory, because
hand-written formulas cannot be regenerated if a change goes wrong.

**Say the word and I'll start with Phase 0, Step 1** — the missing backup — since that is needed
whether or not any optimisation ever happens.
