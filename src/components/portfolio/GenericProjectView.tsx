import type { PortfolioProject, Testimonial } from "@/lib/content/types";
import Gallery from "@/components/media/Gallery";
import MediaAsset from "@/components/media/MediaAsset";
import BeforeAfterGallery from "@/components/media/BeforeAfterGallery";
import SocialShare from "@/components/SocialShare";
import {
  AwardsPublicationsBlock,
  CollaboratorsBlock,
  DeliverablesBlock,
  DownloadsBlock,
  ResultsBlock,
  TestimonialsBlock,
} from "./ProjectMetaBlocks";

// Fallback for disciplines without a dedicated view yet (branding,
// content-creation, talent-management, production). Unchanged from the
// original single-template behavior — including the narrative sections —
// so nothing regresses for these disciplines while Photography/
// Videography/Graphic Design get their own views. Extracted as-is, not
// redesigned, to keep this phase's change surface limited to the three
// disciplines actually in scope.
const NARRATIVE_SECTIONS: { key: "objective" | "strategy" | "challenges" | "solution" | "process"; label: string }[] = [
  { key: "objective", label: "Project Objective" },
  { key: "strategy", label: "Creative Strategy" },
  { key: "challenges", label: "Challenges" },
  { key: "solution", label: "Solution" },
  { key: "process", label: "Creative Process" },
];

export type GenericProjectViewProps = {
  project: PortfolioProject;
  testimonials: Testimonial[];
  shareUrl: string;
};

export default function GenericProjectView({ project, testimonials, shareUrl }: GenericProjectViewProps) {
  return (
    <div>
      <p className="font-sans text-body text-ordift-ink mb-8 whitespace-pre-line">{project.story}</p>

      {NARRATIVE_SECTIONS.filter((section) => project[section.key]).map((section) => (
        <div key={section.key} className="mb-8">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-2">{section.label}</h2>
          <p className="font-sans text-body-small text-ordift-ink-muted whitespace-pre-line">
            {project[section.key]}
          </p>
        </div>
      ))}

      <CollaboratorsBlock project={project} />
      <DeliverablesBlock project={project} />
      <ResultsBlock project={project} />
      <AwardsPublicationsBlock project={project} />

      {project.gallery.length > 0 && (
        <div className="mb-8">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Final Gallery</h2>
          <Gallery
            images={project.gallery}
            columns={3}
            sizes="(min-width: 1024px) 18vw, (min-width: 640px) 33vw, 50vw"
          />
        </div>
      )}

      {project.videos.length > 0 && (
        <div className="mb-8">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Videos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {project.videos.map((video, i) => (
              <MediaAsset key={i} media={video} aspectRatio="16/9" className="rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {project.behindTheScenesGallery.length > 0 && (
        <div className="mb-8">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Behind the Scenes</h2>
          <Gallery
            images={project.behindTheScenesGallery}
            columns={3}
            sizes="(min-width: 1024px) 18vw, (min-width: 640px) 33vw, 50vw"
          />
        </div>
      )}

      {project.beforeAfterGallery.length > 0 && (
        <div className="mb-8">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Before &amp; After</h2>
          <BeforeAfterGallery pairs={project.beforeAfterGallery} />
        </div>
      )}

      <DownloadsBlock project={project} />
      <TestimonialsBlock testimonials={testimonials} />

      <SocialShare url={shareUrl} title={project.title} />
    </div>
  );
}
