# AppSheet-style attachment opening

Implemented locally in D:\Work\Script. Not deployed and not verified against live Drive files.

## Behavior

All registered attachment pages use the same record-authorized file opener. It first uses a saved Drive file ID. If no ID is stored, it reads the exact AppSheet folder/filename path from the authorized record and resolves a unique file inside an allowed table folder. Opening an attachment does not create ID columns, migrate business records, or make files public. Existing authentication/audit logging remains unchanged.

A backfill is no longer required just to open a legacy path. The optional migration remains available to save durable IDs. A saved ID that is invalid or inaccessible produces an error rather than silently opening a different same-named file.

Known upload folders, the registered table's conventional _Files_ and _Images folders, and explicit historical aliases are accepted. Registration accepts both path prefixes, but maps registration_papers_Files_ to the actual Drive folder registration_papers 2_Files_, as confirmed by the user. Import approvals and manufacture images retain their configured per-field folders. The stored folder prefix, after applying any explicit configured rename, determines which allowed physical folder is searched; the resolver does not search alternative folders for a matching filename.

Missing/inaccessible folders, duplicate folders, duplicate filenames, unregistered folder paths, and nested/traversal paths are rejected. The deployer's Drive account must have access to the actual storage folder. Folder aliases support these naming conventions; they do not establish that a matching live folder exists.

## Coverage

| Table | Attachment fields |
|---|---|
| products | print_file |
| registration_papers | document_file |
| purchasing_support_data | document |
| legal_importation_follow | porforma_file, swift_file, approval_1, approval_2, approval_3 |
| legal_purchasing_costing | invoice_swift |
| legal_product_purchasing | شهادة_تحليل_ان_وجد, ترخيص_بالافراج_الزراعي, صورة الافراج, صورة التسجيل |
| legal_manufacture | analysis_certificate, sales_permit, technical_permit, registration |
| مكتب الجمارك | تكليف المطالبة, تخليص الشحنة |
| valley_emp_deductions | deduction_attachement |
| valley_emp_overtime | overtime_attachement |
| valley_employee_vacations | attachment |

Images and PDFs use the existing preview page; other files use the existing download page. Product print files retain their download behavior. Legacy doc_file links share the same authorization and path resolution. Ref-only links infer page/table only from an unambiguous registered folder. Multi-attachment records must select one field or exact reference.

## Changed files

- Code.js: shared folder configuration helpers, exact AppSheet path resolver, authorized generic/product file opening, consistent legacy page/table inference, optional migration using the same folder rules.
- Nine attachment page templates: registration, purchasing inputs, manufacture, carton sizes, customs, import follow-up, deductions, overtime, vacations. Links preserve both record ID and exact file reference where available, detecting stale/mismatched requests.
- tools/verify/appsheet_attachments.js: table-wide behavioral checks and execution of the actual page URL builders.
- tools/verify/attachment_download.js: existing identity/migration checks updated for the shared opener.
- tools/verify/run_all.js: both attachment suites registered.

## Verification

Passed:

- node --check Code.js
- node tools/verify/attachment_download.js
- node tools/verify/appsheet_attachments.js: 11 tables, 22 fields, 50 folder cases; real URL builders from all nine attachment pages; authorization denials; stale references; exact filename scoping; duplicate rejection; stored-ID precedence; images/PDFs/other downloads; legacy doc_file; product print files; no migration writes during opening.
- Inline JavaScript parsing for all nine attachment page templates.

The full offline suite completed with 73 of 79 groups passing. Six groups remain failing: s15_iphone_rest (older static expectations for inline download URLs/doc_file versus current URL variables/attachment routes), s16_attendance (CacheService assertion), s22_missing_template (wording plus missing handleLoginWithDevice_ fixture), vf_financial_reporting (missing consolidated module marker), ui2_breakpoints (income-statement max-width:650), rt5_budget (attendance page size ceiling). The new attachment behavioral suites pass. The broad suite is not green; these failures were not suppressed or asserted to be live attachment failures.

## Deployment and live verification

Deploy the current root project and update the existing versioned Apps Script web-app deployment. Code.js and the modified page templates must be deployed together. A source push alone does not update a versioned /exec deployment.

After deployment, sign in and open existing attachments from the normal ERP pages. No file rename, path rewrite, public sharing, or mandatory migration is needed for a supported legacy reference. Check at least one image, PDF, and other file plus the reported registration_papers_Files_/تسجيل توب وانTop One.document_file.103330.pdf. Verify with an account allowed to read that page. If a folder/file is missing or duplicated, inspect its actual Drive storage location rather than bypassing the error.

## Registration folder correction

Confirmed physical Drive folder: `registration_papers 2_Files_`. A stored `registration_papers_Files_/filename` resolves to that physical folder while retaining the original path in the record. Both the opener and optional migration apply this explicit alias. Syntax and both attachment suites pass, including a missing old-name folder and a same-named-file decoy in an old-name folder. Only root Code.js needs to be pushed for this correction, followed by updating the web-app deployment version. Not deployed by this task.
