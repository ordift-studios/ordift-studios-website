# Deployment Request 3 — B2 dedicated scheduler secret (for review; nothing deployed)

Branch `b2-dedicated-scheduler-secret`, based on `main` = `0a8c730`. No database migration. Preparation and testing only.

## 1. The design in one paragraph

Pulse keeps using `CRON_SECRET` and is not touched. The readiness endpoint now accepts **either** of two independent credentials:

| Credential | Who sends it | Why |
|---|---|---|
| `READINESS_SCHEDULER_SECRET` (new) | the GitHub Actions workflow only | lets Pulse and readiness reminders be changed or rotated independently |
| `CRON_SECRET` (existing, unchanged) | Vercel Cron, automatically | Vercel always attaches `CRON_SECRET` to its own cron calls; the endpoint must keep accepting it or its own daily 04:40 UTC sweep would be rejected |

Each credential keeps the full existing rule: exact `Bearer <value>` match, constant-time comparison, at least 16 characters, fail closed when unset. Both comparisons always run, so timing does not reveal which was configured or nearly matched. Nothing is read into a log or a response (counts only, as before).

How Vercel's scheduled call authenticates: Vercel reads the project's `CRON_SECRET` and sends `Authorization: Bearer <CRON_SECRET>` with user agent `vercel-cron/1.0`. The endpoint accepts that and records trigger `vercel`. `vercel.json` is unchanged. Test: "accepts Vercel's own CRON_SECRET request … does not reject its own scheduled sweep".

The recorded trigger now follows the credential rather than a self-declared header: the dedicated secret yields `github` (with the workflow's header) or `manual`; `CRON_SECRET` yields `vercel` (with the Vercel user agent) or `manual`.

## 2. Exact code changes (7 files modified, 1 added; +104 / −15 lines excluding docs)

* `src/lib/crewSupport/readinessReminderRules.ts` — **added** `authenticateScheduler(authorization, {cron, dedicated})` returning `"dedicated" | "vercel" | null`, and `triggerForChannel(channel, headers)`. `isAuthorizedScheduler` and `detectTrigger` are unchanged and reused.
* `src/app/api/cron/readiness-reminders/route.ts` — calls `authenticateScheduler(authorization, {cron: process.env.CRON_SECRET, dedicated: process.env.READINESS_SCHEDULER_SECRET})`; 401 if null; trigger from `triggerForChannel`.
* `.github/workflows/readiness-reminders.yml` — uses `secrets.READINESS_SCHEDULER_SECRET` instead of `secrets.CRON_SECRET`. Still inert unless `READINESS_SCHEDULER_ENABLED == 'true'`.
* `.env.example`, `B2_READINESS_REMINDERS.md` — names/description only.
* Tests: `readinessReminderRules.test.ts` (new "dedicated scheduler secret" block), new `src/app/api/cron/readiness-reminders/route.test.ts`, `schedulerConfig.test.ts` (workflow must never reference `secrets.CRON_SECRET`), `readinessReminders.localdb.e2e.ts` (F1, F1b, F2).
* **Not changed:** `src/app/api/cron/pulse-discovery/route.ts` (byte-identical to `main`), `vercel.json`, every migration, every other file.

## 3. Verification run (all local; no Production access)

| Check | Result |
|---|---|
| Unit suite (whole repo) | 227 files, 3,857 tests pass |
| New route tests (credentials; Pulse unchanged; no secret in any response) | 9 pass |
| Local-database end-to-end, readiness file, fresh database | 38 of 38 pass (includes F1 fail-closed matrix, F1b dedicated + Vercel, F2) |
| TypeScript, ESLint on changed files | clean |
| Workflow file | valid YAML; test asserts it references only the dedicated secret and never echoes it |
| Clean-copy production compile | compiles successfully (page-data step needs real CMS credentials and was not run) |
| Secret scan of the diff | only obviously fake lab strings in tests |

Pulse proof: route tests show that with both secrets set, Pulse accepts `CRON_SECRET`, refuses the readiness secret, and stays closed if `CRON_SECRET` is unset.

## 4. Expected impact of deploying the code

* Pulse: none. Same file, same secret, same cron.
* Readiness: none while the new variable is unset. The endpoint then behaves exactly as today (only `CRON_SECRET` is accepted; the Vercel 04:40 sweep keeps recording a heartbeat in mode Off).
* Reminders: remain Off. No enrolment, no email, no mode change, scheduler stays disabled. No migration, no data change, Bright untouched.

## 5. Secure setup procedure (after your separate approval; I do not read or print the value)

You generate the value in memory and pipe it to both places; it is never displayed, written to a file, or committed. Run this in your own terminal, signed in to both CLIs (GitHub needs repository admin to write secrets):

```bash
v=$(openssl rand -hex 32)
printf '%s' "$v" | vercel env add READINESS_SCHEDULER_SECRET production --sensitive
printf '%s' "$v" | gh secret set READINESS_SCHEDULER_SECRET --repo ordift-studios/ordift-studios-website
unset v
```

Do not add `set -x` or `echo "$v"`. Vercel stores it as Sensitive (write-only), Production only. If the second command fails, re-run the whole block with `--force` added to the `vercel env add` line, so both sides get the same new value. The block's text itself contains no secret, so shell history is safe.
Alternatively, add each by hand (hidden prompt/dashboard) with a value you generate, but the pipe avoids ever seeing it.

Then: redeploy Production so the Vercel variable takes effect (outside 03:00–05:00 UTC). Also set the GitHub variable `READINESS_SCHEDULER_URL` (not secret) and the Resend webhook items from the setup guide. `CRON_SECRET` is never touched.

## 6. How the new secret is proven (separate later approval)

Presence is checked by name only. The first real proof is one run of the GitHub workflow with `READINESS_SCHEDULER_ENABLED=true` while the mode is Off: expected result is HTTP 200, a `scheduler_runs` row with trigger `github`, mode `off`, 0 sent. That is the "enable scheduler, heartbeat only" step, which I will request separately; it is not part of this request.

## 7. Deployment plan, in order, each step needing your approval

1. Merge `b2-dedicated-scheduler-secret` into `main` (fast-forward) and push; Vercel deploys it automatically (no migration). I verify: Pulse route 401 without a token, readiness route 401, a green deployment, `scheduler_runs` unchanged until 04:40 UTC, then one `vercel` row in mode Off.
2. You run the section 5 block; redeploy.
3. Resend webhook + `RESEND_WEBHOOK_SECRET` (existing guide).
4. Read-only configuration check (`scripts/b2-config-check.sh --db`).
5. Later, separately: scheduler heartbeat enable → Dry run → Test → Live → enrolment.

## 8. Rollback

* Code: redeploy the previous Production deployment, or revert the merge commit (`git revert -m 1`) and push. The old code ignores the new variable. No data or schema is involved.
* Credentials: `vercel env rm READINESS_SCHEDULER_SECRET production` and `gh secret delete READINESS_SCHEDULER_SECRET --repo ordift-studios/ordift-studios-website`. Removing them returns the endpoint to CRON_SECRET-only, today's behaviour.
* Pulse needs no rollback at any step.

## 9. Residual points to know

* `CRON_SECRET` still opens the readiness endpoint (needed for Vercel's sweep), exactly as it did before; it cannot be avoided while Vercel Cron calls the endpoint. If you later prefer, the Vercel sweep can be removed and `CRON_SECRET` dropped from this endpoint; I have not done that.
* If the dedicated and Vercel values were identical, the dedicated channel would win; the generated value is random, so this cannot happen by accident.
* Public repo: GitHub disables scheduled workflows after 60 days of inactivity (unchanged note).
