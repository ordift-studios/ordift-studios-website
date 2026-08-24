import Link from "next/link";
import Image from "next/image";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";
import type { PortfolioProject } from "@/lib/content/types";

// Featured Work's cinematic Journal treatment (Phase E, 2026-08-24) —
// the approved upgrade over a plain PortfolioCard grid: reuses the exact
// full-bleed/gradient-overlay/hover-scale visual grammar already proven
// on GraphicDesignNextProject.tsx/VideographyNextFilm.tsx, applied to
// PortfolioProject.featured items instead of a "next project" link.
// Zero new data — same `featured` flag, same coverImage/focal-point
// system as the rest of Portfolio; this is presentation only.
//
// One dominant band for the most recently featured project; up to two
// more render as a smaller row beneath, matching the "single dominant
// showcase vs. a tasteful row when several" direction — never a rigid
// grid regardless of count. Renders nothing at all when there are no
// featured projects, rather than a placeholder.
function posterFor(project: PortfolioProject) {
  if (project.coverImage) return project.coverImage;
  if (project.heroMedia.type === "image" && project.heroMedia.url) {
    return { url: project.heroMedia.url, alt: project.heroMedia.alt, focalX: 50, focalY: 50 };
  }
  return null;
}

export default function FeaturedWorkShowcase({ projects }: { projects: PortfolioProject[] }) {
  if (projects.length === 0) return null;
  const [primary, ...rest] = projects;
  const secondary = rest.slice(0, 2);
  const primaryPoster = posterFor(primary);

  return (
    <section className="bg-ordift-navy-950">
      <div className="px-4 sm:px-8 pt-10 sm:pt-12">
        <h2 className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-1 max-w-6xl mx-auto">Featured Work</h2>
      </div>

      <Link href={`/work/${primary.slug}`} className="group relative block w-full h-[60vh] sm:h-[70vh] overflow-hidden mt-4">
        {primaryPoster ? (
          <Image
            src={primaryPoster.url}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            style={{ objectPosition: `${primaryPoster.focalX}% ${primaryPoster.focalY}%` }}
          />
        ) : (
          <MediaPlaceholder tone="dark" aspectRatio="auto" className="absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="relative h-full flex flex-col items-start justify-end px-4 sm:px-8 pb-10 sm:pb-14 max-w-6xl mx-auto">
          <h3 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-white max-w-2xl leading-tight">
            {primary.title}
          </h3>
        </div>
      </Link>

      {secondary.length > 0 && (
        <div className={`grid grid-cols-1 ${secondary.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {secondary.map((project) => {
            const poster = posterFor(project);
            return (
              <Link key={project.id} href={`/work/${project.slug}`} className="group relative block h-[40vh] sm:h-[45vh] overflow-hidden border-t border-white/10">
                {poster ? (
                  <Image
                    src={poster.url}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    style={{ objectPosition: `${poster.focalX}% ${poster.focalY}%` }}
                  />
                ) : (
                  <MediaPlaceholder tone="dark" aspectRatio="auto" className="absolute inset-0" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="relative h-full flex flex-col items-start justify-end px-4 sm:px-6 pb-6 sm:pb-8">
                  <h3 className="font-serif font-medium text-card-title lg:text-card-title-desktop text-white max-w-md">{project.title}</h3>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="h-8 sm:h-10" />
    </section>
  );
}
