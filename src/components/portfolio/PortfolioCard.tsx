import Link from "next/link";
import type { Category, PortfolioProject } from "@/lib/content/types";
import { DISCIPLINE_LABEL } from "@/lib/content/portfolioHelpers";
import MediaAsset from "@/components/media/MediaAsset";

export default function PortfolioCard({
  project,
  categories,
}: {
  project: PortfolioProject;
  categories: Category[];
}) {
  return (
    <Link
      href={`/work/${project.slug}`}
      className="block rounded-xl border border-black/10 bg-ordift-offwhite overflow-hidden transition-colors hover:border-black/20"
    >
      <div className="relative">
        <MediaAsset
          media={project.heroMedia}
          aspectRatio="4/3"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        {project.featured && (
          <span className="absolute top-3 left-3 inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold text-ordift-navy-950">
            Featured
          </span>
        )}
        {project.heroMedia.type === "video" && (
          <span className="absolute top-3 right-3 inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-navy-950/70 text-white">
            Video
          </span>
        )}
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap gap-2 mb-3">
          {project.disciplines.map((d) => (
            <span
              key={d}
              className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-navy-950/5 text-ordift-ink-muted"
            >
              {DISCIPLINE_LABEL[d]}
            </span>
          ))}
        </div>
        <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-2">
          {project.title}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-sans text-caption text-ordift-ink-muted">
            {[project.client, project.year].filter(Boolean).join(" · ") || null}
          </p>
          {categories.length > 0 && (
            <p className="font-sans text-caption text-ordift-gold-pressed">
              {categories.map((c) => c.name).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
