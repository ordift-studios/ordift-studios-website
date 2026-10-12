# B2 — Automated readiness reminders and management escalation

Status: **built and tested on branch `b2-readiness-reminders`. Not pushed, not migrated, not deployed, not activated.** Nothing in Production, Staging or any provider account has been touched. Reminders default to **Off**.

## 1. What it does

For an assignment that management has **enrolled** in readiness tracking (B1) and given a city/area label:

| When (before the start, in the assignment's own timezone) | Condition | Action |
|---|---|---|
| T−48 h (setting: first interval) | Eligible | Preparation reminder to the assigned professional |
| T−24 h (setting: readiness-check interval) | Not confirmed, or confirmed for an older schedule version | Follow-up to the professional. Skipped if already Ready for the current version, and not sent to someone who asked for help (management follows up) |
| T−12 h (setting: unanswered-flag interval) | No answer, **or** an unresolved concern | Escalation to management only — never to the professional |

Emails carry the reference, service, time (in the assignment timezone), the management-entered city/area label and a sign-in link. They cannot carry the venue, client details, on-site contact, access instructions, brief or pay: the builder has no field for them (unit-tested).

## 2. Modes (Settings → Readiness settings → Reminders)

`Off` (default; nothing computed) · `Dry run` (shows what would be sent, writes nothing) · `Test` (whole flow recorded, nothing handed to any email provider) · `Live` (real email; only for enrolled assignments; reachable only from Test; refuses to switch on without delivery tracking configured). Every change needs a reason and is audit-logged. The database stamps a **switch-on time**; any reminder due before it is never sent (no catch-up flood).

## 3. Guarantees and how each is enforced

| Guarantee | Mechanism | Tested by |
|---|---|---|
| No duplicates | Unique index on (kind, readiness, schedule version, recipient, condition, mode); claim-before-send; single-flight lock | E2E B2, B3 (concurrent and lock-bypassed) |
| No stale reminder | Late cap per kind (defaults 6 h / 3 h / 3 h); a late window is recorded as `skipped: late` and shows on the Overview | E2E C1, C2; unit |
| Reschedule / timezone change | Schedule version is part of the key: old keys untouched, new windows re-arm, older "Ready" stops suppressing | E2E C9 |
| Cancellation, decline, release, completion, test record, disabled, started | Eligibility re-checked from live data at send time | E2E C6, C7 |
| Late enrolment / mid-way switch-on | Windows due before enrolment or switch-on are skipped | E2E C3, C4 |
| Escalation never to the professional | Recipient rule; sole-Super-Admin-is-assignee yields "no independent recipient" (recorded, not sent) | E2E B5, B8; unit |
| Failure handling | Failed send retried inside the window up to 3 tries; a stuck `claimed` row is never blindly resent and is surfaced | E2E D1, D2 |
| Acceptance ≠ delivery | Separate append-only stages: attempted, provider_accepted, sent, delivered, delayed, bounced, complained, failed, suppressed | E2E B1, E2 |
| Bounce / spam report | Blocks further reminders to that person until management clears it with a reason | E2E E3 |
| Money, requests, files untouched | A run writes only notification/heartbeat tables | E2E G2 |
| Never-enrolled (Bright-shaped) assignment | Not enrolled = never evaluated | E2E C8 |

## 4. Scheduler: authentication, secrets, monitoring

* Endpoint `/api/cron/readiness-reminders` (GET/POST). Authentication: `Authorization: Bearer <secret>` where the secret is either the dedicated `READINESS_SCHEDULER_SECRET` (GitHub Actions) or `CRON_SECRET` (the one Vercel Cron attaches automatically, shared with Pulse and only ever read); each is checked on its own, constant-time, **fail-closed** if unset or shorter than 16 characters. The value is never logged or returned; the response carries counts only (test F2).
* Triggers (three independent): **hourly GitHub Actions** (`.github/workflows/readiness-reminders.yml`, minute 17, no token permissions, non-overlapping, https-only, fails on non-200); **daily Vercel sweep** (`vercel.json`, 04:40 UTC, free-plan compatible); **"Run check now"** in the admin (management only).
* The workflow is **inert until the repository variable `READINESS_SCHEDULER_ENABLED` is exactly `true`**; merging it starts nothing. It needs the repository secret `READINESS_SCHEDULER_SECRET` and variable `READINESS_SCHEDULER_URL`, both entered by the owner (I never read them).
* Heartbeat: every run is recorded (`scheduler_runs`, with its trigger). An Overview alarm appears if reminders are on and no run has succeeded within the configured window (default 3 h), plus counts of too-late, failed and stuck reminders.
* GitHub may delay or drop scheduled runs and disables scheduled workflows in a public repo after 60 days without activity; the late caps, heartbeat alarm, daily sweep and manual button cover this.
* Webhook `/api/webhooks/resend-readiness`: Svix-scheme signature verified before reading anything, 5-minute replay window, fail-closed without `RESEND_WEBHOOK_SECRET`, idempotent by provider event id, opens/clicks ignored.

## 5. Verification (all on this machine; no network, no Production)

| Check | Result |
|---|---|
| New pure-rule unit tests (`readinessReminderRules.test.ts`) | 71 passed |
| Scheduler wiring tests (`schedulerConfig.test.ts`) and panel tests | 18 passed |
| **New isolated database E2E** (`readinessReminders.localdb.e2e.ts`, injected clock, captured mail) | **36 passed** |
| B1 readiness E2E re-run against migration 0154 (one assertion updated for the new guard) | 35 passed |
| Full unit suite | 225 files / 3,836 tests passed |
| Typecheck, lint (changed areas), clean-copy compile build | clean |

## 6. Files

Migration `supabase/migrations/0154_assignment_readiness_reminders.sql` (+ guarded rollback `supabase/rollbacks/down_0154.sql`); `src/lib/crewSupport/readinessReminderRules.ts` (pure), `readinessReminders.ts` (shell); routes under `src/app/api/cron/readiness-reminders` and `src/app/api/webhooks/resend-readiness`; admin: settings page controls, area-label and per-assignment history on the Schedule & readiness panel, Overview alarms; `dispatch.ts` gains an optional `providerId` on success (additive).

## 7. Decisions and known limits

* **Area label is required** for professional reminders (management enters it; never extracted from the venue). A missing label blocks, not silently skips.
* **"Request management assistance" tick**: B1's "Need assistance" already raises an issue management must act on, so no second control was added. Say if you want a separate tick.
* Material change = schedule version (date, call/finish time, timezone) or a different engagement. Changing only the area label does not re-arm.
* A delivery webhook that arrives before our own record of the send (milliseconds) is acknowledged and dropped; the stage then stays at "accepted".
* Going Live requires the provider webhook secret to be configured. Whether the current Resend plan offers webhooks is unconfirmed — if not, Live stays blocked (an explicit choice; say if you prefer a warning instead).
* Automatic enrolment on acceptance is **not** built (separate approval).

## 8. Steps that each need your explicit approval (none taken)

1. Push `b2-readiness-reminders` and merge to `main` (merging deploys to Production).
2. Apply migration 0154 to Production (adds tables/columns; changes no data; reminders stay Off).
3. You add `READINESS_SCHEDULER_SECRET` (Vercel Production and GitHub; `CRON_SECRET` stays as it is), `RESEND_WEBHOOK_SECRET`, and the GitHub secret/variables; register the Resend webhook.
4. Switch mode Off → Dry run → Test → Live, each a separate decision, only for enrolments you choose. **Bright's assignment is never enrolled unless you say so.**
