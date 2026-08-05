import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { contentRepository } from "@/lib/content";
import ResponsiveImage from "@/components/media/ResponsiveImage";

// Held for later, not linked prominently from the main nav or homepage —
// per 2026-07-23 direction: the public About page leads with the studio
// as a team, not a single founder biography. This page keeps that content
// ready for whenever it's wanted more prominently. Copy sourced verbatim
// from the approved Brand Bible section 8 (website version), migrated
// into Sanity 2026-07-24 (Version 1.2.6).

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

export const metadata: Metadata = {
  title: "Founder — Ordift Studios",
  description: "Myredlive Anim-Tetey, Founder and Creative Director of Ordift Studios.",
  alternates: { canonical: `${SITE_URL}/about/founder` },
};

export default async function FounderPage() {
  const founder = await contentRepository.getFounder();

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 sm:gap-12 items-start">
          {founder.photoUrl ? (
            <ResponsiveImage
              src={founder.photoUrl}
              alt={founder.name}
              aspectRatio="4/5"
              sizes="(min-width: 768px) 280px, 100vw"
              className="rounded-xl"
            />
          ) : (
            <div className="aspect-[4/5] rounded-xl bg-white/10" />
          )}
          <div>
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
              {founder.title}
            </p>
            <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop mb-6">
              {founder.name}
            </h1>
            <div className="font-sans text-body lg:text-body-desktop text-white/80 space-y-4 max-w-2xl">
              {founder.bio.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
