import Link from "next/link";
import Image from "next/image";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";
import type { PortfolioProject } from "@/lib/content/types";

// Graphic Design's own "Next Project" visual treatment (2026-08-24) —
// mirrors VideographyNextFilm.tsx's pattern (a real visual card, not
// just a text link) but in Graphic Design's light, restrained register
// rather than Videography's dark cinematic one. Reuses the same poster
// resolution order: the deliberately-chosen Portfolio Cover Image
// first, falling back to a real image-type Hero Media.
function posterFor(project: PortfolioProject) {
  if (project.coverImage) return project.coverImage;
  if (project.heroMedia.type === "image" && project.heroMedia.url) {
    return { url: project.heroMedia.url, alt: project.heroMedia.alt, focalX: 50, focalY: 50 };
  }
  return null;
}

export default function GraphicDesignNextProject({
  prevProject,
  nextProject,
}: {
  prevProject: PortfolioProject | null;
  nextProject: PortfolioProject | null;
}) {
  if (!prevProject && !nextProject) return null;
  const poster = nextProject ? posterFor(nextProject) : null;

  return (
    <section className="bg-[#f7f6f4] border-t border-black/5">
      {nextProject && (
        <Link href={`/work/${nextProject.slug}`} className="group relative block w-full h-[50vh] sm:h-[60vh] overflow-hidden">
          {poster ? (
            <Image
              src={poster.url}
              alt=""
              fill
              sizes="100vw"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              style={{ objectPosition: `${poster.focalX}% ${poster.focalY}%` }}
            />
          ) : (
            <MediaPlaceholder tone="light" aspectRatio="auto" className="absolute inset-0" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
          <div className="relative h-full flex flex-col items-center justify-end text-center px-4 pb-10 sm:pb-14">
            <p className="font-sans font-semibold uppercase tracking-[0.25em] text-caption text-ordift-gold mb-3">
              Next Project
            </p>
            <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-white max-w-xl">
              {nextProject.title}
            </p>
          </div>
        </Link>
      )}
      {prevProject && (
        <div className={`px-4 sm:px-8 py-6 text-center ${nextProject ? "border-t border-black/5" : ""}`}>
          <Link href={`/work/${prevProject.slug}`} className="font-sans text-body-small text-ordift-ink-muted hover:text-ordift-ink">
            ← Previous: {prevProject.title}
          </Link>
        </div>
      )}
    </section>
  );
}
