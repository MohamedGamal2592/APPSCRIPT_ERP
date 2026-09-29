# Plan: Fast Data Experience Across ERP Companies and Main Settings

**Status:** Execution in progress in the project folders. Phase 0 is partial; no company-wide rollout or candidate flag has been enabled. See [the route inventory](Plan_Systemwide_Fast_Data_Execution_Inventory.md) and [the action access map](Plan_Systemwide_Fast_Data_Endpoint_Map.md) for current coverage and open contracts.

**Purpose:** apply the proven read patterns from `action=tc_stock_scan` and `action=tc_products_live` consistently across every ERP company and the central administration/settings area, while selecting a suitable implementation for each backend.

**Primary outcome:** pages become useful quickly, continue loading bounded data in the background, support truthful search across the intended dataset, and preserve current write rules. Dropdowns, tables, reports, settings, and multi-table forms each get a contract sized for their actual task.

**Operational constraint:** source work happens directly in the project folders. Production data and schemas are not test fixtures. Do not push or deploy Apps Script online unless the user separately instructs it. No live writes are part of this plan.

---

## 1. What we learned from the product pages

The results from Stock Scan and Products Live came from combining several techniques:

1. **Use a narrow response for each control.** Stock Scan needs product ID, Arabic name, code, and the per-unit value. Products Live needs a larger row projection for details and editing. Reusing a full table response for every dropdown wastes database and response work.
2. **Aggregate MySQL rows where JDBC traversal is expensive.** A single bounded `JSON_ARRAYAGG(JSON_OBJECT(...))` response avoids repeated Apps Script/JDBC calls for each result cell. JSON aggregation helps only if measured JDBC traversal or response mapping is material; it does not guarantee that SQL itself is faster.
3. **Keep suitable bounded catalogs in the browser.** A validated same-user catalog can make dropdown search local and nearly immediate. A warm copy can render while a refresh runs in the background.
4. **Page larger tables.** A bounded first page gives a useful first view. Sequential keyset pages hydrate additional rows without sending one huge response.
5. **Keep search honest.** Local search is global only when the complete eligible set is loaded. While it is incomplete, search must query the server or clearly identify that it is searching only loaded rows.
6. **Measure each clock separately.** Browser cache paint, RPC, connector acquisition, SQL execution, JDBC traversal, server parsing, response size, and table rendering identify different bottlenecks.

The currently observed user timings for these pages are recorded in [MySQL_Products_Table_Dropdown_Performance_Journey.md](MySQL_Products_Table_Dropdown_Performance_Journey.md). Those samples demonstrate that the product patterns worked for their tested paths; they do not promise that other tables or backends will have the same latency.

### Important distinction

All Apps Script action responses are serialized as JSON. That fact alone does not make a read fast. The performance technique is choosing the right database-side query, row projection, page boundary, cache policy, and browser loading behavior. A Sheet that is fully scanned and then wrapped in JSON still pays for the full Sheet read and scan.

---

## 2. Scope

The inventory and rollout cover every registered company and the central settings/control plane present in the current project.

### Companies in scope

- **TopChemical** — its MySQL-backed product, stock, report, and capability endpoints, plus every Sheet-backed operational, budget, payroll, employee, purchasing, and reference page.
- **TopLight** — products, customers, purchasing, sales, offers, returns, cash, reports, and movement pages. The registry provides page and table metadata; confirm the backend for every action instead of assuming every module uses the same store.
- **Valley Foods** — products, parties, cash, sales/returns, purchasing, warehouse movement, manufacturing recipes/orders, work centers/assets, HR, quality, and employee reference settings.
- **Assessment Center** — assessments, batches, assignments/results, and public assessment-taking routes. Candidate answers and personal result data need stricter cache and export review than ordinary reference catalogs.

### Main settings and administration in scope

The central ERP Management area contains company management, users, role permissions, registered system pages, currency rates, subscription invoices, performance diagnostics, the system kill switch, and backups. Include company-level reference settings such as Valley Foods overtime, deductions, vacation, and shift settings in the relevant company track.

This plan does not change the meaning of any setting, permission, access grant, public route, billing action, kill-switch action, or backup operation. These areas are sensitive control-plane features; their read performance work must preserve strict server authorization and avoid stale authorization data.

---

## 3. System inventory required before migration

The current execution inventory lists 23 templates using `UIC.showAllBar`, but those templates are only one discovery source. The work must inventory registered routes and their calls as well, including pages without a show-all control, read-only reports, modal lookups, and list data loaded during form entry.

Build one maintained endpoint inventory with a row per logical read or write contract, not just one row per page. Record:

| Inventory field | What to record |
|---|---|
| Company and route | Company registry, page/action, template, permission key, public/session status |
| Storage source | MySQL table/view, Google Sheets spreadsheet/tab, Firestore collection, cache, or a join across sources |
| Identity | Primary key, UUID/`unique_id`, document ID, invoice key, or composite key; note whether it is unique and stable |
| Data purpose | Dropdown, browse table, dashboard tile, report section, detail/modal read, admin setting, or save-form reference |
| Projection | Exact fields the UI, search, edit form, export, and save contract each require |
| Read behavior | Rows/cells/documents scanned, rows returned, join/group work, per-cell JDBC calls, sort/filter location, RPC count |
| Query semantics | Filters, search fields and modes, default sort, unique tie-breaker, total/count meaning, date behavior |
| Current limits | Page size, full-list cap, payload bytes, response timeout, maximum expected catalog size |
| Cache | Browser/server/source cache, namespace, TTL, freshness source, stale display policy, write invalidation path |
| Write coupling | Tables/tabs touched, child rows, formula-owned columns, stock/ownership checks, audit, retries, recovery |
| Export and print | Current page, loaded rows, filtered matches, or complete result; permission and size constraints |
| Diagnostics | Existing phase coverage and confirmation that internal timings are super-admin-only |
| Status | Baseline known/unknown, candidate flag, safe validation environment, rollout owner, rollback path |

Use source registries, action registries, route maps, storage adapters, and template RPC calls to find candidates. Trace each action to the actual read/write helper. Page names or company labels do not determine the backend. Mark unknowns explicitly; do not invent indexes, row order, append-only behavior, exact totals, cache invalidation, or transaction guarantees.

### Inventory outputs

1. **Route map:** every registered company page, central admin tab, public route, and hidden/modal route.
2. **Read map:** each RPC/action to table/tab/collection, projection, filter, order, and scan cost.
3. **Write map:** each save/update/delete action to all affected records and formula/permission/recovery invariants.
4. **Data-source map:** MySQL, Sheets, Firestore, and mixed-source boundaries.
5. **Priority queue:** rank endpoints using observed user delay, frequency, affected users, scan amplification, response bytes, and implementation risk.

Do not retire a control or change a response contract during inventory.

---

## 4. Shared read contract

New and migrated list endpoints should return a versioned JSON envelope whose semantics are explicit. The exact row representation may be arrays (smaller for wide tables) or objects (easier to audit); each endpoint chooses and validates one representation.

```json
{
  "schema_version": 1,
  "status": "ok",
  "columns": ["id", "name_ar", "code"],
  "rows": [["785", "اسم الصنف", "ABC-1"]],
  "page": {
    "limit": 100,
    "has_more": true,
    "next_cursor": "opaque-source-specific-token",
    "snapshot": "source-version-or-high-water-mark"
  },
  "total": null,
  "total_is_exact": false,
  "data_version": "source-version-if-available",
  "request_id": "correlation-id"
}
```

### Contract rules

- The server owns table names, column names, SQL expressions, filters that affect authorization, and order definitions. Client input contains bounded filter values, search text, requested page size, and a source-specific cursor only.
- Every response declares its projection and schema version. Array rows must match the column count; object rows must include the declared fields. Reject duplicate/unknown mapped columns where they could change meaning.
- Preserve large integer IDs, exact decimals, UUIDs, and business keys as strings end-to-end. Normalize dates only after documenting current UI and filter behavior.
- Use `has_more` for continuation. Return `total` only when the endpoint can calculate it correctly at a stated scope/cost. Distinguish total matches, rows loaded, and rows rendered.
- `snapshot` must be named accurately. A high-water ID excludes later inserts above the mark; it does not freeze updates/deletes. An MVCC snapshot, Sheets row-window snapshot, Firestore update-time, and cache version are different guarantees.
- Include a request correlation ID for support diagnostics. Do not make cursor tokens authorization tokens. Re-run authorization on every page and search request, including cache hits.
- Existing callers keep their existing response shape until migrated. Add versioned or opt-in paths; do not silently reinterpret a legacy response.

---

## 5. Shared browser behavior

### First view and background hydration

1. Render the page shell and a stable skeleton immediately.
2. If an eligible, correctly scoped cache is available, validate and paint it immediately with its age/completeness state.
3. Start the first bounded server request without blocking unrelated controls or report sections.
4. Append or replace pages sequentially, keyed by a stable record identity. Use request generations so an old query cannot overwrite a newer one.
5. Pause nonessential page hydration while the browser tab is hidden. Resume on return, subject to per-table row, byte, request-count, and time budgets.
6. Keep the current useful view while a refresh is pending or fails. Never treat the cache as save authority.

### Search scope

- **Complete small catalog:** download the complete accepted bounded catalog once; search locally; render a capped option list; show total matches and visible matches.
- **Incomplete table:** search on the server across the complete eligible set; debounce typing; cancel or ignore stale query responses; use stable sort and cursor for additional matches.
- **Fully hydrated table:** search locally only if the loader confirms the result set is complete and still within its version/scope.
- **No match while loading:** display a searching/loading state, not a final “no results” message, until all matching server results or a complete local set is known.
- State whether export and print cover the current display page, loaded rows, current filter matches, or the full server result. Keep existing user expectations until a page-specific replacement is approved and verified.

### Cache policy

For each endpoint define company, page/action, user or role scope, schema version, and data version in the cache namespace. Set separate fresh and maximum-stale ages. Invalidate after every successful relevant application mutation; document visibility of external writes that bypass the application epoch. Clear on account/company changes and avoid caching sensitive data where browser persistence is inappropriate.

Use stale-while-refresh only where stale display is safe. Settings that control access, permissions, company enablement, currency, kill-switch state, or user status must not be used from a stale cache to authorize an operation. Any stale rendering for those pages is presentation only and must be clearly revalidated before a consequential action.

---

## 6. Choose a read strategy by backend

### 6.1 MySQL/JDBC

Use MySQL for filtering, projection, ordering, joins, and page bounds. Select the narrowest screen-specific projection. Use prepared statements and a stable order with a unique tie-breaker. Consider SQL JSON aggregation when phase measurements show JDBC result traversal is expensive and the target MySQL version supports the used functions.

For each read:

1. Measure connection acquisition, each SQL statement, JDBC traversal, server aggregation/JSON parse, total named read, browser RPC, response bytes, client parse, and render.
2. Inspect the actual query plan before changing joins or adding an index; index changes require a separate schema proposal.
3. Bound rows and bytes. Validate aggregate count, row shape, ID uniqueness, order, cursor scope, and `has_more`.
4. Cache only with a proven invalidation/freshness contract; repeat authorization on hits.
5. Keep exact totals optional if count is costly. For large searches, report “more results” unless exact count is needed and acceptably cheap.

### 6.2 Google Sheets

Use `getValues()`/batch rectangular range reads and map the chosen columns once. This reduces Apps Script call overhead and cells transferred, but a narrow scan still visits the rows it scans. A JSON envelope changes data shape; it does not make a whole-tab read bounded.

Page through physical row windows only when the sheet's row order and movement behavior support it. Define a high-water window and deduplicate by stable `id`/`unique_id`; decide how inserts, sorting, deletes, formula rows, and moved rows are handled. If search requires scanning every tab row, measure and label that cost. Do not add index tabs, columns, formulas, or schema/data structure without separate authorization.

### 6.3 Firestore

Use native field predicates, ordered queries, document IDs, and cursors. Define needed composite indexes as a separate proposal if Firestore requires them. Do not load every document for an interactive first page. Preserve update-time conflict checks and document identity on writes.

### 6.4 Mixed-source reads

Keep one request contract at the UI boundary, but do not force sources into a fake transaction. State which piece is authoritative, its version/age, and how partial failure is displayed. Prefer independently renderable sections/options over a single barrier when the results are logically independent.

---

## 7. Company-by-company rollout

The following are tracks for inventory and sequencing, not assumptions that every listed route has the same data source. Resolve source, action, and table names from current code before implementation.

### 7.1 TopChemical

**Proven pilot:**

- `action=tc_stock_scan`: compact MySQL catalog, complete bounded local dropdown search, at most 100 rendered options, browser cache, refresh/fallback behavior.
- `action=tc_products_live`: detailed MySQL table projection, shared table UI, bounded full-load cap and a disabled candidate keyset/JSON paging path.

**Next MySQL group:**

- `tc_financial_ratios`: retain independent section requests and early section rendering; tune slow sections from their phase timings and SQL plans.
- `tc_production_capability` and `tc_sales_capacity`: review current JSON aggregation, catalog selection, query grouping, snapshot reuse, and page-two cache behavior.
- Other MySQL-backed TopChemical actions found by code search: classify each as catalog, table, report, lookup, or form detail; migrate only after projection, permission, total, and cache behavior are documented.

**Remaining operational group:**

Inventory products/clients, barcode, stock revisions, purchasing/import follow-up, customs, employee/payroll, budget, manufacture, trust, and all auxiliary routes. Trace actions to Sheets/MySQL sources. Migrate read-only catalogs and independent report sections first, then transaction lists, then forms with coupled writes. Preserve soft-delete predicates, stock/quantity calculations, totals, formula fields, and export behavior.

### 7.2 TopLight

Inventory products, customers/vendors, purchasing, sales, offers, returns, cash/bank movement, statements, needs, movement, costing, and financial reports.

Prioritize:

1. Small reference catalogs repeatedly loaded into forms (products, customers, accounts, warehouses) after confirming bounds and freshness.
2. High-volume transaction tables with server filtering and stable `id`, `unique_id`, or invoice identity.
3. Reports that fan out to multiple actions; allow independent sections to appear as ready.
4. Invoice/return forms only after tracing all child tables, stock impact, formula fields, status transitions, and recovery contracts.

Do not impose MySQL JSON aggregation on Sheet-backed TopLight routes. Use Sheets batch range reads or Firestore native queries according to the actual backend.

### 7.3 Valley Foods

Inventory HR, payroll, attendance, deductions, contracts, vacation allocation, overtime, monthly salaries, products, parties, cash, sales/returns, purchasing, warehouse movement, manufacturing recipes/orders, work centers/assets, quality, client reports, and the four HR reference-setting pages.

Suggested order:

1. Reference option catalogs with bounded payloads and independent freshness rules.
2. Read-only dashboards/reports, preserving permission-dependent field masking (including costs) and section-level render behavior.
3. Single-tab lists with stable IDs and bounded range reads where source row order is valid.
4. `VF_MOs` list, after separating header rows from recipe/products/categories/shifts/work-center/reference options. Its existing narrow scan still reads the full header set and computes options from full data.
5. Multi-tab form saves (manufacture, sales/returns, purchasing, payroll/attendance) only after isolated contract and recovery verification.

`MFG_FAST_READ_` and the unrelated `MFG_BATCH_WRITES_` switches remain disabled. The `MFG_PLANNED_SAVE_`, `FAST_SAVE_CORE_`, and `FORM_CONTRACTS_CORE_` switches are enabled only for the VF_MOs save pilot after isolated synthetic save, reconciliation, stale-token and recovery checks. Production latency measurements and a staging comparison remain outstanding. Never infer that a Sheets row window is a matched-result page.

### 7.4 Assessment Center

Inventory assessment definitions, batches, assignments, result lists, candidate detail, and public `ac_take`. Separate public and authenticated paths explicitly. Catalogs may be candidates for caching; candidate answers, identity data, and individual results require privacy/retention/export review before browser persistence. Keep attempt submission and scoring server-authoritative and idempotent. Do not apply stale-while-refresh to a write/submit flow.

---

## 8. Main settings and control-plane rollout

Central admin has distinct consistency and privacy requirements. Treat its tabs as a separate track even if they use the shared ERP table.

### Areas to inventory

- Companies and enabled/main-page configuration.
- Users, company assignment, role assignment, status, and password-reset actions.
- Role permission matrix and user-role mappings.
- Registered system pages and page metadata.
- Currency list and rates.
- Subscription invoices and company billing.
- Performance views and diagnostic retention.
- System kill switch.
- Backups and restore/download workflows.

### Safe optimization order

1. Make each admin tab load only when selected; cancel/ignore responses after the operator changes tabs. Avoid fetching every tab's dataset at app startup.
2. Measure each list endpoint and its dependency fan-out. Batch related read-only metadata into one compact envelope only when permissions and freshness are identical.
3. Use table-local search/sort for small settings lists already fully loaded; if the set grows, use a real server page/search route rather than a client-side false global search.
4. Cache low-sensitivity reference data only with server versioning and short TTLs. Do not use a browser cache as authority for companies, users, roles, page grants, currency writes, kill-switch decisions, invoices, or backups.
5. Return only fields needed by the selected tab. Do not expose credentials, secrets, connector configuration, password material, or internal diagnostics in list JSON.
6. Keep create/update/delete actions separate from reads. An edit form may use a cached display row, but the write endpoint must reauthorize and validate the current record/version.
7. Keep the Performance tab super-admin-only at both route and data layers. It should show timings, coverage, and sample counts without row content. Loading metrics must never trigger a business-table mutation.
8. Keep kill-switch and backup views out of generic auto-refresh/caching. Their actions are control-plane operations and require existing confirmation/authorization paths.

No settings data or permission matrix should be used as disposable test data. Validate admin-list performance with a read-only isolated snapshot or static harness, then separately verify that write actions remain untouched.

---

## 9. Forms and slow updates across all companies

For every form submitted as one logical document, map the browser request to all headers, lines, inventory movements, accounting rows, status records, and audit events it can affect.

### Read-side form loading

- Load static reference catalogs once per page/user/company within declared bounds.
- Fetch record-specific detail and child rows by stable identity when a user opens the form, not for every row in a list.
- Share a reference snapshot within one form session instead of re-reading the same table for every section.
- For dependent dropdowns, keep the dependency and refresh behavior explicit (e.g. company → clients or recipe → materials).
- A browser cache can seed options but a save must revalidate selected IDs and business rules on the server.

### Save-side optimization

Candidate design: one request ID; one request-scoped snapshot per affected table; reusable maps keyed by `id`/UUID; all authorization, ownership, stock, status, and formula checks before mutation; compute the complete diff; skip unchanged values; batch allowed cell patches/appends/deletes; preserve formulas; write audit/recovery state; return a compact authoritative reconciliation result.

Keep the current legacy write path until isolated parity confirms:

- same rows and fields persist;
- formulas and protected columns remain untouched;
- stock and accounting effects match;
- request retries cannot duplicate documents or child rows;
- edit tokens/version checks detect conflicts;
- partial multi-sheet failures can be recovered/reconciled;
- permissions are enforced server-side on every attempt;
- browser list refresh is replaced only when the returned state is authoritative.

Do not validate saves against production tables. If no safe isolated data copy exists, implement only read-only preparatory code and leave write flags closed.

### Individual field/row updates

Trace each repeated `patchRowByCriteria_`, formula write, and list refresh. Locate multiple row keys in one safe read, keep a strict writable-column allowlist, batch only adjacent or API-supported writes, and preserve formula/value behavior. For MySQL use direct prepared keyed updates; for Firestore use document identity/update time. Avoid adding sheet indexes or schema columns under a read-performance plan.

---

## 10. Diagnostics and success measures

### User-visible performance

For each pilot and rollout page record cold and warm:

- shell/skeleton paint;
- cache read/validation/paint and cache age;
- time to first useful server data;
- time to complete hydration/report;
- search latency and whether search was local, partial, or global;
- rows/fields/bytes requested, loaded, rendered, and exported;
- RPC count, queue delay, timeout/failure, retry count;
- MySQL connection, SQL, JDBC traversal, JSON parse where applicable;
- Sheets range size/rows scanned/cells read where available;
- Firestore documents returned and cursor count;
- browser parse, map, sort, filter, and render time.

For saves record lock wait/hold, reads by table, formula probes, planned/written/skipped operations, retries, partial commits, recovery and reconciliation time.

### Privacy and measurement rules

- Verify super-admin status on the server before returning internal diagnostics. A browser boolean is never authorization.
- Diagnostics must contain IDs needed for request correlation only; never include row values, search text, SQL/filter values, credentials, tokens, connector URLs, or personal record data.
- Keep timeout distinct from SQL failure. RPC minus named database time is outside that wrapper, not automatically network time.
- Do not claim faster behavior without same-environment measurements at comparable row count, fields, payload, cache state, and request concurrency. Compare distributions (p50/p95) after adequate samples rather than one run.

### Success targets

Establish baselines first; do not invent a universal millisecond SLA from the product table. For each page agree an acceptable first-useful-view target, warm-cache target, hydration/search target, payload ceiling, and failure/timeout rate based on the actual workflow. Track these against the old route and preserve the results with the implementation notes.

---

## 11. Rollout phases and exit gates

### Phase 0 — Freeze scope and map the system

Deliver route, read, write, storage, identity, permission, cache, and export inventories for TopChemical, TopLight, Valley Foods, Assessment Center, and central settings. Rank endpoints by user wait and risk.

**Exit:** every registered route and RPC has a source/owner or an explicit unknown; business writes and sensitive fields are mapped for priority modules.

### Phase 1 — Baseline and admin-only metrics

Use existing authorized diagnostic surfaces where possible. Add only low-risk, server-gated timing instrumentation after verifying that it cannot write business data. Capture cold/warm and first/completion numbers; confirm no metrics show for regular users.

**Exit:** each first-wave endpoint has an attributable timing breakdown and payload/row projection baseline.

### Phase 2 — Finalize shared contract and loader

Document/version the envelope; complete source-specific validators; define cursor/high-water semantics; implement cache scoping and invalidation helpers; finish the shared progressive list component. Keep endpoint adoption opt-in.

**Exit:** static contract review and isolated tests show malformed/oversize/stale/out-of-order responses fail closed; old callers are unchanged.

### Phase 3 — Complete MySQL product pilots

Use Stock Scan as the catalog reference. Validate Products Live cursor pages, server search, sort, mutations, cache invalidation, export, and rendering in an isolated environment. Keep old response available as fallback. Only propose enabling after the user reviews concrete cold/warm measurements; never deploy online as part of this plan.

**Exit:** every page/query/filter returns no missing or duplicate stable IDs in parity comparison; user-visible scope is correct; permissions and add/edit/soft-delete match legacy behavior.

### Phase 4 — MySQL reports and remaining MySQL pages

Preserve Financial Ratios progressive sections. Tune production capability, sales capacity, and other measured slow MySQL reports one at a time. Use JSON aggregation only where it reduces measured traversal and bounded output remains safe.

**Exit:** each endpoint has plan evidence for material SQL changes, matching totals/fields, bounded payload, and comparable p50/p95 results.

### Phase 5 — Catalogs and dropdowns in every company

Prioritize repeated small lookups used by TopChemical, TopLight, Valley Foods, Assessment Center, and main settings. Keep unique IDs separate from labels. Apply local search only for complete bounded catalogs; use server query fallback or paged search for overflow.

**Exit:** saved selections still submit the authoritative ID; stale catalog behavior and post-write invalidation are verified; no large or sensitive data set is silently cached.

### Phase 6 — Company table/report migration waves

Work company by company. Start with read-only tables, then independent reports, then transaction lists, then detail views. Each page gets its own projection, cursor/filter, cache, search, export, and rollback contract. Do not remove show-all or existing navigation until parity passes.

**Exit:** all migrated pages show truthful completeness and correct global search; non-migrated pages remain tracked with reasons and estimates.

### Phase 7 — Central settings/control plane

Optimize lazy tab loading, cancel stale tab responses, batch safe read metadata, and page large lists where necessary. Keep write actions and authorization separate. No stale cached permissions or settings may authorize actions.

**Exit:** settings reads are measurably bounded/fewer RPCs; admin writes, grants, billing, kill-switch, and backup operations preserve existing confirmation and access checks.

### Phase 8 — Forms and write batching

Build isolated parity cases for one low-risk multi-table form before generalizing. Introduce request-scoped snapshots and batch writes behind narrow flags. Then migrate one document family per company.

**Exit:** persisted-state parity, retry safety, conflict detection, formulas, audits, and recovery pass outside production; the browser avoids a redundant full reload where the action response is authoritative.

### Phase 9 — Retire legacy paths page by page

Only after each replacement passes review, switch its page flag, observe authorized measurements, then remove obsolete callers in a later change. Maintain a documented narrow rollback path. Do not remove shared legacy helpers while any route still depends on them.

**Exit:** route inventory shows every page on a deliberate strategy or a justified legacy exception; no false global search, hidden truncation, unbounded first view, or unauthorized diagnostics remain.

---

## 12. Per-endpoint validation matrix

| Area | Required cases |
|---|---|
| Response contract | empty, one row, page boundary, over-bound, malformed JSON/shape, duplicate identity, unknown schema version |
| Paging | first page, middle page, final page, repeated cursor, invalid/scope-mismatched cursor, source-version change |
| Concurrent data | insert, update, soft delete, physical delete, row movement, and change to a reference option while hydration runs |
| Search | Arabic normalization where currently supported, ID/code, filter combinations, outside-first-page match, no result, rapid query changes |
| Cache | cold, fresh, stale, expired, invalid, storage unavailable, role/company switch, successful write invalidation, external write visibility |
| Table UI | sort reset/retention, display paging, append without duplicates, selection/detail actions, loading/error/retry, hidden-tab resume |
| Export | current page vs loaded vs filtered vs complete scope, accurate count, bounded file size, sensitive-column exclusion |
| Authorization | ordinary user response, super-admin diagnostics, unauthorized read/write, permission change while cached |
| Save parity | changed and unchanged rows, formulas, child deletion, retry, duplicate submit, conflict, stock/accounting effects, partial-write recovery |
| Performance | cold/warm p50/p95, RPC/queue, source phases, payload, client parse/render, completion and failure rate |

For list parity, compare the set of all stable keys across all candidate pages to a legacy snapshot, then compare every field used for display, filtering, export, joins, and subsequent editing. Page one equality is not enough.

---

## 13. Risks and decisions

| Risk/unknown | Plan response |
|---|---|
| JSON aggregation makes a heavy query slower | Compare query plans and end-to-end timings; use it only when the total path improves or JDBC traversal is the proven bottleneck. |
| Sheets row paging still scans everything | Report scan cost honestly; select a stable row-window design only if table behavior supports it, otherwise retain the measured route pending a separately approved index/backend design. |
| IDs are not sortable timestamps | Keep identity separate from order; define `(timestamp, unique_id)` or another proven compound cursor. |
| Cursor pages span concurrent changes | Name high-water/version guarantees accurately; deduplicate; test inserts/updates/deletes; do not promise an MVCC snapshot without one. |
| Warm cache exposes stale/deauthorized data | Scope, expire, invalidate and reauthorize server-side; avoid sensitive cache; never use cache for write authority. |
| Many sequential pages increase total completion time | Optimize first view; choose page size and hydration budget from measurements; allow explicit continuation and truthful totals. |
| Settings cache becomes an authority source | Do not use cached display settings to authorize writes or route access; always re-read/validate on server. |
| Multi-tab save partially commits | Keep legacy behavior until isolated recovery and idempotency tests prove the candidate safe. |
| Universal migration increases outage scope | Migrate one endpoint/page behind its own flag and preserve fallback until acceptance. |

Decide page-specific values during implementation: exact total needs, row/byte/time limits, cache TTL, permitted stale display, global search fields, export scope, and acceptable p50/p95. Do not use one setting for every company or backend.

---

## 14. Constraints for execution

- Work in the existing project folders and preserve unrelated workspace changes.
- Do not add, edit, delete, seed, reset, or otherwise mutate production rows/documents. Do not change production schemas, settings, or permissions.
- Do not use production save/add/edit/delete RPCs as a test harness.
- Do not stage or commit unless separately requested. Do not push or deploy Apps Script online under the current instruction.
- Inspect scripts and harnesses before running them. Use static/read-only validation unless the user explicitly asks for tests and the target is demonstrably isolated from production.
- Keep new page and save candidates opt-in until the relevant isolated parity and performance evidence exists.
- Report what is active, what remains gated, which validation was performed, and whether any remote action or data mutation occurred.

## Completion definition

The system-wide effort is complete when every registered company page, public route, main setting, list, dropdown, report, and multi-table form has an inventoried source-specific read/write contract; first view and global search are truthful and appropriately bounded; caches respect identity, permissions, freshness, and invalidation; saves preserve formulas, audit, idempotency, and recovery; internal metrics are super-admin-only; and each rollout has measured parity and user-visible performance evidence. The complete system does not need to use one database mechanism—the shared behavior contract is consistent while the read strategy follows MySQL, Sheets, or Firestore capabilities.
