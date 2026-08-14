import Link from "next/link";
import PortfolioCard from "@/components/portfolio/PortfolioCard";
import type { Category, PortfolioProject, Workshop } from "@/lib/content/types";

// Prev/next + Related Projects + Related Workshops — identical across every
// discipline view (Photography's minimal page and the shared shell used by
// Videography/Graphic Design/the generic fallback both render this), so it
// lives once rather than being copy-pasted per view.
export type PortfolioProjectFooterSectionsProps = {
  prevProject: PortfolioProject | null;
  nextProject: PortfolioProject | null;
  relatedProjects: PortfolioProject[];
  relatedWorkshops: Workshop[];
  categoryById: Map<string, Category>;
};

export default function PortfolioProjectFooterSections({
  prevProject,
  nextProject,
  relatedProjects,
  relatedWorkshops,
  categoryById,
}: PortfolioProjectFooterSectionsProps) {
  return (
    <>
      <section className="bg-ordift-offwhite px-4 sm:px-8 py-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          {prevProject ? (
            <Link
              href={`/work/${prevProject.slug}`}
              className="font-sans text-body-small text-ordift-ink hover:text-ordift-gold-pressed"
            >
              ← {prevProject.title}
            </Link>
          ) : (
            <span />
          )}
          {nextProject && (
            <Link
              href={`/work/${nextProject.slug}`}
              className="font-sans text-body-small text-ordift-ink hover:text-ordift-gold-pressed text-right"
            >
              {nextProject.title} →
            </Link>
          )}
        </div>
      </section>

      {relatedProjects.length > 0 && (
        <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Related Projects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {relatedProjects.map((related) => (
                <PortfolioCard
                  key={related.id}
                  project={related}
                  categories={related.categoryIds.map((id) => categoryById.get(id)!).filter(Boolean)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {relatedWorkshops.length > 0 && (
        <section className="bg-ordift-offwhite px-4 sm:px-8 py-14 sm:py-20">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-6">
              Related Workshops
            </h2>
            <div className="flex flex-wrap gap-4">
              {relatedWorkshops.map((w) => (
                <Link
                  key={w.id}
                  href={`/workshops/${w.slug}`}
                  className="inline-flex items-center min-h-11 px-5 rounded-full border border-black/15 font-sans text-body-small text-ordift-ink hover:border-black/30"
                >
                  {w.title} →
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
