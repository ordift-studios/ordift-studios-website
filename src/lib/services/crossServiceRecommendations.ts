// Ordift Cross-Service Recommendation Foundation (2026-09-07) — a
// small, reusable, data-driven registry so any pricing family or
// department can surface contextual "complete your project with X"
// recommendations without hardcoded page-specific conditionals
// scattered through the codebase. Pure, zero-import: safe from a
// Client Component and a Server Component alike.
//
// SCOPE (deliberate, per the approved architecture):
//   - Pricing engines are never merged. A recommendation only ever
//     links to another service's own existing configuration/pricing
//     experience — it never computes or displays a second price inline
//     and never feeds data back into the originating calculator.
//   - Recommendations are contextual, optional, dismissible, and
//     restrained by design: getRecommendationsFor() caps what it
//     returns (see MAX_RECOMMENDATIONS below) so a consuming page can
//     never accidentally render a wall of upsells.
//   - This registry has entries for graphic_design, content_creation,
//     branding, and production_services (all added 2026-09-07, across
//     four separate authorized phases). Every other family is still
//     "may later recommend" per its own authorization; adding entries
//     for those later is exactly "register a new array entry", never
//     new page-specific logic.
//
// CROSS-SERVICE DISCOUNTS — DOCUMENTED EXTENSION POINT, NOT BUILT:
//   `discountEligible` below is reserved for a future phase and is
//   never read by anything yet. If Ordift later activates a bundle
//   incentive for a given (fromFamily, recommendedSlug) pair, the
//   clean extension is to REUSE the existing discount_codes /
//   discount_redemptions tables (src/lib/pricing/discounts.ts) rather
//   than inventing a parallel system: e.g. a discount_codes row scoped
//   by a nullable `eligible_primary_service` / `eligible_complementary_
//   service` column pair (or, if a code must apply to more than one
//   named pair, a small join table mapping a recommendation key to an
//   existing discount_codes.id). Either shape is additive, versioned
//   the same way every other rate table in this codebase already is,
//   and requires zero new authorization/audit logic since
//   FINANCE_CAPABILITIES.pricingAdminister already governs
//   discount_codes writes. None of this is implemented now — building
//   it before a real bundle incentive is approved would be
//   over-engineering a feature with no current business rule behind
//   it, and risks inventing a discount percentage nobody approved.

export type CrossServiceFamily =
  | "personal"
  | "corporate"
  | "wedding_event"
  | "commercial"
  | "graphic_design"
  | "branding"
  | "content_creation"
  | "talent_management"
  | "photography"
  | "production_services"
  | "partnerships";

export type CrossServiceRecommendation = {
  fromFamily: CrossServiceFamily;
  /** Destination: either a pricing family (`/pricing?family=X`) or a department slug (`/services/X`) when no pricing engine exists yet for it. */
  destination: { kind: "pricing_family"; family: CrossServiceFamily } | { kind: "department"; slug: string };
  label: string;
  description: string;
  /** Reserved for a future Admin-controlled bundle incentive — see the module doc comment. Never read anywhere yet. */
  discountEligible?: boolean;
};

const MAX_RECOMMENDATIONS = 3;

const REGISTRY: CrossServiceRecommendation[] = [
  {
    fromFamily: "graphic_design",
    destination: { kind: "pricing_family", family: "personal" },
    label: "Complete your project with Photography",
    description: "Original photography for campaign artwork, social content, or print materials.",
  },
  {
    fromFamily: "graphic_design",
    destination: { kind: "pricing_family", family: "commercial" },
    label: "Need commercial usage licensing?",
    description: "If this design uses photography or film for paid advertising, Commercial / Advertising covers usage rights.",
  },
  {
    fromFamily: "graphic_design",
    destination: { kind: "department", slug: "content-creation" },
    label: "Ongoing content, not just one design?",
    description: "Content Creation covers recurring, platform-ready design and short-form video.",
  },
  {
    fromFamily: "graphic_design",
    destination: { kind: "department", slug: "branding" },
    label: "Building a full brand system?",
    description: "Branding & Creative Strategy covers identity systems and creative direction beyond a single deliverable.",
  },
  {
    fromFamily: "graphic_design",
    destination: { kind: "department", slug: "production" },
    label: "Need production support?",
    description: "Production Services can coordinate location, casting, and production logistics around this project.",
  },

  // Content Creation V1 (2026-09-07) — order matters: the first
  // MAX_RECOMMENDATIONS entries below are what actually renders.
  {
    fromFamily: "content_creation",
    destination: { kind: "pricing_family", family: "personal" },
    label: "Need traditional photography too?",
    description: "Personal Portrait covers formal portraiture and headshots beyond social-first content.",
  },
  {
    fromFamily: "content_creation",
    destination: { kind: "department", slug: "videography" },
    label: "Planning something longer-form?",
    description: "Videography covers narrative film, brand film, documentary and other long-form production beyond short-form social content.",
  },
  {
    fromFamily: "content_creation",
    destination: { kind: "pricing_family", family: "commercial" },
    label: "Need paid advertising usage rights?",
    description: "If this content will run as paid advertising, Commercial / Advertising covers the usage licensing.",
  },
  {
    fromFamily: "content_creation",
    destination: { kind: "pricing_family", family: "graphic_design" },
    label: "Need matching static design?",
    description: "Graphic Design covers flyers, social graphics, presentations and print alongside your content production.",
  },
  {
    fromFamily: "content_creation",
    destination: { kind: "department", slug: "branding" },
    label: "Building a full brand system?",
    description: "Branding & Creative Strategy covers identity systems and creative direction beyond ongoing content.",
  },
  {
    fromFamily: "content_creation",
    destination: { kind: "department", slug: "talent-management" },
    label: "Need on-camera talent?",
    description: "Talent Management can help source presenters, models or creators for your content.",
  },
  {
    fromFamily: "content_creation",
    destination: { kind: "department", slug: "production" },
    label: "Need production support?",
    description: "Production Services can coordinate location, casting, and production logistics around this project.",
  },

  // Branding & Creative Strategy V1 (2026-09-07) — order matters: the
  // first MAX_RECOMMENDATIONS entries below are what actually renders.
  {
    fromFamily: "branding",
    destination: { kind: "pricing_family", family: "graphic_design" },
    label: "Need collateral built from this identity?",
    description: "Graphic Design covers business cards, brochures, social templates, and other applications once the identity is approved.",
  },
  {
    fromFamily: "branding",
    destination: { kind: "pricing_family", family: "personal" },
    label: "Need original photography for the brand?",
    description: "Photography covers imagery to bring the new identity to life.",
  },
  {
    fromFamily: "branding",
    destination: { kind: "department", slug: "content-creation" },
    label: "Need ongoing content in the new identity?",
    description: "Content Creation covers recurring, platform-ready design and short-form video once the identity is set.",
  },
  {
    fromFamily: "branding",
    destination: { kind: "pricing_family", family: "commercial" },
    label: "Launching with a campaign?",
    description: "Commercial / Advertising covers campaign production and paid-usage licensing.",
  },
  {
    fromFamily: "branding",
    destination: { kind: "department", slug: "production" },
    label: "Need production support?",
    description: "Production Services can coordinate location, casting, and production logistics for a brand launch.",
  },
  {
    fromFamily: "branding",
    destination: { kind: "department", slug: "talent-management" },
    label: "Need on-camera talent for launch content?",
    description: "Talent Management can help source presenters, models or creators for brand launch content.",
  },
  {
    fromFamily: "branding",
    destination: { kind: "department", slug: "videography" },
    label: "Need a brand film?",
    description: "Videography covers brand film and other long-form production to introduce the new identity.",
  },

  // Production Services V1 (2026-09-07) — order matters: the first
  // MAX_RECOMMENDATIONS entries below are what actually renders.
  {
    fromFamily: "production_services",
    destination: { kind: "department", slug: "photography" },
    label: "Need the photography itself?",
    description: "Photography covers the creative capture this production supports.",
  },
  {
    fromFamily: "production_services",
    destination: { kind: "department", slug: "videography" },
    label: "Need the film itself?",
    description: "Videography covers the creative capture this production supports.",
  },
  {
    fromFamily: "production_services",
    destination: { kind: "pricing_family", family: "commercial" },
    label: "Is this for a paid advertising campaign?",
    description: "Commercial / Advertising covers campaign production and usage licensing.",
  },
  {
    fromFamily: "production_services",
    destination: { kind: "department", slug: "content-creation" },
    label: "Is this for social/content production?",
    description: "Content Creation covers social-first video and photography.",
  },
  {
    fromFamily: "production_services",
    destination: { kind: "pricing_family", family: "graphic_design" },
    label: "Need supporting design work?",
    description: "Graphic Design covers flyers, social graphics, and print alongside your production.",
  },
  {
    fromFamily: "production_services",
    destination: { kind: "pricing_family", family: "branding" },
    label: "Is this part of a new brand launch?",
    description: "Branding & Creative Strategy covers identity and creative direction behind a launch.",
  },
  {
    fromFamily: "production_services",
    destination: { kind: "department", slug: "talent-management" },
    label: "Need talent for this production?",
    description: "Talent Management can help source presenters, models or creators.",
  },

  // Partnerships & Collaborations V1 (2026-09-07) — a partnership
  // opportunity may reference/recommend an existing service family to
  // establish scope or Normal Commercial Value; it never automatically
  // discounts that family or duplicates its calculator. Order matters:
  // the first MAX_RECOMMENDATIONS entries below are what actually
  // renders.
  {
    fromFamily: "partnerships",
    destination: { kind: "pricing_family", family: "commercial" },
    label: "Does this need commercial usage licensing?",
    description: "Commercial / Advertising covers paid-usage licensing that a collaboration's default rights don't include.",
  },
  {
    fromFamily: "partnerships",
    destination: { kind: "department", slug: "content-creation" },
    label: "Is this ongoing content, not a one-off?",
    description: "Content Creation covers recurring, platform-ready design and short-form video.",
  },
  {
    fromFamily: "partnerships",
    destination: { kind: "department", slug: "production" },
    label: "Does this need crew, equipment, or location coordination?",
    description: "Production Operations coordinates the resources this collaboration requires.",
  },
  {
    fromFamily: "partnerships",
    destination: { kind: "pricing_family", family: "graphic_design" },
    label: "Need design work as part of this collaboration?",
    description: "Graphic Design covers flyers, social graphics, and print for the partnership.",
  },
  {
    fromFamily: "partnerships",
    destination: { kind: "pricing_family", family: "branding" },
    label: "Is this part of a brand identity project?",
    description: "Branding & Creative Strategy covers identity systems and creative direction.",
  },
  {
    fromFamily: "partnerships",
    destination: { kind: "department", slug: "talent-management" },
    label: "Does this involve a creator or talent?",
    description: "Talent Management can help source or coordinate presenters, models or creators.",
  },
];

export function getRecommendationsFor(family: CrossServiceFamily): CrossServiceRecommendation[] {
  return REGISTRY.filter((r) => r.fromFamily === family).slice(0, MAX_RECOMMENDATIONS);
}

export function recommendationHref(recommendation: CrossServiceRecommendation): string {
  return recommendation.destination.kind === "pricing_family"
    ? `/pricing?family=${recommendation.destination.family}`
    : `/services/${recommendation.destination.slug}`;
}
