# Assessment Center Platform — System Architecture & AI Implementation Guide

> **Project Target:** Assessment Platform (Google Apps Script Web App)  
> **Location:** `d:\Work\Script\assessment center`  
> **Script ID:** `1Ln70Ig-si054cmAQQydd_DIvr5vPTYg6P_1rgwTVPW-23Cx0sPewhoAH`  
> **Version:** 6.2-SECURE (Access-Control Hardened)

---

## 1. Executive Summary & Core Objectives

The **Assessment Center Platform** is a full-featured web application built on **Google Apps Script** with a **Google Sheets** database backend. It enables organizations to create, manage, distribute, and analyze candidate assessments (technical tests, psychometrics, DISC Most/Least matrix questions, etc.).

### Primary Workflows
1. **User & Permission Management:** Super Admin / Admin role creation with granular page-level permissions.
2. **Assessment Bank & Question Authoring:** Creation of tests with timed limits, passing scores, multiple choice, or trait-based questions.
3. **Client Batch Links:** Generating shareable, slot-limited, expiring assessment links for external companies or candidate batches.
4. **Candidate Test Experience:** Public-facing, secure, timed test environment (`CandidateTest.html`) with anti-cheat controls and smooth transitions.
5. **Review & Analytics:** Scoring, candidate summary reports, detailed answer breakdowns, pass/fail verdicts, and audit logging.

---

## 2. System Architecture & Routing Model

The application uses Google Apps Script's `doGet` and `doPost` handlers to manage server-side rendering and API requests.

```
                    ┌─────────────────────────┐
                    │      HTTP Request       │
                    └────────────┬────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │  doGet(e) / doPost(e)     │
                   └─────────────┬─────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────▼────────┐     ┌────────▼────────┐     ┌────────▼────────┐
│ Candidate Flow  │     │ Admin Dashboard │     │   JSON API      │
│  action=takeTest│     │ action=dashboard│     │   (doPost)      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
┌────────▼────────┐     ┌────────▼────────┐     ┌────────▼────────┐
│CandidateTest.tpl│     │ MainPage.html   │     │ ACTIONS Handler │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Page Route Registry (`PAGES` array in `Code.js`)

| Action (`?action=`) | UI Page Title | HTML Template | Access Level | Description |
|---|---|---|---|---|
| `login` | Login | `Login.html` | Public | Authentication & first-time password setup |
| `dashboard` | Dashboard | `MainPage.html` | Authenticated | Main navigation control panel |
| `adding_users` | User Management | `Admin.html` | Admin | Create team members & assign positions |
| `permissions` | Permissions | `PermissionAssignment.html` | Super Admin | Manage granular page access per position |
| `create_assessment` | Create Assessment | `CreateAssessment.html` | Authenticated | Build tests and question banks |
| `view_assessments` | View Assessments | `ViewAssessments.html` | Authenticated | List existing assessments & inspect questions |
| `create_batch` | Create Batch | `CreateBatch.html` | Authenticated | Generate client test links (slot & expiry limited) |
| `view_batches` | View Batches | `ViewBatches.html` | Authenticated | Monitor active client batches & link usage |
| `review_results` | Review Results | `ReviewResults.html` | Authenticated | Candidate performance breakdown & answer inspector |
| `takeTest` | Assessment Test | `CandidateTest.html` | Candidate Token | Public test-taking portal for candidates |

---

## 3. Database Schema (Google Sheets Tabs)

The backend uses a single active Google Spreadsheet divided into 10 structured tabs (`SHEET` object):

### 3.1. `Users`
- **Keys:** `UserID`, `Name`, `Email`, `Position`, `Department`, `Type`, `PasswordHash`, `SessionToken`, `SessionExpiry`, `Phone`, `CreatedAt`
- **Positions Allowed:** `Super Admin`, `Admin`, `Reviewer`, `Staff`

### 3.2. `UsersPermission`
- **Keys:** `PermissionID`, `Position`, `PageName`, `AccessType`, `UserID`, `CreatedAt`
- **Access Types:** `Full`, `Read`, `None`

### 3.3. `Assessments`
- **Keys:** `AssessmentID`, `Title`, `Category`, `Description`, `TimeLimitMinutes`, `PassScore`, `IsActive`, `UserID`, `CreatedAt`, `UpdatedAt`

### 3.4. `Questions`
- **Keys:** `QuestionID`, `AssessmentID`, `OrderIndex`, `QuestionText`, `QuestionType`, `OptionsJSON`, `CorrectAnswer`, `Weight`, `Trait`, `UserID`, `CreatedAt`
- **Question Types:** `MultipleChoice`, `MostLeast` (Matrix), `OpenText`

### 3.5. `AssessmentBatches`
- **Keys:** `BatchID`, `Token`, `CompanyName`, `AssessmentID`, `AssessmentTitle`, `MaxCandidates`, `UsedSlots`, `AssignedBy`, `CreatedAt`, `ExpiresAt`, `IsActive`

### 3.6. `Assignments`
- **Keys:** `AssignmentID`, `BatchID`, `Token`, `CandidateEmail`, `AssessmentID`, `Status`, `StartedAt`, `CompletedAt`, `CreatedAt`
- **Statuses:** `In Progress`, `Completed`

### 3.7. `Responses`
- **Keys:** `ResponseID`, `AssignmentID`, `QuestionID`, `Answer`, `Score`, `AnsweredAt`, `EmailCandidate`, `CreatedAt`

### 3.8. `AuditLog`
- **Keys:** `Timestamp`, `ActorEmail`, `Action`, `Details`

---

## 4. Frontend Files & Design System

The platform uses **Bootstrap 5** supplemented by custom CSS in `CSS.html` (which is included in all pages via `<?!= include('CSS'); ?>`).

### HTML Template Overview
- **`CSS.html`**: Shared theme styles, typography, high-contrast button tokens, cards, and animations.
- **`Login.html`**: User login form & first-time password bootstrap dialog.
- **`MainPage.html`**: Dashboard cards with action shortcuts and user welcome header.
- **`Admin.html`**: User creation form and position dropdown.
- **`PermissionAssignment.html`**: Dynamic permissions matrix editor per position.
- **`CreateAssessment.html`**: Dynamic form for adding questions, options, weights, and test settings.
- **`ViewAssessments.html`**: Table view of assessments with question inspector modal.
- **`CreateBatch.html`**: Client company link generator with slot limits and expiration dates.
- **`ViewBatches.html`**: Active client links tracker with copyable test URLs.
- **`ReviewResults.html`**: Results summary table, pass/fail indicators, candidate filter, and detailed response modal.
- **`CandidateTest.html`**: Candidate test environment with countdown timer, question pagination, Most/Least matrix radios, and auto-submit logic.

---

## 5. Security & Defensive Helper Subsystem

1. **Password Security:** SHA-256 hashing via `hashPassword_()`. First-time login password setup required if `PasswordHash` is empty.
2. **Session Security:** 12-hour session expiration enforced via `authenticateSystemUser_()`. Cryptographically secure 72-char session tokens (`generateSecureToken_()`).
3. **Throttling:** Login failure lockouts (5 failed attempts = 15-minute lock via `checkLoginThrottle_()`).
4. **Access Control:** `requirePageAccess_()` verifies `UsersPermission` tab unless the user is `Super Admin`.
5. **Concurrency Control:** `withLock_()` wraps critical writes using `LockService.getScriptLock()` (15s timeout).
6. **Defensive Sheet Operations:**
   - `getHeaders_(sheet)` caches header names per tab.
   - `writeRowByHeaders_(sheet, dataObject)` maps JS objects to exact sheet column headers dynamically.
   - `mapRowToObject_(row, sheetName)` converts raw sheet arrays to key-value objects.

---

## 6. Server-Side Function Registry (`google.script.run` API)

### Authentication & User Management
- `uiLogin(email, password, newPassword)`
- `uiAddUser(sessionToken, userData)`

### Assessment Authoring & Viewing
- `uiSaveAssessment(sessionToken, assessmentData, questionsData)`
- `uiGetAssessments(sessionToken)`
- `uiGetAssessmentDetailsForAdmin(sessionToken, assessmentId)`

### Batch & Link Management
- `uiGetActiveAssessments(sessionToken)`
- `uiCreateBatch(sessionToken, companyName, assessmentId, assessmentTitle, maxCandidates)`
- `uiGetExistingCompanies(sessionToken)`
- `uiGetBatches(sessionToken)`

### Candidate Test Execution
- `uiStartTest(token, candidateEmail)`
- `uiSubmitTest(payload)`

### Reports & Analytics
- `uiGetCandidateSummary(sessionToken)`
- `uiGetAssignmentDetails(sessionToken, assignmentId)`

### Permission System
- `uiGetSystemPages(sessionToken)`
- `uiGetPermissions(sessionToken, position)`
- `uiSavePermissions(sessionToken, position, permissionsObj)`

---

## 7. AI Agent Task Backlog & Implementation Roadmap

AI Agents or developers building on this codebase should execute tasks in the following phased order:

### Phase 1: Core Setup & Quality Verification
- [ ] **Task 1.1: Environment Verification**  
  Ensure `appsscript.json` timezone and permissions are properly aligned. Run `initializeSuperAdmin_()` via Script Properties (`BOOTSTRAP_ADMIN_PASSWORD`).
- [ ] **Task 1.2: Database Tab Schema Validation**  
  Write a schema validation utility script to ensure all 10 tabs (`Users`, `Assessments`, `Questions`, `AssessmentBatches`, `Assignments`, `Responses`, `Results`, `Config`, `AuditLog`, `UsersPermission`) have correct header rows.

### Phase 2: UX / UI Polish & Accessibility
- [ ] **Task 2.1: Unified Modal & Toast Notifications**  
  Replace standard `alert()` calls across HTML templates with modern Bootstrap Toasts or unified modal popups.
- [ ] **Task 2.2: Arabic / English Translation Alignment**  
  Audit bilingual text across `CreateAssessment.html`, `ReviewResults.html`, and `CandidateTest.html` to ensure complete RTL support and proper typography.

### Phase 3: Advanced Scoring & Psychometric Engine
- [ ] **Task 3.1: DISC / Trait Scoring Calculator**  
  Enhance `uiSubmitTest` or add a post-processing function to calculate psychometric trait scores (DISC, Big Five) for `MostLeast` question types.
- [ ] **Task 3.2: Automated PDF Report Generation**  
  Integrate Google Drive / PDF generation for candidate test reports with chart visualizers.

### Phase 4: Security & Operational Hardening
- [ ] **Task 4.1: Candidate Anti-Cheat Monitoring**  
  Add tab-switch detection (visibilitychange listener) inside `CandidateTest.html` to log tab focus losses to `AuditLog`.
- [ ] **Task 4.2: Automated Expiry Cleanup**  
  Implement a scheduled Apps Script trigger to set `IsActive = false` for batches past their `ExpiresAt` date.

---

## 8. Summary for Developers

When modifying or adding features:
1. Always route user interface calls through `google.script.run`.
2. Wrap all writing operations in `withLock_()`.
3. Pass `sessionToken` as the first parameter for all authenticated backend functions.
4. Ensure new columns added to Sheets are reflected in `SHEET` and matched by `writeRowByHeaders_()`.
