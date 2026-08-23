import Link from "next/link";
import Image from "next/image";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";
import type { PortfolioDiscipline } from "@/lib/content/types";

// The primary "visual discipline-selection experience" for /work
// (2026-08-23) — large stacked, image-led panels, one per Ordift
// discipline, replacing the old filter/grid as the page's opening
// content. Pure CSS hover (group/group-hover) — no client JS, no new
// dependency — so it degrades to a fully static, fully usable stack on
// touch devices with no hover capability at all, per instruction.
//
// Each band's height never changes on hover — only the image (scale,
// clipped by the band's own overflow-hidden) and a couple of purely
// opacity/transform-based overlays move, so a hovered band can never
// grow into its neighbors or shift the page layout. Every color used
// in something that also transitions is a literal rgba()/hex value,
// never a Tailwind custom-color opacity modifier or a var() reference —
// both were confirmed elsewhere this session to fail to render while a
// transition is active on the same property.
export type WorkDiscipline = {
  slug: PortfolioDiscipline;
  name: string;
  heroImage: { url: string; alt: string; width?: number | null; height?: number | null; lqip?: string | null } | null;
  hasProjects: boolean;
  // Optional per-discipline destination override (2026-08-23) — used
  // once a discipline has its own dedicated index page (Photography
  // first); defaults to the existing /work?discipline=<slug> filtered
  // view for every discipline that doesn't have one yet, unchanged.
  href?: string;
};

export default function WorkDisciplineBands({ disciplines }: { disciplines: WorkDiscipline[] }) {
  return (
    <section aria-label="Browse by discipline" className="bg-ordift-navy-950">
      {disciplines.map((d, i) => (
        <Link
          key={d.slug}
          href={d.href ?? `/work?discipline=${d.slug}`}
          className="group relative block h-[200px] sm:h-[240px] lg:h-[22vh] lg:min-h-[220px] lg:max-h-[280px] overflow-hidden border-b border-white/10 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ordift-gold"
        >
          {/* Image — scales within its own clipped band only; never
              affects layout or neighboring bands. */}
          <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
            {d.heroImage?.url ? (
              <Image
                src={d.heroImage.url}
                alt={d.heroImage.alt}
                fill
                sizes="100vw"
                placeholder={d.heroImage.lqip ? "blur" : "empty"}
                blurDataURL={d.heroImage.lqip ?? undefined}
                className="object-cover"
              />
            ) : (
              <MediaPlaceholder
                label={d.name}
                tone="dark"
                aspectRatio="auto"
                className="absolute inset-0"
              />
            )}
          </div>

          {/* Static base scrim — left dark enough for text contrast
              against any photograph, not itself transitioned. */}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(11,18,32,0.8)] via-[rgba(11,18,32,0.2)] to-transparent" />

          {/* Subtle hover "come alive" wash — only opacity transitions,
              never color/background-color, so it can't hit the
              transition+var()/opacity-modifier rendering issue found
              elsewhere this session. */}
          <div className="absolute inset-0 bg-[rgba(255,255,255,0.05)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 motion-reduce:transition-none" />

          {/* Content */}
          <div className="relative h-full flex flex-col justify-end px-4 sm:px-8 pb-6 sm:pb-8">
            <div className="max-w-6xl w-full mx-auto flex items-end justify-between gap-4">
              <div className="transition-transform duration-500 ease-out group-hover:-translate-y-1 motion-reduce:transition-none">
                <p className="font-sans font-semibold uppercase tracking-[0.2em] text-caption text-ordift-gold mb-1.5">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="font-serif font-medium text-section-heading sm:text-section-heading-tablet lg:text-section-heading-desktop text-white">
                  {d.name}
                </p>
              </div>

              {d.hasProjects ? (
                <span
                  aria-hidden="true"
                  className="hidden sm:inline-flex shrink-0 items-center justify-center w-11 h-11 rounded-full bg-[rgba(255,255,255,0.1)] text-white transition-transform duration-500 ease-out group-hover:translate-x-1 motion-reduce:transition-none"
                >
                  &rarr;
                </span>
              ) : (
                <span className="shrink-0 font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold border border-ordift-gold/40 rounded-full px-3 py-1.5">
                  Portfolio Coming Soon
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </section>
  );
}
