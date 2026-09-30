# Live change notice per view + fast views — final report and owner runbook

Branch: **`claude/sweet-pascal-7vklph`** (fast-forwarded from `claude/eloquent-edison-vute9i`, which holds the plan; this session could only push to `claude/sweet-pascal-7vklph`). Plan: `Plan_Live_Change_Notice_Per_View.md`. Step log: `tools/liveviews/PROGRESS.md`.

## 1. What was built, per phase

| Phase | What | Files |
|---|---|---|
| P0 Inventory | Static scan of the 76 watched pages: watch id, the refresh passed to `arrive`, actions grouped by calling function (view hint), tables each action reads (depth ≤ 3), tabs/dialogs/print, Phase 5 writers. Views → tables with a reason next to every table (rule D2). Arabic label for every table. | `tools/liveviews/inventory.js`, `inventory.json`, `inventory.md`, `labels.md`, `view_decisions.json` (curated decisions), `label_overrides.json` (curated labels) |
| P1 Server | `_liveReqMeta_` (request id + caller, set/cleared by `apiRouter_`); `noteTableChange_` stores `{t, w:[{t,r,u,n,k}]}` (last 5 writers); `parseTableStamp_`; `pageVersionsReply_` (versions unchanged + `meta`, `views`, `labels`); `TABLE_LABELS` + `PAGE_VIEWS` in every company; every `getPageVersions_` is one call. | `Code.js`, `Company_{TopLight,TopChemical,ValleyFoods,Assessment}_Actions.js`, `Company_ErpTest_Actions.js` (via `tools/erptest/gen_actions.js` + `tools/erptest/live_views.inc.js`), `tools/liveviews/gen_page_views.js` |
| P2 Client core | Own requests (`markOwnRequest`, fed by the request guard); `setView`, current view, stale tables, in-view/off-view split; notice text per D4 with merge and × dismiss. | `UI_Components.html` (`UIC.Live`, `.uic-live-fresh-x` CSS), `Client_Helpers.html` (one line in the request guard) |
| P3 Page adoption | All 76 pages say which view is on screen: `setView('list')` after the watch; dialogs counted through `UIC.openModal`/`closeModal`; list ↔ form switches on TL/ET Sales, Purchasing, Sales_Offer, ET Manufacture and VF Purchasing; tabs on TC BudgetHR and VF HR_Emp; `report`/`detail` on the VF cash reports, MfgClientReport, MfgOrderView; `form` on AssessmentForm. | 70 `Company_*.html` + 6 generated ET pages (`tools/erptest/gen_pages.js`), `tools/liveviews/adopt_pages.js` |
| P4 Unwatched pages | **Skipped** (OD4 default). | — |
| P5 Record level | `noteRecordChange_`; Top Light write layer (and the generated Testing System one) records keys on create / patch / soft delete / delete-where; forms opened with `setView('form', {key, table})`; conflict notice «قام … بتعديل هذا السجل أثناء فتحه — أعد التحميل قبل الحفظ»; changes to other records do not interrupt the form. | `Code.js`, `Company_TopLight_Actions.js`, `Company_ErpTest_Actions.js`, TL/ET form pages, `UI_Components.html` |
| P6 Fast views | `UIC.Live.loadView` and `UIC.Live.viewCache` (companyCall wrapper): inert paint from the device, one `get_page_versions` (also the watch baseline) → live when stamps match and < 10 min, else one list call; exact per-table bust; own save drops the view's entry; 400 KB cap; OD7 opt-out list; `UIC.Live.VIEW_CACHE` switch; logout clears `erp_c_*`. `UIC.Cache` gains `peek`, `bustTables`, `clearPrefix` and a table list in its index (guarded storage and LRU unchanged). 72 page files adopted with one generated line. | `UI_Components.html`, 66 `Company_*.html` + 6 generated ET pages, `tools/liveviews/adopt_views.js` |
| P7 Wrap-up | This runbook; final verify. | `tools/liveviews/OWNER_RUNBOOK.md`, `final_verify.txt`, `compare_verify.js`, `check_scripts.js` |

## 2. What was verified

| Test | Result |
|---|---|
| `tools/verify/live_notice_server.js` (new, in `run_all.js`) | **38 PASS** — stamp carries request id + email via `apiRouter_`, meta cleared (also after a throw), 5 writers kept / 6th drops oldest, one entry per request, strictly increasing `t`, old numeric stamp parses, system writer, never throws, `get_page_versions` views/labels/union/`versions` shape/`now`, NOT_AUTHORIZED unchanged, seeded stamps, all 5 companies answer; P5 keys (cap, same request, system, meta, real `add_party`/`edit_party` on the workbook stub, TL = ET write layer). |
| `tools/verify/live_notice_client.js` (new) | **68 PASS** — plan matrix 1–10, seeded/system/several writers/escaping/dialog/list return/`loading`, request guard feeds `markOwnRequest`; P3 real pages per company (ET Sales, TL Sales, TC BudgetHR tabs, VF Purchasing + VF Sales dialog, AC Batches dialog); P5 conflict vs other record on TL and ET Sales. |
| `tools/verify/live_views_cache.js` (new) | **102 PASS** — P6 matrix 1–11 on ET Sales, TL Products, TC Products, VF Products, AC Assessments; 400 KB, OD7 page, `VIEW_CACHE=false`, inert safety timer, `loadView`. |
| `rt3_stamp_coverage`, `s13_forms_filters`, `s18_live_saves`, `s19_live_rollout`, `s20_quiet_refresh`, `erptest_clone_static`, `erptest_mfg_vm`, `erptest_parity_vm`, `erptest_write_vm`, `erptest_packs_client`, `request_guard`, `tl_sheetdb_contract`, `parse_pages`, `s0_modal_size`, `s23_page_params` | all **PASS** |
| `tools/liveviews/check_scripts.js` | 178 inline page scripts, **0** fail to compile |
| `npm run verify` | **head 33 of 126 failed vs baseline 33 of 123** (3 new checks, all pass). **New failures: none** — compared check by check (`compare_verify.js`) and line by line inside the 33 already-failing checks. |

Pre-existing failures (identical on the base commit): Company two-file deployment; Registration upload idempotency; Attachment identity; AppSheet paths; Firestore configuration; S5c; S6b; S7; S14; S15; S17; VF-GUARD; VF-RECOVERY; VF-MFG; S21; S24; TC-SCAN-CATALOG; S25; UI-2.9b; vf_cash/vf_sales/vf_purchasing dates; deployment smoke; Phase 6; RT0; RT4; RT5; RT10; RT8; Customs-office path repair; DBLIVE-1; TC-BALANCE; TC-CAPABILITY; TC-CAPABILITY-PICKER; TC-FINANCIAL-RATIOS.

One number moved inside an already-failing check (RT5 page weight): the heaviest page is **505 KB (was 488 KB)** — `UI_Components.html` is inlined into every page and grew by ~17 KB with P2/P5/P6.

## 3. Deviations from the plan, and why

- **Branch:** pushed to `claude/sweet-pascal-7vklph`, not `claude/eloquent-edison-vute9i` — this session may push only to its own branch. It was fast-forwarded from eloquent-edison first, so it contains everything there plus this work.
- **P0:** `Company_ValleyFoods_HR_Emp.html:447` starts three watches in a loop and each `watchPage` stops the previous one, so only `vf_hr_shifts` is polled; its `PAGE_VIEWS` entry carries every tab's tables (existing behaviour left as is). `mysql:*` sources are dropped from views (this app never stamps them). Four VF cash pages share `vf_cash` and three pages share `vf_mfg_orders`: the report/detail pages feed `report`/`detail` views of that page id. Tabs are views only on TC BudgetHR and VF HR_Emp; the VF Quality*/MfgOrders/MfgOrderView tabs load one dataset for all tabs and keep one view.
- **P1:** `pageVersionsReply_` seeds a missing stamp with `{t:now, w:[], s:1}` (a quiet table's stamp expires after 6 h and "missing" can never confirm a cached view); the client treats a move *to* a seeded stamp as no information. `TABLE_LABELS`/`PAGE_VIEWS` use literal sheet names where the constant is declared later in the file (temporal dead zone).
- **P2/P3:** `UIC.openModal`/`closeModal` report to `UIC.Live`, so a dialog over a view counts the form tables as visible without editing ~108 call sites. `userIsBusy()` also counts these dialogs (its selector never matched `.modal-overlay`). A non-modal **form view never refreshes in place** (re-opening it would drop typed input): a change always shows the notice. `setView` gains `opts.loading` (returns `true` when the view was stale, so a page fetching the view drops its options cache instead of fetching twice). Statement-form `setView` calls are guarded (`if (UIC.Live.setView)`) for pages evaluated with partial stubs. `tools/verify/pageharness.js` gained `fireReady()` and `opts.globals` (additive).
- **P3 bug found and fixed in P6:** the codemod cut the StockScan refresh at `{ refresh: true }` (syntax error). Check-level verify did not show it (S24 already failed); the P6 line-by-line comparison did. Fixed; the codemod now brace-matches, and all 68 generated refreshes were checked equal to their `arrive` refresh.
- **P4:** skipped (OD4).
- **P5:** `tlDbAppendValues_`/`Batch_` record no key (raw rows; the parent is recorded by the same request's header patch / delete-where). Valley Foods and Top Chemical not adopted (OD5; savers are listed in `inventory.md`). TL/ET dialog forms (Cash/Customers/Products) stay table-level. "Only other records changed" applies to every keyed table of the form, so another invoice's lines do not interrupt it either.
- **P6:** pages adopt through a `companyCall` wrapper (`viewCache`, one generated line each) rather than a rewrite of every list loader into `loadView` (which exists and is tested). On a **cache miss the stamps are read before the list call**, never in parallel (a tag read after the data could trust a write that landed in between) — one cheap extra call on a miss. The company uid is in the adoption line (pages never set `CURRENT_COMPANY`). An action is cached only if every table it reads is in the view: `get_legal_hr`, `get_legal_salaries`, `get_stock_scan_*`, `get_valley_hr_page`, `get_valley_party_statement`, `get_valley_invoice_for_return` stay uncached (so TC BudgetHR, TC StockScan and VF HR_Emp have no cache line). **Form option lists are not cached with `swr`**: pages memoise them and a background revalidation would leave stale stock in an open form. AssessmentForm (an editor) is not cached. A 10 s safety timer ends an inert paint whose refresh never collects the fresh reply.
- `design_preview/_sources.js` is regenerated by `npm run verify` and is committed in step with the sources (not pushed by clasp).

## 4. Owner steps, in order

1. **Review** `tools/liveviews/inventory.md` (each view's tables and the reason for each) and `tools/liveviews/labels.md` (Arabic labels). To change a view: edit `tools/liveviews/view_decisions.json` (or a label in `label_overrides.json`), then run
   `node tools/liveviews/inventory.js && node tools/liveviews/gen_page_views.js && node tools/erptest/gen_actions.js && npm run verify`.
2. **`clasp push`** (the agent never ran it).
3. **Two-browser check per company** — two browsers (or a normal + a private window) signed in as two users, A and B:
   - Testing System: `et_sales` and `et_products`; Top Light: `tl_sales` and `tl_customers`; Top Chemical: `tc_products` and `tc_debts`; Valley Foods: `vf_sales` and `vf_products`; Assessment: `ac_assessments` and `ac_batches`.
   - A stays on the list; B saves a record shown there → within ~30 s A's list refreshes in place and flashes (A idle), or, if A is typing/scrolled/has a dialog open, A sees «تم تحديث <الجدول> بواسطة <B> منذ …».
   - A saves something → **no** notice for A.
   - B changes something A's list does not show (e.g. stock while A is on the sales list) → nothing on A's screen; A opens the invoice dialog/form → it shows the new value.
   - Top Light / Testing System: A opens invoice X; B edits invoice X → A sees «قام B بتعديل هذا السجل أثناء فتحه — أعد التحميل قبل الحفظ»; B edits invoice Y → A's form is not interrupted.
4. **Fast-load check:** open a list (e.g. `tl_products`), go to another page and come back within 10 minutes → the list appears at once (dimmed for a moment), and the browser network tab shows a `get_page_versions` request but **no** list request when nothing changed. Change something from another browser, come back → one list request.
5. **Switching the view cache off:**
   - one page: add its page id to `VIEW_CACHE_OPT_OUT` in `UI_Components.html` (OD7 list: `et_cash, tl_cash, tc_budget_cash, tc_budget_hr, tc_emp_deductions, tc_emp_overtime, tc_emp_permits, tc_emp_salaries, tc_employee_salary, tc_employee_status, tc_employee_reg, vf_cash, vf_hr_attendance, vf_hr_contracts, vf_hr_deductions, vf_hr_shifts, vf_hr_overtime, vf_hr_salary, vf_hr_vacation_alloc, vf_hr_vacations`);
   - everything: set `VIEW_CACHE: false` in the `UIC.Live` return object in `UI_Components.html` (or run `UIC.Live.VIEW_CACHE = false` in a page's console to test), then `clasp push`.

## 5. Pull command for the owner's PC

```
git fetch origin && git checkout claude/sweet-pascal-7vklph && git pull origin claude/sweet-pascal-7vklph
```

---

## Runbook details

### Open owner decisions (defaults applied)
- OD1 names shown (display name, else the email before `@`). OD2 off-screen changes silent. OD3 × on the notice. OD4 P4 not done. OD5 record level on Top Light + Testing System only. OD6 manual sheet edits out of scope (bounded by OD8's 10 minutes). OD7 list above. OD8 10 minutes.

### Still open for the owner
- **P4** (dashboards, KPI, reports, print pages): not watched; each would cost one Apps Script execution per open tab per 30 s.
- **P5 for Valley Foods and Top Chemical:** needs keys at each saver (`inventory.md` lists the write helpers found per company).
- **VF HR_Emp** polls only `vf_hr_shifts` today (three watches in a loop, the last one wins); its views were built to cover all tabs through that one id.

### Known limits
- A stamp race: a poll that seeds a missing stamp at the same instant a write lands can overwrite that write's writer list; detection still works (t moves) but that one change reads as «no information» (silent) on pages that were open.
- On a cache miss a page makes one extra cheap call (`get_page_versions`) before its list.
- Edits typed straight into a Google Sheet create no stamp: a cached view can show them up to 10 minutes late (OD6/OD8).
