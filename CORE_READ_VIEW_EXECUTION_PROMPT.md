# Session kickoff prompt — execute `Plan_Read_View_Modularization.md` (Rev 4) to completion

Paste this file's contents as the first message of a fresh session. It is self-contained.

---

## Mission

You are continuing an in-flight programme on a **live, production Google Apps Script ERP** at
`D:\Work\Script`. Read this whole prompt before touching anything.

The owner has authorised **continuous execution without per-phase approval** — through
`Core_FastRead.js`, `Core_ViewEngine.js`, the Sales migration, the small-payload cache, DTO
projection **and the MFG migration**. Do not stop to ask "may I proceed to the next step".
You MAY ask only when one of the escalation triggers in §2 fires.

---

## 0. Required reading, in this order

1. `Plan_Read_View_Modularization.md` — **Rev 4** is authoritative. Read it in full, including
   §0.1/§0.2 (review closures) and §1.1 (owner decisions DEC-1…DEC-4).
2. `READ_VIEW_MODULARIZATION_RESULTS.md` — the change ledger. Read §1 (status), §2 (the two
   templates), §3 (retraction recipes), §4/§4.1 and §5 (TR-1…TR-11).
3. `FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` §7.1-7.2 — the write-side programme. It is
   **frozen**: do not modify `Core_FastSave.js` or any `*_BATCH_WRITES_` flag.

Verify the repository root with `git rev-parse --show-toplevel`; confirm `D:/Work/Script`.
Inspect `git status` and preserve anything you did not create.

---

## 1. Non-negotiable constraints

1. **LIVE PRODUCTION.** Real users are working right now. Never:
   - run `clasp push`, `clasp deploy` or any deployment command;
   - `git push` (the owner deploys and pushes manually — a local commit is the deliverable);
   - create or edit triggers, script properties, or `appsscript.json`;
   - execute any business write action against live data, or open the live app to "check"
     something.
2. **NO DATA AND NO SCHEMA CHANGES.** No row rewritten; no column/header/sheet/table added,
   renamed or reordered — including system tables (`PERF_LOG_HEADERS_` keeps its nine columns).
   No fixtures, no temporary records, no backfills. The only writes are `CacheService` entries.
3. **The write path is frozen.** If a read migration appears to need a write-path change, that
   is an escalation.
4. **Flags default to `false`** and are recorded in the ledger status table in the same commit.
   **Flipping a flag to `true` is an owner action** — write the exact instruction into the
   Change Record; do not perform it.
5. **Commit locally, never push.** One commit per logical change. If a Change Record cannot
   contain its own SHA, leave a placeholder and resolve it in a follow-up record identified by
   commit message (the pattern RV-0.3 / RV-1.1 use).

---

## 2. Escalate (stop and ask) only when

- the only way forward needs a **production data write** or a **schema change**;
- the only way forward needs a **deploy** or a **flag flipped in production**;
- the plan is genuinely ambiguous on a point that changes user-visible behaviour;
- you find evidence of a **live incident or regression** in the area you are touching;
- a step's DoD cannot be met and you would otherwise have to lower it.

Everything else: decide, implement, document, continue.

---

## 3. Evidence standard (G9 — not optional)

Every modification ships in the same commit (or the one immediately after) with:

- a **Change Record** `RV-<step>.<n>` in `READ_VIEW_MODULARIZATION_RESULTS.md` using the §2.1
  template — files with line anchors, behaviour terms, why, flag state before → after,
  behaviour if reverted, copy-pasteable retraction recipe, metrics with baseline, residual
  risk, test runs;
- **Test-run records** `TR-<n>` (template §2.2) for every run: environment, exact command,
  purpose, PASS/FAIL/**NOT RUN**, evidence, and what the run does not cover.

Rules: `NOT RUN` is never upgraded to "passed"; **no raw business values in any record or
log** (field names, hashes, types, counts, bounded summaries only); completed records are
immutable (correct by appending); a step with a missing record or unrecorded runs stays
`IN PROGRESS`.

**Verification is executable wherever possible (D6).** VM harnesses under `tools/verify/` are
the evidence of record — `gasstub.js` + `vm` is the pattern (`optimization_chunk_cache.js` is
the reference). Static inspection and `node --check` are required but insufficient alone for
chunk publication, stamp races, filtering, type fidelity and permission boundaries.

---

## 4. Work items

### Step 1 (in progress) — VM harness, close RV-1.1, freeze canonical contracts
1. **Build VM harness scaffolding for VF server actions.** None exists: `gasstub.js` loads
   `Code.js` only; `s11_sales_returns.js` is a page harness. A handler under test needs a fake
   workbook plus the module's action-registry dispatch. Build it properly — it is the evidence
   standard for every later step.
2. Using it, **close RV-1.1** (`815c6c7`): found-invoice case (all four fields populated from
   the stub row) and missing-invoice case (`invoice` degrades to `{ uid: invUid, number: '-' }`).
   Record as TRs and drop the "VM/staging NOT RUN" caveat **only if the harness genuinely
   executes the handler**.
3. **Freeze canonical response contracts** for the Sales endpoints to be migrated
   (`get_valley_invoice_for_return`, invoices list, invoice detail): field list, types,
   nullability, date representation — the projection both readers are compared and served
   through. Record as `RV-1.2+`.

### Step 2 — `Core_FastRead.js` primitives (`FAST_READ_CORE_ = false`)
Layer 1 per §5.1 with the honest metrics contract in every return
(`serviceCalls`, `rowsScanned`, `colsRead`, `cellsRead`, `bytesRead`, `partial`, `cacheOutcome`)
plus the §5.7 parity guard. No callers. Decoupling gate must be 0 for `valley_`, `\bmfg\b`,
`manufactur`, `purchas`, `sales_`, `invoice`, `recipe`, Arabic characters and `getDataRange`.

### Step 3 — Sales list (`SALES_FAST_READ_ = false`)
`fastFetchList_` with a **declared strategy** per endpoint (§5.2). No cross-request caching yet.
Noncontiguous matches via `Sheets.Spreadsheets.Values.batchGet` or coalesced spans — never
per-row `getValues()`. `KEYSET` stays experimental until a measured comparison beats one
narrow-column scan.

### Step 4 — Sales document reads (`SALES_FAST_READ_ = false`)
`fastFetchDocument_` with **`PARENT_SCAN` / `PARENT_FK_INDEX_THEN_FETCH` declared per section**;
`rowsScanned` reported as table rows, honestly. Normalise Advanced-API vs `Range.getValues()`
types to the canonical contract.

### Step 5 — Small-payload cache (`FAST_READ_CORE_ = false`)
Only after steps 3-4 are measured. **Bounded-cardinality reference bundles first**, single
documents second and only while ≤5 chunks. Adopt the existing publication contract exactly:
stable logical key (SHA-256 truncated to ≥128 bits), **fresh immutable generation per
publication**, manifest switched after the chunks exist, previous generation removed after,
identity fingerprint + `stampSig` verified on **every** hit, unknown/missing stamp ⇒ miss, no
cache read in an execution that has written. Extend `optimization_chunk_cache.js`'s
interleaving / invalidation-during-build / shrink / integrity / partial-eviction tests to the
new namespace.

### Step 6 — DTO projection (`FAST_VIEW_CORE_ = false`)
`viewProject_` against the frozen contracts. Projection and redaction run **after authorization
on every request**; cached data stays raw. Report `bytesIn`/`bytesOut`. No deferred sections and
no option-transmission claims (client phase).

### Step 7 — MFG: sub-plan **and** implementation, in this same run
**7a. Write `Plan_MFG_Read_Design.md` first** and commit it before writing MFG code:
- per-endpoint strategy declarations (§5.2 list strategies; §5.3 document strategies);
- the filter/option-bundle decision — `FULL_SCAN` over narrow columns vs a narrowed read —
  priced from step 5's measured numbers;
- the **frozen input list for `mfgCurrentMfgState_`**, because that hash feeds the edit token
  the **save** path depends on. Enumerate the inputs from source and state them explicitly;
  any later change to that list is a write-path risk and needs the owner.

**7b. Implement the MFG migration** against that design, behind `MFG_FAST_READ_ = false`
(owner flips later):
- list (`getValleyMfgOrders_`): strategy per §5.2, with the option/filter bundle priced as designed;
- view (`getValleyMfgOrderDetail_`): one `fastFetchDocument_` per section, replacing the
  whole-table reads; the edit token must be **byte-identical** for unchanged input;
- prove equivalence with shadow compare on representative orders (admin-triggered, canonical
  DTO basis, no raw values in logs) before the flag is described as ready to flip;
- record every read-count and byte-count delta in the Change Record.

### Out of scope
The client phase (step 8), anything in the write-side programme, and any flag flip.

---

## 5. Distilled technical rules (settled — do not re-derive or contradict)

- Stamp prefix is **`tv_`** (`Code.js:834`), 6 h TTL, best-effort: a stamp is a hint, never a
  guarantee. Missing stamp ⇒ "unknown ⇒ refetch".
- Cache: stable logical key + **fresh immutable chunk generation**; never overwrite a live chunk
  key in place (torn reads). ≤5 chunks per entry; refuse larger. Per-execution write limits do
  **not** bound concurrent executions — eviction is an accepted performance risk.
- Shadow compare (`frShadowCompare_`) invokes the modern reader **by function reference**, so
  evidence can be gathered while every user still runs legacy. Admin-triggered only; staging
  for heavy endpoints; **no production sampling exists in the plan**; no raw values in logs.
- Fail-open is bounded: `FR_DEADLINE_MS_ = 120000`, checked before every service call; the
  6-minute hard timeout is acknowledged as a failure mode the fallback cannot always cover.
- **No index exists.** Every document strategy scans the table (`rowsScanned` = table rows);
  only `cellsRead` differs. Never claim matched-row-only scanning.
- Do not cache table-sized indexes; do not patch cached payloads from a save manifest.
- `getReadOnlyRecords_` silently degrades above 50 000 rows / 2 MB (`Code.js:491-492`) — note
  which path a migrated endpoint lands on.
- `vfCurrentProducts_` deliberately bypasses the per-request memo (`Actions:11384`) — preserve.

---

## 6. Per-step acceptance and reporting

Before marking a step done: `node --check` clean; decoupling gate at 0; the step's DoD row in
§7.4 verified or the shortfall recorded as NOT MET with reason; every run recorded. Then write
a short summary (files touched, commits, records added, metrics, anything NOT RUN) and continue
**without asking**.

## 7. Definition of done for the whole run

Steps 1-7 complete with records and executable evidence; every flag still `false`; the ledger
status table accurate; `Plan_MFG_Read_Design.md` committed and the MFG migration implemented
behind its flag. Nothing deployed, nothing pushed, no production data written.
