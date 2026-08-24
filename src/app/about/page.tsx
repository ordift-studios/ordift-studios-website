import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import MeetTheTeamSection from "@/components/about/MeetTheTeamSection";
import { contentRepository } from "@/lib/content";
import { getPublicTeamMembers } from "@/lib/team/getPublicTeamMembers";

// Copy sourced verbatim from the approved Brand Bible (sections 1, 4, 5, 6
// — website versions), locked 2026-07-23, migrated into Sanity 2026-07-24
// (Version 1.2.6). Company Timeline is intentionally omitted: no real
// dates have been confirmed yet (zero-invention rule / empty-state rule,
// Brand Bible section 7/Part F).
//
// Editorial redesign (2026-08-24) — same approved Sanity-managed copy
// throughout (heroEyebrow/heroHeadline/storyEyebrow/storyHeadline/
// storyBody/mission/vision/values/teamEyebrow/teamHeadline/teamBody/
// ctaHeadline/ctaBody are byte-for-byte the same fields as before), only
// the visual presentation changed: an editorial progression (Who We Are
// -> Our Story -> Mission & Vision -> Values -> Meet the Team -> a
// closing collaboration transition) instead of a stack of identically-
// treated bands. The public Founder link that used to close the Team
// paragraph has been removed here (Founder stays a preserved/deferred
// feature, per direction — the /about/founder page itself still exists
// and works, it simply isn't linked to from anywhere public right now).
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

export default async function AboutPage() {
  const [about, teamMembers] = await Promise.all([contentRepository.getAboutPage(), getPublicTeamMembers()]);

  return (
    <main>
      <NavBar />

      {/* Who We Are — an editorial opening, not "ABOUT US / hero image /
          paragraph": an oversized, deliberately asymmetric headline with
          generous negative space rather than a centered navy band. No
          imagery here — none exists yet to show honestly, and inventing
          one would break the zero-invention rule this page's own
          history already established (see file header). */}
      <section className="px-4 sm:px-8 pt-20 sm:pt-28 pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.25em] text-eyebrow text-ordift-gold-pressed mb-6">
            {about.heroEyebrow}
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-ordift-ink max-w-4xl md:ml-[8%] leading-[1.1]">
            {about.heroHeadline}
          </h1>
        </div>
      </section>

      {/* Our Story — offset reading column rather than a full-width
          centered block, so it reads like a magazine feature, not a
          corporate mission statement. */}
      <section id="story" className="bg-ordift-offwhite px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
          <div className="md:col-span-3">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed">
              {about.storyEyebrow}
            </p>
          </div>
          <div className="md:col-span-8 md:col-start-4">
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-6">
              {about.storyHeadline}
            </h2>
            <div className="font-sans text-body lg:text-body-desktop text-ordift-ink-muted space-y-4 max-w-2xl">
              {about.storyBody.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision — asymmetric composition: Mission carries more
          visual weight and sits higher; Vision is narrower and offset
          lower, rather than two identical side-by-side cards. Stacks
          in natural reading order on tablet/mobile. */}
      <section id="mission-vision" className="bg-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-6">
          <div className="md:col-span-7">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4">
              Mission
            </p>
            <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink leading-snug">
              {about.mission}
            </p>
          </div>
          <div className="md:col-span-4 md:col-start-9 md:mt-20">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-4">
              Vision
            </p>
            <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink leading-relaxed">
              {about.vision}
            </p>
          </div>
        </div>
      </section>

      {/* Values — an indexed/numbered list reading like studio
          principles, not product-feature cards. */}
      <section id="values" className="bg-ordift-offwhite px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-4xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
            Our Values
          </p>
          <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-ordift-ink mb-10 sm:mb-14">
            What doesn&apos;t bend under deadline pressure
          </h2>
          <div className="divide-y divide-ordift-ink/10">
            {about.values.map((v, i) => (
              <div key={v.name} className="flex gap-6 sm:gap-10 py-6 sm:py-8">
                <span className="font-serif font-light text-page-title text-ordift-ink/15 leading-none shrink-0 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-1.5">
                    {v.name}
                  </p>
                  <p className="font-sans text-body-small text-ordift-ink-muted max-w-xl">{v.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Meet the Team — leads with the existing approved studio-wide
          copy, then the carousel of real, admin-curated profiles (only
          rendered once at least one exists — see MeetTheTeamSection).
          "The Minds Behind the Scenes" is an intentionally quiet aside
          near the transition, not a headline — Meet the Team itself
          remains the clear functional cue. */}
      <section id="team" className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-12 sm:mb-16">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
              {about.teamEyebrow}
            </p>
            <h2 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop mb-6">
              {about.teamHeadline}
            </h2>
            <div className="font-sans text-body lg:text-body-desktop text-white/80 space-y-4">
              {about.teamBody.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>

          {teamMembers.length > 0 && (
            <div className="relative">
              <MeetTheTeamSection members={teamMembers} />
              <p className="hidden sm:block absolute -bottom-2 right-2 font-sans text-caption tracking-[0.15em] text-white/25 select-none">
                THE MINDS BEHIND THE SCENES
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Closing collaboration transition */}
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
