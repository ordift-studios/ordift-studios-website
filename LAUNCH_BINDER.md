# Ordift Studios — Launch Binder / Production Handover Pack

**Date:** 2026-08-06
**Purpose:** A single, permanent reference for the Ordift Studios platform — architecture, what's been built, what's outstanding, and how to operate, maintain, or hand it over. Intended to stay current as a living document; update it at each future sprint/release boundary rather than treating it as a one-time snapshot.
**Companion documents:** `PRODUCTION_READINESS_PACKAGE.md` (Sprint 1–3 close-out), `RELEASE_CANDIDATE_REVIEW.md` (final pre-launch audit), `LAUNCH_READINESS_IMPLEMENTATION_PLAN.md` (full task-level history), `DOCUMENTATION_INDEX.md` (the map of every other doc in this repo and when to use each).

---

## 1. Executive Summary

Ordift Studios is a multidisciplinary creative house's marketing site, client portal, and admin platform, built on Next.js (App Router) with Sanity as the content CMS and Supabase for authentication, portal data, and the admin platform. The public site is currently held behind a "Coming Soon" gate (`LAUNCH_HOLDING_PAGE`) while final content and launch decisions are finalized. Engineering-wise, the platform is production-ready: three full sprints of launch-readiness work (Critical fixes, High-priority SEO/brand work, and a final High-severity + Medium reassessment pass) are complete, verified, and documented, with zero open Critical or High-severity findings. What remains before public launch is a small set of business decisions (an env-var cleanup call, whether to build analytics before or after launch) and your explicit deployment authorization — not further engineering.

## 2. Architecture Overview

- **Framework:** Next.js (App Router, TypeScript), deployed on Vercel.
- **Content:** Sanity CMS, accessed through a single `contentRepository` abstraction (`src/lib/content/index.ts`) — every page reads through this interface, never Sanity's client directly, so the underlying CMS could theoretically be swapped without touching page code. Two Sanity datasets exist on one project: `staging` and `production`, deliberately isolated (see `STAGING.md`, `CMS_MIGRATION.md`) — no automatic sync between them; real/approved content changes must be mirrored manually into both.
- **Auth & Portal Data:** Supabase — Postgres database, Auth (email/password + magic-link flows), Row-Level Security for multi-role data access (client, staff, admin, super_admin, contractor/collaborator, model, vendor).
- **Admin Platform:** a custom `/admin` surface (server-side auth-gated in its layout, not client-hidden) covering enquiries, bookings, content, users, portfolio management (with a native editor plus Sanity Studio access), reporting, and settings.
- **Client/Collaborator Portal:** `/portal/**`, role-routed, covering project workspaces, deliverables, requests, and workshop registrations.
- **Forms & Data Durability:** Contact/Book and Workshop Registration write to Supabase as the primary store, with best-effort sync to Google Sheets and email notification (Resend) as a durability/visibility layer — failures are logged (`sheet_sync_failures`), not silently dropped.
- **Middleware (`src/proxy.ts`):** gates staging behind Basic Auth (fails closed if unconfigured), gates the whole public site behind the holding page when `LAUNCH_HOLDING_PAGE=true` (with an allowlist for `/admin`, `/portal`, `/studio`, `/api`, `/robots.txt`, `/sitemap.xml`), and handles the `www` → apex redirect.
- **Rate limiting:** Upstash Redis (KV) backed, with an in-memory fallback for local dev.
- **Security:** Cloudflare Turnstile on public forms and portal auth; standard security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`); HSTS and CSP deliberately not yet added (tracked, not blocking).

## 3. Sprint 1–3 Accomplishments

| Sprint | Theme | Outcome |
|---|---|---|
| **Sprint 1** | Critical launch-blockers | Fixed self-referencing related-content across Work/Journal/Workshops; replaced dishonest "no results" empty states with honest "Coming Soon" messaging where a section is genuinely empty. |
| **Sprint 2** | High-priority SEO & brand | Real portfolio proof-of-work surfaced on department pages; canonical tags across every route; site-wide `Organization`/`WebSite` structured data; a branded, correctly-sized (1200×630) default social-share image; a dead-end portfolio filter option removed; a grammar/duplicate-caption fix in production content; a formal closure audit that caught and fixed a real Engineering Standards gap (10 pages missing explicit `openGraph`/`twitter` blocks). |
| **Sprint 3** | Final High-severity findings + Medium reassessment | Fixed a `Workshop` TypeScript type gap that was silently discarding editor-authored SEO input; added branded 404/error boundaries (previously Next's bare defaults); closed two sitemap gaps; added `Event`/`Service` structured data to Workshop/Service pages; fixed a real accessibility gap (empty `alt=""` on client deliverable thumbnails); closed out footer content parity across both Sanity datasets, surfacing and resolving a genuine dataset-configuration discovery along the way. |

Full task-by-task detail (Objective, Effort, Risk, Dependencies, Acceptance Criteria, Validation) lives in `LAUNCH_READINESS_IMPLEMENTATION_PLAN.md`.

## 4. Outstanding Backlog

**Blocked (need something from you, not more engineering):**
- Founder photo for `/about/founder` — no code path without a real photograph.
- Talent nav placement — waiting on the Talent directory (Phase 1B, not yet built).

**Decisions needed:**
- `LEGAL_PAGES_APPROVED` env var — remove (now vestigial) or rewire as a real kill-switch?
- Analytics — build before or after launch? (No code exists yet; needs a measurement-ID decision first.)

**Sprint 4 candidates** (full list in `LAUNCH_READINESS_IMPLEMENTATION_PLAN.md`'s Sprint 4 section):
- Content-revalidation (ISR/webhook) strategy design — deliberately deferred rather than rushed
- Competitive benchmarking pass, dedicated WCAG audit, gallery lightbox + richer JSON-LD
- Full Portfolio/Journal/Workshops content population (currently mostly single-example/sample content)
- Gallery caption rewrite for the one live case study (needs the actual photos reviewed, not guessable from data)
- Shared `buildPageMetadata()` helper (reduce 13x-repeated metadata object shape)
- Sanity API token scoping (currently one token for both reads and writes)
- `server-only` package adoption on write-token modules
- Decide the fate of `src/lib/content/local/` (confirmed dead code — delete, or repurpose as test fixtures)
- Add `Strict-Transport-Security` header
- HOLDING_PAGE_ALLOWLIST prefix-matching hardening (segment-anchor instead of substring match)
- Fix remaining raw `<img>` tags in admin-only surfaces
- Extend `prefers-reduced-motion` to hover/transition animations
- Make Turnstile fail closed instead of open when misconfigured

## 5. Rollback Procedures

- **Application code:** every sprint's commits are atomic and individually revertible (`git revert <sha>`), or reset to the nearest tagged sprint boundary (`sprint-1-complete`, `sprint-2-complete`, and `sprint-3-complete` once tagged). Sprint 3's changes are currently uncommitted working-tree edits — trivially discardable with `git checkout`.
- **Content (Sanity):** Studio retains document revision history natively; no custom rollback tooling was built or needed.
- **Database (Supabase):** covered by the disaster-recovery process established earlier in this engagement — see `DISASTER_RECOVERY.md` for the full backup/restore procedure and schedule.
- **Deployment (Vercel):** every deployment is a discrete, addressable build — Vercel's own instant-rollback-to-previous-deployment feature is the primary lever if a bad deploy ever needs reverting.

## 6. Deployment Checklist

- [ ] Review `PRODUCTION_READINESS_PACKAGE.md` and `RELEASE_CANDIDATE_REVIEW.md`
- [ ] Resolve the `LEGAL_PAGES_APPROVED` decision
- [ ] Commit Sprint 3's working-tree changes; tag `sprint-3-complete`
- [ ] `git push origin main` — requires your explicit authorization
- [ ] Confirm the Vercel build succeeds
- [ ] Re-run the regression checklist against the deployed Preview/Production URL
- [ ] Decide when `LAUNCH_HOLDING_PAGE` itself comes down (a separate, later authorization from the code push)

## 7. Environment Variables Checklist (names only — no values, no secrets)

| Variable | Purpose |
|---|---|
| `SITE_ENV` | Distinguishes staging vs. production behavior in middleware |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL, used for metadata/sitemap/canonicals |
| `STAGING_BASIC_AUTH_USER` / `STAGING_BASIC_AUTH_PASS` | Staging's Basic Auth gate (fails closed if unset) |
| `LAUNCH_HOLDING_PAGE` | Public holding-page gate toggle |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` / `NEXT_PUBLIC_SANITY_DATASET` | Which Sanity project/dataset the app (and Studio) connects to |
| `SANITY_API_VERSION` / `SANITY_API_TOKEN` | Sanity API access — token is server-only, read+write scoped |
| `NEXT_PUBLIC_CONTACT_EMAIL` / `NEXT_PUBLIC_WHATSAPP_NUMBER` | Public contact details |
| `LEGAL_PAGES_APPROVED` | Legacy legal-page approval gate — currently vestigial, decision pending |
| `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` / `EMAIL_ADMIN_NOTIFICATION_TO` / `OPERATIONS_EMAIL` | Transactional email (Resend) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` / `GOOGLE_SHEETS_SPREADSHEET_ID` | Google Sheets durability sync |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis — rate limiting |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics — declared, not yet consumed by any code |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile CAPTCHA |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | Supabase connection — secret key is server-only |

Full documented purpose/rationale for each: `.env.example`.

## 8. Sanity Schema Inventory

36 document-type schema files under `src/sanity/schemaTypes/documents/`:

`aboutPage`, `announcementBanner`, `author`, `brand`, `certificate`, `client`, `faq`, `footerSettings`, `founder`, `gallery`, `homepage`, `instructor`, `journalCategory`, `journalPost`, `landingPage`, `legalPage`, `navigation`, `partner`, `portfolioCategory`, `portfolioCollection`, `portfolioProject`, `pricing`, `pulseArticle`, `pulseCategory`, `pulseOpportunityType`, `pulseRegion`, `pulseSource`, `service`, `siteSettings`, `sponsor`, `tag`, `teamMember`, `testimonial`, `venue`, `workshop`, `workshopCategory`.

Singletons (one document each, pinned in the Studio desk structure): `aboutPage`, `announcementBanner`, `footerSettings`, `homepage`, `landingPage`, `navigation`, `pricing`, `siteSettings`. Everything else is a list type. Not every schema is yet wired to `ContentRepository`/a live page — see `CMS_MIGRATION.md` for which are "schema-prepared but not connected."

## 9. Route Inventory (public, from the last clean build)

**Static/content routes:** `/`, `/about`, `/about/founder`, `/services`, `/services/[slug]` (7 departments), `/work`, `/work/[slug]`, `/journal`, `/journal/[slug]`, `/journal/authors/[slug]`, `/workshops`, `/workshops/[slug]`, `/workshops/instructors/[slug]`, `/book`, `/legal/[slug]` (4 documents), `/coming-soon`.

**System routes:** `/sitemap.xml`, `/robots.txt`, `/opengraph-image`, `/twitter-image`, `/not-found` (branded 404 boundary), root `error.tsx` boundary.

**Authenticated surfaces (not public):** `/admin/**` (18+ modules), `/portal/**` (auth, client/collaborator/vendor/model workspaces), `/studio/**` (Sanity Studio).

**Internal/dev-only:** `/style-preview/**` — noindexed, not linked from nav.

Full current build output (route-by-route static/dynamic classification) is reproducible any time via `npm run build`.

## 10. SEO Inventory

- Canonical tags: every public route.
- Open Graph + Twitter Cards: every public route, explicit (not relying on root-layout fallthrough), branded 1200×630 default image where no page-specific image exists.
- Structured data by type: `Organization`+`WebSite` (site-wide), `CreativeWork` (portfolio), `Article`/`VideoObject` (journal), `Event` (workshops), `Service` (services), `WebPage` (legal).
- Sitemap: 37 URLs, auto-generated from live content.
- robots.txt: correct disallow list (`/admin`, `/portal`, `/studio`, `/style-preview`).

## 11. Analytics Integrations

**None implemented yet.** `NEXT_PUBLIC_GA_MEASUREMENT_ID` is declared in `.env.example` but no code anywhere consumes it — confirmed via full-codebase search. This is a deliberate, already-documented "decide first, build second" item in `PRODUCT_ROADMAP.md`, not an oversight. Vercel's own Web Analytics/Speed Insights were considered as a complementary (not substitute) signal per that same roadmap entry.

## 12. Third-Party Services

| Service | Role |
|---|---|
| **Vercel** | Hosting, deployment, edge middleware, env var management |
| **Sanity** | Content CMS (two datasets: `staging`, `production`) |
| **Supabase** | Auth, Postgres database, Row-Level Security |
| **Resend** | Transactional email |
| **Google Sheets (Service Account)** | Form-submission durability/visibility sync |
| **Cloudflare Turnstile** | CAPTCHA on public forms and portal auth |
| **Upstash Redis** | Rate limiting (Vercel Marketplace add-on) |
| **GitHub** | Source control, CI (GitHub Actions) |

Every account is owned by Ordift Studios, per the project's standing ownership policy — engineering access is as a collaborator, never primary owner.

## 13. Known Limitations

- No analytics — launch would happen with zero visitor-behavior measurement until built.
- No HSTS or CSP headers yet (both tracked, both Low severity, platform TLS still protects the connection).
- Portfolio/Journal/Workshops content is still mostly single-example/sample-labeled content, not a full real content library — Sprint 4 territory.
- Founder photo missing — the one piece of Sprint 1–3 scope that couldn't be completed without an asset from you.
- No Vercel Preview-environment Sanity configuration — preview deployments currently have no CMS connection (not exercised by this engagement's workflow, worth fixing before relying on preview deploys for content review).
- `notFound()` thrown from a nested route segment doesn't pick up the branded `not-found.tsx`'s own `<title>` (cosmetic only — content and the SEO-critical noindex signal are both correct).

## 14. Maintenance Schedule

Established earlier in this engagement — see `MAINTENANCE_SCHEDULE.md` for the full recurring-task calendar (backups, dependency updates, credential rotation cadence, etc.). Nothing in Sprint 1–3 changed that schedule; it remains the operative reference.

## 15. Version History

| Tag/Milestone | What |
|---|---|
| `v1.0.0` | Foundation freeze — architecture complete |
| `v1.0.0-lc1` | Launch Candidate 1 |
| `v1.3.0-complete` | Most recent prior tagged milestone before this sprint sequence |
| `sprint-1-complete` | Sprint 1 Critical fixes closed |
| `sprint-2-complete` | Sprint 2 High-priority SEO/brand work closed |
| `sprint-3-complete` | *(pending — to be tagged after your review of this binder)* |

Full historical detail: `MILESTONES.md`, `CHANGELOG.md`, `VERSIONS.md`.

## 16. Go/No-Go Recommendation

**GO**, per the full assessment in `RELEASE_CANDIDATE_REVIEW.md` — no open Critical or High-severity finding anywhere in the platform. Remaining items are business decisions and Sprint 4 polish, not defects. Deployment itself remains gated behind your explicit authorization, per your standing instruction throughout this engagement.

---

*This binder should be updated at each future sprint or release boundary — treat it as the living entry point for anyone (including a future engineer, or future-you) who needs to understand the state of this platform without re-reading the entire project history.*
