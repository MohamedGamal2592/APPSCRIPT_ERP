# EXECUTION PROMPT — Valley Foods Quality Module v2

Paste this whole file as the first message of a new session. Work phase by phase; do not skip Phase 0.

---

## ROLE

You are implementing the audited plan **`Plan_Quality_Module_v2.md`** (repo root) in the
Valley Foods codebase at `D:\Work\Script`. The plan is the single source of truth: read it fully
before touching anything. Every mechanism it cites was verified in code — reuse it, do not invent
alternatives. If a cited mechanism is missing or behaves differently, STOP and report instead of
improvising.

**Hard rules**
- Reuse only what exists. New code is allowed only for: `uidV7_()`, the SOP PDF-freeze helper, the
  quality handlers/pages themselves, and the four Phase-0 fixes listed below.
- No schema changes to existing tables beyond **append-only** columns (`ensureSheet_` appends at the
  end; never reorder or rename existing headers).
- Arabic-first UI, RTL, Cairo theme, `UIC.*` components, `companyCall` — same as every page.
- No comments beyond what the file style already carries; match surrounding code.
- Do not delete or weaken existing tests. Updating a test is allowed only when the plan changes the
  contract intentionally — say so explicitly in the phase report.
- Never commit unless asked.

## CONTEXT TO LOAD FIRST

1. `Plan_Quality_Module_v2.md` — the plan (tables, pages, actions, workflows, phases, ID strategy).
2. `Company_ValleyFoods_Actions.js` — `PAGE_ACCESS` (l.173), `ACTION_TABLES` (l.368), `PAGE_TABLES`
   builder (l.503), `guard_` (l.572), `register` (l.156; `get_page_versions` registered l.680),
   `ensureSheet_` (l.767/1453), `uid16_` (l.641), `settingsUniqueViolation_` (l.4312),
   `attachmentPolicy_` (l.14661), `UPLOAD_PAGE_BY_SHEET`/`UPLOAD_META` (l.163/4111),
   `vfRefsCached_`/`vfBustRefs_` (l.44/4718), `safeRows_` (l.6614), `EMP_INFO_HEADERS` (l.732).
3. `Code.js` — `executeWithLock_` (l.899), `getNextId_`/`getNextIdUnderLock_` (l.1050/1026),
   `_hasUnifiedAccess_` (l.3527), `unifiedCheck_` (l.3539), `getRoleAuthorityMatrix_` (l.3472),
   `logHistory_` (l.2151), `readTableVersions_` (l.854), `requireAttachmentBinding_` (l.7447),
   `computeDigest` usage (l.358), `SessionManager_` (l.5036).
4. Patterns to copy: `Company_ValleyFoods_Products.html` (list + modal: `companyCall` l.68,
   `UIC.dataTable` l.306, `UIC.openModal` l.366); `Company_ValleyFoods_MfgOrders.html` (tabbed modal:
   `tabBtn` l.78, `switchTab` l.377); `Company_ValleyFoods_Cash.html` (instant attachments, l.~300+);
   `Company_ValleyFoods_Registry.js` (page registration); `Company_ValleyFoods_Nav.html` (nav groups).
5. `tools/verify/` — the offline harness pattern. Closest examples: `vf_mfg_request_recovery.js`
   (slice-eval of real code with stubs), `s21_shifts_and_expenses.js`, `s6_client_gate.js`,
   `request_guard.js`. `tools/ui_check.js` gate C9 requires `node tools/build_preview.js` after any
   change to a preview source (CSS_Tokens, UI_Components, Client_Helpers, Code.js, company Actions).

---

## PHASE 0 — prerequisites (do these first, in one commit-sized batch)

1. **`uidV7_()` in `Code.js`** (global, next to `getNextIdUnderLock_`). Use the exact implementation
   from the plan §0. Add `tools/verify/quality_uidv7.js`: extract the function from `Code.js` via `vm`
   and assert (a) RFC 9562 v7 regex, (b) uniqueness over ≥5000 ids, (c) timestamp round-trip,
   (d) later-ms ids sort lexicographically after earlier ones. Offline, no Google services.
2. **Array support in `ACTION_TABLES`**: values may be a string (legacy) or an array of table names.
   - `PAGE_TABLES` builder (l.503) must flatten arrays.
   - `tableForAction_` (l.557) returns a display string (join arrays with `،`) for the log column.
   - Add one regression check proving a legacy string entry still works.
3. **Matrix `Full` option**: `0_ERP_Management.html` l.485–486 access select gets
   `<option value="Full">Full</option>`. Verify `adminSaveMatrix_` passes the value through unchanged
   (it does — no enum validation) and `_hasUnifiedAccess_` normalizes `Full` → `full`.
4. **`email` column on `valley_employee_info`**: append to `EMP_INFO_HEADERS` (l.732) and rely on
   `ensureSheet_` to add it at the end of the live sheet. No other change; nothing reads it yet.
5. **Module scaffolding**: 5 registry entries in `Company_ValleyFoods_Registry.js` (`vf_quality_sops`,
   `vf_quality_my_acks`, `vf_quality_ncr`, `vf_quality_dashboard`, `vf_quality_audits` — last one
   `nav:false`, all `nav:false` except dashboard), the `الجودة` group in
   `Company_ValleyFoods_Nav.html`, `attachmentPolicy_` entries + `UPLOAD_PAGE_BY_SHEET`/`UPLOAD_META`
   entries for `valley_quality_sop_versions` (field `pdf`), `valley_quality_ncrs`/`capas`/`audits`
   (field `attachment`), per plan §2/§6. Placeholder template files exist only if you create them now —
   otherwise register in Phase 1 when the page exists (registry entries without templates break routing).

**Phase-0 verify:** `node tools/verify/quality_uidv7.js`; `node --check` on `Code.js` and the extracted
script of `0_ERP_Management.html`; `node tools/build_preview.js` + `node tools/ui_check.js` (C9 must
pass); `node tools/verify/request_guard.js`. Report exact line numbers of every edit.

---

## PHASE 1 — SOPs (tables 1–4, page `vf_quality_sops`)

- Sheets via `ensureSheet_`; `unique_id = uidV7_()`; `id` via `getNextId_`.
- `sop_code` allocation inside `executeWithLock_` with a uniqueness scan (pattern:
  `settingsUniqueViolation_`). Format `SOP-<CAT>-NNN`, zero-padded.
- Actions exactly as the plan §6 (page/access/tables), registered with `ValleyFoods.register`.
  Approve/reject/make-effective are **separate actions with `access:'full'`** — no in-handler
  super-admin checks; approver ≠ author enforced in the handler.
- Tabbed modal (copy `MfgOrders` tabs): Document (rich-text `contenteditable` + minimal toolbar),
  Forms (inline CRUD), History (timeline from `valley_quality_sop_events` + `logHistory_`),
  Acknowledgements (read-only count + launch button, wired in Phase 2).
- **PDF freeze helper** (the only genuinely new server capability): on Submit, HTML → Google Doc via
  Drive advanced service (`Drive.Files.insert`, convert) → export PDF (`Drive.Files.export`) → store
  `pdf_ref`/`pdf_id`/`pdf_sha256` (`Utilities.computeDigest SHA_256`). Any failure = `vfNotApplied_`
  (zero writes). Editable only while Draft/Rejected.
- Every status change writes a `valley_quality_sop_events` row; `logHistory_` everywhere else too.

**Phase-1 verify:** transition harness (illegal transitions refused pre-mutation; legal path
Draft→…→Effective→Obsolete; approver=author refused); permission harness (write cannot approve/close);
`node --check` all touched files; ui_check C9 if preview sources changed.

## PHASE 2 — Acknowledgements (table 5, page `vf_quality_my_acks`)

- `launch_quality_acks` (`full`): applicability filter (department/role), include new hires, skip
  already-signed version, close previous pending as `Superseded`, bulk insert.
- `get_quality_my_acks`: **server-side filter by session email** (pattern: `list_my_sessions_`,
  `Code.js` l.5035). `sign_quality_ack`: own row only; typed name match; server stamps email + time.
- `record_quality_ack`: supervisor-recorded fallback (no employee login required).
- Ack page opens the frozen PDF through the attachment viewer (`attachmentPolicy_` entry, page param).

**Phase-2 verify:** launch idempotency (re-launch → no duplicates); cross-user sign refused;
supersede-on-new-effective works; `node --check`.

## PHASE 3 — NCR / CAPA (tables 6–7, page `vf_quality_ncr`)

- Fields/statuses exactly per plan §3.6/§3.7 and workflow §4: `capa_required` + justification,
  root cause set at review, disposition, `Cancelled`/`Rejected`, standalone CAPA, `effectiveness_check_date`.
- `close_quality_ncr` is `full`; other transitions `write`; every refusal pre-mutation.

**Phase-3 verify:** workflow harness covering every illegal transition (refused, zero writes) and the
full legal path; overdue-CAPA computation check.

## PHASE 4 — Dashboard + Audits (tables 8–9, pages `vf_quality_dashboard`, `vf_quality_audits`)

- Dashboard cached with `vfRefsCached_`, busted by every quality write (`vfBustRefs_`); KPIs per plan §1.
- Audits/findings + `escalate_finding_to_ncr` (sets `ncr_id` back-link).
- No per-row server calls anywhere (batch reads, memoized `getAllRecords_`).

**Phase-4 verify:** dashboard math harness on fixtures; audits escalation harness; full suite pass.

---

## GLOBAL VERIFICATION PROTOCOL (every phase)

1. `node --check` on every touched `.js`; for `.html`, copy to `%TEMP%\opencode`, replace
   `<?!= ... ?>` with `0`, extract `<script>` blocks, `node --check` each.
2. Run the focused harness(es) for the phase + `node tools/verify/request_guard.js`.
3. If any preview source changed: `node tools/build_preview.js` then `node tools/ui_check.js` —
   C9 must pass.
4. Known pre-existing failures — do NOT chase them: ui_check C5/C7, `s15_iphone_rest.js`
   (`Company_TopChemical_ExecSales.html`), `appsheet_attachments.js` (CustomsOffice assertion).
5. Report per phase: files + line numbers, what was verified, what failed, what you changed in tests
   and why.

## DEFINITION OF DONE

- All Phase 0–4 todos in `Plan_Quality_Module_v2.md` ticked (edit the file as you complete them).
- Pages visible in ERP_Management → صفحات النظام under module `Quality`, grantable per role (incl. Full).
- One end-to-end offline harness proving: create SOP → submit (PDF frozen) → approve → effective →
  launch acks → sign → NCR → CAPA → verify → close → dashboard reflects it.
- No regression in the existing verify suites (apart from the known pre-existing failures above).

## STOP CONDITIONS (report, do not improvise)

- Drive `insert`/`export` unavailable in the deployment → stop after Phase 1 and propose an alternative
  freeze path (do not silently downgrade the PDF contract).
- A plan-cited mechanism missing/changed → stop and quote the file+line you found instead.
