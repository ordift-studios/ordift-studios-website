import type { Category, PortfolioDiscipline, PortfolioProject } from "./types";

// Which discipline-specific view owns a project's main content column. Falls
// back to null (→ GenericProjectView, today's unchanged behavior) for
// disciplines that don't have a dedicated view yet (branding,
// content-creation, talent-management, production) — deliberately not
// forcing every discipline into a view built for a different medium.
export function resolvePrimaryDiscipline(project: PortfolioProject): PortfolioDiscipline | null {
  return project.disciplines[0] ?? null;
}

// Photography sub-treatments (Portfolio redesign spec §7, refined after
// visual review 2026-08-12: image-first, minimal text, no case-study feel).
// Resolved from the project's existing categories — no schema change: a
// "Wedding" category doesn't exist in the taxonomy yet, but the moment one
// is added through the existing admin category manager
// (/admin/portfolio/categories), it starts matching here automatically,
// because this is a plain slug lookup, not a hardcoded enum tied to what
// happens to exist today.
export type PhotographyTreatment =
  | "wedding"
  | "portrait"
  | "fashion"
  | "event"
  | "commercial"
  | "food"
  | "general";

const TREATMENT_SLUGS: Record<Exclude<PhotographyTreatment, "general">, Set<string>> = {
  wedding: new Set(["wedding"]),
  portrait: new Set(["portrait"]),
  fashion: new Set(["fashion"]),
  event: new Set(["event"]),
  commercial: new Set(["commercial", "product", "corporate", "automotive"]),
  food: new Set(["food"]),
};

export function resolvePhotographyTreatment(categories: Category[]): PhotographyTreatment {
  const slugs = categories.map((c) => c.slug);
  for (const [treatment, set] of Object.entries(TREATMENT_SLUGS) as [
    Exclude<PhotographyTreatment, "general">,
    Set<string>,
  ][]) {
    if (slugs.some((slug) => set.has(slug))) return treatment;
  }
  return "general";
}

// One shared gallery engine (FlexiblePhotoGallery), six distinct visual
// rhythms driven by these recipes — not six separate layout components.
// Each recipe controls: spacing (gap), whether three portrait images can
// group into a sequence, whether pairs are preferred over triples, whether
// full-width blocks bleed to the viewport edge or sit inset, the crop ratio
// used per block type, and (Portrait only) whether full blocks alternate
// left/right inset placement for asymmetric composition.
export type PhotoGalleryRecipe = {
  gap: string;
  allowTriple: boolean;
  preferDiptych: boolean;
  edgeToEdge: boolean;
  fullAspect: string;
  pairAspect: string;
  tripleAspect: string;
  alternateOffset: boolean;
};

export const PHOTO_GALLERY_RECIPES: Record<PhotographyTreatment, PhotoGalleryRecipe> = {
  // Luxury wedding journal — generous editorial spacing, full-bleed
  // establishing shots alternating with paired portraits, an occasional
  // triple for a sequence of small moments.
  wedding: {
    gap: "gap-6 sm:gap-10",
    allowTriple: true,
    preferDiptych: false,
    edgeToEdge: true,
    fullAspect: "3/2",
    pairAspect: "3/4",
    tripleAspect: "4/5",
    alternateOffset: false,
  },
  // Subject-first portrait book — oversized single frames and diptychs
  // only, generous negative space, asymmetric left/right placement rather
  // than a centered grid.
  portrait: {
    gap: "gap-10 sm:gap-16",
    allowTriple: false,
    preferDiptych: true,
    edgeToEdge: false,
    fullAspect: "4/5",
    pairAspect: "4/5",
    tripleAspect: "4/5",
    alternateOffset: true,
  },
  // Editorial fashion spread — dramatic scale, tight controlled spacing,
  // full-height vertical frames and diptych pairings rather than loose
  // sequences.
  fashion: {
    gap: "gap-2 sm:gap-3",
    allowTriple: false,
    preferDiptych: true,
    edgeToEdge: true,
    fullAspect: "3/4",
    pairAspect: "3/4",
    tripleAspect: "3/4",
    alternateOffset: false,
  },
  // Documentary energy — denser sequencing, triples allowed and preferred
  // over pairs, tighter spacing than Wedding/Portrait.
  event: {
    gap: "gap-2 sm:gap-3",
    allowTriple: true,
    preferDiptych: false,
    edgeToEdge: false,
    fullAspect: "3/2",
    pairAspect: "4/5",
    tripleAspect: "4/5",
    alternateOffset: false,
  },
  // Clean campaign showcase — no triples, generous whitespace, larger
  // single "hero" moments and simple pairs only.
  commercial: {
    gap: "gap-8 sm:gap-14",
    allowTriple: false,
    preferDiptych: false,
    edgeToEdge: false,
    fullAspect: "16/9",
    pairAspect: "4/5",
    tripleAspect: "4/5",
    alternateOffset: false,
  },
  // Appetizing wide heroes alternating with tight detail-shot pairs.
  food: {
    gap: "gap-6 sm:gap-10",
    allowTriple: false,
    preferDiptych: true,
    edgeToEdge: false,
    fullAspect: "3/2",
    pairAspect: "1/1",
    tripleAspect: "1/1",
    alternateOffset: false,
  },
  // Default flexible treatment for photography without a matched category.
  general: {
    gap: "gap-4 sm:gap-6",
    allowTriple: true,
    preferDiptych: false,
    edgeToEdge: false,
    fullAspect: "3/2",
    pairAspect: "4/5",
    tripleAspect: "4/5",
    alternateOffset: false,
  },
};

export const PHOTOGRAPHY_TREATMENT_LABEL: Record<PhotographyTreatment, string> = {
  wedding: "Wedding",
  portrait: "Portrait",
  fashion: "Fashion",
  event: "Event",
  commercial: "Commercial",
  food: "Food",
  general: "Photography",
};
