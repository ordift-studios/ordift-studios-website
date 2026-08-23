import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import SocialShare from "@/components/SocialShare";
import VideoPlayer from "./VideoPlayer";
import VideographyAdditionalFilms from "./VideographyAdditionalFilms";
import VideographyReels from "./VideographyReels";
import VideographyNextFilm from "./VideographyNextFilm";
import PhotographyGalleryWithLightbox from "./PhotographyGalleryWithLightbox";
import PortfolioProjectFooterSections from "./PortfolioProjectFooterSections";
import type { Category, PortfolioProject, Testimonial, Workshop } from "@/lib/content/types";

// Videography's dedicated page (2026-08-23 redesign) — a cinematic
// screening experience, deliberately not the Photography template with
// videos substituted in. Dark, full-bleed, poster-then-play throughout;
// content-aware — Additional Films/Reels/Behind the Scenes/Credits each
// render only when the project actually has that content, so an older
// Main-Film-only project still reads as complete and intentional, not
// unfinished. See PhotographyProjectView.tsx for the equivalent
// Photography design (light, editorial, justified photo grid) this
// deliberately does not imitate.
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
  categories,
  shareUrl,
  jsonLd,
  prevProject,
  nextProject,
  relatedProjects,
  relatedWorkshops,
  categoryById,
}: VideographyProjectViewProps) {
  // Small category/type label where available (2026-08-23) — reuses the
  // project's own existing category taxonomy (the same generic
  // Categories system every discipline already has), not a new
  // Videography-only sub-treatment system. Falls back to a plain "Film"
  // label, matching the previous implementation's own default.
  const categoryLabel = categories[0]?.name ?? "Film";
  const subtleMeta = [project.location, project.year].filter(Boolean).join(" · ");
  const poster = project.coverImage ?? null;
  const additionalFilms = project.videos;
  const reels = project.reels ?? [];
  const bts = project.behindTheScenesGallery;
  const showCredits = Boolean(project.showCollaborationCredits) && project.collaborators.length > 0;

  return (
    <main className="bg-ordift-navy-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <NavBar />

      {/* Minimal opening — category/type, title, optional client/
          location/year, nothing else. The film itself carries the page,
          not production metadata. */}
      <section className="px-4 sm:px-8 pt-14 sm:pt-20 pb-8 sm:pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-3">
            {categoryLabel}
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-white mb-3">
            {project.title}
          </h1>
          {(subtleMeta || project.client) && (
            <p className="font-sans text-caption uppercase tracking-[0.1em] text-white/50">
              {[project.client, subtleMeta].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </section>

      {/* Main Film — poster (Portfolio Cover Image) then Play; never
          autoplays on load; audio never starts until a real click. */}
      <VideoPlayer media={project.heroMedia} poster={poster} playLabel="Play Film" priority />

      {/* Everything below is content-aware — each section renders only
          when the project actually has that material. */}
      <VideographyAdditionalFilms films={additionalFilms} fallbackPoster={poster} />
      <VideographyReels reels={reels} fallbackPoster={poster} />

      {bts.length > 0 && (
        <section className="py-10 sm:py-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 mb-5">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold">
              Behind the Scenes
            </p>
          </div>
          <PhotographyGalleryWithLightbox images={bts} />
        </section>
      )}

      {showCredits && (
        <section className="px-4 sm:px-8 py-10 sm:py-14 border-t border-white/10">
          <div className="max-w-2xl mx-auto text-center">
            <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold mb-4">
              Credits
            </p>
            <p className="font-sans text-body-small text-white/70 mb-3">
              Produced by Ordift Studios{project.client ? ` in collaboration with ${project.client}` : ""}.
            </p>
            <ul className="space-y-1">
              {project.collaborators.map((c) => (
                <li key={c.id} className="font-sans text-body-small text-white/70">
                  {c.name}
                  {c.role ? ` — ${c.role}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="flex justify-center py-10 sm:py-14">
        <SocialShare url={shareUrl} title={project.title} dark />
      </div>

      <VideographyNextFilm prevProject={prevProject} nextProject={nextProject} />

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
