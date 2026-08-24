import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import MeetTheTeamSection from "@/components/about/MeetTheTeamSection";
import { contentRepository } from "@/lib/content";
import { getPublicTeamMembers } from "@/lib/team/getPublicTeamMembers";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Meet the Team — Ordift Studios";
  const description =
    "The creative minds behind Ordift Studios — a team working across photography, film, design, branding, content and talent as one connected studio.";
  const canonical = `${SITE_URL}/team`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

// Dedicated public Team page (2026-08-24) — split out of the full About
// page so Meet the Team has its own destination, reached via the
// Homepage's "Meet the Minds Behind the Scenes ->" CTA rather than
// living inside the editorial About story. Reuses the exact same
// carousel/modal implementation already tested and approved on the old
// About page location (MeetTheTeamSection/MeetTheTeamCarousel/
// TeamMemberModal, getPublicTeamMembers()) — nothing about the portrait
// system, visibility gating, ordering, or identity fallback changed;
// only where it's mounted did.
//
// Intro copy reuses the existing approved aboutPage.teamEyebrow/
// teamHeadline/teamBody[0] verbatim — only the first teamBody paragraph
// is shown here (not the second, which names the Founder specifically):
// this page's introduction deliberately doesn't single out one person
// as the studio's sole creative force, per direction. The Founder
// paragraph itself is untouched in Sanity, simply not rendered on this
// particular page — same "preserved, not exposed" treatment Founder
// already has elsewhere on the site.
export default async function TeamPage() {
  const [about, teamMembers] = await Promise.all([contentRepository.getAboutPage(), getPublicTeamMembers()]);
  const introParagraph = about.teamBody[0] ?? null;

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-12 sm:mb-16">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
              {about.teamEyebrow}
            </p>
            <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop mb-6">
              {about.teamHeadline}
            </h1>
            {introParagraph && <p className="font-sans text-body lg:text-body-desktop text-white/80">{introParagraph}</p>}
          </div>

          {teamMembers.length > 0 ? (
            <div className="relative">
              <MeetTheTeamSection members={teamMembers} />
              <p className="hidden sm:block absolute -bottom-2 right-2 font-sans text-caption tracking-[0.15em] text-white/25 select-none">
                THE MINDS BEHIND THE SCENES
              </p>
            </div>
          ) : (
            <p className="font-sans text-body-small text-white/50">Team profiles coming soon.</p>
          )}

          <div className="flex justify-end mt-14 sm:mt-20">
            <Link
              href="/book?service=general"
              className="font-sans text-body-small font-semibold text-white hover:text-ordift-gold transition-colors underline underline-offset-4"
            >
              Join Our Team →
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
