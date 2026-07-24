import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import { contentRepository } from "@/lib/content";

// Copy sourced verbatim from the approved Brand Bible (sections 1, 4, 5, 6
// — website versions), locked 2026-07-23, migrated into Sanity 2026-07-24
// (Version 1.2.6). Company Timeline is intentionally omitted: no real
// dates have been confirmed yet (zero-invention rule / empty-state rule,
// Brand Bible section 7/Part F). Team section leads with the studio
// collectively rather than a founder biography (direction changed
// 2026-07-23) — full founder bio lives at /about/founder instead.

export async function generateMetadata(): Promise<Metadata> {
  const about = await contentRepository.getAboutPage();
  return {
    title: about.seo.metaTitle ?? "About — Ordift Studios",
    description:
      about.seo.metaDescription ??
      "Ordift Studios is a multidisciplinary creative house — our story, mission, vision, values and team.",
  };
}

export default async function AboutPage() {
  const about = await contentRepository.getAboutPage();

  return (
    <main>
      <NavBar />

      {/* Page header */}
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            {about.heroEyebrow}
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-3xl">
            {about.heroHeadline}
          </h1>
        </div>
      </section>

      {/* Our Story */}
      <section id="story" className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              {about.storyEyebrow}
            </p>
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-6">
              {about.storyHeadline}
            </h2>
            <div className="font-sans text-body lg:text-body-desktop text-ordift-ink-muted space-y-4">
              {about.storyBody.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section id="mission-vision" className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10">
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              Mission
            </p>
            <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink leading-relaxed">
              {about.mission}
            </p>
          </div>
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
              Vision
            </p>
            <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink leading-relaxed">
              {about.vision}
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section id="values" className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            Our Values
          </p>
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-8 sm:mb-10">
            What doesn&apos;t bend under deadline pressure
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 sm:gap-8">
            {about.values.map((v) => (
              <div key={v.name}>
                <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-2">
                  {v.name}
                </p>
                <p className="font-sans text-body-small text-ordift-ink-muted">
                  {v.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team — leads with the studio collectively, not a single founder
          biography (direction changed 2026-07-23). Full founder bio moved
          to /about/founder, kept ready for later rather than deleted. */}
      <section id="team" className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
              {about.teamEyebrow}
            </p>
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop mb-6">
              {about.teamHeadline}
            </h2>
            <div className="font-sans text-body lg:text-body-desktop text-white/80 space-y-4">
              {about.teamBody.map((paragraph, i) => (
                <p key={i}>
                  {paragraph}
                  {i === about.teamBody.length - 1 && (
                    <>
                      {" "}
                      <Link
                        href="/about/founder"
                        className="text-ordift-gold hover:text-ordift-gold-hover underline underline-offset-4"
                      >
                        Read more about our founder →
                      </Link>
                    </>
                  )}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20 text-center">
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
