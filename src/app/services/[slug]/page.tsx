import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import { contentRepository } from "@/lib/content";

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
  return {
    title: service.seo.metaTitle ?? `${service.name} — Ordift Studios`,
    description: service.seo.metaDescription ?? service.summaryDescription,
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

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto">
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

      {service.additionalHeading && service.additionalItems.length > 0 && (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
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
        className={`px-4 sm:px-8 py-14 sm:py-20 text-center ${
          service.additionalHeading ? "bg-white" : "bg-ordift-offwhite"
        }`}
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
