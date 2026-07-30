# Ordift Studios — Versioned Milestone Roadmap

Status: **living document**, established 2026-07-23 at your request to manage
the project through versioned milestones rather than individual feature
requests from here forward. Update this file's checkboxes as work lands,
and add a dated note under a version when its scope changes.

Architectural reasoning behind each version's sequencing lives in
[ARCHITECTURE.md](ARCHITECTURE.md) — read that alongside this if a version's
ordering seems surprising (e.g. why CRM/Client Accounts wait for a real
database).

**Versioning policy (effective 2026-07-26, v1.0.0 forward):** every feature
belongs to a semantic version; no untagged production releases. Everything
in this document before "v1.0.0 — Ordift Studios Platform Foundation" below
is preserved as **Internal Development History** — informal milestone labels
used to track scope during development, never git tags, superseded by the
official sequence starting at v1.0.0. Full policy statement in `VERSIONS.md`;
release detail in `RELEASE_NOTES.md`; dated log in `CHANGELOG.md`.

---

## 🔒 Version 1.0 feature implementation complete — architecture frozen (2026-07-27)

**Status, effective this date:** every feature planned for Version 1.0 — including the Portfolio/Journal/Workshops media architecture and the Ordift Pulse × Stories/Journal integration immediately below — is built, verified, committed, and deployed. Tagged `v1.0.0-lc1` (see `VERSIONS.md`). This closes software-development work on Version 1.0.

**Architecture freeze, effective this date:** no new major systems, portals, databases, schemas, or infrastructure ship unless a critical defect requires one. This covers every system built so far — the public site, Sanity CMS, Supabase auth/IAM, Client/Collaborator Portals, Admin Platform, email infrastructure, media architecture, and Ordift Pulse.

**What changes from here:** the project moves into **Launch Candidate 1 (LC1)** — production readiness, UI/UX polish, content population, performance, accessibility, SEO, responsiveness, and launch QA. See `LAUNCH_CANDIDATE_1.md` for the phase-by-phase plan and findings. Refinement of what exists, not addition of what doesn't, is the standing rule until LC1 concludes.

---

## Recommended Build Order (confirmed 2026-07-23)

1. [x] Portfolio
2. [x] Journal
3. [x] Integrate Workshops into main navigation *(done as part of V1.2, ahead of this list — already live in `NavBar`/`Footer`)*
4. [x] CMS (Sanity) integration — **live and connected, including all site-wide content** (project `ixbvr1n8`, org "Ordift Studios")
5. [x] Authentication & Client Portal — **✅ complete, live and fully verified** (see V1.3 below)
6. [~] Production Readiness & Launch Preparation — **in progress** (not a numbered product version — a dedicated infrastructure/launch-hardening phase; see dedicated section below)
7. [ ] CRM / Admin Dashboard (V2.0)
8. [ ] Payment integration
9. [ ] Public launch (after the 2-month portfolio project)

**Permanent engineering principle (adopted 2026-07-24, applies from here forward):** no feature ships unless it has a clear place in the long-term Ordift ecosystem — CMS, Client Portal, CRM, Academy, Talent Platform, Marketplace, or the future mobile app. If it can't eventually connect to one of those, that's a reason to challenge it before building, not after.

---

## v1.0.0 — Ordift Studios Platform Foundation ✅ RELEASED

**Released:** 2026-07-26. Git tag `v1.0.0`, the platform's permanent
rollback point. Full detail in `RELEASE_NOTES.md`; dated summary in
`CHANGELOG.md`.

The first official, git-tagged release — consolidates the entire
Internal Development History below (brand/content site, Sanity CMS,
Supabase authentication, Client Portal) plus this session's Admin
Platform Tier 1 build into one verified, frozen baseline.

**Frozen as of this release — the project's stable baseline going
forward, per explicit instruction. Do not refactor or redesign these
without a genuine architectural need from a future feature:**
- Infrastructure (Next.js/Vercel deployment workflow)
- Authentication (Supabase Auth, six-role system)
- Supabase schema (migrations `0001`–`0005`)
- Database migration workflow (staging-first, immutable, never edited
  after applying)
- RLS policies
- Business-scoped architecture (`business_id` on every relevant table)
- Feature Flag system (both the Vercel-env-var and DB-backed layers)
- Activity Log
- Deployment workflow
- Admin Platform Tier 1 (`/admin/**`)

**Every feature from here forward reuses this foundation rather than
replacing it.** New modules are new versions (see roadmap below), not
architectural changes to the above.

### Roadmap from v1.0.0 forward

**Superseded 2026-07-27 by `PRODUCT_ROADMAP.md`** — the illustrative
list that used to live here (Client Experience, Scheduling & Calendar,
CRM & Client Timeline, Finance & Invoicing, AI Assistant, Multi-business
Ecosystem) is retired; none of it was ever built under those names. See
`PRODUCT_ROADMAP.md` for the current authoritative plan: Version 1.1
(Internal Organization/Grade system), 1.2 (People & Skills), 2.0 (Talent
Management), 3.0 (Studio Operations), 4.0 (Business Intelligence &
Ordift Pulse), each with full vision/objectives/features/dependencies/
risks/release criteria.

The pre-v1.0.0 "Version 2.0 — Business Platform" / "2.5 — Talent" /
"3.0 — Commerce" / "4.0 — Ecosystem" headings further down this document
are retained for historical continuity only (see the note above each) —
their still-relevant scope items now carry forward into
`PRODUCT_ROADMAP.md`'s versions instead of the retired table above.

---

## Internal Development History (pre-release, informal milestones — not git tags)

Everything below predates this project's formal semantic-versioning
policy. The version numbers used here ("1.0" through "4.0") were informal
labels for tracking scope during development — never git tags, and fully
superseded by the v1.0.0+ sequence above. Preserved for historical
continuity, per explicit instruction not to lose this record.

### Admin Platform Tier 1 — 2026-07-25 ✅ complete (folded into v1.0.0)

Internal operational console at `/admin/**`, built module by module (10
atomic commits, each independently verified against staging before
merging), superseding the old `/portal/staff` and `/portal/admin` pages.
Full module-by-module breakdown in `CHANGELOG.md`'s "Admin Platform Tier
1" entry. Summary:

- [x] Route shell, auth + role gate, role-filtered nav
- [x] Overview (live stats + recent-activity feed)
- [x] Enquiries CRM (stage/search filtering, detail page, staff notes)
- [x] Bookings (registration/payment status management)
- [x] Content hub (curated Sanity Studio deep links)
- [x] Users & Roles (evolved from `/portal/admin`, now activity-logged)
- [x] Feature Flags (admin-only CRUD, business-scoped, instant-toggle —
      deliberately separate from the Vercel-env-var infra flags)
- [x] Activity Log (append-only audit trail, no update/delete policy)
- [x] Settings (read-only status: legal/forms flags, environment, site
      settings)
- [x] Migrations `0004_admin_platform.sql` (new tables + a real grant-gap
      fix for `enquiries`/`workshop_registrations` UPDATE) and
      `0005_admin_platform_grant_fix.sql` (execute-grant fix for
      `ordift_studios_business_id()`), both staged-then-production
- [x] `primaryPortalPath()` updated so staff/admin land on `/admin`;
      old `/portal/staff` and `/portal/admin` pages retired

### Infrastructure Phase 1 — 2026-07-25 ✅ complete and frozen (folded into v1.0.0)

Post-Auth infrastructure cleanup, run before Admin Platform Tier 1
began: verified and deleted an accidental duplicate Vercel project;
decoupled real email sending from legal-page approval via a new
`FORMS_SENDING_ENABLED` flag (kept deliberately separate from
`LEGAL_PAGES_APPROVED`, which gates only legal-page publishing);
reviewed and corrected Sanity production dataset visibility (set to
private); fixed Sanity Studio CORS for the production origin. Declared
frozen alongside Admin Platform Tier 1 — see the freeze list under
v1.0.0 above.

## v1.1.0 — Client Experience 📋 ROADMAP APPROVED, not started

**Status:** Roadmap finalized 2026-07-26 (product-first reorder +
Deliverables refinement) — milestones and tasks below, still no code
written. Implementation of Milestone 1 waits for a separate explicit
go-ahead. Builds entirely on the frozen v1.0.0 foundation
(`src/lib/portal/roles.ts`, existing RLS policies, `activity_log`,
`enquiries`/`workshop_registrations` tables) — no architectural changes.

**Current baseline this version builds on** (confirmed by reading the
live code, not assumed): `/portal/client` shows a flat list of the
client's own enquiries (reference, service, CRM stage, payment status)
with an honest empty state; `/portal/workshops` shows registrations
similarly. There is no detail page, no client-editable profile, no
notifications, no deliverables area, and no client/staff messaging
today — this version's scope fills exactly those gaps, not new business
capabilities beyond them.

**Scope decisions (approved 2026-07-26):**
1. **Reschedule/cancellation requests** — clients may *submit* a
   reschedule or cancellation request; only staff/admin can approve or
   reject it. The request never changes CRM stage or booking status
   directly from the client side. (Milestone 4.)
2. **No two-way messaging in v1.1.0** — client-visible communication
   stays to status updates and staff-visible notes only (existing
   `enquiry_notes` pattern), same as today. No messaging milestone exists
   in this version.
3. **In-app notifications only** — Milestone 5 ships an in-app
   notification center. Email notifications are explicitly deferred to
   a later version, pending the Resend integration and
   `FORMS_SENDING_ENABLED` going live.

**Implementation order (approved 2026-07-26, product-first):** ordered
to maximize customer-facing value first — the dashboard and project
timeline land before profile/account management, since they're what
make the portal feel like a premium client workspace from the first
login, not a settings page.

### Milestone 1 — Client Dashboard (Home Overview) ✅ complete
**Shipped:** 2026-07-26, commit `2d06035`. Verified live against staging
(mixed-stage test client + a zero-data client for the empty state, both
mobile and desktop widths, zero console errors) before merging; all test
data removed afterward.

Treated as the client's **workspace**, not a traditional booking-status
page — design reference: Notion / Linear / Stripe Dashboard / Vercel
Dashboard. Built as an extensible widget grid (see "Component
architecture" below) so future widgets slot in without a layout
redesign. No new schema for this milestone — confirmed against the live
`enquiries`/`workshop_registrations` tables and `activity_log` before
writing this spec, including the honest gaps noted inline below.

**Sections:**
- [x] **Welcome Banner** — greets the client by name
- [x] **Active Projects** — one card per open enquiry (see card spec
      below). **Note:** cards do not yet link to the Booking & Project
      Timeline — that page doesn't exist until Milestone 2, so linking
      to it now would be a dead link. Cards show a "Full project
      timeline coming soon" note instead; Milestone 2 wires the real
      link in (`ProjectCardData.timelineAvailable`, currently `false`)
- [x] **Upcoming Sessions / Workshops** — registered workshops with a
      future `startDate` (read from the Sanity workshop document via
      the existing `contentRepository.getWorkshopBySlug()`, keyed off
      `workshop_registrations.workshop_slug` — no new schema)
- [x] **Latest Project Updates** — most recent status change per active
      project
- [x] **Deliverables Ready** — **placeholder for this milestone**: the
      `deliverables` table doesn't exist until Milestone 3, so this
      widget renders an honest "nothing yet" state now and starts
      showing real counts once that table ships — the widget slot and
      its UI exist today, the data source is wired in later
- [x] **Recent Notifications** — **placeholder for this milestone**:
      same reasoning — `client_notifications` doesn't exist until
      Milestone 5; widget slot exists now, wired in later
- [x] **Recent Activity Timeline** — combined feed across enquiries +
      workshop registrations (submission/registration events only in
      this milestone — full stage-by-stage history is Milestone 2)
- [x] **Quick Actions** — View Projects (scrolls to Active Projects on
      this page), View Deliverables (**disabled/"coming soon"** until
      Milestone 3), View Bookings (links to the existing
      `/portal/workshops`, live today), Request Reschedule
      (**disabled/"coming soon"** until Milestone 4), Edit Profile
      (**disabled/"coming soon"** until Milestone 6) — every action's
      slot exists now; three of five activate as later milestones ship,
      shown honestly as not-yet-available rather than a broken link
- [x] Clean first-time empty state (no active projects yet) with a
      "Start an Enquiry" call to action — verified live with a
      zero-data test client, all widgets included
- [x] **Also shipped, not originally itemized:** a "Pending Payments"
      widget (honest future-ready placeholder, per the approved scope —
      real payment tracking is unscheduled — see `PRODUCT_ROADMAP.md`
      Version 3.0/Commerce note), matching the widget list from
      the approved dashboard refinement

**Active Project Card fields — data source for each, confirmed against
the real schema (no inventing a field that doesn't exist):**
- **Project Title** — pathway label + reference number (e.g.
  "Photography — REF-1234"); there's no dedicated title column, so this
  is the clearest honest identifier available
- **Project Type** — `pathwayLabel(service)` (existing helper,
  `src/lib/enquiry/pathways.ts`)
- **Current Status** — `crmStageLabel(crmStage)` (existing helper)
- **Next Milestone** — the next stage in `CRM_STAGES`' happy-path order
  after the current one; terminal/branch stages (`declined`, `closed`,
  `repeat_client`, `referral`, `completed`) show no "next" rather than a
  fabricated one
- **Progress Indicator** — position of the current stage within the
  happy-path sequence (`new_lead` → `completed`) as a fraction; branch
  stages get a distinct neutral state, not a misleading percentage
- **Next Appointment (if any)** — for workshop-linked activity, the
  workshop's real Sanity `startDate`; **for enquiries, this data
  genuinely doesn't exist yet** (no session/shoot-date field anywhere in
  the frozen schema) — shown honestly as "Not yet scheduled" rather than
  invented. Real scheduling is `v1.2.x — Scheduling & Calendar`, a later
  version, not built here.
- **Deliverables Available indicator** — placeholder (see Deliverables
  Ready widget above), wired to real data in Milestone 3
- **Last Updated** — `submitted_at` for this milestone. The more
  accurate version (actual last-stage-change timestamp) needs the same
  client-read `activity_log` RLS policy already planned for Milestone 2
  — deliberately not pulled forward, to keep this milestone's "no new
  schema" boundary intact. Flagged here rather than silently
  approximated.

**Component architecture (future-proofing, no functionality beyond
v1.1.0 built now):** each section above is an independent, self-
contained widget component in a shared extensible grid — not a
hard-coded layout assuming a fixed widget count or order. This is the
same grid a later version drops Payments, Messages, a Vendor Portal
widget, a Model Portal widget, Analytics, or a widget for a future
business module into, without redesigning the dashboard shell. Applies
equally across Photography, Videography, Workshops, and (once real
bookable records exist for them) Vendor/Model/Academy — the widget
contract doesn't assume a specific business line.

### Milestone 2 — Booking & Project Timeline → reusable Project Workspace ✅ complete
**Shipped:** 2026-07-26, commit `abc7c29`. **Architectural refinement
mid-milestone** (your explicit request, before implementation began):
generalized from a photography-specific "Timeline" page into a reusable
**Project Workspace** — one six-tab shell (Overview, Timeline,
Deliverables, Booking Details, Requests, Updates) every project kind
opens into (enquiry today; workshop too; extensible to vendor/model/
future business lines once those have real bookable records), driven by
a kind-agnostic data layer (`src/lib/portal/workspace.ts`) rather than
kind-specific screens. Future tabs (Payments, Contracts, Messages,
Document Vault, Feedback, Invoices, AI Assistant) are one entry in
`src/lib/portal/workspaceTabs.ts` away, no shell redesign.

- [x] Timeline tab: visual status/stage history in client-friendly
      language, built from `activity_log` (curated to client-meaningful
      actions only)
- [x] **New RLS policy shipped** (migration `0006_client_workspace.sql`,
      staging-first, verified on both staging and production): clients
      may read their own `activity_log` rows — extends the existing
      frozen-baseline table to a new consumer, not a redesign
- [x] Overview tab: current status, next milestone, progress, key dates,
      payment status
- [x] Booking Details tab: for enquiries, service only (location/
      schedule genuinely don't exist yet — shown honestly, not invented);
      for workshops, real Sanity-backed venue, schedule, and instructor
      data
- [x] Deliverables and Requests tabs: honest placeholders — real data
      lands in Milestones 3 and 4 respectively
- [x] **Updates tab** (added during the architectural refinement, your
      explicit design): `enquiry_notes` gained an `audience` column
      (`'internal' | 'client'`, default `'internal'` — no existing note
      became visible to anyone), with a new client-read RLS policy
      scoped to `audience = 'client'` on the client's own enquiry only.
      Admin Platform's note form now lets staff explicitly publish a
      "Client Update" alongside ordinary internal notes — existing
      internal-only behavior unchanged. No client replies/messaging/
      commenting, per the standing v1.1.0 scope decision.
- [x] Milestone 1's dashboard (project cards, upcoming sessions, recent
      activity) now links into the real workspace instead of the interim
      "coming soon" state

**Verified:** RLS boundaries (client A cannot read client B's
`activity_log` or notes, cannot write/edit/delete notes at all),
audience filtering, both project kinds including real Sanity data, and
the full admin note round-trip — on staging first, then independently
re-verified live on production. All test data removed after each pass.

### Milestone 3 — Client Deliverables ✅ complete
**Shipped:** 2026-07-26, commit `c0dba29`. A **premium, curated
delivery gallery** — not a document vault, and not a download folder
either, per your explicit design principles for this milestone. Staff
publish approved deliverables through the Admin Platform as reference
links; clients can **view, preview (where supported), and download**
only. Explicitly **no client uploads, no secure storage, no document
exchange, no new storage architecture, and no object storage
implementation** in v1.1.0.

- [x] `deliverables` table, polymorphic `entity_type`/`entity_id`
      (`'enquiry'` or `'workshop_registration'`) — the same pattern
      `activity_log` already uses, not a new convention —
      `business_id`-scoped, staff full CRUD via the Admin Platform,
      client SELECT own only via RLS (same staff-manages/client-reads-
      own pattern as `enquiry_notes`). Migration `0007_deliverables.sql`,
      staging-first, verified on both staging and production.
- [x] `deliverable_categories` — a small business-scoped lookup table
      (staff read, admin manages), **genuinely configurable with zero
      code changes**: seeded with the 11 requested starter categories
      (Edited Photos, Final Videos, Gallery Links, Contracts, Invoices,
      Receipts, Call Sheets, Mood Boards, Workshop Materials,
      Certificates, Other Deliverables); a 12th category, added live
      from the Admin Platform during staging verification, appeared in
      the creation form immediately with no deploy
- [x] Client Portal UI: `DeliverablesGallery` (client component) on the
      Project Workspace's Deliverables tab — grid/list view toggle,
      search, category filter, sort (newest/oldest/title), real
      thumbnails when staff provide one, a clean category-labeled
      placeholder when they don't. Replaces the Milestone 1/2 "coming
      soon" placeholder.
- [x] Admin Platform UI: `DeliverablesManager`, one reusable component
      wired into both the existing Enquiries CRM and Bookings detail
      pages — publish/remove deliverables, admin-only "Add Category"
      inline form, no duplicated logic between the two entity kinds
- [x] Milestone 1's Dashboard now shows real counts: each Active
      Project card's "Deliverables" field, the "Deliverables Ready"
      widget total, and the Quick Actions "View Deliverables" link
      (activates once any project has a deliverable, pointing at
      whichever project has the most — never a fabricated destination)

**Reserved for a future major feature, explicitly not part of v1.1.0:**
a genuine **Document Vault** — secure client uploads, secure staff
uploads, object storage/provider selection, signed URLs, access
control, retention policies, version history, secure document exchange,
and the compliance/storage architecture decision that requires. That
capability gets its own milestone and its own release when scoped,
never implied by the read-only Deliverables feature above.

**Verified:** category seeding and live admin-only category creation,
staff full CRUD, client read-only + cross-client RLS isolation, and
every gallery control (grid/list, search, filter, sort) against real
published deliverables across both project kinds — on staging first,
then independently re-verified on production. All test data removed
after each pass.

### Milestone 4 — Project Requests ✅ complete
**Shipped:** 2026-07-26, commit `994ca2f`. Redesigned per your explicit
architectural refinement from a dedicated "Reschedule & Cancellation
Requests" feature into a generic, extensible **Project Requests**
module — v1.1.0 implements only the two approved types (Reschedule,
Cancellation), but the schema supports future types (Booking Update,
General Client Request, Invoice Request, Additional Deliverables
Request, Change of Location, Additional Services, Equipment Request,
Support Request) being added later with **zero code changes**. Lives on
the Project Workspace's Requests tab (its route already existed as a
placeholder, shipped with Milestone 2).

- [x] `request_types` — a small business-scoped lookup table (staff/
      client read, admin manages), same shape and RLS posture as
      `deliverable_categories` (Milestone 3) — genuinely configurable
      with zero code changes. Seeded with exactly the two approved
      types; future types are data rows an admin adds later, not a
      migration.
- [x] `project_requests` — client-submitted, staff-decided records.
      Same polymorphic `entity_type`/`entity_id` pattern as
      `activity_log` and `deliverables`, not a new convention. Every
      request carries Request Type, Status (Pending/Approved/Rejected/
      Completed), Created Date, Staff Decision, Staff Response, Client
      Notes, Decision Timestamp, per your exact field list. Clients can
      INSERT (their own project only) and SELECT (their own only) —
      never UPDATE or DELETE, so nothing a client submits can ever
      change itself, let alone auto-apply. Staff/admin can SELECT all
      and UPDATE (to decide), never DELETE — append-only, same posture
      as `enquiry_notes`/`activity_log`. Migration
      `0008_project_requests.sql`, staging-first, verified on both
      staging and production.
- [x] Application-layer defense: the RLS insert policy does not
      restrict which columns a client sets, so status is always
      hardcoded to `'pending'` server-side and client-submitted status/
      decision fields are never trusted — a finding caught during RLS
      verification and defended at the Server Action layer.
      `staff_decision`/`staff_response`/`decided_by`/`decided_at` form a
      locked decision record, set once on the first real approve/reject
      transition and preserved even if status later moves to
      `completed`.
- [x] Client Portal UI: Requests tab now has a real submission form
      (request type + optional notes) and a list of the client's own
      past requests with status, staff response, and decision date —
      replaces the Milestone 2 "coming soon" placeholder.
- [x] Admin Platform UI: `ProjectRequestsManager`, one reusable
      component wired into both the Enquiries CRM and Bookings detail
      pages — staff decide (status + optional response) per request, no
      duplicated logic between the two entity kinds.
- [x] Decisions surface in both the admin activity feed
      (`"project_request.decided"`) and the client-facing Project
      Timeline ("Request approved"/"Request rejected"), reusing the
      existing curated-label patterns rather than inventing a new
      notification path — nothing auto-applies to the underlying
      enquiry/booking.

**Verified:** end-to-end on staging — client submits a Reschedule and a
Cancellation request, staff approves one and rejects the other with a
response, the client sees both decisions reflected (status badge, staff
response, decision date) in the Requests tab and the Timeline tab;
cross-client RLS boundary confirmed (a second client gets a 404 on the
first client's project, both via RLS and the app-layer ownership check);
zero console errors throughout. Production deployment verified `Ready`
from the same commit. All test data removed after the pass.

### Milestone 5 — Notification Center (in-app only — approved scope decision 3)
- [ ] In-app notification center: bell/indicator + full list, covering
      stage changes, new deliverables published, reschedule/cancellation
      request outcomes, and workshop registration updates (new
      business-scoped table, e.g. `client_notifications` — staging-first
      migration per the Migration Policy)
- [ ] Mark-as-read behavior, scoped per client via RLS (own
      notifications only, same pattern as every other client-facing
      table)
- [ ] Email notifications explicitly **out of scope for v1.1.0** —
      revisit once `FORMS_SENDING_ENABLED` and a live Resend account are
      ready

### Milestone 6 — Client Profile & Account Management
- [ ] Client-editable profile page (`/portal/client/profile`): full name,
      phone, avatar — reusing the existing column-level grant
      (`full_name`, `phone`, `avatar_url`) already verified on `profiles`
      in v1.0.0; no new grant needed
- [ ] Change-password flow via Supabase Auth
- [ ] Change-email flow via Supabase Auth (with re-verification)
- [ ] Account-deletion request (routes to a contact/support flow rather
      than self-service hard-delete, given account deletion is a
      Prohibited/Explicit-permission-tier action in general — needs your
      confirmation on the exact flow)

### Milestone 7 — Verification & Release v1.1.0
- [ ] Full staging E2E verification of every new/changed workflow
      (Testing Requirements, `DEVELOPMENT_GUIDE.md` §5)
- [ ] Role-boundary check: confirm a client can only ever see/edit their
      own data, never another client's
- [ ] Production smoke test (same shape as the v1.0.0 release smoke test)
- [ ] Full Release Checklist (`DEVELOPMENT_GUIDE.md` §3): version bump,
      `CHANGELOG.md`/`RELEASE_NOTES.md`/`MILESTONES.md` updated, tag
      `v1.1.0`, GitHub Release published

---

## Version 1.0 — Foundation ✅ complete

- [x] Brand identity (logo variants, color system, typography)
- [x] Homepage
- [x] About (Story, Mission & Vision, Values, Founder, Process)
- [x] Services hub + all department pages
- [x] Contact/Book unified enquiry system (5-step form, 8 pathways)
- [x] Google Sheets integration (Enquiries tab, A–X mapping)
- [x] Workshop registration architecture (schema, API, storage, emails, capacity/waitlist — verified end-to-end incl. waitlist)
- [x] Security (server-side credentials, rate limiting, idempotency, honeypot, staging isolation, shared infra consolidated under `src/lib/shared/`)
- [x] Legal gating (`LEGAL_PAGES_APPROVED` gate; draft legal page structures, noindexed)
- [x] Forms (validation, consent split, error-state handling)
- [x] Email system (Resend, branded HTML templates, staging log-only mode)
- [x] Architectural audit (`ARCHITECTURE.md`) — approved 2026-07-23

## Version 1.1 — Creative Showcase ✅ complete

**Version number:** 1.1.0

### Objectives
Build the Portfolio as a Portfolio Management System and the Journal as a
long-term publishing platform — both CMS-agnostic via `ContentRepository`,
neither a static gallery/blog.

### Features completed (Portfolio) ✅
- [x] Premium case-study detail page (`/work/[slug]`): hero media, story,
      Project Objective / Creative Strategy / Challenges / Solution /
      Creative Process (each shown only if populated), collaborators,
      deliverables, Results & Impact, awards, publications, Final Gallery,
      Before & After gallery, Videos (native + YouTube/Vimeo embed),
      Behind the Scenes gallery, downloadable assets, project testimonials,
      related projects, related workshops, social share, project
      navigation (prev/next), canonical URL + JSON-LD structured data
- [x] Portfolio hub (`/work`): featured section, discipline tabs, 12
      category chips, combined discipline+category+search filtering
- [x] Full field set incl. draft/published, featured, SEO fields
- [x] **Future-readiness audit** (2026-07-23, all 14 requested items — see
      below) — resulted in additive-only hardening, no breaking changes:
      Collections/Series, Collaborators, Awards & Publications, project
      Testimonials, before/after sliders, downloadable assets, canonical
      URL/JSON-LD, and cross-links to Workshops all added. Password
      protection is schema-ready (`isPasswordProtected`) but unenforced —
      correctly blocked on the auth decision (`ARCHITECTURE.md` §4.3), not
      faked with client-side gating. Duplication needs no code (copy a
      record / CMS-native later). Analytics readiness needs no schema
      change (stable id/slug already sufficient). Multilingual and
      related-products stay deferred per `ARCHITECTURE.md` §4.1 / V3.0.

### Features completed (Journal, branded "Stories" on-page) ✅
- [x] Hub (`/journal`) and detail (`/journal/[slug]`) pages, author profiles
      (`/journal/authors/[slug]`)
- [x] 13 categories covering the full requested content taxonomy (Articles,
      Tutorials, Behind the Scenes, Photography Tips, Business Insights,
      Faith & Leadership, Travel, Workshop Recaps, Client Stories, Case
      Studies, Announcements, News, Video Articles) + free-form tags
- [x] Search (title/excerpt/body/tags), category + tag filtering, Featured
      Stories section
- [x] Reading time — derived from word count at render time, not stored
- [x] Author profiles (multi-author support)
- [x] Draft/Published + **scheduled publishing** (`scheduledFor` — a post
      stays hidden even when `status: "published"` until that date passes;
      no cron job, just a query-time comparison) — both verified live via
      direct-URL 404
- [x] Video article format (`format: "video"` + `videoUrl`)
- [x] Related stories, related Portfolio projects, related Workshops
- [x] Newsletter-readiness (`newsletterExcerpt` field) — data-only, no
      send infrastructure built (none requested yet)
- [x] SEO fields + canonical URL + JSON-LD (`Article`/`VideoObject`)
- [x] Nav/footer label changed "Journal" → "**Stories**" per your branding
      recommendation; URL kept as `/journal` for continuity with this roadmap

### Files changed
- `src/lib/content/types.ts` — added `PortfolioProject` + 8 supporting
  types (`Collaborator`, `Collection`, `Award`, `Publication`,
  `DownloadableAsset`, `BeforeAfterPair`, extended `MediaAsset`/`SeoFields`);
  added `JournalPost`, `Author`; generalized `Testimonial` (removed dead
  `workshopId` field — was never actually read, see comment in file)
- `src/lib/content/repository.ts` — added Portfolio + Journal + Collections + Authors methods
- `src/lib/content/local/portfolioData.ts`, `journalData.ts` (new) — sample content
- `src/lib/content/local/repository.ts`, `local/data.ts` — wired new methods, removed dead field
- `src/lib/content/portfolioHelpers.ts`, `journalHelpers.ts` (new) — labels, search, reading time, scheduled-visibility gate
- `src/lib/content/formatters.ts` (new) — `formatDate` moved out of `workshopHelpers.ts` (shared, not workshop-specific)
- `src/components/portfolio/PortfolioCard.tsx`, `src/components/journal/JournalPostCard.tsx` (new)
- `src/components/SocialShare.tsx`, `src/components/TestimonialCard.tsx` — moved to shared locations (now used by both Portfolio and Journal/Workshops)
- `src/app/work/page.tsx`, `work/[slug]/page.tsx`, `journal/page.tsx`, `journal/[slug]/page.tsx`, `journal/authors/[slug]/page.tsx` (new/updated — `/work` and `/journal` previously 404)
- `src/components/NavBar.tsx`, `Footer.tsx` — "Journal" label → "Stories"
- `CMS_MIGRATION.md` — schema table extended for all new types

### Tests passed
- `tsc --noEmit` and `eslint .` clean throughout
- Portfolio: hub filtering, search, draft-exclusion (hub + direct-URL 404),
  all new fields (collaborators/awards/publications/before-after/downloads/
  testimonials/related workshops) verified live; canonical URL + JSON-LD
  confirmed via DOM inspection
- Journal: hub category/tag filtering, search, Featured section, draft
  exclusion, **scheduled-post exclusion** (both verified via direct-URL
  404), video-format rendering, author profile + cross-linked Portfolio
  project all verified live
- Full-site smoke test (11 routes incl. both new sections) all 200

### Pending work
- [x] Sanity CMS connected (`ARCHITECTURE.md` §4.2) — completed Version 1.2.5
- [x] Object storage for real media (`ARCHITECTURE.md` §4.5) — Sanity's asset pipeline serves this; the reusable media rendering architecture (`ResponsiveImage`/`MediaAsset`/`Gallery`/`Avatar`) landed 2026-07-27, see below. Real photography still pending owner upload — see `MEDIA_UPLOAD_LIST.md`.
- [ ] Admin draft-preview mode, password-protection enforcement, multi-administrator access (all need auth — `ARCHITECTURE.md` §4.3)
- [ ] Newsletter send integration (fields exist, no sending infra)

### Known issues
- None outstanding.

### Media Architecture — 2026-07-27 ✅ complete

Portfolio, Journal, and Workshops' placeholder boxes replaced with a reusable, CMS-driven media rendering system — see `MEDIA_ARCHITECTURE.md` for full design detail.

- [x] `src/components/media/` component library: `ResponsiveImage`, `MediaAsset`, `Gallery`, `BeforeAfterGallery`, `Avatar` — responsive sizing, lazy loading, automatic aspect-ratio handling, LQIP blur-up loading state, and a graceful neutral-placeholder empty state for CMS fields with no asset uploaded yet
- [x] CDN-swappable image loader (`src/lib/media/sanityLoader.ts`), configured globally via `next.config.ts`'s `images.loaderFile`
- [x] `tags` field added to `portfolioProject` schema; `width`/`height`/`lqip` metadata added to the shared GROQ media fragments
- [x] Wired into Portfolio (hero, Final Gallery, Videos, Behind the Scenes, Before & After), Journal (hero, video articles, author avatars), Workshops (instructor avatars, gallery), and the Founder page
- [x] Portfolio/Journal OG-image fallback fixed (was `undefined` whenever no dedicated `seo.ogImage` was set — now falls back to the hero image)
- [x] `tsc --noEmit` and `eslint .` clean throughout; clean `next build` across all 67 routes; zero console errors verified live on all four touched page types in a fresh browser tab

### Tests passed (Media Architecture)
- Empty-state rendering confirmed for: instructor with no photo (initials avatar), Founder with no photo (neutral placeholder), and every seeded sample Portfolio/Journal/Workshop project (all currently placeholder content with no real photography — see `MEDIA_ARCHITECTURE.md` §4 for why this is a graceful *content* state, not a bug)
- Gallery correctly renders nothing (not an empty grid) when a project has zero gallery images
- Local static assets (`Logo.tsx`'s `/brand/*.png`) confirmed unaffected by the now-global image loader

## Version 1.2 — Academy (Workshop Platform expansion) ✅ core build complete

- [x] Beautiful workshop landing page (`/workshops` — hero, category filters, Upcoming/Past sections)
- [x] Upcoming / Past workshops
- [x] Workshop categories (filterable via `?category=<slug>`)
- [x] Instructor profiles (`/workshops/instructors/[slug]`, multiple instructors per workshop supported)
- [x] Learning outcomes, agenda, venue info, physical/online/hybrid indicator
- [x] Workshop gallery (grid, no upload handling yet — see `ARCHITECTURE.md` §4.5), countdown timer, FAQs (accordion), certificate information
- [x] Related workshops
- [x] Placeholder testimonials (clearly marked "Placeholder — not a real testimonial", per the zero-invention rule)
- [x] Registration, waitlist, manual payment, acknowledgement emails, Sheets integration (built in V1.0; waitlist-position bug found and fixed during this version's verification pass — see `WORKSHOPS_ARCHITECTURE.md`)
- [x] Content model supports multiple locations (venues), multi-day workshops (`startDate`/`endDate`), recurring workshops (`isRecurring`/`recurrenceNote`), members-only workshops (`isMembersOnly`), and flags for virtual attendance/recorded sessions (`isOnlineAttendancePossible`/`hasRecordedSession`) — the underlying live-webinar/streaming tooling itself is not built (flag exists, feature doesn't yet)
- [x] CMS-agnostic content abstraction layer (`src/lib/content/`, `CMS_MIGRATION.md`) — built as prerequisite groundwork so this version's content doesn't need a rewrite when Sanity connects
- [ ] Sanity CMS actually connected (deferred — requires you to create the project under Ordift's ownership; see `ARCHITECTURE.md` §4.2)

## Version 1.2.5 — CMS (Sanity) Integration ✅ live and connected

**Version number:** 1.2.5

### Objectives
Create the Sanity project under Ordift Studios' ownership and connect it
to the existing `ContentRepository` architecture without changing the
frontend, covering all 29 requested content types, while keeping the site
fully CMS-independent (another CMS could replace Sanity with only the
adapter file changing).

### Features completed ✅
- [x] **29 Sanity document schemas + 5 shared object schemas** authored
      (`src/sanity/schemaTypes/`) — 12 mirror the existing domain model
      field-for-field (Workshops ecosystem: workshop, instructor,
      workshopCategory, venue, testimonial, sponsor; Portfolio ecosystem:
      portfolioProject, portfolioCategory, portfolioCollection; Stories
      ecosystem: journalPost, journalCategory, author); 17 are new
      site-wide types (siteSettings, homepage, aboutPage, founder,
      service, navigation, footerSettings, legalPage, announcementBanner,
      faq, gallery, certificate, teamMember, client, partner, brand, tag)
- [x] **Sanity project created under Ordift Studios' ownership** — org
      "Ordift Studios", project `ixbvr1n8`, signed in as
      `matetey@ordiftghana.com` (Google provider). `staging` and
      `production` datasets both exist (private visibility)
- [x] Embedded Studio at `/studio`, **live and signed in against the real
      project** — verified rendering the full desk structure (7 pinned
      singletons + 22 listed document types, in the correct groupings)
- [x] `SanityContentRepository` adapter (`src/lib/content/sanity/`) —
      **active**: `src/lib/content/index.ts` now exports
      `sanityContentRepository`, not the local adapter
- [x] Role-based permissions, revision history, media library, slug
      validation, reusable references — all native to Sanity; structured
      SEO + JSON-LD already existed (V1.1); scheduled publishing verified
      live (a future-dated Story stays hidden until its date passes, same
      as a draft). Full capability-by-capability mapping in `CMS_MIGRATION.md`
- [x] Both verification scripts run successfully against the live
      project: `seed:sanity-connection-test` (round-trip proof, then
      cleaned up) and `seed:sanity-sample-data` (58 documents — the local
      `[SAMPLE]` content ported into `staging` so the flip could be
      verified against equivalent content instead of an empty CMS)
- [x] **Full end-to-end verification against live data**: every
      Workshops/Portfolio/Stories page, category/tag/discipline filter,
      search, draft-exclusion, and scheduled-publishing gate re-tested —
      all correct; workshop registration tested end-to-end against a
      live Sanity-sourced workshop (correctly waitlisted); 14-route
      full-site smoke test all 200, including `/studio`
- [x] Two real bugs found and fixed only once live (non-empty, non-mocked)
      queries ran — see `CMS_MIGRATION.md` "Bugs found and fixed"; both
      would have shipped silently broken otherwise
- [x] `DEPLOYMENT.md` written — captures the CORS-origin requirement
      discovered live (Studio needs each domain allow-listed) and the
      per-environment token/dataset checklist for when this gets deployed
- [x] Fixed the Turbopack Studio-bundling bug from the infrastructure pass
      (`"use client"` boundary) — held up under the live connection too
- [x] Adopted the permanent engineering principle you set for this
      milestone forward (see "Recommended Build Order" above)

### Files changed
- `sanity.config.ts` — fixed desk structure to exclude object types (found live: Call to Action/Gallery Image/Media/SEO/Social Link were incorrectly listed as browsable documents)
- `src/sanity/schemaTypes/` (34 files: 29 documents + 5 objects + index)
- `src/sanity/lib/client.ts` — **added the missing API token** (see Bugs found and fixed)
- `src/sanity/lib/image.ts`
- `src/app/studio/[[...tool]]/page.tsx`, `Studio.tsx`
- `src/lib/content/sanity/repository.ts`, `queries.ts` — added `coalesce()` defaults for non-nullable object fields (see Bugs found and fixed)
- `src/lib/content/sanity/groqFragments.ts` — `seoFragment`/`certificateFragment`/`requiredMediaAssetFragment` converted to defensive functions
- `src/lib/content/index.ts` — **flipped to `sanityContentRepository`**
- `scripts/seedSanityConnectionTest.ts`, `scripts/seedSanitySampleData.ts` (new)
- `src/sanity/schemaTypes/documents/instructor.ts` — added missing `isPlaceholder` field
- `package.json` — added `sanity`, `next-sanity`, `@sanity/image-url` (deps), `tsx` (dev), two seed scripts
- `.env.local` — `NEXT_PUBLIC_SANITY_PROJECT_ID`, `SANITY_API_TOKEN` set (gitignored, not committed)
- `.env.example` — added `SANITY_API_VERSION`
- `CMS_MIGRATION.md` — full rewrite reflecting the live connection, including the two bugs found
- `DEPLOYMENT.md` (new)

### Tests passed
- `tsc --noEmit` and `eslint .` clean throughout (including after every fix)
- Full-site smoke test, 14 routes incl. `/studio`, all 200 — run 4 times
  across this milestone as issues were found and fixed
- Live GROQ round-trip verified with the exact projection shape the
  adapter uses (`categories[]._ref` resolution confirmed correct)
- Draft-exclusion and scheduled-publishing gates verified via direct-URL
  404 against live data (not just local sample data)
- Workshop registration API tested end-to-end against a live
  Sanity-sourced workshop — correctly returned `Waitlisted`

### Pending work
- [ ] Wire the 17 site-wide schema types to real pages (Home/About/Founder/
      Nav/Footer/Legal) — deliberately sequenced after the above, since
      those pages hold real, already-approved copy (see `CMS_MIGRATION.md`
      "Site-wide content: prepared, not yet connected" for the full reasoning)
- [ ] Live preview (Next.js Draft Mode) — not built this milestone, needs
      a preview-surface decision first
- [ ] Production Sanity dataset, token, and CORS origin — needed before
      deploying to production (checklist in `DEPLOYMENT.md`)
- [ ] Consider splitting the Editor-role `SANITY_API_TOKEN` into a
      separate read-only token for the query client (least-privilege
      hardening, not currently a real exposure — see `CMS_MIGRATION.md`)
- [ ] Remove `src/lib/content/local/*` — kept for now as an offline
      fallback and schema/seed reference

### Known issues
- None outstanding.

## Version 1.2.6 — Site-Wide CMS Migration ✅ complete

**Version number:** 1.2.6

### Objectives
Move every remaining editable component (Homepage, About, Founder,
Services, Navigation, Footer, Legal Pages, Site Settings) into Sanity,
verified word-for-word against the previously hardcoded copy, before
starting Authentication & Client Portal.

### Features completed ✅
- [x] 9 new connected types wired end-to-end: `siteSettings`, `homepage`,
      `aboutPage`, `founder`, `navigation`, `footerSettings`, `service`
      (×7 department documents), `legalPage` (×4 documents) — bringing
      the total connected types to 21 of 29
- [x] Real, already-approved copy (not placeholder) transcribed from
      every hardcoded page into `src/lib/content/local/siteWideData.ts`
      (source of truth + local-dev fallback), then seeded into **both**
      `staging` and `production` Sanity datasets via
      `scripts/seedSanitySiteWideContent.ts` — this is real content both
      environments need, unlike the Workshops/Portfolio/Stories sample
      data, which is intentionally staging-only
- [x] `NavBar`/`Footer` converted to async Server Components fetching
      their own content; `NavBar`'s mobile-menu interactivity split into
      a new `NavBarClient.tsx` — every existing `<NavBar />`/`<Footer />`
      call site across the whole site needed zero changes
- [x] 7 static department pages → 1 dynamic `/services/[slug]` route; 4
      static legal pages → 1 dynamic `/legal/[slug]` route — **existing
      URLs unchanged**, matches the Workshops/Portfolio/Stories pattern
- [x] `src/lib/siteSettings.ts` (env-var-based) retired; `/book`'s contact
      email/WhatsApp now come from `contentRepository.getSiteSettings()`;
      WhatsApp link helpers moved to `src/lib/whatsapp.ts` as pure functions
- [x] Pricing and Landing Pages: schema-only, deliberately empty — no
      pricing content exists anywhere (standing zero-invention/pricing-
      gating rule applied, not a new decision) and no landing pages exist
      to migrate (forward-looking infrastructure only, no render path
      built) — see `CMS_MIGRATION.md` for the full reasoning
- [x] Every migrated page spot-checked against a live GET request and
      found to render **identical text** to the pre-migration hardcoded
      version, including conditional variants (Talent Management's
      "Coming Soon" CTA, Content Creation's "Who It's For" section, the
      inline founder link on About, the draft banner on Legal pages)

### Files changed
- `src/lib/content/types.ts` — added `SiteSettings`, `HomePage`, `AboutPage`, `Founder`, `Navigation`, `FooterSettings`, `Service`, `LegalPage`, `CtaButton`, `SocialLink`, `NavLink`, `FooterColumn`
- `src/lib/content/repository.ts` — added 9 new interface methods
- `src/lib/content/local/siteWideData.ts` (new) — the real copy, as local-adapter data
- `src/lib/content/local/repository.ts` — wired new methods
- `src/lib/content/sanity/{queries.ts,repository.ts,groqFragments.ts}` — new GROQ queries/adapter methods; `seoFragment` generalized to accept a distinct output key (needed for `siteSettings.defaultSeo`)
- `src/sanity/schemaTypes/documents/{homepage,aboutPage,founder,service}.ts` — rewritten to match the domain types field-for-field; `siteSettings.ts`, `navigation.ts`, `footerSettings.ts`, `legalPage.ts` unchanged (already matched)
- `src/sanity/schemaTypes/documents/{pricing,landingPage}.ts` (new, schema-only)
- `src/sanity/schemaTypes/index.ts` — registered the 2 new schema-only types
- `src/components/NavBar.tsx` (rewritten, Server Component), `NavBarClient.tsx` (new), `Footer.tsx` (rewritten, Server Component)
- `src/app/page.tsx`, `about/page.tsx`, `about/founder/page.tsx`, `services/page.tsx`, `book/page.tsx` — rewired to `contentRepository`
- `src/app/services/[slug]/page.tsx` (new, replaces 7 static files), `src/app/legal/[slug]/page.tsx` (new, replaces 4 static files)
- `src/lib/whatsapp.ts` (new); `src/lib/siteSettings.ts` (deleted)
- `scripts/seedSanitySiteWideContent.ts` (new); `package.json` — added `seed:sanity-site-wide` script
- `CMS_MIGRATION.md`, `DEPLOYMENT.md` — updated for the completed migration

### Tests passed
- `tsc --noEmit` and `eslint .` clean throughout (including after the
  NavBar/Footer split and the 7→1 / 4→1 route conversions)
- 20-route full-site smoke test (every page + every service slug + every
  legal slug + `/studio`) all 200
- Content verified byte-for-byte against the pre-migration pages on Home,
  About, Talent Management (coming-soon variant), Content Creation
  ("Who It's For" section), and a Legal page (draft banner + noindex)
- Enquiry API (`/api/enquiry`) re-tested post-migration — unaffected,
  still returns a valid reference number
- Mobile nav menu toggle re-tested post-`NavBar`/`NavBarClient` split —
  interactivity confirmed intact

### Pending work
- [ ] Live preview (Next.js Draft Mode) — still not built
- [ ] Pricing/Landing Pages remain schema-only until real content exists
- [ ] Remove `src/lib/content/local/*` once confident the offline fallback isn't needed
- [ ] Production `SANITY_API_TOKEN`/CORS origin for an actual deployment (checklist in `DEPLOYMENT.md`) — no deployment exists yet

### Known issues
- None outstanding.

## Version 1.3 — Authentication & Client Portal ✅ COMPLETE

**Version number:** 1.3.0
**Closed:** 2026-07-24, approved after full live end-to-end verification (see "Final closure" at the end of this section).

### Objectives
Build role-based authentication and a Client Portal around Ordift Studios'
real business workflows (not a generic account system), on Supabase
(Postgres + Auth + Row Level Security), per your explicit instruction:
one unified Client role scoped by project data rather than by department,
six permission roles total, RLS enabled from day one, and a schema that
absorbs future features (payments, subscriptions, digital products,
certificates, model/vendor management, staff dashboards, mobile apps,
additional Ordift businesses) without a redesign.

### Features completed ✅
- [x] **Schema** (`supabase/migrations/0001_init.sql`): `businesses`
      (multi-business-ready), `profiles` (1:1 with `auth.users`), `roles` +
      `user_roles` (many-to-many — a person can hold more than one role at
      once), `enquiries` + `workshop_registrations` (dual-write targets,
      `crm_stage` enum matching the exact approved CRM lifecycle),
      `model_profiles` / `vendor_profiles` / `staff_details` (scaffolded,
      `jsonb metadata` absorbs undefined future fields), RLS enabled and
      policied on every table (`auth.uid() = user_id`/`id`, plus
      `has_role()`/`is_staff_or_admin()` helper functions for staff/admin
      broad read access)
- [x] `supabase/migrations/0002_security_advisor_remediation.sql` — after
      0001 ran live, Supabase's Security Advisor flagged 8 warnings (4
      SECURITY DEFINER functions × anon + authenticated, all reachable
      via `/rest/v1/rpc/<name>` regardless of the `revoke ... from
      public` in 0001 — root cause: Supabase's default privileges grant
      EXECUTE directly to `anon`/`authenticated`/`service_role` at
      function-creation time, a separate ACL entry from `PUBLIC` that
      revoking from `PUBLIC` never touches). Fixed by moving
      `has_role(text)`/`is_staff_or_admin()` out of `public` entirely
      into a new `private` schema (never listed in PostgREST's exposed
      schemas, so no RPC route exists for them at all) and explicitly
      revoking the leftover anon/authenticated grants on
      `ordift_studios_business_id()`/`handle_new_user()`/
      `set_updated_at()`. A forward-only migration, not an edit to 0001
      — see "How the two migrations relate" below
- [x] `supabase/migrations/0003_find_user_by_email.sql` — service-role-only
      `find_user_id_by_email()` helper (security definer), used by the
      dual-write to link a guest submission to an existing account by
      email match
- [x] Six roles implemented exactly as specified: `client`,
      `workshop_participant`, `model`, `vendor`, `staff`, `admin`. Self-
      signup grants only `client`; `model`/`vendor`/`staff`/`admin` are
      admin-granted only (Admin portal, below); `workshop_participant` is
      granted automatically by the dual-write on an email match
- [x] `@supabase/ssr`-based client/server/admin/middleware helpers
      (`src/lib/supabase/{client,server,admin,middleware}.ts`) — the admin
      (service-role) client is server-only, never imported by a Client
      Component
- [x] `src/proxy.ts` extended (now `async`) to refresh the Supabase session
      on every request and redirect unauthenticated `/portal/**` requests
      to `/portal/login` — **guarded so an unconfigured Supabase project
      cannot break the rest of the site** (a real bug caught before it
      shipped — see Bugs found and fixed)
- [x] Auth pages: `/portal/login`, `/portal/signup` (Server Actions +
      `useActionState`, generic error messages, no user enumeration),
      sign-out action
- [x] `src/lib/portal/roles.ts` — `getCurrentUser()` resolves the session
      plus every role held, in one place; `primaryPortalPath()` routes a
      multi-role user (e.g. Staff + Client) to their most-privileged view
- [x] Role-filtered dashboard shell (`/portal/(dashboard)/layout.tsx`) —
      nav only shows links for roles the user actually holds; defense-in-
      depth auth check (middleware is JWT-presence only, this layout does
      the real per-role check)
- [x] **Dual-write**: `/api/enquiry` and `/api/workshop-registration` now
      also insert into the Supabase tables (via the admin client, since
      the submitter may not be logged in) immediately after the existing
      Google Sheets/test-log write. The Sheets write stays the primary,
      admin-facing record and is completely unchanged — the Supabase write
      is additive, best-effort, and defensively guarded (never throws,
      never blocks the response if Supabase is unconfigured or the insert
      fails). Workshop registrations also auto-grant the
      `workshop_participant` role on an email match
- [x] **Client portal** (`/portal/client`) — the logged-in user's own
      enquiries (reference, service, CRM stage, payment status, date),
      honest empty state if none yet
- [x] **Workshop Participant portal** (`/portal/workshops`) — the logged-in
      user's own registrations (status incl. waitlist position, payment
      status, certificate link when issued), honest empty state
- [x] **Model / Vendor portal shells** (`/portal/model`, `/portal/vendor`)
      — show the real thing that exists (admin-set profile status) rather
      than inventing features; explicit copy stating the full Talent/
      Vendor workflows are roadmap items, not built yet (matches
      `roles.description` in the migration and the zero-invention rule)
- [x] **Staff portal** (`/portal/staff`) — read-only operational view of
      the 100 most recent enquiries and workshop registrations across all
      users (relies on the `is_staff_or_admin()` RLS policy, not the admin
      client, to scope the data); explicit role-gated (non-staff/admin
      redirected)
- [x] **Admin portal** (`/portal/admin`) — lists every account (via the
      Auth Admin API, since email lives in `auth.users`) with their
      current roles, and a grant/revoke UI for the four admin-granted
      roles. **Mandatory role gate** (not defense-in-depth) since this
      view uses the service-role client and bypasses RLS entirely; the
      Server Actions independently re-check `hasRole(user, "admin")`
      before mutating; refuses to let an admin revoke their own `admin`
      role from this screen (no recovery path if that ever hit zero)

### How the two migrations relate
`0001_init.sql` is treated as immutable once-applied history — it is
never edited after a successful run. `0002_security_advisor_remediation.sql`
is a separate, forward-only fix on top of it. A from-scratch rebuild
(`supabase/reset-dev-database.sql`, then replaying migrations) must run
0001 → 0002 → 0003 in that exact order every time — 0001 alone
reintroduces the 8 Security Advisor warnings that 0002 exists to fix.

### Files changed
- `supabase/migrations/0001_init.sql`, `0002_security_advisor_remediation.sql` (new), `0003_find_user_by_email.sql` (renumbered from `0002_find_user_by_email.sql`)
- `src/lib/supabase/{client,server,admin,middleware,dualWrite}.ts` (new) —
  `middleware.ts` fixed live (2026-07-24): `/portal/signup` wasn't
  exempted from the auth-required redirect, only `/portal/login` was —
  found during live functional verification, see above
- `supabase/reset-dev-database.sql` (new) — dev-only, guarded, kept out
  of `supabase/migrations/`
- `src/proxy.ts` — made `async`, integrated `updateSession()` with the
  unconfigured-Supabase guard
- `src/lib/portal/{roles,data,adminData}.ts` (new)
- `src/app/portal/login/{page,LoginForm,actions}.tsx`
- `src/app/portal/signup/{page,SignupForm,actions}.tsx`
- `src/app/portal/(dashboard)/layout.tsx`, `page.tsx`
- `src/app/portal/(dashboard)/{client,workshops,model,vendor,staff}/page.tsx` (new)
- `src/app/portal/(dashboard)/admin/{page,actions}.tsx` (new)
- `src/app/api/enquiry/route.ts`, `src/app/api/workshop-registration/route.ts` — added the dual-write call
- `package.json` — added `supabase` (CLI, dev), `@supabase/supabase-js`, `@supabase/ssr`
- `.env.example` — added `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (Supabase's new API key system — renamed from `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` once the live project turned out to use it, see below)

### Tests passed
- `tsc --noEmit`, `eslint .`, and a full production `next build` all clean
  — every new route (`/portal`, `/portal/login`, `/portal/signup`, and all
  six `/portal/(dashboard)/*` pages) compiles
- Full-site smoke test: `/`, `/services`, `/api/enquiry`, and
  `/api/workshop-registration` all still succeed with Supabase
  unconfigured — confirms the dual-write's no-op guard doesn't touch the
  existing, working flows
- `/portal/**` correctly returns a controlled 503 ("The Client Portal is
  not configured yet") rather than crashing, for every sub-route including
  the new dashboard pages — confirms the middleware guard covers the
  larger route tree
- Live `/api/enquiry` and `/api/workshop-registration` submissions
  (staging test-log mode) both still succeed end-to-end with the
  dual-write wired in, no server errors in either path

### Live functional verification (2026-07-24, after 0002 ran successfully)
Ran directly against the live project via a real signup, a real login
session, and raw unauthenticated REST calls — not just reasoning about
the SQL.

- [x] **Real bug found and fixed during this pass**: `src/lib/supabase/middleware.ts`
      only exempted `/portal/login` from the "must have a session"
      redirect — `/portal/signup` was missing, so an unauthenticated
      visitor hitting Sign Up was bounced straight to Sign In,
      making self-service signup completely unreachable the moment
      Supabase went live. Fixed by exempting both routes
      (`isPublicAuthRoute`). Unrelated to the SQL migrations —
      pre-existing application-layer bug that simply hadn't been
      exercised with live credentials until this test.
- [x] **Signup → trigger → column default**: real signup created the
      `auth.users` row, `handle_new_user()` fired transactionally
      (only `supabase_auth_admin` granted — confirms that grant
      removal from 0002 was safe), `full_name` came through correctly
      from `signUp()` metadata, and `business_id` resolved correctly
      via `ordift_studios_business_id()` (only `service_role` granted —
      confirms that grant removal was safe too). Verified directly
      against the database via a disposable admin script, not just the
      UI.
- [x] **Authenticated session → own-data read**: logged in as the test
      account, landed on `/portal/client`, empty-state rendered with no
      server errors — proves `"profiles: read own"` and
      `"enquiries: read own"` correctly evaluate
      `private.is_staff_or_admin()` for a real `authenticated`-role
      session (not just `service_role`).
- [x] **Profile update + column-level grant**: updating `full_name`/
      `phone` on the test account's own profile succeeded and
      `updated_at` was stamped by the trigger (its grant is untouched,
      per your instruction — this is the first live evidence it still
      works, not yet a basis for removing it). Attempting to update
      `business_id` in the same session was **rejected with "permission
      denied for table profiles"** — the column-level `GRANT UPDATE
      (full_name, phone, avatar_url)` from 0002 is genuinely enforced,
      not just documented.
- [x] **Admin access**: granted the `admin` role to the test account
      (temporarily, via the admin client — reverted after), reloaded
      `/portal`, correctly routed to `/portal/admin`, page loaded with
      no errors. Revoked immediately after testing.
- [x] **Blocked/unauthorized access**: signed out, confirmed
      `POST /portal/client → signOutAction()` fired and the next
      request redirected to `/portal/login?next=%2Fportal%2Fclient`.
      Raw unauthenticated REST calls (anon key, no session) against
      `profiles`, `enquiries`, and `user_roles` all returned `200` with
      `[]` — zero rows leaked, not an error that would reveal schema
      details.
- [x] **The core Security Advisor fix, proven directly**: unauthenticated
      RPC calls to `has_role`/`is_staff_or_admin` returned **404
      `PGRST202` "Could not find the function... in the schema cache"**
      — genuinely no route exists post-move, not just a permission
      block. The same call to `ordift_studios_business_id` (which stayed
      in `public`) returned **401 "permission denied for function"** —
      still discoverable since it's in the exposed schema, but correctly
      blocked by the grant revoke. Both are exactly the intended,
      distinct outcomes.
- [x] Test artifacts cleaned up: temporary `/api/test-profile-update`
      route deleted, temporary admin-role grant reverted, temporary
      verification scripts deleted. One test account
      (`ordift.ghana+verification-test@gmail.com`) remains in the
      project's `auth.users` — the Admin API's `updateUserById` call hit
      an unrelated JWT-signing error with this project's new secret-key
      format (see Known issues), so it couldn't be deleted
      programmatically; safe to remove via Dashboard → Authentication →
      Users whenever convenient, it's clearly labeled and holds no real
      data.
- `tsc --noEmit`, `eslint .` both clean after the middleware fix.

### Migration 0002 remediation + Migration 0003 (2026-07-24)
- [x] **`0002_security_advisor_remediation.sql`** — ran successfully;
      moved `has_role()`/`is_staff_or_admin()` into a non-exposed
      `private` schema, locked down grants on the remaining SECURITY
      DEFINER functions. Live-verified: unauthenticated RPC calls to
      `has_role`/`is_staff_or_admin` now return `404` (no route exists
      at all — not just a permission block); `ordift_studios_business_id`
      correctly returns `401` (still routed, correctly denied).
      **Security Advisor re-checked by you after this ran: confirmed
      all 8 original warnings gone**, only the Free-plan
      leaked-password-protection notice remains (tracked below as a
      non-blocking, pre-launch, Pro-tier item — not a code issue).
- [x] **`0003_find_user_by_email.sql`** — hardened (`search_path=''`,
      fully schema-qualified, `REVOKE ALL`/`GRANT EXECUTE` scoped to
      `service_role` only) and case/whitespace-normalized
      (`lower(auth.users.email) = lower(btrim(p_email))`) before its
      first run. Ran successfully; confirmed present in Database →
      Functions and directly callable via `service_role` only (`anon`/
      `authenticated` get no route).
- [x] **Real bug found and fixed during live verification, unrelated to
      the SQL**: `src/lib/supabase/middleware.ts` only exempted
      `/portal/login` from the auth-required redirect —
      `/portal/signup` was missing, making self-service signup entirely
      unreachable with live credentials. Fixed (`isPublicAuthRoute`).
- [x] **Real bug found and fixed in `src/lib/portal/adminData.ts`**:
      the "admin portal shows only 1 of ~10 users" discrepancy was
      root-caused, not just patched — Supabase's own `listUsers()` API
      authoritatively agreed on `total: 1` across 8+ repeated calls; the
      Dashboard's "Total: 10 users (estimated)" was simply an inaccurate
      estimate. What *was* real: Supabase's Admin API on this project
      intermittently fails with a JWT-signing error (`unrecognized JWT
      kid <nil> for algorithm ES256`, roughly a third of calls, no
      param-tied pattern — infra-side, not fixable from this app).
      `listUsersWithRoles()` now retries each page up to 3 times, walks
      every page instead of a single capped call, and returns an
      honest error state instead of silently showing "No accounts yet."
      on a transient failure. Verified live: reproduced the failure
      (honest error shown), reloaded (succeeded, correct list shown).
- [x] **Full end-to-end dual-write verification** (clearly-labeled test
      data, removed after): exact-match linking, case/whitespace-variant
      linking (proves the 0003 normalization works through the real API,
      not just in isolation), guest submissions with `user_id: null`,
      `workshop_participant` auto-grant on matching registration,
      duplicate-submission idempotency (same reference number returned,
      no second row), client RLS (own records only), staff RLS (all
      operational records, including guests the client couldn't see),
      and anonymous protection **with real data present** (`0` rows
      returned from `enquiries`/`workshop_registrations`/`profiles` via
      raw anon REST calls — the meaningful version of this test, not
      trivially-empty tables). `tsc --noEmit`, `eslint .`, and
      `next build` all clean; dev server restarted cold with no errors.
      All test data (10 Supabase rows, 1 auth account, temp scripts,
      temp test-log entries) removed after — pre-existing dev-cycle
      test-log entries from earlier sessions were left untouched.

### Final closure — V1.3 formally approved complete 2026-07-25
- [x] Separate staging vs. production Supabase projects — **deferred to
      the Production Readiness & Launch Preparation phase** (not a
      numbered product version), not a blocker for V1.3 itself: the
      single project created here is correctly configured and fully
      verified; splitting environments is an operational/launch step,
      not an auth-architecture gap.
- [x] **Supabase Secret Key rotation** — flagged as compromised (visible
      during setup) per your own instruction; rotation is now Phase C of
      the Production Readiness & Launch Preparation phase (see dedicated
      section below) — explicitly sequenced before Phase D (external
      services) and Phase F (final verification), not silently dropped.

### Known issues (carried forward, all non-blocking)
- **Supabase Admin API write-endpoint incompatibility**: `admin.auth.admin.updateUserById()`
  intermittently fails with `invalid JWT: unable to parse or verify signature ... unrecognized JWT kid <nil> for algorithm ES256`
  on this project's new-format Secret Key — observed on `updateUserById`
  and (before the `adminData.ts` fix) `listUsers`. Read-oriented calls
  and ordinary table writes work; this looks infra-side (Supabase's new
  API-key rollout against this `@supabase/supabase-js` version,
  2.110.8), not fixable from application code. Retry-with-backoff is
  the practical mitigation, already applied where it matters
  (`adminData.ts`); worth a dependency version check before building
  any future feature that calls `updateUserById`/`deleteUser` directly.
- **Leaked-password protection** requires a Supabase Pro plan upgrade —
  tracked as a pre-launch item in `DEPLOYMENT.md`, not a code gap.
- Production `Site URL`/Redirect URLs still point at `localhost` —
  must be updated to the real domain before any production deploy (see
  `DEPLOYMENT.md`).

## Production Readiness & Launch Preparation — in progress

**Not a numbered product version** — a dedicated infrastructure and
launch-hardening phase. **Scope discipline, per explicit instruction:**
no new features, no business-logic changes, no unrelated refactors. If
a production blocker forces a business-logic change, the rule is: pause,
explain the blocker, propose the safest fix, wait for approval — never
make that call silently.

**Started:** 2026-07-25.

### Phase A — Repository Safety ✅ complete
1. [x] Repository integrity verified — `git fsck --full --strict` clean,
       no corruption.
2. [x] Rollback checkpoint created — see "Action log" below for the
       exact commit/tag.
3. [x] Release documentation confirmed complete — `CHANGELOG.md`,
       `DEPLOYMENT.md`, `MILESTONES.md`, `RELEASE_NOTES.md` all updated
       and consistent as of the checkpoint commit.

### Phase B — Production Infrastructure ✅ complete
Production Supabase project created by you (`goxuyooxrekzstssjgly`), with
"Automatically expose new tables" disabled — this required auditing every
`.from()` call site in `src/` and rewriting `0001_init.sql`'s grants to be
fully explicit least-privilege (see the migration's Hardening pass 4
header). All three migrations run successfully in order, confirmed by
independent re-check (Dashboard → Database → Functions/Advisors), not
just your report — one discrepancy was caught this way (Migration 0003
initially hadn't actually run despite an early "success" report; you
re-ran it and it then verified correctly).

**Live E2E verification matrix — all passed (2026-07-25):**
- Security Advisor: 0 errors / 0 warnings / 0 info, confirmed via a
  forced re-lint (not cached).
- Signup → `handle_new_user()` trigger → `profiles` row created
  transactionally, `business_id` correctly defaulted via
  `ordift_studios_business_id()`, `client` role auto-granted.
- Login → RLS-scoped portal read (own data only).
- Enquiry submissions: exact-match email, case-variant email (both
  correctly linked to the account via `find_user_id_by_email`), and
  guest (correctly unlinked, `user_id` null).
- Workshop registration: matching-account (auto-granted
  `workshop_participant` role) and guest (no role granted) — both
  correctly waitlisted against the pre-existing `[SAMPLE]` workshop.
- Duplicate-submission idempotency: two identical requests with the same
  client-generated key returned the identical reference number, no
  second row created.
- Client RLS boundary: test account saw only its own 2 linked enquiries,
  not the guest submission.
- Staff RLS boundary: temporary `staff` role grant (via a disposable
  script, immediately revoked after) showed all 4 enquiries and both
  workshop registrations — confirming role checks read `user_roles`
  live, not a stale session claim.
- Anonymous protection: raw REST calls with the publishable key and no
  Authorization header returned `401 permission denied` on all 9 tables
  (`profiles`, `enquiries`, `workshop_registrations`, `user_roles`,
  `roles`, `businesses`, `model_profiles`, `vendor_profiles`,
  `staff_details`) — anon has zero table-level grants, not just an
  RLS-empty-result, with real test data present at the time.
- `.env.local` restored to staging credentials afterward; the temporary
  staging-backup file and every disposable diagnostic/temp-grant script
  used during this pass have been deleted.

All test data cleanup confirmed complete (2026-07-25): the test auth
account, profile, and role grants were deleted via the Admin API; the 4
test enquiries and 2 test workshop registrations were removed by you via
the SQL Editor (`service_role` has no `DELETE` grant on those tables by
design). Independently re-verified afterward with a read-only `count(*)`
query run as `postgres` in the SQL Editor — zero rows remaining across
both tables and zero remaining trace of the test auth user.

### Phase C — Credential Security ✅ complete
1. [x] Rotated the Supabase Secret Key (the original one had been
       visible during initial setup) — you created a new key
       (`os_production_2026_07`) in the Supabase Dashboard using the new
       API-key system's multi-key support, so the old key kept working
       during the transition (zero downtime).
2. [x] Inventoried every location depending on the key before touching
       anything: no Vercel/hosting deployment exists yet (`DEPLOYMENT.md`
       confirms "not yet deployed anywhere"), no GitHub Actions/CI, no
       git remote configured. Staging is a fully separate Supabase
       project with its own independent key, unaffected by this
       rotation. The only real location was `.env.production.local` on
       this machine — updated, and confirmed never committed to git.
   [x] `.env.local` was not applicable — it holds staging credentials,
       not production's.
3. [x] Verified the new key against production (Admin API call +
       `SECURITY DEFINER` RPC call) before revoking the old one.
4. [x] Old key (`default`, `sb_secret_rdiBG...`) revoked in the
       Dashboard after the new key was confirmed working.
5. [x] Post-revocation verification: a direct request using the old key
       against the GoTrue admin endpoint returned `401 Unregistered API
       key`; a request using the new key succeeded — confirming the old
       key is fully retired and the app is unaffected.

### Phase D — External Services 🔶 in progress (updated 2026-07-27)
Decisions confirmed 2026-07-25:
- **SMTP provider: Resend** — ✅ **done** (2026-07-27). Production custom
  SMTP live on `auth.ordiftstudios.com`, SPF/DKIM/DMARC verified, all 6
  auth email templates branded. Full detail in
  `PRODUCTION_READINESS_REPORT.md`.
- **CAPTCHA provider: Cloudflare Turnstile** — ✅ **code complete**
  (2026-07-27): client widget (`src/components/TurnstileWidget.tsx`) and
  server verification (`src/lib/turnstile.ts`) built and wired into
  `/portal/signup` and `/portal/login`, following the same
  "inert-until-configured" pattern as Google Sheets — renders/verifies
  nothing until `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`
  are set. **🟡 PENDING OWNER DECISION** — needs you to create a
  Cloudflare Turnstile site and provide the two keys; deliberately
  deferred (2026-07-27) so infrastructure decisions don't block feature
  work — see `PRODUCT_ROADMAP.md` for how this stays visible going
  forward.
- **Google Sheets backup** — rebuilt 2026-07-27 into the dual-storage
  workflow: Supabase is now the primary, required write for every public
  form; Google Sheets is a best-effort secondary copy across 9
  worksheets (2 live — Workshop Registrations, Contact Enquiries; 7
  reserved) inside one "Ordift Studios Operations" spreadsheet, with a
  `sheet_sync_failures` retry queue so a transient Sheets outage is
  recoverable rather than silent. Record IDs across the whole platform
  now follow a shared sequential standard (`PREFIX-YYYY-NNNNNN`, see
  `RECORD_ID_STANDARD.md`) backed by an atomic Postgres counter
  (`supabase/migrations/0013_record_ids_and_sheet_sync.sql`). See
  `GOOGLE_SHEETS_INTEGRATION.md` for the full design and setup. **🟡
  PENDING OWNER DECISION** — still needs a Google Cloud service account
  from you (`GOOGLE_SERVICE_ACCOUNT_EMAIL`,
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`),
  **and migration 0013 applied to staging and production** — until that
  migration runs, both forms fail closed with a 503 (Supabase is
  required, so no record ID can be generated without it) rather than
  silently dropping a submission.
- **Operational Reporting + Project Requests Sheets integration** —
  added same day. A third live Sheets integration (Project Requests,
  `PRJ` prefix, `supabase/migrations/0015_project_requests_record_id.sql`),
  a new Admin Portal reporting layer (`/admin/reports`, plus search/
  filter/CSV/XLSX export added to `/admin/enquiries` and
  `/admin/bookings`) reading exclusively from Supabase, and a
  config-driven module registry (`src/lib/admin/reports/registry.ts`)
  so a future form's report support is one registration, not new code.
  See `ADMIN_GUIDE.md` §16. Same pending-migration blocker as above —
  `phone` columns (migration 0014) and the `project_requests`
  `reference_number` column (0015) also need to be applied before this
  is fully live.
- **Analytics (Google Analytics)** — no code exists yet, not just a
  missing key. **🟡 PENDING OWNER DECISION** — needs
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` from you before this is even worth
  building; deliberately deferred (2026-07-27).

Production domain/DNS and the production Supabase project (both
originally listed as blockers here) are done — see Phase B above and
`DNS_SNAPSHOT_PRE_LAUNCH.md`.

### Milestone: Ordift Studios v1.0 — Infrastructure Complete (2026-07-28)

Tagged `v1.0.0-infrastructure-complete`. Closes out the backend/
infrastructure phase — the dual-storage form workflow, the platform-
wide sequential record ID standard, and the Admin Portal operational
reporting layer are all built, migrated, and directly verified
end-to-end on **both staging and production**: Contact Enquiry,
Workshop Registration (staging only — production has no published
workshops yet, a content gap not a code gap), Project Request, Admin
Reporting, CSV export, Excel export, and Email to Operations (test
mode, since `FORMS_SENDING_ENABLED` is still off in production).

Two things surfaced and were fixed during this closing verification
pass, both documented in full in migration `0016_service_role_grants.sql`:

- **Migrations 0013–0015 had only been applied to staging**, not
  production, despite the app already being deployed against
  production — every real Contact Enquiry/Workshop Registration
  submitted on the live site would have failed with a 503 until this
  was caught and fixed the same session.
- **`service_role` was missing base table grants** on `enquiries`,
  `workshop_registrations`, `project_requests`, `record_sequences`, and
  `sheet_sync_failures` in production — same root cause as
  `0010_service_role_grants_fix.sql` ("Automatically expose new
  tables" is disabled on production), hit again because the lesson
  from 0010 wasn't carried into the new tables this phase added.

**Deployment note:** one production deployment (commit `6707ffc`, the
0016 migration file itself — no app code) hung in Vercel's "Deploying
outputs" phase for 15+ minutes after a clean 2-minute build, with
Vercel's own status page reporting all systems operational — an
isolated, platform-side deployment hang, not a code or config issue.
Resolved by removing the stuck deployment (`vercel remove --safe`,
which refuses to touch anything with an active alias) and pushing a
new commit; the replacement deployment completed normally in ~2
minutes. Production was never down during this — Vercel keeps serving
the last successful deployment until a new one is ready to promote.

New this pass: `POST /api/admin/google-sheets/setup` (admin-gated) —
runs the same worksheet bootstrap as `scripts/setupGoogleSheets.ts`
against whichever environment it's deployed to, needed specifically
because Vercel's "Sensitive" environment variables can be used by a
running deployment but never read back by anyone, including via the
CLI — there was no other way to run the bootstrap against production
without the credentials passing through a human's hands.

**What's explicitly not in scope for this milestone** (tracked
separately, Google Sheets credentials wiring already in progress as of
this date): Google Sheets worksheet bootstrap execution, Resend
production email, enabling live form delivery
(`FORMS_SENDING_ENABLED`), legal page approval
(`LEGAL_PAGES_APPROVED`), and all real content population. Per the
explicit instruction accompanying this milestone, no further
migrations, backend features, or infrastructure work should be started
beyond finishing the Google Sheets/Resend/legal items already in
motion, unless a genuine bug is found or it's explicitly requested.

### Google Sheets Integration — technically verified (2026-07-28)

Closes out the Google Sheets item from the milestone above. Owner
completed the manual setup (Google Cloud project, Sheets API enabled,
service account + JSON key, "Ordift Studios Operations" spreadsheet
created and shared with the service account as Editor, all three
credentials added to Vercel Production as Sensitive variables).

One config issue found and fixed along the way: `GOOGLE_SHEETS_SPREADSHEET_ID`
initially contained more than the bare ID (the connectivity check
failed with a Sheets-API-specific "Requested entity was not found,"
which — distinct from an auth error — indicated the private key itself
was parsing and authenticating correctly, narrowing the problem to the
ID value). Owner corrected it; a redeploy (env var changes need a new
deployment to take effect) picked up the fix.

All 10 worksheets created and formatted via `POST
/api/admin/google-sheets/setup` (bold header, frozen row, basic
filter, auto-sized columns). Full write path verified via the new
Super Admin-only `POST /api/admin/google-sheets/verify-write` (see
`GOOGLE_SHEETS_INTEGRATION.md` §10): authentication, spreadsheet
lookup, worksheet existence, formatting, write permission, and
read-back all confirmed — the row was written, read back, and deleted
automatically, leaving no trace.

**Deliberately not tested this pass:** the real public-form → Sheets
path (a real Contact Enquiry/Workshop Registration/Project Request
actually reaching the live spreadsheet), since that requires
`FORMS_SENDING_ENABLED=true`, which also gates real email sending —
owner explicitly declined to enable it before Resend is verified, to
keep the two systems' rollout independent. A temporary QA test
workshop was published to production Sanity to support this test, then
removed unused once the decision was made to defer it.

**Google Sheets infrastructure: technically verified, not yet
publicly exercised.** Full end-to-end confirmation resumes once Resend
production email (Phase 2B) and `FORMS_SENDING_ENABLED` (Phase 2C) are
both live.

### Admin Profile Quick Card — V1 shipped (2026-07-28)

New internal feature: clicking the logged-in admin's own name in the
`/admin` header (previously plain text beside Sign Out) opens a Quick
Card with Staff Number, Job Title, Department, Grade (Admin/Super Admin
only), Date Joined, calculated platform tenure, Account Status, and
Last Login, plus "View Full Profile" (`/admin/profile/[id]`) and "Edit
Profile" links. V1 is self-view only — reached exclusively via your own
name — with a staff directory (viewing colleagues) explicitly deferred.

Implements the organizational **Grade system** speced out and
deliberately deferred during the 2026-07-27 IAM/email verification pass
(see the System Administrator Guide for the full confidentiality
policy): a new `grades` lookup table (10-tier hierarchy, Intern →
Founder/CEO), business-scoped, admin-only to read, super-admin-only to
manage. Grade **never** affects permissions — Roles remain the sole
permission mechanism — and is gated twice in the Quick Card: once by
RLS (a non-admin/-super_admin viewer's own join to `grades` returns
nothing) and again in the app layer, so a UI bug alone couldn't leak
it. Verified directly: a Staff-only QA account with a Grade secretly
assigned in the database still saw no Grade row anywhere, on both
staging and production.

Also introduces **Staff Numbers** (`STAFF-YYYY-NNNNNN`), reusing the
existing `next_record_sequence()` function (migration 0013) with a new
`STAFF` prefix — no new counter mechanism. Migration `0017` (grades +
`staff_details.staff_number`/`grade_id`) applied and verified on both
staging and production. Editing is split by risk: contact fields
(name/phone) are self-service via the existing `profiles` self-update
grant; operational fields (Staff Number, Job Title, Department, Grade)
are Super Admin-only to edit, even on your own card, via a
service-role-backed server action — matching the precedent already set
by `updateCollaboratorDetailsAction`.

**Deliberately not in V1:** photo upload. `profiles.avatar_url` exists
but has no upload path — initials fallback covers this; real upload
(Supabase Storage bucket + upload route) was estimated at 70–90
minutes and deferred to a fast-follow rather than folded into this pass
(owner's explicit 30-minute threshold call).

**Follow-up found during rollout:** migration `0017` granted
`authenticated` access to `public.grades` but not `service_role` — the
same gap class as `0010`/`0016` (production has "Automatically expose
new tables" disabled, so `service_role` gets zero table privileges
until explicitly granted). Doesn't affect the live feature itself
(it only ever reads/writes `grades` through the logged-in admin's own
session), but blocks service-role tooling. Fixed as migration `0018`
(one-line grant) — applied and verified on staging and production; the
founder's own account (`matetey@ordiftghana.com`) was then assigned
Grade 10 (Founder/CEO), per the original spec's default.

**Refinement (2026-07-28, same day):** two owner-requested changes shipped after the initial rollout:
- **Staff Number format simplified** — dropped the visible `STAFF-` prefix and `YYYY` year (e.g. `STAFF-2026-000001` → `000001`), since the year duplicated the existing Date Joined field and the literal `STAFF` text made the identifier's purpose obvious to a casual viewer. The counter itself still reuses `next_record_sequence()` (migration 0013), now keyed by an internal, never-displayed `"STAFF"` prefix with a fixed year of `0` so it never resets annually — this matters because, with the year no longer part of the visible string, a per-year counter would otherwise eventually assign two different people the same-looking number.
- **Last Login added to the Admin Users & Roles "Manage" panel** — previously only visible on a person's own Quick Card; now also visible to Admin/Super Admin for any account via `/admin/users`, using that page's existing admin-only gate (no new access-control code needed).

### Member Number system + Admin Presence panel — shipped (2026-07-28)

Replaces the staff-only Staff Number (above) with a **universal Member
Number**: every account — staff or public-facing — gets an
auto-generated, prefixed number driven by an admin-assigned **Account
Classification**, never by Role, Engagement Type, or Operational Title.
Eleven classifications shipped: Permanent Staff (no prefix), Intern
(`IN`), Contractor (`CT`), Freelancer (`FL`), Volunteer (`VL`), Project
Participant (`PR`), Instructor (`INT`), Workshop Participant (`WK`),
Model (`MD`), Vendor (`VN`), Client (`CL`) — each with its own
independent, never-resetting counter. Classifications are fully
configurable from **Settings → Titles & Classifications**
(`/admin/lookups`), not hardcoded — a Super Admin can add a new category
(e.g. Speaker, Sponsor), set its prefix/padding/starting number, or
disable one, with no code change.

The number changes only when classification changes. Reclassifying
archives the previous `member_numbers` row (`status='archived'`,
timestamped) and inserts a new active one — the old number is never
deleted or reused, even if the person is later reclassified back to a
classification they previously held (verified: Permanent Staff `0001` →
reclassify to Intern → `IN0002` → reclassify back to Permanent Staff →
`0002`, not a reused `0001`). Reclassifying to the classification
already held is a no-op (idempotent). New public signups auto-assign
"Client"; new admin-invited collaborators require an explicit
classification at invite time.

Also ships a live **"Active Now" panel** on `/admin/overview`, above
Recent Activity: Name, Member Number, Department for every Staff/Admin/
Super Admin account currently online, via Supabase Realtime Presence on
a **private, Authorization-gated channel** — the same trust boundary as
every other internal-only surface, not a separate one, since an
unprotected channel could otherwise be joined by any authenticated
client (Client/Model/Vendor/Workshop Participant included) directly
from browser dev tools regardless of what the UI renders. Users show
Online/Away via a 5-minute client-side idle timer.

**Bug found and fixed during production build verification:** the
`admin` → `admin/overview` server redirect (hit on every login) briefly
double-mounts the layout, leaving two concurrent presence connections
under one person's key — the original "prefer online over away" dedupe
logic could get stuck permanently online if the stale connection's last
write was "online". Fixed by making dedupe recency-based (each tracked
write carries a timestamp; newest wins), verified via direct inspection
of the raw presence payload showing the duplicate entries, then
confirmed fixed with a clean online → away → online round-trip.

**Follow-up found during production migration 0020:** `activity_log`
(created in migration `0004`) was never granted to `service_role` on
production either — same gap class as `0010`/`0016`/`0018` above,
production's "Automatically expose new tables" being disabled. Blocked
service-role deletion of a QA test account (its `actor_user_id` FK to
`profiles` had no cascade); worked around via one manual SQL Editor
delete for that specific test row rather than folded into this pass, so
this class of gap now has four instances on record. **Fixed by a
dedicated audit pass — see migration `0021` below, applied to both
environments the same day.**

Migrations `0019` (classifications + `member_numbers` ledger,
`profiles.member_number`, drops `staff_details.staff_number`) and
`0020` (Realtime Authorization policies for the `admin-presence`
channel) applied and verified on both staging and production — schema,
seed data (11 classifications), RLS, grants, and live functionality
(classification assignment, lifecycle archival, idempotency, and
Realtime Presence connect/sync) all confirmed working end-to-end on
production with a QA account, then fully cleaned up.

### Fixed — service_role grants audit, `0021` (2026-07-28)

Fourth occurrence of the same gap class (`0010`, `0016`, `0018`, now
`0021`) prompted a full audit instead of another one-off patch: every
`create table public.*` across `supabase/migrations/*.sql` was
cross-referenced against every `grant ... to service_role` statement,
then every ungranted table was cross-referenced against actual
`service_role` usage in `src/lib/**`, `src/app/**/actions.ts`, and
`scripts/`. Result: `public.activity_log` was the only real gap —
`logActivity()` itself never needed the grant (it deliberately uses the
request-scoped RLS client), but ad-hoc service-role tooling (admin
cleanup scripts, one-off data fixes) does, which is exactly what
surfaced it. The other eight ungranted tables at the time
(`businesses`, `enquiry_notes`, `feature_flags`,
`deliverable_categories`, `deliverables`, `model_profiles`,
`vendor_profiles`, `request_types`) were confirmed, table by table, to
have no `service_role` code path anywhere — deliberately left
ungranted rather than pre-granting speculatively. Verified on staging
(full CRUD, then the exact previously-blocked cleanup scenario
replicated and resolved end-to-end) and again on production after
approval (grant live, blocked test account now deletes cleanly, the
other eight tables independently confirmed still correctly restricted
to `authenticated`-only — production is the environment where that
restriction actually matters, since it's the one with "Automatically
expose new tables" disabled).

**Service-role grant policy, going forward** (added to
`ADMIN_GUIDE.md` §10 — read it before writing any migration that
creates a table or a `service_role`-touching code path):
- **Grant `service_role` on a table only when code actually calls it
  through the service-role client** (`createAdminClient()` in
  `src/lib/supabase/admin.ts`, or a one-off script under `scripts/`).
  Never grant "just in case."
- **When adding a new service-role code path to an existing table**,
  check whether that table already has a `service_role` grant before
  assuming it does — production's "Automatically expose new tables"
  setting is disabled, so a table can work perfectly for every
  `authenticated`-session code path and still silently fail the moment
  something tries to reach it via `service_role`.
- **Staging is not a reliable check for this** — it has "Automatically
  expose new tables" enabled, so `service_role` already has access to
  everything there regardless of explicit grants. A grant (or its
  absence) only becomes observable on production. Verify the
  *mechanism* on staging (the grant statement runs, the CRUD works);
  verify the *restriction* only matters on production.
- **Checklist before shipping a migration that creates a table:**
  1. Does any code path read/write this table via `createAdminClient()`
     or a `scripts/` file? If yes, add the grant in the same migration
     that creates the table — don't wait for it to break.
  2. If unsure, grep `src/lib/**`, `src/app/**/actions.ts`, and
     `scripts/` for the table name before deciding.
  3. If no service-role path exists yet but one is clearly coming
     (e.g. a companion admin-tooling script planned for the same
     feature), grant it then, not speculatively now.
  4. Never broaden a grant to "fix" an unrelated failure — trace the
     actual failing table first (`error.code === '42501'` plus the
     table name in the query is the tell).

### Fixed — invited Staff accounts couldn't complete sign-in (2026-07-28)

A real invited Staff member reported being unable to log in despite
their account looking entirely correct in Staff Management (Active,
Email Verified, Staff role, Operational Title, Full-time). Traced
end-to-end before touching anything: middleware doesn't discriminate by
role; `/admin` explicitly allows Staff; there is no missing "Staff
Portal" — Staff and Admin share `/admin` by design (Task #85);
`auth.users`/`profiles`/`staff_details`/`user_roles` were all correctly
linked. **Root cause:** `inviteCollaboratorAction`'s invite email
redirected to the plain `/portal/login` form, which has no code to
consume the invite's session token — the Supabase client SDK silently
confirmed the email and logged one sign-in event on page load, but the
person was never prompted to set a password, leaving the account
permanently password-less. Every later login attempt correctly failed
with the same generic "Invalid email or password" a real credential
mismatch would produce — indistinguishable from a broken account from
the outside, but purely an authentication gap; every authorization
guard was correct the whole time. **Fix:** the invite redirect now
points at `/portal/reset-password` instead, reusing the same
hash-token-parsing page already built for the forgot-password flow
(`ResetPasswordForm.tsx`, which doesn't care whether the token type is
`recovery` or `invite`). Verified by inviting a throwaway Staff account
through the real, fixed action end-to-end — accept invite, set
password, sign in, land on `/admin` — with no manual steps, then
deleting the test account. The real affected user was separately
unblocked via the existing "Forgot password?" flow, which already
worked correctly and needed no code change.

### Production email infrastructure hardening (2026-07-29)

Full production-first hardening pass over the email subsystem,
following a completed Resend production verification pass and a
root-cause fix for a multi-message RESEND_API_KEY debugging saga
(delivered as a Production Email Readiness Report directly in
conversation, not a committed file): the real cause was
Vercel's "Sensitive" environment variable type being write-only by
design — `vercel env pull`/dashboard/API can never read the value back
once flagged Sensitive, which made every local/CLI-based verification
attempt structurally impossible regardless of whether the key itself
was correct. Resolved by verifying entirely from inside the running
deployment instead (`/api/admin/resend/verify-send`, Super-Admin-gated,
same precedent as the Google Sheets verify-write route).

**1. Redis-backed rate limiting and idempotency** — replaced the
in-memory `Map`-based stores in `src/lib/shared/rateLimit.ts` and
`src/lib/shared/idempotency.ts` (which explicitly documented their own
"won't survive multiple serverless instances" limitation) with Upstash
Redis, provisioned via the Vercel Marketplace one-click integration
(`upstash-kv-cobalt-forest`, connected to Production/Preview/
Development). Rate limiting runs as an atomic Lua script server-side
(sliding window, trim-then-check-then-add in one round trip) so
concurrent requests across instances can't race past the 5-per-10-
minute limit; idempotency uses a 30-minute TTL key. Both fall back to
the original in-memory behavior when Redis isn't configured (local dev
before `vercel env pull`) and fail open (allow the request) if Redis is
briefly unreachable, so a Redis outage degrades to "less protected,"
never "forms stop working." Verified directly against the live
production Redis instance (5 allowed, 6th correctly blocked with the
right retry-after) and end-to-end through the real production
`/api/enquiry` route (duplicate submission with the same idempotency
key correctly returned the original reference number instead of
creating a second record).

**2. Retry-with-backoff email dispatcher** — new
`src/lib/shared/email/dispatch.ts` centralizes what was three
copy-pasted `dispatch()`/Resend-client implementations (enquiry,
workshop registration) into one shared path: up to 3 attempts,
exponential backoff (500ms base, doubling), and transient-vs-permanent
classification based on Resend's actual HTTP `statusCode` (null/429/5xx
= transient and retried; other 4xx = permanent, fails fast). Exposes
two functions: `sendEmail()` (respects `FORMS_SENDING_ENABLED` — the
one every real form uses) and `sendEmailNow()` (unconditional, used
only by the verify-send diagnostic, whose entire purpose requires it to
always attempt a real send regardless of the flag).

**3. Project Request email workflow** — Project Requests previously had
no email step at all (traced through the actual code before building
anything, rather than assuming). Added acknowledgement + admin
notification emails (`src/lib/projectRequests/emailTemplates.ts`,
`email.ts`), matching the existing enquiry/workshop branding and the
same "local copy, not shared import" template convention, wired as
fire-and-forget sends in the portal request action alongside the
existing Sheets sync.

**4. Email dead-letter logging** — new `email_send_failures` table
(migration `0022`, mirrors `sheet_sync_failures`'s pattern exactly,
including granting `service_role` in the same migration rather than a
follow-up one — this exact class of gap had already recurred four times
for other tables). An email that exhausts every retry, or fails
permanently, is now logged there (best-effort, never blocks the send
path) instead of only existing as a server log line. Verified via a
direct insert/read/delete round trip against the production table.

**Migration history repair (2026-07-29):** discovered mid-deployment
that migrations `0009`–`0021` had all been applied to production
correctly (via manual SQL Editor execution) but were missing from the
Supabase CLI's remote migration-history bookkeeping table, which made
`supabase db push` attempt to replay all 13 of them. Before touching
history: independently verified via the production PostgREST OpenAPI
introspection endpoint that every table, altered column, and RPC
function from those 13 migrations already existed exactly as expected
(25 tables enumerated, all present; `staff_details.staff_number`
correctly absent post-0019's drop). Only after that confirmation was
`supabase migration repair --status applied 0009 0010 ... 0021` run,
followed by `supabase db push` applying `0022` alone.

Also caught and fixed mid-session: an earlier QA idempotency test's
cleanup step used stale credentials from `.env.local` (which, it turned
out, had been silently overwritten with **Development**-environment
values by an unrelated `vercel integration add` step earlier the same
session) and deleted from the wrong Supabase project — the real test
row was still live in production. Found via direct cross-check against
`.env.production.local`, corrected, and reconfirmed empty.

All five email types (Contact Enquiry, Workshop Registration, Project
Request — each acknowledgement + admin notification, plus a generic
credential check) verified sending successfully in production via the
Super-Admin verify-send endpoint, both before and after the dead-letter
deploy. `FORMS_SENDING_ENABLED` remains unset in production throughout
this entire pass — visitor-facing forms still log instead of sending
real email until that flag is explicitly turned on.

### CAPTCHA / automated abuse protection — Phase 4.1 (2026-07-29)

Extended the existing Cloudflare Turnstile implementation (previously
only wired into `/portal/signup` and `/portal/login`) to cover the two
genuinely public, unauthenticated, record-creating forms: Contact
Enquiry (`/book`) and Workshop Registration. Confirmed by enumerating
every `POST` API route and every `"use server"` action outside
`/portal/**`/`/admin/**` that Project Requests are **not** publicly
accessible (gated behind portal auth in
`src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/actions.ts`)
and there are no other anonymous form-submission surfaces — so no
CAPTCHA was needed there per the original scope's own "(if publicly
accessible)" qualifier.

- `src/lib/turnstile.ts` — `verifyTurnstileToken()` signature unchanged
  (still a boolean, still a no-op until `TURNSTILE_SECRET_KEY` is set),
  now logs Cloudflare's specific `error-codes` for observability.
- `src/components/TurnstileWidget.tsx` — rewritten to support an
  optional `onVerify`/`onExpire` callback pair (Cloudflare's
  `data-callback`/`data-expired-callback`) alongside its original
  implicit form-auto-injection behavior, which stays exactly as-is for
  `/portal/signup`/`/portal/login` (zero changes needed there). The two
  new consumers need the token handed to them directly since they
  submit via `fetch()` with a JSON body, not a native form POST — one
  (Workshop Registration) has a wrapping `<form>`, the other (Contact
  Enquiry's multi-step `BookingForm`) has none at all, so callback-based
  token capture is the only approach that works for both.
- `enquirySchema`/`workshopRegistrationSchema` gained an optional
  `turnstileToken` field, verified server-side only — the secret key
  never leaves `src/lib/turnstile.ts`, never appears in any API
  response.
- **Verification order matters:** idempotency check now runs *before*
  CAPTCHA verification in both routes (previously honeypot → CAPTCHA →
  idempotency). A Turnstile token is single-use — Cloudflare returns
  the same `timeout-or-duplicate` error for an expired token and a
  reused one — so a genuine client retry after a perceived failure
  (same `idempotencyKey`, but a token already spent on the first
  attempt) must return the cached result without needing a fresh
  challenge. Confirmed this is not just theoretical: submitting the
  same `idempotencyKey` twice, with a valid token on the first call and
  no token at all on the second, correctly returned the cached
  reference both times.
- Client-side: submit buttons on both forms stay disabled until a
  token is captured, but only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is
  actually set — inert everywhere until real credentials exist, same
  "code complete, waiting on credentials" pattern as Google Sheets and
  Resend before their credentials were configured.

**Tested using Cloudflare's own publicly documented dummy test
credentials** (https://developers.cloudflare.com/turnstile/troubleshooting/testing/),
not real production keys — every scenario runs deterministically
without needing an interactive challenge or a real Turnstile site:
- Valid submission — real dummy sitekey, "always passes" secret key,
  full flow through the actual widget in a browser: form completed,
  submitted, saved. **PASS.**
- Missing token — omitted entirely, rejected by
  `verifyTurnstileToken()`'s own guard before ever calling Cloudflare.
  **PASS.**
- Invalid token — "always fails" secret key. **PASS** (rejected).
- Expired/reused token — "token already spent" secret key (Cloudflare
  treats both cases identically). **PASS** (rejected).
- Duplicate request — same `idempotencyKey` resubmitted without a
  token, returned the cached reference instead of requiring a fresh
  challenge or creating a second record. **PASS.**
- Rate-limit interaction — confirmed the Redis-backed rate limiter
  (still the very first check in both routes) fires independently and
  takes priority when tripped, unaffected by the CAPTCHA changes.
  **PASS** (discovered incidentally during testing — the test client
  tripped its own rate limit after repeated calls, proving the two
  layers stack correctly rather than interfering).

All test data (QA enquiry records, temporary dummy-key env vars)
cleaned up from the staging Supabase project and `.env.local`
afterward. **Still needed before this protects anything in
production:** a real Turnstile site created in the Cloudflare
dashboard and its site key/secret key added to Vercel's Production
environment — code is complete and tested, but inert until then.

### Cloudflare Turnstile activated in production (2026-07-30)

Real Turnstile credentials created and wired in: a Cloudflare account
was created for Ordift Studios, a Managed-mode Turnstile site created
for `ordiftstudios.com`/`www.ordiftstudios.com` (no staging domain —
this project has no persistent staging URL, and local dev continues
using Cloudflare's public dummy test keys), and the resulting Site Key
(`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Preview + Production) and Secret Key
(`TURNSTILE_SECRET_KEY`, Preview + Production, Sensitive-flagged) added
directly in the Vercel dashboard by you — never passed through chat or
handled by me, per this project's standing secret-handling rule.

Deployed and verified against the real keys: missing-token and
invalid-token rejection on both `/api/enquiry` and
`/api/workshop-registration` (confirmed the real secret key correctly
calls Cloudflare's live siteverify API and rejects a non-genuine
token), email delivery (all 5 types still sending, zero regression),
and the full admin dashboard (live stats, Realtime presence, audit
log, Users & Roles) all functioning normally post-deploy.

**One verification gap, disclosed rather than glossed over:**
confirming a *successful* real-widget challenge completion in a
browser wasn't possible this pass — `LAUNCH_HOLDING_PAGE` (kept on,
per your explicit instruction) rewrites `/book` and
`/workshops/[slug]` to `/coming-soon` for every request regardless of
who's asking, so the actual public forms aren't reachable to load the
real widget on right now. This is a real, outstanding item for the
Go-Live sequence: once the holding page comes down (`DEPLOYMENT.md`'s
removal procedure), completing one real form submission with the real
widget is the first thing to verify, before treating CAPTCHA as fully
confirmed end-to-end.

### Backup & recovery readiness audit — Phase 4.2 (2026-07-30)

Re-verified the 2026-07-27 "zero backups" finding directly against the
live Supabase dashboard (Database → Backups, Storage → Files, and the
organization's plan page) rather than trusting the prior note —
confirmed unchanged: Free plan, zero automatic backups, PITR is a
Pro-plan add-on at $100/month on top of Pro, and zero Supabase Storage
buckets exist (all media is served by Sanity, not Supabase Storage, so
there's nothing to lose there). New finding this pass: the exact PITR
price point, and explicit confirmation both projects (staging +
production) share one organization-level Free plan.

Produced `DISASTER_RECOVERY.md` — the documented recovery procedure
requested: current capability (above), an interim manual `pg_dump`
backup method usable today without a plan upgrade, database/Storage/
environment-variable/Vercel-deployment restoration steps, a
post-recovery validation checklist, and explicit recovery
responsibilities (who needs what access, since no AI session — this
one included — retains credentials between conversations). The core
risk remains exactly what it was: production data (not schema — that's
always reproducible from `supabase/migrations/*.sql`) has no recovery
path today unless a manual backup was taken first. Non-destructive
throughout — no restore, pause, or delete action was performed against
any project, only read-only dashboard verification.

### Final production audit — Phase 4.3 (2026-07-30)

Full-application sweep following the staging/production migration-
history sync (both environments now consistent through `0022`, per
your own confirmation — not re-verified or re-touched this pass, per
your instruction). Found and fixed two real gaps, confirmed everything
else already sound:

- **Fixed:** no security response headers existed at all (`X-Frame-
  Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-
  Policy`) — added in `next.config.ts`, deployed, confirmed live via
  `curl -I`. Deliberately did **not** add a Content-Security-Policy —
  that needs every legitimate script/frame source (Turnstile, Sanity
  Studio) enumerated and tested first, not guessed.
- **Fixed:** `LAUNCH_HOLDING_PAGE` — the flag currently gating the
  entire public site behind "Coming Soon" — was completely
  undocumented in `.env.example`. Documented, along with the three
  auto-injected-but-unused Upstash env vars found during the same
  pass.
- **Confirmed clean:** zero `TODO`/`FIXME`/`debugger` statements, only
  two `console.log` calls in the whole codebase (both intentional
  test-mode operational logging, not debug cruft), no obsolete
  verification endpoints (every `/api/admin/**` route is permanent
  operational tooling), no leftover QA data in either Supabase project
  (swept `enquiries`, `workshop_registrations`, `project_requests`,
  `email_send_failures` on both).
- **RLS reviewed:** all 26 tables have RLS enabled; 3 system-only
  tables (`record_sequences`, `sheet_sync_failures`,
  `email_send_failures`) correctly have zero policies (deny-all for
  `authenticated`/`anon`, service-role-only by design) — confirmed via
  direct migration-file audit, not assumption.
- **Dependency vulnerabilities reviewed, not auto-fixed:** `npm audit`
  reports 31 findings, all transitive, all with only a breaking
  Next.js downgrade (16.2.11 → 9.3.3) as the suggested fix — correctly
  left alone per the explicit no-breaking-changes constraint. Notably,
  confirmed the flagged `sharp` vulnerability's code path is never
  actually exercised at runtime, since this app's `next/image` loader
  delegates all resizing to Sanity's CDN.
- Redis rate limiting and idempotency re-verified healthy against
  production post-migration-sync (fresh round-trip check, cleaned up
  after).

Produced `PHASE_4_PRODUCTION_AUDIT_REPORT.md` — Production Readiness,
Security, and Performance reports; a prioritized Critical/High/Medium/
Low task list; a 92% launch readiness score; the recommended Go-Live
sequence; and remaining risks with impact/mitigation. Two Critical
items remain, both requiring your decision/action rather than further
code work: the Supabase Pro-plan backup decision, and creating a real
Cloudflare Turnstile site (CAPTCHA code is complete and tested, inert
until real credentials exist).

### Phase E — Recovery 🟡 PENDING OWNER DECISION (billing)
Production Supabase project exists, but **the Free plan includes zero
project backups at all** (confirmed directly in the Dashboard: "Free
Plan does not include project backups") — not "unverified," genuinely
non-existent. A **Supabase Pro-plan upgrade** is required before any
backup schedule, backup, or restore test can happen. This is a paid/
billing decision — flagged for your approval, not actioned; deliberately
deferred (2026-07-27) so it doesn't block feature work, but it remains
the single highest-priority item in `PRODUCTION_READINESS_REPORT.md` §7
whenever you're ready to resolve it.

### Phase F — Final Production Verification 🔶 partially done
The email/IAM portion of this was completed 2026-07-27 — see
`PRODUCTION_READINESS_REPORT.md` for that pass. Still outstanding before
a full Launch Readiness sign-off: CAPTCHA and Google Sheets need their
credentials supplied and a live test; backup/restore needs the Phase E
billing decision resolved first.

### Action log
- **2026-07-25** — Phase A executed: verified repository integrity
  (`git fsck --full --strict`, clean); reviewed the full `git add -A`
  diff for secrets before staging (confirmed `.env.local` and
  `.data/*.jsonl` correctly gitignored, zero secret-pattern matches
  across all changes); committed the release snapshot (188
  files/changes, commit `9780eb1` — this was the repository's first
  real commit since the original `create-next-app` scaffold;
  everything built across this entire project had never been committed
  before) as **"Release snapshot: Version 1.3 complete — Authentication
  & Client Portal"**; tagged `v1.3.0-complete` (annotated) on that
  commit as the rollback checkpoint.
- **2026-07-25** — Phase B executed against the production Supabase
  project (`goxuyooxrekzstssjgly`): all 3 migrations run and
  independently re-verified, Security Advisor confirmed clean, and the
  full live E2E matrix (signup/trigger, login/RLS, enquiries, workshop
  registration + auto role grant, duplicate idempotency, client RLS,
  staff RLS, anonymous-access protection) passed — see Phase B section
  above for full detail. Test auth account/profile/roles cleaned up via
  the Admin API; the 2 test enquiry rows and 2 test workshop-registration
  rows were removed by you via the SQL Editor (service_role has no
  DELETE grant on those tables by design) and independently
  re-confirmed at zero. `.env.local` restored to staging.
- **2026-07-25** — Phase C executed: production Secret Key rotated
  zero-downtime using Supabase's multi-key support (new key created and
  verified working before the old one was revoked). Full dependency
  inventory confirmed the key's only real-world footprint was
  `.env.production.local` — no Vercel/hosting deployment, CI pipeline,
  or git remote exist yet for this project. Old key's revocation
  independently verified via a direct request returning `401
  Unregistered API key`.
- **2026-07-27** — Domain/DNS connected, production env vars
  configured, Phase D's Resend half completed (production SMTP live,
  branded email templates, verified SPF/DKIM/DMARC), full IAM system
  built and verified in production (migration `0009` + grant fixes
  `0010`–`0012`) — see `PRODUCTION_READINESS_REPORT.md` for full detail
  on this pass. Same date: repository pushed to GitHub for the first
  time (`origin` connected, `main` pushed, tagged `v1.0.0-production`),
  and Phase D's Turnstile CAPTCHA code built and locally verified
  (inert until credentials supplied — see Phase D above). New finding
  this date: production Supabase is on the Free plan, which has zero
  backup coverage — escalated as Phase E's blocker.

### Final pre-launch: sitemap, OG metadata, and content-readiness scope expansion (2026-07-30)

Part of the 10-phase final pre-launch pass. Two real technical gaps
found and fixed, plus one content finding that broadens an earlier
checklist:

- **Fixed:** `robots.ts` referenced `/sitemap.xml`, but no
  `sitemap.ts` route ever existed — a real 404 for any crawler that
  followed it. Added `src/app/sitemap.ts`, generating entries for every
  static route, legal page, and every `contentRepository`-backed
  content type (services, portfolio, journal, workshops, instructors).
- **Added:** Open Graph and Twitter card metadata to the root
  `metadata` export in `src/app/layout.tsx` (title, description, a real
  existing image — the gold full-lockup logo, not an invented asset —
  and site URL/name), so links shared on social/messaging platforms
  render a real preview instead of a bare URL.
- **Caught and fixed same-session:** the first version of that metadata
  change added a `title.template` on the root layout, which doubled
  every page's title (e.g. "About — Ordift Studios — Ordift Studios"),
  since every `src/app/**/page.tsx` already appends "— Ordift Studios"
  itself via its own `generateMetadata()`. Caught via direct browser
  verification immediately after deploying, fixed by removing the
  template and keeping only the plain default title, re-verified live.
- **Content finding:** direct browser checks of `/work` and `/journal`
  confirmed Portfolio and Journal are, like Workshops, entirely
  `[SAMPLE]` placeholder content — a broader finding than the original
  `WORKSHOP_CONTENT_CHECKLIST.md` covered. Replaced that file with
  `CONTENT_READINESS_CHECKLIST.md`, covering all three content types
  plus an explicit "already real, launch-ready" section for Homepage/
  About/Services (re-confirmed real, no placeholder markers, this
  pass). Cross-references updated in `DOCUMENTATION_INDEX.md`,
  `FINAL_GO_LIVE_REPORT.md`, `OPERATIONS_MANUAL.md`.

## Version 4.0 (partial) — Ordift Pulse Architecture — 2026-07-27 ✅ architecture complete

Pulled forward from `PRODUCT_ROADMAP.md`'s Version 4.0 per explicit direction, while the media architecture (immediately above) was still fresh. Architecture and CMS schema only — see `PULSE_ARCHITECTURE.md` for full design detail.

- [x] Three independent taxonomy axes (`pulseCategory`, `pulseRegion`, `pulseOpportunityType`) — same discipline as Role/Position/Grade/Engagement Type, reusing the existing `Category` shape rather than inventing a new one
- [x] One `pulseArticle` document type covering both news/editorial content and deadline-driven opportunity listings, and both Ordift-authored and curated third-party content, via `contentKind`/`origin` fields with Studio-side conditional field visibility (same pattern as `MediaAsset`/`PortfolioProject`)
- [x] Editorial-approval workflow: `status` gains an `inReview` stage beyond Journal's draft/published; curated content should always pass through it before publishing (Studio field guidance, not a hard state machine)
- [x] `pulseSource` trusted-source registry — the data layer's entire connection point for future ingestion; no fetching/scraping logic exists anywhere in the codebase
- [x] AI-assist future-proofing (`aiSummary`/`aiSummaryApprovedAt` scratch fields) for the roadmap's Source → AI summarization → Draft → Admin Review → Publish workflow — no summarization actually runs yet
- [x] `ContentRepository` extended with 6 Pulse methods, implemented in both the Sanity and local adapters, following the exact pattern of every other content type
- [x] `tsc --noEmit` and `eslint .` clean; `next build` clean across all 67 existing routes (no route touches Pulse yet); `sanity schema validate` — 0 errors, 0 warnings, confirming all 5 new document types are well-formed

### Pending work (explicitly out of scope for this stage)
- [x] Public presentation — **completed below** (embedded in Stories/Journal, not a separate `/pulse` section)
- [ ] Admin Platform module for Pulse (Sanity Studio is the interface today)
- [ ] Any data-provider ingestion (RSS/API/partner ingestion, per source)
- [ ] AI summarization integration
- [ ] Newsletter-sending integration
- [ ] Saved articles / notifications (Supabase tables, not yet needed — see `PULSE_ARCHITECTURE.md` §8)

### Known issues
- None outstanding.

## Version 4.0 (partial) — Ordift Pulse × Stories/Journal Integration — 2026-07-27 ✅ complete

Per explicit direction, Ordift Pulse's public-facing experience shipped embedded inside the existing Stories/Journal section rather than as a separate platform — see `STORIES_PULSE_INTEGRATION.md` for full design detail. `pulseArticle` remains a fully separate Sanity document type from `journalPost`; the two are unified only at the read layer.

- [x] `PulseOrigin` extended with a third value, `"community"`, and the Pulse visibility filter widened to include `status === "archived"` — the only two schema/query touches this stage required
- [x] `src/lib/content/storiesFeed.ts` — pure-function normalizer (`fromJournalPost`/`fromPulseArticle`) merging both content types into one `StoriesFeedItem` shape; zero new repository methods or Sanity queries needed
- [x] `JournalPostCard` updated to render the normalized shape plus a trust-badge pill (Verified by Ordift Studios / Official Source / Community Submitted / Archived); all 3 existing call sites updated, zero visual change for pure-Journal content
- [x] `/journal` hub: merged Journal+Pulse feed, sorted by date; new Content Type filter (Studio Stories/Editorial/Creative News/Industry Updates/Opportunities/Upcoming Events) reusing the existing pill-filter pattern; category chips now span both `journalCategory` and `pulseCategory` — "Creative Technology" deliberately has no dedicated tab since it's just a `pulseCategory`, already covered by the existing filter
- [x] `/journal/[slug]`: existing `journalPost` branch completely unchanged; new sibling branch for `pulseArticle` with an opportunity info block (deadline/eligibility/apply link/event dates) and a source-attribution link-out for curated/community content
- [x] Seven `[SAMPLE]` local `PulseArticle` fixtures, one per grouping/badge combination, for verification
- [x] `tsc --noEmit`/`eslint .` clean; `next build` clean across all routes; `sanity schema validate` 0/0
- [x] Manually regression-tested against the local adapter (temporarily swapped in, then reverted with zero net diff before committing): grouping tabs, merged categories, all 4 trust badges, opportunity/archived/community detail pages, and every existing Journal-only flow (post detail, author profile, category filter, search) confirmed working with no regressions

### Pending work (explicitly out of scope for this stage)
- [ ] Cross-type "Related" linking (a Journal post can't yet manually link to a Pulse article as related, or vice versa)
- [ ] Author profile page (`/journal/authors/[slug]`) showing Pulse editorial pieces by that author, not just Journal posts
- [ ] Cross-type slug-uniqueness validation (each type is unique within itself; not enforced across both — see `STORIES_PULSE_INTEGRATION.md` §6)
- [ ] Everything already listed as future work in `PULSE_ARCHITECTURE.md` §9 (ingestion, AI summarization, newsletter sending, saved articles/notifications, Admin Platform module)

### Known issues
- None outstanding.

## Version 2.0 — Business Platform *(superseded — see below)*

**Historical label, retired.** Admin dashboard, team management, and
CRM foundations (lead-lifecycle `crm_stage` enum, Enquiries CRM,
Users & Roles, Activity Log) shipped as part of **v1.0.0**'s Admin
Platform Tier 1. Remaining scope — deeper CRM/client-timeline features,
analytics dashboard, project management, internal ops tooling — carries
forward into **`PRODUCT_ROADMAP.md` Version 4.0 (Business Intelligence)**
for the analytics piece, and **Version 1.1 (Internal Organization)** for
the internal-ops-tooling piece.

- [x] Admin dashboard — shipped in v1.0.0 (Admin Platform Tier 1)
- [x] CRM foundation (lead lifecycle, Enquiries CRM) — shipped in v1.0.0
- [x] Team management (multiple administrators) — shipped in v1.0.0 (Users & Roles)
- [ ] Analytics dashboard → `PRODUCT_ROADMAP.md` Version 4.0
- [ ] Deeper CRM / client timeline → not yet mapped to a `PRODUCT_ROADMAP.md` version; revisit once real requirements exist
- [ ] Internal operations tooling → `PRODUCT_ROADMAP.md` Version 1.1 / 3.0

## Version 2.5 — Talent *(superseded — see below)*

**Historical label, retired.** Fully superseded by
**`PRODUCT_ROADMAP.md` Version 2.0 (Talent Management)**, which expands
this well beyond the original "Model" scope to Models, Influencers,
Brand Ambassadors, Actors, Artists, Hosts, Presenters, and Performers.
Plan Part G's Tier 2 secure-storage requirement (CVs, ID, consent info)
is carried forward explicitly as a release-blocking dependency there.

- [ ] Talent profiles, applications, bookings, casting → `PRODUCT_ROADMAP.md` Version 2.0
- [ ] Talent portfolio management → `PRODUCT_ROADMAP.md` Version 2.0
- [ ] Talent dashboard → `PRODUCT_ROADMAP.md` Version 2.0

## Version 3.0 — Commerce *(superseded — see below)*

**Historical label, retired.** Payment provider integration and the
online-store/commerce scope are not yet mapped to a `PRODUCT_ROADMAP.md`
version — neither fits cleanly into the currently-planned Versions
1.1–4.0, so this stays an open item to be scheduled once there's a
concrete commercial requirement driving it.

- [ ] Online store, digital products (LUTs, presets, courses) — unscheduled
- [ ] Merchandise, prints, licensing — unscheduled
- [ ] Payment provider integration (first real online payment anywhere in the system — workshops stay manual-confirmation until/unless this changes that) — unscheduled; likely feeds `PRODUCT_ROADMAP.md` Version 4.0's revenue reporting once it exists

## Version 4.0 — Ecosystem *(superseded — see below)*

**Historical label, retired.** Multi-business items map to the
`business_id`-scoped architecture already built (see `PRODUCT_ROADMAP.md`'s
Vision 2030 section); AI features map to `PRODUCT_ROADMAP.md` Version
4.0 (Ordift Pulse's summarization step, and the "AI insights" item under
Business Intelligence). Mobile app, client mobile portal, and community/
memberships remain unscheduled.

- [ ] Ordift Academy (full platform) — unscheduled
- [ ] Mobile app — unscheduled
- [ ] AI features → `PRODUCT_ROADMAP.md` Version 4.0 (Ordift Pulse, Business Intelligence)
- [ ] Client mobile portal — unscheduled
- [ ] Community, memberships — unscheduled
- [ ] Multi-language support, international expansion (§4.1) → informed by `PRODUCT_ROADMAP.md`'s Vision 2030 (multi-country operations)

---

## How this roadmap is maintained

- Checkboxes get checked off as work ships and is approved — not before.
- Each version is a checkpoint: per your standing approval-gate expectation, I'll present what's built for a version before moving to the next one, the same way the V1.0 checkpoint just worked.
- If scope shifts mid-version, add a dated note here rather than silently rewriting the list, so the history of what changed and why stays legible.
