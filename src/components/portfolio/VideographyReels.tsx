import VideoPlayer from "./VideoPlayer";
import type { MediaAsset, PresentationImage } from "@/lib/content/types";

// Reels / Short Cuts (2026-08-23, Videography) — conditional: renders
// nothing when the project has none (see VideographyProjectView.tsx).
// A horizontal scroll-snap row is deliberately used for BOTH desktop
// and mobile — it's a genuine swipe gesture on touch devices and a
// natural drag/scroll on desktop, with no separate responsive logic
// needed, and it never forces a vertical 9:16 clip into a landscape box
// the way a plain grid of equal-width tiles would.
export default function VideographyReels({
  reels,
  fallbackPoster,
}: {
  reels: MediaAsset[];
  fallbackPoster: PresentationImage | null;
}) {
  if (reels.length === 0) return null;

  return (
    <section className="px-4 sm:px-8 py-10 sm:py-14">
      <div className="max-w-6xl mx-auto">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-5">Reels</p>
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth">
          {reels.map((reel, i) => (
            <div key={`${reel.url}-${i}`} className="snap-start shrink-0 w-[200px] sm:w-[240px]">
              <VideoPlayer media={reel} poster={reel.poster ?? fallbackPoster} playLabel="Play Reel" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
