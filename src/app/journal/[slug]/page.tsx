import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import SocialShare from "@/components/SocialShare";
import JournalPostCard from "@/components/journal/JournalPostCard";
import { contentRepository } from "@/lib/content";
import { estimateReadingTime, formatDate } from "@/lib/content/journalHelpers";

export async function generateStaticParams() {
  const posts = await contentRepository.getJournalPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await contentRepository.getJournalPostBySlug(slug);
  if (!post) return {};
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    title: post.seo.metaTitle ?? `${post.title} — Ordift Studios Stories`,
    description: post.seo.metaDescription ?? post.excerpt,
    alternates: { canonical: post.seo.canonicalUrl ?? `${siteUrl}/journal/${post.slug}` },
    openGraph: post.seo.ogImageUrl ? { images: [post.seo.ogImageUrl] } : undefined,
  };
}

export default async function JournalPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await contentRepository.getJournalPostBySlug(slug);
  if (!post) notFound();

  const [allPosts, categories, authors, allProjects, allWorkshops] = await Promise.all([
    contentRepository.getJournalPosts(),
    contentRepository.getJournalCategories(),
    contentRepository.getAuthors(),
    contentRepository.getPortfolioProjects(),
    contentRepository.getWorkshops(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const author = authors.find((a) => a.id === post.authorId) ?? null;
  const postCategories = categories.filter((c) => post.categoryIds.includes(c.id));
  const relatedPosts = allPosts.filter((p) => post.relatedPostIds.includes(p.id));
  const relatedProjects = allProjects.filter((p) => post.relatedProjectIds.includes(p.id));
  const relatedWorkshops = allWorkshops.filter((w) => post.relatedWorkshopIds.includes(w.id));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const shareUrl = post.seo.canonicalUrl ?? `${siteUrl}/journal/${post.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": post.format === "video" ? "VideoObject" : "Article",
    headline: post.title,
    description: post.seo.metaDescription ?? post.excerpt,
    url: shareUrl,
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    ...(author ? { author: { "@type": "Person", name: author.name } } : {}),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-3xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Stories
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop mb-4">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {postCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/journal?category=${cat.slug}`}
                className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-white/10 text-white/80 hover:bg-white/15"
              >
                {cat.name}
              </Link>
            ))}
            {post.featured && (
              <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold/20 text-ordift-gold">
                Featured
              </span>
            )}
          </div>
          <p className="font-sans text-body-small text-white/60">
            {[author?.name, formatDate(post.publishedAt), `${estimateReadingTime(post.body)} min read`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </section>

      <div className="aspect-[21/9] bg-ordift-navy-900/10" role="img" aria-label={post.heroImage.alt} />

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-3xl mx-auto">
          {post.format === "video" && post.videoUrl && (
            <div className="aspect-video rounded-lg bg-ordift-navy-900/10 mb-8" role="img" aria-label="Video article" />
          )}

          <p className="font-sans text-body text-ordift-ink whitespace-pre-line mb-10">{post.body}</p>

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10 pb-10 border-b border-black/10">
              {post.tags.map((t) => (
                <Link
                  key={t}
                  href={`/journal?tag=${t}`}
                  className="inline-flex items-center min-h-7 px-2.5 rounded-full bg-ordift-offwhite font-sans text-caption text-ordift-ink-muted hover:bg-ordift-navy-950/5"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}

          {author && (
            <Link
              href={`/journal/authors/${author.slug}`}
              className="flex items-center gap-4 rounded-lg border border-black/10 p-4 mb-10 hover:border-black/20 transition-colors"
            >
              <div className="w-14 h-14 rounded-full bg-ordift-navy-900/10 shrink-0" />
              <div>
                <p className="font-sans font-medium text-body-small text-ordift-ink">
                  {author.name}
                  {author.isPlaceholder && (
                    <span className="ml-2 font-sans text-caption text-ordift-gold-pressed">
                      (Placeholder)
                    </span>
                  )}
                </p>
                <p className="font-sans text-caption text-ordift-ink-muted">{author.title}</p>
              </div>
            </Link>
          )}

          <SocialShare url={shareUrl} title={post.title} />
        </div>
      </section>

      {(relatedProjects.length > 0 || relatedWorkshops.length > 0) && (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-10">
          <div className="max-w-3xl mx-auto flex flex-wrap gap-3">
            {relatedProjects.map((p) => (
              <Link
                key={p.id}
                href={`/work/${p.slug}`}
                className="inline-flex items-center min-h-11 px-5 rounded-full border border-black/15 font-sans text-body-small text-ordift-ink hover:border-black/30"
              >
                Related project: {p.title} →
              </Link>
            ))}
            {relatedWorkshops.map((w) => (
              <Link
                key={w.id}
                href={`/workshops/${w.slug}`}
                className="inline-flex items-center min-h-11 px-5 rounded-full border border-black/15 font-sans text-body-small text-ordift-ink hover:border-black/30"
              >
                Related workshop: {w.title} →
              </Link>
            ))}
          </div>
        </section>
      )}

      {relatedPosts.length > 0 && (
        <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Related Stories
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {relatedPosts.map((related) => (
                <JournalPostCard
                  key={related.id}
                  post={related}
                  categories={related.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  author={authors.find((a) => a.id === related.authorId) ?? null}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
