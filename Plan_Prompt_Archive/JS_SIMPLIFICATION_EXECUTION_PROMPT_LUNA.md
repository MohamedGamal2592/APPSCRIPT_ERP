# Execution prompt for GPT-5.6 Luna

Select **GPT-5.6 Luna** in your coding agent, open `D:\Work\Script`, and paste the prompt below. Selecting the model is a host setting; this text does not change it. The exact API model ID is `gpt-5.6-luna`. [Official model reference](https://developers.openai.com/api/docs/models/gpt-5.6-luna)

---

Implement the JavaScript simplification and performance optimization plan in this project.

**Workspace:** `D:\Work\Script`  
**Plan:** `D:\Work\Script\JS_SIMPLIFICATION_PLAN.md`

This is an implementation request. Read the entire plan, inspect the current source, make the authorized local changes, and verify them. Do not stop after producing another plan or completing only cosmetic cleanup. Execute required phases 0–6 in order. Phase 7 is optional and requires a measured remaining hotspot.

## Objective and scope

Reduce repeated definitions, scans, allocations and unnecessary service calls while keeping the ERP's schemas, data semantics, permissions and main workflows unchanged. Use the plan's bounded memory, lazy indexes, Map/Set lookups, aggregation and batching designs only where they replace demonstrated work. The goal is simpler, measurably better code—not a new framework.

Work autonomously on in-scope local code, tests, fixtures, benchmarks and documentation. Make routine implementation decisions from evidence. Do not ask for confirmation between successful local steps. Production deployment, remote pushes, live database writes, migration execution and trigger installation are not part of this request. Prepare concrete validation instructions for those external steps and report what remains.

## Start by establishing the actual baseline

1. Read applicable `AGENTS.md` instructions, the complete plan, deployment configuration, source-loading helpers and relevant callers. Resolve functions by name; the plan's line numbers and historical test results may have changed.
2. Inspect Git status and relevant diffs. Preserve all existing user changes, including untracked source. Capture a recoverable local baseline for files you will edit. Do not reset, clean, stash, broadly stage, or commit unrelated work. Do not copy credential directories into snapshots or reports.
3. Run `node tools/verify/run_all.js` and `node tools/ui_check.js`. Inspect scripts for generated-file side effects first and preserve unrelated pre-existing generated content. Capture actual process exit codes and failure details.
4. Recheck the documented sales bug-presence assertion, authority company fixture, box trigger-name expectation and CSS baseline failure. Diagnose current behavior before editing either a test or production code. Replace obsolete expectations with meaningful checks; never weaken authorization, skip required tests or reset baselines just to obtain a pass.
5. Capture action/page/permission/response contracts, source-loading dependencies, index key policies and deterministic benchmark fixtures. Baseline fixtures must represent the working tree at execution start, not merely Git HEAD.

## Work in small verified steps

For each change:

1. Inspect the full affected function, callers, helpers and existing tests.
2. Record a short change hypothesis: current cost, proposed replacement, observable behavior to preserve, and test proving equivalence.
3. Add or reuse a differential fixture against the saved baseline. Keep small deterministic fixtures and actual functions; avoid duplicating the production implementation inside the test.
4. Make the smallest coherent edit. Do not combine metadata conversion, authorization redesign, cache changes and file extraction in one patch.
5. Run targeted checks; inspect the actual diff for lost exports, initialization-order changes, altered formulas, permissions or response shapes. Run the complete required suites at phase boundaries and after the final edit.
6. Record results and continue. If a replacement regresses behavior, repair it or revert only your own affected edit. If an optimization adds complexity without benefit, retain the simpler baseline and document the evidence.

Use one sequential implementation stream. Read independent files together when useful, but do not make overlapping edits or introduce delegation infrastructure.

## Required phase outputs

| Phase | Deliverable |
| --- | --- |
| 0 | Reproducible local baseline, repaired baseline checks, contract inventory, fixtures and benchmark setup |
| 1 | Proven duplicate cleanup, accurate comments/project map, convenient verification commands and explicit generated-report behavior |
| 2 | Top Light action-definition pilot with derived compatibility maps; preserve guards and special/public paths; expand only when the pilot simplifies maintenance |
| 3 | Indexed invited-batch membership, first-match scored-item lookup, and Valley Foods sales-list simplification preserving filtering, paging, totals and global serials |
| 4 | One bounded read-only snapshot/lazy-index pilot integrated with the existing data-layer lifecycle, followed by a justified report/join optimization |
| 5 | Cohesive theme and telemetry extraction, then one carefully mapped Valley Foods domain pilot; preserve Apps Script globals, initialization and deployment inclusion |
| 6 | Proven-equivalent helper reuse, bounded local operational processing with unchanged identity/type rules, and SQL access-path review using existing indexes |

The plan controls detailed acceptance criteria. Record justified deviations explicitly; do not silently omit a required item or force a harmful abstraction to tick a box.

## Non-negotiable compatibility rules

- Preserve spreadsheet/database targets, table names, exact header spelling/order, formulas, date interpretation, number formats, IDs, relationships and serialized types. No schema migrations, new counter/index sheets, SQL index DDL or storage backend changes.
- Preserve action/page/template names, payloads, response envelopes and casing, pagination modes, totals, row ordering, visible serials, exports and downloads.
- Preserve tenant/company gates, session and role behavior, kill-switch recovery, cost visibility and the separate Assessment Center public allowlist. Metadata consolidation must not remove enforcement.
- Preserve lock placement, duplicate-save handling, child-row replacement, audit events, mutation stamps, post-write flushes and durable queue recovery. Cache presence or a stale row offset is never authority for a business write.
- Preserve stock's `available = current_qty + held(this document)`, FIFO tie behavior, financial accumulation order and rounding points.
- Preserve Assessment Center's caller-provided IDs and header-case write behavior. Do not replace its writers with generic numeric-ID CRUD.
- For every index, preserve first/last/all-match semantics, key types, normalization, aliases and ordering. Test duplicate IDs, mixed case, blank keys and delimiter-containing compound keys.
- Do not change `getAllRecords_`'s mutable-result behavior globally. New internal snapshots are opt-in; bound retained memory, invalidate conservatively and provide complete scan/batch fallbacks without truncating records.
- Keep runtime files deployable under the actual `.clasp.json` settings. Update all explicit test/preview source lists when moving code. Preserve IIFE privacy and deterministic initialization.
- In local migration utilities, retain dry-run defaults, preflight validation, source-drift checks, filtered-row document numbering, header suffixes, collection names and date conversion semantics. Test with stubbed services; do not run against live data.

## Prove optimization instead of assuming it

Use the plan's benchmark design and proposed targets. Measure baseline and candidate with identical fixtures and runtime conditions. Record median/p95, operation counts, allocations/retained entries, sampled memory, response bytes and relevant service-call counts. Include warmup, repeated runs, representative sizes and input growth.

Separate measured results from complexity estimates. A Map lookup does not eliminate the initial spreadsheet read; an index consumes memory; local Node heap measurements are not Apps Script heap measurements. Preserve results on empty, skewed, duplicate, Arabic-text, mixed-date and wide-row fixtures. Never remove correct tests or change outputs to hit a speed target.

## Local gates versus external validation

For this execution, distinguish **local implementation readiness** from **staging/release readiness**. Once the local Phase 0 baseline and relevant differential fixtures pass, proceed with local candidate changes even if live access is unavailable. Keep the plan's live schema/data, trigger, concurrency, formula-recalculation and JDBC checks explicitly pending; local fixtures do not satisfy those gates.

Do not mark an entire phase fully verified when required staging evidence is missing. Do not deploy the candidate. Complete independent local work and prepare exact external checks. Ask one focused question only if missing information prevents safe local progress after available evidence has been inspected; identify the blocked operation and continue unaffected work.

## Durable progress and final report

Maintain `D:\Work\Script\JS_SIMPLIFICATION_RESULTS.md` as the single execution record. At each phase boundary, update:

- phase state: not started / in progress / locally verified / pending external validation / fully verified;
- baseline identity, changed files and concise design decisions;
- exact checks, counts, failures and benchmark evidence;
- preserved invariants, justified deviations and rollback instructions;
- the next concrete step and any blocking dependency.

Store compact machine-readable benchmark results beside the existing tooling. Do not create a new planning hierarchy. On context compaction or resumption, read this record and current Git state before continuing; do not repeat completed changes or lose the original objective.

Continue until all required local implementation work is handled or a specific dependency prevents further safe progress. Do not claim completion merely because tests parse or a subset passes. Finish with:

1. Implemented changes and phase status.
2. Measured before/after performance and memory results, with limitations.
3. Verification passed, failed and pending.
4. Exact external validation still needed and rollback path.
5. Links to the results document and principal changed files.

Start now by reading the plan and establishing the actual baseline.
