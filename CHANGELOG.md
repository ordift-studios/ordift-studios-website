# Ordift Studios — Changelog

Official releases, each git-tagged and semantically versioned, starting
from **v1.0.0** (2026-07-26). Each entry summarizes the corresponding
`RELEASE_NOTES.md` section — read that for full detail. Versioning
policy from v1.0.0 forward: every feature belongs to a semantic version;
no untagged production releases (see `MILESTONES.md` for the roadmap and
`VERSIONS.md` for the policy statement).

Everything before v1.0.0 was built and iterated without formal git tags
or semver. That work is preserved below under "Internal Development
History" for continuity — the version numbers used there ("1.0" through
"1.3.0") were informal internal milestone labels only, never git tags,
and are superseded by the official sequence starting at v1.0.0.

## v1.0.0 (Production Hardening) — Access Management, Email Infrastructure & Roadmap — 2026-07-27

Added to the v1.0.0 baseline (not a new tagged version — per explicit
instruction, everything through this date is still considered the
stable "Version 1.0" baseline; see `PRODUCT_ROADMAP.md` for what comes
next as genuinely new versions).

**Added:**
- Full Identity & Access Management system (migration `0009`): `super_admin`
  and `contractor` roles, account suspend/deactivate/expiry/restore
  lifecycle, project-scoped collaborator access, Users & Roles admin UI,
  invite-collaborator flow, collaborator-facing portal
  (`/portal/collaborator`), Titles/Engagement-Types lookup management.
- Production email infrastructure: Resend custom SMTP on
  `auth.ordiftstudios.com` (SPF/DKIM/DMARC verified), all 6 Supabase Auth
  email templates rebranded with Ordift Studios navy/gold styling and the
  official logo.
- `PRODUCT_ROADMAP.md` — the new authoritative long-term roadmap
  (supersedes the illustrative version tables in `VERSIONS.md` and
  `MILESTONES.md`), covering Versions 1.1 (Internal Organization/Grade
  system), 1.2 (People & Skills), 2.0 (Talent Management), 3.0 (Studio
  Operations), and 4.0 (Business Intelligence & Ordift Pulse), plus a
  Vision 2030 statement and Engineering Standards for future work.
- `ADMIN_GUIDE.md` — full operational manual for roles, permissions,
  invitations, account lifecycle, email infrastructure, and (added this
  date) an Internal Governance section covering naming/security/QA/
  documentation/release/change-management standards.
- `DOCUMENTATION_INDEX.md` — cross-reference map of every project
  document.
- Dynamic copyright year in the site footer (`© {year} Ordift Studios`)
  — replaces a hardcoded year, updates automatically.

**Security updates:**
- 3 production-only `service_role` grant gaps found and fixed
  (migrations `0010`–`0012`) — see `PRODUCTION_READINESS_REPORT.md` for
  root cause (production's stricter "automatically expose new tables"
  setting, working as intended).
- Supabase Security Advisor reviewed: 0 errors; 2 known/accepted
  warnings documented (a single-tenant `SECURITY DEFINER` helper
  function, and leaked-password protection pending a Pro-plan upgrade
  decision).

**Database migrations:** `0009_access_management.sql`,
`0010_service_role_grants_fix.sql`,
`0011_service_role_select_projects.sql`,
`0012_service_role_update_profiles.sql` — all additive, applied to
staging then production, independently verified.

**Known issues:** Reply-To header for auth emails not configurable
through Supabase's dashboard (would need a custom Auth Hook); Magic
Link/Reauthentication templates are branded but have no live trigger
path in the current app yet.

**Upgrade notes:** none — this is documentation and additive schema
only; no breaking changes to any existing role, page, or API.

---

## v1.0.0 — Ordift Studios Platform Foundation — 2026-07-26 ✅ RELEASED

The first official, git-tagged production release. Consolidates every
system built to date — the brand/content site, Supabase authentication
and Client Portal, Sanity CMS, and the internal Admin Platform (Tier 1)
— into one verified, frozen baseline. Full detail in `RELEASE_NOTES.md`.

**Delivered:**
- Production deployment on Vercel, smoke-tested end to end: public
  site, `/admin`, authentication, role-based access control, Client
  Portal, and Sanity Studio all verified live with zero console or
  server errors and no regressions.
- Supabase schema through migration `0005`, RLS-enforced on every
  table, business-scoped (`business_id`) for future multi-business
  support — both staging and production independently verified.
- Admin Platform Tier 1 (`/admin/**`): Overview, Enquiries CRM,
  Bookings, Content hub, Users & Roles, Feature Flags, Activity log,
  Settings — supersedes the old `/portal/staff` and `/portal/admin`
  pages, which have been retired.
- Two deliberately separate feature-flag systems: Vercel env vars
  (`LEGAL_PAGES_APPROVED`, `FORMS_SENDING_ENABLED`) for infra-critical,
  deploy-gated toggles; a DB-backed `feature_flags` table for instant,
  business-scoped toggles.
- Infrastructure Phase 1 declared frozen: authentication, Supabase
  schema, migration history, RLS policies, feature flag system,
  business-scoped architecture, and deployment workflow are now the
  project's stable baseline (see `MILESTONES.md`).

**Known limitations (non-blocking, tracked):**
- Real email sending (`FORMS_SENDING_ENABLED`) and legal-page
  publishing (`LEGAL_PAGES_APPROVED`) remain off pending Resend setup
  and approved legal copy — bookings show "Bookings will open soon" by
  design, not a bug.
- `ordiftstudios.com` DNS/domain connection to Vercel not yet done.
- Google Sheets/Cloud data-durability integration (Phase 3 of the
  original production plan) not started.
- Two unused Sanity API tokens from earlier setup not yet cleaned up.

**Versioning policy from this release forward:** every feature belongs
to a semantic version; no untagged production releases. Planned roadmap
(illustrative, not a fixed contract): v1.1.x Client Experience, v1.2.x
Scheduling & Calendar, v1.3.x CRM & Client Timeline, v1.4.x Finance &
Invoicing, v1.5.x AI Assistant, v2.0.x Multi-business Ecosystem.

---

## Internal Development History (pre-release, informal milestones — not git tags)

Everything below was built and verified before this project adopted
formal git-tagged semantic versioning. The version numbers used here
("1.0" through "1.3.0", plus the unnumbered phases) were internal labels
for tracking scope during development — never git tags, and not part of
the official v1.0.0+ sequence above. Preserved here for historical
continuity, per explicit instruction not to lose this record.

### Admin Platform Tier 1 — 2026-07-25 ✅ complete (folded into v1.0.0)

Internal operational console at `/admin/**`, built module by module (10
atomic commits, each independently verified against staging before
merging), superseding the old `/portal/staff` and `/portal/admin` pages.

**Delivered:**
- Route shell with auth + role gate (`layout.tsx`), nav filtered by
  role (staff/admin see the same 8 modules; Users & Roles, Feature
  Flags, and Settings are admin-only).
- **Overview** — live counts (enquiries, model/vendor profiles, open
  workshops) plus a recent-activity feed.
- **Enquiries CRM** — stage + search filtering, per-enquiry detail page
  with stage-change and staff notes (append-only `enquiry_notes` table).
- **Bookings** — workshop registration list/detail with registration-
  and payment-status management, reusing the existing status vocabulary
  verbatim (no new terms invented).
- **Content hub** — curated deep links into Sanity Studio's existing
  `/studio/structure/<typeName>` URL scheme, grouped by content area.
- **Users & Roles** — evolved from the old `/portal/admin` page: grant/
  revoke roles, with self-revoke-of-own-admin protection preserved and
  every change logged to the activity log.
- **Feature Flags** — admin-only CRUD UI for the new `feature_flags`
  table (business-scoped, instant-toggle), explicitly kept separate
  from the Vercel-env-var infra flags (see Settings).
- **Activity log** — `activity_log` table (staff/admin insert+read
  only, no update/delete — audit-trail immutability by design), written
  via a single `logActivity()` helper from every mutating action above.
- **Settings** — read-only status page for `LEGAL_PAGES_APPROVED`,
  `FORMS_SENDING_ENABLED`, environment, and Sanity site settings.
- **Database**: migration `0004_admin_platform.sql` (adds `business_id`
  to `user_roles`; creates `enquiry_notes`, `feature_flags`,
  `activity_log`; fixes a pre-existing grant gap — `enquiries` and
  `workshop_registrations` had "staff update" RLS policies since `0001`
  but no table-level `UPDATE` grant, so staff literally could not update
  either table until this migration) and `0005_admin_platform_grant_fix.sql`
  (grants `EXECUTE` on `ordift_studios_business_id()` to `authenticated`,
  fixing "permission denied for function" on staff/admin inserts).

**Verification:** both migrations applied to staging first, fully
verified, then promoted identically to production; every module
exercised live against staging with real test data, cleaned up before
each commit; full local build/lint/typecheck pass before deploy.

## Version 1.3.0 — Authentication & Client Portal — 2026-07-24 ✅ COMPLETE

Role-based authentication and Client Portal on Supabase (Postgres + Auth
+ Row Level Security), built around real business workflows rather than
a generic account system.

**Delivered:**
- Six roles (`client`, `workshop_participant`, `model`, `vendor`,
  `staff`, `admin`), many-to-many via `user_roles`, RLS enabled and
  policied on every table from the first migration.
- Schema designed for future features without a redesign: `businesses`
  (multi-business-ready), `jsonb metadata` on scaffolded role tables,
  `crm_stage` enum matching the approved CRM lifecycle, payment columns
  pre-modeled but unpopulated (no payment provider approved yet).
- Six live portal experiences (`/portal/client`, `/workshops`, `/model`,
  `/vendor`, `/staff`, `/admin`), each scoped to only what that role
  needs — honest empty/placeholder states where no real workflow exists
  yet (Model/Vendor), not invented features.
- Dual-write from the existing enquiry/workshop-registration API routes
  into Supabase, alongside the unchanged, still-primary Google Sheets
  record — best-effort, never blocking the existing flow.
- Three migrations, fully hardened and live-verified: `0001_init.sql`
  (schema + RLS), `0002_security_advisor_remediation.sql` (closed 8
  Security Advisor warnings by moving RLS-authorization helpers into a
  non-exposed `private` schema and locking down function grants),
  `0003_find_user_by_email.sql` (case/whitespace-normalized email
  matching for the dual-write's account-linking).
- Full live end-to-end verification with clearly-labeled, fully-removed
  test data: account linking (exact + case-variant), guest submissions,
  role auto-grant, duplicate-submission idempotency, client/staff RLS,
  and anonymous-access protection with real data present.

**Real bugs found and fixed during live verification (not just
theoretical hardening):**
- `revoke ... from public` doesn't touch Supabase's separate default
  grants to `anon`/`authenticated` — four functions were still
  RPC-reachable despite the revoke. Root-caused and fixed in 0002.
- `/portal/signup` wasn't exempted from the auth-required middleware
  redirect — self-service signup was unreachable the moment Supabase
  went live.
- The Admin portal's "only 1 of ~10 users" discrepancy was root-caused
  to an inaccurate Supabase Dashboard estimate (the real count was 1,
  confirmed via 8+ repeated authoritative API calls) — but surfaced a
  real, separate issue: Supabase's Admin API intermittently fails with
  a JWT-signing error on this project's new key format. Fixed with
  retry-with-backoff and an honest error state instead of a silently
  misleading empty list.

**Known non-blocking items, tracked for pre-launch (see
`DEPLOYMENT.md`):** leaked-password protection (needs Supabase Pro),
production Site URL/Redirect URLs still pointing at localhost,
production SMTP, CAPTCHA on auth endpoints, a second Supabase project
for staging/production separation, and Secret Key rotation (flagged as
compromised during setup, explicitly deferred to right before the
Production Readiness & Launch Preparation phase — **not yet done**, see
`MILESTONES.md` V1.3 "Final closure").

## Production Readiness & Launch Preparation — in progress, 2026-07-25

Not a numbered product version — a dedicated infrastructure/launch-
hardening phase, deliberately scoped to introduce zero new features and
change no business logic. See `MILESTONES.md` for the full phase
breakdown (A–F) and live action log.

## Version 1.2.6 — Site-Wide CMS Migration — 2026-07-24

Every remaining editable component (Homepage, About, Founder, Services,
Navigation, Footer, Legal Pages, Site Settings) moved into Sanity,
verified word-for-word against the previously hardcoded copy.

## Version 1.2.5 — CMS (Sanity) Integration — 2026-07-24

Sanity project created under Ordift Studios' ownership and connected
live — all 29 requested content types schema'd, 21 fully wired end to
end.

## Version 1.2 — Academy (Workshop Platform expansion) — 2026-07-23–24

Premium workshop platform: categories, instructor profiles, learning
outcomes, agenda, venue info, countdown timer, FAQs, certificates,
waitlist, related workshops — architecture supporting multiple
instructors/locations/multi-day/recurring workshops from the start.

## Version 1.1 — Creative Showcase — 2026-07-23

Portfolio rebuilt as a full Portfolio Management System (not a static
gallery) and Journal built as a long-term publishing platform, branded
"Stories" on-page — both CMS-agnostic via the `ContentRepository`
abstraction introduced this version.

## Version 1.0 — Foundation — 2026-07-22–23

Brand identity, Home/About/Services/Contact, unified 5-step enquiry
system with Google Sheets integration, workshop registration
architecture, security baseline (rate limiting, idempotency, honeypot,
staging isolation).
