# Creative Crew Support file delivery — review, fixes and the independent-reviewer path

Branch `delivery-workflow-hardening` (off `main` = `866ffaf`); the independence work is the separate branch `delivery-independent-release`. **Nothing here is merged, migrated or deployed.** Bright's project (CSR-2026-000002) was not touched: only read-only queries were run against Production, and everything else ran on a throwaway local database with synthetic users and files.

## 1. What already worked (reviewed, reused, covered by the existing 25 isolated-database tests)

| Requirement | Where it lives | Evidence |
|---|---|---|
| Assigned professional uploads straight to storage, multiple files, per-file progress and errors, categorised at upload and again at submit | `MediaFileUploader`, `requestProjectFileUploadAuthorization`, `recordUploadedProjectFile` | assignmentWork A1–A3 |
| Private until submitted, reviewed and released; database refuses direct writes to release columns | migration 0152 guard trigger | assignmentWork C1–C2, E1 |
| Reviewer approves / requests changes (reason required) / declines; releases selected files; ONE client update and at most ONE email per release; email box off by default; never emailed for a test record | `fileReleaseFlow.ts`, `AssignmentWorkPanel` | C3–C5, C7 |
| Releasing does not mark the project Delivered/Completed, create a payable or touch payments (previews can go out while editing continues) | `deliverableStage.ts`, release flow | C6 |
| Client sees only released deliverables; downloads through an authorised, audited, 60-second signed link; another client, an unreleased file, a purged file and a signed-out visitor get nothing | download route | D1–D4 |
| The professional (even as Super Admin) cannot approve or release their own files | application check + `project_files_release_separation` constraint | F1–F4 |

## 2. What was missing or defective, and the fix (all on `delivery-workflow-hardening`)

| # | Finding | Fix |
|---|---|---|
| 1 | **Every dropped file started uploading at once.** A few hundred photographs would open hundreds of simultaneous uploads, overload the browser and connection and fail most of them. | A queue runs 3 at a time; shows "x of y uploaded · n still going · n failed"; "Retry all failed"; warns before the tab is closed mid-upload; a retry after a failed *save* no longer re-uploads (and orphans) the file; the kind and category are fixed when a file is added. Rules in `uploadQueue.ts` (5 unit tests). |
| 2 | **A professional could not remove a wrong or duplicate private upload** (no remove action existed). | `removeOwnPrivateFile`: only the assigned professional, only for a file they uploaded, only while private or sent back for changes; the stored copy is deleted, the record is kept (purged + withdrawn) and audited; submitted, approved and released files cannot be removed. 5 isolated-database tests (R1–R5). |
| 3 | **No way for a client to ask for a correction or report a delivery problem** (only Reschedule and Cancellation request types existed in Production). | Migration **0158** (data only): two request types, "Request a correction or retouch" and "Report a problem with a delivery", through the existing requests system; each deliverable now has "Request a correction" / "Report a problem" links that pre-select the type and name the file; staff respond with the existing decide-and-reply control; the delivery itself is never altered. 6 tests (Q1–Q6) incl. another client sees nothing and the deliverable is byte-identical afterwards. Rollback `down_0158.sql` refuses once a client has used the types. |
| 4 | Released photographs had only "Open"; no explicit save. | A "Download" link (forces a named download) next to Open for released files. |

## 3. Gaps that remain (not defects in what exists)

* **Post-delivery acceptance / follow-up / repeat booking: none exists.** The client can open, download, ask for corrections and report problems. There is no "I accept the delivery" step, no scheduled follow-up message and no "book again" action tied to a finished project (the dashboard has a generic "Book" button). Delivery is marked **Delivered** by management and **Completed** by management or the job report flow. If you want a client acceptance step, it should be a small addition on the Deliverables page recording who accepted and when.
* Released photographs show a category tile, not a thumbnail (a preview image would need a separate, lightweight thumbnail path so previews do not hit the audited download route repeatedly).
* Other administrators can read private project media through storage policy ("project-media: staff manage"). That is internal and invisible to clients, but it is wider than "only the assigned professional and reviewer".

## 4. Independence — your own and the backup account

**The defect found:** the separation rule compared account ids. Your backup Super Admin is a *different* profile, so it was **not** blocked from approving or releasing your photographs.

**Fix (branch `delivery-independent-release`, migration 0159, stacked on 0155/0156):** an account *linked* to the professional (through the existing `related_accounts` registry) is the same person for review and release — blocked in the application with a clear message, shown on the admin panel, **and in the database** by a trigger that also checks the assigned professional, uploader and submitter. 8 isolated tests (I1–I8) including: before the accounts are linked the backup is just another administrator (so the link must be recorded), direct database writes are refused, an unlinked administrator can still approve and release, and other people's work is unaffected. `down_0159.sql` removes it with no data touched.

**The registry must be filled once** — the two accounts of one person recorded as one `person_key`. Production has these privileged accounts (member numbers only): 0001 super_admin+admin; 0002, 0003 staff; CT0001 admin; and two with no member number (one super_admin+admin, one admin). Tell me which is your backup account (and any other account you hold) and I will record the link, with your approval.

**Shortest safe path to a genuinely independent reviewer:**
1. Approve and apply 0155 (Ghana funding; switches off) and 0156 (reviewer role), then 0159. All three are built and tested; nothing is nominated.
2. Enable TOTP two-factor sign-in in Production Auth (required for reviewers).
3. Choose a real person who is not you and not linked to you; you nominate them with a recorded reason and how independence was established, approve the exact permissions, and they accept the independence declaration with verified two-factor.
4. **One small build remains**: add a `file_release_review` scope (and a "files awaiting independent review" section on the reviewer page, with a database function that publishes the deliverable for a non-administrator) — because today the reviewer role covers funding approvals only, and publishing a deliverable needs an administrator's rights. Until then the practical independent reviewer for your own photographs is **any other, unlinked administrator** (0159 enforces that they are a different person).

Until an independent person exists, **Bright's photographs cannot be released by anyone** — which is exactly the intended behaviour; it is not a fault.

## 5. Production approval needed (nothing was applied)

* `delivery-workflow-hardening`: code + migration 0158 (data only: two request types). No schema change.
* `delivery-independent-release`: migration 0159, which requires 0155 and 0156 first.
