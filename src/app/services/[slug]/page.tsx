import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";
import PortfolioCard from "@/components/portfolio/PortfolioCard";
import { contentRepository } from "@/lib/content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

// Single dynamic route replacing 7 near-identical static pages (migrated
// 2026-07-24, Version 1.2.6) — consistent with the Workshops/Portfolio/
// Stories pattern already established. Existing URLs are unchanged:
// each Service.slug matches the route the static page used to occupy
// (/services/photography, /services/talent-management, etc.).

export async function generateStaticParams() {
  const services = await contentRepository.getServices();
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = await contentRepository.getServiceBySlug(slug);
  if (!service) return {};
  const title = service.seo.metaTitle ?? `${service.name} — Ordift Studios`;
  const description = service.seo.metaDescription ?? service.summaryDescription;
  const canonical = `${SITE_URL}/services/${service.slug}`;
  const images = [`${SITE_URL}/opengraph-image`];
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = await contentRepository.getServiceBySlug(slug);
  if (!service) notFound();

  // Sections below alternate white/offwhite for visual rhythm. Featured
  // Work is new (MediaPlaceholder strip) and sits between "What We
  // Offer" (always white) and the optional additionalHeading/CTA
  // sections, so their backgrounds are computed rather than hardcoded —
  // hardcoding them would silently produce two same-color sections back
  // to back whenever Featured Work renders (every non-isComingSoon
  // service).
  const showFeaturedWork = !service.isComingSoon;
  const [allProjects, categories] = showFeaturedWork
    ? await Promise.all([contentRepository.getPortfolioProjects(), contentRepository.getPortfolioCategories()])
    : [[], []];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const matchingProjects = allProjects.filter((p) => p.disciplines.includes(service.slug)).slice(0, 3);
  let lastBg: "white" | "offwhite" = showFeaturedWork ? "offwhite" : "white";
  const showAdditional = Boolean(service.additionalHeading && service.additionalItems.length > 0);
  const additionalBg = lastBg === "white" ? "offwhite" : "white";
  if (showAdditional) lastBg = additionalBg;
  const ctaBg = lastBg === "white" ? "offwhite" : "white";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.seo.metaDescription ?? service.summaryDescription,
    url: `${SITE_URL}/services/${service.slug}`,
    provider: { "@type": "Organization", name: "Ordift Studios", url: SITE_URL },
    ...(service.offerings.length > 0 ? { hasOfferCatalog: { "@type": "OfferCatalog", name: service.offeringsHeadline, itemListElement: service.offerings.map((o) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: o } })) } } : {}),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-12 items-center">
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
              {service.heroEyebrow}
            </p>
            <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop mb-6">
              {service.heroHeadline}
            </h1>
            <p className="font-sans text-body lg:text-body-desktop text-white/80 max-w-2xl">
              {service.heroBody}
            </p>
          </div>
          <MediaPlaceholder
            aspectRatio="4/5"
            tone="dark"
            label={`${service.name} — Sample Work`}
            className="rounded-2xl w-full max-w-sm mx-auto lg:max-w-none"
          />
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            {service.isComingSoon ? "Talent Categories" : "What We Offer"}
          </p>
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
            {service.offeringsHeadline}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
            {service.offerings.map((c) => (
              <li
                key={c}
                className="font-sans text-body text-ordift-ink-muted border-b border-black/10 pb-3"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {showFeaturedWork && (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              Featured Work
            </p>
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
              A glimpse of what we deliver
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {matchingProjects.length > 0
                ? matchingProjects.map((project) => (
                    <PortfolioCard
                      key={project.id}
                      project={project}
                      categories={project.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                    />
                  ))
                : [0, 1, 2].map((i) => (
                    <MediaPlaceholder key={i} aspectRatio="4/3" tone="light" label={service.name} className="rounded-xl" />
                  ))}
            </div>
          </div>
        </section>
      )}

      {showAdditional && (
        <section className={`px-4 sm:px-8 py-14 sm:py-20 ${additionalBg === "white" ? "bg-white" : "bg-ordift-offwhite"}`}>
          <div className="max-w-6xl mx-auto">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              {service.additionalHeading}
            </p>
            <div className="flex flex-wrap gap-3">
              {service.additionalItems.map((t) => (
                <span
                  key={t}
                  className="font-sans text-body-small text-ordift-ink bg-white border border-black/10 rounded-full px-4 py-2"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <section
        className={`px-4 sm:px-8 py-14 sm:py-20 text-center ${ctaBg === "white" ? "bg-white" : "bg-ordift-offwhite"}`}
      >
        <div className="max-w-2xl mx-auto">
          {service.ctaEyebrow && (
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              {service.ctaEyebrow}
            </p>
          )}
          <h2 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-ordift-ink mb-4">
            {service.ctaHeadline}
          </h2>
          <p className="font-sans text-body text-ordift-ink-muted mb-8">{service.ctaBody}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button
              href={service.isComingSoon ? "/book?service=general" : `/book?service=${service.slug}`}
              variant="primary"
            >
              {service.ctaPrimaryLabel}
            </Button>
            {service.ctaSecondaryLabel && (
              <Button href={`/book?service=${service.slug}`} variant="secondary">
                {service.ctaSecondaryLabel}
              </Button>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
