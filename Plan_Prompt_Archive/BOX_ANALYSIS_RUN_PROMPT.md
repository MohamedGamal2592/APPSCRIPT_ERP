# Box Analysis — تحليل حركة الخزنة العادية — agent prompt

Build the new Top Chemical page specified in **[BOX_ANALYSIS_PLAN.md](BOX_ANALYSIS_PLAN.md)**: a
read-only analysis screen over the live MySQL table `regular_box_movement`, with a confirmed
single-row edit form, item-level price history, account spend windows, and a fraud/anomaly rules
engine.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

This page is different from every other page in the app in one respect that shapes every decision
below: **it reads from MySQL, not from Sheets.** The only existing precedent is `tc_main_review`.

---

## Read these first, in full, before touching anything

1. **[BOX_ANALYSIS_PLAN.md](BOX_ANALYSIS_PLAN.md)** — your specification, all 12 sections. It carries
   the parser grammar, the matching algorithm, the four account windows, every fraud rule, the edit
   path and its validation table. **This prompt orients you; the plan decides.**
2. **[DbLive_Connector.js:407-512](DbLive_Connector.js#L407-L512)** — the `clients_AR` block. This is
   the reference implementation for every MySQL function you write: prepared statements, bound
   parameters, one `finally` that closes result set → statement → connection, shared WHERE builder so
   COUNT and SELECT can never disagree.
3. **[Company_TopChemical_MainReview.html](Company_TopChemical_MainReview.html)** — the reference page.
   Your page follows its shape: `UIC.appShell`, RTL root, filter bar, table, pager, `CAN_WRITE` gate,
   `companyCall` wrapper.
4. **[UI_Components.html:2301](UI_Components.html#L2301)** — `UIC.confirm`. Read the comment above it
   before you write the edit flow; it explains why the dialog must **name the record**, and why it
   returns a Promise rather than blocking.

Verify a `file:line` reference before you edit it. Line numbers drift.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change the MySQL schema

No `CREATE`, `ALTER`, `DROP`, no index, no view, no trigger, no new table — **not even the
`regular_box_items` table the plan mentions as Option B.** §3 of the plan offers two architectures;
**this run builds Option A** (all matching in Apps Script). Option B is a later decision the owner
has not made.

## 2. NEVER execute SQL against production yourself

You have no MySQL client on this machine and the credentials live only in the Apps Script Script
Properties. **This is not an obstacle to route around — do not try.** No `clasp run`, no one-off
function, no attempt to read the credentials, no `mysql` install.

Every statement you write ships as code the owner runs. You verify it by reading it and by testing
the pure logic around it under `node`. Write your SQL as if you will never get to run it, because you
will not.

## 3. NEVER write to the database except through the one intended path

The single write this feature has is `dbBoxUpdate_` — one row, by primary key, from a user who
clicked Save and then confirmed. That is the feature.

No `DELETE`. No `UPDATE` without a `WHERE id = ?`. No bulk correction, no backfill, no "normalize the
existing data" pass, no test row. If the parser reveals 400 rows with malformed details, **you report
that number — you do not fix them.**

## 4. NEVER deploy, push, or touch the owner's Google account

No `clasp push`, no deployment, no `clasp login/run/open`. **No installable triggers.** The plan's
nightly precompute is written as a function the owner can install later; you do not install it and
you do not create it as a trigger. No Script Properties. The owner pushes when everything is finished.

## 5. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, every existing backend action signature, every response shape.
**Do not modify the `clients_AR` functions or `tc_main_review` in any way** — you are adding a sibling
page beside it, not refactoring it. If you find a bug there, write it up; leave it alone.

Anything you add to `UI_Components.html` must be **purely additive** — 49 pages depend on it.

---

## Starting state

```bash
cd d:/Work/Script
git branch --show-current      # ui/odoo-parity
git log --oneline -3
git status --porcelain         # expect modified TopLight sales files + untracked docs
```

The working tree has uncommitted UI work from the previous programme. **Leave it alone.** Stage
explicit paths only — never `git add -A`, never `git add .`, never `git commit -a`.

**Create your branch and stay on it:**

```bash
git checkout -b feat/tc-box-analysis
```

Do not push. Do not rebase. Do not merge.

---

## Decisions already made by the owner — do not re-ask

| Question | Answer |
|---|---|
| Which `transaction_type` is spend? | **`credit` = spend (منصرف). `debit` = collected (محصّل).** Every spend window filters `credit`. Never net the two together. |
| What does the 300000–400000 range mean? | A filter on the **numeric value of `chart_of_accounts`**. It scopes the **item engine only** — parsing, clustering, price rules. The list, the account windows and the behavioural rules run across all accounts. See plan §2.1. |
| Can the page write? | **Read-only, plus one edit form.** Any editable column, one row at a time, with a confirmation naming the change before it commits. Plan §8.5. |
| DDL available? | **Assume no.** Build Option A. |
| Where does the audit trail live, with no DDL? | **An append-only NDJSON file per month in a Drive folder `Box_Analysis_Audit/`**, written with `DriveApp`. No new table, no new sheet tab. Flag it in the results as promotable to a real table later. |
| Where do the item alias overrides live? | Same mechanism — a single JSON file in that folder. |
| Who can see the page? | **Fail closed.** Super admin, plus roles the owner explicitly grants. This is deliberately the opposite of the ValleyFoods `valley_cost_view` fail-open guard: that one hid costs, this one exposes fraud analysis *and* an edit form over financial rows. If nobody has been granted it, nobody but a super admin sees it. |
| Tier 4 (Isolation Forest / Mahalanobis)? | **Not this run.** Build Tiers 1–3. Propose Tier 4 in the results. |

---

## Your task

Execute **B0 through B9 below, in order, back to back, until all are complete or blocked**, one commit
each (B5 and B7 may be multi-commit). Then stop and report.

**Do not pause for approval between steps.** If something is ambiguous, apply the rules in "When you
would normally stop" and keep going.

### The order is a safety property, not a preference

**B1 must land before B7.** The rules engine is built on parsed items; if you write rules against
unparsed text you will produce confident nonsense. And **B6 must land before B7's
`EDITED_AFTER_REVIEW` rule**, because that rule has to be able to read the audit log to tell the
page's own legitimate edits apart from an outside change — otherwise the feature flags itself.

---

## The steps

### B0 — Recon and fixtures *(no DB access — do not try)*

1. Confirm the four wiring points still look as this prompt describes:
   `Company_TopChemical_Nav.html` (the `تحليلات النظام الرئيسي` group, ~line 34),
   `Company_TopChemical_Registry.js` (~line 22), `Company_TopChemical_Actions.js`
   (`PAGE_ACCESS` ~line 144, `ACTION_TABLES` ~line 240), `DbLive_Connector.js` (~line 407).
2. Build `tools/verify/fixtures/box_details.json` — the parser's test corpus. Seed it with the one
   real string we have:

   ```
   5 كيلو معجون شروخ ب 700 + طبة حديد ب 25 + نص سلك لحام المونيوم ب 875 + نص كيلو  كيلو سلك لحام زهر ب 925
   ```

   then add synthetic variants that exercise each documented failure mode: flipped word order,
   `أ/ا` and `ة/ه` and `ى/ي` variants, Arabic-Indic digits, a duplicated unit token, a missing
   quantity, a missing unit, `بـ` instead of `ب`, a decimal price, a segment with no price at all,
   and a whole string that is prose rather than a list.

   **Mark clearly in the file which entries are real and which are synthetic.** A parser tuned to
   invented strings proves nothing about production text — the real coverage number is B9's
   blocked-on-owner item.

### B1 — `Box_Analysis_Engine.js` — the parser *(pure, no I/O)*

New top-level file. `normAr`, `takeQuantity`, `takeUnit`, `parseDetails`, `itemKey`, per plan §4.

Non-negotiables from the spec:

- Consecutive duplicate tokens collapse — the one real sample contains `نص كيلو كيلو`.
- Quantity words resolve to numbers (`نص`=0.5, `ربع`=0.25, `تلت/ثلث`=1/3, …) so unit prices compare.
- `item_key` is the item's tokens **sorted and deduped** — this is what makes flipped wording match
  before any fuzzy scoring runs.
- **A segment that fails to parse is returned as a failure, never dropped.** Silent drops corrupt the
  sum check and hide the rows a human most needs to see.
- Every function is pure — no `SpreadsheetApp`, no `Jdbc`, no `Logger`. That is what makes B1
  testable under `node`, and it is the reason this file exists separately from the actions file.

`tools/verify/box_parser.js` runs the corpus and prints per-case parsed output plus a coverage
summary. It must run under plain `node` with no Apps Script globals.

### B2 — `Box_Analysis_Engine.js` — the matcher

Blocking (exact `item_key` → IDF-rare-token inverted index → 3-gram buckets) then scoring
(token-set Dice + normalized Levenshtein on sorted tokens + IDF-weighted trigram cosine + unit
compatibility), per plan §5. Light stemming: strip `ال` prefix, `ات/ين/ون/ه` suffixes.

Extend the verify script with a clustering assertion: the flipped-order and orthographic-variant
fixtures from B0 must land in the same cluster as their base string, and two genuinely different
items must not. **State the chosen thresholds and show the score for each fixture pair** — a
threshold nobody can see is a threshold nobody can tune.

### B3 — Connector read functions

In `DbLive_Connector.js`, a new section below the `clients_AR` block, same discipline:
`dbBoxList_`, `dbBoxAccountAggregates_`, `dbChartAccountLabels_`, `dbBoxItemHistory_`.

- Shared WHERE builder for COUNT and SELECT (plan §6, and the `dbClientsArWhere_` precedent).
- The four windows in **one** conditional-aggregation query grouped by `chart_of_accounts`, with
  last-month and last-year cut to the **same day-of-period** — a partial month against a complete one
  manufactures a fake decline every time.
- `transaction_type = 'credit'` for spend. Collections, if shown, are a separate column.
- The account-range predicate: `CAST(chart_of_accounts AS UNSIGNED) BETWEEN 300000 AND 400000` guarded
  by a digits-only test. **Add a comment recording that this is not sargable**, and that if the codes
  turn out to be uniformly 6 digits the string range is equivalent and indexable — that is B9's
  measurement, not your assumption.
- Limits clamped exactly as `dbClientsArList_` does. Nothing unbounded ever leaves the DB.

### B4 — Wiring

- `Company_TopChemical_Actions.js`: register `get_box_analysis`, `get_box_item_history`,
  `update_box_movement`, `revise_box_movement` as thin wrappers. Add to `PAGE_ACCESS`
  (page `tc_box_analysis`, `read` for getters, `write` for the two writers) and to `ACTION_TABLES`
  (`'mysql:regular_box_movement'`).
- `Company_TopChemical_Registry.js`: page entry, `nav: false`, template
  `Company_TopChemical_BoxAnalysis`.
- `Company_TopChemical_Nav.html`: add the item to the `تحليلات النظام الرئيسي` group beside
  `مراجعة مديونيات النظام الرئيسي`.

Authority is enforced by `guard_()` through `PAGE_ACCESS`, exactly as `get_main_review` does. Do not
invent a second permission mechanism.

### B5 — The page: read path *(shippable on its own)*

`Company_TopChemical_BoxAnalysis.html`, modelled on `MainReview`. Filters: date range, account
(labelled from `chart_of_accounts_main`), responsible person, box, review status, and an
"البنود فقط (300000–400000)" toggle. Table, pager, empty state, error state.

Row expands to the parsed items table and the four-window account strip. Item price history arrives in
B7; leave a clean seam for it.

**Three queries per page load, maximum** — the movement page, the grouped aggregates, the cached
labels. **Never issue a query inside a row loop.** JDBC round trips are the entire cost of this page.

### B6 — The edit path *(plan §8.5 — follow the validation table exactly)*

Form modal → diff against the loaded row → **`UIC.confirm` naming the change** → action → re-read.

- The confirm carries `record: 'حركة رقم 4213 — 2026-08-14'` and one `detail` line per changed column,
  `المبلغ: 725.00 ← 900.00`. Not "هل أنت متأكد؟". The whole reason `UIC.confirm` exists is in the
  comment above it — read it.
- `UIC.confirm` returns a **Promise**. The save restructures around `.then`; it cannot be written as a
  blocking `if`.
- Only changed columns are sent.
- `id`, `created_at`, `updated_at` are **not editable**. `created_at` is the evidence the backdating
  rules run on; a page that audits tampering must not offer a field to edit the timestamps it audits.
  The server sets `updated_at = NOW()`.
- `EDITABLE_COLUMNS` is a **fixed allowlist** on the server, never a sanitized pass-through of a
  client-supplied column name. Values bind as parameters.
- Per-column validation exactly as the plan's table: 255-char cap on `transaction_details` (enforce
  it — MySQL would truncate or throw), `double(16,2)` fit on the amount, enum membership on the type,
  date format, digits-only on the account code, integer-or-NULL on the id columns. Validate on both
  sides; the client validation is a courtesy, the server validation is the rule.
- Warn when an edit moves a row across the 300000–400000 boundary — it silently changes which
  analyses apply to that row.
- **Every edit writes an audit entry** `{when, user, row id, column, old, new}` to the Drive NDJSON.
  This is not optional and it is not a nice-to-have: without it the page can quietly alter the
  evidence it audits, and B7's `EDITED_AFTER_REVIEW` rule will flag the page's own legitimate edits
  with no way to tell them apart from a real tamper.

### B7 — Rules engine *(Tier 1, then Tier 2, then Tier 3 — separate commits)*

Per plan §7. Every rule emits `{rule_id, severity, evidence[], reason_ar}`. Pure functions in
`Box_Analysis_Engine.js`, tested against fixtures.

- **Tier 1** first — the deterministic integrity checks are the highest-precision findings in the
  whole feature, and `SUM_MISMATCH` (Σ parsed prices vs `transaction_amount`) needs nothing but B1.
- **Tier 2** uses **median and MAD, never mean and σ.** These samples are small and the contamination
  is exactly what we are hunting; a mean is dragged by the fraud it is supposed to detect. Modified
  z-score `0.6745·(x − median)/MAD`, flag > 3.5.
- **Tier 3 Benford is gated on n ≥ 300.** Below that the page must show `بيانات غير كافية`, not a weak
  verdict. A Benford verdict on 40 rows is a false accusation aimed at a named employee — treat that
  gate as a correctness requirement, not a statistical nicety.
- `STRUCTURING` thresholds are derived from the amount histogram (the spike just below a round
  number), not hardcoded from a guess.

**Every flag renders as an Arabic reason plus the evidence rows.** A row's risk score is never shown
as a bare number with nothing behind it — this output has to survive an accountant asking "why".

### B8 — Risk ranking, alerts tab, item analytics tab

Tabs 2 and 3 from plan §8. Tab 3 carries the **merge/split cluster control** and its alias override
store — the matcher will be wrong sometimes, and without a way to correct it permanently people stop
trusting the whole page.

Write the precompute as a plain function (`rebuildBoxAnalysisIndex_`) with a comment saying how to
install it as a nightly trigger. **Do not install it.** Since no trigger will be running, the page
computes on demand for the visible window and caches (labels and aggregates in `CacheService`, the
item index as a Drive JSON blob keyed by `MAX(updated_at)`). Respect the 6-minute execution limit:
bound the window, and fail with a clear Arabic message rather than timing out silently.

### B9 — Documentation and handover

1. **`BOX_ANALYSIS_RESULTS.md`** — what changed per step with commit hashes, what was skipped and why,
   every assumption, the parser coverage figures **against the fixture corpus with the synthetic
   entries clearly separated from the one real string**, the chosen matching thresholds, rollback
   commands, and the owner's verification checklist.
2. **Append to [NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md)** — the blocked-on-owner register:
   - Grant `tc_box_analysis` to the roles that should have it (`ERP_Management` → صلاحيات الأدوار).
     **The page fails closed** — until then only a super admin sees it.
   - Run the four recon measurements nobody could run without DB access: total row count, count within
     300000–400000, whether those codes are uniformly 6 digits, and whether `chart_of_accounts_main.id_5`
     is unique. The last one matters most — **a duplicated `id_5` fans out the join and doubles every
     account total on the page.**
   - Report real parser coverage: run the page over a month of live rows and report what percentage of
     `transaction_details` parsed cleanly and what the sum-mismatch rate is. Both numbers are findings
     in their own right, and both decide whether the parser needs another pass.
   - Decide whether the audit trail should be promoted from the Drive NDJSON to a real table, and
     whether edits to the money columns should require a reason note.
   - Decide whether an already-reviewed row (`is_revised = 1`) may be edited at all.
3. **Amend [BOX_ANALYSIS_PLAN.md](BOX_ANALYSIS_PLAN.md) §12** — strike the questions this run settled,
   record what the code actually assumed.

---

## When you would normally stop

1. **The plan covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why, continue with the rest.
3. **Genuinely blocked** (needs DB access, needs DDL, needs the owner's account, needs matrix rows) →
   write it up, mark it blocked-on-owner, continue with everything else.
4. **A whole step is unworkable** → report it plainly, do not fake it, move to the next.

A reported skip is always better than a guess. **The one unacceptable outcome is a rule reported as
working that was never run against anything, or an `UPDATE` that reaches production without a
`WHERE id = ?`.**

---

## Verification — you cannot see a browser and you cannot reach the database

Both are true for the whole run, and neither gets solved. So:

1. **`node --check` every `.js` file** you touch, and parse the inline `<script>` of the new page,
   after every step.
2. **`node` tests for everything pure** — the parser, the matcher, every rule, the four date-window
   calculations (test the month-end clamp: 31 Mar → last month must not produce 31 Feb), and the
   `EDITABLE_COLUMNS` validators including the rejection cases.
3. **Read every SQL string aloud against the schema in plan §2.** Column names, the `credit` filter,
   the `WHERE id = ?` on the update, the `finally` that closes result set → statement → connection on
   every path including the error path. This reading *is* the verification — nothing will run it for
   you.
4. **Build `design_preview/tc_box_analysis.html`** — a local file the owner opens by double-clicking,
   stubbing `companyCall` with fixture rows so the table, the row expansion, the edit form, the
   confirm dialog and the alerts tab can all be clicked through offline. It must load the **real**
   `UI_Components.html` and `CSS_Tokens.html`, not copies. Confirm `design_preview/**` is in
   `.claspignore`.
5. **Write the owner's visual checklist as specific statements**, never "check it looks right":
   - The nav group `تحليلات النظام الرئيسي` now has two items and the new one opens.
   - A row expands to show its items parsed into quantity / unit / item / price.
   - A row whose item prices do not sum to `transaction_amount` is flagged, and the flag says by how
     much.
   - Editing an amount raises a dialog naming the row and showing `725.00 ← 900.00`, and cancelling it
     leaves the row unchanged.
   - After a confirmed edit, the row shows the new value, `updated_at` has moved, and an entry exists
     in `Box_Analysis_Audit/`.
   - The four account figures for a known account match a manual query for the same windows.
   - A user in a role without the grant does not see the page at all.

---

## A trap previous sessions hit repeatedly

The Bash tool mangles backslashes inside heredocs (`\\` collapses to `\`) and breaks on awkward
quoting — **and this run is almost entirely Arabic string literals and regexes over Arabic
character ranges, which break it reliably.** Use the `Write`/`Edit` tools for any file content with
Arabic text, regex escapes, CSS selectors or nested quoting. Do not fight the heredoc; it will not
get better on the third attempt.

---

## Commit protocol

```
feat(tc-box-B<n>): <short summary>

<what changed, file by file>
<what was verified, and how — include the node test output that matters>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**Do not push.** The owner pushes.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change the MySQL schema, and you will **not** create `regular_box_items` — this
   run is Option A.
2. You **cannot** reach the database, and you will not try. Every statement ships unrun; you verify it
   by reading it and by testing the pure logic around it.
3. The only write is one row, by primary key, after a confirmation that **names the change**.
4. **`created_at` is not editable.** It is the evidence the backdating rules depend on.
5. The audit trail lands in B6, before the rules in B7 — otherwise the page flags its own edits.
6. `credit` is spend, `debit` is collected, and the two are never netted.
7. The 300000–400000 range scopes the **item engine**, not the whole page.
8. Price outliers use median/MAD, and Benford does not render a verdict below n = 300.
9. The page fails **closed**: no grant, no access.
10. You will not modify `clients_AR`, `tc_main_review`, or anything else that already works.
