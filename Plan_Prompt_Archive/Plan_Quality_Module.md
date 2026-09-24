# Plan — Valley Foods Quality Module (Qualio-like, simplified)

> **⚠ SUPERSEDED by `Plan_Quality_Module_v2.md`** — the v2 plan is the audited, leaner version and
> switches `unique_id` to UUIDv7. This file is kept for reference only.

**Status:** Draft for review · **Company:** Valley Foods (`9940659bd83035d7`) · **Module tag:** `Quality`
**Goal:** a simple quality-management module for SOPs and core QA activities, built on the existing
Valley Foods patterns (company actions, `valley_*` sheets, per-page grants, shared UIC components).
Scope is deliberately smaller than Qualio: no supplier portal, no e-signature vendor, no workflow
engine — just controlled SOPs, acknowledgements, NCR/CAPA and internal audits.

---

## 1. Scope

### In scope
| # | Capability | What it means here |
|---|---|---|
| 1 | **SOP control** | Author, review, approve, version, make effective, obsolete; controlled PDF attachment per version; periodic review date |
| 2 | **Acknowledgement & training** | Launch read-and-sign tasks for active employees when an SOP becomes effective; employee signs electronically; simple training log |
| 3 | **Non-conformances (NCR)** | Capture, classify by source/severity, root cause, status workflow, evidence attachments |
| 4 | **CAPA** | Corrective/preventive actions linked to an NCR, owner + due date, verification of effectiveness |
| 5 | **Internal audits** | Audit record + findings; a finding can escalate to an NCR |
| 6 | **Quality dashboard** | Overdue SOP reviews, open NCRs, overdue CAPAs, acknowledgement completion %, upcoming audits |

### Out of scope (candidates for a later phase — see Phase 5)
Supplier quality scoring, equipment calibration, checklist templates, automated email reminders,
external audit portals, PDF rendering/e-sign provider.

---

## 2. Conventions this module follows (already in the repo)

- **Tables** live in the company spreadsheet, named `valley_quality_*`; created/updated through
  `ensureSheet_(dbId, name, headers)` (append-only header repair, never moves existing columns).
- **IDs**: `unique_id` = `uid16_()`, `id` = `getNextId_()`/`mfgNextIntegerId_`-style max+1 allocator;
  every row carries `user` (email) and `created_at`.
- **Server actions**: each `module_action` gets a `PAGE_ACCESS[action] = { page, access }` entry and an
  `ACTION_TABLES[action]` entry, then `ValleyFoods.register(action, handler)`. `PAGE_TABLES` (the
  version-watch map) is derived automatically from those two maps.
- **Pages**: registered in `Company_ValleyFoods_Registry.js` (`pages: [...]` with
  `{ action, template, title, label, nav:false }`); template = one HTML file using `companyCall` +
  `include(...)`. A page becomes usable only after it is granted per role in
  ERP_Management → صلاحيات الأدوار (its row appears in صفحات النظام automatically).
- **Attachments**: `UIC.fileField({ instant:true, sheet, field, formModalId })` + the shared
  `add_upload_file` allowlist (`UPLOAD_PAGE_BY_SHEET` / `UPLOAD_META`) + an `attachmentPolicy_` entry
  for the `?download=attachment` viewer. Store `<field>` (ref) + `<field>_id` (Drive id) pairs.
- **History**: every create/update/status change goes through `logHistory_` so the existing
  "السجل" (record history) panel works with zero extra UI.
- **Version watch / polling**: pages call `get_page_versions` with their page id — no extra config.
- **Module tag**: `Quality` already exists in the module options list used by صفحات النظام.

---

## 3. Tables (new sheets)

### 3.1 Phase 1 — SOP core
| Sheet | Purpose | Columns |
|---|---|---|
| `valley_quality_sop_categories` | Reference list (Production, Warehouse, QC Lab, HR, …) | `unique_id, id, category_name_ar, category_name_en, is_active, user, created_at` |
| `valley_quality_sops` | SOP master record | `unique_id, id, sop_code, title_ar, title_en, category_id, version, status, owner_email, department, description, effective_date, next_review_date, review_frequency_months, attachment, attachment_id, approved_by, approved_at, user, created_at` |
| `valley_quality_sop_versions` | Immutable version history (one row per released/archived version) | `unique_id, id, sop_id, version, change_summary, attachment, attachment_id, status, approved_by, approved_at, created_by, created_at, user` |
| `valley_quality_sop_steps` | Simple sectioned content of the current draft/effective version | `unique_id, id, sop_id, version, sequence, step_title, step_text, is_critical, user, created_at` |

Notes:
- `sops.version` = current live version integer; `sop_code` unique (e.g. `SOP-PRD-001`).
- `category_id` is a ref to `valley_quality_sop_categories.unique_id` (label = `category_name_ar`).
- `attachment` holds the controlled PDF of the **current** version; older files stay on
  `valley_quality_sop_versions`.

### 3.2 Phase 2 — Acknowledgement & training
| Sheet | Purpose | Columns |
|---|---|---|
| `valley_quality_acknowledgements` | One row per employee × SOP version | `unique_id, id, sop_id, sop_version, emp_id, employee_name, status, read_at, signed_at, signature_note, user, created_at` |
| `valley_quality_training_records` | Simple training log (optionally linked to an SOP) | `unique_id, id, emp_id, employee_name, topic, sop_id, training_date, trainer, result, notes, attachment, attachment_id, user, created_at` |

Notes:
- `status` ∈ `Pending | Read | Signed` (electronic signature = checkbox + typing the employee name;
  the server stamps email + timestamp).
- Rows are generated in bulk by the "إطلاق الإقرارات" action for all **active** employees
  (`vf_hr_employees` / employee info), skipping ones that already signed that version.

### 3.3 Phase 3 — NCR & CAPA
| Sheet | Purpose | Columns |
|---|---|---|
| `valley_quality_ncrs` | Non-conformance / deviation | `unique_id, id, ncr_code, ncr_date, source, severity, description, product_id, batch_code, mo_uid, department, detected_by, status, root_cause, closed_by, closed_at, attachment, attachment_id, user, created_at` |
| `valley_quality_capas` | Corrective/preventive actions | `unique_id, id, capa_code, ncr_id, action_type, description, owner_email, due_date, status, implemented_at, verified_by, verified_at, effectiveness_notes, attachment, attachment_id, user, created_at` |

Notes:
- `source` ∈ `Production | Warehouse | Supplier | Customer | Audit | Other`;
  `severity` ∈ `Minor | Major | Critical`.
- `mo_uid` is an optional soft link to `valley_manufacture_header.unique_id` (traceability to the batch).
- `ncr_id` = `valley_quality_ncrs.unique_id` (label = `ncr_code`).
- Row-level history uses the existing `logHistory_` — no extra history table.

### 3.4 Phase 4 — Audits
| Sheet | Purpose | Columns |
|---|---|---|
| `valley_quality_audits` | Internal/external audit record | `unique_id, id, audit_code, audit_date, audit_type, area, auditor_email, status, summary, attachment, attachment_id, user, created_at` |
| `valley_quality_audit_findings` | Findings per audit | `unique_id, id, audit_id, finding_no, finding_type, description, clause_ref, ncr_id, capa_required, status, user, created_at` |

Notes:
- `audit_type` ∈ `Internal | External | Supplier`; `status` ∈ `Planned | In Progress | Completed | Closed`.
- `finding_type` ∈ `Observation | Minor NC | Major NC | Opportunity`; `ncr_id` is set when a finding is
  escalated to an NCR (button "ترقية إلى NCR").

---

## 4. Workflows (state machines)

### 4.1 SOP lifecycle
```
Draft ──submit──▶ In Review ──approve──▶ Approved ──make effective──▶ Effective
  ▲                    │                                                 │
  └────── reject ◀─────┘                            new version (clone) │
                                                                        ▼
                                              Effective(under revision) ──▶ Obsolete
```
- `Draft → In Review`: any writer. `In Review → Approved` / `Approved → Effective` / `Effective → Obsolete`:
  page `full` grant (or super-admin). Approve stamps `approved_by/approved_at`.
- Making effective requires `effective_date` and `review_frequency_months`; server computes
  `next_review_date = effective_date + frequency`.
- "New version": clones the SOP to `version+1`, archives the old row into `valley_quality_sop_versions`,
  status returns to `Draft`. Acknowledgements are **not** auto-copied — the new version must be launched
  again (that is the point of controlled documents).
- Creating a new version while a previous version has pending acknowledgements is allowed; the old
  pending rows are closed as `Superseded` (status value added in Phase 2).

### 4.2 Acknowledgement
```
launch (SOP Effective) ──▶ Pending ──open──▶ Read ──sign──▶ Signed
                                   └────────────── superseded (new version) ──▶ Superseded
```
- "إقراءاتي" page lists the signed-in user's Pending/Read rows; signing requires the typed full name
  to match the employee record and the checkbox; server writes `signed_at` + the session email.

### 4.3 NCR / CAPA
```
NCR:  Open ──review──▶ In Review ──assign CAPA──▶ CAPA Assigned ──all CAPAs Done──▶ Implemented
                                                                                       │
                                                                    verify effectiveness│
                                                                                       ▼
                                                                                    Verified ──▶ Closed
CAPA: Assigned ──start──▶ In Progress ──done──▶ Done ──verify──▶ Verified ──▶ Closed
```
- `In Review` requires `root_cause`; `CAPA Assigned` requires at least one CAPA row;
  `Implemented` requires every linked CAPA to be `Done` or beyond; `Verified`/`Closed` require page
  `full` grant and stamp `verified_by/verified_at` (CAPA) and `closed_by/closed_at` (NCR).
- Overdue CAPA = `due_date < today` and status not in `Done/Verified/Closed` (dashboard highlight).

### 4.4 Audit
```
Planned ──start──▶ In Progress ──complete findings──▶ Completed ──▶ Closed
                          └── finding ──▶ NCR (escalation, optional)
```
- `Completed` requires a summary; findings can be added while `In Progress`/`Completed`.
- Closing an audit with open NCRs is allowed but the dashboard flags it.

---

## 5. Pages, actions & permissions

### 5.1 Pages (Registry entries, all `nav:false` except the dashboard)
| Page id | Template file | Arabic label | Purpose |
|---|---|---|---|
| `vf_quality_dashboard` | `Company_ValleyFoods_QualityDashboard.html` | لوحة الجودة | KPIs + overdue lists |
| `vf_quality_sops` | `Company_ValleyFoods_QualitySops.html` | إجراءات التشغيل (SOP) | List, create, edit, status buttons |
| `vf_quality_sop_view` | `Company_ValleyFoods_QualitySopView.html` | تفاصيل الإجراء | Steps, versions, ack status, attachments |
| `vf_quality_my_acks` | `Company_ValleyFoods_QualityMyAcks.html` | إقراراتي | Employee read & sign |
| `vf_quality_ncr` | `Company_ValleyFoods_QualityNCR.html` | عدم المطابقات والإجراءات التصحيحية | NCR + CAPA |
| `vf_quality_audits` | `Company_ValleyFoods_QualityAudits.html` | المراجعات الداخلية | Audits + findings |
| `vf_quality_settings` | `Company_ValleyFoods_QualitySettings.html` | إعدادات الجودة | SOP categories, review frequencies |

### 5.2 Actions (each gets `PAGE_ACCESS` + `ACTION_TABLES` + `register`)
| Action | Page | Access | Table |
|---|---|---|---|
| `get_quality_dashboard` | `vf_quality_dashboard` | read | (aggregates, none) |
| `get_quality_sops` | `vf_quality_sops` | read | `valley_quality_sops` |
| `save_quality_sop` | `vf_quality_sops` | write | `valley_quality_sops` |
| `change_quality_sop_status` | `vf_quality_sops` | write (approve steps: full) | `valley_quality_sops` |
| `get_quality_sop_view` | `vf_quality_sop_view` | read | `valley_quality_sops` |
| `save_quality_sop_step` | `vf_quality_sop_view` | write | `valley_quality_sop_steps` |
| `get_quality_acks` | `vf_quality_my_acks` | read | `valley_quality_acknowledgements` |
| `launch_quality_acks` | `vf_quality_sops` | write | `valley_quality_acknowledgements` |
| `sign_quality_ack` | `vf_quality_my_acks` | write | `valley_quality_acknowledgements` |
| `get_quality_ncrs` | `vf_quality_ncr` | read | `valley_quality_ncrs` |
| `save_quality_ncr` | `vf_quality_ncr` | write | `valley_quality_ncrs` |
| `save_quality_capa` | `vf_quality_ncr` | write | `valley_quality_capas` |
| `change_quality_ncr_status` | `vf_quality_ncr` | write (verify/close: full) | `valley_quality_ncrs` |
| `get_quality_audits` | `vf_quality_audits` | read | `valley_quality_audits` |
| `save_quality_audit` | `vf_quality_audits` | write | `valley_quality_audits` |
| `save_quality_finding` | `vf_quality_audits` | write | `valley_quality_audit_findings` |
| `get_quality_settings` | `vf_quality_settings` | read | `valley_quality_sop_categories` |
| `save_quality_category` | `vf_quality_settings` | write | `valley_quality_sop_categories` |

### 5.3 Permissions model
- Page grants as usual: `read` / `write` / `full` per role in صلاحيات الأدوار.
- Suggested roles: **Quality Manager** → `full` on all quality pages; **Supervisor/Production** →
  `write` on NCR + read on SOPs; **All employees** → `read` + `write` on `vf_quality_my_acks` only.
- Approvals (SOP approve/effective, NCR verify/close) are enforced **server-side** by checking the
  `full` grant on the page — never by hiding buttons alone.

### 5.4 Attachments (`attachmentPolicy_` additions)
```js
vf_quality_sops:      { company, sheet:'valley_quality_sops',      idField:'unique_id', fileFields:['attachment'], folder:'valley_quality_sops_Files_' },
vf_quality_ncr:       { company, sheet:'valley_quality_ncrs',      idField:'unique_id', fileFields:['attachment'], folder:'valley_quality_ncrs_Files_' },
vf_quality_audits:    { company, sheet:'valley_quality_audits',    idField:'unique_id', fileFields:['attachment'], folder:'valley_quality_audits_Files_' },
vf_quality_training:  { company, sheet:'valley_quality_training_records', idField:'unique_id', fileFields:['attachment'], folder:'valley_quality_training_Files_' }
```
plus matching `UPLOAD_PAGE_BY_SHEET` + `UPLOAD_META` entries (same pattern as the cash/HR uploads).

### 5.5 Navigation
Add a `الجودة` group to `window.VALLEYFOODS_MENU` in `Company_ValleyFoods_Nav.html`:
لوحة الجودة · إجراءات التشغيل · عدم المطابقات · المراجعات الداخلية · إقراراتي · إعدادات الجودة.

---

## 6. Phases & todos

### Phase 0 — Design freeze & scaffolding
- [ ] Confirm table names/columns in this document with the owner (this review).
- [ ] Freeze enums: SOP statuses, NCR source/severity, CAPA statuses, audit types, finding types.
- [ ] Create empty module skeleton: 7 registry entries (templates exist as placeholders), 1 nav group.
- [ ] Add `valley_quality_*` sheets via `ensureSheet_` on first action call (no manual sheet work).
- [ ] Decide default `review_frequency_months` options (6/12/24).

### Phase 1 — SOP core (tables §3.1, pages SOPs + SOP view + settings)
- [ ] Server: `get_quality_sops`, `save_quality_sop`, `change_quality_sop_status`, `save_quality_category`,
      `get_quality_settings`, `save_quality_sop_step`, `get_quality_sop_view`.
- [ ] Server: status transition guard + permission checks (`full` for approve/effective/obsolete).
- [ ] Server: new-version action (clone → archive to `valley_quality_sop_versions`).
- [ ] Client: SOPs list page (search, category/status filters, KPI strip).
- [ ] Client: SOP editor modal (fields + instant-upload PDF + steps editor).
- [ ] Client: SOP view page (steps, version history, launch-acks button placeholder).
- [ ] Client: settings page (categories CRUD, active toggle).
- [ ] Wire attachments: upload allowlist + `attachmentPolicy_` + viewer buttons.
- [ ] Verify: `node --check`; page-registration test (page appears in صفحات النظام); status-transition
      unit harness (Draft→…→Effective→Obsolete, permission refusals are pre-mutation).

### Phase 2 — Acknowledgement & training (tables §3.2, page إقراراتي)
- [ ] Server: `launch_quality_acks` (active employees, skip already-signed version, bulk insert).
- [ ] Server: `get_quality_acks` (my rows) + `sign_quality_ack` (name match + checkbox + stamp).
- [ ] Server: supersede pending rows when a new version becomes effective.
- [ ] Client: إقراراتي page (pending list, read step, sign dialog, my history).
- [ ] Client: SOP view shows ack completion % per version + "إطلاق الإقرارات" action.
- [ ] Client: training records (simple list + add modal on the SOP view or settings page).
- [ ] Verify: launch idempotency (re-launch creates no duplicates), signature validation refusals.

### Phase 3 — NCR & CAPA (tables §3.3, page عدم المطابقات)
- [ ] Server: `get_quality_ncrs`, `save_quality_ncr`, `save_quality_capa`, `change_quality_ncr_status`.
- [ ] Server: transition guards (root cause required, CAPA-required-to-assign, all-CAPAs-done-to-implement).
- [ ] Client: NCR list (filters: status/severity/source/date; overdue CAPA highlight).
- [ ] Client: NCR detail modal (root cause, evidence upload, linked CAPA sub-table with owner/due/status).
- [ ] Client: dashboard contribution (open NCRs, overdue CAPAs).
- [ ] Verify: workflow harness (every illegal transition refused pre-mutation, legal path completes).

### Phase 4 — Audits & dashboard (tables §3.4, pages المراجعات + لوحة الجودة)
- [ ] Server: `get_quality_audits`, `save_quality_audit`, `save_quality_finding`, escalation action
      (finding → NCR with back-link).
- [ ] Server: `get_quality_dashboard` (KPIs: overdue SOP reviews, open NCRs by severity, overdue CAPAs,
      ack completion %, upcoming audits 30 days; all computed from the tables above).
- [ ] Client: audits list + audit detail (findings sub-table, escalate button, attachments).
- [ ] Client: quality dashboard page (KPI cards + drill-down links into filtered lists).
- [ ] Verify: dashboard math harness on seeded fixtures; performance check (reads via `safeRows_`/memoized
      `getAllRecords_`, no N+1).

### Phase 5 — Optional follow-ups (only if requested after review)
- [ ] Supplier quality scoring table (`valley_quality_supplier_scores`) fed by NCR source=Supplier.
- [ ] Equipment calibration register (`valley_quality_equipment`, `valley_quality_calibrations`).
- [ ] Audit checklist templates (`valley_quality_checklist_templates/_items`).
- [ ] Scheduled review reminders (weekly trigger → dashboard flags + optional email).
- [ ] SOP PDF export/print view and version comparison.

---

## 7. Cross-cutting rules (apply to every phase)

1. **No destructive deletes**: categories/shifts-style tables are deactivate-only; SOPs are obsoleted,
   NCRs are closed — matching the HR reference-table policy.
2. **Server is the authority**: statuses, permissions and computed fields (`next_review_date`,
   overdue flags, completion %) are recomputed server-side; the client only displays them.
3. **Every write** goes through `logHistory_`; attachments are always stored as ref + Drive id pairs and
   verified with `requireAttachmentBinding_` at save.
4. **Pre-mutation refusals** use the existing `vfNotApplied_`/`denyNotApplied_` pattern so the
   request-guard ledger records confirmed failures.
5. **Cache/version watch**: `vfRefsCached_`/`bumpVersion_`-style busting for category and settings lists;
   `get_page_versions` needs no extra wiring (derived from PAGE_ACCESS/ACTION_TABLES).
6. **Arabic-first UI** with the existing `UIC.dataTable`, `UIC.openModal`, `UIC.combo` components and the
   Valley Foods theme; pages mobile-safe like the rest of the tree.

## 8. Rollout checklist (after all phases)

- [ ] Register the 7 pages in `Company_ValleyFoods_Registry.js` (already in Phase 0; confirm labels).
- [ ] Deploy, open ERP_Management → صفحات النظام → تأكيد ظهور صفحات `vf_quality_*` بموجبة الوحدة `Quality`.
- [ ] Grant roles in صلاحيات الأدوار (Quality Manager / supervisors / all employees).
- [ ] Seed `valley_quality_sop_categories` (Production, Warehouse, QC Lab, HR, Maintenance).
- [ ] Create the Drive folders used by the uploads (auto-created on first upload via `ensureDriveFolderId_`).
- [ ] Smoke test per role: create SOP → approve → effective → launch acks → sign as employee →
      raise NCR → CAPA → verify → audit finding escalation → dashboard reflects everything.
