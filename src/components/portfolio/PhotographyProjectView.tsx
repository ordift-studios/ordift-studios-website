import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import MediaAsset from "@/components/media/MediaAsset";
import SocialShare from "@/components/SocialShare";
import PhotographyGalleryWithLightbox from "./PhotographyGalleryWithLightbox";
import PortfolioProjectFooterSections from "./PortfolioProjectFooterSections";
import {
  PHOTOGRAPHY_TREATMENT_LABEL,
  PHOTO_GALLERY_RECIPES,
  resolvePhotographyTreatment,
} from "@/lib/content/portfolioTreatment";
import type { Category, PortfolioProject, Testimonial, Workshop } from "@/lib/content/types";

// The full page for a Photography project — deliberately NOT the shared
// shell used by Videography/Graphic Design/the generic fallback. Rebuilt
// 2026-08-12 after visual review found the Phase 2 version (which reused
// the standard title-block + hero + two-column-with-sidebar shell) still
// read as an agency case study rather than a photography portfolio.
//
// Design target: photography accounts for the overwhelming majority of the
// visual experience. What's deliberately absent from this page — Client,
// Year, Location, Services Provided, Equipment Used, Collaborators,
// Deliverables, Results & Impact, Awards, Publications, testimonials,
// Behind the Scenes, Before/After — is a presentation choice, not a data
// change. Every field still exists in Sanity/the CMS untouched, and remains
// available to Workshop/case-study content, admin views, and (invisibly)
// structured SEO metadata. See PRODUCT_ROADMAP.md's Portfolio redesign
// entry for the full reasoning.
export type PhotographyProjectViewProps = {
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

export default function PhotographyProjectView({
  project,
  categories,
  shareUrl,
  jsonLd,
  prevProject,
  nextProject,
  relatedProjects,
  relatedWorkshops,
  categoryById,
}: PhotographyProjectViewProps) {
  const treatment = resolvePhotographyTreatment(categories);
  const recipe = PHOTO_GALLERY_RECIPES[treatment];
  const label = PHOTOGRAPHY_TREATMENT_LABEL[treatment];

  // "Extremely subtle" identifying line only — never a metadata dashboard.
  const subtleMeta = [project.location, project.year].filter(Boolean).join(" · ");

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NavBar />

      {/* Minimal header — subtype, title, optional location/date, optional
          short intro. Nothing else. Photography subtype and couple/client
          identity for Wedding/Portrait/Fashion live in this one quiet line,
          not a prominent standalone headline like the Phase 2 version had. */}
      <section className="px-4 sm:px-8 pt-14 sm:pt-20 pb-8 sm:pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
            {label}
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

      {/* Hero — the opening photograph, tall and immersive. */}
      <MediaAsset media={project.heroMedia} aspectRatio="4/5" sizes="100vw" priority />

      {/* The gallery carries the story. */}
      {project.gallery.length > 0 && (
        <div className="py-8 sm:py-14">
          <PhotographyGalleryWithLightbox images={project.gallery} recipe={recipe} />
        </div>
      )}

      <div className="flex justify-center pb-14 sm:pb-20">
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
