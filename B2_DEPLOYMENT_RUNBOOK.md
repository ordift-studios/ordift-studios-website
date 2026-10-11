# B2 readiness reminders — Production deployment runbook (for your authorisation, step by step)

Branch `b2-readiness-reminders` (head contains the review `B2_DEPLOYMENT_READINESS_REVIEW.md`). **Nothing below has been run.** Each numbered step is a separate authorisation; approving one does not approve the next. All reminder modes stay **Off** until you change them. Bright is never enrolled.

## 0. Pre-flight facts (read-only, 12 Oct 2026)

| Check | Result |
|---|---|
| Production migrations applied | up to 0153; 0154 not present; no 0154 tables |
| Readiness enrolments in Production | 0; Bright (CSR-2026-000002) not enrolled, and its start has passed so it cannot be |
| `origin/main` vs the branch | `origin/main` = d33e00c, contained in the branch (fast-forward) |
| Vercel Production environment variable **names** | `CRON_SECRET` present; **`RESEND_WEBHOOK_SECRET` absent**; `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `FORMS_SENDING_ENABLED`, `NEXT_PUBLIC_SITE_URL` present (values never read) |
| GitHub repository | public, default branch `main`; Actions secrets present: Sanity variables only — **no `CRON_SECRET`, no `READINESS_*` variables**; I could not read the repository's Actions policy (token lacks permission) |
| Resend webhooks | Third-party sources say webhooks exist on the free plan; **confirm in your Resend dashboard** |

## 1. Push the branch (authorisation 1)

```bash
git push origin b2-readiness-reminders
```
Publishes the branch only. No deployment (only `main` deploys). The workflow file does nothing off the default branch.

## 2. Apply migration 0154 — **before** the application deploy (authorisation 2)

Confirm the target first (AGENTS target rule), then:

```bash
supabase link --project-ref goxuyooxrekzstssjgly
supabase migration list --linked        # expect 0154 as the ONLY local-only entry
supabase db push --yes                  # applies 0154 only
supabase unlink && test ! -d supabase/.temp && echo "unlinked"
```
(`--dry-run` is deliberately not used; it printed a credential in an earlier incident.) Expected effect: new tables and columns only; `reminders_mode = off`; `reminders_enabled = false`; no enrolment; no existing row changed.

**Read-only verification** (temporary link again, then unlink):
```sql
select reminders_mode, reminders_enabled, auto_enrol_from is null as no_auto_enrol from public.assignment_readiness_settings;
select count(*) from public.assignment_readiness;                  -- expect 0
select count(*) from public.assignment_notifications;               -- expect 0
select count(*) from public.scheduler_runs;                         -- expect 0
```
**Rollback** (only while nothing was ever sent): `supabase/rollbacks/down_0154.sql`; it refuses if any notification exists or the mode is not Off.

## 3. Merge and deploy the application (authorisation 3)

```bash
git checkout main
git merge --ff-only b2-readiness-reminders
git push origin main        # triggers the Production deployment
```
Rollback: promote the previous Vercel deployment.

**What the deployment starts on its own:** the daily Vercel cron (04:40 UTC) calls the new endpoint. With the mode Off it records a heartbeat row and does nothing else. If `CRON_SECRET` is shorter than 16 characters the endpoint refuses with 401 (by design) and Vercel will show a failed cron.

**Post-deploy checks (read-only):**
1. `/admin/overview` and `/admin/crew-support/readiness-settings` load; mode shows **Off**.
2. `curl -s -o /dev/null -w "%{http_code}" -X POST https://<your-site>/api/cron/readiness-reminders` returns **401**.
3. `curl -s -o /dev/null -w "%{http_code}" -X POST https://<your-site>/api/webhooks/resend-readiness` returns **503** (secret not yet set) — after step 4 it returns **401** for an unsigned request.
4. Tables above still empty except `scheduler_runs`, which may hold Off-mode heartbeat rows.

## 4. Credentials and settings you enter (authorisation 4). I never see or print the values.

| Where | What | How |
|---|---|---|
| Vercel (Production) | confirm `CRON_SECRET` is 16+ random characters; if unsure, replace it with a new 32-byte random value | Vercel dashboard → Environment Variables (hidden input). Replacing it also updates the existing Pulse cron automatically |
| Vercel (Production) | add `RESEND_WEBHOOK_SECRET` (starts `whsec_`) | Create the webhook in Resend first (below), copy its signing secret into Vercel. **Redeploy** afterwards so the variable takes effect |
| Resend dashboard | webhook to `https://<your-site>/api/webhooks/resend-readiness`, events: sent, delivered, delivery_delayed, bounced, complained, failed, suppressed | Dashboard → Webhooks |
| GitHub | secret `CRON_SECRET` (same value as Vercel) | `gh secret set CRON_SECRET` (hidden prompt) |
| GitHub | variable `READINESS_SCHEDULER_URL` = `https://<your-site>/api/cron/readiness-reminders` | `gh variable set READINESS_SCHEDULER_URL --body "https://<your-site>/api/cron/readiness-reminders"` |

Do **not** set `READINESS_SCHEDULER_ENABLED` yet.

## 5. Start the hourly trigger (authorisation 5)

```bash
gh variable set READINESS_SCHEDULER_ENABLED --body true
gh workflow run readiness-reminders.yml     # optional manual first run
```
While the mode is Off the hourly run only writes a heartbeat. Check: Readiness settings → "Last run" shows `github`; the Actions run is green. To stop: `gh variable set READINESS_SCHEDULER_ENABLED --body false`.

## 6. Mode changes — each a separate authorisation, each with a reason in the audit log

1. **Off → Dry run:** shows the next 72 hours of what would be sent; sends and records nothing.
2. **Dry run → Test:** records the whole flow, nothing leaves the system.
3. **Test → Live:** refused unless `RESEND_WEBHOOK_SECRET` is configured (verified delivery tracking) and the mode was Test first. Only enrolled assignments are ever considered.
4. **Enrolment** stays manual, one assignment at a time, with a city/area label. **Bright is not enrolled.** There is no automatic enrolment in this build.

## 7. Manual verification checklist after each mode change

* Dry run: preview rows make sense; no rows in `assignment_notifications`.
* Test: rows `suppressed_test`; `/admin/overview` shows no stuck or failed items; **no email** received by anyone.
* Live (first assignment, ideally one you control): the 48-hour email arrives, contains only the reference, service, time, city/area and a sign-in link; a second hourly run sends nothing more; the Resend webhook records "delivered" on the assignment; the scheduler tile shows a recent successful run.

## 8. Remaining blockers and risks

1. `CRON_SECRET` length unknown (cannot be read). 2. Resend webhook availability on your plan (confirm). 3. GitHub may delay or drop scheduled runs and disables them after 60 days without repository activity (public repo); the heartbeat alarm, daily sweep and manual button cover this. 4. The Actions policy of the repository could not be read; confirm Actions are enabled. 5. `FORMS_SENDING_ENABLED` (value not read) controls whether Live sends real mail or only logs; check it before the first Live test.
