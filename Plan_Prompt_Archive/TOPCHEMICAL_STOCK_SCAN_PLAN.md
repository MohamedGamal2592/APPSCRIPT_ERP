# جرد المخزون بالباركود — floor-facing stock count scan (Top Chemical)

**Goal.** A second, mobile-first entry point onto the existing `stock_revision` table, for
warehouse/floor staff: scan a product's barcode, enter the count in the units the floor actually
counts in (bags/barrels/cartons × amount-per-unit + loose), confirm against the live system
balance, save. The accounting-facing `Company_TopChemical_StockRevision.html` is untouched — this
is a second way in to the same data, not a replacement.

**Branch.** Current branch is `feat/realtime-feel`, mid-stream on unrelated work. Recommend a fresh
branch, e.g. `feat/tc-stock-scan`, off `master` — your call.

**Status.** Implemented (working tree, not yet committed — per your instruction, everything lands as
one commit at the end). Covered by `tools/verify/s24_stock_scan.js`, registered in `run_all.js`;
full suite is green (69/69).

---

## 0. What already exists and gets reused (no schema change anywhere)

| Piece | Where | Reused as |
|---|---|---|
| `stock_revision` sheet, 13 cols: `product,name_ar,category,date,unit,amount,warehouse,notes,available_amount,difference,percentage,user,created_at` | `STOCK_SHEET` — [Company_TopChemical_Actions.js:27](Company_TopChemical_Actions.js#L27) | Same sheet, same columns, no new table |
| `addStockRevision_` — write path | [:1576-1666](Company_TopChemical_Actions.js#L1576-L1666) | Registered under a **second** action name for the new page (§4) |
| `getSystemQty_` / `systemQtyMap_` — product id → live current_qty from MySQL view `product_current_quantity` | [:1512-1547](Company_TopChemical_Actions.js#L1512-L1547) | Registered under a second action name (§4) |
| `productRefs_` — product id → name_ar map + `{value,label}` options | [:497-512](Company_TopChemical_Actions.js#L497-L512) | Barcode → product resolution, client-side, no round trip |
| Barcode-as-image trick | `Company_TopChemical_Barcode.html`, built via `rec.display_barcode = 'https://barcode.tec-it.com/barcode.ashx?data=' + encodeURIComponent(dataValue) + '&code=Code128'` — [:1257-1258](Company_TopChemical_Actions.js#L1257-L1258) | Same URL shape, computed from `product.id`, never stored |
| Authority: `ACTION_PAGES` gate + `UIC.pageAuthorized_`/`canAdd_`/`canFull_` reading `window.USER_PAGES` | [UI_Components.html:362-382](UI_Components.html#L362-L382) | Same mechanism, new page id (§5) |

---

## 1. Found while checking the authority story: one real gap, scoped and small

You asked to make sure a user who lacks access to a page can't even see it in navigation,
"especially in Valley Foods dashboard." Checked it directly rather than assuming:

- **The mechanism itself is fine and is not Valley-Foods-specific.** The header dropdown
  (`menuGroupsHtml` in `UIC.appShell`) already filters every item by
  `UIC.pageAuthorized_(it.action)` — [UI_Components.html:3863-3866](UI_Components.html#L3863-L3866).
  That function reads `window.USER_PAGES`, which every page is expected to set from the user object
  the server already hands every template (`tmpl.user = user || null` — [Code.js:912](Code.js#L912),
  true for every company).
- **`window.USER_PAGES` is set correctly on every Top Chemical (42 files) and Top Light (13 files)
  page, and on 25 of 26 real Valley Foods pages** — confirmed directly in
  [Company_ValleyFoods_Cash.html:20-24](Company_ValleyFoods_Cash.html#L20-L24) and by grep across the
  rest.
- **The one exception is `Company_ValleyFoods_Dashboard.html` itself** — read in full, it never
  defines `IS_SUPER_ADMIN` or `USER_PAGES` at all. `UIC.pageAuthorized_`/`canAdd_`/`canFull_` all
  **fail open** when that global is missing (`if (!up) return true;` —
  [UI_Components.html:364](UI_Components.html#L364)), so on the dashboard specifically, the header
  dropdown currently shows every group/page to every logged-in Valley Foods user regardless of their
  real grants.
- **Scope is narrower than "the whole dashboard" though.** The dashboard's other surface — the
  module-tile grid — builds from `window.COMPANY_PAGES`, and that array **is** filtered server-side
  before it ever reaches the page: `c.pages.filter(p => p.nav !== false && (!user ||
  checkPageAccessForUI_(user, p.action)))` — [Code.js:918-925](Code.js#L918-L925). So the tile grid
  was never actually wrong; only the **header dropdown** leaks. And clicking an unauthorized item
  from that dropdown still gets refused server-side by `checkPageAccessForUI_` in `doGet`
  ([Code.js:896-902](Code.js#L896-L902)) — so this is a visibility leak (sees a menu item they
  can't open), not a data-access leak.

**Fix:** add the same two lines every other page already has, verbatim, to
`Company_ValleyFoods_Dashboard.html`:

```js
var IS_SUPER_ADMIN = <?!= user && user.isSuperAdmin ? 'true' : 'false' ?>;
var USER_PAGES = <?!= user && user.isSuperAdmin ? 'null' : JSON.stringify((user && user.authorizedPages) || {}) ?>;
```

**Update — the regression guard (§6/tools/verify/s24_stock_scan.js) found three more, not just this
one.** The real invariant isn't "every page in the company," it's "every page that actually renders
a `menuGroups` header dropdown" (`UIC.appShell`'s `menuGroupsHtml` is what reads `window.USER_PAGES`
to filter it). Checking that precisely — not the looser "does this file mention either string
anywhere" grep used in the original investigation — turned up the identical gap on three more Top
Chemical pages that do render the dropdown: **`Company_TopChemical_CustomsOffice.html`,
`Company_TopChemical_Dashboard.html`** (Top Chemical's own landing page), and
**`Company_TopChemical_KPI.html`**. All three fixed the same way, same two lines.
`Company_ValleyFoods_KPI.html` had `USER_PAGES` already (so its nav-hiding was never actually
broken) but was missing `IS_SUPER_ADMIN` — added for consistency, not because anything was leaking.

**Not touched, and flagged rather than fixed:** Top Light has no `menuGroups` dropdown system at
all — `Company_TopLight_Nav.html` does not exist, and none of its 20 pages pass `menuGroups` to
`UIC.appShell`. That's an architectural difference from the other two companies, not an instance of
this bug, and fixing/unifying it wasn't asked for — noted here so it isn't mistaken for "already
checked and fine."

---

## 2. Barcode: a calculated field, not a new table, not a new column

`'TCP-' + product.id` (prefix keeps it out of the same namespace as the existing production-batch
barcodes on `Company_TopChemical_Barcode.html`, which encode a different concept — a production
run, not a product). Nothing is written to the `products` sheet:

- The image is rendered the same way the production barcode already is —
  `https://barcode.tec-it.com/barcode.ashx?data=TCP-<id>&code=Code128` — computed identically
  wherever it's needed (a print view, or resolving a scan back to a product).
- Resolving a scan needs no server round trip: strip the `TCP-` prefix, look the numeric id up in
  `productRefs_(dbId).options` (already fetched once for the page — see §4's
  `get_stock_scan_options`).
- **Printable labels** — open question A (§7).

---

## 3. New page: floor-facing scan + count

Working name `Company_TopChemical_StockCount.html` — bikeshed in §7B if you'd rather.

**Flow:**

1. Scan (camera) or type/scan-with-hardware-scanner into one input box → resolves to a product
   client-side → shows product name + unit, and fetches current system balance
   (`get_stock_scan_qty`, §4).
2. Three inputs, matching how the floor actually counts:
   - نوع العبوة — كيس / برميل / كرتونة (select)
   - عدد العبوات — count
   - الكمية بالعبوة الواحدة — amount per unit
   - الكمية الفرط — loose/leftover amount
3. Live-computed total = count × per-unit + loose, shown as it's typed.
4. **Confirmation screen** before anything is saved: product, computed total, رصيد السيستم (system
   balance), and the difference/percentage against it — computed client-side from numbers already
   in hand, no waiting on the sheet (this is exactly what §4 fixes server-side too).
5. On confirm: `add_stock_scan` (§4) fires in the background — the screen does not block on the
   round trip, matching the optimistic-save pattern already used elsewhere on this branch. Result
   stays on screen (it was already computed pre-save); on a failed save, surface an error/retry
   rather than silently losing the count.
6. Resets and refocuses the scan box for the next item.

`notes` carries the breakdown as text, e.g. `"40 كيس × 25 + فرط 5 = 1005"` — no schema change, the
detail just isn't a separate column.

**Camera:** `getUserMedia` + a CDN-loaded decoder (`html5-qrcode` — works on both Android and iOS,
one script tag). **Real risk, flagged honestly:** Apps Script web apps render inside a
Google-controlled sandboxed iframe, and `getUserMedia` inside that iframe is inconsistent across
setups — untested by me, can't be tested from here. Because the input box also accepts a
typed/hardware-scanner value, this isn't a dead end: if the camera doesn't work in your setup, the
identical page works unmodified with a $20 USB/Bluetooth "keyboard wedge" scanner instead. Test the
camera path on an actual phone early, not last.

---

## 4. Backend: `addStockRevision_` — five sheet formulas become five computed values

Today, on every save, five columns are written as **live Sheet formulas**
([:1626-1635](Company_TopChemical_Actions.js#L1626-L1635)):

```js
if (key === 'name_ar')     f = '=VLOOKUP(A'+rowNum+',products!A:C,3,0)';
if (key === 'category')    f = '=INDEX(products!E:E,MATCH(A'+rowNum+',products!A:A,0))';
if (key === 'unit')        f = '=INDEX(products!D:D,MATCH(A'+rowNum+',products!A:A,0))';
if (key === 'difference')  f = '=IF(ISBLANK(I'+rowNum+'),"",IF(I'+rowNum+'-F'+rowNum+'=0,"مظبوط",...))';
if (key === 'percentage')  f = '=iferror(IF(ISBLANK(I'+rowNum+'),"",IF(1-((F'+rowNum+'-I'+rowNum+')/I'+rowNum+')>1,...)),"")';
```

Consequence, visible right now in the code: `savedRecord.difference` and `.percentage` are left as
**empty strings** in the response ([:1653-1654](Company_TopChemical_Actions.js#L1653-L1654)) — the
caller has no way to know them until the sheet recalculates and something re-reads it. That's
exactly what blocks an instant confirmation screen.

**Change:** compute all five in JS at save time (same semantics, same column meanings — F=amount,
I=available_amount, matching the sheet's real column order) and write literal values:

```js
function stockRevisionDifference_(amount, avail) {
  if (avail === '' || avail == null || isNaN(avail)) return '';
  var d = Math.round((avail - amount) * 100) / 100;
  if (d === 0) return 'مظبوط';
  return d + '  ' + (avail > amount ? 'عجز' : 'زيادة');
}
function stockRevisionPercentage_(amount, avail) {
  if (avail === '' || avail == null || isNaN(avail) || Number(avail) === 0) return '';
  var v = 1 - ((amount - avail) / avail);
  return v > 1 ? amount / avail : v;
}
```

`name_ar`/`category`/`unit` already get computed in JS today for the response
([:1660-1663](Company_TopChemical_Actions.js#L1660-L1663)) — this just also writes those three
values into the row instead of leaving formula strings there.

**One real behavior change, worth naming explicitly:** today, because these are live formulas, a
revision row's displayed name/category/unit would silently follow a later rename of the product in
`products`. Freezing them as values makes each revision a true point-in-time snapshot — arguably
more correct for a count record — but it is a change from today's behavior, not just a performance
tweak. Flagging it rather than assuming it's obviously wanted (§7).

This change lives in the **one shared function** both pages end up calling, so the accounting page
benefits too — its list will show real difference/percentage immediately after save instead of only
after the sheet recalculates.

---

## 5. New actions — same functions, independent permission surface

The existing three actions are all gated to page `tc_stock_revision`
([:81-84](Company_TopChemical_Actions.js#L81-L84)) — the accounting page's own permission. Reusing
them as-is would mean a floor worker needs the accounting page's grant to use the scan screen. Since
this is deliberately a second, separately-permissioned page, register the **same logic** under new
action names gated to a new page id instead — zero duplicated business logic, independent grants:

```js
// ACTION_PAGES
'get_stock_scan_options': { page: 'tc_stock_scan', access: 'read' },
'get_stock_scan_qty':     { page: 'tc_stock_scan', access: 'read' },
'add_stock_scan':         { page: 'tc_stock_scan', access: 'write' },

// ACTION_TABLES (mirrors the existing get_stock_revision/add_stock_revision entries)
'add_stock_scan': STOCK_SHEET,

// registration tail
register('get_stock_scan_options', getStockScanOptions_);  // new, tiny — see below
register('get_stock_scan_qty', getSystemQty_);              // reused as-is
register('add_stock_scan', addStockRevision_);               // reused as-is, after §4's change
```

`get_stock_scan_options` is new but tiny — the scan page needs product options, not the accounting
page's full revision history (which `getStockRevision_` also loads, wastefully, for this use case):

```js
function getStockScanOptions_(data, user, dbId) {
  return { status: 'success', product_options: productRefs_(dbId).options };
}
```

`WAREHOUSES` stays a small client-side constant on the new page too, exactly as the accounting page
already does it ([Company_TopChemical_StockRevision.html:25](Company_TopChemical_StockRevision.html#L25))
— unless §7E says the scan station should just default to one fixed warehouse.

---

## 6. Registry, nav, and authority wiring

**`Company_TopChemical_Registry.js`** — one new entry in `pages[]`, `nav: false` like every other
page here (this file's own `nav` flag isn't what drives the header dropdown — see next point):

```js
{ action: 'tc_stock_scan', template: 'Company_TopChemical_StockCount', title: 'جرد سريع بالباركود', nav: false }
```

**`Company_TopChemical_Nav.html`** is the actual "single source of truth for the header dropdown
groups" (its own comment, [:2-4](Company_TopChemical_Nav.html#L2-L4)) — a new top-level group:

```js
{ label: 'المخازن', items: [
  { label: 'جرد سريع بالباركود', action: 'tc_stock_scan' }
] },
```

placed first in `TOPCHEMICAL_MENU` (§7C confirms position).

**Authority — nothing new to build.** `menuGroupsHtml` already filters this group's item by
`UIC.pageAuthorized_('tc_stock_scan')` for free, *as long as the new page sets `USER_PAGES` and
`IS_SUPER_ADMIN` the way every correct page does* — which §1 just showed is exactly the line that
got skipped once, on the Valley Foods dashboard. `Company_TopChemical_StockCount.html` will include
those two lines from the start, not as an afterthought.

**Owner's step, not this agent's:** granting `tc_stock_scan` to a role (e.g. "أمين مخزن") happens in
the admin matrix UI, same as every other page in this system — no `ERP_Pages_Matrix` row is written
by hand.

---

## 7. Decisions (resolved)

**A. Printable labels — server-rendered, same shape as the production barcode print.** New
`servePrintBarcode_`-style function in `Code.js`, `?download=print_stock_barcodes`, one row per
product instead of 18 copies of one barcode (that repeat-grid is specific to a single production
batch label sheet; this prints every product once). Detailed in §13.

**B. Naming.** File `Company_TopChemical_StockScan.html`, action `tc_stock_scan`, label **"جرد دوري
مخازن باركود"** (supersedes the earlier placeholder "جرد سريع بالباركود" used above).

**C. Nav position.** "المخازن" group is **appended after** the existing groups in
`TOPCHEMICAL_MENU`, not first.

**D. Camera — build it now**, mobile-phone camera as the primary input for v1 (not
hardware-scanner-only). The text box still accepts a hardware/keyboard-wedge scanner too, since the
camera decode just writes into the same box — that fallback comes for free, not as separate work.
The iframe/`getUserMedia` risk from §3 stands: worth testing on a real phone as soon as it's
deployed.

**E. Warehouse field — unchanged.** Keep the exact same fixed `['1','2','3','4','5','شبرا']` picker
the accounting page already uses. No lock/default to one warehouse.

**F. Container type — fixed select, four options:** شيكارة، كرتونة، برميل، بستلة (exact wording,
not free text).

**G. Sequencing — build everything first, one commit at the end.** No intermediate commits per
piece; all of §1, §4-§6, §9-§12 land together and get reviewed/committed as one unit.

---

## 8. Constraints this plan respects

1. **No schema change** — no new sheet, no new column, anywhere (`stock_revision` keeps its 13
   columns; `products` keeps its columns; the barcode is computed, not stored).
2. **`src_html/` is not edited** — scratch copies, excluded via `.claspignore`.
3. **No deploy** — no `clasp push`, no promoting a deployment. Owner's step.
4. **No `ERP_Pages_Matrix` row written by the agent** — granting `tc_stock_scan` to a role is the
   owner's step through the admin UI, same as every other page in this system.
5. **No public contract broken** — `addStockRevision_`/`getSystemQty_`/`productRefs_` keep their
   names, signatures and response shapes; they are *registered again* under new action names, not
   changed in a way that breaks the accounting page's existing calls to them.

---
---

# Addendum (unrelated feature, appended per request): Valley Foods — الحالة الوظيفية sync

Different company, different table, nothing to do with stock scanning — kept in this same document
because that's how it was asked for. Split into its own file later if that gets confusing.

**What you asked for:** when a user adds a new record to `valley_employee_status`, loop every
`emp_id`, find their maximum `Status_Date`, read `Status_Type` for that row, and store it into
`valley_employee_info[الحالة الوظيفية]` for each employee.

## 9. This already exists — as a read-time overlay, not a stored value

Checked before planning anything new, and most of this is already built, in
[Company_ValleyFoods_Actions.js](Company_ValleyFoods_Actions.js):

- **`getLatestStatusMap_(dbId)`** ([:580-593](Company_ValleyFoods_Actions.js#L580-L593)) already does
  exactly "loop every status row, keep the max-`Status_Date` one per employee":
  ```js
  function getLatestStatusMap_(dbId, statusesArg) {
    const statuses = statusesArg || getAllRecords_(dbId, EMP_STATUS_SHEET);
    const map = {};
    statuses.forEach(function (r) {
      const code = r.employee_code || r.Employee_Code;
      if (code === undefined || code === '') return;
      const key = String(code);
      const dt = r.status_date || r.Status_Date ? toDate_(r.status_date || r.Status_Date) : new Date(0);
      const statusType = r.status_type || r.Status_Type || '';
      const cur = map[key];
      if (!cur || dt >= cur.date) map[key] = { status_type: statusType, date: dt };
    });
    return map;
  }
  ```
- **`getEmployeesData_`** ([:652-663](Company_ValleyFoods_Actions.js#L652-L663)) already overlays that
  map onto every employee row it returns: `r['الحالة الوظيفية'] = st ? st.status_type : '';` — so
  anything reading employees *through this function* already sees the correct current status, live,
  every time. Same for `getActiveEmployeeOptions_` ([:619-631](Company_ValleyFoods_Actions.js#L619-L631)),
  which filters on the same live map rather than the stored column.
- **`addEmpStatus_`** ([:782-846](Company_ValleyFoods_Actions.js#L782-L846)), the handler that runs
  when a new status record is actually added, already does write to the stored column — but only
  for the **one** employee just touched, using the just-submitted `statusType` directly rather than
  recomputing:
  ```js
  // current, :819-834 — updates ONE row, trusts the submitted value is the latest
  try {
    const empSheet = getSheet_(EMP_INFO_SHEET, dbId);
    const empHeaders = getHeaders_(empSheet);
    const empData = empSheet.getDataRange().getValues();
    const empIdIdx = empHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'emp_id'; });
    const statusIdx = empHeaders.findIndex(function (h) { return String(h).trim() === 'الحالة الوظيفية'; });
    if (empIdIdx !== -1 && statusIdx !== -1) {
      for (var r = 1; r < empData.length; r++) {
        if (String(empData[r][empIdIdx]) === empKey) {
          empSheet.getRange(r + 1, statusIdx + 1).setValue(statusType);
          noteMutation_(empSheet);
          break;
        }
      }
    }
  } catch (e) { /* log but don't fail */ }
  ```
  This happens to be safe *today* only because of the validation just above it ([:792-802](Company_ValleyFoods_Actions.js#L792-L802)),
  which throws unless the new date is later than every existing status date for that employee — so
  the just-submitted record is guaranteed to already be the new max by the time this block runs.
  It updates only the one employee, silently swallows any failure (the comment says "log but don't
  fail" — it doesn't actually log), and would not self-heal a row that went stale some other way
  (a manually edited sheet cell, data from before this logic existed, or a future code path that
  adds/edits/deletes a status row without going through this exact function).

## 10. What to change: recompute for every employee, from the real data, not just the one submitted

Replace that block with a full recompute using the function that already does the correct
computation — no new business logic, just applying it everywhere and persisting it:

```js
try {
  const empSheet = getSheet_(EMP_INFO_SHEET, dbId);
  const empHeaders = getHeaders_(empSheet);
  const empData = empSheet.getDataRange().getValues();
  const empIdIdx = empHeaders.findIndex(function (h) { return String(h).trim().toLowerCase() === 'emp_id'; });
  const statusIdx = empHeaders.findIndex(function (h) { return String(h).trim() === 'الحالة الوظيفية'; });
  if (empIdIdx !== -1 && statusIdx !== -1) {
    // Re-fetch rather than reuse the `statuses` array read at the top of this
    // function (line 792) — that read happened BEFORE addRecord_ inserted the
    // new row, so it does not contain it yet.
    const statusMap = getLatestStatusMap_(dbId);
    for (var r = 1; r < empData.length; r++) {
      const eid = String(empData[r][empIdIdx]);
      const st = statusMap[eid];
      const newVal = st ? st.status_type : '';
      if (empData[r][statusIdx] !== newVal) {
        empSheet.getRange(r + 1, statusIdx + 1).setValue(newVal);
      }
    }
    noteMutation_(empSheet);
  }
} catch (e) {
  try { console.error('addEmpStatus_: status sync failed — ' + e.message); } catch (e2) {}
}
```

What this buys over the current single-row update:

- **Loops every `emp_id`**, as asked, instead of just the one on the submitted record.
- **Self-healing** — any employee whose stored value ever drifted (manual sheet edit, pre-existing
  data, a future bug) gets corrected on the very next status save anywhere in the system, not just
  their own next status change.
- **Failure is visible** (`console.error`) instead of silently swallowed.
- Still one sheet read + only the cells that actually changed get written — in the normal case
  that's exactly one cell (the employee whose status just changed), same cost as today.

**Trigger stays exactly where you specified** — `addEmpStatus_` only, i.e. only on a new
`valley_employee_status` record. There is currently no edit/delete handler for that table; if one
gets added later, it would need the same recompute, but that's not in scope here.

## 11. Verify

Implemented in `tools/verify/s24_stock_scan.js` §7 (shared with the stock-scan checks above, one
file, registered once in `run_all.js`) rather than a separate script.

Add to the existing offline verify harness (`tools/verify/`, same style as the other checks already
in `run_all.js`): assert `addEmpStatus_`'s status-sync block calls `getLatestStatusMap_(dbId)` with
no cached-array argument (so it re-reads post-insert), loops `empData` rather than searching for a
single `empKey`, and that the `console.error` path exists (regression guard against the silent
swallow coming back).

## 12. Constraints

- No schema change — `valley_employee_info` and `valley_employee_status` keep their exact columns.
- No change to `getLatestStatusMap_`, `getEmployeesData_`, or `getActiveEmployeeOptions_` — they're
  already correct; only `addEmpStatus_`'s persistence step changes.
- `src_html/` not edited; no deploy; owner does `clasp push`.
