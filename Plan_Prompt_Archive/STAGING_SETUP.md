# Staging environment — setup runbook

**Status: BLOCKED ON OWNER.** Every step here needs your Google account. The code side
(`08_Staging.js`, the `AUTH_SPREADSHEET_ID` script-property switch in `00_Config.js`) is done and
committed; nothing below has been executed.

**Why this exists:** Phase 0, Step 2 of `PERFORMANCE_EXECUTION_PLAN.md`. Phases 2–4 change write
paths and formulas on live invoice and costing data. None of that should be validated in production.

---

## The one fact that makes this cheap

There is **exactly one hardcoded spreadsheet id** in the whole codebase:
`CONFIG.AUTH_SPREADSHEET_ID` in [00_Config.js](00_Config.js). Every company database is resolved at
runtime from `ERP_Companies.company_sheet_link` by `getCompanySpreadsheetId_`
([03_Security.js](03_Security.js)). So redirecting that single value, plus the `company_sheet_link`
rows inside the copied AUTH spreadsheet, redirects the entire system.

That value now resolves as:

1. Script Property `AUTH_SPREADSHEET_ID`, if set
2. otherwise the literal in `00_Config.js` (the production id)

**Production needs no property set.** Staging sets the property. Identical source can be pushed to
both projects, and a staging id can never be committed into production code.

---

## Step 1 — Build the copies (run once, in the PRODUCTION project)

In the Apps Script editor of the production project, run:

```
stagingCreateEnvironment()
```

It will:

- create a Drive folder `ERP_STAGING`
- copy the AUTH spreadsheet to `STAGING_AUTH`
- copy every company spreadsheet listed in `ERP_Companies` to `STAGING_<CompanyName>`
- rewrite `company_sheet_link` **inside the staging AUTH copy** to point at the staging company copies
- clear `ERP_Sessions` in the staging copy

It **only reads** production. The only sheets it writes to are the copies it just made.

It returns `stagingAuthId` — **write this down**, you need it in step 3.

> In-file formulas survive a Drive copy. Cross-file `IMPORTRANGE` does not: it needs re-authorising
> and re-pointing at the staging copies. The Phase 0b inventory (`inventorySpreadsheets()`) reports
> whether any `IMPORTRANGE` exists — run it first if you want to know in advance.

## Step 2 — Create the staging script project

1. New Apps Script project (any name, e.g. `ERP STAGING`).
2. Copy its script id from Project Settings.
3. Locally, create `.clasp.staging.json` — **do not commit it**, and do not overwrite `.clasp.json`:

```json
{
  "scriptId": "<STAGING_SCRIPT_ID>",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [
    "00_Config.js",
    "01_Registry.js",
    "02_DataAccess.js",
    "03_Security.js",
    "05_Admin.js",
    "Code.js"
  ],
  "skipSubdirectories": true
}
```

4. Push to staging **only**:

```
clasp push --project .clasp.staging.json
```

Verify the output does not mention the production script id
`1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM`.

## Step 3 — Flip the switch (STAGING project only)

Project Settings → Script properties → add:

| Key | Value |
|---|---|
| `AUTH_SPREADSHEET_ID` | the `stagingAuthId` from step 1 |

**Do not add this property to the production project.**

## Step 4 — Keep MySQL out of staging

Leave `MYSQL_USER` and `MYSQL_PASSWORD` **unset** in staging. `dbGetConnection_` then throws a clear
configuration error instead of connecting to production MySQL at `164.92.143.177/topchemicalpest`.

> **This did not actually work before this run.** `DBLIVE_CONFIG.props` held *values* where Script
> Property *key names* belong — `user: 'appscript_user'`, `pass: 'YourStrongPassword123!'` — so the
> connector looked up properties literally named `appscript_user` and `YourStrongPassword123!` while
> every error message named `MYSQL_USER` / `MYSQL_PASSWORD`. Fixed in this run (F-25), with a
> fallback to the legacy key names so an existing install keeps working. **Two consequences for you:**
> if MySQL currently works in production, its credentials are stored under those legacy names and
> should be migrated to `MYSQL_USER` / `MYSQL_PASSWORD` at your convenience; and
> `YourStrongPassword123!` was sitting in source — if that string was ever a real password, rotate it.

## Step 5 — Test users

Create a couple of users per company in the staging AUTH copy covering each role level. Passwords in
`ERP_Users` are hashed with `CONFIG.SESSION_SALT`, so production hashes carry over — but use
throwaway staging accounts rather than real ones.

## Step 6 — Prove the isolation before trusting it

In the **staging** project, run:

```
stagingVerifyIsolation()
```

Expected: `safeForStaging: true`, `resolvedAuthSpreadsheetId` = your staging id (not
`1CmPxWAt8DYbXovgeofHpqe5MVaz1dQCzpqJvWP00HOM`), and every `companyTargets` entry pointing at a
`STAGING_*` copy.

Then do it manually as well: deploy the staging web app, save one record through the UI, and open the
**production** sheet to confirm it did not change. Do this before trusting staging for anything.

---

## Checklist

- [ ] `stagingCreateEnvironment()` run; `stagingAuthId` recorded
- [ ] Staging Apps Script project created; `.clasp.staging.json` written (uncommitted)
- [ ] `clasp push --project .clasp.staging.json` succeeded
- [ ] Script Property `AUTH_SPREADSHEET_ID` set in staging **only**
- [ ] `MYSQL_USER` / `MYSQL_PASSWORD` (and the legacy names) unset in staging
- [ ] Test users created
- [ ] `stagingVerifyIsolation()` returns `safeForStaging: true`
- [ ] Manual isolation test passed: staging save left production untouched
