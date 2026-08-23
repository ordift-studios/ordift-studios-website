import Link from "next/link";
import Image from "next/image";

// Photography's dedicated index page (2026-08-23) — a cinematic,
// editorial vertical project-strip: one large "chapter" per real
// published Photography project, not a card grid. Pure CSS hover
// (group/group-hover), no client JS, no new dependency — fully usable
// by tap alone on touch devices. Same proven-safe technique as
// WorkDisciplineBands (image scales within its own clipped band only —
// band height never changes on hover, so a hovered band can never cover
// its neighbors — and every transitioned color is a literal rgba(), not
// a Tailwind custom-color opacity modifier or a var() reference, which
// were both confirmed elsewhere this session to fail to render while a
// transition is active on the same property).
//
// Unlike WorkDisciplineBands' fixed-height bands (there, each tile
// shows a whole *discipline*, so a uniform height reads as intentional
// symmetry), each band here sizes itself from that specific
// photograph's own real aspect ratio, clamped to a sane range — a
// strong portrait shoot gets a tall, immersive band; a wide landscape
// shoot gets a shorter, wide one — "use actual image proportions
// intelligently" rather than forcing every project into one shape.
export type PhotographyStripProject = {
  id: string;
  slug: string;
  title: string;
  categoryName: string | null;
  heroImage: {
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
    lqip: string | null;
    // Image Repositioning (2026-08-23) — admin-chosen focal point
    // (0–100, 0–100), only ever set on a deliberately-picked Portfolio
    // Cover Image. Optional: the automatic Hero Media fallback has no
    // focal point of its own, so this defaults to 50/50 (dead center)
    // at render time, identical to this band's pre-existing behaviour.
    focalX?: number;
    focalY?: number;
  };
};

function clampAspectRatio(width: number | null, height: number | null): number {
  const FALLBACK = 16 / 9;
  const MIN = 0.6; // fairly tall portrait
  const MAX = 2.4; // wide panorama
  if (!width || !height) return FALLBACK;
  const ratio = width / height;
  return Math.min(MAX, Math.max(MIN, ratio));
}

export default function PhotographyIndexStrip({ projects }: { projects: PhotographyStripProject[] }) {
  return (
    <div className="bg-ordift-navy-950">
      {projects.map((project, i) => (
        <Link
          key={project.id}
          href={`/work/${project.slug}`}
          className="group relative block w-full max-h-[85vh] overflow-hidden border-b border-white/10 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ordift-gold"
          style={{ aspectRatio: clampAspectRatio(project.heroImage.width, project.heroImage.height) }}
        >
          {/* Image — scales within its own clipped band only; never
              affects layout or neighboring bands. */}
          <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
            <Image
              src={project.heroImage.url}
              alt={project.heroImage.alt}
              fill
              priority={i === 0}
              sizes="100vw"
              placeholder={project.heroImage.lqip ? "blur" : "empty"}
              blurDataURL={project.heroImage.lqip ?? undefined}
              className="object-cover"
              style={{ objectPosition: `${project.heroImage.focalX ?? 50}% ${project.heroImage.focalY ?? 50}%` }}
            />
          </div>

          {/* Static base scrim — left dark enough for text contrast
              against any photograph, not itself transitioned. */}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(11,18,32,0.75)] via-[rgba(11,18,32,0.05)] to-transparent" />

          {/* Subtle hover "come alive" wash — only opacity transitions. */}
          <div className="absolute inset-0 bg-[rgba(255,255,255,0.05)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 motion-reduce:transition-none" />

          {/* Content */}
          <div className="relative h-full flex flex-col justify-end px-4 sm:px-8 pb-8 sm:pb-12">
            <div className="max-w-6xl w-full mx-auto flex items-end justify-between gap-4">
              <div className="transition-transform duration-500 ease-out group-hover:-translate-y-1 motion-reduce:transition-none">
                {project.categoryName && (
                  <p className="font-sans font-semibold uppercase tracking-[0.2em] text-caption text-ordift-gold mb-2">
                    {project.categoryName}
                  </p>
                )}
                <p className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-white max-w-2xl">
                  {project.title}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="hidden sm:inline-flex shrink-0 items-center justify-center w-11 h-11 rounded-full bg-[rgba(255,255,255,0.1)] text-white transition-transform duration-500 ease-out group-hover:translate-x-1 motion-reduce:transition-none"
              >
                &rarr;
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
