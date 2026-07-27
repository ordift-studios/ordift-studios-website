# Ordift Studios — Launch Candidate 1 (LC1)

**Established:** 2026-07-27, at the close of Version 1.0 feature implementation. See `MILESTONES.md`'s freeze banner and `PRODUCT_ROADMAP.md`'s Version 1.0 entry for the architecture-freeze declaration this document tracks work against.

**Purpose:** LC1 is the production-readiness program that turns everything built under Version 1.0 into a launch-ready site — refinement, not addition. No new major system, portal, database, schema, or infrastructure ships during LC1 unless a critical defect requires one.

**Role shift for this phase:** the work from here is UI/UX polish, content readiness, accessibility, SEO, performance, responsiveness, and QA — evaluated the way a Senior Product Designer, Creative Director, UX Designer, QA Lead, Accessibility Auditor, SEO Specialist, and Launch Engineer would, not by adding features.

---

## Phase tracker

| Phase | Status | Summary |
|---|---|---|
| 1. Production Audit | ✅ complete (2026-07-27) | Prioritized punch list below — 0 Critical, 7 High, 5 Medium, 3 Minor/scope notes |
| 2. UI/UX Refinement | ⬜ not started | Typography, spacing, hierarchy, animation, hover/loading/empty states, forms, buttons, responsiveness |
| 3. Content Readiness | ⬜ not started | Structured media upload checklist (dimensions, orientation, format, purpose) — no stock imagery |
| 4. Portfolio & Service Readiness | ⬜ not started | Every portfolio category/service page prepped for production content; recommended upload order |
| 5. Launch QA | ⬜ not started | End-to-end verification of bookings, enquiries, workshops, stories, auth, portals, emails, public pages; final Go/No-Go report |

---

## Phase 1 — Production Audit

**Method:** a static codebase scan (grep/read across `src/app`, `src/components`, `src/lib`, `src/sanity` — placeholder markers, missing metadata, missing alt text, hardcoded links vs. real routes, accessibility red flags, debug leftovers, dead code) combined with a live spot-check in a fresh browser tab (console errors, visual layout, desktop + mobile viewport) across Home, About, Services hub, a department page, Work hub, a Portfolio detail page, Journal/Stories hub, Workshops hub, and the Book form. Not yet checked live: every one of the 60+ individual routes, a full Lighthouse/performance pass, or programmatic color-contrast measurement — flagged as open items under Minor/Scope below rather than silently assumed clean.

**Headline finding, not a code defect:** the production domain (`ordiftstudios.com`) is correctly serving the intentional `LAUNCH_HOLDING_PAGE=true` "Coming Soon" gate (see `proxy.ts`) in front of everything below — confirmed working as designed during deployment verification. Nothing in this punch list is currently visible to the public; it's what needs to be true before that gate comes down.

### 🔴 Critical

None found. No broken public forms, no crashes, no console errors on any of the pages checked (Home, About, Services hub, a department page, Work hub + detail, Journal hub, Workshops hub, Book form).

### 🟠 High

1. **Every Portfolio project, Journal/Stories post, Workshop, and Instructor/Author profile currently in the CMS is `[SAMPLE]`-prefixed placeholder content.** This is the single largest launch blocker on the site — not a bug, but the reason Phases 3–4 (Content Readiness, Portfolio & Service Readiness) exist. Confirmed via live Sanity-backed pages, not just local fixtures. About/Founder copy and site-wide Nav/Footer/Home body copy are already real, approved content — this gap is specifically Portfolio/Journal/Workshops/People.
2. **Home hero has no image or video** — large flat navy background with text only; on desktop this leaves a very large empty area to the right of the headline. First thing every visitor sees. (`src/app/page.tsx` — no `heroMedia` field exists yet on `HomePage`, per `MEDIA_UPLOAD_LIST.md`'s "Needs code first" note.)
3. **Home's 4 department cards are large flat gray placeholder boxes** with zero visual distinction between Photography/Videography/Design/Branding — the most visible "looks unfinished" moment on the entire site, since it's on the homepage.
4. **All 7 department/service pages (`/services/*`) have zero media capability at all** — not even a placeholder box, pure text. For a visual creative agency, a department page with no imagery undercuts the "premium creative house" impression more than almost anything else on the site.
5. **Broken internal link**: `src/app/portal/(dashboard)/client/projects/[kind]/[id]/requests/page.tsx:51` links to `/contact`, which doesn't exist — the real route is `/book`. Reachable by a real logged-in client whenever a project has zero configured request types.
6. **Unlabeled search inputs** on the two real public search UIs — `src/app/journal/page.tsx:106-111` and `src/app/work/page.tsx` — rely on placeholder text alone with no `<label>`/`aria-label`, a real accessibility gap for screen-reader users trying to use search.
7. **`/style-preview/**` (internal design/dev showcase) has no auth gate** — only `robots: {index: false}` protects it. Once the holding page lifts, it's reachable by anyone who guesses/finds the URL. Should be removed or gated behind staging/auth before general availability.

### 🟡 Medium

1. Journal/Stories' new Content Type groupings (Editorial, Creative News, Industry Updates, Opportunities, Upcoming Events) correctly show a working empty state ("No stories match these filters yet") since no Pulse content exists in the CMS yet — expected pre-launch, but worth timing Pulse's first real content alongside Portfolio/Journal content population in Phase 3.
2. Several `/admin/**` form fields have visible `<label>` text with no `htmlFor`/`id` association (`admin/flags`, `admin/lookups`, `admin/bookings/[id]`, `DeliverablesManager.tsx`, `ProjectRequestsManager.tsx`) — internal/staff-only accessibility gap, not public-facing.
3. `robots.ts` allows all with no explicit `disallow` for `/admin`, `/portal`, `/studio` prefixes — low risk since these redirect unauthenticated visitors, but worth tightening so crawlers never index a login/redirect variant.
4. Server-side `console.log` of recipient email + message body in the test-mode email fallback (`src/lib/enquiry/email.ts:18`, `src/lib/workshops/registrationEmail.ts:18`) — intentional and gated behind "sending not yet enabled," but worth confirming log retention/access policy is acceptable once real enquiries start flowing through it pre-launch.
5. `src/components/JournalCard.tsx` is dead/legacy — only used by the internal style-preview showcase, superseded everywhere real by `JournalPostCard.tsx` (which now also renders Pulse content). Risk of future design drift if someone edits the wrong one. Recommend deleting or clearly marking showcase-only.

### ⚪ Minor

1. `DeliverablesGallery.tsx:16` — raw `<img alt="">`. Defensible (adjacent visible title makes the image decorative) but worth a deliberate confirm.
2. A handful of auth-gated `/admin/**` and `/portal/**` client-workspace pages export no page-specific `metadata` — low SEO impact since none are reachable without login, but easy to standardize while other metadata work is happening.
3. **Not yet checked this pass** (flagged so they aren't silently assumed clean): a full route-by-route visual pass across all ~65 routes (only ~10 representative pages were spot-checked); an automated Lighthouse/Core Web Vitals run; programmatic color-contrast verification against WCAG AA (the brand palette's navy/gold/white combinations look plausible on inspection but haven't been numerically checked); keyboard-only navigation trace across the full site; screen-reader pass (VoiceOver/NVDA) beyond the static label-association checks above.

---

*Companion documents: [MILESTONES.md](MILESTONES.md) (the freeze banner LC1 responds to), [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) (Version 1.0 entry marking the freeze), [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) (the prior infra-focused readiness checkpoint — this document is content/UX-focused, not a duplicate), [MEDIA_UPLOAD_LIST.md](MEDIA_UPLOAD_LIST.md) (the existing media shot list Phase 3 builds on), [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).*
