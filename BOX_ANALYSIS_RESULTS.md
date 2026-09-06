# Box Analysis — what was built, what was not, and what to check

Branch `feat/tc-box-analysis`, off `43ec072` (`ui/odoo-parity`). **Not pushed.**
Eleven commits, `8,813` insertions across 18 files, `6` deletions — all six of
those are lines I replaced in `tools/verify/run_all.js` and `parse_pages.js` to
register new checks.

New page: **تحليل حركة الخزنة العادية** (`tc_box_analysis`), reading the live
MySQL table `regular_box_movement`.

---

## The one thing to read before anything else

**Not a single line of the SQL in this branch has ever been executed, and no
data was read from the production database at any point.** There is no MySQL
client on the machine this was written on and the credentials live only in
Script Properties. Every statement ships unrun; it was verified by reading it
against the schema in the plan and by a static check that asserts the
invariants (`tools/verify/box_sql.js`).

Everything the verification suite measures, it measures against **synthetic
fixtures**. Exactly **one** production string exists in this repo — the sample
`transaction_details` in the plan — and it is labelled `origin: "real"` in
`tools/verify/fixtures/box_details.json`. Every other fixture is invented and
labelled `synthetic`. A parser that scores 100% against invented strings has
proved that it handles the failure modes somebody thought of, and nothing about
production text.

The numbers that matter — real parse coverage, the sum-mismatch rate, the
false-positive rate of the rules — can only be measured by running the page.
They are the first items in the handover register.

---

## Commits

| Commit | Step | What landed |
|---|---|---|
| `41b9062` | B0 | Recon; the parser fixture corpus (1 real string, 26 synthetic) |
| `35eb46b` | B1 | `Box_Analysis_Engine.js` — the parser |
| `5ec4f5a` | B2 | The matcher: blocking, scoring, clustering, alias overrides |
| `fc56074` | B3 | Connector read path: list, aggregates, labels, item history |
| `20a48b0` | B4 | Wiring: actions, access gate, registry, nav |
| `45f1fa6` | B5 | The page, read path + the offline design preview |
| `18aa2f6` | B6 | The edit path: allowlist, named confirm, audit trail |
| `cbec5e3` | B7.1 | Rules Tier 1 — deterministic integrity |
| `7a6395b` | B7.2 | Rules Tier 2 — price anomalies, median/MAD |
| `b2fed3d` | B7.3 | Rules Tier 3 — Benford, round numbers, velocity, drift, seasonality |
| `38fc539` | B8 | Risk ranking, alerts tab, item analytics tab |

Files added: `Box_Analysis_Engine.js`, `Company_TopChemical_BoxAnalysis.html`,
`design_preview/tc_box_analysis.html`, seven check files and two fixture files
under `tools/verify/`.
Files modified: `DbLive_Connector.js` (+658, purely appended),
`Company_TopChemical_Actions.js`, `Company_TopChemical_Registry.js` (+1 line),
`Company_TopChemical_Nav.html` (+1 item), and two verify runners.

---

## Hard constraints — how each one was held

| Constraint | Held by |
|---|---|
| No schema change, ever | `box_sql.js` asserts no `CREATE`/`ALTER`/`DROP`/`TRUNCATE`/`RENAME` in the box section, and no reference to `regular_box_items`. This run is Option A. |
| No SQL executed against production | Nothing was run. No `clasp run`, no credential lookup, no client installed. |
| One write path only | `box_sql.js` asserts no `DELETE`, and that **every** `UPDATE` carries `WHERE \`id\` = ?`. Mutation-tested: removing that clause fails the check. |
| No deploy, push, trigger or Script Property | Nothing pushed. `box_wiring.js` asserts no file calls `ScriptApp.newTrigger`. The nightly precompute is written and documented; it is not installed. |
| No public contract broken | `DbLive_Connector.js` is **+658 / −0**. `box_sql.js` asserts the `clients_AR` functions are byte-present and unchanged and that no box code leaked above the section marker; `box_wiring.js` asserts `tc_main_review` is untouched in all five of its wiring points. `UI_Components.html` was **not modified at all**. |

The one CSS rule this page needed from the shared layer
(`.uic-confirm-detail { white-space: pre-line; }`, so the per-column change
lines in the edit confirmation render as lines) lives in **this page's own
stylesheet**, because `UI_Components.html` is used by 49 pages and additions to
it must be purely additive.

---

## Verification

`node tools/verify/run_all.js` → **All 35 checks pass.**

Seven of those are new:

| Check | What it holds down |
|---|---|
| `box_parser.js` | 17 `normAr` folds, 8 price cases, quantity words, `item_key` order-invariance, the whole fixture corpus, and the structural invariant that every non-empty segment lands in exactly one of `items[]` or `failures[]` |
| `box_matcher.js` | Stemming (including the two cases that must **not** stem), unit compatibility, the full pair-score table, clustering re-checked separately from pair scoring, and reviewer overrides |
| `box_windows.js` | 40 assertions on the four windows — the month-end clamp, same-day-of-period, the year boundary, the century leap rule |
| `box_sql.js` | Additivity, no DDL, no `DELETE`, `WHERE id = ?`, resource closing order, parameter binding, `credit`/`debit` separation, bounded results |
| `box_wiring.js` | The access gate, registration, the route gate, registry and nav, the query budget, the template, preview drift, the uninstalled trigger, the time budget |
| `box_edit.js` | ~90 assertions on the allowlist and every validator, weighted toward rejection cases; the form/engine drift check; the confirmation shape; audit ordering |
| `box_rules.js` | Every rule in all three tiers, run both ways, plus risk ranking |

### Mutation testing

A check that cannot fail is worse than no check, so the load-bearing ones were
broken on purpose and confirmed to fail, then reverted:

| Injected fault | Caught by |
|---|---|
| `conn.close()` removed from `dbBoxList_` | `box_sql` — "dbBoxList_ closes the connection in finally" |
| `credit` OR-ed into the `debit` column | `box_sql` — "spend and collected are never OR-ed into one figure" |
| `WHERE id = ?` removed from `dbBoxUpdate_` | `box_sql` — "UPDATE #1 carries WHERE \`id\` = ?" |
| `created_at` added to `EDITABLE_COLUMNS` | `box_edit` — 3 checks, including the form/engine drift check |
| Audit intent line moved after the `UPDATE` | `box_edit` — "the audit INTENT line is written before the UPDATE" |
| Preview's pasted parse output changed 2525 → 2599 | `box_wiring` — "preview PARSE_REAL.sum matches the engine" |

### What the suite cannot tell you

It runs no SQL, opens no browser, and reads no production data. It proves the
pure logic behaves as specified and that the statements have the right shape.
It cannot tell you the page looks right, that the queries return what you
expect, or how often any rule fires on real rows.

---

## Parser coverage — fixtures only

```
real      : 1 string,  4 segments — 4 parsed (100.0%), 0 failed
synthetic : 26 strings, 29 segments — 26 parsed (89.7%), 3 failed
```

The three synthetic failures are the cases that **must** fail: a segment with
no price, a segment with no price inside an otherwise-good row, and a string
that is prose rather than a list. A segment that will not parse is returned as
a failure and never dropped — dropping it would make the sum check agree with a
description that does not account for the money.

The real string parses to all four of its items, `Σ = 2525.00`:

| qty | unit | item | price | unit price |
|---|---|---|---|---|
| 5 | كيلو | معجون شروخ | 700 | 140 |
| — | طبه | حديد | 25 | — |
| 0.5 | — | سلك لحام المونيوم | 875 | 1750 |
| 0.5 | كيلو | سلك لحام زهر | 925 | 1850 |

The fourth row is the one that matters: the source text contains
`نص كيلو  كيلو سلك لحام زهر`, and the duplicate-token collapse is what turns it
into one kilo unit rather than two.

**The 89.7% is a property of this corpus, not of the database.** Real coverage
is handover item 3.

---

## Matcher thresholds

Weights `dice 0.40 / lev 0.20 / trigram 0.30 / unit 0.10`, **threshold 0.58**.
Measured over the fixture corpus (54 item occurrences → 18 distinct texts):

```
  want  id             dice    lev     tri     unit    SCORE
  SAME  m-flip         1.0000  1.0000  0.6748  1.0000  0.9024
  SAME  m-plural       1.0000  1.0000  0.5042  0.5000  0.8013
  SAME  m-extra-token  0.8571  0.7059  0.7507  0.5000  0.7592
  SAME  m-al-prefix    1.0000  1.0000  0.3145  0.5000  0.7444
  SAME  m-typo         0.5000  0.9000  0.6482  0.5000  0.6244   ← hardest true
  ────────────────────────────────────────── threshold 0.58 ──
  DIFF  m-diff-metal   0.6667  0.2667  0.4245  0.5000  0.4973   ← hardest false
  DIFF  m-diff-unit    0.3333  0.1200  0.2848  0.5000  0.2928
  DIFF  m-diff-item    0.0000  0.0833  0.0000  1.0000  0.1167
  (m-hamza, m-maqsura, m-teh, m-diff-short are identical after normAr)
```

0.58 sits **0.044 below** the hardest true pair and **0.083 above** the hardest
false one. That is a real but narrow margin, measured on 18 texts.

The case that decides the design is `m-diff-metal`: `سلك لحام زهر` against
`سلك لحام المونيوم` share two tokens of three and are different metals at
different prices. Token overlap alone cannot separate them from a one-character
typo — Dice actually ranks the typo *lower* (0.50 vs 0.67). The IDF-weighted
trigram term is what does it: `سلك` and `لحام` appear in most welding-wire rows
and carry almost no weight, so the grams that distinguish `زهر` from
`المونيوم` carry nearly all of it.

**Expect to tune this against real data.** `MATCH` in `Box_Analysis_Engine.js`
holds every weight and threshold in one object, and `node tools/verify/box_matcher.js`
reprints the whole table on every run.

---

## Bugs found by running the code

Three, all in the rules engine, all found because the checks execute the rules
rather than inspecting them.

**1. `NEAR_DUP` compared the raw details string** — which puts the price digits
in the token set. Two rows differing only in price, the exact shape a
near-duplicate claim takes, therefore scored *lower* than two unrelated rows
that happened to share a price. The intended fixture pair scored 0.833 against
a 0.85 threshold and the rule found nothing at all. It now compares the parsed
item texts; the amounts are compared separately, so this is not losing a signal,
it is not counting the same one twice.

**2. `OUT_OF_SEQUENCE` cascaded.** It compared each row against the running
maximum date, so one row dated three months ahead flagged all twelve rows after
it — one anomaly, twelve accusations, and an alerts tab nobody reads twice. It
now flags a row only when it is far from **both** id-neighbours in the same
direction. Over the same 19 rows: 12 flags before, 2 after, and both are the
actual anomalies.

**3. `SEASONALITY` was silent on a flat history.** When every prior month is
identical, MAD and the mean-absolute-deviation fallback are both zero and the
z-score is undefined — so an account that spent exactly the same for twelve
months and then nine times that produced nothing. A flat history is the
*strongest* baseline, not an absent one. It now falls back to a direct ratio and
reports which basis it used.

A fourth defect was found in the matcher during B2: `cluster_id` was the
representative's `item_key`, which is order-invariant, so a reviewer who split
`معجون شروخ` from `شروخ معجون` got two clusters carrying the **same id** — and
every downstream lookup keyed by it merged them back, silently undoing the
correction. It is now the smallest member text, which is unique by construction.

And a fifth, in the checks themselves: the `UPDATE … WHERE id = ?` assertion was
**vacuous** for one commit. It matched on a literal table name while the SQL
builds the name from `DB_BOX_TABLE`, so it found zero statements and passed. It
is called out here rather than quietly fixed, because a check that passes
without testing anything is the exact failure mode `box_sql.js` exists to
prevent.

---

## Assumptions the code made

Each of these is a decision taken because the data could not be consulted.

1. **The 300000–400000 predicate casts.** `CAST(chart_of_accounts AS UNSIGNED)
   BETWEEN 300000 AND 400000`, guarded by `REGEXP '^[0-9]+$'`. Not sargable.
   If the codes turn out to be uniformly 6 digits the string range is
   equivalent and indexable — that is a measurement, not an assumption to build
   on, and it is registered.
2. **`chart_of_accounts_main.id_5` may not be unique**, so the account label is
   **not a SQL join** — it is a JS map lookup. A duplicated `id_5` in a join
   would have fanned out the aggregate rows and doubled every figure on the
   page. From a map it can only make a label ambiguous, and the page says so in
   a banner listing the affected codes.
3. **`responsible_person` is typed inconsistently**, so its filter uses `LIKE`
   with both wildcards. It is a scan, bounded by the date filter, issued only
   when a human types something.
4. **Working hours are 08:00–18:00 and the weekend is Friday/Saturday.**
   Configurable. Public holidays are **not** checked and `ODD_HOUR` says so in
   its own reason text — there is no holiday calendar in this system and
   inventing one would produce confident nonsense twice a year.
5. **Minimum sample sizes**: `BACKDATED` n ≥ 30, price rules n ≥ 6, peer
   comparison n ≥ 3 per side, ratchet n ≥ 5, velocity ≥ 20 active days, drift
   n ≥ 30 per side, seasonality ≥ 6 complete months, **Benford n ≥ 300**. Every
   one of them refuses to run below its minimum and emits an Arabic note saying
   so. Every one is a guess that real data should revise.
6. **An already-reviewed row can be edited.** The form allows it and the audit
   records it. This is an open question for the owner (register item 5).
7. **The item index has no nightly trigger**, so the page computes on demand for
   the window it is showing. Every such path is bounded and checks its own clock
   against a 4-minute budget inside the 6-minute limit.

---

## What the analysis refuses to do

Worth stating plainly, because it is the difference between a review aid and a
false accusation:

- **Benford renders no verdict below 300 amounts.** Not a weak one for the
  caller to decide about — the function returns no verdict field at all. A gate
  one layer up is a gate somebody eventually bypasses.
- **Benford's own reason text says**, in the sentence the reviewer reads, that
  it is a group-level statistical indicator, not a claim about any single
  movement, and that its only use is ordering review.
- **`STRUCTURING` derives its thresholds from the amount histogram** and reports
  "no threshold detected" when there is no spike. It cannot flag someone for
  being near a round number that means nothing in this organisation.
- **`SUM_MISMATCH` does not fire when a segment failed to parse.** The sum is
  then known to be incomplete, and firing would report a gap in our parser as a
  finding about a person.
- **`EDITED_AFTER_REVIEW` reads the audit log.** An edit the log explains is low
  severity and **names who made it**; only an unexplained change is high. This is
  the entire reason the audit trail had to land before the rules.
- **Every finding carries an Arabic sentence with its numbers in it and the
  evidence rows behind it.** A risk score is never rendered without them.

---

## Tier 4 — the proposal, not built

Out of scope by the owner's decision. If it is wanted later, the honest shape
is: a feature vector per row (amount, log amount, item count, unit-price
z-scores, entry hour, day of week, person, account, parse confidence, duplicate
similarity, days late) scored by Mahalanobis distance on a robust covariance, or
a small Isolation Forest — perhaps 50 trees, entirely implementable in plain JS
for a few thousand rows.

**Use it only as a ranker for review order, never as an accusation.** Tiers 1–3
carry the value *and* all the explainability. An unsupervised score that says
"anomalous" and cannot say why is useless in front of an accountant, which is
the only conversation this page exists to have. If Tier 4 is added, it should
reorder the alerts list and never produce a badge of its own.

---

## Rollback

The whole feature is one branch and touches four existing files.

```bash
# Discard everything
git checkout ui/odoo-parity
git branch -D feat/tc-box-analysis

# Or drop one step, keeping the rest
git revert 38fc539            # B8 — tabs 2 and 3, risk ranking
git revert b2fed3d            # B7.3 — Tier 3
git revert 18aa2f6            # B6 — the edit path (leaves the page read-only)

# Or hide the page without touching code: remove the tc_box_analysis grant in
# ERP_Management → صلاحيات الأدوار. The page fails closed, so it disappears for
# everyone except a super admin.
```

Nothing was pushed and no trigger was installed, so there is nothing to undo on
the Google side. The Drive folder `Box_Analysis_Audit/` is created lazily on the
first edit; if the feature is dropped before anyone edits anything, it will not
exist.

---

## The owner's verification checklist

Run these in order. Each one is a specific statement to confirm or deny.

**Before anything else**

1. In `ERP_Management` → صلاحيات الأدوار, grant `tc_box_analysis` to the roles
   that should have it. **Until you do, only a super admin can see the page** —
   that is deliberate.

**Access**

2. Sign in as a user in a role *without* the grant. The nav group
   `تحليلات النظام الرئيسي` shows **one** item, not two, and pasting the page
   URL lands on the access-denied screen.
3. Sign in as a super admin. The same group shows **two** items and the new one
   opens.

**Reading**

4. The movements table loads with the newest movement first, and the pager says
   how many rows matched.
5. Tick **البنود فقط (300000–400000)** and search. Every remaining row's account
   code is numerically inside that range.
6. Click **▸** on a row whose details contain `+`. It expands to a table of
   quantity / unit / item / price / unit price, one row per segment.
7. On that same expansion, the footer states Σ of the item prices against
   `transaction_amount`. If they differ by more than 1.00 it says **by how
   much** and in which direction, and the row carries a red `فرق` pill in the
   list.
8. Find a row whose `transaction_details` is prose rather than a list. It shows
   `تعذر تحليل التفاصيل` with the offending text quoted, and it is **not**
   flagged `SUM_MISMATCH`.
9. The four account figures print their own date ranges. Confirm that
   الشهر الحالي and الشهر السابق cover the **same number of days** — this is the
   comparison that is wrong on most reports.
10. **Cross-check one account by hand.** Pick an account code and a date, run
    the four windows as a manual query, and compare. This is the single most
    valuable check on the list; if these numbers are wrong, everything above
    them is decoration.

**Editing**

11. Click **تعديل** on a row and change the amount. The confirmation names the
    record — `حركة رقم 4213 — 2026-08-14` — and shows one line per changed
    column reading `المبلغ: 900.00 ← 725.00`. It does **not** say
    "هل أنت متأكد؟".
12. Press **Escape** on that dialog. Nothing is saved and the row is unchanged.
13. Confirm it. The row shows the new value, `updated_at` has moved, and a file
    `box_audit_YYYY-MM.ndjson` exists in the Drive folder `Box_Analysis_Audit/`
    containing an `intent` line and an `applied` line carrying
    `{column, old, new}`.
14. Try to type 300 characters into التفاصيل. It is refused with a message
    naming both the 255 limit and the length you entered — **before** any round
    trip.
15. The edit form has **no field** for رقم الحركة, تاريخ الإنشاء or آخر تعديل,
    and says why underneath.
16. Change an account code from inside 300000–400000 to outside it. The
    confirmation carries a `⚠` line saying the row is leaving the item-analysis
    range.

**Analysis**

17. Open **التنبيهات** and press تحليل. It reports how many rows it scanned and
    over what dates. If the window was truncated it says so.
18. Every alert row shows an Arabic sentence with numbers in it — not a rule
    name, not a bare score.
19. Scroll to **قواعد لم تُطبَّق**. Expect to see Benford refusing on
    insufficient data early on; that is correct behaviour, not a fault.
20. Open **تحليل البنود** and press تحليل البنود. The banner reports **real
    parse coverage** over the rows it just read. **Write these numbers down** —
    they are handover item 3.
21. Find a cluster whose merged spellings are wrong. Use **دمج/فصل** to correct
    it, confirm, and re-run. The correction survives, and an entry appears in
    the audit log naming you.

---

## Registered for the owner

Five items are blocked on database access or on a decision only the owner can
make. They are written up in full in
[NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md); in short:

1. Grant `tc_box_analysis` — the page fails closed until then.
2. Four recon measurements, of which **`id_5` uniqueness matters most**.
3. Report real parser coverage and the sum-mismatch rate.
4. Decide whether the audit trail moves from Drive NDJSON to a real table, and
   whether money-column edits need a reason note.
5. Decide whether an already-reviewed row may be edited at all.
