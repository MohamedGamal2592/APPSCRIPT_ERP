# UI_BASELINE — the untouched tree, before Phase 1

**Branch:** `ui/odoo-parity`, cut from `0f71e3d` (`feat/vf-purchasing-ux`).
**Recorded:** 2026-09-06, Phase 0, before any live file was edited.

This is the reference every later phase is compared against. `tools/ui_check.js`
stores the same numbers in `tools/ui_baseline.json` and FAILS when a metric moves
the wrong way, so a regression announces itself rather than being noticed later.

Nothing in Phase 0 touched a live file. Every number here describes the tree as
the ValleyFoods run left it at `0f71e3d`.

## What the numbers mean

| Metric | Baseline | Reading |
|---|---|---|
| `js_files` / `html_files` | 19 / 92 | Everything parses. 92 = 93 root `.html` minus the 14 MB `appsheet_old_project.html` archive. |
| `script_blocks` | 110 | Inline `<script>` blocks parsed, scriptlets substituted. |
| `symbols_undefined` | **2** | `UI.toast` and `UI.alert` are called but defined nowhere. Both are real defects — see below. |
| `classes_orphan` | **38** | Classes a page puts in `class="…"` that no stylesheet defines. Finding **U-08**, with a number on it. |
| `color_literals` / `token_uses` | **794 / 708** | Token share **47.1%**. 743 hex + 51 rgb/rgba. Phase 2 exists to move this. |
| `media_offbrand` | **11** | Every width query in the tree is off the agreed five-tier scale; `media_conforming` is **0**. Finding **U-48**. |
| `dom_nodes_per_row` | **7** | Elements emitted per 6-column table row. The performance programme owns this number; no UI phase may raise it. |
| `distinct_ids` | 583 | Anchor ids across the tree; the 13 critical ones are asserted by name. |
| `components_checked` | 19 | Components that build from the preview bundle without throwing. |

## Two defects the baseline run found

Neither is among the 48 investigated findings. Both were found by check C3, which
resolves every `UIC.*` / `API.*` / `FMT.*` / `UI.*` / `ERPModal.*` / `ERPFlow.*` /
`SESSION.*` reference in the tree against its definition.

### N-01 — `UI.toast` does not exist; 40 messages are silently swallowed

`Client_Helpers.html` defines `UI.showSpinner`, `UI.hideSpinner` and `UI.submitOnce`.
It never defines `UI.toast`. `Company_ValleyFoods_MfgOrderView.html` calls it **40
times**, every one guarded as `UI.toast && UI.toast(…)` or `if (UI.toast)`, so nothing
throws — and **every success and error message on the manufacturing order page is
discarded**. A user saving a manufacturing order gets no confirmation and no error text.

### N-02 — `UI.alert` does not exist; `DbLive_Viewer.html` throws on every error path

`DbLive_Viewer.html` calls `UI.alert(…)` **9 times, unguarded**. Each sits on an error
or validation path, so the page raises `TypeError: UI.alert is not a function` at
exactly the moment it was trying to tell the user something had gone wrong.

Both are fixed additively in Phase 3.4 (the U-24 loading/notification consolidation):
`UI.toast` and `UI.alert` become thin wrappers over the shared components. No existing
signature changes, nothing is renamed.

## The full baseline run

```
ui_check — 2026-09-06 13:41:29
========================================================================
[PASS] C1  node --check on every .js file
        19 files parse

[PASS] C2  inline <script> of every .html template parses
        92 templates, 110 script blocks parse

[PASS] C3  public contracts — UIC/API/FMT/UI/ERPModal/ERPFlow/SESSION
          UI.alert  ← 9 call(s) in 1 file(s): DbLive_Viewer.html
          UI.toast  ← 40 call(s) in 1 file(s): Company_ValleyFoods_MfgOrderView.html
        undefined namespaced symbols: 2  (baseline 2)

[PASS] C4  anchor ids the pages depend on still exist
        13 critical ids present; 583 distinct ids across the tree

[PASS] C5  CSS classes used by pages are defined somewhere (U-08)
          .app-logo-main  ← 1 file(s): UI_Components.html
          .btn-secondary  ← 1 file(s): UI_Components.html
          .btn-success  ← 1 file(s): DbLive_Viewer.html
          .card-actions  ← 2 file(s): User_Sessions.html, User_Views.html
          .card-main  ← 2 file(s): User_Sessions.html, User_Views.html
          .ded-group-body  ← 2 file(s): Company_TopChemical_EmpDeductions.html, Company_ValleyFoods_Deductions.html
          .ded-group-head  ← 2 file(s): Company_TopChemical_EmpDeductions.html, Company_ValleyFoods_Deductions.html
          .dt-pager  ← 1 file(s): UI_Components.html
          .erp-pager  ← 1 file(s): ERP_DataTable_JS.html
          .form-control  ← 1 file(s): Company_ValleyFoods_Overtime.html
          .form-input  ← 1 file(s): DbLive_Viewer.html
          .mfg-tab-pane  ← 1 file(s): Company_ValleyFoods_MfgOrders.html
          .modal-content  ← 1 file(s): DbLive_Viewer.html
          .pt-count  ← 1 file(s): UI_Components.html
          .pt-foot  ← 1 file(s): UI_Components.html
          .stat-body  ← 4 file(s): Company_TopLight_Cash.html, Company_TopLight_Cash_Report.html
          .stat-val  ← 1 file(s): DbLive_Viewer.html
          .text-muted  ← 3 file(s): Company_TopChemical_Barcode.html, Company_TopChemical_EmpDeductions.html
          .timer-live  ← 1 file(s): Company_ValleyFoods_MfgOrders.html
          .tx-loading  ← 1 file(s): Company_TopChemical_Debts.html
          .vf-att-card  ← 1 file(s): Company_ValleyFoods_Attendance.html
          .vf-btn  ← 1 file(s): Company_ValleyFoods_MonthlySalaries.html
          .vf-btn-primary  ← 1 file(s): Company_ValleyFoods_MonthlySalaries.html
          .vf-btn-success  ← 1 file(s): Company_ValleyFoods_MonthlySalaries.html
          .vf-card  ← 12 file(s): Company_ValleyFoods_AssetTechnical.html, Company_ValleyFoods_Attendance.html
          … and 13 more
        used-but-undefined classes: 38  (baseline 38)

[INFO] C6  token discipline — hardcoded colours vs tokens (U-07)
        colour literals: 794 (743 hex, 51 rgb/rgba)
        var(--token) uses: 708
        token share: 47.1%
        heaviest files: Company_ValleyFoods_MfgOrderView.html(61), Company_ValleyFoods_Parties.html(57), UI_Components.html(53), Company_ValleyFoods_Attendance.html(48), Company_TopLight_Sales_Costing_Print.html(40), Company_ValleyFoods_MfgOrders.html(37), CSS_Tokens.html(32), Company_TopLight_Customer_Statement.html(32)

[PASS] C7  breakpoint scale conformance (§0.4 / U-48)
          max-width:600  × 1 file(s): Company_TopChemical_Dashboard.html
          max-width:640  × 2 file(s): Company_TopLight_Sales_Costing_Print.html, Company_ValleyFoods_Products.html
          max-width:720  × 1 file(s): Company_ValleyFoods_Products.html
          max-width:767  × 1 file(s): UI_Components.html
          max-width:768  × 1 file(s): UI_Components.html
          max-width:900  × 2 file(s): Company_TopChemical_Dashboard.html, Company_TopChemical_KPI.html
          min-width:1300  × 1 file(s): Company_TopChemical_Dashboard.html
          min-width:640  × 1 file(s): UI_Components.html
          min-width:768  × 1 file(s): UI_Components.html
        total width queries: 11, on-scale min-width: 0, max-width: 8
        off-scale width queries: 11  (baseline 11)

[PASS] C8  DOM nodes per rendered table row
        6-column row → 7 element(s), 169 bytes
        at the 50-row page size that is 350 elements per rendered page

[PASS] C9  design preview harness is current
        preview bundle matches the live shared layer (2d18415a2f655528)

[PASS] C10 every component builds without throwing
        19 components build from the preview bundle

========================================================================
ui_check: 10 checks, 0 failures.
```
