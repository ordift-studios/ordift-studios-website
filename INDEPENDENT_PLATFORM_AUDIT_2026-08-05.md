# Independent Platform Audit — 2026-08-05

**Scope:** the full Ordift Studios platform, at commit `7fa1e6c` (post-Sprint-2, post-closure-audit). Commissioned as a fresh, independent pass — not a re-statement of Sprint 2's own closure audit — covering every area listed in your request, plus a self-challenge review from an external senior-engineer perspective.

**Method:** four parallel research passes (architecture/routing/middleware/CMS/build; SEO/metadata/structured-data sitewide; accessibility/forms/error-handling; Auth/Admin/Booking/Portfolio/Legal Suite re-verification) plus a fifth on performance/image-optimization/caching/security, each reading actual source with file:line citations — not inference from prior reports. Findings that conflicted between passes were independently re-checked against the source file directly before being included here (one such conflict, on sitemap coverage, is resolved in §SEO below). All mechanical checks (`tsc`, `lint`, `build`) were re-run fresh at the current commit, not carried over from Sprint 2's own audit. Live verification used the local dev server against local fixture data — noted explicitly wherever that matters.

**How to read severity:** 🔴 Critical (launch-blocking or data-integrity risk) · 🟠 High (should fix before/soon after launch) · 🟡 Medium (real, worth scheduling) · 🟢 Low (polish/hardening) · ⚪ Info (fact worth recording, not a defect). Every checklist category you asked for is listed below, even where the finding is "clean" — nothing was silently skipped.

---

## Architecture

**Status: 1 finding.**

- ⚪ **Route structure is consistent.** Every public content department (`journal`, `work`, `workshops`, `services`, `legal`) uses a single `[slug]` dynamic route, not per-item static folders. No orphaned or duplicated routes found in `src/app` (117 files).
- 🟡 **A-1 — No ISR or on-demand revalidation exists anywhere.** `grep -rn "revalidate"` across `src/app` returns zero matches for `export const revalidate` or `revalidateTag`/`updateTag` on any public route; only `revalidatePath` calls inside admin/portal Server Actions (scoped to `/admin/*`/`/portal/*`). There is no Sanity webhook route under `src/app/api/`. **Consequence:** a content editor publishing a change in Sanity Studio to a Journal post, Workshop, Portfolio project, Service, or Legal document will not see it live on the public site until the next full deployment. This is internally consistent (every content-detail route behaves identically — no cross-route inconsistency) but is a real operational gap for a CMS-driven site approaching launch, where non-engineering staff will expect Studio edits to go live without needing an engineer to redeploy.

## Routing

- ⚪ Confirmed clean under Architecture above — no separate findings.

## Middleware

**Status: 1 finding.**

- 🟢 **A-2 — `HOLDING_PAGE_ALLOWLIST` matches by unanchored prefix, not path segment.** `src/proxy.ts:76,79`:
  ```ts
  const HOLDING_PAGE_ALLOWLIST = ["/coming-soon", "/studio", "/admin", "/portal", "/api", "/robots.txt", "/sitemap.xml"];
  ...!HOLDING_PAGE_ALLOWLIST.some((path) => request.nextUrl.pathname.startsWith(path))
  ```
  `startsWith` has no trailing-boundary check. A hypothetical future top-level route sharing a prefix with an allowlisted entry (e.g. `/apiary`, `/administrators`, `/studios`) would silently bypass the holding-page gate rather than being caught by it. No such route exists today, so there is no live impact — this is a latent fragility, not a current bug. Trivial fix: match against `path + "/"` or an exact-segment check.
- ⚪ Everything else in `src/proxy.ts` checked clean: staging Basic Auth fails **closed** when credentials are unset (503) with `localhost`/`127.0.0.1`/`::1` correctly exempted; `www`→apex redirect is exact-hostname-matched, not prefix-based; the matcher regex correctly excludes static assets and `_next/static`/`_next/image`.

## Navigation

- ⚪ **Clean.** Nav is CMS-driven (`NavBar.tsx` calls `contentRepository.getNavigation()`), so live production content can't be verified statically, but the local fixture resolves every link to a real route with no dead ends. `/about/founder`, `journal/authors/[slug]`, and `workshops/instructors/[slug]` are reachable via in-content links (not nav) rather than orphaned — expected pattern for profile-style pages.

## CMS / Sanity Schemas

**Status: 1 finding, High severity.**

- 🟠 **A-3 — `Workshop` TypeScript type is missing the `seo` field that Sanity actually defines and fetches.** `src/lib/content/types.ts:101-130`'s `Workshop` type has no `seo` field. But `src/sanity/schemaTypes/documents/workshop.ts:117` defines one in the Studio schema, and `src/lib/content/sanity/queries.ts:36`'s `workshopFragment` explicitly fetches `${seoFragment("seo")}`. This is the one content type, of the three inspected in depth (`PortfolioProject`, `JournalPost`, `Workshop`), where schema/adapter/type disagree — every other type with an `seo` field has it consistently everywhere. **Consequence:** a content editor filling in the Workshop SEO panel in Studio has that data fetched over the wire on every request and then silently discarded — `workshops/[slug]/page.tsx:31-50`'s `generateMetadata` hand-builds title/description from `shortDescription` instead of using the editor's actual input. This directly undercuts the same "editorial control over SEO metadata" goal Sprint 2 spent most of its effort advancing for every other content type.
- ⚪ `PortfolioProject` and `JournalPost` field lists match their GROQ fragments 1:1 — no drift.

## Dynamic Routes / Static Routes

- ⚪ **Clean.** Every public `[slug]` route has `generateStaticParams`, each sourcing params from the same repository method the page uses at render time — no under- or over-coverage. `studio/[[...tool]]` correctly opts out via `export const dynamic = "force-dynamic"`. `/work`, `/journal`, `/workshops`, `/book` render dynamically (ƒ in build output) because each reads `searchParams` for filter/query state — this is an expected consequence of the filter UI, not a defect, and was worth tracing since it wasn't obvious from route naming alone.

## SEO / Metadata / Canonicals / Open Graph / Twitter Cards

**Status: 3 findings. One inter-agent conflict resolved below.**

- ⚪ Spot-checked Sprint 2's claimed-fixed pages (`about/page.tsx`, `services/[slug]/page.tsx`, `journal/[slug]/page.tsx`, `legal/[slug]/page.tsx`) — canonical/openGraph/twitter are genuinely present and correct on every one checked.
- 🟢 **A-4 — `src/app/studio/[[...tool]]/page.tsx` has no `metadata` export at all**, not even `robots: { index: false }`. Every other internal surface (all 18 `admin/**` pages, all `portal/**` auth pages, all 3 `style-preview/**` pages, `coming-soon`) sets `robots: { index: false, follow: false }` explicitly as defense-in-depth on top of `robots.txt`'s disallow list. Studio is the one exception — it relies solely on `robots.ts`'s disallow. Disallow-only is weaker than an explicit noindex: a disallowed URL discovered via an inbound link can still appear in search results as "indexed, though blocked by robots.txt," since Google never crawls the page to see a noindex tag it doesn't have.
- 🟡 **A-5 — Sitemap gaps: `/about/founder` and `journal/authors/[slug]` are missing.** `src/app/sitemap.ts:11`'s `STATIC_ROUTES` doesn't include `/about/founder`, and `contentRepository.getAuthors()` is never called in `sitemap.ts` despite existing (`src/lib/content/repository.ts:58`) — so no `journal/authors/${slug}` entries are generated. **Resolved conflict:** one research pass initially also flagged `workshops/instructors/[slug]` as missing; I independently re-read `sitemap.ts` directly (lines 38–41) and confirmed instructor pages **are** correctly included via `instructors.map(...)` — that claim was wrong and is not carried forward. Both real gaps (`/about/founder`, journal authors) are already-indexable, non-disallowed, real pages simply absent from sitemap discovery.
- 🟡 **A-6 — Two content-detail page types have no structured data at all.** Confirmed via `grep -c` for `application/ld+json`: `journal/[slug]/page.tsx` already has `Article`/`VideoObject` JSON-LD (both branches, lines ~108–115 and ~290–297) — this is *not* a gap, contrary to one initial framing. The genuine gaps are **`workshops/[slug]/page.tsx`** (zero JSON-LD, despite being a bookable, date/price-bearing page with a live registration form — an `Event` or `Course` type is directly applicable and is the single highest-value gap to close) and **`services/[slug]/page.tsx`** (zero JSON-LD; a `Service` type would fit). Lower priority: `workshops/instructors/[slug]` / `journal/authors/[slug]` have none (`Person`/`ProfilePage` would fit).
- ⚪ `metadataBase` correctly resolves relative OG/Twitter URLs; spot-checked titles across 5 listing pages are all unique, no duplication.

## Structured Data

- Covered above under SEO — see A-6.

## Accessibility

**Status: 3 findings.**

- ⚪ Heading hierarchy is clean across every page type spot-checked (home, about, work/[slug], services/[slug], journal/[slug]) — exactly one `<h1>` per render path, no skipped levels.
- 🟡 **A-7 — `DeliverablesGallery.tsx:16` sets `alt=""` on a meaningful, per-item client deliverable thumbnail**, not a decorative image. `ENGINEERING_GUIDE.md` §20: alt text is "never empty" for real content. This is a client-facing portal surface (a client viewing their own project deliverables), not admin-only, so it directly affects a real user with a screen reader trying to distinguish between their own deliverable files.
- 🟢 **A-8 — `prefers-reduced-motion` is not respected by hover/transition animations**, only by the two documented shimmer effects (`MediaPlaceholder.tsx:56`, `coming-soon/page.tsx:40`). `Button.tsx:19` (`hover:-translate-y-0.5` on every button/link site-wide), `DepartmentCard.tsx:18`, and `ProfileQuickCard.tsx`'s slide-in panel animation all have no `motion-reduce` variant, and no global `@media (prefers-reduced-motion: reduce)` fallback exists in `globals.css`. `ENGINEERING_GUIDE.md` §20 states this applies "no exceptions" — this is a real, if minor, gap against the project's own written standard.
- 🟢 **A-9 — Minor, admin-only:** `ProfileQuickCard.tsx:83`'s avatar has `alt=""` with the name as adjacent text — likely intentional redundancy-avoidance, but inconsistent with the site's own `Avatar.tsx` component convention (always `alt={name}`). Low severity, internal-only surface.

## Lighthouse Readiness

- ⚪ **Clean.** No render-blocking `<script>` tags anywhere in `src/app` — every `<script>` found is a `type="application/ld+json"` structured-data block. Fonts load via `next/font/google` (self-hosted, no external `<link>`), which is optimal. `public/` directory's largest file is 316 KB — nothing over 1 MB. A real Lighthouse run (not static analysis) was not performed in this pass — see Known Limitations in the companion Executive Report; this section reflects Lighthouse-*relevant signals*, not an actual score.

## Mobile / Tablet / Desktop Responsiveness

- ⚪ **Spot-checked live, clean.** Homepage, a Photography department page, and a portfolio case study checked at 375px (mobile) and 1280px (desktop) on the local dev server: zero horizontal overflow (`scrollWidth === clientWidth` confirmed programmatically), single `<h1>` per page, zero console errors at either width. A full page-by-page responsive sweep (every route × 3 breakpoints) was not exhaustively performed in this pass — the spot-check covers Sprint 2's own touched pages plus the homepage; a broader sweep is a reasonable Sprint 3 validation step rather than something this audit needed to re-derive from scratch, since `FINAL_LAUNCH_CERTIFICATION.md` already documents an earlier full cross-device pass.

## Performance

**Status: covered under Caching (A-1) and Image Optimization below — no additional standalone findings.**

## Error Handling

**Status: 1 finding, notable.**

- 🟠 **A-10 — No `error.tsx`, `not-found.tsx`, or `global-error.tsx` exists anywhere in the repository**, including at the app root. Meanwhile there are 18+ `notFound()` call sites across dynamic routes (`work/[slug]`, `services/[slug]`, `journal/[slug]`, `workshops/[slug]`, `legal/[slug]`, plus several admin/portal routes). Every one of these — and any unhandled thrown error anywhere in the tree — currently falls through to Next.js's bare, unbranded default 404/error page. `ENGINEERING_GUIDE.md` §5/§20 don't explicitly mandate these files (the guide is silent on them, not opposed), so this isn't a written-standard violation the way the §19 gap was — but it is a real, unaddressed gap on every single public dynamic-slug route, and it's the single most visible "this doesn't feel like a finished product" moment a visitor can trivially trigger (mistype a portfolio slug, click a stale link). Given the project's explicit goal of an "enterprise-grade... professionally engineered" launch, this is worth prioritizing.

## Loading States

- ⚪ **Clean, and correctly so.** Zero `loading.tsx` files and zero `Suspense` usage anywhere — this is consistent with `ENGINEERING_GUIDE.md` §5's explicit, deliberate statement that this codebase uses local `useState`-based submitting states instead of file-based loading UI. Not a gap; a documented design choice, correctly followed.

## Empty States

- ⚪ **Clean — the cleanest category audited.** All ~35 "no results / coming soon / zero content" instances found are single, plain, honest sentences, matching `ENGINEERING_GUIDE.md` §5's standard exactly. No elaborate marketing-style blocks, no fabricated content anywhere.

## Forms

- ⚪ **Clean.** Both the Contact/Book form and Workshop Registration form have real client-side Zod validation, real server-side `safeParse` validation returning typed `422` field errors, inline error display with `role="alert"`/`aria-invalid`/`aria-describedby`, and correct `submitting`-state button disabling with a label swap during submission — matching `ENGINEERING_GUIDE.md` §5's documented reference pattern.

## Authentication

- ⚪ **Clean, confirmed against current code (not just prior docs).** Supabase Auth used correctly throughout — server actions for every mutation, generic (non-enumerating) error messages on login/forgot-password, self-signup grants only the `client` role, and the password-reset flow correctly handles Supabase's implicit-fragment recovery tokens client-side (necessarily so — the fragment is invisible server-side) while still signing out the recovery session before redirecting. All four auth flows call server-side Turnstile verification.

## Admin Portal

- ⚪ **Clean, confirmed server-side, not client-hidden.** `src/app/admin/layout.tsx` is a server component that calls `getCurrentUser()`/`isStaffOrAdmin()` and redirects before any child renders. `HOLDING_PAGE_ALLOWLIST` including `/admin` only affects the holding-page rewrite, not the auth middleware (`updateSession()`), which runs unconditionally on every request regardless of the allowlist — independently traced through `src/proxy.ts` to confirm no bypass exists.

## Booking Workflow

- ⚪ **Clean, confirmed live-current.** Rate limiting → honeypot → idempotency check → server-verified Turnstile → Supabase primary write → best-effort Sheets sync + email, in that order, in `src/app/api/enquiry/route.ts`. `PRODUCTION_HARDENING_REPORT.md`'s "Turnstile still not enabled" note is confirmed stale (that doc predates the Turnstile rollout by several days) rather than a current gap — `FINAL_LAUNCH_CERTIFICATION.md` (newer) already correctly reflects the current, working state.
- 🟢 **A-11 — Turnstile verification fails open, not closed, if its secret key is ever unset:** `src/lib/turnstile.ts:34-35`, `if (!secretKey) return true;`. This is documented as intentional (build works before credentials exist), and **I independently confirmed via `vercel env ls production` that both `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are currently set (encrypted) in the production environment** — so this is not a live issue today. It's a defensive-design asymmetry worth noting: the staging Basic Auth gate fails *closed* on missing credentials (503), while Turnstile fails *open* (silently accepts everything) — inconsistent failure philosophy for two comparable security gates, worth a low-effort fix (fail closed, or alert) as hardening rather than as a launch blocker.

## Portfolio Workflow

- ⚪ **Clean, confirmed server-enforced, not UI-hidden.** `PORTFOLIO_CAPABILITIES` matrix correctly scopes `staff` (edit/submit only, no publish/feature/archive/delete) and `contractor` (upload/edit-own/submit only) narrower than `admin`/`super_admin`. `transitionPortfolioProjectAction` calls `canTransition()` server-side and throws on an unauthorized transition. The Publish Readiness Checklist is re-validated server-side inside the transition action itself (not just shown in the wizard), specifically so a request crafted outside the UI can't skip it.

## Legal Suite

**Status: 1 finding requiring your attention — a documentation-staleness issue, not a code defect.**

- 🟡 **A-12 — `FINAL_LAUNCH_CERTIFICATION.md` (dated 2026-08-02) is now stale regarding legal page status, and one env var it describes is now dead code.** That certification states the four public legal pages "still hold the earlier draft text... nothing has been published." Current code (`src/lib/legal/documents/os-lgl-00{1,2,3,4}-*.ts`) has all four hardcoded `status: "approved"`, committed 2026-08-04 — **two days after** that certification, as the Legal Suite v1.0 launch already tracked in project memory as an intentional, approved 2026-08-04 publish (commit `2f914c7`). **This is not a Sprint 2 regression or an accidental drift — it's expected progress that postdates a now-outdated snapshot document.** What *is* a real, standalone finding: `LEGAL_PAGES_APPROVED` (`src/lib/shared/env.ts:25-27`) is no longer consumed by the legal page's own robots/indexing logic at all (`legal/[slug]/page.tsx:50` now drives indexing purely from each document's hardcoded `status` field) — the only remaining reference in `src/` is a read-only status pill on the admin settings page. The env var's surrounding code comments still describe it as gating publication, which is now misleading. Low-effort fix: either wire it back in as a genuine kill-switch, or remove the stale comments/references so the code doesn't claim a control that no longer functions.

## Workshop Pages / Journal Pages / Talent Pages / Services Pages

- ⚪ **Clean, confirmed content-driven, not hardcoded.** All four page families call `contentRepository.getX()` — none hardcode content inline. Talent Management's `isComingSoon` flag correctly suppresses the Featured Work section and swaps the section label to "Talent Categories," driven by real content data, not a broken directory link. (Workshop-specific SEO gap is covered separately as A-3 above, under CMS.)

## Image Optimization

**Status: 1 finding, worth consolidating.**

- 🟡 **A-13 — The "2 known exceptions" list for raw `<img>` usage undercounts the actual total by at least 3.** Previously documented exceptions: `PortfolioProjectForm.tsx:1036,1321`. Newly found in this pass, all rendering real (not blob-preview) Sanity-hosted URLs, all violating `ENGINEERING_GUIDE.md` §18's "every real image renders through `ResponsiveImage`, never a bare `<img>`": `PortfolioProjectForm.tsx:231,1021` (two more instances in the same admin file), `ProfileQuickCard.tsx:81` (real avatar URL), and `DeliverablesGallery.tsx:16` (client-facing portal deliverable thumbnails — the highest-severity of the group, since it's the one visible to clients, not just staff, and gets no lazy-loading/responsive-`sizes`/CLS-protection as a result). `sanityLoader.ts` itself is correctly wired globally via `next.config.ts`.

## Caching

- Covered above under Architecture — see A-1.

## Build Output

- ⚪ **Clean.** Fresh `npm run build` at current HEAD: exit 0, all 79 routes generated, both new OG-image routes statically optimized. No unexpected route-type markers found beyond the already-explained `searchParams`-driven dynamic listing pages.

## Console

- ⚪ **Clean on every page checked.** Zero console errors on homepage, `/work/sample-atelier-fashion-editorial`, `/services/photography`, `/legal/privacy` — checked fresh via the local dev server this session, both at desktop and mobile viewport widths.

## TypeScript / ESLint / Production Build

- ⚪ **All three clean, re-run fresh at the current commit (not carried over from Sprint 2's own audit):** `npx tsc --noEmit` — 0 errors. `npm run lint` — 0 errors, 2 pre-existing unrelated warnings. `npm run build` — exit 0.

## Deployment Readiness

**Status: 1 finding — the most operationally significant item in this entire audit.**

- 🔴 **A-14 — All of Sprint 1 and Sprint 2 (7 commits, tags `sprint-1-complete` and `sprint-2-complete`) exist only on the local `main` branch. Nothing has been pushed to `origin/main`, and nothing has been deployed.** `git status -sb` shows `## main...origin/main [ahead 6]`; `git log origin/main..HEAD` lists all 6 Sprint-2-era commits as unpushed (Sprint 1's 2 commits are further back but equally unpushed — `origin/main` predates all of this work). This is not itself an error — you did not ask for a push, and "keep production behind the holding page throughout Sprint 2" was correctly honored regardless — but it means **every finding, fix, and verification in this report and its companion Executive Report describes code that exists only on this machine.** No amount of local `tsc`/`lint`/`build`/dev-server verification substitutes for confirming the same build succeeds on Vercel's actual build environment. I have not pushed or deployed anything — that is a deliberate action requiring your explicit go-ahead, consistent with this session's standing instruction to wait for approval before further changes.

---

## Self-Challenge: Senior Engineer Review

Reviewing Sprint 2 and this audit as an external release reviewer, specifically hunting for what a friendlier first pass might have missed:

**Assumptions surfaced and checked, not just asserted:**
- I assumed Sprint 2's own closure audit was complete and correct going into this pass rather than re-trusting it blindly — it held up under fresh, independent re-derivation (tsc/lint/build re-run clean, the §19 fix spot-checked as genuinely present). One inter-agent factual conflict (sitemap/workshops-instructors coverage) was caught and resolved against source rather than reported as-is from a single pass — see A-5.
- I did not assume the `PRODUCTION_HARDENING_REPORT.md` "Turnstile not enabled" note meant Turnstile is broken today — traced it to a doc-timing issue and independently confirmed via `vercel env ls` that the real production environment has both keys set. Reporting a stale doc's claim as a live finding without checking the actual environment would have been a false alarm.
- I did not assume the Legal Suite "drift" was a mistake — cross-referenced against project memory of an intentional 2026-08-04 publish before writing it up, to avoid alarming you about something that was a deliberate, already-known decision.

**Hidden edge cases found:** the `/work` category-filter chip-hiding behavior (documented in Sprint 2's own audit, reconfirmed here) — a category selected before switching disciplines can silently stop appearing as a chip if it has zero matches under the new discipline, while the underlying filter state still works. Minor, already disclosed, not re-litigated as new.

**Duplicated logic:** the local `SITE_URL` const vs. shared `siteUrl()` helper split (11+ files use one pattern, 3 use the other) was investigated in Sprint 2's own closure audit and found to be a pre-existing, consistent convention split (module-scope static metadata vs. async `generateMetadata()`), not new duplication — not re-flagged here as a fresh finding since nothing changed since that determination.

**Unnecessary complexity:** none found that rises above informational. The codebase is, if anything, notably consistent about *not* over-abstracting — the `openGraph`/`twitter` object shape repeated 13× (already logged as `S4-T6`) is the one place a shared helper would clearly pay for itself; nothing else in Sprint 2's footprint shows premature or excessive abstraction.

**Inconsistencies:** the Turnstile fail-open vs. staging-auth fail-closed asymmetry (A-11) is the clearest example — two conceptually similar "is this gate configured?" checks resolve the missing-config case in opposite directions, and only one of them is intentional-by-design in the code's own comments.

**Simplification opportunities:** `S4-T6` (metadata-builder helper) remains the one identified and already logged. No others found that would reduce real complexity without adding a new abstraction in its place.

**Future maintenance risk:** A-1 (no ISR/webhook) is the standout — as more content types and more editors use Sanity Studio, "nothing goes live without an engineer redeploying" will increasingly read as a bug to non-engineering stakeholders even though it's currently a deliberate (if undocumented-as-deliberate) architectural state. A-2 (prefix-matching allowlist) is a landmine that costs nothing today and could cost a confusing debugging session later if a colliding route is ever added without anyone remembering this constraint exists.

**Technical debt:** A-3 (Workshop `seo` field) is the most concrete piece of debt found — it's not hypothetical, it's actively discarding real editor input right now. A-13 (raw `<img>` undercounted) is smaller but same category: a written standard the code has already quietly drifted from in 3 additional places since it was last audited.

**Scalability concerns:** none rise to a structural level at current scope (one real portfolio project, a handful of workshops/journal posts). The lack of ISR (A-1) is the item most likely to become a genuine scalability/operability concern as content volume grows — full-rebuild-per-content-change doesn't stay cheap indefinitely, though it is entirely adequate today.

**Anything that should have been in Sprint 2 and wasn't:** the §19 openGraph/twitter gap was already caught by Sprint 2's own closure audit. The one item that arguably *should* have been caught during Sprint 2 specifically (since Sprint 2 was explicitly an SEO-focused sprint) is **A-3, the Workshop `seo` field gap** — it sits squarely in Sprint 2's own stated domain (metadata quality, editorial control over SEO) and was missed because Sprint 2's scope was defined by `PRODUCT_LAUNCH_READINESS_REVIEW.md`'s findings, which didn't happen to catch this specific type/schema mismatch. It is not a Sprint 2 regression — it's a pre-existing gap that a sharper Sprint 2 could plausibly have found. Recommending it as Sprint 3's highest-priority SEO item accordingly.
