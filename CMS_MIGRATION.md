# CMS Migration Path — Local Data → Sanity (or any other CMS)

Status (updated 2026-07-24): **live and connected, including every
editable site-wide component.** `contentRepository` points at
`sanityContentRepository`, reading from the Ordift-owned Sanity project
(`ixbvr1n8`, organization "Ordift Studios"). All 21 wired types are fully
connected end-to-end: the original 12 (Workshops, Portfolio, Stories
ecosystems) plus 9 site-wide singleton/repeatable types added in Version
1.2.6 (Homepage, About, Founder, Navigation, Footer, Site Settings,
Services ×7, Legal Pages ×4). Two schema-only types remain intentionally
unpopulated (Pricing, Landing Pages — see "Pricing and Landing Pages"
below) since no real content exists for either. `src/lib/content/local/*`
is kept in the repo as an offline-dev fallback (not yet deleted — see
"What's next" at the end).

This documents exactly how the swap works — that guarantee is the entire
reason `src/lib/content/` exists as a separate layer instead of pages
importing workshop/instructor data directly.

## Why this layer exists

Per your explicit instruction (approved 2026-07-23): the application must
not be tightly coupled to Sanity or any specific CMS. Every page, the
registration API route, and every component reads content through one
interface — `ContentRepository` in
[`src/lib/content/repository.ts`](src/lib/content/repository.ts) — and
never imports `./local/*` directly. `src/lib/content/index.ts` exports a
single `contentRepository` constant that currently points at
`localContentRepository`. The day a real CMS is connected, that file
changes from:

```ts
export const contentRepository: ContentRepository = localContentRepository;
```

to:

```ts
export const contentRepository: ContentRepository = sanityContentRepository;
```

— a one-line change, in one file. Nothing else in the codebase changes.

## What "local" means today

- **Domain types** — [`src/lib/content/types.ts`](src/lib/content/types.ts) — are plain TypeScript, with no CMS-specific fields, IDs, or query shapes. This is intentionally the shape a future CMS schema should be modeled *to match*, not the other way around — the domain model is CMS-agnostic by design, so it doesn't need to change when the backing CMS does.
- **Sample data** — [`src/lib/content/local/data.ts`](src/lib/content/local/data.ts) — a set of clearly `[SAMPLE]`-labeled records (workshops, instructors, categories, venues, testimonials, sponsors) covering every field in the domain model, so the full Workshop Platform UI can be built and reviewed before any CMS project exists.
- **Local adapter** — [`src/lib/content/local/repository.ts`](src/lib/content/local/repository.ts) — implements `ContentRepository` by reading the sample arrays. Every method is `async` even though nothing awaits I/O, specifically so it looks identical to a real network-backed adapter from the caller's point of view.

## How a new CMS adapter gets added (the recipe `sanityContentRepository` follows)

1. Create a new file, e.g. `src/lib/content/sanity/repository.ts`.
2. Implement `ContentRepository` (same interface, same method names, same return types) by querying the CMS and **mapping its response onto the existing domain types** in `types.ts` — the mapping/translation logic lives entirely inside this new adapter file. No domain type should ever be modified just to match a CMS's native shape; if a CMS's shape doesn't fit, that's the adapter's job to reconcile, not the domain model's.
3. Export a singleton, e.g. `export const sanityContentRepository: ContentRepository = { ... }`.
4. In `src/lib/content/index.ts`, change the `contentRepository` export to point at the new adapter.
5. Delete (or keep, for local dev/offline preview) `src/lib/content/local/*` — nothing else needs to change.

This same recipe works for Sanity, Contentful, a headless WordPress instance, or a future in-house admin backed by the real database described in `ARCHITECTURE.md` §4.4 — the interface doesn't assume anything CMS-specific.

## What's built (Sanity specifically)

- **Schema** — `src/sanity/schemaTypes/` — 29 document types + 5 shared object types, covering every content type from Website Settings down to Legal Pages. 12 of the 29 mirror the existing `ContentRepository` domain model field-for-field (Workshops/Instructors/Venues/Testimonials/Sponsors/Categories, Portfolio/Collections, Stories/Authors — see the table below). The other 17 (Homepage, About, Founder, Services, FAQs, Galleries, Certificates, Team Members, Clients, Partners, Brands, Navigation, Footer, Site Settings, Legal Pages, Announcement Banner, Tags) are **schema-prepared but not yet wired to `ContentRepository` or any page** — see "Site-wide content: prepared, not yet connected" below for why.
- **Studio** — `sanity.config.ts` (root) + `src/app/studio/[[...tool]]/` — the embedded admin UI at `/studio`, pinning every singleton type (Site Settings, Homepage, About, Founder, Navigation, Footer, Announcement Banner) to one document via a custom desk structure. The Studio route is a client-boundary component (`Studio.tsx`) — Sanity's UI bundle needs browser module resolution, which crashes under Turbopack's Server Component ("react-server") export condition if imported directly into a Server Component; keeping the import inside a dedicated `"use client"` file avoids that while letting `page.tsx` still export the `dynamic = "force-dynamic"` route config (which is invalid inside a `"use client"` file).
- **Client** — `src/sanity/lib/client.ts` (query client, CDN on in production only) and `src/sanity/lib/image.ts` (image URL builder — this is "image optimization": Sanity resizes/crops via URL params, Next's `<Image>` then serves the result).
- **Adapter** — `src/lib/content/sanity/repository.ts` + `queries.ts` + `groqFragments.ts` — GROQ queries shaped via projection to match each domain type exactly, so the query result needs no further JS-side mapping. Reference fields resolve to ID arrays (`categories[]._ref`) matching the domain model's `categoryIds: ID[]` pattern; image/file fields resolve to plain URL strings (`photo.asset->url`) matching `photoUrl: string | null`.
- **Connection test script** — `scripts/seedSanityConnectionTest.ts` (`npm run seed:sanity-connection-test`) — creates one small, clearly-labeled test workshop, not a port of the local `[SAMPLE]` placeholder content (importing fake sample data into your real, Ordift-owned CMS would just mean deleting it later).

### Requested CMS capabilities — how each is satisfied

| Requested | How |
|---|---|
| Role-based permissions | Native to Sanity's project member roles (Administrator/Editor/Viewer, or custom roles on paid plans) — configured in your Sanity project's "Members" settings once it exists, not in this codebase |
| Draft/Published workflow | `status: "draft" \| "published"` field on `workshop`/`portfolioProject`/`journalPost`, same as the local adapter — public queries filter to `published` only |
| Scheduled publishing | `journalPost.scheduledFor` — the GROQ query gates on `status == "published" && (!defined(scheduledFor) || scheduledFor <= now())`, identical logic to `isPubliclyVisible()` in `journalHelpers.ts`, just evaluated server-side in the query instead of in JS |
| Live preview | Not built this milestone — needs Next.js Draft Mode + `next-sanity/draft-mode`, which requires deciding where "preview" should render (every page? a dedicated route?) before wiring it; flagged as follow-up, not blocked on anything |
| Media library | Native to Sanity — every `image`/`file` field uploads into the project's shared asset library automatically |
| Image optimization | `src/sanity/lib/image.ts` (see above) |
| Slug validation | Every `slug` field uses Sanity's built-in `slug` type with `options.source`, which auto-generates and validates uniqueness within a document type |
| Reusable content references | Every relationship (categories, instructors, related items, etc.) is a Sanity `reference`/`array of reference`, not duplicated data |
| Revision history | Native to Sanity (document history is part of the platform, included on all plans) |
| Structured SEO | The shared `seo` object type (`metaTitle`/`metaDescription`/`ogImage`/`canonicalUrl`) on every content-bearing document |
| JSON-LD | Already implemented in Version 1.1 on Portfolio (`CreativeWork`) and Stories (`Article`/`VideoObject`) detail pages — unaffected by this milestone, since it's generated from the domain type, not the CMS |
| Localization readiness / future multilingual | Deliberately **not** built — see `ARCHITECTURE.md` §4.1: no evidence yet that the site itself needs to render in a second language. When that trigger hits, Sanity's document internationalization plugin can be added to any schema type without restructuring the domain model, since domain fields are already plain strings (a plugin swaps how the *editor* enters values, not how the frontend reads them) |

### Site-wide content: connected (Version 1.2.6, 2026-07-24)

Homepage, About, Founder, Services (×7), Navigation, Footer, Legal Pages
(×4), and Site Settings all now render through `contentRepository` —
the exact same real, already-approved copy that used to live in
hand-authored JSX, transcribed into Sanity via
`scripts/seedSanitySiteWideContent.ts` and verified word-for-word against
the previous static pages before the old JSX was removed. Two structural
changes came with this:

- **`NavBar`/`Footer` split**: `NavBar.tsx` and `Footer.tsx` are now
  `async` Server Components that call `contentRepository.getNavigation()`
  / `getFooterSettings()`. `NavBar`'s mobile-menu interactivity (a
  `"use client"` concern) moved into a new `NavBarClient.tsx`, which
  receives the fetched links/CTA as props — every existing `<NavBar />`
  / `<Footer />` call site is unchanged, since both still take zero props.
- **7 static department pages → 1 dynamic route**: `/services/[slug]`
  replaced `/services/photography/page.tsx` etc., matching the
  Workshops/Portfolio/Stories pattern. **Existing URLs are unchanged**
  (each `Service.slug` matches the route the static file used to occupy).
  Same for **4 static legal pages → `/legal/[slug]`**.
- **`src/lib/siteSettings.ts` retired**: it read `CONTACT_EMAIL`/WhatsApp
  number from env vars directly; `/book` now reads them from
  `contentRepository.getSiteSettings()` instead. The WhatsApp
  link-building helpers moved to `src/lib/whatsapp.ts` as pure functions
  (number passed in, not read from env) since `SiteSettings` is now the
  one source of truth for contact details.

### Pricing and Landing Pages: schema only, deliberately empty

Two types from your requested list have a schema (`pricingPackage`,
`landingPage`) but **zero content and no page reads them**:

- **Pricing** — no pricing content exists anywhere in this codebase, and
  the standing zero-invention/pricing-gating rule (already applied to the
  enquiry form's budget ranges and the workshop payment flow) means no
  price gets shown publicly until real pricing is approved.
  `pricingPackage.isPublished` defaults `false`. This wasn't a question
  to ask — it's the same rule already in effect everywhere else pricing
  could appear, applied consistently here too.
- **Landing Pages** — no landing pages exist in this codebase (Home,
  About, Services, and departments each have dedicated schemas instead).
  The `landingPage` type is forward-looking infrastructure for a future
  one-off campaign page; building the actual render path (a
  `/landing/[slug]` route) is deferred until a real campaign needs one —
  per the "no feature without a clear place" principle, a generic page
  renderer is real engineering, not worth doing speculatively against
  zero real use cases.

## Sanity schema (as built — connected types)

| Domain type | Sanity document type | Notes |
|---|---|---|
| `Workshop` | `workshop` | `categoryIds`/`instructorIds`/`sponsorIds`/`testimonialIds`/`relatedWorkshopIds` are Sanity `reference`/`array of reference` fields |
| `Instructor` | `instructor` | `photoUrl` resolves from a Sanity `image` field via `photo.asset->url` in the adapter's GROQ projection |
| Workshop `Category` | `workshopCategory` | |
| `Venue` | `venue` | |
| `GalleryImage`, `FAQ`, `AgendaItem` | inline object types (not top-level documents) | Nested inside `workshop`; `id` resolves from Sanity's auto-generated array-item `_key`, not a stored field |
| `Testimonial` | `testimonial` | Shared pool — referenced from either a `workshop` or a `portfolioProject`'s `testimonials` field, matching the domain type's design (no owner field) |
| `Sponsor` | `sponsor` | |
| `PortfolioProject` | `portfolioProject` | `status` is `"draft" \| "published"`, filtered server-side in the query rather than relying on Sanity's own draft system, so behavior matches the local adapter exactly |
| Portfolio `Category` | `portfolioCategory` | Kept separate from `workshopCategory`/`journalCategory` even though the shape is identical — the three taxonomies are edited and browsed independently |
| `Collection` | `portfolioCollection` | Covers both curated Collections and ordered Project Series (`isOrdered`) — see the type's doc comment in `types.ts` |
| `Collaborator`, `Award`, `Publication`, `DownloadableAsset`, `BeforeAfterPair` | inline object types | Nested inside `portfolioProject` |
| `Author` | `author` | |
| `JournalPost` | `journalPost` | Branded "Stories" on the frontend and in the Studio UI; `body` is plain `text`, not Portable Text — see the comment in `journalPost.ts` for why (upgrading to real rich text needs a frontend renderer, out of scope for "don't change the frontend") |
| Journal `Category` | `journalCategory` | |
| `Tag` (schema only) | `tag` | Prepared for a future controlled-vocabulary autocomplete; `JournalPost.tags` stays a free-text `string[]` in the domain model for now (see `tag.ts`) |
| `SiteSettings` | `siteSettings` | Singleton — `_id: "siteSettings"`, pinned in the desk structure |
| `HomePage` | `homepage` | Singleton — `_id: "homepage"` |
| `AboutPage` | `aboutPage` | Singleton — `_id: "aboutPage"` |
| `Founder` | `founder` | Singleton — `_id: "founder"` |
| `Navigation` | `navigation` | Singleton — `_id: "navigation"` |
| `FooterSettings` | `footerSettings` | Singleton — `_id: "footerSettings"` |
| `Service` | `service` | Repeatable (×7) — `slug` matches `PortfolioDiscipline`, doubles as the `/services/[slug]` route param |
| `LegalPage` | `legalPage` | Repeatable (×4) — `_id: "legalPage-<slug>"`, `isApproved` gates the "(Draft)" title suffix and `noindex` |
| `CtaButton`, `SocialLink` | inline object types | Nested inside the singletons above |

All singleton `_id`s are fixed to the type name specifically because
`sanity.config.ts`'s desk structure looks them up by `.documentId(typeName)`
— renaming a singleton type without updating both places would break the
pinned editor view.

`isRecurring`/`recurrenceNote` are intentionally a boolean + free-text field, not a structured recurrence rule (RRULE) — building real recurrence logic (auto-generating future occurrences, timezone handling, exceptions) is a meaningfully bigger feature than the current workshop count justifies. Revisit as a structured field only once recurring workshops are actually running and the free-text note proves insufficient.

`PortfolioDiscipline` is a fixed union (not a document type) because it mirrors the site's actual department routes (`/services/[slug]`) — same reasoning as `WorkshopStatus` being a union rather than a repository entity.

## How the connection was completed (2026-07-24)

1. **Project created under Ordift Studios' ownership** — you signed in
   via `sanity login --provider google` as `matetey@ordiftghana.com` and
   created the "Ordift Studios" organization directly (no organization
   existed on the account beforehand — this had to happen in the browser,
   there's no way to script "create an organization" from the CLI).
   Project ID: `ixbvr1n8`.
2. **Datasets**: `production` (Sanity's default, created automatically)
   and `staging` (created via `sanity dataset create staging --visibility
   private`). No separate `development` dataset — nothing else in this
   codebase distinguishes local dev from staging (local dev already runs
   against `staging`, see `.env.local`), so a third tier would have
   introduced inconsistency rather than resolved one.
3. **API token**: one Editor-role token (`sanity tokens create ... --role=editor`),
   stored only in `.env.local` (gitignored) as `SANITY_API_TOKEN`. Used by
   both the query client and the seed scripts. *(Known trade-off: this is
   more privilege than the read-only query client strictly needs — a
   separate Viewer-role token for reads would be tighter least-privilege.
   Not split out this milestone since the token never leaves the server
   and splitting it adds a second credential to manage/rotate for no
   change in actual exposure; revisit if the threat model changes.)*
4. **CORS origin**: `http://localhost:3000` registered via `sanity cors
   add ... --credentials` — without this, `/studio` shows a "Connect this
   Studio to your project" screen instead of loading. Every new deployed
   domain needs its own CORS origin added before first use — see
   `DEPLOYMENT.md`.
5. **Sample content seeded into `staging`** (`npm run
   seed:sanity-sample-data`, 58 documents) — the same `[SAMPLE]`-labeled
   placeholder content that ships in `src/lib/content/local/*`, ported so
   the flip below could be verified against equivalent content instead of
   an empty CMS. Never run against `production` (the script refuses).
6. **Adapter flipped** — `src/lib/content/index.ts` now exports
   `sanityContentRepository`.
7. **Full verification pass** — every Workshops/Portfolio/Stories page,
   filter, search, draft-exclusion, and scheduled-publishing check
   re-run against the live connection (all passed — see "Bugs found and
   fixed" below for the two real issues caught in the process). Registration
   end-to-end tested against a live Sanity-sourced workshop.

### Bugs found and fixed during connection

Two real defects were caught only once real (non-mocked) queries ran —
both fixed, both would have shipped silently broken otherwise:

- **`src/sanity/lib/client.ts` never passed the API token.** Both
  datasets are private (no public "anyone with the link" sharing, per
  Plan Part I), so unauthenticated queries against a private dataset
  return empty results rather than an error — every page silently showed
  "no workshops," "no projects," etc. with no error logged anywhere.
  Fixed by adding `token: process.env.SANITY_API_TOKEN` to the client config.
- **Non-nullable object fields (`SeoFields`, `CertificateInfo`,
  `MediaAsset` where required) crashed the page when left unset in
  Sanity.** These are optional in the Sanity schema (an editor can skip
  the whole SEO panel) but non-nullable in the TypeScript domain
  model — a plain GROQ projection returns `null` for an unset object
  field, and `project.seo.metaTitle` then throws. Fixed with `coalesce()`
  defaults in `groqFragments.ts` (`seoFragment`, `certificateFragment`,
  `requiredMediaAssetFragment`) so every query returns a well-formed
  object regardless of what an editor actually filled in.

## What's next

- Pricing and Landing Pages remain schema-only, deliberately — see above.
- `src/lib/content/local/*` is kept for now, not deleted — useful for
  offline local dev and as a reference for the schema/seed mapping.
  Remove it once you're confident you won't need the local fallback.
- Editing content going forward: real, approved copy (Home/About/Founder/
  Services/Nav/Footer/Legal) lives in **both** `staging` and `production`
  — edit it in Studio against whichever dataset you're previewing, and
  remember to make the same edit in both if the change should go live
  everywhere (there's no automatic sync between datasets by design — see
  STAGING.md). Workshop/Portfolio/Stories `[SAMPLE]` placeholder content
  only ever lives in `staging`, as before.
- Live preview (Next.js Draft Mode) — still not built, needs a
  preview-surface decision first.

## What does NOT change when the CMS is connected

- The registration system (schema, API route, storage, waitlist logic, emails, Google Sheets integration) — none of it reads workshop *content* beyond `slug`, `id`, `title`, `capacity`, `status`, and `requiresPayment`, all of which exist identically on both the local and future CMS-backed `Workshop` type.
- Every page component under `src/app/workshops/` — they call `contentRepository.getWorkshops()` / `getWorkshopBySlug()` / etc., not anything CMS-specific.
- The reference-number generation, email templates, and Sheet mapping documented in `WORKSHOPS_ARCHITECTURE.md`.
