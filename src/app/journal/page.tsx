import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import JournalPostCard from "@/components/journal/JournalPostCard";
import { contentRepository } from "@/lib/content";
import {
  ALL_GROUPINGS,
  GROUPING_LABEL,
  fromJournalPost,
  fromPulseArticle,
  matchesStoriesSearch,
  type StoriesGrouping,
} from "@/lib/content/storiesFeed";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

const TITLE = "Stories — Ordift Studios";
const DESCRIPTION =
  "Stories from Ordift Studios — photography insights, behind-the-scenes, business lessons, curated creative-industry news and opportunities, and everything in between.";
const CANONICAL = `${SITE_URL}/journal`;
const IMAGES = [`${SITE_URL}/opengraph-image`];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL, type: "website", images: IMAGES },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: IMAGES },
};

function buildHref(params: { type?: string; category?: string; tag?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.type) search.set("type", params.type);
  if (params.category) search.set("category", params.category);
  if (params.tag) search.set("tag", params.tag);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return qs ? `/journal?${qs}` : "/journal";
}

function isStoriesGrouping(value: string | undefined): value is StoriesGrouping {
  return ALL_GROUPINGS.includes(value as StoriesGrouping);
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; category?: string; tag?: string; q?: string }>;
}) {
  const { type: typeParam, category: categorySlug, tag, q } = await searchParams;
  const grouping = isStoriesGrouping(typeParam) ? typeParam : undefined;

  const [home, journalPosts, journalCategories, authors, pulseArticles, pulseCategories, pulseOpportunityTypes, pulseSources] =
    await Promise.all([
      contentRepository.getHomePage(),
      contentRepository.getJournalPosts(),
      contentRepository.getJournalCategories(),
      contentRepository.getAuthors(),
      contentRepository.getPulseArticles(),
      contentRepository.getPulseCategories(),
      contentRepository.getPulseOpportunityTypes(),
      contentRepository.getPulseSources(),
    ]);

  const categoryById = new Map([...journalCategories, ...pulseCategories].map((c) => [c.id, c]));
  const authorById = new Map(authors.map((a) => [a.id, a]));
  const opportunityTypeById = new Map(pulseOpportunityTypes.map((o) => [o.id, o]));
  const sourceById = new Map(pulseSources.map((s) => [s.id, s]));

  const items = [
    ...journalPosts.map(fromJournalPost),
    ...pulseArticles.map((a) => fromPulseArticle(a, opportunityTypeById, sourceById)),
  ].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  const hasFilters = Boolean(grouping || categorySlug || tag || q);

  const filtered = items.filter((item) => {
    if (grouping && item.grouping !== grouping) return false;
    if (categorySlug && !item.categoryIds.some((id) => categoryById.get(id)?.slug === categorySlug))
      return false;
    if (tag && !item.tags.includes(tag)) return false;
    if (q && !matchesStoriesSearch(item, q)) return false;
    return true;
  });

  const featured = items.filter((item) => item.featured);
  const allTags = Array.from(new Set(items.flatMap((item) => item.tags))).slice(0, 12);

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Stories
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">
            We shape stories people remember.
          </h1>
          <p className="font-sans text-body text-white/70 max-w-xl">
            Photography insights, behind-the-scenes, business lessons, faith
            reflections, curated creative-industry news and opportunities —
            from the people building Ordift Studios and the wider creative
            world around it.
          </p>
        </div>
      </section>

      {/* Ordift Originals (2026-08-24) — relocated here from the Homepage,
          same Sanity fields (home.originals*), unchanged data — this is
          where the studio's own original media/creative projects belong,
          conceptually adjacent to the existing "Studio Stories" grouping
          below. No content deleted, no schema changed; only where this
          teaser is presented moved. */}
      <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              {home.originalsEyebrow}
            </p>
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-4">
              {home.originalsHeadline}
            </h2>
            <p className="font-sans text-body text-ordift-ink-muted mb-6">{home.originalsBody}</p>
            <Link
              href={buildHref({ type: "studio-stories" })}
              className="font-sans text-body-small font-semibold text-ordift-gold-pressed underline underline-offset-4"
            >
              Explore Studio Stories →
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 pt-10 sm:pt-12">
        <div className="max-w-6xl mx-auto">
          <form action="/journal" method="get" className="flex gap-2 mb-6">
            {grouping && <input type="hidden" name="type" value={grouping} />}
            {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
            {tag && <input type="hidden" name="tag" value={tag} />}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search stories…"
              aria-label="Search stories"
              className="w-full max-w-sm min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body-small text-ordift-ink placeholder:text-ordift-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent"
            />
            <button
              type="submit"
              className="inline-flex items-center min-h-11 px-5 rounded-lg bg-ordift-navy-950 text-white font-sans text-body-small"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap gap-2 mb-4">
            <Link
              href={buildHref({ category: categorySlug, tag, q })}
              className={`inline-flex items-center min-h-8 px-3 rounded-full font-sans text-caption transition-colors ${
                !grouping
                  ? "bg-ordift-navy-950 text-white"
                  : "border border-black/10 text-ordift-ink-muted hover:border-black/25"
              }`}
            >
              All
            </Link>
            {ALL_GROUPINGS.map((g) => (
              <Link
                key={g}
                href={buildHref({ type: g, category: categorySlug, tag, q })}
                className={`inline-flex items-center min-h-8 px-3 rounded-full font-sans text-caption transition-colors ${
                  grouping === g
                    ? "bg-ordift-navy-950 text-white"
                    : "border border-black/10 text-ordift-ink-muted hover:border-black/25"
                }`}
              >
                {GROUPING_LABEL[g]}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Link
              href={buildHref({ type: grouping, tag, q })}
              className={`inline-flex items-center min-h-8 px-3 rounded-full font-sans text-caption transition-colors ${
                !categorySlug
                  ? "bg-ordift-gold/15 text-ordift-gold-pressed"
                  : "border border-black/10 text-ordift-ink-muted hover:border-black/25"
              }`}
            >
              All Categories
            </Link>
            {[...journalCategories, ...pulseCategories].map((cat) => (
              <Link
                key={cat.id}
                href={buildHref({ type: grouping, category: cat.slug, tag, q })}
                className={`inline-flex items-center min-h-8 px-3 rounded-full font-sans text-caption transition-colors ${
                  categorySlug === cat.slug
                    ? "bg-ordift-gold/15 text-ordift-gold-pressed"
                    : "border border-black/10 text-ordift-ink-muted hover:border-black/25"
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-6 border-b border-black/10">
              {allTags.map((t) => (
                <Link
                  key={t}
                  href={
                    tag === t
                      ? buildHref({ type: grouping, category: categorySlug, q })
                      : buildHref({ type: grouping, category: categorySlug, tag: t, q })
                  }
                  className={`inline-flex items-center min-h-7 px-2.5 rounded-full font-sans text-caption transition-colors ${
                    tag === t
                      ? "bg-ordift-navy-950 text-white"
                      : "bg-ordift-offwhite text-ordift-ink-muted hover:bg-ordift-navy-950/5"
                  }`}
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {!hasFilters && featured.length > 0 && (
        <section className="bg-white px-4 sm:px-8 py-14 sm:py-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Featured Stories
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {featured.map((item) => (
                <JournalPostCard
                  key={item.id}
                  post={item}
                  categories={item.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  author={item.authorId ? authorById.get(item.authorId) ?? null : null}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
            {hasFilters ? "Results" : "All Stories"}
          </h2>
          {filtered.length === 0 && items.length === 0 ? (
            <p className="font-sans text-body text-ordift-ink-muted">
              Stories from Ordift Studios are on the way. In the meantime,{" "}
              <Link
                href="/book?service=general"
                className="text-ordift-gold hover:text-ordift-gold-hover underline underline-offset-4"
              >
                get in touch directly
              </Link>
              .
            </p>
          ) : filtered.length === 0 ? (
            <p className="font-sans text-body text-ordift-ink-muted">
              No stories match these filters yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {filtered.map((item) => (
                <JournalPostCard
                  key={item.id}
                  post={item}
                  categories={item.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  author={item.authorId ? authorById.get(item.authorId) ?? null : null}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
