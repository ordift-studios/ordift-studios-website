import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import TalentRosterCard from "@/components/talent/TalentRosterCard";
import { contentRepository } from "@/lib/content";

// Ordift Talent — TALENT-SYS-2B, Phase 3 (2026-09-08). "Our Roster" —
// not "Meet the Roster" (Part 4): representation and belonging, not an
// anonymous directory. Atelier-influenced editorial opening, transitioning
// into The Grid's disciplined card architecture. Reads Sanity only
// (published talentProfile documents) — the private Supabase record
// never reaches this public route.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const PAGE_TITLE = "Our Roster — Ordift Talent";
const PAGE_DESCRIPTION = "The talent Ordift Studios represents — fashion, commercial and editorial work, presented and managed as an active representation.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/talent` },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESCRIPTION, url: `${SITE_URL}/talent` },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

export default async function TalentRosterPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const allTalent = await contentRepository.getTalentProfiles();

  // Category chips are derived from real published profiles only —
  // never a hard-coded taxonomy (Part 7). An admin adding a new
  // category in Talent Management, then publishing a profile with it
  // in Sanity, is all it takes for a new chip to appear here.
  const categories = [...new Set(allTalent.map((t) => t.category).filter((c): c is string => Boolean(c)))].sort();
  const filtered = category ? allTalent.filter((t) => t.category === category) : allTalent;

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">Talent</p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl mb-4">Our Roster.</h1>
          <p className="font-sans text-body text-white/70 max-w-xl">
            The people Ordift represents — presented the way we present our own work, and managed the way we manage every engagement.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-6xl mx-auto">
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-8">
              <Link
                href="/talent"
                className={`inline-block rounded-full px-4 py-2 font-sans text-caption font-semibold uppercase tracking-[0.05em] ${!category ? "bg-ordift-navy-950 text-ordift-gold" : "bg-ordift-navy-950/5 text-ordift-ink-muted"}`}
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c}
                  href={`/talent?category=${encodeURIComponent(c)}`}
                  className={`inline-block rounded-full px-4 py-2 font-sans text-caption font-semibold uppercase tracking-[0.05em] ${category === c ? "bg-ordift-navy-950 text-ordift-gold" : "bg-ordift-navy-950/5 text-ordift-ink-muted"}`}
                >
                  {c}
                </Link>
              ))}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <div className="py-16 text-center max-w-md mx-auto">
              <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">Our Roster is being prepared.</p>
              <p className="font-sans text-body-small text-ordift-ink-muted">
                Ordift Studios is founder-led and works with selected talent per engagement — profiles appear here once approved for public representation.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
              {filtered.map((talent) => (
                <TalentRosterCard key={talent.id} talent={talent} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
