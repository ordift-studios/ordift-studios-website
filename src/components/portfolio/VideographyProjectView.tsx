import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import MediaAsset from "@/components/media/MediaAsset";
import SocialShare from "@/components/SocialShare";
import FlexiblePhotoGallery from "./FlexiblePhotoGallery";
import PortfolioProjectFooterSections from "./PortfolioProjectFooterSections";
import type { Category, PortfolioProject, Testimonial, Workshop } from "@/lib/content/types";

// The full page for a Videography project — cinematic, not the Photography
// template with videos substituted in. Full page (bypasses the shared
// two-column shell entirely), same principle as Photography: the film is
// the hero, supporting information stays out of the way.
//
// What's deliberately absent, same reasoning as Photography: Client, Year,
// Location, Services Provided, Equipment Used, Collaborators, Deliverables,
// Results & Impact, Awards, Publications, testimonials. Every field still
// exists in Sanity/the CMS untouched — presentation choice, not a data
// change.
export type VideographyProjectViewProps = {
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

export default function VideographyProjectView({
  project,
  shareUrl,
  jsonLd,
  prevProject,
  nextProject,
  relatedProjects,
  relatedWorkshops,
  categoryById,
}: VideographyProjectViewProps) {
  const subtleMeta = [project.location, project.year].filter(Boolean).join(" · ");

  // Additional cuts beyond the hero film get visual hierarchy rather than
  // an endless stack of identical players: the first extra video is shown
  // large, any further ones drop into a smaller two-up grid.
  const [featuredExtra, ...remainingVideos] = project.videos;

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NavBar />

      <section className="px-4 sm:px-8 pt-14 sm:pt-20 pb-8 sm:pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
            Film
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

      {/* The hero film — cinematic 16:9, native controls, no autoplay
          (respects data usage and motion preferences by default). */}
      <MediaAsset media={project.heroMedia} aspectRatio="16/9" sizes="100vw" priority />

      {featuredExtra && (
        <div className="pt-8 sm:pt-14 px-4 sm:px-8">
          <div className="max-w-5xl mx-auto">
            <MediaAsset media={featuredExtra} aspectRatio="16/9" className="rounded-lg" />
          </div>
        </div>
      )}

      {remainingVideos.length > 0 && (
        <div className="pt-6 px-4 sm:px-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
            {remainingVideos.map((video, i) => (
              <MediaAsset key={i} media={video} aspectRatio="16/9" className="rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {project.behindTheScenesGallery.length > 0 && (
        <div className="pt-10 sm:pt-14 pb-8 sm:pb-14">
          <FlexiblePhotoGallery images={project.behindTheScenesGallery} mode="flexible" />
        </div>
      )}

      <div className="flex justify-center py-10 sm:py-14">
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
