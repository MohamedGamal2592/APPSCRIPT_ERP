# ERP Gap-Closure Report — All Phases — 18/09/2026

**Source plan:** `ERP_GAP_CLOSURE_PLAN_18_09_2026.md`
**Audit basis:** `ERP_APPSCRIPT_ANALYSIS_18_09_2026.md`
**Method:** static edits + code-trace verification only. No tests, no live execution, no data changes, no migrations/backfills, existing files only.

**Overall:** Phase 1 Done, Phases 2–6 Partial (all functional cores landed; residual gaps listed per phase). Zero Blocked.

---

## Phase 1 — Money-safety: numbering & concurrency — Done

**Status: Done** (close-out converted last 4 admin writes; zero live `updateRowByCriteria_` remain)

- Shared counter: `02_DataAccess.js:nextDocumentNumber_:474` — `PropertiesService doc_seq_<dbId>_<docType>_<year>[_tax]`, `seedScanner` fallback, throws unless `_scriptLockHeld_` (`executeWithLock_:441`).
- Delegates (format `seq-year` unchanged):
  - `Company_TopLight_Actions.js:nextInvoiceNumber_:2032` (`tl_sales`)
  - `Company_TopChemical_Actions.js:nextInvoiceNumber_:3549` (`tc_legal_inv`)
  - `Company_ValleyFoods_Actions.js:nextInvoiceSeq_:9564` (`vf_sales_inv` + taxSystem)
- Locked call sites: `TopLight:addSales_:1511`, `editSales_:1564` (fallback inside lock), `TopChemical:addLegalInvoice_:4190>4192`, `Valley:saveValleyInvoice_:9741>9754`.
- Version helpers: `02_DataAccess.js:getRowVersion_:983` / `checkRowVersion_:995` (missing→0, mismatch throws `CONFLICT: stale version`). Enforced centrally `saveRecordWithAudit_:2113`, `approveRecordWithAudit_:2160` + handlers (`TC:3953,4116,4506`, `TL:1585`, `VF:5150,5969,7013,9790`).
- Patch default: all company writes now `patchRowByCriteria_`; `05_Admin.js:adminSaveMatrix_/adminSavePages_/adminSaveInvoice_`, `99_AuditTools.js:deactivateAuditTestUser_` converted. Zero live `updateRowByCriteria_` (def only).
- Residual note: TL purchasing edit has version only via central saver, no explicit per-handler `checkRowVersion_` line (covered centrally).

## Phase 2 — Correctness: transitions & validation — Partial

**Status: Partial** (cores landed; 3 small gaps)

- `02_DataAccess.js:DOC_STATUS_TRANSITIONS:2342` (15 keys: `tl_purchasing/sales/offer` Pending→Approved; `tl_cash` false→true; `tc_legal_cash` toggle; `vf_purchasing` + edit pseudo-target; `vf_mfg_order` Draft→In Progress→Locked; `vf_mfg_agree` draft/active/completed/cancelled; `vf_sales_inv` Pending↔Approved + delete; `att_batch` active→reverted; `payroll_month` open→closed) + `canTransition:2380` (fail-closed) + `assertTransition_:2395`.
- Handlers call gate: `TL:940,1654,2387,3088`, `TC:4505,3473`, `VF:5141-5142,5181-5182,5515,5527,5964,6052,7011,10242,10268`. Scattered `if(cur!==…)` deleted.
- `validateBeforeWrite:2458` + `DOC_ACTION_TO_DOCTYPE_:2412` + `STATUS_ONLY_ACTIONS_:2429` + `DOC_VALIDATORS_:2439` wired at `Code.js:executeCompanyAction_:759` + `TC:dispatch_:403`, `TL:dispatch_:97`, `VF:dispatch_:462`. Registered: `TL:4115-4118`, `TC:6075`, `VF:10890` (delegates to existing validators, no logic duplicated).
- Gaps: (1) `VF:5952` probes table directly not via `canTransition`; (2) `VF:9782` inline Approved-immutable guard remains; (3) many docTypes pass-through (`return true`) + status-only actions skip field validation by design.

## Phase 3 — Security integrity — Partial

**Status: Partial** (1 gap: TL authorize not wired)

- Fail-closed guards Done: `TC:guard_:378`, `TL:guard_:72`, `VF:guard_:438` (`if(!req) throw`); `tc_box_analysis` hole closed (actions `165-170` listed); Assessment ported.
- Central dbId: `03_Security.js:assertDbIdBelongsToCompany_:674` + `resolveDbId_:680`; used `Code.js:executeCompanyAction_:749` before any sheet read.
- Double-check: `TC:authorize_:391→dispatch_:399`, `VF:authorize_:450→458`, `Assessment:187→195` Done.
- Gap: `TL:authorize_:87` defined but `TL:dispatch_:90` never calls it — TL path single-layer until wired (one-line fix).

## Phase 4 — Performance: indexing & cache — Partial

**Status: Partial** (existence checks indexed; residual single-row scans remain)

- `02_DataAccess.js:indexById:1218` (Map, trimmed+lowercased, first-wins) + `getRecordsByPk_:1241` wrapper + usage contract `1208-1212`.
- Converted: `TL:editProduct:494, editParty:611`, `TC:saveClient:962, saveProduct:1192, legalParties:3665`, `VF:saveValleyInvoice_:9624,9634`, `Code.js:1311,1575,1661`.
- Cache contract `02_DataAccess.js:1079-1094` (`refs_<dbId>_<kind>_v<stamp>`, TTL 600s) + `invalidateRefsCache_:1270`; `TL:bumpTlRefsVersion_:1894`, `TC:bumpTcRefsVersion_:492`, `VF:bumpVfRefsVersion_:40` on all writes (TC missing three added `976-978,1007-1009,1214-1215,3673-3674`).
- Gaps: version/transition single-row fetches still `getAllRecords_().find()` (`TC:3952`, `TL:939,1584`); `VF:9777` full scan for `rowNum`.

## Phase 5 — Consistency: totals & audit — Partial

**Status: Partial**

- Shared totals: `02_DataAccess.js:sharedNum0_:1427`, `calcLineNet_:1432`, `calcTotals_:1441`, `calcManufactureTotal_:1464`; wrappers `TC:num0_:420`, `VF:num0_:471` delegate. Used: `TL:computeSalesTotals_:2050`, `VF:saveValleyInvoice_:9652-9653,9671-9673`, `VF:5190,5753`, `TC:calcManufactureTotalCostJS_:3591` (formula builder `3572` relabelled display-only).
- `afterWrite_:1561` + `writeSystemLogLink_:1576/1584` (`RecordID=record_uid`, never throws) fanning from `saveRecordWithAudit_:2095,2136`, `approveRecordWithAudit_:2168`.
- Gaps: (1) `TC:addLegalInvoice_:4228-4235` still Sheet-formula net/tax + hardcodes net 0, no `calcTotals_` call; (2) most company handlers bypass shared saver with direct `logHistory_` (no SystemLog link) — left as compat per static-only rule.

## Phase 6 — Workflow-as-data & UI — Partial

**Status: Partial** (engine + dedupe landed; TC approvals + rollout deferred)

- `02_DataAccess.js:APPROVAL_CHAINS:2213` (6 rows) + `approveStep_:2254`/`requestApprove_:2239`/`getApprovalChain_:2233` (no docType if-chain, grep-verified). Callers: `TL:941,1655,2388,3089`, `VF:5516,5528` (thin wrappers preserving messages/version).
- Dedupe Done: `02_DataAccess.js:requestGuardExecute_:2301` + `Code.js:631,754`; `TC:2267,4210`, `TL:823,1523,2979` via `liveDedupeReply_`; Valley retained.
- UI examples: `Company_TopLight_Sales.html` selectable `sales-table` (dt-sel bulk) + `UIC.favouritesMenu('tl_sales')` (saved views beyond Cash).
- Deferred: TC approvers still direct patch (no `tc_*` chain rows); `APPROVAL_CHAINS` lives in code not sheet; `addLegalInvoice_` key-reuse needs schema; bulk/views rollout beyond one example list deferred.

---

## Files touched (existing only, no new modules)

`02_DataAccess.js`, `03_Security.js`, `Code.js`, `05_Admin.js`, `99_AuditTools.js`, `Company_TopChemical_Actions.js`, `Company_TopLight_Actions.js`, `Company_ValleyFoods_Actions.js`, `Company_Assessment_Actions.js`, `Company_TopLight_Sales.html`.

No tests written/run, no app executed, no rows touched, no backfills.
