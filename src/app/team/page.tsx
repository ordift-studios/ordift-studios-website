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

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 pt-6 sm:pt-8 pb-6 sm:pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Centered header, deliberately restrained (2026-08-24 —
              "the portraits should be the hero of this page,
              approximately 60% of the visual attention, the intro
              approximately 40%"). Smaller heading scale and tighter
              spacing than a typical page header — still premium/
              editorial, just clearly secondary to the carousel below.
              Position of the header itself is correct and untouched —
              only the gap below it keeps growing (2026-08-24 third
              follow-up) so the whole carousel/bottom-row cluster
              redistributes downward and the portrait reads as more
              vertically centered within the section. */}
          <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-12">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-2">
              {about.teamEyebrow}
            </p>
            <h1 className="font-serif font-medium text-section-heading sm:text-section-heading-tablet mb-3">
              {about.teamHeadline}
            </h1>
            {introParagraph && (
              <p className="font-sans text-body-small text-white/70 max-w-3xl mx-auto">{introParagraph}</p>
            )}
          </div>

          {teamMembers.length > 0 ? (
            <MeetTheTeamSection members={teamMembers} />
          ) : (
            <p className="font-sans text-body-small text-white/50 text-center">Team profiles coming soon.</p>
          )}

          {/* Bottom row (2026-08-24) — "The Minds Behind the Scenes" and
              "Join Our Team" now share one visual row beneath the
              carousel instead of the label sitting on its own in a
              corner. Centered label via the 3-column grid (an empty left
              cell balances the CTA's width) rather than flex, so the
              label stays genuinely centered regardless of the CTA's own
              width; stacks on mobile. Anchored closer to the section's
              own bottom edge — smaller section bottom padding below it
              (tightened again, 2026-08-24 third follow-up) so it reads
              as the floor of this composition, not floating mid-page,
              without growing the section's total height. */}
          <div className="mt-10 sm:mt-12 flex flex-col items-center gap-4 sm:grid sm:grid-cols-3 sm:items-center">
            <span aria-hidden="true" className="hidden sm:block" />
            <p className="font-sans text-caption tracking-[0.15em] text-white/25 select-none text-center order-1 sm:order-none">
              THE MINDS BEHIND THE SCENES
            </p>
            <div className="order-2 sm:order-none sm:justify-self-end">
              <Link
                href="/careers"
                className="font-sans text-body-small font-semibold text-white hover:text-ordift-gold transition-colors underline underline-offset-4"
              >
                Join Our Team →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
