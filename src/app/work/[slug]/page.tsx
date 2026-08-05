import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import PortfolioCard from "@/components/portfolio/PortfolioCard";
import SocialShare from "@/components/SocialShare";
import TestimonialCard from "@/components/TestimonialCard";
import { contentRepository } from "@/lib/content";
import { DISCIPLINE_HREF, DISCIPLINE_LABEL } from "@/lib/content/portfolioHelpers";
import MediaAsset from "@/components/media/MediaAsset";
import Gallery from "@/components/media/Gallery";
import BeforeAfterGallery from "@/components/media/BeforeAfterGallery";
import { ogImageUrl } from "@/lib/media/ogImageUrl";

export async function generateStaticParams() {
  const projects = await contentRepository.getPortfolioProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await contentRepository.getPortfolioProjectBySlug(slug);
  if (!project) return {};
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const canonicalUrl = project.seo.canonicalUrl ?? `${siteUrl}/work/${project.slug}`;
  const title = project.seo.metaTitle ?? `${project.title} — Ordift Studios Portfolio`;
  const description = project.seo.metaDescription ?? project.story.slice(0, 160);
  // Falls back to the project's own hero image when no dedicated OG image
  // is set — most editors won't remember to fill in a separate
  // social-share image, and the hero is already the right shot. Always
  // resized for social platforms (see ogImageUrl.ts) rather than handed
  // the raw source file.
  const rawImage = project.seo.ogImageUrl ?? project.heroMedia.url;
  // A page that defines its own openGraph/twitter object fully replaces
  // the root layout's — Next.js does not merge in the root's dynamic
  // opengraph-image.tsx for just the missing `images` field (confirmed
  // live, 2026-08-05: an explicit openGraph without `images` still
  // suppressed the root default entirely). So a project with no hero
  // image yet must point at the same branded default explicitly, rather
  // than omitting `images` and hoping it inherits.
  const images = [rawImage ? ogImageUrl(rawImage) : `${siteUrl}/opengraph-image`];
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, type: "article", images },
    // Explicit twitter block — without one, Next.js keeps the root
    // layout's site-wide default (generic title/description/logo) rather
    // than inheriting these project-specific openGraph values. Found live
    // during the 2026-08-05 review: a project shared on Twitter/X showed
    // the site logo and default copy, not this project's photo and title.
    twitter: { card: "summary_large_image", title, description, images },
  };
}

const NARRATIVE_SECTIONS: { key: "objective" | "strategy" | "challenges" | "solution" | "process"; label: string }[] = [
  { key: "objective", label: "Project Objective" },
  { key: "strategy", label: "Creative Strategy" },
  { key: "challenges", label: "Challenges" },
  { key: "solution", label: "Solution" },
  { key: "process", label: "Creative Process" },
];

export default async function PortfolioProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await contentRepository.getPortfolioProjectBySlug(slug);
  if (!project) notFound();

  const [allProjects, categories] = await Promise.all([
    contentRepository.getPortfolioProjects(),
    contentRepository.getPortfolioCategories(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const projectCategories = categories.filter((c) => project.categoryIds.includes(c.id));
  const relatedProjects = allProjects.filter(
    (p) => p.id !== project.id && project.relatedProjectIds.includes(p.id),
  );

  const index = allProjects.findIndex((p) => p.id === project.id);
  const prevProject = index > 0 ? allProjects[index - 1] : null;
  const nextProject = index >= 0 && index < allProjects.length - 1 ? allProjects[index + 1] : null;

  const [allWorkshops, allTestimonials] = await Promise.all([
    contentRepository.getWorkshops(),
    contentRepository.getTestimonials(),
  ]);
  // No self-exclusion needed: workshops and portfolio projects are distinct
  // content types with distinct ids, so a workshop can never equal the project.
  const relatedWorkshops = allWorkshops.filter((w) => project.relatedWorkshopIds.includes(w.id));
  const testimonials = allTestimonials.filter((t) => project.testimonialIds.includes(t.id));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const shareUrl = project.seo.canonicalUrl ?? `${siteUrl}/work/${project.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: project.title,
    description: project.seo.metaDescription ?? project.story,
    url: shareUrl,
    ...(project.year ? { dateCreated: String(project.year) } : {}),
    ...(project.location ? { locationCreated: project.location } : {}),
    ...(project.client ? { creditText: `Client: ${project.client}` } : {}),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Portfolio
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">
            {project.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {project.disciplines.map((d) => (
              <Link
                key={d}
                href={DISCIPLINE_HREF[d]}
                className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-white/10 text-white/80 hover:bg-white/15"
              >
                {DISCIPLINE_LABEL[d]}
              </Link>
            ))}
            {project.featured && (
              <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold/20 text-ordift-gold">
                Featured
              </span>
            )}
            {/* project.isPasswordProtected intentionally not surfaced here — it's a
                metadata flag with no real access enforcement behind it, so showing a
                "Client Access Only" badge on a page anyone can already load was
                confusing/contradictory. Revisit once real enforcement exists. */}
          </div>
        </div>
      </section>

      <MediaAsset media={project.heroMedia} aspectRatio="21/9" sizes="100vw" priority />

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-16">
          <div>
            <p className="font-sans text-body text-ordift-ink mb-8 whitespace-pre-line">
              {project.story}
            </p>

            {NARRATIVE_SECTIONS.filter((section) => project[section.key]).map((section) => (
              <div key={section.key} className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-2">
                  {section.label}
                </h2>
                <p className="font-sans text-body-small text-ordift-ink-muted whitespace-pre-line">
                  {project[section.key]}
                </p>
              </div>
            ))}

            {project.collaborators.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  Collaborators
                </h2>
                <ul className="flex flex-wrap gap-x-6 gap-y-2">
                  {project.collaborators.map((c) => (
                    <li key={c.id} className="font-sans text-body-small text-ordift-ink">
                      <span className="font-medium">{c.name}</span>{" "}
                      <span className="text-ordift-ink-muted">— {c.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {project.deliverables.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  Deliverables
                </h2>
                <ul className="flex flex-col gap-2">
                  {project.deliverables.map((item, i) => (
                    <li key={i} className="font-sans text-body-small text-ordift-ink flex gap-2">
                      <span className="text-ordift-gold-pressed">—</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {project.results && (
              <div className="mb-8 rounded-lg bg-ordift-offwhite p-5">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-2">
                  Results &amp; Impact
                </h2>
                <p className="font-sans text-body-small text-ordift-ink-muted">{project.results}</p>
              </div>
            )}

            {(project.awards.length > 0 || project.publications.length > 0) && (
              <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {project.awards.length > 0 && (
                  <div>
                    <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Awards</h2>
                    <ul className="flex flex-col gap-2">
                      {project.awards.map((a) => (
                        <li key={a.id} className="font-sans text-body-small text-ordift-ink">
                          {a.title} <span className="text-ordift-ink-muted">— {a.issuer}{a.year ? `, ${a.year}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {project.publications.length > 0 && (
                  <div>
                    <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                      Publications
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {project.publications.map((p) =>
                        p.url ? (
                          <li key={p.id}>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
                            >
                              {p.name}
                            </a>
                          </li>
                        ) : (
                          <li key={p.id} className="font-sans text-body-small text-ordift-ink">
                            {p.name}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {project.gallery.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  Final Gallery
                </h2>
                {/* Nested inside this page's ~55%-width content column (not full
                    viewport width) from `lg` up — the default `sizes` guess assumes
                    full-bleed and was requesting a much larger image than the tile
                    actually renders at. Found during the 2026-08-05 review. */}
                <Gallery
                  images={project.gallery}
                  columns={3}
                  sizes="(min-width: 1024px) 18vw, (min-width: 640px) 33vw, 50vw"
                />
              </div>
            )}

            {project.videos.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Videos</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {project.videos.map((video, i) => (
                    <MediaAsset key={i} media={video} aspectRatio="16/9" className="rounded-lg" />
                  ))}
                </div>
              </div>
            )}

            {project.behindTheScenesGallery.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  Behind the Scenes
                </h2>
                <Gallery
                  images={project.behindTheScenesGallery}
                  columns={3}
                  sizes="(min-width: 1024px) 18vw, (min-width: 640px) 33vw, 50vw"
                />
              </div>
            )}

            {project.beforeAfterGallery.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  Before &amp; After
                </h2>
                <BeforeAfterGallery pairs={project.beforeAfterGallery} />
              </div>
            )}

            {project.downloadableAssets.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Downloads</h2>
                <ul className="flex flex-col gap-2">
                  {project.downloadableAssets.map((asset) => (
                    <li key={asset.id}>
                      <a
                        href={asset.url}
                        className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
                      >
                        {asset.label} ({asset.fileType})
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {testimonials.length > 0 && (
              <div className="mb-8">
                <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">
                  What the client says
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {testimonials.map((t) => (
                    <TestimonialCard key={t.id} testimonial={t} />
                  ))}
                </div>
              </div>
            )}

            <SocialShare url={shareUrl} title={project.title} />
          </div>

          <div>
            <div className="rounded-xl border border-black/10 bg-ordift-offwhite p-5 sm:p-6">
              <dl className="flex flex-col gap-4">
                {project.client && (
                  <div>
                    <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                      Client
                    </dt>
                    <dd className="font-sans text-body-small text-ordift-ink">{project.client}</dd>
                  </div>
                )}
                {project.year && (
                  <div>
                    <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                      Year
                    </dt>
                    <dd className="font-sans text-body-small text-ordift-ink">{project.year}</dd>
                  </div>
                )}
                {project.location && (
                  <div>
                    <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                      Location
                    </dt>
                    <dd className="font-sans text-body-small text-ordift-ink">{project.location}</dd>
                  </div>
                )}
                {project.servicesProvided.length > 0 && (
                  <div>
                    <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                      Services Provided
                    </dt>
                    <dd className="font-sans text-body-small text-ordift-ink">
                      {project.servicesProvided.join(", ")}
                    </dd>
                  </div>
                )}
                {project.equipmentUsed.length > 0 && (
                  <div>
                    <dt className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted mb-1">
                      Equipment Used
                    </dt>
                    <dd className="font-sans text-body-small text-ordift-ink">
                      {project.equipmentUsed.join(", ")}
                    </dd>
                  </div>
                )}
              </dl>

              {projectCategories.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-black/10">
                  {projectCategories.map((cat) => (
                    <Link
                      key={cat.id}
                      href={`/work?category=${cat.slug}`}
                      className="inline-flex items-center min-h-8 px-3 rounded-full border border-black/15 font-sans text-caption text-ordift-ink hover:border-black/30"
                    >
                      {cat.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ordift-offwhite px-4 sm:px-8 py-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          {prevProject ? (
            <Link
              href={`/work/${prevProject.slug}`}
              className="font-sans text-body-small text-ordift-ink hover:text-ordift-gold-pressed"
            >
              ← {prevProject.title}
            </Link>
          ) : (
            <span />
          )}
          {nextProject && (
            <Link
              href={`/work/${nextProject.slug}`}
              className="font-sans text-body-small text-ordift-ink hover:text-ordift-gold-pressed text-right"
            >
              {nextProject.title} →
            </Link>
          )}
        </div>
      </section>

      {relatedProjects.length > 0 && (
        <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Related Projects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {relatedProjects.map((related) => (
                <PortfolioCard
                  key={related.id}
                  project={related}
                  categories={related.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {relatedWorkshops.length > 0 && (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Related Workshops
            </h2>
            <div className="flex flex-wrap gap-4">
              {relatedWorkshops.map((w) => (
                <Link
                  key={w.id}
                  href={`/workshops/${w.slug}`}
                  className="inline-flex items-center min-h-11 px-5 rounded-full border border-black/15 font-sans text-body-small text-ordift-ink hover:border-black/30"
                >
                  {w.title} →
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
