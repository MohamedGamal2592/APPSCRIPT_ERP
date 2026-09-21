# Plan — Read & View Modularization (`Core_FastRead.js` + `Core_ViewEngine.js`)

**Revision 2** — revised after review. Rev 1 was rejected; every blocking finding is closed
below and the revised position is stated where the original claim was wrong.

Status: **plan only, no code written.** Implementation is gated on owner approval of this revision.

Related documents: `Core_FastSave.js` (the write-side engine this work does **not** depend on)
and `FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` (its plan, status, runbook).

---

## 0. What changed from Rev 1 (review closure)

| # | Rev 1 claim / design | Verdict | Rev 2 position |
|---|---|---|---|
| 1 | `frTailRows_` makes a 100-row page read "~100 rows" | **Wrong.** The id column is read in full first, so ~50 100 rows | Explicit query strategies with honest metrics: `serviceCalls`, `rowsScanned`, `colsRead`, `cellsRead` (§5.2) |
| 2 | Cache entries up to 50 chunks / 4.5 MB | **Wrong.** Ignores CacheService's item cap; every mutation mints a new logical entry | Stable logical key, stamp inside the manifest, ≤5 chunks, refuse multi-megabyte payloads, no table-sized indexes (§5.4) |
| 3 | "Two reads sharing a `stampSig` are guaranteed identical" | **False.** Stamps are best-effort (the code says so at `Code.js:822-830`); raw writes, manual edits, imports and races are invisible | "Validated best-effort snapshot", with pre/post stamp comparison and refusal to publish (§5.5) |
| 4 | Cached rows may be patched from the save manifest | **Contradictory** with the frozen write path, stamp-only invalidation and independent engines | Removed. A write stamps; the next read misses and rebuilds (§5.4, §5.5) |
| 5 | `frDiagnostics_()` reports keys, evictions, ages, hit rates | **Not implementable.** CacheService has get/put/remove only | Per-response metrics + structured logging + a function that inspects one supplied key; "miss", never "eviction observed" (§5.6, §3.2 G3) |
| 6 | Fail-open means users never see a failure | **Overstated.** A timeout can kill the fallback too | "Falls back when sufficient execution time remains", with internal budgets and early abort (§3.2 G1) |
| 7 | Shadow compare produces a zero diff against the legacy response | **Broken for projected payloads** | Both paths are compared after applying the same canonical DTO contract (§6.1, §7.4) |
| 8 | 1-in-50 shadow sampling on user requests | **Contradicts G2** | Admin/staging only, no production sampling (§3.2 G2, §9) |
| 9 | Shadow logs left/right values | **Privacy leak** (payroll, financial, customer data) | Log field names, hashes, types and bounded summaries only (§3.2 G2, G7) |
| 10 | `viewOptions_` reduces what is *transmitted* | **False without client work** | It reduces rebuilding only; transmission reduction belongs to the client phase (§6.2) |
| 11 | Deferred sections in Phase 3 | Needs client triggers and rendering | Removed from Phase 3; client phase only (§6.5) |
| 12 | Cache may hold DTOs | ScriptCache is shared across users | Only authorization-neutral raw data; project/redact after authorization on every request (§3.2 G8) |
| 13 | Sales baseline = "zero diff" on `getValleyInvoiceForReturn_` | **Baseline is broken**: `uid: uid` is an unresolved reference at `Company_ValleyFoods_Actions.js:12591`, swallowed by `catch (e) {}` | Recorded as a production anomaly; decision required before that endpoint is used as a baseline (§4.6) |
| 14 | "No unit tests" limits verification to static inspection | Too weak for chunk publication, stamp races, filtering and type fidelity — and the repo already has executable VM harnesses | VM-based executable verification is **in scope**; those harnesses never write production data (§7.5) |

Unchanged and retained: generic business-agnostic cores, all flags default `false`, typed
errors mapped by the module, unknown-stamp-as-miss, and Sales-first rollout.

---

## 1. Locked decisions

| # | Decision |
|---|---|
| D1 | `Core_FastRead.js` is independent of `Core_FastSave.js`; a parity guard (§5.7) prevents contract drift |
| D2 | Server-only first. No client store, no page changes, in this plan |
| D3 | `CacheService` only. No cache/index sheet, no new column, no new persisted state outside cache |
| D4 | All defensive guardrails in §3.2 are part of the deliverable |
| D5 | First module: Sales; MFG follows |
| D6 | Executable VM-based verification is permitted (it writes no production data); static inspection alone is insufficient |
| D7 | The cache holds **small, authorization-neutral payloads only** — reference bundles and single documents. No table-sized indexes, no DTOs (§5.4, §3.2 G8) |
| D8 | List reads declare a query strategy and report honest metrics; a query that cannot be satisfied by its strategy is refused, never answered partially (§5.2) |
| D9 | No write-through cache patching, ever (§5.5) |

---

## 2. Scope and non-goals

**In scope**: `Core_FastRead.js` (indexed/bounded reads, explicit list strategies, small-payload
cache with pre/post stamp validation), `Core_ViewEngine.js` (canonical DTO contracts, projection
after authorization, option rebuilding), and the flag-gated migration of Sales, then MFG.

**Out of scope**: any client-side work (store, deferred sections, option transmission
reduction); any schema/header/sheet change; any change to the write path
(`Core_FastSave.js` and the four `*_BATCH_WRITES_` flags are frozen); any cache beyond
`CacheService`.

---

## 3. Guardrails

### 3.1 Hard rules

1. The engines never write to a business table. Their only writes are cache entries, which are
   not stored data.
2. Generic-core rule: zero business tokens and zero user-facing strings in either file.
   Static gate per identifier must return 0: `valley_`, `\bmfg\b`, `manufactur`, `purchas`,
   `sales_`, `invoice`, `recipe`; plus an Arabic-character search; plus `getDataRange`.
3. Flags, all default `false`: `FAST_READ_CORE_`, `FAST_VIEW_CORE_`, and one per module
   (`SALES_FAST_READ_`, `MFG_FAST_READ_`, `PURCHASE_FAST_READ_`, `RETURNS_FAST_READ_`).
4. Legacy paths are never modified; a flag off selects legacy. Rollback is a flag flip.
5. No production writes during development or verification; measurements come from existing
   `ERP_Perf_Log` history and read-only diagnostics.

### 3.2 Guardrails

| # | Guardrail | Revised implementation |
|---|---|---|
| G1 | **Bounded fail-open** | Ordinary engine exceptions fall back to legacy **when sufficient execution time remains**. The engine takes a deadline at entry (execution start + configurable budget, default 120 s), checks it before each service call, and aborts the modern path with `FR_BUDGET_EXCEEDED` rather than risking the 6-minute limit. A hard timeout is acknowledged as a failure mode the fallback cannot always cover. |
| G2 | **Shadow compare — admin/staging only** | `frShadowCompare_({label, legacy, modern, canonicalize})` runs both readers, applies the **same canonical DTO contract** to both results, diffs them, and returns the legacy result. Never sampled on user requests. Logs field names, types, hashes and counts — **never raw values** (G7). |
| G3 | **Diagnostics — implementable surface** | (a) every response carries per-request metrics; (b) structured `Logger` lines for historical aggregation; (c) `frDiagnostics_(logicalKey)` inspects one explicitly supplied key (chunk count, bytes, manifest age, stampSig present/absent, generation). No key enumeration, no eviction statistics, and "miss" is reported instead of "eviction observed" — CacheService cannot distinguish them. |
| G4 | **Honest budget reporting** | Primitives return `serviceCalls`, `rowsScanned`, `colsRead`, `cellsRead`, `bytesRead`, and `cacheOutcome`. "Read count" alone is not an acceptable budget unit (§5.1). |
| G5 | **Typed errors** | `FR_*` codes only; the module maps them to its existing Arabic messages. In production they are non-fatal by G1; in staging/diagnostic mode they surface. |
| G6 | **Invalidation** | Stamp-in-manifest, not stamp-in-key; unknown or changed stamp ⇒ miss; no cache read in an execution that has written (`_recordCacheDisabled_`, `Code.js:619-620`); publication requires pre/post stamp equality (§5.5). |
| G7 | **Privacy** | No raw values in logs, diagnostics or shadow-compare output. Hashes, field names, types, counts and bounded summaries only. |
| G8 | **Authorization boundary** | The cache stores raw, authorization-neutral data only. Projection, redaction and cost-gating run **after** authorization on every request. If a DTO is ever cached, its key must include a stable audience/permission fingerprint — not planned in this revision. |

---

## 4. Phase 1 — Anti-pattern audit (measured)

### 4.1 Whole-table object materialization is the dominant read mechanism

| Pattern | VF | TopChemical | TopLight | Code.js | Total |
|---|---|---|---|---|---|
| `getAllRecords_` call sites | **248** | 103 | 91 | 33 | **475** |
| `getDataRange()` call sites | 24 | 9 | 12 | 29 | **74** |
| `getReadOnlyRecords_` | 5 | 0 | 0 | 1 | 6 |
| `getRecordsByPk_` / `indexById` | 2 | 10 | 2 | 3 | **17** |
| `CacheService.getScriptCache()` | 15 | 21 | 3 | 30 | 69 |

`getAllRecords_` (`Code.js:1113`) reads the whole sheet and builds one object per row
(`buildRecordsFromRaw_`, `Code.js:650`). The O(1) index infrastructure
(`Code.js:1818`, `1842`) is used 17 times against 475 whole-table reads.

**But the dominant cost is not object materialization — it is service calls.** The
materialization is the visible symptom; each full read is also one Apps Script service call
with fixed latency, and paid again per execution. This revision therefore budgets
`serviceCalls` first and `cellsRead` second.

### 4.2 The per-request memo does not survive the page

`_recordCache_` (`Code.js:483`) is scoped to one execution. Pages make many executions:

| Page | distinct RPC actions | total calls |
|---|---|---|
| `Company_ValleyFoods_Attendance.html` | 13 | 15 |
| `Company_ValleyFoods_MfgOrders.html` | 12 | 15 |
| `Company_ValleyFoods_MfgOrderView.html` | 8 | 10 |
| `Company_TopChemical_ManufactureOrders.html` | 8 | 8 |
| `Company_ValleyFoods_Sales.html` | 7 | 9 |

Within an execution the memo is not free either: on a write request each hit runs two
metadata calls and rebuilds every record object (`Code.js:1135`, `1139`), so a read inside a
loop is O(iterations × rows). The first mutation disables the memo for the rest of the
request (`Code.js:619-620`).

### 4.3 Top read handlers by full-table reads

| Handler | full reads |
|---|---|
| `getValleyInvoiceForReturn_` (VF) | 6 |
| `serveBudgetPrint_` (TC, `:12295`) | 6 |
| `customerRawMovements_` (TL) | 6 |
| `getValleyMfgRequestDiagnosis_` (VF) | 5 |
| `getValleySalesReport_` (VF) | 5 |
| `mfgCurrentMfgState_` (VF) | 5 |
| `getBudgetRefs_` (TC) | 5 |
| `getProductMovement_` (TL) | 5 |
| `getValleyProducts_`, `getSalesCosting*_`, `getSalesReturns_`, `getSalesAnalysis_`, `adminListMatrix_` | 3-4 |

### 4.4 Queries that genuinely need the whole candidate set

This is the correction that invalidates Rev 1's list design. The following require examining
every candidate row, and no index can avoid it without a new column or a sort index:

- **Distinct filter-option values.** The MFG list computes its dropdowns from the
  **unfiltered** set by design (`Company_ValleyFoods_Actions.js:7357-7375` region), and
  `distinctLabels_` walks every row.
- **Totals** over a filtered set.
- **Arbitrary offsets** (`slice(offset, offset+limit)` after filtering).
- **Filters on non-sort columns** when the page is ordered by another column.

The plan's answer is not to pretend these are cheap, but to make them **explicit, declared
and measured** (§5.2).

### 4.5 Payload shape

- `getValleyMfgOrderFull_` returns the header plus every output row with every column; the
  detail endpoint adds work-ops and by-products.
- Slimming is hand-rolled where it exists: `getValleySalesList_`, `vfPage_` (`:9099`),
  `vfBoundRows_` (`:9077`), ~15 `slice(0, limit)` sites.
- Option bundles are rebuilt and resent by several endpoints (`:6935-6941`, `:7362-7383`).
- `jsonSafe_` (`Code.js:6528`) walks the whole response, so response cost scales with payload.

### 4.6 Production anomalies found during this audit

| Anomaly | Evidence | Consequence |
|---|---|---|
| `uid: uid` where `uid` is unresolved inside `getValleyInvoiceForReturn_` | `Company_ValleyFoods_Actions.js:12591`, inside `try { … } catch (e) {}` | The reference is not declared anywhere in the function body, so the assignment throws, the catch swallows it, and `invInfo` stays `null`. This endpoint cannot be used as a "zero diff" baseline until it is fixed or its current behaviour is frozen as the baseline. Decision required (§9). |
| `vfFindRowByUid_` index in one un-chunked CacheService key, 60 s TTL | `Company_ValleyFoods_Actions.js:9126-9165` | Past a few thousand orders the index cannot be stored and every call full-scans |
| Stamps are explicitly best-effort | `Code.js:822-830` ("evicted before their TTL", "a stamp says a table changed, not what changed") | Any consistency claim must be weaker than Rev 1's |
| `getReadOnlyRecords_` silently degrades above 50 000 rows / 2 MB | `Code.js:491-492`, `1159-1190` | The same call takes two different paths depending on table size |
| `vfCurrentProducts_` deliberately bypasses the memo | `Company_ValleyFoods_Actions.js:11384` | Correct by design; must be preserved |

---

## 5. Phase 2 — `Core_FastRead.js`

Independent file (D1), `fr*` prefix, no business tokens, no Arabic, never `getDataRange`.

### 5.1 Metrics contract (applies to every primitive)

```
{ serviceCalls, rowsScanned, colsRead, cellsRead, bytesRead, partial, cacheOutcome }
```

- `serviceCalls` — Apps Script/Sheets calls made. **Primary budget unit.**
- `rowsScanned` — rows examined by a predicate or index build.
- `colsRead` / `cellsRead` — column count and cell count read.
- `partial` — true if the returned set is knowingly incomplete (never allowed to reach a
  caller that has not declared it wants a partial answer).
- `cacheOutcome` — `hit` | `miss` | `refused-size` | `refused-unknown-stamp` |
  `refused-after-write` | `disabled`.

### 5.2 List contract — explicit strategies (closes finding 1)

`fastFetchList_` requires the caller to declare a strategy. There is no "generic fast list".

| Strategy | Mechanism | Applies when | Honest cost |
|---|---|---|---|
| `APPEND_WINDOW` | read the last `limit` rows by **row position** (`getLastRow()`), never reading the id column | table is proven append-ordered, no filters, no offset beyond the end, page 1 only | `serviceCalls` 1-2; `rowsScanned` ≈ limit. **This is the only strategy where a page reads a page.** |
| `NARROW_SCAN_PAGE` | one narrow read of the sort/filter columns → compute matching row numbers → one read of the page's rows in those positions | filtered lists, arbitrary offsets, totals | `serviceCalls` 2-3; `rowsScanned` = table rows; `cellsRead` ≈ rows × narrowCols + limit × pageCols |
| `KEYSET` | cursor is the last `id`; locate it with a binary search over the id column (bounded single-cell reads), then read forward | large offsets, newest-first, monotonic id | `serviceCalls` ≈ 2·log₂(rows) + 1; `cellsRead` small; **preferred over offset paging for deep pages** |
| `FULL_SCAN` | declared fallback: read everything, filter in memory | unsupported queries, option/dropdown generation, totals over rare filters | `serviceCalls` ≥ 1; `rowsScanned` = all rows; declared, measured, never silent |

Rules:

1. A query that cannot be satisfied by its declared strategy is **refused** with
   `FR_STRATEGY_UNSUPPORTED`; partial answers are never returned silently (D8).
2. `offset` paging is accepted only with `NARROW_SCAN_PAGE`, and deep offsets are warned
   about in the metrics; `KEYSET` is the recommended form for large offsets.
3. Totals are computed from the strategy's scan, and reported as `rowsScanned` — a
   `FULL_SCAN` total is honest about its cost.
4. The MFG filter-option bundle is explicitly classified `FULL_SCAN` over narrow columns
   (see §7.7): it needs whole-set knowledge and will be priced as such, not hidden.

### 5.3 Document fetcher

```js
fastFetchDocument_({
  scopeId,
  parent:   { sheetName, keyHeader, keyValue, columns },
  children: [ { alias, sheetName, parentHeader, parentKey, columns, orderBy } ]
}) -> { parent, children: { alias: rows }, metrics, stampSig }
```

- `serviceCalls` = 1 per section (parent + each child); child rows are read by host range, so
  `rowsScanned` is the matched rows, not the table.
- Ordering is applied in memory over rows already fetched.
- No cache parameter in this revision: caching is opt-in per endpoint only after the
  sequence in §7 reaches step 5.

### 5.4 Cache model (closes findings 2 and 4)

| Item | Rev 2 |
|---|---|
| Logical key | **Stable and fully hashed**: `fr1_<hash32(scopeId|kind|docKey|payloadVersion)>`, short and fixed-length, well inside the 250-character key limit |
| `stampSig` | **Inside the manifest**, never in the key — a mutation must not mint a new logical entry |
| Generation | **Stable generation** (no generation suffix), so a rewrite reuses the same chunk keys and overwrites the previous value |
| Publication | chunks first, then the manifest (`putChunkedCache_`, `Code.js:1702-1735`); then a best-effort removal of chunk indices ≥ the new chunk count, so a smaller generation cannot leave stale trailing chunks |
| Size ceiling | **≤5 chunks (~450 KB)** per entry. Anything larger is refused (`cache: 'refused-size'`, `FR_CACHE_TOO_LARGE`) and read directly. Multi-megabyte payloads are out of scope by design |
| What may be cached | reference bundles and single documents only. **Table-sized indexes are explicitly not cached** (they are computed per request with `NARROW_SCAN`, or avoided by strategy) |
| Capacity discipline | the engine never writes more than 8 cache entries per execution, and never caches a payload whose own size exceeds the ceiling — an entry storm cannot exhaust the shared script cache |
| Item budget | treated as scarce: Google documents ~1 000 items, 100 KB per key, and expiry only as a suggestion. With ≤5 chunks an entry costs ≤6 items; a bounded number of live logical keys keeps the engine far below the cap while leaving room for the `vt_*` table stamps that share the same cache |
| No write-through patching | **removed.** A write stamps; the next read misses and rebuilds (§5.5) |

### 5.5 Consistency protocol (closes finding 3)

The engine produces a **validated best-effort snapshot**, and the documentation must say
exactly that — never "guaranteed identical".

1. Read `stampSig` **before** the payload (one `CacheService.getAll`, zero sheet reads).
2. Assemble the payload from bounded reads.
3. Read `stampSig` **again after** assembly.
4. Publish the cache entry **only if** both reads succeeded, are identical, and cover every
   table in the payload. Any mismatch or missing stamp ⇒ no publication, and the payload is
   returned as fresh, uncached data with `cacheOutcome: 'refused-unknown-stamp'`.
5. A read checks the cached manifest's `stampSig` against the current stamps; mismatch or
   missing ⇒ **miss**.
6. No cache read in an execution that has already written (`_recordCacheDisabled_`,
   `Code.js:619-620`) — the dirty-read window.
7. Documented residual risks, stated in the file header: manual sheet edits, formulas,
   imports, raw `setValues` writers that never stamp (`Code.js:822-830`), concurrent
   executions, and CacheService eviction. The engine detects what the stamp system detects
   and nothing more.

### 5.6 Diagnostics (closes finding 5)

- **Per-response metrics** (G4) travel with every read and are logged as one structured line.
- **Historical aggregation** happens in Cloud Logging, not in a cache registry.
- `frDiagnostics_(logicalKey)` inspects one key the caller supplies: chunk count, bytes,
  manifest presence, age, `stampSig` presence, generation, whether a rebuild would be
  required. Nothing enumerates the cache, because CacheService cannot.
- Outcomes are reported as `miss`; the engine never claims to distinguish eviction from expiry.

### 5.7 Parity guard (the cost of D1)

A static check compares duplicated contracts between the two engines and fails loudly on
divergence: key normalisation (trim, blank-key skip, first-match vs all-matches), the block
caps, the bound-read rule (`getDataRange` absent from both), and the date/serial rules used
when values round-trip.

---

## 6. Phase 3 — `Core_ViewEngine.js` (server-side only)

### 6.1 Canonical response contracts (closes finding 7)

Each migrated endpoint gets a **declared canonical DTO contract** (ordered field list, types,
nullability, date serialisation). Both the legacy response and the modern response are
projected through the same contract before comparison or transmission. Without this, a
projected response can never be diffed against a legacy one, and shadow compare would report
noise instead of differences.

### 6.2 Projection

```js
viewProject_(rows, contractSpec, { grantFlags })
// contractSpec = { fields: [...], rename, dropEmpty }
// projection + redaction run AFTER authorization, on every request
```

- Projection is the contract, not an extra layer: the DTO is the endpoint's declared output.
- Costs are reported as `bytesIn`/`bytesOut` through `Logger` (G4).
- The permission boundary is absolute: cached data is raw and authorization-neutral; grants
  are evaluated per request (§3.2 G8).

### 6.3 Option bundles — rebuild only

`viewOptions_(scopeId, kind, builder, ttl)` caches a **small** option bundle so it is not
rebuilt by every endpoint. It does **not** reduce what is transmitted: every RPC still
serialises and sends its options. Transmission reduction requires a client store or an
ETag-style protocol and is deferred (§6.5).

### 6.4 Sync envelope

Read endpoints return `stampSig` for the tables they cover, so a future client store can
detect change without a reload. This is a server-side field only; it changes no client
behaviour today.

### 6.5 Removed from this phase (closes findings 10 and 11)

- Deferred sections and `fetch_deferred` (needs client triggers and rendering).
- Any claim of reduced option transmission (needs a client store / ETag).
- `ViewStore`, local patching after save, and retiring the post-save reload.

All of the above are prerequisites of a separately approved client phase.

---

## 7. Phase 4 — Delivery sequence

Revised to the reviewed order. Each step is independently flag-gated and revertible.

| Step | Deliverable | Flag | Notes |
|---|---|---|---|
| 1 | **Freeze canonical response contracts** for the target endpoints; fix or document the known legacy anomalies (§4.6, §9) | — | No engine code. Establishes the diff basis. |
| 2 | `Core_FastRead.js` primitives with the honest metrics contract (§5.1) and the parity guard (§5.7) | `FAST_READ_CORE_` remains false for callers | Inert until a module flag is on |
| 3 | **Sales list** migrated with `NARROW_SCAN_PAGE` / `KEYSET`, **no cross-request caching** | `SALES_FAST_READ_` | Proves the strategies before caching is introduced |
| 4 | **Sales document reads** (`getValleyInvoiceForReturn_` baseline first per §9, then the invoice detail) | `SALES_FAST_READ_` | `fastFetchDocument_` |
| 5 | **Small-payload cache** for documents and reference bundles only: stable key, stamp in manifest, pre/post validation, ≤5 chunks | `FAST_READ_CORE_` + module flag | First step where caching exists at all |
| 6 | **DTO projection** for the migrated endpoints plus permission tests | `FAST_VIEW_CORE_` | Projection after authorization |
| 7 | **MFG list and view as a separate query design** | `MFG_FAST_READ_` | Its filters and option generation need whole-set knowledge (§4.4, §5.2 `FULL_SCAN`); it is not a copy of the Sales migration |
| 8 | Client phase (store, deferred sections, option transmission) | separate approval | Out of scope here |

### 7.4 Acceptance — Definition of Done

| Check | Target |
|---|---|
| `APPEND_WINDOW` page (unfiltered, append-ordered) | `serviceCalls` ≤ 2; `rowsScanned` ≤ limit + small constant |
| `NARROW_SCAN_PAGE` page | `serviceCalls` ≤ 3; `cellsRead` declared and ≤ rows × narrowCols + limit × pageCols |
| `KEYSET` deep page | `serviceCalls` ≤ 2·log₂(rows) + 1 |
| Document fetch | `serviceCalls` = 1 per section; `rowsScanned` = matched rows |
| Cache | small payloads only; ≤5 chunks; refused-size and refused-unknown-stamp paths exercised by tests |
| Consistency | publication requires pre/post stamp equality; a write in the execution blocks cache reads; unknown stamp ⇒ miss |
| Payload | measured `bytesOut`; ≥40 % reduction on migrated endpoints against the canonical contract |
| Shadow compare | admin/staging only, canonical-contract basis, **zero diffs** before a flag is left on; logs contain no raw values |
| Static | `node --check` clean; decoupling gate 0 hits; parity guard passes |
| Rollback | flag false restores legacy behaviour with no data action |

### 7.5 Verification strategy (closes finding 14)

- **Executable VM harnesses are in scope.** The repository already contains the pattern and
  the tooling: `tools/verify/optimization_chunk_cache.js`, `optimization_reads.js`,
  `rt3_stamp_coverage.js` (plus `gasstub.js`). New harnesses for this work must cover:
  chunk publication and overwrite (including shrink), stamp-race refusal, unknown-stamp miss,
  strategy refusal (`FR_STRATEGY_UNSUPPORTED`), key normalisation parity, and type fidelity
  through a batched read.
- These harnesses run against stubs and **never** write production data; they are not the
  project's "no test suites" prohibition (which targets the app's runtime suites).
- Static inspection, call-path tracing and `node --check` remain required but are no longer
  sufficient on their own for the items above.
- Production acceptance remains **NOT RUN** until the owner runs it; live execution only on a
  staging copy with explicit authorisation.

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| A list query silently returns a partial set | Strategy declaration + `FR_STRATEGY_UNSUPPORTED` refusal + `partial` flag (§5.2, D8) |
| A page is "fast" because it reads a page but is wrong | `rowsScanned`/`cellsRead` reported per response, not just `serviceCalls` (§5.1) |
| Cache exhaustion of the shared script cache | ≤5 chunks/entry, ≤8 writes/execution, no table-sized entries, stable keys so rewrites overwrite (§5.4) |
| Stale reads | Stamp in manifest, pre/post validation, unknown ⇒ miss, no cache after a write (§5.5) |
| Stamp system cannot see a change | Documented as a residual risk; the engine does not claim otherwise (§5.5.7) |
| Duplicated primitives drift between engines | Parity guard (§5.7) |
| An engine bug breaks a live page | Bounded fail-open with a deadline and early abort (G1) + per-module flags |
| Sensitive data in logs | No raw values in shadow or diagnostics output (G7) |
| Permission leakage through cache | Raw only in cache; projection/redaction per request after authorization (G8) |
| MFG treated as a generic list | Explicitly a separate query design with declared `FULL_SCAN` costs (§7 step 7) |
| Scope creep into the write path | Write path frozen; any change needs its own plan |

---

## 9. Open decisions (required before step 1 completes)

1. **`getValleyInvoiceForReturn_` anomaly** (`Company_ValleyFoods_Actions.js:12591`): fix the
   unresolved `uid` reference as a separate defect, or freeze today's behaviour
   (`invInfo === null`) as the baseline for that endpoint? Until this is chosen, "zero diff"
   has no meaning there.
2. **Shadow compare**: admin-triggered action only (proposed), confirm no production sampling
   is ever wanted.
3. **Deadline budget for G1**: proposed default 120 s of the 6-minute limit.
4. Whether step 7 (MFG) should be scheduled immediately after step 6, given that its option
   and filter design is materially different from Sales.
