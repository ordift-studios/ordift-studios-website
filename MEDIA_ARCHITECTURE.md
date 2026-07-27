# Ordift Studios — Media Architecture

**Established:** 2026-07-27, when Portfolio/Journal/Workshops/Founder moved from placeholder boxes to real Sanity-driven media rendering.

**Purpose:** document the reusable media component library so every future feature that touches an image, gallery, or video builds on it instead of reinventing it — and so it's clear, in one place, why each design decision was made.

---

## 1. Why this exists

The instruction that produced this system was explicit: don't just swap placeholder `<div>`s for `<img>` tags. Build one reusable architecture that gives every consumer — Portfolio, Journal, Workshops, Founder, and every future page — responsive loading, lazy loading, optimized sizes, automatic aspect-ratio handling, a CDN-swappable resize path, graceful loading/empty states, accessibility, and SEO-friendly metadata, for free, just by using the components.

## 2. The components

All in `src/components/media/`:

| Component | Purpose | Used by |
|---|---|---|
| `ResponsiveImage.tsx` | The one component every real image on the site should render through. Wraps `next/image` with automatic aspect-ratio sizing, LQIP blur-up, and a CDN-swappable loader. | Everything below, directly or via `MediaAsset`/`Gallery`/`Avatar` |
| `MediaAsset.tsx` | Polymorphic renderer for a CMS `MediaAsset` field (`type: "image" \| "video" \| "embed"`) — picks the right underlying element so call sites never branch on type themselves. | Portfolio hero/videos, Journal hero/video articles |
| `Gallery.tsx` | Reusable grid of `GalleryImage[]`, configurable column count and aspect ratio. Renders nothing (not an empty grid) when there are no images. | Portfolio Final Gallery + Behind the Scenes, Workshop Gallery |
| `BeforeAfterGallery.tsx` | Stacked before/after image pairs. | Portfolio retouching comparisons |
| `Avatar.tsx` | Small circular portrait with an initials fallback when no photo exists. | Journal author byline + author profile page, Workshop instructor card + instructor profile page |
| `MediaPlaceholder.tsx` | The premium branded empty-state (LC1 Phase 2, 2026-07-27, see `LAUNCH_CANDIDATE_1.md`) — a radial navy/off-white gradient, the same subtly-shimmering gold glow as the Coming Soon holding page, and the Ordift monogram, with an optional caption. No stock imagery, ever. | `ResponsiveImage`/`MediaAsset`'s own empty state (see §4); Home hero, `DepartmentCard`, and the department/service page template, which have no CMS field to be "empty" from — they just have no media capability yet |

## 3. The CDN-swap guarantee

`src/lib/media/sanityLoader.ts` is the only place that knows how to ask the current image host for a specific size. It's wired in as `next.config.ts`'s `images.loaderFile` (global, not a per-instance prop — see §5 for why), so swapping image hosts later (Cloudinary, imgix, a self-hosted pipeline) means replacing this one function, not touching any page or component that renders an image.

Resizing happens at Sanity's CDN (`?w=`, `?q=`, `?auto=format`, `?fit=max`) rather than re-processing through a second optimizer — no redundant resize hop, and Sanity negotiates WebP/AVIF per-browser automatically. The loader passes local static asset paths (e.g. `Logo.tsx`'s `/brand/*.png`) through unchanged, since it now runs for every `next/image` on the site, not just Sanity-hosted ones.

## 4. Aspect ratio, loading states, and empty states — three different things

These are commonly conflated; the architecture treats them as three separate concerns:

1. **Automatic aspect ratio.** `ResponsiveImage` sizes its wrapper from the image's own Sanity-reported `width`/`height` metadata (via the `mediaAssetFragment`/`galleryImageFragment` GROQ fragments in `groqFragments.ts`) unless an explicit `aspectRatio` prop overrides it — so layout never shifts once the real image loads.
2. **Loading state** (the image is on its way over the network). Sanity's generated LQIP (a base64 blur placeholder, also pulled via the GROQ fragments) drives `next/image`'s native `placeholder="blur"` — zero extra client JS, just a soft preview that sharpens in place.
3. **Empty state** (the CMS field exists but no asset has been uploaded yet — a *content* gap, not a loading state). `ResponsiveImage` and `MediaAsset` render `MediaPlaceholder` (`role="img"`, `aria-label` from `alt`) instead of an invalid empty `src` — this is what makes the `[SAMPLE]` placeholder content across the site (which genuinely has no uploaded photos yet) render as an intentional brand moment rather than a broken-image icon. `Avatar` is the one exception, by design: it renders its own initials-circle instead, a more appropriate treatment for a missing *person* photo specifically than a generic brand mark. (Before 2026-07-27, all four rendered a flat `bg-ordift-navy-900/10` tint — see `LAUNCH_CANDIDATE_1.md`'s before/after report for that change.)

`MediaAsset.url` and `GalleryImage.url` (`src/lib/content/types.ts`) are typed `string | null` specifically because case 3 is a real, expected runtime state, not an edge case — the GROQ fragments' `select()`/`coalesce()` genuinely return `null` when an asset is unset.

## 5. One Next.js-version-specific detail worth knowing

This project runs a Next.js version where a custom `next/image` loader function must cross a Client Component boundary to be usable (see `node_modules/next/dist/docs/.../images.md#loaderfile` — this differs from older Next.js conventions, per `AGENTS.md`'s standing instruction to check the local docs before assuming training-data behavior). A per-instance `loader` prop passed from a Server Component (which `ResponsiveImage` is, and needs to remain, since it's used throughout server-rendered pages) fails at build time. The fix: configure the loader globally via `next.config.ts`'s `images.loaderFile`, with `"use client"` at the top of `sanityLoader.ts` itself — not as a prop on every `<Image>` call.

## 6. Accessibility & SEO

Every component requires `alt` text — there's no path to render an image without one. Portfolio and Journal detail pages fall back to the project/post's own hero image for Open Graph metadata when no dedicated `seo.ogImage` is set, so social shares always have a real image rather than none.

## 7. CMS content model — the reusable pattern

`portfolioProject` (`src/sanity/schemaTypes/documents/portfolioProject.ts`) is the reference shape for any future "showcase" content type: cover image (`heroMedia`), multiple gallery images (`gallery`), optional video (`videos`), client, service category (`disciplines`/`categories`), location, date (`year`), tags, featured toggle, and SEO metadata. This is deliberately the same shape that should be reused — not reinvented — for future disciplines and formats: product shoots, weddings, fashion editorials, commercial campaigns, events, and behind-the-scenes content don't need new schema patterns, just new `portfolioCategory`/`portfolioDiscipline` entries against the existing model.

## 8. Version 1.1+ reusability — built with this in mind

None of the components above are Portfolio/Journal/Workshops-specific in implementation — they operate on the CMS-agnostic `MediaAsset`/`GalleryImage` types, not on any one content type. That's what makes them the direct foundation for later platform surfaces without refactoring:

- **Staff Portal / Employee Profiles** (`PRODUCT_ROADMAP.md` Version 1.1/1.2) — `Avatar` is already the exact shape an internal staff profile photo needs (circular, initials fallback for the many staff who won't have a photo on day one).
- **Talent Management** (Version 2.0) — public talent portfolios are a direct application of `Gallery` (multiple images) plus `MediaAsset` (portfolio videos/reels) against a new `talentProfile` schema shaped like §7's pattern; `Avatar` covers talent headshots.
- **Vendor Directory** (not yet a named roadmap version, but implied by the existing `vendor` role in v1.0's IAM) — same `Avatar` (contact/logo) + `Gallery` (past work samples) pattern as Talent, once a directory is actually built.
- **Client Galleries** — the existing Client Portal Deliverables feature (v1.0, `src/app/portal/client/projects/[kind]/[id]/deliverables`) is a natural future candidate to migrate onto `Gallery`/`MediaAsset` instead of its current rendering, for the same responsive/lazy/empty-state benefits, whenever that page is next touched.
- **Ordift Pulse** (Version 4.0) — every content card in the curated feed (article thumbnails, Featured Creator photos, gear-release images) is the same `MediaAsset`/`ResponsiveImage` shape already proven here.

No new media component is anticipated to be needed for any of the above — only new Sanity schema types following §7's pattern, and new pages composing the existing components.

---

*Companion documents: [MEDIA_UPLOAD_LIST.md](MEDIA_UPLOAD_LIST.md) (what to upload and where), [LAUNCH_CANDIDATE_1.md](LAUNCH_CANDIDATE_1.md) (the `MediaPlaceholder` before/after and where it's deployed), [ARCHITECTURE.md](ARCHITECTURE.md) (broader architectural decision record), [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) (where the reusability points in §8 above are tracked).*
