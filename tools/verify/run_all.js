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
  ['parse_pages.js', 'inline <script> of every template touched'],
  ['s0_modal_size.js', 'S0 — UIC.openModal size option is purely additive'],
  ['s1_save_cost.js', 'S1 — the save resolves cost_unit server-side'],
  ['s2_workops_cost.js', 'S2 — work-centre costs reach the client'],
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
  ['s18_live_saves.js', 'S18 — UIC.Live: optimistic saves, rollback, change polling'],
  ['s19_live_rollout.js', 'S19 — the UIC.Live rollout, page by page'],
  ['s20_quiet_refresh.js', 'S20 — quiet refresh: scope, watches, no blocking reload'],
  ['s21_shifts_and_expenses.js', 'S21 — الورديات: overlap rule; المصروفات: report maths'],
  ['s22_missing_template.js', 'S22 — a registered page with no HTML file fails as a page'],
  ['s23_page_params.js', 'S23 — URL parameters come from the server, not the iframe URL'],
  ['s18_table_columns.js', 'S18b — table column widths: the classifier and the contract'],
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
  ['ui5_forms.js', 'UI-5.1/5.2/5.3 — dirty guard, styled confirm, validation'],
  ['vf_daterange.js', 'vf_cash/vf_sales/vf_purchasing — the من/إلى date range filter'],
  ['ui_smoke_pages.js', 'deployment smoke — every page template boots'],
  /* ── Box analysis (branch feat/tc-box-analysis) ── */
  ['box_parser.js', 'B1 — transaction_details parser, over the fixture corpus'],
  ['box_matcher.js', 'B2 — item matcher: stemming, blocking, scores, clusters'],
  ['box_windows.js', 'B3 — the four account windows and the month-end clamp'],
  ['box_sql.js', 'B3 — SQL discipline: additive, no DDL, closes, binds, credit'],
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
  ['rt8_search_scope.js', 'RT8 — no search box over a truncated list stays silent about it']
];

/* Two programmes share this repo and this runner, so a step's file can be
 * present in one working tree and not yet committed in another. A missing file
 * is reported and SKIPPED rather than crashing the whole suite: the alternative
 * is that one uncommitted file makes every other check unrunnable. */
const fs = require('fs');

let failed = 0, skipped = 0;
STEPS.forEach(function (s) {
  const [file, label] = s;
  process.stdout.write('── ' + label + '\n');
  if (!fs.existsSync(path.join(HERE, file))) {
    skipped++;
    console.log('   SKIPPED — ' + file + ' is not present in this working tree\n');
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

const ran = STEPS.length - skipped;
console.log(failed === 0
  ? 'All ' + ran + ' checks pass.' + (skipped ? '  (' + skipped + ' skipped — file not in this tree)' : '')
  : failed + ' of ' + ran + ' checks FAILED.' + (skipped ? '  (' + skipped + ' skipped)' : ''));
process.exit(failed === 0 ? 0 : 1);
