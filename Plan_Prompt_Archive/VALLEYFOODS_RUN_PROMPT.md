# ValleyFoods Manufacturing & Cost Visibility — agent prompt

**Run this session BEFORE `UI_UX_RUN_PROMPT.md`.** It delivers the owner's functional requests for the
ValleyFoods manufacturing module, fixes two real bugs found while specifying them, and leaves the tree
ready for the UI/UX programme to start clean.

You are working on a **production** multi-tenant ERP built on Google Apps Script + Google Sheets,
serving three companies (TopChemical, TopLight, ValleyFoods), Arabic RTL interface. Repo root
`d:\Work\Script`, remote `origin` (`https://github.com/MohamedGamal2592/APPSCRIPT_ERP.git`).

---

## Read these first, in full, before touching anything

1. **[UI_UX_EXECUTION_PLAN.md](UI_UX_EXECUTION_PLAN.md) § "Phase 2B"** — your specification. It carries
   the full spec for every step below: the cost-stripping rules, the FIFO modal table, the material
   entry rules, the sequencing guard and the fail-open guard. **This prompt orients you; §2B decides.**
2. **[UI_UX_INVESTIGATION.md](UI_UX_INVESTIGATION.md) § "Group I"** — findings **U-43 … U-47** with
   `file:line` evidence and the reasoning behind each.
3. **[PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md)** — the performance programme that just finished
   on this branch. Read §3 and §5. **You must not regress it.**
4. **[NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md)** — the owner's blocked-on-you register. You will add
   one item to it at the end.

Verify a `file:line` reference before you edit it, then move on. **The performance programme landed
28 commits across three runs and line numbers have already drifted once** — the references below were
re-verified at HEAD `001d077`, but confirm each one yourself before editing.

---

# 🚫 HARD CONSTRAINTS — read twice, violate none

## 1. NEVER change any schema

No column may be **added, renamed, removed, reordered, or retyped** in any business table, in any of
the three company spreadsheets or the auth spreadsheet. Not as a migration, not as a "small addition",
not behind a flag, not "temporarily". No new sheet or tab in a business spreadsheet.

Every column this run needs **already exists**: `work_center_cost` and `total_cost` are in
`WC_HEADERS` and populated by sheet formulas; `cost_unit` is already on the consumption sheet;
`valley_cost_view` is a *page id* in the existing `ERP_Pages_Matrix`, which needs no new column.

If something appears to need a new column, **it does not get built.** Write it up as a proposal and
move on.

## 2. NEVER add, edit, or delete data in any business table

No writing rows. No updating cells. No deleting rows. No backfills. No "just fixing this one bad
value". No test records. No seed data. Not by hand, not by script, not via `clasp run`, not via a
one-off function you write and execute.

**This applies especially to `ERP_Pages_Matrix`.** Granting `valley_cost_view` to a role means adding
rows to that sheet. **You must not do it** — it is the owner's step, via the admin UI. See the
fail-open guard below, which exists precisely so your code is safe before those rows exist.

The only writes this run may cause are the ones the **existing** save handlers perform when a real
user clicks Save in the running app. You are not to invoke those either.

## 3. NEVER deploy

Never run `clasp push` against the production script id
(`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM` in `.clasp.json`). Never create or
promote a deployment. Never run `clasp login`, `clasp run`, or `clasp open`.

**The owner edits locally and pushes when everything is finished.** There is no staging environment
and none will be built. 28 unverified commits already sit on this branch; yours will add to them.

## 4. NEVER touch the owner's Google account

No triggers, no Script Properties, no running `dailyCsvBackup`, `inventorySpreadsheets()`,
`archiveOldRecords()` or any other server function.

## 5. NEVER break a public contract

`UIC.*`, `API.*`, `FMT.*`, `UI.*`, `ERPModal.*`, `ERPFlow.*`, `SESSION.*`, every backend function
signature, every response shape not explicitly changed by step S5, and every HTML anchor id.

**`UIC.openModal` is used by 49 pages.** Step S0 extends it. That extension must be **purely
additive** — every existing caller must render byte-identically. Prove it.

---

## Starting state

The performance programme **is finished**. Phases 0–14 ran across three sessions; HEAD is
`001d077 docs(phase-14)`. The working tree is clean apart from the three untracked UI/UX documents.
There is **no concurrent agent** and no file-ownership conflict — every file is yours.

```bash
cd d:/Work/Script
git branch --show-current      # perf/optimization-run
git log --oneline -3           # 001d077 docs(phase-14) … at time of writing
git status --porcelain         # expect only the untracked UI_UX_*.md docs
```

**Create your branch and stay on it:**

```bash
git checkout -b feat/valleyfoods-mfg-cost
```

Reason for a separate branch: the 28 performance commits are unverified and undeployed. Your
functional changes must be revertible **independently** of them.

**For every commit: stage explicit paths only.** Never `git add -A`, never `git add .`, never
`git commit -a`. The three untracked `UI_UX_*.md` files are the previous session's work — leave them
untracked unless a step below says otherwise. Do not push. Do not rebase. Do not merge.

---

## Decisions already made by the owner — do not re-ask

| Decision | Answer |
|---|---|
| Is hiding costs a security boundary? | **Yes — server-enforced.** Cost fields are stripped from the response for users without the grant. They must never reach the browser. |
| Which modules? | **Purchasing, sales and manufacturing** — all three, ValleyFoods only. |
| Permission name | **`valley_cost_view`**, registered in `Company_ValleyFoods_Registry.js`. `write` (or `full`) grant means costs are visible; anything less means quantities only. |
| `Company_ValleyFoods_Actions.js` | **Yours.** Handed over explicitly. |
| Sequencing | This run happens **before** the UI/UX programme. |

---

## Your task

Execute **S0 through S9 below, in order, back to back, until all are complete or blocked**, one
commit each (S5 and S6 are multi-commit). Then stop and report.

**Do not pause for approval between steps.** If something is ambiguous, apply the rules in
"When you would normally stop" and keep going.

### The order is a safety property, not a preference

**S1 must land before S5.** The manufacturing save currently writes the client's `unit_cost` straight
into the sheet ([Company_ValleyFoods_Actions.js:4211](Company_ValleyFoods_Actions.js#L4211)). If you
strip cost from the reads first, the next save by a user without the grant sends `undefined` and
writes `''` into `cost_unit` — **silently wiping the cost of every consumption row they touch.**
Fix the save first. This is not negotiable.

---

## The steps

### S0 — Modal `size` option *(prerequisite, additive)*

`UIC.openModal` ([UI_Components.html:998](UI_Components.html#L998)) accepts only `title`, `body`,
`footer`, `onSave`, and `.modal` is pinned to `max-width: 560px` on desktop
([UI_Components.html:1466](UI_Components.html#L1466)). The batch modal in S7 is a six-column table and
does not fit.

Add a `size` option: `sm` 420 / `md` 560 **(default)** / `lg` 880 / `xl` 1100, as a class on `.modal`.

**Default must stay `md` at 560px so all 49 existing callers are unaffected.** Verify by diffing the
generated markup for a call with no `size` before and after — it must be identical.

> This is step 2.9 of the UI/UX plan, pulled forward. Mark it done there in S9.

### S1 — U-47: the save resolves cost server-side ⚠️ **do this first**

Replace the trust-the-client write at
[Company_ValleyFoods_Actions.js:4211](Company_ValleyFoods_Actions.js#L4211):

```js
m7['cost_unit'] = (f.unit_cost != null && String(f.unit_cost).trim() !== '') ? Number(f.unit_cost) : '';
```

The server already has the authoritative value and already looks it up on the **read** path, from
`valley_current_products` keyed by batch uid
([Company_ValleyFoods_Actions.js:4689](Company_ValleyFoods_Actions.js#L4689)):

```js
var _uc = batchCost[String(cm.item || '').trim()] || 0;
```

Do the same lookup in the save and **ignore the client's `unit_cost` entirely**. This closes a
pre-existing hole (anything calling the endpoint can currently set costs freely) and is what makes S5
safe.

**Verify:** save an order via a stubbed payload with a deliberately wrong `unit_cost` and confirm the
written `cost_unit` comes from `valley_current_products`, not the payload. Confirm no other field in
the written row changed.

### S2 — U-45: work-centre costs reach the client

`getValleyMfgWorkOps_` ([Company_ValleyFoods_Actions.js:4835](Company_ValleyFoods_Actions.js#L4835))
builds each row field by field and **omits `work_center_cost` and `total_cost`**. Both columns exist
in the sheet and are populated — `work_center_cost` by the formula at
[Company_ValleyFoods_Actions.js:3913](Company_ValleyFoods_Actions.js#L3913) — and both are listed in
`WC_HEADERS`.

The print template already renders them
([Company_ValleyFoods_MfgOrderView.html:316](Company_ValleyFoods_MfgOrderView.html#L316)), so
`fmt3(undefined)` prints **`0.000`** on every manufacturing order today.

Add the two fields to the projection. Two lines.

### S3 — U-45: show the same two columns on screen

The on-screen work-ops table shows no cost at all
([Company_ValleyFoods_MfgOrderView.html:594-600](Company_ValleyFoods_MfgOrderView.html#L594-L600)).
Add **تكلفة المركز** and **الإجمالي**, read-only, gated by S6's cost check.

### S4 — U-46: register `valley_cost_view`

Add a page entry to `Company_ValleyFoods_Registry.js` with `nav: false` and a clear Arabic label. It
is a permission token, not a routable page — it must never appear in a menu.

### S5 — U-46: server-enforced cost stripping *(3 commits: manufacturing, purchasing, sales)*

Add a helper, e.g. `vfCanSeeCost_(user)`, returning true when:
- the user is a super admin, **or**
- `user.authorizedPages['valley_cost_view']` contains `write` or `full`, **or**
- **no role anywhere in `ERP_Pages_Matrix` holds any grant on `valley_cost_view`** — the fail-open
  guard.

> **The fail-open guard is mandatory.** You cannot add the matrix rows (hard constraint 2), so the
> moment this ships nobody holds the grant. Without the guard, costs vanish for everyone including the
> owner. With it, behaviour is exactly as today until the owner grants it to the first role, at which
> point the permission becomes real. Log the fail-open path once so it is visible.

Apply it to every ValleyFoods read endpoint that returns a cost-bearing field, in all three modules.
Starting set — **verify the full list against the code, this is not exhaustive**:

- Manufacturing: `unit_cost` / `total_cost` on consumption footers, `cost_unit`, `work_center_cost`,
  `total_cost` on work ops, `total_inventory_cost`, `total_other_cost`, `total_batch_cost`,
  `by_product_nrv_value`, and `unit_cost` on batches from `get_valley_product_batches` and
  `get_valley_product_batches_multi`.
- Purchasing and sales: the equivalent unit-cost, line-cost, total-cost and margin fields.

**Two rules that are easy to get wrong:**

1. **Omit the key. Never send zero.** A zero is indistinguishable from a genuine zero cost and will
   render as a figure. The client must be able to tell "not permitted" from "costs nothing".
2. **Never strip anything the workflow needs.** Quantities, `batch_uid`, `lot`, availability, dates,
   statuses all stay. **A user without the cost grant must still be able to allocate batches and save
   a manufacturing order correctly** — which is exactly why S1 came first.

**Verify:** a differential test that runs each converted projection twice, once with the grant and
once without, asserting the responses differ **only** in cost keys and that those keys are **absent**,
not zeroed.

### S6 — U-46: client-side gating

Hide cost columns, cost totals and cost KPI tiles when the grant is absent, in
`Company_ValleyFoods_MfgOrderView.html`, `_MfgOrders.html`, `_Purchasing.html` and `_Sales.html`.
Quantities always visible. Two commits is fine (manufacturing, then purchasing + sales).

**The print inherits this for free** — it is generated client-side from data the page already holds,
so a user with the grant prints costs and a user without prints quantities only. That is intended.
**State it in the results file** so nobody later reports it as a bug.

### S7 — U-44: the FIFO batch modal

Triggered by **+ دفعة**
([Company_ValleyFoods_MfgOrderView.html:481](Company_ValleyFoods_MfgOrderView.html#L481)), which today
just pushes an empty row into the table.

**Build it on `UIC.openModal` with `size: 'lg'` and nothing else.** No bespoke dialog, no page-local
overlay, no hardcoded width. The page already carries one hand-rolled overlay with a hardcoded
`#875A7B` spinner ([:104-120](Company_ValleyFoods_MfgOrderView.html#L104-L120)) — do not add a second.
If the shared modal cannot do something you need, extend `UIC.openModal` additively.

**Do not write a second FIFO.** `autoAllocFifo_`
([Company_ValleyFoods_MfgOrderView.html:387](Company_ValleyFoods_MfgOrderView.html#L387)) already
allocates oldest-first. You are surfacing it, not reinventing it.

Full spec in plan §2B.3. The essentials:

- **On open:** no batches allocated → run FIFO and present the proposal. Batches already allocated →
  **keep them** and run FIFO only over the shortfall.
- **Rows:** lot / `transaction_code`, available, allocated (editable), remaining — oldest first. Unit
  cost and line total **only with the cost grant**.
- **Running total:** live `مجموع الدفعات: X من Y`, green tick when matched, red naming the shortfall
  or excess otherwise.
- **Tolerance:** mirror the server exactly — `Math.abs(sum - qty) > 0.01` after rounding to 3
  decimals, as at [Company_ValleyFoods_Actions.js:3972](Company_ValleyFoods_Actions.js#L3972). A looser
  client tolerance accepts allocations the save then rejects.
- **Confirm** disabled until matched; **Cancel** leaves the existing allocation untouched.
- **Also fix the silent drift:** at
  [Company_ValleyFoods_MfgOrderView.html:382](Company_ValleyFoods_MfgOrderView.html#L382) the
  quantity-change path skips re-allocation once any batch is hand-edited, so quantity and batches
  drift apart with no warning. Re-run FIFO over the shortfall, or mark the line as needing
  re-allocation. Do not leave it silent.

### S8 — U-43: material entry ergonomics

Full spec in plan §2B.4. The essentials:

- One compact row per material — product combo, quantity, delete — not a full card. The batch
  sub-table appears only once a product and quantity exist; drop the "لا توجد دفعات مسجلة" empty
  table that renders before anything has been entered.
- **`drawOutputs()` currently rebuilds every material card on every keystroke path, destroying the
  combo being typed into.** Re-render only the row that changed. The TopLight sales page already
  applies exactly this discipline for exactly this reason
  ([Company_TopLight_Sales.html:318-330](Company_TopLight_Sales.html#L318-L330)) — follow that
  precedent.
- Each row shows material, quantity, batches allocated, and — cost grant permitting — total cost, plus
  a clear allocated / short / over indicator.

### S9 — Documentation and handover

1. **`VALLEYFOODS_RESULTS.md`** — what changed per step with commit hashes, what was skipped and why,
   every assumption, the differential-test results, rollback commands, and **the visual-verification
   checklist the owner should walk after pushing** (see below).
2. **Append to [NEXT_STEPS_OWNER.md](NEXT_STEPS_OWNER.md)** — the one new blocked-on-owner item:
   > Add `ERP_Pages_Matrix` rows granting `write` on `valley_cost_view` to every role that should see
   > costs, via `ERP_Management` → صلاحيات الأدوار. Until then the fail-open guard leaves costs visible
   > to everyone, which is today's behaviour, so nothing breaks — but the permission is not yet doing
   > anything. Verify by granting it to one role, then signing in as a user in a role without it and
   > confirming the cost columns are gone **and** absent from the network response.
3. **Amend [UI_UX_EXECUTION_PLAN.md](UI_UX_EXECUTION_PLAN.md)** so the UI/UX run does not redo this
   work: mark **Phase 2B** and **step 2.9** as *done in this run*, with the commit hashes, and note
   that Phase 3.6 no longer needs to touch modal width.

---

## When you would normally stop

1. **The plan's §2B covers it** → apply it, note it, continue.
2. **A step is wrong, unsafe, or already done** → skip it, record why, continue with the rest.
3. **Genuinely blocked** (needs the owner's account, needs a schema column, needs matrix rows) →
   write it up, mark it blocked-on-owner, continue with everything else.
4. **A whole step is unworkable** → report it plainly, do not fake it, move to the next.

A reported skip is always better than a guess. **A step reported as done that quietly broke a save is
the one outcome that is not acceptable.**

---

## Verification — you cannot see a browser

Neither can the owner, until they push. Static checks cannot tell you a modal is mirrored or a total
is wrong. So:

1. **`node --check` every `.js` file** you touch, and parse the inline `<script>` of every page you
   touch, after every step.
2. **Differential tests under `node`** for anything pure: the FIFO allocation before and after S7/S8,
   the cost-stripping projections in S5, the `UIC.openModal` markup in S0.
3. **Save-payload diffing for S1.** Stub `API.call` / the handler input, record what gets written,
   and prove the only change is where `cost_unit` comes from.
4. **Build `design_preview/vf_mfg_batch.html`** — a small local file the owner opens by
   double-clicking, stubbing `companyCall` with fixture batches so the batch modal and the material
   rows can be clicked through offline. It must load the **real** `UI_Components.html` and
   `CSS_Tokens.html`, not copies. Add `design_preview/**` to `.claspignore`.
   *(The UI/UX run's Phase 0 builds a full component gallery in the same folder — you are seeding it.)*
5. **Write the owner's visual checklist** as specific statements, never "check it looks right":
   - A printed manufacturing order shows real work-centre costs, not `0.000`.
   - The on-screen work-ops table shows the same two columns.
   - **+ دفعة** opens a modal with batches already proposed oldest-first; Confirm stays disabled until
     the total matches the line quantity.
   - Changing a material's quantity after hand-editing batches no longer leaves the two out of step.
   - Adding a material no longer destroys the combo being typed into.
   - With the cost grant: costs visible as today. Without it: quantities only, and **no cost values
     anywhere in the network response** (check devtools, not just the screen).

---

## A trap previous sessions hit repeatedly

The Bash tool mangles backslashes inside heredocs (`\\` collapses to `\`) and breaks on awkward
quoting — **and this run is full of Arabic string literals, which break it reliably.** For any file
content with Arabic text, regex escapes, CSS selectors or nested quoting: use the `Write`/`Edit`
tools, or write a Python transform script to a file with `Write` and run it. Do not fight the heredoc.

---

## Commit protocol

```
feat(vf-S<n>): <short summary>

<what changed, file by file>
<what was verified, and how — include the differential-test result>
<what was skipped and why>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**Do not push.** The owner pushes.

---

## Before you write a single line of code, confirm you understand

1. You will **not** change any schema — every column this needs already exists.
2. You will **not** add, edit, or delete data in any business table, **including the
   `ERP_Pages_Matrix` rows that grant `valley_cost_view`**. That is the owner's step.
3. You will **not** deploy, push, or touch the owner's Google account.
4. **S1 lands before S5.** Fixing the save first is what stops cost stripping from wiping costing data.
5. The fail-open guard is mandatory, or costs disappear for everyone the moment this ships.
6. S0 must leave all 49 existing `UIC.openModal` callers rendering identically.
7. You will build the batch modal on `UIC.openModal`, and you will not write a second FIFO.
