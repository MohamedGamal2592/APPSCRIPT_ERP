# Attachment download repair — Luna 5.6 execution prompt

Implement the attachment download repair directly in `D:\Work\Script`, preserving unrelated uncommitted work. Read `PROJECT_MAP.md` first. Root-level source is deployable; do not edit archived copies as runtime source.

Fix the user-visible error `Attachment download is temporarily unavailable pending an immutable record/file association.` The current root handler should resolve an authorized record and allowed attachment field to a durable Drive file ID. Do not use an unrelated request-reference cache or global filename fallback. Explicit IDs are authoritative; mismatched or missing records, fields, companies, pages, and references must fail clearly. Legacy ref-only downloads may use exact stored references only when they resolve to one record; basename-only and ambiguous matches must fail. Duplicate Drive folders/files must not select the first result.

Repair the dry-run-first admin migration `backfill_attachment_ids`: count proposed associations even when ID columns are absent, report missing/invalid/ambiguous records individually, never overwrite verified IDs, support bounded `offset`/`limit` reruns, and check for concurrent changes before applying. Keep it authenticated and super-admin-only; do not run it against production in this local task.

Ensure uploads return a real Drive ID and saves cannot silently drop attachment IDs. Bind client-supplied IDs to the exact recent upload reference, preserve existing permissions, and clear stale IDs when an attachment is removed. Cover Top Chemical and Valley Foods attachment callers, legacy `doc_file`, print files, image/PDF previews, and other file downloads.

Create a focused fake-service regression harness for exact-reference matching, explicit-record authority, mismatched/cache-safe downloads, duplicate folder/file rejection, missing-column dry-run counts, and no-write dry-run behavior. Run syntax-only checks and the focused harness only. Do not access or modify company data, deploy, publish, or run production migration. Document actual changes, checks, and remaining deployed-version/live-data uncertainty in `ATTACHMENT_DOWNLOAD_FIX_RESULTS.md`.
