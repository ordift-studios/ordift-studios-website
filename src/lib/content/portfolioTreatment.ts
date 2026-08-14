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

// One shared gallery engine (FlexiblePhotoGallery), six visual personalities
// — not six separate layout components. Rather than a fixed repeating
// sequence, the engine scores candidate groupings (full / pair / triple /
// asymmetric) at each position using these weights, biased against
// repeating the same shape too many times in a row (see
// FlexiblePhotoGallery's buildBlocks). Two projects in the same treatment
// produce different rhythms because the algorithm responds to each
// project's actual image count and orientation sequence, not a canned
// pattern.
export type PhotoGalleryRecipe = {
  gap: string;
  weights: { full: number; pair: number; triple: number; asymmetric: number };
  allowTriple: boolean;
  allowAsymmetric: boolean;
  edgeToEdge: boolean;
  alternateOffset: boolean;
  fallbackAspect: string;
};

export const PHOTO_GALLERY_RECIPES: Record<PhotographyTreatment, PhotoGalleryRecipe> = {
  // Luxury wedding journal — generous spacing, large emotional moments
  // mixed with paired portraits/details and occasional editorial triples.
  wedding: {
    gap: "gap-6 sm:gap-10",
    weights: { full: 3, pair: 4, triple: 2, asymmetric: 2 },
    allowTriple: true,
    allowAsymmetric: true,
    edgeToEdge: true,
    alternateOffset: false,
    fallbackAspect: "3/2",
  },
  // Subject-first portrait book — statement portraits, diptychs/triptychs,
  // generous negative space, asymmetric editorial placement.
  portrait: {
    gap: "gap-10 sm:gap-16",
    weights: { full: 4, pair: 3, triple: 1, asymmetric: 3 },
    allowTriple: true,
    allowAsymmetric: true,
    edgeToEdge: false,
    alternateOffset: true,
    fallbackAspect: "4/5",
  },
  // Editorial fashion spread — dramatic scale changes, full-bleed moments,
  // controlled unconventional groupings rather than loose sequences.
  fashion: {
    gap: "gap-2 sm:gap-3",
    weights: { full: 4, pair: 3, triple: 1, asymmetric: 3 },
    allowTriple: true,
    allowAsymmetric: true,
    edgeToEdge: true,
    alternateOffset: false,
    fallbackAspect: "3/4",
  },
  // Documentary energy — denser combinations of atmosphere, portraits,
  // candid moments and details.
  event: {
    gap: "gap-2 sm:gap-3",
    weights: { full: 2, pair: 3, triple: 4, asymmetric: 1 },
    allowTriple: true,
    allowAsymmetric: true,
    edgeToEdge: false,
    alternateOffset: false,
    fallbackAspect: "3/2",
  },
  // Clean campaign showcase — structured, generous whitespace, campaign
  // statements mixed with product/detail groupings; least asymmetry.
  commercial: {
    gap: "gap-8 sm:gap-14",
    weights: { full: 4, pair: 3, triple: 1, asymmetric: 1 },
    allowTriple: true,
    allowAsymmetric: false,
    edgeToEdge: false,
    alternateOffset: false,
    fallbackAspect: "16/9",
  },
  // Hero dishes, detail/close-up pairs, wider environmental shots.
  food: {
    gap: "gap-6 sm:gap-10",
    weights: { full: 3, pair: 4, triple: 1, asymmetric: 2 },
    allowTriple: true,
    allowAsymmetric: true,
    edgeToEdge: false,
    alternateOffset: false,
    fallbackAspect: "3/2",
  },
  // Default balanced treatment for photography without a matched category.
  general: {
    gap: "gap-4 sm:gap-6",
    weights: { full: 3, pair: 3, triple: 2, asymmetric: 2 },
    allowTriple: true,
    allowAsymmetric: true,
    edgeToEdge: false,
    alternateOffset: false,
    fallbackAspect: "3/2",
  },
};

// Graphic Design's own gallery personality — large statement mockups,
// paired compositions, multi-item grids and close-up/detail sections
// rather than photography's editorial rhythm. Reuses the same scored
// FlexiblePhotoGallery engine (it's discipline-agnostic), just tuned
// differently: more triples for grid-like multi-application sequences,
// asymmetric on for large-mockup + detail-shot pairings, no edge-to-edge
// bleed (design work reads better with a contained margin than full-bleed
// photography does).
export const DESIGN_GALLERY_RECIPE: PhotoGalleryRecipe = {
  gap: "gap-6 sm:gap-10",
  weights: { full: 3, pair: 3, triple: 3, asymmetric: 2 },
  allowTriple: true,
  allowAsymmetric: true,
  edgeToEdge: false,
  alternateOffset: false,
  fallbackAspect: "4/5",
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
