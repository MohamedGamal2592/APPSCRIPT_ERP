Execute the implementation plan at:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_PLAN.md

Working directory:
D:\Work\Script

Read the entire plan before making changes. Implement the code and verification—not another proposal.

OBJECTIVE

Change all application reads and writes for the ERP Information system tables to use their EXISTING Firestore collections.

The data is already in Firestore. Do not import, recopy, relocate, rename, rekey, or bulk-convert existing data.

Top Light, Top Chemical, Valley Foods, and Assessment Center must continue using their current company spreadsheets. Build the shared storage interface needed to support their future conversion, but do not convert their business tables now.

WORKING RULES

1. Inspect applicable AGENTS.md instructions and the current working files.
2. Inspect git status. Preserve all existing user changes and untracked files. Do not reset, restore, overwrite, or clean unrelated work.
3. Modify active root-level application files. Do not edit archived copies in Backup, src_html, or assessment center unless an actual deployment dependency requires it.
4. Follow the plan’s F0–F6 sequence. Maintain a concise checklist and record completed work, verification, and blockers.
5. Make routine implementation decisions independently. Ask only for information that cannot be established from code, existing configuration, or read-only inspection.
6. Keep progressing on independent work when an external dependency is unavailable. Never claim an unverified integration works.
7. Keep the implementation focused. Avoid unrelated refactoring, UI redesign, authentication replacement, or new infrastructure without a demonstrated requirement.

DISCOVER THE EXISTING CONTRACT

Inspect the deployed source paths and every ERP Information dependency, including direct Sheet/Range calls, shared company references, print routes, first-use initialization, error paths, and scheduled jobs.

Use available authorized access for read-only Firestore discovery. Inspect exact collection names, document IDs, business keys, field names, types, and query requirements. Redact sensitive values.

The local utilities suggest project erp-project-3cae0 and database (default); verify the actual configuration. Do not assume imported document IDs equal email, numeric ID, unique_id, or company UID.

Do not run copy_sheet_to_firestore.mjs or fix_firestore_date_types.mjs to change data.

IMPLEMENTATION REQUIREMENTS

Implement the shared configuration, storage interface, Firestore REST adapter, schema mappings, and system repositories described in the plan.

Keep Sheet/Range helpers available for current company business operations. Do not emulate arbitrary spreadsheet coordinates or formulas in Firestore.

Support:
- Typed value encoding/decoding and exact field-path handling.
- Existing document identity and business identifiers.
- Complete pagination and explicit ordering.
- Partial updates that preserve unrelated fields.
- Concurrency preconditions and transactional operations where appropriate.
- Safe create retries and stable operation identifiers.
- Explicit errors for missing configuration, unavailable backend, permission failures, duplicate keys, and conflicting edits.
- Backend/environment-scoped caches and reliable invalidation.
- Backend-aware metrics.

Preserve existing API action names and response shapes wherever possible. Keep credentials, access tokens, raw REST envelopes, and internal storage configuration out of client responses.

Convert ALL shared system workflows:
- Users, login, live account status, permissions, companies, branding, and system enablement.
- Sessions, devices, concurrent-session limits, revocation, expiry, and activity updates.
- Admin CRUD, page assignments, saved views, currencies, system invoices, and printing.
- Central history, audit queue, system/client logs, telemetry, cleanup, retention, backup integration, staging, and audit utilities.
- Shared ERP Information references inside company modules.

Preserve existing server-side access gates and the Assessment Center’s separate public candidate and local write contracts. Keep the independent MySQL integration operational.

SPECIAL CASES

Firestore does not execute GOOGLEFINANCE or other spreadsheet formulas. Implement the currency workflow specified in the plan: retain existing stored rates, enforce EGP = 1, provide controlled updates, and expose freshness accurately. Do not pretend automatic refresh exists without a configured provider.

Company spreadsheet writes and Firestore audit writes cannot be one atomic transaction. Implement honest, observable retry/failure behavior; do not claim cross-backend exactly-once guarantees.

Do not silently fall back to ERP Information Sheets when Firestore fails. Preserve the plan’s explicit authorization failure policies rather than accidentally changing them through empty-array defaults.

Do not expose a company backend switch that can activate an unsupported company implementation.

VERIFICATION

Run the existing verification suite before changes and record pre-existing failures. Add meaningful storage and integration tests, then run the affected checks and full regression suite.

Cover identity/type compatibility, multi-page queries, updates/deletes, concurrency, retries after uncertain commits, authorization, session revocation, cache freshness, company isolation, audit recovery, and scheduled jobs.

Instrument tests so accessing the old ERP Information spreadsheet fails while company spreadsheet access remains allowed. Exercise interactive, background, error, and first-use paths.

Use isolated emulator/staging data for integration writes. Verify IAM and indexes separately where actual access is available. Never use production business records as test fixtures.

DELIVERY

Complete local implementation and available verification. Prepare configuration, index, trigger, and deployment instructions. Do not deploy, alter production IAM, install production triggers, or mutate production data as part of this coding task.

Create:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_RESULTS.md

Record:
- Completed plan steps and changed files.
- Tests run, results, and pre-existing failures.
- Verified versus unverified Firestore configuration.
- Required operator configuration and deployment steps.
- Remaining blockers or limitations.

Finish with a concise summary of what was implemented, what was tested, and what remains before production activation. Do not mark the work complete if required functionality is still stubbed, silently skipped, or dependent on the old ERP Information spreadsheet.Execute the implementation plan at:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_PLAN.md

Working directory:
D:\Work\Script

Read the entire plan before making changes. Implement the code and verification—not another proposal.

OBJECTIVE

Change all application reads and writes for the ERP Information system tables to use their EXISTING Firestore collections.

The data is already in Firestore. Do not import, recopy, relocate, rename, rekey, or bulk-convert existing data.

Top Light, Top Chemical, Valley Foods, and Assessment Center must continue using their current company spreadsheets. Build the shared storage interface needed to support their future conversion, but do not convert their business tables now.

WORKING RULES

1. Inspect applicable AGENTS.md instructions and the current working files.
2. Inspect git status. Preserve all existing user changes and untracked files. Do not reset, restore, overwrite, or clean unrelated work.
3. Modify active root-level application files. Do not edit archived copies in Backup, src_html, or assessment center unless an actual deployment dependency requires it.
4. Follow the plan’s F0–F6 sequence. Maintain a concise checklist and record completed work, verification, and blockers.
5. Make routine implementation decisions independently. Ask only for information that cannot be established from code, existing configuration, or read-only inspection.
6. Keep progressing on independent work when an external dependency is unavailable. Never claim an unverified integration works.
7. Keep the implementation focused. Avoid unrelated refactoring, UI redesign, authentication replacement, or new infrastructure without a demonstrated requirement.

DISCOVER THE EXISTING CONTRACT

Inspect the deployed source paths and every ERP Information dependency, including direct Sheet/Range calls, shared company references, print routes, first-use initialization, error paths, and scheduled jobs.

Use available authorized access for read-only Firestore discovery. Inspect exact collection names, document IDs, business keys, field names, types, and query requirements. Redact sensitive values.

The local utilities suggest project erp-project-3cae0 and database (default); verify the actual configuration. Do not assume imported document IDs equal email, numeric ID, unique_id, or company UID.

Do not run copy_sheet_to_firestore.mjs or fix_firestore_date_types.mjs to change data.

IMPLEMENTATION REQUIREMENTS

Implement the shared configuration, storage interface, Firestore REST adapter, schema mappings, and system repositories described in the plan.

Keep Sheet/Range helpers available for current company business operations. Do not emulate arbitrary spreadsheet coordinates or formulas in Firestore.

Support:
- Typed value encoding/decoding and exact field-path handling.
- Existing document identity and business identifiers.
- Complete pagination and explicit ordering.
- Partial updates that preserve unrelated fields.
- Concurrency preconditions and transactional operations where appropriate.
- Safe create retries and stable operation identifiers.
- Explicit errors for missing configuration, unavailable backend, permission failures, duplicate keys, and conflicting edits.
- Backend/environment-scoped caches and reliable invalidation.
- Backend-aware metrics.

Preserve existing API action names and response shapes wherever possible. Keep credentials, access tokens, raw REST envelopes, and internal storage configuration out of client responses.

Convert ALL shared system workflows:
- Users, login, live account status, permissions, companies, branding, and system enablement.
- Sessions, devices, concurrent-session limits, revocation, expiry, and activity updates.
- Admin CRUD, page assignments, saved views, currencies, system invoices, and printing.
- Central history, audit queue, system/client logs, telemetry, cleanup, retention, backup integration, staging, and audit utilities.
- Shared ERP Information references inside company modules.

Preserve existing server-side access gates and the Assessment Center’s separate public candidate and local write contracts. Keep the independent MySQL integration operational.

SPECIAL CASES

Firestore does not execute GOOGLEFINANCE or other spreadsheet formulas. Implement the currency workflow specified in the plan: retain existing stored rates, enforce EGP = 1, provide controlled updates, and expose freshness accurately. Do not pretend automatic refresh exists without a configured provider.

Company spreadsheet writes and Firestore audit writes cannot be one atomic transaction. Implement honest, observable retry/failure behavior; do not claim cross-backend exactly-once guarantees.

Do not silently fall back to ERP Information Sheets when Firestore fails. Preserve the plan’s explicit authorization failure policies rather than accidentally changing them through empty-array defaults.

Do not expose a company backend switch that can activate an unsupported company implementation.

VERIFICATION

Run the existing verification suite before changes and record pre-existing failures. Add meaningful storage and integration tests, then run the affected checks and full regression suite.

Cover identity/type compatibility, multi-page queries, updates/deletes, concurrency, retries after uncertain commits, authorization, session revocation, cache freshness, company isolation, audit recovery, and scheduled jobs.

Instrument tests so accessing the old ERP Information spreadsheet fails while company spreadsheet access remains allowed. Exercise interactive, background, error, and first-use paths.

Use isolated emulator/staging data for integration writes. Verify IAM and indexes separately where actual access is available. Never use production business records as test fixtures.

DELIVERY

Complete local implementation and available verification. Prepare configuration, index, trigger, and deployment instructions. Do not deploy, alter production IAM, install production triggers, or mutate production data as part of this coding task.

Create:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_RESULTS.md

Record:
- Completed plan steps and changed files.
- Tests run, results, and pre-existing failures.
- Verified versus unverified Firestore configuration.
- Required operator configuration and deployment steps.
- Remaining blockers or limitations.

Finish with a concise summary of what was implemented, what was tested, and what remains before production activation. Do not mark the work complete if required functionality is still stubbed, silently skipped, or dependent on the old ERP Information spreadsheet.Execute the implementation plan at:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_PLAN.md

Working directory:
D:\Work\Script

Read the entire plan before making changes. Implement the code and verification—not another proposal.

OBJECTIVE

Change all application reads and writes for the ERP Information system tables to use their EXISTING Firestore collections.

The data is already in Firestore. Do not import, recopy, relocate, rename, rekey, or bulk-convert existing data.

Top Light, Top Chemical, Valley Foods, and Assessment Center must continue using their current company spreadsheets. Build the shared storage interface needed to support their future conversion, but do not convert their business tables now.

WORKING RULES

1. Inspect applicable AGENTS.md instructions and the current working files.
2. Inspect git status. Preserve all existing user changes and untracked files. Do not reset, restore, overwrite, or clean unrelated work.
3. Modify active root-level application files. Do not edit archived copies in Backup, src_html, or assessment center unless an actual deployment dependency requires it.
4. Follow the plan’s F0–F6 sequence. Maintain a concise checklist and record completed work, verification, and blockers.
5. Make routine implementation decisions independently. Ask only for information that cannot be established from code, existing configuration, or read-only inspection.
6. Keep progressing on independent work when an external dependency is unavailable. Never claim an unverified integration works.
7. Keep the implementation focused. Avoid unrelated refactoring, UI redesign, authentication replacement, or new infrastructure without a demonstrated requirement.

DISCOVER THE EXISTING CONTRACT

Inspect the deployed source paths and every ERP Information dependency, including direct Sheet/Range calls, shared company references, print routes, first-use initialization, error paths, and scheduled jobs.

Use available authorized access for read-only Firestore discovery. Inspect exact collection names, document IDs, business keys, field names, types, and query requirements. Redact sensitive values.

The local utilities suggest project erp-project-3cae0 and database (default); verify the actual configuration. Do not assume imported document IDs equal email, numeric ID, unique_id, or company UID.

Do not run copy_sheet_to_firestore.mjs or fix_firestore_date_types.mjs to change data.

IMPLEMENTATION REQUIREMENTS

Implement the shared configuration, storage interface, Firestore REST adapter, schema mappings, and system repositories described in the plan.

Keep Sheet/Range helpers available for current company business operations. Do not emulate arbitrary spreadsheet coordinates or formulas in Firestore.

Support:
- Typed value encoding/decoding and exact field-path handling.
- Existing document identity and business identifiers.
- Complete pagination and explicit ordering.
- Partial updates that preserve unrelated fields.
- Concurrency preconditions and transactional operations where appropriate.
- Safe create retries and stable operation identifiers.
- Explicit errors for missing configuration, unavailable backend, permission failures, duplicate keys, and conflicting edits.
- Backend/environment-scoped caches and reliable invalidation.
- Backend-aware metrics.

Preserve existing API action names and response shapes wherever possible. Keep credentials, access tokens, raw REST envelopes, and internal storage configuration out of client responses.

Convert ALL shared system workflows:
- Users, login, live account status, permissions, companies, branding, and system enablement.
- Sessions, devices, concurrent-session limits, revocation, expiry, and activity updates.
- Admin CRUD, page assignments, saved views, currencies, system invoices, and printing.
- Central history, audit queue, system/client logs, telemetry, cleanup, retention, backup integration, staging, and audit utilities.
- Shared ERP Information references inside company modules.

Preserve existing server-side access gates and the Assessment Center’s separate public candidate and local write contracts. Keep the independent MySQL integration operational.

SPECIAL CASES

Firestore does not execute GOOGLEFINANCE or other spreadsheet formulas. Implement the currency workflow specified in the plan: retain existing stored rates, enforce EGP = 1, provide controlled updates, and expose freshness accurately. Do not pretend automatic refresh exists without a configured provider.

Company spreadsheet writes and Firestore audit writes cannot be one atomic transaction. Implement honest, observable retry/failure behavior; do not claim cross-backend exactly-once guarantees.

Do not silently fall back to ERP Information Sheets when Firestore fails. Preserve the plan’s explicit authorization failure policies rather than accidentally changing them through empty-array defaults.

Do not expose a company backend switch that can activate an unsupported company implementation.

VERIFICATION

Run the existing verification suite before changes and record pre-existing failures. Add meaningful storage and integration tests, then run the affected checks and full regression suite.

Cover identity/type compatibility, multi-page queries, updates/deletes, concurrency, retries after uncertain commits, authorization, session revocation, cache freshness, company isolation, audit recovery, and scheduled jobs.

Instrument tests so accessing the old ERP Information spreadsheet fails while company spreadsheet access remains allowed. Exercise interactive, background, error, and first-use paths.

Use isolated emulator/staging data for integration writes. Verify IAM and indexes separately where actual access is available. Never use production business records as test fixtures.

DELIVERY

Complete local implementation and available verification. Prepare configuration, index, trigger, and deployment instructions. Do not deploy, alter production IAM, install production triggers, or mutate production data as part of this coding task.

Create:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_RESULTS.md

Record:
- Completed plan steps and changed files.
- Tests run, results, and pre-existing failures.
- Verified versus unverified Firestore configuration.
- Required operator configuration and deployment steps.
- Remaining blockers or limitations.

Finish with a concise summary of what was implemented, what was tested, and what remains before production activation. Do not mark the work complete if required functionality is still stubbed, silently skipped, or dependent on the old ERP Information spreadsheet. at:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_PLAN.md

Working directory:
D:\Work\Script

Read the entire plan before making changes. Implement the code and verification—not another proposal.

OBJECTIVE

Change all application reads and writes for the ERP Information system tables to use their EXISTING Firestore collections.

The data is already in Firestore. Do not import, recopy, relocate, rename, rekey, or bulk-convert existing data.

Top Light, Top Chemical, Valley Foods, and Assessment Center must continue using their current company spreadsheets. Build the shared storage interface needed to support their future conversion, but do not convert their business tables now.

WORKING RULES

1. Inspect applicable AGENTS.md instructions and the current working files.
2. Inspect git status. Preserve all existing user changes and untracked files. Do not reset, restore, overwrite, or clean unrelated work.
3. Modify active root-level application files. Do not edit archived copies in Backup, src_html, or assessment center unless an actual deployment dependency requires it.
4. Follow the plan’s F0–F6 sequence. Maintain a concise checklist and record completed work, verification, and blockers.
5. Make routine implementation decisions independently. Ask only for information that cannot be established from code, existing configuration, or read-only inspection.
6. Keep progressing on independent work when an external dependency is unavailable. Never claim an unverified integration works.
7. Keep the implementation focused. Avoid unrelated refactoring, UI redesign, authentication replacement, or new infrastructure without a demonstrated requirement.

DISCOVER THE EXISTING CONTRACT

Inspect the deployed source paths and every ERP Information dependency, including direct Sheet/Range calls, shared company references, print routes, first-use initialization, error paths, and scheduled jobs.

Use available authorized access for read-only Firestore discovery. Inspect exact collection names, document IDs, business keys, field names, types, and query requirements. Redact sensitive values.

The local utilities suggest project erp-project-3cae0 and database (default); verify the actual configuration. Do not assume imported document IDs equal email, numeric ID, unique_id, or company UID.

Do not run copy_sheet_to_firestore.mjs or fix_firestore_date_types.mjs to change data.

IMPLEMENTATION REQUIREMENTS

Implement the shared configuration, storage interface, Firestore REST adapter, schema mappings, and system repositories described in the plan.

Keep Sheet/Range helpers available for current company business operations. Do not emulate arbitrary spreadsheet coordinates or formulas in Firestore.

Support:
- Typed value encoding/decoding and exact field-path handling.
- Existing document identity and business identifiers.
- Complete pagination and explicit ordering.
- Partial updates that preserve unrelated fields.
- Concurrency preconditions and transactional operations where appropriate.
- Safe create retries and stable operation identifiers.
- Explicit errors for missing configuration, unavailable backend, permission failures, duplicate keys, and conflicting edits.
- Backend/environment-scoped caches and reliable invalidation.
- Backend-aware metrics.

Preserve existing API action names and response shapes wherever possible. Keep credentials, access tokens, raw REST envelopes, and internal storage configuration out of client responses.

Convert ALL shared system workflows:
- Users, login, live account status, permissions, companies, branding, and system enablement.
- Sessions, devices, concurrent-session limits, revocation, expiry, and activity updates.
- Admin CRUD, page assignments, saved views, currencies, system invoices, and printing.
- Central history, audit queue, system/client logs, telemetry, cleanup, retention, backup integration, staging, and audit utilities.
- Shared ERP Information references inside company modules.

Preserve existing server-side access gates and the Assessment Center’s separate public candidate and local write contracts. Keep the independent MySQL integration operational.

SPECIAL CASES

Firestore does not execute GOOGLEFINANCE or other spreadsheet formulas. Implement the currency workflow specified in the plan: retain existing stored rates, enforce EGP = 1, provide controlled updates, and expose freshness accurately. Do not pretend automatic refresh exists without a configured provider.

Company spreadsheet writes and Firestore audit writes cannot be one atomic transaction. Implement honest, observable retry/failure behavior; do not claim cross-backend exactly-once guarantees.

Do not silently fall back to ERP Information Sheets when Firestore fails. Preserve the plan’s explicit authorization failure policies rather than accidentally changing them through empty-array defaults.

Do not expose a company backend switch that can activate an unsupported company implementation.

VERIFICATION

Run the existing verification suite before changes and record pre-existing failures. Add meaningful storage and integration tests, then run the affected checks and full regression suite.

Cover identity/type compatibility, multi-page queries, updates/deletes, concurrency, retries after uncertain commits, authorization, session revocation, cache freshness, company isolation, audit recovery, and scheduled jobs.

Instrument tests so accessing the old ERP Information spreadsheet fails while company spreadsheet access remains allowed. Exercise interactive, background, error, and first-use paths.

Use isolated emulator/staging data for integration writes. Verify IAM and indexes separately where actual access is available. Never use production business records as test fixtures.

DELIVERY

Complete local implementation and available verification. Prepare configuration, index, trigger, and deployment instructions. Do not deploy, alter production IAM, install production triggers, or mutate production data as part of this coding task.

Create:
D:\Work\Script\FIRESTORE_READ_WRITE_IMPLEMENTATION_RESULTS.md

Record:
- Completed plan steps and changed files.
- Tests run, results, and pre-existing failures.
- Verified versus unverified Firestore configuration.
- Required operator configuration and deployment steps.
- Remaining blockers or limitations.

Finish with a concise summary of what was implemented, what was tested, and what remains before production activation. Do not mark the work complete if required functionality is still stubbed, silently skipped, or dependent on the old ERP Information spreadsheet.