# Assessment Center merge — results

**Read this before anything else — where the code actually lives.**

This run hit a real environment hazard partway through Phase 1 and had to change its own
git topology mid-flight to keep working safely. Full account in §0. The short version:

> All nine phases are complete and committed. The clean, complete history is on branch
> **`feat/assessment-center-work`**, currently at commit **`266417b`**, in a **separate git worktree**
> at `d:\Work\Script-ac-work` (sibling to the main checkout at `d:\Work\Script`). The branch you were
> told to expect, `feat/assessment-center`, exists in the main checkout but effectively **stopped
> being this run's branch after step 1.2** (commit `1de23af`) — an unrelated, still-active concurrent
> session ("iPhone print pages") has kept committing directly onto it since (`feat(iphone-1)` through
> at least `test(iphone-5)` as of this writing, and possibly more by the time you read this). **Do
> not build on `feat/assessment-center` directly — merge `feat/assessment-center-work` into it
> instead**; §0 gives the exact commands. Because that other session's work keeps landing on the
> shared branch name, **this is a real merge, not a fast-forward** — check with `git log` immediately
> before merging rather than trusting any specific commit hash named here, since it may have moved
> again.

---

## 0. What happened, and why the branch you expected isn't the whole story

This machine runs many concurrent Claude Code sessions against **one shared working directory**
(`d:\Work\Script`) and, it turns out, **one shared git index** — `git add` from one session and
`git commit` from another interleave freely, because they are just two processes pointed at the
same `.git`. Nobody warned this run about that, and nothing about branch names protects against it:
switching to `feat/assessment-center` only moves *this* repo's `HEAD` ref, and any other session's
next bare `git commit` still commits whatever the shared staging area holds at that instant,
regardless of what branch it *thinks* it is on.

**What actually happened:** Phase 1 was proceeding normally — `docs(ac-0)` at `b7fe7fe`,
`feat(ac-1.1)` at `b817e85`, `feat(ac-1.2)` at `1de23af`, each staged with explicit paths and
verified clean before commit. Immediately after staging step 1.3's three files (`Code.js`,
`Company_Assessment_Nav.html`, `Company_Assessment_Dashboard.html`) and *before* this run's own
`git commit` fired, a **different, concurrent session** (working on an unrelated "iPhone print
pages" task, commits titled `feat(iphone-1)`/`feat(iphone-2)`) ran its own `git add` + `git commit`
against the same shared index. Its commit (`91aca4d`) swept up this run's three already-staged
files along with its own — visible directly in `git show --stat 91aca4d`, which lists `Code.js`,
`Company_Assessment_Dashboard.html` and `Company_Assessment_Nav.html` alongside five
`Company_TopLight_*_Print.html` files and `UI_Components.html`.

**Nothing was lost.** The three files' content is exactly what this run wrote (verified by diff
after the fact) and it is durably committed and reachable — just filed under someone else's commit
message and `Co-Authored-By` line instead of this run's own. Rewriting that shared commit's history
would be destructive to whatever the other, still-running session has since built on top of it, so
it was **left alone** rather than "fixed" by force.

**What this run did next, to stop it happening again:** created an isolated `git worktree` —
`git worktree add -b feat/assessment-center-work ../Script-ac-work feat/assessment-center` — which
gives this run its own working directory *and its own git index*, sharing only the object store and
refs with the main checkout. Every commit from Phase 2 onward (`66744f1` through `f0dc1af`) was made
from inside that worktree and never touched the shared index again. Confirmed clean throughout: every
commit's `git status --porcelain` immediately before committing showed only this run's own staged
files.

**What you need to do about it.** Check the actual state first — the other session may have added
more commits to `feat/assessment-center` between when this was written and when you read it:

```bash
cd d:/Work/Script
git log --oneline feat/assessment-center-work..feat/assessment-center   # what landed there meanwhile — review it
git log --oneline feat/assessment-center..feat/assessment-center-work   # this run's own commits not yet on the other branch
```

As of this writing, `feat/assessment-center` carries exactly one commit this run's branch doesn't
(`test(iphone-5)`, from the same concurrent "iPhone print pages" effort) — so **the two branches
have diverged and a merge is needed, not a fast-forward**:

```bash
git switch feat/assessment-center     # from the MAIN checkout, not the worktree
git merge feat/assessment-center-work
```

The merge should be conflict-free: this run's commits touch only files in its own list (constraint 6
of the run prompt) plus the one shared line in `UI_Components.html` (T-5, added well after the
`iphone-*` commits' own edits to that file, at different lines). If `git log` above shows the branches
have NOT diverged by the time you check (i.e. the second command lists nothing new on
`feat/assessment-center`), a `git merge --ff-only feat/assessment-center-work` is equivalent and
simpler. Once merged, the `Script-ac-work` worktree can be removed
(`git worktree remove ../Script-ac-work`) — nothing further depends on it living there.

The interleaved `iphone-*` commits already on `feat/assessment-center-work`'s history (it was
branched from a point after several of them had landed) touch only `UI_Components.html` and five
unrelated `Company_TopLight_*_Print.html` files, and were already reviewed and merged into
`ui/forms-readability` by their own run — nothing to reconcile there either. A rebase to tidy the
interleaving out of history is possible but not attempted here — it would rewrite commits another
still-running session may reference, which is exactly the kind of unilateral call this run was told
not to make.

---

## 1. What shipped, phase by phase

| Phase | Commit(s) | What |
|---|---|---|
| **0** — recon, branch, baseline | `b7fe7fe` | Plan + prompt committed. Baseline recorded: `run_all.js` 37/37, `ui_check` 11/11 (C9 pass). |
| **1.1** — registry | `b817e85` | `Company_Assessment_Registry.js`, one call in `01_Registry.js`. |
| **1.2** — actions skeleton | `1de23af` | `Company_Assessment_Actions.js`: `PAGE_ACCESS`/`ACTION_TABLES`, `guard_`/`dispatch_`/`publicDispatch_` (rate limit + token-shape check), §6.4 id/date/bool helpers, `get_ac_dashboard` + `prefetch_refs`. |
| **1.3** — route, nav, dashboard | *(landed inside `91aca4d`, another session's commit — see §0)* | `Code.js` route + `executeCompanyPublicAction_`; `Company_Assessment_Nav.html`; `Company_Assessment_Dashboard.html`. |
| **2** — scoring + write contract | `66744f1` | `acScore_`, `acPublicAssessment_`, `acParseOptions_` (D-18); `acInsert_`/`acInsertMany_`/`acUpdate_` (T-3/T-4) — **a real header-case bug in `logHistory_`'s inputs was found and fixed while building the test**, see §2 below. `ac2_scoring.js`, `ac4_write_contract.js`. |
| **3** — authoring | `72e0cca` | Five handlers; `Company_Assessment_Assessments.html`; `Company_Assessment_AssessmentForm.html`. **Plan correction**: no edit path exists at all (§2). **A `UIC.dataTable` return-value bug was caught before it shipped** (§2). `ac3_authoring.js`. |
| **4** — distribution | `938f316` | Six handlers; `Company_Assessment_Batches.html`. `ac4_write_contract.js` extended in place, per the file list. |
| **5.1** — public handlers | `a43e8b8` | `get_ac_candidate_assessment`, `add_ac_candidate_attempt`, `add_ac_candidate_submission`. |
| **5.2** — T-5 gate | `257fa87` | One line in `UI_Components.html`; `ui3_homefab.js` updated deliberately, dated comment. |
| **5.3** — candidate page | `a427edc` | `Company_Assessment_Take.html`. **A real ordering bug was caught before any test ran against it** (§2). `ac5_candidate.js`. |
| **6.1–6.3** — review | `931f84c`, `13d6af9`, `83660ff` | Three handlers; `Company_Assessment_Results.html`; `Company_Assessment_ResultView.html`. `ac6_review.js`. |
| **7** — verification, docs | `67cdc41` + this commit | `ac1_wiring.js` written now (a **Phase 1 gap**, see §2); `run_all.js` STEPS for AC1–AC7; this file; the `NEXT_STEPS_OWNER.md` section. |
| **8** — Tier B (D-2) | `f0dc1af` | B-1 + B-2, tolerant of absence, `ac7_tierb.js` with/without fixtures. |

**Final gate:** `node tools/verify/run_all.js` → **44/44**. `node tools/ui_check.js` → **11/11**
(10 PASS + C6 INFO, unchanged in kind from baseline). `node --check` on every touched `.js` file.
`ui_smoke_pages.js`: all 8 new page templates boot against the real shared layer with zero new
throws (3 pre-existing failures, unchanged, listed in `KNOWN_PREEXISTING`).

---

## 2. What was skipped, what turned out wrong, and what was found along the way

**The plan is not sacred, and three things in it turned out wrong or incomplete:**

1. **Phase 3.1's editing story doesn't match the action catalog.** The plan's phase table says
   "only editing is refused once an attempt exists," implying an assessment is editable in place
   until its first attempt. But §6.2's action catalog defines no `update_`/`edit_` verb for
   assessments at all — only `add_ac_assessment` (create), `add_ac_assessment_copy` (duplicate) and
   `toggle_ac_assessment_active`. D-13 forbids inventing an unlisted verb. **Built as: an existing
   assessment is *always* read-only, attempts or not** — matching §5.1's own stated rationale ("this
   is what makes historical scores stable") more literally than the phase table's wording did. One
   real consequence: **"نسخة جديدة" cannot itself be used to fix a typo** — it creates a full,
   independent, still-read-only copy; the only way to get an *editable* draft is to start over in
   إنشاء تقييم and re-type it. If you want true "edit until first attempt," that's a small,
   well-scoped follow-up (one new `update_ac_assessment` action, `full` access per T-6, refused
   server-side once `attempts > 0`) — not built here, so as not to invent an action the plan didn't
   specify.
2. **`ac1_wiring.js` was never written in Phase 1.** Every other phase's dedicated verify file
   shipped in that phase's own commit; this one was simply missed and only surfaced when Phase 7
   went to wire it into `run_all.js` and it didn't exist. Written now, in Phase 7 (`67cdc41`), with
   an honest commit message rather than a silent backfill. It found one real thing while being
   written: the test's own first draft flagged `ac_assessment_form`/`ac_result_view` as "unmapped"
   in `PAGE_ACCESS` — which is correct **by design** (D-15: they share their list page's gate) — so
   the test itself needed a fix, not the wiring. Recorded so nobody "fixes" that exemption later
   without knowing why it's there.
3. **Constraint 8's C9-staleness prediction didn't happen.** The run prompt anticipated the
   `UI_Components.html` edit (T-5) would leave `tools/ui_check.js` check C9 (design preview
   freshness) stale, to be left for you to rebuild. It didn't go stale: something in this
   environment — not this run — regenerates `design_preview/_sources.js` automatically shortly
   after a watched source file changes (observed doing exactly this, unprompted, in the *main*
   working tree during an unrelated concurrent session's edits, and again in this run's own
   worktree right after the T-5 edit). This run never ran `tools/build_preview.js` itself and never
   staged the regenerated bundle in any commit — consistent with constraint 8 either way, and
   recorded here because "I didn't cause it and I don't take credit for it" is worth being explicit
   about.

**Two real bugs were caught before they ever reached a browser, both while writing the verify
scripts a bare git-diff review would not have exercised:**

- **`acInsert_`/`acUpdate_` would have silently broken `logHistory_` (the R-16 shadowing trap, one
  layer further in than the plan describes).** `logHistory_` looks old/new values up **by the
  sheet's real header spelling**. The first draft of `acInsert_` passed the caller's own
  (potentially mixed-case) object straight through as `newValues`, and `acUpdate_` built its
  `newValues` via `Object.assign({}, old, patch)` — both of which reproduce R-16 inside the history
  call even though the *sheet cell itself* would have been written correctly. `ac4_write_contract.js`
  was written specifically to catch this and did: fixed by building a header-case object from what
  was actually written/patched before ever calling `logHistory_`. The sheet write was never wrong;
  the record history entry would have been.
- **`Company_Assessment_Assessments.html` copied a broken rendering pattern from
  `Company_ValleyFoods_Contracts.html`.** `UIC.dataTable(...)` **returns** markup; it does not touch
  the DOM itself (confirmed by reading its full source — it ends in `return html;` after scheduling
  an async chunked fill). `Company_ValleyFoods_Contracts.html`'s pattern — build an empty
  `<table id="...">` placeholder, then call `UIC.dataTable(id, {...})` as a bare statement, discarding
  the return — appears to **never actually render a table's toolbar/rows in a real browser**, for
  any page that copies it. `Company_ValleyFoods_Products.html` shows the real, working convention:
  `container.innerHTML = UIC.dataTable(id, {...})`. Found and fixed while writing `ac3_authoring.js`
  (the list rendered nothing under the harness, which is exactly what it would do in production
  too). **This is outside this run's file set — `Company_ValleyFoods_Contracts.html` was not
  touched** — but it is worth you knowing that page likely doesn't work, independent of this merge.

**A candidate-page bug, also caught before any test ran against it:** the first draft of
`Company_Assessment_Take.html` called its entry point as a bare top-level `loadWelcome();` instead
of this codebase's `document.addEventListener('DOMContentLoaded', ...)` convention every other page
uses. Harmless in a real browser (the script tag sits after the root `<div>` in source order), but
it is *also* the reason the offline DOM-stub harness doesn't already crash on other pages' static
root `<div>`s: their entry points, gated behind `DOMContentLoaded`, simply never run under a harness
that never fires that event. Fixed to match the convention.

**One scoring-semantics nuance worth knowing, not a bug:** a legacy `MostLeast` question whose
`OptionsJSON` is a plain string array (no per-statement trait, D-19's standalone-shaped case) falls
back to the question's own single `Trait` for **both** the most and the least statement. Since one
statement adds `+Weight` and the other subtracts the same amount from the *same* trait bucket, the
net contribution to that trait is always exactly zero for such a question — `raw: 0`, but
`max: 2×Weight`, so the trait still visibly appears in the profile as "touched," just unmoved by
that one answer. This is an honest consequence of the legacy schema's coarseness (it cannot
distinguish which statement drives which trait), not a defect — asserted explicitly in
`ac2_scoring.js` so a future change to this behaviour is a deliberate, visible diff.

**One process deviation, reasoned rather than incidental:** `Company_Assessment_Take.html` uses a
plain `beforeunload` handler instead of `UIC.trackDirty` for the "don't lose your progress" guard
mid-test. `trackDirty` snapshots a `<form>`'s inputs against a baseline; this page has no single
`<form>` wrapping its dynamic one-question-at-a-time view (state lives in a JS object, not a static
DOM tree), so the snapshot model doesn't fit. The plain guard gives the same user-facing protection
for the one thing that matters here (don't navigate away mid-test) without forcing a component into
a shape it wasn't built for.

**Out of scope, by design (D-2):** B-3 (`Assessments.ShuffleQuestions`, `Assessments.Language`), B-4
(`Questions.Section`) and B-5 (a `Results` tab, headers unknown per D-3) were not built. Listed in
the owner register below as later, independent follow-ups.

**Commit granularity, noted plainly:** the run prompt asked for a commit after each phase *step*.
Phases 2, 3 and 8 each landed as **one commit covering multiple steps**, because those steps share
one file (`Company_Assessment_Actions.js`) edited and tested together, and git's staging is
per-file — splitting the diff into step-sized hunks would need manual patch surgery for no reader
benefit. Each such commit's message says exactly which steps it covers and why they're combined.

---

## 3. `ui_check` diff, Phase 0 → end

| Metric | Phase 0 | End | Δ |
|---|---|---|---|
| `js_files` | 20 | 22 | +2 (`Company_Assessment_Registry.js`, `Company_Assessment_Actions.js`) |
| `html_files` | 92 | 100 | +8 (the seven pages + the nav partial) |
| `script_blocks` | 112 | 121 | +9 |
| `symbol_refs` | 3671 | 3873 | +202 |
| **`symbols_undefined`** | **0** | **0** | **unchanged — zero new undefined `UIC`/`API`/`FMT`/`UI` symbols** |
| `distinct_ids` | 618 | 660 | +42 |
| `classes_used` | 418 | 465 | +47 |
| `classes_defined` | 571 | 630 | +59 |
| **`classes_orphan`** | **37** | **37** | **unchanged — zero new orphan classes across 8 new pages** |
| `color_bare` (informational, C6) | 642 | 642 | unchanged |
| `token_ratio` | 0.569 | 0.586 | improved |
| `media_queries` | 12 | 19 | +7, all on the five-tier scale |
| **`media_offbrand`** | **0** | **0** | **unchanged** |
| `dom_nodes_per_row` / `dom_nodes_per_action_cell` | 7 / 6 | 7 / 6 | **unchanged — no DOM-cost regression** |
| C9 (preview freshness) | PASS | PASS | see §2, item 3 |

Every `noWorse`-gated metric held or improved. `run_all.js`: **37/37 → 44/44** (the 7 new `ac*.js`
steps, all passing; nothing pre-existing regressed).

---

## 4. Owner register — what only you can do

### 4a. Confirm the company row (D-1)

`ERP_Companies`: a row with `company_unique_id = 32fafd256ccb7a1c`, `company_sheet_link` pointing at
the assessment spreadsheet the standalone app already uses, `enabled = TRUE`, and `company_name_ar`
set (this is what the dashboard tile and topbar will say). Optional: `company_colors` (first value
drives the topbar accent) and `company_logo` (a Drive file id) — omit either and the generic theme
still renders correctly (R-22).

### 4b. Users, roles, and the exact page ids to grant (§9.2, D-15)

1. **Users** — `ERP_Management` → المستخدمون → add each assessment staff member with
   `company = 32fafd256ccb7a1c`. Suggested roles: `Assessment Admin`, `Recruiter`, `Reviewer`. They
   set their own password on first login. The standalone's `Users`/`UsersPermission` tabs are never
   read by the ERP.
2. **Pages** — `ERP_Management` → صفحات النظام → عرض جميع الصفحات. The seven ids below will appear;
   save them (this is what creates their `ERP_System_Pages` rows — nothing renders until you do).
   Module `HR` or `General`, company = the assessment company.

   | Page id | Template | Notes |
   |---|---|---|
   | `ac_dashboard` | Dashboard | the tile target |
   | `ac_assessments` | Assessments list | |
   | `ac_assessment_form` | Assessment form | **grant together with `ac_assessments`** (D-15 — separate registry entry, shares the list's access gate; a role with the list but not this id cannot open a specific assessment) |
   | `ac_batches` | Batches | |
   | `ac_results` | Results list | |
   | `ac_result_view` | Result detail | **grant together with `ac_results`**, same reason as above |
   | `ac_take` | Candidate (public) | will be listed too; granting or denying it does nothing — it is public by design (R-21) |

3. **Matrix** — صلاحيات الأدوار, per role (unchanged from the plan):

   | Page | Assessment Admin | Recruiter | Reviewer |
   |---|---|---|---|
   | `ac_dashboard` | full | read | read |
   | `ac_assessments`, `ac_assessment_form` | full | read | read |
   | `ac_batches` | full | write | read |
   | `ac_results`, `ac_result_view` | full | read | write |

   Until a role holds a grant, nobody but a super admin sees the company tile at all — the page
   fails closed (like `tc_box_analysis`), not open.

### 4c. Tier B columns — exact spelling, by tab (D-2)

Both groups are **independent and safe to add on your own schedule** — `ac7_tierb.js` proves every
code path is correct with either, both, or neither present; adding one later needs no redeploy of
anything but the sheet itself.

| Group | Tab | Columns (append at the end, exact spelling) | Unlocks |
|---|---|---|---|
| B-1 | `Assignments` | `CandidateName`, `CandidatePhone`, `AppliedPosition` | name/phone/position fields on the candidate welcome screen |
| B-2 | `Assignments` | `ReviewDecision`, `ReviewNotes`, `ReviewedBy`, `ReviewedAt` | the hiring-decision block on the result view |

**Not built this run (D-2), independent follow-ups if you want them later:**

| Group | Tab | Columns | Unlocks |
|---|---|---|---|
| B-3 | `Assessments` | `ShuffleQuestions`, `Language` | randomised question order; whole-page direction override |
| B-4 | `Questions` | `Section` | sectioned tests |
| B-5 | *(new)* `Results` | headers unknown (D-3 — paste them when you have them) | persisted summaries, faster lists at real scale |

### 4d. Cutover order — retiring the standalone (§9.4, unchanged)

1. Once code lands and roles are granted: log in, create one test batch, confirm the candidate link
   opens the **ERP's** `ac_take` page, not the old standalone URL.
2. In the standalone project's Apps Script editor: **archive its web app deployment** (Manage
   deployments → archive). First check the ERP's دفعات page — every batch's `ExpiresAt` is visible
   there — and either let active batches expire (≤ 90 days under the new cap, D-9) or re-issue links
   from the ERP.
3. Leave the standalone's `Users`/`UsersPermission` tabs in place; the ERP never reads them. Delete
   only once you're certain the standalone won't be revived.
4. The `assessment center/` folder stays in the repo as reference, untouched, un-deployed
   (`.claspignore` already excludes it). Say the word to move it under `Backup/`.

### 4e. Your visual checklist — after you push (§9.5, amended with what this run learned)

**Dashboard and access**
- [ ] A granted role sees the company tile; an ungranted one does not.
- [ ] The tile opens لوحة التحكم with four independent counts.
- [ ] **Both `ac_assessment_form` and `ac_result_view` were granted alongside their list pages** —
      open a specific assessment and a specific result, not just the lists (D-15).

**Authoring**
- [ ] Add an MCQ, a Likert, a MostLeast with per-statement traits, an OpenText; drag to reorder; save.
- [ ] **There is no edit button on a saved assessment, ever** — confirm this matches what you expect
      operationally (§2, item 1). "نسخة جديدة" makes a new, still-read-only, inactive-by-default copy.
- [ ] Type `<b>x</b>` into a question: it prints as literal text everywhere.

**Distribution**
- [ ] Create a batch with expiry 3 days; the copied link opens the ERP's page.
- [ ] Add two invited emails; a third email cannot start; the two can.
- [ ] Deactivate the batch: the link says the assessment is inactive.

**Candidate (use a phone)**
- [ ] No topbar, no logout, no floating home button.
- [ ] Refresh mid-test: answers and remaining time survive.
- [ ] Switch tabs twice, submit: الأحداث shows two switches; let the timer expire and confirm the
      late flag appears only past the one-minute grace (D-10).
- [ ] **If you added B-1**: the welcome screen now asks for name/phone/position.

**Review**
- [ ] A mixed assessment shows بانتظار التصحيح until the OpenText item is graded.
- [ ] Group by company shows subtotal rows; Excel export downloads; print repeats headers.
- [ ] **If you added B-2**: the قرار المراجعة block appears on the result view, and a decision saved
      by one reviewer is visible when another reviewer opens the same result.

---

## 5. Decisions made under D-21 (the plan's judgement calls), one line each

- **"Pending review" KPI** = `Status === 'Completed'` (submitted, not yet `Reviewed`) — the simplest
  correct reading given `Reviewed` is only ever set by `add_ac_candidate_grade`/`add_ac_review_decision`.
- **`add_ac_assessment_copy` defaults the duplicate to `IsActive: false`** — a "نسخة جديدة" click
  should not immediately go live for candidates; the owner activates deliberately.
- **Trait `pct`** is `raw / max × 100`, where `max` accumulates every question's maximum possible
  absolute contribution to that trait — can be negative for a MostLeast-heavy trait; asserted exactly
  in `ac2_scoring.js` rather than clamped, since a negative reading is meaningful (net "least" over
  "most").
- **The candidate-facing kebab's "طباعة"** (and the Results list's, and the AssessmentForm's) all
  route through a shared `?autoprint=1` query param convention rather than a dedicated print
  function per page, matching the one browser-print mechanism the plan specifies for every printable
  surface.
- **MCQ and Likert render identically** on the candidate page (a list of option-cards) — Likert has
  no options concept of its own in the schema; "pre-fills 1–5" (§5.1) means the AUTHOR's options
  editor seeds five string options `"1".."5"`, scored as `Number(answer)` per §5.4.
- **`add_ac_batch_invites` dedupes case-insensitively**, both within one submitted list and against
  emails already invited/assigned in that batch — an obvious candidate-experience requirement the
  plan didn't spell out but the standalone would have needed too.
- **Extending a batch's expiry (`update_ac_batch_expiry`) silently clamps** to the 90-day cap and
  reports `capped: true` in the response, rather than rejecting an over-long request outright —
  friendlier for a manager who just wants "as long as possible."

---

*Companion documents: [ASSESSMENT_CENTER_MERGE_PLAN.md](ASSESSMENT_CENTER_MERGE_PLAN.md) (the
analysis and plan this run executed), [ASSESSMENT_CENTER_RUN_PROMPT.md](ASSESSMENT_CENTER_RUN_PROMPT.md)
(the execution brief), [NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md) (§ مركز التقييم — the condensed,
action-oriented version of §4 above).*
