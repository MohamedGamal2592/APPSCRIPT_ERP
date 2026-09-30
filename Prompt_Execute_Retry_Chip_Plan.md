# Prompt: scope the retry chip to the page that owns the record

*(paste everything below the line into a new session)*

---

You are implementing a fixed plan in this repository: a Google Apps Script ERP, pushed with clasp. The plan is `Plan_Live_Retry_Chip_Per_Page.md` in the repository root, and it contains the full analysis of the bug. Execute **P1 through P6 in order, without stopping between phases**. Do not stop to ask for approval or for a review; the one open question is collected at the end.

**The bug, in one sentence.** When a save fails on one page, the red chip «طلب واحد بانتظار التأكيد / إعادة المحاولة / تجاهل» appears on **every page of every company** until someone discards it, because the retry queue lives in one origin-wide `localStorage` key, the queued entry records no page, and `renderChip()` draws the alert on whatever page happens to be open.

**What it must look like afterwards.** On the page that owns the failed record: the same red alert as today, now naming the record. On any other page: a quiet neutral chip that says the change is unsaved on another page and takes you there. Nothing pending anywhere: no chip. The §RT-4 guarantee is unchanged — **a failed write must never be able to scroll off the screen unnoticed** — only *where* it shouts changes.

---

## 0. Ground rules

- **Every change in this task is in `UI_Components.html`, plus one new test file and one line in `tools/verify/run_all.js`.** No company page (`Company_*.html`), no `Code.js`, no `*_Actions.js`, no server code. If you think you need to touch one of those, you have misread the task — re-read the plan.
- `UI_Components.html` is **one single `<script>` block** from the first line to the last. There is no `<style>` element: all CSS lives inside a JavaScript template literal, `const css = \`` at line ~5185 closing at `\`;` at line ~6605. **Inside that literal, never write a backtick or `${`** — it would end the literal or interpolate.
- The `UIC.Live` module is one IIFE spanning lines ~7619 to ~9016. It is **ES5 style**: `var`, `function`, no arrow functions, no `let`/`const`, no template literals, no spread. Match it exactly. `npm run verify` parses this file and will fail on style drift.
- All user-facing text is **Arabic**. Use the exact strings given below, character for character, including the guillemets «».
- **Line numbers in this prompt are from the current `master` and will drift as you edit.** Always locate an edit by the quoted code, never by the line number. The line numbers are there to tell you which of several similar-looking places is meant.
- There is an `esc()` helper inside the `UIC.Live` IIFE (line ~8314) that HTML-escapes a string. It is hoisted, so you may call it from `renderChip` even though it is defined below it. **Use it for every value that reaches `innerHTML`.**

## 1. Branch and setup

Work on a new branch `fix/retry-chip-per-page`, created from `master`. Commit once per phase. Do not push unless asked.

Before changing anything:

1. Read `Plan_Live_Retry_Chip_Per_Page.md` in full.
2. Read these regions of `UI_Components.html` so you know the shape of what you are editing: the `UIC.Live` IIFE header and constants (~7619–7700), `loadQueue`/`persistQueue`/`loadDead`/`persistDead` (~7720–7755), `callFor` (~7761), `renderChip` (~7811), `enqueue` (~7834), `drainQueue` (~7871), `pendingCount`/`guardMessage` (~7929), `save` (~7943–8115), `userIsBusy` (~8164), the init block (~8919), `retryNow`/`discardQueue`/`ackDead` (~8946–8978), the export object (~8981–9015), and inside `UIC.Router`, `go()`'s success path with the `KEEP` regex (~6940–7010).
3. Run `npm run verify` and save the whole output to `tools/verify/results/retry_chip_baseline.txt`. **This suite already has pre-existing failures on `master`.** Your bar is **no new failures** — compare check by check against this baseline, never against zero.
4. Run `node tools/verify/rt2_queue.js` and `node tools/verify/s18_live_saves.js` separately and save their output too. These two exercise the retry queue directly and are the ones most likely to break.
5. Say in 3–5 lines what you are about to do, then start. Do not wait for a reply.

---

# P1 — stamp identity on every entry

No visible behaviour changes in this phase. You are only recording who owns each queued write.

### P1.1 — add the age constant

**Find** (in the `UIC.Live` constants, ~7685):

```js
  var RETRY_MAX = 5;
  var queue = [];                 // [{v, target_system, action, data, message, tries, at}]
```

**Replace with:**

```js
  var RETRY_MAX = 5;
  /* [§P6] Past this, an entry stops being "a retry". A day-old chip that still
     says «بانتظار التأكيد» is how a warning that must be believed stops being
     believed, so it is retired to the dead letter instead. */
  var ENTRY_MAX_AGE = 24 * 60 * 60 * 1000;
  var queue = [];                 // [{v, target_system, page, label, row, action, data, message, tries, at}]
```

### P1.2 — stamp the entry at the one place it is created

There is exactly one `enqueue({...})` call, inside `save()`'s `.catch` handler (~8071), directly under the line `queue._call = o.call;`.

**Find:**

```js
          enqueue({
            v: 1,
            target_system: target,
            action: o.action,
            data: o.data,
            request_id: liveRequestId,
            message: o.message || 'تم الحفظ',
            tries: 0,
            at: Date.now()
          });
```

**Replace with:**

```js
          enqueue({
            v: 2,
            target_system: target,
            /* [§P1] WHO OWNS THIS FAILURE. Without it the chip has nothing to
               filter on and must shout on every page in the app — which is the
               bug this phase exists to make fixable. `page` is the action key
               of the page that made the save; `label` names the record for the
               chip; `row` is the draft's key so a future revision can point at
               the row itself. All three are additive and default from the
               page's own globals, so no company page needs editing. */
            page: o.page || String(window.CURRENT_ACTION || ''),
            label: o.recordLabel || '',
            row: (canPatch && draft && key) ? String(draft[key] || '') : '',
            action: o.action,
            data: o.data,
            request_id: liveRequestId,
            message: o.message || 'تم الحفظ',
            tries: 0,
            at: Date.now()
          });
```

`canPatch`, `draft` and `key` are all local variables of `save()` already in scope at this point — do not redeclare them.

### P1.3 — carry the stamps onto the dead letter

**Find** (inside `drainQueue`'s `.catch`, ~7907 — it is one long line):

```js
          dead.push({ a: entry.action, m: (err && err.transport) ? 'تعذر تأكيد نتيجة الطلب — راجع السجل قبل إنشاء طلب جديد' : ((err && err.message) || 'تعذر الحفظ') });
```

**Replace with:**

```js
          dead.push({
            a: entry.action,
            /* [§P1] A dead letter is scoped the same way a queued entry is: it
               is shown to the page whose record it was. */
            p: entry.page || '',
            c: entry.target_system || '',
            l: entry.label || '',
            m: (err && err.transport) ? 'تعذر تأكيد نتيجة الطلب — راجع السجل قبل إنشاء طلب جديد' : ((err && err.message) || 'تعذر الحفظ')
          });
```

### P1.4 — document the two new options

Find the JSDoc block above `save()` (it lists `modal`, `message`, `recordOf`, `onSuccess`, `onError`, `reload`, ~7640–7658) and add two rows in the same style:

```
   *   page      string    the owning page's action key; defaults to CURRENT_ACTION
   *   recordLabel string  Arabic name of the record, shown on the retry chip
```

### P1 DONE-CHECK

- `node tools/verify/parse_pages.js` passes (the file still parses).
- `node tools/verify/rt2_queue.js` and `node tools/verify/s18_live_saves.js` show no new failures against the saved output.
- Grep proves there is still exactly one `enqueue(` call site: `grep -c "enqueue({" UI_Components.html` → `1`.

Commit: `retry-chip P1: every queued write records the page that owns it`.

---

# P2 — the chip answers "is this my page?"

This is the visible fix.

### P2.1 — the ownership helpers

Insert this **immediately above** `function renderChip() {` (~7811), after the comment block that ends `able to scroll off the screen unnoticed.` and its `*/`:

```js
  /* ── [§P2] Whose failure is it? ───────────────────────────────────────────
   *
   * The queue is ONE localStorage key for the whole app — every company is an
   * ?action= on the same Apps Script URL, so they share an origin and a store.
   * That is right for the drain (§I4 needs one leader over one key) and wrong
   * for the chip, which was reading session-wide state and drawing a page-level
   * alarm from it. Storage stays global; rendering becomes page-scoped here.
   *
   * An entry with NO page stamp is treated as belonging to every page. That is
   * deliberate and it is not optional: entries written by the previous build
   * are already sitting in users' localStorage, and the one thing worse than a
   * chip on the wrong page is a failed write that has gone quiet.
   */
  function currentAction_() {
    try { return String(window.CURRENT_ACTION || ''); } catch (e) { return ''; }
  }

  function ownsPage(e) {
    var p = e && (e.page || e.p);       /* queue entries use .page, dead use .p */
    return !p || p === currentAction_();
  }

  function splitQueue() {
    var mine = [], elsewhere = [], deadMine = [], deadOther = [];
    queue.forEach(function (e) { (ownsPage(e) ? mine : elsewhere).push(e); });
    dead.forEach(function (e) { (ownsPage(e) ? deadMine : deadOther).push(e); });
    return { mine: mine, elsewhere: elsewhere, deadMine: deadMine, deadOther: deadOther };
  }

  /** The Arabic name of a page from COMPANY_PAGES. Never the raw action key:
   *  «تغيير لم يُحفظ في صفحة tc_products» is not a sentence for a user. */
  function pageLabel(action) {
    if (!action) return '';
    try {
      var pages = window.COMPANY_PAGES || [];
      for (var i = 0; i < pages.length; i++) {
        if (pages[i] && pages[i].action === action) return String(pages[i].label || '');
      }
    } catch (e) {}
    return '';
  }

  /** The single page every stranded entry belongs to, or '' when they differ
   *  or any of them is unstamped — in which case the chip stays generic and
   *  offers no destination, because it cannot name one truthfully. */
  function onePageOf(entries) {
    var p = '';
    for (var i = 0; i < entries.length; i++) {
      var q = String((entries[i] && (entries[i].page || entries[i].p)) || '');
      if (!q) return '';
      if (!p) p = q;
      else if (p !== q) return '';
    }
    return p;
  }
```

### P2.2 — replace `renderChip` entirely

**Find** the whole current function (~7811–7832), from `function renderChip() {` down to and including the closing `}` after the `if (dead.length) { ... }` block. **Replace with:**

```js
  function renderChip() {
    var s = splitQueue();
    var el = document.getElementById('uic-live-retry');
    var quiet = document.getElementById('uic-live-elsewhere');
    var mineN = s.mine.length;
    var deadMineN = s.deadMine.length;
    var otherN = s.elsewhere.length + s.deadOther.length;

    /* ── This page owns a stranded write: the alarm, as loud as it ever was. */
    if (mineN || deadMineN) {
      if (quiet && quiet.remove) quiet.remove();
      if (!el) {
        el = document.createElement('div');
        el.id = 'uic-live-retry';
        el.className = 'uic-live-retry';
        el.setAttribute('role', 'alert');
        document.body.appendChild(el);
      }
      var html = '';
      if (mineN) {
        var lbl = (mineN === 1 && s.mine[0].label) ? String(s.mine[0].label) : '';
        html +=
          '<span>' + (mineN === 1
            ? (lbl ? ('تعديل «' + esc(lbl) + '» بانتظار التأكيد') : 'طلب واحد بانتظار التأكيد')
            : (mineN + ' طلبات بانتظار التأكيد')) + '</span>' +
          '<button type="button" class="uic-live-retry-go" onclick="UIC.Live.retryNow()">إعادة المحاولة</button>' +
          '<button type="button" class="uic-live-retry-drop" onclick="UIC.Live.discardQueue()" ' +
          'title="تجاهل التغييرات غير المحفوظة">تجاهل</button>';
      }
      /* The queue line and its two buttons are rendered ONLY when there is a
         queue. Before this, a dead-letter-only state printed «0 طلبات بانتظار
         التأكيد» above an إعادة المحاولة that drained an empty queue and a
         تجاهل that returned at its own guard — a chip that could not be
         cleared by either button offered for clearing it. */
      if (deadMineN) {
        html += '<div>' + s.deadMine.map(function (d) {
          return '<div>' + esc(d.m) + ' (' + esc(d.a) + ')</div>';
        }).join('') + '<button type="button" onclick="UIC.Live.ackDead()">تم</button></div>';
      }
      el.innerHTML = html;
      return;
    }

    /* ── Nothing here, something elsewhere. Still impossible to miss, and it
     * no longer reads as this page's problem: neutral, role="status", and the
     * one action that helps is the one offered — go where the record is. There
     * is deliberately no إعادة المحاولة and no تجاهل on this chip; you act on
     * a record from the page that owns it. The drain keeps running regardless,
     * so a chip nobody clicks still clears itself when the network returns. */
    if (el && el.remove) el.remove();
    if (!otherN) { if (quiet && quiet.remove) quiet.remove(); return; }
    if (!quiet) {
      quiet = document.createElement('div');
      quiet.id = 'uic-live-elsewhere';
      quiet.className = 'uic-live-elsewhere';
      quiet.setAttribute('role', 'status');
      document.body.appendChild(quiet);
    }
    var stranded = s.elsewhere.concat(s.deadOther);
    var page = onePageOf(stranded);
    var label = page ? pageLabel(page) : '';
    var go = '<button type="button" class="uic-live-elsewhere-go" ' +
             'onclick="UIC.Live.goToStranded()">انتقل إليها</button>';
    if (page && label) {
      quiet.innerHTML = '<span>تغيير لم يُحفظ في صفحة ' + esc(label) + '</span>' + go;
    } else if (page) {
      quiet.innerHTML = '<span>تغيير لم يُحفظ في صفحة أخرى</span>' + go;
    } else {
      quiet.innerHTML = '<span>' + stranded.length + ' تغييرات لم تُحفظ في صفحات أخرى</span>';
    }
  }

  /** The quiet chip's button. Nothing is retried or discarded here — the user
   *  is simply taken to the page that can act on the record. */
  function goToStranded() {
    var s = splitQueue();
    var page = onePageOf(s.elsewhere.concat(s.deadOther));
    if (!page) return;
    var url = UIC.baseUrl() + '?action=' + encodeURIComponent(page) +
              '&sessionToken=' + encodeURIComponent(UIC.token());
    try { UIC.navTo(null, url); } catch (e) { window.location.href = url; }
  }
```

### P2.3 — the quiet chip's CSS

Inside the `const css = \`` template literal, **find** this line (~5823, the last line of the `.uic-live-retry` group):

```
  .uic-live-retry { flex-wrap: wrap; max-inline-size: min(92vw, 520px); }
```

**Append immediately after it:**

```
  /* [§P2] The same failure, seen from a page that does not own it. It keeps the
     shape and the position of the alert chip so it is noticed, and drops the
     danger colours and the alert role so it does not read as this page's
     alarm. Lower z-index than .uic-live-retry (9001): the two are mutually
     exclusive, and if a bug ever showed both, the alarm must win. */
  .uic-live-elsewhere {
    position: fixed; inset-inline-end: var(--space-4); inset-block-end: calc(var(--space-4) + 44px);
    z-index: 9000; display: flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--bg-sunken); color: var(--text-muted);
    border: 1px solid var(--border-color); border-radius: var(--radius-pill);
    font-size: var(--text-xs); font-weight: 700;
    box-shadow: 0 2px 10px rgba(0,0,0,.12);
    flex-wrap: wrap; max-inline-size: min(92vw, 420px);
  }
  .uic-live-elsewhere-go {
    background: none; border: 0; padding: 4px 8px; cursor: pointer;
    font: inherit; border-radius: var(--radius-sm);
    color: var(--brand-primary); text-decoration: underline;
  }
```

Every token used here (`--space-2/3/4`, `--bg-sunken`, `--text-muted`, `--border-color`, `--radius-pill`, `--radius-sm`, `--text-xs`, `--brand-primary`) is already defined in `CSS_Tokens.html` in both light and dark themes. Do not invent a new token.

### P2.4 — export the two new entry points

**Find** in the `UIC.Live` return object (~9010):

```js
    retryNow: retryNow,
    discardQueue: discardQueue,
    ackDead: ackDead,
    queued: function () { return queue.length; }
```

**Replace with:**

```js
    retryNow: retryNow,
    discardQueue: discardQueue,
    ackDead: ackDead,
    goToStranded: goToStranded,
    /* [§P5] The router keeps the chip across a soft navigation, so something
       has to tell it that ownership changed under it. */
    refreshChip: renderChip,
    queued: function () { return queue.length; },
    _splitQueue: splitQueue
```

### P2 DONE-CHECK

- `node tools/verify/parse_pages.js` passes.
- `node tools/verify/rt2_queue.js`, `node tools/verify/s18_live_saves.js`, `node tools/verify/ui2_themes.js` and `node tools/verify/rt6_router.js` show no new failures.
- `grep -c "uic-live-elsewhere" UI_Components.html` → at least `6` (two CSS rules, the id, the class, the getElementById, the button class).

Commit: `retry-chip P2: the alert belongs to the page that owns the record`.

---

# P3 — «تجاهل» stops destroying other pages' writes

This closes a real data-loss path: today a user on `tc_products`, silencing a chip about a product, empties the whole array and destroys a queued Valley Foods cash write they never saw.

### P3.1 — scope `discardQueue`

**Find** (~8957):

```js
  function discardQueue() {
    if (!queue.length) return;
    var n = queue.length;
    var ok = true;
    try {
      ok = window.confirm(n === 1
        ? 'سيتم تجاهل تغيير لم يُحفظ. متابعة؟'
        : ('سيتم تجاهل ' + n + ' تغييرات لم تُحفظ. متابعة؟'));
    } catch (e) {}
    if (!ok) return;
    queue.length = 0;
    persistQueue();
    renderChip();
  }
```

**Replace with:**

```js
  function discardQueue() {
    var n = splitQueue().mine.length;
    if (!n) return;
    var ok = true;
    try {
      ok = window.confirm(n === 1
        ? 'سيتم تجاهل تغيير لم يُحفظ. متابعة؟'
        : ('سيتم تجاهل ' + n + ' تغييرات لم تُحفظ. متابعة؟'));
    } catch (e) {}
    if (!ok) return;
    /* [§P3] Only this page's entries, and spliced IN PLACE rather than
       reassigned: `queue._call` is hung on the array as a property (see
       [RT-4b]), and `queue = queue.filter(...)` would silently drop it and
       with it the same-session drain for any entry that has no target_system.
       The count in the confirm is the count that is actually discarded. */
    for (var i = queue.length - 1; i >= 0; i--) {
      if (ownsPage(queue[i])) queue.splice(i, 1);
    }
    persistQueue();
    renderChip();
  }
```

### P3.2 — scope `ackDead`

**Find** (~8974):

```js
  function ackDead() {
    dead.length = 0;
    persistDead();
    renderChip();
  }
```

**Replace with:**

```js
  function ackDead() {
    /* [§P3] Acknowledging on behalf of a page you are not looking at is not an
       acknowledgement. Spliced in place, for the same reason as discardQueue. */
    for (var i = dead.length - 1; i >= 0; i--) {
      if (ownsPage(dead[i])) dead.splice(i, 1);
    }
    persistDead();
    renderChip();
  }
```

### P3.3 — say why `retryNow` is NOT scoped

**Find** (~8945):

```js
  /** Retry now, from the chip or from the network coming back. */
  function retryNow() {
```

**Replace with:**

```js
  /** Retry now, from the chip or from the network coming back.
   *
   * [§P3] This one is deliberately NOT page-scoped. The drain walks the queue
   * in array order because a queue that reorders writes corrupts a sequence of
   * edits (§I9), so a button that claimed to retry only this page's entries
   * would be describing something the drain does not do. It forces an immediate
   * pass over the whole queue, exactly as before, which is also what the
   * `online` event does. */
  function retryNow() {
```

### P3 DONE-CHECK

- `node tools/verify/rt2_queue.js` shows no new failures.
- Commit: `retry-chip P3: تجاهل discards only this page's unsaved writes`.

---

# P4 — one stuck entry stops degrading the whole app

`pendingCount()` is the global queue length, and it feeds the navigation guard and `userIsBusy()`. One stranded entry therefore makes **every** navigation anywhere in the app prompt «هناك تغيير لم يُحفظ بعد…» on pages where nothing would be lost, and permanently suppresses the live-change refresh app-wide.

### P4.1 — add `pendingHere()` and use it in the guard

**Find** (~7929):

```js
  function pendingCount() { return inFlight + queue.length; }

  function guardMessage() {
    var n = pendingCount();
    if (!n) return null;
```

**Replace with:**

```js
  function pendingCount() { return inFlight + queue.length; }

  /* [§P4] What is unsaved ON THIS PAGE.
   *
   * `inFlight` is always this page's: a request on the wire belongs to the
   * document that started it. Queued entries are filtered by owner, because
   * since [RT-4b] a queued entry is rebuilt from `target_system` and drains in
   * a LATER session — so leaving a different page cannot lose it, and warning
   * there is noise that teaches users to click through the warning that does
   * matter. On the owning page the wording and the behaviour are unchanged.
   *
   * pendingCount() stays as it is, and stays exported: it is the honest total. */
  function pendingHere() { return inFlight + splitQueue().mine.length; }

  function guardMessage() {
    var n = pendingHere();
    if (!n) return null;
```

### P4.2 — `userIsBusy` counts only this page

**Find** (~8166, inside `userIsBusy`):

```js
      if (pendingCount() > 0) return true;
```

**Replace with:**

```js
      if (pendingHere() > 0) return true;
```

There is exactly one occurrence of `pendingCount() > 0` in the file. Verify with grep before and after.

### P4.3 — export it

In the `UIC.Live` return object, **find**:

```js
    pending: pendingCount,
    guardMessage: guardMessage,
```

**Replace with:**

```js
    pending: pendingCount,
    pendingHere: pendingHere,
    guardMessage: guardMessage,
```

### P4 DONE-CHECK

- `grep -n "pendingCount()" UI_Components.html` shows it only inside `guardMessage`'s replacement is **gone**, and remains only at its definition and the `pending:` export.
- `node tools/verify/rt2_queue.js`, `node tools/verify/s20_quiet_refresh.js` and `node tools/verify/live_notice_client.js` show no new failures.
- Commit: `retry-chip P4: the nav guard and the refresh check count this page only`.

---

# P5 — the chip re-decides after a soft navigation

`UIC.Router` swaps the page body without a reload and deliberately keeps the chip element (`KEEP`, ~6967) so a warning is never taken off screen mid-swap. Nothing re-evaluates it after `window.CURRENT_ACTION` changes, so the alert is physically carried onto a page that does not own it.

### P5.1 — keep the quiet chip across the swap too

**Find** (~6967, inside `UIC.Router`'s `go()`):

```js
        var KEEP = /^(page-loading|uic-live-busy|uic-live-retry|uic-live-fresh|uic-home-fab|uic-toast-host)$/;
```

**Replace with:**

```js
        var KEEP = /^(page-loading|uic-live-busy|uic-live-retry|uic-live-elsewhere|uic-live-fresh|uic-home-fab|uic-toast-host)$/;
```

### P5.2 — re-render once the swap has settled

**Find** (~7002, at the end of `go()`'s success path):

```js
        try { UIC.wireNavPrefetch(); } catch (e) {}
        busy = false;
```

**Replace with:**

```js
        try { UIC.wireNavPrefetch(); } catch (e) {}
        /* [§P5] The retry chip is in KEEP above and survives this swap by
           design — removing it would take a live "not saved yet" warning off
           the screen. But ownership just changed under it, so it has to decide
           again whether it is this page's alarm or a pointer to another page.
           Called last, with CURRENT_ACTION set and the new body mounted. */
        try { if (UIC.Live && UIC.Live.refreshChip) UIC.Live.refreshChip(); } catch (e) {}
        busy = false;
```

`popstate` (~7014) calls `go(action, {replace: true})`, so back and forward are covered by this one call. Do not add a second one.

### P5 DONE-CHECK

- `node tools/verify/rt6_router.js` shows no new failures.
- Commit: `retry-chip P5: a soft navigation re-scopes the chip`.

---

# P6 — an entry stops being able to sit there forever

Two dead ends are why this bug is visible for days rather than seconds.

### P6.1 — rotate an unsendable head, and retire an old entry

**Find** (in `drainQueue`, ~7878–7887):

```js
    var entry = queue[0];
    var send = callFor(entry);
    /* An entry from a build that did not stamp target_system cannot be rebuilt
       and cannot be sent from this session. It is NOT dropped: the chip goes on
       saying it is unsaved, which is what it did before, and «تجاهل» is still
       the only thing that removes it. (Rotating it past the live entries would
       cost wire bytes this page does not have — headroom 601 B — so a legacy
       head still waits for the next drain event like it always has. Once any
       save in this session stamps queue._call, callFor drains it normally.) */
    if (!send) { renderChip(); return; }
```

**Replace with:**

```js
    /* [§P6] Find the first entry this session can actually send.
     *
     * An entry from a build that did not stamp target_system cannot be rebuilt
     * here. It is still never dropped — but it used to sit at the HEAD forever,
     * and `return` meant no entry behind it could ever drain either: one
     * unsendable write froze the queue and the chip until someone pressed
     * «تجاهل». It is now rotated to the back so the live entries get their
     * turn, and a pass that finds nothing sendable simply waits for the next
     * drain event (an `online` event, the next save, the next page load) — the
     * same wait as before, minus the blockage. Nothing is rescheduled here on
     * purpose: a timer that re-runs a pass with nothing to send is a loop. */
    var entry = null, send = null, pass = queue.length;
    while (pass-- > 0 && queue.length) {
      var head = queue[0];
      /* Past ENTRY_MAX_AGE it is not a pending retry any more, and calling it
         one is how the chip loses its meaning. Retired, named, acknowledged. */
      if (Date.now() - (Number(head.at) || 0) > ENTRY_MAX_AGE) {
        queue.shift();
        dead.push({
          a: head.action,
          p: head.page || '',
          c: head.target_system || '',
          l: head.label || '',
          m: 'طلب قديم لم يتأكد حفظه — راجع السجل قبل إعادة إدخاله'
        });
        persistQueue();
        persistDead();
        continue;
      }
      var fn = callFor(head);
      if (fn) { entry = head; send = fn; break; }
      queue.push(queue.shift());
      persistQueue();
    }
    if (!entry) { renderChip(); return; }
```

Note the shape: `var entry`/`var send` replace the two `var` declarations that were there, and `send(entry.action, entry.data)` below is unchanged. Do not leave a duplicate `var entry` in the function.

### P6 DONE-CHECK

- `node tools/verify/rt2_queue.js` shows no new failures.
- Commit: `retry-chip P6: an unsendable entry no longer blocks the queue`.

---

# P7 — the test

Write `tools/verify/rt11_retry_scope.js`, modelled **closely** on `tools/verify/rt2_queue.js`: same header-comment style explaining what is being protected and why, same `check(ok, label, extra)` helper, same `loadUIC(extra)` that extracts the single `<script>` and runs it in `makeSandbox` from `./domstub`, and `'use strict';`.

The stub already provides `localStorage`, `confirm` (returns true) and a DOM with `getElementById`, `appendChild` and `remove`. `makeSandbox(extra)` applies `extra` last and sets `sandbox.window = sandbox`, so the test sets the current page with `sandbox.CURRENT_ACTION = 'tc_products'` and supplies `COMPANY_PAGES` as `[{action:'tc_products',label:'الأصناف'},{action:'tc_sales',label:'المبيعات'}]`. Seed `erp_live_queue` / `erp_live_dead` by writing JSON into `sandbox.localStorage` **before** running the script, since `loadQueue()`/`loadDead()` run at load time.

It must assert, at minimum:

1. **The reported bug.** One `v:2` entry stamped `page:'tc_products'`. With `CURRENT_ACTION = 'tc_products'`: `#uic-live-retry` exists and contains `بانتظار التأكيد`. With `CURRENT_ACTION = 'tc_sales'` and `UIC.Live.refreshChip()`: `#uic-live-retry` is **gone**, `#uic-live-elsewhere` exists, its text contains `الأصناف`, and it contains **neither** `إعادة المحاولة` **nor** `تجاهل`.
2. **The record is named.** An entry with `label:'برميل 20 لتر'` renders `تعديل «برميل 20 لتر» بانتظار التأكيد` on its own page.
3. **Back-compat.** A `v:1` entry with **no** `page` renders the red alert chip whatever `CURRENT_ACTION` is. It must never be routed to the quiet chip and must never be invisible.
4. **`تجاهل` is scoped.** Two entries, `tc_products` and `vf_cash`. On `tc_products`, call `UIC.Live.discardQueue()`; then assert `UIC.Live.queued() === 1` and that the surviving entry is the `vf_cash` one, read back out of `localStorage.getItem('erp_live_queue')`. **This is the assertion that guards a data-loss bug — make it the strictest one in the file.**
5. **Dead-letter-only.** Queue empty, one dead letter for this page: the chip must **not** contain the string `0 طلبات`, must not contain `إعادة المحاولة`, must contain `تم`, and `UIC.Live.ackDead()` must clear it.
6. **The guard is scoped.** One entry stamped `tc_sales`, `CURRENT_ACTION = 'tc_products'` → `UIC.Live.guardMessage()` is `null` while `UIC.Live.pending()` is still `1`. Switch `CURRENT_ACTION` to `tc_sales` → `guardMessage()` is a non-empty string.
7. **Two pages at once.** Entries on `tc_products` and `vf_cash`, viewed from a third page → the quiet chip reads `2 تغييرات لم تُحفظ في صفحات أخرى` and offers no destination button.
8. **Escaping.** An entry whose `label` is `<img src=x onerror=1>` must not put a literal `<img` into the chip's `innerHTML`.

Then register it in `tools/verify/run_all.js`, immediately after the `rt10_telemetry.js` line, in the same format:

```js
  ['rt11_retry_scope.js', 'RT11 — the retry chip belongs to the page that owns the record'],
```

### P7 DONE-CHECK

- `node tools/verify/rt11_retry_scope.js` — every check PASS, exit 0.
- `npm run verify` — compared line by line with `tools/verify/results/retry_chip_baseline.txt`, **no new failures**, and `rt11` appears and passes.
- Commit: `retry-chip P7: rt11 pins the scoping, including that تجاهل cannot cross pages`.

---

## Final report

Post, in this order:

1. The diffstat (`git diff --stat master`).
2. `rt11_retry_scope.js` output in full.
3. The baseline-versus-now comparison of `npm run verify`: the failure count before, the failure count now, and the name of any check whose status changed **in either direction**.
4. Anything where the code differed from this prompt (a moved line, a name that was not what was quoted), with `file:line` and one sentence on what you did instead.
5. The one open question, verbatim, for the owner: **the `§11.1` note above `discardQueue` records that «تجاهل» is available to every user and that discarding a real write is the only remaining deliberate data-loss path. P3 narrows its blast radius to one page but does not close that question — should «تجاهل» require the same authority as deleting the record it would have created?**

## Do not

- Do not run `clasp push` or `clasp deploy`. Do not write to a Google Sheet or to Firestore. Do not call the network.
- Do not change `pendingCount()` itself, or remove it from the exports. Other code depends on the honest global total.
- Do not remove `uic-live-retry` from the router's `KEEP` list. Taking a live "not saved yet" warning off the screen mid-swap is the failure mode `KEEP` exists to prevent.
- Do not make the drain page-scoped. One queue, one leader, array order — §I4 and §I9.
- Do not make an unstamped (`v:1`) entry invisible on any page.
- Do not "tidy" anything this prompt does not name. The file is 10,000+ lines and shared by 89 pages; an unrelated edit here is a regression somewhere you cannot see.
