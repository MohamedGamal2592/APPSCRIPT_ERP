# Execution Plan: make `erp_test` inserts instant — lock narrowing, id counter, and the session-cache question

**Plan version:** 1
**Date:** 2026-09-30
**Status:** Plan only. Nothing in this plan has been executed.
**Scope:** the Testing System company (`erp_test_*`) only. No other company changes behaviour.

---

## PART A — Rules for the implementing agent (read before anything else)

- **A1. Phases run in numerical order.** Do not start a phase until the previous phase's **DONE-CHECK** has passed and the owner has written `PASS Pn` in chat.
- **A2. Inside a phase, do the steps in numerical order.**
- **A3. Never edit these files:**
  - every `Company_TopLight_*`, `Company_TopChemical_*`, `Company_ValleyFoods_*`, `Company_Assessment_*` file
  - `Core_FastRead.js`, `Core_FastSave.js`, `Core_FormContracts.js`, `Core_ViewEngine.js`
  - `UI_Components.html`, `Client_Helpers.html`, `CSS_Tokens.html`

  Three files may be edited, and only where a step names them: **`Code.js`**, **`Company_ErpTest_Actions.js`**, and **`tools/erptest/gen_actions.js`**.
- **A4. You never run `clasp push`, `clasp deploy`, or anything that writes to a Google Sheet.** When a step says **OWNER RUNS**, stop, print the exact command or click-path, and wait for the owner to paste the output.
- **A5. STOP conditions.** If a DONE-CHECK fails, or reality differs from this plan (a function, line number or column is missing or named differently), stop immediately and report exactly what differs. Do not guess a fix.
- **A6. Every behaviour change in this plan is behind `ET_FAST_INSERT_`.** With that flag `false`, every code path in this plan must be byte-for-byte equivalent to today's. A phase that cannot prove this is not done.
- **A7. Text replacements are exact-string replacements** unless a step says regex.
- **A8. Commit messages.** After each phase's DONE-CHECK passes, one commit on the current branch: `et_instant Pn: <phase title>`. Do not push until the owner says so.

---

## PART B — Fixed facts, verified in this checkout on 2026-09-30

### B1. Where an `erp_test` insert actually spends its time

`add_et_category` → `addCategory_` (`Company_ErpTest_Actions.js:1233`) → `tlDbCreate_` (`Company_ErpTest_Actions.js:508`).

`tlDbCreate_` holds the **global script lock** (`executeWithLock_`, `Code.js:1058`) across all four of these:

| Inside the lock today | Cost | Must it be? |
|---|---|---|
| `getNextIdUnderLock_` (`Code.js:1185`) → `maxIdOf_` (`Code.js:1040`) | **a full ID-column read, every insert** | yes, but it can be made O(1) — P1 |
| `tlDbDeriveRow_` (`:666`) | for cash: `tlChartPositionalLookup_` → `etRecords_(CHART_SHEET)` = **a whole reference sheet on a cold cache** | partly — P2 |
| `tlDbAppendRow_` (`:499`) | `getLastRow()` + `setValues()` | **yes** |
| `noteRecordChange_` (`Code.js`) + `tlDbRowRecord_` | 2 cache reads + 1 put + an object build | **no** — P2 |

`executeWithLock_` is `LockService.getScriptLock()` with a 5s `waitLock`. It is **script-wide**, so every write in the deployment — all five companies — queues on the same mutex.

### B2. `LockService.getDocumentLock()` is NOT available here — the Document Lock idea is blocked

This script is **standalone**, not container-bound:

- `.clasp.json` declares a bare `scriptId` with no parent container.
- `appsscript.json` declares a `webapp` (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`).
- `getDocumentLock` appears **nowhere** in the codebase.

`getDocumentLock()` returns `null` outside a container-bound document context, so `getDocumentLock().waitLock(...)` would throw a null-dereference on every insert. **Per-company lock scoping via Document Lock is not achievable in this architecture.**

What replaces it, in order of preference:
1. **Shrink the critical section** (P1 + P2) until contention stops mattering. After P1 and P2 the lock holds ~2 Sheets calls instead of up to 3 sheet reads plus a write. This is the whole of this plan.
2. **Only if P5 measurement still shows queueing:** a per-`dbId` mutex in `CacheService` (P6, optional, not authorised by this plan).

### B3. Item 2 — the session cache — is ALREADY IMPLEMENTED. Do not build it.

Every read named in the proposal is already served from `CacheService`, at **longer** TTLs than the proposed 60s–5min:

| Preamble step | Already cached as | TTL |
|---|---|---|
| `SessionManager_.validate` (`Code.js:3570`+) | `sess_<hash>` | the session's remaining life (`SESSION_EXPIRY_HOURS`) |
| `SessionManager_.touch` | throttled by `touch_<hash>` | `SESSION_TOUCH_THROTTLE_SECONDS` — the sheet write is skipped, not repeated |
| `userDirectory_()` (`Code.js`) | `user_dir_g<authGeneration_>` | `CACHE_USER_DIR_SECONDS = 21600` (6h) |
| `getRoleAuthorityMatrix_()` | `mx_g<gen>_<role>` | generation-keyed |
| `isSystemEnabled_()` (kill switch) | `ks_g<gen>` **plus** a per-execution `_ksMemo_` | `CACHE_KILLSWITCH_SECONDS = 21600` (6h) |
| `ensureCompaniesRegistered_()` | in-memory `_companiesInitialized_` guard | no sheet reads at all |

Two consequences the implementing agent must respect:

- **Adding a 5-minute cache would be a regression**, because the shipped TTLs are 6 hours and a full session lifetime.
- **Caching the *assembled authority* is explicitly rejected by design.** `authenticateSystemUser_` carries this comment, and it is load-bearing: *"Authority must not inherit that: a role change, a company move or a deactivation has to bite on the user's next request."* The per-request work is the **re-assembly** of authority from already-cached parts, deliberately. Do not cache `userObj`. Do not extend the kill-switch TTL.

**So item 2 becomes a measurement step (P0), not a build step.** If P0 shows preamble time is already near-zero, item 2 is closed as already-done. Any residual is Apps Script cold start, which no cache fixes.

### B4. `Company_ErpTest_Actions.js` is a GENERATED file

It is generated from `Company_TopLight_Actions.js` by `node tools/erptest/gen_actions.js` (a deterministic codemod; `tlDbCreate_` is passed through with only helper names rewritten — `getSheet_`→`etSheet_`, `getHeaders_`→`etHeaders_`, and the `etCol_(table, 'id')` third argument).

**A hand edit to `Company_ErpTest_Actions.js` is destroyed the next time anyone runs the generator.** This plan therefore:

- puts all durable new logic in **`Code.js`**, which is hand-written and never generated;
- keeps the `Company_ErpTest_Actions.js` change to the **smallest possible call-site swap**;
- **adds that swap to `gen_actions.js` as a codemod (P3)** so regeneration reproduces it.

P3 is not optional. Skipping it means the next `gen_actions.js` run silently reverts P2.

### B5. Names fixed by this plan

| Thing | Name |
|---|---|
| Master flag (in `Code.js`) | `ET_FAST_INSERT_` |
| Properties key prefix | `etid_` |
| New `Code.js` function | `etNextIdFromProperties_` |
| New `Code.js` function | `etReseedInsertIds_` (owner-run repair) |
| New verify script | `tools/verify/erptest_instant_insert.js` |
| Commit prefix | `et_instant Pn:` |

---

## PART C — Phases

### P0 — Measure before changing anything (OWNER RUNS)

No code changes in this phase.

**0.1** The app already emits what is needed. `Client_Helpers.html` records `save_feedback_ms` and `save_confirmed_ms` per journey, and the server records per-request stage timings via `perfBeginRequest_` / `perfFinishRequest_` (`Code.js`). `ERP_Perf_Dashboard.html` renders them.

**0.2 OWNER RUNS.** Open `ERP_Perf_Dashboard.html` in the deployed app and record, for the Testing System company, for `add_et_category`, `add_et_cash` and `add_et_sales`:

- median and p90 `save_confirmed_ms`
- the server-side split: auth/preamble ms vs handler ms

**0.3** Write the six numbers into this file under a new heading `## P0 baseline (recorded <date>)`. They are the only evidence that P1–P2 worked.

**0.4** Read the preamble number specifically. Per **B3** it should already be small. If preamble is a large share of the total, **STOP** and report — that would contradict B3 and means something is evicting the caches, which is a different bug than this plan addresses.

**DONE-CHECK P0:** the six baseline numbers are written into this file, and the preamble share is confirmed small (item 2 closed) or reported as a contradiction.

---

### P1 — The O(1) id counter, in `Code.js`, behind a flag

Removes the full ID-column read from inside the lock.

**1.1** In `Code.js`, immediately after `function idHighWaterKey_(...) { ... }` (ends near line 1169), insert:

```js
/* ── [et_instant P1] The erp_test insert fast path ─────────────────────────
 *
 * WHY. getNextIdUnderLock_ reads the whole id column on every insert, inside
 * the global script lock, so the cost of one insert grows with the table and
 * every other company waits for it (maxIdOf_, Code.js:1040).
 *
 * WHAT. A Script-Properties high-water counter, seeded ONCE from the sheet max
 * and incremented thereafter. Still called under the lock — Properties is not
 * transactional, so the lock is what makes "read, +1, write" atomic.
 *
 * CONTRACT. Opt-in per call site via the opts argument. With ET_FAST_INSERT_
 * false, or opts absent, getNextIdUnderLock_ behaves exactly as before for all
 * five companies.
 *
 * DRIFT. The counter is authoritative only because every insert goes through
 * it. A row added or deleted by hand in the sheet can leave it below the sheet
 * max, which would re-issue an id. etReseedInsertIds_ is the repair, and manual
 * row surgery on an erp_test_* sheet REQUIRES running it afterwards.
 */
var ET_FAST_INSERT_ = false;

function etFastIdKey_(dbId, tableName, idColumnName) {
  return 'etid_' + idHighWaterKey_(dbId, tableName, idColumnName);
}

/* MUST be called while already holding the script lock. */
function etNextIdFromProperties_(dbId, tableName, idColumnName) {
  var props = PropertiesService.getScriptProperties();
  var key = etFastIdKey_(dbId, tableName, idColumnName);
  var stored = Number(props.getProperty(key));
  var next;
  if (Number.isInteger(stored) && stored > 0) {
    next = stored + 1;
  } else {
    /* Cold seed: the one and only full column read for this table, ever. */
    var sheet = getSpreadsheet_(dbId).getSheetByName(tableName);
    next = maxIdOf_(sheet, idColumnName) + 1;
  }
  props.setProperty(key, String(next));
  return next;
}

/* Owner-run repair. Re-floors every counter at the table's real max, so a
 * counter that drifted low can never re-issue an id. Safe to run any time; it
 * only ever raises a counter. */
function etReseedInsertIds_(dbId, tableNames, idColumnName) {
  var props = PropertiesService.getScriptProperties();
  var out = [];
  (tableNames || []).forEach(function (t) {
    var key = etFastIdKey_(dbId, t, idColumnName);
    var stored = Number(props.getProperty(key)) || 0;
    var sheetMax = 0;
    try { sheetMax = maxIdOf_(getSpreadsheet_(dbId).getSheetByName(t), idColumnName); } catch (e) {}
    var next = Math.max(stored, sheetMax);
    props.setProperty(key, String(next));
    out.push({ table: t, was: stored, sheetMax: sheetMax, now: next });
  });
  return out;
}
```

**1.2** In `Code.js`, change the signature of `getNextIdUnderLock_` (line 1185).

Find:
```js
function getNextIdUnderLock_(dbId, tableName, idColumnName = 'id') {
```
Replace with:
```js
function getNextIdUnderLock_(dbId, tableName, idColumnName = 'id', opts) {
```

**1.3** In `Code.js`, insert the gated branch. It must sit **after** the existing `isSystemTableBackend_` branch and **before** the `const ss = getSpreadsheet_(dbId);` line, so the system-table path is untouched.

Find:
```js
  const ss = getSpreadsheet_(dbId);
  /* One column, not the whole sheet — see maxIdOf_. This runs under the global
     script lock, so its size is every other user's queue time. */
```
Replace with:
```js
  /* [et_instant P1] Opt-in O(1) counter. Falls through to the column scan
     whenever the flag or the opt-in is absent, so the other four companies and
     every non-opted call site keep today's behaviour exactly. */
  if (ET_FAST_INSERT_ === true && opts && opts.fastCounter === true) {
    const fastKey = idHighWaterKey_(dbId, tableName, idColumnName);
    const fastNext = etNextIdFromProperties_(dbId, tableName, idColumnName);
    const fastSeen = Number(_idHighWater_[fastKey]) || 0;
    const fastOut = fastNext > fastSeen ? fastNext : fastSeen + 1;
    _idHighWater_[fastKey] = fastOut;
    return fastOut;
  }

  const ss = getSpreadsheet_(dbId);
  /* One column, not the whole sheet — see maxIdOf_. This runs under the global
     script lock, so its size is every other user's queue time. */
```

**1.4** Do **not** yet change any call site. After P1, `ET_FAST_INSERT_` is `false` and no caller passes `opts`, so behaviour is unchanged. P1 is pure addition.

**DONE-CHECK P1:**
- `node -e "new (require('vm').Script)(require('fs').readFileSync('Code.js','utf8'))"` parses clean.
- `grep -c "fastCounter" Code.js` returns `1`.
- `grep -n "ET_FAST_INSERT_ = false" Code.js` returns exactly one line.
- No call site passes a 4th argument yet: `grep -n "getNextIdUnderLock_(" Code.js Company_*.js` shows every call with 2 or 3 arguments.

---

### P2 — Narrow the lock in `tlDbCreate_`

Two parts. **2A is the low-risk win and is mandatory. 2B is the larger win and carries a correctness constraint — read 2B.0 before touching it.**

#### P2A — move the work that provably does not need the lock, out of it

`noteRecordChange_` is a `CacheService` stamp and `tlDbRowRecord_` builds a plain object. Neither touches the sheet, neither can race, and neither depends on lock state.

In `Company_ErpTest_Actions.js`, in `tlDbCreate_` (line 508).

Find:
```js
    return executeWithLock_(function () {
      if (idIdx !== -1 && String(row[idIdx]).trim() === '') row[idIdx] = getNextIdUnderLock_(dbId, table, etCol_(table, 'id'));
      tlDbDeriveRow_(dbId, table, row, headers, {});
      const rowNumber = tlDbAppendRow_(sheet, row);
      noteRecordChange_(dbId, table, row[keyIdx]);   // [live-notice D5]
      const record = tlDbRowRecord_(headers, row);
      return { status: 'success', rowNumber: rowNumber, record: record, assignedId: row[keyIdx] };
    });
```
Replace with:
```js
    /* [et_instant P2A] Only the id allocation and the append need the global
       script lock. The change stamp is a CacheService write and the record is a
       plain object build — holding the lock across them charged every other
       company for work that cannot race. */
    const lockedRowNumber = executeWithLock_(function () {
      if (idIdx !== -1 && String(row[idIdx]).trim() === '') {
        row[idIdx] = getNextIdUnderLock_(dbId, table, etCol_(table, 'id'), { fastCounter: ET_FAST_INSERT_ === true });
      }
      tlDbDeriveRow_(dbId, table, row, headers, {});
      return tlDbAppendRow_(sheet, row);
    });
    noteRecordChange_(dbId, table, row[keyIdx]);   // [live-notice D5]
    const record = tlDbRowRecord_(headers, row);
    return { status: 'success', rowNumber: lockedRowNumber, record: record, assignedId: row[keyIdx] };
```

#### P2B — the reference-sheet read inside the lock

**2B.0 Read this first. `tlDbDeriveRow_` is NOT uniformly safe to move out of the lock.**

`tlDeriveCash_` (`:825`) ends with:
```js
if (idx['box_balance'] !== undefined) {
  set('box_balance', tlCashBoxBalanceBefore_(dbId, get('related_box'), ctx.rowNumber) + signed);
}
```
That is a **running balance**: it reads prior rows of the cash sheet and appends a value derived from them. Two concurrent cash inserts computing it outside the lock would both read the same "balance before" and write a corrupted running balance. **`box_balance` must stay inside the lock.**

The expensive part is different work in the same function: `tlChartPositionalLookup_` (`:846`) and `partyRefs_` (`:841`). On a cold `tlRefs_` cache `tlChartPositionalLookup_` calls `etRecords_(dbId, CHART_SHEET)` — a **whole reference sheet, read while holding the global lock**.

So the win is to warm those reference caches *before* taking the lock, and leave derive ordering exactly where it is.

**2B.1** In `Company_ErpTest_Actions.js`, in `tlDbCreate_`, immediately **before** the `const lockedRowNumber = executeWithLock_(...)` line added in 2A, insert:

```js
    /* [et_instant P2B] Warm the reference caches OUTSIDE the lock. On a cold
       tlRefs_ cache tlDeriveCash_ reads the entire chart-of-accounts sheet
       (tlChartPositionalLookup_ -> etRecords_(CHART_SHEET)) while holding the
       global script lock. Warming here is a no-op when the cache is warm and
       moves a full sheet read out of the critical section when it is not.
       Derive itself is NOT moved: tlDeriveCash_ computes box_balance as a
       running balance over prior rows, which is only correct under the lock. */
    if (ET_FAST_INSERT_ === true) {
      try {
        const warmSchema = tlSchema_(table);
        if (warmSchema.derived === 'cash') {
          /* A non-empty sentinel is REQUIRED: tlChartPositionalLookup_ returns
             early on a blank code (`if (!wanted) return ...`), so passing '' would
             warm nothing. Any non-empty value populates the tlRefs_ map and then
             misses harmlessly. */
          tlChartPositionalLookup_(dbId, '__warm__');
          partyRefs_(dbId);
        }
      } catch (eWarm) { /* a warm-up that fails just leaves the old cost */ }
    }
```

**2B.2** Do not change `tlDbAppendValues_` (`:529`) or `tlDbAppendValuesBatch_` (`:543`) in this plan. They are batch paths with different callers; scope creep here is how a test iteration becomes a regression.

**DONE-CHECK P2:**
- `node -e "new (require('vm').Script)(require('fs').readFileSync('Company_ErpTest_Actions.js','utf8'))"` parses clean.
- `grep -c "et_instant P2" Company_ErpTest_Actions.js` returns `2`.
- `box_balance` still resolves inside the lock: `tlDbDeriveRow_` appears **inside** the `executeWithLock_` callback in `tlDbCreate_`. Verify by eye, and the P4 script asserts it.
- With `ET_FAST_INSERT_` still `false`: the warm-up block is skipped and `{ fastCounter: false }` takes the original branch in `getNextIdUnderLock_`. Behaviour is unchanged.

---

### P3 — Teach the generator the P2 edit (mandatory — see B4)

Without this, the next `node tools/erptest/gen_actions.js` reverts P2.

**3.1** Read `tools/erptest/gen_actions.js` and find where it rewrites `tlDbCreate_`'s helper names (the `getSheet_`→`etSheet_` / `getHeaders_`→`etHeaders_` / `getNextIdUnderLock_(dbId, table)`→`getNextIdUnderLock_(dbId, table, etCol_(table, 'id'))` codemods).

**3.2** Add one `replaceOnce` codemod, alongside those, that performs the **exact same P2A + P2B transformation** on the generated text. Use the generator's existing `replaceOnce` so it **fails loudly** if `Company_TopLight_Actions.js` ever drifts — that assertion is the point.

**3.3** Do **not** edit `Company_TopLight_Actions.js` (A3). The codemod applies the change only on the way into the generated `erp_test` file.

**DONE-CHECK P3:**
- `node tools/erptest/gen_actions.js` runs with **zero** reported problems.
- `git diff --stat Company_ErpTest_Actions.js` after regeneration is **empty** — the generator now reproduces the P2 file byte-for-byte.
- This is the real check. If the diff is non-empty, the codemod does not match what P2 wrote; fix the codemod, not the file.

---

### P4 — The static verify script

**4.1** Create `tools/verify/erptest_instant_insert.js`, in the style of its siblings in `tools/verify/` (local file reads only, no network, non-zero exit on failure). It must assert:

1. `Code.js` declares `ET_FAST_INSERT_` exactly once, and its shipped value is `false`.
2. The `getNextIdUnderLock_` fast branch is guarded by **both** `ET_FAST_INSERT_ === true` **and** `opts.fastCounter === true`.
3. The fast branch appears **after** the `isSystemTableBackend_` branch.
4. `etNextIdFromProperties_` and `etReseedInsertIds_` both exist, and `etNextIdFromProperties_` calls `maxIdOf_` on exactly one path (the cold seed).
5. In `tlDbCreate_`, `noteRecordChange_` and `tlDbRowRecord_` are **outside** the `executeWithLock_` callback.
6. In `tlDbCreate_`, `tlDbDeriveRow_` and `tlDbAppendRow_` are **inside** it. *(This is the `box_balance` correctness guard from 2B.0 — it must fail if someone "optimises" derive out of the lock later.)*
7. No call to `getNextIdUnderLock_` anywhere in `Company_TopLight_Actions.js`, `Company_TopChemical_Actions.js`, `Company_ValleyFoods_Actions.js` or `Company_Assessment_Actions.js` passes a 4th argument.

**4.2** Register it in `tools/verify/run_all.js` following the existing pattern.

**DONE-CHECK P4:** `npm run verify` passes, and the new script is listed in its output. Temporarily breaking any one of assertions 1–7 makes it fail (spot-check at least #6, then revert).

---

### P5 — Rollout, measurement, rollback (OWNER RUNS)

**5.1 OWNER RUNS.** `clasp push`.

**5.2 OWNER RUNS — seed the counters once, before enabling the flag.** From the Apps Script editor, run:

```js
etReseedInsertIds_('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE', [
  'erp_test_products', 'erp_test_customer_vendor', 'erp_test_categories',
  'erp_test_purchasing_costing', 'erp_test_product_purchasing',
  'erp_test_sales_invoices', 'erp_test_sales_products', 'erp_test_sales_returns',
  'erp_test_sales_offer', 'erp_test_sales_offer_products',
  'erp_test_cash_bank_movement',
  'erp_test_manufacture_orders', 'erp_test_manufacture_lines'
], 'id');
```

Paste the returned array. Every row must show `now >= sheetMax`. **If any row shows `now < sheetMax`, STOP** — enabling the flag would re-issue ids.

> Note: `id` is the column for tables whose schema key is `id`. Tables keyed on `unique_id` / `invoice_unique_id` / `transaction_id` / `offer_unique_id` take their id column from `etCol_(table, 'id')`. Confirm the per-table column against `Company_ErpTest_Schema.js` before running, and re-run for any table whose id column differs.

**5.3** Set `ET_FAST_INSERT_ = true` in `Code.js`. **OWNER RUNS** `clasp push`.

**5.4 OWNER RUNS.** Insert one record on each of: Categories, Customers, Cash, Sales. For each, confirm:
- the row appears and the assigned id is `previous max + 1`, with **no gap and no duplicate**;
- for Cash specifically, `box_balance` continues the running balance correctly — this is the 2B.0 invariant, and it is the one thing this plan could plausibly break;
- the optimistic row from `UIC.Live.save` reconciles to the server record rather than staying pending.

**5.5 OWNER RUNS.** Re-record the P0 metrics. Write them into this file under `## P5 result (recorded <date>)` next to the baseline.

**5.6 Rollback**, if anything in 5.4 is wrong: set `ET_FAST_INSERT_ = false`, `clasp push`. Every path in this plan returns to today's behaviour on that one flag — no data migration to undo, because the Properties counters are simply no longer read.

**DONE-CHECK P5:** ids are gapless and unique across the four inserts, Cash `box_balance` is correct, and the before/after numbers are recorded in this file.

---

### P6 — OPTIONAL, NOT AUTHORISED BY THIS PLAN

Only if P5 shows inserts are still queueing behind *other companies'* writes. The Document Lock route is unavailable (**B2**), so the option is a per-`dbId` mutex in `CacheService`, replacing the script lock for `erp_test` writes only.

This trades a real mutex for an advisory one: `CacheService` can evict, and a cache-based lock has no guaranteed mutual exclusion. It must not be adopted without a written argument for why a re-issued id is acceptable, or a compare-and-set on the append. **Do not start P6 without the owner explicitly asking for it in writing.**

---

## PART D — What this plan deliberately does not do

- **It does not add a session/authority cache.** Already implemented, at longer TTLs, and caching assembled authority is rejected by an explicit design invariant (**B3**).
- **It does not use `getDocumentLock()`.** Unavailable in a standalone web app (**B2**).
- **It does not touch the other four companies.** The `opts.fastCounter` opt-in exists precisely so their `getNextIdUnderLock_` behaviour is untouched.
- **It does not move `box_balance` out of the lock.** It is a running balance (**2B.0**).
- **It does not change the batch append paths** `tlDbAppendValues_` / `tlDbAppendValuesBatch_`.
- **It does not switch `erp_test` writes to MySQL or Firestore.** That is the structural option and a separate plan.
