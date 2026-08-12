import type { PortfolioProject, Testimonial } from "@/lib/content/types";
import MediaAsset from "@/components/media/MediaAsset";
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

// Cinematic Videography presentation (Portfolio redesign §8). The film
// itself is the hero — already rendered full-width above this component by
// the shared page shell (project.heroMedia, video or embed, with native
// controls). This component keeps everything below it minimal: short
// context, optional additional cuts, optional stills/BTS. No
// Objective/Strategy/Challenges/Solution/Process here either.
export type VideographyProjectViewProps = {
  project: PortfolioProject;
  testimonials: Testimonial[];
  shareUrl: string;
};

export default function VideographyProjectView({
  project,
  testimonials,
  shareUrl,
}: VideographyProjectViewProps) {
  return (
    <div>
      <p className="font-sans text-body text-ordift-ink mb-8 whitespace-pre-line">{project.story}</p>

      {project.videos.length > 0 && (
        <div className="mb-10">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-4">More Films</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {project.videos.map((video, i) => (
              <MediaAsset key={i} media={video} aspectRatio="16/9" className="rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {project.behindTheScenesGallery.length > 0 && (
        <div className="mb-10">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-4">Stills &amp; Behind the Scenes</h2>
          <FlexiblePhotoGallery images={project.behindTheScenesGallery} mode="flexible" />
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
