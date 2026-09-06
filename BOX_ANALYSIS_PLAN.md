# Box Analysis — تحليل حركة الخزنة العادية

Plan for a new page under `تحليلات النظام الرئيسي` (Top Chemical), driven by the
live MySQL table `regular_box_movement`.

---

## 1. Goal

One screen where a reviewer looks at a petty-cash movement and immediately sees
three things the raw row does not tell them:

1. **What was actually bought** — `transaction_details` parsed into line items
   (quantity, unit, item, price).
2. **Whether the price is normal** — each item matched against every previous
   purchase of the same item, however differently it was worded, with the
   historical price distribution beside it.
3. **Whether the account is behaving normally** — MTD / last month / YTD / last
   YTD spend for that `chart_of_accounts`, labelled from `chart_of_accounts_main`.

On top: a rules engine that ranks rows by fraud risk, in Arabic, with evidence.

---

## 2. What the schema gives us

| Column | Type | What it buys us |
|---|---|---|
| `id` | bigint PK | Row identity, insertion order (vs. date → out-of-order detection) |
| `transaction_date` | date | All period windows |
| `transaction_details` | varchar(255) | The item text. **Short** — parsing is cheap, a row holds ~2–6 items |
| `client_id`, `related_id` | bigint null | Links, optional dimensions |
| `transaction_type` | enum(credit,debit) | **`credit` = spend (منصرف), `debit` = collected (محصّل).** Every spend window filters on `credit` |
| `transaction_amount` | double(16,2) | Row total → **cross-check against the sum of parsed item prices** |
| `chart_of_accounts` | text | Account code, joins `chart_of_accounts_main.id_5` → `account_5_name`. **The item engine runs only on rows whose numeric value is 300000–400000** (see §2.1) |
| `responsible_person` | text null | Entity for peer comparison — the core fraud dimension |
| `box_code` | bigint | Second entity dimension |
| `user_id` | int null | Who keyed it (may differ from who spent it) |
| `created_at` | datetime | vs `transaction_date` → backdating / late entry / odd-hour entry |
| `updated_at` | datetime | ≠ created_at → post-hoc edits, especially after review |
| `is_revised` | tinyint(1) | Reuse the review workflow already built for `clients_AR` |

Two things fall out of the schema that were not in the brief and are worth more
than most of the statistics:

- **Σ(parsed item prices) vs `transaction_amount`** is a free, high-precision
  integrity check. A mismatch means either the parse failed or the description
  does not account for the money. Both need a human.
- **`created_at` / `updated_at` vs `transaction_date`** is classic
  backdating/tampering evidence, available at zero cost.

### Schema caveats

- `chart_of_accounts` is `text` holding a number. `CAST(chart_of_accounts AS UNSIGNED)
  BETWEEN 300000 AND 400000` is **not sargable**, and `text` cannot be indexed
  without a prefix index. If all codes in this family are exactly 6 digits, the
  string range `>= '300000' AND < '400000'` is equivalent and can use a prefix
  index. **Needs confirming against the data.**
- `responsible_person` is free `text`. If names are typed inconsistently it is
  not a reliable entity key until normalized — the same clustering used for
  items applies to it.

### 2.1 Scope of each layer

The 300000–400000 range is a filter on the **numeric value of
`chart_of_accounts`**, and it scopes the item engine — not the whole page.

| Layer | Scope |
|---|---|
| Movement list, filters, review/edit | Any account (the range is a filter the user can apply) |
| Account aggregates (§6) | Any account — the four windows are per `chart_of_accounts` |
| **Item parsing, clustering, price rules (§4, §5, Tier 2)** | **Only `chart_of_accounts` ∈ [300000, 400000]** |
| Tier 1 integrity rules | `SUM_MISMATCH` only where items were parsed, so in-range; the date/edit/duplicate rules apply to any row |
| Tier 3 behavioural rules | Any account, per entity |

Spend windows filter `transaction_type = 'credit'`. `debit` rows are
collections; they are shown as a separate figure, never netted into a spend
total — netting would let an inflow mask an outflow.

---

## 3. Architecture decision: where the matching runs

Fuzzy Arabic matching is not something MySQL does natively, and JDBC round trips
from Apps Script are the dominant cost. Two options:

**A — All in Apps Script, no DDL.** Pull the account-range rows for a bounded
window (e.g. 24 months), parse and index in JS, cache the index (Drive JSON blob
keyed by `MAX(updated_at)`; CacheService for the small aggregates). Zero schema
risk, works today.

**B — Materialize a derived table.** `regular_box_items` (movement_id, seq,
item_raw, item_norm, item_key, qty, unit, price, unit_price, confidence) plus a
FULLTEXT index on `item_norm` for blocking. Matching becomes a SQL join; the
page stays fast as the table grows.

**Recommendation: build A first, then materialize into B.** The parser and the
matcher are the parts most likely to need iteration against real text; getting
them right in pure JS with tests (the repo already has `tools/verify/` for
exactly this) costs nothing and risks nothing. Once the parser stabilizes, B is
a mechanical port plus a nightly trigger. Going straight to B means schema churn
every time the parser learns a new phrasing.

Decision gate: **row count in the 300000–400000 range**. Under ~20k rows, A is
comfortable inside the 6-minute execution limit. Above that, B is required.

---

## 4. Stage 1 — Parsing `transaction_details`

Observed grammar, per the sample:

```
"5 كيلو معجون شروخ ب 700 + طبة حديد ب 25 + نص سلك لحام المونيوم ب 875 + نص كيلو كيلو سلك لحام زهر ب 925"

 segment := [qty] [unit] item "ب" price
 record  := segment ("+" segment)*
```

### 4.1 Normalization (`normAr`)

Applied before anything else, and stored, so matching is done on normalized text:

- Strip tashkeel (U+064B–U+0652) and tatweel (U+0640).
- Unify letters: `أإآ→ا`, `ة→ه`, `ى→ي`, `ؤ→و`, `ئ→ي`.
- Arabic-Indic digits `٠–٩ → 0–9`, decimal separator `٫ → .`.
- Collapse whitespace; drop punctuation except `+` and digits.
- Collapse consecutive duplicate tokens — the sample literally contains
  `نص كيلو كيلو`, so this is real noise, not hypothetical.

### 4.2 Segment parse

```
parseDetails(text):
  t = normAr(text)
  for seg in split(t, '+'):
      price = lastMatch(seg, /ب\s*([\d.]+)\s*$/) or lastMatch(seg, /(?:ب|بـ|=)\s*([\d.]+)/)
      rest  = seg minus the price expression
      qty,  rest = takeQuantity(rest)    # numeric, or word: نص=.5 ربع=.25 تلت=.333 …
      unit, rest = takeUnit(rest)        # كيلو جرام لتر متر طبة علبة شكارة لفة قطعة عدد …
      item_raw   = rest.trim()
      emit {qty, unit, item_raw,
            item_norm: item_raw,
            item_key : sortedUniqueTokens(item_raw).join(' '),   # order-invariant
            price, unit_price: qty ? price/qty : null,
            confidence: scoreParse(...)}
```

`item_key` (tokens sorted and deduped) is what makes *flipped wording* match for
free, before any fuzzy scoring runs.

**Every segment that fails to parse is surfaced, never dropped** — a bucket of
"تعذر تحليل التفاصيل" rows is itself a finding, and silent drops would corrupt
the sum check below.

### 4.3 Immediate check

`|Σ price − transaction_amount| > ε` → flag `SUM_MISMATCH`. ε small and absolute
(e.g. 1.00), since `transaction_amount` is `double(16,2)`.

---

## 5. Stage 2 — Item identity (the fuzzy matcher)

Goal: group segments across rows that refer to the same purchased thing despite
typos, flipped word order, orthographic variants and synonyms.

### 5.1 Blocking (cheap candidate generation)

1. Exact `item_key` match (catches flipped wording immediately).
2. Inverted index on rare tokens (IDF-weighted) — candidates must share at least
   one token with IDF above a floor. `المونيوم` is discriminative; `سلك` is not.
3. Character 3-gram bucket overlap, for typo cases that share no whole token.

### 5.2 Scoring (fine pass, only on candidates)

```
score = w1·tokenSetDice(a,b)
      + w2·(1 − normLevenshtein(sortedTokens(a), sortedTokens(b)))
      + w3·idfWeightedTrigramCosine(a,b)
      + w4·unitCompatible(a,b)
```

Light Arabic stemming before scoring: strip the `ال` prefix and `ات/ين/ون/ه`
suffixes. Above threshold → same cluster. A cluster is that item's price history.

### 5.3 The human override — non-negotiable

The matcher **will** be wrong sometimes. The page needs a small alias/override
store so a reviewer can permanently merge two clusters or split one, and the
correction survives every rebuild. Without it, the accountant ends up arguing
with the algorithm and stops trusting the whole page. Storage: a table if DDL is
available, otherwise a Sheet.

---

## 6. Stage 3 — Account aggregates

Four windows per `chart_of_accounts`, anchored on a reference date D (today by
default; the row's own `transaction_date` in the row detail, so the comparison
reads "as of this movement"):

| Window | Range |
|---|---|
| الشهر الحالي (MTD) | first of this month → D |
| الشهر السابق (same span) | first of last month → same day number, clamped |
| العام الحالي (YTD) | Jan 1 → D |
| العام السابق (same span) | Jan 1 last year → D − 1 year |

Last month and last year are cut to the **same day-of-period**, not the full
period — comparing a partial month against a complete one manufactures a fake
decline every time.

One round trip, conditional aggregation:

```sql
SELECT chart_of_accounts,
       SUM(CASE WHEN transaction_date BETWEEN :mtd_a  AND :mtd_b  THEN transaction_amount ELSE 0 END) AS mtd,
       SUM(CASE WHEN transaction_date BETWEEN :lm_a   AND :lm_b   THEN transaction_amount ELSE 0 END) AS last_month,
       SUM(CASE WHEN transaction_date BETWEEN :ytd_a  AND :ytd_b  THEN transaction_amount ELSE 0 END) AS ytd,
       SUM(CASE WHEN transaction_date BETWEEN :lytd_a AND :lytd_b THEN transaction_amount ELSE 0 END) AS last_ytd
FROM regular_box_movement
WHERE transaction_date >= :lytd_a
  AND transaction_type = 'credit'          -- credit = spend
GROUP BY chart_of_accounts
```

A second identical pass with `transaction_type = 'debit'` gives the collected
figures if we want them beside the spend, but they stay in their own column.

Labels come from one cached `SELECT id_5, account_5_name FROM chart_of_accounts_main`.
**Confirm `id_5` is unique** — duplicates would fan out the join and double the sums.

---

## 7. Stage 4 — Anomaly & fraud rules

Tiered by precision. Every rule emits `{rule_id, severity, evidence[], reason_ar}`.

### Tier 1 — Deterministic integrity (highest precision, no statistics)

| Rule | Logic |
|---|---|
| `SUM_MISMATCH` | Σ item prices ≠ `transaction_amount` |
| `EXACT_DUP` | Same normalized details + same amount + same box within N days |
| `NEAR_DUP` | Details similarity > τ and amount within ±δ, within N days — double claiming |
| `STRUCTURING` | Several rows, same account + person, inside a 1–2 day window, each just under a round threshold, summing above it. Thresholds derived empirically from the amount histogram (the spike immediately below a round number) rather than assumed |
| `BACKDATED` | `created_at − transaction_date` beyond the p95 of the population |
| `ODD_HOUR` | Entry outside working hours / weekend / holiday |
| `EDITED_AFTER_REVIEW` | `updated_at > created_at` on `is_revised = 1` |
| `OUT_OF_SEQUENCE` | `id` order contradicts `transaction_date` order |

### Tier 2 — Price anomalies, per item cluster

- **Robust outlier**: modified z-score `0.6745·(x − median)/MAD` on `unit_price`,
  flag > 3.5. Median/MAD rather than mean/σ because these samples are small and
  the contamination is exactly what we are hunting — a mean is dragged by the
  fraud it is supposed to detect.
- **Peer gap**: same item, same period — this `responsible_person`'s median unit
  price vs. everyone else's. The single strongest petty-cash signal.
- **Price ratchet**: monotone upward trend in unit price for one person while
  flat for others (Mann–Kendall, or slope on log price).
- **New item, high value**: cluster size 1 and amount above the account norm.
- **Quantity anomaly**: unit price normal, quantity far above the historical
  consumption rate.

### Tier 3 — Distributional / behavioural, per entity

- **Benford** (1st and 2nd digit) on `transaction_amount` per person/account,
  chi-square or MAD conformity. **Gated on n ≥ ~300** — below that it produces
  noise and false accusations, so the page must show "بيانات غير كافية" rather
  than a weak verdict.
- **Round-number bias**: excess of amounts divisible by 50/100 vs. the population
  rate (binomial test).
- **Velocity burst**: rows per person per day vs. their own baseline (Poisson
  tail probability).
- **Account-mix drift**: PSI / KL divergence of a person's spend distribution
  across accounts vs. their own history — catches miscoding used to hide spend.
- **Seasonality**: current MTD vs. the trailing 12-month distribution for that
  account (reuses the Stage 3 numbers).

### Tier 4 — Unsupervised (optional)

Feature vector per row (amount, log amount, item count, unit-price z-scores,
entry hour, day of week, person, account, parse confidence, dup similarity, days
late) → Mahalanobis distance on a robust covariance, or a small Isolation Forest
(~50 trees is implementable in plain JS for a few thousand rows).

Honest assessment: **Tiers 1–3 carry most of the value and all of the
explainability.** The output of this page has to be defensible to an accountant
in Arabic; an unsupervised score that says "anomalous" and cannot say why is
useless in that conversation. Use Tier 4 as a *ranker* for review order, never as
an accusation.

### Scoring

Row risk = weighted saturating combination of triggered severities, bucketed
`منخفض / متوسط / مرتفع`. Always rendered as "why" plus the evidence rows, never a
bare number.

---

## 8. The page

`Company_TopChemical_BoxAnalysis.html`, following `MainReview` conventions
exactly (`UIC.appShell`, RTL, filter bar, table, pager, toast, `CAN_WRITE` gate).

**Filters**: date range, account (labelled dropdown), responsible person, box,
risk level, review status, "flagged only".

**Tab 1 — الحركات**: date · details · amount · account label · person · risk
badge · review status · action. The row expands to:

- parsed items table (qty / unit / item / price / unit price),
- per item: median, min, max, n, and the last few purchases with dates, prices
  and buyers — plus a sparkline,
- the four account aggregates as a compact strip,
- triggered flags in Arabic with links to the evidence rows.

**Tab 2 — التنبيهات**: every flagged row ranked by risk, filterable by rule.

**Tab 3 — تحليل البنود**: per item cluster — merged aliases, purchase count,
median/min/max unit price, trend, top buyers, outlier rows, and the
**merge/split cluster** control from §5.3.

---

## 8.5 The edit path

The read side is strictly `SELECT`. The only write is a deliberate,
one-row-at-a-time edit through a form, confirmed before it commits.

### Flow

1. **Edit** on a row opens a modal form (`UIC.openModal` + `UIC.field`) holding
   the editable columns, prefilled with current values.
2. On save, `UIC._readForm` validates and the client **diffs against the loaded
   row** — only changed columns are sent.
3. `UIC.confirm` (already in the codebase at [UI_Components.html:2301](UI_Components.html#L2301),
   returns a `Promise<boolean>`) shows the change **named, not generic**:
   - `record`: `حركة رقم 4213 — 2026-08-14`
   - `detail`: one line per changed column, `المبلغ: 725.00 ← 900.00`
   - `confirmText`: `تأكيد التعديل`
4. Only on `true` does the action fire. Escape or the overlay is a "no".
5. Server re-validates, updates the single row by PK, sets `updated_at = NOW()`,
   writes an audit entry, and returns the fresh row.
6. The client re-parses and re-scores that row, so risk flags reflect the edit
   immediately.

The dirty-guard (`UIC._dirty`) already wired in the codebase covers navigating
away from a half-typed form; nothing new needed there.

### Editable columns and their validation

Types come straight from the schema, so validation is exact:

| Column | Editable | Rule |
|---|---|---|
| `id` | **No** | Primary key |
| `created_at` | **No** | It is evidence for the backdating rules — a page that audits tampering must not let you edit the timestamps it audits |
| `updated_at` | **No** (server-set) | `NOW()` on every edit |
| `transaction_date` | Yes | `YYYY-MM-DD`, same validator style as `dbClientsArValidateDate_` |
| `transaction_details` | Yes | ≤ 255 chars — **enforce it**, MySQL would silently truncate or error |
| `transaction_amount` | Yes | Numeric, ≤ 2 decimals, fits `double(16,2)` |
| `transaction_type` | Yes | Exactly `credit` or `debit` |
| `chart_of_accounts` | Yes | Digits only; warn when the edit moves the row in or out of 300000–400000, because that changes which analyses apply to it |
| `responsible_person` | Yes | Free text, trimmed |
| `box_code` | Yes | Integer |
| `client_id`, `related_id`, `user_id` | Yes | Integer or empty → `NULL` |
| `is_revised` | Yes | 0/1 — also settable through the existing one-click review action |

### Server side

```
dbBoxUpdate_(data, user):
  id = required, integer
  changes = {}
  for (col, val) in data.changes:
      if col not in EDITABLE_COLUMNS: throw   # fixed allowlist, not a sanitizer
      changes[col] = validateColumn(col, val) # per the table above
  if empty(changes): throw 'لا توجد تغييرات'
  UPDATE regular_box_movement
     SET <col> = ?, …, updated_at = NOW()
   WHERE id = ?
  affected == 0 -> throw 'البند غير موجود'
  writeAuditEntry(user, id, before, after)
  return the re-read row
```

`EDITABLE_COLUMNS` is a **fixed allowlist**, never a sanitized pass-through of a
client-supplied column name. Values bind as prepared-statement parameters, the
same discipline as the `clients_AR` block.

### The audit trail is not optional here

This page hunts for tampering, and one of its rules (`EDITED_AFTER_REVIEW`)
fires on `updated_at > created_at`. If the page can edit rows without leaving a
record, two things break at once: the tool becomes a way to quietly alter the
evidence it is auditing, and it starts **flagging its own legitimate edits** as
suspicious with no way to tell them apart from an outside change.

So every edit writes `{when, user, row id, column, old value, new value}` — a
table if DDL is available, otherwise a Sheet. The rules engine then reads it and
distinguishes "edited through this page by فلان, with a reason" from "changed by
something else". Access follows the existing gate: read to view, write to edit.

---

## 9. Wiring (mirrors `tc_main_review` exactly)

| File | Change |
|---|---|
| `DbLive_Connector.js` | New section: `dbBoxList_`, `dbBoxAccountAggregates_`, `dbBoxItemHistory_`, `dbBoxUpdate_`, `dbBoxRevise_`, `dbChartAccountLabels_`. Same prepared-statement + `finally`-close discipline as the `clients_AR` block |
| `Box_Analysis_Engine.js` *(new)* | Pure functions: `normAr`, `parseDetails`, `itemKey`, `matchScore`, `runRules`. No I/O — so it is testable |
| `tools/verify/box_parser.js` *(new)* | Parser and rule tests against real strings, using the existing verify harness |
| `Company_TopChemical_Actions.js` | Register `get_box_analysis` / `get_box_item_history` / `update_box_movement` / `revise_box_movement`; add to `PAGE_ACCESS` (page `tc_box_analysis` — `read` for the getters, `write` for the update and review) and `ACTION_TABLES` (`'mysql:regular_box_movement'`) |
| `Company_TopChemical_Registry.js` | Page entry, `nav: false`, template `Company_TopChemical_BoxAnalysis` |
| `Company_TopChemical_Nav.html` | Add the item to the `تحليلات النظام الرئيسي` group (line ~34) |
| `Company_TopChemical_BoxAnalysis.html` *(new)* | The page |

---

## 10. Performance budget

JDBC round trips are the whole cost. Target **3 queries per page load**: (a) the
movement page, (b) the grouped account aggregates, (c) labels — cached. Item
history comes from the precomputed index, never per-row queries.

- Cache labels and aggregates in `CacheService` (6h).
- Item index as a Drive JSON blob keyed by `MAX(updated_at)`, rebuilt by a
  nightly trigger, so the page reads precomputed scores rather than computing
  them per request.
- Never issue a query inside a row loop.

---

## 11. Build order

1. **Schema recon + sizing** — row counts, code-width check, `id_5` uniqueness.
   Decides A vs B and the index strategy.
2. **Parser + tests** — `normAr`, `parseDetails`, against a real sample of
   `transaction_details` strings. Measure parse coverage and the sum-mismatch
   rate; both are findings in their own right.
3. **Read path + basic page** — list, filters, account join, the four aggregates.
   Shippable and useful on its own.
4. **Edit path** — form modal, typed validation, named confirm, audit trail
   (§8.5). Lands before the analytics, so every later stage is built against
   data people can already correct.
5. **Item clustering + price history** — matcher, cluster view, override store.
6. **Rules engine** — Tier 1, then 2, then 3, each with its Arabic reason text.
7. **Risk ranking + alerts tab**; nightly precompute trigger.
8. *(Optional)* Tier 4 ranker; materialize to `regular_box_items` if sizing
   demanded it.

Stages 3–5 each deliver a page a reviewer can already use — the fraud engine
lands on a working screen, not the other way round.

---

## 12. Open questions — status after the build

Branch `feat/tc-box-analysis` implemented §1–§10 as Option A. What follows is
the state of each question **after** that work, not before it. Full write-up in
[BOX_ANALYSIS_RESULTS.md](BOX_ANALYSIS_RESULTS.md); the owner's register is in
[NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md).

### ~~1. DDL rights on MySQL?~~ — SETTLED by decision

**Assume none.** Option A was built: all parsing, matching and scoring in Apps
Script, no schema change of any kind. `regular_box_items` was **not** created
and is referenced nowhere — asserted by `tools/verify/box_sql.js`, along with
the absence of any `CREATE`/`ALTER`/`DROP`/`TRUNCATE`/`RENAME`.

The audit trail and the alias overrides therefore live in Drive, in the folder
`Box_Analysis_Audit/`: append-only NDJSON per month for the audit, one JSON file
for the overrides, both written under `executeWithLock_` because a Drive append
is a read-modify-write. Promotable to tables the moment DDL exists — register
item 4.

### 2. Row count, total and within 300000–400000 — STILL OPEN, needs the database

Unmeasurable from here; no MySQL client and no credentials. Register item 2(a),(b).
The code assumes it is inside Option A's comfortable range; above roughly 20k
rows in the range, the item index needs to move into a derived table.

### 3. Are codes in 300000–400000 always exactly 6 digits? — STILL OPEN

**What the code assumed:** nothing. The predicate is
`chart_of_accounts REGEXP '^[0-9]+$' AND CAST(chart_of_accounts AS UNSIGNED)
BETWEEN 300000 AND 400000`, with a comment recording that `CAST` is **not
sargable** and that a uniform 6-digit width would make the plain string range
equivalent and indexable. The `REGEXP` guard is load-bearing: MySQL casts a
non-numeric string to 0 with a warning rather than an error, so without it
those rows would fall outside the range by accident rather than by decision.
Register item 2(c).

### 4. `chart_of_accounts_main.id_5` — unique? — STILL OPEN, and the code routes around it

**What the code assumed: that it might not be.** Account labels are
**deliberately not a SQL join**. A duplicated `id_5` in a join would fan out the
aggregate rows and double every account total on the page — a wrong number that
looks entirely plausible. `dbChartAccountLabels_` returns a map, the labelling
happens in JavaScript, and duplicates are reported in `duplicate_ids` and shown
to the user in a banner. A duplicate can now only make a label ambiguous, never
a figure wrong. Register item 2(d) — still worth measuring, because a duplicated
`id_5` is a problem in the chart of accounts regardless.

### 5. Is `responsible_person` consistently spelled? — STILL OPEN

**What the code assumed: that it is not.** The filter uses `LIKE '%…%'` rather
than equality, so an inconsistently typed name still finds its rows. It is a
scan, bounded by the date filter and issued only when a human types something.

The entity-level rules (Tier 3) group on the raw string, so two spellings of one
person are currently two entities. The matcher built for items in §5 would apply
to names unchanged if this turns out to matter — but running it on people
without evidence that it is needed risks merging two real employees, which is a
worse error than splitting one. Left alone deliberately.

### 6. Should an edit require a reason note? — STILL OPEN, owner's decision

Not built. The audit entry records **what** changed, **who** changed it and
**when**, but not **why**. Recommended for `transaction_amount`,
`chart_of_accounts` and `transaction_date`. Register item 4(b).

### 7. May an already-reviewed row be edited? — STILL OPEN, owner's decision

**What the code does today: it allows it.** `EDITED_AFTER_REVIEW` reports such
an edit at LOW severity naming who made it, because the audit log explains it;
an edit the log cannot explain is HIGH. Refusing the edit outright would make
the review flag mean something stronger, and that is a control decision about
how the review process works. Register item 5.

---

**Settled before the build:** `credit` = spend, `debit` = collected, never
netted. The 300000–400000 range is a numeric filter on `chart_of_accounts`
scoping the item engine (§2.1). The page reads only, and writes exclusively
through the confirmed edit form (§8.5).

**Settled by the build:**

- **Option A, no DDL** (question 1 above).
- **`created_at` is not editable**, and neither are `id` or `updated_at`.
  `created_at` is the evidence `BACKDATED` / `ODD_HOUR` / `OUT_OF_SEQUENCE` run
  on; a page that audits tampering must not offer a field for editing the
  timestamps it audits. `updated_at` is server-set to `NOW()`, so
  `EDITED_AFTER_REVIEW` cannot be defeated by writing an old value into it.
- **Matcher thresholds**: weights `dice 0.40 / lev 0.20 / trigram 0.30 /
  unit 0.10`, threshold **0.58**, measured against the fixture corpus and
  reprinted by `node tools/verify/box_matcher.js` on every run. Expect to tune
  against real data.
- **Minimum sample sizes**, every one of which refuses to run below its
  threshold and says so in Arabic: `BACKDATED` n ≥ 30, price rules n ≥ 6, peer
  comparison n ≥ 3 per side, ratchet n ≥ 5, velocity ≥ 20 active days, drift
  n ≥ 30 per side, seasonality ≥ 6 complete months, **Benford n ≥ 300** — the
  last enforced inside the function that computes it, which returns no verdict
  field at all below the gate.
- **Tier 4 not built**, by the owner's decision. Proposed in the results
  document as a *ranker* only, never as an accusation.
- **No nightly trigger installed.** `rebuildBoxAnalysisIndex` exists as a global
  with the install steps beside it; the page computes on demand for its visible
  window, bounded and clock-checked, until somebody installs it.
