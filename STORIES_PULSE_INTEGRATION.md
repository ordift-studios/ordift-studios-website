# Ordift Studios — Stories/Journal × Ordift Pulse Integration

**Established:** 2026-07-27, superseding the "public `/pulse` routes" item listed as future work in `PULSE_ARCHITECTURE.md` §9. Per explicit direction, Ordift Pulse's public-facing experience lives inside the existing Stories/Journal section for this release — no new routes, no new top-level nav item, no parallel article system.

---

## 1. The decision

`PULSE_ARCHITECTURE.md` covers the schema/taxonomy/workflow design and remains accurate as written. What changed is the *public presentation*: rather than building `/pulse` as its own section, Pulse content renders inside `/journal` (branded "Stories" on-page) alongside Studio Stories, distinguished by a Content Type filter and trust badges.

**`pulseArticle` stays a fully separate Sanity document type from `journalPost`.** They are unified only at the read layer — a new pure-function module, `src/lib/content/storiesFeed.ts` — not by merging schemas. This is what keeps the future-flexibility requirement intact: extracting Pulse into its own dedicated section later, if audience demand justifies it, means adding new routes that query `pulseArticle` alone. No migration, no schema redesign — the two document types were never coupled to begin with.

## 2. What's reused, unchanged

- Routes: `/journal` and `/journal/[slug]`. `/journal/authors/[slug]` also unchanged (Pulse editorial pieces aren't shown there yet — see §5).
- Components: `JournalPostCard` (extended, see §3), `MediaAsset`/`ResponsiveImage`, `SocialShare`, `Avatar`.
- SEO: the exact same `SeoFields` shape and OG-image-fallback logic (`article.seo.ogImageUrl ?? article.heroMedia.url`) already used for Journal/Portfolio.
- Search/filter mechanics: the existing category-chip, tag-chip, and search-box pattern on `/journal` — extended, not replaced.
- Helpers: `formatDate`, `estimateReadingTime` (already plain-string functions, not `JournalPost`-typed) work unchanged for Pulse content.
- Repository methods: all six `getPulse*` methods from the earlier architecture stage — **zero new repository methods or Sanity queries were added** for this integration.

## 3. What was added

### `src/lib/content/storiesFeed.ts`
The merge point. `fromJournalPost()` and `fromPulseArticle()` normalize both types into one `StoriesFeedItem` shape (title, excerpt, heroMedia, categoryIds, tags, publishedAt, a computed `grouping`, and a computed `trustBadge`). `JournalPostCard` now renders `StoriesFeedItem`, not raw `JournalPost` — every existing call site was updated to wrap its posts through `fromJournalPost()` first, which is why pure-Journal pages have zero visual change.

### Content Type groupings (six, not seven)
| Grouping | Computed from |
|---|---|
| Studio Stories | Every `journalPost` |
| Editorial | `pulseArticle` with `origin === "editorial"` |
| Creative News | `pulseArticle`, `contentKind === "article"`, curated from a general source (rss/api/manual) or community-submitted |
| Industry Updates | `pulseArticle`, `contentKind === "article"`, curated from an official source (press-release/partner) |
| Opportunities | `pulseArticle`, `contentKind === "opportunity"`, deadline-driven type (grant, competition, casting call, collaboration) |
| Upcoming Events | `pulseArticle`, `contentKind === "opportunity"`, event/venue-driven type (exhibition, fashion week, festival, workshop, masterclass, award) |

**"Creative Technology" has no dedicated tab.** It's a `pulseCategory`, not a content-origin distinction — it's already covered by the existing category-chip filter (which now spans both `journalCategory` and `pulseCategory`), exactly the same way "Photography Tips" or "Fashion News" are. Treating it as a seventh grouping tab would have duplicated a filter axis that already exists.

### Trust badges
Four, matching the request exactly:
- **Verified by Ordift Studios** — every `journalPost`, and any `pulseArticle` with `origin === "editorial"`.
- **Official Source** — `pulseArticle` with `origin === "curated"` (sourced from the vetted `pulseSource` registry — that's what makes it "official" as opposed to unvetted community input, regardless of which grouping it lands in).
- **Community Submitted** — `pulseArticle` with `origin === "community"` (new value, added to `PulseOrigin` this stage — see below).
- **Archived** — `status === "archived"`, overrides every other badge. Archived items stay visible (dimmed card, labeled) rather than disappearing — the Pulse visibility filter was widened from `status == "published"` to `status == "published" || status == "archived"` to make this reachable rather than dead code.

### Detail page (opportunity/source blocks)
`/journal/[slug]` tries `getJournalPostBySlug` first — **that branch is byte-for-byte the same code as before this integration**. If no post matches, it falls back to `getPulseArticleBySlug` and renders a new sibling branch: a "Read more at the source" link (shown whenever `origin` is `curated` or `community` and `sourceUrl` is set — never for editorial content, since there's no external source to attribute), and an opportunity info block (deadline, event dates, location, eligibility, apply link) shown only when `contentKind === "opportunity"`.

### Schema (two small touches, documented in the commit and in `PULSE_ARCHITECTURE.md`)
- `PulseOrigin` gained `"community"`.
- The Pulse visibility filter now includes `"archived"`.

No `journalPost` schema field changed.

## 4. Curated content stays a summary, never a reproduction

Unchanged from `PULSE_ARCHITECTURE.md` §1 and §5 — the `body` field for curated/community content is always a written summary in Ordift's own words, with `sourceUrl`/`sourceAttribution` providing the link-out. The detail page's "Read more at the source" block is how that link-out actually surfaces publicly; nothing about this integration changes the no-reproduction rule.

## 5. Editorial workflow, unchanged

Source or submission → Draft → Admin Review (`status: inReview`) → Edit/Approve → Publish, exactly as specified in `PULSE_ARCHITECTURE.md` §4. This integration only changes where published content is *displayed* — the approval gate that decides *whether* it's published lives entirely in Sanity Studio's `status` field and hasn't moved.

## 6. Explicitly out of scope this pass

- **Cross-type "Related" linking.** A Journal post's related items stay Journal-only (`relatedPostIds`); a Pulse article's stay Pulse/Portfolio/Workshop-only (`relatedArticleIds`/`relatedProjectIds`/`relatedWorkshopIds`). An editor curating a Journal post can't yet link out to a Pulse article as "related," or vice versa. Lowest-risk choice for this stage — flagged here as the natural next enhancement if it turns out to matter in practice.
- **Author profile page** (`/journal/authors/[slug]`) still shows only `journalPost` entries by that author, even though Pulse editorial pieces can reference the same `author` document. Small, mechanical addition later if wanted.
- **Slug uniqueness across the two document types is not enforced by Sanity.** Each type's `slug` field is unique *within* that type, but nothing currently stops an editor from giving a `pulseArticle` the same slug as an existing `journalPost` (or vice versa), which would make one of them unreachable at `/journal/[slug]` (the route checks `journalPost` first). Low probability given real editorial discipline, but worth naming as a known gap rather than leaving it silent — a future custom `isUnique` Sanity validation checking both types together would close it if it ever becomes a real problem.
- Everything already listed as future work in `PULSE_ARCHITECTURE.md` §9 (ingestion, AI summarization, newsletter sending, saved articles/notifications) is still future work — this stage only changed *where* already-published content is displayed, not what feeds it.

## 7. Verification

`tsc --noEmit` and `eslint .` clean; `next build` clean across every route; `sanity schema validate` — 0 errors, 0 warnings. Manually regression-tested by temporarily pointing `src/lib/content/index.ts` at `localContentRepository` (reverted before committing — zero net diff on that file) against seven local `[SAMPLE]` `PulseArticle` fixtures covering every grouping/badge combination: grouping tabs, merged category chips, all four trust badges, opportunity/archived/community detail-page rendering, and every existing Journal-only flow (post detail, author profile, category filter, search) all confirmed working with no regressions.

---

*Companion documents: [PULSE_ARCHITECTURE.md](PULSE_ARCHITECTURE.md) (schema/taxonomy/workflow design, still accurate), [MEDIA_ARCHITECTURE.md](MEDIA_ARCHITECTURE.md) (the media components this integration reuses unchanged), [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).*
