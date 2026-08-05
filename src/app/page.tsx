import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import DepartmentCard from "@/components/DepartmentCard";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import PortfolioCard from "@/components/portfolio/PortfolioCard";
import { contentRepository } from "@/lib/content";

// Testimonials, Trusted-By/Clients, and Talent Spotlight are still
// intentionally omitted — no approved real testimonials/clients exist yet
// (empty-state rule, Brand Bible section on CMS guardrails) and Talent's
// public directory is Phase 1B. Newsletter is omitted until the Tier 1
// form backend exists. Featured Work came back 2026-08-05 once a real,
// approved portfolio project existed — see the section below, which
// follows the exact same "render nothing if empty" rule as /work's own
// Featured Projects section (src/app/work/page.tsx) rather than a new
// pattern.

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
  const [home, services, portfolioProjects, portfolioCategories] = await Promise.all([
    contentRepository.getHomePage(),
    contentRepository.getServices(),
    contentRepository.getPortfolioProjects(),
    contentRepository.getPortfolioCategories(),
  ]);
  const departments = [...services].sort((a, b) => a.displayOrder - b.displayOrder);
  const featuredProjects = portfolioProjects.filter((p) => p.featured);
  const categoryById = new Map(portfolioCategories.map((c) => [c.id, c]));
  // The homepage's own dedicated heroImage field (added 2026-08-05) takes
  // priority once someone sets it in Sanity; until then, borrow the
  // hero image from the first Featured project — real proof of work
  // instead of the branded placeholder, with zero extra content-entry
  // step. Falls through to the placeholder only if neither exists yet.
  const featuredHeroImage = featuredProjects.find((p) => p.heroMedia.type === "image")?.heroMedia;
  const heroVisual = home.heroImage.url ? home.heroImage : (featuredHeroImage ?? home.heroImage);

  return (
    <main>
      <NavBar />

      {/* Hero */}
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-12 items-center">
          <div>
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
          <ResponsiveImage
            src={heroVisual.url}
            alt={heroVisual.alt || "Ordift Studios signature campaign visual"}
            width={heroVisual.width}
            height={heroVisual.height}
            lqip={heroVisual.lqip}
            aspectRatio="4/5"
            sizes="(min-width: 1024px) 40vw, 90vw"
            priority
            className="rounded-2xl w-full max-w-sm mx-auto lg:max-w-none"
          />
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

      {/* Featured Work — renders nothing when no project is marked Featured yet,
          same empty-state rule as /work's own Featured Projects section. */}
      {featuredProjects.length > 0 && (
        <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              Featured Work
            </p>
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
              Recent work
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mb-8">
              {featuredProjects.map((project) => (
                <PortfolioCard
                  key={project.id}
                  project={project}
                  categories={project.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                />
              ))}
            </div>
            <Button href="/work" variant="secondary">
              View All Work
            </Button>
          </div>
        </section>
      )}

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
