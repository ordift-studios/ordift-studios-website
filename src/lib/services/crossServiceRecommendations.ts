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
//   - This registry currently only has entries for graphic_design (the
//     family being implemented this phase), per the explicitly approved
//     examples. Branding & Creative Strategy, Talent Management,
//     Photography, and Weddings/Events are documented above each as
//     "may later recommend" in the authorization — entries for those
//     are intentionally NOT added yet; adding them later is exactly
//     "register a new array entry", never new page-specific logic.
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
  | "production_services";

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
];

export function getRecommendationsFor(family: CrossServiceFamily): CrossServiceRecommendation[] {
  return REGISTRY.filter((r) => r.fromFamily === family).slice(0, MAX_RECOMMENDATIONS);
}

export function recommendationHref(recommendation: CrossServiceRecommendation): string {
  return recommendation.destination.kind === "pricing_family"
    ? `/pricing?family=${recommendation.destination.family}`
    : `/services/${recommendation.destination.slug}`;
}
