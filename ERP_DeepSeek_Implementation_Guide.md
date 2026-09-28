This is a repository-aware implementation guide and a copy-ready prompt for your selected DeepSeek model. No model-specific capabilities are assumed. The repository inspection was read-only; this document does not authorize production execution, business-data cleanup, or deployment.

**Copy-ready implementation prompt**

Act as a Senior Full-Stack Engineer and Google Apps Script / AppSheet System Architect. Implement the following changes in the existing ERP repository, following the ordered guide below. Inspect current source before editing; the repository observations below are starting points, not substitutes for inspecting the current checkout.

Preserve the finalized Arabic/English UI, RTL/LTR behavior, component styles, and existing design-token names and structure. Change company-specific token values through the existing theme mechanism only. Do not redesign the application or introduce a UI framework.

Do not add or run unit tests. Do not run the repository's `npm run verify` suite. Use static checks, read-only inspection, and a documented manual acceptance checklist. Do not execute production writes as verification. Any write-based acceptance checks must use an already-authorized nonproduction environment or be performed during an explicitly authorized user workflow; do not seed business records for testing.

Do not add, rename, reorder, delete, or bulk rewrite business columns or records outside the precise allowlist below. Do not run generic setup/migration routines that create missing business schemas. Do not deploy or install live triggers as part of local code preparation. Produce reviewable changes and explicit operational steps.

Reuse the existing API dispatcher, authorization, attachment, theme, audit, request-idempotency, concurrency, and approval infrastructure. Keep credentials server-side. Identify any requirement that cannot be fulfilled under these constraints; do not conceal it with temporary storage or invented schema.

**1. Establish the actual implementation targets**

The inspected repository contains these relevant integration points:

| Concern | Existing implementation |
|---|---|
| Company/user administration | `0_ERP_Management.html`; `adminSaveCompany_`, `adminSaveUser_`, and their list handlers in `Code.js` |
| Company colors | `company_colors`; `getGenericCompanyThemeCSS_`, `getCompanyBlockTheme_`, `getCompanyThemeCSS_` |
| Company logo | `company_logo`; `getCompanyLogoUrl_`, dashboard and print consumers currently using Drive IDs |
| Shared UI | `UI_Components.html`, `Client_Helpers.html`, `CSS_Tokens.html`; existing `API.call` and `UIC.navTo` paths |
| Authentication | `authenticateSystemUser_`, `userDirectory_`, `authGeneration_`, `bumpAuthGeneration_`, `SessionManager_` |
| Session refresh | Existing `get_erp_session_meta` route; inspect its response and callers before extending it |
| Backups | `resolveBackupSources_`, `runDailyBackup_`, `dailyBackupJob_`, `installDailyBackupTrigger_` |
| Saved views | `User_Views.html`, shared UI helpers, `list_user_views` / `save_user_view`, `SYSTEM_TABLE_SCHEMAS_` |
| SOP form | `Company_ValleyFoods_QualitySops.html`; quality section in `Company_ValleyFoods_Actions.js` |
| SOP persistence | Page/action `vf_quality_sops` maps to `valley_quality_sops` and `valley_quality_sop_versions`; cover fields are JSON inside existing `template_meta` |
| Approval policy | Existing `approvalChains_`, `requestApprove_`, `approveStep_`, company policies and quality-specific workflows |

Root source files are the deployed implementation. `.claspignore` excludes `src_html`, `Backup`, tooling, design previews, and the old AppSheet export. Inspect deployment configuration before changing any generated mirror. Do not modify archived copies to make searches appear clean.

System storage supports Firestore and defaults to it in the inspected configuration; company business storage is Google Sheets. Confirm the deployed setting without exposing credentials. Do not assume an auth spreadsheet is the authoritative user database. Spreadsheet copies do not back up authoritative Firestore collections.

**2. Apply a strict schema and data allowlist**

| Target | Permitted implementation |
|---|---|
| `ERP_Users.is_active` | Add this exact field/column, with only `Active` or `Inactive` values. Preserve existing columns. |
| `ERP_Companies.company_colors`, label `الألوان` | Keep the same storage field; change its editor, serialization, validation, and theme consumption. |
| `ERP_Companies.company_logo`, label `معرّف الشعار` | Keep the same storage field; store a relative attachment path on a successful user-requested logo upload. |
| SOP Arabic cover fields | Update existing JSON metadata during an authorized draft save; no new physical columns. |
| `ERP_System_Backups` | Reuse its existing operational log schema: `backup_id`, `source`, `file_id`, `created_at`. Do not add fields or auto-create a missing table silently. |
| `ERP_User_Views` | Remove application schema definitions and all executable feature dependencies. Preserve stored rows/collections/sheets; physical deletion is not authorized by the code-cleanup request. |
| Chatter / notifications | Reuse a suitable existing persistent service/schema if available. No new tables, collections, or repurposed audit storage without an explicit scope amendment. |

The inspected user records use `company`, not `company_id`. Normalize the specification's logical `company_id` to the existing `company` field in a DTO/adapter. Do not add a second company column or rename the existing field. For SOPs, obtain the record's company through the authenticated company/database context where no row column exists.

For the `is_active` migration, append a missing Sheet header once or add the field in the authoritative Firestore documents using existing adapters and concurrency controls. Initialize only missing values: recognized legacy `status = Active` becomes `Active`; legacy inactive, missing, or invalid values become `Inactive`. Report counts and ambiguous records in a read-only dry run first. Preserve existing valid `is_active` values; flag invalid nonempty values instead of overwriting them. Never rewrite legacy `status` as part of this migration. After cutover, `is_active` is the sole active-state authority; legacy consumers receive a derived compatibility value rather than reading an independent status source.

**3. Implement `الألوان` as an EnumList-style editor**

Reuse the existing multi-select component, or add an accessible multi-select using existing `UIC` field styling. Show bilingual labels and color swatches with textual names. Store stable allowlisted color identifiers, not translated labels or arbitrary CSS.

Prefer the existing comma-separated format because current theme helpers already parse it. Identifiers must not contain commas. Preserve selection order: first value is the primary brand color; second retains the existing surface/background preference; additional values are available to existing accent slots. Document any unused values. Prevent accidental alphabetic sorting, since it would change the selected primary color.

Example normalizer; adapt names to existing helpers:

```js
function normalizeCompanyColors_(input) {
  var allowed = ['red', 'green', 'yellow', 'black', 'white'];
  var values = Array.isArray(input) ? input.slice() : String(input || '').split(',');
  var seen = {};
  return values.map(function (v) { return String(v).trim().toLowerCase(); })
    .filter(function (v) {
      if (!v) return false;
      if (allowed.indexOf(v) < 0) throw new Error('INVALID_COMPANY_COLOR');
      if (seen[v]) return false;
      seen[v] = true;
      return true;
    });
}
// Write only during an authorized company save:
// company_colors = normalizeCompanyColors_(payload.company_colors).join(', ');
```

If existing records contain JSON arrays, add a read adapter for those records before enabling writes. Do not rewrite every company's value. Empty selection should preserve the existing default theme behavior.

Use the existing theme values, including `--brand-primary`, `--brand-primary-hover`, `--brand-subtle-bg`, `--brand-border`, and `--btn-text-color`. Preserve the normal canvas/surface tokens unless the existing company configuration already selects the supported dark branch. Ensure company-specific theme overrides and block themes do not bypass the selected palette.

Apply contrast to resolved opaque colors, after mapping names to the existing palette:

```js
function relativeLuminance(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('INVALID_HEX_COLOR');
  var rgb = hex.slice(1).match(/../g).map(function (part) {
    var c = parseInt(part, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrastRatio(a, b) {
  var x = relativeLuminance(a), y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function readableText(background) {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff')
    ? '#000000' : '#ffffff';
}
```

Populate the existing foreground token with the selected result. Check normal, hover, selected, focus, muted-text, and badge states; choosing a primary button foreground alone does not guarantee the entire view. Require at least 4.5:1 for normal text and 3:1 for large text. For gradients, check the actual background range; endpoints alone are insufficient. Use an existing solid text-bearing surface where necessary. These thresholds and the luminance calculation follow [W3C contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum).

After company save, invalidate company/theme caches and return resolved theme values to refresh the currently open view. Other sessions should pick up the changed company version through the existing refresh channel. Reset company-specific overrides when switching companies so styles cannot leak between views.

In AppSheet, if this field is actively exposed there, configure `EnumList` with Text base type, the same allowed identifiers, and other values disabled. Verify an actual AppSheet save/read round trip before relying on identical serialization. AppSheet supports multi-select through [EnumList](https://support.google.com/appsheet/answer/10107878?hl=en). The custom HTML theme mechanism does not automatically alter native AppSheet branding.

**4. Replace the `معرّف الشعار` editor with a secure image upload**

Use the existing attachment component and upload transport. The file input must use:

```html
<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg">
```

The `accept` attribute is only a picker hint. Validate the extension, MIME type (`image/png` or `image/jpeg`), decoded byte size, and PNG/JPEG file signature on the server. Reject SVG, GIF, WebP, mismatched extensions, malformed data, and oversized payloads. Reuse the existing upload size policy; make a proposed limit explicit if no policy exists. Standard JPEG MIME is `image/jpeg`, including files with `.jpg` and `.jpeg` extensions.

Server upload sequence:

1. Authenticate the session and recheck active status; require company-administration permission for the target company.
2. Resolve the attachment root from trusted server configuration. Never accept a caller-supplied Drive root or arbitrary file ID as authorization.
3. Generate a collision-resistant filename, for example `Companies/<company_uid>/Logos/<uuid>.png`.
4. Create the file privately and persist only that relative path in `company_logo` after a successful upload/save. Keep the previous logo until the replacement save succeeds.
5. Use existing request idempotency to avoid duplicate uploads on retry. Handle failed saves through the established attachment cleanup policy, not broad Drive deletion.
6. Invalidate logo/dashboard/theme metadata and refresh the preview.

A relative path is an attachment identifier, not a browser URL. The custom frontend must call an authenticated resolver, which rechecks company access, verifies the path belongs to that company's configured root, and returns image bytes through the existing attachment transport. For small logos, a protected RPC returning validated MIME and base64 bytes can feed a client-created Blob URL; revoke old Blob URLs when replaced. Do not assume Apps Script can stream arbitrary binary image responses through `ContentService`.

For AppSheet over Sheets, place attachments relative to the parent location of the table's spreadsheet and configure the field as `Image`. Keep image/file URL signing enabled. AppSheet relative-path resolution is documented in [image and file guidance](https://support.google.com/appsheet/answer/10107317?hl=en).

Update every logo consumer, including dashboard, header, invoice and SOP print rendering. A legacy Drive ID may remain readable through a narrow authenticated compatibility resolver; all new uploads must use relative paths. Do not bulk convert stored IDs or make files public. Removing that compatibility path requires a separately planned data migration.

**5. Enforce `ERP_Users.is_active` at every access boundary**

The inspected authentication path currently uses a cached user directory and deliberately falls back to session authority on directory failure. That behavior cannot satisfy the requested revocation guarantee. Change it so missing, inactive, or unreadable authoritative active status never authorizes a protected request. A temporary lookup failure should produce an `AUTH_UNAVAILABLE` response and temporarily block protected UI, while a confirmed inactive account returns `ACCOUNT_DISABLED` and clears the session.

Use this server hook contract; the adapter names below are proposed, not existing functions:

```js
function requireCurrentActiveUser_(sessionToken) {
  var session = SessionManager_.validate(sessionToken);
  if (!session.valid) throw new Error('SESSION_INVALID');
  // Implement a direct authoritative lookup: no stale active-status cache.
  var user = readAuthoritativeUserUncached_(session.email);
  if (!user) throw new Error('ACCOUNT_REMOVED');
  if (user.is_active !== 'Active') throw new Error('ACCOUNT_DISABLED');
  return user;
}
```

Integrate this logic with `authenticateSystemUser_` rather than adding a competing authentication stack. Run it before dispatching protected `doGet`, `doPost`, RPC, page-body, download, attachment, and company-action requests. Validate identity from the server session, never from a request email. Login must also reject inactive users. Preserve narrow public login/bootstrap routes and verified trigger execution paths; do not expose business endpoints by classifying them as public.

Choose and report the actual consistency guarantee:

- **Strict next-request rejection:** one small authoritative status lookup on each protected request. Cache profile, labels, and other non-authoritative data. Memoize the verified result within that one execution. This is the default required by the specification.
- **Cached alternative:** only acceptable if the user explicitly accepts bounded staleness or all status writes are controlled by a proven synchronous revocation mechanism. A cache TTL, cached generation, or asynchronous edit trigger alone is not immediate enforcement.

On an authorized status change, validate exact enum values, commit the canonical field with concurrency protection, invalidate existing directory/authority caches, revoke existing sessions when setting `Inactive`, and signal the client refresh channel. Do not report success before the authoritative write commits. Cache or notification failure must not restore access; subsequent requests still check canonical status. Protect the last active super-admin from accidental removal under the existing account-management policy.

Every supported writer—admin UI, import, AppSheet action, and API—must target the same authority. Do not update only a spreadsheet mirror while Firestore remains authoritative. Apps Script edit triggers are supplemental: script/API writes do not cause them to fire, as documented under [installable-trigger restrictions](https://developers.google.com/apps-script/guides/triggers/installable).

For writes already in flight, revalidate immediately before their side effects. If the requirement includes atomic exclusion of all writes racing with deactivation, implement a transaction/shared coordination boundary covering both the status change and mutation, or explicitly report the cross-system limitation; a separate status read and Sheet write are not atomic.

Client integration:

1. Extend the centralized `API.call` response handler to intercept inactive/removed/expired-session responses before page-specific rendering.
2. Gate `UIC.navTo`, SPA routing, direct page loads, and browser-history restoration. Revalidate on focus/resume and before protected navigation.
3. Use one shared refresh loop per active app shell, merging session status and notification cursors where possible. Reuse existing realtime lifecycle cleanup; do not create one poller per page.
4. For a confirmed invalidation, stop protected background work, clear session and company caches, clear sensitive rendered state, dismiss privileged dialogs, and show bilingual account-disabled guidance. Notify other same-origin tabs with `BroadcastChannel` or a storage event; this is a local optimization, not cross-device security.
5. Discard stale in-flight responses after invalidation. Offline or unverifiable clients cannot perform protected navigation or writes; pause protected operations until revalidated.

Apps Script polling provides bounded client detection, not instantaneous server push. Propose a measured interval based on concurrency and quota budget; for example, five seconds while visible is a candidate, not a guaranteed SLA. Poll cost is roughly `active tabs × 60 / intervalSeconds` executions per minute before normal traffic. If an already configured authenticated push service exists, reuse it for prompt notification, but keep server status checks authoritative. Native AppSheet offline/sync behavior cannot guarantee immediate removal of cached pages: see [AppSheet sync behavior](https://support.google.com/appsheet/answer/10107724?hl=en). Report this limitation rather than claiming an `Editable_If` expression revokes access.

**6. Extend the daily backup job**

Keep the existing handler and log schema. Change source enumeration from only the hardcoded company registry to all linked database spreadsheets discoverable through the existing configuration: company records, registered module links, and the auth/management spreadsheet where relevant. Deduplicate by spreadsheet ID, include disabled companies whose databases remain linked, and report unresolved sources. Do not scan unrelated Drive folders.

Use a configured `ERP_BACKUP_FOLDER_ID` in Script Properties, validated as accessible by the trigger owner. Resolve by ID rather than the existing first-folder-with-matching-name behavior. If absent, stop with a clear configuration error; do not silently choose a destination.

During trigger installation, remove only duplicate triggers for `dailyBackupJob_` owned by the installing account, preserve unrelated triggers, and create:

```js
ScriptApp.newTrigger('dailyBackupJob_')
  .timeBased()
  .atHour(2)
  .nearMinute(0)
  .everyDays(1)
  .inTimezone('Africa/Cairo')
  .create();
```

Retain the existing verified-trigger entry guard. Run installation from the authorized script owner context after required scopes are granted. Other owners' duplicate triggers need an operational inventory because one account cannot assume it sees every owner's triggers.

This schedules approximately 02:00 Cairo time; `nearMinute(0)` has a documented ±15-minute window. Exact 02:00 execution cannot be promised with this mechanism. [ClockTriggerBuilder documentation](https://developers.google.com/apps-script/reference/script/clock-trigger-builder).

The copy operation should use a real ISO 8601 timestamp, for example:

```js
var stamp = new Date().toISOString();
var sourceFile = DriveApp.getFileById(source.spreadsheetId);
var copy = sourceFile.makeCopy(sourceFile.getName() + '__' + stamp, backupFolder);
```

Use a job lease or lock to prevent overlapping runs. Do not hold a script lock around the entire job and then call `appendBackupLogRow_` if it reacquires the same lock; restructure locking or use a short-held lease. Record each source's completion through existing log columns and operational metadata; retries should resume missing sources without silently duplicating completed copies. A copy success followed by log failure must retain the copy ID for recovery.

Continue after individual source failures, but expose the job as partial/failed and log actionable diagnostics. Plan resumable batches if the source count exceeds an execution's runtime budget. Preserve formulas, sheets, formatting, and spreadsheet structure through full file copies. Separate copies taken sequentially are not a transactionally consistent snapshot across all databases, and referenced Drive attachments are not embedded backups.

Do not introduce retention deletion. The inspected `dailyBackupJob_` currently invokes a ten-day purge: decouple that destructive step from the requested copy-only daily job unless separately authorized. If Firestore is authoritative for system data, clearly label this result a spreadsheet backup; a Firestore export and attachment backup are separate scope items.

**7. Remove `ERP_User_Views` completely from active code**

Remove its schema registration, special ID-generation cases, handlers, API registrations, page registrations, template includes, navigation items, saved-view controls, serializers, and fetch calls. Known starting points include `Code.js`, `User_Views.html`, `Client_Helpers.html`, and `UI_Components.html`.

Trace callers before deleting shared helpers. Preserve generic filtering, sorting, grouping, and column behavior when these serve the active page independently of saved views. Remove the saved-view persistence feature, not unrelated table functionality.

Search by aliases as well as the table name: `ERP_User_Views`, `User_Views`, `user_views`, `list_user_views`, `save_user_view`, `layout_json`, and relevant feature symbols. Inspect active migration/setup/import tools and AppSheet configuration for schema recreation, slices, actions, references, bots, and workflows. Remove dependent active definitions in the correct order. Read-only historical exports cannot prove the live AppSheet configuration has been updated; report any live configuration steps still outstanding.

Do not delete physical tables/collections or business rows. Do not repurpose the removed table as chatter storage. Exclude archived backups, this guide, and historical reference exports from the executable-reference acceptance scan, while documenting that exclusion.

**8. Build the global chatter panel with an explicit persistence dependency**

Mount one persistent slide-over panel in the shared shell outside the route-replacement container. Main views pass only a validated context `{companyId, recordType, recordId}`. Preserve drafts by context within the session and maintain panel open state across SPA navigation. Do not put sensitive drafts in shared local storage without an existing approved policy.

Reuse existing tokens, controls, iconography, and stacking rules. Use logical positioning such as `inset-inline-end`; support RTL/LTR, mobile widths, keyboard entry, Escape, focus return, and screen-reader announcements. If the drawer is modal, trap focus while open; otherwise retain normal access to the page. Do not re-create it or attach duplicate listeners on every navigation.

Use three views in the same panel: conversation, assigned approvals, and mentions. Source approvals from existing approval workflows, including their current status and action permissions. Read-only approval aggregation must not alter business records. Any approval action must call the established workflow with its existing concurrency and authorization checks.

Proposed API contracts, to be adapted to the existing dispatcher:

| Operation | Input | Required behavior |
|---|---|---|
| `chatter_list` | authorized context, opaque cursor, bounded limit | Read durable comments after checking company and record access |
| `chatter_post` | context, plain-text body, selected mention identities, request ID | Validate, persist idempotently, then enqueue/deliver notifications |
| `mention_candidates` | context, search query | Return only eligible active identities with minimum public profile fields |
| `approval_inbox` | cursor, limit | Read pending tasks from existing workflow authority |
| `notifications_delta` | cursor | Return only the caller's unread items and counts |
| `notification_read` | notification ID | Update only the caller's allowed read state |

Use existing stable user identity—email is the current system key—and display the user's name. `@username` should be an autocomplete interaction backed by that key, not a new username column. Resolve duplicate names through a name-plus-email label. Validate submitted identities server-side; plain-text regex matching alone cannot establish a recipient. Being unassigned to a company does not grant access to its records.

Render comments as text, not raw HTML. Enforce body and mention limits, company isolation, record access, sender permissions, and recipient access on the server. Notifications should carry minimal previews and protected deep links. Deduplicate by comment/event and recipient; retries must not send duplicate alerts. Approval assignment notifications must arise from successful workflow transitions, not speculative UI actions.

Prefer in-app badges using the shared refresh channel. Push/email are optional only where an existing authorized capability and durable delivery mechanism are available. Do not add email scopes or configure a new push provider merely to satisfy an optional transport. Do not claim a notification was delivered if it was only queued.

**Persistence finding:** the inspected system schemas expose audit/history/session collections, but no general comment/mention/notification store was identified. Quality SOP events are domain-specific and must not be used as a system-wide chatter database. Verify whether another approved service exists before implementation. If none exists, the persistent posting and read-state features are blocked by the no-new-schema constraint. Implement independent panel/approval-reading work, and report a concrete dependency proposal; do not create the store or label localStorage/CacheService a durable solution.

A scope-amendment proposal can describe logical requirements—comment identity/context/body/author/time, recipient notification/delivery/read state, idempotency keys and cursors—without creating tables or choosing new infrastructure. If permission is granted later, map these requirements into the chosen service, implement durable delivery/retries, and complete the remaining feature.

**9. Update the `vf_quality_sops` cover form**

Keep the exact Arabic labels and existing storage locations:

| Arabic label | Existing JSON location |
|---|---|
| `اسم المُعِد` | `template_meta.prepared_by.name` |
| `وظيفة المُعِد` | `template_meta.prepared_by.position` |
| `اسم المراجع 1` | `template_meta.reviewed_by[0].name` |
| `اسم المراجع 2` | `template_meta.reviewed_by[1].name` |

Replace the preparer text input with a searchable single-select using existing UI components. Return eligible users from a dedicated server projection of `ERP_Users`: key, name, role, and logical company ID only. Never return hashes, salts, session tokens, or the complete admin user DTO.

Eligibility is exactly:

```js
user.is_active === 'Active' &&
(logicalCompanyId(user) === currentRecordCompanyId || logicalCompanyId(user) === '')
```

Normalize IDs as trimmed strings. The current company must come from the authorized record/storage context, not unchecked request data. The existing `qSopOwnerOptions_` filters to company-only users; create or adapt a preparer-specific projection so this change does not unintentionally alter owner rules elsewhere.

Use the stable user key as the submitted selector value and display `name — email` to resolve duplicates. On selection, populate `وظيفة المُعِد` from that user's exact `role`, not the logged-in user's role. On save, re-resolve and revalidate the selected user, then write the name and role snapshots into the existing metadata. Do not trust client-submitted role text. Do not silently conflate the preparer with the existing SOP owner.

Keep the selected key in form/request state. Persist a preparer identity in JSON only if the current metadata contract already supports one; adding a JSON property is still a data-contract change that must be assessed against scope. For historical metadata containing only a name, never guess between duplicate users: show the saved snapshot and require explicit selection when changing the preparer.

Automatically fill reviewers using the existing company's approval assignments/routing rules, if those identify concrete users. Do not pick the first two active users, infer reviewers from alphabetical order, or assume an approver role uniquely identifies a person. If routing provides roles with multiple eligible people, require the established assignment resolution. If no mapping exists, define an explicit company-to-reviewer configuration contract in existing code/configuration and report the missing identities; do not invent personnel. Reviewers must be active and authorized for that record.

Autofill applies to new drafts or an explicit refresh/change workflow. Do not rewrite historical published versions merely because directory names or roles change. Use the existing revision check when saving, preserve all unrelated metadata keys, and keep SOP print rendering aligned with the stored snapshot. Do not call header-creation helpers that add unrelated missing SOP columns under this task.

Where a live AppSheet form exposes equivalent stored selector fields, use an Enum with Ref base type to the actual `ERP_Users` key and a searchable dropdown. After mapping logical names to actual columns, an example `Valid_If` for this repository's user schema is:

```appsheet
SELECT(
  ERP_Users[email],
  AND(
    [is_active] = "Active",
    OR(
      ISBLANK([company]),
      [company] = [_THISROW].[company_id]
    )
  )
)
```

`[_THISROW].[company_id]` is a logical placeholder: replace it with the actual existing record-company expression. Do not add that column to make the example compile. A Ref-backed selector can derive the role with `[اسم المُعِد].[role]` only if that column really stores the referenced key. This expression cannot be pasted into the current JSON-backed HTML form. Preserve draft snapshot behavior instead of recalculating historical published roles through a universal App formula.

Add editable bilingual microcopy in an existing UI configuration object or source dictionary, without business columns. Reuse an existing admin content editor if available; otherwise make clear that “editable” means configuration-editable, not a new runtime CMS. Render helper text through text escaping and connect it using `aria-describedby`.

Example entries:

| Section | Arabic | English |
|---|---|---|
| Preparer | اختر مستخدمًا نشطًا تابعًا لهذه الشركة أو غير مرتبط بشركة. تُملأ وظيفة المُعِد تلقائيًا من دوره المسجل. | Select an active user from this company or an unassigned user. The preparer's role fills automatically. |
| Reviewers | تُملأ أسماء المراجعين وفق إعدادات الاعتماد الخاصة بالشركة. | Reviewer names are filled from the company's approval settings. |
| Procedure content | اكتب خطوات الإجراء بترتيب التنفيذ، وحدد المسؤول عن كل خطوة. | Write the procedure in execution order and identify who performs each step. |
| Revision | لخّص التغييرات في هذه المراجعة قبل إرسالها للاعتماد. | Summarize this revision's changes before submitting it for approval. |

Add guidance under every actual form section after inspecting its structure; the examples are not an exhaustive section inventory.

**10. Deliver in dependency order and verify without unit tests**

Implementation order: inspect and map storage → prepare the narrowly scoped status migration → server access guards → client session/navigation guards → company fields and attachments → backups → saved-view removal → SOP behavior → chatter persistence integration or explicit dependency report → manual acceptance.

Deliver a file-by-file change summary, allowed schema diff, migration dry-run procedure, operational trigger/AppSheet steps, API contracts, known limitations, and rollback instructions. Clearly label implemented, manually verified, pending operational steps, and blocked scope. Do not claim the complete project is finished while durable chatter, reviewer assignments, or live AppSheet configuration remain unresolved.

Manual acceptance checklist:

- Arabic and English layouts retain their baseline typography, spacing, navigation, tokens, and directionality.
- Multi-select values round-trip without losing order; contrast is checked across visible text states; switching companies clears old theme values.
- Valid PNG/JPEG upload and relative-path rendering work in company, dashboard, and print views; invalid content is rejected; cross-company attachment access is denied.
- Inactive accounts fail login, protected API requests, navigation, uploads, and downloads; active sessions on two devices detect revocation; stale responses cannot restore protected UI. Measure server rejection and client detection separately.
- Directory-read failure blocks authorization safely; reactivation does not silently resurrect revoked sessions; direct AppSheet/API writer behavior matches the documented authority model.
- Backup inventory includes every linked spreadsheet exactly once; existing sources are unchanged; copies use ISO timestamps in the configured folder; failures are visible; trigger timing is described accurately.
- No executable saved-view routes, controls, schema recreation, or workflow references remain. Physical historical data remains intact.
- Preparer options include active same-company and unassigned users only; duplicate names remain distinguishable; role autofill is server-validated; reviewer mappings are deterministic; published snapshots remain unchanged.
- Chatter, once durable storage is available, persists across reloads/devices, isolates companies and records, preserves authorized approval behavior, and deduplicates mentions/notifications. Otherwise record this explicitly as blocked.

Rollback should revert application code/configuration and disable only the newly installed backup trigger if needed. Preserve the added `is_active` data, existing business rows, prior logo files, and created backup files. Coordinate migration-aware rollback so an older application does not bypass deactivated accounts by returning to the legacy `status` authority.
