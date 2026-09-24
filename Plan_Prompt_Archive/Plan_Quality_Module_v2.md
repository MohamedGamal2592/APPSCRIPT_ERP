# Plan — Valley Foods Quality Module **v2 (lean)**

**Status:** Draft for review · **Supersedes:** `Plan_Quality_Module.md` (v1)
**Company:** Valley Foods (`9940659bd83035d7`) · **Module tag:** `Quality`
**What changed in v2:** audit applied (reuse-only), pages/tables reduced, Docs-editor iframe dropped
(platform-blocked) for a rich-text + server PDF freeze, and `unique_id` now uses **UUIDv7** (RFC 9562,
time-sorted) for faster, easier indexing.

---

## 0. ID strategy — `unique_id` = Time-Sorted UUIDv7 (RFC 9562)

**Why:** v7 puts a 48-bit Unix-ms timestamp in the leading hex digits, so `unique_id` sorts
lexicographically in creation order. Lookups, range scans and (future Firestore) document keys index by
time for free; debugging shows when a row was born. It replaces the truncated v4 `uid16_()`
(`Company_ValleyFoods_Actions.js` → `uid16_`, e.g. l.641) **for this module only** — existing tables are
not migrated.

**Helper (new, global, `Code.js` next to `getNextIdUnderLock_` l.1026):**

```js
/* RFC 9562 UUIDv7: 48-bit Unix-ms timestamp + version/variant + 74 random bits.
   Lexicographically sortable by creation time, so unique_id doubles as a
   chronological index key. Canonical 36-char form (dashes) so Sheets never
   coerces it to a number. */
function uidV7_() {
  var ms = Date.now();
  var ts = ('000000000000' + ms.toString(16)).slice(-12);            // 48-bit ms → 12 hex
  var r  = Utilities.getUuid().replace(/-/g, '');                    // 32 random hex (entropy)
  var variant = ((parseInt(r.charAt(16), 16) & 0x3) | 0x8).toString(16); // variant 10xx
  return ts.slice(0, 8) + '-' + ts.slice(8, 12) + '-7' + r.slice(13, 16) +
         '-' + variant + r.slice(17, 20) + '-' + r.slice(20, 32);
}
```

- **Format check:** `/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`
- **Uniqueness:** 74 random bits (collision-free in practice). Order within the same millisecond is
  arbitrary; add a `rand_a` counter only if strict intra-ms monotonicity is ever required (not needed now).
- **Numeric `id` stays** on `getNextId_`/`executeWithLock_` (`Code.js` l.1050/l.899) — v7 is the business
  key, the integer is the human-readable row number, same split as every other table.

---

## 1. Scope (unchanged intent, reduced surface)

SOP control (rich text → frozen PDF), acknowledgements (read-and-sign), NCR + CAPA, dashboard.
Audits last and optional. No scheduler except one optional daily overdue digest (Phase 5).

---

## 2. Reused mechanisms (verified in code — no new infrastructure)

| Need | Existing mechanism |
|---|---|
| Sheet + header repair | `ensureSheet_` (`Company_ValleyFoods_Actions.js` l.767/1453) |
| Numeric id under lock | `getNextId_` → `executeWithLock_` (`Code.js` l.1050/899) |
| Authority | `PAGE_ACCESS`/`ACTION_TABLES`/`guard_` (Actions l.173/368/572), `_hasUnifiedAccess_` (`Code.js` l.3527) |
| History | `logHistory_` (`Code.js` l.2151) |
| Attachments | `UIC.fileField` (UI_Components l.3087), `add_upload_file` + `UPLOAD_*` maps (Actions l.163/4111), `requireAttachmentBinding_` (Code.js l.7447), `attachmentPolicy_` (Actions l.14661) |
| Caching / busting | `vfRefsCached_`/`vfBustRefs_` (Actions l.44/4718), `safeRows_` (l.6614) |
| Polling | `get_page_versions` (registered l.680); `readTableVersions_` accepts an **array** (`Code.js` l.854) |
| List+modal to copy | `Company_ValleyFoods_Products.html` (`companyCall` l.68, `UIC.dataTable` l.306, `UIC.openModal` l.366); tabbed modal: `Company_ValleyFoods_MfgOrders.html` (`tabBtn` l.78) |
| Theme/nav | Cairo (`CSS_Tokens.html` l.78), `Company_ValleyFoods_Nav.html` |

**Phase-0 prerequisite (audit findings):**
- `ACTION_TABLES` values are single strings today (l.368–500) → allow **arrays** and flatten in the
  `PAGE_TABLES` builder (l.503) so every read action declares **all** tables it reads.
- The matrix editor offers only Read/Write (`0_ERP_Management.html` l.485–486) → add a **Full** option so
  router-enforced `full` actions are grantable (`adminSaveMatrix_` already passes the value through).
- `valley_employee_info` has **no email** (`Actions` l.732) → append an optional `email` column; primary
  sign-off path is **supervisor-recorded** (factory staff have no logins).

---

## 3. Tables (9 × `valley_quality_*`; `unique_id` = UUIDv7, plus `id`, `user`, `created_at`)

1. **`valley_quality_sops`** (header) — `sop_code, title_ar, title_en, category, applicability_dept, applicability_role, owner_email, current_effective_version, draft_version`
2. **`valley_quality_sop_versions`** — `sop_id, version, change_type (Major|Minor), status (Draft|In Review|Approved|Rejected|Effective|Obsolete), content_html, change_summary, pdf_ref, pdf_id, pdf_sha256, author_email, submitted_at, approved_by, approved_at, reject_comment, effective_date, next_review_date`
3. **`valley_quality_sop_events`** (append-only timeline) — `sop_id, version, event_type (Created|Edited|Submitted|Approved|Rejected|Made Effective|Obsolete|New Version|Acks Launched|Form Added|Form Removed), from_status, to_status, actor_email, at, comment, file_id, file_hash`
4. **`valley_quality_sop_forms`** — `sop_id, form_code, title, form_type (Doc|Sheet|Form|PDF|ERP page), link_or_id, revision, is_required`
5. **`valley_quality_acknowledgements`** — `sop_id, sop_version, emp_id, employee_name, status (Pending|Read|Signed|Superseded), read_at, signed_at, signature_note, recorded_by`
6. **`valley_quality_ncrs`** — `ncr_code, ncr_date, source, severity, description, product_id, batch_code, mo_uid, department, detected_by, disposition, capa_required, capa_justification, status (Open|In Review|CAPA Assigned|Implemented|Verified|Closed|Cancelled|Rejected), root_cause, closed_by, closed_at, attachment, attachment_id`
7. **`valley_quality_capas`** — `capa_code, ncr_id (optional), action_type (Corrective|Preventive), description, owner_email, due_date, effectiveness_check_date, status (Assigned|In Progress|Done|Verified|Closed), implemented_at, verified_by, verified_at, effectiveness_notes, attachment, attachment_id`
8. **`valley_quality_audits`** (Phase 4) — `audit_code, audit_date, audit_type, area, auditor_email, status, summary, attachment, attachment_id`
9. **`valley_quality_audit_findings`** (Phase 4) — `audit_id, finding_no, finding_type, description, clause_ref, ncr_id, capa_required, status`

Business codes (`sop_code`, `ncr_code`, `capa_code`, `audit_code`) are allocated **inside
`executeWithLock_` with a uniqueness scan** (pattern: `settingsUniqueViolation_`, `Actions` l.4312).

---

## 4. Workflows

```
SOP version: Draft ─submit→ In Review ─approve→ Approved ─make effective→ Effective
                     └─reject(comment)→ Rejected ─edit→ Draft
Effective stays Effective while v+1 is drafted; becomes Obsolete ONLY when v+1 becomes Effective.
Major version → acks re-launched (old Pending → Superseded). Minor → no re-ack.
Approver ≠ author (server rule).

Ack: Pending ─→ Read ─sign→ Signed   |   supervisor-recorded → Signed (recorded_by)
Signing/reading is restricted to the caller's own row (server-side, session email).

NCR: Open ─review(root cause + disposition)→ In Review ─capa_required→ CAPA Assigned
     ─all CAPAs Done→ Implemented ─verify→ Verified ─close→ Closed
     Cancelled / Rejected terminal. CAPA may exist with ncr_id empty.
     Overdue CAPA = due_date < today AND status ∉ {Done, Verified, Closed}.

Audit: Planned → In Progress → Completed → Closed; a finding can escalate to an NCR.
```

---

## 5. Pages (4 + 1 optional)

`vf_quality_sops` (list + **tabbed modal**: Document · Forms · History · Acknowledgements) ·
`vf_quality_my_acks` · `vf_quality_ncr` (NCR + CAPA) · `vf_quality_dashboard` ·
`vf_quality_audits` (optional, last). All registry entries `nav:false` except the dashboard; new
`الجودة` nav group in `Company_ValleyFoods_Nav.html`.

**Document tab = rich-text editor** (contenteditable + minimal toolbar) — the Google Docs iframe was
verified **not feasible** (Docs refuses framing; ERP session ≠ Google identity). On **Submit** the server
freezes the version: HTML → Google Doc (Drive advanced service, already enabled via `Drive.Files.list`
in `ensureDriveFolderId_`, `Actions` l.4118) → export **PDF** → store `pdf_ref` + `pdf_id` +
`pdf_sha256` (`Utilities.computeDigest SHA_256`, `Code.js` l.358). Editable only while Draft/Rejected;
reviewers and employees ever see only the frozen PDF. Render failure = `vfNotApplied_` (no half-submit).

---

## 6. Actions (page → access → ALL tables declared)

| Action | Page | Access | Tables |
|---|---|---|---|
| `get_quality_sops` | vf_quality_sops | read | sops, versions, forms |
| `save_quality_sop` | vf_quality_sops | write | sops |
| `save_quality_sop_version` | vf_quality_sops | write | versions (Draft/Rejected only) |
| `submit_quality_sop_version` | vf_quality_sops | write | versions, events |
| `approve_quality_sop_version` | vf_quality_sops | **full** | versions, events |
| `reject_quality_sop_version` | vf_quality_sops | **full** | versions, events |
| `make_effective_quality_sop_version` | vf_quality_sops | **full** | sops, versions, events |
| `save_quality_sop_forms` | vf_quality_sops | write | forms, events |
| `launch_quality_acks` | vf_quality_sops | **full** | acks, versions, events, valley_employee_info |
| `get_quality_my_acks` | vf_quality_my_acks | read | acks, versions, sops |
| `sign_quality_ack` | vf_quality_my_acks | write | acks (own row only) |
| `record_quality_ack` | vf_quality_my_acks | write | acks |
| `get_quality_ncr` | vf_quality_ncr | read | ncrs, capas |
| `save_quality_ncr` | vf_quality_ncr | write | ncrs |
| `save_quality_capa` | vf_quality_ncr | write | capas |
| `change_quality_ncr_status` | vf_quality_ncr | write | ncrs, capas |
| `close_quality_ncr` | vf_quality_ncr | **full** | ncrs |
| `get_quality_dashboard` | vf_quality_dashboard | read | sops, versions, acks, ncrs, capas, audits |
| `get_quality_audits` / `save_quality_audit` / `save_quality_finding` / `escalate_finding_to_ncr` | vf_quality_audits | read / write / write / write | audits, findings, ncrs |

Dashboard is cached with `vfRefsCached_` and busted (`vfBustRefs_`) by every write action.

## 7. Permission matrix

| Role | SOPs | My Acks | NCR/CAPA | Dashboard | Audits |
|---|---|---|---|---|---|
| Quality Manager | **full** | full | **full** | read | full |
| Supervisor | write | write | write | read | write |
| Author | write (own drafts) | — | — | — | — |
| Staff with login | read | write (own) | — | — | — |
| No-login staff | — | supervisor-recorded | — | — | — |

---

## 8. Phases & todos

### Phase 0 — prerequisites (audit fixes)
- [x] Add `uidV7_()` to `Code.js` + unit test (regex, uniqueness over N, sort order across ms gaps).
- [x] Allow array values in `ACTION_TABLES`; flatten in `PAGE_TABLES` builder; `tableForAction_` joins for the log column.
- [x] Add **Full** option to the matrix select (`0_ERP_Management.html` l.483).
- [x] Append optional `email` column to `valley_employee_info` (`ensureSheet_`).
- [x] Registry entries + `الجودة` nav group + `attachmentPolicy_`/`UPLOAD_*` entries for the new sheets.

### Phase 1 — SOPs
- [x] Tables 1–4 via `ensureSheet_`; `unique_id = uidV7_()`.
- [x] Code allocator (`sop_code`) under `executeWithLock_` + uniqueness scan.
- [x] List + tabbed modal; rich-text editor; forms tab; events timeline tab.
- [x] Submit/approve/reject/make-effective with router `full`; approver ≠ author.
- [x] PDF freeze helper (Doc insert → PDF export → SHA-256) with `vfNotApplied_` failure.
- [x] Verify: transition harness, permission refusals, `node --check`.

### Phase 2 — Acknowledgements
- [x] Launch (applicability filter, new hires, `Superseded` enum, `full`).
- [x] My-acks page; sign = own row only; supervisor-recorded fallback; PDF opens via policy.
- [x] Verify: launch idempotency, cross-user sign refused.

### Phase 3 — NCR / CAPA
- [x] Tables 6–7; transitions incl. `capa_required` + justification, root cause at review, disposition, Cancelled/Rejected, standalone CAPA, `effectiveness_check_date`.
- [x] Verify: every illegal transition refused pre-mutation.

### Phase 4 — Dashboard + Audits
- [x] Cached dashboard + bust on write; audits/findings + escalate-to-NCR.
- [x] Verify: dashboard math on fixtures, no per-row calls.

### Phase 5 — optional
- [ ] Daily overdue digest email · training log · checklist templates · supplier quality · calibration.

---

## 9. Removed from v1, and why

| Removed | Why |
|---|---|
| Google Docs iframe editor | Docs refuses framing (`X-Frame-Options`); ERP session ≠ Google identity → rich-text + server PDF freeze |
| `valley_quality_sop_steps` | Content is the version's rich HTML |
| `valley_quality_sop_categories` table + settings page | Fixed list (`MFG_OP_TYPES`/`FIN_CASH_TYPES` precedent) |
| `vf_quality_sop_view` page | Folded into the SOP modal's 4 tabs |
| `valley_quality_training_records` | Phase 5; acknowledgements cover read-and-sign |
| Versions "archive" semantics | One row per version with its own status (Effective stays Effective until superseded) |
| `valley_quality_ncr_history` | `logHistory_` + the events table |
| In-handler `requireSuperAdmin_` for approve/close | Router-enforced `full` actions (plus the Phase-0 matrix option) |
| Supplier quality, calibration, checklist templates, scheduler | Phase 5 / out of scope |

## 10. Top risks

1. PDF freeze helper is new code (Drive insert/export) — must fail pre-mutation.
2. Matrix UI lacked `Full` — fixed in Phase 0, otherwise approve/close are super-admin-only.
3. No email→employee link — supervisor-recorded is primary.
4. Multi-table polling gap — fixed in Phase 0 (array `ACTION_TABLES`).
5. UUIDv7 has no native Apps Script support — the `uidV7_()` helper is the single new primitive; verified by unit test.
