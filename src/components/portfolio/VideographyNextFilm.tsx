import Link from "next/link";
import Image from "next/image";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";
import type { PortfolioProject } from "@/lib/content/types";

// A strong visual "Next Film" presentation (2026-08-23, Videography) —
// the next project's own poster (Portfolio Cover Image, the same field
// used everywhere else as poster; falls back to a real image-type Hero
// Media, then a placeholder — never left blank) rather than only a
// small text link. Previous stays a plain, quieter link underneath —
// still reachable, deliberately secondary.
function posterFor(project: PortfolioProject) {
  if (project.coverImage) return project.coverImage;
  if (project.heroMedia.type === "image" && project.heroMedia.url) {
    return {
      url: project.heroMedia.url,
      alt: project.heroMedia.alt,
      focalX: 50,
      focalY: 50,
    };
  }
  return null;
}

export default function VideographyNextFilm({
  prevProject,
  nextProject,
}: {
  prevProject: PortfolioProject | null;
  nextProject: PortfolioProject | null;
}) {
  if (!prevProject && !nextProject) return null;
  const poster = nextProject ? posterFor(nextProject) : null;

  return (
    <section className="bg-ordift-navy-950">
      {nextProject && (
        <Link href={`/work/${nextProject.slug}`} className="group relative block w-full h-[60vh] sm:h-[70vh] overflow-hidden">
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
            <MediaPlaceholder tone="dark" aspectRatio="auto" className="absolute inset-0" />
          )}
          <div className="absolute inset-0 bg-[rgba(10,14,24,0.5)] transition-colors duration-300 group-hover:bg-[rgba(10,14,24,0.35)] motion-reduce:transition-none" />
          <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
            <p className="font-sans font-semibold uppercase tracking-[0.25em] text-caption text-ordift-gold mb-3">
              Next Film
            </p>
            <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-white max-w-xl">
              {nextProject.title}
            </p>
          </div>
        </Link>
      )}
      {prevProject && (
        <div className={`px-4 sm:px-8 py-6 text-center ${nextProject ? "border-t border-white/10" : ""}`}>
          <Link href={`/work/${prevProject.slug}`} className="font-sans text-body-small text-white/60 hover:text-white">
            ← Previous: {prevProject.title}
          </Link>
        </div>
      )}
    </section>
  );
}
