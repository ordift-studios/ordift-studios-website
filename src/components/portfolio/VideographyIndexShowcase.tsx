import Link from "next/link";
import Image from "next/image";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";

// Videography's cinematic showcase index (2026-08-23) — deliberately
// not Photography's strips or a generic card grid: full-bleed poster
// "screenings" with an editorial alternating rhythm (full-bleed, then
// a large inset composition, repeating) rather than mechanically
// identical tiles. Clicking opens the project page itself — this
// increment does not turn the index into a collection of players (see
// the redesign report for why hover-preview video was deliberately
// left out).
export type VideographyShowcaseProject = {
  id: string;
  slug: string;
  title: string;
  categoryName: string | null;
  year: number | null;
  poster: { url: string; alt: string; focalX: number; focalY: number } | null;
};

export default function VideographyIndexShowcase({ projects }: { projects: VideographyShowcaseProject[] }) {
  return (
    <div className="bg-ordift-navy-950">
      {projects.map((project, i) => {
        const fullBleed = i % 2 === 0;
        return (
          <Link
            key={project.id}
            href={`/work/${project.slug}`}
            className={`group relative block w-full overflow-hidden ${
              fullBleed
                ? "h-[70vh] sm:h-[88vh] border-b border-white/10 last:border-b-0"
                : "h-[55vh] sm:h-[68vh] max-w-4xl mx-auto my-8 sm:my-12 rounded-sm"
            }`}
          >
            {project.poster?.url ? (
              <Image
                src={project.poster.url}
                alt=""
                fill
                sizes="100vw"
                priority={i === 0}
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                style={{ objectPosition: `${project.poster.focalX}% ${project.poster.focalY}%` }}
              />
            ) : (
              <MediaPlaceholder tone="dark" aspectRatio="auto" className="absolute inset-0" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,14,24,0.85)] via-[rgba(10,14,24,0.15)] to-transparent" />
            <div className="absolute inset-0 bg-[rgba(255,255,255,0.04)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 motion-reduce:transition-none" />
            <div className="relative h-full flex flex-col justify-end px-6 sm:px-10 pb-10 sm:pb-14">
              {project.categoryName && (
                <p className="font-sans font-semibold uppercase tracking-[0.2em] text-caption text-ordift-gold mb-2">
                  {project.categoryName}
                </p>
              )}
              <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-white mb-4 max-w-2xl">
                {project.title}
              </p>
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[rgba(255,255,255,0.12)] transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                  <svg width="10" height="12" viewBox="0 0 10 12" fill="none" aria-hidden="true">
                    <path d="M0 0.5L10 6L0 11.5V0.5Z" fill="var(--color-gold)" />
                  </svg>
                </span>
                <span className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-white/80">
                  View Project
                </span>
                {project.year && <span className="font-sans text-caption text-white/40">{project.year}</span>}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
