import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkforceJurisdiction } from "@/lib/compliance/requirementClassification";

// Ordift Studios Compliance/COMP-SYS-1, Phase B4 Step 2 (2026-09-14) —
// leave-type catalog reads. The catalog itself is seeded, real,
// verbatim-sourced data (migration 0087) — this file only reads it and
// provides the one piece of genuine application LOGIC the sick-leave
// tier structure requires: given how many sick days a person has
// already used this year and how many more they're requesting, which
// of the four approved tiers (OS-HR-GH-002 5.1) do those additional
// days fall into. This is arithmetic over already-approved numbers, not
// an invented rule.

export interface LeaveType {
  id: string;
  slug: string;
  name: string;
  jurisdiction: WorkforceJurisdiction;
  paid: boolean;
  requiresCertificate: boolean;
  annualEntitlementDays: number | null;
  perLeaveYearCapDays: number | null;
  tierStructure: SickLeaveTier[] | null;
  entitlementDescription: string;
  sourceDocumentReference: string;
  active: boolean;
}

export interface SickLeaveTier {
  tier: number;
  maxDays: number;
  payPercent: number;
  certificateRequired: boolean;
}

function mapRow(r: {
  id: string;
  slug: string;
  name: string;
  jurisdiction: string;
  paid: boolean;
  requires_certificate: boolean;
  annual_entitlement_days: number | null;
  per_leave_year_cap_days: number | null;
  tier_structure: SickLeaveTier[] | null;
  entitlement_description: string;
  source_document_reference: string;
  active: boolean;
}): LeaveType {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    jurisdiction: r.jurisdiction as WorkforceJurisdiction,
    paid: r.paid,
    requiresCertificate: r.requires_certificate,
    annualEntitlementDays: r.annual_entitlement_days,
    perLeaveYearCapDays: r.per_leave_year_cap_days,
    tierStructure: r.tier_structure,
    entitlementDescription: r.entitlement_description,
    sourceDocumentReference: r.source_document_reference,
    active: r.active,
  };
}

const SELECT =
  "id, slug, name, jurisdiction, paid, requires_certificate, annual_entitlement_days, per_leave_year_cap_days, tier_structure, entitlement_description, source_document_reference, active";

export async function listLeaveTypes(jurisdiction: WorkforceJurisdiction): Promise<LeaveType[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("leave_types").select(SELECT).eq("jurisdiction", jurisdiction).eq("active", true).order("slug");
  if (error) {
    console.error("[organization] failed to load leave_types", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function getLeaveTypeBySlug(slug: string, jurisdiction: WorkforceJurisdiction): Promise<LeaveType | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("leave_types").select(SELECT).eq("slug", slug).eq("jurisdiction", jurisdiction).maybeSingle();
  return data ? mapRow(data) : null;
}

export interface SickLeaveTierBreakdownEntry {
  tier: number;
  days: number;
  payPercent: number;
  certificateRequired: boolean;
}

// Pure. Given the approved tier structure, how many sick days this
// profile has already used this leave year (cumulativeDaysUsed), and
// how many additional days are being requested (daysRequested), splits
// the REQUESTED days across the tiers they actually fall into. Never
// invents a tier or a pay percentage — every number comes from
// `tiers` (itself sourced verbatim from OS-HR-GH-002 5.1 via the
// leave_types catalog).
export function resolveSickLeaveTierBreakdown(
  tiers: readonly SickLeaveTier[],
  cumulativeDaysUsed: number,
  daysRequested: number
): SickLeaveTierBreakdownEntry[] {
  const sortedTiers = [...tiers].sort((a, b) => a.tier - b.tier);
  const breakdown: SickLeaveTierBreakdownEntry[] = [];

  let tierFloor = 0;
  let daysAlreadyAllocated = 0;
  for (const tier of sortedTiers) {
    const tierCeiling = tierFloor + tier.maxDays;
    // How much of [cumulativeDaysUsed, cumulativeDaysUsed + daysRequested)
    // overlaps this tier's [tierFloor, tierCeiling) range.
    const rangeStart = Math.max(cumulativeDaysUsed + daysAlreadyAllocated, tierFloor);
    const rangeEnd = Math.min(cumulativeDaysUsed + daysRequested, tierCeiling);
    const daysInThisTier = Math.max(0, rangeEnd - rangeStart);
    if (daysInThisTier > 0) {
      breakdown.push({ tier: tier.tier, days: daysInThisTier, payPercent: tier.payPercent, certificateRequired: tier.certificateRequired });
      daysAlreadyAllocated += daysInThisTier;
    }
    tierFloor = tierCeiling;
  }
  return breakdown;
}
