import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import SocialShare from "@/components/SocialShare";
import JournalPostCard from "@/components/journal/JournalPostCard";
import { contentRepository } from "@/lib/content";
import { estimateReadingTime, formatDate } from "@/lib/content/journalHelpers";
import {
  TRUST_BADGE_LABEL,
  fromJournalPost,
  fromPulseArticle,
} from "@/lib/content/storiesFeed";
import MediaAsset from "@/components/media/MediaAsset";
import Avatar from "@/components/media/Avatar";

// Serves both Studio Stories (journalPost) and Ordift Pulse content
// (pulseArticle) under the same /journal/[slug] route — see
// STORIES_PULSE_INTEGRATION.md for why Pulse renders inside Stories/
// Journal rather than a parallel route tree. The journalPost branch below
// is unchanged from before this integration; the pulseArticle branch is
// new and entirely separate, so existing Stories pages carry zero
// behavior change.

export async function generateStaticParams() {
  const [posts, articles] = await Promise.all([
    contentRepository.getJournalPosts(),
    contentRepository.getPulseArticles(),
  ]);
  return [...posts.map((post) => ({ slug: post.slug })), ...articles.map((article) => ({ slug: article.slug }))];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const post = await contentRepository.getJournalPostBySlug(slug);
  if (post) {
    return {
      title: post.seo.metaTitle ?? `${post.title} — Ordift Studios Stories`,
      description: post.seo.metaDescription ?? post.excerpt,
      alternates: { canonical: post.seo.canonicalUrl ?? `${siteUrl}/journal/${post.slug}` },
      openGraph: {
        images: [post.seo.ogImageUrl ?? post.heroImage.url].filter((url): url is string => Boolean(url)),
      },
    };
  }

  const article = await contentRepository.getPulseArticleBySlug(slug);
  if (article) {
    return {
      title: article.seo.metaTitle ?? `${article.title} — Ordift Studios Stories`,
      description: article.seo.metaDescription ?? article.excerpt,
      alternates: { canonical: article.seo.canonicalUrl ?? `${siteUrl}/journal/${article.slug}` },
      openGraph: {
        images: [article.seo.ogImageUrl ?? article.heroMedia.url].filter((url): url is string => Boolean(url)),
      },
    };
  }

  return {};
}

export default async function JournalPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const post = await contentRepository.getJournalPostBySlug(slug);

  if (post) {
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
    const relatedPosts = allPosts.filter((p) => p.id !== post.id && post.relatedPostIds.includes(p.id));
    const relatedProjects = allProjects.filter((p) => post.relatedProjectIds.includes(p.id));
    const relatedWorkshops = allWorkshops.filter((w) => post.relatedWorkshopIds.includes(w.id));

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

        <MediaAsset media={post.heroImage} aspectRatio="21/9" sizes="100vw" priority />

        <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-3xl mx-auto">
            {post.format === "video" && post.videoUrl && (
              <MediaAsset
                media={{ url: post.videoUrl, type: "embed", alt: "Video article" }}
                aspectRatio="16/9"
                className="rounded-lg mb-8"
              />
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
                <Avatar src={author.photoUrl} alt={author.name} size={56} />
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
                    post={fromJournalPost(related)}
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

  const article = await contentRepository.getPulseArticleBySlug(slug);
  if (!article) notFound();

  const [allArticles, journalCategories, pulseCategories, pulseOpportunityTypes, pulseSources, authors, allProjects, allWorkshops] =
    await Promise.all([
      contentRepository.getPulseArticles(),
      contentRepository.getJournalCategories(),
      contentRepository.getPulseCategories(),
      contentRepository.getPulseOpportunityTypes(),
      contentRepository.getPulseSources(),
      contentRepository.getAuthors(),
      contentRepository.getPortfolioProjects(),
      contentRepository.getWorkshops(),
    ]);
  const categoryById = new Map([...journalCategories, ...pulseCategories].map((c) => [c.id, c]));
  const opportunityTypeById = new Map(pulseOpportunityTypes.map((o) => [o.id, o]));
  const sourceById = new Map(pulseSources.map((s) => [s.id, s]));
  const author = article.authorId ? authors.find((a) => a.id === article.authorId) ?? null : null;
  const articleCategories = [...journalCategories, ...pulseCategories].filter((c) => article.categoryIds.includes(c.id));
  const articleOpportunityTypes = pulseOpportunityTypes.filter((o) => article.opportunityTypeIds.includes(o.id));
  const relatedArticles = allArticles.filter(
    (a) => a.id !== article.id && article.relatedArticleIds.includes(a.id),
  );
  const relatedProjects = allProjects.filter((p) => article.relatedProjectIds.includes(p.id));
  const relatedWorkshops = allWorkshops.filter((w) => article.relatedWorkshopIds.includes(w.id));
  const item = fromPulseArticle(article, opportunityTypeById, sourceById);

  const shareUrl = article.seo.canonicalUrl ?? `${siteUrl}/journal/${article.slug}`;
  const showSourceLink = (article.origin === "curated" || article.origin === "community") && article.sourceUrl;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.seo.metaDescription ?? article.excerpt,
    url: shareUrl,
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
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
            {article.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {articleCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/journal?category=${cat.slug}`}
                className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-white/10 text-white/80 hover:bg-white/15"
              >
                {cat.name}
              </Link>
            ))}
            <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold/20 text-ordift-gold">
              {TRUST_BADGE_LABEL[item.trustBadge]}
            </span>
            {article.featured && (
              <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold/20 text-ordift-gold">
                Featured
              </span>
            )}
          </div>
          <p className="font-sans text-body-small text-white/60">
            {[author?.name, formatDate(article.publishedAt), `${item.readingTimeMinutes} min read`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </section>

      <MediaAsset media={article.heroMedia} aspectRatio="21/9" sizes="100vw" priority />

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-3xl mx-auto">
          <p className="font-sans text-body text-ordift-ink whitespace-pre-line mb-6">{article.body}</p>

          {showSourceLink && (
            <a
              href={article.sourceUrl!}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center min-h-11 px-5 rounded-full border border-black/15 font-sans text-body-small text-ordift-ink hover:border-black/30 mb-10"
            >
              {article.sourceAttribution ? `Read more — ${article.sourceAttribution}` : "Read more at the source"} →
            </a>
          )}

          {article.contentKind === "opportunity" && (
            <div className="rounded-lg border border-black/10 p-5 mb-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {articleOpportunityTypes.length > 0 && (
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  {articleOpportunityTypes.map((o) => (
                    <span
                      key={o.id}
                      className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-navy-950/5 text-ordift-ink-muted"
                    >
                      {o.name}
                    </span>
                  ))}
                </div>
              )}
              {article.applicationDeadline && (
                <div>
                  <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                    Application Deadline
                  </p>
                  <p className="font-sans text-body-small text-ordift-ink">{formatDate(article.applicationDeadline)}</p>
                </div>
              )}
              {(article.eventStartDate || article.eventEndDate) && (
                <div>
                  <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                    Event Dates
                  </p>
                  <p className="font-sans text-body-small text-ordift-ink">
                    {formatDate(article.eventStartDate)}
                    {article.eventEndDate ? ` – ${formatDate(article.eventEndDate)}` : ""}
                  </p>
                </div>
              )}
              {article.location && (
                <div>
                  <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Location</p>
                  <p className="font-sans text-body-small text-ordift-ink">{article.location}</p>
                </div>
              )}
              {article.eligibility && (
                <div className="sm:col-span-2">
                  <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">Eligibility</p>
                  <p className="font-sans text-body-small text-ordift-ink">{article.eligibility}</p>
                </div>
              )}
              {article.applyUrl && (
                <a
                  href={article.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:col-span-2 inline-flex items-center justify-center min-h-11 px-5 rounded-lg bg-ordift-navy-950 text-white font-sans text-body-small"
                >
                  Apply / More Info →
                </a>
              )}
            </div>
          )}

          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-10 pb-10 border-b border-black/10">
              {article.tags.map((t) => (
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
              <Avatar src={author.photoUrl} alt={author.name} size={56} />
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

          <SocialShare url={shareUrl} title={article.title} />
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

      {relatedArticles.length > 0 && (
        <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Related Stories
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {relatedArticles.map((related) => (
                <JournalPostCard
                  key={related.id}
                  post={fromPulseArticle(related, opportunityTypeById, sourceById)}
                  categories={related.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                  author={related.authorId ? authors.find((a) => a.id === related.authorId) ?? null : null}
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
