/**
 * Run every check this run added, in order.
 *
 *   node tools/verify/run_all.js
 *
 * Exits non-zero if anything fails. Nothing here touches a spreadsheet, calls a
 * Google service or hits the network — it is all offline, over the real source.
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const HERE = __dirname;
const STEPS = [
  ['mysql_unification.js', 'MySQL named query layer, cache scope, cleanup, invalidation, lookup coordination'],
  ['company_two_file_boundary.js', 'Company two-file deployment and ownership boundary'],
  ['company_registry_bootstrap.js', 'Company registry bootstrap survives merged source load order'],
  ['request_guard.js', 'Durable duplicate-request protection and lost-response recovery'],
  ['tc_registration_upload_recovery.js', 'Registration upload idempotency: request-ID recovery, confirmed failures, physical folder'],
  ['vf_hr_upload_recovery.js', 'Valley Foods HR upload idempotency: request-ID recovery and Drive tagging'],
  ['attachment_download.js', 'Attachment identity and migration contracts'],
  ['appsheet_attachments.js', 'AppSheet paths across all attachment tables'],
  ['firestore_configuration_contract.js', 'Firestore configuration, preflight and router-safe secondary reporting'],
  ['fs_storage_contract.js', 'Firestore storage adapter contract — typed REST, retries, pagination, preconditions'],
  ['parse_pages.js', 'inline <script> of every template touched'],
  ['js_simplification_metadata.js', 'Phase 2 — Top Light action metadata differential'],
  ['js_simplification_snapshot.js', 'Phase 4 — bounded read-only snapshot lifecycle'],
  ['s0_modal_size.js', 'S0 — UIC.openModal size option is purely additive'],
  ['s1_save_cost.js', 'S1 — the save resolves cost_unit server-side'],
  ['s2_workops_cost.js', 'S2 — work-centre costs reach the client'],
  ['mfg_workop_conflicts.js', 'MFG — per-work-centre scheduling conflicts: active + frame overlap'],
  ['s4_cost_page.js', 'S4 — valley_cost_view is grantable but unroutable'],
  ['s5_cost_strip.js', 'S5 — cost stripping, differential'],
  ['s5c_sales_audit.js', 'S5c — sales audit (and U-48)'],
  ['s6_client_gate.js', 'S6 — client gating, manufacturing'],
  ['s6b_list_gate.js', 'S6b — client gating, list pages'],
  ['s7_batch_modal.js', 'S7 — the FIFO batch modal'],
  ['s8_material_rows.js', 'S8 — material entry ergonomics'],
  ['s10_purchasing_ux.js', 'Purchasing form/lines UX + tl_sales pagination'],
  ['s11_sales_returns.js', 'tl_sales row menu + مرتجعات opens the returns page'],
  ['s12_warehouse_movement.js', 'S12 — حركة المخزن: 17 columns, both formulas, add-only'],
  ['s13_forms_filters.js', 'S13 — forms readability (F1/A1/F2/F4a) + vf_products and vf_parties filters'],
  ['s14_iphone.js', 'S14 — iPhone: openTab/closeOrBack fallbacks, .inv-table three states, >=600px unchanged'],
  ['s15_iphone_rest.js', 'S15 — iPhone: printDoc/openDownload fallbacks, .card-table, >=600px unchanged'],
  ['s16_realtime_authority.js', 'S16 — authority generation: kill switch, matrix and role are one-refresh'],
  /* A different programme from s16_realtime_authority above; the file names do
     not collide and the label is S16b so this runner's output stays readable. */
  ['s16_attendance.js', 'S16b — الحضور: invariants, date inference, batch undo'],
  ['s17_purchasing_save.js', 'S17 — vf_purchasing save: batched lines, batched delete'],
  ['vf_purchasing_guard.js', 'VF-GUARD — uncertain-result safeguard: confirmed failures, no duplicate execution, collision-free guards'],
  ['vf_purchasing_recovery.js', 'VF-RECOVERY — durable reconciliation: staged generations, markers, status route, reconcile utility'],
  ['vf_mfg_request_recovery.js', 'VF-MFG — uncertain manufacturing save: child identity, edit tokens, receipt checkpoints, deterministic IDs, recovery'],
  ['s18_live_saves.js', 'S18 — UIC.Live: optimistic saves, rollback, change polling'],
  ['s19_live_rollout.js', 'S19 — the UIC.Live rollout, page by page'],
  ['s20_quiet_refresh.js', 'S20 — quiet refresh: scope, watches, no blocking reload'],
  ['s21_shifts_and_expenses.js', 'S21 — الورديات: overlap rule; المصروفات: report maths'],
  ['s22_missing_template.js', 'S22 — a registered page with no HTML file fails as a page'],
  ['s23_page_params.js', 'S23 — URL parameters come from the server, not the iframe URL'],
  ['s18_table_columns.js', 'S18b — table column widths: the classifier and the contract'],
  ['s24_stock_scan.js', 'S24 — جرد دوري مخازن باركود + the USER_PAGES nav-visibility regression guard'],
  ['tc_stock_scan_catalog.js', 'TC-SCAN-CATALOG — instant products dropdown: one bootstrap catalog, local filtering, product-level balances'],
  ['tc_stock_scan_calculator.js', 'TC-SCAN-CALC — reusable LTR expression calculator and quantity-field adapters'],
  ['vf_mfg_order_calculator.js', 'VF-MO-CALC — vf_mfg_order quantity calculators; الكمية الفعلية المنتجة shows the product’s carton'],
  ['vf_mfg_order_batch_list.js', 'VF-MO-BATCH — رقم التشغيلة offers the batch numbers already in use and stays free text'],
  ['s25_stock_authority.js', 'S25 — رصيد الدفعات: one stock authority — available = current_qty + held(this document)'],
  ['s26_party_agreements.js', 'S26 — vf_parties كشف حساب: factory/agreements/packaging + balance-once'],
  ['s27_mfg_client_report.js', 'S27 — vf_mfg_client_report: client manufacturing pivot, filters, cost gating'],
  ['vf_financial_reporting.js', 'Valley Foods IFRS income-statement financial acceptance groups'],
  /* ── UI/UX programme (branch ui/odoo-parity) ── */
  ['ui1_anchor.js', 'UI-1.2 — popups escape the table clip box (U-01)'],
  ['ui1_sort.js', 'UI-1.3 — tri-state sort, load order preserved (U-03)'],
  ['ui1_num.js', 'UI-1.4 — .num shared across all three companies (U-04)'],
  ['ui1_sticky.js', 'UI-1.5 — sticky table header and its scroll range (U-05)'],
  ['ui2_themes.js', 'UI-2.4/2.5/2.6 — neutral canvas, brand topbar, per company'],
  ['ui2_breakpoints.js', 'UI-2.9b — the five-tier breakpoint scale (U-48)'],
  ['ui2_formatters.js', 'UI-2.8 — formatter consolidation, differential (D-4)'],
  ['ui3_kebab.js', 'UI-3.3 — the row action kebab (U-20)'],
  ['ui3_loading.js', 'UI-3.4 — one loading overlay, UI.toast/UI.alert (U-24)'],
  ['ui3_homefab.js', 'UI-3.8 — the persistent home button (U-42)'],
  ['ui4_controlpanel.js', 'UI-4.1 — the control panel (U-13)'],
  ['ui4_listview.js', 'UI-4.5/4.6/4.8 — columns, selection, phone cards'],
  ['ui4_grouping.js', 'UI-4.4/4.7 — group-by, aggregates, skeleton loads'],
  ['ui4_rowpatch.js', 'UI-4.9 — PagedTable row patching: a row action costs one round trip'],
  ['ui5_forms.js', 'UI-5.1/5.2/5.3 — dirty guard, styled confirm, validation'],
  ['vf_daterange.js', 'vf_cash/vf_sales/vf_purchasing — the من/إلى date range filter'],
  ['ui_smoke_pages.js', 'deployment smoke — every page template boots'],
  /* ── Box analysis (branch feat/tc-box-analysis) ── */
  ['box_parser.js', 'B1 — transaction_details parser, over the fixture corpus'],
  ['box_matcher.js', 'B2 — item matcher: stemming, blocking, scores, clusters'],
  ['box_windows.js', 'B3 — the four account windows and the month-end clamp'],
  ['box_sql.js', 'B3 — SQL discipline: additive, no DDL, closes, binds, credit'],
  ['js_simplification_operational.js', 'Phase 6 — bounded operational scripts and SQL access path'],
  ['box_wiring.js', 'B4 — access gate, registration, nav, query budget'],
  ['box_edit.js', 'B6 — edit path: allowlist, validators, named confirm, audit'],
  ['box_rules.js', 'B7 — rules engine, run against fixtures both ways'],
  /* ── Assessment Center merge (branch feat/assessment-center) ── */
  ['ac1_wiring.js', 'AC1 — registry, PAGE_ACCESS cross-ref, PUBLIC_ACTIONS/actions separation (D-14/T-2)'],
  ['ac2_scoring.js', 'AC2 — the §5.4 scoring engine, OptionsJSON parser, candidate projection'],
  ['ac3_authoring.js', 'AC3 — assessments list + full-page form, wire shapes, view-mode lockdown'],
  ['ac4_write_contract.js', 'AC4 — acInsert_/acUpdate_ header-case contract (T-3/T-4) + batches (§5.2)'],
  ['ac5_candidate.js', 'AC5 — the public candidate page and its three PUBLIC_ACTIONS (T-1/T-2/T-5/T-9)'],
  ['ac6_review.js', 'AC6 — results list, grading, the trait chart, print'],
  ['ac7_tierb.js', 'AC7 — Phase 8 Tier B (D-2): B-1/B-2, with AND without the columns'],

  /* ── Realtime feel (branch feat/realtime-feel) ── */
  ['rt0_perf_marks.js', 'RT0 — one batched perf round trip per navigation, inert when off'],
  ['rt1_skeletons.js', 'RT1 — reads draw skeletons; the overlay is for writes only'],
  ['rt2_record_replies.js', 'RT2a — every write action returns its record or declares why not'],
  ['rt2_queue.js', 'RT2b — a refused save rolls back exactly; a dropped one is queued'],
  ['rt3_stamp_coverage.js', 'RT3 — every direct sheet write bumps the version a watcher reads'],
  ['rt4_cache.js', 'RT4 — cache-first with revalidation; a hostile store degrades to a fetch'],
  ['rt5_budget.js', 'RT5 — the minified bundle is smaller and provably equivalent'],
  ['rt6_router.js', 'RT6 — soft nav: the same gate, a hard fallback, nothing left running'],
  ['rt10_telemetry.js', 'RT10 — telemetry costs one cache write and names nobody'],
  ['rt9_history_queue.js', 'RT9 — the audit queue: nothing lost, nothing duplicated'],
  ['rt8_search_scope.js', 'RT8 — no search box over a truncated list stays silent about it'],
  ['customs_office_path_repair.js', 'Customs-office path repair: مكتب الجمارك prefix preview contract'],
  /* ── Apps Script optimization run (19/09/2026) ── */
  ['optimization_record_cache.js', 'OPT-1 — PK memo lifecycle, index matching contract, blank rows and snapshot ownership'],
  ['optimization_chunk_cache.js', 'OPT-2 — chunked cache layout, byte limits, partial eviction and invalidation'],
  ['optimization_reads.js', 'OPT-3 — hoisted lookups: invoice approval scan/snapshot, movement unit map'],
  ['optimization_writes.js', 'OPT-4 — batched approval writes with layout-verified fallback'],
  ['tl_sheetdb_contract.js', 'TL-DB — Top Light sheets-as-database: value-only writes, key-addressed patches, soft delete'],
  ['erptest_clone_static.js', 'ET-STATIC — Testing System clone: no Top Light leftovers, translation layer, policies, field literals'],
  ['erptest_mfg_vm.js', 'ET-MFG — Testing System T-MFG / T-STOCK on the real erp_test headers'],
  ['erptest_parity_vm.js', 'ET-PARITY — Testing System reads equal Top Light (legacy and packs)'],
  ['erptest_write_vm.js', 'ET-WRITE — Testing System write layer: T-WRITE, T-ATOMIC, compaction, reconcile, get_et_sync'],
  ['live_notice_server.js', 'LIVE-NOTICE P1 — stamps carry writer and request; get_page_versions returns views, labels and the union of tables'],
  ['live_notice_client.js', 'LIVE-NOTICE P2 — own saves are silent, off-view changes go stale, the notice names what/who/when'],
  ['erptest_packs_client.js', 'ET-CLIENT — Testing System browser packs: warm render, sync, logout / user isolation'],
  ['dblive_products_paging.js', 'DBLIVE-1 — tc_products_live paging: 50/page, cached total, bust on write'],
  ['tc_budget_stock_balance.js', 'TC-BALANCE — رصيد أصناف الميزانية: name_ar join aggregation, duplicate/unmatched policy, MySQL view join, page wiring'],
  ['tc_budget_inputs_ui.js', 'TC-INPUTS — المدخلات: unified dataTable view, row details modal, preserved actions and formatted dates'],
  ['tc_production_capability.js', 'TC-CAPABILITY — live-view read contract, permissions, planning calculations, filters and stale responses'],
  ['tc_capability_picker.js', 'TC-CAPABILITY-PICKER — instant catalog pickers: shared controller, freshness, races, fallback'],

  /* ── Quality module (Phase 0) ── */
  ['quality_uidv7.js', 'QUALITY-UID — RFC 9562 sortable ids: shape, uniqueness, timestamp round-trip'],
  ['quality_action_tables.js', 'QUALITY-TABLES — ACTION_TABLES accepts arrays: flatten, join, legacy strings intact'],
  /* ── Quality module (Phase 1 — SOP server) ── */
  ['quality_sop_workflow.js', 'QUALITY-SOP — SOP lifecycle over the real block: refusals, PDF freeze, obsoletion, acks'],
  ['quality_sop_permissions.js', 'QUALITY-SOP-ACL — page grants: full-only decisions, array tables cover five sheets'],
  /* ── Quality module (Phase 2 — acknowledgements server) ── */
  ['quality_acks.js', 'QUALITY-ACKS — launch applicability/idempotency/supersede, server-side email scoping, own-row signing, supervisor record'],
  /* ── Quality module (Phase 3 — NCR/CAPA server) ── */
  ['quality_ncr.js', 'QUALITY-NCR — NCR/CAPA lifecycle over the real block: zero-write refusals, annual codes, overdue rule, full-gated CAPA verification'],
  /* ── Quality module (Phase 4 — dashboard + audits server) ── */
  ['quality_dashboard.js', 'QUALITY-DASHBOARD — every KPI exact over fixtures, dashboard cached via vfRefsCached_ with zero writes, write-registration ref-bust chain'],
  ['quality_audits.js', 'QUALITY-AUDITS — audit lifecycle and findings over the real block: AUD codes, zero-write refusals, Closed lockdown, escalation back-link and shared NCR allocator'],
  /* ── Quality module (definition of done — end-to-end) ── */
  ['tc_financial_ratios.js', 'TC-FINANCIAL-RATIOS — selectable comparison periods, net sales/other income/expenses monthly charts, compact labels, account comparisons, expense ratio/order/cutoff, A4 PDF layout, read-only queries and route'],
  ['quality_sop_codes_roles.js', 'QUALITY-SOP-CODES - readable <PREFIX>-<ABBR>-<SEQUENCE> codes, idempotent create, additive schema upgrade, combined save + concurrency, server allowlist, shared template renderer, general-quality handlers'],
  ['quality_sop_workspace_ui.js', 'QUALITY-SOP-UI - the real page code: library, template workspace, metadata controls, combined save payload, read-only + legacy, general-quality page, Quality-only navigation'],
  ['quality_e2e.js', 'QUALITY-E2E — one shared state through the full SOP → Ack → NCR → CAPA → close → dashboard journey over the real handlers']
];

/* Every listed check is part of this execution contract. A missing verifier is
 * a failure, because a green run with an omitted check is not evidence. */
const fs = require('fs');

let failed = 0;
STEPS.forEach(function (s) {
  const [file, label] = s;
  process.stdout.write('── ' + label + '\n');
  if (!fs.existsSync(path.join(HERE, file))) {
    failed++;
    console.log('   FAILED — required verifier ' + file + ' is not present in this working tree\n');
    return;
  }
  try {
    execFileSync(process.execPath, [path.join(HERE, file)], { stdio: 'pipe' });
    console.log('   OK\n');
  } catch (e) {
    failed++;
    console.log('   FAILED\n');
    process.stdout.write(String(e.stdout || '') + String(e.stderr || '') + '\n');
  }
});

const ran = STEPS.length;
console.log(failed === 0
  ? 'All ' + ran + ' checks pass.'
  : failed + ' of ' + ran + ' checks FAILED.');
process.exit(failed === 0 ? 0 : 1);
