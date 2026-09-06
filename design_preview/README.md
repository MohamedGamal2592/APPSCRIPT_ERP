# design_preview — the offline design harness

**Open `index.html` by double-clicking it.** No server, no build step, no network,
no Google account. It is a plain local page.

---

## Why this exists

This programme redesigns a production ERP that **nobody can open in a browser
until the owner pushes** — there is no staging environment and none will be
built. A static check can tell you a file parses. It cannot tell you the modal
is mirrored, the button is the wrong colour, or the table collapses on an iPad.

This page is the only visual verification the programme gets. If it is wrong, or
out of date, the programme is flying blind.

## What it shows you

Six iframes side by side, each at a **real device width**:

| Frame | Size | Tier (plan §0.4) |
|---|---|---|
| هاتف — طولي | 390 × 844 | `phone` |
| هاتف — عرضي | 844 × 390 | `phone`, landscape — triggers the low-height rule |
| تابلت — طولي | 768 × 1024 | `tablet-p` |
| تابلت — عرضي | 1024 × 768 | `tablet-l` |
| سطح المكتب | 1440 × 900 | `desktop` |
| شاشة عريضة | 2560 × 1440 | `wide` |

They are **iframes, not scaled divs**, and that distinction is the whole point: a
CSS `@media` query responds to the viewport it is in. A `<div>` shrunk with
`transform` still reports the full screen width and would prove nothing. Each
frame here reports its own true width to the stylesheet inside it. The frames are
then scaled down *visually* so all six fit on one screen — the percentage in each
caption tells you the visual scale, never the effective width.

Above the frames you can switch:

- **الشركة** — TopLight / TopChemical / ValleyFoods, the three real themes;
- **الاتجاه** — RTL (the app's primary direction) or LTR;
- **العرض** — all six frames, or one width blown up large;
- **القسم** — one component at a time, or everything.

## Where the content comes from

Everything rendered is the **real source**, never a copy:

| Shown | Read from |
|---|---|
| Tokens, resets, the type and spacing scales | `CSS_Tokens.html` |
| Every component — buttons, tables, modals, toasts, combos, forms, tiles, topbar, drawer | `UI_Components.html` |
| `API.*`, `FMT.*`, `UI.*`, `SESSION.*` | `Client_Helpers.html` |
| The three company themes | `03_Security.js` — the theme functions are **executed**, not transcribed |

They are extracted into `_sources.js` by:

```
node tools/build_preview.js
```

### It cannot silently drift

A hand-maintained copy of the design system would rot and become worse than no
preview at all. So `_sources.js` carries a fingerprint over the exact bytes of
those four files, and **`node tools/ui_check.js` check C9 FAILS while it is out
of date**. Either the preview matches the source, or the suite says so out loud.

The fingerprint is also printed in the page header, next to the title, so you can
see which build you are looking at.

**After pulling changes, or if the page looks stale, run `node tools/build_preview.js`.**

## The one place it differs from production

`google.script.run` — Apps Script's server bridge — does not exist here. It is
stubbed to do nothing, so anything that would fetch data resolves empty. The
preview therefore renders **components and layout faithfully** and **live data
not at all**. That is the intended trade: layout is what cannot be checked any
other way.

The gallery uses fixed sample rows so tables, sorting and the 50-row pager can be
exercised without a server.

## What to look at

Per phase, the results document carries a specific checklist. In general:

- **Every width, both tablet orientations.** A component that works at 1440 and
  breaks at 768 is not finished.
- **No horizontal scrollbar on the page body** at any width. Wide tables scroll
  inside their own container, never the page.
- **RTL first.** Modal titles on the right, Cancel/Save on the left, drawer from
  the right. Switch to LTR only to confirm nothing is hard-coded.
- **Tap targets stay 44–48px at every width**, including 2560 — a Windows machine
  can have a touchscreen.

## Files

| File | |
|---|---|
| `index.html` | The harness. **This is the one you open.** |
| `gallery.html` | The component gallery each frame loads. Not meant to be opened directly. |
| `_sources.js` | Generated. Never edit by hand. |
| `vf_mfg_batch.html` | The ValleyFoods manufacturing preview from the earlier Phase 2B run. Still valid; served over `http` rather than `file://`. |

Nothing in this directory is ever deployed: `.claspignore` excludes
`design_preview/**`, and `.clasp.json` sets `skipSubdirectories: true`.
