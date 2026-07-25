# Release Notes

Detailed, per-release notes. `CHANGELOG.md` is the running dated log
across every version; this file expands on the *current* release in
more depth — what changed, why, what to verify, what's explicitly not
included yet. Superseded by a new file section each time a version
closes.

Versions before v1.0.0 (below, kept for continuity) were informal
development milestones, not git-tagged releases — see the note at the
top of `CHANGELOG.md`. v1.0.0 is the first official release under this
project's formal semantic-versioning policy.

---

## Version 1.0.0 — Ordift Studios Platform Foundation

**Status: ✅ Released 2026-07-26. Git tag `v1.0.0`, the platform's
permanent rollback point.**

### What this release is

The first official, git-tagged release of the Ordift Studios Platform —
not just the public website, but the full operating foundation behind
it: authentication, a Postgres database with row-level security, a
headless CMS, a Client Portal, and an internal Admin Platform. Everything
built before this point (brand identity, content site, Portfolio/Stories/
Academy, Sanity CMS, Supabase auth) is consolidated here as one verified,
frozen baseline. Full build history for that earlier work lives in
`CHANGELOG.md`'s "Internal Development History" section and in
`MILESTONES.md`.

### Infrastructure foundation

- Next.js 16 (App Router, TypeScript, Tailwind v4, Turbopack), deployed
  to Vercel from the `main` branch.
- Two fully separate Supabase projects — staging (`omtmxvsjmlrnbtxiesqn`)
  and production (`goxuyooxrekzstssjgly`) — with production configured
  to the stricter grant profile ("Automatically expose new tables"
  disabled), catching two real latent grant-gap bugs that staging's
  looser defaults had masked (see RLS & Security below).
- Supabase CLI-managed migration workflow: every schema change is a new,
  immutable migration file; applied to staging first, fully verified,
  then promoted identically to production — never edited after the fact,
  never applied directly to production without the staging pass first.

### Authentication & authorization

- Supabase Auth with a many-to-many role system (`roles` + `user_roles`
  tables) — six roles: `client`, `workshop_participant`, `model`,
  `vendor`, `staff`, `admin`. A person can hold more than one at once.
- Self-signup grants only `client`; `model`/`vendor`/`staff`/`admin` are
  admin-granted only, from the Admin Platform's Users & Roles module.
- `getCurrentUser()` / `hasRole()` / `isStaffOrAdmin()` /
  `primaryPortalPath()` (`src/lib/portal/roles.ts`) provide one
  consistent role-resolution point used across the Client Portal and
  Admin Platform. Staff and admin both land on `/admin`; every other
  role lands on its own portal page.
- Defense-in-depth: `proxy.ts` does a fast, JWT-presence-only redirect
  for unauthenticated `/portal/**` and `/admin/**` requests; each
  layout then does the real per-role check (including a DB role
  lookup), since every page needs the role list anyway.

### Supabase architecture

- `businesses` table, multi-business-ready from the first migration —
  every role grant and every new table added since carries a
  `business_id`, defaulted via `ordift_studios_business_id()`, laying
  the groundwork for the platform to eventually serve more than one
  Ordift business unit without a schema redesign.
- `profiles` (1:1 with `auth.users`), `enquiries` and
  `workshop_registrations` (dual-write targets from the existing Google
  Sheets-based forms — Sheets remains the primary record, Supabase is
  an additive, best-effort mirror that never blocks or corrupts that
  flow), `model_profiles` / `vendor_profiles` / `staff_details`
  (scaffolded, `jsonb metadata` absorbs undefined future fields).
- Admin Platform tables: `enquiry_notes` (append-only staff notes),
  `feature_flags` (business-scoped, instant-toggle), `activity_log`
  (append-only audit trail — no update/delete policy at all, by
  design).

### Database migrations (0001–0005)

1. `0001_init.sql` — core schema, roles, RLS policies enabled on every
   table from day one.
2. `0002_security_advisor_remediation.sql` — closed all 8 warnings
   Supabase's Security Advisor flagged against `0001`, by moving
   `has_role()`/`is_staff_or_admin()` into a non-exposed `private`
   schema (so PostgREST exposes no RPC route for them at all) and
   revoking leftover default-privilege grants to `anon`/`authenticated`.
3. `0003_find_user_by_email.sql` — case/whitespace-normalized,
   `service_role`-only helper used to link guest form submissions to an
   existing account by email match.
4. `0004_admin_platform.sql` — adds `business_id` to `user_roles`;
   creates `enquiry_notes`, `feature_flags`, `activity_log`; fixes a
   real, pre-existing bug — `enquiries` and `workshop_registrations` had
   "staff update" RLS policies since `0001` but no table-level `UPDATE`
   grant, so staff could not actually update either table until this
   migration.
5. `0005_admin_platform_grant_fix.sql` — grants `EXECUTE` on
   `ordift_studios_business_id()` to `authenticated`, fixing "permission
   denied for function" errors when a real staff/admin session (not
   `service_role`) inserts into `enquiry_notes` or `activity_log`.

Every migration was applied to staging first, independently verified,
then promoted identically to production; migration history was
reconciled (`supabase migration repair`) before `0004`/`0005` shipped, so
`supabase migration list` now agrees with reality on both projects.

### RLS & security

- Row Level Security enabled and policied on every table, zero grants
  to `anon` anywhere, every policy scoped `TO authenticated` explicitly.
- Authorization helpers (`has_role`, `is_staff_or_admin`) live in a
  `private` schema, never exposed as PostgREST RPC routes.
- Production's stricter grant profile caught two real bugs that
  staging's looser defaults were masking: the `enquiries`/
  `workshop_registrations` UPDATE-grant gap (fixed in `0004`) and the
  `ordift_studios_business_id()` execute-grant gap (fixed in `0005`) —
  both found via a full production verification pass, not by
  inspection alone.
- Security Advisor re-checked clean (0 errors / 0 warnings / 0 info)
  after every remediation pass.

### Client Portal

- `/portal/client`, `/portal/workshops`, `/portal/model`,
  `/portal/vendor` — each shows the logged-in user's own data, scoped
  by RLS, with honest empty states (no invented content) where no real
  workflow exists yet (Model/Vendor).
- Unaffected by this release's Admin Platform work — re-verified live
  against production as part of the release smoke test.

### Sanity CMS integration

- Project `ixbvr1n8`, org "Ordift Studios" — owned by Ordift, not by
  this engagement. 29 document schemas, 21 fully connected to the live
  site (Home, About, Services, Legal, Navigation, Footer, Site Settings,
  Workshops, Portfolio, Stories, and more).
- `/studio` embedded Studio route, standard Sanity authentication (no
  custom bypass), production dataset set to private visibility, CORS
  origin configured for the production domain.
- Content hub in the Admin Platform (`/admin/content`) provides curated
  deep links into Studio's existing `/studio/structure/<typeName>` URL
  scheme — no separate CMS UI was built.

### Admin Platform Tier 1

Full internal operational console at `/admin/**`: Overview, Enquiries
CRM, Bookings, Content hub, Users & Roles, Feature Flags, Activity log,
Settings — replacing the old `/portal/staff` and `/portal/admin` pages,
which have been retired. See `CHANGELOG.md`'s "Admin Platform Tier 1"
entry for the full module-by-module breakdown.

### Feature Flags

Two deliberately separate systems, never conflated:
- **Vercel env vars** (`LEGAL_PAGES_APPROVED`, `FORMS_SENDING_ENABLED`)
  — infra-critical, deploy-gated, safety-by-friction. `FORMS_SENDING_ENABLED`
  was split out from `LEGAL_PAGES_APPROVED` this release specifically so
  real email sending is never accidentally coupled to legal-page
  publishing status again.
- **DB-backed `feature_flags` table** — business-scoped, admin-editable,
  instant-toggle, for future business-level toggles that don't warrant a
  deploy.

### Activity Log

`activity_log` table, written via `logActivity()`
(`src/lib/admin/activityLog.ts`), read via `getRecentActivity()`. Every
mutating action in the Admin Platform (`role.grant`, `role.revoke`,
`enquiry.stage_change`, `enquiry.note_added`, `flag.toggle`,
`booking.status_change`) is recorded — append-only, no update/delete
policy exists on this table at all, by design.

### Deployment verification

- Vercel deployment `08580b8` confirmed `Ready` and matching
  `git rev-parse HEAD` exactly at release time.
- Full production build, lint, and typecheck clean.
- Studio CORS, Sanity dataset visibility, and the accidental duplicate
  Vercel project (created during earlier setup) all resolved prior to
  this release.

### Production validation

A full production smoke test was performed against the live deployment
immediately before this release, using two temporary test accounts
(staff/admin and client) created via the Supabase Admin API and fully
deleted afterward:

- Vercel deployment: ✅ `Ready`, matches `HEAD`.
- Public website: ✅ loads, zero console errors, all static assets 200.
- `/admin`: ✅ correct redirect for anonymous visitors; correct full
  8-module access for staff/admin.
- Authentication: ✅ signup/login/logout all functioned correctly for
  both test accounts.
- Role-based permissions: ✅ the client test account was correctly
  redirected away from `/admin` and `/admin/users` back to
  `/portal/client` on every attempt.
- Client Portal: ✅ unaffected — `/portal/client` loads correctly with
  the expected empty state.
- Sanity CMS: ✅ `/studio` and a CMS-driven public page (`/about`) both
  loaded correctly, zero console errors.
- Console/server errors: ✅ none observed on any page checked.
- Regressions: ✅ none found.

### Known limitations

- Real email sending (`FORMS_SENDING_ENABLED`) and legal-page publishing
  (`LEGAL_PAGES_APPROVED`) remain off — Resend account setup and
  approved legal copy are still pending; bookings show "Bookings will
  open soon" by design, not a bug.
- `ordiftstudios.com` DNS/domain connection to Vercel not yet done —
  the production deployment is currently reachable only via its Vercel-
  assigned domain.
- Google Sheets/Cloud data-durability integration not started.
- Two unused Sanity API tokens from earlier setup not yet cleaned up.
- No CAPTCHA on auth endpoints yet, and no backup/restore test has been
  performed against the production Supabase project.

### Future roadmap (v1.1.0 and beyond)

Per this release's versioning policy — every feature belongs to a
semantic version, no untagged production releases — the illustrative
roadmap from here is:

- **v1.1.x — Client Experience**
- **v1.2.x — Scheduling & Calendar**
- **v1.3.x — CRM & Client Timeline**
- **v1.4.x — Finance & Invoicing**
- **v1.5.x — AI Assistant**
- **v2.0.x — Multi-business Ecosystem**

This mapping is a planning guide, not a fixed contract — groupings may
shift as real requirements emerge, but every shipped feature will still
land in a tagged, documented version.

---

## Internal Development History (pre-release, informal milestone — not a git tag)

The section below predates this project's formal versioning policy. It
is preserved for continuity — its content is folded into and superseded
by Version 1.0.0 above.

## Version 1.3.0 — Authentication & Client Portal

**Status: ✅ Complete, approved 2026-07-25. Folded into v1.0.0 — Ordift
Studios Platform Foundation.**

### What this release is

A full authentication system and Client Portal, built on Supabase
(Postgres + Auth + Row Level Security), designed around Ordift Studios'
real business workflows — six distinct roles, each seeing only what's
relevant to them — rather than a generic "user accounts" bolt-on.

### What's new for each audience

**For clients:** self-service sign-up, a portal showing their own
enquiries with live status, no more needing to email and ask "where's my
booking at."

**For workshop participants:** the same portal shows their workshop
registrations, including waitlist position and (when issued)
certificates — auto-linked the moment they register with the same email
as their account, no manual linking step.

**For staff/admin:** a read-only operational view of all enquiries and
workshop registrations (staff), plus full user/role management — granting
Model, Vendor, Staff, or Admin access to any account (admin).

**For models/vendors:** a placeholder portal showing their real,
admin-set status — deliberately not inventing a Talent/Vendor management
workflow that doesn't exist yet (matches this project's standing
zero-invention rule).

### What's under the hood

- Every table has Row Level Security enabled from the first migration —
  nobody sees data that isn't theirs, enforced at the database level,
  not just in application code.
- Three migrations, each hardened and live-verified: schema + RLS,
  a Security Advisor remediation (closed all 8 flagged warnings by
  moving authorization helpers into a non-exposed schema), and a
  case/whitespace-normalized email-matching function for linking guest
  form submissions to existing accounts.
- The existing Google Sheets-based enquiry/workshop-registration system
  is **unchanged and remains the primary record** — Supabase is an
  additive, best-effort mirror that never blocks or corrupts that flow
  even if it fails.

### What was tested

Full live end-to-end verification with clearly-labeled test data
(created and fully removed, not left behind): account linking (exact
and case-variant email matches), guest submissions, automatic role
granting, duplicate-submission protection, per-role data access
boundaries, and confirmation that anonymous requests see nothing —
tested with real data present, not just empty tables.

### What's explicitly NOT in this release

- Production deployment — the app runs against one Supabase project
  used for verification; a separate production project, SMTP, CAPTCHA,
  and domain configuration are scoped to the following **Production
  Readiness & Launch Preparation** phase (see `MILESTONES.md`), not part
  of this release.
- Payment collection — workshop payments remain manual-confirmation
  only, as before.
- Any CRM/Admin Dashboard features beyond the basic staff operational
  view and admin role management already described above — full CRM is
  Version 2.0, not started.

### Known limitations (non-blocking, tracked)

- Supabase's Admin API intermittently fails on this project's new
  API-key format for certain calls (`updateUserById`, occasionally
  `listUsers`) — mitigated with retries where it matters, documented in
  `MILESTONES.md`/`DEPLOYMENT.md`.
- Leaked-password protection requires a Supabase Pro plan upgrade — a
  pricing decision for you, not a code gap.
