// Ordift Partnerships & Collaborations V1 (2026-09-07) — usage rights
// and exclusivity governance. Pure, zero-import. Deliberately reuses
// commercialEstimate.ts's own usage/territory vocabulary (imported as
// types only — zero runtime coupling) rather than inventing a second,
// contradictory licensing taxonomy: when a collaboration's requested
// usage crosses into paid/broad commercial territory, this module
// flags that it must route into the existing Commercial licensing
// architecture (a cross-service recommendation), never computes a
// price itself.

import type { CommercialUsageFactorSlug, CommercialTerritoryFactorSlug } from "@/lib/pricing/commercialEstimate";

export type { CommercialUsageFactorSlug, CommercialTerritoryFactorSlug };

export type PartnershipUsageRights = {
  organicSocial: boolean;
  brandOwnedSocial: boolean;
  website: boolean;
  email: boolean;
  pr: boolean;
  paidSocial: boolean;
  whitelisting: boolean;
  print: boolean;
  ooh: boolean;
  broadcast: boolean;
  thirdPartySublicensing: boolean;
  editingAdaptation: boolean;
  territory: CommercialTerritoryFactorSlug | "unspecified";
  startDate: string | null;
  endDate: string | null; // null end date + any granted right = perpetual, which is never the default
};

// "Default collaboration position: NO perpetual commercial rights.
// Perpetual / all-media / worldwide buyout: Custom Commercial Review +
// Founder/Super Admin approval." — a null endDate on ANY granted right
// is perpetual by definition.
export function isPerpetualUsage(rights: PartnershipUsageRights): boolean {
  const anyRightGranted = rights.organicSocial || rights.brandOwnedSocial || rights.website || rights.email || rights.pr || rights.paidSocial || rights.whitelisting || rights.print || rights.ooh || rights.broadcast || rights.thirdPartySublicensing;
  return anyRightGranted && rights.endDate === null;
}

export function isWorldwideAllMediaBuyout(rights: PartnershipUsageRights): boolean {
  const allMedia = rights.paidSocial && rights.whitelisting && rights.print && rights.ooh && rights.broadcast;
  return allMedia && rights.territory === "worldwide";
}

// Any paid/broad-commercial usage requires routing into the existing
// Commercial / Advertising licensing engine — never a second price
// computed here.
export function requiresCommercialLicensingRouting(rights: PartnershipUsageRights): boolean {
  return rights.paidSocial || rights.whitelisting || rights.ooh || rights.broadcast || rights.thirdPartySublicensing || isPerpetualUsage(rights) || isWorldwideAllMediaBuyout(rights);
}

export type ExclusivityReviewTier = "normal_commercial" | "commercial_review" | "executive_founder_review" | "founder_super_admin_only" | "prohibited_open_ended";

// durationDays === null means open-ended — PROHIBITED, never
// classified into any approval tier at all.
export function classifyExclusivity(durationDays: number | null, isBroadIndustryScope: boolean): ExclusivityReviewTier {
  if (durationDays === null) return "prohibited_open_ended";
  if (isBroadIndustryScope || durationDays > 180) return "founder_super_admin_only"; // >6 months OR broad-industry
  if (durationDays > 90) return "executive_founder_review";
  if (durationDays > 30) return "commercial_review";
  return "normal_commercial"; // <=30 days, narrow category
}

// "Do not automatically infer exclusivity from collaboration status."
// A collaboration/agreement with no exclusivityDurationDays field set
// at all simply has none — this function only ever classifies an
// explicit, present value; callers must never default a missing field
// to any duration.
