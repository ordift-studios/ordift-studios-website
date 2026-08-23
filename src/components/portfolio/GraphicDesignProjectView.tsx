import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import MediaAsset from "@/components/media/MediaAsset";
import SocialShare from "@/components/SocialShare";
import BeforeAfterSlider from "./BeforeAfterSlider";
import DesignShowcase from "./DesignShowcase";
import DesignIdentitySystem from "./DesignIdentitySystem";
import GraphicDesignNextProject from "./GraphicDesignNextProject";
import PortfolioProjectFooterSections from "./PortfolioProjectFooterSections";
import { resolveDesignTreatment, DESIGN_TREATMENT_LABEL } from "@/lib/content/portfolioTreatment";
import type { Category, PortfolioProject, Testimonial, Workshop } from "@/lib/content/types";

// The full page for a Graphic Design project — a premium creative-agency
// case study, not a photography-gallery-with-mockups-instead-of-photos.
// Full page (bypasses the shared two-column shell), same principle as
// Photography/Videography.
//
// Content-aware rhythm (2026-08-24 redesign), never a fixed checklist:
// Intro -> Hero/Key Artwork -> Selected Work -> Identity/System ->
// Applications/Mockups -> Process -> Before & After -> Next Project.
// Every section between the hero and the footer renders only when real
// content actually routes into it — a single-poster project shows just
// Intro + Hero + Selected Work and looks complete; a full branding
// project can populate every section. Client/Year/Location stay
// restrained; Services/Equipment/Collaborators/Deliverables/Results/
// Awards/Publications/testimonials/Downloadable Assets stay out of the
// public page, same reasoning as Photography/Videography — still intact
// in the CMS, not deleted.
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

const IMAGE_QUALITY = 90;

export default function GraphicDesignProjectView({
  project,
  categories,
  shareUrl,
  jsonLd,
  prevProject,
  nextProject,
  relatedProjects,
  relatedWorkshops,
  categoryById,
}: GraphicDesignProjectViewProps) {
  const subtleMeta = [project.location, project.year].filter(Boolean).join(" · ");
  const treatment = resolveDesignTreatment(categories);

  const selectedWork = project.gallery.filter((img) => !img.assetRole || img.assetRole === "automatic");
  const applications = project.gallery.filter((img) => img.assetRole === "application");
  const hasIdentitySystem = project.gallery.some(
    (img) =>
      img.assetRole === "logo" ||
      img.assetRole === "secondary-mark" ||
      img.assetRole === "color-palette" ||
      img.assetRole === "typography" ||
      img.assetRole === "visual-element",
  );
  const hasProcess = project.behindTheScenesGallery.length > 0;
  const validBeforeAfter = project.beforeAfterGallery.filter((p) => p.before.url && p.after.url);

  const heroIsImage = project.heroMedia.type === "image";

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NavBar />

      <section className="px-4 sm:px-8 pt-14 sm:pt-20 pb-8 sm:pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
            {DESIGN_TREATMENT_LABEL[treatment]}
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

      {/* Hero / Key Artwork — aspect-ratio-aware, never force-cropped. An
          image hero renders on a neutral canvas at its own true
          proportions (object-contain), letterboxing rather than cropping
          if a very tall/wide piece would otherwise dominate the viewport.
          A video/embed hero (rare for this discipline, but the schema
          allows it) keeps the standard 16:9 treatment every other
          MediaAsset caller uses. */}
      <div className="bg-[#f7f6f4]">
        <MediaAsset
          media={project.heroMedia}
          aspectRatio={heroIsImage ? undefined : "16/9"}
          sizes="100vw"
          priority
          objectFit={heroIsImage ? "contain" : undefined}
          quality={IMAGE_QUALITY}
          className={heroIsImage ? "sm:max-h-[82vh] mx-auto" : undefined}
        />
      </div>

      {selectedWork.length > 0 && (
        <section className="py-10 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 mb-6 sm:mb-8">
            <h2 className="font-serif font-medium text-card-title text-ordift-ink">Selected Work</h2>
          </div>
          <DesignShowcase images={selectedWork} quality={IMAGE_QUALITY} />
        </section>
      )}

      {hasIdentitySystem && (
        <section className="py-10 sm:py-16 bg-[#f7f6f4]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 mb-6 sm:mb-8">
            <h2 className="font-serif font-medium text-card-title text-ordift-ink">Identity System</h2>
          </div>
          <DesignIdentitySystem images={project.gallery} quality={IMAGE_QUALITY} />
        </section>
      )}

      {applications.length > 0 && (
        <section className="py-10 sm:py-16">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 mb-6 sm:mb-8">
            <h2 className="font-serif font-medium text-card-title text-ordift-ink">Applications &amp; Mockups</h2>
          </div>
          <DesignShowcase images={applications} quality={IMAGE_QUALITY} />
        </section>
      )}

      {hasProcess && (
        <section className="py-10 sm:py-16 bg-[#f7f6f4]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 mb-6 sm:mb-8">
            <h2 className="font-serif font-medium text-card-title text-ordift-ink">Process</h2>
          </div>
          <DesignShowcase images={project.behindTheScenesGallery} quality={IMAGE_QUALITY} />
        </section>
      )}

      {validBeforeAfter.length > 0 && (
        <section className="py-10 sm:py-16 px-4 sm:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-6 sm:mb-8 text-center">
              Before &amp; After
            </h2>
            <div className="space-y-10 sm:space-y-14">
              {validBeforeAfter.map((pair) => (
                <BeforeAfterSlider key={pair.id} pair={pair} quality={IMAGE_QUALITY} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="flex justify-center pb-10 sm:pb-14">
        <SocialShare url={shareUrl} title={project.title} />
      </div>

      <GraphicDesignNextProject prevProject={prevProject} nextProject={nextProject} />

      <PortfolioProjectFooterSections
        prevProject={prevProject}
        nextProject={nextProject}
        relatedProjects={relatedProjects}
        relatedWorkshops={relatedWorkshops}
        categoryById={categoryById}
        showPrevNext={false}
      />

      <Footer />
    </main>
  );
}
