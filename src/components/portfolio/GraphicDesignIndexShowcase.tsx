import Link from "next/link";
import ResponsiveImage from "@/components/media/ResponsiveImage";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";

// Graphic Design's own index treatment (2026-08-24) — deliberately
// distinct from both Photography's thin justified strip and
// Videography's dark full-bleed cinematic screenings: a light, minimal,
// editorial grid where each project's own cover artwork sits on a
// neutral mat at its own true proportions (object-contain, never
// cropped) rather than filling a fixed tile. Featured projects get a
// wider card for editorial rhythm; no filter/category picker here,
// same reasoning as Photography's index (a small real project count
// doesn't need one — the full filterable /work view is still reachable).
export type GraphicDesignShowcaseProject = {
  id: string;
  slug: string;
  title: string;
  treatmentLabel: string;
  year: number | null;
  client: string | null;
  featured: boolean;
  cover: { url: string; alt: string; width: number | null; height: number | null; lqip: string | null } | null;
};

export default function GraphicDesignIndexShowcase({ projects }: { projects: GraphicDesignShowcaseProject[] }) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-12 sm:gap-y-16">
        {projects.map((project, i) => (
          <Link
            key={project.id}
            href={`/work/${project.slug}`}
            className={`group block ${project.featured ? "sm:col-span-2" : ""}`}
          >
            <div className={`bg-[#f7f6f4] rounded-lg overflow-hidden ${project.featured ? "sm:max-w-4xl sm:mx-auto" : ""}`}>
              {project.cover?.url ? (
                <ResponsiveImage
                  src={project.cover.url}
                  alt={project.cover.alt}
                  width={project.cover.width}
                  height={project.cover.height}
                  lqip={project.cover.lqip}
                  aspectRatio={project.featured ? "16/9" : "4/5"}
                  sizes={project.featured ? "(min-width: 640px) 90vw, 100vw" : "(min-width: 640px) 45vw, 100vw"}
                  priority={i === 0}
                  objectFit="contain"
                  quality={90}
                  className="transition-transform duration-500 ease-out group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
              ) : (
                <MediaPlaceholder alt={project.title} aspectRatio={project.featured ? "16/9" : "4/5"} tone="light" />
              )}
            </div>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold mb-1">
                  {project.treatmentLabel}
                </p>
                <p className="font-serif font-medium text-body sm:text-card-title text-ordift-ink">{project.title}</p>
                {project.client && <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{project.client}</p>}
              </div>
              {project.year && <span className="font-sans text-caption text-ordift-ink-muted shrink-0">{project.year}</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
