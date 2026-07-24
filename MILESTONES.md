# Ordift Studios — Versioned Milestone Roadmap

Status: **living document**, established 2026-07-23 at your request to manage
the project through versioned milestones rather than individual feature
requests from here forward. Update this file's checkboxes as work lands,
and add a dated note under a version when its scope changes.

Architectural reasoning behind each version's sequencing lives in
[ARCHITECTURE.md](ARCHITECTURE.md) — read that alongside this if a version's
ordering seems surprising (e.g. why CRM/Client Accounts wait for a real
database).

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
- [ ] Sanity CMS connected (`ARCHITECTURE.md` §4.2, deferred to Milestone 4)
- [ ] Object storage for real media (`ARCHITECTURE.md` §4.5 — all sample media are empty placeholders)
- [ ] Admin draft-preview mode, password-protection enforcement, multi-administrator access (all need auth — `ARCHITECTURE.md` §4.3)
- [ ] Newsletter send integration (fields exist, no sending infra)

### Known issues
- None outstanding.

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

### Phase B — Production Infrastructure ⏸ blocked on you
Cannot proceed until you create the production Supabase project (same
ownership rule as every other account in this project — I can't create
it). Once it exists, my steps: configure env vars, run all 3 migrations
in order, verify Security Advisor clean, re-run the full live
verification matrix from V1.3 Phase 4 against the new project
specifically (not assumed from the first project's results).

### Phase C — Credential Security ⏸ blocked on you (timing decision)
1. [ ] Rotate the Supabase Secret Key (flagged compromised since it was
       visible during initial setup) — you perform the rotation in the
       Supabase Dashboard (Project Settings → API), then share the new
       key the same one-credential-at-a-time way as the original setup.
2. [ ] Update `.env.local` and every deployment-platform environment
       variable that depends on it.
3. [ ] Verify the application functions correctly after rotation (a
       scoped re-check, not the full Phase F matrix).

### Phase D — External Services ⏸ partially decided, still blocked
Decisions confirmed 2026-07-25:
- **SMTP provider: Resend** — already integrated for this project's
  transactional email; production auth emails (signup confirmation,
  password reset) will use the same provider.
- **CAPTCHA provider: Cloudflare Turnstile** — will protect
  `/portal/signup` and `/portal/login`.

Still needed before any configuration work starts:
- **Production domain and DNS** — the actual domain, and who manages
  DNS (needed for Site URL/Redirect URLs, Sanity CORS origins, and
  Resend's sending-domain verification).
- Both integrations also depend on **Phase B** (the production Supabase
  project) existing first — Resend plugs into Supabase Auth's SMTP
  settings, Turnstile into Supabase Auth's CAPTCHA settings, both
  per-project.

### Phase E — Recovery ⏸ blocked on Phase B
Needs the production Supabase project to exist first (Dashboard →
Database → Backups is per-project). Configure backup schedule, perform
one backup, perform one restore test, confirm the procedure actually
works — not just that it's configured.

### Phase F — Final Production Verification ⏸ blocked on Phases B–E
Re-run every critical workflow (authentication, enquiries, workshop
registrations, dual-write, duplicate protection, RLS, anonymous
protection, admin access, client access, email delivery, CAPTCHA,
build/lint/typecheck) against the fully-configured production
environment, then produce a pass/fail Production Readiness Report before
any Launch Readiness sign-off is requested.

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

## Version 2.0 — Business Platform

- [ ] CRM (lead lifecycle: New Lead → Contacted → Discovery Meeting → Quotation Sent → Negotiation → Booked → In Progress → Delivered → Completed → Repeat Client → Referral)
- [ ] Admin dashboard
- [ ] Team management (multiple administrators — §4.3)
- [ ] Analytics dashboard
- [ ] Project management
- [ ] Internal operations tooling
- [ ] Blocked on: real database (§4.4) + auth (§4.3) — this is the version where those two decisions get made and built

## Version 2.5 — Talent

- [ ] Talent profiles, applications, bookings, casting
- [ ] Talent portfolio management
- [ ] Talent dashboard
- [ ] Note: Plan Part G already flags talent applications as Tier 2 (sensitive documents — CVs, ID, consent info) requiring a secure-storage evaluation before build, independent of this roadmap's sequencing

## Version 3.0 — Commerce

- [ ] Online store, digital products (LUTs, presets, courses)
- [ ] Merchandise, prints, licensing
- [ ] Payment provider integration (first real online payment anywhere in the system — workshops stay manual-confirmation until/unless this changes that)

## Version 4.0 — Ecosystem

- [ ] Ordift Academy (full platform)
- [ ] Mobile app
- [ ] AI features
- [ ] Client mobile portal
- [ ] Community, memberships
- [ ] Multi-language support, international expansion (§4.1)

---

## How this roadmap is maintained

- Checkboxes get checked off as work ships and is approved — not before.
- Each version is a checkpoint: per your standing approval-gate expectation, I'll present what's built for a version before moving to the next one, the same way the V1.0 checkpoint just worked.
- If scope shifts mid-version, add a dated note here rather than silently rewriting the list, so the history of what changed and why stays legible.
