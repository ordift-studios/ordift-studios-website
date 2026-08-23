import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { contentRepository } from "@/lib/content";
import { DISCIPLINE_HREF, DISCIPLINE_LABEL } from "@/lib/content/portfolioHelpers";
import { resolvePrimaryDiscipline } from "@/lib/content/portfolioTreatment";
import MediaAsset from "@/components/media/MediaAsset";
import PhotographyProjectView from "@/components/portfolio/PhotographyProjectView";
import VideographyProjectView from "@/components/portfolio/VideographyProjectView";
import GraphicDesignProjectView from "@/components/portfolio/GraphicDesignProjectView";
import GenericProjectView from "@/components/portfolio/GenericProjectView";
import PortfolioProjectFooterSections from "@/components/portfolio/PortfolioProjectFooterSections";
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

  // Discipline-scoped prev/next (2026-08-23, extended for Videography) —
  // Photography and Videography each stay within their own discipline
  // so browsing never jumps from one into an unrelated Graphic
  // Design/Branding project. Every other discipline keeps the exact
  // prior behavior — navProjects falls back to the full,
  // undifferentiated list, a no-op change for Graphic Design and the
  // rest.
  const primaryDiscipline = resolvePrimaryDiscipline(project);
  const SCOPED_NAV_DISCIPLINES = new Set(["photography", "videography"]);
  const navProjects =
    primaryDiscipline && SCOPED_NAV_DISCIPLINES.has(primaryDiscipline)
      ? allProjects.filter((p) => resolvePrimaryDiscipline(p) === primaryDiscipline)
      : allProjects;
  const index = navProjects.findIndex((p) => p.id === project.id);
  const prevProject = index > 0 ? navProjects[index - 1] : null;
  const nextProject = index >= 0 && index < navProjects.length - 1 ? navProjects[index + 1] : null;

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

  // Photography/Videography/Graphic Design each get their own full page
  // shape — work-first, no sidebar metadata dashboard — rather than
  // sharing the shell below (Portfolio redesign, completed 2026-08-12).
  // Only disciplines without a dedicated view yet (branding,
  // content-creation, talent-management, production) still use the
  // original shell + GenericProjectView, unchanged.
  const disciplineViewProps = {
    project,
    categories: projectCategories,
    testimonials,
    shareUrl,
    jsonLd,
    prevProject,
    nextProject,
    relatedProjects,
    relatedWorkshops,
    categoryById,
  };
  if (primaryDiscipline === "photography") {
    return <PhotographyProjectView {...disciplineViewProps} />;
  }
  if (primaryDiscipline === "videography") {
    return <VideographyProjectView {...disciplineViewProps} />;
  }
  if (primaryDiscipline === "graphic-design") {
    return <GraphicDesignProjectView {...disciplineViewProps} />;
  }

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
            {/* Only disciplines without a dedicated view yet reach this
                shell now — Photography/Videography/Graphic Design all
                return their own full page above. */}
            <GenericProjectView project={project} testimonials={testimonials} shareUrl={shareUrl} />
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

      <PortfolioProjectFooterSections
        prevProject={prevProject}
        nextProject={nextProject}
        relatedProjects={relatedProjects}
        relatedWorkshops={relatedWorkshops}
        categoryById={categoryById}
      />

      <Footer />
    </main>
  );
}
