# Launch Readiness Implementation Plan

**Date:** 2026-08-05
**Source:** every finding in `PRODUCT_LAUNCH_READINESS_REVIEW.md`, grouped into four sprints and broken into individually implementable, individually verifiable tasks.
**Status:** **Sprint 1 formally closed and tagged complete (2026-08-05)** — both Critical tasks implemented, verified, documented, committed, and independently re-verified (see Sprint 1 Final Verification below). **Sprint 2 approved and in progress (2026-08-05)**, evaluated from a multidisciplinary lens (Engineering/UX/Creative Director/Brand/SEO/Accessibility/Marketing/Photography) per your explicit direction — see the Sprint 2 section below for the full per-task evaluation. Sprints 3-4 remain not started.
**Working method (binding for every task, not just Sprint 1):** implement → verify functionality → update documentation → commit → only then move to the next task. No batching multiple tasks into one commit.

---

## Sprint 1 — Critical (must complete before launch)

### S1-T1: Fix self-referencing "Related" content across Portfolio, Journal, and Workshops
- **Objective:** A related-content section must never link back to the page the visitor is already on. Fix the root cause (no self-exclusion in the related-items filter) everywhere the same pattern exists, not just on the one page the review happened to catch it on.
- **Affected files:**
  - `src/app/work/[slug]/page.tsx` (lines ~77 `relatedProjects` filter, ~87 `relatedWorkshops` filter)
  - `src/app/journal/[slug]/page.tsx` (lines ~91-92 related-items filter)
  - `src/app/workshops/[slug]/page.tsx` (line ~64 related-items filter)
- **Dependencies:** None — self-contained logic fix, no schema or content change required.
- **Estimated implementation effort:** Low.
- **Expected business/user impact:** High — removes a visibly broken moment on the site's flagship, most-scrutinized page; prevents the identical bug from resurfacing silently the instant any other entity references itself or a small content set creates a similar collision.
- **Acceptance criteria:**
  - On `/work/sampson-sadia-wedding`, "Related Projects" no longer appears (zero *other* projects exist) — confirmed by absence of the section, not an empty grid.
  - Filter logic in all three files excludes the current item's own `id` from its related-items list.
  - No regression to the case where genuine, distinct related items exist (verified by temporarily reasoning through the filter logic, since production has no second item to test against live).
  - `npm run build` and `npm run lint` pass.

### S1-T2: Replace generic "no results" empty states with an honest "Coming Soon" treatment when a section has zero total content
- **Objective:** Distinguish "nothing published in this section yet" from "your filter matched nothing" on Journal and Workshops, and present the zero-content case with the same honest, intentional framing already proven on Talent Management — not a bare message that reads like a broken search.
- **Affected files:**
  - `src/app/journal/page.tsx` (empty-state block, ~lines 223-226; `items` already holds the unfiltered total)
  - `src/app/workshops/page.tsx` (empty-state block, ~lines 95-98; `allWorkshops` already holds the unfiltered total)
- **Dependencies:** None — the unfiltered totals needed to distinguish the two cases are already fetched and in scope; no new data source required.
- **Estimated implementation effort:** Low.
- **Expected business/user impact:** High — directly addresses the review's Critical finding that 2 of 7 primary nav destinations currently read as empty/broken rather than "not published yet." Matches the platform's existing discipline (proven on Talent Management) of honest, non-defensive messaging about what isn't ready rather than either faking content or leaving a bare "no results."
- **Acceptance criteria:**
  - When total unfiltered content is zero, Journal and Workshops render a distinct "Coming Soon"-style message (not the filter-specific "no matches" copy), visually consistent with the rest of the page.
  - When content exists but the active filter matches nothing, the existing "no results for this filter" copy is preserved unchanged (this case must not regress).
  - No fabricated claims, dates, or specifics in the new copy — consistent with the platform's "never invent facts" content discipline.
  - `npm run build` and `npm run lint` pass; manual check on staging/local confirms both states render correctly.

### Sprint 1 Final Verification (2026-08-05)

Conducted at your request before opening Sprint 2. Six checks, each reported against what was actually found:

1. **Re-ran TypeScript, ESLint, and Production Build.** All three clean — `npx tsc --noEmit` zero errors, `npm run lint` zero errors (2 pre-existing warnings in `PortfolioProjectForm.tsx`, unrelated to Sprint 1), `npm run build` exit 0.
2. **Regression review of every file modified.** Full diff of both Sprint 1 commits reviewed line by line (`src/app/work/[slug]/page.tsx`, `src/app/journal/[slug]/page.tsx`, `src/app/journal/page.tsx`, `src/app/workshops/[slug]/page.tsx`, `src/app/workshops/page.tsx`). Every change is additive and narrowly scoped to the two Critical findings — no unrelated modifications.
3. **Duplicate-logic check.** Grepped the full `src` tree for every related-content field (`relatedProjectIds`, `relatedWorkshopIds`, `relatedPostIds`, `relatedArticleIds`) and their consuming components. Confirmed: no other page has the same unguarded self-reference pattern (`journal/authors/[slug]` and `workshops/instructors/[slug]` have no related-content logic at all). Also checked the Portfolio admin editor (`PortfolioProjectForm.tsx`) — it already excludes the current project from its "Related Projects" checkbox list via a pre-filtered `otherProjects` prop, so authoring-time self-selection was never possible there. Journal and Workshops content, by contrast, is authored directly in Sanity Studio with no equivalent guard — confirming the render-layer fix (§S1-T1) is the correct and necessary single point of defense for all three content types, not a duplicate of existing protection.
4. **Documentation/index synchronization.** `DOCUMENTATION_INDEX.md`, `PRODUCT_LAUNCH_READINESS_REVIEW.md`'s Launch Checklist, and this plan's own status line and Progress Log all cross-reference consistently as of this verification pass.
5. **Engineering Standards Manual compliance — one real deviation found and corrected.** `ENGINEERING_GUIDE.md` §5 ("UI Design Patterns: Loading, Empty, and Error States") documents an explicit, specific standard for empty states: either the section is absent, or — where an informational empty state is genuinely appropriate — "a plain, honest sentence." The original S1-T2 implementation instead built a richer eyebrow/headline/body/button block modeled on Talent Management's `isComingSoon` treatment. On closer reading, that precedent doesn't actually apply: Talent Management's copy is real, CMS-authored content on an existing `Service` document, not a client-side fallback for zero query results — so it isn't the same pattern at all. **Corrected**: both empty states were simplified to a single plain sentence with an inline text link (matching the existing `text-ordift-gold hover:text-ordift-gold-hover underline underline-offset-4` link convention used elsewhere, e.g. the Founder-page link on `/about`), removing the hardcoded eyebrow/headline copy and the now-unused `Button` import from both files.
6. **Simplification/refactor opportunities.** The §5 compliance fix above *was* the simplification opportunity — fewer lines, one fewer component dependency, no new visual pattern introduced. Re-reviewed both files after the fix: no further simplification identified. `S1-T1`'s filter fix remains a minimal one-line (or two-line, for readability) change with no further reduction possible.

**Re-verification after the correction:** `npx tsc --noEmit`, `npm run lint`, and `npm run build` all re-run and pass clean. Both non-regression paths (`/journal?q=zzz`, `/workshops?category=zzz`) re-checked live against the local dev server — correct "no results for this filter" copy still renders, zero console errors.

**Sprint 1 is formally closed.** Tag: `sprint-1-complete`.

---

## Sprint 2 — High Priority: Brand & Discoverability

**Approach:** every task below is evaluated from eight perspectives — Senior Software Engineer, UX/UI Designer, Creative Director, Brand Strategist, SEO Specialist, Accessibility Specialist, Marketing & Conversion Strategist, and (where applicable) Professional Photographer/Visual Director — before deciding the implementation, per your explicit instruction to implement the solution that best strengthens the brand rather than merely the technically correct one.

### S2-T1: Surface real portfolio work on its own department page
- **Objective:** Photography's department page shows three generic "imagery coming soon" placeholders even though a real, published Photography/Weddings project exists (`Service.slug` and `PortfolioProject.disciplines` share the exact same `PortfolioDiscipline` type — the data link already exists, nothing to invent).
- **Multidisciplinary evaluation:**
  - *Engineer:* trivial data-join — filter `getPortfolioProjects()` by `project.disciplines.includes(service.slug)`, no schema change.
  - *UX/UI Designer:* a department page whose own "Featured Work" doesn't show the one piece of proof directly relevant to it is a broken expectation — visitors scan department → proof, not department → generic art.
  - *Creative Director:* the placeholder treatment is a deliberate, premium "coming soon" system — it should stay in place as the graceful fallback for departments with zero matching work, not be treated as filler once real work exists.
  - *Brand Strategist:* a brand claiming to be a "connected system" undercuts itself if its strongest existing proof isn't connected to the department it belongs to.
  - *SEO:* internal links from a department page to its matching case study add topical relevance signal between `/services/photography` and `/work/sampson-sadia-wedding` that doesn't exist today.
  - *Accessibility:* real `PortfolioCard` already carries proper alt text and semantic markup; placeholders are decorative — this is a net accessibility improvement, not just cosmetic.
  - *Marketing/Conversion:* a department page with zero real proof asks for trust on faith; one real card next to the booking CTA is a meaningfully shorter path to conviction.
  - *Photography/Visual Director:* the fallback for zero matches must never crop or reuse assets outside their intended aspect ratio — reuse `PortfolioCard`/`ResponsiveImage` exactly as built for `/work`, no new image-handling logic.
- **Decision:** replace the 3 hardcoded `MediaPlaceholder` tiles with up to 3 real matching projects via `PortfolioCard`, sorted the same way `/work` sorts Featured Projects; fall back to the existing placeholder treatment only when zero projects match — never mix real cards and placeholders in the same grid (a visual inconsistency none of the eight lenses would sign off on).
- **Affected files:** `src/app/services/[slug]/page.tsx`.
- **Dependencies:** None.
- **Estimated effort:** Low.
- **Expected impact:** Medium-High.
- **Acceptance criteria:**
  - Photography's department page shows the real Sampson & Sadia project card, linking to `/work/sampson-sadia-wedding`.
  - Every other department (zero matching projects today) still shows the existing placeholder treatment unchanged — no regression.
  - No department ever mixes real cards and placeholder tiles in the same grid.
  - `npx tsc --noEmit`, `npm run lint`, `npm run build` pass; verified live on `/services/photography` and one placeholder-only department.

### S2-T3: Canonical tags on the remaining 11 routes
- **Objective:** Close the canonical-tag gap identified in the review — only 4 of ~15 routes set `alternates.canonical` today.
- **Multidisciplinary evaluation:**
  - *Engineer:* replicate the exact existing pattern from `work/page.tsx`/`legal/[slug]/page.tsx` — no new mechanism to design.
  - *SEO Specialist:* this is the single highest-leverage SEO fix in Sprint 2 — it removes ambiguity for search engines about which URL variant is authoritative for every major page type, not just the 4 already covered.
  - *Brand Strategist / Marketing:* indirect but real — inconsistent canonicalization dilutes search equity precisely as the studio starts actively linking this site in outreach and proposals.
  - *Accessibility / UX / Creative Director:* no user-facing surface at all — purely a `<head>`-level correctness fix, no visual or interaction risk.
- **Decision:** add `alternates.canonical` to all 11 remaining routes, each pointing at its own real, canonical URL (`SITE_URL` + path), consistent with the existing pattern.
- **Affected files:** `src/app/page.tsx`, `src/app/about/page.tsx`, `src/app/about/founder/page.tsx`, `src/app/services/page.tsx`, `src/app/services/[slug]/page.tsx`, `src/app/journal/page.tsx`, `src/app/journal/authors/[slug]/page.tsx`, `src/app/workshops/page.tsx`, `src/app/workshops/[slug]/page.tsx`, `src/app/workshops/instructors/[slug]/page.tsx`, `src/app/book/page.tsx`.
- **Dependencies:** None.
- **Estimated effort:** Medium (11 small, mechanical edits).
- **Expected impact:** Medium.
- **Acceptance criteria:** every one of the 11 routes renders a `<link rel="canonical">` pointing at its own correct absolute URL; dynamic routes (`services/[slug]`, `workshops/[slug]`, etc.) resolve per-instance, not to a static template; `npx tsc --noEmit`, `npm run lint`, `npm run build` pass; spot-checked live via DOM inspection on at least one static and one dynamic route.

### S2-T4: Site-wide Organization/WebSite structured data
- **Objective:** No route currently carries `Organization` or `WebSite` JSON-LD — the review flagged this as reducing eligibility for Google Knowledge Panel treatment and sitelinks.
- **Multidisciplinary evaluation:**
  - *Engineer:* make `RootLayout` an async Server Component, fetch `contentRepository.getSiteSettings()` once, render one shared `<script type="application/ld+json">` — memoization via the existing repository pattern, no new data-fetching mechanism.
  - *SEO Specialist:* `Organization` schema is the foundation Google needs to associate the domain with the business entity across search, Knowledge Panel, and rich results — the single most valuable technical-SEO fix available before launch.
  - *Brand Strategist:* this is the machine-readable equivalent of "how we introduce ourselves" — it should say exactly what the site itself says, nothing more confident than the copy already is.
  - *Accessibility / UX / Creative Director:* invisible to visitors, zero rendering risk.
  - *Marketing:* stronger, more complete search-result presentation (an accurate Knowledge Panel, sitelinks) compounds every other marketing effort that drives someone to search "Ordift Studios" by name.
- **Decision — discipline over ambition:** populate the schema only from fields that are real, CMS-backed data already flowing through `SiteSettings` (`siteName`, `logoUrl`, `contactEmail`, `socialLinks`) — never invent a street address, a founding date, or social profile URLs that don't exist. `sameAs` is included only when `socialLinks` is non-empty; the whole block degrades gracefully as more real data is added later, exactly the same "never invent facts" discipline this project has held to everywhere else.
- **Affected files:** `src/app/layout.tsx`.
- **Dependencies:** None (uses the existing `getSiteSettings()` repository method).
- **Estimated effort:** Medium.
- **Expected impact:** Medium-High.
- **Acceptance criteria:** every page renders one `Organization`/`WebSite` JSON-LD block sourced from real `SiteSettings` data; no hardcoded facts not already present in the CMS; `sameAs` omitted when `socialLinks` is empty; validates as well-formed JSON; `npx tsc --noEmit`, `npm run lint`, `npm run build` pass; verified live via DOM inspection.

### S2-T5: Branded default social-share image
- **Objective:** Every page without its own Open Graph image (everything except the one case study and legal pages) falls back to the raw 474×524 logo file — undersized, wrong aspect ratio, not a compelling shareable visual.
- **Multidisciplinary evaluation:**
  - *Engineer:* Next.js's file-convention `opengraph-image.tsx` (via `next/og`'s `ImageResponse`) generates a real 1200×630 image at build time from real brand assets — no new design tool, no manual export step, and it can never drift out of sync with the brand system since it's compiled from the same source of truth as everything else.
  - *Creative Director:* compose the real approved logo (`logo-full-gold.png`) centered on the real navy brand gradient already used on `/coming-soon` and every department hero — reusing exactly what's already approved, not inventing a new visual.
  - *Brand Strategist:* the share image is often a prospect's very first impression of the studio, before they've clicked through — it should look as premium as the site itself, not like a cropped logo.
  - *SEO / Marketing & Conversion:* social platforms (WhatsApp, LinkedIn, iMessage) render this image at full width in previews — a correct 1200×630 branded card measurably improves click-through on every link this studio shares.
  - *Accessibility:* `alt` text set via the file convention's `alt` export, describing the studio rather than left blank.
  - *Photographer/Visual Director:* not applicable — no photographic asset involved, purely logo + brand color composition.
- **Decision:** build `src/app/opengraph-image.tsx` (and a matching `twitter-image.tsx`, or a shared generator function) rendering the real logo on the real navy gradient at 1200×630; remove the static `images` array from the root layout's `openGraph`/`twitter` metadata so there's exactly one mechanism defining the default image (no ambiguity about precedence); pages with their own explicit OG image (the case study, legal pages) are unaffected since their more specific, page-level metadata already takes precedence.
- **Affected files:** `src/app/layout.tsx` (remove the static `images` field), new `src/app/opengraph-image.tsx` (and `twitter-image.tsx` if needed as a separate file, or shared via a common generator).
- **Dependencies:** None — uses only assets already in `/public/brand`.
- **Estimated effort:** Medium.
- **Expected impact:** Medium-High.
- **Acceptance criteria:** pages without their own OG image now serve a real 1200×630 branded PNG; the case study and legal pages' existing page-specific images are unaffected (verified, not assumed); `npx tsc --noEmit`, `npm run lint`, `npm run build` pass; verified live via DOM/network inspection that the generated image actually renders correctly at the right dimensions.

### S2-T7: Resolve the guaranteed-empty portfolio filter option
- **Objective:** `/work`'s category filter includes "Destination Weddings," which matches zero published projects today, producing a certain dead end for anyone who clicks it.
- **Multidisciplinary evaluation:**
  - *Engineer:* filter the rendered category-chip list down to categories with at least one matching published project — a pure presentation-layer fix, no schema change, and it self-heals the moment a Destination Weddings project publishes.
  - *UX/UI Designer:* a filter control should never advertise an option with a guaranteed-empty result — that's the definition of a UI dead end.
  - *Creative Director / Brand Strategist:* small, but consistent with the platform's broader discipline of never presenting something as ready when it isn't.
  - *Marketing/Conversion:* a wedding client filtering by destination and hitting nothing is a moment of doubt at exactly the point they were trying to self-qualify — removing the option removes the doubt.
  - *SEO / Accessibility:* neutral — fewer, more accurate filter controls if anything slightly improves both.
- **Decision:** compute the available category list from categories that actually have ≥1 matching project, rather than the full configured category list.
- **Affected files:** `src/app/work/page.tsx`.
- **Dependencies:** None.
- **Estimated effort:** Low.
- **Expected impact:** Low.
- **Acceptance criteria:** "Destination Weddings" (and any other zero-match category) no longer appears as a filter chip; "Weddings" (has a real match) still appears; selecting any visible chip never returns zero results; `npx tsc --noEmit`, `npm run lint`, `npm run build` pass; verified live.

### S2-T6: Case-study copy polish (production content, not code)
- **Objective:** Fix the grammar issues ("Unstable lighting from the Natural Sunlight...", "We had to use and repositioned...") and the near-duplicate gallery caption on the one live case study.
- **Multidisciplinary evaluation:**
  - *Creative Director / Brand Strategist:* this is the single most-scrutinized page on the site — every sentence should read as intentional, especially in a section titled "Challenges/Solution," which is exactly the part a discerning client reads most closely.
  - *Marketing/Conversion:* a visible typo/grammar slip in the flagship proof-of-work quietly undercuts the trust the rest of the page works to build.
  - *Photographer/Visual Director:* no image change needed — the caption fix removes a repeated line, it doesn't touch the gallery sequencing or selection itself.
  - *Engineer:* not a code change at all — this is Sanity-hosted production content, edited the same way the earlier "Unstable lightening" typo fix was handled in this engagement: a disposable QA admin account, created and used through the real Admin Portal's native editor, then deleted and independently reverified deleted.
  - *Accessibility / SEO:* neutral, no structural change — pure copy edit.
- **Decision:** use the same disposable-QA-account pattern already established and approved in this engagement, rather than any direct API/token route.
- **Affected files:** none in the repository — production Sanity content only (`portfolioProject` document, Sampson & Sadia Wedding).
- **Dependencies:** requires the disposable QA account creation/cleanup script pattern already used earlier this engagement.
- **Estimated effort:** Low.
- **Expected impact:** Low-Medium.
- **Acceptance criteria:** the Challenges/Solution paragraphs read grammatically correct with consistent capitalization; the duplicate "Love captured naturally" / "Love captured naturally." caption pair is resolved (one made distinct, or the exact duplicate removed); verified live on production `/work/sampson-sadia-wedding`; the disposable QA account is deleted and deletion independently reverified afterward, consistent with this project's standing operational discipline.

### S2-T2: Founder photo — blocked, not skipped
- **Objective:** the review's High-priority finding that `/about/founder` has no photo of Myredlive Anim-Tetey anywhere on the page.
- **Multidisciplinary evaluation:** every lens agrees this matters (Creative Director and Brand Strategist rate it High impact — a founder-led brand's most personal page with zero photo of the founder is a real trust gap for investor/employee/journalist/partner personas; Marketing/Conversion agrees a face-behind-the-brand is a meaningful trust signal) — but there is nothing to implement without a real photo.
- **Decision:** this cannot be done without a real, supplied photograph — fabricating or sourcing a stand-in image would violate this project's "never invent facts" discipline at a much higher stakes level than a copy edit. **Explicitly held as blocked**, not silently dropped, pending you supplying a photo asset. No code or content change made for this item in Sprint 2.
- **Affected files:** `src/app/about/founder/page.tsx` (once a photo exists).
- **Dependencies:** a real photograph of the founder, supplied by you.
- **Estimated effort:** Low, once unblocked.
- **Expected impact:** High.
- **Acceptance criteria:** N/A until unblocked — tracked here so it isn't lost, not closed as done.

## Sprint 3 — Medium Priority (not started — planned only)

| # | Task | Affected files (from review) | Effort | Impact |
|---|---|---|---|---|
| S3-T1 | Add `/about/founder` to `sitemap.xml` | sitemap generator | Low | Low-Medium |
| S3-T2 | Add Content Creation and Production Services to the footer | Footer component | Low | Low-Medium |
| S3-T3 | Revisit "Talent" nav placement once the Talent directory ships | Navigation config | Low | Low |
| S3-T4 | (Resolves naturally with Sprint 2/Portfolio Population — no standalone task) Same project appearing twice on `/work` | `src/app/work/page.tsx` | N/A | Low |

## Sprint 4 — Future Enhancements (not started — planned only)

| # | Task | Effort | Impact |
|---|---|---|---|
| S4-T1 | Competitive benchmarking pass against world-class creative-agency sites | Medium | Medium |
| S4-T2 | Dedicated WCAG accessibility audit (contrast, screen-reader flow, focus order) | Medium | Medium |
| S4-T3 | Gallery lightbox, richer per-project JSON-LD, caption-authoring guidance, dedicated homepage hero visual (already tracked in `PRODUCT_ROADMAP.md`) | Medium | Medium |
| S4-T4 | Full Portfolio/Journal/Workshops content population (Phase 3) | High | High |

---

## Progress Log

- 2026-08-05 — Plan created. Sprint 1 approved; implementation beginning with S1-T1.
- 2026-08-05 — **S1-T1 complete.** Fixed self-reference in `src/app/work/[slug]/page.tsx` (`relatedProjects`), `src/app/journal/[slug]/page.tsx` (`relatedPosts`, `relatedArticles`), and `src/app/workshops/[slug]/page.tsx` (`relatedWorkshops`) — each now excludes the current item's own id. Cross-type related-content filters (a project referencing a workshop, a journal post referencing a project) were left unchanged: different content types have distinct ids, so self-reference is structurally impossible there. Verified via local dev server against the richer local fixture dataset (which has multiple items per type, unlike production's single portfolio project) — related-content sections on `/work/sample-atelier-fashion-editorial`, `/journal/sample-five-lighting-setups`, and `/workshops/sample-portrait-lighting-workshop` all correctly show *other* items, not themselves, with zero console errors. `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass. Commit `dbe6524`.
- 2026-08-05 — **S1-T2 complete.** `src/app/journal/page.tsx` and `src/app/workshops/page.tsx` now distinguish "nothing published yet" (`items.length === 0` / `allWorkshops.length === 0`) from "your filter matched nothing" (existing `filtered.length === 0` / `upcoming.length === 0` messages, unchanged). The zero-total case renders an honest "Coming Soon" block — eyebrow, headline, body copy, and a "Get in Touch" button to `/book?service=general` — matching the visual pattern already proven on Talent Management's department page (`src/app/services/[slug]/page.tsx`), rather than a bare "no results" message. No fabricated claims or dates in the copy. Verified locally: the pre-existing "no results for this filter" path still renders correctly and unchanged (`/journal?q=zzz`, `/workshops?category=zzz`, zero console errors); the new zero-total path was verified by code review and the identical, already-proven conditional pattern rather than a live local render, since local fixtures always have content in both sections (only production is currently empty). `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass.
- 2026-08-05 — **S2-T1 + S2-T7 complete.** `src/app/services/[slug]/page.tsx` now surfaces up to 3 real matching portfolio projects (`project.disciplines.includes(service.slug)`) via `PortfolioCard` in Featured Work, falling back to the existing placeholder treatment only when zero projects match — verified live: Photography shows 3 real project cards, Production Services (zero matches) still shows placeholders, Talent Management (isComingSoon) is unaffected. `src/app/work/page.tsx`'s category filter chips now only render categories with ≥1 project matching the current discipline filter — verified live against local fixtures: 6 of 12 configured categories were correctly hidden for having zero matches. Zero console errors on either page. `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass.
- 2026-08-05 — **S2-T3 complete.** Added `alternates.canonical` to all 11 remaining routes (`page.tsx`, `about/page.tsx`, `about/founder/page.tsx`, `services/page.tsx`, `services/[slug]/page.tsx`, `journal/page.tsx`, `journal/authors/[slug]/page.tsx`, `workshops/page.tsx`, `workshops/[slug]/page.tsx`, `workshops/instructors/[slug]/page.tsx`, `book/page.tsx`), matching the existing pattern from `work/page.tsx`. Verified live via DOM inspection on one static route (`/about/founder`) and two dynamic routes (`/services/photography`, `/workshops/sample-portrait-lighting-workshop`) — each resolves its own correct per-instance canonical URL, zero console errors. `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass.
- 2026-08-05 — **S2-T4 + S2-T5 complete** (implemented together — both touch `src/app/layout.tsx`). **S2-T4:** `RootLayout` is now an async Server Component fetching `contentRepository.getSiteSettings()` once and rendering one shared `Organization` + `WebSite` JSON-LD block, sourced entirely from real CMS data (siteName/logoUrl/contactEmail/socialLinks) — `sameAs` omitted when `socialLinks` is empty rather than guessed at. **S2-T5:** built `src/app/opengraph-image.tsx` + `twitter-image.tsx` (Next's file-convention, via `next/og`'s `ImageResponse`) compositing the real gold logo on the real navy brand gradient at 1200×630, replacing the raw undersized logo fallback; removed the static `images` array from the root's metadata so this is the single source of the default. **Bug found and fixed during verification:** confirmed live that a page's own `openGraph`/`twitter` object fully replaces the root's — Next does not merge in the root's default image for just a missing `images` field, so any page with its own openGraph object but no image would show *no* share image at all rather than falling back. This affected `work/[slug]/page.tsx` (projects with no hero image yet), `journal/[slug]/page.tsx` (both the journalPost and pulseArticle branches, which had also been missing `title`/`description`/`url`/`type` entirely — a separate, real pre-existing gap, fixed alongside), and `legal/[slug]/page.tsx`'s enterprise-document branch. All three now explicitly fall back to `${siteUrl}/opengraph-image` when no real image exists, and journal's two branches now set complete, explicit openGraph/twitter blocks. Verified live across every affected page type: homepage (inherits root default), a real Photography department page (inherits), a portfolio project with no hero image (explicit fallback), a journal post (explicit fallback, previously-missing og:title/og:url now present), `/legal/privacy` (explicit fallback), and the case-study pattern generally (a page with a real image would still show its own — confirmed via code path, not directly testable locally since local fixtures have no real hero images). `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass; zero console errors on every page checked.
- 2026-08-05 — **Sprint 1 Final Verification.** Full 6-point audit performed before opening Sprint 2 (see "Sprint 1 Final Verification" under Sprint 1 above for the complete write-up). One real finding: the S1-T2 empty-state treatment didn't match `ENGINEERING_GUIDE.md` §5's documented "plain, honest sentence" standard for empty states — the Talent Management precedent it was modeled on turned out to be CMS-authored content, not a comparable client-side empty-state fallback. Corrected in place: both empty states simplified to a plain sentence with an inline text link, matching the existing link convention used on `/about`; removed the now-unused `Button` import from both files. Re-ran `npx tsc --noEmit`, `npm run lint`, `npm run build` (all clean) and re-verified both non-regression paths live with zero console errors. No other duplicate logic, documentation drift, or simplification opportunities found. **Sprint 1 formally closed and tagged `sprint-1-complete`.**
