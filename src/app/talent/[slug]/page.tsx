import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import Button from "@/components/Button";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import JustifiedPhotoGallery from "@/components/portfolio/JustifiedPhotoGallery";
import VideoPlayer from "@/components/portfolio/VideoPlayer";
import TalentProfileTabs from "@/components/talent/TalentProfileTabs";
import TalentShortlistButton from "@/components/talent/TalentShortlistButton";
import TalentShortlistTray from "@/components/talent/TalentShortlistTray";
import { contentRepository } from "@/lib/content";

// Ordift Talent — TALENT-SYS-2B, Phase 4 (2026-09-08). Individual
// talent profile — Grid information hierarchy (Part 8), Atelier-grade
// hero, Dossier-ready client actions. Digitals are deliberately NOT
// rendered here: they are casting-reference assets shared narrowly via
// a Comp Card / Casting Board send (private talent-media Storage
// bucket, TALENT-SYS-1), never displayed on an unauthenticated public
// page — the Digitals tab explains this rather than exposing them.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const talent = await contentRepository.getTalentProfileBySlug(slug);
  if (!talent) return {};
  const title = `${talent.name} — Ordift Talent`;
  const description = talent.introduction || [talent.category, talent.location].filter(Boolean).join(" · ") || `${talent.name}, represented by Ordift Studios.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/talent/${talent.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/talent/${talent.slug}`, images: talent.heroImage ? [{ url: talent.heroImage.url }] : undefined },
    twitter: { card: "summary_large_image", title, description },
  };
}

const INFO_ROWS = (info: NonNullable<Awaited<ReturnType<typeof contentRepository.getTalentProfileBySlug>>>["publicInfo"]) =>
  [
    ["Height", info.heightCm ? `${info.heightCm} cm` : null],
    ["Bust / Chest", info.bustCm ? `${info.bustCm} cm` : null],
    ["Waist", info.waistCm ? `${info.waistCm} cm` : null],
    ["Hips", info.hipCm ? `${info.hipCm} cm` : null],
    ["Shoe", info.shoeEu ? `EU ${info.shoeEu}` : null],
    ["Hair", info.hairColor],
    ["Eyes", info.eyeColor],
    ["Languages", info.languages.length ? info.languages.join(", ") : null],
    ["Travel", info.travelReady === null ? null : info.travelReady ? "Available" : "Not currently available"],
  ] as const;

export default async function TalentProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const talent = await contentRepository.getTalentProfileBySlug(slug);
  if (!talent) notFound();

  const infoRows = INFO_ROWS(talent.publicInfo).filter(([, value]) => value);
  const isNewFace = talent.developmentStage === "new_faces";

  return (
    <main>
      <NavBar />

      <section className="relative bg-ordift-navy-950">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-0">
          <div className="relative aspect-[3/4] lg:aspect-auto">
            <ResponsiveImage
              src={talent.heroImage?.url ?? null}
              alt={talent.heroImage?.alt || talent.name}
              width={talent.heroImage?.width}
              height={talent.heroImage?.height}
              lqip={talent.heroImage?.lqip}
              aspectRatio="3/4"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
            />
          </div>
          <div className="flex flex-col justify-center px-4 sm:px-8 py-12 lg:py-0 text-white">
            {isNewFace ? (
              <p className="font-sans text-caption font-semibold uppercase tracking-[0.15em] text-ordift-gold mb-3">New Faces</p>
            ) : null}
            <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-white mb-3">{talent.name}</h1>
            <p className="font-sans text-body text-white/70 mb-1">{[talent.category, talent.location].filter(Boolean).join(" — ")}</p>
            {talent.availabilityNote ? <p className="font-sans text-caption uppercase tracking-[0.08em] text-ordift-gold-hover mt-3">{talent.availabilityNote}</p> : null}
            {talent.introduction ? <p className="font-sans text-body-small text-white/60 mt-6 max-w-md">{talent.introduction}</p> : null}
            <div className="flex flex-wrap gap-3 mt-8">
              <Button href={`/book?talent=${encodeURIComponent(talent.name)}`} variant="primary">
                Request Booking
              </Button>
              <TalentShortlistButton slug={talent.slug} />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto">
          <TalentProfileTabs
            panels={{
              portfolio:
                talent.gallery.length > 0 ? (
                  <JustifiedPhotoGallery images={talent.gallery} />
                ) : (
                  <p className="font-sans text-body-small text-ordift-ink-muted italic py-8">
                    {isNewFace ? "Portfolio in development — check back as new work is added." : "No portfolio work has been published yet."}
                  </p>
                ),
              digitals: (
                <div className="py-8 max-w-md">
                  <p className="font-sans text-body-small text-ordift-ink-muted">
                    Digitals (casting reference imagery) are shared directly with clients for a specific booking or casting request, rather than published publicly.
                  </p>
                  <Button href={`/book?talent=${encodeURIComponent(talent.name)}`} variant="secondary" className="mt-4">
                    Request Digitals
                  </Button>
                </div>
              ),
              reel:
                talent.reelEmbedUrl ? (
                  <div className="max-w-2xl">
                    <VideoPlayer
                      media={{ type: "embed", url: talent.reelEmbedUrl, alt: `${talent.name} — Reel`, width: null, height: null, lqip: null, poster: null }}
                      poster={talent.heroImage}
                      playLabel="Play Reel"
                    />
                  </div>
                ) : (
                  <p className="font-sans text-body-small text-ordift-ink-muted italic py-8">No reel has been published yet.</p>
                ),
              info:
                infoRows.length > 0 ? (
                  <dl className="max-w-md divide-y divide-black/10">
                    {infoRows.map(([label, value]) => (
                      <div key={label} className="flex justify-between py-3">
                        <dt className="font-sans text-body-small text-ordift-ink-muted">{label}</dt>
                        <dd className="font-sans text-body-small font-semibold text-ordift-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="font-sans text-body-small text-ordift-ink-muted italic py-8">No public casting information has been published yet.</p>
                ),
            }}
          />
        </div>
      </section>

      <Footer />
      <TalentShortlistTray />
    </main>
  );
}
