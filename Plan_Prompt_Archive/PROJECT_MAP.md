# Project map

## Deployable Apps Script source

Root-level `.js`, `.gs`, `.html` and `.json` files are the runtime project. `.clasp.json` uses `rootDir: ""` and `skipSubdirectories: true`; extracted runtime files must remain at the root and be added to explicit source lists where a tool enumerates sources.

- Valley Foods backend business logic is consolidated in Company_ValleyFoods_Actions.js; the income-statement page remains the independent Company_ValleyFoods_IncomeStatement.html route.

## Local verification and preview

- `node tools/verify/run_all.js` runs the offline behavioral/static checks and fails if a required check file is missing.
- `node tools/ui_check.js` runs the UI contract suite; `--json` emits machine-readable output and `--save` intentionally updates `tools/ui_baseline.json`.
- `node tools/build_preview.js` regenerates the ignored `design_preview/_sources.js` bundle.
- `node tools/verify/js_simplification_benchmark.js` writes its compact result to `tools/verify/results/js_simplification_benchmark.json`.
- `node tools/verify/rt2_record_replies.js --report=<path>` writes its generated report to an explicit path; without `--report`, it uses the OS temp directory and never rewrites the source tree.

## Operational scripts

Root `.mjs` files are local migration/analysis utilities. They keep dry-run defaults and require explicit write flags for external writes. They are not deployed by the current `.clasp.json` settings.

## Archives and excluded copies

`src_html/`, `Backup/`, `assessment center/`, `Plan_Prompt_Archive/`, `tools/` and `design_preview/` are maintenance, fixtures, previews or historical material and are excluded from deployment by `.claspignore`/configuration. Archived copies are retained until their ownership and references are verified.
