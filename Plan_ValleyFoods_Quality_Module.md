# Valley Foods Quality Module Improvement Plan

**Status:** Proposed implementation plan  
**Baseline reviewed:** 2026-09-28  
**Scope:** Quality workflows and controlled SOP/policy authoring in the Valley Foods Apps Script/Sheets ERP  
**Implementation status:** Plan only; no source or test files changed

## 1. Purpose and target outcome

Improve the quality module in a controlled sequence while preserving its existing SOP versioning, approval, PDF, acknowledgement, access-control, history, idempotency, and revision-conflict behavior.

The plan has two immediate user-facing outcomes:

1. When authoring a new SOP or policy, the editable text is visibly on the A4 paper surface, not below or separate from it. Pagination, preview, print, and the approved PDF must agree.
2. A new SOP cannot be saved when an existing SOP has the same exact assignment key, defined below. A new draft still may be incomplete; ordinary permissions, required metadata, safe-content, size, retry, and concurrency rules remain in force.

The broader quality outcome is to make audit/finding closure, NCR containment and traceability, CAPA effectiveness, structured quality data, and reporting semantics enforceable and testable.

## 2. Baseline findings

### 2.1 SOP authoring and paper layout

The SOP workspace already provides an A4 page-frame renderer, a rich-text editor, page count, zoom, document metadata, templates, printing, and a controlled-document lifecycle. However, the page layer and editable flow are currently sibling elements: page frames are inserted first, then the editable flow. The editable flow also has its own white surface. This is consistent with the reported experience that text appears below or apart from the paper.

The current layout and pagination locations are:

- [SOP workspace page/editor markup](Company_ValleyFoods_QualitySops.html#L565)
- [Paper and editor CSS](Quality_SopDoc.html#L467)
- [Paper-frame generation](Quality_SopDoc.html#L276)
- [Pagination calculation](Quality_SopDoc.html#L301)
- [Current UI verification scope](tools/verify/quality_sop_workspace_ui.js#L20)

The UI verification file states that its DOM stub has no browser layout or CSS and does not prove that the paper looks right. A browser-visible layout acceptance check is therefore a required part of this plan.

### 2.2 Existing SOP save and duplicate behavior

The server validates required SOP metadata, validates category/department/role/owner against available references, creates the initial draft/version, and uses a create token for idempotent retries. It allocates a document code under a server lock. Relevant code is in [SOP save and create flow](Company_ValleyFoods_Actions.js#L17342).

There is no assignment-key duplicate rejection today. The workflow verification explicitly creates a second SOP with the same category and department and expects the next sequence number: [existing duplicate behavior](tools/verify/quality_sop_workflow.js#L338). Adding the requested rule intentionally changes that behavior.

### 2.3 Existing quality controls and observed gaps

- SOP versioning, review, approval, effective release, acknowledgement, and role/permission checks are already present. Preserve these as the controlled-document system of record.
- NCR transitions require root cause and immediate action before review, and NCR closure requires a verified state. See [NCR transition logic](Company_ValleyFoods_Actions.js#L18525) and [NCR closure](Company_ValleyFoods_Actions.js#L18569).
- Audit closure currently checks the legal status sequence but does not visibly gate closure on unresolved findings. Finding closure allows Open to Closed without a linked-resolution/effectiveness condition. See [audit save](Company_ValleyFoods_Actions.js#L18882) and [finding save](Company_ValleyFoods_Actions.js#L18957).
- Audit-finding escalation currently creates the linked NCR with CAPA required set to false, regardless of the finding's flag. See [escalation logic](Company_ValleyFoods_Actions.js#L19042).
- The dashboard counts Open, In Review, CAPA Assigned, and Implemented NCRs as open but excludes Verified. Verified records are not yet closed in the NCR lifecycle. See [dashboard state aggregation](Company_ValleyFoods_Actions.js#L18725).
- Product specifications are intentionally general records, not approved or controlled releases. Preserve that distinction; a released specification needs a controlled-document/change-control path. See [general quality workspace boundary](Company_ValleyFoods_QualityGeneral.html#L90).

## 3. Decisions and definitions to approve

### 3.1 Exact SOP assignment duplicate

Use this proposed assignment key:

    category + canonical department + canonical applicable role

Examples:

- Same category, department, and applicable role: duplicate, even if title or owner differs.
- Same department and role but a different category: not a duplicate.
- Same category and role but a different department: not a duplicate.
- Same category and department but a different role: not a duplicate.

Title, owner, code, and document body are not part of this key; otherwise changing those values could bypass assignment uniqueness. Normalize category through the category catalog, department through the canonical department reference, and role through the approved role catalog. Do not compare department abbreviations because they can change independently of department identity.

**Business consequence to acknowledge:** this rule permits one parent SOP per category/department/role combination. Different procedures often serve the same audience, so this policy may be too restrictive unless “assignment” has a more specific scope. If Valley Foods needs multiple procedures for the same audience, add a real discriminator such as process, product, facility, or area to the key before implementation. Do not use title as a hidden workaround.

Default proposed lifecycle rule: any existing parent SOP with the exact key blocks another parent, regardless of whether its current version is Draft, In Review, Effective, or Obsolete. Revisions and replacements should use the existing parent SOP's version lifecycle. If a new parent is truly required after retirement, define a deliberate supersede workflow and record the link rather than silently bypassing uniqueness.

### 3.2 Draft save versus submit

Save Draft persists a safe, size-bounded snapshot with valid required metadata and assignment fields. It does not require every body section to be complete. Submit for Review requires substantive document content and follows the existing controlled review lifecycle. This preserves iterative authoring while preventing a heading-only template from being approved.

The exact duplicate rule is the new business uniqueness gate for a new SOP. Authentication, field validation, safe HTML, size limits, idempotency, and optimistic concurrency remain technical/data-integrity requirements and are not removed.

## 4. Implementation phases

### Phase 0 — Domain language and ownership

**Skill guidance:** [DDD strategic design](downloaded-skills/ddd-strategic-design/SKILL.md), [quality nonconformance](downloaded-skills/quality-nonconformance/SKILL.md).

1. Agree a short glossary: controlled document, policy, procedure, work instruction, assignment/applicability, finding, nonconformance, containment, correction, disposition, corrective action, preventive action, verification, effectiveness validation, and closure.
2. Assign owners for controlled documents/training, audits/findings, NCR/CAPA, product specifications/change control, supplier quality, and customer complaints.
3. Decide whether category + department + role is sufficiently specific for a unique SOP assignment. If not, define the missing process/product/site scope now.
4. Record the decisions and rationale before implementing any schema or lifecycle changes.

**Exit criteria:** Quality and process owners approve the glossary, assignment-key definition, exception/supersede policy, and workflow ownership map.

### Phase 1 — Correct the in-page SOP editor

**Skill guidance:** [runbook creation](downloaded-skills/runbook-creation/SKILL.md) for readable procedure presentation and verification; browser testing principles from [Odoo automated tests](downloaded-skills/odoo-automated-tests/SKILL.md), translated to this application.

1. Keep one logical editable document for caret movement, selection, undo/redo, sanitization, and serialization.
2. Put the page-frame layer behind the editable content at the same canvas origin. The frame layer must not consume document-flow height before the editor begins.
3. Give each page a consistent content rectangle with the approved A4 dimensions, left/right margins, header/footer reserved areas, and top/bottom content limits.
4. Correct pagination so every page boundary is based on actual paper height and that page's top/bottom usable limits. Do not advance by only the usable content height when the displayed pages advance by the full A4 paper height.
5. Keep page backgrounds transparent in the content layer so the paper frame remains visible behind text.
6. Maintain alignment through zoom, fit-width, responsive layout, RTL Arabic, editing, scrolling, page breaks, print, and PDF generation.
7. Keep the editor instance and its unsaved changes stable during refreshes, autosave, in-flight save, and layout recalculation.

**Acceptance criteria**

- A new SOP opens with the first editable line visibly inside the first A4 sheet and within its content margins.
- The page frame and text never appear as a paper followed by a separate white text page.
- Page count matches visible sheet count; long content continues on aligned subsequent sheets.
- Test representative Arabic/English headings, long paragraphs, lists, tables, explicit page breaks, and content close to page boundaries.
- At normal zoom, fit-width, narrow/wide viewport, and print/PDF preview, text stays on the intended sheet and does not overlap the header/footer.
- Browser-based visual checks inspect actual computed element geometry. Keep the fast DOM-stub tests, but do not treat them as visual proof.

### Phase 2 — Add atomic exact-duplicate protection

**Skill guidance:** [DDD strategic design](downloaded-skills/ddd-strategic-design/SKILL.md) for the meaning of assignment; [Odoo module developer](downloaded-skills/odoo-module-developer/SKILL.md) only for the transferable principle that business constraints belong in the server/domain layer.

Implement the rule in the server handler, not only in the browser:

1. Run current permission and field/reference validation.
2. Enter the existing creation lock.
3. Check create-token idempotency first. A retry of an already-created identical request returns its original result.
4. For a genuinely new create, compute the normalized assignment key and compare it with existing SOP headers.
5. If a match exists, return a clear duplicate response containing the existing SOP identifier, code, title, category, department, role, and lifecycle state. Do not allocate a code or write a header, version, or event.
6. If no match exists, continue the existing guarded creation path and persist header, initial draft version, and creation event.
7. When editing, exclude the current SOP UID from the comparison. Creating a new version under the existing SOP UID must remain allowed.
8. Preserve the editor text on duplicate rejection. Offer to open the existing SOP in a separate navigation action; do not replace the user's draft automatically.

**Acceptance tests**

- Exact key with different title is rejected with zero writes.
- Exact key with different owner is rejected with zero writes.
- A different category, department, or role is allowed.
- Editing the matched existing SOP and creating its next version are allowed.
- Retrying the same create token remains idempotent and does not show a duplicate warning.
- Two concurrent saves with the same key result in one creation and one duplicate response; no orphan version/event or duplicate code is produced.
- Update the existing workflow test that currently expects a second same-category/same-department SOP to be created.

### Phase 3 — Improve SOP/policy content templates

**Skill guidance:** [runbook creation](downloaded-skills/runbook-creation/SKILL.md), adapted from IT operations to controlled food/manufacturing procedures.

Render the authored body inside the paper canvas, with templates selected by document category:

- **Policy:** purpose, scope, policy statements, responsibilities, exceptions, monitoring, records, and references.
- **SOP/procedure:** purpose, scope, responsibilities, prerequisites, materials/equipment, numbered steps, expected result or acceptance check for critical steps, records produced, deviation response, escalation, and references.
- **Work instruction:** task-specific steps, cautions, visual aids, and acceptance criteria.
- **Form/record:** controlled fields, completion instructions, responsible role, and retention/reference details.

Keep document metadata in the properties panel if useful, but do not put the actual SOP text in a panel below or outside the paper. Preserve the distinction between editable draft templates and the approved/frozen PDF.

**Acceptance criteria**

- Correct template is selected from the approved document category.
- A new author can follow the document structure without tribal knowledge.
- Placeholder headings alone do not count as substantive content for Submit for Review.
- Reviewers can verify the procedure content from the same layout users see in print/PDF.

### Phase 4 — Tighten audit, finding, NCR, and CAPA controls

**Skill guidance:** [quality nonconformance](downloaded-skills/quality-nonconformance/SKILL.md), with DDD workflow boundaries and automated negative-path tests.

1. **Audit closure:** block closure while findings requiring action remain unresolved.
2. **Finding closure:** for a finding requiring CAPA, require the linked NCR/CAPA to reach the agreed verified/effective state before closure. If Quality allows an exception, require full authorization, rationale, and history.
3. **Escalation mapping:** preserve the finding's CAPA requirement on the NCR, or require explicit re-evaluation and reason. Never silently default it to false.
4. **Containment:** distinguish immediate containment from final disposition. Assess explicit fields for affected quantity, lot/product/order scope, quarantine/hold state, containment owner/time, and impact to WIP, inventory, and shipped product.
5. **Disposition:** define food-appropriate options and approval requirements with Quality, Food Safety, Operations, and Procurement. Separate rework, approved use-as-is, supplier return, and scrap/destruction where applicable.
6. **CAPA evidence:** capture implementation evidence separately from effectiveness evidence. Define measurable success criteria, an observation period, result, recurrence finding, verifier, and a reopen/reinvestigate path.
7. **Root-cause quality:** guide investigators to choose an appropriate method (for example 5 Whys for a simple verified causal chain; fishbone/8D for multiple or recurring causes) and require evidence for causes and actions. Avoid treating “operator error” or retraining alone as a sufficient root cause/action.
8. **Supplier/customer context:** separate customer complaints from audit records. Assess links to supplier records, supplier corrective actions, incoming inspection, and supplier performance before introducing scorecards or inspection-level automation.

The quality-nonconformance guide contains medical-device, automotive, and aerospace examples. Do not copy its legal references, numeric triggers, AQL/PPM targets, or time windows into Valley Foods without validation against applicable food-safety requirements, customer commitments, and Valley Foods' own risk decisions.

### Phase 5 — Data contracts, structured specifications, and dashboard clarity

**Skill guidance:** [data quality frameworks](downloaded-skills/data-quality-frameworks/SKILL.md).

1. Define field and state contracts for SOPs, acknowledgements, audits, findings, NCRs, and CAPAs.
2. Validate required owners, dates, approved categories/roles/statuses, and cross-record links.
3. Add reconciliation checks for orphaned links, duplicate codes/assignment keys, impossible status combinations, missing required evidence, and overdue records.
4. Keep narrative specification content readable, but model critical product limits as structured values where they must be filtered or checked (for example: characteristic, unit, min/max or target, method, product/spec revision, effective date).
5. Use JSON only for flexible/versioned data with a defined schema and validation. Keep high-value filter/join fields explicit instead of burying them in HTML or unvalidated JSON.
6. Clarify dashboard states. Report Verified-but-not-Closed NCRs separately so open, pending closure, and closed totals can be reconciled.
7. Measure sheet size, response time, read volume, and cache rebuild frequency before attempting optimization. The dashboard already caches; the data-quality skill is not a direct Apps Script performance package.

### Phase 6 — Tests, pilot, and rollout

**Skill guidance:** [Odoo automated tests](downloaded-skills/odoo-automated-tests/SKILL.md), translated to the existing Node-based verification harness and browser workflow.

- Add server tests for all exact-key duplicates, allowed non-matches, idempotency, concurrency, zero-write refusals, revisions, and authorization.
- Add lifecycle tests for audit/finding closure gates, CAPA-flag propagation, CAPA effectiveness evidence, and dashboard state reconciliation.
- Add actual browser visual checks for the paper editor. The current [SOP workspace UI test](tools/verify/quality_sop_workspace_ui.js#L20) explicitly does not verify CSS/layout.
- Keep business logic tests isolated from production records. Use a dedicated test harness/database for any live integration checks.
- Pilot the editor and duplicate behavior with Quality and representative SOP authors. Confirm that a duplicate response preserves the draft and clearly directs the user to the existing SOP.
- Release in controlled stages, check error/history logs, and provide a rollback path for the UI change and any additive schema changes.

## 5. Skill-to-work mapping

| Skill | Applied to | Important adaptation |
|---|---|---|
| [DDD strategic design](downloaded-skills/ddd-strategic-design/SKILL.md) | Quality boundaries, vocabulary, assignment key, ownership | Requires Valley Foods' domain decisions; it does not infer business truth or generate code. |
| [Quality nonconformance](downloaded-skills/quality-nonconformance/SKILL.md) | NCR, containment, root cause, disposition, CAPA effectiveness, supplier quality | Adapt examples to food operations and locally applicable requirements; do not copy other-industry thresholds. |
| [Runbook creation](downloaded-skills/runbook-creation/SKILL.md) | SOP/policy content structure, usability, verification, review | Translate IT rollback into safe containment/recovery for physical processes. |
| [Data quality frameworks](downloaded-skills/data-quality-frameworks/SKILL.md) | Contracts, validation, monitoring, ownership, remediation | Great Expectations/dbt are examples, not direct dependencies for this Apps Script system. |
| [Odoo module developer](downloaded-skills/odoo-module-developer/SKILL.md) | Server-enforced business rules and clean domain boundaries | Do not use Odoo model scaffolding, ORM, manifests, or access CSVs in the current stack. |
| [Odoo automated tests](downloaded-skills/odoo-automated-tests/SKILL.md) | Happy/error paths, permissions, workflow and UI test strategy | Translate TransactionCase/HttpCase principles into Node verification and browser testing; do not introduce Odoo's test framework. |

## 6. Reference index

### Downloaded skill files

- [ddd-strategic-design](downloaded-skills/ddd-strategic-design/SKILL.md)
- [quality-nonconformance](downloaded-skills/quality-nonconformance/SKILL.md)
- [runbook-creation](downloaded-skills/runbook-creation/SKILL.md)
- [data-quality-frameworks](downloaded-skills/data-quality-frameworks/SKILL.md)
- [odoo-module-developer](downloaded-skills/odoo-module-developer/SKILL.md)
- [odoo-automated-tests](downloaded-skills/odoo-automated-tests/SKILL.md)

### Valley Foods source and verification files

- [SOP page and save payload](Company_ValleyFoods_QualitySops.html#L565)
- [Shared controlled-document layout and pagination](Quality_SopDoc.html#L276)
- [SOP backend save/create flow](Company_ValleyFoods_Actions.js#L17342)
- [Existing SOP workflow verification](tools/verify/quality_sop_workflow.js#L323)
- [SOP UI verification scope](tools/verify/quality_sop_workspace_ui.js#L20)
- [SOP permission verification](tools/verify/quality_sop_permissions.js)
- [NCR/CAPA schema](Company_ValleyFoods_Actions.js#L18217)
- [NCR/CAPA verification](tools/verify/quality_ncr.js)
- [Audit and finding handlers](Company_ValleyFoods_Actions.js#L18882)
- [Audit verification](tools/verify/quality_audits.js)
- [Quality dashboard aggregation](Company_ValleyFoods_Actions.js#L18674)
- [Dashboard verification](tools/verify/quality_dashboard.js)
- [End-to-end quality verification](tools/verify/quality_e2e.js)
- [General-quality controlled-release boundary](Company_ValleyFoods_QualityGeneral.html#L90)

## 7. Completion definition

The plan is complete when:

1. SOP authors edit text on aligned A4 pages and the editor, preview, print, and frozen PDF agree.
2. The server enforces the approved exact assignment key atomically, while preserving retries, edits, and version creation.
3. The quality owner approves the SOP/policy templates and the revised workflow definitions.
4. Audit/finding closure, escalation, NCR containment, CAPA effectiveness, and dashboard-state rules are implemented and verified.
5. Structured quality data has documented contracts and automated integrity checks.
6. Browser and workflow acceptance evidence is reviewed before production rollout.
