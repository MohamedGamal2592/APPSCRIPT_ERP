# RUN PROMPT — Assessment Center → ERP merge

Execute **[ASSESSMENT_CENTER_MERGE_PLAN.md](ASSESSMENT_CENTER_MERGE_PLAN.md)** end to end —
**all nine phases, 0 through 8, in one session, without stopping to ask for approval between
phases, and without writing me interim summaries.** Report once, at the end.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods) plus an `ERP_Information` auth
spreadsheet. Arabic RTL interface. Repo root `d:\Work\Script`, remote `origin`
(`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

You are adding a **fourth company**: the assessment center, uid `32fafd256ccb7a1c`, whose
spreadsheet is the one the standalone app in `assessment center/` already uses. The standalone's
code is your **functional reference**; the ERP's `Company_ValleyFoods_Contracts.html` and
`Company_ValleyFoods_Actions.js` are your **structural reference**. The plan decides everything
in between.

This run writes **code only**. It creates no rows, edits no rows, deletes no rows, adds no column,
and deploys nothing.

---

## 🔁 Autonomy — read this first, it is the point of this prompt

**Do not stop between phases. Do not ask "shall I continue?". Do not ask me to approve a phase, a
diff, a commit, a design choice or a decision.** Work straight through Phase 0 → Phase 8 and
report once at the end.

Every decision the plan left open is **already answered below in §Decisions**. If you find yourself
wanting to ask a question:

1. **The plan or §Decisions covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why in the results doc, continue
   with the rest.
3. **Genuinely blocked** (needs my Google account, needs a live sheet read, needs a browser) → write
   it up, mark it blocked-on-owner, **continue with everything else**.
4. **A whole phase is unworkable** → report it plainly, do not fake it, move to the next phase.

A reported skip is always better than a guess, and **far** better than a stopped run. The only
outcome that is not acceptable is a phase reported as done that quietly writes to a production
sheet, or a page reported as done that does not boot.

Commit after each phase step **without asking**. Do not push.

---

## Read these first, in full, before touching anything

1. **[ASSESSMENT_CENTER_MERGE_PLAN.md](ASSESSMENT_CENTER_MERGE_PLAN.md)** — your specification.
   It carries the verified findings `R-1…R-24`, the seven traps `T-1…T-9`, the exact column list of
   the eight live tabs (§2.2), the scoring contract (§5.4), the action catalog with its access
   levels (§6.2), the public dispatcher (§6.3), the write helpers (§6.4), the per-page specs (§7),
   the phases (§8) and the owner register (§9). **This prompt orients you; the plan decides.**
2. **`assessment center/Code.js`** and **`assessment center/CandidateTest.html`** — the behaviour
   you are reproducing and enhancing. Read every `ui*` function; the column names in the
   `writeRowByHeaders_` calls are the schema.
3. **`Company_ValleyFoods_Contracts.html`** — the page shape every new page copies: includes,
   scriptlets, `companyCall`, `appShell`, `dataTable`, `openModal`, `validateForm`/`collectForm`.
4. **`Company_ValleyFoods_Actions.js`** lines 1–420 — the namespace pattern: `PAGE_ACCESS`,
   `ACTION_TABLES`, `guard_`, `dispatch_`, `register`, `uid16_`, and the `register(...)` tail block.
5. **`Company_ValleyFoods_Registry.js`** and **`01_Registry.js`** — how a company is registered.
6. **`Code.js`** — `doGet` (the `page.public` branch ~L54–61), `ROUTES` (~L235), `apiRouter_`
   (~L311), `executeCompanyAction_` (~L396), `COMPANY_SA_ONLY_RE` (~L430), `classifyAction_` (~L624).
7. **`02_DataAccess.js`** — `buildRecordsFromRaw_`, `addRecord_`, `updateRowByCriteria_`,
   `appendRowWithRetry_`, `executeWithLock_`, `logHistory_`, `getRecordsByPk_`. Read them to
   *understand* trap T-3; you will **not** call `addRecord_` or `saveRecordWithAudit_`.
8. **`UI_Components.html`** — `UIC.ensureHomeLogo` (~L493) and its boot IIFE (~L544), `appShell`
   (~L2970), `dataTable` (~L585), `openModal` (~L2122), `field`/`combo` (~L1763/1826), `statusbar`
   (~L2606), `notebook` (~L2663), `smartButtons` (~L2641), `confirm`/`alert` (~L2305/2357),
   `trackDirty` (~L2383), `controlPanel` (~L2880), `groupMenu`/`dtGroupBy` (~L912/828),
   `statCard`/`moduleTile` (~L2794/2813), `registerShortcuts` (~L3276).
9. **`Client_Helpers.html`** — `API.call`, `API.ensureXlsx`, `API.ensureChart`, `UI.submitOnce`,
   `FMT.escape`, `SESSION.token`.
10. **`tools/verify/run_all.js`**, **`tools/verify/pageharness.js`**, **`tools/verify/domstub.js`**,
    **`tools/verify/ui_smoke_pages.js`**, **`tools/verify/s13_forms_filters.js`** — the offline
    suite you will extend and the harness your page tests are written on.

**Verify every `file:line` before you edit it.** Line numbers in the plan and this prompt were taken
at `9f77761` and drift with every commit — confirm each one yourself.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema

No column added, renamed, removed, reordered or retyped in any tab of any spreadsheet — the three
existing companies', the assessment spreadsheet, or `ERP_Information`. No new sheet, no new tab.

**This has one specific trap in this run — T-4.** `addRecord_` and `getNextId_` create an
`ID_Counter` tab in whatever spreadsheet they are first called against. **You must not call either
against the assessment spreadsheet.** Every write goes through the company-local `acInsert_` /
`acInsertMany_` / `acUpdate_` helpers of plan §6.4, which map by headers and append or update
directly, exactly as `05_Admin.js` does for uid-keyed tables. `ac4_write_contract.js` must grep the
actions file and **fail** if `addRecord_(`, `getNextId_(` or `saveRecordWithAudit_(` appears in it.

**Phase 8 (Tier B) adds no column either.** It writes code paths that read and write the B-1 and
B-2 columns **only if the header row contains them**, with a fixture proving every page renders
correctly when they are absent. The owner appends the columns; the run does not.

## 2. NEVER add, edit, or delete data in any business or system table

No writing rows. No updating cells. No deleting rows. No backfills. No test records. No seed data.
Not by hand, not by script, not via `clasp run`, not via a one-off function you write and execute.

**This includes `ERP_Users`, `ERP_System_Pages` and `ERP_Pages_Matrix`.** The new company needs rows
in all three. **You must not add them** — they are the owner's step through the admin UI (plan
§9.2). Registering the company is enough to make its pages appear in «صفحات النظام»; a super admin
can open every page immediately, and everyone else waits for the owner's grants.

The only writes this run may ever cause are the ones your **new handlers** perform when a real user
or a real candidate uses the running app, after the owner deploys. You are not to invoke them.

## 3. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never `clasp push`
the standalone project either (`1Ln70Ig…` in `assessment center/.clasp.json`). Never create,
promote or archive a deployment. Never run `clasp login`, `clasp run`, or `clasp open`. Never push
to `origin`. **The owner edits locally and pushes when everything is finished.**

## 4. NEVER touch the owner's Google account

No triggers, no Script Properties, no running any server function, no reading any spreadsheet. You
have **no data access**. The assessment spreadsheet's headers are what plan §2.2 says they are,
taken from the standalone's code; the `Results` and `Config` tabs are **unknown and untouched**.

## 5. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend function
signature, every existing response shape, every HTML anchor id, every existing registry entry, every
existing route.

This run is **purely additive**. `Code.js` gains one route and one function; `01_Registry.js` gains
one call; `UI_Components.html` gains one line. Nothing existing changes. If a step seems to require
changing an existing signature, response or behaviour, **stop that step and write it up** — do not
do it.

## 6. Stay inside your file set

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
UI_Components.html                      (one line at the top of UIC.ensureHomeLogo)
tools/verify/ac1_wiring.js              (new)
tools/verify/ac2_scoring.js             (new)
tools/verify/ac3_authoring.js           (new)
tools/verify/ac4_write_contract.js      (new — also covers batches)
tools/verify/ac5_candidate.js           (new)
tools/verify/ac6_review.js              (new)
tools/verify/ac7_tierb.js               (new — Phase 8, with-and-without-column fixtures)
tools/verify/fixtures/ac_*.json         (new)
tools/verify/ui3_homefab.js             (deliberate assertion update for the T-5 gate)
tools/verify/run_all.js                 (STEPS lines only)
ASSESSMENT_CENTER_RESULTS.md            (new, at the end)
NEXT_STEPS_OWNER.md                     (one new section, nothing else)
```

Nothing else. **The working tree carries other efforts' uncommitted work — leave it alone.**

## 7. Do not touch the other efforts' files

`Company_TopLight_Sales.html`, `Company_TopLight_Sales_Returns.html` and
`design_preview/_sources.js` are **modified by another effort**. Untracked `BOX_ANALYSIS_RUN_PROMPT.md`,
`Box_analysis_prompt.md`, `VALLEYFOODS_RUN_PROMPT.md`, `VALLEY_WAREHOUSE_MOVEMENT_PLAN.md`,
`WAREHOUSE_MOVEMENT_RUN_PROMPT.md`, `IPHONE_RUN_PROMPT.md` and `tools/verify/s11_sales_returns.js`
belong to other work. Do not stage, revert, edit or "clean up" any of them.

## 8. Do not rebuild the design preview

`design_preview/_sources.js` is dirty in the working tree. Running `tools/build_preview.js` would
collide with another effort's work. **Skip it.** Your one-line edit to `UI_Components.html` will
make `ui_check` check **C9** report the preview as stale — that is expected; say so in the results
doc and leave the rebuild to the owner. Every other `ui_check` check must stay green.

## 9. Do not touch `assessment center/`

It is your reference, not your workspace. Do not edit, move, delete or deploy anything in it. It is
already excluded from the push set by `.claspignore`.

---

## Starting state

```bash
cd d:/Work/Script
git branch --show-current      # ui/forms-readability at time of writing
git log --oneline -1           # 9f77761 test(V): s13 forms/filters check, results doc, and the F4b follow-up note
git status --porcelain
```

`git status` will show the modified and untracked files listed in constraint 7, plus the two
untracked files that are yours: `ASSESSMENT_CENTER_MERGE_PLAN.md` and this prompt.

**Create your branch from HEAD and stay on it:**

```bash
git checkout -b feat/assessment-center
```

Commit `ASSESSMENT_CENTER_MERGE_PLAN.md` and `ASSESSMENT_CENTER_RUN_PROMPT.md` as your **first
commit** (they are your spec and are currently untracked), then proceed.

**For every commit: stage explicit paths only.** Never `git add -A`, never `git add .`, never
`git commit -a`. Do not push. Do not rebase. Do not merge.

---

## Decisions — already made, do not re-ask

These resolve every open question in plan §9.3 plus the ones the phases raise. **Treat them as
settled.**

| # | Question | Answer |
|---|---|---|
| **D-1** | Does the `ERP_Companies` row `32fafd256ccb7a1c` exist with the sheet link? | **Assume yes.** You cannot read the sheet. Hard-code the uid in the registry exactly as the other three companies do. Put "confirm the row" first on the owner checklist. |
| **D-2** | Tier B columns (Phase 8) — which groups? | **Build B-1 and B-2 code paths, tolerant of absent columns.** B-1: `Assignments.CandidateName, CandidatePhone, AppliedPosition` (captured on the welcome screen when the headers exist; the fields are hidden when they do not). B-2: `Assignments.ReviewDecision, ReviewNotes, ReviewedBy, ReviewedAt` (decision block on the result view when the headers exist). Detect by `getHeaders_` at runtime, never by assumption. **B-3, B-4 and B-5 are out of scope** — list them in the results doc as follow-ups. **You add no column.** |
| **D-3** | `Results` / `Config` tab headers? | **Unknown. Do not read or write either tab.** Everything is computed on read. |
| **D-4** | Show the candidate a score on completion? | **No.** Thank-you screen only. |
| **D-5** | Allow skipping questions? | **Yes.** Next is always enabled; a MostLeast item must have both or neither selected; the review screen before submit lists every unanswered item with a jump link. |
| **D-6** | Home button on the public page — shared-layer gate or page-local fallback? | **The gate.** One line at the top of `UIC.ensureHomeLogo`: `if (window.UIC_PUBLIC_PAGE) return;`. The candidate template sets `window.UIC_PUBLIC_PAGE = true` in a `<script>` **before** the `UI_Components` include. Update `tools/verify/ui3_homefab.js` deliberately so it asserts this flag is the **only** gate, and record why in the file, following the precedent comment in `tools/verify/s0_modal_size.js`. Do not weaken any other assertion. |
| **D-7** | Public rate limit | **300 requests per minute per `token + action`** via `CacheService`, after the pattern of `checkLoginLockout_` in `03_Security.js`. Over the limit → throw the Arabic message `عدد الطلبات كبير، حاول بعد قليل`. |
| **D-8** | Assessment categories | **The five:** `Technical`, `Psychometric`, `Situational`, `Language`, `Competency` as stored values, labelled `فني / نفسي / مواقف / لغة / كفاءة`. Rows with other values still list (show the raw value). |
| **D-9** | Batch expiry | Default **10** days, minimum 1, maximum **90**, enforced server-side. Extension caps at 90 days from today. |
| **D-10** | Late submission grace | **60 seconds** past `TimeLimitMinutes`. Later submissions are **accepted** and flagged with a `LATE_SUBMISSION` row in the sheet's `AuditLog` tab (`Details = "AssignmentID=<id>; late_seconds=<n>"`). Never reject a candidate's work for lateness. |
| **D-11** | Write path | Plan §6.4 exactly: header-mapped `appendRowWithRetry_` / one `setValues` for bulk, `updateRowByCriteria_` with the patch alone, both under `executeWithLock_`, followed by `logHistory_(dbId, sheet, 'rec_' + pk, pk, userEmail, action, newValues, oldValues)`. Candidate writes use `executeWithLock_(fn, 15000)`. |
| **D-12** | Date and boolean shapes | `acDate_` accepts `Date`, ISO strings and `yyyy-MM-dd HH:mm:ss` (script-timezone local); `acStamp_` **writes** `yyyy-MM-dd HH:mm:ss` via `Utilities.formatDate(new Date(), Session.getScriptTimeZone(), …)` so rows from both apps look alike; `acBool_` accepts `true / 'true' / 'TRUE' / 1 / '1'`. |
| **D-13** | Action verbs | Plan §6.2 verbatim. `get_*` reads, `add_*` creates **and grading**, `toggle_*` / `update_*` management (full). **Never `save_*`, `edit_*`, `delete_*`, `remove_*`.** There is no delete path anywhere in this company. |
| **D-14** | The public dispatcher | One generic route `company_public_action` (`requireAuth: false`) + `executeCompanyPublicAction_` in `Code.js` + a `publicDispatch` key on the registry. The company's `PUBLIC_ACTIONS` is a **separate object** holding exactly `get_ac_candidate_assessment`, `add_ac_candidate_attempt`, `add_ac_candidate_submission`. `publicDispatch_` must never reference the authenticated `actions` map. |
| **D-15** | Detail pages' access | `ac_assessment_form` and `ac_result_view` are their own registry entries (the router needs a template per action) and need their own matrix grants; their actions map to `ac_assessments` / `ac_results` in `PAGE_ACCESS`. Put the pairing on the owner checklist. |
| **D-16** | Excel and PDF | Excel via the `dataTable` toolbar (`UIC.exportExcel`, lazy `API.ensureXlsx`). PDF is **browser print** under the Phase 7 print rules. **No jsPDF, no SortableJS, no Bootstrap, no new `<script src>` anywhere.** |
| **D-17** | Chart on the traits tab | `API.ensureChart()` then `UIC.applyChartDefaults()`; a horizontal bar of `pct` per trait; no `<script src>` in the template. |
| **D-18** | MostLeast per-statement traits | `OptionsJSON` may hold strings **or** `{text, trait}` objects. The parser accepts both; the authoring form writes objects for MostLeast and Likert-with-trait, strings for MCQ. The candidate projection strips `trait` from every option. |
| **D-19** | Standalone rows already in the sheet | Must list, score and print correctly with no back-fill. Include a fixture row of each tab **in the standalone's exact shapes** (string dates, boolean `IsActive`, blank `Score`, MostLeast answer as a JSON string) in every relevant verify script. |
| **D-20** | `Company_Assessment_Nav.html` groups | `التقييمات` (التقييمات, إنشاء تقييم), `التوزيع` (دفعات التقييم), `النتائج` (النتائج). |
| **D-21** | Anything else the plan left to judgement | Choose the option that is **additive, tolerant of absence, and asserted by a test**. Note it in the results doc. Do not ask. |

---

## Your task — nine phases, in order, commits as the plan lists them

Do not pause between them. Do not summarise between them.

| # | Phase | Plan § | Essence |
|---|---|---|---|
| **0** | Recon + branch + commit the spec | §8 Phase 0 | Confirm `R-14…R-24` line numbers still hold. Run the full gate and **record the numbers** — they are the baseline. **No code edits.** |
| **1** | Control-plane wiring | §8 Phase 1 | Registry (seven pages, `ac_dashboard` first, `ac_take` public) + `01_Registry.js` call; actions skeleton with `PAGE_ACCESS`, `ACTION_TABLES`, `PUBLIC_ACTIONS`, `guard_`, `dispatch_`, `publicDispatch_`, helpers; the route in `Code.js`; nav partial; dashboard page. `ac1_wiring.js`. |
| **2** | Scoring engine + write contract | §8 Phase 2 | `acScore_` per §5.4 as a **pure function**; `acPublicAssessment_`; `acDate_`/`acBool_`/`acStamp_`; the `OptionsJSON` parser; `acInsert_`/`acInsertMany_`/`acUpdate_`. `ac2_scoring.js`, `ac4_write_contract.js`. |
| **3** | Authoring | §8 Phase 3 | Five handlers; the assessments list; the full-page form with view mode, duplicate and print. `ac3_authoring.js`. |
| **4** | Distribution | §8 Phase 4 | Six handlers; the batches page with create, invites, extend, toggle, candidates modal, copy link. Extend `ac4_write_contract.js`. |
| **5** | Candidate experience | §8 Phase 5 | Three public handlers; the T-5 gate + `ui3_homefab.js`; the public page. `ac5_candidate.js`. |
| **6** | Review | §8 Phase 6 | Three handlers; the results list with group-by; the result view with statusbar, notebook, grading, chart, print. `ac6_review.js`. |
| **7** | Verification + docs + owner register | §8 Phase 7 | `run_all.js` STEPS lines; full gate; `ui_check --json` diff against Phase 0; `ASSESSMENT_CENTER_RESULTS.md`; the `NEXT_STEPS_OWNER.md` section. |
| **8** | Tier B, tolerant of absence | §8 Phase 8, D-2 | B-1 and B-2 code paths gated on `getHeaders_`; `ac7_tierb.js` with with-and-without fixtures; one commit per group; results doc updated. |

### The three phases that carry real risk

**Phase 2 — the write contract (T-3).** `getAllRecords_` returns keys in the **exact header case**
(`AssessmentID`, not `assessmentid`), `addRecord_` looks keys up **lower-cased**, and
`saveRecordWithAudit_`'s update path merges the old record with your patch so a lower-case key is
**shadowed by the old value and the update silently does nothing**. That is why you write
`acInsert_` / `acUpdate_` yourself and never call the three house helpers against this sheet.
`ac4_write_contract.js` must prove, on a stub sheet whose header row is the exact PascalCase list
from plan §2.2, that an insert with mixed-case input keys lands every value in the right column,
that an update changes exactly the patched cells, that `logHistory_` receives header-case column
names, and that no `ID_Counter` access ever happens.

**Phase 5 — the public surface.** External candidates reach this page with no session. Get all of
these right, and assert each in `ac5_candidate.js`:

- The token is read from `location.search`, never from a scriptlet (the smoke harness substitutes
  scriptlets with `0`).
- `window.UIC_PUBLIC_PAGE = true` is set **before** the `UI_Components` include; `UIC.appShell` is
  never called; no `#home-logo-fab` exists.
- The rendered markup for a fixture that has `CorrectAnswer`, `Weight`, `Trait` and per-statement
  `trait` contains **none** of them.
- Every author string reaches the DOM through `FMT.escape` — test with `<img src=x onerror=1>` as a
  question text and as an option.
- `add_ac_candidate_attempt` runs under `executeWithLock_(fn, 15000)` and admits exactly one of two
  admissions racing for one slot; the invite rule (`Invited` rows present → only those emails);
  `remaining_seconds` is computed server-side from `StartedAt`.
- `add_ac_candidate_submission`: ownership by `assignment + token + email`, single submission, the
  60-second grace (D-10), auto-grades filled in `Responses.Score`, events → `AuditLog` in the same
  request, and it returns `data.assignedId = AssignmentID` so SystemLog's `RecordID` is filled.
- The draft round-trips through the localStorage stub; the timer initialises from
  `remaining_seconds`, not from `TimeLimitMinutes`.

**Phase 6 — scoring semantics.** Plan §5.4 is the contract, not a suggestion:

| Type | Auto score | In pass/fail denominator | Trait |
|---|---|---|---|
| `MCQ` | `Weight` if trimmed, case-folded `Answer === CorrectAnswer`, else 0 | yes | — |
| `Likert` | — | **no** | `value × Weight` → question `Trait` |
| `MostLeast` | — | **no** | `+Weight` to the *most* statement's trait, `−Weight` to the *least*'s; question-level `Trait` for legacy string options |
| `OpenText` | manual `Responses.Score` in `[0, Weight]` | yes, once graded | — |

Verdict `Pass` iff `Σscore / Σmax ≥ PassScore/100`; `Pending` while any OpenText is ungraded; `N/A`
when nothing is gradable. Legacy blank `Score` on an auto-gradable item is re-derived on read, never
written back. `ac2_scoring.js` encodes every row of that table, both boundary cases, and the legacy
shapes of D-19.

---

## Verification — you cannot see a browser, and you cannot read the spreadsheet

There is no `node_modules`, no `package.json` and **no layout engine**. Prove what you can
statically; put the rest on the owner's checklist as specific statements.

**After every phase, all five — this is automated verification, not a pause for approval:**

```bash
node --check <each .js you touched>
node tools/verify/parse_pages.js
node tools/verify/ui_smoke_pages.js     # boots EVERY template, yours included — catches a blank page
node tools/ui_check.js                  # C1–C11; only C9 may report stale (constraint 8)
node tools/verify/run_all.js            # full suite, green, including your ac1…ac7
```

**A red suite is a stop-and-fix, not a stop-and-ask.** Fix it and continue.

Things `ui_check` will hold you to on every new page: no bare colour literal (C6 — tokens only),
no width query off the five-tier scale (C7 — `600px`, `900px`, `1280px`, `1920px` only), every CSS
class you use defined in `UI_Components.html` or in the page's own `<style>` (C5 — the orphan count
must not grow), every `UIC.*` / `API.*` / `FMT.*` symbol you call actually defined (C3).

**Write every verify script on the existing harness** (`domstub.js` + `pageharness.js`), the way
`s7_batch_modal.js` and `s13_forms_filters.js` are written: boot the real template, stub
`google.script.run`, route `companyCall` / `publicCall` to fixture functions, assert on the markup
the page's own render functions produce. Fixtures live in `tools/verify/fixtures/ac_*.json` and
include standalone-shaped rows (D-19).

---

## A trap previous sessions hit repeatedly

The Bash tool mangles backslashes inside heredocs (`\\` collapses to `\`) and breaks on awkward
quoting — **and this run is full of Arabic string literals, which break it reliably.** For any file
content with Arabic text, regex escapes, CSS selectors, JSON or nested quoting: use the
`Write`/`Edit` tools, or write a Python transform script to a file with `Write` and run it. **Do not
fight the heredoc.** A mangled `بانتظار التصحيح` or `أكثر شبهاً بي` is a defect that looks right in
review.

---

## Commit protocol

```
<type>(ac-<phase>): <short summary>

<what changed, file by file>
<what was verified, and how>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Stage explicit paths only. **Do not push.** The owner pushes.

---

## Report once, at the end

Write `ASSESSMENT_CENTER_RESULTS.md` and then give me a single summary containing:

1. What shipped, phase by phase, with the commit hash for each.
2. What was skipped or blocked, and why — including the preview rebuild (constraint 8), B-3/B-4/B-5
   (D-2), and anything in the plan that turned out to be wrong. **Say so plainly; the plan is not
   sacred.**
3. The `ui_check --json` diff between Phase 0 and the end, and the `run_all.js` totals.
4. The **owner register**, in this order, as specific statements — never "check it looks right":
   - confirm the company row (D-1);
   - the users to create and the roles to grant, with the exact page ids (plan §9.2, D-15);
   - the Tier B columns to append, by tab, in the exact spelling the code detects (D-2);
   - the cutover order for retiring the standalone (plan §9.4);
   - the visual checklist (plan §9.5), amended with anything you learned.
5. The decisions you made under D-21, each with one line of reasoning.

Add **one section** to `NEXT_STEPS_OWNER.md` — `# مركز التقييم — blocked on you` — in the same format
as the sections already there, carrying items 4a–4d above. That is the only edit you make to that
file.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema — no column, no tab, and **no `ID_Counter`**: you never call
   `addRecord_`, `getNextId_` or `saveRecordWithAudit_` against the assessment spreadsheet.
2. You will **not** add, edit, or delete data in any table, **including `ERP_Users`,
   `ERP_System_Pages` and `ERP_Pages_Matrix`**. Those rows are the owner's.
3. You will **not** deploy, push, or touch the owner's Google account — neither project.
4. You will **not** stop between phases to ask for approval, and you will **not** write interim
   summaries. Every open decision is answered in §Decisions. Blocked → record it and keep going.
5. `Code.js` gains exactly one route and one function; `01_Registry.js` exactly one call;
   `UI_Components.html` exactly one line. Nothing existing changes.
6. The candidate page is **public**: no session, no `appShell`, no home button, no answer key in
   the payload, every author string escaped, admissions locked, submissions single and ownership-
   checked, lateness flagged never refused.
7. Scoring follows plan §5.4 exactly; Likert and MostLeast never count against a candidate.
8. Other agents' uncommitted work is in the tree, and `design_preview/_sources.js` is dirty. You
   stage only your own files and you do not rebuild the preview.
9. `assessment center/` is read-only reference.
