# Assessment Center → ERP — analysis and merge plan

**Source system:** `assessment center/` — a standalone Apps Script web app (script id `1Ln70Ig…`,
version "6.2-SECURE"), 15 files, ~190 KB.
**Target:** this project, as a new registered company under `ERP_Companies.company_unique_id =
32fafd256ccb7a1c`, whose spreadsheet is resolved at runtime from `company_sheet_link` exactly like
the other three companies. The spreadsheet is the **same one the standalone uses today**, so the tab
names and columns below are taken from the standalone's code, not re-verified against the sheet.
**Branch:** new, `feat/assessment-center`, off current HEAD (`9f77761` on `ui/forms-readability`).
**Date:** 2026-09-06.

This is two documents in one: §1–§3 are the **analysis** (what the standalone is, what it does well,
what is broken, and what the ERP demands of a company); §4–§11 are the **plan** (target workflow,
architecture, page specs, phases, verification, owner register, risks).

---

## 0. Ground rules

Inherited from the performance, UI/UX and forms runs, and not re-litigated:

1. **No deploy.** No `clasp push`, no deployment, no push to `origin`. The owner pushes.
2. **No data writes** to any system table (`ERP_*`). Every row the new company needs in
   `ERP_Users`, `ERP_System_Pages` and `ERP_Pages_Matrix` is the owner's to add (§9).
3. **No public-contract breakage.** `UIC.*`, `API.*`, `FMT.*`, `UI.*`, `SESSION.*`, every backend
   signature, every response shape, every anchor id of every existing page.
4. **Arabic string literals go through `Write`/`Edit`, never a Bash heredoc.**
5. **Stage explicit paths only.** The working tree carries other efforts' uncommitted work
   (`Company_TopLight_Sales.html`, `Company_TopLight_Sales_Returns.html`,
   `design_preview/_sources.js`, several untracked `*_RUN_PROMPT.md`, `tools/verify/s11_sales_returns.js`).
   Never stage, revert or clean it.
6. **Schema.** The default is the house rule: no column added, renamed, removed or retyped, no new
   tab. This company is new to the ERP and the sheet is the owner's own, so **additive columns are
   put to the owner as an explicit gate (D-2), tiered so the plan delivers fully without them.**
7. **Company isolation stands.** `executeCompanyAction_` refuses any request whose
   `target_system` differs from the user's company. The assessment center is its own company; it
   cannot read `vf_hr_employees` or any other company's tab, and this plan does not try to.

---

## 1. What was verified before planning

Every file in `assessment center/` was read in full. On the ERP side, every line reference below
was read, not assumed; they drift with each commit, so re-confirm before editing.

| # | Finding | Evidence |
|---|---|---|
| **R-1** | The standalone is a single `Code.js` (routing, security, data helpers, all `ui*` functions) plus 11 Bootstrap-5 HTML pages and a `CSS.html` theme. `google.script.run` calls `ui*` functions directly; a `doPost` JSON API (`ACTIONS`) exists but no page uses it. | `assessment center/Code.js` §2, §6, §8 |
| **R-2** | Ten tabs are declared in `SHEET`; **eight are used**. `Results` and `Config` are declared and never read or written, so **their headers are unknown to this plan**. | `Code.js` lines 32–43; no reference to `SHEET.RESULTS` / `SHEET.CONFIG` anywhere |
| **R-3** | Column names are **PascalCase** (`AssessmentID`, `TimeLimitMinutes`, …). Every column the code writes is listed in §2.2, taken from the `writeRowByHeaders_` calls. | `uiSaveAssessment`, `uiCreateBatch`, `uiStartTest`, `uiSubmitTest`, `uiAddUser`, `uiSavePermissions`, `logAudit_` |
| **R-4** | Question types offered by the authoring UI are `MCQ`, `Likert`, `MostLeast`, `OpenText`. The architecture doc says `MultipleChoice`; the UI value is `MCQ`. `CorrectAnswer` is hidden for `Likert` and `MostLeast`. | `CreateAssessment.html` `qType` select, `toggleOptions()` |
| **R-5** | **Scoring counts every response as a question and only `Answer === CorrectAnswer` as correct.** `Weight` is ignored; `Responses.Score` is never written; a Likert, MostLeast or OpenText response can never be correct, so any mixed assessment scores below 100% by construction and its pass/fail verdict is wrong. | `uiGetCandidateSummary`, `uiSubmitTest` (`case 'Score': return ''`) |
| **R-6** | The timer is client-only. `uiStartTest` returns the existing `In Progress` assignment on a second visit, but nothing is written until submit, so a refresh **restarts the full timer and loses every answer**. No server-side time check on submit. | `CandidateTest.html` `startTimer`, `uiSubmitTest` |
| **R-7** | `uiStartTest` is **not** wrapped in `withLock_`; two candidates opening a nearly-full link at once can both pass `UsedSlots >= MaxCandidates` and both be admitted. | `Code.js` `uiStartTest` (compare `uiSubmitTest`, which is locked) |
| **R-8** | Batch expiry is hardcoded to **10 days**; there is no deactivate, extend, invite list or per-batch candidate view. Anyone holding the link consumes a slot. | `uiCreateBatch`, `ViewBatches.html` |
| **R-9** | An assessment is **immutable once created**: no edit, no toggle of `IsActive`, no duplicate, no reorder after save. There is no question bank. | `ViewAssessments.html` has only "Print" |
| **R-10** | Question text and option text are inserted **unescaped** into the candidate page, the review print and the assessment print. An author can inject markup that runs in a candidate's browser. | `CandidateTest.html` `renderQuestions`, `ReviewResults.html` `generateDetailedPrint`, `ViewAssessments.html` `generatePrintContent` |
| **R-11** | Five pages carry a copy-pasted `withFailureHandler` that references `loadingSpinner`, `tableContainer` and `tableBody` — elements that do not exist on those pages — so **a server failure throws inside the failure handler and the user sees nothing**. | `Login.html` 153–166, `Admin.html`, `PermissionAssignment.html`, `CreateAssessment.html`, `CreateBatch.html` |
| **R-12** | `authenticateCandidateToken_` is never called; it also checks `assignment.ExpiresAt`, a column never written. The `assignments_building` page is a `ComingSoon` stub. | `Code.js` |
| **R-13** | Dates are written in **mixed types**: `Date` objects (`Users.CreatedAt`, `AuditLog.Timestamp`) and `yyyy-MM-dd HH:mm:ss` strings in script timezone (`Assessments`, `Questions`, `AssessmentBatches`, `Assignments`, `Responses`). `IsActive` is a boolean in `Assessments` and `AssessmentBatches`. Readers must accept both shapes. | `nowDateTime_`, `uiCreateBatch`, `uiSaveAssessment` |
| **R-14** | The ERP router honours `page.public` for **any** entry in `getAllPages_()`, including company pages, so a registry page marked `public: true` renders without a session. | [Code.js:54-61](Code.js#L54-L61), [01_Registry.js:29](01_Registry.js#L29) |
| **R-15** | **Every company action goes through `company_action`, which requires a session.** There is no unauthenticated path into a company dispatcher. Two routes already run with `requireAuth: false` (`log_client_error`, `log_client_perf`), which is the precedent for adding one. | [Code.js:240](Code.js#L240), [:269-270](Code.js#L269-L270) |
| **R-16** | `getAllRecords_` returns keys in the **exact header case** (`String(h).trim()`, not lower-cased, despite its doc comment). `addRecord_` looks up `dataMap[header.toLowerCase()]`. `saveRecordWithAudit_`'s update path merges `old` (header-case keys) with `dataMap`, and `updateRowByCriteria_` takes the **first** key that matches case-insensitively — so a lower-case `dataMap` key is shadowed by the old value and the update is a **silent no-op**. This never bit the other companies because their headers are already lower-case. | [02_DataAccess.js](02_DataAccess.js) `buildRecordsFromRaw_`, `addRecord_`, `updateRowByCriteria_`, `saveRecordWithAudit_` |
| **R-17** | `addRecord_` / `getNextId_` **create an `ID_Counter` tab** in the target spreadsheet on first use and add a row per table. `05_Admin.js` shows the house precedent for uid-keyed tables without an `id` column: build `rowValues` from headers and `appendRow` directly. | [02_DataAccess.js](02_DataAccess.js) `getNextIdUnderLock_`; [05_Admin.js](05_Admin.js) `adminSaveMatrix_`, `adminSavePages_` |
| **R-18** | `UIC.ensureHomeLogo()` boots **unconditionally** on every page that includes `UI_Components.html` and links to `?action=ERPDashboard`. On a public candidate page it would put an ERP entry point in front of an external candidate. | [UI_Components.html:493](UI_Components.html#L493), boot IIFE at [:544-560](UI_Components.html#L544-L560) |
| **R-19** | The registry `tables:` catalog has no consumer in `Code.js`, `05_Admin.js`, `02_DataAccess.js`, `03_Security.js`, `UI_Components.html` or the history panel. It is metadata; include it for consistency, expect nothing from it. | repo-wide grep |
| **R-20** | Router access inference: `add_*` → write; `edit_|delete_|remove_|update_|toggle_|close_|make_` → **full**; everything else → read. The company `guard_` then enforces `PAGE_ACCESS` on top. `classifyAction_` logs `add_` as ADD, `update_/toggle_/approve_` as EDIT, `delete_` as DELETE, `get_` not at all, and **anything else — including `save_` — as `UNKNOWN`**. | [Code.js:405-416](Code.js#L405-L416), [:430](Code.js#L430), [:624-657](Code.js#L624-L657) |
| **R-21** | A company appears on `ERPDashboard` only for users whose `ERP_Users.company` equals its uid (or super admins), and its tile opens `pages[0].action`. The role screen lists pages from `ERP_System_Pages`, not from the registry, so **a new page id must be saved there before it can be granted**. | [03_Security.js](03_Security.js) `getDashboardData_`; [05_Admin.js:133](05_Admin.js#L133) `adminListMatrix_`; `NEXT_STEPS_OWNER.md` item 6 |
| **R-22** | The generic theme path reads `company_colors` from `ERP_Companies` and gives the company the neutral canvas, the brand topbar and Cairo automatically. **No theme code is needed** for the new company. | [03_Security.js](03_Security.js) `getCompanyThemeCSS_` generic branch |
| **R-23** | `ui_smoke_pages.js` boots **every** root template and replaces unknown scriptlets with `0`; `ui_check` C5 fails if the orphan-class count grows, C6 if bare colour literals grow, C7 if a width query is off the five-tier scale, C9 if the preview bundle is stale. New pages inherit all of these. | [tools/verify/ui_smoke_pages.js](tools/verify/ui_smoke_pages.js), [tools/ui_check.js](tools/ui_check.js) |
| **R-24** | `design_preview/_sources.js` is **modified in the working tree by another effort**. Any edit to `UI_Components.html` makes C9 demand a rebuild that would collide with it. | `git status --porcelain` |

---

## 2. The standalone system, as built

### 2.1 Architecture

```
?action=login ─► Login.html ──uiLogin──► Users tab (SHA-256, no salt; 72-char session token in the row)
?action=dashboard ─► MainPage.html (5 cards)
?action=create_assessment ─► CreateAssessment.html ──uiSaveAssessment──► Assessments + Questions
?action=view_assessments  ─► ViewAssessments.html  ──uiGetAssessments / uiGetAssessmentDetailsForAdmin (print)
?action=create_batch      ─► CreateBatch.html      ──uiCreateBatch──► AssessmentBatches (token link, 10 days)
?action=view_batches      ─► ViewBatches.html      ──uiGetBatches
?action=review_results    ─► ReviewResults.html    ──uiGetCandidateSummary / uiGetAssignmentDetails (print, xlsx, pdf)
?action=adding_users / permissions ─► Admin.html / PermissionAssignment.html (Super Admin)
?action=takeTest&token=…  ─► CandidateTest.html (PUBLIC) ──uiStartTest / uiSubmitTest──► Assignments + Responses
```

Security is competent for what it is: hashed passwords, first-login password setup, login throttle,
12-hour sessions, a `Position × PageName` permission matrix, script-lock on writes, header-driven
row mapping. All of it is **superseded by the ERP's control plane** (salted hashes, multi-device
sessions, `ERP_Pages_Matrix`, kill switch, SystemLog, record history) and none of it carries over.

### 2.2 Data model — the eight live tabs

Exact column names, from the code. This is the schema the plan builds on.

| Tab | Columns | PK | Written by |
|---|---|---|---|
| `Assessments` | `AssessmentID, Title, Category, Description, TimeLimitMinutes, PassScore, IsActive, UserID, CreatedAt, UpdatedAt` | `AssessmentID` (16-hex) | `uiSaveAssessment` |
| `Questions` | `QuestionID, AssessmentID, OrderIndex, QuestionText, QuestionType, OptionsJSON, CorrectAnswer, Weight, Trait, UserID, CreatedAt` | `QuestionID` | `uiSaveAssessment` |
| `AssessmentBatches` | `BatchID, Token, CompanyName, AssessmentID, AssessmentTitle, MaxCandidates, UsedSlots, AssignedBy, CreatedAt, ExpiresAt, IsActive` | `BatchID`; `Token` is the public key (72-char, two UUIDs) | `uiCreateBatch`, `uiStartTest` (UsedSlots) |
| `Assignments` | `AssignmentID, BatchID, Token, CandidateEmail, AssessmentID, Status, StartedAt, CompletedAt, CreatedAt` | `AssignmentID` | `uiStartTest`, `uiSubmitTest` |
| `Responses` | `ResponseID, AssignmentID, QuestionID, Answer, Score, AnsweredAt, EmailCandidate, CreatedAt` | `ResponseID` | `uiSubmitTest` (bulk `setValues`) |
| `AuditLog` | `Timestamp, ActorEmail, Action, Details` | — | `logAudit_` |
| `Users` | `UserID, Name, Email, Position, Department, Type, PasswordHash, SessionToken, SessionExpiry, Phone, CreatedAt` | `UserID` | **dormant after merge** |
| `UsersPermission` | `PermissionID, Position, PageName, AccessType, UserID, CreatedAt` | `PermissionID` | **dormant after merge** |

`Results` and `Config`: declared, unused, headers unknown (R-2).

Value vocabularies the ERP must keep reading: `Assessments.Category ∈ {Technical, Psychometric}`;
`Questions.QuestionType ∈ {MCQ, Likert, MostLeast, OpenText}`; `OptionsJSON` is a JSON array of
strings; `Assignments.Status ∈ {In Progress, Completed}`; a MostLeast answer is the JSON string
`{"most":"<statement>","least":"<statement>"}`; `IsActive` boolean.

### 2.3 The workflow, stage by stage

1. **Author.** Title, category, description, time limit (mandatory, >0), pass score %, active flag,
   then N questions (drag-to-reorder) each with type, trait, weight, options and an optional
   correct answer. Saved once, never edited.
2. **Distribute.** Pick a company name (free text with datalist), an active assessment and a slot
   count → a token link valid 10 days. Copy from the batches list.
3. **Take.** Candidate opens the link, types an email, starts. One card per question, crossfade,
   next disabled until answered, MostLeast forbids the same statement for most and least, timer
   badge, auto-submit at zero, confirmation dialog, completion screen.
4. **Review.** Summary table (company, assessment, email, score, verdict, status), filters, per
   candidate print with the answers breakdown, Excel and PDF export.
5. **Administer.** Add staff, set the page matrix per position.

### 2.4 What is worth keeping

The **domain model is sound and stays as-is**: an assessment owns ordered questions; a batch is a
tokenised, slot-limited, expiring distribution of one assessment to one client; an assignment is one
candidate's attempt; responses are one row per question. The candidate experience is the strongest
page in the app — the one-question-at-a-time flow, the MostLeast matrix, the answered-gate on Next,
the completion screen — and it is carried over in spirit, rebuilt on the house components.

### 2.5 Defects and gaps — the enhancement backlog

Numbered so later documents can refer to them.

| # | Gap | Severity | Addressed in |
|---|---|---|---|
| **G-01** | Scoring is wrong for any non-MCQ item; weights ignored; `Score` never written (R-5) | **Critical** | §5.4 scoring engine, Phase 2 |
| **G-02** | No server time authority; refresh restarts the timer and loses answers (R-6) | High | §5.3, Phase 5 |
| **G-03** | Unlocked slot check — over-admission race (R-7) | High | Phase 5 (`executeWithLock_`) |
| **G-04** | Batches: fixed 10-day expiry, no deactivate/extend, no invite list, no per-batch view (R-8) | High | §5.2, Phase 4 |
| **G-05** | Assessments immutable: no toggle, duplicate, versioning; no reuse (R-9) | High | §5.1, Phase 3 |
| **G-06** | No grading path for OpenText; traits and MostLeast never scored (backlog task 3.1) | **Critical** for "high-level assessment" | §5.4, Phase 6 |
| **G-07** | Unescaped author text in candidate and print pages (R-10) | High (security) | every render goes through `FMT.escape` |
| **G-08** | Broken failure handlers hide server errors on five pages (R-11) | Medium | disappears — `API.call` + `UIC.toast` |
| **G-09** | Candidate payload still carries `Trait` (CorrectAnswer and Weight are stripped) | Low | strip `Trait`, `UserID`, `CreatedAt` too |
| **G-10** | Mixed EN/AR, LTR Bootstrap layout, five CDN libraries (Bootstrap, icons, SortableJS, xlsx, jsPDF) | — | rebuilt on `UIC.*`; `API.ensureXlsx` for Excel; browser print for PDF |
| **G-11** | Candidate must answer every question, yet a timeout submits partial answers | Medium | §5.3: skip allowed with a review screen; MostLeast requires both |
| **G-12** | No candidate-side events (tab switches, late submission) recorded | Medium | §5.3 anti-cheat, `AuditLog` tab |
| **G-13** | Free-text `CompanyName`, denormalised `AssessmentTitle` | Low | kept; `AssessmentTitle` back-filled from `Assessments` on read, as today |
| **G-14** | No dashboard, no batch analytics, no trait profile, no candidate comparison | Medium | §6 pages: dashboard KPIs, result view with trait chart |
| **G-15** | Dead code: `authenticateCandidateToken_`, `doPost` API, `Results`/`Config`, `ComingSoon` | — | not carried over |
| **G-16** | Mixed date types (R-13) | Medium | one normaliser, §5.6 |
| **G-17** | Standalone staff logins and the `Position` matrix | — | replaced by `ERP_Users` + `ERP_Pages_Matrix` (owner, §9) |

---

## 3. What the ERP demands of a company — the integration contract

A company in this project is: **one registry file** (`registerCompany_(uid, {dispatch, pageForAction,
tableForAction, tables, pages})`, wired into `ensureCompaniesRegistered_`), **one actions file**
(an IIFE namespace with a `PAGE_ACCESS` map feeding `guard_`, an `ACTION_TABLES` map, `register(name,
fn)`), **one nav partial** (`window.<X>_MENU` groups, since registry-derived menus — step 4.2 — were
deliberately skipped), and **one template per page** that includes `CSS_Tokens`, `UI_Components`,
`Client_Helpers`, the nav partial and `getCompanyThemeCSS_(uid)`, builds its chrome with
`UIC.appShell`, calls the server through `companyCall(moduleAction, data)` → `API.call('company_action',
{target_system, module_action, data}, SESSION_TOKEN)`, and gates its buttons with `UIC.canAdd_()` /
`UIC.canFull_()`. `Company_ValleyFoods_Contracts.html` is the canonical small example and is the
template every new page here is patterned on.

### 3.1 The seven traps specific to this merge

These are the non-obvious things that would ship broken if the run followed the ValleyFoods pattern
mechanically. Each has a verification assertion in §8.

| # | Trap | Consequence if ignored | Resolution |
|---|---|---|---|
| **T-1** | Candidate page needs no session (R-14) | Fine — `public: true` on the registry entry works. But the page **must not** call `UIC.appShell` (it would build a topbar with a logout and a user menu for nobody) | `ac_take` renders its own minimal chrome; `nav: false`; it will still be listed in صفحات النظام (R-21) — harmless, note it |
| **T-2** | No unauthenticated company API (R-15) | Candidate cannot start or submit | New route `company_public_action` (`requireAuth: false`) → `executeCompanyPublicAction_` → `company.publicDispatch(payload, dbId)`; the company keeps a **separate allowlist** that never reaches the authenticated `actions` map. Kill switch still blocks it (auth runs first, then `isSystemEnabled_`) — candidates get the disabled message, which is correct |
| **T-3** | Header-case shadowing (R-16) | Edits through `saveRecordWithAudit_` silently do nothing | Company-local `acInsert_` / `acUpdate_` (§6.4): header-mapped `appendRow` and a direct `updateRowByCriteria_` **without** merging `old`, followed by `logHistory_`. `saveRecordWithAudit_` may be used **only** with header-case keys on update and lower-case keys on create — a rule too easy to get wrong, so it is not used |
| **T-4** | `ID_Counter` tab creation (R-17) | A new tab appears in the owner's assessment spreadsheet on the first save | Avoided by T-3's write path (no `addRecord_`, no `getNextId_`). IDs stay 16-hex UUID slices, as today (`uid16_` already exists in `Company_ValleyFoods_Actions.js`; the namespace gets its own copy) |
| **T-5** | Home FAB on the public page (R-18) | External candidates see a button into the ERP | One additive line at the top of `UIC.ensureHomeLogo`: `if (window.UIC_PUBLIC_PAGE) return;`. The candidate template sets the flag in `<head>` before the include. `tools/verify/ui3_homefab.js` is updated **deliberately** to assert the gate is the only gate. Fallback if the owner refuses a shared-layer edit: page-local `#home-logo-fab{display:none}` plus a `DOMContentLoaded` remove — weaker, because the anchor still exists in the DOM |
| **T-6** | Verb-driven access and logging (R-20) | A grading action named `update_*` would demand **full**; a `save_*` action logs as UNKNOWN | Naming rule for every action (§6.2): `get_*` reads; `add_*` creates **and** grading (write); `toggle_*` / `update_*` management (full); never `save_*` |
| **T-7** | Mixed value types from the standalone (R-13) | `new Date('2026-09-06 10:00:00')` is implementation-defined; `IsActive === true` misses `'true'` | One `acDate_` / `acBool_` normaliser used by every reader; writes keep the standalone's string format for the same columns so rows written by either app look alike (§5.6) |

Two smaller ones: **T-8** — `executeWithLock_` defaults to 5 s; candidate submissions cluster at a
batch deadline, so candidate writes pass `15000` (the standalone's value). **T-9** — the smoke
harness substitutes `<?!= pageParams ?>` with `0`, so the candidate page reads its token from
`location.search`, never from a scriptlet.

---

## 4. Mapping — standalone to ERP

| Standalone | ERP | Note |
|---|---|---|
| `Login.html`, `uiLogin`, `Users` tab | `0_ERPlogin`, `ERP_Users` | staff become ERP users with `company = 32fafd256ccb7a1c` (owner) |
| `Admin.html`, `uiAddUser` | `ERP_Management` → المستخدمون | gone |
| `PermissionAssignment.html`, `UsersPermission` | `ERP_Management` → صلاحيات الأدوار, `ERP_Pages_Matrix` | `Full/Read/None` → `full/write/read`; gone |
| `MainPage.html` | `Company_Assessment_Dashboard.html` (`ac_dashboard`) | KPI tiles + module tiles |
| `CreateAssessment.html` | `Company_Assessment_AssessmentForm.html` (`ac_assessment_form`) | full-page form: a document with line items, per the Phase 5.8 rule |
| `ViewAssessments.html` | `Company_Assessment_Assessments.html` (`ac_assessments`) | control panel, kebab row actions |
| `CreateBatch.html` + `ViewBatches.html` | `Company_Assessment_Batches.html` (`ac_batches`) | list + create modal |
| `ReviewResults.html` (summary) | `Company_Assessment_Results.html` (`ac_results`) | list; Excel via `UIC.exportExcel`; print via the Phase 7 rules |
| `ReviewResults.html` (print details) | `Company_Assessment_ResultView.html` (`ac_result_view`) | statusbar, notebook tabs, grading, trait chart |
| `CandidateTest.html` (`takeTest`) | `Company_Assessment_Take.html` (`ac_take`, **public**) | see §5.3 |
| `ComingSoon.html`, `CSS.html` | — | not carried |
| `uiSaveAssessment` … `uiGetAssignmentDetails` | `AssessmentCenter` actions (§6.2) | one dispatcher, `PAGE_ACCESS` |
| `uiStartTest`, `uiSubmitTest` | `AssessmentCenter.publicDispatch_` (§6.3) | via `company_public_action` |
| `logAudit_` → `AuditLog` | SystemLog (automatic, staff actions) **and** the sheet's `AuditLog` tab (candidate-side events only) | the tab keeps its four columns and its meaning |
| `withLock_`, `getSheet_`, `writeRowByHeaders_`, … | `executeWithLock_`, `getSheet_(name, dbId)`, `getAllRecords_`, `updateRowByCriteria_`, `appendRowWithRetry_`, `logHistory_` | via `acInsert_` / `acUpdate_` (T-3) |
| Bootstrap, icons, SortableJS, xlsx CDN, jsPDF | `UIC.*`, `UIC.icon`, native drag (HTML5 DnD on the question cards), `API.ensureXlsx`, browser print | zero new external scripts |

The `assessment center/` folder stays on disk untouched and un-deployed (`.claspignore` already
excludes it). Retiring the standalone deployment is an owner step (§9.4).

---

## 5. The target workflow — enhanced

Enhancements are tiered by what they cost the owner:

- **Tier A — no schema change.** Uses existing columns, existing tabs, value vocabularies and the
  JSON already inside `OptionsJSON`. **Everything in Phases 1–7 is Tier A.**
- **Tier B — additive columns**, appended at the end of an existing tab, never inserted, never
  renamed. Header-driven readers on both sides tolerate them. **Gated on D-2**; each item is
  listed with the column it needs so the owner can accept them one by one.
- **Tier C — later.** Belongs to the assessment *framework* this merge kick-starts (§5.7). Named so
  the design leaves room for it; not built.

### 5.1 Author — assessments and questions

| | Behaviour | Tier |
|---|---|---|
| Create | as today, on `UIC.field` / `UIC.combo`; questions as compact cards with HTML5 drag handles; option list entry with Enter; Likert pre-fills 1–5 | A |
| **Categories** | `Technical`, `Psychometric` kept; `Situational` (judgement), `Language`, `Competency` added as **values** in the same column, with Arabic labels in the UI (`فني / نفسي / مواقف / لغة / كفاءة`) | A |
| **Per-statement trait on MostLeast** | `OptionsJSON` becomes `[{"text":"…","trait":"D"}, …]` for MostLeast and Likert-with-trait; plain strings remain valid and parse as `{text, trait: ''}` — **backward compatible, same column** | A |
| **Versioning rule** | An assessment with ≥ 1 assignment is **read-only**; the form opens in view mode with a **نسخة جديدة** (duplicate) action that copies `Assessments` + `Questions` with new ids and `Title + " (v2)"`. This is what makes historical scores stable | A |
| Toggle active | `toggle_assessment_active` (full) | A |
| Duplicate | `add_assessment_copy` (write) | A |
| Print | the assessment sheet, with answers marked, through the shared print rules | A |
| Randomised order / option shuffle | deterministic per assignment (seeded by `AssignmentID`) so a reviewer sees the candidate's order | **B** — `Assessments.ShuffleQuestions` |
| Sections / instructions per block | | **B** — `Questions.Section` |
| Language / direction | page chrome bilingual; every question and option rendered with `dir="auto"` so Arabic and English items each read correctly | A; **B** adds `Assessments.Language` for a whole-page direction |
| Shared question bank across assessments | | **C** (new tab) |

### 5.2 Distribute — batches

| | Behaviour | Tier |
|---|---|---|
| Create | company (datalist of existing names), assessment (active only), slots, **expiry in days** (default 10, max 90) — the fixed 10 becomes a default | A |
| Link | `<scriptUrl>?action=ac_take&token=<Token>` — computed on read, so the list always shows the **ERP** link even for batches created by the standalone | A |
| Manage | `toggle_batch_active` (deactivate / reactivate), `update_batch_expiry` (extend) — both **full** by the naming rule, which is the right level for a manager | A |
| **Invite list (closed batch)** | Pre-create `Assignments` rows with `Status = Invited` and the candidate email (`add_batch_invites`, write). Rule: **if a batch has any `Invited` row, only invited emails may start**; otherwise the batch is open, as today. `MaxCandidates` still caps. No column added — it is a new `Status` value | A |
| Per-batch view | drawer or modal listing the batch's assignments with status, score, link copy | A |
| Internal employees | a batch whose `CompanyName` is the department; employees are candidates identified by email. Cross-company joins are out of bounds (§0.7) | A |
| Candidate name / phone / position captured at start | | **B** — `Assignments.CandidateName`, `CandidatePhone`, `AppliedPosition` |
| Email the link | | **C** (needs `MailApp` scope decision) |

### 5.3 Take — the candidate experience (public)

| | Behaviour | Tier |
|---|---|---|
| Welcome | title, category, duration, question count, instructions (`Description`), email field, consent checkbox (`أقر بأنني سأجيب بنفسي دون مساعدة`) | A |
| Start | `add_candidate_attempt` under `executeWithLock_(…, 15000)`: validates token format, batch active and unexpired, invite rule, slot cap, existing attempt; **returns `remaining_seconds` computed from `StartedAt`** — the server is the time authority (G-02) | A |
| Resume | same email + same device → the page restores its **localStorage draft** (`ac_draft_<token>_<email>`) and the server's remaining time; no progress write to the sheet, so no write amplification against a slow backend | A; **B/C** server-side progress only if cross-device resume is ever required |
| Answer | one question at a time, `UIC`-styled choice cards, the MostLeast matrix (same-statement rejection kept), OpenText textarea, per-item `dir="auto"`, progress bar; **skipping allowed** (G-11) except MostLeast needs both or none | A |
| Review before submit | a summary listing unanswered questions with jump links; submit needs `UIC.confirm` | A |
| Submit | `add_candidate_submission`, locked: ownership check (assignment + token + email), single submission, **late check** (`now − StartedAt > TimeLimit + 60 s` → accepted, flagged), bulk `setValues` of responses **with auto-grades already filled** (§5.4), status `Completed`, events written to `AuditLog` in the same request | A |
| Timeout | client auto-submits at zero with what it has; the server's late check is the authority | A |
| Anti-cheat | `visibilitychange` and `blur` counted client-side, batched into the submission payload as `events: [{type, at}]` → one `AuditLog` row per event type with `Details = "AssignmentID=<id>; count=<n>; first=<ts>; last=<ts>"`. No extra requests. Copy/paste is **not** blocked — hostile and trivially bypassed; it is logged on OpenText items instead | A |
| Completion | thank-you screen; no score shown to the candidate (policy — D-4) | A |
| Rate limit | `CacheService` counter per `token + action`, 30/min, after the pattern of `checkLoginLockout_` | A |
| Chrome | no `appShell`, no home FAB (T-5), no session; a plain header with the company logo (`getCompanyLogoUrl_`) and the title | A |

### 5.4 Score — the engine (G-01, G-06)

A **pure function**, `acScore_(assessment, questions, responses, events)`, in the actions file,
callable from the submission handler, the results list and the result view, and testable under node
with fixtures (§8, `ac2_scoring.js`).

| Item type | Auto score | Counts toward pass/fail | Trait contribution |
|---|---|---|---|
| `MCQ` | `Weight` if `norm(Answer) === norm(CorrectAnswer)` else 0; `norm` trims and case-folds | yes: `max += Weight` | — |
| `Likert` | — | **no** | `value(1..5) × Weight` to the question's `Trait` |
| `MostLeast` | — | **no** | `+Weight` to the trait of the *most* statement, `−Weight` to the trait of the *least* statement (per-statement trait from `OptionsJSON` objects; falls back to the question-level `Trait` for legacy string options) |
| `OpenText` | **manual** — reviewer sets `Responses.Score` (0…`Weight`) | yes, once graded: `max += Weight` | — |

- **Verdict:** `Pass` if `Σscore / Σmax ≥ PassScore / 100` over gradable items; `Pending` while any
  OpenText item is ungraded; `N/A` if there are no gradable items (a pure psychometric).
- **Trait profile:** `{trait: {raw, max, pct}}`, `pct` normalised to the achievable range so a bar
  chart is meaningful; rendered with `API.ensureChart` + `UIC.applyChartDefaults` in the result view.
- **Persistence:** auto grades are written into `Responses.Score` at submission; manual grades by
  `add_candidate_grade` (write). Verdict and profile are **computed on read**. Persisting a summary
  row is **B** (`Results` tab, headers unknown — D-3) and not needed for correctness.
- **Legacy rows:** responses the standalone wrote have `Score = ''`; the engine re-derives auto
  scores from `CorrectAnswer` when `Score` is blank on an auto-gradable item, so history scores
  correctly too, with no back-fill write.

### 5.5 Review — results and decisions

| | Behaviour | Tier |
|---|---|---|
| Results list | control panel: search, filters (company, assessment, status, verdict), **group by company** via `UIC.dtGroupBy`; columns: company, assessment, candidate, started, score, verdict, status, ⋮ | A |
| Result view | header + `UIC.statusbar(['مدعو','قيد التنفيذ','مكتمل','تمت المراجعة'])`; `UIC.smartButtons` (batch, assessment — counts from loaded data only); score card; **notebook** tabs: الإجابات (per item, correct/incorrect marking, grade inputs on OpenText), السمات (trait chart + table), الأحداث (tab switches, late flag from `AuditLog`) | A |
| Grading | `add_candidate_grade` (write): `{assignment_id, grades: [{response_id, score}]}` validated `0 ≤ score ≤ Weight`; **unlocks** the verdict; `Status → Reviewed` when nothing is pending | A (uses `Responses.Score`) |
| Decision & notes | hire / hold / reject + reviewer note | **B** — `Assignments.ReviewDecision, ReviewNotes, ReviewedBy, ReviewedAt` |
| Print | one-candidate report through the shared print rules (headers repeat, totals do not split); Excel of the list via the toolbar | A |
| Compare | side-by-side of candidates in one batch | **C** |

### 5.6 Cross-cutting rules

- **Dates.** `acDate_(v)` accepts `Date`, ISO, and `yyyy-MM-dd HH:mm:ss` (parsed as script-timezone
  local time, which is what the standalone meant); `acStamp_()` writes the standalone's string
  format so a reviewer looking at the sheet sees one shape. `acBool_(v)` accepts `true/'true'/'TRUE'/1`.
- **IDs.** 16-hex UUID slices, as today. Batch tokens stay two UUIDs (72 chars); the public
  dispatcher rejects anything else before touching the sheet.
- **Escaping.** Every author-entered string reaches the DOM through `FMT.escape` (G-07). The
  candidate page is the one place in the app where the author is a different person from the viewer.
- **Payload hygiene.** The candidate read strips `CorrectAnswer`, `Weight`, `Trait`, `UserID`,
  `CreatedAt` and the per-statement `trait` from options (G-09).
- **Logging.** Staff writes land in SystemLog automatically (`Table`/`Page` via `tableForAction_`
  / `pageForAction_`) and in `ERP_Record_History` via `logHistory_` with `record_id = <PK>`, so the
  existing history panel opens on an assessment or a batch. Candidate events land in the sheet's
  `AuditLog` tab. `SystemLog.UserEmail` is empty for public actions — expected; the assignment id is
  returned as `data.assignedId` so `extractRecordId_` fills `RecordID`.

### 5.7 The framework this kick-starts (Tier C, for orientation only)

A competency model (traits as first-class records with descriptions and bands), assessment templates
per role, periodic employee appraisals reusing the same engine, interview scorecards, 360° feedback,
and a candidate pipeline view. Each needs a new tab and its own plan. The design choices above that
keep the door open: per-statement traits inside `OptionsJSON`, the pure scoring engine, the
`Invited` status, and the public dispatcher with an allowlist.

---

## 6. Architecture of the new company

### 6.1 Files

```
Company_Assessment_Registry.js          registerAssessment_() — one call, uid 32fafd256ccb7a1c
Company_Assessment_Actions.js           IIFE AssessmentCenter — PAGE_ACCESS, ACTION_TABLES, PUBLIC_ACTIONS,
                                        guard_, dispatch_, publicDispatch_, data helpers, scoring engine, handlers
Company_Assessment_Nav.html             window.ASSESSMENT_MENU
Company_Assessment_Dashboard.html       ac_dashboard   (pages[0] — the tile target)
Company_Assessment_Assessments.html     ac_assessments
Company_Assessment_AssessmentForm.html  ac_assessment_form   ?id=<AssessmentID> for view/duplicate
Company_Assessment_Batches.html         ac_batches
Company_Assessment_Results.html         ac_results
Company_Assessment_ResultView.html      ac_result_view       ?assignment=<AssignmentID>
Company_Assessment_Take.html            ac_take              PUBLIC, ?token=<Token>
tools/verify/ac1_wiring.js … ac6_review.js, tools/verify/fixtures/ac_*.json
ASSESSMENT_CENTER_RESULTS.md            written at the end
```

Modified, additively: `01_Registry.js` (one call), `Code.js` (one route + one function),
`UI_Components.html` (T-5 gate, one line), `tools/verify/run_all.js` (STEPS lines),
`tools/verify/ui3_homefab.js` (deliberate assertion update), `NEXT_STEPS_OWNER.md` (owner register).
`design_preview/_sources.js` must be rebuilt after the `UI_Components.html` edit — **coordinate with
the other effort that has it dirty (R-24)** or land T-5 last.

### 6.2 Registry and action catalog

```js
registerCompany_('32fafd256ccb7a1c', {
  dispatch: AssessmentCenter.dispatch_,
  publicDispatch: AssessmentCenter.publicDispatch_,        // NEW key — read by executeCompanyPublicAction_ only
  pageForAction: AssessmentCenter.pageForAction_,
  tableForAction: AssessmentCenter.tableForAction_,
  tables: [
    { id: 'ac_assessments_tbl', sheetName: 'Assessments',       pkColumn: 'AssessmentID', labelAr: 'التقييمات',  pageId: 'ac_assessments' },
    { id: 'ac_batches_tbl',     sheetName: 'AssessmentBatches', pkColumn: 'BatchID',      labelAr: 'الدفعات',    pageId: 'ac_batches' },
    { id: 'ac_assignments_tbl', sheetName: 'Assignments',       pkColumn: 'AssignmentID', labelAr: 'المحاولات',  pageId: 'ac_results' }
  ],
  pages: [
    { action: 'ac_dashboard',       template: 'Company_Assessment_Dashboard',      title: 'مركز التقييم — لوحة التحكم', label: 'لوحة التحكم' },
    { action: 'ac_assessments',     template: 'Company_Assessment_Assessments',    title: 'التقييمات',        label: 'التقييمات',        nav: false },
    { action: 'ac_assessment_form', template: 'Company_Assessment_AssessmentForm', title: 'تقييم',            label: 'تقييم',            nav: false },
    { action: 'ac_batches',         template: 'Company_Assessment_Batches',        title: 'دفعات التقييم',    label: 'دفعات التقييم',    nav: false },
    { action: 'ac_results',         template: 'Company_Assessment_Results',        title: 'النتائج',          label: 'النتائج',          nav: false },
    { action: 'ac_result_view',     template: 'Company_Assessment_ResultView',     title: 'نتيجة مرشح',       label: 'نتيجة مرشح',       nav: false },
    { action: 'ac_take',            template: 'Company_Assessment_Take',           title: 'التقييم',          label: 'التقييم',          nav: false, public: true }
  ]
});
```

`ac_assessment_form` and `ac_result_view` are detail pages reached from their lists; they inherit
the list's page id for **access** by mapping their actions to `ac_assessments` / `ac_results` in
`PAGE_ACCESS`, but they are separate registry entries because the router needs a template per action.
The owner grants the list pages **and** the detail pages together (§9.2).

**Authenticated actions** — name → page → access (the verb is chosen so the router's inference
(R-20) and the guard agree):

| Action | Page | Access | Logs as |
|---|---|---|---|
| `get_ac_dashboard` | ac_dashboard | read | — |
| `get_ac_assessments` | ac_assessments | read | — |
| `get_ac_assessment` (with questions, for view / duplicate / print) | ac_assessments | read | — |
| `add_ac_assessment` (header + questions, one lock) | ac_assessments | write | ADD |
| `add_ac_assessment_copy` | ac_assessments | write | ADD |
| `toggle_ac_assessment_active` | ac_assessments | full | EDIT |
| `get_ac_batches` (with link and usage; title back-filled) | ac_batches | read | — |
| `get_ac_batch` (assignments of one batch) | ac_batches | read | — |
| `add_ac_batch` | ac_batches | write | ADD |
| `add_ac_batch_invites` | ac_batches | write | ADD |
| `toggle_ac_batch_active` | ac_batches | full | EDIT |
| `update_ac_batch_expiry` | ac_batches | full | EDIT |
| `get_ac_results` (summary rows, scored) | ac_results | read | — |
| `get_ac_result` (one assignment: answers, profile, events) | ac_results | read | — |
| `add_ac_candidate_grade` | ac_results | write | ADD |
| `prefetch_refs` | ac_dashboard | read | — |

`ACTION_TABLES` maps each to its primary sheet for `SystemLog.Table`.

### 6.3 The public dispatcher

```js
// Code.js — ROUTES (additive)
'company_public_action': { handler: executeCompanyPublicAction_, requireAuth: false },

function executeCompanyPublicAction_(payload, sessionToken, authUser) {
  const company = COMPANY_REGISTRY[payload && payload.target_system];
  if (!company || typeof company.publicDispatch !== 'function') throw new Error('Unknown company: ' + (payload && payload.target_system));
  return company.publicDispatch(payload, getCompanySpreadsheetId_(payload.target_system));
}
```

In the company: `PUBLIC_ACTIONS = { get_ac_candidate_assessment, add_ac_candidate_attempt,
add_ac_candidate_submission }` — a **separate object**; `publicDispatch_` looks up only this object,
never `actions`, rate-limits by `token + action`, validates the token's shape, and every handler
re-validates ownership (`token` ↔ batch, `assignment_id` + `email` ↔ assignment) before any read of
a second sheet. The client calls it through a page-local `publicCall(moduleAction, data)` that wraps
`API.call('company_public_action', {target_system, module_action, data})` with no token.

Why a generic route rather than three assessment-specific ones: three `requireAuth:false` entries
that reach into one company's namespace from `Code.js` would couple the control plane to a company.
One route plus a registry key keeps `Code.js` company-agnostic (its stated responsibility) and gives
the next public-facing company the same door. The route is inert for the three existing companies,
which register no `publicDispatch` — asserted in `ac1_wiring.js`.

### 6.4 Data helpers (T-3, T-4, T-7)

Inside the namespace:

- `acRows_(dbId, sheet)` → `getAllRecords_` (request-memoised; header-case keys).
- `acByPk_(dbId, sheet, pk)` → `getRecordsByPk_` for O(1) joins across the five tabs.
- `acInsert_(dbId, sheet, obj, user, pkName)` — resolves headers once, maps `obj` case-insensitively
  onto them, `appendRowWithRetry_` inside `executeWithLock_`, `noteMutation_()`, then
  `logHistory_(dbId, sheet, 'rec_' + pk, pk, user, 'create', obj, null)`. Bulk variant
  `acInsertMany_` builds a matrix and does **one** `setValues` for questions and responses, as the
  standalone's `uiSubmitTest` already does.
- `acUpdate_(dbId, sheet, pkName, pkValue, patch, user)` — reads `old` from `acRows_`,
  `updateRowByCriteria_(sheet, pkName, pkValue, patch)` with the patch alone (no merge, so T-3 cannot
  occur), then `logHistory_(…, 'update', Object.assign({}, old, patch), old)`.
- `acDate_`, `acStamp_`, `acBool_`, `acUid_` (16-hex), `acToken_` (two UUIDs), `acJson_` (safe parse).
- `acPublicAssessment_(assessment, questions)` — the stripped candidate projection (§5.6).
- `acScore_` — §5.4.

### 6.5 Security posture of the merged system

| Concern | Standalone | Merged |
|---|---|---|
| Staff auth | own SHA-256, 12 h token in the user row | ERP salted hashes, multi-device sessions, lockout, kill switch |
| Page access | Position × page, `Read` treated as `Full` | `ERP_Pages_Matrix` read/write/full, server-enforced per action |
| Candidate auth | 72-char batch token in URL + email | same, plus format check, rate limit, lock on admission, ownership re-check on submit |
| Author → candidate XSS | unescaped | `FMT.escape` everywhere; asserted |
| Answer-key leakage | CorrectAnswer/Weight stripped | plus Trait, per-statement traits, author id |
| Audit | `AuditLog` for staff | SystemLog + record history for staff; `AuditLog` tab for candidate events |
| Concurrency | lock on submit only | lock on admission, submit, grade, and every staff write |

---

## 7. Page specifications — conforming to the unified UI

All pages: `<html lang="ar">`, the four includes plus `getCompanyThemeCSS_('32fafd256ccb7a1c')`,
`UIC.appShell` with `companyLogoUrl` / `companyLogoHref` / `menuGroups: window.ASSESSMENT_MENU`,
`SESSION_TOKEN` from `location.search`, `IS_SUPER_ADMIN` / `USER_PAGES` scriptlets exactly as
`Company_ValleyFoods_Contracts.html` does, `CAN_WRITE = UIC.canAdd_()`, `CAN_FULL = UIC.canFull_()`.
Tokens only — no hex literals (C6). Widths only on the five tiers (C7). Every class used is defined
in `UI_Components.html` or in the page's own `<style>` (C5). Form grids use `.form-grid` (F4a).

**Nav** (`Company_Assessment_Nav.html`):

```
التقييمات: التقييمات · إنشاء تقييم
التوزيع:  دفعات التقييم
النتائج:  النتائج
```

| Page | Shell / control panel | Body | Modals | Actions |
|---|---|---|---|---|
| **ac_dashboard** | breadcrumb `مركز التقييم / لوحة التحكم` | four `UIC.statCard` tiles (`تقييمات نشطة`, `دفعات مفتوحة`, `محاولات قيد التنفيذ`, `بانتظار المراجعة`) from **one** `get_ac_dashboard` read of three tabs, each tile independent like the VF dashboard; `UIC.moduleTile` grid from `COMPANY_PAGES` | — | — |
| **ac_assessments** | `controlPanel: { search: {table:'ac-assess-table'}, actions: [CAN_WRITE && {text:'إنشاء تقييم', onClick: navTo(ac_assessment_form)}] }` | `UIC.dataTable`: title, category pill, questions count, time, pass %, status pill, attempts count; kebab: عرض, طباعة, نسخة جديدة (write), تفعيل/إيقاف (full); `emptyState` with a create action | — | `get_ac_assessments`, `toggle_…`, `add_…_copy` |
| **ac_assessment_form** | breadcrumb array (clickable), pager none | **full-page form**: `.form-grid` header (title, category combo, time, pass, active toggle, description textarea); questions as compact cards in a `#ac-questions` list — type select, trait, weight, options editor (Enter to add, ✕ to remove, per-option trait combo when MostLeast), correct-answer combo over the options for MCQ; HTML5 drag handle; sticky footer with حفظ (`UI.submitOnce`) and إلغاء; `UIC.trackDirty('ac-assess-form')`; `UIC.registerShortcuts({save})`; **view mode** when `?id=` and the assessment has attempts: fields disabled, banner explaining the versioning rule, `نسخة جديدة` button | `UIC.confirm` on discard | `get_ac_assessment`, `add_ac_assessment`, `add_ac_assessment_copy` |
| **ac_batches** | control panel with search and `إنشاء دفعة` (write) | table: company, assessment, usage `used / max` with a `.progress`-style bar built from tokens, expires (relative, red when past), status pill, kebab: نسخ الرابط, المرشحون, تمديد (full), إيقاف/تفعيل (full), قائمة الدعوات (write) | create (`size:'md'`): company `UIC.field` with `UIC.datalist`, assessment combo (active only), slots, expiry days; invites (`size:'lg'`): textarea of emails, one per line, validated; extend: date field; candidates (`size:'xl'`): read-only table of the batch's assignments | `get_ac_batches`, `get_ac_batch`, `add_ac_batch`, `add_ac_batch_invites`, `toggle_…`, `update_…_expiry` |
| **ac_results** | control panel: search, filters as combos (company, assessment, status, verdict), `UIC.groupMenu` on company | table: company, assessment, candidate, started, score `x / y (pct)`, verdict pill (`Pass`/`Fail`/`Pending`/`N/A` → نجح/لم ينجح/بانتظار التصحيح/—), status pill, kebab: عرض, طباعة; `rowClick` opens the view | — | `get_ac_results` |
| **ac_result_view** | breadcrumb array; `UIC.smartButtons([{label:'الدفعة', count:1, …}, {label:'التقييم', count:1, …}])` | `UIC.statusbar`; score card; `UIC.notebook('ac-rv', [الإجابات, السمات, الأحداث])`; grading inputs (`type:'number'`, `min:0`, `step:'0.5'`, max = weight) on OpenText items visible when `CAN_WRITE`; حفظ الدرجات; chart on the traits tab via `API.ensureChart`; print button → `window.print()` under the shared print rules | `UIC.confirm` before saving grades that change a verdict | `get_ac_result`, `add_ac_candidate_grade` |
| **ac_take** (public) | **no appShell**; `window.UIC_PUBLIC_PAGE = true` before the includes; a `.ac-public-head` with the company logo and title; `lang="ar"`, chrome bilingual, items `dir="auto"` | three screens (welcome / test / done) as in the standalone, rebuilt: `.option-card` styled from tokens (defined in the page `<style>`), MostLeast table in `.table` with the same-statement rule, timer badge from `remaining_seconds` (server), progress bar, prev/next/review, unanswered summary, `UIC.confirm` to submit, `UIC.alert` on errors, `beforeunload` guard via `UIC.trackDirty` while a test is running | `UIC.confirm`, `UIC.alert` | `get_ac_candidate_assessment`, `add_ac_candidate_attempt`, `add_ac_candidate_submission` via `publicCall` |

Responsive: every page is checked in the preview at 390 / 768 / 1024 / 1440 / 2560, both tablet
orientations; the candidate page is the one most likely to be used on a phone and is designed
phone-first — one column, 48 px targets, the MostLeast matrix scrolls inside `.table-wrap`.

Print: the assessment print and the candidate report use the Phase 7 rules — `thead` repeats,
`break-inside: avoid` on each question block, brand colour on the header rule only.

Dark mode and density: inherited from the token layer; nothing page-specific.

---

## 8. Phases

One commit per phase step; explicit paths; message format per §11. Each phase ends with the full
gate: `node --check` on touched `.js`, `node tools/verify/parse_pages.js`,
`node tools/verify/ui_smoke_pages.js`, `node tools/ui_check.js`, `node tools/verify/run_all.js`.

### Phase 0 — Recon, branch, baseline (1 commit)

- `git checkout -b feat/assessment-center` from `9f77761` (current HEAD on `ui/forms-readability`).
- Run the full gate and record the numbers; they are the baseline this run must not worsen.
- Record `git status --porcelain` in the results doc so the other efforts' files are on the record.
- **Gate D-1** (§9.3): confirm the company row exists with the sheet link, and the display name.

### Phase 1 — Control plane wiring (3 commits)

| Step | Change | Files |
|---|---|---|
| 1.1 | Registry with the seven pages; `registerAssessment_()` added to `ensureCompaniesRegistered_` | `Company_Assessment_Registry.js`, `01_Registry.js` |
| 1.2 | Actions skeleton: namespace, `PAGE_ACCESS`, `ACTION_TABLES`, `PUBLIC_ACTIONS`, `guard_`, `dispatch_`, `publicDispatch_` with rate limit and token-shape check, data helpers §6.4 (no handlers yet beyond `get_ac_dashboard` and `prefetch_refs`) | `Company_Assessment_Actions.js` |
| 1.3 | `company_public_action` route + `executeCompanyPublicAction_`; nav partial; dashboard page | `Code.js`, `Company_Assessment_Nav.html`, `Company_Assessment_Dashboard.html` |

**Verify:** `ac1_wiring.js` — the registry call exists and is invoked; every `PAGE_ACCESS` page id
is a registered page; every registered non-public page maps at least one action; `PUBLIC_ACTIONS` and
`actions` share no key; `publicDispatch_` never references `actions`; the route is `requireAuth:false`
and the handler throws for a company without `publicDispatch`; the three existing registries register
no `publicDispatch`; `ac_dashboard` is `pages[0]`; `ac_take` is the only `public` company page in the
project. Smoke boots the dashboard.
**Rollback:** 3 reverts. **Risk:** low — `Code.js` gains one inert route.

### Phase 2 — Scoring engine and write contract (2 commits)

| Step | Change |
|---|---|
| 2.1 | `acScore_` per §5.4, plus `acPublicAssessment_`, `acDate_`/`acBool_`/`acStamp_`, `OptionsJSON` parser accepting strings and `{text, trait}` |
| 2.2 | `acInsert_` / `acInsertMany_` / `acUpdate_` with `logHistory_` |

**Verify:** `ac2_scoring.js` over fixtures — weighted MCQ; case-fold and trim on the answer key;
Likert excluded from the denominator and summed into traits; MostLeast ± trait with per-statement
traits and with legacy string options; OpenText pending → `Pending` verdict, graded → resolves;
pass boundary at exactly `PassScore`; N/A for a pure psychometric; legacy blank `Score` re-derived;
`acDate_` on the three input shapes; `acBool_` on five inputs. `ac4_write_contract.js` — against a
stubbed sheet with PascalCase headers: insert lands every value in the right column with mixed-case
input keys; update changes exactly the patched cells; **no `ID_Counter` access occurs**; the history
call receives header-case column names.
**Rollback:** 2 reverts. **Risk:** low — pure functions.

### Phase 3 — Authoring (3 commits)

| Step | Change |
|---|---|
| 3.1 | Handlers: `get_ac_assessments` (with question and attempt counts from one read each), `get_ac_assessment`, `add_ac_assessment` (one lock: header insert + bulk questions), `add_ac_assessment_copy`, `toggle_ac_assessment_active`. Toggling is always allowed; only **editing** is refused once an attempt exists (the versioning rule, §5.1) |
| 3.2 | `Company_Assessment_Assessments.html` |
| 3.3 | `Company_Assessment_AssessmentForm.html` incl. view mode, duplicate, print |

**Verify:** `ac3_authoring.js` — page harness boots both pages with fixtures; the form's collected
payload for a three-type assessment has the expected shape (`OptionsJSON` objects for MostLeast,
strings for MCQ); view mode disables every input when `attempts > 0`; escaping: a question text
containing `<img onerror>` renders escaped in the list, the form and the print; `.form-grid` used,
no inline `grid-template-columns`.
**Rollback:** 3 reverts.

### Phase 4 — Distribution (2 commits)

| Step | Change |
|---|---|
| 4.1 | Handlers: `get_ac_batches`, `get_ac_batch`, `add_ac_batch` (expiry days, token), `add_ac_batch_invites` (dedupe, validate emails, `Status = Invited`), `toggle_ac_batch_active`, `update_ac_batch_expiry` |
| 4.2 | `Company_Assessment_Batches.html` |

**Verify:** `ac4_batches.js` (extends the write-contract file or its own) — link is built from
`ScriptApp` URL + `ac_take`; expiry default 10 / max 90 enforced server-side; invites reject
malformed emails and duplicates; toggling never touches `UsedSlots`; a batch created by the
standalone (fixture row with string dates and boolean `IsActive`) lists correctly.

### Phase 5 — Candidate experience (3 commits)

| Step | Change |
|---|---|
| 5.1 | Public handlers: `get_ac_candidate_assessment` (token → batch → stripped assessment + questions, plus `remaining_seconds` when an attempt exists for the email), `add_ac_candidate_attempt` (locked, invite rule, slot cap, race-safe), `add_ac_candidate_submission` (locked, ownership, single-submit, late flag, auto-grades, events → `AuditLog`) |
| 5.2 | T-5 gate in `UI_Components.html` + `ui3_homefab.js` update + preview rebuild (**coordinate R-24**) |
| 5.3 | `Company_Assessment_Take.html` |

**Verify:** `ac5_candidate.js` — harness boots the page with `google.script.run` stubbed; the
rendered markup contains no `CorrectAnswer`, `Weight` or `Trait` for a fixture that has them; the
same-statement rule; skip allowed except MostLeast half-answered; the review screen lists unanswered
items; the draft round-trips through the localStorage stub; the timer is initialised from
`remaining_seconds`, not from `TimeLimitMinutes`; `UIC_PUBLIC_PAGE` is set before the include and
`ensureHomeLogo` returns early under it; `appShell` is never called. Server side: two concurrent
admissions against one remaining slot admit exactly one (simulated by calling the handler twice on a
stub whose lock is a no-op and asserting the second read sees the first write); a submission 61 s late
is accepted with a `LATE_SUBMISSION` audit row; a second submission is refused.
**Rollback:** 3 reverts; 5.2 is independent.

### Phase 6 — Review (3 commits)

| Step | Change |
|---|---|
| 6.1 | Handlers: `get_ac_results` (joins the five tabs once via `acByPk_`, scores each), `get_ac_result`, `add_ac_candidate_grade` |
| 6.2 | `Company_Assessment_Results.html` |
| 6.3 | `Company_Assessment_ResultView.html` incl. chart and print |

**Verify:** `ac6_review.js` — summary rows for a fixture batch match `acScore_` item by item;
grading clamps to `[0, Weight]` and flips `Status` to `Reviewed` only when nothing is pending;
group-by renders subtotal rows; the chart is requested lazily (`API.ensureChart` present, no
`<script src=…chart…>` in the template); print markup carries `break-inside`.

### Phase 7 — Verification, docs, owner register (2 commits)

- `run_all.js` STEPS lines for `ac1`…`ac6`; final full gate; `ui_check --json` diff against Phase 0.
- `ASSESSMENT_CENTER_RESULTS.md`: what landed per phase with hashes, what was skipped and why,
  every assumption, the decisions left open, and the owner checklist (§9).
- `NEXT_STEPS_OWNER.md`: a new section, same format as the existing ones.

### Phase 8 — Tier B columns (gated on D-2; separate commits, one per column group)

Only if the owner accepts. Each is additive, header-driven, and each has a fixture asserting the
page renders correctly **with and without** the column present, so accepting one later is safe.

| Group | Columns | Unlocks |
|---|---|---|
| B-1 | `Assignments.CandidateName, CandidatePhone, AppliedPosition` | identity beyond email |
| B-2 | `Assignments.ReviewDecision, ReviewNotes, ReviewedBy, ReviewedAt` | hiring decision on the result view |
| B-3 | `Assessments.ShuffleQuestions, Language` | randomisation; whole-page direction |
| B-4 | `Questions.Section` | sectioned tests |
| B-5 | `Results` tab (headers to be provided — D-3) | persisted summaries, faster lists at scale |

---

## 9. Owner register — what only you can do

### 9.1 Before Phase 0 — confirm

- **D-1** The `ERP_Companies` row `32fafd256ccb7a1c` exists, `company_sheet_link` points at the
  assessment spreadsheet, `enabled = TRUE`, and `company_name_ar` is what the tile should say.
  Optional: `company_colors` (first value drives the topbar) and `company_logo` (Drive file id).

### 9.2 After the code lands — data in system tables (no code can do this)

1. **Users.** In `ERP_Management` → المستخدمون, add each assessment staff member with
   `company = 32fafd256ccb7a1c` and a role. Suggested roles: `Assessment Admin`, `Recruiter`,
   `Reviewer`. They set their own password on first login. The standalone's `Users` tab is not read.
2. **Pages.** `ERP_Management` → صفحات النظام → عرض جميع الصفحات: the seven `ac_*` ids appear; save
   them (this creates the `ERP_System_Pages` rows, R-21). Module `HR` or `General`, company = the
   assessment company. `ac_take` will be listed too; granting it does nothing and denying it does
   nothing — it is public by design.
3. **Matrix.** صلاحيات الأدوار, per role:

   | Page | Assessment Admin | Recruiter | Reviewer |
   |---|---|---|---|
   | `ac_dashboard` | full | read | read |
   | `ac_assessments`, `ac_assessment_form` | full | read | read |
   | `ac_batches` | full | write | read |
   | `ac_results`, `ac_result_view` | full | read | write |

   Until a role holds a grant, nobody but a super admin sees the company tile — the page **fails
   closed**, like `tc_box_analysis`, not open like `valley_cost_view`.

### 9.3 Decisions

| # | Question | Recommendation |
|---|---|---|
| **D-2** | Accept Tier B columns (Phase 8)? Which groups? | **B-1 and B-2 yes** — candidate identity and the reviewer's decision are what make this usable for hiring; B-3/B-4 when a real assessment needs them; B-5 only once `Results` headers are known. |
| **D-3** | What are the headers of the `Results` and `Config` tabs? | Paste them, or say they are empty and may be repurposed. Until then neither tab is touched. |
| **D-4** | Show the candidate a score on completion? | **No.** Psychometrics have no score, OpenText is graded later, and a visible pass/fail invites disputes at the door. Reviewer decides what to communicate. |
| **D-5** | Allow skipping questions? | **Yes** (§5.3). The standalone forced an answer yet submitted partial answers on timeout — the two rules contradicted each other. |
| **D-6** | Keep the shared-layer edit for the home button (T-5) or take the page-local fallback? | **The gate.** One line, asserted, and the anchor never exists on a public page. |
| **D-7** | Rate limits — 30 requests per minute per token per action | Say if a batch of 200 candidates on one link will start within the same minute; the counter is per token, not per candidate, so a large simultaneous start needs a higher number (e.g. 300). |
| **D-8** | Categories to offer (§5.1) | Confirm the five, or name yours. Values only, no schema. |

### 9.4 Cutover — retiring the standalone

Both apps write to the **same sheet**. Running both in parallel risks two `UsedSlots` writers and two
sources of `Assignments`. Order:

1. Deploy the ERP with this company; grant the roles; log in and create one test batch.
2. In the Apps Script editor of the standalone project, **archive the web app deployment** (Manage
   deployments → archive). Existing candidate links to the old URL then stop working — so first list
   active batches in the ERP's دفعات page (every batch's `ExpiresAt` is visible) and either let them
   expire (≤ 10 days) or re-issue links from the ERP. Rows the standalone already wrote are read
   correctly by the ERP (R-13 / T-7); nothing needs migrating.
3. Leave the `Users`, `UsersPermission` tabs in place; the ERP never reads them. Delete them only
   when you are sure the standalone will not be revived.
4. The `assessment center/` folder stays in the repo as reference. Say the word to move it under
   `Backup/`.

### 9.5 Your visual checklist — after your first push

**Dashboard and access**
- [ ] A user in a granted role sees the assessment company tile on the main dashboard; a user with no
      grant does not.
- [ ] The tile opens لوحة التحكم with four counts that fill in independently.
- [ ] The topbar shows the company colour from `company_colors`; the canvas is the neutral grey-white.

**Authoring**
- [ ] إنشاء تقييم: add an MCQ, a Likert, a MostLeast with per-statement traits, an OpenText; drag to
      reorder; save. The list shows the count and the pill.
- [ ] Open a saved assessment that has an attempt: every field is disabled and the banner offers
      نسخة جديدة, which creates "(v2)".
- [ ] Type `<b>x</b>` into a question: it prints as literal text everywhere.

**Distribution**
- [ ] Create a batch with expiry 3 days; the link copied from ⋮ opens the ERP's public page, not the
      old app.
- [ ] Add two invited emails; a third email cannot start; the two can.
- [ ] Deactivate the batch: the link says the assessment is inactive.

**Candidate (use a phone)**
- [ ] No topbar, no logout, **no floating home button**, no way into the ERP.
- [ ] Arabic and English questions each read in the correct direction.
- [ ] Refresh mid-test: answers and remaining time survive.
- [ ] Switch tabs twice, submit: the result view's الأحداث tab shows two switches.
- [ ] Let the timer expire: the test submits what was answered; the result shows the late flag only
      if submission arrived more than a minute after time.

**Review**
- [ ] A mixed assessment shows بانتظار التصحيح until the OpenText item is graded, then نجح/لم ينجح.
- [ ] The Likert/MostLeast items do **not** count against the score; the traits tab shows a chart.
- [ ] Group by company shows subtotal rows; Excel export downloads; print repeats headers on page 2.
- [ ] Open the record history (السجل) on a batch: create and toggle entries are there with your name.

---

## 10. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | No browser until the owner pushes | certain | high | harness + preview + §9.5 checklist, as every prior run |
| R2 | `Code.js` route edit collides with control-plane expectations | low | high | one inert route; `ac1_wiring.js` asserts the other companies are unaffected |
| R3 | Header-case trap (T-3) reintroduced by a later contributor using `saveRecordWithAudit_` | medium | high | `ac4_write_contract.js` greps the actions file for `saveRecordWithAudit_(` and `addRecord_(` and **fails** if either appears |
| R4 | Public route abused (slot exhaustion, sheet spam) | medium | medium | token shape check, rate limit, lock, single-submit; kill switch covers it |
| R5 | Preview rebuild collides with the other effort's dirty `_sources.js` (R-24) | high | low | land T-5 last; coordinate; or the page-local fallback (D-6) |
| R6 | Scoring semantics differ from what the owner expects (Likert excluded, etc.) | medium | medium | §5.4 table is the contract; fixtures encode it; D-5 / D-8 |
| R7 | Standalone still live after cutover → double writers | medium | high | §9.4 order; the ERP's `get_ac_batches` shows every batch's expiry so the window is visible |
| R8 | A `Date` cell auto-coerced by Sheets arrives as `Date`, a string as string (T-7) | certain | medium | `acDate_` on every read; fixture with both shapes |
| R9 | Large batches make `get_ac_results` slow (five full reads) | low now | medium later | request memo + `getRecordsByPk_`; B-5 if it ever matters |
| R10 | Grant screen lists `ac_take` and someone "denies" it expecting an effect | low | low | documented in §9.2 |

---

## 11. Commit protocol and scope

```
<type>(ac-<phase>): <short summary>

<what changed, file by file>
<what was verified, and how>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

**Files this plan may create or modify — nothing else:**

```
Company_Assessment_Registry.js          (new)
Company_Assessment_Actions.js           (new)
Company_Assessment_Nav.html             (new)
Company_Assessment_Dashboard.html       (new)
Company_Assessment_Assessments.html     (new)
Company_Assessment_AssessmentForm.html  (new)
Company_Assessment_Batches.html         (new)
Company_Assessment_Results.html         (new)
Company_Assessment_ResultView.html      (new)
Company_Assessment_Take.html            (new)
01_Registry.js                          (one call in ensureCompaniesRegistered_)
Code.js                                 (one ROUTES entry + executeCompanyPublicAction_)
UI_Components.html                      (one-line gate in ensureHomeLogo — D-6)
tools/verify/ac1_wiring.js … ac6_review.js, tools/verify/fixtures/ac_*.json   (new)
tools/verify/ui3_homefab.js             (deliberate assertion update, if D-6 = gate)
tools/verify/run_all.js                 (STEPS lines)
design_preview/_sources.js              (rebuild, only after coordinating R-24)
ASSESSMENT_CENTER_RESULTS.md            (new, at the end)
NEXT_STEPS_OWNER.md                     (new section)
```

**What this plan does not do:** touch any tab or column of the assessment spreadsheet beyond
writing rows with today's columns (Tier B is Phase 8, gated); read or write any `ERP_*` row; alter
any existing company; deploy; email candidates; block copy/paste; show candidates their score; link
assessment candidates to any other company's employee records.

---

*Companion documents: `assessment center/ARCHITECTURE_AND_TASKS.md` (the standalone's own doc —
note its backlog tasks 3.1, 4.1 and 4.2 are delivered by §5.4, §5.3 anti-cheat and the batch
`ExpiresAt` check respectively), `UI_UX_EXECUTION_PLAN.md` (the design system this conforms to),
`UI_FORMS_AND_FILTERS_PLAN.md` (`.form-grid`, modal sizes), `NEXT_STEPS_OWNER.md` (the register
format §9 follows).*
