# Batch 2 — assignment job reports and controlled file release: release notes and Production approval requirements

Branch `batch2-job-reports-and-release` (on top of Production `main` = `270262e`). **Not deployed. Migration 0152 not applied anywhere except a throwaway local database. No Production data touched. No Staging.**

## Why the Founder saw no upload option (root cause, fixed)
On the Founder's own assignment the Files and Feedback sections were missing, not merely empty. The page decided what to show from the person's *payee classification* (contractor / vendor / model). The Founder is a staff member with admin roles, so he classified as "unclassified" and every external-workforce module was switched off; the upload endpoints applied the same rule and would have refused him ("File uploads are not available for this relationship type"). **Fix:** an accepted Creative Crew Support assignment always gets its own workspace (job report, files, feedback) for the person who accepted it, whatever their classification. Nobody else gains access: the check is "this engagement is a crew-support slot, the slot is accepted, and the signed-in person is its assignee".

## What the professional gets (My Workspace → My Assignments → the job)
1. **Job report** — *Confirm work performed & submit report*: date actually performed, optional actual start/finish, completed / partly completed / not performed, "went smoothly", a short **service-specific questionnaire** (photography/videography/production: punctuality, conditions, schedule change, client cooperation, equipment, editing still to do; design/content/branding: brief clarity, materials, revisions, approvals, how much is complete; a short generic set otherwise), incidents, client requests, additional services, outstanding work, remarks. The reporter and the submission time are recorded. A partial or not-performed report must say what was not done.
   * **Append-only versions.** A correction is a *new version* that names what it replaces and why; the original is kept and shown under "Earlier versions". Nothing is rewritten (database refuses UPDATE/DELETE even for server code).
   * **Internal.** Readable only by the reporter and administrators (enforced by row-level security, tested with a real user token); never shown to clients.
   * **No side effects.** Submitting does not complete the engagement or the client's project, create or pay a payable, change the CRM stage or send any email (asserted by test).
2. **Files** in the existing Files area, using the existing direct-to-storage uploader (no new storage system). Each upload is tagged *what it is*: sneak peek, **thank-you images**, edited selections, final gallery, video preview, final video, design draft, final design, other. Every file starts **private** and shows its state (Private → Submitted for review → Approved → Released; or Changes requested). The professional can submit one file with a client-facing title and description, or **submit all tagged files in one step**, resubmit after changes are requested, or withdraw from review.

## What management gets (Admin → Crew Support → the request → "Assignment work: reports & files")
* The professional's latest report with its earlier versions, and the files with their state.
* **Approve / Request changes / Decline** (a note is required to request changes or decline, and the professional sees it). Only **Super Admin or executive admin** can do this or release; the professional cannot approve or release their own files (tested).
* **Release selected to the client**: one action releases any number of approved files (e.g. a set of thank-you photographs) and produces **one** client-visible project update and, if the box is ticked, **one** professional "files ready" email with the secure portal link — not one per photograph. The email box is ticked by default and disabled for QA/test records. Releasing twice, or two people releasing at once, publishes each file exactly once (database unique index) and sends nothing further.
* Early thank-you images can be released while editing continues; each file is independent.

## What the client gets
* Released files appear in the **existing Files / Deliverables list** of the project (categories: Thank-You Images, Sneak Peeks, etc.), a **project update** in the existing Updates tab, and the existing *Files Ready* email (link to the project's Files page; no storage link).
* Files are opened/downloaded through an authorised route `/portal/client/files/<id>/download`: it checks the signed-in user can see that project's deliverable (row-level security), that the file is released and not purged, then redirects to a **60-second signed link** (add `?download=1` for a named download). Another client, a private file, a bad id or a signed-out visitor gets nothing. Every access is audited. There are no public or permanent links.

## Safeguards preserved
* Releasing files does **not** mark the engagement or project complete, advance the CRM stage, create or pay a crew payable, or touch any payment (asserted by test). Bright's verified payment and the QAR 1,000 unpaid crew payable are not touched by any code in this batch.
* Ghana Paystack, Qatar bank transfer, authentication and roles are untouched. No new module: this extends engagements, `project_files` + the `project-media` bucket, `deliverables`, `enquiry_notes`, the Files Ready email and the audit log.
* **Production grant gap respected**: Production's `service_role` cannot read/write `deliverables`, `deliverable_categories` or `enquiry_notes`; this code reaches them only through the signed-in user's session (RLS). A guard test fails if anyone changes that, and the isolated E2E reproduces the gap by revoking the same grants.
* **Defence in depth** (in the migration): a trigger refuses any change to the release columns by an ordinary signed-in session (the existing "staff manage" policy would otherwise let any staff member mark a file approved directly through the API). Only server code can change release state.
* No historical or test email goes to Bright: nothing is sent by deploying or migrating. An email is sent only when management clicks *Release* with the box ticked.

## Migration 0152 (additive; nothing existing is rewritten)
* New table `assignment_reports` (append-only, RLS read = reporter or administrator).
* `project_files`: 12 new nullable/defaulted release columns (`release_status` defaults to `'private'` for every existing row) and an index.
* `deliverables.project_file_id` (nullable) + unique partial index.
* 7 new `deliverable_categories` rows (`on conflict do nothing`).
* A guard trigger on `project_files`.
* Risk: low. Small tables; only metadata-only column additions; no data rewrite; no lock of any consequence. Existing code ignores the new columns, so the **old deployment keeps working after the migration** (migration can safely go first).
* Rollback `supabase/rollbacks/down_0152.sql` (guarded: refuses if any report/release data exists; tested both ways). A code-only problem needs no SQL — promote the previous Vercel deployment.

## Verification performed
* 3,674 unit/assertion tests pass (incl. questionnaire/validation, release state machine, grant guard); typecheck clean; lint 0 errors; compile build in an environment-free copy succeeds and includes the new route.
* **Isolated database E2E (21 tests, `assignmentWork.localdb.e2e.ts`) against a throwaway Postgres built from all migrations incl. 0152, with real per-user JWTs so RLS genuinely applies and Production's grant gap reproduced:** unclassified staff can upload to their accepted job; non-assignees refused; uploads private; report validation, versioning, append-only, privacy and no side effects; submit → approve → release with one update and one email; no double release (including a concurrent race); email suppressed for test records and when unticked; client download route (own client / other client / unreleased / purged / signed-out); direct-API tampering of release columns refused. The old gating fails 13 of these tests (confirmed). The two earlier E2E suites (Crew Support 26, bank transfer 27) still pass on fresh databases against the amended migration chain.
* Rollback verified on the throwaway database: refuses with data present, succeeds cleanly otherwise, and 0152 re-applies.

## Known limits (deliberate, for a later batch)
* A released file cannot be un-released from this screen. If one must be withdrawn, delete its entry in the existing Deliverables list on the enquiry (it disappears from the client; the file stays private in storage and its state remains "Released").
* No thumbnails are generated (the client list shows the standard placeholder; opening a file shows the image). No email/notification to management when a report or file is submitted (check the Crew Support page; adding a notification is a small follow-up).
* Reports have no separate management sign-off step; management reads them on the request page.
* Large files use the existing single-shot uploader (up to 5 GB, no resume).

## Approvals required (exact), in this order
1. **Migration.** *"Approved: temporarily link the Supabase CLI to Production, run `supabase db push --yes` to apply migration 0152 only (after a pre-check that 0151 is the latest applied), run the read-only fingerprint/grant checks, then unlink."* (No data is modified; the backup taken daily applies — no extra backup needed for an additive migration, say so if you want one anyway.)
2. **Deployment.** After the release commit is on the branch and you approve: *"Approved: run `git push origin batch2-job-reports-and-release:main` to deploy Batch 2 to Production via Vercel (fast-forward from `270262e`)."*
3. **Live use (Bright's photographs)** needs no further approval from me: you upload and submit; nothing is visible to Bright, and no email is sent, until **you** release. The first release will email Bright's address on file — untick the box if you prefer to tell him yourself.

## Post-deploy checks (read-only)
Vercel Ready; migration present in the history and `assignment_reports` / release columns exist; `service_role` can insert into `assignment_reports`; open the assignment and see **Job report** and **Files** with the category choice; (after you upload) the file shows *Private*; on the Crew Support page the file appears under review after you submit.
