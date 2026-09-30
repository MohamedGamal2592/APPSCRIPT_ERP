# erp_test — owner runbook

Everything in the plan that the agent cannot do: running Apps Script functions, writing to the Firestore system tables, `clasp push`, and watching production. The steps are listed in phase order. Send back the output named in each step.

Before step 1, pull the branch: `git pull origin claude/eloquent-edison-vute9i` (see the end of this file).

All scratch functions below go the same way:
1. Open the Apps Script project `1cQVRHYv7PltoPKV7RgkrdvLjVQHtrDLlRiWbY5Nd9P5UrY0SFnPYCCZM`.
2. Add a scratch file and paste the code in.
3. Run the named function.
4. Copy the execution log.
5. Delete the scratch file.

`tools/**` is in `.claspignore`, so none of these `.gs.txt` files is ever pushed.

## Local check first (any time)

```
npm run verify
```
The five erp_test checks (ET-STATIC, ET-MFG, ET-PARITY, ET-WRITE, ET-CLIENT) must show `OK`.

The run as a whole reports 33 failures. The untouched base commit `9995a62` has exactly the same 33, so none of them comes from this work.

## P1 — register the company (Firestore system tables)

1. **Dry run:** `node tools/erptest/register_system_rows.mjs`. It reads Firestore only and prints every document it would create. Check the list.
2. **Write:** `node tools/erptest/register_system_rows.mjs --write`.
3. **Bump versions:** in a scratch function, run `bumpVersion_('ERP_Companies'); bumpVersion_('ERP_Pages_Matrix'); bumpAuthGeneration_();`
4. **Assign users:** in ERP Management, assign the test users to company `37fc50edf1424abd` with a `Testing System …` role. Super admins need nothing.
5. **DONE-CHECK:** run the dry run again. It must print `0 documents to create`.

## P2 — sheet setup (Testing System spreadsheet)

1. Run `etSetupSheets_` from `tools/erptest/setup_sheets.gs.txt`. It:
   - adds the audit columns
   - creates `erp_test_manufacture_orders` and `erp_test_manufacture_lines`
   - creates the hidden `erp_test__packs`, `erp_test__journal` and `erp_test__meta` tabs

   It is idempotent. Send back the logged change list.
2. Run `etDiscoverChunked_` from `tools/erptest/discover_chunked.gs.txt` again and paste the whole log. The agent rebuilds `discovery.json` from it and re-runs the header-map check.

## P3–P7 — push the code, then prove it on the real sheet

1. `clasp push`. It pushes:
   - `Company_ErpTest_Schema.js`, `Company_ErpTest_Actions.js`, `Company_ErpTest_Registry.js`
   - 25 `Company_ErpTest_*.html` pages
   - `Company_ErpTest_Packs.html`
   - `Code.js` (2 insertions)
   - `.clasp.json`
2. **P3 check:** in a scratch function, run `etSchemaCheckRun_()`. The log must show `"ok":true`. Otherwise send `missingRequired`.
3. **P4 check:** open `?action=et_dashboard` as super admin. All 23 cloned pages must open, and products, customers, purchasing, sales, offers and cash must list. Add one product and one customer, and confirm the rows land in `erp_test_products` / `erp_test_customer_vendor`.
4. **P5 and P7 checks:** from `tools/erptest/tests.gs.txt`, run `etTestMfg_`, then `etTestStock_`. Each must end with `PASS`. They write test rows to the Testing System spreadsheet, never to Top Light.
5. **P6 check (T-UI, by hand):**
   1. Open `et_manufacture` and create an order with 2 lines.
   2. Use «تحميل خامات آخر أمر» on a new form.
   3. Approve the order, then complete it from the dialog.
   4. Print it.
   5. Confirm a Write-only user sees no تعديل / حذف / إلغاء buttons.

## P8 — parity proof

Run `etParity_` from `tools/erptest/parity.gs.txt`. It works on a Drive copy of Top Light, never on Top Light itself, and trashes the copy at the end. The log must show `"pass":true`. Otherwise send the first 10 diffs.

## P9–P11 — nothing to run until P12

The JSON layer ships switched off. `tools/erptest/flags.json` has every flag set to `false`.

## P12 — turn on, one flag at a time

Each step is the same: edit `tools/erptest/flags.json`, run `node tools/erptest/gen_actions.js`, then `clasp push`. The generator refuses an out-of-order combination.

1. **`ET_SJS_READ: true`**
   - Before pushing, note the `ERP_Perf_Log` timings of `get_et_sales_headers`, `get_et_parties` and `get_et_income_statement`.
   - After pushing, run `etParity_` again. It now checks every read twice (flag off and on) and must show `"pass":true`.
   - Watch the perf log for 3 days. The timings must go down.
2. **`ET_SJS_WRITE: true`** (keep `ET_SJS_READ: true`)
   - Install the triggers once from a scratch function:
     ```
     ScriptApp.newTrigger('etCompactJob_').timeBased().everyMinutes(15).create();
     ScriptApp.newTrigger('etReconcileJob_').timeBased().atHour(2).everyDays(1).create();
     ScriptApp.newTrigger('etOnSheetEdit_').forSpreadsheet('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE').onEdit().create();
     ScriptApp.newTrigger('etOnSheetEdit_').forSpreadsheet('1rdnnP3rMZTnoyyfG5V3X6w62AXatgIisZljkg0izJzE').onChange().create();
     ```
   - Watch for 7 days. Every `reconcile_<date>` row in `erp_test__meta` must show `"ok":true`.
3. **`ET_CLIENT_PACKS: true`**
   - Run T-CLIENT by hand: open Sales with DevTools network set to "Slow 3G". The list must paint before the sync finishes.
   - Log out and check that the IndexedDB database `erp_packs_…` is gone.
   - Sign in as another user on the same browser and check that the first user's data is not shown.

**Rollback:** set the flag back to `false`, regenerate, and push. The sheets are always the source of truth, and the pack and journal tabs can stay where they are.

## Getting the code onto your PC

```
cd D:\Work\Script
git fetch origin
git checkout claude/eloquent-edison-vute9i
git pull origin claude/eloquent-edison-vute9i
```
If `D:\Work\Script` has local changes, commit or stash them first with `git stash`.
