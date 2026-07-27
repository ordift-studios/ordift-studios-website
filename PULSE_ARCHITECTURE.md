# Ordift Studios — Ordift Pulse Architecture

**Established:** 2026-07-27. Pulled forward from `PRODUCT_ROADMAP.md`'s Version 4.0 per explicit direction — this document covers the architecture only: schema, taxonomy, editorial workflow, and repository layer. No public pages exist yet, no data provider is connected, and no ingestion/scraping logic has been written.

**Vision:** Ordift Pulse is a curated Creative Industry Hub, not a generic news feed. Every piece of content — whether written in-house or drawn from a trusted external source — passes through the same editorial discipline already proven on the rest of this site (see `feedback_ordift_content_accuracy` in project memory: never invent facts, never publish unapproved claims). The goal is a reason to visit Ordift Studios regularly, not a scraped aggregator.

---

## 1. What this is not

- **Not uncontrolled web scraping.** No RSS parser, API poller, or scraping script exists anywhere in this codebase. `pulseSource` is a registry of *where curated content is allowed to come from*, not a fetcher.
- **Not a raw content mirror.** Curated articles are always a written summary in Ordift's own words, with a link out to the original — never a reproduction of someone else's copyrighted text. Same "at most one short quote, attributed" discipline already applied to this project's own copy.
- **Not a single flat category list.** See §2.

## 2. Three independent taxonomy axes

Requested categories split cleanly into three genuinely independent facts about a piece of content — conflating them into one list would make filtering by any single axis impossible. This mirrors the discipline already established for Role/Position/Grade/Engagement Type in the IAM system (`PRODUCT_ROADMAP.md` Version 1.1): independent axes, never coupled.

| Axis | Sanity type | Example values | Applies to |
|---|---|---|---|
| **Category** (topical subject) | `pulseCategory` | Creative Industry News, Fashion News, Photography News, Videography & Filmmaking News, Music & Entertainment News, Creative Technology, Camera & Equipment Releases, Adobe & Editing Software Updates | Every article |
| **Region** (geographic scope) | `pulseRegion` | Ghana, Qatar, Africa, International | Every article |
| **Opportunity Type** (event/listing kind) | `pulseOpportunityType` | Exhibition, Fashion Week, Festival, Award, Workshop, Masterclass, Grant, Competition, Casting Call, Collaboration Opportunity | Only articles with `contentKind: "opportunity"` |

All three reuse the existing `Category` type (`id`, `slug`, `name`, `description` — `src/lib/content/types.ts`) rather than inventing a new shape, backed by three separate Sanity document types for independent admin management — the same pattern already proven by `journalCategory`/`portfolioCategory`/`workshopCategory`.

A `pulseArticle` can carry multiple categories and multiple regions (e.g. "Photography News" + "Ghana"), and — if it's an opportunity — multiple opportunity types.

## 3. One content type, two independent dimensions

Rather than proliferating near-duplicate schemas, `pulseArticle` (`src/sanity/schemaTypes/documents/pulseArticle.ts`) covers everything through two independent fields:

- **`contentKind`**: `"article"` (news/editorial) or `"opportunity"` (a deadline-driven listing — grant, casting call, festival, etc.). Opportunity-only fields (`applicationDeadline`, `eventStartDate`/`eventEndDate`, `location`, `applyUrl`, `eligibility`) are hidden in Studio unless `contentKind === "opportunity"`.
- **`origin`**: `"editorial"` (Ordift-authored — has an `author` reference, reusing the same `author` document Journal uses) or `"curated"` (from a trusted `pulseSource` — has `source`/`sourceUrl`/`sourceAttribution`, no author). Studio hides whichever set doesn't apply.

This is the same polymorphic-field discipline already used by `MediaAsset` (`type: "image" | "video" | "embed"`) and `PortfolioProject` (format-conditional fields) — one document type, Studio-side conditional visibility, no schema proliferation.

## 4. Editorial-approval workflow

`PulseStatus = "draft" | "inReview" | "published" | "archived"` — richer than Journal's `draft`/`published` because curated content needs a human gate before anything external-facing goes live. Scheduling stays a separate `scheduledFor` field, exactly like `JournalPost`, so the same already-proven visibility gate applies unchanged:

```
status === "published" && (!scheduledFor || scheduledFor <= now)
```

(`src/lib/content/pulseHelpers.ts:isPubliclyVisible`, mirrored in GROQ as `pulseVisibilityFilter` in `sanity/queries.ts`.)

The rule — curated content should always pass through `inReview` before `published`; editorial (staff-authored) content may skip it if the author is already an approver — is enforced today by a Studio field description and operational discipline, not a hard state-machine constraint. This matches how other process rules on this project are enforced (e.g. legal-page publish gating, content-accuracy review) — documentation plus discipline, not application code, since Sanity Studio itself is the review interface and no separate admin build exists yet.

This is the "Admin Review" step of the roadmap's stated workflow: **Source → AI summarization → Draft → Admin Review → Publish.**

## 5. The trusted-source registry — no scraping

`pulseSource` (`src/sanity/schemaTypes/documents/pulseSource.ts`) is the data layer's entire connection point for future ingestion:

```ts
type PulseSource = {
  id: ID;
  name: string;
  sourceType: "rss" | "api" | "press-release" | "partner" | "manual";
  url: string | null;
  licenseNotes: string | null; // usage-rights/attribution terms agreed with this source, if any
  isActive: boolean;
};
```

Adding a source here does **not** pull in any content — it's purely an admin-managed allowlist. When a real ingestion step is eventually built (explicitly **not** part of this stage), the design intent is:

1. A future fetcher reads only from `isActive: true` sources.
2. Every ingested item is created as a `pulseArticle` with `origin: "curated"`, `status: "draft"` or `"inReview"` — **never** `"published"` — and `sourceId`/`sourceUrl` populated.
3. A human reviews and explicitly publishes. No automation writes `status: "published"`.

This is the concrete mechanism behind "do not implement uncontrolled web scraping": the gate isn't a promise, it's the fact that nothing in this codebase can currently write a published article without a human clicking Publish in Studio.

## 6. AI-assist, without building AI yet

`aiSummary` and `aiSummaryApprovedAt` are scratch fields — never rendered publicly, never populated by anything today. They exist so a future AI-summarization step (the roadmap's "Source → AI summarization" stage) has somewhere to write a first draft, which an editor then turns into (or approves as) `body` before anything publishes. Adding this now, while the schema is fresh, means the eventual AI integration is additive — a new script/Edge Function that writes to an existing field — not a schema migration.

## 7. Repository layer

`ContentRepository` (`src/lib/content/repository.ts`) gained six methods, implemented in both adapters exactly like every other content type (`src/lib/content/sanity/repository.ts` is the active one; `src/lib/content/local/repository.ts` + `src/lib/content/local/pulseData.ts` are dev fixtures):

```ts
getPulseArticles(): Promise<PulseArticle[]>;        // published or archived, past scheduledFor only
getPulseArticleBySlug(slug: string): Promise<PulseArticle | null>;
getPulseCategories(): Promise<Category[]>;
getPulseRegions(): Promise<Category[]>;
getPulseOpportunityTypes(): Promise<Category[]>;
getPulseSources(): Promise<PulseSource[]>;
```

`local/pulseData.ts` seeds the three real taxonomy lists (legitimate organizational labels, not fabricated claims) plus (as of the Stories/Journal integration — see `STORIES_PULSE_INTEGRATION.md`) seven `[SAMPLE]`-prefixed placeholder articles, one per grouping/trust-badge combination, plus two clearly `[SAMPLE]`-labeled placeholder sources — the same convention already used by `journalData.ts`/`portfolioData.ts`. These are local dev fixtures only; production reads from Sanity, where no source relationships or content exist yet.

## 8. Future-proofing — why no further schema is needed yet

The explicit ask was to future-proof for newsletters, personalized recommendations, saved articles, notifications, and AI summaries *without a major rewrite*. Checked against the shape above:

- **Newsletters** — `newsletterExcerpt` already exists (same data-readiness-only convention as `JournalPost`). A future newsletter compiler reads `title`/`excerpt`/`heroMedia`/`publishedAt` — all already present. No schema change needed; only a sending integration.
- **Personalized recommendations** — needs exactly the taxonomy this stage builds (`categoryIds`/`regionIds`/`tags`) plus a future user-preference record (Version 1.1+ profile data). No `PulseArticle` change needed.
- **Saved articles** — a future Supabase join table (`user_id`, `pulse_article_id`) referencing `PulseArticle.id`, following the exact pattern already used for every other user-relational feature on this platform (Supabase for relational/user data, Sanity for content). No Sanity schema change.
- **Notifications** — a future delivery system keyed off `featured`/`categoryIds`/`regionIds`, all already queryable. No schema change.
- **AI-assisted summaries** — the direct hook already built, see §6.

None of these are built in this stage — deliberately. Building them now would be exactly the kind of premature abstraction this project's engineering standards explicitly warn against (`PRODUCT_ROADMAP.md`, "Engineering Standards for Future Development": *"no premature abstraction, no speculative generality beyond what the current version actually needs"*). What's built instead is the one thing that actually would require a rewrite later if skipped: the taxonomy, the workflow states, and the provenance fields.

## 9. What's deliberately not built yet

- **Public pages: now built, but embedded inside Stories/Journal rather than a separate `/pulse` section** — per explicit direction, superseding what this section originally said. See `STORIES_PULSE_INTEGRATION.md` for the full design of that integration.
- No Admin Platform module for managing Pulse content (Sanity Studio is the interface today, same as every other content type before its dedicated admin UI existed).
- No ingestion/fetching code for any source type.
- No AI summarization integration.
- No newsletter-sending integration.
- No Supabase tables for saved articles or notifications.

Each of these is a natural next milestone, not a gap in this stage's scope.

---

*Companion documents: [STORIES_PULSE_INTEGRATION.md](STORIES_PULSE_INTEGRATION.md) (how Pulse content is publicly presented inside Stories/Journal), [MEDIA_ARCHITECTURE.md](MEDIA_ARCHITECTURE.md) (the reusable media components `pulseArticle.heroMedia` renders through), [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) Version 4.0 (the original Ordift Pulse roadmap entry this architecture fulfills ahead of schedule), [ARCHITECTURE.md](ARCHITECTURE.md) (broader architectural decision record), [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).*
