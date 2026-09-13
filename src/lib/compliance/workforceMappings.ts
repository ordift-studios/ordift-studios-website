import {
  WORKFORCE_RELATIONSHIPS,
  WORKFORCE_JURISDICTIONS,
  type WorkforceRelationship,
  type WorkforceJurisdiction,
} from "./requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B1 (2026-09-14) — PURE
// WORKFORCE VOCABULARY MAPPING FOUNDATION ONLY.
//
// This module has no database dependency and no caller anywhere in the
// codebase yet. It is NOT wired into onboardingRequirements.ts,
// employeeAgreements.ts, or any other live workflow — that remains a
// separate, later, separately authorized phase (Phase B2). It exists so
// that a future integration has a single, deliberate, fail-closed
// translation from the codebase's two existing free-form lookup
// concepts (engagement_types.slug, employment_jurisdictions' raw
// representation) into Phase A's closed WorkforceRelationship/
// WorkforceJurisdiction vocabularies — instead of each future caller
// inventing its own ad hoc guess.
//
// FAIL-CLOSED CONTRACT: every function here returns `null` for any
// input it does not deliberately recognize — never a best-guess
// default, and never EMPLOYEE or GH specifically (the two values a
// careless fallback would most plausibly reach for). A `null` result
// means "this caller must not proceed as if a relationship/jurisdiction
// were known" — it is the caller's job to treat that as its own
// REVIEW_REQUIRED-shaped outcome, not this module's.
//
// JURISDICTION VOCABULARY BOUNDARY (do not cross without a deliberate
// Phase B2 decision): src/lib/legal/jurisdictionRouting.ts defines a
// SEPARATE, INCOMPATIBLE jurisdiction vocabulary —
// SupportedJurisdiction = "ghana" | "qatar" | "united_kingdom" |
// "international_other" (lowercase, 4 values, no Germany/EU or US
// entries at all) — used today by createDraftAgreement() or via
// routeJurisdiction(). This module's WorkforceJurisdiction output
// (GH | QA | GB | DE_EU | US | OTHER) must NEVER be passed directly
// into routeJurisdiction() or anywhere expecting a SupportedJurisdiction
// value: "GB" is not "united_kingdom", and DE_EU/US have no counterpart
// there at all. Reconciling (or deliberately keeping separate) these two
// vocabularies is an explicit Phase B2 decision — this module makes no
// attempt at it and jurisdictionRouting.ts is untouched.

// ============================================================
// Engagement type -> WorkforceRelationship
// ============================================================

/** Every engagement_types.slug value seeded in this repository as of
 * Phase B1 (migrations 0009, 0065), reviewed individually below. This
 * list exists so a future new engagement_types row is easy to notice as
 * NOT yet reviewed (it will map to null via the lookup below until a
 * human deliberately adds it here) rather than silently falling through
 * unnoticed. */
export const KNOWN_ENGAGEMENT_TYPE_SLUGS = [
  "full_time",
  "part_time",
  "fixed_term",
  "freelancer",
  "independent_contractor",
  "vendor_supplier",
  "instructor",
  "model_talent",
  "collaborator_partner",
  "intern",
  "volunteer",
  "project_based",
] as const;

/** Deliberate canonical mapping — reviewed individually, not inferred:
 * - full_time / part_time / fixed_term: all three are Ordift employment
 *   relationships (resolveOnboardingPipeline() already treats exactly
 *   these three as the "employee" pipeline) -> EMPLOYEE.
 * - freelancer / independent_contractor: services rendered for payment,
 *   not employment -> CONTRACTOR.
 * - vendor_supplier: a business supply relationship -> VENDOR.
 * - instructor: a workshop/training facilitation engagement, distinct
 *   from a generic services contractor -> INSTRUCTOR.
 * - model_talent: -> MODEL_TALENT (unchanged from Phase A1).
 * - collaborator_partner: a business partnership/collaboration
 *   relationship, not a services-for-payment one -> COLLABORATOR_PARTNER.
 *
 * Deliberately ABSENT (see KNOWN_ENGAGEMENT_TYPE_SLUGS above; each maps
 * to null via mapEngagementTypeSlugToWorkforceRelationship, on purpose,
 * not by oversight):
 * - intern: legal classification varies by jurisdiction and by whether
 *   the internship is paid — genuinely ambiguous without more facts;
 *   never assumed to be EMPLOYEE.
 * - volunteer: unpaid, and does not fit any of EMPLOYEE/CONTRACTOR/
 *   VENDOR/MODEL_TALENT/INSTRUCTOR/COLLABORATOR_PARTNER — inventing a
 *   VOLUNTEER relationship value was not authorized for Phase B1.
 * - project_based: describes engagement STRUCTURE (duration/scope), not
 *   legal relationship — a project-based engagement could itself be
 *   EMPLOYEE or CONTRACTOR depending on facts this slug alone doesn't
 *   carry.
 */
export const ENGAGEMENT_TYPE_TO_WORKFORCE_RELATIONSHIP: Readonly<Record<string, WorkforceRelationship>> = {
  full_time: "EMPLOYEE",
  part_time: "EMPLOYEE",
  fixed_term: "EMPLOYEE",
  freelancer: "CONTRACTOR",
  independent_contractor: "CONTRACTOR",
  vendor_supplier: "VENDOR",
  instructor: "INSTRUCTOR",
  model_talent: "MODEL_TALENT",
  collaborator_partner: "COLLABORATOR_PARTNER",
};

/** Pure. Trims/lowercases the input only (engagement_types.slug is a
 * controlled, admin-managed lowercase-snake-case value by convention —
 * this is defense-in-depth normalization, not synonym-guessing).
 * Returns null for anything not explicitly reviewed above — including
 * intern/volunteer/project_based, and any slug added to engagement_types
 * after Phase B1 that hasn't yet been reviewed and added here. Never
 * defaults to EMPLOYEE or any other WorkforceRelationship. */
export function mapEngagementTypeSlugToWorkforceRelationship(slug: string | null | undefined): WorkforceRelationship | null {
  if (typeof slug !== "string") return null;
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  return ENGAGEMENT_TYPE_TO_WORKFORCE_RELATIONSHIP[normalized] ?? null;
}

// ============================================================
// employment_jurisdictions -> WorkforceJurisdiction
// ============================================================

/** Deliberately recognized representations only — two sources, both
 * real, neither invented:
 * (1) the Phase A canonical codes themselves (GH, QA, GB, DE_EU, US,
 *     OTHER), and
 * (2) the exact jurisdiction section labels already used in the
 *     Founder-approved OS-LGL-007 master text's Schedule C
 *     ("JURISDICTION ROUTING & MANDATORY-LAW SAFEGUARDS") —
 *     src/lib/legal/documents/os-lgl-007-employee-employment-agreement.ts:
 *     "Ghana", "Qatar", "United Kingdom", "Germany / European Union",
 *     "United States", "International / Other".
 *
 * Deliberately NOT recognized (a Phase B2 decision, not an oversight):
 * "UK", "USA", "Germany" alone, "EU" alone, or any other abbreviation/
 * synonym not anchored in one of the two sources above — adding these
 * would be exactly the "broad guessing" this mapping must avoid.
 * employment_jurisdictions has zero rows in Production today (verified
 * 2026-09-13), so no real-world input has been lost by keeping this
 * list narrow; Phase B2 can extend it deliberately once real rows and
 * real admin-entry conventions exist. */
const JURISDICTION_ALIASES: ReadonlyMap<string, WorkforceJurisdiction> = new Map([
  ["gh", "GH"],
  ["ghana", "GH"],
  ["qa", "QA"],
  ["qatar", "QA"],
  ["gb", "GB"],
  ["united kingdom", "GB"],
  ["de_eu", "DE_EU"],
  ["germany / european union", "DE_EU"],
  ["us", "US"],
  ["united states", "US"],
  ["other", "OTHER"],
  ["international / other", "OTHER"],
]);

/** Pure. Tolerates surrounding whitespace and case only — not a broad
 * synonym guesser. Returns null for missing, empty, malformed, or
 * unrecognized input (e.g. "France", "uk", "de-eu", "N/A") — including
 * inputs that are plausible-looking but not on the deliberately
 * recognized list above. Never defaults to GH, OTHER, or any other
 * WorkforceJurisdiction. A recognized "OTHER"/"International / Other"
 * value IS a genuine, deliberate WorkforceJurisdiction result (distinct
 * from an unrecognized value, which returns null) — this mirrors
 * requirementClassification.ts's own "OTHER is an intentional configured
 * value, never a catch-all for unknown input" principle exactly. */
export function mapEmploymentJurisdictionToWorkforceJurisdiction(raw: string | null | undefined): WorkforceJurisdiction | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  return JURISDICTION_ALIASES.get(normalized) ?? null;
}

// Re-exported for convenience so a Phase B2 caller can validate its own
// assumptions against the current vocabularies without a second import.
export { WORKFORCE_RELATIONSHIPS, WORKFORCE_JURISDICTIONS };
