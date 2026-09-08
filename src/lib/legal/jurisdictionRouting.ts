// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase E, Part 16
// (2026-09-08). Pure, zero-import jurisdiction routing.
//
// Primary principle: PROJECT / BUSINESS ENGAGEMENT JURISDICTION, never
// customer nationality or IP address. This module deliberately has no
// function that accepts a nationality, country-of-residence, or IP
// address at all — the caller must always supply the actual engagement
// jurisdiction (e.g. from the project/production-market data already
// established by the Pricing/Production engines), and this module only
// validates/classifies it. There is no "infer jurisdiction" function
// here by design.

export const SUPPORTED_JURISDICTIONS = ["ghana", "qatar", "united_kingdom", "international_other"] as const;
export type SupportedJurisdiction = (typeof SUPPORTED_JURISDICTIONS)[number];

export type JurisdictionRoutingResult =
  | { outcome: "routed"; jurisdiction: SupportedJurisdiction }
  | { outcome: "review_required"; reason: string };

// engagementJurisdiction: the caller's own determination of where the
// PROJECT/BUSINESS ENGAGEMENT actually sits (never a person's
// nationality). isComplexOrConflicting: an explicit caller-supplied
// flag for the "transaction is complex, conflicting, or unsupported"
// case (Part 16) — this module never guesses complexity on its own;
// that judgment belongs to whatever real business/project data the
// caller has.
export function routeJurisdiction(
  engagementJurisdiction: string | null,
  isComplexOrConflicting = false
): JurisdictionRoutingResult {
  if (isComplexOrConflicting) {
    return { outcome: "review_required", reason: "Transaction flagged as complex or conflicting by the caller." };
  }
  if (!engagementJurisdiction) {
    return { outcome: "review_required", reason: "No engagement jurisdiction was supplied." };
  }
  const normalized = engagementJurisdiction.trim().toLowerCase();
  if ((SUPPORTED_JURISDICTIONS as readonly string[]).includes(normalized)) {
    return { outcome: "routed", jurisdiction: normalized as SupportedJurisdiction };
  }
  return { outcome: "review_required", reason: `Unsupported jurisdiction value: "${engagementJurisdiction}".` };
}

export function requiresJurisdictionReview(result: JurisdictionRoutingResult): boolean {
  return result.outcome === "review_required";
}
