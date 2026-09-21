# Plan — Read & View Modularization (`Core_FastRead.js` + `Core_ViewEngine.js`)

Status: **plan only, no code written.** Produced from a read-only audit of every `.js` and
`.html` file in the project root. Implementation is gated on the owner's review of this document.

Companion documents:

- `Core_FastSave.js` — the write-side engine these modules deliberately do **not** depend on.
- `FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` — its plan, status and runbook.

---

## 1. Locked decisions (from the review round)

| # | Decision | Consequence |
|---|---|---|
| D1 | **`Core_FastRead.js` is independent.** It imports nothing from `Core_FastSave.js`. | Two implementations of the same sheet-I/O ideas exist. Mitigated by a **parity guard** (§5.7) that fails loudly when their contracts diverge. |
| D2 | **Server-only first.** No client `ViewStore`, no page-level changes. | Every gain in this plan is server-side reads, payload and cache. The client work is deferred to Phase 5 and is explicitly out of scope here. |
| D3 | **`CacheService` only. No cache/index sheet, ever.** | No new sheet, no new column, no new persisted state anywhere in the spreadsheet. One invalidation authority: the existing `noteTableChange_` stamps. |
| D4 | **All six defensive guardrails are locked in** (§3.2). | Fail-open, shadow compare, diagnostics, budget reporting, typed errors, strict invalidation-on-write are part of the deliverable, not optional extras. |
| D5 | **First module: Sales.** MFG follows immediately. | Sales has the lowest blast radius (its list endpoint already slims rows and its save path is already on the write engine). Swapping the order to MFG-first changes only the sequence in §7; nothing else in this plan depends on it. |

---

## 2. Scope and non-goals

**In scope**

- A generic, business-agnostic read engine (`Core_FastRead.js`) that replaces whole-table
  object materialization with bounded, indexed reads and a safe cross-request cache.
- A generic view/payload engine (`Core_ViewEngine.js`) that standardizes DTO projection,
  option bundling and deferred sections **on the server**.
- A flag-gated migration of Sales first, then MFG, then the remaining modules.

**Out of scope (this plan)**

- Any client-side store or page rendering change (D2).
- Any schema, header, column or sheet change (D3) — including to system tables.
- Any change to the write path. `Core_FastSave.js` and the four `*_BATCH_WRITES_` flags are
  frozen for the duration of this work.
- Any cache beyond `CacheService` (D3).

---

## 3. Guardrails

### 3.1 Hard rules

1. **Read-only during implementation of the engines themselves**: the new files contain no
   writes to any business table. The only writes they may ever perform are `CacheService`
   puts, which are not stored data.
2. **Generic-core rule**: `Core_FastRead.js` and `Core_ViewEngine.js` contain zero business
   tokens and zero user-facing strings. Static gate per identifier (must return 0):
   `valley_`, `\bmfg\b`, `manufactur`, `purchas`, `sales_`, `invoice`, `recipe`, plus an
   Arabic-character search, plus `getDataRange` (the unbounded read this whole plan exists
   to remove).
3. **Feature flags, all default `false`**:
   `FAST_READ_CORE_`, `FAST_VIEW_CORE_`, and one per module
   (`SALES_FAST_READ_`, `MFG_FAST_READ_`, `PURCHASE_FAST_READ_`, `RETURNS_FAST_READ_`).
   A module uses an engine only when both its module flag and the master flag are true.
4. **Legacy paths are never modified.** Every migrated handler keeps its legacy body intact
   and selects it whenever a flag is off. Rollback is a flag flip — there is no data
   migration to undo.
5. **No production writes during development or verification.** Measurements come from the
   existing `ERP_Perf_Log` history and from read-only diagnostics, never from executing a
   business save.

### 3.2 The six defensive guardrails (locked)

| # | Guardrail | How it is implemented |
|---|---|---|
| G1 | **Fail-open** | Every engine entry point is wrapped so that any engine error is caught, logged with a typed code, and the **legacy path is executed in the same request**. A user can never see a failure the old code would not have produced. The engine never throws user-facing text. |
| G2 | **Shadow compare** | `frShadowCompare_({label, legacy, modern})` runs both readers for the same request, deep-diffs the results, logs differences (field, key, left value, right value, count) through `Logger`, and **returns the legacy result** so behaviour is unchanged while the evidence is collected. Enabled only by an explicit admin action or a diagnostic flag — it doubles reads, so it never runs on a normal user's request path. |
| G3 | **Diagnostics** | `frDiagnostics_()` (read-only, exposed by the module as an admin action): cache hits/misses/evictions observed, entries refused as "unknown", entries refused as too large, chunk counts per key, stamp ages, per-primitive read counts, last error code. Nothing in it writes. |
| G4 | **Budget reporting** | Every primitive returns `reads` (bounded sheet reads used) and the list/document readers return `reads`/`sections`. Handlers log the number through `Logger` so a regression is a measurement, not an impression. No new column is added to any table; reporting goes to Stackdriver. |
| G5 | **Typed errors** | `FR_*` codes only (`FR_KEY_UNSUPPORTED`, `FR_CACHE_TOO_LARGE`, `FR_STAMP_UNKNOWN`, `FR_BUDGET_EXCEEDED`, `FR_SHAPE_ERROR`). The owning module maps them to the exact Arabic message its page already shows. In production these are non-fatal by G1; in a staging/diagnostic mode they surface as errors. |
| G6 | **Strict invalidation on write** | The engine refuses to serve any cached payload in an execution that has already written anything — observed through the existing `_recordCacheDisabled_` flag that `noteMutation_` sets (`Code.js:619-620`). Additionally the engine never trusts cache across requests: every cached entry carries the `noteTableChange_` stamp signature it was built from, and a mismatch — **or a missing stamp** — is a miss (§5.5). |

---

## 4. Phase 1 — Anti-pattern audit (measured)

### 4.1 The dominant read mechanism is whole-table object materialization

| Pattern | VF | TopChemical | TopLight | Code.js | Total |
|---|---|---|---|---|---|
| `getAllRecords_` call sites | **248** | 103 | 91 | 33 | **475** |
| `getDataRange()` call sites | 24 | 9 | 12 | 29 | **74** |
| `getReadOnlyRecords_` | 5 | 0 | 0 | 1 | 6 |
| `getRecordsByPk_` / `indexById` | 2 | 10 | 2 | 3 | **17** |
| `CacheService.getScriptCache()` | 15 | 21 | 3 | 30 | 69 |

`getAllRecords_` (`Code.js:1113`) reads the whole sheet and builds one object per row via
`buildRecordsFromRaw_` (`Code.js:650`). The O(1) index infrastructure exists
(`indexById` `Code.js:1818`, `getRecordsByPk_` `Code.js:1842`) and is used **17 times**
against **475** whole-table reads.

### 4.2 The per-request memo does not survive the page

`_recordCache_` (`Code.js:483`) is scoped to **one Apps Script execution**. Pages make many
executions per load:

| Page | distinct RPC actions | total calls |
|---|---|---|
| `Company_ValleyFoods_Attendance.html` | 13 | 15 |
| `Company_ValleyFoods_MfgOrders.html` | 12 | 15 |
| `Company_ValleyFoods_MfgOrderView.html` | 8 | 10 |
| `Company_TopChemical_ManufactureOrders.html` | 8 | 8 |
| `Company_ValleyFoods_Sales.html` | 7 | 9 |
| `Company_TopChemical_BoxAnalysis.html` | 6 | 6 |
| `Company_ValleyFoods_Parties.html` | 5 | 5 |
| `Company_TopChemical_BudgetInputs.html` | 5 | 6 |

Within one execution the memo is also not free: on a write request each hit runs two
metadata calls and rebuilds every record object (`Code.js:1135`, `1139`), so a read inside a
loop is O(iterations × rows). The memo is permanently disabled for the rest of the request
by the first mutation (`Code.js:619-620`).

### 4.3 Top read handlers by full-table reads

Attribution of every `getDataRange()`, `getAllRecords_` and `getReadOnlyRecords_` to its
enclosing function:

| Handler | full reads | Shape |
|---|---|---|
| `getValleyInvoiceForReturn_` (VF) | 6 | options bundle for one invoice |
| `serveBudgetPrint_` (TC, `:12295`) | 6 | server-rendered print |
| `customerRawMovements_` (TL) | 6 | statement build |
| `getValleyMfgRequestDiagnosis_` (VF) | 5 | admin diagnosis |
| `getValleySalesReport_` (VF) | 5 | report |
| `mfgCurrentMfgState_` (VF) | 5 | state hash for the edit token |
| `getBudgetRefs_` (TC) | 5 | reference bundle |
| `getProductMovement_` (TL) | 5 | movement |
| `getValleyProducts_`, `getSalesCosting*_`, `getSalesReturns_`, `getSalesAnalysis_`, `adminListMatrix_` | 3-4 | lists and reports |

### 4.4 Payload shape: full rows ship, slimming is ad-hoc

- `getValleyMfgOrderFull_` returns the header plus every output row with **every column**;
  the detail endpoint adds work-ops and by-products.
- Slimming exists only where it was hand-rolled: `getValleySalesList_` ("Slim +
  newest-first"), `vfPage_` (`:9099`), `vfBoundRows_` (`:9077`), and ~15 `slice(0, limit)`
  sites.
- Option bundles (products, parties, work centres, recipes) are rebuilt and resent by
  several endpoints (`:6935-6941`, `:7362-7383`).
- `jsonSafe_` (`Code.js:6528`) walks the whole response graph at the router, so response
  cost scales with payload size.

### 4.5 Integrity risks, ordered by consequence

| Risk | Evidence | Consequence |
|---|---|---|
| `vfFindRowByUid_` index in one `CacheService` key, 60 s TTL, unchunked (`:9126-9165`) | CacheService limit is 100 KB/key | Past a few thousand orders the index silently fails: every call full-scans and re-stringifies |
| Memo invalidated by the first write and never re-armed | `Code.js:619-620` | Correct but expensive: each post-write read is a full table read |
| Stamps are best-effort and evictable | `Code.js:832-872`, `TABLE_VERSION_TTL_` 6 h | A lost stamp means a missed refresh prompt, never a stale render — the engine must therefore treat *absence* as "unknown" |
| `getReadOnlyRecords_` silently degrades above 50 000 rows / 2 MB | `Code.js:491-492`, `1159-1190` | The same call can take two different code paths depending on table size |
| `vfCurrentProducts_` deliberately bypasses the memo | `Company_ValleyFoods_Actions.js:11384` | Correct by design; it must be preserved, not "optimized" |
| The refresh prompt is the only cross-user coherence mechanism | `UI_Components.html:6922` | Any new cache must be invalidated by the same stamps, or it becomes a stale-data source |

---

## 5. Phase 2 — `Core_FastRead.js` (data withdrawal engine)

Independent file (D1). Global functions, `fr*` prefix, no business tokens, no Arabic.

### 5.1 Layer 1 — primitives

| Primitive | Contract | Sheet calls |
|---|---|---|
| `frReadColumn_(sheet, header)` | one column's values, flat, no object build | 1 bounded read |
| `frKeyIndex_(sheet, keyHeader, keys, all)` | `key → rowNumber` (first match) or `key → [rows]` (`all`); trim-normalised, blank keys skipped | 1 bounded read of the key column(s) |
| `frReadRowsByParent_(sheet, parentHeader, parentValue, columns)` | the child rows of one parent, values keyed by the sheet's own header spelling, each carrying `__row` | 1 bounded block read (per-column fallback above the block cap) |
| `frReadBlockRows_(sheet, columns)` | a named column set for the whole table, for set-membership scans | 1 bounded block read |
| `frTailRows_(sheet, count, columns)` | **new** — the newest `count` rows by the `id` column; the list-page workhorse | 2 bounded reads (id column, then the window) |
| `frAggregate_(sheet, header, op)` | `max` / `min` / `count` from one column, no objects | 1 bounded read |
| `frRowCount_(sheet)` | metadata only | 0 reads |
| `frStampSig_(scopeId, sheetNames)` | the current `noteTableChange_` stamps for a payload's tables, as one signature string; missing stamps are reported as unknown | 0 sheet reads, 1 `CacheService.getAll` |
| `frCacheGet_/frCachePut_/frCacheDrop_(key, value, ttl)` | chunked cache wrapper with a manifest, size-guarded, fail-silent on any cache error | 0 sheet reads |
| `frDiagnostics_()` | counters, stamp ages, refusals, last error | 0 sheet reads |

Every primitive returns `reads`, and every one of them fails open (G1): a thrown error is
converted to a typed `FR_*` error only in diagnostic mode; in production the caller catches,
logs and falls back to legacy.

### 5.2 Layer 2 — generic document fetcher

```js
fastFetchDocument_({
  scopeId,
  parent:   { sheetName, keyHeader, keyValue, columns },
  children: [ { alias, sheetName, parentHeader, parentKey, columns, orderBy } ],
  cache:    { enabled: true, ttl: 600 }
}) -> { parent, children: { alias: rows }, versionSignature, cache: 'hit'|'miss'|'refused', reads }
```

- **Minimum calls**: one bounded read per section. A header + lines + footer document costs
  **3 reads**, regardless of table size and regardless of how many child rows match.
- Ordering is applied in memory only over the rows already fetched.
- `cache: 'refused'` is a first-class outcome: it means the engine declined to cache (write
  in this execution, unknown stamp, or size over budget) and the caller got fresh data.

### 5.3 Layer 2 — generic list reader

```js
fastFetchList_({
  scopeId, sheetName, columns,
  orderBy: 'id', direction: 'desc',
  page: { limit, offset }, filters: [{ header, op, value }]
}) -> { rows, total, reads, cache }
```

- Newest-first pages use `frTailRows_`: a 100-row page of a 50 000-row table reads ~100
  rows, not 50 000.
- `total` uses `frAggregate_` unless the caller declares it unnecessary.
- Filters are applied in memory **only** to the window that was read when they are
  compatible with the ordering column; otherwise the engine reports `reads` honestly and the
  module decides (this is deliberate: a filter that cannot be satisfied from a tail window
  must not silently return a partial answer).

### 5.4 Cache layout

| Item | Value | Source |
|---|---|---|
| Key format | `fr1_<scopeId>_<kind>_<docKey>_<payloadVersion>_<hash(stampSig)>` | — |
| Chunk size | 90 000 bytes | `Code.js:82` |
| Max chunks | 50 (= 4.5 MB per entry) | `Code.js:81` |
| Default TTL | 600 s, capped by the shortest stamp TTL in the payload | `FIN_REF_TTL_G` `Actions:27` |
| Storage | `putChunkedCache_` / `getChunkedCache_` / `removeChunkedCache_` | `Code.js:1702`, `1736`, `1748` |
| Size guard | a value that would exceed the chunk budget is **not written**; the engine returns `cache: 'refused'` and reports `FR_CACHE_TOO_LARGE` | G5 |

Sizing check at the declared volumes (5 000-50 000 rows/table): a 16-character `unique_id`
index for 50 000 rows is ≈ 850 KB → ~10 chunks, well inside the 50-chunk budget. No cache
sheet is required (D3).

### 5.5 Data-integrity protocol

1. `stampSig = frStampSig_(scopeId, tables)` — one cache call, zero sheet reads.
2. Cache key includes `stampSig`. Any component differs → **miss**.
3. **A missing or evicted stamp is "unknown" → refetch.** Absence is never freshness.
4. If `_recordCacheDisabled_` is true (this execution has written something), the engine
   serves **no** cached payload — that is exactly the dirty-read window.
5. Cached payloads carry the row numbers they were built from, so `Core_FastSave`'s manifest
   can patch them in place instead of forcing a refetch.
6. Invalidation has exactly **one** authority: the `noteTableChange_` stamp that
   `noteMutation_` already writes on every business write, and that drives the client's
   refresh prompt (`UI_Components.html:6922`). The engine adds no second authority.
7. Any cache-layer exception is swallowed and reported as a miss (fail-open, G1).

### 5.6 Diagnostics surface (G3)

`frDiagnostics_()` returns, with no sheet writes:

- cache: hits, misses, refused-too-large, refused-unknown-stamp, refusals-because-of-write;
- per key: chunk count, byte size, age, `stampSig` age;
- primitives: calls, reads used, worst read count;
- shadow compare: comparisons run, diffs found, last diff summary;
- last error code and message text.

### 5.7 Parity guard (the cost of D1)

Because `Core_FastRead.js` does not share code with `Core_FastSave.js`, a static check
compares their duplicated contracts and **fails loudly** when they diverge:

- primitive pairs and their normalisation rules: `fsKeyIndex_` vs `frKeyIndex_`
  (trim, blank-key skip, first-match vs all-matches);
- date/serial conversion rules used when values round-trip;
- block-cap constants (`FS_MAX_BLOCK_CELLS_` vs the read engine's equivalents);
- the bound-read rule: neither file may contain `getDataRange`, `appendRow(` or
  `deleteRow(`.

The guard is a script/grep pair documented in the results document; it is a review gate, not
a runtime cost.

---

## 6. Phase 3 — `Core_ViewEngine.js` (server-side view engine)

Server-only by decision D2. Global functions, `vw*` prefix, no business tokens.

### 6.1 DTO projection

```js
viewProject_(rows, spec)
// spec = { columns: [...], rename: {header: wireName}, dropEmpty: true,
//          redact: [{ columns: [...], when: <boolean supplied by the module> }] }
```

- The **spec is data supplied by the module**, so the core stays generic while each page
  gets exactly the fields it renders. This is the direct answer to §4.4: `getValleyMfgOrderFull_`
  stops shipping every column of every output.
- Cost-gating stays in the module: the module computes the boolean and passes it in
  `redact[].when`. No grant logic enters the core.
- Measurement is built in: the projection reports `bytesIn`/`bytesOut`, logged through
  `Logger` (G4). No table column is touched.

### 6.2 Option bundles

```js
viewOptions_(scopeId, kind, builder, ttl)
```

- Version-stamped, chunk-cached option lists (products, parties, work centres, recipes) so
  the eight pages that rebuild the same arrays stop doing it and stop resending them.
- Extension of the existing pattern, not a new one: `prefetch_refs`
  (`Actions:270`, `13300`) and `vfRefsCached_` (`Actions:44`) already prove the approach.

### 6.3 Deferred sections

```js
viewSplit_(rows, spec)
// spec = { primary: [...], deferred: { alias: { columns: [...], trigger } } }
```

- First paint carries only the primary columns; heavy fields (notes, attachment references,
  cost detail) are fetched by key on demand.
- The engine returns the deferred alias list so the module can expose a
  `fetch_deferred` action; the core never names a section.

### 6.4 Server-side sync contract (what replaces client state work, without client work)

- The save manifest (`Core_FastSave.js:686-744`) already reports `writtenByKey`, `appended`,
  `deletedKeys` and `stamped`. The view engine standardises the **response envelope** for
  read endpoints so that every response carries `stampSig` for the tables it covers.
- Two reads of the same document with the same `stampSig` are guaranteed identical by §5.5 —
  that is the contract a future client store will rely on, and it costs nothing to include
  now.
- Conflict detection is designed but **not built in this phase**: a generalized
  `viewStateToken_` (the `mfgEditToken_` idea) is recorded as the Phase 5 prerequisite.

### 6.5 Explicitly deferred (Phase 5, needs a separate approval)

- `ViewStore` on the client: `applyManifest`, `applyPatch`, `needsRefresh`,
  local row patching after save, and retiring the post-save `load(true)` round trip.
- Deferred-section fetch UI, and page-by-page adoption.

---

## 7. Phase 4 — Adoption & migration

### 7.1 Flags

| Flag | Default | Meaning |
|---|---|---|
| `FAST_READ_CORE_` | false | master switch for `Core_FastRead.js` |
| `FAST_VIEW_CORE_` | false | master switch for `Core_ViewEngine.js` |
| `SALES_FAST_READ_` | false | first module (D5) |
| `MFG_FAST_READ_` | false | second module |
| `PURCHASE_FAST_READ_`, `RETURNS_FAST_READ_` | false | follow-ups |

A module uses an engine only when its own flag **and** the relevant master switch are true
(same discipline as the write-side flags). All are `false` as shipped: deploying the new
files changes nothing.

### 7.2 Steps (Sales first)

| Step | Change | Flag | Verification |
|---|---|---|---|
| 1 | Ship `Core_FastRead.js` + `Core_ViewEngine.js`, no callers | all false | static gates (§3.1), parity guard (§5.7) |
| 2 | Sales **list** (`getValleySalesList_`): `fastFetchList_` + `viewProject_` + `viewOptions_` | `SALES_FAST_READ_` | shadow compare on one request; measured `reads` and `bytesOut` |
| 3 | Sales **invoice for return** (`getValleyInvoiceForReturn_`, 6 full reads): `fastFetchDocument_` + option bundle | `SALES_FAST_READ_` | shadow compare; field-by-field diff must be empty |
| 4 | Sales **detail**: `fastFetchDocument_` (header + lines + allocations) | `SALES_FAST_READ_` | second open of an unchanged invoice must report `cache:'hit'` and 0 sheet reads |
| 5 | MFG **list** (`getValleyMfgOrders_`): `fastFetchList_` + projection | `MFG_FAST_READ_` | as above |
| 6 | MFG **view** (`getValleyMfgOrderDetail_`): one `fastFetchDocument_` per section, replacing the ~9 whole-table reads | `MFG_FAST_READ_` | shadow compare; `mfgCurrentMfgState_` must produce the identical edit token |
| 7 | Remaining modules, one at a time | per-module | as above |
| 8 | Phase 5 (client store) — **separate approval** | — | — |

Every step keeps its legacy body intact; a flag flipped back restores it instantly.

### 7.3 Measurement plan

- Baseline first: read existing `ERP_Perf_Log` history for the target actions
  (`elapsed_ms`, `sheet_reads`) — read-only, no production writes.
- Per step: the handler logs `reads` and `bytesOut` (§5.1, §6.1). `PERF_LOG_READS=1` may be
  enabled by the owner for a bounded window (a script property; it is a production change and
  therefore an owner action).
- Shadow compare provides correctness evidence; the perf log provides the speed evidence.

### 7.4 Acceptance — Definition of Done

| Check | Target |
|---|---|
| List endpoint (`getValleySalesList_`, then `getValleyMfgOrders_`) | ≤ 2 bounded reads; rows read ≈ page size, not table size |
| Detail endpoint (Sales, then MFG) | ≤ 1 bounded read per section; unchanged re-open = 0 sheet reads (`cache:'hit'`) |
| Payload | ≥ 40 % byte reduction on migrated endpoints (`bytesOut` measured) |
| Shadow compare | zero diffs on the sampled window before a flag is left on |
| Static | `node --check` clean; decoupling gate 0 hits; parity guard passes |
| Integrity | no cached payload served in a writing execution; missing stamp ⇒ refetch (verified by inspection + diagnostics counters) |
| Rollback | flag false restores legacy behaviour with no data action |

### 7.5 Verification constraints

- No unit tests, no fixtures, no VM/mocked execution (project rule).
- Verification is source inspection, call-path tracing, `node --check`, the static gates, and
  — only with explicit owner authorisation and on a staging copy — live execution.
- Runtime acceptance in production is recorded as **NOT RUN** until the owner runs it.

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Two duplicated primitive implementations drift (D1) | Parity guard (§5.7) as a review gate |
| Cache serves stale data | Stamp-in-key + unknown-stamp-is-a-miss + no-cache-after-write (G6, §5.5) |
| Cache eviction causes repeated refetching | Refetch is the safe direction; diagnostics counts evictions observed (G3) |
| Cache entry exceeds the chunk budget | Refused, not truncated: the engine returns `cache:'refused'` and reads directly (G5) |
| An engine bug breaks a live page | Fail-open to legacy in the same request (G1) + per-module flag |
| A tail-window list read misses matching older rows when a filter is incompatible with the ordering column | The list reader refuses silently-partial answers and reports its read shape; the module falls back to legacy |
| Payload projection hides a field a page needs | Shadow compare diffs the projected response against the legacy response before a flag is left on (G2) |
| Scope creep into the write path | Write path frozen for this plan; any change needs its own plan |

---

## 9. Open items

1. **Sampling policy for shadow compare** (G2): manual admin trigger only, or 1-in-N read
   requests in a bounded window? Default proposed: manual trigger only, plus 1-in-50 for the
   specific migrated endpoint during its measurement window.
2. **`frReadTail_` window size** default for list pages (proposed: the page limit plus 20 %).
3. Phase 5 (`ViewStore`) is a prerequisite decision for the "no reload after save" work; it
   is deliberately not part of this plan's acceptance.
