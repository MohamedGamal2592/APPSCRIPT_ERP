# ValleyFoods purchasing checkpoints — implementation results

## Risk callout

This change was implemented with **zero automated test execution**, as required by the implementation plan. No server write path, `clasp` execution, deployment, or business-row mutation was invoked. A real staging sheet and browser acceptance pass were not available in this run; staging confirmation is therefore the top-line owner risk before production rollout.

## What changed

- Added `save_valley_purchasing_header_checkpoint` and `save_valley_purchasing_lines_checkpoint` to the ValleyFoods page-access and table-watch maps.
- Added server handlers that preserve the existing cost-grant and approved-record guards, use natural document-key re-runnability, write audit history, and batch line replacement with one range write.
- Added purchasing-form section controls and a page-local FIFO queue. Header acknowledgement gates line sends; checkpoint requests are fire-and-continue with per-section status/toasts.
- Final `حفظ` now waits for queued checkpoints. The server first performs a read-only checkpoint-match verification and returns the existing record without rewriting; changed-after-checkpoint payloads fall back to the existing full validation and final commit path.
- The existing purchasing report remains read-only and date-filtered; its live-watch path now observes the purchasing tables through the completed action map.

## Evidence matrix (static reading only)

| Requirement | Status | Evidence |
|---|---|---|
| Header checkpoint action and write grant | Satisfied | `Company_ValleyFoods_Actions.js` PAGE_ACCESS; `Company_ValleyFoods_HR_Modules.js` checkpoint handler/registration |
| Lines checkpoint action and write grant | Satisfied | Same files; line table mapping is `valley_product_purchasing` |
| Purchasing watch-gap fill | Satisfied | `ACTION_TABLES` entries for costing, report, options, lines, checkpoints, delete, and approvals |
| Cost-grant refusal on both checkpoints | Satisfied by reading | `purchasingCheckpointHeader_` and `purchasingCheckpointLines_` call `vfCanSeeCost_` before writes |
| O(1) section reads/writes | Satisfied by reading | Bulk `getAllRecords_`/`getValues` plus one `setValues` matrix; line deletion uses `deleteRowsByCriteria_` |
| Non-blocking checkpoint flow | Satisfied by reading | `checkpointHeader`/`checkpointLines` enqueue and return; `drainCheckpointQueue` sends asynchronously |
| Header-before-lines ordering | Satisfied by reading | `__headerCheckpointAck` gate and FIFO `__checkpointQueue` |
| Final commit waits for checkpoints and avoids duplicate rewrite | Satisfied by reading | `waitForCheckpointDrain()` plus `purchasingCommitAlreadyApplied_()` |
| Runtime authority, retry, rename, and cross-device behavior | UNPROVEN | Requires owner staging/browser checks; no tests or deployment were run |

## Owner checklist before rollout

- Confirm a staging copy exists and exercise read-only, write-without-cost-grant, and super-admin roles.
- Verify header completion remains responsive while lines are entered, and that section toasts distinguish success/failure.
- Verify airplane-mode interruption, retry, double-click, rename, delete-before-checkpoint, and cross-device refresh behavior.
- Confirm shared visibility of an in-progress unapproved purchase is accepted under the no-schema decision.
