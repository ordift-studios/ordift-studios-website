import { createAdminClient } from "@/lib/supabase/admin";
import { routeJurisdiction, requiresJurisdictionReview, type SupportedJurisdiction } from "./jurisdictionRouting";

// Ordift Studios Legal Suite — OS-LGL-009 Vendor & Supplier Framework
// Agreement architecture (2026-09-15).
//
// VENDOR-SPECIFIC, not a generic Legal Suite restriction — mirrors
// employeeAgreementJurisdictionGate.ts's role (one gate per agreement
// FAMILY, called only by that family's own draft-creation path) but is
// deliberately much simpler, for a real architectural reason: the
// approved OS-LGL-009 architecture makes the Framework master
// JURISDICTION-NEUTRAL by design — "Each Schedule/Work Order
// identifies the Ordift contracting entity and applicable governing
// law/jurisdiction, normally following the contracting entity." There
// is therefore no OS-LGL-007-style "jurisdiction-specific schedule
// adapting the master" concept needed here (no adapts_master_id
// lookup) — this gate only resolves and validates the Vendor
// relationship's own jurisdiction via the generic, already-reusable
// routeJurisdiction(), exactly as instructed: "reuse generic
// routeJurisdiction() underneath, no employee-specific assumptions."
//
// Source of truth: vendor_profiles.relationship_jurisdiction_id
// (migration 0123) — deliberately NOT employment_terms_history.
// employment_jurisdiction_id, which is genuinely employee-shaped and
// must never be read by any Vendor code path (kept separate per
// explicit instruction).

export type VendorAgreementJurisdictionGateState = "MISSING_JURISDICTION" | "UNSUPPORTED_JURISDICTION" | "JURISDICTION_ROUTED";

export type VendorAgreementJurisdictionGateResult =
  | { ok: true; state: "JURISDICTION_ROUTED"; jurisdiction: SupportedJurisdiction }
  | { ok: false; state: Exclude<VendorAgreementJurisdictionGateState, "JURISDICTION_ROUTED">; error: string };

// Real lookup — resolves the vendor's own relationship_jurisdiction_id
// to its plain jurisdiction name (e.g. "Ghana"), which routeJurisdiction()
// itself lower-cases/trims for matching against SUPPORTED_JURISDICTIONS.
// Returns null (never a guessed value) when no vendor_profiles row
// exists yet or no jurisdiction has been recorded.
async function resolveVendorRelationshipJurisdictionName(vendorProfileId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("vendor_profiles")
    .select("relationship_jurisdiction_id, employment_jurisdictions(name)")
    .eq("id", vendorProfileId)
    .maybeSingle();
  const jurisdiction = data?.employment_jurisdictions as unknown as { name: string } | null;
  return jurisdiction?.name ?? null;
}

// Pure decision logic apart from the lookup above — mirrors
// checkEmployeeAgreementJurisdictionSchedule()'s own "lookup, then pure
// decision" split, so the routing outcome itself is easy to reason
// about independent of I/O.
export async function checkVendorAgreementJurisdiction(vendorProfileId: string): Promise<VendorAgreementJurisdictionGateResult> {
  const jurisdictionName = await resolveVendorRelationshipJurisdictionName(vendorProfileId);
  if (!jurisdictionName) {
    return {
      ok: false,
      state: "MISSING_JURISDICTION",
      error: "This vendor's Relationship Jurisdiction has not been recorded yet — a Vendor / Supplier Framework Agreement cannot be drafted until it is set.",
    };
  }

  const routing = routeJurisdiction(jurisdictionName);
  if (requiresJurisdictionReview(routing)) {
    return {
      ok: false,
      state: "UNSUPPORTED_JURISDICTION",
      error: `This vendor's relationship jurisdiction ("${jurisdictionName}") is not yet supported for Vendor / Supplier Framework Agreements and requires review.`,
    };
  }

  return { ok: true, state: "JURISDICTION_ROUTED", jurisdiction: (routing as { outcome: "routed"; jurisdiction: SupportedJurisdiction }).jurisdiction };
}
