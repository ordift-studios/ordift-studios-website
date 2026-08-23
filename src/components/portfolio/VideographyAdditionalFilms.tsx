import VideoPlayer from "./VideoPlayer";
import type { MediaAsset, PresentationImage } from "@/lib/content/types";

// Additional Films (2026-08-23, Videography) — conditional: renders
// nothing when the project has none (see VideographyProjectView.tsx).
// Visually secondary to the Main Film (smaller grid tiles vs. the
// Main Film's full-bleed treatment) but still a premium poster-then-
// play presentation, not a plain link list.
export default function VideographyAdditionalFilms({
  films,
  fallbackPoster,
}: {
  films: MediaAsset[];
  fallbackPoster: PresentationImage | null;
}) {
  if (films.length === 0) return null;

  return (
    <section className="px-4 sm:px-8 py-10 sm:py-14">
      <div className="max-w-6xl mx-auto">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-5">
          Additional Films
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {films.map((film, i) => (
            <div key={`${film.url}-${i}`}>
              <VideoPlayer media={film} poster={film.poster ?? fallbackPoster} playLabel={film.alt || "Play"} />
              {film.alt && <p className="mt-2 font-sans text-caption text-white/60">{film.alt}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
