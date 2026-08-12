import type { Category, PortfolioProject, Testimonial } from "@/lib/content/types";
import { resolvePhotographyTreatment } from "@/lib/content/portfolioTreatment";
import FlexiblePhotoGallery from "./FlexiblePhotoGallery";
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

// Image-led Photography presentation (Portfolio redesign §5-7). No
// Objective/Strategy/Challenges/Solution/Process — that explanatory depth
// stays Workshop/case-study-only. The gallery mode varies by sub-treatment
// (subject-led/sequential/controlled/flexible — see portfolioTreatment.ts),
// so Wedding/Portrait/Fashion, Event, and Commercial/Product photography
// don't all read as the same template.
export type PhotographyProjectViewProps = {
  project: PortfolioProject;
  categories: Category[];
  testimonials: Testimonial[];
  shareUrl: string;
};

export default function PhotographyProjectView({
  project,
  categories,
  testimonials,
  shareUrl,
}: PhotographyProjectViewProps) {
  const treatment = resolvePhotographyTreatment(categories);
  const isSubjectLed = treatment === "subject-led";
  const galleryMode = treatment === "sequential" || treatment === "controlled" ? treatment : "flexible";

  return (
    <div>
      {isSubjectLed && (project.client || project.location || project.year) && (
        <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-4">
          {[project.client, project.location, project.year].filter(Boolean).join(" · ")}
        </p>
      )}

      <p className="font-sans text-body text-ordift-ink mb-8 whitespace-pre-line">{project.story}</p>

      {project.gallery.length > 0 && (
        <div className="mb-10">
          <FlexiblePhotoGallery images={project.gallery} mode={galleryMode} />
        </div>
      )}

      {project.behindTheScenesGallery.length > 0 && (
        <div className="mb-10">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-4">Behind the Scenes</h2>
          <FlexiblePhotoGallery images={project.behindTheScenesGallery} mode={galleryMode} />
        </div>
      )}

      {project.beforeAfterGallery.length > 0 && (
        <div className="mb-10">
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-4">Before &amp; After</h2>
          <BeforeAfterGallery pairs={project.beforeAfterGallery} />
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
