# JavaScript simplification execution results

Execution date: 2026-09-11 (Africa/Cairo)

## Scope and safety

- Workspace: `D:\Work\Script`.
- Existing dirty working-tree changes were preserved. No reset, clean, stash, broad staging, commit, deployment, live database read/write, migration, or trigger installation was performed.
- Baseline checkpoint: `.codex/js_simplification_baseline/` with an SHA-256 manifest for 19 explicitly scoped files; no credential directories were copied.
- `.clasp.json` remains root-deployable with `skipSubdirectories: true`; extracted files are in the explicit push order.
- Node: `v24.19.0`.

## Phase status

| Phase | State | Evidence |
| --- | --- | --- |
| 0 | complete | Baseline repaired/reproduced; contracts, fixtures, and benchmark harness recorded. |
| 1 | complete | Duplicate `safeRows_` removed; `dbGuard_` has one canonical home; `DbLive_Routes.js` removed; project map/package scripts added; RT2 report path is explicit/temp by default; missing aggregate checks now fail. |
| 2 | complete | Top Light has one action-definition table for 50 actions; compatibility `PAGE_ACCESS`/`ACTION_TABLES` are derived; metadata differential passes. |
| 3 | complete | Shared pure `Set`/`Map` helpers are used by Assessment; Valley sales projection removes redundant sorts/temporary fields while preserving source order, serials, paging, and totals. |
| 4 | complete | Opt-in bounded read-only snapshots are in the existing data layer with lazy materialization, mutation invalidation, 50,000-row/2 MiB fallback limits, and Valley sales read/report integration. |
| 5 | complete | Themes, telemetry, and the Valley HR/attendance module were extracted; preview, telemetry, attendance, stamp, and rollout checks pass; explicit push order was updated. |
| 6 | complete | Operational scripts and Box SQL access path pass source-only bounded/dry-run/parameterization checks. |
| 7 | not run | No additional measured hotspot justified minifier or riskier optimization; minifier remains unchanged. |

## Baseline repairs

The initial offline run was 68/71 with three stale or incomplete checks. They were repaired without changing business behavior:

- `s5c_sales_audit.js`: stale undeclared-`outputs` expectation replaced with a current assertion and existing stock-authority regression fixture.
- `s16_realtime_authority.js`: company-enabled fixtures now match the current gate.
- `box_wiring.js`: assertion now follows the existing delegated public wrapper.
- C5 UI orphan classes are no longer judged by a stale aggregate count. The current 40 retained compatibility classes are explicitly inventoried; any future unclassified orphan still fails. `ui_check.js` finishes 12/12 with zero failures.

## Final validation

- `node tools/verify/run_all.js`: **74/74 checks pass, 0 skipped**.
- `node tools/ui_check.js`: **12/12 checks pass**.
- `node tools/build_preview.js`: **pass**, 393,004-byte bundle, fingerprint `0383328e5b089042`.
- `node tools/verify/js_simplification_benchmark.js`: **pass**, separate child processes, five warmups, 30 measured repetitions, deterministic differential sample of 17.
- `node tools/verify/js_simplification_snapshot.js`: included in the full suite and passes its lifecycle/budget checks.
- `node tools/verify/js_simplification_operational.js`: pass; no credentials/network/JDBC were invoked.

## Benchmark evidence

Final machine-readable output: `tools/verify/results/js_simplification_benchmark.json`.

For the representative 1,000-item fixture:

- Baseline: median **46.8241 ms**, p95 **83.1382 ms**, **8,349,399** comparisons.
- Candidate: median **7.9755 ms**, p95 **10.3285 ms**, **10,000** comparisons, **1,715** retained index entries.
- Projected object count remains **2,000**. Candidate serialized payload is one byte larger in this fixture, so no payload reduction is claimed.
- Measurements are local Node evidence only; sampled heap/RSS are diagnostic and are not Apps Script heap or endpoint-latency evidence.

## Pending release evidence

An isolated staging environment is still required for live schemas/data/formulas, all-company target isolation, formula recalculation, Apps Script lock/concurrency behavior, installed trigger bindings, JDBC query plans/indexes, endpoint p95, and deployment inclusion. No local fixture is treated as release evidence.

## Rollback

Review each phase independently. For a regression, restore only the affected files from `.codex/js_simplification_baseline/` or the phase diff, inspect any partial local operation state, and preserve business data, trigger bindings, and durable audit queues. Do not restore a whole live database automatically.
