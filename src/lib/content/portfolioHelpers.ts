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
