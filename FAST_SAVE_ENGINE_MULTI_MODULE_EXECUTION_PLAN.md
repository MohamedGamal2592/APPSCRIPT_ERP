# Fast-Save Engine — Multi-Module Migration Execution Plan

Modules in scope: **Sales**, **Sales Returns**, **Purchasing** (Manufacturing is the
reference implementation already specified for Phase 1 of the MFG work).
Author: principal Apps Script architect pass. Status: plan only — **no code is written by this document**.

---

## 0. Verified state of the repository (read before anything else)

| Claim in the brief | Verified fact |
|---|---|
| `Core_FastSave.js` exists as a dedicated file | **It does not exist.** `glob **/Core_FastSave.js` → no files. Step 0 of Stage A creates it. |
| Phase 1 was scoped to MFG only | There is **no** `VF_MFG_ORDERS_SPEED_*` document in the repo either. This document supersedes that draft and is the single source of truth. |
| Purchasing key is `Code` **or** `batch_id` | Purchasing key is `Code` (header) / `code` (lines). **`batch_id` is not a purchasing key** — it belongs to the assessment/batch module (`Company_ValleyFoods_Actions.js:3535, 3828`). Do not carry it into this migration. |
| Sales parent → child | Parent `valley_sales_invoices`, child `valley_sales_products`, **plus a third table** `valley_sales_product_stock` (batch allocations) that the brief described as the footer. |
| Returns parent → child | Parent `valley_sales_returns`, child `valley_sales_returns_stock`. Append-only today (no patch/delete path). |

Legacy helper surface to be displaced: `patchRowByCriteria_` (`Code.js:1397`),
`deleteRowsWhereIn_` (`Code.js:1495`), `deleteRowsByCriteria_` (`Code.js:1481`).
Call-site census (verified by ripgrep): **131 sites / 4 files** — VF 61,
TopChemical 14, Code.js 12, TopLight 2. Only the VF document-save sites are in this
programme; the remainder is Stage E backlog.

---

## 1. Guardrails (non-negotiable, override every later instruction)

1. **LIVE PRODUCTION.** No deploy, no `clasp push`, no trigger changes, no script-property
   changes inside this task, no execution of any write action against live data, no
   fixtures, no temporary rows, even ones intended to be rolled back.
2. **NO SCHEMA CHANGE.** No column added/renamed/reordered, no sheet added/renamed, no
   header row touched, including system tables — `PERF_LOG_HEADERS_` (`Code.js:7889-7891`)
   keeps exactly nine columns. Indexing uses only existing columns.
3. **OPT-IN FLAGS, all default `false`:**
   `FAST_SAVE_CORE_`, `MFG_BATCH_WRITES_`, `SALES_BATCH_WRITES_`, `RETURNS_BATCH_WRITES_`,
   `PURCHASE_BATCH_WRITES_`. With a flag false the legacy path must run bit-for-bit as today.
4. **DECOUPLING GATE.** `Core_FastSave.js` contains zero module identifiers — no
   `valley_`, `mfg`, `MFG`, `sales`, `returns`, `purchase`, no Arabic user-facing strings.
   Objective check: `rg -i "valley_|sales|return|purchase|mfg|manufacture" Core_FastSave.js`
   returns only generic words in comments that name no module (target: zero hits).
5. **OPTIMISTIC UI + SYNC MECHANISM.** The optimistic contract and the
   "new changes — refresh" prompt (driven by `noteTableChange_` / `readTableVersions_`,
   `Code.js:848-872`) must survive. The engine stamps by construction, not by convention.
6. **NO UNIT TESTS** in the sense of executable behavioural suites against prod data.
   Verification is source inspection, call-path tracing, `node --check`, and — only with
   explicit owner authorisation — the staging spreadsheet path
   (`Plan_Prompt_Archive/STAGING_SETUP.md`). Runtime acceptance is recorded as NOT RUN.

---

## 2. Target architecture (3 layers, one new file)

`Core_FastSave.js` — generic, module-free, flag-gated by `FAST_SAVE_CORE_`.

### Layer 1 — Primitives (pure sheet I/O)

| Function | Contract |
|---|---|
| `readColumnValues_(sheet, headerName)` | One `getRange(2, col, lastRow-1, 1).getValues()`. Returns `{index, values}`. No object building. |
| `keyIndex_(sheet, keyHeader, keysOrNull)` | One column-only read of the key column (or a composite of up to 3 columns), returns `Map<key,rowNumber>` for the requested keys only. Key normalization mirrors `indexById` (`Code.js:1818-1840`): trimmed string form, blank keys skipped, **last match wins**. Composite keys join with `|`. |
| `patchRowsByKey_(sheet, keyHeader, updatesByKey, opts)` | ONE `Sheets.Spreadsheets.Values.batchUpdate` (`valueInputOption: 'RAW'` by default, see §5.3) covering every target cell in every target row; contiguous columns merged into runs; never touches unnamed cells; `opts.preserveFormulas` defaults **true** and is implemented by reading `getFormulas()` once for the union of target rows, never per row; `opts.missingKey: 'throw'|'skip'` throws a typed error (see §5.4). |
| `appendRowsBlock_(sheet, rows, opts)` | ONE contiguous `getRange(start,1,n,cols).setValues(...)`; caller supplies every value including `id` and `unique_id`. |
| `deleteRowsByKeys_(sheet, keyHeader, keys)` | Resolve rows via one column read, then ONE `Sheets.Spreadsheets.batchUpdate` with `DeleteDimension` requests **in descending start-index order** (0-based, `endIndex` exclusive), chunked ≤100 requests. |

### Layer 2 — Orchestration

```js
fastSaveSections_({
  scopeId,                          // spreadsheet id, passed through to stamps
  lock: true,                       // executeWithLock_ is re-entrant (Code.js:899-900)
  sections: [{
    sheetName, keyHeader,           // string or array for composite keys
    mode,                           // 'patch' | 'insert' | 'patch+insert+delete'
    rows,                           // caller-normalized payloads
    keyOf(row),                     // caller-owned key extraction
    fieldMap,                       // optional wire-name -> header-name map
    compute(row, ctx),              // caller-owned derived columns (MFG plan Phase 3)
    overwriteColumns,               // explicit list; empty means formulas are preserved
    parentHeader, parentKey,        // FK stamped onto inserted rows
    deleteKeys, allowDelete
  }]
}) -> {
  sections: [{ sheetName, writtenByKey, appendedByKey, deletedKeys,
               rowCount, readsUsed, writesUsed, stamped }]
}
```

Guarantees the engine owns so every future module inherits them:

- exactly **one read + one write call per section** upper bound, asserted into the manifest;
- `noteSheetChange_(sheet)` on every section that wrote anything (stamp path proven at
  `Code.js:848-851`); `bumpVfRefsVersion_` is *not* called by the engine — the adapter
  decides, exactly as module code does today via `finBustRefs_`;
- all writes inside the caller's single lock; the engine never opens a second lock;
- returns a **manifest** so adapters stop re-reading after writing;
- never mints `unique_id`, never allocates `id`, never touches headers or formulas
  unless `overwriteColumns` names them.

### Layer 3 — Module adapters (business logic stays in `Company_ValleyFoods_Actions.js`)

Owns validation, permissions, cost stripping, Arabic error text, history/audit,
receipts/idempotency and cache busting. It translates engine failures into the exact
legacy messages.

---

## 3. Phase 1 — Call-site audit & schema mapping

### 3.1 Sales — `saveValleyInvoice_` (`:11573-11955`)

> Header arrays quoted in this section come from `settingsEnsureSheet_` seeds and
> `getHeaders_` calls in the code, not from the live sheets. Only the MFG tables have a
> runtime schema assertion (`mfgAssertMfgSchema_`, `:7623`). Every name used by the engine
> must therefore be confirmed against the live header row during the audit step — the
> seeded array is a lead, not proof.

| Table | Role | Record key | Parent FK | Identity notes |
|---|---|---|---|---|
| `valley_sales_invoices` (`:11281`) | Parent | `invoice_unique_id` | — | 27 declared headers at `:11285`; **also has a trailing `unique_id` column** — `saveValleyInvoice_` writes the minted value into `invoice_unique_id` (`:11791`) and uses it for history (`:11799`). Audit must confirm `unique_id` is not the live identity before the adapter picks a key. |
| `valley_sales_products` (`:11282`) | Lines | `unique_id` | `valley_sales_header_id` | 13 headers at `:11286`. **`id` is a per-invoice ordinal** (`:11821`, value `i2+1`, or `0` when editing) — it is NOT the global autoincrement. Do not route it through `getNextIdBatch_`. |
| `valley_sales_product_stock` (`:11856-11857`) | Allocations (footer) | composite `valley_sales_products_id` + `product_unique_id` | `valley_sales_products_id` | 8 headers. Composite key required — this is the case that forces composite-key support in `keyIndex_`. |

Current write path and the exact defects to remove:

| Site | Today | Cost |
|---|---|---|
| `:11723-11950` | All work inside one `executeWithLock_` — preserve | — |
| `:11781` | Header update = one row `setValues` | already fine; engine keeps it as a 1-row patch |
| `:11783` | History before-image: `getAllRecords_(FIN_SALES_INV_SHEET).find(...)` then falls back to the in-hand `dataAll[rowNum-1]` | **one wasted full-table read + full record rebuild**; the row is already in memory |
| `:11797` | New invoice via `appendRow` | separate round trip; move to `appendRowsBlock_` |
| `:11811-11814` | `getAllRecords_(FIN_SALES_LINES_SHEET)` scan for `priorLineUids` | full-table read + object rebuild; needs two columns only (`unique_id`, `valley_sales_header_id`) |
| `:11816` | `deleteRowsByCriteria_(sheetLines,'valley_sales_header_id',existingUid)` | **second full read of the same table** (`Code.js:1507`) |
| `:11839` | Line rewrite = one block append | already batched; keep |
| `:11860` | `allocSheet.getDataRange().getValues()` | full read of the allocation table |
| `:11903, 11906, 11914` | `setValue` **per changed allocation cell**, up to 3 round trips per row, each followed by `noteMutation_` | O(A) round trips |
| `:11922-11925` | `allocSheet.deleteRow(...)` **per dropped allocation**, each shifting all rows beneath | O(D) round trips |
| `:11945-11948` | Append of new allocations = one block | keep |

Adapter target: 3 sections (header patch/insert, lines delete+insert, allocations
patch+insert+delete) → **≤3 reads + ≤3 batched writes** for the whole save, with the
allocation section keyed by the composite pair.

### 3.2 Sales Returns — `saveValleyReturn_` (`:12404-12588`)

| Table | Role | Record key | Parent FK | Identity notes |
|---|---|---|---|---|
| `valley_sales_returns` (`:12295`) | Parent | `unique_id` | `valley_sales_invoices_id` (invoice), `valley_sales_products_id` (line) | 10 headers at `:12415`. **`id` = group serial shared by parent + stock rows**, derived at `:12457-12462` from the current max — must stay a locked column-max derivation. |
| `valley_sales_returns_stock` (`:12296`) | Child | `unique_id` | `valley_sales_returns_id` | 8 headers at `:12417`. Also stores `product_unique_id` = batch uid. |

Append-only: no `patchRowByCriteria_`, no delete path. The win here is **reads**, not writes.

| Site | Today | Cost |
|---|---|---|
| `:12419-12583` | One `executeWithLock_` — preserve | — |
| `:12422` | `getAllRecords_(FIN_RETURNS_SHEET)` for the group serial | full read; replace with `maxIdOf_`-style column read of `id` |
| `:12429` | `safeRows_(dbId, FIN_SALES_LINES_SHEET)` | full read of the whole sales-lines table to resolve one invoice's lines |
| `:12439` | `getAllRecords_('valley_sales_product_stock')` | full read |
| `:12450` | `getAllRecords_(FIN_RETURNS_SHEET)` **again** | second full read of the same table in the same request |
| `:12507` | `getAllRecords_(FIN_RETURNS_STOCK_SHEET)` **inside `items.forEach`** | on a write request the memo guard (`Code.js:1135-1141`) performs `getLastRow()`+`getLastColumn()` per hit and `buildRecordsFromRaw_` rebuilds every row object — so this is **~3 API calls per item plus O(items × rows) CPU** |
| `:12541` | `getAllRecords_(FIN_SALES_INV_SHEET).some(...)` | full read to fetch one cell (`اسم العميل`) |
| `:12556, 12580` | Two block appends | already batched; keep (plus one stamp each at `:12557, 12581`) |

Adapter target: 2 insert sections → **≤2 reads + ≤2 writes**, allocation-of-returned-qty
computed from column reads (`valley_sales_products_id`, `product_unique_id`, `product_qty`).

### 3.3 Purchasing — `saveValleyPurchasingCosting_` (`:5826-6174`) + checkpoint protocol

| Table | Role | Record key | Parent FK | Identity notes |
|---|---|---|---|---|
| `valley_purchasing_costing` (`:5008`) | Parent | `Code` | — | 46 headers at `:5010`; 32 of them are not lowercase, which is why `addRecord_` grew its exact-then-lowercase lookup (`Code.js:1308-1328`). Generation columns `active_line_generation`, `last_request_id`, `operation_hash`, `operation_state`. |
| `valley_product_purchasing` (`:5009`) | Lines | `unique_id` | `code` (lowercase header) | Headers at `:5019`; carries `line_generation`. **`Code` vs `code` variance is intentional in the codebase** and both legacy helpers compare case-insensitively (`Code.js:1405, 1508`), so the engine's key matching must do the same. |

Protocol that must not be broken (all of it stays in the adapter):

- `saveValleyPurchasingHeaderCheckpoint_` / `saveValleyPurchasingLinesCheckpoint_`
  (`:5792-5793` wrappers over `purchasingCheckpointHeader_` `:5641` and
  `purchasingCheckpointLines_` `:5710`);
- `purchasingCommitAlreadyApplied_` (`:5799-5825`), `purchasingActiveLines_` (`:5417`),
  `purchasingLineRowsMatch_` (`:5426`), `purchasingStagedRows_` (`:5469`),
  `purchasingDeleteStaged_` (`:5481-5505`), `purchasingActivateGeneration_` (`:5508`),
  `purchasingCleanupInactiveGenerations_` (`:5523`), `PURCHASING_LINE_WRITE_CAP_` (`:5350`);
- **there is no outer `executeWithLock_` in this save path** (verified across `:5826-6180`).
  The engine must therefore run this module with `lock: false` so today's concurrency
  behaviour is preserved; a global lock here would serialise every purchaser and could
  deadlock against the checkpoint calls. This is a deliberate deviation from the MFG plan.

Current sites and defects:

| Site | Today | Cost |
|---|---|---|
| `:5892, 6182` | `getAllRecords_(PURCHASING_COSTING_SHEET)` | full read ×2 |
| `:5912, 5929` | `getAllRecords_(PURCHASING_LINE_SHEET)` fed into `purchasingActiveLines_` | full read ×2, each rebuilding every line object |
| `:5977` | `patchRowByCriteria_(sheet,'Code',originalCode,record)` | one full read |
| `:5984` | `addRecord_(...)` | already column-max + `appendRow`, no full read (`Code.js:1299-1344`) |
| `:6012` | `deleteRowsByCriteria_(lineSheet,'code',lineKey)` | one full read |
| `:6067-6086`, `:6118-6168` | Staged/final line appends via `getNextIdBatch_` + block `setValues` | already batched; keep |
| `:5481-5505` | `purchasingDeleteStaged_` `getDataRange()` + run-based `deleteRows` | full read; deletes already run-batched (bounded by `PURCHASING_LINE_WRITE_CAP_`) |
| `:6185-6186` | `deleteValleyPurchasingCosting_` two `deleteRowsByCriteria_` | two full reads |
| `:6241-6301` | `reconcileValleyPurchasingReceipts_`: `getAllRecords_` ×2 + `patchRowByCriteria_('ERP_Request_Receipts','request_key',...)` **per receipt row** (`:6293`) | genuine N+1 over receipts |

Adapter target: 2 sections (header patch/insert, lines insert+delete) →
**≤2 reads + ≤2 writes**, with the generation columns produced by the adapter's
`compute()` and the existing protocol untouched.

### 3.4 Site classification for the remaining 131 call sites (Stage E backlog, no code)

| Class | Meaning | Example | Action |
|---|---|---|---|
| A | Document save (multi-row header+children) | `saveValleyInvoice_`, `saveValleyReturn_`, `saveValleyPurchasingCosting_`, `saveValleyMfgOrder_` | Fast-Save engine |
| B | Single-record edit/approve/toggle | `:1852, 1974, 4844, 6397, 9525, 9593` | Engine with a 1-row section (later phase) |
| C | System/audit infrastructure | `:6293` receipts, `:3535, 3828` assessment batches | Keep legacy; only the receipt loop is in this programme |

---

## 4. Phase 2 — Layer-3 adapter design

### 4.1 Sales adapter (`saveValleyInvoice_`, flag `SALES_BATCH_WRITES_`)

Status: analysis only for now; the adapter work is a separate execution prompt.

Payload shape handed to the engine — the adapter already owns every value; the engine
receives only normalized row objects:

```js
fastSaveSections_({
  scopeId: dbId, lock: true,
  sections: [
    { sheetName: 'valley_sales_invoices', keyHeader: 'invoice_unique_id', mode: 'patch+insert',
      rows: [headerMap], keyOf: r => r.invoice_unique_id, fieldMap: null },
    { sheetName: 'valley_sales_products', keyHeader: 'unique_id',
      mode: 'insert', rows: lineMaps, keyOf: r => r.unique_id, parentHeader: 'valley_sales_header_id',
      parentKey: existingUid, deleteKeys: droppedLineUids, allowDelete: true },
    { sheetName: 'valley_sales_product_stock',
      keyHeader: ['valley_sales_products_id', 'product_unique_id'],   // composite
      mode: 'patch+insert+delete', rows: allocMaps, keyOf: r => r.line_uid + '|' + r.batch_uid,
      deleteKeys: dropKeys }
  ]})
```

Post-write re-read elimination for Sales:

- delete the `getAllRecords_` at `:11811` (replace with `keyIndex_` over two columns);
- delete the duplicate read implied by `deleteRowsByCriteria_` at `:11816` (the engine's
  `deleteRowsByKeys_` reuses the same index);
- delete the `getAllRecords_` at `:11783` (use the already-read header row);
- keep `finBustRefs_` and `vfFlush_` (`:11952-11953`) — they are adapter responsibilities,
  not engine ones.

### 4.2 Returns adapter (flag `RETURNS_BATCH_WRITES_`)

- two `insert` sections; `compute()` supplies `id` (the group serial derived by the adapter
  from a locked column max — unchanged semantics) and mints `unique_id` per row;
- FIFO restore logic stays entirely in the adapter; it now receives its inputs from column
  reads (`valley_sales_products_id`, `product_unique_id`, `product_qty`) instead of three
  full-table reads, and the per-item read at `:12507` is hoisted out of the loop once;
- `valley_sales_invoices_client` lookup (`:12541`) becomes a two-column read
  (`invoice_unique_id`, `اسم العميل`) resolved through `keyIndex_`; the non-ASCII header
  name works by name lookup, never by position.

### 4.3 Purchasing adapter (flag `PURCHASE_BATCH_WRITES_`)

- `lock: false` (see §3.3);
- header section `keyHeader: 'Code'` with `compute()` producing `active_line_generation`,
  `last_request_id`, `operation_hash`, `operation_state` exactly as the checkpoint
  protocol does today;
- lines section `keyHeader: 'unique_id'`, `parentHeader: 'code'`;
- `purchasingDeleteStaged_` and `reconcileValleyPurchasingReceipts_` are in scope only for
  their read path: the staged-row scan becomes a two-column index
  (`code`, `line_generation`), and the receipt loop at `:6293` becomes one
  `keyIndex_('request_key')` + one batched patch;
- the generation/checkpoint state machine is not modified in any way.

### 4.4 What the adapters must do with the manifest

| Legacy post-write behaviour | Replacement |
|---|---|
| `getAllRecords_` re-read to build history before/after images | the manifest's `writtenByKey`/`appendedByKey` plus the payload already in hand |
| Re-read to compute dependent totals | `compute()` runs inside the engine from the caller's context before the write |
| Re-read to decide "nothing changed" | `rows.length === 0` in the manifest; a section with no rows performs **zero** API calls |

---

## 5. Phase 3 — Rollout, budgets, idempotency

### 5.1 Rollout order (cheapest risk first)

1. `FAST_SAVE_CORE_` OFF → ship `Core_FastSave.js` + adapters + flags, all OFF.
2. **Returns** (`RETURNS_BATCH_WRITES_`) — append-only, no deletes, 2 sections.
3. **Sales** (`SALES_BATCH_WRITES_`) — composite-key patching and row deletion.
4. **Purchasing** (`PURCHASE_BATCH_WRITES_`) — checkpoint protocol, `lock:false`.
5. Manufacturing (`MFG_BATCH_WRITES_`) per its own plan, reusing the same engine.

Each step is independently revertible by flipping one flag; no data migration exists, so
rollback is zero-state.

### 5.2 Budget assertions (from the manifest, no production writes)

| Module | Sections | Allowed reads | Allowed write calls | Verified against |
|---|---|---|---|---|
| Sales | 3 | ≤3 | ≤3 | current ≥3 full reads + O(A+D) writes (`:11903-11925`) |
| Returns | 2 | ≤2 | ≤2 | current 6 full reads, one inside a loop (`:12422-12541`) |
| Purchasing | 2 | ≤2 | ≤2 | current ≥5 full reads + per-receipt patches (`:5892-6293`) |

Hard assertions the engine evaluates internally and writes into the manifest:
`readsUsed ≤ sections.length`, `writesUsed ≤ sections.length`,
`stamped === true` for every section that wrote. A violation is a thrown
`FAST_SAVE_BUDGET_ERROR`, never a silent overshoot.

Static proof of the same claim: `rg "getAllRecords_|getDataRange\(\)" Core_FastSave.js`
→ zero hits. (The column read is `getRange(...).getValues()`, not `getDataRange()`.)

### 5.3 Type and date fidelity (the one real Sheets-API trap)

`Sheets.Spreadsheets.Values.batchUpdate` is JSON-based. A JS `Date` handed to the advanced
service is serialised as an ISO string, so `RAW` would store text and `USER_ENTERED` would
re-parse it through the spreadsheet locale — both differ from `Range.setValues`, which
writes a local date serial. The codebase already fights this deliberately
(`Company_ValleyFoods_Actions.js:1561-1581`, the `SHEETS_EPOCH_UTC` serial helpers).

Engine rule therefore:

- numeric/string/boolean cells → `RAW` via `batchUpdate`;
- any `Date` instance → convert with the existing epoch-serial helper to the identical
  numeric value the legacy path stores, then send `RAW`; **never** send an ISO string;
- the date columns (`created_at`, `valley_return_date`, `manufacture_date`, …) are listed
  per module in the adapter's `fieldMap`, and the staging check compares a legacy-written
  cell against an engine-written cell for equality of the stored value and number format.

### 5.4 Error and message fidelity

The engine throws typed errors, never Arabic text:
`FAST_SAVE_MISSING_KEY` (`{sheetName, key}`), `FAST_SAVE_BUDGET_ERROR`,
`FAST_SAVE_KEY_UNSUPPORTED`, `FAST_SAVE_LOCKED_FORMULA_COLLISION`.
Each adapter maps them to the existing user-facing message, e.g. the current
`throw new Error('السجل غير موجود')` sites (`:1852, 1974, 9417, 9525`) stay
byte-identical from the user's point of view.

### 5.5 Idempotency contract

| Mechanism | Where | Engine obligation |
|---|---|---|
| `unique_id` replay dedupe | `Code.js:1191-1219`, `mfgRecoverSameRequest_`, `ERP_Request_Receipts` | never mint or rewrite a `unique_id` for a row it patches; inserts receive caller-minted ids |
| Purchasing generation protocol | `:5410-5560`, `:5792-5825` | untouched; `compute()` writes the same generation/hash values |
| MFG receipts | `save_valley_mfg_order` request-id guard | untouched (the engine adds no new keys to the row) |
| `id` allocation | `getNextIdBatch_` (`Code.js:1081`), `maxIdOf_` | engine never allocates; adapters keep passing the same values |
| Retry determinism | all modules | the same payload must produce the same manifest keys; a second run with no changes must produce zero writes |

### 5.6 Sync-mechanism proof

- Engine stamps per section via `noteSheetChange_(sheet)` (`Code.js:848-851`), which derives
  `(spreadsheetId, sheetName)` from the live Sheet object and calls
  `noteTableChange_` → the `vt_*` keys read by `readTableVersions_` (`Code.js:854-872`).
- This is why the engine is the right home for it: a per-module implementation is exactly
  how a stamp gets forgotten. Manifest field `stamped:true` makes it auditable.
- Static audit step: after each adapter lands, list every `sheetName` it writes and prove
  the corresponding `vt_<dbId>_<sheetName>` stamp is produced on the write path.
- Regression guard for the UI: with a flag ON, the client's existing poll must still show
  the refresh prompt after a save from a second browser session. Recorded as NOT RUN in
  production; executable only in staging.

### 5.7 Verification checklist per module (all static unless staging is authorised)

1. `node --check Core_FastSave.js Code.js Company_ValleyFoods_Actions.js`.
2. Equivalence proof per replaced site: same target rows, same values, same order, same
   row numbers, same formulas preserved (`patchRowsByKey_` reads `getFormulas()` once for
   the union of target rows and skips non-empty cells unless `overwriteColumns` names them
   — the explicit mirror of `Code.js:1411`).
3. Budget proof: manifest assertions pass in staging; `readsUsed/writesUsed` recorded.
4. Decoupling gate: the ripgrep check in §1.4 returns zero module identifiers.
5. Stamp proof: §5.6 static audit + staging observation.
6. Idempotency proof: replay the same payload in staging, assert a zero-write second run
   and an unchanged generation/hash for purchasing.
7. Each item recorded in the results document; runtime items remain NOT RUN in production.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `batchUpdate` writes text into date cells | §5.3 — serial conversion + `RAW`, staging cell-format comparison |
| Composite allocation key behaves differently from the legacy `(line uid, batch uid)` rule, including hand-made duplicates | `keyIndex_` documents "last match wins" and the adapter keeps the legacy duplicate-drop branch (`:11897-11901`) |
| Purchasing gains a global lock it never had | `lock:false` for that module, called out in code review |
| A batched delete changes which rows disappear (descending order, 0-based) | `deleteRowsByKeys_` sorts descending, chunks ≤100, and the equivalence proof diffs the resulting row sets in staging |
| A flag ON in one module breaks the sync prompt for others | stamps are engine-owned; manifest + static audit per module |
| `Sheets` advanced service quota/latency on very wide sheets | ranges are per contiguous run, capped 100 per request; a section that writes one row falls back to a single `setValues` |
| 131 legacy call sites drift while the engine lands | Stage E inventory is appended to the results document; no edits to class B/C sites in this programme |

---

## 7. Stage plan summary

| Stage | Deliverable | Flags |
|---|---|---|
| 0 | `Core_FastSave.js` with Layers 1-2, all flags OFF, primitive self-checks documented | all false |
| A | Sales audit + adapter (Phase 1 §3.1, Phase 2 §4.1) | `SALES_BATCH_WRITES_` false |
| B | Returns audit + adapter (§3.2, §4.2) | `RETURNS_BATCH_WRITES_` false |
| C | Purchasing audit + adapter (§3.3, §4.3) | `PURCHASE_BATCH_WRITES_` false |
| D | MFG adapter on the same engine (`MFG_BATCH_WRITES_`) | false |
| E | Backlog: class B single-record sites, TopChemical/TopLight modules | — |

Stage 0 is a prerequisite for A-D. A, B and C are independent of each other and may be
executed in any order, but the recommended order is Returns → Sales → Purchasing because
risk increases with patch/delete/composite-key complexity.

---

## 8. Explicitly out of scope

- Any change to table headers, column order, sheet names, or the nine `ERP_Perf_Log` columns.
- Any migration, backfill, recalculation or fixture creation.
- Cross-request caching of the key index (chunked CacheService, `Code.js:81-82, 1702-1750`) —
  a later phase; Layer 1 is designed so `keyIndex_` can accept a cache key without an
  interface change.
- Enabling any flag in production: that is an owner action with its own runbook.
