import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import DepartmentCard from "@/components/DepartmentCard";
import PortfolioHeroSlideshow from "@/components/portfolio/PortfolioHeroSlideshow";
import AboutPreview from "@/components/home/AboutPreview";
import { contentRepository } from "@/lib/content";
import { getSlideshowProjects } from "@/lib/content/portfolioHelpers";

// Testimonials, Trusted-By/Clients, and Talent Spotlight are still
// intentionally omitted — no approved real testimonials/clients exist yet
// (empty-state rule, Brand Bible section on CMS guardrails) and Talent's
// public directory is Phase 1B. Newsletter is omitted until the Tier 1
// form backend exists.
//
// Homepage/About/Team restructuring (2026-08-24) — the standalone "Who
// We Are" band and the Featured Work section (which had returned
// 2026-08-05 once a real project existed) are both replaced by
// AboutPreview: one coherent Who We Are -> Mission -> Vision -> Values
// introduction leading into the new dedicated /team page. Featured
// Work's underlying `featured` selection mechanism on PortfolioProject
// is completely untouched — it's just no longer surfaced here; its
// approved future home remains the Stories/Journal experience.
//
// Ordift Originals also moved off the Homepage the same day, onto
// /journal (Stories) — same home.originals* Sanity fields, unchanged
// data, just relocated presentation; see src/app/journal/page.tsx.
// Homepage flow is now: Hero -> AboutPreview -> Departments -> Process
// -> closing CTA -> Footer.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

export async function generateMetadata(): Promise<Metadata> {
  const home = await contentRepository.getHomePage();
  return {
    title: home.seo.metaTitle ?? "Ordift Studios — A Multidisciplinary Creative House",
    description:
      home.seo.metaDescription ??
      "Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system.",
    alternates: { canonical: SITE_URL },
  };
}

export default async function Home() {
  const [home, about, services, portfolioProjects] = await Promise.all([
    contentRepository.getHomePage(),
    contentRepository.getAboutPage(),
    contentRepository.getServices(),
    contentRepository.getPortfolioProjects(),
  ]);
  const departments = [...services].sort((a, b) => a.displayOrder - b.displayOrder);
  // Homepage opening experience — full-screen photographic slideshow.
  // Primary source (2026-08-23): Admin/Super-Admin-curated
  // landscape/portrait slides (home.slideshowSlides — already filtered to
  // enabled-only and fallback-resolved by getHomePage() itself, see
  // repository.ts). Legacy fallback, unchanged and still computed every
  // render: getSlideshowProjects() — featured projects first, then
  // remaining published projects, image-hero-only, deduped, capped at 8.
  // PortfolioHeroSlideshow itself decides which to use (curated whenever
  // non-empty, else this) — see its own prop docs — so the live homepage
  // is never left without a working slideshow, including before any
  // curated slide has been added yet.
  const heroSlideshowProjects = getSlideshowProjects(portfolioProjects);
  // AboutPreview's Mission/Vision photo bands (2026-08-24) — reuse real,
  // genuinely published portfolio photography rather than inventing new
  // imagery. Explicitly excludes anything titled "[SAMPLE] ..." — this
  // Staging dataset's current portfolio content is entirely QA/sample
  // placeholder entries (confirmed by direct query), not real client
  // work, so using any of it here would be presenting fabricated
  // imagery as genuine Ordift photography. Degrades to no image (a
  // clean navy band, matching Our Mission's own current fallback) when
  // no real photography exists yet — see the deployment report for
  // exactly what's needed to light these bands up with real photos.
  const realImageProjects = portfolioProjects.filter(
    (p) => p.heroMedia.type === "image" && p.heroMedia.url && !p.title.startsWith("[SAMPLE]")
  );
  const missionImage = realImageProjects[0]?.heroMedia.url
    ? { url: realImageProjects[0].heroMedia.url, alt: realImageProjects[0].heroMedia.alt }
    : null;
  const visionImage = realImageProjects[1]?.heroMedia.url
    ? { url: realImageProjects[1].heroMedia.url, alt: realImageProjects[1].heroMedia.alt }
    : null;

  return (
    <main>
      {/* NavBar + slideshow share this positioning context so the nav can
          sit absolutely on top of the full-viewport photograph (its
          `transparent` mode) instead of pushing it down the page. Every
          other page keeps NavBar in normal flow (transparent defaults to
          false there), unaffected by this. */}
      <div className="relative">
        <NavBar transparent />
        <PortfolioHeroSlideshow projects={heroSlideshowProjects} slides={home.slideshowSlides} variant="hero" />
      </div>

      <AboutPreview
        whoWeAreEyebrow={home.whoWeAreEyebrow}
        whoWeAreBody={home.whoWeAreBody}
        mission={about.mission}
        vision={about.vision}
        valuesStatement="What doesn't bend under deadline pressure"
        missionImage={missionImage}
        visionImage={visionImage}
      />

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
