# Ordift Studios — Changelog

Internal release log. Each entry is a "tag" in the sense this project
uses versioning (see `MILESTONES.md` for full detail on every item
below) — not a `git tag`, since this repository hasn't been committing
work as it lands (only the original `create-next-app` scaffold commit
exists). If you want an actual git tag/commit marking this point, say so
explicitly — it means deciding what in the current, largely uncommitted
working tree to include, which is a decision for you, not something to
do silently as part of a docs update.

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
