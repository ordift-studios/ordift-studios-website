import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import JournalPostCard from "@/components/journal/JournalPostCard";
import { contentRepository } from "@/lib/content";
import { matchesSearch } from "@/lib/content/journalHelpers";

export const metadata: Metadata = {
  title: "Stories — Ordift Studios",
  description:
    "Stories from Ordift Studios — photography insights, behind-the-scenes, business lessons, faith reflections and more.",
};

function buildHref(params: { category?: string; tag?: string; q?: string }) {
  const search = new URLSearchParams();
  if (params.category) search.set("category", params.category);
  if (params.tag) search.set("tag", params.tag);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return qs ? `/journal?${qs}` : "/journal";
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tag?: string; q?: string }>;
}) {
  const { category: categorySlug, tag, q } = await searchParams;

  const [allPosts, categories, authors] = await Promise.all([
    contentRepository.getJournalPosts(),
    contentRepository.getJournalCategories(),
    contentRepository.getAuthors(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const hasFilters = Boolean(categorySlug || tag || q);

  const filtered = allPosts
    .filter((p) => {
      if (categorySlug && !p.categoryIds.some((id) => categoryById.get(id)?.slug === categorySlug))
        return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (q && !matchesSearch(p, q)) return false;
      return true;
    })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  const featured = allPosts.filter((p) => p.featured);
  const allTags = Array.from(new Set(allPosts.flatMap((p) => p.tags))).slice(0, 12);

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
            reflections and everything in between — from the people building
            Ordift Studios.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 pt-10 sm:pt-12">
        <div className="max-w-6xl mx-auto">
          <form action="/journal" method="get" className="flex gap-2 mb-6">
            {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
            {tag && <input type="hidden" name="tag" value={tag} />}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search stories…"
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
              href={buildHref({ tag, q })}
              className={`inline-flex items-center min-h-8 px-3 rounded-full font-sans text-caption transition-colors ${
                !categorySlug
                  ? "bg-ordift-gold/15 text-ordift-gold-pressed"
                  : "border border-black/10 text-ordift-ink-muted hover:border-black/25"
              }`}
            >
              All Categories
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={buildHref({ category: cat.slug, tag, q })}
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
                  href={tag === t ? buildHref({ category: categorySlug, q }) : buildHref({ category: categorySlug, tag: t, q })}
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
              {featured.map((post) => (
                <JournalPostCard
                  key={post.id}
                  post={post}
                  categories={post.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  author={authorById.get(post.authorId) ?? null}
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
          {filtered.length === 0 ? (
            <p className="font-sans text-body text-ordift-ink-muted">
              No stories match these filters yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {filtered.map((post) => (
                <JournalPostCard
                  key={post.id}
                  post={post}
                  categories={post.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  author={authorById.get(post.authorId) ?? null}
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
