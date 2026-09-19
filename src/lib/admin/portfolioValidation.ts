import type { PortfolioProject } from "@/lib/content/types";

// Publish Readiness Checklist (approved 2026-08-05) — a single source
// of truth used in two places: the wizard's Review & Preview step
// (src/app/admin/portfolio/PortfolioProjectForm.tsx) for immediate
// feedback, and transitionPortfolioProjectAction (src/app/admin/
// portfolio/actions.ts) as the actual enforcement point, so a request
// crafted outside the UI can't skip the check. Only genuinely required
// items are blocking — everything else is a warning, per the approved
// spec ("only genuinely required items should block publication").

export type ReadinessResult = {
  blocking: string[];
  warnings: string[];
};

// Accepts a partial shape so the wizard's in-progress form state (which
// doesn't have every PortfolioProject field populated the way a
// freshly-fetched Sanity document does) can be checked without a full
// round-trip.
export type ReadinessInput = Pick<
  PortfolioProject,
  "title" | "slug" | "heroMedia" | "story" | "categoryIds" | "seo" | "gallery" | "tags" | "client"
>;

export function getPublishReadiness(
  project: ReadinessInput,
  options?: { skipAltTextCheck?: boolean }
): ReadinessResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const skipAltTextCheck = options?.skipAltTextCheck ?? false;

  if (!project.title?.trim()) blocking.push("Project title is required.");
  if (!project.slug?.trim()) blocking.push("A URL slug is required.");
  if (!project.heroMedia?.url) blocking.push("A hero image is required.");
  else if (!skipAltTextCheck && !project.heroMedia?.alt?.trim()) blocking.push("The hero image needs alt text.");
  if (!project.story?.trim()) blocking.push("A project story / summary is required.");
  if (!project.categoryIds || project.categoryIds.length === 0) {
    blocking.push("At least one category is required.");
  }

  if (!skipAltTextCheck) {
    const galleryMissingAlt = (project.gallery ?? []).filter((img) => !img.alt?.trim());
    if (galleryMissingAlt.length > 0) {
      blocking.push(`${galleryMissingAlt.length} gallery image(s) are missing alt text.`);
    }
  }

  if (!project.gallery || project.gallery.length === 0) {
    warnings.push("No gallery images added yet.");
  }
  if (!project.seo?.metaTitle && !project.seo?.metaDescription) {
    warnings.push("SEO title/description not set — falls back to defaults.");
  }
  if (!project.tags || project.tags.length === 0) {
    warnings.push("No tags added — tags help with search and filtering.");
  }
  if (!project.client?.trim()) {
    warnings.push("No client attribution set (leave blank if not permitted to name the client).");
  }

  return { blocking, warnings };
}

export function isReadyToPublish(project: ReadinessInput): boolean {
  return getPublishReadiness(project).blocking.length === 0;
}

// Publish Readiness Blocking/Advisory correction (2026-09-20) — Human
// Production QA reported that advisory metadata (custom SEO, tags,
// client attribution) appeared to prevent a project from proceeding
// through review/publication, reproduced on Graphic Design after an
// earlier Photography report. Audit of the actual enforcement point
// (transitionPortfolioProjectAction, below) and the UI (the wizard's
// Review step and the Project Detail page) found both already checked
// ONLY `blocking`, never `warnings` — the underlying rule was already
// correct and, being discipline-agnostic (this function takes no
// discipline/category-specific branch), already applied identically
// to every Portfolio discipline. The real defect was presentation: the
// Publish Readiness panel rendered blocking and advisory items as one
// undifferentiated list (color alone distinguishing them), which is
// exactly the shape that reads as "everything listed must be
// resolved." This function is the SINGLE named choke point every
// consumer (current or future) must call to decide whether a project
// may proceed — never re-deriving the same "blocking.length === 0"
// check inline, so a future consumer can't silently regress to
// checking `warnings` too.
export function canProceedToReview(readiness: ReadinessResult): boolean {
  return readiness.blocking.length === 0;
}
