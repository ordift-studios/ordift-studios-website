# Operations Manual

**Purpose:** everything someone unfamiliar with this project needs to confidently operate and maintain Ordift Studios' platform day-to-day, once, before, and after launch — without having to reconstruct context from the full project history. This document is the operational entry point; it cross-references the detailed "how" documents (`ADMIN_GUIDE.md`, `DISASTER_RECOVERY.md`, `DEPLOYMENT.md`, `GOOGLE_SHEETS_INTEGRATION.md`, `PHASE_4_PRODUCTION_AUDIT_REPORT.md`) rather than duplicating them, so there is always exactly one authoritative place for each kind of detail.

**Last updated:** 2026-07-30.

---

## 1. Daily Operations

### Startup checklist (first thing each working day)
- [ ] Open `/admin` and confirm you can log in normally.
- [ ] Check the Overview dashboard's headline numbers look sane (no sudden zeroes or implausible spikes since yesterday).
- [ ] Check `/admin/enquiries` and `/admin/bookings` for anything new overnight that needs a response.
- [ ] Check the Active Users panel (`/admin/overview`, "Active Now") — mostly a sanity check that presence/Realtime is working, not something requiring action most days.

### Shutdown checklist (end of day, optional but recommended during active launch weeks)
- [ ] Confirm every new enquiry/booking from today has at least an initial status set (not left in the default "new" state indefinitely).
- [ ] Note anything unusual for tomorrow's startup check (a flagged error, an unusually quiet day, a support request still open).

### Monitoring checklist (throughout the day, or at set check-in times)
- [ ] New Contact Enquiry / Workshop Registration submissions arriving as expected (check `/admin/enquiries`, `/admin/bookings`).
- [ ] Acknowledgement + admin notification emails actually arriving (spot-check your own inbox against what the dashboard shows was submitted).
- [ ] No repeated entries in `email_send_failures` or `sheet_sync_failures` (query directly, or once the alerting recommendation in `PRODUCTION_HARDENING_REPORT.md` §6 is built, watch for that instead).

### Customer enquiry management
Full detail in `ADMIN_GUIDE.md` §2–§4 (role capabilities). Day-to-day: `/admin/enquiries` for the CRM view, stage progression, and filters; `/admin/reports` for CSV/Excel export and emailing a report to Operations.

### Booking management
`/admin/bookings` — same pattern as enquiries (filters, export, status).

### Workshop management
Content (title, dates, capacity, etc.) is managed in Sanity Studio (`/studio`), not the admin app — see `CONTENT_READINESS_CHECKLIST.md` for exactly which fields exist and what still needs real content before launch. Registrations themselves (who signed up, waitlist position, payment status) are managed via the admin app's workshop-registration views.

### Staff management
`ADMIN_GUIDE.md` §5–§7 — inviting, assigning/revoking roles, suspending/deactivating/restoring/removing users. Don't duplicate that detail here; it's the authoritative source.

### Dashboard monitoring
The Overview dashboard's widgets pull live from Supabase — if a number looks wrong, the underlying query is in `src/app/admin/overview/` and the data layer in `src/lib/portal/adminData.ts`; there's no separate caching layer to distrust first.

### Email verification
Use the Super-Admin-only verify-send diagnostic (`POST /api/admin/resend/verify-send` from a logged-in Super Admin session, or via the same browser `fetch()` pattern used throughout this project's audits) any time you want to confirm Resend is actually authenticating and sending, independent of real form traffic. Full context in `PRODUCTION_HARDENING_REPORT.md`.

### Spreadsheet synchronization checks
Open the "Ordift Studios Operations" Google Sheet and spot-check that today's new enquiries/registrations appear as rows. If one's missing, check `sheet_sync_failures` in Supabase — a missing Sheets row never means a lost enquiry (Supabase is always primary), but it does mean the secondary copy needs manual reconciliation. Full mechanism in `GOOGLE_SHEETS_INTEGRATION.md`.

---

## 2. Weekly Operations

- [ ] **Manual database backup** — run the `pg_dump` procedure in `DISASTER_RECOVERY.md` §2.2, every Monday morning (or immediately before any planned migration/risky change, in addition to the weekly one).
- [ ] **Backup verification** — the 4-step check in `DISASTER_RECOVERY.md` §2.3, every time, not just occasionally.
- [ ] **Restore testing** — not every week, but pick a cadence (e.g., once a month, or whenever you have a spare hour) to actually run a restore into a scratch project per `DISASTER_RECOVERY.md` §3, so the first time you ever run a restore isn't during a real incident.
- [ ] **Deployment review** — `vercel ls --yes` to confirm the most recent production deployment matches what you expect (no stray deploys from an unexpected source).
- [ ] **Error log review** — check Vercel's function logs for repeated errors, and query `email_send_failures`/`sheet_sync_failures` for anything that accumulated.
- [ ] **Email failure review** — same tables as above, specifically checking whether any failure needs a manual resend or a customer follow-up.
- [ ] **Redis health check** — a quick `checkRateLimit`/idempotency round-trip (the same pattern used throughout `PRODUCTION_HARDENING_REPORT.md`'s verification passes) confirms Upstash is reachable and behaving.
- [ ] **Security review** — skim recent `activity_log` entries for anything unexpected (role changes, access-status changes you didn't make).
- [ ] **Performance review** — informal: does the site feel slow anywhere it didn't before? Formal Lighthouse/load testing is a separate, occasional exercise, not weekly.

---

## 3. Monthly Operations

- [ ] **Dependency review** — `npm outdated` and `npm audit`; track findings, don't force-upgrade anything that requires a breaking change without deliberate testing (see `PHASE_4_PRODUCTION_AUDIT_REPORT.md` §3.4 for the current known findings and why they're deliberately not auto-fixed).
- [ ] **Environment variable audit** — `vercel env ls production` against `.env.example`; confirm nothing has silently drifted (a variable removed from code but still set, or vice versa).
- [ ] **User permission audit** — `/admin/users`, confirm every active role grant still makes sense (no former staff still holding access).
- [ ] **Database health review** — table sizes, row counts trending as expected, no runaway growth in `email_send_failures`/`sheet_sync_failures` (if either is growing steadily, something upstream needs fixing, not just periodic cleanup).
- [ ] **Storage review** — currently N/A (no Supabase Storage buckets in use); revisit this line item the day that changes.
- [ ] **Performance optimization** — review any user-reported slowness; not a fixed task list, driven by actual signal.
- [ ] **Security review** — broader than the weekly one: re-read `PHASE_4_PRODUCTION_AUDIT_REPORT.md` §3 and confirm nothing in that list has regressed (headers still present, RLS still correctly scoped, no new secrets committed).
- [ ] **Backup testing** — the monthly restore-test cadence from §2, if not already done that month.
- [ ] **Disaster recovery verification** — re-read `DISASTER_RECOVERY.md` once a month and confirm it's still accurate (procedures, contacts, the Pro-upgrade trigger conditions in §9 — check whether any of the three trigger conditions have been hit).

---

## 4. System Administration

Detailed how-to for each of these already exists in named documents — this section is a routing table, not a duplicate:

| Task | Where |
|---|---|
| Creating new services | `src/lib/content/local/*` or Sanity, depending on current content-source status (`CMS_MIGRATION.md`) |
| Creating new workshops | Sanity Studio (`/studio`) — see `CONTENT_READINESS_CHECKLIST.md` for the field list |
| Updating pricing | No structured pricing field exists yet (see `CONTENT_READINESS_CHECKLIST.md`'s pricing note) — currently a manual, off-platform conversation with the client |
| Updating schedules | Sanity Studio, workshop `startDate`/`endDate`/`registrationDeadline` fields |
| Managing enquiries | `/admin/enquiries`, `ADMIN_GUIDE.md` |
| Managing bookings | `/admin/bookings`, `ADMIN_GUIDE.md` |
| Creating staff accounts | `ADMIN_GUIDE.md` §5 (Inviting New Users) |
| Revoking staff access | `ADMIN_GUIDE.md` §7 (Suspending/Deactivating/Removing) |
| Managing Super Admin accounts | `ADMIN_GUIDE.md` §2, §6 |
| Managing environment variables | Vercel dashboard; `.env.example` is the authoritative variable list; `DISASTER_RECOVERY.md` §5 for the Sensitive-variable write-only caveat |
| Deploying updates | `git push` to `main` (auto-deploys via Vercel's GitHub integration) or `vercel --prod --yes` directly; `DEPLOYMENT.md` |
| Rolling back deployments | `DISASTER_RECOVERY.md` §6 |
| Updating Redis | Managed entirely by the Vercel Marketplace Upstash integration — no manual maintenance; if the instance itself ever needs replacing, `vercel integration add upstash-kv` provisions a new one (confirm no duplicate is created — see the migration-history caution in `MILESTONES.md`'s Redis provisioning entry) |
| Updating Supabase | Schema changes go through `supabase/migrations/*.sql`, applied via `supabase db push` after linking the CLI to the correct project — staging first, always, per this project's standing workflow |
| Updating Sanity CMS | Schema changes in `src/sanity/schemaTypes/`, deployed via Sanity's own tooling; content changes via Studio directly |
| Updating Vercel configuration | Vercel dashboard, or `vercel.json`/`next.config.ts` in-repo for anything code-managed (e.g. the security headers added in Phase 4.3) |

---

## 5. Disaster Recovery

**Full procedures live in `DISASTER_RECOVERY.md`** — database restoration, environment-variable recovery, Vercel deployment rollback, post-recovery validation, and recovery responsibilities are all there in complete detail. Summarized pointers for the specific scenarios requested:

| Scenario | Where to look |
|---|---|
| Database restoration | `DISASTER_RECOVERY.md` §3 |
| Environment recovery (lost/corrupted env vars) | `DISASTER_RECOVERY.md` §5 |
| Redis recovery | Not separately documented because there's nothing to recover — rate-limit/idempotency data is intentionally short-lived and non-critical (worst case: a rate-limit window resets early, or one duplicate slips through); if the Upstash instance itself is lost, re-provisioning via the Vercel integration and updating `KV_REST_API_URL`/`KV_REST_API_TOKEN` is the entire recovery — no data to restore |
| Deployment rollback | `DISASTER_RECOVERY.md` §6 |
| Email recovery (Resend outage or misconfiguration) | The retry-with-backoff dispatcher (`src/lib/shared/email/dispatch.ts`) already handles transient failures automatically; for a sustained outage, check `email_send_failures` for what needs manual resending once Resend recovers, and use the verify-send diagnostic to confirm recovery before assuming it |
| Lost environment variables | `DISASTER_RECOVERY.md` §5 — the critical case is a lost Sensitive-flagged value, which cannot be recovered, only regenerated at the source |
| Expired API keys | Regenerate at the source (Resend, Sanity, Google Cloud, etc.) and update the corresponding Vercel env var — this project's standing rule is to never let me rotate/regenerate a secret without your explicit request, so this is always a step you (or you + me together, on request) perform deliberately |
| Failed deployments | Vercel retains the previous working deployment; `DISASTER_RECOVERY.md` §6 covers promoting it back |
| Restoring backups | `DISASTER_RECOVERY.md` §3 |

---

## 6. Monitoring

### 6.1 Application error monitoring (Sentry) — added Version 1.0.5 Workstream C, documented here 2026-08-10

**What's actually instrumented:** Sentry (`@sentry/nextjs`) covers all three Next.js runtimes — server (`src/instrumentation.ts`, Node.js runtime), edge (same file, edge runtime), and client (`src/instrumentation-client.ts`). A dedicated React error boundary (`src/app/error.tsx`) calls `Sentry.captureException(error)` for any unhandled error in the component tree, in addition to Sentry's own automatic instrumentation of unhandled server exceptions (`onRequestError = Sentry.captureRequestError` in `instrumentation.ts`) and client-side route-transition tracking (`onRouterTransitionStart`). Source maps are uploaded automatically at build time via `withSentryConfig()` in `next.config.ts` (`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`), so stack traces in the Sentry dashboard resolve to real source lines, not minified bundle output. Verified end-to-end 2026-08-10: a deliberately-triggered test exception was confirmed to arrive in the Sentry dashboard on staging, closing out `TECHNICAL_DEBT_REGISTER.md` TD-003.

**Where to look when something goes wrong:** the Sentry project dashboard (not linked here — access is via your own Sentry account) is the first place to check for an unhandled exception, not the Vercel function logs (though those remain useful for anything Sentry doesn't capture, e.g. a build failure). Sample rate is intentionally low (`tracesSampleRate: 0.1`, i.e. 10% of transactions get full performance tracing) — appropriate for current traffic; error capture itself is not sampled, every unhandled exception is captured regardless of this setting.

**Environment tagging — a known asymmetry, not yet fixed (`TECHNICAL_DEBT_REGISTER.md` TD-032):** server/edge-side Sentry events are tagged with this project's own `SITE_ENV` value (`staging`/`production`, the same variable that drives every other staging/production distinction in this codebase — Sanity CDN usage, the staging Basic-Auth gate, etc.). Client-side events are tagged with `NODE_ENV` instead, which Next.js/Vercel sets to `production` for **every** optimized build, staging included — so a client-side error captured on staging currently shows up in Sentry's dashboard tagged `environment: production`, indistinguishable from a real production error unless cross-checked against the URL/release in the event detail. **When triaging a Sentry alert, always open the event and check its actual URL/host before assuming a "production"-tagged event is really from production.** The concrete fix (adding a `NEXT_PUBLIC_SITE_ENV` variable so the client bundle can read the same staging/production distinction server code already has) is deliberately not applied in this documentation pass — it's an environment-variable change across both Vercel scopes, out of scope for a docs-only workstream; see TD-032 for the pay-down trigger.

**Payments-specific overlay:** payment-webhook failures, signature-verification failures, and amount mismatches get a distinct Sentry tag/context on top of this general setup — see `PAYMENT_SECURITY_REVIEW.md` §19 for the payments-specific incident-response procedure, which layers on top of (not instead of) this section.

**What's still genuinely open, not just undocumented:** `TECHNICAL_DEBT_REGISTER.md` TD-013 — no uptime/synthetic monitoring exists yet (nothing pings the live site from outside to detect "the site is down" independent of an application error Sentry would catch — a DNS problem, an expired certificate, or a full platform outage). This was explicitly scoped into Workstream C from the start but has not been built; Sentry's error-tracking half of Workstream C is complete and verified, the synthetic-monitoring half is not. Don't read this section as implying uptime monitoring exists just because error monitoring does.

### 6.2 Day-to-day monitoring signals

**What should be monitored daily:** new form submissions arriving, emails sending, no repeated dead-letter entries — see §1's Monitoring checklist above.

**What indicates something is wrong:**
- A sudden drop to zero new enquiries/registrations when traffic should be normal (could mean a broken form, not just a quiet day — check `/api/enquiry`/`/api/workshop-registration` aren't erroring by testing one yourself).
- Repeated rows in `email_send_failures` for the same recipient/type (a systemic issue, not a one-off).
- The Active Users panel never showing anyone, including yourself when logged in (a Realtime/presence regression).
- `npx vercel ls --yes` showing a deployment you didn't expect.
- A new, unexplained cluster of events in the Sentry dashboard (§6.1) — check whether it correlates with a recent deploy before assuming it's unrelated.

**Expected system behavior:** forms save to Supabase first and always (this never depends on email or Sheets succeeding); email and Sheets sync are best-effort and retried/logged on failure, never block the visitor-facing response; CAPTCHA (once live) and rate limiting reject abuse before any of that even runs.

**Warning signs:** anything in the "what indicates something is wrong" list above, persisting for more than a few hours without an obvious external cause (e.g., a known Resend or Supabase status-page incident).

**Emergency procedures:** see `DISASTER_RECOVERY.md` §8's "Incident response order of operations" — stop further damage first, assess, restore, validate, document. Don't skip the documentation step even under time pressure; it's what makes the next incident faster to resolve.

---

## 7. Business Launch Checklist

### Technical
- [ ] All environment variables present and correct in Production (`vercel env ls production` against `.env.example`)
- [ ] Domain connected and resolving correctly (`ordiftstudios.com`)
- [ ] SSL active (Vercel manages this automatically for connected domains — confirm via `curl -I` or browser padlock)
- [ ] Email delivery verified end-to-end (verify-send diagnostic, all 5 types)
- [ ] CAPTCHA live with real Turnstile credentials (see the dedicated Turnstile setup guidance provided separately this session)
- [ ] Redis rate limiting and idempotency verified healthy
- [ ] Supabase production schema fully migrated and verified (0001–0022, confirmed consistent as of 2026-07-30)
- [ ] Vercel deployment healthy, security headers present (`curl -I` confirms `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`)
- [ ] Sanity content connected and rendering correctly
- [ ] Database RLS reviewed (`PHASE_4_PRODUCTION_AUDIT_REPORT.md` §4.2)
- [ ] No leftover QA/test data in either Supabase project
- [ ] `FORMS_SENDING_ENABLED` set deliberately (on, with your explicit approval — see Phase 5 of the production-hardening directive)

### Business
- [ ] Portfolio content real and complete (not sample/placeholder)
- [ ] Pricing information accurate wherever shown
- [ ] Services pages reflect what's actually offered today
- [ ] Workshop listings real, per `CONTENT_READINESS_CHECKLIST.md` (or sample workshops unpublished if none are ready yet)
- [ ] Photography galleries populated with real work
- [ ] Terms & Conditions, Privacy Policy, Cookie Policy published and approved (`LEGAL_PAGES_APPROVED` gates this — confirm it's set correctly)
- [ ] Contact details correct (`NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, or their fallback defaults)
- [ ] Social media links correct, if/where displayed
- [ ] Branding (logo, colors, typography) final
- [ ] SEO metadata present on key pages
- [ ] Analytics configured, if desired (`NEXT_PUBLIC_GA_MEASUREMENT_ID` — currently unset; gated on Cookie Notice approval per `DEPLOYMENT.md`)
- [ ] Google Search Console set up and the domain verified, if desired
- [ ] Sitemap present and correct (`/sitemap.xml`)
- [ ] Favicon present
- [ ] Legal pages all reachable from the footer and correctly `noindex`'d/indexed as appropriate

### Final step
- [ ] Remove `LAUNCH_HOLDING_PAGE` — only after every item above is genuinely checked, per the exact procedure in `DEPLOYMENT.md`'s "Removing the launch holding page" section.

---

## 8. Post-Launch Checklist

**First day:** monitor form submissions and emails closely (more frequently than the normal daily cadence); watch Vercel's function logs for any error spike; confirm the first real enquiry/registration flows through cleanly end-to-end (database row, email, Sheets sync).

**First week:** run the full Weekly Operations checklist (§2) at least once, even if it's not yet the "usual" day for it; take the first real manual backup of a database that now has real client data in it; review whether traffic patterns suggest the rate-limit thresholds (5 requests/10 minutes) are appropriately tuned for real usage, not just the test scenarios they were built against.

**First month:** run the full Monthly Operations checklist (§3); revisit the Supabase Pro-upgrade trigger conditions in `DISASTER_RECOVERY.md` §9 — has any of the three been hit yet?; do a genuine restore test if one hasn't happened yet.

**Routine maintenance:** settle into the Daily/Weekly/Monthly cadence in §1–§3 as the new normal.

**Growth recommendations:** revisit `PRODUCT_ROADMAP.md` for what's next once the current platform is stable in production with real usage — don't start new feature work while launch-week monitoring is still the priority.
