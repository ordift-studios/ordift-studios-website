# Production Hardening Report — Email Subsystem

**Date:** 2026-07-29
**Scope:** Redis-backed rate limiting and idempotency, retry-with-backoff email dispatch, the Project Request email workflow, and dead-letter logging for failed sends — the full "Phase 1 / Phase 2 / Phase 3" production-hardening pass requested following the completed Resend production email verification.

---

## 1. Executive Summary

Every in-memory, single-instance limitation flagged in the previous readiness pass has been replaced with a shared, Vercel-serverless-correct implementation, verified directly against the live production environment rather than assumed from code review alone. The email subsystem now has: a Redis-backed rate limiter and idempotency store shared correctly across all serverless instances, a centralized retry-with-backoff dispatcher used by every form, a previously-missing Project Request email workflow, and durable dead-letter logging for any send that ultimately fails. A migration-history bookkeeping gap discovered mid-deployment (migrations `0009`–`0021` applied to production but missing from the CLI's remote history table) was resolved carefully — schema verified independently before any history repair, nothing replayed. `FORMS_SENDING_ENABLED` remains unset in production throughout this entire pass, so no visitor-facing behavior changed; every improvement here was verified either directly against production infrastructure or through the Super-Admin-gated diagnostic route, never through real visitor traffic.

## 2. Completed Improvements

1. **Redis-backed rate limiting** (`src/lib/shared/rateLimit.ts`) — the 10-minute/5-request sliding window now runs as an atomic Lua script against Upstash Redis (provisioned via the Vercel Marketplace integration, shared across Production/Preview/Development), replacing a per-instance in-memory `Map` that silently under-protected production. Falls back to in-memory behavior when Redis isn't configured (local dev) and fails open (allows the request) if Redis is briefly unreachable.
2. **Redis-backed idempotency** (`src/lib/shared/idempotency.ts`) — duplicate-submission protection now uses a 30-minute TTL Redis key instead of a process-local `Map`, so a client retry landing on a different serverless instance still returns the original result. Same fallback/fail-open behavior as the rate limiter.
3. **Shared retry-with-backoff email dispatcher** (`src/lib/shared/email/dispatch.ts`) — replaces three separately-duplicated `dispatch()` implementations. Up to 3 attempts, exponential backoff (500ms base, doubling), and transient-vs-permanent failure classification based on Resend's actual HTTP status code (null/429/5xx retried; other 4xx fails fast, never retried). Exposes `sendEmail()` (respects `FORMS_SENDING_ENABLED`, used by every real form) and `sendEmailNow()` (unconditional, used only by the Super-Admin verify-send diagnostic).
4. **Project Request email workflow** (`src/lib/projectRequests/emailTemplates.ts`, `email.ts`) — Project Requests previously had no email step at all. Added acknowledgement and admin-notification emails matching the existing Contact Enquiry / Workshop Registration branding and template architecture, wired as fire-and-forget sends alongside the existing Google Sheets sync.
5. **Email dead-letter logging** — new `email_send_failures` table (migration `0022`, mirrors the existing `sheet_sync_failures` pattern) records any send that exhausts every retry or fails permanently, instead of that failure only existing as a server log line.
6. **Verify-send diagnostic hardened** — caught and fixed a self-introduced regression where the diagnostic route was accidentally routed through the gated `sendEmail()`, making every result report "logged" instead of actually testing Resend (since `FORMS_SENDING_ENABLED` is off). Fixed by splitting the dispatcher so the diagnostic always calls the real send path.
7. **Migration history repaired** — `0009`–`0021` were applied to production correctly (via manual SQL Editor execution) but missing from the Supabase CLI's remote history bookkeeping. Verified independently via production schema introspection before running `supabase migration repair`; `0022` then applied cleanly via `supabase db push` on its own.

## 3. Tests Performed

| # | Test | Method |
|---|---|---|
| 1 | Redis rate limiter correctness | Direct script against the live production Upstash instance: 6 rapid calls with the same key |
| 2 | Idempotency correctness | Live E2E through the real production `/api/enquiry` route: same idempotency key submitted twice |
| 3 | All 5 email types send successfully | `POST /api/admin/resend/verify-send` (Super-Admin only) against production, run twice — before and after the dead-letter deploy |
| 4 | Dead-letter table write path | Direct insert → read-back → delete round trip against the production `email_send_failures` table |
| 5 | Migration schema integrity (0009–0021) | Production PostgREST OpenAPI introspection: enumerated all exposed tables, checked altered columns, checked RPC functions |
| 6 | No regressions from signature changes | `tsc --noEmit` + `eslint` after every change; fresh live verify-send run after deploying the dead-letter wiring |
| 7 | No secrets exposed | Reviewed every diagnostic-route response body — only booleans, attempt counts, and generic error strings, never key values |
| 8 | `FORMS_SENDING_ENABLED` still off | `vercel env ls production` confirmed the variable is unset throughout this entire pass |

## 4. Test Results

- **Rate limiter:** attempts 1–5 allowed, attempt 6 correctly blocked with `retryAfterSeconds` matching the 10-minute window. **PASS.**
- **Idempotency:** both submissions with the same key returned the identical reference number (`ENQ-2026-000005`); no duplicate row created. **PASS** (run twice, both clean).
- **Email sends:** all 7 (credential check, enquiry ack + admin, workshop ack + admin, project request ack + admin) returned `"mode": "sent", "attempts": 1"` on both runs. **PASS.**
- **Dead-letter round trip:** insert succeeded (confirmed `service_role` grant and default `business_id` both correct), read-back matched, delete succeeded, table confirmed empty afterward. **PASS.**
- **Migration schema check:** all 25 expected tables present; every altered column from 0009–0021 confirmed present (including `staff_details.staff_number` correctly *absent*, matching its 0019 drop); both public-schema RPC functions (`next_record_sequence`, `seed_record_sequence`) present. **PASS.**
- **Build health:** typecheck and lint clean after every change; two full production deploys both completed successfully. **PASS.**
- **Secrets:** none found in any response body. **PASS.**
- **`FORMS_SENDING_ENABLED`:** confirmed unset. **PASS** (by design — not enabled without your explicit approval).

One process failure worth recording plainly: an early idempotency test's cleanup step used stale `.env.local` credentials (unexpectedly overwritten with **staging** values by an unrelated `vercel integration add` step earlier in the session) and deleted from the wrong Supabase project — the real test enquiry stayed live in production briefly. Caught by cross-checking against `.env.production.local`, corrected immediately, and reconfirmed empty. Documented in `MILESTONES.md` so the same mistake is easy to recognize if it recurs.

## 5. Remaining Risks

- **Dead-letter logging's failure-triggering path wasn't tested with a real forced Resend failure.** Verified via code review, type-checking, and a direct table-level round trip (proving the table/grants work), but deliberately did not intentionally break production email delivery just to watch a row get logged — the risk of that experiment outweighed the marginal confidence gained. Low risk: the calling code is simple and already exercised successfully on every real send.
- **No monitoring or alerting on the dead-letter table yet.** A failed send is recorded but nothing currently notifies anyone — an admin has to know to check. Same gap `sheet_sync_failures` has always had.
- **No retention/cleanup policy on `email_send_failures`.** Rows accumulate indefinitely. Low risk at current volume; worth addressing before scale.
- **Redis is shared across Production/Preview/Development** (one Upstash instance, not one per environment) — a deliberate tradeoff since rate-limit/idempotency data is short-lived and non-sensitive, but worth knowing if Preview-environment testing ever needs isolation from Production counters.
- **Pre-existing, unrelated to this pass:** Turnstile CAPTCHA still not enabled on public forms; Supabase backup/restore still blocked on a Pro-plan billing decision. Both already tracked in `DEPLOYMENT.md`'s non-blocking items list.

## 6. Recommended Future Enhancements (optional)

- **Alerting on dead-letter entries** — e.g. a scheduled check or webhook that notifies an admin channel when a new `email_send_failures` row appears. Deferred because it requires a product decision (which channel, who gets notified) rather than a purely technical one.
- **Retention policy for `email_send_failures` and `sheet_sync_failures`** — an archival/cleanup job once either table has real production history to manage.
- **A proper queue (e.g. Upstash QStash)** if email/Sheets volume grows enough that the current fire-and-forget pattern becomes a bottleneck — not needed at current or near-term volume.
- **A lightweight admin UI for dead-letter rows** — currently only queryable via direct database access; a simple list view under `/admin` would make manual resend/investigation easier.

## 7. Overall Production Readiness Score: 90%

Every piece built or changed in this pass was verified directly against live production infrastructure, not just locally or by inference — the Redis logic, the idempotency logic, all 5 email types, the dead-letter table, and the underlying schema were each independently confirmed working before moving on. The 10-point gap is specifically: the dead-letter failure path lacks a live forced-failure test (by deliberate choice, not oversight), there's no alerting yet, and two pre-existing launch items (CAPTCHA, backup/restore) remain open — none of which are regressions from this work, but all of which are real before a public launch.

## 8. `FORMS_SENDING_ENABLED` Recommendation

**Recommend enabling for the email subsystem specifically, with two caveats you should weigh before deciding.** The infrastructure this flag gates — rate limiting, idempotency, retry/backoff, dead-letter logging, and now a complete Project Request email path — is now solid, shared across serverless instances correctly, and tested against production. If your only concern were "will email delivery behave reliably once real visitors start submitting forms," the answer is yes.

The two things this recommendation does **not** cover, because they're outside this pass's scope: **CAPTCHA is still not enabled** on the public Contact/Booking and Workshop Registration forms (honeypot + rate limiting exist, which is a reasonable baseline, but not equivalent to CAPTCHA against a determined bot), and **backup/restore is still unverified** (blocked on the Supabase Pro-plan decision already flagged in `DEPLOYMENT.md`). Neither is new — both predate this session — but enabling `FORMS_SENDING_ENABLED` is the point where real visitor data starts flowing through the system, which is exactly when those two gaps start to matter. Since I don't set this flag myself under any circumstances, the decision — and how much weight to give those two open items versus the urgency of going live — is yours.

---

*Companion documents: `PRODUCTION_READINESS_REPORT.md` (auth/IAM/SMTP), `MILESTONES.md` (this pass's full dated entry), `DEPLOYMENT.md` (environment variables, including the new Upstash Redis section), `GOOGLE_SHEETS_INTEGRATION.md` (the Sheets half of the dual-storage pattern this pass's dead-letter table mirrors).*
