import type { PortfolioDiscipline, PortfolioProject } from "./types";

// Maps 1:1 to the existing department pages (src/app/services/*) so a
// discipline badge/filter can always link back to the real service page.
export const DISCIPLINE_LABEL: Record<PortfolioDiscipline, string> = {
  photography: "Photography",
  videography: "Videography",
  "graphic-design": "Graphic Design",
  branding: "Branding & Strategy",
  "content-creation": "Content Creation",
  "talent-management": "Talent Management",
  production: "Production Services",
};

export const DISCIPLINE_HREF: Record<PortfolioDiscipline, string> = {
  photography: "/services/photography",
  videography: "/services/videography",
  "graphic-design": "/services/graphic-design",
  branding: "/services/branding",
  "content-creation": "/services/content-creation",
  "talent-management": "/services/talent-management",
  production: "/services/production",
};

// Selects and orders projects for the Portfolio landing hero slideshow.
// No schema change: reuses `featured` + `heroMedia`, which already exist,
// plus the fact that `contentRepository.getPortfolioProjects()` already
// returns newest-first (Sanity query orders by `_createdAt desc`). Order:
// 1. explicitly featured projects (newest-first among themselves)
// 2. remaining projects, newest-first, to fill out to `max`
// Video/embed heroMedia is skipped — a slideshow slide is a still image,
// not an autoplaying video player or iframe; a project whose hero is a
// video simply doesn't contribute a slide (its gallery/detail page is
// unaffected). Projects with no uploaded hero image yet are skipped too
// rather than showing a placeholder tile in a "premium, immersive"
// slideshow. Dedupes by image URL so the same photo (e.g. reused as both
// a featured pick and a collection cover) never appears twice.
export function getSlideshowProjects(
  projects: PortfolioProject[],
  max = 8,
): PortfolioProject[] {
  const eligible = projects.filter((p) => p.heroMedia.type === "image" && p.heroMedia.url);
  const featured = eligible.filter((p) => p.featured);
  const rest = eligible.filter((p) => !p.featured);

  const seenUrls = new Set<string>();
  const slides: PortfolioProject[] = [];
  for (const project of [...featured, ...rest]) {
    if (slides.length >= max) break;
    const url = project.heroMedia.url!;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    slides.push(project);
  }
  return slides;
}

export function matchesSearch(project: PortfolioProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    project.title,
    project.story,
    project.client ?? "",
    project.location ?? "",
    ...project.servicesProvided,
    ...project.deliverables,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
