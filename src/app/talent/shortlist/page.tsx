import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import { contentRepository } from "@/lib/content";

// Ordift Talent — TALENT-SYS-2B, Phase 5 (2026-09-08). Shortlist
// Compare — the public, unauthenticated foundation of the Dossier
// influence (Part 15). Server-rendered from a plain ?slugs= query
// param (the same pattern already used by /work's discipline/category/
// q filters) rather than a new API route or client-side fetch — no new
// surface area, no schema, no auth. Capped at 4 (this session's own
// design-brief recommendation: comparison degrades past that, and a
// curated shortlist has already done the narrowing).
export const metadata: Metadata = { title: "Compare — Ordift Talent", robots: { index: false, follow: true } };

const MAX_COMPARE = 4;

export default async function TalentShortlistPage({ searchParams }: { searchParams: Promise<{ slugs?: string }> }) {
  const { slugs: slugsParam } = await searchParams;
  const requestedSlugs = (slugsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);

  const allTalent = requestedSlugs.length > 0 ? await contentRepository.getTalentProfiles() : [];
  const talents = requestedSlugs.map((slug) => allTalent.find((t) => t.slug === slug)).filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <main>
      <NavBar />

      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-14 sm:py-16">
        <div className="max-w-5xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-4">Talent</p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-white mb-3">Compare.</h1>
          <p className="font-sans text-body text-white/70 max-w-xl">Your private shortlist, side by side — visible only in this browser.</p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-12">
        <div className="max-w-5xl mx-auto">
          {talents.length === 0 ? (
            <div className="py-16 text-center max-w-md mx-auto">
              <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">Nothing shortlisted yet.</p>
              <p className="font-sans text-body-small text-ordift-ink-muted mb-6">Browse Our Roster and shortlist anyone you&apos;d like to compare.</p>
              <Button href="/talent" variant="primary">Browse Our Roster</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <tbody>
                  <tr>
                    <td className="w-32" />
                    {talents.map((t) => (
                      <td key={t.id} className="p-3 align-top">
                        <Link href={`/talent/${t.slug}`} className="block">
                          <ResponsiveImage src={t.heroImage?.url ?? null} alt={t.heroImage?.alt || t.name} width={t.heroImage?.width} height={t.heroImage?.height} lqip={t.heroImage?.lqip} aspectRatio="3/4" sizes="25vw" />
                          <p className="font-serif font-medium text-body text-ordift-ink mt-2">{t.name}</p>
                        </Link>
                      </td>
                    ))}
                  </tr>
                  {(
                    [
                      ["Category", (t: (typeof talents)[number]) => t.category ?? "—"],
                      ["Location", (t: (typeof talents)[number]) => t.location ?? "—"],
                      ["Availability", (t: (typeof talents)[number]) => t.availabilityNote ?? "—"],
                      ["Height", (t: (typeof talents)[number]) => (t.publicInfo.heightCm ? `${t.publicInfo.heightCm} cm` : "—")],
                      ["Travel", (t: (typeof talents)[number]) => (t.publicInfo.travelReady === null ? "—" : t.publicInfo.travelReady ? "Available" : "Not currently available")],
                    ] as const
                  ).map(([label, getValue]) => (
                    <tr key={label} className="border-t border-black/10">
                      <td className="p-3 font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">{label}</td>
                      {talents.map((t) => (
                        <td key={t.id} className="p-3 font-sans text-body-small text-ordift-ink">
                          {getValue(t)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-black/10">
                    <td />
                    {talents.map((t) => (
                      <td key={t.id} className="p-3">
                        <Button href={`/book?talent=${encodeURIComponent(t.name)}`} variant="secondary" className="w-full">
                          Request Booking
                        </Button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
