import type { PortfolioProject, Testimonial } from "@/lib/content/types";
import FlexiblePhotoGallery from "./FlexiblePhotoGallery";
import SocialShare from "@/components/SocialShare";
import {
  AwardsPublicationsBlock,
  CollaboratorsBlock,
  DeliverablesBlock,
  DownloadsBlock,
  ResultsBlock,
  TestimonialsBlock,
} from "./ProjectMetaBlocks";

// Design-portfolio presentation (Portfolio redesign §9) — artwork does the
// talking. One-line context, then the artwork/mockup sequence at varied
// scale (reuses the same flexible gallery Photography uses, rather than a
// separate uniform grid). No Objective/Strategy/Challenges/Solution/Process.
export type GraphicDesignProjectViewProps = {
  project: PortfolioProject;
  testimonials: Testimonial[];
  shareUrl: string;
};

export default function GraphicDesignProjectView({
  project,
  testimonials,
  shareUrl,
}: GraphicDesignProjectViewProps) {
  return (
    <div>
      <p className="font-sans text-body text-ordift-ink mb-8 whitespace-pre-line">{project.story}</p>

      {project.gallery.length > 0 && (
        <div className="mb-10">
          <FlexiblePhotoGallery images={project.gallery} mode="flexible" />
        </div>
      )}

      <CollaboratorsBlock project={project} />
      <DeliverablesBlock project={project} />
      <ResultsBlock project={project} />
      <AwardsPublicationsBlock project={project} />
      <DownloadsBlock project={project} />
      <TestimonialsBlock testimonials={testimonials} />

      <SocialShare url={shareUrl} title={project.title} />
    </div>
  );
}
