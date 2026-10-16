import type { Metadata } from "next";
import type { CSSProperties } from "react";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import { contentRepository } from "@/lib/content";
import { Band, type BandImage } from "@/components/home/AboutPreview";

// Copy sourced verbatim from the approved Brand Bible (sections 1, 4, 5, 6
// — website versions), locked 2026-07-23, migrated into Sanity 2026-07-24
// (Version 1.2.6). Company Timeline is intentionally omitted: no real
// dates have been confirmed yet (zero-invention rule / empty-state rule,
// Brand Bible section 7/Part F).
//
// Editorial redesign (2026-08-24) — same approved Sanity-managed copy
// throughout (heroEyebrow/heroHeadline/storyEyebrow/storyHeadline/
// storyBody/mission/vision/values are byte-for-byte the same fields as
// before), an editorial progression: Who We Are -> Our Story -> Mission
// & Vision -> Values -> a closing collaboration transition.
//
// Four-view restructure (2026-10-18, Founder-specified): the opening headline block is gone — the first line under the site header is the
// section navigation. View 1 = Our Story; view 2 = Who We Are, Our Mission, Our Vision; view 3 = Our Values then Our Process; view 4 = the
// approved closing call to action (unchanged). On desktop each of the first three views fills about one viewport; below lg they simply grow.
// Every word comes from the same CMS fields as before. No new imagery was added: the Mission and Vision photographs are the two already
// assigned in Admin -> Portfolio -> Homepage About Visuals, and Our Story has no assigned photograph, so it stays typographic.
//
// Team split out (2026-08-24) — Meet the Team now has its own dedicated
// page (/team, reached via the Homepage's "Meet the Minds Behind the
// Scenes ->" CTA) rather than living inside this editorial story; this
// page no longer fetches team members or renders teamEyebrow/
// teamHeadline/teamBody at all (those Sanity fields are untouched, just
// no longer read here — see /team/page.tsx for where they moved).
// storyBody was also rewritten (2026-08-24) to present Ordift's origin
// as a collective story rather than centering one named individual —
// see the memory/decision log for the before/after text.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

export async function generateMetadata(): Promise<Metadata> {
  const about = await contentRepository.getAboutPage();
  const title = about.seo.metaTitle ?? "About — Ordift Studios";
  const description =
    about.seo.metaDescription ??
    "Ordift Studios is a multidisciplinary creative house — our story, mission, vision, values and team.";
  const canonical = `${SITE_URL}/about`;
  const images = [`${SITE_URL}/opengraph-image`];
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

const SECTION_LINKS = [
  { label: "Who We Are", href: "#who-we-are" },
  { label: "Our Process", href: "#process" },
  { label: "Mission", href: "#mission" },
  { label: "Vision", href: "#vision" },
  { label: "Values", href: "#values" },
] as const;

// Heading style for the in-page scroll targets: focusable by script (tabIndex -1) so keyboard and screen-reader users land on the heading, with a
// small scroll margin so it never sits flush against the top edge (the site header scrolls away with the page; it is not fixed).
const TARGET = "scroll-mt-6 focus:outline-none";

export default async function AboutPage() {
  const [about, home] = await Promise.all([contentRepository.getAboutPage(), contentRepository.getHomePage()]);
  // The Mission / Vision background photographs were assigned in Admin -> Portfolio -> Homepage About Visuals. They keep the same blurred-photo
  // treatment and the same wording; until an admin assigns either photograph its band shows the approved solid-navy fallback.
  const bandImage = (img: typeof home.aboutMissionImage): BandImage =>
    img ? { url: img.url, alt: img.alt, focalX: img.focalX, focalY: img.focalY } : null;
  const missionImage = bandImage(home.aboutMissionImage);
  const visionImage = bandImage(home.aboutVisionImage);
  const columns = (n: number) => ({ "--cols": Math.min(Math.max(n, 1), 6) }) as CSSProperties;

  return (
    <main id="about-page">
      {/* Smooth in-page scrolling for the section navigation, only while this page is shown and only when the visitor has not asked for reduced
          motion (reduced-motion visitors jump straight to the heading). */}
      <style>{"@media (prefers-reduced-motion: no-preference){html:has(#about-page){scroll-behavior:smooth}}"}</style>
      <NavBar />

      {/* View 1 — section navigation (the first line under the site header) and Our Story. The navigation belongs to this view; it is not a
          fifth section. About one desktop viewport tall (viewport minus the 84px site header). */}
      <section id="story" aria-labelledby="story-heading" className="bg-ordift-offwhite px-4 sm:px-8 flex flex-col lg:min-h-[calc(100svh-5.25rem)]">
        <nav aria-label="On this page" className="max-w-6xl w-full mx-auto pt-6 sm:pt-8 pb-5 border-b border-ordift-ink/10">
          <ul className="flex flex-wrap justify-center gap-x-5 sm:gap-x-1 gap-y-0 font-sans text-caption sm:text-body-small uppercase tracking-[0.16em] text-ordift-ink-muted">
            {SECTION_LINKS.map((l, i) => (
              <li key={l.href} className="flex items-center">
                {i > 0 && <span aria-hidden="true" className="hidden sm:block mx-4 h-3 w-px bg-ordift-ink/25" />}
                <a
                  href={l.href}
                  className="inline-block py-2 border-b border-transparent hover:text-ordift-ink hover:border-ordift-gold focus-visible:outline-none focus-visible:text-ordift-ink focus-visible:border-ordift-gold transition-colors"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 flex items-center py-12 sm:py-16 lg:py-10">
          <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
            <div className="lg:col-span-5">
              <h1 id="story-heading" className="font-sans font-semibold uppercase tracking-[0.25em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold-pressed mb-5">
                {about.storyEyebrow}
              </h1>
              <p className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-[2.75rem] xl:text-[3.25rem] text-ordift-ink leading-[1.12] text-balance">
                {about.storyHeadline}
              </p>
            </div>
            <div className="lg:col-span-7 font-sans text-body lg:text-[1.0625rem] lg:leading-[1.65] text-ordift-ink-muted space-y-4">
              {about.storyBody.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* View 2 — Who We Are, Our Mission, Our Vision. The two photograph bands stretch to share the viewport that Who We Are leaves free. */}
      <section id="who-mission-vision" className="bg-white flex flex-col lg:min-h-svh">
        <div className="px-4 sm:px-8 py-12 sm:py-14 lg:py-12">
          <div className="max-w-3xl mx-auto text-center">
            <h2 id="who-we-are" tabIndex={-1} className={`${TARGET} font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4`}>
              {home.whoWeAreEyebrow}
            </h2>
            <p className="font-serif font-medium text-card-title sm:text-card-title-desktop lg:text-section-heading-desktop text-ordift-ink leading-snug">
              {home.whoWeAreBody}
            </p>
          </div>
        </div>
        {/* Kept for bookmarks made before the restructure (the old combined Mission / Vision section was #mission-vision). */}
        <span id="mission-vision" aria-hidden="true" className="block" />
        <Band id="mission" label="Our Mission" copy={about.mission} image={missionImage} className="lg:flex-1 lg:flex lg:items-center lg:py-12" />
        <Band id="vision" label="Our Vision" copy={about.vision} image={visionImage} className="lg:flex-1 lg:flex lg:items-center lg:py-12" />
      </section>

      {/* View 3 — Our Values, then Our Process beneath it. Compact multi-column rows so both fit one desktop viewport; they stack and scroll
          naturally on smaller screens. */}
      <section id="values-process" className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-16 lg:py-12 flex lg:min-h-svh lg:items-center">
        <div className="max-w-6xl w-full mx-auto space-y-14 lg:space-y-14">
          <div>
            <h2 id="values" tabIndex={-1} className={`${TARGET} font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2`}>
              Our Values
            </h2>
            <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-7 lg:mb-8">
              What doesn&apos;t bend under deadline pressure
            </p>
            <ol style={columns(about.values.length)} className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] gap-x-8 gap-y-6 border-t border-ordift-ink/10 pt-6">
              {about.values.map((v, i) => (
                <li key={v.name}>
                  <p className="font-serif font-light text-section-heading-desktop text-ordift-ink/20 leading-none mb-2 tabular-nums">{String(i + 1).padStart(2, "0")}</p>
                  <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-1.5">{v.name}</p>
                  <p className="font-sans text-body-small lg:text-[0.9375rem] text-ordift-ink-muted">{v.copy}</p>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h2 id="process" tabIndex={-1} className={`${TARGET} font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2`}>
              Our Process
            </h2>
            <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-7 lg:mb-8">
              From discovery to delivery
            </p>
            <ol style={columns(home.process.length)} className="grid grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] gap-x-8 gap-y-6 border-t border-ordift-ink/10 pt-6">
              {home.process.map((p, i) => (
                <li key={p.step}>
                  <p className="font-sans text-caption text-ordift-gold-pressed mb-2 tabular-nums">{String(i + 1).padStart(2, "0")}</p>
                  <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-1.5">{p.step}</p>
                  <p className="font-sans text-body-small lg:text-[0.9375rem] text-ordift-ink-muted">{p.copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Closing collaboration transition — follows directly from Values;
          Meet the Team lives on its own page now (see file header). */}
      <section className="bg-white px-4 sm:px-8 py-16 sm:py-24 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-ordift-ink mb-4">
            {about.ctaHeadline}
          </h2>
          <p className="font-sans text-body text-ordift-ink-muted mb-8">{about.ctaBody}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button href="/book" variant="primary">
              Start a Project
            </Button>
            <Button href="/book?service=partnership" variant="secondary">
              Collaborate With Us
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
