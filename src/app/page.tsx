import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import DepartmentCard from "@/components/DepartmentCard";
import { contentRepository } from "@/lib/content";

// Featured Work, Testimonials, Trusted-By/Clients, and Talent Spotlight are
// intentionally omitted — no approved real projects/testimonials/clients
// exist yet (empty-state rule, Brand Bible section on CMS guardrails) and
// Talent's public directory is Phase 1B. Newsletter is omitted until the
// Tier 1 form backend exists. Sections come back once each has real content
// or a working form behind it — not before.

export async function generateMetadata(): Promise<Metadata> {
  const home = await contentRepository.getHomePage();
  return {
    title: home.seo.metaTitle ?? "Ordift Studios — A Multidisciplinary Creative House",
    description:
      home.seo.metaDescription ??
      "Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system.",
  };
}

export default async function Home() {
  const [home, services] = await Promise.all([
    contentRepository.getHomePage(),
    contentRepository.getServices(),
  ]);
  const departments = [...services].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <main>
      <NavBar />

      {/* Hero */}
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            {home.heroEyebrow}
          </p>
          <h1 className="font-serif font-medium text-hero sm:text-hero-tablet lg:text-hero-desktop leading-[var(--text-hero--line-height)] sm:leading-[var(--text-hero-tablet--line-height)] lg:leading-[var(--text-hero-desktop--line-height)] mb-6 max-w-4xl">
            {home.heroHeadline}
          </h1>
          <p className="font-sans text-body lg:text-body-desktop text-white/80 max-w-2xl mb-8">
            {home.heroSubheadline}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button href={home.heroPrimaryCta.href} variant="primary">
              {home.heroPrimaryCta.label}
            </Button>
            <Button
              href={home.heroSecondaryCta.href}
              variant="secondary"
              className="!border-white/30 !text-white"
            >
              {home.heroSecondaryCta.label}
            </Button>
          </div>
        </div>
      </section>

      {/* Who We Are */}
      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              {home.whoWeAreEyebrow}
            </p>
            <p className="font-sans text-body lg:text-body-desktop text-ordift-ink-muted">
              {home.whoWeAreBody}
            </p>
          </div>
        </div>
      </section>

      {/* Departments */}
      <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            Departments
          </p>
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
            Explore our departments
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {departments.map((d) => (
              <DepartmentCard
                key={d.id}
                name={d.name}
                description={d.summaryDescription}
                href={`/services/${d.slug}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Ordift Originals — landing/teaser only, no unconfirmed titles */}
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
              {home.originalsEyebrow}
            </p>
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop mb-4">
              {home.originalsHeadline}
            </h2>
            <p className="font-sans text-body text-white/80">{home.originalsBody}</p>
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            Our Process
          </p>
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
            From discovery to delivery
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 sm:gap-4">
            {home.process.map((p, i) => (
              <div key={p.step}>
                <p className="font-sans text-caption text-ordift-gold-pressed mb-2">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="font-serif font-medium text-card-title text-ordift-ink mb-2">
                  {p.step}
                </p>
                <p className="font-sans text-body-small text-ordift-ink-muted">
                  {p.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-ordift-ink mb-4">
            {home.ctaHeadline}
          </h2>
          <p className="font-sans text-body text-ordift-ink-muted mb-8">{home.ctaBody}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button href={home.ctaPrimary.href} variant="primary">
              {home.ctaPrimary.label}
            </Button>
            <Button href={home.ctaSecondary.href} variant="secondary">
              {home.ctaSecondary.label}
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
