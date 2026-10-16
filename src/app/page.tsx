import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import PortfolioHeroSlideshow from "@/components/portfolio/PortfolioHeroSlideshow";
import HeroExploreLinks from "@/components/home/HeroExploreLinks";
import LegacyHomeAnchors from "@/components/home/LegacyHomeAnchors";
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
//
// Homepage restructuring (2026-10-16, Founder-approved): the homepage is now
// ONLY the slideshow (with four small text links at its lower edge) and the
// footer. Nothing was deleted: Who We Are / Mission / Vision / Values live on
// /about, the departments on /services, the process on /process, and the team
// on /team — all from the same CMS fields as before. AboutPreview.tsx is kept
// in the codebase but is no longer rendered here.

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
  const [home, portfolioProjects] = await Promise.all([
    contentRepository.getHomePage(),
    contentRepository.getPortfolioProjects(),
  ]);
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
        <HeroExploreLinks />
      </div>
      <LegacyHomeAnchors />

      <Footer />
    </main>
  );
}
