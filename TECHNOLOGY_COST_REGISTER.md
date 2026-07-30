# Technology & Running Costs Master Register

**Date created:** 2026-07-30. **Status:** Living document — updated whenever a new external dependency is actually introduced to the codebase, not on a schedule.

**Scope discipline:** every service below is traceable either to the production codebase (`package.json`, `.env.example`, and verified live integrations) or to an explicit, non-superseded mention in `PRODUCT_ROADMAP.md`. Nothing here is speculative. Where a cost figure depends on a plan tier that isn't independently verifiable from this session (e.g., the exact Vercel billing plan), that's stated as an assumption to confirm, not presented as fact. Pricing was checked against current provider pricing pages as of 2026-07-30, not assumed from memory — see the sources noted per service.

---

## Executive Summary

Ordift Studios currently runs on **eight real external services**, seven of which are on their free tier today, with the eighth (Vercel) likely requiring a paid seat for commercial use. **Estimated current monthly cost: $20–24** (Vercel Pro only) **plus domain renewal** (registrar/cost not recorded in project files — see the note under Domain & DNS). Every other service — Supabase, Sanity, Resend, Upstash Redis, Cloudflare Turnstile, Google Sheets API, GitHub — costs $0/month at current and near-term projected usage.

This is not an accident: the project's own history shows deliberate free-tier discipline (staying on Supabase's Free plan was an explicit, documented decision in `DISASTER_RECOVERY.md`, not an oversight). The register below confirms that discipline held across the whole stack, not just the one service that got a dedicated decision document.

**The one service scaffolded but not active:** Google Analytics — an env var already exists (`NEXT_PUBLIC_GA_MEASUREMENT_ID`), explicitly flagged in `PRODUCT_ROADMAP.md` as "no code built yet; needs a decision + measurement ID before it's worth building." Free regardless of when it's turned on.

**No payment gateway, SMS provider, or similar is included here.** `MILESTONES.md`'s retired "Version 3.0 — Commerce" section explicitly marks payment integration "unscheduled" — per your own instruction not to include anything that isn't actually approved, it's absent from this register, not merely deprioritized. If and when a payment provider is actually scheduled, it belongs here as a new entry, not as a placeholder today.

---

## Current Technology Stack

### 1. Vercel — Hosting & Deployment
- **Purpose:** hosts the Next.js application, runs serverless functions (all `/api/*` routes), handles the production domain, environment variables, and every deploy in this project's history.
- **Implementation status:** live, production-critical. Every deploy this entire engagement has gone through Vercel.
- **Dependencies:** the entire application depends on this — it's the single point of failure for the whole platform.
- **Pricing model:** per-seat subscription (Pro) or free (Hobby), plus usage-based overages for bandwidth/function execution beyond included credits.
- **Monthly cost:** **$20–24/user** if on Pro (billed annually vs. monthly) — **this is an assumption, not confirmed**: Vercel's Hobby plan is contractually restricted to non-commercial use, and Ordift Studios is a commercial business, so Pro is the correct plan, but the actual active plan wasn't independently verifiable from the CLI this session. **Confirm the actual billing plan in the Vercel dashboard.**
- **Annual cost:** ~$240–288/year at one seat, if Pro.
- **Free tier:** Hobby is $0 but explicitly non-commercial-use only per Vercel's terms — not a real option for a live business.
- **Scaling considerations:** bandwidth/function-invocation overages are the main lever; at this project's current and near-term traffic (a marketing site plus a small admin/client portal), overages are unlikely.

### 2. Supabase — Database, Auth, Realtime
- **Purpose:** primary data store for every enquiry, booking, workshop registration, project request, client/staff account, role grant, and activity log entry. Powers authentication and the Realtime presence feature on `/admin/overview`.
- **Implementation status:** live, production-critical. 26 tables, RLS enabled and policy-reviewed on all of them.
- **Dependencies:** Client Portal auth, Admin Portal, all form-driven data, Realtime presence.
- **Pricing model:** free tier, then flat per-project subscription (Pro), then Team.
- **Monthly cost:** **$0 today** — confirmed on Free plan throughout this engagement, a deliberate decision documented in `DISASTER_RECOVERY.md`. Pro is $25/month/project when upgraded.
- **Annual cost:** $0 today; $300/year per project if/when Pro is triggered.
- **Free tier:** 500 MB database, 50,000 monthly active users, unlimited API requests — see `DISASTER_RECOVERY.md` §1 for the full audited capability breakdown (no automated backups, no PITR on Free — the actual reason Pro is being tracked for an upgrade).
- **Scaling considerations:** the documented upgrade trigger (`DISASTER_RECOVERY.md` §9) is **not** pure data volume — it's `FORMS_SENDING_ENABLED` going live (already true as of today), 20 real bookings, or the first real payment, whichever comes first. Worth revisiting now that forms are live.

### 3. Sanity — Headless CMS
- **Purpose:** stores and serves all public content — Home/About/Services copy, Portfolio, Journal, Workshops, legal pages, site-wide settings, footer, navigation.
- **Implementation status:** live, production-critical for every public-facing page.
- **Dependencies:** every public page's content; the `/studio` editing interface.
- **Pricing model:** free tier, then per-seat Growth subscription.
- **Monthly cost:** **$0 today.** The project uses exactly 2 datasets (staging + production) and 1 real editor (you) — comfortably inside the Free plan's 2-dataset/2-user limit.
- **Annual cost:** $0 today; Growth would be $15/seat/month (~$12/seat annually) if a second non-viewer editor is ever added.
- **Free tier:** 2 datasets, 2 non-admin users, 500,000 API CDN requests/month, 10 GB bandwidth, 20 GB asset storage.
- **Scaling considerations:** the only realistic trigger for upgrading is adding a second editing staff member — not content volume or traffic.

### 4. Resend — Transactional Email
- **Purpose:** sends every confirmation and admin-notification email (Contact Enquiry, Workshop Registration, Project Request — acknowledgement + admin pair for each).
- **Implementation status:** live, production-critical, verified sending for real as of today's `FORMS_SENDING_ENABLED` activation.
- **Dependencies:** every form's confirmation/notification step; the Super-Admin `verify-send` diagnostic.
- **Pricing model:** free tier, then flat monthly tiers by email volume.
- **Monthly cost:** **$0 today and for the foreseeable future** — see Usage Scaling below; even at 150 active clients/month, projected volume stays well under the free tier's cap.
- **Annual cost:** $0 at current and near-term projected volume.
- **Free tier:** 3,000 emails/month, capped at 100/day, one domain.
- **Scaling considerations:** the 100/day cap is the more realistic constraint than the 3,000/month one — worth monitoring once real booking volume starts, not a launch-blocking concern today.

### 5. Upstash Redis — Rate Limiting & Idempotency
- **Purpose:** the shared, serverless-correct backing store for the rate limiter (5 requests/10 minutes per IP) and the idempotency cache (30-minute TTL) on every public form.
- **Implementation status:** live, production-critical. Provisioned via the Vercel Marketplace integration.
- **Dependencies:** rate limiting and idempotency on `/api/enquiry` and `/api/workshop-registration`. Falls back to a correct-for-local-dev-only in-memory implementation if unset.
- **Pricing model:** free tier, then pay-as-you-go by command count, or fixed monthly plans.
- **Monthly cost:** **$0 today** — usage (a handful of rate-limit/idempotency operations per form submission) is trivially within the free tier even at meaningful traffic.
- **Annual cost:** $0 at current and realistically projected volume.
- **Free tier:** 256 MB data size, 500,000 commands/month.
- **Scaling considerations:** pay-as-you-go beyond free tier is $0.20/100K commands — would need an extremely high submission volume (tens of thousands of form attempts/month) to matter at all.

### 6. Cloudflare Turnstile — CAPTCHA / Bot Protection
- **Purpose:** protects every public form from automated spam/abuse without a visible challenge for genuine visitors (Managed mode).
- **Implementation status:** live, production-critical, real credentials since 2026-07-30.
- **Dependencies:** every public form's submission path.
- **Pricing model:** free.
- **Monthly cost:** **$0**, permanently — Turnstile's Managed mode is free for unlimited use; Cloudflare's own pricing jumps straight to a custom Enterprise tier with no paid mid-tier, and nothing about this project's usage pattern would ever justify Enterprise.
- **Annual cost:** $0.
- **Free tier:** unlimited.
- **Scaling considerations:** none realistically apply.

### 7. Google Sheets API (via Google Cloud service account) — Operational Data Copy
- **Purpose:** writes a secondary, staff-facing copy of every enquiry/booking/registration/request into the "Ordift Studios Operations" spreadsheet, alongside the Supabase-primary write. Purely operational convenience, not a data-integrity dependency (Supabase is always primary).
- **Implementation status:** live, best-effort (failures logged to `sheet_sync_failures`, never block the real submission).
- **Dependencies:** the day-to-day admin habit of checking the Sheet; not required for the platform to function correctly.
- **Pricing model:** free within quota today; Google has announced future billing for quota *overages* later in 2026, not for standard use.
- **Monthly cost:** **$0**, and not expected to change — this project's request volume is far below the quota levels where overage billing would apply.
- **Annual cost:** $0.
- **Free tier:** generous per-minute request quotas (e.g., 300 read requests/minute/project); this project's actual usage is a small fraction of that.
- **Scaling considerations:** worth a light check once Google's overage billing actually takes effect later in 2026, but not a near-term concern.

### 8. GitHub — Source Control
- **Purpose:** hosts the repository, triggers every Vercel deployment, is the single source of truth for all code and migration history.
- **Implementation status:** live, in use since the project's first real commit.
- **Dependencies:** the entire deployment pipeline; every documented rollback point in this project's history is a git tag.
- **Pricing model:** free for private repositories at this team size.
- **Monthly cost:** **$0.**
- **Annual cost:** $0.
- **Free tier:** unlimited private repositories for individuals/small teams — comfortably covers this project.
- **Scaling considerations:** none at this team size.

### Domain & DNS
- **Purpose:** `ordiftstudios.com`, the production domain.
- **Implementation status:** live, connected (`DNS_SNAPSHOT_PRE_LAUNCH.md` documents the pre-launch DNS state).
- **Cost:** **not recorded anywhere in this project's documentation** — the registrar and its renewal cost were never captured. This is a genuine, small documentation gap, not a cost concern (a `.com` registration is typically $10–20/year regardless of registrar) — worth a quick confirmation from whoever holds the registrar account, purely so this register is complete rather than guessed.

---

## Version Priority

| Service | Version | Reasoning |
|---|---|---|
| Vercel | **V1** | Hosting is non-negotiable; nothing runs without it. |
| Supabase | **V1** | Primary data store and auth; the platform has no function without it. |
| Sanity | **V1** | Every public page's content lives here. |
| Resend | **V1** | Required the moment any form needs to actually notify anyone. |
| Upstash Redis | **V1** | Required for rate limiting/idempotency to work correctly across Vercel's multiple serverless instances — the in-memory fallback is a local-dev convenience, not a production-safe substitute. |
| Cloudflare Turnstile | **V1** | Required before public forms can safely go live without a spam-abuse risk. |
| Google Sheets API | **V1** | Already built and connected; free, so no reason to delay even though it's the one service the platform could technically run without (Supabase is primary). |
| GitHub | **V1** | Already the project's source of truth; not optional. |
| Google Analytics | **V2** | Explicitly named in `PRODUCT_ROADMAP.md` as a pending decision, not yet built. Free whenever it happens — the only reason it's not V1 is that no measurement ID/decision exists yet, not cost. |
| *(nothing currently qualifies for V3)* | — | No service in the codebase or an approved roadmap document maps to a "wait until the business scales" tier — everything real is either already essential (V1) or a near-term, cost-free addition (V2). |

---

## Cost Optimisation

| Service | Free alternative | Open-source alternative | Lower-cost alternative | Migration difficulty |
|---|---|---|---|---|
| Vercel | Cloudflare Pages (generous free tier, native Next.js support) | Self-hosted (Docker + any VPS) | Netlify (similar pricing) | **Medium** — the app itself is portable Next.js, but Vercel-specific behavior (some caching/ISR semantics) would need re-verification on another platform. |
| Supabase | Firebase (different model, real migration) | Self-hosted Postgres + self-hosted Supabase (Supabase itself is open-source) | — (Supabase Free is already the cheapest managed option with this feature set) | **High** — RLS policies, Auth, and Realtime are all deeply Supabase-specific; a real migration project, not a swap. |
| Sanity | Strapi (self-hosted, free) | Strapi, Payload CMS | Contentful (comparable pricing, different model) | **Medium** — content itself exports cleanly; the schema/query layer (`contentRepository` abstraction, built specifically to make this possible) would need a new adapter, but that abstraction already exists for exactly this reason. |
| Resend | Amazon SES (cheapest at real scale, more setup) | — | SendGrid, Postmark (similar pricing) | **Low** — email sending is already isolated behind `src/lib/shared/email/dispatch.ts`; swapping providers means rewriting one module, not touching every form. |
| Upstash Redis | Already free at this scale | Self-hosted Redis | — | **Low** — an in-memory fallback already exists in the codebase for exactly this kind of substitution; a self-hosted Redis instance would be a drop-in replacement. |
| Cloudflare Turnstile | Already free, permanently | — | Google reCAPTCHA, hCaptcha (both free too) | **Low** — isolated in `src/lib/turnstile.ts`; a genuinely simple swap if ever needed. |
| Google Sheets API | Already free | — | — | **N/A** — this is already the free, optional, best-effort layer; the realistic "optimization" is removing it entirely once the admin team trusts the Supabase dashboard enough not to need the spreadsheet habit. |

**Overall:** nothing in the current stack is meaningfully over-costed for what it does. The one genuine future decision point remains Supabase's Free-vs-Pro trade-off, already tracked with concrete triggers in `DISASTER_RECOVERY.md` §9.

---

## Usage Scaling

Assumptions: each new client interaction (enquiry, booking, or workshop registration) generates roughly 2 emails (client acknowledgement + admin notification), 1 database write, 1 best-effort Sheets write, and a handful of Redis rate-limit/idempotency operations. "Active clients/month" is read as new form submissions/month, the actual unit every paid service in this stack bills against.

| Service | 10 clients/month | 50 clients/month | 150 clients/month |
|---|---|---|---|
| Vercel | Base plan cost only | Base plan cost only | Base plan cost only — this traffic level is far below where bandwidth/function overages would apply for a site this size |
| Supabase | Free tier | Free tier | Free tier on pure technical limits, but this is roughly the volume level where the *documented* Pro triggers (real bookings, real payments) become relevant — see `DISASTER_RECOVERY.md` §9, not a storage-size trigger |
| Sanity | $0 | $0 | $0 — content volume, not form volume, is what would ever move this, and that's editorial pace, not client count |
| Resend | ~20–30 emails/month — free | ~100–150 emails/month — free | ~300–450 emails/month — still comfortably free (cap is 3,000/month, 100/day) |
| Upstash Redis | Free | Free | Free — even 150 submissions/month is a small fraction of the 500K/month command allowance |
| Cloudflare Turnstile | Free | Free | Free — no volume-based tier exists |
| Google Sheets API | Free | Free | Free — well within per-minute quotas |

**Honest conclusion:** at all three scenarios, **the stack's cost stays effectively flat** — the only paid line item is Vercel's base seat cost, and the only real future cost decision is Supabase Pro, which is driven by business milestones already documented, not raw client volume. This register does not inflate scaling costs that the actual architecture doesn't produce.

---

## Feature Dependency Map

```
Public Content (Home, About, Services, Portfolio, Journal, Workshops, Legal)
  ↓ Sanity (content source)
  ↓ Vercel (renders/serves it)
  Business impact if Sanity is down: public pages fail to render fresh content.
  Business impact if Vercel is down: the entire site is unreachable — the single most business-critical dependency in this stack.

Contact / Booking / Workshop Registration Forms
  ↓ Cloudflare Turnstile (spam/bot prevention, gates everything below it)
  ↓ Upstash Redis (rate limiting + idempotency)
  ↓ Supabase (primary, authoritative data write)
  ↓ Google Sheets (best-effort secondary copy, never blocks the primary write)
  ↓ Resend (client acknowledgement + admin notification emails)
  Business impact if Turnstile is down: forms cannot be submitted at all (fails closed, by design).
  Business impact if Supabase is down: no enquiry/booking/registration can be recorded — the platform's core commercial function stops.
  Business impact if Sheets is down: the admin team's spreadsheet habit is stale; the real record in Supabase is unaffected.
  Business impact if Resend is down: submissions still succeed and are recorded, but nobody gets notified automatically — dead-letter logging (`email_send_failures`) catches this for manual follow-up.

Client Portal / Staff Portal / Admin Dashboard
  ↓ Supabase Auth (login, session)
  ↓ Supabase Database + RLS (every portal page's data)
  ↓ Supabase Realtime (the Active Users presence panel specifically)
  Business impact if Supabase Auth is down: nobody — client, staff, or admin — can log in; the entire portal is unusable.

Admin Reporting (CSV/Excel export, email-a-report)
  ↓ Supabase (data source)
  ↓ write-excel-file (local library, not an external service — no cost, no external dependency)
  ↓ Resend (emailing the report)
  Business impact if Resend is down: exports still work and can be downloaded manually; only the "email it to me" convenience is affected.

Deployment Pipeline
  ↓ GitHub (source of truth, triggers deploys)
  ↓ Vercel (builds and serves every deploy)
  Business impact if GitHub is down: new deploys can't be triggered; the already-live site is unaffected.
```

---

## Future Planned Integrations (Not Yet Implemented)

Only one service meets the bar of "explicitly named in official project planning documentation" — everything else considered and deliberately excluded is listed below the table for transparency.

| Planned service | Purpose | Why it's planned | Recommended introduction stage | Expected cost | Prerequisites | Business justification | Essential or optional |
|---|---|---|---|---|---|---|---|
| Google Analytics | Visitor/traffic analytics for the public site | Named explicitly in `PRODUCT_ROADMAP.md`: "no code built yet; needs a decision + measurement ID before it's worth building" | Any time after launch — no dependency on client volume or revenue, purely a "do you want this data" decision | $0 (free product) | A Google Analytics 4 property, a measurement ID, and — per `DEPLOYMENT.md`'s own note — Cookie Notice approval, since it would introduce the site's first analytics cookie | Gives the business real visitor behavior data instead of relying on enquiry-form conversion alone | **Optional** — genuinely nice-to-have, not required for the platform to operate or for any current feature to function |

**Explicitly excluded, and why:** a payment gateway was considered in this project's early history (`MILESTONES.md`'s retired "Version 3.0 — Commerce" section) but is explicitly marked **unscheduled**, not approved for any version. Per your instruction not to include anything short of an actual approval, it does not appear here. If a payment provider is ever genuinely scheduled in `PRODUCT_ROADMAP.md`, it becomes a real entry in this table at that time — not before.

---

## Testing Infrastructure — Cost Watch (2026-07-30, no cost today)

Version 1.0.5's integration-test layer (`INTEGRATION_TESTING_STRATEGY.md`) runs against the **existing staging** Supabase project, Google Sheets spreadsheet, and Resend configuration — no new service, no new billing account, $0 additional cost today. Recorded here per the standing instruction to log testing-infrastructure cost implications the moment they're identified, even as future considerations rather than current spend:

- **Supabase (staging):** test runs add query/auth volume on top of existing staging usage. Free-tier limits (500MB DB, bandwidth caps) are shared with all other staging activity — if CI ever runs integration tests on every push (Workstream B) *and* staging usage grows, this is a future trigger to watch, tracked here rather than left implicit.
- **Google Sheets API:** current quota (verified 2026-07-30) is 300 read + 300 write requests/minute per project, 60/minute per user — an integration-test suite at Ordift's current scale is nowhere near this. Worth noting: Google has signaled that **exceeding quota may start incurring Cloud billing charges later in 2026** — currently not a concern, but a genuine future watch item, not merely a rate-limit inconvenience.
- **Resend (staging):** the free tier is 3,000 emails/month and 100/day. Per `INTEGRATION_TESTING_STRATEGY.md`, integration tests do **not** send real emails (Resend calls are stubbed at the boundary) specifically to avoid consuming this quota — so this stays $0/no-impact by design, not by accident.
- **Future ephemeral test environment** (the migration path `INTEGRATION_TESTING_STRATEGY.md` designs toward but doesn't build yet): if Ordift Studios ever stands up a dedicated disposable Supabase/Sheets/Resend test environment instead of reusing staging, that becomes a **new row in this register** at that time — likely a second free-tier Supabase project ($0 to start, same upgrade triggers as production) plus whatever the equivalent Sheets/Resend setup costs (both $0 at this scale). Not scheduled; flagged here only so it isn't a surprise when it happens.

---

## Living Register — Maintenance Convention

This document is maintained the same way every other living document in this project is (`OPERATIONS_MANUAL.md`, `MAINTENANCE_SCHEDULE.md`): updated when the underlying reality changes, not on a fixed schedule. Whenever a new external dependency is actually introduced to the codebase — a new npm package tied to a paid service, a new env var for a new provider, or a roadmap item that moves from "planned" to "approved and scheduled" — this register gets a new row with:

- Service name and purpose
- Date introduced
- Version it shipped in
- Pricing model, monthly cost, annual cost
- What it depends on / what depends on it
- Any notes worth preserving (why this provider over an alternative, known limitations)
- A link back to the commit/milestone entry where it was added

---

## Regional Pricing

Per your explicit agreement, this section is deliberately short: **every service in the Current Technology Stack above bills identical global USD pricing regardless of whether the business operates from Ghana, Qatar, or anywhere else** — Vercel, Supabase, Sanity, Resend, Upstash, Cloudflare, and Google Cloud/Sheets all price this way. There is no meaningful Ghana-vs-Qatar comparison to make for any of them, and duplicating identical numbers under two country headings would only add noise.

**Where geography would genuinely matter, if any of these are ever added:** SMS providers, WhatsApp Business Platform's own pricing, payment gateways, and local banking/tax/business-registration costs all do vary by country — but none of these are currently implemented or roadmap-approved (see Future Planned Integrations above), so there is nothing to price yet. When any of them is actually scheduled, that's the point to do a real Ghana-specific (or wherever the business is operating from) cost comparison, grounded in real provider quotes rather than estimated ranges.

---

*Cross-references: `DISASTER_RECOVERY.md` §9 (Supabase Pro-upgrade triggers, not duplicated here), `PRODUCT_ROADMAP.md` (the only source for anything in Future Planned Integrations), `DEPLOYMENT.md` (environment variables per service), `MILESTONES.md` (the retired Commerce/payment-gateway history this register deliberately excludes).*
