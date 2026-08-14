import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import MediaAsset from "@/components/media/MediaAsset";
import SocialShare from "@/components/SocialShare";
import BeforeAfterGallery from "@/components/media/BeforeAfterGallery";
import FlexiblePhotoGallery from "./FlexiblePhotoGallery";
import PortfolioProjectFooterSections from "./PortfolioProjectFooterSections";
import { DESIGN_GALLERY_RECIPE } from "@/lib/content/portfolioTreatment";
import type { Category, PortfolioProject, Testimonial, Workshop } from "@/lib/content/types";

// The full page for a Graphic Design project — the artwork is the hero, not
// a Photography-gallery-with-mockups-instead-of-photos. Full page (bypasses
// the shared two-column shell), same principle as Photography/Videography.
//
// Unlike Photography, Before & After is kept here when present — design
// work legitimately shows development/before-after comparisons as part of
// the public-facing craft (a brand refresh, a redesign), not as
// case-study process documentation. Client/Year/Location/Services/
// Equipment/Collaborators/Deliverables/Results/Awards/Publications/
// testimonials stay out, same reasoning as the other two disciplines —
// still intact in Sanity/the CMS, not deleted.
export type GraphicDesignProjectViewProps = {
  project: PortfolioProject;
  categories: Category[];
  testimonials: Testimonial[];
  shareUrl: string;
  jsonLd: Record<string, unknown>;
  prevProject: PortfolioProject | null;
  nextProject: PortfolioProject | null;
  relatedProjects: PortfolioProject[];
  relatedWorkshops: Workshop[];
  categoryById: Map<string, Category>;
};

export default function GraphicDesignProjectView({
  project,
  shareUrl,
  jsonLd,
  prevProject,
  nextProject,
  relatedProjects,
  relatedWorkshops,
  categoryById,
}: GraphicDesignProjectViewProps) {
  const subtleMeta = [project.location, project.year].filter(Boolean).join(" · ");

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NavBar />

      <section className="px-4 sm:px-8 pt-14 sm:pt-20 pb-8 sm:pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
            Design
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-ordift-ink mb-3">
            {project.title}
          </h1>
          {(subtleMeta || project.client) && (
            <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-ink-muted">
              {[project.client, subtleMeta].filter(Boolean).join(" · ")}
            </p>
          )}
          {project.story && (
            <p className="font-serif italic text-body text-ordift-ink-muted mt-5 max-w-lg mx-auto whitespace-pre-line">
              {project.story}
            </p>
          )}
        </div>
      </section>

      <MediaAsset media={project.heroMedia} aspectRatio="4/5" sizes="100vw" priority />

      {project.gallery.length > 0 && (
        <div className="py-8 sm:py-14">
          <FlexiblePhotoGallery images={project.gallery} recipe={DESIGN_GALLERY_RECIPE} />
        </div>
      )}

      {project.beforeAfterGallery.length > 0 && (
        <div className="pb-8 sm:pb-14 px-4 sm:px-8">
          <div className="max-w-6xl mx-auto">
            <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-4">Before &amp; After</h2>
            <BeforeAfterGallery pairs={project.beforeAfterGallery} />
          </div>
        </div>
      )}

      <div className="flex justify-center pb-10 sm:pb-14">
        <SocialShare url={shareUrl} title={project.title} />
      </div>

      <PortfolioProjectFooterSections
        prevProject={prevProject}
        nextProject={nextProject}
        relatedProjects={relatedProjects}
        relatedWorkshops={relatedWorkshops}
        categoryById={categoryById}
      />

      <Footer />
    </main>
  );
}
