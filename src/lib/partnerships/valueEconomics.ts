// Ordift Partnerships & Collaborations V1 (2026-09-07) — pure value-
// economics logic and shared types only. Zero imports — safe to import
// from a Client Component, same established pattern as every pricing
// family's *_estimate.ts. "Collaboration" is a method of consideration,
// never a discount category — this module computes what Ordift is
// actually contributing net of cash and recognised partner value, and
// classifies that into an internal approval band. NONE of this is ever
// rendered as "Collaborations receive X% off" anywhere in this codebase.
//
// NCV = Normal Commercial Value (what Ordift would normally charge —
//   sourced from the existing pricing engines wherever possible, never
//   duplicated here).
// PCV = Partner Claimed Value (what the partner SAYS their contribution
//   is worth — never automatically equal to RCV).
// RCV = Ordift Recognised Collaboration Value (what Ordift formally
//   agrees to recognise, after value-class governance is applied).
// CASH = Cash consideration actually changing hands.

export type ConcessionBand =
  | "commercial_partnership" // 0-15%
  | "preferred_collaboration" // >15-30%
  | "strategic_collaboration" // >30-50%
  | "major_strategic_contribution" // >50-75%
  | "exceptional_sponsored_work" // >75-<100%
  | "fully_sponsored_pro_bono"; // exactly 100%

export type ConcessionApprovalRequirement =
  | { requiresCapability: "strategy.partnership_concession.approve_normal" }
  | { requiresCapability: "strategy.partnership_concession.approve_preferred" }
  | { requiresCapability: "strategy.partnership_concession.approve_strategic" }
  | { requiresSuperAdminOnly: true };

export type ValueEconomicsResult =
  | {
      ok: true;
      position: "concession";
      ncvUsd: number;
      pcvUsd: number | null;
      rcvUsd: number;
      cashUsd: number;
      netOrdiftContributionUsd: number;
      effectiveConcessionPercentage: number;
      band: ConcessionBand;
      approvalRequirement: ConcessionApprovalRequirement;
    }
  | {
      // CASH + RCV exceeded NCV — Ordift is not conceding anything; the
      // partner's recognised/cash contribution exceeds the value of
      // Ordift's own service. Never rendered as a negative "discount".
      ok: true;
      position: "partner_positive_value";
      ncvUsd: number;
      pcvUsd: number | null;
      rcvUsd: number;
      cashUsd: number;
      netOrdiftContributionUsd: 0;
      partnerPositiveValueUsd: number;
    }
  | { ok: false; reason: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function classifyConcessionBand(percentage: number): ConcessionBand {
  if (percentage >= 100) return "fully_sponsored_pro_bono";
  if (percentage > 75) return "exceptional_sponsored_work";
  if (percentage > 50) return "major_strategic_contribution";
  if (percentage > 30) return "strategic_collaboration";
  if (percentage > 15) return "preferred_collaboration";
  return "commercial_partnership";
}

// Bands above 50% have NO capability escape valve at all — see the
// doc comment on STRATEGY_CAPABILITIES in src/lib/organization/authority.ts.
export function resolveConcessionApprovalRequirement(band: ConcessionBand): ConcessionApprovalRequirement {
  switch (band) {
    case "commercial_partnership":
      return { requiresCapability: "strategy.partnership_concession.approve_normal" };
    case "preferred_collaboration":
      return { requiresCapability: "strategy.partnership_concession.approve_preferred" };
    case "strategic_collaboration":
      return { requiresCapability: "strategy.partnership_concession.approve_strategic" };
    case "major_strategic_contribution":
    case "exceptional_sponsored_work":
    case "fully_sponsored_pro_bono":
      return { requiresSuperAdminOnly: true };
  }
}

export function assessValueEconomics(params: { ncvUsd: number; pcvUsd?: number | null; rcvUsd: number; cashUsd: number }): ValueEconomicsResult {
  const { ncvUsd, rcvUsd, cashUsd } = params;
  const pcvUsd = params.pcvUsd ?? null;

  if (rcvUsd < 0 || cashUsd < 0) {
    return { ok: false, reason: "RCV and cash consideration must never be negative." };
  }
  if (ncvUsd <= 0) {
    // "Handle NCV <= 0 safely... Never divide by zero." — no percentage
    // is computed at all; the caller must resolve a real NCV (via a
    // pricing engine or a governed Admin-entered value) before this
    // function can classify anything.
    return { ok: false, reason: "Normal Commercial Value must be greater than zero before a concession can be assessed." };
  }

  const netOrdiftContributionUsd = roundMoney(ncvUsd - cashUsd - rcvUsd);

  if (netOrdiftContributionUsd < 0) {
    return {
      ok: true,
      position: "partner_positive_value",
      ncvUsd,
      pcvUsd,
      rcvUsd,
      cashUsd,
      netOrdiftContributionUsd: 0,
      partnerPositiveValueUsd: roundMoney(-netOrdiftContributionUsd),
    };
  }

  const effectiveConcessionPercentage = roundMoney((netOrdiftContributionUsd / ncvUsd) * 100);
  const band = classifyConcessionBand(effectiveConcessionPercentage);

  return {
    ok: true,
    position: "concession",
    ncvUsd,
    pcvUsd,
    rcvUsd,
    cashUsd,
    netOrdiftContributionUsd,
    effectiveConcessionPercentage,
    band,
    approvalRequirement: resolveConcessionApprovalRequirement(band),
  };
}
