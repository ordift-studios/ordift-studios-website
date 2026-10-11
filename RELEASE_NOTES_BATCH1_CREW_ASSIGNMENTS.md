# Batch 1 — release notes and Production approval requirements

Branch `batch1-assignments-and-delivery-guard` (on top of Production `main` = `aa1a104`). **Not deployed.** No migration. No Production data change. No Staging.

## Contents
1. **Delivery-stage guard (defect fix).** Publishing a deliverable no longer advances an enquiry to "delivered" unless it is a final-output category (`edited-photos`, `final-videos`, `gallery-links`, reserved `final-gallery`/`final-designs`) **and** the enquiry is not a Creative Crew Support job. Previously any category (even a call sheet or invoice) did. The "Files Ready" email and activity log are unchanged.
2. **My Assignments.** A visible *My Assignments* entry under Admin Platform → My Workspace (shown only to people who have offers/assignments) and renamed in the portal header; one shared list with groups (waiting for response / accepted and active / closed), and for each job: project, role, reference, service, dates, location, status and next action. Resolved from the signed-in person's own assignee id, never from role, so Super Admin access neither adds nor hides jobs. Existing detail and engagement pages are reused; route `/portal/crew-offers` is unchanged so existing emails and links keep working.
3. **Login CAPTCHA recovery** (commit `62383b4`): the Turnstile reset no longer throws after a failed sign-in; widget re-challenges in place.
4. **Exchange-rate save feedback** (commit `62383b4`): visible success/error, pending-disabled button, duplicate protection for an identical rate within a minute; history untouched.

## Verification
Unit and assertion tests (full suite 3,654 passing), typecheck and lint clean, compile build in an environment-free copy. The Turnstile root cause was reproduced on the live login page.

## Deployment approval required (exact)
> Approved: run `git push origin batch1-assignments-and-delivery-guard:main` to deploy the Batch 1 release commit to Production via Vercel (fast-forward from `aa1a104`; no migration, no data change).

Post-deploy checks (read-only): Vercel Ready; live pages return 200 / redirect to login; **Founder** opens My Workspace → My Assignments and Bright's assignment; tries a wrong-password login to confirm the CAPTCHA re-challenges; (optional) re-saving an existing rate shows the "already saved" message.

## Rollback
Promote the previous Production deployment in Vercel (no database change to undo).

## Not in this batch
Job-completion reporting and the secure deliverables workflow (both need migrations and separate approvals); email delivery-status tracking; client milestone feed.
