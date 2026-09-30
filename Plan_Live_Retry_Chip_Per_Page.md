# Plan: the retry chip belongs to the page that owns the record

**Date:** 2026-09-30
**Status:** Plan only. Nothing here has been executed.
**Symptom:** one save fails anywhere in the app, and «طلب واحد بانتظار التأكيد / إعادة المحاولة / تجاهل» then appears on **every** page of **every** company until it is discarded.
**Scope:** `UI_Components.html` only — the `UIC.Live` retry queue (§RT-4) and the router's `KEEP` list. No company page needs editing.

---

## PART A — Why it shows everywhere (verified in the code)

### A1. One queue key for the whole web app

```
UI_Components.html:7685   var RETRY_KEY = 'erp_live_queue';
UI_Components.html:7686   var DEAD_KEY  = 'erp_live_dead';
```

Every company page is an `?action=…` on the **same** Apps Script URL, so Top Chemical, Top Light, Valley Foods, Testing System and Assessment all share one origin and therefore one `localStorage` bucket. A failed `tc_products` save and a failed `vf_cash` save go into the same array. This is by design for the drain (§I4 needs one leader over one key) — the mistake is that *rendering* reuses the same global scope as *storage*.

### A2. The entry records no page

```
UI_Components.html:7834   function enqueue(entry) { … }
UI_Components.html:8069   enqueue({ v:1, target_system: target, action: o.action,
                                    data: o.data, request_id: liveRequestId,
                                    message: o.message, tries: 0, at: Date.now() });
```

The entry carries the **company** (`target_system`) and the **module action** (`save_product`). It does not carry the page (`CURRENT_ACTION`) and it does not carry the record. So even if `renderChip` wanted to filter, there is nothing on the entry to filter on. Company-level scoping is available today for free; page-level needs one new stamp.

The dead letter is thinner still — `{a, m}` only:

```
UI_Components.html:7907   dead.push({ a: entry.action, m: … });
```

### A3. `renderChip` is unconditional and body-level

```
UI_Components.html:7811-7831   function renderChip() {
                                 if (!queue.length && !dead.length) { … remove; return; }
                                 … document.body.appendChild(el) …
```

`position: fixed` at `z-index: 9001` (CSS 5808-5823), `role="alert"`, appended to `document.body`, with **no reference to the current page**. It is called from:

| Caller | Line |
|---|---|
| init, on every page load | 8919-8926 (`loadQueue(); loadDead(); … renderChip()`) |
| `enqueue` | 7836 |
| every drain outcome | 7890, 7895, 7910 |
| the cross-tab `storage` listener | 8933 |

So a page that had nothing to do with the failure re-renders the alarm the moment it loads.

### A4. The router deliberately carries the chip across a soft navigation

```
UI_Components.html:6967   var KEEP = /^(page-loading|uic-live-busy|uic-live-retry|uic-live-fresh|…)$/;
```

with the comment: *"Removing the retry chip in particular would take a persistent 'not saved yet' warning off the screen while the change was still unsaved."* Correct as a guarantee, wrong as an implementation: the element is physically preserved from the failing page onto the next one, and nothing re-evaluates it after `window.CURRENT_ACTION = action` (6970).

### A5. The knock-on effects are global too, and they are worse than the chip

```
UI_Components.html:7929   function pendingCount() { return inFlight + queue.length; }
UI_Components.html:7931   function guardMessage() { … }
```

`pendingCount()` is the global queue length, and it feeds:

- **the navigation guard** — `UIC.navTo` (412-414), `UIC.Router.go` (6913-6916) and `beforeunload` (8936-8942). One stuck entry means **every** navigation anywhere in the app asks «هناك تغيير لم يُحفظ بعد. الخروج الآن سيفقده. المتابعة؟», on pages where nothing at all would be lost.
- **`userIsBusy()`** (8164-8168) — returns true while `pendingCount() > 0`, so `arrive()` suppresses the live-change refresh on **every** page for as long as the entry sits there.

### A6. Why the entry never leaves on its own

Two dead ends keep the chip up indefinitely, which is why this is visible at all rather than a two-second blip:

1. **An unsendable head blocks the queue forever.**
   ```
   UI_Components.html:7883   if (!send) { renderChip(); return; }
   ```
   `callFor` (7761) returns `null` when the entry has no `target_system` and this session never set `queue._call`. The comment acknowledges it ("a legacy head still waits for the next drain event"), but nothing rotates it and nothing expires it, so «تجاهل» is the only exit.
2. **A dead-letter-only chip is a chip that lies.** When `queue.length === 0` and `dead.length > 0`, line 7822 still renders `0 طلبات بانتظار التأكيد`, and both its buttons are inert — `retryNow()` drains an empty queue, and `discardQueue()` returns at `if (!queue.length) return;` (8958). Only the «تم» button inside the dead section clears it.

### A7. And «تجاهل» is currently dangerous

`discardQueue()` (8957-8971) empties the **whole** array. A user on `tc_products`, annoyed by a chip about a Top Chemical product, can silently destroy a queued Valley Foods cash write they have never seen. This is the one bug here that loses data.

---

## PART B — The goal

Keep the §RT-4 guarantee intact: **a write that failed must never be able to scroll off the screen unnoticed.** Change only *where* it shouts.

- On the page that owns the record → today's red alert chip, now naming the record.
- On any other page → a quiet, neutral chip that says a change is unsaved **on another page** and takes you there. The failure is still impossible to miss; it stops pretending to belong to the page you are on.
- Nothing pending anywhere → no chip, as today.

---

## PART C — Fixed names (use exactly these)

| Name | Kind | Meaning |
|---|---|---|
| `entry.page` | queue entry field (new) | the owning page's action key, e.g. `tc_products` |
| `entry.label` | queue entry field (new) | Arabic name of the record, for the chip text |
| `entry.row` | queue entry field (new) | the draft's key (often `__tmp_…`), so the chip can point at the row |
| `o.page`, `o.recordLabel` | `UIC.Live.save` options (new, additive) | override the defaults; both default to the page's own globals |
| `splitQueue()` | client (new, internal) | `{mine, elsewhere}` over `queue` **and** `dead`, by current action |
| `pageLabel(action, company)` | client (new, internal) | Arabic page name from `COMPANY_PAGES`, never the raw action key |
| `UIC.Live.refreshChip()` | client (new, exported) | re-evaluate the chip for the current action (router calls it) |
| `.uic-live-elsewhere` | CSS class (new) | the quiet cross-page chip: neutral colours, `role="status"` |
| `ENTRY_MAX_AGE` | client const (new) | `24 * 60 * 60 * 1000` — past it an entry stops being "a retry" |

---

## PART D — Design

### D1. Stamp identity on every entry

In `save()` (7943), at the `enqueue` call (8069), add:

```js
page:  o.page || String(window.CURRENT_ACTION || ''),
label: o.recordLabel || '',
row:   (canPatch && draft && key) ? String(draft[key] || '') : '',
v:     2
```

`target_system` is already captured synchronously at 8000 and stays as the company. `o.page` and `o.recordLabel` are additive options with sane defaults, so **no company page changes**.

Carry the same fields onto the dead letter at 7907: `dead.push({a, m, p: entry.page, c: entry.target_system, l: entry.label})`.

**Back-compat rule, and it is not optional:** an entry with no `page` (written by today's build, already sitting in someone's `localStorage`) is treated as belonging to **every** page — today's behaviour exactly. Nothing that is already queued goes invisible because of this change.

### D2. `splitQueue()`

```js
function ownsPage(e) {
  var p = e && (e.page || e.p);
  return !p || p === String(window.CURRENT_ACTION || '');   /* unstamped ⇒ mine */
}
function splitQueue() {
  return {
    mine:      queue.filter(ownsPage),
    elsewhere: queue.filter(function (e) { return !ownsPage(e); }),
    deadMine:  dead.filter(ownsPage),
    deadOther: dead.filter(function (e) { return !ownsPage(e); })
  };
}
```

### D3. `renderChip()` — three states instead of one

```
mine.length || deadMine.length          → the alert chip (today's .uic-live-retry, role="alert")
else if (elsewhere.length || deadOther) → the quiet chip (.uic-live-elsewhere, role="status")
else                                    → remove
```

**The alert chip**, with the queue line suppressed when the queue is empty (fixes A6.2):

| condition | text |
|---|---|
| 1 entry, has `label` | «تعديل «‎<label>‎» بانتظار التأكيد» |
| 1 entry, no label | «طلب واحد بانتظار التأكيد» (today's text) |
| n entries | «<n> طلبات بانتظار التأكيد» |
| queue empty, dead only | no queue line, no إعادة المحاولة, no تجاهل — only the dead list and «تم» |

**The quiet chip** — one line, neutral, and it does the one useful thing:

| condition | text |
|---|---|
| all elsewhere on one page, label known | «تغيير لم يُحفظ في صفحة <page label> · انتقل إليها» |
| one page, label unknown, company known | «تغيير لم يُحفظ في <company name> · انتقل إليه» |
| several pages | «<n> تغييرات لم تُحفظ في صفحات أخرى» |

Its button navigates: `UIC.navTo(null, UIC.baseUrl() + '?action=' + encodeURIComponent(page) + '&sessionToken=' + encodeURIComponent(UIC.token()))`. No إعادة المحاولة and no تجاهل on this chip — you act on a record from the page that owns it. The drain keeps running in the background regardless, so a chip nobody clicks still resolves itself when the network returns.

`pageLabel()` reads `window.COMPANY_PAGES` (already client-side; the shape is used at 4684). A cross-**company** entry has no label available in this page's globals → fall back to the company name, else the generic plural wording. **Never print the raw action key** to a user.

### D4. Scope the actions — and only the destructive one strictly

- **`discardQueue()`** (8957): filter to `mine` instead of `queue.length = 0`. This closes A7. The confirm counts only what will actually be discarded.
- **`ackDead()`** (8974): clear only `deadMine`.
- **`retryNow()`** (8946): leave it draining the whole queue in array order. Reordering writes is exactly what §I9 forbids, and a drain walks the queue in order anyway, so scoping the button would be a lie about what it does. Add a comment saying so.

### D5. Scope the guard and the busy check

This is the part that actually stops the app-wide degradation.

```js
function pendingHere() {
  return inFlight + splitQueue().mine.length;
}
```

- **`guardMessage()`** (7931) reads `pendingHere()`, not `pendingCount()`. Leaving a page while *another* page has a queued entry loses nothing — since RT-4b the entry is rebuilt from `target_system` and drains cross-session — so prompting there is pure noise. On the owning page the wording and behaviour are unchanged.
- **`userIsBusy()`** (8166) reads `pendingHere()`. A stuck Valley Foods entry must not freeze the live-change refresh on every page in the app.
- **`pendingCount()`** stays exported and stays global: it is the honest total, and anything reporting overall state should keep using it.

### D6. Re-evaluate the chip after a soft navigation

`#uic-live-retry` stays in `KEEP` (6967) — removing it mid-swap would flash an alarm off and on. Instead, in `go()`'s success path, right after `window.CURRENT_ACTION = action` (6970):

```js
try { UIC.Live.refreshChip(); } catch (e) {}
```

Same call in the `popstate` handler (7014) for back/forward. `refreshChip` is just `renderChip` exported.

### D7. Stop entries rotting (fixes A6.1)

In `drainQueue()` (7871):

- **Rotate an unsendable head.** Replace `if (!send) { renderChip(); return; }` with: move the entry to the back, and if a full pass finds nothing sendable, stop and reschedule. One legacy entry must not block live entries behind it.
- **Age out.** Before sending, if `Date.now() - entry.at > ENTRY_MAX_AGE`, move it to `dead` with «طلب قديم لم يتأكد حفظه — راجع السجل قبل إعادة إدخاله». A day-old chip is not a pending retry, and calling it one is how the alarm loses its meaning.

---

## PART E — Phases

| Phase | Change | Files | Risk |
|---|---|---|---|
| **P1** | D1 — stamp `page`/`label`/`row`, `v:2`, dead letter carries them. No rendering change. | `UI_Components.html` | none: fields are additive and unread |
| **P2** | D2 + D3 — `splitQueue`, three-state `renderChip`, `.uic-live-elsewhere` CSS, dead-only fix | `UI_Components.html` | the visible change; back-compat rule in D1 protects existing queues |
| **P3** | D4 — scope `discardQueue` and `ackDead` | `UI_Components.html` | none; removes a data-loss path |
| **P4** | D5 — `pendingHere()` for the guard and `userIsBusy` | `UI_Components.html` | fewer prompts; verify the owning page still prompts |
| **P5** | D6 — `refreshChip()` from the router and `popstate` | `UI_Components.html` | none |
| **P6** | D7 — rotate the unsendable head, age entries out | `UI_Components.html` | touches the drain; test with a deliberately stripped entry |

P1 and P2 are the answer to the report. P3 fixes a real data-loss bug found on the way and should not be deferred. P4-P6 are what stop it recurring as a different symptom.

---

## PART F — How to verify

Run `npm run verify` and `npm run ui_check` after each phase.

Manual, with DevTools offline throttling:

1. **The reported case.** Fail a save on `tc_products`. Chip is red and names the product. Navigate to `tc_sales`, then to `vf_cash`, then to the dashboard → quiet chip only, reading «تغيير لم يُحفظ في صفحة الأصناف · انتقل إليها». Click it → back on `tc_products`, red chip again.
2. **Navigation is not obstructed elsewhere.** With that entry queued, navigate between three pages that are not `tc_products` → **no** confirm dialog. Navigate away from `tc_products` itself → the dialog, as today.
3. **Two companies at once.** Fail a save on `tc_products` and one on `vf_cash`. On a third page: «2 تغييرات لم تُحفظ في صفحات أخرى». On `tc_products`: the red chip counts **one**, and «تجاهل» discards **one** — the Valley Foods entry survives in `localStorage`.
4. **Dead-letter-only.** Force `RETRY_MAX` exhaustion. No «0 طلبات» line, no inert buttons, «تم» clears it, and it is only offered on the owning page.
5. **Back-compat.** Hand-write a `v:1` entry with no `page` into `erp_live_queue`, reload → it shows as the red chip on whatever page you are on (today's behaviour), and it is not hidden anywhere.
6. **Soft navigation.** On two router-registered pages, fail a save on the first, soft-navigate → the chip must swap from red to quiet without a reload.
7. **Recovery.** Go back online → the drain empties the queue and every chip disappears, from whichever page is open.

---

## PART G — Open question for the owner

The §11.1 note above `discardQueue` records that «تجاهل» is available to every user and that discarding a real write is the one remaining deliberate data-loss path. **Scoping it to the current page (D4) narrows the blast radius but does not close that question.** Worth deciding separately whether «تجاهل» should require the same authority as deleting the record it would have created.
