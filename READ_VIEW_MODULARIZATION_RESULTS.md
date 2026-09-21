# Read & View Modularization — Change Ledger & Test-Run Records

Companion to `Plan_Read_View_Modularization.md` (currently **Rev 4**). This file is the
**only** place change records and test-run records for this programme live.

**Append-only scope, precisely:** *completed* Change Records (§4, and future RV-1.x records)
and *completed* Test Records (§5, TR-n) are immutable — a correction is a new record that
references the old one. The header, the programme-status table (§1), the templates (§2) and
the retraction recipes (§3) **are updateable**, because the status table would otherwise never
be able to advance and a wrong recipe could never be fixed. An update to those sections is
itself recorded when it changes a documented contract.

Owner: the reviewer/owner named in the plan. Assistant records every modification it makes
here in the same commit as the modification (guardrail G9, plan §3.3).

**Privacy rule (G7 applies here too): no record in this file may contain raw business values.**
Field names, hashes, types, counts, line numbers and bounded summaries only.

---

## 1. Programme status

| Step | Deliverable | Flag | Status |
|---|---|---|---|
| 0 | Audit (read-only) | — | **DONE** — records in §4 |
| 1 | Freeze canonical response contracts; resolve/document anomalies | — | **DONE** — `RV-1.1` fixed and closed with VM evidence (`RV-1.2`/`RV-1.3`, TR-12/TR-13); canonical contracts frozen (`RV-1.4`, TR-15); staging/live execution NOT RUN |
| 2 | `Core_FastRead.js` primitives + metrics + parity guard | `FAST_READ_CORE_` (false) | NOT STARTED |
| 3 | Sales list (`NARROW_SCAN_PAGE` / `KEYSET`, no caching) | `SALES_FAST_READ_` | NOT STARTED |
| 4 | Sales document reads | `SALES_FAST_READ_` | NOT STARTED |
| 5 | Small-payload cache (stable key, stamp in manifest, pre/post validation) | `FAST_READ_CORE_` | NOT STARTED |
| 6 | DTO projection + permission tests | `FAST_VIEW_CORE_` | NOT STARTED |
| 7 | MFG list + view (separate query design) | `MFG_FAST_READ_` | NOT STARTED |
| 8 | Client phase | separate approval | OUT OF SCOPE |

Flag states as of the last commit:

- **Read/view flags: not yet defined.** They do not exist in the source yet (they are introduced
  in step 2/3), so they are *absent*, not `false`. When introduced, each must default to
  `false`, and this table must be updated in the same commit that introduces it.
- Write-side flags (`FAST_SAVE_CORE_`, `MFG_BATCH_WRITES_`, `SALES_BATCH_WRITES_`,
  `RETURNS_BATCH_WRITES_`, `PURCHASE_BATCH_WRITES_`): **all `false`**.

---

## 2. Templates (copy for every new record)

### 2.1 Change Record

```markdown
### RV-<step>.<n> — <short title>
- Date / Commit:
- Step:
- Files (with line anchors):
- What changed (behaviour terms):
- Why (finding / plan section):
- Flag state before → after:
- Behaviour if reverted:
- Retraction recipe: L1 … / L2 … / L3 …
- Metrics observed (with baseline):
- Residual risk (what this does NOT prove):
- Test runs: see §5 records <ids>
```

### 2.2 Test-run record

```markdown
### TR-<n> — <short title>
- When:
- Environment: VM harness (no data) | staging copy | production, read-only | production
- Command:
- Purpose (claim under test):
- Result: PASS | FAIL | NOT RUN (+ one-line reason)
- Evidence (path / commit / Stackdriver timestamp):
- Not covered:
```

---

## 3. Retraction recipes (programme-wide)

| Level | Recipe | Applies to |
|---|---|---|
| L1 — runtime | Set the module flag back to `false` (and `FAST_READ_CORE_`/`FAST_VIEW_CORE_` if the module was the only consumer). No deploy of source needed if the flag is read from script, but flags live in source in this project, so L1 is a one-line change plus deploy. | any module |
| L2 — source | `git revert <sha>` for one record, or `git revert <first>^..<last>` for a step range | any commit |
| L3 — cache | Nothing is required: entries are namespaced `fr1_…` and expire on their own TTL. A specific key can be dropped with `frCacheDrop_(logicalKey)` when the key is known. | cache entries only |

**There is no data-side retraction.** This programme performs no schema change, no migration,
no backfill and no row rewrite. If a future record cannot state that, the change does not
belong in this programme.

---

## 4. Audit-phase records (Step 0 — read-only, pre-G9, summarised here)

These runs were made during the audit and the review round. They are recorded now, before G9
was agreed, and are labelled accordingly. None of them wrote anything.

### RV-0.1 — Audit programme opened
- Date / Commit: 2026-09-21 / `104e192` (plan Rev 1), revised `9abd764` (Rev 2)
- Files: `Plan_Read_View_Modularization.md`
- What changed: plan document created; Rev 2 closed 6 blocking and 8 major review findings.
- Why: owner request for a read/view modularization plan.
- Flag state: n/a (documentation)
- Behaviour if reverted: `git revert 9abd764 104e192` removes the plan; no runtime effect.
- Retraction recipe: L2 only.
- Metrics observed: n/a
- Residual risk: the audit is pattern-based across all files plus deep reads of the
  transport/cache layer and representative handlers — it is not a line-by-line review of
  every file.
- Test runs: TR-1 … TR-8

### RV-0.2 — Documentation & retraction protocol adopted (this section's origin)
- Date / Commit: 2026-09-21 / `50fdee8` (SHA resolved by RV-0.3)
- Files: `Plan_Read_View_Modularization.md` (§3.2 G9, §3.3, §7 step table),
  `READ_VIEW_MODULARIZATION_RESULTS.md` (new)
- What changed: every modification in this programme must now ship with a Change Record and
  recorded test runs; a step without a record is `IN PROGRESS` regardless of code state.
- Why: owner instruction — steps must be retractable and test runs documented.
- Flag state: n/a (documentation)
- Behaviour if reverted: `git revert 50fdee8` removes the requirement document; the code is
  unaffected.
- Retraction recipe: L2 only: `git revert 50fdee8`.
- Residual risk: compliance depends on discipline; the protocol cannot enforce itself.

### RV-0.3 — Resolve RV-0.2's commit reference (first append-only correction)
- Date: 2026-09-21
- Commit: identified by **message**, not SHA — this record's own commit is the one whose
  message begins `docs(read-view): resolve RV-0.2 commit reference`. A record cannot contain
  its own SHA before it is committed, and guessing one would be worse than describing it.
  `git log --oneline --grep="resolve RV-0.2 commit reference"` resolves it.
- Files: `READ_VIEW_MODULARIZATION_RESULTS.md`
- What changed: RV-0.2's placeholder `<this commit>` replaced with `50fdee8`; no other change.
- Why: the placeholder cannot be resolved within its own commit. The pattern for any future
  record with the same problem: leave the placeholder, resolve it in a follow-up record, and
  identify that follow-up by its commit message rather than chaining further SHAs.
- Flag state: n/a (documentation)
- Behaviour if reverted: no runtime effect.
- Retraction recipe: L2 only (`git revert <sha of the RV-0.3 commit, resolved by the grep above>`).
- Residual risk: none beyond the grep being the lookup mechanism.

### RV-0.4 — Plan finalised as Rev 3 (owner decisions recorded)
- Date: 2026-09-21
- Commit: identified by message — `docs(read-view): finalise plan as Rev 3 with owner
  decisions` (`git log --oneline --grep="finalise plan as Rev 3"`); this is the same
  message-identified pattern RV-0.3 established, used because a record cannot contain its own
  SHA.
- Files: `Plan_Read_View_Modularization.md` (status line, review order, §1.1 new, §3.2 G1/G2,
  §7 steps 1 and 7, §9 rewritten), `READ_VIEW_MODULARIZATION_RESULTS.md` (this record + TR-9)
- What changed: the owner's four decisions (DEC-1 … DEC-4) are recorded with their
  consequences; no open decision remains; the review order for implementation is stated at the
  top of the plan; step 7 is reclassified from a step to a reviewed sub-plan
  (`Plan_MFG_Read_Design.md`) scheduled after step 5's measurements; production sampling for
  shadow compare is deleted from the plan entirely; the G1 deadline is fixed at 120 s checked
  per service call.
- Why: owner answers to the four open items; review requirement that decisions be explicit
  before implementation.
- Flag state: unchanged — every read/view and write-side flag remains `false`. No code touched.
- Behaviour if reverted: `git revert <sha>` (resolved by the grep above) returns the plan to
  Rev 2 (four open decisions) with no runtime effect.
- Retraction recipe: L2 only.
- Retraction caveat: reverting the plan does **not** revert any decision the owner has already
  acted on outside this repository (e.g. a clasp deployment). Nothing has been deployed.
- Metrics observed: n/a (documentation)
- Residual risk: this record documents intent; it cannot prove the implementation will honour
  it. Enforcement is by review at each step's Change Record (G9).
- Test runs: TR-9

### RV-0.5 — Superseded by RV-1.1
- The queued first implementation action was written as RV-1.1 below. This record is kept so
  the queue item does not silently disappear.

### RV-0.6 — Session kickoff prompt written; step-1 harness recon recorded
- Date: 2026-09-21
- Commit: identified by message — `docs(read-view): add session kickoff prompt and record
  step-1 harness recon (RV-0.6)`.
- Files: `CORE_READ_VIEW_EXECUTION_PROMPT.md` (new), `READ_VIEW_MODULARIZATION_RESULTS.md`
- What changed: the execution prompt for a fresh session was written to
  `CORE_READ_VIEW_EXECUTION_PROMPT.md`, with **MFG implementation inside the same uninterrupted
  run** (sub-plan 7a committed before MFG code 7b). The recon below was recorded so a new
  session does not have to rediscover the dispatch path.
- Why: owner instruction to open a new session and start the plan without per-phase approval.
- Flag state: unchanged (no flags exist yet for read/view; write-side flags all `false`).
- Behaviour if reverted: `git revert <sha>` removes the prompt file; no runtime effect.
- Retraction recipe: L2 only.
- Residual risk: the prompt cannot be executed by the assistant that wrote it — the tooling in
  this session could not dispatch a subagent (model resolution fails) and the assistant cannot
  open a session. It is a handoff artifact for the owner to paste.

**Sub-task carried forward (this is where step 1 stands).** The remaining step-1 action is
building the VM harness for VF server actions. Recon completed this session:

- The module's dispatch surface is `ValleyFoods.dispatch_(payload, user, dbId, guardCtx)` at
  `Company_ValleyFoods_Actions.js:504`, exported with `pageForAction_`, `tableForAction_`,
  `requestRecovery_`, `register` at `:612`. It resolves `actions[payload.module_action]` and
  calls the handler as `(payload.data, user, dbId, guardCtx || {})`.
- `executeCompanyAction_` (`Code.js:6337`) is the production entry; a harness should bypass it
  and call `dispatch_` directly with an explicit `dbId`, because the auth/tenant layers need
  live state a VM cannot provide.
- Loading gotchas found: `Company_ValleyFoods_Actions.js` declares `const ValleyFoods = (…)()`
  at top level, which in a `vm` context lives in the global **lexical** scope — a later
  `vm.runInContext('ValleyFoods', ctx)` reaches it, but it is not a property of `globalThis`.
  `gasstub.js` already stubs CacheService/PropertiesService/Utilities/LockService/Session, but
  its fake sheet (built for the chunk-cache tests) does not obviously implement `getLastColumn`,
  `getSheetId` or `getParent`, all of which `getHeaders_`/`getSheet_` use.
- Therefore the harness needs either an extended `gasstub` sheet or its own fake workbook;
  `tools/verify/gasstub.js` is test-only and may be extended (report the diff if so).
- No harness code has been written. **This is the first action of the next session.**

---

## 4.1 Implementation records (step 1 onward)

### RV-1.1 — Fix the unresolved `uid` reference in `getValleyInvoiceForReturn_`
- Date / Commit: 2026-09-21 / **`815c6c7`** — one file, 6 insertions, 1 deletion. **No engine
  file, no flag, and no other handler was touched in that commit** (approval condition).
- Step: 1 (first action; DEC-1 option A).
- Files: `Company_ValleyFoods_Actions.js` — `invInfo` construction inside
  `getValleyInvoiceForReturn_` (was `:12591`, now `:12590-12596` plus the explanatory comment).
- What changed: `invInfo = { uid: uid, … }` → `invInfo = { uid: invUid, … }`, with a comment
  naming the defect and pointing at this ledger. `invUid` is the handler's own inbound invoice
  identity and the value the row was located by, so the field now carries the intended value.
- Why: the identifier `uid` is declared nowhere in that function; the statement threw a
  `ReferenceError`, the surrounding `try { … } catch (e) {}` swallowed it, `invInfo` stayed
  `null`, and the handler fell through to its existing fallback
  `invoice: invInfo || { uid: invUid, number: '-' }`. The returns banner therefore rendered
  three dashes for number, client and date on **every** invoice, always.
- **Intentional defect correction — NOT legacy equivalence** (owner-approved, DEC-1). This
  record deliberately does not claim a zero-diff result: producing the previously-missing data
  *is* the change.
- Expected contract after the fix — found-invoice case:
  | field | value |
  |---|---|
  | `uid` | the inbound `invUid` (the `invoice_unique_id` the row was found by) |
  | `number` | the invoice header `رقم الفاتورة`, as a trimmed string (`''` when blank) |
  | `client_name` | the invoice header `اسم العميل`, as a trimmed string (`''` when blank) |
  | `date_display` | `dd/MM/yyyy` from the header `تاريخ الفاتورة`, or `'-'` when blank/unparseable |
- Expected contract — missing-invoice case: unchanged. `invInfo` stays `null` and the handler
  returns `invoice: { uid: invUid, number: '-' }`; the banner shows `-` for number, client and
  date, exactly as it does today for every invoice. The fix does not alter this path.
- Client consumption confirmed: `Company_ValleyFoods_SalesReturns.html:176-196` reads
  `res.invoice.number`, `res.invoice.client_name` and `res.invoice.date_display` in the green
  invoice banner; it also reads `res.invoice` nowhere else.
- Scope audit: the same defect exists **nowhere else**. A repo-wide search for the pattern
  returns one real instance (the one fixed) plus two `batch_uid: uid` field assignments whose
  `uid` is a genuine local, and one `uid: uid` in `getValleyMfgClientReport_` where
  `var uid = String(r.unique_id …)` is declared immediately above it.
- Flag state before → after: none involved. **No flag exists for this change and none was
  added** (approval condition: no engine or flag changes in the same commit).
- Behaviour if reverted: `git revert 815c6c7` restores the silent failure — three dashes in
  the returns banner. Nothing else changes; no data or schema is affected.
- Retraction recipe: L2 only: `git revert 815c6c7`. L1 does not apply (no flag). L3 does not
  apply (this path reads no cache of its own beyond the existing `vfFindRowByUid_` index,
  which is unaffected).
- Metrics observed: n/a — the handler is not on a measured hot path; the change is a
  correctness fix, not a performance change.
- **Approval condition — evidence**: a VM harness is **NOT RUN**. No VM scaffolding exists for
  VF server actions (`tools/verify/gasstub.js` loads `Code.js` only; `s11_sales_returns.js` is
  a page harness), and building it is a separate deliverable. Partial evidence is the
  executable contract guard in §5 (TR-10, TR-11). **Because the required VM/staging evidence is
  outstanding, RV-1.1 is applied but this record is not closed and step 1 remains IN PROGRESS
  (G9).**
- Residual risk (what this does NOT prove): that the handler executes without error at
  runtime — the guard proves the source no longer contains the unresolved reference and that
  the field contract matches the client, not that the Apps Script runtime agrees. It also does
  not prove the invoice header columns hold the expected values on live data. Both are the
  remaining VM/staging evidence.
- Test runs: TR-10 (guard passes on the fixed source), TR-11 (guard fails on the pre-fix
  source, i.e. the guard catches the defect it exists for).

### RV-1.2 — VM harness for VF server actions; RV-1.1 closed with executable evidence
- Date / Commit: 2026-09-21 / identified by message — `feat(rv-1): VM action harness and
  RV-1.1 runtime regression test` (the RV-0.3 pattern: a record cannot contain its own SHA).
- Step: 1 (harness, the step's first remaining action per the RV-0.6 carried-forward note).
- Files (with line anchors):
  - `tools/verify/vf_workbook_stub.js` (new) — fake workbook, sheets, ranges, A1 parsing and
    the `Sheets.Spreadsheets.Values.batchGet/batchUpdate` and
    `Sheets.Spreadsheets.batchUpdate` surfaces; every read/write/metadata/API call counted.
  - `tools/verify/vf_action_harness.js` (new) — loads `Code.js` + `Core_FastSave.js` +
    `Company_ValleyFoods_Actions.js` into one VM, seeds fixtures, dispatches through the
    module's own `ValleyFoods.dispatch_` (`Company_ValleyFoods_Actions.js:504`).
  - `tools/verify/gasstub.js` — extended only: `opts.sources` (extra sources, absolute paths
    allowed), `opts.workbook` (when given, the REAL `getSheet_`/`getHeaders_`/
    `getAllRecords_`/`countSheetRead_` run instead of the legacy fixture leaves), a
    `waitLock` on the lock stub, and a `Logger` stub. Default behaviour with no options is
    unchanged.
  - `tools/verify/rv11_vm_invoice_return.js` (new) — the RV-1.1 defect regression test.
  - `READ_VIEW_MODULARIZATION_RESULTS.md` (this record, RV-1.3, TR-12…TR-14).
- What changed (behaviour terms): none, in production. A test-only harness now *executes*
  a VF server action — real header resolution, real `getRange` reads, real record building,
  real `getSheet_`/`getAllRecords_` — against fixture rows in-process, with no spreadsheet,
  no network and no production data. With it, `get_valley_invoice_for_return` was executed
  for both the found-invoice and missing-invoice cases.
- Why: plan §7.5 (D6) makes executable evidence the standard for chunk publication, stamp
  races, filtering, type fidelity and permission boundaries; RV-0.6 recorded that no harness
  for VF server actions existed and that building it is the first action of step 1.
- Flag state before → after: not applicable — no flag, no engine, no production source.
- Behaviour if reverted: L2 only. `git revert <sha>` deletes the harness and the test; nothing
  in the running system changes either way.
- Retraction recipe: L2 only: `git revert <sha>` (resolved by the commit-message grep above).
  L1 not applicable. L3 not applicable (the harness's cache is in-process).
- Metrics observed (with baseline): harness-only counters, no business metric. The RV-1.1
  runs reported workbook value-reads and the project's own `getSheetsReadCount_() > 0`, which
  is what "the handler really ran" means here. Baseline for steps 3-7 is unchanged by this
  record.
- Residual risk (what this does NOT prove):
  - It runs fixtures, not live data: it cannot show that the live invoice header columns hold
    the expected values, nor that the live dispatch entry (`executeCompanyAction_`) reaches
    the handler with the same payload shape. **Staging/live evidence remains NOT RUN.**
  - The workbook stub is deliberately partial: formatting, protection, UI and the Advanced
    API's typed envelope are unimplemented and throw rather than approximate. A future
    harness that needs them must extend this file (reported as a diff when it does).
  - `noteMutation_` is a no-op in the harness, so no stamp is written; the harness therefore
    cannot yet prove stamp semantics (that is step 5's evidence, on the real helpers).
- Test runs: TR-12, TR-13, TR-14.
- **RV-1.1 closure**: the RV-1.1 record's approval condition ("a VM harness is **NOT RUN**")
  is now satisfied in its VM half. The handler executes and both cases assert against the
  canonical contract; the "VM/staging NOT RUN" caveat is therefore dropped **for the VM part
  only**, and RV-1.1 is closed. Staging/live execution was not performed and is recorded as
  NOT RUN in TR-12's "not covered" field.

### RV-1.3 — Correction to RV-1.1's `number` field description (append-only)
- Date / Commit: 2026-09-21 / same commit as RV-1.2 (message-identified above).
- Step: 1.
- Files: `READ_VIEW_MODULARIZATION_RESULTS.md` (this record only).
- What changed: RV-1.1's contract table described `number` as "the invoice header
  `رقم الفاتورة`, **as a trimmed string**". The committed code is
  `String(s['رقم الفاتورة'] || '')` — it does **not** trim. The VM run made the difference
  observable (a padded fixture value came back padded), so the frozen contract is the
  **verbatim header value**, and RV-1.1's word "trimmed" is corrected here rather than by
  re-editing a completed record or by making a second unapproved edit to a legacy handler.
- Why: ledger §2 rule — completed records are immutable; corrections are appended and
  reference the old record. Making the code trim would be a new behaviour change to a legacy
  handler, which needs its own approval outside this programme (§3.1 rule 4).
- Flag state before → after: not applicable.
- Behaviour if reverted: no runtime effect — documentation correction only.
- Retraction recipe: L2 only (same commit as RV-1.2).
- Metrics observed: n/a.
- Residual risk: whether the returns page *should* trim is a product question left open; it
  is not a correctness defect (the value displayed is exactly the cell's value).
- Test runs: TR-12 asserts the verbatim behaviour explicitly.

### RV-1.4 — Canonical response contracts frozen for the migrated Sales endpoints
- Date / Commit: 2026-09-21 / identified by message — `feat(rv-1): freeze canonical Sales
  response contracts (step 1)`.
- Step: 1 (second action: the DTO contracts; RV-1.1 is closed by RV-1.2, the harness by
  RV-1.2/TR-14).
- Files (with line anchors):
  - `Company_ValleyFoods_Actions.js` — top-level `VF_SALES_VIEW_CONTRACTS_` +
    `vfViewContract_(name)`, inserted after `vfRefsCached_` (was `:44-46`); **no caller
    anywhere**, no flag, no behaviour change. The table names business fields, which is why
    it lives in the module and not in the engine (plan §3.1 generic-core rule).
  - `tools/verify/sales_response_contracts.js` (new) — executes every contract against the
    real legacy handler in the VM harness.
  - `READ_VIEW_MODULARIZATION_RESULTS.md` (this record, TR-15).
- What changed (behaviour terms): nothing at runtime. A declared, ordered field whitelist per
  migrated endpoint now exists, together with an executable proof that the current legacy
  responses match it. This is the basis plan §6.1 requires: shadow compare projects the
  legacy and the modern response through the *same* contract before diffing, so a diff is a
  real difference and not a projection artefact.
- Why: plan §7 step 1 (freeze contracts); §6.1 (both readers served through one contract);
  §7.5 (executable verification).
- Flag state before → after: no flag is involved and none was added. All existing flags
  (`FAST_SAVE_CORE_`, the four `*_BATCH_WRITES_`) remain `false`; the read/view flags still do
  not exist (introduced in steps 2/3/6).
- Behaviour if reverted: L2 only. `git revert <sha>` — the table disappears and the test with
  it; nothing in the running system changes.
- Retraction recipe: L2 only (commit-message grep above). L1 not applicable (no flag). L3 not
  applicable (no cache).
- Metrics observed (with baseline): none — this is a contract declaration plus an executable
  conformance check. `bytesOut` baselines are recorded here for the later ≥40 % target:
  measured by `tools/verify/sales_response_contracts.js` on its fixtures (see TR-15), not from
  production.
- Residual risk (what this does NOT prove):
  - The contracts were derived from source plus client-consumption inspection (below), not
    from live responses. A live invoice whose cells hold a shape the fixtures do not cover
    (a string date, a null, a duplicated header) could still behave differently; the union
    types declare where that is possible.
  - Producer ≠ grader: this record and the test were written by the same author. The test
    asserts the *contract*, and it is the contract itself that a reviewer must check against
    the pages — the field-by-field client evidence is quoted below for that purpose.
  - It does not bind the future readers: it only declares what "equal" will mean when they are
    compared (step 3/4).

**Frozen contracts (field list, types, nullability, date representation).** `string` means a
JS string; `number` a finite number; `Date` the server-side object (`jsonSafe_`, `Code.js:6528`,
serialises it to an ISO-8601 UTC string on the wire); the client's own `fmtDate` accepts either.

`vf_invoice_for_return_v1` — `get_valley_invoice_for_return`:

| Field | Type | Nullability / rules | Client evidence |
|---|---|---|---|
| `status` | string | always `'success'` | `Company_ValleyFoods_SalesReturns.html:176-196` |
| `invoice` | object | present; **found case** `{uid, number, client_name, date_display}`; **missing case** `{uid, number: '-'}` (client_name/date_display absent) | reads `.number`, `.client_name`, `.date_display`; falls back to `'-'` per field |
| `invoice.uid` | string | always | not read by the client |
| `invoice.number` | string | the trimmed-header cell **verbatim** (`String(cell \|\| '')`); `'-'` in the missing case (see RV-1.3) | banner |
| `invoice.client_name` | string | as above; absent when the invoice is missing | banner |
| `invoice.date_display` | string | `dd/MM/yyyy` from the header date, `'-'` when blank/unparseable; absent when the invoice is missing | banner |
| `lines` | array | always (empty when nothing matches) | not read by this page (it re-reads via the list) |
| `lines[].line_uid` | string | trimmed `unique_id` | — |
| `lines[].product_name` | string | `valley_products.name_ar` by `product_id`, else the raw `product_id` | — |
| `lines[].details` | string | `product_details` or `''` | — |
| `lines[].price` / `sold_qty` / `returned_qty` / `returnable` | number | `Number(…) \|\| 0`; `returnable = max(0, sold − returned)` | — |

`vf_invoices_list_v1` — `get_valley_sales_list` (and the same row shape inside
`vf_sales_page_v1`):

| Field | Type | Nullability / rules | Client evidence |
|---|---|---|---|
| `status` / `total` | string / integer | `total` = rows matching the date filter, **before** offset/limit | `Company_ValleyFoods_Sales.html:128` paging, `:198-204` cells |
| `invoices[].invoice_unique_id` | string | raw cell (trimmed by the reader's key handling only at match time) | returns page selector `Company_ValleyFoods_SalesReturns.html:113-114` |
| `invoices[]['رقم الفاتورة']` | string | raw cell | `Sales.html:199` |
| `invoices[]['اسم العميل']` | string | raw cell — a client **id**, resolved through the parties bundle | `Sales.html:200` via `partyLabel` |
| `invoices[]['تاريخ الفاتورة']` | Date | **server-side Date object**; ISO string on the wire; a text cell stays text | `Sales.html:201` `fmtDate` |
| `invoices[]['المبلغ الصافي']`, `['قيمة الضريبة']`, `['إجمالي']` | number | `Number(…) \|\| 0` | `Sales.html:202-204` |
| `invoices[].tax_system` | string | `String(cell \|\| '').trim().toLowerCase()` — `'true'` for a TRUE cell, **`''` for a FALSE cell** (`false \|\| ''` is `''`); the client only tests for `'true'` | `Sales.html:321` |
| `invoices[].approval_status` | string | defaulted to `'Pending'` when the cell is blank; `'Approved'` gates the edit/delete affordances | `Sales.html:190` |
| `invoices[]['مسلسل']` | integer | 1-based index over the **unfiltered, pre-paging** sheet order | `Sales.html:198` |

`vf_sales_page_v1` — `get_valley_sales_page` = the list above **plus** the bootstrap bundle:

| Field | Type | Nullability / rules |
|---|---|---|
| `parties[]` | array of `{value, label, tax_id, address, phone}` | `value`/`label` strings; `tax_id`/`address`/`phone` are the cell value or `''`; rows with a blank `value` are dropped |
| `products[]` | array of `{value, label}` | sellable products only (asset types excluded), sorted by Arabic label |
| `enums` | object of the five declared option arrays | `class_*` are `{value: number, label: string}`; `line_tax` is an array of numbers |

`vf_invoice_full_v1` — `get_valley_invoice_full`:

| Field | Type | Nullability / rules | Client evidence |
|---|---|---|---|
| `invoice` | object | **lossless over the header row**: every column of `valley_sales_invoices`, keyed by its trimmed header name, in sheet column order (`invoice: '*'` in the table). A missing invoice is a thrown error, never a null invoice | `Sales.html:244`, `:320-327` (a named subset) |
| `lines[].unique_id` | string | — | `Sales.html:247` |
| `lines[].product_id` | string \| number | cell value; `''` when the cell is null/undefined | `Sales.html:248` `String(...)` |
| `lines[].product_name` | string | `valley_products.name_ar` by `product_id`, else `''` | not read by the page (it renders from the product bundle) |
| `lines[].product_details` | string | `''` when blank | `Sales.html:249` |
| `lines[].product_tax` / `product_qty` / `product_price` | number | `Number(…) \|\| 0` | `Sales.html:250-252` |
| `lines[].allocations` | array | **always an array**, empty when none | `Sales.html:259` |
| `allocations[].alloc_uid` / `batch_uid` / `lot` | string | trimmed; `alloc_uid` deliberately not carried by the client | `Sales.html:256-261` |
| `allocations[].qty` | number | `Number(…) \|\| 0` | `Sales.html:260` |

**Frozen precondition (not part of the DTO).** `get_valley_sales_list` and
`get_valley_returns_list` call `settingsEnsureSheet_` before reading
(`Company_ValleyFoods_Actions.js:4175`), which can **add missing canonical columns** and
`insertSheet` when the tab is absent. Today those tabs exist, so it is a metadata-only no-op —
but a migrated reader that skips it changes behaviour if a tab is ever missing, and the
difference is invisible to a shadow compare of response bodies. The migration must call it
exactly as the legacy path does (steps 3-4), and this is recorded here so that omission is a
review finding rather than a surprise.

- Test runs: TR-15.

---

## 5. Test-run records

### TR-1 — Read-pattern census across all JS files
- When: 2026-09-21
- Environment: production source, read-only
- Command: `rg -c "<pattern>" <file>` for `getDataRange(`, `getAllRecords_(`,
  `getReadOnlyRecords_(`, `getRecordsByPk_(`, `indexById(`, `CacheService.getScriptCache()`,
  `.getRange(`, `noteTableChange_(`, `readTableVersions_(` across the six JS files
- Purpose: quantify the read mechanism mix (plan §4.1)
- Result: PASS — 475 `getAllRecords_` sites, 74 `getDataRange()`, 17 index uses, 69 cache uses
- Evidence: plan §4.1 table; command output captured in session
- Not covered: per-call cost; whether any given site is on a hot path

### TR-2 — Per-function attribution of full-table reads
- When: 2026-09-21
- Environment: production source, read-only
- Command: PowerShell scan walking backwards from each match to the enclosing `function`
- Purpose: identify the top read handlers (plan §4.3)
- Result: PASS — ranked list produced (`getValleyInvoiceForReturn_` 6 … )
- Evidence: plan §4.3 table
- Not covered: call frequency; a handler can be heavy but rarely used

### TR-3 — Client RPC fan-out census
- When: 2026-09-21
- Environment: production source, read-only
- Command: `rg -o "companyCall\('[a-z0-9_]+'" <page>.html` over the 14 largest root pages
- Purpose: count distinct actions and total calls per page (plan §4.2)
- Result: PASS — Attendance 13/15, MfgOrders 12/15, MfgOrderView 8/10, Sales 7/9 …
- Evidence: plan §4.2 table
- Not covered: dynamic action names built at runtime; conditional calls

### TR-4 — Anchor verification for every citation in the plan
- When: 2026-09-21
- Environment: production source, read-only
- Command: `Select-String -Pattern "<function>" Code.js, Company_ValleyFoods_Actions.js`
- Purpose: ensure the plan cites current line numbers after prior edits shifted them
- Result: PASS — `maxIdOf_` Code.js:881, `readTableVersions_` :854, `putChunkedCache_` :1702,
  `getChunkedCache_` :1736, `getReadOnlyRecords_` :1159, `jsonSafe_` :6528,
  `perfRecordRequest_` :6060, `vfFindRowByUid_` :9126, `vfRefsCached_` :44 …
- Evidence: plan §4, §5 citations
- Not covered: anchors drift again with the next edit; re-verify per record

### TR-5 — Cache/stamp language verification
- When: 2026-09-21
- Environment: production source, read-only
- Command: read `Code.js:806-826`; list `tools/verify/optimization_chunk_cache.js`,
  `optimization_reads.js`, `rt3_stamp_coverage.js`
- Purpose: confirm the review's finding that stamps are best-effort and that executable
  harnesses already exist (plan §4.6, §7.5)
- Result: PASS — code states stamps can be evicted before TTL and are "a hint to refetch";
  the three harnesses exist (9 591 / 24 061 / 7 941 bytes)
- Evidence: plan §4.6, §7.5
- Not covered: whether those harnesses still pass; they were not executed

### TR-6 — `uid: uid` anomaly verification
- When: 2026-09-21
- Environment: production source, read-only
- Command: `rg -n "uid: uid" Company_ValleyFoods_Actions.js` then a scoped scan of
  `getValleyInvoiceForReturn_` (lines 12542-12662) for any `uid` declaration/assignment
- Purpose: verify the review's claim that the Sales return baseline is broken
- Result: PASS (claim confirmed) — four sites; inside the function the assignment at
  `:12591` is inside `try { … } catch (e) {}` with **no** `uid` declaration anywhere in the
  function body, so the reference throws and `invInfo` remains `null`
- Evidence: plan §4.6 and §9 item 1
- Not covered: whether `invInfo === null` is actually harmful downstream; that needs a
  call-path review of the return page (Step 1 work)

### TR-7 — Plan self-check for withdrawn claims
- When: 2026-09-21
- Environment: local document, read-only
- Command: `rg -n -i "~100 rows|guaranteed identical|4\.5 MB|50 chunks|1-in-50|eviction observed|deferred section" Plan_Read_View_Modularization.md`
- Purpose: ensure no Rev 1 claim survives as an assertion
- Result: PASS — every hit is either the Rev 1 closure table (§0), an explicit prohibition,
  or a "removed from this phase" statement
- Evidence: `9abd764`
- Not covered: prose claims that paraphrase a withdrawn idea without those exact phrases

### TR-8 — Repository inventory for traceability
- When: 2026-09-21
- Environment: local git, read-only
- Command: `git log --oneline -10`; `git show --name-only --format="" <sha>`
- Purpose: record the commit inventory used in §6
- Result: PASS — 10 commits listed with their touched files
- Evidence: §6 table
- Not covered: n/a

### TR-9 — Rev 3 consistency check
- When: 2026-09-21
- Environment: local document, read-only
- Command: `rg -n "DEC-1|DEC-2|DEC-3|DEC-4|FR_DEADLINE_MS_|Plan_MFG_Read_Design|1-in-50|production sampling|Open decisions" Plan_Read_View_Modularization.md`
- Purpose: confirm every decision is present where it must be, and that no withdrawn clause
  survives as an instruction
- Result: PASS — the four DEC rows exist in §1.1 and are referenced from §3.2 (G1, G2), §7
  (steps 1 and 7) and §9; `FR_DEADLINE_MS_ = 120000` appears in §1.1 and G1; the MFG sub-plan
  name appears in §1.1, §7 and §9; the only surviving mentions of `1-in-50` / production
  sampling are in the §0 closure table (quoting the rejected Rev 1 text) and in §1.1/§3.2 G2
  as explicit deletions
- Evidence: this commit; `node --check` is not applicable (Markdown)
- Not covered: it cannot prove the implementation will honour the decisions — that is the
  per-step Change Record's job (G9)

### TR-10 — RV-1.1 contract regression guard (fixed source)
- When: 2026-09-21
- Environment: local source, **executable** node script (no data, no VM, no writes)
- Command: `node tools/verify/rv11_invoice_return_contract.js`
- Purpose: prove the fix is present and the server/client field contract holds
- Result: **PASS** — 63-line server region; fields asserted `uid, number, client_name,
  date_display`; client fields asserted `number, client_name, date_display`
- Evidence: commit `815c6c7` + the guard file (added in the same commit as this record)
- Not covered: it does not execute the handler. It is a static contract guard, explicitly not
  a VM harness — the VM/staging condition of RV-1.1 remains NOT RUN

### TR-11 — RV-1.1 guard proven to catch the defect ("test the test")
- When: 2026-09-21
- Environment: local source, executable; the pre-fix source was exported to a temp path — **no
  repository file was modified to run this**
- Command:
  `git show "815c6c7^:Company_ValleyFoods_Actions.js" > <temp>/rv11_old_vf.js` then
  `RV11_SERVER=<temp>/rv11_old_vf.js node tools/verify/rv11_invoice_return_contract.js`
- Purpose: prove the guard fails on the defective source, so TR-10's PASS means something
- Result: **PASS (guard behaved correctly)** — assertion
  `RV-1.1 regression: 'uid: uid,' (an unresolved reference) is present again`, exit code 1
- Evidence: this record; exit code 1 observed against the pre-fix file
- Not covered: it proves the guard detects this specific defect, not that it detects other
  future server/client contract drifts (the other assertions in the guard cover those
  individually)

### TR-12 — RV-1.1 defect regression, VM execution (found + missing invoice)
- When: 2026-09-21
- Environment: VM harness (no data) — `vf_action_harness.js` + `vf_workbook_stub.js`
- Command: `node tools/verify/rv11_vm_invoice_return.js`
- Purpose (claim under test): after the RV-1.1 fix, `get_valley_invoice_for_return` — executed
  through the module's own dispatcher — returns all four invoice fields populated for a found
  invoice, and degrades to `{ uid, number: '-' }` with its lines intact for a missing invoice.
- Result: **PASS** — exit 0, `rv11_vm_invoice_return: PASS`. Asserted: `uid` = inbound
  identity; `number` = header value **verbatim** (see RV-1.3); `client_name` from the header
  row; `date_display` `dd/MM/yyyy`; per-line `sold_qty`/`returned_qty`/`returnable` and the
  product-name join; the missing-invoice fallback has exactly two fields and an empty line
  set; workbook value-reads and `getSheetsReadCount_()` both advanced, so the handler really
  executed rather than being inspected; unknown actions and an empty invoice id are refused by
  the real code paths.
- Evidence: `tools/verify/rv11_vm_invoice_return.js`; this record; exit code 0 observed.
- Not covered: live data. The run uses invented fixture rows, so it does not establish that
  the live invoice header columns hold the expected values, nor that the production request
  entry reaches dispatch with the same payload shape. **Staging and production remain NOT RUN.**

### TR-13 — RV-1.1 VM test proven to catch the defect ("test the test")
- When: 2026-09-21
- Environment: VM harness (no data); the pre-fix module was exported to a temp path with
  `git show 815c6c7^:Company_ValleyFoods_Actions.js` — **no repository file was modified**
- Command: `$env:RV11_SERVER=<temp>\rv11_old_vf.js; node tools/verify/rv11_vm_invoice_return.js`
  (PowerShell; the env var is the harness seam described in RV-1.2)
- Purpose (claim under test): prove that TR-12's PASS is meaningful — the same assertions must
  fail against the defective source, and fail *at the defect* (the fallback dash), not for an
  unrelated reason.
- Result: **PASS** — exit 1 with
  `AssertionError: number is the header value, verbatim — actual '-', expected <the padded fixture value>`,
  i.e. the pre-fix handler returned the `{ uid, number: '-' }` fallback because `invInfo` was
  never populated. This is exactly the production anomaly RV-1.1 describes, observed at runtime.
- Evidence: this record; exit code 1 observed against the pre-fix file.
- Not covered: it proves the harness and these assertions detect this defect, not that they
  detect other future contract drift (the remaining assertions in the test cover their own
  fields individually).

### TR-14 — Backward compatibility of the extended `gasstub.js`
- When: 2026-09-21
- Environment: VM harness (no data)
- Command: `node tools/verify/s16_realtime_authority.js`, `node tools/verify/js_simplification_snapshot.js`,
  `node tools/verify/rv11_invoice_return_contract.js`
- Purpose (claim under test): the `gasstub.js` extension (optional `opts.sources` /
  `opts.workbook`, `waitLock`, `Logger`) must not change behaviour for its existing three
  consumers.
- Result: **PASS** — all three exit 0. (An intermediate state during the edit did fail
  `s16_realtime_authority` on four assertions — the non-workbook fixture helpers had been
  dropped when the overrides were re-scoped; this was caught by this run, fixed by restoring
  the helpers inside the `if (!opts.workbook)` branch, and the run repeated.)
- Evidence: exit codes 0/0/0 observed; this record.
- Not covered: the rest of `tools/verify/*` was not executed (only the three files that
  `require` gasstub). New harnesses for steps 2-7 must be run on their own record.

### TR-15 — Frozen Sales response contracts executed against the legacy handlers
- When: 2026-09-21
- Environment: VM harness (no data)
- Command: `node tools/verify/sales_response_contracts.js`
- Purpose (claim under test): `VF_SALES_VIEW_CONTRACTS_` (RV-1.4) describes the **real**
  responses of the four Sales read endpoints — top-level keys, nested keys, types, the
  nullability/presence rules and the date representation — so the contract can be the basis
  shadow compare projects both readers through.
- Result: **PASS** — exit 0, `sales_response_contracts: PASS`. Asserted for
  `get_valley_sales_list`, `get_valley_sales_page`, `get_valley_invoice_full` and
  `get_valley_invoice_for_return`: exact key sets at every level (an undeclared field fails
  the run), the empty-`allocations`-never-undefined rule, the `approval_status → 'Pending'`
  default, the `tax_system` TRUE → `'true'` / FALSE → `''` rule, `مسلسل` 1-based over
  unfiltered sheet order, `total` = filtered count
  before paging, `تاريخ الفاتورة` as a server-side `Date`, and the missing-invoice fallback as
  a two-field object. Two earlier runs failed and are part of the evidence: the first on
  cross-realm array comparison in the test helper (test defect, fixed), the second on the
  `tax_system` assertion — the fixture proved that a FALSE cell yields `''`, not `'false'`,
  so the contract was corrected rather than the code.
- Evidence: `tools/verify/sales_response_contracts.js`; exit code 0 observed.
- Not covered: live data (fixtures again); the client-consumption quotes in RV-1.4 were read
  from the page sources, not executed in a browser; and the contract does not yet bind any
  reader — steps 3/4 must project through it.

---

## 6. Cross-reference — write-side programme (pre-G9, summarised)

Recorded here so the whole read+write programme is traceable from one file. These commits
predate G9 and therefore have no Change Records; the runbook and status for them live in
`FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` §7.1-7.2.

| Commit | Files | Flag state | Retraction |
|---|---|---|---|
| `a5f51db` | pre-migration backup (193 files) | n/a | **historical comparison point only** — inspect with `git diff a5f51db -- <path>` or `git show a5f51db:<path>`. It is *not* a recommended `git reset --hard` target: a hard reset would discard every later commit, including the read/view work |
| `2014df1` | `Core_FastSave.js` | `FAST_SAVE_CORE_` false | L2 revert |
| `f439f58` | `Core_FastSave.js`, `Company_ValleyFoods_Actions.js` | all false | L1/L2 |
| `869443b` | `Company_ValleyFoods_Actions.js`, `Core_FastSave.js` | all false | L1/L2 |
| `4e4877e` | `Company_ValleyFoods_Actions.js`, `Core_FastSave.js` | all false | L1/L2 |
| `e4a2f0f` | `Company_ValleyFoods_Actions.js` | all false | L1/L2 |
| `2dd89a1`, `567dd19` | `FAST_SAVE_ENGINE_MULTI_MODULE_EXECUTION_PLAN.md` | n/a | L2 |

**Reverting the write-side engine code** (newest first, so each revert applies cleanly and no
documentation commit is touched):

```
git revert e4a2f0f 4e4877e 869443b f439f58 2014df1
```

This restores the pre-engine source state. The flags being `false` already means the legacy
path is what runs today, so the revert is almost never necessary — it exists so the option is
unambiguous. The two documentation commits (`2dd89a1`, `567dd19`) are deliberately **not** in
the list.

**Verification already performed on the write side** (recorded here for completeness, from the
session that delivered it): `node --check` PASS on `Core_FastSave.js`, `Code.js` and
`Company_ValleyFoods_Actions.js`; decoupling gate PASS (0 hits for every module token,
`getDataRange`, `appendRow(`, `deleteRow(`); no staging or production execution of any save
was performed. Runtime acceptance for the write side remains **NOT RUN** pending the owner
runbook.
