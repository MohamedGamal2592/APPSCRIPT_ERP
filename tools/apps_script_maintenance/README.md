# Apps Script maintenance archive

This excluded directory preserves root-level utilities and one-off operational
modules that are not part of the nine-file deployment surface. Nothing under
this directory is loaded by `.clasp.json` or the verification runtime.

The files in `archived_root_sources/` are retained historical sources moved out
of the root during the company two-file consolidation. They may be loaded only
into a separate maintenance or staging Apps Script project when a human
operator explicitly needs them. They must not be added to the production push
order.

`TEMP_FirestoreAuthorization.js` remains here because live Firestore
authorization confirmation cannot be proven offline. Keep it out of
production permanently until that confirmation is independently completed.

The final deployed JavaScript surface is exactly:

`Code.js`, plus one `Company_<name>_Actions.js` and one
`Company_<name>_Registry.js` for Assessment, TopChemical, TopLight, and
ValleyFoods.
