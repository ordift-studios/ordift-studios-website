import type { Category, PortfolioDiscipline, PortfolioProject } from "./types";

// Which discipline-specific view owns a project's main content column. Falls
// back to null (→ GenericProjectView, today's unchanged behavior) for
// disciplines that don't have a dedicated view yet (branding,
// content-creation, talent-management, production) — deliberately not
// forcing every discipline into a view built for a different medium.
export function resolvePrimaryDiscipline(project: PortfolioProject): PortfolioDiscipline | null {
  return project.disciplines[0] ?? null;
}

// Photography sub-treatments (Portfolio redesign spec §7). Resolved from the
// project's existing categories — no schema change: a "Wedding" category
// doesn't exist in the taxonomy yet, but the moment one is added through the
// existing admin category manager (/admin/portfolio/categories), it starts
// matching here automatically, because this is a plain slug lookup, not a
// hardcoded enum tied to what happens to exist today.
export type PhotographyTreatment = "subject-led" | "sequential" | "controlled" | "flexible";

const SUBJECT_LED_SLUGS = new Set(["wedding", "portrait", "fashion"]);
const SEQUENTIAL_SLUGS = new Set(["event"]);
const CONTROLLED_SLUGS = new Set(["commercial", "product", "corporate", "automotive", "architecture"]);

export function resolvePhotographyTreatment(categories: Category[]): PhotographyTreatment {
  const slugs = new Set(categories.map((c) => c.slug));
  for (const slug of slugs) {
    if (SUBJECT_LED_SLUGS.has(slug)) return "subject-led";
  }
  for (const slug of slugs) {
    if (SEQUENTIAL_SLUGS.has(slug)) return "sequential";
  }
  for (const slug of slugs) {
    if (CONTROLLED_SLUGS.has(slug)) return "controlled";
  }
  return "flexible";
}
