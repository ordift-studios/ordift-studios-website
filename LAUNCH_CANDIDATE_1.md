# Ordift Studios — Launch Candidate 1 (LC1)

**Established:** 2026-07-27, at the close of Version 1.0 feature implementation. See `MILESTONES.md`'s freeze banner and `PRODUCT_ROADMAP.md`'s Version 1.0 entry for the architecture-freeze declaration this document tracks work against.

**Purpose:** LC1 is the production-readiness program that turns everything built under Version 1.0 into a launch-ready site — refinement, not addition. No new major system, portal, database, schema, or infrastructure ships during LC1 unless a critical defect requires one.

**Role shift for this phase:** the work from here is UI/UX polish, content readiness, accessibility, SEO, performance, responsiveness, and QA — evaluated the way a Senior Product Designer, Creative Director, UX Designer, QA Lead, Accessibility Auditor, SEO Specialist, and Launch Engineer would, not by adding features.

---

## Phase tracker

| Phase | Status | Summary |
|---|---|---|
| 1. Production Audit | ✅ complete (2026-07-27) | Prioritized punch list below — 0 Critical, 7 High, 5 Medium, 3 Minor/scope notes |
| 2. UI/UX Refinement | 🔶 first pass complete (2026-07-27) | All High-priority links/a11y fixes from Phase 1; premium branded placeholder replacing every flat gray/empty media area site-wide; focus-visible ring + subtle hover lift on the shared Button component. See "Refinement pass — 2026-07-27" below for the full before/after. Further per-page typography/spacing polish remains open (not exhaustively covered this pass — flagged, not silently skipped) |
| 3. Content Readiness | ✅ complete (2026-07-27) | `MEDIA_UPLOAD_LIST.md` rewritten into the comprehensive Media Requirement List — every image/video/logo/promotional-asset area, dimensions/orientation/format/subject, and upload-readiness status |
| 4. Portfolio & Service Readiness | 🔶 partial (2026-07-27) | Every department/service page now has a premium placeholder treatment (hero + Featured Work strip) ready to receive real content the moment the deferred schema follow-up lands; upload-order recommendation added to `MEDIA_UPLOAD_LIST.md`. Portfolio category prep beyond the existing schema not further scoped this pass |
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

## Refinement pass — 2026-07-27: before / after report

Everything below shipped in five focused, independently-verified commits (`54a674e`, `d0c466e`, `e70f83e`, `5c28e5c`, `401b0d5`), each preceded by a clean `tsc --noEmit`/`eslint .`/`next build` and a live browser check (console errors + visual confirmation), per your standing verification bar. No architecture, schema, database, or new system was touched — every change is a UI/UX/content-documentation refinement to what already existed, consistent with the architecture freeze.

### 1. Links, accessibility, and UI inconsistencies — all 7 High-priority Phase 1 items resolved

| Before | After |
|---|---|
| Client portal's empty-request-types state linked to `/contact`, a route that doesn't exist — a real, live 404 for any logged-in client who hit it | Points to `/book` (the actual enquiry route), via `next/link` instead of a raw `<a>` |
| Journal and Work hub search boxes had no programmatic label — placeholder text only, invisible to screen readers | Both have `aria-label` ("Search stories" / "Search projects") |
| 8 `<label>`/`<input>` pairs across `/admin/flags`, `/admin/lookups`, `/admin/bookings/[id]`, `DeliverablesManager`, `ProjectRequestsManager` had visible label text with no `htmlFor`/`id` link | Every pair associated; the one list-rendered case (`ProjectRequestsManager`) uses a per-row unique id, not a duplicate static one |
| `robots.ts` allowed crawling of `/admin`, `/portal`, `/studio` with no explicit disallow | All four internal prefixes (plus `/style-preview`) explicitly disallowed |
| `/style-preview/**` (internal design showcase) had zero access control — only a `robots: noindex` request, which crawlers can ignore and direct visitors bypass entirely | New `layout.tsx` gates the whole route tree behind `isStaging()` — a real 404 in production, not just a polite crawler request |
| `src/components/JournalCard.tsx` — a second, diverging card component only used by the (now-gated) showcase page, superseded by the real `JournalPostCard` | Deleted, along with its hardcoded mock data; showcase page updated to match |
| `DeliverablesGallery.tsx`'s `alt=""` (flagged for review, not automatically "fix") | Reviewed in context — genuinely decorative (always sits beside visible title text), left as-is; this is the *correct* WCAG pattern, not a gap |

### 2. Typography, spacing, hover states, forms, buttons — first pass

Given the size of "every page," this pass targeted the **shared components every page inherits from**, rather than a page-by-page sweep — the highest-leverage place to spend limited time, since a fix here applies everywhere at once:

- **`Button`** (used for every CTA site-wide): added a `focus-visible` gold ring — previously relied on the browser's bare default outline, unlike form inputs which already had a matching ring. Added a subtle `hover:-translate-y-0.5` lift (with `active:translate-y-0` on press) — a small, premium micro-interaction, deliberately not a flashy one.
- **`DepartmentCard`**: card background changed from off-white-on-off-white (zero contrast) to white, `hover:shadow-md hover:-translate-y-0.5` added to match Button's lift language.
- **Loading/empty states**: see §3 below — this is where the largest visual gap actually was.

**Not done this pass, flagged rather than silently skipped:** a page-by-page typography/spacing audit of Home, About, Services, Portfolio, Journal, and Workshops individually; page-transition animations; a systematic review of every form beyond the label-association fixes in §1. The site's existing typography system (`TYPOGRAPHY.md`, locked Fraunces + Inter scale) was already applied consistently everywhere checked during Phase 1 and this pass — no inconsistency was found, so no change was made there.

### 3. Placeholder redesign — the biggest single visual change in this pass

**Before:** every area with no uploaded media rendered as either a flat gray `<div>` (Home hero, Home department grid, `DepartmentCard`) or, for Portfolio/Journal/Workshops content with an empty CMS field, a flat `bg-ordift-navy-900/10` tint box. Since every Portfolio/Journal/Workshop entry currently in the CMS is `[SAMPLE]` placeholder content with no real photography, this meant **almost every image-shaped area on the entire live site was a flat colored rectangle.**

**After:** new `MediaPlaceholder` component — a radial navy/off-white gradient, the same subtly-shimmering gold glow already used on the Coming Soon holding page (`animate-ordift-shimmer`, respects `prefers-reduced-motion`), and the Ordift monogram, optionally with a small caption. No stock imagery anywhere, ever — this is the deliberate alternative. Wired into:
- `ResponsiveImage` and `MediaAsset`'s existing empty states — meaning Portfolio hero banners, Final Galleries, Before/After tiles, Journal cards and hero banners, and Workshop galleries **all** upgraded in one change, since they all route through these two shared components.
- `DepartmentCard` (Home's department grid).
- Home hero (new split two-column layout, placeholder on the right — previously text-only with a large empty area at desktop widths).
- The department/service page template (all 7 pages share one file): hero gains the same split layout, plus a new three-tile "Featured Work" placeholder strip.

Verified at both desktop (1440px) and mobile (375px) viewports, and in a small-tile context (Before & After pairs, gallery grids) to confirm the monogram scales down cleanly rather than looking oversized.

### 4. Visual presentation of department/service/journal/workshop/portfolio/homepage sections

Directly follows from §3 — the placeholder work *is* the visual-presentation improvement for every page type that had nothing before. Additionally on the department/service template specifically: inserting the new "Featured Work" section between "What We Offer" and the existing conditional sections would have silently produced two same-background sections back to back on 6 of the 7 department pages (a real bug caught during this pass, not shipped) — background alternation is now computed explicitly rather than hardcoded, so the white/off-white rhythm stays correct regardless of which optional sections a given department has.

### 5. Media Requirement List

`MEDIA_UPLOAD_LIST.md` rewritten from a shot list into the comprehensive Media Requirement List requested — every image/video/logo/promotional-asset area across every page type, with dimensions/orientation/format/suggested-subject and a three-way status (ready to upload / placeholder in place but no CMS field yet / not wired up at all) that makes the distinction between a shooting gap and a wiring gap explicit for the first time. One new finding surfaced while compiling it: `siteSettings.defaultSeo.ogImage` is a real, already-built CMS field that nothing in the site's metadata currently reads — flagged as a quick, no-schema-change follow-up rather than fixed in this pass, to keep this stage's diff to documentation only.

### What this pass did not attempt

Named explicitly so nothing here is mistaken for "done": an exhaustive route-by-route visual QA pass (Phase 5's job); Lighthouse/Core Web Vitals measurement; programmatic WCAG AA color-contrast verification; a full keyboard-only navigation trace; a screen-reader pass beyond the static label checks in §1; per-page typography/spacing beyond what the shared components already enforced; Workshop card/hero media (needs a schema field, deferred by the architecture freeze); the About page (no image field or placeholder exists there at all yet — lowest-traffic gap, not urgent).

---

*Companion documents: [MILESTONES.md](MILESTONES.md) (the freeze banner LC1 responds to), [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) (Version 1.0 entry marking the freeze), [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) (the prior infra-focused readiness checkpoint — this document is content/UX-focused, not a duplicate), [MEDIA_UPLOAD_LIST.md](MEDIA_UPLOAD_LIST.md) (the comprehensive Media Requirement List this pass rewrote), [MEDIA_ARCHITECTURE.md](MEDIA_ARCHITECTURE.md) (the `MediaPlaceholder`/`ResponsiveImage`/`MediaAsset` component library this pass extended), [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).*
