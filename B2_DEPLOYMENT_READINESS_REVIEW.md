# B2 readiness reminders — Production deployment-readiness review

Branch `b2-readiness-reminders` (commit 624cada plus this review). **Nothing has been pushed, merged, migrated or deployed. Reminders stay Off. Bright is not enrolled.** Review date 2026-10-12.

## 1. Production state checked read-only (temporary link, then unlinked; `supabase/.temp` confirmed gone)

| Fact | Result |
|---|---|
| Latest applied migrations | 0151, 0152, 0153 — so 0154 is the next number, no collision |
| Branch relationship | `origin/main` = d33e00c; the B2 branch contains it (fast-forward) |
| Readiness settings row | intervals 48/24/12, reminders_enabled = false, no automatic enrolment |
| Enrolled assignments | 0 |
| Bright (CSR-2026-000002) enrolled | No |
| 0154 objects present | None |

## 2. Migration 0154

| Check | Result |
|---|---|
| Applies on the full migration chain (fresh database) | Yes; adds tables/columns only, inserts one lock row, changes no existing data |
| Resulting state | `reminders_mode = off`, `reminders_enabled = false`, no enrolment |
| Rollback `down_0154.sql` on a clean database | Removes every 0154 object and restores the B1 guard; migration re-applies cleanly afterwards |
| Rollback guard | Refuses (error shown) when mode is not Off, when any notification row exists, or when an area label is in use |
| Compatibility with existing rows | New columns are nullable/defaulted; the only changed constraint is replaced by one the current Production row already satisfies |
| Order matters | **Apply 0154 first, then deploy the code.** New code reads `area_label`; if it ran before the migration, management's readiness panel would show assignments as not enrolled until the migration is applied (no data loss) |

## 3. Scheduler and fallbacks

| Item | Verified how | Result |
|---|---|---|
| GitHub workflow | Static tests + review | Hourly at :17; `permissions: {}`; no overlap; https-only; fails the run on non-200 (so GitHub emails the owner); secret only from GitHub secrets, never echoed; **does nothing until repository variable `READINESS_SCHEDULER_ENABLED` is exactly `true`** |
| Vercel fallback | `vercel.json` test | Daily 04:40 UTC (Hobby-compatible); existing Pulse cron unchanged; Vercel adds its own bearer header from `CRON_SECRET` |
| Manual run | E2E | Management only; audited |
| Authentication | E2E F1/F2 + unit | Fail-closed: no secret, secret under 16 chars, missing/wrong/truncated header → 401, nothing runs; constant-time compare; response is counts only |
| Overlap / duplicates | E2E B2, B3, F3 | Database lock plus unique key; a lock bypass still cannot double-send |
| Delayed runs | E2E C1, C2 | Late caps skip and record instead of sending stale |
| Missed runs | E2E F4 | Heartbeat per run; Overview alarm after 3 h without a success; too-late/failed/stuck counts shown |
| GitHub limits | Documented | May delay/drop runs; scheduled workflows stop after 60 days of repo inactivity (public repo) — covered by the alarm, Vercel sweep and manual button |

## 4. Webhook (delivery tracking)

Signature verified before reading the body (Svix scheme, 5-minute replay window); no secret configured → 503 and nothing stored; wrong/old signature → 401; replays ignored by provider event id; out-of-order events resolve to the furthest stage; opens/clicks ignored; unknown messages acknowledged and discarded; bounce/complaint blocks the person until management clears it (E2E E1–E4, unit). Known limit: an event arriving before our own send record (milliseconds) is dropped.

## 5. Rollout controls

Mode ladder Off → Dry run → Test → Live, each change needs management authority and a reason and is audit-logged; Live only from Test and only with the webhook secret configured; the switch-on time stops catch-up sends; only enrolled assignments are ever considered; enrolment stays manual; no automatic enrolment exists in this build.

## 6. Test evidence

36 isolated database tests, 89 unit tests for the new logic, 35 earlier readiness database tests re-run, full suite 3,836 passed, typecheck and compile build clean, plus the lab reminder simulation (clock injected, mail captured, money unchanged).

## 7. Credentials and settings you would supply (I never read or print them)

1. `CRON_SECRET` in Vercel Production — already exists per earlier work; please confirm it is at least 16 random characters (shorter values make the endpoint refuse everything, by design).
2. Same value as GitHub repository **secret** `CRON_SECRET`.
3. GitHub repository **variables**: `READINESS_SCHEDULER_URL` (the full https URL of `/api/cron/readiness-reminders`) and, only when you decide, `READINESS_SCHEDULER_ENABLED=true`.
4. Resend: a webhook pointing at `/api/webhooks/resend-readiness` (events: sent, delivered, delivery_delayed, bounced, complained, failed, suppressed) and its signing secret as `RESEND_WEBHOOK_SECRET` in Vercel Production. Webhook availability on your Resend plan is unconfirmed.

## 8. Exact actions that need your approval (none taken; each is separate)

| # | Action | Effect |
|---|---|---|
| 1 | `git push origin b2-readiness-reminders` | Publishes the branch only; no deploy |
| 2 | Merge to `main` (fast-forward) and push | **Triggers the Production deployment** |
| 3 | `supabase link` → `supabase db push --yes` (only 0154) → `supabase unlink` | Applies the schema; do this **before** step 2 |
| 4 | You add the credentials in §7 | Nothing sends yet |
| 5 | Mode Off → Dry run | Preview only |
| 6 | Mode Dry run → Test | Records, sends nothing |
| 7 | Mode Test → Live, for assignments you enrol | First real reminders |
| 8 | Set `READINESS_SCHEDULER_ENABLED=true` | Hourly trigger begins (harmless while mode is Off/Dry run) |

Suggested post-deploy smoke checks (read-only): Overview loads; Readiness settings shows mode Off; the cron endpoint returns 401 without the secret; the webhook returns 503 until its secret is set; no new rows in the notification tables.

Rollback: code — promote the previous Vercel deployment; schema — `supabase/rollbacks/down_0154.sql` (only while nothing has ever been sent).

## 9. Decisions that genuinely need you

1. Live without the Resend webhook: keep blocked (current) or allow with a warning?
2. Confirm the `CRON_SECRET` length requirement is acceptable.
